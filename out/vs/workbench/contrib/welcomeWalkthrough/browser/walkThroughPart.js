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
import "../common/walkThroughUtils.js";
import "./media/walkThroughPart.css";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import * as strings from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { dispose, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { WalkThroughInput } from "./walkThroughInput.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { localize } from "../../../../nls.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { RawContextKey, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isObject } from "../../../../base/common/types.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { OS, OperatingSystem } from "../../../../base/common/platform.js";
import { deepClone } from "../../../../base/common/objects.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { addDisposableListener, isHTMLAnchorElement, isHTMLButtonElement, isHTMLElement, size } from "../../../../base/browser/dom.js";
import * as domSanitize from "../../../../base/browser/domSanitize.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
const WALK_THROUGH_FOCUS = new RawContextKey("interactivePlaygroundFocus", false);
const UNBOUND_COMMAND = localize("walkThrough.unboundCommand", "unbound");
const WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY = "walkThroughEditorViewState";
let WalkThroughPart = class extends EditorPane {
  constructor(group, telemetryService, themeService, textResourceConfigurationService, instantiationService, openerService, keybindingService, storageService, contextKeyService, configurationService, notificationService, extensionService, editorGroupService) {
    super(WalkThroughPart.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.keybindingService = keybindingService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.disposables = new DisposableStore();
    this.contentDisposables = [];
    this.editorFocus = WALK_THROUGH_FOCUS.bindTo(this.contextKeyService);
    this.editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY);
  }
  createEditor(container) {
    this.content = document.createElement("div");
    this.content.classList.add("welcomePageFocusElement");
    this.content.tabIndex = 0;
    this.content.style.outlineStyle = "none";
    this.scrollbar = new DomScrollableElement(this.content, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Auto
    });
    this.disposables.add(this.scrollbar);
    container.appendChild(this.scrollbar.getDomNode());
    this.registerFocusHandlers();
    this.registerClickHandler();
    this.disposables.add(this.scrollbar.onScroll((e) => this.updatedScrollPosition()));
  }
  updatedScrollPosition() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    const scrollHeight = scrollDimensions.scrollHeight;
    if (scrollHeight && this.input instanceof WalkThroughInput) {
      const scrollTop = scrollPosition.scrollTop;
      const height = scrollDimensions.height;
      this.input.relativeScrollPosition(scrollTop / scrollHeight, (scrollTop + height) / scrollHeight);
    }
  }
  onTouchChange(event) {
    event.preventDefault();
    event.stopPropagation();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - event.translationY });
  }
  addEventListener(element, type, listener, useCapture) {
    element.addEventListener(type, listener, useCapture);
    return toDisposable(() => {
      element.removeEventListener(type, listener, useCapture);
    });
  }
  registerFocusHandlers() {
    this.disposables.add(this.addEventListener(this.content, "mousedown", (e) => {
      this.focus();
    }));
    this.disposables.add(this.addEventListener(this.content, "focus", (e) => {
      this.editorFocus.set(true);
    }));
    this.disposables.add(this.addEventListener(this.content, "blur", (e) => {
      this.editorFocus.reset();
    }));
    this.disposables.add(this.addEventListener(this.content, "focusin", (e) => {
      if (isHTMLElement(e.target) && e.target.classList.contains("zone-widget-container")) {
        const scrollPosition = this.scrollbar.getScrollPosition();
        this.content.scrollTop = scrollPosition.scrollTop;
        this.content.scrollLeft = scrollPosition.scrollLeft;
      }
      if (isHTMLElement(e.target)) {
        this.lastFocus = e.target;
      }
    }));
  }
  registerClickHandler() {
    this.disposables.add(this.addEventListener(this.content, "click", (event) => {
      for (let node = event.target; node; node = node.parentNode) {
        if (isHTMLAnchorElement(node) && node.href) {
          const baseElement = node.ownerDocument.getElementsByTagName("base")[0] || this.window.location;
          if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {
            const scrollTarget = this.content.querySelector(node.hash);
            const innerContent = this.content.firstElementChild;
            if (scrollTarget && innerContent) {
              const targetTop = scrollTarget.getBoundingClientRect().top - 20;
              const containerTop = innerContent.getBoundingClientRect().top;
              this.scrollbar.setScrollPosition({ scrollTop: targetTop - containerTop });
            }
          } else {
            this.open(URI.parse(node.href));
          }
          event.preventDefault();
          break;
        } else if (isHTMLButtonElement(node)) {
          const href = node.getAttribute("data-href");
          if (href) {
            this.open(URI.parse(href));
          }
          break;
        } else if (node === event.currentTarget) {
          break;
        }
      }
    }));
  }
  open(uri) {
    if (uri.scheme === "command" && uri.path === "git.clone" && !CommandsRegistry.getCommand("git.clone")) {
      this.notificationService.info(localize("walkThrough.gitNotFound", "It looks like Git is not installed on your system."));
      return;
    }
    this.openerService.open(this.addFrom(uri), { allowCommands: true });
  }
  addFrom(uri) {
    if (uri.scheme !== "command" || !(this.input instanceof WalkThroughInput)) {
      return uri;
    }
    const query = uri.query ? JSON.parse(uri.query) : {};
    query.from = this.input.getTelemetryFrom();
    return uri.with({ query: JSON.stringify(query) });
  }
  layout(dimension) {
    this.size = dimension;
    size(this.content, dimension.width, dimension.height);
    this.updateSizeClasses();
    this.contentDisposables.forEach((disposable) => {
      if (disposable instanceof CodeEditorWidget) {
        disposable.layout();
      }
    });
    const walkthroughInput = this.input instanceof WalkThroughInput && this.input;
    if (walkthroughInput && walkthroughInput.layout) {
      walkthroughInput.layout(dimension);
    }
    this.scrollbar.scanDomNode();
  }
  updateSizeClasses() {
    const innerContent = this.content.firstElementChild;
    if (this.size && innerContent) {
      innerContent.classList.toggle("max-height-685px", this.size.height <= 685);
    }
  }
  focus() {
    super.focus();
    let active = this.content.ownerDocument.activeElement;
    while (active && active !== this.content) {
      active = active.parentElement;
    }
    if (!active) {
      (this.lastFocus || this.content).focus();
    }
    this.editorFocus.set(true);
  }
  arrowUp() {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - this.getArrowScrollHeight() });
  }
  arrowDown() {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + this.getArrowScrollHeight() });
  }
  getArrowScrollHeight() {
    let fontSize = this.configurationService.getValue("editor.fontSize");
    if (typeof fontSize !== "number" || fontSize < 1) {
      fontSize = 12;
    }
    return 3 * fontSize;
  }
  pageUp() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - scrollDimensions.height });
  }
  pageDown() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + scrollDimensions.height });
  }
  setInput(input, options, context, token) {
    const store = new DisposableStore();
    this.contentDisposables.push(store);
    this.content.innerText = "";
    return super.setInput(input, options, context, token).then(async () => {
      if (input.resource.path.endsWith(".md")) {
        await this.extensionService.whenInstalledExtensionsRegistered();
      }
      return input.resolve();
    }).then((model) => {
      if (token.isCancellationRequested) {
        return;
      }
      const content = model.main;
      if (!input.resource.path.endsWith(".md")) {
        this.safeSetInnerHtml(this.content, content);
        this.updateSizeClasses();
        this.decorateContent();
        this.contentDisposables.push(this.keybindingService.onDidUpdateKeybindings(() => this.decorateContent()));
        input.onReady?.(this.content.firstElementChild, store);
        this.scrollbar.scanDomNode();
        this.loadTextEditorViewState(input);
        this.updatedScrollPosition();
        return;
      }
      const innerContent = document.createElement("div");
      innerContent.classList.add("walkThroughContent");
      const markdown = this.expandMacros(content);
      this.safeSetInnerHtml(innerContent, markdown);
      this.content.appendChild(innerContent);
      model.snippets.forEach((snippet, i) => {
        const model2 = snippet.textEditorModel;
        if (!model2) {
          return;
        }
        const id = `snippet-${model2.uri.fragment}`;
        const div = innerContent.querySelector(`#${id.replace(/[\\.]/g, "\\$&")}`);
        const options2 = this.getEditorOptions(model2.getLanguageId());
        const telemetryData = {
          target: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : void 0,
          snippet: i
        };
        const editor = this.instantiationService.createInstance(CodeEditorWidget, div, options2, {
          telemetryData
        });
        editor.setModel(model2);
        this.contentDisposables.push(editor);
        const updateHeight = (initial) => {
          const position = editor.getPosition();
          const lineHeight = position ? editor.getLineHeightForPosition(position) : editor.getOption(EditorOption.lineHeight);
          const height = `${Math.max(model2.getLineCount() + 1, 4) * lineHeight}px`;
          if (div.style.height !== height) {
            div.style.height = height;
            editor.layout();
            if (!initial) {
              this.scrollbar.scanDomNode();
            }
          }
        };
        updateHeight(true);
        this.contentDisposables.push(editor.onDidChangeModelContent(() => updateHeight(false)));
        this.contentDisposables.push(editor.onDidChangeCursorPosition((e) => {
          const innerContent2 = this.content.firstElementChild;
          if (innerContent2) {
            const targetTop = div.getBoundingClientRect().top;
            const containerTop = innerContent2.getBoundingClientRect().top;
            const lineHeight = editor.getLineHeightForPosition(e.position);
            const lineTop = targetTop + (e.position.lineNumber - 1) * lineHeight - containerTop;
            const lineBottom = lineTop + lineHeight;
            const scrollDimensions = this.scrollbar.getScrollDimensions();
            const scrollPosition = this.scrollbar.getScrollPosition();
            const scrollTop = scrollPosition.scrollTop;
            const height = scrollDimensions.height;
            if (scrollTop > lineTop) {
              this.scrollbar.setScrollPosition({ scrollTop: lineTop });
            } else if (scrollTop < lineBottom - height) {
              this.scrollbar.setScrollPosition({ scrollTop: lineBottom - height });
            }
          }
        }));
        this.contentDisposables.push(this.configurationService.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration("editor") && snippet.textEditorModel) {
            editor.updateOptions(this.getEditorOptions(snippet.textEditorModel.getLanguageId()));
          }
        }));
      });
      this.updateSizeClasses();
      this.multiCursorModifier();
      this.contentDisposables.push(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("editor.multiCursorModifier")) {
          this.multiCursorModifier();
        }
      }));
      input.onReady?.(innerContent, store);
      this.scrollbar.scanDomNode();
      this.loadTextEditorViewState(input);
      this.updatedScrollPosition();
      this.contentDisposables.push(Gesture.addTarget(innerContent));
      this.contentDisposables.push(addDisposableListener(innerContent, TouchEventType.Change, (e) => this.onTouchChange(e)));
    });
  }
  safeSetInnerHtml(node, content) {
    domSanitize.safeSetInnerHtml(node, content, {
      allowedAttributes: {
        augment: [
          "id",
          "class",
          "style",
          "data-command",
          "data-href"
        ]
      }
    });
  }
  getEditorOptions(language) {
    const config = deepClone(this.configurationService.getValue("editor", { overrideIdentifier: language }));
    return {
      ...isObject(config) ? config : /* @__PURE__ */ Object.create(null),
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false
      },
      overviewRulerLanes: 3,
      fixedOverflowWidgets: false,
      lineNumbersMinChars: 1,
      minimap: { enabled: false }
    };
  }
  expandMacros(input) {
    return input.replace(/kb\(([a-z.\d\-]+)\)/gi, (match, kb) => {
      const keybinding = this.keybindingService.lookupKeybinding(kb);
      const shortcut = keybinding ? keybinding.getLabel() || "" : UNBOUND_COMMAND;
      return `<span class="shortcut">${strings.escape(shortcut)}</span>`;
    });
  }
  decorateContent() {
    const keys = this.content.querySelectorAll(".shortcut[data-command]");
    Array.prototype.forEach.call(keys, (key) => {
      const command = key.getAttribute("data-command");
      const keybinding = command && this.keybindingService.lookupKeybinding(command);
      const label = keybinding ? keybinding.getLabel() || "" : UNBOUND_COMMAND;
      while (key.firstChild) {
        key.firstChild.remove();
      }
      key.appendChild(document.createTextNode(label));
    });
    const ifkeys = this.content.querySelectorAll(".if_shortcut[data-command]");
    Array.prototype.forEach.call(ifkeys, (key) => {
      const command = key.getAttribute("data-command");
      const keybinding = command && this.keybindingService.lookupKeybinding(command);
      key.style.display = !keybinding ? "none" : "";
    });
  }
  multiCursorModifier() {
    const labels = UILabelProvider.modifierLabels[OS];
    const value = this.configurationService.getValue("editor.multiCursorModifier");
    const modifier = labels[value === "ctrlCmd" ? OS === OperatingSystem.Macintosh ? "metaKey" : "ctrlKey" : "altKey"];
    const keys = this.content.querySelectorAll(".multi-cursor-modifier");
    Array.prototype.forEach.call(keys, (key) => {
      while (key.firstChild) {
        key.firstChild.remove();
      }
      key.appendChild(document.createTextNode(modifier));
    });
  }
  saveTextEditorViewState(input) {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.editorMemento.saveEditorState(this.group, input, {
      viewState: {
        scrollTop: scrollPosition.scrollTop,
        scrollLeft: scrollPosition.scrollLeft
      }
    });
  }
  loadTextEditorViewState(input) {
    const state = this.editorMemento.loadEditorState(this.group, input);
    if (state) {
      this.scrollbar.setScrollPosition(state.viewState);
    }
  }
  clearInput() {
    if (this.input instanceof WalkThroughInput) {
      this.saveTextEditorViewState(this.input);
    }
    this.contentDisposables = dispose(this.contentDisposables);
    super.clearInput();
  }
  saveState() {
    if (this.input instanceof WalkThroughInput) {
      this.saveTextEditorViewState(this.input);
    }
    super.saveState();
  }
  dispose() {
    this.editorFocus.reset();
    this.contentDisposables = dispose(this.contentDisposables);
    this.disposables.dispose();
    super.dispose();
  }
};
WalkThroughPart.ID = "workbench.editor.walkThroughPart";
WalkThroughPart = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ITextResourceConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IExtensionService),
  __decorateParam(12, IEditorGroupsService)
], WalkThroughPart);
export {
  WALK_THROUGH_FOCUS,
  WalkThroughPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVXYWxrdGhyb3VnaFxcYnJvd3Nlclxcd2Fsa1Rocm91Z2hQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi9jb21tb24vd2Fsa1Rocm91Z2hVdGlscy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvd2Fsa1Rocm91Z2hQYXJ0LmNzcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlRXZlbnQsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1lbWVudG8sIElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBXYWxrVGhyb3VnaElucHV0IH0gZnJvbSAnLi93YWxrVGhyb3VnaElucHV0LmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXksIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgSUVkaXRvck9wdGlvbnMgYXMgSUNvZGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVSUxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nTGFiZWxzLmpzJztcbmltcG9ydCB7IE9TLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBEaW1lbnNpb24sIGlzSFRNTEFuY2hvckVsZW1lbnQsIGlzSFRNTEJ1dHRvbkVsZW1lbnQsIGlzSFRNTEVsZW1lbnQsIHNpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVNhbml0aXplIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TYW5pdGl6ZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcblxuZXhwb3J0IGNvbnN0IFdBTEtfVEhST1VHSF9GT0NVUyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpbnRlcmFjdGl2ZVBsYXlncm91bmRGb2N1cycsIGZhbHNlKTtcblxuY29uc3QgVU5CT1VORF9DT01NQU5EID0gbG9jYWxpemUoJ3dhbGtUaHJvdWdoLnVuYm91bmRDb21tYW5kJywgXCJ1bmJvdW5kXCIpO1xuY29uc3QgV0FMS19USFJPVUdIX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZID0gJ3dhbGtUaHJvdWdoRWRpdG9yVmlld1N0YXRlJztcblxuaW50ZXJmYWNlIElWaWV3U3RhdGUge1xuXHRzY3JvbGxUb3A6IG51bWJlcjtcblx0c2Nyb2xsTGVmdDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVdhbGtUaHJvdWdoRWRpdG9yVmlld1N0YXRlIHtcblx0dmlld1N0YXRlOiBJVmlld1N0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgV2Fsa1Rocm91Z2hQYXJ0IGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci53YWxrVGhyb3VnaFBhcnQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgY29udGVudERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdHByaXZhdGUgY29udGVudCE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHNjcm9sbGJhciE6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvckZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsYXN0Rm9jdXM6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNpemU6IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JNZW1lbnRvOiBJRWRpdG9yTWVtZW50bzxJV2Fsa1Rocm91Z2hFZGl0b3JWaWV3U3RhdGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihXYWxrVGhyb3VnaFBhcnQuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvckZvY3VzID0gV0FMS19USFJPVUdIX0ZPQ1VTLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvck1lbWVudG8gPSB0aGlzLmdldEVkaXRvck1lbWVudG88SVdhbGtUaHJvdWdoRWRpdG9yVmlld1N0YXRlPihlZGl0b3JHcm91cFNlcnZpY2UsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBXQUxLX1RIUk9VR0hfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5jb250ZW50LmNsYXNzTGlzdC5hZGQoJ3dlbGNvbWVQYWdlRm9jdXNFbGVtZW50Jyk7XG5cdFx0dGhpcy5jb250ZW50LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLmNvbnRlbnQuc3R5bGUub3V0bGluZVN0eWxlID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5zY3JvbGxiYXIgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5jb250ZW50LCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvXG5cdFx0fSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5zY3JvbGxiYXIpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckZvY3VzSGFuZGxlcnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ2xpY2tIYW5kbGVyKCk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnNjcm9sbGJhci5vblNjcm9sbChlID0+IHRoaXMudXBkYXRlZFNjcm9sbFBvc2l0aW9uKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlZFNjcm9sbFBvc2l0aW9uKCkge1xuXHRcdGNvbnN0IHNjcm9sbERpbWVuc2lvbnMgPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHNjcm9sbERpbWVuc2lvbnMuc2Nyb2xsSGVpZ2h0O1xuXHRcdGlmIChzY3JvbGxIZWlnaHQgJiYgdGhpcy5pbnB1dCBpbnN0YW5jZW9mIFdhbGtUaHJvdWdoSW5wdXQpIHtcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcDtcblx0XHRcdGNvbnN0IGhlaWdodCA9IHNjcm9sbERpbWVuc2lvbnMuaGVpZ2h0O1xuXHRcdFx0dGhpcy5pbnB1dC5yZWxhdGl2ZVNjcm9sbFBvc2l0aW9uKHNjcm9sbFRvcCAvIHNjcm9sbEhlaWdodCwgKHNjcm9sbFRvcCArIGhlaWdodCkgLyBzY3JvbGxIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Ub3VjaENoYW5nZShldmVudDogR2VzdHVyZUV2ZW50KSB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wIC0gZXZlbnQudHJhbnNsYXRpb25ZIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRFdmVudExpc3RlbmVyPEsgZXh0ZW5kcyBrZXlvZiBIVE1MRWxlbWVudEV2ZW50TWFwLCBFIGV4dGVuZHMgSFRNTEVsZW1lbnQ+KGVsZW1lbnQ6IEUsIHR5cGU6IEssIGxpc3RlbmVyOiAodGhpczogRSwgZXY6IEhUTUxFbGVtZW50RXZlbnRNYXBbS10pID0+IGFueSwgdXNlQ2FwdHVyZT86IGJvb2xlYW4pOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBhZGRFdmVudExpc3RlbmVyPEUgZXh0ZW5kcyBIVE1MRWxlbWVudD4oZWxlbWVudDogRSwgdHlwZTogc3RyaW5nLCBsaXN0ZW5lcjogRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdCwgdXNlQ2FwdHVyZT86IGJvb2xlYW4pOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBhZGRFdmVudExpc3RlbmVyPEUgZXh0ZW5kcyBIVE1MRWxlbWVudD4oZWxlbWVudDogRSwgdHlwZTogc3RyaW5nLCBsaXN0ZW5lcjogRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdCwgdXNlQ2FwdHVyZT86IGJvb2xlYW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTsgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRm9jdXNIYW5kbGVycygpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5jb250ZW50LCAnbW91c2Vkb3duJywgZSA9PiB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLmNvbnRlbnQsICdmb2N1cycsIGUgPT4ge1xuXHRcdFx0dGhpcy5lZGl0b3JGb2N1cy5zZXQodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLmNvbnRlbnQsICdibHVyJywgZSA9PiB7XG5cdFx0XHR0aGlzLmVkaXRvckZvY3VzLnJlc2V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLmNvbnRlbnQsICdmb2N1c2luJywgKGU6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRcdC8vIFdvcmsgYXJvdW5kIHNjcm9sbGluZyBhcyBzaWRlLWVmZmVjdCBvZiBzZXR0aW5nIGZvY3VzIG9uIHRoZSBvZmZzY3JlZW4gem9uZSB3aWRnZXQgKCMxODkyOSlcblx0XHRcdGlmIChpc0hUTUxFbGVtZW50KGUudGFyZ2V0KSAmJiBlLnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3pvbmUtd2lkZ2V0LWNvbnRhaW5lcicpKSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRcdFx0dGhpcy5jb250ZW50LnNjcm9sbFRvcCA9IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcDtcblx0XHRcdFx0dGhpcy5jb250ZW50LnNjcm9sbExlZnQgPSBzY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQoZS50YXJnZXQpKSB7XG5cdFx0XHRcdHRoaXMubGFzdEZvY3VzID0gZS50YXJnZXQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNsaWNrSGFuZGxlcigpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5jb250ZW50LCAnY2xpY2snLCBldmVudCA9PiB7XG5cdFx0XHRmb3IgKGxldCBub2RlID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50OyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlIGFzIEhUTUxFbGVtZW50KSB7XG5cdFx0XHRcdGlmIChpc0hUTUxBbmNob3JFbGVtZW50KG5vZGUpICYmIG5vZGUuaHJlZikge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRcdGNvbnN0IGJhc2VFbGVtZW50ID0gbm9kZS5vd25lckRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdiYXNlJylbMF0gfHwgdGhpcy53aW5kb3cubG9jYXRpb247XG5cdFx0XHRcdFx0aWYgKGJhc2VFbGVtZW50ICYmIG5vZGUuaHJlZi5pbmRleE9mKGJhc2VFbGVtZW50LmhyZWYpID49IDAgJiYgbm9kZS5oYXNoKSB7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRcdGNvbnN0IHNjcm9sbFRhcmdldCA9IHRoaXMuY29udGVudC5xdWVyeVNlbGVjdG9yKG5vZGUuaGFzaCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpbm5lckNvbnRlbnQgPSB0aGlzLmNvbnRlbnQuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0XHRcdFx0XHRpZiAoc2Nyb2xsVGFyZ2V0ICYmIGlubmVyQ29udGVudCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRUb3AgPSBzY3JvbGxUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wIC0gMjA7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lclRvcCA9IGlubmVyQ29udGVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3A7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiB0YXJnZXRUb3AgLSBjb250YWluZXJUb3AgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMub3BlbihVUkkucGFyc2Uobm9kZS5ocmVmKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNIVE1MQnV0dG9uRWxlbWVudChub2RlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyk7XG5cdFx0XHRcdFx0aWYgKGhyZWYpIHtcblx0XHRcdFx0XHRcdHRoaXMub3BlbihVUkkucGFyc2UoaHJlZikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChub2RlID09PSBldmVudC5jdXJyZW50VGFyZ2V0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW4odXJpOiBVUkkpIHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2NvbW1hbmQnICYmIHVyaS5wYXRoID09PSAnZ2l0LmNsb25lJyAmJiAhQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCdnaXQuY2xvbmUnKSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3dhbGtUaHJvdWdoLmdpdE5vdEZvdW5kJywgXCJJdCBsb29rcyBsaWtlIEdpdCBpcyBub3QgaW5zdGFsbGVkIG9uIHlvdXIgc3lzdGVtLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHRoaXMuYWRkRnJvbSh1cmkpLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZEZyb20odXJpOiBVUkkpIHtcblx0XHRpZiAodXJpLnNjaGVtZSAhPT0gJ2NvbW1hbmQnIHx8ICEodGhpcy5pbnB1dCBpbnN0YW5jZW9mIFdhbGtUaHJvdWdoSW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRjb25zdCBxdWVyeSA9IHVyaS5xdWVyeSA/IEpTT04ucGFyc2UodXJpLnF1ZXJ5KSA6IHt9O1xuXHRcdHF1ZXJ5LmZyb20gPSB0aGlzLmlucHV0LmdldFRlbGVtZXRyeUZyb20oKTtcblx0XHRyZXR1cm4gdXJpLndpdGgoeyBxdWVyeTogSlNPTi5zdHJpbmdpZnkocXVlcnkpIH0pO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zaXplID0gZGltZW5zaW9uO1xuXHRcdHNpemUodGhpcy5jb250ZW50LCBkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdHRoaXMudXBkYXRlU2l6ZUNsYXNzZXMoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5mb3JFYWNoKGRpc3Bvc2FibGUgPT4ge1xuXHRcdFx0aWYgKGRpc3Bvc2FibGUgaW5zdGFuY2VvZiBDb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUubGF5b3V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3Qgd2Fsa3Rocm91Z2hJbnB1dCA9IHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0ICYmIHRoaXMuaW5wdXQ7XG5cdFx0aWYgKHdhbGt0aHJvdWdoSW5wdXQgJiYgd2Fsa3Rocm91Z2hJbnB1dC5sYXlvdXQpIHtcblx0XHRcdHdhbGt0aHJvdWdoSW5wdXQubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNpemVDbGFzc2VzKCkge1xuXHRcdGNvbnN0IGlubmVyQ29udGVudCA9IHRoaXMuY29udGVudC5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRpZiAodGhpcy5zaXplICYmIGlubmVyQ29udGVudCkge1xuXHRcdFx0aW5uZXJDb250ZW50LmNsYXNzTGlzdC50b2dnbGUoJ21heC1oZWlnaHQtNjg1cHgnLCB0aGlzLnNpemUuaGVpZ2h0IDw9IDY4NSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdGxldCBhY3RpdmUgPSB0aGlzLmNvbnRlbnQub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdHdoaWxlIChhY3RpdmUgJiYgYWN0aXZlICE9PSB0aGlzLmNvbnRlbnQpIHtcblx0XHRcdGFjdGl2ZSA9IGFjdGl2ZS5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblx0XHRpZiAoIWFjdGl2ZSkge1xuXHRcdFx0KHRoaXMubGFzdEZvY3VzIHx8IHRoaXMuY29udGVudCkuZm9jdXMoKTtcblx0XHR9XG5cdFx0dGhpcy5lZGl0b3JGb2N1cy5zZXQodHJ1ZSk7XG5cdH1cblxuXHRhcnJvd1VwKCkge1xuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wIC0gdGhpcy5nZXRBcnJvd1Njcm9sbEhlaWdodCgpIH0pO1xuXHR9XG5cblx0YXJyb3dEb3duKCkge1xuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wICsgdGhpcy5nZXRBcnJvd1Njcm9sbEhlaWdodCgpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBcnJvd1Njcm9sbEhlaWdodCgpIHtcblx0XHRsZXQgZm9udFNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuZm9udFNpemUnKTtcblx0XHRpZiAodHlwZW9mIGZvbnRTaXplICE9PSAnbnVtYmVyJyB8fCBmb250U2l6ZSA8IDEpIHtcblx0XHRcdGZvbnRTaXplID0gMTI7XG5cdFx0fVxuXHRcdHJldHVybiAzICogKGZvbnRTaXplIGFzIG51bWJlcik7XG5cdH1cblxuXHRwYWdlVXAoKSB7XG5cdFx0Y29uc3Qgc2Nyb2xsRGltZW5zaW9ucyA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCAtIHNjcm9sbERpbWVuc2lvbnMuaGVpZ2h0IH0pO1xuXHR9XG5cblx0cGFnZURvd24oKSB7XG5cdFx0Y29uc3Qgc2Nyb2xsRGltZW5zaW9ucyA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCArIHNjcm9sbERpbWVuc2lvbnMuaGVpZ2h0IH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0SW5wdXQoaW5wdXQ6IFdhbGtUaHJvdWdoSW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2goc3RvcmUpO1xuXG5cdFx0dGhpcy5jb250ZW50LmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0cmV0dXJuIHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbilcblx0XHRcdC50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKGlucHV0LnJlc291cmNlLnBhdGguZW5kc1dpdGgoJy5tZCcpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0XHR9KVxuXHRcdFx0LnRoZW4obW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gbW9kZWwubWFpbjtcblx0XHRcdFx0aWYgKCFpbnB1dC5yZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcubWQnKSkge1xuXHRcdFx0XHRcdHRoaXMuc2FmZVNldElubmVySHRtbCh0aGlzLmNvbnRlbnQsIGNvbnRlbnQpO1xuXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTaXplQ2xhc3NlcygpO1xuXHRcdFx0XHRcdHRoaXMuZGVjb3JhdGVDb250ZW50KCk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMucHVzaCh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4gdGhpcy5kZWNvcmF0ZUNvbnRlbnQoKSkpO1xuXHRcdFx0XHRcdGlucHV0Lm9uUmVhZHk/Lih0aGlzLmNvbnRlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQsIHN0b3JlKTtcblx0XHRcdFx0XHR0aGlzLnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0XHRcdHRoaXMubG9hZFRleHRFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlZFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW5uZXJDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGlubmVyQ29udGVudC5jbGFzc0xpc3QuYWRkKCd3YWxrVGhyb3VnaENvbnRlbnQnKTsgLy8gb25seSBmb3IgbWFya2Rvd24gZmlsZXNcblx0XHRcdFx0Y29uc3QgbWFya2Rvd24gPSB0aGlzLmV4cGFuZE1hY3Jvcyhjb250ZW50KTtcblx0XHRcdFx0dGhpcy5zYWZlU2V0SW5uZXJIdG1sKGlubmVyQ29udGVudCwgbWFya2Rvd24pO1xuXHRcdFx0XHR0aGlzLmNvbnRlbnQuYXBwZW5kQ2hpbGQoaW5uZXJDb250ZW50KTtcblxuXHRcdFx0XHRtb2RlbC5zbmlwcGV0cy5mb3JFYWNoKChzbmlwcGV0LCBpKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBzbmlwcGV0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGlkID0gYHNuaXBwZXQtJHttb2RlbC51cmkuZnJhZ21lbnR9YDtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRjb25zdCBkaXYgPSBpbm5lckNvbnRlbnQucXVlcnlTZWxlY3RvcihgIyR7aWQucmVwbGFjZSgvW1xcXFwuXS9nLCAnXFxcXCQmJyl9YCkgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRcdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5nZXRFZGl0b3JPcHRpb25zKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5RGF0YSA9IHtcblx0XHRcdFx0XHRcdHRhcmdldDogdGhpcy5pbnB1dCBpbnN0YW5jZW9mIFdhbGtUaHJvdWdoSW5wdXQgPyB0aGlzLmlucHV0LmdldFRlbGVtZXRyeUZyb20oKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHNuaXBwZXQ6IGlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgZGl2LCBvcHRpb25zLCB7XG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnlEYXRhOiB0ZWxlbWV0cnlEYXRhXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKGVkaXRvcik7XG5cblx0XHRcdFx0XHRjb25zdCB1cGRhdGVIZWlnaHQgPSAoaW5pdGlhbDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBwb3NpdGlvbiA/IGVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb24pIDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0XHRcdFx0XHRjb25zdCBoZWlnaHQgPSBgJHtNYXRoLm1heChtb2RlbC5nZXRMaW5lQ291bnQoKSArIDEsIDQpICogbGluZUhlaWdodH1weGA7XG5cdFx0XHRcdFx0XHRpZiAoZGl2LnN0eWxlLmhlaWdodCAhPT0gaGVpZ2h0KSB7XG5cdFx0XHRcdFx0XHRcdGRpdi5zdHlsZS5oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHRcdFx0XHRcdGVkaXRvci5sYXlvdXQoKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFpbml0aWFsKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dXBkYXRlSGVpZ2h0KHRydWUpO1xuXHRcdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2goZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHVwZGF0ZUhlaWdodChmYWxzZSkpKTtcblx0XHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKGUgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5uZXJDb250ZW50ID0gdGhpcy5jb250ZW50LmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdFx0XHRcdFx0aWYgKGlubmVyQ29udGVudCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRUb3AgPSBkaXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb250YWluZXJUb3AgPSBpbm5lckNvbnRlbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihlLnBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZVRvcCA9ICh0YXJnZXRUb3AgKyAoZS5wb3NpdGlvbi5saW5lTnVtYmVyIC0gMSkgKiBsaW5lSGVpZ2h0KSAtIGNvbnRhaW5lclRvcDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZUJvdHRvbSA9IGxpbmVUb3AgKyBsaW5lSGVpZ2h0O1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxEaW1lbnNpb25zID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gc2Nyb2xsRGltZW5zaW9ucy5oZWlnaHQ7XG5cdFx0XHRcdFx0XHRcdGlmIChzY3JvbGxUb3AgPiBsaW5lVG9wKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IGxpbmVUb3AgfSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoc2Nyb2xsVG9wIDwgbGluZUJvdHRvbSAtIGhlaWdodCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBsaW5lQm90dG9tIC0gaGVpZ2h0IH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMucHVzaCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InKSAmJiBzbmlwcGV0LnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRcdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLmdldEVkaXRvck9wdGlvbnMoc25pcHBldC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy51cGRhdGVTaXplQ2xhc3NlcygpO1xuXHRcdFx0XHR0aGlzLm11bHRpQ3Vyc29yTW9kaWZpZXIoKTtcblx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMucHVzaCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXInKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5tdWx0aUN1cnNvck1vZGlmaWVyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGlucHV0Lm9uUmVhZHk/Lihpbm5lckNvbnRlbnQsIHN0b3JlKTtcblx0XHRcdFx0dGhpcy5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0dGhpcy5sb2FkVGV4dEVkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlZFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2goR2VzdHVyZS5hZGRUYXJnZXQoaW5uZXJDb250ZW50KSk7XG5cdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2goYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlubmVyQ29udGVudCwgVG91Y2hFdmVudFR5cGUuQ2hhbmdlLCBlID0+IHRoaXMub25Ub3VjaENoYW5nZShlIGFzIEdlc3R1cmVFdmVudCkpKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzYWZlU2V0SW5uZXJIdG1sKG5vZGU6IEhUTUxFbGVtZW50LCBjb250ZW50OiBzdHJpbmcpIHtcblx0XHRkb21TYW5pdGl6ZS5zYWZlU2V0SW5uZXJIdG1sKG5vZGUsIGNvbnRlbnQsIHtcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdGF1Z21lbnQ6IFtcblx0XHRcdFx0XHQnaWQnLFxuXHRcdFx0XHRcdCdjbGFzcycsXG5cdFx0XHRcdFx0J3N0eWxlJyxcblx0XHRcdFx0XHQnZGF0YS1jb21tYW5kJyxcblx0XHRcdFx0XHQnZGF0YS1ocmVmJyxcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JPcHRpb25zKGxhbmd1YWdlOiBzdHJpbmcpOiBJQ29kZUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGRlZXBDbG9uZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0pKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uaXNPYmplY3QoY29uZmlnKSA/IGNvbmZpZyA6IE9iamVjdC5jcmVhdGUobnVsbCksXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAxNCxcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2F1dG8nLFxuXHRcdFx0XHR1c2VTaGFkb3dzOiB0cnVlLFxuXHRcdFx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRvdmVydmlld1J1bGVyTGFuZXM6IDMsXG5cdFx0XHRmaXhlZE92ZXJmbG93V2lkZ2V0czogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAxLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGV4cGFuZE1hY3JvcyhpbnB1dDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIGlucHV0LnJlcGxhY2UoL2tiXFwoKFthLXouXFxkXFwtXSspXFwpL2dpLCAobWF0Y2g6IHN0cmluZywga2I6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhrYik7XG5cdFx0XHRjb25zdCBzaG9ydGN1dCA9IGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgfHwgJycgOiBVTkJPVU5EX0NPTU1BTkQ7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwic2hvcnRjdXRcIj4ke3N0cmluZ3MuZXNjYXBlKHNob3J0Y3V0KX08L3NwYW4+YDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZGVjb3JhdGVDb250ZW50KCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGtleXMgPSB0aGlzLmNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLnNob3J0Y3V0W2RhdGEtY29tbWFuZF0nKTtcblx0XHRBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGtleXMsIChrZXk6IEVsZW1lbnQpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBrZXkuZ2V0QXR0cmlidXRlKCdkYXRhLWNvbW1hbmQnKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBjb21tYW5kICYmIHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kKTtcblx0XHRcdGNvbnN0IGxhYmVsID0ga2V5YmluZGluZyA/IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSB8fCAnJyA6IFVOQk9VTkRfQ09NTUFORDtcblx0XHRcdHdoaWxlIChrZXkuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHRrZXkuZmlyc3RDaGlsZC5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHRcdGtleS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsYWJlbCkpO1xuXHRcdH0pO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlma2V5cyA9IHRoaXMuY29udGVudC5xdWVyeVNlbGVjdG9yQWxsKCcuaWZfc2hvcnRjdXRbZGF0YS1jb21tYW5kXScpO1xuXHRcdEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoaWZrZXlzLCAoa2V5OiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGtleS5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29tbWFuZCcpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGNvbW1hbmQgJiYgdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmQpO1xuXHRcdFx0a2V5LnN0eWxlLmRpc3BsYXkgPSAha2V5YmluZGluZyA/ICdub25lJyA6ICcnO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtdWx0aUN1cnNvck1vZGlmaWVyKCkge1xuXHRcdGNvbnN0IGxhYmVscyA9IFVJTGFiZWxQcm92aWRlci5tb2RpZmllckxhYmVsc1tPU107XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IubXVsdGlDdXJzb3JNb2RpZmllcicpO1xuXHRcdGNvbnN0IG1vZGlmaWVyID0gbGFiZWxzW3ZhbHVlID09PSAnY3RybENtZCcgPyAoT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggPyAnbWV0YUtleScgOiAnY3RybEtleScpIDogJ2FsdEtleSddO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGtleXMgPSB0aGlzLmNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLm11bHRpLWN1cnNvci1tb2RpZmllcicpO1xuXHRcdEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoa2V5cywgKGtleTogRWxlbWVudCkgPT4ge1xuXHRcdFx0d2hpbGUgKGtleS5maXJzdENoaWxkKSB7XG5cdFx0XHRcdGtleS5maXJzdENoaWxkLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0a2V5LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG1vZGlmaWVyKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVUZXh0RWRpdG9yVmlld1N0YXRlKGlucHV0OiBXYWxrVGhyb3VnaElucHV0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXG5cdFx0dGhpcy5lZGl0b3JNZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dCwge1xuXHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdHNjcm9sbFRvcDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wLFxuXHRcdFx0XHRzY3JvbGxMZWZ0OiBzY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRUZXh0RWRpdG9yVmlld1N0YXRlKGlucHV0OiBXYWxrVGhyb3VnaElucHV0KSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmVkaXRvck1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRoaXMuZ3JvdXAsIGlucHV0KTtcblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHN0YXRlLnZpZXdTdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0KSB7XG5cdFx0XHR0aGlzLnNhdmVUZXh0RWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2UodGhpcy5jb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0KSB7XG5cdFx0XHR0aGlzLnNhdmVUZXh0RWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdH1cblxuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvckZvY3VzLnJlc2V0KCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuY29udGVudERpc3Bvc2FibGVzKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsYUFBYSxnQkFBOEIsZUFBZTtBQUNuRSxTQUFTLDJCQUEyQjtBQUNwQyxZQUFZLGFBQWE7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQXNCLFNBQVMsY0FBYyx1QkFBdUI7QUFFcEUsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUE0QiwwQkFBMEI7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBMEQ7QUFDbkUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxJQUFJLHVCQUF1QjtBQUNwQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUFrQyxxQkFBcUIscUJBQXFCLGVBQWUsWUFBWTtBQUNoSCxZQUFZLGlCQUFpQjtBQUM3QixTQUF1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QUE0QjtBQUM3RSxVQUFNLFdBQVcsT0FBTyxVQUFVLFlBQWEsT0FBTyxnQkFBZ0IsWUFBWSxZQUFZLFlBQWEsUUFBUTtBQUVuSCxVQUFNLE9BQU8sS0FBSyxRQUFRLGlCQUFpQix3QkFBd0I7QUFDbkUsVUFBTSxVQUFVLFFBQVEsS0FBSyxNQUFNLENBQUMsUUFBaUI7QUFDcEQsYUFBTyxJQUFJLFlBQVk7QUFDdEIsWUFBSSxXQUFXLE9BQU87QUFBQSxNQUN2QjtBQUNBLFVBQUksWUFBWSxTQUFTLGVBQWUsUUFBUSxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHdCQUF3QixPQUErQjtBQUM5RCxVQUFNLGlCQUFpQixLQUFLLFVBQVUsa0JBQWtCO0FBRXhELFNBQUssY0FBYyxnQkFBZ0IsS0FBSyxPQUFPLE9BQU87QUFBQSxNQUNyRCxXQUFXO0FBQUEsUUFDVixXQUFXLGVBQWU7QUFBQSxRQUMxQixZQUFZLGVBQWU7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHdCQUF3QixPQUF5QjtBQUN4RCxVQUFNLFFBQVEsS0FBSyxjQUFjLGdCQUFnQixLQUFLLE9BQU8sS0FBSztBQUNsRSxRQUFJLE9BQU87QUFDVixXQUFLLFVBQVUsa0JBQWtCLE1BQU0sU0FBUztBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRWdCLGFBQW1CO0FBQ2xDLFFBQUksS0FBSyxpQkFBaUIsa0JBQWtCO0FBQzNDLFdBQUssd0JBQXdCLEtBQUssS0FBSztBQUFBLElBQ3hDO0FBQ0EsU0FBSyxxQkFBcUIsUUFBUSxLQUFLLGtCQUFrQjtBQUN6RCxVQUFNLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRW1CLFlBQWtCO0FBQ3BDLFFBQUksS0FBSyxpQkFBaUIsa0JBQWtCO0FBQzNDLFdBQUssd0JBQXdCLEtBQUssS0FBSztBQUFBLElBQ3hDO0FBRUEsVUFBTSxVQUFVO0FBQUEsRUFDakI7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssWUFBWSxNQUFNO0FBQ3ZCLFNBQUsscUJBQXFCLFFBQVEsS0FBSyxrQkFBa0I7QUFDekQsU0FBSyxZQUFZLFFBQVE7QUFDekIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBaGNhLGdCQUVJLEtBQWE7QUFGakIsa0JBQU47QUFBQSxFQWVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTFCVTsiLAogICJuYW1lcyI6IFsibW9kZWwiLCAib3B0aW9ucyIsICJpbm5lckNvbnRlbnQiXQp9Cg==
