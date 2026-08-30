import assert from "assert";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { setUnexpectedErrorHandler, errorHandler } from "../../../../base/common/errors.js";
import { URI } from "../../../../base/common/uri.js";
import * as types from "../../common/extHostTypes.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { Position as EditorPosition, Position } from "../../../../editor/common/core/position.js";
import { Range as EditorRange } from "../../../../editor/common/core/range.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { ExtHostLanguageFeatures } from "../../common/extHostLanguageFeatures.js";
import { MainThreadLanguageFeatures } from "../../browser/mainThreadLanguageFeatures.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainThreadCommands } from "../../browser/mainThreadCommands.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import * as languages from "../../../../editor/common/languages.js";
import { getCodeLensModel } from "../../../../editor/contrib/codelens/browser/codelens.js";
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition, getDeclarationsAtPosition, getReferencesAtPosition } from "../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js";
import { getHoversPromise } from "../../../../editor/contrib/hover/browser/getHover.js";
import { getOccurrencesAtPosition } from "../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import { getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { getWorkspaceSymbols } from "../../../contrib/search/common/search.js";
import { rename } from "../../../../editor/contrib/rename/browser/rename.js";
import { provideSignatureHelp } from "../../../../editor/contrib/parameterHints/browser/provideSignatureHelp.js";
import { provideSuggestionItems, CompletionOptions } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { getDocumentFormattingEditsUntilResult, getDocumentRangeFormattingEditsUntilResult, getOnTypeFormattingEdits } from "../../../../editor/contrib/format/browser/format.js";
import { getLinks } from "../../../../editor/contrib/links/browser/getLinks.js";
import { MainContext, ExtHostContext } from "../../common/extHost.protocol.js";
import { ExtHostDiagnostics } from "../../common/extHostDiagnostics.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { getColors } from "../../../../editor/contrib/colorPicker/browser/color.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { nullExtensionDescription as defaultExtension } from "../../../services/extensions/common/extensions.js";
import { provideSelectionRanges } from "../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import { mock } from "../../../../base/test/common/mock.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { NullApiDeprecationService } from "../../common/extHostApiDeprecationService.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { OutlineModel } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
suite("ExtHostLanguageFeatures", function() {
  const defaultSelector = { scheme: "far" };
  let model;
  let extHost;
  let mainThread;
  const disposables = new DisposableStore();
  let rpcProtocol;
  let languageFeaturesService;
  let originalErrorHandler;
  let instantiationService;
  setup(() => {
    model = createTextModel(
      [
        "This is the first line",
        "This is the second line",
        "This is the third line"
      ].join("\n"),
      void 0,
      void 0,
      URI.parse("far://testing/file.a")
    );
    rpcProtocol = new TestRPCProtocol();
    languageFeaturesService = new LanguageFeaturesService();
    let inst;
    {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IMarkerService, MarkerService);
      instantiationService.set(ILanguageFeaturesService, languageFeaturesService);
      instantiationService.set(IUriIdentityService, new class extends mock() {
        asCanonicalUri(uri) {
          return uri;
        }
      }());
      inst = instantiationService;
    }
    originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => {
    });
    const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        versionId: model.getVersionId(),
        languageId: model.getLanguageId(),
        uri: model.uri,
        lines: model.getValue().split(model.getEOL()),
        EOL: model.getEOL(),
        encoding: "utf8"
      }]
    });
    const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);
    const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
    rpcProtocol.set(MainContext.MainThreadCommands, disposables.add(inst.createInstance(MainThreadCommands, rpcProtocol)));
    const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock() {
    }(), extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);
    extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);
    mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, disposables.add(inst.createInstance(MainThreadLanguageFeatures, rpcProtocol)));
  });
  teardown(() => {
    disposables.clear();
    setUnexpectedErrorHandler(originalErrorHandler);
    model.dispose();
    mainThread.dispose();
    instantiationService.dispose();
    return rpcProtocol.sync();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("DocumentSymbols, register/deregister", async () => {
    assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 0);
    const d1 = extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [];
      }
    }());
    await rpcProtocol.sync();
    assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 1);
    d1.dispose();
    return rpcProtocol.sync();
  });
  test("DocumentSymbols, evil provider", async () => {
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        throw new Error("evil document symbol provider");
      }
    }()));
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [new types.SymbolInformation("test", types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 1);
  });
  test("DocumentSymbols, data conversion", async () => {
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [new types.SymbolInformation("test", types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 1);
    const entry = value[0];
    assert.strictEqual(entry.name, "test");
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Quick Outline uses a not ideal sorting, #138502", async function() {
    const symbols = [
      { name: "containers", range: { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 26 } },
      { name: "container 0", range: { startLineNumber: 2, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
      { name: "name", range: { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 16 } },
      { name: "ports", range: { startLineNumber: 3, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
      { name: "ports 0", range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } },
      { name: "containerPort", range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } }
    ];
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, {
      provideDocumentSymbols: (doc, token) => {
        return symbols.map((s) => {
          return new types.SymbolInformation(
            s.name,
            types.SymbolKind.Object,
            new types.Range(s.range.startLineNumber - 1, s.range.startColumn - 1, s.range.endLineNumber - 1, s.range.endColumn - 1)
          );
        });
      }
    }));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 6);
    assert.deepStrictEqual(value.map((s) => s.name), ["containers", "container 0", "name", "ports", "ports 0", "containerPort"]);
  });
  test("CodeLens, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          throw new Error("evil");
        }
      }()));
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      value.dispose();
    });
  });
  test("CodeLens, do not resolve a resolved lens", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(
            new types.Range(0, 0, 0, 0),
            { command: "id", title: "Title" }
          )];
        }
        resolveCodeLens() {
          assert.ok(false, "do not resolve");
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      const [data] = value.lenses;
      const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
      assert.strictEqual(symbol.command.id, "id");
      assert.strictEqual(symbol.command.title, "Title");
      value.dispose();
    });
  });
  test("CodeLens, missing command", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      const [data] = value.lenses;
      const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
      assert.strictEqual(symbol, void 0);
      value.dispose();
    });
  });
  test("Definition, data conversion", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Definition, one or many", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(model.uri, new types.Range(2, 1, 1, 1));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
  });
  test("Definition, registration order", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(URI.parse("far://first"), new types.Range(2, 3, 4, 5))];
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(URI.parse("far://second"), new types.Range(1, 2, 3, 4));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    assert.strictEqual(value[0].uri.authority, "second");
    assert.strictEqual(value[1].uri.authority, "first");
  });
  test("Definition, evil provider", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        throw new Error("evil provider");
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
  });
  test("Declaration, data conversion", async () => {
    disposables.add(extHost.registerDeclarationProvider(defaultExtension, defaultSelector, new class {
      provideDeclaration() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Implementation, data conversion", async () => {
    disposables.add(extHost.registerImplementationProvider(defaultExtension, defaultSelector, new class {
      provideImplementation() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Type Definition, data conversion", async () => {
    disposables.add(extHost.registerTypeDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideTypeDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("HoverProvider, word range at pos", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello");
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
    const [entry] = hovers;
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
  });
  test("HoverProvider, given range", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello", new types.Range(3, 0, 8, 7));
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
    const [entry] = hovers;
    assert.deepStrictEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
  });
  test("HoverProvider, registration order", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("registered first");
      }
    }()));
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("registered second");
      }
    }()));
    await rpcProtocol.sync();
    const value = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.contents[0].value, "registered second");
    assert.strictEqual(second.contents[0].value, "registered first");
  });
  test("HoverProvider, evil provider", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello");
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
  });
  test("Occurrences, data conversion", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, order 1/2", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return void 0;
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, "*", new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, order 2/2", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, "*", new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, evil provider", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
  });
  test("References, registration order", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(URI.parse("far://register/first"), new types.Range(0, 0, 0, 0))];
      }
    }()));
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(URI.parse("far://register/second"), new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.uri.path, "/second");
    assert.strictEqual(second.uri.path, "/first");
  });
  test("References, data conversion", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(model.uri, new types.Position(0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [item] = value;
    assert.deepStrictEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    assert.strictEqual(item.uri.toString(), model.uri.toString());
  });
  test("References, evil provider", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(model.uri, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
  });
  test("Quick Fix, command data conversion", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
        provideCodeActions() {
          return [
            { command: "test1", title: "Testing1" },
            { command: "test2", title: "Testing2" }
          ];
        }
      }));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 2);
      const [first, second] = actions;
      assert.strictEqual(first.action.title, "Testing1");
      assert.strictEqual(first.action.command.id, "test1");
      assert.strictEqual(second.action.title, "Testing2");
      assert.strictEqual(second.action.command.id, "test2");
      value.dispose();
    });
  });
  test("Quick Fix, code action data conversion", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
        provideCodeActions() {
          return [
            {
              title: "Testing1",
              command: { title: "Testing1Command", command: "test1" },
              kind: types.CodeActionKind.Empty.append("test.scope")
            }
          ];
        }
      }));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      const [first] = actions;
      assert.strictEqual(first.action.title, "Testing1");
      assert.strictEqual(first.action.command.title, "Testing1Command");
      assert.strictEqual(first.action.command.id, "test1");
      assert.strictEqual(first.action.kind, "test.scope");
      value.dispose();
    });
  });
  test("Cannot read property 'id' of undefined, #29469", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          return [
            void 0,
            null,
            { command: "test", title: "Testing" }
          ];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      value.dispose();
    });
  });
  test("Quick Fix, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          throw new Error("evil");
        }
      }()));
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          return [{ command: "test", title: "Testing" }];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      value.dispose();
    });
  });
  test("Navigate types, evil provider", async () => {
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("testing", types.SymbolKind.Array, new types.Range(0, 0, 1, 1))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getWorkspaceSymbols("");
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.symbol.name, "testing");
  });
  test("Navigate types, de-duplicate results", async () => {
    const uri = URI.from({ scheme: "foo", path: "/some/path" });
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, void 0))];
      }
      resolveWorkspaceSymbol(a) {
        return a;
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Struct, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getWorkspaceSymbols("");
    assert.strictEqual(value.length, 3);
  });
  test("Rename, evil provider 0/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        throw new class Foo {
        }();
      }
    }()));
    await rpcProtocol.sync();
    try {
      await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
      throw Error();
    } catch (err) {
    }
  });
  test("Rename, evil provider 1/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        throw Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.rejectReason, "evil");
  });
  test("Rename, evil provider 2/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, "*", new class {
      provideRenameEdits() {
        throw Error("evil");
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        const edit = new types.WorkspaceEdit();
        edit.replace(model.uri, new types.Range(0, 0, 0, 0), "testing");
        return edit;
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.edits.length, 1);
  });
  test("Rename, ordering", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, "*", new class {
      provideRenameEdits() {
        const edit = new types.WorkspaceEdit();
        edit.replace(model.uri, new types.Range(0, 0, 0, 0), "testing");
        edit.replace(model.uri, new types.Range(1, 0, 1, 0), "testing");
        return edit;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        return;
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.edits.length, 2);
  });
  test("Multiple RenameProviders don't respect all possible PrepareRename handlers 1/2, #98352", async function() {
    const called = [false, false, false, false];
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[0] = true;
        const range = document.getWordRangeAtPosition(position);
        return range;
      }
      provideRenameEdits() {
        called[1] = true;
        return void 0;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[2] = true;
        return Promise.reject("Cannot rename this symbol2.");
      }
      provideRenameEdits() {
        called[3] = true;
        return void 0;
      }
    }()));
    await rpcProtocol.sync();
    await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.deepStrictEqual(called, [true, true, true, false]);
  });
  test("Multiple RenameProviders don't respect all possible PrepareRename handlers 2/2, #98352", async function() {
    const called = [false, false, false];
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[0] = true;
        const range = document.getWordRangeAtPosition(position);
        return range;
      }
      provideRenameEdits() {
        called[1] = true;
        return void 0;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits(document, position, newName) {
        called[2] = true;
        return new types.WorkspaceEdit();
      }
    }()));
    await rpcProtocol.sync();
    await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.deepStrictEqual(called, [false, false, true]);
  });
  test("Parameter Hints, order", async () => {
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        return void 0;
      }
    }(), []));
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        return {
          signatures: [],
          activeParameter: 0,
          activeSignature: 0
        };
      }
    }(), []));
    await rpcProtocol.sync();
    const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
    assert.ok(value);
  });
  test("Parameter Hints, evil provider", async () => {
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        throw new Error("evil");
      }
    }(), []));
    await rpcProtocol.sync();
    const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
    assert.strictEqual(value, void 0);
  });
  test("Suggest, order 1/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, "*", new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing1")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing2")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 1);
      assert.strictEqual(value.items[0].completion.insertText, "testing2");
      value.disposable.dispose();
    });
  });
  test("Suggest, order 2/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, "*", new class {
        provideCompletionItems() {
          return [new types.CompletionItem("weak-selector")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 1);
      assert.strictEqual(value.items[0].completion.insertText, "weak-selector");
      value.disposable.dispose();
    });
  });
  test("Suggest, order 3/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("strong-1")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("strong-2")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 2);
      assert.strictEqual(value.items[0].completion.insertText, "strong-1");
      assert.strictEqual(value.items[1].completion.insertText, "strong-2");
      value.disposable.dispose();
    });
  });
  test("Suggest, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          throw new Error("evil");
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items[0].container.incomplete, false);
      value.disposable.dispose();
    });
  });
  test("Suggest, CompletionList", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return new types.CompletionList([new types.CompletionItem("hello")], true);
        }
      }(), []));
      await rpcProtocol.sync();
      await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet))).then((model2) => {
        assert.strictEqual(model2.items[0].container.incomplete, true);
        model2.disposable.dispose();
      });
    });
  });
  const NullWorkerService = new class extends mock() {
    computeMoreMinimalEdits(resource, edits) {
      return Promise.resolve(edits ?? void 0);
    }
  }();
  test("Format Doc, data conversion", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing"), types.TextEdit.setEndOfLine(types.EndOfLine.LF)];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    assert.strictEqual(second.eol, EndOfLineSequence.LF);
    assert.strictEqual(second.text, "");
    assert.deepStrictEqual(second.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Doc, evil provider", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        throw new Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    return getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
  });
  test("Format Doc, order", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return void 0;
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing")];
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return void 0;
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Range, data conversion", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing")];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Range, + format_doc", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "range")];
      }
    }()));
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(2, 3, 4, 5), "range2")];
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 1, 1), "doc")];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "range2");
    assert.strictEqual(first.range.startLineNumber, 3);
    assert.strictEqual(first.range.startColumn, 4);
    assert.strictEqual(first.range.endLineNumber, 5);
    assert.strictEqual(first.range.endColumn, 6);
  });
  test("Format Range, evil provider", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        throw new Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    return getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
  });
  test("Format on Type, data conversion", async () => {
    disposables.add(extHost.registerOnTypeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideOnTypeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
      }
    }(), [";"]));
    await rpcProtocol.sync();
    const value = await getOnTypeFormattingEdits(NullWorkerService, languageFeaturesService, model, new EditorPosition(1, 1), ";", { insertSpaces: true, tabSize: 2 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, ";");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Links, data conversion", async () => {
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        const link = new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse("foo:bar#3"));
        link.tooltip = "tooltip";
        return [link];
      }
    }()));
    await rpcProtocol.sync();
    const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
    assert.strictEqual(links.length, 1);
    const [first] = links;
    assert.strictEqual(first.url?.toString(), "foo:bar#3");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
    assert.strictEqual(first.tooltip, "tooltip");
  });
  test("Links, evil provider", async () => {
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse("foo:bar#3"))];
      }
    }()));
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        throw new Error();
      }
    }()));
    await rpcProtocol.sync();
    const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
    assert.strictEqual(links.length, 1);
    const [first] = links;
    assert.strictEqual(first.url?.toString(), "foo:bar#3");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
  });
  test("Document colors, data conversion", async () => {
    disposables.add(extHost.registerColorProvider(defaultExtension, defaultSelector, new class {
      provideDocumentColors() {
        return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
      }
      provideColorPresentations(color, context) {
        return [];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getColors(languageFeaturesService.colorProvider, model, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.deepStrictEqual(first.colorInfo.color, { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.4 });
    assert.deepStrictEqual(first.colorInfo.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 21 });
  });
  test("Selection Ranges, data conversion", async () => {
    disposables.add(extHost.registerSelectionRangeProvider(defaultExtension, defaultSelector, new class {
      provideSelectionRanges() {
        return [
          new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20)))
        ];
      }
    }()));
    await rpcProtocol.sync();
    provideSelectionRanges(languageFeaturesService.selectionRangeProvider, model, [new Position(1, 17)], { selectLeadingAndTrailingWhitespace: true, selectSubwords: true }, CancellationToken.None).then((ranges) => {
      assert.strictEqual(ranges.length, 1);
      assert.ok(ranges[0].length >= 2);
    });
  });
  test("Selection Ranges, bad data", async () => {
    try {
      const _a = new types.SelectionRange(
        new types.Range(0, 10, 0, 18),
        new types.SelectionRange(new types.Range(0, 11, 0, 18))
      );
      assert.ok(false, String(_a));
    } catch (err) {
      assert.ok(true);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIsIGVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiBhcyBFZGl0b3JQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgYXMgRWRpdG9yUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlTGVuc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZWxlbnMvYnJvd3Nlci9jb2RlbGVucy5qcyc7XG5pbXBvcnQgeyBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24sIGdldEltcGxlbWVudGF0aW9uc0F0UG9zaXRpb24sIGdldFR5cGVEZWZpbml0aW9uc0F0UG9zaXRpb24sIGdldERlY2xhcmF0aW9uc0F0UG9zaXRpb24sIGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9TeW1ib2wuanMnO1xuaW1wb3J0IHsgZ2V0SG92ZXJzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvZ2V0SG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0T2NjdXJyZW5jZXNBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvd29yZEhpZ2hsaWdodGVyLmpzJztcbmltcG9ydCB7IGdldENvZGVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0V29ya3NwYWNlU3ltYm9scyB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgcmVuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcmVuYW1lL2Jyb3dzZXIvcmVuYW1lLmpzJztcbmltcG9ydCB7IHByb3ZpZGVTaWduYXR1cmVIZWxwIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGFyYW1ldGVySGludHMvYnJvd3Nlci9wcm92aWRlU2lnbmF0dXJlSGVscC5qcyc7XG5pbXBvcnQgeyBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zLCBDb21wbGV0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQsIGdldERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdCwgZ2V0T25UeXBlRm9ybWF0dGluZ0VkaXRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCB7IGdldExpbmtzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvbGlua3MvYnJvd3Nlci9nZXRMaW5rcy5qcyc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCwgRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhZ25vc3RpY3MgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERpYWdub3N0aWNzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgRW5kT2ZMaW5lU2VxdWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGdldENvbG9ycyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvY29sb3IuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIGFzIGRlZmF1bHRFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbWFydFNlbGVjdC9icm93c2VyL3NtYXJ0U2VsZWN0LmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTnVsbEFwaURlcHJlY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IFVSSVRyYW5zZm9ybWVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE91dGxpbmVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcblxuc3VpdGUoJ0V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRlZmF1bHRTZWxlY3RvciA9IHsgc2NoZW1lOiAnZmFyJyB9O1xuXHRsZXQgbW9kZWw6IElUZXh0TW9kZWw7XG5cdGxldCBleHRIb3N0OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcztcblx0bGV0IG1haW5UaHJlYWQ6IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHJwY1Byb3RvY29sOiBUZXN0UlBDUHJvdG9jb2w7XG5cdGxldCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlO1xuXHRsZXQgb3JpZ2luYWxFcnJvckhhbmRsZXI6IChlOiBhbnkpID0+IGFueTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXG5cdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIHRoZSBmaXJzdCBsaW5lJyxcblx0XHRcdFx0J1RoaXMgaXMgdGhlIHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1RoaXMgaXMgdGhlIHRoaXJkIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFVSSS5wYXJzZSgnZmFyOi8vdGVzdGluZy9maWxlLmEnKSk7XG5cblx0XHRycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCk7XG5cblx0XHQvLyBVc2UgSUluc3RhbnRpYXRpb25TZXJ2aWNlIHRvIGdldCB0eXBlY2hlY2tpbmcgd2hlbiBpbnN0YW50aWF0aW5nXG5cdFx0bGV0IGluc3Q6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1hcmtlclNlcnZpY2UsIE1hcmtlclNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKTogVVJJIHtcblx0XHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGluc3QgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR9XG5cblx0XHRvcmlnaW5hbEVycm9ySGFuZGxlciA9IGVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0Y29uc3QgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgPSBuZXcgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHR1cmk6IG1vZGVsLnVyaSxcblx0XHRcdFx0bGluZXM6IG1vZGVsLmdldFZhbHVlKCkuc3BsaXQobW9kZWwuZ2V0RU9MKCkpLFxuXHRcdFx0XHRFT0w6IG1vZGVsLmdldEVPTCgpLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4dEhvc3REb2N1bWVudHMgPSBuZXcgRXh0SG9zdERvY3VtZW50cyhycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0RG9jdW1lbnRzKTtcblxuXHRcdGNvbnN0IGNvbW1hbmRzID0gbmV3IEV4dEhvc3RDb21tYW5kcyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDb21tYW5kcywgY29tbWFuZHMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkQ29tbWFuZHMsIGRpc3Bvc2FibGVzLmFkZChpbnN0LmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDb21tYW5kcywgcnBjUHJvdG9jb2wpKSk7XG5cblx0XHRjb25zdCBkaWFnbm9zdGljcyA9IG5ldyBFeHRIb3N0RGlhZ25vc3RpY3MocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0RmlsZVN5c3RlbUluZm8+KCkgeyB9LCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REaWFnbm9zdGljcywgZGlhZ25vc3RpY3MpO1xuXG5cdFx0ZXh0SG9zdCA9IG5ldyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcyhycGNQcm90b2NvbCwgbmV3IFVSSVRyYW5zZm9ybWVyU2VydmljZShudWxsKSwgZXh0SG9zdERvY3VtZW50cywgY29tbWFuZHMsIGRpYWdub3N0aWNzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbEFwaURlcHJlY2F0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMsIGV4dEhvc3QpO1xuXG5cdFx0bWFpblRocmVhZCA9IHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcywgZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMsIHJwY1Byb3RvY29sKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ2luYWxFcnJvckhhbmRsZXIpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRtYWluVGhyZWFkLmRpc3Bvc2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0gb3V0bGluZVxuXG5cdHRlc3QoJ0RvY3VtZW50U3ltYm9scywgcmVnaXN0ZXIvZGVyZWdpc3RlcicsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5hbGwobW9kZWwpLmxlbmd0aCwgMCk7XG5cdFx0Y29uc3QgZDEgPSBleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKSB7XG5cdFx0XHRcdHJldHVybiA8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10+W107XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIuYWxsKG1vZGVsKS5sZW5ndGgsIDEpO1xuXHRcdGQxLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ0RvY3VtZW50U3ltYm9scywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCBkb2N1bWVudCBzeW1ib2wgcHJvdmlkZXInKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbigndGVzdCcsIHR5cGVzLlN5bWJvbEtpbmQuRmllbGQsIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBPdXRsaW5lTW9kZWwuY3JlYXRlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuYXNMaXN0T2ZEb2N1bWVudFN5bWJvbHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnRG9jdW1lbnRTeW1ib2xzLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbigndGVzdCcsIHR5cGVzLlN5bWJvbEtpbmQuRmllbGQsIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBPdXRsaW5lTW9kZWwuY3JlYXRlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuYXNMaXN0T2ZEb2N1bWVudFN5bWJvbHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBlbnRyeSA9IHZhbHVlWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5uYW1lLCAndGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdRdWljayBPdXRsaW5lIHVzZXMgYSBub3QgaWRlYWwgc29ydGluZywgIzEzODUwMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzeW1ib2xzID0gW1xuXHRcdFx0eyBuYW1lOiAnY29udGFpbmVycycsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMjYgfSB9LFxuXHRcdFx0eyBuYW1lOiAnY29udGFpbmVyIDAnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiA1LCBlbmRMaW5lTnVtYmVyOiA1LCBlbmRDb2x1bW46IDEgfSB9LFxuXHRcdFx0eyBuYW1lOiAnbmFtZScsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDUsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMTYgfSB9LFxuXHRcdFx0eyBuYW1lOiAncG9ydHMnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiA1LCBlbmRMaW5lTnVtYmVyOiA1LCBlbmRDb2x1bW46IDEgfSB9LFxuXHRcdFx0eyBuYW1lOiAncG9ydHMgMCcsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogNCwgc3RhcnRDb2x1bW46IDksIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMjYgfSB9LFxuXHRcdFx0eyBuYW1lOiAnY29udGFpbmVyUG9ydCcsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogNCwgc3RhcnRDb2x1bW46IDksIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMjYgfSB9XG5cdFx0XTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHM6IChkb2MsIHRva2VuKTogYW55ID0+IHtcblx0XHRcdFx0cmV0dXJuIHN5bWJvbHMubWFwKHMgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24oXG5cdFx0XHRcdFx0XHRzLm5hbWUsXG5cdFx0XHRcdFx0XHR0eXBlcy5TeW1ib2xLaW5kLk9iamVjdCxcblx0XHRcdFx0XHRcdG5ldyB0eXBlcy5SYW5nZShzLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIHMucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBzLnJhbmdlLmVuZExpbmVOdW1iZXIgLSAxLCBzLnJhbmdlLmVuZENvbHVtbiAtIDEpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgT3V0bGluZU1vZGVsLmNyZWF0ZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmFzTGlzdE9mRG9jdW1lbnRTeW1ib2xzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCA2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlLm1hcChzID0+IHMubmFtZSksIFsnY29udGFpbmVycycsICdjb250YWluZXIgMCcsICduYW1lJywgJ3BvcnRzJywgJ3BvcnRzIDAnLCAnY29udGFpbmVyUG9ydCddKTtcblx0fSk7XG5cblx0Ly8gLS0tIGNvZGUgbGVuc1xuXG5cdHRlc3QoJ0NvZGVMZW5zLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVMZW5zZXMoKTogYW55IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvZGVMZW5zUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29kZUxlbnNlcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvZGVMZW5zTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlciwgbW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbnNlcy5sZW5ndGgsIDEpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlTGVucywgZG8gbm90IHJlc29sdmUgYSByZXNvbHZlZCBsZW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVMZW5zZXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db2RlTGVucyhcblx0XHRcdFx0XHRcdG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSxcblx0XHRcdFx0XHRcdHsgY29tbWFuZDogJ2lkJywgdGl0bGU6ICdUaXRsZScgfSldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmVDb2RlTGVucygpOiBhbnkge1xuXHRcdFx0XHRcdGFzc2VydC5vayhmYWxzZSwgJ2RvIG5vdCByZXNvbHZlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRDb2RlTGVuc01vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5zZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtkYXRhXSA9IHZhbHVlLmxlbnNlcztcblx0XHRcdGNvbnN0IHN5bWJvbCA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShkYXRhLnByb3ZpZGVyLnJlc29sdmVDb2RlTGVucyEobW9kZWwsIGRhdGEuc3ltYm9sLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ltYm9sIS5jb21tYW5kIS5pZCwgJ2lkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ltYm9sIS5jb21tYW5kIS50aXRsZSwgJ1RpdGxlJyk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvZGVMZW5zLCBtaXNzaW5nIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvZGVMZW5zUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29kZUxlbnNlcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvZGVMZW5zTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlciwgbW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbnNlcy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2RhdGFdID0gdmFsdWUubGVuc2VzO1xuXHRcdFx0Y29uc3Qgc3ltYm9sID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGRhdGEucHJvdmlkZXIucmVzb2x2ZUNvZGVMZW5zIShtb2RlbCwgZGF0YS5zeW1ib2wsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeW1ib2wsIHVuZGVmaW5lZCk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBkZWZpbml0aW9uXG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDIsIDMsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtlbnRyeV0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogNSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudXJpLnRvU3RyaW5nKCksIG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgb25lIG9yIG1hbnknLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURlZmluaXRpb24oKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMiwgMSwgMSwgMSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldERlZmluaXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgcmVnaXN0cmF0aW9uIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmFyOi8vZmlyc3QnKSwgbmV3IHR5cGVzLlJhbmdlKDIsIDMsIDQsIDUpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oVVJJLnBhcnNlKCdmYXI6Ly9zZWNvbmQnKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDIsIDMsIDQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cdFx0Ly8gbGV0IFtmaXJzdCwgc2Vjb25kXSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS51cmkuYXV0aG9yaXR5LCAnc2Vjb25kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzFdLnVyaS5hdXRob3JpdHksICdmaXJzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWZpbml0aW9uLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCBwcm92aWRlcicpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURlZmluaXRpb24oKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAxLCAxKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHQvLyAtLSBkZWNsYXJhdGlvblxuXG5cdHRlc3QoJ0RlY2xhcmF0aW9uLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVjbGFyYXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVjbGFyYXRpb24oKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMiwgMywgNCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXREZWNsYXJhdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlY2xhcmF0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnVyaS50b1N0cmluZygpLCBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbXBsZW1lbnRhdGlvblxuXG5cdHRlc3QoJ0ltcGxlbWVudGF0aW9uLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuSW1wbGVtZW50YXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlSW1wbGVtZW50YXRpb24oKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMiwgMywgNCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRJbXBsZW1lbnRhdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnVyaS50b1N0cmluZygpLCBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdC8vIC0tLSB0eXBlIGRlZmluaXRpb25cblxuXHR0ZXN0KCdUeXBlIERlZmluaXRpb24sIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5UeXBlRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVUeXBlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAyLCAzLCA0KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldFR5cGVEZWZpbml0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UudHlwZURlZmluaXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtlbnRyeV0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogNSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudXJpLnRvU3RyaW5nKCksIG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0Ly8gLS0tIGV4dHJhIGluZm9cblxuXHR0ZXN0KCdIb3ZlclByb3ZpZGVyLCB3b3JkIHJhbmdlIGF0IHBvcycsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVySG92ZXJQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Ib3ZlclByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkhvdmVyKCdIZWxsbycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCBob3ZlcnMgPSBhd2FpdCBnZXRIb3ZlcnNQcm9taXNlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gaG92ZXJzO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0hvdmVyUHJvdmlkZXIsIGdpdmVuIHJhbmdlJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkhvdmVyUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZUhvdmVyKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuSG92ZXIoJ0hlbGxvJywgbmV3IHR5cGVzLlJhbmdlKDMsIDAsIDgsIDcpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgaG92ZXJzID0gYXdhaXQgZ2V0SG92ZXJzUHJvbWlzZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IGhvdmVycztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogNCwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDksIGVuZENvbHVtbjogOCB9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdIb3ZlclByb3ZpZGVyLCByZWdpc3RyYXRpb24gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkhvdmVyUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZUhvdmVyKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuSG92ZXIoJ3JlZ2lzdGVyZWQgZmlyc3QnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVySG92ZXJQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Ib3ZlclByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkhvdmVyKCdyZWdpc3RlcmVkIHNlY29uZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldEhvdmVyc1Byb21pc2UobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbnRlbnRzWzBdLnZhbHVlLCAncmVnaXN0ZXJlZCBzZWNvbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmNvbnRlbnRzWzBdLnZhbHVlLCAncmVnaXN0ZXJlZCBmaXJzdCcpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0hvdmVyUHJvdmlkZXIsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckhvdmVyUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuSG92ZXJQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlSG92ZXIoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVySG92ZXJQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Ib3ZlclByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkhvdmVyKCdIZWxsbycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCBob3ZlcnMgPSBhd2FpdCBnZXRIb3ZlcnNQcm9taXNlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tIG9jY3VycmVuY2VzXG5cblx0dGVzdCgnT2NjdXJyZW5jZXMsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IGdldE9jY3VycmVuY2VzQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zaXplLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gQXJyYXkuZnJvbSh2YWx1ZS52YWx1ZXMoKSlbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQuVGV4dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ09jY3VycmVuY2VzLCBvcmRlciAxLzInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCAnKicsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IGdldE9jY3VycmVuY2VzQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zaXplLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gQXJyYXkuZnJvbSh2YWx1ZS52YWx1ZXMoKSlbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQuVGV4dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ09jY3VycmVuY2VzLCBvcmRlciAyLzInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAyKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCA0KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2l6ZSwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IEFycmF5LmZyb20odmFsdWUudmFsdWVzKCkpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAzIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRLaW5kLlRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdPY2N1cnJlbmNlcywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgNCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlIS5zaXplLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlZmVyZW5jZXNcblxuXHR0ZXN0KCdSZWZlcmVuY2VzLCByZWdpc3RyYXRpb24gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlZmVyZW5jZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmFyOi8vcmVnaXN0ZXIvZmlyc3QnKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZWZlcmVuY2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZhcjovL3JlZ2lzdGVyL3NlY29uZCcpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRSZWZlcmVuY2VzQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgZmFsc2UsIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAyKTtcblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudXJpLnBhdGgsICcvc2Vjb25kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC51cmkucGF0aCwgJy9maXJzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZWZlcmVuY2VzLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlZmVyZW5jZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0UmVmZXJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMiksIGZhbHNlLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2l0ZW1dID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtLnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS51cmkudG9TdHJpbmcoKSwgbW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZWZlcmVuY2VzLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZWZlcmVuY2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZWZlcmVuY2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDIpLCBmYWxzZSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHQvLyAtLS0gcXVpY2sgZml4XG5cblx0dGVzdCgnUXVpY2sgRml4LCBjb21tYW5kIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IHZzY29kZS5Db21tYW5kW10ge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7IGNvbW1hbmQ6ICd0ZXN0MScsIHRpdGxlOiAnVGVzdGluZzEnIH0sXG5cdFx0XHRcdFx0XHR7IGNvbW1hbmQ6ICd0ZXN0MicsIHRpdGxlOiAnVGVzdGluZzInIH1cblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtb2RlbCwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSwgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuUXVpY2tGaXggfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCB7IHZhbGlkQWN0aW9uczogYWN0aW9ucyB9ID0gdmFsdWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gYWN0aW9ucztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3Rpb24udGl0bGUsICdUZXN0aW5nMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFjdGlvbi5jb21tYW5kIS5pZCwgJ3Rlc3QxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmFjdGlvbi50aXRsZSwgJ1Rlc3RpbmcyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmFjdGlvbi5jb21tYW5kIS5pZCwgJ3Rlc3QyJyk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1F1aWNrIEZpeCwgY29kZSBhY3Rpb24gZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3Rvciwge1xuXHRcdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogdnNjb2RlLkNvZGVBY3Rpb25bXSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dGl0bGU6ICdUZXN0aW5nMScsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHsgdGl0bGU6ICdUZXN0aW5nMUNvbW1hbmQnLCBjb21tYW5kOiAndGVzdDEnIH0sXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IHR5cGVzLkNvZGVBY3Rpb25LaW5kLkVtcHR5LmFwcGVuZCgndGVzdC5zY29wZScpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHsgdHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQgfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCB7IHZhbGlkQWN0aW9uczogYWN0aW9ucyB9ID0gdmFsdWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IGFjdGlvbnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWN0aW9uLnRpdGxlLCAnVGVzdGluZzEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3Rpb24uY29tbWFuZCEudGl0bGUsICdUZXN0aW5nMUNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3Rpb24uY29tbWFuZCEuaWQsICd0ZXN0MScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFjdGlvbi5raW5kLCAndGVzdC5zY29wZScpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0Nhbm5vdCByZWFkIHByb3BlcnR5IFxcJ2lkXFwnIG9mIHVuZGVmaW5lZCwgIzI5NDY5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRudWxsLFxuXHRcdFx0XHRcdFx0eyBjb21tYW5kOiAndGVzdCcsIHRpdGxlOiAnVGVzdGluZycgfVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIsIG1vZGVsLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB7IHR5cGU6IGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5EZWZhdWx0IH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IHZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdHZhbHVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2sgRml4LCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucygpOiBhbnkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW3sgY29tbWFuZDogJ3Rlc3QnLCB0aXRsZTogJ1Rlc3RpbmcnIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtb2RlbCwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSwgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuUXVpY2tGaXggfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCB7IHZhbGlkQWN0aW9uczogYWN0aW9ucyB9ID0gdmFsdWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gbmF2aWdhdGUgdHlwZXNcblxuXHR0ZXN0KCdOYXZpZ2F0ZSB0eXBlcywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCd0ZXN0aW5nJywgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0V29ya3NwYWNlU3ltYm9scygnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5zeW1ib2wubmFtZSwgJ3Rlc3RpbmcnKTtcblx0fSk7XG5cblx0dGVzdCgnTmF2aWdhdGUgdHlwZXMsIGRlLWR1cGxpY2F0ZSByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZm9vJywgcGF0aDogJy9zb21lL3BhdGgnIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdPTkUnLCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCB1bmRlZmluZWQsIG5ldyB0eXBlcy5Mb2NhdGlvbih1cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignT05FJywgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgdW5kZWZpbmVkLCBuZXcgdHlwZXMuTG9jYXRpb24odXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpKV07IC8vIGdldCBkZS1kdXBlZFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdPTkUnLCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCB1bmRlZmluZWQsIG5ldyB0eXBlcy5Mb2NhdGlvbih1cmksIHVuZGVmaW5lZCEpKV07IC8vIE5PIGRlZHVwZSBiZWNhdXNlIG9mIHJlc29sdmVcblx0XHRcdH1cblx0XHRcdHJlc29sdmVXb3Jrc3BhY2VTeW1ib2woYTogdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdPTkUnLCB0eXBlcy5TeW1ib2xLaW5kLlN0cnVjdCwgdW5kZWZpbmVkLCBuZXcgdHlwZXMuTG9jYXRpb24odXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpKV07IC8vIE5PIGRlZHVwZSBiZWNhdXNlIG9mIGtpbmRcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRXb3Jrc3BhY2VTeW1ib2xzKCcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAzKTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlbmFtZVxuXG5cdHRlc3QoJ1JlbmFtZSwgZXZpbCBwcm92aWRlciAwLzInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgY2xhc3MgRm9vIHsgfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJ25ld05hbWUnKTtcblx0XHRcdHRocm93IEVycm9yKCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIGV4cGVjdGVkXG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdSZW5hbWUsIGV2aWwgcHJvdmlkZXIgMS8yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCByZW5hbWUobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksICduZXdOYW1lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnJlamVjdFJlYXNvbiwgJ2V2aWwnKTtcblx0fSk7XG5cblx0dGVzdCgnUmVuYW1lLCBldmlsIHByb3ZpZGVyIDIvMicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogYW55IHtcblx0XHRcdFx0Y29uc3QgZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0XHRcdGVkaXQucmVwbGFjZShtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgJ3Rlc3RpbmcnKTtcblx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcmVuYW1lKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCAnbmV3TmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5lZGl0cy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZW5hbWUsIG9yZGVyaW5nJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCAnKicsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogYW55IHtcblx0XHRcdFx0Y29uc3QgZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0XHRcdGVkaXQucmVwbGFjZShtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgJ3Rlc3RpbmcnKTtcblx0XHRcdFx0ZWRpdC5yZXBsYWNlKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApLCAndGVzdGluZycpO1xuXHRcdFx0XHRyZXR1cm4gZWRpdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcmVuYW1lKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCAnbmV3TmFtZScpO1xuXHRcdC8vIGxlYXN0IHJlbGV2YW50IHJlbmFtZSBwcm92aWRlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5lZGl0cy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBSZW5hbWVQcm92aWRlcnMgZG9uXFwndCByZXNwZWN0IGFsbCBwb3NzaWJsZSBQcmVwYXJlUmVuYW1lIGhhbmRsZXJzIDEvMiwgIzk4MzUyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgY2FsbGVkID0gW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJlcGFyZVJlbmFtZShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlJhbmdlPiB7XG5cdFx0XHRcdGNhbGxlZFswXSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdHJldHVybiByYW5nZTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuV29ya3NwYWNlRWRpdD4ge1xuXHRcdFx0XHRjYWxsZWRbMV0gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJlcGFyZVJlbmFtZShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlJhbmdlPiB7XG5cdFx0XHRcdGNhbGxlZFsyXSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgnQ2Fubm90IHJlbmFtZSB0aGlzIHN5bWJvbDIuJyk7XG5cdFx0XHR9XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5Xb3Jrc3BhY2VFZGl0PiB7XG5cdFx0XHRcdGNhbGxlZFszXSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGF3YWl0IHJlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJ25ld05hbWUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbGVkLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgUmVuYW1lUHJvdmlkZXJzIGRvblxcJ3QgcmVzcGVjdCBhbGwgcG9zc2libGUgUHJlcGFyZVJlbmFtZSBoYW5kbGVycyAyLzIsICM5ODM1MicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGNhbGxlZCA9IFtmYWxzZSwgZmFsc2UsIGZhbHNlXTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJlcGFyZVJlbmFtZShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlJhbmdlPiB7XG5cdFx0XHRcdGNhbGxlZFswXSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdHJldHVybiByYW5nZTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuV29ya3NwYWNlRWRpdD4ge1xuXHRcdFx0XHRjYWxsZWRbMV0gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZywpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLldvcmtzcGFjZUVkaXQ+IHtcblx0XHRcdFx0Y2FsbGVkWzJdID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGF3YWl0IHJlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJ25ld05hbWUnKTtcblxuXHRcdC8vIGZpcnN0IHByb3ZpZGVyIGhhcyBOTyBwcmVwYXJlIHdoaWNoIG1lYW5zIGl0IGlzIHRha2VuIGJ5IGRlZmF1bHRcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxlZCwgW2ZhbHNlLCBmYWxzZSwgdHJ1ZV0pO1xuXHR9KTtcblxuXHQvLyAtLS0gcGFyYW1ldGVyIGhpbnRzXG5cblx0dGVzdCgnUGFyYW1ldGVyIEhpbnRzLCBvcmRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscCgpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sIFtdKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVNpZ25hdHVyZUhlbHAoKTogdnNjb2RlLlNpZ25hdHVyZUhlbHAge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNpZ25hdHVyZXM6IFtdLFxuXHRcdFx0XHRcdGFjdGl2ZVBhcmFtZXRlcjogMCxcblx0XHRcdFx0XHRhY3RpdmVTaWduYXR1cmU6IDBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcHJvdmlkZVNpZ25hdHVyZUhlbHAobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2lnbmF0dXJlSGVscFByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCB7IHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLkludm9rZSwgaXNSZXRyaWdnZXI6IGZhbHNlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5vayh2YWx1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcmFtZXRlciBIaW50cywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscCgpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcHJvdmlkZVNpZ25hdHVyZUhlbHAobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2lnbmF0dXJlSGVscFByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCB7IHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLkludm9rZSwgaXNSZXRyaWdnZXI6IGZhbHNlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Ly8gLS0tIHN1Z2dlc3Rpb25zXG5cblx0dGVzdCgnU3VnZ2VzdCwgb3JkZXIgMS8zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCAnKicsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCd0ZXN0aW5nMScpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ3Rlc3RpbmcyJyldO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnModW5kZWZpbmVkLCBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KCkuYWRkKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLml0ZW1zWzBdLmNvbXBsZXRpb24uaW5zZXJ0VGV4dCwgJ3Rlc3RpbmcyJyk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3VnZ2VzdCwgb3JkZXIgMi8zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCAnKicsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCd3ZWFrLXNlbGVjdG9yJyldOyAvLyB3ZWFrZXIgc2VsZWN0b3IgYnV0IHJlc3VsdFxuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW107IC8vIHN0cm9uZ2VyIHNlbGVjdG9yIGJ1dCBub3QgYSBnb29kIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgbmV3IENvbXBsZXRpb25PcHRpb25zKHVuZGVmaW5lZCwgbmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kPigpLmFkZChsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtc1swXS5jb21wbGV0aW9uLmluc2VydFRleHQsICd3ZWFrLXNlbGVjdG9yJyk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3VnZ2VzdCwgb3JkZXIgMy8zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdzdHJvbmctMScpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ3N0cm9uZy0yJyldO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnModW5kZWZpbmVkLCBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KCkuYWRkKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLml0ZW1zWzBdLmNvbXBsZXRpb24uaW5zZXJ0VGV4dCwgJ3N0cm9uZy0xJyk7IC8vIHNvcnQgYnkgbGFiZWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtc1sxXS5jb21wbGV0aW9uLmluc2VydFRleHQsICdzdHJvbmctMicpO1xuXHRcdFx0dmFsdWUuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1Z2dlc3QsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIFtdKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCd0ZXN0aW5nJyldO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXSkpO1xuXG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIG5ldyBTZXQ8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZD4oKS5hZGQobGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLml0ZW1zWzBdLmNvbnRhaW5lci5pbmNvbXBsZXRlLCBmYWxzZSk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3VnZ2VzdCwgQ29tcGxldGlvbkxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db21wbGV0aW9uTGlzdChbPGFueT5uZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2hlbGxvJyldLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0YXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIG5ldyBTZXQ8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZD4oKS5hZGQobGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSkpLnRoZW4obW9kZWwgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXRlbXNbMF0uY29udGFpbmVyLmluY29tcGxldGUsIHRydWUpO1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZm9ybWF0XG5cblx0Y29uc3QgTnVsbFdvcmtlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JXb3JrZXJTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhyZXNvdXJjZTogVVJJLCBlZGl0czogbGFuZ3VhZ2VzLlRleHRFZGl0W10gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlZGl0cyA/PyB1bmRlZmluZWQpO1xuXHRcdH1cblx0fTtcblxuXHR0ZXN0KCdGb3JtYXQgRG9jLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICd0ZXN0aW5nJyksIHR5cGVzLlRleHRFZGl0LnNldEVuZE9mTGluZSh0eXBlcy5FbmRPZkxpbmUuTEYpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDIpO1xuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0LCAndGVzdGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuZW9sLCBFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC50ZXh0LCAnJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgRG9jLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdHJldHVybiBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KE51bGxXb3JrZXJTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWwsIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgRG9jLCBvcmRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlRleHRFZGl0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgJ3Rlc3RpbmcnKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KE51bGxXb3JrZXJTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWwsIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0LCAndGVzdGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgUmFuZ2UsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlRleHRFZGl0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgJ3Rlc3RpbmcnKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IGdldERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCBuZXcgRWRpdG9yUmFuZ2UoMSwgMSwgMSwgMSksIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0LCAndGVzdGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgUmFuZ2UsICsgZm9ybWF0X2RvYycsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlRleHRFZGl0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgJ3JhbmdlJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlRleHRFZGl0KG5ldyB0eXBlcy5SYW5nZSgyLCAzLCA0LCA1KSwgJ3JhbmdlMicpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksICdkb2MnKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoTnVsbFdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgbmV3IEVkaXRvclJhbmdlKDEsIDEsIDEsIDEpLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ3JhbmdlMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydENvbHVtbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZExpbmVOdW1iZXIsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmRDb2x1bW4sIDYpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgUmFuZ2UsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0cmV0dXJuIGdldERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCBuZXcgRWRpdG9yUmFuZ2UoMSwgMSwgMSwgMSksIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb3JtYXQgb24gVHlwZSwgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJPblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLk9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIGFyZ3VtZW50c1syXSldO1xuXHRcdFx0fVxuXHRcdH0sIFsnOyddKSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgZ2V0T25UeXBlRm9ybWF0dGluZ0VkaXRzKE51bGxXb3JrZXJTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJzsnLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogMiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJzsnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnTGlua3MsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRMaW5rUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50TGlua3MoKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBuZXcgdHlwZXMuRG9jdW1lbnRMaW5rKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSwgVVJJLnBhcnNlKCdmb286YmFyIzMnKSk7XG5cdFx0XHRcdGxpbmsudG9vbHRpcCA9ICd0b29sdGlwJztcblx0XHRcdFx0cmV0dXJuIFtsaW5rXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgeyBsaW5rcyB9ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGdldExpbmtzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtQcm92aWRlciwgbW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gbGlua3M7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnVybD8udG9TdHJpbmcoKSwgJ2ZvbzpiYXIjMycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiAyIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50b29sdGlwLCAndG9vbHRpcCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rcywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRMaW5rUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50TGlua3MoKSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50TGluayhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIFVSSS5wYXJzZSgnZm9vOmJhciMzJykpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudExpbmtzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB7IGxpbmtzIH0gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgZ2V0TGlua3MobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubGlua1Byb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSBsaW5rcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudXJsPy50b1N0cmluZygpLCAnZm9vOmJhciMzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RvY3VtZW50IGNvbG9ycywgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb2xvclByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Q29sb3JQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRDb2xvcnMoKTogdnNjb2RlLkNvbG9ySW5mb3JtYXRpb25bXSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbG9ySW5mb3JtYXRpb24obmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDIwKSwgbmV3IHR5cGVzLkNvbG9yKDAuMSwgMC4yLCAwLjMsIDAuNCkpXTtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoY29sb3I6IHZzY29kZS5Db2xvciwgY29udGV4dDogeyByYW5nZTogdnNjb2RlLlJhbmdlOyBkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCB9KTogdnNjb2RlLkNvbG9yUHJlc2VudGF0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0Q29sb3JzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbG9yUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5jb2xvckluZm8uY29sb3IsIHsgcmVkOiAwLjEsIGdyZWVuOiAwLjIsIGJsdWU6IDAuMywgYWxwaGE6IDAuNCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LmNvbG9ySW5mby5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIxIH0pO1xuXHR9KTtcblxuXHQvLyAtLSBzZWxlY3Rpb24gcmFuZ2VzXG5cblx0dGVzdCgnU2VsZWN0aW9uIFJhbmdlcywgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5TZWxlY3Rpb25SYW5nZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoKSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZSgwLCAxMCwgMCwgMTgpLCBuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKDAsIDIsIDAsIDIwKSkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2VsZWN0aW9uUmFuZ2VQcm92aWRlciwgbW9kZWwsIFtuZXcgUG9zaXRpb24oMSwgMTcpXSwgeyBzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlOiB0cnVlLCBzZWxlY3RTdWJ3b3JkczogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKHJhbmdlcyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2socmFuZ2VzWzBdLmxlbmd0aCA+PSAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0aW9uIFJhbmdlcywgYmFkIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgX2EgPSBuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKDAsIDEwLCAwLCAxOCksXG5cdFx0XHRcdG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2UoMCwgMTEsIDAsIDE4KSlcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZmFsc2UsIFN0cmluZyhfYSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHRcdH1cblxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCLG9CQUFvQjtBQUN4RCxTQUFTLFdBQVc7QUFDcEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWSxnQkFBZ0IsZ0JBQWdCO0FBQ3JELFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQ0FBa0M7QUFDM0MsWUFBWSxlQUFlO0FBQzNCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCLDhCQUE4Qiw4QkFBOEIsMkJBQTJCLCtCQUErQjtBQUN6SixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNB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
