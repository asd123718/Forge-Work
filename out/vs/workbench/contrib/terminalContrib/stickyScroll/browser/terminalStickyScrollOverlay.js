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
import { $, addDisposableListener, addStandardDisposableListener, getWindow } from "../../../../../base/browser/dom.js";
import { debounce, throttle } from "../../../../../base/common/decorators.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, MutableDisposable, combinedDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../../base/common/strings.js";
import "./media/stickyScroll.css";
import { localize } from "../../../../../nls.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { isFullTerminalCommand } from "../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ITerminalConfigurationService } from "../../../terminal/browser/terminal.js";
import { openContextMenu } from "../../../terminal/browser/terminalContextMenu.js";
import { TERMINAL_CONFIG_SECTION, TerminalCommandId } from "../../../terminal/common/terminal.js";
import { terminalStrings } from "../../../terminal/common/terminalStrings.js";
import { TerminalStickyScrollSettingId } from "../common/terminalStickyScrollConfiguration.js";
import { terminalStickyScrollBackground, terminalStickyScrollHoverBackground } from "./terminalStickyScrollColorRegistry.js";
import { XtermAddonImporter } from "../../../terminal/browser/xterm/xtermAddonImporter.js";
var OverlayState = /* @__PURE__ */ ((OverlayState2) => {
  OverlayState2[OverlayState2["Off"] = 0] = "Off";
  OverlayState2[OverlayState2["On"] = 1] = "On";
  return OverlayState2;
})(OverlayState || {});
var CssClasses = /* @__PURE__ */ ((CssClasses2) => {
  CssClasses2["Visible"] = "visible";
  return CssClasses2;
})(CssClasses || {});
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["StickyScrollPercentageCap"] = 0.4] = "StickyScrollPercentageCap";
  return Constants2;
})(Constants || {});
let TerminalStickyScrollOverlay = class extends Disposable {
  constructor(_instance, _xterm, _xtermColorProvider, _commandDetection, xtermCtor, configurationService, contextKeyService, _contextMenuService, _keybindingService, menuService, _terminalConfigurationService, _themeService) {
    super();
    this._instance = _instance;
    this._xterm = _xterm;
    this._xtermColorProvider = _xtermColorProvider;
    this._commandDetection = _commandDetection;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._themeService = _themeService;
    this._xtermAddonLoader = new XtermAddonImporter();
    this._webglAddon = this._register(new MutableDisposable());
    this._refreshListeners = this._register(new MutableDisposable());
    this._state = 0 /* Off */;
    this._isRefreshQueued = false;
    this._rawMaxLineCount = 5;
    this._ignoredCommands = [];
    this._pendingShowOperation = false;
    this._contextMenu = this._register(menuService.createMenu(MenuId.TerminalStickyScrollContext, contextKeyService));
    this._register(Event.runAndSubscribe(this._xterm.raw.buffer.onBufferChange, (buffer) => {
      this._setState((buffer ?? this._xterm.raw.buffer.active).type === "normal" ? 1 /* On */ : 0 /* Off */);
    }));
    this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(TerminalStickyScrollSettingId.MaxLineCount)) {
        this._rawMaxLineCount = configurationService.getValue(TerminalStickyScrollSettingId.MaxLineCount);
      }
      if (!e || e.affectsConfiguration(TerminalStickyScrollSettingId.IgnoredCommands)) {
        this._ignoredCommands = configurationService.getValue(TerminalStickyScrollSettingId.IgnoredCommands);
      }
    }));
    this._register(this._instance.onDidChangeTarget(() => this._syncOptions()));
    xtermCtor.then((ctor) => {
      if (this._store.isDisposed) {
        return;
      }
      this._stickyScrollOverlay = this._register(new ctor({
        rows: 1,
        cols: this._xterm.raw.cols,
        allowProposedApi: true,
        ...this._getOptions()
      }));
      this._refreshGpuAcceleration();
      this._register(configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
          this._syncOptions();
        }
      }));
      this._register(this._themeService.onDidColorThemeChange(() => {
        this._syncOptions();
      }));
      this._register(this._xterm.raw.onResize(() => {
        this._syncOptions();
        this._refresh();
      }));
      this._register(this._instance.onDidChangeVisibility((isVisible) => {
        if (isVisible) {
          this._refresh();
        }
      }));
      this._xtermAddonLoader.importAddon("serialize").then((SerializeAddon) => {
        if (this._store.isDisposed) {
          return;
        }
        this._serializeAddon = this._register(new SerializeAddon());
        this._xterm.raw.loadAddon(this._serializeAddon);
        this._refresh();
      });
    });
  }
  lockHide() {
    this._element?.classList.add("lock-hide");
  }
  unlockHide() {
    this._element?.classList.remove("lock-hide");
  }
  _setState(state) {
    if (this._state === state) {
      return;
    }
    this._state = state;
    switch (state) {
      case 0 /* Off */: {
        this._setVisible(false);
        this._uninstallRefreshListeners();
        break;
      }
      case 1 /* On */: {
        this._refresh();
        this._installRefreshListeners();
        break;
      }
    }
  }
  _installRefreshListeners() {
    if (!this._refreshListeners.value) {
      this._refreshListeners.value = combinedDisposable(
        Event.any(
          this._xterm.raw.onScroll,
          this._xterm.raw.onLineFeed,
          // Rarely an update may be required after just a cursor move, like when
          // scrolling horizontally in a pager
          this._xterm.raw.onCursorMove
        )(() => this._refresh()),
        // eslint-disable-next-line no-restricted-syntax
        addStandardDisposableListener(this._xterm.raw.element.querySelector(".xterm-viewport"), "scroll", () => this._refresh())
      );
    }
  }
  _uninstallRefreshListeners() {
    this._refreshListeners.clear();
  }
  _setVisible(isVisible) {
    if (isVisible) {
      this._pendingShowOperation = true;
      this._show();
    } else {
      this._hide();
    }
  }
  _show() {
    if (this._pendingShowOperation) {
      this._ensureElement();
      this._element?.classList.toggle("visible" /* Visible */, true);
    }
    this._pendingShowOperation = false;
  }
  _hide() {
    this._pendingShowOperation = false;
    this._element?.classList.toggle("visible" /* Visible */, false);
  }
  _refresh() {
    if (this._isRefreshQueued) {
      return;
    }
    this._isRefreshQueued = true;
    queueMicrotask(() => {
      this._refreshNow();
      this._isRefreshQueued = false;
    });
  }
  _refreshNow() {
    const command = this._commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY);
    this._currentStickyCommand = void 0;
    if (!command || this._isIgnoredCommand(command)) {
      this._setVisible(false);
      return;
    }
    if (!isFullTerminalCommand(command)) {
      const partialCommand = this._commandDetection.currentCommand;
      if (partialCommand?.commandStartMarker && partialCommand.commandExecutedMarker) {
        this._updateContent(partialCommand, partialCommand.commandStartMarker);
        return;
      }
      this._setVisible(false);
      return;
    }
    const marker = command.marker;
    if (!marker || marker.line === -1) {
      this._setVisible(false);
      return;
    }
    this._updateContent(command, marker);
  }
  _updateContent(command, startMarker) {
    const xterm = this._xterm.raw;
    if (!xterm.element?.parentElement || !this._stickyScrollOverlay || !this._serializeAddon) {
      return;
    }
    if (command.promptStartMarker?.line === -1) {
      this._setVisible(false);
      return;
    }
    const buffer = xterm.buffer.active;
    const promptRowCount = command.getPromptRowCount();
    const commandRowCount = command.getCommandRowCount();
    const stickyScrollLineStart = startMarker.line - (promptRowCount - 1);
    const isPartialCommand = !isFullTerminalCommand(command);
    const rowOffset = !isPartialCommand && command.endMarker ? Math.max(buffer.viewportY - command.endMarker.line + 1, 0) : 0;
    const maxLineCount = Math.min(this._rawMaxLineCount, Math.floor(xterm.rows * 0.4 /* StickyScrollPercentageCap */));
    const stickyScrollLineCount = Math.min(promptRowCount + commandRowCount - 1, maxLineCount) - rowOffset;
    const isTruncated = stickyScrollLineCount < promptRowCount + commandRowCount - 1;
    if (buffer.viewportY <= stickyScrollLineStart) {
      this._setVisible(false);
      return;
    }
    if (isPartialCommand && buffer.viewportY === buffer.baseY && buffer.cursorY === xterm.rows - 1) {
      const line = buffer.getLine(buffer.baseY + xterm.rows - 1);
      if (buffer.cursorX === 1 && lineStartsWith(line, ":") || buffer.cursorX === 5 && lineStartsWith(line, "(END)")) {
        this._setVisible(false);
        return;
      }
    }
    const content = this._serializeAddon.serialize({
      range: {
        start: stickyScrollLineStart + rowOffset,
        end: stickyScrollLineStart + rowOffset + Math.max(stickyScrollLineCount - 1, 0)
      }
    }) + (isTruncated ? "\x1B[0m \u2026" : "");
    if (isPartialCommand && removeAnsiEscapeCodes(content).length === 0) {
      this._setVisible(false);
      return;
    }
    if (content && this._currentContent !== content || this._stickyScrollOverlay.cols !== xterm.cols || this._stickyScrollOverlay.rows !== stickyScrollLineCount) {
      this._stickyScrollOverlay.resize(this._stickyScrollOverlay.cols, stickyScrollLineCount);
      this._stickyScrollOverlay.write("\x1B[0m\x1B[H\x1B[2J");
      this._stickyScrollOverlay.write(content);
      this._currentContent = content;
    }
    if (content) {
      this._currentStickyCommand = command;
      this._setVisible(true);
      if (this._element) {
        const termBox = xterm.element.getBoundingClientRect();
        if (termBox.height > 0) {
          const rowHeight = termBox.height / xterm.rows;
          const overlayHeight = stickyScrollLineCount * rowHeight;
          let endMarkerOffset = 0;
          if (!isPartialCommand && command.endMarker && command.endMarker.line !== -1) {
            const lastLine = Math.min(command.endMarker.line, buffer.baseY + buffer.cursorY);
            if (buffer.viewportY + stickyScrollLineCount > lastLine) {
              const diff = buffer.viewportY + stickyScrollLineCount - lastLine;
              endMarkerOffset = diff * rowHeight;
            }
          }
          this._element.style.bottom = `${termBox.height - overlayHeight + 1 + endMarkerOffset}px`;
        }
      }
    } else {
      this._setVisible(false);
    }
  }
  _ensureElement() {
    if (
      // The element is already created
      this._element || // If the overlay is yet to be created, the terminal cannot be opened so defer to next call
      !this._stickyScrollOverlay || // The xterm.js instance isn't opened yet
      !this._xterm?.raw.element?.parentElement
    ) {
      return;
    }
    const overlay = this._stickyScrollOverlay;
    const hoverOverlay = $(".hover-overlay");
    this._element = $(".terminal-sticky-scroll", void 0, hoverOverlay);
    this._xterm.raw.element.parentElement.append(this._element);
    this._register(toDisposable(() => this._element?.remove()));
    let hoverTitle = localize("stickyScrollHoverTitle", "Navigate to Command");
    const scrollToPreviousCommandKeybinding = this._keybindingService.lookupKeybinding(TerminalCommandId.ScrollToPreviousCommand);
    if (scrollToPreviousCommandKeybinding) {
      const label = scrollToPreviousCommandKeybinding.getLabel();
      if (label) {
        hoverTitle += "\n" + localize("labelWithKeybinding", "{0} ({1})", terminalStrings.scrollToPreviousCommand.value, label);
      }
    }
    const scrollToNextCommandKeybinding = this._keybindingService.lookupKeybinding(TerminalCommandId.ScrollToNextCommand);
    if (scrollToNextCommandKeybinding) {
      const label = scrollToNextCommandKeybinding.getLabel();
      if (label) {
        hoverTitle += "\n" + localize("labelWithKeybinding", "{0} ({1})", terminalStrings.scrollToNextCommand.value, label);
      }
    }
    hoverOverlay.title = hoverTitle;
    const scrollBarWidth = this._xterm.raw._core.viewport?.scrollBarWidth;
    if (scrollBarWidth !== void 0) {
      this._element.style.right = `${scrollBarWidth}px`;
    }
    this._stickyScrollOverlay.open(this._element);
    this._stickyScrollOverlay.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab") {
        return false;
      }
      return true;
    });
    this._xtermAddonLoader.importAddon("ligatures").then((LigaturesAddon) => {
      if (this._store.isDisposed || !this._stickyScrollOverlay) {
        return;
      }
      this._ligaturesAddon = new LigaturesAddon();
      this._stickyScrollOverlay.loadAddon(this._ligaturesAddon);
    });
    this._register(addStandardDisposableListener(hoverOverlay, "click", () => {
      if (this._xterm && this._currentStickyCommand) {
        this._xterm.markTracker.revealCommand(this._currentStickyCommand);
        this._instance.focus();
      }
    }));
    this._register(addStandardDisposableListener(hoverOverlay, "wheel", (e) => this._xterm?.raw.element?.dispatchEvent(new WheelEvent(e.type, e))));
    this._register(addDisposableListener(hoverOverlay, "mousedown", (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    }));
    this._register(addDisposableListener(hoverOverlay, "contextmenu", (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      openContextMenu(getWindow(hoverOverlay), e, this._instance, this._contextMenu, this._contextMenuService);
    }));
    this._register(addStandardDisposableListener(hoverOverlay, "mouseover", () => overlay.options.theme = this._getTheme(true)));
    this._register(addStandardDisposableListener(hoverOverlay, "mouseleave", () => overlay.options.theme = this._getTheme(false)));
  }
  _syncOptions() {
    if (!this._stickyScrollOverlay) {
      return;
    }
    this._stickyScrollOverlay.resize(this._xterm.raw.cols, this._stickyScrollOverlay.rows);
    this._stickyScrollOverlay.options = this._getOptions();
    this._refreshGpuAcceleration();
  }
  _getOptions() {
    const o = this._xterm.raw.options;
    return {
      cursorInactiveStyle: "none",
      scrollback: 0,
      logLevel: "off",
      theme: this._getTheme(false),
      documentOverride: o.documentOverride,
      fontFamily: o.fontFamily,
      fontWeight: o.fontWeight,
      fontWeightBold: o.fontWeightBold,
      fontSize: o.fontSize,
      letterSpacing: o.letterSpacing,
      lineHeight: o.lineHeight,
      drawBoldTextInBrightColors: o.drawBoldTextInBrightColors,
      minimumContrastRatio: o.minimumContrastRatio,
      tabStopWidth: o.tabStopWidth
    };
  }
  async _refreshGpuAcceleration() {
    if (this._shouldLoadWebgl() && (!this._webglAddon.value || this._webglAddonCustomGlyphs !== this._terminalConfigurationService.config.customGlyphs)) {
      const WebglAddon = await this._xtermAddonLoader.importAddon("webgl");
      if (this._store.isDisposed) {
        return;
      }
      this._webglAddon.value = new WebglAddon({
        customGlyphs: this._terminalConfigurationService.config.customGlyphs
      });
      this._webglAddonCustomGlyphs = this._terminalConfigurationService.config.customGlyphs;
      this._stickyScrollOverlay?.loadAddon(this._webglAddon.value);
    } else if (!this._shouldLoadWebgl() && this._webglAddon.value) {
      this._webglAddon.clear();
    }
  }
  _shouldLoadWebgl() {
    return this._terminalConfigurationService.config.gpuAcceleration === "auto" || this._terminalConfigurationService.config.gpuAcceleration === "on";
  }
  _getTheme(isHovering) {
    const theme = this._themeService.getColorTheme();
    return {
      ...this._xterm.getXtermTheme(),
      background: isHovering ? theme.getColor(terminalStickyScrollHoverBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString() : theme.getColor(terminalStickyScrollBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString(),
      selectionBackground: void 0,
      selectionInactiveBackground: void 0
    };
  }
  _isIgnoredCommand(command) {
    if (!command.command) {
      return false;
    }
    const trimmedCommand = command.command.trim().toLowerCase();
    return this._ignoredCommands.some((cmd) => cmd.toLowerCase() === trimmedCommand);
  }
};
__decorateClass([
  debounce(100)
], TerminalStickyScrollOverlay.prototype, "_show", 1);
__decorateClass([
  throttle(0)
], TerminalStickyScrollOverlay.prototype, "_syncOptions", 1);
__decorateClass([
  throttle(0)
], TerminalStickyScrollOverlay.prototype, "_refreshGpuAcceleration", 1);
TerminalStickyScrollOverlay = __decorateClass([
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, ITerminalConfigurationService),
  __decorateParam(11, IThemeService)
], TerminalStickyScrollOverlay);
function lineStartsWith(line, text) {
  if (!line) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    if (line.getCell(i)?.getChars() !== text[i]) {
      return false;
    }
  }
  return true;
}
export {
  TerminalStickyScrollOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3RpY2t5U2Nyb2xsXFxicm93c2VyXFx0ZXJtaW5hbFN0aWNreVNjcm9sbE92ZXJsYXkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFNlcmlhbGl6ZUFkZG9uIGFzIFNlcmlhbGl6ZUFkZG9uVHlwZSB9IGZyb20gJ0B4dGVybS9hZGRvbi1zZXJpYWxpemUnO1xuaW1wb3J0IHR5cGUgeyBXZWJnbEFkZG9uIGFzIFdlYmdsQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXdlYmdsJztcbmltcG9ydCB0eXBlIHsgTGlnYXR1cmVzQWRkb24gYXMgTGlnYXR1cmVzQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLWxpZ2F0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IElCdWZmZXJMaW5lLCBJTWFya2VyLCBJVGVybWluYWxPcHRpb25zLCBJVGhlbWUsIFRlcm1pbmFsIGFzIFJhd1h0ZXJtVGVybWluYWwsIFRlcm1pbmFsIGFzIFhUZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSwgdGhyb3R0bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIGNvbWJpbmVkRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL21lZGlhL3N0aWNreVNjcm9sbC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIElUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJQ3VycmVudFBhcnRpYWxDb21tYW5kLCBpc0Z1bGxUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vdGVybWluYWxDb21tYW5kLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVh0ZXJtQ29sb3JQcm92aWRlciwgSVh0ZXJtVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IG9wZW5Db250ZXh0TWVudSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxDb250ZXh0TWVudS5qcyc7XG5pbXBvcnQgeyBJWHRlcm1Db3JlIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci94dGVybS1wcml2YXRlLmpzJztcbmltcG9ydCB7IFRFUk1JTkFMX0NPTkZJR19TRUNUSU9OLCBUZXJtaW5hbENvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN0cmluZ3MgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RpY2t5U2Nyb2xsU2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RpY2t5U2Nyb2xsQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN0aWNreVNjcm9sbEJhY2tncm91bmQsIHRlcm1pbmFsU3RpY2t5U2Nyb2xsSG92ZXJCYWNrZ3JvdW5kIH0gZnJvbSAnLi90ZXJtaW5hbFN0aWNreVNjcm9sbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgWHRlcm1BZGRvbkltcG9ydGVyIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci94dGVybS94dGVybUFkZG9uSW1wb3J0ZXIuanMnO1xuXG5jb25zdCBlbnVtIE92ZXJsYXlTdGF0ZSB7XG5cdC8qKiBJbml0aWFsIHN0YXRlL2Rpc2FibGVkIGJ5IHRoZSBhbHQgYnVmZmVyLiAqL1xuXHRPZmYgPSAwLFxuXHRPbiA9IDFcbn1cblxuY29uc3QgZW51bSBDc3NDbGFzc2VzIHtcblx0VmlzaWJsZSA9ICd2aXNpYmxlJ1xufVxuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdFN0aWNreVNjcm9sbFBlcmNlbnRhZ2VDYXAgPSAwLjRcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsU3RpY2t5U2Nyb2xsT3ZlcmxheSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9zdGlja3lTY3JvbGxPdmVybGF5PzogUmF3WHRlcm1UZXJtaW5hbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF94dGVybUFkZG9uTG9hZGVyID0gbmV3IFh0ZXJtQWRkb25JbXBvcnRlcigpO1xuXHRwcml2YXRlIF9zZXJpYWxpemVBZGRvbj86IFNlcmlhbGl6ZUFkZG9uVHlwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2ViZ2xBZGRvbjogTXV0YWJsZURpc3Bvc2FibGU8V2ViZ2xBZGRvblR5cGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF93ZWJnbEFkZG9uQ3VzdG9tR2x5cGhzPzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbGlnYXR1cmVzQWRkb24/OiBMaWdhdHVyZXNBZGRvblR5cGU7XG5cblx0cHJpdmF0ZSBfZWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jdXJyZW50U3RpY2t5Q29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQgfCBJQ3VycmVudFBhcnRpYWxDb21tYW5kO1xuXHRwcml2YXRlIF9jdXJyZW50Q29udGVudD86IHN0cmluZztcblx0cHJpdmF0ZSBfY29udGV4dE1lbnU6IElNZW51O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZnJlc2hMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfc3RhdGU6IE92ZXJsYXlTdGF0ZSA9IE92ZXJsYXlTdGF0ZS5PZmY7XG5cdHByaXZhdGUgX2lzUmVmcmVzaFF1ZXVlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9yYXdNYXhMaW5lQ291bnQ6IG51bWJlciA9IDU7XG5cdHByaXZhdGUgX2lnbm9yZWRDb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfcGVuZGluZ1Nob3dPcGVyYXRpb24gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm06IElYdGVybVRlcm1pbmFsICYgeyByYXc6IFJhd1h0ZXJtVGVybWluYWwgfSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF94dGVybUNvbG9yUHJvdmlkZXI6IElYdGVybUNvbG9yUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZERldGVjdGlvbjogSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LFxuXHRcdHh0ZXJtQ3RvcjogUHJvbWlzZTx0eXBlb2YgWFRlcm1UZXJtaW5hbD4sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY29udGV4dE1lbnUgPSB0aGlzLl9yZWdpc3RlcihtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXJtaW5hbFN0aWNreVNjcm9sbENvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHQvLyBPbmx5IHNob3cgc3RpY2t5IHNjcm9sbCBpbiB0aGUgbm9ybWFsIGJ1ZmZlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl94dGVybS5yYXcuYnVmZmVyLm9uQnVmZmVyQ2hhbmdlLCBidWZmZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoKGJ1ZmZlciA/PyB0aGlzLl94dGVybS5yYXcuYnVmZmVyLmFjdGl2ZSkudHlwZSA9PT0gJ25vcm1hbCcgPyBPdmVybGF5U3RhdGUuT24gOiBPdmVybGF5U3RhdGUuT2ZmKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byBjb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IHtcblx0XHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU3RpY2t5U2Nyb2xsU2V0dGluZ0lkLk1heExpbmVDb3VudCkpIHtcblx0XHRcdFx0dGhpcy5fcmF3TWF4TGluZUNvdW50ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTdGlja3lTY3JvbGxTZXR0aW5nSWQuTWF4TGluZUNvdW50KTtcblx0XHRcdH1cblx0XHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU3RpY2t5U2Nyb2xsU2V0dGluZ0lkLklnbm9yZWRDb21tYW5kcykpIHtcblx0XHRcdFx0dGhpcy5faWdub3JlZENvbW1hbmRzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTdGlja3lTY3JvbGxTZXR0aW5nSWQuSWdub3JlZENvbW1hbmRzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byB0ZXJtaW5hbCBsb2NhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFuY2Uub25EaWRDaGFuZ2VUYXJnZXQoKCkgPT4gdGhpcy5fc3luY09wdGlvbnMoKSkpO1xuXG5cdFx0Ly8gRWFnZXJseSBjcmVhdGUgdGhlIG92ZXJsYXlcblx0XHR4dGVybUN0b3IudGhlbihjdG9yID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkgPSB0aGlzLl9yZWdpc3RlcihuZXcgY3Rvcih7XG5cdFx0XHRcdHJvd3M6IDEsXG5cdFx0XHRcdGNvbHM6IHRoaXMuX3h0ZXJtLnJhdy5jb2xzLFxuXHRcdFx0XHRhbGxvd1Byb3Bvc2VkQXBpOiB0cnVlLFxuXHRcdFx0XHQuLi50aGlzLl9nZXRPcHRpb25zKClcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hHcHVBY2NlbGVyYXRpb24oKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURVJNSU5BTF9DT05GSUdfU0VDVElPTikpIHtcblx0XHRcdFx0XHR0aGlzLl9zeW5jT3B0aW9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fc3luY09wdGlvbnMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3h0ZXJtLnJhdy5vblJlc2l6ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3N5bmNPcHRpb25zKCk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2goKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbmNlLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eShpc1Zpc2libGUgPT4ge1xuXHRcdFx0XHRpZiAoaXNWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3NlcmlhbGl6ZScpLnRoZW4oU2VyaWFsaXplQWRkb24gPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZXJpYWxpemVBZGRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXJpYWxpemVBZGRvbigpKTtcblx0XHRcdFx0dGhpcy5feHRlcm0ucmF3LmxvYWRBZGRvbih0aGlzLl9zZXJpYWxpemVBZGRvbik7XG5cdFx0XHRcdC8vIFRyaWdnZXIgYSByZW5kZXIgYXMgdGhlIHNlcmlhbGl6ZSBhZGRvbiBpcyByZXF1aXJlZCB0byByZW5kZXJcblx0XHRcdFx0dGhpcy5fcmVmcmVzaCgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRsb2NrSGlkZSgpIHtcblx0XHR0aGlzLl9lbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdsb2NrLWhpZGUnKTtcblx0fVxuXG5cdHVubG9ja0hpZGUoKSB7XG5cdFx0dGhpcy5fZWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnbG9jay1oaWRlJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTdGF0ZShzdGF0ZTogT3ZlcmxheVN0YXRlKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZSA9IHN0YXRlO1xuXHRcdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRcdGNhc2UgT3ZlcmxheVN0YXRlLk9mZjoge1xuXHRcdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fdW5pbnN0YWxsUmVmcmVzaExpc3RlbmVycygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgT3ZlcmxheVN0YXRlLk9uOiB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2goKTtcblx0XHRcdFx0dGhpcy5faW5zdGFsbFJlZnJlc2hMaXN0ZW5lcnMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW5zdGFsbFJlZnJlc2hMaXN0ZW5lcnMoKSB7XG5cdFx0aWYgKCF0aGlzLl9yZWZyZXNoTGlzdGVuZXJzLnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoTGlzdGVuZXJzLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0dGhpcy5feHRlcm0ucmF3Lm9uU2Nyb2xsLFxuXHRcdFx0XHRcdHRoaXMuX3h0ZXJtLnJhdy5vbkxpbmVGZWVkLFxuXHRcdFx0XHRcdC8vIFJhcmVseSBhbiB1cGRhdGUgbWF5IGJlIHJlcXVpcmVkIGFmdGVyIGp1c3QgYSBjdXJzb3IgbW92ZSwgbGlrZSB3aGVuXG5cdFx0XHRcdFx0Ly8gc2Nyb2xsaW5nIGhvcml6b250YWxseSBpbiBhIHBhZ2VyXG5cdFx0XHRcdFx0dGhpcy5feHRlcm0ucmF3Lm9uQ3Vyc29yTW92ZSxcblx0XHRcdFx0KSgoKSA9PiB0aGlzLl9yZWZyZXNoKCkpLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0YWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5feHRlcm0ucmF3LmVsZW1lbnQhLnF1ZXJ5U2VsZWN0b3IoJy54dGVybS12aWV3cG9ydCcpISwgJ3Njcm9sbCcsICgpID0+IHRoaXMuX3JlZnJlc2goKSksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VuaW5zdGFsbFJlZnJlc2hMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVmcmVzaExpc3RlbmVycy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmlzaWJsZShpc1Zpc2libGU6IGJvb2xlYW4pIHtcblx0XHRpZiAoaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2hvd09wZXJhdGlvbiA9IHRydWU7XG5cdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2hpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRAZGVib3VuY2UoMTAwKVxuXHRwcml2YXRlIF9zaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nU2hvd09wZXJhdGlvbikge1xuXHRcdFx0dGhpcy5fZW5zdXJlRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5fZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZShDc3NDbGFzc2VzLlZpc2libGUsIHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nU2hvd09wZXJhdGlvbiA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nU2hvd09wZXJhdGlvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX2VsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoQ3NzQ2xhc3Nlcy5WaXNpYmxlLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1JlZnJlc2hRdWV1ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNSZWZyZXNoUXVldWVkID0gdHJ1ZTtcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoTm93KCk7XG5cdFx0XHR0aGlzLl9pc1JlZnJlc2hRdWV1ZWQgPSBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hOb3coKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX2NvbW1hbmREZXRlY3Rpb24uZ2V0Q29tbWFuZEZvckxpbmUodGhpcy5feHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUudmlld3BvcnRZKTtcblxuXHRcdC8vIFRoZSBjb21tYW5kIGZyb20gdmlld3BvcnRZICsgMSBpcyB1c2VkIGJlY2F1c2UgdGhpcyBvbmUgd2lsbCBub3QgYmUgb2JzY3VyZWQgYnkgc3RpY2t5XG5cdFx0Ly8gc2Nyb2xsLlxuXHRcdHRoaXMuX2N1cnJlbnRTdGlja3lDb21tYW5kID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gTm8gY29tbWFuZCBvciBpZ25vcmVkIGNvbW1hbmRcblx0XHRpZiAoIWNvbW1hbmQgfHwgdGhpcy5faXNJZ25vcmVkQ29tbWFuZChjb21tYW5kKSkge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGFydGlhbCBjb21tYW5kXG5cdFx0aWYgKCFpc0Z1bGxUZXJtaW5hbENvbW1hbmQoY29tbWFuZCkpIHtcblx0XHRcdGNvbnN0IHBhcnRpYWxDb21tYW5kID0gdGhpcy5fY29tbWFuZERldGVjdGlvbi5jdXJyZW50Q29tbWFuZDtcblx0XHRcdGlmIChwYXJ0aWFsQ29tbWFuZD8uY29tbWFuZFN0YXJ0TWFya2VyICYmIHBhcnRpYWxDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDb250ZW50KHBhcnRpYWxDb21tYW5kLCBwYXJ0aWFsQ29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgbWFya2VyIGRvZXNuJ3QgZXhpc3Qgb3IgaXQgd2FzIHRyaW1tZWQgZnJvbSBzY3JvbGxiYWNrXG5cdFx0Y29uc3QgbWFya2VyID0gY29tbWFuZC5tYXJrZXI7XG5cdFx0aWYgKCFtYXJrZXIgfHwgbWFya2VyLmxpbmUgPT09IC0xKSB7XG5cdFx0XHQvLyBUT0RPOiBJdCB3b3VsZCBiZSBuaWNlIGlmIHdlIGtlcHQgdGhlIGNhY2hlZCBjb21tYW5kIGFyb3VuZCBldmVuIGlmIGl0IHdhcyB0cmltbWVkXG5cdFx0XHQvLyBmcm9tIHNjcm9sbGJhY2tcblx0XHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUNvbnRlbnQoY29tbWFuZCwgbWFya2VyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRlbnQoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB8IElDdXJyZW50UGFydGlhbENvbW1hbmQsIHN0YXJ0TWFya2VyOiBJTWFya2VyKSB7XG5cdFx0Y29uc3QgeHRlcm0gPSB0aGlzLl94dGVybS5yYXc7XG5cdFx0aWYgKCF4dGVybS5lbGVtZW50Py5wYXJlbnRFbGVtZW50IHx8ICF0aGlzLl9zdGlja3lTY3JvbGxPdmVybGF5IHx8ICF0aGlzLl9zZXJpYWxpemVBZGRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgc3RpY2t5IHNjcm9sbCBpZiB0aGUgcHJvbXB0IGhhcyBiZWVuIHRyaW1tZWQgZnJvbSB0aGUgYnVmZmVyXG5cdFx0aWYgKGNvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXI/LmxpbmUgPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXRlcm1pbmUgc3RpY2t5IHNjcm9sbCBsaW5lIGNvdW50XG5cdFx0Y29uc3QgYnVmZmVyID0geHRlcm0uYnVmZmVyLmFjdGl2ZTtcblx0XHRjb25zdCBwcm9tcHRSb3dDb3VudCA9IGNvbW1hbmQuZ2V0UHJvbXB0Um93Q291bnQoKTtcblx0XHRjb25zdCBjb21tYW5kUm93Q291bnQgPSBjb21tYW5kLmdldENvbW1hbmRSb3dDb3VudCgpO1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbExpbmVTdGFydCA9IHN0YXJ0TWFya2VyLmxpbmUgLSAocHJvbXB0Um93Q291bnQgLSAxKTtcblxuXHRcdC8vIENhbGN1bGF0ZSB0aGUgcm93IG9mZnNldCwgdGhpcyBpcyB0aGUgbnVtYmVyIG9mIHJvd3MgdGhhdCB3aWxsIGJlIGNsaXBwZWQgZnJvbSB0aGUgdG9wXG5cdFx0Ly8gb2YgdGhlIHN0aWNreSBvdmVybGF5IGJlY2F1c2Ugd2UgZG8gbm90IHdhbnQgdG8gc2hvdyBhbnkgY29udGVudCBhYm92ZSB0aGUgYm91bmRzIG9mIHRoZVxuXHRcdC8vIG9yaWdpbmFsIHRlcm1pbmFsLiBUaGlzIGlzIGRvbmUgYmVjYXVzZSBpdCBzZWVtcyBsaWtlIHNjcm9sbGluZyBmbGlja2VycyBtb3JlIHdoZW4gYVxuXHRcdC8vIHBhcnRpYWwgbGluZSBjYW4gYmUgZHJhd24gb24gdGhlIHRvcC5cblx0XHRjb25zdCBpc1BhcnRpYWxDb21tYW5kID0gIWlzRnVsbFRlcm1pbmFsQ29tbWFuZChjb21tYW5kKTtcblx0XHRjb25zdCByb3dPZmZzZXQgPSAhaXNQYXJ0aWFsQ29tbWFuZCAmJiBjb21tYW5kLmVuZE1hcmtlciA/IE1hdGgubWF4KGJ1ZmZlci52aWV3cG9ydFkgLSBjb21tYW5kLmVuZE1hcmtlci5saW5lICsgMSwgMCkgOiAwO1xuXHRcdGNvbnN0IG1heExpbmVDb3VudCA9IE1hdGgubWluKHRoaXMuX3Jhd01heExpbmVDb3VudCwgTWF0aC5mbG9vcih4dGVybS5yb3dzICogQ29uc3RhbnRzLlN0aWNreVNjcm9sbFBlcmNlbnRhZ2VDYXApKTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxMaW5lQ291bnQgPSBNYXRoLm1pbihwcm9tcHRSb3dDb3VudCArIGNvbW1hbmRSb3dDb3VudCAtIDEsIG1heExpbmVDb3VudCkgLSByb3dPZmZzZXQ7XG5cdFx0Y29uc3QgaXNUcnVuY2F0ZWQgPSBzdGlja3lTY3JvbGxMaW5lQ291bnQgPCBwcm9tcHRSb3dDb3VudCArIGNvbW1hbmRSb3dDb3VudCAtIDE7XG5cblx0XHQvLyBIaWRlIHN0aWNreSBzY3JvbGwgaWYgaXQncyBjdXJyZW50bHkgb24gYSBsaW5lIHRoYXQgY29udGFpbnMgaXRcblx0XHRpZiAoYnVmZmVyLnZpZXdwb3J0WSA8PSBzdGlja3lTY3JvbGxMaW5lU3RhcnQpIHtcblx0XHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgc3RpY2t5IHNjcm9sbCBmb3IgdGhlIHBhcnRpYWwgY29tbWFuZCBpZiBpdCBsb29rcyBsaWtlIHRoZXJlIGlzIGEgcGFnZXIgbGlrZSBgbGVzc2Bcblx0XHQvLyBvciBgZ2l0IGxvZ2AgYWN0aXZlLiBUaGlzIGlzIGRvbmUgYnkgY2hlY2tpbmcgaWYgdGhlIGJvdHRvbSBsZWZ0IGNlbGwgY29udGFpbnMgdGhlIDpcblx0XHQvLyBjaGFyYWN0ZXIgYW5kIHRoZSBjdXJzb3IgaXMgaW1tZWRpYXRlbHkgdG8gaXRzIHJpZ2h0LiBUaGlzIGltcHJvdmVzIHRoZSBiZWhhdmlvciBvZiBhXG5cdFx0Ly8gY29tbW9uIGNhc2Ugd2hlcmUgdGhlIHRvcCBvZiB0aGUgdGV4dCBiZWluZyB2aWV3cG9ydCB3b3VsZCBvdGhlcndpc2UgYmUgb2JzY3VyZWQuXG5cdFx0aWYgKGlzUGFydGlhbENvbW1hbmQgJiYgYnVmZmVyLnZpZXdwb3J0WSA9PT0gYnVmZmVyLmJhc2VZICYmIGJ1ZmZlci5jdXJzb3JZID09PSB4dGVybS5yb3dzIC0gMSkge1xuXHRcdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGJ1ZmZlci5iYXNlWSArIHh0ZXJtLnJvd3MgLSAxKTtcblx0XHRcdGlmIChcblx0XHRcdFx0KGJ1ZmZlci5jdXJzb3JYID09PSAxICYmIGxpbmVTdGFydHNXaXRoKGxpbmUsICc6JykpIHx8XG5cdFx0XHRcdChidWZmZXIuY3Vyc29yWCA9PT0gNSAmJiBsaW5lU3RhcnRzV2l0aChsaW5lLCAnKEVORCknKSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgbGluZSBjb250ZW50IG9mIHRoZSBjb21tYW5kIGZyb20gdGhlIHRlcm1pbmFsXG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX3NlcmlhbGl6ZUFkZG9uLnNlcmlhbGl6ZSh7XG5cdFx0XHRyYW5nZToge1xuXHRcdFx0XHRzdGFydDogc3RpY2t5U2Nyb2xsTGluZVN0YXJ0ICsgcm93T2Zmc2V0LFxuXHRcdFx0XHRlbmQ6IHN0aWNreVNjcm9sbExpbmVTdGFydCArIHJvd09mZnNldCArIE1hdGgubWF4KHN0aWNreVNjcm9sbExpbmVDb3VudCAtIDEsIDApXG5cdFx0XHR9XG5cdFx0fSkgKyAoaXNUcnVuY2F0ZWQgPyAnXFx4MWJbMG0gXHUyMDI2JyA6ICcnKTtcblxuXHRcdC8vIElmIGEgcGFydGlhbCBjb21tYW5kJ3Mgc3RpY2t5IHNjcm9sbCB3b3VsZCBzaG93IG5vdGhpbmcsIGp1c3QgaGlkZSBpdC4gVGhpcyBpcyBhbm90aGVyXG5cdFx0Ly8gZWRnZSBjYXNlIHdoZW4gdXNpbmcgYSBwYWdlciBvciBpbnRlcmFjdGl2ZSBlZGl0b3IuXG5cdFx0aWYgKGlzUGFydGlhbENvbW1hbmQgJiYgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKGNvbnRlbnQpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV3JpdGUgY29udGVudCBpZiBpdCBkaWZmZXJzXG5cdFx0aWYgKFxuXHRcdFx0Y29udGVudCAmJiB0aGlzLl9jdXJyZW50Q29udGVudCAhPT0gY29udGVudCB8fFxuXHRcdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5jb2xzICE9PSB4dGVybS5jb2xzIHx8XG5cdFx0XHR0aGlzLl9zdGlja3lTY3JvbGxPdmVybGF5LnJvd3MgIT09IHN0aWNreVNjcm9sbExpbmVDb3VudFxuXHRcdCkge1xuXHRcdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5yZXNpemUodGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5jb2xzLCBzdGlja3lTY3JvbGxMaW5lQ291bnQpO1xuXHRcdFx0Ly8gQ2xlYXIgYXR0cnMsIHJlc2V0IGN1cnNvciBwb3NpdGlvbiwgY2xlYXIgcmlnaHRcblx0XHRcdHRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkud3JpdGUoJ1xceDFiWzBtXFx4MWJbSFxceDFiWzJKJyk7XG5cdFx0XHR0aGlzLl9zdGlja3lTY3JvbGxPdmVybGF5LndyaXRlKGNvbnRlbnQpO1xuXHRcdFx0dGhpcy5fY3VycmVudENvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0Ly8gREVCVUc6IExvZyB0byBzaG93IHRoZSBjb21tYW5kIGxpbmUgd2Uga25vd1xuXHRcdFx0Ly8gdGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS53cml0ZShgIFske2NvbW1hbmQ/LmNvbW1hbmR9XWApO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50U3RpY2t5Q29tbWFuZCA9IGNvbW1hbmQ7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKHRydWUpO1xuXG5cdFx0XHQvLyBQb3NpdGlvbiB0aGUgc3RpY2t5IHNjcm9sbCBzdWNoIHRoYXQgaXQgbmV2ZXIgb3ZlcmxhcHMgdGhlIHByb21wdC9vdXRwdXQgb2YgdGhlXG5cdFx0XHQvLyBmb2xsb3dpbmcgY29tbWFuZC4gVGhpcyBtdXN0IGhhcHBlbiBhZnRlciBzZXRWaXNpYmxlIHRvIGVuc3VyZSB0aGUgZWxlbWVudCBpc1xuXHRcdFx0Ly8gaW5pdGlhbGl6ZWQuXG5cdFx0XHRpZiAodGhpcy5fZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCB0ZXJtQm94ID0geHRlcm0uZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0Ly8gT25seSB0cnkgcmVwb3NpdGlvbiBpZiB0aGUgZWxlbWVudCBpcyB2aXNpYmxlLCBpZiBub3QgYSByZWZyZXNoIHdpbGwgb2NjdXIgd2hlblxuXHRcdFx0XHQvLyBpdCBiZWNvbWVzIHZpc2libGVcblx0XHRcdFx0aWYgKHRlcm1Cb3guaGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHJvd0hlaWdodCA9IHRlcm1Cb3guaGVpZ2h0IC8geHRlcm0ucm93cztcblx0XHRcdFx0XHRjb25zdCBvdmVybGF5SGVpZ2h0ID0gc3RpY2t5U2Nyb2xsTGluZUNvdW50ICogcm93SGVpZ2h0O1xuXG5cdFx0XHRcdFx0Ly8gQWRqdXN0IHN0aWNreSBzY3JvbGwgY29udGVudCBpZiBpdCB3b3VsZCBiZWxvdyB0aGUgZW5kIG9mIHRoZSBjb21tYW5kLCBvYnNjdXJpbmcgdGhlXG5cdFx0XHRcdFx0Ly8gZm9sbG93aW5nIGNvbW1hbmQuXG5cdFx0XHRcdFx0bGV0IGVuZE1hcmtlck9mZnNldCA9IDA7XG5cdFx0XHRcdFx0aWYgKCFpc1BhcnRpYWxDb21tYW5kICYmIGNvbW1hbmQuZW5kTWFya2VyICYmIGNvbW1hbmQuZW5kTWFya2VyLmxpbmUgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXN0TGluZSA9IE1hdGgubWluKGNvbW1hbmQuZW5kTWFya2VyLmxpbmUsIGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZKTtcblx0XHRcdFx0XHRcdGlmIChidWZmZXIudmlld3BvcnRZICsgc3RpY2t5U2Nyb2xsTGluZUNvdW50ID4gbGFzdExpbmUpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlmZiA9IGJ1ZmZlci52aWV3cG9ydFkgKyBzdGlja3lTY3JvbGxMaW5lQ291bnQgLSBsYXN0TGluZTtcblx0XHRcdFx0XHRcdFx0ZW5kTWFya2VyT2Zmc2V0ID0gZGlmZiAqIHJvd0hlaWdodDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmJvdHRvbSA9IGAke3Rlcm1Cb3guaGVpZ2h0IC0gb3ZlcmxheUhlaWdodCArIDEgKyBlbmRNYXJrZXJPZmZzZXR9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUVsZW1lbnQoKSB7XG5cdFx0aWYgKFxuXHRcdFx0Ly8gVGhlIGVsZW1lbnQgaXMgYWxyZWFkeSBjcmVhdGVkXG5cdFx0XHR0aGlzLl9lbGVtZW50IHx8XG5cdFx0XHQvLyBJZiB0aGUgb3ZlcmxheSBpcyB5ZXQgdG8gYmUgY3JlYXRlZCwgdGhlIHRlcm1pbmFsIGNhbm5vdCBiZSBvcGVuZWQgc28gZGVmZXIgdG8gbmV4dCBjYWxsXG5cdFx0XHQhdGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheSB8fFxuXHRcdFx0Ly8gVGhlIHh0ZXJtLmpzIGluc3RhbmNlIGlzbid0IG9wZW5lZCB5ZXRcblx0XHRcdCF0aGlzLl94dGVybT8ucmF3LmVsZW1lbnQ/LnBhcmVudEVsZW1lbnRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVybGF5ID0gdGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheTtcblxuXHRcdGNvbnN0IGhvdmVyT3ZlcmxheSA9ICQoJy5ob3Zlci1vdmVybGF5Jyk7XG5cdFx0dGhpcy5fZWxlbWVudCA9ICQoJy50ZXJtaW5hbC1zdGlja3ktc2Nyb2xsJywgdW5kZWZpbmVkLCBob3Zlck92ZXJsYXkpO1xuXHRcdHRoaXMuX3h0ZXJtLnJhdy5lbGVtZW50LnBhcmVudEVsZW1lbnQuYXBwZW5kKHRoaXMuX2VsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9lbGVtZW50Py5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gRmlsbCB0b29sdGlwXG5cdFx0bGV0IGhvdmVyVGl0bGUgPSBsb2NhbGl6ZSgnc3RpY2t5U2Nyb2xsSG92ZXJUaXRsZScsICdOYXZpZ2F0ZSB0byBDb21tYW5kJyk7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9QcmV2aW91c0NvbW1hbmRLZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb1ByZXZpb3VzQ29tbWFuZCk7XG5cdFx0aWYgKHNjcm9sbFRvUHJldmlvdXNDb21tYW5kS2V5YmluZGluZykge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBzY3JvbGxUb1ByZXZpb3VzQ29tbWFuZEtleWJpbmRpbmcuZ2V0TGFiZWwoKTtcblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRob3ZlclRpdGxlICs9ICdcXG4nICsgbG9jYWxpemUoJ2xhYmVsV2l0aEtleWJpbmRpbmcnLCBcInswfSAoezF9KVwiLCB0ZXJtaW5hbFN0cmluZ3Muc2Nyb2xsVG9QcmV2aW91c0NvbW1hbmQudmFsdWUsIGxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2Nyb2xsVG9OZXh0Q29tbWFuZEtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvTmV4dENvbW1hbmQpO1xuXHRcdGlmIChzY3JvbGxUb05leHRDb21tYW5kS2V5YmluZGluZykge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBzY3JvbGxUb05leHRDb21tYW5kS2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdGhvdmVyVGl0bGUgKz0gJ1xcbicgKyBsb2NhbGl6ZSgnbGFiZWxXaXRoS2V5YmluZGluZycsIFwiezB9ICh7MX0pXCIsIHRlcm1pbmFsU3RyaW5ncy5zY3JvbGxUb05leHRDb21tYW5kLnZhbHVlLCBsYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGhvdmVyT3ZlcmxheS50aXRsZSA9IGhvdmVyVGl0bGU7XG5cblx0XHRpbnRlcmZhY2UgWHRlcm1XaXRoQ29yZSBleHRlbmRzIFhUZXJtVGVybWluYWwge1xuXHRcdFx0X2NvcmU6IElYdGVybUNvcmU7XG5cdFx0fVxuXHRcdGNvbnN0IHNjcm9sbEJhcldpZHRoID0gKHRoaXMuX3h0ZXJtLnJhdyBhcyBYdGVybVdpdGhDb3JlKS5fY29yZS52aWV3cG9ydD8uc2Nyb2xsQmFyV2lkdGg7XG5cdFx0aWYgKHNjcm9sbEJhcldpZHRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUucmlnaHQgPSBgJHtzY3JvbGxCYXJXaWR0aH1weGA7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5vcGVuKHRoaXMuX2VsZW1lbnQpO1xuXG5cdFx0Ly8gUHJldmVudCB0YWIga2V5IGZyb20gYmVpbmcgaGFuZGxlZCBieSB0aGUgeHRlcm0gb3ZlcmxheSB0byBhbGxvdyBuYXR1cmFsIHRhYiBuYXZpZ2F0aW9uXG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5hdHRhY2hDdXN0b21LZXlFdmVudEhhbmRsZXIoKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2V5ID09PSAnVGFiJykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ2xpZ2F0dXJlcycpLnRoZW4oTGlnYXR1cmVzQWRkb24gPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgIXRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGlnYXR1cmVzQWRkb24gPSBuZXcgTGlnYXR1cmVzQWRkb24oKTtcblx0XHRcdHRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkubG9hZEFkZG9uKHRoaXMuX2xpZ2F0dXJlc0FkZG9uKTtcblx0XHR9KTtcblxuXHRcdC8vIFNjcm9sbCB0byB0aGUgY29tbWFuZCBvbiBjbGlja1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyT3ZlcmxheSwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3h0ZXJtICYmIHRoaXMuX2N1cnJlbnRTdGlja3lDb21tYW5kKSB7XG5cdFx0XHRcdHRoaXMuX3h0ZXJtLm1hcmtUcmFja2VyLnJldmVhbENvbW1hbmQodGhpcy5fY3VycmVudFN0aWNreUNvbW1hbmQpO1xuXHRcdFx0XHR0aGlzLl9pbnN0YW5jZS5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEZvcndhcmQgbW91c2UgZXZlbnRzIHRvIHRoZSB0ZXJtaW5hbFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyT3ZlcmxheSwgJ3doZWVsJywgZSA9PiB0aGlzLl94dGVybT8ucmF3LmVsZW1lbnQ/LmRpc3BhdGNoRXZlbnQobmV3IFdoZWVsRXZlbnQoZS50eXBlLCBlKSkpKTtcblxuXHRcdC8vIENvbnRleHQgbWVudSAtIHN0b3AgcHJvcGFnYXRpb24gb24gbW91c2Vkb3duIGJlY2F1c2UgcmlnaHRDbGlja0JlaGF2aW9yIGxpc3RlbnMgb25cblx0XHQvLyBtb3VzZWRvd24sIG5vdCBjb250ZXh0bWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3Zlck92ZXJsYXksICdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3Zlck92ZXJsYXksICdjb250ZXh0bWVudScsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdG9wZW5Db250ZXh0TWVudShnZXRXaW5kb3coaG92ZXJPdmVybGF5KSwgZSwgdGhpcy5faW5zdGFuY2UsIHRoaXMuX2NvbnRleHRNZW51LCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEluc3RlYWQgb2YganVnZ2xpbmcgZGVjb3JhdGlvbnMgZm9yIGhvdmVyIHN0eWxlcywgc3dhcCBvdXQgdGhlIHRoZW1lIHRvIGluZGljYXRlIHRoZVxuXHRcdC8vIGhvdmVyIHN0YXRlLiBUaGlzIGNvbWVzIHdpdGggdGhlIGJlbmVmaXQgb3ZlciBvdGhlciBtZXRob2RzIG9mIHdvcmtpbmcgd2VsbCB3aXRoIHNwZWNpYWxcblx0XHQvLyBkZWNvcmF0aXZlIGNoYXJhY3RlcnMgbGlrZSBwb3dlcmxpbmUgc3ltYm9scy5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihob3Zlck92ZXJsYXksICdtb3VzZW92ZXInLCAoKSA9PiBvdmVybGF5Lm9wdGlvbnMudGhlbWUgPSB0aGlzLl9nZXRUaGVtZSh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyT3ZlcmxheSwgJ21vdXNlbGVhdmUnLCAoKSA9PiBvdmVybGF5Lm9wdGlvbnMudGhlbWUgPSB0aGlzLl9nZXRUaGVtZShmYWxzZSkpKTtcblx0fVxuXG5cdEB0aHJvdHRsZSgwKVxuXHRwcml2YXRlIF9zeW5jT3B0aW9ucygpIHtcblx0XHRpZiAoIXRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5yZXNpemUodGhpcy5feHRlcm0ucmF3LmNvbHMsIHRoaXMuX3N0aWNreVNjcm9sbE92ZXJsYXkucm93cyk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsT3ZlcmxheS5vcHRpb25zID0gdGhpcy5fZ2V0T3B0aW9ucygpO1xuXHRcdHRoaXMuX3JlZnJlc2hHcHVBY2NlbGVyYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9wdGlvbnMoKTogSVRlcm1pbmFsT3B0aW9ucyB7XG5cdFx0Y29uc3QgbyA9IHRoaXMuX3h0ZXJtLnJhdy5vcHRpb25zO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXJzb3JJbmFjdGl2ZVN0eWxlOiAnbm9uZScsXG5cdFx0XHRzY3JvbGxiYWNrOiAwLFxuXHRcdFx0bG9nTGV2ZWw6ICdvZmYnLFxuXG5cdFx0XHR0aGVtZTogdGhpcy5fZ2V0VGhlbWUoZmFsc2UpLFxuXHRcdFx0ZG9jdW1lbnRPdmVycmlkZTogby5kb2N1bWVudE92ZXJyaWRlLFxuXHRcdFx0Zm9udEZhbWlseTogby5mb250RmFtaWx5LFxuXHRcdFx0Zm9udFdlaWdodDogby5mb250V2VpZ2h0LFxuXHRcdFx0Zm9udFdlaWdodEJvbGQ6IG8uZm9udFdlaWdodEJvbGQsXG5cdFx0XHRmb250U2l6ZTogby5mb250U2l6ZSxcblx0XHRcdGxldHRlclNwYWNpbmc6IG8ubGV0dGVyU3BhY2luZyxcblx0XHRcdGxpbmVIZWlnaHQ6IG8ubGluZUhlaWdodCxcblx0XHRcdGRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzOiBvLmRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzLFxuXHRcdFx0bWluaW11bUNvbnRyYXN0UmF0aW86IG8ubWluaW11bUNvbnRyYXN0UmF0aW8sXG5cdFx0XHR0YWJTdG9wV2lkdGg6IG8udGFiU3RvcFdpZHRoLFxuXHRcdH07XG5cdH1cblxuXHRAdGhyb3R0bGUoMClcblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEdwdUFjY2VsZXJhdGlvbigpIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkTG9hZFdlYmdsKCkgJiYgKCF0aGlzLl93ZWJnbEFkZG9uLnZhbHVlIHx8IHRoaXMuX3dlYmdsQWRkb25DdXN0b21HbHlwaHMgIT09IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmN1c3RvbUdseXBocykpIHtcblx0XHRcdGNvbnN0IFdlYmdsQWRkb24gPSBhd2FpdCB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCd3ZWJnbCcpO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRGlzcG9zZSBvZiBleGlzdGluZyBhZGRvbiBiZWZvcmUgY3JlYXRpbmcgYSBuZXcgb25lIHRvIGF2b2lkIGxlYWtpbmcgV2ViR0wgY29udGV4dHNcblx0XHRcdHRoaXMuX3dlYmdsQWRkb24udmFsdWUgPSBuZXcgV2ViZ2xBZGRvbih7XG5cdFx0XHRcdGN1c3RvbUdseXBoczogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY3VzdG9tR2x5cGhzXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3dlYmdsQWRkb25DdXN0b21HbHlwaHMgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jdXN0b21HbHlwaHM7XG5cdFx0XHR0aGlzLl9zdGlja3lTY3JvbGxPdmVybGF5Py5sb2FkQWRkb24odGhpcy5fd2ViZ2xBZGRvbi52YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fc2hvdWxkTG9hZFdlYmdsKCkgJiYgdGhpcy5fd2ViZ2xBZGRvbi52YWx1ZSkge1xuXHRcdFx0dGhpcy5fd2ViZ2xBZGRvbi5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZExvYWRXZWJnbCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZ3B1QWNjZWxlcmF0aW9uID09PSAnYXV0bycgfHwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZ3B1QWNjZWxlcmF0aW9uID09PSAnb24nO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGhlbWUoaXNIb3ZlcmluZzogYm9vbGVhbik6IElUaGVtZSB7XG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi50aGlzLl94dGVybS5nZXRYdGVybVRoZW1lKCksXG5cdFx0XHRiYWNrZ3JvdW5kOiBpc0hvdmVyaW5nXG5cdFx0XHRcdD8gdGhlbWUuZ2V0Q29sb3IodGVybWluYWxTdGlja3lTY3JvbGxIb3ZlckJhY2tncm91bmQpPy50b1N0cmluZygpID8/IHRoaXMuX3h0ZXJtQ29sb3JQcm92aWRlci5nZXRCYWNrZ3JvdW5kQ29sb3IodGhlbWUpPy50b1N0cmluZygpXG5cdFx0XHRcdDogdGhlbWUuZ2V0Q29sb3IodGVybWluYWxTdGlja3lTY3JvbGxCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSA/PyB0aGlzLl94dGVybUNvbG9yUHJvdmlkZXIuZ2V0QmFja2dyb3VuZENvbG9yKHRoZW1lKT8udG9TdHJpbmcoKSxcblx0XHRcdHNlbGVjdGlvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdHNlbGVjdGlvbkluYWN0aXZlQmFja2dyb3VuZDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSWdub3JlZENvbW1hbmQoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB8IElDdXJyZW50UGFydGlhbENvbW1hbmQpOiBib29sZWFuIHtcblx0XHRpZiAoIWNvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB0cmltbWVkQ29tbWFuZCA9IGNvbW1hbmQuY29tbWFuZC50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gdGhpcy5faWdub3JlZENvbW1hbmRzLnNvbWUoY21kID0+IGNtZC50b0xvd2VyQ2FzZSgpID09PSB0cmltbWVkQ29tbWFuZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbGluZVN0YXJ0c1dpdGgobGluZTogSUJ1ZmZlckxpbmUgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIWxpbmUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGxpbmUuZ2V0Q2VsbChpKT8uZ2V0Q2hhcnMoKSAhPT0gdGV4dFtpXSkge1xuXHRcdFx0cmV0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O0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBNEI7QUFDbkMsV0FBTyxLQUFLLDhCQUE4QixPQUFPLG9CQUFvQixVQUFVLEtBQUssOEJBQThCLE9BQU8sb0JBQW9CO0FBQUEsRUFDOUk7QUFBQSxFQUVRLFVBQVUsWUFBNkI7QUFDOUMsVUFBTSxRQUFRLEtBQUssY0FBYyxjQUFjO0FBQy9DLFdBQU87QUFBQSxNQUNOLEdBQUcsS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUM3QixZQUFZLGFBQ1QsTUFBTSxTQUFTLG1DQUFtQyxHQUFHLFNBQVMsS0FBSyxLQUFLLG9CQUFvQixtQkFBbUIsS0FBSyxHQUFHLFNBQVMsSUFDaEksTUFBTSxTQUFTLDhCQUE4QixHQUFHLFNBQVMsS0FBSyxLQUFLLG9CQUFvQixtQkFBbUIsS0FBSyxHQUFHLFNBQVM7QUFBQSxNQUM5SCxxQkFBcUI7QUFBQSxNQUNyQiw2QkFBNkI7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixTQUE2RDtBQUN0RixRQUFJLENBQUMsUUFBUSxTQUFTO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxpQkFBaUIsUUFBUSxRQUFRLEtBQUssRUFBRSxZQUFZO0FBQzFELFdBQU8sS0FBSyxpQkFBaUIsS0FBSyxTQUFPLElBQUksWUFBWSxNQUFNLGNBQWM7QUFBQSxFQUM5RTtBQUNEO0FBbFZTO0FBQUEsRUFEUCxTQUFTLEdBQUc7QUFBQSxHQTdKRCw0QkE4Sko7QUEyUUE7QUFBQSxFQURQLFNBQVMsQ0FBQztBQUFBLEdBeGFDLDRCQXlhSjtBQStCTTtBQUFBLEVBRGIsU0FBUyxDQUFDO0FBQUEsR0F2Y0MsNEJBd2NFO0FBeGNGLDhCQUFOO0FBQUEsRUE0Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxDVTtBQWtmYixTQUFTLGVBQWUsTUFBK0IsTUFBdUI7QUFDN0UsTUFBSSxDQUFDLE1BQU07QUFDVixXQUFPO0FBQUEsRUFDUjtBQUNBLFdBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUs7QUFDckMsUUFBSSxLQUFLLFFBQVEsQ0FBQyxHQUFHLFNBQVMsTUFBTSxLQUFLLENBQUMsR0FBRztBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIk92ZXJsYXlTdGF0ZSIsICJDc3NDbGFzc2VzIiwgIkNvbnN0YW50cyJdCn0K
