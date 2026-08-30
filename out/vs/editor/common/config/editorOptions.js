import * as arrays from "../../../base/common/arrays.js";
import * as objects from "../../../base/common/objects.js";
import * as platform from "../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../base/common/scrollable.js";
import { Constants } from "../../../base/common/uint.js";
import { EDITOR_FONT_DEFAULTS, FONT_VARIATION_OFF, FONT_VARIATION_TRANSLATE, FontInfo } from "./fontInfo.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { USUAL_WORD_SEPARATORS } from "../core/wordHelper.js";
import * as nls from "../../../nls.js";
import { AccessibilitySupport } from "../../../platform/accessibility/common/accessibility.js";
var EditorAutoIndentStrategy = /* @__PURE__ */ ((EditorAutoIndentStrategy2) => {
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["None"] = 0] = "None";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Keep"] = 1] = "Keep";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Brackets"] = 2] = "Brackets";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Advanced"] = 3] = "Advanced";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Full"] = 4] = "Full";
  return EditorAutoIndentStrategy2;
})(EditorAutoIndentStrategy || {});
const MINIMAP_GUTTER_WIDTH = 8;
class ConfigurationChangedEvent {
  /**
   * @internal
   */
  constructor(values) {
    this._values = values;
  }
  hasChanged(id) {
    return this._values[id];
  }
}
class ComputeOptionsMemory {
  constructor() {
    this.stableMinimapLayoutInput = null;
    this.stableFitMaxMinimapScale = 0;
    this.stableFitRemainingWidth = 0;
  }
}
class BaseEditorOption {
  constructor(id, name, defaultValue, schema) {
    this.id = id;
    this.name = name;
    this.defaultValue = defaultValue;
    this.schema = schema;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  compute(env, options, value) {
    return value;
  }
}
class ApplyUpdateResult {
  constructor(newValue, didChange) {
    this.newValue = newValue;
    this.didChange = didChange;
  }
}
function applyUpdate(value, update) {
  if (typeof value !== "object" || typeof update !== "object" || !value || !update) {
    return new ApplyUpdateResult(update, value !== update);
  }
  if (Array.isArray(value) || Array.isArray(update)) {
    const arrayEquals = Array.isArray(value) && Array.isArray(update) && arrays.equals(value, update);
    return new ApplyUpdateResult(update, !arrayEquals);
  }
  let didChange = false;
  for (const key in update) {
    if (update.hasOwnProperty(key)) {
      const result = applyUpdate(value[key], update[key]);
      if (result.didChange) {
        value[key] = result.newValue;
        didChange = true;
      }
    }
  }
  return new ApplyUpdateResult(value, didChange);
}
class ComputedEditorOption {
  constructor(id, defaultValue) {
    this.schema = void 0;
    this.id = id;
    this.name = "_never_";
    this.defaultValue = defaultValue;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  validate(input) {
    return this.defaultValue;
  }
}
class SimpleEditorOption {
  constructor(id, name, defaultValue, schema) {
    this.id = id;
    this.name = name;
    this.defaultValue = defaultValue;
    this.schema = schema;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  compute(env, options, value) {
    return value;
  }
}
function boolean(value, defaultValue) {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  if (value === "false") {
    return false;
  }
  return Boolean(value);
}
class EditorBooleanOption extends SimpleEditorOption {
  constructor(id, name, defaultValue, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "boolean";
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
  }
  validate(input) {
    return boolean(input, this.defaultValue);
  }
}
function clampedInt(value, defaultValue, minimum, maximum) {
  if (typeof value === "string") {
    value = parseInt(value, 10);
  }
  if (typeof value !== "number" || isNaN(value)) {
    return defaultValue;
  }
  let r = value;
  r = Math.max(minimum, r);
  r = Math.min(maximum, r);
  return r | 0;
}
class EditorIntOption extends SimpleEditorOption {
  static clampedInt(value, defaultValue, minimum, maximum) {
    return clampedInt(value, defaultValue, minimum, maximum);
  }
  constructor(id, name, defaultValue, minimum, maximum, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "integer";
      schema.default = defaultValue;
      schema.minimum = minimum;
      schema.maximum = maximum;
    }
    super(id, name, defaultValue, schema);
    this.minimum = minimum;
    this.maximum = maximum;
  }
  validate(input) {
    return EditorIntOption.clampedInt(input, this.defaultValue, this.minimum, this.maximum);
  }
}
function clampedFloat(value, defaultValue, minimum, maximum) {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  const r = EditorFloatOption.float(value, defaultValue);
  return EditorFloatOption.clamp(r, minimum, maximum);
}
class EditorFloatOption extends SimpleEditorOption {
  static clamp(n, min, max) {
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }
  static float(value, defaultValue) {
    if (typeof value === "string") {
      value = parseFloat(value);
    }
    if (typeof value !== "number" || isNaN(value)) {
      return defaultValue;
    }
    return value;
  }
  constructor(id, name, defaultValue, validationFn, schema, minimum, maximum) {
    if (typeof schema !== "undefined") {
      schema.type = "number";
      schema.default = defaultValue;
      schema.minimum = minimum;
      schema.maximum = maximum;
    }
    super(id, name, defaultValue, schema);
    this.validationFn = validationFn;
    this.minimum = minimum;
    this.maximum = maximum;
  }
  validate(input) {
    return this.validationFn(EditorFloatOption.float(input, this.defaultValue));
  }
}
class EditorStringOption extends SimpleEditorOption {
  static string(value, defaultValue) {
    if (typeof value !== "string") {
      return defaultValue;
    }
    return value;
  }
  constructor(id, name, defaultValue, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
  }
  validate(input) {
    return EditorStringOption.string(input, this.defaultValue);
  }
}
function stringSet(value, defaultValue, allowedValues, renamedValues) {
  if (typeof value !== "string") {
    return defaultValue;
  }
  if (renamedValues && value in renamedValues) {
    return renamedValues[value];
  }
  if (allowedValues.indexOf(value) === -1) {
    return defaultValue;
  }
  return value;
}
class EditorStringEnumOption extends SimpleEditorOption {
  constructor(id, name, defaultValue, allowedValues, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.enum = allowedValues.slice(0);
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
    this._allowedValues = allowedValues;
  }
  validate(input) {
    return stringSet(input, this.defaultValue, this._allowedValues);
  }
}
class EditorEnumOption extends BaseEditorOption {
  constructor(id, name, defaultValue, defaultStringValue, allowedValues, convert, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.enum = allowedValues;
      schema.default = defaultStringValue;
    }
    super(id, name, defaultValue, schema);
    this._allowedValues = allowedValues;
    this._convert = convert;
  }
  validate(input) {
    if (typeof input !== "string") {
      return this.defaultValue;
    }
    if (this._allowedValues.indexOf(input) === -1) {
      return this.defaultValue;
    }
    return this._convert(input);
  }
}
function _autoIndentFromString(autoIndent) {
  switch (autoIndent) {
    case "none":
      return 0 /* None */;
    case "keep":
      return 1 /* Keep */;
    case "brackets":
      return 2 /* Brackets */;
    case "advanced":
      return 3 /* Advanced */;
    case "full":
      return 4 /* Full */;
  }
}
class EditorAccessibilitySupport extends BaseEditorOption {
  constructor() {
    super(
      2 /* accessibilitySupport */,
      "accessibilitySupport",
      AccessibilitySupport.Unknown,
      {
        type: "string",
        enum: ["auto", "on", "off"],
        enumDescriptions: [
          nls.localize("accessibilitySupport.auto", "Use platform APIs to detect when a Screen Reader is attached."),
          nls.localize("accessibilitySupport.on", "Optimize for usage with a Screen Reader."),
          nls.localize("accessibilitySupport.off", "Assume a screen reader is not attached.")
        ],
        default: "auto",
        tags: ["accessibility"],
        description: nls.localize("accessibilitySupport", "Controls if the UI should run in a mode where it is optimized for screen readers.")
      }
    );
  }
  validate(input) {
    switch (input) {
      case "auto":
        return AccessibilitySupport.Unknown;
      case "off":
        return AccessibilitySupport.Disabled;
      case "on":
        return AccessibilitySupport.Enabled;
    }
    return this.defaultValue;
  }
  compute(env, options, value) {
    if (value === AccessibilitySupport.Unknown) {
      return env.accessibilitySupport;
    }
    return value;
  }
}
class EditorComments extends BaseEditorOption {
  constructor() {
    const defaults = {
      insertSpace: true,
      ignoreEmptyLines: true
    };
    super(
      29 /* comments */,
      "comments",
      defaults,
      {
        "editor.comments.insertSpace": {
          type: "boolean",
          default: defaults.insertSpace,
          description: nls.localize("comments.insertSpace", "Controls whether a space character is inserted when commenting.")
        },
        "editor.comments.ignoreEmptyLines": {
          type: "boolean",
          default: defaults.ignoreEmptyLines,
          description: nls.localize("comments.ignoreEmptyLines", "Controls if empty lines should be ignored with toggle, add or remove actions for line comments.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      insertSpace: boolean(input.insertSpace, this.defaultValue.insertSpace),
      ignoreEmptyLines: boolean(input.ignoreEmptyLines, this.defaultValue.ignoreEmptyLines)
    };
  }
}
var TextEditorCursorBlinkingStyle = /* @__PURE__ */ ((TextEditorCursorBlinkingStyle2) => {
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Hidden"] = 0] = "Hidden";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Blink"] = 1] = "Blink";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Smooth"] = 2] = "Smooth";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Phase"] = 3] = "Phase";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Expand"] = 4] = "Expand";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Solid"] = 5] = "Solid";
  return TextEditorCursorBlinkingStyle2;
})(TextEditorCursorBlinkingStyle || {});
function cursorBlinkingStyleFromString(cursorBlinkingStyle) {
  switch (cursorBlinkingStyle) {
    case "blink":
      return 1 /* Blink */;
    case "smooth":
      return 2 /* Smooth */;
    case "phase":
      return 3 /* Phase */;
    case "expand":
      return 4 /* Expand */;
    case "solid":
      return 5 /* Solid */;
  }
}
var TextEditorCursorStyle = /* @__PURE__ */ ((TextEditorCursorStyle2) => {
  TextEditorCursorStyle2[TextEditorCursorStyle2["Line"] = 1] = "Line";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Block"] = 2] = "Block";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Underline"] = 3] = "Underline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["LineThin"] = 4] = "LineThin";
  TextEditorCursorStyle2[TextEditorCursorStyle2["BlockOutline"] = 5] = "BlockOutline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["UnderlineThin"] = 6] = "UnderlineThin";
  return TextEditorCursorStyle2;
})(TextEditorCursorStyle || {});
function cursorStyleToString(cursorStyle) {
  switch (cursorStyle) {
    case 1 /* Line */:
      return "line";
    case 2 /* Block */:
      return "block";
    case 3 /* Underline */:
      return "underline";
    case 4 /* LineThin */:
      return "line-thin";
    case 5 /* BlockOutline */:
      return "block-outline";
    case 6 /* UnderlineThin */:
      return "underline-thin";
  }
}
function cursorStyleFromString(cursorStyle) {
  switch (cursorStyle) {
    case "line":
      return 1 /* Line */;
    case "block":
      return 2 /* Block */;
    case "underline":
      return 3 /* Underline */;
    case "line-thin":
      return 4 /* LineThin */;
    case "block-outline":
      return 5 /* BlockOutline */;
    case "underline-thin":
      return 6 /* UnderlineThin */;
  }
}
class EditorClassName extends ComputedEditorOption {
  constructor() {
    super(162 /* editorClassName */, "");
  }
  compute(env, options, _) {
    const classNames = ["monaco-editor"];
    if (options.get(48 /* extraEditorClassName */)) {
      classNames.push(options.get(48 /* extraEditorClassName */));
    }
    if (env.extraEditorClassName) {
      classNames.push(env.extraEditorClassName);
    }
    if (options.get(82 /* mouseStyle */) === "default") {
      classNames.push("mouse-default");
    } else if (options.get(82 /* mouseStyle */) === "copy") {
      classNames.push("mouse-copy");
    }
    if (options.get(127 /* showUnused */)) {
      classNames.push("showUnused");
    }
    if (options.get(157 /* showDeprecated */)) {
      classNames.push("showDeprecated");
    }
    return classNames.join(" ");
  }
}
class EditorEmptySelectionClipboard extends EditorBooleanOption {
  constructor() {
    super(
      45 /* emptySelectionClipboard */,
      "emptySelectionClipboard",
      true,
      { description: nls.localize("emptySelectionClipboard", "Controls whether copying without a selection copies the current line.") }
    );
  }
  compute(env, options, value) {
    return value && env.emptySelectionClipboard;
  }
}
class EditorFind extends BaseEditorOption {
  constructor() {
    const defaults = {
      cursorMoveOnType: true,
      findOnType: true,
      seedSearchStringFromSelection: "always",
      autoFindInSelection: "never",
      globalFindClipboard: false,
      addExtraSpaceOnTop: true,
      loop: true,
      closeOnResult: false,
      history: "workspace",
      replaceHistory: "workspace"
    };
    super(
      50 /* find */,
      "find",
      defaults,
      {
        "editor.find.cursorMoveOnType": {
          type: "boolean",
          default: defaults.cursorMoveOnType,
          description: nls.localize("find.cursorMoveOnType", "Controls whether the cursor should jump to find matches while typing.")
        },
        "editor.find.seedSearchStringFromSelection": {
          type: "string",
          enum: ["never", "always", "selection"],
          default: defaults.seedSearchStringFromSelection,
          enumDescriptions: [
            nls.localize("editor.find.seedSearchStringFromSelection.never", "Never seed search string from the editor selection."),
            nls.localize("editor.find.seedSearchStringFromSelection.always", "Always seed search string from the editor selection, including word at cursor position."),
            nls.localize("editor.find.seedSearchStringFromSelection.selection", "Only seed search string from the editor selection.")
          ],
          description: nls.localize("find.seedSearchStringFromSelection", "Controls whether the search string in the Find Widget is seeded from the editor selection.")
        },
        "editor.find.autoFindInSelection": {
          type: "string",
          enum: ["never", "always", "multiline"],
          default: defaults.autoFindInSelection,
          enumDescriptions: [
            nls.localize("editor.find.autoFindInSelection.never", "Never turn on Find in Selection automatically (default)."),
            nls.localize("editor.find.autoFindInSelection.always", "Always turn on Find in Selection automatically."),
            nls.localize("editor.find.autoFindInSelection.multiline", "Turn on Find in Selection automatically when multiple lines of content are selected.")
          ],
          description: nls.localize("find.autoFindInSelection", "Controls the condition for turning on Find in Selection automatically.")
        },
        "editor.find.globalFindClipboard": {
          type: "boolean",
          default: defaults.globalFindClipboard,
          description: nls.localize("find.globalFindClipboard", "Controls whether the Find Widget should read or modify the shared find clipboard on macOS."),
          included: platform.isMacintosh
        },
        "editor.find.addExtraSpaceOnTop": {
          type: "boolean",
          default: defaults.addExtraSpaceOnTop,
          description: nls.localize("find.addExtraSpaceOnTop", "Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.")
        },
        "editor.find.loop": {
          type: "boolean",
          default: defaults.loop,
          description: nls.localize("find.loop", "Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found.")
        },
        "editor.find.closeOnResult": {
          type: "boolean",
          default: defaults.closeOnResult,
          description: nls.localize("find.closeOnResult", "Controls whether the Find Widget closes after an explicit find navigation command lands on a result.")
        },
        "editor.find.history": {
          type: "string",
          enum: ["never", "workspace"],
          default: "workspace",
          enumDescriptions: [
            nls.localize("editor.find.history.never", "Do not store search history from the find widget."),
            nls.localize("editor.find.history.workspace", "Store search history across the active workspace")
          ],
          description: nls.localize("find.history", "Controls how the find widget history should be stored")
        },
        "editor.find.replaceHistory": {
          type: "string",
          enum: ["never", "workspace"],
          default: "workspace",
          enumDescriptions: [
            nls.localize("editor.find.replaceHistory.never", "Do not store history from the replace widget."),
            nls.localize("editor.find.replaceHistory.workspace", "Store replace history across the active workspace")
          ],
          description: nls.localize("find.replaceHistory", "Controls how the replace widget history should be stored")
        },
        "editor.find.findOnType": {
          type: "boolean",
          default: defaults.findOnType,
          description: nls.localize("find.findOnType", "Controls whether the Find Widget should search as you type.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      cursorMoveOnType: boolean(input.cursorMoveOnType, this.defaultValue.cursorMoveOnType),
      findOnType: boolean(input.findOnType, this.defaultValue.findOnType),
      seedSearchStringFromSelection: typeof input.seedSearchStringFromSelection === "boolean" ? input.seedSearchStringFromSelection ? "always" : "never" : stringSet(input.seedSearchStringFromSelection, this.defaultValue.seedSearchStringFromSelection, ["never", "always", "selection"]),
      autoFindInSelection: typeof input.autoFindInSelection === "boolean" ? input.autoFindInSelection ? "always" : "never" : stringSet(input.autoFindInSelection, this.defaultValue.autoFindInSelection, ["never", "always", "multiline"]),
      globalFindClipboard: boolean(input.globalFindClipboard, this.defaultValue.globalFindClipboard),
      addExtraSpaceOnTop: boolean(input.addExtraSpaceOnTop, this.defaultValue.addExtraSpaceOnTop),
      loop: boolean(input.loop, this.defaultValue.loop),
      closeOnResult: boolean(input.closeOnResult, this.defaultValue.closeOnResult),
      history: stringSet(input.history, this.defaultValue.history, ["never", "workspace"]),
      replaceHistory: stringSet(input.replaceHistory, this.defaultValue.replaceHistory, ["never", "workspace"])
    };
  }
}
const _EditorFontLigatures = class _EditorFontLigatures extends BaseEditorOption {
  constructor() {
    super(
      60 /* fontLigatures */,
      "fontLigatures",
      _EditorFontLigatures.OFF,
      {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("fontLigatures", "Enables/Disables font ligatures ('calt' and 'liga' font features). Change this to a string for fine-grained control of the 'font-feature-settings' CSS property.")
          },
          {
            type: "string",
            description: nls.localize("fontFeatureSettings", "Explicit 'font-feature-settings' CSS property. A boolean can be passed instead if one only needs to turn on/off ligatures.")
          }
        ],
        description: nls.localize("fontLigaturesGeneral", "Configures font ligatures or font features. Can be either a boolean to enable/disable ligatures or a string for the value of the CSS 'font-feature-settings' property."),
        default: false
      }
    );
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      if (input === "false" || input.length === 0) {
        return _EditorFontLigatures.OFF;
      }
      if (input === "true") {
        return _EditorFontLigatures.ON;
      }
      return input;
    }
    if (Boolean(input)) {
      return _EditorFontLigatures.ON;
    }
    return _EditorFontLigatures.OFF;
  }
};
_EditorFontLigatures.OFF = '"liga" off, "calt" off';
_EditorFontLigatures.ON = '"liga" on, "calt" on';
let EditorFontLigatures = _EditorFontLigatures;
const _EditorFontVariations = class _EditorFontVariations extends BaseEditorOption {
  constructor() {
    super(
      63 /* fontVariations */,
      "fontVariations",
      _EditorFontVariations.OFF,
      {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("fontVariations", "Enables/Disables the translation from font-weight to font-variation-settings. Change this to a string for fine-grained control of the 'font-variation-settings' CSS property.")
          },
          {
            type: "string",
            description: nls.localize("fontVariationSettings", "Explicit 'font-variation-settings' CSS property. A boolean can be passed instead if one only needs to translate font-weight to font-variation-settings.")
          }
        ],
        description: nls.localize("fontVariationsGeneral", "Configures font variations. Can be either a boolean to enable/disable the translation from font-weight to font-variation-settings or a string for the value of the CSS 'font-variation-settings' property."),
        default: false
      }
    );
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      if (input === "false") {
        return _EditorFontVariations.OFF;
      }
      if (input === "true") {
        return _EditorFontVariations.TRANSLATE;
      }
      return input;
    }
    if (Boolean(input)) {
      return _EditorFontVariations.TRANSLATE;
    }
    return _EditorFontVariations.OFF;
  }
  compute(env, options, value) {
    return env.fontInfo.fontVariationSettings;
  }
};
// Text is laid out using default settings.
_EditorFontVariations.OFF = FONT_VARIATION_OFF;
// Translate `fontWeight` config to the `font-variation-settings` CSS property.
_EditorFontVariations.TRANSLATE = FONT_VARIATION_TRANSLATE;
let EditorFontVariations = _EditorFontVariations;
class EditorFontInfo extends ComputedEditorOption {
  constructor() {
    super(59 /* fontInfo */, new FontInfo({
      pixelRatio: 0,
      fontFamily: "",
      fontWeight: "",
      fontSize: 0,
      fontFeatureSettings: "",
      fontVariationSettings: "",
      lineHeight: 0,
      letterSpacing: 0,
      isMonospace: false,
      typicalHalfwidthCharacterWidth: 0,
      typicalFullwidthCharacterWidth: 0,
      canUseHalfwidthRightwardsArrow: false,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0,
      maxDigitWidth: 0
    }, false));
  }
  compute(env, options, _) {
    return env.fontInfo;
  }
}
class EffectiveCursorStyle extends ComputedEditorOption {
  constructor() {
    super(161 /* effectiveCursorStyle */, 1 /* Line */);
  }
  compute(env, options, _) {
    return env.inputMode === "overtype" ? options.get(92 /* overtypeCursorStyle */) : options.get(34 /* cursorStyle */);
  }
}
class EffectiveEditContextEnabled extends ComputedEditorOption {
  constructor() {
    super(170 /* effectiveEditContext */, false);
  }
  compute(env, options) {
    return env.editContextSupported && options.get(44 /* editContext */);
  }
}
class EffectiveAllowVariableFonts extends ComputedEditorOption {
  constructor() {
    super(172 /* effectiveAllowVariableFonts */, false);
  }
  compute(env, options) {
    const accessibilitySupport = env.accessibilitySupport;
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return options.get(7 /* allowVariableFontsInAccessibilityMode */);
    } else {
      return options.get(6 /* allowVariableFonts */);
    }
  }
}
class EditorFontSize extends SimpleEditorOption {
  constructor() {
    super(
      61 /* fontSize */,
      "fontSize",
      EDITOR_FONT_DEFAULTS.fontSize,
      {
        type: "number",
        minimum: 6,
        maximum: 100,
        default: EDITOR_FONT_DEFAULTS.fontSize,
        description: nls.localize("fontSize", "Controls the font size in pixels.")
      }
    );
  }
  validate(input) {
    const r = EditorFloatOption.float(input, this.defaultValue);
    if (r === 0) {
      return EDITOR_FONT_DEFAULTS.fontSize;
    }
    return EditorFloatOption.clamp(r, 6, 100);
  }
  compute(env, options, value) {
    return env.fontInfo.fontSize;
  }
}
const _EditorFontWeight = class _EditorFontWeight extends BaseEditorOption {
  constructor() {
    super(
      62 /* fontWeight */,
      "fontWeight",
      EDITOR_FONT_DEFAULTS.fontWeight,
      {
        anyOf: [
          {
            type: "number",
            minimum: _EditorFontWeight.MINIMUM_VALUE,
            maximum: _EditorFontWeight.MAXIMUM_VALUE,
            errorMessage: nls.localize("fontWeightErrorMessage", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
          },
          {
            type: "string",
            pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
          },
          {
            enum: _EditorFontWeight.SUGGESTION_VALUES
          }
        ],
        default: EDITOR_FONT_DEFAULTS.fontWeight,
        description: nls.localize("fontWeight", 'Controls the font weight. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.')
      }
    );
  }
  validate(input) {
    if (input === "normal" || input === "bold") {
      return input;
    }
    return String(EditorIntOption.clampedInt(input, EDITOR_FONT_DEFAULTS.fontWeight, _EditorFontWeight.MINIMUM_VALUE, _EditorFontWeight.MAXIMUM_VALUE));
  }
};
_EditorFontWeight.SUGGESTION_VALUES = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
_EditorFontWeight.MINIMUM_VALUE = 1;
_EditorFontWeight.MAXIMUM_VALUE = 1e3;
let EditorFontWeight = _EditorFontWeight;
class EditorGoToLocation extends BaseEditorOption {
  constructor() {
    const defaults = {
      multiple: "peek",
      multipleDefinitions: "peek",
      multipleTypeDefinitions: "peek",
      multipleDeclarations: "peek",
      multipleImplementations: "peek",
      multipleReferences: "peek",
      multipleTests: "peek",
      alternativeDefinitionCommand: "editor.action.goToReferences",
      alternativeTypeDefinitionCommand: "editor.action.goToReferences",
      alternativeDeclarationCommand: "editor.action.goToReferences",
      alternativeImplementationCommand: "",
      alternativeReferenceCommand: "",
      alternativeTestsCommand: ""
    };
    const jsonSubset = {
      type: "string",
      enum: ["peek", "gotoAndPeek", "goto"],
      default: defaults.multiple,
      enumDescriptions: [
        nls.localize("editor.gotoLocation.multiple.peek", "Show Peek view of the results (default)"),
        nls.localize("editor.gotoLocation.multiple.gotoAndPeek", "Go to the primary result and show a Peek view"),
        nls.localize("editor.gotoLocation.multiple.goto", "Go to the primary result and enable Peek-less navigation to others")
      ]
    };
    const alternativeCommandOptions = ["", "editor.action.referenceSearch.trigger", "editor.action.goToReferences", "editor.action.peekImplementation", "editor.action.goToImplementation", "editor.action.peekTypeDefinition", "editor.action.goToTypeDefinition", "editor.action.peekDeclaration", "editor.action.revealDeclaration", "editor.action.peekDefinition", "editor.action.revealDefinitionAside", "editor.action.revealDefinition"];
    super(
      67 /* gotoLocation */,
      "gotoLocation",
      defaults,
      {
        "editor.gotoLocation.multiple": {
          deprecationMessage: nls.localize("editor.gotoLocation.multiple.deprecated", "This setting is deprecated, please use separate settings like 'editor.editor.gotoLocation.multipleDefinitions' or 'editor.editor.gotoLocation.multipleImplementations' instead.")
        },
        "editor.gotoLocation.multipleDefinitions": {
          description: nls.localize("editor.editor.gotoLocation.multipleDefinitions", "Controls the behavior the 'Go to Definition'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleTypeDefinitions": {
          description: nls.localize("editor.editor.gotoLocation.multipleTypeDefinitions", "Controls the behavior the 'Go to Type Definition'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleDeclarations": {
          description: nls.localize("editor.editor.gotoLocation.multipleDeclarations", "Controls the behavior the 'Go to Declaration'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleImplementations": {
          description: nls.localize("editor.editor.gotoLocation.multipleImplemenattions", "Controls the behavior the 'Go to Implementations'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleReferences": {
          description: nls.localize("editor.editor.gotoLocation.multipleReferences", "Controls the behavior the 'Go to References'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.alternativeDefinitionCommand": {
          type: "string",
          default: defaults.alternativeDefinitionCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeDefinitionCommand", "Alternative command id that is being executed when the result of 'Go to Definition' is the current location.")
        },
        "editor.gotoLocation.alternativeTypeDefinitionCommand": {
          type: "string",
          default: defaults.alternativeTypeDefinitionCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeTypeDefinitionCommand", "Alternative command id that is being executed when the result of 'Go to Type Definition' is the current location.")
        },
        "editor.gotoLocation.alternativeDeclarationCommand": {
          type: "string",
          default: defaults.alternativeDeclarationCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeDeclarationCommand", "Alternative command id that is being executed when the result of 'Go to Declaration' is the current location.")
        },
        "editor.gotoLocation.alternativeImplementationCommand": {
          type: "string",
          default: defaults.alternativeImplementationCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeImplementationCommand", "Alternative command id that is being executed when the result of 'Go to Implementation' is the current location.")
        },
        "editor.gotoLocation.alternativeReferenceCommand": {
          type: "string",
          default: defaults.alternativeReferenceCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeReferenceCommand", "Alternative command id that is being executed when the result of 'Go to Reference' is the current location.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      multiple: stringSet(input.multiple, this.defaultValue.multiple, ["peek", "gotoAndPeek", "goto"]),
      multipleDefinitions: stringSet(input.multipleDefinitions, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleTypeDefinitions: stringSet(input.multipleTypeDefinitions, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleDeclarations: stringSet(input.multipleDeclarations, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleImplementations: stringSet(input.multipleImplementations, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleReferences: stringSet(input.multipleReferences, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleTests: stringSet(input.multipleTests, "peek", ["peek", "gotoAndPeek", "goto"]),
      alternativeDefinitionCommand: EditorStringOption.string(input.alternativeDefinitionCommand, this.defaultValue.alternativeDefinitionCommand),
      alternativeTypeDefinitionCommand: EditorStringOption.string(input.alternativeTypeDefinitionCommand, this.defaultValue.alternativeTypeDefinitionCommand),
      alternativeDeclarationCommand: EditorStringOption.string(input.alternativeDeclarationCommand, this.defaultValue.alternativeDeclarationCommand),
      alternativeImplementationCommand: EditorStringOption.string(input.alternativeImplementationCommand, this.defaultValue.alternativeImplementationCommand),
      alternativeReferenceCommand: EditorStringOption.string(input.alternativeReferenceCommand, this.defaultValue.alternativeReferenceCommand),
      alternativeTestsCommand: EditorStringOption.string(input.alternativeTestsCommand, this.defaultValue.alternativeTestsCommand)
    };
  }
}
class EditorHover extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: "on",
      delay: 300,
      hidingDelay: 300,
      sticky: true,
      above: true,
      showLongLineWarning: true
    };
    super(
      69 /* hover */,
      "hover",
      defaults,
      {
        "editor.hover.enabled": {
          type: "string",
          enum: ["on", "off", "onKeyboardModifier"],
          default: defaults.enabled,
          markdownEnumDescriptions: [
            nls.localize("hover.enabled.on", "Hover is enabled."),
            nls.localize("hover.enabled.off", "Hover is disabled."),
            nls.localize("hover.enabled.onKeyboardModifier", "Hover is shown when holding `{0}` or `Alt` (the opposite modifier of `#editor.multiCursorModifier#`)", platform.isMacintosh ? `Command` : `Control`)
          ],
          description: nls.localize("hover.enabled", "Controls whether the hover is shown."),
          keywords: ["hint", "info", "tooltip"]
        },
        "editor.hover.delay": {
          type: "number",
          default: defaults.delay,
          minimum: 0,
          maximum: 1e4,
          description: nls.localize("hover.delay", "Controls the delay in milliseconds after which the hover is shown.")
        },
        "editor.hover.sticky": {
          type: "boolean",
          default: defaults.sticky,
          description: nls.localize("hover.sticky", "Controls whether the hover should remain visible when mouse is moved over it.")
        },
        "editor.hover.hidingDelay": {
          type: "integer",
          minimum: 0,
          default: defaults.hidingDelay,
          markdownDescription: nls.localize("hover.hidingDelay", "Controls the delay in milliseconds after which the hover is hidden. Requires `#editor.hover.sticky#` to be enabled.")
        },
        "editor.hover.above": {
          type: "boolean",
          default: defaults.above,
          description: nls.localize("hover.above", "Prefer showing hovers above the line, if there's space.")
        },
        "editor.hover.showLongLineWarning": {
          type: "boolean",
          default: defaults.showLongLineWarning,
          description: nls.localize("hover.showLongLineWarning", "Controls whether long line warning hovers are shown, such as when tokenization is skipped or rendering is paused.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["on", "off", "onKeyboardModifier"]),
      delay: EditorIntOption.clampedInt(input.delay, this.defaultValue.delay, 0, 1e4),
      sticky: boolean(input.sticky, this.defaultValue.sticky),
      hidingDelay: EditorIntOption.clampedInt(input.hidingDelay, this.defaultValue.hidingDelay, 0, 6e5),
      above: boolean(input.above, this.defaultValue.above),
      showLongLineWarning: boolean(input.showLongLineWarning, this.defaultValue.showLongLineWarning)
    };
  }
}
var RenderMinimap = /* @__PURE__ */ ((RenderMinimap2) => {
  RenderMinimap2[RenderMinimap2["None"] = 0] = "None";
  RenderMinimap2[RenderMinimap2["Text"] = 1] = "Text";
  RenderMinimap2[RenderMinimap2["Blocks"] = 2] = "Blocks";
  return RenderMinimap2;
})(RenderMinimap || {});
class EditorLayoutInfoComputer extends ComputedEditorOption {
  constructor() {
    super(165 /* layoutInfo */, {
      width: 0,
      height: 0,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 0,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 0,
      contentLeft: 0,
      contentWidth: 0,
      minimap: {
        renderMinimap: 0 /* None */,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 0,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 0
      },
      viewportColumn: 0,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 0,
        right: 0
      }
    });
  }
  compute(env, options, _) {
    return EditorLayoutInfoComputer.computeLayout(options, {
      memory: env.memory,
      outerWidth: env.outerWidth,
      outerHeight: env.outerHeight,
      isDominatedByLongLines: env.isDominatedByLongLines,
      lineHeight: env.fontInfo.lineHeight,
      viewLineCount: env.viewLineCount,
      lineNumbersDigitCount: env.lineNumbersDigitCount,
      typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
      maxDigitWidth: env.fontInfo.maxDigitWidth,
      pixelRatio: env.pixelRatio,
      glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount
    });
  }
  static computeContainedMinimapLineCount(input) {
    const typicalViewportLineCount = input.height / input.lineHeight;
    const extraLinesBeforeFirstLine = Math.floor(input.paddingTop / input.lineHeight);
    let extraLinesBeyondLastLine = Math.floor(input.paddingBottom / input.lineHeight);
    if (input.scrollBeyondLastLine) {
      extraLinesBeyondLastLine = Math.max(extraLinesBeyondLastLine, typicalViewportLineCount - 1);
    }
    const desiredRatio = (extraLinesBeforeFirstLine + input.viewLineCount + extraLinesBeyondLastLine) / (input.pixelRatio * input.height);
    const minimapLineCount = Math.floor(input.viewLineCount / desiredRatio);
    return { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount };
  }
  static _computeMinimapLayout(input, memory) {
    const outerWidth = input.outerWidth;
    const outerHeight = input.outerHeight;
    const pixelRatio = input.pixelRatio;
    if (!input.minimap.enabled) {
      return {
        renderMinimap: 0 /* None */,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: Math.floor(pixelRatio * outerHeight),
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: outerHeight
      };
    }
    const stableMinimapLayoutInput = memory.stableMinimapLayoutInput;
    const couldUseMemory = stableMinimapLayoutInput && input.outerHeight === stableMinimapLayoutInput.outerHeight && input.lineHeight === stableMinimapLayoutInput.lineHeight && input.typicalHalfwidthCharacterWidth === stableMinimapLayoutInput.typicalHalfwidthCharacterWidth && input.pixelRatio === stableMinimapLayoutInput.pixelRatio && input.scrollBeyondLastLine === stableMinimapLayoutInput.scrollBeyondLastLine && input.paddingTop === stableMinimapLayoutInput.paddingTop && input.paddingBottom === stableMinimapLayoutInput.paddingBottom && input.minimap.enabled === stableMinimapLayoutInput.minimap.enabled && input.minimap.side === stableMinimapLayoutInput.minimap.side && input.minimap.size === stableMinimapLayoutInput.minimap.size && input.minimap.showSlider === stableMinimapLayoutInput.minimap.showSlider && input.minimap.renderCharacters === stableMinimapLayoutInput.minimap.renderCharacters && input.minimap.maxColumn === stableMinimapLayoutInput.minimap.maxColumn && input.minimap.scale === stableMinimapLayoutInput.minimap.scale && input.verticalScrollbarWidth === stableMinimapLayoutInput.verticalScrollbarWidth && input.isViewportWrapping === stableMinimapLayoutInput.isViewportWrapping;
    const lineHeight = input.lineHeight;
    const typicalHalfwidthCharacterWidth = input.typicalHalfwidthCharacterWidth;
    const scrollBeyondLastLine = input.scrollBeyondLastLine;
    const minimapRenderCharacters = input.minimap.renderCharacters;
    let minimapScale = pixelRatio >= 2 ? Math.round(input.minimap.scale * 2) : input.minimap.scale;
    const minimapMaxColumn = input.minimap.maxColumn;
    const minimapSize = input.minimap.size;
    const minimapSide = input.minimap.side;
    const verticalScrollbarWidth = input.verticalScrollbarWidth;
    const viewLineCount = input.viewLineCount;
    const remainingWidth = input.remainingWidth;
    const isViewportWrapping = input.isViewportWrapping;
    const baseCharHeight = minimapRenderCharacters ? 2 : 3;
    let minimapCanvasInnerHeight = Math.floor(pixelRatio * outerHeight);
    const minimapCanvasOuterHeight = minimapCanvasInnerHeight / pixelRatio;
    let minimapHeightIsEditorHeight = false;
    let minimapIsSampling = false;
    let minimapLineHeight = baseCharHeight * minimapScale;
    let minimapCharWidth = minimapScale / pixelRatio;
    let minimapWidthMultiplier = 1;
    if (minimapSize === "fill" || minimapSize === "fit") {
      const { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
        viewLineCount,
        scrollBeyondLastLine,
        paddingTop: input.paddingTop,
        paddingBottom: input.paddingBottom,
        height: outerHeight,
        lineHeight,
        pixelRatio
      });
      const ratio = viewLineCount / minimapLineCount;
      if (ratio > 1) {
        minimapHeightIsEditorHeight = true;
        minimapIsSampling = true;
        minimapScale = 1;
        minimapLineHeight = 1;
        minimapCharWidth = minimapScale / pixelRatio;
      } else {
        let fitBecomesFill = false;
        let maxMinimapScale = minimapScale + 1;
        if (minimapSize === "fit") {
          const effectiveMinimapHeight = Math.ceil((extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight);
          if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
            fitBecomesFill = true;
            maxMinimapScale = memory.stableFitMaxMinimapScale;
          } else {
            fitBecomesFill = effectiveMinimapHeight > minimapCanvasInnerHeight;
          }
        }
        if (minimapSize === "fill" || fitBecomesFill) {
          minimapHeightIsEditorHeight = true;
          const configuredMinimapScale = minimapScale;
          minimapLineHeight = Math.min(lineHeight * pixelRatio, Math.max(1, Math.floor(1 / desiredRatio)));
          if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
            maxMinimapScale = memory.stableFitMaxMinimapScale;
          }
          minimapScale = Math.min(maxMinimapScale, Math.max(1, Math.floor(minimapLineHeight / baseCharHeight)));
          if (minimapScale > configuredMinimapScale) {
            minimapWidthMultiplier = Math.min(2, minimapScale / configuredMinimapScale);
          }
          minimapCharWidth = minimapScale / pixelRatio / minimapWidthMultiplier;
          minimapCanvasInnerHeight = Math.ceil(Math.max(typicalViewportLineCount, extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight);
          if (isViewportWrapping) {
            memory.stableMinimapLayoutInput = input;
            memory.stableFitRemainingWidth = remainingWidth;
            memory.stableFitMaxMinimapScale = minimapScale;
          } else {
            memory.stableMinimapLayoutInput = null;
            memory.stableFitRemainingWidth = 0;
          }
        }
      }
    }
    const minimapMaxWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
    const minimapWidth = Math.min(minimapMaxWidth, Math.max(0, Math.floor((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth / (typicalHalfwidthCharacterWidth + minimapCharWidth))) + MINIMAP_GUTTER_WIDTH);
    let minimapCanvasInnerWidth = Math.floor(pixelRatio * minimapWidth);
    const minimapCanvasOuterWidth = minimapCanvasInnerWidth / pixelRatio;
    minimapCanvasInnerWidth = Math.floor(minimapCanvasInnerWidth * minimapWidthMultiplier);
    const renderMinimap = minimapRenderCharacters ? 1 /* Text */ : 2 /* Blocks */;
    const minimapLeft = minimapSide === "left" ? 0 : outerWidth - minimapWidth - verticalScrollbarWidth;
    return {
      renderMinimap,
      minimapLeft,
      minimapWidth,
      minimapHeightIsEditorHeight,
      minimapIsSampling,
      minimapScale,
      minimapLineHeight,
      minimapCanvasInnerWidth,
      minimapCanvasInnerHeight,
      minimapCanvasOuterWidth,
      minimapCanvasOuterHeight
    };
  }
  static computeLayout(options, env) {
    const outerWidth = env.outerWidth | 0;
    const outerHeight = env.outerHeight | 0;
    const lineHeight = env.lineHeight | 0;
    const lineNumbersDigitCount = env.lineNumbersDigitCount | 0;
    const typicalHalfwidthCharacterWidth = env.typicalHalfwidthCharacterWidth;
    const maxDigitWidth = env.maxDigitWidth;
    const pixelRatio = env.pixelRatio;
    const viewLineCount = env.viewLineCount;
    const wordWrapOverride2 = options.get(154 /* wordWrapOverride2 */);
    const wordWrapOverride1 = wordWrapOverride2 === "inherit" ? options.get(153 /* wordWrapOverride1 */) : wordWrapOverride2;
    const wordWrap = wordWrapOverride1 === "inherit" ? options.get(149 /* wordWrap */) : wordWrapOverride1;
    const wordWrapColumn = options.get(152 /* wordWrapColumn */);
    const isDominatedByLongLines = env.isDominatedByLongLines;
    const showGlyphMargin = options.get(66 /* glyphMargin */);
    const showLineNumbers = options.get(76 /* lineNumbers */).renderType !== 0 /* Off */;
    const lineNumbersMinChars = options.get(77 /* lineNumbersMinChars */);
    const scrollBeyondLastLine = options.get(119 /* scrollBeyondLastLine */);
    const padding = options.get(96 /* padding */);
    const minimap = options.get(81 /* minimap */);
    const scrollbar = options.get(117 /* scrollbar */);
    const verticalScrollbarWidth = scrollbar.verticalScrollbarSize;
    const verticalScrollbarHasArrows = scrollbar.verticalHasArrows;
    const scrollbarArrowSize = scrollbar.arrowSize;
    const horizontalScrollbarHeight = scrollbar.horizontalScrollbarSize;
    const folding = options.get(52 /* folding */);
    const showFoldingDecoration = options.get(126 /* showFoldingControls */) !== "never";
    let lineDecorationsWidth = options.get(74 /* lineDecorationsWidth */);
    if (folding && showFoldingDecoration) {
      lineDecorationsWidth += 16;
    }
    let lineNumbersWidth = 0;
    if (showLineNumbers) {
      const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
      lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
    }
    let glyphMarginWidth = 0;
    if (showGlyphMargin) {
      glyphMarginWidth = lineHeight * env.glyphMarginDecorationLaneCount;
    }
    let glyphMarginLeft = 0;
    let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
    let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
    let contentLeft = decorationsLeft + lineDecorationsWidth;
    const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;
    let isWordWrapMinified = false;
    let isViewportWrapping = false;
    let wrappingColumn = -1;
    if (options.get(2 /* accessibilitySupport */) === AccessibilitySupport.Enabled && wordWrapOverride1 === "inherit" && isDominatedByLongLines) {
      isWordWrapMinified = true;
      isViewportWrapping = true;
    } else if (wordWrap === "on" || wordWrap === "bounded") {
      isViewportWrapping = true;
    } else if (wordWrap === "wordWrapColumn") {
      wrappingColumn = wordWrapColumn;
    }
    const minimapLayout = EditorLayoutInfoComputer._computeMinimapLayout({
      outerWidth,
      outerHeight,
      lineHeight,
      typicalHalfwidthCharacterWidth,
      pixelRatio,
      scrollBeyondLastLine,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      minimap,
      verticalScrollbarWidth,
      viewLineCount,
      remainingWidth,
      isViewportWrapping
    }, env.memory || new ComputeOptionsMemory());
    if (minimapLayout.renderMinimap !== 0 /* None */ && minimapLayout.minimapLeft === 0) {
      glyphMarginLeft += minimapLayout.minimapWidth;
      lineNumbersLeft += minimapLayout.minimapWidth;
      decorationsLeft += minimapLayout.minimapWidth;
      contentLeft += minimapLayout.minimapWidth;
    }
    const contentWidth = remainingWidth - minimapLayout.minimapWidth;
    const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth));
    const verticalArrowSize = verticalScrollbarHasArrows ? scrollbarArrowSize : 0;
    if (isViewportWrapping) {
      wrappingColumn = Math.max(1, viewportColumn);
      if (wordWrap === "bounded") {
        wrappingColumn = Math.min(wrappingColumn, wordWrapColumn);
      }
    }
    return {
      width: outerWidth,
      height: outerHeight,
      glyphMarginLeft,
      glyphMarginWidth,
      glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount,
      lineNumbersLeft,
      lineNumbersWidth,
      decorationsLeft,
      decorationsWidth: lineDecorationsWidth,
      contentLeft,
      contentWidth,
      minimap: minimapLayout,
      viewportColumn,
      isWordWrapMinified,
      isViewportWrapping,
      wrappingColumn,
      verticalScrollbarWidth,
      horizontalScrollbarHeight,
      overviewRuler: {
        top: verticalArrowSize,
        width: verticalScrollbarWidth,
        height: outerHeight - 2 * verticalArrowSize,
        right: 0
      }
    };
  }
}
class WrappingStrategy extends BaseEditorOption {
  constructor() {
    super(
      156 /* wrappingStrategy */,
      "wrappingStrategy",
      "simple",
      {
        "editor.wrappingStrategy": {
          enumDescriptions: [
            nls.localize("wrappingStrategy.simple", "Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width."),
            nls.localize("wrappingStrategy.advanced", "Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.")
          ],
          type: "string",
          enum: ["simple", "advanced"],
          default: "simple",
          description: nls.localize("wrappingStrategy", "Controls the algorithm that computes wrapping points. Note that when in accessibility mode, advanced will be used for the best experience.")
        }
      }
    );
  }
  validate(input) {
    return stringSet(input, "simple", ["simple", "advanced"]);
  }
  compute(env, options, value) {
    const accessibilitySupport = options.get(2 /* accessibilitySupport */);
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return "advanced";
    }
    return value;
  }
}
var ShowLightbulbIconMode = /* @__PURE__ */ ((ShowLightbulbIconMode2) => {
  ShowLightbulbIconMode2["Off"] = "off";
  ShowLightbulbIconMode2["OnCode"] = "onCode";
  ShowLightbulbIconMode2["On"] = "on";
  return ShowLightbulbIconMode2;
})(ShowLightbulbIconMode || {});
class EditorLightbulb extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: "onCode" /* OnCode */ };
    super(
      73 /* lightbulb */,
      "lightbulb",
      defaults,
      {
        "editor.lightbulb.enabled": {
          type: "string",
          enum: ["off" /* Off */, "onCode" /* OnCode */, "on" /* On */],
          default: defaults.enabled,
          enumDescriptions: [
            nls.localize("editor.lightbulb.enabled.off", "Disable the code action menu."),
            nls.localize("editor.lightbulb.enabled.onCode", "Show the code action menu when the cursor is on lines with code."),
            nls.localize("editor.lightbulb.enabled.on", "Show the code action menu when the cursor is on lines with code or on empty lines.")
          ],
          description: nls.localize("enabled", "Enables the Code Action lightbulb in the editor.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["off" /* Off */, "onCode" /* OnCode */, "on" /* On */])
    };
  }
}
class EditorStickyScroll extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, maxLineCount: 5, defaultModel: "outlineModel", scrollWithEditor: true };
    super(
      131 /* stickyScroll */,
      "stickyScroll",
      defaults,
      {
        "editor.stickyScroll.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("editor.stickyScroll.enabled", "Shows the nested current scopes during the scroll at the top of the editor.")
        },
        "editor.stickyScroll.maxLineCount": {
          type: "number",
          default: defaults.maxLineCount,
          minimum: 1,
          maximum: 20,
          description: nls.localize("editor.stickyScroll.maxLineCount", "Defines the maximum number of sticky lines to show.")
        },
        "editor.stickyScroll.defaultModel": {
          type: "string",
          enum: ["outlineModel", "foldingProviderModel", "indentationModel"],
          default: defaults.defaultModel,
          description: nls.localize("editor.stickyScroll.defaultModel", "Defines the model to use for determining which lines to stick. If the outline model does not exist, it will fall back on the folding provider model which falls back on the indentation model. This order is respected in all three cases.")
        },
        "editor.stickyScroll.scrollWithEditor": {
          type: "boolean",
          default: defaults.scrollWithEditor,
          description: nls.localize("editor.stickyScroll.scrollWithEditor", "Enable scrolling of Sticky Scroll with the editor's horizontal scrollbar.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      maxLineCount: EditorIntOption.clampedInt(input.maxLineCount, this.defaultValue.maxLineCount, 1, 20),
      defaultModel: stringSet(input.defaultModel, this.defaultValue.defaultModel, ["outlineModel", "foldingProviderModel", "indentationModel"]),
      scrollWithEditor: boolean(input.scrollWithEditor, this.defaultValue.scrollWithEditor)
    };
  }
}
class EditorInlayHints extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: "on", fontSize: 0, fontFamily: "", padding: false, maximumLength: 43 };
    super(
      159 /* inlayHints */,
      "inlayHints",
      defaults,
      {
        "editor.inlayHints.enabled": {
          type: "string",
          default: defaults.enabled,
          description: nls.localize("inlayHints.enable", "Enables the inlay hints in the editor."),
          enum: ["on", "onUnlessPressed", "offUnlessPressed", "off"],
          markdownEnumDescriptions: [
            nls.localize("editor.inlayHints.on", "Inlay hints are enabled"),
            nls.localize("editor.inlayHints.onUnlessPressed", "Inlay hints are showing by default and hide when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
            nls.localize("editor.inlayHints.offUnlessPressed", "Inlay hints are hidden by default and show when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
            nls.localize("editor.inlayHints.off", "Inlay hints are disabled")
          ]
        },
        "editor.inlayHints.fontSize": {
          type: "number",
          default: defaults.fontSize,
          markdownDescription: nls.localize("inlayHints.fontSize", "Controls font size of inlay hints in the editor. As default the {0} is used when the configured value is less than {1} or greater than the editor font size.", "`#editor.fontSize#`", "`5`")
        },
        "editor.inlayHints.fontFamily": {
          type: "string",
          default: defaults.fontFamily,
          markdownDescription: nls.localize("inlayHints.fontFamily", "Controls font family of inlay hints in the editor. When set to empty, the {0} is used.", "`#editor.fontFamily#`")
        },
        "editor.inlayHints.padding": {
          type: "boolean",
          default: defaults.padding,
          description: nls.localize("inlayHints.padding", "Enables the padding around the inlay hints in the editor.")
        },
        "editor.inlayHints.maximumLength": {
          type: "number",
          default: defaults.maximumLength,
          markdownDescription: nls.localize("inlayHints.maximumLength", "Maximum overall length of inlay hints, for a single line, before they get truncated by the editor. Set to `0` to never truncate")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    if (typeof input.enabled === "boolean") {
      input.enabled = input.enabled ? "on" : "off";
    }
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["on", "off", "offUnlessPressed", "onUnlessPressed"]),
      fontSize: EditorIntOption.clampedInt(input.fontSize, this.defaultValue.fontSize, 0, 100),
      fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
      padding: boolean(input.padding, this.defaultValue.padding),
      maximumLength: EditorIntOption.clampedInt(input.maximumLength, this.defaultValue.maximumLength, 0, Number.MAX_SAFE_INTEGER)
    };
  }
}
class EditorLineDecorationsWidth extends BaseEditorOption {
  constructor() {
    super(74 /* lineDecorationsWidth */, "lineDecorationsWidth", 10);
  }
  validate(input) {
    if (typeof input === "string" && /^\d+(\.\d+)?ch$/.test(input)) {
      const multiple = parseFloat(input.substring(0, input.length - 2));
      return -multiple;
    } else {
      return EditorIntOption.clampedInt(input, this.defaultValue, 0, 1e3);
    }
  }
  compute(env, options, value) {
    if (value < 0) {
      return EditorIntOption.clampedInt(-value * env.fontInfo.typicalHalfwidthCharacterWidth, this.defaultValue, 0, 1e3);
    } else {
      return value;
    }
  }
}
class EditorLineHeight extends EditorFloatOption {
  constructor() {
    super(
      75 /* lineHeight */,
      "lineHeight",
      EDITOR_FONT_DEFAULTS.lineHeight,
      (x) => EditorFloatOption.clamp(x, 0, 150),
      { markdownDescription: nls.localize("lineHeight", "Controls the line height. \n - Use 0 to automatically compute the line height from the font size.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values.") },
      0,
      150
    );
  }
  compute(env, options, value) {
    return env.fontInfo.lineHeight;
  }
}
class EditorMinimap extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      size: "proportional",
      side: "right",
      showSlider: "mouseover",
      autohide: "none",
      renderCharacters: true,
      maxColumn: 120,
      scale: 1,
      showRegionSectionHeaders: true,
      showMarkSectionHeaders: true,
      markSectionHeaderRegex: "\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*)$",
      sectionHeaderFontSize: 9,
      sectionHeaderLetterSpacing: 1
    };
    super(
      81 /* minimap */,
      "minimap",
      defaults,
      {
        "editor.minimap.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("minimap.enabled", "Controls whether the minimap is shown.")
        },
        "editor.minimap.autohide": {
          type: "string",
          enum: ["none", "mouseover", "scroll"],
          enumDescriptions: [
            nls.localize("minimap.autohide.none", "The minimap is always shown."),
            nls.localize("minimap.autohide.mouseover", "The minimap is hidden when mouse is not over the minimap and shown when mouse is over the minimap."),
            nls.localize("minimap.autohide.scroll", "The minimap is only shown when the editor is scrolled")
          ],
          default: defaults.autohide,
          description: nls.localize("minimap.autohide", "Controls whether the minimap is hidden automatically.")
        },
        "editor.minimap.size": {
          type: "string",
          enum: ["proportional", "fill", "fit"],
          enumDescriptions: [
            nls.localize("minimap.size.proportional", "The minimap has the same size as the editor contents (and might scroll)."),
            nls.localize("minimap.size.fill", "The minimap will stretch or shrink as necessary to fill the height of the editor (no scrolling)."),
            nls.localize("minimap.size.fit", "The minimap will shrink as necessary to never be larger than the editor (no scrolling).")
          ],
          default: defaults.size,
          description: nls.localize("minimap.size", "Controls the size of the minimap.")
        },
        "editor.minimap.side": {
          type: "string",
          enum: ["left", "right"],
          default: defaults.side,
          description: nls.localize("minimap.side", "Controls the side where to render the minimap.")
        },
        "editor.minimap.showSlider": {
          type: "string",
          enum: ["always", "mouseover"],
          default: defaults.showSlider,
          description: nls.localize("minimap.showSlider", "Controls when the minimap slider is shown.")
        },
        "editor.minimap.scale": {
          type: "number",
          default: defaults.scale,
          minimum: 1,
          maximum: 3,
          enum: [1, 2, 3],
          description: nls.localize("minimap.scale", "Scale of content drawn in the minimap: 1, 2 or 3.")
        },
        "editor.minimap.renderCharacters": {
          type: "boolean",
          default: defaults.renderCharacters,
          description: nls.localize("minimap.renderCharacters", "Render the actual characters on a line as opposed to color blocks.")
        },
        "editor.minimap.maxColumn": {
          type: "number",
          default: defaults.maxColumn,
          description: nls.localize("minimap.maxColumn", "Limit the width of the minimap to render at most a certain number of columns.")
        },
        "editor.minimap.showRegionSectionHeaders": {
          type: "boolean",
          default: defaults.showRegionSectionHeaders,
          description: nls.localize("minimap.showRegionSectionHeaders", "Controls whether named regions are shown as section headers in the minimap.")
        },
        "editor.minimap.showMarkSectionHeaders": {
          type: "boolean",
          default: defaults.showMarkSectionHeaders,
          description: nls.localize("minimap.showMarkSectionHeaders", "Controls whether MARK: comments are shown as section headers in the minimap.")
        },
        "editor.minimap.markSectionHeaderRegex": {
          type: "string",
          default: defaults.markSectionHeaderRegex,
          description: nls.localize("minimap.markSectionHeaderRegex", "Defines the regular expression used to find section headers in comments. The regex must contain a named match group `label` (written as `(?<label>.+)`) that encapsulates the section header, otherwise it will not work. Optionally you can include another match group named `separator`. Use \\n in the pattern to match multi-line headers.")
        },
        "editor.minimap.sectionHeaderFontSize": {
          type: "number",
          default: defaults.sectionHeaderFontSize,
          description: nls.localize("minimap.sectionHeaderFontSize", "Controls the font size of section headers in the minimap.")
        },
        "editor.minimap.sectionHeaderLetterSpacing": {
          type: "number",
          default: defaults.sectionHeaderLetterSpacing,
          description: nls.localize("minimap.sectionHeaderLetterSpacing", "Controls the amount of space (in pixels) between characters of section header. This helps the readability of the header in small font sizes.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    let markSectionHeaderRegex = this.defaultValue.markSectionHeaderRegex;
    const inputRegex = input.markSectionHeaderRegex;
    if (typeof inputRegex === "string") {
      try {
        new RegExp(inputRegex, "d");
        markSectionHeaderRegex = inputRegex;
      } catch {
      }
    }
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      autohide: stringSet(input.autohide, this.defaultValue.autohide, ["none", "mouseover", "scroll"]),
      size: stringSet(input.size, this.defaultValue.size, ["proportional", "fill", "fit"]),
      side: stringSet(input.side, this.defaultValue.side, ["right", "left"]),
      showSlider: stringSet(input.showSlider, this.defaultValue.showSlider, ["always", "mouseover"]),
      renderCharacters: boolean(input.renderCharacters, this.defaultValue.renderCharacters),
      scale: EditorIntOption.clampedInt(input.scale, 1, 1, 3),
      maxColumn: EditorIntOption.clampedInt(input.maxColumn, this.defaultValue.maxColumn, 1, 1e4),
      showRegionSectionHeaders: boolean(input.showRegionSectionHeaders, this.defaultValue.showRegionSectionHeaders),
      showMarkSectionHeaders: boolean(input.showMarkSectionHeaders, this.defaultValue.showMarkSectionHeaders),
      markSectionHeaderRegex,
      sectionHeaderFontSize: EditorFloatOption.clamp(EditorFloatOption.float(input.sectionHeaderFontSize, this.defaultValue.sectionHeaderFontSize), 4, 32),
      sectionHeaderLetterSpacing: EditorFloatOption.clamp(EditorFloatOption.float(input.sectionHeaderLetterSpacing, this.defaultValue.sectionHeaderLetterSpacing), 0, 5)
    };
  }
}
function _multiCursorModifierFromString(multiCursorModifier) {
  if (multiCursorModifier === "ctrlCmd") {
    return platform.isMacintosh ? "metaKey" : "ctrlKey";
  }
  return "altKey";
}
class EditorPadding extends BaseEditorOption {
  constructor() {
    super(
      96 /* padding */,
      "padding",
      { top: 0, bottom: 0 },
      {
        "editor.padding.top": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e3,
          description: nls.localize("padding.top", "Controls the amount of space between the top edge of the editor and the first line.")
        },
        "editor.padding.bottom": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e3,
          description: nls.localize("padding.bottom", "Controls the amount of space between the bottom edge of the editor and the last line.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      top: EditorIntOption.clampedInt(input.top, 0, 0, 1e3),
      bottom: EditorIntOption.clampedInt(input.bottom, 0, 0, 1e3)
    };
  }
}
class EditorParameterHints extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      cycle: true
    };
    super(
      98 /* parameterHints */,
      "parameterHints",
      defaults,
      {
        "editor.parameterHints.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("parameterHints.enabled", "Enables a pop-up that shows parameter documentation and type information as you type.")
        },
        "editor.parameterHints.cycle": {
          type: "boolean",
          default: defaults.cycle,
          description: nls.localize("parameterHints.cycle", "Controls whether the parameter hints menu cycles or closes when reaching the end of the list.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      cycle: boolean(input.cycle, this.defaultValue.cycle)
    };
  }
}
class EditorPixelRatio extends ComputedEditorOption {
  constructor() {
    super(163 /* pixelRatio */, 1);
  }
  compute(env, options, _) {
    return env.pixelRatio;
  }
}
class PlaceholderOption extends BaseEditorOption {
  constructor() {
    super(100 /* placeholder */, "placeholder", void 0);
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      return input;
    }
    return this.defaultValue;
  }
}
class EditorQuickSuggestions extends BaseEditorOption {
  constructor() {
    const defaults = {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "off"
    };
    const types = [
      { type: "boolean" },
      {
        type: "string",
        enum: ["on", "inline", "off", "offWhenInlineCompletions"],
        enumDescriptions: [nls.localize("on", "Quick suggestions show inside the suggest widget"), nls.localize("inline", "Quick suggestions show as ghost text"), nls.localize("off", "Quick suggestions are disabled"), nls.localize("offWhenInlineCompletions", "Quick suggestions are disabled when inline completions are showing")]
      }
    ];
    super(102 /* quickSuggestions */, "quickSuggestions", defaults, {
      anyOf: [
        { type: "boolean" },
        {
          type: "string",
          enum: ["on", "inline", "off", "offWhenInlineCompletions"],
          enumDescriptions: [nls.localize("quickSuggestions.topLevel.on", "Quick suggestions are enabled for all token types"), nls.localize("quickSuggestions.topLevel.inline", "Quick suggestions show as ghost text for all token types"), nls.localize("quickSuggestions.topLevel.off", "Quick suggestions are disabled for all token types"), nls.localize("quickSuggestions.topLevel.offWhenInlineCompletions", "Quick suggestions are disabled for all token types when inline completions are showing")]
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            strings: {
              anyOf: types,
              default: defaults.strings,
              description: nls.localize("quickSuggestions.strings", "Enable quick suggestions inside strings.")
            },
            comments: {
              anyOf: types,
              default: defaults.comments,
              description: nls.localize("quickSuggestions.comments", "Enable quick suggestions inside comments.")
            },
            other: {
              anyOf: types,
              default: defaults.other,
              description: nls.localize("quickSuggestions.other", "Enable quick suggestions outside of strings and comments.")
            }
          }
        }
      ],
      default: defaults,
      markdownDescription: nls.localize("quickSuggestions", "Controls whether suggestions should automatically show up while typing. This can be controlled for typing in comments, strings, and other code. Quick suggestion can be configured to show as ghost text or with the suggest widget. Also be aware of the {0}-setting which controls if suggestions are triggered by special characters.", "`#editor.suggestOnTriggerCharacters#`"),
      experiment: {
        mode: "auto"
      }
    });
    this.defaultValue = defaults;
  }
  validate(input) {
    if (typeof input === "boolean") {
      const value = input ? "on" : "off";
      return { comments: value, strings: value, other: value };
    }
    if (typeof input === "string") {
      const allowedValues2 = ["on", "inline", "off", "offWhenInlineCompletions"];
      const validated = stringSet(input, this.defaultValue.other, allowedValues2);
      return { comments: validated, strings: validated, other: validated };
    }
    if (!input || typeof input !== "object") {
      return this.defaultValue;
    }
    const { other, comments, strings } = input;
    const allowedValues = ["on", "inline", "off", "offWhenInlineCompletions"];
    let validatedOther;
    let validatedComments;
    let validatedStrings;
    if (typeof other === "boolean") {
      validatedOther = other ? "on" : "off";
    } else {
      validatedOther = stringSet(other, this.defaultValue.other, allowedValues);
    }
    if (typeof comments === "boolean") {
      validatedComments = comments ? "on" : "off";
    } else {
      validatedComments = stringSet(comments, this.defaultValue.comments, allowedValues);
    }
    if (typeof strings === "boolean") {
      validatedStrings = strings ? "on" : "off";
    } else {
      validatedStrings = stringSet(strings, this.defaultValue.strings, allowedValues);
    }
    return {
      other: validatedOther,
      comments: validatedComments,
      strings: validatedStrings
    };
  }
}
var RenderLineNumbersType = /* @__PURE__ */ ((RenderLineNumbersType2) => {
  RenderLineNumbersType2[RenderLineNumbersType2["Off"] = 0] = "Off";
  RenderLineNumbersType2[RenderLineNumbersType2["On"] = 1] = "On";
  RenderLineNumbersType2[RenderLineNumbersType2["Relative"] = 2] = "Relative";
  RenderLineNumbersType2[RenderLineNumbersType2["Interval"] = 3] = "Interval";
  RenderLineNumbersType2[RenderLineNumbersType2["Custom"] = 4] = "Custom";
  return RenderLineNumbersType2;
})(RenderLineNumbersType || {});
class EditorRenderLineNumbersOption extends BaseEditorOption {
  constructor() {
    super(
      76 /* lineNumbers */,
      "lineNumbers",
      { renderType: 1 /* On */, renderFn: null },
      {
        type: "string",
        enum: ["off", "on", "relative", "interval"],
        enumDescriptions: [
          nls.localize("lineNumbers.off", "Line numbers are not rendered."),
          nls.localize("lineNumbers.on", "Line numbers are rendered as absolute number."),
          nls.localize("lineNumbers.relative", "Line numbers are rendered as distance in lines to cursor position."),
          nls.localize("lineNumbers.interval", "Line numbers are rendered every 10 lines.")
        ],
        default: "on",
        description: nls.localize("lineNumbers", "Controls the display of line numbers.")
      }
    );
  }
  validate(lineNumbers) {
    let renderType = this.defaultValue.renderType;
    let renderFn = this.defaultValue.renderFn;
    if (typeof lineNumbers !== "undefined") {
      if (typeof lineNumbers === "function") {
        renderType = 4 /* Custom */;
        renderFn = lineNumbers;
      } else if (lineNumbers === "interval") {
        renderType = 3 /* Interval */;
      } else if (lineNumbers === "relative") {
        renderType = 2 /* Relative */;
      } else if (lineNumbers === "on") {
        renderType = 1 /* On */;
      } else {
        renderType = 0 /* Off */;
      }
    }
    return {
      renderType,
      renderFn
    };
  }
}
function filterValidationDecorations(options) {
  const renderValidationDecorations = options.get(112 /* renderValidationDecorations */);
  if (renderValidationDecorations === "editable") {
    return options.get(104 /* readOnly */);
  }
  return renderValidationDecorations === "on" ? false : true;
}
function filterFontDecorations(options) {
  return !options.get(172 /* effectiveAllowVariableFonts */);
}
class EditorRulers extends BaseEditorOption {
  constructor() {
    const defaults = [];
    const columnSchema = { type: "number", description: nls.localize("rulers.size", "Number of monospace characters at which this editor ruler will render.") };
    super(
      116 /* rulers */,
      "rulers",
      defaults,
      {
        type: "array",
        items: {
          anyOf: [
            columnSchema,
            {
              type: [
                "object"
              ],
              properties: {
                column: columnSchema,
                color: {
                  type: "string",
                  description: nls.localize("rulers.color", "Color of this editor ruler."),
                  format: "color-hex"
                }
              }
            }
          ]
        },
        default: defaults,
        description: nls.localize("rulers", "Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.")
      }
    );
  }
  validate(input) {
    if (Array.isArray(input)) {
      const rulers = [];
      for (const _element of input) {
        if (typeof _element === "number") {
          rulers.push({
            column: EditorIntOption.clampedInt(_element, 0, 0, 1e4),
            color: null
          });
        } else if (_element && typeof _element === "object") {
          const element = _element;
          rulers.push({
            column: EditorIntOption.clampedInt(element.column, 0, 0, 1e4),
            color: element.color
          });
        }
      }
      rulers.sort((a, b) => a.column - b.column);
      return rulers;
    }
    return this.defaultValue;
  }
}
class ReadonlyMessage extends BaseEditorOption {
  constructor() {
    const defaults = void 0;
    super(
      105 /* readOnlyMessage */,
      "readOnlyMessage",
      defaults
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    return _input;
  }
}
function _scrollbarVisibilityFromString(visibility, defaultValue) {
  if (typeof visibility !== "string") {
    return defaultValue;
  }
  switch (visibility) {
    case "hidden":
      return ScrollbarVisibility.Hidden;
    case "visible":
      return ScrollbarVisibility.Visible;
    default:
      return ScrollbarVisibility.Auto;
  }
}
class EditorScrollbar extends BaseEditorOption {
  constructor() {
    const defaults = {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Auto,
      arrowSize: 11,
      useShadows: true,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      horizontalScrollbarSize: 12,
      horizontalSliderSize: 12,
      verticalScrollbarSize: 14,
      verticalSliderSize: 14,
      handleMouseWheel: true,
      alwaysConsumeMouseWheel: true,
      scrollByPage: false,
      ignoreHorizontalScrollbarInContentHeight: false
    };
    super(
      117 /* scrollbar */,
      "scrollbar",
      defaults,
      {
        "editor.scrollbar.vertical": {
          type: "string",
          enum: ["auto", "visible", "hidden"],
          enumDescriptions: [
            nls.localize("scrollbar.vertical.auto", "The vertical scrollbar will be visible only when necessary."),
            nls.localize("scrollbar.vertical.visible", "The vertical scrollbar will always be visible."),
            nls.localize("scrollbar.vertical.fit", "The vertical scrollbar will always be hidden.")
          ],
          default: "auto",
          description: nls.localize("scrollbar.vertical", "Controls the visibility of the vertical scrollbar.")
        },
        "editor.scrollbar.horizontal": {
          type: "string",
          enum: ["auto", "visible", "hidden"],
          enumDescriptions: [
            nls.localize("scrollbar.horizontal.auto", "The horizontal scrollbar will be visible only when necessary."),
            nls.localize("scrollbar.horizontal.visible", "The horizontal scrollbar will always be visible."),
            nls.localize("scrollbar.horizontal.fit", "The horizontal scrollbar will always be hidden.")
          ],
          default: "auto",
          description: nls.localize("scrollbar.horizontal", "Controls the visibility of the horizontal scrollbar.")
        },
        "editor.scrollbar.verticalScrollbarSize": {
          type: "number",
          default: defaults.verticalScrollbarSize,
          description: nls.localize("scrollbar.verticalScrollbarSize", "The width of the vertical scrollbar.")
        },
        "editor.scrollbar.horizontalScrollbarSize": {
          type: "number",
          default: defaults.horizontalScrollbarSize,
          description: nls.localize("scrollbar.horizontalScrollbarSize", "The height of the horizontal scrollbar.")
        },
        "editor.scrollbar.scrollByPage": {
          type: "boolean",
          default: defaults.scrollByPage,
          description: nls.localize("scrollbar.scrollByPage", "Controls whether clicks scroll by page or jump to click position.")
        },
        "editor.scrollbar.ignoreHorizontalScrollbarInContentHeight": {
          type: "boolean",
          default: defaults.ignoreHorizontalScrollbarInContentHeight,
          description: nls.localize("scrollbar.ignoreHorizontalScrollbarInContentHeight", "When set, the horizontal scrollbar will not increase the size of the editor's content.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    const horizontalScrollbarSize = EditorIntOption.clampedInt(input.horizontalScrollbarSize, this.defaultValue.horizontalScrollbarSize, 0, 1e3);
    const verticalScrollbarSize = EditorIntOption.clampedInt(input.verticalScrollbarSize, this.defaultValue.verticalScrollbarSize, 0, 1e3);
    return {
      arrowSize: EditorIntOption.clampedInt(input.arrowSize, this.defaultValue.arrowSize, 0, 1e3),
      vertical: _scrollbarVisibilityFromString(input.vertical, this.defaultValue.vertical),
      horizontal: _scrollbarVisibilityFromString(input.horizontal, this.defaultValue.horizontal),
      useShadows: boolean(input.useShadows, this.defaultValue.useShadows),
      verticalHasArrows: boolean(input.verticalHasArrows, this.defaultValue.verticalHasArrows),
      horizontalHasArrows: boolean(input.horizontalHasArrows, this.defaultValue.horizontalHasArrows),
      handleMouseWheel: boolean(input.handleMouseWheel, this.defaultValue.handleMouseWheel),
      alwaysConsumeMouseWheel: boolean(input.alwaysConsumeMouseWheel, this.defaultValue.alwaysConsumeMouseWheel),
      horizontalScrollbarSize,
      horizontalSliderSize: EditorIntOption.clampedInt(input.horizontalSliderSize, horizontalScrollbarSize, 0, 1e3),
      verticalScrollbarSize,
      verticalSliderSize: EditorIntOption.clampedInt(input.verticalSliderSize, verticalScrollbarSize, 0, 1e3),
      scrollByPage: boolean(input.scrollByPage, this.defaultValue.scrollByPage),
      ignoreHorizontalScrollbarInContentHeight: boolean(input.ignoreHorizontalScrollbarInContentHeight, this.defaultValue.ignoreHorizontalScrollbarInContentHeight)
    };
  }
}
const inUntrustedWorkspace = "inUntrustedWorkspace";
const unicodeHighlightConfigKeys = {
  allowedCharacters: "editor.unicodeHighlight.allowedCharacters",
  invisibleCharacters: "editor.unicodeHighlight.invisibleCharacters",
  nonBasicASCII: "editor.unicodeHighlight.nonBasicASCII",
  ambiguousCharacters: "editor.unicodeHighlight.ambiguousCharacters",
  includeComments: "editor.unicodeHighlight.includeComments",
  includeStrings: "editor.unicodeHighlight.includeStrings",
  allowedLocales: "editor.unicodeHighlight.allowedLocales"
};
class UnicodeHighlight extends BaseEditorOption {
  constructor() {
    const defaults = {
      nonBasicASCII: inUntrustedWorkspace,
      invisibleCharacters: true,
      ambiguousCharacters: true,
      includeComments: inUntrustedWorkspace,
      includeStrings: true,
      allowedCharacters: {},
      allowedLocales: { _os: true, _vscode: true }
    };
    super(
      142 /* unicodeHighlighting */,
      "unicodeHighlight",
      defaults,
      {
        [unicodeHighlightConfigKeys.nonBasicASCII]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.nonBasicASCII,
          description: nls.localize("unicodeHighlight.nonBasicASCII", "Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII.")
        },
        [unicodeHighlightConfigKeys.invisibleCharacters]: {
          restricted: true,
          type: "boolean",
          default: defaults.invisibleCharacters,
          description: nls.localize("unicodeHighlight.invisibleCharacters", "Controls whether characters that just reserve space or have no width at all are highlighted.")
        },
        [unicodeHighlightConfigKeys.ambiguousCharacters]: {
          restricted: true,
          type: "boolean",
          default: defaults.ambiguousCharacters,
          description: nls.localize("unicodeHighlight.ambiguousCharacters", "Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale.")
        },
        [unicodeHighlightConfigKeys.includeComments]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.includeComments,
          description: nls.localize("unicodeHighlight.includeComments", "Controls whether characters in comments should also be subject to Unicode highlighting.")
        },
        [unicodeHighlightConfigKeys.includeStrings]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.includeStrings,
          description: nls.localize("unicodeHighlight.includeStrings", "Controls whether characters in strings should also be subject to Unicode highlighting.")
        },
        [unicodeHighlightConfigKeys.allowedCharacters]: {
          restricted: true,
          type: "object",
          default: defaults.allowedCharacters,
          description: nls.localize("unicodeHighlight.allowedCharacters", "Defines allowed characters that are not being highlighted."),
          additionalProperties: {
            type: "boolean"
          }
        },
        [unicodeHighlightConfigKeys.allowedLocales]: {
          restricted: true,
          type: "object",
          additionalProperties: {
            type: "boolean"
          },
          default: defaults.allowedLocales,
          description: nls.localize("unicodeHighlight.allowedLocales", "Unicode characters that are common in allowed locales are not being highlighted.")
        }
      }
    );
  }
  applyUpdate(value, update) {
    let didChange = false;
    if (update.allowedCharacters && value) {
      if (!objects.equals(value.allowedCharacters, update.allowedCharacters)) {
        value = { ...value, allowedCharacters: update.allowedCharacters };
        didChange = true;
      }
    }
    if (update.allowedLocales && value) {
      if (!objects.equals(value.allowedLocales, update.allowedLocales)) {
        value = { ...value, allowedLocales: update.allowedLocales };
        didChange = true;
      }
    }
    const result = super.applyUpdate(value, update);
    if (didChange) {
      return new ApplyUpdateResult(result.newValue, true);
    }
    return result;
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      nonBasicASCII: primitiveSet(input.nonBasicASCII, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      invisibleCharacters: boolean(input.invisibleCharacters, this.defaultValue.invisibleCharacters),
      ambiguousCharacters: boolean(input.ambiguousCharacters, this.defaultValue.ambiguousCharacters),
      includeComments: primitiveSet(input.includeComments, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      includeStrings: primitiveSet(input.includeStrings, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      allowedCharacters: this.validateBooleanMap(input.allowedCharacters, this.defaultValue.allowedCharacters),
      allowedLocales: this.validateBooleanMap(input.allowedLocales, this.defaultValue.allowedLocales)
    };
  }
  validateBooleanMap(map, defaultValue) {
    if (typeof map !== "object" || !map) {
      return defaultValue;
    }
    const result = {};
    for (const [key, value] of Object.entries(map)) {
      if (value === true) {
        result[key] = true;
      }
    }
    return result;
  }
}
class InlineEditorSuggest extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      mode: "subwordSmart",
      showToolbar: "onHover",
      suppressSuggestions: false,
      keepOnBlur: false,
      fontFamily: "default",
      syntaxHighlightingEnabled: true,
      minShowDelay: 0,
      suppressInSnippetMode: true,
      edits: {
        enabled: true,
        showCollapsed: false,
        renderSideBySide: "auto",
        allowCodeShifting: "always",
        showLongDistanceHint: true,
        longDistanceHintContextLineCount: 0
      },
      triggerCommandOnProviderChange: false,
      experimental: {
        suppressInlineSuggestions: "",
        showOnSuggestConflict: "never",
        emptyResponseInformation: true
      }
    };
    super(
      71 /* inlineSuggest */,
      "inlineSuggest",
      defaults,
      {
        "editor.inlineSuggest.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("inlineSuggest.enabled", "Controls whether to automatically show inline suggestions in the editor.")
        },
        "editor.inlineSuggest.showToolbar": {
          type: "string",
          default: defaults.showToolbar,
          enum: ["always", "onHover", "never"],
          enumDescriptions: [
            nls.localize("inlineSuggest.showToolbar.always", "Show the inline suggestion toolbar whenever an inline suggestion is shown."),
            nls.localize("inlineSuggest.showToolbar.onHover", "Show the inline suggestion toolbar when hovering over an inline suggestion."),
            nls.localize("inlineSuggest.showToolbar.never", "Never show the inline suggestion toolbar.")
          ],
          description: nls.localize("inlineSuggest.showToolbar", "Controls when to show the inline suggestion toolbar.")
        },
        "editor.inlineSuggest.syntaxHighlightingEnabled": {
          type: "boolean",
          default: defaults.syntaxHighlightingEnabled,
          description: nls.localize("inlineSuggest.syntaxHighlightingEnabled", "Controls whether to show syntax highlighting for inline suggestions in the editor.")
        },
        "editor.inlineSuggest.suppressSuggestions": {
          type: "boolean",
          default: defaults.suppressSuggestions,
          description: nls.localize("inlineSuggest.suppressSuggestions", "Controls how inline suggestions interact with the suggest widget. If enabled, the suggest widget is not shown automatically when inline suggestions are available.")
        },
        "editor.inlineSuggest.suppressInSnippetMode": {
          type: "boolean",
          default: defaults.suppressInSnippetMode,
          description: nls.localize("inlineSuggest.suppressInSnippetMode", "Controls whether inline suggestions are suppressed when in snippet mode.")
        },
        "editor.inlineSuggest.minShowDelay": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e4,
          description: nls.localize("inlineSuggest.minShowDelay", "Controls the minimal delay in milliseconds after which inline suggestions are shown after typing.")
        },
        "editor.inlineSuggest.experimental.suppressInlineSuggestions": {
          type: "string",
          default: defaults.experimental.suppressInlineSuggestions,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.suppressInlineSuggestions", "Suppresses inline completions for specified extension IDs -- comma separated."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.experimental.emptyResponseInformation": {
          type: "boolean",
          default: defaults.experimental.emptyResponseInformation,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.emptyResponseInformation", "Controls whether to send request information from the inline suggestion provider."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.triggerCommandOnProviderChange": {
          type: "boolean",
          default: defaults.triggerCommandOnProviderChange,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.triggerCommandOnProviderChange", "Controls whether to trigger a command when the inline suggestion provider changes."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.experimental.showOnSuggestConflict": {
          type: "string",
          default: defaults.experimental.showOnSuggestConflict,
          tags: ["experimental"],
          enum: ["always", "never", "whenSuggestListIsIncomplete"],
          description: nls.localize("inlineSuggest.showOnSuggestConflict", "Controls whether to show inline suggestions when there is a suggest conflict."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.fontFamily": {
          type: "string",
          default: defaults.fontFamily,
          description: nls.localize("inlineSuggest.fontFamily", "Controls the font family of the inline suggestions.")
        },
        "editor.inlineSuggest.edits.allowCodeShifting": {
          type: "string",
          default: defaults.edits.allowCodeShifting,
          description: nls.localize("inlineSuggest.edits.allowCodeShifting", "Controls whether showing a suggestion will shift the code to make space for the suggestion inline."),
          enum: ["always", "horizontal", "never"],
          tags: ["nextEditSuggestions"]
        },
        "editor.inlineSuggest.edits.showLongDistanceHint": {
          type: "boolean",
          default: defaults.edits.showLongDistanceHint,
          description: nls.localize("inlineSuggest.edits.showLongDistanceHint", "Controls whether long distance inline suggestions are shown."),
          tags: ["nextEditSuggestions", "experimental"]
        },
        "editor.inlineSuggest.edits.longDistanceHintContextLineCount": {
          type: "number",
          default: defaults.edits.longDistanceHintContextLineCount,
          minimum: 0,
          maximum: 10,
          description: nls.localize("inlineSuggest.edits.longDistanceHintContextLineCount", "Controls how many lines of surrounding context are shown above and below the target line in the long distance inline suggestion preview. Set to 0 to only show the target line."),
          tags: ["nextEditSuggestions", "experimental"],
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.edits.renderSideBySide": {
          type: "string",
          default: defaults.edits.renderSideBySide,
          description: nls.localize("inlineSuggest.edits.renderSideBySide", "Controls whether larger suggestions can be shown side by side."),
          enum: ["auto", "never"],
          enumDescriptions: [
            nls.localize("editor.inlineSuggest.edits.renderSideBySide.auto", "Larger suggestions will show side by side if there is enough space, otherwise they will be shown below."),
            nls.localize("editor.inlineSuggest.edits.renderSideBySide.never", "Larger suggestions are never shown side by side and will always be shown below.")
          ],
          tags: ["nextEditSuggestions"]
        },
        "editor.inlineSuggest.edits.showCollapsed": {
          type: "boolean",
          default: defaults.edits.showCollapsed,
          description: nls.localize("inlineSuggest.edits.showCollapsed", "Controls whether the suggestion will show as collapsed until jumping to it."),
          tags: ["nextEditSuggestions"]
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      mode: stringSet(input.mode, this.defaultValue.mode, ["prefix", "subword", "subwordSmart"]),
      showToolbar: stringSet(input.showToolbar, this.defaultValue.showToolbar, ["always", "onHover", "never"]),
      suppressSuggestions: boolean(input.suppressSuggestions, this.defaultValue.suppressSuggestions),
      keepOnBlur: boolean(input.keepOnBlur, this.defaultValue.keepOnBlur),
      fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
      syntaxHighlightingEnabled: boolean(input.syntaxHighlightingEnabled, this.defaultValue.syntaxHighlightingEnabled),
      minShowDelay: EditorIntOption.clampedInt(input.minShowDelay, 0, 0, 1e4),
      suppressInSnippetMode: boolean(input.suppressInSnippetMode, this.defaultValue.suppressInSnippetMode),
      edits: this._validateEdits(input.edits),
      triggerCommandOnProviderChange: boolean(input.triggerCommandOnProviderChange, this.defaultValue.triggerCommandOnProviderChange),
      experimental: this._validateExperimental(input.experimental)
    };
  }
  _validateEdits(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue.edits;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.edits.enabled),
      showCollapsed: boolean(input.showCollapsed, this.defaultValue.edits.showCollapsed),
      allowCodeShifting: stringSet(input.allowCodeShifting, this.defaultValue.edits.allowCodeShifting, ["always", "horizontal", "never"]),
      showLongDistanceHint: boolean(input.showLongDistanceHint, this.defaultValue.edits.showLongDistanceHint),
      longDistanceHintContextLineCount: EditorIntOption.clampedInt(input.longDistanceHintContextLineCount, this.defaultValue.edits.longDistanceHintContextLineCount, 0, 10),
      renderSideBySide: stringSet(input.renderSideBySide, this.defaultValue.edits.renderSideBySide, ["never", "auto"])
    };
  }
  _validateExperimental(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue.experimental;
    }
    const input = _input;
    return {
      suppressInlineSuggestions: EditorStringOption.string(input.suppressInlineSuggestions, this.defaultValue.experimental.suppressInlineSuggestions),
      showOnSuggestConflict: stringSet(input.showOnSuggestConflict, this.defaultValue.experimental.showOnSuggestConflict, ["always", "never", "whenSuggestListIsIncomplete"]),
      emptyResponseInformation: boolean(input.emptyResponseInformation, this.defaultValue.experimental.emptyResponseInformation)
    };
  }
}
class BracketPairColorization extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.enabled,
      independentColorPoolPerBracketType: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.independentColorPoolPerBracketType
    };
    super(
      21 /* bracketPairColorization */,
      "bracketPairColorization",
      defaults,
      {
        "editor.bracketPairColorization.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("bracketPairColorization.enabled", "Controls whether bracket pair colorization is enabled or not. Use {0} to override the bracket highlight colors.", "`#workbench.colorCustomizations#`")
        },
        "editor.bracketPairColorization.independentColorPoolPerBracketType": {
          type: "boolean",
          default: defaults.independentColorPoolPerBracketType,
          description: nls.localize("bracketPairColorization.independentColorPoolPerBracketType", "Controls whether each bracket type has its own independent color pool.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      independentColorPoolPerBracketType: boolean(input.independentColorPoolPerBracketType, this.defaultValue.independentColorPoolPerBracketType)
    };
  }
}
class GuideOptions extends BaseEditorOption {
  constructor() {
    const defaults = {
      bracketPairs: false,
      bracketPairsHorizontal: "active",
      highlightActiveBracketPair: true,
      indentation: true,
      highlightActiveIndentation: true
    };
    super(
      22 /* guides */,
      "guides",
      defaults,
      {
        "editor.guides.bracketPairs": {
          type: ["boolean", "string"],
          enum: [true, "active", false],
          enumDescriptions: [
            nls.localize("editor.guides.bracketPairs.true", "Enables bracket pair guides."),
            nls.localize("editor.guides.bracketPairs.active", "Enables bracket pair guides only for the active bracket pair."),
            nls.localize("editor.guides.bracketPairs.false", "Disables bracket pair guides.")
          ],
          default: defaults.bracketPairs,
          description: nls.localize("editor.guides.bracketPairs", "Controls whether bracket pair guides are enabled or not.")
        },
        "editor.guides.bracketPairsHorizontal": {
          type: ["boolean", "string"],
          enum: [true, "active", false],
          enumDescriptions: [
            nls.localize("editor.guides.bracketPairsHorizontal.true", "Enables horizontal guides as addition to vertical bracket pair guides."),
            nls.localize("editor.guides.bracketPairsHorizontal.active", "Enables horizontal guides only for the active bracket pair."),
            nls.localize("editor.guides.bracketPairsHorizontal.false", "Disables horizontal bracket pair guides.")
          ],
          default: defaults.bracketPairsHorizontal,
          description: nls.localize("editor.guides.bracketPairsHorizontal", "Controls whether horizontal bracket pair guides are enabled or not.")
        },
        "editor.guides.highlightActiveBracketPair": {
          type: "boolean",
          default: defaults.highlightActiveBracketPair,
          description: nls.localize("editor.guides.highlightActiveBracketPair", "Controls whether the editor should highlight the active bracket pair.")
        },
        "editor.guides.indentation": {
          type: "boolean",
          default: defaults.indentation,
          description: nls.localize("editor.guides.indentation", "Controls whether the editor should render indent guides.")
        },
        "editor.guides.highlightActiveIndentation": {
          type: ["boolean", "string"],
          enum: [true, "always", false],
          enumDescriptions: [
            nls.localize("editor.guides.highlightActiveIndentation.true", "Highlights the active indent guide."),
            nls.localize("editor.guides.highlightActiveIndentation.always", "Highlights the active indent guide even if bracket guides are highlighted."),
            nls.localize("editor.guides.highlightActiveIndentation.false", "Do not highlight the active indent guide.")
          ],
          default: defaults.highlightActiveIndentation,
          description: nls.localize("editor.guides.highlightActiveIndentation", "Controls whether the editor should highlight the active indent guide.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      bracketPairs: primitiveSet(input.bracketPairs, this.defaultValue.bracketPairs, [true, false, "active"]),
      bracketPairsHorizontal: primitiveSet(input.bracketPairsHorizontal, this.defaultValue.bracketPairsHorizontal, [true, false, "active"]),
      highlightActiveBracketPair: boolean(input.highlightActiveBracketPair, this.defaultValue.highlightActiveBracketPair),
      indentation: boolean(input.indentation, this.defaultValue.indentation),
      highlightActiveIndentation: primitiveSet(input.highlightActiveIndentation, this.defaultValue.highlightActiveIndentation, [true, false, "always"])
    };
  }
}
function primitiveSet(value, defaultValue, allowedValues) {
  const idx = allowedValues.indexOf(value);
  if (idx === -1) {
    return defaultValue;
  }
  return allowedValues[idx];
}
class EditorSuggest extends BaseEditorOption {
  constructor() {
    const defaults = {
      insertMode: "insert",
      filterGraceful: true,
      snippetsPreventQuickSuggestions: false,
      localityBonus: false,
      shareSuggestSelections: false,
      selectionMode: "always",
      showIcons: true,
      showStatusBar: false,
      preview: false,
      previewMode: "subwordSmart",
      showInlineDetails: true,
      fitWidthToDetails: false,
      showMethods: true,
      showFunctions: true,
      showConstructors: true,
      showDeprecated: true,
      matchOnWordStartOnly: true,
      showFields: true,
      showVariables: true,
      showClasses: true,
      showStructs: true,
      showInterfaces: true,
      showModules: true,
      showProperties: true,
      showEvents: true,
      showOperators: true,
      showUnits: true,
      showValues: true,
      showConstants: true,
      showEnums: true,
      showEnumMembers: true,
      showKeywords: true,
      showWords: true,
      showColors: true,
      showFiles: true,
      showReferences: true,
      showFolders: true,
      showTypeParameters: true,
      showSnippets: true,
      showUsers: true,
      showIssues: true
    };
    super(
      134 /* suggest */,
      "suggest",
      defaults,
      {
        "editor.suggest.insertMode": {
          type: "string",
          enum: ["insert", "replace"],
          enumDescriptions: [
            nls.localize("suggest.insertMode.insert", "Insert suggestion without overwriting text right of the cursor."),
            nls.localize("suggest.insertMode.replace", "Insert suggestion and overwrite text right of the cursor.")
          ],
          default: defaults.insertMode,
          description: nls.localize("suggest.insertMode", "Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.")
        },
        "editor.suggest.filterGraceful": {
          type: "boolean",
          default: defaults.filterGraceful,
          description: nls.localize("suggest.filterGraceful", "Controls whether filtering and sorting suggestions accounts for small typos.")
        },
        "editor.suggest.localityBonus": {
          type: "boolean",
          default: defaults.localityBonus,
          description: nls.localize("suggest.localityBonus", "Controls whether sorting favors words that appear close to the cursor.")
        },
        "editor.suggest.shareSuggestSelections": {
          type: "boolean",
          default: defaults.shareSuggestSelections,
          markdownDescription: nls.localize("suggest.shareSuggestSelections", "Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).")
        },
        "editor.suggest.selectionMode": {
          type: "string",
          enum: ["always", "never", "whenTriggerCharacter", "whenQuickSuggestion"],
          enumDescriptions: [
            nls.localize("suggest.insertMode.always", "Always select a suggestion when automatically triggering IntelliSense."),
            nls.localize("suggest.insertMode.never", "Never select a suggestion when automatically triggering IntelliSense."),
            nls.localize("suggest.insertMode.whenTriggerCharacter", "Select a suggestion only when triggering IntelliSense from a trigger character."),
            nls.localize("suggest.insertMode.whenQuickSuggestion", "Select a suggestion only when triggering IntelliSense as you type.")
          ],
          default: defaults.selectionMode,
          markdownDescription: nls.localize("suggest.selectionMode", "Controls whether a suggestion is selected when the widget shows. Note that this only applies to automatically triggered suggestions ({0} and {1}) and that a suggestion is always selected when explicitly invoked, e.g via `Ctrl+Space`.", "`#editor.quickSuggestions#`", "`#editor.suggestOnTriggerCharacters#`")
        },
        "editor.suggest.snippetsPreventQuickSuggestions": {
          type: "boolean",
          default: defaults.snippetsPreventQuickSuggestions,
          description: nls.localize("suggest.snippetsPreventQuickSuggestions", "Controls whether an active snippet prevents quick suggestions.")
        },
        "editor.suggest.showIcons": {
          type: "boolean",
          default: defaults.showIcons,
          description: nls.localize("suggest.showIcons", "Controls whether to show or hide icons in suggestions.")
        },
        "editor.suggest.showStatusBar": {
          type: "boolean",
          default: defaults.showStatusBar,
          description: nls.localize("suggest.showStatusBar", "Controls the visibility of the status bar at the bottom of the suggest widget.")
        },
        "editor.suggest.preview": {
          type: "boolean",
          default: defaults.preview,
          description: nls.localize("suggest.preview", "Controls whether to preview the suggestion outcome in the editor.")
        },
        "editor.suggest.showInlineDetails": {
          type: "boolean",
          default: defaults.showInlineDetails,
          description: nls.localize("suggest.showInlineDetails", "Controls whether suggest details show inline with the label or only in the details widget.")
        },
        "editor.suggest.filteredTypes": {
          type: "object",
          deprecationMessage: nls.localize("deprecated", "This setting is deprecated, please use separate settings like 'editor.suggest.showKeywords' or 'editor.suggest.showSnippets' instead.")
        },
        "editor.suggest.showMethods": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showMethods", "When enabled IntelliSense shows `method`-suggestions.")
        },
        "editor.suggest.showFunctions": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFunctions", "When enabled IntelliSense shows `function`-suggestions.")
        },
        "editor.suggest.showConstructors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showConstructors", "When enabled IntelliSense shows `constructor`-suggestions.")
        },
        "editor.suggest.showDeprecated": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showDeprecated", "When enabled IntelliSense shows `deprecated`-suggestions.")
        },
        "editor.suggest.matchOnWordStartOnly": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.matchOnWordStartOnly", "When enabled IntelliSense filtering requires that the first character matches on a word start. For example, `c` on `Console` or `WebContext` but _not_ on `description`. When disabled IntelliSense will show more results but still sorts them by match quality.")
        },
        "editor.suggest.showFields": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFields", "When enabled IntelliSense shows `field`-suggestions.")
        },
        "editor.suggest.showVariables": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showVariables", "When enabled IntelliSense shows `variable`-suggestions.")
        },
        "editor.suggest.showClasses": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showClasss", "When enabled IntelliSense shows `class`-suggestions.")
        },
        "editor.suggest.showStructs": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showStructs", "When enabled IntelliSense shows `struct`-suggestions.")
        },
        "editor.suggest.showInterfaces": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showInterfaces", "When enabled IntelliSense shows `interface`-suggestions.")
        },
        "editor.suggest.showModules": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showModules", "When enabled IntelliSense shows `module`-suggestions.")
        },
        "editor.suggest.showProperties": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showPropertys", "When enabled IntelliSense shows `property`-suggestions.")
        },
        "editor.suggest.showEvents": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEvents", "When enabled IntelliSense shows `event`-suggestions.")
        },
        "editor.suggest.showOperators": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showOperators", "When enabled IntelliSense shows `operator`-suggestions.")
        },
        "editor.suggest.showUnits": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showUnits", "When enabled IntelliSense shows `unit`-suggestions.")
        },
        "editor.suggest.showValues": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showValues", "When enabled IntelliSense shows `value`-suggestions.")
        },
        "editor.suggest.showConstants": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showConstants", "When enabled IntelliSense shows `constant`-suggestions.")
        },
        "editor.suggest.showEnums": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEnums", "When enabled IntelliSense shows `enum`-suggestions.")
        },
        "editor.suggest.showEnumMembers": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEnumMembers", "When enabled IntelliSense shows `enumMember`-suggestions.")
        },
        "editor.suggest.showKeywords": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showKeywords", "When enabled IntelliSense shows `keyword`-suggestions.")
        },
        "editor.suggest.showWords": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showTexts", "When enabled IntelliSense shows `text`-suggestions.")
        },
        "editor.suggest.showColors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showColors", "When enabled IntelliSense shows `color`-suggestions.")
        },
        "editor.suggest.showFiles": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFiles", "When enabled IntelliSense shows `file`-suggestions.")
        },
        "editor.suggest.showReferences": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showReferences", "When enabled IntelliSense shows `reference`-suggestions.")
        },
        "editor.suggest.showCustomcolors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showCustomcolors", "When enabled IntelliSense shows `customcolor`-suggestions.")
        },
        "editor.suggest.showFolders": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFolders", "When enabled IntelliSense shows `folder`-suggestions.")
        },
        "editor.suggest.showTypeParameters": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showTypeParameters", "When enabled IntelliSense shows `typeParameter`-suggestions.")
        },
        "editor.suggest.showSnippets": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showSnippets", "When enabled IntelliSense shows `snippet`-suggestions.")
        },
        "editor.suggest.showUsers": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showUsers", "When enabled IntelliSense shows `user`-suggestions.")
        },
        "editor.suggest.showIssues": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showIssues", "When enabled IntelliSense shows `issues`-suggestions.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      insertMode: stringSet(input.insertMode, this.defaultValue.insertMode, ["insert", "replace"]),
      filterGraceful: boolean(input.filterGraceful, this.defaultValue.filterGraceful),
      snippetsPreventQuickSuggestions: boolean(input.snippetsPreventQuickSuggestions, this.defaultValue.filterGraceful),
      localityBonus: boolean(input.localityBonus, this.defaultValue.localityBonus),
      shareSuggestSelections: boolean(input.shareSuggestSelections, this.defaultValue.shareSuggestSelections),
      selectionMode: stringSet(input.selectionMode, this.defaultValue.selectionMode, ["always", "never", "whenQuickSuggestion", "whenTriggerCharacter"]),
      showIcons: boolean(input.showIcons, this.defaultValue.showIcons),
      showStatusBar: boolean(input.showStatusBar, this.defaultValue.showStatusBar),
      preview: boolean(input.preview, this.defaultValue.preview),
      previewMode: stringSet(input.previewMode, this.defaultValue.previewMode, ["prefix", "subword", "subwordSmart"]),
      showInlineDetails: boolean(input.showInlineDetails, this.defaultValue.showInlineDetails),
      fitWidthToDetails: boolean(input.fitWidthToDetails, this.defaultValue.fitWidthToDetails),
      showMethods: boolean(input.showMethods, this.defaultValue.showMethods),
      showFunctions: boolean(input.showFunctions, this.defaultValue.showFunctions),
      showConstructors: boolean(input.showConstructors, this.defaultValue.showConstructors),
      showDeprecated: boolean(input.showDeprecated, this.defaultValue.showDeprecated),
      matchOnWordStartOnly: boolean(input.matchOnWordStartOnly, this.defaultValue.matchOnWordStartOnly),
      showFields: boolean(input.showFields, this.defaultValue.showFields),
      showVariables: boolean(input.showVariables, this.defaultValue.showVariables),
      showClasses: boolean(input.showClasses, this.defaultValue.showClasses),
      showStructs: boolean(input.showStructs, this.defaultValue.showStructs),
      showInterfaces: boolean(input.showInterfaces, this.defaultValue.showInterfaces),
      showModules: boolean(input.showModules, this.defaultValue.showModules),
      showProperties: boolean(input.showProperties, this.defaultValue.showProperties),
      showEvents: boolean(input.showEvents, this.defaultValue.showEvents),
      showOperators: boolean(input.showOperators, this.defaultValue.showOperators),
      showUnits: boolean(input.showUnits, this.defaultValue.showUnits),
      showValues: boolean(input.showValues, this.defaultValue.showValues),
      showConstants: boolean(input.showConstants, this.defaultValue.showConstants),
      showEnums: boolean(input.showEnums, this.defaultValue.showEnums),
      showEnumMembers: boolean(input.showEnumMembers, this.defaultValue.showEnumMembers),
      showKeywords: boolean(input.showKeywords, this.defaultValue.showKeywords),
      showWords: boolean(input.showWords, this.defaultValue.showWords),
      showColors: boolean(input.showColors, this.defaultValue.showColors),
      showFiles: boolean(input.showFiles, this.defaultValue.showFiles),
      showReferences: boolean(input.showReferences, this.defaultValue.showReferences),
      showFolders: boolean(input.showFolders, this.defaultValue.showFolders),
      showTypeParameters: boolean(input.showTypeParameters, this.defaultValue.showTypeParameters),
      showSnippets: boolean(input.showSnippets, this.defaultValue.showSnippets),
      showUsers: boolean(input.showUsers, this.defaultValue.showUsers),
      showIssues: boolean(input.showIssues, this.defaultValue.showIssues)
    };
  }
}
class SmartSelect extends BaseEditorOption {
  constructor() {
    super(
      129 /* smartSelect */,
      "smartSelect",
      {
        selectLeadingAndTrailingWhitespace: true,
        selectSubwords: true
      },
      {
        "editor.smartSelect.selectLeadingAndTrailingWhitespace": {
          description: nls.localize("selectLeadingAndTrailingWhitespace", "Whether leading and trailing whitespace should always be selected."),
          default: true,
          type: "boolean"
        },
        "editor.smartSelect.selectSubwords": {
          description: nls.localize("selectSubwords", "Whether subwords (like 'foo' in 'fooBar' or 'foo_bar') should be selected."),
          default: true,
          type: "boolean"
        }
      }
    );
  }
  validate(input) {
    if (!input || typeof input !== "object") {
      return this.defaultValue;
    }
    return {
      selectLeadingAndTrailingWhitespace: boolean(input.selectLeadingAndTrailingWhitespace, this.defaultValue.selectLeadingAndTrailingWhitespace),
      selectSubwords: boolean(input.selectSubwords, this.defaultValue.selectSubwords)
    };
  }
}
class WordSegmenterLocales extends BaseEditorOption {
  constructor() {
    const defaults = [];
    super(
      147 /* wordSegmenterLocales */,
      "wordSegmenterLocales",
      defaults,
      {
        anyOf: [
          {
            type: "string"
          },
          {
            type: "array",
            items: {
              type: "string"
            }
          }
        ],
        description: nls.localize("wordSegmenterLocales", "Locales to be used for word segmentation when doing word related navigations or operations. Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.)."),
        type: "array",
        items: {
          type: "string"
        },
        default: defaults
      }
    );
  }
  validate(input) {
    if (typeof input === "string") {
      input = [input];
    }
    if (Array.isArray(input)) {
      const validLocales = [];
      for (const locale of input) {
        if (typeof locale === "string") {
          try {
            if (Intl.Segmenter.supportedLocalesOf(locale).length > 0) {
              validLocales.push(locale);
            }
          } catch {
          }
        }
      }
      return validLocales;
    }
    return this.defaultValue;
  }
}
var WrappingIndent = /* @__PURE__ */ ((WrappingIndent2) => {
  WrappingIndent2[WrappingIndent2["None"] = 0] = "None";
  WrappingIndent2[WrappingIndent2["Same"] = 1] = "Same";
  WrappingIndent2[WrappingIndent2["Indent"] = 2] = "Indent";
  WrappingIndent2[WrappingIndent2["DeepIndent"] = 3] = "DeepIndent";
  return WrappingIndent2;
})(WrappingIndent || {});
class WrappingIndentOption extends BaseEditorOption {
  constructor() {
    super(
      155 /* wrappingIndent */,
      "wrappingIndent",
      1 /* Same */,
      {
        "editor.wrappingIndent": {
          type: "string",
          enum: ["none", "same", "indent", "deepIndent"],
          enumDescriptions: [
            nls.localize("wrappingIndent.none", "No indentation. Wrapped lines begin at column 1."),
            nls.localize("wrappingIndent.same", "Wrapped lines get the same indentation as the parent."),
            nls.localize("wrappingIndent.indent", "Wrapped lines get +1 indentation toward the parent."),
            nls.localize("wrappingIndent.deepIndent", "Wrapped lines get +2 indentation toward the parent.")
          ],
          description: nls.localize("wrappingIndent", "Controls the indentation of wrapped lines."),
          default: "same"
        }
      }
    );
  }
  validate(input) {
    switch (input) {
      case "none":
        return 0 /* None */;
      case "same":
        return 1 /* Same */;
      case "indent":
        return 2 /* Indent */;
      case "deepIndent":
        return 3 /* DeepIndent */;
    }
    return 1 /* Same */;
  }
  compute(env, options, value) {
    const accessibilitySupport = options.get(2 /* accessibilitySupport */);
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return 0 /* None */;
    }
    return value;
  }
}
class EditorWrappingInfoComputer extends ComputedEditorOption {
  constructor() {
    super(166 /* wrappingInfo */, {
      isDominatedByLongLines: false,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1
    });
  }
  compute(env, options, _) {
    const layoutInfo = options.get(165 /* layoutInfo */);
    return {
      isDominatedByLongLines: env.isDominatedByLongLines,
      isWordWrapMinified: layoutInfo.isWordWrapMinified,
      isViewportWrapping: layoutInfo.isViewportWrapping,
      wrappingColumn: layoutInfo.wrappingColumn
    };
  }
}
class EditorDropIntoEditor extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, showDropSelector: "afterDrop" };
    super(
      43 /* dropIntoEditor */,
      "dropIntoEditor",
      defaults,
      {
        "editor.dropIntoEditor.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("dropIntoEditor.enabled", "Controls whether you can drag and drop a file into a text editor by holding down the `Shift` key (instead of opening the file in an editor).")
        },
        "editor.dropIntoEditor.showDropSelector": {
          type: "string",
          markdownDescription: nls.localize("dropIntoEditor.showDropSelector", "Controls if a widget is shown when dropping files into the editor. This widget lets you control how the file is dropped."),
          enum: [
            "afterDrop",
            "never"
          ],
          enumDescriptions: [
            nls.localize("dropIntoEditor.showDropSelector.afterDrop", "Show the drop selector widget after a file is dropped into the editor."),
            nls.localize("dropIntoEditor.showDropSelector.never", "Never show the drop selector widget. Instead the default drop provider is always used.")
          ],
          default: "afterDrop"
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      showDropSelector: stringSet(input.showDropSelector, this.defaultValue.showDropSelector, ["afterDrop", "never"])
    };
  }
}
class EditorPasteAs extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, showPasteSelector: "afterPaste" };
    super(
      97 /* pasteAs */,
      "pasteAs",
      defaults,
      {
        "editor.pasteAs.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("pasteAs.enabled", "Controls whether you can paste content in different ways.")
        },
        "editor.pasteAs.showPasteSelector": {
          type: "string",
          markdownDescription: nls.localize("pasteAs.showPasteSelector", "Controls if a widget is shown when pasting content in to the editor. This widget lets you control how the file is pasted."),
          enum: [
            "afterPaste",
            "never"
          ],
          enumDescriptions: [
            nls.localize("pasteAs.showPasteSelector.afterPaste", "Show the paste selector widget after content is pasted into the editor."),
            nls.localize("pasteAs.showPasteSelector.never", "Never show the paste selector widget. Instead the default pasting behavior is always used.")
          ],
          default: "afterPaste"
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      showPasteSelector: stringSet(input.showPasteSelector, this.defaultValue.showPasteSelector, ["afterPaste", "never"])
    };
  }
}
const editorOptionsRegistry = [];
function register(option) {
  editorOptionsRegistry[option.id] = option;
  return option;
}
var EditorOption = /* @__PURE__ */ ((EditorOption2) => {
  EditorOption2[EditorOption2["acceptSuggestionOnCommitCharacter"] = 0] = "acceptSuggestionOnCommitCharacter";
  EditorOption2[EditorOption2["acceptSuggestionOnEnter"] = 1] = "acceptSuggestionOnEnter";
  EditorOption2[EditorOption2["accessibilitySupport"] = 2] = "accessibilitySupport";
  EditorOption2[EditorOption2["accessibilityPageSize"] = 3] = "accessibilityPageSize";
  EditorOption2[EditorOption2["allowOverflow"] = 4] = "allowOverflow";
  EditorOption2[EditorOption2["allowVariableLineHeights"] = 5] = "allowVariableLineHeights";
  EditorOption2[EditorOption2["allowVariableFonts"] = 6] = "allowVariableFonts";
  EditorOption2[EditorOption2["allowVariableFontsInAccessibilityMode"] = 7] = "allowVariableFontsInAccessibilityMode";
  EditorOption2[EditorOption2["ariaLabel"] = 8] = "ariaLabel";
  EditorOption2[EditorOption2["ariaRequired"] = 9] = "ariaRequired";
  EditorOption2[EditorOption2["autoClosingBrackets"] = 10] = "autoClosingBrackets";
  EditorOption2[EditorOption2["autoClosingComments"] = 11] = "autoClosingComments";
  EditorOption2[EditorOption2["screenReaderAnnounceInlineSuggestion"] = 12] = "screenReaderAnnounceInlineSuggestion";
  EditorOption2[EditorOption2["autoClosingDelete"] = 13] = "autoClosingDelete";
  EditorOption2[EditorOption2["autoClosingOvertype"] = 14] = "autoClosingOvertype";
  EditorOption2[EditorOption2["autoClosingQuotes"] = 15] = "autoClosingQuotes";
  EditorOption2[EditorOption2["autoIndent"] = 16] = "autoIndent";
  EditorOption2[EditorOption2["autoIndentOnPaste"] = 17] = "autoIndentOnPaste";
  EditorOption2[EditorOption2["autoIndentOnPasteWithinString"] = 18] = "autoIndentOnPasteWithinString";
  EditorOption2[EditorOption2["automaticLayout"] = 19] = "automaticLayout";
  EditorOption2[EditorOption2["autoSurround"] = 20] = "autoSurround";
  EditorOption2[EditorOption2["bracketPairColorization"] = 21] = "bracketPairColorization";
  EditorOption2[EditorOption2["guides"] = 22] = "guides";
  EditorOption2[EditorOption2["codeLens"] = 23] = "codeLens";
  EditorOption2[EditorOption2["codeLensFontFamily"] = 24] = "codeLensFontFamily";
  EditorOption2[EditorOption2["codeLensFontSize"] = 25] = "codeLensFontSize";
  EditorOption2[EditorOption2["colorDecorators"] = 26] = "colorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsLimit"] = 27] = "colorDecoratorsLimit";
  EditorOption2[EditorOption2["columnSelection"] = 28] = "columnSelection";
  EditorOption2[EditorOption2["comments"] = 29] = "comments";
  EditorOption2[EditorOption2["contextmenu"] = 30] = "contextmenu";
  EditorOption2[EditorOption2["copyWithSyntaxHighlighting"] = 31] = "copyWithSyntaxHighlighting";
  EditorOption2[EditorOption2["cursorBlinking"] = 32] = "cursorBlinking";
  EditorOption2[EditorOption2["cursorSmoothCaretAnimation"] = 33] = "cursorSmoothCaretAnimation";
  EditorOption2[EditorOption2["cursorStyle"] = 34] = "cursorStyle";
  EditorOption2[EditorOption2["cursorSurroundingLines"] = 35] = "cursorSurroundingLines";
  EditorOption2[EditorOption2["cursorSurroundingLinesStyle"] = 36] = "cursorSurroundingLinesStyle";
  EditorOption2[EditorOption2["cursorWidth"] = 37] = "cursorWidth";
  EditorOption2[EditorOption2["cursorHeight"] = 38] = "cursorHeight";
  EditorOption2[EditorOption2["disableLayerHinting"] = 39] = "disableLayerHinting";
  EditorOption2[EditorOption2["disableMonospaceOptimizations"] = 40] = "disableMonospaceOptimizations";
  EditorOption2[EditorOption2["domReadOnly"] = 41] = "domReadOnly";
  EditorOption2[EditorOption2["dragAndDrop"] = 42] = "dragAndDrop";
  EditorOption2[EditorOption2["dropIntoEditor"] = 43] = "dropIntoEditor";
  EditorOption2[EditorOption2["editContext"] = 44] = "editContext";
  EditorOption2[EditorOption2["emptySelectionClipboard"] = 45] = "emptySelectionClipboard";
  EditorOption2[EditorOption2["experimentalGpuAcceleration"] = 46] = "experimentalGpuAcceleration";
  EditorOption2[EditorOption2["experimentalWhitespaceRendering"] = 47] = "experimentalWhitespaceRendering";
  EditorOption2[EditorOption2["extraEditorClassName"] = 48] = "extraEditorClassName";
  EditorOption2[EditorOption2["fastScrollSensitivity"] = 49] = "fastScrollSensitivity";
  EditorOption2[EditorOption2["find"] = 50] = "find";
  EditorOption2[EditorOption2["fixedOverflowWidgets"] = 51] = "fixedOverflowWidgets";
  EditorOption2[EditorOption2["folding"] = 52] = "folding";
  EditorOption2[EditorOption2["foldingStrategy"] = 53] = "foldingStrategy";
  EditorOption2[EditorOption2["foldingHighlight"] = 54] = "foldingHighlight";
  EditorOption2[EditorOption2["foldingImportsByDefault"] = 55] = "foldingImportsByDefault";
  EditorOption2[EditorOption2["foldingMaximumRegions"] = 56] = "foldingMaximumRegions";
  EditorOption2[EditorOption2["unfoldOnClickAfterEndOfLine"] = 57] = "unfoldOnClickAfterEndOfLine";
  EditorOption2[EditorOption2["fontFamily"] = 58] = "fontFamily";
  EditorOption2[EditorOption2["fontInfo"] = 59] = "fontInfo";
  EditorOption2[EditorOption2["fontLigatures"] = 60] = "fontLigatures";
  EditorOption2[EditorOption2["fontSize"] = 61] = "fontSize";
  EditorOption2[EditorOption2["fontWeight"] = 62] = "fontWeight";
  EditorOption2[EditorOption2["fontVariations"] = 63] = "fontVariations";
  EditorOption2[EditorOption2["formatOnPaste"] = 64] = "formatOnPaste";
  EditorOption2[EditorOption2["formatOnType"] = 65] = "formatOnType";
  EditorOption2[EditorOption2["glyphMargin"] = 66] = "glyphMargin";
  EditorOption2[EditorOption2["gotoLocation"] = 67] = "gotoLocation";
  EditorOption2[EditorOption2["hideCursorInOverviewRuler"] = 68] = "hideCursorInOverviewRuler";
  EditorOption2[EditorOption2["hover"] = 69] = "hover";
  EditorOption2[EditorOption2["inDiffEditor"] = 70] = "inDiffEditor";
  EditorOption2[EditorOption2["inlineSuggest"] = 71] = "inlineSuggest";
  EditorOption2[EditorOption2["letterSpacing"] = 72] = "letterSpacing";
  EditorOption2[EditorOption2["lightbulb"] = 73] = "lightbulb";
  EditorOption2[EditorOption2["lineDecorationsWidth"] = 74] = "lineDecorationsWidth";
  EditorOption2[EditorOption2["lineHeight"] = 75] = "lineHeight";
  EditorOption2[EditorOption2["lineNumbers"] = 76] = "lineNumbers";
  EditorOption2[EditorOption2["lineNumbersMinChars"] = 77] = "lineNumbersMinChars";
  EditorOption2[EditorOption2["linkedEditing"] = 78] = "linkedEditing";
  EditorOption2[EditorOption2["links"] = 79] = "links";
  EditorOption2[EditorOption2["matchBrackets"] = 80] = "matchBrackets";
  EditorOption2[EditorOption2["minimap"] = 81] = "minimap";
  EditorOption2[EditorOption2["mouseStyle"] = 82] = "mouseStyle";
  EditorOption2[EditorOption2["mouseWheelScrollSensitivity"] = 83] = "mouseWheelScrollSensitivity";
  EditorOption2[EditorOption2["mouseWheelZoom"] = 84] = "mouseWheelZoom";
  EditorOption2[EditorOption2["multiCursorMergeOverlapping"] = 85] = "multiCursorMergeOverlapping";
  EditorOption2[EditorOption2["multiCursorModifier"] = 86] = "multiCursorModifier";
  EditorOption2[EditorOption2["mouseMiddleClickAction"] = 87] = "mouseMiddleClickAction";
  EditorOption2[EditorOption2["multiCursorPaste"] = 88] = "multiCursorPaste";
  EditorOption2[EditorOption2["multiCursorLimit"] = 89] = "multiCursorLimit";
  EditorOption2[EditorOption2["occurrencesHighlight"] = 90] = "occurrencesHighlight";
  EditorOption2[EditorOption2["occurrencesHighlightDelay"] = 91] = "occurrencesHighlightDelay";
  EditorOption2[EditorOption2["overtypeCursorStyle"] = 92] = "overtypeCursorStyle";
  EditorOption2[EditorOption2["overtypeOnPaste"] = 93] = "overtypeOnPaste";
  EditorOption2[EditorOption2["overviewRulerBorder"] = 94] = "overviewRulerBorder";
  EditorOption2[EditorOption2["overviewRulerLanes"] = 95] = "overviewRulerLanes";
  EditorOption2[EditorOption2["padding"] = 96] = "padding";
  EditorOption2[EditorOption2["pasteAs"] = 97] = "pasteAs";
  EditorOption2[EditorOption2["parameterHints"] = 98] = "parameterHints";
  EditorOption2[EditorOption2["peekWidgetDefaultFocus"] = 99] = "peekWidgetDefaultFocus";
  EditorOption2[EditorOption2["placeholder"] = 100] = "placeholder";
  EditorOption2[EditorOption2["definitionLinkOpensInPeek"] = 101] = "definitionLinkOpensInPeek";
  EditorOption2[EditorOption2["quickSuggestions"] = 102] = "quickSuggestions";
  EditorOption2[EditorOption2["quickSuggestionsDelay"] = 103] = "quickSuggestionsDelay";
  EditorOption2[EditorOption2["readOnly"] = 104] = "readOnly";
  EditorOption2[EditorOption2["readOnlyMessage"] = 105] = "readOnlyMessage";
  EditorOption2[EditorOption2["renameOnType"] = 106] = "renameOnType";
  EditorOption2[EditorOption2["renderRichScreenReaderContent"] = 107] = "renderRichScreenReaderContent";
  EditorOption2[EditorOption2["renderControlCharacters"] = 108] = "renderControlCharacters";
  EditorOption2[EditorOption2["renderFinalNewline"] = 109] = "renderFinalNewline";
  EditorOption2[EditorOption2["renderLineHighlight"] = 110] = "renderLineHighlight";
  EditorOption2[EditorOption2["renderLineHighlightOnlyWhenFocus"] = 111] = "renderLineHighlightOnlyWhenFocus";
  EditorOption2[EditorOption2["renderValidationDecorations"] = 112] = "renderValidationDecorations";
  EditorOption2[EditorOption2["renderWhitespace"] = 113] = "renderWhitespace";
  EditorOption2[EditorOption2["revealHorizontalRightPadding"] = 114] = "revealHorizontalRightPadding";
  EditorOption2[EditorOption2["roundedSelection"] = 115] = "roundedSelection";
  EditorOption2[EditorOption2["rulers"] = 116] = "rulers";
  EditorOption2[EditorOption2["scrollbar"] = 117] = "scrollbar";
  EditorOption2[EditorOption2["scrollBeyondLastColumn"] = 118] = "scrollBeyondLastColumn";
  EditorOption2[EditorOption2["scrollBeyondLastLine"] = 119] = "scrollBeyondLastLine";
  EditorOption2[EditorOption2["scrollPredominantAxis"] = 120] = "scrollPredominantAxis";
  EditorOption2[EditorOption2["selectionClipboard"] = 121] = "selectionClipboard";
  EditorOption2[EditorOption2["selectionHighlight"] = 122] = "selectionHighlight";
  EditorOption2[EditorOption2["selectionHighlightMaxLength"] = 123] = "selectionHighlightMaxLength";
  EditorOption2[EditorOption2["selectionHighlightMultiline"] = 124] = "selectionHighlightMultiline";
  EditorOption2[EditorOption2["selectOnLineNumbers"] = 125] = "selectOnLineNumbers";
  EditorOption2[EditorOption2["showFoldingControls"] = 126] = "showFoldingControls";
  EditorOption2[EditorOption2["showUnused"] = 127] = "showUnused";
  EditorOption2[EditorOption2["snippetSuggestions"] = 128] = "snippetSuggestions";
  EditorOption2[EditorOption2["smartSelect"] = 129] = "smartSelect";
  EditorOption2[EditorOption2["smoothScrolling"] = 130] = "smoothScrolling";
  EditorOption2[EditorOption2["stickyScroll"] = 131] = "stickyScroll";
  EditorOption2[EditorOption2["stickyTabStops"] = 132] = "stickyTabStops";
  EditorOption2[EditorOption2["stopRenderingLineAfter"] = 133] = "stopRenderingLineAfter";
  EditorOption2[EditorOption2["suggest"] = 134] = "suggest";
  EditorOption2[EditorOption2["suggestFontSize"] = 135] = "suggestFontSize";
  EditorOption2[EditorOption2["suggestLineHeight"] = 136] = "suggestLineHeight";
  EditorOption2[EditorOption2["suggestOnTriggerCharacters"] = 137] = "suggestOnTriggerCharacters";
  EditorOption2[EditorOption2["suggestSelection"] = 138] = "suggestSelection";
  EditorOption2[EditorOption2["tabCompletion"] = 139] = "tabCompletion";
  EditorOption2[EditorOption2["tabIndex"] = 140] = "tabIndex";
  EditorOption2[EditorOption2["trimWhitespaceOnDelete"] = 141] = "trimWhitespaceOnDelete";
  EditorOption2[EditorOption2["unicodeHighlighting"] = 142] = "unicodeHighlighting";
  EditorOption2[EditorOption2["unusualLineTerminators"] = 143] = "unusualLineTerminators";
  EditorOption2[EditorOption2["useShadowDOM"] = 144] = "useShadowDOM";
  EditorOption2[EditorOption2["useTabStops"] = 145] = "useTabStops";
  EditorOption2[EditorOption2["wordBreak"] = 146] = "wordBreak";
  EditorOption2[EditorOption2["wordSegmenterLocales"] = 147] = "wordSegmenterLocales";
  EditorOption2[EditorOption2["wordSeparators"] = 148] = "wordSeparators";
  EditorOption2[EditorOption2["wordWrap"] = 149] = "wordWrap";
  EditorOption2[EditorOption2["wordWrapBreakAfterCharacters"] = 150] = "wordWrapBreakAfterCharacters";
  EditorOption2[EditorOption2["wordWrapBreakBeforeCharacters"] = 151] = "wordWrapBreakBeforeCharacters";
  EditorOption2[EditorOption2["wordWrapColumn"] = 152] = "wordWrapColumn";
  EditorOption2[EditorOption2["wordWrapOverride1"] = 153] = "wordWrapOverride1";
  EditorOption2[EditorOption2["wordWrapOverride2"] = 154] = "wordWrapOverride2";
  EditorOption2[EditorOption2["wrappingIndent"] = 155] = "wrappingIndent";
  EditorOption2[EditorOption2["wrappingStrategy"] = 156] = "wrappingStrategy";
  EditorOption2[EditorOption2["showDeprecated"] = 157] = "showDeprecated";
  EditorOption2[EditorOption2["inertialScroll"] = 158] = "inertialScroll";
  EditorOption2[EditorOption2["inlayHints"] = 159] = "inlayHints";
  EditorOption2[EditorOption2["wrapOnEscapedLineFeeds"] = 160] = "wrapOnEscapedLineFeeds";
  EditorOption2[EditorOption2["effectiveCursorStyle"] = 161] = "effectiveCursorStyle";
  EditorOption2[EditorOption2["editorClassName"] = 162] = "editorClassName";
  EditorOption2[EditorOption2["pixelRatio"] = 163] = "pixelRatio";
  EditorOption2[EditorOption2["tabFocusMode"] = 164] = "tabFocusMode";
  EditorOption2[EditorOption2["layoutInfo"] = 165] = "layoutInfo";
  EditorOption2[EditorOption2["wrappingInfo"] = 166] = "wrappingInfo";
  EditorOption2[EditorOption2["defaultColorDecorators"] = 167] = "defaultColorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsActivatedOn"] = 168] = "colorDecoratorsActivatedOn";
  EditorOption2[EditorOption2["inlineCompletionsAccessibilityVerbose"] = 169] = "inlineCompletionsAccessibilityVerbose";
  EditorOption2[EditorOption2["effectiveEditContext"] = 170] = "effectiveEditContext";
  EditorOption2[EditorOption2["scrollOnMiddleClick"] = 171] = "scrollOnMiddleClick";
  EditorOption2[EditorOption2["effectiveAllowVariableFonts"] = 172] = "effectiveAllowVariableFonts";
  EditorOption2[EditorOption2["doubleClickSelectsBlock"] = 173] = "doubleClickSelectsBlock";
  return EditorOption2;
})(EditorOption || {});
const EditorOptions = {
  acceptSuggestionOnCommitCharacter: register(new EditorBooleanOption(
    0 /* acceptSuggestionOnCommitCharacter */,
    "acceptSuggestionOnCommitCharacter",
    true,
    { markdownDescription: nls.localize("acceptSuggestionOnCommitCharacter", "Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.") }
  )),
  acceptSuggestionOnEnter: register(new EditorStringEnumOption(
    1 /* acceptSuggestionOnEnter */,
    "acceptSuggestionOnEnter",
    "on",
    ["on", "smart", "off"],
    {
      markdownEnumDescriptions: [
        "",
        nls.localize("acceptSuggestionOnEnterSmart", "Only accept a suggestion with `Enter` when it makes a textual change."),
        ""
      ],
      markdownDescription: nls.localize("acceptSuggestionOnEnter", "Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.")
    }
  )),
  accessibilitySupport: register(new EditorAccessibilitySupport()),
  accessibilityPageSize: register(new EditorIntOption(
    3 /* accessibilityPageSize */,
    "accessibilityPageSize",
    500,
    1,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      description: nls.localize("accessibilityPageSize", "Controls the number of lines in the editor that can be read out by a screen reader at once. When we detect a screen reader we automatically set the default to be 500. Warning: this has a performance implication for numbers larger than the default."),
      tags: ["accessibility"]
    }
  )),
  allowOverflow: register(new EditorBooleanOption(
    4 /* allowOverflow */,
    "allowOverflow",
    true
  )),
  allowVariableLineHeights: register(new EditorBooleanOption(
    5 /* allowVariableLineHeights */,
    "allowVariableLineHeights",
    true,
    {
      description: nls.localize("allowVariableLineHeights", "Controls whether to allow using variable line heights in the editor.")
    }
  )),
  allowVariableFonts: register(new EditorBooleanOption(
    6 /* allowVariableFonts */,
    "allowVariableFonts",
    true,
    {
      description: nls.localize("allowVariableFonts", "Controls whether to allow using variable fonts in the editor.")
    }
  )),
  allowVariableFontsInAccessibilityMode: register(new EditorBooleanOption(
    7 /* allowVariableFontsInAccessibilityMode */,
    "allowVariableFontsInAccessibilityMode",
    false,
    {
      description: nls.localize("allowVariableFontsInAccessibilityMode", "Controls whether to allow using variable fonts in the editor in the accessibility mode."),
      tags: ["accessibility"]
    }
  )),
  ariaLabel: register(new EditorStringOption(
    8 /* ariaLabel */,
    "ariaLabel",
    nls.localize("editorViewAccessibleLabel", "Editor content")
  )),
  ariaRequired: register(new EditorBooleanOption(
    9 /* ariaRequired */,
    "ariaRequired",
    false,
    void 0
  )),
  screenReaderAnnounceInlineSuggestion: register(new EditorBooleanOption(
    12 /* screenReaderAnnounceInlineSuggestion */,
    "screenReaderAnnounceInlineSuggestion",
    true,
    {
      description: nls.localize("screenReaderAnnounceInlineSuggestion", "Control whether inline suggestions are announced by a screen reader."),
      tags: ["accessibility"]
    }
  )),
  autoClosingBrackets: register(new EditorStringEnumOption(
    10 /* autoClosingBrackets */,
    "autoClosingBrackets",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingBrackets.languageDefined", "Use language configurations to determine when to autoclose brackets."),
        nls.localize("editor.autoClosingBrackets.beforeWhitespace", "Autoclose brackets only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingBrackets", "Controls whether the editor should automatically close brackets after the user adds an opening bracket.")
    }
  )),
  autoClosingComments: register(new EditorStringEnumOption(
    11 /* autoClosingComments */,
    "autoClosingComments",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingComments.languageDefined", "Use language configurations to determine when to autoclose comments."),
        nls.localize("editor.autoClosingComments.beforeWhitespace", "Autoclose comments only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingComments", "Controls whether the editor should automatically close comments after the user adds an opening comment.")
    }
  )),
  autoClosingDelete: register(new EditorStringEnumOption(
    13 /* autoClosingDelete */,
    "autoClosingDelete",
    "auto",
    ["always", "auto", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingDelete.auto", "Remove adjacent closing quotes or brackets only if they were automatically inserted."),
        ""
      ],
      description: nls.localize("autoClosingDelete", "Controls whether the editor should remove adjacent closing quotes or brackets when deleting.")
    }
  )),
  autoClosingOvertype: register(new EditorStringEnumOption(
    14 /* autoClosingOvertype */,
    "autoClosingOvertype",
    "auto",
    ["always", "auto", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingOvertype.auto", "Type over closing quotes or brackets only if they were automatically inserted."),
        ""
      ],
      description: nls.localize("autoClosingOvertype", "Controls whether the editor should type over closing quotes or brackets.")
    }
  )),
  autoClosingQuotes: register(new EditorStringEnumOption(
    15 /* autoClosingQuotes */,
    "autoClosingQuotes",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingQuotes.languageDefined", "Use language configurations to determine when to autoclose quotes."),
        nls.localize("editor.autoClosingQuotes.beforeWhitespace", "Autoclose quotes only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingQuotes", "Controls whether the editor should automatically close quotes after the user adds an opening quote.")
    }
  )),
  autoIndent: register(new EditorEnumOption(
    16 /* autoIndent */,
    "autoIndent",
    4 /* Full */,
    "full",
    ["none", "keep", "brackets", "advanced", "full"],
    _autoIndentFromString,
    {
      enumDescriptions: [
        nls.localize("editor.autoIndent.none", "The editor will not insert indentation automatically."),
        nls.localize("editor.autoIndent.keep", "The editor will keep the current line's indentation."),
        nls.localize("editor.autoIndent.brackets", "The editor will keep the current line's indentation and honor language defined brackets."),
        nls.localize("editor.autoIndent.advanced", "The editor will keep the current line's indentation, honor language defined brackets and invoke special onEnterRules defined by languages."),
        nls.localize("editor.autoIndent.full", "The editor will keep the current line's indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.")
      ],
      description: nls.localize("autoIndent", "Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.")
    }
  )),
  autoIndentOnPaste: register(new EditorBooleanOption(
    17 /* autoIndentOnPaste */,
    "autoIndentOnPaste",
    false,
    { description: nls.localize("autoIndentOnPaste", "Controls whether the editor should automatically auto-indent the pasted content.") }
  )),
  autoIndentOnPasteWithinString: register(new EditorBooleanOption(
    18 /* autoIndentOnPasteWithinString */,
    "autoIndentOnPasteWithinString",
    true,
    { description: nls.localize("autoIndentOnPasteWithinString", "Controls whether the editor should automatically auto-indent the pasted content when pasted within a string. This takes effect when autoIndentOnPaste is true.") }
  )),
  automaticLayout: register(new EditorBooleanOption(
    19 /* automaticLayout */,
    "automaticLayout",
    false
  )),
  autoSurround: register(new EditorStringEnumOption(
    20 /* autoSurround */,
    "autoSurround",
    "languageDefined",
    ["languageDefined", "quotes", "brackets", "never"],
    {
      enumDescriptions: [
        nls.localize("editor.autoSurround.languageDefined", "Use language configurations to determine when to automatically surround selections."),
        nls.localize("editor.autoSurround.quotes", "Surround with quotes but not brackets."),
        nls.localize("editor.autoSurround.brackets", "Surround with brackets but not quotes."),
        ""
      ],
      description: nls.localize("autoSurround", "Controls whether the editor should automatically surround selections when typing quotes or brackets.")
    }
  )),
  bracketPairColorization: register(new BracketPairColorization()),
  bracketPairGuides: register(new GuideOptions()),
  stickyTabStops: register(new EditorBooleanOption(
    132 /* stickyTabStops */,
    "stickyTabStops",
    false,
    { description: nls.localize("stickyTabStops", "Emulate selection behavior of tab characters when using spaces for indentation. Selection will stick to tab stops.") }
  )),
  codeLens: register(new EditorBooleanOption(
    23 /* codeLens */,
    "codeLens",
    true,
    { description: nls.localize("codeLens", "Controls whether the editor shows CodeLens.") }
  )),
  codeLensFontFamily: register(new EditorStringOption(
    24 /* codeLensFontFamily */,
    "codeLensFontFamily",
    "",
    { description: nls.localize("codeLensFontFamily", "Controls the font family for CodeLens.") }
  )),
  codeLensFontSize: register(new EditorIntOption(25 /* codeLensFontSize */, "codeLensFontSize", 0, 0, 100, {
    type: "number",
    default: 0,
    minimum: 0,
    maximum: 100,
    markdownDescription: nls.localize("codeLensFontSize", "Controls the font size in pixels for CodeLens. When set to 0, 90% of `#editor.fontSize#` is used.")
  })),
  colorDecorators: register(new EditorBooleanOption(
    26 /* colorDecorators */,
    "colorDecorators",
    true,
    { description: nls.localize("colorDecorators", "Controls whether the editor should render the inline color decorators and color picker.") }
  )),
  colorDecoratorActivatedOn: register(new EditorStringEnumOption(168 /* colorDecoratorsActivatedOn */, "colorDecoratorsActivatedOn", "clickAndHover", ["clickAndHover", "hover", "click"], {
    enumDescriptions: [
      nls.localize("editor.colorDecoratorActivatedOn.clickAndHover", "Make the color picker appear both on click and hover of the color decorator"),
      nls.localize("editor.colorDecoratorActivatedOn.hover", "Make the color picker appear on hover of the color decorator"),
      nls.localize("editor.colorDecoratorActivatedOn.click", "Make the color picker appear on click of the color decorator")
    ],
    description: nls.localize("colorDecoratorActivatedOn", "Controls the condition to make a color picker appear from a color decorator.")
  })),
  colorDecoratorsLimit: register(new EditorIntOption(
    27 /* colorDecoratorsLimit */,
    "colorDecoratorsLimit",
    500,
    1,
    1e6,
    {
      markdownDescription: nls.localize("colorDecoratorsLimit", "Controls the max number of color decorators that can be rendered in an editor at once.")
    }
  )),
  columnSelection: register(new EditorBooleanOption(
    28 /* columnSelection */,
    "columnSelection",
    false,
    { description: nls.localize("columnSelection", "Enable that the selection with the mouse and keys is doing column selection.") }
  )),
  comments: register(new EditorComments()),
  contextmenu: register(new EditorBooleanOption(
    30 /* contextmenu */,
    "contextmenu",
    true
  )),
  copyWithSyntaxHighlighting: register(new EditorBooleanOption(
    31 /* copyWithSyntaxHighlighting */,
    "copyWithSyntaxHighlighting",
    true,
    { description: nls.localize("copyWithSyntaxHighlighting", "Controls whether syntax highlighting should be copied into the clipboard.") }
  )),
  cursorBlinking: register(new EditorEnumOption(
    32 /* cursorBlinking */,
    "cursorBlinking",
    1 /* Blink */,
    "blink",
    ["blink", "smooth", "phase", "expand", "solid"],
    cursorBlinkingStyleFromString,
    { description: nls.localize("cursorBlinking", "Control the cursor animation style.") }
  )),
  cursorSmoothCaretAnimation: register(new EditorStringEnumOption(
    33 /* cursorSmoothCaretAnimation */,
    "cursorSmoothCaretAnimation",
    "off",
    ["off", "explicit", "on"],
    {
      enumDescriptions: [
        nls.localize("cursorSmoothCaretAnimation.off", "Smooth caret animation is disabled."),
        nls.localize("cursorSmoothCaretAnimation.explicit", "Smooth caret animation is enabled only when the user moves the cursor with an explicit gesture."),
        nls.localize("cursorSmoothCaretAnimation.on", "Smooth caret animation is always enabled.")
      ],
      description: nls.localize("cursorSmoothCaretAnimation", "Controls whether the smooth caret animation should be enabled.")
    }
  )),
  cursorStyle: register(new EditorEnumOption(
    34 /* cursorStyle */,
    "cursorStyle",
    1 /* Line */,
    "line",
    ["line", "block", "underline", "line-thin", "block-outline", "underline-thin"],
    cursorStyleFromString,
    { description: nls.localize("cursorStyle", "Controls the cursor style in insert input mode.") }
  )),
  overtypeCursorStyle: register(new EditorEnumOption(
    92 /* overtypeCursorStyle */,
    "overtypeCursorStyle",
    2 /* Block */,
    "block",
    ["line", "block", "underline", "line-thin", "block-outline", "underline-thin"],
    cursorStyleFromString,
    { description: nls.localize("overtypeCursorStyle", "Controls the cursor style in overtype input mode.") }
  )),
  cursorSurroundingLines: register(new EditorIntOption(
    35 /* cursorSurroundingLines */,
    "cursorSurroundingLines",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("cursorSurroundingLines", "Controls the minimal number of visible leading lines (minimum 0) and trailing lines (minimum 1) surrounding the cursor. Known as 'scrollOff' or 'scrollOffset' in some other editors.") }
  )),
  cursorSurroundingLinesStyle: register(new EditorStringEnumOption(
    36 /* cursorSurroundingLinesStyle */,
    "cursorSurroundingLinesStyle",
    "default",
    ["default", "all"],
    {
      enumDescriptions: [
        nls.localize("cursorSurroundingLinesStyle.default", "`cursorSurroundingLines` is enforced only when triggered via the keyboard or API."),
        nls.localize("cursorSurroundingLinesStyle.all", "`cursorSurroundingLines` is enforced always.")
      ],
      markdownDescription: nls.localize("cursorSurroundingLinesStyle", "Controls when `#editor.cursorSurroundingLines#` should be enforced.")
    }
  )),
  cursorWidth: register(new EditorIntOption(
    37 /* cursorWidth */,
    "cursorWidth",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { markdownDescription: nls.localize("cursorWidth", "Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.") }
  )),
  cursorHeight: register(new EditorIntOption(
    38 /* cursorHeight */,
    "cursorHeight",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { markdownDescription: nls.localize("cursorHeight", "Controls the height of the cursor when `#editor.cursorStyle#` is set to `line`. Cursor's max height depends on line height.") }
  )),
  disableLayerHinting: register(new EditorBooleanOption(
    39 /* disableLayerHinting */,
    "disableLayerHinting",
    false
  )),
  disableMonospaceOptimizations: register(new EditorBooleanOption(
    40 /* disableMonospaceOptimizations */,
    "disableMonospaceOptimizations",
    false
  )),
  domReadOnly: register(new EditorBooleanOption(
    41 /* domReadOnly */,
    "domReadOnly",
    false
  )),
  doubleClickSelectsBlock: register(new EditorBooleanOption(
    173 /* doubleClickSelectsBlock */,
    "doubleClickSelectsBlock",
    true,
    { description: nls.localize("doubleClickSelectsBlock", "Controls whether double-clicking next to a bracket or quote selects the content inside.") }
  )),
  dragAndDrop: register(new EditorBooleanOption(
    42 /* dragAndDrop */,
    "dragAndDrop",
    true,
    { description: nls.localize("dragAndDrop", "Controls whether the editor should allow moving selections via drag and drop.") }
  )),
  emptySelectionClipboard: register(new EditorEmptySelectionClipboard()),
  dropIntoEditor: register(new EditorDropIntoEditor()),
  editContext: register(new EditorBooleanOption(
    44 /* editContext */,
    "editContext",
    true,
    {
      description: nls.localize("editContext", "Sets whether the EditContext API should be used instead of the text area to power input in the editor."),
      included: platform.isChrome || platform.isEdge || platform.isNative
    }
  )),
  renderRichScreenReaderContent: register(new EditorBooleanOption(
    107 /* renderRichScreenReaderContent */,
    "renderRichScreenReaderContent",
    false,
    {
      markdownDescription: nls.localize("renderRichScreenReaderContent", "Whether to render rich screen reader content when the `#editor.editContext#` setting is enabled.")
    }
  )),
  stickyScroll: register(new EditorStickyScroll()),
  experimentalGpuAcceleration: register(new EditorStringEnumOption(
    46 /* experimentalGpuAcceleration */,
    "experimentalGpuAcceleration",
    "off",
    ["off", "on"],
    {
      tags: ["experimental"],
      enumDescriptions: [
        nls.localize("experimentalGpuAcceleration.off", "Use regular DOM-based rendering."),
        nls.localize("experimentalGpuAcceleration.on", "Use GPU acceleration.")
      ],
      description: nls.localize("experimentalGpuAcceleration", "Controls whether to use the experimental GPU acceleration to render the editor.")
    }
  )),
  experimentalWhitespaceRendering: register(new EditorStringEnumOption(
    47 /* experimentalWhitespaceRendering */,
    "experimentalWhitespaceRendering",
    "svg",
    ["svg", "font", "off"],
    {
      enumDescriptions: [
        nls.localize("experimentalWhitespaceRendering.svg", "Use a new rendering method with svgs."),
        nls.localize("experimentalWhitespaceRendering.font", "Use a new rendering method with font characters."),
        nls.localize("experimentalWhitespaceRendering.off", "Use the stable rendering method.")
      ],
      description: nls.localize("experimentalWhitespaceRendering", "Controls whether whitespace is rendered with a new, experimental method.")
    }
  )),
  extraEditorClassName: register(new EditorStringOption(
    48 /* extraEditorClassName */,
    "extraEditorClassName",
    ""
  )),
  fastScrollSensitivity: register(new EditorFloatOption(
    49 /* fastScrollSensitivity */,
    "fastScrollSensitivity",
    5,
    (x) => x <= 0 ? 5 : x,
    { markdownDescription: nls.localize("fastScrollSensitivity", "Scrolling speed multiplier when pressing `Alt`.") }
  )),
  find: register(new EditorFind()),
  fixedOverflowWidgets: register(new EditorBooleanOption(
    51 /* fixedOverflowWidgets */,
    "fixedOverflowWidgets",
    false
  )),
  folding: register(new EditorBooleanOption(
    52 /* folding */,
    "folding",
    true,
    { description: nls.localize("folding", "Controls whether the editor has code folding enabled.") }
  )),
  foldingStrategy: register(new EditorStringEnumOption(
    53 /* foldingStrategy */,
    "foldingStrategy",
    "auto",
    ["auto", "indentation"],
    {
      enumDescriptions: [
        nls.localize("foldingStrategy.auto", "Use a language-specific folding strategy if available, else the indentation-based one."),
        nls.localize("foldingStrategy.indentation", "Use the indentation-based folding strategy.")
      ],
      description: nls.localize("foldingStrategy", "Controls the strategy for computing folding ranges.")
    }
  )),
  foldingHighlight: register(new EditorBooleanOption(
    54 /* foldingHighlight */,
    "foldingHighlight",
    true,
    { description: nls.localize("foldingHighlight", "Controls whether the editor should highlight folded ranges.") }
  )),
  foldingImportsByDefault: register(new EditorBooleanOption(
    55 /* foldingImportsByDefault */,
    "foldingImportsByDefault",
    false,
    { description: nls.localize("foldingImportsByDefault", "Controls whether the editor automatically collapses import ranges.") }
  )),
  foldingMaximumRegions: register(new EditorIntOption(
    56 /* foldingMaximumRegions */,
    "foldingMaximumRegions",
    5e3,
    10,
    65e3,
    // limit must be less than foldingRanges MAX_FOLDING_REGIONS
    { description: nls.localize("foldingMaximumRegions", "The maximum number of foldable regions. Increasing this value may result in the editor becoming less responsive when the current source has a large number of foldable regions.") }
  )),
  unfoldOnClickAfterEndOfLine: register(new EditorBooleanOption(
    57 /* unfoldOnClickAfterEndOfLine */,
    "unfoldOnClickAfterEndOfLine",
    false,
    { description: nls.localize("unfoldOnClickAfterEndOfLine", "Controls whether clicking on the empty content after a folded line will unfold the line.") }
  )),
  fontFamily: register(new EditorStringOption(
    58 /* fontFamily */,
    "fontFamily",
    EDITOR_FONT_DEFAULTS.fontFamily,
    { description: nls.localize("fontFamily", "Controls the font family.") }
  )),
  fontInfo: register(new EditorFontInfo()),
  fontLigatures2: register(new EditorFontLigatures()),
  fontSize: register(new EditorFontSize()),
  fontWeight: register(new EditorFontWeight()),
  fontVariations: register(new EditorFontVariations()),
  formatOnPaste: register(new EditorBooleanOption(
    64 /* formatOnPaste */,
    "formatOnPaste",
    false,
    { description: nls.localize("formatOnPaste", "Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.") }
  )),
  formatOnType: register(new EditorBooleanOption(
    65 /* formatOnType */,
    "formatOnType",
    false,
    { description: nls.localize("formatOnType", "Controls whether the editor should automatically format the line after typing.") }
  )),
  glyphMargin: register(new EditorBooleanOption(
    66 /* glyphMargin */,
    "glyphMargin",
    true,
    { description: nls.localize("glyphMargin", "Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.") }
  )),
  gotoLocation: register(new EditorGoToLocation()),
  hideCursorInOverviewRuler: register(new EditorBooleanOption(
    68 /* hideCursorInOverviewRuler */,
    "hideCursorInOverviewRuler",
    false,
    { description: nls.localize("hideCursorInOverviewRuler", "Controls whether the cursor should be hidden in the overview ruler.") }
  )),
  hover: register(new EditorHover()),
  inDiffEditor: register(new EditorBooleanOption(
    70 /* inDiffEditor */,
    "inDiffEditor",
    false
  )),
  inertialScroll: register(new EditorBooleanOption(
    158 /* inertialScroll */,
    "inertialScroll",
    false,
    { description: nls.localize("inertialScroll", "Make scrolling inertial - mostly useful with touchpad on linux.") }
  )),
  letterSpacing: register(new EditorFloatOption(
    72 /* letterSpacing */,
    "letterSpacing",
    EDITOR_FONT_DEFAULTS.letterSpacing,
    (x) => EditorFloatOption.clamp(x, -5, 20),
    { description: nls.localize("letterSpacing", "Controls the letter spacing in pixels.") }
  )),
  lightbulb: register(new EditorLightbulb()),
  lineDecorationsWidth: register(new EditorLineDecorationsWidth()),
  lineHeight: register(new EditorLineHeight()),
  lineNumbers: register(new EditorRenderLineNumbersOption()),
  lineNumbersMinChars: register(new EditorIntOption(
    77 /* lineNumbersMinChars */,
    "lineNumbersMinChars",
    5,
    1,
    300
  )),
  linkedEditing: register(new EditorBooleanOption(
    78 /* linkedEditing */,
    "linkedEditing",
    false,
    { description: nls.localize("linkedEditing", "Controls whether the editor has linked editing enabled. Depending on the language, related symbols such as HTML tags, are updated while editing.") }
  )),
  links: register(new EditorBooleanOption(
    79 /* links */,
    "links",
    true,
    { description: nls.localize("links", "Controls whether the editor should detect links and make them clickable.") }
  )),
  matchBrackets: register(new EditorStringEnumOption(
    80 /* matchBrackets */,
    "matchBrackets",
    "always",
    ["always", "near", "never"],
    { description: nls.localize("matchBrackets", "Highlight matching brackets.") }
  )),
  minimap: register(new EditorMinimap()),
  mouseStyle: register(new EditorStringEnumOption(
    82 /* mouseStyle */,
    "mouseStyle",
    "text",
    ["text", "default", "copy"]
  )),
  mouseWheelScrollSensitivity: register(new EditorFloatOption(
    83 /* mouseWheelScrollSensitivity */,
    "mouseWheelScrollSensitivity",
    1,
    (x) => x === 0 ? 1 : x,
    { markdownDescription: nls.localize("mouseWheelScrollSensitivity", "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.") }
  )),
  mouseWheelZoom: register(new EditorBooleanOption(
    84 /* mouseWheelZoom */,
    "mouseWheelZoom",
    false,
    {
      markdownDescription: platform.isMacintosh ? nls.localize("mouseWheelZoom.mac", "Zoom the font of the editor when using mouse wheel and holding `Cmd`.") : nls.localize("mouseWheelZoom", "Zoom the font of the editor when using mouse wheel and holding `Ctrl`.")
    }
  )),
  multiCursorMergeOverlapping: register(new EditorBooleanOption(
    85 /* multiCursorMergeOverlapping */,
    "multiCursorMergeOverlapping",
    true,
    { description: nls.localize("multiCursorMergeOverlapping", "Merge multiple cursors when they are overlapping.") }
  )),
  multiCursorModifier: register(new EditorEnumOption(
    86 /* multiCursorModifier */,
    "multiCursorModifier",
    "altKey",
    "alt",
    ["ctrlCmd", "alt"],
    _multiCursorModifierFromString,
    {
      markdownEnumDescriptions: [
        nls.localize("multiCursorModifier.ctrlCmd", "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
        nls.localize("multiCursorModifier.alt", "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
      ],
      markdownDescription: nls.localize({
        key: "multiCursorModifier",
        comment: [
          "- `ctrlCmd` refers to a value the setting can take and should not be localized.",
          "- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized."
        ]
      }, "The modifier to be used to add multiple cursors with the mouse. The Go to Definition and Open Link mouse gestures will adapt such that they do not conflict with the [multicursor modifier](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).")
    }
  )),
  mouseMiddleClickAction: register(new EditorStringEnumOption(
    87 /* mouseMiddleClickAction */,
    "mouseMiddleClickAction",
    "default",
    ["default", "openLink", "ctrlLeftClick"],
    { description: nls.localize("mouseMiddleClickAction", "Controls what happens when middle mouse button is clicked in the editor.") }
  )),
  multiCursorPaste: register(new EditorStringEnumOption(
    88 /* multiCursorPaste */,
    "multiCursorPaste",
    "spread",
    ["spread", "full"],
    {
      markdownEnumDescriptions: [
        nls.localize("multiCursorPaste.spread", "Each cursor pastes a single line of the text."),
        nls.localize("multiCursorPaste.full", "Each cursor pastes the full text.")
      ],
      markdownDescription: nls.localize("multiCursorPaste", "Controls pasting when the line count of the pasted text matches the cursor count.")
    }
  )),
  multiCursorLimit: register(new EditorIntOption(
    89 /* multiCursorLimit */,
    "multiCursorLimit",
    1e4,
    1,
    1e5,
    {
      markdownDescription: nls.localize("multiCursorLimit", "Controls the max number of cursors that can be in an active editor at once.")
    }
  )),
  occurrencesHighlight: register(new EditorStringEnumOption(
    90 /* occurrencesHighlight */,
    "occurrencesHighlight",
    "singleFile",
    ["off", "singleFile", "multiFile"],
    {
      markdownEnumDescriptions: [
        nls.localize("occurrencesHighlight.off", "Does not highlight occurrences."),
        nls.localize("occurrencesHighlight.singleFile", "Highlights occurrences only in the current file."),
        nls.localize("occurrencesHighlight.multiFile", "Experimental: Highlights occurrences across all valid open files.")
      ],
      markdownDescription: nls.localize("occurrencesHighlight", "Controls whether occurrences should be highlighted across open files.")
    }
  )),
  occurrencesHighlightDelay: register(new EditorIntOption(
    91 /* occurrencesHighlightDelay */,
    "occurrencesHighlightDelay",
    0,
    0,
    2e3,
    {
      description: nls.localize("occurrencesHighlightDelay", "Controls the delay in milliseconds after which occurrences are highlighted."),
      tags: ["preview"]
    }
  )),
  overtypeOnPaste: register(new EditorBooleanOption(
    93 /* overtypeOnPaste */,
    "overtypeOnPaste",
    true,
    { description: nls.localize("overtypeOnPaste", "Controls whether pasting should overtype.") }
  )),
  overviewRulerBorder: register(new EditorBooleanOption(
    94 /* overviewRulerBorder */,
    "overviewRulerBorder",
    true,
    { description: nls.localize("overviewRulerBorder", "Controls whether a border should be drawn around the overview ruler.") }
  )),
  overviewRulerLanes: register(new EditorIntOption(
    95 /* overviewRulerLanes */,
    "overviewRulerLanes",
    3,
    0,
    3
  )),
  padding: register(new EditorPadding()),
  pasteAs: register(new EditorPasteAs()),
  parameterHints: register(new EditorParameterHints()),
  peekWidgetDefaultFocus: register(new EditorStringEnumOption(
    99 /* peekWidgetDefaultFocus */,
    "peekWidgetDefaultFocus",
    "tree",
    ["tree", "editor"],
    {
      enumDescriptions: [
        nls.localize("peekWidgetDefaultFocus.tree", "Focus the tree when opening peek"),
        nls.localize("peekWidgetDefaultFocus.editor", "Focus the editor when opening peek")
      ],
      description: nls.localize("peekWidgetDefaultFocus", "Controls whether to focus the inline editor or the tree in the peek widget.")
    }
  )),
  placeholder: register(new PlaceholderOption()),
  definitionLinkOpensInPeek: register(new EditorBooleanOption(
    101 /* definitionLinkOpensInPeek */,
    "definitionLinkOpensInPeek",
    false,
    { description: nls.localize("definitionLinkOpensInPeek", "Controls whether the Go to Definition mouse gesture always opens the peek widget.") }
  )),
  quickSuggestions: register(new EditorQuickSuggestions()),
  quickSuggestionsDelay: register(new EditorIntOption(
    103 /* quickSuggestionsDelay */,
    "quickSuggestionsDelay",
    10,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      description: nls.localize("quickSuggestionsDelay", "Controls the delay in milliseconds after which quick suggestions will show up."),
      experiment: {
        mode: "auto"
      }
    }
  )),
  readOnly: register(new EditorBooleanOption(
    104 /* readOnly */,
    "readOnly",
    false
  )),
  readOnlyMessage: register(new ReadonlyMessage()),
  renameOnType: register(new EditorBooleanOption(
    106 /* renameOnType */,
    "renameOnType",
    false,
    { description: nls.localize("renameOnType", "Controls whether the editor auto renames on type."), markdownDeprecationMessage: nls.localize("renameOnTypeDeprecate", "Deprecated, use `#editor.linkedEditing#` instead.") }
  )),
  renderControlCharacters: register(new EditorBooleanOption(
    108 /* renderControlCharacters */,
    "renderControlCharacters",
    true,
    { description: nls.localize("renderControlCharacters", "Controls whether the editor should render control characters."), restricted: true }
  )),
  renderFinalNewline: register(new EditorStringEnumOption(
    109 /* renderFinalNewline */,
    "renderFinalNewline",
    platform.isLinux ? "dimmed" : "on",
    ["off", "on", "dimmed"],
    { description: nls.localize("renderFinalNewline", "Render last line number when the file ends with a newline.") }
  )),
  renderLineHighlight: register(new EditorStringEnumOption(
    110 /* renderLineHighlight */,
    "renderLineHighlight",
    "line",
    ["none", "gutter", "line", "all"],
    {
      enumDescriptions: [
        "",
        "",
        "",
        nls.localize("renderLineHighlight.all", "Highlights both the gutter and the current line.")
      ],
      description: nls.localize("renderLineHighlight", "Controls how the editor should render the current line highlight.")
    }
  )),
  renderLineHighlightOnlyWhenFocus: register(new EditorBooleanOption(
    111 /* renderLineHighlightOnlyWhenFocus */,
    "renderLineHighlightOnlyWhenFocus",
    false,
    { description: nls.localize("renderLineHighlightOnlyWhenFocus", "Controls if the editor should render the current line highlight only when the editor is focused.") }
  )),
  renderValidationDecorations: register(new EditorStringEnumOption(
    112 /* renderValidationDecorations */,
    "renderValidationDecorations",
    "editable",
    ["editable", "on", "off"]
  )),
  renderWhitespace: register(new EditorStringEnumOption(
    113 /* renderWhitespace */,
    "renderWhitespace",
    "selection",
    ["none", "boundary", "selection", "trailing", "all"],
    {
      enumDescriptions: [
        "",
        nls.localize("renderWhitespace.boundary", "Render whitespace characters except for single spaces between words."),
        nls.localize("renderWhitespace.selection", "Render whitespace characters only on selected text."),
        nls.localize("renderWhitespace.trailing", "Render only trailing whitespace characters."),
        ""
      ],
      description: nls.localize("renderWhitespace", "Controls how the editor should render whitespace characters.")
    }
  )),
  revealHorizontalRightPadding: register(new EditorIntOption(
    114 /* revealHorizontalRightPadding */,
    "revealHorizontalRightPadding",
    15,
    0,
    1e3
  )),
  roundedSelection: register(new EditorBooleanOption(
    115 /* roundedSelection */,
    "roundedSelection",
    true,
    { description: nls.localize("roundedSelection", "Controls whether selections should have rounded corners.") }
  )),
  rulers: register(new EditorRulers()),
  scrollbar: register(new EditorScrollbar()),
  scrollBeyondLastColumn: register(new EditorIntOption(
    118 /* scrollBeyondLastColumn */,
    "scrollBeyondLastColumn",
    4,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("scrollBeyondLastColumn", "Controls the number of extra characters beyond which the editor will scroll horizontally.") }
  )),
  scrollBeyondLastLine: register(new EditorBooleanOption(
    119 /* scrollBeyondLastLine */,
    "scrollBeyondLastLine",
    true,
    { description: nls.localize("scrollBeyondLastLine", "Controls whether the editor will scroll beyond the last line.") }
  )),
  scrollOnMiddleClick: register(new EditorBooleanOption(
    171 /* scrollOnMiddleClick */,
    "scrollOnMiddleClick",
    false,
    { description: nls.localize("scrollOnMiddleClick", "Controls whether the editor will scroll when the middle button is pressed.") }
  )),
  scrollPredominantAxis: register(new EditorBooleanOption(
    120 /* scrollPredominantAxis */,
    "scrollPredominantAxis",
    true,
    { description: nls.localize("scrollPredominantAxis", "Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad.") }
  )),
  selectionClipboard: register(new EditorBooleanOption(
    121 /* selectionClipboard */,
    "selectionClipboard",
    true,
    {
      description: nls.localize("selectionClipboard", "Controls whether the Linux primary clipboard should be supported."),
      included: platform.isLinux
    }
  )),
  selectionHighlight: register(new EditorBooleanOption(
    122 /* selectionHighlight */,
    "selectionHighlight",
    true,
    { description: nls.localize("selectionHighlight", "Controls whether the editor should highlight matches similar to the selection.") }
  )),
  selectionHighlightMaxLength: register(new EditorIntOption(
    123 /* selectionHighlightMaxLength */,
    "selectionHighlightMaxLength",
    200,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("selectionHighlightMaxLength", "Controls how many characters can be in the selection before similiar matches are not highlighted. Set to zero for unlimited.") }
  )),
  selectionHighlightMultiline: register(new EditorBooleanOption(
    124 /* selectionHighlightMultiline */,
    "selectionHighlightMultiline",
    false,
    { description: nls.localize("selectionHighlightMultiline", "Controls whether the editor should highlight selection matches that span multiple lines.") }
  )),
  selectOnLineNumbers: register(new EditorBooleanOption(
    125 /* selectOnLineNumbers */,
    "selectOnLineNumbers",
    true
  )),
  showFoldingControls: register(new EditorStringEnumOption(
    126 /* showFoldingControls */,
    "showFoldingControls",
    "mouseover",
    ["always", "never", "mouseover"],
    {
      enumDescriptions: [
        nls.localize("showFoldingControls.always", "Always show the folding controls."),
        nls.localize("showFoldingControls.never", "Never show the folding controls and reduce the gutter size."),
        nls.localize("showFoldingControls.mouseover", "Only show the folding controls when the mouse is over the gutter.")
      ],
      description: nls.localize("showFoldingControls", "Controls when the folding controls on the gutter are shown.")
    }
  )),
  showUnused: register(new EditorBooleanOption(
    127 /* showUnused */,
    "showUnused",
    true,
    { description: nls.localize("showUnused", "Controls fading out of unused code.") }
  )),
  showDeprecated: register(new EditorBooleanOption(
    157 /* showDeprecated */,
    "showDeprecated",
    true,
    { description: nls.localize("showDeprecated", "Controls strikethrough deprecated variables.") }
  )),
  inlayHints: register(new EditorInlayHints()),
  snippetSuggestions: register(new EditorStringEnumOption(
    128 /* snippetSuggestions */,
    "snippetSuggestions",
    "inline",
    ["top", "bottom", "inline", "none"],
    {
      enumDescriptions: [
        nls.localize("snippetSuggestions.top", "Show snippet suggestions on top of other suggestions."),
        nls.localize("snippetSuggestions.bottom", "Show snippet suggestions below other suggestions."),
        nls.localize("snippetSuggestions.inline", "Show snippets suggestions with other suggestions."),
        nls.localize("snippetSuggestions.none", "Do not show snippet suggestions.")
      ],
      description: nls.localize("snippetSuggestions", "Controls whether snippets are shown with other suggestions and how they are sorted.")
    }
  )),
  smartSelect: register(new SmartSelect()),
  smoothScrolling: register(new EditorBooleanOption(
    130 /* smoothScrolling */,
    "smoothScrolling",
    false,
    { description: nls.localize("smoothScrolling", "Controls whether the editor will scroll using an animation.") }
  )),
  stopRenderingLineAfter: register(new EditorIntOption(
    133 /* stopRenderingLineAfter */,
    "stopRenderingLineAfter",
    1e4,
    -1,
    Constants.MAX_SAFE_SMALL_INTEGER
  )),
  suggest: register(new EditorSuggest()),
  inlineSuggest: register(new InlineEditorSuggest()),
  inlineCompletionsAccessibilityVerbose: register(new EditorBooleanOption(
    169 /* inlineCompletionsAccessibilityVerbose */,
    "inlineCompletionsAccessibilityVerbose",
    false,
    { description: nls.localize("inlineCompletionsAccessibilityVerbose", "Controls whether the accessibility hint should be provided to screen reader users when an inline completion is shown.") }
  )),
  suggestFontSize: register(new EditorIntOption(
    135 /* suggestFontSize */,
    "suggestFontSize",
    0,
    0,
    1e3,
    { markdownDescription: nls.localize("suggestFontSize", "Font size for the suggest widget. When set to {0}, the value of {1} is used.", "`0`", "`#editor.fontSize#`") }
  )),
  suggestLineHeight: register(new EditorIntOption(
    136 /* suggestLineHeight */,
    "suggestLineHeight",
    0,
    0,
    1e3,
    { markdownDescription: nls.localize("suggestLineHeight", "Line height for the suggest widget. When set to {0}, the value of {1} is used. The minimum value is 8.", "`0`", "`#editor.lineHeight#`") }
  )),
  suggestOnTriggerCharacters: register(new EditorBooleanOption(
    137 /* suggestOnTriggerCharacters */,
    "suggestOnTriggerCharacters",
    true,
    { description: nls.localize("suggestOnTriggerCharacters", "Controls whether suggestions should automatically show up when typing trigger characters.") }
  )),
  suggestSelection: register(new EditorStringEnumOption(
    138 /* suggestSelection */,
    "suggestSelection",
    "first",
    ["first", "recentlyUsed", "recentlyUsedByPrefix"],
    {
      markdownEnumDescriptions: [
        nls.localize("suggestSelection.first", "Always select the first suggestion."),
        nls.localize("suggestSelection.recentlyUsed", "Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently."),
        nls.localize("suggestSelection.recentlyUsedByPrefix", "Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.")
      ],
      description: nls.localize("suggestSelection", "Controls how suggestions are pre-selected when showing the suggest list.")
    }
  )),
  tabCompletion: register(new EditorStringEnumOption(
    139 /* tabCompletion */,
    "tabCompletion",
    "off",
    ["on", "off", "onlySnippets"],
    {
      enumDescriptions: [
        nls.localize("tabCompletion.on", "Tab complete will insert the best matching suggestion when pressing tab."),
        nls.localize("tabCompletion.off", "Disable tab completions."),
        nls.localize("tabCompletion.onlySnippets", "Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled.")
      ],
      description: nls.localize("tabCompletion", "Enables tab completions.")
    }
  )),
  tabIndex: register(new EditorIntOption(
    140 /* tabIndex */,
    "tabIndex",
    0,
    -1,
    Constants.MAX_SAFE_SMALL_INTEGER
  )),
  trimWhitespaceOnDelete: register(new EditorBooleanOption(
    141 /* trimWhitespaceOnDelete */,
    "trimWhitespaceOnDelete",
    false,
    { description: nls.localize("trimWhitespaceOnDelete", "Controls whether the editor will also delete the next line's indentation whitespace when deleting a newline.") }
  )),
  unicodeHighlight: register(new UnicodeHighlight()),
  unusualLineTerminators: register(new EditorStringEnumOption(
    143 /* unusualLineTerminators */,
    "unusualLineTerminators",
    "prompt",
    ["auto", "off", "prompt"],
    {
      enumDescriptions: [
        nls.localize("unusualLineTerminators.auto", "Unusual line terminators are automatically removed."),
        nls.localize("unusualLineTerminators.off", "Unusual line terminators are ignored."),
        nls.localize("unusualLineTerminators.prompt", "Unusual line terminators prompt to be removed.")
      ],
      description: nls.localize("unusualLineTerminators", "Remove unusual line terminators that might cause problems.")
    }
  )),
  useShadowDOM: register(new EditorBooleanOption(
    144 /* useShadowDOM */,
    "useShadowDOM",
    true
  )),
  useTabStops: register(new EditorBooleanOption(
    145 /* useTabStops */,
    "useTabStops",
    true,
    { description: nls.localize("useTabStops", "Spaces and tabs are inserted and deleted in alignment with tab stops.") }
  )),
  wordBreak: register(new EditorStringEnumOption(
    146 /* wordBreak */,
    "wordBreak",
    "normal",
    ["normal", "keepAll"],
    {
      markdownEnumDescriptions: [
        nls.localize("wordBreak.normal", "Use the default line break rule."),
        nls.localize("wordBreak.keepAll", "Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behavior is the same as for normal.")
      ],
      description: nls.localize("wordBreak", "Controls the word break rules used for Chinese/Japanese/Korean (CJK) text.")
    }
  )),
  wordSegmenterLocales: register(new WordSegmenterLocales()),
  wordSeparators: register(new EditorStringOption(
    148 /* wordSeparators */,
    "wordSeparators",
    USUAL_WORD_SEPARATORS,
    { description: nls.localize("wordSeparators", "Characters that will be used as word separators when doing word related navigations or operations.") }
  )),
  wordWrap: register(new EditorStringEnumOption(
    149 /* wordWrap */,
    "wordWrap",
    "off",
    ["off", "on", "wordWrapColumn", "bounded"],
    {
      markdownEnumDescriptions: [
        nls.localize("wordWrap.off", "Lines will never wrap."),
        nls.localize("wordWrap.on", "Lines will wrap at the viewport width."),
        nls.localize({
          key: "wordWrap.wordWrapColumn",
          comment: [
            "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
          ]
        }, "Lines will wrap at `#editor.wordWrapColumn#`."),
        nls.localize({
          key: "wordWrap.bounded",
          comment: [
            "- viewport means the edge of the visible window size.",
            "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
          ]
        }, "Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.")
      ],
      description: nls.localize({
        key: "wordWrap",
        comment: [
          "- 'off', 'on', 'wordWrapColumn' and 'bounded' refer to values the setting can take and should not be localized.",
          "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
        ]
      }, "Controls how lines should wrap.")
    }
  )),
  wordWrapBreakAfterCharacters: register(new EditorStringOption(
    150 /* wordWrapBreakAfterCharacters */,
    "wordWrapBreakAfterCharacters",
    // allow-any-unicode-next-line
    " 	})]?|/&.,;\xA2\xB0\u2032\u2033\u2030\u2103\u3001\u3002\uFF61\uFF64\uFFE0\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF01\uFF05\u30FB\uFF65\u309D\u309E\u30FD\u30FE\u30FC\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u3095\u3096\u31F0\u31F1\u31F2\u31F3\u31F4\u31F5\u31F6\u31F7\u31F8\u31F9\u31FA\u31FB\u31FC\u31FD\u31FE\u31FF\u3005\u303B\uFF67\uFF68\uFF69\uFF6A\uFF6B\uFF6C\uFF6D\uFF6E\uFF6F\uFF70\u201D\u3009\u300B\u300D\u300F\u3011\u3015\uFF09\uFF3D\uFF5D\uFF63"
  )),
  wordWrapBreakBeforeCharacters: register(new EditorStringOption(
    151 /* wordWrapBreakBeforeCharacters */,
    "wordWrapBreakBeforeCharacters",
    // allow-any-unicode-next-line
    "([{\u2018\u201C\u3008\u300A\u300C\u300E\u3010\u3014\uFF08\uFF3B\uFF5B\uFF62\xA3\xA5\uFF04\uFFE1\uFFE5+\uFF0B"
  )),
  wordWrapColumn: register(new EditorIntOption(
    152 /* wordWrapColumn */,
    "wordWrapColumn",
    80,
    1,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      markdownDescription: nls.localize({
        key: "wordWrapColumn",
        comment: [
          "- `editor.wordWrap` refers to a different setting and should not be localized.",
          "- 'wordWrapColumn' and 'bounded' refer to values the different setting can take and should not be localized."
        ]
      }, "Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.")
    }
  )),
  wordWrapOverride1: register(new EditorStringEnumOption(
    153 /* wordWrapOverride1 */,
    "wordWrapOverride1",
    "inherit",
    ["off", "on", "inherit"]
  )),
  wordWrapOverride2: register(new EditorStringEnumOption(
    154 /* wordWrapOverride2 */,
    "wordWrapOverride2",
    "inherit",
    ["off", "on", "inherit"]
  )),
  wrapOnEscapedLineFeeds: register(new EditorBooleanOption(
    160 /* wrapOnEscapedLineFeeds */,
    "wrapOnEscapedLineFeeds",
    false,
    { markdownDescription: nls.localize("wrapOnEscapedLineFeeds", 'Controls whether literal `\\n` shall trigger a wordWrap when `#editor.wordWrap#` is enabled.\n\nFor example:\n```c\nchar* str="hello\\nworld"\n```\nwill be displayed as\n```c\nchar* str="hello\\n\n           world"\n```') }
  )),
  // Leave these at the end (because they have dependencies!)
  effectiveCursorStyle: register(new EffectiveCursorStyle()),
  editorClassName: register(new EditorClassName()),
  defaultColorDecorators: register(new EditorStringEnumOption(
    167 /* defaultColorDecorators */,
    "defaultColorDecorators",
    "auto",
    ["auto", "always", "never"],
    {
      enumDescriptions: [
        nls.localize("editor.defaultColorDecorators.auto", "Show default color decorators only when no extension provides colors decorators."),
        nls.localize("editor.defaultColorDecorators.always", "Always show default color decorators."),
        nls.localize("editor.defaultColorDecorators.never", "Never show default color decorators.")
      ],
      description: nls.localize("defaultColorDecorators", "Controls whether inline color decorations should be shown using the default document color provider.")
    }
  )),
  pixelRatio: register(new EditorPixelRatio()),
  tabFocusMode: register(new EditorBooleanOption(
    164 /* tabFocusMode */,
    "tabFocusMode",
    false,
    { markdownDescription: nls.localize("tabFocusMode", "Controls whether the editor receives tabs or defers them to the workbench for navigation.") }
  )),
  layoutInfo: register(new EditorLayoutInfoComputer()),
  wrappingInfo: register(new EditorWrappingInfoComputer()),
  wrappingIndent: register(new WrappingIndentOption()),
  wrappingStrategy: register(new WrappingStrategy()),
  effectiveEditContextEnabled: register(new EffectiveEditContextEnabled()),
  effectiveAllowVariableFonts: register(new EffectiveAllowVariableFonts())
};
export {
  ApplyUpdateResult,
  ComputeOptionsMemory,
  ConfigurationChangedEvent,
  EditorAutoIndentStrategy,
  EditorFontLigatures,
  EditorFontVariations,
  EditorLayoutInfoComputer,
  EditorOption,
  EditorOptions,
  MINIMAP_GUTTER_WIDTH,
  RenderLineNumbersType,
  RenderMinimap,
  ShowLightbulbIconMode,
  TextEditorCursorBlinkingStyle,
  TextEditorCursorStyle,
  WrappingIndent,
  boolean,
  clampedFloat,
  clampedInt,
  cursorBlinkingStyleFromString,
  cursorStyleFromString,
  cursorStyleToString,
  editorOptionsRegistry,
  filterFontDecorations,
  filterValidationDecorations,
  inUntrustedWorkspace,
  stringSet,
  unicodeHighlightConfigKeys
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29uZmlnXFxlZGl0b3JPcHRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMsIEZPTlRfVkFSSUFUSU9OX09GRiwgRk9OVF9WQVJJQVRJT05fVFJBTlNMQVRFLCBGb250SW5mbyB9IGZyb20gJy4vZm9udEluZm8uanMnO1xuaW1wb3J0IHsgRURJVE9SX01PREVMX0RFRkFVTFRTIH0gZnJvbSAnLi4vY29yZS9taXNjL3RleHRNb2RlbERlZmF1bHRzLmpzJztcbmltcG9ydCB7IFVTVUFMX1dPUkRfU0VQQVJBVE9SUyB9IGZyb20gJy4uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTdXBwb3J0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcblxuLy8jcmVnaW9uIHR5cGVkIG9wdGlvbnNcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGF1dG8gY2xvc2luZyBxdW90ZXMgYW5kIGJyYWNrZXRzXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckF1dG9DbG9zaW5nU3RyYXRlZ3kgPSAnYWx3YXlzJyB8ICdsYW5ndWFnZURlZmluZWQnIHwgJ2JlZm9yZVdoaXRlc3BhY2UnIHwgJ25ldmVyJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGF1dG8gd3JhcHBpbmcgcXVvdGVzIGFuZCBicmFja2V0c1xuICovXG5leHBvcnQgdHlwZSBFZGl0b3JBdXRvU3Vycm91bmRTdHJhdGVneSA9ICdsYW5ndWFnZURlZmluZWQnIHwgJ3F1b3RlcycgfCAnYnJhY2tldHMnIHwgJ25ldmVyJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHR5cGluZyBvdmVyIGNsb3NpbmcgcXVvdGVzIG9yIGJyYWNrZXRzXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckF1dG9DbG9zaW5nRWRpdFN0cmF0ZWd5ID0gJ2Fsd2F5cycgfCAnYXV0bycgfCAnbmV2ZXInO1xuXG50eXBlIFVua25vd248VD4gPSB7IFtLIGluIGtleW9mIFRdOiB1bmtub3duIH07XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBhdXRvIGluZGVudGF0aW9uIGluIHRoZSBlZGl0b3JcbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IHtcblx0Tm9uZSA9IDAsXG5cdEtlZXAgPSAxLFxuXHRCcmFja2V0cyA9IDIsXG5cdEFkdmFuY2VkID0gMyxcblx0RnVsbCA9IDRcbn1cblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHRoZSBlZGl0b3IuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvck9wdGlvbnMge1xuXHQvKipcblx0ICogVGhpcyBlZGl0b3IgaXMgdXNlZCBpbnNpZGUgYSBkaWZmIGVkaXRvci5cblx0ICovXG5cdGluRGlmZkVkaXRvcj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGlzIGVkaXRvciBpcyBhbGxvd2VkIHRvIHVzZSB2YXJpYWJsZSBsaW5lIGhlaWdodHMuXG5cdCAqL1xuXHRhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhpcyBlZGl0b3IgaXMgYWxsb3dlZCB0byB1c2UgdmFyaWFibGUgZm9udC1zaXplcyBhbmQgZm9udC1mYW1pbGllc1xuXHQgKi9cblx0YWxsb3dWYXJpYWJsZUZvbnRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoaXMgZWRpdG9yIGlzIGFsbG93ZWQgdG8gdXNlIHZhcmlhYmxlIGZvbnQtc2l6ZXMgYW5kIGZvbnQtZmFtaWxpZXMgaW4gYWNjZXNzaWJpbGl0eSBtb2RlXG5cdCAqL1xuXHRhbGxvd1ZhcmlhYmxlRm9udHNJbkFjY2Vzc2liaWxpdHlNb2RlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBhcmlhIGxhYmVsIGZvciB0aGUgZWRpdG9yJ3MgdGV4dGFyZWEgKHdoZW4gaXQgaXMgZm9jdXNlZCkuXG5cdCAqL1xuXHRhcmlhTGFiZWw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGFyaWEtcmVxdWlyZWQgYXR0cmlidXRlIHNob3VsZCBiZSBzZXQgb24gdGhlIGVkaXRvcnMgdGV4dGFyZWEuXG5cdCAqL1xuXHRhcmlhUmVxdWlyZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB3aGV0aGVyIGEgc2NyZWVuIHJlYWRlciBhbm5vdW5jZXMgaW5saW5lIHN1Z2dlc3Rpb24gY29udGVudCBpbW1lZGlhdGVseS5cblx0ICovXG5cdHNjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgYHRhYmluZGV4YCBwcm9wZXJ0eSBvZiB0aGUgZWRpdG9yJ3MgdGV4dGFyZWFcblx0ICovXG5cdHRhYkluZGV4PzogbnVtYmVyO1xuXHQvKipcblx0ICogUmVuZGVyIHZlcnRpY2FsIGxpbmVzIGF0IHRoZSBzcGVjaWZpZWQgY29sdW1ucy5cblx0ICogRGVmYXVsdHMgdG8gZW1wdHkgYXJyYXkuXG5cdCAqL1xuXHRydWxlcnM/OiAobnVtYmVyIHwgSVJ1bGVyT3B0aW9uKVtdO1xuXHQvKipcblx0ICogTG9jYWxlcyB1c2VkIGZvciBzZWdtZW50aW5nIGxpbmVzIGludG8gd29yZHMgd2hlbiBkb2luZyB3b3JkIHJlbGF0ZWQgbmF2aWdhdGlvbnMgb3Igb3BlcmF0aW9ucy5cblx0ICpcblx0ICogU3BlY2lmeSB0aGUgQkNQIDQ3IGxhbmd1YWdlIHRhZyBvZiB0aGUgd29yZCB5b3Ugd2lzaCB0byByZWNvZ25pemUgKGUuZy4sIGphLCB6aC1DTiwgemgtSGFudC1UVywgZXRjLikuXG5cdCAqIERlZmF1bHRzIHRvIGVtcHR5IGFycmF5XG5cdCAqL1xuXHR3b3JkU2VnbWVudGVyTG9jYWxlcz86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHQvKipcblx0ICogQSBzdHJpbmcgY29udGFpbmluZyB0aGUgd29yZCBzZXBhcmF0b3JzIHVzZWQgd2hlbiBkb2luZyB3b3JkIG5hdmlnYXRpb24uXG5cdCAqIERlZmF1bHRzIHRvIGB+IUAjJCVeJiooKS09K1t7XX1cXFxcfDs6XFwnXCIsLjw+Lz9cblx0ICovXG5cdHdvcmRTZXBhcmF0b3JzPzogc3RyaW5nO1xuXHQvKipcblx0ICogRW5hYmxlIExpbnV4IHByaW1hcnkgY2xpcGJvYXJkLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2VsZWN0aW9uQ2xpcGJvYXJkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIHJlbmRlcmluZyBvZiBsaW5lIG51bWJlcnMuXG5cdCAqIElmIGl0IGlzIGEgZnVuY3Rpb24sIGl0IHdpbGwgYmUgaW52b2tlZCB3aGVuIHJlbmRlcmluZyBhIGxpbmUgbnVtYmVyIGFuZCB0aGUgcmV0dXJuIHZhbHVlIHdpbGwgYmUgcmVuZGVyZWQuXG5cdCAqIE90aGVyd2lzZSwgaWYgaXQgaXMgYSB0cnV0aHksIGxpbmUgbnVtYmVycyB3aWxsIGJlIHJlbmRlcmVkIG5vcm1hbGx5IChlcXVpdmFsZW50IG9mIHVzaW5nIGFuIGlkZW50aXR5IGZ1bmN0aW9uKS5cblx0ICogT3RoZXJ3aXNlLCBsaW5lIG51bWJlcnMgd2lsbCBub3QgYmUgcmVuZGVyZWQuXG5cdCAqIERlZmF1bHRzIHRvIGBvbmAuXG5cdCAqL1xuXHRsaW5lTnVtYmVycz86IExpbmVOdW1iZXJzVHlwZTtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBtaW5pbWFsIG51bWJlciBvZiB2aXNpYmxlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIGxpbmVzIHN1cnJvdW5kaW5nIHRoZSBjdXJzb3IuXG5cdCAqIERlZmF1bHRzIHRvIDAuXG5cdCovXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXM/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGVuIGBjdXJzb3JTdXJyb3VuZGluZ0xpbmVzYCBzaG91bGQgYmUgZW5mb3JjZWRcblx0ICogRGVmYXVsdHMgdG8gYGRlZmF1bHRgLCBgY3Vyc29yU3Vycm91bmRpbmdMaW5lc2AgaXMgbm90IGVuZm9yY2VkIHdoZW4gY3Vyc29yIHBvc2l0aW9uIGlzIGNoYW5nZWRcblx0ICogYnkgbW91c2UuXG5cdCovXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZT86ICdkZWZhdWx0JyB8ICdhbGwnO1xuXHQvKipcblx0ICogUmVuZGVyIGxhc3QgbGluZSBudW1iZXIgd2hlbiB0aGUgZmlsZSBlbmRzIHdpdGggYSBuZXdsaW5lLlxuXHQgKiBEZWZhdWx0cyB0byAnb24nIGZvciBXaW5kb3dzIGFuZCBtYWNPUyBhbmQgJ2RpbW1lZCcgZm9yIExpbnV4LlxuXHQqL1xuXHRyZW5kZXJGaW5hbE5ld2xpbmU/OiAnb24nIHwgJ29mZicgfCAnZGltbWVkJztcblx0LyoqXG5cdCAqIFJlbW92ZSB1bnVzdWFsIGxpbmUgdGVybWluYXRvcnMgbGlrZSBMSU5FIFNFUEFSQVRPUiAoTFMpLCBQQVJBR1JBUEggU0VQQVJBVE9SIChQUykuXG5cdCAqIERlZmF1bHRzIHRvICdwcm9tcHQnLlxuXHQgKi9cblx0dW51c3VhbExpbmVUZXJtaW5hdG9ycz86ICdhdXRvJyB8ICdvZmYnIHwgJ3Byb21wdCc7XG5cdC8qKlxuXHQgKiBTaG91bGQgdGhlIGNvcnJlc3BvbmRpbmcgbGluZSBiZSBzZWxlY3RlZCB3aGVuIGNsaWNraW5nIG9uIHRoZSBsaW5lIG51bWJlcj9cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNlbGVjdE9uTGluZU51bWJlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgd2lkdGggb2YgbGluZSBudW1iZXJzLCBieSByZXNlcnZpbmcgaG9yaXpvbnRhbCBzcGFjZSBmb3IgcmVuZGVyaW5nIGF0IGxlYXN0IGFuIGFtb3VudCBvZiBkaWdpdHMuXG5cdCAqIERlZmF1bHRzIHRvIDUuXG5cdCAqL1xuXHRsaW5lTnVtYmVyc01pbkNoYXJzPzogbnVtYmVyO1xuXHQvKipcblx0ICogRW5hYmxlIHRoZSByZW5kZXJpbmcgb2YgdGhlIGdseXBoIG1hcmdpbi5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZSBpbiB2c2NvZGUgYW5kIHRvIGZhbHNlIGluIG1vbmFjby1lZGl0b3IuXG5cdCAqL1xuXHRnbHlwaE1hcmdpbj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggcmVzZXJ2ZWQgZm9yIGxpbmUgZGVjb3JhdGlvbnMgKGluIHB4KS5cblx0ICogTGluZSBkZWNvcmF0aW9ucyBhcmUgcGxhY2VkIGJldHdlZW4gbGluZSBudW1iZXJzIGFuZCB0aGUgZWRpdG9yIGNvbnRlbnQuXG5cdCAqIFlvdSBjYW4gcGFzcyBpbiBhIHN0cmluZyBpbiB0aGUgZm9ybWF0IGZsb2F0aW5nIHBvaW50IGZvbGxvd2VkIGJ5IFwiY2hcIi4gZS5nLiAxLjNjaC5cblx0ICogRGVmYXVsdHMgdG8gMTAuXG5cdCAqL1xuXHRsaW5lRGVjb3JhdGlvbnNXaWR0aD86IG51bWJlciB8IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gcmV2ZWFsaW5nIHRoZSBjdXJzb3IsIGEgdmlydHVhbCBwYWRkaW5nIChweCkgaXMgYWRkZWQgdG8gdGhlIGN1cnNvciwgdHVybmluZyBpdCBpbnRvIGEgcmVjdGFuZ2xlLlxuXHQgKiBUaGlzIHZpcnR1YWwgcGFkZGluZyBlbnN1cmVzIHRoYXQgdGhlIGN1cnNvciBnZXRzIHJldmVhbGVkIGJlZm9yZSBoaXR0aW5nIHRoZSBlZGdlIG9mIHRoZSB2aWV3cG9ydC5cblx0ICogRGVmYXVsdHMgdG8gMzAgKHB4KS5cblx0ICovXG5cdHJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmc/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIGVkaXRvciBzZWxlY3Rpb24gd2l0aCByb3VuZGVkIGJvcmRlcnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRyb3VuZGVkU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENsYXNzIG5hbWUgdG8gYmUgYWRkZWQgdG8gdGhlIGVkaXRvci5cblx0ICovXG5cdGV4dHJhRWRpdG9yQ2xhc3NOYW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogU2hvdWxkIHRoZSBlZGl0b3IgYmUgcmVhZCBvbmx5LiBTZWUgYWxzbyBgZG9tUmVhZE9ubHlgLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHJlYWRPbmx5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBtZXNzYWdlIHRvIGRpc3BsYXkgd2hlbiB0aGUgZWRpdG9yIGlzIHJlYWRvbmx5LlxuXHQgKi9cblx0cmVhZE9ubHlNZXNzYWdlPzogSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogU2hvdWxkIHRoZSB0ZXh0YXJlYSB1c2VkIGZvciBpbnB1dCB1c2UgdGhlIERPTSBgcmVhZG9ubHlgIGF0dHJpYnV0ZS5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRkb21SZWFkT25seT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgbGlua2VkIGVkaXRpbmcuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0bGlua2VkRWRpdGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBkZXByZWNhdGVkLCB1c2UgbGlua2VkRWRpdGluZyBpbnN0ZWFkXG5cdCAqL1xuXHRyZW5hbWVPblR5cGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdWxkIHRoZSBlZGl0b3IgcmVuZGVyIHZhbGlkYXRpb24gZGVjb3JhdGlvbnMuXG5cdCAqIERlZmF1bHRzIHRvIGVkaXRhYmxlLlxuXHQgKi9cblx0cmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zPzogJ2VkaXRhYmxlJyB8ICdvbicgfCAnb2ZmJztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW9yIGFuZCByZW5kZXJpbmcgb2YgdGhlIHNjcm9sbGJhcnMuXG5cdCAqL1xuXHRzY3JvbGxiYXI/OiBJRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW9yIG9mIHN0aWNreSBzY3JvbGwgb3B0aW9uc1xuXHQgKi9cblx0c3RpY2t5U2Nyb2xsPzogSUVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnM7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBiZWhhdmlvciBhbmQgcmVuZGVyaW5nIG9mIHRoZSBtaW5pbWFwLlxuXHQgKi9cblx0bWluaW1hcD86IElFZGl0b3JNaW5pbWFwT3B0aW9ucztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW9yIG9mIHRoZSBmaW5kIHdpZGdldC5cblx0ICovXG5cdGZpbmQ/OiBJRWRpdG9yRmluZE9wdGlvbnM7XG5cdC8qKlxuXHQgKiBEaXNwbGF5IG92ZXJmbG93IHdpZGdldHMgYXMgYGZpeGVkYC5cblx0ICogRGVmYXVsdHMgdG8gYGZhbHNlYC5cblx0ICovXG5cdGZpeGVkT3ZlcmZsb3dXaWRnZXRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEFsbG93IGNvbnRlbnQgd2lkZ2V0cyBhbmQgb3ZlcmZsb3cgd2lkZ2V0cyB0byBvdmVyZmxvdyB0aGUgZWRpdG9yIHZpZXdwb3J0LlxuXHQgKiBEZWZhdWx0cyB0byBgdHJ1ZWAuXG5cdCAqL1xuXHRhbGxvd092ZXJmbG93PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgdmVydGljYWwgbGFuZXMgdGhlIG92ZXJ2aWV3IHJ1bGVyIHNob3VsZCByZW5kZXIuXG5cdCAqIERlZmF1bHRzIHRvIDMuXG5cdCAqL1xuXHRvdmVydmlld1J1bGVyTGFuZXM/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9scyBpZiBhIGJvcmRlciBzaG91bGQgYmUgZHJhd24gYXJvdW5kIHRoZSBvdmVydmlldyBydWxlci5cblx0ICogRGVmYXVsdHMgdG8gYHRydWVgLlxuXHQgKi9cblx0b3ZlcnZpZXdSdWxlckJvcmRlcj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBjdXJzb3IgYW5pbWF0aW9uIHN0eWxlLCBwb3NzaWJsZSB2YWx1ZXMgYXJlICdibGluaycsICdzbW9vdGgnLCAncGhhc2UnLCAnZXhwYW5kJyBhbmQgJ3NvbGlkJy5cblx0ICogRGVmYXVsdHMgdG8gJ2JsaW5rJy5cblx0ICovXG5cdGN1cnNvckJsaW5raW5nPzogJ2JsaW5rJyB8ICdzbW9vdGgnIHwgJ3BoYXNlJyB8ICdleHBhbmQnIHwgJ3NvbGlkJztcblx0LyoqXG5cdCAqIFpvb20gdGhlIGZvbnQgaW4gdGhlIGVkaXRvciB3aGVuIHVzaW5nIHRoZSBtb3VzZSB3aGVlbCBpbiBjb21iaW5hdGlvbiB3aXRoIGhvbGRpbmcgQ3RybC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRtb3VzZVdoZWVsWm9vbT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBtb3VzZSBwb2ludGVyIHN0eWxlLCBlaXRoZXIgJ3RleHQnIG9yICdkZWZhdWx0JyBvciAnY29weSdcblx0ICogRGVmYXVsdHMgdG8gJ3RleHQnXG5cdCAqL1xuXHRtb3VzZVN0eWxlPzogJ3RleHQnIHwgJ2RlZmF1bHQnIHwgJ2NvcHknO1xuXHQvKipcblx0ICogRW5hYmxlIHNtb290aCBjYXJldCBhbmltYXRpb24uXG5cdCAqIERlZmF1bHRzIHRvICdvZmYnLlxuXHQgKi9cblx0Y3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24/OiAnb2ZmJyB8ICdleHBsaWNpdCcgfCAnb24nO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgY3Vyc29yIHN0eWxlIGluIGluc2VydCBtb2RlLlxuXHQgKiBEZWZhdWx0cyB0byAnbGluZScuXG5cdCAqL1xuXHRjdXJzb3JTdHlsZT86ICdsaW5lJyB8ICdibG9jaycgfCAndW5kZXJsaW5lJyB8ICdsaW5lLXRoaW4nIHwgJ2Jsb2NrLW91dGxpbmUnIHwgJ3VuZGVybGluZS10aGluJztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGN1cnNvciBzdHlsZSBpbiBvdmVydHlwZSBtb2RlLlxuXHQgKiBEZWZhdWx0cyB0byAnYmxvY2snLlxuXHQgKi9cblx0b3ZlcnR5cGVDdXJzb3JTdHlsZT86ICdsaW5lJyB8ICdibG9jaycgfCAndW5kZXJsaW5lJyB8ICdsaW5lLXRoaW4nIHwgJ2Jsb2NrLW91dGxpbmUnIHwgJ3VuZGVybGluZS10aGluJztcblx0LyoqXG5cdCAqICBDb250cm9scyB3aGV0aGVyIHBhc3RlIGluIG92ZXJ0eXBlIG1vZGUgc2hvdWxkIG92ZXJ3cml0ZSBvciBpbnNlcnQuXG5cdCAqL1xuXHRvdmVydHlwZU9uUGFzdGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgd2lkdGggb2YgdGhlIGN1cnNvciB3aGVuIGN1cnNvclN0eWxlIGlzIHNldCB0byAnbGluZSdcblx0ICovXG5cdGN1cnNvcldpZHRoPzogbnVtYmVyO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgaGVpZ2h0IG9mIHRoZSBjdXJzb3Igd2hlbiBjdXJzb3JTdHlsZSBpcyBzZXQgdG8gJ2xpbmUnXG5cdCAqL1xuXHRjdXJzb3JIZWlnaHQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgZm9udCBsaWdhdHVyZXMuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Zm9udExpZ2F0dXJlcz86IGJvb2xlYW4gfCBzdHJpbmc7XG5cdC8qKlxuXHQgKiBFbmFibGUgZm9udCB2YXJpYXRpb25zLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGZvbnRWYXJpYXRpb25zPzogYm9vbGVhbiB8IHN0cmluZztcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gdXNlIGRlZmF1bHQgY29sb3IgZGVjb3JhdGlvbnMgb3Igbm90IHVzaW5nIHRoZSBkZWZhdWx0IGRvY3VtZW50IGNvbG9yIHByb3ZpZGVyXG5cdCAqL1xuXHRkZWZhdWx0Q29sb3JEZWNvcmF0b3JzPzogJ2F1dG8nIHwgJ2Fsd2F5cycgfCAnbmV2ZXInO1xuXHQvKipcblx0ICogRGlzYWJsZSB0aGUgdXNlIG9mIGB0cmFuc2Zvcm06IHRyYW5zbGF0ZTNkKDBweCwgMHB4LCAwcHgpYCBmb3IgdGhlIGVkaXRvciBtYXJnaW4gYW5kIGxpbmVzIGxheWVycy5cblx0ICogVGhlIHVzYWdlIG9mIGB0cmFuc2Zvcm06IHRyYW5zbGF0ZTNkKDBweCwgMHB4LCAwcHgpYCBhY3RzIGFzIGEgaGludCBmb3IgYnJvd3NlcnMgdG8gY3JlYXRlIGFuIGV4dHJhIGxheWVyLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGRpc2FibGVMYXllckhpbnRpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogRGlzYWJsZSB0aGUgb3B0aW1pemF0aW9ucyBmb3IgbW9ub3NwYWNlIGZvbnRzLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3VsZCB0aGUgY3Vyc29yIGJlIGhpZGRlbiBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0aGlkZUN1cnNvckluT3ZlcnZpZXdSdWxlcj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCBzY3JvbGxpbmcgY2FuIGdvIG9uZSBzY3JlZW4gc2l6ZSBhZnRlciB0aGUgbGFzdCBsaW5lLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2Nyb2xsQmV5b25kTGFzdExpbmU/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2Nyb2xsIGVkaXRvciBvbiBtaWRkbGUgY2xpY2tcblx0ICovXG5cdHNjcm9sbE9uTWlkZGxlQ2xpY2s/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHRoYXQgc2Nyb2xsaW5nIGNhbiBnbyBiZXlvbmQgdGhlIGxhc3QgY29sdW1uIGJ5IGEgbnVtYmVyIG9mIGNvbHVtbnMuXG5cdCAqIERlZmF1bHRzIHRvIDUuXG5cdCAqL1xuXHRzY3JvbGxCZXlvbmRMYXN0Q29sdW1uPzogbnVtYmVyO1xuXHQvKipcblx0ICogRW5hYmxlIHRoYXQgdGhlIGVkaXRvciBhbmltYXRlcyBzY3JvbGxpbmcgdG8gYSBwb3NpdGlvbi5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRzbW9vdGhTY3JvbGxpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHRoYXQgdGhlIGVkaXRvciB3aWxsIGluc3RhbGwgYSBSZXNpemVPYnNlcnZlciB0byBjaGVjayBpZiBpdHMgY29udGFpbmVyIGRvbSBub2RlIHNpemUgaGFzIGNoYW5nZWQuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0YXV0b21hdGljTGF5b3V0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIHdyYXBwaW5nIG9mIHRoZSBlZGl0b3IuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwib2ZmXCIsIHRoZSBsaW5lcyB3aWxsIG5ldmVyIHdyYXAuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwib25cIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCB0aGUgdmlld3BvcnQgd2lkdGguXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwid29yZFdyYXBDb2x1bW5cIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCBgd29yZFdyYXBDb2x1bW5gLlxuXHQgKiBXaGVuIGB3b3JkV3JhcGAgPSBcImJvdW5kZWRcIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCBtaW4odmlld3BvcnQgd2lkdGgsIHdvcmRXcmFwQ29sdW1uKS5cblx0ICogRGVmYXVsdHMgdG8gXCJvZmZcIi5cblx0ICovXG5cdHdvcmRXcmFwPzogJ29mZicgfCAnb24nIHwgJ3dvcmRXcmFwQ29sdW1uJyB8ICdib3VuZGVkJztcblx0LyoqXG5cdCAqIE92ZXJyaWRlIHRoZSBgd29yZFdyYXBgIHNldHRpbmcuXG5cdCAqL1xuXHR3b3JkV3JhcE92ZXJyaWRlMT86ICdvZmYnIHwgJ29uJyB8ICdpbmhlcml0Jztcblx0LyoqXG5cdCAqIE92ZXJyaWRlIHRoZSBgd29yZFdyYXBPdmVycmlkZTFgIHNldHRpbmcuXG5cdCAqL1xuXHR3b3JkV3JhcE92ZXJyaWRlMj86ICdvZmYnIHwgJ29uJyB8ICdpbmhlcml0Jztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIHdyYXBwaW5nIG9mIHRoZSBlZGl0b3IuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwib2ZmXCIsIHRoZSBsaW5lcyB3aWxsIG5ldmVyIHdyYXAuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwib25cIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCB0aGUgdmlld3BvcnQgd2lkdGguXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwid29yZFdyYXBDb2x1bW5cIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCBgd29yZFdyYXBDb2x1bW5gLlxuXHQgKiBXaGVuIGB3b3JkV3JhcGAgPSBcImJvdW5kZWRcIiwgdGhlIGxpbmVzIHdpbGwgd3JhcCBhdCBtaW4odmlld3BvcnQgd2lkdGgsIHdvcmRXcmFwQ29sdW1uKS5cblx0ICogRGVmYXVsdHMgdG8gODAuXG5cdCAqL1xuXHR3b3JkV3JhcENvbHVtbj86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2wgaW5kZW50YXRpb24gb2Ygd3JhcHBlZCBsaW5lcy4gQ2FuIGJlOiAnbm9uZScsICdzYW1lJywgJ2luZGVudCcgb3IgJ2RlZXBJbmRlbnQnLlxuXHQgKiBEZWZhdWx0cyB0byAnc2FtZScgaW4gdnNjb2RlIGFuZCB0byAnbm9uZScgaW4gbW9uYWNvLWVkaXRvci5cblx0ICovXG5cdHdyYXBwaW5nSW5kZW50PzogJ25vbmUnIHwgJ3NhbWUnIHwgJ2luZGVudCcgfCAnZGVlcEluZGVudCc7XG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgd3JhcHBpbmcgc3RyYXRlZ3kgdG8gdXNlLlxuXHQgKiBEZWZhdWx0cyB0byAnc2ltcGxlJy5cblx0ICovXG5cdHdyYXBwaW5nU3RyYXRlZ3k/OiAnc2ltcGxlJyB8ICdhZHZhbmNlZCc7XG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBzb2Z0d3JhcCBvbiBldmVyeSBxdW90ZWQgXCJcXG5cIiBsaXRlcmFsLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29uZmlndXJlIHdvcmQgd3JhcHBpbmcgY2hhcmFjdGVycy4gQSBicmVhayB3aWxsIGJlIGludHJvZHVjZWQgYmVmb3JlIHRoZXNlIGNoYXJhY3RlcnMuXG5cdCAqL1xuXHR3b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycz86IHN0cmluZztcblx0LyoqXG5cdCAqIENvbmZpZ3VyZSB3b3JkIHdyYXBwaW5nIGNoYXJhY3RlcnMuIEEgYnJlYWsgd2lsbCBiZSBpbnRyb2R1Y2VkIGFmdGVyIHRoZXNlIGNoYXJhY3RlcnMuXG5cdCAqL1xuXHR3b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzPzogc3RyaW5nO1xuXHQvKipcblx0ICogU2V0cyB3aGV0aGVyIGxpbmUgYnJlYWtzIGFwcGVhciB3aGVyZXZlciB0aGUgdGV4dCB3b3VsZCBvdGhlcndpc2Ugb3ZlcmZsb3cgaXRzIGNvbnRlbnQgYm94LlxuXHQgKiBXaGVuIHdvcmRCcmVhayA9ICdub3JtYWwnLCBVc2UgdGhlIGRlZmF1bHQgbGluZSBicmVhayBydWxlLlxuXHQgKiBXaGVuIHdvcmRCcmVhayA9ICdrZWVwQWxsJywgV29yZCBicmVha3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGZvciBDaGluZXNlL0phcGFuZXNlL0tvcmVhbiAoQ0pLKSB0ZXh0LiBOb24tQ0pLIHRleHQgYmVoYXZpb3IgaXMgdGhlIHNhbWUgYXMgZm9yIG5vcm1hbC5cblx0ICovXG5cdHdvcmRCcmVhaz86ICdub3JtYWwnIHwgJ2tlZXBBbGwnO1xuXHQvKipcblx0ICogUGVyZm9ybWFuY2UgZ3VhcmQ6IFN0b3AgcmVuZGVyaW5nIGEgbGluZSBhZnRlciB4IGNoYXJhY3RlcnMuXG5cdCAqIERlZmF1bHRzIHRvIDEwMDAwLlxuXHQgKiBVc2UgLTEgdG8gbmV2ZXIgc3RvcCByZW5kZXJpbmdcblx0ICovXG5cdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb25maWd1cmUgdGhlIGVkaXRvcidzIGhvdmVyLlxuXHQgKi9cblx0aG92ZXI/OiBJRWRpdG9ySG92ZXJPcHRpb25zO1xuXHQvKipcblx0ICogRW5hYmxlIGRldGVjdGluZyBsaW5rcyBhbmQgbWFraW5nIHRoZW0gY2xpY2thYmxlLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0bGlua3M/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIGlubGluZSBjb2xvciBkZWNvcmF0b3JzIGFuZCBjb2xvciBwaWNrZXIgcmVuZGVyaW5nLlxuXHQgKi9cblx0Y29sb3JEZWNvcmF0b3JzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoYXQgaXMgdGhlIGNvbmRpdGlvbiB0byBzcGF3biBhIGNvbG9yIHBpY2tlciBmcm9tIGEgY29sb3IgZGVjdG9yYXRvclxuXHQgKi9cblx0Y29sb3JEZWNvcmF0b3JzQWN0aXZhdGVkT24/OiAnY2xpY2tBbmRIb3ZlcicgfCAnY2xpY2snIHwgJ2hvdmVyJztcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBtYXggbnVtYmVyIG9mIGNvbG9yIGRlY29yYXRvcnMgdGhhdCBjYW4gYmUgcmVuZGVyZWQgaW4gYW4gZWRpdG9yIGF0IG9uY2UuXG5cdCAqL1xuXHRjb2xvckRlY29yYXRvcnNMaW1pdD86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW91ciBvZiBjb21tZW50cyBpbiB0aGUgZWRpdG9yLlxuXHQgKi9cblx0Y29tbWVudHM/OiBJRWRpdG9yQ29tbWVudHNPcHRpb25zO1xuXHQvKipcblx0ICogRW5hYmxlIGN1c3RvbSBjb250ZXh0bWVudS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGNvbnRleHRtZW51PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEEgbXVsdGlwbGllciB0byBiZSB1c2VkIG9uIHRoZSBgZGVsdGFYYCBhbmQgYGRlbHRhWWAgb2YgbW91c2Ugd2hlZWwgc2Nyb2xsIGV2ZW50cy5cblx0ICogRGVmYXVsdHMgdG8gMS5cblx0ICovXG5cdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eT86IG51bWJlcjtcblx0LyoqXG5cdCAqIEZhc3RTY3JvbGxpbmcgbXVsaXRwbGllciBzcGVlZCB3aGVuIHByZXNzaW5nIGBBbHRgXG5cdCAqIERlZmF1bHRzIHRvIDUuXG5cdCAqL1xuXHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCB0aGUgZWRpdG9yIHNjcm9sbHMgb25seSB0aGUgcHJlZG9taW5hbnQgYXhpcy4gUHJldmVudHMgaG9yaXpvbnRhbCBkcmlmdCB3aGVuIHNjcm9sbGluZyB2ZXJ0aWNhbGx5IG9uIGEgdHJhY2twYWQuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzY3JvbGxQcmVkb21pbmFudEF4aXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogTWFrZSBzY3JvbGxpbmcgaW5lcnRpYWwgLSBtb3N0bHkgdXNlZnVsIHdpdGggdG91Y2hwYWQgb24gbGludXguXG5cdCAqL1xuXHRpbmVydGlhbFNjcm9sbD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCB0aGUgc2VsZWN0aW9uIHdpdGggdGhlIG1vdXNlIGFuZCBrZXlzIGlzIGRvaW5nIGNvbHVtbiBzZWxlY3Rpb24uXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Y29sdW1uU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBtb2RpZmllciB0byBiZSB1c2VkIHRvIGFkZCBtdWx0aXBsZSBjdXJzb3JzIHdpdGggdGhlIG1vdXNlLlxuXHQgKiBEZWZhdWx0cyB0byAnYWx0J1xuXHQgKi9cblx0bXVsdGlDdXJzb3JNb2RpZmllcj86ICdjdHJsQ21kJyB8ICdhbHQnO1xuXHQvKipcblx0ICogTWVyZ2Ugb3ZlcmxhcHBpbmcgc2VsZWN0aW9ucy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZVxuXHQgKi9cblx0bXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbmZpZ3VyZSB0aGUgYmVoYXZpb3VyIHdoZW4gcGFzdGluZyBhIHRleHQgd2l0aCB0aGUgbGluZSBjb3VudCBlcXVhbCB0byB0aGUgY3Vyc29yIGNvdW50LlxuXHQgKiBEZWZhdWx0cyB0byAnc3ByZWFkJy5cblx0ICovXG5cdG11bHRpQ3Vyc29yUGFzdGU/OiAnc3ByZWFkJyB8ICdmdWxsJztcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBtYXggbnVtYmVyIG9mIHRleHQgY3Vyc29ycyB0aGF0IGNhbiBiZSBpbiBhbiBhY3RpdmUgZWRpdG9yIGF0IG9uY2UuXG5cdCAqL1xuXHRtdWx0aUN1cnNvckxpbWl0PzogbnVtYmVyO1xuXHQvKipcblx0ICogRW5hYmxlcyBtaWRkbGUgbW91c2UgYnV0dG9uIHRvIG9wZW4gbGlua3MgYW5kIEdvIFRvIERlZmluaXRpb25cblx0ICovXG5cdG1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24/OiBNb3VzZU1pZGRsZUNsaWNrQWN0aW9uO1xuXHQvKipcblx0ICogQ29uZmlndXJlIHRoZSBlZGl0b3IncyBhY2Nlc3NpYmlsaXR5IHN1cHBvcnQuXG5cdCAqIERlZmF1bHRzIHRvICdhdXRvJy4gSXQgaXMgYmVzdCB0byBsZWF2ZSB0aGlzIHRvICdhdXRvJy5cblx0ICovXG5cdGFjY2Vzc2liaWxpdHlTdXBwb3J0PzogJ2F1dG8nIHwgJ29mZicgfCAnb24nO1xuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIG51bWJlciBvZiBsaW5lcyBpbiB0aGUgZWRpdG9yIHRoYXQgY2FuIGJlIHJlYWQgb3V0IGJ5IGEgc2NyZWVuIHJlYWRlclxuXHQgKi9cblx0YWNjZXNzaWJpbGl0eVBhZ2VTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogU3VnZ2VzdCBvcHRpb25zLlxuXHQgKi9cblx0c3VnZ2VzdD86IElTdWdnZXN0T3B0aW9ucztcblx0aW5saW5lU3VnZ2VzdD86IElJbmxpbmVTdWdnZXN0T3B0aW9ucztcblx0LyoqXG5cdCAqIFNtYXJ0IHNlbGVjdCBvcHRpb25zLlxuXHQgKi9cblx0c21hcnRTZWxlY3Q/OiBJU21hcnRTZWxlY3RPcHRpb25zO1xuXHQvKipcblx0ICpcblx0ICovXG5cdGdvdG9Mb2NhdGlvbj86IElHb3RvTG9jYXRpb25PcHRpb25zO1xuXHQvKipcblx0ICogRW5hYmxlIHF1aWNrIHN1Z2dlc3Rpb25zIChzaGFkb3cgc3VnZ2VzdGlvbnMpXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRxdWlja1N1Z2dlc3Rpb25zPzogYm9vbGVhbiB8IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSB8IElRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucztcblx0LyoqXG5cdCAqIFF1aWNrIHN1Z2dlc3Rpb25zIHNob3cgZGVsYXkgKGluIG1zKVxuXHQgKiBEZWZhdWx0cyB0byAxMCAobXMpXG5cdCAqL1xuXHRxdWlja1N1Z2dlc3Rpb25zRGVsYXk/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgc3BhY2luZyBhcm91bmQgdGhlIGVkaXRvci5cblx0ICovXG5cdHBhZGRpbmc/OiBJRWRpdG9yUGFkZGluZ09wdGlvbnM7XG5cdC8qKlxuXHQgKiBQYXJhbWV0ZXIgaGludCBvcHRpb25zLlxuXHQgKi9cblx0cGFyYW1ldGVySGludHM/OiBJRWRpdG9yUGFyYW1ldGVySGludE9wdGlvbnM7XG5cdC8qKlxuXHQgKiBPcHRpb25zIGZvciBhdXRvIGNsb3NpbmcgYnJhY2tldHMuXG5cdCAqIERlZmF1bHRzIHRvIGxhbmd1YWdlIGRlZmluZWQgYmVoYXZpb3IuXG5cdCAqL1xuXHRhdXRvQ2xvc2luZ0JyYWNrZXRzPzogRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneTtcblx0LyoqXG5cdCAqIE9wdGlvbnMgZm9yIGF1dG8gY2xvc2luZyBjb21tZW50cy5cblx0ICogRGVmYXVsdHMgdG8gbGFuZ3VhZ2UgZGVmaW5lZCBiZWhhdmlvci5cblx0ICovXG5cdGF1dG9DbG9zaW5nQ29tbWVudHM/OiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgYXV0byBjbG9zaW5nIHF1b3Rlcy5cblx0ICogRGVmYXVsdHMgdG8gbGFuZ3VhZ2UgZGVmaW5lZCBiZWhhdmlvci5cblx0ICovXG5cdGF1dG9DbG9zaW5nUXVvdGVzPzogRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneTtcblx0LyoqXG5cdCAqIE9wdGlvbnMgZm9yIHByZXNzaW5nIGJhY2tzcGFjZSBuZWFyIHF1b3RlcyBvciBicmFja2V0IHBhaXJzLlxuXHQgKi9cblx0YXV0b0Nsb3NpbmdEZWxldGU/OiBFZGl0b3JBdXRvQ2xvc2luZ0VkaXRTdHJhdGVneTtcblx0LyoqXG5cdCAqIE9wdGlvbnMgZm9yIHR5cGluZyBvdmVyIGNsb3NpbmcgcXVvdGVzIG9yIGJyYWNrZXRzLlxuXHQgKi9cblx0YXV0b0Nsb3NpbmdPdmVydHlwZT86IEVkaXRvckF1dG9DbG9zaW5nRWRpdFN0cmF0ZWd5O1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgYXV0byBzdXJyb3VuZGluZy5cblx0ICogRGVmYXVsdHMgdG8gYWx3YXlzIGFsbG93aW5nIGF1dG8gc3Vycm91bmRpbmcuXG5cdCAqL1xuXHRhdXRvU3Vycm91bmQ/OiBFZGl0b3JBdXRvU3Vycm91bmRTdHJhdGVneTtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSBhZGp1c3QgdGhlIGluZGVudGF0aW9uIHdoZW4gdXNlcnMgdHlwZSwgcGFzdGUsIG1vdmUgb3IgaW5kZW50IGxpbmVzLlxuXHQgKiBEZWZhdWx0cyB0byBhZHZhbmNlZC5cblx0ICovXG5cdGF1dG9JbmRlbnQ/OiAnbm9uZScgfCAna2VlcCcgfCAnYnJhY2tldHMnIHwgJ2FkdmFuY2VkJyB8ICdmdWxsJztcblx0LyoqXG5cdCAqIEJvb2xlYW4gd2hpY2ggY29udHJvbHMgd2hldGhlciB0byBhdXRvaW5kZW50IG9uIHBhc3RlXG5cdCAqL1xuXHRhdXRvSW5kZW50T25QYXN0ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBCb29sZWFuIHdoaWNoIGNvbnRyb2xzIHdoZXRoZXIgdG8gYXV0b2luZGVudCBvbiBwYXN0ZSB3aXRoaW4gYSBzdHJpbmcgd2hlbiBhdXRvSW5kZW50T25QYXN0ZSBpcyBlbmFibGVkLlxuXHQgKi9cblx0YXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW11bGF0ZSBzZWxlY3Rpb24gYmVoYXZpb3VyIG9mIHRhYiBjaGFyYWN0ZXJzIHdoZW4gdXNpbmcgc3BhY2VzIGZvciBpbmRlbnRhdGlvbi5cblx0ICogVGhpcyBtZWFucyBzZWxlY3Rpb24gd2lsbCBzdGljayB0byB0YWIgc3RvcHMuXG5cdCAqL1xuXHRzdGlja3lUYWJTdG9wcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgZm9ybWF0IG9uIHR5cGUuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Zm9ybWF0T25UeXBlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBmb3JtYXQgb24gcGFzdGUuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Zm9ybWF0T25QYXN0ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGRvdWJsZS1jbGlja2luZyBuZXh0IHRvIGEgYnJhY2tldCBvciBxdW90ZSBzZWxlY3RzIHRoZSBjb250ZW50IGluc2lkZS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGRvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIGlmIHRoZSBlZGl0b3Igc2hvdWxkIGFsbG93IHRvIG1vdmUgc2VsZWN0aW9ucyB2aWEgZHJhZyBhbmQgZHJvcC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRkcmFnQW5kRHJvcD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIHN1Z2dlc3Rpb24gYm94IHRvIHBvcC11cCBvbiB0cmlnZ2VyIGNoYXJhY3RlcnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBY2NlcHQgc3VnZ2VzdGlvbnMgb24gRU5URVIuXG5cdCAqIERlZmF1bHRzIHRvICdvbicuXG5cdCAqL1xuXHRhY2NlcHRTdWdnZXN0aW9uT25FbnRlcj86ICdvbicgfCAnc21hcnQnIHwgJ29mZic7XG5cdC8qKlxuXHQgKiBBY2NlcHQgc3VnZ2VzdGlvbnMgb24gcHJvdmlkZXIgZGVmaW5lZCBjaGFyYWN0ZXJzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0YWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBzbmlwcGV0IHN1Z2dlc3Rpb25zLiBEZWZhdWx0IHRvICd0cnVlJy5cblx0ICovXG5cdHNuaXBwZXRTdWdnZXN0aW9ucz86ICd0b3AnIHwgJ2JvdHRvbScgfCAnaW5saW5lJyB8ICdub25lJztcblx0LyoqXG5cdCAqIENvcHlpbmcgd2l0aG91dCBhIHNlbGVjdGlvbiBjb3BpZXMgdGhlIGN1cnJlbnQgbGluZS5cblx0ICovXG5cdGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFN5bnRheCBoaWdobGlnaHRpbmcgaXMgY29waWVkLlxuXHQgKi9cblx0Y29weVdpdGhTeW50YXhIaWdobGlnaHRpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIGhpc3RvcnkgbW9kZSBmb3Igc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzdWdnZXN0U2VsZWN0aW9uPzogJ2ZpcnN0JyB8ICdyZWNlbnRseVVzZWQnIHwgJ3JlY2VudGx5VXNlZEJ5UHJlZml4Jztcblx0LyoqXG5cdCAqIFRoZSBmb250IHNpemUgZm9yIHRoZSBzdWdnZXN0IHdpZGdldC5cblx0ICogRGVmYXVsdHMgdG8gdGhlIGVkaXRvciBmb250IHNpemUuXG5cdCAqL1xuXHRzdWdnZXN0Rm9udFNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbGluZSBoZWlnaHQgZm9yIHRoZSBzdWdnZXN0IHdpZGdldC5cblx0ICogRGVmYXVsdHMgdG8gdGhlIGVkaXRvciBsaW5lIGhlaWdodC5cblx0ICovXG5cdHN1Z2dlc3RMaW5lSGVpZ2h0PzogbnVtYmVyO1xuXHQvKipcblx0ICogRW5hYmxlIHRhYiBjb21wbGV0aW9uLlxuXHQgKi9cblx0dGFiQ29tcGxldGlvbj86ICdvbicgfCAnb2ZmJyB8ICdvbmx5U25pcHBldHMnO1xuXHQvKipcblx0ICogRW5hYmxlIHNlbGVjdGlvbiBoaWdobGlnaHQuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzZWxlY3Rpb25IaWdobGlnaHQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHNlbGVjdGlvbiBoaWdobGlnaHQgZm9yIG11bHRpbGluZSBzZWxlY3Rpb25zLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBNYXhpbXVtIGxlbmd0aCAoaW4gY2hhcmFjdGVycykgZm9yIHNlbGVjdGlvbiBoaWdobGlnaHRzLlxuXHQgKiBTZXQgdG8gMCB0byBoYXZlIGFuIHVubGltaXRlZCBsZW5ndGguXG5cdCAqL1xuXHRzZWxlY3Rpb25IaWdobGlnaHRNYXhMZW5ndGg/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgc2VtYW50aWMgb2NjdXJyZW5jZXMgaGlnaGxpZ2h0LlxuXHQgKiBEZWZhdWx0cyB0byAnc2luZ2xlRmlsZScuXG5cdCAqICdvZmYnIGRpc2FibGVzIG9jY3VycmVuY2UgaGlnaGxpZ2h0aW5nXG5cdCAqICdzaW5nbGVGaWxlJyB0cmlnZ2VycyBvY2N1cnJlbmNlIGhpZ2hsaWdodGluZyBpbiB0aGUgY3VycmVudCBkb2N1bWVudFxuXHQgKiAnbXVsdGlGaWxlJyAgdHJpZ2dlcnMgb2NjdXJyZW5jZSBoaWdobGlnaHRpbmcgYWNyb3NzIHZhbGlkIG9wZW4gZG9jdW1lbnRzXG5cdCAqL1xuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodD86ICdvZmYnIHwgJ3NpbmdsZUZpbGUnIHwgJ211bHRpRmlsZSc7XG5cdC8qKlxuXHQgKiBDb250cm9scyBkZWxheSBmb3Igb2NjdXJyZW5jZXMgaGlnaGxpZ2h0aW5nXG5cdCAqIERlZmF1bHRzIHRvIDI1MC5cblx0ICogTWluaW11bSB2YWx1ZSBpcyAwXG5cdCAqIE1heGltdW0gdmFsdWUgaXMgMjAwMFxuXHQgKi9cblx0b2NjdXJyZW5jZXNIaWdobGlnaHREZWxheT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFNob3cgY29kZSBsZW5zXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRjb2RlTGVucz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb2RlIGxlbnMgZm9udCBmYW1pbHkuIERlZmF1bHRzIHRvIGVkaXRvciBmb250IGZhbWlseS5cblx0ICovXG5cdGNvZGVMZW5zRm9udEZhbWlseT86IHN0cmluZztcblx0LyoqXG5cdCAqIENvZGUgbGVucyBmb250IHNpemUuIERlZmF1bHQgdG8gOTAlIG9mIHRoZSBlZGl0b3IgZm9udCBzaXplXG5cdCAqL1xuXHRjb2RlTGVuc0ZvbnRTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3IgYW5kIHJlbmRlcmluZyBvZiB0aGUgY29kZSBhY3Rpb24gbGlnaHRidWxiLlxuXHQgKi9cblx0bGlnaHRidWxiPzogSUVkaXRvckxpZ2h0YnVsYk9wdGlvbnM7XG5cdC8qKlxuXHQgKiBUaW1lb3V0IGZvciBydW5uaW5nIGNvZGUgYWN0aW9ucyBvbiBzYXZlLlxuXHQgKi9cblx0Y29kZUFjdGlvbnNPblNhdmVUaW1lb3V0PzogbnVtYmVyO1xuXHQvKipcblx0ICogRW5hYmxlIGNvZGUgZm9sZGluZy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGZvbGRpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2VsZWN0cyB0aGUgZm9sZGluZyBzdHJhdGVneS4gJ2F1dG8nIHVzZXMgdGhlIHN0cmF0ZWdpZXMgY29udHJpYnV0ZWQgZm9yIHRoZSBjdXJyZW50IGRvY3VtZW50LCAnaW5kZW50YXRpb24nIHVzZXMgdGhlIGluZGVudGF0aW9uIGJhc2VkIGZvbGRpbmcgc3RyYXRlZ3kuXG5cdCAqIERlZmF1bHRzIHRvICdhdXRvJy5cblx0ICovXG5cdGZvbGRpbmdTdHJhdGVneT86ICdhdXRvJyB8ICdpbmRlbnRhdGlvbic7XG5cdC8qKlxuXHQgKiBFbmFibGUgaGlnaGxpZ2h0IGZvciBmb2xkZWQgcmVnaW9ucy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGZvbGRpbmdIaWdobGlnaHQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQXV0byBmb2xkIGltcG9ydHMgZm9sZGluZyByZWdpb25zLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0Zm9sZGluZ0ltcG9ydHNCeURlZmF1bHQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogTWF4aW11bSBudW1iZXIgb2YgZm9sZGFibGUgcmVnaW9ucy5cblx0ICogRGVmYXVsdHMgdG8gNTAwMC5cblx0ICovXG5cdGZvbGRpbmdNYXhpbXVtUmVnaW9ucz86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGZvbGQgYWN0aW9ucyBpbiB0aGUgZ3V0dGVyIHN0YXkgYWx3YXlzIHZpc2libGUgb3IgaGlkZSB1bmxlc3MgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGd1dHRlci5cblx0ICogRGVmYXVsdHMgdG8gJ21vdXNlb3ZlcicuXG5cdCAqL1xuXHRzaG93Rm9sZGluZ0NvbnRyb2xzPzogJ2Fsd2F5cycgfCAnbmV2ZXInIHwgJ21vdXNlb3Zlcic7XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNsaWNraW5nIG9uIHRoZSBlbXB0eSBjb250ZW50IGFmdGVyIGEgZm9sZGVkIGxpbmUgd2lsbCB1bmZvbGQgdGhlIGxpbmUuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0dW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBoaWdobGlnaHRpbmcgb2YgbWF0Y2hpbmcgYnJhY2tldHMuXG5cdCAqIERlZmF1bHRzIHRvICdhbHdheXMnLlxuXHQgKi9cblx0bWF0Y2hCcmFja2V0cz86ICduZXZlcicgfCAnbmVhcicgfCAnYWx3YXlzJztcblx0LyoqXG5cdCAqIEVuYWJsZSBleHBlcmltZW50YWwgcmVuZGVyaW5nIHVzaW5nIFdlYkdQVS5cblx0ICogRGVmYXVsdHMgdG8gJ29mZicuXG5cdCAqL1xuXHRleHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24/OiAnb24nIHwgJ29mZic7XG5cdC8qKlxuXHQgKiBFbmFibGUgZXhwZXJpbWVudGFsIHdoaXRlc3BhY2UgcmVuZGVyaW5nLlxuXHQgKiBEZWZhdWx0cyB0byAnc3ZnJy5cblx0ICovXG5cdGV4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmc/OiAnc3ZnJyB8ICdmb250JyB8ICdvZmYnO1xuXHQvKipcblx0ICogRW5hYmxlIHJlbmRlcmluZyBvZiB3aGl0ZXNwYWNlLlxuXHQgKiBEZWZhdWx0cyB0byAnc2VsZWN0aW9uJy5cblx0ICovXG5cdHJlbmRlcldoaXRlc3BhY2U/OiAnbm9uZScgfCAnYm91bmRhcnknIHwgJ3NlbGVjdGlvbicgfCAndHJhaWxpbmcnIHwgJ2FsbCc7XG5cdC8qKlxuXHQgKiBFbmFibGUgcmVuZGVyaW5nIG9mIGNvbnRyb2wgY2hhcmFjdGVycy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSByZW5kZXJpbmcgb2YgY3VycmVudCBsaW5lIGhpZ2hsaWdodC5cblx0ICogRGVmYXVsdHMgdG8gYWxsLlxuXHQgKi9cblx0cmVuZGVyTGluZUhpZ2hsaWdodD86ICdub25lJyB8ICdndXR0ZXInIHwgJ2xpbmUnIHwgJ2FsbCc7XG5cdC8qKlxuXHQgKiBDb250cm9sIGlmIHRoZSBjdXJyZW50IGxpbmUgaGlnaGxpZ2h0IHNob3VsZCBiZSByZW5kZXJlZCBvbmx5IHRoZSBlZGl0b3IgaXMgZm9jdXNlZC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0T25seVdoZW5Gb2N1cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBJbnNlcnRpbmcgYW5kIGRlbGV0aW5nIHdoaXRlc3BhY2UgZm9sbG93cyB0YWIgc3RvcHMuXG5cdCAqL1xuXHR1c2VUYWJTdG9wcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgcmVtb3ZlIGluZGVudGF0aW9uIHdoaXRlc3BhY2Ugd2hlbiBqb2luaW5nIGxpbmVzIHdpdGggRGVsZXRlLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHRyaW1XaGl0ZXNwYWNlT25EZWxldGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIGZvbnQgZmFtaWx5XG5cdCAqL1xuXHRmb250RmFtaWx5Pzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIGZvbnQgd2VpZ2h0XG5cdCAqL1xuXHRmb250V2VpZ2h0Pzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIGZvbnQgc2l6ZVxuXHQgKi9cblx0Zm9udFNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbGluZSBoZWlnaHRcblx0ICovXG5cdGxpbmVIZWlnaHQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbGV0dGVyIHNwYWNpbmdcblx0ICovXG5cdGxldHRlclNwYWNpbmc/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9scyBmYWRpbmcgb3V0IG9mIHVudXNlZCB2YXJpYWJsZXMuXG5cdCAqL1xuXHRzaG93VW51c2VkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gZm9jdXMgdGhlIGlubGluZSBlZGl0b3IgaW4gdGhlIHBlZWsgd2lkZ2V0IGJ5IGRlZmF1bHQuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0cGVla1dpZGdldERlZmF1bHRGb2N1cz86ICd0cmVlJyB8ICdlZGl0b3InO1xuXG5cdC8qKlxuXHQgKiBTZXRzIGEgcGxhY2Vob2xkZXIgZm9yIHRoZSBlZGl0b3IuXG5cdCAqIElmIHNldCwgdGhlIHBsYWNlaG9sZGVyIGlzIHNob3duIGlmIHRoZSBlZGl0b3IgaXMgZW1wdHkuXG5cdCovXG5cdHBsYWNlaG9sZGVyPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBkZWZpbml0aW9uIGxpbmsgb3BlbnMgZWxlbWVudCBpbiB0aGUgcGVlayB3aWRnZXQuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0ZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlaz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyBzdHJpa2V0aHJvdWdoIGRlcHJlY2F0ZWQgdmFyaWFibGVzLlxuXHQgKi9cblx0c2hvd0RlcHJlY2F0ZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBzdWdnZXN0aW9ucyBhbGxvdyBtYXRjaGVzIGluIHRoZSBtaWRkbGUgb2YgdGhlIHdvcmQgaW5zdGVhZCBvZiBvbmx5IGF0IHRoZSBiZWdpbm5pbmdcblx0ICovXG5cdG1hdGNoT25Xb3JkU3RhcnRPbmx5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW9yIGFuZCByZW5kZXJpbmcgb2YgdGhlIGlubGluZSBoaW50cy5cblx0ICovXG5cdGlubGF5SGludHM/OiBJRWRpdG9ySW5sYXlIaW50c09wdGlvbnM7XG5cdC8qKlxuXHQgKiBDb250cm9sIGlmIHRoZSBlZGl0b3Igc2hvdWxkIHVzZSBzaGFkb3cgRE9NLlxuXHQgKi9cblx0dXNlU2hhZG93RE9NPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBiZWhhdmlvciBvZiBlZGl0b3IgZ3VpZGVzLlxuXHQqL1xuXHRndWlkZXM/OiBJR3VpZGVzT3B0aW9ucztcblxuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIHRoZSB1bmljb2RlIGhpZ2hsaWdodCBmZWF0dXJlXG5cdCAqIChieSBkZWZhdWx0LCBhbWJpZ3VvdXMgYW5kIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBoaWdobGlnaHRlZCkuXG5cdCAqL1xuXHR1bmljb2RlSGlnaGxpZ2h0PzogSVVuaWNvZGVIaWdobGlnaHRPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBDb25maWd1cmVzIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb24gKGRpc2FibGVkIGJ5IGRlZmF1bHQpLlxuXHQqL1xuXHRicmFja2V0UGFpckNvbG9yaXphdGlvbj86IElCcmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIGRyb3BwaW5nIGludG8gdGhlIGVkaXRvciBmcm9tIGFuIGV4dGVybmFsIHNvdXJjZS5cblx0ICpcblx0ICogV2hlbiBlbmFibGVkLCB0aGlzIHNob3dzIGEgcHJldmlldyBvZiB0aGUgZHJvcCBsb2NhdGlvbiBhbmQgdHJpZ2dlcnMgYW4gYG9uRHJvcEludG9FZGl0b3JgIGV2ZW50LlxuXHQgKi9cblx0ZHJvcEludG9FZGl0b3I/OiBJRHJvcEludG9FZGl0b3JPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgdGhlIG5ldyBleHBlcmltZW50YWwgZWRpdCBjb250ZXh0IHNob3VsZCBiZSB1c2VkIGluc3RlYWQgb2YgdGhlIHRleHQgYXJlYS5cblx0ICovXG5cdGVkaXRDb250ZXh0PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byByZW5kZXIgcmljaCBIVE1MIHNjcmVlbiByZWFkZXIgY29udGVudCB3aGVuIHRoZSBFZGl0Q29udGV4dCBpcyBlbmFibGVkXG5cdCAqL1xuXHRyZW5kZXJSaWNoU2NyZWVuUmVhZGVyQ29udGVudD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHN1cHBvcnQgZm9yIGNoYW5naW5nIGhvdyBjb250ZW50IGlzIHBhc3RlZCBpbnRvIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRwYXN0ZUFzPzogSVBhc3RlQXNPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3IgLyB0ZXJtaW5hbCByZWNlaXZlcyB0YWJzIG9yIGRlZmVycyB0aGVtIHRvIHRoZSB3b3JrYmVuY2ggZm9yIG5hdmlnYXRpb24uXG5cdCAqL1xuXHR0YWJGb2N1c01vZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBhY2Nlc3NpYmlsaXR5IGhpbnQgc2hvdWxkIGJlIHByb3ZpZGVkIHRvIHNjcmVlbiByZWFkZXIgdXNlcnMgd2hlbiBhbiBpbmxpbmUgY29tcGxldGlvbiBpcyBzaG93bi5cblx0ICovXG5cdGlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2U/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICogVGhlIHdpZHRoIG9mIHRoZSBtaW5pbWFwIGd1dHRlciwgaW4gcGl4ZWxzLlxuICovXG5leHBvcnQgY29uc3QgTUlOSU1BUF9HVVRURVJfV0lEVEggPSA4O1xuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmRWRpdG9yQmFzZU9wdGlvbnMge1xuXHQvKipcblx0ICogQWxsb3cgdGhlIHVzZXIgdG8gcmVzaXplIHRoZSBkaWZmIGVkaXRvciBzcGxpdCB2aWV3LlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZW5hYmxlU3BsaXRWaWV3UmVzaXppbmc/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgZGVmYXVsdCByYXRpbyB3aGVuIHJlbmRlcmluZyBzaWRlLWJ5LXNpZGUgZWRpdG9ycy5cblx0ICogTXVzdCBiZSBhIG51bWJlciBiZXR3ZWVuIDAgYW5kIDEsIG1pbiBzaXplcyBhcHBseS5cblx0ICogRGVmYXVsdHMgdG8gMC41XG5cdCAqL1xuXHRzcGxpdFZpZXdEZWZhdWx0UmF0aW8/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgZGlmZmVyZW5jZXMgaW4gdHdvIHNpZGUtYnktc2lkZSBlZGl0b3JzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0cmVuZGVyU2lkZUJ5U2lkZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gYHJlbmRlclNpZGVCeVNpZGVgIGlzIGVuYWJsZWQsIGB1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkYCBpcyBzZXQsXG5cdCAqIGFuZCB0aGUgZGlmZiBlZGl0b3IgaGFzIGEgd2lkdGggbGVzcyB0aGFuIGByZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludGAsIHRoZSBpbmxpbmUgdmlldyBpcyB1c2VkLlxuXHQgKi9cblx0cmVuZGVyU2lkZUJ5U2lkZUlubGluZUJyZWFrcG9pbnQ/OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZW4gYHJlbmRlclNpZGVCeVNpZGVgIGlzIGVuYWJsZWQsIGB1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkYCBpcyBzZXQsXG5cdCAqIGFuZCB0aGUgZGlmZiBlZGl0b3IgaGFzIGEgd2lkdGggbGVzcyB0aGFuIGByZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludGAsIHRoZSBpbmxpbmUgdmlldyBpcyB1c2VkLlxuXHQgKi9cblx0dXNlSW5saW5lVmlld1doZW5TcGFjZUlzTGltaXRlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHNldCwgdGhlIGRpZmYgZWRpdG9yIGlzIG9wdGltaXplZCBmb3Igc21hbGwgdmlld3MuXG5cdCAqIERlZmF1bHRzIHRvIGBmYWxzZWAuXG5cdCovXG5cdGNvbXBhY3RNb2RlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgc2V0LCB0aGUgb3JpZ2luYWwgZWRpdG9yJ3MgbGluZSBudW1iZXJzIGFyZSBoaWRkZW4gaW4gdGhlIGlubGluZSB2aWV3LlxuXHQgKiBEZWZhdWx0cyB0byBgZmFsc2VgLlxuXHQgKiBAaW50ZXJuYWxcblx0Ki9cblx0aGlkZU9yaWdpbmFsTGluZU51bWJlcnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaW1lb3V0IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBkaWZmIGNvbXB1dGF0aW9uIGlzIGNhbmNlbGxlZC5cblx0ICogRGVmYXVsdHMgdG8gNTAwMC5cblx0ICovXG5cdG1heENvbXB1dGF0aW9uVGltZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogTWF4aW11bSBzdXBwb3J0ZWQgZmlsZSBzaXplIGluIE1CLlxuXHQgKiBEZWZhdWx0cyB0byA1MC5cblx0ICovXG5cdG1heEZpbGVTaXplPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBkaWZmIGJ5IGlnbm9yaW5nIGxlYWRpbmcvdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aWdub3JlVHJpbVdoaXRlc3BhY2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZW5kZXIgKy8tIGluZGljYXRvcnMgZm9yIGFkZGVkL2RlbGV0ZWQgY2hhbmdlcy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHJlbmRlckluZGljYXRvcnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTaG93cyBpY29ucyBpbiB0aGUgZ2x5cGggbWFyZ2luIHRvIHJldmVydCBjaGFuZ2VzLlxuXHQgKiBEZWZhdWx0IHRvIHRydWUuXG5cdCAqL1xuXHRyZW5kZXJNYXJnaW5SZXZlcnRJY29uPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSW5kaWNhdGVzIGlmIHRoZSBndXR0ZXIgbWVudSBzaG91bGQgYmUgcmVuZGVyZWQuXG5cdCovXG5cdHJlbmRlckd1dHRlck1lbnU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBPcmlnaW5hbCBtb2RlbCBzaG91bGQgYmUgZWRpdGFibGU/XG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0b3JpZ2luYWxFZGl0YWJsZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNob3VsZCB0aGUgZGlmZiBlZGl0b3IgZW5hYmxlIGNvZGUgbGVucz9cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRkaWZmQ29kZUxlbnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJcyB0aGUgZGlmZiBlZGl0b3Igc2hvdWxkIHJlbmRlciBvdmVydmlldyBydWxlclxuXHQgKiBEZWZhdWx0cyB0byB0cnVlXG5cdCAqL1xuXHRyZW5kZXJPdmVydmlld1J1bGVyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbCB0aGUgd3JhcHBpbmcgb2YgdGhlIGRpZmYgZWRpdG9yLlxuXHQgKi9cblx0ZGlmZldvcmRXcmFwPzogJ29mZicgfCAnb24nIHwgJ2luaGVyaXQnO1xuXG5cdC8qKlxuXHQgKiBEaWZmIEFsZ29yaXRobVxuXHQqL1xuXHRkaWZmQWxnb3JpdGhtPzogJ2xlZ2FjeScgfCAnYWR2YW5jZWQnIHwgJ2FkdmFuY2VkLWV4dGVybmFsJyB8ICdhZHZhbmNlZC13YXNtJztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZGlmZiBlZGl0b3IgYXJpYSBsYWJlbCBzaG91bGQgYmUgdmVyYm9zZS5cblx0ICovXG5cdGFjY2Vzc2liaWxpdHlWZXJib3NlPzogYm9vbGVhbjtcblxuXHRleHBlcmltZW50YWw/OiB7XG5cdFx0LyoqXG5cdFx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdFx0ICovXG5cdFx0c2hvd01vdmVzPzogYm9vbGVhbjtcblxuXHRcdHNob3dFbXB0eURlY29yYXRpb25zPzogYm9vbGVhbjtcblxuXHRcdC8qKlxuXHRcdCAqIE9ubHkgYXBwbGllcyB3aGVuIGByZW5kZXJTaWRlQnlTaWRlYCBpcyBzZXQgdG8gZmFsc2UuXG5cdFx0Ki9cblx0XHR1c2VUcnVlSW5saW5lVmlldz86IGJvb2xlYW47XG5cdH07XG5cblx0LyoqXG5cdCAqIElzIHRoZSBkaWZmIGVkaXRvciBpbnNpZGUgYW5vdGhlciBlZGl0b3Jcblx0ICogRGVmYXVsdHMgdG8gZmFsc2Vcblx0ICovXG5cdGlzSW5FbWJlZGRlZEVkaXRvcj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHRoZSBkaWZmIGVkaXRvciBzaG91bGQgb25seSBzaG93IHRoZSBkaWZmZXJlbmNlIHJldmlldyBtb2RlLlxuXHQgKi9cblx0b25seVNob3dBY2Nlc3NpYmxlRGlmZlZpZXdlcj86IGJvb2xlYW47XG5cblx0aGlkZVVuY2hhbmdlZFJlZ2lvbnM/OiB7XG5cdFx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdFx0cmV2ZWFsTGluZUNvdW50PzogbnVtYmVyO1xuXHRcdG1pbmltdW1MaW5lQ291bnQ/OiBudW1iZXI7XG5cdFx0Y29udGV4dExpbmVDb3VudD86IG51bWJlcjtcblx0fTtcbn1cblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHRoZSBkaWZmIGVkaXRvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRGlmZkVkaXRvck9wdGlvbnMgZXh0ZW5kcyBJRWRpdG9yT3B0aW9ucywgSURpZmZFZGl0b3JCYXNlT3B0aW9ucyB7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIFZhbGlkRGlmZkVkaXRvckJhc2VPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SURpZmZFZGl0b3JCYXNlT3B0aW9ucz4+O1xuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBBbiBldmVudCBkZXNjcmliaW5nIHRoYXQgdGhlIGNvbmZpZ3VyYXRpb24gb2YgdGhlIGVkaXRvciBoYXMgY2hhbmdlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXM6IGJvb2xlYW5bXTtcblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0Y29uc3RydWN0b3IodmFsdWVzOiBib29sZWFuW10pIHtcblx0XHR0aGlzLl92YWx1ZXMgPSB2YWx1ZXM7XG5cdH1cblx0cHVibGljIGhhc0NoYW5nZWQoaWQ6IEVkaXRvck9wdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZXNbaWRdO1xuXHR9XG59XG5cbi8qKlxuICogQWxsIGNvbXB1dGVkIGVkaXRvciBvcHRpb25zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb21wdXRlZEVkaXRvck9wdGlvbnMge1xuXHRnZXQ8VCBleHRlbmRzIEVkaXRvck9wdGlvbj4oaWQ6IFQpOiBGaW5kQ29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZUJ5SWQ8VD47XG59XG5cbi8vI3JlZ2lvbiBJRWRpdG9yT3B0aW9uXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVudmlyb25tZW50YWxPcHRpb25zIHtcblx0cmVhZG9ubHkgbWVtb3J5OiBDb21wdXRlT3B0aW9uc01lbW9yeSB8IG51bGw7XG5cdHJlYWRvbmx5IG91dGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0ZXJIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZm9udEluZm86IEZvbnRJbmZvO1xuXHRyZWFkb25seSBleHRyYUVkaXRvckNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBib29sZWFuO1xuXHRyZWFkb25seSB2aWV3TGluZUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzRGlnaXRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcGl4ZWxSYXRpbzogbnVtYmVyO1xuXHRyZWFkb25seSB0YWJGb2N1c01vZGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlucHV0TW9kZTogJ2luc2VydCcgfCAnb3ZlcnR5cGUnO1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5U3VwcG9ydDogQWNjZXNzaWJpbGl0eVN1cHBvcnQ7XG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBlZGl0Q29udGV4dFN1cHBvcnRlZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIENvbXB1dGVPcHRpb25zTWVtb3J5IHtcblxuXHRwdWJsaWMgc3RhYmxlTWluaW1hcExheW91dElucHV0OiBJTWluaW1hcExheW91dElucHV0IHwgbnVsbDtcblx0cHVibGljIHN0YWJsZUZpdE1heE1pbmltYXBTY2FsZTogbnVtYmVyO1xuXHRwdWJsaWMgc3RhYmxlRml0UmVtYWluaW5nV2lkdGg6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dCA9IG51bGw7XG5cdFx0dGhpcy5zdGFibGVGaXRNYXhNaW5pbWFwU2NhbGUgPSAwO1xuXHRcdHRoaXMuc3RhYmxlRml0UmVtYWluaW5nV2lkdGggPSAwO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvck9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uLCBWPiB7XG5cdHJlYWRvbmx5IGlkOiBLO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdGRlZmF1bHRWYWx1ZTogVjtcblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0cmVhZG9ubHkgc2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIHwgeyBbcGF0aDogc3RyaW5nXTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqL1xuXHR2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFY7XG5cdC8qKlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiBWKTogVjtcblxuXHQvKipcblx0ICogTWlnaHQgbW9kaWZ5IGB2YWx1ZWAuXG5cdCovXG5cdGFwcGx5VXBkYXRlKHZhbHVlOiBWIHwgdW5kZWZpbmVkLCB1cGRhdGU6IFYpOiBBcHBseVVwZGF0ZVJlc3VsdDxWPjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xudHlwZSBQb3NzaWJsZUtleU5hbWUwPFY+ID0geyBbSyBpbiBrZXlvZiBJRWRpdG9yT3B0aW9uc106IElFZGl0b3JPcHRpb25zW0tdIGV4dGVuZHMgViB8IHVuZGVmaW5lZCA/IEsgOiBuZXZlciB9W2tleW9mIElFZGl0b3JPcHRpb25zXTtcbi8qKlxuICogQGludGVybmFsXG4gKi9cbnR5cGUgUG9zc2libGVLZXlOYW1lPFY+ID0gTm9uTnVsbGFibGU8UG9zc2libGVLZXlOYW1lMDxWPj47XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmFic3RyYWN0IGNsYXNzIEJhc2VFZGl0b3JPcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbiwgVCwgVj4gaW1wbGVtZW50cyBJRWRpdG9yT3B0aW9uPEssIFY+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IEs7XG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBkZWZhdWx0VmFsdWU6IFY7XG5cdHB1YmxpYyByZWFkb25seSBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB7IFtwYXRoOiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxUPiwgZGVmYXVsdFZhbHVlOiBWLCBzY2hlbWE/OiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIHwgeyBbcGF0aDogc3RyaW5nXTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9KSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5kZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cdFx0dGhpcy5zY2hlbWEgPSBzY2hlbWE7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlVcGRhdGUodmFsdWU6IFYgfCB1bmRlZmluZWQsIHVwZGF0ZTogVik6IEFwcGx5VXBkYXRlUmVzdWx0PFY+IHtcblx0XHRyZXR1cm4gYXBwbHlVcGRhdGUodmFsdWUsIHVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBWO1xuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogVik6IFYge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXBwbHlVcGRhdGVSZXN1bHQ8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmV3VmFsdWU6IFQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpZENoYW5nZTogYm9vbGVhblxuXHQpIHsgfVxufVxuXG5mdW5jdGlvbiBhcHBseVVwZGF0ZTxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdXBkYXRlOiBUKTogQXBwbHlVcGRhdGVSZXN1bHQ8VD4ge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgdXBkYXRlICE9PSAnb2JqZWN0JyB8fCAhdmFsdWUgfHwgIXVwZGF0ZSkge1xuXHRcdHJldHVybiBuZXcgQXBwbHlVcGRhdGVSZXN1bHQodXBkYXRlLCB2YWx1ZSAhPT0gdXBkYXRlKTtcblx0fVxuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgQXJyYXkuaXNBcnJheSh1cGRhdGUpKSB7XG5cdFx0Y29uc3QgYXJyYXlFcXVhbHMgPSBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiBBcnJheS5pc0FycmF5KHVwZGF0ZSkgJiYgYXJyYXlzLmVxdWFscyh2YWx1ZSwgdXBkYXRlKTtcblx0XHRyZXR1cm4gbmV3IEFwcGx5VXBkYXRlUmVzdWx0KHVwZGF0ZSwgIWFycmF5RXF1YWxzKTtcblx0fVxuXHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuXHRcdGlmICh1cGRhdGUuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXBwbHlVcGRhdGUodmFsdWVba2V5XSwgdXBkYXRlW2tleV0pO1xuXHRcdFx0aWYgKHJlc3VsdC5kaWRDaGFuZ2UpIHtcblx0XHRcdFx0dmFsdWVba2V5XSA9IHJlc3VsdC5uZXdWYWx1ZTtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG5ldyBBcHBseVVwZGF0ZVJlc3VsdCh2YWx1ZSwgZGlkQ2hhbmdlKTtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuYWJzdHJhY3QgY2xhc3MgQ29tcHV0ZWRFZGl0b3JPcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbiwgVj4gaW1wbGVtZW50cyBJRWRpdG9yT3B0aW9uPEssIFY+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IEs7XG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiAnX25ldmVyXyc7XG5cdHB1YmxpYyByZWFkb25seSBkZWZhdWx0VmFsdWU6IFY7XG5cdHB1YmxpYyByZWFkb25seSBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIGRlZmF1bHRWYWx1ZTogVikge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLm5hbWUgPSAnX25ldmVyXyc7XG5cdFx0dGhpcy5kZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlVcGRhdGUodmFsdWU6IFYgfCB1bmRlZmluZWQsIHVwZGF0ZTogVik6IEFwcGx5VXBkYXRlUmVzdWx0PFY+IHtcblx0XHRyZXR1cm4gYXBwbHlVcGRhdGUodmFsdWUsIHVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBWIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IFYpOiBWO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBTaW1wbGVFZGl0b3JPcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbiwgVj4gaW1wbGVtZW50cyBJRWRpdG9yT3B0aW9uPEssIFY+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IEs7XG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiBQb3NzaWJsZUtleU5hbWU8Vj47XG5cdHB1YmxpYyByZWFkb25seSBkZWZhdWx0VmFsdWU6IFY7XG5cdHB1YmxpYyByZWFkb25seSBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxWPiwgZGVmYXVsdFZhbHVlOiBWLCBzY2hlbWE/OiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5kZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cdFx0dGhpcy5zY2hlbWEgPSBzY2hlbWE7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlVcGRhdGUodmFsdWU6IFYgfCB1bmRlZmluZWQsIHVwZGF0ZTogVik6IEFwcGx5VXBkYXRlUmVzdWx0PFY+IHtcblx0XHRyZXR1cm4gYXBwbHlVcGRhdGUodmFsdWUsIHVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBWO1xuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogVik6IFYge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gYm9vbGVhbih2YWx1ZTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0fVxuXHRpZiAodmFsdWUgPT09ICdmYWxzZScpIHtcblx0XHQvLyB0cmVhdCB0aGUgc3RyaW5nICdmYWxzZScgYXMgZmFsc2Vcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIEJvb2xlYW4odmFsdWUpO1xufVxuXG5jbGFzcyBFZGl0b3JCb29sZWFuT3B0aW9uPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24+IGV4dGVuZHMgU2ltcGxlRWRpdG9yT3B0aW9uPEssIGJvb2xlYW4+IHtcblxuXHRjb25zdHJ1Y3RvcihpZDogSywgbmFtZTogUG9zc2libGVLZXlOYW1lPGJvb2xlYW4+LCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4sIHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2Ygc2NoZW1hICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0c2NoZW1hLnR5cGUgPSAnYm9vbGVhbic7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBib29sZWFuKGlucHV0LCB0aGlzLmRlZmF1bHRWYWx1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wZWRJbnQ8VCA9IG51bWJlcj4odmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogVCwgbWluaW11bTogbnVtYmVyLCBtYXhpbXVtOiBudW1iZXIpOiBudW1iZXIgfCBUIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHR2YWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgaXNOYU4odmFsdWUpKSB7XG5cdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0fVxuXHRsZXQgciA9IHZhbHVlO1xuXHRyID0gTWF0aC5tYXgobWluaW11bSwgcik7XG5cdHIgPSBNYXRoLm1pbihtYXhpbXVtLCByKTtcblx0cmV0dXJuIHIgfCAwO1xufVxuXG5jbGFzcyBFZGl0b3JJbnRPcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbj4gZXh0ZW5kcyBTaW1wbGVFZGl0b3JPcHRpb248SywgbnVtYmVyPiB7XG5cblx0cHVibGljIHN0YXRpYyBjbGFtcGVkSW50PFQ+KHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IFQsIG1pbmltdW06IG51bWJlciwgbWF4aW11bTogbnVtYmVyKTogbnVtYmVyIHwgVCB7XG5cdFx0cmV0dXJuIGNsYW1wZWRJbnQodmFsdWUsIGRlZmF1bHRWYWx1ZSwgbWluaW11bSwgbWF4aW11bSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgbWluaW11bTogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWF4aW11bTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBLLCBuYW1lOiBQb3NzaWJsZUtleU5hbWU8bnVtYmVyPiwgZGVmYXVsdFZhbHVlOiBudW1iZXIsIG1pbmltdW06IG51bWJlciwgbWF4aW11bTogbnVtYmVyLCBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHNjaGVtYS50eXBlID0gJ2ludGVnZXInO1xuXHRcdFx0c2NoZW1hLmRlZmF1bHQgPSBkZWZhdWx0VmFsdWU7XG5cdFx0XHRzY2hlbWEubWluaW11bSA9IG1pbmltdW07XG5cdFx0XHRzY2hlbWEubWF4aW11bSA9IG1heGltdW07XG5cdFx0fVxuXHRcdHN1cGVyKGlkLCBuYW1lLCBkZWZhdWx0VmFsdWUsIHNjaGVtYSk7XG5cdFx0dGhpcy5taW5pbXVtID0gbWluaW11bTtcblx0XHR0aGlzLm1heGltdW0gPSBtYXhpbXVtO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlLCB0aGlzLm1pbmltdW0sIHRoaXMubWF4aW11bSk7XG5cdH1cbn1cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcGVkRmxvYXQ8VCBleHRlbmRzIG51bWJlcj4odmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogVCwgbWluaW11bTogbnVtYmVyLCBtYXhpbXVtOiBudW1iZXIpOiBudW1iZXIgfCBUIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdGNvbnN0IHIgPSBFZGl0b3JGbG9hdE9wdGlvbi5mbG9hdCh2YWx1ZSwgZGVmYXVsdFZhbHVlKTtcblx0cmV0dXJuIEVkaXRvckZsb2F0T3B0aW9uLmNsYW1wKHIsIG1pbmltdW0sIG1heGltdW0pO1xufVxuXG5jbGFzcyBFZGl0b3JGbG9hdE9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uPiBleHRlbmRzIFNpbXBsZUVkaXRvck9wdGlvbjxLLCBudW1iZXI+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbWluaW11bTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWF4aW11bTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBzdGF0aWMgY2xhbXAobjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChuIDwgbWluKSB7XG5cdFx0XHRyZXR1cm4gbWluO1xuXHRcdH1cblx0XHRpZiAobiA+IG1heCkge1xuXHRcdFx0cmV0dXJuIG1heDtcblx0XHR9XG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZsb2F0KHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8IGlzTmFOKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHZhbGlkYXRpb25GbjogKHZhbHVlOiBudW1iZXIpID0+IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihpZDogSywgbmFtZTogUG9zc2libGVLZXlOYW1lPG51bWJlcj4sIGRlZmF1bHRWYWx1ZTogbnVtYmVyLCB2YWxpZGF0aW9uRm46ICh2YWx1ZTogbnVtYmVyKSA9PiBudW1iZXIsIHNjaGVtYT86IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1pbmltdW0/OiBudW1iZXIsIG1heGltdW0/OiBudW1iZXIpIHtcblx0XHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHNjaGVtYS50eXBlID0gJ251bWJlcic7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHRcdHNjaGVtYS5taW5pbXVtID0gbWluaW11bTtcblx0XHRcdHNjaGVtYS5tYXhpbXVtID0gbWF4aW11bTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0XHR0aGlzLnZhbGlkYXRpb25GbiA9IHZhbGlkYXRpb25Gbjtcblx0XHR0aGlzLm1pbmltdW0gPSBtaW5pbXVtO1xuXHRcdHRoaXMubWF4aW11bSA9IG1heGltdW07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZhbGlkYXRpb25GbihFZGl0b3JGbG9hdE9wdGlvbi5mbG9hdChpbnB1dCwgdGhpcy5kZWZhdWx0VmFsdWUpKTtcblx0fVxufVxuXG5jbGFzcyBFZGl0b3JTdHJpbmdPcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbj4gZXh0ZW5kcyBTaW1wbGVFZGl0b3JPcHRpb248Sywgc3RyaW5nPiB7XG5cblx0cHVibGljIHN0YXRpYyBzdHJpbmcodmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxzdHJpbmc+LCBkZWZhdWx0VmFsdWU6IHN0cmluZywgc2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHR5cGVvZiBzY2hlbWEgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRzY2hlbWEudHlwZSA9ICdzdHJpbmcnO1xuXHRcdFx0c2NoZW1hLmRlZmF1bHQgPSBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdHN1cGVyKGlkLCBuYW1lLCBkZWZhdWx0VmFsdWUsIHNjaGVtYSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LCB0aGlzLmRlZmF1bHRWYWx1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ1NldDxUIGV4dGVuZHMgc3RyaW5nPih2YWx1ZTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBULCBhbGxvd2VkVmFsdWVzOiBSZWFkb25seUFycmF5PFQ+LCByZW5hbWVkVmFsdWVzPzogUmVjb3JkPHN0cmluZywgVD4pOiBUIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdGlmIChyZW5hbWVkVmFsdWVzICYmIHZhbHVlIGluIHJlbmFtZWRWYWx1ZXMpIHtcblx0XHRyZXR1cm4gcmVuYW1lZFZhbHVlc1t2YWx1ZV07XG5cdH1cblx0aWYgKGFsbG93ZWRWYWx1ZXMuaW5kZXhPZih2YWx1ZSBhcyBUKSA9PT0gLTEpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdHJldHVybiB2YWx1ZSBhcyBUO1xufVxuXG5jbGFzcyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24sIFYgZXh0ZW5kcyBzdHJpbmc+IGV4dGVuZHMgU2ltcGxlRWRpdG9yT3B0aW9uPEssIFY+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxvd2VkVmFsdWVzOiBSZWFkb25seUFycmF5PFY+O1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBLLCBuYW1lOiBQb3NzaWJsZUtleU5hbWU8Vj4sIGRlZmF1bHRWYWx1ZTogViwgYWxsb3dlZFZhbHVlczogUmVhZG9ubHlBcnJheTxWPiwgc2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHR5cGVvZiBzY2hlbWEgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRzY2hlbWEudHlwZSA9ICdzdHJpbmcnO1xuXHRcdFx0c2NoZW1hLmVudW0gPSBhbGxvd2VkVmFsdWVzLnNsaWNlKDApO1xuXHRcdFx0c2NoZW1hLmRlZmF1bHQgPSBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdHN1cGVyKGlkLCBuYW1lLCBkZWZhdWx0VmFsdWUsIHNjaGVtYSk7XG5cdFx0dGhpcy5fYWxsb3dlZFZhbHVlcyA9IGFsbG93ZWRWYWx1ZXM7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBWIHtcblx0XHRyZXR1cm4gc3RyaW5nU2V0PFY+KGlucHV0LCB0aGlzLmRlZmF1bHRWYWx1ZSwgdGhpcy5fYWxsb3dlZFZhbHVlcyk7XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yRW51bU9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uLCBUIGV4dGVuZHMgc3RyaW5nLCBWPiBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248SywgVCwgVj4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbG93ZWRWYWx1ZXM6IFRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udmVydDogKHZhbHVlOiBUKSA9PiBWO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBLLCBuYW1lOiBQb3NzaWJsZUtleU5hbWU8VD4sIGRlZmF1bHRWYWx1ZTogViwgZGVmYXVsdFN0cmluZ1ZhbHVlOiBzdHJpbmcsIGFsbG93ZWRWYWx1ZXM6IFRbXSwgY29udmVydDogKHZhbHVlOiBUKSA9PiBWLCBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHNjaGVtYS50eXBlID0gJ3N0cmluZyc7XG5cdFx0XHRzY2hlbWEuZW51bSA9IGFsbG93ZWRWYWx1ZXM7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRTdHJpbmdWYWx1ZTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0XHR0aGlzLl9hbGxvd2VkVmFsdWVzID0gYWxsb3dlZFZhbHVlcztcblx0XHR0aGlzLl9jb252ZXJ0ID0gY29udmVydDtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFYge1xuXHRcdGlmICh0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hbGxvd2VkVmFsdWVzLmluZGV4T2YoPFQ+aW5wdXQpID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udmVydCg8VD5pbnB1dCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBhdXRvSW5kZW50XG5cbmZ1bmN0aW9uIF9hdXRvSW5kZW50RnJvbVN0cmluZyhhdXRvSW5kZW50OiAnbm9uZScgfCAna2VlcCcgfCAnYnJhY2tldHMnIHwgJ2FkdmFuY2VkJyB8ICdmdWxsJyk6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB7XG5cdHN3aXRjaCAoYXV0b0luZGVudCkge1xuXHRcdGNhc2UgJ25vbmUnOiByZXR1cm4gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5Lk5vbmU7XG5cdFx0Y2FzZSAna2VlcCc6IHJldHVybiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuS2VlcDtcblx0XHRjYXNlICdicmFja2V0cyc6IHJldHVybiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuQnJhY2tldHM7XG5cdFx0Y2FzZSAnYWR2YW5jZWQnOiByZXR1cm4gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkFkdmFuY2VkO1xuXHRcdGNhc2UgJ2Z1bGwnOiByZXR1cm4gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGw7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBhY2Nlc3NpYmlsaXR5U3VwcG9ydFxuXG5jbGFzcyBFZGl0b3JBY2Nlc3NpYmlsaXR5U3VwcG9ydCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0LCAnYXV0bycgfCAnb2ZmJyB8ICdvbicsIEFjY2Vzc2liaWxpdHlTdXBwb3J0PiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQsICdhY2Nlc3NpYmlsaXR5U3VwcG9ydCcsIEFjY2Vzc2liaWxpdHlTdXBwb3J0LlVua25vd24sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2F1dG8nLCAnb24nLCAnb2ZmJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTdXBwb3J0LmF1dG8nLCBcIlVzZSBwbGF0Zm9ybSBBUElzIHRvIGRldGVjdCB3aGVuIGEgU2NyZWVuIFJlYWRlciBpcyBhdHRhY2hlZC5cIiksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U3VwcG9ydC5vbicsIFwiT3B0aW1pemUgZm9yIHVzYWdlIHdpdGggYSBTY3JlZW4gUmVhZGVyLlwiKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTdXBwb3J0Lm9mZicsIFwiQXNzdW1lIGEgc2NyZWVuIHJlYWRlciBpcyBub3QgYXR0YWNoZWQuXCIpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZWZhdWx0OiAnYXV0bycsXG5cdFx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U3VwcG9ydCcsIFwiQ29udHJvbHMgaWYgdGhlIFVJIHNob3VsZCBydW4gaW4gYSBtb2RlIHdoZXJlIGl0IGlzIG9wdGltaXplZCBmb3Igc2NyZWVuIHJlYWRlcnMuXCIpXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IEFjY2Vzc2liaWxpdHlTdXBwb3J0IHtcblx0XHRzd2l0Y2ggKGlucHV0KSB7XG5cdFx0XHRjYXNlICdhdXRvJzogcmV0dXJuIEFjY2Vzc2liaWxpdHlTdXBwb3J0LlVua25vd247XG5cdFx0XHRjYXNlICdvZmYnOiByZXR1cm4gQWNjZXNzaWJpbGl0eVN1cHBvcnQuRGlzYWJsZWQ7XG5cdFx0XHRjYXNlICdvbic6IHJldHVybiBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IEFjY2Vzc2liaWxpdHlTdXBwb3J0KTogQWNjZXNzaWJpbGl0eVN1cHBvcnQge1xuXHRcdGlmICh2YWx1ZSA9PT0gQWNjZXNzaWJpbGl0eVN1cHBvcnQuVW5rbm93bikge1xuXHRcdFx0Ly8gVGhlIGVkaXRvciByZWFkcyB0aGUgYGFjY2Vzc2liaWxpdHlTdXBwb3J0YCBmcm9tIHRoZSBlbnZpcm9ubWVudFxuXHRcdFx0cmV0dXJuIGVudi5hY2Nlc3NpYmlsaXR5U3VwcG9ydDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gY29tbWVudHNcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBjb21tZW50c1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JDb21tZW50c09wdGlvbnMge1xuXHQvKipcblx0ICogSW5zZXJ0IGEgc3BhY2UgYWZ0ZXIgdGhlIGxpbmUgY29tbWVudCB0b2tlbiBhbmQgaW5zaWRlIHRoZSBibG9jayBjb21tZW50cyB0b2tlbnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRpbnNlcnRTcGFjZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBJZ25vcmUgZW1wdHkgbGluZXMgd2hlbiBpbnNlcnRpbmcgbGluZSBjb21tZW50cy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGlnbm9yZUVtcHR5TGluZXM/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBFZGl0b3JDb21tZW50c09wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yQ29tbWVudHNPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvckNvbW1lbnRzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uY29tbWVudHMsIElFZGl0b3JDb21tZW50c09wdGlvbnMsIEVkaXRvckNvbW1lbnRzT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBFZGl0b3JDb21tZW50c09wdGlvbnMgPSB7XG5cdFx0XHRpbnNlcnRTcGFjZTogdHJ1ZSxcblx0XHRcdGlnbm9yZUVtcHR5TGluZXM6IHRydWUsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5jb21tZW50cywgJ2NvbW1lbnRzJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuY29tbWVudHMuaW5zZXJ0U3BhY2UnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmluc2VydFNwYWNlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmluc2VydFNwYWNlJywgXCJDb250cm9scyB3aGV0aGVyIGEgc3BhY2UgY2hhcmFjdGVyIGlzIGluc2VydGVkIHdoZW4gY29tbWVudGluZy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5jb21tZW50cy5pZ25vcmVFbXB0eUxpbmVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pZ25vcmVFbXB0eUxpbmVzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmlnbm9yZUVtcHR5TGluZXMnLCAnQ29udHJvbHMgaWYgZW1wdHkgbGluZXMgc2hvdWxkIGJlIGlnbm9yZWQgd2l0aCB0b2dnbGUsIGFkZCBvciByZW1vdmUgYWN0aW9ucyBmb3IgbGluZSBjb21tZW50cy4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yQ29tbWVudHNPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JDb21tZW50c09wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnNlcnRTcGFjZTogYm9vbGVhbihpbnB1dC5pbnNlcnRTcGFjZSwgdGhpcy5kZWZhdWx0VmFsdWUuaW5zZXJ0U3BhY2UpLFxuXHRcdFx0aWdub3JlRW1wdHlMaW5lczogYm9vbGVhbihpbnB1dC5pZ25vcmVFbXB0eUxpbmVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5pZ25vcmVFbXB0eUxpbmVzKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gY3Vyc29yQmxpbmtpbmdcblxuLyoqXG4gKiBUaGUga2luZCBvZiBhbmltYXRpb24gaW4gd2hpY2ggdGhlIGVkaXRvcidzIGN1cnNvciBzaG91bGQgYmUgcmVuZGVyZWQuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlIHtcblx0LyoqXG5cdCAqIEhpZGRlblxuXHQgKi9cblx0SGlkZGVuID0gMCxcblx0LyoqXG5cdCAqIEJsaW5raW5nXG5cdCAqL1xuXHRCbGluayA9IDEsXG5cdC8qKlxuXHQgKiBCbGlua2luZyB3aXRoIHNtb290aCBmYWRpbmdcblx0ICovXG5cdFNtb290aCA9IDIsXG5cdC8qKlxuXHQgKiBCbGlua2luZyB3aXRoIHByb2xvbmdlZCBmaWxsZWQgc3RhdGUgYW5kIHNtb290aCBmYWRpbmdcblx0ICovXG5cdFBoYXNlID0gMyxcblx0LyoqXG5cdCAqIEV4cGFuZCBjb2xsYXBzZSBhbmltYXRpb24gb24gdGhlIHkgYXhpc1xuXHQgKi9cblx0RXhwYW5kID0gNCxcblx0LyoqXG5cdCAqIE5vLUJsaW5raW5nXG5cdCAqL1xuXHRTb2xpZCA9IDVcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGN1cnNvckJsaW5raW5nU3R5bGVGcm9tU3RyaW5nKGN1cnNvckJsaW5raW5nU3R5bGU6ICdibGluaycgfCAnc21vb3RoJyB8ICdwaGFzZScgfCAnZXhwYW5kJyB8ICdzb2xpZCcpOiBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZSB7XG5cdHN3aXRjaCAoY3Vyc29yQmxpbmtpbmdTdHlsZSkge1xuXHRcdGNhc2UgJ2JsaW5rJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLkJsaW5rO1xuXHRcdGNhc2UgJ3Ntb290aCc6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5TbW9vdGg7XG5cdFx0Y2FzZSAncGhhc2UnOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuUGhhc2U7XG5cdFx0Y2FzZSAnZXhwYW5kJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLkV4cGFuZDtcblx0XHRjYXNlICdzb2xpZCc6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5Tb2xpZDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGN1cnNvclN0eWxlXG5cbi8qKlxuICogVGhlIHN0eWxlIGluIHdoaWNoIHRoZSBlZGl0b3IncyBjdXJzb3Igc2hvdWxkIGJlIHJlbmRlcmVkLlxuICovXG5leHBvcnQgZW51bSBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUge1xuXHQvKipcblx0ICogQXMgYSB2ZXJ0aWNhbCBsaW5lIChzaXR0aW5nIGJldHdlZW4gdHdvIGNoYXJhY3RlcnMpLlxuXHQgKi9cblx0TGluZSA9IDEsXG5cdC8qKlxuXHQgKiBBcyBhIGJsb2NrIChzaXR0aW5nIG9uIHRvcCBvZiBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRCbG9jayA9IDIsXG5cdC8qKlxuXHQgKiBBcyBhIGhvcml6b250YWwgbGluZSAoc2l0dGluZyB1bmRlciBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRVbmRlcmxpbmUgPSAzLFxuXHQvKipcblx0ICogQXMgYSB0aGluIHZlcnRpY2FsIGxpbmUgKHNpdHRpbmcgYmV0d2VlbiB0d28gY2hhcmFjdGVycykuXG5cdCAqL1xuXHRMaW5lVGhpbiA9IDQsXG5cdC8qKlxuXHQgKiBBcyBhbiBvdXRsaW5lZCBibG9jayAoc2l0dGluZyBvbiB0b3Agb2YgYSBjaGFyYWN0ZXIpLlxuXHQgKi9cblx0QmxvY2tPdXRsaW5lID0gNSxcblx0LyoqXG5cdCAqIEFzIGEgdGhpbiBob3Jpem9udGFsIGxpbmUgKHNpdHRpbmcgdW5kZXIgYSBjaGFyYWN0ZXIpLlxuXHQgKi9cblx0VW5kZXJsaW5lVGhpbiA9IDZcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGN1cnNvclN0eWxlVG9TdHJpbmcoY3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZSk6ICdsaW5lJyB8ICdibG9jaycgfCAndW5kZXJsaW5lJyB8ICdsaW5lLXRoaW4nIHwgJ2Jsb2NrLW91dGxpbmUnIHwgJ3VuZGVybGluZS10aGluJyB7XG5cdHN3aXRjaCAoY3Vyc29yU3R5bGUpIHtcblx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lOiByZXR1cm4gJ2xpbmUnO1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrOiByZXR1cm4gJ2Jsb2NrJztcblx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5VbmRlcmxpbmU6IHJldHVybiAndW5kZXJsaW5lJztcblx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lVGhpbjogcmV0dXJuICdsaW5lLXRoaW4nO1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrT3V0bGluZTogcmV0dXJuICdibG9jay1vdXRsaW5lJztcblx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5VbmRlcmxpbmVUaGluOiByZXR1cm4gJ3VuZGVybGluZS10aGluJztcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3Vyc29yU3R5bGVGcm9tU3RyaW5nKGN1cnNvclN0eWxlOiAnbGluZScgfCAnYmxvY2snIHwgJ3VuZGVybGluZScgfCAnbGluZS10aGluJyB8ICdibG9jay1vdXRsaW5lJyB8ICd1bmRlcmxpbmUtdGhpbicpOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUge1xuXHRzd2l0Y2ggKGN1cnNvclN0eWxlKSB7XG5cdFx0Y2FzZSAnbGluZSc6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZTtcblx0XHRjYXNlICdibG9jayc6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2s7XG5cdFx0Y2FzZSAndW5kZXJsaW5lJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5VbmRlcmxpbmU7XG5cdFx0Y2FzZSAnbGluZS10aGluJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lVGhpbjtcblx0XHRjYXNlICdibG9jay1vdXRsaW5lJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9ja091dGxpbmU7XG5cdFx0Y2FzZSAndW5kZXJsaW5lLXRoaW4nOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZVRoaW47XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBlZGl0b3JDbGFzc05hbWVcblxuY2xhc3MgRWRpdG9yQ2xhc3NOYW1lIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmVkaXRvckNsYXNzTmFtZSwgc3RyaW5nPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmVkaXRvckNsYXNzTmFtZSwgJycpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIF86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY2xhc3NOYW1lcyA9IFsnbW9uYWNvLWVkaXRvciddO1xuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZXh0cmFFZGl0b3JDbGFzc05hbWUpKSB7XG5cdFx0XHRjbGFzc05hbWVzLnB1c2gob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmV4dHJhRWRpdG9yQ2xhc3NOYW1lKSk7XG5cdFx0fVxuXHRcdGlmIChlbnYuZXh0cmFFZGl0b3JDbGFzc05hbWUpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaChlbnYuZXh0cmFFZGl0b3JDbGFzc05hbWUpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm1vdXNlU3R5bGUpID09PSAnZGVmYXVsdCcpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaCgnbW91c2UtZGVmYXVsdCcpO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm1vdXNlU3R5bGUpID09PSAnY29weScpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaCgnbW91c2UtY29weScpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd1VudXNlZCkpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaCgnc2hvd1VudXNlZCcpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd0RlcHJlY2F0ZWQpKSB7XG5cdFx0XHRjbGFzc05hbWVzLnB1c2goJ3Nob3dEZXByZWNhdGVkJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNsYXNzTmFtZXMuam9pbignICcpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmRcblxuY2xhc3MgRWRpdG9yRW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQgZXh0ZW5kcyBFZGl0b3JCb29sZWFuT3B0aW9uPEVkaXRvck9wdGlvbi5lbXB0eVNlbGVjdGlvbkNsaXBib2FyZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkLCAnZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQnLCB0cnVlLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsIFwiQ29udHJvbHMgd2hldGhlciBjb3B5aW5nIHdpdGhvdXQgYSBzZWxlY3Rpb24gY29waWVzIHRoZSBjdXJyZW50IGxpbmUuXCIpIH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHZhbHVlICYmIGVudi5lbXB0eVNlbGVjdGlvbkNsaXBib2FyZDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZpbmRcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBmaW5kIHdpZGdldFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JGaW5kT3B0aW9ucyB7XG5cdC8qKlxuXHQqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGN1cnNvciBzaG91bGQgbW92ZSB0byBmaW5kIG1hdGNoZXMgd2hpbGUgdHlwaW5nLlxuXHQqL1xuXHRjdXJzb3JNb3ZlT25UeXBlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGZpbmQgd2lkZ2V0IHNob3VsZCBzZWFyY2ggYXMgeW91IHR5cGUuXG5cdCAqL1xuXHRmaW5kT25UeXBlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIGlmIHdlIHNlZWQgc2VhcmNoIHN0cmluZyBpbiB0aGUgRmluZCBXaWRnZXQgd2l0aCBlZGl0b3Igc2VsZWN0aW9uLlxuXHQgKi9cblx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24/OiAnbmV2ZXInIHwgJ2Fsd2F5cycgfCAnc2VsZWN0aW9uJztcblx0LyoqXG5cdCAqIENvbnRyb2xzIGlmIEZpbmQgaW4gU2VsZWN0aW9uIGZsYWcgaXMgdHVybmVkIG9uIGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRhdXRvRmluZEluU2VsZWN0aW9uPzogJ25ldmVyJyB8ICdhbHdheXMnIHwgJ211bHRpbGluZSc7XG5cdC8qXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIEZpbmQgV2lkZ2V0IHNob3VsZCBhZGQgZXh0cmEgbGluZXMgb24gdG9wIG9mIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRhZGRFeHRyYVNwYWNlT25Ub3A/OiBib29sZWFuO1xuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqIENvbnRyb2xzIGlmIHRoZSBGaW5kIFdpZGdldCBzaG91bGQgcmVhZCBvciBtb2RpZnkgdGhlIHNoYXJlZCBmaW5kIGNsaXBib2FyZCBvbiBtYWNPU1xuXHQgKi9cblx0Z2xvYmFsRmluZENsaXBib2FyZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBzZWFyY2ggcmVzdWx0IGFuZCBkaWZmIHJlc3VsdCBhdXRvbWF0aWNhbGx5IHJlc3RhcnRzIGZyb20gdGhlIGJlZ2lubmluZyAob3IgdGhlIGVuZCkgd2hlbiBubyBmdXJ0aGVyIG1hdGNoZXMgY2FuIGJlIGZvdW5kXG5cdCAqL1xuXHRsb29wPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gY2xvc2UgdGhlIEZpbmQgV2lkZ2V0IGFmdGVyIGFuIGV4cGxpY2l0IGZpbmQgbmF2aWdhdGlvbiBjb21tYW5kIGxhbmRzIG9uIGEgbWF0Y2guXG5cdCAqL1xuXHRjbG9zZU9uUmVzdWx0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKiBDb250cm9scyBob3cgdGhlIGZpbmQgd2lkZ2V0IHNlYXJjaCBoaXN0b3J5IHNob3VsZCBiZSBzdG9yZWRcblx0ICovXG5cdGhpc3Rvcnk/OiAnbmV2ZXInIHwgJ3dvcmtzcGFjZSc7XG5cdC8qKlxuXHQgKiBAaW50ZXJuYWxcblx0ICogQ29udHJvbHMgaG93IHRoZSByZXBsYWNlIHdpZGdldCBzZWFyY2ggaGlzdG9yeSBzaG91bGQgYmUgc3RvcmVkXG5cdCAqL1xuXHRyZXBsYWNlSGlzdG9yeT86ICduZXZlcicgfCAnd29ya3NwYWNlJztcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yRmluZE9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yRmluZE9wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yRmluZCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmZpbmQsIElFZGl0b3JGaW5kT3B0aW9ucywgRWRpdG9yRmluZE9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogRWRpdG9yRmluZE9wdGlvbnMgPSB7XG5cdFx0XHRjdXJzb3JNb3ZlT25UeXBlOiB0cnVlLFxuXHRcdFx0ZmluZE9uVHlwZTogdHJ1ZSxcblx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAnYWx3YXlzJyxcblx0XHRcdGF1dG9GaW5kSW5TZWxlY3Rpb246ICduZXZlcicsXG5cdFx0XHRnbG9iYWxGaW5kQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdGFkZEV4dHJhU3BhY2VPblRvcDogdHJ1ZSxcblx0XHRcdGxvb3A6IHRydWUsXG5cdFx0XHRjbG9zZU9uUmVzdWx0OiBmYWxzZSxcblx0XHRcdGhpc3Rvcnk6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0cmVwbGFjZUhpc3Rvcnk6ICd3b3Jrc3BhY2UnLFxuXHRcdH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uZmluZCwgJ2ZpbmQnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5maW5kLmN1cnNvck1vdmVPblR5cGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmN1cnNvck1vdmVPblR5cGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5jdXJzb3JNb3ZlT25UeXBlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBjdXJzb3Igc2hvdWxkIGp1bXAgdG8gZmluZCBtYXRjaGVzIHdoaWxlIHR5cGluZy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5maW5kLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbmV2ZXInLCAnYWx3YXlzJywgJ3NlbGVjdGlvbiddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24ubmV2ZXInLCAnTmV2ZXIgc2VlZCBzZWFyY2ggc3RyaW5nIGZyb20gdGhlIGVkaXRvciBzZWxlY3Rpb24uJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uLmFsd2F5cycsICdBbHdheXMgc2VlZCBzZWFyY2ggc3RyaW5nIGZyb20gdGhlIGVkaXRvciBzZWxlY3Rpb24sIGluY2x1ZGluZyB3b3JkIGF0IGN1cnNvciBwb3NpdGlvbi4nKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24uc2VsZWN0aW9uJywgJ09ubHkgc2VlZCBzZWFyY2ggc3RyaW5nIGZyb20gdGhlIGVkaXRvciBzZWxlY3Rpb24uJylcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbmQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHNlYXJjaCBzdHJpbmcgaW4gdGhlIEZpbmQgV2lkZ2V0IGlzIHNlZWRlZCBmcm9tIHRoZSBlZGl0b3Igc2VsZWN0aW9uLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQuYXV0b0ZpbmRJblNlbGVjdGlvbic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ25ldmVyJywgJ2Fsd2F5cycsICdtdWx0aWxpbmUnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hdXRvRmluZEluU2VsZWN0aW9uLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuYXV0b0ZpbmRJblNlbGVjdGlvbi5uZXZlcicsICdOZXZlciB0dXJuIG9uIEZpbmQgaW4gU2VsZWN0aW9uIGF1dG9tYXRpY2FsbHkgKGRlZmF1bHQpLicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5hdXRvRmluZEluU2VsZWN0aW9uLmFsd2F5cycsICdBbHdheXMgdHVybiBvbiBGaW5kIGluIFNlbGVjdGlvbiBhdXRvbWF0aWNhbGx5LicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5hdXRvRmluZEluU2VsZWN0aW9uLm11bHRpbGluZScsICdUdXJuIG9uIEZpbmQgaW4gU2VsZWN0aW9uIGF1dG9tYXRpY2FsbHkgd2hlbiBtdWx0aXBsZSBsaW5lcyBvZiBjb250ZW50IGFyZSBzZWxlY3RlZC4nKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5hdXRvRmluZEluU2VsZWN0aW9uJywgXCJDb250cm9scyB0aGUgY29uZGl0aW9uIGZvciB0dXJuaW5nIG9uIEZpbmQgaW4gU2VsZWN0aW9uIGF1dG9tYXRpY2FsbHkuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5nbG9iYWxGaW5kQ2xpcGJvYXJkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5nbG9iYWxGaW5kQ2xpcGJvYXJkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbmQuZ2xvYmFsRmluZENsaXBib2FyZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRmluZCBXaWRnZXQgc2hvdWxkIHJlYWQgb3IgbW9kaWZ5IHRoZSBzaGFyZWQgZmluZCBjbGlwYm9hcmQgb24gbWFjT1MuXCIpLFxuXHRcdFx0XHRcdGluY2x1ZGVkOiBwbGF0Zm9ybS5pc01hY2ludG9zaFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQuYWRkRXh0cmFTcGFjZU9uVG9wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hZGRFeHRyYVNwYWNlT25Ub3AsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5hZGRFeHRyYVNwYWNlT25Ub3AnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEZpbmQgV2lkZ2V0IHNob3VsZCBhZGQgZXh0cmEgbGluZXMgb24gdG9wIG9mIHRoZSBlZGl0b3IuIFdoZW4gdHJ1ZSwgeW91IGNhbiBzY3JvbGwgYmV5b25kIHRoZSBmaXJzdCBsaW5lIHdoZW4gdGhlIEZpbmQgV2lkZ2V0IGlzIHZpc2libGUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5sb29wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5sb29wLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbmQubG9vcCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc2VhcmNoIGF1dG9tYXRpY2FsbHkgcmVzdGFydHMgZnJvbSB0aGUgYmVnaW5uaW5nIChvciB0aGUgZW5kKSB3aGVuIG5vIGZ1cnRoZXIgbWF0Y2hlcyBjYW4gYmUgZm91bmQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5jbG9zZU9uUmVzdWx0Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5jbG9zZU9uUmVzdWx0LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbmQuY2xvc2VPblJlc3VsdCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRmluZCBXaWRnZXQgY2xvc2VzIGFmdGVyIGFuIGV4cGxpY2l0IGZpbmQgbmF2aWdhdGlvbiBjb21tYW5kIGxhbmRzIG9uIGEgcmVzdWx0LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQuaGlzdG9yeSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ25ldmVyJywgJ3dvcmtzcGFjZSddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuaGlzdG9yeS5uZXZlcicsICdEbyBub3Qgc3RvcmUgc2VhcmNoIGhpc3RvcnkgZnJvbSB0aGUgZmluZCB3aWRnZXQuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLmhpc3Rvcnkud29ya3NwYWNlJywgJ1N0b3JlIHNlYXJjaCBoaXN0b3J5IGFjcm9zcyB0aGUgYWN0aXZlIHdvcmtzcGFjZScpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5oaXN0b3J5JywgXCJDb250cm9scyBob3cgdGhlIGZpbmQgd2lkZ2V0IGhpc3Rvcnkgc2hvdWxkIGJlIHN0b3JlZFwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQucmVwbGFjZUhpc3RvcnknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWyduZXZlcicsICd3b3Jrc3BhY2UnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnd29ya3NwYWNlJyxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLnJlcGxhY2VIaXN0b3J5Lm5ldmVyJywgJ0RvIG5vdCBzdG9yZSBoaXN0b3J5IGZyb20gdGhlIHJlcGxhY2Ugd2lkZ2V0LicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5yZXBsYWNlSGlzdG9yeS53b3Jrc3BhY2UnLCAnU3RvcmUgcmVwbGFjZSBoaXN0b3J5IGFjcm9zcyB0aGUgYWN0aXZlIHdvcmtzcGFjZScpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5yZXBsYWNlSGlzdG9yeScsIFwiQ29udHJvbHMgaG93IHRoZSByZXBsYWNlIHdpZGdldCBoaXN0b3J5IHNob3VsZCBiZSBzdG9yZWRcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5maW5kLmZpbmRPblR5cGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmZpbmRPblR5cGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5maW5kT25UeXBlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBGaW5kIFdpZGdldCBzaG91bGQgc2VhcmNoIGFzIHlvdSB0eXBlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yRmluZE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvckZpbmRPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3Vyc29yTW92ZU9uVHlwZTogYm9vbGVhbihpbnB1dC5jdXJzb3JNb3ZlT25UeXBlLCB0aGlzLmRlZmF1bHRWYWx1ZS5jdXJzb3JNb3ZlT25UeXBlKSxcblx0XHRcdGZpbmRPblR5cGU6IGJvb2xlYW4oaW5wdXQuZmluZE9uVHlwZSwgdGhpcy5kZWZhdWx0VmFsdWUuZmluZE9uVHlwZSksXG5cdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogdHlwZW9mIGlucHV0LnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID09PSAnYm9vbGVhbidcblx0XHRcdFx0PyAoaW5wdXQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPyAnYWx3YXlzJyA6ICduZXZlcicpXG5cdFx0XHRcdDogc3RyaW5nU2V0PCduZXZlcicgfCAnYWx3YXlzJyB8ICdzZWxlY3Rpb24nPihpbnB1dC5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiwgdGhpcy5kZWZhdWx0VmFsdWUuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24sIFsnbmV2ZXInLCAnYWx3YXlzJywgJ3NlbGVjdGlvbiddKSxcblx0XHRcdGF1dG9GaW5kSW5TZWxlY3Rpb246IHR5cGVvZiBpbnB1dC5hdXRvRmluZEluU2VsZWN0aW9uID09PSAnYm9vbGVhbidcblx0XHRcdFx0PyAoaW5wdXQuYXV0b0ZpbmRJblNlbGVjdGlvbiA/ICdhbHdheXMnIDogJ25ldmVyJylcblx0XHRcdFx0OiBzdHJpbmdTZXQ8J25ldmVyJyB8ICdhbHdheXMnIHwgJ211bHRpbGluZSc+KGlucHV0LmF1dG9GaW5kSW5TZWxlY3Rpb24sIHRoaXMuZGVmYXVsdFZhbHVlLmF1dG9GaW5kSW5TZWxlY3Rpb24sIFsnbmV2ZXInLCAnYWx3YXlzJywgJ211bHRpbGluZSddKSxcblx0XHRcdGdsb2JhbEZpbmRDbGlwYm9hcmQ6IGJvb2xlYW4oaW5wdXQuZ2xvYmFsRmluZENsaXBib2FyZCwgdGhpcy5kZWZhdWx0VmFsdWUuZ2xvYmFsRmluZENsaXBib2FyZCksXG5cdFx0XHRhZGRFeHRyYVNwYWNlT25Ub3A6IGJvb2xlYW4oaW5wdXQuYWRkRXh0cmFTcGFjZU9uVG9wLCB0aGlzLmRlZmF1bHRWYWx1ZS5hZGRFeHRyYVNwYWNlT25Ub3ApLFxuXHRcdFx0bG9vcDogYm9vbGVhbihpbnB1dC5sb29wLCB0aGlzLmRlZmF1bHRWYWx1ZS5sb29wKSxcblx0XHRcdGNsb3NlT25SZXN1bHQ6IGJvb2xlYW4oaW5wdXQuY2xvc2VPblJlc3VsdCwgdGhpcy5kZWZhdWx0VmFsdWUuY2xvc2VPblJlc3VsdCksXG5cdFx0XHRoaXN0b3J5OiBzdHJpbmdTZXQ8J25ldmVyJyB8ICd3b3Jrc3BhY2UnPihpbnB1dC5oaXN0b3J5LCB0aGlzLmRlZmF1bHRWYWx1ZS5oaXN0b3J5LCBbJ25ldmVyJywgJ3dvcmtzcGFjZSddKSxcblx0XHRcdHJlcGxhY2VIaXN0b3J5OiBzdHJpbmdTZXQ8J25ldmVyJyB8ICd3b3Jrc3BhY2UnPihpbnB1dC5yZXBsYWNlSGlzdG9yeSwgdGhpcy5kZWZhdWx0VmFsdWUucmVwbGFjZUhpc3RvcnksIFsnbmV2ZXInLCAnd29ya3NwYWNlJ10pLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBmb250TGlnYXR1cmVzXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjbGFzcyBFZGl0b3JGb250TGlnYXR1cmVzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZm9udExpZ2F0dXJlcywgYm9vbGVhbiB8IHN0cmluZywgc3RyaW5nPiB7XG5cblx0cHVibGljIHN0YXRpYyBPRkYgPSAnXCJsaWdhXCIgb2ZmLCBcImNhbHRcIiBvZmYnO1xuXHRwdWJsaWMgc3RhdGljIE9OID0gJ1wibGlnYVwiIG9uLCBcImNhbHRcIiBvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uZm9udExpZ2F0dXJlcywgJ2ZvbnRMaWdhdHVyZXMnLCBFZGl0b3JGb250TGlnYXR1cmVzLk9GRixcblx0XHRcdHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250TGlnYXR1cmVzJywgXCJFbmFibGVzL0Rpc2FibGVzIGZvbnQgbGlnYXR1cmVzICgnY2FsdCcgYW5kICdsaWdhJyBmb250IGZlYXR1cmVzKS4gQ2hhbmdlIHRoaXMgdG8gYSBzdHJpbmcgZm9yIGZpbmUtZ3JhaW5lZCBjb250cm9sIG9mIHRoZSAnZm9udC1mZWF0dXJlLXNldHRpbmdzJyBDU1MgcHJvcGVydHkuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250RmVhdHVyZVNldHRpbmdzJywgXCJFeHBsaWNpdCAnZm9udC1mZWF0dXJlLXNldHRpbmdzJyBDU1MgcHJvcGVydHkuIEEgYm9vbGVhbiBjYW4gYmUgcGFzc2VkIGluc3RlYWQgaWYgb25lIG9ubHkgbmVlZHMgdG8gdHVybiBvbi9vZmYgbGlnYXR1cmVzLlwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9udExpZ2F0dXJlc0dlbmVyYWwnLCBcIkNvbmZpZ3VyZXMgZm9udCBsaWdhdHVyZXMgb3IgZm9udCBmZWF0dXJlcy4gQ2FuIGJlIGVpdGhlciBhIGJvb2xlYW4gdG8gZW5hYmxlL2Rpc2FibGUgbGlnYXR1cmVzIG9yIGEgc3RyaW5nIGZvciB0aGUgdmFsdWUgb2YgdGhlIENTUyAnZm9udC1mZWF0dXJlLXNldHRpbmdzJyBwcm9wZXJ0eS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGlmIChpbnB1dCA9PT0gJ2ZhbHNlJyB8fCBpbnB1dC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlucHV0ID09PSAndHJ1ZScpIHtcblx0XHRcdFx0cmV0dXJuIEVkaXRvckZvbnRMaWdhdHVyZXMuT047XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXHRcdGlmIChCb29sZWFuKGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvckZvbnRMaWdhdHVyZXMuT047XG5cdFx0fVxuXHRcdHJldHVybiBFZGl0b3JGb250TGlnYXR1cmVzLk9GRjtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZvbnRWYXJpYXRpb25zXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjbGFzcyBFZGl0b3JGb250VmFyaWF0aW9ucyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmZvbnRWYXJpYXRpb25zLCBib29sZWFuIHwgc3RyaW5nLCBzdHJpbmc+IHtcblx0Ly8gVGV4dCBpcyBsYWlkIG91dCB1c2luZyBkZWZhdWx0IHNldHRpbmdzLlxuXHRwdWJsaWMgc3RhdGljIE9GRiA9IEZPTlRfVkFSSUFUSU9OX09GRjtcblxuXHQvLyBUcmFuc2xhdGUgYGZvbnRXZWlnaHRgIGNvbmZpZyB0byB0aGUgYGZvbnQtdmFyaWF0aW9uLXNldHRpbmdzYCBDU1MgcHJvcGVydHkuXG5cdHB1YmxpYyBzdGF0aWMgVFJBTlNMQVRFID0gRk9OVF9WQVJJQVRJT05fVFJBTlNMQVRFO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmZvbnRWYXJpYXRpb25zLCAnZm9udFZhcmlhdGlvbnMnLCBFZGl0b3JGb250VmFyaWF0aW9ucy5PRkYsXG5cdFx0XHR7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9udFZhcmlhdGlvbnMnLCBcIkVuYWJsZXMvRGlzYWJsZXMgdGhlIHRyYW5zbGF0aW9uIGZyb20gZm9udC13ZWlnaHQgdG8gZm9udC12YXJpYXRpb24tc2V0dGluZ3MuIENoYW5nZSB0aGlzIHRvIGEgc3RyaW5nIGZvciBmaW5lLWdyYWluZWQgY29udHJvbCBvZiB0aGUgJ2ZvbnQtdmFyaWF0aW9uLXNldHRpbmdzJyBDU1MgcHJvcGVydHkuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250VmFyaWF0aW9uU2V0dGluZ3MnLCBcIkV4cGxpY2l0ICdmb250LXZhcmlhdGlvbi1zZXR0aW5ncycgQ1NTIHByb3BlcnR5LiBBIGJvb2xlYW4gY2FuIGJlIHBhc3NlZCBpbnN0ZWFkIGlmIG9uZSBvbmx5IG5lZWRzIHRvIHRyYW5zbGF0ZSBmb250LXdlaWdodCB0byBmb250LXZhcmlhdGlvbi1zZXR0aW5ncy5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRWYXJpYXRpb25zR2VuZXJhbCcsIFwiQ29uZmlndXJlcyBmb250IHZhcmlhdGlvbnMuIENhbiBiZSBlaXRoZXIgYSBib29sZWFuIHRvIGVuYWJsZS9kaXNhYmxlIHRoZSB0cmFuc2xhdGlvbiBmcm9tIGZvbnQtd2VpZ2h0IHRvIGZvbnQtdmFyaWF0aW9uLXNldHRpbmdzIG9yIGEgc3RyaW5nIGZvciB0aGUgdmFsdWUgb2YgdGhlIENTUyAnZm9udC12YXJpYXRpb24tc2V0dGluZ3MnIHByb3BlcnR5LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKGlucHV0ID09PSAnZmFsc2UnKSB7XG5cdFx0XHRcdHJldHVybiBFZGl0b3JGb250VmFyaWF0aW9ucy5PRkY7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5wdXQgPT09ICd0cnVlJykge1xuXHRcdFx0XHRyZXR1cm4gRWRpdG9yRm9udFZhcmlhdGlvbnMuVFJBTlNMQVRFO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdH1cblx0XHRpZiAoQm9vbGVhbihpbnB1dCkpIHtcblx0XHRcdHJldHVybiBFZGl0b3JGb250VmFyaWF0aW9ucy5UUkFOU0xBVEU7XG5cdFx0fVxuXHRcdHJldHVybiBFZGl0b3JGb250VmFyaWF0aW9ucy5PRkY7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gVGhlIHZhbHVlIGlzIGNvbXB1dGVkIGZyb20gdGhlIGZvbnRXZWlnaHQgaWYgaXQgaXMgdHJ1ZS5cblx0XHQvLyBTbyB0YWtlIHRoZSByZXN1bHQgZnJvbSBlbnYuZm9udEluZm9cblx0XHRyZXR1cm4gZW52LmZvbnRJbmZvLmZvbnRWYXJpYXRpb25TZXR0aW5ncztcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZvbnRJbmZvXG5cbmNsYXNzIEVkaXRvckZvbnRJbmZvIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmZvbnRJbmZvLCBGb250SW5mbz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5mb250SW5mbywgbmV3IEZvbnRJbmZvKHtcblx0XHRcdHBpeGVsUmF0aW86IDAsXG5cdFx0XHRmb250RmFtaWx5OiAnJyxcblx0XHRcdGZvbnRXZWlnaHQ6ICcnLFxuXHRcdFx0Zm9udFNpemU6IDAsXG5cdFx0XHRmb250RmVhdHVyZVNldHRpbmdzOiAnJyxcblx0XHRcdGZvbnRWYXJpYXRpb25TZXR0aW5nczogJycsXG5cdFx0XHRsaW5lSGVpZ2h0OiAwLFxuXHRcdFx0bGV0dGVyU3BhY2luZzogMCxcblx0XHRcdGlzTW9ub3NwYWNlOiBmYWxzZSxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMCxcblx0XHRcdHR5cGljYWxGdWxsd2lkdGhDaGFyYWN0ZXJXaWR0aDogMCxcblx0XHRcdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogZmFsc2UsXG5cdFx0XHRzcGFjZVdpZHRoOiAwLFxuXHRcdFx0bWlkZG90V2lkdGg6IDAsXG5cdFx0XHR3c21pZGRvdFdpZHRoOiAwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMCxcblx0XHR9LCBmYWxzZSkpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIF86IEZvbnRJbmZvKTogRm9udEluZm8ge1xuXHRcdHJldHVybiBlbnYuZm9udEluZm87XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBlZmZlY3RpdmVDdXJzb3JTdHlsZVxuXG5jbGFzcyBFZmZlY3RpdmVDdXJzb3JTdHlsZSBleHRlbmRzIENvbXB1dGVkRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5lZmZlY3RpdmVDdXJzb3JTdHlsZSwgVGV4dEVkaXRvckN1cnNvclN0eWxlPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUN1cnNvclN0eWxlLCBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgXzogVGV4dEVkaXRvckN1cnNvclN0eWxlKTogVGV4dEVkaXRvckN1cnNvclN0eWxlIHtcblx0XHRyZXR1cm4gZW52LmlucHV0TW9kZSA9PT0gJ292ZXJ0eXBlJyA/XG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24ub3ZlcnR5cGVDdXJzb3JTdHlsZSkgOlxuXHRcdFx0b3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmN1cnNvclN0eWxlKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGVmZmVjdGl2ZUV4cGVyaW1lbnRhbEVkaXRDb250ZXh0XG5cbmNsYXNzIEVmZmVjdGl2ZUVkaXRDb250ZXh0RW5hYmxlZCBleHRlbmRzIENvbXB1dGVkRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5lZmZlY3RpdmVFZGl0Q29udGV4dCwgYm9vbGVhbj4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5lZmZlY3RpdmVFZGl0Q29udGV4dCwgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZW52LmVkaXRDb250ZXh0U3VwcG9ydGVkICYmIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5lZGl0Q29udGV4dCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBlZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHNcblxuY2xhc3MgRWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250cywgYm9vbGVhbj4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5lZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSBlbnYuYWNjZXNzaWJpbGl0eVN1cHBvcnQ7XG5cdFx0aWYgKGFjY2Vzc2liaWxpdHlTdXBwb3J0ID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVGb250c0luQWNjZXNzaWJpbGl0eU1vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVGb250cyk7XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZ3JlZ2lvblxuXG4vLyNyZWdpb24gZm9udFNpemVcblxuY2xhc3MgRWRpdG9yRm9udFNpemUgZXh0ZW5kcyBTaW1wbGVFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmZvbnRTaXplLCBudW1iZXI+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5mb250U2l6ZSwgJ2ZvbnRTaXplJywgRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udFNpemUsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRtaW5pbXVtOiA2LFxuXHRcdFx0XHRtYXhpbXVtOiAxMDAsXG5cdFx0XHRcdGRlZmF1bHQ6IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRTaXplLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBpbiBwaXhlbHMuXCIpXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IG51bWJlciB7XG5cdFx0Y29uc3QgciA9IEVkaXRvckZsb2F0T3B0aW9uLmZsb2F0KGlucHV0LCB0aGlzLmRlZmF1bHRWYWx1ZSk7XG5cdFx0aWYgKHIgPT09IDApIHtcblx0XHRcdHJldHVybiBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250U2l6ZTtcblx0XHR9XG5cdFx0cmV0dXJuIEVkaXRvckZsb2F0T3B0aW9uLmNsYW1wKHIsIDYsIDEwMCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdC8vIFRoZSBmaW5hbCBmb250U2l6ZSByZXNwZWN0cyB0aGUgZWRpdG9yIHpvb20gbGV2ZWwuXG5cdFx0Ly8gU28gdGFrZSB0aGUgcmVzdWx0IGZyb20gZW52LmZvbnRJbmZvXG5cdFx0cmV0dXJuIGVudi5mb250SW5mby5mb250U2l6ZTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZvbnRXZWlnaHRcblxuY2xhc3MgRWRpdG9yRm9udFdlaWdodCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmZvbnRXZWlnaHQsIHN0cmluZywgc3RyaW5nPiB7XG5cdHByaXZhdGUgc3RhdGljIFNVR0dFU1RJT05fVkFMVUVTID0gWydub3JtYWwnLCAnYm9sZCcsICcxMDAnLCAnMjAwJywgJzMwMCcsICc0MDAnLCAnNTAwJywgJzYwMCcsICc3MDAnLCAnODAwJywgJzkwMCddO1xuXHRwcml2YXRlIHN0YXRpYyBNSU5JTVVNX1ZBTFVFID0gMTtcblx0cHJpdmF0ZSBzdGF0aWMgTUFYSU1VTV9WQUxVRSA9IDEwMDA7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uZm9udFdlaWdodCwgJ2ZvbnRXZWlnaHQnLCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250V2VpZ2h0LFxuXHRcdFx0e1xuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0bWluaW11bTogRWRpdG9yRm9udFdlaWdodC5NSU5JTVVNX1ZBTFVFLFxuXHRcdFx0XHRcdFx0bWF4aW11bTogRWRpdG9yRm9udFdlaWdodC5NQVhJTVVNX1ZBTFVFLFxuXHRcdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2ZvbnRXZWlnaHRFcnJvck1lc3NhZ2UnLCBcIk9ubHkgXFxcIm5vcm1hbFxcXCIgYW5kIFxcXCJib2xkXFxcIiBrZXl3b3JkcyBvciBudW1iZXJzIGJldHdlZW4gMSBhbmQgMTAwMCBhcmUgYWxsb3dlZC5cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogJ14obm9ybWFsfGJvbGR8MTAwMHxbMS05XVswLTldezAsMn0pJCdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVudW06IEVkaXRvckZvbnRXZWlnaHQuU1VHR0VTVElPTl9WQUxVRVNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRXZWlnaHQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRXZWlnaHQnLCBcIkNvbnRyb2xzIHRoZSBmb250IHdlaWdodC4gQWNjZXB0cyBcXFwibm9ybWFsXFxcIiBhbmQgXFxcImJvbGRcXFwiIGtleXdvcmRzIG9yIG51bWJlcnMgYmV0d2VlbiAxIGFuZCAxMDAwLlwiKVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBzdHJpbmcge1xuXHRcdGlmIChpbnB1dCA9PT0gJ25vcm1hbCcgfHwgaW5wdXQgPT09ICdib2xkJykge1xuXHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdH1cblx0XHRyZXR1cm4gU3RyaW5nKEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250V2VpZ2h0LCBFZGl0b3JGb250V2VpZ2h0Lk1JTklNVU1fVkFMVUUsIEVkaXRvckZvbnRXZWlnaHQuTUFYSU1VTV9WQUxVRSkpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZ290b0xvY2F0aW9uXG5cbmV4cG9ydCB0eXBlIEdvVG9Mb2NhdGlvblZhbHVlcyA9ICdwZWVrJyB8ICdnb3RvQW5kUGVlaycgfCAnZ290byc7XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBnbyB0byBsb2NhdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIElHb3RvTG9jYXRpb25PcHRpb25zIHtcblxuXHRtdWx0aXBsZT86IEdvVG9Mb2NhdGlvblZhbHVlcztcblxuXHRtdWx0aXBsZURlZmluaXRpb25zPzogR29Ub0xvY2F0aW9uVmFsdWVzO1xuXHRtdWx0aXBsZVR5cGVEZWZpbml0aW9ucz86IEdvVG9Mb2NhdGlvblZhbHVlcztcblx0bXVsdGlwbGVEZWNsYXJhdGlvbnM/OiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cdG11bHRpcGxlSW1wbGVtZW50YXRpb25zPzogR29Ub0xvY2F0aW9uVmFsdWVzO1xuXHRtdWx0aXBsZVJlZmVyZW5jZXM/OiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cdG11bHRpcGxlVGVzdHM/OiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cblx0YWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZD86IHN0cmluZztcblx0YWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQ/OiBzdHJpbmc7XG5cdGFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kPzogc3RyaW5nO1xuXHRhbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZD86IHN0cmluZztcblx0YWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kPzogc3RyaW5nO1xuXHRhbHRlcm5hdGl2ZVRlc3RzQ29tbWFuZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgR29Ub0xvY2F0aW9uT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElHb3RvTG9jYXRpb25PcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvckdvVG9Mb2NhdGlvbiBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbiwgSUdvdG9Mb2NhdGlvbk9wdGlvbnMsIEdvVG9Mb2NhdGlvbk9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogR29Ub0xvY2F0aW9uT3B0aW9ucyA9IHtcblx0XHRcdG11bHRpcGxlOiAncGVlaycsXG5cdFx0XHRtdWx0aXBsZURlZmluaXRpb25zOiAncGVlaycsXG5cdFx0XHRtdWx0aXBsZVR5cGVEZWZpbml0aW9uczogJ3BlZWsnLFxuXHRcdFx0bXVsdGlwbGVEZWNsYXJhdGlvbnM6ICdwZWVrJyxcblx0XHRcdG11bHRpcGxlSW1wbGVtZW50YXRpb25zOiAncGVlaycsXG5cdFx0XHRtdWx0aXBsZVJlZmVyZW5jZXM6ICdwZWVrJyxcblx0XHRcdG11bHRpcGxlVGVzdHM6ICdwZWVrJyxcblx0XHRcdGFsdGVybmF0aXZlRGVmaW5pdGlvbkNvbW1hbmQ6ICdlZGl0b3IuYWN0aW9uLmdvVG9SZWZlcmVuY2VzJyxcblx0XHRcdGFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kOiAnZWRpdG9yLmFjdGlvbi5nb1RvUmVmZXJlbmNlcycsXG5cdFx0XHRhbHRlcm5hdGl2ZURlY2xhcmF0aW9uQ29tbWFuZDogJ2VkaXRvci5hY3Rpb24uZ29Ub1JlZmVyZW5jZXMnLFxuXHRcdFx0YWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQ6ICcnLFxuXHRcdFx0YWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kOiAnJyxcblx0XHRcdGFsdGVybmF0aXZlVGVzdHNDb21tYW5kOiAnJyxcblx0XHR9O1xuXHRcdGNvbnN0IGpzb25TdWJzZXQ6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddLFxuXHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMubXVsdGlwbGUsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZS5wZWVrJywgJ1Nob3cgUGVlayB2aWV3IG9mIHRoZSByZXN1bHRzIChkZWZhdWx0KScpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGUuZ290b0FuZFBlZWsnLCAnR28gdG8gdGhlIHByaW1hcnkgcmVzdWx0IGFuZCBzaG93IGEgUGVlayB2aWV3JyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZS5nb3RvJywgJ0dvIHRvIHRoZSBwcmltYXJ5IHJlc3VsdCBhbmQgZW5hYmxlIFBlZWstbGVzcyBuYXZpZ2F0aW9uIHRvIG90aGVycycpXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBhbHRlcm5hdGl2ZUNvbW1hbmRPcHRpb25zID0gWycnLCAnZWRpdG9yLmFjdGlvbi5yZWZlcmVuY2VTZWFyY2gudHJpZ2dlcicsICdlZGl0b3IuYWN0aW9uLmdvVG9SZWZlcmVuY2VzJywgJ2VkaXRvci5hY3Rpb24ucGVla0ltcGxlbWVudGF0aW9uJywgJ2VkaXRvci5hY3Rpb24uZ29Ub0ltcGxlbWVudGF0aW9uJywgJ2VkaXRvci5hY3Rpb24ucGVla1R5cGVEZWZpbml0aW9uJywgJ2VkaXRvci5hY3Rpb24uZ29Ub1R5cGVEZWZpbml0aW9uJywgJ2VkaXRvci5hY3Rpb24ucGVla0RlY2xhcmF0aW9uJywgJ2VkaXRvci5hY3Rpb24ucmV2ZWFsRGVjbGFyYXRpb24nLCAnZWRpdG9yLmFjdGlvbi5wZWVrRGVmaW5pdGlvbicsICdlZGl0b3IuYWN0aW9uLnJldmVhbERlZmluaXRpb25Bc2lkZScsICdlZGl0b3IuYWN0aW9uLnJldmVhbERlZmluaXRpb24nXTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24sICdnb3RvTG9jYXRpb24nLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGUnOiB7XG5cdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGUuZGVwcmVjYXRlZCcsIFwiVGhpcyBzZXR0aW5nIGlzIGRlcHJlY2F0ZWQsIHBsZWFzZSB1c2Ugc2VwYXJhdGUgc2V0dGluZ3MgbGlrZSAnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVEZWZpbml0aW9ucycgb3IgJ2VkaXRvci5lZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlSW1wbGVtZW50YXRpb25zJyBpbnN0ZWFkLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVEZWZpbml0aW9ucyc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZURlZmluaXRpb25zJywgXCJDb250cm9scyB0aGUgYmVoYXZpb3IgdGhlICdHbyB0byBEZWZpbml0aW9uJy1jb21tYW5kIHdoZW4gbXVsdGlwbGUgdGFyZ2V0IGxvY2F0aW9ucyBleGlzdC5cIiksXG5cdFx0XHRcdFx0Li4uanNvblN1YnNldCxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVUeXBlRGVmaW5pdGlvbnMnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVUeXBlRGVmaW5pdGlvbnMnLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciB0aGUgJ0dvIHRvIFR5cGUgRGVmaW5pdGlvbictY29tbWFuZCB3aGVuIG11bHRpcGxlIHRhcmdldCBsb2NhdGlvbnMgZXhpc3QuXCIpLFxuXHRcdFx0XHRcdC4uLmpzb25TdWJzZXQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlRGVjbGFyYXRpb25zJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5lZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlRGVjbGFyYXRpb25zJywgXCJDb250cm9scyB0aGUgYmVoYXZpb3IgdGhlICdHbyB0byBEZWNsYXJhdGlvbictY29tbWFuZCB3aGVuIG11bHRpcGxlIHRhcmdldCBsb2NhdGlvbnMgZXhpc3QuXCIpLFxuXHRcdFx0XHRcdC4uLmpzb25TdWJzZXQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlSW1wbGVtZW50YXRpb25zJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5lZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlSW1wbGVtZW5hdHRpb25zJywgXCJDb250cm9scyB0aGUgYmVoYXZpb3IgdGhlICdHbyB0byBJbXBsZW1lbnRhdGlvbnMnLWNvbW1hbmQgd2hlbiBtdWx0aXBsZSB0YXJnZXQgbG9jYXRpb25zIGV4aXN0LlwiKSxcblx0XHRcdFx0XHQuLi5qc29uU3Vic2V0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZVJlZmVyZW5jZXMnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVSZWZlcmVuY2VzJywgXCJDb250cm9scyB0aGUgYmVoYXZpb3IgdGhlICdHbyB0byBSZWZlcmVuY2VzJy1jb21tYW5kIHdoZW4gbXVsdGlwbGUgdGFyZ2V0IGxvY2F0aW9ucyBleGlzdC5cIiksXG5cdFx0XHRcdFx0Li4uanNvblN1YnNldCxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24uYWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kLFxuXHRcdFx0XHRcdGVudW06IGFsdGVybmF0aXZlQ29tbWFuZE9wdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZCcsIFwiQWx0ZXJuYXRpdmUgY29tbWFuZCBpZCB0aGF0IGlzIGJlaW5nIGV4ZWN1dGVkIHdoZW4gdGhlIHJlc3VsdCBvZiAnR28gdG8gRGVmaW5pdGlvbicgaXMgdGhlIGN1cnJlbnQgbG9jYXRpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLmFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kLFxuXHRcdFx0XHRcdGVudW06IGFsdGVybmF0aXZlQ29tbWFuZE9wdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQnLCBcIkFsdGVybmF0aXZlIGNvbW1hbmQgaWQgdGhhdCBpcyBiZWluZyBleGVjdXRlZCB3aGVuIHRoZSByZXN1bHQgb2YgJ0dvIHRvIFR5cGUgRGVmaW5pdGlvbicgaXMgdGhlIGN1cnJlbnQgbG9jYXRpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLmFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kLFxuXHRcdFx0XHRcdGVudW06IGFsdGVybmF0aXZlQ29tbWFuZE9wdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQnLCBcIkFsdGVybmF0aXZlIGNvbW1hbmQgaWQgdGhhdCBpcyBiZWluZyBleGVjdXRlZCB3aGVuIHRoZSByZXN1bHQgb2YgJ0dvIHRvIERlY2xhcmF0aW9uJyBpcyB0aGUgY3VycmVudCBsb2NhdGlvbi5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24uYWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQsXG5cdFx0XHRcdFx0ZW51bTogYWx0ZXJuYXRpdmVDb21tYW5kT3B0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZCcsIFwiQWx0ZXJuYXRpdmUgY29tbWFuZCBpZCB0aGF0IGlzIGJlaW5nIGV4ZWN1dGVkIHdoZW4gdGhlIHJlc3VsdCBvZiAnR28gdG8gSW1wbGVtZW50YXRpb24nIGlzIHRoZSBjdXJyZW50IGxvY2F0aW9uLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5hbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kLFxuXHRcdFx0XHRcdGVudW06IGFsdGVybmF0aXZlQ29tbWFuZE9wdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kJywgXCJBbHRlcm5hdGl2ZSBjb21tYW5kIGlkIHRoYXQgaXMgYmVpbmcgZXhlY3V0ZWQgd2hlbiB0aGUgcmVzdWx0IG9mICdHbyB0byBSZWZlcmVuY2UnIGlzIHRoZSBjdXJyZW50IGxvY2F0aW9uLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogR29Ub0xvY2F0aW9uT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJR290b0xvY2F0aW9uT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdG11bHRpcGxlOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZSwgdGhpcy5kZWZhdWx0VmFsdWUubXVsdGlwbGUsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVEZWZpbml0aW9uczogc3RyaW5nU2V0PEdvVG9Mb2NhdGlvblZhbHVlcz4oaW5wdXQubXVsdGlwbGVEZWZpbml0aW9ucywgJ3BlZWsnLCBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddKSxcblx0XHRcdG11bHRpcGxlVHlwZURlZmluaXRpb25zOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZVR5cGVEZWZpbml0aW9ucywgJ3BlZWsnLCBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddKSxcblx0XHRcdG11bHRpcGxlRGVjbGFyYXRpb25zOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZURlY2xhcmF0aW9ucywgJ3BlZWsnLCBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddKSxcblx0XHRcdG11bHRpcGxlSW1wbGVtZW50YXRpb25zOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZUltcGxlbWVudGF0aW9ucywgJ3BlZWsnLCBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddKSxcblx0XHRcdG11bHRpcGxlUmVmZXJlbmNlczogc3RyaW5nU2V0PEdvVG9Mb2NhdGlvblZhbHVlcz4oaW5wdXQubXVsdGlwbGVSZWZlcmVuY2VzLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVUZXN0czogc3RyaW5nU2V0PEdvVG9Mb2NhdGlvblZhbHVlcz4oaW5wdXQubXVsdGlwbGVUZXN0cywgJ3BlZWsnLCBbJ3BlZWsnLCAnZ290b0FuZFBlZWsnLCAnZ290byddKSxcblx0XHRcdGFsdGVybmF0aXZlRGVmaW5pdGlvbkNvbW1hbmQ6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuYWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZCwgdGhpcy5kZWZhdWx0VmFsdWUuYWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZCksXG5cdFx0XHRhbHRlcm5hdGl2ZVR5cGVEZWZpbml0aW9uQ29tbWFuZDogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5hbHRlcm5hdGl2ZVR5cGVEZWZpbml0aW9uQ29tbWFuZCwgdGhpcy5kZWZhdWx0VmFsdWUuYWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQpLFxuXHRcdFx0YWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQ6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuYWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQsIHRoaXMuZGVmYXVsdFZhbHVlLmFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kKSxcblx0XHRcdGFsdGVybmF0aXZlSW1wbGVtZW50YXRpb25Db21tYW5kOiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LmFsdGVybmF0aXZlSW1wbGVtZW50YXRpb25Db21tYW5kLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZCksXG5cdFx0XHRhbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQ6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuYWx0ZXJuYXRpdmVSZWZlcmVuY2VDb21tYW5kLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQpLFxuXHRcdFx0YWx0ZXJuYXRpdmVUZXN0c0NvbW1hbmQ6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuYWx0ZXJuYXRpdmVUZXN0c0NvbW1hbmQsIHRoaXMuZGVmYXVsdFZhbHVlLmFsdGVybmF0aXZlVGVzdHNDb21tYW5kKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gaG92ZXJcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBob3ZlclxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JIb3Zlck9wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHRoZSBob3Zlci5cblx0ICogRGVmYXVsdHMgdG8gJ29uJy5cblx0ICovXG5cdGVuYWJsZWQ/OiAnb24nIHwgJ29mZicgfCAnb25LZXlib2FyZE1vZGlmaWVyJztcblx0LyoqXG5cdCAqIERlbGF5IGZvciBzaG93aW5nIHRoZSBob3Zlci5cblx0ICogRGVmYXVsdHMgdG8gMzAwLlxuXHQgKi9cblx0ZGVsYXk/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBJcyB0aGUgaG92ZXIgc3RpY2t5IHN1Y2ggdGhhdCBpdCBjYW4gYmUgY2xpY2tlZCBhbmQgaXRzIGNvbnRlbnRzIHNlbGVjdGVkP1xuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c3RpY2t5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIGhvdyBsb25nIHRoZSBob3ZlciBpcyB2aXNpYmxlIGFmdGVyIHlvdSBob3ZlcmVkIG91dCBvZiBpdC5cblx0ICogUmVxdWlyZSBzdGlja3kgc2V0dGluZyB0byBiZSB0cnVlLlxuXHQgKi9cblx0aGlkaW5nRGVsYXk/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBTaG91bGQgdGhlIGhvdmVyIGJlIHNob3duIGFib3ZlIHRoZSBsaW5lIGlmIHBvc3NpYmxlP1xuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGFib3ZlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3VsZCBsb25nIGxpbmUgd2FybmluZyBob3ZlcnMgYmUgc2hvd24gKHRva2VuaXphdGlvbiBza2lwcGVkLCByZW5kZXJpbmcgcGF1c2VkKT9cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNob3dMb25nTGluZVdhcm5pbmc/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBFZGl0b3JIb3Zlck9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9ySG92ZXJPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvckhvdmVyIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uaG92ZXIsIElFZGl0b3JIb3Zlck9wdGlvbnMsIEVkaXRvckhvdmVyT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBFZGl0b3JIb3Zlck9wdGlvbnMgPSB7XG5cdFx0XHRlbmFibGVkOiAnb24nLFxuXHRcdFx0ZGVsYXk6IDMwMCxcblx0XHRcdGhpZGluZ0RlbGF5OiAzMDAsXG5cdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRhYm92ZTogdHJ1ZSxcblx0XHRcdHNob3dMb25nTGluZVdhcm5pbmc6IHRydWUsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5ob3ZlciwgJ2hvdmVyJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuaG92ZXIuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ29uJywgJ29mZicsICdvbktleWJvYXJkTW9kaWZpZXInXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdob3Zlci5lbmFibGVkLm9uJywgXCJIb3ZlciBpcyBlbmFibGVkLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnaG92ZXIuZW5hYmxlZC5vZmYnLCBcIkhvdmVyIGlzIGRpc2FibGVkLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnaG92ZXIuZW5hYmxlZC5vbktleWJvYXJkTW9kaWZpZXInLCBcIkhvdmVyIGlzIHNob3duIHdoZW4gaG9sZGluZyBgezB9YCBvciBgQWx0YCAodGhlIG9wcG9zaXRlIG1vZGlmaWVyIG9mIGAjZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXIjYClcIiwgcGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBgQ29tbWFuZGAgOiBgQ29udHJvbGApXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob3Zlci5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBob3ZlciBpcyBzaG93bi5cIiksXG5cdFx0XHRcdFx0a2V5d29yZHM6IFsnaGludCcsICdpbmZvJywgJ3Rvb2x0aXAnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmhvdmVyLmRlbGF5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmRlbGF5LFxuXHRcdFx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRcdFx0bWF4aW11bTogMTAwMDAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG92ZXIuZGVsYXknLCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggdGhlIGhvdmVyIGlzIHNob3duLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmhvdmVyLnN0aWNreSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc3RpY2t5LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvdmVyLnN0aWNreScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgaG92ZXIgc2hvdWxkIHJlbWFpbiB2aXNpYmxlIHdoZW4gbW91c2UgaXMgbW92ZWQgb3ZlciBpdC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5ob3Zlci5oaWRpbmdEZWxheSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5oaWRpbmdEZWxheSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvdmVyLmhpZGluZ0RlbGF5JywgXCJDb250cm9scyB0aGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGFmdGVyIHdoaWNoIHRoZSBob3ZlciBpcyBoaWRkZW4uIFJlcXVpcmVzIGAjZWRpdG9yLmhvdmVyLnN0aWNreSNgIHRvIGJlIGVuYWJsZWQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaG92ZXIuYWJvdmUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFib3ZlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvdmVyLmFib3ZlJywgXCJQcmVmZXIgc2hvd2luZyBob3ZlcnMgYWJvdmUgdGhlIGxpbmUsIGlmIHRoZXJlJ3Mgc3BhY2UuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaG92ZXIuc2hvd0xvbmdMaW5lV2FybmluZyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2hvd0xvbmdMaW5lV2FybmluZyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob3Zlci5zaG93TG9uZ0xpbmVXYXJuaW5nJywgXCJDb250cm9scyB3aGV0aGVyIGxvbmcgbGluZSB3YXJuaW5nIGhvdmVycyBhcmUgc2hvd24sIHN1Y2ggYXMgd2hlbiB0b2tlbml6YXRpb24gaXMgc2tpcHBlZCBvciByZW5kZXJpbmcgaXMgcGF1c2VkLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9ySG92ZXJPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JIb3Zlck9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBzdHJpbmdTZXQ8J29uJyB8ICdvZmYnIHwgJ29uS2V5Ym9hcmRNb2RpZmllcic+KGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQsIFsnb24nLCAnb2ZmJywgJ29uS2V5Ym9hcmRNb2RpZmllciddKSxcblx0XHRcdGRlbGF5OiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5kZWxheSwgdGhpcy5kZWZhdWx0VmFsdWUuZGVsYXksIDAsIDEwMDAwKSxcblx0XHRcdHN0aWNreTogYm9vbGVhbihpbnB1dC5zdGlja3ksIHRoaXMuZGVmYXVsdFZhbHVlLnN0aWNreSksXG5cdFx0XHRoaWRpbmdEZWxheTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuaGlkaW5nRGVsYXksIHRoaXMuZGVmYXVsdFZhbHVlLmhpZGluZ0RlbGF5LCAwLCA2MDAwMDApLFxuXHRcdFx0YWJvdmU6IGJvb2xlYW4oaW5wdXQuYWJvdmUsIHRoaXMuZGVmYXVsdFZhbHVlLmFib3ZlKSxcblx0XHRcdHNob3dMb25nTGluZVdhcm5pbmc6IGJvb2xlYW4oaW5wdXQuc2hvd0xvbmdMaW5lV2FybmluZywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0xvbmdMaW5lV2FybmluZyksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGxheW91dEluZm9cblxuLyoqXG4gKiBBIGRlc2NyaXB0aW9uIGZvciB0aGUgb3ZlcnZpZXcgcnVsZXIgcG9zaXRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgT3ZlcnZpZXdSdWxlclBvc2l0aW9uIHtcblx0LyoqXG5cdCAqIFdpZHRoIG9mIHRoZSBvdmVydmlldyBydWxlclxuXHQgKi9cblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0LyoqXG5cdCAqIEhlaWdodCBvZiB0aGUgb3ZlcnZpZXcgcnVsZXJcblx0ICovXG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXHQvKipcblx0ICogVG9wIHBvc2l0aW9uIGZvciB0aGUgb3ZlcnZpZXcgcnVsZXJcblx0ICovXG5cdHJlYWRvbmx5IHRvcDogbnVtYmVyO1xuXHQvKipcblx0ICogUmlnaHQgcG9zaXRpb24gZm9yIHRoZSBvdmVydmlldyBydWxlclxuXHQgKi9cblx0cmVhZG9ubHkgcmlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVuZGVyTWluaW1hcCB7XG5cdE5vbmUgPSAwLFxuXHRUZXh0ID0gMSxcblx0QmxvY2tzID0gMixcbn1cblxuLyoqXG4gKiBUaGUgaW50ZXJuYWwgbGF5b3V0IGRldGFpbHMgb2YgdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JMYXlvdXRJbmZvIHtcblxuXHQvKipcblx0ICogRnVsbCBlZGl0b3Igd2lkdGguXG5cdCAqL1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHQvKipcblx0ICogRnVsbCBlZGl0b3IgaGVpZ2h0LlxuXHQgKi9cblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIExlZnQgcG9zaXRpb24gZm9yIHRoZSBnbHlwaCBtYXJnaW4uXG5cdCAqL1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbkxlZnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSB3aWR0aCBvZiB0aGUgZ2x5cGggbWFyZ2luLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW5XaWR0aDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIGRlY29yYXRpb24gbGFuZXMgdG8gcmVuZGVyIGluIHRoZSBnbHlwaCBtYXJnaW4uXG5cdCAqL1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IG51bWJlcjtcblxuXHQvKipcblx0ICogTGVmdCBwb3NpdGlvbiBmb3IgdGhlIGxpbmUgbnVtYmVycy5cblx0ICovXG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzTGVmdDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIHdpZHRoIG9mIHRoZSBsaW5lIG51bWJlcnMuXG5cdCAqL1xuXHRyZWFkb25seSBsaW5lTnVtYmVyc1dpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIExlZnQgcG9zaXRpb24gZm9yIHRoZSBsaW5lIGRlY29yYXRpb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVjb3JhdGlvbnNMZWZ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggb2YgdGhlIGxpbmUgZGVjb3JhdGlvbnMuXG5cdCAqL1xuXHRyZWFkb25seSBkZWNvcmF0aW9uc1dpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIExlZnQgcG9zaXRpb24gZm9yIHRoZSBjb250ZW50IChhY3R1YWwgdGV4dClcblx0ICovXG5cdHJlYWRvbmx5IGNvbnRlbnRMZWZ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggb2YgdGhlIGNvbnRlbnQgKGFjdHVhbCB0ZXh0KVxuXHQgKi9cblx0cmVhZG9ubHkgY29udGVudFdpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIExheW91dCBpbmZvcm1hdGlvbiBmb3IgdGhlIG1pbmltYXBcblx0ICovXG5cdHJlYWRvbmx5IG1pbmltYXA6IEVkaXRvck1pbmltYXBMYXlvdXRJbmZvO1xuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIGNvbHVtbnMgKG9mIHR5cGljYWwgY2hhcmFjdGVycykgZml0dGluZyBvbiBhIHZpZXdwb3J0IGxpbmUuXG5cdCAqL1xuXHRyZWFkb25seSB2aWV3cG9ydENvbHVtbjogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IGlzV29yZFdyYXBNaW5pZmllZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNWaWV3cG9ydFdyYXBwaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSB3cmFwcGluZ0NvbHVtbjogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggb2YgdGhlIHZlcnRpY2FsIHNjcm9sbGJhci5cblx0ICovXG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBoZWlnaHQgb2YgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyLlxuXHQgKi9cblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgcG9zaXRpb24gb2YgdGhlIG92ZXJ2aWV3IHJ1bGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgb3ZlcnZpZXdSdWxlcjogT3ZlcnZpZXdSdWxlclBvc2l0aW9uO1xufVxuXG4vKipcbiAqIFRoZSBpbnRlcm5hbCBsYXlvdXQgZGV0YWlscyBvZiB0aGUgZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRvck1pbmltYXBMYXlvdXRJbmZvIHtcblx0cmVhZG9ubHkgcmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcDtcblx0cmVhZG9ubHkgbWluaW1hcExlZnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbWluaW1hcFdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWluaW1hcElzU2FtcGxpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYXBTY2FsZTogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbWluaW1hcENhbnZhc091dGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWluaW1hcENhbnZhc091dGVySGVpZ2h0OiBudW1iZXI7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyRW52IHtcblx0cmVhZG9ubHkgbWVtb3J5OiBDb21wdXRlT3B0aW9uc01lbW9yeSB8IG51bGw7XG5cdHJlYWRvbmx5IG91dGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0ZXJIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgaXNEb21pbmF0ZWRCeUxvbmdMaW5lczogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3TGluZUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzRGlnaXRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4RGlnaXRXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JMYXlvdXRDb21wdXRlcklucHV0IHtcblx0cmVhZG9ubHkgb3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRlckhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzRGlnaXRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4RGlnaXRXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luOiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5lRGVjb3JhdGlvbnNXaWR0aDogc3RyaW5nIHwgbnVtYmVyO1xuXHRyZWFkb25seSBmb2xkaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFwOiBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yTWluaW1hcE9wdGlvbnM+Pjtcblx0cmVhZG9ubHkgc2Nyb2xsYmFyOiBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnM7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzOiBJbnRlcm5hbEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9ucztcblx0cmVhZG9ubHkgbGluZU51bWJlcnNNaW5DaGFyczogbnVtYmVyO1xuXHRyZWFkb25seSBzY3JvbGxCZXlvbmRMYXN0TGluZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgd29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbicgfCAnb24nIHwgJ29mZicgfCAnYm91bmRlZCc7XG5cdHJlYWRvbmx5IHdvcmRXcmFwQ29sdW1uOiBudW1iZXI7XG5cdHJlYWRvbmx5IHdvcmRXcmFwTWluaWZpZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTdXBwb3J0OiBBY2Nlc3NpYmlsaXR5U3VwcG9ydDtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTWluaW1hcExheW91dElucHV0IHtcblx0cmVhZG9ubHkgb3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRlckhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNjcm9sbEJleW9uZExhc3RMaW5lOiBib29sZWFuO1xuXHRyZWFkb25seSBwYWRkaW5nVG9wOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhZGRpbmdCb3R0b206IG51bWJlcjtcblx0cmVhZG9ubHkgbWluaW1hcDogUmVhZG9ubHk8UmVxdWlyZWQ8SUVkaXRvck1pbmltYXBPcHRpb25zPj47XG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgdmlld0xpbmVDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSByZW1haW5pbmdXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBpc1ZpZXdwb3J0V3JhcHBpbmc6IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjbGFzcyBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIgZXh0ZW5kcyBDb21wdXRlZEVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ubGF5b3V0SW5mbywgRWRpdG9yTGF5b3V0SW5mbz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvLCB7XG5cdFx0XHR3aWR0aDogMCxcblx0XHRcdGhlaWdodDogMCxcblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMCxcblx0XHRcdGNvbnRlbnRMZWZ0OiAwLFxuXHRcdFx0Y29udGVudFdpZHRoOiAwLFxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLk5vbmUsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAwLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMSxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogMCxcblx0XHRcdH0sXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogMCxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBfOiBFZGl0b3JMYXlvdXRJbmZvKTogRWRpdG9yTGF5b3V0SW5mbyB7XG5cdFx0cmV0dXJuIEVkaXRvckxheW91dEluZm9Db21wdXRlci5jb21wdXRlTGF5b3V0KG9wdGlvbnMsIHtcblx0XHRcdG1lbW9yeTogZW52Lm1lbW9yeSxcblx0XHRcdG91dGVyV2lkdGg6IGVudi5vdXRlcldpZHRoLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IGVudi5vdXRlckhlaWdodCxcblx0XHRcdGlzRG9taW5hdGVkQnlMb25nTGluZXM6IGVudi5pc0RvbWluYXRlZEJ5TG9uZ0xpbmVzLFxuXHRcdFx0bGluZUhlaWdodDogZW52LmZvbnRJbmZvLmxpbmVIZWlnaHQsXG5cdFx0XHR2aWV3TGluZUNvdW50OiBlbnYudmlld0xpbmVDb3VudCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogZW52LmxpbmVOdW1iZXJzRGlnaXRDb3VudCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogZW52LmZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IGVudi5mb250SW5mby5tYXhEaWdpdFdpZHRoLFxuXHRcdFx0cGl4ZWxSYXRpbzogZW52LnBpeGVsUmF0aW8sXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IGVudi5nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcHV0ZUNvbnRhaW5lZE1pbmltYXBMaW5lQ291bnQoaW5wdXQ6IHtcblx0XHR2aWV3TGluZUNvdW50OiBudW1iZXI7XG5cdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGJvb2xlYW47XG5cdFx0cGFkZGluZ1RvcDogbnVtYmVyO1xuXHRcdHBhZGRpbmdCb3R0b206IG51bWJlcjtcblx0XHRoZWlnaHQ6IG51bWJlcjtcblx0XHRsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdFx0cGl4ZWxSYXRpbzogbnVtYmVyO1xuXHR9KTogeyB0eXBpY2FsVmlld3BvcnRMaW5lQ291bnQ6IG51bWJlcjsgZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZTogbnVtYmVyOyBleHRyYUxpbmVzQmV5b25kTGFzdExpbmU6IG51bWJlcjsgZGVzaXJlZFJhdGlvOiBudW1iZXI7IG1pbmltYXBMaW5lQ291bnQ6IG51bWJlciB9IHtcblx0XHRjb25zdCB0eXBpY2FsVmlld3BvcnRMaW5lQ291bnQgPSBpbnB1dC5oZWlnaHQgLyBpbnB1dC5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IGV4dHJhTGluZXNCZWZvcmVGaXJzdExpbmUgPSBNYXRoLmZsb29yKGlucHV0LnBhZGRpbmdUb3AgLyBpbnB1dC5saW5lSGVpZ2h0KTtcblx0XHRsZXQgZXh0cmFMaW5lc0JleW9uZExhc3RMaW5lID0gTWF0aC5mbG9vcihpbnB1dC5wYWRkaW5nQm90dG9tIC8gaW5wdXQubGluZUhlaWdodCk7XG5cdFx0aWYgKGlucHV0LnNjcm9sbEJleW9uZExhc3RMaW5lKSB7XG5cdFx0XHRleHRyYUxpbmVzQmV5b25kTGFzdExpbmUgPSBNYXRoLm1heChleHRyYUxpbmVzQmV5b25kTGFzdExpbmUsIHR5cGljYWxWaWV3cG9ydExpbmVDb3VudCAtIDEpO1xuXHRcdH1cblx0XHRjb25zdCBkZXNpcmVkUmF0aW8gPSAoZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZSArIGlucHV0LnZpZXdMaW5lQ291bnQgKyBleHRyYUxpbmVzQmV5b25kTGFzdExpbmUpIC8gKGlucHV0LnBpeGVsUmF0aW8gKiBpbnB1dC5oZWlnaHQpO1xuXHRcdGNvbnN0IG1pbmltYXBMaW5lQ291bnQgPSBNYXRoLmZsb29yKGlucHV0LnZpZXdMaW5lQ291bnQgLyBkZXNpcmVkUmF0aW8pO1xuXHRcdHJldHVybiB7IHR5cGljYWxWaWV3cG9ydExpbmVDb3VudCwgZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZSwgZXh0cmFMaW5lc0JleW9uZExhc3RMaW5lLCBkZXNpcmVkUmF0aW8sIG1pbmltYXBMaW5lQ291bnQgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wdXRlTWluaW1hcExheW91dChpbnB1dDogSU1pbmltYXBMYXlvdXRJbnB1dCwgbWVtb3J5OiBDb21wdXRlT3B0aW9uc01lbW9yeSk6IEVkaXRvck1pbmltYXBMYXlvdXRJbmZvIHtcblx0XHRjb25zdCBvdXRlcldpZHRoID0gaW5wdXQub3V0ZXJXaWR0aDtcblx0XHRjb25zdCBvdXRlckhlaWdodCA9IGlucHV0Lm91dGVySGVpZ2h0O1xuXHRcdGNvbnN0IHBpeGVsUmF0aW8gPSBpbnB1dC5waXhlbFJhdGlvO1xuXG5cdFx0aWYgKCFpbnB1dC5taW5pbWFwLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiBNYXRoLmZsb29yKHBpeGVsUmF0aW8gKiBvdXRlckhlaWdodCksXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IG91dGVySGVpZ2h0LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBDYW4gdXNlIG1lbW9yeSBpZiBvbmx5IHRoZSBgdmlld0xpbmVDb3VudGAgYW5kIGByZW1haW5pbmdXaWR0aGAgaGF2ZSBjaGFuZ2VkXG5cdFx0Y29uc3Qgc3RhYmxlTWluaW1hcExheW91dElucHV0ID0gbWVtb3J5LnN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dDtcblx0XHRjb25zdCBjb3VsZFVzZU1lbW9yeSA9IChcblx0XHRcdHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dFxuXHRcdFx0Ly8gJiYgaW5wdXQub3V0ZXJXaWR0aCA9PT0gbGFzdE1pbmltYXBMYXlvdXRJbnB1dC5vdXRlcldpZHRoICEhISBJTlRFTlRJT05BTCBPTUlUVEVEXG5cdFx0XHQmJiBpbnB1dC5vdXRlckhlaWdodCA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm91dGVySGVpZ2h0XG5cdFx0XHQmJiBpbnB1dC5saW5lSGVpZ2h0ID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQubGluZUhlaWdodFxuXHRcdFx0JiYgaW5wdXQudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoXG5cdFx0XHQmJiBpbnB1dC5waXhlbFJhdGlvID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQucGl4ZWxSYXRpb1xuXHRcdFx0JiYgaW5wdXQuc2Nyb2xsQmV5b25kTGFzdExpbmUgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5zY3JvbGxCZXlvbmRMYXN0TGluZVxuXHRcdFx0JiYgaW5wdXQucGFkZGluZ1RvcCA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0LnBhZGRpbmdUb3Bcblx0XHRcdCYmIGlucHV0LnBhZGRpbmdCb3R0b20gPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5wYWRkaW5nQm90dG9tXG5cdFx0XHQmJiBpbnB1dC5taW5pbWFwLmVuYWJsZWQgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5taW5pbWFwLmVuYWJsZWRcblx0XHRcdCYmIGlucHV0Lm1pbmltYXAuc2lkZSA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAuc2lkZVxuXHRcdFx0JiYgaW5wdXQubWluaW1hcC5zaXplID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQubWluaW1hcC5zaXplXG5cdFx0XHQmJiBpbnB1dC5taW5pbWFwLnNob3dTbGlkZXIgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5taW5pbWFwLnNob3dTbGlkZXJcblx0XHRcdCYmIGlucHV0Lm1pbmltYXAucmVuZGVyQ2hhcmFjdGVycyA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAucmVuZGVyQ2hhcmFjdGVyc1xuXHRcdFx0JiYgaW5wdXQubWluaW1hcC5tYXhDb2x1bW4gPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5taW5pbWFwLm1heENvbHVtblxuXHRcdFx0JiYgaW5wdXQubWluaW1hcC5zY2FsZSA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAuc2NhbGVcblx0XHRcdCYmIGlucHV0LnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoXG5cdFx0XHQvLyAmJiBpbnB1dC52aWV3TGluZUNvdW50ID09PSBsYXN0TWluaW1hcExheW91dElucHV0LnZpZXdMaW5lQ291bnQgISEhIElOVEVOVElPTkFMIE9NSVRURURcblx0XHRcdC8vICYmIGlucHV0LnJlbWFpbmluZ1dpZHRoID09PSBsYXN0TWluaW1hcExheW91dElucHV0LnJlbWFpbmluZ1dpZHRoICEhISBJTlRFTlRJT05BTCBPTUlUVEVEXG5cdFx0XHQmJiBpbnB1dC5pc1ZpZXdwb3J0V3JhcHBpbmcgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5pc1ZpZXdwb3J0V3JhcHBpbmdcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGlucHV0LmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gaW5wdXQudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdGNvbnN0IHNjcm9sbEJleW9uZExhc3RMaW5lID0gaW5wdXQuc2Nyb2xsQmV5b25kTGFzdExpbmU7XG5cdFx0Y29uc3QgbWluaW1hcFJlbmRlckNoYXJhY3RlcnMgPSBpbnB1dC5taW5pbWFwLnJlbmRlckNoYXJhY3RlcnM7XG5cdFx0bGV0IG1pbmltYXBTY2FsZSA9IChwaXhlbFJhdGlvID49IDIgPyBNYXRoLnJvdW5kKGlucHV0Lm1pbmltYXAuc2NhbGUgKiAyKSA6IGlucHV0Lm1pbmltYXAuc2NhbGUpO1xuXHRcdGNvbnN0IG1pbmltYXBNYXhDb2x1bW4gPSBpbnB1dC5taW5pbWFwLm1heENvbHVtbjtcblx0XHRjb25zdCBtaW5pbWFwU2l6ZSA9IGlucHV0Lm1pbmltYXAuc2l6ZTtcblx0XHRjb25zdCBtaW5pbWFwU2lkZSA9IGlucHV0Lm1pbmltYXAuc2lkZTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoID0gaW5wdXQudmVydGljYWxTY3JvbGxiYXJXaWR0aDtcblx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gaW5wdXQudmlld0xpbmVDb3VudDtcblx0XHRjb25zdCByZW1haW5pbmdXaWR0aCA9IGlucHV0LnJlbWFpbmluZ1dpZHRoO1xuXHRcdGNvbnN0IGlzVmlld3BvcnRXcmFwcGluZyA9IGlucHV0LmlzVmlld3BvcnRXcmFwcGluZztcblxuXHRcdGNvbnN0IGJhc2VDaGFySGVpZ2h0ID0gbWluaW1hcFJlbmRlckNoYXJhY3RlcnMgPyAyIDogMztcblx0XHRsZXQgbWluaW1hcENhbnZhc0lubmVySGVpZ2h0ID0gTWF0aC5mbG9vcihwaXhlbFJhdGlvICogb3V0ZXJIZWlnaHQpO1xuXHRcdGNvbnN0IG1pbmltYXBDYW52YXNPdXRlckhlaWdodCA9IG1pbmltYXBDYW52YXNJbm5lckhlaWdodCAvIHBpeGVsUmF0aW87XG5cdFx0bGV0IG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCA9IGZhbHNlO1xuXHRcdGxldCBtaW5pbWFwSXNTYW1wbGluZyA9IGZhbHNlO1xuXHRcdGxldCBtaW5pbWFwTGluZUhlaWdodCA9IGJhc2VDaGFySGVpZ2h0ICogbWluaW1hcFNjYWxlO1xuXHRcdGxldCBtaW5pbWFwQ2hhcldpZHRoID0gbWluaW1hcFNjYWxlIC8gcGl4ZWxSYXRpbztcblx0XHRsZXQgbWluaW1hcFdpZHRoTXVsdGlwbGllcjogbnVtYmVyID0gMTtcblxuXHRcdGlmIChtaW5pbWFwU2l6ZSA9PT0gJ2ZpbGwnIHx8IG1pbmltYXBTaXplID09PSAnZml0Jykge1xuXHRcdFx0Y29uc3QgeyB0eXBpY2FsVmlld3BvcnRMaW5lQ291bnQsIGV4dHJhTGluZXNCZWZvcmVGaXJzdExpbmUsIGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSwgZGVzaXJlZFJhdGlvLCBtaW5pbWFwTGluZUNvdW50IH0gPSBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIuY29tcHV0ZUNvbnRhaW5lZE1pbmltYXBMaW5lQ291bnQoe1xuXHRcdFx0XHR2aWV3TGluZUNvdW50OiB2aWV3TGluZUNvdW50LFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogc2Nyb2xsQmV5b25kTGFzdExpbmUsXG5cdFx0XHRcdHBhZGRpbmdUb3A6IGlucHV0LnBhZGRpbmdUb3AsXG5cdFx0XHRcdHBhZGRpbmdCb3R0b206IGlucHV0LnBhZGRpbmdCb3R0b20sXG5cdFx0XHRcdGhlaWdodDogb3V0ZXJIZWlnaHQsXG5cdFx0XHRcdGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG5cdFx0XHRcdHBpeGVsUmF0aW86IHBpeGVsUmF0aW9cblx0XHRcdH0pO1xuXHRcdFx0Ly8gcmF0aW8gaXMgaW50ZW50aW9uYWxseSBub3QgcGFydCBvZiB0aGUgbGF5b3V0IHRvIGF2b2lkIHRoZSBsYXlvdXQgY2hhbmdpbmcgYWxsIHRoZSB0aW1lXG5cdFx0XHQvLyB3aGVuIGRvaW5nIHNhbXBsaW5nXG5cdFx0XHRjb25zdCByYXRpbyA9IHZpZXdMaW5lQ291bnQgLyBtaW5pbWFwTGluZUNvdW50O1xuXG5cdFx0XHRpZiAocmF0aW8gPiAxKSB7XG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCA9IHRydWU7XG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nID0gdHJ1ZTtcblx0XHRcdFx0bWluaW1hcFNjYWxlID0gMTtcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQgPSAxO1xuXHRcdFx0XHRtaW5pbWFwQ2hhcldpZHRoID0gbWluaW1hcFNjYWxlIC8gcGl4ZWxSYXRpbztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBmaXRCZWNvbWVzRmlsbCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgbWF4TWluaW1hcFNjYWxlID0gbWluaW1hcFNjYWxlICsgMTtcblxuXHRcdFx0XHRpZiAobWluaW1hcFNpemUgPT09ICdmaXQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWZmZWN0aXZlTWluaW1hcEhlaWdodCA9IE1hdGguY2VpbCgoZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZSArIHZpZXdMaW5lQ291bnQgKyBleHRyYUxpbmVzQmV5b25kTGFzdExpbmUpICogbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdGlmIChpc1ZpZXdwb3J0V3JhcHBpbmcgJiYgY291bGRVc2VNZW1vcnkgJiYgcmVtYWluaW5nV2lkdGggPD0gbWVtb3J5LnN0YWJsZUZpdFJlbWFpbmluZ1dpZHRoKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGVyZSBpcyBhIGxvb3Agd2hlbiB1c2luZyBgZml0YCBhbmQgdmlld3BvcnQgd3JhcHBpbmc6XG5cdFx0XHRcdFx0XHQvLyAtIHZpZXcgbGluZSBjb3VudCBpbXBhY3RzIG1pbmltYXAgbGF5b3V0XG5cdFx0XHRcdFx0XHQvLyAtIG1pbmltYXAgbGF5b3V0IGltcGFjdHMgdmlld3BvcnQgd2lkdGhcblx0XHRcdFx0XHRcdC8vIC0gdmlld3BvcnQgd2lkdGggaW1wYWN0cyB2aWV3IGxpbmUgY291bnRcblx0XHRcdFx0XHRcdC8vIFRvIGJyZWFrIHRoZSBsb29wLCBvbmNlIHdlIGdvIHRvIGEgc21hbGxlciBtaW5pbWFwIHNjYWxlLCB3ZSB0cnkgdG8gc3RpY2sgd2l0aCBpdC5cblx0XHRcdFx0XHRcdGZpdEJlY29tZXNGaWxsID0gdHJ1ZTtcblx0XHRcdFx0XHRcdG1heE1pbmltYXBTY2FsZSA9IG1lbW9yeS5zdGFibGVGaXRNYXhNaW5pbWFwU2NhbGU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZpdEJlY29tZXNGaWxsID0gKGVmZmVjdGl2ZU1pbmltYXBIZWlnaHQgPiBtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtaW5pbWFwU2l6ZSA9PT0gJ2ZpbGwnIHx8IGZpdEJlY29tZXNGaWxsKSB7XG5cdFx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCBjb25maWd1cmVkTWluaW1hcFNjYWxlID0gbWluaW1hcFNjYWxlO1xuXHRcdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0ID0gTWF0aC5taW4obGluZUhlaWdodCAqIHBpeGVsUmF0aW8sIE1hdGgubWF4KDEsIE1hdGguZmxvb3IoMSAvIGRlc2lyZWRSYXRpbykpKTtcblx0XHRcdFx0XHRpZiAoaXNWaWV3cG9ydFdyYXBwaW5nICYmIGNvdWxkVXNlTWVtb3J5ICYmIHJlbWFpbmluZ1dpZHRoIDw9IG1lbW9yeS5zdGFibGVGaXRSZW1haW5pbmdXaWR0aCkge1xuXHRcdFx0XHRcdFx0Ly8gVGhlcmUgaXMgYSBsb29wIHdoZW4gdXNpbmcgYGZpbGxgIGFuZCB2aWV3cG9ydCB3cmFwcGluZzpcblx0XHRcdFx0XHRcdC8vIC0gdmlldyBsaW5lIGNvdW50IGltcGFjdHMgbWluaW1hcCBsYXlvdXRcblx0XHRcdFx0XHRcdC8vIC0gbWluaW1hcCBsYXlvdXQgaW1wYWN0cyB2aWV3cG9ydCB3aWR0aFxuXHRcdFx0XHRcdFx0Ly8gLSB2aWV3cG9ydCB3aWR0aCBpbXBhY3RzIHZpZXcgbGluZSBjb3VudFxuXHRcdFx0XHRcdFx0Ly8gVG8gYnJlYWsgdGhlIGxvb3AsIG9uY2Ugd2UgZ28gdG8gYSBzbWFsbGVyIG1pbmltYXAgc2NhbGUsIHdlIHRyeSB0byBzdGljayB3aXRoIGl0LlxuXHRcdFx0XHRcdFx0bWF4TWluaW1hcFNjYWxlID0gbWVtb3J5LnN0YWJsZUZpdE1heE1pbmltYXBTY2FsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bWluaW1hcFNjYWxlID0gTWF0aC5taW4obWF4TWluaW1hcFNjYWxlLCBNYXRoLm1heCgxLCBNYXRoLmZsb29yKG1pbmltYXBMaW5lSGVpZ2h0IC8gYmFzZUNoYXJIZWlnaHQpKSk7XG5cdFx0XHRcdFx0aWYgKG1pbmltYXBTY2FsZSA+IGNvbmZpZ3VyZWRNaW5pbWFwU2NhbGUpIHtcblx0XHRcdFx0XHRcdG1pbmltYXBXaWR0aE11bHRpcGxpZXIgPSBNYXRoLm1pbigyLCBtaW5pbWFwU2NhbGUgLyBjb25maWd1cmVkTWluaW1hcFNjYWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bWluaW1hcENoYXJXaWR0aCA9IG1pbmltYXBTY2FsZSAvIHBpeGVsUmF0aW8gLyBtaW5pbWFwV2lkdGhNdWx0aXBsaWVyO1xuXHRcdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodCA9IE1hdGguY2VpbCgoTWF0aC5tYXgodHlwaWNhbFZpZXdwb3J0TGluZUNvdW50LCBleHRyYUxpbmVzQmVmb3JlRmlyc3RMaW5lICsgdmlld0xpbmVDb3VudCArIGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSkpICogbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdGlmIChpc1ZpZXdwb3J0V3JhcHBpbmcpIHtcblx0XHRcdFx0XHRcdC8vIHJlbWVtYmVyIGZvciBuZXh0IHRpbWVcblx0XHRcdFx0XHRcdG1lbW9yeS5zdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQgPSBpbnB1dDtcblx0XHRcdFx0XHRcdG1lbW9yeS5zdGFibGVGaXRSZW1haW5pbmdXaWR0aCA9IHJlbWFpbmluZ1dpZHRoO1xuXHRcdFx0XHRcdFx0bWVtb3J5LnN0YWJsZUZpdE1heE1pbmltYXBTY2FsZSA9IG1pbmltYXBTY2FsZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVtb3J5LnN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dCA9IG51bGw7XG5cdFx0XHRcdFx0XHRtZW1vcnkuc3RhYmxlRml0UmVtYWluaW5nV2lkdGggPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEdpdmVuOlxuXHRcdC8vIChsZWF2aW5nIDJweCBmb3IgdGhlIGN1cnNvciB0byBoYXZlIHNwYWNlIGFmdGVyIHRoZSBsYXN0IGNoYXJhY3Rlcilcblx0XHQvLyB2aWV3cG9ydENvbHVtbiA9IChjb250ZW50V2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gMikgLyB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGhcblx0XHQvLyBtaW5pbWFwV2lkdGggPSB2aWV3cG9ydENvbHVtbiAqIG1pbmltYXBDaGFyV2lkdGhcblx0XHQvLyBjb250ZW50V2lkdGggPSByZW1haW5pbmdXaWR0aCAtIG1pbmltYXBXaWR0aFxuXHRcdC8vIFdoYXQgYXJlIGdvb2QgdmFsdWVzIGZvciBjb250ZW50V2lkdGggYW5kIG1pbmltYXBXaWR0aCA/XG5cblx0XHQvLyBtaW5pbWFwV2lkdGggPSAoKGNvbnRlbnRXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAvIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCkgKiBtaW5pbWFwQ2hhcldpZHRoXG5cdFx0Ly8gdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoICogbWluaW1hcFdpZHRoID0gKGNvbnRlbnRXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAqIG1pbmltYXBDaGFyV2lkdGhcblx0XHQvLyB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggKiBtaW5pbWFwV2lkdGggPSAocmVtYWluaW5nV2lkdGggLSBtaW5pbWFwV2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gMikgKiBtaW5pbWFwQ2hhcldpZHRoXG5cdFx0Ly8gKHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCArIG1pbmltYXBDaGFyV2lkdGgpICogbWluaW1hcFdpZHRoID0gKHJlbWFpbmluZ1dpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCAtIDIpICogbWluaW1hcENoYXJXaWR0aFxuXHRcdC8vIG1pbmltYXBXaWR0aCA9ICgocmVtYWluaW5nV2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gMikgKiBtaW5pbWFwQ2hhcldpZHRoKSAvICh0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggKyBtaW5pbWFwQ2hhcldpZHRoKVxuXG5cdFx0Y29uc3QgbWluaW1hcE1heFdpZHRoID0gTWF0aC5mbG9vcihtaW5pbWFwTWF4Q29sdW1uICogbWluaW1hcENoYXJXaWR0aCk7XG5cdFx0Y29uc3QgbWluaW1hcFdpZHRoID0gTWF0aC5taW4obWluaW1hcE1heFdpZHRoLCBNYXRoLm1heCgwLCBNYXRoLmZsb29yKCgocmVtYWluaW5nV2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gMikgKiBtaW5pbWFwQ2hhcldpZHRoKSAvICh0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggKyBtaW5pbWFwQ2hhcldpZHRoKSkpICsgTUlOSU1BUF9HVVRURVJfV0lEVEgpO1xuXG5cdFx0bGV0IG1pbmltYXBDYW52YXNJbm5lcldpZHRoID0gTWF0aC5mbG9vcihwaXhlbFJhdGlvICogbWluaW1hcFdpZHRoKTtcblx0XHRjb25zdCBtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aCA9IG1pbmltYXBDYW52YXNJbm5lcldpZHRoIC8gcGl4ZWxSYXRpbztcblx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aCA9IE1hdGguZmxvb3IobWluaW1hcENhbnZhc0lubmVyV2lkdGggKiBtaW5pbWFwV2lkdGhNdWx0aXBsaWVyKTtcblxuXHRcdGNvbnN0IHJlbmRlck1pbmltYXAgPSAobWluaW1hcFJlbmRlckNoYXJhY3RlcnMgPyBSZW5kZXJNaW5pbWFwLlRleHQgOiBSZW5kZXJNaW5pbWFwLkJsb2Nrcyk7XG5cdFx0Y29uc3QgbWluaW1hcExlZnQgPSAobWluaW1hcFNpZGUgPT09ICdsZWZ0JyA/IDAgOiAob3V0ZXJXaWR0aCAtIG1pbmltYXBXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZW5kZXJNaW5pbWFwLFxuXHRcdFx0bWluaW1hcExlZnQsXG5cdFx0XHRtaW5pbWFwV2lkdGgsXG5cdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQsXG5cdFx0XHRtaW5pbWFwSXNTYW1wbGluZyxcblx0XHRcdG1pbmltYXBTY2FsZSxcblx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0LFxuXHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGgsXG5cdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQsXG5cdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aCxcblx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodCxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlTGF5b3V0KG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIGVudjogRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyRW52KTogRWRpdG9yTGF5b3V0SW5mbyB7XG5cdFx0Y29uc3Qgb3V0ZXJXaWR0aCA9IGVudi5vdXRlcldpZHRoIHwgMDtcblx0XHRjb25zdCBvdXRlckhlaWdodCA9IGVudi5vdXRlckhlaWdodCB8IDA7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGVudi5saW5lSGVpZ2h0IHwgMDtcblx0XHRjb25zdCBsaW5lTnVtYmVyc0RpZ2l0Q291bnQgPSBlbnYubGluZU51bWJlcnNEaWdpdENvdW50IHwgMDtcblx0XHRjb25zdCB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBlbnYudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdGNvbnN0IG1heERpZ2l0V2lkdGggPSBlbnYubWF4RGlnaXRXaWR0aDtcblx0XHRjb25zdCBwaXhlbFJhdGlvID0gZW52LnBpeGVsUmF0aW87XG5cdFx0Y29uc3Qgdmlld0xpbmVDb3VudCA9IGVudi52aWV3TGluZUNvdW50O1xuXG5cdFx0Y29uc3Qgd29yZFdyYXBPdmVycmlkZTIgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBPdmVycmlkZTIpO1xuXHRcdGNvbnN0IHdvcmRXcmFwT3ZlcnJpZGUxID0gKHdvcmRXcmFwT3ZlcnJpZGUyID09PSAnaW5oZXJpdCcgPyBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBPdmVycmlkZTEpIDogd29yZFdyYXBPdmVycmlkZTIpO1xuXHRcdGNvbnN0IHdvcmRXcmFwID0gKHdvcmRXcmFwT3ZlcnJpZGUxID09PSAnaW5oZXJpdCcgPyBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXApIDogd29yZFdyYXBPdmVycmlkZTEpO1xuXG5cdFx0Y29uc3Qgd29yZFdyYXBDb2x1bW4gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBDb2x1bW4pO1xuXHRcdGNvbnN0IGlzRG9taW5hdGVkQnlMb25nTGluZXMgPSBlbnYuaXNEb21pbmF0ZWRCeUxvbmdMaW5lcztcblxuXHRcdGNvbnN0IHNob3dHbHlwaE1hcmdpbiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbik7XG5cdFx0Y29uc3Qgc2hvd0xpbmVOdW1iZXJzID0gKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lTnVtYmVycykucmVuZGVyVHlwZSAhPT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZik7XG5cdFx0Y29uc3QgbGluZU51bWJlcnNNaW5DaGFycyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lTnVtYmVyc01pbkNoYXJzKTtcblx0XHRjb25zdCBzY3JvbGxCZXlvbmRMYXN0TGluZSA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zY3JvbGxCZXlvbmRMYXN0TGluZSk7XG5cdFx0Y29uc3QgcGFkZGluZyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5wYWRkaW5nKTtcblx0XHRjb25zdCBtaW5pbWFwID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm1pbmltYXApO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsYmFyID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNjcm9sbGJhcik7XG5cdFx0Y29uc3QgdmVydGljYWxTY3JvbGxiYXJXaWR0aCA9IHNjcm9sbGJhci52ZXJ0aWNhbFNjcm9sbGJhclNpemU7XG5cdFx0Y29uc3QgdmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3MgPSBzY3JvbGxiYXIudmVydGljYWxIYXNBcnJvd3M7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFyQXJyb3dTaXplID0gc2Nyb2xsYmFyLmFycm93U2l6ZTtcblx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0ID0gc2Nyb2xsYmFyLmhvcml6b250YWxTY3JvbGxiYXJTaXplO1xuXG5cdFx0Y29uc3QgZm9sZGluZyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nKTtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0RlY29yYXRpb24gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scykgIT09ICduZXZlcic7XG5cblx0XHRsZXQgbGluZURlY29yYXRpb25zV2lkdGggPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdGlmIChmb2xkaW5nICYmIHNob3dGb2xkaW5nRGVjb3JhdGlvbikge1xuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGggKz0gMTY7XG5cdFx0fVxuXG5cdFx0bGV0IGxpbmVOdW1iZXJzV2lkdGggPSAwO1xuXHRcdGlmIChzaG93TGluZU51bWJlcnMpIHtcblx0XHRcdGNvbnN0IGRpZ2l0Q291bnQgPSBNYXRoLm1heChsaW5lTnVtYmVyc0RpZ2l0Q291bnQsIGxpbmVOdW1iZXJzTWluQ2hhcnMpO1xuXHRcdFx0bGluZU51bWJlcnNXaWR0aCA9IE1hdGgucm91bmQoZGlnaXRDb3VudCAqIG1heERpZ2l0V2lkdGgpO1xuXHRcdH1cblxuXHRcdGxldCBnbHlwaE1hcmdpbldpZHRoID0gMDtcblx0XHRpZiAoc2hvd0dseXBoTWFyZ2luKSB7XG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoID0gbGluZUhlaWdodCAqIGVudi5nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ7XG5cdFx0fVxuXG5cdFx0bGV0IGdseXBoTWFyZ2luTGVmdCA9IDA7XG5cdFx0bGV0IGxpbmVOdW1iZXJzTGVmdCA9IGdseXBoTWFyZ2luTGVmdCArIGdseXBoTWFyZ2luV2lkdGg7XG5cdFx0bGV0IGRlY29yYXRpb25zTGVmdCA9IGxpbmVOdW1iZXJzTGVmdCArIGxpbmVOdW1iZXJzV2lkdGg7XG5cdFx0bGV0IGNvbnRlbnRMZWZ0ID0gZGVjb3JhdGlvbnNMZWZ0ICsgbGluZURlY29yYXRpb25zV2lkdGg7XG5cblx0XHRjb25zdCByZW1haW5pbmdXaWR0aCA9IG91dGVyV2lkdGggLSBnbHlwaE1hcmdpbldpZHRoIC0gbGluZU51bWJlcnNXaWR0aCAtIGxpbmVEZWNvcmF0aW9uc1dpZHRoO1xuXG5cdFx0bGV0IGlzV29yZFdyYXBNaW5pZmllZCA9IGZhbHNlO1xuXHRcdGxldCBpc1ZpZXdwb3J0V3JhcHBpbmcgPSBmYWxzZTtcblx0XHRsZXQgd3JhcHBpbmdDb2x1bW4gPSAtMTtcblxuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQpID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkICYmIHdvcmRXcmFwT3ZlcnJpZGUxID09PSAnaW5oZXJpdCcgJiYgaXNEb21pbmF0ZWRCeUxvbmdMaW5lcykge1xuXHRcdFx0Ly8gRm9yY2Ugdmlld3BvcnQgd2lkdGggd3JhcHBpbmcgaWYgbW9kZWwgaXMgZG9taW5hdGVkIGJ5IGxvbmcgbGluZXNcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZCA9IHRydWU7XG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmcgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAod29yZFdyYXAgPT09ICdvbicgfHwgd29yZFdyYXAgPT09ICdib3VuZGVkJykge1xuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHdvcmRXcmFwID09PSAnd29yZFdyYXBDb2x1bW4nKSB7XG5cdFx0XHR3cmFwcGluZ0NvbHVtbiA9IHdvcmRXcmFwQ29sdW1uO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbmltYXBMYXlvdXQgPSBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIuX2NvbXB1dGVNaW5pbWFwTGF5b3V0KHtcblx0XHRcdG91dGVyV2lkdGg6IG91dGVyV2lkdGgsXG5cdFx0XHRvdXRlckhlaWdodDogb3V0ZXJIZWlnaHQsXG5cdFx0XHRsaW5lSGVpZ2h0OiBsaW5lSGVpZ2h0LFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgsXG5cdFx0XHRwaXhlbFJhdGlvOiBwaXhlbFJhdGlvLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IHNjcm9sbEJleW9uZExhc3RMaW5lLFxuXHRcdFx0cGFkZGluZ1RvcDogcGFkZGluZy50b3AsXG5cdFx0XHRwYWRkaW5nQm90dG9tOiBwYWRkaW5nLmJvdHRvbSxcblx0XHRcdG1pbmltYXA6IG1pbmltYXAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoLFxuXHRcdFx0dmlld0xpbmVDb3VudDogdmlld0xpbmVDb3VudCxcblx0XHRcdHJlbWFpbmluZ1dpZHRoOiByZW1haW5pbmdXaWR0aCxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogaXNWaWV3cG9ydFdyYXBwaW5nLFxuXHRcdH0sIGVudi5tZW1vcnkgfHwgbmV3IENvbXB1dGVPcHRpb25zTWVtb3J5KCkpO1xuXG5cdFx0aWYgKG1pbmltYXBMYXlvdXQucmVuZGVyTWluaW1hcCAhPT0gUmVuZGVyTWluaW1hcC5Ob25lICYmIG1pbmltYXBMYXlvdXQubWluaW1hcExlZnQgPT09IDApIHtcblx0XHRcdC8vIHRoZSBtaW5pbWFwIGlzIHJlbmRlcmVkIHRvIHRoZSBsZWZ0LCBzbyBtb3ZlIGV2ZXJ5dGhpbmcgdG8gdGhlIHJpZ2h0XG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQgKz0gbWluaW1hcExheW91dC5taW5pbWFwV2lkdGg7XG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQgKz0gbWluaW1hcExheW91dC5taW5pbWFwV2lkdGg7XG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQgKz0gbWluaW1hcExheW91dC5taW5pbWFwV2lkdGg7XG5cdFx0XHRjb250ZW50TGVmdCArPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudFdpZHRoID0gcmVtYWluaW5nV2lkdGggLSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblxuXHRcdC8vIChsZWF2aW5nIDJweCBmb3IgdGhlIGN1cnNvciB0byBoYXZlIHNwYWNlIGFmdGVyIHRoZSBsYXN0IGNoYXJhY3Rlcilcblx0XHRjb25zdCB2aWV3cG9ydENvbHVtbiA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoKGNvbnRlbnRXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAvIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCkpO1xuXG5cdFx0Y29uc3QgdmVydGljYWxBcnJvd1NpemUgPSAodmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3MgPyBzY3JvbGxiYXJBcnJvd1NpemUgOiAwKTtcblxuXHRcdGlmIChpc1ZpZXdwb3J0V3JhcHBpbmcpIHtcblx0XHRcdC8vIGNvbXB1dGUgdGhlIGFjdHVhbCB3cmFwcGluZ0NvbHVtblxuXHRcdFx0d3JhcHBpbmdDb2x1bW4gPSBNYXRoLm1heCgxLCB2aWV3cG9ydENvbHVtbik7XG5cdFx0XHRpZiAod29yZFdyYXAgPT09ICdib3VuZGVkJykge1xuXHRcdFx0XHR3cmFwcGluZ0NvbHVtbiA9IE1hdGgubWluKHdyYXBwaW5nQ29sdW1uLCB3b3JkV3JhcENvbHVtbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiBvdXRlcldpZHRoLFxuXHRcdFx0aGVpZ2h0OiBvdXRlckhlaWdodCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiBnbHlwaE1hcmdpbkxlZnQsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiBnbHlwaE1hcmdpbldpZHRoLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiBlbnYuZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50LFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IGxpbmVOdW1iZXJzTGVmdCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IGxpbmVOdW1iZXJzV2lkdGgsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogZGVjb3JhdGlvbnNMZWZ0LFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogbGluZURlY29yYXRpb25zV2lkdGgsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiBjb250ZW50TGVmdCxcblx0XHRcdGNvbnRlbnRXaWR0aDogY29udGVudFdpZHRoLFxuXG5cdFx0XHRtaW5pbWFwOiBtaW5pbWFwTGF5b3V0LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogdmlld3BvcnRDb2x1bW4sXG5cblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogaXNXb3JkV3JhcE1pbmlmaWVkLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBpc1ZpZXdwb3J0V3JhcHBpbmcsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogd3JhcHBpbmdDb2x1bW4sXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiBob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0LFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogdmVydGljYWxBcnJvd1NpemUsXG5cdFx0XHRcdHdpZHRoOiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IChvdXRlckhlaWdodCAtIDIgKiB2ZXJ0aWNhbEFycm93U2l6ZSksXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFdyYXBwaW5nU3RyYXRlZ3lcbmNsYXNzIFdyYXBwaW5nU3RyYXRlZ3kgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi53cmFwcGluZ1N0cmF0ZWd5LCAnc2ltcGxlJyB8ICdhZHZhbmNlZCcsICdzaW1wbGUnIHwgJ2FkdmFuY2VkJz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi53cmFwcGluZ1N0cmF0ZWd5LCAnd3JhcHBpbmdTdHJhdGVneScsICdzaW1wbGUnLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLndyYXBwaW5nU3RyYXRlZ3knOiB7XG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd3cmFwcGluZ1N0cmF0ZWd5LnNpbXBsZScsIFwiQXNzdW1lcyB0aGF0IGFsbCBjaGFyYWN0ZXJzIGFyZSBvZiB0aGUgc2FtZSB3aWR0aC4gVGhpcyBpcyBhIGZhc3QgYWxnb3JpdGhtIHRoYXQgd29ya3MgY29ycmVjdGx5IGZvciBtb25vc3BhY2UgZm9udHMgYW5kIGNlcnRhaW4gc2NyaXB0cyAobGlrZSBMYXRpbiBjaGFyYWN0ZXJzKSB3aGVyZSBnbHlwaHMgYXJlIG9mIGVxdWFsIHdpZHRoLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnd3JhcHBpbmdTdHJhdGVneS5hZHZhbmNlZCcsIFwiRGVsZWdhdGVzIHdyYXBwaW5nIHBvaW50cyBjb21wdXRhdGlvbiB0byB0aGUgYnJvd3Nlci4gVGhpcyBpcyBhIHNsb3cgYWxnb3JpdGhtLCB0aGF0IG1pZ2h0IGNhdXNlIGZyZWV6ZXMgZm9yIGxhcmdlIGZpbGVzLCBidXQgaXQgd29ya3MgY29ycmVjdGx5IGluIGFsbCBjYXNlcy5cIilcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnc2ltcGxlJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3NpbXBsZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd3JhcHBpbmdTdHJhdGVneScsIFwiQ29udHJvbHMgdGhlIGFsZ29yaXRobSB0aGF0IGNvbXB1dGVzIHdyYXBwaW5nIHBvaW50cy4gTm90ZSB0aGF0IHdoZW4gaW4gYWNjZXNzaWJpbGl0eSBtb2RlLCBhZHZhbmNlZCB3aWxsIGJlIHVzZWQgZm9yIHRoZSBiZXN0IGV4cGVyaWVuY2UuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnIHtcblx0XHRyZXR1cm4gc3RyaW5nU2V0PCdzaW1wbGUnIHwgJ2FkdmFuY2VkJz4oaW5wdXQsICdzaW1wbGUnLCBbJ3NpbXBsZScsICdhZHZhbmNlZCddKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnKTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnIHtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCk7XG5cdFx0aWYgKGFjY2Vzc2liaWxpdHlTdXBwb3J0ID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkKSB7XG5cdFx0XHQvLyBpZiB3ZSBrbm93IGZvciBhIGZhY3QgdGhhdCBhIHNjcmVlbiByZWFkZXIgaXMgYXR0YWNoZWQsIHdlIHN3aXRjaCBvdXIgc3RyYXRlZ3kgdG8gYWR2YW5jZWQgdG9cblx0XHRcdC8vIGhlbHAgdGhhdCB0aGUgZWRpdG9yJ3Mgd3JhcHBpbmcgcG9pbnRzIG1hdGNoIHRoZSB0ZXh0YXJlYSdzIHdyYXBwaW5nIHBvaW50c1xuXHRcdFx0cmV0dXJuICdhZHZhbmNlZCc7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBsaWdodGJ1bGJcblxuZXhwb3J0IGVudW0gU2hvd0xpZ2h0YnVsYkljb25Nb2RlIHtcblx0T2ZmID0gJ29mZicsXG5cdE9uQ29kZSA9ICdvbkNvZGUnLFxuXHRPbiA9ICdvbidcbn1cblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBsaWdodGJ1bGJcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yTGlnaHRidWxiT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIGxpZ2h0YnVsYiBjb2RlIGFjdGlvbi5cblx0ICogVGhlIHRocmVlIHBvc3NpYmxlIHZhbHVlcyBhcmUgYG9mZmAsIGBvbmAgYW5kIGBvbkNvZGVgIGFuZCB0aGUgZGVmYXVsdCBpcyBgb25Db2RlYC5cblx0ICogYG9mZmAgZGlzYWJsZXMgdGhlIGNvZGUgYWN0aW9uIG1lbnUuXG5cdCAqIGBvbmAgc2hvd3MgdGhlIGNvZGUgYWN0aW9uIG1lbnUgb24gY29kZSBhbmQgb24gZW1wdHkgbGluZXMuXG5cdCAqIGBvbkNvZGVgIHNob3dzIHRoZSBjb2RlIGFjdGlvbiBtZW51IG9uIGNvZGUgb25seS5cblx0ICovXG5cdGVuYWJsZWQ/OiBTaG93TGlnaHRidWxiSWNvbk1vZGU7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckxpZ2h0YnVsYk9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yTGlnaHRidWxiT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JMaWdodGJ1bGIgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5saWdodGJ1bGIsIElFZGl0b3JMaWdodGJ1bGJPcHRpb25zLCBFZGl0b3JMaWdodGJ1bGJPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvckxpZ2h0YnVsYk9wdGlvbnMgPSB7IGVuYWJsZWQ6IFNob3dMaWdodGJ1bGJJY29uTW9kZS5PbkNvZGUgfTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5saWdodGJ1bGIsICdsaWdodGJ1bGInLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5saWdodGJ1bGIuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9mZiwgU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9uQ29kZSwgU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9uXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmxpZ2h0YnVsYi5lbmFibGVkLm9mZicsICdEaXNhYmxlIHRoZSBjb2RlIGFjdGlvbiBtZW51LicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IubGlnaHRidWxiLmVuYWJsZWQub25Db2RlJywgJ1Nob3cgdGhlIGNvZGUgYWN0aW9uIG1lbnUgd2hlbiB0aGUgY3Vyc29yIGlzIG9uIGxpbmVzIHdpdGggY29kZS4nKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmxpZ2h0YnVsYi5lbmFibGVkLm9uJywgJ1Nob3cgdGhlIGNvZGUgYWN0aW9uIG1lbnUgd2hlbiB0aGUgY3Vyc29yIGlzIG9uIGxpbmVzIHdpdGggY29kZSBvciBvbiBlbXB0eSBsaW5lcy4nKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VuYWJsZWQnLCBcIkVuYWJsZXMgdGhlIENvZGUgQWN0aW9uIGxpZ2h0YnVsYiBpbiB0aGUgZWRpdG9yLlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBFZGl0b3JMaWdodGJ1bGJPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JMaWdodGJ1bGJPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogc3RyaW5nU2V0KGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQsIFtTaG93TGlnaHRidWxiSWNvbk1vZGUuT2ZmLCBTaG93TGlnaHRidWxiSWNvbk1vZGUuT25Db2RlLCBTaG93TGlnaHRidWxiSWNvbk1vZGUuT25dKVxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzdGlja3lTY3JvbGxcblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIHN0aWNreSBzY3JvbGxcblx0ICovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogTWF4aW11bSBudW1iZXIgb2Ygc3RpY2t5IGxpbmVzIHRvIHNob3dcblx0ICovXG5cdG1heExpbmVDb3VudD86IG51bWJlcjtcblx0LyoqXG5cdCAqIE1vZGVsIHRvIGNob29zZSBmb3Igc3RpY2t5IHNjcm9sbCBieSBkZWZhdWx0XG5cdCAqL1xuXHRkZWZhdWx0TW9kZWw/OiAnb3V0bGluZU1vZGVsJyB8ICdmb2xkaW5nUHJvdmlkZXJNb2RlbCcgfCAnaW5kZW50YXRpb25Nb2RlbCc7XG5cdC8qKlxuXHQgKiBEZWZpbmUgd2hldGhlciB0byBzY3JvbGwgc3RpY2t5IHNjcm9sbCB3aXRoIGVkaXRvciBob3Jpem9udGFsIHNjcm9sbGJhZVxuXHQgKi9cblx0c2Nyb2xsV2l0aEVkaXRvcj86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JTdGlja3lTY3JvbGwgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwsIElFZGl0b3JTdGlja3lTY3JvbGxPcHRpb25zLCBFZGl0b3JTdGlja3lTY3JvbGxPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnMgPSB7IGVuYWJsZWQ6IHRydWUsIG1heExpbmVDb3VudDogNSwgZGVmYXVsdE1vZGVsOiAnb3V0bGluZU1vZGVsJywgc2Nyb2xsV2l0aEVkaXRvcjogdHJ1ZSB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCwgJ3N0aWNreVNjcm9sbCcsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLnN0aWNreVNjcm9sbC5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdGlja3lTY3JvbGwuZW5hYmxlZCcsIFwiU2hvd3MgdGhlIG5lc3RlZCBjdXJyZW50IHNjb3BlcyBkdXJpbmcgdGhlIHNjcm9sbCBhdCB0aGUgdG9wIG9mIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3RpY2t5U2Nyb2xsLm1heExpbmVDb3VudCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5tYXhMaW5lQ291bnQsXG5cdFx0XHRcdFx0bWluaW11bTogMSxcblx0XHRcdFx0XHRtYXhpbXVtOiAyMCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3RpY2t5U2Nyb2xsLm1heExpbmVDb3VudCcsIFwiRGVmaW5lcyB0aGUgbWF4aW11bSBudW1iZXIgb2Ygc3RpY2t5IGxpbmVzIHRvIHNob3cuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3RpY2t5U2Nyb2xsLmRlZmF1bHRNb2RlbCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ291dGxpbmVNb2RlbCcsICdmb2xkaW5nUHJvdmlkZXJNb2RlbCcsICdpbmRlbnRhdGlvbk1vZGVsJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZGVmYXVsdE1vZGVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdGlja3lTY3JvbGwuZGVmYXVsdE1vZGVsJywgXCJEZWZpbmVzIHRoZSBtb2RlbCB0byB1c2UgZm9yIGRldGVybWluaW5nIHdoaWNoIGxpbmVzIHRvIHN0aWNrLiBJZiB0aGUgb3V0bGluZSBtb2RlbCBkb2VzIG5vdCBleGlzdCwgaXQgd2lsbCBmYWxsIGJhY2sgb24gdGhlIGZvbGRpbmcgcHJvdmlkZXIgbW9kZWwgd2hpY2ggZmFsbHMgYmFjayBvbiB0aGUgaW5kZW50YXRpb24gbW9kZWwuIFRoaXMgb3JkZXIgaXMgcmVzcGVjdGVkIGluIGFsbCB0aHJlZSBjYXNlcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdGlja3lTY3JvbGwuc2Nyb2xsV2l0aEVkaXRvcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2Nyb2xsV2l0aEVkaXRvcixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3RpY2t5U2Nyb2xsLnNjcm9sbFdpdGhFZGl0b3InLCBcIkVuYWJsZSBzY3JvbGxpbmcgb2YgU3RpY2t5IFNjcm9sbCB3aXRoIHRoZSBlZGl0b3IncyBob3Jpem9udGFsIHNjcm9sbGJhci5cIilcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBib29sZWFuKGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQpLFxuXHRcdFx0bWF4TGluZUNvdW50OiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5tYXhMaW5lQ291bnQsIHRoaXMuZGVmYXVsdFZhbHVlLm1heExpbmVDb3VudCwgMSwgMjApLFxuXHRcdFx0ZGVmYXVsdE1vZGVsOiBzdHJpbmdTZXQ8J291dGxpbmVNb2RlbCcgfCAnZm9sZGluZ1Byb3ZpZGVyTW9kZWwnIHwgJ2luZGVudGF0aW9uTW9kZWwnPihpbnB1dC5kZWZhdWx0TW9kZWwsIHRoaXMuZGVmYXVsdFZhbHVlLmRlZmF1bHRNb2RlbCwgWydvdXRsaW5lTW9kZWwnLCAnZm9sZGluZ1Byb3ZpZGVyTW9kZWwnLCAnaW5kZW50YXRpb25Nb2RlbCddKSxcblx0XHRcdHNjcm9sbFdpdGhFZGl0b3I6IGJvb2xlYW4oaW5wdXQuc2Nyb2xsV2l0aEVkaXRvciwgdGhpcy5kZWZhdWx0VmFsdWUuc2Nyb2xsV2l0aEVkaXRvcilcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gaW5sYXlIaW50c1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIGlubGF5SGludHNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9ySW5sYXlIaW50c09wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHRoZSBpbmxpbmUgaGludHMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRlbmFibGVkPzogJ29uJyB8ICdvZmYnIHwgJ29mZlVubGVzc1ByZXNzZWQnIHwgJ29uVW5sZXNzUHJlc3NlZCc7XG5cblx0LyoqXG5cdCAqIEZvbnQgc2l6ZSBvZiBpbmxpbmUgaGludHMuXG5cdCAqIERlZmF1bHQgdG8gOTAlIG9mIHRoZSBlZGl0b3IgZm9udCBzaXplLlxuXHQgKi9cblx0Zm9udFNpemU/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEZvbnQgZmFtaWx5IG9mIGlubGluZSBoaW50cy5cblx0ICogRGVmYXVsdHMgdG8gZWRpdG9yIGZvbnQgZmFtaWx5LlxuXHQgKi9cblx0Zm9udEZhbWlseT86IHN0cmluZztcblxuXHQvKipcblx0ICogRW5hYmxlcyB0aGUgcGFkZGluZyBhcm91bmQgdGhlIGlubGF5IGhpbnQuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0cGFkZGluZz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE1heGltdW0gbGVuZ3RoIGZvciBpbmxheSBoaW50cyBwZXIgbGluZVxuXHQgKiBTZXQgdG8gMCB0byBoYXZlIGFuIHVubGltaXRlZCBsZW5ndGguXG5cdCAqL1xuXHRtYXhpbXVtTGVuZ3RoPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBFZGl0b3JJbmxheUhpbnRzT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JJbmxheUhpbnRzT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JJbmxheUhpbnRzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uaW5sYXlIaW50cywgSUVkaXRvcklubGF5SGludHNPcHRpb25zLCBFZGl0b3JJbmxheUhpbnRzT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBFZGl0b3JJbmxheUhpbnRzT3B0aW9ucyA9IHsgZW5hYmxlZDogJ29uJywgZm9udFNpemU6IDAsIGZvbnRGYW1pbHk6ICcnLCBwYWRkaW5nOiBmYWxzZSwgbWF4aW11bUxlbmd0aDogNDMgfTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5pbmxheUhpbnRzLCAnaW5sYXlIaW50cycsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmlubGF5SGludHMuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGF5SGludHMuZW5hYmxlJywgXCJFbmFibGVzIHRoZSBpbmxheSBoaW50cyBpbiB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdFx0XHRlbnVtOiBbJ29uJywgJ29uVW5sZXNzUHJlc3NlZCcsICdvZmZVbmxlc3NQcmVzc2VkJywgJ29mZiddLFxuXHRcdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuaW5sYXlIaW50cy5vbicsIFwiSW5sYXkgaGludHMgYXJlIGVuYWJsZWRcIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5pbmxheUhpbnRzLm9uVW5sZXNzUHJlc3NlZCcsIFwiSW5sYXkgaGludHMgYXJlIHNob3dpbmcgYnkgZGVmYXVsdCBhbmQgaGlkZSB3aGVuIGhvbGRpbmcgezB9XCIsIHBsYXRmb3JtLmlzTWFjaW50b3NoID8gYEN0cmwrT3B0aW9uYCA6IGBDdHJsK0FsdGApLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuaW5sYXlIaW50cy5vZmZVbmxlc3NQcmVzc2VkJywgXCJJbmxheSBoaW50cyBhcmUgaGlkZGVuIGJ5IGRlZmF1bHQgYW5kIHNob3cgd2hlbiBob2xkaW5nIHswfVwiLCBwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGBDdHJsK09wdGlvbmAgOiBgQ3RybCtBbHRgKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGF5SGludHMub2ZmJywgXCJJbmxheSBoaW50cyBhcmUgZGlzYWJsZWRcIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxheUhpbnRzLmZvbnRTaXplJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmZvbnRTaXplLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5sYXlIaW50cy5mb250U2l6ZScsIFwiQ29udHJvbHMgZm9udCBzaXplIG9mIGlubGF5IGhpbnRzIGluIHRoZSBlZGl0b3IuIEFzIGRlZmF1bHQgdGhlIHswfSBpcyB1c2VkIHdoZW4gdGhlIGNvbmZpZ3VyZWQgdmFsdWUgaXMgbGVzcyB0aGFuIHsxfSBvciBncmVhdGVyIHRoYW4gdGhlIGVkaXRvciBmb250IHNpemUuXCIsICdgI2VkaXRvci5mb250U2l6ZSNgJywgJ2A1YCcpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5sYXlIaW50cy5mb250RmFtaWx5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmZvbnRGYW1pbHksXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxheUhpbnRzLmZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIGZvbnQgZmFtaWx5IG9mIGlubGF5IGhpbnRzIGluIHRoZSBlZGl0b3IuIFdoZW4gc2V0IHRvIGVtcHR5LCB0aGUgezB9IGlzIHVzZWQuXCIsICdgI2VkaXRvci5mb250RmFtaWx5I2AnKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGF5SGludHMucGFkZGluZyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMucGFkZGluZyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxheUhpbnRzLnBhZGRpbmcnLCBcIkVuYWJsZXMgdGhlIHBhZGRpbmcgYXJvdW5kIHRoZSBpbmxheSBoaW50cyBpbiB0aGUgZWRpdG9yLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGF5SGludHMubWF4aW11bUxlbmd0aCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5tYXhpbXVtTGVuZ3RoLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5sYXlIaW50cy5tYXhpbXVtTGVuZ3RoJywgXCJNYXhpbXVtIG92ZXJhbGwgbGVuZ3RoIG9mIGlubGF5IGhpbnRzLCBmb3IgYSBzaW5nbGUgbGluZSwgYmVmb3JlIHRoZXkgZ2V0IHRydW5jYXRlZCBieSB0aGUgZWRpdG9yLiBTZXQgdG8gYDBgIHRvIG5ldmVyIHRydW5jYXRlXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEVkaXRvcklubGF5SGludHNPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JJbmxheUhpbnRzT3B0aW9ucz47XG5cdFx0aWYgKHR5cGVvZiBpbnB1dC5lbmFibGVkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGlucHV0LmVuYWJsZWQgPSBpbnB1dC5lbmFibGVkID8gJ29uJyA6ICdvZmYnO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogc3RyaW5nU2V0PCdvbicgfCAnb2ZmJyB8ICdvZmZVbmxlc3NQcmVzc2VkJyB8ICdvblVubGVzc1ByZXNzZWQnPihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lbmFibGVkLCBbJ29uJywgJ29mZicsICdvZmZVbmxlc3NQcmVzc2VkJywgJ29uVW5sZXNzUHJlc3NlZCddKSxcblx0XHRcdGZvbnRTaXplOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5mb250U2l6ZSwgdGhpcy5kZWZhdWx0VmFsdWUuZm9udFNpemUsIDAsIDEwMCksXG5cdFx0XHRmb250RmFtaWx5OiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LmZvbnRGYW1pbHksIHRoaXMuZGVmYXVsdFZhbHVlLmZvbnRGYW1pbHkpLFxuXHRcdFx0cGFkZGluZzogYm9vbGVhbihpbnB1dC5wYWRkaW5nLCB0aGlzLmRlZmF1bHRWYWx1ZS5wYWRkaW5nKSxcblx0XHRcdG1heGltdW1MZW5ndGg6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0Lm1heGltdW1MZW5ndGgsIHRoaXMuZGVmYXVsdFZhbHVlLm1heGltdW1MZW5ndGgsIDAsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbGluZURlY29yYXRpb25zV2lkdGhcblxuY2xhc3MgRWRpdG9yTGluZURlY29yYXRpb25zV2lkdGggZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5saW5lRGVjb3JhdGlvbnNXaWR0aCwgbnVtYmVyIHwgc3RyaW5nLCBudW1iZXI+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ubGluZURlY29yYXRpb25zV2lkdGgsICdsaW5lRGVjb3JhdGlvbnNXaWR0aCcsIDEwKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IG51bWJlciB7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgJiYgL15cXGQrKFxcLlxcZCspP2NoJC8udGVzdChpbnB1dCkpIHtcblx0XHRcdGNvbnN0IG11bHRpcGxlID0gcGFyc2VGbG9hdChpbnB1dC5zdWJzdHJpbmcoMCwgaW5wdXQubGVuZ3RoIC0gMikpO1xuXHRcdFx0cmV0dXJuIC1tdWx0aXBsZTsgLy8gbmVnYXRpdmUgbnVtYmVycyBzaWduYWwgYSBtdWx0aXBsZVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlLCAwLCAxMDAwKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHZhbHVlIDwgMCkge1xuXHRcdFx0Ly8gbmVnYXRpdmUgbnVtYmVycyBzaWduYWwgYSBtdWx0aXBsZVxuXHRcdFx0cmV0dXJuIEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KC12YWx1ZSAqIGVudi5mb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgsIHRoaXMuZGVmYXVsdFZhbHVlLCAwLCAxMDAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGxpbmVIZWlnaHRcblxuY2xhc3MgRWRpdG9yTGluZUhlaWdodCBleHRlbmRzIEVkaXRvckZsb2F0T3B0aW9uPEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0PiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24ubGluZUhlaWdodCwgJ2xpbmVIZWlnaHQnLFxuXHRcdFx0RURJVE9SX0ZPTlRfREVGQVVMVFMubGluZUhlaWdodCxcblx0XHRcdHggPT4gRWRpdG9yRmxvYXRPcHRpb24uY2xhbXAoeCwgMCwgMTUwKSxcblx0XHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdsaW5lSGVpZ2h0JywgXCJDb250cm9scyB0aGUgbGluZSBoZWlnaHQuIFxcbiAtIFVzZSAwIHRvIGF1dG9tYXRpY2FsbHkgY29tcHV0ZSB0aGUgbGluZSBoZWlnaHQgZnJvbSB0aGUgZm9udCBzaXplLlxcbiAtIFZhbHVlcyBiZXR3ZWVuIDAgYW5kIDggd2lsbCBiZSB1c2VkIGFzIGEgbXVsdGlwbGllciB3aXRoIHRoZSBmb250IHNpemUuXFxuIC0gVmFsdWVzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byA4IHdpbGwgYmUgdXNlZCBhcyBlZmZlY3RpdmUgdmFsdWVzLlwiKSB9LFxuXHRcdFx0MCxcblx0XHRcdDE1MFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Ly8gVGhlIGxpbmVIZWlnaHQgaXMgY29tcHV0ZWQgZnJvbSB0aGUgZm9udFNpemUgaWYgaXQgaXMgMC5cblx0XHQvLyBNb3Jlb3ZlciwgdGhlIGZpbmFsIGxpbmVIZWlnaHQgcmVzcGVjdHMgdGhlIGVkaXRvciB6b29tIGxldmVsLlxuXHRcdC8vIFNvIHRha2UgdGhlIHJlc3VsdCBmcm9tIGVudi5mb250SW5mb1xuXHRcdHJldHVybiBlbnYuZm9udEluZm8ubGluZUhlaWdodDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIG1pbmltYXBcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBtaW5pbWFwXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvck1pbmltYXBPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGUgcmVuZGVyaW5nIG9mIHRoZSBtaW5pbWFwLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSByZW5kZXJpbmcgb2YgbWluaW1hcC5cblx0ICovXG5cdGF1dG9oaWRlPzogJ25vbmUnIHwgJ21vdXNlb3ZlcicgfCAnc2Nyb2xsJztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIHNpZGUgb2YgdGhlIG1pbmltYXAgaW4gZWRpdG9yLlxuXHQgKiBEZWZhdWx0cyB0byAncmlnaHQnLlxuXHQgKi9cblx0c2lkZT86ICdyaWdodCcgfCAnbGVmdCc7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBtaW5pbWFwIHJlbmRlcmluZyBtb2RlLlxuXHQgKiBEZWZhdWx0cyB0byAnYWN0dWFsJy5cblx0ICovXG5cdHNpemU/OiAncHJvcG9ydGlvbmFsJyB8ICdmaWxsJyB8ICdmaXQnO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgcmVuZGVyaW5nIG9mIHRoZSBtaW5pbWFwIHNsaWRlci5cblx0ICogRGVmYXVsdHMgdG8gJ21vdXNlb3ZlcicuXG5cdCAqL1xuXHRzaG93U2xpZGVyPzogJ2Fsd2F5cycgfCAnbW91c2VvdmVyJztcblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgYWN0dWFsIHRleHQgb24gYSBsaW5lIChhcyBvcHBvc2VkIHRvIGNvbG9yIGJsb2NrcykuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRyZW5kZXJDaGFyYWN0ZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIExpbWl0IHRoZSB3aWR0aCBvZiB0aGUgbWluaW1hcCB0byByZW5kZXIgYXQgbW9zdCBhIGNlcnRhaW4gbnVtYmVyIG9mIGNvbHVtbnMuXG5cdCAqIERlZmF1bHRzIHRvIDEyMC5cblx0ICovXG5cdG1heENvbHVtbj86IG51bWJlcjtcblx0LyoqXG5cdCAqIFJlbGF0aXZlIHNpemUgb2YgdGhlIGZvbnQgaW4gdGhlIG1pbmltYXAuIERlZmF1bHRzIHRvIDEuXG5cdCAqL1xuXHRzY2FsZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gc2hvdyBuYW1lZCByZWdpb25zIGFzIHNlY3Rpb24gaGVhZGVycy4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNob3dSZWdpb25TZWN0aW9uSGVhZGVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIHNob3cgTUFSSzogY29tbWVudHMgYXMgc2VjdGlvbiBoZWFkZXJzLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2hvd01hcmtTZWN0aW9uSGVhZGVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHNwZWNpZmllZCwgaXMgdXNlZCB0byBjcmVhdGUgYSBjdXN0b20gc2VjdGlvbiBoZWFkZXIgcGFyc2VyIHJlZ2V4cC5cblx0ICogTXVzdCBjb250YWluIGEgbWF0Y2ggZ3JvdXAgbmFtZWQgJ2xhYmVsJyAod3JpdHRlbiBhcyAoPzxsYWJlbD4uKykpIHRoYXQgZW5jYXBzdWxhdGVzIHRoZSBzZWN0aW9uIGhlYWRlci5cblx0ICogT3B0aW9uYWxseSBjYW4gaW5jbHVkZSBhbm90aGVyIG1hdGNoIGdyb3VwIG5hbWVkICdzZXBhcmF0b3InLlxuXHQgKiBUbyBtYXRjaCBtdWx0aS1saW5lIGhlYWRlcnMgbGlrZTpcblx0ICogICAvLyA9PT09PT09PT09XG5cdCAqICAgLy8gTXkgU2VjdGlvblxuXHQgKiAgIC8vID09PT09PT09PT1cblx0ICogVXNlIGEgcGF0dGVybiBsaWtlOiBePXszLH1cXG5eXFwvXFwvICooPzxsYWJlbD5bXlxcbl0qPylcXG5ePXszLH0kXG5cdCAqL1xuXHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4Pzogc3RyaW5nO1xuXHQvKipcblx0ICogRm9udCBzaXplIG9mIHNlY3Rpb24gaGVhZGVycy4gRGVmYXVsdHMgdG8gOS5cblx0ICovXG5cdHNlY3Rpb25IZWFkZXJGb250U2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFNwYWNpbmcgYmV0d2VlbiB0aGUgc2VjdGlvbiBoZWFkZXIgY2hhcmFjdGVycyAoaW4gQ1NTIHB4KS4gRGVmYXVsdHMgdG8gMS5cblx0ICovXG5cdHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBFZGl0b3JNaW5pbWFwT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JNaW5pbWFwT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JNaW5pbWFwIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ubWluaW1hcCwgSUVkaXRvck1pbmltYXBPcHRpb25zLCBFZGl0b3JNaW5pbWFwT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBFZGl0b3JNaW5pbWFwT3B0aW9ucyA9IHtcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRzaXplOiAncHJvcG9ydGlvbmFsJyxcblx0XHRcdHNpZGU6ICdyaWdodCcsXG5cdFx0XHRzaG93U2xpZGVyOiAnbW91c2VvdmVyJyxcblx0XHRcdGF1dG9oaWRlOiAnbm9uZScsXG5cdFx0XHRyZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWF4Q29sdW1uOiAxMjAsXG5cdFx0XHRzY2FsZTogMSxcblx0XHRcdHNob3dSZWdpb25TZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdHNob3dNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXFxcXGJNQVJLOlxcXFxzKig/PHNlcGFyYXRvcj5cXC0/KVxcXFxzKig/PGxhYmVsPi4qKSQnLFxuXHRcdFx0c2VjdGlvbkhlYWRlckZvbnRTaXplOiA5LFxuXHRcdFx0c2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmc6IDEsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5taW5pbWFwLCAnbWluaW1hcCcsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZW5hYmxlZCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIG1pbmltYXAgaXMgc2hvd24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5hdXRvaGlkZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ25vbmUnLCAnbW91c2VvdmVyJywgJ3Njcm9sbCddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbWluaW1hcC5hdXRvaGlkZS5ub25lJywgXCJUaGUgbWluaW1hcCBpcyBhbHdheXMgc2hvd24uXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdtaW5pbWFwLmF1dG9oaWRlLm1vdXNlb3ZlcicsIFwiVGhlIG1pbmltYXAgaXMgaGlkZGVuIHdoZW4gbW91c2UgaXMgbm90IG92ZXIgdGhlIG1pbmltYXAgYW5kIHNob3duIHdoZW4gbW91c2UgaXMgb3ZlciB0aGUgbWluaW1hcC5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ21pbmltYXAuYXV0b2hpZGUuc2Nyb2xsJywgXCJUaGUgbWluaW1hcCBpcyBvbmx5IHNob3duIHdoZW4gdGhlIGVkaXRvciBpcyBzY3JvbGxlZFwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmF1dG9oaWRlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuYXV0b2hpZGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIG1pbmltYXAgaXMgaGlkZGVuIGF1dG9tYXRpY2FsbHkuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5zaXplJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsncHJvcG9ydGlvbmFsJywgJ2ZpbGwnLCAnZml0J10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdtaW5pbWFwLnNpemUucHJvcG9ydGlvbmFsJywgXCJUaGUgbWluaW1hcCBoYXMgdGhlIHNhbWUgc2l6ZSBhcyB0aGUgZWRpdG9yIGNvbnRlbnRzIChhbmQgbWlnaHQgc2Nyb2xsKS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ21pbmltYXAuc2l6ZS5maWxsJywgXCJUaGUgbWluaW1hcCB3aWxsIHN0cmV0Y2ggb3Igc2hyaW5rIGFzIG5lY2Vzc2FyeSB0byBmaWxsIHRoZSBoZWlnaHQgb2YgdGhlIGVkaXRvciAobm8gc2Nyb2xsaW5nKS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ21pbmltYXAuc2l6ZS5maXQnLCBcIlRoZSBtaW5pbWFwIHdpbGwgc2hyaW5rIGFzIG5lY2Vzc2FyeSB0byBuZXZlciBiZSBsYXJnZXIgdGhhbiB0aGUgZWRpdG9yIChubyBzY3JvbGxpbmcpLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNpemUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zaXplJywgXCJDb250cm9scyB0aGUgc2l6ZSBvZiB0aGUgbWluaW1hcC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnNpZGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydsZWZ0JywgJ3JpZ2h0J10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2lkZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNpZGUnLCBcIkNvbnRyb2xzIHRoZSBzaWRlIHdoZXJlIHRvIHJlbmRlciB0aGUgbWluaW1hcC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnNob3dTbGlkZXInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydhbHdheXMnLCAnbW91c2VvdmVyJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2hvd1NsaWRlcixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNob3dTbGlkZXInLCBcIkNvbnRyb2xzIHdoZW4gdGhlIG1pbmltYXAgc2xpZGVyIGlzIHNob3duLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2NhbGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2NhbGUsXG5cdFx0XHRcdFx0bWluaW11bTogMSxcblx0XHRcdFx0XHRtYXhpbXVtOiAzLFxuXHRcdFx0XHRcdGVudW06IFsxLCAyLCAzXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNjYWxlJywgXCJTY2FsZSBvZiBjb250ZW50IGRyYXduIGluIHRoZSBtaW5pbWFwOiAxLCAyIG9yIDMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5yZW5kZXJDaGFyYWN0ZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5yZW5kZXJDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAucmVuZGVyQ2hhcmFjdGVycycsIFwiUmVuZGVyIHRoZSBhY3R1YWwgY2hhcmFjdGVycyBvbiBhIGxpbmUgYXMgb3Bwb3NlZCB0byBjb2xvciBibG9ja3MuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5tYXhDb2x1bW4nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMubWF4Q29sdW1uLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAubWF4Q29sdW1uJywgXCJMaW1pdCB0aGUgd2lkdGggb2YgdGhlIG1pbmltYXAgdG8gcmVuZGVyIGF0IG1vc3QgYSBjZXJ0YWluIG51bWJlciBvZiBjb2x1bW5zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93UmVnaW9uU2VjdGlvbkhlYWRlcnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zaG93UmVnaW9uU2VjdGlvbkhlYWRlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbmFtZWQgcmVnaW9ucyBhcmUgc2hvd24gYXMgc2VjdGlvbiBoZWFkZXJzIGluIHRoZSBtaW5pbWFwLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2hvd01hcmtTZWN0aW9uSGVhZGVycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2hvd01hcmtTZWN0aW9uSGVhZGVycyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNob3dNYXJrU2VjdGlvbkhlYWRlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgTUFSSzogY29tbWVudHMgYXJlIHNob3duIGFzIHNlY3Rpb24gaGVhZGVycyBpbiB0aGUgbWluaW1hcC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLm1hcmtTZWN0aW9uSGVhZGVyUmVnZXgnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMubWFya1NlY3Rpb25IZWFkZXJSZWdleCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLm1hcmtTZWN0aW9uSGVhZGVyUmVnZXgnLCBcIkRlZmluZXMgdGhlIHJlZ3VsYXIgZXhwcmVzc2lvbiB1c2VkIHRvIGZpbmQgc2VjdGlvbiBoZWFkZXJzIGluIGNvbW1lbnRzLiBUaGUgcmVnZXggbXVzdCBjb250YWluIGEgbmFtZWQgbWF0Y2ggZ3JvdXAgYGxhYmVsYCAod3JpdHRlbiBhcyBgKD88bGFiZWw+LispYCkgdGhhdCBlbmNhcHN1bGF0ZXMgdGhlIHNlY3Rpb24gaGVhZGVyLCBvdGhlcndpc2UgaXQgd2lsbCBub3Qgd29yay4gT3B0aW9uYWxseSB5b3UgY2FuIGluY2x1ZGUgYW5vdGhlciBtYXRjaCBncm91cCBuYW1lZCBgc2VwYXJhdG9yYC4gVXNlIFxcXFxuIGluIHRoZSBwYXR0ZXJuIHRvIG1hdGNoIG11bHRpLWxpbmUgaGVhZGVycy5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5zZWN0aW9uSGVhZGVyRm9udFNpemUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2VjdGlvbkhlYWRlckZvbnRTaXplLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2VjdGlvbkhlYWRlckZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIG9mIHNlY3Rpb24gaGVhZGVycyBpbiB0aGUgbWluaW1hcC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcnLCBcIkNvbnRyb2xzIHRoZSBhbW91bnQgb2Ygc3BhY2UgKGluIHBpeGVscykgYmV0d2VlbiBjaGFyYWN0ZXJzIG9mIHNlY3Rpb24gaGVhZGVyLiBUaGlzIGhlbHBzIHRoZSByZWFkYWJpbGl0eSBvZiB0aGUgaGVhZGVyIGluIHNtYWxsIGZvbnQgc2l6ZXMuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEVkaXRvck1pbmltYXBPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JNaW5pbWFwT3B0aW9ucz47XG5cblx0XHQvLyBWYWxpZGF0ZSBtYXJrIHNlY3Rpb24gaGVhZGVyIHJlZ2V4XG5cdFx0bGV0IG1hcmtTZWN0aW9uSGVhZGVyUmVnZXggPSB0aGlzLmRlZmF1bHRWYWx1ZS5tYXJrU2VjdGlvbkhlYWRlclJlZ2V4O1xuXHRcdGNvbnN0IGlucHV0UmVnZXggPSBpbnB1dC5tYXJrU2VjdGlvbkhlYWRlclJlZ2V4O1xuXHRcdGlmICh0eXBlb2YgaW5wdXRSZWdleCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG5ldyBSZWdFeHAoaW5wdXRSZWdleCwgJ2QnKTtcblx0XHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleCA9IGlucHV0UmVnZXg7XG5cdFx0XHR9IGNhdGNoIHsgfVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBib29sZWFuKGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQpLFxuXHRcdFx0YXV0b2hpZGU6IHN0cmluZ1NldDwnbm9uZScgfCAnbW91c2VvdmVyJyB8ICdzY3JvbGwnPihpbnB1dC5hdXRvaGlkZSwgdGhpcy5kZWZhdWx0VmFsdWUuYXV0b2hpZGUsIFsnbm9uZScsICdtb3VzZW92ZXInLCAnc2Nyb2xsJ10pLFxuXHRcdFx0c2l6ZTogc3RyaW5nU2V0PCdwcm9wb3J0aW9uYWwnIHwgJ2ZpbGwnIHwgJ2ZpdCc+KGlucHV0LnNpemUsIHRoaXMuZGVmYXVsdFZhbHVlLnNpemUsIFsncHJvcG9ydGlvbmFsJywgJ2ZpbGwnLCAnZml0J10pLFxuXHRcdFx0c2lkZTogc3RyaW5nU2V0PCdyaWdodCcgfCAnbGVmdCc+KGlucHV0LnNpZGUsIHRoaXMuZGVmYXVsdFZhbHVlLnNpZGUsIFsncmlnaHQnLCAnbGVmdCddKSxcblx0XHRcdHNob3dTbGlkZXI6IHN0cmluZ1NldDwnYWx3YXlzJyB8ICdtb3VzZW92ZXInPihpbnB1dC5zaG93U2xpZGVyLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93U2xpZGVyLCBbJ2Fsd2F5cycsICdtb3VzZW92ZXInXSksXG5cdFx0XHRyZW5kZXJDaGFyYWN0ZXJzOiBib29sZWFuKGlucHV0LnJlbmRlckNoYXJhY3RlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnJlbmRlckNoYXJhY3RlcnMpLFxuXHRcdFx0c2NhbGU6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LnNjYWxlLCAxLCAxLCAzKSxcblx0XHRcdG1heENvbHVtbjogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQubWF4Q29sdW1uLCB0aGlzLmRlZmF1bHRWYWx1ZS5tYXhDb2x1bW4sIDEsIDEwMDAwKSxcblx0XHRcdHNob3dSZWdpb25TZWN0aW9uSGVhZGVyczogYm9vbGVhbihpbnB1dC5zaG93UmVnaW9uU2VjdGlvbkhlYWRlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dSZWdpb25TZWN0aW9uSGVhZGVycyksXG5cdFx0XHRzaG93TWFya1NlY3Rpb25IZWFkZXJzOiBib29sZWFuKGlucHV0LnNob3dNYXJrU2VjdGlvbkhlYWRlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dNYXJrU2VjdGlvbkhlYWRlcnMpLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogbWFya1NlY3Rpb25IZWFkZXJSZWdleCxcblx0XHRcdHNlY3Rpb25IZWFkZXJGb250U2l6ZTogRWRpdG9yRmxvYXRPcHRpb24uY2xhbXAoRWRpdG9yRmxvYXRPcHRpb24uZmxvYXQoaW5wdXQuc2VjdGlvbkhlYWRlckZvbnRTaXplLCB0aGlzLmRlZmF1bHRWYWx1ZS5zZWN0aW9uSGVhZGVyRm9udFNpemUpLCA0LCAzMiksXG5cdFx0XHRzZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZzogRWRpdG9yRmxvYXRPcHRpb24uY2xhbXAoRWRpdG9yRmxvYXRPcHRpb24uZmxvYXQoaW5wdXQuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcsIHRoaXMuZGVmYXVsdFZhbHVlLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nKSwgMCwgNSksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIG11bHRpQ3Vyc29yTW9kaWZpZXJcblxuZnVuY3Rpb24gX211bHRpQ3Vyc29yTW9kaWZpZXJGcm9tU3RyaW5nKG11bHRpQ3Vyc29yTW9kaWZpZXI6ICdjdHJsQ21kJyB8ICdhbHQnKTogJ2FsdEtleScgfCAnbWV0YUtleScgfCAnY3RybEtleScge1xuXHRpZiAobXVsdGlDdXJzb3JNb2RpZmllciA9PT0gJ2N0cmxDbWQnKSB7XG5cdFx0cmV0dXJuIChwbGF0Zm9ybS5pc01hY2ludG9zaCA/ICdtZXRhS2V5JyA6ICdjdHJsS2V5Jyk7XG5cdH1cblx0cmV0dXJuICdhbHRLZXknO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHBhZGRpbmdcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBwYWRkaW5nXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvclBhZGRpbmdPcHRpb25zIHtcblx0LyoqXG5cdCAqIFNwYWNpbmcgYmV0d2VlbiB0b3AgZWRnZSBvZiBlZGl0b3IgYW5kIGZpcnN0IGxpbmUuXG5cdCAqL1xuXHR0b3A/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBTcGFjaW5nIGJldHdlZW4gYm90dG9tIGVkZ2Ugb2YgZWRpdG9yIGFuZCBsYXN0IGxpbmUuXG5cdCAqL1xuXHRib3R0b20/OiBudW1iZXI7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEludGVybmFsRWRpdG9yUGFkZGluZ09wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yUGFkZGluZ09wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yUGFkZGluZyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnBhZGRpbmcsIElFZGl0b3JQYWRkaW5nT3B0aW9ucywgSW50ZXJuYWxFZGl0b3JQYWRkaW5nT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnBhZGRpbmcsICdwYWRkaW5nJywgeyB0b3A6IDAsIGJvdHRvbTogMCB9LFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLnBhZGRpbmcudG9wJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0XHRtYXhpbXVtOiAxMDAwLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3BhZGRpbmcudG9wJywgXCJDb250cm9scyB0aGUgYW1vdW50IG9mIHNwYWNlIGJldHdlZW4gdGhlIHRvcCBlZGdlIG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBmaXJzdCBsaW5lLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnBhZGRpbmcuYm90dG9tJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0XHRtYXhpbXVtOiAxMDAwLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3BhZGRpbmcuYm90dG9tJywgXCJDb250cm9scyB0aGUgYW1vdW50IG9mIHNwYWNlIGJldHdlZW4gdGhlIGJvdHRvbSBlZGdlIG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsYXN0IGxpbmUuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsRWRpdG9yUGFkZGluZ09wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvclBhZGRpbmdPcHRpb25zPjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b3A6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LnRvcCwgMCwgMCwgMTAwMCksXG5cdFx0XHRib3R0b206IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LmJvdHRvbSwgMCwgMCwgMTAwMClcblx0XHR9O1xuXHR9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHBhcmFtZXRlckhpbnRzXG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBwYXJhbWV0ZXIgaGludHNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yUGFyYW1ldGVySGludE9wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHBhcmFtZXRlciBoaW50cy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIGN5Y2xpbmcgb2YgcGFyYW1ldGVyIGhpbnRzLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGN5Y2xlPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxQYXJhbWV0ZXJIaW50T3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JQYXJhbWV0ZXJIaW50T3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JQYXJhbWV0ZXJIaW50cyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnBhcmFtZXRlckhpbnRzLCBJRWRpdG9yUGFyYW1ldGVySGludE9wdGlvbnMsIEludGVybmFsUGFyYW1ldGVySGludE9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogSW50ZXJuYWxQYXJhbWV0ZXJIaW50T3B0aW9ucyA9IHtcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjeWNsZTogdHJ1ZVxuXHRcdH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24ucGFyYW1ldGVySGludHMsICdwYXJhbWV0ZXJIaW50cycsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLnBhcmFtZXRlckhpbnRzLmVuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFyYW1ldGVySGludHMuZW5hYmxlZCcsIFwiRW5hYmxlcyBhIHBvcC11cCB0aGF0IHNob3dzIHBhcmFtZXRlciBkb2N1bWVudGF0aW9uIGFuZCB0eXBlIGluZm9ybWF0aW9uIGFzIHlvdSB0eXBlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnBhcmFtZXRlckhpbnRzLmN5Y2xlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5jeWNsZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXJhbWV0ZXJIaW50cy5jeWNsZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgcGFyYW1ldGVyIGhpbnRzIG1lbnUgY3ljbGVzIG9yIGNsb3NlcyB3aGVuIHJlYWNoaW5nIHRoZSBlbmQgb2YgdGhlIGxpc3QuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbFBhcmFtZXRlckhpbnRPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElFZGl0b3JQYXJhbWV0ZXJIaW50T3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRjeWNsZTogYm9vbGVhbihpbnB1dC5jeWNsZSwgdGhpcy5kZWZhdWx0VmFsdWUuY3ljbGUpXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHBpeGVsUmF0aW9cblxuY2xhc3MgRWRpdG9yUGl4ZWxSYXRpbyBleHRlbmRzIENvbXB1dGVkRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5waXhlbFJhdGlvLCBudW1iZXI+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ucGl4ZWxSYXRpbywgMSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgXzogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gZW52LnBpeGVsUmF0aW87XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvblxuXG5jbGFzcyBQbGFjZWhvbGRlck9wdGlvbiBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnBsYWNlaG9sZGVyLCBzdHJpbmcgfCB1bmRlZmluZWQsIHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ucGxhY2Vob2xkZXIsICdwbGFjZWhvbGRlcicsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBxdWlja1N1Z2dlc3Rpb25zXG5cbmV4cG9ydCB0eXBlIFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSA9ICdvbicgfCAnaW5saW5lJyB8ICdvZmYnIHwgJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucyc7XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBxdWljayBzdWdnZXN0aW9uc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucyB7XG5cdG90aGVyPzogYm9vbGVhbiB8IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZTtcblx0Y29tbWVudHM/OiBib29sZWFuIHwgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRzdHJpbmdzPzogYm9vbGVhbiB8IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnRlcm5hbFF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zIHtcblx0cmVhZG9ubHkgb3RoZXI6IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZTtcblx0cmVhZG9ubHkgY29tbWVudHM6IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZTtcblx0cmVhZG9ubHkgc3RyaW5nczogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xufVxuXG5jbGFzcyBFZGl0b3JRdWlja1N1Z2dlc3Rpb25zIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9ucywgYm9vbGVhbiB8IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSB8IElRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucywgSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucz4ge1xuXG5cdHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBkZWZhdWx0VmFsdWU6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMgPSB7XG5cdFx0XHRvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycsXG5cdFx0XHRjb21tZW50czogJ29mZicsXG5cdFx0XHRzdHJpbmdzOiAnb2ZmJ1xuXHRcdH07XG5cdFx0Y29uc3QgdHlwZXM6IElKU09OU2NoZW1hW10gPSBbXG5cdFx0XHR7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZW51bTogWydvbicsICdpbmxpbmUnLCAnb2ZmJywgJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucyddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbbmxzLmxvY2FsaXplKCdvbicsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgc2hvdyBpbnNpZGUgdGhlIHN1Z2dlc3Qgd2lkZ2V0XCIpLCBubHMubG9jYWxpemUoJ2lubGluZScsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgc2hvdyBhcyBnaG9zdCB0ZXh0XCIpLCBubHMubG9jYWxpemUoJ29mZicsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgYXJlIGRpc2FibGVkXCIpLCBubHMubG9jYWxpemUoJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgYXJlIGRpc2FibGVkIHdoZW4gaW5saW5lIGNvbXBsZXRpb25zIGFyZSBzaG93aW5nXCIpXVxuXHRcdFx0fVxuXHRcdF07XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLnF1aWNrU3VnZ2VzdGlvbnMsICdxdWlja1N1Z2dlc3Rpb25zJywgZGVmYXVsdHMsIHtcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ29uJywgJ2lubGluZScsICdvZmYnLCAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW25scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9ucy50b3BMZXZlbC5vbicsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgYXJlIGVuYWJsZWQgZm9yIGFsbCB0b2tlbiB0eXBlc1wiKSwgbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLnRvcExldmVsLmlubGluZScsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgc2hvdyBhcyBnaG9zdCB0ZXh0IGZvciBhbGwgdG9rZW4gdHlwZXNcIiksIG5scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9ucy50b3BMZXZlbC5vZmYnLCBcIlF1aWNrIHN1Z2dlc3Rpb25zIGFyZSBkaXNhYmxlZCBmb3IgYWxsIHRva2VuIHR5cGVzXCIpLCBubHMubG9jYWxpemUoJ3F1aWNrU3VnZ2VzdGlvbnMudG9wTGV2ZWwub2ZmV2hlbklubGluZUNvbXBsZXRpb25zJywgXCJRdWljayBzdWdnZXN0aW9ucyBhcmUgZGlzYWJsZWQgZm9yIGFsbCB0b2tlbiB0eXBlcyB3aGVuIGlubGluZSBjb21wbGV0aW9ucyBhcmUgc2hvd2luZ1wiKV1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRzdHJpbmdzOiB7XG5cdFx0XHRcdFx0XHRcdGFueU9mOiB0eXBlcyxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc3RyaW5ncyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9ucy5zdHJpbmdzJywgXCJFbmFibGUgcXVpY2sgc3VnZ2VzdGlvbnMgaW5zaWRlIHN0cmluZ3MuXCIpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y29tbWVudHM6IHtcblx0XHRcdFx0XHRcdFx0YW55T2Y6IHR5cGVzLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5jb21tZW50cyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9ucy5jb21tZW50cycsIFwiRW5hYmxlIHF1aWNrIHN1Z2dlc3Rpb25zIGluc2lkZSBjb21tZW50cy5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvdGhlcjoge1xuXHRcdFx0XHRcdFx0XHRhbnlPZjogdHlwZXMsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLm90aGVyLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLm90aGVyJywgXCJFbmFibGUgcXVpY2sgc3VnZ2VzdGlvbnMgb3V0c2lkZSBvZiBzdHJpbmdzIGFuZCBjb21tZW50cy5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIHN1Z2dlc3Rpb25zIHNob3VsZCBhdXRvbWF0aWNhbGx5IHNob3cgdXAgd2hpbGUgdHlwaW5nLiBUaGlzIGNhbiBiZSBjb250cm9sbGVkIGZvciB0eXBpbmcgaW4gY29tbWVudHMsIHN0cmluZ3MsIGFuZCBvdGhlciBjb2RlLiBRdWljayBzdWdnZXN0aW9uIGNhbiBiZSBjb25maWd1cmVkIHRvIHNob3cgYXMgZ2hvc3QgdGV4dCBvciB3aXRoIHRoZSBzdWdnZXN0IHdpZGdldC4gQWxzbyBiZSBhd2FyZSBvZiB0aGUgezB9LXNldHRpbmcgd2hpY2ggY29udHJvbHMgaWYgc3VnZ2VzdGlvbnMgYXJlIHRyaWdnZXJlZCBieSBzcGVjaWFsIGNoYXJhY3RlcnMuXCIsICdgI2VkaXRvci5zdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycyNgJyksXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuZGVmYXVsdFZhbHVlID0gZGVmYXVsdHM7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbFF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zIHtcblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdC8vIGJvb2xlYW4gLT4gYWxsIG9uL29mZlxuXHRcdFx0Y29uc3QgdmFsdWUgPSBpbnB1dCA/ICdvbicgOiAnb2ZmJztcblx0XHRcdHJldHVybiB7IGNvbW1lbnRzOiB2YWx1ZSwgc3RyaW5nczogdmFsdWUsIG90aGVyOiB2YWx1ZSB9O1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gc3RyaW5nIHNob3J0aGFuZCAtPiBhcHBseSBzYW1lIHZhbHVlIHRvIGFsbCB0b2tlbiB0eXBlc1xuXHRcdFx0Y29uc3QgYWxsb3dlZFZhbHVlczogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlW10gPSBbJ29uJywgJ2lubGluZScsICdvZmYnLCAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJ107XG5cdFx0XHRjb25zdCB2YWxpZGF0ZWQgPSBzdHJpbmdTZXQ8UXVpY2tTdWdnZXN0aW9uc1ZhbHVlPihpbnB1dCBhcyBRdWlja1N1Z2dlc3Rpb25zVmFsdWUsIHRoaXMuZGVmYXVsdFZhbHVlLm90aGVyLCBhbGxvd2VkVmFsdWVzKTtcblx0XHRcdHJldHVybiB7IGNvbW1lbnRzOiB2YWxpZGF0ZWQsIHN0cmluZ3M6IHZhbGlkYXRlZCwgb3RoZXI6IHZhbGlkYXRlZCB9O1xuXHRcdH1cblx0XHRpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdC8vIGludmFsaWQgaW5wdXRcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG90aGVyLCBjb21tZW50cywgc3RyaW5ncyB9ID0gKDxJUXVpY2tTdWdnZXN0aW9uc09wdGlvbnM+aW5wdXQpO1xuXHRcdGNvbnN0IGFsbG93ZWRWYWx1ZXM6IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZVtdID0gWydvbicsICdpbmxpbmUnLCAnb2ZmJywgJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucyddO1xuXHRcdGxldCB2YWxpZGF0ZWRPdGhlcjogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRcdGxldCB2YWxpZGF0ZWRDb21tZW50czogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRcdGxldCB2YWxpZGF0ZWRTdHJpbmdzOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWU7XG5cblx0XHRpZiAodHlwZW9mIG90aGVyID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHZhbGlkYXRlZE90aGVyID0gb3RoZXIgPyAnb24nIDogJ29mZic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbGlkYXRlZE90aGVyID0gc3RyaW5nU2V0KG90aGVyLCB0aGlzLmRlZmF1bHRWYWx1ZS5vdGhlciwgYWxsb3dlZFZhbHVlcyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgY29tbWVudHMgPT09ICdib29sZWFuJykge1xuXHRcdFx0dmFsaWRhdGVkQ29tbWVudHMgPSBjb21tZW50cyA/ICdvbicgOiAnb2ZmJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsaWRhdGVkQ29tbWVudHMgPSBzdHJpbmdTZXQoY29tbWVudHMsIHRoaXMuZGVmYXVsdFZhbHVlLmNvbW1lbnRzLCBhbGxvd2VkVmFsdWVzKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBzdHJpbmdzID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHZhbGlkYXRlZFN0cmluZ3MgPSBzdHJpbmdzID8gJ29uJyA6ICdvZmYnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWxpZGF0ZWRTdHJpbmdzID0gc3RyaW5nU2V0KHN0cmluZ3MsIHRoaXMuZGVmYXVsdFZhbHVlLnN0cmluZ3MsIGFsbG93ZWRWYWx1ZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3RoZXI6IHZhbGlkYXRlZE90aGVyLFxuXHRcdFx0Y29tbWVudHM6IHZhbGlkYXRlZENvbW1lbnRzLFxuXHRcdFx0c3RyaW5nczogdmFsaWRhdGVkU3RyaW5nc1xuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiByZW5kZXJMaW5lTnVtYmVyc1xuXG5leHBvcnQgdHlwZSBMaW5lTnVtYmVyc1R5cGUgPSAnb24nIHwgJ29mZicgfCAncmVsYXRpdmUnIHwgJ2ludGVydmFsJyB8ICgobGluZU51bWJlcjogbnVtYmVyKSA9PiBzdHJpbmcpO1xuXG5leHBvcnQgY29uc3QgZW51bSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUge1xuXHRPZmYgPSAwLFxuXHRPbiA9IDEsXG5cdFJlbGF0aXZlID0gMixcblx0SW50ZXJ2YWwgPSAzLFxuXHRDdXN0b20gPSA0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJuYWxFZGl0b3JSZW5kZXJMaW5lTnVtYmVyc09wdGlvbnMge1xuXHRyZWFkb25seSByZW5kZXJUeXBlOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGU7XG5cdHJlYWRvbmx5IHJlbmRlckZuOiAoKGxpbmVOdW1iZXI6IG51bWJlcikgPT4gc3RyaW5nKSB8IG51bGw7XG59XG5cbmNsYXNzIEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9uIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ubGluZU51bWJlcnMsIExpbmVOdW1iZXJzVHlwZSwgSW50ZXJuYWxFZGl0b3JSZW5kZXJMaW5lTnVtYmVyc09wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5saW5lTnVtYmVycywgJ2xpbmVOdW1iZXJzJywgeyByZW5kZXJUeXBlOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT24sIHJlbmRlckZuOiBudWxsIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ29mZicsICdvbicsICdyZWxhdGl2ZScsICdpbnRlcnZhbCddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdsaW5lTnVtYmVycy5vZmYnLCBcIkxpbmUgbnVtYmVycyBhcmUgbm90IHJlbmRlcmVkLlwiKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2xpbmVOdW1iZXJzLm9uJywgXCJMaW5lIG51bWJlcnMgYXJlIHJlbmRlcmVkIGFzIGFic29sdXRlIG51bWJlci5cIiksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdsaW5lTnVtYmVycy5yZWxhdGl2ZScsIFwiTGluZSBudW1iZXJzIGFyZSByZW5kZXJlZCBhcyBkaXN0YW5jZSBpbiBsaW5lcyB0byBjdXJzb3IgcG9zaXRpb24uXCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbGluZU51bWJlcnMuaW50ZXJ2YWwnLCBcIkxpbmUgbnVtYmVycyBhcmUgcmVuZGVyZWQgZXZlcnkgMTAgbGluZXMuXCIpXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6ICdvbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xpbmVOdW1iZXJzJywgXCJDb250cm9scyB0aGUgZGlzcGxheSBvZiBsaW5lIG51bWJlcnMuXCIpXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShsaW5lTnVtYmVyczogdW5rbm93bik6IEludGVybmFsRWRpdG9yUmVuZGVyTGluZU51bWJlcnNPcHRpb25zIHtcblx0XHRsZXQgcmVuZGVyVHlwZTogUmVuZGVyTGluZU51bWJlcnNUeXBlID0gdGhpcy5kZWZhdWx0VmFsdWUucmVuZGVyVHlwZTtcblx0XHRsZXQgcmVuZGVyRm46ICgobGluZU51bWJlcjogbnVtYmVyKSA9PiBzdHJpbmcpIHwgbnVsbCA9IHRoaXMuZGVmYXVsdFZhbHVlLnJlbmRlckZuO1xuXG5cdFx0aWYgKHR5cGVvZiBsaW5lTnVtYmVycyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmICh0eXBlb2YgbGluZU51bWJlcnMgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0cmVuZGVyVHlwZSA9IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5DdXN0b207XG5cdFx0XHRcdHJlbmRlckZuID0gbGluZU51bWJlcnMgYXMgKChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHN0cmluZyk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXJzID09PSAnaW50ZXJ2YWwnKSB7XG5cdFx0XHRcdHJlbmRlclR5cGUgPSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuSW50ZXJ2YWw7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXJzID09PSAncmVsYXRpdmUnKSB7XG5cdFx0XHRcdHJlbmRlclR5cGUgPSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmU7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXJzID09PSAnb24nKSB7XG5cdFx0XHRcdHJlbmRlclR5cGUgPSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZW5kZXJUeXBlID0gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVuZGVyVHlwZSxcblx0XHRcdHJlbmRlckZuXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHJlbmRlclZhbGlkYXRpb25EZWNvcmF0aW9uc1xuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyVmFsaWRhdGlvbkRlY29yYXRpb25zKG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0Y29uc3QgcmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlbmRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyk7XG5cdGlmIChyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgPT09ICdlZGl0YWJsZScpIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KTtcblx0fVxuXHRyZXR1cm4gcmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zID09PSAnb24nID8gZmFsc2UgOiB0cnVlO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZpbHRlckZvbnREZWNvcmF0aW9uc1xuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRm9udERlY29yYXRpb25zKG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0cmV0dXJuICFvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBydWxlcnNcblxuZXhwb3J0IGludGVyZmFjZSBJUnVsZXJPcHRpb24ge1xuXHRyZWFkb25seSBjb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgY29sb3I6IHN0cmluZyB8IG51bGw7XG59XG5cbmNsYXNzIEVkaXRvclJ1bGVycyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnJ1bGVycywgKG51bWJlciB8IElSdWxlck9wdGlvbilbXSwgSVJ1bGVyT3B0aW9uW10+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogSVJ1bGVyT3B0aW9uW10gPSBbXTtcblx0XHRjb25zdCBjb2x1bW5TY2hlbWE6IElKU09OU2NoZW1hID0geyB0eXBlOiAnbnVtYmVyJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVsZXJzLnNpemUnLCBcIk51bWJlciBvZiBtb25vc3BhY2UgY2hhcmFjdGVycyBhdCB3aGljaCB0aGlzIGVkaXRvciBydWxlciB3aWxsIHJlbmRlci5cIikgfTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5ydWxlcnMsICdydWxlcnMnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0Y29sdW1uU2NoZW1hLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBbXG5cdFx0XHRcdFx0XHRcdFx0J29iamVjdCdcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGNvbHVtbjogY29sdW1uU2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRcdGNvbG9yOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1bGVycy5jb2xvcicsIFwiQ29sb3Igb2YgdGhpcyBlZGl0b3IgcnVsZXIuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0Zm9ybWF0OiAnY29sb3ItaGV4J1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1bGVycycsIFwiUmVuZGVyIHZlcnRpY2FsIHJ1bGVycyBhZnRlciBhIGNlcnRhaW4gbnVtYmVyIG9mIG1vbm9zcGFjZSBjaGFyYWN0ZXJzLiBVc2UgbXVsdGlwbGUgdmFsdWVzIGZvciBtdWx0aXBsZSBydWxlcnMuIE5vIHJ1bGVycyBhcmUgZHJhd24gaWYgYXJyYXkgaXMgZW1wdHkuXCIpXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IElSdWxlck9wdGlvbltdIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpIHtcblx0XHRcdGNvbnN0IHJ1bGVyczogSVJ1bGVyT3B0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgX2VsZW1lbnQgb2YgaW5wdXQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBfZWxlbWVudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRydWxlcnMucHVzaCh7XG5cdFx0XHRcdFx0XHRjb2x1bW46IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KF9lbGVtZW50LCAwLCAwLCAxMDAwMCksXG5cdFx0XHRcdFx0XHRjb2xvcjogbnVsbFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKF9lbGVtZW50ICYmIHR5cGVvZiBfZWxlbWVudCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gX2VsZW1lbnQgYXMgSVJ1bGVyT3B0aW9uO1xuXHRcdFx0XHRcdHJ1bGVycy5wdXNoKHtcblx0XHRcdFx0XHRcdGNvbHVtbjogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoZWxlbWVudC5jb2x1bW4sIDAsIDAsIDEwMDAwKSxcblx0XHRcdFx0XHRcdGNvbG9yOiBlbGVtZW50LmNvbG9yXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJ1bGVycy5zb3J0KChhLCBiKSA9PiBhLmNvbHVtbiAtIGIuY29sdW1uKTtcblx0XHRcdHJldHVybiBydWxlcnM7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHJlYWRvbmx5XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciByZWFkb25seSBtZXNzYWdlXG4gKi9cbmNsYXNzIFJlYWRvbmx5TWVzc2FnZSBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnJlYWRPbmx5TWVzc2FnZSwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB1bmRlZmluZWQ7XG5cblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5yZWFkT25seU1lc3NhZ2UsICdyZWFkT25seU1lc3NhZ2UnLCBkZWZhdWx0c1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gX2lucHV0IGFzIElNYXJrZG93blN0cmluZztcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNjcm9sbGJhclxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIHNjcm9sbGJhcnNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgc2l6ZSBvZiBhcnJvd3MgKGlmIGRpc3BsYXllZCkuXG5cdCAqIERlZmF1bHRzIHRvIDExLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBvcHRpb24gY2Fubm90IGJlIHVwZGF0ZWQgdXNpbmcgYHVwZGF0ZU9wdGlvbnMoKWBcblx0ICovXG5cdGFycm93U2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFJlbmRlciB2ZXJ0aWNhbCBzY3JvbGxiYXIuXG5cdCAqIERlZmF1bHRzIHRvICdhdXRvJy5cblx0ICovXG5cdHZlcnRpY2FsPzogJ2F1dG8nIHwgJ3Zpc2libGUnIHwgJ2hpZGRlbic7XG5cdC8qKlxuXHQgKiBSZW5kZXIgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXG5cdCAqIERlZmF1bHRzIHRvICdhdXRvJy5cblx0ICovXG5cdGhvcml6b250YWw/OiAnYXV0bycgfCAndmlzaWJsZScgfCAnaGlkZGVuJztcblx0LyoqXG5cdCAqIENhc3QgaG9yaXpvbnRhbCBhbmQgdmVydGljYWwgc2hhZG93cyB3aGVuIHRoZSBjb250ZW50IGlzIHNjcm9sbGVkLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBvcHRpb24gY2Fubm90IGJlIHVwZGF0ZWQgdXNpbmcgYHVwZGF0ZU9wdGlvbnMoKWBcblx0ICovXG5cdHVzZVNoYWRvd3M/OiBib29sZWFuO1xuXHQvKipcblx0ICogUmVuZGVyIGFycm93cyBhdCB0aGUgdG9wIGFuZCBib3R0b20gb2YgdGhlIHZlcnRpY2FsIHNjcm9sbGJhci5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqICoqTk9URSoqOiBUaGlzIG9wdGlvbiBjYW5ub3QgYmUgdXBkYXRlZCB1c2luZyBgdXBkYXRlT3B0aW9ucygpYFxuXHQgKi9cblx0dmVydGljYWxIYXNBcnJvd3M/OiBib29sZWFuO1xuXHQvKipcblx0ICogUmVuZGVyIGFycm93cyBhdCB0aGUgbGVmdCBhbmQgcmlnaHQgb2YgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICogKipOT1RFKio6IFRoaXMgb3B0aW9uIGNhbm5vdCBiZSB1cGRhdGVkIHVzaW5nIGB1cGRhdGVPcHRpb25zKClgXG5cdCAqL1xuXHRob3Jpem9udGFsSGFzQXJyb3dzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIExpc3RlbiB0byBtb3VzZSB3aGVlbCBldmVudHMgYW5kIHJlYWN0IHRvIHRoZW0gYnkgc2Nyb2xsaW5nLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aGFuZGxlTW91c2VXaGVlbD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBbHdheXMgY29uc3VtZSBtb3VzZSB3aGVlbCBldmVudHMgKGFsd2F5cyBjYWxsIHByZXZlbnREZWZhdWx0KCkgYW5kIHN0b3BQcm9wYWdhdGlvbigpIG9uIHRoZSBicm93c2VyIGV2ZW50cykuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqICoqTk9URSoqOiBUaGlzIG9wdGlvbiBjYW5ub3QgYmUgdXBkYXRlZCB1c2luZyBgdXBkYXRlT3B0aW9ucygpYFxuXHQgKi9cblx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw/OiBib29sZWFuO1xuXHQvKipcblx0ICogSGVpZ2h0IGluIHBpeGVscyBmb3IgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyLlxuXHQgKiBEZWZhdWx0cyB0byAxMiAocHgpLlxuXHQgKi9cblx0aG9yaXpvbnRhbFNjcm9sbGJhclNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBXaWR0aCBpbiBwaXhlbHMgZm9yIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIuXG5cdCAqIERlZmF1bHRzIHRvIDE0IChweCkuXG5cdCAqL1xuXHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBXaWR0aCBpbiBwaXhlbHMgZm9yIHRoZSB2ZXJ0aWNhbCBzbGlkZXIuXG5cdCAqIERlZmF1bHRzIHRvIGB2ZXJ0aWNhbFNjcm9sbGJhclNpemVgLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBvcHRpb24gY2Fubm90IGJlIHVwZGF0ZWQgdXNpbmcgYHVwZGF0ZU9wdGlvbnMoKWBcblx0ICovXG5cdHZlcnRpY2FsU2xpZGVyU2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIEhlaWdodCBpbiBwaXhlbHMgZm9yIHRoZSBob3Jpem9udGFsIHNsaWRlci5cblx0ICogRGVmYXVsdHMgdG8gYGhvcml6b250YWxTY3JvbGxiYXJTaXplYC5cblx0ICogKipOT1RFKio6IFRoaXMgb3B0aW9uIGNhbm5vdCBiZSB1cGRhdGVkIHVzaW5nIGB1cGRhdGVPcHRpb25zKClgXG5cdCAqL1xuXHRob3Jpem9udGFsU2xpZGVyU2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFNjcm9sbCBndXR0ZXIgY2xpY2tzIG1vdmUgYnkgcGFnZSB2cyBqdW1wIHRvIHBvc2l0aW9uLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHNjcm9sbEJ5UGFnZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgd2lsbCBub3QgaW5jcmVhc2UgY29udGVudCBoZWlnaHQuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0aWdub3JlSG9yaXpvbnRhbFNjcm9sbGJhckluQ29udGVudEhlaWdodD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJuYWxFZGl0b3JTY3JvbGxiYXJPcHRpb25zIHtcblx0cmVhZG9ubHkgYXJyb3dTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5O1xuXHRyZWFkb25seSBob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5O1xuXHRyZWFkb25seSB1c2VTaGFkb3dzOiBib29sZWFuO1xuXHRyZWFkb25seSB2ZXJ0aWNhbEhhc0Fycm93czogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbEhhc0Fycm93czogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFuZGxlTW91c2VXaGVlbDogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhvcml6b250YWxTY3JvbGxiYXJTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhvcml6b250YWxTbGlkZXJTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSB2ZXJ0aWNhbFNsaWRlclNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgc2Nyb2xsQnlQYWdlOiBib29sZWFuO1xuXHRyZWFkb25seSBpZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBfc2Nyb2xsYmFyVmlzaWJpbGl0eUZyb21TdHJpbmcodmlzaWJpbGl0eTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBTY3JvbGxiYXJWaXNpYmlsaXR5KTogU2Nyb2xsYmFyVmlzaWJpbGl0eSB7XG5cdGlmICh0eXBlb2YgdmlzaWJpbGl0eSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdHN3aXRjaCAodmlzaWJpbGl0eSkge1xuXHRcdGNhc2UgJ2hpZGRlbic6IHJldHVybiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHRjYXNlICd2aXNpYmxlJzogcmV0dXJuIFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZTtcblx0XHRkZWZhdWx0OiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRvclNjcm9sbGJhciBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnNjcm9sbGJhciwgSUVkaXRvclNjcm9sbGJhck9wdGlvbnMsIEludGVybmFsRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnMgPSB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0YXJyb3dTaXplOiAxMSxcblx0XHRcdHVzZVNoYWRvd3M6IHRydWUsXG5cdFx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJTaXplOiAxMixcblx0XHRcdGhvcml6b250YWxTbGlkZXJTaXplOiAxMixcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogMTQsXG5cdFx0XHR2ZXJ0aWNhbFNsaWRlclNpemU6IDE0LFxuXHRcdFx0aGFuZGxlTW91c2VXaGVlbDogdHJ1ZSxcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0c2Nyb2xsQnlQYWdlOiBmYWxzZSxcblx0XHRcdGlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQ6IGZhbHNlLFxuXHRcdH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uc2Nyb2xsYmFyLCAnc2Nyb2xsYmFyJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3Iuc2Nyb2xsYmFyLnZlcnRpY2FsJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnYXV0bycsICd2aXNpYmxlJywgJ2hpZGRlbiddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLnZlcnRpY2FsLmF1dG8nLCBcIlRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgd2lsbCBiZSB2aXNpYmxlIG9ubHkgd2hlbiBuZWNlc3NhcnkuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY3JvbGxiYXIudmVydGljYWwudmlzaWJsZScsIFwiVGhlIHZlcnRpY2FsIHNjcm9sbGJhciB3aWxsIGFsd2F5cyBiZSB2aXNpYmxlLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLnZlcnRpY2FsLmZpdCcsIFwiVGhlIHZlcnRpY2FsIHNjcm9sbGJhciB3aWxsIGFsd2F5cyBiZSBoaWRkZW4uXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ2F1dG8nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci52ZXJ0aWNhbCcsIFwiQ29udHJvbHMgdGhlIHZpc2liaWxpdHkgb2YgdGhlIHZlcnRpY2FsIHNjcm9sbGJhci5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zY3JvbGxiYXIuaG9yaXpvbnRhbCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2F1dG8nLCAndmlzaWJsZScsICdoaWRkZW4nXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njcm9sbGJhci5ob3Jpem9udGFsLmF1dG8nLCBcIlRoZSBob3Jpem9udGFsIHNjcm9sbGJhciB3aWxsIGJlIHZpc2libGUgb25seSB3aGVuIG5lY2Vzc2FyeS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njcm9sbGJhci5ob3Jpem9udGFsLnZpc2libGUnLCBcIlRoZSBob3Jpem9udGFsIHNjcm9sbGJhciB3aWxsIGFsd2F5cyBiZSB2aXNpYmxlLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLmhvcml6b250YWwuZml0JywgXCJUaGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgd2lsbCBhbHdheXMgYmUgaGlkZGVuLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdhdXRvJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JvbGxiYXIuaG9yaXpvbnRhbCcsIFwiQ29udHJvbHMgdGhlIHZpc2liaWxpdHkgb2YgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNjcm9sbGJhci52ZXJ0aWNhbFNjcm9sbGJhclNpemUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMudmVydGljYWxTY3JvbGxiYXJTaXplLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci52ZXJ0aWNhbFNjcm9sbGJhclNpemUnLCBcIlRoZSB3aWR0aCBvZiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNjcm9sbGJhci5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JvbGxiYXIuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUnLCBcIlRoZSBoZWlnaHQgb2YgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNjcm9sbGJhci5zY3JvbGxCeVBhZ2UnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNjcm9sbEJ5UGFnZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JvbGxiYXIuc2Nyb2xsQnlQYWdlJywgXCJDb250cm9scyB3aGV0aGVyIGNsaWNrcyBzY3JvbGwgYnkgcGFnZSBvciBqdW1wIHRvIGNsaWNrIHBvc2l0aW9uLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNjcm9sbGJhci5pZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci5pZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0JywgXCJXaGVuIHNldCwgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIHdpbGwgbm90IGluY3JlYXNlIHRoZSBzaXplIG9mIHRoZSBlZGl0b3IncyBjb250ZW50LlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvclNjcm9sbGJhck9wdGlvbnM+O1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxiYXJTaXplID0gRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUsIHRoaXMuZGVmYXVsdFZhbHVlLmhvcml6b250YWxTY3JvbGxiYXJTaXplLCAwLCAxMDAwKTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhclNpemUgPSBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC52ZXJ0aWNhbFNjcm9sbGJhclNpemUsIHRoaXMuZGVmYXVsdFZhbHVlLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSwgMCwgMTAwMCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFycm93U2l6ZTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuYXJyb3dTaXplLCB0aGlzLmRlZmF1bHRWYWx1ZS5hcnJvd1NpemUsIDAsIDEwMDApLFxuXHRcdFx0dmVydGljYWw6IF9zY3JvbGxiYXJWaXNpYmlsaXR5RnJvbVN0cmluZyhpbnB1dC52ZXJ0aWNhbCwgdGhpcy5kZWZhdWx0VmFsdWUudmVydGljYWwpLFxuXHRcdFx0aG9yaXpvbnRhbDogX3Njcm9sbGJhclZpc2liaWxpdHlGcm9tU3RyaW5nKGlucHV0Lmhvcml6b250YWwsIHRoaXMuZGVmYXVsdFZhbHVlLmhvcml6b250YWwpLFxuXHRcdFx0dXNlU2hhZG93czogYm9vbGVhbihpbnB1dC51c2VTaGFkb3dzLCB0aGlzLmRlZmF1bHRWYWx1ZS51c2VTaGFkb3dzKSxcblx0XHRcdHZlcnRpY2FsSGFzQXJyb3dzOiBib29sZWFuKGlucHV0LnZlcnRpY2FsSGFzQXJyb3dzLCB0aGlzLmRlZmF1bHRWYWx1ZS52ZXJ0aWNhbEhhc0Fycm93cyksXG5cdFx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiBib29sZWFuKGlucHV0Lmhvcml6b250YWxIYXNBcnJvd3MsIHRoaXMuZGVmYXVsdFZhbHVlLmhvcml6b250YWxIYXNBcnJvd3MpLFxuXHRcdFx0aGFuZGxlTW91c2VXaGVlbDogYm9vbGVhbihpbnB1dC5oYW5kbGVNb3VzZVdoZWVsLCB0aGlzLmRlZmF1bHRWYWx1ZS5oYW5kbGVNb3VzZVdoZWVsKSxcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBib29sZWFuKGlucHV0LmFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbHdheXNDb25zdW1lTW91c2VXaGVlbCksXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogaG9yaXpvbnRhbFNjcm9sbGJhclNpemUsXG5cdFx0XHRob3Jpem9udGFsU2xpZGVyU2l6ZTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuaG9yaXpvbnRhbFNsaWRlclNpemUsIGhvcml6b250YWxTY3JvbGxiYXJTaXplLCAwLCAxMDAwKSxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogdmVydGljYWxTY3JvbGxiYXJTaXplLFxuXHRcdFx0dmVydGljYWxTbGlkZXJTaXplOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC52ZXJ0aWNhbFNsaWRlclNpemUsIHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSwgMCwgMTAwMCksXG5cdFx0XHRzY3JvbGxCeVBhZ2U6IGJvb2xlYW4oaW5wdXQuc2Nyb2xsQnlQYWdlLCB0aGlzLmRlZmF1bHRWYWx1ZS5zY3JvbGxCeVBhZ2UpLFxuXHRcdFx0aWdub3JlSG9yaXpvbnRhbFNjcm9sbGJhckluQ29udGVudEhlaWdodDogYm9vbGVhbihpbnB1dC5pZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0LCB0aGlzLmRlZmF1bHRWYWx1ZS5pZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0KSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVW5pY29kZUhpZ2hsaWdodFxuXG5leHBvcnQgdHlwZSBJblVudHJ1c3RlZFdvcmtzcGFjZSA9ICdpblVudHJ1c3RlZFdvcmtzcGFjZSc7XG5cbi8qKlxuICogQGludGVybmFsXG4qL1xuZXhwb3J0IGNvbnN0IGluVW50cnVzdGVkV29ya3NwYWNlOiBJblVudHJ1c3RlZFdvcmtzcGFjZSA9ICdpblVudHJ1c3RlZFdvcmtzcGFjZSc7XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciB1bmljb2RlIGhpZ2hsaWdodGluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGFsbCBub24tYmFzaWMgQVNDSUkgY2hhcmFjdGVycyBhcmUgaGlnaGxpZ2h0ZWQuIE9ubHkgY2hhcmFjdGVycyBiZXR3ZWVuIFUrMDAyMCBhbmQgVSswMDdFLCB0YWIsIGxpbmUtZmVlZCBhbmQgY2FycmlhZ2UtcmV0dXJuIGFyZSBjb25zaWRlcmVkIGJhc2ljIEFTQ0lJLlxuXHQgKi9cblx0bm9uQmFzaWNBU0NJST86IGJvb2xlYW4gfCBJblVudHJ1c3RlZFdvcmtzcGFjZTtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBjaGFyYWN0ZXJzIHRoYXQganVzdCByZXNlcnZlIHNwYWNlIG9yIGhhdmUgbm8gd2lkdGggYXQgYWxsIGFyZSBoaWdobGlnaHRlZC5cblx0ICovXG5cdGludmlzaWJsZUNoYXJhY3RlcnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgYXJlIGhpZ2hsaWdodGVkIHRoYXQgY2FuIGJlIGNvbmZ1c2VkIHdpdGggYmFzaWMgQVNDSUkgY2hhcmFjdGVycywgZXhjZXB0IHRob3NlIHRoYXQgYXJlIGNvbW1vbiBpbiB0aGUgY3VycmVudCB1c2VyIGxvY2FsZS5cblx0ICovXG5cdGFtYmlndW91c0NoYXJhY3RlcnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgaW4gY29tbWVudHMgc2hvdWxkIGFsc28gYmUgc3ViamVjdCB0byB1bmljb2RlIGhpZ2hsaWdodGluZy5cblx0ICovXG5cdGluY2x1ZGVDb21tZW50cz86IGJvb2xlYW4gfCBJblVudHJ1c3RlZFdvcmtzcGFjZTtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBjaGFyYWN0ZXJzIGluIHN0cmluZ3Mgc2hvdWxkIGFsc28gYmUgc3ViamVjdCB0byB1bmljb2RlIGhpZ2hsaWdodGluZy5cblx0ICovXG5cdGluY2x1ZGVTdHJpbmdzPzogYm9vbGVhbiB8IEluVW50cnVzdGVkV29ya3NwYWNlO1xuXG5cdC8qKlxuXHQgKiBEZWZpbmVzIGFsbG93ZWQgY2hhcmFjdGVycyB0aGF0IGFyZSBub3QgYmVpbmcgaGlnaGxpZ2h0ZWQuXG5cdCAqL1xuXHRhbGxvd2VkQ2hhcmFjdGVycz86IFJlY29yZDxzdHJpbmcsIHRydWU+O1xuXG5cdC8qKlxuXHQgKiBVbmljb2RlIGNoYXJhY3RlcnMgdGhhdCBhcmUgY29tbW9uIGluIGFsbG93ZWQgbG9jYWxlcyBhcmUgbm90IGJlaW5nIGhpZ2hsaWdodGVkLlxuXHQgKi9cblx0YWxsb3dlZExvY2FsZXM/OiBSZWNvcmQ8c3RyaW5nIHwgJ19vcycgfCAnX3ZzY29kZScsIHRydWU+O1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zID0gUmVxdWlyZWQ8UmVhZG9ubHk8SVVuaWNvZGVIaWdobGlnaHRPcHRpb25zPj47XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjb25zdCB1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cyA9IHtcblx0YWxsb3dlZENoYXJhY3RlcnM6ICdlZGl0b3IudW5pY29kZUhpZ2hsaWdodC5hbGxvd2VkQ2hhcmFjdGVycycsXG5cdGludmlzaWJsZUNoYXJhY3RlcnM6ICdlZGl0b3IudW5pY29kZUhpZ2hsaWdodC5pbnZpc2libGVDaGFyYWN0ZXJzJyxcblx0bm9uQmFzaWNBU0NJSTogJ2VkaXRvci51bmljb2RlSGlnaGxpZ2h0Lm5vbkJhc2ljQVNDSUknLFxuXHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiAnZWRpdG9yLnVuaWNvZGVIaWdobGlnaHQuYW1iaWd1b3VzQ2hhcmFjdGVycycsXG5cdGluY2x1ZGVDb21tZW50czogJ2VkaXRvci51bmljb2RlSGlnaGxpZ2h0LmluY2x1ZGVDb21tZW50cycsXG5cdGluY2x1ZGVTdHJpbmdzOiAnZWRpdG9yLnVuaWNvZGVIaWdobGlnaHQuaW5jbHVkZVN0cmluZ3MnLFxuXHRhbGxvd2VkTG9jYWxlczogJ2VkaXRvci51bmljb2RlSGlnaGxpZ2h0LmFsbG93ZWRMb2NhbGVzJyxcbn07XG5cbmNsYXNzIFVuaWNvZGVIaWdobGlnaHQgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi51bmljb2RlSGlnaGxpZ2h0aW5nLCBJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnMsIEludGVybmFsVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsVW5pY29kZUhpZ2hsaWdodE9wdGlvbnMgPSB7XG5cdFx0XHRub25CYXNpY0FTQ0lJOiBpblVudHJ1c3RlZFdvcmtzcGFjZSxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0aW5jbHVkZUNvbW1lbnRzOiBpblVudHJ1c3RlZFdvcmtzcGFjZSxcblx0XHRcdGluY2x1ZGVTdHJpbmdzOiB0cnVlLFxuXHRcdFx0YWxsb3dlZENoYXJhY3RlcnM6IHt9LFxuXHRcdFx0YWxsb3dlZExvY2FsZXM6IHsgX29zOiB0cnVlLCBfdnNjb2RlOiB0cnVlIH0sXG5cdFx0fTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnVuaWNvZGVIaWdobGlnaHRpbmcsICd1bmljb2RlSGlnaGxpZ2h0JywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5ub25CYXNpY0FTQ0lJXToge1xuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2VdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLm5vbkJhc2ljQVNDSUksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5ub25CYXNpY0FTQ0lJJywgXCJDb250cm9scyB3aGV0aGVyIGFsbCBub24tYmFzaWMgQVNDSUkgY2hhcmFjdGVycyBhcmUgaGlnaGxpZ2h0ZWQuIE9ubHkgY2hhcmFjdGVycyBiZXR3ZWVuIFUrMDAyMCBhbmQgVSswMDdFLCB0YWIsIGxpbmUtZmVlZCBhbmQgY2FycmlhZ2UtcmV0dXJuIGFyZSBjb25zaWRlcmVkIGJhc2ljIEFTQ0lJLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbdW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuaW52aXNpYmxlQ2hhcmFjdGVyc106IHtcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pbnZpc2libGVDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuaW52aXNpYmxlQ2hhcmFjdGVycycsIFwiQ29udHJvbHMgd2hldGhlciBjaGFyYWN0ZXJzIHRoYXQganVzdCByZXNlcnZlIHNwYWNlIG9yIGhhdmUgbm8gd2lkdGggYXQgYWxsIGFyZSBoaWdobGlnaHRlZC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0W3VuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFtYmlndW91c0NoYXJhY3RlcnNdOiB7XG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYW1iaWd1b3VzQ2hhcmFjdGVycyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmFtYmlndW91c0NoYXJhY3RlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2hhcmFjdGVycyBhcmUgaGlnaGxpZ2h0ZWQgdGhhdCBjYW4gYmUgY29uZnVzZWQgd2l0aCBiYXNpYyBBU0NJSSBjaGFyYWN0ZXJzLCBleGNlcHQgdGhvc2UgdGhhdCBhcmUgY29tbW9uIGluIHRoZSBjdXJyZW50IHVzZXIgbG9jYWxlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbdW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuaW5jbHVkZUNvbW1lbnRzXToge1xuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2VdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmluY2x1ZGVDb21tZW50cyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmluY2x1ZGVDb21tZW50cycsIFwiQ29udHJvbHMgd2hldGhlciBjaGFyYWN0ZXJzIGluIGNvbW1lbnRzIHNob3VsZCBhbHNvIGJlIHN1YmplY3QgdG8gVW5pY29kZSBoaWdobGlnaHRpbmcuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbmNsdWRlU3RyaW5nc106IHtcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2UsIGluVW50cnVzdGVkV29ya3NwYWNlXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pbmNsdWRlU3RyaW5ncyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmluY2x1ZGVTdHJpbmdzJywgXCJDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgaW4gc3RyaW5ncyBzaG91bGQgYWxzbyBiZSBzdWJqZWN0IHRvIFVuaWNvZGUgaGlnaGxpZ2h0aW5nLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbdW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuYWxsb3dlZENoYXJhY3RlcnNdOiB7XG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hbGxvd2VkQ2hhcmFjdGVycyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmFsbG93ZWRDaGFyYWN0ZXJzJywgXCJEZWZpbmVzIGFsbG93ZWQgY2hhcmFjdGVycyB0aGF0IGFyZSBub3QgYmVpbmcgaGlnaGxpZ2h0ZWQuXCIpLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5hbGxvd2VkTG9jYWxlc106IHtcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFsbG93ZWRMb2NhbGVzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuYWxsb3dlZExvY2FsZXMnLCBcIlVuaWNvZGUgY2hhcmFjdGVycyB0aGF0IGFyZSBjb21tb24gaW4gYWxsb3dlZCBsb2NhbGVzIGFyZSBub3QgYmVpbmcgaGlnaGxpZ2h0ZWQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhcHBseVVwZGF0ZSh2YWx1ZTogUmVxdWlyZWQ8UmVhZG9ubHk8SVVuaWNvZGVIaWdobGlnaHRPcHRpb25zPj4gfCB1bmRlZmluZWQsIHVwZGF0ZTogUmVxdWlyZWQ8UmVhZG9ubHk8SVVuaWNvZGVIaWdobGlnaHRPcHRpb25zPj4pOiBBcHBseVVwZGF0ZVJlc3VsdDxSZXF1aXJlZDxSZWFkb25seTxJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM+Pj4ge1xuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHRpZiAodXBkYXRlLmFsbG93ZWRDaGFyYWN0ZXJzICYmIHZhbHVlKSB7XG5cdFx0XHQvLyBUcmVhdCBhbGxvd2VkQ2hhcmFjdGVycyBhdG9taWNhbGx5XG5cdFx0XHRpZiAoIW9iamVjdHMuZXF1YWxzKHZhbHVlLmFsbG93ZWRDaGFyYWN0ZXJzLCB1cGRhdGUuYWxsb3dlZENoYXJhY3RlcnMpKSB7XG5cdFx0XHRcdHZhbHVlID0geyAuLi52YWx1ZSwgYWxsb3dlZENoYXJhY3RlcnM6IHVwZGF0ZS5hbGxvd2VkQ2hhcmFjdGVycyB9O1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodXBkYXRlLmFsbG93ZWRMb2NhbGVzICYmIHZhbHVlKSB7XG5cdFx0XHQvLyBUcmVhdCBhbGxvd2VkTG9jYWxlcyBhdG9taWNhbGx5XG5cdFx0XHRpZiAoIW9iamVjdHMuZXF1YWxzKHZhbHVlLmFsbG93ZWRMb2NhbGVzLCB1cGRhdGUuYWxsb3dlZExvY2FsZXMpKSB7XG5cdFx0XHRcdHZhbHVlID0geyAuLi52YWx1ZSwgYWxsb3dlZExvY2FsZXM6IHVwZGF0ZS5hbGxvd2VkTG9jYWxlcyB9O1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHN1cGVyLmFwcGx5VXBkYXRlKHZhbHVlLCB1cGRhdGUpO1xuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdHJldHVybiBuZXcgQXBwbHlVcGRhdGVSZXN1bHQocmVzdWx0Lm5ld1ZhbHVlLCB0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vbkJhc2ljQVNDSUk6IHByaW1pdGl2ZVNldDxib29sZWFuIHwgSW5VbnRydXN0ZWRXb3Jrc3BhY2U+KGlucHV0Lm5vbkJhc2ljQVNDSUksIGluVW50cnVzdGVkV29ya3NwYWNlLCBbdHJ1ZSwgZmFsc2UsIGluVW50cnVzdGVkV29ya3NwYWNlXSksXG5cdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJzOiBib29sZWFuKGlucHV0LmludmlzaWJsZUNoYXJhY3RlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLmludmlzaWJsZUNoYXJhY3RlcnMpLFxuXHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyczogYm9vbGVhbihpbnB1dC5hbWJpZ3VvdXNDaGFyYWN0ZXJzLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbWJpZ3VvdXNDaGFyYWN0ZXJzKSxcblx0XHRcdGluY2x1ZGVDb21tZW50czogcHJpbWl0aXZlU2V0PGJvb2xlYW4gfCBJblVudHJ1c3RlZFdvcmtzcGFjZT4oaW5wdXQuaW5jbHVkZUNvbW1lbnRzLCBpblVudHJ1c3RlZFdvcmtzcGFjZSwgW3RydWUsIGZhbHNlLCBpblVudHJ1c3RlZFdvcmtzcGFjZV0pLFxuXHRcdFx0aW5jbHVkZVN0cmluZ3M6IHByaW1pdGl2ZVNldDxib29sZWFuIHwgSW5VbnRydXN0ZWRXb3Jrc3BhY2U+KGlucHV0LmluY2x1ZGVTdHJpbmdzLCBpblVudHJ1c3RlZFdvcmtzcGFjZSwgW3RydWUsIGZhbHNlLCBpblVudHJ1c3RlZFdvcmtzcGFjZV0pLFxuXHRcdFx0YWxsb3dlZENoYXJhY3RlcnM6IHRoaXMudmFsaWRhdGVCb29sZWFuTWFwKGlucHV0LmFsbG93ZWRDaGFyYWN0ZXJzLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbGxvd2VkQ2hhcmFjdGVycyksXG5cdFx0XHRhbGxvd2VkTG9jYWxlczogdGhpcy52YWxpZGF0ZUJvb2xlYW5NYXAoaW5wdXQuYWxsb3dlZExvY2FsZXMsIHRoaXMuZGVmYXVsdFZhbHVlLmFsbG93ZWRMb2NhbGVzKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUJvb2xlYW5NYXAobWFwOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHRydWU+KTogUmVjb3JkPHN0cmluZywgdHJ1ZT4ge1xuXHRcdGlmICgodHlwZW9mIG1hcCAhPT0gJ29iamVjdCcpIHx8ICFtYXApIHtcblx0XHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdHJ1ZT4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhtYXApKSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0cmVzdWx0W2tleV0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gaW5saW5lU3VnZ2VzdFxuXG5leHBvcnQgaW50ZXJmYWNlIElJbmxpbmVTdWdnZXN0T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgb3IgZGlzYWJsZSB0aGUgcmVuZGVyaW5nIG9mIGF1dG9tYXRpYyBpbmxpbmUgY29tcGxldGlvbnMuXG5cdCovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb25maWd1cmVzIHRoZSBtb2RlLlxuXHQgKiBVc2UgYHByZWZpeGAgdG8gb25seSBzaG93IGdob3N0IHRleHQgaWYgdGhlIHRleHQgdG8gcmVwbGFjZSBpcyBhIHByZWZpeCBvZiB0aGUgc3VnZ2VzdGlvbiB0ZXh0LlxuXHQgKiBVc2UgYHN1YndvcmRgIHRvIG9ubHkgc2hvdyBnaG9zdCB0ZXh0IGlmIHRoZSByZXBsYWNlIHRleHQgaXMgYSBzdWJ3b3JkIG9mIHRoZSBzdWdnZXN0aW9uIHRleHQuXG5cdCAqIFVzZSBgc3Vid29yZFNtYXJ0YCB0byBvbmx5IHNob3cgZ2hvc3QgdGV4dCBpZiB0aGUgcmVwbGFjZSB0ZXh0IGlzIGEgc3Vid29yZCBvZiB0aGUgc3VnZ2VzdGlvbiB0ZXh0LCBidXQgdGhlIHN1YndvcmQgbXVzdCBzdGFydCBhZnRlciB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuXHQgKiBEZWZhdWx0cyB0byBgcHJlZml4YC5cblx0Ki9cblx0bW9kZT86ICdwcmVmaXgnIHwgJ3N1YndvcmQnIHwgJ3N1YndvcmRTbWFydCc7XG5cblx0c2hvd1Rvb2xiYXI/OiAnYWx3YXlzJyB8ICdvbkhvdmVyJyB8ICduZXZlcic7XG5cblx0c3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZD86IGJvb2xlYW47XG5cblx0c3VwcHJlc3NTdWdnZXN0aW9ucz86IGJvb2xlYW47XG5cblx0bWluU2hvd0RlbGF5PzogbnVtYmVyO1xuXHRzdXBwcmVzc0luU25pcHBldE1vZGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogRG9lcyBub3QgY2xlYXIgYWN0aXZlIGlubGluZSBzdWdnZXN0aW9ucyB3aGVuIHRoZSBlZGl0b3IgbG9zZXMgZm9jdXMuXG5cdCAqL1xuXHRrZWVwT25CbHVyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRm9udCBmYW1pbHkgZm9yIGlubGluZSBzdWdnZXN0aW9ucy5cblx0ICovXG5cdGZvbnRGYW1pbHk/OiBzdHJpbmcgfCAnZGVmYXVsdCc7XG5cblx0ZWRpdHM/OiB7XG5cdFx0YWxsb3dDb2RlU2hpZnRpbmc/OiAnYWx3YXlzJyB8ICdob3Jpem9udGFsJyB8ICduZXZlcic7XG5cblx0XHRyZW5kZXJTaWRlQnlTaWRlPzogJ25ldmVyJyB8ICdhdXRvJztcblxuXHRcdHNob3dDb2xsYXBzZWQ/OiBib29sZWFuO1xuXG5cdFx0c2hvd0xvbmdEaXN0YW5jZUhpbnQ/OiBib29sZWFuO1xuXG5cdFx0LyoqXG5cdFx0ICogQ29udHJvbHMgaG93IG1hbnkgbGluZXMgb2Ygc3Vycm91bmRpbmcgY29udGV4dCBhcmUgc2hvd24gYWJvdmUgYW5kIGJlbG93IHRoZSB0YXJnZXQgbGluZVxuXHRcdCAqIGluIHRoZSBsb25nIGRpc3RhbmNlIGlubGluZSBzdWdnZXN0aW9uIGhpbnQgcHJldmlldy4gYDBgIHNob3dzIG9ubHkgdGhlIHRhcmdldCBsaW5lLlxuXHRcdCAqL1xuXHRcdGxvbmdEaXN0YW5jZUhpbnRDb250ZXh0TGluZUNvdW50PzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBAaW50ZXJuYWxcblx0XHQqL1xuXHRcdGVuYWJsZWQ/OiBib29sZWFuO1xuXHR9O1xuXG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqL1xuXHR0cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqL1xuXHRleHBlcmltZW50YWw/OiB7XG5cdFx0LyoqXG5cdFx0KiBAaW50ZXJuYWxcblx0XHQqL1xuXHRcdHN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnM/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIEBpbnRlcm5hbFxuXHRcdCovXG5cdFx0ZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uPzogYm9vbGVhbjtcblxuXHRcdHNob3dPblN1Z2dlc3RDb25mbGljdD86ICdhbHdheXMnIHwgJ25ldmVyJyB8ICd3aGVuU3VnZ2VzdExpc3RJc0luY29tcGxldGUnO1xuXHR9O1xufVxuXG50eXBlIFJlcXVpcmVkUmVjdXJzaXZlPFQ+ID0ge1xuXHRbUCBpbiBrZXlvZiBUXS0/OiBUW1BdIGV4dGVuZHMgb2JqZWN0IHwgdW5kZWZpbmVkID8gUmVxdWlyZWRSZWN1cnNpdmU8VFtQXT4gOiBUW1BdO1xufTtcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxJbmxpbmVTdWdnZXN0T3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkUmVjdXJzaXZlPElJbmxpbmVTdWdnZXN0T3B0aW9ucz4+O1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgaW5saW5lIHN1Z2dlc3Rpb25zXG4gKi9cbmNsYXNzIElubGluZUVkaXRvclN1Z2dlc3QgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0LCBJSW5saW5lU3VnZ2VzdE9wdGlvbnMsIEludGVybmFsSW5saW5lU3VnZ2VzdE9wdGlvbnM+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsSW5saW5lU3VnZ2VzdE9wdGlvbnMgPSB7XG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0bW9kZTogJ3N1YndvcmRTbWFydCcsXG5cdFx0XHRzaG93VG9vbGJhcjogJ29uSG92ZXInLFxuXHRcdFx0c3VwcHJlc3NTdWdnZXN0aW9uczogZmFsc2UsXG5cdFx0XHRrZWVwT25CbHVyOiBmYWxzZSxcblx0XHRcdGZvbnRGYW1pbHk6ICdkZWZhdWx0Jyxcblx0XHRcdHN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQ6IHRydWUsXG5cdFx0XHRtaW5TaG93RGVsYXk6IDAsXG5cdFx0XHRzdXBwcmVzc0luU25pcHBldE1vZGU6IHRydWUsXG5cdFx0XHRlZGl0czoge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzaG93Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0cmVuZGVyU2lkZUJ5U2lkZTogJ2F1dG8nLFxuXHRcdFx0XHRhbGxvd0NvZGVTaGlmdGluZzogJ2Fsd2F5cycsXG5cdFx0XHRcdHNob3dMb25nRGlzdGFuY2VIaW50OiB0cnVlLFxuXHRcdFx0XHRsb25nRGlzdGFuY2VIaW50Q29udGV4dExpbmVDb3VudDogMCxcblx0XHRcdH0sXG5cdFx0XHR0cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2U6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudGFsOiB7XG5cdFx0XHRcdHN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnM6ICcnLFxuXHRcdFx0XHRzaG93T25TdWdnZXN0Q29uZmxpY3Q6ICduZXZlcicsXG5cdFx0XHRcdGVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QsICdpbmxpbmVTdWdnZXN0JywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBhdXRvbWF0aWNhbGx5IHNob3cgaW5saW5lIHN1Z2dlc3Rpb25zIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5zaG93VG9vbGJhcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93VG9vbGJhcixcblx0XHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdvbkhvdmVyJywgJ25ldmVyJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnNob3dUb29sYmFyLmFsd2F5cycsIFwiU2hvdyB0aGUgaW5saW5lIHN1Z2dlc3Rpb24gdG9vbGJhciB3aGVuZXZlciBhbiBpbmxpbmUgc3VnZ2VzdGlvbiBpcyBzaG93bi5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXIub25Ib3ZlcicsIFwiU2hvdyB0aGUgaW5saW5lIHN1Z2dlc3Rpb24gdG9vbGJhciB3aGVuIGhvdmVyaW5nIG92ZXIgYW4gaW5saW5lIHN1Z2dlc3Rpb24uXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnNob3dUb29sYmFyLm5ldmVyJywgXCJOZXZlciBzaG93IHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiB0b29sYmFyLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXInLCBcIkNvbnRyb2xzIHdoZW4gdG8gc2hvdyB0aGUgaW5saW5lIHN1Z2dlc3Rpb24gdG9vbGJhci5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IHN5bnRheCBoaWdobGlnaHRpbmcgZm9yIGlubGluZSBzdWdnZXN0aW9ucyBpbiB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LnN1cHByZXNzU3VnZ2VzdGlvbnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnN1cHByZXNzU3VnZ2VzdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zdXBwcmVzc1N1Z2dlc3Rpb25zJywgXCJDb250cm9scyBob3cgaW5saW5lIHN1Z2dlc3Rpb25zIGludGVyYWN0IHdpdGggdGhlIHN1Z2dlc3Qgd2lkZ2V0LiBJZiBlbmFibGVkLCB0aGUgc3VnZ2VzdCB3aWRnZXQgaXMgbm90IHNob3duIGF1dG9tYXRpY2FsbHkgd2hlbiBpbmxpbmUgc3VnZ2VzdGlvbnMgYXJlIGF2YWlsYWJsZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LnN1cHByZXNzSW5TbmlwcGV0TW9kZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc3VwcHJlc3NJblNuaXBwZXRNb2RlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc3VwcHJlc3NJblNuaXBwZXRNb2RlJywgXCJDb250cm9scyB3aGV0aGVyIGlubGluZSBzdWdnZXN0aW9ucyBhcmUgc3VwcHJlc3NlZCB3aGVuIGluIHNuaXBwZXQgbW9kZS5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5taW5TaG93RGVsYXknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdG1heGltdW06IDEwMDAwLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QubWluU2hvd0RlbGF5JywgXCJDb250cm9scyB0aGUgbWluaW1hbCBkZWxheSBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggaW5saW5lIHN1Z2dlc3Rpb25zIGFyZSBzaG93biBhZnRlciB0eXBpbmcuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZXhwZXJpbWVudGFsLnN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZXhwZXJpbWVudGFsLnN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnMsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnMnLCBcIlN1cHByZXNzZXMgaW5saW5lIGNvbXBsZXRpb25zIGZvciBzcGVjaWZpZWQgZXh0ZW5zaW9uIElEcyAtLSBjb21tYSBzZXBhcmF0ZWQuXCIpLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmV4cGVyaW1lbnRhbC5lbXB0eVJlc3BvbnNlSW5mb3JtYXRpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmV4cGVyaW1lbnRhbC5lbXB0eVJlc3BvbnNlSW5mb3JtYXRpb24sXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0byBzZW5kIHJlcXVlc3QgaW5mb3JtYXRpb24gZnJvbSB0aGUgaW5saW5lIHN1Z2dlc3Rpb24gcHJvdmlkZXIuXCIpLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LnRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMudHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlLFxuXHRcdFx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC50cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gdHJpZ2dlciBhIGNvbW1hbmQgd2hlbiB0aGUgaW5saW5lIHN1Z2dlc3Rpb24gcHJvdmlkZXIgY2hhbmdlcy5cIiksXG5cdFx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZXhwZXJpbWVudGFsLnNob3dPblN1Z2dlc3RDb25mbGljdCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5leHBlcmltZW50YWwuc2hvd09uU3VnZ2VzdENvbmZsaWN0LFxuXHRcdFx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRcdFx0ZW51bTogWydhbHdheXMnLCAnbmV2ZXInLCAnd2hlblN1Z2dlc3RMaXN0SXNJbmNvbXBsZXRlJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zaG93T25TdWdnZXN0Q29uZmxpY3QnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBpbmxpbmUgc3VnZ2VzdGlvbnMgd2hlbiB0aGVyZSBpcyBhIHN1Z2dlc3QgY29uZmxpY3QuXCIpLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmZvbnRGYW1pbHknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZm9udEZhbWlseSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIHRoZSBmb250IGZhbWlseSBvZiB0aGUgaW5saW5lIHN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZWRpdHMuYWxsb3dDb2RlU2hpZnRpbmcnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZWRpdHMuYWxsb3dDb2RlU2hpZnRpbmcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5lZGl0cy5hbGxvd0NvZGVTaGlmdGluZycsIFwiQ29udHJvbHMgd2hldGhlciBzaG93aW5nIGEgc3VnZ2VzdGlvbiB3aWxsIHNoaWZ0IHRoZSBjb2RlIHRvIG1ha2Ugc3BhY2UgZm9yIHRoZSBzdWdnZXN0aW9uIGlubGluZS5cIiksXG5cdFx0XHRcdFx0ZW51bTogWydhbHdheXMnLCAnaG9yaXpvbnRhbCcsICduZXZlciddLFxuXHRcdFx0XHRcdHRhZ3M6IFsnbmV4dEVkaXRTdWdnZXN0aW9ucyddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5zaG93TG9uZ0Rpc3RhbmNlSGludCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZWRpdHMuc2hvd0xvbmdEaXN0YW5jZUhpbnQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5lZGl0cy5zaG93TG9uZ0Rpc3RhbmNlSGludCcsIFwiQ29udHJvbHMgd2hldGhlciBsb25nIGRpc3RhbmNlIGlubGluZSBzdWdnZXN0aW9ucyBhcmUgc2hvd24uXCIpLFxuXHRcdFx0XHRcdHRhZ3M6IFsnbmV4dEVkaXRTdWdnZXN0aW9ucycsICdleHBlcmltZW50YWwnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZWRpdHMubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZWRpdHMubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQsXG5cdFx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0XHRtYXhpbXVtOiAxMCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmVkaXRzLmxvbmdEaXN0YW5jZUhpbnRDb250ZXh0TGluZUNvdW50JywgXCJDb250cm9scyBob3cgbWFueSBsaW5lcyBvZiBzdXJyb3VuZGluZyBjb250ZXh0IGFyZSBzaG93biBhYm92ZSBhbmQgYmVsb3cgdGhlIHRhcmdldCBsaW5lIGluIHRoZSBsb25nIGRpc3RhbmNlIGlubGluZSBzdWdnZXN0aW9uIHByZXZpZXcuIFNldCB0byAwIHRvIG9ubHkgc2hvdyB0aGUgdGFyZ2V0IGxpbmUuXCIpLFxuXHRcdFx0XHRcdHRhZ3M6IFsnbmV4dEVkaXRTdWdnZXN0aW9ucycsICdleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5yZW5kZXJTaWRlQnlTaWRlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVkaXRzLnJlbmRlclNpZGVCeVNpZGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5lZGl0cy5yZW5kZXJTaWRlQnlTaWRlJywgXCJDb250cm9scyB3aGV0aGVyIGxhcmdlciBzdWdnZXN0aW9ucyBjYW4gYmUgc2hvd24gc2lkZSBieSBzaWRlLlwiKSxcblx0XHRcdFx0XHRlbnVtOiBbJ2F1dG8nLCAnbmV2ZXInXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5pbmxpbmVTdWdnZXN0LmVkaXRzLnJlbmRlclNpZGVCeVNpZGUuYXV0bycsIFwiTGFyZ2VyIHN1Z2dlc3Rpb25zIHdpbGwgc2hvdyBzaWRlIGJ5IHNpZGUgaWYgdGhlcmUgaXMgZW5vdWdoIHNwYWNlLCBvdGhlcndpc2UgdGhleSB3aWxsIGJlIHNob3duIGJlbG93LlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGluZVN1Z2dlc3QuZWRpdHMucmVuZGVyU2lkZUJ5U2lkZS5uZXZlcicsIFwiTGFyZ2VyIHN1Z2dlc3Rpb25zIGFyZSBuZXZlciBzaG93biBzaWRlIGJ5IHNpZGUgYW5kIHdpbGwgYWx3YXlzIGJlIHNob3duIGJlbG93LlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdHRhZ3M6IFsnbmV4dEVkaXRTdWdnZXN0aW9ucyddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5zaG93Q29sbGFwc2VkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lZGl0cy5zaG93Q29sbGFwc2VkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QuZWRpdHMuc2hvd0NvbGxhcHNlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc3VnZ2VzdGlvbiB3aWxsIHNob3cgYXMgY29sbGFwc2VkIHVudGlsIGp1bXBpbmcgdG8gaXQuXCIpLFxuXHRcdFx0XHRcdHRhZ3M6IFsnbmV4dEVkaXRTdWdnZXN0aW9ucyddXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElJbmxpbmVTdWdnZXN0T3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRtb2RlOiBzdHJpbmdTZXQoaW5wdXQubW9kZSwgdGhpcy5kZWZhdWx0VmFsdWUubW9kZSwgWydwcmVmaXgnLCAnc3Vid29yZCcsICdzdWJ3b3JkU21hcnQnXSksXG5cdFx0XHRzaG93VG9vbGJhcjogc3RyaW5nU2V0KGlucHV0LnNob3dUb29sYmFyLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93VG9vbGJhciwgWydhbHdheXMnLCAnb25Ib3ZlcicsICduZXZlciddKSxcblx0XHRcdHN1cHByZXNzU3VnZ2VzdGlvbnM6IGJvb2xlYW4oaW5wdXQuc3VwcHJlc3NTdWdnZXN0aW9ucywgdGhpcy5kZWZhdWx0VmFsdWUuc3VwcHJlc3NTdWdnZXN0aW9ucyksXG5cdFx0XHRrZWVwT25CbHVyOiBib29sZWFuKGlucHV0LmtlZXBPbkJsdXIsIHRoaXMuZGVmYXVsdFZhbHVlLmtlZXBPbkJsdXIpLFxuXHRcdFx0Zm9udEZhbWlseTogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5mb250RmFtaWx5LCB0aGlzLmRlZmF1bHRWYWx1ZS5mb250RmFtaWx5KSxcblx0XHRcdHN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuc3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuc3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCksXG5cdFx0XHRtaW5TaG93RGVsYXk6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0Lm1pblNob3dEZWxheSwgMCwgMCwgMTAwMDApLFxuXHRcdFx0c3VwcHJlc3NJblNuaXBwZXRNb2RlOiBib29sZWFuKGlucHV0LnN1cHByZXNzSW5TbmlwcGV0TW9kZSwgdGhpcy5kZWZhdWx0VmFsdWUuc3VwcHJlc3NJblNuaXBwZXRNb2RlKSxcblx0XHRcdGVkaXRzOiB0aGlzLl92YWxpZGF0ZUVkaXRzKGlucHV0LmVkaXRzKSxcblx0XHRcdHRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZTogYm9vbGVhbihpbnB1dC50cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UsIHRoaXMuZGVmYXVsdFZhbHVlLnRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZSksXG5cdFx0XHRleHBlcmltZW50YWw6IHRoaXMuX3ZhbGlkYXRlRXhwZXJpbWVudGFsKGlucHV0LmV4cGVyaW1lbnRhbCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlRWRpdHMoX2lucHV0OiB1bmtub3duKTogSW50ZXJuYWxJbmxpbmVTdWdnZXN0T3B0aW9uc1snZWRpdHMnXSB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cztcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zWydlZGl0cyddPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogYm9vbGVhbihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cy5lbmFibGVkKSxcblx0XHRcdHNob3dDb2xsYXBzZWQ6IGJvb2xlYW4oaW5wdXQuc2hvd0NvbGxhcHNlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZWRpdHMuc2hvd0NvbGxhcHNlZCksXG5cdFx0XHRhbGxvd0NvZGVTaGlmdGluZzogc3RyaW5nU2V0KGlucHV0LmFsbG93Q29kZVNoaWZ0aW5nLCB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cy5hbGxvd0NvZGVTaGlmdGluZywgWydhbHdheXMnLCAnaG9yaXpvbnRhbCcsICduZXZlciddKSxcblx0XHRcdHNob3dMb25nRGlzdGFuY2VIaW50OiBib29sZWFuKGlucHV0LnNob3dMb25nRGlzdGFuY2VIaW50LCB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cy5zaG93TG9uZ0Rpc3RhbmNlSGludCksXG5cdFx0XHRsb25nRGlzdGFuY2VIaW50Q29udGV4dExpbmVDb3VudDogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQsIHRoaXMuZGVmYXVsdFZhbHVlLmVkaXRzLmxvbmdEaXN0YW5jZUhpbnRDb250ZXh0TGluZUNvdW50LCAwLCAxMCksXG5cdFx0XHRyZW5kZXJTaWRlQnlTaWRlOiBzdHJpbmdTZXQoaW5wdXQucmVuZGVyU2lkZUJ5U2lkZSwgdGhpcy5kZWZhdWx0VmFsdWUuZWRpdHMucmVuZGVyU2lkZUJ5U2lkZSwgWyduZXZlcicsICdhdXRvJ10pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZUV4cGVyaW1lbnRhbChfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zWydleHBlcmltZW50YWwnXSB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZS5leHBlcmltZW50YWw7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SW50ZXJuYWxJbmxpbmVTdWdnZXN0T3B0aW9uc1snZXhwZXJpbWVudGFsJ10+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdXBwcmVzc0lubGluZVN1Z2dlc3Rpb25zOiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LnN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnMsIHRoaXMuZGVmYXVsdFZhbHVlLmV4cGVyaW1lbnRhbC5zdXBwcmVzc0lubGluZVN1Z2dlc3Rpb25zKSxcblx0XHRcdHNob3dPblN1Z2dlc3RDb25mbGljdDogc3RyaW5nU2V0KGlucHV0LnNob3dPblN1Z2dlc3RDb25mbGljdCwgdGhpcy5kZWZhdWx0VmFsdWUuZXhwZXJpbWVudGFsLnNob3dPblN1Z2dlc3RDb25mbGljdCwgWydhbHdheXMnLCAnbmV2ZXInLCAnd2hlblN1Z2dlc3RMaXN0SXNJbmNvbXBsZXRlJ10pLFxuXHRcdFx0ZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uOiBib29sZWFuKGlucHV0LmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbiwgdGhpcy5kZWZhdWx0VmFsdWUuZXhwZXJpbWVudGFsLmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbiksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgb3IgZGlzYWJsZSBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uLlxuXHQqL1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVXNlIGluZGVwZW5kZW50IGNvbG9yIHBvb2wgcGVyIGJyYWNrZXQgdHlwZS5cblx0Ki9cblx0aW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEludGVybmFsQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucz4+O1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgaW5saW5lIHN1Z2dlc3Rpb25zXG4gKi9cbmNsYXNzIEJyYWNrZXRQYWlyQ29sb3JpemF0aW9uIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uYnJhY2tldFBhaXJDb2xvcml6YXRpb24sIElCcmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMsIEludGVybmFsQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJbnRlcm5hbEJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGVuYWJsZWQ6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMuaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uYnJhY2tldFBhaXJDb2xvcml6YXRpb24sICdicmFja2V0UGFpckNvbG9yaXphdGlvbicsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uLmVuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdicmFja2V0UGFpckNvbG9yaXphdGlvbi5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb24gaXMgZW5hYmxlZCBvciBub3QuIFVzZSB7MH0gdG8gb3ZlcnJpZGUgdGhlIGJyYWNrZXQgaGlnaGxpZ2h0IGNvbG9ycy5cIiwgJ2Ajd29ya2JlbmNoLmNvbG9yQ3VzdG9taXphdGlvbnMjYCcpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuYnJhY2tldFBhaXJDb2xvcml6YXRpb24uaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdicmFja2V0UGFpckNvbG9yaXphdGlvbi5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlJywgXCJDb250cm9scyB3aGV0aGVyIGVhY2ggYnJhY2tldCB0eXBlIGhhcyBpdHMgb3duIGluZGVwZW5kZW50IGNvbG9yIHBvb2wuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbEJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogYm9vbGVhbihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lbmFibGVkKSxcblx0XHRcdGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU6IGJvb2xlYW4oaW5wdXQuaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSwgdGhpcy5kZWZhdWx0VmFsdWUuaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGd1aWRlc1xuXG5leHBvcnQgaW50ZXJmYWNlIElHdWlkZXNPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSByZW5kZXJpbmcgb2YgYnJhY2tldCBwYWlyIGd1aWRlcy5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCovXG5cdGJyYWNrZXRQYWlycz86IGJvb2xlYW4gfCAnYWN0aXZlJztcblxuXHQvKipcblx0ICogRW5hYmxlIHJlbmRlcmluZyBvZiB2ZXJ0aWNhbCBicmFja2V0IHBhaXIgZ3VpZGVzLlxuXHQgKiBEZWZhdWx0cyB0byAnYWN0aXZlJy5cblx0ICovXG5cdGJyYWNrZXRQYWlyc0hvcml6b250YWw/OiBib29sZWFuIHwgJ2FjdGl2ZSc7XG5cblx0LyoqXG5cdCAqIEVuYWJsZSBoaWdobGlnaHRpbmcgb2YgdGhlIGFjdGl2ZSBicmFja2V0IHBhaXIuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCovXG5cdGhpZ2hsaWdodEFjdGl2ZUJyYWNrZXRQYWlyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRW5hYmxlIHJlbmRlcmluZyBvZiBpbmRlbnQgZ3VpZGVzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aW5kZW50YXRpb24/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBFbmFibGUgaGlnaGxpZ2h0aW5nIG9mIHRoZSBhY3RpdmUgaW5kZW50IGd1aWRlLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24/OiBib29sZWFuIHwgJ2Fsd2F5cyc7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEludGVybmFsR3VpZGVzT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElHdWlkZXNPcHRpb25zPj47XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBpbmxpbmUgc3VnZ2VzdGlvbnNcbiAqL1xuY2xhc3MgR3VpZGVPcHRpb25zIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZ3VpZGVzLCBJR3VpZGVzT3B0aW9ucywgSW50ZXJuYWxHdWlkZXNPcHRpb25zPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJbnRlcm5hbEd1aWRlc09wdGlvbnMgPSB7XG5cdFx0XHRicmFja2V0UGFpcnM6IGZhbHNlLFxuXHRcdFx0YnJhY2tldFBhaXJzSG9yaXpvbnRhbDogJ2FjdGl2ZScsXG5cdFx0XHRoaWdobGlnaHRBY3RpdmVCcmFja2V0UGFpcjogdHJ1ZSxcblxuXHRcdFx0aW5kZW50YXRpb246IHRydWUsXG5cdFx0XHRoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbjogdHJ1ZVxuXHRcdH07XG5cblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5ndWlkZXMsICdndWlkZXMnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgJ2FjdGl2ZScsIGZhbHNlXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzLnRydWUnLCBcIkVuYWJsZXMgYnJhY2tldCBwYWlyIGd1aWRlcy5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzLmFjdGl2ZScsIFwiRW5hYmxlcyBicmFja2V0IHBhaXIgZ3VpZGVzIG9ubHkgZm9yIHRoZSBhY3RpdmUgYnJhY2tldCBwYWlyLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnMuZmFsc2UnLCBcIkRpc2FibGVzIGJyYWNrZXQgcGFpciBndWlkZXMuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYnJhY2tldFBhaXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzJywgXCJDb250cm9scyB3aGV0aGVyIGJyYWNrZXQgcGFpciBndWlkZXMgYXJlIGVuYWJsZWQgb3Igbm90LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnNIb3Jpem9udGFsJzoge1xuXHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgJ2FjdGl2ZScsIGZhbHNlXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzSG9yaXpvbnRhbC50cnVlJywgXCJFbmFibGVzIGhvcml6b250YWwgZ3VpZGVzIGFzIGFkZGl0aW9uIHRvIHZlcnRpY2FsIGJyYWNrZXQgcGFpciBndWlkZXMuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmJyYWNrZXRQYWlyc0hvcml6b250YWwuYWN0aXZlJywgXCJFbmFibGVzIGhvcml6b250YWwgZ3VpZGVzIG9ubHkgZm9yIHRoZSBhY3RpdmUgYnJhY2tldCBwYWlyLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnNIb3Jpem9udGFsLmZhbHNlJywgXCJEaXNhYmxlcyBob3Jpem9udGFsIGJyYWNrZXQgcGFpciBndWlkZXMuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYnJhY2tldFBhaXJzSG9yaXpvbnRhbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmJyYWNrZXRQYWlyc0hvcml6b250YWwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgaG9yaXpvbnRhbCBicmFja2V0IHBhaXIgZ3VpZGVzIGFyZSBlbmFibGVkIG9yIG5vdC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5ndWlkZXMuaGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmhpZ2hsaWdodEFjdGl2ZUJyYWNrZXRQYWlyLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuaGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgaGlnaGxpZ2h0IHRoZSBhY3RpdmUgYnJhY2tldCBwYWlyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmd1aWRlcy5pbmRlbnRhdGlvbic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaW5kZW50YXRpb24sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5pbmRlbnRhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCByZW5kZXIgaW5kZW50IGd1aWRlcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5ndWlkZXMuaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCAnYWx3YXlzJywgZmFsc2VdLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbi50cnVlJywgXCJIaWdobGlnaHRzIHRoZSBhY3RpdmUgaW5kZW50IGd1aWRlLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbi5hbHdheXMnLCBcIkhpZ2hsaWdodHMgdGhlIGFjdGl2ZSBpbmRlbnQgZ3VpZGUgZXZlbiBpZiBicmFja2V0IGd1aWRlcyBhcmUgaGlnaGxpZ2h0ZWQuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uLmZhbHNlJywgXCJEbyBub3QgaGlnaGxpZ2h0IHRoZSBhY3RpdmUgaW5kZW50IGd1aWRlLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uLFxuXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBoaWdobGlnaHQgdGhlIGFjdGl2ZSBpbmRlbnQgZ3VpZGUuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsR3VpZGVzT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJR3VpZGVzT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJyYWNrZXRQYWlyczogcHJpbWl0aXZlU2V0KGlucHV0LmJyYWNrZXRQYWlycywgdGhpcy5kZWZhdWx0VmFsdWUuYnJhY2tldFBhaXJzLCBbdHJ1ZSwgZmFsc2UsICdhY3RpdmUnXSksXG5cdFx0XHRicmFja2V0UGFpcnNIb3Jpem9udGFsOiBwcmltaXRpdmVTZXQoaW5wdXQuYnJhY2tldFBhaXJzSG9yaXpvbnRhbCwgdGhpcy5kZWZhdWx0VmFsdWUuYnJhY2tldFBhaXJzSG9yaXpvbnRhbCwgW3RydWUsIGZhbHNlLCAnYWN0aXZlJ10pLFxuXHRcdFx0aGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXI6IGJvb2xlYW4oaW5wdXQuaGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXIsIHRoaXMuZGVmYXVsdFZhbHVlLmhpZ2hsaWdodEFjdGl2ZUJyYWNrZXRQYWlyKSxcblxuXHRcdFx0aW5kZW50YXRpb246IGJvb2xlYW4oaW5wdXQuaW5kZW50YXRpb24sIHRoaXMuZGVmYXVsdFZhbHVlLmluZGVudGF0aW9uKSxcblx0XHRcdGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiBwcmltaXRpdmVTZXQoaW5wdXQuaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24sIHRoaXMuZGVmYXVsdFZhbHVlLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uLCBbdHJ1ZSwgZmFsc2UsICdhbHdheXMnXSksXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBwcmltaXRpdmVTZXQ8VCBleHRlbmRzIHN0cmluZyB8IGJvb2xlYW4+KHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IFQsIGFsbG93ZWRWYWx1ZXM6IFRbXSk6IFQge1xuXHRjb25zdCBpZHggPSBhbGxvd2VkVmFsdWVzLmluZGV4T2YodmFsdWUgYXMgVCk7XG5cdGlmIChpZHggPT09IC0xKSB7XG5cdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0fVxuXHRyZXR1cm4gYWxsb3dlZFZhbHVlc1tpZHhdO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHN1Z2dlc3RcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBzdWdnZXN0IHdpZGdldFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdWdnZXN0T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBPdmVyd3JpdGUgd29yZCBlbmRzIG9uIGFjY2VwdC4gRGVmYXVsdCB0byBmYWxzZS5cblx0ICovXG5cdGluc2VydE1vZGU/OiAnaW5zZXJ0JyB8ICdyZXBsYWNlJztcblx0LyoqXG5cdCAqIEVuYWJsZSBncmFjZWZ1bCBtYXRjaGluZy4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGZpbHRlckdyYWNlZnVsPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFByZXZlbnQgcXVpY2sgc3VnZ2VzdGlvbnMgd2hlbiBhIHNuaXBwZXQgaXMgYWN0aXZlLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9ucz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBGYXZvcnMgd29yZHMgdGhhdCBhcHBlYXIgY2xvc2UgdG8gdGhlIGN1cnNvci5cblx0ICovXG5cdGxvY2FsaXR5Qm9udXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHVzaW5nIGdsb2JhbCBzdG9yYWdlIGZvciByZW1lbWJlcmluZyBzdWdnZXN0aW9ucy5cblx0ICovXG5cdHNoYXJlU3VnZ2VzdFNlbGVjdGlvbnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2VsZWN0IHN1Z2dlc3Rpb25zIHdoZW4gdHJpZ2dlcmVkIHZpYSBxdWljayBzdWdnZXN0IG9yIHRyaWdnZXIgY2hhcmFjdGVyc1xuXHQgKi9cblx0c2VsZWN0aW9uTW9kZT86ICdhbHdheXMnIHwgJ25ldmVyJyB8ICd3aGVuVHJpZ2dlckNoYXJhY3RlcicgfCAnd2hlblF1aWNrU3VnZ2VzdGlvbic7XG5cdC8qKlxuXHQgKiBFbmFibGUgb3IgZGlzYWJsZSBpY29ucyBpbiBzdWdnZXN0aW9ucy4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNob3dJY29ucz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgb3IgZGlzYWJsZSB0aGUgc3VnZ2VzdCBzdGF0dXMgYmFyLlxuXHQgKi9cblx0c2hvd1N0YXR1c0Jhcj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgb3IgZGlzYWJsZSB0aGUgcmVuZGVyaW5nIG9mIHRoZSBzdWdnZXN0aW9uIHByZXZpZXcuXG5cdCAqL1xuXHRwcmV2aWV3PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbmZpZ3VyZXMgdGhlIG1vZGUgb2YgdGhlIHByZXZpZXcuXG5cdCovXG5cdHByZXZpZXdNb2RlPzogJ3ByZWZpeCcgfCAnc3Vid29yZCcgfCAnc3Vid29yZFNtYXJ0Jztcblx0LyoqXG5cdCAqIFNob3cgZGV0YWlscyBpbmxpbmUgd2l0aCB0aGUgbGFiZWwuIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzaG93SW5saW5lRGV0YWlscz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBHcm93IHRoZSBzdWdnZXN0IHdpZGdldCdzIHByZWZlcnJlZCB3aWR0aCB0byBmaXQgdGhlIGlubGluZSBkZXRhaWwgdGV4dCBzbyBpdFxuXHQgKiBpcyBub3QgdHJ1bmNhdGVkLiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICogQGludGVybmFsXG5cdCAqL1xuXHRmaXRXaWR0aFRvRGV0YWlscz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IG1ldGhvZC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dNZXRob2RzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgZnVuY3Rpb24tc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RnVuY3Rpb25zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgY29uc3RydWN0b3Itc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93Q29uc3RydWN0b3JzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgZGVwcmVjYXRlZC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dEZXByZWNhdGVkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgc3VnZ2VzdGlvbnMgYWxsb3cgbWF0Y2hlcyBpbiB0aGUgbWlkZGxlIG9mIHRoZSB3b3JkIGluc3RlYWQgb2Ygb25seSBhdCB0aGUgYmVnaW5uaW5nXG5cdCAqL1xuXHRtYXRjaE9uV29yZFN0YXJ0T25seT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGZpZWxkLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0ZpZWxkcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHZhcmlhYmxlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1ZhcmlhYmxlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGNsYXNzLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0NsYXNzZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBzdHJ1Y3Qtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93U3RydWN0cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGludGVyZmFjZS1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dJbnRlcmZhY2VzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgbW9kdWxlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd01vZHVsZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBwcm9wZXJ0eS1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dQcm9wZXJ0aWVzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgZXZlbnQtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RXZlbnRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgb3BlcmF0b3Itc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93T3BlcmF0b3JzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdW5pdC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dVbml0cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHZhbHVlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1ZhbHVlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGNvbnN0YW50LXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0NvbnN0YW50cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGVudW0tc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RW51bXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBlbnVtTWVtYmVyLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0VudW1NZW1iZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cga2V5d29yZC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dLZXl3b3Jkcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHRleHQtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93V29yZHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBjb2xvci1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dDb2xvcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBmaWxlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0ZpbGVzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgcmVmZXJlbmNlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1JlZmVyZW5jZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBmb2xkZXItc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93Rm9sZGVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHR5cGVQYXJhbWV0ZXItc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93VHlwZVBhcmFtZXRlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBpc3N1ZS1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dJc3N1ZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyB1c2VyLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1VzZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgc25pcHBldC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dTbmlwcGV0cz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEludGVybmFsU3VnZ2VzdE9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJU3VnZ2VzdE9wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yU3VnZ2VzdCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnN1Z2dlc3QsIElTdWdnZXN0T3B0aW9ucywgSW50ZXJuYWxTdWdnZXN0T3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJbnRlcm5hbFN1Z2dlc3RPcHRpb25zID0ge1xuXHRcdFx0aW5zZXJ0TW9kZTogJ2luc2VydCcsXG5cdFx0XHRmaWx0ZXJHcmFjZWZ1bDogdHJ1ZSxcblx0XHRcdHNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnM6IGZhbHNlLFxuXHRcdFx0bG9jYWxpdHlCb251czogZmFsc2UsXG5cdFx0XHRzaGFyZVN1Z2dlc3RTZWxlY3Rpb25zOiBmYWxzZSxcblx0XHRcdHNlbGVjdGlvbk1vZGU6ICdhbHdheXMnLFxuXHRcdFx0c2hvd0ljb25zOiB0cnVlLFxuXHRcdFx0c2hvd1N0YXR1c0JhcjogZmFsc2UsXG5cdFx0XHRwcmV2aWV3OiBmYWxzZSxcblx0XHRcdHByZXZpZXdNb2RlOiAnc3Vid29yZFNtYXJ0Jyxcblx0XHRcdHNob3dJbmxpbmVEZXRhaWxzOiB0cnVlLFxuXHRcdFx0Zml0V2lkdGhUb0RldGFpbHM6IGZhbHNlLFxuXHRcdFx0c2hvd01ldGhvZHM6IHRydWUsXG5cdFx0XHRzaG93RnVuY3Rpb25zOiB0cnVlLFxuXHRcdFx0c2hvd0NvbnN0cnVjdG9yczogdHJ1ZSxcblx0XHRcdHNob3dEZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0bWF0Y2hPbldvcmRTdGFydE9ubHk6IHRydWUsXG5cdFx0XHRzaG93RmllbGRzOiB0cnVlLFxuXHRcdFx0c2hvd1ZhcmlhYmxlczogdHJ1ZSxcblx0XHRcdHNob3dDbGFzc2VzOiB0cnVlLFxuXHRcdFx0c2hvd1N0cnVjdHM6IHRydWUsXG5cdFx0XHRzaG93SW50ZXJmYWNlczogdHJ1ZSxcblx0XHRcdHNob3dNb2R1bGVzOiB0cnVlLFxuXHRcdFx0c2hvd1Byb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRzaG93RXZlbnRzOiB0cnVlLFxuXHRcdFx0c2hvd09wZXJhdG9yczogdHJ1ZSxcblx0XHRcdHNob3dVbml0czogdHJ1ZSxcblx0XHRcdHNob3dWYWx1ZXM6IHRydWUsXG5cdFx0XHRzaG93Q29uc3RhbnRzOiB0cnVlLFxuXHRcdFx0c2hvd0VudW1zOiB0cnVlLFxuXHRcdFx0c2hvd0VudW1NZW1iZXJzOiB0cnVlLFxuXHRcdFx0c2hvd0tleXdvcmRzOiB0cnVlLFxuXHRcdFx0c2hvd1dvcmRzOiB0cnVlLFxuXHRcdFx0c2hvd0NvbG9yczogdHJ1ZSxcblx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdHNob3dSZWZlcmVuY2VzOiB0cnVlLFxuXHRcdFx0c2hvd0ZvbGRlcnM6IHRydWUsXG5cdFx0XHRzaG93VHlwZVBhcmFtZXRlcnM6IHRydWUsXG5cdFx0XHRzaG93U25pcHBldHM6IHRydWUsXG5cdFx0XHRzaG93VXNlcnM6IHRydWUsXG5cdFx0XHRzaG93SXNzdWVzOiB0cnVlLFxuXHRcdH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uc3VnZ2VzdCwgJ3N1Z2dlc3QnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0Lmluc2VydE1vZGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydpbnNlcnQnLCAncmVwbGFjZSddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5pbnNlcnRNb2RlLmluc2VydCcsIFwiSW5zZXJ0IHN1Z2dlc3Rpb24gd2l0aG91dCBvdmVyd3JpdGluZyB0ZXh0IHJpZ2h0IG9mIHRoZSBjdXJzb3IuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUucmVwbGFjZScsIFwiSW5zZXJ0IHN1Z2dlc3Rpb24gYW5kIG92ZXJ3cml0ZSB0ZXh0IHJpZ2h0IG9mIHRoZSBjdXJzb3IuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaW5zZXJ0TW9kZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgd29yZHMgYXJlIG92ZXJ3cml0dGVuIHdoZW4gYWNjZXB0aW5nIGNvbXBsZXRpb25zLiBOb3RlIHRoYXQgdGhpcyBkZXBlbmRzIG9uIGV4dGVuc2lvbnMgb3B0aW5nIGludG8gdGhpcyBmZWF0dXJlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3QuZmlsdGVyR3JhY2VmdWwnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmZpbHRlckdyYWNlZnVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3QuZmlsdGVyR3JhY2VmdWwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsdGVyaW5nIGFuZCBzb3J0aW5nIHN1Z2dlc3Rpb25zIGFjY291bnRzIGZvciBzbWFsbCB0eXBvcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LmxvY2FsaXR5Qm9udXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmxvY2FsaXR5Qm9udXMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5sb2NhbGl0eUJvbnVzJywgXCJDb250cm9scyB3aGV0aGVyIHNvcnRpbmcgZmF2b3JzIHdvcmRzIHRoYXQgYXBwZWFyIGNsb3NlIHRvIHRoZSBjdXJzb3IuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIHJlbWVtYmVyZWQgc3VnZ2VzdGlvbiBzZWxlY3Rpb25zIGFyZSBzaGFyZWQgYmV0d2VlbiBtdWx0aXBsZSB3b3Jrc3BhY2VzIGFuZCB3aW5kb3dzIChuZWVkcyBgI2VkaXRvci5zdWdnZXN0U2VsZWN0aW9uI2ApLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2VsZWN0aW9uTW9kZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICduZXZlcicsICd3aGVuVHJpZ2dlckNoYXJhY3RlcicsICd3aGVuUXVpY2tTdWdnZXN0aW9uJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUuYWx3YXlzJywgXCJBbHdheXMgc2VsZWN0IGEgc3VnZ2VzdGlvbiB3aGVuIGF1dG9tYXRpY2FsbHkgdHJpZ2dlcmluZyBJbnRlbGxpU2Vuc2UuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUubmV2ZXInLCBcIk5ldmVyIHNlbGVjdCBhIHN1Z2dlc3Rpb24gd2hlbiBhdXRvbWF0aWNhbGx5IHRyaWdnZXJpbmcgSW50ZWxsaVNlbnNlLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5pbnNlcnRNb2RlLndoZW5UcmlnZ2VyQ2hhcmFjdGVyJywgXCJTZWxlY3QgYSBzdWdnZXN0aW9uIG9ubHkgd2hlbiB0cmlnZ2VyaW5nIEludGVsbGlTZW5zZSBmcm9tIGEgdHJpZ2dlciBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUud2hlblF1aWNrU3VnZ2VzdGlvbicsIFwiU2VsZWN0IGEgc3VnZ2VzdGlvbiBvbmx5IHdoZW4gdHJpZ2dlcmluZyBJbnRlbGxpU2Vuc2UgYXMgeW91IHR5cGUuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2VsZWN0aW9uTW9kZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3Quc2VsZWN0aW9uTW9kZScsIFwiQ29udHJvbHMgd2hldGhlciBhIHN1Z2dlc3Rpb24gaXMgc2VsZWN0ZWQgd2hlbiB0aGUgd2lkZ2V0IHNob3dzLiBOb3RlIHRoYXQgdGhpcyBvbmx5IGFwcGxpZXMgdG8gYXV0b21hdGljYWxseSB0cmlnZ2VyZWQgc3VnZ2VzdGlvbnMgKHswfSBhbmQgezF9KSBhbmQgdGhhdCBhIHN1Z2dlc3Rpb24gaXMgYWx3YXlzIHNlbGVjdGVkIHdoZW4gZXhwbGljaXRseSBpbnZva2VkLCBlLmcgdmlhIGBDdHJsK1NwYWNlYC5cIiwgJ2AjZWRpdG9yLnF1aWNrU3VnZ2VzdGlvbnMjYCcsICdgI2VkaXRvci5zdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycyNgJylcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5zbmlwcGV0c1ByZXZlbnRRdWlja1N1Z2dlc3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIGFuIGFjdGl2ZSBzbmlwcGV0IHByZXZlbnRzIHF1aWNrIHN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0ljb25zJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93SWNvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5zaG93SWNvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBvciBoaWRlIGljb25zIGluIHN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1N0YXR1c0Jhcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2hvd1N0YXR1c0Jhcixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnNob3dTdGF0dXNCYXInLCBcIkNvbnRyb2xzIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBzdGF0dXMgYmFyIGF0IHRoZSBib3R0b20gb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3QucHJldmlldyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMucHJldmlldyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnByZXZpZXcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gcHJldmlldyB0aGUgc3VnZ2VzdGlvbiBvdXRjb21lIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93SW5saW5lRGV0YWlscyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2hvd0lubGluZURldGFpbHMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5zaG93SW5saW5lRGV0YWlscycsIFwiQ29udHJvbHMgd2hldGhlciBzdWdnZXN0IGRldGFpbHMgc2hvdyBpbmxpbmUgd2l0aCB0aGUgbGFiZWwgb3Igb25seSBpbiB0aGUgZGV0YWlscyB3aWRnZXQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5maWx0ZXJlZFR5cGVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdkZXByZWNhdGVkJywgXCJUaGlzIHNldHRpbmcgaXMgZGVwcmVjYXRlZCwgcGxlYXNlIHVzZSBzZXBhcmF0ZSBzZXR0aW5ncyBsaWtlICdlZGl0b3Iuc3VnZ2VzdC5zaG93S2V5d29yZHMnIG9yICdlZGl0b3Iuc3VnZ2VzdC5zaG93U25pcHBldHMnIGluc3RlYWQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93TWV0aG9kcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dNZXRob2RzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBtZXRob2RgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0Z1bmN0aW9ucyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dGdW5jdGlvbnMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGZ1bmN0aW9uYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dDb25zdHJ1Y3RvcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q29uc3RydWN0b3JzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBjb25zdHJ1Y3RvcmAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RGVwcmVjYXRlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dEZXByZWNhdGVkJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBkZXByZWNhdGVkYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0Lm1hdGNoT25Xb3JkU3RhcnRPbmx5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3QubWF0Y2hPbldvcmRTdGFydE9ubHknLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2UgZmlsdGVyaW5nIHJlcXVpcmVzIHRoYXQgdGhlIGZpcnN0IGNoYXJhY3RlciBtYXRjaGVzIG9uIGEgd29yZCBzdGFydC4gRm9yIGV4YW1wbGUsIGBjYCBvbiBgQ29uc29sZWAgb3IgYFdlYkNvbnRleHRgIGJ1dCBfbm90XyBvbiBgZGVzY3JpcHRpb25gLiBXaGVuIGRpc2FibGVkIEludGVsbGlTZW5zZSB3aWxsIHNob3cgbW9yZSByZXN1bHRzIGJ1dCBzdGlsbCBzb3J0cyB0aGVtIGJ5IG1hdGNoIHF1YWxpdHkuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RmllbGRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0ZpZWxkcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZmllbGRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1ZhcmlhYmxlcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dWYXJpYWJsZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYHZhcmlhYmxlYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dDbGFzc2VzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0NsYXNzcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgY2xhc3NgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1N0cnVjdHMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93U3RydWN0cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgc3RydWN0YC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dJbnRlcmZhY2VzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0ludGVyZmFjZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGludGVyZmFjZWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93TW9kdWxlcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dNb2R1bGVzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBtb2R1bGVgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93UHJvcGVydHlzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBwcm9wZXJ0eWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RXZlbnRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0V2ZW50cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZXZlbnRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd09wZXJhdG9ycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dPcGVyYXRvcnMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYG9wZXJhdG9yYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dVbml0cyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dVbml0cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgdW5pdGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93VmFsdWVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1ZhbHVlcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgdmFsdWVgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0NvbnN0YW50cyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dDb25zdGFudHMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGNvbnN0YW50YC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dFbnVtcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dFbnVtcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZW51bWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RW51bU1lbWJlcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93RW51bU1lbWJlcnMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGVudW1NZW1iZXJgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0tleXdvcmRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0tleXdvcmRzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBrZXl3b3JkYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dXb3Jkcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dUZXh0cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgdGV4dGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q29sb3JzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0NvbG9ycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgY29sb3JgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0ZpbGVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0ZpbGVzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBmaWxlYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dSZWZlcmVuY2VzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1JlZmVyZW5jZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYHJlZmVyZW5jZWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q3VzdG9tY29sb3JzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0N1c3RvbWNvbG9ycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgY3VzdG9tY29sb3JgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0ZvbGRlcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93Rm9sZGVycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZm9sZGVyYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dUeXBlUGFyYW1ldGVycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dUeXBlUGFyYW1ldGVycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgdHlwZVBhcmFtZXRlcmAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93U25pcHBldHMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93U25pcHBldHMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYHNuaXBwZXRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1VzZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1VzZXJzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGB1c2VyYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dJc3N1ZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93SXNzdWVzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBpc3N1ZXNgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbFN1Z2dlc3RPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElTdWdnZXN0T3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluc2VydE1vZGU6IHN0cmluZ1NldChpbnB1dC5pbnNlcnRNb2RlLCB0aGlzLmRlZmF1bHRWYWx1ZS5pbnNlcnRNb2RlLCBbJ2luc2VydCcsICdyZXBsYWNlJ10pLFxuXHRcdFx0ZmlsdGVyR3JhY2VmdWw6IGJvb2xlYW4oaW5wdXQuZmlsdGVyR3JhY2VmdWwsIHRoaXMuZGVmYXVsdFZhbHVlLmZpbHRlckdyYWNlZnVsKSxcblx0XHRcdHNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnM6IGJvb2xlYW4oaW5wdXQuc25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9ucywgdGhpcy5kZWZhdWx0VmFsdWUuZmlsdGVyR3JhY2VmdWwpLFxuXHRcdFx0bG9jYWxpdHlCb251czogYm9vbGVhbihpbnB1dC5sb2NhbGl0eUJvbnVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5sb2NhbGl0eUJvbnVzKSxcblx0XHRcdHNoYXJlU3VnZ2VzdFNlbGVjdGlvbnM6IGJvb2xlYW4oaW5wdXQuc2hhcmVTdWdnZXN0U2VsZWN0aW9ucywgdGhpcy5kZWZhdWx0VmFsdWUuc2hhcmVTdWdnZXN0U2VsZWN0aW9ucyksXG5cdFx0XHRzZWxlY3Rpb25Nb2RlOiBzdHJpbmdTZXQoaW5wdXQuc2VsZWN0aW9uTW9kZSwgdGhpcy5kZWZhdWx0VmFsdWUuc2VsZWN0aW9uTW9kZSwgWydhbHdheXMnLCAnbmV2ZXInLCAnd2hlblF1aWNrU3VnZ2VzdGlvbicsICd3aGVuVHJpZ2dlckNoYXJhY3RlciddKSxcblx0XHRcdHNob3dJY29uczogYm9vbGVhbihpbnB1dC5zaG93SWNvbnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dJY29ucyksXG5cdFx0XHRzaG93U3RhdHVzQmFyOiBib29sZWFuKGlucHV0LnNob3dTdGF0dXNCYXIsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dTdGF0dXNCYXIpLFxuXHRcdFx0cHJldmlldzogYm9vbGVhbihpbnB1dC5wcmV2aWV3LCB0aGlzLmRlZmF1bHRWYWx1ZS5wcmV2aWV3KSxcblx0XHRcdHByZXZpZXdNb2RlOiBzdHJpbmdTZXQoaW5wdXQucHJldmlld01vZGUsIHRoaXMuZGVmYXVsdFZhbHVlLnByZXZpZXdNb2RlLCBbJ3ByZWZpeCcsICdzdWJ3b3JkJywgJ3N1YndvcmRTbWFydCddKSxcblx0XHRcdHNob3dJbmxpbmVEZXRhaWxzOiBib29sZWFuKGlucHV0LnNob3dJbmxpbmVEZXRhaWxzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93SW5saW5lRGV0YWlscyksXG5cdFx0XHRmaXRXaWR0aFRvRGV0YWlsczogYm9vbGVhbihpbnB1dC5maXRXaWR0aFRvRGV0YWlscywgdGhpcy5kZWZhdWx0VmFsdWUuZml0V2lkdGhUb0RldGFpbHMpLFxuXHRcdFx0c2hvd01ldGhvZHM6IGJvb2xlYW4oaW5wdXQuc2hvd01ldGhvZHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dNZXRob2RzKSxcblx0XHRcdHNob3dGdW5jdGlvbnM6IGJvb2xlYW4oaW5wdXQuc2hvd0Z1bmN0aW9ucywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0Z1bmN0aW9ucyksXG5cdFx0XHRzaG93Q29uc3RydWN0b3JzOiBib29sZWFuKGlucHV0LnNob3dDb25zdHJ1Y3RvcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dDb25zdHJ1Y3RvcnMpLFxuXHRcdFx0c2hvd0RlcHJlY2F0ZWQ6IGJvb2xlYW4oaW5wdXQuc2hvd0RlcHJlY2F0ZWQsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dEZXByZWNhdGVkKSxcblx0XHRcdG1hdGNoT25Xb3JkU3RhcnRPbmx5OiBib29sZWFuKGlucHV0Lm1hdGNoT25Xb3JkU3RhcnRPbmx5LCB0aGlzLmRlZmF1bHRWYWx1ZS5tYXRjaE9uV29yZFN0YXJ0T25seSksXG5cdFx0XHRzaG93RmllbGRzOiBib29sZWFuKGlucHV0LnNob3dGaWVsZHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dGaWVsZHMpLFxuXHRcdFx0c2hvd1ZhcmlhYmxlczogYm9vbGVhbihpbnB1dC5zaG93VmFyaWFibGVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93VmFyaWFibGVzKSxcblx0XHRcdHNob3dDbGFzc2VzOiBib29sZWFuKGlucHV0LnNob3dDbGFzc2VzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93Q2xhc3NlcyksXG5cdFx0XHRzaG93U3RydWN0czogYm9vbGVhbihpbnB1dC5zaG93U3RydWN0cywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1N0cnVjdHMpLFxuXHRcdFx0c2hvd0ludGVyZmFjZXM6IGJvb2xlYW4oaW5wdXQuc2hvd0ludGVyZmFjZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dJbnRlcmZhY2VzKSxcblx0XHRcdHNob3dNb2R1bGVzOiBib29sZWFuKGlucHV0LnNob3dNb2R1bGVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93TW9kdWxlcyksXG5cdFx0XHRzaG93UHJvcGVydGllczogYm9vbGVhbihpbnB1dC5zaG93UHJvcGVydGllcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1Byb3BlcnRpZXMpLFxuXHRcdFx0c2hvd0V2ZW50czogYm9vbGVhbihpbnB1dC5zaG93RXZlbnRzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93RXZlbnRzKSxcblx0XHRcdHNob3dPcGVyYXRvcnM6IGJvb2xlYW4oaW5wdXQuc2hvd09wZXJhdG9ycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd09wZXJhdG9ycyksXG5cdFx0XHRzaG93VW5pdHM6IGJvb2xlYW4oaW5wdXQuc2hvd1VuaXRzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93VW5pdHMpLFxuXHRcdFx0c2hvd1ZhbHVlczogYm9vbGVhbihpbnB1dC5zaG93VmFsdWVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93VmFsdWVzKSxcblx0XHRcdHNob3dDb25zdGFudHM6IGJvb2xlYW4oaW5wdXQuc2hvd0NvbnN0YW50cywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0NvbnN0YW50cyksXG5cdFx0XHRzaG93RW51bXM6IGJvb2xlYW4oaW5wdXQuc2hvd0VudW1zLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93RW51bXMpLFxuXHRcdFx0c2hvd0VudW1NZW1iZXJzOiBib29sZWFuKGlucHV0LnNob3dFbnVtTWVtYmVycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0VudW1NZW1iZXJzKSxcblx0XHRcdHNob3dLZXl3b3JkczogYm9vbGVhbihpbnB1dC5zaG93S2V5d29yZHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dLZXl3b3JkcyksXG5cdFx0XHRzaG93V29yZHM6IGJvb2xlYW4oaW5wdXQuc2hvd1dvcmRzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93V29yZHMpLFxuXHRcdFx0c2hvd0NvbG9yczogYm9vbGVhbihpbnB1dC5zaG93Q29sb3JzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93Q29sb3JzKSxcblx0XHRcdHNob3dGaWxlczogYm9vbGVhbihpbnB1dC5zaG93RmlsZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dGaWxlcyksXG5cdFx0XHRzaG93UmVmZXJlbmNlczogYm9vbGVhbihpbnB1dC5zaG93UmVmZXJlbmNlcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1JlZmVyZW5jZXMpLFxuXHRcdFx0c2hvd0ZvbGRlcnM6IGJvb2xlYW4oaW5wdXQuc2hvd0ZvbGRlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dGb2xkZXJzKSxcblx0XHRcdHNob3dUeXBlUGFyYW1ldGVyczogYm9vbGVhbihpbnB1dC5zaG93VHlwZVBhcmFtZXRlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dUeXBlUGFyYW1ldGVycyksXG5cdFx0XHRzaG93U25pcHBldHM6IGJvb2xlYW4oaW5wdXQuc2hvd1NuaXBwZXRzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93U25pcHBldHMpLFxuXHRcdFx0c2hvd1VzZXJzOiBib29sZWFuKGlucHV0LnNob3dVc2VycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1VzZXJzKSxcblx0XHRcdHNob3dJc3N1ZXM6IGJvb2xlYW4oaW5wdXQuc2hvd0lzc3VlcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0lzc3VlcyksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNtYXJ0IHNlbGVjdFxuXG5leHBvcnQgaW50ZXJmYWNlIElTbWFydFNlbGVjdE9wdGlvbnMge1xuXHRzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlPzogYm9vbGVhbjtcblx0c2VsZWN0U3Vid29yZHM/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBTbWFydFNlbGVjdE9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJU21hcnRTZWxlY3RPcHRpb25zPj47XG5cbmNsYXNzIFNtYXJ0U2VsZWN0IGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uc21hcnRTZWxlY3QsIElTbWFydFNlbGVjdE9wdGlvbnMsIFNtYXJ0U2VsZWN0T3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnNtYXJ0U2VsZWN0LCAnc21hcnRTZWxlY3QnLFxuXHRcdFx0e1xuXHRcdFx0XHRzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlOiB0cnVlLFxuXHRcdFx0XHRzZWxlY3RTdWJ3b3JkczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3Iuc21hcnRTZWxlY3Quc2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZSc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlJywgXCJXaGV0aGVyIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2Ugc2hvdWxkIGFsd2F5cyBiZSBzZWxlY3RlZC5cIiksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zbWFydFNlbGVjdC5zZWxlY3RTdWJ3b3Jkcyc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWxlY3RTdWJ3b3JkcycsIFwiV2hldGhlciBzdWJ3b3JkcyAobGlrZSAnZm9vJyBpbiAnZm9vQmFyJyBvciAnZm9vX2JhcicpIHNob3VsZCBiZSBzZWxlY3RlZC5cIiksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBSZWFkb25seTxSZXF1aXJlZDxJU21hcnRTZWxlY3RPcHRpb25zPj4ge1xuXHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZTogYm9vbGVhbigoaW5wdXQgYXMgSVNtYXJ0U2VsZWN0T3B0aW9ucykuc2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZSwgdGhpcy5kZWZhdWx0VmFsdWUuc2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZSksXG5cdFx0XHRzZWxlY3RTdWJ3b3JkczogYm9vbGVhbigoaW5wdXQgYXMgSVNtYXJ0U2VsZWN0T3B0aW9ucykuc2VsZWN0U3Vid29yZHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNlbGVjdFN1YndvcmRzKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gd29yZFNlZ21lbnRlckxvY2FsZXNcblxuLyoqXG4gKiBMb2NhbGVzIHVzZWQgZm9yIHNlZ21lbnRpbmcgbGluZXMgaW50byB3b3JkcyB3aGVuIGRvaW5nIHdvcmQgcmVsYXRlZCBuYXZpZ2F0aW9ucyBvciBvcGVyYXRpb25zLlxuICpcbiAqIFNwZWNpZnkgdGhlIEJDUCA0NyBsYW5ndWFnZSB0YWcgb2YgdGhlIHdvcmQgeW91IHdpc2ggdG8gcmVjb2duaXplIChlLmcuLCBqYSwgemgtQ04sIHpoLUhhbnQtVFcsIGV0Yy4pLlxuICovXG5jbGFzcyBXb3JkU2VnbWVudGVyTG9jYWxlcyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLndvcmRTZWdtZW50ZXJMb2NhbGVzLCBzdHJpbmcgfCBzdHJpbmdbXSwgc3RyaW5nW10+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi53b3JkU2VnbWVudGVyTG9jYWxlcywgJ3dvcmRTZWdtZW50ZXJMb2NhbGVzJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3JkU2VnbWVudGVyTG9jYWxlcycsIFwiTG9jYWxlcyB0byBiZSB1c2VkIGZvciB3b3JkIHNlZ21lbnRhdGlvbiB3aGVuIGRvaW5nIHdvcmQgcmVsYXRlZCBuYXZpZ2F0aW9ucyBvciBvcGVyYXRpb25zLiBTcGVjaWZ5IHRoZSBCQ1AgNDcgbGFuZ3VhZ2UgdGFnIG9mIHRoZSB3b3JkIHlvdSB3aXNoIHRvIHJlY29nbml6ZSAoZS5nLiwgamEsIHpoLUNOLCB6aC1IYW50LVRXLCBldGMuKS5cIiksXG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogc3RyaW5nW10ge1xuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRpbnB1dCA9IFtpbnB1dF07XG5cdFx0fVxuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSkge1xuXHRcdFx0Y29uc3QgdmFsaWRMb2NhbGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBsb2NhbGUgb2YgaW5wdXQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBsb2NhbGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmIChJbnRsLlNlZ21lbnRlci5zdXBwb3J0ZWRMb2NhbGVzT2YobG9jYWxlKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHZhbGlkTG9jYWxlcy5wdXNoKGxvY2FsZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBpZ25vcmUgaW52YWxpZCBsb2NhbGVzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsaWRMb2NhbGVzO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxufVxuXG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gd3JhcHBpbmdJbmRlbnRcblxuLyoqXG4gKiBEZXNjcmliZXMgaG93IHRvIGluZGVudCB3cmFwcGVkIGxpbmVzLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBXcmFwcGluZ0luZGVudCB7XG5cdC8qKlxuXHQgKiBObyBpbmRlbnRhdGlvbiA9PiB3cmFwcGVkIGxpbmVzIGJlZ2luIGF0IGNvbHVtbiAxLlxuXHQgKi9cblx0Tm9uZSA9IDAsXG5cdC8qKlxuXHQgKiBTYW1lID0+IHdyYXBwZWQgbGluZXMgZ2V0IHRoZSBzYW1lIGluZGVudGF0aW9uIGFzIHRoZSBwYXJlbnQuXG5cdCAqL1xuXHRTYW1lID0gMSxcblx0LyoqXG5cdCAqIEluZGVudCA9PiB3cmFwcGVkIGxpbmVzIGdldCArMSBpbmRlbnRhdGlvbiB0b3dhcmQgdGhlIHBhcmVudC5cblx0ICovXG5cdEluZGVudCA9IDIsXG5cdC8qKlxuXHQgKiBEZWVwSW5kZW50ID0+IHdyYXBwZWQgbGluZXMgZ2V0ICsyIGluZGVudGF0aW9uIHRvd2FyZCB0aGUgcGFyZW50LlxuXHQgKi9cblx0RGVlcEluZGVudCA9IDNcbn1cblxuY2xhc3MgV3JhcHBpbmdJbmRlbnRPcHRpb24gZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi53cmFwcGluZ0luZGVudCwgJ25vbmUnIHwgJ3NhbWUnIHwgJ2luZGVudCcgfCAnZGVlcEluZGVudCcsIFdyYXBwaW5nSW5kZW50PiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50LCAnd3JhcHBpbmdJbmRlbnQnLCBXcmFwcGluZ0luZGVudC5TYW1lLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLndyYXBwaW5nSW5kZW50Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbm9uZScsICdzYW1lJywgJ2luZGVudCcsICdkZWVwSW5kZW50J10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd3cmFwcGluZ0luZGVudC5ub25lJywgXCJObyBpbmRlbnRhdGlvbi4gV3JhcHBlZCBsaW5lcyBiZWdpbiBhdCBjb2x1bW4gMS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3dyYXBwaW5nSW5kZW50LnNhbWUnLCBcIldyYXBwZWQgbGluZXMgZ2V0IHRoZSBzYW1lIGluZGVudGF0aW9uIGFzIHRoZSBwYXJlbnQuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd3cmFwcGluZ0luZGVudC5pbmRlbnQnLCBcIldyYXBwZWQgbGluZXMgZ2V0ICsxIGluZGVudGF0aW9uIHRvd2FyZCB0aGUgcGFyZW50LlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnd3JhcHBpbmdJbmRlbnQuZGVlcEluZGVudCcsIFwiV3JhcHBlZCBsaW5lcyBnZXQgKzIgaW5kZW50YXRpb24gdG93YXJkIHRoZSBwYXJlbnQuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd3JhcHBpbmdJbmRlbnQnLCBcIkNvbnRyb2xzIHRoZSBpbmRlbnRhdGlvbiBvZiB3cmFwcGVkIGxpbmVzLlwiKSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnc2FtZSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBXcmFwcGluZ0luZGVudCB7XG5cdFx0c3dpdGNoIChpbnB1dCkge1xuXHRcdFx0Y2FzZSAnbm9uZSc6IHJldHVybiBXcmFwcGluZ0luZGVudC5Ob25lO1xuXHRcdFx0Y2FzZSAnc2FtZSc6IHJldHVybiBXcmFwcGluZ0luZGVudC5TYW1lO1xuXHRcdFx0Y2FzZSAnaW5kZW50JzogcmV0dXJuIFdyYXBwaW5nSW5kZW50LkluZGVudDtcblx0XHRcdGNhc2UgJ2RlZXBJbmRlbnQnOiByZXR1cm4gV3JhcHBpbmdJbmRlbnQuRGVlcEluZGVudDtcblx0XHR9XG5cdFx0cmV0dXJuIFdyYXBwaW5nSW5kZW50LlNhbWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IFdyYXBwaW5nSW5kZW50KTogV3JhcHBpbmdJbmRlbnQge1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTdXBwb3J0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0KTtcblx0XHRpZiAoYWNjZXNzaWJpbGl0eVN1cHBvcnQgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQpIHtcblx0XHRcdC8vIGlmIHdlIGtub3cgZm9yIGEgZmFjdCB0aGF0IGEgc2NyZWVuIHJlYWRlciBpcyBhdHRhY2hlZCwgd2UgdXNlIG5vIGluZGVudCB3cmFwcGluZyB0b1xuXHRcdFx0Ly8gaGVscCB0aGF0IHRoZSBlZGl0b3IncyB3cmFwcGluZyBwb2ludHMgbWF0Y2ggdGhlIHRleHRhcmVhJ3Mgd3JhcHBpbmcgcG9pbnRzXG5cdFx0XHRyZXR1cm4gV3JhcHBpbmdJbmRlbnQuTm9uZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gd3JhcHBpbmdJbmZvXG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yV3JhcHBpbmdJbmZvIHtcblx0cmVhZG9ubHkgaXNEb21pbmF0ZWRCeUxvbmdMaW5lczogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNXb3JkV3JhcE1pbmlmaWVkOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1ZpZXdwb3J0V3JhcHBpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdyYXBwaW5nQ29sdW1uOiBudW1iZXI7XG59XG5cbmNsYXNzIEVkaXRvcldyYXBwaW5nSW5mb0NvbXB1dGVyIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbywgRWRpdG9yV3JhcHBpbmdJbmZvPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbywge1xuXHRcdFx0aXNEb21pbmF0ZWRCeUxvbmdMaW5lczogZmFsc2UsXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIF86IEVkaXRvcldyYXBwaW5nSW5mbyk6IEVkaXRvcldyYXBwaW5nSW5mbyB7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBlbnYuaXNEb21pbmF0ZWRCeUxvbmdMaW5lcyxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogbGF5b3V0SW5mby5pc1dvcmRXcmFwTWluaWZpZWQsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGxheW91dEluZm8uaXNWaWV3cG9ydFdyYXBwaW5nLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IGxheW91dEluZm8ud3JhcHBpbmdDb2x1bW4sXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGRyb3BJbnRvRWRpdG9yXG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBlZGl0b3IgZHJvcCBpbnRvIGJlaGF2aW9yXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSURyb3BJbnRvRWRpdG9yT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgZHJvcHBpbmcgaW50byBlZGl0b3IuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgaWYgYSB3aWRnZXQgaXMgc2hvd24gYWZ0ZXIgYSBkcm9wLlxuXHQgKiBEZWZhdWx0cyB0byAnYWZ0ZXJEcm9wJy5cblx0ICovXG5cdHNob3dEcm9wU2VsZWN0b3I/OiAnYWZ0ZXJEcm9wJyB8ICduZXZlcic7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckRyb3BJbnRvRWRpdG9yT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElEcm9wSW50b0VkaXRvck9wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yRHJvcEludG9FZGl0b3IgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5kcm9wSW50b0VkaXRvciwgSURyb3BJbnRvRWRpdG9yT3B0aW9ucywgRWRpdG9yRHJvcEludG9FZGl0b3JPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvckRyb3BJbnRvRWRpdG9yT3B0aW9ucyA9IHsgZW5hYmxlZDogdHJ1ZSwgc2hvd0Ryb3BTZWxlY3RvcjogJ2FmdGVyRHJvcCcgfTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5kcm9wSW50b0VkaXRvciwgJ2Ryb3BJbnRvRWRpdG9yJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuZHJvcEludG9FZGl0b3IuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZW5hYmxlZCxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Ryb3BJbnRvRWRpdG9yLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgeW91IGNhbiBkcmFnIGFuZCBkcm9wIGEgZmlsZSBpbnRvIGEgdGV4dCBlZGl0b3IgYnkgaG9sZGluZyBkb3duIHRoZSBgU2hpZnRgIGtleSAoaW5zdGVhZCBvZiBvcGVuaW5nIHRoZSBmaWxlIGluIGFuIGVkaXRvcikuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmRyb3BJbnRvRWRpdG9yLnNob3dEcm9wU2VsZWN0b3InOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkcm9wSW50b0VkaXRvci5zaG93RHJvcFNlbGVjdG9yJywgXCJDb250cm9scyBpZiBhIHdpZGdldCBpcyBzaG93biB3aGVuIGRyb3BwaW5nIGZpbGVzIGludG8gdGhlIGVkaXRvci4gVGhpcyB3aWRnZXQgbGV0cyB5b3UgY29udHJvbCBob3cgdGhlIGZpbGUgaXMgZHJvcHBlZC5cIiksXG5cdFx0XHRcdFx0ZW51bTogW1xuXHRcdFx0XHRcdFx0J2FmdGVyRHJvcCcsXG5cdFx0XHRcdFx0XHQnbmV2ZXInXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2Ryb3BJbnRvRWRpdG9yLnNob3dEcm9wU2VsZWN0b3IuYWZ0ZXJEcm9wJywgXCJTaG93IHRoZSBkcm9wIHNlbGVjdG9yIHdpZGdldCBhZnRlciBhIGZpbGUgaXMgZHJvcHBlZCBpbnRvIHRoZSBlZGl0b3IuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdkcm9wSW50b0VkaXRvci5zaG93RHJvcFNlbGVjdG9yLm5ldmVyJywgXCJOZXZlciBzaG93IHRoZSBkcm9wIHNlbGVjdG9yIHdpZGdldC4gSW5zdGVhZCB0aGUgZGVmYXVsdCBkcm9wIHByb3ZpZGVyIGlzIGFsd2F5cyB1c2VkLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdhZnRlckRyb3AnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yRHJvcEludG9FZGl0b3JPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElEcm9wSW50b0VkaXRvck9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBib29sZWFuKGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQpLFxuXHRcdFx0c2hvd0Ryb3BTZWxlY3Rvcjogc3RyaW5nU2V0KGlucHV0LnNob3dEcm9wU2VsZWN0b3IsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dEcm9wU2VsZWN0b3IsIFsnYWZ0ZXJEcm9wJywgJ25ldmVyJ10pLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBwYXN0ZUFzXG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBlZGl0b3IgcGFzdGluZyBhcyBpbnRvIGJlaGF2aW9yXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhc3RlQXNPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSBwYXN0ZSBhcyBmdW5jdGlvbmFsaXR5IGluIGVkaXRvcnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgaWYgYSB3aWRnZXQgaXMgc2hvd24gYWZ0ZXIgYSBkcm9wLlxuXHQgKiBEZWZhdWx0cyB0byAnYWZ0ZXJQYXN0ZScuXG5cdCAqL1xuXHRzaG93UGFzdGVTZWxlY3Rvcj86ICdhZnRlclBhc3RlJyB8ICduZXZlcic7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvclBhc3RlQXNPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SVBhc3RlQXNPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvclBhc3RlQXMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5wYXN0ZUFzLCBJUGFzdGVBc09wdGlvbnMsIEVkaXRvclBhc3RlQXNPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvclBhc3RlQXNPcHRpb25zID0geyBlbmFibGVkOiB0cnVlLCBzaG93UGFzdGVTZWxlY3RvcjogJ2FmdGVyUGFzdGUnIH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24ucGFzdGVBcywgJ3Bhc3RlQXMnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5wYXN0ZUFzLmVuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXN0ZUFzLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgeW91IGNhbiBwYXN0ZSBjb250ZW50IGluIGRpZmZlcmVudCB3YXlzLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5wYXN0ZUFzLnNob3dQYXN0ZVNlbGVjdG9yJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFzdGVBcy5zaG93UGFzdGVTZWxlY3RvcicsIFwiQ29udHJvbHMgaWYgYSB3aWRnZXQgaXMgc2hvd24gd2hlbiBwYXN0aW5nIGNvbnRlbnQgaW4gdG8gdGhlIGVkaXRvci4gVGhpcyB3aWRnZXQgbGV0cyB5b3UgY29udHJvbCBob3cgdGhlIGZpbGUgaXMgcGFzdGVkLlwiKSxcblx0XHRcdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFx0XHQnYWZ0ZXJQYXN0ZScsXG5cdFx0XHRcdFx0XHQnbmV2ZXInXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Bhc3RlQXMuc2hvd1Bhc3RlU2VsZWN0b3IuYWZ0ZXJQYXN0ZScsIFwiU2hvdyB0aGUgcGFzdGUgc2VsZWN0b3Igd2lkZ2V0IGFmdGVyIGNvbnRlbnQgaXMgcGFzdGVkIGludG8gdGhlIGVkaXRvci5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Bhc3RlQXMuc2hvd1Bhc3RlU2VsZWN0b3IubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIHBhc3RlIHNlbGVjdG9yIHdpZGdldC4gSW5zdGVhZCB0aGUgZGVmYXVsdCBwYXN0aW5nIGJlaGF2aW9yIGlzIGFsd2F5cyB1c2VkLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdhZnRlclBhc3RlJyxcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEVkaXRvclBhc3RlQXNPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElQYXN0ZUFzT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRzaG93UGFzdGVTZWxlY3Rvcjogc3RyaW5nU2V0KGlucHV0LnNob3dQYXN0ZVNlbGVjdG9yLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93UGFzdGVTZWxlY3RvciwgWydhZnRlclBhc3RlJywgJ25ldmVyJ10pLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjb25zdCBlZGl0b3JPcHRpb25zUmVnaXN0cnk6IElFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLCB1bmtub3duPltdID0gW107XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24sIFY+KG9wdGlvbjogSUVkaXRvck9wdGlvbjxLLCBWPik6IElFZGl0b3JPcHRpb248SywgVj4ge1xuXHRlZGl0b3JPcHRpb25zUmVnaXN0cnlbb3B0aW9uLmlkXSA9IG9wdGlvbjtcblx0cmV0dXJuIG9wdGlvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRWRpdG9yT3B0aW9uIHtcblx0YWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyLFxuXHRhY2NlcHRTdWdnZXN0aW9uT25FbnRlcixcblx0YWNjZXNzaWJpbGl0eVN1cHBvcnQsXG5cdGFjY2Vzc2liaWxpdHlQYWdlU2l6ZSxcblx0YWxsb3dPdmVyZmxvdyxcblx0YWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzLFxuXHRhbGxvd1ZhcmlhYmxlRm9udHMsXG5cdGFsbG93VmFyaWFibGVGb250c0luQWNjZXNzaWJpbGl0eU1vZGUsXG5cdGFyaWFMYWJlbCxcblx0YXJpYVJlcXVpcmVkLFxuXHRhdXRvQ2xvc2luZ0JyYWNrZXRzLFxuXHRhdXRvQ2xvc2luZ0NvbW1lbnRzLFxuXHRzY3JlZW5SZWFkZXJBbm5vdW5jZUlubGluZVN1Z2dlc3Rpb24sXG5cdGF1dG9DbG9zaW5nRGVsZXRlLFxuXHRhdXRvQ2xvc2luZ092ZXJ0eXBlLFxuXHRhdXRvQ2xvc2luZ1F1b3Rlcyxcblx0YXV0b0luZGVudCxcblx0YXV0b0luZGVudE9uUGFzdGUsXG5cdGF1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nLFxuXHRhdXRvbWF0aWNMYXlvdXQsXG5cdGF1dG9TdXJyb3VuZCxcblx0YnJhY2tldFBhaXJDb2xvcml6YXRpb24sXG5cdGd1aWRlcyxcblx0Y29kZUxlbnMsXG5cdGNvZGVMZW5zRm9udEZhbWlseSxcblx0Y29kZUxlbnNGb250U2l6ZSxcblx0Y29sb3JEZWNvcmF0b3JzLFxuXHRjb2xvckRlY29yYXRvcnNMaW1pdCxcblx0Y29sdW1uU2VsZWN0aW9uLFxuXHRjb21tZW50cyxcblx0Y29udGV4dG1lbnUsXG5cdGNvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nLFxuXHRjdXJzb3JCbGlua2luZyxcblx0Y3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24sXG5cdGN1cnNvclN0eWxlLFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzLFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUsXG5cdGN1cnNvcldpZHRoLFxuXHRjdXJzb3JIZWlnaHQsXG5cdGRpc2FibGVMYXllckhpbnRpbmcsXG5cdGRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zLFxuXHRkb21SZWFkT25seSxcblx0ZHJhZ0FuZERyb3AsXG5cdGRyb3BJbnRvRWRpdG9yLFxuXHRlZGl0Q29udGV4dCxcblx0ZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQsXG5cdGV4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbixcblx0ZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZyxcblx0ZXh0cmFFZGl0b3JDbGFzc05hbWUsXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eSxcblx0ZmluZCxcblx0Zml4ZWRPdmVyZmxvd1dpZGdldHMsXG5cdGZvbGRpbmcsXG5cdGZvbGRpbmdTdHJhdGVneSxcblx0Zm9sZGluZ0hpZ2hsaWdodCxcblx0Zm9sZGluZ0ltcG9ydHNCeURlZmF1bHQsXG5cdGZvbGRpbmdNYXhpbXVtUmVnaW9ucyxcblx0dW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lLFxuXHRmb250RmFtaWx5LFxuXHRmb250SW5mbyxcblx0Zm9udExpZ2F0dXJlcyxcblx0Zm9udFNpemUsXG5cdGZvbnRXZWlnaHQsXG5cdGZvbnRWYXJpYXRpb25zLFxuXHRmb3JtYXRPblBhc3RlLFxuXHRmb3JtYXRPblR5cGUsXG5cdGdseXBoTWFyZ2luLFxuXHRnb3RvTG9jYXRpb24sXG5cdGhpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXIsXG5cdGhvdmVyLFxuXHRpbkRpZmZFZGl0b3IsXG5cdGlubGluZVN1Z2dlc3QsXG5cdGxldHRlclNwYWNpbmcsXG5cdGxpZ2h0YnVsYixcblx0bGluZURlY29yYXRpb25zV2lkdGgsXG5cdGxpbmVIZWlnaHQsXG5cdGxpbmVOdW1iZXJzLFxuXHRsaW5lTnVtYmVyc01pbkNoYXJzLFxuXHRsaW5rZWRFZGl0aW5nLFxuXHRsaW5rcyxcblx0bWF0Y2hCcmFja2V0cyxcblx0bWluaW1hcCxcblx0bW91c2VTdHlsZSxcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRtb3VzZVdoZWVsWm9vbSxcblx0bXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nLFxuXHRtdWx0aUN1cnNvck1vZGlmaWVyLFxuXHRtb3VzZU1pZGRsZUNsaWNrQWN0aW9uLFxuXHRtdWx0aUN1cnNvclBhc3RlLFxuXHRtdWx0aUN1cnNvckxpbWl0LFxuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodCxcblx0b2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSxcblx0b3ZlcnR5cGVDdXJzb3JTdHlsZSxcblx0b3ZlcnR5cGVPblBhc3RlLFxuXHRvdmVydmlld1J1bGVyQm9yZGVyLFxuXHRvdmVydmlld1J1bGVyTGFuZXMsXG5cdHBhZGRpbmcsXG5cdHBhc3RlQXMsXG5cdHBhcmFtZXRlckhpbnRzLFxuXHRwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzLFxuXHRwbGFjZWhvbGRlcixcblx0ZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlayxcblx0cXVpY2tTdWdnZXN0aW9ucyxcblx0cXVpY2tTdWdnZXN0aW9uc0RlbGF5LFxuXHRyZWFkT25seSxcblx0cmVhZE9ubHlNZXNzYWdlLFxuXHRyZW5hbWVPblR5cGUsXG5cdHJlbmRlclJpY2hTY3JlZW5SZWFkZXJDb250ZW50LFxuXHRyZW5kZXJDb250cm9sQ2hhcmFjdGVycyxcblx0cmVuZGVyRmluYWxOZXdsaW5lLFxuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0LFxuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0T25seVdoZW5Gb2N1cyxcblx0cmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zLFxuXHRyZW5kZXJXaGl0ZXNwYWNlLFxuXHRyZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nLFxuXHRyb3VuZGVkU2VsZWN0aW9uLFxuXHRydWxlcnMsXG5cdHNjcm9sbGJhcixcblx0c2Nyb2xsQmV5b25kTGFzdENvbHVtbixcblx0c2Nyb2xsQmV5b25kTGFzdExpbmUsXG5cdHNjcm9sbFByZWRvbWluYW50QXhpcyxcblx0c2VsZWN0aW9uQ2xpcGJvYXJkLFxuXHRzZWxlY3Rpb25IaWdobGlnaHQsXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aCxcblx0c2VsZWN0aW9uSGlnaGxpZ2h0TXVsdGlsaW5lLFxuXHRzZWxlY3RPbkxpbmVOdW1iZXJzLFxuXHRzaG93Rm9sZGluZ0NvbnRyb2xzLFxuXHRzaG93VW51c2VkLFxuXHRzbmlwcGV0U3VnZ2VzdGlvbnMsXG5cdHNtYXJ0U2VsZWN0LFxuXHRzbW9vdGhTY3JvbGxpbmcsXG5cdHN0aWNreVNjcm9sbCxcblx0c3RpY2t5VGFiU3RvcHMsXG5cdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIsXG5cdHN1Z2dlc3QsXG5cdHN1Z2dlc3RGb250U2l6ZSxcblx0c3VnZ2VzdExpbmVIZWlnaHQsXG5cdHN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRzdWdnZXN0U2VsZWN0aW9uLFxuXHR0YWJDb21wbGV0aW9uLFxuXHR0YWJJbmRleCxcblx0dHJpbVdoaXRlc3BhY2VPbkRlbGV0ZSxcblx0dW5pY29kZUhpZ2hsaWdodGluZyxcblx0dW51c3VhbExpbmVUZXJtaW5hdG9ycyxcblx0dXNlU2hhZG93RE9NLFxuXHR1c2VUYWJTdG9wcyxcblx0d29yZEJyZWFrLFxuXHR3b3JkU2VnbWVudGVyTG9jYWxlcyxcblx0d29yZFNlcGFyYXRvcnMsXG5cdHdvcmRXcmFwLFxuXHR3b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzLFxuXHR3b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycyxcblx0d29yZFdyYXBDb2x1bW4sXG5cdHdvcmRXcmFwT3ZlcnJpZGUxLFxuXHR3b3JkV3JhcE92ZXJyaWRlMixcblx0d3JhcHBpbmdJbmRlbnQsXG5cdHdyYXBwaW5nU3RyYXRlZ3ksXG5cdHNob3dEZXByZWNhdGVkLFxuXHRpbmVydGlhbFNjcm9sbCxcblx0aW5sYXlIaW50cyxcblx0d3JhcE9uRXNjYXBlZExpbmVGZWVkcyxcblx0Ly8gTGVhdmUgdGhlc2UgYXQgdGhlIGVuZCAoYmVjYXVzZSB0aGV5IGhhdmUgZGVwZW5kZW5jaWVzISlcblx0ZWZmZWN0aXZlQ3Vyc29yU3R5bGUsXG5cdGVkaXRvckNsYXNzTmFtZSxcblx0cGl4ZWxSYXRpbyxcblx0dGFiRm9jdXNNb2RlLFxuXHRsYXlvdXRJbmZvLFxuXHR3cmFwcGluZ0luZm8sXG5cdGRlZmF1bHRDb2xvckRlY29yYXRvcnMsXG5cdGNvbG9yRGVjb3JhdG9yc0FjdGl2YXRlZE9uLFxuXHRpbmxpbmVDb21wbGV0aW9uc0FjY2Vzc2liaWxpdHlWZXJib3NlLFxuXHRlZmZlY3RpdmVFZGl0Q29udGV4dCxcblx0c2Nyb2xsT25NaWRkbGVDbGljayxcblx0ZWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzLFxuXHRkb3VibGVDbGlja1NlbGVjdHNCbG9ja1xufVxuXG5leHBvcnQgY29uc3QgRWRpdG9yT3B0aW9ucyA9IHtcblx0YWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyLCAnYWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyJywgdHJ1ZSxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyJywgXCJDb250cm9scyB3aGV0aGVyIHN1Z2dlc3Rpb25zIHNob3VsZCBiZSBhY2NlcHRlZCBvbiBjb21taXQgY2hhcmFjdGVycy4gRm9yIGV4YW1wbGUsIGluIEphdmFTY3JpcHQsIHRoZSBzZW1pLWNvbG9uIChgO2ApIGNhbiBiZSBhIGNvbW1pdCBjaGFyYWN0ZXIgdGhhdCBhY2NlcHRzIGEgc3VnZ2VzdGlvbiBhbmQgdHlwZXMgdGhhdCBjaGFyYWN0ZXIuXCIpIH1cblx0KSksXG5cdGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIsICdhY2NlcHRTdWdnZXN0aW9uT25FbnRlcicsXG5cdFx0J29uJyBhcyAnb24nIHwgJ3NtYXJ0JyB8ICdvZmYnLFxuXHRcdFsnb24nLCAnc21hcnQnLCAnb2ZmJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyU21hcnQnLCBcIk9ubHkgYWNjZXB0IGEgc3VnZ2VzdGlvbiB3aXRoIGBFbnRlcmAgd2hlbiBpdCBtYWtlcyBhIHRleHR1YWwgY2hhbmdlLlwiKSxcblx0XHRcdFx0Jydcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyJywgXCJDb250cm9scyB3aGV0aGVyIHN1Z2dlc3Rpb25zIHNob3VsZCBiZSBhY2NlcHRlZCBvbiBgRW50ZXJgLCBpbiBhZGRpdGlvbiB0byBgVGFiYC4gSGVscHMgdG8gYXZvaWQgYW1iaWd1aXR5IGJldHdlZW4gaW5zZXJ0aW5nIG5ldyBsaW5lcyBvciBhY2NlcHRpbmcgc3VnZ2VzdGlvbnMuXCIpXG5cdFx0fVxuXHQpKSxcblx0YWNjZXNzaWJpbGl0eVN1cHBvcnQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpKSxcblx0YWNjZXNzaWJpbGl0eVBhZ2VTaXplOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5UGFnZVNpemUsICdhY2Nlc3NpYmlsaXR5UGFnZVNpemUnLCA1MDAsIDEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlQYWdlU2l6ZScsIFwiQ29udHJvbHMgdGhlIG51bWJlciBvZiBsaW5lcyBpbiB0aGUgZWRpdG9yIHRoYXQgY2FuIGJlIHJlYWQgb3V0IGJ5IGEgc2NyZWVuIHJlYWRlciBhdCBvbmNlLiBXaGVuIHdlIGRldGVjdCBhIHNjcmVlbiByZWFkZXIgd2UgYXV0b21hdGljYWxseSBzZXQgdGhlIGRlZmF1bHQgdG8gYmUgNTAwLiBXYXJuaW5nOiB0aGlzIGhhcyBhIHBlcmZvcm1hbmNlIGltcGxpY2F0aW9uIGZvciBudW1iZXJzIGxhcmdlciB0aGFuIHRoZSBkZWZhdWx0LlwiKSxcblx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fVxuXHQpKSxcblx0YWxsb3dPdmVyZmxvdzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFsbG93T3ZlcmZsb3csICdhbGxvd092ZXJmbG93JywgdHJ1ZSxcblx0KSksXG5cdGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0czogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cywgJ2FsbG93VmFyaWFibGVMaW5lSGVpZ2h0cycsIHRydWUsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGFsbG93IHVzaW5nIHZhcmlhYmxlIGxpbmUgaGVpZ2h0cyBpbiB0aGUgZWRpdG9yLlwiKVxuXHRcdH1cblx0KSksXG5cdGFsbG93VmFyaWFibGVGb250czogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVGb250cywgJ2FsbG93VmFyaWFibGVGb250cycsIHRydWUsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWxsb3dWYXJpYWJsZUZvbnRzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGFsbG93IHVzaW5nIHZhcmlhYmxlIGZvbnRzIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0fVxuXHQpKSxcblx0YWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVGb250c0luQWNjZXNzaWJpbGl0eU1vZGUsICdhbGxvd1ZhcmlhYmxlRm9udHNJbkFjY2Vzc2liaWxpdHlNb2RlJywgZmFsc2UsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZScsIFwiQ29udHJvbHMgd2hldGhlciB0byBhbGxvdyB1c2luZyB2YXJpYWJsZSBmb250cyBpbiB0aGUgZWRpdG9yIGluIHRoZSBhY2Nlc3NpYmlsaXR5IG1vZGUuXCIpLFxuXHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9XG5cdCkpLFxuXHRhcmlhTGFiZWw6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFyaWFMYWJlbCwgJ2FyaWFMYWJlbCcsIG5scy5sb2NhbGl6ZSgnZWRpdG9yVmlld0FjY2Vzc2libGVMYWJlbCcsIFwiRWRpdG9yIGNvbnRlbnRcIilcblx0KSksXG5cdGFyaWFSZXF1aXJlZDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmFyaWFSZXF1aXJlZCwgJ2FyaWFSZXF1aXJlZCcsIGZhbHNlLCB1bmRlZmluZWRcblx0KSksXG5cdHNjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbiwgJ3NjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbicsIHRydWUsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uJywgXCJDb250cm9sIHdoZXRoZXIgaW5saW5lIHN1Z2dlc3Rpb25zIGFyZSBhbm5vdW5jZWQgYnkgYSBzY3JlZW4gcmVhZGVyLlwiKSxcblx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fVxuXHQpKSxcblx0YXV0b0Nsb3NpbmdCcmFja2V0czogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9DbG9zaW5nQnJhY2tldHMsICdhdXRvQ2xvc2luZ0JyYWNrZXRzJyxcblx0XHQnbGFuZ3VhZ2VEZWZpbmVkJyBhcyAnYWx3YXlzJyB8ICdsYW5ndWFnZURlZmluZWQnIHwgJ2JlZm9yZVdoaXRlc3BhY2UnIHwgJ25ldmVyJyxcblx0XHRbJ2Fsd2F5cycsICdsYW5ndWFnZURlZmluZWQnLCAnYmVmb3JlV2hpdGVzcGFjZScsICduZXZlciddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9DbG9zaW5nQnJhY2tldHMubGFuZ3VhZ2VEZWZpbmVkJywgXCJVc2UgbGFuZ3VhZ2UgY29uZmlndXJhdGlvbnMgdG8gZGV0ZXJtaW5lIHdoZW4gdG8gYXV0b2Nsb3NlIGJyYWNrZXRzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdCcmFja2V0cy5iZWZvcmVXaGl0ZXNwYWNlJywgXCJBdXRvY2xvc2UgYnJhY2tldHMgb25seSB3aGVuIHRoZSBjdXJzb3IgaXMgdG8gdGhlIGxlZnQgb2Ygd2hpdGVzcGFjZS5cIiksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9DbG9zaW5nQnJhY2tldHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSBjbG9zZSBicmFja2V0cyBhZnRlciB0aGUgdXNlciBhZGRzIGFuIG9wZW5pbmcgYnJhY2tldC5cIilcblx0XHR9XG5cdCkpLFxuXHRhdXRvQ2xvc2luZ0NvbW1lbnRzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdDb21tZW50cywgJ2F1dG9DbG9zaW5nQ29tbWVudHMnLFxuXHRcdCdsYW5ndWFnZURlZmluZWQnIGFzICdhbHdheXMnIHwgJ2xhbmd1YWdlRGVmaW5lZCcgfCAnYmVmb3JlV2hpdGVzcGFjZScgfCAnbmV2ZXInLFxuXHRcdFsnYWx3YXlzJywgJ2xhbmd1YWdlRGVmaW5lZCcsICdiZWZvcmVXaGl0ZXNwYWNlJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdDb21tZW50cy5sYW5ndWFnZURlZmluZWQnLCBcIlVzZSBsYW5ndWFnZSBjb25maWd1cmF0aW9ucyB0byBkZXRlcm1pbmUgd2hlbiB0byBhdXRvY2xvc2UgY29tbWVudHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvQ2xvc2luZ0NvbW1lbnRzLmJlZm9yZVdoaXRlc3BhY2UnLCBcIkF1dG9jbG9zZSBjb21tZW50cyBvbmx5IHdoZW4gdGhlIGN1cnNvciBpcyB0byB0aGUgbGVmdCBvZiB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b0Nsb3NpbmdDb21tZW50cycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGNsb3NlIGNvbW1lbnRzIGFmdGVyIHRoZSB1c2VyIGFkZHMgYW4gb3BlbmluZyBjb21tZW50LlwiKVxuXHRcdH1cblx0KSksXG5cdGF1dG9DbG9zaW5nRGVsZXRlOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdEZWxldGUsICdhdXRvQ2xvc2luZ0RlbGV0ZScsXG5cdFx0J2F1dG8nIGFzICdhbHdheXMnIHwgJ2F1dG8nIHwgJ25ldmVyJyxcblx0XHRbJ2Fsd2F5cycsICdhdXRvJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdEZWxldGUuYXV0bycsIFwiUmVtb3ZlIGFkamFjZW50IGNsb3NpbmcgcXVvdGVzIG9yIGJyYWNrZXRzIG9ubHkgaWYgdGhleSB3ZXJlIGF1dG9tYXRpY2FsbHkgaW5zZXJ0ZWQuXCIpLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhdXRvQ2xvc2luZ0RlbGV0ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCByZW1vdmUgYWRqYWNlbnQgY2xvc2luZyBxdW90ZXMgb3IgYnJhY2tldHMgd2hlbiBkZWxldGluZy5cIilcblx0XHR9XG5cdCkpLFxuXHRhdXRvQ2xvc2luZ092ZXJ0eXBlOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdPdmVydHlwZSwgJ2F1dG9DbG9zaW5nT3ZlcnR5cGUnLFxuXHRcdCdhdXRvJyBhcyAnYWx3YXlzJyB8ICdhdXRvJyB8ICduZXZlcicsXG5cdFx0WydhbHdheXMnLCAnYXV0bycsICduZXZlciddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9DbG9zaW5nT3ZlcnR5cGUuYXV0bycsIFwiVHlwZSBvdmVyIGNsb3NpbmcgcXVvdGVzIG9yIGJyYWNrZXRzIG9ubHkgaWYgdGhleSB3ZXJlIGF1dG9tYXRpY2FsbHkgaW5zZXJ0ZWQuXCIpLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhdXRvQ2xvc2luZ092ZXJ0eXBlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIHR5cGUgb3ZlciBjbG9zaW5nIHF1b3RlcyBvciBicmFja2V0cy5cIilcblx0XHR9XG5cdCkpLFxuXHRhdXRvQ2xvc2luZ1F1b3RlczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9DbG9zaW5nUXVvdGVzLCAnYXV0b0Nsb3NpbmdRdW90ZXMnLFxuXHRcdCdsYW5ndWFnZURlZmluZWQnIGFzICdhbHdheXMnIHwgJ2xhbmd1YWdlRGVmaW5lZCcgfCAnYmVmb3JlV2hpdGVzcGFjZScgfCAnbmV2ZXInLFxuXHRcdFsnYWx3YXlzJywgJ2xhbmd1YWdlRGVmaW5lZCcsICdiZWZvcmVXaGl0ZXNwYWNlJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdRdW90ZXMubGFuZ3VhZ2VEZWZpbmVkJywgXCJVc2UgbGFuZ3VhZ2UgY29uZmlndXJhdGlvbnMgdG8gZGV0ZXJtaW5lIHdoZW4gdG8gYXV0b2Nsb3NlIHF1b3Rlcy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9DbG9zaW5nUXVvdGVzLmJlZm9yZVdoaXRlc3BhY2UnLCBcIkF1dG9jbG9zZSBxdW90ZXMgb25seSB3aGVuIHRoZSBjdXJzb3IgaXMgdG8gdGhlIGxlZnQgb2Ygd2hpdGVzcGFjZS5cIiksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9DbG9zaW5nUXVvdGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgY2xvc2UgcXVvdGVzIGFmdGVyIHRoZSB1c2VyIGFkZHMgYW4gb3BlbmluZyBxdW90ZS5cIilcblx0XHR9XG5cdCkpLFxuXHRhdXRvSW5kZW50OiByZWdpc3RlcihuZXcgRWRpdG9yRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0luZGVudCwgJ2F1dG9JbmRlbnQnLFxuXHRcdEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLCAnZnVsbCcsXG5cdFx0Wydub25lJywgJ2tlZXAnLCAnYnJhY2tldHMnLCAnYWR2YW5jZWQnLCAnZnVsbCddLFxuXHRcdF9hdXRvSW5kZW50RnJvbVN0cmluZyxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9JbmRlbnQubm9uZScsIFwiVGhlIGVkaXRvciB3aWxsIG5vdCBpbnNlcnQgaW5kZW50YXRpb24gYXV0b21hdGljYWxseS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9JbmRlbnQua2VlcCcsIFwiVGhlIGVkaXRvciB3aWxsIGtlZXAgdGhlIGN1cnJlbnQgbGluZSdzIGluZGVudGF0aW9uLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0luZGVudC5icmFja2V0cycsIFwiVGhlIGVkaXRvciB3aWxsIGtlZXAgdGhlIGN1cnJlbnQgbGluZSdzIGluZGVudGF0aW9uIGFuZCBob25vciBsYW5ndWFnZSBkZWZpbmVkIGJyYWNrZXRzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0luZGVudC5hZHZhbmNlZCcsIFwiVGhlIGVkaXRvciB3aWxsIGtlZXAgdGhlIGN1cnJlbnQgbGluZSdzIGluZGVudGF0aW9uLCBob25vciBsYW5ndWFnZSBkZWZpbmVkIGJyYWNrZXRzIGFuZCBpbnZva2Ugc3BlY2lhbCBvbkVudGVyUnVsZXMgZGVmaW5lZCBieSBsYW5ndWFnZXMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvSW5kZW50LmZ1bGwnLCBcIlRoZSBlZGl0b3Igd2lsbCBrZWVwIHRoZSBjdXJyZW50IGxpbmUncyBpbmRlbnRhdGlvbiwgaG9ub3IgbGFuZ3VhZ2UgZGVmaW5lZCBicmFja2V0cywgaW52b2tlIHNwZWNpYWwgb25FbnRlclJ1bGVzIGRlZmluZWQgYnkgbGFuZ3VhZ2VzLCBhbmQgaG9ub3IgaW5kZW50YXRpb25SdWxlcyBkZWZpbmVkIGJ5IGxhbmd1YWdlcy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b0luZGVudCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGFkanVzdCB0aGUgaW5kZW50YXRpb24gd2hlbiB1c2VycyB0eXBlLCBwYXN0ZSwgbW92ZSBvciBpbmRlbnQgbGluZXMuXCIpXG5cdFx0fVxuXHQpKSxcblx0YXV0b0luZGVudE9uUGFzdGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvSW5kZW50T25QYXN0ZSwgJ2F1dG9JbmRlbnRPblBhc3RlJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhdXRvSW5kZW50T25QYXN0ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGF1dG8taW5kZW50IHRoZSBwYXN0ZWQgY29udGVudC5cIikgfVxuXHQpKSxcblx0YXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvSW5kZW50T25QYXN0ZVdpdGhpblN0cmluZywgJ2F1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgYXV0by1pbmRlbnQgdGhlIHBhc3RlZCBjb250ZW50IHdoZW4gcGFzdGVkIHdpdGhpbiBhIHN0cmluZy4gVGhpcyB0YWtlcyBlZmZlY3Qgd2hlbiBhdXRvSW5kZW50T25QYXN0ZSBpcyB0cnVlLlwiKSB9XG5cdCkpLFxuXHRhdXRvbWF0aWNMYXlvdXQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvbWF0aWNMYXlvdXQsICdhdXRvbWF0aWNMYXlvdXQnLCBmYWxzZSxcblx0KSksXG5cdGF1dG9TdXJyb3VuZDogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9TdXJyb3VuZCwgJ2F1dG9TdXJyb3VuZCcsXG5cdFx0J2xhbmd1YWdlRGVmaW5lZCcgYXMgJ2xhbmd1YWdlRGVmaW5lZCcgfCAncXVvdGVzJyB8ICdicmFja2V0cycgfCAnbmV2ZXInLFxuXHRcdFsnbGFuZ3VhZ2VEZWZpbmVkJywgJ3F1b3RlcycsICdicmFja2V0cycsICduZXZlciddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b1N1cnJvdW5kLmxhbmd1YWdlRGVmaW5lZCcsIFwiVXNlIGxhbmd1YWdlIGNvbmZpZ3VyYXRpb25zIHRvIGRldGVybWluZSB3aGVuIHRvIGF1dG9tYXRpY2FsbHkgc3Vycm91bmQgc2VsZWN0aW9ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9TdXJyb3VuZC5xdW90ZXMnLCBcIlN1cnJvdW5kIHdpdGggcXVvdGVzIGJ1dCBub3QgYnJhY2tldHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvU3Vycm91bmQuYnJhY2tldHMnLCBcIlN1cnJvdW5kIHdpdGggYnJhY2tldHMgYnV0IG5vdCBxdW90ZXMuXCIpLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9TdXJyb3VuZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IHN1cnJvdW5kIHNlbGVjdGlvbnMgd2hlbiB0eXBpbmcgcXVvdGVzIG9yIGJyYWNrZXRzLlwiKVxuXHRcdH1cblx0KSksXG5cdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uOiByZWdpc3RlcihuZXcgQnJhY2tldFBhaXJDb2xvcml6YXRpb24oKSksXG5cdGJyYWNrZXRQYWlyR3VpZGVzOiByZWdpc3RlcihuZXcgR3VpZGVPcHRpb25zKCkpLFxuXHRzdGlja3lUYWJTdG9wczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnN0aWNreVRhYlN0b3BzLCAnc3RpY2t5VGFiU3RvcHMnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N0aWNreVRhYlN0b3BzJywgXCJFbXVsYXRlIHNlbGVjdGlvbiBiZWhhdmlvciBvZiB0YWIgY2hhcmFjdGVycyB3aGVuIHVzaW5nIHNwYWNlcyBmb3IgaW5kZW50YXRpb24uIFNlbGVjdGlvbiB3aWxsIHN0aWNrIHRvIHRhYiBzdG9wcy5cIikgfVxuXHQpKSxcblx0Y29kZUxlbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jb2RlTGVucywgJ2NvZGVMZW5zJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvZGVMZW5zJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvd3MgQ29kZUxlbnMuXCIpIH1cblx0KSksXG5cdGNvZGVMZW5zRm9udEZhbWlseTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY29kZUxlbnNGb250RmFtaWx5LCAnY29kZUxlbnNGb250RmFtaWx5JywgJycsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb2RlTGVuc0ZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIHRoZSBmb250IGZhbWlseSBmb3IgQ29kZUxlbnMuXCIpIH1cblx0KSksXG5cdGNvZGVMZW5zRm9udFNpemU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udFNpemUsICdjb2RlTGVuc0ZvbnRTaXplJywgMCwgMCwgMTAwLCB7XG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogMCxcblx0XHRtaW5pbXVtOiAwLFxuXHRcdG1heGltdW06IDEwMCxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvZGVMZW5zRm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgaW4gcGl4ZWxzIGZvciBDb2RlTGVucy4gV2hlbiBzZXQgdG8gMCwgOTAlIG9mIGAjZWRpdG9yLmZvbnRTaXplI2AgaXMgdXNlZC5cIilcblx0fSkpLFxuXHRjb2xvckRlY29yYXRvcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jb2xvckRlY29yYXRvcnMsICdjb2xvckRlY29yYXRvcnMnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29sb3JEZWNvcmF0b3JzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIHJlbmRlciB0aGUgaW5saW5lIGNvbG9yIGRlY29yYXRvcnMgYW5kIGNvbG9yIHBpY2tlci5cIikgfVxuXHQpKSxcblx0Y29sb3JEZWNvcmF0b3JBY3RpdmF0ZWRPbjogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oRWRpdG9yT3B0aW9uLmNvbG9yRGVjb3JhdG9yc0FjdGl2YXRlZE9uLCAnY29sb3JEZWNvcmF0b3JzQWN0aXZhdGVkT24nLCAnY2xpY2tBbmRIb3ZlcicgYXMgJ2NsaWNrQW5kSG92ZXInIHwgJ2hvdmVyJyB8ICdjbGljaycsIFsnY2xpY2tBbmRIb3ZlcicsICdob3ZlcicsICdjbGljayddIGFzIGNvbnN0LCB7XG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuY29sb3JEZWNvcmF0b3JBY3RpdmF0ZWRPbi5jbGlja0FuZEhvdmVyJywgXCJNYWtlIHRoZSBjb2xvciBwaWNrZXIgYXBwZWFyIGJvdGggb24gY2xpY2sgYW5kIGhvdmVyIG9mIHRoZSBjb2xvciBkZWNvcmF0b3JcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5jb2xvckRlY29yYXRvckFjdGl2YXRlZE9uLmhvdmVyJywgXCJNYWtlIHRoZSBjb2xvciBwaWNrZXIgYXBwZWFyIG9uIGhvdmVyIG9mIHRoZSBjb2xvciBkZWNvcmF0b3JcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5jb2xvckRlY29yYXRvckFjdGl2YXRlZE9uLmNsaWNrJywgXCJNYWtlIHRoZSBjb2xvciBwaWNrZXIgYXBwZWFyIG9uIGNsaWNrIG9mIHRoZSBjb2xvciBkZWNvcmF0b3JcIilcblx0XHRdLFxuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbG9yRGVjb3JhdG9yQWN0aXZhdGVkT24nLCBcIkNvbnRyb2xzIHRoZSBjb25kaXRpb24gdG8gbWFrZSBhIGNvbG9yIHBpY2tlciBhcHBlYXIgZnJvbSBhIGNvbG9yIGRlY29yYXRvci5cIilcblx0fSkpLFxuXHRjb2xvckRlY29yYXRvcnNMaW1pdDogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY29sb3JEZWNvcmF0b3JzTGltaXQsICdjb2xvckRlY29yYXRvcnNMaW1pdCcsIDUwMCwgMSwgMTAwMDAwMCxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbG9yRGVjb3JhdG9yc0xpbWl0JywgXCJDb250cm9scyB0aGUgbWF4IG51bWJlciBvZiBjb2xvciBkZWNvcmF0b3JzIHRoYXQgY2FuIGJlIHJlbmRlcmVkIGluIGFuIGVkaXRvciBhdCBvbmNlLlwiKVxuXHRcdH1cblx0KSksXG5cdGNvbHVtblNlbGVjdGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmNvbHVtblNlbGVjdGlvbiwgJ2NvbHVtblNlbGVjdGlvbicsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29sdW1uU2VsZWN0aW9uJywgXCJFbmFibGUgdGhhdCB0aGUgc2VsZWN0aW9uIHdpdGggdGhlIG1vdXNlIGFuZCBrZXlzIGlzIGRvaW5nIGNvbHVtbiBzZWxlY3Rpb24uXCIpIH1cblx0KSksXG5cdGNvbW1lbnRzOiByZWdpc3RlcihuZXcgRWRpdG9yQ29tbWVudHMoKSksXG5cdGNvbnRleHRtZW51OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY29udGV4dG1lbnUsICdjb250ZXh0bWVudScsIHRydWUsXG5cdCkpLFxuXHRjb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmNvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nLCAnY29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3ludGF4IGhpZ2hsaWdodGluZyBzaG91bGQgYmUgY29waWVkIGludG8gdGhlIGNsaXBib2FyZC5cIikgfVxuXHQpKSxcblx0Y3Vyc29yQmxpbmtpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jdXJzb3JCbGlua2luZywgJ2N1cnNvckJsaW5raW5nJyxcblx0XHRUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5CbGluaywgJ2JsaW5rJyxcblx0XHRbJ2JsaW5rJywgJ3Ntb290aCcsICdwaGFzZScsICdleHBhbmQnLCAnc29saWQnXSxcblx0XHRjdXJzb3JCbGlua2luZ1N0eWxlRnJvbVN0cmluZyxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2N1cnNvckJsaW5raW5nJywgXCJDb250cm9sIHRoZSBjdXJzb3IgYW5pbWF0aW9uIHN0eWxlLlwiKSB9XG5cdCkpLFxuXHRjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uLCAnY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24nLFxuXHRcdCdvZmYnIGFzICdvZmYnIHwgJ2V4cGxpY2l0JyB8ICdvbicsXG5cdFx0WydvZmYnLCAnZXhwbGljaXQnLCAnb24nXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24ub2ZmJywgXCJTbW9vdGggY2FyZXQgYW5pbWF0aW9uIGlzIGRpc2FibGVkLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbi5leHBsaWNpdCcsIFwiU21vb3RoIGNhcmV0IGFuaW1hdGlvbiBpcyBlbmFibGVkIG9ubHkgd2hlbiB0aGUgdXNlciBtb3ZlcyB0aGUgY3Vyc29yIHdpdGggYW4gZXhwbGljaXQgZ2VzdHVyZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24ub24nLCBcIlNtb290aCBjYXJldCBhbmltYXRpb24gaXMgYWx3YXlzIGVuYWJsZWQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHNtb290aCBjYXJldCBhbmltYXRpb24gc2hvdWxkIGJlIGVuYWJsZWQuXCIpXG5cdFx0fVxuXHQpKSxcblx0Y3Vyc29yU3R5bGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jdXJzb3JTdHlsZSwgJ2N1cnNvclN0eWxlJyxcblx0XHRUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSwgJ2xpbmUnLFxuXHRcdFsnbGluZScsICdibG9jaycsICd1bmRlcmxpbmUnLCAnbGluZS10aGluJywgJ2Jsb2NrLW91dGxpbmUnLCAndW5kZXJsaW5lLXRoaW4nXSxcblx0XHRjdXJzb3JTdHlsZUZyb21TdHJpbmcsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjdXJzb3JTdHlsZScsIFwiQ29udHJvbHMgdGhlIGN1cnNvciBzdHlsZSBpbiBpbnNlcnQgaW5wdXQgbW9kZS5cIikgfVxuXHQpKSxcblx0b3ZlcnR5cGVDdXJzb3JTdHlsZTogcmVnaXN0ZXIobmV3IEVkaXRvckVudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm92ZXJ0eXBlQ3Vyc29yU3R5bGUsICdvdmVydHlwZUN1cnNvclN0eWxlJyxcblx0XHRUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2ssICdibG9jaycsXG5cdFx0WydsaW5lJywgJ2Jsb2NrJywgJ3VuZGVybGluZScsICdsaW5lLXRoaW4nLCAnYmxvY2stb3V0bGluZScsICd1bmRlcmxpbmUtdGhpbiddLFxuXHRcdGN1cnNvclN0eWxlRnJvbVN0cmluZyxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ292ZXJ0eXBlQ3Vyc29yU3R5bGUnLCBcIkNvbnRyb2xzIHRoZSBjdXJzb3Igc3R5bGUgaW4gb3ZlcnR5cGUgaW5wdXQgbW9kZS5cIikgfVxuXHQpKSxcblx0Y3Vyc29yU3Vycm91bmRpbmdMaW5lczogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY3Vyc29yU3Vycm91bmRpbmdMaW5lcywgJ2N1cnNvclN1cnJvdW5kaW5nTGluZXMnLFxuXHRcdDAsIDAsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29yU3Vycm91bmRpbmdMaW5lcycsIFwiQ29udHJvbHMgdGhlIG1pbmltYWwgbnVtYmVyIG9mIHZpc2libGUgbGVhZGluZyBsaW5lcyAobWluaW11bSAwKSBhbmQgdHJhaWxpbmcgbGluZXMgKG1pbmltdW0gMSkgc3Vycm91bmRpbmcgdGhlIGN1cnNvci4gS25vd24gYXMgJ3Njcm9sbE9mZicgb3IgJ3Njcm9sbE9mZnNldCcgaW4gc29tZSBvdGhlciBlZGl0b3JzLlwiKSB9XG5cdCkpLFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUsICdjdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUnLFxuXHRcdCdkZWZhdWx0JyBhcyAnZGVmYXVsdCcgfCAnYWxsJyxcblx0XHRbJ2RlZmF1bHQnLCAnYWxsJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZS5kZWZhdWx0JywgXCJgY3Vyc29yU3Vycm91bmRpbmdMaW5lc2AgaXMgZW5mb3JjZWQgb25seSB3aGVuIHRyaWdnZXJlZCB2aWEgdGhlIGtleWJvYXJkIG9yIEFQSS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlLmFsbCcsIFwiYGN1cnNvclN1cnJvdW5kaW5nTGluZXNgIGlzIGVuZm9yY2VkIGFsd2F5cy5cIilcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZScsIFwiQ29udHJvbHMgd2hlbiBgI2VkaXRvci5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzI2Agc2hvdWxkIGJlIGVuZm9yY2VkLlwiKVxuXHRcdH1cblx0KSksXG5cdGN1cnNvcldpZHRoOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jdXJzb3JXaWR0aCwgJ2N1cnNvcldpZHRoJyxcblx0XHQwLCAwLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29yV2lkdGgnLCBcIkNvbnRyb2xzIHRoZSB3aWR0aCBvZiB0aGUgY3Vyc29yIHdoZW4gYCNlZGl0b3IuY3Vyc29yU3R5bGUjYCBpcyBzZXQgdG8gYGxpbmVgLlwiKSB9XG5cdCkpLFxuXHRjdXJzb3JIZWlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvckhlaWdodCwgJ2N1cnNvckhlaWdodCcsXG5cdFx0MCwgMCwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0eyBtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2N1cnNvckhlaWdodCcsIFwiQ29udHJvbHMgdGhlIGhlaWdodCBvZiB0aGUgY3Vyc29yIHdoZW4gYCNlZGl0b3IuY3Vyc29yU3R5bGUjYCBpcyBzZXQgdG8gYGxpbmVgLiBDdXJzb3IncyBtYXggaGVpZ2h0IGRlcGVuZHMgb24gbGluZSBoZWlnaHQuXCIpIH1cblx0KSksXG5cdGRpc2FibGVMYXllckhpbnRpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kaXNhYmxlTGF5ZXJIaW50aW5nLCAnZGlzYWJsZUxheWVySGludGluZycsIGZhbHNlLFxuXHQpKSxcblx0ZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kaXNhYmxlTW9ub3NwYWNlT3B0aW1pemF0aW9ucywgJ2Rpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zJywgZmFsc2Vcblx0KSksXG5cdGRvbVJlYWRPbmx5OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZG9tUmVhZE9ubHksICdkb21SZWFkT25seScsIGZhbHNlLFxuXHQpKSxcblx0ZG91YmxlQ2xpY2tTZWxlY3RzQmxvY2s6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kb3VibGVDbGlja1NlbGVjdHNCbG9jaywgJ2RvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrJywgXCJDb250cm9scyB3aGV0aGVyIGRvdWJsZS1jbGlja2luZyBuZXh0IHRvIGEgYnJhY2tldCBvciBxdW90ZSBzZWxlY3RzIHRoZSBjb250ZW50IGluc2lkZS5cIikgfVxuXHQpKSxcblx0ZHJhZ0FuZERyb3A6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kcmFnQW5kRHJvcCwgJ2RyYWdBbmREcm9wJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RyYWdBbmREcm9wJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGFsbG93IG1vdmluZyBzZWxlY3Rpb25zIHZpYSBkcmFnIGFuZCBkcm9wLlwiKSB9XG5cdCkpLFxuXHRlbXB0eVNlbGVjdGlvbkNsaXBib2FyZDogcmVnaXN0ZXIobmV3IEVkaXRvckVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKCkpLFxuXHRkcm9wSW50b0VkaXRvcjogcmVnaXN0ZXIobmV3IEVkaXRvckRyb3BJbnRvRWRpdG9yKCkpLFxuXHRlZGl0Q29udGV4dDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmVkaXRDb250ZXh0LCAnZWRpdENvbnRleHQnLCB0cnVlLFxuXHRcdHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRDb250ZXh0JywgXCJTZXRzIHdoZXRoZXIgdGhlIEVkaXRDb250ZXh0IEFQSSBzaG91bGQgYmUgdXNlZCBpbnN0ZWFkIG9mIHRoZSB0ZXh0IGFyZWEgdG8gcG93ZXIgaW5wdXQgaW4gdGhlIGVkaXRvci5cIiksXG5cdFx0XHRpbmNsdWRlZDogcGxhdGZvcm0uaXNDaHJvbWUgfHwgcGxhdGZvcm0uaXNFZGdlIHx8IHBsYXRmb3JtLmlzTmF0aXZlXG5cdFx0fVxuXHQpKSxcblx0cmVuZGVyUmljaFNjcmVlblJlYWRlckNvbnRlbnQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yZW5kZXJSaWNoU2NyZWVuUmVhZGVyQ29udGVudCwgJ3JlbmRlclJpY2hTY3JlZW5SZWFkZXJDb250ZW50JywgZmFsc2UsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJSaWNoU2NyZWVuUmVhZGVyQ29udGVudCcsIFwiV2hldGhlciB0byByZW5kZXIgcmljaCBzY3JlZW4gcmVhZGVyIGNvbnRlbnQgd2hlbiB0aGUgYCNlZGl0b3IuZWRpdENvbnRleHQjYCBzZXR0aW5nIGlzIGVuYWJsZWQuXCIpLFxuXHRcdH1cblx0KSksXG5cdHN0aWNreVNjcm9sbDogcmVnaXN0ZXIobmV3IEVkaXRvclN0aWNreVNjcm9sbCgpKSxcblx0ZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uLCAnZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uJyxcblx0XHQnb2ZmJyBhcyAnb2ZmJyB8ICdvbicsXG5cdFx0WydvZmYnLCAnb24nXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbi5vZmYnLCBcIlVzZSByZWd1bGFyIERPTS1iYXNlZCByZW5kZXJpbmcuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbi5vbicsIFwiVXNlIEdQVSBhY2NlbGVyYXRpb24uXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0byB1c2UgdGhlIGV4cGVyaW1lbnRhbCBHUFUgYWNjZWxlcmF0aW9uIHRvIHJlbmRlciB0aGUgZWRpdG9yLlwiKVxuXHRcdH1cblx0KSksXG5cdGV4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5leHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nLCAnZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZycsXG5cdFx0J3N2ZycgYXMgJ3N2ZycgfCAnZm9udCcgfCAnb2ZmJyxcblx0XHRbJ3N2ZycsICdmb250JywgJ29mZiddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nLnN2ZycsIFwiVXNlIGEgbmV3IHJlbmRlcmluZyBtZXRob2Qgd2l0aCBzdmdzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nLmZvbnQnLCBcIlVzZSBhIG5ldyByZW5kZXJpbmcgbWV0aG9kIHdpdGggZm9udCBjaGFyYWN0ZXJzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nLm9mZicsIFwiVXNlIHRoZSBzdGFibGUgcmVuZGVyaW5nIG1ldGhvZC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZycsIFwiQ29udHJvbHMgd2hldGhlciB3aGl0ZXNwYWNlIGlzIHJlbmRlcmVkIHdpdGggYSBuZXcsIGV4cGVyaW1lbnRhbCBtZXRob2QuXCIpXG5cdFx0fVxuXHQpKSxcblx0ZXh0cmFFZGl0b3JDbGFzc05hbWU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmV4dHJhRWRpdG9yQ2xhc3NOYW1lLCAnZXh0cmFFZGl0b3JDbGFzc05hbWUnLCAnJyxcblx0KSksXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogcmVnaXN0ZXIobmV3IEVkaXRvckZsb2F0T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHksICdmYXN0U2Nyb2xsU2Vuc2l0aXZpdHknLFxuXHRcdDUsIHggPT4gKHggPD0gMCA/IDUgOiB4KSxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmFzdFNjcm9sbFNlbnNpdGl2aXR5JywgXCJTY3JvbGxpbmcgc3BlZWQgbXVsdGlwbGllciB3aGVuIHByZXNzaW5nIGBBbHRgLlwiKSB9XG5cdCkpLFxuXHRmaW5kOiByZWdpc3RlcihuZXcgRWRpdG9yRmluZCgpKSxcblx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5maXhlZE92ZXJmbG93V2lkZ2V0cywgJ2ZpeGVkT3ZlcmZsb3dXaWRnZXRzJywgZmFsc2UsXG5cdCkpLFxuXHRmb2xkaW5nOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZm9sZGluZywgJ2ZvbGRpbmcnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9sZGluZycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIGhhcyBjb2RlIGZvbGRpbmcgZW5hYmxlZC5cIikgfVxuXHQpKSxcblx0Zm9sZGluZ1N0cmF0ZWd5OiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZm9sZGluZ1N0cmF0ZWd5LCAnZm9sZGluZ1N0cmF0ZWd5Jyxcblx0XHQnYXV0bycgYXMgJ2F1dG8nIHwgJ2luZGVudGF0aW9uJyxcblx0XHRbJ2F1dG8nLCAnaW5kZW50YXRpb24nXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZm9sZGluZ1N0cmF0ZWd5LmF1dG8nLCBcIlVzZSBhIGxhbmd1YWdlLXNwZWNpZmljIGZvbGRpbmcgc3RyYXRlZ3kgaWYgYXZhaWxhYmxlLCBlbHNlIHRoZSBpbmRlbnRhdGlvbi1iYXNlZCBvbmUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2ZvbGRpbmdTdHJhdGVneS5pbmRlbnRhdGlvbicsIFwiVXNlIHRoZSBpbmRlbnRhdGlvbi1iYXNlZCBmb2xkaW5nIHN0cmF0ZWd5LlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb2xkaW5nU3RyYXRlZ3knLCBcIkNvbnRyb2xzIHRoZSBzdHJhdGVneSBmb3IgY29tcHV0aW5nIGZvbGRpbmcgcmFuZ2VzLlwiKVxuXHRcdH1cblx0KSksXG5cdGZvbGRpbmdIaWdobGlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb2xkaW5nSGlnaGxpZ2h0LCAnZm9sZGluZ0hpZ2hsaWdodCcsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb2xkaW5nSGlnaGxpZ2h0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGhpZ2hsaWdodCBmb2xkZWQgcmFuZ2VzLlwiKSB9XG5cdCkpLFxuXHRmb2xkaW5nSW1wb3J0c0J5RGVmYXVsdDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0LCAnZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3IgYXV0b21hdGljYWxseSBjb2xsYXBzZXMgaW1wb3J0IHJhbmdlcy5cIikgfVxuXHQpKSxcblx0Zm9sZGluZ01heGltdW1SZWdpb25zOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb2xkaW5nTWF4aW11bVJlZ2lvbnMsICdmb2xkaW5nTWF4aW11bVJlZ2lvbnMnLFxuXHRcdDUwMDAsIDEwLCA2NTAwMCwgLy8gbGltaXQgbXVzdCBiZSBsZXNzIHRoYW4gZm9sZGluZ1JhbmdlcyBNQVhfRk9MRElOR19SRUdJT05TXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb2xkaW5nTWF4aW11bVJlZ2lvbnMnLCBcIlRoZSBtYXhpbXVtIG51bWJlciBvZiBmb2xkYWJsZSByZWdpb25zLiBJbmNyZWFzaW5nIHRoaXMgdmFsdWUgbWF5IHJlc3VsdCBpbiB0aGUgZWRpdG9yIGJlY29taW5nIGxlc3MgcmVzcG9uc2l2ZSB3aGVuIHRoZSBjdXJyZW50IHNvdXJjZSBoYXMgYSBsYXJnZSBudW1iZXIgb2YgZm9sZGFibGUgcmVnaW9ucy5cIikgfVxuXHQpKSxcblx0dW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24udW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lLCAndW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2xpY2tpbmcgb24gdGhlIGVtcHR5IGNvbnRlbnQgYWZ0ZXIgYSBmb2xkZWQgbGluZSB3aWxsIHVuZm9sZCB0aGUgbGluZS5cIikgfVxuXHQpKSxcblx0Zm9udEZhbWlseTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZm9udEZhbWlseSwgJ2ZvbnRGYW1pbHknLCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5LFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5LlwiKSB9XG5cdCkpLFxuXHRmb250SW5mbzogcmVnaXN0ZXIobmV3IEVkaXRvckZvbnRJbmZvKCkpLFxuXHRmb250TGlnYXR1cmVzMjogcmVnaXN0ZXIobmV3IEVkaXRvckZvbnRMaWdhdHVyZXMoKSksXG5cdGZvbnRTaXplOiByZWdpc3RlcihuZXcgRWRpdG9yRm9udFNpemUoKSksXG5cdGZvbnRXZWlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JGb250V2VpZ2h0KCkpLFxuXHRmb250VmFyaWF0aW9uczogcmVnaXN0ZXIobmV3IEVkaXRvckZvbnRWYXJpYXRpb25zKCkpLFxuXHRmb3JtYXRPblBhc3RlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZm9ybWF0T25QYXN0ZSwgJ2Zvcm1hdE9uUGFzdGUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Zvcm1hdE9uUGFzdGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSBmb3JtYXQgdGhlIHBhc3RlZCBjb250ZW50LiBBIGZvcm1hdHRlciBtdXN0IGJlIGF2YWlsYWJsZSBhbmQgdGhlIGZvcm1hdHRlciBzaG91bGQgYmUgYWJsZSB0byBmb3JtYXQgYSByYW5nZSBpbiBhIGRvY3VtZW50LlwiKSB9XG5cdCkpLFxuXHRmb3JtYXRPblR5cGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb3JtYXRPblR5cGUsICdmb3JtYXRPblR5cGUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Zvcm1hdE9uVHlwZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGZvcm1hdCB0aGUgbGluZSBhZnRlciB0eXBpbmcuXCIpIH1cblx0KSksXG5cdGdseXBoTWFyZ2luOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZ2x5cGhNYXJnaW4sICdnbHlwaE1hcmdpbicsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdnbHlwaE1hcmdpbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCByZW5kZXIgdGhlIHZlcnRpY2FsIGdseXBoIG1hcmdpbi4gR2x5cGggbWFyZ2luIGlzIG1vc3RseSB1c2VkIGZvciBkZWJ1Z2dpbmcuXCIpIH1cblx0KSksXG5cdGdvdG9Mb2NhdGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvckdvVG9Mb2NhdGlvbigpKSxcblx0aGlkZUN1cnNvckluT3ZlcnZpZXdSdWxlcjogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmhpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXIsICdoaWRlQ3Vyc29ySW5PdmVydmlld1J1bGVyJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdoaWRlQ3Vyc29ySW5PdmVydmlld1J1bGVyJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBjdXJzb3Igc2hvdWxkIGJlIGhpZGRlbiBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIuXCIpIH1cblx0KSksXG5cdGhvdmVyOiByZWdpc3RlcihuZXcgRWRpdG9ySG92ZXIoKSksXG5cdGluRGlmZkVkaXRvcjogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvciwgJ2luRGlmZkVkaXRvcicsIGZhbHNlXG5cdCkpLFxuXHRpbmVydGlhbFNjcm9sbDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmluZXJ0aWFsU2Nyb2xsLCAnaW5lcnRpYWxTY3JvbGwnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2luZXJ0aWFsU2Nyb2xsJywgXCJNYWtlIHNjcm9sbGluZyBpbmVydGlhbCAtIG1vc3RseSB1c2VmdWwgd2l0aCB0b3VjaHBhZCBvbiBsaW51eC5cIikgfVxuXHQpKSxcblx0bGV0dGVyU3BhY2luZzogcmVnaXN0ZXIobmV3IEVkaXRvckZsb2F0T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5sZXR0ZXJTcGFjaW5nLCAnbGV0dGVyU3BhY2luZycsXG5cdFx0RURJVE9SX0ZPTlRfREVGQVVMVFMubGV0dGVyU3BhY2luZywgeCA9PiBFZGl0b3JGbG9hdE9wdGlvbi5jbGFtcCh4LCAtNSwgMjApLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbGV0dGVyU3BhY2luZycsIFwiQ29udHJvbHMgdGhlIGxldHRlciBzcGFjaW5nIGluIHBpeGVscy5cIikgfVxuXHQpKSxcblx0bGlnaHRidWxiOiByZWdpc3RlcihuZXcgRWRpdG9yTGlnaHRidWxiKCkpLFxuXHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogcmVnaXN0ZXIobmV3IEVkaXRvckxpbmVEZWNvcmF0aW9uc1dpZHRoKCkpLFxuXHRsaW5lSGVpZ2h0OiByZWdpc3RlcihuZXcgRWRpdG9yTGluZUhlaWdodCgpKSxcblx0bGluZU51bWJlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JSZW5kZXJMaW5lTnVtYmVyc09wdGlvbigpKSxcblx0bGluZU51bWJlcnNNaW5DaGFyczogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubGluZU51bWJlcnNNaW5DaGFycywgJ2xpbmVOdW1iZXJzTWluQ2hhcnMnLFxuXHRcdDUsIDEsIDMwMFxuXHQpKSxcblx0bGlua2VkRWRpdGluZzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmxpbmtlZEVkaXRpbmcsICdsaW5rZWRFZGl0aW5nJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdsaW5rZWRFZGl0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3IgaGFzIGxpbmtlZCBlZGl0aW5nIGVuYWJsZWQuIERlcGVuZGluZyBvbiB0aGUgbGFuZ3VhZ2UsIHJlbGF0ZWQgc3ltYm9scyBzdWNoIGFzIEhUTUwgdGFncywgYXJlIHVwZGF0ZWQgd2hpbGUgZWRpdGluZy5cIikgfVxuXHQpKSxcblx0bGlua3M6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5saW5rcywgJ2xpbmtzJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xpbmtzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGRldGVjdCBsaW5rcyBhbmQgbWFrZSB0aGVtIGNsaWNrYWJsZS5cIikgfVxuXHQpKSxcblx0bWF0Y2hCcmFja2V0czogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm1hdGNoQnJhY2tldHMsICdtYXRjaEJyYWNrZXRzJyxcblx0XHQnYWx3YXlzJyBhcyAnbmV2ZXInIHwgJ25lYXInIHwgJ2Fsd2F5cycsXG5cdFx0WydhbHdheXMnLCAnbmVhcicsICduZXZlciddIGFzIGNvbnN0LFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWF0Y2hCcmFja2V0cycsIFwiSGlnaGxpZ2h0IG1hdGNoaW5nIGJyYWNrZXRzLlwiKSB9XG5cdCkpLFxuXHRtaW5pbWFwOiByZWdpc3RlcihuZXcgRWRpdG9yTWluaW1hcCgpKSxcblx0bW91c2VTdHlsZTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm1vdXNlU3R5bGUsICdtb3VzZVN0eWxlJyxcblx0XHQndGV4dCcgYXMgJ3RleHQnIHwgJ2RlZmF1bHQnIHwgJ2NvcHknLFxuXHRcdFsndGV4dCcsICdkZWZhdWx0JywgJ2NvcHknXSBhcyBjb25zdCxcblx0KSksXG5cdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogcmVnaXN0ZXIobmV3IEVkaXRvckZsb2F0T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHksICdtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHknLFxuXHRcdDEsIHggPT4gKHggPT09IDAgPyAxIDogeCksXG5cdFx0eyBtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eScsIFwiQSBtdWx0aXBsaWVyIHRvIGJlIHVzZWQgb24gdGhlIGBkZWx0YVhgIGFuZCBgZGVsdGFZYCBvZiBtb3VzZSB3aGVlbCBzY3JvbGwgZXZlbnRzLlwiKSB9XG5cdCkpLFxuXHRtb3VzZVdoZWVsWm9vbTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm1vdXNlV2hlZWxab29tLCAnbW91c2VXaGVlbFpvb20nLCBmYWxzZSxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBwbGF0Zm9ybS5pc01hY2ludG9zaFxuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnbW91c2VXaGVlbFpvb20ubWFjJywgXCJab29tIHRoZSBmb250IG9mIHRoZSBlZGl0b3Igd2hlbiB1c2luZyBtb3VzZSB3aGVlbCBhbmQgaG9sZGluZyBgQ21kYC5cIilcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ21vdXNlV2hlZWxab29tJywgXCJab29tIHRoZSBmb250IG9mIHRoZSBlZGl0b3Igd2hlbiB1c2luZyBtb3VzZSB3aGVlbCBhbmQgaG9sZGluZyBgQ3RybGAuXCIpXG5cdFx0fVxuXHQpKSxcblx0bXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nLCAnbXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ211bHRpQ3Vyc29yTWVyZ2VPdmVybGFwcGluZycsIFwiTWVyZ2UgbXVsdGlwbGUgY3Vyc29ycyB3aGVuIHRoZXkgYXJlIG92ZXJsYXBwaW5nLlwiKSB9XG5cdCkpLFxuXHRtdWx0aUN1cnNvck1vZGlmaWVyOiByZWdpc3RlcihuZXcgRWRpdG9yRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JNb2RpZmllciwgJ211bHRpQ3Vyc29yTW9kaWZpZXInLFxuXHRcdCdhbHRLZXknLCAnYWx0Jyxcblx0XHRbJ2N0cmxDbWQnLCAnYWx0J10sXG5cdFx0X211bHRpQ3Vyc29yTW9kaWZpZXJGcm9tU3RyaW5nLFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ211bHRpQ3Vyc29yTW9kaWZpZXIuY3RybENtZCcsIFwiTWFwcyB0byBgQ29udHJvbGAgb24gV2luZG93cyBhbmQgTGludXggYW5kIHRvIGBDb21tYW5kYCBvbiBtYWNPUy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JNb2RpZmllci5hbHQnLCBcIk1hcHMgdG8gYEFsdGAgb24gV2luZG93cyBhbmQgTGludXggYW5kIHRvIGBPcHRpb25gIG9uIG1hY09TLlwiKVxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ211bHRpQ3Vyc29yTW9kaWZpZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0Jy0gYGN0cmxDbWRgIHJlZmVycyB0byBhIHZhbHVlIHRoZSBzZXR0aW5nIGNhbiB0YWtlIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nLFxuXHRcdFx0XHRcdCctIGBDb250cm9sYCBhbmQgYENvbW1hbmRgIHJlZmVyIHRvIHRoZSBtb2RpZmllciBrZXlzIEN0cmwgb3IgQ21kIG9uIHRoZSBrZXlib2FyZCBhbmQgY2FuIGJlIGxvY2FsaXplZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiVGhlIG1vZGlmaWVyIHRvIGJlIHVzZWQgdG8gYWRkIG11bHRpcGxlIGN1cnNvcnMgd2l0aCB0aGUgbW91c2UuIFRoZSBHbyB0byBEZWZpbml0aW9uIGFuZCBPcGVuIExpbmsgbW91c2UgZ2VzdHVyZXMgd2lsbCBhZGFwdCBzdWNoIHRoYXQgdGhleSBkbyBub3QgY29uZmxpY3Qgd2l0aCB0aGUgW211bHRpY3Vyc29yIG1vZGlmaWVyXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9jb2RlYmFzaWNzI19tdWx0aWN1cnNvci1tb2RpZmllcikuXCIpXG5cdFx0fVxuXHQpKSxcblx0bW91c2VNaWRkbGVDbGlja0FjdGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24sICdtb3VzZU1pZGRsZUNsaWNrQWN0aW9uJywgJ2RlZmF1bHQnIGFzIE1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24sXG5cdFx0WydkZWZhdWx0JywgJ29wZW5MaW5rJywgJ2N0cmxMZWZ0Q2xpY2snXSBhcyBNb3VzZU1pZGRsZUNsaWNrQWN0aW9uW10sXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtb3VzZU1pZGRsZUNsaWNrQWN0aW9uJywgXCJDb250cm9scyB3aGF0IGhhcHBlbnMgd2hlbiBtaWRkbGUgbW91c2UgYnV0dG9uIGlzIGNsaWNrZWQgaW4gdGhlIGVkaXRvci5cIikgfVxuXHQpKSxcblx0bXVsdGlDdXJzb3JQYXN0ZTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm11bHRpQ3Vyc29yUGFzdGUsICdtdWx0aUN1cnNvclBhc3RlJyxcblx0XHQnc3ByZWFkJyBhcyAnc3ByZWFkJyB8ICdmdWxsJyxcblx0XHRbJ3NwcmVhZCcsICdmdWxsJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JQYXN0ZS5zcHJlYWQnLCBcIkVhY2ggY3Vyc29yIHBhc3RlcyBhIHNpbmdsZSBsaW5lIG9mIHRoZSB0ZXh0LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdtdWx0aUN1cnNvclBhc3RlLmZ1bGwnLCBcIkVhY2ggY3Vyc29yIHBhc3RlcyB0aGUgZnVsbCB0ZXh0LlwiKVxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JQYXN0ZScsIFwiQ29udHJvbHMgcGFzdGluZyB3aGVuIHRoZSBsaW5lIGNvdW50IG9mIHRoZSBwYXN0ZWQgdGV4dCBtYXRjaGVzIHRoZSBjdXJzb3IgY291bnQuXCIpXG5cdFx0fVxuXHQpKSxcblx0bXVsdGlDdXJzb3JMaW1pdDogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JMaW1pdCwgJ211bHRpQ3Vyc29yTGltaXQnLCAxMDAwMCwgMSwgMTAwMDAwLFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JMaW1pdCcsIFwiQ29udHJvbHMgdGhlIG1heCBudW1iZXIgb2YgY3Vyc29ycyB0aGF0IGNhbiBiZSBpbiBhbiBhY3RpdmUgZWRpdG9yIGF0IG9uY2UuXCIpXG5cdFx0fVxuXHQpKSxcblx0b2NjdXJyZW5jZXNIaWdobGlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5vY2N1cnJlbmNlc0hpZ2hsaWdodCwgJ29jY3VycmVuY2VzSGlnaGxpZ2h0Jyxcblx0XHQnc2luZ2xlRmlsZScgYXMgJ29mZicgfCAnc2luZ2xlRmlsZScgfCAnbXVsdGlGaWxlJyxcblx0XHRbJ29mZicsICdzaW5nbGVGaWxlJywgJ211bHRpRmlsZSddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ29jY3VycmVuY2VzSGlnaGxpZ2h0Lm9mZicsIFwiRG9lcyBub3QgaGlnaGxpZ2h0IG9jY3VycmVuY2VzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdvY2N1cnJlbmNlc0hpZ2hsaWdodC5zaW5nbGVGaWxlJywgXCJIaWdobGlnaHRzIG9jY3VycmVuY2VzIG9ubHkgaW4gdGhlIGN1cnJlbnQgZmlsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnb2NjdXJyZW5jZXNIaWdobGlnaHQubXVsdGlGaWxlJywgXCJFeHBlcmltZW50YWw6IEhpZ2hsaWdodHMgb2NjdXJyZW5jZXMgYWNyb3NzIGFsbCB2YWxpZCBvcGVuIGZpbGVzLlwiKVxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb2NjdXJyZW5jZXNIaWdobGlnaHQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgb2NjdXJyZW5jZXMgc2hvdWxkIGJlIGhpZ2hsaWdodGVkIGFjcm9zcyBvcGVuIGZpbGVzLlwiKVxuXHRcdH1cblx0KSksXG5cdG9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXk6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXksICdvY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5Jyxcblx0XHQwLCAwLCAyMDAwLFxuXHRcdHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ29jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXknLCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggb2NjdXJyZW5jZXMgYXJlIGhpZ2hsaWdodGVkLlwiKSxcblx0XHRcdHRhZ3M6IFsncHJldmlldyddXG5cdFx0fVxuXHQpKSxcblx0b3ZlcnR5cGVPblBhc3RlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ub3ZlcnR5cGVPblBhc3RlLCAnb3ZlcnR5cGVPblBhc3RlJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ292ZXJ0eXBlT25QYXN0ZScsIFwiQ29udHJvbHMgd2hldGhlciBwYXN0aW5nIHNob3VsZCBvdmVydHlwZS5cIikgfVxuXHQpKSxcblx0b3ZlcnZpZXdSdWxlckJvcmRlcjogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm92ZXJ2aWV3UnVsZXJCb3JkZXIsICdvdmVydmlld1J1bGVyQm9yZGVyJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ292ZXJ2aWV3UnVsZXJCb3JkZXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBib3JkZXIgc2hvdWxkIGJlIGRyYXduIGFyb3VuZCB0aGUgb3ZlcnZpZXcgcnVsZXIuXCIpIH1cblx0KSksXG5cdG92ZXJ2aWV3UnVsZXJMYW5lczogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ub3ZlcnZpZXdSdWxlckxhbmVzLCAnb3ZlcnZpZXdSdWxlckxhbmVzJyxcblx0XHQzLCAwLCAzXG5cdCkpLFxuXHRwYWRkaW5nOiByZWdpc3RlcihuZXcgRWRpdG9yUGFkZGluZygpKSxcblx0cGFzdGVBczogcmVnaXN0ZXIobmV3IEVkaXRvclBhc3RlQXMoKSksXG5cdHBhcmFtZXRlckhpbnRzOiByZWdpc3RlcihuZXcgRWRpdG9yUGFyYW1ldGVySGludHMoKSksXG5cdHBlZWtXaWRnZXREZWZhdWx0Rm9jdXM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5wZWVrV2lkZ2V0RGVmYXVsdEZvY3VzLCAncGVla1dpZGdldERlZmF1bHRGb2N1cycsXG5cdFx0J3RyZWUnIGFzICd0cmVlJyB8ICdlZGl0b3InLFxuXHRcdFsndHJlZScsICdlZGl0b3InXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncGVla1dpZGdldERlZmF1bHRGb2N1cy50cmVlJywgXCJGb2N1cyB0aGUgdHJlZSB3aGVuIG9wZW5pbmcgcGVla1wiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzLmVkaXRvcicsIFwiRm9jdXMgdGhlIGVkaXRvciB3aGVuIG9wZW5pbmcgcGVla1wiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3BlZWtXaWRnZXREZWZhdWx0Rm9jdXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gZm9jdXMgdGhlIGlubGluZSBlZGl0b3Igb3IgdGhlIHRyZWUgaW4gdGhlIHBlZWsgd2lkZ2V0LlwiKVxuXHRcdH1cblx0KSksXG5cdHBsYWNlaG9sZGVyOiByZWdpc3RlcihuZXcgUGxhY2Vob2xkZXJPcHRpb24oKSksXG5cdGRlZmluaXRpb25MaW5rT3BlbnNJblBlZWs6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kZWZpbml0aW9uTGlua09wZW5zSW5QZWVrLCAnZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlaycsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlaycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgR28gdG8gRGVmaW5pdGlvbiBtb3VzZSBnZXN0dXJlIGFsd2F5cyBvcGVucyB0aGUgcGVlayB3aWRnZXQuXCIpIH1cblx0KSksXG5cdHF1aWNrU3VnZ2VzdGlvbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JRdWlja1N1Z2dlc3Rpb25zKCkpLFxuXHRxdWlja1N1Z2dlc3Rpb25zRGVsYXk6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnF1aWNrU3VnZ2VzdGlvbnNEZWxheSwgJ3F1aWNrU3VnZ2VzdGlvbnNEZWxheScsXG5cdFx0MTAsIDAsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3F1aWNrU3VnZ2VzdGlvbnNEZWxheScsIFwiQ29udHJvbHMgdGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBxdWljayBzdWdnZXN0aW9ucyB3aWxsIHNob3cgdXAuXCIpLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9XG5cdCkpLFxuXHRyZWFkT25seTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlYWRPbmx5LCAncmVhZE9ubHknLCBmYWxzZSxcblx0KSksXG5cdHJlYWRPbmx5TWVzc2FnZTogcmVnaXN0ZXIobmV3IFJlYWRvbmx5TWVzc2FnZSgpKSxcblx0cmVuYW1lT25UeXBlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuYW1lT25UeXBlLCAncmVuYW1lT25UeXBlJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5hbWVPblR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBhdXRvIHJlbmFtZXMgb24gdHlwZS5cIiksIG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ3JlbmFtZU9uVHlwZURlcHJlY2F0ZScsIFwiRGVwcmVjYXRlZCwgdXNlIGAjZWRpdG9yLmxpbmtlZEVkaXRpbmcjYCBpbnN0ZWFkLlwiKSB9XG5cdCkpLFxuXHRyZW5kZXJDb250cm9sQ2hhcmFjdGVyczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzLCAncmVuZGVyQ29udHJvbENoYXJhY3RlcnMnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyQ29udHJvbENoYXJhY3RlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgcmVuZGVyIGNvbnRyb2wgY2hhcmFjdGVycy5cIiksIHJlc3RyaWN0ZWQ6IHRydWUgfVxuXHQpKSxcblx0cmVuZGVyRmluYWxOZXdsaW5lOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyRmluYWxOZXdsaW5lLCAncmVuZGVyRmluYWxOZXdsaW5lJyxcblx0XHQocGxhdGZvcm0uaXNMaW51eCA/ICdkaW1tZWQnIDogJ29uJykgYXMgJ29mZicgfCAnb24nIHwgJ2RpbW1lZCcsXG5cdFx0WydvZmYnLCAnb24nLCAnZGltbWVkJ10gYXMgY29uc3QsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJGaW5hbE5ld2xpbmUnLCBcIlJlbmRlciBsYXN0IGxpbmUgbnVtYmVyIHdoZW4gdGhlIGZpbGUgZW5kcyB3aXRoIGEgbmV3bGluZS5cIikgfVxuXHQpKSxcblx0cmVuZGVyTGluZUhpZ2hsaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlbmRlckxpbmVIaWdobGlnaHQsICdyZW5kZXJMaW5lSGlnaGxpZ2h0Jyxcblx0XHQnbGluZScgYXMgJ25vbmUnIHwgJ2d1dHRlcicgfCAnbGluZScgfCAnYWxsJyxcblx0XHRbJ25vbmUnLCAnZ3V0dGVyJywgJ2xpbmUnLCAnYWxsJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbmRlckxpbmVIaWdobGlnaHQuYWxsJywgXCJIaWdobGlnaHRzIGJvdGggdGhlIGd1dHRlciBhbmQgdGhlIGN1cnJlbnQgbGluZS5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyTGluZUhpZ2hsaWdodCcsIFwiQ29udHJvbHMgaG93IHRoZSBlZGl0b3Igc2hvdWxkIHJlbmRlciB0aGUgY3VycmVudCBsaW5lIGhpZ2hsaWdodC5cIilcblx0XHR9XG5cdCkpLFxuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0T25seVdoZW5Gb2N1czogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzLCAncmVuZGVyTGluZUhpZ2hsaWdodE9ubHlXaGVuRm9jdXMnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzJywgXCJDb250cm9scyBpZiB0aGUgZWRpdG9yIHNob3VsZCByZW5kZXIgdGhlIGN1cnJlbnQgbGluZSBoaWdobGlnaHQgb25seSB3aGVuIHRoZSBlZGl0b3IgaXMgZm9jdXNlZC5cIikgfVxuXHQpKSxcblx0cmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zLCAncmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zJyxcblx0XHQnZWRpdGFibGUnIGFzICdlZGl0YWJsZScgfCAnb24nIHwgJ29mZicsXG5cdFx0WydlZGl0YWJsZScsICdvbicsICdvZmYnXSBhcyBjb25zdFxuXHQpKSxcblx0cmVuZGVyV2hpdGVzcGFjZTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlbmRlcldoaXRlc3BhY2UsICdyZW5kZXJXaGl0ZXNwYWNlJyxcblx0XHQnc2VsZWN0aW9uJyBhcyAnc2VsZWN0aW9uJyB8ICdub25lJyB8ICdib3VuZGFyeScgfCAndHJhaWxpbmcnIHwgJ2FsbCcsXG5cdFx0Wydub25lJywgJ2JvdW5kYXJ5JywgJ3NlbGVjdGlvbicsICd0cmFpbGluZycsICdhbGwnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbmRlcldoaXRlc3BhY2UuYm91bmRhcnknLCBcIlJlbmRlciB3aGl0ZXNwYWNlIGNoYXJhY3RlcnMgZXhjZXB0IGZvciBzaW5nbGUgc3BhY2VzIGJldHdlZW4gd29yZHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbmRlcldoaXRlc3BhY2Uuc2VsZWN0aW9uJywgXCJSZW5kZXIgd2hpdGVzcGFjZSBjaGFyYWN0ZXJzIG9ubHkgb24gc2VsZWN0ZWQgdGV4dC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVuZGVyV2hpdGVzcGFjZS50cmFpbGluZycsIFwiUmVuZGVyIG9ubHkgdHJhaWxpbmcgd2hpdGVzcGFjZSBjaGFyYWN0ZXJzLlwiKSxcblx0XHRcdFx0Jydcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJXaGl0ZXNwYWNlJywgXCJDb250cm9scyBob3cgdGhlIGVkaXRvciBzaG91bGQgcmVuZGVyIHdoaXRlc3BhY2UgY2hhcmFjdGVycy5cIilcblx0XHR9XG5cdCkpLFxuXHRyZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nLCAncmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZycsXG5cdFx0MTUsIDAsIDEwMDAsXG5cdCkpLFxuXHRyb3VuZGVkU2VsZWN0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucm91bmRlZFNlbGVjdGlvbiwgJ3JvdW5kZWRTZWxlY3Rpb24nLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncm91bmRlZFNlbGVjdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBzZWxlY3Rpb25zIHNob3VsZCBoYXZlIHJvdW5kZWQgY29ybmVycy5cIikgfVxuXHQpKSxcblx0cnVsZXJzOiByZWdpc3RlcihuZXcgRWRpdG9yUnVsZXJzKCkpLFxuXHRzY3JvbGxiYXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTY3JvbGxiYXIoKSksXG5cdHNjcm9sbEJleW9uZExhc3RDb2x1bW46IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNjcm9sbEJleW9uZExhc3RDb2x1bW4sICdzY3JvbGxCZXlvbmRMYXN0Q29sdW1uJyxcblx0XHQ0LCAwLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbEJleW9uZExhc3RDb2x1bW4nLCBcIkNvbnRyb2xzIHRoZSBudW1iZXIgb2YgZXh0cmEgY2hhcmFjdGVycyBiZXlvbmQgd2hpY2ggdGhlIGVkaXRvciB3aWxsIHNjcm9sbCBob3Jpem9udGFsbHkuXCIpIH1cblx0KSksXG5cdHNjcm9sbEJleW9uZExhc3RMaW5lOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2Nyb2xsQmV5b25kTGFzdExpbmUsICdzY3JvbGxCZXlvbmRMYXN0TGluZScsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JvbGxCZXlvbmRMYXN0TGluZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHdpbGwgc2Nyb2xsIGJleW9uZCB0aGUgbGFzdCBsaW5lLlwiKSB9XG5cdCkpLFxuXHRzY3JvbGxPbk1pZGRsZUNsaWNrOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2Nyb2xsT25NaWRkbGVDbGljaywgJ3Njcm9sbE9uTWlkZGxlQ2xpY2snLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbE9uTWlkZGxlQ2xpY2snLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciB3aWxsIHNjcm9sbCB3aGVuIHRoZSBtaWRkbGUgYnV0dG9uIGlzIHByZXNzZWQuXCIpIH1cblx0KSksXG5cdHNjcm9sbFByZWRvbWluYW50QXhpczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNjcm9sbFByZWRvbWluYW50QXhpcywgJ3Njcm9sbFByZWRvbWluYW50QXhpcycsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JvbGxQcmVkb21pbmFudEF4aXMnLCBcIlNjcm9sbCBvbmx5IGFsb25nIHRoZSBwcmVkb21pbmFudCBheGlzIHdoZW4gc2Nyb2xsaW5nIGJvdGggdmVydGljYWxseSBhbmQgaG9yaXpvbnRhbGx5IGF0IHRoZSBzYW1lIHRpbWUuIFByZXZlbnRzIGhvcml6b250YWwgZHJpZnQgd2hlbiBzY3JvbGxpbmcgdmVydGljYWxseSBvbiBhIHRyYWNrcGFkLlwiKSB9XG5cdCkpLFxuXHRzZWxlY3Rpb25DbGlwYm9hcmQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zZWxlY3Rpb25DbGlwYm9hcmQsICdzZWxlY3Rpb25DbGlwYm9hcmQnLCB0cnVlLFxuXHRcdHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdGlvbkNsaXBib2FyZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgTGludXggcHJpbWFyeSBjbGlwYm9hcmQgc2hvdWxkIGJlIHN1cHBvcnRlZC5cIiksXG5cdFx0XHRpbmNsdWRlZDogcGxhdGZvcm0uaXNMaW51eFxuXHRcdH1cblx0KSksXG5cdHNlbGVjdGlvbkhpZ2hsaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodCwgJ3NlbGVjdGlvbkhpZ2hsaWdodCcsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWxlY3Rpb25IaWdobGlnaHQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgaGlnaGxpZ2h0IG1hdGNoZXMgc2ltaWxhciB0byB0aGUgc2VsZWN0aW9uLlwiKSB9XG5cdCkpLFxuXHRzZWxlY3Rpb25IaWdobGlnaHRNYXhMZW5ndGg6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aCwgJ3NlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aCcsXG5cdFx0MjAwLCAwLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aCcsIFwiQ29udHJvbHMgaG93IG1hbnkgY2hhcmFjdGVycyBjYW4gYmUgaW4gdGhlIHNlbGVjdGlvbiBiZWZvcmUgc2ltaWxpYXIgbWF0Y2hlcyBhcmUgbm90IGhpZ2hsaWdodGVkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlwiKSB9XG5cdCkpLFxuXHRzZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmUsICdzZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBoaWdobGlnaHQgc2VsZWN0aW9uIG1hdGNoZXMgdGhhdCBzcGFuIG11bHRpcGxlIGxpbmVzLlwiKSB9XG5cdCkpLFxuXHRzZWxlY3RPbkxpbmVOdW1iZXJzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2VsZWN0T25MaW5lTnVtYmVycywgJ3NlbGVjdE9uTGluZU51bWJlcnMnLCB0cnVlLFxuXHQpKSxcblx0c2hvd0ZvbGRpbmdDb250cm9sczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMsICdzaG93Rm9sZGluZ0NvbnRyb2xzJyxcblx0XHQnbW91c2VvdmVyJyBhcyAnYWx3YXlzJyB8ICduZXZlcicgfCAnbW91c2VvdmVyJyxcblx0XHRbJ2Fsd2F5cycsICduZXZlcicsICdtb3VzZW92ZXInXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd0ZvbGRpbmdDb250cm9scy5hbHdheXMnLCBcIkFsd2F5cyBzaG93IHRoZSBmb2xkaW5nIGNvbnRyb2xzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaG93Rm9sZGluZ0NvbnRyb2xzLm5ldmVyJywgXCJOZXZlciBzaG93IHRoZSBmb2xkaW5nIGNvbnRyb2xzIGFuZCByZWR1Y2UgdGhlIGd1dHRlciBzaXplLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaG93Rm9sZGluZ0NvbnRyb2xzLm1vdXNlb3ZlcicsIFwiT25seSBzaG93IHRoZSBmb2xkaW5nIGNvbnRyb2xzIHdoZW4gdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGd1dHRlci5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2hvd0ZvbGRpbmdDb250cm9scycsIFwiQ29udHJvbHMgd2hlbiB0aGUgZm9sZGluZyBjb250cm9scyBvbiB0aGUgZ3V0dGVyIGFyZSBzaG93bi5cIilcblx0XHR9XG5cdCkpLFxuXHRzaG93VW51c2VkOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2hvd1VudXNlZCwgJ3Nob3dVbnVzZWQnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2hvd1VudXNlZCcsIFwiQ29udHJvbHMgZmFkaW5nIG91dCBvZiB1bnVzZWQgY29kZS5cIikgfVxuXHQpKSxcblx0c2hvd0RlcHJlY2F0ZWQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zaG93RGVwcmVjYXRlZCwgJ3Nob3dEZXByZWNhdGVkJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Nob3dEZXByZWNhdGVkJywgXCJDb250cm9scyBzdHJpa2V0aHJvdWdoIGRlcHJlY2F0ZWQgdmFyaWFibGVzLlwiKSB9XG5cdCkpLFxuXHRpbmxheUhpbnRzOiByZWdpc3RlcihuZXcgRWRpdG9ySW5sYXlIaW50cygpKSxcblx0c25pcHBldFN1Z2dlc3Rpb25zOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc25pcHBldFN1Z2dlc3Rpb25zLCAnc25pcHBldFN1Z2dlc3Rpb25zJyxcblx0XHQnaW5saW5lJyBhcyAndG9wJyB8ICdib3R0b20nIHwgJ2lubGluZScgfCAnbm9uZScsXG5cdFx0Wyd0b3AnLCAnYm90dG9tJywgJ2lubGluZScsICdub25lJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NuaXBwZXRTdWdnZXN0aW9ucy50b3AnLCBcIlNob3cgc25pcHBldCBzdWdnZXN0aW9ucyBvbiB0b3Agb2Ygb3RoZXIgc3VnZ2VzdGlvbnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NuaXBwZXRTdWdnZXN0aW9ucy5ib3R0b20nLCBcIlNob3cgc25pcHBldCBzdWdnZXN0aW9ucyBiZWxvdyBvdGhlciBzdWdnZXN0aW9ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc25pcHBldFN1Z2dlc3Rpb25zLmlubGluZScsIFwiU2hvdyBzbmlwcGV0cyBzdWdnZXN0aW9ucyB3aXRoIG90aGVyIHN1Z2dlc3Rpb25zLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzbmlwcGV0U3VnZ2VzdGlvbnMubm9uZScsIFwiRG8gbm90IHNob3cgc25pcHBldCBzdWdnZXN0aW9ucy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc25pcHBldFN1Z2dlc3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIHNuaXBwZXRzIGFyZSBzaG93biB3aXRoIG90aGVyIHN1Z2dlc3Rpb25zIGFuZCBob3cgdGhleSBhcmUgc29ydGVkLlwiKVxuXHRcdH1cblx0KSksXG5cdHNtYXJ0U2VsZWN0OiByZWdpc3RlcihuZXcgU21hcnRTZWxlY3QoKSksXG5cdHNtb290aFNjcm9sbGluZzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNtb290aFNjcm9sbGluZywgJ3Ntb290aFNjcm9sbGluZycsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc21vb3RoU2Nyb2xsaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igd2lsbCBzY3JvbGwgdXNpbmcgYW4gYW5pbWF0aW9uLlwiKSB9XG5cdCkpLFxuXHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zdG9wUmVuZGVyaW5nTGluZUFmdGVyLCAnc3RvcFJlbmRlcmluZ0xpbmVBZnRlcicsXG5cdFx0MTAwMDAsIC0xLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0KSksXG5cdHN1Z2dlc3Q6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdWdnZXN0KCkpLFxuXHRpbmxpbmVTdWdnZXN0OiByZWdpc3RlcihuZXcgSW5saW5lRWRpdG9yU3VnZ2VzdCgpKSxcblx0aW5saW5lQ29tcGxldGlvbnNBY2Nlc3NpYmlsaXR5VmVyYm9zZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UsICdpbmxpbmVDb21wbGV0aW9uc0FjY2Vzc2liaWxpdHlWZXJib3NlJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVDb21wbGV0aW9uc0FjY2Vzc2liaWxpdHlWZXJib3NlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBhY2Nlc3NpYmlsaXR5IGhpbnQgc2hvdWxkIGJlIHByb3ZpZGVkIHRvIHNjcmVlbiByZWFkZXIgdXNlcnMgd2hlbiBhbiBpbmxpbmUgY29tcGxldGlvbiBpcyBzaG93bi5cIikgfSkpLFxuXHRzdWdnZXN0Rm9udFNpemU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnN1Z2dlc3RGb250U2l6ZSwgJ3N1Z2dlc3RGb250U2l6ZScsXG5cdFx0MCwgMCwgMTAwMCxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdEZvbnRTaXplJywgXCJGb250IHNpemUgZm9yIHRoZSBzdWdnZXN0IHdpZGdldC4gV2hlbiBzZXQgdG8gezB9LCB0aGUgdmFsdWUgb2YgezF9IGlzIHVzZWQuXCIsICdgMGAnLCAnYCNlZGl0b3IuZm9udFNpemUjYCcpIH1cblx0KSksXG5cdHN1Z2dlc3RMaW5lSGVpZ2h0OiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zdWdnZXN0TGluZUhlaWdodCwgJ3N1Z2dlc3RMaW5lSGVpZ2h0Jyxcblx0XHQwLCAwLCAxMDAwLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0TGluZUhlaWdodCcsIFwiTGluZSBoZWlnaHQgZm9yIHRoZSBzdWdnZXN0IHdpZGdldC4gV2hlbiBzZXQgdG8gezB9LCB0aGUgdmFsdWUgb2YgezF9IGlzIHVzZWQuIFRoZSBtaW5pbXVtIHZhbHVlIGlzIDguXCIsICdgMGAnLCAnYCNlZGl0b3IubGluZUhlaWdodCNgJykgfVxuXHQpKSxcblx0c3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycywgJ3N1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzJywgXCJDb250cm9scyB3aGV0aGVyIHN1Z2dlc3Rpb25zIHNob3VsZCBhdXRvbWF0aWNhbGx5IHNob3cgdXAgd2hlbiB0eXBpbmcgdHJpZ2dlciBjaGFyYWN0ZXJzLlwiKSB9XG5cdCkpLFxuXHRzdWdnZXN0U2VsZWN0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc3VnZ2VzdFNlbGVjdGlvbiwgJ3N1Z2dlc3RTZWxlY3Rpb24nLFxuXHRcdCdmaXJzdCcgYXMgJ2ZpcnN0JyB8ICdyZWNlbnRseVVzZWQnIHwgJ3JlY2VudGx5VXNlZEJ5UHJlZml4Jyxcblx0XHRbJ2ZpcnN0JywgJ3JlY2VudGx5VXNlZCcsICdyZWNlbnRseVVzZWRCeVByZWZpeCddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3RTZWxlY3Rpb24uZmlyc3QnLCBcIkFsd2F5cyBzZWxlY3QgdGhlIGZpcnN0IHN1Z2dlc3Rpb24uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3RTZWxlY3Rpb24ucmVjZW50bHlVc2VkJywgXCJTZWxlY3QgcmVjZW50IHN1Z2dlc3Rpb25zIHVubGVzcyBmdXJ0aGVyIHR5cGluZyBzZWxlY3RzIG9uZSwgZS5nLiBgY29uc29sZS58IC0+IGNvbnNvbGUubG9nYCBiZWNhdXNlIGBsb2dgIGhhcyBiZWVuIGNvbXBsZXRlZCByZWNlbnRseS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc3VnZ2VzdFNlbGVjdGlvbi5yZWNlbnRseVVzZWRCeVByZWZpeCcsIFwiU2VsZWN0IHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHByZXZpb3VzIHByZWZpeGVzIHRoYXQgaGF2ZSBjb21wbGV0ZWQgdGhvc2Ugc3VnZ2VzdGlvbnMsIGUuZy4gYGNvIC0+IGNvbnNvbGVgIGFuZCBgY29uIC0+IGNvbnN0YC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdFNlbGVjdGlvbicsIFwiQ29udHJvbHMgaG93IHN1Z2dlc3Rpb25zIGFyZSBwcmUtc2VsZWN0ZWQgd2hlbiBzaG93aW5nIHRoZSBzdWdnZXN0IGxpc3QuXCIpXG5cdFx0fVxuXHQpKSxcblx0dGFiQ29tcGxldGlvbjogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnRhYkNvbXBsZXRpb24sICd0YWJDb21wbGV0aW9uJyxcblx0XHQnb2ZmJyBhcyAnb24nIHwgJ29mZicgfCAnb25seVNuaXBwZXRzJyxcblx0XHRbJ29uJywgJ29mZicsICdvbmx5U25pcHBldHMnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFiQ29tcGxldGlvbi5vbicsIFwiVGFiIGNvbXBsZXRlIHdpbGwgaW5zZXJ0IHRoZSBiZXN0IG1hdGNoaW5nIHN1Z2dlc3Rpb24gd2hlbiBwcmVzc2luZyB0YWIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3RhYkNvbXBsZXRpb24ub2ZmJywgXCJEaXNhYmxlIHRhYiBjb21wbGV0aW9ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFiQ29tcGxldGlvbi5vbmx5U25pcHBldHMnLCBcIlRhYiBjb21wbGV0ZSBzbmlwcGV0cyB3aGVuIHRoZWlyIHByZWZpeCBtYXRjaC4gV29ya3MgYmVzdCB3aGVuICdxdWlja1N1Z2dlc3Rpb25zJyBhcmVuJ3QgZW5hYmxlZC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFiQ29tcGxldGlvbicsIFwiRW5hYmxlcyB0YWIgY29tcGxldGlvbnMuXCIpXG5cdFx0fVxuXHQpKSxcblx0dGFiSW5kZXg6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnRhYkluZGV4LCAndGFiSW5kZXgnLFxuXHRcdDAsIC0xLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUlxuXHQpKSxcblx0dHJpbVdoaXRlc3BhY2VPbkRlbGV0ZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnRyaW1XaGl0ZXNwYWNlT25EZWxldGUsICd0cmltV2hpdGVzcGFjZU9uRGVsZXRlJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0cmltV2hpdGVzcGFjZU9uRGVsZXRlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igd2lsbCBhbHNvIGRlbGV0ZSB0aGUgbmV4dCBsaW5lJ3MgaW5kZW50YXRpb24gd2hpdGVzcGFjZSB3aGVuIGRlbGV0aW5nIGEgbmV3bGluZS5cIikgfVxuXHQpKSxcblx0dW5pY29kZUhpZ2hsaWdodDogcmVnaXN0ZXIobmV3IFVuaWNvZGVIaWdobGlnaHQoKSksXG5cdHVudXN1YWxMaW5lVGVybWluYXRvcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi51bnVzdWFsTGluZVRlcm1pbmF0b3JzLCAndW51c3VhbExpbmVUZXJtaW5hdG9ycycsXG5cdFx0J3Byb21wdCcgYXMgJ2F1dG8nIHwgJ29mZicgfCAncHJvbXB0Jyxcblx0XHRbJ2F1dG8nLCAnb2ZmJywgJ3Byb21wdCddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd1bnVzdWFsTGluZVRlcm1pbmF0b3JzLmF1dG8nLCBcIlVudXN1YWwgbGluZSB0ZXJtaW5hdG9ycyBhcmUgYXV0b21hdGljYWxseSByZW1vdmVkLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd1bnVzdWFsTGluZVRlcm1pbmF0b3JzLm9mZicsIFwiVW51c3VhbCBsaW5lIHRlcm1pbmF0b3JzIGFyZSBpZ25vcmVkLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd1bnVzdWFsTGluZVRlcm1pbmF0b3JzLnByb21wdCcsIFwiVW51c3VhbCBsaW5lIHRlcm1pbmF0b3JzIHByb21wdCB0byBiZSByZW1vdmVkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bnVzdWFsTGluZVRlcm1pbmF0b3JzJywgXCJSZW1vdmUgdW51c3VhbCBsaW5lIHRlcm1pbmF0b3JzIHRoYXQgbWlnaHQgY2F1c2UgcHJvYmxlbXMuXCIpXG5cdFx0fVxuXHQpKSxcblx0dXNlU2hhZG93RE9NOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24udXNlU2hhZG93RE9NLCAndXNlU2hhZG93RE9NJywgdHJ1ZVxuXHQpKSxcblx0dXNlVGFiU3RvcHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi51c2VUYWJTdG9wcywgJ3VzZVRhYlN0b3BzJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZVRhYlN0b3BzJywgXCJTcGFjZXMgYW5kIHRhYnMgYXJlIGluc2VydGVkIGFuZCBkZWxldGVkIGluIGFsaWdubWVudCB3aXRoIHRhYiBzdG9wcy5cIikgfVxuXHQpKSxcblx0d29yZEJyZWFrOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZEJyZWFrLCAnd29yZEJyZWFrJyxcblx0XHQnbm9ybWFsJyBhcyAnbm9ybWFsJyB8ICdrZWVwQWxsJyxcblx0XHRbJ25vcm1hbCcsICdrZWVwQWxsJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJyZWFrLm5vcm1hbCcsIFwiVXNlIHRoZSBkZWZhdWx0IGxpbmUgYnJlYWsgcnVsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJyZWFrLmtlZXBBbGwnLCBcIldvcmQgYnJlYWtzIHNob3VsZCBub3QgYmUgdXNlZCBmb3IgQ2hpbmVzZS9KYXBhbmVzZS9Lb3JlYW4gKENKSykgdGV4dC4gTm9uLUNKSyB0ZXh0IGJlaGF2aW9yIGlzIHRoZSBzYW1lIGFzIGZvciBub3JtYWwuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmRCcmVhaycsIFwiQ29udHJvbHMgdGhlIHdvcmQgYnJlYWsgcnVsZXMgdXNlZCBmb3IgQ2hpbmVzZS9KYXBhbmVzZS9Lb3JlYW4gKENKSykgdGV4dC5cIilcblx0XHR9XG5cdCkpLFxuXHR3b3JkU2VnbWVudGVyTG9jYWxlczogcmVnaXN0ZXIobmV3IFdvcmRTZWdtZW50ZXJMb2NhbGVzKCkpLFxuXHR3b3JkU2VwYXJhdG9yczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMsICd3b3JkU2VwYXJhdG9ycycsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmRTZXBhcmF0b3JzJywgXCJDaGFyYWN0ZXJzIHRoYXQgd2lsbCBiZSB1c2VkIGFzIHdvcmQgc2VwYXJhdG9ycyB3aGVuIGRvaW5nIHdvcmQgcmVsYXRlZCBuYXZpZ2F0aW9ucyBvciBvcGVyYXRpb25zLlwiKSB9XG5cdCkpLFxuXHR3b3JkV3JhcDogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwLCAnd29yZFdyYXAnLFxuXHRcdCdvZmYnIGFzICdvZmYnIHwgJ29uJyB8ICd3b3JkV3JhcENvbHVtbicgfCAnYm91bmRlZCcsXG5cdFx0WydvZmYnLCAnb24nLCAnd29yZFdyYXBDb2x1bW4nLCAnYm91bmRlZCddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3dvcmRXcmFwLm9mZicsIFwiTGluZXMgd2lsbCBuZXZlciB3cmFwLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkV3JhcC5vbicsIFwiTGluZXMgd2lsbCB3cmFwIGF0IHRoZSB2aWV3cG9ydCB3aWR0aC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnd29yZFdyYXAud29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCctIGBlZGl0b3Iud29yZFdyYXBDb2x1bW5gIHJlZmVycyB0byBhIGRpZmZlcmVudCBzZXR0aW5nIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LCBcIkxpbmVzIHdpbGwgd3JhcCBhdCBgI2VkaXRvci53b3JkV3JhcENvbHVtbiNgLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICd3b3JkV3JhcC5ib3VuZGVkJyxcblx0XHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0XHQnLSB2aWV3cG9ydCBtZWFucyB0aGUgZWRnZSBvZiB0aGUgdmlzaWJsZSB3aW5kb3cgc2l6ZS4nLFxuXHRcdFx0XHRcdFx0Jy0gYGVkaXRvci53b3JkV3JhcENvbHVtbmAgcmVmZXJzIHRvIGEgZGlmZmVyZW50IHNldHRpbmcgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sIFwiTGluZXMgd2lsbCB3cmFwIGF0IHRoZSBtaW5pbXVtIG9mIHZpZXdwb3J0IGFuZCBgI2VkaXRvci53b3JkV3JhcENvbHVtbiNgLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnd29yZFdyYXAnLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0Jy0gXFwnb2ZmXFwnLCBcXCdvblxcJywgXFwnd29yZFdyYXBDb2x1bW5cXCcgYW5kIFxcJ2JvdW5kZWRcXCcgcmVmZXIgdG8gdmFsdWVzIHRoZSBzZXR0aW5nIGNhbiB0YWtlIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nLFxuXHRcdFx0XHRcdCctIGBlZGl0b3Iud29yZFdyYXBDb2x1bW5gIHJlZmVycyB0byBhIGRpZmZlcmVudCBzZXR0aW5nIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiQ29udHJvbHMgaG93IGxpbmVzIHNob3VsZCB3cmFwLlwiKVxuXHRcdH1cblx0KSksXG5cdHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMsICd3b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzJyxcblx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHQnIFxcdH0pXT98LyYuLDtcdTAwQTJcdTAwQjBcdTIwMzJcdTIwMzNcdTIwMzBcdTIxMDNcdTMwMDFcdTMwMDJcdUZGNjFcdUZGNjRcdUZGRTBcdUZGMENcdUZGMEVcdUZGMUFcdUZGMUJcdUZGMUZcdUZGMDFcdUZGMDVcdTMwRkJcdUZGNjVcdTMwOURcdTMwOUVcdTMwRkRcdTMwRkVcdTMwRkNcdTMwQTFcdTMwQTNcdTMwQTVcdTMwQTdcdTMwQTlcdTMwQzNcdTMwRTNcdTMwRTVcdTMwRTdcdTMwRUVcdTMwRjVcdTMwRjZcdTMwNDFcdTMwNDNcdTMwNDVcdTMwNDdcdTMwNDlcdTMwNjNcdTMwODNcdTMwODVcdTMwODdcdTMwOEVcdTMwOTVcdTMwOTZcdTMxRjBcdTMxRjFcdTMxRjJcdTMxRjNcdTMxRjRcdTMxRjVcdTMxRjZcdTMxRjdcdTMxRjhcdTMxRjlcdTMxRkFcdTMxRkJcdTMxRkNcdTMxRkRcdTMxRkVcdTMxRkZcdTMwMDVcdTMwM0JcdUZGNjdcdUZGNjhcdUZGNjlcdUZGNkFcdUZGNkJcdUZGNkNcdUZGNkRcdUZGNkVcdUZGNkZcdUZGNzBcdTIwMURcdTMwMDlcdTMwMEJcdTMwMERcdTMwMEZcdTMwMTFcdTMwMTVcdUZGMDlcdUZGM0RcdUZGNURcdUZGNjMnLFxuXHQpKSxcblx0d29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzLCAnd29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMnLFxuXHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdCcoW3tcdTIwMThcdTIwMUNcdTMwMDhcdTMwMEFcdTMwMENcdTMwMEVcdTMwMTBcdTMwMTRcdUZGMDhcdUZGM0JcdUZGNUJcdUZGNjJcdTAwQTNcdTAwQTVcdUZGMDRcdUZGRTFcdUZGRTUrXHVGRjBCJ1xuXHQpKSxcblx0d29yZFdyYXBDb2x1bW46IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwQ29sdW1uLCAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdDgwLCAxLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHR7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICd3b3JkV3JhcENvbHVtbicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnLSBgZWRpdG9yLndvcmRXcmFwYCByZWZlcnMgdG8gYSBkaWZmZXJlbnQgc2V0dGluZyBhbmQgc2hvdWxkIG5vdCBiZSBsb2NhbGl6ZWQuJyxcblx0XHRcdFx0XHQnLSBcXCd3b3JkV3JhcENvbHVtblxcJyBhbmQgXFwnYm91bmRlZFxcJyByZWZlciB0byB2YWx1ZXMgdGhlIGRpZmZlcmVudCBzZXR0aW5nIGNhbiB0YWtlIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiQ29udHJvbHMgdGhlIHdyYXBwaW5nIGNvbHVtbiBvZiB0aGUgZWRpdG9yIHdoZW4gYCNlZGl0b3Iud29yZFdyYXAjYCBpcyBgd29yZFdyYXBDb2x1bW5gIG9yIGBib3VuZGVkYC5cIilcblx0XHR9XG5cdCkpLFxuXHR3b3JkV3JhcE92ZXJyaWRlMTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwT3ZlcnJpZGUxLCAnd29yZFdyYXBPdmVycmlkZTEnLFxuXHRcdCdpbmhlcml0JyBhcyAnb2ZmJyB8ICdvbicgfCAnaW5oZXJpdCcsXG5cdFx0WydvZmYnLCAnb24nLCAnaW5oZXJpdCddIGFzIGNvbnN0XG5cdCkpLFxuXHR3b3JkV3JhcE92ZXJyaWRlMjogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLndvcmRXcmFwT3ZlcnJpZGUyLCAnd29yZFdyYXBPdmVycmlkZTInLFxuXHRcdCdpbmhlcml0JyBhcyAnb2ZmJyB8ICdvbicgfCAnaW5oZXJpdCcsXG5cdFx0WydvZmYnLCAnb24nLCAnaW5oZXJpdCddIGFzIGNvbnN0XG5cdCkpLFxuXHR3cmFwT25Fc2NhcGVkTGluZUZlZWRzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud3JhcE9uRXNjYXBlZExpbmVGZWVkcywgJ3dyYXBPbkVzY2FwZWRMaW5lRmVlZHMnLCBmYWxzZSxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd3JhcE9uRXNjYXBlZExpbmVGZWVkcycsIFwiQ29udHJvbHMgd2hldGhlciBsaXRlcmFsIGBcXFxcbmAgc2hhbGwgdHJpZ2dlciBhIHdvcmRXcmFwIHdoZW4gYCNlZGl0b3Iud29yZFdyYXAjYCBpcyBlbmFibGVkLlxcblxcbkZvciBleGFtcGxlOlxcbmBgYGNcXG5jaGFyKiBzdHI9XFxcImhlbGxvXFxcXG53b3JsZFxcXCJcXG5gYGBcXG53aWxsIGJlIGRpc3BsYXllZCBhc1xcbmBgYGNcXG5jaGFyKiBzdHI9XFxcImhlbGxvXFxcXG5cXG4gICAgICAgICAgIHdvcmxkXFxcIlxcbmBgYFwiKSB9XG5cdCkpLFxuXG5cdC8vIExlYXZlIHRoZXNlIGF0IHRoZSBlbmQgKGJlY2F1c2UgdGhleSBoYXZlIGRlcGVuZGVuY2llcyEpXG5cdGVmZmVjdGl2ZUN1cnNvclN0eWxlOiByZWdpc3RlcihuZXcgRWZmZWN0aXZlQ3Vyc29yU3R5bGUoKSksXG5cdGVkaXRvckNsYXNzTmFtZTogcmVnaXN0ZXIobmV3IEVkaXRvckNsYXNzTmFtZSgpKSxcblx0ZGVmYXVsdENvbG9yRGVjb3JhdG9yczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRlZmF1bHRDb2xvckRlY29yYXRvcnMsICdkZWZhdWx0Q29sb3JEZWNvcmF0b3JzJywgJ2F1dG8nIGFzICdhdXRvJyB8ICdhbHdheXMnIHwgJ25ldmVyJyxcblx0XHRbJ2F1dG8nLCAnYWx3YXlzJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5kZWZhdWx0Q29sb3JEZWNvcmF0b3JzLmF1dG8nLCBcIlNob3cgZGVmYXVsdCBjb2xvciBkZWNvcmF0b3JzIG9ubHkgd2hlbiBubyBleHRlbnNpb24gcHJvdmlkZXMgY29sb3JzIGRlY29yYXRvcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5kZWZhdWx0Q29sb3JEZWNvcmF0b3JzLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgZGVmYXVsdCBjb2xvciBkZWNvcmF0b3JzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZGVmYXVsdENvbG9yRGVjb3JhdG9ycy5uZXZlcicsIFwiTmV2ZXIgc2hvdyBkZWZhdWx0IGNvbG9yIGRlY29yYXRvcnMuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlZmF1bHRDb2xvckRlY29yYXRvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW5saW5lIGNvbG9yIGRlY29yYXRpb25zIHNob3VsZCBiZSBzaG93biB1c2luZyB0aGUgZGVmYXVsdCBkb2N1bWVudCBjb2xvciBwcm92aWRlci5cIilcblx0XHR9XG5cdCkpLFxuXHRwaXhlbFJhdGlvOiByZWdpc3RlcihuZXcgRWRpdG9yUGl4ZWxSYXRpbygpKSxcblx0dGFiRm9jdXNNb2RlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihFZGl0b3JPcHRpb24udGFiRm9jdXNNb2RlLCAndGFiRm9jdXNNb2RlJywgZmFsc2UsXG5cdFx0eyBtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3RhYkZvY3VzTW9kZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHJlY2VpdmVzIHRhYnMgb3IgZGVmZXJzIHRoZW0gdG8gdGhlIHdvcmtiZW5jaCBmb3IgbmF2aWdhdGlvbi5cIikgfVxuXHQpKSxcblx0bGF5b3V0SW5mbzogcmVnaXN0ZXIobmV3IEVkaXRvckxheW91dEluZm9Db21wdXRlcigpKSxcblx0d3JhcHBpbmdJbmZvOiByZWdpc3RlcihuZXcgRWRpdG9yV3JhcHBpbmdJbmZvQ29tcHV0ZXIoKSksXG5cdHdyYXBwaW5nSW5kZW50OiByZWdpc3RlcihuZXcgV3JhcHBpbmdJbmRlbnRPcHRpb24oKSksXG5cdHdyYXBwaW5nU3RyYXRlZ3k6IHJlZ2lzdGVyKG5ldyBXcmFwcGluZ1N0cmF0ZWd5KCkpLFxuXHRlZmZlY3RpdmVFZGl0Q29udGV4dEVuYWJsZWQ6IHJlZ2lzdGVyKG5ldyBFZmZlY3RpdmVFZGl0Q29udGV4dEVuYWJsZWQoKSksXG5cdGVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250czogcmVnaXN0ZXIobmV3IEVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250cygpKVxufTtcblxudHlwZSBFZGl0b3JPcHRpb25zVHlwZSA9IHR5cGVvZiBFZGl0b3JPcHRpb25zO1xudHlwZSBGaW5kRWRpdG9yT3B0aW9uc0tleUJ5SWQ8VCBleHRlbmRzIEVkaXRvck9wdGlvbj4gPSB7IFtLIGluIGtleW9mIEVkaXRvck9wdGlvbnNUeXBlXTogRWRpdG9yT3B0aW9uc1R5cGVbS11bJ2lkJ10gZXh0ZW5kcyBUID8gSyA6IG5ldmVyIH1ba2V5b2YgRWRpdG9yT3B0aW9uc1R5cGVdO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbnR5cGUgQ29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZTxUIGV4dGVuZHMgSUVkaXRvck9wdGlvbjxhbnksIGFueT4+ID0gVCBleHRlbmRzIElFZGl0b3JPcHRpb248YW55LCBpbmZlciBSPiA/IFIgOiBuZXZlcjtcbmV4cG9ydCB0eXBlIEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPiA9IE5vbk51bGxhYmxlPENvbXB1dGVkRWRpdG9yT3B0aW9uVmFsdWU8RWRpdG9yT3B0aW9uc1R5cGVbRmluZEVkaXRvck9wdGlvbnNLZXlCeUlkPFQ+XT4+O1xuXG5leHBvcnQgdHlwZSBNb3VzZU1pZGRsZUNsaWNrQWN0aW9uID0gJ2RlZmF1bHQnIHwgJ29wZW5MaW5rJyB8ICdjdHJsTGVmdENsaWNrJztcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUd4QixZQUFZLGFBQWE7QUFDekIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsc0JBQXNCLG9CQUFvQiwwQkFBMEIsZ0JBQWdCO0FBQzdGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQXlCOUIsSUFBVywyQkFBWCxrQkFBV0EsOEJBQVg7QUFDTixFQUFBQSxvREFBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSxvREFBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSxvREFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxvREFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxvREFBQSxVQUFPLEtBQVA7QUFMaUIsU0FBQUE7QUFBQSxHQUFBO0FBc3pCWCxNQUFNLHVCQUF1QjtBQW9LN0IsTUFBTSwwQkFBMEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUt0QyxZQUFZLFFBQW1CO0FBQzlCLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFDTyxXQUFXLElBQTJCO0FBQzVDLFdBQU8sS0FBSyxRQUFRLEVBQUU7QUFBQSxFQUN2QjtBQUNEO0FBbUNPLE1BQU0scUJBQXFCO0FBQUEsRUFNakMsY0FBYztBQUNiLFNBQUssMkJBQTJCO0FBQ2hDLFNBQUssMkJBQTJCO0FBQ2hDLFNBQUssMEJBQTBCO0FBQUEsRUFDaEM7QUFDRDtBQXFDQSxNQUFlLGlCQUE4RTtBQUFBLEVBTzVGLFlBQVksSUFBTyxNQUEwQixjQUFpQixRQUEwRjtBQUN2SixTQUFLLEtBQUs7QUFDVixTQUFLLE9BQU87QUFDWixTQUFLLGVBQWU7QUFDcEIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRU8sWUFBWSxPQUFzQixRQUFpQztBQUN6RSxXQUFPLFlBQVksT0FBTyxNQUFNO0FBQUEsRUFDakM7QUFBQSxFQUlPLFFBQVEsS0FBNEIsU0FBaUMsT0FBYTtBQUN4RixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sTUFBTSxrQkFBcUI7QUFBQSxFQUNqQyxZQUNpQixVQUNBLFdBQ2Y7QUFGZTtBQUNBO0FBQUEsRUFDYjtBQUNMO0FBRUEsU0FBUyxZQUFlLE9BQXNCLFFBQWlDO0FBQzlFLE1BQUksT0FBTyxVQUFVLFlBQVksT0FBTyxXQUFXLFlBQVksQ0FBQyxTQUFTLENBQUMsUUFBUTtBQUNqRixXQUFPLElBQUksa0JBQWtCLFFBQVEsVUFBVSxNQUFNO0FBQUEsRUFDdEQ7QUFDQSxNQUFJLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxRQUFRLE1BQU0sR0FBRztBQUNsRCxVQUFNLGNBQWMsTUFBTSxRQUFRLEtBQUssS0FBSyxNQUFNLFFBQVEsTUFBTSxLQUFLLE9BQU8sT0FBTyxPQUFPLE1BQU07QUFDaEcsV0FBTyxJQUFJLGtCQUFrQixRQUFRLENBQUMsV0FBVztBQUFBLEVBQ2xEO0FBQ0EsTUFBSSxZQUFZO0FBQ2hCLGFBQVcsT0FBTyxRQUFRO0FBQ3pCLFFBQUksT0FBTyxlQUFlLEdBQUcsR0FBRztBQUMvQixZQUFNLFNBQVMsWUFBWSxNQUFNLEdBQUcsR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUNsRCxVQUFJLE9BQU8sV0FBVztBQUNyQixjQUFNLEdBQUcsSUFBSSxPQUFPO0FBQ3BCLG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTyxJQUFJLGtCQUFrQixPQUFPLFNBQVM7QUFDOUM7QUFLQSxNQUFlLHFCQUErRTtBQUFBLEVBTzdGLFlBQVksSUFBTyxjQUFpQjtBQUZwQyxTQUFnQixTQUFtRDtBQUdsRSxTQUFLLEtBQUs7QUFDVixTQUFLLE9BQU87QUFDWixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRU8sWUFBWSxPQUFzQixRQUFpQztBQUN6RSxXQUFPLFlBQVksT0FBTyxNQUFNO0FBQUEsRUFDakM7QUFBQSxFQUVPLFNBQVMsT0FBbUI7QUFDbEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUdEO0FBRUEsTUFBZSxtQkFBNkU7QUFBQSxFQU8zRixZQUFZLElBQU8sTUFBMEIsY0FBaUIsUUFBdUM7QUFDcEcsU0FBSyxLQUFLO0FBQ1YsU0FBSyxPQUFPO0FBQ1osU0FBSyxlQUFlO0FBQ3BCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVPLFlBQVksT0FBc0IsUUFBaUM7QUFDekUsV0FBTyxZQUFZLE9BQU8sTUFBTTtBQUFBLEVBQ2pDO0FBQUEsRUFJTyxRQUFRLEtBQTRCLFNBQWlDLE9BQWE7QUFDeEYsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUtPLFNBQVMsUUFBUSxPQUFnQixjQUFnQztBQUN2RSxNQUFJLE9BQU8sVUFBVSxhQUFhO0FBQ2pDLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxVQUFVLFNBQVM7QUFFdEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLFFBQVEsS0FBSztBQUNyQjtBQUVBLE1BQU0sNEJBQW9ELG1CQUErQjtBQUFBLEVBRXhGLFlBQVksSUFBTyxNQUFnQyxjQUF1QixTQUFtRCxRQUFXO0FBQ3ZJLFFBQUksT0FBTyxXQUFXLGFBQWE7QUFDbEMsYUFBTyxPQUFPO0FBQ2QsYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLElBQUksTUFBTSxjQUFjLE1BQU07QUFBQSxFQUNyQztBQUFBLEVBRWdCLFNBQVMsT0FBeUI7QUFDakQsV0FBTyxRQUFRLE9BQU8sS0FBSyxZQUFZO0FBQUEsRUFDeEM7QUFDRDtBQUtPLFNBQVMsV0FBdUIsT0FBZ0IsY0FBaUIsU0FBaUIsU0FBNkI7QUFDckgsTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixZQUFRLFNBQVMsT0FBTyxFQUFFO0FBQUEsRUFDM0I7QUFDQSxNQUFJLE9BQU8sVUFBVSxZQUFZLE1BQU0sS0FBSyxHQUFHO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxJQUFJO0FBQ1IsTUFBSSxLQUFLLElBQUksU0FBUyxDQUFDO0FBQ3ZCLE1BQUksS0FBSyxJQUFJLFNBQVMsQ0FBQztBQUN2QixTQUFPLElBQUk7QUFDWjtBQUVBLE1BQU0sd0JBQWdELG1CQUE4QjtBQUFBLEVBRW5GLE9BQWMsV0FBYyxPQUFnQixjQUFpQixTQUFpQixTQUE2QjtBQUMxRyxXQUFPLFdBQVcsT0FBTyxjQUFjLFNBQVMsT0FBTztBQUFBLEVBQ3hEO0FBQUEsRUFLQSxZQUFZLElBQU8sTUFBK0IsY0FBc0IsU0FBaUIsU0FBaUIsU0FBbUQsUUFBVztBQUN2SyxRQUFJLE9BQU8sV0FBVyxhQUFhO0FBQ2xDLGFBQU8sT0FBTztBQUNkLGFBQU8sVUFBVTtBQUNqQixhQUFPLFVBQVU7QUFDakIsYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLElBQUksTUFBTSxjQUFjLE1BQU07QUFDcEMsU0FBSyxVQUFVO0FBQ2YsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVnQixTQUFTLE9BQXdCO0FBQ2hELFdBQU8sZ0JBQWdCLFdBQVcsT0FBTyxLQUFLLGNBQWMsS0FBSyxTQUFTLEtBQUssT0FBTztBQUFBLEVBQ3ZGO0FBQ0Q7QUFJTyxTQUFTLGFBQStCLE9BQWdCLGNBQWlCLFNBQWlCLFNBQTZCO0FBQzdILE1BQUksT0FBTyxVQUFVLGFBQWE7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLElBQUksa0JBQWtCLE1BQU0sT0FBTyxZQUFZO0FBQ3JELFNBQU8sa0JBQWtCLE1BQU0sR0FBRyxTQUFTLE9BQU87QUFDbkQ7QUFFQSxNQUFNLDBCQUFrRCxtQkFBOEI7QUFBQSxFQUtyRixPQUFjLE1BQU0sR0FBVyxLQUFhLEtBQXFCO0FBQ2hFLFFBQUksSUFBSSxLQUFLO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLElBQUksS0FBSztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWMsTUFBTSxPQUFnQixjQUE4QjtBQUNqRSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGNBQVEsV0FBVyxLQUFLO0FBQUEsSUFDekI7QUFDQSxRQUFJLE9BQU8sVUFBVSxZQUFZLE1BQU0sS0FBSyxHQUFHO0FBQzlDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUlBLFlBQVksSUFBTyxNQUErQixjQUFzQixjQUF5QyxRQUF1QyxTQUFrQixTQUFrQjtBQUMzTCxRQUFJLE9BQU8sV0FBVyxhQUFhO0FBQ2xDLGFBQU8sT0FBTztBQUNkLGFBQU8sVUFBVTtBQUNqQixhQUFPLFVBQVU7QUFDakIsYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLElBQUksTUFBTSxjQUFjLE1BQU07QUFDcEMsU0FBSyxlQUFlO0FBQ3BCLFNBQUssVUFBVTtBQUNmLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFZ0IsU0FBUyxPQUF3QjtBQUNoRCxXQUFPLEtBQUssYUFBYSxrQkFBa0IsTUFBTSxPQUFPLEtBQUssWUFBWSxDQUFDO0FBQUEsRUFDM0U7QUFDRDtBQUVBLE1BQU0sMkJBQW1ELG1CQUE4QjtBQUFBLEVBRXRGLE9BQWMsT0FBTyxPQUFnQixjQUE4QjtBQUNsRSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFlBQVksSUFBTyxNQUErQixjQUFzQixTQUFtRCxRQUFXO0FBQ3JJLFFBQUksT0FBTyxXQUFXLGFBQWE7QUFDbEMsYUFBTyxPQUFPO0FBQ2QsYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLElBQUksTUFBTSxjQUFjLE1BQU07QUFBQSxFQUNyQztBQUFBLEVBRWdCLFNBQVMsT0FBd0I7QUFDaEQsV0FBTyxtQkFBbUIsT0FBTyxPQUFPLEtBQUssWUFBWTtBQUFBLEVBQzFEO0FBQ0Q7QUFLTyxTQUFTLFVBQTRCLE9BQWdCLGNBQWlCLGVBQWlDLGVBQXNDO0FBQ25KLE1BQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLGlCQUFpQixTQUFTLGVBQWU7QUFDNUMsV0FBTyxjQUFjLEtBQUs7QUFBQSxFQUMzQjtBQUNBLE1BQUksY0FBYyxRQUFRLEtBQVUsTUFBTSxJQUFJO0FBQzdDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBRUEsTUFBTSwrQkFBeUUsbUJBQXlCO0FBQUEsRUFJdkcsWUFBWSxJQUFPLE1BQTBCLGNBQWlCLGVBQWlDLFNBQW1ELFFBQVc7QUFDNUosUUFBSSxPQUFPLFdBQVcsYUFBYTtBQUNsQyxhQUFPLE9BQU87QUFDZCxhQUFPLE9BQU8sY0FBYyxNQUFNLENBQUM7QUFDbkMsYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLElBQUksTUFBTSxjQUFjLE1BQU07QUFDcEMsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBRWdCLFNBQVMsT0FBbUI7QUFDM0MsV0FBTyxVQUFhLE9BQU8sS0FBSyxjQUFjLEtBQUssY0FBYztBQUFBLEVBQ2xFO0FBQ0Q7QUFFQSxNQUFNLHlCQUFzRSxpQkFBMEI7QUFBQSxFQUtyRyxZQUFZLElBQU8sTUFBMEIsY0FBaUIsb0JBQTRCLGVBQW9CLFNBQTBCLFNBQW1ELFFBQVc7QUFDck0sUUFBSSxPQUFPLFdBQVcsYUFBYTtBQUNsQyxhQUFPLE9BQU87QUFDZCxhQUFPLE9BQU87QUFDZCxhQUFPLFVBQVU7QUFBQSxJQUNsQjtBQUNBLFVBQU0sSUFBSSxNQUFNLGNBQWMsTUFBTTtBQUNwQyxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRU8sU0FBUyxPQUFtQjtBQUNsQyxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLEtBQUssZUFBZSxRQUFXLEtBQUssTUFBTSxJQUFJO0FBQ2pELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUssU0FBWSxLQUFLO0FBQUEsRUFDOUI7QUFDRDtBQU1BLFNBQVMsc0JBQXNCLFlBQTBGO0FBQ3hILFVBQVEsWUFBWTtBQUFBLElBQ25CLEtBQUs7QUFBUSxhQUFPO0FBQUEsSUFDcEIsS0FBSztBQUFRLGFBQU87QUFBQSxJQUNwQixLQUFLO0FBQVksYUFBTztBQUFBLElBQ3hCLEtBQUs7QUFBWSxhQUFPO0FBQUEsSUFDeEIsS0FBSztBQUFRLGFBQU87QUFBQSxFQUNyQjtBQUNEO0FBTUEsTUFBTSxtQ0FBbUMsaUJBQWlHO0FBQUEsRUFFekksY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQW1DO0FBQUEsTUFBd0IscUJBQXFCO0FBQUEsTUFDaEY7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLE1BQU0sQ0FBQyxRQUFRLE1BQU0sS0FBSztBQUFBLFFBQzFCLGtCQUFrQjtBQUFBLFVBQ2pCLElBQUksU0FBUyw2QkFBNkIsK0RBQStEO0FBQUEsVUFDekcsSUFBSSxTQUFTLDJCQUEyQiwwQ0FBMEM7QUFBQSxVQUNsRixJQUFJLFNBQVMsNEJBQTRCLHlDQUF5QztBQUFBLFFBQ25GO0FBQUEsUUFDQSxTQUFTO0FBQUEsUUFDVCxNQUFNLENBQUMsZUFBZTtBQUFBLFFBQ3RCLGFBQWEsSUFBSSxTQUFTLHdCQUF3QixtRkFBbUY7QUFBQSxNQUN0STtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLE9BQXNDO0FBQ3JELFlBQVEsT0FBTztBQUFBLE1BQ2QsS0FBSztBQUFRLGVBQU8scUJBQXFCO0FBQUEsTUFDekMsS0FBSztBQUFPLGVBQU8scUJBQXFCO0FBQUEsTUFDeEMsS0FBSztBQUFNLGVBQU8scUJBQXFCO0FBQUEsSUFDeEM7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFZ0IsUUFBUSxLQUE0QixTQUFpQyxPQUFtRDtBQUN2SSxRQUFJLFVBQVUscUJBQXFCLFNBQVM7QUFFM0MsYUFBTyxJQUFJO0FBQUEsSUFDWjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUEyQkEsTUFBTSx1QkFBdUIsaUJBQXVGO0FBQUEsRUFFbkgsY0FBYztBQUNiLFVBQU0sV0FBa0M7QUFBQSxNQUN2QyxhQUFhO0FBQUEsTUFDYixrQkFBa0I7QUFBQSxJQUNuQjtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQXVCO0FBQUEsTUFBWTtBQUFBLE1BQ25DO0FBQUEsUUFDQywrQkFBK0I7QUFBQSxVQUM5QixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx3QkFBd0IsaUVBQWlFO0FBQUEsUUFDcEg7QUFBQSxRQUNBLG9DQUFvQztBQUFBLFVBQ25DLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDZCQUE2QixpR0FBaUc7QUFBQSxRQUN6SjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxRQUF3QztBQUN2RCxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sYUFBYSxRQUFRLE1BQU0sYUFBYSxLQUFLLGFBQWEsV0FBVztBQUFBLE1BQ3JFLGtCQUFrQixRQUFRLE1BQU0sa0JBQWtCLEtBQUssYUFBYSxnQkFBZ0I7QUFBQSxJQUNyRjtBQUFBLEVBQ0Q7QUFDRDtBQVNPLElBQVcsZ0NBQVgsa0JBQVdDLG1DQUFYO0FBSU4sRUFBQUEsOERBQUEsWUFBUyxLQUFUO0FBSUEsRUFBQUEsOERBQUEsV0FBUSxLQUFSO0FBSUEsRUFBQUEsOERBQUEsWUFBUyxLQUFUO0FBSUEsRUFBQUEsOERBQUEsV0FBUSxLQUFSO0FBSUEsRUFBQUEsOERBQUEsWUFBUyxLQUFUO0FBSUEsRUFBQUEsOERBQUEsV0FBUSxLQUFSO0FBeEJpQixTQUFBQTtBQUFBLEdBQUE7QUE4QlgsU0FBUyw4QkFBOEIscUJBQXVHO0FBQ3BKLFVBQVEscUJBQXFCO0FBQUEsSUFDNUIsS0FBSztBQUFTLGFBQU87QUFBQSxJQUNyQixLQUFLO0FBQVUsYUFBTztBQUFBLElBQ3RCLEtBQUs7QUFBUyxhQUFPO0FBQUEsSUFDckIsS0FBSztBQUFVLGFBQU87QUFBQSxJQUN0QixLQUFLO0FBQVMsYUFBTztBQUFBLEVBQ3RCO0FBQ0Q7QUFTTyxJQUFLLHdCQUFMLGtCQUFLQywyQkFBTDtBQUlOLEVBQUFBLDhDQUFBLFVBQU8sS0FBUDtBQUlBLEVBQUFBLDhDQUFBLFdBQVEsS0FBUjtBQUlBLEVBQUFBLDhDQUFBLGVBQVksS0FBWjtBQUlBLEVBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUlBLEVBQUFBLDhDQUFBLGtCQUFlLEtBQWY7QUFJQSxFQUFBQSw4Q0FBQSxtQkFBZ0IsS0FBaEI7QUF4QlcsU0FBQUE7QUFBQSxHQUFBO0FBOEJMLFNBQVMsb0JBQW9CLGFBQXVIO0FBQzFKLFVBQVEsYUFBYTtBQUFBLElBQ3BCLEtBQUs7QUFBNEIsYUFBTztBQUFBLElBQ3hDLEtBQUs7QUFBNkIsYUFBTztBQUFBLElBQ3pDLEtBQUs7QUFBaUMsYUFBTztBQUFBLElBQzdDLEtBQUs7QUFBZ0MsYUFBTztBQUFBLElBQzVDLEtBQUs7QUFBb0MsYUFBTztBQUFBLElBQ2hELEtBQUs7QUFBcUMsYUFBTztBQUFBLEVBQ2xEO0FBQ0Q7QUFLTyxTQUFTLHNCQUFzQixhQUF1SDtBQUM1SixVQUFRLGFBQWE7QUFBQSxJQUNwQixLQUFLO0FBQVEsYUFBTztBQUFBLElBQ3BCLEtBQUs7QUFBUyxhQUFPO0FBQUEsSUFDckIsS0FBSztBQUFhLGFBQU87QUFBQSxJQUN6QixLQUFLO0FBQWEsYUFBTztBQUFBLElBQ3pCLEtBQUs7QUFBaUIsYUFBTztBQUFBLElBQzdCLEtBQUs7QUFBa0IsYUFBTztBQUFBLEVBQy9CO0FBQ0Q7QUFNQSxNQUFNLHdCQUF3QixxQkFBMkQ7QUFBQSxFQUV4RixjQUFjO0FBQ2IsVUFBTSwyQkFBOEIsRUFBRTtBQUFBLEVBQ3ZDO0FBQUEsRUFFTyxRQUFRLEtBQTRCLFNBQWlDLEdBQW1CO0FBQzlGLFVBQU0sYUFBYSxDQUFDLGVBQWU7QUFDbkMsUUFBSSxRQUFRLElBQUksNkJBQWlDLEdBQUc7QUFDbkQsaUJBQVcsS0FBSyxRQUFRLElBQUksNkJBQWlDLENBQUM7QUFBQSxJQUMvRDtBQUNBLFFBQUksSUFBSSxzQkFBc0I7QUFDN0IsaUJBQVcsS0FBSyxJQUFJLG9CQUFvQjtBQUFBLElBQ3pDO0FBQ0EsUUFBSSxRQUFRLElBQUksbUJBQXVCLE1BQU0sV0FBVztBQUN2RCxpQkFBVyxLQUFLLGVBQWU7QUFBQSxJQUNoQyxXQUFXLFFBQVEsSUFBSSxtQkFBdUIsTUFBTSxRQUFRO0FBQzNELGlCQUFXLEtBQUssWUFBWTtBQUFBLElBQzdCO0FBRUEsUUFBSSxRQUFRLElBQUksb0JBQXVCLEdBQUc7QUFDekMsaUJBQVcsS0FBSyxZQUFZO0FBQUEsSUFDN0I7QUFFQSxRQUFJLFFBQVEsSUFBSSx3QkFBMkIsR0FBRztBQUM3QyxpQkFBVyxLQUFLLGdCQUFnQjtBQUFBLElBQ2pDO0FBRUEsV0FBTyxXQUFXLEtBQUssR0FBRztBQUFBLEVBQzNCO0FBQ0Q7QUFNQSxNQUFNLHNDQUFzQyxvQkFBMEQ7QUFBQSxFQUVyRyxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsTUFBc0M7QUFBQSxNQUEyQjtBQUFBLE1BQ2pFLEVBQUUsYUFBYSxJQUFJLFNBQVMsMkJBQTJCLHVFQUF1RSxFQUFFO0FBQUEsSUFDakk7QUFBQSxFQUNEO0FBQUEsRUFFZ0IsUUFBUSxLQUE0QixTQUFpQyxPQUF5QjtBQUM3RyxXQUFPLFNBQVMsSUFBSTtBQUFBLEVBQ3JCO0FBQ0Q7QUE0REEsTUFBTSxtQkFBbUIsaUJBQTJFO0FBQUEsRUFFbkcsY0FBYztBQUNiLFVBQU0sV0FBOEI7QUFBQSxNQUNuQyxrQkFBa0I7QUFBQSxNQUNsQixZQUFZO0FBQUEsTUFDWiwrQkFBK0I7QUFBQSxNQUMvQixxQkFBcUI7QUFBQSxNQUNyQixxQkFBcUI7QUFBQSxNQUNyQixvQkFBb0I7QUFBQSxNQUNwQixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsTUFDZixTQUFTO0FBQUEsTUFDVCxnQkFBZ0I7QUFBQSxJQUNqQjtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQW1CO0FBQUEsTUFBUTtBQUFBLE1BQzNCO0FBQUEsUUFDQyxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx5QkFBeUIsdUVBQXVFO0FBQUEsUUFDM0g7QUFBQSxRQUNBLDZDQUE2QztBQUFBLFVBQzVDLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxTQUFTLFVBQVUsV0FBVztBQUFBLFVBQ3JDLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyxtREFBbUQscURBQXFEO0FBQUEsWUFDckgsSUFBSSxTQUFTLG9EQUFvRCx5RkFBeUY7QUFBQSxZQUMxSixJQUFJLFNBQVMsdURBQXVELG9EQUFvRDtBQUFBLFVBQ3pIO0FBQUEsVUFDQSxhQUFhLElBQUksU0FBUyxzQ0FBc0MsNEZBQTRGO0FBQUEsUUFDN0o7QUFBQSxRQUNBLG1DQUFtQztBQUFBLFVBQ2xDLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxTQUFTLFVBQVUsV0FBVztBQUFBLFVBQ3JDLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyx5Q0FBeUMsMERBQTBEO0FBQUEsWUFDaEgsSUFBSSxTQUFTLDBDQUEwQyxpREFBaUQ7QUFBQSxZQUN4RyxJQUFJLFNBQVMsNkNBQTZDLHNGQUFzRjtBQUFBLFVBQ2pKO0FBQUEsVUFDQSxhQUFhLElBQUksU0FBUyw0QkFBNEIsd0VBQXdFO0FBQUEsUUFDL0g7QUFBQSxRQUNBLG1DQUFtQztBQUFBLFVBQ2xDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDRCQUE0Qiw0RkFBNEY7QUFBQSxVQUNsSixVQUFVLFNBQVM7QUFBQSxRQUNwQjtBQUFBLFFBQ0Esa0NBQWtDO0FBQUEsVUFDakMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsMkJBQTJCLGdLQUFnSztBQUFBLFFBQ3ROO0FBQUEsUUFDQSxvQkFBb0I7QUFBQSxVQUNuQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxhQUFhLDBIQUEwSDtBQUFBLFFBQ2xLO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxzQkFBc0Isc0dBQXNHO0FBQUEsUUFDdko7QUFBQSxRQUNBLHVCQUF1QjtBQUFBLFVBQ3RCLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUMzQixTQUFTO0FBQUEsVUFDVCxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsNkJBQTZCLG1EQUFtRDtBQUFBLFlBQzdGLElBQUksU0FBUyxpQ0FBaUMsa0RBQWtEO0FBQUEsVUFDakc7QUFBQSxVQUNBLGFBQWEsSUFBSSxTQUFTLGdCQUFnQix1REFBdUQ7QUFBQSxRQUNsRztBQUFBLFFBQ0EsOEJBQThCO0FBQUEsVUFDN0IsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLFNBQVMsV0FBVztBQUFBLFVBQzNCLFNBQVM7QUFBQSxVQUNULGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyxvQ0FBb0MsK0NBQStDO0FBQUEsWUFDaEcsSUFBSSxTQUFTLHdDQUF3QyxtREFBbUQ7QUFBQSxVQUN6RztBQUFBLFVBQ0EsYUFBYSxJQUFJLFNBQVMsdUJBQXVCLDBEQUEwRDtBQUFBLFFBQzVHO0FBQUEsUUFDQSwwQkFBMEI7QUFBQSxVQUN6QixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxtQkFBbUIsNkRBQTZEO0FBQUEsUUFDM0c7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsUUFBb0M7QUFDbkQsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUNkLFdBQU87QUFBQSxNQUNOLGtCQUFrQixRQUFRLE1BQU0sa0JBQWtCLEtBQUssYUFBYSxnQkFBZ0I7QUFBQSxNQUNwRixZQUFZLFFBQVEsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDbEUsK0JBQStCLE9BQU8sTUFBTSxrQ0FBa0MsWUFDMUUsTUFBTSxnQ0FBZ0MsV0FBVyxVQUNsRCxVQUE0QyxNQUFNLCtCQUErQixLQUFLLGFBQWEsK0JBQStCLENBQUMsU0FBUyxVQUFVLFdBQVcsQ0FBQztBQUFBLE1BQ3JLLHFCQUFxQixPQUFPLE1BQU0sd0JBQXdCLFlBQ3RELE1BQU0sc0JBQXNCLFdBQVcsVUFDeEMsVUFBNEMsTUFBTSxxQkFBcUIsS0FBSyxhQUFhLHFCQUFxQixDQUFDLFNBQVMsVUFBVSxXQUFXLENBQUM7QUFBQSxNQUNqSixxQkFBcUIsUUFBUSxNQUFNLHFCQUFxQixLQUFLLGFBQWEsbUJBQW1CO0FBQUEsTUFDN0Ysb0JBQW9CLFFBQVEsTUFBTSxvQkFBb0IsS0FBSyxhQUFhLGtCQUFrQjtBQUFBLE1BQzFGLE1BQU0sUUFBUSxNQUFNLE1BQU0sS0FBSyxhQUFhLElBQUk7QUFBQSxNQUNoRCxlQUFlLFFBQVEsTUFBTSxlQUFlLEtBQUssYUFBYSxhQUFhO0FBQUEsTUFDM0UsU0FBUyxVQUFpQyxNQUFNLFNBQVMsS0FBSyxhQUFhLFNBQVMsQ0FBQyxTQUFTLFdBQVcsQ0FBQztBQUFBLE1BQzFHLGdCQUFnQixVQUFpQyxNQUFNLGdCQUFnQixLQUFLLGFBQWEsZ0JBQWdCLENBQUMsU0FBUyxXQUFXLENBQUM7QUFBQSxJQUNoSTtBQUFBLEVBQ0Q7QUFDRDtBQVNPLE1BQU0sdUJBQU4sTUFBTSw2QkFBNEIsaUJBQXVFO0FBQUEsRUFLL0csY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQTRCO0FBQUEsTUFBaUIscUJBQW9CO0FBQUEsTUFDakU7QUFBQSxRQUNDLE9BQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyxpQkFBaUIsa0tBQWtLO0FBQUEsVUFDOU07QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyx1QkFBdUIsNEhBQTRIO0FBQUEsVUFDOUs7QUFBQSxRQUNEO0FBQUEsUUFDQSxhQUFhLElBQUksU0FBUyx3QkFBd0Isd0tBQXdLO0FBQUEsUUFDMU4sU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxPQUF3QjtBQUN2QyxRQUFJLE9BQU8sVUFBVSxhQUFhO0FBQ2pDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFVBQUksVUFBVSxXQUFXLE1BQU0sV0FBVyxHQUFHO0FBQzVDLGVBQU8scUJBQW9CO0FBQUEsTUFDNUI7QUFDQSxVQUFJLFVBQVUsUUFBUTtBQUNyQixlQUFPLHFCQUFvQjtBQUFBLE1BQzVCO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFFBQVEsS0FBSyxHQUFHO0FBQ25CLGFBQU8scUJBQW9CO0FBQUEsSUFDNUI7QUFDQSxXQUFPLHFCQUFvQjtBQUFBLEVBQzVCO0FBQ0Q7QUEzQ2EscUJBRUUsTUFBTTtBQUZSLHFCQUdFLEtBQUs7QUFIYixJQUFNLHNCQUFOO0FBb0RBLE1BQU0sd0JBQU4sTUFBTSw4QkFBNkIsaUJBQXdFO0FBQUEsRUFPakgsY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQTZCO0FBQUEsTUFBa0Isc0JBQXFCO0FBQUEsTUFDcEU7QUFBQSxRQUNDLE9BQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyxrQkFBa0IsK0tBQStLO0FBQUEsVUFDNU47QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyx5QkFBeUIseUpBQXlKO0FBQUEsVUFDN007QUFBQSxRQUNEO0FBQUEsUUFDQSxhQUFhLElBQUksU0FBUyx5QkFBeUIsNE1BQTRNO0FBQUEsUUFDL1AsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxPQUF3QjtBQUN2QyxRQUFJLE9BQU8sVUFBVSxhQUFhO0FBQ2pDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFVBQUksVUFBVSxTQUFTO0FBQ3RCLGVBQU8sc0JBQXFCO0FBQUEsTUFDN0I7QUFDQSxVQUFJLFVBQVUsUUFBUTtBQUNyQixlQUFPLHNCQUFxQjtBQUFBLE1BQzdCO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFFBQVEsS0FBSyxHQUFHO0FBQ25CLGFBQU8sc0JBQXFCO0FBQUEsSUFDN0I7QUFDQSxXQUFPLHNCQUFxQjtBQUFBLEVBQzdCO0FBQUEsRUFFZ0IsUUFBUSxLQUE0QixTQUFpQyxPQUF1QjtBQUczRyxXQUFPLElBQUksU0FBUztBQUFBLEVBQ3JCO0FBQ0Q7QUFBQTtBQW5EYSxzQkFFRSxNQUFNO0FBQUE7QUFGUixzQkFLRSxZQUFZO0FBTHBCLElBQU0sdUJBQU47QUF5RFAsTUFBTSx1QkFBdUIscUJBQXNEO0FBQUEsRUFFbEYsY0FBYztBQUNiLFVBQU0sbUJBQXVCLElBQUksU0FBUztBQUFBLE1BQ3pDLFlBQVk7QUFBQSxNQUNaLFlBQVk7QUFBQSxNQUNaLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLHFCQUFxQjtBQUFBLE1BQ3JCLHVCQUF1QjtBQUFBLE1BQ3ZCLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxNQUNiLGdDQUFnQztBQUFBLE1BQ2hDLGdDQUFnQztBQUFBLE1BQ2hDLGdDQUFnQztBQUFBLE1BQ2hDLFlBQVk7QUFBQSxNQUNaLGFBQWE7QUFBQSxNQUNiLGVBQWU7QUFBQSxNQUNmLGVBQWU7QUFBQSxJQUNoQixHQUFHLEtBQUssQ0FBQztBQUFBLEVBQ1Y7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBaUMsR0FBdUI7QUFDbEcsV0FBTyxJQUFJO0FBQUEsRUFDWjtBQUNEO0FBTUEsTUFBTSw2QkFBNkIscUJBQStFO0FBQUEsRUFFakgsY0FBYztBQUNiLFVBQU0sZ0NBQW1DLFlBQTBCO0FBQUEsRUFDcEU7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBaUMsR0FBaUQ7QUFDNUgsV0FBTyxJQUFJLGNBQWMsYUFDeEIsUUFBUSxJQUFJLDRCQUFnQyxJQUM1QyxRQUFRLElBQUksb0JBQXdCO0FBQUEsRUFDdEM7QUFDRDtBQU1BLE1BQU0sb0NBQW9DLHFCQUFpRTtBQUFBLEVBRTFHLGNBQWM7QUFDYixVQUFNLGdDQUFtQyxLQUFLO0FBQUEsRUFDL0M7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBMEM7QUFDcEYsV0FBTyxJQUFJLHdCQUF3QixRQUFRLElBQUksb0JBQXdCO0FBQUEsRUFDeEU7QUFDRDtBQU1BLE1BQU0sb0NBQW9DLHFCQUF3RTtBQUFBLEVBRWpILGNBQWM7QUFDYixVQUFNLHVDQUEwQyxLQUFLO0FBQUEsRUFDdEQ7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBMEM7QUFDcEYsVUFBTSx1QkFBdUIsSUFBSTtBQUNqQyxRQUFJLHlCQUF5QixxQkFBcUIsU0FBUztBQUMxRCxhQUFPLFFBQVEsSUFBSSw2Q0FBa0Q7QUFBQSxJQUN0RSxPQUFPO0FBQ04sYUFBTyxRQUFRLElBQUksMEJBQStCO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQ0Q7QUFNQSxNQUFNLHVCQUF1QixtQkFBa0Q7QUFBQSxFQUU5RSxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsTUFBdUI7QUFBQSxNQUFZLHFCQUFxQjtBQUFBLE1BQ3hEO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFDVCxTQUFTLHFCQUFxQjtBQUFBLFFBQzlCLGFBQWEsSUFBSSxTQUFTLFlBQVksbUNBQW1DO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRWdCLFNBQVMsT0FBd0I7QUFDaEQsVUFBTSxJQUFJLGtCQUFrQixNQUFNLE9BQU8sS0FBSyxZQUFZO0FBQzFELFFBQUksTUFBTSxHQUFHO0FBQ1osYUFBTyxxQkFBcUI7QUFBQSxJQUM3QjtBQUNBLFdBQU8sa0JBQWtCLE1BQU0sR0FBRyxHQUFHLEdBQUc7QUFBQSxFQUN6QztBQUFBLEVBQ2dCLFFBQVEsS0FBNEIsU0FBaUMsT0FBdUI7QUFHM0csV0FBTyxJQUFJLFNBQVM7QUFBQSxFQUNyQjtBQUNEO0FBTUEsTUFBTSxvQkFBTixNQUFNLDBCQUF5QixpQkFBMEQ7QUFBQSxFQUt4RixjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsTUFBeUI7QUFBQSxNQUFjLHFCQUFxQjtBQUFBLE1BQzVEO0FBQUEsUUFDQyxPQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sU0FBUyxrQkFBaUI7QUFBQSxZQUMxQixTQUFTLGtCQUFpQjtBQUFBLFlBQzFCLGNBQWMsSUFBSSxTQUFTLDBCQUEwQiw4RUFBa0Y7QUFBQSxVQUN4STtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNWO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTSxrQkFBaUI7QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVMscUJBQXFCO0FBQUEsUUFDOUIsYUFBYSxJQUFJLFNBQVMsY0FBYywrRkFBbUc7QUFBQSxNQUM1STtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLE9BQXdCO0FBQ3ZDLFFBQUksVUFBVSxZQUFZLFVBQVUsUUFBUTtBQUMzQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sT0FBTyxnQkFBZ0IsV0FBVyxPQUFPLHFCQUFxQixZQUFZLGtCQUFpQixlQUFlLGtCQUFpQixhQUFhLENBQUM7QUFBQSxFQUNqSjtBQUNEO0FBcENNLGtCQUNVLG9CQUFvQixDQUFDLFVBQVUsUUFBUSxPQUFPLE9BQU8sT0FBTyxPQUFPLE9BQU8sT0FBTyxPQUFPLE9BQU8sS0FBSztBQUQ5RyxrQkFFVSxnQkFBZ0I7QUFGMUIsa0JBR1UsZ0JBQWdCO0FBSGhDLElBQU0sbUJBQU47QUF1RUEsTUFBTSwyQkFBMkIsaUJBQXVGO0FBQUEsRUFFdkgsY0FBYztBQUNiLFVBQU0sV0FBZ0M7QUFBQSxNQUNyQyxVQUFVO0FBQUEsTUFDVixxQkFBcUI7QUFBQSxNQUNyQix5QkFBeUI7QUFBQSxNQUN6QixzQkFBc0I7QUFBQSxNQUN0Qix5QkFBeUI7QUFBQSxNQUN6QixvQkFBb0I7QUFBQSxNQUNwQixlQUFlO0FBQUEsTUFDZiw4QkFBOEI7QUFBQSxNQUM5QixrQ0FBa0M7QUFBQSxNQUNsQywrQkFBK0I7QUFBQSxNQUMvQixrQ0FBa0M7QUFBQSxNQUNsQyw2QkFBNkI7QUFBQSxNQUM3Qix5QkFBeUI7QUFBQSxJQUMxQjtBQUNBLFVBQU0sYUFBMEI7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsUUFBUSxlQUFlLE1BQU07QUFBQSxNQUNwQyxTQUFTLFNBQVM7QUFBQSxNQUNsQixrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMscUNBQXFDLHlDQUF5QztBQUFBLFFBQzNGLElBQUksU0FBUyw0Q0FBNEMsK0NBQStDO0FBQUEsUUFDeEcsSUFBSSxTQUFTLHFDQUFxQyxvRUFBb0U7QUFBQSxNQUN2SDtBQUFBLElBQ0Q7QUFDQSxVQUFNLDRCQUE0QixDQUFDLElBQUkseUNBQXlDLGdDQUFnQyxvQ0FBb0Msb0NBQW9DLG9DQUFvQyxvQ0FBb0MsaUNBQWlDLG1DQUFtQyxnQ0FBZ0MsdUNBQXVDLGdDQUFnQztBQUMzYTtBQUFBLE1BQ0M7QUFBQSxNQUEyQjtBQUFBLE1BQWdCO0FBQUEsTUFDM0M7QUFBQSxRQUNDLGdDQUFnQztBQUFBLFVBQy9CLG9CQUFvQixJQUFJLFNBQVMsMkNBQTJDLGlMQUFpTDtBQUFBLFFBQzlQO0FBQUEsUUFDQSwyQ0FBMkM7QUFBQSxVQUMxQyxhQUFhLElBQUksU0FBUyxrREFBa0QsNEZBQTRGO0FBQUEsVUFDeEssR0FBRztBQUFBLFFBQ0o7QUFBQSxRQUNBLCtDQUErQztBQUFBLFVBQzlDLGFBQWEsSUFBSSxTQUFTLHNEQUFzRCxpR0FBaUc7QUFBQSxVQUNqTCxHQUFHO0FBQUEsUUFDSjtBQUFBLFFBQ0EsNENBQTRDO0FBQUEsVUFDM0MsYUFBYSxJQUFJLFNBQVMsbURBQW1ELDZGQUE2RjtBQUFBLFVBQzFLLEdBQUc7QUFBQSxRQUNKO0FBQUEsUUFDQSwrQ0FBK0M7QUFBQSxVQUM5QyxhQUFhLElBQUksU0FBUyxzREFBc0QsaUdBQWlHO0FBQUEsVUFDakwsR0FBRztBQUFBLFFBQ0o7QUFBQSxRQUNBLDBDQUEwQztBQUFBLFVBQ3pDLGFBQWEsSUFBSSxTQUFTLGlEQUFpRCw0RkFBNEY7QUFBQSxVQUN2SyxHQUFHO0FBQUEsUUFDSjtBQUFBLFFBQ0Esb0RBQW9EO0FBQUEsVUFDbkQsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsZ0NBQWdDLDhHQUE4RztBQUFBLFFBQ3pLO0FBQUEsUUFDQSx3REFBd0Q7QUFBQSxVQUN2RCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUyxvQ0FBb0MsbUhBQW1IO0FBQUEsUUFDbEw7QUFBQSxRQUNBLHFEQUFxRDtBQUFBLFVBQ3BELE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLE1BQU07QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLGlDQUFpQywrR0FBK0c7QUFBQSxRQUMzSztBQUFBLFFBQ0Esd0RBQXdEO0FBQUEsVUFDdkQsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsb0NBQW9DLGtIQUFrSDtBQUFBLFFBQ2pMO0FBQUEsUUFDQSxtREFBbUQ7QUFBQSxVQUNsRCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUywrQkFBK0IsNkdBQTZHO0FBQUEsUUFDdks7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsUUFBc0M7QUFDckQsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUNkLFdBQU87QUFBQSxNQUNOLFVBQVUsVUFBOEIsTUFBTSxVQUFVLEtBQUssYUFBYSxVQUFVLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQ25ILHFCQUFxQixVQUE4QixNQUFNLHFCQUFxQixRQUFRLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQ3JILHlCQUF5QixVQUE4QixNQUFNLHlCQUF5QixRQUFRLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQzdILHNCQUFzQixVQUE4QixNQUFNLHNCQUFzQixRQUFRLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQ3ZILHlCQUF5QixVQUE4QixNQUFNLHlCQUF5QixRQUFRLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQzdILG9CQUFvQixVQUE4QixNQUFNLG9CQUFvQixRQUFRLENBQUMsUUFBUSxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQ25ILGVBQWUsVUFBOEIsTUFBTSxlQUFlLFFBQVEsQ0FBQyxRQUFRLGVBQWUsTUFBTSxDQUFDO0FBQUEsTUFDekcsOEJBQThCLG1CQUFtQixPQUFPLE1BQU0sOEJBQThCLEtBQUssYUFBYSw0QkFBNEI7QUFBQSxNQUMxSSxrQ0FBa0MsbUJBQW1CLE9BQU8sTUFBTSxrQ0FBa0MsS0FBSyxhQUFhLGdDQUFnQztBQUFBLE1BQ3RKLCtCQUErQixtQkFBbUIsT0FBTyxNQUFNLCtCQUErQixLQUFLLGFBQWEsNkJBQTZCO0FBQUEsTUFDN0ksa0NBQWtDLG1CQUFtQixPQUFPLE1BQU0sa0NBQWtDLEtBQUssYUFBYSxnQ0FBZ0M7QUFBQSxNQUN0Siw2QkFBNkIsbUJBQW1CLE9BQU8sTUFBTSw2QkFBNkIsS0FBSyxhQUFhLDJCQUEyQjtBQUFBLE1BQ3ZJLHlCQUF5QixtQkFBbUIsT0FBTyxNQUFNLHlCQUF5QixLQUFLLGFBQWEsdUJBQXVCO0FBQUEsSUFDNUg7QUFBQSxFQUNEO0FBQ0Q7QUErQ0EsTUFBTSxvQkFBb0IsaUJBQThFO0FBQUEsRUFFdkcsY0FBYztBQUNiLFVBQU0sV0FBK0I7QUFBQSxNQUNwQyxTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsTUFDUCxhQUFhO0FBQUEsTUFDYixRQUFRO0FBQUEsTUFDUixPQUFPO0FBQUEsTUFDUCxxQkFBcUI7QUFBQSxJQUN0QjtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQW9CO0FBQUEsTUFBUztBQUFBLE1BQzdCO0FBQUEsUUFDQyx3QkFBd0I7QUFBQSxVQUN2QixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsTUFBTSxPQUFPLG9CQUFvQjtBQUFBLFVBQ3hDLFNBQVMsU0FBUztBQUFBLFVBQ2xCLDBCQUEwQjtBQUFBLFlBQ3pCLElBQUksU0FBUyxvQkFBb0IsbUJBQW1CO0FBQUEsWUFDcEQsSUFBSSxTQUFTLHFCQUFxQixvQkFBb0I7QUFBQSxZQUN0RCxJQUFJLFNBQVMsb0NBQW9DLHdHQUF3RyxTQUFTLGNBQWMsWUFBWSxTQUFTO0FBQUEsVUFDdE07QUFBQSxVQUNBLGFBQWEsSUFBSSxTQUFTLGlCQUFpQixzQ0FBc0M7QUFBQSxVQUNqRixVQUFVLENBQUMsUUFBUSxRQUFRLFNBQVM7QUFBQSxRQUNyQztBQUFBLFFBQ0Esc0JBQXNCO0FBQUEsVUFDckIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsU0FBUztBQUFBLFVBQ1QsU0FBUztBQUFBLFVBQ1QsYUFBYSxJQUFJLFNBQVMsZUFBZSxvRUFBb0U7QUFBQSxRQUM5RztBQUFBLFFBQ0EsdUJBQXVCO0FBQUEsVUFDdEIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsZ0JBQWdCLCtFQUErRTtBQUFBLFFBQzFIO0FBQUEsUUFDQSw0QkFBNEI7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxTQUFTLFNBQVM7QUFBQSxVQUNsQixxQkFBcUIsSUFBSSxTQUFTLHFCQUFxQixxSEFBcUg7QUFBQSxRQUM3SztBQUFBLFFBQ0Esc0JBQXNCO0FBQUEsVUFDckIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsZUFBZSx5REFBeUQ7QUFBQSxRQUNuRztBQUFBLFFBQ0Esb0NBQW9DO0FBQUEsVUFDbkMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLG1IQUFtSDtBQUFBLFFBQzNLO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQXFDO0FBQ3BELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixTQUFTLFVBQStDLE1BQU0sU0FBUyxLQUFLLGFBQWEsU0FBUyxDQUFDLE1BQU0sT0FBTyxvQkFBb0IsQ0FBQztBQUFBLE1BQ3JJLE9BQU8sZ0JBQWdCLFdBQVcsTUFBTSxPQUFPLEtBQUssYUFBYSxPQUFPLEdBQUcsR0FBSztBQUFBLE1BQ2hGLFFBQVEsUUFBUSxNQUFNLFFBQVEsS0FBSyxhQUFhLE1BQU07QUFBQSxNQUN0RCxhQUFhLGdCQUFnQixXQUFXLE1BQU0sYUFBYSxLQUFLLGFBQWEsYUFBYSxHQUFHLEdBQU07QUFBQSxNQUNuRyxPQUFPLFFBQVEsTUFBTSxPQUFPLEtBQUssYUFBYSxLQUFLO0FBQUEsTUFDbkQscUJBQXFCLFFBQVEsTUFBTSxxQkFBcUIsS0FBSyxhQUFhLG1CQUFtQjtBQUFBLElBQzlGO0FBQUEsRUFDRDtBQUNEO0FBNEJPLElBQVcsZ0JBQVgsa0JBQVdDLG1CQUFYO0FBQ04sRUFBQUEsOEJBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsOEJBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsOEJBQUEsWUFBUyxLQUFUO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQTRLWCxNQUFNLGlDQUFpQyxxQkFBZ0U7QUFBQSxFQUU3RyxjQUFjO0FBQ2IsVUFBTSxzQkFBeUI7QUFBQSxNQUM5QixPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixnQ0FBZ0M7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixhQUFhO0FBQUEsTUFDYixjQUFjO0FBQUEsTUFDZCxTQUFTO0FBQUEsUUFDUixlQUFlO0FBQUEsUUFDZixhQUFhO0FBQUEsUUFDYixjQUFjO0FBQUEsUUFDZCw2QkFBNkI7QUFBQSxRQUM3QixtQkFBbUI7QUFBQSxRQUNuQixjQUFjO0FBQUEsUUFDZCxtQkFBbUI7QUFBQSxRQUNuQix5QkFBeUI7QUFBQSxRQUN6QiwwQkFBMEI7QUFBQSxRQUMxQix5QkFBeUI7QUFBQSxRQUN6QiwwQkFBMEI7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsZ0JBQWdCO0FBQUEsTUFDaEIsb0JBQW9CO0FBQUEsTUFDcEIsb0JBQW9CO0FBQUEsTUFDcEIsZ0JBQWdCO0FBQUEsTUFDaEIsd0JBQXdCO0FBQUEsTUFDeEIsMkJBQTJCO0FBQUEsTUFDM0IsZUFBZTtBQUFBLFFBQ2QsS0FBSztBQUFBLFFBQ0wsT0FBTztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxRQUFRLEtBQTRCLFNBQWlDLEdBQXVDO0FBQ2xILFdBQU8seUJBQXlCLGNBQWMsU0FBUztBQUFBLE1BQ3RELFFBQVEsSUFBSTtBQUFBLE1BQ1osWUFBWSxJQUFJO0FBQUEsTUFDaEIsYUFBYSxJQUFJO0FBQUEsTUFDakIsd0JBQXdCLElBQUk7QUFBQSxNQUM1QixZQUFZLElBQUksU0FBUztBQUFBLE1BQ3pCLGVBQWUsSUFBSTtBQUFBLE1BQ25CLHVCQUF1QixJQUFJO0FBQUEsTUFDM0IsZ0NBQWdDLElBQUksU0FBUztBQUFBLE1BQzdDLGVBQWUsSUFBSSxTQUFTO0FBQUEsTUFDNUIsWUFBWSxJQUFJO0FBQUEsTUFDaEIsZ0NBQWdDLElBQUk7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBYyxpQ0FBaUMsT0FRK0c7QUFDN0osVUFBTSwyQkFBMkIsTUFBTSxTQUFTLE1BQU07QUFDdEQsVUFBTSw0QkFBNEIsS0FBSyxNQUFNLE1BQU0sYUFBYSxNQUFNLFVBQVU7QUFDaEYsUUFBSSwyQkFBMkIsS0FBSyxNQUFNLE1BQU0sZ0JBQWdCLE1BQU0sVUFBVTtBQUNoRixRQUFJLE1BQU0sc0JBQXNCO0FBQy9CLGlDQUEyQixLQUFLLElBQUksMEJBQTBCLDJCQUEyQixDQUFDO0FBQUEsSUFDM0Y7QUFDQSxVQUFNLGdCQUFnQiw0QkFBNEIsTUFBTSxnQkFBZ0IsNkJBQTZCLE1BQU0sYUFBYSxNQUFNO0FBQzlILFVBQU0sbUJBQW1CLEtBQUssTUFBTSxNQUFNLGdCQUFnQixZQUFZO0FBQ3RFLFdBQU8sRUFBRSwwQkFBMEIsMkJBQTJCLDBCQUEwQixjQUFjLGlCQUFpQjtBQUFBLEVBQ3hIO0FBQUEsRUFFQSxPQUFlLHNCQUFzQixPQUE0QixRQUF1RDtBQUN2SCxVQUFNLGFBQWEsTUFBTTtBQUN6QixVQUFNLGNBQWMsTUFBTTtBQUMxQixVQUFNLGFBQWEsTUFBTTtBQUV6QixRQUFJLENBQUMsTUFBTSxRQUFRLFNBQVM7QUFDM0IsYUFBTztBQUFBLFFBQ04sZUFBZTtBQUFBLFFBQ2YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsNkJBQTZCO0FBQUEsUUFDN0IsbUJBQW1CO0FBQUEsUUFDbkIsY0FBYztBQUFBLFFBQ2QsbUJBQW1CO0FBQUEsUUFDbkIseUJBQXlCO0FBQUEsUUFDekIsMEJBQTBCLEtBQUssTUFBTSxhQUFhLFdBQVc7QUFBQSxRQUM3RCx5QkFBeUI7QUFBQSxRQUN6QiwwQkFBMEI7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFHQSxVQUFNLDJCQUEyQixPQUFPO0FBQ3hDLFVBQU0saUJBQ0wsNEJBRUcsTUFBTSxnQkFBZ0IseUJBQXlCLGVBQy9DLE1BQU0sZUFBZSx5QkFBeUIsY0FDOUMsTUFBTSxtQ0FBbUMseUJBQXlCLGtDQUNsRSxNQUFNLGVBQWUseUJBQXlCLGNBQzlDLE1BQU0seUJBQXlCLHlCQUF5Qix3QkFDeEQsTUFBTSxlQUFlLHlCQUF5QixjQUM5QyxNQUFNLGtCQUFrQix5QkFBeUIsaUJBQ2pELE1BQU0sUUFBUSxZQUFZLHlCQUF5QixRQUFRLFdBQzNELE1BQU0sUUFBUSxTQUFTLHlCQUF5QixRQUFRLFFBQ3hELE1BQU0sUUFBUSxTQUFTLHlCQUF5QixRQUFRLFFBQ3hELE1BQU0sUUFBUSxlQUFlLHlCQUF5QixRQUFRLGNBQzlELE1BQU0sUUFBUSxxQkFBcUIseUJBQXlCLFFBQVEsb0JBQ3BFLE1BQU0sUUFBUSxjQUFjLHlCQUF5QixRQUFRLGFBQzdELE1BQU0sUUFBUSxVQUFVLHlCQUF5QixRQUFRLFNBQ3pELE1BQU0sMkJBQTJCLHlCQUF5QiwwQkFHMUQsTUFBTSx1QkFBdUIseUJBQXlCO0FBRzFELFVBQU0sYUFBYSxNQUFNO0FBQ3pCLFVBQU0saUNBQWlDLE1BQU07QUFDN0MsVUFBTSx1QkFBdUIsTUFBTTtBQUNuQyxVQUFNLDBCQUEwQixNQUFNLFFBQVE7QUFDOUMsUUFBSSxlQUFnQixjQUFjLElBQUksS0FBSyxNQUFNLE1BQU0sUUFBUSxRQUFRLENBQUMsSUFBSSxNQUFNLFFBQVE7QUFDMUYsVUFBTSxtQkFBbUIsTUFBTSxRQUFRO0FBQ3ZDLFVBQU0sY0FBYyxNQUFNLFFBQVE7QUFDbEMsVUFBTSxjQUFjLE1BQU0sUUFBUTtBQUNsQyxVQUFNLHlCQUF5QixNQUFNO0FBQ3JDLFVBQU0sZ0JBQWdCLE1BQU07QUFDNUIsVUFBTSxpQkFBaUIsTUFBTTtBQUM3QixVQUFNLHFCQUFxQixNQUFNO0FBRWpDLFVBQU0saUJBQWlCLDBCQUEwQixJQUFJO0FBQ3JELFFBQUksMkJBQTJCLEtBQUssTUFBTSxhQUFhLFdBQVc7QUFDbEUsVUFBTSwyQkFBMkIsMkJBQTJCO0FBQzVELFFBQUksOEJBQThCO0FBQ2xDLFFBQUksb0JBQW9CO0FBQ3hCLFFBQUksb0JBQW9CLGlCQUFpQjtBQUN6QyxRQUFJLG1CQUFtQixlQUFlO0FBQ3RDLFFBQUkseUJBQWlDO0FBRXJDLFFBQUksZ0JBQWdCLFVBQVUsZ0JBQWdCLE9BQU87QUFDcEQsWUFBTSxFQUFFLDBCQUEwQiwyQkFBMkIsMEJBQTBCLGNBQWMsaUJBQWlCLElBQUkseUJBQXlCLGlDQUFpQztBQUFBLFFBQ25MO0FBQUEsUUFDQTtBQUFBLFFBQ0EsWUFBWSxNQUFNO0FBQUEsUUFDbEIsZUFBZSxNQUFNO0FBQUEsUUFDckIsUUFBUTtBQUFBLFFBQ1I7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxRQUFRLGdCQUFnQjtBQUU5QixVQUFJLFFBQVEsR0FBRztBQUNkLHNDQUE4QjtBQUM5Qiw0QkFBb0I7QUFDcEIsdUJBQWU7QUFDZiw0QkFBb0I7QUFDcEIsMkJBQW1CLGVBQWU7QUFBQSxNQUNuQyxPQUFPO0FBQ04sWUFBSSxpQkFBaUI7QUFDckIsWUFBSSxrQkFBa0IsZUFBZTtBQUVyQyxZQUFJLGdCQUFnQixPQUFPO0FBQzFCLGdCQUFNLHlCQUF5QixLQUFLLE1BQU0sNEJBQTRCLGdCQUFnQiw0QkFBNEIsaUJBQWlCO0FBQ25JLGNBQUksc0JBQXNCLGtCQUFrQixrQkFBa0IsT0FBTyx5QkFBeUI7QUFNN0YsNkJBQWlCO0FBQ2pCLDhCQUFrQixPQUFPO0FBQUEsVUFDMUIsT0FBTztBQUNOLDZCQUFrQix5QkFBeUI7QUFBQSxVQUM1QztBQUFBLFFBQ0Q7QUFFQSxZQUFJLGdCQUFnQixVQUFVLGdCQUFnQjtBQUM3Qyx3Q0FBOEI7QUFDOUIsZ0JBQU0seUJBQXlCO0FBQy9CLDhCQUFvQixLQUFLLElBQUksYUFBYSxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxJQUFJLFlBQVksQ0FBQyxDQUFDO0FBQy9GLGNBQUksc0JBQXNCLGtCQUFrQixrQkFBa0IsT0FBTyx5QkFBeUI7QUFNN0YsOEJBQWtCLE9BQU87QUFBQSxVQUMxQjtBQUNBLHlCQUFlLEtBQUssSUFBSSxpQkFBaUIsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLG9CQUFvQixjQUFjLENBQUMsQ0FBQztBQUNwRyxjQUFJLGVBQWUsd0JBQXdCO0FBQzFDLHFDQUF5QixLQUFLLElBQUksR0FBRyxlQUFlLHNCQUFzQjtBQUFBLFVBQzNFO0FBQ0EsNkJBQW1CLGVBQWUsYUFBYTtBQUMvQyxxQ0FBMkIsS0FBSyxLQUFNLEtBQUssSUFBSSwwQkFBMEIsNEJBQTRCLGdCQUFnQix3QkFBd0IsSUFBSyxpQkFBaUI7QUFDbkssY0FBSSxvQkFBb0I7QUFFdkIsbUJBQU8sMkJBQTJCO0FBQ2xDLG1CQUFPLDBCQUEwQjtBQUNqQyxtQkFBTywyQkFBMkI7QUFBQSxVQUNuQyxPQUFPO0FBQ04sbUJBQU8sMkJBQTJCO0FBQ2xDLG1CQUFPLDBCQUEwQjtBQUFBLFVBQ2xDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBZUEsVUFBTSxrQkFBa0IsS0FBSyxNQUFNLG1CQUFtQixnQkFBZ0I7QUFDdEUsVUFBTSxlQUFlLEtBQUssSUFBSSxpQkFBaUIsS0FBSyxJQUFJLEdBQUcsS0FBSyxPQUFRLGlCQUFpQix5QkFBeUIsS0FBSyxvQkFBcUIsaUNBQWlDLGlCQUFpQixDQUFDLElBQUksb0JBQW9CO0FBRXZOLFFBQUksMEJBQTBCLEtBQUssTUFBTSxhQUFhLFlBQVk7QUFDbEUsVUFBTSwwQkFBMEIsMEJBQTBCO0FBQzFELDhCQUEwQixLQUFLLE1BQU0sMEJBQTBCLHNCQUFzQjtBQUVyRixVQUFNLGdCQUFpQiwwQkFBMEIsZUFBcUI7QUFDdEUsVUFBTSxjQUFlLGdCQUFnQixTQUFTLElBQUssYUFBYSxlQUFlO0FBRS9FLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFjLGNBQWMsU0FBaUMsS0FBb0Q7QUFDaEgsVUFBTSxhQUFhLElBQUksYUFBYTtBQUNwQyxVQUFNLGNBQWMsSUFBSSxjQUFjO0FBQ3RDLFVBQU0sYUFBYSxJQUFJLGFBQWE7QUFDcEMsVUFBTSx3QkFBd0IsSUFBSSx3QkFBd0I7QUFDMUQsVUFBTSxpQ0FBaUMsSUFBSTtBQUMzQyxVQUFNLGdCQUFnQixJQUFJO0FBQzFCLFVBQU0sYUFBYSxJQUFJO0FBQ3ZCLFVBQU0sZ0JBQWdCLElBQUk7QUFFMUIsVUFBTSxvQkFBb0IsUUFBUSxJQUFJLDJCQUE4QjtBQUNwRSxVQUFNLG9CQUFxQixzQkFBc0IsWUFBWSxRQUFRLElBQUksMkJBQThCLElBQUk7QUFDM0csVUFBTSxXQUFZLHNCQUFzQixZQUFZLFFBQVEsSUFBSSxrQkFBcUIsSUFBSTtBQUV6RixVQUFNLGlCQUFpQixRQUFRLElBQUksd0JBQTJCO0FBQzlELFVBQU0seUJBQXlCLElBQUk7QUFFbkMsVUFBTSxrQkFBa0IsUUFBUSxJQUFJLG9CQUF3QjtBQUM1RCxVQUFNLGtCQUFtQixRQUFRLElBQUksb0JBQXdCLEVBQUUsZUFBZTtBQUM5RSxVQUFNLHNCQUFzQixRQUFRLElBQUksNEJBQWdDO0FBQ3hFLFVBQU0sdUJBQXVCLFFBQVEsSUFBSSw4QkFBaUM7QUFDMUUsVUFBTSxVQUFVLFFBQVEsSUFBSSxnQkFBb0I7QUFDaEQsVUFBTSxVQUFVLFFBQVEsSUFBSSxnQkFBb0I7QUFFaEQsVUFBTSxZQUFZLFFBQVEsSUFBSSxtQkFBc0I7QUFDcEQsVUFBTSx5QkFBeUIsVUFBVTtBQUN6QyxVQUFNLDZCQUE2QixVQUFVO0FBQzdDLFVBQU0scUJBQXFCLFVBQVU7QUFDckMsVUFBTSw0QkFBNEIsVUFBVTtBQUU1QyxVQUFNLFVBQVUsUUFBUSxJQUFJLGdCQUFvQjtBQUNoRCxVQUFNLHdCQUF3QixRQUFRLElBQUksNkJBQWdDLE1BQU07QUFFaEYsUUFBSSx1QkFBdUIsUUFBUSxJQUFJLDZCQUFpQztBQUN4RSxRQUFJLFdBQVcsdUJBQXVCO0FBQ3JDLDhCQUF3QjtBQUFBLElBQ3pCO0FBRUEsUUFBSSxtQkFBbUI7QUFDdkIsUUFBSSxpQkFBaUI7QUFDcEIsWUFBTSxhQUFhLEtBQUssSUFBSSx1QkFBdUIsbUJBQW1CO0FBQ3RFLHlCQUFtQixLQUFLLE1BQU0sYUFBYSxhQUFhO0FBQUEsSUFDekQ7QUFFQSxRQUFJLG1CQUFtQjtBQUN2QixRQUFJLGlCQUFpQjtBQUNwQix5QkFBbUIsYUFBYSxJQUFJO0FBQUEsSUFDckM7QUFFQSxRQUFJLGtCQUFrQjtBQUN0QixRQUFJLGtCQUFrQixrQkFBa0I7QUFDeEMsUUFBSSxrQkFBa0Isa0JBQWtCO0FBQ3hDLFFBQUksY0FBYyxrQkFBa0I7QUFFcEMsVUFBTSxpQkFBaUIsYUFBYSxtQkFBbUIsbUJBQW1CO0FBRTFFLFFBQUkscUJBQXFCO0FBQ3pCLFFBQUkscUJBQXFCO0FBQ3pCLFFBQUksaUJBQWlCO0FBRXJCLFFBQUksUUFBUSxJQUFJLDRCQUFpQyxNQUFNLHFCQUFxQixXQUFXLHNCQUFzQixhQUFhLHdCQUF3QjtBQUVqSiwyQkFBcUI7QUFDckIsMkJBQXFCO0FBQUEsSUFDdEIsV0FBVyxhQUFhLFFBQVEsYUFBYSxXQUFXO0FBQ3ZELDJCQUFxQjtBQUFBLElBQ3RCLFdBQVcsYUFBYSxrQkFBa0I7QUFDekMsdUJBQWlCO0FBQUEsSUFDbEI7QUFFQSxVQUFNLGdCQUFnQix5QkFBeUIsc0JBQXNCO0FBQUEsTUFDcEU7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBWSxRQUFRO0FBQUEsTUFDcEIsZUFBZSxRQUFRO0FBQUEsTUFDdkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLElBQUksVUFBVSxJQUFJLHFCQUFxQixDQUFDO0FBRTNDLFFBQUksY0FBYyxrQkFBa0IsZ0JBQXNCLGNBQWMsZ0JBQWdCLEdBQUc7QUFFMUYseUJBQW1CLGNBQWM7QUFDakMseUJBQW1CLGNBQWM7QUFDakMseUJBQW1CLGNBQWM7QUFDakMscUJBQWUsY0FBYztBQUFBLElBQzlCO0FBQ0EsVUFBTSxlQUFlLGlCQUFpQixjQUFjO0FBR3BELFVBQU0saUJBQWlCLEtBQUssSUFBSSxHQUFHLEtBQUssT0FBTyxlQUFlLHlCQUF5QixLQUFLLDhCQUE4QixDQUFDO0FBRTNILFVBQU0sb0JBQXFCLDZCQUE2QixxQkFBcUI7QUFFN0UsUUFBSSxvQkFBb0I7QUFFdkIsdUJBQWlCLEtBQUssSUFBSSxHQUFHLGNBQWM7QUFDM0MsVUFBSSxhQUFhLFdBQVc7QUFDM0IseUJBQWlCLEtBQUssSUFBSSxnQkFBZ0IsY0FBYztBQUFBLE1BQ3pEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUVSO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0NBQWdDLElBQUk7QUFBQSxNQUVwQztBQUFBLE1BQ0E7QUFBQSxNQUVBO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxNQUVsQjtBQUFBLE1BQ0E7QUFBQSxNQUVBLFNBQVM7QUFBQSxNQUVUO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUVBLGVBQWU7QUFBQSxRQUNkLEtBQUs7QUFBQSxRQUNMLE9BQU87QUFBQSxRQUNQLFFBQVMsY0FBYyxJQUFJO0FBQUEsUUFDM0IsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBS0EsTUFBTSx5QkFBeUIsaUJBQThGO0FBQUEsRUFFNUgsY0FBYztBQUNiO0FBQUEsTUFBTTtBQUFBLE1BQStCO0FBQUEsTUFBb0I7QUFBQSxNQUN4RDtBQUFBLFFBQ0MsMkJBQTJCO0FBQUEsVUFDMUIsa0JBQWtCO0FBQUEsWUFDakIsSUFBSSxTQUFTLDJCQUEyQixtTUFBbU07QUFBQSxZQUMzTyxJQUFJLFNBQVMsNkJBQTZCLGdLQUFnSztBQUFBLFVBQzNNO0FBQUEsVUFDQSxNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsVUFBVSxVQUFVO0FBQUEsVUFDM0IsU0FBUztBQUFBLFVBQ1QsYUFBYSxJQUFJLFNBQVMsb0JBQW9CLDRJQUE0STtBQUFBLFFBQzNMO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLE9BQXVDO0FBQ3RELFdBQU8sVUFBaUMsT0FBTyxVQUFVLENBQUMsVUFBVSxVQUFVLENBQUM7QUFBQSxFQUNoRjtBQUFBLEVBRWdCLFFBQVEsS0FBNEIsU0FBaUMsT0FBcUQ7QUFDekksVUFBTSx1QkFBdUIsUUFBUSxJQUFJLDRCQUFpQztBQUMxRSxRQUFJLHlCQUF5QixxQkFBcUIsU0FBUztBQUcxRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFLTyxJQUFLLHdCQUFMLGtCQUFLQywyQkFBTDtBQUNOLEVBQUFBLHVCQUFBLFNBQU07QUFDTixFQUFBQSx1QkFBQSxZQUFTO0FBQ1QsRUFBQUEsdUJBQUEsUUFBSztBQUhNLFNBQUFBO0FBQUEsR0FBQTtBQXlCWixNQUFNLHdCQUF3QixpQkFBMEY7QUFBQSxFQUV2SCxjQUFjO0FBQ2IsVUFBTSxXQUFtQyxFQUFFLFNBQVMsc0JBQTZCO0FBQ2pGO0FBQUEsTUFDQztBQUFBLE1BQXdCO0FBQUEsTUFBYTtBQUFBLE1BQ3JDO0FBQUEsUUFDQyw0QkFBNEI7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsaUJBQTJCLHVCQUE4QixhQUF3QjtBQUFBLFVBQ3hGLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyxnQ0FBZ0MsK0JBQStCO0FBQUEsWUFDNUUsSUFBSSxTQUFTLG1DQUFtQyxrRUFBa0U7QUFBQSxZQUNsSCxJQUFJLFNBQVMsK0JBQStCLG9GQUFvRjtBQUFBLFVBQ2pJO0FBQUEsVUFDQSxhQUFhLElBQUksU0FBUyxXQUFXLGtEQUFrRDtBQUFBLFFBQ3hGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQXlDO0FBQ3hELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixTQUFTLFVBQVUsTUFBTSxTQUFTLEtBQUssYUFBYSxTQUFTLENBQUMsaUJBQTJCLHVCQUE4QixhQUF3QixDQUFDO0FBQUEsSUFDako7QUFBQSxFQUNEO0FBQ0Q7QUE4QkEsTUFBTSwyQkFBMkIsaUJBQW1HO0FBQUEsRUFFbkksY0FBYztBQUNiLFVBQU0sV0FBc0MsRUFBRSxTQUFTLE1BQU0sY0FBYyxHQUFHLGNBQWMsZ0JBQWdCLGtCQUFrQixLQUFLO0FBQ25JO0FBQUEsTUFDQztBQUFBLE1BQTJCO0FBQUEsTUFBZ0I7QUFBQSxNQUMzQztBQUFBLFFBQ0MsK0JBQStCO0FBQUEsVUFDOUIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsK0JBQStCLDZFQUE2RTtBQUFBLFFBQ3ZJO0FBQUEsUUFDQSxvQ0FBb0M7QUFBQSxVQUNuQyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxvQ0FBb0MscURBQXFEO0FBQUEsUUFDcEg7QUFBQSxRQUNBLG9DQUFvQztBQUFBLFVBQ25DLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxnQkFBZ0Isd0JBQXdCLGtCQUFrQjtBQUFBLFVBQ2pFLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG9DQUFvQyw0T0FBNE87QUFBQSxRQUMzUztBQUFBLFFBQ0Esd0NBQXdDO0FBQUEsVUFDdkMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsd0NBQXdDLDJFQUEyRTtBQUFBLFFBQzlJO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQTRDO0FBQzNELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVEsTUFBTSxTQUFTLEtBQUssYUFBYSxPQUFPO0FBQUEsTUFDekQsY0FBYyxnQkFBZ0IsV0FBVyxNQUFNLGNBQWMsS0FBSyxhQUFhLGNBQWMsR0FBRyxFQUFFO0FBQUEsTUFDbEcsY0FBYyxVQUF3RSxNQUFNLGNBQWMsS0FBSyxhQUFhLGNBQWMsQ0FBQyxnQkFBZ0Isd0JBQXdCLGtCQUFrQixDQUFDO0FBQUEsTUFDdE0sa0JBQWtCLFFBQVEsTUFBTSxrQkFBa0IsS0FBSyxhQUFhLGdCQUFnQjtBQUFBLElBQ3JGO0FBQUEsRUFDRDtBQUNEO0FBOENBLE1BQU0seUJBQXlCLGlCQUE2RjtBQUFBLEVBRTNILGNBQWM7QUFDYixVQUFNLFdBQW9DLEVBQUUsU0FBUyxNQUFNLFVBQVUsR0FBRyxZQUFZLElBQUksU0FBUyxPQUFPLGVBQWUsR0FBRztBQUMxSDtBQUFBLE1BQ0M7QUFBQSxNQUF5QjtBQUFBLE1BQWM7QUFBQSxNQUN2QztBQUFBLFFBQ0MsNkJBQTZCO0FBQUEsVUFDNUIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMscUJBQXFCLHdDQUF3QztBQUFBLFVBQ3ZGLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixvQkFBb0IsS0FBSztBQUFBLFVBQ3pELDBCQUEwQjtBQUFBLFlBQ3pCLElBQUksU0FBUyx3QkFBd0IseUJBQXlCO0FBQUEsWUFDOUQsSUFBSSxTQUFTLHFDQUFxQyxnRUFBZ0UsU0FBUyxjQUFjLGdCQUFnQixVQUFVO0FBQUEsWUFDbkssSUFBSSxTQUFTLHNDQUFzQywrREFBK0QsU0FBUyxjQUFjLGdCQUFnQixVQUFVO0FBQUEsWUFDbkssSUFBSSxTQUFTLHlCQUF5QiwwQkFBMEI7QUFBQSxVQUNqRTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLDhCQUE4QjtBQUFBLFVBQzdCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLHFCQUFxQixJQUFJLFNBQVMsdUJBQXVCLGdLQUFnSyx1QkFBdUIsS0FBSztBQUFBLFFBQ3RQO0FBQUEsUUFDQSxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixxQkFBcUIsSUFBSSxTQUFTLHlCQUF5QiwwRkFBMEYsdUJBQXVCO0FBQUEsUUFDN0s7QUFBQSxRQUNBLDZCQUE2QjtBQUFBLFVBQzVCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHNCQUFzQiwyREFBMkQ7QUFBQSxRQUM1RztBQUFBLFFBQ0EsbUNBQW1DO0FBQUEsVUFDbEMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIscUJBQXFCLElBQUksU0FBUyw0QkFBNEIsaUlBQWlJO0FBQUEsUUFDaE07QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsUUFBMEM7QUFDekQsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUNkLFFBQUksT0FBTyxNQUFNLFlBQVksV0FBVztBQUN2QyxZQUFNLFVBQVUsTUFBTSxVQUFVLE9BQU87QUFBQSxJQUN4QztBQUNBLFdBQU87QUFBQSxNQUNOLFNBQVMsVUFBaUUsTUFBTSxTQUFTLEtBQUssYUFBYSxTQUFTLENBQUMsTUFBTSxPQUFPLG9CQUFvQixpQkFBaUIsQ0FBQztBQUFBLE1BQ3hLLFVBQVUsZ0JBQWdCLFdBQVcsTUFBTSxVQUFVLEtBQUssYUFBYSxVQUFVLEdBQUcsR0FBRztBQUFBLE1BQ3ZGLFlBQVksbUJBQW1CLE9BQU8sTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDcEYsU0FBUyxRQUFRLE1BQU0sU0FBUyxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQ3pELGVBQWUsZ0JBQWdCLFdBQVcsTUFBTSxlQUFlLEtBQUssYUFBYSxlQUFlLEdBQUcsT0FBTyxnQkFBZ0I7QUFBQSxJQUMzSDtBQUFBLEVBQ0Q7QUFDRDtBQU1BLE1BQU0sbUNBQW1DLGlCQUE2RTtBQUFBLEVBRXJILGNBQWM7QUFDYixVQUFNLCtCQUFtQyx3QkFBd0IsRUFBRTtBQUFBLEVBQ3BFO0FBQUEsRUFFTyxTQUFTLE9BQXdCO0FBQ3ZDLFFBQUksT0FBTyxVQUFVLFlBQVksa0JBQWtCLEtBQUssS0FBSyxHQUFHO0FBQy9ELFlBQU0sV0FBVyxXQUFXLE1BQU0sVUFBVSxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDaEUsYUFBTyxDQUFDO0FBQUEsSUFDVCxPQUFPO0FBQ04sYUFBTyxnQkFBZ0IsV0FBVyxPQUFPLEtBQUssY0FBYyxHQUFHLEdBQUk7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixRQUFRLEtBQTRCLFNBQWlDLE9BQXVCO0FBQzNHLFFBQUksUUFBUSxHQUFHO0FBRWQsYUFBTyxnQkFBZ0IsV0FBVyxDQUFDLFFBQVEsSUFBSSxTQUFTLGdDQUFnQyxLQUFLLGNBQWMsR0FBRyxHQUFJO0FBQUEsSUFDbkgsT0FBTztBQUNOLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBTUEsTUFBTSx5QkFBeUIsa0JBQTJDO0FBQUEsRUFFekUsY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQXlCO0FBQUEsTUFDekIscUJBQXFCO0FBQUEsTUFDckIsT0FBSyxrQkFBa0IsTUFBTSxHQUFHLEdBQUcsR0FBRztBQUFBLE1BQ3RDLEVBQUUscUJBQXFCLElBQUksU0FBUyxjQUFjLHVQQUF1UCxFQUFFO0FBQUEsTUFDM1M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixRQUFRLEtBQTRCLFNBQWlDLE9BQXVCO0FBSTNHLFdBQU8sSUFBSSxTQUFTO0FBQUEsRUFDckI7QUFDRDtBQWtGQSxNQUFNLHNCQUFzQixpQkFBb0Y7QUFBQSxFQUUvRyxjQUFjO0FBQ2IsVUFBTSxXQUFpQztBQUFBLE1BQ3RDLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLGtCQUFrQjtBQUFBLE1BQ2xCLFdBQVc7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLDBCQUEwQjtBQUFBLE1BQzFCLHdCQUF3QjtBQUFBLE1BQ3hCLHdCQUF3QjtBQUFBLE1BQ3hCLHVCQUF1QjtBQUFBLE1BQ3ZCLDRCQUE0QjtBQUFBLElBQzdCO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFBc0I7QUFBQSxNQUFXO0FBQUEsTUFDakM7QUFBQSxRQUNDLDBCQUEwQjtBQUFBLFVBQ3pCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG1CQUFtQix3Q0FBd0M7QUFBQSxRQUN0RjtBQUFBLFFBQ0EsMkJBQTJCO0FBQUEsVUFDMUIsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLFFBQVEsYUFBYSxRQUFRO0FBQUEsVUFDcEMsa0JBQWtCO0FBQUEsWUFDakIsSUFBSSxTQUFTLHlCQUF5Qiw4QkFBOEI7QUFBQSxZQUNwRSxJQUFJLFNBQVMsOEJBQThCLG9HQUFvRztBQUFBLFlBQy9JLElBQUksU0FBUywyQkFBMkIsdURBQXVEO0FBQUEsVUFDaEc7QUFBQSxVQUNBLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG9CQUFvQix1REFBdUQ7QUFBQSxRQUN0RztBQUFBLFFBQ0EsdUJBQXVCO0FBQUEsVUFDdEIsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLGdCQUFnQixRQUFRLEtBQUs7QUFBQSxVQUNwQyxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsNkJBQTZCLDBFQUEwRTtBQUFBLFlBQ3BILElBQUksU0FBUyxxQkFBcUIsa0dBQWtHO0FBQUEsWUFDcEksSUFBSSxTQUFTLG9CQUFvQix5RkFBeUY7QUFBQSxVQUMzSDtBQUFBLFVBQ0EsU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsZ0JBQWdCLG1DQUFtQztBQUFBLFFBQzlFO0FBQUEsUUFDQSx1QkFBdUI7QUFBQSxVQUN0QixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsUUFBUSxPQUFPO0FBQUEsVUFDdEIsU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsZ0JBQWdCLGdEQUFnRDtBQUFBLFFBQzNGO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsVUFBVSxXQUFXO0FBQUEsVUFDNUIsU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsc0JBQXNCLDRDQUE0QztBQUFBLFFBQzdGO0FBQUEsUUFDQSx3QkFBd0I7QUFBQSxVQUN2QixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNkLGFBQWEsSUFBSSxTQUFTLGlCQUFpQixtREFBbUQ7QUFBQSxRQUMvRjtBQUFBLFFBQ0EsbUNBQW1DO0FBQUEsVUFDbEMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsNEJBQTRCLG9FQUFvRTtBQUFBLFFBQzNIO0FBQUEsUUFDQSw0QkFBNEI7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxxQkFBcUIsK0VBQStFO0FBQUEsUUFDL0g7QUFBQSxRQUNBLDJDQUEyQztBQUFBLFVBQzFDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG9DQUFvQyw2RUFBNkU7QUFBQSxRQUM1STtBQUFBLFFBQ0EseUNBQXlDO0FBQUEsVUFDeEMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsa0NBQWtDLDhFQUE4RTtBQUFBLFFBQzNJO0FBQUEsUUFDQSx5Q0FBeUM7QUFBQSxVQUN4QyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxrQ0FBa0MsaVZBQWlWO0FBQUEsUUFDOVk7QUFBQSxRQUNBLHdDQUF3QztBQUFBLFVBQ3ZDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLGlDQUFpQywyREFBMkQ7QUFBQSxRQUN2SDtBQUFBLFFBQ0EsNkNBQTZDO0FBQUEsVUFDNUMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLDhJQUE4STtBQUFBLFFBQy9NO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQXVDO0FBQ3RELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFHZCxRQUFJLHlCQUF5QixLQUFLLGFBQWE7QUFDL0MsVUFBTSxhQUFhLE1BQU07QUFDekIsUUFBSSxPQUFPLGVBQWUsVUFBVTtBQUNuQyxVQUFJO0FBQ0gsWUFBSSxPQUFPLFlBQVksR0FBRztBQUMxQixpQ0FBeUI7QUFBQSxNQUMxQixRQUFRO0FBQUEsTUFBRTtBQUFBLElBQ1g7QUFFQSxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVEsTUFBTSxTQUFTLEtBQUssYUFBYSxPQUFPO0FBQUEsTUFDekQsVUFBVSxVQUEyQyxNQUFNLFVBQVUsS0FBSyxhQUFhLFVBQVUsQ0FBQyxRQUFRLGFBQWEsUUFBUSxDQUFDO0FBQUEsTUFDaEksTUFBTSxVQUEyQyxNQUFNLE1BQU0sS0FBSyxhQUFhLE1BQU0sQ0FBQyxnQkFBZ0IsUUFBUSxLQUFLLENBQUM7QUFBQSxNQUNwSCxNQUFNLFVBQTRCLE1BQU0sTUFBTSxLQUFLLGFBQWEsTUFBTSxDQUFDLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDdkYsWUFBWSxVQUFrQyxNQUFNLFlBQVksS0FBSyxhQUFhLFlBQVksQ0FBQyxVQUFVLFdBQVcsQ0FBQztBQUFBLE1BQ3JILGtCQUFrQixRQUFRLE1BQU0sa0JBQWtCLEtBQUssYUFBYSxnQkFBZ0I7QUFBQSxNQUNwRixPQUFPLGdCQUFnQixXQUFXLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3RELFdBQVcsZ0JBQWdCLFdBQVcsTUFBTSxXQUFXLEtBQUssYUFBYSxXQUFXLEdBQUcsR0FBSztBQUFBLE1BQzVGLDBCQUEwQixRQUFRLE1BQU0sMEJBQTBCLEtBQUssYUFBYSx3QkFBd0I7QUFBQSxNQUM1Ryx3QkFBd0IsUUFBUSxNQUFNLHdCQUF3QixLQUFLLGFBQWEsc0JBQXNCO0FBQUEsTUFDdEc7QUFBQSxNQUNBLHVCQUF1QixrQkFBa0IsTUFBTSxrQkFBa0IsTUFBTSxNQUFNLHVCQUF1QixLQUFLLGFBQWEscUJBQXFCLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDbkosNEJBQTRCLGtCQUFrQixNQUFNLGtCQUFrQixNQUFNLE1BQU0sNEJBQTRCLEtBQUssYUFBYSwwQkFBMEIsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNsSztBQUFBLEVBQ0Q7QUFDRDtBQU1BLFNBQVMsK0JBQStCLHFCQUEwRTtBQUNqSCxNQUFJLHdCQUF3QixXQUFXO0FBQ3RDLFdBQVEsU0FBUyxjQUFjLFlBQVk7QUFBQSxFQUM1QztBQUNBLFNBQU87QUFDUjtBQXlCQSxNQUFNLHNCQUFzQixpQkFBNEY7QUFBQSxFQUV2SCxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsTUFBc0I7QUFBQSxNQUFXLEVBQUUsS0FBSyxHQUFHLFFBQVEsRUFBRTtBQUFBLE1BQ3JEO0FBQUEsUUFDQyxzQkFBc0I7QUFBQSxVQUNyQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxlQUFlLHFGQUFxRjtBQUFBLFFBQy9IO0FBQUEsUUFDQSx5QkFBeUI7QUFBQSxVQUN4QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxrQkFBa0IsdUZBQXVGO0FBQUEsUUFDcEk7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsUUFBK0M7QUFDOUQsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUVkLFdBQU87QUFBQSxNQUNOLEtBQUssZ0JBQWdCLFdBQVcsTUFBTSxLQUFLLEdBQUcsR0FBRyxHQUFJO0FBQUEsTUFDckQsUUFBUSxnQkFBZ0IsV0FBVyxNQUFNLFFBQVEsR0FBRyxHQUFHLEdBQUk7QUFBQSxJQUM1RDtBQUFBLEVBQ0Q7QUFDRDtBQTBCQSxNQUFNLDZCQUE2QixpQkFBeUc7QUFBQSxFQUUzSSxjQUFjO0FBQ2IsVUFBTSxXQUF5QztBQUFBLE1BQzlDLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxJQUNSO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFBNkI7QUFBQSxNQUFrQjtBQUFBLE1BQy9DO0FBQUEsUUFDQyxpQ0FBaUM7QUFBQSxVQUNoQyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUywwQkFBMEIsdUZBQXVGO0FBQUEsUUFDNUk7QUFBQSxRQUNBLCtCQUErQjtBQUFBLFVBQzlCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHdCQUF3QiwrRkFBK0Y7QUFBQSxRQUNsSjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxRQUErQztBQUM5RCxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sU0FBUyxRQUFRLE1BQU0sU0FBUyxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQ3pELE9BQU8sUUFBUSxNQUFNLE9BQU8sS0FBSyxhQUFhLEtBQUs7QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFDRDtBQU1BLE1BQU0seUJBQXlCLHFCQUFzRDtBQUFBLEVBRXBGLGNBQWM7QUFDYixVQUFNLHNCQUF5QixDQUFDO0FBQUEsRUFDakM7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBaUMsR0FBbUI7QUFDOUYsV0FBTyxJQUFJO0FBQUEsRUFDWjtBQUNEO0FBTUEsTUFBTSwwQkFBMEIsaUJBQW1GO0FBQUEsRUFDbEgsY0FBYztBQUNiLFVBQU0sdUJBQTBCLGVBQWUsTUFBUztBQUFBLEVBQ3pEO0FBQUEsRUFFTyxTQUFTLE9BQW9DO0FBQ25ELFFBQUksT0FBTyxVQUFVLGFBQWE7QUFDakMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFzQkEsTUFBTSwrQkFBK0IsaUJBQTZJO0FBQUEsRUFJakwsY0FBYztBQUNiLFVBQU0sV0FBNEM7QUFBQSxNQUNqRCxPQUFPO0FBQUEsTUFDUCxVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsSUFDVjtBQUNBLFVBQU0sUUFBdUI7QUFBQSxNQUM1QixFQUFFLE1BQU0sVUFBVTtBQUFBLE1BQ2xCO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixNQUFNLENBQUMsTUFBTSxVQUFVLE9BQU8sMEJBQTBCO0FBQUEsUUFDeEQsa0JBQWtCLENBQUMsSUFBSSxTQUFTLE1BQU0sa0RBQWtELEdBQUcsSUFBSSxTQUFTLFVBQVUsc0NBQXNDLEdBQUcsSUFBSSxTQUFTLE9BQU8sZ0NBQWdDLEdBQUcsSUFBSSxTQUFTLDRCQUE0QixvRUFBb0UsQ0FBQztBQUFBLE1BQ2pVO0FBQUEsSUFDRDtBQUNBLFVBQU0sNEJBQStCLG9CQUFvQixVQUFVO0FBQUEsTUFDbEUsT0FBTztBQUFBLFFBQ04sRUFBRSxNQUFNLFVBQVU7QUFBQSxRQUNsQjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLE1BQU0sVUFBVSxPQUFPLDBCQUEwQjtBQUFBLFVBQ3hELGtCQUFrQixDQUFDLElBQUksU0FBUyxnQ0FBZ0MsbURBQW1ELEdBQUcsSUFBSSxTQUFTLG9DQUFvQywwREFBMEQsR0FBRyxJQUFJLFNBQVMsaUNBQWlDLG9EQUFvRCxHQUFHLElBQUksU0FBUyxzREFBc0Qsd0ZBQXdGLENBQUM7QUFBQSxRQUN0ZTtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLHNCQUFzQjtBQUFBLFVBQ3RCLFlBQVk7QUFBQSxZQUNYLFNBQVM7QUFBQSxjQUNSLE9BQU87QUFBQSxjQUNQLFNBQVMsU0FBUztBQUFBLGNBQ2xCLGFBQWEsSUFBSSxTQUFTLDRCQUE0QiwwQ0FBMEM7QUFBQSxZQUNqRztBQUFBLFlBQ0EsVUFBVTtBQUFBLGNBQ1QsT0FBTztBQUFBLGNBQ1AsU0FBUyxTQUFTO0FBQUEsY0FDbEIsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLDJDQUEyQztBQUFBLFlBQ25HO0FBQUEsWUFDQSxPQUFPO0FBQUEsY0FDTixPQUFPO0FBQUEsY0FDUCxTQUFTLFNBQVM7QUFBQSxjQUNsQixhQUFhLElBQUksU0FBUywwQkFBMEIsMkRBQTJEO0FBQUEsWUFDaEg7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMsb0JBQW9CLDRVQUE0VSx1Q0FBdUM7QUFBQSxNQUN6YSxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUEsRUFFTyxTQUFTLE9BQWlEO0FBQ2hFLFFBQUksT0FBTyxVQUFVLFdBQVc7QUFFL0IsWUFBTSxRQUFRLFFBQVEsT0FBTztBQUM3QixhQUFPLEVBQUUsVUFBVSxPQUFPLFNBQVMsT0FBTyxPQUFPLE1BQU07QUFBQSxJQUN4RDtBQUNBLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFFOUIsWUFBTUMsaUJBQXlDLENBQUMsTUFBTSxVQUFVLE9BQU8sMEJBQTBCO0FBQ2pHLFlBQU0sWUFBWSxVQUFpQyxPQUFnQyxLQUFLLGFBQWEsT0FBT0EsY0FBYTtBQUN6SCxhQUFPLEVBQUUsVUFBVSxXQUFXLFNBQVMsV0FBVyxPQUFPLFVBQVU7QUFBQSxJQUNwRTtBQUNBLFFBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBRXhDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxVQUFNLEVBQUUsT0FBTyxVQUFVLFFBQVEsSUFBK0I7QUFDaEUsVUFBTSxnQkFBeUMsQ0FBQyxNQUFNLFVBQVUsT0FBTywwQkFBMEI7QUFDakcsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosUUFBSSxPQUFPLFVBQVUsV0FBVztBQUMvQix1QkFBaUIsUUFBUSxPQUFPO0FBQUEsSUFDakMsT0FBTztBQUNOLHVCQUFpQixVQUFVLE9BQU8sS0FBSyxhQUFhLE9BQU8sYUFBYTtBQUFBLElBQ3pFO0FBQ0EsUUFBSSxPQUFPLGFBQWEsV0FBVztBQUNsQywwQkFBb0IsV0FBVyxPQUFPO0FBQUEsSUFDdkMsT0FBTztBQUNOLDBCQUFvQixVQUFVLFVBQVUsS0FBSyxhQUFhLFVBQVUsYUFBYTtBQUFBLElBQ2xGO0FBQ0EsUUFBSSxPQUFPLFlBQVksV0FBVztBQUNqQyx5QkFBbUIsVUFBVSxPQUFPO0FBQUEsSUFDckMsT0FBTztBQUNOLHlCQUFtQixVQUFVLFNBQVMsS0FBSyxhQUFhLFNBQVMsYUFBYTtBQUFBLElBQy9FO0FBQ0EsV0FBTztBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQ0Q7QUFRTyxJQUFXLHdCQUFYLGtCQUFXQywyQkFBWDtBQUNOLEVBQUFBLDhDQUFBLFNBQU0sS0FBTjtBQUNBLEVBQUFBLDhDQUFBLFFBQUssS0FBTDtBQUNBLEVBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUxpQixTQUFBQTtBQUFBLEdBQUE7QUFhbEIsTUFBTSxzQ0FBc0MsaUJBQW9HO0FBQUEsRUFFL0ksY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQTBCO0FBQUEsTUFBZSxFQUFFLFlBQVksWUFBMEIsVUFBVSxLQUFLO0FBQUEsTUFDaEc7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLE1BQU0sQ0FBQyxPQUFPLE1BQU0sWUFBWSxVQUFVO0FBQUEsUUFDMUMsa0JBQWtCO0FBQUEsVUFDakIsSUFBSSxTQUFTLG1CQUFtQixnQ0FBZ0M7QUFBQSxVQUNoRSxJQUFJLFNBQVMsa0JBQWtCLCtDQUErQztBQUFBLFVBQzlFLElBQUksU0FBUyx3QkFBd0Isb0VBQW9FO0FBQUEsVUFDekcsSUFBSSxTQUFTLHdCQUF3QiwyQ0FBMkM7QUFBQSxRQUNqRjtBQUFBLFFBQ0EsU0FBUztBQUFBLFFBQ1QsYUFBYSxJQUFJLFNBQVMsZUFBZSx1Q0FBdUM7QUFBQSxNQUNqRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLGFBQThEO0FBQzdFLFFBQUksYUFBb0MsS0FBSyxhQUFhO0FBQzFELFFBQUksV0FBb0QsS0FBSyxhQUFhO0FBRTFFLFFBQUksT0FBTyxnQkFBZ0IsYUFBYTtBQUN2QyxVQUFJLE9BQU8sZ0JBQWdCLFlBQVk7QUFDdEMscUJBQWE7QUFDYixtQkFBVztBQUFBLE1BQ1osV0FBVyxnQkFBZ0IsWUFBWTtBQUN0QyxxQkFBYTtBQUFBLE1BQ2QsV0FBVyxnQkFBZ0IsWUFBWTtBQUN0QyxxQkFBYTtBQUFBLE1BQ2QsV0FBVyxnQkFBZ0IsTUFBTTtBQUNoQyxxQkFBYTtBQUFBLE1BQ2QsT0FBTztBQUNOLHFCQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBU08sU0FBUyw0QkFBNEIsU0FBMEM7QUFDckYsUUFBTSw4QkFBOEIsUUFBUSxJQUFJLHFDQUF3QztBQUN4RixNQUFJLGdDQUFnQyxZQUFZO0FBQy9DLFdBQU8sUUFBUSxJQUFJLGtCQUFxQjtBQUFBLEVBQ3pDO0FBQ0EsU0FBTyxnQ0FBZ0MsT0FBTyxRQUFRO0FBQ3ZEO0FBU08sU0FBUyxzQkFBc0IsU0FBMEM7QUFDL0UsU0FBTyxDQUFDLFFBQVEsSUFBSSxxQ0FBd0M7QUFDN0Q7QUFXQSxNQUFNLHFCQUFxQixpQkFBaUY7QUFBQSxFQUUzRyxjQUFjO0FBQ2IsVUFBTSxXQUEyQixDQUFDO0FBQ2xDLFVBQU0sZUFBNEIsRUFBRSxNQUFNLFVBQVUsYUFBYSxJQUFJLFNBQVMsZUFBZSx3RUFBd0UsRUFBRTtBQUN2SztBQUFBLE1BQ0M7QUFBQSxNQUFxQjtBQUFBLE1BQVU7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFVBQ04sT0FBTztBQUFBLFlBQ047QUFBQSxZQUNBO0FBQUEsY0FDQyxNQUFNO0FBQUEsZ0JBQ0w7QUFBQSxjQUNEO0FBQUEsY0FDQSxZQUFZO0FBQUEsZ0JBQ1gsUUFBUTtBQUFBLGdCQUNSLE9BQU87QUFBQSxrQkFDTixNQUFNO0FBQUEsa0JBQ04sYUFBYSxJQUFJLFNBQVMsZ0JBQWdCLDZCQUE2QjtBQUFBLGtCQUN2RSxRQUFRO0FBQUEsZ0JBQ1Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxTQUFTO0FBQUEsUUFDVCxhQUFhLElBQUksU0FBUyxVQUFVLHdKQUF3SjtBQUFBLE1BQzdMO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsT0FBZ0M7QUFDL0MsUUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pCLFlBQU0sU0FBeUIsQ0FBQztBQUNoQyxpQkFBVyxZQUFZLE9BQU87QUFDN0IsWUFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQyxpQkFBTyxLQUFLO0FBQUEsWUFDWCxRQUFRLGdCQUFnQixXQUFXLFVBQVUsR0FBRyxHQUFHLEdBQUs7QUFBQSxZQUN4RCxPQUFPO0FBQUEsVUFDUixDQUFDO0FBQUEsUUFDRixXQUFXLFlBQVksT0FBTyxhQUFhLFVBQVU7QUFDcEQsZ0JBQU0sVUFBVTtBQUNoQixpQkFBTyxLQUFLO0FBQUEsWUFDWCxRQUFRLGdCQUFnQixXQUFXLFFBQVEsUUFBUSxHQUFHLEdBQUcsR0FBSztBQUFBLFlBQzlELE9BQU8sUUFBUTtBQUFBLFVBQ2hCLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUNBLGFBQU8sS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNO0FBQ3pDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBU0EsTUFBTSx3QkFBd0IsaUJBQXlHO0FBQUEsRUFDdEksY0FBYztBQUNiLFVBQU0sV0FBVztBQUVqQjtBQUFBLE1BQ0M7QUFBQSxNQUE4QjtBQUFBLE1BQW1CO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQThDO0FBQzdELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBMkdBLFNBQVMsK0JBQStCLFlBQXFCLGNBQXdEO0FBQ3BILE1BQUksT0FBTyxlQUFlLFVBQVU7QUFDbkMsV0FBTztBQUFBLEVBQ1I7QUFDQSxVQUFRLFlBQVk7QUFBQSxJQUNuQixLQUFLO0FBQVUsYUFBTyxvQkFBb0I7QUFBQSxJQUMxQyxLQUFLO0FBQVcsYUFBTyxvQkFBb0I7QUFBQSxJQUMzQztBQUFTLGFBQU8sb0JBQW9CO0FBQUEsRUFDckM7QUFDRDtBQUVBLE1BQU0sd0JBQXdCLGlCQUFrRztBQUFBLEVBRS9ILGNBQWM7QUFDYixVQUFNLFdBQTJDO0FBQUEsTUFDaEQsVUFBVSxvQkFBb0I7QUFBQSxNQUM5QixZQUFZLG9CQUFvQjtBQUFBLE1BQ2hDLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLG1CQUFtQjtBQUFBLE1BQ25CLHFCQUFxQjtBQUFBLE1BQ3JCLHlCQUF5QjtBQUFBLE1BQ3pCLHNCQUFzQjtBQUFBLE1BQ3RCLHVCQUF1QjtBQUFBLE1BQ3ZCLG9CQUFvQjtBQUFBLE1BQ3BCLGtCQUFrQjtBQUFBLE1BQ2xCLHlCQUF5QjtBQUFBLE1BQ3pCLGNBQWM7QUFBQSxNQUNkLDBDQUEwQztBQUFBLElBQzNDO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFBd0I7QUFBQSxNQUFhO0FBQUEsTUFDckM7QUFBQSxRQUNDLDZCQUE2QjtBQUFBLFVBQzVCLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxRQUFRLFdBQVcsUUFBUTtBQUFBLFVBQ2xDLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUywyQkFBMkIsNkRBQTZEO0FBQUEsWUFDckcsSUFBSSxTQUFTLDhCQUE4QixnREFBZ0Q7QUFBQSxZQUMzRixJQUFJLFNBQVMsMEJBQTBCLCtDQUErQztBQUFBLFVBQ3ZGO0FBQUEsVUFDQSxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxzQkFBc0Isb0RBQW9EO0FBQUEsUUFDckc7QUFBQSxRQUNBLCtCQUErQjtBQUFBLFVBQzlCLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxRQUFRLFdBQVcsUUFBUTtBQUFBLFVBQ2xDLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyw2QkFBNkIsK0RBQStEO0FBQUEsWUFDekcsSUFBSSxTQUFTLGdDQUFnQyxrREFBa0Q7QUFBQSxZQUMvRixJQUFJLFNBQVMsNEJBQTRCLGlEQUFpRDtBQUFBLFVBQzNGO0FBQUEsVUFDQSxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyx3QkFBd0Isc0RBQXNEO0FBQUEsUUFDekc7QUFBQSxRQUNBLDBDQUEwQztBQUFBLFVBQ3pDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG1DQUFtQyxzQ0FBc0M7QUFBQSxRQUNwRztBQUFBLFFBQ0EsNENBQTRDO0FBQUEsVUFDM0MsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMscUNBQXFDLHlDQUF5QztBQUFBLFFBQ3pHO0FBQUEsUUFDQSxpQ0FBaUM7QUFBQSxVQUNoQyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUywwQkFBMEIsbUVBQW1FO0FBQUEsUUFDeEg7QUFBQSxRQUNBLDZEQUE2RDtBQUFBLFVBQzVELE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHNEQUFzRCx3RkFBd0Y7QUFBQSxRQUN6SztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxRQUFpRDtBQUNoRSxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsVUFBTSwwQkFBMEIsZ0JBQWdCLFdBQVcsTUFBTSx5QkFBeUIsS0FBSyxhQUFhLHlCQUF5QixHQUFHLEdBQUk7QUFDNUksVUFBTSx3QkFBd0IsZ0JBQWdCLFdBQVcsTUFBTSx1QkFBdUIsS0FBSyxhQUFhLHVCQUF1QixHQUFHLEdBQUk7QUFDdEksV0FBTztBQUFBLE1BQ04sV0FBVyxnQkFBZ0IsV0FBVyxNQUFNLFdBQVcsS0FBSyxhQUFhLFdBQVcsR0FBRyxHQUFJO0FBQUEsTUFDM0YsVUFBVSwrQkFBK0IsTUFBTSxVQUFVLEtBQUssYUFBYSxRQUFRO0FBQUEsTUFDbkYsWUFBWSwrQkFBK0IsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDekYsWUFBWSxRQUFRLE1BQU0sWUFBWSxLQUFLLGFBQWEsVUFBVTtBQUFBLE1BQ2xFLG1CQUFtQixRQUFRLE1BQU0sbUJBQW1CLEtBQUssYUFBYSxpQkFBaUI7QUFBQSxNQUN2RixxQkFBcUIsUUFBUSxNQUFNLHFCQUFxQixLQUFLLGFBQWEsbUJBQW1CO0FBQUEsTUFDN0Ysa0JBQWtCLFFBQVEsTUFBTSxrQkFBa0IsS0FBSyxhQUFhLGdCQUFnQjtBQUFBLE1BQ3BGLHlCQUF5QixRQUFRLE1BQU0seUJBQXlCLEtBQUssYUFBYSx1QkFBdUI7QUFBQSxNQUN6RztBQUFBLE1BQ0Esc0JBQXNCLGdCQUFnQixXQUFXLE1BQU0sc0JBQXNCLHlCQUF5QixHQUFHLEdBQUk7QUFBQSxNQUM3RztBQUFBLE1BQ0Esb0JBQW9CLGdCQUFnQixXQUFXLE1BQU0sb0JBQW9CLHVCQUF1QixHQUFHLEdBQUk7QUFBQSxNQUN2RyxjQUFjLFFBQVEsTUFBTSxjQUFjLEtBQUssYUFBYSxZQUFZO0FBQUEsTUFDeEUsMENBQTBDLFFBQVEsTUFBTSwwQ0FBMEMsS0FBSyxhQUFhLHdDQUF3QztBQUFBLElBQzdKO0FBQUEsRUFDRDtBQUNEO0FBV08sTUFBTSx1QkFBNkM7QUFtRG5ELE1BQU0sNkJBQTZCO0FBQUEsRUFDekMsbUJBQW1CO0FBQUEsRUFDbkIscUJBQXFCO0FBQUEsRUFDckIsZUFBZTtBQUFBLEVBQ2YscUJBQXFCO0FBQUEsRUFDckIsaUJBQWlCO0FBQUEsRUFDakIsZ0JBQWdCO0FBQUEsRUFDaEIsZ0JBQWdCO0FBQ2pCO0FBRUEsTUFBTSx5QkFBeUIsaUJBQThHO0FBQUEsRUFDNUksY0FBYztBQUNiLFVBQU0sV0FBNEM7QUFBQSxNQUNqRCxlQUFlO0FBQUEsTUFDZixxQkFBcUI7QUFBQSxNQUNyQixxQkFBcUI7QUFBQSxNQUNyQixpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0I7QUFBQSxNQUNoQixtQkFBbUIsQ0FBQztBQUFBLE1BQ3BCLGdCQUFnQixFQUFFLEtBQUssTUFBTSxTQUFTLEtBQUs7QUFBQSxJQUM1QztBQUVBO0FBQUEsTUFDQztBQUFBLE1BQWtDO0FBQUEsTUFBb0I7QUFBQSxNQUN0RDtBQUFBLFFBQ0MsQ0FBQywyQkFBMkIsYUFBYSxHQUFHO0FBQUEsVUFDM0MsWUFBWTtBQUFBLFVBQ1osTUFBTSxDQUFDLFdBQVcsUUFBUTtBQUFBLFVBQzFCLE1BQU0sQ0FBQyxNQUFNLE9BQU8sb0JBQW9CO0FBQUEsVUFDeEMsU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsa0NBQWtDLDRLQUE0SztBQUFBLFFBQ3pPO0FBQUEsUUFDQSxDQUFDLDJCQUEyQixtQkFBbUIsR0FBRztBQUFBLFVBQ2pELFlBQVk7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHdDQUF3Qyw4RkFBOEY7QUFBQSxRQUNqSztBQUFBLFFBQ0EsQ0FBQywyQkFBMkIsbUJBQW1CLEdBQUc7QUFBQSxVQUNqRCxZQUFZO0FBQUEsVUFDWixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx3Q0FBd0Msd0pBQXdKO0FBQUEsUUFDM047QUFBQSxRQUNBLENBQUMsMkJBQTJCLGVBQWUsR0FBRztBQUFBLFVBQzdDLFlBQVk7QUFBQSxVQUNaLE1BQU0sQ0FBQyxXQUFXLFFBQVE7QUFBQSxVQUMxQixNQUFNLENBQUMsTUFBTSxPQUFPLG9CQUFvQjtBQUFBLFVBQ3hDLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLG9DQUFvQyx5RkFBeUY7QUFBQSxRQUN4SjtBQUFBLFFBQ0EsQ0FBQywyQkFBMkIsY0FBYyxHQUFHO0FBQUEsVUFDNUMsWUFBWTtBQUFBLFVBQ1osTUFBTSxDQUFDLFdBQVcsUUFBUTtBQUFBLFVBQzFCLE1BQU0sQ0FBQyxNQUFNLE9BQU8sb0JBQW9CO0FBQUEsVUFDeEMsU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsbUNBQW1DLHdGQUF3RjtBQUFBLFFBQ3RKO0FBQUEsUUFDQSxDQUFDLDJCQUEyQixpQkFBaUIsR0FBRztBQUFBLFVBQy9DLFlBQVk7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHNDQUFzQyw0REFBNEQ7QUFBQSxVQUM1SCxzQkFBc0I7QUFBQSxZQUNyQixNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUMsMkJBQTJCLGNBQWMsR0FBRztBQUFBLFVBQzVDLFlBQVk7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOLHNCQUFzQjtBQUFBLFlBQ3JCLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQSxTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxtQ0FBbUMsa0ZBQWtGO0FBQUEsUUFDaEo7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixZQUFZLE9BQWlFLFFBQXVIO0FBQ25OLFFBQUksWUFBWTtBQUNoQixRQUFJLE9BQU8scUJBQXFCLE9BQU87QUFFdEMsVUFBSSxDQUFDLFFBQVEsT0FBTyxNQUFNLG1CQUFtQixPQUFPLGlCQUFpQixHQUFHO0FBQ3ZFLGdCQUFRLEVBQUUsR0FBRyxPQUFPLG1CQUFtQixPQUFPLGtCQUFrQjtBQUNoRSxvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxPQUFPLGtCQUFrQixPQUFPO0FBRW5DLFVBQUksQ0FBQyxRQUFRLE9BQU8sTUFBTSxnQkFBZ0IsT0FBTyxjQUFjLEdBQUc7QUFDakUsZ0JBQVEsRUFBRSxHQUFHLE9BQU8sZ0JBQWdCLE9BQU8sZUFBZTtBQUMxRCxvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLE1BQU0sWUFBWSxPQUFPLE1BQU07QUFDOUMsUUFBSSxXQUFXO0FBQ2QsYUFBTyxJQUFJLGtCQUFrQixPQUFPLFVBQVUsSUFBSTtBQUFBLElBQ25EO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFNBQVMsUUFBa0Q7QUFDakUsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUNkLFdBQU87QUFBQSxNQUNOLGVBQWUsYUFBNkMsTUFBTSxlQUFlLHNCQUFzQixDQUFDLE1BQU0sT0FBTyxvQkFBb0IsQ0FBQztBQUFBLE1BQzFJLHFCQUFxQixRQUFRLE1BQU0scUJBQXFCLEtBQUssYUFBYSxtQkFBbUI7QUFBQSxNQUM3RixxQkFBcUIsUUFBUSxNQUFNLHFCQUFxQixLQUFLLGFBQWEsbUJBQW1CO0FBQUEsTUFDN0YsaUJBQWlCLGFBQTZDLE1BQU0saUJBQWlCLHNCQUFzQixDQUFDLE1BQU0sT0FBTyxvQkFBb0IsQ0FBQztBQUFBLE1BQzlJLGdCQUFnQixhQUE2QyxNQUFNLGdCQUFnQixzQkFBc0IsQ0FBQyxNQUFNLE9BQU8sb0JBQW9CLENBQUM7QUFBQSxNQUM1SSxtQkFBbUIsS0FBSyxtQkFBbUIsTUFBTSxtQkFBbUIsS0FBSyxhQUFhLGlCQUFpQjtBQUFBLE1BQ3ZHLGdCQUFnQixLQUFLLG1CQUFtQixNQUFNLGdCQUFnQixLQUFLLGFBQWEsY0FBYztBQUFBLElBQy9GO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQW1CLEtBQWMsY0FBMEQ7QUFDbEcsUUFBSyxPQUFPLFFBQVEsWUFBYSxDQUFDLEtBQUs7QUFDdEMsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQStCLENBQUM7QUFDdEMsZUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxHQUFHLEdBQUc7QUFDL0MsVUFBSSxVQUFVLE1BQU07QUFDbkIsZUFBTyxHQUFHLElBQUk7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUErRkEsTUFBTSw0QkFBNEIsaUJBQWtHO0FBQUEsRUFDbkksY0FBYztBQUNiLFVBQU0sV0FBeUM7QUFBQSxNQUM5QyxTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixxQkFBcUI7QUFBQSxNQUNyQixZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsTUFDWiwyQkFBMkI7QUFBQSxNQUMzQixjQUFjO0FBQUEsTUFDZCx1QkFBdUI7QUFBQSxNQUN2QixPQUFPO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxlQUFlO0FBQUEsUUFDZixrQkFBa0I7QUFBQSxRQUNsQixtQkFBbUI7QUFBQSxRQUNuQixzQkFBc0I7QUFBQSxRQUN0QixrQ0FBa0M7QUFBQSxNQUNuQztBQUFBLE1BQ0EsZ0NBQWdDO0FBQUEsTUFDaEMsY0FBYztBQUFBLFFBQ2IsMkJBQTJCO0FBQUEsUUFDM0IsdUJBQXVCO0FBQUEsUUFDdkIsMEJBQTBCO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFBNEI7QUFBQSxNQUFpQjtBQUFBLE1BQzdDO0FBQUEsUUFDQyxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx5QkFBeUIsMEVBQTBFO0FBQUEsUUFDOUg7QUFBQSxRQUNBLG9DQUFvQztBQUFBLFVBQ25DLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLE1BQU0sQ0FBQyxVQUFVLFdBQVcsT0FBTztBQUFBLFVBQ25DLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyxvQ0FBb0MsNEVBQTRFO0FBQUEsWUFDN0gsSUFBSSxTQUFTLHFDQUFxQyw2RUFBNkU7QUFBQSxZQUMvSCxJQUFJLFNBQVMsbUNBQW1DLDJDQUEyQztBQUFBLFVBQzVGO0FBQUEsVUFDQSxhQUFhLElBQUksU0FBUyw2QkFBNkIsc0RBQXNEO0FBQUEsUUFDOUc7QUFBQSxRQUNBLGtEQUFrRDtBQUFBLFVBQ2pELE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDJDQUEyQyxvRkFBb0Y7QUFBQSxRQUMxSjtBQUFBLFFBQ0EsNENBQTRDO0FBQUEsVUFDM0MsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMscUNBQXFDLG9LQUFvSztBQUFBLFFBQ3BPO0FBQUEsUUFDQSw4Q0FBOEM7QUFBQSxVQUM3QyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx1Q0FBdUMsMEVBQTBFO0FBQUEsUUFDNUk7QUFBQSxRQUNBLHFDQUFxQztBQUFBLFVBQ3BDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULFNBQVM7QUFBQSxVQUNULFNBQVM7QUFBQSxVQUNULGFBQWEsSUFBSSxTQUFTLDhCQUE4QixtR0FBbUc7QUFBQSxRQUM1SjtBQUFBLFFBQ0EsK0RBQStEO0FBQUEsVUFDOUQsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTLGFBQWE7QUFBQSxVQUMvQixNQUFNLENBQUMsY0FBYztBQUFBLFVBQ3JCLGFBQWEsSUFBSSxTQUFTLDJDQUEyQywrRUFBK0U7QUFBQSxVQUNwSixZQUFZO0FBQUEsWUFDWCxNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLDhEQUE4RDtBQUFBLFVBQzdELE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUyxhQUFhO0FBQUEsVUFDL0IsTUFBTSxDQUFDLGNBQWM7QUFBQSxVQUNyQixhQUFhLElBQUksU0FBUywwQ0FBMEMsbUZBQW1GO0FBQUEsVUFDdkosWUFBWTtBQUFBLFlBQ1gsTUFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNEO0FBQUEsUUFDQSx1REFBdUQ7QUFBQSxVQUN0RCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixNQUFNLENBQUMsY0FBYztBQUFBLFVBQ3JCLGFBQWEsSUFBSSxTQUFTLGdEQUFnRCxvRkFBb0Y7QUFBQSxVQUM5SixZQUFZO0FBQUEsWUFDWCxNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLDJEQUEyRDtBQUFBLFVBQzFELE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUyxhQUFhO0FBQUEsVUFDL0IsTUFBTSxDQUFDLGNBQWM7QUFBQSxVQUNyQixNQUFNLENBQUMsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFVBQ3ZELGFBQWEsSUFBSSxTQUFTLHVDQUF1QywrRUFBK0U7QUFBQSxVQUNoSixZQUFZO0FBQUEsWUFDWCxNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLG1DQUFtQztBQUFBLFVBQ2xDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDRCQUE0QixxREFBcUQ7QUFBQSxRQUM1RztBQUFBLFFBQ0EsZ0RBQWdEO0FBQUEsVUFDL0MsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTLE1BQU07QUFBQSxVQUN4QixhQUFhLElBQUksU0FBUyx5Q0FBeUMsb0dBQW9HO0FBQUEsVUFDdkssTUFBTSxDQUFDLFVBQVUsY0FBYyxPQUFPO0FBQUEsVUFDdEMsTUFBTSxDQUFDLHFCQUFxQjtBQUFBLFFBQzdCO0FBQUEsUUFDQSxtREFBbUQ7QUFBQSxVQUNsRCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVMsTUFBTTtBQUFBLFVBQ3hCLGFBQWEsSUFBSSxTQUFTLDRDQUE0Qyw4REFBOEQ7QUFBQSxVQUNwSSxNQUFNLENBQUMsdUJBQXVCLGNBQWM7QUFBQSxRQUM3QztBQUFBLFFBQ0EsK0RBQStEO0FBQUEsVUFDOUQsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTLE1BQU07QUFBQSxVQUN4QixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyx3REFBd0QsaUxBQWlMO0FBQUEsVUFDblEsTUFBTSxDQUFDLHVCQUF1QixjQUFjO0FBQUEsVUFDNUMsWUFBWTtBQUFBLFlBQ1gsTUFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNEO0FBQUEsUUFDQSwrQ0FBK0M7QUFBQSxVQUM5QyxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVMsTUFBTTtBQUFBLFVBQ3hCLGFBQWEsSUFBSSxTQUFTLHdDQUF3QyxnRUFBZ0U7QUFBQSxVQUNsSSxNQUFNLENBQUMsUUFBUSxPQUFPO0FBQUEsVUFDdEIsa0JBQWtCO0FBQUEsWUFDakIsSUFBSSxTQUFTLG9EQUFvRCx5R0FBeUc7QUFBQSxZQUMxSyxJQUFJLFNBQVMscURBQXFELGlGQUFpRjtBQUFBLFVBQ3BKO0FBQUEsVUFDQSxNQUFNLENBQUMscUJBQXFCO0FBQUEsUUFDN0I7QUFBQSxRQUNBLDRDQUE0QztBQUFBLFVBQzNDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUyxNQUFNO0FBQUEsVUFDeEIsYUFBYSxJQUFJLFNBQVMscUNBQXFDLDZFQUE2RTtBQUFBLFVBQzVJLE1BQU0sQ0FBQyxxQkFBcUI7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxRQUErQztBQUM5RCxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sU0FBUyxRQUFRLE1BQU0sU0FBUyxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQ3pELE1BQU0sVUFBVSxNQUFNLE1BQU0sS0FBSyxhQUFhLE1BQU0sQ0FBQyxVQUFVLFdBQVcsY0FBYyxDQUFDO0FBQUEsTUFDekYsYUFBYSxVQUFVLE1BQU0sYUFBYSxLQUFLLGFBQWEsYUFBYSxDQUFDLFVBQVUsV0FBVyxPQUFPLENBQUM7QUFBQSxNQUN2RyxxQkFBcUIsUUFBUSxNQUFNLHFCQUFxQixLQUFLLGFBQWEsbUJBQW1CO0FBQUEsTUFDN0YsWUFBWSxRQUFRLE1BQU0sWUFBWSxLQUFLLGFBQWEsVUFBVTtBQUFBLE1BQ2xFLFlBQVksbUJBQW1CLE9BQU8sTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDcEYsMkJBQTJCLFFBQVEsTUFBTSwyQkFBMkIsS0FBSyxhQUFhLHlCQUF5QjtBQUFBLE1BQy9HLGNBQWMsZ0JBQWdCLFdBQVcsTUFBTSxjQUFjLEdBQUcsR0FBRyxHQUFLO0FBQUEsTUFDeEUsdUJBQXVCLFFBQVEsTUFBTSx1QkFBdUIsS0FBSyxhQUFhLHFCQUFxQjtBQUFBLE1BQ25HLE9BQU8sS0FBSyxlQUFlLE1BQU0sS0FBSztBQUFBLE1BQ3RDLGdDQUFnQyxRQUFRLE1BQU0sZ0NBQWdDLEtBQUssYUFBYSw4QkFBOEI7QUFBQSxNQUM5SCxjQUFjLEtBQUssc0JBQXNCLE1BQU0sWUFBWTtBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxRQUF3RDtBQUM5RSxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUssYUFBYTtBQUFBLElBQzFCO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sU0FBUyxRQUFRLE1BQU0sU0FBUyxLQUFLLGFBQWEsTUFBTSxPQUFPO0FBQUEsTUFDL0QsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsTUFBTSxhQUFhO0FBQUEsTUFDakYsbUJBQW1CLFVBQVUsTUFBTSxtQkFBbUIsS0FBSyxhQUFhLE1BQU0sbUJBQW1CLENBQUMsVUFBVSxjQUFjLE9BQU8sQ0FBQztBQUFBLE1BQ2xJLHNCQUFzQixRQUFRLE1BQU0sc0JBQXNCLEtBQUssYUFBYSxNQUFNLG9CQUFvQjtBQUFBLE1BQ3RHLGtDQUFrQyxnQkFBZ0IsV0FBVyxNQUFNLGtDQUFrQyxLQUFLLGFBQWEsTUFBTSxrQ0FBa0MsR0FBRyxFQUFFO0FBQUEsTUFDcEssa0JBQWtCLFVBQVUsTUFBTSxrQkFBa0IsS0FBSyxhQUFhLE1BQU0sa0JBQWtCLENBQUMsU0FBUyxNQUFNLENBQUM7QUFBQSxJQUNoSDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixRQUErRDtBQUM1RixRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUssYUFBYTtBQUFBLElBQzFCO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sMkJBQTJCLG1CQUFtQixPQUFPLE1BQU0sMkJBQTJCLEtBQUssYUFBYSxhQUFhLHlCQUF5QjtBQUFBLE1BQzlJLHVCQUF1QixVQUFVLE1BQU0sdUJBQXVCLEtBQUssYUFBYSxhQUFhLHVCQUF1QixDQUFDLFVBQVUsU0FBUyw2QkFBNkIsQ0FBQztBQUFBLE1BQ3RLLDBCQUEwQixRQUFRLE1BQU0sMEJBQTBCLEtBQUssYUFBYSxhQUFhLHdCQUF3QjtBQUFBLElBQzFIO0FBQUEsRUFDRDtBQUNEO0FBMEJBLE1BQU0sZ0NBQWdDLGlCQUFnSTtBQUFBLEVBQ3JLLGNBQWM7QUFDYixVQUFNLFdBQW1EO0FBQUEsTUFDeEQsU0FBUyxzQkFBc0IsK0JBQStCO0FBQUEsTUFDOUQsb0NBQW9DLHNCQUFzQiwrQkFBK0I7QUFBQSxJQUMxRjtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQXNDO0FBQUEsTUFBMkI7QUFBQSxNQUNqRTtBQUFBLFFBQ0MsMENBQTBDO0FBQUEsVUFDekMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIscUJBQXFCLElBQUksU0FBUyxtQ0FBbUMsbUhBQW1ILG1DQUFtQztBQUFBLFFBQzVOO0FBQUEsUUFDQSxxRUFBcUU7QUFBQSxVQUNwRSxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyw4REFBOEQsd0VBQXdFO0FBQUEsUUFDaks7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsUUFBeUQ7QUFDeEUsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sUUFBUTtBQUNkLFdBQU87QUFBQSxNQUNOLFNBQVMsUUFBUSxNQUFNLFNBQVMsS0FBSyxhQUFhLE9BQU87QUFBQSxNQUN6RCxvQ0FBb0MsUUFBUSxNQUFNLG9DQUFvQyxLQUFLLGFBQWEsa0NBQWtDO0FBQUEsSUFDM0k7QUFBQSxFQUNEO0FBQ0Q7QUE4Q0EsTUFBTSxxQkFBcUIsaUJBQTZFO0FBQUEsRUFDdkcsY0FBYztBQUNiLFVBQU0sV0FBa0M7QUFBQSxNQUN2QyxjQUFjO0FBQUEsTUFDZCx3QkFBd0I7QUFBQSxNQUN4Qiw0QkFBNEI7QUFBQSxNQUU1QixhQUFhO0FBQUEsTUFDYiw0QkFBNEI7QUFBQSxJQUM3QjtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQXFCO0FBQUEsTUFBVTtBQUFBLE1BQy9CO0FBQUEsUUFDQyw4QkFBOEI7QUFBQSxVQUM3QixNQUFNLENBQUMsV0FBVyxRQUFRO0FBQUEsVUFDMUIsTUFBTSxDQUFDLE1BQU0sVUFBVSxLQUFLO0FBQUEsVUFDNUIsa0JBQWtCO0FBQUEsWUFDakIsSUFBSSxTQUFTLG1DQUFtQyw4QkFBOEI7QUFBQSxZQUM5RSxJQUFJLFNBQVMscUNBQXFDLCtEQUErRDtBQUFBLFlBQ2pILElBQUksU0FBUyxvQ0FBb0MsK0JBQStCO0FBQUEsVUFDakY7QUFBQSxVQUNBLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDhCQUE4QiwwREFBMEQ7QUFBQSxRQUNuSDtBQUFBLFFBQ0Esd0NBQXdDO0FBQUEsVUFDdkMsTUFBTSxDQUFDLFdBQVcsUUFBUTtBQUFBLFVBQzFCLE1BQU0sQ0FBQyxNQUFNLFVBQVUsS0FBSztBQUFBLFVBQzVCLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyw2Q0FBNkMsd0VBQXdFO0FBQUEsWUFDbEksSUFBSSxTQUFTLCtDQUErQyw2REFBNkQ7QUFBQSxZQUN6SCxJQUFJLFNBQVMsOENBQThDLDBDQUEwQztBQUFBLFVBQ3RHO0FBQUEsVUFDQSxTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx3Q0FBd0MscUVBQXFFO0FBQUEsUUFDeEk7QUFBQSxRQUNBLDRDQUE0QztBQUFBLFVBQzNDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDRDQUE0Qyx1RUFBdUU7QUFBQSxRQUM5STtBQUFBLFFBQ0EsNkJBQTZCO0FBQUEsVUFDNUIsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLDBEQUEwRDtBQUFBLFFBQ2xIO0FBQUEsUUFDQSw0Q0FBNEM7QUFBQSxVQUMzQyxNQUFNLENBQUMsV0FBVyxRQUFRO0FBQUEsVUFDMUIsTUFBTSxDQUFDLE1BQU0sVUFBVSxLQUFLO0FBQUEsVUFDNUIsa0JBQWtCO0FBQUEsWUFDakIsSUFBSSxTQUFTLGlEQUFpRCxxQ0FBcUM7QUFBQSxZQUNuRyxJQUFJLFNBQVMsbURBQW1ELDRFQUE0RTtBQUFBLFlBQzVJLElBQUksU0FBUyxrREFBa0QsMkNBQTJDO0FBQUEsVUFDM0c7QUFBQSxVQUNBLFNBQVMsU0FBUztBQUFBLFVBRWxCLGFBQWEsSUFBSSxTQUFTLDRDQUE0Qyx1RUFBdUU7QUFBQSxRQUM5STtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sU0FBUyxRQUF3QztBQUN2RCxRQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsVUFBVTtBQUMxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxRQUFRO0FBQ2QsV0FBTztBQUFBLE1BQ04sY0FBYyxhQUFhLE1BQU0sY0FBYyxLQUFLLGFBQWEsY0FBYyxDQUFDLE1BQU0sT0FBTyxRQUFRLENBQUM7QUFBQSxNQUN0Ryx3QkFBd0IsYUFBYSxNQUFNLHdCQUF3QixLQUFLLGFBQWEsd0JBQXdCLENBQUMsTUFBTSxPQUFPLFFBQVEsQ0FBQztBQUFBLE1BQ3BJLDRCQUE0QixRQUFRLE1BQU0sNEJBQTRCLEtBQUssYUFBYSwwQkFBMEI7QUFBQSxNQUVsSCxhQUFhLFFBQVEsTUFBTSxhQUFhLEtBQUssYUFBYSxXQUFXO0FBQUEsTUFDckUsNEJBQTRCLGFBQWEsTUFBTSw0QkFBNEIsS0FBSyxhQUFhLDRCQUE0QixDQUFDLE1BQU0sT0FBTyxRQUFRLENBQUM7QUFBQSxJQUNqSjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsYUFBeUMsT0FBZ0IsY0FBaUIsZUFBdUI7QUFDekcsUUFBTSxNQUFNLGNBQWMsUUFBUSxLQUFVO0FBQzVDLE1BQUksUUFBUSxJQUFJO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLGNBQWMsR0FBRztBQUN6QjtBQXVMQSxNQUFNLHNCQUFzQixpQkFBZ0Y7QUFBQSxFQUUzRyxjQUFjO0FBQ2IsVUFBTSxXQUFtQztBQUFBLE1BQ3hDLFlBQVk7QUFBQSxNQUNaLGdCQUFnQjtBQUFBLE1BQ2hCLGlDQUFpQztBQUFBLE1BQ2pDLGVBQWU7QUFBQSxNQUNmLHdCQUF3QjtBQUFBLE1BQ3hCLGVBQWU7QUFBQSxNQUNmLFdBQVc7QUFBQSxNQUNYLGVBQWU7QUFBQSxNQUNmLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQjtBQUFBLE1BQ25CLGFBQWE7QUFBQSxNQUNiLGVBQWU7QUFBQSxNQUNmLGtCQUFrQjtBQUFBLE1BQ2xCLGdCQUFnQjtBQUFBLE1BQ2hCLHNCQUFzQjtBQUFBLE1BQ3RCLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxNQUNiLGFBQWE7QUFBQSxNQUNiLGdCQUFnQjtBQUFBLE1BQ2hCLGFBQWE7QUFBQSxNQUNiLGdCQUFnQjtBQUFBLE1BQ2hCLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLFdBQVc7QUFBQSxNQUNYLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFBQSxNQUNkLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYLGdCQUFnQjtBQUFBLE1BQ2hCLGFBQWE7QUFBQSxNQUNiLG9CQUFvQjtBQUFBLE1BQ3BCLGNBQWM7QUFBQSxNQUNkLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxJQUNiO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFBc0I7QUFBQSxNQUFXO0FBQUEsTUFDakM7QUFBQSxRQUNDLDZCQUE2QjtBQUFBLFVBQzVCLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxVQUFVLFNBQVM7QUFBQSxVQUMxQixrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsNkJBQTZCLGlFQUFpRTtBQUFBLFlBQzNHLElBQUksU0FBUyw4QkFBOEIsMkRBQTJEO0FBQUEsVUFDdkc7QUFBQSxVQUNBLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHNCQUFzQixtSUFBbUk7QUFBQSxRQUNwTDtBQUFBLFFBQ0EsaUNBQWlDO0FBQUEsVUFDaEMsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMsMEJBQTBCLDhFQUE4RTtBQUFBLFFBQ25JO0FBQUEsUUFDQSxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyx5QkFBeUIsd0VBQXdFO0FBQUEsUUFDNUg7QUFBQSxRQUNBLHlDQUF5QztBQUFBLFVBQ3hDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLHFCQUFxQixJQUFJLFNBQVMsa0NBQWtDLDJJQUEySTtBQUFBLFFBQ2hOO0FBQUEsUUFDQSxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsVUFBVSxTQUFTLHdCQUF3QixxQkFBcUI7QUFBQSxVQUN2RSxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsNkJBQTZCLHdFQUF3RTtBQUFBLFlBQ2xILElBQUksU0FBUyw0QkFBNEIsdUVBQXVFO0FBQUEsWUFDaEgsSUFBSSxTQUFTLDJDQUEyQyxpRkFBaUY7QUFBQSxZQUN6SSxJQUFJLFNBQVMsMENBQTBDLG9FQUFvRTtBQUFBLFVBQzVIO0FBQUEsVUFDQSxTQUFTLFNBQVM7QUFBQSxVQUNsQixxQkFBcUIsSUFBSSxTQUFTLHlCQUF5Qiw2T0FBNk8sK0JBQStCLHVDQUF1QztBQUFBLFFBQy9XO0FBQUEsUUFDQSxrREFBa0Q7QUFBQSxVQUNqRCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUywyQ0FBMkMsZ0VBQWdFO0FBQUEsUUFDdEk7QUFBQSxRQUNBLDRCQUE0QjtBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLHFCQUFxQix3REFBd0Q7QUFBQSxRQUN4RztBQUFBLFFBQ0EsZ0NBQWdDO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sU0FBUyxTQUFTO0FBQUEsVUFDbEIsYUFBYSxJQUFJLFNBQVMseUJBQXlCLGdGQUFnRjtBQUFBLFFBQ3BJO0FBQUEsUUFDQSwwQkFBMEI7QUFBQSxVQUN6QixNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVM7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxtQkFBbUIsbUVBQW1FO0FBQUEsUUFDakg7QUFBQSxRQUNBLG9DQUFvQztBQUFBLFVBQ25DLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDZCQUE2Qiw0RkFBNEY7QUFBQSxRQUNwSjtBQUFBLFFBQ0EsZ0NBQWdDO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sb0JBQW9CLElBQUksU0FBUyxjQUFjLHVJQUF1STtBQUFBLFFBQ3ZMO0FBQUEsUUFDQSw4QkFBOEI7QUFBQSxVQUM3QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLDhCQUE4Qix1REFBdUQ7QUFBQSxRQUN4SDtBQUFBLFFBQ0EsZ0NBQWdDO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyxnQ0FBZ0MseURBQXlEO0FBQUEsUUFDNUg7QUFBQSxRQUNBLG1DQUFtQztBQUFBLFVBQ2xDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsbUNBQW1DLDREQUE0RDtBQUFBLFFBQ2xJO0FBQUEsUUFDQSxpQ0FBaUM7QUFBQSxVQUNoQyxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLGlDQUFpQywyREFBMkQ7QUFBQSxRQUMvSDtBQUFBLFFBQ0EsdUNBQXVDO0FBQUEsVUFDdEMsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyx1Q0FBdUMsbVFBQW1RO0FBQUEsUUFDN1U7QUFBQSxRQUNBLDZCQUE2QjtBQUFBLFVBQzVCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNkJBQTZCLHNEQUFzRDtBQUFBLFFBQ3RIO0FBQUEsUUFDQSxnQ0FBZ0M7QUFBQSxVQUMvQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyx5REFBeUQ7QUFBQSxRQUM1SDtBQUFBLFFBQ0EsOEJBQThCO0FBQUEsVUFDN0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw2QkFBNkIsc0RBQXNEO0FBQUEsUUFDdEg7QUFBQSxRQUNBLDhCQUE4QjtBQUFBLFVBQzdCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsOEJBQThCLHVEQUF1RDtBQUFBLFFBQ3hIO0FBQUEsUUFDQSxpQ0FBaUM7QUFBQSxVQUNoQyxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLGlDQUFpQywwREFBMEQ7QUFBQSxRQUM5SDtBQUFBLFFBQ0EsOEJBQThCO0FBQUEsVUFDN0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw4QkFBOEIsdURBQXVEO0FBQUEsUUFDeEg7QUFBQSxRQUNBLGlDQUFpQztBQUFBLFVBQ2hDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsZ0NBQWdDLHlEQUF5RDtBQUFBLFFBQzVIO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLDZCQUE2QixzREFBc0Q7QUFBQSxRQUN0SDtBQUFBLFFBQ0EsZ0NBQWdDO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyxnQ0FBZ0MseURBQXlEO0FBQUEsUUFDNUg7QUFBQSxRQUNBLDRCQUE0QjtBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLHFEQUFxRDtBQUFBLFFBQ3BIO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLDZCQUE2QixzREFBc0Q7QUFBQSxRQUN0SDtBQUFBLFFBQ0EsZ0NBQWdDO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyxnQ0FBZ0MseURBQXlEO0FBQUEsUUFDNUg7QUFBQSxRQUNBLDRCQUE0QjtBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLHFEQUFxRDtBQUFBLFFBQ3BIO0FBQUEsUUFDQSxrQ0FBa0M7QUFBQSxVQUNqQyxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLGtDQUFrQywyREFBMkQ7QUFBQSxRQUNoSTtBQUFBLFFBQ0EsK0JBQStCO0FBQUEsVUFDOUIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUywrQkFBK0Isd0RBQXdEO0FBQUEsUUFDMUg7QUFBQSxRQUNBLDRCQUE0QjtBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLHFEQUFxRDtBQUFBLFFBQ3BIO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLDZCQUE2QixzREFBc0Q7QUFBQSxRQUN0SDtBQUFBLFFBQ0EsNEJBQTRCO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw0QkFBNEIscURBQXFEO0FBQUEsUUFDcEg7QUFBQSxRQUNBLGlDQUFpQztBQUFBLFVBQ2hDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsaUNBQWlDLDBEQUEwRDtBQUFBLFFBQzlIO0FBQUEsUUFDQSxtQ0FBbUM7QUFBQSxVQUNsQyxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLG1DQUFtQyw0REFBNEQ7QUFBQSxRQUNsSTtBQUFBLFFBQ0EsOEJBQThCO0FBQUEsVUFDN0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw4QkFBOEIsdURBQXVEO0FBQUEsUUFDeEg7QUFBQSxRQUNBLHFDQUFxQztBQUFBLFVBQ3BDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLDhEQUE4RDtBQUFBLFFBQ3RJO0FBQUEsUUFDQSwrQkFBK0I7QUFBQSxVQUM5QixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLCtCQUErQix3REFBd0Q7QUFBQSxRQUMxSDtBQUFBLFFBQ0EsNEJBQTRCO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw0QkFBNEIscURBQXFEO0FBQUEsUUFDcEg7QUFBQSxRQUNBLDZCQUE2QjtBQUFBLFVBQzVCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNkJBQTZCLHVEQUF1RDtBQUFBLFFBQ3ZIO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQXlDO0FBQ3hELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixZQUFZLFVBQVUsTUFBTSxZQUFZLEtBQUssYUFBYSxZQUFZLENBQUMsVUFBVSxTQUFTLENBQUM7QUFBQSxNQUMzRixnQkFBZ0IsUUFBUSxNQUFNLGdCQUFnQixLQUFLLGFBQWEsY0FBYztBQUFBLE1BQzlFLGlDQUFpQyxRQUFRLE1BQU0saUNBQWlDLEtBQUssYUFBYSxjQUFjO0FBQUEsTUFDaEgsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQzNFLHdCQUF3QixRQUFRLE1BQU0sd0JBQXdCLEtBQUssYUFBYSxzQkFBc0I7QUFBQSxNQUN0RyxlQUFlLFVBQVUsTUFBTSxlQUFlLEtBQUssYUFBYSxlQUFlLENBQUMsVUFBVSxTQUFTLHVCQUF1QixzQkFBc0IsQ0FBQztBQUFBLE1BQ2pKLFdBQVcsUUFBUSxNQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVM7QUFBQSxNQUMvRCxlQUFlLFFBQVEsTUFBTSxlQUFlLEtBQUssYUFBYSxhQUFhO0FBQUEsTUFDM0UsU0FBUyxRQUFRLE1BQU0sU0FBUyxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQ3pELGFBQWEsVUFBVSxNQUFNLGFBQWEsS0FBSyxhQUFhLGFBQWEsQ0FBQyxVQUFVLFdBQVcsY0FBYyxDQUFDO0FBQUEsTUFDOUcsbUJBQW1CLFFBQVEsTUFBTSxtQkFBbUIsS0FBSyxhQUFhLGlCQUFpQjtBQUFBLE1BQ3ZGLG1CQUFtQixRQUFRLE1BQU0sbUJBQW1CLEtBQUssYUFBYSxpQkFBaUI7QUFBQSxNQUN2RixhQUFhLFFBQVEsTUFBTSxhQUFhLEtBQUssYUFBYSxXQUFXO0FBQUEsTUFDckUsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQzNFLGtCQUFrQixRQUFRLE1BQU0sa0JBQWtCLEtBQUssYUFBYSxnQkFBZ0I7QUFBQSxNQUNwRixnQkFBZ0IsUUFBUSxNQUFNLGdCQUFnQixLQUFLLGFBQWEsY0FBYztBQUFBLE1BQzlFLHNCQUFzQixRQUFRLE1BQU0sc0JBQXNCLEtBQUssYUFBYSxvQkFBb0I7QUFBQSxNQUNoRyxZQUFZLFFBQVEsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDbEUsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQzNFLGFBQWEsUUFBUSxNQUFNLGFBQWEsS0FBSyxhQUFhLFdBQVc7QUFBQSxNQUNyRSxhQUFhLFFBQVEsTUFBTSxhQUFhLEtBQUssYUFBYSxXQUFXO0FBQUEsTUFDckUsZ0JBQWdCLFFBQVEsTUFBTSxnQkFBZ0IsS0FBSyxhQUFhLGNBQWM7QUFBQSxNQUM5RSxhQUFhLFFBQVEsTUFBTSxhQUFhLEtBQUssYUFBYSxXQUFXO0FBQUEsTUFDckUsZ0JBQWdCLFFBQVEsTUFBTSxnQkFBZ0IsS0FBSyxhQUFhLGNBQWM7QUFBQSxNQUM5RSxZQUFZLFFBQVEsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDbEUsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQzNFLFdBQVcsUUFBUSxNQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVM7QUFBQSxNQUMvRCxZQUFZLFFBQVEsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsTUFDbEUsZUFBZSxRQUFRLE1BQU0sZUFBZSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQzNFLFdBQVcsUUFBUSxNQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVM7QUFBQSxNQUMvRCxpQkFBaUIsUUFBUSxNQUFNLGlCQUFpQixLQUFLLGFBQWEsZUFBZTtBQUFBLE1BQ2pGLGNBQWMsUUFBUSxNQUFNLGNBQWMsS0FBSyxhQUFhLFlBQVk7QUFBQSxNQUN4RSxXQUFXLFFBQVEsTUFBTSxXQUFXLEtBQUssYUFBYSxTQUFTO0FBQUEsTUFDL0QsWUFBWSxRQUFRLE1BQU0sWUFBWSxLQUFLLGFBQWEsVUFBVTtBQUFBLE1BQ2xFLFdBQVcsUUFBUSxNQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVM7QUFBQSxNQUMvRCxnQkFBZ0IsUUFBUSxNQUFNLGdCQUFnQixLQUFLLGFBQWEsY0FBYztBQUFBLE1BQzlFLGFBQWEsUUFBUSxNQUFNLGFBQWEsS0FBSyxhQUFhLFdBQVc7QUFBQSxNQUNyRSxvQkFBb0IsUUFBUSxNQUFNLG9CQUFvQixLQUFLLGFBQWEsa0JBQWtCO0FBQUEsTUFDMUYsY0FBYyxRQUFRLE1BQU0sY0FBYyxLQUFLLGFBQWEsWUFBWTtBQUFBLE1BQ3hFLFdBQVcsUUFBUSxNQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVM7QUFBQSxNQUMvRCxZQUFZLFFBQVEsTUFBTSxZQUFZLEtBQUssYUFBYSxVQUFVO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBQ0Q7QUFnQkEsTUFBTSxvQkFBb0IsaUJBQW9GO0FBQUEsRUFFN0csY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLE1BQTBCO0FBQUEsTUFDMUI7QUFBQSxRQUNDLG9DQUFvQztBQUFBLFFBQ3BDLGdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsTUFDQTtBQUFBLFFBQ0MseURBQXlEO0FBQUEsVUFDeEQsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLG9FQUFvRTtBQUFBLFVBQ3BJLFNBQVM7QUFBQSxVQUNULE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxxQ0FBcUM7QUFBQSxVQUNwQyxhQUFhLElBQUksU0FBUyxrQkFBa0IsNEVBQTRFO0FBQUEsVUFDeEgsU0FBUztBQUFBLFVBQ1QsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsT0FBeUQ7QUFDeEUsUUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDeEMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFdBQU87QUFBQSxNQUNOLG9DQUFvQyxRQUFTLE1BQThCLG9DQUFvQyxLQUFLLGFBQWEsa0NBQWtDO0FBQUEsTUFDbkssZ0JBQWdCLFFBQVMsTUFBOEIsZ0JBQWdCLEtBQUssYUFBYSxjQUFjO0FBQUEsSUFDeEc7QUFBQSxFQUNEO0FBQ0Q7QUFXQSxNQUFNLDZCQUE2QixpQkFBaUY7QUFBQSxFQUNuSCxjQUFjO0FBQ2IsVUFBTSxXQUFxQixDQUFDO0FBRTVCO0FBQUEsTUFDQztBQUFBLE1BQW1DO0FBQUEsTUFBd0I7QUFBQSxNQUMzRDtBQUFBLFFBQ0MsT0FBTztBQUFBLFVBQ047QUFBQSxZQUNDLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFBRztBQUFBLFlBQ0YsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLGNBQ04sTUFBTTtBQUFBLFlBQ1A7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0EsYUFBYSxJQUFJLFNBQVMsd0JBQXdCLG9NQUFvTTtBQUFBLFFBQ3RQLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxVQUNOLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLE9BQTBCO0FBQ3pDLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsY0FBUSxDQUFDLEtBQUs7QUFBQSxJQUNmO0FBQ0EsUUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pCLFlBQU0sZUFBeUIsQ0FBQztBQUNoQyxpQkFBVyxVQUFVLE9BQU87QUFDM0IsWUFBSSxPQUFPLFdBQVcsVUFBVTtBQUMvQixjQUFJO0FBQ0gsZ0JBQUksS0FBSyxVQUFVLG1CQUFtQixNQUFNLEVBQUUsU0FBUyxHQUFHO0FBQ3pELDJCQUFhLEtBQUssTUFBTTtBQUFBLFlBQ3pCO0FBQUEsVUFDRCxRQUFRO0FBQUEsVUFFUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFVTyxJQUFXLGlCQUFYLGtCQUFXQyxvQkFBWDtBQUlOLEVBQUFBLGdDQUFBLFVBQU8sS0FBUDtBQUlBLEVBQUFBLGdDQUFBLFVBQU8sS0FBUDtBQUlBLEVBQUFBLGdDQUFBLFlBQVMsS0FBVDtBQUlBLEVBQUFBLGdDQUFBLGdCQUFhLEtBQWI7QUFoQmlCLFNBQUFBO0FBQUEsR0FBQTtBQW1CbEIsTUFBTSw2QkFBNkIsaUJBQXlHO0FBQUEsRUFFM0ksY0FBYztBQUNiO0FBQUEsTUFBTTtBQUFBLE1BQTZCO0FBQUEsTUFBa0I7QUFBQSxNQUNwRDtBQUFBLFFBQ0MseUJBQXlCO0FBQUEsVUFDeEIsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLFFBQVEsUUFBUSxVQUFVLFlBQVk7QUFBQSxVQUM3QyxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsdUJBQXVCLGtEQUFrRDtBQUFBLFlBQ3RGLElBQUksU0FBUyx1QkFBdUIsdURBQXVEO0FBQUEsWUFDM0YsSUFBSSxTQUFTLHlCQUF5QixxREFBcUQ7QUFBQSxZQUMzRixJQUFJLFNBQVMsNkJBQTZCLHFEQUFxRDtBQUFBLFVBQ2hHO0FBQUEsVUFDQSxhQUFhLElBQUksU0FBUyxrQkFBa0IsNENBQTRDO0FBQUEsVUFDeEYsU0FBUztBQUFBLFFBQ1Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsT0FBZ0M7QUFDL0MsWUFBUSxPQUFPO0FBQUEsTUFDZCxLQUFLO0FBQVEsZUFBTztBQUFBLE1BQ3BCLEtBQUs7QUFBUSxlQUFPO0FBQUEsTUFDcEIsS0FBSztBQUFVLGVBQU87QUFBQSxNQUN0QixLQUFLO0FBQWMsZUFBTztBQUFBLElBQzNCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVnQixRQUFRLEtBQTRCLFNBQWlDLE9BQXVDO0FBQzNILFVBQU0sdUJBQXVCLFFBQVEsSUFBSSw0QkFBaUM7QUFDMUUsUUFBSSx5QkFBeUIscUJBQXFCLFNBQVM7QUFHMUQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBYUEsTUFBTSxtQ0FBbUMscUJBQW9FO0FBQUEsRUFFNUcsY0FBYztBQUNiLFVBQU0sd0JBQTJCO0FBQUEsTUFDaEMsd0JBQXdCO0FBQUEsTUFDeEIsb0JBQW9CO0FBQUEsTUFDcEIsb0JBQW9CO0FBQUEsTUFDcEIsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLFFBQVEsS0FBNEIsU0FBaUMsR0FBMkM7QUFDdEgsVUFBTSxhQUFhLFFBQVEsSUFBSSxvQkFBdUI7QUFFdEQsV0FBTztBQUFBLE1BQ04sd0JBQXdCLElBQUk7QUFBQSxNQUM1QixvQkFBb0IsV0FBVztBQUFBLE1BQy9CLG9CQUFvQixXQUFXO0FBQUEsTUFDL0IsZ0JBQWdCLFdBQVc7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFDRDtBQTRCQSxNQUFNLDZCQUE2QixpQkFBbUc7QUFBQSxFQUVySSxjQUFjO0FBQ2IsVUFBTSxXQUF3QyxFQUFFLFNBQVMsTUFBTSxrQkFBa0IsWUFBWTtBQUM3RjtBQUFBLE1BQ0M7QUFBQSxNQUE2QjtBQUFBLE1BQWtCO0FBQUEsTUFDL0M7QUFBQSxRQUNDLGlDQUFpQztBQUFBLFVBQ2hDLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLHFCQUFxQixJQUFJLFNBQVMsMEJBQTBCLDhJQUE4STtBQUFBLFFBQzNNO0FBQUEsUUFDQSwwQ0FBMEM7QUFBQSxVQUN6QyxNQUFNO0FBQUEsVUFDTixxQkFBcUIsSUFBSSxTQUFTLG1DQUFtQywwSEFBMEg7QUFBQSxVQUMvTCxNQUFNO0FBQUEsWUFDTDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQSxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsNkNBQTZDLHdFQUF3RTtBQUFBLFlBQ2xJLElBQUksU0FBUyx5Q0FBeUMsd0ZBQXdGO0FBQUEsVUFDL0k7QUFBQSxVQUNBLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQThDO0FBQzdELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVEsTUFBTSxTQUFTLEtBQUssYUFBYSxPQUFPO0FBQUEsTUFDekQsa0JBQWtCLFVBQVUsTUFBTSxrQkFBa0IsS0FBSyxhQUFhLGtCQUFrQixDQUFDLGFBQWEsT0FBTyxDQUFDO0FBQUEsSUFDL0c7QUFBQSxFQUNEO0FBQ0Q7QUE0QkEsTUFBTSxzQkFBc0IsaUJBQThFO0FBQUEsRUFFekcsY0FBYztBQUNiLFVBQU0sV0FBaUMsRUFBRSxTQUFTLE1BQU0sbUJBQW1CLGFBQWE7QUFDeEY7QUFBQSxNQUNDO0FBQUEsTUFBc0I7QUFBQSxNQUFXO0FBQUEsTUFDakM7QUFBQSxRQUNDLDBCQUEwQjtBQUFBLFVBQ3pCLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUztBQUFBLFVBQ2xCLHFCQUFxQixJQUFJLFNBQVMsbUJBQW1CLDJEQUEyRDtBQUFBLFFBQ2pIO0FBQUEsUUFDQSxvQ0FBb0M7QUFBQSxVQUNuQyxNQUFNO0FBQUEsVUFDTixxQkFBcUIsSUFBSSxTQUFTLDZCQUE2QiwySEFBMkg7QUFBQSxVQUMxTCxNQUFNO0FBQUEsWUFDTDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQSxrQkFBa0I7QUFBQSxZQUNqQixJQUFJLFNBQVMsd0NBQXdDLHlFQUF5RTtBQUFBLFlBQzlILElBQUksU0FBUyxtQ0FBbUMsNEZBQTRGO0FBQUEsVUFDN0k7QUFBQSxVQUNBLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxTQUFTLFFBQXVDO0FBQ3RELFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQzFDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVE7QUFDZCxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVEsTUFBTSxTQUFTLEtBQUssYUFBYSxPQUFPO0FBQUEsTUFDekQsbUJBQW1CLFVBQVUsTUFBTSxtQkFBbUIsS0FBSyxhQUFhLG1CQUFtQixDQUFDLGNBQWMsT0FBTyxDQUFDO0FBQUEsSUFDbkg7QUFBQSxFQUNEO0FBQ0Q7QUFPTyxNQUFNLHdCQUFnRSxDQUFDO0FBRTlFLFNBQVMsU0FBb0MsUUFBa0Q7QUFDOUYsd0JBQXNCLE9BQU8sRUFBRSxJQUFJO0FBQ25DLFNBQU87QUFDUjtBQUVPLElBQVcsZUFBWCxrQkFBV0Msa0JBQVg7QUFDTixFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxF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QUMzRjtBQUFBLE1BQ0EsYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHNHQUFzRztBQUFBLElBQzNKO0FBQUEsRUFDRCxDQUFDO0FBQUEsRUFDRCxZQUFZLFNBQVMsSUFBSSxpQkFBaUIsQ0FBQztBQUFBLEVBQzNDLGNBQWMsU0FBUyxJQUFJO0FBQUEsSUFBb0I7QUFBQSxJQUEyQjtBQUFBLElBQWdCO0FBQUEsSUFDekYsRUFBRSxxQkFBcUIsSUFBSSxTQUFTLGdCQUFnQiwyRkFBMkYsRUFBRTtBQUFBLEVBQ2xKLENBQUM7QUFBQSxFQUNELFlBQVksU0FBUyxJQUFJLHlCQUF5QixDQUFDO0FBQUEsRUFDbkQsY0FBYyxTQUFTLElBQUksMkJBQTJCLENBQUM7QUFBQSxFQUN2RCxnQkFBZ0IsU0FBUyxJQUFJLHFCQUFxQixDQUFDO0FBQUEsRUFDbkQsa0JBQWtCLFNBQVMsSUFBSSxpQkFBaUIsQ0FBQztBQUFBLEVBQ2pELDZCQUE2QixTQUFTLElBQUksNEJBQTRCLENBQUM7QUFBQSxFQUN2RSw2QkFBNkIsU0FBUyxJQUFJLDRCQUE0QixDQUFDO0FBQ3hFOyIsCiAgIm5hbWVzIjogWyJFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kiLCAiVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUiLCAiVGV4dEVkaXRvckN1cnNvclN0eWxlIiwgIlJlbmRlck1pbmltYXAiLCAiU2hvd0xpZ2h0YnVsYkljb25Nb2RlIiwgImFsbG93ZWRWYWx1ZXMiLCAiUmVuZGVyTGluZU51bWJlcnNUeXBlIiwgIldyYXBwaW5nSW5kZW50IiwgIkVkaXRvck9wdGlvbiJdCn0K
