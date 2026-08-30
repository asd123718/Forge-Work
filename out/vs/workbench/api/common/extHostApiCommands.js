import { isFalsyOrEmpty } from "../../../base/common/arrays.js";
import { Schemas, matchesSomeScheme } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { decodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { validateWhenClauses } from "../../../platform/contextkey/common/contextkey.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as types from "./extHostTypes.js";
const newCommands = [
  // -- document highlights
  new ApiCommand(
    "vscode.executeDocumentHighlights",
    "_executeDocumentHighlights",
    "Execute document highlight provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of DocumentHighlight-instances.", tryMapWith(typeConverters.DocumentHighlight.to))
  ),
  // -- document symbols
  new ApiCommand(
    "vscode.executeDocumentSymbolProvider",
    "_executeDocumentSymbolProvider",
    "Execute document symbol provider.",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of SymbolInformation and DocumentSymbol instances.", (value, apiArgs) => {
      if (isFalsyOrEmpty(value)) {
        return void 0;
      }
      class MergedInfo extends types.SymbolInformation {
        constructor() {
          super(...arguments);
          this.containerName = "";
        }
        static to(symbol) {
          const res = new MergedInfo(
            symbol.name,
            typeConverters.SymbolKind.to(symbol.kind),
            symbol.containerName || "",
            new types.Location(apiArgs[0], typeConverters.Range.to(symbol.range))
          );
          res.detail = symbol.detail;
          res.range = res.location.range;
          res.selectionRange = typeConverters.Range.to(symbol.selectionRange);
          res.children = symbol.children ? symbol.children.map(MergedInfo.to) : [];
          return res;
        }
      }
      return value.map(MergedInfo.to);
    })
  ),
  // -- formatting
  new ApiCommand(
    "vscode.executeFormatDocumentProvider",
    "_executeFormatDocumentProvider",
    "Execute document format provider.",
    [ApiCommandArgument.Uri, new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  new ApiCommand(
    "vscode.executeFormatRangeProvider",
    "_executeFormatRangeProvider",
    "Execute range format provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range, new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  new ApiCommand(
    "vscode.executeFormatOnTypeProvider",
    "_executeFormatOnTypeProvider",
    "Execute format on type provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, new ApiCommandArgument("ch", "Trigger character", (v) => typeof v === "string", (v) => v), new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  // -- go to symbol (definition, type definition, declaration, impl, references)
  new ApiCommand(
    "vscode.executeDefinitionProvider",
    "_executeDefinitionProvider",
    "Execute all definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeDefinitionProvider_recursive",
    "_executeDefinitionProvider_recursive",
    "Execute all definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeTypeDefinitionProvider",
    "_executeTypeDefinitionProvider",
    "Execute all type definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeTypeDefinitionProvider_recursive",
    "_executeTypeDefinitionProvider_recursive",
    "Execute all type definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeDeclarationProvider",
    "_executeDeclarationProvider",
    "Execute all declaration providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeDeclarationProvider_recursive",
    "_executeDeclarationProvider_recursive",
    "Execute all declaration providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeImplementationProvider",
    "_executeImplementationProvider",
    "Execute all implementation providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeImplementationProvider_recursive",
    "_executeImplementationProvider_recursive",
    "Execute all implementation providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeReferenceProvider",
    "_executeReferenceProvider",
    "Execute all reference providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location-instances.", tryMapWith(typeConverters.location.to))
  ),
  new ApiCommand(
    "vscode.experimental.executeReferenceProvider",
    "_executeReferenceProvider_recursive",
    "Execute all reference providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location-instances.", tryMapWith(typeConverters.location.to))
  ),
  // -- hover
  new ApiCommand(
    "vscode.executeHoverProvider",
    "_executeHoverProvider",
    "Execute all hover providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Hover-instances.", tryMapWith(typeConverters.Hover.to))
  ),
  new ApiCommand(
    "vscode.experimental.executeHoverProvider_recursive",
    "_executeHoverProvider_recursive",
    "Execute all hover providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Hover-instances.", tryMapWith(typeConverters.Hover.to))
  ),
  // -- selection range
  new ApiCommand(
    "vscode.executeSelectionRangeProvider",
    "_executeSelectionRangeProvider",
    "Execute selection range provider.",
    [ApiCommandArgument.Uri, new ApiCommandArgument("position", "A position in a text document", (v) => Array.isArray(v) && v.every((v2) => types.Position.isPosition(v2)), (v) => v.map(typeConverters.Position.from))],
    new ApiCommandResult("A promise that resolves to an array of ranges.", (result) => {
      return result.map((ranges) => {
        let node;
        for (const range of ranges.reverse()) {
          node = new types.SelectionRange(typeConverters.Range.to(range), node);
        }
        return node;
      });
    })
  ),
  // -- symbol search
  new ApiCommand(
    "vscode.executeWorkspaceSymbolProvider",
    "_executeWorkspaceSymbolProvider",
    "Execute all workspace symbol providers.",
    [ApiCommandArgument.String.with("query", "Search string")],
    new ApiCommandResult("A promise that resolves to an array of SymbolInformation-instances.", (value) => {
      return value.map(typeConverters.WorkspaceSymbol.to);
    })
  ),
  // --- call hierarchy
  new ApiCommand(
    "vscode.prepareCallHierarchy",
    "_executePrepareCallHierarchy",
    "Prepare call hierarchy at a position inside a document",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyItem-instances", (v) => v.map(typeConverters.CallHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideIncomingCalls",
    "_executeProvideIncomingCalls",
    "Compute incoming calls for an item",
    [ApiCommandArgument.CallHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyIncomingCall-instances", (v) => v.map(typeConverters.CallHierarchyIncomingCall.to))
  ),
  new ApiCommand(
    "vscode.provideOutgoingCalls",
    "_executeProvideOutgoingCalls",
    "Compute outgoing calls for an item",
    [ApiCommandArgument.CallHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyOutgoingCall-instances", (v) => v.map(typeConverters.CallHierarchyOutgoingCall.to))
  ),
  // --- rename
  new ApiCommand(
    "vscode.prepareRename",
    "_executePrepareRename",
    "Execute the prepareRename of rename provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to a range and placeholder text.", (value) => {
      if (!value) {
        return void 0;
      }
      return {
        range: typeConverters.Range.to(value.range),
        placeholder: value.text
      };
    })
  ),
  new ApiCommand(
    "vscode.executeDocumentRenameProvider",
    "_executeDocumentRenameProvider",
    "Execute rename provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with("newName", "The new symbol name")],
    new ApiCommandResult("A promise that resolves to a WorkspaceEdit.", (value) => {
      if (!value) {
        return void 0;
      }
      if (value.rejectReason) {
        throw new Error(value.rejectReason);
      }
      return typeConverters.WorkspaceEdit.to(value);
    })
  ),
  // --- links
  new ApiCommand(
    "vscode.executeLinkProvider",
    "_executeLinkProvider",
    "Execute document link provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Number.with("linkResolveCount", "Number of links that should be resolved, only when links are unresolved.").optional()],
    new ApiCommandResult("A promise that resolves to an array of DocumentLink-instances.", (value) => value.map(typeConverters.DocumentLink.to))
  ),
  // --- semantic tokens
  new ApiCommand(
    "vscode.provideDocumentSemanticTokensLegend",
    "_provideDocumentSemanticTokensLegend",
    "Provide semantic tokens legend for a document",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to SemanticTokensLegend.", (value) => {
      if (!value) {
        return void 0;
      }
      return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentSemanticTokens",
    "_provideDocumentSemanticTokens",
    "Provide semantic tokens for a document",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to SemanticTokens.", (value) => {
      if (!value) {
        return void 0;
      }
      const semanticTokensDto = decodeSemanticTokensDto(value);
      if (semanticTokensDto.type !== "full") {
        return void 0;
      }
      return new types.SemanticTokens(semanticTokensDto.data, void 0);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentRangeSemanticTokensLegend",
    "_provideDocumentRangeSemanticTokensLegend",
    "Provide semantic tokens legend for a document range",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range.optional()],
    new ApiCommandResult("A promise that resolves to SemanticTokensLegend.", (value) => {
      if (!value) {
        return void 0;
      }
      return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentRangeSemanticTokens",
    "_provideDocumentRangeSemanticTokens",
    "Provide semantic tokens for a document range",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range],
    new ApiCommandResult("A promise that resolves to SemanticTokens.", (value) => {
      if (!value) {
        return void 0;
      }
      const semanticTokensDto = decodeSemanticTokensDto(value);
      if (semanticTokensDto.type !== "full") {
        return void 0;
      }
      return new types.SemanticTokens(semanticTokensDto.data, void 0);
    })
  ),
  // --- completions
  new ApiCommand(
    "vscode.executeCompletionItemProvider",
    "_executeCompletionItemProvider",
    "Execute completion item provider.",
    [
      ApiCommandArgument.Uri,
      ApiCommandArgument.Position,
      ApiCommandArgument.String.with("triggerCharacter", "Trigger completion when the user types the character, like `,` or `(`").optional(),
      ApiCommandArgument.Number.with("itemResolveCount", "Number of completions to resolve (too large numbers slow down completions)").optional()
    ],
    new ApiCommandResult("A promise that resolves to a CompletionList-instance.", (value, _args, converter) => {
      if (!value) {
        return new types.CompletionList([]);
      }
      const items = value.suggestions.map((suggestion) => typeConverters.CompletionItem.to(suggestion, converter));
      return new types.CompletionList(items, value.incomplete);
    })
  ),
  // --- signature help
  new ApiCommand(
    "vscode.executeSignatureHelpProvider",
    "_executeSignatureHelpProvider",
    "Execute signature help provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with("triggerCharacter", "Trigger signature help when the user types the character, like `,` or `(`").optional()],
    new ApiCommandResult("A promise that resolves to SignatureHelp.", (value) => {
      if (value) {
        return typeConverters.SignatureHelp.to(value);
      }
      return void 0;
    })
  ),
  // --- code lens
  new ApiCommand(
    "vscode.executeCodeLensProvider",
    "_executeCodeLensProvider",
    "Execute code lens provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Number.with("itemResolveCount", "Number of lenses that should be resolved and returned. Will only return resolved lenses, will impact performance)").optional()],
    new ApiCommandResult("A promise that resolves to an array of CodeLens-instances.", (value, _args, converter) => {
      return tryMapWith((item) => {
        return new types.CodeLens(typeConverters.Range.to(item.range), item.command && converter.fromInternal(item.command));
      })(value);
    })
  ),
  // --- code actions
  new ApiCommand(
    "vscode.executeCodeActionProvider",
    "_executeCodeActionProvider",
    "Execute code action provider.",
    [
      ApiCommandArgument.Uri,
      new ApiCommandArgument("rangeOrSelection", "Range in a text document. Some refactoring provider requires Selection object.", (v) => types.Range.isRange(v), (v) => types.Selection.isSelection(v) ? typeConverters.Selection.from(v) : typeConverters.Range.from(v)),
      ApiCommandArgument.String.with("kind", "Code action kind to return code actions for").optional(),
      ApiCommandArgument.Number.with("itemResolveCount", "Number of code actions to resolve (too large numbers slow down code actions)").optional()
    ],
    new ApiCommandResult("A promise that resolves to an array of Command-instances.", (value, _args, converter) => {
      return tryMapWith((codeAction) => {
        if (codeAction._isSynthetic) {
          if (!codeAction.command) {
            throw new Error("Synthetic code actions must have a command");
          }
          return converter.fromInternal(codeAction.command);
        } else {
          const ret = new types.CodeAction(
            codeAction.title,
            codeAction.kind ? new types.CodeActionKind(codeAction.kind) : void 0
          );
          if (codeAction.edit) {
            ret.edit = typeConverters.WorkspaceEdit.to(codeAction.edit);
          }
          if (codeAction.command) {
            ret.command = converter.fromInternal(codeAction.command);
          }
          ret.isPreferred = codeAction.isPreferred;
          return ret;
        }
      })(value);
    })
  ),
  // --- colors
  new ApiCommand(
    "vscode.executeDocumentColorProvider",
    "_executeDocumentColorProvider",
    "Execute document color provider.",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of ColorInformation objects.", (result) => {
      if (result) {
        return result.map((ci) => new types.ColorInformation(typeConverters.Range.to(ci.range), typeConverters.Color.to(ci.color)));
      }
      return [];
    })
  ),
  new ApiCommand(
    "vscode.executeColorPresentationProvider",
    "_executeColorPresentationProvider",
    "Execute color presentation provider.",
    [
      new ApiCommandArgument("color", "The color to show and insert", (v) => v instanceof types.Color, typeConverters.Color.from),
      new ApiCommandArgument("context", "Context object with uri and range", (_v) => true, (v) => ({ uri: v.uri, range: typeConverters.Range.from(v.range) }))
    ],
    new ApiCommandResult("A promise that resolves to an array of ColorPresentation objects.", (result) => {
      if (result) {
        return result.map(typeConverters.ColorPresentation.to);
      }
      return [];
    })
  ),
  // --- inline hints
  new ApiCommand(
    "vscode.executeInlayHintProvider",
    "_executeInlayHintProvider",
    "Execute inlay hints provider",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range],
    new ApiCommandResult("A promise that resolves to an array of Inlay objects", (result, args, converter) => {
      return result.map(typeConverters.InlayHint.to.bind(void 0, converter));
    })
  ),
  // --- folding
  new ApiCommand(
    "vscode.executeFoldingRangeProvider",
    "_executeFoldingRangeProvider",
    "Execute folding range provider",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of FoldingRange objects", (result, args) => {
      if (result) {
        return result.map(typeConverters.FoldingRange.to);
      }
      return void 0;
    })
  ),
  // --- notebooks
  new ApiCommand(
    "vscode.resolveNotebookContentProviders",
    "_resolveNotebookContentProvider",
    "Resolve Notebook Content Providers",
    [
      // new ApiCommandArgument<string, string>('viewType', '', v => typeof v === 'string', v => v),
      // new ApiCommandArgument<string, string>('displayName', '', v => typeof v === 'string', v => v),
      // new ApiCommandArgument<object, object>('options', '', v => typeof v === 'object', v => v),
    ],
    new ApiCommandResult("A promise that resolves to an array of NotebookContentProvider static info objects.", tryMapWith((item) => {
      return {
        viewType: item.viewType,
        displayName: item.displayName,
        options: {
          transientOutputs: item.options.transientOutputs,
          transientCellMetadata: item.options.transientCellMetadata,
          transientDocumentMetadata: item.options.transientDocumentMetadata
        },
        filenamePattern: item.filenamePattern.map((pattern) => typeConverters.NotebookExclusiveDocumentPattern.to(pattern))
      };
    }))
  ),
  // --- debug support
  new ApiCommand(
    "vscode.executeInlineValueProvider",
    "_executeInlineValueProvider",
    "Execute inline value provider",
    [
      ApiCommandArgument.Uri,
      ApiCommandArgument.Range,
      new ApiCommandArgument("context", "An InlineValueContext", (v) => v && typeof v.frameId === "number" && v.stoppedLocation instanceof types.Range, (v) => typeConverters.InlineValueContext.from(v))
    ],
    new ApiCommandResult("A promise that resolves to an array of InlineValue objects", (result) => {
      return result.map(typeConverters.InlineValue.to);
    })
  ),
  // --- open'ish commands
  new ApiCommand(
    "vscode.open",
    "_workbench.open",
    "Opens the provided resource in the editor. Can be a text or binary file, or an http(s) URL. If you need more control over the options for opening a text file, use vscode.window.showTextDocument instead.",
    [
      new ApiCommandArgument("uriOrString", "Uri-instance or string (only http/https)", (v) => URI.isUri(v) || typeof v === "string" && matchesSomeScheme(v, Schemas.http, Schemas.https), (v) => v),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "number" || typeof v === "object",
        (v) => !v ? v : typeof v === "number" ? [typeConverters.ViewColumn.from(v), void 0] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional(),
      ApiCommandArgument.String.with("label", "").optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.openWith",
    "_workbench.openWith",
    "Opens the provided resource with a specific editor.",
    [
      ApiCommandArgument.Uri.with("resource", "Resource to open"),
      ApiCommandArgument.String.with("viewId", "Custom editor view id. This should be the viewType string for custom editors or the notebookType string for notebooks. Use 'default' to use VS Code's default text editor"),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "number" || typeof v === "object",
        (v) => !v ? v : typeof v === "number" ? [typeConverters.ViewColumn.from(v), void 0] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.diff",
    "_workbench.diff",
    "Opens the provided resources in the diff editor to compare their contents.",
    [
      ApiCommandArgument.Uri.with("left", "Left-hand side resource of the diff editor"),
      ApiCommandArgument.Uri.with("right", "Right-hand side resource of the diff editor"),
      ApiCommandArgument.String.with("title", "Human readable title for the diff editor").optional(),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "object",
        (v) => v && [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.changes",
    "_workbench.changes",
    "Opens a list of resources in the changes editor to compare their contents.",
    [
      ApiCommandArgument.String.with("title", "Human readable title for the changes editor"),
      new ApiCommandArgument(
        "resourceList",
        "List of resources to compare",
        (resources) => {
          for (const resource of resources) {
            if (resource.length !== 3) {
              return false;
            }
            const [label, left, right] = resource;
            if (!URI.isUri(label) || !URI.isUri(left) && left !== void 0 && left !== null || !URI.isUri(right) && right !== void 0 && right !== null) {
              return false;
            }
          }
          return true;
        },
        (v) => v
      )
    ],
    ApiCommandResult.Void
  ),
  // --- type hierarchy
  new ApiCommand(
    "vscode.prepareTypeHierarchy",
    "_executePrepareTypeHierarchy",
    "Prepare type hierarchy at a position inside a document",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideSupertypes",
    "_executeProvideSupertypes",
    "Compute supertypes for an item",
    [ApiCommandArgument.TypeHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideSubtypes",
    "_executeProvideSubtypes",
    "Compute subtypes for an item",
    [ApiCommandArgument.TypeHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  // --- testing
  new ApiCommand(
    "vscode.revealTestInExplorer",
    "_revealTestInExplorer",
    "Reveals a test instance in the explorer",
    [ApiCommandArgument.TestItem],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.startContinuousTestRun",
    "testing.startContinuousRunFromExtension",
    "Starts running the given tests with continuous run mode.",
    [ApiCommandArgument.TestProfile, ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.stopContinuousTestRun",
    "testing.stopContinuousRunFromExtension",
    "Stops running the given tests with continuous run mode.",
    [ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
    ApiCommandResult.Void
  ),
  // --- continue edit session
  new ApiCommand(
    "vscode.experimental.editSession.continue",
    "_workbench.editSessions.actions.continueEditSession",
    "Continue the current edit session in a different workspace",
    [ApiCommandArgument.Uri.with("workspaceUri", "The target workspace to continue the current edit session in")],
    ApiCommandResult.Void
  ),
  // --- context keys
  new ApiCommand(
    "setContext",
    "_setContext",
    "Set a custom context key value that can be used in when clauses.",
    [
      ApiCommandArgument.String.with("name", "The context key name"),
      new ApiCommandArgument("value", "The context key value", () => true, (v) => v)
    ],
    ApiCommandResult.Void
  ),
  // --- inline chat
  new ApiCommand(
    "vscode.editorChat.start",
    "inlineChat.start",
    "Invoke a new editor chat session",
    [new ApiCommandArgument("Run arguments", "", (_v) => true, (v) => {
      if (!v) {
        return void 0;
      }
      return {
        initialRange: v.initialRange ? typeConverters.Range.from(v.initialRange) : void 0,
        initialSelection: types.Selection.isSelection(v.initialSelection) ? typeConverters.Selection.from(v.initialSelection) : void 0,
        message: v.message,
        attachments: v.attachments,
        autoSend: v.autoSend,
        position: v.position ? typeConverters.Position.from(v.position) : void 0,
        resolveOnResponse: v.resolveOnResponse
      };
    })],
    ApiCommandResult.Void
  ),
  // --- extension prompt files
  new ApiCommand(
    "vscode.extensionPromptFileProvider",
    "_listExtensionPromptFiles",
    "Get all extension-contributed prompt files (custom agents, instructions, and prompt files).",
    [],
    new ApiCommandResult(
      "A promise that resolves to an array of objects containing uri, type, and extensionId.",
      (value) => {
        if (!value) {
          return [];
        }
        return value.map((item) => ({
          uri: URI.revive(item.uri),
          type: item.type,
          extensionId: item.extensionId
        }));
      }
    )
  )
];
class ExtHostApiCommands {
  static register(commands) {
    newCommands.forEach(commands.registerApiCommand, commands);
    this._registerValidateWhenClausesCommand(commands);
  }
  static _registerValidateWhenClausesCommand(commands) {
    commands.registerCommand(false, "_validateWhenClauses", validateWhenClauses);
  }
}
function tryMapWith(f) {
  return (value) => {
    if (Array.isArray(value)) {
      return value.map(f);
    }
    return void 0;
  };
}
function mapLocationOrLocationLink(values) {
  if (!Array.isArray(values)) {
    return void 0;
  }
  const result = [];
  for (const item of values) {
    if (languages.isLocationLink(item)) {
      result.push(typeConverters.DefinitionLink.to(item));
    } else {
      result.push(typeConverters.location.to(item));
    }
  }
  return result;
}
export {
  ExtHostApiCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0QXBpQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0ZhbHN5T3JFbXB0eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU29tZVNjaGVtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGRlY29kZVNlbWFudGljVG9rZW5zRHRvIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc0R0by5qcyc7XG5pbXBvcnQgeyB2YWxpZGF0ZVdoZW5DbGF1c2VzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ2FsbEhpZXJhcmNoeUl0ZW1EdG8sIElJbmNvbWluZ0NhbGxEdG8sIElJbmxpbmVWYWx1ZUNvbnRleHREdG8sIElPdXRnb2luZ0NhbGxEdG8sIElSYXdDb2xvckluZm8sIElUeXBlSGllcmFyY2h5SXRlbUR0bywgSVdvcmtzcGFjZUVkaXREdG8gfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQXBpQ29tbWFuZCwgQXBpQ29tbWFuZEFyZ3VtZW50LCBBcGlDb21tYW5kUmVzdWx0LCBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDdXN0b21Db2RlQWN0aW9uIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUcmFuc2llbnRDZWxsTWV0YWRhdGEsIFRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyBzZWFyY2ggZnJvbSAnLi4vLi4vY29udHJpYi9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElFeHRlbnNpb25Qcm9tcHRGaWxlUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvY2hhdFByb21wdEZpbGVzQ29udHJpYnV0aW9uLmpzJztcblxuLy8jcmVnaW9uIC0tLSBORVcgd29ybGRcblxuY29uc3QgbmV3Q29tbWFuZHM6IEFwaUNvbW1hbmRbXSA9IFtcblx0Ly8gLS0gZG9jdW1lbnQgaGlnaGxpZ2h0c1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVEb2N1bWVudEhpZ2hsaWdodHMnLCAnX2V4ZWN1dGVEb2N1bWVudEhpZ2hsaWdodHMnLCAnRXhlY3V0ZSBkb2N1bWVudCBoaWdobGlnaHQgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXSwgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHRbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIERvY3VtZW50SGlnaGxpZ2h0LWluc3RhbmNlcy4nLCB0cnlNYXBXaXRoKHR5cGVDb252ZXJ0ZXJzLkRvY3VtZW50SGlnaGxpZ2h0LnRvKSlcblx0KSxcblx0Ly8gLS0gZG9jdW1lbnQgc3ltYm9sc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVEb2N1bWVudFN5bWJvbFByb3ZpZGVyJywgJ19leGVjdXRlRG9jdW1lbnRTeW1ib2xQcm92aWRlcicsICdFeGVjdXRlIGRvY3VtZW50IHN5bWJvbCBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2xbXSwgdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBTeW1ib2xJbmZvcm1hdGlvbiBhbmQgRG9jdW1lbnRTeW1ib2wgaW5zdGFuY2VzLicsICh2YWx1ZSwgYXBpQXJncykgPT4ge1xuXG5cdFx0XHRpZiAoaXNGYWxzeU9yRW1wdHkodmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjbGFzcyBNZXJnZWRJbmZvIGV4dGVuZHMgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24gaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRTeW1ib2wge1xuXHRcdFx0XHRzdGF0aWMgdG8oc3ltYm9sOiBsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2wpOiBNZXJnZWRJbmZvIHtcblx0XHRcdFx0XHRjb25zdCByZXMgPSBuZXcgTWVyZ2VkSW5mbyhcblx0XHRcdFx0XHRcdHN5bWJvbC5uYW1lLFxuXHRcdFx0XHRcdFx0dHlwZUNvbnZlcnRlcnMuU3ltYm9sS2luZC50byhzeW1ib2wua2luZCksXG5cdFx0XHRcdFx0XHRzeW1ib2wuY29udGFpbmVyTmFtZSB8fCAnJyxcblx0XHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihhcGlBcmdzWzBdLCB0eXBlQ29udmVydGVycy5SYW5nZS50byhzeW1ib2wucmFuZ2UpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0cmVzLmRldGFpbCA9IHN5bWJvbC5kZXRhaWw7XG5cdFx0XHRcdFx0cmVzLnJhbmdlID0gcmVzLmxvY2F0aW9uLnJhbmdlO1xuXHRcdFx0XHRcdHJlcy5zZWxlY3Rpb25SYW5nZSA9IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKHN5bWJvbC5zZWxlY3Rpb25SYW5nZSk7XG5cdFx0XHRcdFx0cmVzLmNoaWxkcmVuID0gc3ltYm9sLmNoaWxkcmVuID8gc3ltYm9sLmNoaWxkcmVuLm1hcChNZXJnZWRJbmZvLnRvKSA6IFtdO1xuXHRcdFx0XHRcdHJldHVybiByZXM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkZXRhaWwhOiBzdHJpbmc7XG5cdFx0XHRcdHJhbmdlITogdnNjb2RlLlJhbmdlO1xuXHRcdFx0XHRzZWxlY3Rpb25SYW5nZSE6IHZzY29kZS5SYW5nZTtcblx0XHRcdFx0Y2hpbGRyZW4hOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xbXTtcblx0XHRcdFx0b3ZlcnJpZGUgY29udGFpbmVyTmFtZTogc3RyaW5nID0gJyc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKE1lcmdlZEluZm8udG8pO1xuXG5cdFx0fSlcblx0KSxcblx0Ly8gLS0gZm9ybWF0dGluZ1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVGb3JtYXREb2N1bWVudFByb3ZpZGVyJywgJ19leGVjdXRlRm9ybWF0RG9jdW1lbnRQcm92aWRlcicsICdFeGVjdXRlIGRvY3VtZW50IGZvcm1hdCBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdvcHRpb25zJywgJ0Zvcm1hdHRpbmcgb3B0aW9ucycsIF8gPT4gdHJ1ZSwgdiA9PiB2KV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlRleHRFZGl0W10sIHR5cGVzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBUZXh0RWRpdHMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5UZXh0RWRpdC50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUZvcm1hdFJhbmdlUHJvdmlkZXInLCAnX2V4ZWN1dGVGb3JtYXRSYW5nZVByb3ZpZGVyJywgJ0V4ZWN1dGUgcmFuZ2UgZm9ybWF0IHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5SYW5nZSwgbmV3IEFwaUNvbW1hbmRBcmd1bWVudCgnb3B0aW9ucycsICdGb3JtYXR0aW5nIG9wdGlvbnMnLCBfID0+IHRydWUsIHYgPT4gdildLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5UZXh0RWRpdFtdLCB0eXBlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgVGV4dEVkaXRzLicsIHRyeU1hcFdpdGgodHlwZUNvbnZlcnRlcnMuVGV4dEVkaXQudG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVGb3JtYXRPblR5cGVQcm92aWRlcicsICdfZXhlY3V0ZUZvcm1hdE9uVHlwZVByb3ZpZGVyJywgJ0V4ZWN1dGUgZm9ybWF0IG9uIHR5cGUgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdjaCcsICdUcmlnZ2VyIGNoYXJhY3RlcicsIHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnLCB2ID0+IHYpLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdvcHRpb25zJywgJ0Zvcm1hdHRpbmcgb3B0aW9ucycsIF8gPT4gdHJ1ZSwgdiA9PiB2KV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlRleHRFZGl0W10sIHR5cGVzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBUZXh0RWRpdHMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5UZXh0RWRpdC50bykpXG5cdCksXG5cdC8vIC0tIGdvIHRvIHN5bWJvbCAoZGVmaW5pdGlvbiwgdHlwZSBkZWZpbml0aW9uLCBkZWNsYXJhdGlvbiwgaW1wbCwgcmVmZXJlbmNlcylcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgJ19leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgJ0V4ZWN1dGUgYWxsIGRlZmluaXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhwZXJpbWVudGFsLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ19leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyX3JlY3Vyc2l2ZScsICdFeGVjdXRlIGFsbCBkZWZpbml0aW9uIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PChsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rKVtdLCAodHlwZXMuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24gb3IgTG9jYXRpb25MaW5rIGluc3RhbmNlcy4nLCBtYXBMb2NhdGlvbk9yTG9jYXRpb25MaW5rKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgJ19leGVjdXRlVHlwZURlZmluaXRpb25Qcm92aWRlcicsICdFeGVjdXRlIGFsbCB0eXBlIGRlZmluaXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhwZXJpbWVudGFsLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyX3JlY3Vyc2l2ZScsICdfZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ0V4ZWN1dGUgYWxsIHR5cGUgZGVmaW5pdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRGVjbGFyYXRpb25Qcm92aWRlcicsICdfZXhlY3V0ZURlY2xhcmF0aW9uUHJvdmlkZXInLCAnRXhlY3V0ZSBhbGwgZGVjbGFyYXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhwZXJpbWVudGFsLmV4ZWN1dGVEZWNsYXJhdGlvblByb3ZpZGVyX3JlY3Vyc2l2ZScsICdfZXhlY3V0ZURlY2xhcmF0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ0V4ZWN1dGUgYWxsIGRlY2xhcmF0aW9uIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PChsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rKVtdLCAodHlwZXMuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24gb3IgTG9jYXRpb25MaW5rIGluc3RhbmNlcy4nLCBtYXBMb2NhdGlvbk9yTG9jYXRpb25MaW5rKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVJbXBsZW1lbnRhdGlvblByb3ZpZGVyJywgJ19leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsICdFeGVjdXRlIGFsbCBpbXBsZW1lbnRhdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leHBlcmltZW50YWwuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ19leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcl9yZWN1cnNpdmUnLCAnRXhlY3V0ZSBhbGwgaW1wbGVtZW50YXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZVJlZmVyZW5jZVByb3ZpZGVyJywgJ19leGVjdXRlUmVmZXJlbmNlUHJvdmlkZXInLCAnRXhlY3V0ZSBhbGwgcmVmZXJlbmNlIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Mb2NhdGlvbltdLCB0eXBlcy5Mb2NhdGlvbltdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24taW5zdGFuY2VzLicsIHRyeU1hcFdpdGgodHlwZUNvbnZlcnRlcnMubG9jYXRpb24udG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4cGVyaW1lbnRhbC5leGVjdXRlUmVmZXJlbmNlUHJvdmlkZXInLCAnX2V4ZWN1dGVSZWZlcmVuY2VQcm92aWRlcl9yZWN1cnNpdmUnLCAnRXhlY3V0ZSBhbGwgcmVmZXJlbmNlIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Mb2NhdGlvbltdLCB0eXBlcy5Mb2NhdGlvbltdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24taW5zdGFuY2VzLicsIHRyeU1hcFdpdGgodHlwZUNvbnZlcnRlcnMubG9jYXRpb24udG8pKVxuXHQpLFxuXHQvLyAtLSBob3ZlclxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVIb3ZlclByb3ZpZGVyJywgJ19leGVjdXRlSG92ZXJQcm92aWRlcicsICdFeGVjdXRlIGFsbCBob3ZlciBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuSG92ZXJbXSwgdHlwZXMuSG92ZXJbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIEhvdmVyLWluc3RhbmNlcy4nLCB0cnlNYXBXaXRoKHR5cGVDb252ZXJ0ZXJzLkhvdmVyLnRvKSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leHBlcmltZW50YWwuZXhlY3V0ZUhvdmVyUHJvdmlkZXJfcmVjdXJzaXZlJywgJ19leGVjdXRlSG92ZXJQcm92aWRlcl9yZWN1cnNpdmUnLCAnRXhlY3V0ZSBhbGwgaG92ZXIgcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLkhvdmVyW10sIHR5cGVzLkhvdmVyW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBIb3Zlci1pbnN0YW5jZXMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5Ib3Zlci50bykpXG5cdCksXG5cdC8vIC0tIHNlbGVjdGlvbiByYW5nZVxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVTZWxlY3Rpb25SYW5nZVByb3ZpZGVyJywgJ19leGVjdXRlU2VsZWN0aW9uUmFuZ2VQcm92aWRlcicsICdFeGVjdXRlIHNlbGVjdGlvbiByYW5nZSBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHR5cGVzLlBvc2l0aW9uW10sIElQb3NpdGlvbltdPigncG9zaXRpb24nLCAnQSBwb3NpdGlvbiBpbiBhIHRleHQgZG9jdW1lbnQnLCB2ID0+IEFycmF5LmlzQXJyYXkodikgJiYgdi5ldmVyeSh2ID0+IHR5cGVzLlBvc2l0aW9uLmlzUG9zaXRpb24odikpLCB2ID0+IHYubWFwKHR5cGVDb252ZXJ0ZXJzLlBvc2l0aW9uLmZyb20pKV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SVJhbmdlW11bXSwgdHlwZXMuU2VsZWN0aW9uUmFuZ2VbXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJhbmdlcy4nLCByZXN1bHQgPT4ge1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5tYXAocmFuZ2VzID0+IHtcblx0XHRcdFx0bGV0IG5vZGU6IHR5cGVzLlNlbGVjdGlvblJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcy5yZXZlcnNlKCkpIHtcblx0XHRcdFx0XHRub2RlID0gbmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKHJhbmdlKSwgbm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5vZGUhO1xuXHRcdFx0fSk7XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0gc3ltYm9sIHNlYXJjaFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsICdfZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgJ0V4ZWN1dGUgYWxsIHdvcmtzcGFjZSBzeW1ib2wgcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgncXVlcnknLCAnU2VhcmNoIHN0cmluZycpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFtdLCB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbltdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgU3ltYm9sSW5mb3JtYXRpb24taW5zdGFuY2VzLicsIHZhbHVlID0+IHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnRlcnMuV29ya3NwYWNlU3ltYm9sLnRvKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gY2FsbCBoaWVyYXJjaHlcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5wcmVwYXJlQ2FsbEhpZXJhcmNoeScsICdfZXhlY3V0ZVByZXBhcmVDYWxsSGllcmFyY2h5JywgJ1ByZXBhcmUgY2FsbCBoaWVyYXJjaHkgYXQgYSBwb3NpdGlvbiBpbnNpZGUgYSBkb2N1bWVudCcsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SUNhbGxIaWVyYXJjaHlJdGVtRHRvW10sIHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtW10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBDYWxsSGllcmFyY2h5SXRlbS1pbnN0YW5jZXMnLCB2ID0+IHYubWFwKHR5cGVDb252ZXJ0ZXJzLkNhbGxIaWVyYXJjaHlJdGVtLnRvKSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5wcm92aWRlSW5jb21pbmdDYWxscycsICdfZXhlY3V0ZVByb3ZpZGVJbmNvbWluZ0NhbGxzJywgJ0NvbXB1dGUgaW5jb21pbmcgY2FsbHMgZm9yIGFuIGl0ZW0nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuQ2FsbEhpZXJhcmNoeUl0ZW1dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElJbmNvbWluZ0NhbGxEdG9bXSwgdHlwZXMuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbFtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbC1pbnN0YW5jZXMnLCB2ID0+IHYubWFwKHR5cGVDb252ZXJ0ZXJzLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwudG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVPdXRnb2luZ0NhbGxzJywgJ19leGVjdXRlUHJvdmlkZU91dGdvaW5nQ2FsbHMnLCAnQ29tcHV0ZSBvdXRnb2luZyBjYWxscyBmb3IgYW4gaXRlbScsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5DYWxsSGllcmFyY2h5SXRlbV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SU91dGdvaW5nQ2FsbER0b1tdLCB0eXBlcy5DYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsW10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbC50bykpXG5cdCksXG5cdC8vIC0tLSByZW5hbWVcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5wcmVwYXJlUmVuYW1lJywgJ19leGVjdXRlUHJlcGFyZVJlbmFtZScsICdFeGVjdXRlIHRoZSBwcmVwYXJlUmVuYW1lIG9mIHJlbmFtZSBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5SZW5hbWVMb2NhdGlvbiwgeyByYW5nZTogdHlwZXMuUmFuZ2U7IHBsYWNlaG9sZGVyOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgcmFuZ2UgYW5kIHBsYWNlaG9sZGVyIHRleHQuJywgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKHZhbHVlLnJhbmdlKSxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IHZhbHVlLnRleHRcblx0XHRcdH07XG5cdFx0fSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRG9jdW1lbnRSZW5hbWVQcm92aWRlcicsICdfZXhlY3V0ZURvY3VtZW50UmVuYW1lUHJvdmlkZXInLCAnRXhlY3V0ZSByZW5hbWUgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uLCBBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ25ld05hbWUnLCAnVGhlIG5ldyBzeW1ib2wgbmFtZScpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJV29ya3NwYWNlRWRpdER0byAmIHsgcmVqZWN0UmVhc29uPzogc3RyaW5nIH0sIHR5cGVzLldvcmtzcGFjZUVkaXQgfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIFdvcmtzcGFjZUVkaXQuJywgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlLnJlamVjdFJlYXNvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IodmFsdWUucmVqZWN0UmVhc29uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0eXBlQ29udmVydGVycy5Xb3Jrc3BhY2VFZGl0LnRvKHZhbHVlKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gbGlua3Ncblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlTGlua1Byb3ZpZGVyJywgJ19leGVjdXRlTGlua1Byb3ZpZGVyJywgJ0V4ZWN1dGUgZG9jdW1lbnQgbGluayBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuTnVtYmVyLndpdGgoJ2xpbmtSZXNvbHZlQ291bnQnLCAnTnVtYmVyIG9mIGxpbmtzIHRoYXQgc2hvdWxkIGJlIHJlc29sdmVkLCBvbmx5IHdoZW4gbGlua3MgYXJlIHVucmVzb2x2ZWQuJykub3B0aW9uYWwoKV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLklMaW5rW10sIHZzY29kZS5Eb2N1bWVudExpbmtbXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIERvY3VtZW50TGluay1pbnN0YW5jZXMuJywgdmFsdWUgPT4gdmFsdWUubWFwKHR5cGVDb252ZXJ0ZXJzLkRvY3VtZW50TGluay50bykpXG5cdCksXG5cdC8vIC0tLSBzZW1hbnRpYyB0b2tlbnNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5wcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0xlZ2VuZCcsICdfcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnNMZWdlbmQnLCAnUHJvdmlkZSBzZW1hbnRpYyB0b2tlbnMgbGVnZW5kIGZvciBhIGRvY3VtZW50Jyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kLCB0eXBlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIFNlbWFudGljVG9rZW5zTGVnZW5kLicsIHZhbHVlID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQodmFsdWUudG9rZW5UeXBlcywgdmFsdWUudG9rZW5Nb2RpZmllcnMpO1xuXHRcdH0pXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMnLCAnX3Byb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zJywgJ1Byb3ZpZGUgc2VtYW50aWMgdG9rZW5zIGZvciBhIGRvY3VtZW50Jyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8VlNCdWZmZXIsIHR5cGVzLlNlbWFudGljVG9rZW5zIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gU2VtYW50aWNUb2tlbnMuJywgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VtYW50aWNUb2tlbnNEdG8gPSBkZWNvZGVTZW1hbnRpY1Rva2Vuc0R0byh2YWx1ZSk7XG5cdFx0XHRpZiAoc2VtYW50aWNUb2tlbnNEdG8udHlwZSAhPT0gJ2Z1bGwnKSB7XG5cdFx0XHRcdC8vIG9ubHkgYWNjZXB0aW5nIGZ1bGwgc2VtYW50aWMgdG9rZW5zIGZyb20gcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnNcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnMoc2VtYW50aWNUb2tlbnNEdG8uZGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNMZWdlbmQnLCAnX3Byb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNMZWdlbmQnLCAnUHJvdmlkZSBzZW1hbnRpYyB0b2tlbnMgbGVnZW5kIGZvciBhIGRvY3VtZW50IHJhbmdlJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlJhbmdlLm9wdGlvbmFsKCldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCwgdHlwZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQgfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBTZW1hbnRpY1Rva2Vuc0xlZ2VuZC4nLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLlNlbWFudGljVG9rZW5zTGVnZW5kKHZhbHVlLnRva2VuVHlwZXMsIHZhbHVlLnRva2VuTW9kaWZpZXJzKTtcblx0XHR9KVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMnLCAnX3Byb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMnLCAnUHJvdmlkZSBzZW1hbnRpYyB0b2tlbnMgZm9yIGEgZG9jdW1lbnQgcmFuZ2UnLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUmFuZ2VdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PFZTQnVmZmVyLCB0eXBlcy5TZW1hbnRpY1Rva2VucyB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIFNlbWFudGljVG9rZW5zLicsIHZhbHVlID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbWFudGljVG9rZW5zRHRvID0gZGVjb2RlU2VtYW50aWNUb2tlbnNEdG8odmFsdWUpO1xuXHRcdFx0aWYgKHNlbWFudGljVG9rZW5zRHRvLnR5cGUgIT09ICdmdWxsJykge1xuXHRcdFx0XHQvLyBvbmx5IGFjY2VwdGluZyBmdWxsIHNlbWFudGljIHRva2VucyBmcm9tIHByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnMoc2VtYW50aWNUb2tlbnNEdG8uZGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gY29tcGxldGlvbnNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsICdfZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLCAnRXhlY3V0ZSBjb21wbGV0aW9uIGl0ZW0gcHJvdmlkZXIuJyxcblx0XHRbXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuVXJpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCd0cmlnZ2VyQ2hhcmFjdGVyJywgJ1RyaWdnZXIgY29tcGxldGlvbiB3aGVuIHRoZSB1c2VyIHR5cGVzIHRoZSBjaGFyYWN0ZXIsIGxpa2UgYCxgIG9yIGAoYCcpLm9wdGlvbmFsKCksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuTnVtYmVyLndpdGgoJ2l0ZW1SZXNvbHZlQ291bnQnLCAnTnVtYmVyIG9mIGNvbXBsZXRpb25zIHRvIHJlc29sdmUgKHRvbyBsYXJnZSBudW1iZXJzIHNsb3cgZG93biBjb21wbGV0aW9ucyknKS5vcHRpb25hbCgpXG5cdFx0XSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuQ29tcGxldGlvbkxpc3QsIHZzY29kZS5Db21wbGV0aW9uTGlzdD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgQ29tcGxldGlvbkxpc3QtaW5zdGFuY2UuJywgKHZhbHVlLCBfYXJncywgY29udmVydGVyKSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuQ29tcGxldGlvbkxpc3QoW10pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXRlbXMgPSB2YWx1ZS5zdWdnZXN0aW9ucy5tYXAoc3VnZ2VzdGlvbiA9PiB0eXBlQ29udmVydGVycy5Db21wbGV0aW9uSXRlbS50byhzdWdnZXN0aW9uLCBjb252ZXJ0ZXIpKTtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuQ29tcGxldGlvbkxpc3QoaXRlbXMsIHZhbHVlLmluY29tcGxldGUpO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBzaWduYXR1cmUgaGVscFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVTaWduYXR1cmVIZWxwUHJvdmlkZXInLCAnX2V4ZWN1dGVTaWduYXR1cmVIZWxwUHJvdmlkZXInLCAnRXhlY3V0ZSBzaWduYXR1cmUgaGVscCBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb24sIEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgndHJpZ2dlckNoYXJhY3RlcicsICdUcmlnZ2VyIHNpZ25hdHVyZSBoZWxwIHdoZW4gdGhlIHVzZXIgdHlwZXMgdGhlIGNoYXJhY3RlciwgbGlrZSBgLGAgb3IgYChgJykub3B0aW9uYWwoKV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHAsIHZzY29kZS5TaWduYXR1cmVIZWxwIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gU2lnbmF0dXJlSGVscC4nLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHR5cGVDb252ZXJ0ZXJzLlNpZ25hdHVyZUhlbHAudG8odmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gY29kZSBsZW5zXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUNvZGVMZW5zUHJvdmlkZXInLCAnX2V4ZWN1dGVDb2RlTGVuc1Byb3ZpZGVyJywgJ0V4ZWN1dGUgY29kZSBsZW5zIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5OdW1iZXIud2l0aCgnaXRlbVJlc29sdmVDb3VudCcsICdOdW1iZXIgb2YgbGVuc2VzIHRoYXQgc2hvdWxkIGJlIHJlc29sdmVkIGFuZCByZXR1cm5lZC4gV2lsbCBvbmx5IHJldHVybiByZXNvbHZlZCBsZW5zZXMsIHdpbGwgaW1wYWN0IHBlcmZvcm1hbmNlKScpLm9wdGlvbmFsKCldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Db2RlTGVuc1tdLCB2c2NvZGUuQ29kZUxlbnNbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIENvZGVMZW5zLWluc3RhbmNlcy4nLCAodmFsdWUsIF9hcmdzLCBjb252ZXJ0ZXIpID0+IHtcblx0XHRcdHJldHVybiB0cnlNYXBXaXRoPGxhbmd1YWdlcy5Db2RlTGVucywgdnNjb2RlLkNvZGVMZW5zPihpdGVtID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db2RlTGVucyh0eXBlQ29udmVydGVycy5SYW5nZS50byhpdGVtLnJhbmdlKSwgaXRlbS5jb21tYW5kICYmIGNvbnZlcnRlci5mcm9tSW50ZXJuYWwoaXRlbS5jb21tYW5kKSk7XG5cdFx0XHR9KSh2YWx1ZSk7XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0tIGNvZGUgYWN0aW9uc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCAnX2V4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCAnRXhlY3V0ZSBjb2RlIGFjdGlvbiBwcm92aWRlci4nLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5VcmksXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdyYW5nZU9yU2VsZWN0aW9uJywgJ1JhbmdlIGluIGEgdGV4dCBkb2N1bWVudC4gU29tZSByZWZhY3RvcmluZyBwcm92aWRlciByZXF1aXJlcyBTZWxlY3Rpb24gb2JqZWN0LicsIHYgPT4gdHlwZXMuUmFuZ2UuaXNSYW5nZSh2KSwgdiA9PiB0eXBlcy5TZWxlY3Rpb24uaXNTZWxlY3Rpb24odikgPyB0eXBlQ29udmVydGVycy5TZWxlY3Rpb24uZnJvbSh2KSA6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLmZyb20odikpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCdraW5kJywgJ0NvZGUgYWN0aW9uIGtpbmQgdG8gcmV0dXJuIGNvZGUgYWN0aW9ucyBmb3InKS5vcHRpb25hbCgpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50Lk51bWJlci53aXRoKCdpdGVtUmVzb2x2ZUNvdW50JywgJ051bWJlciBvZiBjb2RlIGFjdGlvbnMgdG8gcmVzb2x2ZSAodG9vIGxhcmdlIG51bWJlcnMgc2xvdyBkb3duIGNvZGUgYWN0aW9ucyknKS5vcHRpb25hbCgpXG5cdFx0XSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxDdXN0b21Db2RlQWN0aW9uW10sICh2c2NvZGUuQ29kZUFjdGlvbiB8IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkKVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgQ29tbWFuZC1pbnN0YW5jZXMuJywgKHZhbHVlLCBfYXJncywgY29udmVydGVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gdHJ5TWFwV2l0aDxDdXN0b21Db2RlQWN0aW9uLCB2c2NvZGUuQ29kZUFjdGlvbiB8IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkPigoY29kZUFjdGlvbikgPT4ge1xuXHRcdFx0XHRpZiAoY29kZUFjdGlvbi5faXNTeW50aGV0aWMpIHtcblx0XHRcdFx0XHRpZiAoIWNvZGVBY3Rpb24uY29tbWFuZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTeW50aGV0aWMgY29kZSBhY3Rpb25zIG11c3QgaGF2ZSBhIGNvbW1hbmQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGNvbnZlcnRlci5mcm9tSW50ZXJuYWwoY29kZUFjdGlvbi5jb21tYW5kKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCByZXQgPSBuZXcgdHlwZXMuQ29kZUFjdGlvbihcblx0XHRcdFx0XHRcdGNvZGVBY3Rpb24udGl0bGUsXG5cdFx0XHRcdFx0XHRjb2RlQWN0aW9uLmtpbmQgPyBuZXcgdHlwZXMuQ29kZUFjdGlvbktpbmQoY29kZUFjdGlvbi5raW5kKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKGNvZGVBY3Rpb24uZWRpdCkge1xuXHRcdFx0XHRcdFx0cmV0LmVkaXQgPSB0eXBlQ29udmVydGVycy5Xb3Jrc3BhY2VFZGl0LnRvKGNvZGVBY3Rpb24uZWRpdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjb2RlQWN0aW9uLmNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdHJldC5jb21tYW5kID0gY29udmVydGVyLmZyb21JbnRlcm5hbChjb2RlQWN0aW9uLmNvbW1hbmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXQuaXNQcmVmZXJyZWQgPSBjb2RlQWN0aW9uLmlzUHJlZmVycmVkO1xuXHRcdFx0XHRcdHJldHVybiByZXQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKHZhbHVlKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gY29sb3JzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50Q29sb3JQcm92aWRlcicsICdfZXhlY3V0ZURvY3VtZW50Q29sb3JQcm92aWRlcicsICdFeGVjdXRlIGRvY3VtZW50IGNvbG9yIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElSYXdDb2xvckluZm9bXSwgdnNjb2RlLkNvbG9ySW5mb3JtYXRpb25bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIENvbG9ySW5mb3JtYXRpb24gb2JqZWN0cy4nLCByZXN1bHQgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcChjaSA9PiBuZXcgdHlwZXMuQ29sb3JJbmZvcm1hdGlvbih0eXBlQ29udmVydGVycy5SYW5nZS50byhjaS5yYW5nZSksIHR5cGVDb252ZXJ0ZXJzLkNvbG9yLnRvKGNpLmNvbG9yKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0pXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUNvbG9yUHJlc2VudGF0aW9uUHJvdmlkZXInLCAnX2V4ZWN1dGVDb2xvclByZXNlbnRhdGlvblByb3ZpZGVyJywgJ0V4ZWN1dGUgY29sb3IgcHJlc2VudGF0aW9uIHByb3ZpZGVyLicsXG5cdFx0W1xuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDx0eXBlcy5Db2xvciwgW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+KCdjb2xvcicsICdUaGUgY29sb3IgdG8gc2hvdyBhbmQgaW5zZXJ0JywgdiA9PiB2IGluc3RhbmNlb2YgdHlwZXMuQ29sb3IsIHR5cGVDb252ZXJ0ZXJzLkNvbG9yLmZyb20pLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDx7IHVyaTogVVJJOyByYW5nZTogdHlwZXMuUmFuZ2UgfSwgeyB1cmk6IFVSSTsgcmFuZ2U6IElSYW5nZSB9PignY29udGV4dCcsICdDb250ZXh0IG9iamVjdCB3aXRoIHVyaSBhbmQgcmFuZ2UnLCBfdiA9PiB0cnVlLCB2ID0+ICh7IHVyaTogdi51cmksIHJhbmdlOiB0eXBlQ29udmVydGVycy5SYW5nZS5mcm9tKHYucmFuZ2UpIH0pKSxcblx0XHRdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5JQ29sb3JQcmVzZW50YXRpb25bXSwgdHlwZXMuQ29sb3JQcmVzZW50YXRpb25bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIENvbG9yUHJlc2VudGF0aW9uIG9iamVjdHMuJywgcmVzdWx0ID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC5tYXAodHlwZUNvbnZlcnRlcnMuQ29sb3JQcmVzZW50YXRpb24udG8pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBpbmxpbmUgaGludHNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlSW5sYXlIaW50UHJvdmlkZXInLCAnX2V4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsICdFeGVjdXRlIGlubGF5IGhpbnRzIHByb3ZpZGVyJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlJhbmdlXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuSW5sYXlIaW50W10sIHZzY29kZS5JbmxheUhpbnRbXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIElubGF5IG9iamVjdHMnLCAocmVzdWx0LCBhcmdzLCBjb252ZXJ0ZXIpID0+IHtcblx0XHRcdHJldHVybiByZXN1bHQubWFwKHR5cGVDb252ZXJ0ZXJzLklubGF5SGludC50by5iaW5kKHVuZGVmaW5lZCwgY29udmVydGVyKSk7XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0tIGZvbGRpbmdcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRm9sZGluZ1JhbmdlUHJvdmlkZXInLCAnX2V4ZWN1dGVGb2xkaW5nUmFuZ2VQcm92aWRlcicsICdFeGVjdXRlIGZvbGRpbmcgcmFuZ2UgcHJvdmlkZXInLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuRm9sZGluZ1JhbmdlW10gfCB1bmRlZmluZWQsIHZzY29kZS5Gb2xkaW5nUmFuZ2VbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIEZvbGRpbmdSYW5nZSBvYmplY3RzJywgKHJlc3VsdCwgYXJncykgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcCh0eXBlQ29udmVydGVycy5Gb2xkaW5nUmFuZ2UudG8pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KVxuXHQpLFxuXG5cdC8vIC0tLSBub3RlYm9va3Ncblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5yZXNvbHZlTm90ZWJvb2tDb250ZW50UHJvdmlkZXJzJywgJ19yZXNvbHZlTm90ZWJvb2tDb250ZW50UHJvdmlkZXInLCAnUmVzb2x2ZSBOb3RlYm9vayBDb250ZW50IFByb3ZpZGVycycsXG5cdFx0W1xuXHRcdFx0Ly8gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxzdHJpbmcsIHN0cmluZz4oJ3ZpZXdUeXBlJywgJycsIHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnLCB2ID0+IHYpLFxuXHRcdFx0Ly8gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxzdHJpbmcsIHN0cmluZz4oJ2Rpc3BsYXlOYW1lJywgJycsIHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnLCB2ID0+IHYpLFxuXHRcdFx0Ly8gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxvYmplY3QsIG9iamVjdD4oJ29wdGlvbnMnLCAnJywgdiA9PiB0eXBlb2YgdiA9PT0gJ29iamVjdCcsIHYgPT4gdiksXG5cdFx0XSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDx7XG5cdFx0XHR2aWV3VHlwZTogc3RyaW5nO1xuXHRcdFx0ZGlzcGxheU5hbWU6IHN0cmluZztcblx0XHRcdG9wdGlvbnM6IHsgdHJhbnNpZW50T3V0cHV0czogYm9vbGVhbjsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiBUcmFuc2llbnRDZWxsTWV0YWRhdGE7IHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IFRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEgfTtcblx0XHRcdGZpbGVuYW1lUGF0dGVybjogKHZzY29kZS5HbG9iUGF0dGVybiB8IHsgaW5jbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuOyBleGNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm4gfSlbXTtcblx0XHR9W10sIHtcblx0XHRcdHZpZXdUeXBlOiBzdHJpbmc7XG5cdFx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiAodnNjb2RlLkdsb2JQYXR0ZXJuIHwgeyBpbmNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm47IGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB9KVtdO1xuXHRcdFx0b3B0aW9uczogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucztcblx0XHR9W10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBOb3RlYm9va0NvbnRlbnRQcm92aWRlciBzdGF0aWMgaW5mbyBvYmplY3RzLicsIHRyeU1hcFdpdGgoaXRlbSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2aWV3VHlwZTogaXRlbS52aWV3VHlwZSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGl0ZW0uZGlzcGxheU5hbWUsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHR0cmFuc2llbnRPdXRwdXRzOiBpdGVtLm9wdGlvbnMudHJhbnNpZW50T3V0cHV0cyxcblx0XHRcdFx0XHR0cmFuc2llbnRDZWxsTWV0YWRhdGE6IGl0ZW0ub3B0aW9ucy50cmFuc2llbnRDZWxsTWV0YWRhdGEsXG5cdFx0XHRcdFx0dHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YTogaXRlbS5vcHRpb25zLnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGFcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiBpdGVtLmZpbGVuYW1lUGF0dGVybi5tYXAocGF0dGVybiA9PiB0eXBlQ29udmVydGVycy5Ob3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50UGF0dGVybi50byhwYXR0ZXJuKSlcblx0XHRcdH07XG5cdFx0fSkpXG5cdCksXG5cdC8vIC0tLSBkZWJ1ZyBzdXBwb3J0XG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUlubGluZVZhbHVlUHJvdmlkZXInLCAnX2V4ZWN1dGVJbmxpbmVWYWx1ZVByb3ZpZGVyJywgJ0V4ZWN1dGUgaW5saW5lIHZhbHVlIHByb3ZpZGVyJyxcblx0XHRbXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuVXJpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlJhbmdlLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDx0eXBlcy5JbmxpbmVWYWx1ZUNvbnRleHQsIElJbmxpbmVWYWx1ZUNvbnRleHREdG8+KCdjb250ZXh0JywgJ0FuIElubGluZVZhbHVlQ29udGV4dCcsIHYgPT4gdiAmJiB0eXBlb2Ygdi5mcmFtZUlkID09PSAnbnVtYmVyJyAmJiB2LnN0b3BwZWRMb2NhdGlvbiBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlLCB2ID0+IHR5cGVDb252ZXJ0ZXJzLklubGluZVZhbHVlQ29udGV4dC5mcm9tKHYpKVxuXHRcdF0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLklubGluZVZhbHVlW10sIHZzY29kZS5JbmxpbmVWYWx1ZVtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgSW5saW5lVmFsdWUgb2JqZWN0cycsIHJlc3VsdCA9PiB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcCh0eXBlQ29udmVydGVycy5JbmxpbmVWYWx1ZS50byk7XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0tIG9wZW4naXNoIGNvbW1hbmRzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUub3BlbicsICdfd29ya2JlbmNoLm9wZW4nLCAnT3BlbnMgdGhlIHByb3ZpZGVkIHJlc291cmNlIGluIHRoZSBlZGl0b3IuIENhbiBiZSBhIHRleHQgb3IgYmluYXJ5IGZpbGUsIG9yIGFuIGh0dHAocykgVVJMLiBJZiB5b3UgbmVlZCBtb3JlIGNvbnRyb2wgb3ZlciB0aGUgb3B0aW9ucyBmb3Igb3BlbmluZyBhIHRleHQgZmlsZSwgdXNlIHZzY29kZS53aW5kb3cuc2hvd1RleHREb2N1bWVudCBpbnN0ZWFkLicsXG5cdFx0W1xuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDxVUkkgfCBzdHJpbmc+KCd1cmlPclN0cmluZycsICdVcmktaW5zdGFuY2Ugb3Igc3RyaW5nIChvbmx5IGh0dHAvaHR0cHMpJywgdiA9PiBVUkkuaXNVcmkodikgfHwgKHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiBtYXRjaGVzU29tZVNjaGVtZSh2LCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMpKSwgdiA9PiB2KSxcblx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8dnNjb2RlLlZpZXdDb2x1bW4gfCB0eXBlQ29udmVydGVycy5UZXh0RWRpdG9yT3Blbk9wdGlvbnMgfCB1bmRlZmluZWQsIFt2c2NvZGUuVmlld0NvbHVtbj8sIElUZXh0RWRpdG9yT3B0aW9ucz9dIHwgdW5kZWZpbmVkPignY29sdW1uT3JPcHRpb25zJywgJ0VpdGhlciB0aGUgY29sdW1uIGluIHdoaWNoIHRvIG9wZW4gb3IgZWRpdG9yIG9wdGlvbnMsIHNlZSB2c2NvZGUuVGV4dERvY3VtZW50U2hvd09wdGlvbnMnLFxuXHRcdFx0XHR2ID0+IHYgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdiA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHYgPT09ICdvYmplY3QnLFxuXHRcdFx0XHR2ID0+ICF2ID8gdiA6IHR5cGVvZiB2ID09PSAnbnVtYmVyJyA/IFt0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLmZyb20odiksIHVuZGVmaW5lZF0gOiBbdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKHYudmlld0NvbHVtbiksIHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JPcGVuT3B0aW9ucy5mcm9tKHYpXVxuXHRcdFx0KS5vcHRpb25hbCgpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCdsYWJlbCcsICcnKS5vcHRpb25hbCgpXG5cdFx0XSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5vcGVuV2l0aCcsICdfd29ya2JlbmNoLm9wZW5XaXRoJywgJ09wZW5zIHRoZSBwcm92aWRlZCByZXNvdXJjZSB3aXRoIGEgc3BlY2lmaWMgZWRpdG9yLicsXG5cdFx0W1xuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlVyaS53aXRoKCdyZXNvdXJjZScsICdSZXNvdXJjZSB0byBvcGVuJyksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ3ZpZXdJZCcsICdDdXN0b20gZWRpdG9yIHZpZXcgaWQuIFRoaXMgc2hvdWxkIGJlIHRoZSB2aWV3VHlwZSBzdHJpbmcgZm9yIGN1c3RvbSBlZGl0b3JzIG9yIHRoZSBub3RlYm9va1R5cGUgc3RyaW5nIGZvciBub3RlYm9va3MuIFVzZSBcXCdkZWZhdWx0XFwnIHRvIHVzZSBWUyBDb2RlXFwncyBkZWZhdWx0IHRleHQgZWRpdG9yJyksXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHZzY29kZS5WaWV3Q29sdW1uIHwgdHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvck9wZW5PcHRpb25zIHwgdW5kZWZpbmVkLCBbdnNjb2RlLlZpZXdDb2x1bW4/LCBJVGV4dEVkaXRvck9wdGlvbnM/XSB8IHVuZGVmaW5lZD4oJ2NvbHVtbk9yT3B0aW9ucycsICdFaXRoZXIgdGhlIGNvbHVtbiBpbiB3aGljaCB0byBvcGVuIG9yIGVkaXRvciBvcHRpb25zLCBzZWUgdnNjb2RlLlRleHREb2N1bWVudFNob3dPcHRpb25zJyxcblx0XHRcdFx0diA9PiB2ID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHYgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2ID09PSAnb2JqZWN0Jyxcblx0XHRcdFx0diA9PiAhdiA/IHYgOiB0eXBlb2YgdiA9PT0gJ251bWJlcicgPyBbdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKHYpLCB1bmRlZmluZWRdIDogW3R5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4uZnJvbSh2LnZpZXdDb2x1bW4pLCB0eXBlQ29udmVydGVycy5UZXh0RWRpdG9yT3Blbk9wdGlvbnMuZnJvbSh2KV0sXG5cdFx0XHQpLm9wdGlvbmFsKClcblx0XHRdLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmRpZmYnLCAnX3dvcmtiZW5jaC5kaWZmJywgJ09wZW5zIHRoZSBwcm92aWRlZCByZXNvdXJjZXMgaW4gdGhlIGRpZmYgZWRpdG9yIHRvIGNvbXBhcmUgdGhlaXIgY29udGVudHMuJyxcblx0XHRbXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuVXJpLndpdGgoJ2xlZnQnLCAnTGVmdC1oYW5kIHNpZGUgcmVzb3VyY2Ugb2YgdGhlIGRpZmYgZWRpdG9yJyksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuVXJpLndpdGgoJ3JpZ2h0JywgJ1JpZ2h0LWhhbmQgc2lkZSByZXNvdXJjZSBvZiB0aGUgZGlmZiBlZGl0b3InKSxcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgndGl0bGUnLCAnSHVtYW4gcmVhZGFibGUgdGl0bGUgZm9yIHRoZSBkaWZmIGVkaXRvcicpLm9wdGlvbmFsKCksXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZCwgW251bWJlcj8sIElUZXh0RWRpdG9yT3B0aW9ucz9dIHwgdW5kZWZpbmVkPignY29sdW1uT3JPcHRpb25zJywgJ0VpdGhlciB0aGUgY29sdW1uIGluIHdoaWNoIHRvIG9wZW4gb3IgZWRpdG9yIG9wdGlvbnMsIHNlZSB2c2NvZGUuVGV4dERvY3VtZW50U2hvd09wdGlvbnMnLFxuXHRcdFx0XHR2ID0+IHYgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdiA9PT0gJ29iamVjdCcsXG5cdFx0XHRcdHYgPT4gdiAmJiBbdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKHYudmlld0NvbHVtbiksIHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JPcGVuT3B0aW9ucy5mcm9tKHYpXVxuXHRcdFx0KS5vcHRpb25hbCgpLFxuXHRcdF0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuY2hhbmdlcycsICdfd29ya2JlbmNoLmNoYW5nZXMnLCAnT3BlbnMgYSBsaXN0IG9mIHJlc291cmNlcyBpbiB0aGUgY2hhbmdlcyBlZGl0b3IgdG8gY29tcGFyZSB0aGVpciBjb250ZW50cy4nLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgndGl0bGUnLCAnSHVtYW4gcmVhZGFibGUgdGl0bGUgZm9yIHRoZSBjaGFuZ2VzIGVkaXRvcicpLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDxbVVJJLCBVUkk/LCBVUkk/XVtdPigncmVzb3VyY2VMaXN0JywgJ0xpc3Qgb2YgcmVzb3VyY2VzIHRvIGNvbXBhcmUnLFxuXHRcdFx0XHRyZXNvdXJjZXMgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0XHRpZiAocmVzb3VyY2UubGVuZ3RoICE9PSAzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgW2xhYmVsLCBsZWZ0LCByaWdodF0gPSByZXNvdXJjZTtcblx0XHRcdFx0XHRcdGlmICghVVJJLmlzVXJpKGxhYmVsKSB8fFxuXHRcdFx0XHRcdFx0XHQoIVVSSS5pc1VyaShsZWZ0KSAmJiBsZWZ0ICE9PSB1bmRlZmluZWQgJiYgbGVmdCAhPT0gbnVsbCkgfHxcblx0XHRcdFx0XHRcdFx0KCFVUkkuaXNVcmkocmlnaHQpICYmIHJpZ2h0ICE9PSB1bmRlZmluZWQgJiYgcmlnaHQgIT09IG51bGwpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0diA9PiB2KVxuXHRcdF0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdC8vIC0tLSB0eXBlIGhpZXJhcmNoeVxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByZXBhcmVUeXBlSGllcmFyY2h5JywgJ19leGVjdXRlUHJlcGFyZVR5cGVIaWVyYXJjaHknLCAnUHJlcGFyZSB0eXBlIGhpZXJhcmNoeSBhdCBhIHBvc2l0aW9uIGluc2lkZSBhIGRvY3VtZW50Jyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSwgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW1bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFR5cGVIaWVyYXJjaHlJdGVtLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuVHlwZUhpZXJhcmNoeUl0ZW0udG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVTdXBlcnR5cGVzJywgJ19leGVjdXRlUHJvdmlkZVN1cGVydHlwZXMnLCAnQ29tcHV0ZSBzdXBlcnR5cGVzIGZvciBhbiBpdGVtJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlR5cGVIaWVyYXJjaHlJdGVtXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSwgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW1bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFR5cGVIaWVyYXJjaHlJdGVtLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuVHlwZUhpZXJhcmNoeUl0ZW0udG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVTdWJ0eXBlcycsICdfZXhlY3V0ZVByb3ZpZGVTdWJ0eXBlcycsICdDb21wdXRlIHN1YnR5cGVzIGZvciBhbiBpdGVtJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlR5cGVIaWVyYXJjaHlJdGVtXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSwgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW1bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFR5cGVIaWVyYXJjaHlJdGVtLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuVHlwZUhpZXJhcmNoeUl0ZW0udG8pKVxuXHQpLFxuXHQvLyAtLS0gdGVzdGluZ1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnJldmVhbFRlc3RJbkV4cGxvcmVyJywgJ19yZXZlYWxUZXN0SW5FeHBsb3JlcicsICdSZXZlYWxzIGEgdGVzdCBpbnN0YW5jZSBpbiB0aGUgZXhwbG9yZXInLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVGVzdEl0ZW1dLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnN0YXJ0Q29udGludW91c1Rlc3RSdW4nLCAndGVzdGluZy5zdGFydENvbnRpbnVvdXNSdW5Gcm9tRXh0ZW5zaW9uJywgJ1N0YXJ0cyBydW5uaW5nIHRoZSBnaXZlbiB0ZXN0cyB3aXRoIGNvbnRpbnVvdXMgcnVuIG1vZGUuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlRlc3RQcm9maWxlLCBBcGlDb21tYW5kQXJndW1lbnQuQXJyKEFwaUNvbW1hbmRBcmd1bWVudC5UZXN0SXRlbSldLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnN0b3BDb250aW51b3VzVGVzdFJ1bicsICd0ZXN0aW5nLnN0b3BDb250aW51b3VzUnVuRnJvbUV4dGVuc2lvbicsICdTdG9wcyBydW5uaW5nIHRoZSBnaXZlbiB0ZXN0cyB3aXRoIGNvbnRpbnVvdXMgcnVuIG1vZGUuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LkFycihBcGlDb21tYW5kQXJndW1lbnQuVGVzdEl0ZW0pXSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0Ly8gLS0tIGNvbnRpbnVlIGVkaXQgc2Vzc2lvblxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4cGVyaW1lbnRhbC5lZGl0U2Vzc2lvbi5jb250aW51ZScsICdfd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmNvbnRpbnVlRWRpdFNlc3Npb24nLCAnQ29udGludWUgdGhlIGN1cnJlbnQgZWRpdCBzZXNzaW9uIGluIGEgZGlmZmVyZW50IHdvcmtzcGFjZScsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5Vcmkud2l0aCgnd29ya3NwYWNlVXJpJywgJ1RoZSB0YXJnZXQgd29ya3NwYWNlIHRvIGNvbnRpbnVlIHRoZSBjdXJyZW50IGVkaXQgc2Vzc2lvbiBpbicpXSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0Ly8gLS0tIGNvbnRleHQga2V5c1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQnc2V0Q29udGV4dCcsICdfc2V0Q29udGV4dCcsICdTZXQgYSBjdXN0b20gY29udGV4dCBrZXkgdmFsdWUgdGhhdCBjYW4gYmUgdXNlZCBpbiB3aGVuIGNsYXVzZXMuJyxcblx0XHRbXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ25hbWUnLCAnVGhlIGNvbnRleHQga2V5IG5hbWUnKSxcblx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3ZhbHVlJywgJ1RoZSBjb250ZXh0IGtleSB2YWx1ZScsICgpID0+IHRydWUsIHYgPT4gdiksXG5cdFx0XSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0Ly8gLS0tIGlubGluZSBjaGF0XG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZWRpdG9yQ2hhdC5zdGFydCcsICdpbmxpbmVDaGF0LnN0YXJ0JywgJ0ludm9rZSBhIG5ldyBlZGl0b3IgY2hhdCBzZXNzaW9uJyxcblx0XHRbbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxJbmxpbmVDaGF0RWRpdG9yQXBpQXJnIHwgdW5kZWZpbmVkLCBJbmxpbmVDaGF0UnVuT3B0aW9ucyB8IHVuZGVmaW5lZD4oJ1J1biBhcmd1bWVudHMnLCAnJywgX3YgPT4gdHJ1ZSwgdiA9PiB7XG5cblx0XHRcdGlmICghdikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbml0aWFsUmFuZ2U6IHYuaW5pdGlhbFJhbmdlID8gdHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbSh2LmluaXRpYWxSYW5nZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluaXRpYWxTZWxlY3Rpb246IHR5cGVzLlNlbGVjdGlvbi5pc1NlbGVjdGlvbih2LmluaXRpYWxTZWxlY3Rpb24pID8gdHlwZUNvbnZlcnRlcnMuU2VsZWN0aW9uLmZyb20odi5pbml0aWFsU2VsZWN0aW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWVzc2FnZTogdi5tZXNzYWdlLFxuXHRcdFx0XHRhdHRhY2htZW50czogdi5hdHRhY2htZW50cyxcblx0XHRcdFx0YXV0b1NlbmQ6IHYuYXV0b1NlbmQsXG5cdFx0XHRcdHBvc2l0aW9uOiB2LnBvc2l0aW9uID8gdHlwZUNvbnZlcnRlcnMuUG9zaXRpb24uZnJvbSh2LnBvc2l0aW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZU9uUmVzcG9uc2U6IHYucmVzb2x2ZU9uUmVzcG9uc2Vcblx0XHRcdH07XG5cdFx0fSldLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHQvLyAtLS0gZXh0ZW5zaW9uIHByb21wdCBmaWxlc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4dGVuc2lvblByb21wdEZpbGVQcm92aWRlcicsICdfbGlzdEV4dGVuc2lvblByb21wdEZpbGVzJywgJ0dldCBhbGwgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIHByb21wdCBmaWxlcyAoY3VzdG9tIGFnZW50cywgaW5zdHJ1Y3Rpb25zLCBhbmQgcHJvbXB0IGZpbGVzKS4nLFxuXHRcdFtdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElFeHRlbnNpb25Qcm9tcHRGaWxlUmVzdWx0W10sIHsgdXJpOiB2c2NvZGUuVXJpOyB0eXBlOiBQcm9tcHRzVHlwZTsgZXh0ZW5zaW9uSWQ6IHN0cmluZyB9W10+KFxuXHRcdFx0J0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIG9iamVjdHMgY29udGFpbmluZyB1cmksIHR5cGUsIGFuZCBleHRlbnNpb25JZC4nLFxuXHRcdFx0KHZhbHVlKSA9PiB7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbHVlLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdFx0dXJpOiBVUkkucmV2aXZlKGl0ZW0udXJpKSxcblx0XHRcdFx0XHR0eXBlOiBpdGVtLnR5cGUsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWRcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdClcblx0KVxuXTtcblxudHlwZSBJbmxpbmVDaGF0RWRpdG9yQXBpQXJnID0ge1xuXHRpbml0aWFsUmFuZ2U/OiB2c2NvZGUuUmFuZ2U7XG5cdGluaXRpYWxTZWxlY3Rpb24/OiB2c2NvZGUuU2VsZWN0aW9uO1xuXHRtZXNzYWdlPzogc3RyaW5nO1xuXHRhdHRhY2htZW50cz86IHZzY29kZS5VcmlbXTtcblx0YXV0b1NlbmQ/OiBib29sZWFuO1xuXHRwb3NpdGlvbj86IHZzY29kZS5Qb3NpdGlvbjtcblx0cmVzb2x2ZU9uUmVzcG9uc2U/OiBib29sZWFuO1xufTtcblxudHlwZSBJbmxpbmVDaGF0UnVuT3B0aW9ucyA9IHtcblx0aW5pdGlhbFJhbmdlPzogSVJhbmdlO1xuXHRpbml0aWFsU2VsZWN0aW9uPzogSVNlbGVjdGlvbjtcblx0bWVzc2FnZT86IHN0cmluZztcblx0YXR0YWNobWVudHM/OiBVUklbXTtcblx0YXV0b1NlbmQ/OiBib29sZWFuO1xuXHRwb3NpdGlvbj86IElQb3NpdGlvbjtcblx0cmVzb2x2ZU9uUmVzcG9uc2U/OiBib29sZWFuO1xufTtcblxuLy8jZW5kcmVnaW9uXG5cblxuLy8jcmVnaW9uIE9MRCB3b3JsZFxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdEFwaUNvbW1hbmRzIHtcblxuXHRzdGF0aWMgcmVnaXN0ZXIoY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcykge1xuXG5cdFx0bmV3Q29tbWFuZHMuZm9yRWFjaChjb21tYW5kcy5yZWdpc3RlckFwaUNvbW1hbmQsIGNvbW1hbmRzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyVmFsaWRhdGVXaGVuQ2xhdXNlc0NvbW1hbmQoY29tbWFuZHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlZ2lzdGVyVmFsaWRhdGVXaGVuQ2xhdXNlc0NvbW1hbmQoY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcykge1xuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChmYWxzZSwgJ192YWxpZGF0ZVdoZW5DbGF1c2VzJywgdmFsaWRhdGVXaGVuQ2xhdXNlcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdHJ5TWFwV2l0aDxULCBSPihmOiAoeDogVCkgPT4gUikge1xuXHRyZXR1cm4gKHZhbHVlOiBUW10pID0+IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoZik7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH07XG59XG5cbmZ1bmN0aW9uIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmsodmFsdWVzOiAobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSk6ICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVzdWx0OiAodHlwZXMuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdID0gW107XG5cdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZXMpIHtcblx0XHRpZiAobGFuZ3VhZ2VzLmlzTG9jYXRpb25MaW5rKGl0ZW0pKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh0eXBlQ29udmVydGVycy5EZWZpbml0aW9uTGluay50byhpdGVtKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKHR5cGVDb252ZXJ0ZXJzLmxvY2F0aW9uLnRvKGl0ZW0pKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsc0JBQXNCO0FBRS9CLFNB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QUFTLEVBQUU7QUFBQSxRQUNYLGFBQWEsRUFBRTtBQUFBLFFBQ2YsVUFBVSxFQUFFO0FBQUEsUUFDWixVQUFVLEVBQUUsV0FBVyxlQUFlLFNBQVMsS0FBSyxFQUFFLFFBQVEsSUFBSTtBQUFBLFFBQ2xFLG1CQUFtQixFQUFFO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLElBQ0YsaUJBQWlCO0FBQUEsRUFDbEI7QUFBQTtBQUFBLEVBRUEsSUFBSTtBQUFBLElBQ0g7QUFBQSxJQUFzQztBQUFBLElBQTZCO0FBQUEsSUFDbkUsQ0FBQztBQUFBLElBQ0QsSUFBSTtBQUFBLE1BQ0g7QUFBQSxNQUNBLENBQUMsVUFBVTtBQUNWLFlBQUksQ0FBQyxPQUFPO0FBQ1gsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFDQSxlQUFPLE1BQU0sSUFBSSxXQUFTO0FBQUEsVUFDekIsS0FBSyxJQUFJLE9BQU8sS0FBSyxHQUFHO0FBQUEsVUFDeEIsTUFBTSxLQUFLO0FBQUEsVUFDWCxhQUFhLEtBQUs7QUFBQSxRQUNuQixFQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUEyQk8sTUFBTSxtQkFBbUI7QUFBQSxFQUUvQixPQUFPLFNBQVMsVUFBMkI7QUFFMUMsZ0JBQVksUUFBUSxTQUFTLG9CQUFvQixRQUFRO0FBRXpELFNBQUssb0NBQW9DLFFBQVE7QUFBQSxFQUNsRDtBQUFBLEVBRUEsT0FBZSxvQ0FBb0MsVUFBMkI7QUFDN0UsYUFBUyxnQkFBZ0IsT0FBTyx3QkFBd0IsbUJBQW1CO0FBQUEsRUFDNUU7QUFDRDtBQUVBLFNBQVMsV0FBaUIsR0FBZ0I7QUFDekMsU0FBTyxDQUFDLFVBQWU7QUFDdEIsUUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pCLGFBQU8sTUFBTSxJQUFJLENBQUM7QUFBQSxJQUNuQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLDBCQUEwQixRQUErRztBQUNqSixNQUFJLENBQUMsTUFBTSxRQUFRLE1BQU0sR0FBRztBQUMzQixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBbUQsQ0FBQztBQUMxRCxhQUFXLFFBQVEsUUFBUTtBQUMxQixRQUFJLFVBQVUsZUFBZSxJQUFJLEdBQUc7QUFDbkMsYUFBTyxLQUFLLGVBQWUsZUFBZSxHQUFHLElBQUksQ0FBQztBQUFBLElBQ25ELE9BQU87QUFDTixhQUFPLEtBQUssZUFBZSxTQUFTLEdBQUcsSUFBSSxDQUFDO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJ2Il0KfQo=
