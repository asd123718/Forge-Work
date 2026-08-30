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
import * as dom from "../../../../../base/browser/dom.js";
import { $ } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { HoverStyle } from "../../../../../base/browser/ui/hover/hover.js";
import { createInstantHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import * as event from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/path.js";
import { isEqual, joinPath } from "../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { fillInSymbolsDragData } from "../../../../../platform/dnd/browser/dnd.js";
import { registerOpenEditorListeners } from "../../../../../platform/editor/browser/editor.js";
import { FileKind, IFileService } from "../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { FolderThemeIcon, IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { fillEditorsDragData } from "../../../../browser/dnd.js";
import { StaticResourceContextKey } from "../../../../common/contextkeys.js";
import { IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { revealInSideBarCommand } from "../../../files/browser/fileActions.contribution.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { toHistoryItemHoverContent } from "../../../scm/browser/scmHistory.js";
import { getHistoryItemEditorTitle } from "../../../scm/browser/util.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
import { buildOpenSessionLinkForChatResource } from "../../../../../platform/agentHost/common/openSessionLink.js";
import { coerceImageBuffer } from "../../common/chatImageExtraction.js";
import { ChatConfiguration } from "../../common/constants.js";
import { getImageAttachmentLimit, isPastedTextArtifact, OmittedState, PromptFileVariableKind, isStringVariableEntry, resolveChatContextIcon } from "../../common/attachments/chatVariableEntries.js";
import { ILanguageModelsService, isAutoLanguageModel } from "../../common/languageModels.js";
import { ILanguageModelToolsService, isToolSet } from "../../common/tools/languageModelToolsService.js";
import { getCleanPromptName } from "../../common/promptSyntax/config/promptFileLocations.js";
import { IChatResponseResourceFileSystemProvider } from "../../common/widget/chatResponseResourceFileSystemProvider.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../chatImageCarouselService.js";
import { CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE, getOrCreateImageThumbnail } from "../chatImageUtils.js";
const commonHoverOptions = {
  style: HoverStyle.Pointer,
  position: {
    hoverPosition: HoverPosition.BELOW
  },
  trapFocus: true
};
const commonHoverLifecycleOptions = {
  groupId: "chat-attachments"
};
const KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES = [
  "display",
  "position",
  "margin",
  "padding",
  "font-size",
  "font-family",
  "color",
  "background-color"
];
let AbstractChatAttachmentWidget = class extends Disposable {
  constructor(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService) {
    super();
    this.attachment = attachment;
    this.options = options;
    this.currentLanguageModel = currentLanguageModel;
    this.commandService = commandService;
    this.openerService = openerService;
    this.configurationService = configurationService;
    this.terminalService = terminalService;
    this._onDidDelete = this._register(new event.Emitter());
    this._onDidOpen = this._register(new event.Emitter());
    this._hasClearButton = false;
    this.element = dom.append(container, $(".chat-attached-context-attachment.show-file-icons"));
    this.attachClearButton();
    this.label = contextResourceLabels.create(this.element, { supportIcons: true, hoverTargetOverride: this.element });
    this._register(this.label);
    this.element.tabIndex = 0;
    this.element.role = "button";
    this._register(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e) => {
      if (e.button === 1 && this.options.supportsDeletion && !this.attachment.range) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidDelete.fire(e);
      }
    }));
  }
  get onDidDelete() {
    return this._onDidDelete.event;
  }
  get onDidOpen() {
    return this._onDidOpen.event;
  }
  modelSupportsVision() {
    return modelSupportsVision(this.currentLanguageModel);
  }
  appendDeletionHint(ariaLabel) {
    if (!this._hasClearButton) {
      return ariaLabel;
    }
    return localize("chat.attachment.withDeleteHint", "{0} (Delete)", ariaLabel);
  }
  attachClearButton() {
    if (this.attachment.range && !isPastedTextArtifact(this.attachment) || !this.options.supportsDeletion) {
      return;
    }
    this._hasClearButton = true;
    const clearButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.clearButton", "Remove from context")
    });
    clearButton.element.tabIndex = -1;
    clearButton.icon = Codicon.closeCompact;
    this._register(clearButton);
    this._register(event.Event.once(clearButton.onDidClick)((e) => {
      this._onDidDelete.fire(e);
    }));
    this._register(dom.addStandardDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      if (e.keyCode === KeyCode.Backspace || e.keyCode === KeyCode.Delete) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidDelete.fire(e.browserEvent);
      }
    }));
  }
  addResourceOpenHandlers(resource, range) {
    this.element.style.cursor = "pointer";
    this._register(registerOpenEditorListeners(this.element, async (options) => {
      if (this.attachment.kind === "directory") {
        await this.openResource(resource, options, true);
      } else {
        await this.openResource(resource, options, false, range);
      }
    }));
  }
  async openResource(resource, openOptions, isDirectory, range) {
    if (isDirectory) {
      this.commandService.executeCommand(revealInSideBarCommand.id, resource);
      return;
    }
    if (resource.scheme === Schemas.vscodeTerminal) {
      this.terminalService?.openResource(resource);
      return;
    }
    const openTextEditorOptions = range ? { selection: range } : void 0;
    const options = {
      fromUserGesture: true,
      openToSide: openOptions.openToSide,
      editorOptions: {
        ...openTextEditorOptions,
        ...openOptions.editorOptions
      }
    };
    await this.openerService.open(resource, options);
    this._onDidOpen.fire();
    this.element.focus();
  }
};
AbstractChatAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITerminalService)
], AbstractChatAttachmentWidget);
function modelSupportsVision(currentLanguageModel) {
  return isAutoLanguageModel(currentLanguageModel) || (currentLanguageModel?.metadata.capabilities?.vision ?? false);
}
function getEffectiveImageOmittedState(omittedState, currentLanguageModel, isCurrentInput) {
  return isAutoLanguageModel(currentLanguageModel) && isCurrentInput && omittedState === OmittedState.Full ? OmittedState.NotOmitted : omittedState;
}
let FileAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, themeService, hoverService, languageModelsService, instantiationService, fileDialogService, fileService, notificationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.instantiationService = instantiationService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    const fileBasename = basename(resource.path);
    const fileDirname = dirname(resource.path);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    let ariaLabel = range ? localize("chat.fileAttachmentWithRange", "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize("chat.fileAttachment", "Attached file, {0}", friendlyName);
    if (attachment.omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedFileAttachment", "Omitted this file: {0}", attachment.name);
      this.renderOmittedWarning(friendlyName, ariaLabel);
    } else {
      const fileOptions = { hidePath: true, title: correspondingContentReference?.options?.status?.description };
      this.label.setFile(resource, attachment.kind === "file" ? {
        ...fileOptions,
        fileKind: FileKind.FILE,
        range
      } : {
        ...fileOptions,
        fileKind: FileKind.FOLDER,
        icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : void 0
      });
      if (attachment.kind === "directory" && typeof attachment.imageCount === "number") {
        const maxImagesPerRequest = getImageAttachmentLimit(currentLanguageModel?.metadata);
        if (maxImagesPerRequest !== void 0 && attachment.imageCount > maxImagesPerRequest) {
          this.renderFolderImageLimitWarning(attachment.imageCount, maxImagesPerRequest);
        }
      }
    }
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    if (attachment.kind === "file") {
      this.attachSaveButton(resource, fileBasename, options.supportsDeletion);
    }
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
    });
    this.addResourceOpenHandlers(resource, range);
  }
  attachSaveButton(resource, name, supportsDeletion) {
    if (supportsDeletion) {
      return;
    }
    const saveButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.saveFileButton", "Save As...")
    });
    saveButton.element.classList.add("chat-attached-context-download-button");
    saveButton.element.tabIndex = -1;
    saveButton.icon = Codicon.cloudDownload;
    this.element.insertBefore(saveButton.element, this.label.element);
    this._register(saveButton);
    this._register(saveButton.onDidClick(async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultUri = joinPath(await this.fileDialogService.defaultFilePath(), name);
      const target = await this.fileDialogService.showSaveDialog({ defaultUri });
      if (!target) {
        return;
      }
      try {
        await this.fileService.copy(resource, target, true);
      } catch (error) {
        this.notificationService.error(localize("chat.attachment.saveFileError", "Failed to save file: {0}", error));
      }
    }));
  }
  renderOmittedWarning(friendlyName, ariaLabel) {
    const pillIcon = dom.$("div.chat-attached-context-pill", {}, dom.$("span.codicon.codicon-warning"));
    const textLabel = dom.$("span.chat-attached-context-custom-text", {}, friendlyName);
    this.element.appendChild(pillIcon);
    this.element.appendChild(textLabel);
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.setAttribute("aria-label", ariaLabel);
    this.element.classList.add("warning");
    hoverElement.textContent = localize("chat.fileAttachmentHover", "{0} does not support this file type.", this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name : this.currentLanguageModel ?? "This model");
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverElement
    }, commonHoverLifecycleOptions));
  }
  renderFolderImageLimitWarning(imageCount, limit) {
    this.element.classList.add("warning");
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.textContent = localize(
      "chat.folderImageLimitExceededHover",
      "This folder contains {0} images, which exceeds the maximum of {1} images per request. Older images will not be sent.",
      imageCount,
      limit
    );
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverElement
    }, commonHoverLifecycleOptions));
  }
};
FileAttachmentWidget = __decorateClass([
  __decorateParam(8, ICommandService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, ILanguageModelsService),
  __decorateParam(14, IInstantiationService),
  __decorateParam(15, IFileDialogService),
  __decorateParam(16, IFileService),
  __decorateParam(17, INotificationService)
], FileAttachmentWidget);
let TerminalCommandAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, terminalService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService);
    this.hoverService = hoverService;
    this.terminalService = terminalService;
    const ariaLabel = localize("chat.terminalCommand", "Terminal command, {0}", attachment.command);
    const clickHandler = () => this.openResource(attachment.resource, { editorOptions: { preserveFocus: true } }, false, void 0);
    this._register(createTerminalCommandElements(this.element, attachment, ariaLabel, this.hoverService, clickHandler));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        await clickHandler();
      }
    }));
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
};
TerminalCommandAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, ITerminalService)
], TerminalCommandAttachmentWidget);
var TerminalConstants = /* @__PURE__ */ ((TerminalConstants2) => {
  TerminalConstants2[TerminalConstants2["MaxAttachmentOutputLineCount"] = 5] = "MaxAttachmentOutputLineCount";
  TerminalConstants2[TerminalConstants2["MaxAttachmentOutputLineLength"] = 80] = "MaxAttachmentOutputLineLength";
  return TerminalConstants2;
})(TerminalConstants || {});
function createTerminalCommandElements(element, attachment, ariaLabel, hoverService, clickHandler) {
  const disposable = new DisposableStore();
  element.ariaLabel = ariaLabel;
  element.style.cursor = "pointer";
  const terminalIconSpan = dom.$("span");
  terminalIconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.terminal));
  const pillIcon = dom.$("div.chat-attached-context-pill", {}, terminalIconSpan);
  const textLabel = dom.$("span.chat-attached-context-custom-text", {}, attachment.command);
  element.appendChild(pillIcon);
  element.appendChild(textLabel);
  disposable.add(dom.addDisposableListener(element, dom.EventType.CLICK, (e) => {
    e.preventDefault();
    e.stopPropagation();
    clickHandler();
  }));
  disposable.add(hoverService.setupDelayedHover(element, () => getHoverContent(ariaLabel, attachment), commonHoverLifecycleOptions));
  return disposable;
}
function getHoverContent(ariaLabel, attachment) {
  {
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.setAttribute("aria-label", ariaLabel);
    const commandTitle = dom.$("div", {}, typeof attachment.exitCode === "number" ? localize("chat.terminalCommandHoverCommandTitleExit", "Command: {0}, exit code: {1}", attachment.command, attachment.exitCode) : localize("chat.terminalCommandHoverCommandTitle", "Command"));
    commandTitle.classList.add("attachment-additional-info");
    const commandBlock = dom.$("pre.chat-terminal-command-block");
    hoverElement.append(commandTitle, commandBlock);
    if (attachment.output && attachment.output.trim().length > 0) {
      const outputTitle = dom.$("div", {}, localize("chat.terminalCommandHoverOutputTitle", "Output:"));
      outputTitle.classList.add("attachment-additional-info");
      const outputBlock = dom.$("pre.chat-terminal-command-output");
      const fullOutputLines = attachment.output.split("\n");
      const hoverOutputLines = [];
      for (const line of fullOutputLines) {
        if (hoverOutputLines.length >= 5 /* MaxAttachmentOutputLineCount */) {
          hoverOutputLines.push("...");
          break;
        }
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        if (trimmed.length > 80 /* MaxAttachmentOutputLineLength */) {
          hoverOutputLines.push(`${trimmed.slice(0, 80 /* MaxAttachmentOutputLineLength */)}...`);
        } else {
          hoverOutputLines.push(trimmed);
        }
      }
      outputBlock.textContent = hoverOutputLines.join("\n");
      hoverElement.append(outputTitle, outputBlock);
    }
    return {
      ...commonHoverOptions,
      content: hoverElement
    };
  }
}
let ImageAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, instantiationService, labelService, chatImageCarouselService, fileDialogService, fileService, notificationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.labelService = labelService;
    this.chatImageCarouselService = chatImageCarouselService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.element.classList.add("image-attachment");
    const isAutoModel = isAutoLanguageModel(currentLanguageModel);
    const modelName = currentLanguageModel?.metadata.name;
    const omittedState = getEffectiveImageOmittedState(attachment.omittedState, currentLanguageModel, options.isCurrentInput);
    this.element.classList.toggle("auto-image-warning", isAutoModel);
    let ariaLabel;
    if (omittedState === OmittedState.Full && modelName && !modelSupportsVision(currentLanguageModel)) {
      ariaLabel = localize("chat.unsupportedImageAttachment", "Image not sent because {0} does not support images: {1}", modelName, attachment.name);
    } else if (omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedImageAttachment", "Omitted this image: {0}", attachment.name);
    } else if (omittedState === OmittedState.Partial) {
      ariaLabel = localize("chat.partiallyOmittedImageAttachment", "Partially omitted this image: {0}", attachment.name);
    } else if (omittedState === OmittedState.ImageLimitExceeded) {
      ariaLabel = localize("chat.imageLimitExceededAttachment", "Image not sent due to limit: {0}", attachment.name);
    } else if (isAutoModel) {
      ariaLabel = localize("chat.autoImageAttachment", "Attached image, {0}. Image support depends on the model selected by Auto.", attachment.name);
    } else {
      ariaLabel = localize("chat.imageAttachment", "Attached image, {0}", attachment.name);
    }
    const ref = attachment.references?.[0]?.reference;
    resource = ref && URI.isUri(ref) ? ref : void 0;
    const imageData = coerceImageBuffer(attachment.value);
    const clickHandler = async () => {
      if ((resource || imageData) && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
        await this.openInCarousel(attachment.id, attachment.name, imageData, resource, options.isCurrentInput);
      } else if (resource) {
        await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, void 0);
      }
    };
    const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : "Current model";
    const fullName = resource ? this.labelService.getUriLabel(resource) : attachment.fullName || attachment.name;
    const imageElements = this._register(new MutableDisposable());
    const renderImageElements = (buffer) => {
      imageElements.value = createImageElements(resource, attachment.name, fullName, this.element, buffer, attachment.id, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, omittedState);
      this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    };
    renderImageElements(imageData ?? new Uint8Array());
    if (!imageData && resource && omittedState !== OmittedState.Full && omittedState !== OmittedState.ImageLimitExceeded) {
      void this.loadImageBytes(resource, renderImageElements);
    }
    this.attachSaveButton(resource, imageData, attachment.name, options.supportsDeletion);
    const canOpenCarousel = !!imageData && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled);
    if (canOpenCarousel || resource) {
      this.element.style.cursor = "pointer";
      this._register(registerOpenEditorListeners(this.element, async () => {
        await clickHandler();
      }));
    }
    if (resource) {
      instantiationService.invokeFunction((accessor) => {
        this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
      });
    }
  }
  async loadImageBytes(resource, render) {
    let content;
    try {
      content = (await this.fileService.readFile(resource)).value;
    } catch {
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    render(content.buffer);
  }
  async openInCarousel(id, name, data, referenceUri, preferCurrentInput) {
    const resource = referenceUri ?? URI.from({ scheme: "data", path: `${id}/${encodeURIComponent(name)}` });
    await this.chatImageCarouselService.openCarouselAtResource(resource, data, { preferCurrentInput });
  }
  attachSaveButton(resource, imageData, name, supportsDeletion) {
    if (supportsDeletion || !resource && !imageData) {
      return;
    }
    const saveButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.saveImageButton", "Save Image As...")
    });
    saveButton.element.classList.add("chat-attached-context-download-button");
    saveButton.element.tabIndex = -1;
    saveButton.icon = Codicon.cloudDownload;
    this._register(saveButton);
    this._register(saveButton.onDidClick(async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultUri = joinPath(await this.fileDialogService.defaultFilePath(), name);
      const target = await this.fileDialogService.showSaveDialog({ defaultUri });
      if (!target) {
        return;
      }
      try {
        if (resource) {
          await this.fileService.copy(resource, target, true);
        } else if (imageData) {
          await this.fileService.writeFile(target, VSBuffer.wrap(imageData));
        }
      } catch (error) {
        this.notificationService.error(localize("chat.attachment.saveImageError", "Failed to save image: {0}", error));
      }
    }));
  }
};
ImageAttachmentWidget = __decorateClass([
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IChatImageCarouselService),
  __decorateParam(14, IFileDialogService),
  __decorateParam(15, IFileService),
  __decorateParam(16, INotificationService)
], ImageAttachmentWidget);
function createImageHoverContent(resource, fullName, buffer, cacheKey, onContentsChanged, clickHandler, onImageUrl, imageAlt = "") {
  const disposable = new DisposableStore();
  const hoverElement = dom.$("div.chat-attached-context-hover");
  const hoverImage = dom.$("img.chat-attached-context-image", { alt: imageAlt });
  const imageContainer = dom.$("div.chat-attached-context-image-container", {}, hoverImage);
  hoverElement.appendChild(imageContainer);
  if (clickHandler) {
    imageContainer.classList.add("clickable");
    imageContainer.tabIndex = 0;
    imageContainer.role = "button";
    imageContainer.ariaLabel = localize("chat.openImagePreview", "Open in Images Preview");
    disposable.add(registerOpenEditorListeners(imageContainer, async () => {
      await clickHandler();
    }));
  }
  if (resource) {
    const urlContainer = clickHandler ? dom.$("a.chat-attached-context-url", {}, fullName) : dom.$("div.chat-attached-context-url", {}, fullName);
    const separator = dom.$("div.chat-attached-context-url-separator");
    if (clickHandler) {
      disposable.add(dom.addDisposableListener(urlContainer, "click", clickHandler));
    }
    hoverElement.append(separator, urlContainer);
  }
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const previewImageUrl = disposable.add(new MutableDisposable());
  const renderPreviewImage = async () => {
    const thumbnail = await getOrCreateImageThumbnail(cacheKey, data, CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE);
    if (disposable.isDisposed) {
      return;
    }
    const source = thumbnail ?? new Blob([data]);
    const url = URL.createObjectURL(source);
    previewImageUrl.value = toDisposable(() => URL.revokeObjectURL(url));
    hoverImage.onload = () => onContentsChanged?.();
    hoverImage.src = url;
    onImageUrl?.(url, !!thumbnail, hoverImage);
  };
  void renderPreviewImage();
  return { element: hoverElement, disposable };
}
function createImageElements(resource, name, fullName, element, buffer, cacheKey, hoverService, ariaLabel, currentLanguageModelName, clickHandler, currentLanguageModel, omittedState) {
  const disposable = new DisposableStore();
  if (omittedState === OmittedState.Partial) {
    element.classList.add("partial-warning");
  }
  element.ariaLabel = ariaLabel;
  element.style.position = "relative";
  if (resource) {
    element.style.cursor = "pointer";
  }
  const supportsVision = modelSupportsVision(currentLanguageModel);
  const pillIcon = dom.$("div.chat-attached-context-pill", {}, dom.$(supportsVision ? "span.codicon.codicon-file-media" : "span.codicon.codicon-warning"));
  const textLabel = dom.$("span.chat-attached-context-custom-text", {}, name);
  element.appendChild(pillIcon);
  element.appendChild(textLabel);
  let currentPill = pillIcon;
  const replacePill = (pill) => {
    currentPill.replaceWith(pill);
    currentPill = pill;
  };
  const hoverElement = dom.$("div.chat-attached-context-hover");
  hoverElement.setAttribute("aria-label", ariaLabel);
  if (!supportsVision && currentLanguageModel || omittedState === OmittedState.Full) {
    element.classList.add("warning");
    hoverElement.textContent = localize("chat.imageAttachmentHover", "{0} does not support images.", currentLanguageModelName ?? "This model");
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement,
      style: HoverStyle.Pointer
    }));
  } else if (omittedState === OmittedState.ImageLimitExceeded) {
    element.classList.add("warning");
    const maxImagesPerRequest = getImageAttachmentLimit(currentLanguageModel?.metadata);
    hoverElement.textContent = maxImagesPerRequest !== void 0 ? localize("chat.imageLimitExceededHover", "This image was not sent because the maximum of {0} images per request was exceeded.", maxImagesPerRequest) : localize("chat.imageLimitExceededHoverUnknownLimit", "This image was not sent because this model's image limit was exceeded.");
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement,
      style: HoverStyle.Pointer
    }));
  } else {
    const onImageFailed = () => {
      const pillIcon2 = dom.$("div.chat-attached-context-pill", {}, dom.$("span.codicon.codicon-file-media"));
      replacePill(pillIcon2);
    };
    const hoverFullName = omittedState === OmittedState.Partial ? localize("chat.imageAttachmentWarning", "This GIF was partially omitted - current frame will be sent.") : fullName;
    const hoverContent = createImageHoverContent(resource, hoverFullName, buffer, cacheKey, void 0, resource ? clickHandler : void 0, (url, isThumbnail, hoverImage) => {
      if (isThumbnail) {
        const pillImg = dom.$("img.chat-attached-context-pill-image", { src: url, alt: "" });
        const pill = dom.$("div.chat-attached-context-pill", {}, pillImg);
        replacePill(pill);
      }
      hoverImage.onerror = onImageFailed;
    });
    disposable.add(hoverContent.disposable);
    const hoverElement2 = hoverContent.element;
    hoverElement2.setAttribute("aria-label", ariaLabel);
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement2,
      style: HoverStyle.Pointer
    }));
    if (isAutoLanguageModel(currentLanguageModel)) {
      hoverElement2.appendChild(dom.$("div", void 0, localize("chat.autoImageAttachmentHover", "Image support depends on the model selected by Auto.")));
    }
  }
  disposable.add(toDisposable(() => {
    currentPill.remove();
    textLabel.remove();
  }));
  return disposable;
}
async function openPastedTextArtifact(accessor, attachment) {
  const editorService = accessor.get(IEditorService);
  const owned = accessor.get(IChatResponseResourceFileSystemProvider).associate(VSBuffer.fromString(attachment.code).buffer, { id: attachment.id, name: attachment.name });
  try {
    await editorService.openEditor({ resource: owned.resource, options: { pinned: true } });
  } catch (error) {
    owned.dispose();
    throw error;
  }
  const listener = editorService.onDidCloseEditor(() => {
    if (!editorService.editors.some((editor) => isEqual(editor.resource, owned.resource))) {
      owned.dispose();
      listener.dispose();
    }
  });
}
let PasteAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    const ariaLabel = localize("chat.attachment", "Attached context, {0}", attachment.name);
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    const classNames = ["file-icon", `${attachment.language}-lang-file-icon`];
    let resource;
    let range;
    if (attachment.copiedFrom) {
      resource = attachment.copiedFrom.uri;
      range = attachment.copiedFrom.range;
      const filename = basename(resource.path);
      this.label.setLabel(filename, void 0, { extraClasses: classNames });
    } else {
      this.label.setLabel(attachment.fileName, void 0, { extraClasses: classNames });
    }
    this.element.appendChild(dom.$("span.attachment-additional-info", {}, `Pasted ${attachment.pastedLines}`));
    this.element.style.position = "relative";
    const sourceUri = attachment.copiedFrom?.uri;
    const hoverContent = new MarkdownString(`${sourceUri ? this.instantiationService.invokeFunction((accessor) => accessor.get(ILabelService).getUriLabel(sourceUri, { relative: true })) : attachment.fileName}

---

\`\`\`${attachment.language}

${attachment.code}
\`\`\``);
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverContent
    }, commonHoverLifecycleOptions));
    const copiedFromResource = attachment.copiedFrom?.uri;
    if (copiedFromResource) {
      this._register(this.instantiationService.invokeFunction(hookUpResourceAttachmentDragAndContextMenu, this.element, copiedFromResource));
      this.addResourceOpenHandlers(copiedFromResource, range);
    } else if (isPastedTextArtifact(attachment)) {
      this.element.style.cursor = "pointer";
      this._register(registerOpenEditorListeners(this.element, async () => {
        await this.instantiationService.invokeFunction(openPastedTextArtifact, attachment);
      }));
    }
  }
};
PasteAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IInstantiationService)
], PasteAttachmentWidget);
let DefaultChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, contextKeyService, instantiationService, hoverService, modelService, languageService, themeService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.hoverService = hoverService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.themeService = themeService;
    this._tooltipHover = this._register(new MutableDisposable());
    const attachmentLabel = attachment.fullName ?? attachment.name;
    const description = correspondingContentReference?.options?.status?.description;
    const iconPath = isStringVariableEntry(attachment) || attachment.kind === "generic" ? attachment.iconPath : void 0;
    this._applyLabel(attachment, attachmentLabel, description, iconPath);
    if (iconPath && !ThemeIcon.isThemeIcon(iconPath) && !URI.isUri(iconPath)) {
      this._register(this.themeService.onDidColorThemeChange(() => this._applyLabel(attachment, attachmentLabel, description, iconPath)));
    }
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    if (attachment.kind === "diagnostic") {
      if (attachment.filterUri) {
        resource = attachment.filterUri ? URI.revive(attachment.filterUri) : void 0;
        range = attachment.filterRange;
      } else {
        this.element.style.cursor = "pointer";
        this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
          this.commandService.executeCommand("workbench.panel.markers.view.focus");
        }));
      }
    }
    if (attachment.kind === "symbol") {
      this._register(this.instantiationService.invokeFunction(hookUpSymbolAttachmentDragAndContextMenu, this.element, this.contextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext));
    }
    if (isStringVariableEntry(attachment) && attachment.commandId) {
      this.element.style.cursor = "pointer";
      const contextItemHandle = attachment.handle;
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async () => {
        const chatContextService = this.instantiationService.invokeFunction((accessor) => accessor.get(IChatContextService));
        await chatContextService.executeChatContextItemCommand(contextItemHandle);
      }));
    }
    if (attachment.kind === "debugEvents") {
      this.element.style.cursor = "pointer";
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
        const d = new Date(attachment.snapshotTime);
        const filter = `before:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
        this.commandService.executeCommand("workbench.action.chat.openAgentDebugPanelForSession", attachment.sessionResource, filter);
      }));
    }
    if ((isStringVariableEntry(attachment) || attachment.kind === "generic") && attachment.tooltip) {
      this._setupTooltipHover(attachment.tooltip);
    }
    if (resource) {
      this.addResourceOpenHandlers(resource, range);
    }
  }
  _applyLabel(attachment, attachmentLabel, description, iconPath) {
    if (isStringVariableEntry(attachment) && iconPath && ThemeIcon.isThemeIcon(iconPath) && (ThemeIcon.isFile(iconPath) || ThemeIcon.isFolder(iconPath)) && attachment.resourceUri) {
      const fileKind = ThemeIcon.isFolder(iconPath) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = getIconClasses(this.modelService, this.languageService, attachment.resourceUri, fileKind);
      this.label.setLabel(attachmentLabel, description, { extraClasses: iconClasses });
    } else if (iconPath) {
      const resolvedIcon = resolveChatContextIcon(iconPath, isDark(this.themeService.getColorTheme().type));
      this.label.setLabel(attachmentLabel, description, { iconPath: resolvedIcon });
    } else {
      const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
      this.label.setLabel(withIcon, description);
    }
  }
  _setupTooltipHover(tooltip) {
    this._tooltipHover.value = this.hoverService.setupDelayedHover(this.element, {
      content: tooltip,
      appearance: { showPointer: true }
    });
  }
};
DefaultChatAttachmentWidget = __decorateClass([
  __decorateParam(8, ICommandService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IModelService),
  __decorateParam(15, ILanguageService),
  __decorateParam(16, IThemeService)
], DefaultChatAttachmentWidget);
let PromptFileAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, labelService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.hintElement = dom.append(this.element, dom.$("span.prompt-type"));
    this.updateLabel(attachment);
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, attachment.value));
    });
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  updateLabel(attachment) {
    const resource = attachment.value;
    const fileBasename = basename(resource.path);
    const fileDirname = dirname(resource.path);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    const isPrompt = attachment.id.startsWith(PromptFileVariableKind.PromptFile);
    const ariaLabel = isPrompt ? localize("chat.promptAttachment", "Prompt file, {0}", friendlyName) : localize("chat.instructionsAttachment", "Instructions attachment, {0}", friendlyName);
    const typeLabel = isPrompt ? localize("prompt", "Prompt") : localize("instructions", "Instructions");
    const title = this.labelService.getUriLabel(resource) + (attachment.originLabel ? `
${attachment.originLabel}` : "");
    this.element.classList.remove("warning", "error");
    const fileWithoutExtension = getCleanPromptName(resource);
    this.label.setFile(URI.file(fileWithoutExtension), {
      fileKind: FileKind.FILE,
      hidePath: true,
      range: void 0,
      title,
      icon: ThemeIcon.fromId(Codicon.bookmark.id),
      extraClasses: []
    });
    this.hintElement.innerText = typeLabel;
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
};
PromptFileAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IInstantiationService)
], PromptFileAttachmentWidget);
let PromptTextAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, preferencesService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    if (attachment.settingId) {
      const openSettings = () => preferencesService.openSettings({ jsonEditor: false, query: `@id:${attachment.settingId}` });
      this.element.style.cursor = "pointer";
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async (e) => {
        dom.EventHelper.stop(e, true);
        openSettings();
      }));
      this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
        const event2 = new StandardKeyboardEvent(e);
        if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
          dom.EventHelper.stop(e, true);
          openSettings();
        }
      }));
    }
    this.label.setLabel(localize("instructions.label", "Additional Instructions"), void 0, void 0);
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    this._register(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: attachment.value
    }, commonHoverLifecycleOptions));
  }
};
PromptTextAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IPreferencesService),
  __decorateParam(9, IHoverService)
], PromptTextAttachmentWidget);
let ToolSetOrToolItemAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, toolsService, commandService, openerService, configurationService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    const toolOrToolSet = Iterable.find(toolsService.getTools(currentLanguageModel?.metadata), (tool) => tool.id === attachment.id) ?? Iterable.find(toolsService.getToolSetsForModel(currentLanguageModel?.metadata), (toolSet) => toolSet.id === attachment.id);
    let name = attachment.name;
    const icon = attachment.icon ?? Codicon.tools;
    if (isToolSet(toolOrToolSet)) {
      name = toolOrToolSet.referenceName;
    } else if (toolOrToolSet) {
      name = toolOrToolSet.toolReferenceName ?? name;
    }
    this.label.setLabel(`$(${icon.id})\xA0${name}`, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", name));
    let hoverContent;
    if (isToolSet(toolOrToolSet)) {
      hoverContent = localize("toolset", "{0} - {1}", toolOrToolSet.description ?? toolOrToolSet.referenceName, toolOrToolSet.source.label);
    } else if (toolOrToolSet) {
      hoverContent = localize("tool", "{0} - {1}", toolOrToolSet.userDescription ?? toolOrToolSet.modelDescription, toolOrToolSet.source.label);
    }
    if (hoverContent) {
      this._register(hoverService.setupDelayedHover(this.element, {
        ...commonHoverOptions,
        content: hoverContent
      }, commonHoverLifecycleOptions));
    }
  }
};
ToolSetOrToolItemAttachmentWidget = __decorateClass([
  __decorateParam(5, ILanguageModelToolsService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService)
], ToolSetOrToolItemAttachmentWidget);
let ChatReferenceAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    const title = attachment.name;
    const chatResource = attachment.value;
    this.label.setLabel(`$(${Codicon.commentDiscussion.id})\xA0${title}`, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment.chatReference", "Link to chat {0}", title));
    this._register(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: localize("chat.attachment.chatReference.hover", 'Open chat "{0}"', title)
    }, commonHoverLifecycleOptions));
    this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._openReferencedChat(chatResource);
    }));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._openReferencedChat(chatResource);
      }
    }));
  }
  async _openReferencedChat(chatResource) {
    const link = buildOpenSessionLinkForChatResource(chatResource);
    if (!link) {
      return;
    }
    await this.openerService.open(link);
  }
};
ChatReferenceAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService)
], ChatReferenceAttachmentWidget);
let TranscriptContextAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    const label = attachment.fullName ?? attachment.name;
    this.label.setLabel(attachment.icon ? `$(${attachment.icon.id})\xA0${label}` : label, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment.transcriptContext", "Open {0} in Browser", attachment.name));
    this._register(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: attachment.tooltip ?? localize("chat.attachment.transcriptContext.hover", "Open {0} in Browser", attachment.name)
    }, commonHoverLifecycleOptions));
    this._register(registerOpenEditorListeners(this.element, async () => {
      await openTranscriptContextAttachment(this.openerService, attachment);
    }));
  }
};
TranscriptContextAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService)
], TranscriptContextAttachmentWidget);
function openTranscriptContextAttachment(openerService, attachment) {
  return openerService.open(attachment.uri, { openExternal: true });
}
let NotebookCellOutputChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, notebookService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.notebookService = notebookService;
    this.instantiationService = instantiationService;
    switch (attachment.mimeType) {
      case "application/vnd.code.notebook.error": {
        this.renderErrorOutput(resource, attachment);
        break;
      }
      case "image/png":
      case "image/jpeg":
      case "image/svg": {
        this.renderImageOutput(resource, attachment);
        break;
      }
      default: {
        this.renderGenericOutput(resource, attachment);
      }
    }
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
    });
    this.addResourceOpenHandlers(resource, void 0);
  }
  getAriaLabel(attachment) {
    return localize("chat.NotebookImageAttachment", "Attached Notebook output, {0}", attachment.name);
  }
  renderErrorOutput(resource, attachment) {
    const attachmentLabel = attachment.name;
    const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
    const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
    let title = void 0;
    try {
      const error = JSON.parse(new TextDecoder().decode(buffer));
      if (error.name && error.message) {
        title = `${error.name}: ${error.message}`;
      }
    } catch {
    }
    this.label.setLabel(withIcon, void 0, { title });
    this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
  }
  renderGenericOutput(resource, attachment) {
    this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
    this.label.setFile(resource, { hidePath: true, icon: ThemeIcon.fromId("output") });
  }
  renderImageOutput(resource, attachment) {
    let ariaLabel;
    if (attachment.omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedNotebookImageAttachment", "Omitted this Notebook ouput: {0}", attachment.name);
    } else if (attachment.omittedState === OmittedState.Partial) {
      ariaLabel = localize("chat.partiallyOmittedNotebookImageAttachment", "Partially omitted this Notebook output: {0}", attachment.name);
    } else {
      ariaLabel = this.getAriaLabel(attachment);
    }
    const clickHandler = async () => await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, void 0);
    const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : void 0;
    const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
    this._register(createImageElements(resource, attachment.name, attachment.name, this.element, buffer, attachment.id, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState));
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
  getOutputItem(resource, attachment) {
    const parsedInfo = CellUri.parseCellOutputUri(resource);
    if (!parsedInfo || typeof parsedInfo.cellHandle !== "number" || typeof parsedInfo.outputIndex !== "number") {
      return void 0;
    }
    const notebook = this.notebookService.getNotebookTextModel(parsedInfo.notebook);
    if (!notebook) {
      return void 0;
    }
    const cell = notebook.cells.find((c) => c.handle === parsedInfo.cellHandle);
    if (!cell) {
      return void 0;
    }
    const output = cell.outputs.length > parsedInfo.outputIndex ? cell.outputs[parsedInfo.outputIndex] : void 0;
    return output?.outputs.find((o) => o.mime === attachment.mimeType);
  }
};
NotebookCellOutputChatAttachmentWidget = __decorateClass([
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, INotebookService),
  __decorateParam(12, IInstantiationService)
], NotebookCellOutputChatAttachmentWidget);
let ElementChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService, hoverService, fileService, logService, markdownRendererService, chatImageCarouselService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    this.hoverService = hoverService;
    this.fileService = fileService;
    this.logService = logService;
    this.markdownRendererService = markdownRendererService;
    this.chatImageCarouselService = chatImageCarouselService;
    const ariaLabel = localize("chat.elementAttachment", "Attached element, {0}", attachment.name);
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    this.element.style.position = "relative";
    this.element.style.cursor = "pointer";
    const attachmentLabel = attachment.name;
    const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
    this.label.setLabel(withIcon);
    this._register(this.hoverService.setupDelayedHover(this.element, this.getHoverContent(attachment), commonHoverLifecycleOptions));
    this._register(registerOpenEditorListeners(this.element, async () => {
      await this.openElementAttachment(attachment);
    }));
  }
  getHoverContent(attachment) {
    if (!this.shouldRenderRichElementHover(attachment)) {
      return this.getSimpleHoverContent(attachment);
    }
    const hoverElement = dom.$("div.chat-attached-context-hover.chat-element-hover");
    const scrollableContent = dom.$("div.chat-element-hover-content");
    const innerScrollables = [];
    if (attachment.imageData) {
      this.appendImagePreview(attachment, scrollableContent, () => scrollableElement.scanDomNode());
    }
    {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.element", "ELEMENT"));
      section.appendChild(header);
      const elementPre = dom.$("pre.chat-element-hover-code");
      const elementCode = dom.$("code");
      const tagDisplay = this.formatElementTag(attachment);
      elementCode.textContent = tagDisplay;
      elementPre.appendChild(elementCode);
      const elementScrollable = this._register(new DomScrollableElement(elementPre, {
        horizontal: ScrollbarVisibility.Auto,
        vertical: ScrollbarVisibility.Hidden
      }));
      innerScrollables.push(elementScrollable);
      section.appendChild(elementScrollable.getDomNode());
      scrollableContent.appendChild(section);
    }
    const computedStyleEntries = this.getComputedStyleEntriesForHover(attachment.computedStyles);
    if (computedStyleEntries.length > 0) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.computedStyles", "KEY COMPUTED STYLES"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      for (const [name, value] of computedStyleEntries) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, `${name}:`));
        const valueContainer = dom.$("span.chat-element-hover-value");
        if ((name === "color" || name === "background-color") && value) {
          const swatch = dom.$("span.chat-element-hover-color-swatch");
          swatch.style.backgroundColor = value;
          valueContainer.appendChild(swatch);
        }
        valueContainer.appendChild(document.createTextNode(value));
        row.appendChild(valueContainer);
        table.appendChild(row);
      }
      section.appendChild(table);
      const showMoreButton = dom.$("button.chat-element-hover-show-more", { type: "button" }, localize("chat.elementHover.showMore", "Show More..."));
      this._register(dom.addDisposableListener(showMoreButton, dom.EventType.CLICK, async (e) => {
        dom.EventHelper.stop(e, true);
        await this.openElementAttachment(attachment);
      }));
      section.appendChild(showMoreButton);
      scrollableContent.appendChild(section);
    }
    if (attachment.ancestors && attachment.ancestors.length > 1) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.htmlPath", "HTML PATH"));
      section.appendChild(header);
      const lines = [];
      for (let i = 0; i < attachment.ancestors.length; i++) {
        const ancestor = attachment.ancestors[i];
        const indent = "  ".repeat(i);
        const tag = this.formatAncestorTag(ancestor);
        lines.push(`${indent}${tag}`);
      }
      const pathPre = dom.$("pre.chat-element-hover-code");
      const pathCode = dom.$("code");
      pathCode.textContent = lines.join("\n");
      pathPre.appendChild(pathCode);
      const pathScrollable = this._register(new DomScrollableElement(pathPre, {
        horizontal: ScrollbarVisibility.Auto,
        vertical: ScrollbarVisibility.Hidden
      }));
      innerScrollables.push(pathScrollable);
      section.appendChild(pathScrollable.getDomNode());
      scrollableContent.appendChild(section);
    }
    if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.attributes", "ATTRIBUTES"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      for (const [name, value] of Object.entries(attachment.attributes)) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, `${name}:`));
        row.appendChild(dom.$("span.chat-element-hover-value", {}, value));
        table.appendChild(row);
      }
      section.appendChild(table);
      scrollableContent.appendChild(section);
    }
    if (attachment.dimensions) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.positionSize", "POSITION & SIZE"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      const dims = [
        ["top:", attachment.dimensions.top],
        ["left:", attachment.dimensions.left],
        ["width:", attachment.dimensions.width],
        ["height:", attachment.dimensions.height]
      ];
      for (const [label, val] of dims) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, label));
        row.appendChild(dom.$("span.chat-element-hover-value", {}, `${Math.round(val)}px`));
        table.appendChild(row);
      }
      section.appendChild(table);
      scrollableContent.appendChild(section);
    }
    if (attachment.innerText) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.innerText", "INNER TEXT"));
      section.appendChild(header);
      section.appendChild(dom.$("div.chat-element-hover-text", {}, attachment.innerText));
      scrollableContent.appendChild(section);
    }
    const scrollableElement = this._register(new DomScrollableElement(scrollableContent, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    const scrollableDomNode = scrollableElement.getDomNode();
    scrollableDomNode.classList.add("chat-element-hover-scrollable");
    hoverElement.appendChild(scrollableDomNode);
    return {
      ...commonHoverOptions,
      content: hoverElement,
      additionalClasses: ["chat-element-data-hover"],
      onDidShow: () => {
        for (const s of innerScrollables) {
          s.scanDomNode();
        }
        scrollableElement.scanDomNode();
      }
    };
  }
  shouldRenderRichElementHover(attachment) {
    if (attachment.dimensions || attachment.innerText) {
      return true;
    }
    if (attachment.ancestors && attachment.ancestors.length > 0) {
      return true;
    }
    if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
      return true;
    }
    if (attachment.computedStyles && Object.keys(attachment.computedStyles).length > 0) {
      return true;
    }
    return false;
  }
  appendImagePreview(attachment, container, onContentsChanged) {
    const section = dom.$("div.chat-element-hover-section.chat-element-hover-screenshot");
    section.appendChild(dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.screenshot", "SCREENSHOT")));
    container.appendChild(section);
    const previewDisposables = this._register(new DisposableStore());
    const appendPreview = (data) => {
      if (previewDisposables.isDisposed) {
        return;
      }
      const resource = URI.isUri(attachment.imageData) ? attachment.imageData : URI.from({ scheme: Schemas.data, path: `${attachment.id}/${encodeURIComponent(attachment.name)}` });
      const clickHandler = this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled) ? async () => this.chatImageCarouselService.openCarouselAtResource(resource, data) : void 0;
      const preview = createImageHoverContent(
        void 0,
        attachment.name,
        data,
        `${attachment.id}:screenshot`,
        onContentsChanged,
        clickHandler,
        void 0,
        localize("chat.elementHover.screenshotAlt", "Screenshot of attached element {0}", attachment.name)
      );
      previewDisposables.add(preview.disposable);
      section.appendChild(preview.element);
    };
    const inlineData = coerceImageBuffer(attachment.imageData);
    if (inlineData) {
      appendPreview(inlineData);
    } else if (URI.isUri(attachment.imageData)) {
      void this.fileService.readFile(attachment.imageData).then(
        (content) => appendPreview(content.value.buffer),
        (error) => {
          this.logService.warn(`[ElementChatAttachmentWidget] Failed to read screenshot '${attachment.imageData}': ${toErrorMessage(error)}`);
          section.remove();
          onContentsChanged();
        }
      );
    }
  }
  getSimpleHoverContent(attachment) {
    const content = attachment.value?.toString() ?? "";
    const hoverContent = new MarkdownString();
    hoverContent.appendText(attachment.fullName ?? attachment.name);
    if (content.trim().length > 0) {
      hoverContent.appendMarkdown("\n\n");
      hoverContent.appendCodeblock("text", content);
    }
    if (attachment.imageData) {
      const hoverElement = dom.$("div.chat-attached-context-hover.chat-element-hover");
      const scrollableContent = dom.$("div.chat-element-hover-content");
      this.appendImagePreview(attachment, scrollableContent, () => scrollableElement.scanDomNode());
      const markdownSection = dom.$("div.chat-element-hover-section");
      const renderedMarkdown = this._register(this.markdownRendererService.render(hoverContent));
      markdownSection.appendChild(renderedMarkdown.element);
      scrollableContent.appendChild(markdownSection);
      const scrollableElement = this._register(new DomScrollableElement(scrollableContent, {
        vertical: ScrollbarVisibility.Auto,
        horizontal: ScrollbarVisibility.Hidden,
        consumeMouseWheelIfScrollbarIsNeeded: true
      }));
      const scrollableDomNode = scrollableElement.getDomNode();
      scrollableDomNode.classList.add("chat-element-hover-scrollable");
      hoverElement.appendChild(scrollableDomNode);
      return {
        ...commonHoverOptions,
        content: hoverElement,
        additionalClasses: ["chat-element-data-hover"],
        onDidShow: () => scrollableElement.scanDomNode()
      };
    }
    return {
      ...commonHoverOptions,
      content: hoverContent
    };
  }
  getComputedStyleEntriesForHover(computedStyles) {
    if (!computedStyles) {
      return [];
    }
    const keyEntries = [];
    for (const property of KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES) {
      if (property === "margin" || property === "padding") {
        const shorthand = this.getBoxShorthandValue(computedStyles, property);
        if (typeof shorthand === "string") {
          keyEntries.push([property, shorthand]);
          continue;
        }
      }
      const value = computedStyles[property];
      if (typeof value === "string") {
        keyEntries.push([property, value]);
      }
    }
    if (keyEntries.length > 0) {
      return keyEntries;
    }
    return Object.entries(computedStyles).slice(0, KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES.length);
  }
  getBoxShorthandValue(computedStyles, propertyName) {
    const top = computedStyles[`${propertyName}-top`];
    const right = computedStyles[`${propertyName}-right`];
    const bottom = computedStyles[`${propertyName}-bottom`];
    const left = computedStyles[`${propertyName}-left`];
    if (typeof top === "string" && typeof right === "string" && typeof bottom === "string" && typeof left === "string") {
      return `${top} ${right} ${bottom} ${left}`;
    }
    return computedStyles[propertyName];
  }
  async openElementAttachment(attachment) {
    const content = attachment.value?.toString() || "";
    await this.editorService.openEditor({
      resource: void 0,
      contents: content,
      options: {
        pinned: true
      }
    });
  }
  formatElementTag(attachment) {
    const content = attachment.value?.toString() ?? "";
    const htmlMatch = content.match(/\n\n(<[^>]+>)/);
    if (htmlMatch) {
      return htmlMatch[1];
    }
    const fallback = content.match(/<([^>]+)>/);
    if (fallback) {
      return `<${fallback[1]}>`;
    }
    return `<${attachment.name}>`;
  }
  formatAncestorTag(ancestor) {
    const parts = [`<${ancestor.tagName}`];
    if (ancestor.classNames?.length) {
      parts.push(` class="${ancestor.classNames.join(" ")}"`);
    }
    if (ancestor.id) {
      parts.push(` id="${ancestor.id}"`);
    }
    return parts.join("") + ">";
  }
};
ElementChatAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IFileService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IMarkdownRendererService),
  __decorateParam(13, IChatImageCarouselService)
], ElementChatAttachmentWidget);
let SCMHistoryItemAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, markdownRendererService, hoverService, openerService, configurationService, themeService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.label.setLabel(attachment.name, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
    this._store.add(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content
    }, commonHoverLifecycleOptions));
    this._store.add(disposables);
    this._store.add(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._openAttachment(attachment);
    }));
    this._store.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._openAttachment(attachment);
      }
    }));
  }
  async _openAttachment(attachment) {
    await this.commandService.executeCommand("_workbench.openMultiDiffEditor", {
      title: getHistoryItemEditorTitle(attachment.historyItem),
      multiDiffSourceUri: attachment.value
    });
  }
};
SCMHistoryItemAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IMarkdownRendererService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeService)
], SCMHistoryItemAttachmentWidget);
let SCMHistoryItemChangeAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, hoverService, markdownRendererService, openerService, configurationService, themeService, editorService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    const nameSuffix = `\xA0$(${Codicon.gitCommit.id})${attachment.historyItem.displayId ?? attachment.historyItem.id}`;
    this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
    this._store.add(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content
    }, commonHoverLifecycleOptions));
    this._store.add(disposables);
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  async openResource(resource, options, isDirectory, range) {
    const attachment = this.attachment;
    const historyItem = attachment.historyItem;
    await this.editorService.openEditor({
      resource,
      label: `${basename(resource.path)} (${historyItem.displayId ?? historyItem.id})`,
      options: { ...options.editorOptions }
    }, options.openToSide ? SIDE_GROUP : void 0);
  }
};
SCMHistoryItemChangeAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IEditorService)
], SCMHistoryItemChangeAttachmentWidget);
let SCMHistoryItemChangeRangeAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    const historyItemStartId = attachment.historyItemChangeStart.historyItem.displayId ?? attachment.historyItemChangeStart.historyItem.id;
    const historyItemEndId = attachment.historyItemChangeEnd.historyItem.displayId ?? attachment.historyItemChangeEnd.historyItem.id;
    const nameSuffix = `\xA0$(${Codicon.gitCommit.id})${historyItemStartId}..${historyItemEndId}`;
    this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  async openResource(resource, options, isDirectory, range) {
    const attachment = this.attachment;
    const historyItemChangeStart = attachment.historyItemChangeStart;
    const historyItemChangeEnd = attachment.historyItemChangeEnd;
    const originalUriTitle = `${basename(historyItemChangeStart.uri.fsPath)} (${historyItemChangeStart.historyItem.displayId ?? historyItemChangeStart.historyItem.id})`;
    const modifiedUriTitle = `${basename(historyItemChangeEnd.uri.fsPath)} (${historyItemChangeEnd.historyItem.displayId ?? historyItemChangeEnd.historyItem.id})`;
    await this.editorService.openEditor({
      original: { resource: historyItemChangeStart.uri },
      modified: { resource: historyItemChangeEnd.uri },
      label: `${originalUriTitle} \u2194 ${modifiedUriTitle}`,
      options: { ...options.editorOptions }
    }, options.openToSide ? SIDE_GROUP : void 0);
  }
};
SCMHistoryItemChangeRangeAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IEditorService)
], SCMHistoryItemChangeRangeAttachmentWidget);
let BrowserViewAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(_attachment, currentLanguageModel, _options, container, contextResourceLabels, commandService, openerService, configurationService, _browserViewService, _hoverService, _editorService, _instantiationService) {
    super(_attachment, _options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this._attachment = _attachment;
    this._options = _options;
    this._browserViewService = _browserViewService;
    this._hoverService = _hoverService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._inputListeners = this._register(new DisposableStore());
    this._resolveInput();
    this._register(this._browserViewService.onDidChangeBrowserViews(() => this._resolveInput()));
    this._register(this._browserViewService.onDidChangeSharingAvailable(() => this._updateLabel()));
    this._register(this._hoverService.setupDelayedHover(this.element, () => ({
      ...commonHoverOptions,
      content: this._input ? {
        [BrowserViewSharingState.Shared]: this._input.getTitle() ?? "",
        [BrowserViewSharingState.NotShared]: localize("chat.browserViewNotShared", "This browser page is not shared with the agent."),
        [BrowserViewSharingState.Unavailable]: localize("chat.browserToolsDisabled", "Browser tools are not enabled.")
      }[this._input.model?.sharingState ?? BrowserViewSharingState.Shared] : localize("chat.browserViewClosed", "This browser page is no longer open.")
    }), commonHoverLifecycleOptions));
    this._instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, _attachment.value));
    });
    this.addResourceOpenHandlers(_attachment.value, void 0);
  }
  /**
   * Look up the current BrowserEditorInput for this attachment's browser ID, bind listeners, and refresh the UI.
   */
  _resolveInput() {
    const input = this._browserViewService.getKnownBrowserViews().get(this._attachment.browserId);
    if (this._input === input) {
      return;
    }
    this._inputListeners.clear();
    this._input = input;
    if (input) {
      this._inputListeners.add(input.onWillDispose(() => {
        this._input = void 0;
        this._inputListeners.clear();
        this._updateLabel();
      }));
      if (this._options.supportsDeletion) {
        this._inputListeners.add(input.onDidChangeLabel(() => this._updateLabel()));
      }
      if (input.model) {
        this._inputListeners.add(input.model.onDidChangeSharingState(() => this._updateLabel()));
      } else {
        this._inputListeners.add(input.onDidResolveModel(() => {
          this._inputListeners.add(input.model.onDidChangeSharingState(() => this._updateLabel()));
          this._updateLabel();
        }));
      }
    }
    this._updateLabel();
  }
  _updateLabel() {
    const name = this._input?.getName() ?? this._attachment.name;
    const sharingState = this._input?.model?.sharingState ?? BrowserViewSharingState.Shared;
    const isAvailable = !!this._input && sharingState === BrowserViewSharingState.Shared;
    this.element.classList.toggle("warning", !isAvailable);
    this.label.setLabel(name, void 0, {
      iconPath: Codicon.globe,
      strikethrough: !isAvailable
    });
    this.element.ariaLabel = this.appendDeletionHint(
      this._input ? {
        [BrowserViewSharingState.Shared]: localize("chat.browserViewAttachment.aria", "Attached browser page, {0}", name),
        [BrowserViewSharingState.NotShared]: localize("chat.browserViewNotShared.aria", "Browser page not shared with agent, {0}", name),
        [BrowserViewSharingState.Unavailable]: localize("chat.browserToolsDisabled.aria", "Browser tools are not enabled, {0}", name)
      }[sharingState] : localize("chat.browserViewClosed.aria", "Browser page unavailable, {0}", name)
    );
  }
  async openResource(_resource, options, _isDirectory, _range) {
    if (this._input) {
      await this._editorService.openEditor(this._input, options.editorOptions, options.openToSide ? SIDE_GROUP : void 0);
    }
  }
};
BrowserViewAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IBrowserViewWorkbenchService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IInstantiationService)
], BrowserViewAttachmentWidget);
function hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource) {
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const store = new DisposableStore();
  const scopedContextKeyService = store.add(contextKeyService.createScoped(widget));
  setResourceContext(accessor, scopedContextKeyService, resource);
  widget.draggable = true;
  store.add(dom.addDisposableListener(widget, "dragstart", (e) => {
    instantiationService.invokeFunction((accessor2) => fillEditorsDragData(accessor2, [resource], e));
    e.dataTransfer?.setDragImage(widget, 0, 0);
  }));
  store.add(addBasicContextMenu(accessor, widget, scopedContextKeyService, MenuId.ChatInputResourceAttachmentContext, resource));
  return store;
}
function hookUpSymbolAttachmentDragAndContextMenu(accessor, widget, parentContextKeyService, attachment, contextMenuId) {
  const instantiationService = accessor.get(IInstantiationService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const textModelService = accessor.get(ITextModelService);
  const contextMenuService = accessor.get(IContextMenuService);
  const menuService = accessor.get(IMenuService);
  const store = new DisposableStore();
  widget.draggable = true;
  store.add(dom.addDisposableListener(widget, "dragstart", (e) => {
    instantiationService.invokeFunction((accessor2) => fillEditorsDragData(accessor2, [{ resource: attachment.value.uri, selection: attachment.value.range }], e));
    fillInSymbolsDragData([{
      fsPath: attachment.value.uri.fsPath,
      range: attachment.value.range,
      name: attachment.name,
      kind: attachment.kind
    }], e);
    e.dataTransfer?.setDragImage(widget, 0, 0);
  }));
  let scopedContextKeyService;
  let providerContexts;
  const ensureContextKeyService = () => {
    if (!scopedContextKeyService) {
      scopedContextKeyService = store.add(parentContextKeyService.createScoped(widget));
      chatAttachmentResourceContextKey.bindTo(scopedContextKeyService).set(attachment.value.uri.toString());
      setResourceContext(accessor, scopedContextKeyService, attachment.value.uri);
    }
    return scopedContextKeyService;
  };
  const ensureProviderContexts = () => {
    const cks = ensureContextKeyService();
    if (!providerContexts) {
      providerContexts = [
        [EditorContextKeys.hasDefinitionProvider.bindTo(cks), languageFeaturesService.definitionProvider],
        [EditorContextKeys.hasReferenceProvider.bindTo(cks), languageFeaturesService.referenceProvider],
        [EditorContextKeys.hasImplementationProvider.bindTo(cks), languageFeaturesService.implementationProvider],
        [EditorContextKeys.hasTypeDefinitionProvider.bindTo(cks), languageFeaturesService.typeDefinitionProvider]
      ];
    }
  };
  const updateContextKeys = async () => {
    ensureProviderContexts();
    const modelRef = await textModelService.createModelReference(attachment.value.uri);
    try {
      const model = modelRef.object.textEditorModel;
      for (const [contextKey, registry] of providerContexts) {
        contextKey.set(registry.has(model));
      }
    } finally {
      modelRef.dispose();
    }
  };
  store.add(dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
    const event2 = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
    dom.EventHelper.stop(domEvent, true);
    const cks = ensureContextKeyService();
    try {
      await updateContextKeys();
    } catch (e) {
      console.error(e);
    }
    contextMenuService.showContextMenu({
      contextKeyService: cks,
      getAnchor: () => event2,
      getActions: () => {
        const menu = menuService.getMenuActions(contextMenuId, cks, { arg: attachment.value });
        return getFlatContextMenuActions(menu);
      }
    });
  }));
  return store;
}
function setResourceContext(accessor, scopedContextKeyService, resource) {
  const fileService = accessor.get(IFileService);
  const languageService = accessor.get(ILanguageService);
  const modelService = accessor.get(IModelService);
  const resourceContextKey = new StaticResourceContextKey(scopedContextKeyService, fileService, languageService, modelService);
  resourceContextKey.set(resource);
}
function addBasicContextMenu(accessor, widget, scopedContextKeyService, menuId, arg, updateContextKeys) {
  const contextMenuService = accessor.get(IContextMenuService);
  const menuService = accessor.get(IMenuService);
  return dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
    const event2 = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
    dom.EventHelper.stop(domEvent, true);
    try {
      await updateContextKeys?.();
    } catch (e) {
      console.error(e);
    }
    contextMenuService.showContextMenu({
      contextKeyService: scopedContextKeyService,
      getAnchor: () => event2,
      getActions: () => {
        const menu = menuService.getMenuActions(menuId, scopedContextKeyService, { arg });
        return getFlatContextMenuActions(menu);
      }
    });
  });
}
const chatAttachmentResourceContextKey = new RawContextKey("chatAttachmentResource", void 0, { type: "URI", description: localize("resource", "The full value of the chat attachment resource, including scheme and path") });
export {
  BrowserViewAttachmentWidget,
  ChatReferenceAttachmentWidget,
  DefaultChatAttachmentWidget,
  ElementChatAttachmentWidget,
  FileAttachmentWidget,
  ImageAttachmentWidget,
  NotebookCellOutputChatAttachmentWidget,
  PasteAttachmentWidget,
  PromptFileAttachmentWidget,
  PromptTextAttachmentWidget,
  SCMHistoryItemAttachmentWidget,
  SCMHistoryItemChangeAttachmentWidget,
  SCMHistoryItemChangeRangeAttachmentWidget,
  TerminalCommandAttachmentWidget,
  ToolSetOrToolItemAttachmentWidget,
  TranscriptContextAttachmentWidget,
  chatAttachmentResourceContextKey,
  createImageHoverContent,
  getEffectiveImageOmittedState,
  hookUpResourceAttachmentDragAndContextMenu,
  hookUpSymbolAttachmentDragAndContextMenu,
  openPastedTextArtifact,
  openTranscriptContextAttachment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0QXR0YWNobWVudFdpZGdldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCBJRGVsYXllZEhvdmVyT3B0aW9ucywgdHlwZSBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLCB0eXBlIElIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCAqIGFzIGV2ZW50IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExvY2F0aW9uLCBTeW1ib2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgZmlsbEluU3ltYm9sc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElPcGVuRWRpdG9yT3B0aW9ucywgcmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UsIE9wZW5JbnRlcm5hbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBGb2xkZXJUaGVtZUljb24sIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUZpbGVMYWJlbE9wdGlvbnMsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFN0YXRpY1Jlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IHJldmVhbEluU2lkZUJhckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVBY3Rpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvSGlzdG9yeUl0ZW1Ib3ZlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9zY20vYnJvd3Nlci9zY21IaXN0b3J5LmpzJztcbmltcG9ydCB7IGdldEhpc3RvcnlJdGVtRWRpdG9yVGl0bGUgfSBmcm9tICcuLi8uLi8uLi9zY20vYnJvd3Nlci91dGlsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUsIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkT3BlblNlc3Npb25MaW5rRm9yQ2hhdFJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgY29lcmNlSW1hZ2VCdWZmZXIgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdEltYWdlRXh0cmFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0SW1hZ2VBdHRhY2htZW50TGltaXQsIGlzUGFzdGVkVGV4dEFydGlmYWN0LCBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RUcmFuc2NyaXB0Q29udGV4dFZhcmlhYmxlRW50cnksIElFbGVtZW50VmFyaWFibGVFbnRyeSwgSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSwgSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5LCBJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnksIElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnksIE9taXR0ZWRTdGF0ZSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnksIElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSwgSVRlcm1pbmFsVmFyaWFibGVFbnRyeSwgaXNTdHJpbmdWYXJpYWJsZUVudHJ5LCByZXNvbHZlQ2hhdENvbnRleHRJY29uLCBDaGF0Q29udGV4dEljb25QYXRoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBpc0F1dG9MYW5ndWFnZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBpc1Rvb2xTZXQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDbGVhblByb21wdE5hbWUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0U2VydmljZSB9IGZyb20gJy4uL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfSU1BR0VfSE9WRVJfVEhVTUJOQUlMX01BWF9TSVpFLCBnZXRPckNyZWF0ZUltYWdlVGh1bWJuYWlsIH0gZnJvbSAnLi4vY2hhdEltYWdlVXRpbHMuanMnO1xuXG5jb25zdCBjb21tb25Ib3Zlck9wdGlvbnM6IFBhcnRpYWw8SUhvdmVyT3B0aW9ucz4gPSB7XG5cdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdHBvc2l0aW9uOiB7XG5cdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPV1xuXHR9LFxuXHR0cmFwRm9jdXM6IHRydWUsXG59O1xuY29uc3QgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zOiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zID0ge1xuXHRncm91cElkOiAnY2hhdC1hdHRhY2htZW50cycsXG59O1xuXG5jb25zdCBLRVlfRUxFTUVOVF9IT1ZFUl9DT01QVVRFRF9TVFlMRV9QUk9QRVJUSUVTID0gW1xuXHQnZGlzcGxheScsXG5cdCdwb3NpdGlvbicsXG5cdCdtYXJnaW4nLFxuXHQncGFkZGluZycsXG5cdCdmb250LXNpemUnLFxuXHQnZm9udC1mYW1pbHknLFxuXHQnY29sb3InLFxuXHQnYmFja2dyb3VuZC1jb2xvcidcbl07XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGVsZXRlOiBldmVudC5FbWl0dGVyPEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBldmVudC5FbWl0dGVyPEV2ZW50PigpKTtcblx0Z2V0IG9uRGlkRGVsZXRlKCk6IGV2ZW50LkV2ZW50PEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRGVsZXRlLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuOiBldmVudC5FbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IGV2ZW50LkVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZE9wZW4oKTogZXZlbnQuRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZE9wZW4uZXZlbnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVybWluYWxTZXJ2aWNlPzogSVRlcm1pbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50LnNob3ctZmlsZS1pY29ucycpKTtcblx0XHR0aGlzLmF0dGFjaENsZWFyQnV0dG9uKCk7XG5cdFx0dGhpcy5sYWJlbCA9IGNvbnRleHRSZXNvdXJjZUxhYmVscy5jcmVhdGUodGhpcy5lbGVtZW50LCB7IHN1cHBvcnRJY29uczogdHJ1ZSwgaG92ZXJUYXJnZXRPdmVycmlkZTogdGhpcy5lbGVtZW50IH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWwpO1xuXHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5lbGVtZW50LnJvbGUgPSAnYnV0dG9uJztcblxuXHRcdC8vIEFkZCBtaWRkbGUtY2xpY2sgc3VwcG9ydCBmb3IgcmVtb3ZhbFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkFVWENMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uID09PSAxIC8qIE1pZGRsZSBCdXR0b24gKi8gJiYgdGhpcy5vcHRpb25zLnN1cHBvcnRzRGVsZXRpb24gJiYgIXRoaXMuYXR0YWNobWVudC5yYW5nZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGVsZXRlLmZpcmUoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG1vZGVsU3VwcG9ydHNWaXNpb24oKSB7XG5cdFx0cmV0dXJuIG1vZGVsU3VwcG9ydHNWaXNpb24odGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNDbGVhckJ1dHRvbiA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCBhcHBlbmREZWxldGlvbkhpbnQoYXJpYUxhYmVsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5faGFzQ2xlYXJCdXR0b24pIHtcblx0XHRcdHJldHVybiBhcmlhTGFiZWw7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LndpdGhEZWxldGVIaW50JywgXCJ7MH0gKERlbGV0ZSlcIiwgYXJpYUxhYmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhdHRhY2hDbGVhckJ1dHRvbigpIHtcblxuXHRcdC8vIFBhc3RlZCB0ZXh0IGFydGlmYWN0cyBrZWVwIHRoZWlyIGNsZWFyIGJ1dHRvbjogdGhlIHBpbGwgaXMgdGhlIHByaW1hcnlcblx0XHQvLyBoYW5kbGUgb24gY29udGVudCB0aGF0IG9ubHkgZXhpc3RzIGluIHRoZSBhdHRhY2htZW50LlxuXHRcdGlmICgodGhpcy5hdHRhY2htZW50LnJhbmdlICYmICFpc1Bhc3RlZFRleHRBcnRpZmFjdCh0aGlzLmF0dGFjaG1lbnQpKSB8fCAhdGhpcy5vcHRpb25zLnN1cHBvcnRzRGVsZXRpb24pIHtcblx0XHRcdC8vIG5vIGNsZWFyIGJ1dHRvbiBmb3IgYXR0YWNobWVudHMgd2l0aCByYW5nZXMgYmVjYXVzZSByYW5nZSBtZWFuc1xuXHRcdFx0Ly8gcmVmZXJlbmNlZCBmcm9tIHByb21wdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhc0NsZWFyQnV0dG9uID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGNsZWFyQnV0dG9uID0gbmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC5jbGVhckJ1dHRvbicsIFwiUmVtb3ZlIGZyb20gY29udGV4dFwiKVxuXHRcdH0pO1xuXHRcdGNsZWFyQnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRjbGVhckJ1dHRvbi5pY29uID0gQ29kaWNvbi5jbG9zZUNvbXBhY3Q7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xlYXJCdXR0b24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV2ZW50LkV2ZW50Lm9uY2UoY2xlYXJCdXR0b24ub25EaWRDbGljaykoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRGVsZXRlLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5CYWNrc3BhY2UgfHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLkRlbGV0ZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGVsZXRlLmZpcmUoZS5icm93c2VyRXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhyZXNvdXJjZTogVVJJLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyh0aGlzLmVsZW1lbnQsIGFzeW5jIG9wdGlvbnMgPT4ge1xuXHRcdFx0aWYgKHRoaXMuYXR0YWNobWVudC5raW5kID09PSAnZGlyZWN0b3J5Jykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5SZXNvdXJjZShyZXNvdXJjZSwgb3B0aW9ucywgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5SZXNvdXJjZShyZXNvdXJjZSwgb3B0aW9ucywgZmFsc2UsIHJhbmdlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IFBhcnRpYWw8SU9wZW5FZGl0b3JPcHRpb25zPiwgaXNEaXJlY3Rvcnk6IHRydWUpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IFBhcnRpYWw8SU9wZW5FZGl0b3JPcHRpb25zPiwgaXNEaXJlY3Rvcnk6IGZhbHNlLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcGVuT3B0aW9uczogUGFydGlhbDxJT3BlbkVkaXRvck9wdGlvbnM+LCBpc0RpcmVjdG9yeT86IGJvb2xlYW4sIHJhbmdlPzogSVJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBSZXZlYWwgRGlyZWN0b3J5IGluIGV4cGxvcmVyXG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHJldmVhbEluU2lkZUJhckNvbW1hbmQuaWQsIHJlc291cmNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLnRlcm1pbmFsU2VydmljZT8ub3BlblJlc291cmNlKHJlc291cmNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGZpbGUgaW4gZWRpdG9yXG5cdFx0Y29uc3Qgb3BlblRleHRFZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQgPSByYW5nZSA/IHsgc2VsZWN0aW9uOiByYW5nZSB9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9wdGlvbnM6IE9wZW5JbnRlcm5hbE9wdGlvbnMgPSB7XG5cdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRvcGVuVG9TaWRlOiBvcGVuT3B0aW9ucy5vcGVuVG9TaWRlLFxuXHRcdFx0ZWRpdG9yT3B0aW9uczoge1xuXHRcdFx0XHQuLi5vcGVuVGV4dEVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdC4uLm9wZW5PcHRpb25zLmVkaXRvck9wdGlvbnNcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHR0aGlzLl9vbkRpZE9wZW4uZmlyZSgpO1xuXHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vZGVsU3VwcG9ydHNWaXNpb24oY3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCkge1xuXHRyZXR1cm4gaXNBdXRvTGFuZ3VhZ2VNb2RlbChjdXJyZW50TGFuZ3VhZ2VNb2RlbCkgfHwgKGN1cnJlbnRMYW5ndWFnZU1vZGVsPy5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnZpc2lvbiA/PyBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZmZlY3RpdmVJbWFnZU9taXR0ZWRTdGF0ZShvbWl0dGVkU3RhdGU6IE9taXR0ZWRTdGF0ZSB8IHVuZGVmaW5lZCwgY3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgaXNDdXJyZW50SW5wdXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBPbWl0dGVkU3RhdGUgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gaXNBdXRvTGFuZ3VhZ2VNb2RlbChjdXJyZW50TGFuZ3VhZ2VNb2RlbCkgJiYgaXNDdXJyZW50SW5wdXQgJiYgb21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuRnVsbFxuXHRcdD8gT21pdHRlZFN0YXRlLk5vdE9taXR0ZWRcblx0XHQ6IG9taXR0ZWRTdGF0ZTtcbn1cblxuXG5leHBvcnQgY2xhc3MgRmlsZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZXNvdXJjZTogVVJJLFxuXHRcdHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSxcblx0XHRjb3JyZXNwb25kaW5nQ29udGVudFJlZmVyZW5jZTogSUNoYXRDb250ZW50UmVmZXJlbmNlIHwgdW5kZWZpbmVkLFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBmaWxlQmFzZW5hbWUgPSBiYXNlbmFtZShyZXNvdXJjZS5wYXRoKTtcblx0XHRjb25zdCBmaWxlRGlybmFtZSA9IGRpcm5hbWUocmVzb3VyY2UucGF0aCk7XG5cdFx0Y29uc3QgZnJpZW5kbHlOYW1lID0gYCR7ZmlsZUJhc2VuYW1lfSAke2ZpbGVEaXJuYW1lfWA7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IHJhbmdlID8gbG9jYWxpemUoJ2NoYXQuZmlsZUF0dGFjaG1lbnRXaXRoUmFuZ2UnLCBcIkF0dGFjaGVkIGZpbGUsIHswfSwgbGluZSB7MX0gdG8gbGluZSB7Mn1cIiwgZnJpZW5kbHlOYW1lLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXIpIDogbG9jYWxpemUoJ2NoYXQuZmlsZUF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGZpbGUsIHswfVwiLCBmcmllbmRseU5hbWUpO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQub21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuRnVsbCkge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQub21pdHRlZEZpbGVBdHRhY2htZW50JywgXCJPbWl0dGVkIHRoaXMgZmlsZTogezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0XHR0aGlzLnJlbmRlck9taXR0ZWRXYXJuaW5nKGZyaWVuZGx5TmFtZSwgYXJpYUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZmlsZU9wdGlvbnM6IElGaWxlTGFiZWxPcHRpb25zID0geyBoaWRlUGF0aDogdHJ1ZSwgdGl0bGU6IGNvcnJlc3BvbmRpbmdDb250ZW50UmVmZXJlbmNlPy5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uIH07XG5cdFx0XHR0aGlzLmxhYmVsLnNldEZpbGUocmVzb3VyY2UsIGF0dGFjaG1lbnQua2luZCA9PT0gJ2ZpbGUnID8ge1xuXHRcdFx0XHQuLi5maWxlT3B0aW9ucyxcblx0XHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0Li4uZmlsZU9wdGlvbnMsXG5cdFx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GT0xERVIsXG5cdFx0XHRcdGljb246ICF0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkuaGFzRm9sZGVySWNvbnMgPyBGb2xkZXJUaGVtZUljb24gOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIGlzIGEgZm9sZGVyIHdob3NlIGNvbnRlbnRzIHdvdWxkIGV4Y2VlZCB0aGUgbW9kZWwncyBwZXItcmVxdWVzdCBpbWFnZSBsaW1pdCwgc3VyZmFjZSBhIHdhcm5pbmcuXG5cdFx0XHRpZiAoYXR0YWNobWVudC5raW5kID09PSAnZGlyZWN0b3J5JyAmJiB0eXBlb2YgYXR0YWNobWVudC5pbWFnZUNvdW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRjb25zdCBtYXhJbWFnZXNQZXJSZXF1ZXN0ID0gZ2V0SW1hZ2VBdHRhY2htZW50TGltaXQoY3VycmVudExhbmd1YWdlTW9kZWw/Lm1ldGFkYXRhKTtcblx0XHRcdFx0aWYgKG1heEltYWdlc1BlclJlcXVlc3QgIT09IHVuZGVmaW5lZCAmJiBhdHRhY2htZW50LmltYWdlQ291bnQgPiBtYXhJbWFnZXNQZXJSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJGb2xkZXJJbWFnZUxpbWl0V2FybmluZyhhdHRhY2htZW50LmltYWdlQ291bnQsIG1heEltYWdlc1BlclJlcXVlc3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cdFx0aWYgKGF0dGFjaG1lbnQua2luZCA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHR0aGlzLmF0dGFjaFNhdmVCdXR0b24ocmVzb3VyY2UsIGZpbGVCYXNlbmFtZSwgb3B0aW9ucy5zdXBwb3J0c0RlbGV0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGhvb2tVcFJlc291cmNlQXR0YWNobWVudERyYWdBbmRDb250ZXh0TWVudShhY2Nlc3NvciwgdGhpcy5lbGVtZW50LCByZXNvdXJjZSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMocmVzb3VyY2UsIHJhbmdlKTtcblx0fVxuXG5cdHByaXZhdGUgYXR0YWNoU2F2ZUJ1dHRvbihyZXNvdXJjZTogVVJJLCBuYW1lOiBzdHJpbmcsIHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3VwcG9ydHNEZWxldGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhdmVCdXR0b24gPSBuZXcgQnV0dG9uKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LnNhdmVGaWxlQnV0dG9uJywgXCJTYXZlIEFzLi4uXCIpXG5cdFx0fSk7XG5cdFx0c2F2ZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtYXR0YWNoZWQtY29udGV4dC1kb3dubG9hZC1idXR0b24nKTtcblx0XHRzYXZlQnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRzYXZlQnV0dG9uLmljb24gPSBDb2RpY29uLmNsb3VkRG93bmxvYWQ7XG5cdFx0dGhpcy5lbGVtZW50Lmluc2VydEJlZm9yZShzYXZlQnV0dG9uLmVsZW1lbnQsIHRoaXMubGFiZWwuZWxlbWVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2F2ZUJ1dHRvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2F2ZUJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRVcmkgPSBqb2luUGF0aChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCgpLCBuYW1lKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coeyBkZWZhdWx0VXJpIH0pO1xuXHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNvcHkocmVzb3VyY2UsIHRhcmdldCwgdHJ1ZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC5zYXZlRmlsZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSBmaWxlOiB7MH1cIiwgZXJyb3IpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck9taXR0ZWRXYXJuaW5nKGZyaWVuZGx5TmFtZTogc3RyaW5nLCBhcmlhTGFiZWw6IHN0cmluZykge1xuXHRcdGNvbnN0IHBpbGxJY29uID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbCcsIHt9LCBkb20uJCgnc3Bhbi5jb2RpY29uLmNvZGljb24td2FybmluZycpKTtcblx0XHRjb25zdCB0ZXh0TGFiZWwgPSBkb20uJCgnc3Bhbi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtY3VzdG9tLXRleHQnLCB7fSwgZnJpZW5kbHlOYW1lKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbEljb24pO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0TGFiZWwpO1xuXG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXInKTtcblx0XHRob3ZlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2FybmluZycpO1xuXG5cdFx0aG92ZXJFbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQuZmlsZUF0dGFjaG1lbnRIb3ZlcicsIFwiezB9IGRvZXMgbm90IHN1cHBvcnQgdGhpcyBmaWxlIHR5cGUuXCIsIHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwuaWRlbnRpZmllcik/Lm5hbWUgOiB0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsID8/ICdUaGlzIG1vZGVsJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0fSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZvbGRlckltYWdlTGltaXRXYXJuaW5nKGltYWdlQ291bnQ6IG51bWJlciwgbGltaXQ6IG51bWJlcikge1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nJyk7XG5cblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1ob3ZlcicpO1xuXHRcdGhvdmVyRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0J2NoYXQuZm9sZGVySW1hZ2VMaW1pdEV4Y2VlZGVkSG92ZXInLFxuXHRcdFx0XCJUaGlzIGZvbGRlciBjb250YWlucyB7MH0gaW1hZ2VzLCB3aGljaCBleGNlZWRzIHRoZSBtYXhpbXVtIG9mIHsxfSBpbWFnZXMgcGVyIHJlcXVlc3QuIE9sZGVyIGltYWdlcyB3aWxsIG5vdCBiZSBzZW50LlwiLFxuXHRcdFx0aW1hZ2VDb3VudCxcblx0XHRcdGxpbWl0LFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0fSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxDb21tYW5kQXR0YWNobWVudFdpZGdldCBleHRlbmRzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGF0dGFjaG1lbnQ6IElUZXJtaW5hbFZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRlcm1pbmFsU2VydmljZSk7XG5cblx0XHRjb25zdCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbENvbW1hbmQnLCBcIlRlcm1pbmFsIGNvbW1hbmQsIHswfVwiLCBhdHRhY2htZW50LmNvbW1hbmQpO1xuXHRcdGNvbnN0IGNsaWNrSGFuZGxlciA9ICgpID0+IHRoaXMub3BlblJlc291cmNlKGF0dGFjaG1lbnQucmVzb3VyY2UsIHsgZWRpdG9yT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjcmVhdGVUZXJtaW5hbENvbW1hbmRFbGVtZW50cyh0aGlzLmVsZW1lbnQsIGF0dGFjaG1lbnQsIGFyaWFMYWJlbCwgdGhpcy5ob3ZlclNlcnZpY2UsIGNsaWNrSGFuZGxlcikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGFzeW5jIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgY2xpY2tIYW5kbGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBUZXJtaW5hbENvbnN0YW50cyB7XG5cdE1heEF0dGFjaG1lbnRPdXRwdXRMaW5lQ291bnQgPSA1LFxuXHRNYXhBdHRhY2htZW50T3V0cHV0TGluZUxlbmd0aCA9IDgwLFxufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXJtaW5hbENvbW1hbmRFbGVtZW50cyhcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdGF0dGFjaG1lbnQ6IElUZXJtaW5hbFZhcmlhYmxlRW50cnksXG5cdGFyaWFMYWJlbDogc3RyaW5nLFxuXHRob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdGNsaWNrSGFuZGxlcjogKCkgPT4gUHJvbWlzZTx2b2lkPlxuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRlbGVtZW50LmFyaWFMYWJlbCA9IGFyaWFMYWJlbDtcblx0ZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cblx0Y29uc3QgdGVybWluYWxJY29uU3BhbiA9IGRvbS4kKCdzcGFuJyk7XG5cdHRlcm1pbmFsSWNvblNwYW4uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRlcm1pbmFsKSk7XG5cdGNvbnN0IHBpbGxJY29uID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbCcsIHt9LCB0ZXJtaW5hbEljb25TcGFuKTtcblx0Y29uc3QgdGV4dExhYmVsID0gZG9tLiQoJ3NwYW4uY2hhdC1hdHRhY2hlZC1jb250ZXh0LWN1c3RvbS10ZXh0Jywge30sIGF0dGFjaG1lbnQuY29tbWFuZCk7XG5cdGVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbEljb24pO1xuXHRlbGVtZW50LmFwcGVuZENoaWxkKHRleHRMYWJlbCk7XG5cblx0ZGlzcG9zYWJsZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRjbGlja0hhbmRsZXIoKTtcblx0fSkpO1xuXG5cdGRpc3Bvc2FibGUuYWRkKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihlbGVtZW50LCAoKSA9PiBnZXRIb3ZlckNvbnRlbnQoYXJpYUxhYmVsLCBhdHRhY2htZW50KSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdHJldHVybiBkaXNwb3NhYmxlO1xufVxuXG5mdW5jdGlvbiBnZXRIb3ZlckNvbnRlbnQoYXJpYUxhYmVsOiBzdHJpbmcsIGF0dGFjaG1lbnQ6IElUZXJtaW5hbFZhcmlhYmxlRW50cnkpOiBJRGVsYXllZEhvdmVyT3B0aW9ucyB7XG5cdHtcblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1ob3ZlcicpO1xuXHRcdGhvdmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXG5cdFx0Y29uc3QgY29tbWFuZFRpdGxlID0gZG9tLiQoJ2RpdicsIHt9LCB0eXBlb2YgYXR0YWNobWVudC5leGl0Q29kZSA9PT0gJ251bWJlcidcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWxDb21tYW5kSG92ZXJDb21tYW5kVGl0bGVFeGl0JywgXCJDb21tYW5kOiB7MH0sIGV4aXQgY29kZTogezF9XCIsIGF0dGFjaG1lbnQuY29tbWFuZCwgYXR0YWNobWVudC5leGl0Q29kZSlcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGVybWluYWxDb21tYW5kSG92ZXJDb21tYW5kVGl0bGUnLCBcIkNvbW1hbmRcIikpO1xuXHRcdGNvbW1hbmRUaXRsZS5jbGFzc0xpc3QuYWRkKCdhdHRhY2htZW50LWFkZGl0aW9uYWwtaW5mbycpO1xuXHRcdGNvbnN0IGNvbW1hbmRCbG9jayA9IGRvbS4kKCdwcmUuY2hhdC10ZXJtaW5hbC1jb21tYW5kLWJsb2NrJyk7XG5cdFx0aG92ZXJFbGVtZW50LmFwcGVuZChjb21tYW5kVGl0bGUsIGNvbW1hbmRCbG9jayk7XG5cblx0XHRpZiAoYXR0YWNobWVudC5vdXRwdXQgJiYgYXR0YWNobWVudC5vdXRwdXQudHJpbSgpLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG91dHB1dFRpdGxlID0gZG9tLiQoJ2RpdicsIHt9LCBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbENvbW1hbmRIb3Zlck91dHB1dFRpdGxlJywgXCJPdXRwdXQ6XCIpKTtcblx0XHRcdG91dHB1dFRpdGxlLmNsYXNzTGlzdC5hZGQoJ2F0dGFjaG1lbnQtYWRkaXRpb25hbC1pbmZvJyk7XG5cdFx0XHRjb25zdCBvdXRwdXRCbG9jayA9IGRvbS4kKCdwcmUuY2hhdC10ZXJtaW5hbC1jb21tYW5kLW91dHB1dCcpO1xuXHRcdFx0Y29uc3QgZnVsbE91dHB1dExpbmVzID0gYXR0YWNobWVudC5vdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXJPdXRwdXRMaW5lcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGZ1bGxPdXRwdXRMaW5lcykge1xuXHRcdFx0XHRpZiAoaG92ZXJPdXRwdXRMaW5lcy5sZW5ndGggPj0gVGVybWluYWxDb25zdGFudHMuTWF4QXR0YWNobWVudE91dHB1dExpbmVDb3VudCkge1xuXHRcdFx0XHRcdGhvdmVyT3V0cHV0TGluZXMucHVzaCgnLi4uJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xuXHRcdFx0XHRpZiAodHJpbW1lZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHJpbW1lZC5sZW5ndGggPiBUZXJtaW5hbENvbnN0YW50cy5NYXhBdHRhY2htZW50T3V0cHV0TGluZUxlbmd0aCkge1xuXHRcdFx0XHRcdGhvdmVyT3V0cHV0TGluZXMucHVzaChgJHt0cmltbWVkLnNsaWNlKDAsIFRlcm1pbmFsQ29uc3RhbnRzLk1heEF0dGFjaG1lbnRPdXRwdXRMaW5lTGVuZ3RoKX0uLi5gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRob3Zlck91dHB1dExpbmVzLnB1c2godHJpbW1lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG91dHB1dEJsb2NrLnRleHRDb250ZW50ID0gaG92ZXJPdXRwdXRMaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdGhvdmVyRWxlbWVudC5hcHBlbmQob3V0cHV0VGl0bGUsIG91dHB1dEJsb2NrKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEltYWdlQXR0YWNobWVudFdpZGdldCBleHRlbmRzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbjsgaXNDdXJyZW50SW5wdXQ/OiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbWFnZUNhcm91c2VsU2VydmljZTogSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbWFnZS1hdHRhY2htZW50Jyk7XG5cblx0XHRjb25zdCBpc0F1dG9Nb2RlbCA9IGlzQXV0b0xhbmd1YWdlTW9kZWwoY3VycmVudExhbmd1YWdlTW9kZWwpO1xuXHRcdGNvbnN0IG1vZGVsTmFtZSA9IGN1cnJlbnRMYW5ndWFnZU1vZGVsPy5tZXRhZGF0YS5uYW1lO1xuXHRcdGNvbnN0IG9taXR0ZWRTdGF0ZSA9IGdldEVmZmVjdGl2ZUltYWdlT21pdHRlZFN0YXRlKGF0dGFjaG1lbnQub21pdHRlZFN0YXRlLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgb3B0aW9ucy5pc0N1cnJlbnRJbnB1dCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2F1dG8taW1hZ2Utd2FybmluZycsIGlzQXV0b01vZGVsKTtcblx0XHRsZXQgYXJpYUxhYmVsOiBzdHJpbmc7XG5cdFx0aWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGwgJiYgbW9kZWxOYW1lICYmICFtb2RlbFN1cHBvcnRzVmlzaW9uKGN1cnJlbnRMYW5ndWFnZU1vZGVsKSkge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQudW5zdXBwb3J0ZWRJbWFnZUF0dGFjaG1lbnQnLCBcIkltYWdlIG5vdCBzZW50IGJlY2F1c2UgezB9IGRvZXMgbm90IHN1cHBvcnQgaW1hZ2VzOiB7MX1cIiwgbW9kZWxOYW1lLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdH0gZWxzZSBpZiAob21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuRnVsbCkge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQub21pdHRlZEltYWdlQXR0YWNobWVudCcsIFwiT21pdHRlZCB0aGlzIGltYWdlOiB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2UgaWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLlBhcnRpYWwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBhcnRpYWxseU9taXR0ZWRJbWFnZUF0dGFjaG1lbnQnLCBcIlBhcnRpYWxseSBvbWl0dGVkIHRoaXMgaW1hZ2U6IHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdH0gZWxzZSBpZiAob21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuSW1hZ2VMaW1pdEV4Y2VlZGVkKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5pbWFnZUxpbWl0RXhjZWVkZWRBdHRhY2htZW50JywgXCJJbWFnZSBub3Qgc2VudCBkdWUgdG8gbGltaXQ6IHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoaXNBdXRvTW9kZWwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LmF1dG9JbWFnZUF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGltYWdlLCB7MH0uIEltYWdlIHN1cHBvcnQgZGVwZW5kcyBvbiB0aGUgbW9kZWwgc2VsZWN0ZWQgYnkgQXV0by5cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuaW1hZ2VBdHRhY2htZW50JywgXCJBdHRhY2hlZCBpbWFnZSwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXR0YWNobWVudC5yZWZlcmVuY2VzPy5bMF0/LnJlZmVyZW5jZTtcblx0XHRyZXNvdXJjZSA9IHJlZiAmJiBVUkkuaXNVcmkocmVmKSA/IHJlZiA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbWFnZURhdGEgPSBjb2VyY2VJbWFnZUJ1ZmZlcihhdHRhY2htZW50LnZhbHVlKTtcblx0XHRjb25zdCBjbGlja0hhbmRsZXIgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoKHJlc291cmNlIHx8IGltYWdlRGF0YSkgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbkluQ2Fyb3VzZWwoYXR0YWNobWVudC5pZCwgYXR0YWNobWVudC5uYW1lLCBpbWFnZURhdGEsIHJlc291cmNlLCBvcHRpb25zLmlzQ3VycmVudElucHV0KTtcblx0XHRcdH0gZWxzZSBpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuUmVzb3VyY2UocmVzb3VyY2UsIHsgZWRpdG9yT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1cnJlbnRMYW5ndWFnZU1vZGVsTmFtZSA9IHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwuaWRlbnRpZmllcik/Lm5hbWUgPz8gdGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbC5pZGVudGlmaWVyIDogJ0N1cnJlbnQgbW9kZWwnO1xuXG5cdFx0Y29uc3QgZnVsbE5hbWUgPSByZXNvdXJjZSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlKSA6IChhdHRhY2htZW50LmZ1bGxOYW1lIHx8IGF0dGFjaG1lbnQubmFtZSk7XG5cblx0XHRjb25zdCBpbWFnZUVsZW1lbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRjb25zdCByZW5kZXJJbWFnZUVsZW1lbnRzID0gKGJ1ZmZlcjogVWludDhBcnJheSkgPT4ge1xuXHRcdFx0aW1hZ2VFbGVtZW50cy52YWx1ZSA9IGNyZWF0ZUltYWdlRWxlbWVudHMocmVzb3VyY2UsIGF0dGFjaG1lbnQubmFtZSwgZnVsbE5hbWUsIHRoaXMuZWxlbWVudCwgYnVmZmVyLCBhdHRhY2htZW50LmlkLCB0aGlzLmhvdmVyU2VydmljZSwgYXJpYUxhYmVsLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWUsIGNsaWNrSGFuZGxlciwgdGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbCwgb21pdHRlZFN0YXRlKTtcblx0XHRcdC8vIGNyZWF0ZUltYWdlRWxlbWVudHMgcmVzZXRzIHRoZSBsYWJlbDsgcmVzdG9yZSB0aGUgZGVsZXRpb24gaGludCBhZnRlciBlYWNoIHJlbmRlci5cblx0XHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChhcmlhTGFiZWwpO1xuXHRcdH07XG5cdFx0cmVuZGVySW1hZ2VFbGVtZW50cyhpbWFnZURhdGEgPz8gbmV3IFVpbnQ4QXJyYXkoKSk7XG5cblx0XHQvLyBIeWRyYXRlZCBhdHRhY2htZW50cyBuZWVkIGRpc2sgYnl0ZXMgc28gdGhlIHByZXZpZXcgZG9lcyBub3QgZmFsbCBiYWNrIHRvIGEgZ2VuZXJpYyBmaWxlIGljb24uXG5cdFx0aWYgKCFpbWFnZURhdGEgJiYgcmVzb3VyY2UgJiYgb21pdHRlZFN0YXRlICE9PSBPbWl0dGVkU3RhdGUuRnVsbCAmJiBvbWl0dGVkU3RhdGUgIT09IE9taXR0ZWRTdGF0ZS5JbWFnZUxpbWl0RXhjZWVkZWQpIHtcblx0XHRcdHZvaWQgdGhpcy5sb2FkSW1hZ2VCeXRlcyhyZXNvdXJjZSwgcmVuZGVySW1hZ2VFbGVtZW50cyk7XG5cdFx0fVxuXHRcdHRoaXMuYXR0YWNoU2F2ZUJ1dHRvbihyZXNvdXJjZSwgaW1hZ2VEYXRhLCBhdHRhY2htZW50Lm5hbWUsIG9wdGlvbnMuc3VwcG9ydHNEZWxldGlvbik7XG5cblx0XHQvLyBXaXJlIHVwIGNsaWNrICsga2V5Ym9hcmQgKEVudGVyL1NwYWNlKSBvcGVuIGhhbmRsZXJzXG5cdFx0Y29uc3QgY2FuT3BlbkNhcm91c2VsID0gISFpbWFnZURhdGEgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpO1xuXHRcdGlmIChjYW5PcGVuQ2Fyb3VzZWwgfHwgcmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck9wZW5FZGl0b3JMaXN0ZW5lcnModGhpcy5lbGVtZW50LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGNsaWNrSGFuZGxlcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgcmVzb3VyY2UpKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZEltYWdlQnl0ZXMocmVzb3VyY2U6IFVSSSwgcmVuZGVyOiAoYnVmZmVyOiBVaW50OEFycmF5KSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNvbnRlbnQ6IFZTQnVmZmVyO1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpKS52YWx1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFRoZSBmaWxlIG1heSBubyBsb25nZXIgZXhpc3Q7IGtlZXAgdGhlIGljb24gZmFsbGJhY2sgdGhhdCBpcyBhbHJlYWR5IHJlbmRlcmVkLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZW5kZXIoY29udGVudC5idWZmZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuSW5DYXJvdXNlbChpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRhdGE6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQsIHJlZmVyZW5jZVVyaTogVVJJIHwgdW5kZWZpbmVkLCBwcmVmZXJDdXJyZW50SW5wdXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHJlZmVyZW5jZVVyaSA/PyBVUkkuZnJvbSh7IHNjaGVtZTogJ2RhdGEnLCBwYXRoOiBgJHtpZH0vJHtlbmNvZGVVUklDb21wb25lbnQobmFtZSl9YCB9KTtcblx0XHRhd2FpdCB0aGlzLmNoYXRJbWFnZUNhcm91c2VsU2VydmljZS5vcGVuQ2Fyb3VzZWxBdFJlc291cmNlKHJlc291cmNlLCBkYXRhLCB7IHByZWZlckN1cnJlbnRJbnB1dCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXR0YWNoU2F2ZUJ1dHRvbihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBpbWFnZURhdGE6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQsIG5hbWU6IHN0cmluZywgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChzdXBwb3J0c0RlbGV0aW9uIHx8ICghcmVzb3VyY2UgJiYgIWltYWdlRGF0YSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlQnV0dG9uID0gbmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC5zYXZlSW1hZ2VCdXR0b24nLCBcIlNhdmUgSW1hZ2UgQXMuLi5cIilcblx0XHR9KTtcblx0XHRzYXZlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1hdHRhY2hlZC1jb250ZXh0LWRvd25sb2FkLWJ1dHRvbicpO1xuXHRcdHNhdmVCdXR0b24uZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdHNhdmVCdXR0b24uaWNvbiA9IENvZGljb24uY2xvdWREb3dubG9hZDtcblx0XHR0aGlzLl9yZWdpc3RlcihzYXZlQnV0dG9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzYXZlQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFVyaSA9IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksIG5hbWUpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7IGRlZmF1bHRVcmkgfSk7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY29weShyZXNvdXJjZSwgdGFyZ2V0LCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpbWFnZURhdGEpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIFZTQnVmZmVyLndyYXAoaW1hZ2VEYXRhKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LnNhdmVJbWFnZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSBpbWFnZTogezB9XCIsIGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbWFnZUhvdmVyQ29udGVudChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBmdWxsTmFtZTogc3RyaW5nLFxuXHRidWZmZXI6IEFycmF5QnVmZmVyIHwgVWludDhBcnJheSxcblx0Y2FjaGVLZXk6IHN0cmluZyxcblx0b25Db250ZW50c0NoYW5nZWQ/OiAoKSA9PiB2b2lkLFxuXHRjbGlja0hhbmRsZXI/OiAoKSA9PiB2b2lkLFxuXHRvbkltYWdlVXJsPzogKHVybDogc3RyaW5nLCBpc1RodW1ibmFpbDogYm9vbGVhbiwgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQpID0+IHZvaWQsXG5cdGltYWdlQWx0ID0gJycpOiB7IHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyByZWFkb25seSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBob3ZlckVsZW1lbnQgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1ob3ZlcicpO1xuXHRjb25zdCBob3ZlckltYWdlID0gZG9tLiQ8SFRNTEltYWdlRWxlbWVudD4oJ2ltZy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaW1hZ2UnLCB7IGFsdDogaW1hZ2VBbHQgfSk7XG5cdGNvbnN0IGltYWdlQ29udGFpbmVyID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaW1hZ2UtY29udGFpbmVyJywge30sIGhvdmVySW1hZ2UpO1xuXHRob3ZlckVsZW1lbnQuYXBwZW5kQ2hpbGQoaW1hZ2VDb250YWluZXIpO1xuXG5cdGlmIChjbGlja0hhbmRsZXIpIHtcblx0XHRpbWFnZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjbGlja2FibGUnKTtcblx0XHRpbWFnZUNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cdFx0aW1hZ2VDb250YWluZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdGltYWdlQ29udGFpbmVyLmFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0Lm9wZW5JbWFnZVByZXZpZXcnLCBcIk9wZW4gaW4gSW1hZ2VzIFByZXZpZXdcIik7XG5cdFx0ZGlzcG9zYWJsZS5hZGQocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKGltYWdlQ29udGFpbmVyLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBjbGlja0hhbmRsZXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRpZiAocmVzb3VyY2UpIHtcblx0XHRjb25zdCB1cmxDb250YWluZXIgPSBjbGlja0hhbmRsZXJcblx0XHRcdD8gZG9tLiQoJ2EuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXVybCcsIHt9LCBmdWxsTmFtZSlcblx0XHRcdDogZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtdXJsJywge30sIGZ1bGxOYW1lKTtcblx0XHRjb25zdCBzZXBhcmF0b3IgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC11cmwtc2VwYXJhdG9yJyk7XG5cdFx0aWYgKGNsaWNrSGFuZGxlcikge1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih1cmxDb250YWluZXIsICdjbGljaycsIGNsaWNrSGFuZGxlcikpO1xuXHRcdH1cblx0XHRob3ZlckVsZW1lbnQuYXBwZW5kKHNlcGFyYXRvciwgdXJsQ29udGFpbmVyKTtcblx0fVxuXG5cdGNvbnN0IGRhdGEgPSBidWZmZXIgaW5zdGFuY2VvZiBVaW50OEFycmF5ID8gYnVmZmVyIDogbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblx0Y29uc3QgcHJldmlld0ltYWdlVXJsID0gZGlzcG9zYWJsZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0Y29uc3QgcmVuZGVyUHJldmlld0ltYWdlID0gYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRodW1ibmFpbCA9IGF3YWl0IGdldE9yQ3JlYXRlSW1hZ2VUaHVtYm5haWwoY2FjaGVLZXksIGRhdGEsIENIQVRfSU1BR0VfSE9WRVJfVEhVTUJOQUlMX01BWF9TSVpFKTtcblx0XHRpZiAoZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZSA9IHRodW1ibmFpbCA/PyBuZXcgQmxvYihbZGF0YSBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPl0pO1xuXHRcdGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoc291cmNlKTtcblx0XHRwcmV2aWV3SW1hZ2VVcmwudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpKTtcblx0XHRob3ZlckltYWdlLm9ubG9hZCA9ICgpID0+IG9uQ29udGVudHNDaGFuZ2VkPy4oKTtcblx0XHRob3ZlckltYWdlLnNyYyA9IHVybDtcblx0XHRvbkltYWdlVXJsPy4odXJsLCAhIXRodW1ibmFpbCwgaG92ZXJJbWFnZSk7XG5cdH07XG5cdHZvaWQgcmVuZGVyUHJldmlld0ltYWdlKCk7XG5cblx0cmV0dXJuIHsgZWxlbWVudDogaG92ZXJFbGVtZW50LCBkaXNwb3NhYmxlIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUltYWdlRWxlbWVudHMocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgbmFtZTogc3RyaW5nLCBmdWxsTmFtZTogc3RyaW5nLFxuXHRlbGVtZW50OiBIVE1MRWxlbWVudCxcblx0YnVmZmVyOiBBcnJheUJ1ZmZlciB8IFVpbnQ4QXJyYXksXG5cdGNhY2hlS2V5OiBzdHJpbmcsXG5cdGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSwgYXJpYUxhYmVsOiBzdHJpbmcsXG5cdGN1cnJlbnRMYW5ndWFnZU1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRjbGlja0hhbmRsZXI6ICgpID0+IHZvaWQsXG5cdGN1cnJlbnRMYW5ndWFnZU1vZGVsPzogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLFxuXHRvbWl0dGVkU3RhdGU/OiBPbWl0dGVkU3RhdGUpOiBJRGlzcG9zYWJsZSB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0aWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLlBhcnRpYWwpIHtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3BhcnRpYWwtd2FybmluZycpO1xuXHR9XG5cblx0ZWxlbWVudC5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG5cdGlmIChyZXNvdXJjZSkge1xuXHRcdGVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHR9XG5cdGNvbnN0IHN1cHBvcnRzVmlzaW9uID0gbW9kZWxTdXBwb3J0c1Zpc2lvbihjdXJyZW50TGFuZ3VhZ2VNb2RlbCk7XG5cdGNvbnN0IHBpbGxJY29uID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbCcsIHt9LCBkb20uJChzdXBwb3J0c1Zpc2lvbiA/ICdzcGFuLmNvZGljb24uY29kaWNvbi1maWxlLW1lZGlhJyA6ICdzcGFuLmNvZGljb24uY29kaWNvbi13YXJuaW5nJykpO1xuXHRjb25zdCB0ZXh0TGFiZWwgPSBkb20uJCgnc3Bhbi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtY3VzdG9tLXRleHQnLCB7fSwgbmFtZSk7XG5cdGVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbEljb24pO1xuXHRlbGVtZW50LmFwcGVuZENoaWxkKHRleHRMYWJlbCk7XG5cblx0Ly8gVHJhY2tzIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgcGlsbCBzbyBpdCBjYW4gYmUgc3dhcHBlZCB3aXRob3V0IHF1ZXJ5aW5nIHRoZSBET00uXG5cdGxldCBjdXJyZW50UGlsbDogSFRNTEVsZW1lbnQgPSBwaWxsSWNvbjtcblx0Y29uc3QgcmVwbGFjZVBpbGwgPSAocGlsbDogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRjdXJyZW50UGlsbC5yZXBsYWNlV2l0aChwaWxsKTtcblx0XHRjdXJyZW50UGlsbCA9IHBpbGw7XG5cdH07XG5cblx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXInKTtcblx0aG92ZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cblx0aWYgKCghc3VwcG9ydHNWaXNpb24gJiYgY3VycmVudExhbmd1YWdlTW9kZWwpIHx8IG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGwpIHtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dhcm5pbmcnKTtcblx0XHRob3ZlckVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5pbWFnZUF0dGFjaG1lbnRIb3ZlcicsIFwiezB9IGRvZXMgbm90IHN1cHBvcnQgaW1hZ2VzLlwiLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWUgPz8gJ1RoaXMgbW9kZWwnKTtcblx0XHRkaXNwb3NhYmxlLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwge1xuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9KSk7XG5cdH0gZWxzZSBpZiAob21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuSW1hZ2VMaW1pdEV4Y2VlZGVkKSB7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nJyk7XG5cdFx0Y29uc3QgbWF4SW1hZ2VzUGVyUmVxdWVzdCA9IGdldEltYWdlQXR0YWNobWVudExpbWl0KGN1cnJlbnRMYW5ndWFnZU1vZGVsPy5tZXRhZGF0YSk7XG5cdFx0aG92ZXJFbGVtZW50LnRleHRDb250ZW50ID0gbWF4SW1hZ2VzUGVyUmVxdWVzdCAhPT0gdW5kZWZpbmVkXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmltYWdlTGltaXRFeGNlZWRlZEhvdmVyJywgXCJUaGlzIGltYWdlIHdhcyBub3Qgc2VudCBiZWNhdXNlIHRoZSBtYXhpbXVtIG9mIHswfSBpbWFnZXMgcGVyIHJlcXVlc3Qgd2FzIGV4Y2VlZGVkLlwiLCBtYXhJbWFnZXNQZXJSZXF1ZXN0KVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5pbWFnZUxpbWl0RXhjZWVkZWRIb3ZlclVua25vd25MaW1pdCcsIFwiVGhpcyBpbWFnZSB3YXMgbm90IHNlbnQgYmVjYXVzZSB0aGlzIG1vZGVsJ3MgaW1hZ2UgbGltaXQgd2FzIGV4Y2VlZGVkLlwiKTtcblx0XHRkaXNwb3NhYmxlLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwge1xuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9KSk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3Qgb25JbWFnZUZhaWxlZCA9ICgpID0+IHtcblx0XHRcdC8vIHJlc2V0IHRvIG9yaWdpbmFsIGljb24gb24gZXJyb3Igb3IgaW52YWxpZCBpbWFnZVxuXHRcdFx0Y29uc3QgcGlsbEljb24gPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1waWxsJywge30sIGRvbS4kKCdzcGFuLmNvZGljb24uY29kaWNvbi1maWxlLW1lZGlhJykpO1xuXHRcdFx0cmVwbGFjZVBpbGwocGlsbEljb24pO1xuXHRcdH07XG5cdFx0Y29uc3QgaG92ZXJGdWxsTmFtZSA9IG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLlBhcnRpYWwgPyBsb2NhbGl6ZSgnY2hhdC5pbWFnZUF0dGFjaG1lbnRXYXJuaW5nJywgXCJUaGlzIEdJRiB3YXMgcGFydGlhbGx5IG9taXR0ZWQgLSBjdXJyZW50IGZyYW1lIHdpbGwgYmUgc2VudC5cIikgOiBmdWxsTmFtZTtcblx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSBjcmVhdGVJbWFnZUhvdmVyQ29udGVudChyZXNvdXJjZSwgaG92ZXJGdWxsTmFtZSwgYnVmZmVyLCBjYWNoZUtleSwgdW5kZWZpbmVkLCByZXNvdXJjZSA/IGNsaWNrSGFuZGxlciA6IHVuZGVmaW5lZCwgKHVybCwgaXNUaHVtYm5haWwsIGhvdmVySW1hZ2UpID0+IHtcblx0XHRcdGlmIChpc1RodW1ibmFpbCkge1xuXHRcdFx0XHRjb25zdCBwaWxsSW1nID0gZG9tLiQoJ2ltZy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbC1pbWFnZScsIHsgc3JjOiB1cmwsIGFsdDogJycgfSk7XG5cdFx0XHRcdGNvbnN0IHBpbGwgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1waWxsJywge30sIHBpbGxJbWcpO1xuXHRcdFx0XHRyZXBsYWNlUGlsbChwaWxsKTtcblx0XHRcdH1cblx0XHRcdGhvdmVySW1hZ2Uub25lcnJvciA9IG9uSW1hZ2VGYWlsZWQ7XG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZS5hZGQoaG92ZXJDb250ZW50LmRpc3Bvc2FibGUpO1xuXHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9IGhvdmVyQ29udGVudC5lbGVtZW50O1xuXHRcdGhvdmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdGRpc3Bvc2FibGUuYWRkKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihlbGVtZW50LCB7XG5cdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdH0pKTtcblxuXHRcdGlmIChpc0F1dG9MYW5ndWFnZU1vZGVsKGN1cnJlbnRMYW5ndWFnZU1vZGVsKSkge1xuXHRcdFx0aG92ZXJFbGVtZW50LmFwcGVuZENoaWxkKGRvbS4kKCdkaXYnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0LmF1dG9JbWFnZUF0dGFjaG1lbnRIb3ZlcicsIFwiSW1hZ2Ugc3VwcG9ydCBkZXBlbmRzIG9uIHRoZSBtb2RlbCBzZWxlY3RlZCBieSBBdXRvLlwiKSkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFJlbW92ZSBvbGQgRE9NIHNvIHRoZSB3aWRnZXQgY2FuIHNhZmVseSByZS1yZW5kZXIgYWZ0ZXIgaHlkcmF0ZWQgYnl0ZXMgbG9hZC5cblx0ZGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRjdXJyZW50UGlsbC5yZW1vdmUoKTtcblx0XHR0ZXh0TGFiZWwucmVtb3ZlKCk7XG5cdH0pKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZTtcbn1cblxuLyoqXG4gKiBPcGVucyBhIHBhc3RlZC10ZXh0IGF0dGFjaG1lbnQgc28gaXRzIGZ1bGwgY29udGVudHMgY2FuIGJlIHJldmlld2VkOyB0aGVcbiAqIGF0dGFjaG1lbnQgcGlsbCBpcyBvdGhlcndpc2UgdGhlIG9ubHkgaGFuZGxlIG9uIHRoYXQgdGV4dC4gVGhlIGNvbnRlbnRzIGFyZVxuICogZGVyaXZlZCBmcm9tIHRoZSBhdHRhY2htZW50IG9uIGRlbWFuZCBcdTIwMTQgc28gbm90aGluZyBpcyBoZWxkIGZvciBhbiBhcnRpZmFjdFxuICogdGhhdCBpcyBuZXZlciBvcGVuZWQgXHUyMDE0IGFuZCBiYWNrZWQgYnkgYSByZWFkLW9ubHkgcmVzb3VyY2Uga2V5ZWQgb24gdGhlXG4gKiBhdHRhY2htZW50LCB3aGljaCBrZWVwcyBvbmUgZWRpdG9yIHBlciBhcnRpZmFjdCBhbmQgcHJldmVudHMgZWRpdHMgdGhhdCB3b3VsZFxuICogbm90IHJlYWNoIHRoZSBhdHRhY2htZW50LiBUaGUgYXNzb2NpYXRpb24gaXMgZHJvcHBlZCBvbmNlIHRoZSBlZGl0b3IgY2xvc2VzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlblBhc3RlZFRleHRBcnRpZmFjdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBvd25lZCA9IGFjY2Vzc29yLmdldChJQ2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIpXG5cdFx0LmFzc29jaWF0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKGF0dGFjaG1lbnQuY29kZSkuYnVmZmVyLCB7IGlkOiBhdHRhY2htZW50LmlkLCBuYW1lOiBhdHRhY2htZW50Lm5hbWUgfSk7XG5cblx0dHJ5IHtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogb3duZWQucmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0b3duZWQuZGlzcG9zZSgpO1xuXHRcdHRocm93IGVycm9yO1xuXHR9XG5cblx0Ly8gV2F0Y2hlZCBvbmx5IG9uY2UgdGhlIGVkaXRvciBpcyBvcGVuLCBzbyBhbiBlZGl0b3IgdGhpcyBvcGVuIHJlcGxhY2VzIGNhbm5vdFxuXHQvLyBiZSBtaXN0YWtlbiBmb3IgdGhlIGFydGlmYWN0J3Mgb3duIGVkaXRvciBjbG9zaW5nLlxuXHRjb25zdCBsaXN0ZW5lciA9IGVkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvcigoKSA9PiB7XG5cdFx0aWYgKCFlZGl0b3JTZXJ2aWNlLmVkaXRvcnMuc29tZShlZGl0b3IgPT4gaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIG93bmVkLnJlc291cmNlKSkpIHtcblx0XHRcdG93bmVkLmRpc3Bvc2UoKTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgUGFzdGVBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50JywgXCJBdHRhY2hlZCBjb250ZXh0LCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQoYXJpYUxhYmVsKTtcblxuXHRcdGNvbnN0IGNsYXNzTmFtZXMgPSBbJ2ZpbGUtaWNvbicsIGAke2F0dGFjaG1lbnQubGFuZ3VhZ2V9LWxhbmctZmlsZS1pY29uYF07XG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYXR0YWNobWVudC5jb3BpZWRGcm9tKSB7XG5cdFx0XHRyZXNvdXJjZSA9IGF0dGFjaG1lbnQuY29waWVkRnJvbS51cmk7XG5cdFx0XHRyYW5nZSA9IGF0dGFjaG1lbnQuY29waWVkRnJvbS5yYW5nZTtcblx0XHRcdGNvbnN0IGZpbGVuYW1lID0gYmFzZW5hbWUocmVzb3VyY2UucGF0aCk7XG5cdFx0XHR0aGlzLmxhYmVsLnNldExhYmVsKGZpbGVuYW1lLCB1bmRlZmluZWQsIHsgZXh0cmFDbGFzc2VzOiBjbGFzc05hbWVzIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxhYmVsLnNldExhYmVsKGF0dGFjaG1lbnQuZmlsZU5hbWUsIHVuZGVmaW5lZCwgeyBleHRyYUNsYXNzZXM6IGNsYXNzTmFtZXMgfSk7XG5cdFx0fVxuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5hdHRhY2htZW50LWFkZGl0aW9uYWwtaW5mbycsIHt9LCBgUGFzdGVkICR7YXR0YWNobWVudC5wYXN0ZWRMaW5lc31gKSk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG5cdFx0Y29uc3Qgc291cmNlVXJpID0gYXR0YWNobWVudC5jb3BpZWRGcm9tPy51cmk7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKGAke3NvdXJjZVVyaSA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpLmdldFVyaUxhYmVsKHNvdXJjZVVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSkgOiBhdHRhY2htZW50LmZpbGVOYW1lfVxcblxcbi0tLVxcblxcblxcYFxcYFxcYCR7YXR0YWNobWVudC5sYW5ndWFnZX1cXG5cXG4ke2F0dGFjaG1lbnQuY29kZX1cXG5cXGBcXGBcXGBgKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGhvdmVyQ29udGVudCxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblxuXHRcdGNvbnN0IGNvcGllZEZyb21SZXNvdXJjZSA9IGF0dGFjaG1lbnQuY29waWVkRnJvbT8udXJpO1xuXHRcdGlmIChjb3BpZWRGcm9tUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaG9va1VwUmVzb3VyY2VBdHRhY2htZW50RHJhZ0FuZENvbnRleHRNZW51LCB0aGlzLmVsZW1lbnQsIGNvcGllZEZyb21SZXNvdXJjZSkpO1xuXHRcdFx0dGhpcy5hZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhjb3BpZWRGcm9tUmVzb3VyY2UsIHJhbmdlKTtcblx0XHR9IGVsc2UgaWYgKGlzUGFzdGVkVGV4dEFydGlmYWN0KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKG9wZW5QYXN0ZWRUZXh0QXJ0aWZhY3QsIGF0dGFjaG1lbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdENoYXRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbHRpcEhvdmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdFx0Y29ycmVzcG9uZGluZ0NvbnRlbnRSZWZlcmVuY2U6IElDaGF0Q29udGVudFJlZmVyZW5jZSB8IHVuZGVmaW5lZCxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYXR0YWNobWVudExhYmVsID0gYXR0YWNobWVudC5mdWxsTmFtZSA/PyBhdHRhY2htZW50Lm5hbWU7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBjb3JyZXNwb25kaW5nQ29udGVudFJlZmVyZW5jZT8ub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbjtcblxuXHRcdC8vIFByb3ZpZGVyLXN1cHBsaWVkIGljb24gcGF0aCAoVGhlbWVJY29uIHwgVXJpIHwgeyBsaWdodCwgZGFyayB9KSBmb3IgY29udGV4dCBpdGVtc1xuXHRcdGNvbnN0IGljb25QYXRoID0gKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdnZW5lcmljJykgPyBhdHRhY2htZW50Lmljb25QYXRoIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fYXBwbHlMYWJlbChhdHRhY2htZW50LCBhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCBpY29uUGF0aCk7XG5cblx0XHQvLyBBIGxpZ2h0L2RhcmsgaWNvbiBtdXN0IGJlIHJlYXBwbGllZCB3aGVuIHRoZSBjb2xvciB0aGVtZSBjaGFuZ2VzIHNvIHRoZSBjb3JyZWN0IHVyaSBpcyB1c2VkXG5cdFx0aWYgKGljb25QYXRoICYmICFUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmICFVUkkuaXNVcmkoaWNvblBhdGgpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fYXBwbHlMYWJlbChhdHRhY2htZW50LCBhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCBpY29uUGF0aCkpKTtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudCcsIFwiQXR0YWNoZWQgY29udGV4dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSkpO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQua2luZCA9PT0gJ2RpYWdub3N0aWMnKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5maWx0ZXJVcmkpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBhdHRhY2htZW50LmZpbHRlclVyaSA/IFVSSS5yZXZpdmUoYXR0YWNobWVudC5maWx0ZXJVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyYW5nZSA9IGF0dGFjaG1lbnQuZmlsdGVyUmFuZ2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5wYW5lbC5tYXJrZXJzLnZpZXcuZm9jdXMnKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdzeW1ib2wnKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGhvb2tVcFN5bWJvbEF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUsIHRoaXMuZWxlbWVudCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyAuLi5hdHRhY2htZW50LCBraW5kOiBhdHRhY2htZW50LnN5bWJvbEtpbmQgfSwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGNsaWNrIGZvciBzdHJpbmcgY29udGV4dCBhdHRhY2htZW50cyB3aXRoIGNvbnRleHQgY29tbWFuZHNcblx0XHRpZiAoaXNTdHJpbmdWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmIGF0dGFjaG1lbnQuY29tbWFuZElkKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0Y29uc3QgY29udGV4dEl0ZW1IYW5kbGUgPSBhdHRhY2htZW50LmhhbmRsZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRDb250ZXh0U2VydmljZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElDaGF0Q29udGV4dFNlcnZpY2UpKTtcblx0XHRcdFx0YXdhaXQgY2hhdENvbnRleHRTZXJ2aWNlLmV4ZWN1dGVDaGF0Q29udGV4dEl0ZW1Db21tYW5kKGNvbnRleHRJdGVtSGFuZGxlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgY2xpY2sgZm9yIGRlYnVnIGV2ZW50cyBhdHRhY2htZW50c1xuXHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdkZWJ1Z0V2ZW50cycpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkID0gbmV3IERhdGUoYXR0YWNobWVudC5zbmFwc2hvdFRpbWUpO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXIgPSBgYmVmb3JlOiR7ZC5nZXRGdWxsWWVhcigpfS0ke1N0cmluZyhkLmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpfS0ke1N0cmluZyhkLmdldERhdGUoKSkucGFkU3RhcnQoMiwgJzAnKX1UJHtTdHJpbmcoZC5nZXRIb3VycygpKS5wYWRTdGFydCgyLCAnMCcpfToke1N0cmluZyhkLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKX06JHtTdHJpbmcoZC5nZXRTZWNvbmRzKCkpLnBhZFN0YXJ0KDIsICcwJyl9YDtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudERlYnVnUGFuZWxGb3JTZXNzaW9uJywgYXR0YWNobWVudC5zZXNzaW9uUmVzb3VyY2UsIGZpbHRlcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dXAgdG9vbHRpcCBob3ZlciBmb3Igc3RyaW5nIGNvbnRleHQgYXR0YWNobWVudHNcblx0XHRpZiAoKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdnZW5lcmljJykgJiYgYXR0YWNobWVudC50b29sdGlwKSB7XG5cdFx0XHR0aGlzLl9zZXR1cFRvb2x0aXBIb3ZlcihhdHRhY2htZW50LnRvb2x0aXApO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5hZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhyZXNvdXJjZSwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TGFiZWwoYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgYXR0YWNobWVudExhYmVsOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIGljb25QYXRoOiBDaGF0Q29udGV4dEljb25QYXRoIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSAmJiBpY29uUGF0aCAmJiBUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmIChUaGVtZUljb24uaXNGaWxlKGljb25QYXRoKSB8fCBUaGVtZUljb24uaXNGb2xkZXIoaWNvblBhdGgpKSAmJiBhdHRhY2htZW50LnJlc291cmNlVXJpKSB7XG5cdFx0XHQvLyBEZXJpdmUgaWNvbiBjbGFzc2VzIGZyb20gcmVzb3VyY2VVcmkgZm9yIGZpbGUvZm9sZGVyIHRoZW1lIGljb25zXG5cdFx0XHRjb25zdCBmaWxlS2luZCA9IFRoZW1lSWNvbi5pc0ZvbGRlcihpY29uUGF0aCkgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIGF0dGFjaG1lbnQucmVzb3VyY2VVcmksIGZpbGVLaW5kKTtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoYXR0YWNobWVudExhYmVsLCBkZXNjcmlwdGlvbiwgeyBleHRyYUNsYXNzZXM6IGljb25DbGFzc2VzIH0pO1xuXHRcdH0gZWxzZSBpZiAoaWNvblBhdGgpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkSWNvbiA9IHJlc29sdmVDaGF0Q29udGV4dEljb24oaWNvblBhdGgsIGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkpO1xuXHRcdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCB7IGljb25QYXRoOiByZXNvbHZlZEljb24gfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHdpdGhJY29uID0gYXR0YWNobWVudC5pY29uPy5pZCA/IGAkKCR7YXR0YWNobWVudC5pY29uLmlkfSlcXHUwMEEwJHthdHRhY2htZW50TGFiZWx9YCA6IGF0dGFjaG1lbnRMYWJlbDtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwod2l0aEljb24sIGRlc2NyaXB0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFRvb2x0aXBIb3Zlcih0b29sdGlwOiBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sdGlwSG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IHRvb2x0aXAsXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdEZpbGVBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBoaW50RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblxuXHRcdHRoaXMuaGludEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJ3NwYW4ucHJvbXB0LXR5cGUnKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUxhYmVsKGF0dGFjaG1lbnQpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgYXR0YWNobWVudC52YWx1ZSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMoYXR0YWNobWVudC52YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFiZWwoYXR0YWNobWVudDogSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5KSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhdHRhY2htZW50LnZhbHVlO1xuXHRcdGNvbnN0IGZpbGVCYXNlbmFtZSA9IGJhc2VuYW1lKHJlc291cmNlLnBhdGgpO1xuXHRcdGNvbnN0IGZpbGVEaXJuYW1lID0gZGlybmFtZShyZXNvdXJjZS5wYXRoKTtcblx0XHRjb25zdCBmcmllbmRseU5hbWUgPSBgJHtmaWxlQmFzZW5hbWV9ICR7ZmlsZURpcm5hbWV9YDtcblx0XHRjb25zdCBpc1Byb21wdCA9IGF0dGFjaG1lbnQuaWQuc3RhcnRzV2l0aChQcm9tcHRGaWxlVmFyaWFibGVLaW5kLlByb21wdEZpbGUpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGlzUHJvbXB0XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnByb21wdEF0dGFjaG1lbnQnLCBcIlByb21wdCBmaWxlLCB7MH1cIiwgZnJpZW5kbHlOYW1lKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5pbnN0cnVjdGlvbnNBdHRhY2htZW50JywgXCJJbnN0cnVjdGlvbnMgYXR0YWNobWVudCwgezB9XCIsIGZyaWVuZGx5TmFtZSk7XG5cdFx0Y29uc3QgdHlwZUxhYmVsID0gaXNQcm9tcHRcblx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdCcsIFwiUHJvbXB0XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdpbnN0cnVjdGlvbnMnLCBcIkluc3RydWN0aW9uc1wiKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UpICsgKGF0dGFjaG1lbnQub3JpZ2luTGFiZWwgPyBgXFxuJHthdHRhY2htZW50Lm9yaWdpbkxhYmVsfWAgOiAnJyk7XG5cblx0XHQvL2NvbnN0IHsgdG9wRXJyb3IgfSA9IHRoaXMucHJvbXB0RmlsZTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnd2FybmluZycsICdlcnJvcicpO1xuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHNvbWUgZXJyb3JzL3dhcm5pbmcgZHVyaW5nIHRoZSBwcm9jZXNzIG9mIHJlc29sdmluZ1xuXHRcdC8vIGF0dGFjaG1lbnQgcmVmZXJlbmNlcyAoaW5jbHVkaW5nIGFsbCB0aGUgbmVzdGVkIGNoaWxkIHJlZmVyZW5jZXMpLFxuXHRcdC8vIGFkZCB0aGUgaXNzdWUgZGV0YWlscyBpbiB0aGUgaG92ZXIgdGl0bGUgZm9yIHRoZSBhdHRhY2htZW50LCBvbmVcblx0XHQvLyBlcnJvci93YXJuaW5nIGF0IGEgdGltZSBiZWNhdXNlIHRoZXJlIGlzIGEgbGltaXRlZCBzcGFjZSBhdmFpbGFibGVcblx0XHQvLyBpZiAodG9wRXJyb3IpIHtcblx0XHQvLyBcdGNvbnN0IHsgZXJyb3JTdWJqZWN0OiBzdWJqZWN0IH0gPSB0b3BFcnJvcjtcblx0XHQvLyBcdGNvbnN0IGlzRXJyb3IgPSAoc3ViamVjdCA9PT0gJ3Jvb3QnKTtcblx0XHQvLyBcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKChpc0Vycm9yKSA/ICdlcnJvcicgOiAnd2FybmluZycpO1xuXG5cdFx0Ly8gXHRjb25zdCBzZXZlcml0eSA9IChpc0Vycm9yKVxuXHRcdC8vIFx0XHQ/IGxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3JcIilcblx0XHQvLyBcdFx0OiBsb2NhbGl6ZSgnd2FybmluZycsIFwiV2FybmluZ1wiKTtcblxuXHRcdC8vIFx0dGl0bGUgKz0gYFxcblske3NldmVyaXR5fV06ICR7dG9wRXJyb3IubG9jYWxpemVkTWVzc2FnZX1gO1xuXHRcdC8vIH1cblxuXHRcdGNvbnN0IGZpbGVXaXRob3V0RXh0ZW5zaW9uID0gZ2V0Q2xlYW5Qcm9tcHROYW1lKHJlc291cmNlKTtcblx0XHR0aGlzLmxhYmVsLnNldEZpbGUoVVJJLmZpbGUoZmlsZVdpdGhvdXRFeHRlbnNpb24pLCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdGhpZGVQYXRoOiB0cnVlLFxuXHRcdFx0cmFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmJvb2ttYXJrLmlkKSxcblx0XHRcdGV4dHJhQ2xhc3NlczogW10sXG5cdFx0fSk7XG5cblx0XHR0aGlzLmhpbnRFbGVtZW50LmlubmVyVGV4dCA9IHR5cGVMYWJlbDtcblxuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdFRleHRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVByb21wdFRleHRWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQuc2V0dGluZ0lkKSB7XG5cdFx0XHRjb25zdCBvcGVuU2V0dGluZ3MgPSAoKSA9PiBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiBgQGlkOiR7YXR0YWNobWVudC5zZXR0aW5nSWR9YCB9KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0b3BlblNldHRpbmdzKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBhc3luYyAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0b3BlblNldHRpbmdzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zLmxhYmVsJywgJ0FkZGl0aW9uYWwgSW5zdHJ1Y3Rpb25zJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudCcsIFwiQXR0YWNoZWQgY29udGV4dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogYXR0YWNobWVudC52YWx1ZSxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBUb29sU2V0T3JUb29sSXRlbUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblxuXHRcdGNvbnN0IHRvb2xPclRvb2xTZXQgPSBJdGVyYWJsZS5maW5kKHRvb2xzU2VydmljZS5nZXRUb29scyhjdXJyZW50TGFuZ3VhZ2VNb2RlbD8ubWV0YWRhdGEpLCB0b29sID0+IHRvb2wuaWQgPT09IGF0dGFjaG1lbnQuaWQpID8/IEl0ZXJhYmxlLmZpbmQodG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwoY3VycmVudExhbmd1YWdlTW9kZWw/Lm1ldGFkYXRhKSwgdG9vbFNldCA9PiB0b29sU2V0LmlkID09PSBhdHRhY2htZW50LmlkKTtcblxuXHRcdGxldCBuYW1lID0gYXR0YWNobWVudC5uYW1lO1xuXHRcdGNvbnN0IGljb24gPSBhdHRhY2htZW50Lmljb24gPz8gQ29kaWNvbi50b29scztcblxuXHRcdGlmIChpc1Rvb2xTZXQodG9vbE9yVG9vbFNldCkpIHtcblx0XHRcdG5hbWUgPSB0b29sT3JUb29sU2V0LnJlZmVyZW5jZU5hbWU7XG5cdFx0fSBlbHNlIGlmICh0b29sT3JUb29sU2V0KSB7XG5cdFx0XHRuYW1lID0gdG9vbE9yVG9vbFNldC50b29sUmVmZXJlbmNlTmFtZSA/PyBuYW1lO1xuXHRcdH1cblxuXHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoYCQoJHtpY29uLmlkfSlcXHUwMEEwJHtuYW1lfWAsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50JywgXCJBdHRhY2hlZCBjb250ZXh0LCB7MH1cIiwgbmFtZSkpO1xuXG5cdFx0bGV0IGhvdmVyQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzVG9vbFNldCh0b29sT3JUb29sU2V0KSkge1xuXHRcdFx0aG92ZXJDb250ZW50ID0gbG9jYWxpemUoJ3Rvb2xzZXQnLCBcInswfSAtIHsxfVwiLCB0b29sT3JUb29sU2V0LmRlc2NyaXB0aW9uID8/IHRvb2xPclRvb2xTZXQucmVmZXJlbmNlTmFtZSwgdG9vbE9yVG9vbFNldC5zb3VyY2UubGFiZWwpO1xuXHRcdH0gZWxzZSBpZiAodG9vbE9yVG9vbFNldCkge1xuXHRcdFx0aG92ZXJDb250ZW50ID0gbG9jYWxpemUoJ3Rvb2wnLCBcInswfSAtIHsxfVwiLCB0b29sT3JUb29sU2V0LnVzZXJEZXNjcmlwdGlvbiA/PyB0b29sT3JUb29sU2V0Lm1vZGVsRGVzY3JpcHRpb24sIHRvb2xPclRvb2xTZXQuc291cmNlLmxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAoaG92ZXJDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29udGVudDogaG92ZXJDb250ZW50LFxuXHRcdFx0fSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyBhbiBhZ2VudC1ob3N0IHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSBjaGF0LXJlZmVyZW5jZX1cbiAqIGF0dGFjaG1lbnQgKGAjY2hhdDo8dGl0bGU+YCkgYXMgYSBjbGlja2FibGUgY2hpcC4gQ2xpY2tpbmcgKG9yIHByZXNzaW5nXG4gKiBFbnRlci9TcGFjZSkgb3BlbnMgdGhlIHJlZmVyZW5jZWQgY2hhdCBpbiB0aGUgQWdlbnRzIHdpbmRvdyBieSBoYW5kaW5nIGFuXG4gKiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBsaW5rIHRvIHRoZSB7QGxpbmsgSU9wZW5lclNlcnZpY2V9LiBXaGVuIHRoZSBsaW5rXG4gKiBjYW5ub3QgYmUgYnVpbHQgb3IgdGhlIG9wZW5lciBkZWNsaW5lcyBpdCAoZS5nLiB0aGUgY2hhdCB3YXMgZGVsZXRlZCBvciBsaXZlc1xuICogaW4gYW5vdGhlciB3aW5kb3cpIHRoZSBjaGlwIGRlZ3JhZGVzIGdyYWNlZnVsbHkgYW5kIHN0aWxsIHJlbmRlcnMgaXRzIGxhYmVsLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCB0aXRsZSA9IGF0dGFjaG1lbnQubmFtZTtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBhdHRhY2htZW50LnZhbHVlO1xuXG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChgJCgke0NvZGljb24uY29tbWVudERpc2N1c3Npb24uaWR9KVxcdTAwQTAke3RpdGxlfWAsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LmNoYXRSZWZlcmVuY2UnLCBcIkxpbmsgdG8gY2hhdCB7MH1cIiwgdGl0bGUpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQuY2hhdFJlZmVyZW5jZS5ob3ZlcicsIFwiT3BlbiBjaGF0IFxcXCJ7MH1cXFwiXCIsIHRpdGxlKSxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9vcGVuUmVmZXJlbmNlZENoYXQoY2hhdFJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vcGVuUmVmZXJlbmNlZENoYXQoY2hhdFJlc291cmNlKTtcblx0XHRcdH1cblxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5SZWZlcmVuY2VkQ2hhdChjaGF0UmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxpbmsgPSBidWlsZE9wZW5TZXNzaW9uTGlua0ZvckNoYXRSZXNvdXJjZShjaGF0UmVzb3VyY2UpO1xuXHRcdGlmICghbGluaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgb3BlbmVyIHJldHVybnMgZmFsc2Ugd2hlbiB0aGUgbGluayBjYW5ub3QgYmUgcmVzb2x2ZWQgKGUuZy4gdGhlXG5cdFx0Ly8gcmVmZXJlbmNlZCBjaGF0IHdhcyBkZWxldGVkIG9yIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd2luZG93KS4gRGVncmFkZVxuXHRcdC8vIGdyYWNlZnVsbHkgaW4gdGhhdCBjYXNlIFx1MjAxNCB0aGUgY2hpcCBzdGF5cyBidXQgbm8gZXJyb3IgZGlhbG9nIGlzIHNob3duLlxuXHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmspO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBhdHRhY2htZW50LmZ1bGxOYW1lID8/IGF0dGFjaG1lbnQubmFtZTtcblx0XHR0aGlzLmxhYmVsLnNldExhYmVsKGF0dGFjaG1lbnQuaWNvbiA/IGAkKCR7YXR0YWNobWVudC5pY29uLmlkfSlcXHUwMEEwJHtsYWJlbH1gIDogbGFiZWwsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC50cmFuc2NyaXB0Q29udGV4dCcsIFwiT3BlbiB7MH0gaW4gQnJvd3NlclwiLCBhdHRhY2htZW50Lm5hbWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBhdHRhY2htZW50LnRvb2x0aXAgPz8gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC50cmFuc2NyaXB0Q29udGV4dC5ob3ZlcicsIFwiT3BlbiB7MH0gaW4gQnJvd3NlclwiLCBhdHRhY2htZW50Lm5hbWUpLFxuXHRcdH0sIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyh0aGlzLmVsZW1lbnQsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IG9wZW5UcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnQodGhpcy5vcGVuZXJTZXJ2aWNlLCBhdHRhY2htZW50KTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5UcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnQob3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsIGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRyZXR1cm4gb3BlbmVyU2VydmljZS5vcGVuKGF0dGFjaG1lbnQudXJpLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2VsbE91dHB1dENoYXRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0YXR0YWNobWVudDogSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0c3dpdGNoIChhdHRhY2htZW50Lm1pbWVUeXBlKSB7XG5cdFx0XHRjYXNlICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5lcnJvcic6IHtcblx0XHRcdFx0dGhpcy5yZW5kZXJFcnJvck91dHB1dChyZXNvdXJjZSwgYXR0YWNobWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW1hZ2UvcG5nJzpcblx0XHRcdGNhc2UgJ2ltYWdlL2pwZWcnOlxuXHRcdFx0Y2FzZSAnaW1hZ2Uvc3ZnJzoge1xuXHRcdFx0XHR0aGlzLnJlbmRlckltYWdlT3V0cHV0KHJlc291cmNlLCBhdHRhY2htZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdHRoaXMucmVuZGVyR2VuZXJpY091dHB1dChyZXNvdXJjZSwgYXR0YWNobWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgcmVzb3VyY2UpKTtcblx0XHR9KTtcblx0XHR0aGlzLmFkZFJlc291cmNlT3BlbkhhbmRsZXJzKHJlc291cmNlLCB1bmRlZmluZWQpO1xuXHR9XG5cdGdldEFyaWFMYWJlbChhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuTm90ZWJvb2tJbWFnZUF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIE5vdGVib29rIG91dHB1dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdH1cblx0cHJpdmF0ZSByZW5kZXJFcnJvck91dHB1dChyZXNvdXJjZTogVVJJLCBhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KSB7XG5cdFx0Y29uc3QgYXR0YWNobWVudExhYmVsID0gYXR0YWNobWVudC5uYW1lO1xuXHRcdGNvbnN0IHdpdGhJY29uID0gYXR0YWNobWVudC5pY29uPy5pZCA/IGAkKCR7YXR0YWNobWVudC5pY29uLmlkfSlcXHUwMEEwJHthdHRhY2htZW50TGFiZWx9YCA6IGF0dGFjaG1lbnRMYWJlbDtcblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLmdldE91dHB1dEl0ZW0ocmVzb3VyY2UsIGF0dGFjaG1lbnQpPy5kYXRhLmJ1ZmZlciA/PyBuZXcgVWludDhBcnJheSgpO1xuXHRcdGxldCB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IEpTT04ucGFyc2UobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcikpIGFzIEVycm9yO1xuXHRcdFx0aWYgKGVycm9yLm5hbWUgJiYgZXJyb3IubWVzc2FnZSkge1xuXHRcdFx0XHR0aXRsZSA9IGAke2Vycm9yLm5hbWV9OiAke2Vycm9yLm1lc3NhZ2V9YDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vXG5cdFx0fVxuXHRcdHRoaXMubGFiZWwuc2V0TGFiZWwod2l0aEljb24sIHVuZGVmaW5lZCwgeyB0aXRsZSB9KTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQodGhpcy5nZXRBcmlhTGFiZWwoYXR0YWNobWVudCkpO1xuXHR9XG5cdHByaXZhdGUgcmVuZGVyR2VuZXJpY091dHB1dChyZXNvdXJjZTogVVJJLCBhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KSB7XG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KHRoaXMuZ2V0QXJpYUxhYmVsKGF0dGFjaG1lbnQpKTtcblx0XHR0aGlzLmxhYmVsLnNldEZpbGUocmVzb3VyY2UsIHsgaGlkZVBhdGg6IHRydWUsIGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ291dHB1dCcpIH0pO1xuXHR9XG5cdHByaXZhdGUgcmVuZGVySW1hZ2VPdXRwdXQocmVzb3VyY2U6IFVSSSwgYXR0YWNobWVudDogSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSkge1xuXHRcdGxldCBhcmlhTGFiZWw6IHN0cmluZztcblx0XHRpZiAoYXR0YWNobWVudC5vbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5GdWxsKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5vbWl0dGVkTm90ZWJvb2tJbWFnZUF0dGFjaG1lbnQnLCBcIk9taXR0ZWQgdGhpcyBOb3RlYm9vayBvdXB1dDogezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0fSBlbHNlIGlmIChhdHRhY2htZW50Lm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLlBhcnRpYWwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBhcnRpYWxseU9taXR0ZWROb3RlYm9va0ltYWdlQXR0YWNobWVudCcsIFwiUGFydGlhbGx5IG9taXR0ZWQgdGhpcyBOb3RlYm9vayBvdXRwdXQ6IHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmlhTGFiZWwgPSB0aGlzLmdldEFyaWFMYWJlbChhdHRhY2htZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBjbGlja0hhbmRsZXIgPSBhc3luYyAoKSA9PiBhd2FpdCB0aGlzLm9wZW5SZXNvdXJjZShyZXNvdXJjZSwgeyBlZGl0b3JPcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9LCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWUgPSB0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbCh0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsLmlkZW50aWZpZXIpPy5uYW1lID8/IHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwuaWRlbnRpZmllciA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLmdldE91dHB1dEl0ZW0ocmVzb3VyY2UsIGF0dGFjaG1lbnQpPy5kYXRhLmJ1ZmZlciA/PyBuZXcgVWludDhBcnJheSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUltYWdlRWxlbWVudHMocmVzb3VyY2UsIGF0dGFjaG1lbnQubmFtZSwgYXR0YWNobWVudC5uYW1lLCB0aGlzLmVsZW1lbnQsIGJ1ZmZlciwgYXR0YWNobWVudC5pZCwgdGhpcy5ob3ZlclNlcnZpY2UsIGFyaWFMYWJlbCwgY3VycmVudExhbmd1YWdlTW9kZWxOYW1lLCBjbGlja0hhbmRsZXIsIHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwsIGF0dGFjaG1lbnQub21pdHRlZFN0YXRlKSk7XG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE91dHB1dEl0ZW0ocmVzb3VyY2U6IFVSSSwgYXR0YWNobWVudDogSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSkge1xuXHRcdGNvbnN0IHBhcnNlZEluZm8gPSBDZWxsVXJpLnBhcnNlQ2VsbE91dHB1dFVyaShyZXNvdXJjZSk7XG5cdFx0aWYgKCFwYXJzZWRJbmZvIHx8IHR5cGVvZiBwYXJzZWRJbmZvLmNlbGxIYW5kbGUgIT09ICdudW1iZXInIHx8IHR5cGVvZiBwYXJzZWRJbmZvLm91dHB1dEluZGV4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbChwYXJzZWRJbmZvLm5vdGVib29rKTtcblx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsID0gbm90ZWJvb2suY2VsbHMuZmluZChjID0+IGMuaGFuZGxlID09PSBwYXJzZWRJbmZvLmNlbGxIYW5kbGUpO1xuXHRcdGlmICghY2VsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0cHV0ID0gY2VsbC5vdXRwdXRzLmxlbmd0aCA+IHBhcnNlZEluZm8ub3V0cHV0SW5kZXggPyBjZWxsLm91dHB1dHNbcGFyc2VkSW5mby5vdXRwdXRJbmRleF0gOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG91dHB1dD8ub3V0cHV0cy5maW5kKG8gPT4gby5taW1lID09PSBhdHRhY2htZW50Lm1pbWVUeXBlKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50Q2hhdEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSUVsZW1lbnRWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlOiBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50QXR0YWNobWVudCcsIFwiQXR0YWNoZWQgZWxlbWVudCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0Y29uc3QgYXR0YWNobWVudExhYmVsID0gYXR0YWNobWVudC5uYW1lO1xuXHRcdGNvbnN0IHdpdGhJY29uID0gYXR0YWNobWVudC5pY29uPy5pZCA/IGAkKCR7YXR0YWNobWVudC5pY29uLmlkfSlcXHUwMEEwJHthdHRhY2htZW50TGFiZWx9YCA6IGF0dGFjaG1lbnRMYWJlbDtcblx0XHR0aGlzLmxhYmVsLnNldExhYmVsKHdpdGhJY29uKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwgdGhpcy5nZXRIb3ZlckNvbnRlbnQoYXR0YWNobWVudCksIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuRWxlbWVudEF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIb3ZlckNvbnRlbnQoYXR0YWNobWVudDogSUVsZW1lbnRWYXJpYWJsZUVudHJ5KTogSURlbGF5ZWRIb3Zlck9wdGlvbnMge1xuXHRcdGlmICghdGhpcy5zaG91bGRSZW5kZXJSaWNoRWxlbWVudEhvdmVyKGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTaW1wbGVIb3ZlckNvbnRlbnQoYXR0YWNobWVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXIuY2hhdC1lbGVtZW50LWhvdmVyJyk7XG5cblx0XHQvLyBXcmFwIGFsbCBzZWN0aW9ucyBpbiBhIHNjcm9sbGFibGUgY29udGFpbmVyIGZvciBWUyBDb2RlIHN0eWxlZCBzY3JvbGxiYXJcblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWNvbnRlbnQnKTtcblx0XHRjb25zdCBpbm5lclNjcm9sbGFibGVzOiBEb21TY3JvbGxhYmxlRWxlbWVudFtdID0gW107XG5cblx0XHRpZiAoYXR0YWNobWVudC5pbWFnZURhdGEpIHtcblx0XHRcdHRoaXMuYXBwZW5kSW1hZ2VQcmV2aWV3KGF0dGFjaG1lbnQsIHNjcm9sbGFibGVDb250ZW50LCAoKSA9PiBzY3JvbGxhYmxlRWxlbWVudC5zY2FuRG9tTm9kZSgpKTtcblx0XHR9XG5cblx0XHQvLyBFTEVNRU5UIHNlY3Rpb246IHNob3cgdGhlIHNlbGVjdGVkIGVsZW1lbnQgdGFnIHdpdGggYWxsIGF0dHJpYnV0ZXNcblx0XHR7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItc2VjdGlvbicpO1xuXHRcdFx0Y29uc3QgaGVhZGVyID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItaGVhZGVyJywge30sIGxvY2FsaXplKCdjaGF0LmVsZW1lbnRIb3Zlci5lbGVtZW50JywgXCJFTEVNRU5UXCIpKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblx0XHRcdGNvbnN0IGVsZW1lbnRQcmUgPSBkb20uJCgncHJlLmNoYXQtZWxlbWVudC1ob3Zlci1jb2RlJyk7XG5cdFx0XHRjb25zdCBlbGVtZW50Q29kZSA9IGRvbS4kKCdjb2RlJyk7XG5cdFx0XHQvLyBCdWlsZCB0aGUgZWxlbWVudCB0YWcgZnJvbSB0aGUgb3V0ZXJIVE1MIChqdXN0IHRoZSBvcGVuaW5nIHRhZylcblx0XHRcdGNvbnN0IHRhZ0Rpc3BsYXkgPSB0aGlzLmZvcm1hdEVsZW1lbnRUYWcoYXR0YWNobWVudCk7XG5cdFx0XHRlbGVtZW50Q29kZS50ZXh0Q29udGVudCA9IHRhZ0Rpc3BsYXk7XG5cdFx0XHRlbGVtZW50UHJlLmFwcGVuZENoaWxkKGVsZW1lbnRDb2RlKTtcblx0XHRcdGNvbnN0IGVsZW1lbnRTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGVsZW1lbnRQcmUsIHtcblx0XHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR9KSk7XG5cdFx0XHRpbm5lclNjcm9sbGFibGVzLnB1c2goZWxlbWVudFNjcm9sbGFibGUpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChlbGVtZW50U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gS0VZIENPTVBVVEVEIFNUWUxFUyBzZWN0aW9uXG5cdFx0Y29uc3QgY29tcHV0ZWRTdHlsZUVudHJpZXMgPSB0aGlzLmdldENvbXB1dGVkU3R5bGVFbnRyaWVzRm9ySG92ZXIoYXR0YWNobWVudC5jb21wdXRlZFN0eWxlcyk7XG5cdFx0aWYgKGNvbXB1dGVkU3R5bGVFbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1oZWFkZXInLCB7fSwgbG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLmNvbXB1dGVkU3R5bGVzJywgXCJLRVkgQ09NUFVURUQgU1RZTEVTXCIpKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblx0XHRcdGNvbnN0IHRhYmxlID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItdGFibGUnKTtcblx0XHRcdGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBjb21wdXRlZFN0eWxlRW50cmllcykge1xuXHRcdFx0XHRjb25zdCByb3cgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1yb3cnKTtcblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtZWxlbWVudC1ob3Zlci1sYWJlbCcsIHt9LCBgJHtuYW1lfTpgKSk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlQ29udGFpbmVyID0gZG9tLiQoJ3NwYW4uY2hhdC1lbGVtZW50LWhvdmVyLXZhbHVlJyk7XG5cdFx0XHRcdC8vIFNob3cgY29sb3Igc3dhdGNoIGZvciBjb2xvciBwcm9wZXJ0aWVzXG5cdFx0XHRcdGlmICgobmFtZSA9PT0gJ2NvbG9yJyB8fCBuYW1lID09PSAnYmFja2dyb3VuZC1jb2xvcicpICYmIHZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3dhdGNoID0gZG9tLiQoJ3NwYW4uY2hhdC1lbGVtZW50LWhvdmVyLWNvbG9yLXN3YXRjaCcpO1xuXHRcdFx0XHRcdHN3YXRjaC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB2YWx1ZTtcblx0XHRcdFx0XHR2YWx1ZUNvbnRhaW5lci5hcHBlbmRDaGlsZChzd2F0Y2gpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZhbHVlQ29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHZhbHVlKSk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZCh2YWx1ZUNvbnRhaW5lcik7XG5cdFx0XHRcdHRhYmxlLmFwcGVuZENoaWxkKHJvdyk7XG5cdFx0XHR9XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHRhYmxlKTtcblx0XHRcdGNvbnN0IHNob3dNb3JlQnV0dG9uID0gZG9tLiQoJ2J1dHRvbi5jaGF0LWVsZW1lbnQtaG92ZXItc2hvdy1tb3JlJywgeyB0eXBlOiAnYnV0dG9uJyB9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuc2hvd01vcmUnLCBcIlNob3cgTW9yZS4uLlwiKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNob3dNb3JlQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyBlID0+IHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbkVsZW1lbnRBdHRhY2htZW50KGF0dGFjaG1lbnQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChzaG93TW9yZUJ1dHRvbik7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBIVE1MIFBBVEggc2VjdGlvbjogcmVuZGVyIGFuY2VzdG9yIGNoYWluIGFzIGluZGVudGVkIEhUTUwgdHJlZVxuXHRcdGlmIChhdHRhY2htZW50LmFuY2VzdG9ycyAmJiBhdHRhY2htZW50LmFuY2VzdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItc2VjdGlvbicpO1xuXHRcdFx0Y29uc3QgaGVhZGVyID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItaGVhZGVyJywge30sIGxvY2FsaXplKCdjaGF0LmVsZW1lbnRIb3Zlci5odG1sUGF0aCcsIFwiSFRNTCBQQVRIXCIpKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhdHRhY2htZW50LmFuY2VzdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhbmNlc3RvciA9IGF0dGFjaG1lbnQuYW5jZXN0b3JzW2ldO1xuXHRcdFx0XHRjb25zdCBpbmRlbnQgPSAnICAnLnJlcGVhdChpKTtcblx0XHRcdFx0Y29uc3QgdGFnID0gdGhpcy5mb3JtYXRBbmNlc3RvclRhZyhhbmNlc3Rvcik7XG5cdFx0XHRcdGxpbmVzLnB1c2goYCR7aW5kZW50fSR7dGFnfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGF0aFByZSA9IGRvbS4kKCdwcmUuY2hhdC1lbGVtZW50LWhvdmVyLWNvZGUnKTtcblx0XHRcdGNvbnN0IHBhdGhDb2RlID0gZG9tLiQoJ2NvZGUnKTtcblx0XHRcdHBhdGhDb2RlLnRleHRDb250ZW50ID0gbGluZXMuam9pbignXFxuJyk7XG5cdFx0XHRwYXRoUHJlLmFwcGVuZENoaWxkKHBhdGhDb2RlKTtcblx0XHRcdGNvbnN0IHBhdGhTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHBhdGhQcmUsIHtcblx0XHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR9KSk7XG5cdFx0XHRpbm5lclNjcm9sbGFibGVzLnB1c2gocGF0aFNjcm9sbGFibGUpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChwYXRoU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gQVRUUklCVVRFUyBzZWN0aW9uXG5cdFx0aWYgKGF0dGFjaG1lbnQuYXR0cmlidXRlcyAmJiBPYmplY3Qua2V5cyhhdHRhY2htZW50LmF0dHJpYnV0ZXMpLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1oZWFkZXInLCB7fSwgbG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLmF0dHJpYnV0ZXMnLCBcIkFUVFJJQlVURVNcIikpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXHRcdFx0Y29uc3QgdGFibGUgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci10YWJsZScpO1xuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGF0dGFjaG1lbnQuYXR0cmlidXRlcykpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItcm93Jyk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItbGFiZWwnLCB7fSwgYCR7bmFtZX06YCkpO1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1lbGVtZW50LWhvdmVyLXZhbHVlJywge30sIHZhbHVlKSk7XG5cdFx0XHRcdHRhYmxlLmFwcGVuZENoaWxkKHJvdyk7XG5cdFx0XHR9XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHRhYmxlKTtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIFBPU0lUSU9OICYgU0laRSBzZWN0aW9uXG5cdFx0aWYgKGF0dGFjaG1lbnQuZGltZW5zaW9ucykge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IGhlYWRlciA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWhlYWRlcicsIHt9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIucG9zaXRpb25TaXplJywgXCJQT1NJVElPTiAmIFNJWkVcIikpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXHRcdFx0Y29uc3QgdGFibGUgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci10YWJsZScpO1xuXHRcdFx0Y29uc3QgZGltczogW3N0cmluZywgbnVtYmVyXVtdID0gW1xuXHRcdFx0XHRbJ3RvcDonLCBhdHRhY2htZW50LmRpbWVuc2lvbnMudG9wXSxcblx0XHRcdFx0WydsZWZ0OicsIGF0dGFjaG1lbnQuZGltZW5zaW9ucy5sZWZ0XSxcblx0XHRcdFx0Wyd3aWR0aDonLCBhdHRhY2htZW50LmRpbWVuc2lvbnMud2lkdGhdLFxuXHRcdFx0XHRbJ2hlaWdodDonLCBhdHRhY2htZW50LmRpbWVuc2lvbnMuaGVpZ2h0XSxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGNvbnN0IFtsYWJlbCwgdmFsXSBvZiBkaW1zKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXJvdycpO1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1lbGVtZW50LWhvdmVyLWxhYmVsJywge30sIGxhYmVsKSk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItdmFsdWUnLCB7fSwgYCR7TWF0aC5yb3VuZCh2YWwpfXB4YCkpO1xuXHRcdFx0XHR0YWJsZS5hcHBlbmRDaGlsZChyb3cpO1xuXHRcdFx0fVxuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZCh0YWJsZSk7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBJTk5FUiBURVhUIHNlY3Rpb25cblx0XHRpZiAoYXR0YWNobWVudC5pbm5lclRleHQpIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1oZWFkZXInLCB7fSwgbG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLmlubmVyVGV4dCcsIFwiSU5ORVIgVEVYVFwiKSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXRleHQnLCB7fSwgYXR0YWNobWVudC5pbm5lclRleHQpKTtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbGFibGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHNjcm9sbGFibGVDb250ZW50LCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVEb21Ob2RlID0gc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpO1xuXHRcdHNjcm9sbGFibGVEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZWxlbWVudC1ob3Zlci1zY3JvbGxhYmxlJyk7XG5cdFx0aG92ZXJFbGVtZW50LmFwcGVuZENoaWxkKHNjcm9sbGFibGVEb21Ob2RlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydjaGF0LWVsZW1lbnQtZGF0YS1ob3ZlciddLFxuXHRcdFx0b25EaWRTaG93OiAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBpbm5lclNjcm9sbGFibGVzKSB7XG5cdFx0XHRcdFx0cy5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNjcm9sbGFibGVFbGVtZW50LnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlbmRlclJpY2hFbGVtZW50SG92ZXIoYXR0YWNobWVudDogSUVsZW1lbnRWYXJpYWJsZUVudHJ5KTogYm9vbGVhbiB7XG5cdFx0aWYgKGF0dGFjaG1lbnQuZGltZW5zaW9ucyB8fCBhdHRhY2htZW50LmlubmVyVGV4dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGF0dGFjaG1lbnQuYW5jZXN0b3JzICYmIGF0dGFjaG1lbnQuYW5jZXN0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChhdHRhY2htZW50LmF0dHJpYnV0ZXMgJiYgT2JqZWN0LmtleXMoYXR0YWNobWVudC5hdHRyaWJ1dGVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoYXR0YWNobWVudC5jb21wdXRlZFN0eWxlcyAmJiBPYmplY3Qua2V5cyhhdHRhY2htZW50LmNvbXB1dGVkU3R5bGVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZEltYWdlUHJldmlldyhhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnksIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9uQ29udGVudHNDaGFuZ2VkOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24uY2hhdC1lbGVtZW50LWhvdmVyLXNjcmVlbnNob3QnKTtcblx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWhlYWRlcicsIHt9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuc2NyZWVuc2hvdCcsIFwiU0NSRUVOU0hPVFwiKSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblxuXHRcdGNvbnN0IHByZXZpZXdEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgYXBwZW5kUHJldmlldyA9IChkYXRhOiBVaW50OEFycmF5KSA9PiB7XG5cdFx0XHRpZiAocHJldmlld0Rpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuaXNVcmkoYXR0YWNobWVudC5pbWFnZURhdGEpXG5cdFx0XHRcdD8gYXR0YWNobWVudC5pbWFnZURhdGFcblx0XHRcdFx0OiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5kYXRhLCBwYXRoOiBgJHthdHRhY2htZW50LmlkfS8ke2VuY29kZVVSSUNvbXBvbmVudChhdHRhY2htZW50Lm5hbWUpfWAgfSk7XG5cdFx0XHRjb25zdCBjbGlja0hhbmRsZXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltYWdlQ2Fyb3VzZWxFbmFibGVkKVxuXHRcdFx0XHQ/IGFzeW5jICgpID0+IHRoaXMuY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLm9wZW5DYXJvdXNlbEF0UmVzb3VyY2UocmVzb3VyY2UsIGRhdGEpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJldmlldyA9IGNyZWF0ZUltYWdlSG92ZXJDb250ZW50KFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGF0dGFjaG1lbnQubmFtZSxcblx0XHRcdFx0ZGF0YSxcblx0XHRcdFx0YCR7YXR0YWNobWVudC5pZH06c2NyZWVuc2hvdGAsXG5cdFx0XHRcdG9uQ29udGVudHNDaGFuZ2VkLFxuXHRcdFx0XHRjbGlja0hhbmRsZXIsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLnNjcmVlbnNob3RBbHQnLCBcIlNjcmVlbnNob3Qgb2YgYXR0YWNoZWQgZWxlbWVudCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKSxcblx0XHRcdCk7XG5cdFx0XHRwcmV2aWV3RGlzcG9zYWJsZXMuYWRkKHByZXZpZXcuZGlzcG9zYWJsZSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHByZXZpZXcuZWxlbWVudCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlubGluZURhdGEgPSBjb2VyY2VJbWFnZUJ1ZmZlcihhdHRhY2htZW50LmltYWdlRGF0YSk7XG5cdFx0aWYgKGlubGluZURhdGEpIHtcblx0XHRcdGFwcGVuZFByZXZpZXcoaW5saW5lRGF0YSk7XG5cdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkoYXR0YWNobWVudC5pbWFnZURhdGEpKSB7XG5cdFx0XHR2b2lkIHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoYXR0YWNobWVudC5pbWFnZURhdGEpLnRoZW4oXG5cdFx0XHRcdGNvbnRlbnQgPT4gYXBwZW5kUHJldmlldyhjb250ZW50LnZhbHVlLmJ1ZmZlciksXG5cdFx0XHRcdGVycm9yID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0VsZW1lbnRDaGF0QXR0YWNobWVudFdpZGdldF0gRmFpbGVkIHRvIHJlYWQgc2NyZWVuc2hvdCAnJHthdHRhY2htZW50LmltYWdlRGF0YX0nOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0XHRzZWN0aW9uLnJlbW92ZSgpO1xuXHRcdFx0XHRcdG9uQ29udGVudHNDaGFuZ2VkKCk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTaW1wbGVIb3ZlckNvbnRlbnQoYXR0YWNobWVudDogSUVsZW1lbnRWYXJpYWJsZUVudHJ5KTogSURlbGF5ZWRIb3Zlck9wdGlvbnMge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhdHRhY2htZW50LnZhbHVlPy50b1N0cmluZygpID8/ICcnO1xuXHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdGhvdmVyQ29udGVudC5hcHBlbmRUZXh0KGF0dGFjaG1lbnQuZnVsbE5hbWUgPz8gYXR0YWNobWVudC5uYW1lKTtcblx0XHRpZiAoY29udGVudC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0aG92ZXJDb250ZW50LmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHRcdGhvdmVyQ29udGVudC5hcHBlbmRDb2RlYmxvY2soJ3RleHQnLCBjb250ZW50KTtcblx0XHR9XG5cblx0XHRpZiAoYXR0YWNobWVudC5pbWFnZURhdGEpIHtcblx0XHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWhvdmVyLmNoYXQtZWxlbWVudC1ob3ZlcicpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1jb250ZW50Jyk7XG5cdFx0XHR0aGlzLmFwcGVuZEltYWdlUHJldmlldyhhdHRhY2htZW50LCBzY3JvbGxhYmxlQ29udGVudCwgKCkgPT4gc2Nyb2xsYWJsZUVsZW1lbnQuc2NhbkRvbU5vZGUoKSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duU2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihob3ZlckNvbnRlbnQpKTtcblx0XHRcdG1hcmtkb3duU2VjdGlvbi5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQobWFya2Rvd25TZWN0aW9uKTtcblxuXHRcdFx0Y29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoc2Nyb2xsYWJsZUNvbnRlbnQsIHtcblx0XHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRcdGNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZDogdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHNjcm9sbGFibGVEb21Ob2RlID0gc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpO1xuXHRcdFx0c2Nyb2xsYWJsZURvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1lbGVtZW50LWhvdmVyLXNjcm9sbGFibGUnKTtcblx0XHRcdGhvdmVyRWxlbWVudC5hcHBlbmRDaGlsZChzY3JvbGxhYmxlRG9tTm9kZSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydjaGF0LWVsZW1lbnQtZGF0YS1ob3ZlciddLFxuXHRcdFx0XHRvbkRpZFNob3c6ICgpID0+IHNjcm9sbGFibGVFbGVtZW50LnNjYW5Eb21Ob2RlKCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBob3ZlckNvbnRlbnQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29tcHV0ZWRTdHlsZUVudHJpZXNGb3JIb3Zlcihjb21wdXRlZFN0eWxlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4gfCB1bmRlZmluZWQpOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIHN0cmluZ10+IHtcblx0XHRpZiAoIWNvbXB1dGVkU3R5bGVzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5RW50cmllczogQXJyYXk8W3N0cmluZywgc3RyaW5nXT4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIEtFWV9FTEVNRU5UX0hPVkVSX0NPTVBVVEVEX1NUWUxFX1BST1BFUlRJRVMpIHtcblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gJ21hcmdpbicgfHwgcHJvcGVydHkgPT09ICdwYWRkaW5nJykge1xuXHRcdFx0XHRjb25zdCBzaG9ydGhhbmQgPSB0aGlzLmdldEJveFNob3J0aGFuZFZhbHVlKGNvbXB1dGVkU3R5bGVzLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc2hvcnRoYW5kID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGtleUVudHJpZXMucHVzaChbcHJvcGVydHksIHNob3J0aGFuZF0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gY29tcHV0ZWRTdHlsZXNbcHJvcGVydHldO1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0a2V5RW50cmllcy5wdXNoKFtwcm9wZXJ0eSwgdmFsdWVdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayBmb3Igb2xkZXIgcGF5bG9hZHMgdGhhdCBtaWdodCBub3QgaW5jbHVkZSB0aGUga2V5IHByb3BlcnRpZXMuXG5cdFx0aWYgKGtleUVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGtleUVudHJpZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE9iamVjdC5lbnRyaWVzKGNvbXB1dGVkU3R5bGVzKS5zbGljZSgwLCBLRVlfRUxFTUVOVF9IT1ZFUl9DT01QVVRFRF9TVFlMRV9QUk9QRVJUSUVTLmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEJveFNob3J0aGFuZFZhbHVlKGNvbXB1dGVkU3R5bGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiwgcHJvcGVydHlOYW1lOiAnbWFyZ2luJyB8ICdwYWRkaW5nJyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdG9wID0gY29tcHV0ZWRTdHlsZXNbYCR7cHJvcGVydHlOYW1lfS10b3BgXTtcblx0XHRjb25zdCByaWdodCA9IGNvbXB1dGVkU3R5bGVzW2Ake3Byb3BlcnR5TmFtZX0tcmlnaHRgXTtcblx0XHRjb25zdCBib3R0b20gPSBjb21wdXRlZFN0eWxlc1tgJHtwcm9wZXJ0eU5hbWV9LWJvdHRvbWBdO1xuXHRcdGNvbnN0IGxlZnQgPSBjb21wdXRlZFN0eWxlc1tgJHtwcm9wZXJ0eU5hbWV9LWxlZnRgXTtcblxuXHRcdGlmICh0eXBlb2YgdG9wID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcmlnaHQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBib3R0b20gPT09ICdzdHJpbmcnICYmIHR5cGVvZiBsZWZ0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGAke3RvcH0gJHtyaWdodH0gJHtib3R0b219ICR7bGVmdH1gO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wdXRlZFN0eWxlc1twcm9wZXJ0eU5hbWVdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRWxlbWVudEF0dGFjaG1lbnQoYXR0YWNobWVudDogSUVsZW1lbnRWYXJpYWJsZUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF0dGFjaG1lbnQudmFsdWU/LnRvU3RyaW5nKCkgfHwgJyc7XG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdGNvbnRlbnRzOiBjb250ZW50LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRwaW5uZWQ6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0RWxlbWVudFRhZyhhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnkpOiBzdHJpbmcge1xuXHRcdC8vIEV4dHJhY3QgdGhlIG9wZW5pbmcgdGFnIGZyb20gdGhlIG91dGVySFRNTCB3aXRoaW4gdGhlIHZhbHVlIHN0cmluZ1xuXHRcdC8vIFZhbHVlIGZvcm1hdDogXCJBdHRhY2hlZCBIVE1MIGFuZCBDU1MgQ29udGV4dFxcblxcbjx0YWcgLi4uPi4uLjwvdGFnPlxcblxcbi4uLlwiXG5cdFx0Y29uc3QgY29udGVudCA9IGF0dGFjaG1lbnQudmFsdWU/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0Y29uc3QgaHRtbE1hdGNoID0gY29udGVudC5tYXRjaCgvXFxuXFxuKDxbXj5dKz4pLyk7XG5cdFx0aWYgKGh0bWxNYXRjaCkge1xuXHRcdFx0cmV0dXJuIGh0bWxNYXRjaFsxXTtcblx0XHR9XG5cdFx0Ly8gRmFsbGJhY2s6IHRyeSBmaXJzdCB0YWcgaW4gY29udGVudFxuXHRcdGNvbnN0IGZhbGxiYWNrID0gY29udGVudC5tYXRjaCgvPChbXj5dKyk+Lyk7XG5cdFx0aWYgKGZhbGxiYWNrKSB7XG5cdFx0XHRyZXR1cm4gYDwke2ZhbGxiYWNrWzFdfT5gO1xuXHRcdH1cblx0XHRyZXR1cm4gYDwke2F0dGFjaG1lbnQubmFtZX0+YDtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0QW5jZXN0b3JUYWcoYW5jZXN0b3I6IHsgdGFnTmFtZTogc3RyaW5nOyBpZD86IHN0cmluZzsgY2xhc3NOYW1lcz86IHN0cmluZ1tdIH0pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHBhcnRzID0gW2A8JHthbmNlc3Rvci50YWdOYW1lfWBdO1xuXHRcdGlmIChhbmNlc3Rvci5jbGFzc05hbWVzPy5sZW5ndGgpIHtcblx0XHRcdHBhcnRzLnB1c2goYCBjbGFzcz1cIiR7YW5jZXN0b3IuY2xhc3NOYW1lcy5qb2luKCcgJyl9XCJgKTtcblx0XHR9XG5cdFx0aWYgKGFuY2VzdG9yLmlkKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKGAgaWQ9XCIke2FuY2VzdG9yLmlkfVwiYCk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJ0cy5qb2luKCcnKSArICc+Jztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNSGlzdG9yeUl0ZW1BdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGF0dGFjaG1lbnQ6IElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChhdHRhY2htZW50Lm5hbWUsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50JywgXCJBdHRhY2hlZCBjb250ZXh0LCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQsIGRpc3Bvc2FibGVzIH0gPSB0b0hpc3RvcnlJdGVtSG92ZXJDb250ZW50KG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBhdHRhY2htZW50Lmhpc3RvcnlJdGVtLCBmYWxzZSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQsXG5cdFx0fSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0dGhpcy5fb3BlbkF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX29wZW5BdHRhY2htZW50KGF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5BdHRhY2htZW50KGF0dGFjaG1lbnQ6IElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfd29ya2JlbmNoLm9wZW5NdWx0aURpZmZFZGl0b3InLCB7XG5cdFx0XHR0aXRsZTogZ2V0SGlzdG9yeUl0ZW1FZGl0b3JUaXRsZShhdHRhY2htZW50Lmhpc3RvcnlJdGVtKSwgbXVsdGlEaWZmU291cmNlVXJpOiBhdHRhY2htZW50LnZhbHVlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNDTUhpc3RvcnlJdGVtQ2hhbmdlQXR0YWNobWVudFdpZGdldCBleHRlbmRzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhdHRhY2htZW50OiBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBuYW1lU3VmZml4ID0gYFxcdTAwQTAkKCR7Q29kaWNvbi5naXRDb21taXQuaWR9KSR7YXR0YWNobWVudC5oaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gYXR0YWNobWVudC5oaXN0b3J5SXRlbS5pZH1gO1xuXHRcdHRoaXMubGFiZWwuc2V0RmlsZShhdHRhY2htZW50LnZhbHVlLCB7IGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLCBoaWRlUGF0aDogdHJ1ZSwgbmFtZVN1ZmZpeCB9KTtcblxuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50JywgXCJBdHRhY2hlZCBjb250ZXh0LCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQsIGRpc3Bvc2FibGVzIH0gPSB0b0hpc3RvcnlJdGVtSG92ZXJDb250ZW50KG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBhdHRhY2htZW50Lmhpc3RvcnlJdGVtLCBmYWxzZSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucywgY29udGVudCxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5hZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhhdHRhY2htZW50LnZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiB0cnVlKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiBmYWxzZSwgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5FZGl0b3JPcHRpb25zLCBpc0RpcmVjdG9yeT86IGJvb2xlYW4sIHJhbmdlPzogSVJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IHRoaXMuYXR0YWNobWVudCBhcyBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5O1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gYXR0YWNobWVudC5oaXN0b3J5SXRlbTtcblxuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6IGAke2Jhc2VuYW1lKHJlc291cmNlLnBhdGgpfSAoJHtoaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW0uaWR9KWAsXG5cdFx0XHRvcHRpb25zOiB7IC4uLm9wdGlvbnMuZWRpdG9yT3B0aW9ucyB9XG5cdFx0fSwgb3B0aW9ucy5vcGVuVG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGF0dGFjaG1lbnQ6IElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1TdGFydElkID0gYXR0YWNobWVudC5oaXN0b3J5SXRlbUNoYW5nZVN0YXJ0Lmhpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBhdHRhY2htZW50Lmhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQuaGlzdG9yeUl0ZW0uaWQ7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1FbmRJZCA9IGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2VFbmQuaGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2VFbmQuaGlzdG9yeUl0ZW0uaWQ7XG5cblx0XHRjb25zdCBuYW1lU3VmZml4ID0gYFxcdTAwQTAkKCR7Q29kaWNvbi5naXRDb21taXQuaWR9KSR7aGlzdG9yeUl0ZW1TdGFydElkfS4uJHtoaXN0b3J5SXRlbUVuZElkfWA7XG5cdFx0dGhpcy5sYWJlbC5zZXRGaWxlKGF0dGFjaG1lbnQudmFsdWUsIHsgZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsIGhpZGVQYXRoOiB0cnVlLCBuYW1lU3VmZml4IH0pO1xuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGNvbnRleHQsIHswfVwiLCBhdHRhY2htZW50Lm5hbWUpKTtcblxuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMoYXR0YWNobWVudC52YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5FZGl0b3JPcHRpb25zLCBpc0RpcmVjdG9yeTogdHJ1ZSk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5FZGl0b3JPcHRpb25zLCBpc0RpcmVjdG9yeTogZmFsc2UsIHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgaXNEaXJlY3Rvcnk/OiBib29sZWFuLCByYW5nZT86IElSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQgPSB0aGlzLmF0dGFjaG1lbnQgYXMgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5O1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQgPSBhdHRhY2htZW50Lmhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQ7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1DaGFuZ2VFbmQgPSBhdHRhY2htZW50Lmhpc3RvcnlJdGVtQ2hhbmdlRW5kO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxVcmlUaXRsZSA9IGAke2Jhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQudXJpLmZzUGF0aCl9ICgke2hpc3RvcnlJdGVtQ2hhbmdlU3RhcnQuaGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQuaGlzdG9yeUl0ZW0uaWR9KWA7XG5cdFx0Y29uc3QgbW9kaWZpZWRVcmlUaXRsZSA9IGAke2Jhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlRW5kLnVyaS5mc1BhdGgpfSAoJHtoaXN0b3J5SXRlbUNoYW5nZUVuZC5oaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW1DaGFuZ2VFbmQuaGlzdG9yeUl0ZW0uaWR9KWA7XG5cblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydC51cmkgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZUVuZC51cmkgfSxcblx0XHRcdGxhYmVsOiBgJHtvcmlnaW5hbFVyaVRpdGxlfSBcdTIxOTQgJHttb2RpZmllZFVyaVRpdGxlfWAsXG5cdFx0XHRvcHRpb25zOiB7IC4uLm9wdGlvbnMuZWRpdG9yT3B0aW9ucyB9XG5cdFx0fSwgb3B0aW9ucy5vcGVuVG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3QXR0YWNobWVudFdpZGdldCBleHRlbmRzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0TGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfaW5wdXQ6IEJyb3dzZXJFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2htZW50OiBJQnJvd3NlclZpZXdWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Jyb3dzZXJWaWV3U2VydmljZTogSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoX2F0dGFjaG1lbnQsIF9vcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9yZXNvbHZlSW5wdXQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9icm93c2VyVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VCcm93c2VyVmlld3MoKCkgPT4gdGhpcy5fcmVzb2x2ZUlucHV0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9icm93c2VyVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VTaGFyaW5nQXZhaWxhYmxlKCgpID0+IHRoaXMuX3VwZGF0ZUxhYmVsKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsICgpID0+ICh7XG5cdFx0XHQuLi5jb21tb25Ib3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiB0aGlzLl9pbnB1dFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRbQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkXTogdGhpcy5faW5wdXQuZ2V0VGl0bGUoKSA/PyAnJyxcblx0XHRcdFx0XHRbQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuTm90U2hhcmVkXTogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclZpZXdOb3RTaGFyZWQnLCBcIlRoaXMgYnJvd3NlciBwYWdlIGlzIG5vdCBzaGFyZWQgd2l0aCB0aGUgYWdlbnQuXCIpLFxuXHRcdFx0XHRcdFtCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5VbmF2YWlsYWJsZV06IGxvY2FsaXplKCdjaGF0LmJyb3dzZXJUb29sc0Rpc2FibGVkJywgXCJCcm93c2VyIHRvb2xzIGFyZSBub3QgZW5hYmxlZC5cIiksXG5cdFx0XHRcdH1bdGhpcy5faW5wdXQubW9kZWw/LnNoYXJpbmdTdGF0ZSA/PyBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWRdXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclZpZXdDbG9zZWQnLCBcIlRoaXMgYnJvd3NlciBwYWdlIGlzIG5vIGxvbmdlciBvcGVuLlwiKSxcblx0XHR9KSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgX2F0dGFjaG1lbnQudmFsdWUpKTtcblx0XHR9KTtcblx0XHR0aGlzLmFkZFJlc291cmNlT3BlbkhhbmRsZXJzKF9hdHRhY2htZW50LnZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvb2sgdXAgdGhlIGN1cnJlbnQgQnJvd3NlckVkaXRvcklucHV0IGZvciB0aGlzIGF0dGFjaG1lbnQncyBicm93c2VyIElELCBiaW5kIGxpc3RlbmVycywgYW5kIHJlZnJlc2ggdGhlIFVJLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUlucHV0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlLmdldEtub3duQnJvd3NlclZpZXdzKCkuZ2V0KHRoaXMuX2F0dGFjaG1lbnQuYnJvd3NlcklkKTtcblx0XHRpZiAodGhpcy5faW5wdXQgPT09IGlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5wdXRMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbnB1dCA9IGlucHV0O1xuXG5cdFx0aWYgKGlucHV0KSB7XG5cdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5hZGQoaW5wdXQub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2lucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVMYWJlbCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBMaXZlIG5hbWUgdXBkYXRlcyB3aGlsZSB0aGUgYXR0YWNobWVudCBpcyBzdGlsbCBpbiB0aGUgaW5wdXQgYXJlYVxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuc3VwcG9ydHNEZWxldGlvbikge1xuXHRcdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5hZGQoaW5wdXQub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB0aGlzLl91cGRhdGVMYWJlbCgpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbnB1dC5tb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5hZGQoaW5wdXQubW9kZWwub25EaWRDaGFuZ2VTaGFyaW5nU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlTGFiZWwoKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faW5wdXRMaXN0ZW5lcnMuYWRkKGlucHV0Lm9uRGlkUmVzb2x2ZU1vZGVsKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5hZGQoaW5wdXQubW9kZWwhLm9uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlKCgpID0+IHRoaXMuX3VwZGF0ZUxhYmVsKCkpKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVMYWJlbCgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5hbWUgPSB0aGlzLl9pbnB1dD8uZ2V0TmFtZSgpID8/IHRoaXMuX2F0dGFjaG1lbnQubmFtZTtcblx0XHRjb25zdCBzaGFyaW5nU3RhdGUgPSB0aGlzLl9pbnB1dD8ubW9kZWw/LnNoYXJpbmdTdGF0ZSA/PyBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQ7XG5cdFx0Y29uc3QgaXNBdmFpbGFibGUgPSAhIXRoaXMuX2lucHV0ICYmIHNoYXJpbmdTdGF0ZSA9PT0gQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3dhcm5pbmcnLCAhaXNBdmFpbGFibGUpO1xuXHRcdHRoaXMubGFiZWwuc2V0TGFiZWwobmFtZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRpY29uUGF0aDogQ29kaWNvbi5nbG9iZSxcblx0XHRcdHN0cmlrZXRocm91Z2g6ICFpc0F2YWlsYWJsZSxcblx0XHR9KTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQoXG5cdFx0XHR0aGlzLl9pbnB1dFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRbQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkXTogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclZpZXdBdHRhY2htZW50LmFyaWEnLCBcIkF0dGFjaGVkIGJyb3dzZXIgcGFnZSwgezB9XCIsIG5hbWUpLFxuXHRcdFx0XHRcdFtCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5Ob3RTaGFyZWRdOiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVmlld05vdFNoYXJlZC5hcmlhJywgXCJCcm93c2VyIHBhZ2Ugbm90IHNoYXJlZCB3aXRoIGFnZW50LCB7MH1cIiwgbmFtZSksXG5cdFx0XHRcdFx0W0Jyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlVuYXZhaWxhYmxlXTogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclRvb2xzRGlzYWJsZWQuYXJpYScsIFwiQnJvd3NlciB0b29scyBhcmUgbm90IGVuYWJsZWQsIHswfVwiLCBuYW1lKSxcblx0XHRcdFx0fVtzaGFyaW5nU3RhdGVdXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclZpZXdDbG9zZWQuYXJpYScsIFwiQnJvd3NlciBwYWdlIHVuYXZhaWxhYmxlLCB7MH1cIiwgbmFtZSlcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiB0cnVlKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiBmYWxzZSwgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBvcGVuUmVzb3VyY2UoX3Jlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgX2lzRGlyZWN0b3J5PzogYm9vbGVhbiwgX3JhbmdlPzogSVJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lucHV0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGhpcy5faW5wdXQsIG9wdGlvbnMuZWRpdG9yT3B0aW9ucywgb3B0aW9ucy5vcGVuVG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSFRNTEVsZW1lbnQsIHJlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Ly8gQ29udGV4dFxuXHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQod2lkZ2V0KSk7XG5cdHNldFJlc291cmNlQ29udGV4dChhY2Nlc3Nvciwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHJlc291cmNlKTtcblxuXHQvLyBEcmFnIGFuZCBkcm9wXG5cdHdpZGdldC5kcmFnZ2FibGUgPSB0cnVlO1xuXHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQsICdkcmFnc3RhcnQnLCBlID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCBbcmVzb3VyY2VdLCBlKSk7XG5cdFx0ZS5kYXRhVHJhbnNmZXI/LnNldERyYWdJbWFnZSh3aWRnZXQsIDAsIDApO1xuXHR9KSk7XG5cblx0Ly8gQ29udGV4dCBtZW51XG5cdHN0b3JlLmFkZChhZGRCYXNpY0NvbnRleHRNZW51KGFjY2Vzc29yLCB3aWRnZXQsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBNZW51SWQuQ2hhdElucHV0UmVzb3VyY2VBdHRhY2htZW50Q29udGV4dCwgcmVzb3VyY2UpKTtcblxuXHRyZXR1cm4gc3RvcmU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBob29rVXBTeW1ib2xBdHRhY2htZW50RHJhZ0FuZENvbnRleHRNZW51KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IEhUTUxFbGVtZW50LCBwYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBhdHRhY2htZW50OiB7IG5hbWU6IHN0cmluZzsgdmFsdWU6IExvY2F0aW9uOyBraW5kOiBTeW1ib2xLaW5kIH0sIGNvbnRleHRNZW51SWQ6IE1lbnVJZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdGNvbnN0IGNvbnRleHRNZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dE1lbnVTZXJ2aWNlKTtcblx0Y29uc3QgbWVudVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1lbnVTZXJ2aWNlKTtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHQvLyBEcmFnIGFuZCBkcm9wXG5cdHdpZGdldC5kcmFnZ2FibGUgPSB0cnVlO1xuXHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQsICdkcmFnc3RhcnQnLCBlID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCBbeyByZXNvdXJjZTogYXR0YWNobWVudC52YWx1ZS51cmksIHNlbGVjdGlvbjogYXR0YWNobWVudC52YWx1ZS5yYW5nZSB9XSwgZSkpO1xuXG5cdFx0ZmlsbEluU3ltYm9sc0RyYWdEYXRhKFt7XG5cdFx0XHRmc1BhdGg6IGF0dGFjaG1lbnQudmFsdWUudXJpLmZzUGF0aCxcblx0XHRcdHJhbmdlOiBhdHRhY2htZW50LnZhbHVlLnJhbmdlLFxuXHRcdFx0bmFtZTogYXR0YWNobWVudC5uYW1lLFxuXHRcdFx0a2luZDogYXR0YWNobWVudC5raW5kLFxuXHRcdH1dLCBlKTtcblxuXHRcdGUuZGF0YVRyYW5zZmVyPy5zZXREcmFnSW1hZ2Uod2lkZ2V0LCAwLCAwKTtcblx0fSkpO1xuXG5cdC8vIENvbnRleHQgbWVudSAoY29udGV4dCBrZXkgc2VydmljZSBhbmQgcmVzb3VyY2UgY29udGV4dHMgYXJlIGluaXRpYWxpemVkIGxhemlseSBvbiBmaXJzdCBjb250ZXh0IG1lbnUgb3Blbilcblx0bGV0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGxldCBwcm92aWRlckNvbnRleHRzOiBSZWFkb25seUFycmF5PFtJQ29udGV4dEtleTxib29sZWFuPiwgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8dW5rbm93bj5dPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdCBlbnN1cmVDb250ZXh0S2V5U2VydmljZSA9ICgpID0+IHtcblx0XHRpZiAoIXNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChwYXJlbnRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQod2lkZ2V0KSk7XG5cdFx0XHRjaGF0QXR0YWNobWVudFJlc291cmNlQ29udGV4dEtleS5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldChhdHRhY2htZW50LnZhbHVlLnVyaS50b1N0cmluZygpKTtcblx0XHRcdHNldFJlc291cmNlQ29udGV4dChhY2Nlc3Nvciwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIGF0dGFjaG1lbnQudmFsdWUudXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHR9O1xuXG5cdGNvbnN0IGVuc3VyZVByb3ZpZGVyQ29udGV4dHMgPSAoKSA9PiB7XG5cdFx0Y29uc3QgY2tzID0gZW5zdXJlQ29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRpZiAoIXByb3ZpZGVyQ29udGV4dHMpIHtcblx0XHRcdHByb3ZpZGVyQ29udGV4dHMgPSBbXG5cdFx0XHRcdFtFZGl0b3JDb250ZXh0S2V5cy5oYXNEZWZpbml0aW9uUHJvdmlkZXIuYmluZFRvKGNrcyksIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlcl0sXG5cdFx0XHRcdFtFZGl0b3JDb250ZXh0S2V5cy5oYXNSZWZlcmVuY2VQcm92aWRlci5iaW5kVG8oY2tzKSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXJdLFxuXHRcdFx0XHRbRWRpdG9yQ29udGV4dEtleXMuaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlci5iaW5kVG8oY2tzKSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW1wbGVtZW50YXRpb25Qcm92aWRlcl0sXG5cdFx0XHRcdFtFZGl0b3JDb250ZXh0S2V5cy5oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyLmJpbmRUbyhja3MpLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS50eXBlRGVmaW5pdGlvblByb3ZpZGVyXSxcblx0XHRcdF07XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IHVwZGF0ZUNvbnRleHRLZXlzID0gYXN5bmMgKCkgPT4ge1xuXHRcdGVuc3VyZVByb3ZpZGVyQ29udGV4dHMoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoYXR0YWNobWVudC52YWx1ZS51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRmb3IgKGNvbnN0IFtjb250ZXh0S2V5LCByZWdpc3RyeV0gb2YgcHJvdmlkZXJDb250ZXh0cyEpIHtcblx0XHRcdFx0Y29udGV4dEtleS5zZXQocmVnaXN0cnkuaGFzKG1vZGVsKSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH07XG5cblx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2lkZ2V0LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgZG9tRXZlbnQgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KGRvbUV2ZW50KSwgZG9tRXZlbnQpO1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGRvbUV2ZW50LCB0cnVlKTtcblxuXHRcdGNvbnN0IGNrcyA9IGVuc3VyZUNvbnRleHRLZXlTZXJ2aWNlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdXBkYXRlQ29udGV4dEtleXMoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdH1cblxuXHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNrcyxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1lbnUgPSBtZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhjb250ZXh0TWVudUlkLCBja3MsIHsgYXJnOiBhdHRhY2htZW50LnZhbHVlIH0pO1xuXHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHRyZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIHNldFJlc291cmNlQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IG1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKTtcblxuXHRjb25zdCByZXNvdXJjZUNvbnRleHRLZXkgPSBuZXcgU3RhdGljUmVzb3VyY2VDb250ZXh0S2V5KHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBtb2RlbFNlcnZpY2UpO1xuXHRyZXNvdXJjZUNvbnRleHRLZXkuc2V0KHJlc291cmNlKTtcbn1cblxuZnVuY3Rpb24gYWRkQmFzaWNDb250ZXh0TWVudShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBIVE1MRWxlbWVudCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZSwgbWVudUlkOiBNZW51SWQsIGFyZzogdW5rbm93biwgdXBkYXRlQ29udGV4dEtleXM/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBjb250ZXh0TWVudVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRNZW51U2VydmljZSk7XG5cdGNvbnN0IG1lbnVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNZW51U2VydmljZSk7XG5cblx0cmV0dXJuIGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2lkZ2V0LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgZG9tRXZlbnQgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KGRvbUV2ZW50KSwgZG9tRXZlbnQpO1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGRvbUV2ZW50LCB0cnVlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB1cGRhdGVDb250ZXh0S2V5cz8uKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHR9XG5cblx0XHRjb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBzY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1lbnUgPSBtZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhtZW51SWQsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZyB9KTtcblx0XHRcdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn1cblxuZXhwb3J0IGNvbnN0IGNoYXRBdHRhY2htZW50UmVzb3VyY2VDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignY2hhdEF0dGFjaG1lbnRSZXNvdXJjZScsIHVuZGVmaW5lZCwgeyB0eXBlOiAnVVJJJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZXNvdXJjZScsIFwiVGhlIGZ1bGwgdmFsdWUgb2YgdGhlIGNoYXQgYXR0YWNobWVudCByZXNvdXJjZSwgaW5jbHVkaW5nIHNjaGVtZSBhbmQgcGF0aFwiKSB9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUztBQUNsQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxn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UUFBTSxxQkFBcUIsU0FBUyxJQUFJLG1CQUFtQjtBQUMzRCxRQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFFN0MsU0FBTyxJQUFJLHNCQUFzQixRQUFRLElBQUksVUFBVSxjQUFjLE9BQU0sYUFBWTtBQUN0RixVQUFNQSxTQUFRLElBQUksbUJBQW1CLElBQUksVUFBVSxRQUFRLEdBQUcsUUFBUTtBQUN0RSxRQUFJLFlBQVksS0FBSyxVQUFVLElBQUk7QUFFbkMsUUFBSTtBQUNILFlBQU0sb0JBQW9CO0FBQUEsSUFDM0IsU0FBUyxHQUFHO0FBQ1gsY0FBUSxNQUFNLENBQUM7QUFBQSxJQUNoQjtBQUVBLHVCQUFtQixnQkFBZ0I7QUFBQSxNQUNsQyxtQkFBbUI7QUFBQSxNQUNuQixXQUFXLE1BQU1BO0FBQUEsTUFDakIsWUFBWSxNQUFNO0FBQ2pCLGNBQU0sT0FBTyxZQUFZLGVBQWUsUUFBUSx5QkFBeUIsRUFBRSxJQUFJLENBQUM7QUFDaEYsZUFBTywwQkFBMEIsSUFBSTtBQUFBLE1BQ3RDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0Y7QUFFTyxNQUFNLG1DQUFtQyxJQUFJLGNBQXNCLDBCQUEwQixRQUFXLEVBQUUsTUFBTSxPQUFPLGFBQWEsU0FBUyxZQUFZLDJFQUEyRSxFQUFFLENBQUM7IiwKICAibmFtZXMiOiBbImV2ZW50IiwgIlRlcm1pbmFsQ29uc3RhbnRzIiwgInBpbGxJY29uIiwgImhvdmVyRWxlbWVudCIsICJhY2Nlc3NvciJdCn0K
