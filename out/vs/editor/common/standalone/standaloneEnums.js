var AccessibilitySupport = /* @__PURE__ */ ((AccessibilitySupport2) => {
  AccessibilitySupport2[AccessibilitySupport2["Unknown"] = 0] = "Unknown";
  AccessibilitySupport2[AccessibilitySupport2["Disabled"] = 1] = "Disabled";
  AccessibilitySupport2[AccessibilitySupport2["Enabled"] = 2] = "Enabled";
  return AccessibilitySupport2;
})(AccessibilitySupport || {});
var CodeActionTriggerType = /* @__PURE__ */ ((CodeActionTriggerType2) => {
  CodeActionTriggerType2[CodeActionTriggerType2["Invoke"] = 1] = "Invoke";
  CodeActionTriggerType2[CodeActionTriggerType2["Auto"] = 2] = "Auto";
  return CodeActionTriggerType2;
})(CodeActionTriggerType || {});
var CompletionItemInsertTextRule = /* @__PURE__ */ ((CompletionItemInsertTextRule2) => {
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["None"] = 0] = "None";
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["KeepWhitespace"] = 1] = "KeepWhitespace";
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["InsertAsSnippet"] = 4] = "InsertAsSnippet";
  return CompletionItemInsertTextRule2;
})(CompletionItemInsertTextRule || {});
var CompletionItemKind = /* @__PURE__ */ ((CompletionItemKind2) => {
  CompletionItemKind2[CompletionItemKind2["Method"] = 0] = "Method";
  CompletionItemKind2[CompletionItemKind2["Function"] = 1] = "Function";
  CompletionItemKind2[CompletionItemKind2["Constructor"] = 2] = "Constructor";
  CompletionItemKind2[CompletionItemKind2["Field"] = 3] = "Field";
  CompletionItemKind2[CompletionItemKind2["Variable"] = 4] = "Variable";
  CompletionItemKind2[CompletionItemKind2["Class"] = 5] = "Class";
  CompletionItemKind2[CompletionItemKind2["Struct"] = 6] = "Struct";
  CompletionItemKind2[CompletionItemKind2["Interface"] = 7] = "Interface";
  CompletionItemKind2[CompletionItemKind2["Module"] = 8] = "Module";
  CompletionItemKind2[CompletionItemKind2["Property"] = 9] = "Property";
  CompletionItemKind2[CompletionItemKind2["Event"] = 10] = "Event";
  CompletionItemKind2[CompletionItemKind2["Operator"] = 11] = "Operator";
  CompletionItemKind2[CompletionItemKind2["Unit"] = 12] = "Unit";
  CompletionItemKind2[CompletionItemKind2["Value"] = 13] = "Value";
  CompletionItemKind2[CompletionItemKind2["Constant"] = 14] = "Constant";
  CompletionItemKind2[CompletionItemKind2["Enum"] = 15] = "Enum";
  CompletionItemKind2[CompletionItemKind2["EnumMember"] = 16] = "EnumMember";
  CompletionItemKind2[CompletionItemKind2["Keyword"] = 17] = "Keyword";
  CompletionItemKind2[CompletionItemKind2["Text"] = 18] = "Text";
  CompletionItemKind2[CompletionItemKind2["Color"] = 19] = "Color";
  CompletionItemKind2[CompletionItemKind2["File"] = 20] = "File";
  CompletionItemKind2[CompletionItemKind2["Reference"] = 21] = "Reference";
  CompletionItemKind2[CompletionItemKind2["Customcolor"] = 22] = "Customcolor";
  CompletionItemKind2[CompletionItemKind2["Folder"] = 23] = "Folder";
  CompletionItemKind2[CompletionItemKind2["TypeParameter"] = 24] = "TypeParameter";
  CompletionItemKind2[CompletionItemKind2["User"] = 25] = "User";
  CompletionItemKind2[CompletionItemKind2["Issue"] = 26] = "Issue";
  CompletionItemKind2[CompletionItemKind2["Tool"] = 27] = "Tool";
  CompletionItemKind2[CompletionItemKind2["Snippet"] = 28] = "Snippet";
  return CompletionItemKind2;
})(CompletionItemKind || {});
var CompletionItemTag = /* @__PURE__ */ ((CompletionItemTag2) => {
  CompletionItemTag2[CompletionItemTag2["Deprecated"] = 1] = "Deprecated";
  return CompletionItemTag2;
})(CompletionItemTag || {});
var CompletionTriggerKind = /* @__PURE__ */ ((CompletionTriggerKind2) => {
  CompletionTriggerKind2[CompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerCharacter"] = 1] = "TriggerCharacter";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
  return CompletionTriggerKind2;
})(CompletionTriggerKind || {});
var ContentWidgetPositionPreference = /* @__PURE__ */ ((ContentWidgetPositionPreference2) => {
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["EXACT"] = 0] = "EXACT";
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["ABOVE"] = 1] = "ABOVE";
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["BELOW"] = 2] = "BELOW";
  return ContentWidgetPositionPreference2;
})(ContentWidgetPositionPreference || {});
var CursorChangeReason = /* @__PURE__ */ ((CursorChangeReason2) => {
  CursorChangeReason2[CursorChangeReason2["NotSet"] = 0] = "NotSet";
  CursorChangeReason2[CursorChangeReason2["ContentFlush"] = 1] = "ContentFlush";
  CursorChangeReason2[CursorChangeReason2["RecoverFromMarkers"] = 2] = "RecoverFromMarkers";
  CursorChangeReason2[CursorChangeReason2["Explicit"] = 3] = "Explicit";
  CursorChangeReason2[CursorChangeReason2["Paste"] = 4] = "Paste";
  CursorChangeReason2[CursorChangeReason2["Undo"] = 5] = "Undo";
  CursorChangeReason2[CursorChangeReason2["Redo"] = 6] = "Redo";
  return CursorChangeReason2;
})(CursorChangeReason || {});
var DefaultEndOfLine = /* @__PURE__ */ ((DefaultEndOfLine2) => {
  DefaultEndOfLine2[DefaultEndOfLine2["LF"] = 1] = "LF";
  DefaultEndOfLine2[DefaultEndOfLine2["CRLF"] = 2] = "CRLF";
  return DefaultEndOfLine2;
})(DefaultEndOfLine || {});
var DocumentHighlightKind = /* @__PURE__ */ ((DocumentHighlightKind2) => {
  DocumentHighlightKind2[DocumentHighlightKind2["Text"] = 0] = "Text";
  DocumentHighlightKind2[DocumentHighlightKind2["Read"] = 1] = "Read";
  DocumentHighlightKind2[DocumentHighlightKind2["Write"] = 2] = "Write";
  return DocumentHighlightKind2;
})(DocumentHighlightKind || {});
var EditorAutoIndentStrategy = /* @__PURE__ */ ((EditorAutoIndentStrategy2) => {
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["None"] = 0] = "None";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Keep"] = 1] = "Keep";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Brackets"] = 2] = "Brackets";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Advanced"] = 3] = "Advanced";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Full"] = 4] = "Full";
  return EditorAutoIndentStrategy2;
})(EditorAutoIndentStrategy || {});
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
var EndOfLinePreference = /* @__PURE__ */ ((EndOfLinePreference2) => {
  EndOfLinePreference2[EndOfLinePreference2["TextDefined"] = 0] = "TextDefined";
  EndOfLinePreference2[EndOfLinePreference2["LF"] = 1] = "LF";
  EndOfLinePreference2[EndOfLinePreference2["CRLF"] = 2] = "CRLF";
  return EndOfLinePreference2;
})(EndOfLinePreference || {});
var EndOfLineSequence = /* @__PURE__ */ ((EndOfLineSequence2) => {
  EndOfLineSequence2[EndOfLineSequence2["LF"] = 0] = "LF";
  EndOfLineSequence2[EndOfLineSequence2["CRLF"] = 1] = "CRLF";
  return EndOfLineSequence2;
})(EndOfLineSequence || {});
var GlyphMarginLane = /* @__PURE__ */ ((GlyphMarginLane2) => {
  GlyphMarginLane2[GlyphMarginLane2["Left"] = 1] = "Left";
  GlyphMarginLane2[GlyphMarginLane2["Center"] = 2] = "Center";
  GlyphMarginLane2[GlyphMarginLane2["Right"] = 3] = "Right";
  return GlyphMarginLane2;
})(GlyphMarginLane || {});
var HoverVerbosityAction = /* @__PURE__ */ ((HoverVerbosityAction2) => {
  HoverVerbosityAction2[HoverVerbosityAction2["Increase"] = 0] = "Increase";
  HoverVerbosityAction2[HoverVerbosityAction2["Decrease"] = 1] = "Decrease";
  return HoverVerbosityAction2;
})(HoverVerbosityAction || {});
var IndentAction = /* @__PURE__ */ ((IndentAction2) => {
  IndentAction2[IndentAction2["None"] = 0] = "None";
  IndentAction2[IndentAction2["Indent"] = 1] = "Indent";
  IndentAction2[IndentAction2["IndentOutdent"] = 2] = "IndentOutdent";
  IndentAction2[IndentAction2["Outdent"] = 3] = "Outdent";
  return IndentAction2;
})(IndentAction || {});
var InjectedTextCursorStops = /* @__PURE__ */ ((InjectedTextCursorStops2) => {
  InjectedTextCursorStops2[InjectedTextCursorStops2["Both"] = 0] = "Both";
  InjectedTextCursorStops2[InjectedTextCursorStops2["Right"] = 1] = "Right";
  InjectedTextCursorStops2[InjectedTextCursorStops2["Left"] = 2] = "Left";
  InjectedTextCursorStops2[InjectedTextCursorStops2["None"] = 3] = "None";
  return InjectedTextCursorStops2;
})(InjectedTextCursorStops || {});
var InlayHintKind = /* @__PURE__ */ ((InlayHintKind2) => {
  InlayHintKind2[InlayHintKind2["Type"] = 1] = "Type";
  InlayHintKind2[InlayHintKind2["Parameter"] = 2] = "Parameter";
  return InlayHintKind2;
})(InlayHintKind || {});
var InlineCompletionEndOfLifeReasonKind = /* @__PURE__ */ ((InlineCompletionEndOfLifeReasonKind2) => {
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Accepted"] = 0] = "Accepted";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Rejected"] = 1] = "Rejected";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Ignored"] = 2] = "Ignored";
  return InlineCompletionEndOfLifeReasonKind2;
})(InlineCompletionEndOfLifeReasonKind || {});
var InlineCompletionHintStyle = /* @__PURE__ */ ((InlineCompletionHintStyle2) => {
  InlineCompletionHintStyle2[InlineCompletionHintStyle2["Code"] = 1] = "Code";
  InlineCompletionHintStyle2[InlineCompletionHintStyle2["Label"] = 2] = "Label";
  return InlineCompletionHintStyle2;
})(InlineCompletionHintStyle || {});
var InlineCompletionTriggerKind = /* @__PURE__ */ ((InlineCompletionTriggerKind2) => {
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Automatic"] = 0] = "Automatic";
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Explicit"] = 1] = "Explicit";
  return InlineCompletionTriggerKind2;
})(InlineCompletionTriggerKind || {});
var KeyCode = /* @__PURE__ */ ((KeyCode2) => {
  KeyCode2[KeyCode2["DependsOnKbLayout"] = -1] = "DependsOnKbLayout";
  KeyCode2[KeyCode2["Unknown"] = 0] = "Unknown";
  KeyCode2[KeyCode2["Backspace"] = 1] = "Backspace";
  KeyCode2[KeyCode2["Tab"] = 2] = "Tab";
  KeyCode2[KeyCode2["Enter"] = 3] = "Enter";
  KeyCode2[KeyCode2["Shift"] = 4] = "Shift";
  KeyCode2[KeyCode2["Ctrl"] = 5] = "Ctrl";
  KeyCode2[KeyCode2["Alt"] = 6] = "Alt";
  KeyCode2[KeyCode2["PauseBreak"] = 7] = "PauseBreak";
  KeyCode2[KeyCode2["CapsLock"] = 8] = "CapsLock";
  KeyCode2[KeyCode2["Escape"] = 9] = "Escape";
  KeyCode2[KeyCode2["Space"] = 10] = "Space";
  KeyCode2[KeyCode2["PageUp"] = 11] = "PageUp";
  KeyCode2[KeyCode2["PageDown"] = 12] = "PageDown";
  KeyCode2[KeyCode2["End"] = 13] = "End";
  KeyCode2[KeyCode2["Home"] = 14] = "Home";
  KeyCode2[KeyCode2["LeftArrow"] = 15] = "LeftArrow";
  KeyCode2[KeyCode2["UpArrow"] = 16] = "UpArrow";
  KeyCode2[KeyCode2["RightArrow"] = 17] = "RightArrow";
  KeyCode2[KeyCode2["DownArrow"] = 18] = "DownArrow";
  KeyCode2[KeyCode2["Insert"] = 19] = "Insert";
  KeyCode2[KeyCode2["Delete"] = 20] = "Delete";
  KeyCode2[KeyCode2["Digit0"] = 21] = "Digit0";
  KeyCode2[KeyCode2["Digit1"] = 22] = "Digit1";
  KeyCode2[KeyCode2["Digit2"] = 23] = "Digit2";
  KeyCode2[KeyCode2["Digit3"] = 24] = "Digit3";
  KeyCode2[KeyCode2["Digit4"] = 25] = "Digit4";
  KeyCode2[KeyCode2["Digit5"] = 26] = "Digit5";
  KeyCode2[KeyCode2["Digit6"] = 27] = "Digit6";
  KeyCode2[KeyCode2["Digit7"] = 28] = "Digit7";
  KeyCode2[KeyCode2["Digit8"] = 29] = "Digit8";
  KeyCode2[KeyCode2["Digit9"] = 30] = "Digit9";
  KeyCode2[KeyCode2["KeyA"] = 31] = "KeyA";
  KeyCode2[KeyCode2["KeyB"] = 32] = "KeyB";
  KeyCode2[KeyCode2["KeyC"] = 33] = "KeyC";
  KeyCode2[KeyCode2["KeyD"] = 34] = "KeyD";
  KeyCode2[KeyCode2["KeyE"] = 35] = "KeyE";
  KeyCode2[KeyCode2["KeyF"] = 36] = "KeyF";
  KeyCode2[KeyCode2["KeyG"] = 37] = "KeyG";
  KeyCode2[KeyCode2["KeyH"] = 38] = "KeyH";
  KeyCode2[KeyCode2["KeyI"] = 39] = "KeyI";
  KeyCode2[KeyCode2["KeyJ"] = 40] = "KeyJ";
  KeyCode2[KeyCode2["KeyK"] = 41] = "KeyK";
  KeyCode2[KeyCode2["KeyL"] = 42] = "KeyL";
  KeyCode2[KeyCode2["KeyM"] = 43] = "KeyM";
  KeyCode2[KeyCode2["KeyN"] = 44] = "KeyN";
  KeyCode2[KeyCode2["KeyO"] = 45] = "KeyO";
  KeyCode2[KeyCode2["KeyP"] = 46] = "KeyP";
  KeyCode2[KeyCode2["KeyQ"] = 47] = "KeyQ";
  KeyCode2[KeyCode2["KeyR"] = 48] = "KeyR";
  KeyCode2[KeyCode2["KeyS"] = 49] = "KeyS";
  KeyCode2[KeyCode2["KeyT"] = 50] = "KeyT";
  KeyCode2[KeyCode2["KeyU"] = 51] = "KeyU";
  KeyCode2[KeyCode2["KeyV"] = 52] = "KeyV";
  KeyCode2[KeyCode2["KeyW"] = 53] = "KeyW";
  KeyCode2[KeyCode2["KeyX"] = 54] = "KeyX";
  KeyCode2[KeyCode2["KeyY"] = 55] = "KeyY";
  KeyCode2[KeyCode2["KeyZ"] = 56] = "KeyZ";
  KeyCode2[KeyCode2["Meta"] = 57] = "Meta";
  KeyCode2[KeyCode2["ContextMenu"] = 58] = "ContextMenu";
  KeyCode2[KeyCode2["F1"] = 59] = "F1";
  KeyCode2[KeyCode2["F2"] = 60] = "F2";
  KeyCode2[KeyCode2["F3"] = 61] = "F3";
  KeyCode2[KeyCode2["F4"] = 62] = "F4";
  KeyCode2[KeyCode2["F5"] = 63] = "F5";
  KeyCode2[KeyCode2["F6"] = 64] = "F6";
  KeyCode2[KeyCode2["F7"] = 65] = "F7";
  KeyCode2[KeyCode2["F8"] = 66] = "F8";
  KeyCode2[KeyCode2["F9"] = 67] = "F9";
  KeyCode2[KeyCode2["F10"] = 68] = "F10";
  KeyCode2[KeyCode2["F11"] = 69] = "F11";
  KeyCode2[KeyCode2["F12"] = 70] = "F12";
  KeyCode2[KeyCode2["F13"] = 71] = "F13";
  KeyCode2[KeyCode2["F14"] = 72] = "F14";
  KeyCode2[KeyCode2["F15"] = 73] = "F15";
  KeyCode2[KeyCode2["F16"] = 74] = "F16";
  KeyCode2[KeyCode2["F17"] = 75] = "F17";
  KeyCode2[KeyCode2["F18"] = 76] = "F18";
  KeyCode2[KeyCode2["F19"] = 77] = "F19";
  KeyCode2[KeyCode2["F20"] = 78] = "F20";
  KeyCode2[KeyCode2["F21"] = 79] = "F21";
  KeyCode2[KeyCode2["F22"] = 80] = "F22";
  KeyCode2[KeyCode2["F23"] = 81] = "F23";
  KeyCode2[KeyCode2["F24"] = 82] = "F24";
  KeyCode2[KeyCode2["NumLock"] = 83] = "NumLock";
  KeyCode2[KeyCode2["ScrollLock"] = 84] = "ScrollLock";
  KeyCode2[KeyCode2["Semicolon"] = 85] = "Semicolon";
  KeyCode2[KeyCode2["Equal"] = 86] = "Equal";
  KeyCode2[KeyCode2["Comma"] = 87] = "Comma";
  KeyCode2[KeyCode2["Minus"] = 88] = "Minus";
  KeyCode2[KeyCode2["Period"] = 89] = "Period";
  KeyCode2[KeyCode2["Slash"] = 90] = "Slash";
  KeyCode2[KeyCode2["Backquote"] = 91] = "Backquote";
  KeyCode2[KeyCode2["BracketLeft"] = 92] = "BracketLeft";
  KeyCode2[KeyCode2["Backslash"] = 93] = "Backslash";
  KeyCode2[KeyCode2["BracketRight"] = 94] = "BracketRight";
  KeyCode2[KeyCode2["Quote"] = 95] = "Quote";
  KeyCode2[KeyCode2["OEM_8"] = 96] = "OEM_8";
  KeyCode2[KeyCode2["IntlBackslash"] = 97] = "IntlBackslash";
  KeyCode2[KeyCode2["Numpad0"] = 98] = "Numpad0";
  KeyCode2[KeyCode2["Numpad1"] = 99] = "Numpad1";
  KeyCode2[KeyCode2["Numpad2"] = 100] = "Numpad2";
  KeyCode2[KeyCode2["Numpad3"] = 101] = "Numpad3";
  KeyCode2[KeyCode2["Numpad4"] = 102] = "Numpad4";
  KeyCode2[KeyCode2["Numpad5"] = 103] = "Numpad5";
  KeyCode2[KeyCode2["Numpad6"] = 104] = "Numpad6";
  KeyCode2[KeyCode2["Numpad7"] = 105] = "Numpad7";
  KeyCode2[KeyCode2["Numpad8"] = 106] = "Numpad8";
  KeyCode2[KeyCode2["Numpad9"] = 107] = "Numpad9";
  KeyCode2[KeyCode2["NumpadMultiply"] = 108] = "NumpadMultiply";
  KeyCode2[KeyCode2["NumpadAdd"] = 109] = "NumpadAdd";
  KeyCode2[KeyCode2["NUMPAD_SEPARATOR"] = 110] = "NUMPAD_SEPARATOR";
  KeyCode2[KeyCode2["NumpadSubtract"] = 111] = "NumpadSubtract";
  KeyCode2[KeyCode2["NumpadDecimal"] = 112] = "NumpadDecimal";
  KeyCode2[KeyCode2["NumpadDivide"] = 113] = "NumpadDivide";
  KeyCode2[KeyCode2["KEY_IN_COMPOSITION"] = 114] = "KEY_IN_COMPOSITION";
  KeyCode2[KeyCode2["ABNT_C1"] = 115] = "ABNT_C1";
  KeyCode2[KeyCode2["ABNT_C2"] = 116] = "ABNT_C2";
  KeyCode2[KeyCode2["AudioVolumeMute"] = 117] = "AudioVolumeMute";
  KeyCode2[KeyCode2["AudioVolumeUp"] = 118] = "AudioVolumeUp";
  KeyCode2[KeyCode2["AudioVolumeDown"] = 119] = "AudioVolumeDown";
  KeyCode2[KeyCode2["BrowserSearch"] = 120] = "BrowserSearch";
  KeyCode2[KeyCode2["BrowserHome"] = 121] = "BrowserHome";
  KeyCode2[KeyCode2["BrowserBack"] = 122] = "BrowserBack";
  KeyCode2[KeyCode2["BrowserForward"] = 123] = "BrowserForward";
  KeyCode2[KeyCode2["MediaTrackNext"] = 124] = "MediaTrackNext";
  KeyCode2[KeyCode2["MediaTrackPrevious"] = 125] = "MediaTrackPrevious";
  KeyCode2[KeyCode2["MediaStop"] = 126] = "MediaStop";
  KeyCode2[KeyCode2["MediaPlayPause"] = 127] = "MediaPlayPause";
  KeyCode2[KeyCode2["LaunchMediaPlayer"] = 128] = "LaunchMediaPlayer";
  KeyCode2[KeyCode2["LaunchMail"] = 129] = "LaunchMail";
  KeyCode2[KeyCode2["LaunchApp2"] = 130] = "LaunchApp2";
  KeyCode2[KeyCode2["Clear"] = 131] = "Clear";
  KeyCode2[KeyCode2["MAX_VALUE"] = 132] = "MAX_VALUE";
  return KeyCode2;
})(KeyCode || {});
var MarkerSeverity = /* @__PURE__ */ ((MarkerSeverity2) => {
  MarkerSeverity2[MarkerSeverity2["Hint"] = 1] = "Hint";
  MarkerSeverity2[MarkerSeverity2["Info"] = 2] = "Info";
  MarkerSeverity2[MarkerSeverity2["Warning"] = 4] = "Warning";
  MarkerSeverity2[MarkerSeverity2["Error"] = 8] = "Error";
  return MarkerSeverity2;
})(MarkerSeverity || {});
var MarkerTag = /* @__PURE__ */ ((MarkerTag2) => {
  MarkerTag2[MarkerTag2["Unnecessary"] = 1] = "Unnecessary";
  MarkerTag2[MarkerTag2["Deprecated"] = 2] = "Deprecated";
  return MarkerTag2;
})(MarkerTag || {});
var MinimapPosition = /* @__PURE__ */ ((MinimapPosition2) => {
  MinimapPosition2[MinimapPosition2["Inline"] = 1] = "Inline";
  MinimapPosition2[MinimapPosition2["Gutter"] = 2] = "Gutter";
  return MinimapPosition2;
})(MinimapPosition || {});
var MinimapSectionHeaderStyle = /* @__PURE__ */ ((MinimapSectionHeaderStyle2) => {
  MinimapSectionHeaderStyle2[MinimapSectionHeaderStyle2["Normal"] = 1] = "Normal";
  MinimapSectionHeaderStyle2[MinimapSectionHeaderStyle2["Underlined"] = 2] = "Underlined";
  return MinimapSectionHeaderStyle2;
})(MinimapSectionHeaderStyle || {});
var MouseTargetType = /* @__PURE__ */ ((MouseTargetType2) => {
  MouseTargetType2[MouseTargetType2["UNKNOWN"] = 0] = "UNKNOWN";
  MouseTargetType2[MouseTargetType2["TEXTAREA"] = 1] = "TEXTAREA";
  MouseTargetType2[MouseTargetType2["GUTTER_GLYPH_MARGIN"] = 2] = "GUTTER_GLYPH_MARGIN";
  MouseTargetType2[MouseTargetType2["GUTTER_LINE_NUMBERS"] = 3] = "GUTTER_LINE_NUMBERS";
  MouseTargetType2[MouseTargetType2["GUTTER_LINE_DECORATIONS"] = 4] = "GUTTER_LINE_DECORATIONS";
  MouseTargetType2[MouseTargetType2["GUTTER_VIEW_ZONE"] = 5] = "GUTTER_VIEW_ZONE";
  MouseTargetType2[MouseTargetType2["CONTENT_TEXT"] = 6] = "CONTENT_TEXT";
  MouseTargetType2[MouseTargetType2["CONTENT_EMPTY"] = 7] = "CONTENT_EMPTY";
  MouseTargetType2[MouseTargetType2["CONTENT_VIEW_ZONE"] = 8] = "CONTENT_VIEW_ZONE";
  MouseTargetType2[MouseTargetType2["CONTENT_WIDGET"] = 9] = "CONTENT_WIDGET";
  MouseTargetType2[MouseTargetType2["OVERVIEW_RULER"] = 10] = "OVERVIEW_RULER";
  MouseTargetType2[MouseTargetType2["SCROLLBAR"] = 11] = "SCROLLBAR";
  MouseTargetType2[MouseTargetType2["OVERLAY_WIDGET"] = 12] = "OVERLAY_WIDGET";
  MouseTargetType2[MouseTargetType2["OUTSIDE_EDITOR"] = 13] = "OUTSIDE_EDITOR";
  return MouseTargetType2;
})(MouseTargetType || {});
var NewSymbolNameTag = /* @__PURE__ */ ((NewSymbolNameTag2) => {
  NewSymbolNameTag2[NewSymbolNameTag2["AIGenerated"] = 1] = "AIGenerated";
  return NewSymbolNameTag2;
})(NewSymbolNameTag || {});
var NewSymbolNameTriggerKind = /* @__PURE__ */ ((NewSymbolNameTriggerKind2) => {
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Invoke"] = 0] = "Invoke";
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Automatic"] = 1] = "Automatic";
  return NewSymbolNameTriggerKind2;
})(NewSymbolNameTriggerKind || {});
var OverlayWidgetPositionPreference = /* @__PURE__ */ ((OverlayWidgetPositionPreference2) => {
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["TOP_RIGHT_CORNER"] = 0] = "TOP_RIGHT_CORNER";
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["BOTTOM_RIGHT_CORNER"] = 1] = "BOTTOM_RIGHT_CORNER";
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["TOP_CENTER"] = 2] = "TOP_CENTER";
  return OverlayWidgetPositionPreference2;
})(OverlayWidgetPositionPreference || {});
var OverviewRulerLane = /* @__PURE__ */ ((OverviewRulerLane2) => {
  OverviewRulerLane2[OverviewRulerLane2["Left"] = 1] = "Left";
  OverviewRulerLane2[OverviewRulerLane2["Center"] = 2] = "Center";
  OverviewRulerLane2[OverviewRulerLane2["Right"] = 4] = "Right";
  OverviewRulerLane2[OverviewRulerLane2["Full"] = 7] = "Full";
  return OverviewRulerLane2;
})(OverviewRulerLane || {});
var PartialAcceptTriggerKind = /* @__PURE__ */ ((PartialAcceptTriggerKind2) => {
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Word"] = 0] = "Word";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Line"] = 1] = "Line";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Suggest"] = 2] = "Suggest";
  return PartialAcceptTriggerKind2;
})(PartialAcceptTriggerKind || {});
var PositionAffinity = /* @__PURE__ */ ((PositionAffinity2) => {
  PositionAffinity2[PositionAffinity2["Left"] = 0] = "Left";
  PositionAffinity2[PositionAffinity2["Right"] = 1] = "Right";
  PositionAffinity2[PositionAffinity2["None"] = 2] = "None";
  PositionAffinity2[PositionAffinity2["LeftOfInjectedText"] = 3] = "LeftOfInjectedText";
  PositionAffinity2[PositionAffinity2["RightOfInjectedText"] = 4] = "RightOfInjectedText";
  return PositionAffinity2;
})(PositionAffinity || {});
var RenderLineNumbersType = /* @__PURE__ */ ((RenderLineNumbersType2) => {
  RenderLineNumbersType2[RenderLineNumbersType2["Off"] = 0] = "Off";
  RenderLineNumbersType2[RenderLineNumbersType2["On"] = 1] = "On";
  RenderLineNumbersType2[RenderLineNumbersType2["Relative"] = 2] = "Relative";
  RenderLineNumbersType2[RenderLineNumbersType2["Interval"] = 3] = "Interval";
  RenderLineNumbersType2[RenderLineNumbersType2["Custom"] = 4] = "Custom";
  return RenderLineNumbersType2;
})(RenderLineNumbersType || {});
var RenderMinimap = /* @__PURE__ */ ((RenderMinimap2) => {
  RenderMinimap2[RenderMinimap2["None"] = 0] = "None";
  RenderMinimap2[RenderMinimap2["Text"] = 1] = "Text";
  RenderMinimap2[RenderMinimap2["Blocks"] = 2] = "Blocks";
  return RenderMinimap2;
})(RenderMinimap || {});
var ScrollType = /* @__PURE__ */ ((ScrollType2) => {
  ScrollType2[ScrollType2["Smooth"] = 0] = "Smooth";
  ScrollType2[ScrollType2["Immediate"] = 1] = "Immediate";
  return ScrollType2;
})(ScrollType || {});
var ScrollbarVisibility = /* @__PURE__ */ ((ScrollbarVisibility2) => {
  ScrollbarVisibility2[ScrollbarVisibility2["Auto"] = 1] = "Auto";
  ScrollbarVisibility2[ScrollbarVisibility2["Hidden"] = 2] = "Hidden";
  ScrollbarVisibility2[ScrollbarVisibility2["Visible"] = 3] = "Visible";
  return ScrollbarVisibility2;
})(ScrollbarVisibility || {});
var SelectionDirection = /* @__PURE__ */ ((SelectionDirection2) => {
  SelectionDirection2[SelectionDirection2["LTR"] = 0] = "LTR";
  SelectionDirection2[SelectionDirection2["RTL"] = 1] = "RTL";
  return SelectionDirection2;
})(SelectionDirection || {});
var ShowLightbulbIconMode = /* @__PURE__ */ ((ShowLightbulbIconMode2) => {
  ShowLightbulbIconMode2["Off"] = "off";
  ShowLightbulbIconMode2["OnCode"] = "onCode";
  ShowLightbulbIconMode2["On"] = "on";
  return ShowLightbulbIconMode2;
})(ShowLightbulbIconMode || {});
var SignatureHelpTriggerKind = /* @__PURE__ */ ((SignatureHelpTriggerKind2) => {
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["Invoke"] = 1] = "Invoke";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["TriggerCharacter"] = 2] = "TriggerCharacter";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["ContentChange"] = 3] = "ContentChange";
  return SignatureHelpTriggerKind2;
})(SignatureHelpTriggerKind || {});
var SymbolKind = /* @__PURE__ */ ((SymbolKind2) => {
  SymbolKind2[SymbolKind2["File"] = 0] = "File";
  SymbolKind2[SymbolKind2["Module"] = 1] = "Module";
  SymbolKind2[SymbolKind2["Namespace"] = 2] = "Namespace";
  SymbolKind2[SymbolKind2["Package"] = 3] = "Package";
  SymbolKind2[SymbolKind2["Class"] = 4] = "Class";
  SymbolKind2[SymbolKind2["Method"] = 5] = "Method";
  SymbolKind2[SymbolKind2["Property"] = 6] = "Property";
  SymbolKind2[SymbolKind2["Field"] = 7] = "Field";
  SymbolKind2[SymbolKind2["Constructor"] = 8] = "Constructor";
  SymbolKind2[SymbolKind2["Enum"] = 9] = "Enum";
  SymbolKind2[SymbolKind2["Interface"] = 10] = "Interface";
  SymbolKind2[SymbolKind2["Function"] = 11] = "Function";
  SymbolKind2[SymbolKind2["Variable"] = 12] = "Variable";
  SymbolKind2[SymbolKind2["Constant"] = 13] = "Constant";
  SymbolKind2[SymbolKind2["String"] = 14] = "String";
  SymbolKind2[SymbolKind2["Number"] = 15] = "Number";
  SymbolKind2[SymbolKind2["Boolean"] = 16] = "Boolean";
  SymbolKind2[SymbolKind2["Array"] = 17] = "Array";
  SymbolKind2[SymbolKind2["Object"] = 18] = "Object";
  SymbolKind2[SymbolKind2["Key"] = 19] = "Key";
  SymbolKind2[SymbolKind2["Null"] = 20] = "Null";
  SymbolKind2[SymbolKind2["EnumMember"] = 21] = "EnumMember";
  SymbolKind2[SymbolKind2["Struct"] = 22] = "Struct";
  SymbolKind2[SymbolKind2["Event"] = 23] = "Event";
  SymbolKind2[SymbolKind2["Operator"] = 24] = "Operator";
  SymbolKind2[SymbolKind2["TypeParameter"] = 25] = "TypeParameter";
  return SymbolKind2;
})(SymbolKind || {});
var SymbolTag = /* @__PURE__ */ ((SymbolTag2) => {
  SymbolTag2[SymbolTag2["Deprecated"] = 1] = "Deprecated";
  return SymbolTag2;
})(SymbolTag || {});
var TextDirection = /* @__PURE__ */ ((TextDirection2) => {
  TextDirection2[TextDirection2["LTR"] = 0] = "LTR";
  TextDirection2[TextDirection2["RTL"] = 1] = "RTL";
  return TextDirection2;
})(TextDirection || {});
var TextEditorCursorBlinkingStyle = /* @__PURE__ */ ((TextEditorCursorBlinkingStyle2) => {
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Hidden"] = 0] = "Hidden";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Blink"] = 1] = "Blink";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Smooth"] = 2] = "Smooth";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Phase"] = 3] = "Phase";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Expand"] = 4] = "Expand";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Solid"] = 5] = "Solid";
  return TextEditorCursorBlinkingStyle2;
})(TextEditorCursorBlinkingStyle || {});
var TextEditorCursorStyle = /* @__PURE__ */ ((TextEditorCursorStyle2) => {
  TextEditorCursorStyle2[TextEditorCursorStyle2["Line"] = 1] = "Line";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Block"] = 2] = "Block";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Underline"] = 3] = "Underline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["LineThin"] = 4] = "LineThin";
  TextEditorCursorStyle2[TextEditorCursorStyle2["BlockOutline"] = 5] = "BlockOutline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["UnderlineThin"] = 6] = "UnderlineThin";
  return TextEditorCursorStyle2;
})(TextEditorCursorStyle || {});
var TrackedRangeStickiness = /* @__PURE__ */ ((TrackedRangeStickiness2) => {
  TrackedRangeStickiness2[TrackedRangeStickiness2["AlwaysGrowsWhenTypingAtEdges"] = 0] = "AlwaysGrowsWhenTypingAtEdges";
  TrackedRangeStickiness2[TrackedRangeStickiness2["NeverGrowsWhenTypingAtEdges"] = 1] = "NeverGrowsWhenTypingAtEdges";
  TrackedRangeStickiness2[TrackedRangeStickiness2["GrowsOnlyWhenTypingBefore"] = 2] = "GrowsOnlyWhenTypingBefore";
  TrackedRangeStickiness2[TrackedRangeStickiness2["GrowsOnlyWhenTypingAfter"] = 3] = "GrowsOnlyWhenTypingAfter";
  return TrackedRangeStickiness2;
})(TrackedRangeStickiness || {});
var WrappingIndent = /* @__PURE__ */ ((WrappingIndent2) => {
  WrappingIndent2[WrappingIndent2["None"] = 0] = "None";
  WrappingIndent2[WrappingIndent2["Same"] = 1] = "Same";
  WrappingIndent2[WrappingIndent2["Indent"] = 2] = "Indent";
  WrappingIndent2[WrappingIndent2["DeepIndent"] = 3] = "DeepIndent";
  return WrappingIndent2;
})(WrappingIndent || {});
export {
  AccessibilitySupport,
  CodeActionTriggerType,
  CompletionItemInsertTextRule,
  CompletionItemKind,
  CompletionItemTag,
  CompletionTriggerKind,
  ContentWidgetPositionPreference,
  CursorChangeReason,
  DefaultEndOfLine,
  DocumentHighlightKind,
  EditorAutoIndentStrategy,
  EditorOption,
  EndOfLinePreference,
  EndOfLineSequence,
  GlyphMarginLane,
  HoverVerbosityAction,
  IndentAction,
  InjectedTextCursorStops,
  InlayHintKind,
  InlineCompletionEndOfLifeReasonKind,
  InlineCompletionHintStyle,
  InlineCompletionTriggerKind,
  KeyCode,
  MarkerSeverity,
  MarkerTag,
  MinimapPosition,
  MinimapSectionHeaderStyle,
  MouseTargetType,
  NewSymbolNameTag,
  NewSymbolNameTriggerKind,
  OverlayWidgetPositionPreference,
  OverviewRulerLane,
  PartialAcceptTriggerKind,
  PositionAffinity,
  RenderLineNumbersType,
  RenderMinimap,
  ScrollType,
  ScrollbarVisibility,
  SelectionDirection,
  ShowLightbulbIconMode,
  SignatureHelpTriggerKind,
  SymbolKind,
  SymbolTag,
  TextDirection,
  TextEditorCursorBlinkingStyle,
  TextEditorCursorStyle,
  TrackedRangeStickiness,
  WrappingIndent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc3RhbmRhbG9uZVxcc3RhbmRhbG9uZUVudW1zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gVEhJUyBJUyBBIEdFTkVSQVRFRCBGSUxFLiBETyBOT1QgRURJVCBESVJFQ1RMWS5cblxuXG5leHBvcnQgZW51bSBBY2Nlc3NpYmlsaXR5U3VwcG9ydCB7XG5cdC8qKlxuXHQgKiBUaGlzIHNob3VsZCBiZSB0aGUgYnJvd3NlciBjYXNlIHdoZXJlIGl0IGlzIG5vdCBrbm93biBpZiBhIHNjcmVlbiByZWFkZXIgaXMgYXR0YWNoZWQgb3Igbm8uXG5cdCAqL1xuXHRVbmtub3duID0gMCxcblx0RGlzYWJsZWQgPSAxLFxuXHRFbmFibGVkID0gMlxufVxuXG5leHBvcnQgZW51bSBDb2RlQWN0aW9uVHJpZ2dlclR5cGUge1xuXHRJbnZva2UgPSAxLFxuXHRBdXRvID0gMlxufVxuXG5leHBvcnQgZW51bSBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlIHtcblx0Tm9uZSA9IDAsXG5cdC8qKlxuXHQgKiBBZGp1c3Qgd2hpdGVzcGFjZS9pbmRlbnRhdGlvbiBvZiBtdWx0aWxpbmUgaW5zZXJ0IHRleHRzIHRvXG5cdCAqIG1hdGNoIHRoZSBjdXJyZW50IGxpbmUgaW5kZW50YXRpb24uXG5cdCAqL1xuXHRLZWVwV2hpdGVzcGFjZSA9IDEsXG5cdC8qKlxuXHQgKiBgaW5zZXJ0VGV4dGAgaXMgYSBzbmlwcGV0LlxuXHQgKi9cblx0SW5zZXJ0QXNTbmlwcGV0ID0gNFxufVxuXG5leHBvcnQgZW51bSBDb21wbGV0aW9uSXRlbUtpbmQge1xuXHRNZXRob2QgPSAwLFxuXHRGdW5jdGlvbiA9IDEsXG5cdENvbnN0cnVjdG9yID0gMixcblx0RmllbGQgPSAzLFxuXHRWYXJpYWJsZSA9IDQsXG5cdENsYXNzID0gNSxcblx0U3RydWN0ID0gNixcblx0SW50ZXJmYWNlID0gNyxcblx0TW9kdWxlID0gOCxcblx0UHJvcGVydHkgPSA5LFxuXHRFdmVudCA9IDEwLFxuXHRPcGVyYXRvciA9IDExLFxuXHRVbml0ID0gMTIsXG5cdFZhbHVlID0gMTMsXG5cdENvbnN0YW50ID0gMTQsXG5cdEVudW0gPSAxNSxcblx0RW51bU1lbWJlciA9IDE2LFxuXHRLZXl3b3JkID0gMTcsXG5cdFRleHQgPSAxOCxcblx0Q29sb3IgPSAxOSxcblx0RmlsZSA9IDIwLFxuXHRSZWZlcmVuY2UgPSAyMSxcblx0Q3VzdG9tY29sb3IgPSAyMixcblx0Rm9sZGVyID0gMjMsXG5cdFR5cGVQYXJhbWV0ZXIgPSAyNCxcblx0VXNlciA9IDI1LFxuXHRJc3N1ZSA9IDI2LFxuXHRUb29sID0gMjcsXG5cdFNuaXBwZXQgPSAyOFxufVxuXG5leHBvcnQgZW51bSBDb21wbGV0aW9uSXRlbVRhZyB7XG5cdERlcHJlY2F0ZWQgPSAxXG59XG5cbi8qKlxuICogSG93IGEgc3VnZ2VzdCBwcm92aWRlciB3YXMgdHJpZ2dlcmVkLlxuICovXG5leHBvcnQgZW51bSBDb21wbGV0aW9uVHJpZ2dlcktpbmQge1xuXHRJbnZva2UgPSAwLFxuXHRUcmlnZ2VyQ2hhcmFjdGVyID0gMSxcblx0VHJpZ2dlckZvckluY29tcGxldGVDb21wbGV0aW9ucyA9IDJcbn1cblxuLyoqXG4gKiBBIHBvc2l0aW9uaW5nIHByZWZlcmVuY2UgZm9yIHJlbmRlcmluZyBjb250ZW50IHdpZGdldHMuXG4gKi9cbmV4cG9ydCBlbnVtIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2Uge1xuXHQvKipcblx0ICogUGxhY2UgdGhlIGNvbnRlbnQgd2lkZ2V0IGV4YWN0bHkgYXQgYSBwb3NpdGlvblxuXHQgKi9cblx0RVhBQ1QgPSAwLFxuXHQvKipcblx0ICogUGxhY2UgdGhlIGNvbnRlbnQgd2lkZ2V0IGFib3ZlIGEgcG9zaXRpb25cblx0ICovXG5cdEFCT1ZFID0gMSxcblx0LyoqXG5cdCAqIFBsYWNlIHRoZSBjb250ZW50IHdpZGdldCBiZWxvdyBhIHBvc2l0aW9uXG5cdCAqL1xuXHRCRUxPVyA9IDJcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIHJlYXNvbiB0aGUgY3Vyc29yIGhhcyBjaGFuZ2VkIGl0cyBwb3NpdGlvbi5cbiAqL1xuZXhwb3J0IGVudW0gQ3Vyc29yQ2hhbmdlUmVhc29uIHtcblx0LyoqXG5cdCAqIFVua25vd24gb3Igbm90IHNldC5cblx0ICovXG5cdE5vdFNldCA9IDAsXG5cdC8qKlxuXHQgKiBBIGBtb2RlbC5zZXRWYWx1ZSgpYCB3YXMgY2FsbGVkLlxuXHQgKi9cblx0Q29udGVudEZsdXNoID0gMSxcblx0LyoqXG5cdCAqIFRoZSBgbW9kZWxgIGhhcyBiZWVuIGNoYW5nZWQgb3V0c2lkZSBvZiB0aGlzIGN1cnNvciBhbmQgdGhlIGN1cnNvciByZWNvdmVycyBpdHMgcG9zaXRpb24gZnJvbSBhc3NvY2lhdGVkIG1hcmtlcnMuXG5cdCAqL1xuXHRSZWNvdmVyRnJvbU1hcmtlcnMgPSAyLFxuXHQvKipcblx0ICogVGhlcmUgd2FzIGFuIGV4cGxpY2l0IHVzZXIgZ2VzdHVyZS5cblx0ICovXG5cdEV4cGxpY2l0ID0gMyxcblx0LyoqXG5cdCAqIFRoZXJlIHdhcyBhIFBhc3RlLlxuXHQgKi9cblx0UGFzdGUgPSA0LFxuXHQvKipcblx0ICogVGhlcmUgd2FzIGFuIFVuZG8uXG5cdCAqL1xuXHRVbmRvID0gNSxcblx0LyoqXG5cdCAqIFRoZXJlIHdhcyBhIFJlZG8uXG5cdCAqL1xuXHRSZWRvID0gNlxufVxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IGVuZCBvZiBsaW5lIHRvIHVzZSB3aGVuIGluc3RhbnRpYXRpbmcgbW9kZWxzLlxuICovXG5leHBvcnQgZW51bSBEZWZhdWx0RW5kT2ZMaW5lIHtcblx0LyoqXG5cdCAqIFVzZSBsaW5lIGZlZWQgKFxcbikgYXMgdGhlIGVuZCBvZiBsaW5lIGNoYXJhY3Rlci5cblx0ICovXG5cdExGID0gMSxcblx0LyoqXG5cdCAqIFVzZSBjYXJyaWFnZSByZXR1cm4gYW5kIGxpbmUgZmVlZCAoXFxyXFxuKSBhcyB0aGUgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlxuXHQgKi9cblx0Q1JMRiA9IDJcbn1cblxuLyoqXG4gKiBBIGRvY3VtZW50IGhpZ2hsaWdodCBraW5kLlxuICovXG5leHBvcnQgZW51bSBEb2N1bWVudEhpZ2hsaWdodEtpbmQge1xuXHQvKipcblx0ICogQSB0ZXh0dWFsIG9jY3VycmVuY2UuXG5cdCAqL1xuXHRUZXh0ID0gMCxcblx0LyoqXG5cdCAqIFJlYWQtYWNjZXNzIG9mIGEgc3ltYm9sLCBsaWtlIHJlYWRpbmcgYSB2YXJpYWJsZS5cblx0ICovXG5cdFJlYWQgPSAxLFxuXHQvKipcblx0ICogV3JpdGUtYWNjZXNzIG9mIGEgc3ltYm9sLCBsaWtlIHdyaXRpbmcgdG8gYSB2YXJpYWJsZS5cblx0ICovXG5cdFdyaXRlID0gMlxufVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgYXV0byBpbmRlbnRhdGlvbiBpbiB0aGUgZWRpdG9yXG4gKi9cbmV4cG9ydCBlbnVtIEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB7XG5cdE5vbmUgPSAwLFxuXHRLZWVwID0gMSxcblx0QnJhY2tldHMgPSAyLFxuXHRBZHZhbmNlZCA9IDMsXG5cdEZ1bGwgPSA0XG59XG5cbmV4cG9ydCBlbnVtIEVkaXRvck9wdGlvbiB7XG5cdGFjY2VwdFN1Z2dlc3Rpb25PbkNvbW1pdENoYXJhY3RlciA9IDAsXG5cdGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID0gMSxcblx0YWNjZXNzaWJpbGl0eVN1cHBvcnQgPSAyLFxuXHRhY2Nlc3NpYmlsaXR5UGFnZVNpemUgPSAzLFxuXHRhbGxvd092ZXJmbG93ID0gNCxcblx0YWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzID0gNSxcblx0YWxsb3dWYXJpYWJsZUZvbnRzID0gNixcblx0YWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZSA9IDcsXG5cdGFyaWFMYWJlbCA9IDgsXG5cdGFyaWFSZXF1aXJlZCA9IDksXG5cdGF1dG9DbG9zaW5nQnJhY2tldHMgPSAxMCxcblx0YXV0b0Nsb3NpbmdDb21tZW50cyA9IDExLFxuXHRzY3JlZW5SZWFkZXJBbm5vdW5jZUlubGluZVN1Z2dlc3Rpb24gPSAxMixcblx0YXV0b0Nsb3NpbmdEZWxldGUgPSAxMyxcblx0YXV0b0Nsb3NpbmdPdmVydHlwZSA9IDE0LFxuXHRhdXRvQ2xvc2luZ1F1b3RlcyA9IDE1LFxuXHRhdXRvSW5kZW50ID0gMTYsXG5cdGF1dG9JbmRlbnRPblBhc3RlID0gMTcsXG5cdGF1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nID0gMTgsXG5cdGF1dG9tYXRpY0xheW91dCA9IDE5LFxuXHRhdXRvU3Vycm91bmQgPSAyMCxcblx0YnJhY2tldFBhaXJDb2xvcml6YXRpb24gPSAyMSxcblx0Z3VpZGVzID0gMjIsXG5cdGNvZGVMZW5zID0gMjMsXG5cdGNvZGVMZW5zRm9udEZhbWlseSA9IDI0LFxuXHRjb2RlTGVuc0ZvbnRTaXplID0gMjUsXG5cdGNvbG9yRGVjb3JhdG9ycyA9IDI2LFxuXHRjb2xvckRlY29yYXRvcnNMaW1pdCA9IDI3LFxuXHRjb2x1bW5TZWxlY3Rpb24gPSAyOCxcblx0Y29tbWVudHMgPSAyOSxcblx0Y29udGV4dG1lbnUgPSAzMCxcblx0Y29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcgPSAzMSxcblx0Y3Vyc29yQmxpbmtpbmcgPSAzMixcblx0Y3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24gPSAzMyxcblx0Y3Vyc29yU3R5bGUgPSAzNCxcblx0Y3Vyc29yU3Vycm91bmRpbmdMaW5lcyA9IDM1LFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUgPSAzNixcblx0Y3Vyc29yV2lkdGggPSAzNyxcblx0Y3Vyc29ySGVpZ2h0ID0gMzgsXG5cdGRpc2FibGVMYXllckhpbnRpbmcgPSAzOSxcblx0ZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgPSA0MCxcblx0ZG9tUmVhZE9ubHkgPSA0MSxcblx0ZHJhZ0FuZERyb3AgPSA0Mixcblx0ZHJvcEludG9FZGl0b3IgPSA0Myxcblx0ZWRpdENvbnRleHQgPSA0NCxcblx0ZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQgPSA0NSxcblx0ZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uID0gNDYsXG5cdGV4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcgPSA0Nyxcblx0ZXh0cmFFZGl0b3JDbGFzc05hbWUgPSA0OCxcblx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5ID0gNDksXG5cdGZpbmQgPSA1MCxcblx0Zml4ZWRPdmVyZmxvd1dpZGdldHMgPSA1MSxcblx0Zm9sZGluZyA9IDUyLFxuXHRmb2xkaW5nU3RyYXRlZ3kgPSA1Myxcblx0Zm9sZGluZ0hpZ2hsaWdodCA9IDU0LFxuXHRmb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCA9IDU1LFxuXHRmb2xkaW5nTWF4aW11bVJlZ2lvbnMgPSA1Nixcblx0dW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lID0gNTcsXG5cdGZvbnRGYW1pbHkgPSA1OCxcblx0Zm9udEluZm8gPSA1OSxcblx0Zm9udExpZ2F0dXJlcyA9IDYwLFxuXHRmb250U2l6ZSA9IDYxLFxuXHRmb250V2VpZ2h0ID0gNjIsXG5cdGZvbnRWYXJpYXRpb25zID0gNjMsXG5cdGZvcm1hdE9uUGFzdGUgPSA2NCxcblx0Zm9ybWF0T25UeXBlID0gNjUsXG5cdGdseXBoTWFyZ2luID0gNjYsXG5cdGdvdG9Mb2NhdGlvbiA9IDY3LFxuXHRoaWRlQ3Vyc29ySW5PdmVydmlld1J1bGVyID0gNjgsXG5cdGhvdmVyID0gNjksXG5cdGluRGlmZkVkaXRvciA9IDcwLFxuXHRpbmxpbmVTdWdnZXN0ID0gNzEsXG5cdGxldHRlclNwYWNpbmcgPSA3Mixcblx0bGlnaHRidWxiID0gNzMsXG5cdGxpbmVEZWNvcmF0aW9uc1dpZHRoID0gNzQsXG5cdGxpbmVIZWlnaHQgPSA3NSxcblx0bGluZU51bWJlcnMgPSA3Nixcblx0bGluZU51bWJlcnNNaW5DaGFycyA9IDc3LFxuXHRsaW5rZWRFZGl0aW5nID0gNzgsXG5cdGxpbmtzID0gNzksXG5cdG1hdGNoQnJhY2tldHMgPSA4MCxcblx0bWluaW1hcCA9IDgxLFxuXHRtb3VzZVN0eWxlID0gODIsXG5cdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IDgzLFxuXHRtb3VzZVdoZWVsWm9vbSA9IDg0LFxuXHRtdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmcgPSA4NSxcblx0bXVsdGlDdXJzb3JNb2RpZmllciA9IDg2LFxuXHRtb3VzZU1pZGRsZUNsaWNrQWN0aW9uID0gODcsXG5cdG11bHRpQ3Vyc29yUGFzdGUgPSA4OCxcblx0bXVsdGlDdXJzb3JMaW1pdCA9IDg5LFxuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodCA9IDkwLFxuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5ID0gOTEsXG5cdG92ZXJ0eXBlQ3Vyc29yU3R5bGUgPSA5Mixcblx0b3ZlcnR5cGVPblBhc3RlID0gOTMsXG5cdG92ZXJ2aWV3UnVsZXJCb3JkZXIgPSA5NCxcblx0b3ZlcnZpZXdSdWxlckxhbmVzID0gOTUsXG5cdHBhZGRpbmcgPSA5Nixcblx0cGFzdGVBcyA9IDk3LFxuXHRwYXJhbWV0ZXJIaW50cyA9IDk4LFxuXHRwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzID0gOTksXG5cdHBsYWNlaG9sZGVyID0gMTAwLFxuXHRkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrID0gMTAxLFxuXHRxdWlja1N1Z2dlc3Rpb25zID0gMTAyLFxuXHRxdWlja1N1Z2dlc3Rpb25zRGVsYXkgPSAxMDMsXG5cdHJlYWRPbmx5ID0gMTA0LFxuXHRyZWFkT25seU1lc3NhZ2UgPSAxMDUsXG5cdHJlbmFtZU9uVHlwZSA9IDEwNixcblx0cmVuZGVyUmljaFNjcmVlblJlYWRlckNvbnRlbnQgPSAxMDcsXG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID0gMTA4LFxuXHRyZW5kZXJGaW5hbE5ld2xpbmUgPSAxMDksXG5cdHJlbmRlckxpbmVIaWdobGlnaHQgPSAxMTAsXG5cdHJlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzID0gMTExLFxuXHRyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgPSAxMTIsXG5cdHJlbmRlcldoaXRlc3BhY2UgPSAxMTMsXG5cdHJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcgPSAxMTQsXG5cdHJvdW5kZWRTZWxlY3Rpb24gPSAxMTUsXG5cdHJ1bGVycyA9IDExNixcblx0c2Nyb2xsYmFyID0gMTE3LFxuXHRzY3JvbGxCZXlvbmRMYXN0Q29sdW1uID0gMTE4LFxuXHRzY3JvbGxCZXlvbmRMYXN0TGluZSA9IDExOSxcblx0c2Nyb2xsUHJlZG9taW5hbnRBeGlzID0gMTIwLFxuXHRzZWxlY3Rpb25DbGlwYm9hcmQgPSAxMjEsXG5cdHNlbGVjdGlvbkhpZ2hsaWdodCA9IDEyMixcblx0c2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoID0gMTIzLFxuXHRzZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmUgPSAxMjQsXG5cdHNlbGVjdE9uTGluZU51bWJlcnMgPSAxMjUsXG5cdHNob3dGb2xkaW5nQ29udHJvbHMgPSAxMjYsXG5cdHNob3dVbnVzZWQgPSAxMjcsXG5cdHNuaXBwZXRTdWdnZXN0aW9ucyA9IDEyOCxcblx0c21hcnRTZWxlY3QgPSAxMjksXG5cdHNtb290aFNjcm9sbGluZyA9IDEzMCxcblx0c3RpY2t5U2Nyb2xsID0gMTMxLFxuXHRzdGlja3lUYWJTdG9wcyA9IDEzMixcblx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9IDEzMyxcblx0c3VnZ2VzdCA9IDEzNCxcblx0c3VnZ2VzdEZvbnRTaXplID0gMTM1LFxuXHRzdWdnZXN0TGluZUhlaWdodCA9IDEzNixcblx0c3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnMgPSAxMzcsXG5cdHN1Z2dlc3RTZWxlY3Rpb24gPSAxMzgsXG5cdHRhYkNvbXBsZXRpb24gPSAxMzksXG5cdHRhYkluZGV4ID0gMTQwLFxuXHR0cmltV2hpdGVzcGFjZU9uRGVsZXRlID0gMTQxLFxuXHR1bmljb2RlSGlnaGxpZ2h0aW5nID0gMTQyLFxuXHR1bnVzdWFsTGluZVRlcm1pbmF0b3JzID0gMTQzLFxuXHR1c2VTaGFkb3dET00gPSAxNDQsXG5cdHVzZVRhYlN0b3BzID0gMTQ1LFxuXHR3b3JkQnJlYWsgPSAxNDYsXG5cdHdvcmRTZWdtZW50ZXJMb2NhbGVzID0gMTQ3LFxuXHR3b3JkU2VwYXJhdG9ycyA9IDE0OCxcblx0d29yZFdyYXAgPSAxNDksXG5cdHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMgPSAxNTAsXG5cdHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzID0gMTUxLFxuXHR3b3JkV3JhcENvbHVtbiA9IDE1Mixcblx0d29yZFdyYXBPdmVycmlkZTEgPSAxNTMsXG5cdHdvcmRXcmFwT3ZlcnJpZGUyID0gMTU0LFxuXHR3cmFwcGluZ0luZGVudCA9IDE1NSxcblx0d3JhcHBpbmdTdHJhdGVneSA9IDE1Nixcblx0c2hvd0RlcHJlY2F0ZWQgPSAxNTcsXG5cdGluZXJ0aWFsU2Nyb2xsID0gMTU4LFxuXHRpbmxheUhpbnRzID0gMTU5LFxuXHR3cmFwT25Fc2NhcGVkTGluZUZlZWRzID0gMTYwLFxuXHRlZmZlY3RpdmVDdXJzb3JTdHlsZSA9IDE2MSxcblx0ZWRpdG9yQ2xhc3NOYW1lID0gMTYyLFxuXHRwaXhlbFJhdGlvID0gMTYzLFxuXHR0YWJGb2N1c01vZGUgPSAxNjQsXG5cdGxheW91dEluZm8gPSAxNjUsXG5cdHdyYXBwaW5nSW5mbyA9IDE2Nixcblx0ZGVmYXVsdENvbG9yRGVjb3JhdG9ycyA9IDE2Nyxcblx0Y29sb3JEZWNvcmF0b3JzQWN0aXZhdGVkT24gPSAxNjgsXG5cdGlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UgPSAxNjksXG5cdGVmZmVjdGl2ZUVkaXRDb250ZXh0ID0gMTcwLFxuXHRzY3JvbGxPbk1pZGRsZUNsaWNrID0gMTcxLFxuXHRlZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMgPSAxNzIsXG5cdGRvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrID0gMTczXG59XG5cbi8qKlxuICogRW5kIG9mIGxpbmUgY2hhcmFjdGVyIHByZWZlcmVuY2UuXG4gKi9cbmV4cG9ydCBlbnVtIEVuZE9mTGluZVByZWZlcmVuY2Uge1xuXHQvKipcblx0ICogVXNlIHRoZSBlbmQgb2YgbGluZSBjaGFyYWN0ZXIgaWRlbnRpZmllZCBpbiB0aGUgdGV4dCBidWZmZXIuXG5cdCAqL1xuXHRUZXh0RGVmaW5lZCA9IDAsXG5cdC8qKlxuXHQgKiBVc2UgbGluZSBmZWVkIChcXG4pIGFzIHRoZSBlbmQgb2YgbGluZSBjaGFyYWN0ZXIuXG5cdCAqL1xuXHRMRiA9IDEsXG5cdC8qKlxuXHQgKiBVc2UgY2FycmlhZ2UgcmV0dXJuIGFuZCBsaW5lIGZlZWQgKFxcclxcbikgYXMgdGhlIGVuZCBvZiBsaW5lIGNoYXJhY3Rlci5cblx0ICovXG5cdENSTEYgPSAyXG59XG5cbi8qKlxuICogRW5kIG9mIGxpbmUgY2hhcmFjdGVyIHByZWZlcmVuY2UuXG4gKi9cbmV4cG9ydCBlbnVtIEVuZE9mTGluZVNlcXVlbmNlIHtcblx0LyoqXG5cdCAqIFVzZSBsaW5lIGZlZWQgKFxcbikgYXMgdGhlIGVuZCBvZiBsaW5lIGNoYXJhY3Rlci5cblx0ICovXG5cdExGID0gMCxcblx0LyoqXG5cdCAqIFVzZSBjYXJyaWFnZSByZXR1cm4gYW5kIGxpbmUgZmVlZCAoXFxyXFxuKSBhcyB0aGUgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlxuXHQgKi9cblx0Q1JMRiA9IDFcbn1cblxuLyoqXG4gKiBWZXJ0aWNhbCBMYW5lIGluIHRoZSBnbHlwaCBtYXJnaW4gb2YgdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGVudW0gR2x5cGhNYXJnaW5MYW5lIHtcblx0TGVmdCA9IDEsXG5cdENlbnRlciA9IDIsXG5cdFJpZ2h0ID0gM1xufVxuXG5leHBvcnQgZW51bSBIb3ZlclZlcmJvc2l0eUFjdGlvbiB7XG5cdC8qKlxuXHQgKiBJbmNyZWFzZSB0aGUgdmVyYm9zaXR5IG9mIHRoZSBob3ZlclxuXHQgKi9cblx0SW5jcmVhc2UgPSAwLFxuXHQvKipcblx0ICogRGVjcmVhc2UgdGhlIHZlcmJvc2l0eSBvZiB0aGUgaG92ZXJcblx0ICovXG5cdERlY3JlYXNlID0gMVxufVxuXG4vKipcbiAqIERlc2NyaWJlcyB3aGF0IHRvIGRvIHdpdGggdGhlIGluZGVudGF0aW9uIHdoZW4gcHJlc3NpbmcgRW50ZXIuXG4gKi9cbmV4cG9ydCBlbnVtIEluZGVudEFjdGlvbiB7XG5cdC8qKlxuXHQgKiBJbnNlcnQgbmV3IGxpbmUgYW5kIGNvcHkgdGhlIHByZXZpb3VzIGxpbmUncyBpbmRlbnRhdGlvbi5cblx0ICovXG5cdE5vbmUgPSAwLFxuXHQvKipcblx0ICogSW5zZXJ0IG5ldyBsaW5lIGFuZCBpbmRlbnQgb25jZSAocmVsYXRpdmUgdG8gdGhlIHByZXZpb3VzIGxpbmUncyBpbmRlbnRhdGlvbikuXG5cdCAqL1xuXHRJbmRlbnQgPSAxLFxuXHQvKipcblx0ICogSW5zZXJ0IHR3byBuZXcgbGluZXM6XG5cdCAqICAtIHRoZSBmaXJzdCBvbmUgaW5kZW50ZWQgd2hpY2ggd2lsbCBob2xkIHRoZSBjdXJzb3Jcblx0ICogIC0gdGhlIHNlY29uZCBvbmUgYXQgdGhlIHNhbWUgaW5kZW50YXRpb24gbGV2ZWxcblx0ICovXG5cdEluZGVudE91dGRlbnQgPSAyLFxuXHQvKipcblx0ICogSW5zZXJ0IG5ldyBsaW5lIGFuZCBvdXRkZW50IG9uY2UgKHJlbGF0aXZlIHRvIHRoZSBwcmV2aW91cyBsaW5lJ3MgaW5kZW50YXRpb24pLlxuXHQgKi9cblx0T3V0ZGVudCA9IDNcbn1cblxuZXhwb3J0IGVudW0gSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMge1xuXHRCb3RoID0gMCxcblx0UmlnaHQgPSAxLFxuXHRMZWZ0ID0gMixcblx0Tm9uZSA9IDNcbn1cblxuZXhwb3J0IGVudW0gSW5sYXlIaW50S2luZCB7XG5cdFR5cGUgPSAxLFxuXHRQYXJhbWV0ZXIgPSAyXG59XG5cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kIHtcblx0QWNjZXB0ZWQgPSAwLFxuXHRSZWplY3RlZCA9IDEsXG5cdElnbm9yZWQgPSAyXG59XG5cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25IaW50U3R5bGUge1xuXHRDb2RlID0gMSxcblx0TGFiZWwgPSAyXG59XG5cbi8qKlxuICogSG93IGFuIHtAbGluayBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIGlubGluZSBjb21wbGV0aW9uIHByb3ZpZGVyfSB3YXMgdHJpZ2dlcmVkLlxuICovXG5leHBvcnQgZW51bSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQge1xuXHQvKipcblx0ICogQ29tcGxldGlvbiB3YXMgdHJpZ2dlcmVkIGF1dG9tYXRpY2FsbHkgd2hpbGUgZWRpdGluZy5cblx0ICogSXQgaXMgc3VmZmljaWVudCB0byByZXR1cm4gYSBzaW5nbGUgY29tcGxldGlvbiBpdGVtIGluIHRoaXMgY2FzZS5cblx0ICovXG5cdEF1dG9tYXRpYyA9IDAsXG5cdC8qKlxuXHQgKiBDb21wbGV0aW9uIHdhcyB0cmlnZ2VyZWQgZXhwbGljaXRseSBieSBhIHVzZXIgZ2VzdHVyZS5cblx0ICogUmV0dXJuIG11bHRpcGxlIGNvbXBsZXRpb24gaXRlbXMgdG8gZW5hYmxlIGN5Y2xpbmcgdGhyb3VnaCB0aGVtLlxuXHQgKi9cblx0RXhwbGljaXQgPSAxXG59XG4vKipcbiAqIFZpcnR1YWwgS2V5IENvZGVzLCB0aGUgdmFsdWUgZG9lcyBub3QgaG9sZCBhbnkgaW5oZXJlbnQgbWVhbmluZy5cbiAqIEluc3BpcmVkIHNvbWV3aGF0IGZyb20gaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvZGQzNzU3MzEodj12cy44NSkuYXNweFxuICogQnV0IHRoZXNlIGFyZSBcIm1vcmUgZ2VuZXJhbFwiLCBhcyB0aGV5IHNob3VsZCB3b3JrIGFjcm9zcyBicm93c2VycyAmIE9TYHMuXG4gKi9cbmV4cG9ydCBlbnVtIEtleUNvZGUge1xuXHREZXBlbmRzT25LYkxheW91dCA9IC0xLFxuXHQvKipcblx0ICogUGxhY2VkIGZpcnN0IHRvIGNvdmVyIHRoZSAwIHZhbHVlIG9mIHRoZSBlbnVtLlxuXHQgKi9cblx0VW5rbm93biA9IDAsXG5cdEJhY2tzcGFjZSA9IDEsXG5cdFRhYiA9IDIsXG5cdEVudGVyID0gMyxcblx0U2hpZnQgPSA0LFxuXHRDdHJsID0gNSxcblx0QWx0ID0gNixcblx0UGF1c2VCcmVhayA9IDcsXG5cdENhcHNMb2NrID0gOCxcblx0RXNjYXBlID0gOSxcblx0U3BhY2UgPSAxMCxcblx0UGFnZVVwID0gMTEsXG5cdFBhZ2VEb3duID0gMTIsXG5cdEVuZCA9IDEzLFxuXHRIb21lID0gMTQsXG5cdExlZnRBcnJvdyA9IDE1LFxuXHRVcEFycm93ID0gMTYsXG5cdFJpZ2h0QXJyb3cgPSAxNyxcblx0RG93bkFycm93ID0gMTgsXG5cdEluc2VydCA9IDE5LFxuXHREZWxldGUgPSAyMCxcblx0RGlnaXQwID0gMjEsXG5cdERpZ2l0MSA9IDIyLFxuXHREaWdpdDIgPSAyMyxcblx0RGlnaXQzID0gMjQsXG5cdERpZ2l0NCA9IDI1LFxuXHREaWdpdDUgPSAyNixcblx0RGlnaXQ2ID0gMjcsXG5cdERpZ2l0NyA9IDI4LFxuXHREaWdpdDggPSAyOSxcblx0RGlnaXQ5ID0gMzAsXG5cdEtleUEgPSAzMSxcblx0S2V5QiA9IDMyLFxuXHRLZXlDID0gMzMsXG5cdEtleUQgPSAzNCxcblx0S2V5RSA9IDM1LFxuXHRLZXlGID0gMzYsXG5cdEtleUcgPSAzNyxcblx0S2V5SCA9IDM4LFxuXHRLZXlJID0gMzksXG5cdEtleUogPSA0MCxcblx0S2V5SyA9IDQxLFxuXHRLZXlMID0gNDIsXG5cdEtleU0gPSA0Myxcblx0S2V5TiA9IDQ0LFxuXHRLZXlPID0gNDUsXG5cdEtleVAgPSA0Nixcblx0S2V5USA9IDQ3LFxuXHRLZXlSID0gNDgsXG5cdEtleVMgPSA0OSxcblx0S2V5VCA9IDUwLFxuXHRLZXlVID0gNTEsXG5cdEtleVYgPSA1Mixcblx0S2V5VyA9IDUzLFxuXHRLZXlYID0gNTQsXG5cdEtleVkgPSA1NSxcblx0S2V5WiA9IDU2LFxuXHRNZXRhID0gNTcsXG5cdENvbnRleHRNZW51ID0gNTgsXG5cdEYxID0gNTksXG5cdEYyID0gNjAsXG5cdEYzID0gNjEsXG5cdEY0ID0gNjIsXG5cdEY1ID0gNjMsXG5cdEY2ID0gNjQsXG5cdEY3ID0gNjUsXG5cdEY4ID0gNjYsXG5cdEY5ID0gNjcsXG5cdEYxMCA9IDY4LFxuXHRGMTEgPSA2OSxcblx0RjEyID0gNzAsXG5cdEYxMyA9IDcxLFxuXHRGMTQgPSA3Mixcblx0RjE1ID0gNzMsXG5cdEYxNiA9IDc0LFxuXHRGMTcgPSA3NSxcblx0RjE4ID0gNzYsXG5cdEYxOSA9IDc3LFxuXHRGMjAgPSA3OCxcblx0RjIxID0gNzksXG5cdEYyMiA9IDgwLFxuXHRGMjMgPSA4MSxcblx0RjI0ID0gODIsXG5cdE51bUxvY2sgPSA4Myxcblx0U2Nyb2xsTG9jayA9IDg0LFxuXHQvKipcblx0ICogVXNlZCBmb3IgbWlzY2VsbGFuZW91cyBjaGFyYWN0ZXJzOyBpdCBjYW4gdmFyeSBieSBrZXlib2FyZC5cblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICc7Oicga2V5XG5cdCAqL1xuXHRTZW1pY29sb24gPSA4NSxcblx0LyoqXG5cdCAqIEZvciBhbnkgY291bnRyeS9yZWdpb24sIHRoZSAnKycga2V5XG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnPSsnIGtleVxuXHQgKi9cblx0RXF1YWwgPSA4Nixcblx0LyoqXG5cdCAqIEZvciBhbnkgY291bnRyeS9yZWdpb24sIHRoZSAnLCcga2V5XG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnLDwnIGtleVxuXHQgKi9cblx0Q29tbWEgPSA4Nyxcblx0LyoqXG5cdCAqIEZvciBhbnkgY291bnRyeS9yZWdpb24sIHRoZSAnLScga2V5XG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnLV8nIGtleVxuXHQgKi9cblx0TWludXMgPSA4OCxcblx0LyoqXG5cdCAqIEZvciBhbnkgY291bnRyeS9yZWdpb24sIHRoZSAnLicga2V5XG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnLj4nIGtleVxuXHQgKi9cblx0UGVyaW9kID0gODksXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJy8/JyBrZXlcblx0ICovXG5cdFNsYXNoID0gOTAsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJ2B+JyBrZXlcblx0ICovXG5cdEJhY2txdW90ZSA9IDkxLFxuXHQvKipcblx0ICogVXNlZCBmb3IgbWlzY2VsbGFuZW91cyBjaGFyYWN0ZXJzOyBpdCBjYW4gdmFyeSBieSBrZXlib2FyZC5cblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICdbeycga2V5XG5cdCAqL1xuXHRCcmFja2V0TGVmdCA9IDkyLFxuXHQvKipcblx0ICogVXNlZCBmb3IgbWlzY2VsbGFuZW91cyBjaGFyYWN0ZXJzOyBpdCBjYW4gdmFyeSBieSBrZXlib2FyZC5cblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICdcXHwnIGtleVxuXHQgKi9cblx0QmFja3NsYXNoID0gOTMsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJ119JyBrZXlcblx0ICovXG5cdEJyYWNrZXRSaWdodCA9IDk0LFxuXHQvKipcblx0ICogVXNlZCBmb3IgbWlzY2VsbGFuZW91cyBjaGFyYWN0ZXJzOyBpdCBjYW4gdmFyeSBieSBrZXlib2FyZC5cblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICcnXCInIGtleVxuXHQgKi9cblx0UXVvdGUgPSA5NSxcblx0LyoqXG5cdCAqIFVzZWQgZm9yIG1pc2NlbGxhbmVvdXMgY2hhcmFjdGVyczsgaXQgY2FuIHZhcnkgYnkga2V5Ym9hcmQuXG5cdCAqL1xuXHRPRU1fOCA9IDk2LFxuXHQvKipcblx0ICogRWl0aGVyIHRoZSBhbmdsZSBicmFja2V0IGtleSBvciB0aGUgYmFja3NsYXNoIGtleSBvbiB0aGUgUlQgMTAyLWtleSBrZXlib2FyZC5cblx0ICovXG5cdEludGxCYWNrc2xhc2ggPSA5Nyxcblx0TnVtcGFkMCA9IDk4LC8vIFZLX05VTVBBRDAsIDB4NjAsIE51bWVyaWMga2V5cGFkIDAga2V5XG5cdE51bXBhZDEgPSA5OSwvLyBWS19OVU1QQUQxLCAweDYxLCBOdW1lcmljIGtleXBhZCAxIGtleVxuXHROdW1wYWQyID0gMTAwLC8vIFZLX05VTVBBRDIsIDB4NjIsIE51bWVyaWMga2V5cGFkIDIga2V5XG5cdE51bXBhZDMgPSAxMDEsLy8gVktfTlVNUEFEMywgMHg2MywgTnVtZXJpYyBrZXlwYWQgMyBrZXlcblx0TnVtcGFkNCA9IDEwMiwvLyBWS19OVU1QQUQ0LCAweDY0LCBOdW1lcmljIGtleXBhZCA0IGtleVxuXHROdW1wYWQ1ID0gMTAzLC8vIFZLX05VTVBBRDUsIDB4NjUsIE51bWVyaWMga2V5cGFkIDUga2V5XG5cdE51bXBhZDYgPSAxMDQsLy8gVktfTlVNUEFENiwgMHg2NiwgTnVtZXJpYyBrZXlwYWQgNiBrZXlcblx0TnVtcGFkNyA9IDEwNSwvLyBWS19OVU1QQUQ3LCAweDY3LCBOdW1lcmljIGtleXBhZCA3IGtleVxuXHROdW1wYWQ4ID0gMTA2LC8vIFZLX05VTVBBRDgsIDB4NjgsIE51bWVyaWMga2V5cGFkIDgga2V5XG5cdE51bXBhZDkgPSAxMDcsLy8gVktfTlVNUEFEOSwgMHg2OSwgTnVtZXJpYyBrZXlwYWQgOSBrZXlcblx0TnVtcGFkTXVsdGlwbHkgPSAxMDgsLy8gVktfTVVMVElQTFksIDB4NkEsIE11bHRpcGx5IGtleVxuXHROdW1wYWRBZGQgPSAxMDksLy8gVktfQURELCAweDZCLCBBZGQga2V5XG5cdE5VTVBBRF9TRVBBUkFUT1IgPSAxMTAsLy8gVktfU0VQQVJBVE9SLCAweDZDLCBTZXBhcmF0b3Iga2V5XG5cdE51bXBhZFN1YnRyYWN0ID0gMTExLC8vIFZLX1NVQlRSQUNULCAweDZELCBTdWJ0cmFjdCBrZXlcblx0TnVtcGFkRGVjaW1hbCA9IDExMiwvLyBWS19ERUNJTUFMLCAweDZFLCBEZWNpbWFsIGtleVxuXHROdW1wYWREaXZpZGUgPSAxMTMsLy8gVktfRElWSURFLCAweDZGLFxuXHQvKipcblx0ICogQ292ZXIgYWxsIGtleSBjb2RlcyB3aGVuIElNRSBpcyBwcm9jZXNzaW5nIGlucHV0LlxuXHQgKi9cblx0S0VZX0lOX0NPTVBPU0lUSU9OID0gMTE0LFxuXHRBQk5UX0MxID0gMTE1LC8vIEJyYXppbGlhbiAoQUJOVCkgS2V5Ym9hcmRcblx0QUJOVF9DMiA9IDExNiwvLyBCcmF6aWxpYW4gKEFCTlQpIEtleWJvYXJkXG5cdEF1ZGlvVm9sdW1lTXV0ZSA9IDExNyxcblx0QXVkaW9Wb2x1bWVVcCA9IDExOCxcblx0QXVkaW9Wb2x1bWVEb3duID0gMTE5LFxuXHRCcm93c2VyU2VhcmNoID0gMTIwLFxuXHRCcm93c2VySG9tZSA9IDEyMSxcblx0QnJvd3NlckJhY2sgPSAxMjIsXG5cdEJyb3dzZXJGb3J3YXJkID0gMTIzLFxuXHRNZWRpYVRyYWNrTmV4dCA9IDEyNCxcblx0TWVkaWFUcmFja1ByZXZpb3VzID0gMTI1LFxuXHRNZWRpYVN0b3AgPSAxMjYsXG5cdE1lZGlhUGxheVBhdXNlID0gMTI3LFxuXHRMYXVuY2hNZWRpYVBsYXllciA9IDEyOCxcblx0TGF1bmNoTWFpbCA9IDEyOSxcblx0TGF1bmNoQXBwMiA9IDEzMCxcblx0LyoqXG5cdCAqIFZLX0NMRUFSLCAweDBDLCBDTEVBUiBrZXlcblx0ICovXG5cdENsZWFyID0gMTMxLFxuXHQvKipcblx0ICogUGxhY2VkIGxhc3QgdG8gY292ZXIgdGhlIGxlbmd0aCBvZiB0aGUgZW51bS5cblx0ICogUGxlYXNlIGRvIG5vdCBkZXBlbmQgb24gdGhpcyB2YWx1ZSFcblx0ICovXG5cdE1BWF9WQUxVRSA9IDEzMlxufVxuXG5leHBvcnQgZW51bSBNYXJrZXJTZXZlcml0eSB7XG5cdEhpbnQgPSAxLFxuXHRJbmZvID0gMixcblx0V2FybmluZyA9IDQsXG5cdEVycm9yID0gOFxufVxuXG5leHBvcnQgZW51bSBNYXJrZXJUYWcge1xuXHRVbm5lY2Vzc2FyeSA9IDEsXG5cdERlcHJlY2F0ZWQgPSAyXG59XG5cbi8qKlxuICogUG9zaXRpb24gaW4gdGhlIG1pbmltYXAgdG8gcmVuZGVyIHRoZSBkZWNvcmF0aW9uLlxuICovXG5leHBvcnQgZW51bSBNaW5pbWFwUG9zaXRpb24ge1xuXHRJbmxpbmUgPSAxLFxuXHRHdXR0ZXIgPSAyXG59XG5cbi8qKlxuICogU2VjdGlvbiBoZWFkZXIgc3R5bGUuXG4gKi9cbmV4cG9ydCBlbnVtIE1pbmltYXBTZWN0aW9uSGVhZGVyU3R5bGUge1xuXHROb3JtYWwgPSAxLFxuXHRVbmRlcmxpbmVkID0gMlxufVxuXG4vKipcbiAqIFR5cGUgb2YgaGl0IGVsZW1lbnQgd2l0aCB0aGUgbW91c2UgaW4gdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGVudW0gTW91c2VUYXJnZXRUeXBlIHtcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiBhbiB1bmtub3duIGVsZW1lbnQuXG5cdCAqL1xuXHRVTktOT1dOID0gMCxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgdGV4dGFyZWEgdXNlZCBmb3IgaW5wdXQuXG5cdCAqL1xuXHRURVhUQVJFQSA9IDEsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgdGhlIGdseXBoIG1hcmdpblxuXHQgKi9cblx0R1VUVEVSX0dMWVBIX01BUkdJTiA9IDIsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgdGhlIGxpbmUgbnVtYmVyc1xuXHQgKi9cblx0R1VUVEVSX0xJTkVfTlVNQkVSUyA9IDMsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgdGhlIGxpbmUgZGVjb3JhdGlvbnNcblx0ICovXG5cdEdVVFRFUl9MSU5FX0RFQ09SQVRJT05TID0gNCxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgd2hpdGVzcGFjZSBsZWZ0IGluIHRoZSBndXR0ZXIgYnkgYSB2aWV3IHpvbmUuXG5cdCAqL1xuXHRHVVRURVJfVklFV19aT05FID0gNSxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0ZXh0IGluIHRoZSBjb250ZW50LlxuXHQgKi9cblx0Q09OVEVOVF9URVhUID0gNixcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiBlbXB0eSBzcGFjZSBpbiB0aGUgY29udGVudCAoZS5nLiBhZnRlciBsaW5lIHRleHQgb3IgYmVsb3cgbGFzdCBsaW5lKVxuXHQgKi9cblx0Q09OVEVOVF9FTVBUWSA9IDcsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgYSB2aWV3IHpvbmUgaW4gdGhlIGNvbnRlbnQuXG5cdCAqL1xuXHRDT05URU5UX1ZJRVdfWk9ORSA9IDgsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgYSBjb250ZW50IHdpZGdldC5cblx0ICovXG5cdENPTlRFTlRfV0lER0VUID0gOSxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgZGVjb3JhdGlvbnMgb3ZlcnZpZXcgcnVsZXIuXG5cdCAqL1xuXHRPVkVSVklFV19SVUxFUiA9IDEwLFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIGEgc2Nyb2xsYmFyLlxuXHQgKi9cblx0U0NST0xMQkFSID0gMTEsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgYW4gb3ZlcmxheSB3aWRnZXQuXG5cdCAqL1xuXHRPVkVSTEFZX1dJREdFVCA9IDEyLFxuXHQvKipcblx0ICogTW91c2UgaXMgb3V0c2lkZSBvZiB0aGUgZWRpdG9yLlxuXHQgKi9cblx0T1VUU0lERV9FRElUT1IgPSAxM1xufVxuXG5leHBvcnQgZW51bSBOZXdTeW1ib2xOYW1lVGFnIHtcblx0QUlHZW5lcmF0ZWQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDAsXG5cdEF1dG9tYXRpYyA9IDFcbn1cblxuLyoqXG4gKiBBIHBvc2l0aW9uaW5nIHByZWZlcmVuY2UgZm9yIHJlbmRlcmluZyBvdmVybGF5IHdpZGdldHMuXG4gKi9cbmV4cG9ydCBlbnVtIE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2Uge1xuXHQvKipcblx0ICogUG9zaXRpb24gdGhlIG92ZXJsYXkgd2lkZ2V0IGluIHRoZSB0b3AgcmlnaHQgY29ybmVyXG5cdCAqL1xuXHRUT1BfUklHSFRfQ09STkVSID0gMCxcblx0LyoqXG5cdCAqIFBvc2l0aW9uIHRoZSBvdmVybGF5IHdpZGdldCBpbiB0aGUgYm90dG9tIHJpZ2h0IGNvcm5lclxuXHQgKi9cblx0Qk9UVE9NX1JJR0hUX0NPUk5FUiA9IDEsXG5cdC8qKlxuXHQgKiBQb3NpdGlvbiB0aGUgb3ZlcmxheSB3aWRnZXQgaW4gdGhlIHRvcCBjZW50ZXJcblx0ICovXG5cdFRPUF9DRU5URVIgPSAyXG59XG5cbi8qKlxuICogVmVydGljYWwgTGFuZSBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIgb2YgdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGVudW0gT3ZlcnZpZXdSdWxlckxhbmUge1xuXHRMZWZ0ID0gMSxcblx0Q2VudGVyID0gMixcblx0UmlnaHQgPSA0LFxuXHRGdWxsID0gN1xufVxuXG4vKipcbiAqIEhvdyBhIHBhcnRpYWwgYWNjZXB0YW5jZSB3YXMgdHJpZ2dlcmVkLlxuICovXG5leHBvcnQgZW51bSBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQge1xuXHRXb3JkID0gMCxcblx0TGluZSA9IDEsXG5cdFN1Z2dlc3QgPSAyXG59XG5cbmV4cG9ydCBlbnVtIFBvc2l0aW9uQWZmaW5pdHkge1xuXHQvKipcblx0ICogUHJlZmVycyB0aGUgbGVmdCBtb3N0IHBvc2l0aW9uLlxuXHQqL1xuXHRMZWZ0ID0gMCxcblx0LyoqXG5cdCAqIFByZWZlcnMgdGhlIHJpZ2h0IG1vc3QgcG9zaXRpb24uXG5cdCovXG5cdFJpZ2h0ID0gMSxcblx0LyoqXG5cdCAqIE5vIHByZWZlcmVuY2UuXG5cdCovXG5cdE5vbmUgPSAyLFxuXHQvKipcblx0ICogSWYgdGhlIGdpdmVuIHBvc2l0aW9uIGlzIG9uIGluamVjdGVkIHRleHQsIHByZWZlcnMgdGhlIHBvc2l0aW9uIGxlZnQgb2YgaXQuXG5cdCovXG5cdExlZnRPZkluamVjdGVkVGV4dCA9IDMsXG5cdC8qKlxuXHQgKiBJZiB0aGUgZ2l2ZW4gcG9zaXRpb24gaXMgb24gaW5qZWN0ZWQgdGV4dCwgcHJlZmVycyB0aGUgcG9zaXRpb24gcmlnaHQgb2YgaXQuXG5cdCovXG5cdFJpZ2h0T2ZJbmplY3RlZFRleHQgPSA0XG59XG5cbmV4cG9ydCBlbnVtIFJlbmRlckxpbmVOdW1iZXJzVHlwZSB7XG5cdE9mZiA9IDAsXG5cdE9uID0gMSxcblx0UmVsYXRpdmUgPSAyLFxuXHRJbnRlcnZhbCA9IDMsXG5cdEN1c3RvbSA9IDRcbn1cblxuZXhwb3J0IGVudW0gUmVuZGVyTWluaW1hcCB7XG5cdE5vbmUgPSAwLFxuXHRUZXh0ID0gMSxcblx0QmxvY2tzID0gMlxufVxuXG5leHBvcnQgZW51bSBTY3JvbGxUeXBlIHtcblx0U21vb3RoID0gMCxcblx0SW1tZWRpYXRlID0gMVxufVxuXG5leHBvcnQgZW51bSBTY3JvbGxiYXJWaXNpYmlsaXR5IHtcblx0QXV0byA9IDEsXG5cdEhpZGRlbiA9IDIsXG5cdFZpc2libGUgPSAzXG59XG5cbi8qKlxuICogVGhlIGRpcmVjdGlvbiBvZiBhIHNlbGVjdGlvbi5cbiAqL1xuZXhwb3J0IGVudW0gU2VsZWN0aW9uRGlyZWN0aW9uIHtcblx0LyoqXG5cdCAqIFRoZSBzZWxlY3Rpb24gc3RhcnRzIGFib3ZlIHdoZXJlIGl0IGVuZHMuXG5cdCAqL1xuXHRMVFIgPSAwLFxuXHQvKipcblx0ICogVGhlIHNlbGVjdGlvbiBzdGFydHMgYmVsb3cgd2hlcmUgaXQgZW5kcy5cblx0ICovXG5cdFJUTCA9IDFcbn1cblxuZXhwb3J0IGVudW0gU2hvd0xpZ2h0YnVsYkljb25Nb2RlIHtcblx0T2ZmID0gJ29mZicsXG5cdE9uQ29kZSA9ICdvbkNvZGUnLFxuXHRPbiA9ICdvbidcbn1cblxuZXhwb3J0IGVudW0gU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kIHtcblx0SW52b2tlID0gMSxcblx0VHJpZ2dlckNoYXJhY3RlciA9IDIsXG5cdENvbnRlbnRDaGFuZ2UgPSAzXG59XG5cbi8qKlxuICogQSBzeW1ib2wga2luZC5cbiAqL1xuZXhwb3J0IGVudW0gU3ltYm9sS2luZCB7XG5cdEZpbGUgPSAwLFxuXHRNb2R1bGUgPSAxLFxuXHROYW1lc3BhY2UgPSAyLFxuXHRQYWNrYWdlID0gMyxcblx0Q2xhc3MgPSA0LFxuXHRNZXRob2QgPSA1LFxuXHRQcm9wZXJ0eSA9IDYsXG5cdEZpZWxkID0gNyxcblx0Q29uc3RydWN0b3IgPSA4LFxuXHRFbnVtID0gOSxcblx0SW50ZXJmYWNlID0gMTAsXG5cdEZ1bmN0aW9uID0gMTEsXG5cdFZhcmlhYmxlID0gMTIsXG5cdENvbnN0YW50ID0gMTMsXG5cdFN0cmluZyA9IDE0LFxuXHROdW1iZXIgPSAxNSxcblx0Qm9vbGVhbiA9IDE2LFxuXHRBcnJheSA9IDE3LFxuXHRPYmplY3QgPSAxOCxcblx0S2V5ID0gMTksXG5cdE51bGwgPSAyMCxcblx0RW51bU1lbWJlciA9IDIxLFxuXHRTdHJ1Y3QgPSAyMixcblx0RXZlbnQgPSAyMyxcblx0T3BlcmF0b3IgPSAyNCxcblx0VHlwZVBhcmFtZXRlciA9IDI1XG59XG5cbmV4cG9ydCBlbnVtIFN5bWJvbFRhZyB7XG5cdERlcHJlY2F0ZWQgPSAxXG59XG5cbi8qKlxuICogVGV4dCBEaXJlY3Rpb24gZm9yIGEgZGVjb3JhdGlvbi5cbiAqL1xuZXhwb3J0IGVudW0gVGV4dERpcmVjdGlvbiB7XG5cdExUUiA9IDAsXG5cdFJUTCA9IDFcbn1cblxuLyoqXG4gKiBUaGUga2luZCBvZiBhbmltYXRpb24gaW4gd2hpY2ggdGhlIGVkaXRvcidzIGN1cnNvciBzaG91bGQgYmUgcmVuZGVyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlIHtcblx0LyoqXG5cdCAqIEhpZGRlblxuXHQgKi9cblx0SGlkZGVuID0gMCxcblx0LyoqXG5cdCAqIEJsaW5raW5nXG5cdCAqL1xuXHRCbGluayA9IDEsXG5cdC8qKlxuXHQgKiBCbGlua2luZyB3aXRoIHNtb290aCBmYWRpbmdcblx0ICovXG5cdFNtb290aCA9IDIsXG5cdC8qKlxuXHQgKiBCbGlua2luZyB3aXRoIHByb2xvbmdlZCBmaWxsZWQgc3RhdGUgYW5kIHNtb290aCBmYWRpbmdcblx0ICovXG5cdFBoYXNlID0gMyxcblx0LyoqXG5cdCAqIEV4cGFuZCBjb2xsYXBzZSBhbmltYXRpb24gb24gdGhlIHkgYXhpc1xuXHQgKi9cblx0RXhwYW5kID0gNCxcblx0LyoqXG5cdCAqIE5vLUJsaW5raW5nXG5cdCAqL1xuXHRTb2xpZCA9IDVcbn1cblxuLyoqXG4gKiBUaGUgc3R5bGUgaW4gd2hpY2ggdGhlIGVkaXRvcidzIGN1cnNvciBzaG91bGQgYmUgcmVuZGVyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JDdXJzb3JTdHlsZSB7XG5cdC8qKlxuXHQgKiBBcyBhIHZlcnRpY2FsIGxpbmUgKHNpdHRpbmcgYmV0d2VlbiB0d28gY2hhcmFjdGVycykuXG5cdCAqL1xuXHRMaW5lID0gMSxcblx0LyoqXG5cdCAqIEFzIGEgYmxvY2sgKHNpdHRpbmcgb24gdG9wIG9mIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdEJsb2NrID0gMixcblx0LyoqXG5cdCAqIEFzIGEgaG9yaXpvbnRhbCBsaW5lIChzaXR0aW5nIHVuZGVyIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdFVuZGVybGluZSA9IDMsXG5cdC8qKlxuXHQgKiBBcyBhIHRoaW4gdmVydGljYWwgbGluZSAoc2l0dGluZyBiZXR3ZWVuIHR3byBjaGFyYWN0ZXJzKS5cblx0ICovXG5cdExpbmVUaGluID0gNCxcblx0LyoqXG5cdCAqIEFzIGFuIG91dGxpbmVkIGJsb2NrIChzaXR0aW5nIG9uIHRvcCBvZiBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRCbG9ja091dGxpbmUgPSA1LFxuXHQvKipcblx0ICogQXMgYSB0aGluIGhvcml6b250YWwgbGluZSAoc2l0dGluZyB1bmRlciBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRVbmRlcmxpbmVUaGluID0gNlxufVxuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgYmVoYXZpb3Igb2YgZGVjb3JhdGlvbnMgd2hlbiB0eXBpbmcvZWRpdGluZyBuZWFyIHRoZWlyIGVkZ2VzLlxuICogTm90ZTogUGxlYXNlIGRvIG5vdCBlZGl0IHRoZSB2YWx1ZXMsIGFzIHRoZXkgdmVyeSBjYXJlZnVsbHkgbWF0Y2ggYERlY29yYXRpb25SYW5nZUJlaGF2aW9yYFxuICovXG5leHBvcnQgZW51bSBUcmFja2VkUmFuZ2VTdGlja2luZXNzIHtcblx0QWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyA9IDAsXG5cdE5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyA9IDEsXG5cdEdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUgPSAyLFxuXHRHcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIgPSAzXG59XG5cbi8qKlxuICogRGVzY3JpYmVzIGhvdyB0byBpbmRlbnQgd3JhcHBlZCBsaW5lcy5cbiAqL1xuZXhwb3J0IGVudW0gV3JhcHBpbmdJbmRlbnQge1xuXHQvKipcblx0ICogTm8gaW5kZW50YXRpb24gPT4gd3JhcHBlZCBsaW5lcyBiZWdpbiBhdCBjb2x1bW4gMS5cblx0ICovXG5cdE5vbmUgPSAwLFxuXHQvKipcblx0ICogU2FtZSA9PiB3cmFwcGVkIGxpbmVzIGdldCB0aGUgc2FtZSBpbmRlbnRhdGlvbiBhcyB0aGUgcGFyZW50LlxuXHQgKi9cblx0U2FtZSA9IDEsXG5cdC8qKlxuXHQgKiBJbmRlbnQgPT4gd3JhcHBlZCBsaW5lcyBnZXQgKzEgaW5kZW50YXRpb24gdG93YXJkIHRoZSBwYXJlbnQuXG5cdCAqL1xuXHRJbmRlbnQgPSAyLFxuXHQvKipcblx0ICogRGVlcEluZGVudCA9PiB3cmFwcGVkIGxpbmVzIGdldCArMiBpbmRlbnRhdGlvbiB0b3dhcmQgdGhlIHBhcmVudC5cblx0ICovXG5cdERlZXBJbmRlbnQgPSAzXG59Il0sCiAgIm1hcHBpbmdzIjogIkFBUU8sSUFBSyx1QkFBTCxrQkFBS0EsMEJBQUw7QUFJTixFQUFBQSw0Q0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSw0Q0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSw0Q0FBQSxhQUFVLEtBQVY7QUFOVyxTQUFBQTtBQUFBLEdBQUE7QUFTTCxJQUFLLHdCQUFMLGtCQUFLQywyQkFBTDtBQUNOLEVBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDhDQUFBLFVBQU8sS0FBUDtBQUZXLFNBQUFBO0FBQUEsR0FBQTtBQUtMLElBQUssK0JBQUwsa0JBQUtDLGtDQUFMO0FBQ04sRUFBQUEsNERBQUEsVUFBTyxLQUFQO0FBS0EsRUFBQUEsNERBQUEsb0JBQWlCLEtBQWpCO0FBSUEsRUFBQUEsNERBQUEscUJBQWtCLEtBQWxCO0FBVlcsU0FBQUE7QUFBQSxHQUFBO0FBYUwsSUFBSyxxQkFBTCxrQkFBS0Msd0JBQUw7QUFDTixFQUFBQSx3Q0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSx3Q0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSx3Q0FBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsd0NBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0NBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsd0NBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsd0NBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsd0NBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0NBQUEsV0FBUSxNQUFSO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxNQUFYO0FBQ0EsRUFBQUEsd0NBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsd0NBQUEsV0FBUSxNQUFSO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxNQUFYO0FBQ0EsRUFBQUEsd0NBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsd0NBQUEsZ0JBQWEsTUFBYjtBQUNBLEVBQUFBLHdDQUFBLGFBQVUsTUFBVjtBQUNBLEVBQUFBLHdDQUFBLFVBQU8sTUFBUDtBQUNBLEVBQUFBLHdDQUFBLFdBQVEsTUFBUjtBQUNBLEVBQUFBLHdDQUFBLFVBQU8sTUFBUDtBQUNBLEVBQUFBLHdDQUFBLGVBQVksTUFBWjtBQUNBLEVBQUFBLHdDQUFBLGlCQUFjLE1BQWQ7QUFDQSxFQUFBQSx3Q0FBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSx3Q0FBQSxtQkFBZ0IsTUFBaEI7QUFDQSxFQUFBQSx3Q0FBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSx3Q0FBQSxXQUFRLE1BQVI7QUFDQSxFQUFBQSx3Q0FBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSx3Q0FBQSxhQUFVLE1BQVY7QUE3QlcsU0FBQUE7QUFBQSxHQUFBO0FBZ0NMLElBQUssb0JBQUwsa0JBQUtDLHVCQUFMO0FBQ04sRUFBQUEsc0NBQUEsZ0JBQWEsS0FBYjtBQURXLFNBQUFBO0FBQUEsR0FBQTtBQU9MLElBQUssd0JBQUwsa0JBQUtDLDJCQUFMO0FBQ04sRUFBQUEsOENBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsOENBQUEsc0JBQW1CLEtBQW5CO0FBQ0EsRUFBQUEsOENBQUEscUNBQWtDLEtBQWxDO0FBSFcsU0FBQUE7QUFBQSxHQUFBO0FBU0wsSUFBSyxrQ0FBTCxrQkFBS0MscUNBQUw7QUFJTixFQUFBQSxrRUFBQSxXQUFRLEtBQVI7QUFJQSxFQUFBQSxrRUFBQSxXQUFRLEtBQVI7QUFJQSxFQUFBQSxrRUFBQSxXQUFRLEtBQVI7QUFaVyxTQUFBQTtBQUFBLEdBQUE7QUFrQkwsSUFBSyxxQkFBTCxrQkFBS0Msd0JBQUw7QUFJTixFQUFBQSx3Q0FBQSxZQUFTLEtBQVQ7QUFJQSxFQUFBQSx3Q0FBQSxrQkFBZSxLQUFmO0FBSUEsRUFBQUEsd0NBQUEsd0JBQXFCLEtBQXJCO0FBSUEsRUFBQUEsd0NBQUEsY0FBVyxLQUFYO0FBSUEsRUFBQUEsd0NBQUEsV0FBUSxLQUFSO0FBSUEsRUFBQUEsd0NBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsd0NBQUEsVUFBTyxLQUFQO0FBNUJXLFNBQUFBO0FBQUEsR0FBQTtBQWtDTCxJQUFLLG1CQUFMLGtCQUFLQyxzQkFBTDtBQUlOLEVBQUFBLG9DQUFBLFFBQUssS0FBTDtBQUlBLEVBQUFBLG9DQUFBLFVBQU8sS0FBUDtBQVJXLFNBQUFBO0FBQUEsR0FBQTtBQWNMLElBQUssd0JBQUwsa0JBQUtDLDJCQUFMO0FBSU4sRUFBQUEsOENBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsOENBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsOENBQUEsV0FBUSxLQUFSO0FBWlcsU0FBQUE7QUFBQSxHQUFBO0FBa0JMLElBQUssMkJBQUwsa0JBQUtDLDhCQUFMO0FBQ04sRUFBQUEsb0RBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsb0RBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsb0RBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsb0RBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsb0RBQUEsVUFBTyxLQUFQO0FBTFcsU0FBQUE7QUFBQSxHQUFBO0FBUUwsSUFBSyxlQUFMLGtCQUFLQyxrQkFBTDtBQUNOLEVBQUFBLDRCQUFBLHVDQUFvQyxLQUFwQztBQUNBLEVBQUFBLDRCQUFBLDZCQUEwQixLQUExQjtBQUNBLEVBQUFBLDRCQUFBLDBCQUF1QixLQUF2QjtBQUNBLEVBQUFBLDRCQUFBLDJCQUF3QixLQUF4QjtBQUNBLEVBQUFBLDRCQUFBLG1CQUFnQixLQUFoQjtBQUNBLEVBQUFBLDRCQUFBLDhCQUEyQixLQUEzQjtBQUNBLEVBQUFBLDRCQUFBLHdCQUFxQixLQUFyQjtBQUNBLEVBQUFBLDRCQUFBLDJDQUF3QyxLQUF4QztBQUNBLEVBQUFBLDRCQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLEtBQWY7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSwwQ0FBdUMsTUFBdkM7QUFDQSxFQUFBQSw0QkFBQSx1QkFBb0IsTUFBcEI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSx1QkFBb0IsTUFBcEI7QUFDQSxFQUFBQSw0QkFBQSxnQkFBYSxNQUFiO0FBQ0EsRUFBQUEsNEJBQUEsdUJBQW9CLE1BQXBCO0FBQ0EsRUFBQUEsNEJBQUEsbUNBQWdDLE1BQWhDO0FBQ0EsRUFBQUEsNEJBQUEscUJBQWtCLE1BQWxCO0FBQ0EsRUFBQUEsNEJBQUEsa0JBQWUsTUFBZjtBQUNBLEVBQUFBLDRCQUFBLDZCQUEwQixNQUExQjtBQUNBLEVBQUFBLDRCQUFBLFlBQVMsTUFBVDtBQUNBLEVBQUFBLDRCQUFBLGNBQVcsTUFBWDtBQUNBLEVBQUFBLDRCQUFBLHdCQUFxQixNQUFyQjtBQUNBLEVBQUFBLDRCQUFBLHNCQUFtQixNQUFuQjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixNQUFsQjtBQUNBLEVBQUFBLDRCQUFBLDBCQUF1QixNQUF2QjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixNQUFsQjtBQUNBLEVBQUFBLDRCQUFBLGNBQVcsTUFBWDtBQUNBLEVBQUFBLDRCQUFBLGlCQUFjLE1BQWQ7QUFDQSxFQUFBQSw0QkFBQSxnQ0FBNkIsTUFBN0I7QUFDQSxFQUFBQSw0QkFBQSxvQkFBaUIsTUFBakI7QUFDQSxFQUFBQSw0QkFBQSxnQ0FBNkIsTUFBN0I7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxNQUFkO0FBQ0EsRUFBQUEsNEJBQUEsNEJBQXlCLE1BQXpCO0FBQ0EsRUFBQUEsNEJBQUEsaUNBQThCLE1BQTlCO0FBQ0EsRUFBQUEsNEJBQUEsaUJBQWMsTUFBZDtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLE1BQWY7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSxtQ0FBZ0MsTUFBaEM7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxNQUFkO0FBQ0EsRUFBQUEsNEJBQUEsaUJBQWMsTUFBZDtBQUNBLEVBQUFBLDRCQUFBLG9CQUFpQixNQUFqQjtBQUNBLEVBQUFBLDRCQUFBLGlCQUFjLE1BQWQ7QUFDQSxFQUFBQSw0QkFBQSw2QkFBMEIsTUFBMUI7QUFDQSxFQUFBQSw0QkFBQSxpQ0FBOEIsTUFBOUI7QUFDQSxFQUFBQSw0QkFBQSxxQ0FBa0MsTUFBbEM7QUFDQSxFQUFBQSw0QkFBQSwwQkFBdUIsTUFBdkI7QUFDQSxFQUFBQSw0QkFBQSwyQkFBd0IsTUFBeEI7QUFDQSxFQUFBQSw0QkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSw0QkFBQSwwQkFBdUIsTUFBdkI7QUFDQSxFQUFBQSw0QkFBQSxhQUFVLE1BQVY7QUFDQSxFQUFBQSw0QkFBQSxxQkFBa0IsTUFBbEI7QUFDQSxFQUFBQSw0QkFBQSxzQkFBbUIsTUFBbkI7QUFDQSxFQUFBQSw0QkFBQSw2QkFBMEIsTUFBMUI7QUFDQSxFQUFBQSw0QkFBQSwyQkFBd0IsTUFBeEI7QUFDQSxFQUFBQSw0QkFBQSxpQ0FBOEIsTUFBOUI7QUFDQSxFQUFBQSw0QkFBQSxnQkFBYSxNQUFiO0FBQ0EsRUFBQUEsNEJBQUEsY0FBVyxNQUFYO0FBQ0EsRUFBQUEsNEJBQUEsbUJBQWdCLE1BQWhCO0FBQ0EsRUFBQUEsNEJBQUEsY0FBVyxNQUFYO0FBQ0EsRUFBQUEsNEJBQUEsZ0JBQWEsTUFBYjtBQUNBLEVBQUFBLDRCQUFBLG9CQUFpQixNQUFqQjtBQUNBLEVBQUFBLDRCQUFBLG1CQUFnQixNQUFoQjtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLE1BQWY7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxNQUFkO0FBQ0EsRUFBQUEsNEJBQUEsa0JBQWUsTUFBZjtBQUNBLEVBQUFBLDRCQUFBLCtCQUE0QixNQUE1QjtBQUNBLEVBQUFBLDRCQUFBLFdBQVEsTUFBUjtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLE1BQWY7QUFDQSxFQUFBQSw0QkFBQSxtQkFBZ0IsTUFBaEI7QUFDQSxFQUFBQSw0QkFBQSxtQkFBZ0IsTUFBaEI7QUFDQSxFQUFBQSw0QkFBQSxlQUFZLE1BQVo7QUFDQSxFQUFBQSw0QkFBQSwwQkFBdUIsTUFBdkI7QUFDQSxFQUFBQSw0QkFBQSxnQkFBYSxNQUFiO0FBQ0EsRUFBQUEsNEJBQUEsaUJBQWMsTUFBZDtBQUNBLEVBQUFBLDRCQUFBLHlCQUFzQixNQUF0QjtBQUNBLEVBQUFBLDRCQUFBLG1CQUFnQixNQUFoQjtBQUNBLEVBQUFBLDRCQUFBLFdBQVEsTUFBUjtBQUNBLEVBQUFBLDRCQUFBLG1CQUFnQixNQUFoQjtBQUNBLEVBQUFBLDRCQUFBLGFBQVUsTUFBVjtBQUNBLEVBQUFBLDRCQUFBLGdCQUFhLE1BQWI7QUFDQSxFQUFBQSw0QkFBQSxpQ0FBOEIsTUFBOUI7QUFDQSxFQUFBQSw0QkFBQSxvQkFBaUIsTUFBakI7QUFDQSxFQUFBQSw0QkFBQSxpQ0FBOEIsTUFBOUI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSw0QkFBeUIsTUFBekI7QUFDQSxFQUFBQSw0QkFBQSxzQkFBbUIsTUFBbkI7QUFDQSxFQUFBQSw0QkFBQSxzQkFBbUIsTUFBbkI7QUFDQSxFQUFBQSw0QkFBQSwwQkFBdUIsTUFBdkI7QUFDQSxFQUFBQSw0QkFBQSwrQkFBNEIsTUFBNUI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSxxQkFBa0IsTUFBbEI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsTUFBdEI7QUFDQSxFQUFBQSw0QkFBQSx3QkFBcUIsTUFBckI7QUFDQSxFQUFBQSw0QkFBQSxhQUFVLE1BQVY7QUFDQSxFQUFBQSw0QkFBQSxhQUFVLE1BQVY7QUFDQSxFQUFBQSw0QkFBQSxvQkFBaUIsTUFBakI7QUFDQSxFQUFBQSw0QkFBQSw0QkFBeUIsTUFBekI7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxPQUFkO0FBQ0EsRUFBQUEsNEJBQUEsK0JBQTRCLE9BQTVCO0FBQ0EsRUFBQUEsNEJBQUEsc0JBQW1CLE9BQW5CO0FBQ0EsRUFBQUEsNEJBQUEsMkJBQXdCLE9BQXhCO0FBQ0EsRUFBQUEsNEJBQUEsY0FBVyxPQUFYO0FBQ0EsRUFBQUEsNEJBQUEscUJBQWtCLE9BQWxCO0FBQ0EsRUFBQUEsNEJBQUEsa0JBQWUsT0FBZjtBQUNBLEVBQUFBLDRCQUFBLG1DQUFnQyxPQUFoQztBQUNBLEVBQUFBLDRCQUFBLDZCQUEwQixPQUExQjtBQUNBLEVBQUFBLDRCQUFBLHdCQUFxQixPQUFyQjtBQUNBLEVBQUFBLDRCQUFBLHlCQUFzQixPQUF0QjtBQUNBLEVBQUFBLDRCQUFBLHNDQUFtQyxPQUFuQztBQUNBLEVBQUFBLDRCQUFBLGlDQUE4QixPQUE5QjtBQUNBLEVBQUFBLDRCQUFBLHNCQUFtQixPQUFuQjtBQUNBLEVBQUFBLDRCQUFBLGtDQUErQixPQUEvQjtBQUNBLEVBQUFBLDRCQUFBLHNCQUFtQixPQUFuQjtBQUNBLEVBQUFBLDRCQUFBLFlBQVMsT0FBVDtBQUNBLEVBQUFBLDRCQUFBLGVBQVksT0FBWjtBQUNBLEVBQUFBLDRCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLDRCQUFBLDBCQUF1QixPQUF2QjtBQUNBLEVBQUFBLDRCQUFBLDJCQUF3QixPQUF4QjtBQUNBLEVBQUFBLDRCQUFBLHdCQUFxQixPQUFyQjtBQUNBLEVBQUFBLDRCQUFBLHdCQUFxQixPQUFyQjtBQUNBLEVBQUFBLDRCQUFBLGlDQUE4QixPQUE5QjtBQUNBLEVBQUFBLDRCQUFBLGlDQUE4QixPQUE5QjtBQUNBLEVBQUFBLDRCQUFBLHlCQUFzQixPQUF0QjtBQUNBLEVBQUFBLDRCQUFBLHlCQUFzQixPQUF0QjtBQUNBLEVBQUFBLDRCQUFBLGdCQUFhLE9BQWI7QUFDQSxFQUFBQSw0QkFBQSx3QkFBcUIsT0FBckI7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxPQUFkO0FBQ0EsRUFBQUEsNEJBQUEscUJBQWtCLE9BQWxCO0FBQ0EsRUFBQUEsNEJBQUEsa0JBQWUsT0FBZjtBQUNBLEVBQUFBLDRCQUFBLG9CQUFpQixPQUFqQjtBQUNBLEVBQUFBLDRCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLDRCQUFBLGFBQVUsT0FBVjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixPQUFsQjtBQUNBLEVBQUFBLDRCQUFBLHVCQUFvQixPQUFwQjtBQUNBLEVBQUFBLDRCQUFBLGdDQUE2QixPQUE3QjtBQUNBLEVBQUFBLDRCQUFBLHNCQUFtQixPQUFuQjtBQUNBLEVBQUFBLDRCQUFBLG1CQUFnQixPQUFoQjtBQUNBLEVBQUFBLDRCQUFBLGNBQVcsT0FBWDtBQUNBLEVBQUFBLDRCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLDRCQUFBLHlCQUFzQixPQUF0QjtBQUNBLEVBQUFBLDRCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLE9BQWY7QUFDQSxFQUFBQSw0QkFBQSxpQkFBYyxPQUFkO0FBQ0EsRUFBQUEsNEJBQUEsZUFBWSxPQUFaO0FBQ0EsRUFBQUEsNEJBQUEsMEJBQXVCLE9BQXZCO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsY0FBVyxPQUFYO0FBQ0EsRUFBQUEsNEJBQUEsa0NBQStCLE9BQS9CO0FBQ0EsRUFBQUEsNEJBQUEsbUNBQWdDLE9BQWhDO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsdUJBQW9CLE9BQXBCO0FBQ0EsRUFBQUEsNEJBQUEsdUJBQW9CLE9BQXBCO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsc0JBQW1CLE9BQW5CO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsZ0JBQWEsT0FBYjtBQUNBLEVBQUFBLDRCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLDRCQUFBLDBCQUF1QixPQUF2QjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixPQUFsQjtBQUNBLEVBQUFBLDRCQUFBLGdCQUFhLE9BQWI7QUFDQSxFQUFBQSw0QkFBQSxrQkFBZSxPQUFmO0FBQ0EsRUFBQUEsNEJBQUEsZ0JBQWEsT0FBYjtBQUNBLEVBQUFBLDRCQUFBLGtCQUFlLE9BQWY7QUFDQSxFQUFBQSw0QkFBQSw0QkFBeUIsT0FBekI7QUFDQSxFQUFBQSw0QkFBQSxnQ0FBNkIsT0FBN0I7QUFDQSxFQUFBQSw0QkFBQSwyQ0FBd0MsT0FBeEM7QUFDQSxFQUFBQSw0QkFBQSwwQkFBdUIsT0FBdkI7QUFDQSxFQUFBQSw0QkFBQSx5QkFBc0IsT0FBdEI7QUFDQSxFQUFBQSw0QkFBQSxpQ0FBOEIsT0FBOUI7QUFDQSxFQUFBQSw0QkFBQSw2QkFBMEIsT0FBMUI7QUE5S1csU0FBQUE7QUFBQSxHQUFBO0FBb0xMLElBQUssc0JBQUwsa0JBQUtDLHlCQUFMO0FBSU4sRUFBQUEsMENBQUEsaUJBQWMsS0FBZDtBQUlBLEVBQUFBLDBDQUFBLFFBQUssS0FBTDtBQUlBLEVBQUFBLDBDQUFBLFVBQU8sS0FBUDtBQVpXLFNBQUFBO0FBQUEsR0FBQTtBQWtCTCxJQUFLLG9CQUFMLGtCQUFLQyx1QkFBTDtBQUlOLEVBQUFBLHNDQUFBLFFBQUssS0FBTDtBQUlBLEVBQUFBLHNDQUFBLFVBQU8sS0FBUDtBQVJXLFNBQUFBO0FBQUEsR0FBQTtBQWNMLElBQUssa0JBQUwsa0JBQUtDLHFCQUFMO0FBQ04sRUFBQUEsa0NBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsa0NBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsa0NBQUEsV0FBUSxLQUFSO0FBSFcsU0FBQUE7QUFBQSxHQUFBO0FBTUwsSUFBSyx1QkFBTCxrQkFBS0MsMEJBQUw7QUFJTixFQUFBQSw0Q0FBQSxjQUFXLEtBQVg7QUFJQSxFQUFBQSw0Q0FBQSxjQUFXLEtBQVg7QUFSVyxTQUFBQTtBQUFBLEdBQUE7QUFjTCxJQUFLLGVBQUwsa0JBQUtDLGtCQUFMO0FBSU4sRUFBQUEsNEJBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsNEJBQUEsWUFBUyxLQUFUO0FBTUEsRUFBQUEsNEJBQUEsbUJBQWdCLEtBQWhCO0FBSUEsRUFBQUEsNEJBQUEsYUFBVSxLQUFWO0FBbEJXLFNBQUFBO0FBQUEsR0FBQTtBQXFCTCxJQUFLLDBCQUFMLGtCQUFLQyw2QkFBTDtBQUNOLEVBQUFBLGtEQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLGtEQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLGtEQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLGtEQUFBLFVBQU8sS0FBUDtBQUpXLFNBQUFBO0FBQUEsR0FBQTtBQU9MLElBQUssZ0JBQUwsa0JBQUtDLG1CQUFMO0FBQ04sRUFBQUEsOEJBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsOEJBQUEsZUFBWSxLQUFaO0FBRlcsU0FBQUE7QUFBQSxHQUFBO0FBS0wsSUFBSyxzQ0FBTCxrQkFBS0MseUNBQUw7QUFDTixFQUFBQSwwRUFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSwwRUFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSwwRUFBQSxhQUFVLEtBQVY7QUFIVyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxJQUFLLDRCQUFMLGtCQUFLQywrQkFBTDtBQUNOLEVBQUFBLHNEQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLHNEQUFBLFdBQVEsS0FBUjtBQUZXLFNBQUFBO0FBQUEsR0FBQTtBQVFMLElBQUssOEJBQUwsa0JBQUtDLGlDQUFMO0FBS04sRUFBQUEsMERBQUEsZUFBWSxLQUFaO0FBS0EsRUFBQUEsMERBQUEsY0FBVyxLQUFYO0FBVlcsU0FBQUE7QUFBQSxHQUFBO0FBaUJMLElBQUssVUFBTCxrQkFBS0MsYUFBTDtBQUNOLEVBQUFBLGtCQUFBLHVCQUFvQixNQUFwQjtBQUlBLEVBQUFBLGtCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLGtCQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sS0FBTjtBQUNBLEVBQUFBLGtCQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLGtCQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLGtCQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sS0FBTjtBQUNBLEVBQUFBLGtCQUFBLGdCQUFhLEtBQWI7QUFDQSxFQUFBQSxrQkFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSxrQkFBQSxXQUFRLE1BQVI7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxjQUFXLE1BQVg7QUFDQSxFQUFBQSxrQkFBQSxTQUFNLE1BQU47QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxlQUFZLE1BQVo7QUFDQSxFQUFBQSxrQkFBQSxhQUFVLE1BQVY7QUFDQSxFQUFBQSxrQkFBQSxnQkFBYSxNQUFiO0FBQ0EsRUFBQUEsa0JBQUEsZUFBWSxNQUFaO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsWUFBUyxNQUFUO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsa0JBQUEsaUJBQWMsTUFBZDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFFBQUssTUFBTDtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLGtCQUFBLGFBQVUsTUFBVjtBQUNBLEVBQUFBLGtCQUFBLGdCQUFhLE1BQWI7QUFLQSxFQUFBQSxrQkFBQSxlQUFZLE1BQVo7QUFLQSxFQUFBQSxrQkFBQSxXQUFRLE1BQVI7QUFLQSxFQUFBQSxrQkFBQSxXQUFRLE1BQVI7QUFLQSxFQUFBQSxrQkFBQSxX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NUI7QUFDQSxFQUFBQSxnREFBQSw4QkFBMkIsS0FBM0I7QUFKVyxTQUFBQTtBQUFBLEdBQUE7QUFVTCxJQUFLLGlCQUFMLGtCQUFLQyxvQkFBTDtBQUlOLEVBQUFBLGdDQUFBLFVBQU8sS0FBUDtBQUlBLEVBQUFBLGdDQUFBLFVBQU8sS0FBUDtBQUlBLEVBQUFBLGdDQUFBLFlBQVMsS0FBVDtBQUlBLEVBQUFBLGdDQUFBLGdCQUFhLEtBQWI7QUFoQlcsU0FBQUE7QUFBQSxHQUFBOyIsCiAgIm5hbWVzIjogWyJBY2Nlc3NpYmlsaXR5U3VwcG9ydCIsICJDb2RlQWN0aW9uVHJpZ2dlclR5cGUiLCAiQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZSIsICJDb21wbGV0aW9uSXRlbUtpbmQiLCAiQ29tcGxldGlvbkl0ZW1UYWciLCAiQ29tcGxldGlvblRyaWdnZXJLaW5kIiwgIkNvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UiLCAiQ3Vyc29yQ2hhbmdlUmVhc29uIiwgIkRlZmF1bHRFbmRPZkxpbmUiLCAiRG9jdW1lbnRIaWdobGlnaHRLaW5kIiwgIkVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSIsICJFZGl0b3JPcHRpb24iLCAiRW5kT2ZMaW5lUHJlZmVyZW5jZSIsICJFbmRPZkxpbmVTZXF1ZW5jZSIsICJHbHlwaE1hcmdpbkxhbmUiLCAiSG92ZXJWZXJib3NpdHlBY3Rpb24iLCAiSW5kZW50QWN0aW9uIiwgIkluamVjdGVkVGV4dEN1cnNvclN0b3BzIiwgIklubGF5SGludEtpbmQiLCAiSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQiLCAiSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZSIsICJJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQiLCAiS2V5Q29kZSIsICJNYXJrZXJTZXZlcml0eSIsICJNYXJrZXJUYWciLCAiTWluaW1hcFBvc2l0aW9uIiwgIk1pbmltYXBTZWN0aW9uSGVhZGVyU3R5bGUiLCAiTW91c2VUYXJnZXRUeXBlIiwgIk5ld1N5bWJvbE5hbWVUYWciLCAiTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kIiwgIk92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UiLCAiT3ZlcnZpZXdSdWxlckxhbmUiLCAiUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kIiwgIlBvc2l0aW9uQWZmaW5pdHkiLCAiUmVuZGVyTGluZU51bWJlcnNUeXBlIiwgIlJlbmRlck1pbmltYXAiLCAiU2Nyb2xsVHlwZSIsICJTY3JvbGxiYXJWaXNpYmlsaXR5IiwgIlNlbGVjdGlvbkRpcmVjdGlvbiIsICJTaG93TGlnaHRidWxiSWNvbk1vZGUiLCAiU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kIiwgIlN5bWJvbEtpbmQiLCAiU3ltYm9sVGFnIiwgIlRleHREaXJlY3Rpb24iLCAiVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUiLCAiVGV4dEVkaXRvckN1cnNvclN0eWxlIiwgIlRyYWNrZWRSYW5nZVN0aWNraW5lc3MiLCAiV3JhcHBpbmdJbmRlbnQiXQp9Cg==
