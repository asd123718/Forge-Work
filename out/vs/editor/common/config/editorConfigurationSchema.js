import { diffEditorDefaultOptions } from "./diffEditor.js";
import { editorOptionsRegistry } from "./editorOptions.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import * as nls from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../platform/registry/common/platform.js";
const editorConfigurationBaseNode = Object.freeze({
  id: "editor",
  order: 5,
  type: "object",
  title: nls.localize("editorConfigurationTitle", "Editor"),
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
});
const editorConfiguration = {
  ...editorConfigurationBaseNode,
  properties: {
    "editor.tabSize": {
      type: "number",
      default: EDITOR_MODEL_DEFAULTS.tabSize,
      minimum: 1,
      maximum: 100,
      markdownDescription: nls.localize("tabSize", "The number of spaces a tab is equal to. This setting is overridden based on the file contents when {0} is on.", "`#editor.detectIndentation#`")
    },
    "editor.indentSize": {
      "anyOf": [
        {
          type: "string",
          enum: ["tabSize"]
        },
        {
          type: "number",
          minimum: 1
        }
      ],
      default: "tabSize",
      markdownDescription: nls.localize("indentSize", 'The number of spaces used for indentation or `"tabSize"` to use the value from `#editor.tabSize#`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    "editor.insertSpaces": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.insertSpaces,
      markdownDescription: nls.localize("insertSpaces", "Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when {0} is on.", "`#editor.detectIndentation#`")
    },
    "editor.detectIndentation": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.detectIndentation,
      markdownDescription: nls.localize("detectIndentation", "Controls whether {0} and {1} will be automatically detected when a file is opened based on the file contents.", "`#editor.tabSize#`", "`#editor.insertSpaces#`")
    },
    "editor.trimAutoWhitespace": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
      description: nls.localize("trimAutoWhitespace", "Remove trailing auto inserted whitespace.")
    },
    "editor.largeFileOptimizations": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
      description: nls.localize("largeFileOptimizations", "Special handling for large files to disable certain memory intensive features.")
    },
    "editor.wordBasedSuggestions": {
      enum: ["off", "offWithInlineSuggestions", "currentDocument", "matchingDocuments", "allDocuments"],
      default: "offWithInlineSuggestions",
      enumDescriptions: [
        nls.localize("wordBasedSuggestions.off", "Turn off Word Based Suggestions."),
        nls.localize("wordBasedSuggestions.offWithInlineSuggestions", "Turn off Word Based Suggestions when Inline Suggestions are present."),
        nls.localize("wordBasedSuggestions.currentDocument", "Only suggest words from the active document."),
        nls.localize("wordBasedSuggestions.matchingDocuments", "Suggest words from all open documents of the same language."),
        nls.localize("wordBasedSuggestions.allDocuments", "Suggest words from all open documents.")
      ],
      description: nls.localize("wordBasedSuggestions", "Controls whether completions should be computed based on words in the document and from which documents they are computed."),
      experiment: { mode: "auto" }
    },
    "editor.semanticHighlighting.enabled": {
      enum: [true, false, "configuredByTheme"],
      enumDescriptions: [
        nls.localize("semanticHighlighting.true", "Semantic highlighting enabled for all color themes."),
        nls.localize("semanticHighlighting.false", "Semantic highlighting disabled for all color themes."),
        nls.localize("semanticHighlighting.configuredByTheme", "Semantic highlighting is configured by the current color theme's `semanticHighlighting` setting.")
      ],
      default: "configuredByTheme",
      description: nls.localize("semanticHighlighting.enabled", "Controls whether the semanticHighlighting is shown for the languages that support it.")
    },
    "editor.stablePeek": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("stablePeek", "Keep peek editors open even when double-clicking their content or when hitting `Escape`.")
    },
    "editor.maxTokenizationLineLength": {
      type: "integer",
      default: 2e4,
      description: nls.localize("maxTokenizationLineLength", "Lines above this length will not be tokenized for performance reasons")
    },
    "editor.experimental.asyncTokenization": {
      type: "boolean",
      default: true,
      description: nls.localize("editor.experimental.asyncTokenization", "Controls whether the tokenization should happen asynchronously on a web worker."),
      tags: ["experimental"]
    },
    "editor.experimental.asyncTokenizationLogging": {
      type: "boolean",
      default: false,
      description: nls.localize("editor.experimental.asyncTokenizationLogging", "Controls whether async tokenization should be logged. For debugging only.")
    },
    "editor.experimental.asyncTokenizationVerification": {
      type: "boolean",
      default: false,
      description: nls.localize("editor.experimental.asyncTokenizationVerification", "Controls whether async tokenization should be verified against legacy background tokenization. Might slow down tokenization. For debugging only."),
      tags: ["experimental"]
    },
    "editor.experimental.treeSitterTelemetry": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.treeSitterTelemetry", "Controls whether tree sitter parsing should be turned on and telemetry collected. Setting `#editor.experimental.preferTreeSitter#` for specific languages will take precedence."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.css": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.css", "Controls whether tree sitter parsing should be turned on for css. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for css."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.typescript": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.typescript", "Controls whether tree sitter parsing should be turned on for typescript. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for typescript."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.ini": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.ini", "Controls whether tree sitter parsing should be turned on for ini. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for ini."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.regex": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.regex", "Controls whether tree sitter parsing should be turned on for regex. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for regex."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.language.brackets": {
      type: ["array", "null"],
      default: null,
      // We want to distinguish the empty array from not configured.
      description: nls.localize("schema.brackets", "Defines the bracket symbols that increase or decrease the indentation."),
      items: {
        type: "array",
        items: [
          {
            type: "string",
            description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
          },
          {
            type: "string",
            description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
          }
        ]
      }
    },
    "editor.language.colorizedBracketPairs": {
      type: ["array", "null"],
      default: null,
      // We want to distinguish the empty array from not configured.
      description: nls.localize("schema.colorizedBracketPairs", "Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled."),
      items: {
        type: "array",
        items: [
          {
            type: "string",
            description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
          },
          {
            type: "string",
            description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
          }
        ]
      }
    },
    "diffEditor.maxComputationTime": {
      type: "number",
      default: diffEditorDefaultOptions.maxComputationTime,
      description: nls.localize("maxComputationTime", "Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.")
    },
    "diffEditor.maxFileSize": {
      type: "number",
      default: diffEditorDefaultOptions.maxFileSize,
      description: nls.localize("maxFileSize", "Maximum file size in MB for which to compute diffs. Use 0 for no limit.")
    },
    "diffEditor.renderSideBySide": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderSideBySide,
      description: nls.localize("sideBySide", "Controls whether the diff editor shows the diff side by side or inline."),
      agentsWindow: { default: true }
    },
    "diffEditor.renderSideBySideInlineBreakpoint": {
      type: "number",
      default: diffEditorDefaultOptions.renderSideBySideInlineBreakpoint,
      description: nls.localize("renderSideBySideInlineBreakpoint", "If the diff editor width is smaller than this value, the inline view is used.")
    },
    "diffEditor.useInlineViewWhenSpaceIsLimited": {
      type: "boolean",
      default: diffEditorDefaultOptions.useInlineViewWhenSpaceIsLimited,
      description: nls.localize("useInlineViewWhenSpaceIsLimited", "If enabled and the editor width is too small, the inline view is used."),
      agentsWindow: { default: true }
    },
    "diffEditor.renderMarginRevertIcon": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderMarginRevertIcon,
      description: nls.localize("renderMarginRevertIcon", "When enabled, the diff editor shows arrows in its glyph margin to revert changes."),
      agentsWindow: { default: false }
    },
    "diffEditor.renderGutterMenu": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderGutterMenu,
      description: nls.localize("renderGutterMenu", "When enabled, the diff editor shows a special gutter for revert and stage actions."),
      agentsWindow: { default: false }
    },
    "diffEditor.ignoreTrimWhitespace": {
      type: "boolean",
      default: diffEditorDefaultOptions.ignoreTrimWhitespace,
      description: nls.localize("ignoreTrimWhitespace", "When enabled, the diff editor ignores changes in leading or trailing whitespace.")
    },
    "diffEditor.renderIndicators": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderIndicators,
      description: nls.localize("renderIndicators", "Controls whether the diff editor shows +/- indicators for added/removed changes."),
      agentsWindow: { default: false }
    },
    "diffEditor.codeLens": {
      type: "boolean",
      default: diffEditorDefaultOptions.diffCodeLens,
      description: nls.localize("codeLens", "Controls whether the editor shows CodeLens.")
    },
    "diffEditor.wordWrap": {
      type: "string",
      enum: ["off", "on", "inherit"],
      default: diffEditorDefaultOptions.diffWordWrap,
      markdownEnumDescriptions: [
        nls.localize("wordWrap.off", "Lines will never wrap."),
        nls.localize("wordWrap.on", "Lines will wrap at the viewport width."),
        nls.localize("wordWrap.inherit", "Lines will wrap according to the {0} setting.", "`#editor.wordWrap#`")
      ]
    },
    "diffEditor.diffAlgorithm": {
      type: "string",
      enum: ["legacy", "advanced", "advanced-external", "advanced-wasm"],
      default: diffEditorDefaultOptions.diffAlgorithm,
      markdownEnumDescriptions: [
        nls.localize("diffAlgorithm.legacy", "Uses the legacy diffing algorithm."),
        nls.localize("diffAlgorithm.advanced", "Uses the advanced diffing algorithm."),
        nls.localize("diffAlgorithm.advancedExternal", "Uses the advanced diffing algorithm from the external `@vscode/diff` package (pure JavaScript)."),
        nls.localize("diffAlgorithm.advancedWasm", "Uses the advanced diffing algorithm from the external `@vscode/diff` package (WebAssembly).")
      ]
    },
    "diffEditor.hideUnchangedRegions.enabled": {
      type: "boolean",
      default: diffEditorDefaultOptions.hideUnchangedRegions.enabled,
      markdownDescription: nls.localize("hideUnchangedRegions.enabled", "Controls whether the diff editor shows unchanged regions."),
      agentsWindow: { default: true }
    },
    "diffEditor.hideUnchangedRegions.revealLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.revealLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.revealLineCount", "Controls how many lines are used for unchanged regions."),
      minimum: 1
    },
    "diffEditor.hideUnchangedRegions.minimumLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.minimumLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.minimumLineCount", "Controls how many lines are used as a minimum for unchanged regions."),
      minimum: 1
    },
    "diffEditor.hideUnchangedRegions.contextLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.contextLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.contextLineCount", "Controls how many lines are used as context when comparing unchanged regions."),
      minimum: 1
    },
    "diffEditor.experimental.showMoves": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.showMoves,
      markdownDescription: nls.localize("showMoves", "Controls whether the diff editor should show detected code moves.")
    },
    "diffEditor.experimental.showEmptyDecorations": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.showEmptyDecorations,
      description: nls.localize("showEmptyDecorations", "Controls whether the diff editor shows empty decorations to see where characters got inserted or deleted.")
    },
    "diffEditor.experimental.useTrueInlineView": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.useTrueInlineView,
      description: nls.localize("useTrueInlineView", "If enabled and the editor uses the inline view, word changes are rendered inline.")
    }
  }
};
function isConfigurationPropertySchema(x) {
  return typeof x.type !== "undefined" || typeof x.anyOf !== "undefined";
}
for (const editorOption of editorOptionsRegistry) {
  const schema = editorOption.schema;
  if (typeof schema !== "undefined") {
    if (isConfigurationPropertySchema(schema)) {
      editorConfiguration.properties[`editor.${editorOption.name}`] = schema;
    } else {
      for (const key in schema) {
        if (Object.hasOwnProperty.call(schema, key)) {
          editorConfiguration.properties[key] = schema[key];
        }
      }
    }
  }
}
let cachedEditorConfigurationKeys = null;
function getEditorConfigurationKeys() {
  if (cachedEditorConfigurationKeys === null) {
    cachedEditorConfigurationKeys = /* @__PURE__ */ Object.create(null);
    Object.keys(editorConfiguration.properties).forEach((prop) => {
      cachedEditorConfigurationKeys[prop] = true;
    });
  }
  return cachedEditorConfigurationKeys;
}
function isEditorConfigurationKey(key) {
  const editorConfigurationKeys = getEditorConfigurationKeys();
  return editorConfigurationKeys[`editor.${key}`] || false;
}
function isDiffEditorConfigurationKey(key) {
  const editorConfigurationKeys = getEditorConfigurationKeys();
  return editorConfigurationKeys[`diffEditor.${key}`] || false;
}
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration(editorConfiguration);
async function registerEditorFontConfigurations(getFontSnippets) {
  const editorKeysWithFont = ["editor.fontFamily"];
  const fontSnippets = await getFontSnippets();
  for (const key of editorKeysWithFont) {
    if (editorConfiguration.properties && editorConfiguration.properties[key]) {
      editorConfiguration.properties[key].defaultSnippets = fontSnippets;
    }
  }
}
export {
  editorConfigurationBaseNode,
  isDiffEditorConfigurationKey,
  isEditorConfigurationKey,
  registerEditorFontConfigurations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29uZmlnXFxlZGl0b3JDb25maWd1cmF0aW9uU2NoZW1hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBJSlNPTlNjaGVtYVNuaXBwZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucyB9IGZyb20gJy4vZGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBlZGl0b3JPcHRpb25zUmVnaXN0cnkgfSBmcm9tICcuL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRURJVE9SX01PREVMX0RFRkFVTFRTIH0gZnJvbSAnLi4vY29yZS9taXNjL3RleHRNb2RlbERlZmF1bHRzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlID0gT2JqZWN0LmZyZWV6ZTxJQ29uZmlndXJhdGlvbk5vZGU+KHtcblx0aWQ6ICdlZGl0b3InLFxuXHRvcmRlcjogNSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2VkaXRvckNvbmZpZ3VyYXRpb25UaXRsZScsIFwiRWRpdG9yXCIpLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxufSk7XG5cbmNvbnN0IGVkaXRvckNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0Li4uZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2VkaXRvci50YWJTaXplJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiBFRElUT1JfTU9ERUxfREVGQVVMVFMudGFiU2l6ZSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0XHRtYXhpbXVtOiAxMDAsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3RhYlNpemUnLCBcIlRoZSBudW1iZXIgb2Ygc3BhY2VzIGEgdGFiIGlzIGVxdWFsIHRvLiBUaGlzIHNldHRpbmcgaXMgb3ZlcnJpZGRlbiBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cyB3aGVuIHswfSBpcyBvbi5cIiwgJ2AjZWRpdG9yLmRldGVjdEluZGVudGF0aW9uI2AnKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5pbmRlbnRTaXplJzoge1xuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWyd0YWJTaXplJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdG1pbmltdW06IDFcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICd0YWJTaXplJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5kZW50U2l6ZScsIFwiVGhlIG51bWJlciBvZiBzcGFjZXMgdXNlZCBmb3IgaW5kZW50YXRpb24gb3IgYFxcXCJ0YWJTaXplXFxcImAgdG8gdXNlIHRoZSB2YWx1ZSBmcm9tIGAjZWRpdG9yLnRhYlNpemUjYC4gVGhpcyBzZXR0aW5nIGlzIG92ZXJyaWRkZW4gYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMgd2hlbiBgI2VkaXRvci5kZXRlY3RJbmRlbnRhdGlvbiNgIGlzIG9uLlwiKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5pbnNlcnRTcGFjZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBFRElUT1JfTU9ERUxfREVGQVVMVFMuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnNlcnRTcGFjZXMnLCBcIkluc2VydCBzcGFjZXMgd2hlbiBwcmVzc2luZyBgVGFiYC4gVGhpcyBzZXR0aW5nIGlzIG92ZXJyaWRkZW4gYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMgd2hlbiB7MH0gaXMgb24uXCIsICdgI2VkaXRvci5kZXRlY3RJbmRlbnRhdGlvbiNgJylcblx0XHR9LFxuXHRcdCdlZGl0b3IuZGV0ZWN0SW5kZW50YXRpb24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBFRElUT1JfTU9ERUxfREVGQVVMVFMuZGV0ZWN0SW5kZW50YXRpb24sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RldGVjdEluZGVudGF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHswfSBhbmQgezF9IHdpbGwgYmUgYXV0b21hdGljYWxseSBkZXRlY3RlZCB3aGVuIGEgZmlsZSBpcyBvcGVuZWQgYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMuXCIsICdgI2VkaXRvci50YWJTaXplI2AnLCAnYCNlZGl0b3IuaW5zZXJ0U3BhY2VzI2AnKVxuXHRcdH0sXG5cdFx0J2VkaXRvci50cmltQXV0b1doaXRlc3BhY2UnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBFRElUT1JfTU9ERUxfREVGQVVMVFMudHJpbUF1dG9XaGl0ZXNwYWNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndHJpbUF1dG9XaGl0ZXNwYWNlJywgXCJSZW1vdmUgdHJhaWxpbmcgYXV0byBpbnNlcnRlZCB3aGl0ZXNwYWNlLlwiKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5sYXJnZUZpbGVPcHRpbWl6YXRpb25zJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogRURJVE9SX01PREVMX0RFRkFVTFRTLmxhcmdlRmlsZU9wdGltaXphdGlvbnMsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdsYXJnZUZpbGVPcHRpbWl6YXRpb25zJywgXCJTcGVjaWFsIGhhbmRsaW5nIGZvciBsYXJnZSBmaWxlcyB0byBkaXNhYmxlIGNlcnRhaW4gbWVtb3J5IGludGVuc2l2ZSBmZWF0dXJlcy5cIilcblx0XHR9LFxuXHRcdCdlZGl0b3Iud29yZEJhc2VkU3VnZ2VzdGlvbnMnOiB7XG5cdFx0XHRlbnVtOiBbJ29mZicsICdvZmZXaXRoSW5saW5lU3VnZ2VzdGlvbnMnLCAnY3VycmVudERvY3VtZW50JywgJ21hdGNoaW5nRG9jdW1lbnRzJywgJ2FsbERvY3VtZW50cyddLFxuXHRcdFx0ZGVmYXVsdDogJ29mZldpdGhJbmxpbmVTdWdnZXN0aW9ucycsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJhc2VkU3VnZ2VzdGlvbnMub2ZmJywgJ1R1cm4gb2ZmIFdvcmQgQmFzZWQgU3VnZ2VzdGlvbnMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJhc2VkU3VnZ2VzdGlvbnMub2ZmV2l0aElubGluZVN1Z2dlc3Rpb25zJywgJ1R1cm4gb2ZmIFdvcmQgQmFzZWQgU3VnZ2VzdGlvbnMgd2hlbiBJbmxpbmUgU3VnZ2VzdGlvbnMgYXJlIHByZXNlbnQuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJhc2VkU3VnZ2VzdGlvbnMuY3VycmVudERvY3VtZW50JywgJ09ubHkgc3VnZ2VzdCB3b3JkcyBmcm9tIHRoZSBhY3RpdmUgZG9jdW1lbnQuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZEJhc2VkU3VnZ2VzdGlvbnMubWF0Y2hpbmdEb2N1bWVudHMnLCAnU3VnZ2VzdCB3b3JkcyBmcm9tIGFsbCBvcGVuIGRvY3VtZW50cyBvZiB0aGUgc2FtZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucy5hbGxEb2N1bWVudHMnLCAnU3VnZ2VzdCB3b3JkcyBmcm9tIGFsbCBvcGVuIGRvY3VtZW50cy4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucycsIFwiQ29udHJvbHMgd2hldGhlciBjb21wbGV0aW9ucyBzaG91bGQgYmUgY29tcHV0ZWQgYmFzZWQgb24gd29yZHMgaW4gdGhlIGRvY3VtZW50IGFuZCBmcm9tIHdoaWNoIGRvY3VtZW50cyB0aGV5IGFyZSBjb21wdXRlZC5cIiksXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdhdXRvJyB9LFxuXHRcdH0sXG5cdFx0J2VkaXRvci5zZW1hbnRpY0hpZ2hsaWdodGluZy5lbmFibGVkJzoge1xuXHRcdFx0ZW51bTogW3RydWUsIGZhbHNlLCAnY29uZmlndXJlZEJ5VGhlbWUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZW1hbnRpY0hpZ2hsaWdodGluZy50cnVlJywgJ1NlbWFudGljIGhpZ2hsaWdodGluZyBlbmFibGVkIGZvciBhbGwgY29sb3IgdGhlbWVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlbWFudGljSGlnaGxpZ2h0aW5nLmZhbHNlJywgJ1NlbWFudGljIGhpZ2hsaWdodGluZyBkaXNhYmxlZCBmb3IgYWxsIGNvbG9yIHRoZW1lcy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZW1hbnRpY0hpZ2hsaWdodGluZy5jb25maWd1cmVkQnlUaGVtZScsICdTZW1hbnRpYyBoaWdobGlnaHRpbmcgaXMgY29uZmlndXJlZCBieSB0aGUgY3VycmVudCBjb2xvciB0aGVtZVxcJ3MgYHNlbWFudGljSGlnaGxpZ2h0aW5nYCBzZXR0aW5nLicpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2NvbmZpZ3VyZWRCeVRoZW1lJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbWFudGljSGlnaGxpZ2h0aW5nLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHNlbWFudGljSGlnaGxpZ2h0aW5nIGlzIHNob3duIGZvciB0aGUgbGFuZ3VhZ2VzIHRoYXQgc3VwcG9ydCBpdC5cIilcblx0XHR9LFxuXHRcdCdlZGl0b3Iuc3RhYmxlUGVlayc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdGFibGVQZWVrJywgXCJLZWVwIHBlZWsgZWRpdG9ycyBvcGVuIGV2ZW4gd2hlbiBkb3VibGUtY2xpY2tpbmcgdGhlaXIgY29udGVudCBvciB3aGVuIGhpdHRpbmcgYEVzY2FwZWAuXCIpXG5cdFx0fSxcblx0XHQnZWRpdG9yLm1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRkZWZhdWx0OiAyMF8wMDAsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJywgXCJMaW5lcyBhYm92ZSB0aGlzIGxlbmd0aCB3aWxsIG5vdCBiZSB0b2tlbml6ZWQgZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnNcIilcblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHRva2VuaXphdGlvbiBzaG91bGQgaGFwcGVuIGFzeW5jaHJvbm91c2x5IG9uIGEgd2ViIHdvcmtlci5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb25Mb2dnaW5nJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uTG9nZ2luZycsIFwiQ29udHJvbHMgd2hldGhlciBhc3luYyB0b2tlbml6YXRpb24gc2hvdWxkIGJlIGxvZ2dlZC4gRm9yIGRlYnVnZ2luZyBvbmx5LlwiKSxcblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGFzeW5jIHRva2VuaXphdGlvbiBzaG91bGQgYmUgdmVyaWZpZWQgYWdhaW5zdCBsZWdhY3kgYmFja2dyb3VuZCB0b2tlbml6YXRpb24uIE1pZ2h0IHNsb3cgZG93biB0b2tlbml6YXRpb24uIEZvciBkZWJ1Z2dpbmcgb25seS5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZXhwZXJpbWVudGFsLnRyZWVTaXR0ZXJUZWxlbWV0cnknLCBcIkNvbnRyb2xzIHdoZXRoZXIgdHJlZSBzaXR0ZXIgcGFyc2luZyBzaG91bGQgYmUgdHVybmVkIG9uIGFuZCB0ZWxlbWV0cnkgY29sbGVjdGVkLiBTZXR0aW5nIGAjZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyI2AgZm9yIHNwZWNpZmljIGxhbmd1YWdlcyB3aWxsIHRha2UgcHJlY2VkZW5jZS5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIuY3NzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci5jc3MnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdHJlZSBzaXR0ZXIgcGFyc2luZyBzaG91bGQgYmUgdHVybmVkIG9uIGZvciBjc3MuIFRoaXMgd2lsbCB0YWtlIHByZWNlZGVuY2Ugb3ZlciBgI2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeSNgIGZvciBjc3MuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLnR5cGVzY3JpcHQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLnR5cGVzY3JpcHQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdHJlZSBzaXR0ZXIgcGFyc2luZyBzaG91bGQgYmUgdHVybmVkIG9uIGZvciB0eXBlc2NyaXB0LiBUaGlzIHdpbGwgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYCNlZGl0b3IuZXhwZXJpbWVudGFsLnRyZWVTaXR0ZXJUZWxlbWV0cnkjYCBmb3IgdHlwZXNjcmlwdC5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIuaW5pJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci5pbmknLCBcIkNvbnRyb2xzIHdoZXRoZXIgdHJlZSBzaXR0ZXIgcGFyc2luZyBzaG91bGQgYmUgdHVybmVkIG9uIGZvciBpbmkuIFRoaXMgd2lsbCB0YWtlIHByZWNlZGVuY2Ugb3ZlciBgI2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeSNgIGZvciBpbmkuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLnJlZ2V4Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci5yZWdleCcsIFwiQ29udHJvbHMgd2hldGhlciB0cmVlIHNpdHRlciBwYXJzaW5nIHNob3VsZCBiZSB0dXJuZWQgb24gZm9yIHJlZ2V4LiBUaGlzIHdpbGwgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYCNlZGl0b3IuZXhwZXJpbWVudGFsLnRyZWVTaXR0ZXJUZWxlbWV0cnkjYCBmb3IgcmVnZXguXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZWRpdG9yLmxhbmd1YWdlLmJyYWNrZXRzJzoge1xuXHRcdFx0dHlwZTogWydhcnJheScsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLCAvLyBXZSB3YW50IHRvIGRpc3Rpbmd1aXNoIHRoZSBlbXB0eSBhcnJheSBmcm9tIG5vdCBjb25maWd1cmVkLlxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmJyYWNrZXRzJywgJ0RlZmluZXMgdGhlIGJyYWNrZXQgc3ltYm9scyB0aGF0IGluY3JlYXNlIG9yIGRlY3JlYXNlIHRoZSBpbmRlbnRhdGlvbi4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub3BlbkJyYWNrZXQnLCAnVGhlIG9wZW5pbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jbG9zZUJyYWNrZXQnLCAnVGhlIGNsb3NpbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZWRpdG9yLmxhbmd1YWdlLmNvbG9yaXplZEJyYWNrZXRQYWlycyc6IHtcblx0XHRcdHR5cGU6IFsnYXJyYXknLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCwgLy8gV2Ugd2FudCB0byBkaXN0aW5ndWlzaCB0aGUgZW1wdHkgYXJyYXkgZnJvbSBub3QgY29uZmlndXJlZC5cblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jb2xvcml6ZWRCcmFja2V0UGFpcnMnLCAnRGVmaW5lcyB0aGUgYnJhY2tldCBwYWlycyB0aGF0IGFyZSBjb2xvcml6ZWQgYnkgdGhlaXIgbmVzdGluZyBsZXZlbCBpZiBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uIGlzIGVuYWJsZWQuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9wZW5CcmFja2V0JywgJ1RoZSBvcGVuaW5nIGJyYWNrZXQgY2hhcmFjdGVyIG9yIHN0cmluZyBzZXF1ZW5jZS4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuY2xvc2VCcmFja2V0JywgJ1RoZSBjbG9zaW5nIGJyYWNrZXQgY2hhcmFjdGVyIG9yIHN0cmluZyBzZXF1ZW5jZS4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IubWF4Q29tcHV0YXRpb25UaW1lJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWF4Q29tcHV0YXRpb25UaW1lJywgXCJUaW1lb3V0IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBkaWZmIGNvbXB1dGF0aW9uIGlzIGNhbmNlbGxlZC4gVXNlIDAgZm9yIG5vIHRpbWVvdXQuXCIpXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5tYXhGaWxlU2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLm1heEZpbGVTaXplLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWF4RmlsZVNpemUnLCBcIk1heGltdW0gZmlsZSBzaXplIGluIE1CIGZvciB3aGljaCB0byBjb21wdXRlIGRpZmZzLiBVc2UgMCBmb3Igbm8gbGltaXQuXCIpXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLnJlbmRlclNpZGVCeVNpZGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzaWRlQnlTaWRlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBkaWZmIGVkaXRvciBzaG93cyB0aGUgZGlmZiBzaWRlIGJ5IHNpZGUgb3IgaW5saW5lLlwiKSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludCc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLnJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyU2lkZUJ5U2lkZUlubGluZUJyZWFrcG9pbnQnLCBcIklmIHRoZSBkaWZmIGVkaXRvciB3aWR0aCBpcyBzbWFsbGVyIHRoYW4gdGhpcyB2YWx1ZSwgdGhlIGlubGluZSB2aWV3IGlzIHVzZWQuXCIpXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci51c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLnVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkJywgXCJJZiBlbmFibGVkIGFuZCB0aGUgZWRpdG9yIHdpZHRoIGlzIHRvbyBzbWFsbCwgdGhlIGlubGluZSB2aWV3IGlzIHVzZWQuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLnJlbmRlck1hcmdpblJldmVydEljb24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMucmVuZGVyTWFyZ2luUmV2ZXJ0SWNvbixcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlck1hcmdpblJldmVydEljb24nLCBcIldoZW4gZW5hYmxlZCwgdGhlIGRpZmYgZWRpdG9yIHNob3dzIGFycm93cyBpbiBpdHMgZ2x5cGggbWFyZ2luIHRvIHJldmVydCBjaGFuZ2VzLlwiKSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiBmYWxzZSB9LFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IucmVuZGVyR3V0dGVyTWVudSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5yZW5kZXJHdXR0ZXJNZW51LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyR3V0dGVyTWVudScsIFwiV2hlbiBlbmFibGVkLCB0aGUgZGlmZiBlZGl0b3Igc2hvd3MgYSBzcGVjaWFsIGd1dHRlciBmb3IgcmV2ZXJ0IGFuZCBzdGFnZSBhY3Rpb25zLlwiKSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiBmYWxzZSB9LFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2UnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuaWdub3JlVHJpbVdoaXRlc3BhY2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpZ25vcmVUcmltV2hpdGVzcGFjZScsIFwiV2hlbiBlbmFibGVkLCB0aGUgZGlmZiBlZGl0b3IgaWdub3JlcyBjaGFuZ2VzIGluIGxlYWRpbmcgb3IgdHJhaWxpbmcgd2hpdGVzcGFjZS5cIilcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLnJlbmRlckluZGljYXRvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMucmVuZGVySW5kaWNhdG9ycyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlckluZGljYXRvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGRpZmYgZWRpdG9yIHNob3dzICsvLSBpbmRpY2F0b3JzIGZvciBhZGRlZC9yZW1vdmVkIGNoYW5nZXMuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5jb2RlTGVucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5kaWZmQ29kZUxlbnMsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb2RlTGVucycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3dzIENvZGVMZW5zLlwiKVxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3Iud29yZFdyYXAnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnb2ZmJywgJ29uJywgJ2luaGVyaXQnXSxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5kaWZmV29yZFdyYXAsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkV3JhcC5vZmYnLCBcIkxpbmVzIHdpbGwgbmV2ZXIgd3JhcC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZFdyYXAub24nLCBcIkxpbmVzIHdpbGwgd3JhcCBhdCB0aGUgdmlld3BvcnQgd2lkdGguXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3dvcmRXcmFwLmluaGVyaXQnLCBcIkxpbmVzIHdpbGwgd3JhcCBhY2NvcmRpbmcgdG8gdGhlIHswfSBzZXR0aW5nLlwiLCAnYCNlZGl0b3Iud29yZFdyYXAjYCcpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuZGlmZkFsZ29yaXRobSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydsZWdhY3knLCAnYWR2YW5jZWQnLCAnYWR2YW5jZWQtZXh0ZXJuYWwnLCAnYWR2YW5jZWQtd2FzbSddLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmRpZmZBbGdvcml0aG0sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWZmQWxnb3JpdGhtLmxlZ2FjeScsIFwiVXNlcyB0aGUgbGVnYWN5IGRpZmZpbmcgYWxnb3JpdGhtLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWZmQWxnb3JpdGhtLmFkdmFuY2VkJywgXCJVc2VzIHRoZSBhZHZhbmNlZCBkaWZmaW5nIGFsZ29yaXRobS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGlmZkFsZ29yaXRobS5hZHZhbmNlZEV4dGVybmFsJywgXCJVc2VzIHRoZSBhZHZhbmNlZCBkaWZmaW5nIGFsZ29yaXRobSBmcm9tIHRoZSBleHRlcm5hbCBgQHZzY29kZS9kaWZmYCBwYWNrYWdlIChwdXJlIEphdmFTY3JpcHQpLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWZmQWxnb3JpdGhtLmFkdmFuY2VkV2FzbScsIFwiVXNlcyB0aGUgYWR2YW5jZWQgZGlmZmluZyBhbGdvcml0aG0gZnJvbSB0aGUgZXh0ZXJuYWwgYEB2c2NvZGUvZGlmZmAgcGFja2FnZSAoV2ViQXNzZW1ibHkpLlwiKSxcblx0XHRcdF1cblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuZW5hYmxlZCxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaGlkZVVuY2hhbmdlZFJlZ2lvbnMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZGlmZiBlZGl0b3Igc2hvd3MgdW5jaGFuZ2VkIHJlZ2lvbnMuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLnJldmVhbExpbmVDb3VudCc6IHtcblx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5yZXZlYWxMaW5lQ291bnQsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hpZGVVbmNoYW5nZWRSZWdpb25zLnJldmVhbExpbmVDb3VudCcsIFwiQ29udHJvbHMgaG93IG1hbnkgbGluZXMgYXJlIHVzZWQgZm9yIHVuY2hhbmdlZCByZWdpb25zLlwiKSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5taW5pbXVtTGluZUNvdW50Jzoge1xuXHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmhpZGVVbmNoYW5nZWRSZWdpb25zLm1pbmltdW1MaW5lQ291bnQsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hpZGVVbmNoYW5nZWRSZWdpb25zLm1pbmltdW1MaW5lQ291bnQnLCBcIkNvbnRyb2xzIGhvdyBtYW55IGxpbmVzIGFyZSB1c2VkIGFzIGEgbWluaW11bSBmb3IgdW5jaGFuZ2VkIHJlZ2lvbnMuXCIpLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLmNvbnRleHRMaW5lQ291bnQnOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuY29udGV4dExpbmVDb3VudCxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaGlkZVVuY2hhbmdlZFJlZ2lvbnMuY29udGV4dExpbmVDb3VudCcsIFwiQ29udHJvbHMgaG93IG1hbnkgbGluZXMgYXJlIHVzZWQgYXMgY29udGV4dCB3aGVuIGNvbXBhcmluZyB1bmNoYW5nZWQgcmVnaW9ucy5cIiksXG5cdFx0XHRtaW5pbXVtOiAxLFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuZXhwZXJpbWVudGFsLnNob3dNb3Zlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5leHBlcmltZW50YWwuc2hvd01vdmVzLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzaG93TW92ZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGRpZmYgZWRpdG9yIHNob3VsZCBzaG93IGRldGVjdGVkIGNvZGUgbW92ZXMuXCIpXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5leHBlcmltZW50YWwuc2hvd0VtcHR5RGVjb3JhdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuZXhwZXJpbWVudGFsLnNob3dFbXB0eURlY29yYXRpb25zLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2hvd0VtcHR5RGVjb3JhdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGRpZmYgZWRpdG9yIHNob3dzIGVtcHR5IGRlY29yYXRpb25zIHRvIHNlZSB3aGVyZSBjaGFyYWN0ZXJzIGdvdCBpbnNlcnRlZCBvciBkZWxldGVkLlwiKSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmV4cGVyaW1lbnRhbC51c2VUcnVlSW5saW5lVmlldyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5leHBlcmltZW50YWwudXNlVHJ1ZUlubGluZVZpZXcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1c2VUcnVlSW5saW5lVmlldycsIFwiSWYgZW5hYmxlZCBhbmQgdGhlIGVkaXRvciB1c2VzIHRoZSBpbmxpbmUgdmlldywgd29yZCBjaGFuZ2VzIGFyZSByZW5kZXJlZCBpbmxpbmUuXCIpLFxuXHRcdH0sXG5cdH1cbn07XG5cbmZ1bmN0aW9uIGlzQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKHg6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB7IFtwYXRoOiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0pOiB4IGlzIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEge1xuXHRyZXR1cm4gKHR5cGVvZiB4LnR5cGUgIT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiB4LmFueU9mICE9PSAndW5kZWZpbmVkJyk7XG59XG5cbi8vIEFkZCBwcm9wZXJ0aWVzIGZyb20gdGhlIEVkaXRvciBPcHRpb24gUmVnaXN0cnlcbmZvciAoY29uc3QgZWRpdG9yT3B0aW9uIG9mIGVkaXRvck9wdGlvbnNSZWdpc3RyeSkge1xuXHRjb25zdCBzY2hlbWEgPSBlZGl0b3JPcHRpb24uc2NoZW1hO1xuXHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRpZiAoaXNDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0Ly8gVGhpcyBpcyBhIHNpbmdsZSBzY2hlbWEgY29udHJpYnV0aW9uXG5cdFx0XHRlZGl0b3JDb25maWd1cmF0aW9uLnByb3BlcnRpZXMhW2BlZGl0b3IuJHtlZGl0b3JPcHRpb24ubmFtZX1gXSA9IHNjaGVtYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gc2NoZW1hKSB7XG5cdFx0XHRcdGlmIChPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChzY2hlbWEsIGtleSkpIHtcblx0XHRcdFx0XHRlZGl0b3JDb25maWd1cmF0aW9uLnByb3BlcnRpZXMhW2tleV0gPSBzY2hlbWFba2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5sZXQgY2FjaGVkRWRpdG9yQ29uZmlndXJhdGlvbktleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9IHwgbnVsbCA9IG51bGw7XG5mdW5jdGlvbiBnZXRFZGl0b3JDb25maWd1cmF0aW9uS2V5cygpOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSB7XG5cdGlmIChjYWNoZWRFZGl0b3JDb25maWd1cmF0aW9uS2V5cyA9PT0gbnVsbCkge1xuXHRcdGNhY2hlZEVkaXRvckNvbmZpZ3VyYXRpb25LZXlzID0gPHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9Pk9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0T2JqZWN0LmtleXMoZWRpdG9yQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzISkuZm9yRWFjaCgocHJvcCkgPT4ge1xuXHRcdFx0Y2FjaGVkRWRpdG9yQ29uZmlndXJhdGlvbktleXMhW3Byb3BdID0gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gY2FjaGVkRWRpdG9yQ29uZmlndXJhdGlvbktleXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VkaXRvckNvbmZpZ3VyYXRpb25LZXkoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgZWRpdG9yQ29uZmlndXJhdGlvbktleXMgPSBnZXRFZGl0b3JDb25maWd1cmF0aW9uS2V5cygpO1xuXHRyZXR1cm4gKGVkaXRvckNvbmZpZ3VyYXRpb25LZXlzW2BlZGl0b3IuJHtrZXl9YF0gfHwgZmFsc2UpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEaWZmRWRpdG9yQ29uZmlndXJhdGlvbktleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uS2V5cyA9IGdldEVkaXRvckNvbmZpZ3VyYXRpb25LZXlzKCk7XG5cdHJldHVybiAoZWRpdG9yQ29uZmlndXJhdGlvbktleXNbYGRpZmZFZGl0b3IuJHtrZXl9YF0gfHwgZmFsc2UpO1xufVxuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihlZGl0b3JDb25maWd1cmF0aW9uKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyRWRpdG9yRm9udENvbmZpZ3VyYXRpb25zKGdldEZvbnRTbmlwcGV0czogKCkgPT4gUHJvbWlzZTxJSlNPTlNjaGVtYVNuaXBwZXRbXT4pIHtcblx0Y29uc3QgZWRpdG9yS2V5c1dpdGhGb250ID0gWydlZGl0b3IuZm9udEZhbWlseSddO1xuXHRjb25zdCBmb250U25pcHBldHMgPSBhd2FpdCBnZXRGb250U25pcHBldHMoKTtcblx0Zm9yIChjb25zdCBrZXkgb2YgZWRpdG9yS2V5c1dpdGhGb250KSB7XG5cdFx0aWYgKFxuXHRcdFx0ZWRpdG9yQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzICYmIGVkaXRvckNvbmZpZ3VyYXRpb24ucHJvcGVydGllc1trZXldXG5cdFx0KSB7XG5cdFx0XHRlZGl0b3JDb25maWd1cmF0aW9uLnByb3BlcnRpZXNba2V5XS5kZWZhdWx0U25pcHBldHMgPSBmb250U25pcHBldHM7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxvQkFBb0Isa0JBQTRGO0FBQ3pILFNBQVMsZ0JBQWdCO0FBRWxCLE1BQU0sOEJBQThCLE9BQU8sT0FBMkI7QUFBQSxFQUM1RSxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixPQUFPLElBQUksU0FBUyw0QkFBNEIsUUFBUTtBQUFBLEVBQ3hELE9BQU8sbUJBQW1CO0FBQzNCLENBQUM7QUFFRCxNQUFNLHNCQUEwQztBQUFBLEVBQy9DLEdBQUc7QUFBQSxFQUNILFlBQVk7QUFBQSxJQUNYLGtCQUFrQjtBQUFBLE1BQ2pCLE1BQU07QUFBQSxNQUNOLFNBQVMsc0JBQXNCO0FBQUEsTUFDL0IsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQUksU0FBUyxXQUFXLGlIQUFpSCw4QkFBOEI7QUFBQSxJQUM3TDtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsU0FBUztBQUFBLFFBQ1I7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxTQUFTO0FBQUEsUUFDakI7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMsY0FBYyxtTUFBcU07QUFBQSxJQUN0UDtBQUFBLElBQ0EsdUJBQXVCO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sU0FBUyxzQkFBc0I7QUFBQSxNQUMvQixxQkFBcUIsSUFBSSxTQUFTLGdCQUFnQiw0R0FBNEcsOEJBQThCO0FBQUEsSUFDN0w7QUFBQSxJQUNBLDRCQUE0QjtBQUFBLE1BQzNC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
