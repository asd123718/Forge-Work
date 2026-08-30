import "../../../../editor/contrib/codeAction/browser/codeAction.js";
import "../../../../editor/contrib/codelens/browser/codelens.js";
import "../../../../editor/contrib/colorPicker/browser/colorPickerContribution.js";
import "../../../../editor/contrib/format/browser/format.js";
import "../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import "../../../../editor/contrib/documentSymbols/browser/documentSymbols.js";
import "../../../../editor/contrib/hover/browser/getHover.js";
import "../../../../editor/contrib/links/browser/getLinks.js";
import "../../../../editor/contrib/parameterHints/browser/provideSignatureHelp.js";
import "../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import "../../../../editor/contrib/suggest/browser/suggest.js";
import "../../../../editor/contrib/rename/browser/rename.js";
import "../../../../editor/contrib/inlayHints/browser/inlayHintsController.js";
import assert from "assert";
import { setUnexpectedErrorHandler, errorHandler } from "../../../../base/common/errors.js";
import { URI } from "../../../../base/common/uri.js";
import { Event } from "../../../../base/common/event.js";
import * as types from "../../common/extHostTypes.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ExtHostLanguageFeatures } from "../../common/extHostLanguageFeatures.js";
import { MainThreadLanguageFeatures } from "../../browser/mainThreadLanguageFeatures.js";
import { ExtHostApiCommands } from "../../common/extHostApiCommands.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainThreadCommands } from "../../browser/mainThreadCommands.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { MainContext, ExtHostContext } from "../../common/extHost.protocol.js";
import { ExtHostDiagnostics } from "../../common/extHostDiagnostics.js";
import "../../../contrib/search/browser/search.contribution.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription, IExtensionService } from "../../../services/extensions/common/extensions.js";
import { dispose, ImmortalReference } from "../../../../base/common/lifecycle.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullApiDeprecationService } from "../../common/extHostApiDeprecationService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { IOutlineModelService, OutlineModelService } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { assertType } from "../../../../base/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../base/common/async.js";
function assertRejects(fn, message = "Expected rejection") {
  return fn().then(() => assert.ok(false, message), (_err) => assert.ok(true));
}
function isLocation(value) {
  const candidate = value;
  return candidate && candidate.uri instanceof URI && candidate.range instanceof types.Range;
}
suite("ExtHostLanguageFeatureCommands", function() {
  const defaultSelector = { scheme: "far" };
  let model;
  let insta;
  let rpcProtocol;
  let extHost;
  let mainThread;
  let commands;
  let disposables = [];
  let originalErrorHandler;
  suiteSetup(() => {
    model = createTextModel(
      [
        "This is the first line",
        "This is the second line",
        "This is the third line"
      ].join("\n"),
      void 0,
      void 0,
      URI.parse("far://testing/file.b")
    );
    originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => {
    });
    rpcProtocol = new TestRPCProtocol();
    const services = new ServiceCollection();
    services.set(IUriIdentityService, new class extends mock() {
      asCanonicalUri(uri) {
        return uri;
      }
    }());
    services.set(ILanguageFeaturesService, new SyncDescriptor(LanguageFeaturesService));
    services.set(IExtensionService, new class extends mock() {
      async activateByEvent() {
      }
      activationEventIsDone(activationEvent) {
        return true;
      }
    }());
    services.set(ICommandService, new SyncDescriptor(class extends mock() {
      executeCommand(id, ...args) {
        const command = CommandsRegistry.getCommands().get(id);
        if (!command) {
          return Promise.reject(new Error(id + " NOT known"));
        }
        const { handler } = command;
        return Promise.resolve(insta.invokeFunction(handler, ...args));
      }
    }));
    services.set(IEnvironmentService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }());
    services.set(IMarkerService, new MarkerService());
    services.set(ILogService, new SyncDescriptor(NullLogService));
    services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
    services.set(IModelService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onModelRemoved = Event.None;
      }
      getModel() {
        return model;
      }
    }());
    services.set(ITextModelService, new class extends mock() {
      async createModelReference() {
        return new ImmortalReference(new class extends mock() {
          constructor() {
            super(...arguments);
            this.textEditorModel = model;
          }
        }());
      }
    }());
    services.set(IEditorWorkerService, new class extends mock() {
      async computeMoreMinimalEdits(_uri, edits) {
        return edits || void 0;
      }
    }());
    services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
    services.set(IOutlineModelService, new SyncDescriptor(OutlineModelService));
    services.set(IConfigurationService, new TestConfigurationService());
    insta = new TestInstantiationService(services);
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
    commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
    rpcProtocol.set(MainContext.MainThreadCommands, insta.createInstance(MainThreadCommands, rpcProtocol));
    ExtHostApiCommands.register(commands);
    const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock() {
    }(), extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);
    extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);
    mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, insta.createInstance(MainThreadLanguageFeatures, rpcProtocol));
    insta.get(IOutlineModelService);
    return rpcProtocol.sync();
  });
  suiteTeardown(() => {
    setUnexpectedErrorHandler(originalErrorHandler);
    model.dispose();
    mainThread.dispose();
    insta.get(IOutlineModelService).dispose();
    insta.dispose();
  });
  teardown(() => {
    disposables = dispose(disposables);
    return rpcProtocol.sync();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApiCmd(name, fn) {
    test(name, async function() {
      await runWithFakedTimers({}, async () => {
        await fn();
        await timeout(1e4);
      });
    });
  }
  test("WorkspaceSymbols, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", true))
    ];
    return Promise.all(promises);
  });
  test("WorkspaceSymbols, back and forth", function() {
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols(query) {
        return [
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/first")),
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/second"))
        ];
      }
    }));
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols(query) {
        return [
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/first"))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "testing").then((value) => {
        assert.strictEqual(value.length, 2);
        for (const info of value) {
          assert.strictEqual(info instanceof types.SymbolInformation, true);
          assert.strictEqual(info.name, "testing");
          assert.strictEqual(info.kind, types.SymbolKind.Array);
        }
      });
    });
  });
  test("executeWorkspaceSymbolProvider should accept empty string, #39522", async function() {
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("hello", types.SymbolKind.Array, new types.Range(0, 0, 0, 0), URI.parse("foo:bar"))];
      }
    }));
    await rpcProtocol.sync();
    let symbols = await commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "");
    assert.strictEqual(symbols.length, 1);
    await rpcProtocol.sync();
    symbols = await commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "*");
    assert.strictEqual(symbols.length, 1);
  });
  test("executeFormatDocumentProvider, back and forth", async function() {
    disposables.push(extHost.registerDocumentFormattingEditProvider(nullExtensionDescription, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [types.TextEdit.insert(new types.Position(0, 0), "42")];
      }
    }()));
    await rpcProtocol.sync();
    const edits = await commands.executeCommand("vscode.executeFormatDocumentProvider", model.uri, {
      insertSpaces: false,
      tabSize: 4
    });
    assert.strictEqual(edits.length, 1);
  });
  test("vscode.prepareRename", async function() {
    disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class {
      prepareRename(document, position) {
        return {
          range: new types.Range(0, 12, 0, 24),
          placeholder: "foooPlaceholder"
        };
      }
      provideRenameEdits(document, position, newName) {
        const edit = new types.WorkspaceEdit();
        edit.insert(document.uri, position, newName);
        return edit;
      }
    }()));
    await rpcProtocol.sync();
    const data = await commands.executeCommand("vscode.prepareRename", model.uri, new types.Position(0, 12));
    assert.ok(data);
    assert.strictEqual(data.placeholder, "foooPlaceholder");
    assert.strictEqual(data.range.start.line, 0);
    assert.strictEqual(data.range.start.character, 12);
    assert.strictEqual(data.range.end.line, 0);
    assert.strictEqual(data.range.end.character, 24);
  });
  test("vscode.executeDocumentRenameProvider", async function() {
    disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class {
      provideRenameEdits(document, position, newName) {
        const edit2 = new types.WorkspaceEdit();
        edit2.insert(document.uri, position, newName);
        return edit2;
      }
    }()));
    await rpcProtocol.sync();
    const edit = await commands.executeCommand("vscode.executeDocumentRenameProvider", model.uri, new types.Position(0, 12), "newNameOfThis");
    assert.ok(edit);
    assert.strictEqual(edit.has(model.uri), true);
    const textEdits = edit.get(model.uri);
    assert.strictEqual(textEdits.length, 1);
    assert.strictEqual(textEdits[0].newText, "newNameOfThis");
  });
  test("Definition, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Definition, back and forth", function() {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Definition, back and forth (sorting & de-deduping)", function() {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(URI.parse("file:///b"), new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(URI.parse("file:///b"), new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(URI.parse("file:///a"), new types.Range(2, 0, 0, 0)),
          new types.Location(URI.parse("file:///c"), new types.Range(3, 0, 0, 0)),
          new types.Location(URI.parse("file:///d"), new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        assert.strictEqual(values[0].uri.path, "/a");
        assert.strictEqual(values[1].uri.path, "/b");
        assert.strictEqual(values[2].uri.path, "/c");
        assert.strictEqual(values[3].uri.path, "/d");
      });
    });
  });
  test("Definition Link", () => {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Declaration, back and forth", function() {
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDeclarationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Declaration Link", () => {
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDeclarationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Type Definition, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Type Definition, back and forth", function() {
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeTypeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Type Definition Link", () => {
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeTypeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Implementation, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Implementation, back and forth", function() {
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeImplementationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Implementation Definition Link", () => {
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeImplementationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("reference search, back and forth", function() {
    disposables.push(extHost.registerReferenceProvider(nullExtensionDescription, defaultSelector, {
      provideReferences() {
        return [
          new types.Location(URI.parse("some:uri/path"), new types.Range(0, 1, 0, 5))
        ];
      }
    }));
    return commands.executeCommand("vscode.executeReferenceProvider", model.uri, new types.Position(0, 0)).then((values) => {
      assert.strictEqual(values.length, 1);
      const [first] = values;
      assert.strictEqual(first.uri.toString(), "some:uri/path");
      assert.strictEqual(first.range.start.line, 0);
      assert.strictEqual(first.range.start.character, 1);
      assert.strictEqual(first.range.end.line, 0);
      assert.strictEqual(first.range.end.character, 5);
    });
  });
  test('"vscode.executeDocumentHighlights" API has stopped returning DocumentHighlight[]#200056', async function() {
    disposables.push(extHost.registerDocumentHighlightProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentHighlights() {
        return [
          new types.DocumentHighlight(new types.Range(0, 17, 0, 25), types.DocumentHighlightKind.Read)
        ];
      }
    }));
    await rpcProtocol.sync();
    return commands.executeCommand("vscode.executeDocumentHighlights", model.uri, new types.Position(0, 0)).then((values) => {
      assert.ok(Array.isArray(values));
      assert.strictEqual(values.length, 1);
      const [first] = values;
      assert.strictEqual(first.range.start.line, 0);
      assert.strictEqual(first.range.start.character, 17);
      assert.strictEqual(first.range.end.line, 0);
      assert.strictEqual(first.range.end.character, 25);
    });
  });
  test("Outline, back and forth", function() {
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        return [
          new types.SymbolInformation("testing1", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0)),
          new types.SymbolInformation("testing2", types.SymbolKind.Enum, new types.Range(0, 1, 0, 3))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentSymbolProvider", model.uri).then((values) => {
        assert.strictEqual(values.length, 2);
        const [first, second] = values;
        assert.strictEqual(first instanceof types.SymbolInformation, true);
        assert.strictEqual(second instanceof types.SymbolInformation, true);
        assert.strictEqual(first.name, "testing2");
        assert.strictEqual(second.name, "testing1");
      });
    });
  });
  test("vscode.executeDocumentSymbolProvider command only returns SymbolInformation[] rather than DocumentSymbol[] #57984", function() {
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        return [
          new types.SymbolInformation("SymbolInformation", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0))
        ];
      }
    }));
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        const root = new types.DocumentSymbol("DocumentSymbol", "DocumentSymbol#detail", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0));
        root.children = [new types.DocumentSymbol("DocumentSymbol#child", "DocumentSymbol#detail#child", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0))];
        return [root];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentSymbolProvider", model.uri).then((values) => {
        assert.strictEqual(values.length, 2);
        const [first, second] = values;
        assert.strictEqual(first instanceof types.SymbolInformation, true);
        assert.strictEqual(first instanceof types.DocumentSymbol, false);
        assert.strictEqual(second instanceof types.SymbolInformation, true);
        assert.strictEqual(first.name, "DocumentSymbol");
        assert.strictEqual(first.children.length, 1);
        assert.strictEqual(second.name, "SymbolInformation");
      });
    });
  });
  testApiCmd("triggerCharacter is null when completion provider is called programmatically #159914", async function() {
    let actualContext;
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems(_doc, _pos, _tok, context) {
        actualContext = context;
        return [];
      }
    }, []));
    await rpcProtocol.sync();
    await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(actualContext);
    assert.deepStrictEqual(actualContext, { triggerKind: types.CompletionTriggerKind.Invoke, triggerCharacter: void 0 });
  });
  testApiCmd("Suggest, back and forth", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        a.documentation = new types.MarkdownString("hello_md_string");
        const b = new types.CompletionItem("item2");
        b.textEdit = types.TextEdit.replace(new types.Range(0, 4, 0, 8), "foo");
        const c = new types.CompletionItem("item3");
        c.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 6), "foobar");
        const d = new types.CompletionItem("item4");
        d.range = new types.Range(0, 1, 0, 4);
        d.insertText = new types.SnippetString("foo$0bar");
        return [a, b, c, d];
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(list instanceof types.CompletionList);
    const values = list.items;
    assert.ok(Array.isArray(values));
    assert.strictEqual(values.length, 4);
    const [first, second, third, fourth] = values;
    assert.strictEqual(first.label, "item1");
    assert.strictEqual(first.textEdit, void 0);
    assert.ok(!types.Range.isRange(first.range));
    assert.strictEqual(first.documentation.value, "hello_md_string");
    assert.strictEqual(second.label, "item2");
    assert.strictEqual(second.textEdit.newText, "foo");
    assert.strictEqual(second.textEdit.range.start.line, 0);
    assert.strictEqual(second.textEdit.range.start.character, 4);
    assert.strictEqual(second.textEdit.range.end.line, 0);
    assert.strictEqual(second.textEdit.range.end.character, 8);
    assert.strictEqual(third.label, "item3");
    assert.strictEqual(third.textEdit.newText, "foobar");
    assert.strictEqual(third.textEdit.range.start.line, 0);
    assert.strictEqual(third.textEdit.range.start.character, 1);
    assert.strictEqual(third.textEdit.range.end.line, 0);
    assert.strictEqual(third.textEdit.range.end.character, 6);
    assert.strictEqual(fourth.label, "item4");
    assert.strictEqual(fourth.textEdit, void 0);
    const range = fourth.range;
    assert.ok(types.Range.isRange(range));
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 1);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 4);
    assert.ok(fourth.insertText instanceof types.SnippetString);
    assert.strictEqual(fourth.insertText.value, "foo$0bar");
  });
  testApiCmd("Suggest, return CompletionList !array", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        const b = new types.CompletionItem("item2");
        return new types.CompletionList([a, b], true);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.isIncomplete, true);
  });
  testApiCmd("Suggest, resolve completion items", async function() {
    let resolveCount = 0;
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        const b = new types.CompletionItem("item2");
        const c = new types.CompletionItem("item3");
        const d = new types.CompletionItem("item4");
        return new types.CompletionList([a, b, c, d], false);
      },
      resolveCompletionItem(item) {
        resolveCount += 1;
        return item;
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0,
      2
      // maxItemsToResolve
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(resolveCount, 2);
  });
  testApiCmd('"vscode.executeCompletionItemProvider" doesnot return a preselect field #53749', async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a2 = new types.CompletionItem("item1");
        a2.preselect = true;
        const b2 = new types.CompletionItem("item2");
        const c2 = new types.CompletionItem("item3");
        c2.preselect = true;
        const d2 = new types.CompletionItem("item4");
        return new types.CompletionList([a2, b2, c2, d2], false);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 4);
    const [a, b, c, d] = list.items;
    assert.strictEqual(a.preselect, true);
    assert.strictEqual(b.preselect, void 0);
    assert.strictEqual(c.preselect, true);
    assert.strictEqual(d.preselect, void 0);
  });
  testApiCmd("executeCompletionItemProvider doesn't capture commitCharacters #58228", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a2 = new types.CompletionItem("item1");
        a2.commitCharacters = ["a", "b"];
        const b2 = new types.CompletionItem("item2");
        return new types.CompletionList([a2, b2], false);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 2);
    const [a, b] = list.items;
    assert.deepStrictEqual(a.commitCharacters, ["a", "b"]);
    assert.strictEqual(b.commitCharacters, void 0);
  });
  testApiCmd("vscode.executeCompletionItemProvider returns the wrong CompletionItemKinds in insiders #95715", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        return [
          new types.CompletionItem("My Method", types.CompletionItemKind.Method),
          new types.CompletionItem("My Property", types.CompletionItemKind.Property)
        ];
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 2);
    const [a, b] = list.items;
    assert.strictEqual(a.kind, types.CompletionItemKind.Method);
    assert.strictEqual(b.kind, types.CompletionItemKind.Property);
  });
  test("Parameter Hints, back and forth", async () => {
    disposables.push(extHost.registerSignatureHelpProvider(nullExtensionDescription, defaultSelector, new class {
      provideSignatureHelp(_document, _position, _token, context) {
        return {
          activeSignature: 0,
          activeParameter: 1,
          signatures: [
            {
              label: "abc",
              documentation: `${context.triggerKind === 1 ? "invoked" : "unknown"} ${context.triggerCharacter}`,
              parameters: []
            }
          ]
        };
      }
    }(), []));
    await rpcProtocol.sync();
    const firstValue = await commands.executeCommand("vscode.executeSignatureHelpProvider", model.uri, new types.Position(0, 1), ",");
    assert.strictEqual(firstValue.activeSignature, 0);
    assert.strictEqual(firstValue.activeParameter, 1);
    assert.strictEqual(firstValue.signatures.length, 1);
    assert.strictEqual(firstValue.signatures[0].label, "abc");
    assert.strictEqual(firstValue.signatures[0].documentation, "invoked ,");
  });
  testApiCmd("QuickFix, back and forth", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions() {
        return [{ command: "testing", title: "Title", arguments: [1, 2, true] }];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, new types.Range(0, 0, 1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.title, "Title");
        assert.strictEqual(first.command, "testing");
        assert.deepStrictEqual(first.arguments, [1, 2, true]);
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider results seem to be missing their `command` property #45124", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, range) {
        return [{
          command: {
            arguments: [document, range],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title"
        }];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, new types.Range(0, 0, 1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.ok(first.command);
        assert.strictEqual(first.command.command, "command");
        assert.strictEqual(first.command.title, "command_title");
        assert.strictEqual(first.kind.value, "foo");
        assert.strictEqual(first.title, "title");
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider passes Range to provider although Selection is passed in #77997", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [{
          command: {
            arguments: [document, rangeOrSelection],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title"
        }];
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.ok(first.command);
        assert.ok(first.command.arguments[1] instanceof types.Selection);
        assert.ok(first.command.arguments[1].isEqual(selection));
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider results seem to be missing their `isPreferred` property #78098", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [{
          command: {
            arguments: [document, rangeOrSelection],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title",
          isPreferred: true
        }];
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.isPreferred, true);
      });
    });
  });
  testApiCmd("resolving code action", async function() {
    let didCallResolve = 0;
    class MyAction extends types.CodeAction {
    }
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [new MyAction("title", types.CodeActionKind.Empty.append("foo"))];
      },
      resolveCodeAction(action) {
        assert.ok(action instanceof MyAction);
        didCallResolve += 1;
        action.title = "resolved title";
        action.edit = new types.WorkspaceEdit();
        return action;
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection, void 0, 1e3);
    assert.strictEqual(didCallResolve, 1);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.title, "title");
    assert.ok(first.edit);
  });
  testApiCmd("CodeLens, back and forth", function() {
    const complexArg = {
      foo() {
      },
      bar() {
      },
      big: extHost
    };
    disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, {
      provideCodeLenses() {
        return [new types.CodeLens(new types.Range(0, 0, 1, 1), { title: "Title", command: "cmd", arguments: [1, true, complexArg] })];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeLensProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.command.title, "Title");
        assert.strictEqual(first.command.command, "cmd");
        assert.strictEqual(first.command.arguments[0], 1);
        assert.strictEqual(first.command.arguments[1], true);
        assert.strictEqual(first.command.arguments[2], complexArg);
      });
    });
  });
  testApiCmd("CodeLens, resolve", async function() {
    let resolveCount = 0;
    disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, {
      provideCodeLenses() {
        return [
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1), { title: "Already resolved", command: "fff" })
        ];
      },
      resolveCodeLens(codeLens) {
        codeLens.command = { title: resolveCount.toString(), command: "resolved" };
        resolveCount += 1;
        return codeLens;
      }
    }));
    await rpcProtocol.sync();
    let value = await commands.executeCommand("vscode.executeCodeLensProvider", model.uri, 2);
    assert.strictEqual(value.length, 3);
    assert.strictEqual(resolveCount, 2);
    resolveCount = 0;
    value = await commands.executeCommand("vscode.executeCodeLensProvider", model.uri);
    assert.strictEqual(value.length, 4);
    assert.strictEqual(resolveCount, 0);
  });
  testApiCmd("Links, back and forth", function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse("foo:bar"))];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeLinkProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.target + "", "foo:bar");
        assert.strictEqual(first.range.start.line, 0);
        assert.strictEqual(first.range.start.character, 0);
        assert.strictEqual(first.range.end.line, 0);
        assert.strictEqual(first.range.end.character, 20);
      });
    });
  });
  testApiCmd("What's the condition for DocumentLink target to be undefined? #106308", async function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 0, 20), void 0)];
      },
      resolveDocumentLink(link) {
        link.target = URI.parse("foo:bar");
        return link;
      }
    }));
    await rpcProtocol.sync();
    const links1 = await commands.executeCommand("vscode.executeLinkProvider", model.uri);
    assert.strictEqual(links1.length, 1);
    assert.strictEqual(links1[0].target, void 0);
    const links2 = await commands.executeCommand("vscode.executeLinkProvider", model.uri, 1e3);
    assert.strictEqual(links2.length, 1);
    assert.strictEqual(links2[0].target.toString(), URI.parse("foo:bar").toString());
  });
  testApiCmd("DocumentLink[] vscode.executeLinkProvider returns lack tooltip #213970", async function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        const link = new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse("foo:bar"));
        link.tooltip = "Link Tooltip";
        return [link];
      }
    }));
    await rpcProtocol.sync();
    const links1 = await commands.executeCommand("vscode.executeLinkProvider", model.uri);
    assert.strictEqual(links1.length, 1);
    assert.strictEqual(links1[0].tooltip, "Link Tooltip");
  });
  test("Color provider", function() {
    disposables.push(extHost.registerColorProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentColors() {
        return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
      },
      provideColorPresentations() {
        const cp = new types.ColorPresentation("#ABC");
        cp.textEdit = types.TextEdit.replace(new types.Range(1, 0, 1, 20), "#ABC");
        cp.additionalTextEdits = [types.TextEdit.insert(new types.Position(2, 20), "*")];
        return [cp];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentColorProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.color.red, 0.1);
        assert.strictEqual(first.color.green, 0.2);
        assert.strictEqual(first.color.blue, 0.3);
        assert.strictEqual(first.color.alpha, 0.4);
        assert.strictEqual(first.range.start.line, 0);
        assert.strictEqual(first.range.start.character, 0);
        assert.strictEqual(first.range.end.line, 0);
        assert.strictEqual(first.range.end.character, 20);
      });
    }).then(() => {
      const color = new types.Color(0.5, 0.6, 0.7, 0.8);
      const range = new types.Range(0, 0, 0, 20);
      return commands.executeCommand("vscode.executeColorPresentationProvider", color, { uri: model.uri, range }).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.label, "#ABC");
        assert.strictEqual(first.textEdit.newText, "#ABC");
        assert.strictEqual(first.textEdit.range.start.line, 1);
        assert.strictEqual(first.textEdit.range.start.character, 0);
        assert.strictEqual(first.textEdit.range.end.line, 1);
        assert.strictEqual(first.textEdit.range.end.character, 20);
        assert.strictEqual(first.additionalTextEdits.length, 1);
        assert.strictEqual(first.additionalTextEdits[0].range.start.line, 2);
        assert.strictEqual(first.additionalTextEdits[0].range.start.character, 20);
        assert.strictEqual(first.additionalTextEdits[0].range.end.line, 2);
        assert.strictEqual(first.additionalTextEdits[0].range.end.character, 20);
      });
    });
  });
  test('"TypeError: e.onCancellationRequested is not a function" calling hover provider in Insiders #54174', function() {
    disposables.push(extHost.registerHoverProvider(nullExtensionDescription, defaultSelector, {
      provideHover() {
        return new types.Hover("fofofofo");
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeHoverProvider", model.uri, new types.Position(1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        assert.strictEqual(value[0].contents.length, 1);
      });
    });
  });
  testApiCmd("Inlay Hints, back and forth", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        return [new types.InlayHint(new types.Position(0, 1), "Foo")];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
  });
  testApiCmd("Inline Hints, merge", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        const part = new types.InlayHintLabelPart("Bar");
        part.tooltip = "part_tooltip";
        part.command = { command: "cmd", title: "part" };
        const hint = new types.InlayHint(new types.Position(10, 11), [part]);
        hint.tooltip = "hint_tooltip";
        hint.paddingLeft = true;
        hint.paddingRight = false;
        return [hint];
      }
    }));
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        const hint = new types.InlayHint(new types.Position(0, 1), "Foo", types.InlayHintKind.Parameter);
        hint.textEdits = [types.TextEdit.insert(new types.Position(0, 0), "Hello")];
        return [hint];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
    assert.strictEqual(first.textEdits?.length, 1);
    assert.strictEqual(first.textEdits[0].newText, "Hello");
    assert.strictEqual(second.position.line, 10);
    assert.strictEqual(second.position.character, 11);
    assert.strictEqual(second.paddingLeft, true);
    assert.strictEqual(second.paddingRight, false);
    assert.strictEqual(second.tooltip, "hint_tooltip");
    const label = second.label[0];
    assertType(label instanceof types.InlayHintLabelPart);
    assert.strictEqual(label.value, "Bar");
    assert.strictEqual(label.tooltip, "part_tooltip");
    assert.strictEqual(label.command?.command, "cmd");
    assert.strictEqual(label.command?.title, "part");
  });
  testApiCmd("Inline Hints, bad provider", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        return [new types.InlayHint(new types.Position(0, 1), "Foo")];
      }
    }));
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        throw new Error();
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
  });
  test("Selection Range, back and forth", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges() {
        return [
          new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20)))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeSelectionRangeProvider", model.uri, [new types.Position(0, 10)]);
    assert.strictEqual(value.length, 1);
    assert.ok(value[0].parent);
  });
  test("CallHierarchy, back and forth", async function() {
    disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareCallHierarchy(document, position) {
        return new types.CallHierarchyItem(types.SymbolKind.Constant, "ROOT", "ROOT", document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0));
      }
      provideCallHierarchyIncomingCalls(item, token) {
        return [new types.CallHierarchyIncomingCall(
          new types.CallHierarchyItem(types.SymbolKind.Constant, "INCOMING", "INCOMING", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
          [new types.Range(0, 0, 0, 0)]
        )];
      }
      provideCallHierarchyOutgoingCalls(item, token) {
        return [new types.CallHierarchyOutgoingCall(
          new types.CallHierarchyItem(types.SymbolKind.Constant, "OUTGOING", "OUTGOING", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
          [new types.Range(0, 0, 0, 0)]
        )];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareCallHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 1);
    assert.strictEqual(root[0].name, "ROOT");
    const incoming = await commands.executeCommand("vscode.provideIncomingCalls", root[0]);
    assert.strictEqual(incoming.length, 1);
    assert.strictEqual(incoming[0].from.name, "INCOMING");
    const outgoing = await commands.executeCommand("vscode.provideOutgoingCalls", root[0]);
    assert.strictEqual(outgoing.length, 1);
    assert.strictEqual(outgoing[0].to.name, "OUTGOING");
  });
  test("prepareCallHierarchy throws TypeError if clangd returns empty result #137415", async function() {
    disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareCallHierarchy(document, position) {
        return [];
      }
      provideCallHierarchyIncomingCalls(item, token) {
        return [];
      }
      provideCallHierarchyOutgoingCalls(item, token) {
        return [];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareCallHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 0);
  });
  test("TypeHierarchy, back and forth", async function() {
    disposables.push(extHost.registerTypeHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareTypeHierarchy(document, position, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "ROOT", "ROOT", document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
      provideTypeHierarchySupertypes(item, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "SUPER", "SUPER", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
      provideTypeHierarchySubtypes(item, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "SUB", "SUB", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareTypeHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 1);
    assert.strictEqual(root[0].name, "ROOT");
    const incoming = await commands.executeCommand("vscode.provideSupertypes", root[0]);
    assert.strictEqual(incoming.length, 1);
    assert.strictEqual(incoming[0].name, "SUPER");
    const outgoing = await commands.executeCommand("vscode.provideSubtypes", root[0]);
    assert.strictEqual(outgoing.length, 1);
    assert.strictEqual(outgoing[0].name, "SUB");
  });
  test("selectionRangeProvider on inner array always returns outer array #91852", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges(_doc, positions) {
        const [first] = positions;
        return [
          new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeSelectionRangeProvider", model.uri, [new types.Position(0, 10)]);
    assert.strictEqual(value.length, 1);
    assert.strictEqual(value[0].range.start.line, 0);
    assert.strictEqual(value[0].range.start.character, 10);
    assert.strictEqual(value[0].range.end.line, 0);
    assert.strictEqual(value[0].range.end.character, 10);
  });
  test("more element test of selectionRangeProvider on inner array always returns outer array #91852", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges(_doc, positions) {
        const [first, second] = positions;
        return [
          new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character)),
          new types.SelectionRange(new types.Range(second.line, second.character, second.line, second.character))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand(
      "vscode.executeSelectionRangeProvider",
      model.uri,
      [new types.Position(0, 0), new types.Position(0, 10)]
    );
    assert.strictEqual(value.length, 2);
    assert.strictEqual(value[0].range.start.line, 0);
    assert.strictEqual(value[0].range.start.character, 0);
    assert.strictEqual(value[0].range.end.line, 0);
    assert.strictEqual(value[0].range.end.character, 0);
    assert.strictEqual(value[1].range.start.line, 0);
    assert.strictEqual(value[1].range.start.character, 10);
    assert.strictEqual(value[1].range.end.line, 0);
    assert.strictEqual(value[1].range.end.character, 10);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdEFwaUNvbW1hbmRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZWxlbnMvYnJvd3Nlci9jb2RlbGVucy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvY29sb3JQaWNrZXJDb250cmlidXRpb24uanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9mb3JtYXQvYnJvd3Nlci9mb3JtYXQuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub0NvbW1hbmRzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvZG9jdW1lbnRTeW1ib2xzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9nZXRIb3Zlci5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2xpbmtzL2Jyb3dzZXIvZ2V0TGlua3MuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wYXJhbWV0ZXJIaW50cy9icm93c2VyL3Byb3ZpZGVTaWduYXR1cmVIZWxwLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc21hcnRTZWxlY3QvYnJvd3Nlci9zbWFydFNlbGVjdC5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcmVuYW1lL2Jyb3dzZXIvcmVuYW1lLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5sYXlIaW50cy9icm93c2VyL2lubGF5SGludHNDb250cm9sbGVyLmpzJztcblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciwgZXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlLCBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QXBpQ29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEFwaUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3REaWFnbm9zdGljcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCAnLi4vLi4vLi4vY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2guY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIEltbW9ydGFsUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsQXBpRGVwcmVjYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBVUklUcmFuc2Zvcm1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVyaVRyYW5zZm9ybWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSwgT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEZvcm1hdHRpbmdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuXG5mdW5jdGlvbiBhc3NlcnRSZWplY3RzKGZuOiAoKSA9PiBQcm9taXNlPGFueT4sIG1lc3NhZ2U6IHN0cmluZyA9ICdFeHBlY3RlZCByZWplY3Rpb24nKSB7XG5cdHJldHVybiBmbigpLnRoZW4oKCkgPT4gYXNzZXJ0Lm9rKGZhbHNlLCBtZXNzYWdlKSwgX2VyciA9PiBhc3NlcnQub2sodHJ1ZSkpO1xufVxuXG5mdW5jdGlvbiBpc0xvY2F0aW9uKHZhbHVlOiB2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKTogdmFsdWUgaXMgdnNjb2RlLkxvY2F0aW9uIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgdnNjb2RlLkxvY2F0aW9uO1xuXHRyZXR1cm4gY2FuZGlkYXRlICYmIGNhbmRpZGF0ZS51cmkgaW5zdGFuY2VvZiBVUkkgJiYgY2FuZGlkYXRlLnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2U7XG59XG5cbnN1aXRlKCdFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlQ29tbWFuZHMnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IGRlZmF1bHRTZWxlY3RvciA9IHsgc2NoZW1lOiAnZmFyJyB9O1xuXHRsZXQgbW9kZWw6IElUZXh0TW9kZWw7XG5cblx0bGV0IGluc3RhOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBycGNQcm90b2NvbDogVGVzdFJQQ1Byb3RvY29sO1xuXHRsZXQgZXh0SG9zdDogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXM7XG5cdGxldCBtYWluVGhyZWFkOiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcztcblx0bGV0IGNvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHM7XG5cdGxldCBkaXNwb3NhYmxlczogdnNjb2RlLkRpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGxldCBvcmlnaW5hbEVycm9ySGFuZGxlcjogKGU6IGFueSkgPT4gYW55O1xuXG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyB0aGUgZmlyc3QgbGluZScsXG5cdFx0XHRcdCdUaGlzIGlzIHRoZSBzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdUaGlzIGlzIHRoZSB0aGlyZCBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRVUkkucGFyc2UoJ2ZhcjovL3Rlc3RpbmcvZmlsZS5iJykpO1xuXHRcdG9yaWdpbmFsRXJyb3JIYW5kbGVyID0gZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHQvLyBVc2UgSUluc3RhbnRpYXRpb25TZXJ2aWNlIHRvIGdldCB0eXBlY2hlY2tpbmcgd2hlbiBpbnN0YW50aWF0aW5nXG5cdFx0cnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVVyaUlkZW50aXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKTogVVJJIHtcblx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgYWN0aXZhdGVCeUV2ZW50KCkge1xuXG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhY3RpdmF0aW9uRXZlbnRJc0RvbmUoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElDb21tYW5kU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKGNsYXNzIGV4dGVuZHMgbW9jazxJQ29tbWFuZFNlcnZpY2U+KCkge1xuXG5cdFx0XHRvdmVycmlkZSBleGVjdXRlQ29tbWFuZChpZDogc3RyaW5nLCAuLi5hcmdzOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kcygpLmdldChpZCk7XG5cdFx0XHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoaWQgKyAnIE5PVCBrbm93bicpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB7IGhhbmRsZXIgfSA9IGNvbW1hbmQ7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoaW5zdGEuaW52b2tlRnVuY3Rpb24oaGFuZGxlciwgLi4uYXJncykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVudmlyb25tZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzQnVpbHQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0b3ZlcnJpZGUgaXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJTWFya2VyU2VydmljZSwgbmV3IE1hcmtlclNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTnVsbExvZ1NlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTW9kZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWwoKSB7IHJldHVybiBtb2RlbDsgfVxuXHRcdFx0b3ZlcnJpZGUgb25Nb2RlbFJlbW92ZWQgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJVGV4dE1vZGVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVNb2RlbFJlZmVyZW5jZSgpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+KG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSB0ZXh0RWRpdG9yTW9kZWwgPSBtb2RlbDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JXb3JrZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKF91cmk6IGFueSwgZWRpdHM6IGFueSkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdHMgfHwgdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElPdXRsaW5lTW9kZWxTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoT3V0bGluZU1vZGVsU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpO1xuXG5cdFx0Y29uc3QgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgPSBuZXcgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHR1cmk6IG1vZGVsLnVyaSxcblx0XHRcdFx0bGluZXM6IG1vZGVsLmdldFZhbHVlKCkuc3BsaXQobW9kZWwuZ2V0RU9MKCkpLFxuXHRcdFx0XHRFT0w6IG1vZGVsLmdldEVPTCgpLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4dEhvc3REb2N1bWVudHMgPSBuZXcgRXh0SG9zdERvY3VtZW50cyhycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0RG9jdW1lbnRzKTtcblxuXHRcdGNvbW1hbmRzID0gbmV3IEV4dEhvc3RDb21tYW5kcyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDb21tYW5kcywgY29tbWFuZHMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkQ29tbWFuZHMsIGluc3RhLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDb21tYW5kcywgcnBjUHJvdG9jb2wpKTtcblx0XHRFeHRIb3N0QXBpQ29tbWFuZHMucmVnaXN0ZXIoY29tbWFuZHMpO1xuXG5cdFx0Y29uc3QgZGlhZ25vc3RpY3MgPSBuZXcgRXh0SG9zdERpYWdub3N0aWNzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvPigpIHsgfSwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGlhZ25vc3RpY3MsIGRpYWdub3N0aWNzKTtcblxuXHRcdGV4dEhvc3QgPSBuZXcgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMocnBjUHJvdG9jb2wsIG5ldyBVUklUcmFuc2Zvcm1lclNlcnZpY2UobnVsbCksIGV4dEhvc3REb2N1bWVudHMsIGNvbW1hbmRzLCBkaWFnbm9zdGljcywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxBcGlEZXByZWNhdGlvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLCBleHRIb3N0KTtcblxuXHRcdG1haW5UaHJlYWQgPSBycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMsIGluc3RhLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLCBycGNQcm90b2NvbCkpO1xuXG5cdFx0Ly8gZm9yY2VmdWxseSBjcmVhdGUgdGhlIG91dGxpbmUgc2VydmljZSBzbyB0aGF0IGBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGVgIGRvZXNuJ3QgYmFya1xuXHRcdGluc3RhLmdldChJT3V0bGluZU1vZGVsU2VydmljZSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdpbmFsRXJyb3JIYW5kbGVyKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0bWFpblRocmVhZC5kaXNwb3NlKCk7XG5cblx0XHQoPE91dGxpbmVNb2RlbFNlcnZpY2U+aW5zdGEuZ2V0KElPdXRsaW5lTW9kZWxTZXJ2aWNlKSkuZGlzcG9zZSgpO1xuXHRcdGluc3RhLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIHdvcmtzcGFjZSBzeW1ib2xzXG5cblx0ZnVuY3Rpb24gdGVzdEFwaUNtZChuYW1lOiBzdHJpbmcsIGZuOiAoKSA9PiBQcm9taXNlPGFueT4pIHtcblx0XHR0ZXN0KG5hbWUsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBmbigpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDAwKTsgXHQvLyBBUEkgY29tbWFuZHMgZm9yIHRoaW5ncyB0aGF0IGFsbG93IGNvbW1hbmRzIGRpc3Bvc2UgdGhlaXIgcmVzdWx0IGRlbGF5LiBUaGlzIGlzIHRvIGJlIG5pY2Vcblx0XHRcdFx0Ly8gYmVjYXVzZSBvdGhlcndpc2UgcHJvcGVydGllcyBsaWtlIGNvbW1hbmQgYXJlIGRpc3Bvc2VkIHRvbyBlYXJseVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0fVxuXG5cdHRlc3QoJ1dvcmtzcGFjZVN5bWJvbHMsIGludmFsaWQgYXJndW1lbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb21pc2VzID0gW1xuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXInLCBudWxsKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgdW5kZWZpbmVkKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgdHJ1ZSkpXG5cdFx0XTtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3Jrc3BhY2VTeW1ib2xzLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgPHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scyhxdWVyeSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKHF1ZXJ5LCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIFVSSS5wYXJzZSgnZmFyOi8vdGVzdGluZy9maXJzdCcpKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24ocXVlcnksIHR5cGVzLlN5bWJvbEtpbmQuQXJyYXksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSwgVVJJLnBhcnNlKCdmYXI6Ly90ZXN0aW5nL3NlY29uZCcpKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgPHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scyhxdWVyeSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKHF1ZXJ5LCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIFVSSS5wYXJzZSgnZmFyOi8vdGVzdGluZy9maXJzdCcpKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgJ3Rlc3RpbmcnKS50aGVuKHZhbHVlID0+IHtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAyKTsgLy8gZGUtZHVwZWRcblx0XHRcdFx0Zm9yIChjb25zdCBpbmZvIG9mIHZhbHVlKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8gaW5zdGFuY2VvZiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8ubmFtZSwgJ3Rlc3RpbmcnKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mby5raW5kLCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlciBzaG91bGQgYWNjZXB0IGVtcHR5IHN0cmluZywgIzM5NTIyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb25bXSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdoZWxsbycsIHR5cGVzLlN5bWJvbEtpbmQuQXJyYXksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgVVJJLnBhcnNlKCdmb286YmFyJykpIGFzIHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbl07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGxldCBzeW1ib2xzID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeW1ib2xzLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0c3ltYm9scyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPigndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsICcqJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5bWJvbHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tIGZvcm1hdHRpbmdcblx0dGVzdCgnZXhlY3V0ZUZvcm1hdERvY3VtZW50UHJvdmlkZXIsIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cygpIHtcblx0XHRcdFx0cmV0dXJuIFt0eXBlcy5UZXh0RWRpdC5pbnNlcnQobmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApLCAnNDInKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZUZvcm1hdERvY3VtZW50UHJvdmlkZXInLCBtb2RlbC51cmksIHtcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdH0gc2F0aXNmaWVzIEZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblxuXHQvLyAtLS0gcmVuYW1lXG5cdHRlc3QoJ3ZzY29kZS5wcmVwYXJlUmVuYW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXG5cdFx0XHRwcmVwYXJlUmVuYW1lKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgwLCAxMiwgMCwgMjQpLFxuXHRcdFx0XHRcdHBsYWNlaG9sZGVyOiAnZm9vb1BsYWNlaG9sZGVyJ1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBlZGl0ID0gbmV3IHR5cGVzLldvcmtzcGFjZUVkaXQoKTtcblx0XHRcdFx0ZWRpdC5pbnNlcnQoZG9jdW1lbnQudXJpLCA8dHlwZXMuUG9zaXRpb24+cG9zaXRpb24sIG5ld05hbWUpO1xuXHRcdFx0XHRyZXR1cm4gZWRpdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8eyByYW5nZTogdnNjb2RlLlJhbmdlOyBwbGFjZWhvbGRlcjogc3RyaW5nIH0+KCd2c2NvZGUucHJlcGFyZVJlbmFtZScsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEyKSk7XG5cblx0XHRhc3NlcnQub2soZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucGxhY2Vob2xkZXIsICdmb29vUGxhY2Vob2xkZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucmFuZ2UuZW5kLmNoYXJhY3RlciwgMjQpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3ZzY29kZS5leGVjdXRlRG9jdW1lbnRSZW5hbWVQcm92aWRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cyhkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwgbmV3TmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdFx0XHRlZGl0Lmluc2VydChkb2N1bWVudC51cmksIDx0eXBlcy5Qb3NpdGlvbj5wb3NpdGlvbiwgbmV3TmFtZSk7XG5cdFx0XHRcdHJldHVybiBlZGl0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuV29ya3NwYWNlRWRpdD4oJ3ZzY29kZS5leGVjdXRlRG9jdW1lbnRSZW5hbWVQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEyKSwgJ25ld05hbWVPZlRoaXMnKTtcblxuXHRcdGFzc2VydC5vayhlZGl0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdC5oYXMobW9kZWwudXJpKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgdGV4dEVkaXRzID0gZWRpdC5nZXQobW9kZWwudXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0c1swXS5uZXdUZXh0LCAnbmV3TmFtZU9mVGhpcycpO1xuXHR9KTtcblxuXHQvLyAtLS0gZGVmaW5pdGlvblxuXG5cdHRlc3QoJ0RlZmluaXRpb24sIGludmFsaWQgYXJndW1lbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb21pc2VzID0gW1xuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcicsIG51bGwpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgdW5kZWZpbmVkKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcicsIHRydWUsIGZhbHNlKSlcblx0XHRdO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fSk7XG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHJlc3VsdCB3aWxsIGdldCByZW1vdmVkXG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSg0LCAwLCAwLCAwKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRhc3NlcnQub2sodi5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgYmFjayBhbmQgZm9ydGggKHNvcnRpbmcgJiBkZS1kZWR1cGluZyknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vYicpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHJlc3VsdCB3aWxsIGdldCByZW1vdmVkXG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oVVJJLnBhcnNlKCdmaWxlOi8vL2InKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmlsZTovLy9hJyksIG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmlsZTovLy9jJyksIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmlsZTovLy9kJyksIG5ldyB0eXBlcy5SYW5nZSg0LCAwLCAwLCAwKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXNbMF0udXJpLnBhdGgsICcvYScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzFdLnVyaS5wYXRoLCAnL2InKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlc1syXS51cmkucGF0aCwgJy9jJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXNbM10udXJpLnBhdGgsICcvZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlZmluaXRpb24gTGluaycsICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKGRvYzogYW55KTogKHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdHsgdGFyZ2V0VXJpOiBkb2MudXJpLCB0YXJnZXRSYW5nZTogbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApLCB0YXJnZXRTZWxlY3Rpb25SYW5nZTogbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDEsIDEpLCBvcmlnaW5TZWxlY3Rpb25SYW5nZTogbmV3IHR5cGVzLlJhbmdlKDIsIDIsIDIsIDIpIH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPCh2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdPigndnNjb2RlLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRpZiAoaXNMb2NhdGlvbih2KSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRVcmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0UmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRTZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2Lm9yaWdpblNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBkZWNsYXJhdGlvblxuXG5cdHRlc3QoJ0RlY2xhcmF0aW9uLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVjbGFyYXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVjbGFyYXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVjbGFyYXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVjbGFyYXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHQvLyBkdXBsaWNhdGUgcmVzdWx0IHdpbGwgZ2V0IHJlbW92ZWRcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURlY2xhcmF0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDIsIDAsIDAsIDApKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDMsIDAsIDAsIDApKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDQsIDAsIDAsIDApKSxcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Mb2NhdGlvbltdPigndnNjb2RlLmV4ZWN1dGVEZWNsYXJhdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRhc3NlcnQub2sodi5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlY2xhcmF0aW9uIExpbmsnLCAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5EZWNsYXJhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWNsYXJhdGlvbihkb2M6IGFueSk6ICh2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKSxcblx0XHRcdFx0XHR7IHRhcmdldFVyaTogZG9jLnVyaSwgdGFyZ2V0UmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSwgdGFyZ2V0U2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAxLCAxKSwgb3JpZ2luU2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgyLCAyLCAyLCAyKSB9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDwodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXT4oJ3ZzY29kZS5leGVjdXRlRGVjbGFyYXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGlmIChpc0xvY2F0aW9uKHYpKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi51cmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRSYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYub3JpZ2luU2VsZWN0aW9uUmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIHR5cGUgZGVmaW5pdGlvblxuXG5cdHRlc3QoJ1R5cGUgRGVmaW5pdGlvbiwgaW52YWxpZCBhcmd1bWVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSBbXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInLCBudWxsKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInLCB1bmRlZmluZWQpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlVHlwZURlZmluaXRpb25Qcm92aWRlcicsIHRydWUsIGZhbHNlKSlcblx0XHRdO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fSk7XG5cblx0dGVzdCgnVHlwZSBEZWZpbml0aW9uLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlVHlwZURlZmluaXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlVHlwZURlZmluaXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHQvLyBkdXBsaWNhdGUgcmVzdWx0IHdpbGwgZ2V0IHJlbW92ZWRcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVR5cGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDIsIDAsIDAsIDApKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDMsIDAsIDAsIDApKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDQsIDAsIDAsIDApKSxcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Mb2NhdGlvbltdPigndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRhc3NlcnQub2sodi5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1R5cGUgRGVmaW5pdGlvbiBMaW5rJywgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlVHlwZURlZmluaXRpb24oZG9jOiBhbnkpOiAodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0eyB0YXJnZXRVcmk6IGRvYy51cmksIHRhcmdldFJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCksIHRhcmdldFNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSksIG9yaWdpblNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMiwgMiwgMiwgMikgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8KHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10+KCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRpZiAoaXNMb2NhdGlvbih2KSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRVcmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0UmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRTZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2Lm9yaWdpblNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbXBsZW1lbnRhdGlvblxuXG5cdHRlc3QoJ0ltcGxlbWVudGF0aW9uLCBpbnZhbGlkIGFyZ3VtZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm9taXNlcyA9IFtcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsIG51bGwpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsIHVuZGVmaW5lZCkpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVJbXBsZW1lbnRhdGlvblByb3ZpZGVyJywgdHJ1ZSwgZmFsc2UpKVxuXHRcdF07XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbXBsZW1lbnRhdGlvbiwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkltcGxlbWVudGF0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUltcGxlbWVudGF0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkltcGxlbWVudGF0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUltcGxlbWVudGF0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHJlc3VsdCB3aWxsIGdldCByZW1vdmVkXG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSg0LCAwLCAwLCAwKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbXBsZW1lbnRhdGlvbiBEZWZpbml0aW9uIExpbmsnLCAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbihkb2M6IGFueSk6ICh2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKSxcblx0XHRcdFx0XHR7IHRhcmdldFVyaTogZG9jLnVyaSwgdGFyZ2V0UmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSwgdGFyZ2V0U2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAxLCAxKSwgb3JpZ2luU2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgyLCAyLCAyLCAyKSB9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDwodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXT4oJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGlmIChpc0xvY2F0aW9uKHYpKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi51cmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRSYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYub3JpZ2luU2VsZWN0aW9uUmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlZmVyZW5jZXNcblxuXHR0ZXN0KCdyZWZlcmVuY2Ugc2VhcmNoLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlJlZmVyZW5jZVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzKCkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ3NvbWU6dXJpL3BhdGgnKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDEsIDAsIDUpKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlUmVmZXJlbmNlUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC51cmkudG9TdHJpbmcoKSwgJ3NvbWU6dXJpL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQuY2hhcmFjdGVyLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGRvY3VtZW50IGhpZ2hsaWdodHNcblxuXHR0ZXN0KCdcInZzY29kZS5leGVjdXRlRG9jdW1lbnRIaWdobGlnaHRzXCIgQVBJIGhhcyBzdG9wcGVkIHJldHVybmluZyBEb2N1bWVudEhpZ2hsaWdodFtdIzIwMDA1NicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoKSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgwLCAxNywgMCwgMjUpLCB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQuUmVhZClcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0W10+KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50SGlnaGxpZ2h0cycsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheSh2YWx1ZXMpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxNyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDI1KTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHQvLyAtLS0gb3V0bGluZVxuXG5cdHRlc3QoJ091dGxpbmUsIGJhY2sgYW5kIGZvcnRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCd0ZXN0aW5nMScsIHR5cGVzLlN5bWJvbEtpbmQuRW51bSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24oJ3Rlc3RpbmcyJywgdHlwZXMuU3ltYm9sS2luZC5FbnVtLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMSwgMCwgMykpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50U3ltYm9sUHJvdmlkZXInLCBtb2RlbC51cmkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdCBpbnN0YW5jZW9mIHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZCBpbnN0YW5jZW9mIHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lm5hbWUsICd0ZXN0aW5nMicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm5hbWUsICd0ZXN0aW5nMScpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZzY29kZS5leGVjdXRlRG9jdW1lbnRTeW1ib2xQcm92aWRlciBjb21tYW5kIG9ubHkgcmV0dXJucyBTeW1ib2xJbmZvcm1hdGlvbltdIHJhdGhlciB0aGFuIERvY3VtZW50U3ltYm9sW10gIzU3OTg0JywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRTeW1ib2xzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdTeW1ib2xJbmZvcm1hdGlvbicsIHR5cGVzLlN5bWJvbEtpbmQuRW51bSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRjb25zdCByb290ID0gbmV3IHR5cGVzLkRvY3VtZW50U3ltYm9sKCdEb2N1bWVudFN5bWJvbCcsICdEb2N1bWVudFN5bWJvbCNkZXRhaWwnLCB0eXBlcy5TeW1ib2xLaW5kLkVudW0sIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApKTtcblx0XHRcdFx0cm9vdC5jaGlsZHJlbiA9IFtuZXcgdHlwZXMuRG9jdW1lbnRTeW1ib2woJ0RvY3VtZW50U3ltYm9sI2NoaWxkJywgJ0RvY3VtZW50U3ltYm9sI2RldGFpbCNjaGlsZCcsIHR5cGVzLlN5bWJvbEtpbmQuRW51bSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMSwgMCkpXTtcblx0XHRcdFx0cmV0dXJuIFtyb290XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPCh2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb24gJiB2c2NvZGUuRG9jdW1lbnRTeW1ib2wpW10+KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50U3ltYm9sUHJvdmlkZXInLCBtb2RlbC51cmkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdCBpbnN0YW5jZW9mIHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0IGluc3RhbmNlb2YgdHlwZXMuRG9jdW1lbnRTeW1ib2wsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZCBpbnN0YW5jZW9mIHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lm5hbWUsICdEb2N1bWVudFN5bWJvbCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY2hpbGRyZW4ubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5uYW1lLCAnU3ltYm9sSW5mb3JtYXRpb24nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gc3VnZ2VzdFxuXG5cdHRlc3RBcGlDbWQoJ3RyaWdnZXJDaGFyYWN0ZXIgaXMgbnVsbCB3aGVuIGNvbXBsZXRpb24gcHJvdmlkZXIgaXMgY2FsbGVkIHByb2dyYW1tYXRpY2FsbHkgIzE1OTkxNCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBhY3R1YWxDb250ZXh0OiB2c2NvZGUuQ29tcGxldGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhfZG9jLCBfcG9zLCBfdG9rLCBjb250ZXh0KTogYW55IHtcblx0XHRcdFx0YWN0dWFsQ29udGV4dCA9IGNvbnRleHQ7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0YXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbXBsZXRpb25MaXN0PigndnNjb2RlLmV4ZWN1dGVDb21wbGV0aW9uSXRlbVByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgNCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbENvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsQ29udGV4dCwgeyB0cmlnZ2VyS2luZDogdHlwZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSwgdHJpZ2dlckNoYXJhY3RlcjogdW5kZWZpbmVkIH0pO1xuXG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ1N1Z2dlc3QsIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0Y29uc3QgYSA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTEnKTtcblx0XHRcdFx0YS5kb2N1bWVudGF0aW9uID0gbmV3IHR5cGVzLk1hcmtkb3duU3RyaW5nKCdoZWxsb19tZF9zdHJpbmcnKTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTInKTtcblx0XHRcdFx0Yi50ZXh0RWRpdCA9IHR5cGVzLlRleHRFZGl0LnJlcGxhY2UobmV3IHR5cGVzLlJhbmdlKDAsIDQsIDAsIDgpLCAnZm9vJyk7IC8vIG92ZXJ3aXRlIGFmdGVyXG5cdFx0XHRcdGNvbnN0IGMgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0zJyk7XG5cdFx0XHRcdGMudGV4dEVkaXQgPSB0eXBlcy5UZXh0RWRpdC5yZXBsYWNlKG5ldyB0eXBlcy5SYW5nZSgwLCAxLCAwLCA2KSwgJ2Zvb2JhcicpOyAvLyBvdmVyd2l0ZSBiZWZvcmUgJiBhZnRlclxuXG5cdFx0XHRcdC8vIHNuaXBwZXQgc3RyaW5nIVxuXHRcdFx0XHRjb25zdCBkID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtNCcpO1xuXHRcdFx0XHRkLnJhbmdlID0gbmV3IHR5cGVzLlJhbmdlKDAsIDEsIDAsIDQpOy8vIG92ZXJ3aXRlIGJlZm9yZVxuXHRcdFx0XHRkLmluc2VydFRleHQgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygnZm9vJDBiYXInKTtcblx0XHRcdFx0cmV0dXJuIFthLCBiLCBjLCBkXTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgbGlzdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db21wbGV0aW9uTGlzdD4oJ3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpKTtcblx0XHRhc3NlcnQub2sobGlzdCBpbnN0YW5jZW9mIHR5cGVzLkNvbXBsZXRpb25MaXN0KTtcblx0XHRjb25zdCB2YWx1ZXMgPSBsaXN0Lml0ZW1zO1xuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHZhbHVlcykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZCwgdGhpcmQsIGZvdXJ0aF0gPSB2YWx1ZXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxhYmVsLCAnaXRlbTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXQsIHVuZGVmaW5lZCk7IC8vIG5vIHRleHQgZWRpdCwgZGVmYXVsdCByYW5nZXNcblx0XHRhc3NlcnQub2soIXR5cGVzLlJhbmdlLmlzUmFuZ2UoZmlyc3QucmFuZ2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDx0eXBlcy5NYXJrZG93blN0cmluZz5maXJzdC5kb2N1bWVudGF0aW9uKS52YWx1ZSwgJ2hlbGxvX21kX3N0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQubGFiZWwsICdpdGVtMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudGV4dEVkaXQhLm5ld1RleHQsICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRFZGl0IS5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRFZGl0IS5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudGV4dEVkaXQhLnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRFZGl0IS5yYW5nZS5lbmQuY2hhcmFjdGVyLCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQubGFiZWwsICdpdGVtMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0RWRpdCEubmV3VGV4dCwgJ2Zvb2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLnRleHRFZGl0IS5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0RWRpdCEucmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0RWRpdCEucmFuZ2UuZW5kLmNoYXJhY3RlciwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdXJ0aC5sYWJlbCwgJ2l0ZW00Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdXJ0aC50ZXh0RWRpdCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByYW5nZTogYW55ID0gZm91cnRoLnJhbmdlITtcblx0XHRhc3NlcnQub2sodHlwZXMuUmFuZ2UuaXNSYW5nZShyYW5nZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCA0KTtcblx0XHRhc3NlcnQub2soZm91cnRoLmluc2VydFRleHQgaW5zdGFuY2VvZiB0eXBlcy5TbmlwcGV0U3RyaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDx0eXBlcy5TbmlwcGV0U3RyaW5nPmZvdXJ0aC5pbnNlcnRUZXh0KS52YWx1ZSwgJ2ZvbyQwYmFyJyk7XG5cblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnU3VnZ2VzdCwgcmV0dXJuIENvbXBsZXRpb25MaXN0ICFhcnJheScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0xJyk7XG5cdFx0XHRcdGNvbnN0IGIgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0yJyk7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNvbXBsZXRpb25MaXN0KDxhbnk+W2EsIGJdLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgbGlzdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db21wbGV0aW9uTGlzdD4oJ3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpKTtcblxuXHRcdGFzc2VydC5vayhsaXN0IGluc3RhbmNlb2YgdHlwZXMuQ29tcGxldGlvbkxpc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0LmlzSW5jb21wbGV0ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ1N1Z2dlc3QsIHJlc29sdmUgY29tcGxldGlvbiBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXG5cdFx0bGV0IHJlc29sdmVDb3VudCA9IDA7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMScpO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMicpO1xuXHRcdFx0XHRjb25zdCBjID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMycpO1xuXHRcdFx0XHRjb25zdCBkID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtNCcpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNvbXBsZXRpb25MaXN0KFthLCBiLCBjLCBkXSwgZmFsc2UpO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVDb21wbGV0aW9uSXRlbShpdGVtKSB7XG5cdFx0XHRcdHJlc29sdmVDb3VudCArPSAxO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgbGlzdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db21wbGV0aW9uTGlzdD4oXG5cdFx0XHQndnNjb2RlLmV4ZWN1dGVDb21wbGV0aW9uSXRlbVByb3ZpZGVyJyxcblx0XHRcdG1vZGVsLnVyaSxcblx0XHRcdG5ldyB0eXBlcy5Qb3NpdGlvbigwLCA0KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdDIgLy8gbWF4SXRlbXNUb1Jlc29sdmVcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGxpc3QgaW5zdGFuY2VvZiB0eXBlcy5Db21wbGV0aW9uTGlzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDb3VudCwgMik7XG5cblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnXCJ2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXJcIiBkb2Vzbm90IHJldHVybiBhIHByZXNlbGVjdCBmaWVsZCAjNTM3NDknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0Y29uc3QgYSA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTEnKTtcblx0XHRcdFx0YS5wcmVzZWxlY3QgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMicpO1xuXHRcdFx0XHRjb25zdCBjID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMycpO1xuXHRcdFx0XHRjLnByZXNlbGVjdCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGQgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW00Jyk7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuQ29tcGxldGlvbkxpc3QoW2EsIGIsIGMsIGRdLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHRuZXcgdHlwZXMuUG9zaXRpb24oMCwgNCksXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGxpc3QgaW5zdGFuY2VvZiB0eXBlcy5Db21wbGV0aW9uTGlzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3QuaXRlbXMubGVuZ3RoLCA0KTtcblxuXHRcdGNvbnN0IFthLCBiLCBjLCBkXSA9IGxpc3QuaXRlbXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEucHJlc2VsZWN0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5wcmVzZWxlY3QsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGMucHJlc2VsZWN0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZC5wcmVzZWxlY3QsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ2V4ZWN1dGVDb21wbGV0aW9uSXRlbVByb3ZpZGVyIGRvZXNuXFwndCBjYXB0dXJlIGNvbW1pdENoYXJhY3RlcnMgIzU4MjI4JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0xJyk7XG5cdFx0XHRcdGEuY29tbWl0Q2hhcmFjdGVycyA9IFsnYScsICdiJ107XG5cdFx0XHRcdGNvbnN0IGIgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0yJyk7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuQ29tcGxldGlvbkxpc3QoW2EsIGJdLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHRuZXcgdHlwZXMuUG9zaXRpb24oMCwgNCksXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGxpc3QgaW5zdGFuY2VvZiB0eXBlcy5Db21wbGV0aW9uTGlzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3QuaXRlbXMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IFthLCBiXSA9IGxpc3QuaXRlbXM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhLmNvbW1pdENoYXJhY3RlcnMsIFsnYScsICdiJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLmNvbW1pdENoYXJhY3RlcnMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlciByZXR1cm5zIHRoZSB3cm9uZyBDb21wbGV0aW9uSXRlbUtpbmRzIGluIGluc2lkZXJzICM5NTcxNScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnTXkgTWV0aG9kJywgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdNeSBQcm9wZXJ0eScsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHRuZXcgdHlwZXMuUG9zaXRpb24oMCwgNCksXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGxpc3QgaW5zdGFuY2VvZiB0eXBlcy5Db21wbGV0aW9uTGlzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3QuaXRlbXMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IFthLCBiXSA9IGxpc3QuaXRlbXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEua2luZCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIua2luZCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5KTtcblx0fSk7XG5cblx0Ly8gLS0tIHNpZ25hdHVyZUhlbHBcblxuXHR0ZXN0KCdQYXJhbWV0ZXIgSGludHMsIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscChfZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIF9wb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCBfdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogdnNjb2RlLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogdnNjb2RlLlNpZ25hdHVyZUhlbHAge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGFjdGl2ZVNpZ25hdHVyZTogMCxcblx0XHRcdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IDEsXG5cdFx0XHRcdFx0c2lnbmF0dXJlczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogJ2FiYycsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGAke2NvbnRleHQudHJpZ2dlcktpbmQgPT09IDEgLyogdnNjb2RlLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZC5JbnZva2UgKi8gPyAnaW52b2tlZCcgOiAndW5rbm93bid9ICR7Y29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyfWAsXG5cdFx0XHRcdFx0XHRcdHBhcmFtZXRlcnM6IFtdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0sIFtdKSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBmaXJzdFZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlNpZ25hdHVyZUhlbHA+KCd2c2NvZGUuZXhlY3V0ZVNpZ25hdHVyZUhlbHBQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEpLCAnLCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFZhbHVlLmFjdGl2ZVNpZ25hdHVyZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VmFsdWUuYWN0aXZlUGFyYW1ldGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RWYWx1ZS5zaWduYXR1cmVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VmFsdWUuc2lnbmF0dXJlc1swXS5sYWJlbCwgJ2FiYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFZhbHVlLnNpZ25hdHVyZXNbMF0uZG9jdW1lbnRhdGlvbiwgJ2ludm9rZWQgLCcpO1xuXHR9KTtcblxuXHQvLyAtLS0gcXVpY2tmaXhcblxuXHR0ZXN0QXBpQ21kKCdRdWlja0ZpeCwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogdnNjb2RlLkNvbW1hbmRbXSB7XG5cdFx0XHRcdHJldHVybiBbeyBjb21tYW5kOiAndGVzdGluZycsIHRpdGxlOiAnVGl0bGUnLCBhcmd1bWVudHM6IFsxLCAyLCB0cnVlXSB9XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db21tYW5kW10+KCd2c2NvZGUuZXhlY3V0ZUNvZGVBY3Rpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRpdGxlLCAnVGl0bGUnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQsICd0ZXN0aW5nJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QuYXJndW1lbnRzLCBbMSwgMiwgdHJ1ZV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyIHJlc3VsdHMgc2VlbSB0byBiZSBtaXNzaW5nIHRoZWlyIGBjb21tYW5kYCBwcm9wZXJ0eSAjNDUxMjQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoZG9jdW1lbnQsIHJhbmdlKTogdnNjb2RlLkNvZGVBY3Rpb25bXSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2RvY3VtZW50LCByYW5nZV0sXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ2NvbW1hbmRfdGl0bGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogdHlwZXMuQ29kZUFjdGlvbktpbmQuRW1wdHkuYXBwZW5kKCdmb28nKSxcblx0XHRcdFx0XHR0aXRsZTogJ3RpdGxlJyxcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29kZUFjdGlvbltdPigndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0XHRcdGFzc2VydC5vayhmaXJzdC5jb21tYW5kKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQuY29tbWFuZCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQudGl0bGUsICdjb21tYW5kX3RpdGxlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5raW5kIS52YWx1ZSwgJ2ZvbycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGl0bGUsICd0aXRsZScpO1xuXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXIgcGFzc2VzIFJhbmdlIHRvIHByb3ZpZGVyIGFsdGhvdWdoIFNlbGVjdGlvbiBpcyBwYXNzZWQgaW4gIzc3OTk3JywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKGRvY3VtZW50LCByYW5nZU9yU2VsZWN0aW9uKTogdnNjb2RlLkNvZGVBY3Rpb25bXSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2RvY3VtZW50LCByYW5nZU9yU2VsZWN0aW9uXSxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnY29tbWFuZF90aXRsZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRraW5kOiB0eXBlcy5Db2RlQWN0aW9uS2luZC5FbXB0eS5hcHBlbmQoJ2ZvbycpLFxuXHRcdFx0XHRcdHRpdGxlOiAndGl0bGUnLFxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBuZXcgdHlwZXMuU2VsZWN0aW9uKDAsIDAsIDEsIDEpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29kZUFjdGlvbltdPigndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIHNlbGVjdGlvbikudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0XHRcdGFzc2VydC5vayhmaXJzdC5jb21tYW5kKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpcnN0LmNvbW1hbmQuYXJndW1lbnRzIVsxXSBpbnN0YW5jZW9mIHR5cGVzLlNlbGVjdGlvbik7XG5cdFx0XHRcdGFzc2VydC5vayhmaXJzdC5jb21tYW5kLmFyZ3VtZW50cyFbMV0uaXNFcXVhbChzZWxlY3Rpb24pKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCd2c2NvZGUuZXhlY3V0ZUNvZGVBY3Rpb25Qcm92aWRlciByZXN1bHRzIHNlZW0gdG8gYmUgbWlzc2luZyB0aGVpciBgaXNQcmVmZXJyZWRgIHByb3BlcnR5ICM3ODA5OCcsIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucyhkb2N1bWVudCwgcmFuZ2VPclNlbGVjdGlvbik6IHZzY29kZS5Db2RlQWN0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtkb2N1bWVudCwgcmFuZ2VPclNlbGVjdGlvbl0sXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ2NvbW1hbmRfdGl0bGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogdHlwZXMuQ29kZUFjdGlvbktpbmQuRW1wdHkuYXBwZW5kKCdmb28nKSxcblx0XHRcdFx0XHR0aXRsZTogJ3RpdGxlJyxcblx0XHRcdFx0XHRpc1ByZWZlcnJlZDogdHJ1ZVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBuZXcgdHlwZXMuU2VsZWN0aW9uKDAsIDAsIDEsIDEpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29kZUFjdGlvbltdPigndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIHNlbGVjdGlvbikudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5pc1ByZWZlcnJlZCwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgncmVzb2x2aW5nIGNvZGUgYWN0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IGRpZENhbGxSZXNvbHZlID0gMDtcblx0XHRjbGFzcyBNeUFjdGlvbiBleHRlbmRzIHR5cGVzLkNvZGVBY3Rpb24geyB9XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucyhkb2N1bWVudCwgcmFuZ2VPclNlbGVjdGlvbik6IHZzY29kZS5Db2RlQWN0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyBNeUFjdGlvbigndGl0bGUnLCB0eXBlcy5Db2RlQWN0aW9uS2luZC5FbXB0eS5hcHBlbmQoJ2ZvbycpKV07XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZUNvZGVBY3Rpb24oYWN0aW9uKTogdnNjb2RlLkNvZGVBY3Rpb24ge1xuXHRcdFx0XHRhc3NlcnQub2soYWN0aW9uIGluc3RhbmNlb2YgTXlBY3Rpb24pO1xuXG5cdFx0XHRcdGRpZENhbGxSZXNvbHZlICs9IDE7XG5cdFx0XHRcdGFjdGlvbi50aXRsZSA9ICdyZXNvbHZlZCB0aXRsZSc7XG5cdFx0XHRcdGFjdGlvbi5lZGl0ID0gbmV3IHR5cGVzLldvcmtzcGFjZUVkaXQoKTtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBuZXcgdHlwZXMuU2VsZWN0aW9uKDAsIDAsIDEsIDEpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29kZUFjdGlvbltdPigndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIHNlbGVjdGlvbiwgdW5kZWZpbmVkLCAxMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkQ2FsbFJlc29sdmUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50aXRsZSwgJ3RpdGxlJyk7IC8vIGRvZXMgTk9UIGNoYW5nZVxuXHRcdGFzc2VydC5vayhmaXJzdC5lZGl0KTsgLy8gaXMgc2V0XG5cdH0pO1xuXG5cdC8vIC0tLSBjb2RlIGxlbnNcblxuXHR0ZXN0QXBpQ21kKCdDb2RlTGVucywgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBjb21wbGV4QXJnID0ge1xuXHRcdFx0Zm9vKCkgeyB9LFxuXHRcdFx0YmFyKCkgeyB9LFxuXHRcdFx0YmlnOiBleHRIb3N0XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29kZUxlbnNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29kZUxlbnNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIHsgdGl0bGU6ICdUaXRsZScsIGNvbW1hbmQ6ICdjbWQnLCBhcmd1bWVudHM6IFsxLCB0cnVlLCBjb21wbGV4QXJnXSB9KV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29kZUxlbnNbXT4oJ3ZzY29kZS5leGVjdXRlQ29kZUxlbnNQcm92aWRlcicsIG1vZGVsLnVyaSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQhLnRpdGxlLCAnVGl0bGUnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQhLmNvbW1hbmQsICdjbWQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQhLmFyZ3VtZW50cyFbMF0sIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29tbWFuZCEuYXJndW1lbnRzIVsxXSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kIS5hcmd1bWVudHMhWzJdLCBjb21wbGV4QXJnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdDb2RlTGVucywgcmVzb2x2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCByZXNvbHZlQ291bnQgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb2RlTGVuc2VzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNvZGVMZW5zKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNvZGVMZW5zKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNvZGVMZW5zKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNvZGVMZW5zKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSwgeyB0aXRsZTogJ0FscmVhZHkgcmVzb2x2ZWQnLCBjb21tYW5kOiAnZmZmJyB9KVxuXHRcdFx0XHRdO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVDb2RlTGVucyhjb2RlTGVuczogdHlwZXMuQ29kZUxlbnMpIHtcblx0XHRcdFx0Y29kZUxlbnMuY29tbWFuZCA9IHsgdGl0bGU6IHJlc29sdmVDb3VudC50b1N0cmluZygpLCBjb21tYW5kOiAncmVzb2x2ZWQnIH07XG5cdFx0XHRcdHJlc29sdmVDb3VudCArPSAxO1xuXHRcdFx0XHRyZXR1cm4gY29kZUxlbnM7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0bGV0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVMZW5zW10+KCd2c2NvZGUuZXhlY3V0ZUNvZGVMZW5zUHJvdmlkZXInLCBtb2RlbC51cmksIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMyk7IC8vIHRoZSByZXNvbHZlIGFyZ3VtZW50IGRlZmluZXMgdGhlIG51bWJlciBvZiByZXN1bHRzIGJlaW5nIHJldHVybmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDb3VudCwgMik7XG5cblx0XHRyZXNvbHZlQ291bnQgPSAwO1xuXHRcdHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVMZW5zW10+KCd2c2NvZGUuZXhlY3V0ZUNvZGVMZW5zUHJvdmlkZXInLCBtb2RlbC51cmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ0xpbmtzLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEb2N1bWVudExpbmtzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50TGluayhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMjApLCBVUkkucGFyc2UoJ2ZvbzpiYXInKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkRvY3VtZW50TGlua1tdPigndnNjb2RlLmV4ZWN1dGVMaW5rUHJvdmlkZXInLCBtb2RlbC51cmkpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50YXJnZXQgKyAnJywgJ2ZvbzpiYXInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDIwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdXaGF0XFwncyB0aGUgY29uZGl0aW9uIGZvciBEb2N1bWVudExpbmsgdGFyZ2V0IHRvIGJlIHVuZGVmaW5lZD8gIzEwNjMwOCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRMaW5rcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudExpbmsobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDIwKSwgdW5kZWZpbmVkKV07XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZURvY3VtZW50TGluayhsaW5rKSB7XG5cdFx0XHRcdGxpbmsudGFyZ2V0ID0gVVJJLnBhcnNlKCdmb286YmFyJyk7XG5cdFx0XHRcdHJldHVybiBsaW5rO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpbmtzMSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Eb2N1bWVudExpbmtbXT4oJ3ZzY29kZS5leGVjdXRlTGlua1Byb3ZpZGVyJywgbW9kZWwudXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtzMVswXS50YXJnZXQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBsaW5rczIgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuRG9jdW1lbnRMaW5rW10+KCd2c2NvZGUuZXhlY3V0ZUxpbmtQcm92aWRlcicsIG1vZGVsLnVyaSwgMTAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtzMi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rczJbMF0udGFyZ2V0IS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXInKS50b1N0cmluZygpKTtcblxuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdEb2N1bWVudExpbmtbXSB2c2NvZGUuZXhlY3V0ZUxpbmtQcm92aWRlciByZXR1cm5zIGxhY2sgdG9vbHRpcCAjMjEzOTcwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEb2N1bWVudExpbmtzKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBuZXcgdHlwZXMuRG9jdW1lbnRMaW5rKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAyMCksIFVSSS5wYXJzZSgnZm9vOmJhcicpKTtcblx0XHRcdFx0bGluay50b29sdGlwID0gJ0xpbmsgVG9vbHRpcCc7XG5cdFx0XHRcdHJldHVybiBbbGlua107XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgbGlua3MxID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkRvY3VtZW50TGlua1tdPigndnNjb2RlLmV4ZWN1dGVMaW5rUHJvdmlkZXInLCBtb2RlbC51cmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rczEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MxWzBdLnRvb2x0aXAsICdMaW5rIFRvb2x0aXAnKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdDb2xvciBwcm92aWRlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvbG9yUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRG9jdW1lbnRDb2xvclByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEb2N1bWVudENvbG9ycygpOiB2c2NvZGUuQ29sb3JJbmZvcm1hdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29sb3JJbmZvcm1hdGlvbihuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMjApLCBuZXcgdHlwZXMuQ29sb3IoMC4xLCAwLjIsIDAuMywgMC40KSldO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoKTogdnNjb2RlLkNvbG9yUHJlc2VudGF0aW9uW10ge1xuXHRcdFx0XHRjb25zdCBjcCA9IG5ldyB0eXBlcy5Db2xvclByZXNlbnRhdGlvbignI0FCQycpO1xuXHRcdFx0XHRjcC50ZXh0RWRpdCA9IHR5cGVzLlRleHRFZGl0LnJlcGxhY2UobmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDIwKSwgJyNBQkMnKTtcblx0XHRcdFx0Y3AuYWRkaXRpb25hbFRleHRFZGl0cyA9IFt0eXBlcy5UZXh0RWRpdC5pbnNlcnQobmV3IHR5cGVzLlBvc2l0aW9uKDIsIDIwKSwgJyonKV07XG5cdFx0XHRcdHJldHVybiBbY3BdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbG9ySW5mb3JtYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlRG9jdW1lbnRDb2xvclByb3ZpZGVyJywgbW9kZWwudXJpKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29sb3IucmVkLCAwLjEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29sb3IuZ3JlZW4sIDAuMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb2xvci5ibHVlLCAwLjMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29sb3IuYWxwaGEsIDAuNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQuY2hhcmFjdGVyLCAyMCk7XG5cdFx0XHR9KTtcblx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGNvbG9yID0gbmV3IHR5cGVzLkNvbG9yKDAuNSwgMC42LCAwLjcsIDAuOCk7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAyMCk7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbG9yUHJlc2VudGF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZUNvbG9yUHJlc2VudGF0aW9uUHJvdmlkZXInLCBjb2xvciwgeyB1cmk6IG1vZGVsLnVyaSwgcmFuZ2UgfSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxhYmVsLCAnI0FCQycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXQhLm5ld1RleHQsICcjQUJDJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQubGluZSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRFZGl0IS5yYW5nZS5lbmQubGluZSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0RWRpdCEucmFuZ2UuZW5kLmNoYXJhY3RlciwgMjApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWRkaXRpb25hbFRleHRFZGl0cyEubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFkZGl0aW9uYWxUZXh0RWRpdHMhWzBdLnJhbmdlLnN0YXJ0LmxpbmUsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWRkaXRpb25hbFRleHRFZGl0cyFbMF0ucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAyMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hZGRpdGlvbmFsVGV4dEVkaXRzIVswXS5yYW5nZS5lbmQubGluZSwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hZGRpdGlvbmFsVGV4dEVkaXRzIVswXS5yYW5nZS5lbmQuY2hhcmFjdGVyLCAyMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnXCJUeXBlRXJyb3I6IGUub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQgaXMgbm90IGEgZnVuY3Rpb25cIiBjYWxsaW5nIGhvdmVyIHByb3ZpZGVyIGluIEluc2lkZXJzICM1NDE3NCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckhvdmVyUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuSG92ZXJQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSG92ZXIoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Ib3ZlcignZm9mb2ZvZm8nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Ib3ZlcltdPigndnNjb2RlLmV4ZWN1dGVIb3ZlclByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMSwgMSkpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLmNvbnRlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGlubGluZSBoaW50c1xuXG5cdHRlc3RBcGlDbWQoJ0lubGF5IEhpbnRzLCBiYWNrIGFuZCBmb3J0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuSW5sYXlIaW50c1Byb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbmxheUhpbnRzKCkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5JbmxheUhpbnQobmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEpLCAnRm9vJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLklubGF5SGludFtdPigndnNjb2RlLmV4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDIwLCAyMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5sYWJlbCwgJ0ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wb3NpdGlvbi5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucG9zaXRpb24uY2hhcmFjdGVyLCAxKTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnSW5saW5lIEhpbnRzLCBtZXJnZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuSW5sYXlIaW50c1Byb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbmxheUhpbnRzKCkge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IHR5cGVzLklubGF5SGludExhYmVsUGFydCgnQmFyJyk7XG5cdFx0XHRcdHBhcnQudG9vbHRpcCA9ICdwYXJ0X3Rvb2x0aXAnO1xuXHRcdFx0XHRwYXJ0LmNvbW1hbmQgPSB7IGNvbW1hbmQ6ICdjbWQnLCB0aXRsZTogJ3BhcnQnIH07XG5cdFx0XHRcdGNvbnN0IGhpbnQgPSBuZXcgdHlwZXMuSW5sYXlIaW50KG5ldyB0eXBlcy5Qb3NpdGlvbigxMCwgMTEpLCBbcGFydF0pO1xuXHRcdFx0XHRoaW50LnRvb2x0aXAgPSAnaGludF90b29sdGlwJztcblx0XHRcdFx0aGludC5wYWRkaW5nTGVmdCA9IHRydWU7XG5cdFx0XHRcdGhpbnQucGFkZGluZ1JpZ2h0ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiBbaGludF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLklubGF5SGludHNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW5sYXlIaW50cygpIHtcblx0XHRcdFx0Y29uc3QgaGludCA9IG5ldyB0eXBlcy5JbmxheUhpbnQobmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEpLCAnRm9vJywgdHlwZXMuSW5sYXlIaW50S2luZC5QYXJhbWV0ZXIpO1xuXHRcdFx0XHRoaW50LnRleHRFZGl0cyA9IFt0eXBlcy5UZXh0RWRpdC5pbnNlcnQobmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApLCAnSGVsbG8nKV07XG5cdFx0XHRcdHJldHVybiBbaGludF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuSW5sYXlIaW50W10+KCd2c2NvZGUuZXhlY3V0ZUlubGF5SGludFByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMjAsIDIwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QubGFiZWwsICdGb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucG9zaXRpb24ubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnBvc2l0aW9uLmNoYXJhY3RlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRFZGl0cz8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXRzWzBdLm5ld1RleHQsICdIZWxsbycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wb3NpdGlvbi5saW5lLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wb3NpdGlvbi5jaGFyYWN0ZXIsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnBhZGRpbmdMZWZ0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnBhZGRpbmdSaWdodCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudG9vbHRpcCwgJ2hpbnRfdG9vbHRpcCcpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSAoPHR5cGVzLklubGF5SGludExhYmVsUGFydFtdPnNlY29uZC5sYWJlbClbMF07XG5cdFx0YXNzZXJ0VHlwZShsYWJlbCBpbnN0YW5jZW9mIHR5cGVzLklubGF5SGludExhYmVsUGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsLnZhbHVlLCAnQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsLnRvb2x0aXAsICdwYXJ0X3Rvb2x0aXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwuY29tbWFuZD8uY29tbWFuZCwgJ2NtZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbC5jb21tYW5kPy50aXRsZSwgJ3BhcnQnKTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnSW5saW5lIEhpbnRzLCBiYWQgcHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLklubGF5SGludHNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW5sYXlIaW50cygpIHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuSW5sYXlIaW50KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxKSwgJ0ZvbycpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLklubGF5SGludHNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW5sYXlIaW50cygpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuSW5sYXlIaW50W10+KCd2c2NvZGUuZXhlY3V0ZUlubGF5SGludFByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMjAsIDIwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxhYmVsLCAnRm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnBvc2l0aW9uLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wb3NpdGlvbi5jaGFyYWN0ZXIsIDEpO1xuXHR9KTtcblxuXHQvLyAtLS0gc2VsZWN0aW9uIHJhbmdlc1xuXG5cdHRlc3QoJ1NlbGVjdGlvbiBSYW5nZSwgYmFjayBhbmQgZm9ydGgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlNlbGVjdGlvblJhbmdlUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVNlbGVjdGlvblJhbmdlcygpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKDAsIDEwLCAwLCAxOCksIG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2UoMCwgMiwgMCwgMjApKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlNlbGVjdGlvblJhbmdlW10+KCd2c2NvZGUuZXhlY3V0ZVNlbGVjdGlvblJhbmdlUHJvdmlkZXInLCBtb2RlbC51cmksIFtuZXcgdHlwZXMuUG9zaXRpb24oMCwgMTApXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlWzBdLnBhcmVudCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBjYWxsIGhpZXJhcmNoeVxuXG5cdHRlc3QoJ0NhbGxIaWVyYXJjaHksIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ2FsbEhpZXJhcmNoeVByb3ZpZGVyIHtcblxuXHRcdFx0cHJlcGFyZUNhbGxIaWVyYXJjaHkoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtKHR5cGVzLlN5bWJvbEtpbmQuQ29uc3RhbnQsICdST09UJywgJ1JPT1QnLCBkb2N1bWVudC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZUNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxzKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbFtdPiB7XG5cblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbChcblx0XHRcdFx0XHRuZXcgdHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW0odHlwZXMuU3ltYm9sS2luZC5Db25zdGFudCwgJ0lOQ09NSU5HJywgJ0lOQ09NSU5HJywgaXRlbS51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKSxcblx0XHRcdFx0XHRbbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApXVxuXHRcdFx0XHQpXTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZUNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxzKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbFtdPiB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwoXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtKHR5cGVzLlN5bWJvbEtpbmQuQ29uc3RhbnQsICdPVVRHT0lORycsICdPVVRHT0lORycsIGl0ZW0udXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0W25ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKV1cblx0XHRcdFx0KV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbVtdPigndnNjb2RlLnByZXBhcmVDYWxsSGllcmFyY2h5JywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocm9vdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RbMF0ubmFtZSwgJ1JPT1QnKTtcblxuXHRcdGNvbnN0IGluY29taW5nID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxbXT4oJ3ZzY29kZS5wcm92aWRlSW5jb21pbmdDYWxscycsIHJvb3RbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmNvbWluZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmNvbWluZ1swXS5mcm9tLm5hbWUsICdJTkNPTUlORycpO1xuXG5cdFx0Y29uc3Qgb3V0Z29pbmcgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbFtdPigndnNjb2RlLnByb3ZpZGVPdXRnb2luZ0NhbGxzJywgcm9vdFswXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dGdvaW5nLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dGdvaW5nWzBdLnRvLm5hbWUsICdPVVRHT0lORycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlQ2FsbEhpZXJhcmNoeSB0aHJvd3MgVHlwZUVycm9yIGlmIGNsYW5nZCByZXR1cm5zIGVtcHR5IHJlc3VsdCAjMTM3NDE1JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ2FsbEhpZXJhcmNoeVByb3ZpZGVyIHtcblx0XHRcdHByZXBhcmVDYWxsSGllcmFyY2h5KGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCk6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW1bXT4ge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRwcm92aWRlQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbHMoaXRlbTogdnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5DYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsW10+IHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cHJvdmlkZUNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxzKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbFtdPiB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCByb290ID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtW10+KCd2c2NvZGUucHJlcGFyZUNhbGxIaWVyYXJjaHknLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSk7XG5cblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyb290KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tIHR5cGUgaGllcmFyY2h5XG5cblx0dGVzdCgnVHlwZUhpZXJhcmNoeSwgYmFjayBhbmQgZm9ydGgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclR5cGVIaWVyYXJjaHlQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlR5cGVIaWVyYXJjaHlQcm92aWRlciB7XG5cdFx0XHRwcmVwYXJlVHlwZUhpZXJhcmNoeShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW1bXT4ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbSh0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50LCAnUk9PVCcsICdST09UJywgZG9jdW1lbnQudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdFx0cHJvdmlkZVR5cGVIaWVyYXJjaHlTdXBlcnR5cGVzKGl0ZW06IHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW1bXT4ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbSh0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50LCAnU1VQRVInLCAnU1VQRVInLCBpdGVtLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVUeXBlSGllcmFyY2h5U3VidHlwZXMoaXRlbTogdnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbVtdPiB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLlR5cGVIaWVyYXJjaHlJdGVtKHR5cGVzLlN5bWJvbEtpbmQuQ29uc3RhbnQsICdTVUInLCAnU1VCJywgaXRlbS51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbVtdPigndnNjb2RlLnByZXBhcmVUeXBlSGllcmFyY2h5JywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocm9vdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RbMF0ubmFtZSwgJ1JPT1QnKTtcblxuXHRcdGNvbnN0IGluY29taW5nID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtW10+KCd2c2NvZGUucHJvdmlkZVN1cGVydHlwZXMnLCByb290WzBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5jb21pbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5jb21pbmdbMF0ubmFtZSwgJ1NVUEVSJyk7XG5cblx0XHRjb25zdCBvdXRnb2luZyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbVtdPigndnNjb2RlLnByb3ZpZGVTdWJ0eXBlcycsIHJvb3RbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRnb2luZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRnb2luZ1swXS5uYW1lLCAnU1VCJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGlvblJhbmdlUHJvdmlkZXIgb24gaW5uZXIgYXJyYXkgYWx3YXlzIHJldHVybnMgb3V0ZXIgYXJyYXkgIzkxODUyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5TZWxlY3Rpb25SYW5nZVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoX2RvYywgcG9zaXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSBwb3NpdGlvbnM7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZShmaXJzdC5saW5lLCBmaXJzdC5jaGFyYWN0ZXIsIGZpcnN0LmxpbmUsIGZpcnN0LmNoYXJhY3RlcikpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TZWxlY3Rpb25SYW5nZVtdPigndnNjb2RlLmV4ZWN1dGVTZWxlY3Rpb25SYW5nZVByb3ZpZGVyJywgbW9kZWwudXJpLCBbbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEwKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0ucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0ucmFuZ2UuZW5kLmNoYXJhY3RlciwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3JlIGVsZW1lbnQgdGVzdCBvZiBzZWxlY3Rpb25SYW5nZVByb3ZpZGVyIG9uIGlubmVyIGFycmF5IGFsd2F5cyByZXR1cm5zIG91dGVyIGFycmF5ICM5MTg1MicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKF9kb2MsIHBvc2l0aW9ucykge1xuXHRcdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBwb3NpdGlvbnM7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZShmaXJzdC5saW5lLCBmaXJzdC5jaGFyYWN0ZXIsIGZpcnN0LmxpbmUsIGZpcnN0LmNoYXJhY3RlcikpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2Uoc2Vjb25kLmxpbmUsIHNlY29uZC5jaGFyYWN0ZXIsIHNlY29uZC5saW5lLCBzZWNvbmQuY2hhcmFjdGVyKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLlNlbGVjdGlvblJhbmdlW10+KFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlU2VsZWN0aW9uUmFuZ2VQcm92aWRlcicsXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHRbbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMTApXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLnJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVsxXS5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMV0ucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzFdLnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMV0ucmFuZ2UuZW5kLmNoYXJhY3RlciwgMTApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUVQLE9BQU8sWUFBWTtBQUNuQixTQUFTLDJCQUEyQixvQkFBb0I7QUFDeEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixZQUFZLFdBQVc7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsd0JBQXdCO0FBQ2xELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUywwQkFBMEI7QUFFbkMsT0FBTztBQUNQLFNBQVMsYUFBYSxzQkFBc0I7QUFFNUMsU0FBUywwQkFBMEIseUJBQXlCO0FBQzVELFNBQVMsU0FBUyx5QkFBeUI7QUFDM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FB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
