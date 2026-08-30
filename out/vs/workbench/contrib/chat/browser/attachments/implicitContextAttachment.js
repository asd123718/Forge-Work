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
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { localize } from "../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { FileKind, IFileService } from "../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ResourceContextKey } from "../../../../common/contextkeys.js";
import { isStringImplicitContextValue, resolveChatContextIcon } from "../../common/attachments/chatVariableEntries.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
import { BrowserViewUri } from "../../../../../platform/browserView/common/browserViewUri.js";
let ImplicitContextAttachmentWidget = class extends Disposable {
  constructor(widgetRef, isAttachmentAlreadyAttached, attachment, resourceLabels, attachmentModel, domNode, contextKeyService, contextMenuService, labelService, menuService, fileService, languageService, modelService, hoverService, configService, chatContextService, browserViewService, themeService) {
    super();
    this.widgetRef = widgetRef;
    this.isAttachmentAlreadyAttached = isAttachmentAlreadyAttached;
    this.attachment = attachment;
    this.resourceLabels = resourceLabels;
    this.attachmentModel = attachmentModel;
    this.domNode = domNode;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.labelService = labelService;
    this.menuService = menuService;
    this.fileService = fileService;
    this.languageService = languageService;
    this.modelService = modelService;
    this.hoverService = hoverService;
    this.configService = configService;
    this.chatContextService = chatContextService;
    this.browserViewService = browserViewService;
    this.themeService = themeService;
    this.renderDisposables = this._register(new DisposableStore());
    this.renderedCount = 0;
    this.render();
    this._register(this.themeService.onDidColorThemeChange(() => {
      if (this._hasDualPathIcon()) {
        this.render();
      }
    }));
  }
  _hasDualPathIcon() {
    return this.attachment.values.some((context) => {
      const iconPath = context.iconPath;
      return !!iconPath && !ThemeIcon.isThemeIcon(iconPath) && !URI.isUri(iconPath);
    });
  }
  render() {
    this.renderDisposables.clear();
    this.renderedCount = 0;
    for (const context of this.attachment.values) {
      const targetUri = context.uri;
      const targetRange = isLocation(context.value) ? context.value.range : void 0;
      const targetHandle = isStringImplicitContextValue(context.value) ? context.value.handle : void 0;
      const currentlyAttached = this.isAttachmentAlreadyAttached(targetUri, targetRange, targetHandle);
      if (!currentlyAttached) {
        this.renderMainContext(context, context.isSelection);
        this.renderedCount++;
      }
    }
  }
  get hasRenderedContexts() {
    return this.renderedCount > 0;
  }
  renderMainContext(context, isSelection) {
    const contextNode = dom.$(".chat-attached-context-attachment.show-file-icons.implicit");
    this.domNode.appendChild(contextNode);
    contextNode.tabIndex = 0;
    contextNode.classList.toggle("disabled", !context.enabled);
    const file = context.uri;
    const attachmentTypeName = file?.scheme === Schemas.vscodeNotebookCell ? localize("cell.lowercase", "cell") : localize("file.lowercase", "file");
    const contextLabel = context.name ?? (file ? basename(file) : localize("implicitContextFallback", "context"));
    const isSuggestedEnabled = this.configService.getValue("chat.implicitContext.suggestedContext");
    if (isSuggestedEnabled) {
      if (!isSelection) {
        const buttonMsg = context.enabled ? localize("disableImplicitContext", "Disable {0} context {1}", attachmentTypeName, contextLabel) : localize("addToContext", "Add {0} to context", contextLabel);
        const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
        toggleButton.icon = context.enabled ? Codicon.closeCompact : Codicon.addCompact;
        this.renderDisposables.add(toggleButton.onDidClick(async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!context.enabled) {
            await this.convertToRegularAttachment(context);
          }
          context.enabled = false;
        }));
      } else {
        const pinButtonMsg = localize("pinSelection", "Pin selection");
        const pinButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: pinButtonMsg }));
        pinButton.icon = Codicon.pinned;
        this.renderDisposables.add(pinButton.onDidClick(async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await this.pinSelection();
        }));
      }
      if (!context.enabled && isSelection) {
        contextNode.classList.remove("disabled");
      }
      this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CLICK, async (e) => {
        if (!context.enabled && !isSelection) {
          await this.convertToRegularAttachment(context);
        }
      }));
      this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.KEY_DOWN, async (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
          if (!context.enabled && !isSelection) {
            e.preventDefault();
            e.stopPropagation();
            await this.convertToRegularAttachment(context);
          }
        }
      }));
    } else {
      const buttonMsg = context.enabled ? localize("disable", "Disable current {0} context", attachmentTypeName) : localize("enable", "Enable current {0} context", attachmentTypeName);
      const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
      toggleButton.icon = context.enabled ? Codicon.eye : Codicon.eyeClosed;
      this.renderDisposables.add(toggleButton.onDidClick((e) => {
        e.stopPropagation();
        context.enabled = !context.enabled;
      }));
    }
    const label = this.renderDisposables.add(this.resourceLabels.create(contextNode, { supportIcons: true }));
    let title;
    let markdownTooltip;
    if (isStringImplicitContextValue(context.value)) {
      markdownTooltip = context.value.tooltip;
      title = this.renderString(label, context.name, context.iconPath, context.value.resourceUri, markdownTooltip, localize("openFile", "Current file context"));
      contextNode.ariaLabel = localize("chat.implicitStringContext", "Suggested context, {0}", context.name);
    } else {
      title = this.renderResource(context.value, context.isSelection, context.enabled, label, contextNode);
    }
    if (markdownTooltip || title) {
      this.renderDisposables.add(this.hoverService.setupDelayedHover(contextNode, {
        content: markdownTooltip ?? title,
        appearance: { showPointer: true }
      }));
    }
    const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(contextNode));
    const resourceContextKey = this.renderDisposables.add(new ResourceContextKey(scopedContextKeyService, this.fileService, this.languageService, this.modelService));
    resourceContextKey.set(file);
    this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CONTEXT_MENU, async (domEvent) => {
      const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
      dom.EventHelper.stop(domEvent, true);
      this.contextMenuService.showContextMenu({
        contextKeyService: scopedContextKeyService,
        getAnchor: () => event,
        getActions: () => {
          const menu = this.menuService.getMenuActions(MenuId.ChatInputResourceAttachmentContext, scopedContextKeyService, { arg: file });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  renderString(resourceLabel, name, iconPath, resourceUri, markdownTooltip, defaultTitle) {
    const title = markdownTooltip ? void 0 : defaultTitle;
    if (iconPath && ThemeIcon.isThemeIcon(iconPath) && (ThemeIcon.isFile(iconPath) || ThemeIcon.isFolder(iconPath)) && resourceUri) {
      const fileKind = ThemeIcon.isFolder(iconPath) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = getIconClasses(this.modelService, this.languageService, resourceUri, fileKind);
      resourceLabel.setLabel(name, void 0, { extraClasses: iconClasses, title });
    } else {
      const resolvedIcon = iconPath ? resolveChatContextIcon(iconPath, isDark(this.themeService.getColorTheme().type)) : void 0;
      resourceLabel.setLabel(name, void 0, { iconPath: resolvedIcon, title });
    }
    return title;
  }
  renderResource(attachmentValue, isSelection, enabled, label, contextNode) {
    const file = URI.isUri(attachmentValue) ? attachmentValue : attachmentValue.uri;
    const range = URI.isUri(attachmentValue) || !isSelection ? void 0 : attachmentValue.range;
    if (file.scheme === Schemas.vscodeBrowser) {
      return this.renderBrowserResource(file, label, contextNode);
    }
    const attachmentTypeName = file.scheme === Schemas.vscodeNotebookCell ? localize("cell.lowercase", "cell") : localize("file.lowercase", "file");
    const fileBasename = basename(file);
    const fileDirname = dirname(file);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    const ariaLabel = range ? localize("chat.implicitFileContextWithRange", "Suggested context, {0}, {1}, line {2} to line {3}", attachmentTypeName, friendlyName, range.startLineNumber, range.endLineNumber) : localize("chat.implicitFileContext", "Suggested context, {0}, {1}", attachmentTypeName, friendlyName);
    const uriLabel = this.labelService.getUriLabel(file, { relative: true });
    const currentFile = localize("openEditor", "Current {0} context", attachmentTypeName);
    const inactive = localize("enableHint", "Enable current {0} context", attachmentTypeName);
    const currentFileHint = enabled || isSelection ? currentFile : inactive;
    const title = `${currentFileHint}
${uriLabel}`;
    label.setFile(file, {
      fileKind: FileKind.FILE,
      hidePath: true,
      range,
      title
    });
    contextNode.ariaLabel = ariaLabel;
    return title;
  }
  renderBrowserResource(browserUri, label, contextNode) {
    const id = BrowserViewUri.getId(browserUri);
    const input = id && this.browserViewService.getKnownBrowserViews().get(id);
    if (!input) {
      return void 0;
    }
    const update = () => {
      label.setLabel(input.getName(), void 0, { iconPath: Codicon.globe });
      contextNode.ariaLabel = localize("chat.implicitBrowserContext", "Suggested browser context, {0}", input.getName());
    };
    update();
    this.renderDisposables.add(input.onDidChangeLabel(() => update()));
    return input.getTitle();
  }
  async convertToRegularAttachment(attachment) {
    if (!attachment.value) {
      return;
    }
    if (isStringImplicitContextValue(attachment.value)) {
      if (attachment.value.value === void 0) {
        await this.chatContextService.resolveChatContext(attachment.value);
      }
      const context = {
        kind: "string",
        value: attachment.value.value,
        id: attachment.id,
        name: attachment.name,
        iconPath: attachment.value.iconPath,
        modelDescription: attachment.modelDescription,
        uri: attachment.value.uri,
        resourceUri: attachment.value.resourceUri,
        tooltip: attachment.value.tooltip,
        commandId: attachment.value.commandId,
        handle: attachment.value.handle
      };
      this.attachmentModel.addContext(context);
    } else {
      const file = URI.isUri(attachment.value) ? attachment.value : attachment.value.uri;
      if (file.scheme === Schemas.vscodeNotebookCell && isLocation(attachment.value)) {
        this.attachmentModel.addFile(file, attachment.value.range);
      } else {
        this.attachmentModel.addFile(file);
      }
    }
    this.widgetRef()?.focusInput();
  }
  async pinSelection() {
    for (const attachment of this.attachment.values) {
      if (!attachment.value || !attachment.isSelection) {
        continue;
      }
      if (!URI.isUri(attachment.value) && !isStringImplicitContextValue(attachment.value)) {
        const location = attachment.value;
        this.attachmentModel.addFile(location.uri, location.range);
      }
    }
    this.widgetRef()?.focusInput();
  }
};
ImplicitContextAttachmentWidget = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, IFileService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, IModelService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IChatContextService),
  __decorateParam(16, IBrowserViewWorkbenchService),
  __decorateParam(17, IThemeService)
], ImplicitContextAttachmentWidget);
export {
  ImplicitContextAttachmentWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxpbXBsaWNpdENvbnRleHRBdHRhY2htZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0xvY2F0aW9uLCBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRJY29uUGF0aCwgSUNoYXRSZXF1ZXN0U3RyaW5nVmFyaWFibGVFbnRyeSwgaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSwgcmVzb2x2ZUNoYXRDb250ZXh0SWNvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRNb2RlbCB9IGZyb20gJy4vY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29udGV4dENvbnRyaWIvY2hhdENvbnRleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbXBsaWNpdENvbnRleHQsIENoYXRJbXBsaWNpdENvbnRleHRzIH0gZnJvbSAnLi9jaGF0SW1wbGljaXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3VXJpLmpzJztcblxuZXhwb3J0IGNsYXNzIEltcGxpY2l0Q29udGV4dEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZW5kZXJlZENvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldFJlZjogKCkgPT4gSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc0F0dGFjaG1lbnRBbHJlYWR5QXR0YWNoZWQ6ICh0YXJnZXRVcmk6IFVSSSB8IHVuZGVmaW5lZCwgdGFyZ2V0UmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgdGFyZ2V0SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhdHRhY2htZW50OiBDaGF0SW1wbGljaXRDb250ZXh0cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF0dGFjaG1lbnRNb2RlbDogQ2hhdEF0dGFjaG1lbnRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0Q29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0Q29udGV4dFNlcnZpY2U6IElDaGF0Q29udGV4dFNlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1NlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXG5cdFx0Ly8gQSBsaWdodC9kYXJrIGljb24gbXVzdCBiZSByZWFwcGxpZWQgd2hlbiB0aGUgY29sb3IgdGhlbWUgY2hhbmdlcyBzbyB0aGUgY29ycmVjdCB1cmkgaXMgdXNlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faGFzRHVhbFBhdGhJY29uKCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNEdWFsUGF0aEljb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0YWNobWVudC52YWx1ZXMuc29tZShjb250ZXh0ID0+IHtcblx0XHRcdGNvbnN0IGljb25QYXRoID0gY29udGV4dC5pY29uUGF0aDtcblx0XHRcdHJldHVybiAhIWljb25QYXRoICYmICFUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmICFVUkkuaXNVcmkoaWNvblBhdGgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKSB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMucmVuZGVyZWRDb3VudCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRleHQgb2YgdGhpcy5hdHRhY2htZW50LnZhbHVlcykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0VXJpOiBVUkkgfCB1bmRlZmluZWQgPSBjb250ZXh0LnVyaTtcblx0XHRcdGNvbnN0IHRhcmdldFJhbmdlID0gaXNMb2NhdGlvbihjb250ZXh0LnZhbHVlKSA/IGNvbnRleHQudmFsdWUucmFuZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0YXJnZXRIYW5kbGUgPSBpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKGNvbnRleHQudmFsdWUpID8gY29udGV4dC52YWx1ZS5oYW5kbGUgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjdXJyZW50bHlBdHRhY2hlZCA9IHRoaXMuaXNBdHRhY2htZW50QWxyZWFkeUF0dGFjaGVkKHRhcmdldFVyaSwgdGFyZ2V0UmFuZ2UsIHRhcmdldEhhbmRsZSk7XG5cdFx0XHRpZiAoIWN1cnJlbnRseUF0dGFjaGVkKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFpbkNvbnRleHQoY29udGV4dCwgY29udGV4dC5pc1NlbGVjdGlvbik7XG5cdFx0XHRcdHRoaXMucmVuZGVyZWRDb3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNSZW5kZXJlZENvbnRleHRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlcmVkQ291bnQgPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYWluQ29udGV4dChjb250ZXh0OiBDaGF0SW1wbGljaXRDb250ZXh0LCBpc1NlbGVjdGlvbj86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjb250ZXh0Tm9kZSA9IGRvbS4kKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQuc2hvdy1maWxlLWljb25zLmltcGxpY2l0Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGNvbnRleHROb2RlKTtcblx0XHRjb250ZXh0Tm9kZS50YWJJbmRleCA9IDA7XG5cblx0XHRjb250ZXh0Tm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjb250ZXh0LmVuYWJsZWQpO1xuXHRcdGNvbnN0IGZpbGU6IFVSSSB8IHVuZGVmaW5lZCA9IGNvbnRleHQudXJpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRUeXBlTmFtZSA9IGZpbGU/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgPyBsb2NhbGl6ZSgnY2VsbC5sb3dlcmNhc2UnLCBcImNlbGxcIikgOiBsb2NhbGl6ZSgnZmlsZS5sb3dlcmNhc2UnLCBcImZpbGVcIik7XG5cdFx0Y29uc3QgY29udGV4dExhYmVsID0gY29udGV4dC5uYW1lID8/IChmaWxlID8gYmFzZW5hbWUoZmlsZSkgOiBsb2NhbGl6ZSgnaW1wbGljaXRDb250ZXh0RmFsbGJhY2snLCBcImNvbnRleHRcIikpO1xuXG5cdFx0Y29uc3QgaXNTdWdnZXN0ZWRFbmFibGVkID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgdG9nZ2xlIGJ1dHRvbiBCRUZPUkUgdGhlIGxhYmVsIHNvIGl0IGFwcGVhcnMgb24gdGhlIGxlZnRcblx0XHRpZiAoaXNTdWdnZXN0ZWRFbmFibGVkKSB7XG5cdFx0XHRpZiAoIWlzU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbk1zZyA9IGNvbnRleHQuZW5hYmxlZFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Rpc2FibGVJbXBsaWNpdENvbnRleHQnLCBcIkRpc2FibGUgezB9IGNvbnRleHQgezF9XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSwgY29udGV4dExhYmVsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FkZFRvQ29udGV4dCcsIFwiQWRkIHswfSB0byBjb250ZXh0XCIsIGNvbnRleHRMYWJlbCk7XG5cdFx0XHRcdGNvbnN0IHRvZ2dsZUJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udGV4dE5vZGUsIHsgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogYnV0dG9uTXNnIH0pKTtcblx0XHRcdFx0dG9nZ2xlQnV0dG9uLmljb24gPSBjb250ZXh0LmVuYWJsZWQgPyBDb2RpY29uLmNsb3NlQ29tcGFjdCA6IENvZGljb24uYWRkQ29tcGFjdDtcblx0XHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodG9nZ2xlQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRpZiAoIWNvbnRleHQuZW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb252ZXJ0VG9SZWd1bGFyQXR0YWNobWVudChjb250ZXh0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGV4dC5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBpbkJ1dHRvbk1zZyA9IGxvY2FsaXplKCdwaW5TZWxlY3Rpb24nLCBcIlBpbiBzZWxlY3Rpb25cIik7XG5cdFx0XHRcdGNvbnN0IHBpbkJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udGV4dE5vZGUsIHsgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogcGluQnV0dG9uTXNnIH0pKTtcblx0XHRcdFx0cGluQnV0dG9uLmljb24gPSBDb2RpY29uLnBpbm5lZDtcblx0XHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQocGluQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBpblNlbGVjdGlvbigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY29udGV4dC5lbmFibGVkICYmIGlzU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRleHROb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGV4dE5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGlmICghY29udGV4dC5lbmFibGVkICYmICFpc1NlbGVjdGlvbikge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29udmVydFRvUmVndWxhckF0dGFjaG1lbnQoY29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250ZXh0Tm9kZSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRcdGlmICghY29udGV4dC5lbmFibGVkICYmICFpc1NlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29udmVydFRvUmVndWxhckF0dGFjaG1lbnQoY29udGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGJ1dHRvbk1zZyA9IGNvbnRleHQuZW5hYmxlZCA/IGxvY2FsaXplKCdkaXNhYmxlJywgXCJEaXNhYmxlIGN1cnJlbnQgezB9IGNvbnRleHRcIiwgYXR0YWNobWVudFR5cGVOYW1lKSA6IGxvY2FsaXplKCdlbmFibGUnLCBcIkVuYWJsZSBjdXJyZW50IHswfSBjb250ZXh0XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSk7XG5cdFx0XHRjb25zdCB0b2dnbGVCdXR0b24gPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGNvbnRleHROb2RlLCB7IHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IGJ1dHRvbk1zZyB9KSk7XG5cdFx0XHR0b2dnbGVCdXR0b24uaWNvbiA9IGNvbnRleHQuZW5hYmxlZCA/IENvZGljb24uZXllIDogQ29kaWNvbi5leWVDbG9zZWQ7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0b2dnbGVCdXR0b24ub25EaWRDbGljaygoZSkgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpOyAvLyBwcmV2ZW50IGl0IGZyb20gdHJpZ2dlcmluZyB0aGUgY2xpY2sgaGFuZGxlciBvbiB0aGUgcGFyZW50IGltbWVkaWF0ZWx5IGFmdGVyIHJlcmVuZGVyaW5nXG5cdFx0XHRcdGNvbnRleHQuZW5hYmxlZCA9ICFjb250ZXh0LmVuYWJsZWQ7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlc291cmNlTGFiZWxzLmNyZWF0ZShjb250ZXh0Tm9kZSwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXG5cdFx0bGV0IHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG1hcmtkb3duVG9vbHRpcDogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKGNvbnRleHQudmFsdWUpKSB7XG5cdFx0XHRtYXJrZG93blRvb2x0aXAgPSBjb250ZXh0LnZhbHVlLnRvb2x0aXA7XG5cdFx0XHR0aXRsZSA9IHRoaXMucmVuZGVyU3RyaW5nKGxhYmVsLCBjb250ZXh0Lm5hbWUsIGNvbnRleHQuaWNvblBhdGgsIGNvbnRleHQudmFsdWUucmVzb3VyY2VVcmksIG1hcmtkb3duVG9vbHRpcCwgbG9jYWxpemUoJ29wZW5GaWxlJywgXCJDdXJyZW50IGZpbGUgY29udGV4dFwiKSk7XG5cdFx0XHRjb250ZXh0Tm9kZS5hcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdFN0cmluZ0NvbnRleHQnLCBcIlN1Z2dlc3RlZCBjb250ZXh0LCB7MH1cIiwgY29udGV4dC5uYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGl0bGUgPSB0aGlzLnJlbmRlclJlc291cmNlKGNvbnRleHQudmFsdWUsIGNvbnRleHQuaXNTZWxlY3Rpb24sIGNvbnRleHQuZW5hYmxlZCwgbGFiZWwsIGNvbnRleHROb2RlKTtcblx0XHR9XG5cblx0XHRpZiAobWFya2Rvd25Ub29sdGlwIHx8IHRpdGxlKSB7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihjb250ZXh0Tm9kZSwge1xuXHRcdFx0XHRjb250ZW50OiBtYXJrZG93blRvb2x0aXAhID8/IHRpdGxlISxcblx0XHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9LFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHQgbWVudVxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGV4dE5vZGUpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlQ29udGV4dEtleSA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBSZXNvdXJjZUNvbnRleHRLZXkoc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLm1vZGVsU2VydmljZSkpO1xuXHRcdHJlc291cmNlQ29udGV4dEtleS5zZXQoZmlsZSk7XG5cblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRleHROb2RlLCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgZG9tRXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZG9tRXZlbnQpLCBkb21FdmVudCk7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChkb21FdmVudCwgdHJ1ZSk7XG5cblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBzY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5DaGF0SW5wdXRSZXNvdXJjZUF0dGFjaG1lbnRDb250ZXh0LCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGZpbGUgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN0cmluZyhyZXNvdXJjZUxhYmVsOiBJUmVzb3VyY2VMYWJlbCwgbmFtZTogc3RyaW5nLCBpY29uUGF0aDogQ2hhdENvbnRleHRJY29uUGF0aCB8IHVuZGVmaW5lZCwgcmVzb3VyY2VVcmk6IFVSSSB8IHVuZGVmaW5lZCwgbWFya2Rvd25Ub29sdGlwOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIGRlZmF1bHRUaXRsZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBEb24ndCBzZXQgdGl0bGUgaWYgd2UgaGF2ZSBhIG1hcmtkb3duIHRvb2x0aXAgLSB0aGUgaG92ZXIgc2VydmljZSB3aWxsIGhhbmRsZSBpdFxuXHRcdGNvbnN0IHRpdGxlID0gbWFya2Rvd25Ub29sdGlwID8gdW5kZWZpbmVkIDogZGVmYXVsdFRpdGxlO1xuXG5cdFx0Ly8gRGVyaXZlIGljb24gY2xhc3NlcyBmcm9tIHJlc291cmNlVXJpIGZvciBmaWxlL2ZvbGRlciB0aGVtZSBpY29uc1xuXHRcdGlmIChpY29uUGF0aCAmJiBUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmIChUaGVtZUljb24uaXNGaWxlKGljb25QYXRoKSB8fCBUaGVtZUljb24uaXNGb2xkZXIoaWNvblBhdGgpKSAmJiByZXNvdXJjZVVyaSkge1xuXHRcdFx0Y29uc3QgZmlsZUtpbmQgPSBUaGVtZUljb24uaXNGb2xkZXIoaWNvblBhdGgpID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblx0XHRcdGNvbnN0IGljb25DbGFzc2VzID0gZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCByZXNvdXJjZVVyaSwgZmlsZUtpbmQpO1xuXHRcdFx0cmVzb3VyY2VMYWJlbC5zZXRMYWJlbChuYW1lLCB1bmRlZmluZWQsIHsgZXh0cmFDbGFzc2VzOiBpY29uQ2xhc3NlcywgdGl0bGUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkSWNvbiA9IGljb25QYXRoID8gcmVzb2x2ZUNoYXRDb250ZXh0SWNvbihpY29uUGF0aCwgaXNEYXJrKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXNvdXJjZUxhYmVsLnNldExhYmVsKG5hbWUsIHVuZGVmaW5lZCwgeyBpY29uUGF0aDogcmVzb2x2ZWRJY29uLCB0aXRsZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZXNvdXJjZShhdHRhY2htZW50VmFsdWU6IExvY2F0aW9uIHwgVVJJIHwgdW5kZWZpbmVkLCBpc1NlbGVjdGlvbjogYm9vbGVhbiwgZW5hYmxlZDogYm9vbGVhbiwgbGFiZWw6IElSZXNvdXJjZUxhYmVsLCBjb250ZXh0Tm9kZTogSFRNTEVsZW1lbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZpbGUgPSBVUkkuaXNVcmkoYXR0YWNobWVudFZhbHVlKSA/IGF0dGFjaG1lbnRWYWx1ZSA6IGF0dGFjaG1lbnRWYWx1ZSEudXJpO1xuXHRcdGNvbnN0IHJhbmdlID0gVVJJLmlzVXJpKGF0dGFjaG1lbnRWYWx1ZSkgfHwgIWlzU2VsZWN0aW9uID8gdW5kZWZpbmVkIDogYXR0YWNobWVudFZhbHVlIS5yYW5nZTtcblxuXHRcdGlmIChmaWxlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJCcm93c2VyUmVzb3VyY2UoZmlsZSwgbGFiZWwsIGNvbnRleHROb2RlKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRhY2htZW50VHlwZU5hbWUgPSBmaWxlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgPyBsb2NhbGl6ZSgnY2VsbC5sb3dlcmNhc2UnLCBcImNlbGxcIikgOiBsb2NhbGl6ZSgnZmlsZS5sb3dlcmNhc2UnLCBcImZpbGVcIik7XG5cblx0XHRjb25zdCBmaWxlQmFzZW5hbWUgPSBiYXNlbmFtZShmaWxlKTtcblx0XHRjb25zdCBmaWxlRGlybmFtZSA9IGRpcm5hbWUoZmlsZSk7XG5cdFx0Y29uc3QgZnJpZW5kbHlOYW1lID0gYCR7ZmlsZUJhc2VuYW1lfSAke2ZpbGVEaXJuYW1lfWA7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gcmFuZ2Vcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuaW1wbGljaXRGaWxlQ29udGV4dFdpdGhSYW5nZScsIFwiU3VnZ2VzdGVkIGNvbnRleHQsIHswfSwgezF9LCBsaW5lIHsyfSB0byBsaW5lIHszfVwiLCBhdHRhY2htZW50VHlwZU5hbWUsIGZyaWVuZGx5TmFtZSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdEZpbGVDb250ZXh0JywgXCJTdWdnZXN0ZWQgY29udGV4dCwgezB9LCB7MX1cIiwgYXR0YWNobWVudFR5cGVOYW1lLCBmcmllbmRseU5hbWUpO1xuXG5cdFx0Y29uc3QgdXJpTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaWxlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGN1cnJlbnRGaWxlID0gbG9jYWxpemUoJ29wZW5FZGl0b3InLCBcIkN1cnJlbnQgezB9IGNvbnRleHRcIiwgYXR0YWNobWVudFR5cGVOYW1lKTtcblx0XHRjb25zdCBpbmFjdGl2ZSA9IGxvY2FsaXplKCdlbmFibGVIaW50JywgXCJFbmFibGUgY3VycmVudCB7MH0gY29udGV4dFwiLCBhdHRhY2htZW50VHlwZU5hbWUpO1xuXHRcdGNvbnN0IGN1cnJlbnRGaWxlSGludCA9IGVuYWJsZWQgfHwgaXNTZWxlY3Rpb24gPyBjdXJyZW50RmlsZSA6IGluYWN0aXZlO1xuXHRcdGNvbnN0IHRpdGxlID0gYCR7Y3VycmVudEZpbGVIaW50fVxcbiR7dXJpTGFiZWx9YDtcblxuXHRcdGxhYmVsLnNldEZpbGUoZmlsZSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHRcdHJhbmdlLFxuXHRcdFx0dGl0bGVcblx0XHR9KTtcblx0XHRjb250ZXh0Tm9kZS5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJyb3dzZXJSZXNvdXJjZShicm93c2VyVXJpOiBVUkksIGxhYmVsOiBJUmVzb3VyY2VMYWJlbCwgY29udGV4dE5vZGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpZCA9IEJyb3dzZXJWaWV3VXJpLmdldElkKGJyb3dzZXJVcmkpO1xuXHRcdGNvbnN0IGlucHV0ID0gaWQgJiYgdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZ2V0S25vd25Ccm93c2VyVmlld3MoKS5nZXQoaWQpO1xuXHRcdGlmICghaW5wdXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0bGFiZWwuc2V0TGFiZWwoaW5wdXQuZ2V0TmFtZSgpLCB1bmRlZmluZWQsIHsgaWNvblBhdGg6IENvZGljb24uZ2xvYmUgfSk7XG5cdFx0XHRjb250ZXh0Tm9kZS5hcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdEJyb3dzZXJDb250ZXh0JywgXCJTdWdnZXN0ZWQgYnJvd3NlciBjb250ZXh0LCB7MH1cIiwgaW5wdXQuZ2V0TmFtZSgpKTtcblx0XHR9O1xuXHRcdHVwZGF0ZSgpO1xuXG5cdFx0Ly8gS2VlcCBsYWJlbCBpbiBzeW5jIGFzIHRoZSB1c2VyIG5hdmlnYXRlc1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlTGFiZWwoKCkgPT4gdXBkYXRlKCkpKTtcblxuXHRcdHJldHVybiBpbnB1dC5nZXRUaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb252ZXJ0VG9SZWd1bGFyQXR0YWNobWVudChhdHRhY2htZW50OiBDaGF0SW1wbGljaXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhdHRhY2htZW50LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKGF0dGFjaG1lbnQudmFsdWUpKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC52YWx1ZS52YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hhdENvbnRleHRTZXJ2aWNlLnJlc29sdmVDaGF0Q29udGV4dChhdHRhY2htZW50LnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElDaGF0UmVxdWVzdFN0cmluZ1ZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdHJpbmcnLFxuXHRcdFx0XHR2YWx1ZTogYXR0YWNobWVudC52YWx1ZS52YWx1ZSxcblx0XHRcdFx0aWQ6IGF0dGFjaG1lbnQuaWQsXG5cdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubmFtZSxcblx0XHRcdFx0aWNvblBhdGg6IGF0dGFjaG1lbnQudmFsdWUuaWNvblBhdGgsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246IGF0dGFjaG1lbnQubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0dXJpOiBhdHRhY2htZW50LnZhbHVlLnVyaSxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGF0dGFjaG1lbnQudmFsdWUucmVzb3VyY2VVcmksXG5cdFx0XHRcdHRvb2x0aXA6IGF0dGFjaG1lbnQudmFsdWUudG9vbHRpcCxcblx0XHRcdFx0Y29tbWFuZElkOiBhdHRhY2htZW50LnZhbHVlLmNvbW1hbmRJZCxcblx0XHRcdFx0aGFuZGxlOiBhdHRhY2htZW50LnZhbHVlLmhhbmRsZVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY29udGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGZpbGUgPSBVUkkuaXNVcmkoYXR0YWNobWVudC52YWx1ZSkgPyBhdHRhY2htZW50LnZhbHVlIDogYXR0YWNobWVudC52YWx1ZS51cmk7XG5cdFx0XHRpZiAoZmlsZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsICYmIGlzTG9jYXRpb24oYXR0YWNobWVudC52YWx1ZSkpIHtcblx0XHRcdFx0dGhpcy5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShmaWxlLCBhdHRhY2htZW50LnZhbHVlLnJhbmdlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoZmlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMud2lkZ2V0UmVmKCk/LmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGluU2VsZWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgYXR0YWNobWVudCBvZiB0aGlzLmF0dGFjaG1lbnQudmFsdWVzKSB7XG5cdFx0XHRpZiAoIWF0dGFjaG1lbnQudmFsdWUgfHwgIWF0dGFjaG1lbnQuaXNTZWxlY3Rpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghVVJJLmlzVXJpKGF0dGFjaG1lbnQudmFsdWUpICYmICFpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKGF0dGFjaG1lbnQudmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gYXR0YWNobWVudC52YWx1ZTtcblx0XHRcdFx0dGhpcy5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShsb2NhdGlvbi51cmksIGxvY2F0aW9uLnJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy53aWRnZXRSZWYoKT8uZm9jdXNJbnB1dCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUErRCw4QkFBOEIsOEJBQThCO0FBQzNILFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYztBQUd2QixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHNCQUFzQjtBQUV4QixJQUFNLGtDQUFOLGNBQThDLFdBQVc7QUFBQSxFQUsvRCxZQUNrQixXQUNBLDZCQUNBLFlBQ0EsZ0JBQ0EsaUJBQ0EsU0FDb0IsbUJBQ0Msb0JBQ04sY0FDRCxhQUNBLGFBQ0ksaUJBQ0gsY0FDQSxjQUNRLGVBQ0Ysb0JBQ1Msb0JBQ2YsY0FDL0I7QUFDRCxVQUFNO0FBbkJXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNvQjtBQUNDO0FBQ047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
