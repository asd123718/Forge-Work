import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CodeCellLayout } from "../../../browser/view/cellParts/codeCell.js";
suite("CellPart", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("CodeCellLayout editor visibility states", () => {
    const DEFAULT_ELEMENT_TOP = 100;
    const DEFAULT_ELEMENT_HEIGHT = 900;
    const STATUSBAR = 22;
    const TOP_MARGIN = 6;
    const OUTLINE = 1;
    const scenarios = [
      {
        name: "Full",
        scrollTop: 0,
        viewportHeight: 400,
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        // editorBottom = 100 + 300 = 400, fully inside viewport (scrollBottom=400)
        expected: "Full",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 0,
        expectedEditorScrollTop: 0
      },
      {
        name: "Bottom Clipped",
        scrollTop: 0,
        viewportHeight: 350,
        // scrollBottom=350 < editorBottom(400)
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        expected: "Bottom Clipped",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 0,
        expectedEditorScrollTop: 0
      },
      {
        name: "Full (Small Viewport)",
        scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 20,
        // scrolled into the cell body
        viewportHeight: 220,
        // small vs content
        editorContentHeight: 500,
        // larger than viewport so we clamp
        editorHeight: 500,
        outputContainerOffset: 600,
        // editorBottom=700 > scrollBottom
        expected: "Full (Small Viewport)",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 19,
        // (scrollTop - elementTop - topMargin - outlineWidth) = (100+6+20 -100 -6 -1)
        expectedEditorScrollTop: 19
      },
      {
        name: "Top Clipped",
        scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 40,
        // scrolled further down but not past bottom
        viewportHeight: 600,
        // larger than content height below (forces branch for Top Clipped)
        editorContentHeight: 200,
        editorHeight: 200,
        outputContainerOffset: 450,
        // editorBottom=550; scrollBottom= scrollTop+viewportHeight = > 550?  (540+600=1140) but we only need scrollTop < editorBottom
        expected: "Top Clipped",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 39,
        // (100+6+40 -100 -6 -1)
        expectedEditorScrollTop: 40
        // contentHeight(200) - computed height(160)
      },
      {
        name: "Invisible",
        scrollTop: DEFAULT_ELEMENT_TOP + 1e3,
        // well below editor bottom
        viewportHeight: 400,
        editorContentHeight: 300,
        editorHeight: 300,
        outputContainerOffset: 300,
        // editorBottom=400 < scrollTop
        expected: "Invisible",
        elementTop: DEFAULT_ELEMENT_TOP,
        elementHeight: DEFAULT_ELEMENT_HEIGHT,
        expectedTop: 278,
        // adjusted after ensuring minimum line height when possibleEditorHeight < LINE_HEIGHT
        expectedEditorScrollTop: 279
        // contentHeight(300) - clamped height(21)
      }
    ];
    for (const s of scenarios) {
      const editorScrollState = { scrollTop: 0 };
      const stubEditor = {
        layoutCalls: [],
        _lastScrollTopSet: -1,
        getLayoutInfo: () => ({ width: 600, height: s.editorHeight }),
        getContentHeight: () => s.editorContentHeight,
        layout: (dim) => {
          stubEditor.layoutCalls.push(dim);
        },
        setScrollTop: (v) => {
          editorScrollState.scrollTop = v;
          stubEditor._lastScrollTopSet = v;
        },
        hasModel: () => true
      };
      const editorPart = { style: { top: "" } };
      const template = {
        editor: stubEditor,
        editorPart
      };
      const viewCell = {
        isInputCollapsed: false,
        layoutInfo: {
          // values referenced in layout logic
          statusBarHeight: STATUSBAR,
          topMargin: TOP_MARGIN,
          outlineWidth: OUTLINE,
          editorHeight: s.editorHeight,
          outputContainerOffset: s.outputContainerOffset
        }
      };
      let scrollBottom = s.scrollTop + s.viewportHeight;
      const notebookEditor = {
        scrollTop: s.scrollTop,
        get scrollBottom() {
          return scrollBottom;
        },
        setScrollTop: (v) => {
          notebookEditor.scrollTop = v;
          scrollBottom = v + s.viewportHeight;
        },
        getLayoutInfo: () => ({
          fontInfo: { lineHeight: 21 },
          height: s.viewportHeight,
          stickyHeight: 0
        }),
        getAbsoluteTopOfElement: () => s.elementTop,
        getAbsoluteBottomOfElement: () => s.elementTop + s.outputContainerOffset,
        getHeightOfElement: () => s.elementHeight,
        notebookOptions: {
          getLayoutConfiguration: () => ({ editorTopPadding: 6 })
        }
      };
      const layout = new CodeCellLayout(
        /* enabled */
        true,
        notebookEditor,
        viewCell,
        template,
        {
          debug: () => {
          }
        },
        { width: 600, height: s.editorHeight }
      );
      layout.layoutEditor("init");
      assert.strictEqual(
        layout.editorVisibility,
        s.expected,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected visibility ${s.expected} but got ${layout.editorVisibility}`
      );
      const actualTop = parseInt(
        (editorPart.style.top || "0").replace(/px$/, "")
      );
      assert.strictEqual(
        actualTop,
        s.expectedTop,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected top ${s.expectedTop}px but got ${editorPart.style.top}`
      );
      assert.strictEqual(
        stubEditor._lastScrollTopSet,
        s.expectedEditorScrollTop,
        `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected editor.setScrollTop(${s.expectedEditorScrollTop}) but got ${stubEditor._lastScrollTopSet}`
      );
      if (s.expected !== "Invisible") {
        assert.notStrictEqual(
          editorPart.style.top,
          "",
          `Scenario '${s.name}' should set a top style value`
        );
      } else {
        assert.ok(
          editorPart.style.top !== void 0,
          "Invisible scenario still performs a layout"
        );
      }
    }
  });
  test("Scrolling", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 300;
    const ELEMENT_TOP = 100;
    const EDITOR_CONTENT_HEIGHT = 800;
    const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 800;
    const ELEMENT_HEIGHT = 1200;
    function clamp(v, min, max) {
      return Math.min(Math.max(v, min), max);
    }
    function computeExpected(scrollTop) {
      const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
      const viewportHeight = VIEWPORT_HEIGHT;
      const editorBottom = ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET;
      let top = Math.max(
        0,
        scrollTop - ELEMENT_TOP - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH
      );
      const possibleEditorHeight = EDITOR_HEIGHT - top;
      if (possibleEditorHeight < LINE_HEIGHT) {
        top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
      }
      let height = EDITOR_CONTENT_HEIGHT;
      let visibility = "Full";
      let editorScrollTop = 0;
      if (scrollTop <= ELEMENT_TOP + CELL_TOP_MARGIN) {
        const minimumEditorHeight = LINE_HEIGHT + 6;
        if (scrollBottom >= editorBottom) {
          height = clamp(
            EDITOR_CONTENT_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          );
          visibility = "Full";
        } else {
          height = clamp(
            scrollBottom - (ELEMENT_TOP + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          ) + 2 * CELL_OUTLINE_WIDTH;
          visibility = "Bottom Clipped";
          editorScrollTop = 0;
        }
      } else {
        if (viewportHeight <= EDITOR_CONTENT_HEIGHT && scrollBottom <= editorBottom) {
          const minimumEditorHeight = LINE_HEIGHT + 6;
          height = clamp(
            viewportHeight - STATUSBAR_HEIGHT,
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT - STATUSBAR_HEIGHT
          ) + 2 * CELL_OUTLINE_WIDTH;
          visibility = "Full (Small Viewport)";
          editorScrollTop = top;
        } else {
          const minimumEditorHeight = LINE_HEIGHT;
          height = clamp(
            EDITOR_CONTENT_HEIGHT - (scrollTop - (ELEMENT_TOP + CELL_TOP_MARGIN)),
            minimumEditorHeight,
            EDITOR_CONTENT_HEIGHT
          );
          if (scrollTop > editorBottom) {
            visibility = "Invisible";
          } else {
            visibility = "Top Clipped";
          }
          editorScrollTop = EDITOR_CONTENT_HEIGHT - height;
        }
      }
      return { top, visibility, editorScrollTop };
    }
    for (let scrollTop = 0; scrollTop <= VIEWPORT_HEIGHT + OUTPUT_CONTAINER_OFFSET + 20; scrollTop++) {
      const expected = computeExpected(scrollTop);
      const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
      const stubEditor = {
        _lastScrollTopSet: -1,
        getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
        getContentHeight: () => EDITOR_CONTENT_HEIGHT,
        layout: () => {
        },
        setScrollTop: (v) => {
          stubEditor._lastScrollTopSet = v;
        },
        hasModel: () => true
      };
      const editorPart = { style: { top: "" } };
      const template = {
        editor: stubEditor,
        editorPart
      };
      const viewCell = {
        isInputCollapsed: false,
        layoutInfo: {
          statusBarHeight: STATUSBAR_HEIGHT,
          topMargin: CELL_TOP_MARGIN,
          outlineWidth: CELL_OUTLINE_WIDTH,
          editorHeight: EDITOR_HEIGHT,
          outputContainerOffset: OUTPUT_CONTAINER_OFFSET
        }
      };
      const notebookEditor = {
        scrollTop,
        get scrollBottom() {
          return scrollBottom;
        },
        setScrollTop: (v) => {
        },
        getLayoutInfo: () => ({
          fontInfo: { lineHeight: LINE_HEIGHT },
          height: VIEWPORT_HEIGHT,
          stickyHeight: 0
        }),
        getAbsoluteTopOfElement: () => ELEMENT_TOP,
        getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
        getHeightOfElement: () => ELEMENT_HEIGHT,
        notebookOptions: {
          getLayoutConfiguration: () => ({ editorTopPadding: 6 })
        }
      };
      const layout = new CodeCellLayout(
        true,
        notebookEditor,
        viewCell,
        template,
        { debug: () => {
        } },
        { width: 600, height: EDITOR_HEIGHT }
      );
      layout.layoutEditor("nbDidScroll");
      const actualTop = parseInt(
        (editorPart.style.top || "0").replace(/px$/, "")
      );
      assert.strictEqual(
        actualTop,
        expected.top,
        `scrollTop=${scrollTop}: expected top ${expected.top}, got ${actualTop}`
      );
      assert.strictEqual(
        layout.editorVisibility,
        expected.visibility,
        `scrollTop=${scrollTop}: expected visibility ${expected.visibility}, got ${layout.editorVisibility}`
      );
      assert.strictEqual(
        stubEditor._lastScrollTopSet,
        expected.editorScrollTop,
        `scrollTop=${scrollTop}: expected editorScrollTop ${expected.editorScrollTop}, got ${stubEditor._lastScrollTopSet}`
      );
    }
  });
  test("CodeCellLayout reuses content height after init", () => {
    const LINE_HEIGHT = 21;
    const STATUSBAR_HEIGHT = 22;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const EDITOR_HEIGHT = 800;
    let contentHeight = 800;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: EDITOR_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 800);
    contentHeight = 200;
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      800,
      "nbDidScroll should reuse the established content height"
    );
    layout.layoutEditor("onDidContentSizeChange");
    assert.strictEqual(layout.editorVisibility, "Full");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      200,
      "onDidContentSizeChange should refresh the content height"
    );
  });
  test("CodeCellLayout refreshes content height on viewCellLayoutChange", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const INITIAL_CONTENT_HEIGHT = 37;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const UPDATED_CONTENT_HEIGHT = 200;
    let contentHeight = INITIAL_CONTENT_HEIGHT;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: INITIAL_CONTENT_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: INITIAL_CONTENT_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: INITIAL_CONTENT_HEIGHT }
    );
    layout.layoutEditor("init");
    assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, INITIAL_CONTENT_HEIGHT);
    contentHeight = UPDATED_CONTENT_HEIGHT;
    layout.layoutEditor("viewCellLayoutChange");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      UPDATED_CONTENT_HEIGHT,
      "viewCellLayoutChange should refresh the content height"
    );
    contentHeight = 50;
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(
      stubEditor.layoutCalls.at(-1)?.height,
      UPDATED_CONTENT_HEIGHT,
      "nbDidScroll should reuse the refreshed content height"
    );
  });
  test("CodeCellLayout maintains content height after paste when scrolling", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 1e3;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 1200;
    const INITIAL_CONTENT_HEIGHT = 37;
    const INITIAL_EDITOR_HEIGHT = INITIAL_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 300;
    const PASTED_CONTENT_HEIGHT = 679;
    let contentHeight = INITIAL_CONTENT_HEIGHT;
    const stubEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: INITIAL_EDITOR_HEIGHT }),
      getContentHeight: () => contentHeight,
      layout: (dim) => {
        stubEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const layoutInfo = {
      statusBarHeight: STATUSBAR_HEIGHT,
      topMargin: CELL_TOP_MARGIN,
      outlineWidth: CELL_OUTLINE_WIDTH,
      editorHeight: INITIAL_EDITOR_HEIGHT,
      outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
      editorWidth: 600
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo
    };
    const notebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return notebookEditor.scrollTop + VIEWPORT_HEIGHT;
      },
      setScrollTop: (v) => {
        notebookEditor.scrollTop = v;
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: INITIAL_EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    contentHeight = PASTED_CONTENT_HEIGHT;
    layoutInfo.editorHeight = PASTED_CONTENT_HEIGHT;
    layout.layoutEditor("onDidContentSizeChange");
    contentHeight = 39;
    notebookEditor.scrollTop = 200;
    layout.layoutEditor("nbDidScroll");
    const finalHeight = stubEditor.layoutCalls.at(-1)?.height;
    assert.notStrictEqual(
      finalHeight,
      39,
      "Should not use Monaco's transient value (39px)"
    );
    assert.notStrictEqual(
      finalHeight,
      37,
      "Should not use initial content height (37px)"
    );
    assert.ok(
      finalHeight && finalHeight > 100,
      `Layout height (${finalHeight}px) should be calculated from established 679px content, not transient 39px or initial 37px`
    );
  });
  test("CodeCellLayout does not programmatically scroll editor while pointer down", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 220;
    const ELEMENT_TOP = 100;
    const EDITOR_CONTENT_HEIGHT = 500;
    const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT;
    const OUTPUT_CONTAINER_OFFSET = 600;
    const ELEMENT_HEIGHT = 900;
    const scrollTop = ELEMENT_TOP + CELL_TOP_MARGIN + 20;
    const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
    const stubEditor = {
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
      getContentHeight: () => EDITOR_CONTENT_HEIGHT,
      layout: () => {
      },
      setScrollTop: (v) => {
        stubEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: stubEditor,
      editorPart
    };
    const viewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: EDITOR_HEIGHT,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET
      }
    };
    const notebookEditor = {
      scrollTop,
      get scrollBottom() {
        return scrollBottom;
      },
      setScrollTop: (v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const layout = new CodeCellLayout(
      true,
      notebookEditor,
      viewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: EDITOR_HEIGHT }
    );
    layout.layoutEditor("init");
    stubEditor._lastScrollTopSet = -1;
    layout.setPointerDown(true);
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full (Small Viewport)");
    assert.strictEqual(
      stubEditor._lastScrollTopSet,
      -1,
      "Expected no programmatic editor.setScrollTop while pointer is down"
    );
    layout.setPointerDown(false);
    layout.layoutEditor("nbDidScroll");
    assert.strictEqual(layout.editorVisibility, "Full (Small Viewport)");
    assert.notStrictEqual(
      stubEditor._lastScrollTopSet,
      -1,
      "Expected editor.setScrollTop to resume once pointer is released"
    );
  });
  test("CodeCellLayout init ignores stale pooled editor content height", () => {
    const LINE_HEIGHT = 21;
    const CELL_TOP_MARGIN = 6;
    const CELL_OUTLINE_WIDTH = 1;
    const STATUSBAR_HEIGHT = 22;
    const VIEWPORT_HEIGHT = 400;
    const ELEMENT_TOP = 100;
    const ELEMENT_HEIGHT = 500;
    const OUTPUT_CONTAINER_OFFSET = 200;
    let pooledContentHeight = 200;
    const pooledEditor = {
      layoutCalls: [],
      _lastScrollTopSet: -1,
      getLayoutInfo: () => ({ width: 600, height: pooledContentHeight }),
      getContentHeight: () => pooledContentHeight,
      layout: (dim) => {
        pooledEditor.layoutCalls.push(dim);
      },
      setScrollTop: (v) => {
        pooledEditor._lastScrollTopSet = v;
      },
      hasModel: () => true
    };
    const editorPart = { style: { top: "" } };
    const template = {
      editor: pooledEditor,
      editorPart
    };
    const tallViewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: 200,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const tallNotebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (_v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const tallLayout = new CodeCellLayout(
      true,
      tallNotebookEditor,
      tallViewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: 200 }
    );
    tallLayout.layoutEditor("init");
    assert.strictEqual(
      pooledEditor.layoutCalls.at(-1)?.height,
      200,
      "Expected tall cell to lay out using its own height"
    );
    pooledContentHeight = 200;
    const shortViewCell = {
      isInputCollapsed: false,
      layoutInfo: {
        statusBarHeight: STATUSBAR_HEIGHT,
        topMargin: CELL_TOP_MARGIN,
        outlineWidth: CELL_OUTLINE_WIDTH,
        editorHeight: 37,
        outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
        editorWidth: 600
      }
    };
    const shortNotebookEditor = {
      scrollTop: 0,
      get scrollBottom() {
        return VIEWPORT_HEIGHT;
      },
      setScrollTop: (_v) => {
      },
      getLayoutInfo: () => ({
        fontInfo: { lineHeight: LINE_HEIGHT },
        height: VIEWPORT_HEIGHT,
        stickyHeight: 0
      }),
      getAbsoluteTopOfElement: () => ELEMENT_TOP,
      getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
      getHeightOfElement: () => ELEMENT_HEIGHT,
      notebookOptions: {
        getLayoutConfiguration: () => ({ editorTopPadding: 6 })
      }
    };
    const shortLayout = new CodeCellLayout(
      true,
      shortNotebookEditor,
      shortViewCell,
      template,
      { debug: () => {
      } },
      { width: 600, height: 37 }
    );
    shortLayout.layoutEditor("init");
    assert.strictEqual(
      pooledEditor.layoutCalls.at(-1)?.height,
      37,
      "Init layout for a short cell should use the cell's initial height, not the pooled editor's stale content height"
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFx2aWV3XFxjZWxsUGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3L25vdGVib29rUmVuZGVyaW5nQ29tbW9uLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvY29kZUNlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxMYXlvdXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2NvZGVDZWxsLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbExheW91dEluZm8sIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuXG5zdWl0ZSgnQ2VsbFBhcnQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0NvZGVDZWxsTGF5b3V0IGVkaXRvciB2aXNpYmlsaXR5IHN0YXRlcycsICgpID0+IHtcblx0XHQvKipcblx0XHQgKiBXZSBjb25zdHJ1Y3QgYSB2ZXJ5IHNtYWxsIG1vY2sgYXJvdW5kIHRoZSBwYXJ0cyB0aGF0IGBDb2RlQ2VsbExheW91dGAgdG91Y2hlcy4gVGhlIGdvYWxcblx0XHQgKiBpcyB0byB2YWxpZGF0ZSB0aGUgYnJhbmNoaW5nIGxvZ2ljIHRoYXQgc2V0cyBgX2VkaXRvclZpc2liaWxpdHlgIHdpdGhvdXQgbXV0YXRpbmcgYW55XG5cdFx0ICogcHJvZHVjdGlvbiBjb2RlLiBFYWNoIHNjZW5hcmlvIHNldHMgdXAgZ2VvbWV0cnkgJiBzY3JvbGwgdmFsdWVzIHRoZW4gaW52b2tlc1xuXHRcdCAqIGBsYXlvdXRFZGl0b3IoKWAgYW5kIGFzc2VydHMgdGhlIHJlc3VsdGluZyB2aXNpYmlsaXR5IGNsYXNzaWZpY2F0aW9uLlxuXHRcdCAqL1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RTY2VuYXJpbyB7XG5cdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHRzY3JvbGxUb3A6IG51bWJlcjtcblx0XHRcdHZpZXdwb3J0SGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRlZGl0b3JIZWlnaHQ6IG51bWJlcjsgLy8gdmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHRcblx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogbnVtYmVyOyAvLyBlbGVtZW50VG9wICsgdGhpcyBvZmZzZXQgPT4gZWRpdG9yQm90dG9tXG5cdFx0XHRleHBlY3RlZDogc3RyaW5nOyAvLyBDb2RlQ2VsbExheW91dC5lZGl0b3JWaXNpYmlsaXR5XG5cdFx0XHRwb3N0U2Nyb2xsVG9wPzogbnVtYmVyOyAvLyBleHBlY3RlZCBlZGl0b3Igc2Nyb2xsVG9wIHdyaXR0ZW4gaW50byBzdHViIGVkaXRvclxuXHRcdFx0ZWxlbWVudFRvcDogbnVtYmVyOyAvLyBub3cgc2NlbmFyaW8tc3BlY2lmaWMgZm9yIGNsYXJpdHlcblx0XHRcdGVsZW1lbnRIZWlnaHQ6IG51bWJlcjsgLy8gc2NlbmFyaW8tc3BlY2lmaWMgY29udGFpbmVyIGhlaWdodFxuXHRcdFx0ZXhwZWN0ZWRUb3A6IG51bWJlcjsgLy8gZXhwZWN0ZWQgY29tcHV0ZWQgQ1NTIHRvcCAobnVtZXJpYyBweClcblx0XHRcdGV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wOiBudW1iZXI7IC8vIGV4cGVjdGVkIGFyZ3VtZW50IHBhc3NlZCB0byBlZGl0b3Iuc2V0U2Nyb2xsVG9wXG5cdFx0fVxuXG5cdFx0Y29uc3QgREVGQVVMVF9FTEVNRU5UX1RPUCA9IDEwMDsgLy8gYWJzb2x1dGUgdG9wIG9mIHRoZSBjZWxsIGluIG5vdGVib29rIGNvb3JkaW5hdGVzXG5cdFx0Y29uc3QgREVGQVVMVF9FTEVNRU5UX0hFSUdIVCA9IDkwMDsgLy8gYXJiaXRyYXJ5LCBsYXJnZSBlbm91Z2ggbm90IHRvIGNvbnN0cmFpblxuXHRcdGNvbnN0IFNUQVRVU0JBUiA9IDIyO1xuXHRcdGNvbnN0IFRPUF9NQVJHSU4gPSA2OyAvLyBtaXJyb3JzIGxheW91dEluZm8udG9wTWFyZ2luIHVzYWdlXG5cdFx0Y29uc3QgT1VUTElORSA9IDE7XG5cblx0XHRjb25zdCBzY2VuYXJpb3M6IFRlc3RTY2VuYXJpb1tdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnRnVsbCcsXG5cdFx0XHRcdHNjcm9sbFRvcDogMCxcblx0XHRcdFx0dmlld3BvcnRIZWlnaHQ6IDQwMCxcblx0XHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodDogMzAwLFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IDMwMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiAzMDAsIC8vIGVkaXRvckJvdHRvbSA9IDEwMCArIDMwMCA9IDQwMCwgZnVsbHkgaW5zaWRlIHZpZXdwb3J0IChzY3JvbGxCb3R0b209NDAwKVxuXHRcdFx0XHRleHBlY3RlZDogJ0Z1bGwnLFxuXHRcdFx0XHRlbGVtZW50VG9wOiBERUZBVUxUX0VMRU1FTlRfVE9QLFxuXHRcdFx0XHRlbGVtZW50SGVpZ2h0OiBERUZBVUxUX0VMRU1FTlRfSEVJR0hULFxuXHRcdFx0XHRleHBlY3RlZFRvcDogMCxcblx0XHRcdFx0ZXhwZWN0ZWRFZGl0b3JTY3JvbGxUb3A6IDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnQm90dG9tIENsaXBwZWQnLFxuXHRcdFx0XHRzY3JvbGxUb3A6IDAsXG5cdFx0XHRcdHZpZXdwb3J0SGVpZ2h0OiAzNTAsIC8vIHNjcm9sbEJvdHRvbT0zNTAgPCBlZGl0b3JCb3R0b20oNDAwKVxuXHRcdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0OiAzMDAsXG5cdFx0XHRcdGVkaXRvckhlaWdodDogMzAwLFxuXHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IDMwMCxcblx0XHRcdFx0ZXhwZWN0ZWQ6ICdCb3R0b20gQ2xpcHBlZCcsXG5cdFx0XHRcdGVsZW1lbnRUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AsXG5cdFx0XHRcdGVsZW1lbnRIZWlnaHQ6IERFRkFVTFRfRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRcdGV4cGVjdGVkVG9wOiAwLFxuXHRcdFx0XHRleHBlY3RlZEVkaXRvclNjcm9sbFRvcDogMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdGdWxsIChTbWFsbCBWaWV3cG9ydCknLFxuXHRcdFx0XHRzY3JvbGxUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AgKyBUT1BfTUFSR0lOICsgMjAsIC8vIHNjcm9sbGVkIGludG8gdGhlIGNlbGwgYm9keVxuXHRcdFx0XHR2aWV3cG9ydEhlaWdodDogMjIwLCAvLyBzbWFsbCB2cyBjb250ZW50XG5cdFx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQ6IDUwMCwgLy8gbGFyZ2VyIHRoYW4gdmlld3BvcnQgc28gd2UgY2xhbXBcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiA1MDAsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogNjAwLCAvLyBlZGl0b3JCb3R0b209NzAwID4gc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGV4cGVjdGVkOiAnRnVsbCAoU21hbGwgVmlld3BvcnQpJyxcblx0XHRcdFx0ZWxlbWVudFRvcDogREVGQVVMVF9FTEVNRU5UX1RPUCxcblx0XHRcdFx0ZWxlbWVudEhlaWdodDogREVGQVVMVF9FTEVNRU5UX0hFSUdIVCxcblx0XHRcdFx0ZXhwZWN0ZWRUb3A6IDE5LCAvLyAoc2Nyb2xsVG9wIC0gZWxlbWVudFRvcCAtIHRvcE1hcmdpbiAtIG91dGxpbmVXaWR0aCkgPSAoMTAwKzYrMjAgLTEwMCAtNiAtMSlcblx0XHRcdFx0ZXhwZWN0ZWRFZGl0b3JTY3JvbGxUb3A6IDE5LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ1RvcCBDbGlwcGVkJyxcblx0XHRcdFx0c2Nyb2xsVG9wOiBERUZBVUxUX0VMRU1FTlRfVE9QICsgVE9QX01BUkdJTiArIDQwLCAvLyBzY3JvbGxlZCBmdXJ0aGVyIGRvd24gYnV0IG5vdCBwYXN0IGJvdHRvbVxuXHRcdFx0XHR2aWV3cG9ydEhlaWdodDogNjAwLCAvLyBsYXJnZXIgdGhhbiBjb250ZW50IGhlaWdodCBiZWxvdyAoZm9yY2VzIGJyYW5jaCBmb3IgVG9wIENsaXBwZWQpXG5cdFx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQ6IDIwMCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiAyMDAsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogNDUwLCAvLyBlZGl0b3JCb3R0b209NTUwOyBzY3JvbGxCb3R0b209IHNjcm9sbFRvcCt2aWV3cG9ydEhlaWdodCA9ID4gNTUwPyAgKDU0MCs2MDA9MTE0MCkgYnV0IHdlIG9ubHkgbmVlZCBzY3JvbGxUb3AgPCBlZGl0b3JCb3R0b21cblx0XHRcdFx0ZXhwZWN0ZWQ6ICdUb3AgQ2xpcHBlZCcsXG5cdFx0XHRcdGVsZW1lbnRUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AsXG5cdFx0XHRcdGVsZW1lbnRIZWlnaHQ6IERFRkFVTFRfRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRcdGV4cGVjdGVkVG9wOiAzOSwgLy8gKDEwMCs2KzQwIC0xMDAgLTYgLTEpXG5cdFx0XHRcdGV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wOiA0MCwgLy8gY29udGVudEhlaWdodCgyMDApIC0gY29tcHV0ZWQgaGVpZ2h0KDE2MClcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdJbnZpc2libGUnLFxuXHRcdFx0XHRzY3JvbGxUb3A6IERFRkFVTFRfRUxFTUVOVF9UT1AgKyAxMDAwLCAvLyB3ZWxsIGJlbG93IGVkaXRvciBib3R0b21cblx0XHRcdFx0dmlld3BvcnRIZWlnaHQ6IDQwMCxcblx0XHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodDogMzAwLFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IDMwMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiAzMDAsIC8vIGVkaXRvckJvdHRvbT00MDAgPCBzY3JvbGxUb3Bcblx0XHRcdFx0ZXhwZWN0ZWQ6ICdJbnZpc2libGUnLFxuXHRcdFx0XHRlbGVtZW50VG9wOiBERUZBVUxUX0VMRU1FTlRfVE9QLFxuXHRcdFx0XHRlbGVtZW50SGVpZ2h0OiBERUZBVUxUX0VMRU1FTlRfSEVJR0hULFxuXHRcdFx0XHRleHBlY3RlZFRvcDogMjc4LCAvLyBhZGp1c3RlZCBhZnRlciBlbnN1cmluZyBtaW5pbXVtIGxpbmUgaGVpZ2h0IHdoZW4gcG9zc2libGVFZGl0b3JIZWlnaHQgPCBMSU5FX0hFSUdIVFxuXHRcdFx0XHRleHBlY3RlZEVkaXRvclNjcm9sbFRvcDogMjc5LCAvLyBjb250ZW50SGVpZ2h0KDMwMCkgLSBjbGFtcGVkIGhlaWdodCgyMSlcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgcyBvZiBzY2VuYXJpb3MpIHtcblx0XHRcdC8vIEZyZXNoIHN0dWIgb2JqZWN0cyBwZXIgc2NlbmFyaW9cblx0XHRcdGNvbnN0IGVkaXRvclNjcm9sbFN0YXRlOiB7IHNjcm9sbFRvcDogbnVtYmVyIH0gPSB7IHNjcm9sbFRvcDogMCB9O1xuXHRcdFx0Y29uc3Qgc3R1YkVkaXRvciA9IHtcblx0XHRcdFx0bGF5b3V0Q2FsbHM6IFtdIGFzIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdLFxuXHRcdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7IHdpZHRoOiA2MDAsIGhlaWdodDogcy5lZGl0b3JIZWlnaHQgfSksXG5cdFx0XHRcdGdldENvbnRlbnRIZWlnaHQ6ICgpID0+IHMuZWRpdG9yQ29udGVudEhlaWdodCxcblx0XHRcdFx0bGF5b3V0OiAoZGltOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLnB1c2goZGltKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0ZWRpdG9yU2Nyb2xsU3RhdGUuc2Nyb2xsVG9wID0gdjtcblx0XHRcdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gdjtcblx0XHRcdFx0fSxcblx0XHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRcdGNvbnN0IHRlbXBsYXRlOiBQYXJ0aWFsPENvZGVDZWxsUmVuZGVyVGVtcGxhdGU+ID0ge1xuXHRcdFx0XHRlZGl0b3I6IHN0dWJFZGl0b3IgYXMgdW5rbm93biBhcyBJQ29kZUVkaXRvcixcblx0XHRcdFx0ZWRpdG9yUGFydDogZWRpdG9yUGFydCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50LFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gdmlld0NlbGwgc3R1YiB3aXRoIG9ubHkgbmVlZGVkIHBpZWNlc1xuXHRcdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0XHRpc0lucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRcdC8vIHZhbHVlcyByZWZlcmVuY2VkIGluIGxheW91dCBsb2dpY1xuXHRcdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSLFxuXHRcdFx0XHRcdHRvcE1hcmdpbjogVE9QX01BUkdJTixcblx0XHRcdFx0XHRvdXRsaW5lV2lkdGg6IE9VVExJTkUsXG5cdFx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiBzLmVkaXRvckhlaWdodCxcblx0XHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IHMub3V0cHV0Q29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gbm90ZWJvb2sgZWRpdG9yIHN0dWJcblx0XHRcdGxldCBzY3JvbGxCb3R0b20gPSBzLnNjcm9sbFRvcCArIHMudmlld3BvcnRIZWlnaHQ7XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHtcblx0XHRcdFx0c2Nyb2xsVG9wOiBzLnNjcm9sbFRvcCxcblx0XHRcdFx0Z2V0IHNjcm9sbEJvdHRvbSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gc2Nyb2xsQm90dG9tO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgPSB2O1xuXHRcdFx0XHRcdHNjcm9sbEJvdHRvbSA9IHYgKyBzLnZpZXdwb3J0SGVpZ2h0O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IDIxIH0sXG5cdFx0XHRcdFx0aGVpZ2h0OiBzLnZpZXdwb3J0SGVpZ2h0LFxuXHRcdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBzLmVsZW1lbnRUb3AsXG5cdFx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PlxuXHRcdFx0XHRcdHMuZWxlbWVudFRvcCArIHMub3V0cHV0Q29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHRnZXRIZWlnaHRPZkVsZW1lbnQ6ICgpID0+IHMuZWxlbWVudEhlaWdodCxcblx0XHRcdFx0bm90ZWJvb2tPcHRpb25zOiB7XG5cdFx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGxheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dChcblx0XHRcdFx0LyogZW5hYmxlZCAqLyB0cnVlLFxuXHRcdFx0XHRub3RlYm9va0VkaXRvciBhcyB1bmtub3duIGFzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdFx0dGVtcGxhdGUgYXMgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRlYnVnOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHQvKiBuby1vcCAqL1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBzLmVkaXRvckhlaWdodCB9XG5cdFx0XHQpO1xuXG5cdFx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCdpbml0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGxheW91dC5lZGl0b3JWaXNpYmlsaXR5LFxuXHRcdFx0XHRzLmV4cGVjdGVkLFxuXHRcdFx0XHRgU2NlbmFyaW8gJyR7cy5uYW1lfScgKHNjcm9sbFRvcD0ke3Muc2Nyb2xsVG9wfSkgZXhwZWN0ZWQgdmlzaWJpbGl0eSAke3MuZXhwZWN0ZWR9IGJ1dCBnb3QgJHtsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eX1gXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgYWN0dWFsVG9wID0gcGFyc2VJbnQoXG5cdFx0XHRcdChlZGl0b3JQYXJ0LnN0eWxlLnRvcCB8fCAnMCcpLnJlcGxhY2UoL3B4JC8sICcnKVxuXHRcdFx0KTsgLy8gc3R5bGUudG9wIGFsd2F5cyBsaWtlICdOTk5weCdcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YWN0dWFsVG9wLFxuXHRcdFx0XHRzLmV4cGVjdGVkVG9wLFxuXHRcdFx0XHRgU2NlbmFyaW8gJyR7cy5uYW1lfScgKHNjcm9sbFRvcD0ke3Muc2Nyb2xsVG9wfSkgZXhwZWN0ZWQgdG9wICR7cy5leHBlY3RlZFRvcH1weCBidXQgZ290ICR7ZWRpdG9yUGFydC5zdHlsZS50b3B9YFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCxcblx0XHRcdFx0cy5leHBlY3RlZEVkaXRvclNjcm9sbFRvcCxcblx0XHRcdFx0YFNjZW5hcmlvICcke3MubmFtZX0nIChzY3JvbGxUb3A9JHtzLnNjcm9sbFRvcH0pIGV4cGVjdGVkIGVkaXRvci5zZXRTY3JvbGxUb3AoJHtzLmV4cGVjdGVkRWRpdG9yU2Nyb2xsVG9wfSkgYnV0IGdvdCAke3N0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXR9YFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQmFzaWMgc2FuaXR5OiBzdHlsZS50b3Agc2hvdWxkIGFsd2F5cyBiZSBzZXQgd2hlbiB2aXNpYmxlIHN0YXRlcyBvdGhlciB0aGFuIEZ1bGwgKGhhbmRsZWQpIG9yIEludmlzaWJsZS5cblx0XHRcdGlmIChzLmV4cGVjdGVkICE9PSAnSW52aXNpYmxlJykge1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZWRpdG9yUGFydC5zdHlsZS50b3AsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0YFNjZW5hcmlvICcke3MubmFtZX0nIHNob3VsZCBzZXQgYSB0b3Agc3R5bGUgdmFsdWVgXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBJbnZpc2libGUgc3RpbGwgc2V0cyBhIHRvcDsganVzdCBlbnN1cmUgbGF5b3V0IHJhblxuXHRcdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdFx0ZWRpdG9yUGFydC5zdHlsZS50b3AgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQnSW52aXNpYmxlIHNjZW5hcmlvIHN0aWxsIHBlcmZvcm1zIGEgbGF5b3V0J1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU2Nyb2xsaW5nJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIFBpeGVsLWJ5LXBpeGVsIHNjcm9sbCB0ZXN0IHRvIHZhbGlkYXRlIGBDb2RlQ2VsbExheW91dGAgY2FsY3VsYXRpb25zIGZvcjpcblx0XHQgKiAgLSBlZGl0b3JQYXJ0LnN0eWxlLnRvcFxuXHRcdCAqICAtIGVkaXRvclZpc2liaWxpdHkgY2xhc3NpZmljYXRpb25cblx0XHQgKiAgLSBlZGl0b3IgaW50ZXJuYWwgc2Nyb2xsVG9wIHBhc3NlZCB0byBzZXRTY3JvbGxUb3Bcblx0XHQgKlxuXHRcdCAqIFdlIGludGVudGlvbmFsbHkgbWlycm9yIHRoZSBwcm9kdWN0aW9uIG1hdGggaW4gYSBoZWxwZXIgKGR1cGxpY2F0aW9uIGFjY2VwdGFibGUgaW4gdGVzdCkgc29cblx0XHQgKiB0aGF0IGFueSBkaXZlcmdlbmNlIGlzIGNhdWdodC4gQ29uc3RhbnRzIGNob3NlbiB0byBleGVyY2lzZSBhbGwgc3RhdGUgdHJhbnNpdGlvbnMuXG5cdFx0ICovXG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTsgLy8gZnJvbSBnZXRMYXlvdXRJbmZvKCkuZm9udEluZm8ubGluZUhlaWdodCBpbiBzdHVic1xuXHRcdGNvbnN0IENFTExfVE9QX01BUkdJTiA9IDY7XG5cdFx0Y29uc3QgQ0VMTF9PVVRMSU5FX1dJRFRIID0gMTtcblx0XHRjb25zdCBTVEFUVVNCQVJfSEVJR0hUID0gMjI7XG5cdFx0Y29uc3QgVklFV1BPUlRfSEVJR0hUID0gMzAwOyAvLyBub3RlYm9vayB2aWV3cG9ydCBoZWlnaHRcblx0XHRjb25zdCBFTEVNRU5UX1RPUCA9IDEwMDsgLy8gYWJzb2x1dGUgdG9wXG5cdFx0Y29uc3QgRURJVE9SX0NPTlRFTlRfSEVJR0hUID0gODAwOyAvLyB0YWxsIGNvbnRlbnQgc28gd2UgZ2V0IGNsaXBwaW5nIGFuZCBzbWFsbCB2aWV3cG9ydCBzdGF0ZXNcblx0XHRjb25zdCBFRElUT1JfSEVJR0hUID0gRURJVE9SX0NPTlRFTlRfSEVJR0hUOyAvLyBpbml0aWFsIGxheW91dEluZm8uZWRpdG9ySGVpZ2h0XG5cdFx0Y29uc3QgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQgPSA4MDA7IC8vIGJvdHRvbSBvZiBlZGl0b3IgcmVnaW9uIHJlbGF0aXZlIHRvIGVsZW1lbnRUb3Bcblx0XHRjb25zdCBFTEVNRU5UX0hFSUdIVCA9IDEyMDA7IC8vIGxhcmdlIGNvbnRhaW5lclxuXG5cdFx0ZnVuY3Rpb24gY2xhbXAodjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcblx0XHRcdHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2LCBtaW4pLCBtYXgpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNvbXB1dGVFeHBlY3RlZChzY3JvbGxUb3A6IG51bWJlcikge1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gc2Nyb2xsVG9wICsgVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHRjb25zdCBlZGl0b3JCb3R0b20gPSBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VUO1xuXHRcdFx0bGV0IHRvcCA9IE1hdGgubWF4KFxuXHRcdFx0XHQwLFxuXHRcdFx0XHRzY3JvbGxUb3AgLSBFTEVNRU5UX1RPUCAtIENFTExfVE9QX01BUkdJTiAtIENFTExfT1VUTElORV9XSURUSFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHBvc3NpYmxlRWRpdG9ySGVpZ2h0ID0gRURJVE9SX0hFSUdIVCAtIHRvcDtcblx0XHRcdGlmIChwb3NzaWJsZUVkaXRvckhlaWdodCA8IExJTkVfSEVJR0hUKSB7XG5cdFx0XHRcdHRvcCA9IHRvcCAtIChMSU5FX0hFSUdIVCAtIHBvc3NpYmxlRWRpdG9ySGVpZ2h0KSAtIENFTExfT1VUTElORV9XSURUSDtcblx0XHRcdH1cblx0XHRcdGxldCBoZWlnaHQgPSBFRElUT1JfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0XHRsZXQgdmlzaWJpbGl0eTogc3RyaW5nID0gJ0Z1bGwnO1xuXHRcdFx0bGV0IGVkaXRvclNjcm9sbFRvcCA9IDA7XG5cdFx0XHRpZiAoc2Nyb2xsVG9wIDw9IEVMRU1FTlRfVE9QICsgQ0VMTF9UT1BfTUFSR0lOKSB7XG5cdFx0XHRcdGNvbnN0IG1pbmltdW1FZGl0b3JIZWlnaHQgPSBMSU5FX0hFSUdIVCArIDY7IC8vIGVkaXRvclRvcFBhZGRpbmcgZnJvbSBjb25maWd1cmF0aW9uIHN0dWIgKDYpXG5cdFx0XHRcdGlmIChzY3JvbGxCb3R0b20gPj0gZWRpdG9yQm90dG9tKSB7XG5cdFx0XHRcdFx0aGVpZ2h0ID0gY2xhbXAoXG5cdFx0XHRcdFx0XHRFRElUT1JfQ09OVEVOVF9IRUlHSFQsXG5cdFx0XHRcdFx0XHRtaW5pbXVtRWRpdG9ySGVpZ2h0LFxuXHRcdFx0XHRcdFx0RURJVE9SX0NPTlRFTlRfSEVJR0hUXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR2aXNpYmlsaXR5ID0gJ0Z1bGwnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhlaWdodCA9XG5cdFx0XHRcdFx0XHRjbGFtcChcblx0XHRcdFx0XHRcdFx0c2Nyb2xsQm90dG9tIC0gKEVMRU1FTlRfVE9QICsgQ0VMTF9UT1BfTUFSR0lOKSAtIFNUQVRVU0JBUl9IRUlHSFQsXG5cdFx0XHRcdFx0XHRcdG1pbmltdW1FZGl0b3JIZWlnaHQsXG5cdFx0XHRcdFx0XHRcdEVESVRPUl9DT05URU5UX0hFSUdIVFxuXHRcdFx0XHRcdFx0KSArXG5cdFx0XHRcdFx0XHQyICogQ0VMTF9PVVRMSU5FX1dJRFRIO1xuXHRcdFx0XHRcdHZpc2liaWxpdHkgPSAnQm90dG9tIENsaXBwZWQnO1xuXHRcdFx0XHRcdGVkaXRvclNjcm9sbFRvcCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR2aWV3cG9ydEhlaWdodCA8PSBFRElUT1JfQ09OVEVOVF9IRUlHSFQgJiZcblx0XHRcdFx0XHRzY3JvbGxCb3R0b20gPD0gZWRpdG9yQm90dG9tXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnN0IG1pbmltdW1FZGl0b3JIZWlnaHQgPSBMSU5FX0hFSUdIVCArIDY7IC8vIGVkaXRvclRvcFBhZGRpbmdcblx0XHRcdFx0XHRoZWlnaHQgPVxuXHRcdFx0XHRcdFx0Y2xhbXAoXG5cdFx0XHRcdFx0XHRcdHZpZXdwb3J0SGVpZ2h0IC0gU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0XHRcdFx0bWluaW11bUVkaXRvckhlaWdodCxcblx0XHRcdFx0XHRcdFx0RURJVE9SX0NPTlRFTlRfSEVJR0hUIC0gU1RBVFVTQkFSX0hFSUdIVFxuXHRcdFx0XHRcdFx0KSArXG5cdFx0XHRcdFx0XHQyICogQ0VMTF9PVVRMSU5FX1dJRFRIO1xuXHRcdFx0XHRcdHZpc2liaWxpdHkgPSAnRnVsbCAoU21hbGwgVmlld3BvcnQpJztcblx0XHRcdFx0XHRlZGl0b3JTY3JvbGxUb3AgPSB0b3A7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUO1xuXHRcdFx0XHRcdGhlaWdodCA9IGNsYW1wKFxuXHRcdFx0XHRcdFx0RURJVE9SX0NPTlRFTlRfSEVJR0hUIC1cblx0XHRcdFx0XHRcdChzY3JvbGxUb3AgLSAoRUxFTUVOVF9UT1AgKyBDRUxMX1RPUF9NQVJHSU4pKSxcblx0XHRcdFx0XHRcdG1pbmltdW1FZGl0b3JIZWlnaHQsXG5cdFx0XHRcdFx0XHRFRElUT1JfQ09OVEVOVF9IRUlHSFRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmIChzY3JvbGxUb3AgPiBlZGl0b3JCb3R0b20pIHtcblx0XHRcdFx0XHRcdHZpc2liaWxpdHkgPSAnSW52aXNpYmxlJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dmlzaWJpbGl0eSA9ICdUb3AgQ2xpcHBlZCc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVkaXRvclNjcm9sbFRvcCA9IEVESVRPUl9DT05URU5UX0hFSUdIVCAtIGhlaWdodDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdG9wLCB2aXNpYmlsaXR5LCBlZGl0b3JTY3JvbGxUb3AgfTtcblx0XHR9XG5cblx0XHQvLyBTaGFyZWQgc3R1YnMgKHdlJ2xsIG11dGF0ZSBzY3JvbGxUb3AgZWFjaCBpdGVyYXRpb24pIFx1MjAxMyB3ZSByZS1jcmVhdGUgbGF5b3V0IGVhY2ggaXRlcmF0aW9uIHRvIHJlc2V0IGludGVybmFsIHN0YXRlIGNoYW5nZXNcblx0XHRmb3IgKFxuXHRcdFx0bGV0IHNjcm9sbFRvcCA9IDA7XG5cdFx0XHRzY3JvbGxUb3AgPD0gVklFV1BPUlRfSEVJR0hUICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQgKyAyMDtcblx0XHRcdHNjcm9sbFRvcCsrXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IGNvbXB1dGVFeHBlY3RlZChzY3JvbGxUb3ApO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gc2Nyb2xsVG9wICsgVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0Y29uc3Qgc3R1YkVkaXRvciA9IHtcblx0XHRcdFx0X2xhc3RTY3JvbGxUb3BTZXQ6IC0xLFxuXHRcdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoeyB3aWR0aDogNjAwLCBoZWlnaHQ6IEVESVRPUl9IRUlHSFQgfSksXG5cdFx0XHRcdGdldENvbnRlbnRIZWlnaHQ6ICgpID0+IEVESVRPUl9DT05URU5UX0hFSUdIVCxcblx0XHRcdFx0bGF5b3V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0Lyogbm8tb3AgKi9cblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhhc01vZGVsOiAoKSA9PiB0cnVlLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGVkaXRvclBhcnQgPSB7IHN0eWxlOiB7IHRvcDogJycgfSB9O1xuXHRcdFx0Y29uc3QgdGVtcGxhdGU6IFBhcnRpYWw8Q29kZUNlbGxSZW5kZXJUZW1wbGF0ZT4gPSB7XG5cdFx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JQYXJ0OiBlZGl0b3JQYXJ0IGFzIHVua25vd24gYXMgSFRNTEVsZW1lbnQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0XHRpc0lucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0XHR0b3BNYXJnaW46IENFTExfVE9QX01BUkdJTixcblx0XHRcdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdFx0XHRlZGl0b3JIZWlnaHQ6IEVESVRPUl9IRUlHSFQsXG5cdFx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0OiBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIENvZGVDZWxsTGF5b3V0SW5mbyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHtcblx0XHRcdFx0c2Nyb2xsVG9wLFxuXHRcdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRcdHJldHVybiBzY3JvbGxCb3R0b207XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdC8qIG5vdGVib29rIHNjcm9sbCBjaGFuZ2VzIGFyZSBub3QgdGhlIGZvY3VzIGhlcmUgKi9cblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHtcblx0XHRcdFx0XHRmb250SW5mbzogeyBsaW5lSGVpZ2h0OiBMSU5FX0hFSUdIVCB9LFxuXHRcdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdFx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRcdGdldExheW91dENvbmZpZ3VyYXRpb246ICgpID0+ICh7IGVkaXRvclRvcFBhZGRpbmc6IDYgfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRub3RlYm9va0VkaXRvciBhcyB1bmtub3duIGFzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdFx0dGVtcGxhdGUgYXMgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRcdFx0eyBkZWJ1ZzogKCkgPT4geyB9IH0sXG5cdFx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBFRElUT1JfSEVJR0hUIH1cblx0XHRcdCk7XG5cdFx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCduYkRpZFNjcm9sbCcpO1xuXHRcdFx0Y29uc3QgYWN0dWFsVG9wID0gcGFyc2VJbnQoXG5cdFx0XHRcdChlZGl0b3JQYXJ0LnN0eWxlLnRvcCB8fCAnMCcpLnJlcGxhY2UoL3B4JC8sICcnKVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YWN0dWFsVG9wLFxuXHRcdFx0XHRleHBlY3RlZC50b3AsXG5cdFx0XHRcdGBzY3JvbGxUb3A9JHtzY3JvbGxUb3B9OiBleHBlY3RlZCB0b3AgJHtleHBlY3RlZC50b3B9LCBnb3QgJHthY3R1YWxUb3B9YFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0bGF5b3V0LmVkaXRvclZpc2liaWxpdHksXG5cdFx0XHRcdGV4cGVjdGVkLnZpc2liaWxpdHksXG5cdFx0XHRcdGBzY3JvbGxUb3A9JHtzY3JvbGxUb3B9OiBleHBlY3RlZCB2aXNpYmlsaXR5ICR7ZXhwZWN0ZWQudmlzaWJpbGl0eX0sIGdvdCAke2xheW91dC5lZGl0b3JWaXNpYmlsaXR5fWBcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQsXG5cdFx0XHRcdGV4cGVjdGVkLmVkaXRvclNjcm9sbFRvcCxcblx0XHRcdFx0YHNjcm9sbFRvcD0ke3Njcm9sbFRvcH06IGV4cGVjdGVkIGVkaXRvclNjcm9sbFRvcCAke2V4cGVjdGVkLmVkaXRvclNjcm9sbFRvcH0sIGdvdCAke3N0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXR9YFxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0NvZGVDZWxsTGF5b3V0IHJldXNlcyBjb250ZW50IGhlaWdodCBhZnRlciBpbml0JywgKCkgPT4ge1xuXHRcdGNvbnN0IExJTkVfSEVJR0hUID0gMjE7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IENFTExfVE9QX01BUkdJTiA9IDY7XG5cdFx0Y29uc3QgQ0VMTF9PVVRMSU5FX1dJRFRIID0gMTtcblx0XHRjb25zdCBWSUVXUE9SVF9IRUlHSFQgPSAxMDAwO1xuXHRcdGNvbnN0IEVMRU1FTlRfVE9QID0gMTAwO1xuXHRcdGNvbnN0IEVMRU1FTlRfSEVJR0hUID0gMTIwMDtcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDMwMDtcblx0XHRjb25zdCBFRElUT1JfSEVJR0hUID0gODAwO1xuXG5cdFx0bGV0IGNvbnRlbnRIZWlnaHQgPSA4MDA7XG5cdFx0Y29uc3Qgc3R1YkVkaXRvciA9IHtcblx0XHRcdGxheW91dENhbGxzOiBbXSBhcyB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH1bXSxcblx0XHRcdF9sYXN0U2Nyb2xsVG9wU2V0OiAtMSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7IHdpZHRoOiA2MDAsIGhlaWdodDogRURJVE9SX0hFSUdIVCB9KSxcblx0XHRcdGdldENvbnRlbnRIZWlnaHQ6ICgpID0+IGNvbnRlbnRIZWlnaHQsXG5cdFx0XHRsYXlvdXQ6IChkaW06IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLnB1c2goZGltKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0ZWRpdG9yUGFydDogZWRpdG9yUGFydCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50LFxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNJbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdFx0dG9wTWFyZ2luOiBDRUxMX1RPUF9NQVJHSU4sXG5cdFx0XHRcdG91dGxpbmVXaWR0aDogQ0VMTF9PVVRMSU5FX1dJRFRILFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQ6IEVESVRPUl9IRUlHSFQsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRcdGVkaXRvcldpZHRoOiA2MDAsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB7XG5cdFx0XHRzY3JvbGxUb3A6IDAsXG5cdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRyZXR1cm4gVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHQvKiBuby1vcCAqL1xuXHRcdFx0fSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHR9KSxcblx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdHRlbXBsYXRlIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBFRElUT1JfSEVJR0hUIH1cblx0XHQpO1xuXG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSwgJ0Z1bGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCwgODAwKTtcblxuXHRcdC8vIFNpbXVsYXRlIE1vbmFjbyByZXBvcnRpbmcgYSB0cmFuc2llbnQgc21hbGxlciBjb250ZW50IGhlaWdodCBvbiBzY3JvbGwuXG5cdFx0Y29udGVudEhlaWdodCA9IDIwMDtcblx0XHRsYXlvdXQubGF5b3V0RWRpdG9yKCduYkRpZFNjcm9sbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSwgJ0Z1bGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LFxuXHRcdFx0ODAwLFxuXHRcdFx0J25iRGlkU2Nyb2xsIHNob3VsZCByZXVzZSB0aGUgZXN0YWJsaXNoZWQgY29udGVudCBoZWlnaHQnXG5cdFx0KTtcblxuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ29uRGlkQ29udGVudFNpemVDaGFuZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0LmVkaXRvclZpc2liaWxpdHksICdGdWxsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCxcblx0XHRcdDIwMCxcblx0XHRcdCdvbkRpZENvbnRlbnRTaXplQ2hhbmdlIHNob3VsZCByZWZyZXNoIHRoZSBjb250ZW50IGhlaWdodCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQ2VsbExheW91dCByZWZyZXNoZXMgY29udGVudCBoZWlnaHQgb24gdmlld0NlbGxMYXlvdXRDaGFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgTElORV9IRUlHSFQgPSAyMTtcblx0XHRjb25zdCBDRUxMX1RPUF9NQVJHSU4gPSA2O1xuXHRcdGNvbnN0IENFTExfT1VUTElORV9XSURUSCA9IDE7XG5cdFx0Y29uc3QgU1RBVFVTQkFSX0hFSUdIVCA9IDIyO1xuXHRcdGNvbnN0IFZJRVdQT1JUX0hFSUdIVCA9IDEwMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9UT1AgPSAxMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9IRUlHSFQgPSAxMjAwO1xuXHRcdGNvbnN0IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQgPSAzNztcblx0XHRjb25zdCBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCA9IDMwMDtcblx0XHRjb25zdCBVUERBVEVEX0NPTlRFTlRfSEVJR0hUID0gMjAwO1xuXG5cdFx0bGV0IGNvbnRlbnRIZWlnaHQgPSBJTklUSUFMX0NPTlRFTlRfSEVJR0hUO1xuXHRcdGNvbnN0IHN0dWJFZGl0b3IgPSB7XG5cdFx0XHRsYXlvdXRDYWxsczogW10gYXMgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W10sXG5cdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoeyB3aWR0aDogNjAwLCBoZWlnaHQ6IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQgfSksXG5cdFx0XHRnZXRDb250ZW50SGVpZ2h0OiAoKSA9PiBjb250ZW50SGVpZ2h0LFxuXHRcdFx0bGF5b3V0OiAoZGltOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0c3R1YkVkaXRvci5sYXlvdXRDYWxscy5wdXNoKGRpbSk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQgPSB2O1xuXHRcdFx0fSxcblx0XHRcdGhhc01vZGVsOiAoKSA9PiB0cnVlLFxuXHRcdH07XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHsgc3R5bGU6IHsgdG9wOiAnJyB9IH07XG5cdFx0Y29uc3QgdGVtcGxhdGU6IFBhcnRpYWw8Q29kZUNlbGxSZW5kZXJUZW1wbGF0ZT4gPSB7XG5cdFx0XHRlZGl0b3I6IHN0dWJFZGl0b3IgYXMgdW5rbm93biBhcyBJQ29kZUVkaXRvcixcblx0XHRcdGVkaXRvclBhcnQ6IGVkaXRvclBhcnQgYXMgdW5rbm93biBhcyBIVE1MRWxlbWVudCxcblx0XHR9O1xuXHRcdGNvbnN0IHZpZXdDZWxsOiBQYXJ0aWFsPENvZGVDZWxsVmlld01vZGVsPiA9IHtcblx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRzdGF0dXNCYXJIZWlnaHQ6IFNUQVRVU0JBUl9IRUlHSFQsXG5cdFx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiBJTklUSUFMX0NPTlRFTlRfSEVJR0hULFxuXHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0XHRlZGl0b3JXaWR0aDogNjAwLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIENvZGVDZWxsTGF5b3V0SW5mbyxcblx0XHR9O1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0c2Nyb2xsVG9wOiAwLFxuXHRcdFx0Z2V0IHNjcm9sbEJvdHRvbSgpIHtcblx0XHRcdFx0cmV0dXJuIFZJRVdQT1JUX0hFSUdIVDtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0Lyogbm8tb3AgKi9cblx0XHRcdH0sXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRmb250SW5mbzogeyBsaW5lSGVpZ2h0OiBMSU5FX0hFSUdIVCB9LFxuXHRcdFx0XHRoZWlnaHQ6IFZJRVdQT1JUX0hFSUdIVCxcblx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0fSksXG5cdFx0XHRnZXRBYnNvbHV0ZVRvcE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AsXG5cdFx0XHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGxheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dChcblx0XHRcdHRydWUsXG5cdFx0XHRub3RlYm9va0VkaXRvciBhcyB1bmtub3duIGFzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdFx0dmlld0NlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0eyBkZWJ1ZzogKCkgPT4geyB9IH0sXG5cdFx0XHR7IHdpZHRoOiA2MDAsIGhlaWdodDogSU5JVElBTF9DT05URU5UX0hFSUdIVCB9XG5cdFx0KTtcblxuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCwgSU5JVElBTF9DT05URU5UX0hFSUdIVCk7XG5cblx0XHQvLyBTaW11bGF0ZSB3cmFwcGluZy1kcml2ZW4gaGVpZ2h0IGluY3JlYXNlIGFmdGVyIHdpZHRoL2xheW91dCBzZXR0bGVzLlxuXHRcdGNvbnRlbnRIZWlnaHQgPSBVUERBVEVEX0NPTlRFTlRfSEVJR0hUO1xuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ3ZpZXdDZWxsTGF5b3V0Q2hhbmdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCxcblx0XHRcdFVQREFURURfQ09OVEVOVF9IRUlHSFQsXG5cdFx0XHQndmlld0NlbGxMYXlvdXRDaGFuZ2Ugc2hvdWxkIHJlZnJlc2ggdGhlIGNvbnRlbnQgaGVpZ2h0J1xuXHRcdCk7XG5cblx0XHQvLyBFbnN1cmUgc3Vic2VxdWVudCBzY3JvbGxzIHN0aWxsIHJldXNlIHRoZSBlc3RhYmxpc2hlZCAobGFyZ2VyKSBoZWlnaHQuXG5cdFx0Y29udGVudEhlaWdodCA9IDUwO1xuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ25iRGlkU2Nyb2xsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodCxcblx0XHRcdFVQREFURURfQ09OVEVOVF9IRUlHSFQsXG5cdFx0XHQnbmJEaWRTY3JvbGwgc2hvdWxkIHJldXNlIHRoZSByZWZyZXNoZWQgY29udGVudCBoZWlnaHQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQ29kZUNlbGxMYXlvdXQgbWFpbnRhaW5zIGNvbnRlbnQgaGVpZ2h0IGFmdGVyIHBhc3RlIHdoZW4gc2Nyb2xsaW5nJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIFJlZ3Jlc3Npb24gdGVzdCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI4NDUyNFxuXHRcdCAqXG5cdFx0ICogU2NlbmFyaW86IENlbGwgc3RhcnRzIHdpdGggMSBsaW5lICgzN3B4KSwgdXNlciBwYXN0ZXMgdGV4dCAoZ3Jvd3MgdG8gNjc5cHgpLFxuXHRcdCAqIHRoZW4gc2Nyb2xscy4gRHVyaW5nIHNjcm9sbCwgTW9uYWNvIG1heSByZXBvcnQgYSB0cmFuc2llbnQgc21hbGxlciBoZWlnaHQgKDM5cHgpXG5cdFx0ICogZHVlIHRvIHRoZSBjbGlwcGVkIGxheW91dC4gVGhlIGZpeCB1c2VzIF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHQgdG8gbWFpbnRhaW5cblx0XHQgKiB0aGUgYWN0dWFsIGNvbnRlbnQgaGVpZ2h0ICg2NzlweCkgaW5zdGVhZCBvZiB1c2luZyB0aGUgdHJhbnNpZW50IG9yIGluaXRpYWwgdmFsdWVzLlxuXHRcdCAqL1xuXHRcdGNvbnN0IExJTkVfSEVJR0hUID0gMjE7XG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gNjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSAxO1xuXHRcdGNvbnN0IFNUQVRVU0JBUl9IRUlHSFQgPSAyMjtcblx0XHRjb25zdCBWSUVXUE9SVF9IRUlHSFQgPSAxMDAwO1xuXHRcdGNvbnN0IEVMRU1FTlRfVE9QID0gMTAwO1xuXHRcdGNvbnN0IEVMRU1FTlRfSEVJR0hUID0gMTIwMDtcblx0XHRjb25zdCBJTklUSUFMX0NPTlRFTlRfSEVJR0hUID0gMzc7IC8vIDEgbGluZVxuXHRcdGNvbnN0IElOSVRJQUxfRURJVE9SX0hFSUdIVCA9IElOSVRJQUxfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0Y29uc3QgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQgPSAzMDA7XG5cdFx0Y29uc3QgUEFTVEVEX0NPTlRFTlRfSEVJR0hUID0gNjc5O1xuXG5cdFx0bGV0IGNvbnRlbnRIZWlnaHQgPSBJTklUSUFMX0NPTlRFTlRfSEVJR0hUO1xuXHRcdGNvbnN0IHN0dWJFZGl0b3IgPSB7XG5cdFx0XHRsYXlvdXRDYWxsczogW10gYXMgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W10sXG5cdFx0XHRfbGFzdFNjcm9sbFRvcFNldDogLTEsXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoeyB3aWR0aDogNjAwLCBoZWlnaHQ6IElOSVRJQUxfRURJVE9SX0hFSUdIVCB9KSxcblx0XHRcdGdldENvbnRlbnRIZWlnaHQ6ICgpID0+IGNvbnRlbnRIZWlnaHQsXG5cdFx0XHRsYXlvdXQ6IChkaW06IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRzdHViRWRpdG9yLmxheW91dENhbGxzLnB1c2goZGltKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdGVkaXRvcjogc3R1YkVkaXRvciBhcyB1bmtub3duIGFzIElDb2RlRWRpdG9yLFxuXHRcdFx0ZWRpdG9yUGFydDogZWRpdG9yUGFydCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50LFxuXHRcdH07XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHtcblx0XHRcdHN0YXR1c0JhckhlaWdodDogU1RBVFVTQkFSX0hFSUdIVCxcblx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0b3V0bGluZVdpZHRoOiBDRUxMX09VVExJTkVfV0lEVEgsXG5cdFx0XHRlZGl0b3JIZWlnaHQ6IElOSVRJQUxfRURJVE9SX0hFSUdIVCxcblx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRlZGl0b3JXaWR0aDogNjAwLFxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0NlbGw6IFBhcnRpYWw8Q29kZUNlbGxWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNJbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsYXlvdXRJbmZvOiBsYXlvdXRJbmZvIGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB7XG5cdFx0XHRzY3JvbGxUb3A6IDAsXG5cdFx0XHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdFx0XHRyZXR1cm4gbm90ZWJvb2tFZGl0b3Iuc2Nyb2xsVG9wICsgVklFV1BPUlRfSEVJR0hUO1xuXHRcdFx0fSxcblx0XHRcdHNldFNjcm9sbFRvcDogKHY6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgPSB2O1xuXHRcdFx0fSxcblx0XHRcdGdldExheW91dEluZm86ICgpID0+ICh7XG5cdFx0XHRcdGZvbnRJbmZvOiB7IGxpbmVIZWlnaHQ6IExJTkVfSEVJR0hUIH0sXG5cdFx0XHRcdGhlaWdodDogVklFV1BPUlRfSEVJR0hULFxuXHRcdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHR9KSxcblx0XHRcdGdldEFic29sdXRlVG9wT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCxcblx0XHRcdGdldEFic29sdXRlQm90dG9tT2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX1RPUCArIE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0Z2V0SGVpZ2h0T2ZFbGVtZW50OiAoKSA9PiBFTEVNRU5UX0hFSUdIVCxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRnZXRMYXlvdXRDb25maWd1cmF0aW9uOiAoKSA9PiAoeyBlZGl0b3JUb3BQYWRkaW5nOiA2IH0pLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHR2aWV3Q2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRcdHRlbXBsYXRlIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0XHR7IGRlYnVnOiAoKSA9PiB7IH0gfSxcblx0XHRcdHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBJTklUSUFMX0VESVRPUl9IRUlHSFQgfVxuXHRcdCk7XG5cblx0XHQvLyBJbml0aWFsIGxheW91dFxuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblxuXHRcdC8vIFNpbXVsYXRlIHBhc3RpbmcgY29udGVudCAtIGNvbnRlbnQgZ3Jvd3MgdG8gNjc5cHhcblx0XHRjb250ZW50SGVpZ2h0ID0gUEFTVEVEX0NPTlRFTlRfSEVJR0hUO1xuXHRcdGxheW91dEluZm8uZWRpdG9ySGVpZ2h0ID0gUEFTVEVEX0NPTlRFTlRfSEVJR0hUO1xuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ29uRGlkQ29udGVudFNpemVDaGFuZ2UnKTtcblxuXHRcdC8vIE5vdyBzY3JvbGwgYW5kIE1vbmFjbyByZXBvcnRzIHRyYW5zaWVudCBzbWFsbGVyIGhlaWdodCAoMzlweClcblx0XHQvLyBUaGUgZml4IHNob3VsZCB1c2UgdGhlIGVzdGFibGlzaGVkIDY3OXB4LCBub3QgdGhlIHRyYW5zaWVudCAzOXB4IG9yIGluaXRpYWwgMzdweFxuXHRcdGNvbnRlbnRIZWlnaHQgPSAzOTtcblx0XHRub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgPSAyMDA7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignbmJEaWRTY3JvbGwnKTtcblxuXHRcdGNvbnN0IGZpbmFsSGVpZ2h0ID0gc3R1YkVkaXRvci5sYXlvdXRDYWxscy5hdCgtMSk/LmhlaWdodDtcblxuXHRcdC8vIFZlcmlmeSB0aGUgbGF5b3V0IGRvZXNuJ3QgdXNlIHRoZSB0cmFuc2llbnQgMzlweCB2YWx1ZSBmcm9tIE1vbmFjb1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChcblx0XHRcdGZpbmFsSGVpZ2h0LFxuXHRcdFx0MzksXG5cdFx0XHQnU2hvdWxkIG5vdCB1c2UgTW9uYWNvXFwncyB0cmFuc2llbnQgdmFsdWUgKDM5cHgpJ1xuXHRcdCk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGxheW91dCBkb2Vzbid0IHNocmluayBiYWNrIHRvIHRoZSBpbml0aWFsIDM3cHggdmFsdWVcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoXG5cdFx0XHRmaW5hbEhlaWdodCxcblx0XHRcdDM3LFxuXHRcdFx0J1Nob3VsZCBub3QgdXNlIGluaXRpYWwgY29udGVudCBoZWlnaHQgKDM3cHgpJ1xuXHRcdCk7XG5cblx0XHQvLyBUaGUgbGF5b3V0IHNob3VsZCBiZSBiYXNlZCBvbiB0aGUgZXN0YWJsaXNoZWQgNjc5cHggY29udGVudCBoZWlnaHRcblx0XHQvLyBUaGUgZXhhY3QgaGVpZ2h0IHdpbGwgYmUgY2FsY3VsYXRlZCBiYXNlZCBvbiB2aWV3cG9ydCwgc2Nyb2xsIHBvc2l0aW9uLCBldGMuXG5cdFx0Ly8gYnV0IHNob3VsZCBiZSBzaWduaWZpY2FudGx5IGxhcmdlciB0aGFuIDM5cHggb3IgMzdweFxuXHRcdGFzc2VydC5vayhcblx0XHRcdGZpbmFsSGVpZ2h0ICYmIGZpbmFsSGVpZ2h0ID4gMTAwLFxuXHRcdFx0YExheW91dCBoZWlnaHQgKCR7ZmluYWxIZWlnaHR9cHgpIHNob3VsZCBiZSBjYWxjdWxhdGVkIGZyb20gZXN0YWJsaXNoZWQgNjc5cHggY29udGVudCwgbm90IHRyYW5zaWVudCAzOXB4IG9yIGluaXRpYWwgMzdweGBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQ2VsbExheW91dCBkb2VzIG5vdCBwcm9ncmFtbWF0aWNhbGx5IHNjcm9sbCBlZGl0b3Igd2hpbGUgcG9pbnRlciBkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IExJTkVfSEVJR0hUID0gMjE7XG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gNjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSAxO1xuXHRcdGNvbnN0IFNUQVRVU0JBUl9IRUlHSFQgPSAyMjtcblx0XHRjb25zdCBWSUVXUE9SVF9IRUlHSFQgPSAyMjA7XG5cdFx0Y29uc3QgRUxFTUVOVF9UT1AgPSAxMDA7XG5cdFx0Y29uc3QgRURJVE9SX0NPTlRFTlRfSEVJR0hUID0gNTAwO1xuXHRcdGNvbnN0IEVESVRPUl9IRUlHSFQgPSBFRElUT1JfQ09OVEVOVF9IRUlHSFQ7XG5cdFx0Y29uc3QgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQgPSA2MDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9IRUlHSFQgPSA5MDA7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gRUxFTUVOVF9UT1AgKyBDRUxMX1RPUF9NQVJHSU4gKyAyMDtcblx0XHRjb25zdCBzY3JvbGxCb3R0b20gPSBzY3JvbGxUb3AgKyBWSUVXUE9SVF9IRUlHSFQ7XG5cblx0XHRjb25zdCBzdHViRWRpdG9yID0ge1xuXHRcdFx0X2xhc3RTY3JvbGxUb3BTZXQ6IC0xLFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBFRElUT1JfSEVJR0hUIH0pLFxuXHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gRURJVE9SX0NPTlRFTlRfSEVJR0hULFxuXHRcdFx0bGF5b3V0OiAoKSA9PiB7XG5cdFx0XHRcdC8qIG5vLW9wICovXG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHN0dWJFZGl0b3IuX2xhc3RTY3JvbGxUb3BTZXQgPSB2O1xuXHRcdFx0fSxcblx0XHRcdGhhc01vZGVsOiAoKSA9PiB0cnVlLFxuXHRcdH07XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHsgc3R5bGU6IHsgdG9wOiAnJyB9IH07XG5cdFx0Y29uc3QgdGVtcGxhdGU6IFBhcnRpYWw8Q29kZUNlbGxSZW5kZXJUZW1wbGF0ZT4gPSB7XG5cdFx0XHRlZGl0b3I6IHN0dWJFZGl0b3IgYXMgdW5rbm93biBhcyBJQ29kZUVkaXRvcixcblx0XHRcdGVkaXRvclBhcnQ6IGVkaXRvclBhcnQgYXMgdW5rbm93biBhcyBIVE1MRWxlbWVudCxcblx0XHR9O1xuXHRcdGNvbnN0IHZpZXdDZWxsOiBQYXJ0aWFsPENvZGVDZWxsVmlld01vZGVsPiA9IHtcblx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRzdGF0dXNCYXJIZWlnaHQ6IFNUQVRVU0JBUl9IRUlHSFQsXG5cdFx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiBFRElUT1JfSEVJR0hULFxuXHRcdFx0XHRvdXRwdXRDb250YWluZXJPZmZzZXQ6IE9VVFBVVF9DT05UQUlORVJfT0ZGU0VULFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIENvZGVDZWxsTGF5b3V0SW5mbyxcblx0XHR9O1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0c2Nyb2xsVG9wLFxuXHRcdFx0Z2V0IHNjcm9sbEJvdHRvbSgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcm9sbEJvdHRvbTtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6ICh2OiBudW1iZXIpID0+IHtcblx0XHRcdFx0Lyogbm8tb3AgKi9cblx0XHRcdH0sXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRmb250SW5mbzogeyBsaW5lSGVpZ2h0OiBMSU5FX0hFSUdIVCB9LFxuXHRcdFx0XHRoZWlnaHQ6IFZJRVdQT1JUX0hFSUdIVCxcblx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0fSksXG5cdFx0XHRnZXRBYnNvbHV0ZVRvcE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AsXG5cdFx0XHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGxheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dChcblx0XHRcdHRydWUsXG5cdFx0XHRub3RlYm9va0VkaXRvciBhcyB1bmtub3duIGFzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdFx0dmlld0NlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0eyBkZWJ1ZzogKCkgPT4geyB9IH0sXG5cdFx0XHR7IHdpZHRoOiA2MDAsIGhlaWdodDogRURJVE9SX0hFSUdIVCB9XG5cdFx0KTtcblxuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0ID0gLTE7XG5cblx0XHRsYXlvdXQuc2V0UG9pbnRlckRvd24odHJ1ZSk7XG5cdFx0bGF5b3V0LmxheW91dEVkaXRvcignbmJEaWRTY3JvbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0LmVkaXRvclZpc2liaWxpdHksICdGdWxsIChTbWFsbCBWaWV3cG9ydCknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHViRWRpdG9yLl9sYXN0U2Nyb2xsVG9wU2V0LFxuXHRcdFx0LTEsXG5cdFx0XHQnRXhwZWN0ZWQgbm8gcHJvZ3JhbW1hdGljIGVkaXRvci5zZXRTY3JvbGxUb3Agd2hpbGUgcG9pbnRlciBpcyBkb3duJ1xuXHRcdCk7XG5cblx0XHRsYXlvdXQuc2V0UG9pbnRlckRvd24oZmFsc2UpO1xuXHRcdGxheW91dC5sYXlvdXRFZGl0b3IoJ25iRGlkU2Nyb2xsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5lZGl0b3JWaXNpYmlsaXR5LCAnRnVsbCAoU21hbGwgVmlld3BvcnQpJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0c3R1YkVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCxcblx0XHRcdC0xLFxuXHRcdFx0J0V4cGVjdGVkIGVkaXRvci5zZXRTY3JvbGxUb3AgdG8gcmVzdW1lIG9uY2UgcG9pbnRlciBpcyByZWxlYXNlZCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQ2VsbExheW91dCBpbml0IGlnbm9yZXMgc3RhbGUgcG9vbGVkIGVkaXRvciBjb250ZW50IGhlaWdodCcsICgpID0+IHtcblx0XHQvKipcblx0XHQgKiBSZWdyZXNzaW9uIGd1YXJkIGZvciBmYXN0LXNjcm9sbCBvdmVybGFwIHdoZW4gZWRpdG9ycyBhcmUgcG9vbGVkLlxuXHRcdCAqXG5cdFx0ICogQSBNb25hY28gZWRpdG9yIGluc3RhbmNlIGNhbiBiZSByZXVzZWQgYmV0d2VlbiBjZWxscy4gSWYgd2UgdHJ1c3RlZCB0aGUgcG9vbGVkXG5cdFx0ICogZWRpdG9yJ3MgYGdldENvbnRlbnRIZWlnaHQoKWAgZHVyaW5nIHRoZSBmaXJzdCBsYXlvdXQgb2YgYSBuZXcgY2VsbCwgYSBzaG9ydFxuXHRcdCAqIGNlbGwgbWlnaHQgaW5oZXJpdCBhIHByZXZpb3VzIHRhbGwgY2VsbCdzIGNvbnRlbnQgaGVpZ2h0IGFuZCByZW5kZXIgd2l0aCBhblxuXHRcdCAqIG92ZXJzaXplZCBlZGl0b3IsIHZpc3VhbGx5IG92ZXJsYXBwaW5nIHRoZSBuZXh0IGNlbGwuIFRoZSBsYXlvdXQgc2hvdWxkIGluc3RlYWRcblx0XHQgKiBzZWVkIGl0cyBpbml0aWFsIGNvbnRlbnQgaGVpZ2h0IGZyb20gdGhlIGNlbGwncyBvd24gaW5pdGlhbCBlZGl0b3IgZGltZW5zaW9uLlxuXHRcdCAqL1xuXHRcdGNvbnN0IExJTkVfSEVJR0hUID0gMjE7XG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gNjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSAxO1xuXHRcdGNvbnN0IFNUQVRVU0JBUl9IRUlHSFQgPSAyMjtcblx0XHRjb25zdCBWSUVXUE9SVF9IRUlHSFQgPSA0MDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9UT1AgPSAxMDA7XG5cdFx0Y29uc3QgRUxFTUVOVF9IRUlHSFQgPSA1MDA7XG5cdFx0Y29uc3QgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQgPSAyMDA7XG5cblx0XHRsZXQgcG9vbGVkQ29udGVudEhlaWdodCA9IDIwMDsgLy8gdGFsbCBwcmV2aW91cyBjZWxsXG5cdFx0Y29uc3QgcG9vbGVkRWRpdG9yID0ge1xuXHRcdFx0bGF5b3V0Q2FsbHM6IFtdIGFzIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdLFxuXHRcdFx0X2xhc3RTY3JvbGxUb3BTZXQ6IC0xLFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiBwb29sZWRDb250ZW50SGVpZ2h0IH0pLFxuXHRcdFx0Z2V0Q29udGVudEhlaWdodDogKCkgPT4gcG9vbGVkQ29udGVudEhlaWdodCxcblx0XHRcdGxheW91dDogKGRpbTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KSA9PiB7XG5cdFx0XHRcdHBvb2xlZEVkaXRvci5sYXlvdXRDYWxscy5wdXNoKGRpbSk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAodjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHBvb2xlZEVkaXRvci5fbGFzdFNjcm9sbFRvcFNldCA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0aGFzTW9kZWw6ICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0geyBzdHlsZTogeyB0b3A6ICcnIH0gfTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogUGFydGlhbDxDb2RlQ2VsbFJlbmRlclRlbXBsYXRlPiA9IHtcblx0XHRcdGVkaXRvcjogcG9vbGVkRWRpdG9yIGFzIHVua25vd24gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRlZGl0b3JQYXJ0OiBlZGl0b3JQYXJ0IGFzIHVua25vd24gYXMgSFRNTEVsZW1lbnQsXG5cdFx0fTtcblxuXHRcdC8vIEZpcnN0LCBsYXlvdXQgYSB0YWxsIGNlbGwgdG8gZXN0YWJsaXNoIGEgbGFyZ2UgY29udGVudCBoZWlnaHQgb24gdGhlIHBvb2xlZCBlZGl0b3IuXG5cdFx0Y29uc3QgdGFsbFZpZXdDZWxsOiBQYXJ0aWFsPENvZGVDZWxsVmlld01vZGVsPiA9IHtcblx0XHRcdGlzSW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRzdGF0dXNCYXJIZWlnaHQ6IFNUQVRVU0JBUl9IRUlHSFQsXG5cdFx0XHRcdHRvcE1hcmdpbjogQ0VMTF9UT1BfTUFSR0lOLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IENFTExfT1VUTElORV9XSURUSCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiAyMDAsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRcdGVkaXRvcldpZHRoOiA2MDAsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3QgdGFsbE5vdGVib29rRWRpdG9yID0ge1xuXHRcdFx0c2Nyb2xsVG9wOiAwLFxuXHRcdFx0Z2V0IHNjcm9sbEJvdHRvbSgpIHtcblx0XHRcdFx0cmV0dXJuIFZJRVdQT1JUX0hFSUdIVDtcblx0XHRcdH0sXG5cdFx0XHRzZXRTY3JvbGxUb3A6IChfdjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdC8qIG5vLW9wIGZvciB0aGlzIHRlc3QgKi9cblx0XHRcdH0sXG5cdFx0XHRnZXRMYXlvdXRJbmZvOiAoKSA9PiAoe1xuXHRcdFx0XHRmb250SW5mbzogeyBsaW5lSGVpZ2h0OiBMSU5FX0hFSUdIVCB9LFxuXHRcdFx0XHRoZWlnaHQ6IFZJRVdQT1JUX0hFSUdIVCxcblx0XHRcdFx0c3RpY2t5SGVpZ2h0OiAwLFxuXHRcdFx0fSksXG5cdFx0XHRnZXRBYnNvbHV0ZVRvcE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AsXG5cdFx0XHRnZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9UT1AgKyBPVVRQVVRfQ09OVEFJTkVSX09GRlNFVCxcblx0XHRcdGdldEhlaWdodE9mRWxlbWVudDogKCkgPT4gRUxFTUVOVF9IRUlHSFQsXG5cdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0Z2V0TGF5b3V0Q29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWRpdG9yVG9wUGFkZGluZzogNiB9KSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhbGxMYXlvdXQgPSBuZXcgQ29kZUNlbGxMYXlvdXQoXG5cdFx0XHR0cnVlLFxuXHRcdFx0dGFsbE5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHR0YWxsVmlld0NlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0XHR0ZW1wbGF0ZSBhcyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdFx0eyBkZWJ1ZzogKCkgPT4geyB9IH0sXG5cdFx0XHR7IHdpZHRoOiA2MDAsIGhlaWdodDogMjAwIH1cblx0XHQpO1xuXG5cdFx0dGFsbExheW91dC5sYXlvdXRFZGl0b3IoJ2luaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwb29sZWRFZGl0b3IubGF5b3V0Q2FsbHMuYXQoLTEpPy5oZWlnaHQsXG5cdFx0XHQyMDAsXG5cdFx0XHQnRXhwZWN0ZWQgdGFsbCBjZWxsIHRvIGxheSBvdXQgdXNpbmcgaXRzIG93biBoZWlnaHQnXG5cdFx0KTtcblxuXHRcdC8vIE5vdyByZXVzZSB0aGUgc2FtZSBlZGl0b3IgZm9yIGEgc2hvcnQgY2VsbCB3aGlsZSBsZWF2aW5nIHRoZSBwb29sZWQgY29udGVudCBoZWlnaHQgbGFyZ2UuXG5cdFx0cG9vbGVkQ29udGVudEhlaWdodCA9IDIwMDsgLy8gc2ltdWxhdGUgc3RhbGUgdmFsdWUgZnJvbSBwcmV2aW91cyBjZWxsXG5cdFx0Y29uc3Qgc2hvcnRWaWV3Q2VsbDogUGFydGlhbDxDb2RlQ2VsbFZpZXdNb2RlbD4gPSB7XG5cdFx0XHRpc0lucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdGxheW91dEluZm86IHtcblx0XHRcdFx0c3RhdHVzQmFySGVpZ2h0OiBTVEFUVVNCQVJfSEVJR0hULFxuXHRcdFx0XHR0b3BNYXJnaW46IENFTExfVE9QX01BUkdJTixcblx0XHRcdFx0b3V0bGluZVdpZHRoOiBDRUxMX09VVExJTkVfV0lEVEgsXG5cdFx0XHRcdGVkaXRvckhlaWdodDogMzcsXG5cdFx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRcdGVkaXRvcldpZHRoOiA2MDAsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUNlbGxMYXlvdXRJbmZvLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2hvcnROb3RlYm9va0VkaXRvciA9IHtcblx0XHRcdHNjcm9sbFRvcDogMCxcblx0XHRcdGdldCBzY3JvbGxCb3R0b20oKSB7XG5cdFx0XHRcdHJldHVybiBWSUVXUE9SVF9IRUlHSFQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Nyb2xsVG9wOiAoX3Y6IG51bWJlcikgPT4ge1xuXHRcdFx0XHQvKiBuby1vcCBmb3IgdGhpcyB0ZXN0ICovXG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGF5b3V0SW5mbzogKCkgPT4gKHtcblx0XHRcdFx0Zm9udEluZm86IHsgbGluZUhlaWdodDogTElORV9IRUlHSFQgfSxcblx0XHRcdFx0aGVpZ2h0OiBWSUVXUE9SVF9IRUlHSFQsXG5cdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdH0pLFxuXHRcdFx0Z2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QLFxuXHRcdFx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfVE9QICsgT1VUUFVUX0NPTlRBSU5FUl9PRkZTRVQsXG5cdFx0XHRnZXRIZWlnaHRPZkVsZW1lbnQ6ICgpID0+IEVMRU1FTlRfSEVJR0hULFxuXHRcdFx0bm90ZWJvb2tPcHRpb25zOiB7XG5cdFx0XHRcdGdldExheW91dENvbmZpZ3VyYXRpb246ICgpID0+ICh7IGVkaXRvclRvcFBhZGRpbmc6IDYgfSksXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzaG9ydExheW91dCA9IG5ldyBDb2RlQ2VsbExheW91dChcblx0XHRcdHRydWUsXG5cdFx0XHRzaG9ydE5vdGVib29rRWRpdG9yIGFzIHVua25vd24gYXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0XHRzaG9ydFZpZXdDZWxsIGFzIENvZGVDZWxsVmlld01vZGVsLFxuXHRcdFx0dGVtcGxhdGUgYXMgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRcdHsgZGVidWc6ICgpID0+IHsgfSB9LFxuXHRcdFx0eyB3aWR0aDogNjAwLCBoZWlnaHQ6IDM3IH1cblx0XHQpO1xuXG5cdFx0c2hvcnRMYXlvdXQubGF5b3V0RWRpdG9yKCdpbml0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cG9vbGVkRWRpdG9yLmxheW91dENhbGxzLmF0KC0xKT8uaGVpZ2h0LFxuXHRcdFx0MzcsXG5cdFx0XHQnSW5pdCBsYXlvdXQgZm9yIGEgc2hvcnQgY2VsbCBzaG91bGQgdXNlIHRoZSBjZWxsXFwncyBpbml0aWFsIGhlaWdodCwgbm90IHRoZSBwb29sZWQgZWRpdG9yXFwncyBzdGFsZSBjb250ZW50IGhlaWdodCdcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBR3hELFNBQVMsc0JBQXNCO0FBSS9CLE1BQU0sWUFBWSxNQUFNO0FBQ3ZCLDBDQUF3QztBQUV4QyxPQUFLLDJDQUEyQyxNQUFNO0FBdUJyRCxVQUFNLHNCQUFzQjtBQUM1QixVQUFNLHlCQUF5QjtBQUMvQixVQUFNLFlBQVk7QUFDbEIsVUFBTSxhQUFhO0FBQ25CLFVBQU0sVUFBVTtBQUVoQixVQUFN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
