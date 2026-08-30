import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { NotebookBreadcrumbsProvider, NotebookOutlinePaneProvider, NotebookQuickPickProvider } from "../../../browser/contrib/outline/notebookOutline.js";
import { NotebookOutlineEntryFactory } from "../../../browser/viewModel/notebookOutlineEntryFactory.js";
import { OutlineEntry } from "../../../browser/viewModel/OutlineEntry.js";
suite("Notebook Outline View Providers", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationService = new TestConfigurationService();
  const themeService = new TestThemeService();
  const symbolsPerTextModel = {};
  function setSymbolsForTextModel(symbols, textmodelId = "textId") {
    symbolsPerTextModel[textmodelId] = symbols;
  }
  const executionService = new class extends mock() {
    getCellExecution() {
      return void 0;
    }
  }();
  class OutlineModelStub {
    constructor(textId) {
      this.textId = textId;
    }
    getTopLevelSymbols() {
      return symbolsPerTextModel[this.textId];
    }
  }
  const outlineModelService = new class extends mock() {
    getOrCreate(model, arg1) {
      const outline = new OutlineModelStub(model.id);
      return Promise.resolve(outline);
    }
    getDebounceValue(arg0) {
      return 0;
    }
  }();
  const textModelService = new class extends mock() {
    createModelReference(uri) {
      return Promise.resolve({
        object: {
          textEditorModel: {
            id: uri.toString(),
            getVersionId() {
              return 1;
            }
          }
        },
        dispose() {
        }
      });
    }
  }();
  function createCodeCellViewModel(version = 1, source = "# code", textmodelId = "textId") {
    return {
      uri: { toString() {
        return textmodelId;
      } },
      id: textmodelId,
      textBuffer: {
        getLineCount() {
          return 0;
        }
      },
      getText() {
        return source;
      },
      model: {
        textModel: {
          id: textmodelId,
          getVersionId() {
            return version;
          }
        }
      },
      resolveTextModel() {
        return this.model.textModel;
      },
      cellKind: 2
    };
  }
  function createMockOutlineDataSource(entries, activeElement = void 0) {
    return new class extends mock() {
      constructor() {
        super(...arguments);
        this.object = {
          entries,
          activeElement
        };
      }
    }();
  }
  function createMarkupCellViewModel(version = 1, source = "markup", textmodelId = "textId", alternativeId = 1) {
    return {
      textBuffer: {
        getLineCount() {
          return 0;
        }
      },
      getText() {
        return source;
      },
      getAlternativeId() {
        return alternativeId;
      },
      model: {
        textModel: {
          id: textmodelId,
          getVersionId() {
            return version;
          }
        }
      },
      resolveTextModel() {
        return this.model.textModel;
      },
      cellKind: 1
    };
  }
  function flatten(element, dataSource) {
    const elements = [];
    const children = dataSource.getChildren(element);
    for (const child of children) {
      elements.push(child);
      elements.push(...flatten(child, dataSource));
    }
    return elements;
  }
  function buildOutlineTree(entries) {
    if (entries.length > 0) {
      const result = [entries[0]];
      const parentStack = [entries[0]];
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        while (true) {
          const len = parentStack.length;
          if (len === 0) {
            result.push(entry);
            parentStack.push(entry);
            break;
          } else {
            const parentCandidate = parentStack[len - 1];
            if (parentCandidate.level < entry.level) {
              parentCandidate.addChild(entry);
              parentStack.push(entry);
              break;
            } else {
              parentStack.pop();
            }
          }
        }
      }
      return result;
    }
    return void 0;
  }
  async function setOutlineViewConfiguration(config) {
    await configurationService.setUserConfiguration("notebook.outline.showMarkdownHeadersOnly", config.outlineShowMarkdownHeadersOnly);
    await configurationService.setUserConfiguration("notebook.outline.showCodeCells", config.outlineShowCodeCells);
    await configurationService.setUserConfiguration("notebook.outline.showCodeCellSymbols", config.outlineShowCodeCellSymbols);
    await configurationService.setUserConfiguration("notebook.gotoSymbols.showAllSymbols", config.quickPickShowAllSymbols);
    await configurationService.setUserConfiguration("notebook.breadcrumbs.showCodeCells", config.breadcrumbsShowCodeCells);
  }
  test("OutlinePane 0: Default Settings (Headers Only ON, Code cells OFF, Symbols ON)", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: true,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
  });
  test("OutlinePane 1: ALL Markdown", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 2);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "plaintext");
    assert.equal(results[1].level, 7);
  });
  test("OutlinePane 2: Only Headers", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
  });
  test("OutlinePane 3: Only Headers + Code Cells", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: true,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 3);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "# code cell 2");
    assert.equal(results[1].level, 7);
    assert.equal(results[2].label, "# code cell 3");
    assert.equal(results[2].level, 7);
  });
  test("OutlinePane 4: Only Headers + Code Cells + Symbols", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: true,
      outlineShowCodeCellSymbols: true,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 5);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "# code cell 2");
    assert.equal(results[1].level, 7);
    assert.equal(results[2].label, "var2");
    assert.equal(results[2].level, 8);
    assert.equal(results[3].label, "# code cell 3");
    assert.equal(results[3].level, 7);
    assert.equal(results[4].label, "var3");
    assert.equal(results[4].level, 8);
  });
  test("QuickPick 0: Symbols On + 2 cells WITH symbols", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: true,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(symbol-variable) var2");
    assert.equal(results[2].element.level, 8);
    assert.equal(results[3].label, "$(symbol-variable) var3");
    assert.equal(results[3].element.level, 8);
  });
  test("QuickPick 1: Symbols On + 1 cell WITH symbol + 1 cell WITHOUT symbol", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: true,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(code) # code cell 2");
    assert.equal(results[2].element.level, 7);
    assert.equal(results[3].label, "$(symbol-variable) var3");
    assert.equal(results[3].element.level, 8);
  });
  test("QuickPick 3: Symbols Off", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(code) # code cell 2");
    assert.equal(results[2].element.level, 7);
    assert.equal(results[3].label, "$(code) # code cell 3");
    assert.equal(results[3].element.level, 7);
  });
  test("Breadcrumbs 0: Code Cells On ", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: true
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlineTree = buildOutlineTree([...outlineModel.children]);
    const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
    const results = breadcrumbsProvider.getBreadcrumbElements();
    assert.equal(results.length, 3);
    assert.equal(results[0].element.label, "fakeRoot");
    assert.equal(results[0].element.level, -1);
    assert.equal(results[1].element.label, "h1");
    assert.equal(results[1].element.level, 1);
    assert.equal(results[2].element.label, "# code cell 2");
    assert.equal(results[2].element.level, 7);
  });
  test("Breadcrumbs 1: Code Cells Off ", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlineTree = buildOutlineTree([...outlineModel.children]);
    const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
    const results = breadcrumbsProvider.getBreadcrumbElements();
    assert.equal(results.length, 2);
    assert.equal(results[0].element.label, "fakeRoot");
    assert.equal(results[0].element.level, -1);
    assert.equal(results[1].element.label, "h1");
    assert.equal(results[1].element.level, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjb250cmliXFxub3RlYm9va091dGxpbmVWaWV3UHJvdmlkZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVNb2RlbFNlcnZpY2UsIE91dGxpbmVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0JyZWFkY3J1bWJzUHJvdmlkZXIsIE5vdGVib29rQ2VsbE91dGxpbmUsIE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlciwgTm90ZWJvb2tRdWlja1BpY2tQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJpYi9vdXRsaW5lL25vdGVib29rT3V0bGluZS5qcyc7XG5pbXBvcnQgeyBJQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LmpzJztcbmltcG9ydCB7IE91dGxpbmVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL091dGxpbmVFbnRyeS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0RvY3VtZW50U3ltYm9sIH0gZnJvbSAnLi4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2sgT3V0bGluZSBWaWV3IFByb3ZpZGVycycsIGZ1bmN0aW9uICgpIHtcblxuXHQvLyAjcmVnaW9uIFNldHVwXG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UoKTtcblxuXHRjb25zdCBzeW1ib2xzUGVyVGV4dE1vZGVsOiBSZWNvcmQ8c3RyaW5nLCBNb2NrRG9jdW1lbnRTeW1ib2xbXT4gPSB7fTtcblx0ZnVuY3Rpb24gc2V0U3ltYm9sc0ZvclRleHRNb2RlbChzeW1ib2xzOiBNb2NrRG9jdW1lbnRTeW1ib2xbXSwgdGV4dG1vZGVsSWQgPSAndGV4dElkJykge1xuXHRcdHN5bWJvbHNQZXJUZXh0TW9kZWxbdGV4dG1vZGVsSWRdID0gc3ltYm9scztcblx0fVxuXG5cdGNvbnN0IGV4ZWN1dGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0Q2VsbEV4ZWN1dGlvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9O1xuXG5cdGNsYXNzIE91dGxpbmVNb2RlbFN0dWIge1xuXHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgdGV4dElkOiBzdHJpbmcpIHsgfVxuXG5cdFx0Z2V0VG9wTGV2ZWxTeW1ib2xzKCkge1xuXHRcdFx0cmV0dXJuIHN5bWJvbHNQZXJUZXh0TW9kZWxbdGhpcy50ZXh0SWRdO1xuXHRcdH1cblx0fVxuXHRjb25zdCBvdXRsaW5lTW9kZWxTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3V0bGluZU1vZGVsU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0T3JDcmVhdGUobW9kZWw6IElUZXh0TW9kZWwsIGFyZzE6IGFueSkge1xuXHRcdFx0Y29uc3Qgb3V0bGluZSA9IG5ldyBPdXRsaW5lTW9kZWxTdHViKG1vZGVsLmlkKSBhcyB1bmtub3duIGFzIE91dGxpbmVNb2RlbDtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUob3V0bGluZSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldERlYm91bmNlVmFsdWUoYXJnMDogYW55KSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH07XG5cdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBjcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmk6IFVSSSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdG9iamVjdDoge1xuXHRcdFx0XHRcdHRleHRFZGl0b3JNb2RlbDoge1xuXHRcdFx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0Z2V0VmVyc2lvbklkKCkgeyByZXR1cm4gMTsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zZSgpIHsgfVxuXHRcdFx0fSBhcyBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4pO1xuXHRcdH1cblx0fTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cdC8vICNyZWdpb24gSGVscGVyc1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKHZlcnNpb246IG51bWJlciA9IDEsIHNvdXJjZSA9ICcjIGNvZGUnLCB0ZXh0bW9kZWxJZCA9ICd0ZXh0SWQnKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogeyB0b1N0cmluZygpIHsgcmV0dXJuIHRleHRtb2RlbElkOyB9IH0sXG5cdFx0XHRpZDogdGV4dG1vZGVsSWQsXG5cdFx0XHR0ZXh0QnVmZmVyOiB7XG5cdFx0XHRcdGdldExpbmVDb3VudCgpIHsgcmV0dXJuIDA7IH1cblx0XHRcdH0sXG5cdFx0XHRnZXRUZXh0KCkge1xuXHRcdFx0XHRyZXR1cm4gc291cmNlO1xuXHRcdFx0fSxcblx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdHRleHRNb2RlbDoge1xuXHRcdFx0XHRcdGlkOiB0ZXh0bW9kZWxJZCxcblx0XHRcdFx0XHRnZXRWZXJzaW9uSWQoKSB7IHJldHVybiB2ZXJzaW9uOyB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlVGV4dE1vZGVsKCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC50ZXh0TW9kZWwgYXMgdW5rbm93bjtcblx0XHRcdH0sXG5cdFx0XHRjZWxsS2luZDogMlxuXHRcdH0gYXMgSUNlbGxWaWV3TW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrT3V0bGluZURhdGFTb3VyY2UoZW50cmllczogT3V0bGluZUVudHJ5W10sIGFjdGl2ZUVsZW1lbnQ6IE91dGxpbmVFbnRyeSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZWZlcmVuY2U8SU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlPj4oKSB7XG5cdFx0XHRvdmVycmlkZSBvYmplY3Q6IElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZSA9IHtcblx0XHRcdFx0ZW50cmllczogZW50cmllcyxcblx0XHRcdFx0YWN0aXZlRWxlbWVudDogYWN0aXZlRWxlbWVudCxcblx0XHRcdH07XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwodmVyc2lvbjogbnVtYmVyID0gMSwgc291cmNlID0gJ21hcmt1cCcsIHRleHRtb2RlbElkID0gJ3RleHRJZCcsIGFsdGVybmF0aXZlSWQgPSAxKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHRCdWZmZXI6IHtcblx0XHRcdFx0Z2V0TGluZUNvdW50KCkgeyByZXR1cm4gMDsgfVxuXHRcdFx0fSxcblx0XHRcdGdldFRleHQoKSB7XG5cdFx0XHRcdHJldHVybiBzb3VyY2U7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWx0ZXJuYXRpdmVJZCgpIHtcblx0XHRcdFx0cmV0dXJuIGFsdGVybmF0aXZlSWQ7XG5cdFx0XHR9LFxuXHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0dGV4dE1vZGVsOiB7XG5cdFx0XHRcdFx0aWQ6IHRleHRtb2RlbElkLFxuXHRcdFx0XHRcdGdldFZlcnNpb25JZCgpIHsgcmV0dXJuIHZlcnNpb247IH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVUZXh0TW9kZWwoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsLnRleHRNb2RlbCBhcyB1bmtub3duO1xuXHRcdFx0fSxcblx0XHRcdGNlbGxLaW5kOiAxXG5cdFx0fSBhcyBJQ2VsbFZpZXdNb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGZsYXR0ZW4oZWxlbWVudDogT3V0bGluZUVudHJ5LCBkYXRhU291cmNlOiBJRGF0YVNvdXJjZTxOb3RlYm9va0NlbGxPdXRsaW5lLCBPdXRsaW5lRW50cnk+KTogT3V0bGluZUVudHJ5W10ge1xuXHRcdGNvbnN0IGVsZW1lbnRzOiBPdXRsaW5lRW50cnlbXSA9IFtdO1xuXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBkYXRhU291cmNlLmdldENoaWxkcmVuKGVsZW1lbnQpO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdGVsZW1lbnRzLnB1c2goY2hpbGQpO1xuXHRcdFx0ZWxlbWVudHMucHVzaCguLi5mbGF0dGVuKGNoaWxkLCBkYXRhU291cmNlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHR9XG5cblx0ZnVuY3Rpb24gYnVpbGRPdXRsaW5lVHJlZShlbnRyaWVzOiBPdXRsaW5lRW50cnlbXSk6IE91dGxpbmVFbnRyeVtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IE91dGxpbmVFbnRyeVtdID0gW2VudHJpZXNbMF1dO1xuXHRcdFx0Y29uc3QgcGFyZW50U3RhY2s6IE91dGxpbmVFbnRyeVtdID0gW2VudHJpZXNbMF1dO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xuXG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGVuID0gcGFyZW50U3RhY2subGVuZ3RoO1xuXHRcdFx0XHRcdGlmIChsZW4gPT09IDApIHtcblx0XHRcdFx0XHRcdC8vIHJvb3Qgbm9kZVxuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0cGFyZW50U3RhY2sucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJlbnRDYW5kaWRhdGUgPSBwYXJlbnRTdGFja1tsZW4gLSAxXTtcblx0XHRcdFx0XHRcdGlmIChwYXJlbnRDYW5kaWRhdGUubGV2ZWwgPCBlbnRyeS5sZXZlbCkge1xuXHRcdFx0XHRcdFx0XHRwYXJlbnRDYW5kaWRhdGUuYWRkQ2hpbGQoZW50cnkpO1xuXHRcdFx0XHRcdFx0XHRwYXJlbnRTdGFjay5wdXNoKGVudHJ5KTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwYXJlbnRTdGFjay5wb3AoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBjb25maWd1cmF0aW9uIHNldHRpbmdzIHJlbGV2YW50IHRvIHZhcmlvdXMgb3V0bGluZSB2aWV3cyAoT3V0bGluZVBhbmUsIFF1aWNrUGljaywgQnJlYWRjcnVtYnMpXG5cdCAqXG5cdCAqIEBwYXJhbSBvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGJvb2xlYW4gXHQobm90ZWJvb2sub3V0bGluZS5zaG93TWFya2Rvd25IZWFkZXJzT25seSlcblx0ICogQHBhcmFtIG91dGxpbmVTaG93Q29kZUNlbGxzOiBib29sZWFuIFx0XHRcdChub3RlYm9vay5vdXRsaW5lLnNob3dDb2RlQ2VsbHMpXG5cdCAqIEBwYXJhbSBvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogYm9vbGVhbiBcdFx0KG5vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxsU3ltYm9scylcblx0ICogQHBhcmFtIHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBib29sZWFuIFx0XHRcdChub3RlYm9vay5nb3RvU3ltYm9scy5zaG93QWxsU3ltYm9scylcblx0ICogQHBhcmFtIGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogYm9vbGVhbiBcdFx0KG5vdGVib29rLmJyZWFkY3J1bWJzLnNob3dDb2RlQ2VsbHMpXG5cdCAqL1xuXHRhc3luYyBmdW5jdGlvbiBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oY29uZmlnOiB7XG5cdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBib29sZWFuO1xuXHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBib29sZWFuO1xuXHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuO1xuXHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBib29sZWFuO1xuXHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogYm9vbGVhbjtcblx0fSkge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdub3RlYm9vay5vdXRsaW5lLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5JywgY29uZmlnLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ25vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxscycsIGNvbmZpZy5vdXRsaW5lU2hvd0NvZGVDZWxscyk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ25vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxsU3ltYm9scycsIGNvbmZpZy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scyk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ25vdGVib29rLmdvdG9TeW1ib2xzLnNob3dBbGxTeW1ib2xzJywgY29uZmlnLnF1aWNrUGlja1Nob3dBbGxTeW1ib2xzKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignbm90ZWJvb2suYnJlYWRjcnVtYnMuc2hvd0NvZGVDZWxscycsIGNvbmZpZy5icmVhZGNydW1ic1Nob3dDb2RlQ2VsbHMpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXHQvLyAjcmVnaW9uIE91dGxpbmVQYW5lXG5cblx0dGVzdCgnT3V0bGluZVBhbmUgMDogRGVmYXVsdCBTZXR0aW5ncyAoSGVhZGVycyBPbmx5IE9OLCBDb2RlIGNlbGxzIE9GRiwgU3ltYm9scyBPTiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogdHJ1ZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiB0cnVlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30gfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30gfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBvdXRsaW5lUGFuZVByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBmbGF0dGVuKG91dGxpbmVNb2RlbCwgb3V0bGluZVBhbmVQcm92aWRlcik7XG5cblx0XHQvLyBWYWxpZGF0ZVxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxldmVsLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnT3V0bGluZVBhbmUgMTogQUxMIE1hcmtkb3duJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHNldE91dGxpbmVWaWV3Q29uZmlndXJhdGlvbih7XG5cdFx0XHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30gfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30gfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBvdXRsaW5lUGFuZVByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBmbGF0dGVuKG91dGxpbmVNb2RlbCwgb3V0bGluZVBhbmVQcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDIpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxldmVsLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxhYmVsLCAncGxhaW50ZXh0Jyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGV2ZWwsIDcpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdXRsaW5lUGFuZSAyOiBPbmx5IEhlYWRlcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogdHJ1ZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIyJywgcmFuZ2U6IHt9IH1dLCAnJDInKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIzJywgcmFuZ2U6IHt9IH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3Qgb3V0bGluZVBhbmVQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgTm90ZWJvb2tPdXRsaW5lUGFuZVByb3ZpZGVyKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN1bHRzID0gZmxhdHRlbihvdXRsaW5lTW9kZWwsIG91dGxpbmVQYW5lUHJvdmlkZXIpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHMubGVuZ3RoLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxhYmVsLCAnaDEnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sZXZlbCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ091dGxpbmVQYW5lIDM6IE9ubHkgSGVhZGVycyArIENvZGUgQ2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogdHJ1ZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30gfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30gfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBvdXRsaW5lUGFuZVByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBmbGF0dGVuKG91dGxpbmVNb2RlbCwgb3V0bGluZVBhbmVQcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDMpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxldmVsLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxhYmVsLCAnIyBjb2RlIGNlbGwgMicpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxhYmVsLCAnIyBjb2RlIGNlbGwgMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxldmVsLCA3KTtcblx0fSk7XG5cblx0dGVzdCgnT3V0bGluZVBhbmUgNDogT25seSBIZWFkZXJzICsgQ29kZSBDZWxscyArIFN5bWJvbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogdHJ1ZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IHRydWUsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IG91dGxpbmVQYW5lUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGZsYXR0ZW4ob3V0bGluZU1vZGVsLCBvdXRsaW5lUGFuZVByb3ZpZGVyKTtcblxuXHRcdC8vIHZhbGlkYXRlXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHMubGVuZ3RoLCA1KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxhYmVsLCAnaDEnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sZXZlbCwgMSk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5sYWJlbCwgJyMgY29kZSBjZWxsIDInKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5sZXZlbCwgNyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5sYWJlbCwgJ3ZhcjInKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5sZXZlbCwgOCk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1szXS5sYWJlbCwgJyMgY29kZSBjZWxsIDMnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1szXS5sZXZlbCwgNyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1s0XS5sYWJlbCwgJ3ZhcjMnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1s0XS5sZXZlbCwgOCk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblx0Ly8gI3JlZ2lvbiBRdWlja1BpY2tcblxuXHR0ZXN0KCdRdWlja1BpY2sgMDogU3ltYm9scyBPbiArIDIgY2VsbHMgV0lUSCBzeW1ib2xzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHNldE91dGxpbmVWaWV3Q29uZmlndXJhdGlvbih7XG5cdFx0XHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IHRydWUsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3QgcXVpY2tQaWNrUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rUXVpY2tQaWNrUHJvdmlkZXIoY3JlYXRlTW9ja091dGxpbmVEYXRhU291cmNlKFsuLi5vdXRsaW5lTW9kZWwuY2hpbGRyZW5dKSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBxdWlja1BpY2tQcm92aWRlci5nZXRRdWlja1BpY2tFbGVtZW50cygpO1xuXG5cdFx0Ly8gVmFsaWRhdGVcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDQpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICckKG1hcmtkb3duKSBoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmVsZW1lbnQubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGFiZWwsICckKG1hcmtkb3duKSBwbGFpbnRleHQnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxhYmVsLCAnJChzeW1ib2wtdmFyaWFibGUpIHZhcjInKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5lbGVtZW50LmxldmVsLCA4KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmxhYmVsLCAnJChzeW1ib2wtdmFyaWFibGUpIHZhcjMnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1szXS5lbGVtZW50LmxldmVsLCA4KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2tQaWNrIDE6IFN5bWJvbHMgT24gKyAxIGNlbGwgV0lUSCBzeW1ib2wgKyAxIGNlbGwgV0lUSE9VVCBzeW1ib2wnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsczogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogdHJ1ZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDInKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIzJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IHF1aWNrUGlja1Byb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va1F1aWNrUGlja1Byb3ZpZGVyKGNyZWF0ZU1vY2tPdXRsaW5lRGF0YVNvdXJjZShbLi4ub3V0bGluZU1vZGVsLmNoaWxkcmVuXSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN1bHRzID0gcXVpY2tQaWNrUHJvdmlkZXIuZ2V0UXVpY2tQaWNrRWxlbWVudHMoKTtcblxuXHRcdC8vIFZhbGlkYXRlXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHMubGVuZ3RoLCA0KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxhYmVsLCAnJChtYXJrZG93bikgaDEnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5lbGVtZW50LmxldmVsLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxhYmVsLCAnJChtYXJrZG93bikgcGxhaW50ZXh0Jyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0uZWxlbWVudC5sZXZlbCwgNyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5sYWJlbCwgJyQoY29kZSkgIyBjb2RlIGNlbGwgMicpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmVsZW1lbnQubGV2ZWwsIDcpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbM10ubGFiZWwsICckKHN5bWJvbC12YXJpYWJsZSkgdmFyMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmVsZW1lbnQubGV2ZWwsIDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdRdWlja1BpY2sgMzogU3ltYm9scyBPZmYnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsczogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3QgcXVpY2tQaWNrUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rUXVpY2tQaWNrUHJvdmlkZXIoY3JlYXRlTW9ja091dGxpbmVEYXRhU291cmNlKFsuLi5vdXRsaW5lTW9kZWwuY2hpbGRyZW5dKSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBxdWlja1BpY2tQcm92aWRlci5nZXRRdWlja1BpY2tFbGVtZW50cygpO1xuXG5cdFx0Ly8gVmFsaWRhdGVcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDQpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICckKG1hcmtkb3duKSBoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmVsZW1lbnQubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGFiZWwsICckKG1hcmtkb3duKSBwbGFpbnRleHQnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxhYmVsLCAnJChjb2RlKSAjIGNvZGUgY2VsbCAyJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0uZWxlbWVudC5sZXZlbCwgNyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1szXS5sYWJlbCwgJyQoY29kZSkgIyBjb2RlIGNlbGwgMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmVsZW1lbnQubGV2ZWwsIDcpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cdC8vICNyZWdpb24gQnJlYWRjcnVtYnNcblxuXHR0ZXN0KCdCcmVhZGNydW1icyAwOiBDb2RlIENlbGxzIE9uICcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDInKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIzJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblx0XHRjb25zdCBvdXRsaW5lVHJlZSA9IGJ1aWxkT3V0bGluZVRyZWUoWy4uLm91dGxpbmVNb2RlbC5jaGlsZHJlbl0pO1xuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBicmVhZGNydW1ic1Byb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va0JyZWFkY3J1bWJzUHJvdmlkZXIoY3JlYXRlTW9ja091dGxpbmVEYXRhU291cmNlKFtdLCBbLi4ub3V0bGluZVRyZWUhWzBdLmNoaWxkcmVuXVsxXSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGJyZWFkY3J1bWJzUHJvdmlkZXIuZ2V0QnJlYWRjcnVtYkVsZW1lbnRzKCk7XG5cblx0XHQvLyBWYWxpZGF0ZVxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgMyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5lbGVtZW50LmxhYmVsLCAnZmFrZVJvb3QnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5lbGVtZW50LmxldmVsLCAtMSk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxhYmVsLCAnaDEnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxldmVsLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmVsZW1lbnQubGFiZWwsICcjIGNvZGUgY2VsbCAyJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0uZWxlbWVudC5sZXZlbCwgNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0JyZWFkY3J1bWJzIDE6IENvZGUgQ2VsbHMgT2ZmICcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIyJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0bGluZVRyZWUgPSBidWlsZE91dGxpbmVUcmVlKFsuLi5vdXRsaW5lTW9kZWwuY2hpbGRyZW5dKTtcblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3QgYnJlYWRjcnVtYnNQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgTm90ZWJvb2tCcmVhZGNydW1ic1Byb3ZpZGVyKGNyZWF0ZU1vY2tPdXRsaW5lRGF0YVNvdXJjZShbXSwgWy4uLm91dGxpbmVUcmVlIVswXS5jaGlsZHJlbl1bMV0pLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBicmVhZGNydW1ic1Byb3ZpZGVyLmdldEJyZWFkY3J1bWJFbGVtZW50cygpO1xuXG5cdFx0Ly8gVmFsaWRhdGVcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDIpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0uZWxlbWVudC5sYWJlbCwgJ2Zha2VSb290Jyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0uZWxlbWVudC5sZXZlbCwgLTEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0uZWxlbWVudC5sYWJlbCwgJ2gxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0uZWxlbWVudC5sZXZlbCwgMSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUFrRCw2QkFBNkIsaUNBQWlDO0FBR3pILFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0JBQW9CO0FBTTdCLE1BQU0sbUNBQW1DLFdBQVk7QUFJcEQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxRQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCxRQUFNLGVBQWUsSUFBSSxpQkFBaUI7QUFFMUMsUUFBTSxzQkFBNEQsQ0FBQztBQUNuRSxXQUFTLHVCQUF1QixTQUErQixjQUFjLFVBQVU7QUFDdEYsd0JBQW9CLFdBQVcsSUFBSTtBQUFBLEVBQ3BDO0FBRUEsUUFBTSxtQkFBbUIsSUFBSSxjQUFjLEtBQXFDLEVBQUU7QUFBQSxJQUN4RSxtQkFBbUI7QUFBRSxhQUFPO0FBQUEsSUFBVztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxN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NUIseUJBQXlCO0FBQUEsTUFDekIsMEJBQTBCO0FBQUEsSUFDM0IsQ0FBQztBQUdELFVBQU0sUUFBUTtBQUFBLE1BQ2IsMEJBQTBCLEdBQUcsUUFBUSxNQUFNLENBQUM7QUFBQSxNQUM1QywwQkFBMEIsR0FBRyxhQUFhLE1BQU0sQ0FBQztBQUFBLE1BQ2pELHdCQUF3QixHQUFHLGlCQUFpQixJQUFJO0FBQUEsTUFDaEQsd0JBQXdCLEdBQUcsaUJBQWlCLElBQUk7QUFBQSxJQUNqRDtBQUNBLDJCQUF1QixDQUFDLEdBQUcsSUFBSTtBQUMvQiwyQkFBdUIsQ0FBQyxHQUFHLElBQUk7QUFDL0IsMkJBQXVCLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLENBQUMsR0FBRyxJQUFJO0FBQ3BFLDJCQUF1QixDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLEdBQUcsSUFBSTtBQUdwRSxVQUFNLGVBQWUsSUFBSSw0QkFBNEIsa0JBQWtCLHFCQUFxQixnQkFBZ0I7QUFDNUcsZUFBVyxRQUFRLE9BQU87QUFDekIsWUFBTSxhQUFhLGFBQWEsTUFBTSxrQkFBa0IsSUFBSTtBQUFBLElBQzdEO0FBR0EsVUFBTSxlQUFlLElBQUksYUFBYSxJQUFJLElBQUksMEJBQTBCLEdBQUcsWUFBWSxPQUFPLE9BQU8sUUFBVyxNQUFTO0FBQ3pILGVBQVcsUUFBUSxPQUFPO0FBQ3pCLG1CQUFhLGtCQUFrQixNQUFNLENBQUMsRUFBRSxRQUFRLFdBQVMsYUFBYSxTQUFTLEtBQUssQ0FBQztBQUFBLElBQ3RGO0FBQ0EsVUFBTSxjQUFjLGlCQUFpQixDQUFDLEdBQUcsYUFBYSxRQUFRLENBQUM7QUFHL0QsVUFBTSxzQkFBc0IsTUFBTSxJQUFJLElBQUksNEJBQTRCLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxHQUFHLFlBQWEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsR0FBRyxvQkFBb0IsQ0FBQztBQUM5SixVQUFNLFVBQVUsb0JBQW9CLHNCQUFzQjtBQUcxRCxXQUFPLE1BQU0sUUFBUSxRQUFRLENBQUM7QUFFOUIsV0FBTyxNQUFNLFFBQVEsQ0FBQyxFQUFFLFFBQVEsT0FBTyxVQUFVO0FBQ2pELFdBQU8sTUFBTSxRQUFRLENBQUMsRUFBRSxRQUFRLE9BQU8sRUFBRTtBQUV6QyxXQUFPLE1BQU0sUUFBUSxDQUFDLEVBQUUsUUFBUSxPQUFPLElBQUk7QUFDM0MsV0FBTyxNQUFNLFFBQVEsQ0FBQyxFQUFFLFFBQVEsT0FBTyxDQUFDO0FBQUEsRUFDekMsQ0FBQztBQUdGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
