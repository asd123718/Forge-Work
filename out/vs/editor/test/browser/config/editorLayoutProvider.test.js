import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ComputedEditorOptions } from "../../../browser/config/editorConfiguration.js";
import { EditorLayoutInfoComputer, EditorOption, EditorOptions, RenderLineNumbersType, RenderMinimap } from "../../../common/config/editorOptions.js";
suite("Editor ViewLayout - EditorLayoutProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function doTest(input, expected) {
    const options = new ComputedEditorOptions();
    options._write(EditorOption.glyphMargin, input.showGlyphMargin);
    options._write(EditorOption.lineNumbersMinChars, input.lineNumbersMinChars);
    options._write(EditorOption.lineDecorationsWidth, input.lineDecorationsWidth);
    options._write(EditorOption.folding, false);
    options._write(EditorOption.padding, { top: 0, bottom: 0 });
    const minimapOptions = {
      enabled: input.minimap,
      autohide: "none",
      size: input.minimapSize || "proportional",
      side: input.minimapSide,
      renderCharacters: input.minimapRenderCharacters,
      maxColumn: input.minimapMaxColumn,
      showSlider: "mouseover",
      scale: 1,
      showRegionSectionHeaders: true,
      showMarkSectionHeaders: true,
      sectionHeaderFontSize: 9,
      sectionHeaderLetterSpacing: 1,
      markSectionHeaderRegex: "\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*)$"
    };
    options._write(EditorOption.minimap, minimapOptions);
    const scrollbarOptions = {
      arrowSize: input.scrollbarArrowSize,
      vertical: EditorOptions.scrollbar.defaultValue.vertical,
      horizontal: EditorOptions.scrollbar.defaultValue.horizontal,
      useShadows: EditorOptions.scrollbar.defaultValue.useShadows,
      verticalHasArrows: input.verticalScrollbarHasArrows,
      horizontalHasArrows: false,
      handleMouseWheel: EditorOptions.scrollbar.defaultValue.handleMouseWheel,
      alwaysConsumeMouseWheel: true,
      horizontalScrollbarSize: input.horizontalScrollbarHeight,
      horizontalSliderSize: EditorOptions.scrollbar.defaultValue.horizontalSliderSize,
      verticalScrollbarSize: input.verticalScrollbarWidth,
      verticalSliderSize: EditorOptions.scrollbar.defaultValue.verticalSliderSize,
      scrollByPage: EditorOptions.scrollbar.defaultValue.scrollByPage,
      ignoreHorizontalScrollbarInContentHeight: false
    };
    options._write(EditorOption.scrollbar, scrollbarOptions);
    const lineNumbersOptions = {
      renderType: input.showLineNumbers ? RenderLineNumbersType.On : RenderLineNumbersType.Off,
      renderFn: null
    };
    options._write(EditorOption.lineNumbers, lineNumbersOptions);
    options._write(EditorOption.wordWrap, "off");
    options._write(EditorOption.wordWrapColumn, 80);
    options._write(EditorOption.wordWrapOverride1, "inherit");
    options._write(EditorOption.wordWrapOverride2, "inherit");
    options._write(EditorOption.accessibilitySupport, "auto");
    const actual = EditorLayoutInfoComputer.computeLayout(options, {
      memory: null,
      outerWidth: input.outerWidth,
      outerHeight: input.outerHeight,
      isDominatedByLongLines: false,
      lineHeight: input.lineHeight,
      viewLineCount: input.maxLineNumber || Math.pow(10, input.lineNumbersDigitCount) - 1,
      lineNumbersDigitCount: input.lineNumbersDigitCount,
      typicalHalfwidthCharacterWidth: input.typicalHalfwidthCharacterWidth,
      maxDigitWidth: input.maxDigitWidth,
      pixelRatio: input.pixelRatio,
      glyphMarginDecorationLaneCount: 1
    });
    assert.deepStrictEqual(actual, expected);
  }
  test("EditorLayoutProvider 1", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 990,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 98,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 1.1", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 11,
      horizontalScrollbarHeight: 12,
      scrollbarArrowSize: 13,
      verticalScrollbarHasArrows: true,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 990,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 97,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 11,
      horizontalScrollbarHeight: 12,
      overviewRuler: {
        top: 13,
        width: 11,
        height: 800 - 2 * 13,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 2", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 3", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 4", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 5", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 50,
      decorationsLeft: 50,
      decorationsWidth: 10,
      contentLeft: 60,
      contentWidth: 840,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 6", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 5,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 50,
      decorationsLeft: 50,
      decorationsWidth: 10,
      contentLeft: 60,
      contentWidth: 840,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 7", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 60,
      decorationsLeft: 60,
      decorationsWidth: 10,
      contentLeft: 70,
      contentWidth: 830,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 82,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 8", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 5,
      maxDigitWidth: 5,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 30,
      decorationsLeft: 30,
      decorationsWidth: 10,
      contentLeft: 40,
      contentWidth: 860,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 171,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 8 - rounds floats", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 5.05,
      maxDigitWidth: 5.05,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 30,
      decorationsLeft: 30,
      decorationsWidth: 10,
      contentLeft: 40,
      contentWidth: 860,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 169,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 2,
        minimapCanvasInnerWidth: 97,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap with pixelRatio = 2", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 194,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap with pixelRatio = 4", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 4
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 220,
        minimapCanvasInnerHeight: 3200,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 10 - render minimap to left", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "left",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 4
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 55,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 55,
      lineNumbersWidth: 0,
      decorationsLeft: 55,
      decorationsWidth: 10,
      contentLeft: 65,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 0,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 220,
        minimapCanvasInnerHeight: 3200,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 11 - minimap mode cover without sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 3,
      maxLineNumber: 120,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fill",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: false,
        minimapScale: 3,
        minimapLineHeight: 13,
        minimapCanvasInnerWidth: 291,
        minimapCanvasInnerHeight: 1560,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 12 - minimap mode cover with sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 4,
      maxLineNumber: 2500,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fill",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: true,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 110,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 13 - minimap mode contain without sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 3,
      maxLineNumber: 120,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fit",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 194,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 14 - minimap mode contain with sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 4,
      maxLineNumber: 2500,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fit",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: true,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 110,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("issue #31312: When wrapping, leave 2px for the cursor", () => {
    doTest({
      outerWidth: 1201,
      outerHeight: 422,
      showGlyphMargin: true,
      lineHeight: 30,
      showLineNumbers: true,
      lineNumbersMinChars: 3,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 26,
      typicalHalfwidthCharacterWidth: 12.04296875,
      maxDigitWidth: 12.04296875,
      verticalScrollbarWidth: 14,
      horizontalScrollbarHeight: 10,
      scrollbarArrowSize: 11,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 120,
      pixelRatio: 2
    }, {
      width: 1201,
      height: 422,
      glyphMarginLeft: 0,
      glyphMarginWidth: 30,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 30,
      lineNumbersWidth: 36,
      decorationsLeft: 66,
      decorationsWidth: 26,
      contentLeft: 92,
      contentWidth: 1018,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 1096,
        minimapWidth: 91,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 182,
        minimapCanvasInnerHeight: 844,
        minimapCanvasOuterWidth: 91,
        minimapCanvasOuterHeight: 422
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 14,
      horizontalScrollbarHeight: 10,
      overviewRuler: {
        top: 0,
        width: 14,
        height: 422,
        right: 0
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbmZpZ1xcZWRpdG9yTGF5b3V0UHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tcHV0ZWRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JMYXlvdXRJbmZvLCBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIsIEVkaXRvck1pbmltYXBPcHRpb25zLCBFZGl0b3JPcHRpb24sIEVkaXRvck9wdGlvbnMsIEludGVybmFsRWRpdG9yUmVuZGVyTGluZU51bWJlcnNPcHRpb25zLCBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnMsIFJlbmRlckxpbmVOdW1iZXJzVHlwZSwgUmVuZGVyTWluaW1hcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5cbmludGVyZmFjZSBJRWRpdG9yTGF5b3V0UHJvdmlkZXJPcHRzIHtcblx0cmVhZG9ubHkgb3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRlckhlaWdodDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHNob3dHbHlwaE1hcmdpbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHNob3dMaW5lTnVtYmVyczogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGluZU51bWJlcnNNaW5DaGFyczogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IG51bWJlcjtcblx0bWF4TGluZU51bWJlcj86IG51bWJlcjtcblxuXHRyZWFkb25seSBsaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhEaWdpdFdpZHRoOiBudW1iZXI7XG5cblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSB2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Nyb2xsYmFyQXJyb3dTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IG51bWJlcjtcblxuXHRyZWFkb25seSBtaW5pbWFwOiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFwU2lkZTogJ2xlZnQnIHwgJ3JpZ2h0Jztcblx0cmVhZG9ubHkgbWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYXBNYXhDb2x1bW46IG51bWJlcjtcblx0bWluaW1hcFNpemU/OiAncHJvcG9ydGlvbmFsJyB8ICdmaWxsJyB8ICdmaXQnO1xuXHRyZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG59XG5cbnN1aXRlKCdFZGl0b3IgVmlld0xheW91dCAtIEVkaXRvckxheW91dFByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGRvVGVzdChpbnB1dDogSUVkaXRvckxheW91dFByb3ZpZGVyT3B0cywgZXhwZWN0ZWQ6IEVkaXRvckxheW91dEluZm8pOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gbmV3IENvbXB1dGVkRWRpdG9yT3B0aW9ucygpO1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbiwgaW5wdXQuc2hvd0dseXBoTWFyZ2luKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ubGluZU51bWJlcnNNaW5DaGFycywgaW5wdXQubGluZU51bWJlcnNNaW5DaGFycyk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLmxpbmVEZWNvcmF0aW9uc1dpZHRoLCBpbnB1dC5saW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLmZvbGRpbmcsIGZhbHNlKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ucGFkZGluZywgeyB0b3A6IDAsIGJvdHRvbTogMCB9KTtcblx0XHRjb25zdCBtaW5pbWFwT3B0aW9uczogRWRpdG9yTWluaW1hcE9wdGlvbnMgPSB7XG5cdFx0XHRlbmFibGVkOiBpbnB1dC5taW5pbWFwLFxuXHRcdFx0YXV0b2hpZGU6ICdub25lJyxcblx0XHRcdHNpemU6IGlucHV0Lm1pbmltYXBTaXplIHx8ICdwcm9wb3J0aW9uYWwnLFxuXHRcdFx0c2lkZTogaW5wdXQubWluaW1hcFNpZGUsXG5cdFx0XHRyZW5kZXJDaGFyYWN0ZXJzOiBpbnB1dC5taW5pbWFwUmVuZGVyQ2hhcmFjdGVycyxcblx0XHRcdG1heENvbHVtbjogaW5wdXQubWluaW1hcE1heENvbHVtbixcblx0XHRcdHNob3dTbGlkZXI6ICdtb3VzZW92ZXInLFxuXHRcdFx0c2NhbGU6IDEsXG5cdFx0XHRzaG93UmVnaW9uU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRzaG93TWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0c2VjdGlvbkhlYWRlckZvbnRTaXplOiA5LFxuXHRcdFx0c2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmc6IDEsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXFxcXGJNQVJLOlxcXFxzKig/PHNlcGFyYXRvcj5cXC0/KVxcXFxzKig/PGxhYmVsPi4qKSQnLFxuXHRcdH07XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLm1pbmltYXAsIG1pbmltYXBPcHRpb25zKTtcblx0XHRjb25zdCBzY3JvbGxiYXJPcHRpb25zOiBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnMgPSB7XG5cdFx0XHRhcnJvd1NpemU6IGlucHV0LnNjcm9sbGJhckFycm93U2l6ZSxcblx0XHRcdHZlcnRpY2FsOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUudmVydGljYWwsXG5cdFx0XHRob3Jpem9udGFsOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUuaG9yaXpvbnRhbCxcblx0XHRcdHVzZVNoYWRvd3M6IEVkaXRvck9wdGlvbnMuc2Nyb2xsYmFyLmRlZmF1bHRWYWx1ZS51c2VTaGFkb3dzLFxuXHRcdFx0dmVydGljYWxIYXNBcnJvd3M6IGlucHV0LnZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzLFxuXHRcdFx0aG9yaXpvbnRhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUuaGFuZGxlTW91c2VXaGVlbCxcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhclNpemU6IGlucHV0Lmhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQsXG5cdFx0XHRob3Jpem9udGFsU2xpZGVyU2l6ZTogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLmhvcml6b250YWxTbGlkZXJTaXplLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiBpbnB1dC52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoLFxuXHRcdFx0dmVydGljYWxTbGlkZXJTaXplOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUudmVydGljYWxTbGlkZXJTaXplLFxuXHRcdFx0c2Nyb2xsQnlQYWdlOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUuc2Nyb2xsQnlQYWdlLFxuXHRcdFx0aWdub3JlSG9yaXpvbnRhbFNjcm9sbGJhckluQ29udGVudEhlaWdodDogZmFsc2UsXG5cdFx0fTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24uc2Nyb2xsYmFyLCBzY3JvbGxiYXJPcHRpb25zKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyc09wdGlvbnM6IEludGVybmFsRWRpdG9yUmVuZGVyTGluZU51bWJlcnNPcHRpb25zID0ge1xuXHRcdFx0cmVuZGVyVHlwZTogaW5wdXQuc2hvd0xpbmVOdW1iZXJzID8gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uIDogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZixcblx0XHRcdHJlbmRlckZuOiBudWxsXG5cdFx0fTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ubGluZU51bWJlcnMsIGxpbmVOdW1iZXJzT3B0aW9ucyk7XG5cblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ud29yZFdyYXAsICdvZmYnKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ud29yZFdyYXBDb2x1bW4sIDgwKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24ud29yZFdyYXBPdmVycmlkZTEsICdpbmhlcml0Jyk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLndvcmRXcmFwT3ZlcnJpZGUyLCAnaW5oZXJpdCcpO1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IEVkaXRvckxheW91dEluZm9Db21wdXRlci5jb21wdXRlTGF5b3V0KG9wdGlvbnMsIHtcblx0XHRcdG1lbW9yeTogbnVsbCxcblx0XHRcdG91dGVyV2lkdGg6IGlucHV0Lm91dGVyV2lkdGgsXG5cdFx0XHRvdXRlckhlaWdodDogaW5wdXQub3V0ZXJIZWlnaHQsXG5cdFx0XHRpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IGlucHV0LmxpbmVIZWlnaHQsXG5cdFx0XHR2aWV3TGluZUNvdW50OiBpbnB1dC5tYXhMaW5lTnVtYmVyIHx8IE1hdGgucG93KDEwLCBpbnB1dC5saW5lTnVtYmVyc0RpZ2l0Q291bnQpIC0gMSxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogaW5wdXQubGluZU51bWJlcnNEaWdpdENvdW50LFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBpbnB1dC50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiBpbnB1dC5tYXhEaWdpdFdpZHRoLFxuXHRcdFx0cGl4ZWxSYXRpbzogaW5wdXQucGl4ZWxSYXRpbyxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMScsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogZmFsc2UsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA5OTAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDgwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDk4LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciAxLjEnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAxMSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDEyLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAxMyxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiB0cnVlLFxuXHRcdFx0bWluaW1hcDogZmFsc2UsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA5OTAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDgwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDk3LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDExLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMTIsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAxMyxcblx0XHRcdFx0d2lkdGg6IDExLFxuXHRcdFx0XHRoZWlnaHQ6ICg4MDAgLSAyICogMTMpLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciAyJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDgwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDg4LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciAzJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogOTAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogOTAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDg4LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogOTAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA0JywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogOTAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDUsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogOTAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDg4LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogOTAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA1JywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogOTAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogNSxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogZmFsc2UsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogOTAwLFxuXHRcdFx0aGVpZ2h0OiA5MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDUwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDUwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiA2MCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODQwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA5MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgNicsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDUsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDUsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogOTAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiA1MCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiA1MCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogNjAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDg0MCxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLk5vbmUsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAwLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMSxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogOTAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogODMsXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA5MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDcnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDkwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiA1LFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiA2LFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogNjAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogNjAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDcwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4MzAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDgyLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogOTAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA4JywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogOTAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogNSxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogNixcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogNSxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDUsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogOTAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAzMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAzMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogNDAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDg2MCxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLk5vbmUsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAwLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMSxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogOTAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogMTcxLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogOTAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA4IC0gcm91bmRzIGZsb2F0cycsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDUsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDYsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDUuMDUsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiA1LjA1LFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMzAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMzAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDQwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4NjAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDE2OSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgOSAtIHJlbmRlciBtaW5pbWFwJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMDAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB0cnVlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkzLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuVGV4dCxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDkwMyxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA5Nyxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAyLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogOTcsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogODAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogOTcsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDg5LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA5IC0gcmVuZGVyIG1pbmltYXAgd2l0aCBwaXhlbFJhdGlvID0gMicsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAyLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogMTAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDg5MyxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiA5MDMsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogOTcsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAyLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogNCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDE5NCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiAxNjAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogOTcsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDg5LFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA5IC0gcmVuZGVyIG1pbmltYXAgd2l0aCBwaXhlbFJhdGlvID0gNCcsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiA0LFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogMTAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDkzNSxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiA5NDUsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogNTUsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAyLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogNCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDIyMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiAzMjAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogNTUsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDkzLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciAxMCAtIHJlbmRlciBtaW5pbWFwIHRvIGxlZnQnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ2xlZnQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiA0LFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogNTUsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDU1LFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiA1NSxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogNjUsXG5cdFx0XHRjb250ZW50V2lkdGg6IDkzNSxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAwLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMixcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAyMjAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMzIwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMTEgLSBtaW5pbWFwIG1vZGUgY292ZXIgd2l0aG91dCBzYW1wbGluZycsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMyxcblx0XHRcdG1heExpbmVOdW1iZXI6IDEyMCxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRtaW5pbWFwU2l6ZTogJ2ZpbGwnLFxuXHRcdFx0cGl4ZWxSYXRpbzogMixcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTMsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogOTAzLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IHRydWUsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAzLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMTMsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAyOTEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMTU2MCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMTIgLSBtaW5pbWFwIG1vZGUgY292ZXIgd2l0aCBzYW1wbGluZycsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogNCxcblx0XHRcdG1heExpbmVOdW1iZXI6IDI1MDAsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0bWluaW1hcFNpemU6ICdmaWxsJyxcblx0XHRcdHBpeGVsUmF0aW86IDIsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogOTM1LFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuVGV4dCxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDk0NSxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA1NSxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiB0cnVlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogdHJ1ZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMSxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDExMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiAxNjAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogNTUsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogODAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDkzLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogODAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciAxMyAtIG1pbmltYXAgbW9kZSBjb250YWluIHdpdGhvdXQgc2FtcGxpbmcnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDMsXG5cdFx0XHRtYXhMaW5lTnVtYmVyOiAxMjAsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0bWluaW1hcFNpemU6ICdmaXQnLFxuXHRcdFx0cGl4ZWxSYXRpbzogMixcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTMsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogOTAzLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMixcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAxOTQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMTYwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMTQgLSBtaW5pbWFwIG1vZGUgY29udGFpbiB3aXRoIHNhbXBsaW5nJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMDAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiA0LFxuXHRcdFx0bWF4TGluZU51bWJlcjogMjUwMCxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRtaW5pbWFwU2l6ZTogJ2ZpdCcsXG5cdFx0XHRwaXhlbFJhdGlvOiAyLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogMTAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDkzNSxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiA5NDUsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogNTUsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogdHJ1ZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IHRydWUsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAxMTAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMTYwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzMxMzEyOiBXaGVuIHdyYXBwaW5nLCBsZWF2ZSAycHggZm9yIHRoZSBjdXJzb3InLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEyMDEsXG5cdFx0XHRvdXRlckhlaWdodDogNDIyLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiB0cnVlLFxuXHRcdFx0bGluZUhlaWdodDogMzAsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAzLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDI2LFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMi4wNDI5Njg3NSxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEyLjA0Mjk2ODc1LFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMTQsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAxMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMTEsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB0cnVlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDEyMCxcblx0XHRcdHBpeGVsUmF0aW86IDJcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTIwMSxcblx0XHRcdGhlaWdodDogNDIyLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAzMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAzMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDM2LFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDY2LFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMjYsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiA5Mixcblx0XHRcdGNvbnRlbnRXaWR0aDogMTAxOCxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAxMDk2LFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDkxLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMixcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAxODIsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogODQ0LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogOTEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogNDIyLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDgzLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDE0LFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMTAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMTQsXG5cdFx0XHRcdGhlaWdodDogNDIyLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBMkIsMEJBQWdELGNBQWMsZUFBdUYsdUJBQXVCLHFCQUFxQjtBQWdDNU4sTUFBTSw0Q0FBNEMsTUFBTTtBQUV2RCwwQ0FBd0M7QUFFeEMsV0FBUyxPQUFPLE9BQWtDLFVBQWtDO0FBQ25GLFVBQU0sVUFBVSxJQUFJLHNCQUFzQjtBQUMxQyxZQUFRLE9BQU8sYUFBYSxhQUFhLE1BQU0sZUFBZTtBQUM5RCxZQUFRLE9BQU8sYUFBYSxxQkFBcUIsTUFBTSxtQkFBbUI7QUFDMUUsWUFBUSxPQUFPLGFBQWEsc0JBQXNCLE1BQU0sb0JBQW9CO0FBQzVFLFlBQVEsT0FBTyxhQUFhLFNBQVMsS0FBSztBQUMxQyxZQUFRLE9BQU8sYUFBYSxTQUFTLEVBQUUsS0FBSyxHQUFHLFFB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
