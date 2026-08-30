import * as nls from "../../../../nls.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { registerColor, transparent, lessProminent, darken, lighten } from "../colorUtils.js";
import { foreground, contrastBorder, activeContrastBorder } from "./baseColors.js";
import { scrollbarShadow, badgeBackground } from "./miscColors.js";
const editorBackground = registerColor(
  "editor.background",
  { light: "#ffffff", dark: "#1E1E1E", hcDark: Color.black, hcLight: Color.white },
  nls.localize("editorBackground", "Editor background color.")
);
const editorForeground = registerColor(
  "editor.foreground",
  { light: "#333333", dark: "#BBBBBB", hcDark: Color.white, hcLight: foreground },
  nls.localize("editorForeground", "Editor default foreground color.")
);
const editorStickyScrollBackground = registerColor(
  "editorStickyScroll.background",
  editorBackground,
  nls.localize("editorStickyScrollBackground", "Background color of sticky scroll in the editor")
);
const editorStickyScrollGutterBackground = registerColor(
  "editorStickyScrollGutter.background",
  editorBackground,
  nls.localize("editorStickyScrollGutterBackground", "Background color of the gutter part of sticky scroll in the editor")
);
const editorStickyScrollHoverBackground = registerColor(
  "editorStickyScrollHover.background",
  { dark: "#2A2D2E", light: "#F0F0F0", hcDark: null, hcLight: Color.fromHex("#0F4A85").transparent(0.1) },
  nls.localize("editorStickyScrollHoverBackground", "Background color of sticky scroll on hover in the editor")
);
const editorStickyScrollBorder = registerColor(
  "editorStickyScroll.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("editorStickyScrollBorder", "Border color of sticky scroll in the editor")
);
const editorStickyScrollShadow = registerColor(
  "editorStickyScroll.shadow",
  scrollbarShadow,
  nls.localize("editorStickyScrollShadow", " Shadow color of sticky scroll in the editor")
);
const editorWidgetBackground = registerColor(
  "editorWidget.background",
  { dark: "#252526", light: "#F3F3F3", hcDark: "#0C141F", hcLight: Color.white },
  nls.localize("editorWidgetBackground", "Background color of editor widgets, such as find/replace.")
);
const editorWidgetForeground = registerColor(
  "editorWidget.foreground",
  foreground,
  nls.localize("editorWidgetForeground", "Foreground color of editor widgets, such as find/replace.")
);
const editorWidgetBorder = registerColor(
  "editorWidget.border",
  { dark: transparent(editorWidgetForeground, 0.2), light: transparent(editorWidgetForeground, 0.2), hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("editorWidgetBorder", "Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.")
);
const editorWidgetResizeBorder = registerColor(
  "editorWidget.resizeBorder",
  null,
  nls.localize("editorWidgetResizeBorder", "Border color of the resize bar of editor widgets. The color is only used if the widget chooses to have a resize border and if the color is not overridden by a widget.")
);
const editorErrorBackground = registerColor(
  "editorError.background",
  null,
  nls.localize("editorError.background", "Background color of error text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorErrorForeground = registerColor(
  "editorError.foreground",
  { dark: "#F14C4C", light: "#E51400", hcDark: "#F48771", hcLight: "#B5200D" },
  nls.localize("editorError.foreground", "Foreground color of error squigglies in the editor.")
);
const editorErrorBorder = registerColor(
  "editorError.border",
  { dark: null, light: null, hcDark: Color.fromHex("#E47777").transparent(0.8), hcLight: "#B5200D" },
  nls.localize("errorBorder", "If set, color of double underlines for errors in the editor.")
);
const editorWarningBackground = registerColor(
  "editorWarning.background",
  null,
  nls.localize("editorWarning.background", "Background color of warning text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorWarningForeground = registerColor(
  "editorWarning.foreground",
  { dark: "#CCA700", light: "#BF8803", hcDark: "#FFD370", hcLight: "#895503" },
  nls.localize("editorWarning.foreground", "Foreground color of warning squigglies in the editor.")
);
const editorWarningBorder = registerColor(
  "editorWarning.border",
  { dark: null, light: null, hcDark: Color.fromHex("#FFCC00").transparent(0.8), hcLight: Color.fromHex("#FFCC00").transparent(0.8) },
  nls.localize("warningBorder", "If set, color of double underlines for warnings in the editor.")
);
const editorInfoBackground = registerColor(
  "editorInfo.background",
  null,
  nls.localize("editorInfo.background", "Background color of info text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorInfoForeground = registerColor(
  "editorInfo.foreground",
  { dark: "#59a4f9", light: "#0063d3", hcDark: "#59a4f9", hcLight: "#0063d3" },
  nls.localize("editorInfo.foreground", "Foreground color of info squigglies in the editor.")
);
const editorInfoBorder = registerColor(
  "editorInfo.border",
  { dark: null, light: null, hcDark: Color.fromHex("#59a4f9").transparent(0.8), hcLight: "#292929" },
  nls.localize("infoBorder", "If set, color of double underlines for infos in the editor.")
);
const editorHintForeground = registerColor(
  "editorHint.foreground",
  { dark: Color.fromHex("#eeeeee").transparent(0.7), light: "#6c6c6c", hcDark: null, hcLight: null },
  nls.localize("editorHint.foreground", "Foreground color of hint squigglies in the editor.")
);
const editorHintBorder = registerColor(
  "editorHint.border",
  { dark: null, light: null, hcDark: Color.fromHex("#eeeeee").transparent(0.8), hcLight: "#292929" },
  nls.localize("hintBorder", "If set, color of double underlines for hints in the editor.")
);
const editorActiveLinkForeground = registerColor(
  "editorLink.activeForeground",
  { dark: "#4E94CE", light: Color.blue, hcDark: Color.cyan, hcLight: "#292929" },
  nls.localize("activeLinkForeground", "Color of active links.")
);
const editorSelectionBackground = registerColor(
  "editor.selectionBackground",
  { light: "#ADD6FF", dark: "#264F78", hcDark: "#f3f518", hcLight: "#0F4A85" },
  nls.localize("editorSelectionBackground", "Color of the editor selection.")
);
const editorSelectionForeground = registerColor(
  "editor.selectionForeground",
  { light: null, dark: null, hcDark: "#000000", hcLight: Color.white },
  nls.localize("editorSelectionForeground", "Color of the selected text for high contrast.")
);
const editorInactiveSelection = registerColor(
  "editor.inactiveSelectionBackground",
  { light: transparent(editorSelectionBackground, 0.5), dark: transparent(editorSelectionBackground, 0.5), hcDark: transparent(editorSelectionBackground, 0.7), hcLight: transparent(editorSelectionBackground, 0.5) },
  nls.localize("editorInactiveSelection", "Color of the selection in an inactive editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorSelectionHighlight = registerColor(
  "editor.selectionHighlightBackground",
  { light: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), dark: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), hcDark: null, hcLight: null },
  nls.localize("editorSelectionHighlight", "Color for regions with the same content as the selection. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorSelectionHighlightBorder = registerColor(
  "editor.selectionHighlightBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("editorSelectionHighlightBorder", "Border color for regions with the same content as the selection.")
);
const editorCompositionBorder = registerColor(
  "editor.compositionBorder",
  { light: "#000000", dark: "#ffffff", hcLight: "#000000", hcDark: "#ffffff" },
  nls.localize("editorCompositionBorder", "The border color for an IME composition.")
);
const editorFindMatch = registerColor(
  "editor.findMatchBackground",
  { light: "#A8AC94", dark: "#515C6A", hcDark: null, hcLight: null },
  nls.localize("editorFindMatch", "Color of the current search match.")
);
const editorFindMatchForeground = registerColor(
  "editor.findMatchForeground",
  null,
  nls.localize("editorFindMatchForeground", "Text color of the current search match.")
);
const editorFindMatchHighlight = registerColor(
  "editor.findMatchHighlightBackground",
  { light: "#EA5C0055", dark: "#EA5C0055", hcDark: null, hcLight: null },
  nls.localize("findMatchHighlight", "Color of the other search matches. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorFindMatchHighlightForeground = registerColor(
  "editor.findMatchHighlightForeground",
  null,
  nls.localize("findMatchHighlightForeground", "Foreground color of the other search matches."),
  true
);
const editorFindRangeHighlight = registerColor(
  "editor.findRangeHighlightBackground",
  { dark: "#3a3d4166", light: "#b4b4b44d", hcDark: null, hcLight: null },
  nls.localize("findRangeHighlight", "Color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorFindMatchBorder = registerColor(
  "editor.findMatchBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("editorFindMatchBorder", "Border color of the current search match.")
);
const editorFindMatchHighlightBorder = registerColor(
  "editor.findMatchHighlightBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("findMatchHighlightBorder", "Border color of the other search matches.")
);
const editorFindRangeHighlightBorder = registerColor(
  "editor.findRangeHighlightBorder",
  { dark: null, light: null, hcDark: transparent(activeContrastBorder, 0.4), hcLight: transparent(activeContrastBorder, 0.4) },
  nls.localize("findRangeHighlightBorder", "Border color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorHoverHighlight = registerColor(
  "editor.hoverHighlightBackground",
  { light: "#ADD6FF26", dark: "#264f7840", hcDark: "#ADD6FF26", hcLight: null },
  nls.localize("hoverHighlight", "Highlight below the word for which a hover is shown. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorHoverBackground = registerColor(
  "editorHoverWidget.background",
  editorWidgetBackground,
  nls.localize("hoverBackground", "Background color of the editor hover.")
);
const editorHoverForeground = registerColor(
  "editorHoverWidget.foreground",
  editorWidgetForeground,
  nls.localize("hoverForeground", "Foreground color of the editor hover.")
);
const editorHoverBorder = registerColor(
  "editorHoverWidget.border",
  editorWidgetBorder,
  nls.localize("hoverBorder", "Border color of the editor hover.")
);
const editorHoverStatusBarBackground = registerColor(
  "editorHoverWidget.statusBarBackground",
  { dark: lighten(editorHoverBackground, 0.2), light: darken(editorHoverBackground, 0.05), hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
  nls.localize("statusBarBackground", "Background color of the editor hover status bar.")
);
const editorInlayHintForeground = registerColor(
  "editorInlayHint.foreground",
  { dark: "#969696", light: "#969696", hcDark: Color.white, hcLight: Color.black },
  nls.localize("editorInlayHintForeground", "Foreground color of inline hints")
);
const editorInlayHintBackground = registerColor(
  "editorInlayHint.background",
  { dark: transparent(badgeBackground, 0.1), light: transparent(badgeBackground, 0.1), hcDark: transparent(Color.white, 0.1), hcLight: transparent(badgeBackground, 0.1) },
  nls.localize("editorInlayHintBackground", "Background color of inline hints")
);
const editorInlayHintTypeForeground = registerColor(
  "editorInlayHint.typeForeground",
  editorInlayHintForeground,
  nls.localize("editorInlayHintForegroundTypes", "Foreground color of inline hints for types")
);
const editorInlayHintTypeBackground = registerColor(
  "editorInlayHint.typeBackground",
  editorInlayHintBackground,
  nls.localize("editorInlayHintBackgroundTypes", "Background color of inline hints for types")
);
const editorInlayHintParameterForeground = registerColor(
  "editorInlayHint.parameterForeground",
  editorInlayHintForeground,
  nls.localize("editorInlayHintForegroundParameter", "Foreground color of inline hints for parameters")
);
const editorInlayHintParameterBackground = registerColor(
  "editorInlayHint.parameterBackground",
  editorInlayHintBackground,
  nls.localize("editorInlayHintBackgroundParameter", "Background color of inline hints for parameters")
);
const editorLightBulbForeground = registerColor(
  "editorLightBulb.foreground",
  { dark: "#FFCC00", light: "#DDB100", hcDark: "#FFCC00", hcLight: "#007ACC" },
  nls.localize("editorLightBulbForeground", "The color used for the lightbulb actions icon.")
);
const editorLightBulbAutoFixForeground = registerColor(
  "editorLightBulbAutoFix.foreground",
  { dark: "#75BEFF", light: "#007ACC", hcDark: "#75BEFF", hcLight: "#007ACC" },
  nls.localize("editorLightBulbAutoFixForeground", "The color used for the lightbulb auto fix actions icon.")
);
const editorLightBulbAiForeground = registerColor(
  "editorLightBulbAi.foreground",
  editorLightBulbForeground,
  nls.localize("editorLightBulbAiForeground", "The color used for the lightbulb AI icon.")
);
const snippetTabstopHighlightBackground = registerColor(
  "editor.snippetTabstopHighlightBackground",
  { dark: new Color(new RGBA(124, 124, 124, 0.3)), light: new Color(new RGBA(10, 50, 100, 0.2)), hcDark: new Color(new RGBA(124, 124, 124, 0.3)), hcLight: new Color(new RGBA(10, 50, 100, 0.2)) },
  nls.localize("snippetTabstopHighlightBackground", "Highlight background color of a snippet tabstop.")
);
const snippetTabstopHighlightBorder = registerColor(
  "editor.snippetTabstopHighlightBorder",
  null,
  nls.localize("snippetTabstopHighlightBorder", "Highlight border color of a snippet tabstop.")
);
const snippetFinalTabstopHighlightBackground = registerColor(
  "editor.snippetFinalTabstopHighlightBackground",
  null,
  nls.localize("snippetFinalTabstopHighlightBackground", "Highlight background color of the final tabstop of a snippet.")
);
const snippetFinalTabstopHighlightBorder = registerColor(
  "editor.snippetFinalTabstopHighlightBorder",
  { dark: "#525252", light: new Color(new RGBA(10, 50, 100, 0.5)), hcDark: "#525252", hcLight: "#292929" },
  nls.localize("snippetFinalTabstopHighlightBorder", "Highlight border color of the final tabstop of a snippet.")
);
const defaultInsertColor = new Color(new RGBA(155, 185, 85, 0.2));
const defaultRemoveColor = new Color(new RGBA(255, 0, 0, 0.2));
const diffInserted = registerColor(
  "diffEditor.insertedTextBackground",
  { dark: "#9ccc2c33", light: "#9ccc2c40", hcDark: null, hcLight: null },
  nls.localize("diffEditorInserted", "Background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffRemoved = registerColor(
  "diffEditor.removedTextBackground",
  { dark: "#ff000033", light: "#ff000033", hcDark: null, hcLight: null },
  nls.localize("diffEditorRemoved", "Background color for text that got removed. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffInsertedLine = registerColor(
  "diffEditor.insertedLineBackground",
  { dark: defaultInsertColor, light: defaultInsertColor, hcDark: null, hcLight: null },
  nls.localize("diffEditorInsertedLines", "Background color for lines that got inserted. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffRemovedLine = registerColor(
  "diffEditor.removedLineBackground",
  { dark: defaultRemoveColor, light: defaultRemoveColor, hcDark: null, hcLight: null },
  nls.localize("diffEditorRemovedLines", "Background color for lines that got removed. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffInsertedLineGutter = registerColor(
  "diffEditorGutter.insertedLineBackground",
  null,
  nls.localize("diffEditorInsertedLineGutter", "Background color for the margin where lines got inserted.")
);
const diffRemovedLineGutter = registerColor(
  "diffEditorGutter.removedLineBackground",
  null,
  nls.localize("diffEditorRemovedLineGutter", "Background color for the margin where lines got removed.")
);
const diffOverviewRulerInserted = registerColor(
  "diffEditorOverview.insertedForeground",
  null,
  nls.localize("diffEditorOverviewInserted", "Diff overview ruler foreground for inserted content.")
);
const diffOverviewRulerRemoved = registerColor(
  "diffEditorOverview.removedForeground",
  null,
  nls.localize("diffEditorOverviewRemoved", "Diff overview ruler foreground for removed content.")
);
const diffInsertedOutline = registerColor(
  "diffEditor.insertedTextBorder",
  { dark: null, light: null, hcDark: "#33ff2eff", hcLight: "#374E06" },
  nls.localize("diffEditorInsertedOutline", "Outline color for the text that got inserted.")
);
const diffRemovedOutline = registerColor(
  "diffEditor.removedTextBorder",
  { dark: null, light: null, hcDark: "#FF008F", hcLight: "#AD0707" },
  nls.localize("diffEditorRemovedOutline", "Outline color for text that got removed.")
);
const diffBorder = registerColor(
  "diffEditor.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("diffEditorBorder", "Border color between the two text editors.")
);
const diffDiagonalFill = registerColor(
  "diffEditor.diagonalFill",
  { dark: "#cccccc33", light: "#22222233", hcDark: null, hcLight: null },
  nls.localize("diffDiagonalFill", "Color of the diff editor's diagonal fill. The diagonal fill is used in side-by-side diff views.")
);
const diffUnchangedRegionBackground = registerColor(
  "diffEditor.unchangedRegionBackground",
  "sideBar.background",
  nls.localize("diffEditor.unchangedRegionBackground", "The background color of unchanged blocks in the diff editor.")
);
const diffUnchangedRegionForeground = registerColor(
  "diffEditor.unchangedRegionForeground",
  "foreground",
  nls.localize("diffEditor.unchangedRegionForeground", "The foreground color of unchanged blocks in the diff editor.")
);
const diffUnchangedTextBackground = registerColor(
  "diffEditor.unchangedCodeBackground",
  { dark: "#74747429", light: "#b8b8b829", hcDark: null, hcLight: null },
  nls.localize("diffEditor.unchangedCodeBackground", "The background color of unchanged code in the diff editor.")
);
const widgetShadow = registerColor(
  "widget.shadow",
  { dark: transparent(Color.black, 0.36), light: transparent(Color.black, 0.16), hcDark: null, hcLight: null },
  nls.localize("widgetShadow", "Shadow color of widgets such as find/replace inside the editor.")
);
const widgetBorder = registerColor(
  "widget.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("widgetBorder", "Border color of widgets such as find/replace inside the editor.")
);
const toolbarHoverBackground = registerColor(
  "toolbar.hoverBackground",
  { dark: "#5a5d5e50", light: "#b8b8b850", hcDark: null, hcLight: null },
  nls.localize("toolbarHoverBackground", "Toolbar background when hovering over actions using the mouse")
);
const toolbarHoverOutline = registerColor(
  "toolbar.hoverOutline",
  { dark: null, light: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("toolbarHoverOutline", "Toolbar outline when hovering over actions using the mouse")
);
const toolbarActiveBackground = registerColor(
  "toolbar.activeBackground",
  { dark: lighten(toolbarHoverBackground, 0.1), light: darken(toolbarHoverBackground, 0.1), hcDark: null, hcLight: null },
  nls.localize("toolbarActiveBackground", "Toolbar background when holding the mouse over actions")
);
const breadcrumbsForeground = registerColor(
  "breadcrumb.foreground",
  transparent(foreground, 0.8),
  nls.localize("breadcrumbsFocusForeground", "Color of focused breadcrumb items.")
);
const breadcrumbsBackground = registerColor(
  "breadcrumb.background",
  editorBackground,
  nls.localize("breadcrumbsBackground", "Background color of breadcrumb items.")
);
const breadcrumbsFocusForeground = registerColor(
  "breadcrumb.focusForeground",
  { light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
  nls.localize("breadcrumbsFocusForeground", "Color of focused breadcrumb items.")
);
const breadcrumbsActiveSelectionForeground = registerColor(
  "breadcrumb.activeSelectionForeground",
  { light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
  nls.localize("breadcrumbsSelectedForeground", "Color of selected breadcrumb items.")
);
const breadcrumbsPickerBackground = registerColor(
  "breadcrumbPicker.background",
  editorWidgetBackground,
  nls.localize("breadcrumbsSelectedBackground", "Background color of breadcrumb item picker.")
);
const headerTransparency = 0.5;
const currentBaseColor = Color.fromHex("#40C8AE").transparent(headerTransparency);
const incomingBaseColor = Color.fromHex("#40A6FF").transparent(headerTransparency);
const commonBaseColor = Color.fromHex("#606060").transparent(0.4);
const contentTransparency = 0.4;
const rulerTransparency = 1;
const mergeCurrentHeaderBackground = registerColor(
  "merge.currentHeaderBackground",
  { dark: currentBaseColor, light: currentBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeCurrentHeaderBackground", "Current header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCurrentContentBackground = registerColor(
  "merge.currentContentBackground",
  transparent(mergeCurrentHeaderBackground, contentTransparency),
  nls.localize("mergeCurrentContentBackground", "Current content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeIncomingHeaderBackground = registerColor(
  "merge.incomingHeaderBackground",
  { dark: incomingBaseColor, light: incomingBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeIncomingHeaderBackground", "Incoming header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeIncomingContentBackground = registerColor(
  "merge.incomingContentBackground",
  transparent(mergeIncomingHeaderBackground, contentTransparency),
  nls.localize("mergeIncomingContentBackground", "Incoming content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCommonHeaderBackground = registerColor(
  "merge.commonHeaderBackground",
  { dark: commonBaseColor, light: commonBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeCommonHeaderBackground", "Common ancestor header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCommonContentBackground = registerColor(
  "merge.commonContentBackground",
  transparent(mergeCommonHeaderBackground, contentTransparency),
  nls.localize("mergeCommonContentBackground", "Common ancestor content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeBorder = registerColor(
  "merge.border",
  { dark: null, light: null, hcDark: "#C3DF6F", hcLight: "#007ACC" },
  nls.localize("mergeBorder", "Border color on headers and the splitter in inline merge-conflicts.")
);
const overviewRulerCurrentContentForeground = registerColor(
  "editorOverviewRuler.currentContentForeground",
  { dark: transparent(mergeCurrentHeaderBackground, rulerTransparency), light: transparent(mergeCurrentHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerCurrentContentForeground", "Current overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerIncomingContentForeground = registerColor(
  "editorOverviewRuler.incomingContentForeground",
  { dark: transparent(mergeIncomingHeaderBackground, rulerTransparency), light: transparent(mergeIncomingHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerIncomingContentForeground", "Incoming overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerCommonContentForeground = registerColor(
  "editorOverviewRuler.commonContentForeground",
  { dark: transparent(mergeCommonHeaderBackground, rulerTransparency), light: transparent(mergeCommonHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerCommonContentForeground", "Common ancestor overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerFindMatchForeground = registerColor(
  "editorOverviewRuler.findMatchForeground",
  { dark: "#d186167e", light: "#d186167e", hcDark: "#AB5A00", hcLight: "#AB5A00" },
  nls.localize("overviewRulerFindMatchForeground", "Overview ruler marker color for find matches. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const overviewRulerSelectionHighlightForeground = registerColor(
  "editorOverviewRuler.selectionHighlightForeground",
  "#A0A0A0CC",
  nls.localize("overviewRulerSelectionHighlightForeground", "Overview ruler marker color for selection highlights. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const problemsErrorIconForeground = registerColor(
  "problemsErrorIcon.foreground",
  editorErrorForeground,
  nls.localize("problemsErrorIconForeground", "The color used for the problems error icon.")
);
const problemsWarningIconForeground = registerColor(
  "problemsWarningIcon.foreground",
  editorWarningForeground,
  nls.localize("problemsWarningIconForeground", "The color used for the problems warning icon.")
);
const problemsInfoIconForeground = registerColor(
  "problemsInfoIcon.foreground",
  editorInfoForeground,
  nls.localize("problemsInfoIconForeground", "The color used for the problems info icon.")
);
export {
  breadcrumbsActiveSelectionForeground,
  breadcrumbsBackground,
  breadcrumbsFocusForeground,
  breadcrumbsForeground,
  breadcrumbsPickerBackground,
  defaultInsertColor,
  defaultRemoveColor,
  diffBorder,
  diffDiagonalFill,
  diffInserted,
  diffInsertedLine,
  diffInsertedLineGutter,
  diffInsertedOutline,
  diffOverviewRulerInserted,
  diffOverviewRulerRemoved,
  diffRemoved,
  diffRemovedLine,
  diffRemovedLineGutter,
  diffRemovedOutline,
  diffUnchangedRegionBackground,
  diffUnchangedRegionForeground,
  diffUnchangedTextBackground,
  editorActiveLinkForeground,
  editorBackground,
  editorCompositionBorder,
  editorErrorBackground,
  editorErrorBorder,
  editorErrorForeground,
  editorFindMatch,
  editorFindMatchBorder,
  editorFindMatchForeground,
  editorFindMatchHighlight,
  editorFindMatchHighlightBorder,
  editorFindMatchHighlightForeground,
  editorFindRangeHighlight,
  editorFindRangeHighlightBorder,
  editorForeground,
  editorHintBorder,
  editorHintForeground,
  editorHoverBackground,
  editorHoverBorder,
  editorHoverForeground,
  editorHoverHighlight,
  editorHoverStatusBarBackground,
  editorInactiveSelection,
  editorInfoBackground,
  editorInfoBorder,
  editorInfoForeground,
  editorInlayHintBackground,
  editorInlayHintForeground,
  editorInlayHintParameterBackground,
  editorInlayHintParameterForeground,
  editorInlayHintTypeBackground,
  editorInlayHintTypeForeground,
  editorLightBulbAiForeground,
  editorLightBulbAutoFixForeground,
  editorLightBulbForeground,
  editorSelectionBackground,
  editorSelectionForeground,
  editorSelectionHighlight,
  editorSelectionHighlightBorder,
  editorStickyScrollBackground,
  editorStickyScrollBorder,
  editorStickyScrollGutterBackground,
  editorStickyScrollHoverBackground,
  editorStickyScrollShadow,
  editorWarningBackground,
  editorWarningBorder,
  editorWarningForeground,
  editorWidgetBackground,
  editorWidgetBorder,
  editorWidgetForeground,
  editorWidgetResizeBorder,
  mergeBorder,
  mergeCommonContentBackground,
  mergeCommonHeaderBackground,
  mergeCurrentContentBackground,
  mergeCurrentHeaderBackground,
  mergeIncomingContentBackground,
  mergeIncomingHeaderBackground,
  overviewRulerCommonContentForeground,
  overviewRulerCurrentContentForeground,
  overviewRulerFindMatchForeground,
  overviewRulerIncomingContentForeground,
  overviewRulerSelectionHighlightForeground,
  problemsErrorIconForeground,
  problemsInfoIconForeground,
  problemsWarningIconForeground,
  snippetFinalTabstopHighlightBackground,
  snippetFinalTabstopHighlightBorder,
  snippetTabstopHighlightBackground,
  snippetTabstopHighlightBorder,
  toolbarActiveBackground,
  toolbarHoverBackground,
  toolbarHoverOutline,
  widgetBorder,
  widgetShadow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGhlbWVcXGNvbW1vblxcY29sb3JzXFxlZGl0b3JDb2xvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuLy8gSW1wb3J0IHRoZSBlZmZlY3RzIHdlIG5lZWRcbmltcG9ydCB7IENvbG9yLCBSR0JBIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciwgdHJhbnNwYXJlbnQsIGxlc3NQcm9taW5lbnQsIGRhcmtlbiwgbGlnaHRlbiB9IGZyb20gJy4uL2NvbG9yVXRpbHMuanMnO1xuXG4vLyBJbXBvcnQgdGhlIGNvbG9ycyB3ZSBuZWVkXG5pbXBvcnQgeyBmb3JlZ3JvdW5kLCBjb250cmFzdEJvcmRlciwgYWN0aXZlQ29udHJhc3RCb3JkZXIgfSBmcm9tICcuL2Jhc2VDb2xvcnMuanMnO1xuaW1wb3J0IHsgc2Nyb2xsYmFyU2hhZG93LCBiYWRnZUJhY2tncm91bmQgfSBmcm9tICcuL21pc2NDb2xvcnMuanMnO1xuXG5cbi8vIC0tLS0tIGVkaXRvclxuXG5leHBvcnQgY29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5iYWNrZ3JvdW5kJyxcblx0eyBsaWdodDogJyNmZmZmZmYnLCBkYXJrOiAnIzFFMUUxRScsIGhjRGFyazogQ29sb3IuYmxhY2ssIGhjTGlnaHQ6IENvbG9yLndoaXRlIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yQmFja2dyb3VuZCcsIFwiRWRpdG9yIGJhY2tncm91bmQgY29sb3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZm9yZWdyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjMzMzMzMzJywgZGFyazogJyNCQkJCQkInLCBoY0Rhcms6IENvbG9yLndoaXRlLCBoY0xpZ2h0OiBmb3JlZ3JvdW5kIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yRm9yZWdyb3VuZCcsIFwiRWRpdG9yIGRlZmF1bHQgZm9yZWdyb3VuZCBjb2xvci5cIikpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JTdGlja3lTY3JvbGxCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3RpY2t5U2Nyb2xsLmJhY2tncm91bmQnLFxuXHRlZGl0b3JCYWNrZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclN0aWNreVNjcm9sbEJhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2Ygc3RpY2t5IHNjcm9sbCBpbiB0aGUgZWRpdG9yXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclN0aWNreVNjcm9sbEd1dHRlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdGlja3lTY3JvbGxHdXR0ZXIuYmFja2dyb3VuZCcsXG5cdGVkaXRvckJhY2tncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU3RpY2t5U2Nyb2xsR3V0dGVyQmFja2dyb3VuZCcsIFwiQmFja2dyb3VuZCBjb2xvciBvZiB0aGUgZ3V0dGVyIHBhcnQgb2Ygc3RpY2t5IHNjcm9sbCBpbiB0aGUgZWRpdG9yXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclN0aWNreVNjcm9sbEhvdmVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN0aWNreVNjcm9sbEhvdmVyLmJhY2tncm91bmQnLFxuXHR7IGRhcms6ICcjMkEyRDJFJywgbGlnaHQ6ICcjRjBGMEYwJywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBDb2xvci5mcm9tSGV4KCcjMEY0QTg1JykudHJhbnNwYXJlbnQoMC4xKSB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclN0aWNreVNjcm9sbEhvdmVyQmFja2dyb3VuZCcsIFwiQmFja2dyb3VuZCBjb2xvciBvZiBzdGlja3kgc2Nyb2xsIG9uIGhvdmVyIGluIHRoZSBlZGl0b3JcIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yU3RpY2t5U2Nyb2xsQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3RpY2t5U2Nyb2xsLmJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogY29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU3RpY2t5U2Nyb2xsQm9yZGVyJywgXCJCb3JkZXIgY29sb3Igb2Ygc3RpY2t5IHNjcm9sbCBpbiB0aGUgZWRpdG9yXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclN0aWNreVNjcm9sbFNoYWRvdyA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN0aWNreVNjcm9sbC5zaGFkb3cnLFxuXHRzY3JvbGxiYXJTaGFkb3csXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU3RpY2t5U2Nyb2xsU2hhZG93JywgXCIgU2hhZG93IGNvbG9yIG9mIHN0aWNreSBzY3JvbGwgaW4gdGhlIGVkaXRvclwiKSk7XG5cblxuZXhwb3J0IGNvbnN0IGVkaXRvcldpZGdldEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JXaWRnZXQuYmFja2dyb3VuZCcsXG5cdHsgZGFyazogJyMyNTI1MjYnLCBsaWdodDogJyNGM0YzRjMnLCBoY0Rhcms6ICcjMEMxNDFGJywgaGNMaWdodDogQ29sb3Iud2hpdGUgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2YgZWRpdG9yIHdpZGdldHMsIHN1Y2ggYXMgZmluZC9yZXBsYWNlLicpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcldpZGdldEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JXaWRnZXQuZm9yZWdyb3VuZCcsXG5cdGZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2lkZ2V0Rm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIGVkaXRvciB3aWRnZXRzLCBzdWNoIGFzIGZpbmQvcmVwbGFjZS4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXaWRnZXRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JXaWRnZXQuYm9yZGVyJyxcblx0eyBkYXJrOiB0cmFuc3BhcmVudChlZGl0b3JXaWRnZXRGb3JlZ3JvdW5kLCAwLjIpLCBsaWdodDogdHJhbnNwYXJlbnQoZWRpdG9yV2lkZ2V0Rm9yZWdyb3VuZCwgMC4yKSwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JXaWRnZXRCb3JkZXInLCAnQm9yZGVyIGNvbG9yIG9mIGVkaXRvciB3aWRnZXRzLiBUaGUgY29sb3IgaXMgb25seSB1c2VkIGlmIHRoZSB3aWRnZXQgY2hvb3NlcyB0byBoYXZlIGEgYm9yZGVyIGFuZCBpZiB0aGUgY29sb3IgaXMgbm90IG92ZXJyaWRkZW4gYnkgYSB3aWRnZXQuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yV2lkZ2V0UmVzaXplQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2lkZ2V0LnJlc2l6ZUJvcmRlcicsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2lkZ2V0UmVzaXplQm9yZGVyJywgXCJCb3JkZXIgY29sb3Igb2YgdGhlIHJlc2l6ZSBiYXIgb2YgZWRpdG9yIHdpZGdldHMuIFRoZSBjb2xvciBpcyBvbmx5IHVzZWQgaWYgdGhlIHdpZGdldCBjaG9vc2VzIHRvIGhhdmUgYSByZXNpemUgYm9yZGVyIGFuZCBpZiB0aGUgY29sb3IgaXMgbm90IG92ZXJyaWRkZW4gYnkgYSB3aWRnZXQuXCIpKTtcblxuXG5leHBvcnQgY29uc3QgZWRpdG9yRXJyb3JCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yRXJyb3IuYmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yRXJyb3IuYmFja2dyb3VuZCcsICdCYWNrZ3JvdW5kIGNvbG9yIG9mIGVycm9yIHRleHQgaW4gdGhlIGVkaXRvci4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckVycm9yRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckVycm9yLmZvcmVncm91bmQnLFxuXHR7IGRhcms6ICcjRjE0QzRDJywgbGlnaHQ6ICcjRTUxNDAwJywgaGNEYXJrOiAnI0Y0ODc3MScsIGhjTGlnaHQ6ICcjQjUyMDBEJyB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckVycm9yLmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiBlcnJvciBzcXVpZ2dsaWVzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRXJyb3JCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JFcnJvci5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IENvbG9yLmZyb21IZXgoJyNFNDc3NzcnKS50cmFuc3BhcmVudCgwLjgpLCBoY0xpZ2h0OiAnI0I1MjAwRCcgfSxcblx0bmxzLmxvY2FsaXplKCdlcnJvckJvcmRlcicsICdJZiBzZXQsIGNvbG9yIG9mIGRvdWJsZSB1bmRlcmxpbmVzIGZvciBlcnJvcnMgaW4gdGhlIGVkaXRvci4nKSk7XG5cblxuZXhwb3J0IGNvbnN0IGVkaXRvcldhcm5pbmdCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2FybmluZy5iYWNrZ3JvdW5kJyxcblx0bnVsbCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JXYXJuaW5nLmJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiB3YXJuaW5nIHRleHQgaW4gdGhlIGVkaXRvci4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2FybmluZy5mb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiAnI0NDQTcwMCcsIGxpZ2h0OiAnI0JGODgwMycsIGhjRGFyazogJyNGRkQzNzAnLCBoY0xpZ2h0OiAnIzg5NTUwMycgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JXYXJuaW5nLmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiB3YXJuaW5nIHNxdWlnZ2xpZXMgaW4gdGhlIGVkaXRvci4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXYXJuaW5nQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2FybmluZy5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IENvbG9yLmZyb21IZXgoJyNGRkNDMDAnKS50cmFuc3BhcmVudCgwLjgpLCBoY0xpZ2h0OiBDb2xvci5mcm9tSGV4KCcjRkZDQzAwJykudHJhbnNwYXJlbnQoMC44KSB9LFxuXHRubHMubG9jYWxpemUoJ3dhcm5pbmdCb3JkZXInLCAnSWYgc2V0LCBjb2xvciBvZiBkb3VibGUgdW5kZXJsaW5lcyBmb3Igd2FybmluZ3MgaW4gdGhlIGVkaXRvci4nKSk7XG5cblxuZXhwb3J0IGNvbnN0IGVkaXRvckluZm9CYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySW5mby5iYWNrZ3JvdW5kJyxcblx0bnVsbCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmZvLmJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiBpbmZvIHRleHQgaW4gdGhlIGVkaXRvci4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckluZm9Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySW5mby5mb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzU5YTRmOScsIGxpZ2h0OiAnIzAwNjNkMycsIGhjRGFyazogJyM1OWE0ZjknLCBoY0xpZ2h0OiAnIzAwNjNkMycgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmZvLmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiBpbmZvIHNxdWlnZ2xpZXMgaW4gdGhlIGVkaXRvci4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmZvQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySW5mby5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IENvbG9yLmZyb21IZXgoJyM1OWE0ZjknKS50cmFuc3BhcmVudCgwLjgpLCBoY0xpZ2h0OiAnIzI5MjkyOScgfSxcblx0bmxzLmxvY2FsaXplKCdpbmZvQm9yZGVyJywgJ0lmIHNldCwgY29sb3Igb2YgZG91YmxlIHVuZGVybGluZXMgZm9yIGluZm9zIGluIHRoZSBlZGl0b3IuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIaW50Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckhpbnQuZm9yZWdyb3VuZCcsXG5cdHsgZGFyazogQ29sb3IuZnJvbUhleCgnI2VlZWVlZScpLnRyYW5zcGFyZW50KDAuNyksIGxpZ2h0OiAnIzZjNmM2YycsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckhpbnQuZm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIGhpbnQgc3F1aWdnbGllcyBpbiB0aGUgZWRpdG9yLicpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckhpbnRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JIaW50LmJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogQ29sb3IuZnJvbUhleCgnI2VlZWVlZScpLnRyYW5zcGFyZW50KDAuOCksIGhjTGlnaHQ6ICcjMjkyOTI5JyB9LFxuXHRubHMubG9jYWxpemUoJ2hpbnRCb3JkZXInLCAnSWYgc2V0LCBjb2xvciBvZiBkb3VibGUgdW5kZXJsaW5lcyBmb3IgaGludHMgaW4gdGhlIGVkaXRvci4nKSk7XG5cblxuZXhwb3J0IGNvbnN0IGVkaXRvckFjdGl2ZUxpbmtGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTGluay5hY3RpdmVGb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzRFOTRDRScsIGxpZ2h0OiBDb2xvci5ibHVlLCBoY0Rhcms6IENvbG9yLmN5YW4sIGhjTGlnaHQ6ICcjMjkyOTI5JyB9LFxuXHRubHMubG9jYWxpemUoJ2FjdGl2ZUxpbmtGb3JlZ3JvdW5kJywgJ0NvbG9yIG9mIGFjdGl2ZSBsaW5rcy4nKSk7XG5cblxuLy8gLS0tLS0gZWRpdG9yIHNlbGVjdGlvblxuXG5leHBvcnQgY29uc3QgZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zZWxlY3Rpb25CYWNrZ3JvdW5kJyxcblx0eyBsaWdodDogJyNBREQ2RkYnLCBkYXJrOiAnIzI2NEY3OCcsIGhjRGFyazogJyNmM2Y1MTgnLCBoY0xpZ2h0OiAnIzBGNEE4NScgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kJywgXCJDb2xvciBvZiB0aGUgZWRpdG9yIHNlbGVjdGlvbi5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zZWxlY3Rpb25Gb3JlZ3JvdW5kJyxcblx0eyBsaWdodDogbnVsbCwgZGFyazogbnVsbCwgaGNEYXJrOiAnIzAwMDAwMCcsIGhjTGlnaHQ6IENvbG9yLndoaXRlIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZCcsIFwiQ29sb3Igb2YgdGhlIHNlbGVjdGVkIHRleHQgZm9yIGhpZ2ggY29udHJhc3QuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckluYWN0aXZlU2VsZWN0aW9uID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6IHRyYW5zcGFyZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIDAuNSksIGRhcms6IHRyYW5zcGFyZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIDAuNSksIGhjRGFyazogdHJhbnNwYXJlbnQoZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCwgMC43KSwgaGNMaWdodDogdHJhbnNwYXJlbnQoZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCwgMC41KSB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckluYWN0aXZlU2VsZWN0aW9uJywgXCJDb2xvciBvZiB0aGUgc2VsZWN0aW9uIGluIGFuIGluYWN0aXZlIGVkaXRvci4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLlwiKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JTZWxlY3Rpb25IaWdobGlnaHQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc2VsZWN0aW9uSGlnaGxpZ2h0QmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6IGxlc3NQcm9taW5lbnQoZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCwgZWRpdG9yQmFja2dyb3VuZCwgMC4zLCAwLjYpLCBkYXJrOiBsZXNzUHJvbWluZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIGVkaXRvckJhY2tncm91bmQsIDAuMywgMC42KSwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU2VsZWN0aW9uSGlnaGxpZ2h0JywgJ0NvbG9yIGZvciByZWdpb25zIHdpdGggdGhlIHNhbWUgY29udGVudCBhcyB0aGUgc2VsZWN0aW9uLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yU2VsZWN0aW9uSGlnaGxpZ2h0Qm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodEJvcmRlcicsXG5cdHsgbGlnaHQ6IG51bGwsIGRhcms6IG51bGwsIGhjRGFyazogYWN0aXZlQ29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU2VsZWN0aW9uSGlnaGxpZ2h0Qm9yZGVyJywgXCJCb3JkZXIgY29sb3IgZm9yIHJlZ2lvbnMgd2l0aCB0aGUgc2FtZSBjb250ZW50IGFzIHRoZSBzZWxlY3Rpb24uXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckNvbXBvc2l0aW9uQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmNvbXBvc2l0aW9uQm9yZGVyJyxcblx0eyBsaWdodDogJyMwMDAwMDAnLCBkYXJrOiAnI2ZmZmZmZicsIGhjTGlnaHQ6ICcjMDAwMDAwJywgaGNEYXJrOiAnI2ZmZmZmZicgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JDb21wb3NpdGlvbkJvcmRlcicsIFwiVGhlIGJvcmRlciBjb2xvciBmb3IgYW4gSU1FIGNvbXBvc2l0aW9uLlwiKSk7XG5cblxuLy8gLS0tLS0gZWRpdG9yIGZpbmRcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZpbmRNYXRjaCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kTWF0Y2hCYWNrZ3JvdW5kJyxcblx0eyBsaWdodDogJyNBOEFDOTQnLCBkYXJrOiAnIzUxNUM2QScsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckZpbmRNYXRjaCcsIFwiQ29sb3Igb2YgdGhlIGN1cnJlbnQgc2VhcmNoIG1hdGNoLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGaW5kTWF0Y2hGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZpbmRNYXRjaEZvcmVncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckZpbmRNYXRjaEZvcmVncm91bmQnLCBcIlRleHQgY29sb3Igb2YgdGhlIGN1cnJlbnQgc2VhcmNoIG1hdGNoLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZmluZE1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjRUE1QzAwNTUnLCBkYXJrOiAnI0VBNUMwMDU1JywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnZmluZE1hdGNoSGlnaGxpZ2h0JywgXCJDb2xvciBvZiB0aGUgb3RoZXIgc2VhcmNoIG1hdGNoZXMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy5cIiksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kJyxcblx0bnVsbCxcblx0bmxzLmxvY2FsaXplKCdmaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kJywgXCJGb3JlZ3JvdW5kIGNvbG9yIG9mIHRoZSBvdGhlciBzZWFyY2ggbWF0Y2hlcy5cIiksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZFJhbmdlSGlnaGxpZ2h0ID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZpbmRSYW5nZUhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHR7IGRhcms6ICcjM2EzZDQxNjYnLCBsaWdodDogJyNiNGI0YjQ0ZCcsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2ZpbmRSYW5nZUhpZ2hsaWdodCcsIFwiQ29sb3Igb2YgdGhlIHJhbmdlIGxpbWl0aW5nIHRoZSBzZWFyY2guIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy5cIiksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZE1hdGNoQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZpbmRNYXRjaEJvcmRlcicsXG5cdHsgbGlnaHQ6IG51bGwsIGRhcms6IG51bGwsIGhjRGFyazogYWN0aXZlQ29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yRmluZE1hdGNoQm9yZGVyJywgXCJCb3JkZXIgY29sb3Igb2YgdGhlIGN1cnJlbnQgc2VhcmNoIG1hdGNoLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyJyxcblx0eyBsaWdodDogbnVsbCwgZGFyazogbnVsbCwgaGNEYXJrOiBhY3RpdmVDb250cmFzdEJvcmRlciwgaGNMaWdodDogYWN0aXZlQ29udHJhc3RCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCdmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXInLCBcIkJvcmRlciBjb2xvciBvZiB0aGUgb3RoZXIgc2VhcmNoIG1hdGNoZXMuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZpbmRSYW5nZUhpZ2hsaWdodEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kUmFuZ2VIaWdobGlnaHRCb3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IHRyYW5zcGFyZW50KGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCAwLjQpLCBoY0xpZ2h0OiB0cmFuc3BhcmVudChhY3RpdmVDb250cmFzdEJvcmRlciwgMC40KSB9LFxuXHRubHMubG9jYWxpemUoJ2ZpbmRSYW5nZUhpZ2hsaWdodEJvcmRlcicsIFwiQm9yZGVyIGNvbG9yIG9mIHRoZSByYW5nZSBsaW1pdGluZyB0aGUgc2VhcmNoLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuXCIpLCB0cnVlKTtcblxuXG4vLyAtLS0tLSBlZGl0b3IgaG92ZXJcblxuZXhwb3J0IGNvbnN0IGVkaXRvckhvdmVySGlnaGxpZ2h0ID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmhvdmVySGlnaGxpZ2h0QmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjQURENkZGMjYnLCBkYXJrOiAnIzI2NGY3ODQwJywgaGNEYXJrOiAnI0FERDZGRjI2JywgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2hvdmVySGlnaGxpZ2h0JywgJ0hpZ2hsaWdodCBiZWxvdyB0aGUgd29yZCBmb3Igd2hpY2ggYSBob3ZlciBpcyBzaG93bi4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckhvdmVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckhvdmVyV2lkZ2V0LmJhY2tncm91bmQnLFxuXHRlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2hvdmVyQmFja2dyb3VuZCcsICdCYWNrZ3JvdW5kIGNvbG9yIG9mIHRoZSBlZGl0b3IgaG92ZXIuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySG92ZXJGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySG92ZXJXaWRnZXQuZm9yZWdyb3VuZCcsXG5cdGVkaXRvcldpZGdldEZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnaG92ZXJGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgdGhlIGVkaXRvciBob3Zlci4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIb3ZlckJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckhvdmVyV2lkZ2V0LmJvcmRlcicsXG5cdGVkaXRvcldpZGdldEJvcmRlcixcblx0bmxzLmxvY2FsaXplKCdob3ZlckJvcmRlcicsICdCb3JkZXIgY29sb3Igb2YgdGhlIGVkaXRvciBob3Zlci4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIb3ZlclN0YXR1c0JhckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JIb3ZlcldpZGdldC5zdGF0dXNCYXJCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBsaWdodGVuKGVkaXRvckhvdmVyQmFja2dyb3VuZCwgMC4yKSwgbGlnaHQ6IGRhcmtlbihlZGl0b3JIb3ZlckJhY2tncm91bmQsIDAuMDUpLCBoY0Rhcms6IGVkaXRvcldpZGdldEJhY2tncm91bmQsIGhjTGlnaHQ6IGVkaXRvcldpZGdldEJhY2tncm91bmQgfSxcblx0bmxzLmxvY2FsaXplKCdzdGF0dXNCYXJCYWNrZ3JvdW5kJywgXCJCYWNrZ3JvdW5kIGNvbG9yIG9mIHRoZSBlZGl0b3IgaG92ZXIgc3RhdHVzIGJhci5cIikpO1xuXG5cbi8vIC0tLS0tIGVkaXRvciBpbmxheSBoaW50XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmxheUhpbnRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySW5sYXlIaW50LmZvcmVncm91bmQnLFxuXHR7IGRhcms6ICcjOTY5Njk2JywgbGlnaHQ6ICcjOTY5Njk2JywgaGNEYXJrOiBDb2xvci53aGl0ZSwgaGNMaWdodDogQ29sb3IuYmxhY2sgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmxheUhpbnRGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC5iYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiB0cmFuc3BhcmVudChiYWRnZUJhY2tncm91bmQsIC4xMCksIGxpZ2h0OiB0cmFuc3BhcmVudChiYWRnZUJhY2tncm91bmQsIC4xMCksIGhjRGFyazogdHJhbnNwYXJlbnQoQ29sb3Iud2hpdGUsIC4xMCksIGhjTGlnaHQ6IHRyYW5zcGFyZW50KGJhZGdlQmFja2dyb3VuZCwgLjEwKSB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvcklubGF5SGludEJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiBpbmxpbmUgaGludHMnKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmxheUhpbnRUeXBlRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC50eXBlRm9yZWdyb3VuZCcsXG5cdGVkaXRvcklubGF5SGludEZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5sYXlIaW50Rm9yZWdyb3VuZFR5cGVzJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzIGZvciB0eXBlcycpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcklubGF5SGludFR5cGVCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySW5sYXlIaW50LnR5cGVCYWNrZ3JvdW5kJyxcblx0ZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmxheUhpbnRCYWNrZ3JvdW5kVHlwZXMnLCAnQmFja2dyb3VuZCBjb2xvciBvZiBpbmxpbmUgaGludHMgZm9yIHR5cGVzJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5sYXlIaW50UGFyYW1ldGVyRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC5wYXJhbWV0ZXJGb3JlZ3JvdW5kJyxcblx0ZWRpdG9ySW5sYXlIaW50Rm9yZWdyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmxheUhpbnRGb3JlZ3JvdW5kUGFyYW1ldGVyJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzIGZvciBwYXJhbWV0ZXJzJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5sYXlIaW50UGFyYW1ldGVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC5wYXJhbWV0ZXJCYWNrZ3JvdW5kJyxcblx0ZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmxheUhpbnRCYWNrZ3JvdW5kUGFyYW1ldGVyJywgJ0JhY2tncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzIGZvciBwYXJhbWV0ZXJzJykpO1xuXG5cbi8vIC0tLS0tIGVkaXRvciBsaWdodGJ1bGJcblxuZXhwb3J0IGNvbnN0IGVkaXRvckxpZ2h0QnVsYkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JMaWdodEJ1bGIuZm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyNGRkNDMDAnLCBsaWdodDogJyNEREIxMDAnLCBoY0Rhcms6ICcjRkZDQzAwJywgaGNMaWdodDogJyMwMDdBQ0MnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yTGlnaHRCdWxiRm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIHVzZWQgZm9yIHRoZSBsaWdodGJ1bGIgYWN0aW9ucyBpY29uLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JMaWdodEJ1bGJBdXRvRml4Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckxpZ2h0QnVsYkF1dG9GaXguZm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyM3NUJFRkYnLCBsaWdodDogJyMwMDdBQ0MnLCBoY0Rhcms6ICcjNzVCRUZGJywgaGNMaWdodDogJyMwMDdBQ0MnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yTGlnaHRCdWxiQXV0b0ZpeEZvcmVncm91bmQnLCBcIlRoZSBjb2xvciB1c2VkIGZvciB0aGUgbGlnaHRidWxiIGF1dG8gZml4IGFjdGlvbnMgaWNvbi5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yTGlnaHRCdWxiQWlGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTGlnaHRCdWxiQWkuZm9yZWdyb3VuZCcsXG5cdGVkaXRvckxpZ2h0QnVsYkZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yTGlnaHRCdWxiQWlGb3JlZ3JvdW5kJywgXCJUaGUgY29sb3IgdXNlZCBmb3IgdGhlIGxpZ2h0YnVsYiBBSSBpY29uLlwiKSk7XG5cblxuLy8gLS0tLS0gZWRpdG9yIHNuaXBwZXRcblxuZXhwb3J0IGNvbnN0IHNuaXBwZXRUYWJzdG9wSGlnaGxpZ2h0QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zbmlwcGV0VGFic3RvcEhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHR7IGRhcms6IG5ldyBDb2xvcihuZXcgUkdCQSgxMjQsIDEyNCwgMTI0LCAwLjMpKSwgbGlnaHQ6IG5ldyBDb2xvcihuZXcgUkdCQSgxMCwgNTAsIDEwMCwgMC4yKSksIGhjRGFyazogbmV3IENvbG9yKG5ldyBSR0JBKDEyNCwgMTI0LCAxMjQsIDAuMykpLCBoY0xpZ2h0OiBuZXcgQ29sb3IobmV3IFJHQkEoMTAsIDUwLCAxMDAsIDAuMikpIH0sXG5cdG5scy5sb2NhbGl6ZSgnc25pcHBldFRhYnN0b3BIaWdobGlnaHRCYWNrZ3JvdW5kJywgXCJIaWdobGlnaHQgYmFja2dyb3VuZCBjb2xvciBvZiBhIHNuaXBwZXQgdGFic3RvcC5cIikpO1xuXG5leHBvcnQgY29uc3Qgc25pcHBldFRhYnN0b3BIaWdobGlnaHRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc25pcHBldFRhYnN0b3BIaWdobGlnaHRCb3JkZXInLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ3NuaXBwZXRUYWJzdG9wSGlnaGxpZ2h0Qm9yZGVyJywgXCJIaWdobGlnaHQgYm9yZGVyIGNvbG9yIG9mIGEgc25pcHBldCB0YWJzdG9wLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBzbmlwcGV0RmluYWxUYWJzdG9wSGlnaGxpZ2h0QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zbmlwcGV0RmluYWxUYWJzdG9wSGlnaGxpZ2h0QmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJhY2tncm91bmQnLCBcIkhpZ2hsaWdodCBiYWNrZ3JvdW5kIGNvbG9yIG9mIHRoZSBmaW5hbCB0YWJzdG9wIG9mIGEgc25pcHBldC5cIikpO1xuXG5leHBvcnQgY29uc3Qgc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zbmlwcGV0RmluYWxUYWJzdG9wSGlnaGxpZ2h0Qm9yZGVyJyxcblx0eyBkYXJrOiAnIzUyNTI1MicsIGxpZ2h0OiBuZXcgQ29sb3IobmV3IFJHQkEoMTAsIDUwLCAxMDAsIDAuNSkpLCBoY0Rhcms6ICcjNTI1MjUyJywgaGNMaWdodDogJyMyOTI5MjknIH0sXG5cdG5scy5sb2NhbGl6ZSgnc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJvcmRlcicsIFwiSGlnaGxpZ2h0IGJvcmRlciBjb2xvciBvZiB0aGUgZmluYWwgdGFic3RvcCBvZiBhIHNuaXBwZXQuXCIpKTtcblxuXG4vLyAtLS0tLSBkaWZmIGVkaXRvclxuXG5leHBvcnQgY29uc3QgZGVmYXVsdEluc2VydENvbG9yID0gbmV3IENvbG9yKG5ldyBSR0JBKDE1NSwgMTg1LCA4NSwgLjIpKTtcbmV4cG9ydCBjb25zdCBkZWZhdWx0UmVtb3ZlQ29sb3IgPSBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAwLCAwLCAuMikpO1xuXG5leHBvcnQgY29uc3QgZGlmZkluc2VydGVkID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci5pbnNlcnRlZFRleHRCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzljY2MyYzMzJywgbGlnaHQ6ICcjOWNjYzJjNDAnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9ySW5zZXJ0ZWQnLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgdGV4dCB0aGF0IGdvdCBpbnNlcnRlZC4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZSZW1vdmVkID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci5yZW1vdmVkVGV4dEJhY2tncm91bmQnLFxuXHR7IGRhcms6ICcjZmYwMDAwMzMnLCBsaWdodDogJyNmZjAwMDAzMycsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JSZW1vdmVkJywgJ0JhY2tncm91bmQgY29sb3IgZm9yIHRleHQgdGhhdCBnb3QgcmVtb3ZlZC4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuXG5leHBvcnQgY29uc3QgZGlmZkluc2VydGVkTGluZSA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IuaW5zZXJ0ZWRMaW5lQmFja2dyb3VuZCcsXG5cdHsgZGFyazogZGVmYXVsdEluc2VydENvbG9yLCBsaWdodDogZGVmYXVsdEluc2VydENvbG9yLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9ySW5zZXJ0ZWRMaW5lcycsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciBsaW5lcyB0aGF0IGdvdCBpbnNlcnRlZC4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZSZW1vdmVkTGluZSA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IucmVtb3ZlZExpbmVCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBkZWZhdWx0UmVtb3ZlQ29sb3IsIGxpZ2h0OiBkZWZhdWx0UmVtb3ZlQ29sb3IsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JSZW1vdmVkTGluZXMnLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgbGluZXMgdGhhdCBnb3QgcmVtb3ZlZC4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuXG5leHBvcnQgY29uc3QgZGlmZkluc2VydGVkTGluZUd1dHRlciA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3JHdXR0ZXIuaW5zZXJ0ZWRMaW5lQmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvckluc2VydGVkTGluZUd1dHRlcicsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgbWFyZ2luIHdoZXJlIGxpbmVzIGdvdCBpbnNlcnRlZC4nKSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmUmVtb3ZlZExpbmVHdXR0ZXIgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yR3V0dGVyLnJlbW92ZWRMaW5lQmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvclJlbW92ZWRMaW5lR3V0dGVyJywgJ0JhY2tncm91bmQgY29sb3IgZm9yIHRoZSBtYXJnaW4gd2hlcmUgbGluZXMgZ290IHJlbW92ZWQuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBkaWZmT3ZlcnZpZXdSdWxlckluc2VydGVkID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvck92ZXJ2aWV3Lmluc2VydGVkRm9yZWdyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvck92ZXJ2aWV3SW5zZXJ0ZWQnLCAnRGlmZiBvdmVydmlldyBydWxlciBmb3JlZ3JvdW5kIGZvciBpbnNlcnRlZCBjb250ZW50LicpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZPdmVydmlld1J1bGVyUmVtb3ZlZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3JPdmVydmlldy5yZW1vdmVkRm9yZWdyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvck92ZXJ2aWV3UmVtb3ZlZCcsICdEaWZmIG92ZXJ2aWV3IHJ1bGVyIGZvcmVncm91bmQgZm9yIHJlbW92ZWQgY29udGVudC4nKSk7XG5cblxuZXhwb3J0IGNvbnN0IGRpZmZJbnNlcnRlZE91dGxpbmUgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLmluc2VydGVkVGV4dEJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogJyMzM2ZmMmVmZicsIGhjTGlnaHQ6ICcjMzc0RTA2JyB9LFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JJbnNlcnRlZE91dGxpbmUnLCAnT3V0bGluZSBjb2xvciBmb3IgdGhlIHRleHQgdGhhdCBnb3QgaW5zZXJ0ZWQuJykpO1xuXG5leHBvcnQgY29uc3QgZGlmZlJlbW92ZWRPdXRsaW5lID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci5yZW1vdmVkVGV4dEJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogJyNGRjAwOEYnLCBoY0xpZ2h0OiAnI0FEMDcwNycgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yUmVtb3ZlZE91dGxpbmUnLCAnT3V0bGluZSBjb2xvciBmb3IgdGV4dCB0aGF0IGdvdCByZW1vdmVkLicpKTtcblxuXG5leHBvcnQgY29uc3QgZGlmZkJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IuYm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yQm9yZGVyJywgJ0JvcmRlciBjb2xvciBiZXR3ZWVuIHRoZSB0d28gdGV4dCBlZGl0b3JzLicpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZEaWFnb25hbEZpbGwgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLmRpYWdvbmFsRmlsbCcsXG5cdHsgZGFyazogJyNjY2NjY2MzMycsIGxpZ2h0OiAnIzIyMjIyMjMzJywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkRpYWdvbmFsRmlsbCcsIFwiQ29sb3Igb2YgdGhlIGRpZmYgZWRpdG9yJ3MgZGlhZ29uYWwgZmlsbC4gVGhlIGRpYWdvbmFsIGZpbGwgaXMgdXNlZCBpbiBzaWRlLWJ5LXNpZGUgZGlmZiB2aWV3cy5cIikpO1xuXG5cbmV4cG9ydCBjb25zdCBkaWZmVW5jaGFuZ2VkUmVnaW9uQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkUmVnaW9uQmFja2dyb3VuZCcsXG5cdCdzaWRlQmFyLmJhY2tncm91bmQnLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkUmVnaW9uQmFja2dyb3VuZCcsIFwiVGhlIGJhY2tncm91bmQgY29sb3Igb2YgdW5jaGFuZ2VkIGJsb2NrcyBpbiB0aGUgZGlmZiBlZGl0b3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZVbmNoYW5nZWRSZWdpb25Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci51bmNoYW5nZWRSZWdpb25Gb3JlZ3JvdW5kJyxcblx0J2ZvcmVncm91bmQnLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkUmVnaW9uRm9yZWdyb3VuZCcsIFwiVGhlIGZvcmVncm91bmQgY29sb3Igb2YgdW5jaGFuZ2VkIGJsb2NrcyBpbiB0aGUgZGlmZiBlZGl0b3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZVbmNoYW5nZWRUZXh0QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkQ29kZUJhY2tncm91bmQnLFxuXHR7IGRhcms6ICcjNzQ3NDc0MjknLCBsaWdodDogJyNiOGI4YjgyOScsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkQ29kZUJhY2tncm91bmQnLCBcIlRoZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIHVuY2hhbmdlZCBjb2RlIGluIHRoZSBkaWZmIGVkaXRvci5cIikpO1xuXG5cbi8vIC0tLS0tIHdpZGdldFxuXG5leHBvcnQgY29uc3Qgd2lkZ2V0U2hhZG93ID0gcmVnaXN0ZXJDb2xvcignd2lkZ2V0LnNoYWRvdycsXG5cdHsgZGFyazogdHJhbnNwYXJlbnQoQ29sb3IuYmxhY2ssIC4zNiksIGxpZ2h0OiB0cmFuc3BhcmVudChDb2xvci5ibGFjaywgLjE2KSwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnd2lkZ2V0U2hhZG93JywgJ1NoYWRvdyBjb2xvciBvZiB3aWRnZXRzIHN1Y2ggYXMgZmluZC9yZXBsYWNlIGluc2lkZSB0aGUgZWRpdG9yLicpKTtcblxuZXhwb3J0IGNvbnN0IHdpZGdldEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ3dpZGdldC5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBjb250cmFzdEJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ3dpZGdldEJvcmRlcicsICdCb3JkZXIgY29sb3Igb2Ygd2lkZ2V0cyBzdWNoIGFzIGZpbmQvcmVwbGFjZSBpbnNpZGUgdGhlIGVkaXRvci4nKSk7XG5cblxuLy8gLS0tLS0gdG9vbGJhclxuXG5leHBvcnQgY29uc3QgdG9vbGJhckhvdmVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ3Rvb2xiYXIuaG92ZXJCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzVhNWQ1ZTUwJywgbGlnaHQ6ICcjYjhiOGI4NTAnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCd0b29sYmFySG92ZXJCYWNrZ3JvdW5kJywgXCJUb29sYmFyIGJhY2tncm91bmQgd2hlbiBob3ZlcmluZyBvdmVyIGFjdGlvbnMgdXNpbmcgdGhlIG1vdXNlXCIpKTtcblxuZXhwb3J0IGNvbnN0IHRvb2xiYXJIb3Zlck91dGxpbmUgPSByZWdpc3RlckNvbG9yKCd0b29sYmFyLmhvdmVyT3V0bGluZScsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogYWN0aXZlQ29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgndG9vbGJhckhvdmVyT3V0bGluZScsIFwiVG9vbGJhciBvdXRsaW5lIHdoZW4gaG92ZXJpbmcgb3ZlciBhY3Rpb25zIHVzaW5nIHRoZSBtb3VzZVwiKSk7XG5cbmV4cG9ydCBjb25zdCB0b29sYmFyQWN0aXZlQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ3Rvb2xiYXIuYWN0aXZlQmFja2dyb3VuZCcsXG5cdHsgZGFyazogbGlnaHRlbih0b29sYmFySG92ZXJCYWNrZ3JvdW5kLCAwLjEpLCBsaWdodDogZGFya2VuKHRvb2xiYXJIb3ZlckJhY2tncm91bmQsIDAuMSksIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ3Rvb2xiYXJBY3RpdmVCYWNrZ3JvdW5kJywgXCJUb29sYmFyIGJhY2tncm91bmQgd2hlbiBob2xkaW5nIHRoZSBtb3VzZSBvdmVyIGFjdGlvbnNcIikpO1xuXG5cbi8vIC0tLS0tIGJyZWFkY3VtYnNcblxuZXhwb3J0IGNvbnN0IGJyZWFkY3J1bWJzRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2JyZWFkY3J1bWIuZm9yZWdyb3VuZCcsXG5cdHRyYW5zcGFyZW50KGZvcmVncm91bmQsIDAuOCksXG5cdG5scy5sb2NhbGl6ZSgnYnJlYWRjcnVtYnNGb2N1c0ZvcmVncm91bmQnLCBcIkNvbG9yIG9mIGZvY3VzZWQgYnJlYWRjcnVtYiBpdGVtcy5cIikpO1xuXG5leHBvcnQgY29uc3QgYnJlYWRjcnVtYnNCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignYnJlYWRjcnVtYi5iYWNrZ3JvdW5kJyxcblx0ZWRpdG9yQmFja2dyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdicmVhZGNydW1ic0JhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2YgYnJlYWRjcnVtYiBpdGVtcy5cIikpO1xuXG5leHBvcnQgY29uc3QgYnJlYWRjcnVtYnNGb2N1c0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdicmVhZGNydW1iLmZvY3VzRm9yZWdyb3VuZCcsXG5cdHsgbGlnaHQ6IGRhcmtlbihmb3JlZ3JvdW5kLCAwLjIpLCBkYXJrOiBsaWdodGVuKGZvcmVncm91bmQsIDAuMSksIGhjRGFyazogbGlnaHRlbihmb3JlZ3JvdW5kLCAwLjEpLCBoY0xpZ2h0OiBsaWdodGVuKGZvcmVncm91bmQsIDAuMSkgfSxcblx0bmxzLmxvY2FsaXplKCdicmVhZGNydW1ic0ZvY3VzRm9yZWdyb3VuZCcsIFwiQ29sb3Igb2YgZm9jdXNlZCBicmVhZGNydW1iIGl0ZW1zLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBicmVhZGNydW1ic0FjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdicmVhZGNydW1iLmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQnLFxuXHR7IGxpZ2h0OiBkYXJrZW4oZm9yZWdyb3VuZCwgMC4yKSwgZGFyazogbGlnaHRlbihmb3JlZ3JvdW5kLCAwLjEpLCBoY0Rhcms6IGxpZ2h0ZW4oZm9yZWdyb3VuZCwgMC4xKSwgaGNMaWdodDogbGlnaHRlbihmb3JlZ3JvdW5kLCAwLjEpIH0sXG5cdG5scy5sb2NhbGl6ZSgnYnJlYWRjcnVtYnNTZWxlY3RlZEZvcmVncm91bmQnLCBcIkNvbG9yIG9mIHNlbGVjdGVkIGJyZWFkY3J1bWIgaXRlbXMuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGJyZWFkY3J1bWJzUGlja2VyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2JyZWFkY3J1bWJQaWNrZXIuYmFja2dyb3VuZCcsXG5cdGVkaXRvcldpZGdldEJhY2tncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnYnJlYWRjcnVtYnNTZWxlY3RlZEJhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2YgYnJlYWRjcnVtYiBpdGVtIHBpY2tlci5cIikpO1xuXG5cbi8vIC0tLS0tIG1lcmdlXG5cbmNvbnN0IGhlYWRlclRyYW5zcGFyZW5jeSA9IDAuNTtcbmNvbnN0IGN1cnJlbnRCYXNlQ29sb3IgPSBDb2xvci5mcm9tSGV4KCcjNDBDOEFFJykudHJhbnNwYXJlbnQoaGVhZGVyVHJhbnNwYXJlbmN5KTtcbmNvbnN0IGluY29taW5nQmFzZUNvbG9yID0gQ29sb3IuZnJvbUhleCgnIzQwQTZGRicpLnRyYW5zcGFyZW50KGhlYWRlclRyYW5zcGFyZW5jeSk7XG5jb25zdCBjb21tb25CYXNlQ29sb3IgPSBDb2xvci5mcm9tSGV4KCcjNjA2MDYwJykudHJhbnNwYXJlbnQoMC40KTtcbmNvbnN0IGNvbnRlbnRUcmFuc3BhcmVuY3kgPSAwLjQ7XG5jb25zdCBydWxlclRyYW5zcGFyZW5jeSA9IDE7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUN1cnJlbnRIZWFkZXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuY3VycmVudEhlYWRlckJhY2tncm91bmQnLFxuXHR7IGRhcms6IGN1cnJlbnRCYXNlQ29sb3IsIGxpZ2h0OiBjdXJyZW50QmFzZUNvbG9yLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdtZXJnZUN1cnJlbnRIZWFkZXJCYWNrZ3JvdW5kJywgJ0N1cnJlbnQgaGVhZGVyIGJhY2tncm91bmQgaW4gaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlQ3VycmVudENvbnRlbnRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuY3VycmVudENvbnRlbnRCYWNrZ3JvdW5kJyxcblx0dHJhbnNwYXJlbnQobWVyZ2VDdXJyZW50SGVhZGVyQmFja2dyb3VuZCwgY29udGVudFRyYW5zcGFyZW5jeSksXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VDdXJyZW50Q29udGVudEJhY2tncm91bmQnLCAnQ3VycmVudCBjb250ZW50IGJhY2tncm91bmQgaW4gaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlSW5jb21pbmdIZWFkZXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuaW5jb21pbmdIZWFkZXJCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBpbmNvbWluZ0Jhc2VDb2xvciwgbGlnaHQ6IGluY29taW5nQmFzZUNvbG9yLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdtZXJnZUluY29taW5nSGVhZGVyQmFja2dyb3VuZCcsICdJbmNvbWluZyBoZWFkZXIgYmFja2dyb3VuZCBpbiBpbmxpbmUgbWVyZ2UtY29uZmxpY3RzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgbWVyZ2VJbmNvbWluZ0NvbnRlbnRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuaW5jb21pbmdDb250ZW50QmFja2dyb3VuZCcsXG5cdHRyYW5zcGFyZW50KG1lcmdlSW5jb21pbmdIZWFkZXJCYWNrZ3JvdW5kLCBjb250ZW50VHJhbnNwYXJlbmN5KSxcblx0bmxzLmxvY2FsaXplKCdtZXJnZUluY29taW5nQ29udGVudEJhY2tncm91bmQnLCAnSW5jb21pbmcgY29udGVudCBiYWNrZ3JvdW5kIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUNvbW1vbkhlYWRlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdtZXJnZS5jb21tb25IZWFkZXJCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBjb21tb25CYXNlQ29sb3IsIGxpZ2h0OiBjb21tb25CYXNlQ29sb3IsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ21lcmdlQ29tbW9uSGVhZGVyQmFja2dyb3VuZCcsICdDb21tb24gYW5jZXN0b3IgaGVhZGVyIGJhY2tncm91bmQgaW4gaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlQ29tbW9uQ29udGVudEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdtZXJnZS5jb21tb25Db250ZW50QmFja2dyb3VuZCcsXG5cdHRyYW5zcGFyZW50KG1lcmdlQ29tbW9uSGVhZGVyQmFja2dyb3VuZCwgY29udGVudFRyYW5zcGFyZW5jeSksXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VDb21tb25Db250ZW50QmFja2dyb3VuZCcsICdDb21tb24gYW5jZXN0b3IgY29udGVudCBiYWNrZ3JvdW5kIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ21lcmdlLmJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogJyNDM0RGNkYnLCBoY0xpZ2h0OiAnIzAwN0FDQycgfSxcblx0bmxzLmxvY2FsaXplKCdtZXJnZUJvcmRlcicsICdCb3JkZXIgY29sb3Igb24gaGVhZGVycyBhbmQgdGhlIHNwbGl0dGVyIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBvdmVydmlld1J1bGVyQ3VycmVudENvbnRlbnRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yT3ZlcnZpZXdSdWxlci5jdXJyZW50Q29udGVudEZvcmVncm91bmQnLFxuXHR7IGRhcms6IHRyYW5zcGFyZW50KG1lcmdlQ3VycmVudEhlYWRlckJhY2tncm91bmQsIHJ1bGVyVHJhbnNwYXJlbmN5KSwgbGlnaHQ6IHRyYW5zcGFyZW50KG1lcmdlQ3VycmVudEhlYWRlckJhY2tncm91bmQsIHJ1bGVyVHJhbnNwYXJlbmN5KSwgaGNEYXJrOiBtZXJnZUJvcmRlciwgaGNMaWdodDogbWVyZ2VCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCdvdmVydmlld1J1bGVyQ3VycmVudENvbnRlbnRGb3JlZ3JvdW5kJywgJ0N1cnJlbnQgb3ZlcnZpZXcgcnVsZXIgZm9yZWdyb3VuZCBmb3IgaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4nKSk7XG5cbmV4cG9ydCBjb25zdCBvdmVydmlld1J1bGVySW5jb21pbmdDb250ZW50Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck92ZXJ2aWV3UnVsZXIuaW5jb21pbmdDb250ZW50Rm9yZWdyb3VuZCcsXG5cdHsgZGFyazogdHJhbnNwYXJlbnQobWVyZ2VJbmNvbWluZ0hlYWRlckJhY2tncm91bmQsIHJ1bGVyVHJhbnNwYXJlbmN5KSwgbGlnaHQ6IHRyYW5zcGFyZW50KG1lcmdlSW5jb21pbmdIZWFkZXJCYWNrZ3JvdW5kLCBydWxlclRyYW5zcGFyZW5jeSksIGhjRGFyazogbWVyZ2VCb3JkZXIsIGhjTGlnaHQ6IG1lcmdlQm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnb3ZlcnZpZXdSdWxlckluY29taW5nQ29udGVudEZvcmVncm91bmQnLCAnSW5jb21pbmcgb3ZlcnZpZXcgcnVsZXIgZm9yZWdyb3VuZCBmb3IgaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4nKSk7XG5cbmV4cG9ydCBjb25zdCBvdmVydmlld1J1bGVyQ29tbW9uQ29udGVudEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JPdmVydmlld1J1bGVyLmNvbW1vbkNvbnRlbnRGb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiB0cmFuc3BhcmVudChtZXJnZUNvbW1vbkhlYWRlckJhY2tncm91bmQsIHJ1bGVyVHJhbnNwYXJlbmN5KSwgbGlnaHQ6IHRyYW5zcGFyZW50KG1lcmdlQ29tbW9uSGVhZGVyQmFja2dyb3VuZCwgcnVsZXJUcmFuc3BhcmVuY3kpLCBoY0Rhcms6IG1lcmdlQm9yZGVyLCBoY0xpZ2h0OiBtZXJnZUJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ292ZXJ2aWV3UnVsZXJDb21tb25Db250ZW50Rm9yZWdyb3VuZCcsICdDb21tb24gYW5jZXN0b3Igb3ZlcnZpZXcgcnVsZXIgZm9yZWdyb3VuZCBmb3IgaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4nKSk7XG5cbmV4cG9ydCBjb25zdCBvdmVydmlld1J1bGVyRmluZE1hdGNoRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck92ZXJ2aWV3UnVsZXIuZmluZE1hdGNoRm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyNkMTg2MTY3ZScsIGxpZ2h0OiAnI2QxODYxNjdlJywgaGNEYXJrOiAnI0FCNUEwMCcsIGhjTGlnaHQ6ICcjQUI1QTAwJyB9LFxuXHRubHMubG9jYWxpemUoJ292ZXJ2aWV3UnVsZXJGaW5kTWF0Y2hGb3JlZ3JvdW5kJywgJ092ZXJ2aWV3IHJ1bGVyIG1hcmtlciBjb2xvciBmb3IgZmluZCBtYXRjaGVzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5leHBvcnQgY29uc3Qgb3ZlcnZpZXdSdWxlclNlbGVjdGlvbkhpZ2hsaWdodEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JPdmVydmlld1J1bGVyLnNlbGVjdGlvbkhpZ2hsaWdodEZvcmVncm91bmQnLFxuXHQnI0EwQTBBMENDJyxcblx0bmxzLmxvY2FsaXplKCdvdmVydmlld1J1bGVyU2VsZWN0aW9uSGlnaGxpZ2h0Rm9yZWdyb3VuZCcsICdPdmVydmlldyBydWxlciBtYXJrZXIgY29sb3IgZm9yIHNlbGVjdGlvbiBoaWdobGlnaHRzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5cbi8vIC0tLS0tIHByb2JsZW1zXG5cbmV4cG9ydCBjb25zdCBwcm9ibGVtc0Vycm9ySWNvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdwcm9ibGVtc0Vycm9ySWNvbi5mb3JlZ3JvdW5kJyxcblx0ZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ3Byb2JsZW1zRXJyb3JJY29uRm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIHVzZWQgZm9yIHRoZSBwcm9ibGVtcyBlcnJvciBpY29uLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBwcm9ibGVtc1dhcm5pbmdJY29uRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ3Byb2JsZW1zV2FybmluZ0ljb24uZm9yZWdyb3VuZCcsXG5cdGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ3Byb2JsZW1zV2FybmluZ0ljb25Gb3JlZ3JvdW5kJywgXCJUaGUgY29sb3IgdXNlZCBmb3IgdGhlIHByb2JsZW1zIHdhcm5pbmcgaWNvbi5cIikpO1xuXG5leHBvcnQgY29uc3QgcHJvYmxlbXNJbmZvSWNvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdwcm9ibGVtc0luZm9JY29uLmZvcmVncm91bmQnLFxuXHRlZGl0b3JJbmZvRm9yZWdyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdwcm9ibGVtc0luZm9JY29uRm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIHVzZWQgZm9yIHRoZSBwcm9ibGVtcyBpbmZvIGljb24uXCIpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLE9BQU8sWUFBWTtBQUM1QixTQUFTLGVBQWUsYUFBYSxlQUFlLFFBQVEsZUFBZTtBQUczRSxTQUFTLFlBQVksZ0JBQWdCLDRCQUE0QjtBQUNqRSxTQUFTLGlCQUFpQix1QkFBdUI7QUFLMUMsTUFBTSxtQkFBbUI7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QSxFQUFjO0FBQUEsRUFDeEMsRUFBRSxNQUFNLE1BQU0sT0FBTyxNQUFNLFFBQVEsV0FBVyxTQUFTLFVBQVU7QUFBQSxFQUNqRSxJQUFJLFNBQVMsZUFBZSxxRUFBcUU7QUFBQztBQUc1RixNQUFNLHdDQUF3QztBQUFBLEVBQWM7QUFBQSxFQUNsRSxFQUFFLE1BQU0sWUFBWSw4QkFBOEIsaUJBQWlCLEdBQUcsT0FBTyxZQUFZLDhCQUE4QixpQkFBaUIsR0FBRyxRQUFRLGFBQWEsU0FBUyxZQUFZO0FBQUEsRUFDckwsSUFBSSxTQUFTLHlDQUF5QywrREFBK0Q7QUFBQztBQUVoSCxNQUFNLHlDQUF5QztBQUFBLEVBQWM7QUFBQSxFQUNuRSxFQUFFLE1BQU0sWUFBWSwrQkFBK0IsaUJBQWlCLEdBQUcsT0FBTyxZQUFZLCtCQUErQixpQkFBaUIsR0FBRyxRQUFRLGFBQWEsU0FBUyxZQUFZO0FBQUEsRUFDdkwsSUFBSSxTQUFTLDBDQUEwQyxnRUFBZ0U7QUFBQztBQUVsSCxNQUFNLHVDQUF1QztBQUFBLEVBQWM7QUFBQSxFQUNqRSxFQUFFLE1BQU0sWUFBWSw2QkFBNkIsaUJBQWlCLEdBQUcsT0FBTyxZQUFZLDZCQUE2QixpQkFBaUIsR0FBRyxRQUFRLGFBQWEsU0FBUyxZQUFZO0FBQUEsRUFDbkwsSUFBSSxTQUFTLHdDQUF3Qyx1RUFBdUU7QUFBQztBQUV2SCxNQUFNLG1DQUFtQztBQUFBLEVBQWM7QUFBQSxFQUM3RCxFQUFFLE1BQU0sYUFBYSxPQUFPLGFBQWEsUUFBUSxXQUFXLFNBQVMsVUFBVTtBQUFBLEVBQy9FLElBQUksU0FBUyxvQ0FBb0Msc0hBQXNIO0FBQUEsRUFBRztBQUFJO0FBRXhLLE1BQU0sNENBQTRDO0FBQUEsRUFBYztBQUFBLEVBQ3RFO0FBQUEsRUFDQSxJQUFJLFNBQVMsNkNBQTZDLDhIQUE4SDtBQUFBLEVBQUc7QUFBSTtBQUt6TCxNQUFNLDhCQUE4QjtBQUFBLEVBQWM7QUFBQSxFQUN4RDtBQUFBLEVBQ0EsSUFBSSxTQUFTLCtCQUErQiw2Q0FBNkM7QUFBQztBQUVwRixNQUFNLGdDQUFnQztBQUFBLEVBQWM7QUFBQSxFQUMxRDtBQUFBLEVBQ0EsSUFBSSxTQUFTLGlDQUFpQywrQ0FBK0M7QUFBQztBQUV4RixNQUFNLDZCQUE2QjtBQUFBLEVBQWM7QUFBQSxFQUN2RDtBQUFBLEVBQ0EsSUFBSSxTQUFTLDhCQUE4Qiw0Q0FBNEM7QUFBQzsiLAogICJuYW1lcyI6IFtdCn0K
