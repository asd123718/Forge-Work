var _a, _b, _c, _d, _e, _f, _g, _h;
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { createCancelablePromise, raceCancellation } from "../../../../base/common/async.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { isCodeEditor } from "../../../browser/editorBrowser.js";
import { EditorAction2 } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import * as corePosition from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { isLocationLink } from "../../../common/languages.js";
import { ReferencesController } from "./peek/referencesController.js";
import { ReferencesModel } from "./referencesModel.js";
import { ISymbolNavigationService } from "./symbolNavigation.js";
import { MessageController } from "../../message/browser/messageController.js";
import { PeekContext } from "../../peekView/browser/peekView.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType, TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { getDeclarationsAtPosition, getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition, getTypeDefinitionsAtPosition } from "./goToSymbol.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  submenu: MenuId.EditorContextPeek,
  title: nls.localize("peek.submenu", "Peek"),
  group: "navigation",
  order: 100
});
class SymbolNavigationAnchor {
  constructor(model, position) {
    this.model = model;
    this.position = position;
  }
  static is(thing) {
    if (!thing || typeof thing !== "object") {
      return false;
    }
    if (thing instanceof SymbolNavigationAnchor) {
      return true;
    }
    if (corePosition.Position.isIPosition(thing.position) && thing.model) {
      return true;
    }
    return false;
  }
}
const _SymbolNavigationAction = class _SymbolNavigationAction extends EditorAction2 {
  static all() {
    return _SymbolNavigationAction._allSymbolNavigationCommands.values();
  }
  static _patchConfig(opts) {
    const result = { ...opts, f1: true };
    if (result.menu) {
      for (const item of Iterable.wrap(result.menu)) {
        if (item.id === MenuId.EditorContext || item.id === MenuId.EditorContextPeek) {
          item.when = ContextKeyExpr.and(opts.precondition, item.when);
        }
      }
    }
    return result;
  }
  constructor(configuration, opts) {
    super(_SymbolNavigationAction._patchConfig(opts));
    this.configuration = configuration;
    _SymbolNavigationAction._allSymbolNavigationCommands.set(opts.id, this);
  }
  runEditorCommand(accessor, editor, arg, range) {
    if (!editor.hasModel()) {
      return Promise.resolve(void 0);
    }
    const notificationService = accessor.get(INotificationService);
    const editorService = accessor.get(ICodeEditorService);
    const progressService = accessor.get(IEditorProgressService);
    const symbolNavService = accessor.get(ISymbolNavigationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const instaService = accessor.get(IInstantiationService);
    const model = editor.getModel();
    const position = editor.getPosition();
    const anchor = SymbolNavigationAnchor.is(arg) ? arg : new SymbolNavigationAnchor(model, position);
    const cts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
    const promise = raceCancellation(this._getLocationModel(languageFeaturesService, anchor.model, anchor.position, cts.token), cts.token).then(async (references) => {
      if (!references || cts.token.isCancellationRequested) {
        return;
      }
      alert(references.ariaMessage);
      let altAction;
      if (references.referenceAt(model.uri, position)) {
        const altActionId = this._getAlternativeCommand(editor);
        if (altActionId !== void 0 && !_SymbolNavigationAction._activeAlternativeCommands.has(altActionId) && _SymbolNavigationAction._allSymbolNavigationCommands.has(altActionId)) {
          altAction = _SymbolNavigationAction._allSymbolNavigationCommands.get(altActionId);
        }
      }
      const referenceCount = references.references.length;
      if (referenceCount === 0) {
        if (!this.configuration.muteMessage) {
          const info = model.getWordAtPosition(position);
          MessageController.get(editor)?.showMessage(this._getNoResultFoundMessage(info), position);
        }
      } else if (referenceCount === 1 && altAction) {
        _SymbolNavigationAction._activeAlternativeCommands.add(this.desc.id);
        instaService.invokeFunction((accessor2) => altAction.runEditorCommand(accessor2, editor, arg, range).finally(() => {
          _SymbolNavigationAction._activeAlternativeCommands.delete(this.desc.id);
        }));
      } else {
        return this._onResult(editorService, symbolNavService, editor, references, range);
      }
    }, (err) => {
      notificationService.error(err);
    }).finally(() => {
      cts.dispose();
    });
    progressService.showWhile(promise, 250);
    return promise;
  }
  async _onResult(editorService, symbolNavService, editor, model, range) {
    const gotoLocation = this._getGoToPreference(editor);
    if (!(editor instanceof EmbeddedCodeEditorWidget) && (this.configuration.openInPeek || gotoLocation === "peek" && model.references.length > 1)) {
      this._openInPeek(editor, model, range);
    } else {
      const next = model.firstReference();
      const peek = model.references.length > 1 && gotoLocation === "gotoAndPeek";
      const targetEditor = await this._openReference(editor, editorService, next, this.configuration.openToSide, !peek);
      if (peek && targetEditor) {
        this._openInPeek(targetEditor, model, range);
      } else {
        model.dispose();
      }
      if (gotoLocation === "goto") {
        symbolNavService.put(next);
      }
    }
  }
  async _openReference(editor, editorService, reference, sideBySide, highlight) {
    let range = void 0;
    if (isLocationLink(reference)) {
      range = reference.targetSelectionRange;
    }
    if (!range) {
      range = reference.range;
    }
    if (!range) {
      return void 0;
    }
    const targetEditor = await editorService.openCodeEditor({
      resource: reference.uri,
      options: {
        selection: Range.collapseToStart(range),
        selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
        selectionSource: TextEditorSelectionSource.JUMP
      }
    }, editor, sideBySide);
    if (!targetEditor) {
      return void 0;
    }
    if (highlight) {
      const modelNow = targetEditor.getModel();
      const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: "symbol-navigate-action-highlight", className: "symbolHighlight" } }]);
      setTimeout(() => {
        if (targetEditor.getModel() === modelNow) {
          decorations.clear();
        }
      }, 350);
    }
    return targetEditor;
  }
  _openInPeek(target, model, range) {
    const controller = ReferencesController.get(target);
    if (controller && target.hasModel()) {
      controller.toggleWidget(range ?? target.getSelection(), createCancelablePromise((_) => Promise.resolve(model)), this.configuration.openInPeek);
    } else {
      model.dispose();
    }
  }
};
_SymbolNavigationAction._allSymbolNavigationCommands = /* @__PURE__ */ new Map();
_SymbolNavigationAction._activeAlternativeCommands = /* @__PURE__ */ new Set();
let SymbolNavigationAction = _SymbolNavigationAction;
class DefinitionAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, false, token), nls.localize("def.title", "Definitions"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("noResultWord", "No definition found for '{0}'", info.word) : nls.localize("generic.noResults", "No definition found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeDefinitionCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleDefinitions;
  }
}
registerAction2((_a = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _a.id,
      title: {
        ...nls.localize2("actions.goToDecl.label", "Go to Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Definition")
      },
      precondition: EditorContextKeys.hasDefinitionProvider,
      keybinding: [{
        when: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      }, {
        when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
        primary: KeyMod.CtrlCmd | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      }],
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.1
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 2
      }]
    });
    CommandsRegistry.registerCommandAlias("editor.action.goToDeclaration", _a.id);
  }
}, _a.id = "editor.action.revealDefinition", _a));
registerAction2((_b = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: true,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _b.id,
      title: nls.localize2("actions.goToDeclToSide.label", "Open Definition to the Side"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDefinitionProvider,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: [{
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F12),
        weight: KeybindingWeight.EditorContrib
      }, {
        when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.F12),
        weight: KeybindingWeight.EditorContrib
      }]
    });
    CommandsRegistry.registerCommandAlias("editor.action.openDeclarationToTheSide", _b.id);
  }
}, _b.id = "editor.action.revealDefinitionAside", _b));
registerAction2((_c = class extends DefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _c.id,
      title: nls.localize2("actions.previewDecl.label", "Peek Definition"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDefinitionProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.F12,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 },
        weight: KeybindingWeight.EditorContrib
      },
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 2
      }
    });
    CommandsRegistry.registerCommandAlias("editor.action.previewDeclaration", _c.id);
  }
}, _c.id = "editor.action.peekDefinition", _c));
class DeclarationAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, false, token), nls.localize("decl.title", "Declarations"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("decl.noResultWord", "No declaration found for '{0}'", info.word) : nls.localize("decl.generic.noResults", "No declaration found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeDeclarationCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleDeclarations;
  }
}
registerAction2((_d = class extends DeclarationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _d.id,
      title: {
        ...nls.localize2("actions.goToDeclaration.label", "Go to Declaration"),
        mnemonicTitle: nls.localize({ key: "miGotoDeclaration", comment: ["&& denotes a mnemonic"] }, "Go to &&Declaration")
      },
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDeclarationProvider,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.3
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 3
      }]
    });
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("decl.noResultWord", "No declaration found for '{0}'", info.word) : nls.localize("decl.generic.noResults", "No declaration found");
  }
}, _d.id = "editor.action.revealDeclaration", _d));
registerAction2(class PeekDeclarationAction extends DeclarationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: "editor.action.peekDeclaration",
      title: nls.localize2("actions.peekDecl.label", "Peek Declaration"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasDeclarationProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 3
      }
    });
  }
});
class TypeDefinitionAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, false, token), nls.localize("typedef.title", "Type Definitions"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("goToTypeDefinition.noResultWord", "No type definition found for '{0}'", info.word) : nls.localize("goToTypeDefinition.generic.noResults", "No type definition found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeTypeDefinitionCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleTypeDefinitions;
  }
}
registerAction2((_e = class extends TypeDefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _e.ID,
      title: {
        ...nls.localize2("actions.goToTypeDefinition.label", "Go to Type Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoTypeDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Type Definition")
      },
      precondition: EditorContextKeys.hasTypeDefinitionProvider,
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.4
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 3
      }]
    });
  }
}, _e.ID = "editor.action.goToTypeDefinition", _e));
registerAction2((_f = class extends TypeDefinitionAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _f.ID,
      title: nls.localize2("actions.peekTypeDefinition.label", "Peek Type Definition"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasTypeDefinitionProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 4
      }
    });
  }
}, _f.ID = "editor.action.peekTypeDefinition", _f));
class ImplementationAction extends SymbolNavigationAction {
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, false, token), nls.localize("impl.title", "Implementations"));
  }
  _getNoResultFoundMessage(info) {
    return info && info.word ? nls.localize("goToImplementation.noResultWord", "No implementation found for '{0}'", info.word) : nls.localize("goToImplementation.generic.noResults", "No implementation found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeImplementationCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleImplementations;
  }
}
registerAction2((_g = class extends ImplementationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: _g.ID,
      title: {
        ...nls.localize2("actions.goToImplementation.label", "Go to Implementations"),
        mnemonicTitle: nls.localize({ key: "miGotoImplementation", comment: ["&& denotes a mnemonic"] }, "Go to &&Implementations")
      },
      precondition: EditorContextKeys.hasImplementationProvider,
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.45
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 4
      }]
    });
  }
}, _g.ID = "editor.action.goToImplementation", _g));
registerAction2((_h = class extends ImplementationAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: _h.ID,
      title: nls.localize2("actions.peekImplementation.label", "Peek Implementations"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasImplementationProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 5
      }
    });
  }
}, _h.ID = "editor.action.peekImplementation", _h));
class ReferencesAction extends SymbolNavigationAction {
  _getNoResultFoundMessage(info) {
    return info ? nls.localize("references.no", "No references found for '{0}'", info.word) : nls.localize("references.noGeneric", "No references found");
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeReferenceCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleReferences;
  }
}
registerAction2(class GoToReferencesAction extends ReferencesAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: "editor.action.goToReferences",
      title: {
        ...nls.localize2("goToReferences.label", "Go to References"),
        mnemonicTitle: nls.localize({ key: "miGotoReference", comment: ["&& denotes a mnemonic"] }, "Go to &&References")
      },
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasReferenceProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyCode.F12,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.EditorContext,
        group: "navigation",
        order: 1.45
      }, {
        id: MenuId.MenubarGoMenu,
        precondition: null,
        group: "4_symbol_nav",
        order: 5
      }]
    });
  }
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, true, false, token), nls.localize("ref.title", "References"));
  }
});
registerAction2(class PeekReferencesAction extends ReferencesAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: "editor.action.referenceSearch.trigger",
      title: nls.localize2("references.action.label", "Peek References"),
      precondition: ContextKeyExpr.and(
        EditorContextKeys.hasReferenceProvider,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: {
        id: MenuId.EditorContextPeek,
        group: "peek",
        order: 6
      }
    });
  }
  async _getLocationModel(languageFeaturesService, model, position, token) {
    return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, false, token), nls.localize("ref.title", "References"));
  }
});
class GenericGoToLocationAction extends SymbolNavigationAction {
  constructor(config, _references, _gotoMultipleBehaviour) {
    super(config, {
      id: "editor.action.goToLocation",
      title: nls.localize2("label.generic", "Go to Any Symbol"),
      precondition: ContextKeyExpr.and(
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      )
    });
    this._references = _references;
    this._gotoMultipleBehaviour = _gotoMultipleBehaviour;
  }
  async _getLocationModel(languageFeaturesService, _model, _position, _token) {
    return new ReferencesModel(this._references, nls.localize("generic.title", "Locations"));
  }
  _getNoResultFoundMessage(info) {
    return info && nls.localize("generic.noResult", "No results for '{0}'", info.word) || "";
  }
  _getGoToPreference(editor) {
    return this._gotoMultipleBehaviour ?? editor.getOption(EditorOption.gotoLocation).multipleReferences;
  }
  _getAlternativeCommand() {
    return void 0;
  }
}
CommandsRegistry.registerCommand({
  id: "editor.action.goToLocations",
  metadata: {
    description: "Go to locations from a position in a file",
    args: [
      { name: "uri", description: "The text document in which to start", constraint: URI },
      { name: "position", description: "The position at which to start", constraint: corePosition.Position.isIPosition },
      { name: "locations", description: "An array of locations.", constraint: Array },
      { name: "multiple", description: "Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`" },
      { name: "noResultsMessage", description: "Human readable message that shows when locations is empty." }
    ]
  },
  handler: async (accessor, resource, position, references, multiple, noResultsMessage, openInPeek) => {
    assertType(URI.isUri(resource));
    assertType(corePosition.Position.isIPosition(position));
    assertType(Array.isArray(references));
    assertType(typeof multiple === "undefined" || typeof multiple === "string");
    assertType(typeof openInPeek === "undefined" || typeof openInPeek === "boolean");
    const editorService = accessor.get(ICodeEditorService);
    const editor = await editorService.openCodeEditor({ resource }, editorService.getFocusedCodeEditor());
    if (isCodeEditor(editor)) {
      editor.setPosition(position);
      editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
      return editor.invokeWithinContext((accessor2) => {
        const command = new class extends GenericGoToLocationAction {
          _getNoResultFoundMessage(info) {
            return noResultsMessage || super._getNoResultFoundMessage(info);
          }
        }({
          muteMessage: !Boolean(noResultsMessage),
          openInPeek: Boolean(openInPeek),
          openToSide: false
        }, references, multiple);
        accessor2.get(IInstantiationService).invokeFunction(command.run.bind(command), editor);
      });
    }
  }
});
CommandsRegistry.registerCommand({
  id: "editor.action.peekLocations",
  metadata: {
    description: "Peek locations from a position in a file",
    args: [
      { name: "uri", description: "The text document in which to start", constraint: URI },
      { name: "position", description: "The position at which to start", constraint: corePosition.Position.isIPosition },
      { name: "locations", description: "An array of locations.", constraint: Array },
      { name: "multiple", description: "Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`" }
    ]
  },
  handler: async (accessor, resource, position, references, multiple) => {
    accessor.get(ICommandService).executeCommand("editor.action.goToLocations", resource, position, references, multiple, void 0, true);
  }
});
CommandsRegistry.registerCommand({
  id: "editor.action.findReferences",
  handler: (accessor, resource, position) => {
    assertType(URI.isUri(resource));
    assertType(corePosition.Position.isIPosition(position));
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const codeEditorService = accessor.get(ICodeEditorService);
    return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then((control) => {
      if (!isCodeEditor(control) || !control.hasModel()) {
        return void 0;
      }
      const controller = ReferencesController.get(control);
      if (!controller) {
        return void 0;
      }
      const references = createCancelablePromise((token) => getReferencesAtPosition(languageFeaturesService.referenceProvider, control.getModel(), corePosition.Position.lift(position), false, false, token).then((references2) => new ReferencesModel(references2, nls.localize("ref.title", "References"))));
      const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
      return Promise.resolve(controller.toggleWidget(range, references, false));
    });
  }
});
CommandsRegistry.registerCommandAlias("editor.action.showReferences", "editor.action.peekLocations");
export {
  DefinitionAction,
  SymbolNavigationAction,
  SymbolNavigationAnchor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9TeW1ib2xcXGJyb3dzZXJcXGdvVG9Db21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JTdGF0ZUZsYWcsIEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi9lZGl0b3JTdGF0ZS9icm93c2VyL2VkaXRvclN0YXRlLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbjIsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIEdvVG9Mb2NhdGlvblZhbHVlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBjb3JlUG9zaXRpb24gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbkxpbmssIExvY2F0aW9uLCBMb2NhdGlvbkxpbmsgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFJlZmVyZW5jZXNDb250cm9sbGVyIH0gZnJvbSAnLi9wZWVrL3JlZmVyZW5jZXNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFJlZmVyZW5jZXNNb2RlbCB9IGZyb20gJy4vcmVmZXJlbmNlc01vZGVsLmpzJztcbmltcG9ydCB7IElTeW1ib2xOYXZpZ2F0aW9uU2VydmljZSB9IGZyb20gJy4vc3ltYm9sTmF2aWdhdGlvbi5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBQZWVrQ29udGV4dCB9IGZyb20gJy4uLy4uL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uMkYxUmVxdWlyZWRPcHRpb25zLCBJQWN0aW9uMk9wdGlvbnMsIElTdWJtZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSwgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IGdldERlY2xhcmF0aW9uc0F0UG9zaXRpb24sIGdldERlZmluaXRpb25zQXRQb3NpdGlvbiwgZ2V0SW1wbGVtZW50YXRpb25zQXRQb3NpdGlvbiwgZ2V0UmVmZXJlbmNlc0F0UG9zaXRpb24sIGdldFR5cGVEZWZpbml0aW9uc0F0UG9zaXRpb24gfSBmcm9tICcuL2dvVG9TeW1ib2wuanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlayxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgncGVlay5zdWJtZW51JywgXCJQZWVrXCIpLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMTAwXG59IHNhdGlzZmllcyBJU3VibWVudUl0ZW0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbE5hdmlnYXRpb25BY3Rpb25Db25maWcge1xuXHRvcGVuVG9TaWRlOiBib29sZWFuO1xuXHRvcGVuSW5QZWVrOiBib29sZWFuO1xuXHRtdXRlTWVzc2FnZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFN5bWJvbE5hdmlnYXRpb25BbmNob3Ige1xuXG5cdHN0YXRpYyBpcyh0aGluZzogYW55KTogdGhpbmcgaXMgU3ltYm9sTmF2aWdhdGlvbkFuY2hvciB7XG5cdFx0aWYgKCF0aGluZyB8fCB0eXBlb2YgdGhpbmcgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIFN5bWJvbE5hdmlnYXRpb25BbmNob3IpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY29yZVBvc2l0aW9uLlBvc2l0aW9uLmlzSVBvc2l0aW9uKCg8U3ltYm9sTmF2aWdhdGlvbkFuY2hvcj50aGluZykucG9zaXRpb24pICYmICg8U3ltYm9sTmF2aWdhdGlvbkFuY2hvcj50aGluZykubW9kZWwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBtb2RlbDogSVRleHRNb2RlbCwgcmVhZG9ubHkgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbikgeyB9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FsbFN5bWJvbE5hdmlnYXRpb25Db21tYW5kcyA9IG5ldyBNYXA8c3RyaW5nLCBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uPigpO1xuXHRwcml2YXRlIHN0YXRpYyBfYWN0aXZlQWx0ZXJuYXRpdmVDb21tYW5kcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHN0YXRpYyBhbGwoKTogSXRlcmFibGVJdGVyYXRvcjxTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uPiB7XG5cdFx0cmV0dXJuIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24uX2FsbFN5bWJvbE5hdmlnYXRpb25Db21tYW5kcy52YWx1ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9wYXRjaENvbmZpZyhvcHRzOiBJQWN0aW9uMk9wdGlvbnMgJiBJQWN0aW9uMkYxUmVxdWlyZWRPcHRpb25zKTogSUFjdGlvbjJPcHRpb25zIHtcblx0XHRjb25zdCByZXN1bHQgPSB7IC4uLm9wdHMsIGYxOiB0cnVlIH07XG5cdFx0Ly8gcGF0Y2ggY29udGV4dCBtZW51IHdoZW4gY2xhdXNlXG5cdFx0aWYgKHJlc3VsdC5tZW51KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgSXRlcmFibGUud3JhcChyZXN1bHQubWVudSkpIHtcblx0XHRcdFx0aWYgKGl0ZW0uaWQgPT09IE1lbnVJZC5FZGl0b3JDb250ZXh0IHx8IGl0ZW0uaWQgPT09IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlaykge1xuXHRcdFx0XHRcdGl0ZW0ud2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChvcHRzLnByZWNvbmRpdGlvbiwgaXRlbS53aGVuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gPHR5cGVvZiBvcHRzPnJlc3VsdDtcblx0fVxuXG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb246IFN5bWJvbE5hdmlnYXRpb25BY3Rpb25Db25maWc7XG5cblx0Y29uc3RydWN0b3IoY29uZmlndXJhdGlvbjogU3ltYm9sTmF2aWdhdGlvbkFjdGlvbkNvbmZpZywgb3B0czogSUFjdGlvbjJPcHRpb25zICYgSUFjdGlvbjJGMVJlcXVpcmVkT3B0aW9ucykge1xuXHRcdHN1cGVyKFN5bWJvbE5hdmlnYXRpb25BY3Rpb24uX3BhdGNoQ29uZmlnKG9wdHMpKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uO1xuXHRcdFN5bWJvbE5hdmlnYXRpb25BY3Rpb24uX2FsbFN5bWJvbE5hdmlnYXRpb25Db21tYW5kcy5zZXQob3B0cy5pZCwgdGhpcyk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmc/OiBTeW1ib2xOYXZpZ2F0aW9uQW5jaG9yIHwgdW5rbm93biwgcmFuZ2U/OiBSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRjb25zdCBzeW1ib2xOYXZTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTeW1ib2xOYXZpZ2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBhbmNob3IgPSBTeW1ib2xOYXZpZ2F0aW9uQW5jaG9yLmlzKGFyZykgPyBhcmcgOiBuZXcgU3ltYm9sTmF2aWdhdGlvbkFuY2hvcihtb2RlbCwgcG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5Qb3NpdGlvbik7XG5cblx0XHRjb25zdCBwcm9taXNlID0gcmFjZUNhbmNlbGxhdGlvbih0aGlzLl9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBhbmNob3IubW9kZWwsIGFuY2hvci5wb3NpdGlvbiwgY3RzLnRva2VuKSwgY3RzLnRva2VuKS50aGVuKGFzeW5jIHJlZmVyZW5jZXMgPT4ge1xuXG5cdFx0XHRpZiAoIXJlZmVyZW5jZXMgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQocmVmZXJlbmNlcy5hcmlhTWVzc2FnZSk7XG5cblx0XHRcdGxldCBhbHRBY3Rpb246IFN5bWJvbE5hdmlnYXRpb25BY3Rpb24gfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHJlZmVyZW5jZXMucmVmZXJlbmNlQXQobW9kZWwudXJpLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgYWx0QWN0aW9uSWQgPSB0aGlzLl9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yKTtcblx0XHRcdFx0aWYgKGFsdEFjdGlvbklkICE9PSB1bmRlZmluZWQgJiYgIVN5bWJvbE5hdmlnYXRpb25BY3Rpb24uX2FjdGl2ZUFsdGVybmF0aXZlQ29tbWFuZHMuaGFzKGFsdEFjdGlvbklkKSAmJiBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hbGxTeW1ib2xOYXZpZ2F0aW9uQ29tbWFuZHMuaGFzKGFsdEFjdGlvbklkKSkge1xuXHRcdFx0XHRcdGFsdEFjdGlvbiA9IFN5bWJvbE5hdmlnYXRpb25BY3Rpb24uX2FsbFN5bWJvbE5hdmlnYXRpb25Db21tYW5kcy5nZXQoYWx0QWN0aW9uSWQpITtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWZlcmVuY2VDb3VudCA9IHJlZmVyZW5jZXMucmVmZXJlbmNlcy5sZW5ndGg7XG5cblx0XHRcdGlmIChyZWZlcmVuY2VDb3VudCA9PT0gMCkge1xuXHRcdFx0XHQvLyBubyByZXN1bHQgLT4gc2hvdyBtZXNzYWdlXG5cdFx0XHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uLm11dGVNZXNzYWdlKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5mbyA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2hvd01lc3NhZ2UodGhpcy5fZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbyksIHBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChyZWZlcmVuY2VDb3VudCA9PT0gMSAmJiBhbHRBY3Rpb24pIHtcblx0XHRcdFx0Ly8gYWxyZWFkeSBhdCB0aGUgb25seSByZXN1bHQsIHJ1biBhbHRlcm5hdGl2ZVxuXHRcdFx0XHRTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hY3RpdmVBbHRlcm5hdGl2ZUNvbW1hbmRzLmFkZCh0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHRpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiBhbHRBY3Rpb24ucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZWRpdG9yLCBhcmcsIHJhbmdlKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uLl9hY3RpdmVBbHRlcm5hdGl2ZUNvbW1hbmRzLmRlbGV0ZSh0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5vcm1hbCByZXN1bHRzIGhhbmRsaW5nXG5cdFx0XHRcdHJldHVybiB0aGlzLl9vblJlc3VsdChlZGl0b3JTZXJ2aWNlLCBzeW1ib2xOYXZTZXJ2aWNlLCBlZGl0b3IsIHJlZmVyZW5jZXMsIHJhbmdlKTtcblx0XHRcdH1cblxuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdC8vIHJlcG9ydCBhbiBlcnJvclxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHByb2dyZXNzU2VydmljZS5zaG93V2hpbGUocHJvbWlzZSwgMjUwKTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWwgfCB1bmRlZmluZWQ+O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZztcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldEFsdGVybmF0aXZlQ29tbWFuZChlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IEdvVG9Mb2NhdGlvblZhbHVlcztcblxuXHRwcml2YXRlIGFzeW5jIF9vblJlc3VsdChlZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsIHN5bWJvbE5hdlNlcnZpY2U6IElTeW1ib2xOYXZpZ2F0aW9uU2VydmljZSwgZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgbW9kZWw6IFJlZmVyZW5jZXNNb2RlbCwgcmFuZ2U/OiBSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgZ290b0xvY2F0aW9uID0gdGhpcy5fZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yKTtcblx0XHRpZiAoIShlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpICYmICh0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkluUGVlayB8fCAoZ290b0xvY2F0aW9uID09PSAncGVlaycgJiYgbW9kZWwucmVmZXJlbmNlcy5sZW5ndGggPiAxKSkpIHtcblx0XHRcdHRoaXMuX29wZW5JblBlZWsoZWRpdG9yLCBtb2RlbCwgcmFuZ2UpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5leHQgPSBtb2RlbC5maXJzdFJlZmVyZW5jZSgpITtcblx0XHRcdGNvbnN0IHBlZWsgPSBtb2RlbC5yZWZlcmVuY2VzLmxlbmd0aCA+IDEgJiYgZ290b0xvY2F0aW9uID09PSAnZ290b0FuZFBlZWsnO1xuXHRcdFx0Y29uc3QgdGFyZ2V0RWRpdG9yID0gYXdhaXQgdGhpcy5fb3BlblJlZmVyZW5jZShlZGl0b3IsIGVkaXRvclNlcnZpY2UsIG5leHQsIHRoaXMuY29uZmlndXJhdGlvbi5vcGVuVG9TaWRlLCAhcGVlayk7XG5cdFx0XHRpZiAocGVlayAmJiB0YXJnZXRFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fb3BlbkluUGVlayh0YXJnZXRFZGl0b3IsIG1vZGVsLCByYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGtlZXAgcmVtYWluaW5nIGxvY2F0aW9ucyBhcm91bmQgd2hlbiB1c2luZ1xuXHRcdFx0Ly8gJ2dvdG8nLW1vZGVcblx0XHRcdGlmIChnb3RvTG9jYXRpb24gPT09ICdnb3RvJykge1xuXHRcdFx0XHRzeW1ib2xOYXZTZXJ2aWNlLnB1dChuZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuUmVmZXJlbmNlKGVkaXRvcjogSUNvZGVFZGl0b3IsIGVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSwgcmVmZXJlbmNlOiBMb2NhdGlvbiB8IExvY2F0aW9uTGluaywgc2lkZUJ5U2lkZTogYm9vbGVhbiwgaGlnaGxpZ2h0OiBib29sZWFuKTogUHJvbWlzZTxJQ29kZUVkaXRvciB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIHJhbmdlIGlzIHRoZSB0YXJnZXQtc2VsZWN0aW9uLXJhbmdlIHdoZW4gd2UgaGF2ZSBvbmVcblx0XHQvLyBhbmQgdGhlIGZhbGxiYWNrIGlzIHRoZSAnZnVsbCcgcmFuZ2Vcblx0XHRsZXQgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNMb2NhdGlvbkxpbmsocmVmZXJlbmNlKSkge1xuXHRcdFx0cmFuZ2UgPSByZWZlcmVuY2UudGFyZ2V0U2VsZWN0aW9uUmFuZ2U7XG5cdFx0fVxuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJhbmdlID0gcmVmZXJlbmNlLnJhbmdlO1xuXHRcdH1cblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldEVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHJlZmVyZW5jZS51cmksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHNlbGVjdGlvbjogUmFuZ2UuY29sbGFwc2VUb1N0YXJ0KHJhbmdlKSxcblx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0XHRzZWxlY3Rpb25Tb3VyY2U6IFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuSlVNUFxuXHRcdFx0fVxuXHRcdH0sIGVkaXRvciwgc2lkZUJ5U2lkZSk7XG5cblx0XHRpZiAoIXRhcmdldEVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaGlnaGxpZ2h0KSB7XG5cdFx0XHRjb25zdCBtb2RlbE5vdyA9IHRhcmdldEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0YXJnZXRFZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKFt7IHJhbmdlLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAnc3ltYm9sLW5hdmlnYXRlLWFjdGlvbi1oaWdobGlnaHQnLCBjbGFzc05hbWU6ICdzeW1ib2xIaWdobGlnaHQnIH0gfV0pO1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0YXJnZXRFZGl0b3IuZ2V0TW9kZWwoKSA9PT0gbW9kZWxOb3cpIHtcblx0XHRcdFx0XHRkZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAzNTApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0YXJnZXRFZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuSW5QZWVrKHRhcmdldDogSUNvZGVFZGl0b3IsIG1vZGVsOiBSZWZlcmVuY2VzTW9kZWwsIHJhbmdlPzogUmFuZ2UpIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gUmVmZXJlbmNlc0NvbnRyb2xsZXIuZ2V0KHRhcmdldCk7XG5cdFx0aWYgKGNvbnRyb2xsZXIgJiYgdGFyZ2V0Lmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnRyb2xsZXIudG9nZ2xlV2lkZ2V0KHJhbmdlID8/IHRhcmdldC5nZXRTZWxlY3Rpb24oKSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoXyA9PiBQcm9taXNlLnJlc29sdmUobW9kZWwpKSwgdGhpcy5jb25maWd1cmF0aW9uLm9wZW5JblBlZWspO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbi8vI3JlZ2lvbiAtLS0gREVGSU5JVElPTlxuXG5leHBvcnQgY2xhc3MgRGVmaW5pdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWw+IHtcblx0XHRyZXR1cm4gbmV3IFJlZmVyZW5jZXNNb2RlbChhd2FpdCBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGZhbHNlLCB0b2tlbiksIG5scy5sb2NhbGl6ZSgnZGVmLnRpdGxlJywgJ0RlZmluaXRpb25zJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdub1Jlc3VsdFdvcmQnLCBcIk5vIGRlZmluaXRpb24gZm91bmQgZm9yICd7MH0nXCIsIGluZm8ud29yZClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdnZW5lcmljLm5vUmVzdWx0cycsIFwiTm8gZGVmaW5pdGlvbiBmb3VuZFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLmFsdGVybmF0aXZlRGVmaW5pdGlvbkNvbW1hbmQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBHb1RvTG9jYXRpb25WYWx1ZXMge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLm11bHRpcGxlRGVmaW5pdGlvbnM7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9EZWZpbml0aW9uQWN0aW9uIGV4dGVuZHMgRGVmaW5pdGlvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2VkaXRvci5hY3Rpb24ucmV2ZWFsRGVmaW5pdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBHb1RvRGVmaW5pdGlvbkFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuZ29Ub0RlY2wubGFiZWwnLCBcIkdvIHRvIERlZmluaXRpb25cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b0RlZmluaXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZEZWZpbml0aW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaGFzRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYxMixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cywgSXNXZWJDb250ZXh0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkYxMixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1dLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS4xXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckdvTWVudSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBudWxsLFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFsaWFzKCdlZGl0b3IuYWN0aW9uLmdvVG9EZWNsYXJhdGlvbicsIEdvVG9EZWZpbml0aW9uQWN0aW9uLmlkKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuRGVmaW5pdGlvblRvU2lkZUFjdGlvbiBleHRlbmRzIERlZmluaXRpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdlZGl0b3IuYWN0aW9uLnJldmVhbERlZmluaXRpb25Bc2lkZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogdHJ1ZSxcblx0XHRcdG9wZW5JblBlZWs6IGZhbHNlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IE9wZW5EZWZpbml0aW9uVG9TaWRlQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuZ29Ub0RlY2xUb1NpZGUubGFiZWwnLCBcIk9wZW4gRGVmaW5pdGlvbiB0byB0aGUgU2lkZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNEZWZpbml0aW9uUHJvdmlkZXIsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKSksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLkYxMiksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIElzV2ViQ29udGV4dCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjEyKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1dXG5cdFx0fSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnZWRpdG9yLmFjdGlvbi5vcGVuRGVjbGFyYXRpb25Ub1RoZVNpZGUnLCBPcGVuRGVmaW5pdGlvblRvU2lkZUFjdGlvbi5pZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUGVla0RlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBEZWZpbml0aW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnZWRpdG9yLmFjdGlvbi5wZWVrRGVmaW5pdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFBlZWtEZWZpbml0aW9uQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMucHJldmlld0RlY2wubGFiZWwnLCBcIlBlZWsgRGVmaW5pdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNEZWZpbml0aW9uUHJvdmlkZXIsXG5cdFx0XHRcdFBlZWtDb250ZXh0Lm5vdEluUGVla0VkaXRvcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkYxMixcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYxMCB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlayxcblx0XHRcdFx0Z3JvdXA6ICdwZWVrJyxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH1cblx0XHR9KTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFsaWFzKCdlZGl0b3IuYWN0aW9uLnByZXZpZXdEZWNsYXJhdGlvbicsIFBlZWtEZWZpbml0aW9uQWN0aW9uLmlkKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gLS0tIERFQ0xBUkFUSU9OXG5cbmNsYXNzIERlY2xhcmF0aW9uQWN0aW9uIGV4dGVuZHMgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbiB7XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogY29yZVBvc2l0aW9uLlBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbD4ge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKGF3YWl0IGdldERlY2xhcmF0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVjbGFyYXRpb25Qcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBmYWxzZSwgdG9rZW4pLCBubHMubG9jYWxpemUoJ2RlY2wudGl0bGUnLCAnRGVjbGFyYXRpb25zJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdkZWNsLm5vUmVzdWx0V29yZCcsIFwiTm8gZGVjbGFyYXRpb24gZm91bmQgZm9yICd7MH0nXCIsIGluZm8ud29yZClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdkZWNsLmdlbmVyaWMubm9SZXN1bHRzJywgXCJObyBkZWNsYXJhdGlvbiBmb3VuZFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLmFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5tdWx0aXBsZURlY2xhcmF0aW9ucztcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29Ub0RlY2xhcmF0aW9uQWN0aW9uIGV4dGVuZHMgRGVjbGFyYXRpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdlZGl0b3IuYWN0aW9uLnJldmVhbERlY2xhcmF0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IGZhbHNlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IEdvVG9EZWNsYXJhdGlvbkFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuZ29Ub0RlY2xhcmF0aW9uLmxhYmVsJywgXCJHbyB0byBEZWNsYXJhdGlvblwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvRGVjbGFyYXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZEZWNsYXJhdGlvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzRGVjbGFyYXRpb25Qcm92aWRlcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS4zXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckdvTWVudSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBudWxsLFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpbmZvICYmIGluZm8ud29yZFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2RlY2wubm9SZXN1bHRXb3JkJywgXCJObyBkZWNsYXJhdGlvbiBmb3VuZCBmb3IgJ3swfSdcIiwgaW5mby53b3JkKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2RlY2wuZ2VuZXJpYy5ub1Jlc3VsdHMnLCBcIk5vIGRlY2xhcmF0aW9uIGZvdW5kXCIpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFBlZWtEZWNsYXJhdGlvbkFjdGlvbiBleHRlbmRzIERlY2xhcmF0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnBlZWtEZWNsYXJhdGlvbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWN0aW9ucy5wZWVrRGVjbC5sYWJlbCcsIFwiUGVlayBEZWNsYXJhdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNEZWNsYXJhdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlayxcblx0XHRcdFx0Z3JvdXA6ICdwZWVrJyxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gLS0tIFRZUEUgREVGSU5JVElPTlxuXG5jbGFzcyBUeXBlRGVmaW5pdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0TG9jYXRpb25Nb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWw+IHtcblx0XHRyZXR1cm4gbmV3IFJlZmVyZW5jZXNNb2RlbChhd2FpdCBnZXRUeXBlRGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnR5cGVEZWZpbml0aW9uUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgZmFsc2UsIHRva2VuKSwgbmxzLmxvY2FsaXplKCd0eXBlZGVmLnRpdGxlJywgJ1R5cGUgRGVmaW5pdGlvbnMnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpbmZvICYmIGluZm8ud29yZFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2dvVG9UeXBlRGVmaW5pdGlvbi5ub1Jlc3VsdFdvcmQnLCBcIk5vIHR5cGUgZGVmaW5pdGlvbiBmb3VuZCBmb3IgJ3swfSdcIiwgaW5mby53b3JkKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2dvVG9UeXBlRGVmaW5pdGlvbi5nZW5lcmljLm5vUmVzdWx0cycsIFwiTm8gdHlwZSBkZWZpbml0aW9uIGZvdW5kXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikuYWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBHb1RvTG9jYXRpb25WYWx1ZXMge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLm11bHRpcGxlVHlwZURlZmluaXRpb25zO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvVHlwZURlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBUeXBlRGVmaW5pdGlvbkFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmdvVG9UeXBlRGVmaW5pdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBHb1RvVHlwZURlZmluaXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdhY3Rpb25zLmdvVG9UeXBlRGVmaW5pdGlvbi5sYWJlbCcsIFwiR28gdG8gVHlwZSBEZWZpbml0aW9uXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9UeXBlRGVmaW5pdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJlR5cGUgRGVmaW5pdGlvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXIsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjRcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyR29NZW51LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IG51bGwsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFBlZWtUeXBlRGVmaW5pdGlvbkFjdGlvbiBleHRlbmRzIFR5cGVEZWZpbml0aW9uQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24ucGVla1R5cGVEZWZpbml0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IHRydWUsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogUGVla1R5cGVEZWZpbml0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMucGVla1R5cGVEZWZpbml0aW9uLmxhYmVsJywgXCJQZWVrIFR5cGUgRGVmaW5pdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlayxcblx0XHRcdFx0Z3JvdXA6ICdwZWVrJyxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gLS0tIElNUExFTUVOVEFUSU9OXG5cbmNsYXNzIEltcGxlbWVudGF0aW9uQWN0aW9uIGV4dGVuZHMgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbiB7XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogY29yZVBvc2l0aW9uLlBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbD4ge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKGF3YWl0IGdldEltcGxlbWVudGF0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW1wbGVtZW50YXRpb25Qcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBmYWxzZSwgdG9rZW4pLCBubHMubG9jYWxpemUoJ2ltcGwudGl0bGUnLCAnSW1wbGVtZW50YXRpb25zJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvOiBJV29yZEF0UG9zaXRpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5mbyAmJiBpbmZvLndvcmRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdnb1RvSW1wbGVtZW50YXRpb24ubm9SZXN1bHRXb3JkJywgXCJObyBpbXBsZW1lbnRhdGlvbiBmb3VuZCBmb3IgJ3swfSdcIiwgaW5mby53b3JkKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2dvVG9JbXBsZW1lbnRhdGlvbi5nZW5lcmljLm5vUmVzdWx0cycsIFwiTm8gaW1wbGVtZW50YXRpb24gZm91bmRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEFsdGVybmF0aXZlQ29tbWFuZChlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5hbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IEdvVG9Mb2NhdGlvblZhbHVlcyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikubXVsdGlwbGVJbXBsZW1lbnRhdGlvbnM7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9JbXBsZW1lbnRhdGlvbkFjdGlvbiBleHRlbmRzIEltcGxlbWVudGF0aW9uQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uZ29Ub0ltcGxlbWVudGF0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IGZhbHNlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IEdvVG9JbXBsZW1lbnRhdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuZ29Ub0ltcGxlbWVudGF0aW9uLmxhYmVsJywgXCJHbyB0byBJbXBsZW1lbnRhdGlvbnNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b0ltcGxlbWVudGF0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmSW1wbGVtZW50YXRpb25zXCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlcixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjEyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuNDVcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyR29NZW51LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IG51bGwsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFBlZWtJbXBsZW1lbnRhdGlvbkFjdGlvbiBleHRlbmRzIEltcGxlbWVudGF0aW9uQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24ucGVla0ltcGxlbWVudGF0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IHRydWUsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogUGVla0ltcGxlbWVudGF0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMucGVla0ltcGxlbWVudGF0aW9uLmxhYmVsJywgXCJQZWVrIEltcGxlbWVudGF0aW9uc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNJbXBsZW1lbnRhdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjEyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0UGVlayxcblx0XHRcdFx0Z3JvdXA6ICdwZWVrJyxcblx0XHRcdFx0b3JkZXI6IDVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gLS0tIFJFRkVSRU5DRVNcblxuYWJzdHJhY3QgY2xhc3MgUmVmZXJlbmNlc0FjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGluZm9cblx0XHRcdD8gbmxzLmxvY2FsaXplKCdyZWZlcmVuY2VzLm5vJywgXCJObyByZWZlcmVuY2VzIGZvdW5kIGZvciAnezB9J1wiLCBpbmZvLndvcmQpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgncmVmZXJlbmNlcy5ub0dlbmVyaWMnLCBcIk5vIHJlZmVyZW5jZXMgZm91bmRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEFsdGVybmF0aXZlQ29tbWFuZChlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5hbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEdvVG9QcmVmZXJlbmNlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBHb1RvTG9jYXRpb25WYWx1ZXMge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLm11bHRpcGxlUmVmZXJlbmNlcztcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29Ub1JlZmVyZW5jZXNBY3Rpb24gZXh0ZW5kcyBSZWZlcmVuY2VzQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IGZhbHNlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmdvVG9SZWZlcmVuY2VzJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2dvVG9SZWZlcmVuY2VzLmxhYmVsJywgXCJHbyB0byBSZWZlcmVuY2VzXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9SZWZlcmVuY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZSZWZlcmVuY2VzXCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNSZWZlcmVuY2VQcm92aWRlcixcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GMTIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS40NVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJHb01lbnUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogbnVsbCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsPiB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoYXdhaXQgZ2V0UmVmZXJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgdHJ1ZSwgZmFsc2UsIHRva2VuKSwgbmxzLmxvY2FsaXplKCdyZWYudGl0bGUnLCAnUmVmZXJlbmNlcycpKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQZWVrUmVmZXJlbmNlc0FjdGlvbiBleHRlbmRzIFJlZmVyZW5jZXNBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogdHJ1ZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZWZlcmVuY2VTZWFyY2gudHJpZ2dlcicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncmVmZXJlbmNlcy5hY3Rpb24ubGFiZWwnLCBcIlBlZWsgUmVmZXJlbmNlc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNSZWZlcmVuY2VQcm92aWRlcixcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFBlZWssXG5cdFx0XHRcdGdyb3VwOiAncGVlaycsXG5cdFx0XHRcdG9yZGVyOiA2XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBjb3JlUG9zaXRpb24uUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsPiB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoYXdhaXQgZ2V0UmVmZXJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgZmFsc2UsIGZhbHNlLCB0b2tlbiksIG5scy5sb2NhbGl6ZSgncmVmLnRpdGxlJywgJ1JlZmVyZW5jZXMnKSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuXG4vLyNyZWdpb24gLS0tIEdFTkVSSUMgZ290byBzeW1ib2xzIGNvbW1hbmRcblxuY2xhc3MgR2VuZXJpY0dvVG9Mb2NhdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZzogU3ltYm9sTmF2aWdhdGlvbkFjdGlvbkNvbmZpZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWZlcmVuY2VzOiBMb2NhdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dvdG9NdWx0aXBsZUJlaGF2aW91cjogR29Ub0xvY2F0aW9uVmFsdWVzIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRzdXBlcihjb25maWcsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5nb1RvTG9jYXRpb24nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2xhYmVsLmdlbmVyaWMnLCBcIkdvIHRvIEFueSBTeW1ib2xcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgX21vZGVsOiBJVGV4dE1vZGVsLCBfcG9zaXRpb246IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwodGhpcy5fcmVmZXJlbmNlcywgbmxzLmxvY2FsaXplKCdnZW5lcmljLnRpdGxlJywgJ0xvY2F0aW9ucycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoaW5mbzogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGluZm8gJiYgbmxzLmxvY2FsaXplKCdnZW5lcmljLm5vUmVzdWx0JywgXCJObyByZXN1bHRzIGZvciAnezB9J1wiLCBpbmZvLndvcmQpIHx8ICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gdGhpcy5fZ290b011bHRpcGxlQmVoYXZpb3VyID8/IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikubXVsdGlwbGVSZWZlcmVuY2VzO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdlZGl0b3IuYWN0aW9uLmdvVG9Mb2NhdGlvbnMnLFxuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiAnR28gdG8gbG9jYXRpb25zIGZyb20gYSBwb3NpdGlvbiBpbiBhIGZpbGUnLFxuXHRcdGFyZ3M6IFtcblx0XHRcdHsgbmFtZTogJ3VyaScsIGRlc2NyaXB0aW9uOiAnVGhlIHRleHQgZG9jdW1lbnQgaW4gd2hpY2ggdG8gc3RhcnQnLCBjb25zdHJhaW50OiBVUkkgfSxcblx0XHRcdHsgbmFtZTogJ3Bvc2l0aW9uJywgZGVzY3JpcHRpb246ICdUaGUgcG9zaXRpb24gYXQgd2hpY2ggdG8gc3RhcnQnLCBjb25zdHJhaW50OiBjb3JlUG9zaXRpb24uUG9zaXRpb24uaXNJUG9zaXRpb24gfSxcblx0XHRcdHsgbmFtZTogJ2xvY2F0aW9ucycsIGRlc2NyaXB0aW9uOiAnQW4gYXJyYXkgb2YgbG9jYXRpb25zLicsIGNvbnN0cmFpbnQ6IEFycmF5IH0sXG5cdFx0XHR7IG5hbWU6ICdtdWx0aXBsZScsIGRlc2NyaXB0aW9uOiAnRGVmaW5lIHdoYXQgdG8gZG8gd2hlbiBoYXZpbmcgbXVsdGlwbGUgcmVzdWx0cywgZWl0aGVyIGBwZWVrYCwgYGdvdG9BbmRQZWVrYCwgb3IgYGdvdG9gJyB9LFxuXHRcdFx0eyBuYW1lOiAnbm9SZXN1bHRzTWVzc2FnZScsIGRlc2NyaXB0aW9uOiAnSHVtYW4gcmVhZGFibGUgbWVzc2FnZSB0aGF0IHNob3dzIHdoZW4gbG9jYXRpb25zIGlzIGVtcHR5LicgfSxcblx0XHRdXG5cdH0sXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IGFueSwgcG9zaXRpb246IGFueSwgcmVmZXJlbmNlczogYW55LCBtdWx0aXBsZT86IGFueSwgbm9SZXN1bHRzTWVzc2FnZT86IHN0cmluZywgb3BlbkluUGVlaz86IGJvb2xlYW4pID0+IHtcblx0XHRhc3NlcnRUeXBlKFVSSS5pc1VyaShyZXNvdXJjZSkpO1xuXHRcdGFzc2VydFR5cGUoY29yZVBvc2l0aW9uLlBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvc2l0aW9uKSk7XG5cdFx0YXNzZXJ0VHlwZShBcnJheS5pc0FycmF5KHJlZmVyZW5jZXMpKTtcblx0XHRhc3NlcnRUeXBlKHR5cGVvZiBtdWx0aXBsZSA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIG11bHRpcGxlID09PSAnc3RyaW5nJyk7XG5cdFx0YXNzZXJ0VHlwZSh0eXBlb2Ygb3BlbkluUGVlayA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIG9wZW5JblBlZWsgPT09ICdib29sZWFuJyk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcih7IHJlc291cmNlIH0sIGVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSk7XG5cblx0XHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvcikpIHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRlZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cblx0XHRcdHJldHVybiBlZGl0b3IuaW52b2tlV2l0aGluQ29udGV4dChhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBHZW5lcmljR29Ub0xvY2F0aW9uQWN0aW9uIHtcblx0XHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKGluZm86IElXb3JkQXRQb3NpdGlvbiB8IG51bGwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBub1Jlc3VsdHNNZXNzYWdlIHx8IHN1cGVyLl9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZShpbmZvKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oe1xuXHRcdFx0XHRcdG11dGVNZXNzYWdlOiAhQm9vbGVhbihub1Jlc3VsdHNNZXNzYWdlKSxcblx0XHRcdFx0XHRvcGVuSW5QZWVrOiBCb29sZWFuKG9wZW5JblBlZWspLFxuXHRcdFx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlXG5cdFx0XHRcdH0sIHJlZmVyZW5jZXMsIG11bHRpcGxlIGFzIEdvVG9Mb2NhdGlvblZhbHVlcyk7XG5cblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuaW52b2tlRnVuY3Rpb24oY29tbWFuZC5ydW4uYmluZChjb21tYW5kKSwgZWRpdG9yKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdlZGl0b3IuYWN0aW9uLnBlZWtMb2NhdGlvbnMnLFxuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiAnUGVlayBsb2NhdGlvbnMgZnJvbSBhIHBvc2l0aW9uIGluIGEgZmlsZScsXG5cdFx0YXJnczogW1xuXHRcdFx0eyBuYW1lOiAndXJpJywgZGVzY3JpcHRpb246ICdUaGUgdGV4dCBkb2N1bWVudCBpbiB3aGljaCB0byBzdGFydCcsIGNvbnN0cmFpbnQ6IFVSSSB9LFxuXHRcdFx0eyBuYW1lOiAncG9zaXRpb24nLCBkZXNjcmlwdGlvbjogJ1RoZSBwb3NpdGlvbiBhdCB3aGljaCB0byBzdGFydCcsIGNvbnN0cmFpbnQ6IGNvcmVQb3NpdGlvbi5Qb3NpdGlvbi5pc0lQb3NpdGlvbiB9LFxuXHRcdFx0eyBuYW1lOiAnbG9jYXRpb25zJywgZGVzY3JpcHRpb246ICdBbiBhcnJheSBvZiBsb2NhdGlvbnMuJywgY29uc3RyYWludDogQXJyYXkgfSxcblx0XHRcdHsgbmFtZTogJ211bHRpcGxlJywgZGVzY3JpcHRpb246ICdEZWZpbmUgd2hhdCB0byBkbyB3aGVuIGhhdmluZyBtdWx0aXBsZSByZXN1bHRzLCBlaXRoZXIgYHBlZWtgLCBgZ290b0FuZFBlZWtgLCBvciBgZ290b2AnIH0sXG5cdFx0XVxuXHR9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBhbnksIHBvc2l0aW9uOiBhbnksIHJlZmVyZW5jZXM6IGFueSwgbXVsdGlwbGU/OiBhbnkpID0+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnZWRpdG9yLmFjdGlvbi5nb1RvTG9jYXRpb25zJywgcmVzb3VyY2UsIHBvc2l0aW9uLCByZWZlcmVuY2VzLCBtdWx0aXBsZSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG5cbi8vI3JlZ2lvbiAtLS0gUkVGRVJFTkNFIHNlYXJjaCBzcGVjaWFsIGNvbW1hbmRzXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdlZGl0b3IuYWN0aW9uLmZpbmRSZWZlcmVuY2VzJyxcblx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogYW55LCBwb3NpdGlvbjogYW55KSA9PiB7XG5cdFx0YXNzZXJ0VHlwZShVUkkuaXNVcmkocmVzb3VyY2UpKTtcblx0XHRhc3NlcnRUeXBlKGNvcmVQb3NpdGlvbi5Qb3NpdGlvbi5pc0lQb3NpdGlvbihwb3NpdGlvbikpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdHJldHVybiBjb2RlRWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcih7IHJlc291cmNlIH0sIGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkpLnRoZW4oY29udHJvbCA9PiB7XG5cdFx0XHRpZiAoIWlzQ29kZUVkaXRvcihjb250cm9sKSB8fCAhY29udHJvbC5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBSZWZlcmVuY2VzQ29udHJvbGxlci5nZXQoY29udHJvbCk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVmZXJlbmNlcyA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBjb250cm9sLmdldE1vZGVsKCksIGNvcmVQb3NpdGlvbi5Qb3NpdGlvbi5saWZ0KHBvc2l0aW9uKSwgZmFsc2UsIGZhbHNlLCB0b2tlbikudGhlbihyZWZlcmVuY2VzID0+IG5ldyBSZWZlcmVuY2VzTW9kZWwocmVmZXJlbmNlcywgbmxzLmxvY2FsaXplKCdyZWYudGl0bGUnLCAnUmVmZXJlbmNlcycpKSkpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjb250cm9sbGVyLnRvZ2dsZVdpZGdldChyYW5nZSwgcmVmZXJlbmNlcywgZmFsc2UpKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbi8vIHVzZSBORVcgY29tbWFuZFxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnZWRpdG9yLmFjdGlvbi5zaG93UmVmZXJlbmNlcycsICdlZGl0b3IuYWN0aW9uLnBlZWtMb2NhdGlvbnMnKTtcblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFBQTtBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5Qix3QkFBd0I7QUFFMUQsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUIsMENBQTBDO0FBQ3hFLFNBQXlDLG9CQUFvQjtBQUM3RCxTQUFTLHFCQUF1QztBQUNoRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUF3QztBQUNqRCxZQUFZLGtCQUFrQjtBQUM5QixTQUFpQixhQUFhO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsc0JBQThDO0FBQ3ZELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksU0FBUztB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
