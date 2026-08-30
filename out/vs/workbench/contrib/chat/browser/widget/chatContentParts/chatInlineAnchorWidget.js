var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var _a, _b, _c, _d, _e, _f, _g;
import "./media/chatInlineAnchorWidget.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { SymbolKinds } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefinitionAction } from "../../../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import * as nls from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { FileKind, IFileService } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { FolderThemeIcon, IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { fillEditorsDragData } from "../../../../../browser/dnd.js";
import { StaticResourceContextKey } from "../../../../../common/contextkeys.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { INotebookDocumentService } from "../../../../../services/notebook/common/notebookDocumentService.js";
import { ExplorerFolderContext } from "../../../../files/common/files.js";
import { IChatWidgetService } from "../../chat.js";
import { IChatImageCarouselService } from "../../chatImageCarouselService.js";
import { chatAttachmentResourceContextKey, hookUpSymbolAttachmentDragAndContextMenu } from "../../attachments/chatAttachmentWidgets.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { getMediaMime } from "../../../../../../base/common/mime.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { BrowserEditorInput } from "../../../../browserView/common/browserEditorInput.js";
import { getEditorOverrideForChatResource } from "../chatEditorAssociations.js";
function renderFileWidgets(element, instantiationService, chatMarkdownAnchorService, disposables, options) {
  const links = element.querySelectorAll("a");
  links.forEach((a) => {
    const linkText = a.textContent?.trim();
    let shouldRenderWidget = false;
    let metadata;
    const href = a.getAttribute("data-href");
    let uri;
    if (href) {
      try {
        uri = URI.parse(href);
      } catch {
      }
    }
    if (!linkText) {
      shouldRenderWidget = true;
    } else if (uri) {
      const searchParams = new URLSearchParams(uri.query);
      const vscodeLinkType = searchParams.get("vscodeLinkType");
      if (vscodeLinkType) {
        metadata = {
          vscodeLinkType,
          linkText
        };
        shouldRenderWidget = true;
        searchParams.delete("vscodeLinkType");
        const remainingQuery = searchParams.toString();
        uri = uri.with({ query: remainingQuery });
      }
    }
    if (shouldRenderWidget && uri?.scheme) {
      const widget = instantiationService.createInstance(InlineAnchorWidget, a, { kind: "inlineReference", inlineReference: uri }, metadata, options);
      disposables.add(chatMarkdownAnchorService.register(widget));
      disposables.add(widget);
    }
  });
}
let InlineAnchorWidget = class extends Disposable {
  constructor(element, inlineReference, metadata, options, chatImageCarouselService, configurationService, originalContextKeyService, contextMenuService, fileService, hoverService, instantiationService, labelService, languageService, menuService, modelService, telemetryService, themeService, notebookDocumentService, openerService, editorService) {
    super();
    this.element = element;
    this.inlineReference = inlineReference;
    this.metadata = metadata;
    this.options = options;
    this.chatImageCarouselService = chatImageCarouselService;
    this.configurationService = configurationService;
    this.notebookDocumentService = notebookDocumentService;
    this.openerService = openerService;
    this.editorService = editorService;
    this.data = "uri" in inlineReference.inlineReference ? inlineReference.inlineReference : "name" in inlineReference.inlineReference ? { kind: "symbol", symbol: inlineReference.inlineReference } : { uri: inlineReference.inlineReference };
    element.classList.add(InlineAnchorWidget.className, "show-file-icons");
    let iconText;
    let iconClasses;
    let location;
    if (this.data.kind === "symbol") {
      const symbol = this.data.symbol;
      location = this.data.symbol.location;
      iconText = [this.data.symbol.name];
      iconClasses = ["codicon", ...getIconClasses(modelService, languageService, void 0, void 0, SymbolKinds.toIcon(symbol.kind))];
      this._store.add(instantiationService.invokeFunction((accessor) => hookUpSymbolAttachmentDragAndContextMenu(accessor, element, originalContextKeyService, { value: symbol.location, name: symbol.name, kind: symbol.kind }, MenuId.ChatInlineSymbolAnchorContext)));
    } else {
      location = this.data;
      const filePathLabel = this.metadata?.linkText ?? labelService.getUriBasenameLabel(location.uri);
      let defaultIcon;
      if (location.range && this.data.kind !== "symbol") {
        const suffix = location.range.startLineNumber === location.range.endLineNumber ? `:${location.range.startLineNumber}` : `:${location.range.startLineNumber}-${location.range.endLineNumber}`;
        iconText = [filePathLabel, dom.$("span.label-suffix", void 0, suffix)];
      } else if (location.uri.scheme === "vscode-notebook-cell" && this.data.kind !== "symbol") {
        iconText = [`${filePathLabel} \u2022 cell${this.getCellIndex(location.uri)}`];
      } else if (location.uri.scheme === Schemas.vscodeBrowser) {
        defaultIcon = Codicon.globe;
        const editorName = this.editorService.findEditors(location.uri)[0]?.editor?.getName() ?? BrowserEditorInput.DEFAULT_LABEL;
        iconText = [editorName];
      } else {
        iconText = [filePathLabel];
      }
      let fileKind = location.uri.path.endsWith("/") ? FileKind.FOLDER : FileKind.FILE;
      const recomputeIconClasses = () => getIconClasses(modelService, languageService, location.uri, fileKind, fileKind === FileKind.FOLDER && !themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : defaultIcon);
      iconClasses = recomputeIconClasses();
      const refreshIconClasses = () => {
        iconEl.classList.remove(...iconClasses);
        iconClasses = recomputeIconClasses();
        iconEl.classList.add(...iconClasses);
      };
      let isDirectory = false;
      fileService.stat(location.uri).then((stat) => {
        isDirectory = stat.isDirectory;
        if (stat.isDirectory) {
          fileKind = FileKind.FOLDER;
          refreshIconClasses();
        }
      }).catch(() => {
      });
      let contextKeyService;
      let isFolderContext;
      let contextMenuInitialized = false;
      const ensureContextKeyService = () => {
        if (!contextKeyService) {
          contextKeyService = this._register(originalContextKeyService.createScoped(element));
          chatAttachmentResourceContextKey.bindTo(contextKeyService).set(location.uri.toString());
          isFolderContext = ExplorerFolderContext.bindTo(contextKeyService);
        }
        return contextKeyService;
      };
      this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (domEvent) => {
        const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
        dom.EventHelper.stop(domEvent, true);
        const cks = ensureContextKeyService();
        if (!contextMenuInitialized) {
          contextMenuInitialized = true;
          const resourceContextKey = new StaticResourceContextKey(cks, fileService, languageService, modelService);
          resourceContextKey.set(location.uri);
        }
        isFolderContext.set(isDirectory);
        if (this._store.isDisposed) {
          return;
        }
        contextMenuService.showContextMenu({
          contextKeyService: cks,
          getAnchor: () => event,
          getActions: () => {
            const menu = menuService.getMenuActions(MenuId.ChatInlineResourceAnchorContext, cks, { arg: location.uri });
            return getFlatContextMenuActions(menu);
          }
        });
      }));
      if (location.range) {
        if (location.range.startLineNumber === location.range.endLineNumber) {
          element.setAttribute("aria-label", nls.localize("chat.inlineAnchor.ariaLabel.line", "{0} line {1}", filePathLabel, location.range.startLineNumber));
        } else {
          element.setAttribute("aria-label", nls.localize("chat.inlineAnchor.ariaLabel.range", "{0} lines {1} to {2}", filePathLabel, location.range.startLineNumber, location.range.endLineNumber));
        }
      }
    }
    const iconEl = dom.$("span.icon");
    iconEl.classList.add(...iconClasses);
    element.replaceChildren(iconEl, dom.$("span.icon-label", {}, ...iconText));
    const fragment = location.range ? `${location.range.startLineNumber},${location.range.startColumn}` : "";
    element.setAttribute("data-href", (fragment ? location.uri.with({ fragment }) : location.uri).toString());
    const relativeLabel = labelService.getUriLabel(location.uri, { relative: true });
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), element, relativeLabel));
    if (this.data.kind !== "symbol") {
      element.draggable = true;
      this._register(dom.addDisposableListener(element, "dragstart", (e) => {
        const stat = {
          resource: location.uri,
          selection: location.range
        };
        instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, [stat], e));
        e.dataTransfer?.setDragImage(element, 0, 0);
      }));
    }
    this._register(dom.addDisposableListener(element, "click", async (e) => {
      dom.EventHelper.stop(e, true);
      const editorOverride = getEditorOverrideForChatResource(location.uri, this.configurationService);
      const editorOptions = {
        override: editorOverride,
        selection: location.range
      };
      const open = async () => {
        if (this.options?.openResource && await this.options.openResource(location.uri, editorOptions)) {
          return;
        }
        const mimeType = getMediaMime(location.uri.path);
        if (mimeType?.startsWith("image/") && this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
          await this.chatImageCarouselService.openCarouselAtResource(location.uri);
          return;
        }
        await this.openerService.open(location.uri, {
          fromUserGesture: true,
          editorOptions
        });
      };
      if (this.options?.trackOpen) {
        await this.options.trackOpen(open);
      } else {
        await open();
      }
    }));
  }
  getHTMLElement() {
    return this.element;
  }
  getCellIndex(location) {
    const notebook = this.notebookDocumentService.getNotebook(location);
    const index = notebook?.getCellIndex(location) ?? -1;
    return index >= 0 ? ` ${index + 1}` : "";
  }
};
InlineAnchorWidget.className = "chat-inline-anchor-widget";
InlineAnchorWidget = __decorateClass([
  __decorateParam(4, IChatImageCarouselService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, ILanguageService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IModelService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, IThemeService),
  __decorateParam(17, INotebookDocumentService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IEditorService)
], InlineAnchorWidget);
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: _a.id,
      title: nls.localize2("actions.attach.label", "Add File to Chat"),
      menu: [{
        id: MenuId.ChatInlineResourceAnchorContext,
        group: "chat",
        order: 1,
        when: ExplorerFolderContext.negate()
      }]
    });
  }
  async run(accessor, resource) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.lastFocusedWidget;
    if (widget) {
      widget.attachmentModel.addFile(resource);
    }
  }
}, _a.id = "chat.inlineResourceAnchor.addFileToChat", _a));
registerAction2((_b = class extends Action2 {
  constructor() {
    super({
      id: _b.id,
      title: nls.localize2("actions.copy.label", "Copy"),
      f1: false,
      precondition: chatAttachmentResourceContextKey,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyC
      }
    });
  }
  async run(accessor) {
    const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
    const clipboardService = accessor.get(IClipboardService);
    const anchor = chatWidgetService.lastFocusedAnchor;
    if (!anchor) {
      return;
    }
    const resource = anchor.data.kind === "symbol" ? anchor.data.symbol.location.uri : anchor.data.uri;
    clipboardService.writeResources([resource]);
  }
}, _b.id = "chat.inlineResourceAnchor.copyResource", _b));
registerAction2((_c = class extends Action2 {
  constructor() {
    super({
      id: _c.id,
      title: nls.localize2("actions.openToSide.label", "Open to the Side"),
      f1: false,
      precondition: chatAttachmentResourceContextKey,
      keybinding: {
        weight: KeybindingWeight.ExternalExtension + 2,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        }
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "navigation",
        order: 1
      }))
    });
  }
  async run(accessor, arg) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const target = this.getTarget(accessor, arg);
    if (!target) {
      return;
    }
    const targetUri = URI.isUri(target) ? target : target.uri;
    const editorOverride = getEditorOverrideForChatResource(targetUri, configurationService);
    const input = URI.isUri(target) ? { resource: target, options: { override: editorOverride } } : {
      resource: target.uri,
      options: {
        override: editorOverride,
        selection: {
          startColumn: target.range.startColumn,
          startLineNumber: target.range.startLineNumber
        }
      }
    };
    await editorService.openEditors([input], SIDE_GROUP);
  }
  getTarget(accessor, arg) {
    const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
    if (arg) {
      return arg;
    }
    const anchor = chatWidgetService.lastFocusedAnchor;
    if (!anchor) {
      return void 0;
    }
    return anchor.data.kind === "symbol" ? anchor.data.symbol.location : anchor.data.uri;
  }
}, _c.id = "chat.inlineResourceAnchor.openToSide", _c));
registerAction2((_d = class extends Action2 {
  constructor() {
    super({
      id: _d.id,
      title: {
        ...nls.localize2("actions.goToDecl.label", "Go to Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Definition")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.1,
        when: EditorContextKeys.hasDefinitionProvider
      }))
    });
  }
  async run(accessor, location) {
    const editorService = accessor.get(ICodeEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    await openEditorWithSelection(editorService, location);
    const action = new DefinitionAction({ openToSide: false, openInPeek: false, muteMessage: true }, { title: { value: "", original: "" }, id: "", precondition: void 0 });
    return instantiationService.invokeFunction((accessor2) => action.run(accessor2));
  }
}, _d.id = "chat.inlineSymbolAnchor.goToDefinition", _d));
async function openEditorWithSelection(editorService, location) {
  await editorService.openCodeEditor({
    resource: location.uri,
    options: {
      selection: {
        startColumn: location.range.startColumn,
        startLineNumber: location.range.startLineNumber
      }
    }
  }, null);
}
async function runGoToCommand(accessor, command, location) {
  const editorService = accessor.get(ICodeEditorService);
  const commandService = accessor.get(ICommandService);
  await openEditorWithSelection(editorService, location);
  return commandService.executeCommand(command);
}
registerAction2((_e = class extends Action2 {
  constructor() {
    super({
      id: _e.id,
      title: {
        ...nls.localize2("goToTypeDefinitions.label", "Go to Type Definitions"),
        mnemonicTitle: nls.localize({ key: "miGotoTypeDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Type Definitions")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.1,
        when: EditorContextKeys.hasTypeDefinitionProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToTypeDefinition", location);
  }
}, _e.id = "chat.inlineSymbolAnchor.goToTypeDefinitions", _e));
registerAction2((_f = class extends Action2 {
  constructor() {
    super({
      id: _f.id,
      title: {
        ...nls.localize2("goToImplementations.label", "Go to Implementations"),
        mnemonicTitle: nls.localize({ key: "miGotoImplementations", comment: ["&& denotes a mnemonic"] }, "Go to &&Implementations")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.2,
        when: EditorContextKeys.hasImplementationProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToImplementation", location);
  }
}, _f.id = "chat.inlineSymbolAnchor.goToImplementations", _f));
registerAction2((_g = class extends Action2 {
  constructor() {
    super({
      id: _g.id,
      title: {
        ...nls.localize2("goToReferences.label", "Go to References"),
        mnemonicTitle: nls.localize({ key: "miGotoReference", comment: ["&& denotes a mnemonic"] }, "Go to &&References")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.3,
        when: EditorContextKeys.hasReferenceProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToReferences", location);
  }
}, _g.id = "chat.inlineSymbolAnchor.goToReferences", _g));
export {
  InlineAnchorWidget,
  renderFileWidgets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdElubGluZUFuY2hvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24sIFN5bWJvbEtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEZWZpbml0aW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9Db21tYW5kcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElSZXNvdXJjZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JPcHRpb25zLCBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRm9sZGVyVGhlbWVJY29uLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgU3RhdGljUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlckZvbGRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVN5bWJvbCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdEF0dGFjaG1lbnRSZXNvdXJjZUNvbnRleHRLZXksIGhvb2tVcFN5bWJvbEF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuL2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0TWVkaWFNaW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UgfSBmcm9tICcuLi9jaGF0RWRpdG9yQXNzb2NpYXRpb25zLmpzJztcblxudHlwZSBDb250ZW50UmVmRGF0YSA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnc3ltYm9sJzsgcmVhZG9ubHkgc3ltYm9sOiBJV29ya3NwYWNlU3ltYm9sIH1cblx0fCB7XG5cdFx0cmVhZG9ubHkga2luZD86IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSB1cmk6IFVSSTtcblx0XHRyZWFkb25seSByYW5nZT86IElSYW5nZTtcblx0fTtcblxudHlwZSBJbmxpbmVBbmNob3JXaWRnZXRNZXRhZGF0YSA9IHtcblx0dnNjb2RlTGlua1R5cGU6IHN0cmluZztcblx0bGlua1RleHQ/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZW5kZXJGaWxlV2lkZ2V0c09wdGlvbnMge1xuXHRyZWFkb25seSBvcGVuUmVzb3VyY2U/OiAocmVzb3VyY2U6IFVSSSwgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zKSA9PiBQcm9taXNlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBXcmFwcyBvcGVuaW5nIHRoZSByZXNvdXJjZSBzbyB0aGF0IGNhbGxlcnMgY2FuIG9ic2VydmUgd2hpY2ggZWRpdG9ycyBhIGNsaWNrIG9uIHRoZVxuXHQgKiBhbmNob3Igb3BlbmVkLCBmb3IgZXhhbXBsZSB0byBjbG9zZSB0aGVtIGFnYWluIGxhdGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgdHJhY2tPcGVuPzogKG9wZW46ICgpID0+IFByb21pc2U8dm9pZD4pID0+IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJGaWxlV2lkZ2V0cyhlbGVtZW50OiBIVE1MRWxlbWVudCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG9wdGlvbnM/OiBJUmVuZGVyRmlsZVdpZGdldHNPcHRpb25zKSB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRjb25zdCBsaW5rcyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYScpO1xuXHRsaW5rcy5mb3JFYWNoKGEgPT4ge1xuXHRcdC8vIEVtcHR5IGxpbmsgdGV4dCAtPiByZW5kZXIgZmlsZSB3aWRnZXRcblx0XHQvLyBBbHNvIHN1cHBvcnQgbWV0YWRhdGEgZm9ybWF0OiBbbGlua1RleHRdKGZpbGU6Ly8vLi4udXJpP3ZzY29kZUxpbmtUeXBlPS4uLilcblx0XHRjb25zdCBsaW5rVGV4dCA9IGEudGV4dENvbnRlbnQ/LnRyaW0oKTtcblx0XHRsZXQgc2hvdWxkUmVuZGVyV2lkZ2V0ID0gZmFsc2U7XG5cdFx0bGV0IG1ldGFkYXRhOiBJbmxpbmVBbmNob3JXaWRnZXRNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGhyZWYgPSBhLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyk7XG5cdFx0bGV0IHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChocmVmKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR1cmkgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gSW52YWxpZCBVUkksIHNraXAgcmVuZGVyaW5nIHdpZGdldFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbGlua1RleHQpIHtcblx0XHRcdHNob3VsZFJlbmRlcldpZGdldCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmICh1cmkpIHtcblx0XHRcdC8vIENoZWNrIGZvciB2c2NvZGVMaW5rVHlwZSBpbiBxdWVyeSBwYXJhbWV0ZXJzXG5cdFx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVyaS5xdWVyeSk7XG5cdFx0XHRjb25zdCB2c2NvZGVMaW5rVHlwZSA9IHNlYXJjaFBhcmFtcy5nZXQoJ3ZzY29kZUxpbmtUeXBlJyk7XG5cdFx0XHRpZiAodnNjb2RlTGlua1R5cGUpIHtcblx0XHRcdFx0bWV0YWRhdGEgPSB7XG5cdFx0XHRcdFx0dnNjb2RlTGlua1R5cGUsXG5cdFx0XHRcdFx0bGlua1RleHRcblx0XHRcdFx0fTtcblx0XHRcdFx0c2hvdWxkUmVuZGVyV2lkZ2V0ID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBTdHJpcCB2c2NvZGVMaW5rVHlwZSBmcm9tIHRoZSBVUkkgb25jZSB3ZSd2ZSBleHRyYWN0ZWQgdGhlIG1ldGFkYXRhIGZvciBiZXR0ZXIgY29tcGF0aWJpbGl0eSB3aXRoIGRpZmZlcmVudCBGU1xuXHRcdFx0XHRzZWFyY2hQYXJhbXMuZGVsZXRlKCd2c2NvZGVMaW5rVHlwZScpO1xuXHRcdFx0XHRjb25zdCByZW1haW5pbmdRdWVyeSA9IHNlYXJjaFBhcmFtcy50b1N0cmluZygpO1xuXHRcdFx0XHR1cmkgPSB1cmkud2l0aCh7IHF1ZXJ5OiByZW1haW5pbmdRdWVyeSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkUmVuZGVyV2lkZ2V0ICYmIHVyaT8uc2NoZW1lKSB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVBbmNob3JXaWRnZXQsIGEsIHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogdXJpIH0sIG1ldGFkYXRhLCBvcHRpb25zKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLnJlZ2lzdGVyKHdpZGdldCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdpZGdldCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUFuY2hvcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY2xhc3NOYW1lID0gJ2NoYXQtaW5saW5lLWFuY2hvci13aWRnZXQnO1xuXG5cdHJlYWRvbmx5IGRhdGE6IENvbnRlbnRSZWZEYXRhO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEFuY2hvckVsZW1lbnQgfCBIVE1MRWxlbWVudCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lUmVmZXJlbmNlOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtZXRhZGF0YTogSW5saW5lQW5jaG9yV2lkZ2V0TWV0YWRhdGEgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJUmVuZGVyRmlsZVdpZGdldHNPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlOiBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2Ugb3JpZ2luYWxDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tEb2N1bWVudFNlcnZpY2U6IElOb3RlYm9va0RvY3VtZW50U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZGF0YSA9ICd1cmknIGluIGlubGluZVJlZmVyZW5jZS5pbmxpbmVSZWZlcmVuY2Vcblx0XHRcdD8gaW5saW5lUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZVxuXHRcdFx0OiAnbmFtZScgaW4gaW5saW5lUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZVxuXHRcdFx0XHQ/IHsga2luZDogJ3N5bWJvbCcsIHN5bWJvbDogaW5saW5lUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZSB9XG5cdFx0XHRcdDogeyB1cmk6IGlubGluZVJlZmVyZW5jZS5pbmxpbmVSZWZlcmVuY2UgfTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZChJbmxpbmVBbmNob3JXaWRnZXQuY2xhc3NOYW1lLCAnc2hvdy1maWxlLWljb25zJyk7XG5cblx0XHRsZXQgaWNvblRleHQ6IEFycmF5PHN0cmluZyB8IEhUTUxFbGVtZW50Pjtcblx0XHRsZXQgaWNvbkNsYXNzZXM6IHN0cmluZ1tdO1xuXG5cdFx0bGV0IGxvY2F0aW9uOiB7IHJlYWRvbmx5IHVyaTogVVJJOyByZWFkb25seSByYW5nZT86IElSYW5nZSB9O1xuXG5cdFx0aWYgKHRoaXMuZGF0YS5raW5kID09PSAnc3ltYm9sJykge1xuXHRcdFx0Y29uc3Qgc3ltYm9sID0gdGhpcy5kYXRhLnN5bWJvbDtcblxuXHRcdFx0bG9jYXRpb24gPSB0aGlzLmRhdGEuc3ltYm9sLmxvY2F0aW9uO1xuXHRcdFx0aWNvblRleHQgPSBbdGhpcy5kYXRhLnN5bWJvbC5uYW1lXTtcblx0XHRcdGljb25DbGFzc2VzID0gWydjb2RpY29uJywgLi4uZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sLmtpbmQpKV07XG5cblx0XHRcdHRoaXMuX3N0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBob29rVXBTeW1ib2xBdHRhY2htZW50RHJhZ0FuZENvbnRleHRNZW51KGFjY2Vzc29yLCBlbGVtZW50LCBvcmlnaW5hbENvbnRleHRLZXlTZXJ2aWNlLCB7IHZhbHVlOiBzeW1ib2wubG9jYXRpb24sIG5hbWU6IHN5bWJvbC5uYW1lLCBraW5kOiBzeW1ib2wua2luZCB9LCBNZW51SWQuQ2hhdElubGluZVN5bWJvbEFuY2hvckNvbnRleHQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvY2F0aW9uID0gdGhpcy5kYXRhO1xuXG5cdFx0XHRjb25zdCBmaWxlUGF0aExhYmVsID0gdGhpcy5tZXRhZGF0YT8ubGlua1RleHQgPz8gbGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwobG9jYXRpb24udXJpKTtcblx0XHRcdGxldCBkZWZhdWx0SWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAobG9jYXRpb24ucmFuZ2UgJiYgdGhpcy5kYXRhLmtpbmQgIT09ICdzeW1ib2wnKSB7XG5cdFx0XHRcdGNvbnN0IHN1ZmZpeCA9IGxvY2F0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbG9jYXRpb24ucmFuZ2UuZW5kTGluZU51bWJlclxuXHRcdFx0XHRcdD8gYDoke2xvY2F0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlcn1gXG5cdFx0XHRcdFx0OiBgOiR7bG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfS0ke2xvY2F0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXJ9YDtcblxuXHRcdFx0XHRpY29uVGV4dCA9IFtmaWxlUGF0aExhYmVsLCBkb20uJCgnc3Bhbi5sYWJlbC1zdWZmaXgnLCB1bmRlZmluZWQsIHN1ZmZpeCldO1xuXHRcdFx0fSBlbHNlIGlmIChsb2NhdGlvbi51cmkuc2NoZW1lID09PSAndnNjb2RlLW5vdGVib29rLWNlbGwnICYmIHRoaXMuZGF0YS5raW5kICE9PSAnc3ltYm9sJykge1xuXHRcdFx0XHRpY29uVGV4dCA9IFtgJHtmaWxlUGF0aExhYmVsfSBcdTIwMjIgY2VsbCR7dGhpcy5nZXRDZWxsSW5kZXgobG9jYXRpb24udXJpKX1gXTtcblx0XHRcdH0gZWxzZSBpZiAobG9jYXRpb24udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRcdGRlZmF1bHRJY29uID0gQ29kaWNvbi5nbG9iZTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yTmFtZSA9IHRoaXMuZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhsb2NhdGlvbi51cmkpWzBdPy5lZGl0b3I/LmdldE5hbWUoKSA/PyBCcm93c2VyRWRpdG9ySW5wdXQuREVGQVVMVF9MQUJFTDtcblx0XHRcdFx0aWNvblRleHQgPSBbZWRpdG9yTmFtZV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpY29uVGV4dCA9IFtmaWxlUGF0aExhYmVsXTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGZpbGVLaW5kID0gbG9jYXRpb24udXJpLnBhdGguZW5kc1dpdGgoJy8nKSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEU7XG5cdFx0XHRjb25zdCByZWNvbXB1dGVJY29uQ2xhc3NlcyA9ICgpID0+IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBsb2NhdGlvbi51cmksIGZpbGVLaW5kLCBmaWxlS2luZCA9PT0gRmlsZUtpbmQuRk9MREVSICYmICF0aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpLmhhc0ZvbGRlckljb25zID8gRm9sZGVyVGhlbWVJY29uIDogZGVmYXVsdEljb24pO1xuXG5cdFx0XHRpY29uQ2xhc3NlcyA9IHJlY29tcHV0ZUljb25DbGFzc2VzKCk7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hJY29uQ2xhc3NlcyA9ICgpID0+IHtcblx0XHRcdFx0aWNvbkVsLmNsYXNzTGlzdC5yZW1vdmUoLi4uaWNvbkNsYXNzZXMpO1xuXHRcdFx0XHRpY29uQ2xhc3NlcyA9IHJlY29tcHV0ZUljb25DbGFzc2VzKCk7XG5cdFx0XHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLmljb25DbGFzc2VzKTtcblx0XHRcdH07XG5cblx0XHRcdGxldCBpc0RpcmVjdG9yeSA9IGZhbHNlO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc3RhdChsb2NhdGlvbi51cmkpXG5cdFx0XHRcdC50aGVuKHN0YXQgPT4ge1xuXHRcdFx0XHRcdGlzRGlyZWN0b3J5ID0gc3RhdC5pc0RpcmVjdG9yeTtcblx0XHRcdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0ZmlsZUtpbmQgPSBGaWxlS2luZC5GT0xERVI7XG5cdFx0XHRcdFx0XHRyZWZyZXNoSWNvbkNsYXNzZXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5jYXRjaCgoKSA9PiB7IH0pO1xuXG5cdFx0XHQvLyBDb250ZXh0IG1lbnUgKGNvbnRleHQga2V5IHNlcnZpY2UgY3JlYXRlZCBsYXppbHkgb24gZmlyc3QgY29udGV4dCBtZW51IG9wZW4pXG5cdFx0XHRsZXQgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBpc0ZvbGRlckNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNvbnRleHRNZW51SW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZW5zdXJlQ29udGV4dEtleVNlcnZpY2UgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICghY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdFx0XHRjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG9yaWdpbmFsQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGVsZW1lbnQpKTtcblx0XHRcdFx0XHRjaGF0QXR0YWNobWVudFJlc291cmNlQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldChsb2NhdGlvbi51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0aXNGb2xkZXJDb250ZXh0ID0gRXhwbG9yZXJGb2xkZXJDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgZG9tRXZlbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZG9tLmdldFdpbmRvdyhkb21FdmVudCksIGRvbUV2ZW50KTtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZG9tRXZlbnQsIHRydWUpO1xuXG5cdFx0XHRcdGNvbnN0IGNrcyA9IGVuc3VyZUNvbnRleHRLZXlTZXJ2aWNlKCk7XG5cblx0XHRcdFx0aWYgKCFjb250ZXh0TWVudUluaXRpYWxpemVkKSB7XG5cdFx0XHRcdFx0Y29udGV4dE1lbnVJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2VDb250ZXh0S2V5ID0gbmV3IFN0YXRpY1Jlc291cmNlQ29udGV4dEtleShja3MsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIG1vZGVsU2VydmljZSk7XG5cdFx0XHRcdFx0cmVzb3VyY2VDb250ZXh0S2V5LnNldChsb2NhdGlvbi51cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRm9sZGVyQ29udGV4dCEuc2V0KGlzRGlyZWN0b3J5KTtcblxuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBja3MsXG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZW51ID0gbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkNoYXRJbmxpbmVSZXNvdXJjZUFuY2hvckNvbnRleHQsIGNrcywgeyBhcmc6IGxvY2F0aW9uLnVyaSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBBZGQgbGluZSByYW5nZSBsYWJlbCBmb3Igc2NyZWVuIHJlYWRlcnNcblx0XHRcdGlmIChsb2NhdGlvbi5yYW5nZSkge1xuXHRcdFx0XHRpZiAobG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsb2NhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ2NoYXQuaW5saW5lQW5jaG9yLmFyaWFMYWJlbC5saW5lJywgXCJ7MH0gbGluZSB7MX1cIiwgZmlsZVBhdGhMYWJlbCwgbG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ2NoYXQuaW5saW5lQW5jaG9yLmFyaWFMYWJlbC5yYW5nZScsIFwiezB9IGxpbmVzIHsxfSB0byB7Mn1cIiwgZmlsZVBhdGhMYWJlbCwgbG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBsb2NhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpY29uRWwgPSBkb20uJCgnc3Bhbi5pY29uJyk7XG5cdFx0aWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzZXMpO1xuXHRcdGVsZW1lbnQucmVwbGFjZUNoaWxkcmVuKGljb25FbCwgZG9tLiQoJ3NwYW4uaWNvbi1sYWJlbCcsIHt9LCAuLi5pY29uVGV4dCkpO1xuXG5cdFx0Y29uc3QgZnJhZ21lbnQgPSBsb2NhdGlvbi5yYW5nZSA/IGAke2xvY2F0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlcn0sJHtsb2NhdGlvbi5yYW5nZS5zdGFydENvbHVtbn1gIDogJyc7XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtaHJlZicsIChmcmFnbWVudCA/IGxvY2F0aW9uLnVyaS53aXRoKHsgZnJhZ21lbnQgfSkgOiBsb2NhdGlvbi51cmkpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gSG92ZXJcblx0XHRjb25zdCByZWxhdGl2ZUxhYmVsID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGxvY2F0aW9uLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgZWxlbWVudCwgcmVsYXRpdmVMYWJlbCkpO1xuXG5cdFx0Ly8gRHJhZyBhbmQgZHJvcFxuXHRcdGlmICh0aGlzLmRhdGEua2luZCAhPT0gJ3N5bWJvbCcpIHtcblx0XHRcdGVsZW1lbnQuZHJhZ2dhYmxlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgJ2RyYWdzdGFydCcsIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0OiBJUmVzb3VyY2VTdGF0ID0ge1xuXHRcdFx0XHRcdHJlc291cmNlOiBsb2NhdGlvbi51cmksXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiBsb2NhdGlvbi5yYW5nZSxcblx0XHRcdFx0fTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgW3N0YXRdLCBlKSk7XG5cblxuXHRcdFx0XHRlLmRhdGFUcmFuc2Zlcj8uc2V0RHJhZ0ltYWdlKGVsZW1lbnQsIDAsIDApO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgdG8gb3BlbiB3aXRoIGN1c3RvbSBlZGl0b3IgYXNzb2NpYXRpb24gZnJvbSBjaGF0LmVkaXRvckFzc29jaWF0aW9ucyBzZXR0aW5nXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCAnY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGVkaXRvck92ZXJyaWRlID0gZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UobG9jYXRpb24udXJpLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdFx0b3ZlcnJpZGU6IGVkaXRvck92ZXJyaWRlLFxuXHRcdFx0XHRzZWxlY3Rpb246IGxvY2F0aW9uLnJhbmdlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgb3BlbiA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucz8ub3BlblJlc291cmNlICYmIGF3YWl0IHRoaXMub3B0aW9ucy5vcGVuUmVzb3VyY2UobG9jYXRpb24udXJpLCBlZGl0b3JPcHRpb25zKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHRoZSByZWZlcmVuY2UgaXMgYW4gaW1hZ2UgZmlsZSBhbmQgdGhlIGNhcm91c2VsIGlzIGVuYWJsZWQsIG9wZW4gdGhlIGNhcm91c2VsXG5cdFx0XHRcdGNvbnN0IG1pbWVUeXBlID0gZ2V0TWVkaWFNaW1lKGxvY2F0aW9uLnVyaS5wYXRoKTtcblx0XHRcdFx0aWYgKG1pbWVUeXBlPy5zdGFydHNXaXRoKCdpbWFnZS8nKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltYWdlQ2Fyb3VzZWxFbmFibGVkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLm9wZW5DYXJvdXNlbEF0UmVzb3VyY2UobG9jYXRpb24udXJpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihsb2NhdGlvbi51cmksIHtcblx0XHRcdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRcdFx0ZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnM/LnRyYWNrT3Blbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wdGlvbnMudHJhY2tPcGVuKG9wZW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgb3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGdldEhUTUxFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDZWxsSW5kZXgobG9jYXRpb246IFVSSSkge1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5ub3RlYm9va0RvY3VtZW50U2VydmljZS5nZXROb3RlYm9vayhsb2NhdGlvbik7XG5cdFx0Y29uc3QgaW5kZXggPSBub3RlYm9vaz8uZ2V0Q2VsbEluZGV4KGxvY2F0aW9uKSA/PyAtMTtcblx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IGAgJHtpbmRleCArIDF9YCA6ICcnO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBSZXNvdXJjZSBjb250ZXh0IG1lbnVcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFkZEZpbGVUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5pbmxpbmVSZXNvdXJjZUFuY2hvci5hZGRGaWxlVG9DaGF0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkRmlsZVRvQ2hhdEFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLmF0dGFjaC5sYWJlbCcsIFwiQWRkIEZpbGUgdG8gQ2hhdFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElubGluZVJlc291cmNlQW5jaG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICdjaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IEV4cGxvcmVyRm9sZGVyQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKHJlc291cmNlKTtcblxuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUmVzb3VyY2Uga2V5YmluZGluZ3NcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvcHlSZXNvdXJjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdjaGF0LmlubGluZVJlc291cmNlQW5jaG9yLmNvcHlSZXNvdXJjZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvcHlSZXNvdXJjZUFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLmNvcHkubGFiZWwnLCBcIkNvcHlcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IGNoYXRBdHRhY2htZW50UmVzb3VyY2VDb250ZXh0S2V5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHRjb25zdCBhbmNob3IgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZEFuY2hvcjtcblx0XHRpZiAoIWFuY2hvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IHdlIHNob3VsZCBhbHNvIHdyaXRlIG91dCB0aGUgc3RhbmRhcmQgbWltZSB0eXBlcyBzbyB0aGF0IGV4dGVybmFsIHByb2dyYW1zIGNhbiB1c2UgdGhlbVxuXHRcdC8vIGxpa2UgaG93IGBmaWxsRWRpdG9yc0RyYWdEYXRhYCB3b3JrcyBidXQgd2l0aG91dCBoYXZpbmcgYW4gZXZlbnQgdG8gd29yayB3aXRoLlxuXHRcdGNvbnN0IHJlc291cmNlID0gYW5jaG9yLmRhdGEua2luZCA9PT0gJ3N5bWJvbCcgPyBhbmNob3IuZGF0YS5zeW1ib2wubG9jYXRpb24udXJpIDogYW5jaG9yLmRhdGEudXJpO1xuXHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVSZXNvdXJjZXMoW3Jlc291cmNlXSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlblRvU2lkZVJlc291cmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2NoYXQuaW5saW5lUmVzb3VyY2VBbmNob3Iub3BlblRvU2lkZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Ub1NpZGVSZXNvdXJjZUFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLm9wZW5Ub1NpZGUubGFiZWwnLCBcIk9wZW4gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IGNoYXRBdHRhY2htZW50UmVzb3VyY2VDb250ZXh0S2V5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRXh0ZXJuYWxFeHRlbnNpb24gKyAyLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtNZW51SWQuQ2hhdElubGluZVN5bWJvbEFuY2hvckNvbnRleHQsIE1lbnVJZC5DaGF0SW5wdXRTeW1ib2xBdHRhY2htZW50Q29udGV4dF0ubWFwKGlkID0+ICh7XG5cdFx0XHRcdGlkOiBpZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0pKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc/OiBMb2NhdGlvbiB8IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmdldFRhcmdldChhY2Nlc3NvciwgYXJnKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFVyaSA9IFVSSS5pc1VyaSh0YXJnZXQpID8gdGFyZ2V0IDogdGFyZ2V0LnVyaTtcblx0XHRjb25zdCBlZGl0b3JPdmVycmlkZSA9IGdldEVkaXRvck92ZXJyaWRlRm9yQ2hhdFJlc291cmNlKHRhcmdldFVyaSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5wdXQ6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCA9IFVSSS5pc1VyaSh0YXJnZXQpXG5cdFx0XHQ/IHsgcmVzb3VyY2U6IHRhcmdldCwgb3B0aW9uczogeyBvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUgfSB9XG5cdFx0XHQ6IHtcblx0XHRcdFx0cmVzb3VyY2U6IHRhcmdldC51cmksIG9wdGlvbnM6IHtcblx0XHRcdFx0XHRvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogdGFyZ2V0LnJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB0YXJnZXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoW2lucHV0XSwgU0lERV9HUk9VUCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhcmdldChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBVUkkgfCBMb2NhdGlvbiB8IHVuZGVmaW5lZCk6IExvY2F0aW9uIHwgVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSk7XG5cblx0XHRpZiAoYXJnKSB7XG5cdFx0XHRyZXR1cm4gYXJnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFuY2hvciA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkQW5jaG9yO1xuXHRcdGlmICghYW5jaG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBhbmNob3IuZGF0YS5raW5kID09PSAnc3ltYm9sJyA/IGFuY2hvci5kYXRhLnN5bWJvbC5sb2NhdGlvbiA6IGFuY2hvci5kYXRhLnVyaTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU3ltYm9sIGNvbnRleHQgbWVudVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29Ub0RlZmluaXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5pbmxpbmVTeW1ib2xBbmNob3IuZ29Ub0RlZmluaXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb1RvRGVmaW5pdGlvbkFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuZ29Ub0RlY2wubGFiZWwnLCBcIkdvIHRvIERlZmluaXRpb25cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b0RlZmluaXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZEZWZpbml0aW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtNZW51SWQuQ2hhdElubGluZVN5bWJvbEFuY2hvckNvbnRleHQsIE1lbnVJZC5DaGF0SW5wdXRTeW1ib2xBdHRhY2htZW50Q29udGV4dF0ubWFwKGlkID0+ICh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiAxLjEsXG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmhhc0RlZmluaXRpb25Qcm92aWRlcixcblx0XHRcdH0pKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsb2NhdGlvbjogTG9jYXRpb24pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IG9wZW5FZGl0b3JXaXRoU2VsZWN0aW9uKGVkaXRvclNlcnZpY2UsIGxvY2F0aW9uKTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEZWZpbml0aW9uQWN0aW9uKHsgb3BlblRvU2lkZTogZmFsc2UsIG9wZW5JblBlZWs6IGZhbHNlLCBtdXRlTWVzc2FnZTogdHJ1ZSB9LCB7IHRpdGxlOiB7IHZhbHVlOiAnJywgb3JpZ2luYWw6ICcnIH0sIGlkOiAnJywgcHJlY29uZGl0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjdGlvbi5ydW4oYWNjZXNzb3IpKTtcblx0fVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIG9wZW5FZGl0b3JXaXRoU2VsZWN0aW9uKGVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSwgbG9jYXRpb246IExvY2F0aW9uKSB7XG5cdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3Ioe1xuXHRcdHJlc291cmNlOiBsb2NhdGlvbi51cmksIG9wdGlvbnM6IHtcblx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRzdGFydENvbHVtbjogbG9jYXRpb24ucmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0fVxuXHRcdH1cblx0fSwgbnVsbCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkdvVG9Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb21tYW5kOiBzdHJpbmcsIGxvY2F0aW9uOiBMb2NhdGlvbikge1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0YXdhaXQgb3BlbkVkaXRvcldpdGhTZWxlY3Rpb24oZWRpdG9yU2VydmljZSwgbG9jYXRpb24pO1xuXG5cdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9UeXBlRGVmaW5pdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5pbmxpbmVTeW1ib2xBbmNob3IuZ29Ub1R5cGVEZWZpbml0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvVG9UeXBlRGVmaW5pdGlvbnNBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdnb1RvVHlwZURlZmluaXRpb25zLmxhYmVsJywgXCJHbyB0byBUeXBlIERlZmluaXRpb25zXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9UeXBlRGVmaW5pdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJlR5cGUgRGVmaW5pdGlvbnNcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW01lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0XS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEuMSxcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuaGFzVHlwZURlZmluaXRpb25Qcm92aWRlcixcblx0XHRcdH0pKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbG9jYXRpb246IExvY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcnVuR29Ub0NvbW1hbmQoYWNjZXNzb3IsICdlZGl0b3IuYWN0aW9uLmdvVG9UeXBlRGVmaW5pdGlvbicsIGxvY2F0aW9uKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvSW1wbGVtZW50YXRpb25zIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2NoYXQuaW5saW5lU3ltYm9sQW5jaG9yLmdvVG9JbXBsZW1lbnRhdGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb1RvSW1wbGVtZW50YXRpb25zLmlkLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignZ29Ub0ltcGxlbWVudGF0aW9ucy5sYWJlbCcsIFwiR28gdG8gSW1wbGVtZW50YXRpb25zXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9JbXBsZW1lbnRhdGlvbnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR28gdG8gJiZJbXBsZW1lbnRhdGlvbnNcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW01lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0XS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEuMixcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlcixcblx0XHRcdH0pKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbG9jYXRpb246IExvY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcnVuR29Ub0NvbW1hbmQoYWNjZXNzb3IsICdlZGl0b3IuYWN0aW9uLmdvVG9JbXBsZW1lbnRhdGlvbicsIGxvY2F0aW9uKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvUmVmZXJlbmNlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdjaGF0LmlubGluZVN5bWJvbEFuY2hvci5nb1RvUmVmZXJlbmNlcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvVG9SZWZlcmVuY2VzQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignZ29Ub1JlZmVyZW5jZXMubGFiZWwnLCBcIkdvIHRvIFJlZmVyZW5jZXNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b1JlZmVyZW5jZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJlJlZmVyZW5jZXNcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW01lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0XS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEuMyxcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuaGFzUmVmZXJlbmNlUHJvdmlkZXIsXG5cdFx0XHR9KSksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxvY2F0aW9uOiBMb2NhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHJ1bkdvVG9Db21tYW5kKGFjY2Vzc29yLCAnZWRpdG9yLmFjdGlvbi5nb1RvUmVmZXJlbmNlcycsIGxvY2F0aW9uKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFBQTtBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQW1CLG1CQUFtQjtBQUN0QyxTQUFTLHdCQUF3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akYsVUFBTSxlQUFlLFVBQVUsb0NBQW9DLFFBQVE7QUFBQSxFQUM1RTtBQUNELEdBdkJnQixHQUVDLEtBQUssK0NBRk4sR0F1QmY7QUFFRCxpQkFBZ0IsbUJBQWtDLFFBQVE7QUFBQSxFQUl6RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxHQUFvQjtBQUFBLE1BQ3hCLE9BQU87QUFBQSxRQUNOLEdBQUcsSUFBSSxVQUFVLDZCQUE2Qix1QkFBdUI7QUFBQSxRQUNyRSxlQUFlLElBQUksU0FBUyxFQUFFLEtBQUsseUJBQXlCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLHlCQUF5QjtBQUFBLE1BQzVIO0FBQUEsTUFDQSxNQUFNLENBQUMsT0FBTywrQkFBK0IsT0FBTyxnQ0FBZ0MsRUFBRSxJQUFJLFNBQU87QUFBQSxRQUNoRztBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxrQkFBa0I7QUFBQSxNQUN6QixFQUFFO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTRCLFVBQW1DO0FBQ2pGLFVBQU0sZUFBZSxVQUFVLG9DQUFvQyxRQUFRO0FBQUEsRUFDNUU7QUFDRCxHQXZCZ0IsR0FFQyxLQUFLLCtDQUZOLEdBdUJmO0FBRUQsaUJBQWdCLG1CQUFtQyxRQUFRO0FBQUEsRUFJMUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksR0FBcUI7QUFBQSxNQUN6QixPQUFPO0FBQUEsUUFDTixHQUFHLElBQUksVUFBVSx3QkFBd0Isa0JBQWtCO0FBQUEsUUFDM0QsZUFBZSxJQUFJLFNBQVMsRUFBRSxLQUFLLG1CQUFtQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxvQkFBb0I7QUFBQSxNQUNqSDtBQUFBLE1BQ0EsTUFBTSxDQUFDLE9BQU8sK0JBQStCLE9BQU8sZ0NBQWdDLEVBQUUsSUFBSSxTQUFPO0FBQUEsUUFDaEc7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sa0JBQWtCO0FBQUEsTUFDekIsRUFBRTtBQUFBLElBQ0gsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUE0QixVQUFtQztBQUNqRixVQUFNLGVBQWUsVUFBVSxnQ0FBZ0MsUUFBUTtBQUFBLEVBQ3hFO0FBQ0QsR0F2QmdCLEdBRUMsS0FBSywwQ0FGTixHQXVCZjsiLAogICJuYW1lcyI6IFsiYWNjZXNzb3IiXQp9Cg==
