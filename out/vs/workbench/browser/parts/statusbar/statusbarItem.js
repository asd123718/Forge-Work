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
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isTooltipWithCommands, ShowTooltipCommand, StatusbarEntryKinds } from "../../../services/statusbar/browser/statusbar.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isThemeColor } from "../../../../editor/common/editorCommon.js";
import { addDisposableListener, EventType, hide, show, append, EventHelper, $ } from "../../../../base/browser/dom.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { renderIcon, renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { spinningLoading, syncing } from "../../../../platform/theme/common/iconRegistry.js";
import { isMarkdownString, markdownStringEqual } from "../../../../base/common/htmlContent.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
let StatusbarEntryItem = class extends Disposable {
  constructor(container, entry, hoverDelegate, commandService, hoverService, notificationService, telemetryService, themeService) {
    super();
    this.container = container;
    this.hoverDelegate = hoverDelegate;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.themeService = themeService;
    this.entry = void 0;
    this.foregroundListener = this._register(new MutableDisposable());
    this.backgroundListener = this._register(new MutableDisposable());
    this.commandMouseListener = this._register(new MutableDisposable());
    this.commandTouchListener = this._register(new MutableDisposable());
    this.commandKeyboardListener = this._register(new MutableDisposable());
    this.hover = void 0;
    this.labelContainer = $("a.statusbar-item-label", {
      role: "button",
      tabIndex: -1
      // allows screen readers to read title, but still prevents tab focus.
    });
    this._register(Gesture.addTarget(this.labelContainer));
    this.label = this._register(new StatusBarCodiconLabel(this.labelContainer));
    this.container.appendChild(this.labelContainer);
    this.beakContainer = $(".status-bar-item-beak-container");
    this.container.appendChild(this.beakContainer);
    if (entry.content) {
      this.container.appendChild(entry.content);
    }
    this.update(entry);
  }
  get name() {
    return assertReturnsDefined(this.entry).name;
  }
  get hasCommand() {
    return typeof this.entry?.command !== "undefined";
  }
  update(entry) {
    this.label.showProgress = entry.showProgress ?? false;
    if (!this.entry || entry.text !== this.entry.text) {
      this.label.text = entry.text;
      if (entry.text) {
        show(this.labelContainer);
      } else {
        hide(this.labelContainer);
      }
    }
    if (!this.entry || entry.ariaLabel !== this.entry.ariaLabel) {
      this.container.setAttribute("aria-label", entry.ariaLabel);
      this.labelContainer.setAttribute("aria-label", entry.ariaLabel);
    }
    if (!this.entry || entry.role !== this.entry.role) {
      this.labelContainer.setAttribute("role", entry.role || "button");
    }
    if (!this.entry || !this.isEqualTooltip(this.entry, entry)) {
      let hoverOptions;
      let hoverTooltip;
      if (isTooltipWithCommands(entry.tooltip)) {
        hoverTooltip = entry.tooltip.content;
        hoverOptions = {
          actions: entry.tooltip.commands.map((command) => ({
            commandId: command.id,
            label: command.title,
            run: () => this.executeCommand(command)
          }))
        };
      } else {
        hoverTooltip = entry.tooltip;
      }
      const hoverContents = isMarkdownString(hoverTooltip) ? { markdown: hoverTooltip, markdownNotSupportedFallback: void 0 } : hoverTooltip;
      if (this.hover) {
        this.hover.update(hoverContents, hoverOptions);
      } else {
        this.hover = this._register(this.hoverService.setupManagedHover(this.hoverDelegate, this.container, hoverContents, hoverOptions));
      }
    }
    if (!this.entry || entry.command !== this.entry.command) {
      this.commandMouseListener.clear();
      this.commandTouchListener.clear();
      this.commandKeyboardListener.clear();
      const command = entry.command;
      if (command && (command !== ShowTooltipCommand || this.hover)) {
        this.commandMouseListener.value = addDisposableListener(this.labelContainer, EventType.CLICK, () => this.executeCommand(command));
        this.commandTouchListener.value = addDisposableListener(this.labelContainer, TouchEventType.Tap, () => this.executeCommand(command));
        this.commandKeyboardListener.value = addDisposableListener(this.labelContainer, EventType.KEY_DOWN, (e) => {
          const event = new StandardKeyboardEvent(e);
          if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
            EventHelper.stop(e);
            this.executeCommand(command);
          } else if (event.equals(KeyCode.Escape) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
            EventHelper.stop(e);
            this.hover?.hide();
          }
        });
        this.labelContainer.classList.remove("disabled");
      } else {
        this.labelContainer.classList.add("disabled");
      }
    }
    if (!this.entry || entry.showBeak !== this.entry.showBeak) {
      if (entry.showBeak) {
        this.container.classList.add("has-beak");
      } else {
        this.container.classList.remove("has-beak");
      }
    }
    const hasBackgroundColor = !!entry.backgroundColor || entry.kind && entry.kind !== "standard";
    if (!this.entry || entry.kind !== this.entry.kind) {
      for (const kind of StatusbarEntryKinds) {
        this.container.classList.remove(`${kind}-kind`);
      }
      if (entry.kind && entry.kind !== "standard") {
        this.container.classList.add(`${entry.kind}-kind`);
      }
      this.container.classList.toggle("has-background-color", hasBackgroundColor);
    }
    if (!this.entry || entry.color !== this.entry.color) {
      this.applyColor(this.labelContainer, entry.color);
    }
    if (!this.entry || entry.backgroundColor !== this.entry.backgroundColor) {
      this.container.classList.toggle("has-background-color", hasBackgroundColor);
      this.applyColor(this.container, entry.backgroundColor, true);
    }
    this.entry = entry;
  }
  isEqualTooltip({ tooltip }, { tooltip: otherTooltip }) {
    if (tooltip === void 0) {
      return otherTooltip === void 0;
    }
    if (isMarkdownString(tooltip)) {
      return isMarkdownString(otherTooltip) && markdownStringEqual(tooltip, otherTooltip);
    }
    return tooltip === otherTooltip;
  }
  async executeCommand(command) {
    if (command === ShowTooltipCommand) {
      this.hover?.show(
        true
        /* focus */
      );
    } else {
      const id = typeof command === "string" ? command : command.id;
      const args = typeof command === "string" ? [] : command.arguments ?? [];
      this.telemetryService.publicLog2("workbenchActionExecuted", { id, from: "status bar" });
      try {
        await this.commandService.executeCommand(id, ...args);
      } catch (error) {
        this.notificationService.error(toErrorMessage(error));
      }
    }
  }
  applyColor(container, color, isBackground) {
    let colorResult = void 0;
    if (isBackground) {
      this.backgroundListener.clear();
    } else {
      this.foregroundListener.clear();
    }
    if (color) {
      if (isThemeColor(color)) {
        colorResult = this.themeService.getColorTheme().getColor(color.id)?.toString();
        const listener = this.themeService.onDidColorThemeChange((theme) => {
          const colorValue = theme.getColor(color.id)?.toString();
          if (isBackground) {
            container.style.backgroundColor = colorValue ?? "";
          } else {
            container.style.color = colorValue ?? "";
          }
        });
        if (isBackground) {
          this.backgroundListener.value = listener;
        } else {
          this.foregroundListener.value = listener;
        }
      } else {
        colorResult = color;
      }
    }
    if (isBackground) {
      container.style.backgroundColor = colorResult ?? "";
    } else {
      container.style.color = colorResult ?? "";
    }
  }
};
StatusbarEntryItem = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IThemeService)
], StatusbarEntryItem);
class StatusBarCodiconLabel extends SimpleIconLabel {
  constructor(container) {
    super(container);
    this.container = container;
    this.currentText = "";
    this.currentShowProgress = false;
  }
  set showProgress(showProgress) {
    if (this.currentShowProgress !== showProgress) {
      this.currentShowProgress = showProgress;
      if (showProgress) {
        this.progressCodicon = renderIcon(showProgress === "syncing" ? syncing : spinningLoading);
      }
      this.text = this.currentText;
    }
  }
  set text(text) {
    if (this.currentShowProgress && this.progressCodicon) {
      if (this.container.firstChild !== this.progressCodicon) {
        this.container.appendChild(this.progressCodicon);
      }
      for (const node of Array.from(this.container.childNodes)) {
        if (node !== this.progressCodicon) {
          node.remove();
        }
      }
      let textContent = text ?? "";
      if (textContent) {
        textContent = `\xA0${textContent}`;
      }
      append(this.container, ...renderLabelWithIcons(textContent));
    } else {
      super.text = text;
    }
  }
}
export {
  StatusbarEntryItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxzdGF0dXNiYXJcXHN0YXR1c2Jhckl0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTaW1wbGVJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL3NpbXBsZUljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIGlzVG9vbHRpcFdpdGhDb21tYW5kcywgU2hvd1Rvb2x0aXBDb21tYW5kLCBTdGF0dXNiYXJFbnRyeUtpbmRzLCBUb29sdGlwQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBoaWRlLCBzaG93LCBhcHBlbmQsIEV2ZW50SGVscGVyLCAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uLCByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBzcGlubmluZ0xvYWRpbmcsIHN5bmNpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcsIG1hcmtkb3duU3RyaW5nRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyLCBJTWFuYWdlZEhvdmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdGF0dXNiYXJFbnRyeUl0ZW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxhYmVsOiBTdGF0dXNCYXJDb2RpY29uTGFiZWw7XG5cblx0cHJpdmF0ZSBlbnRyeTogSVN0YXR1c2JhckVudHJ5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZm9yZWdyb3VuZExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhY2tncm91bmRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRNb3VzZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRUb3VjaExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRLZXlib2FyZExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgaG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbGFiZWxDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBiZWFrQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmVudHJ5KS5uYW1lO1xuXHR9XG5cblx0Z2V0IGhhc0NvbW1hbmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLmVudHJ5Py5jb21tYW5kICE9PSAndW5kZWZpbmVkJztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRlbnRyeTogSVN0YXR1c2JhckVudHJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIExhYmVsIENvbnRhaW5lclxuXHRcdHRoaXMubGFiZWxDb250YWluZXIgPSAkKCdhLnN0YXR1c2Jhci1pdGVtLWxhYmVsJywge1xuXHRcdFx0cm9sZTogJ2J1dHRvbicsXG5cdFx0XHR0YWJJbmRleDogLTEgLy8gYWxsb3dzIHNjcmVlbiByZWFkZXJzIHRvIHJlYWQgdGl0bGUsIGJ1dCBzdGlsbCBwcmV2ZW50cyB0YWIgZm9jdXMuXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQodGhpcy5sYWJlbENvbnRhaW5lcikpOyAvLyBlbmFibGUgdG91Y2hcblxuXHRcdC8vIExhYmVsICh3aXRoIHN1cHBvcnQgZm9yIHByb2dyZXNzKVxuXHRcdHRoaXMubGFiZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RhdHVzQmFyQ29kaWNvbkxhYmVsKHRoaXMubGFiZWxDb250YWluZXIpKTtcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmxhYmVsQ29udGFpbmVyKTtcblxuXHRcdC8vIEJlYWsgQ29udGFpbmVyXG5cdFx0dGhpcy5iZWFrQ29udGFpbmVyID0gJCgnLnN0YXR1cy1iYXItaXRlbS1iZWFrLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYmVha0NvbnRhaW5lcik7XG5cblx0XHRpZiAoZW50cnkuY29udGVudCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZW50cnkuY29udGVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGUoZW50cnkpO1xuXHR9XG5cblx0dXBkYXRlKGVudHJ5OiBJU3RhdHVzYmFyRW50cnkpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZTogUHJvZ3Jlc3Ncblx0XHR0aGlzLmxhYmVsLnNob3dQcm9ncmVzcyA9IGVudHJ5LnNob3dQcm9ncmVzcyA/PyBmYWxzZTtcblxuXHRcdC8vIFVwZGF0ZTogVGV4dFxuXHRcdGlmICghdGhpcy5lbnRyeSB8fCBlbnRyeS50ZXh0ICE9PSB0aGlzLmVudHJ5LnRleHQpIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dCA9IGVudHJ5LnRleHQ7XG5cblx0XHRcdGlmIChlbnRyeS50ZXh0KSB7XG5cdFx0XHRcdHNob3codGhpcy5sYWJlbENvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKHRoaXMubGFiZWxDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZTogQVJJQSBsYWJlbFxuXHRcdC8vXG5cdFx0Ly8gU2V0IHRoZSBhcmlhIGxhYmVsIG9uIGJvdGggZWxlbWVudHMgc28gc2NyZWVuIHJlYWRlcnMgd291bGQgcmVhZFxuXHRcdC8vIHRoZSBjb3JyZWN0IHRoaW5nIHdpdGhvdXQgZHVwbGljYXRpb24gIzk2MjEwXG5cblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkuYXJpYUxhYmVsICE9PSB0aGlzLmVudHJ5LmFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZW50cnkuYXJpYUxhYmVsKTtcblx0XHRcdHRoaXMubGFiZWxDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZW50cnkuYXJpYUxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkucm9sZSAhPT0gdGhpcy5lbnRyeS5yb2xlKSB7XG5cdFx0XHR0aGlzLmxhYmVsQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsIGVudHJ5LnJvbGUgfHwgJ2J1dHRvbicpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZTogSG92ZXJcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgIXRoaXMuaXNFcXVhbFRvb2x0aXAodGhpcy5lbnRyeSwgZW50cnkpKSB7XG5cdFx0XHRsZXQgaG92ZXJPcHRpb25zOiBJTWFuYWdlZEhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBob3ZlclRvb2x0aXA6IFRvb2x0aXBDb250ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzVG9vbHRpcFdpdGhDb21tYW5kcyhlbnRyeS50b29sdGlwKSkge1xuXHRcdFx0XHRob3ZlclRvb2x0aXAgPSBlbnRyeS50b29sdGlwLmNvbnRlbnQ7XG5cdFx0XHRcdGhvdmVyT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRhY3Rpb25zOiBlbnRyeS50b29sdGlwLmNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7XG5cdFx0XHRcdFx0XHRjb21tYW5kSWQ6IGNvbW1hbmQuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leGVjdXRlQ29tbWFuZChjb21tYW5kKVxuXHRcdFx0XHRcdH0pKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aG92ZXJUb29sdGlwID0gZW50cnkudG9vbHRpcDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaG92ZXJDb250ZW50cyA9IGlzTWFya2Rvd25TdHJpbmcoaG92ZXJUb29sdGlwKSA/IHsgbWFya2Rvd246IGhvdmVyVG9vbHRpcCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdW5kZWZpbmVkIH0gOiBob3ZlclRvb2x0aXA7XG5cdFx0XHRpZiAodGhpcy5ob3Zlcikge1xuXHRcdFx0XHR0aGlzLmhvdmVyLnVwZGF0ZShob3ZlckNvbnRlbnRzLCBob3Zlck9wdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMuaG92ZXJEZWxlZ2F0ZSwgdGhpcy5jb250YWluZXIsIGhvdmVyQ29udGVudHMsIGhvdmVyT3B0aW9ucykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZTogQ29tbWFuZFxuXHRcdGlmICghdGhpcy5lbnRyeSB8fCBlbnRyeS5jb21tYW5kICE9PSB0aGlzLmVudHJ5LmNvbW1hbmQpIHtcblx0XHRcdHRoaXMuY29tbWFuZE1vdXNlTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdHRoaXMuY29tbWFuZFRvdWNoTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdHRoaXMuY29tbWFuZEtleWJvYXJkTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGVudHJ5LmNvbW1hbmQ7XG5cdFx0XHRpZiAoY29tbWFuZCAmJiAoY29tbWFuZCAhPT0gU2hvd1Rvb2x0aXBDb21tYW5kIHx8IHRoaXMuaG92ZXIpIC8qIFwiU2hvdyBIb3ZlclwiIGlzIG9ubHkgdmFsaWQgd2hlbiB3ZSBoYXZlIGEgaG92ZXIgKi8pIHtcblx0XHRcdFx0dGhpcy5jb21tYW5kTW91c2VMaXN0ZW5lci52YWx1ZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxhYmVsQ29udGFpbmVyLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCkpO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRUb3VjaExpc3RlbmVyLnZhbHVlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMubGFiZWxDb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLlRhcCwgKCkgPT4gdGhpcy5leGVjdXRlQ29tbWFuZChjb21tYW5kKSk7XG5cdFx0XHRcdHRoaXMuY29tbWFuZEtleWJvYXJkTGlzdGVuZXIudmFsdWUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5sYWJlbENvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuaG92ZXI/LmhpZGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMubGFiZWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFiZWxDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGU6IEJlYWtcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkuc2hvd0JlYWsgIT09IHRoaXMuZW50cnkuc2hvd0JlYWspIHtcblx0XHRcdGlmIChlbnRyeS5zaG93QmVhaykge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoYXMtYmVhaycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWJlYWsnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBoYXNCYWNrZ3JvdW5kQ29sb3IgPSAhIWVudHJ5LmJhY2tncm91bmRDb2xvciB8fCAoZW50cnkua2luZCAmJiBlbnRyeS5raW5kICE9PSAnc3RhbmRhcmQnKTtcblxuXHRcdC8vIFVwZGF0ZTogS2luZFxuXHRcdGlmICghdGhpcy5lbnRyeSB8fCBlbnRyeS5raW5kICE9PSB0aGlzLmVudHJ5LmtpbmQpIHtcblx0XHRcdGZvciAoY29uc3Qga2luZCBvZiBTdGF0dXNiYXJFbnRyeUtpbmRzKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoYCR7a2luZH0ta2luZGApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW50cnkua2luZCAmJiBlbnRyeS5raW5kICE9PSAnc3RhbmRhcmQnKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYCR7ZW50cnkua2luZH0ta2luZGApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtYmFja2dyb3VuZC1jb2xvcicsIGhhc0JhY2tncm91bmRDb2xvcik7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlOiBGb3JlZ3JvdW5kXG5cdFx0aWYgKCF0aGlzLmVudHJ5IHx8IGVudHJ5LmNvbG9yICE9PSB0aGlzLmVudHJ5LmNvbG9yKSB7XG5cdFx0XHR0aGlzLmFwcGx5Q29sb3IodGhpcy5sYWJlbENvbnRhaW5lciwgZW50cnkuY29sb3IpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZTogQmFja2dyb3VuZFxuXHRcdGlmICghdGhpcy5lbnRyeSB8fCBlbnRyeS5iYWNrZ3JvdW5kQ29sb3IgIT09IHRoaXMuZW50cnkuYmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtYmFja2dyb3VuZC1jb2xvcicsIGhhc0JhY2tncm91bmRDb2xvcik7XG5cdFx0XHR0aGlzLmFwcGx5Q29sb3IodGhpcy5jb250YWluZXIsIGVudHJ5LmJhY2tncm91bmRDb2xvciwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgZm9yIG5leHQgcm91bmRcblx0XHR0aGlzLmVudHJ5ID0gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIGlzRXF1YWxUb29sdGlwKHsgdG9vbHRpcCB9OiBJU3RhdHVzYmFyRW50cnksIHsgdG9vbHRpcDogb3RoZXJUb29sdGlwIH06IElTdGF0dXNiYXJFbnRyeSkge1xuXHRcdGlmICh0b29sdGlwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBvdGhlclRvb2x0aXAgPT09IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaXNNYXJrZG93blN0cmluZyh0b29sdGlwKSkge1xuXHRcdFx0cmV0dXJuIGlzTWFya2Rvd25TdHJpbmcob3RoZXJUb29sdGlwKSAmJiBtYXJrZG93blN0cmluZ0VxdWFsKHRvb2x0aXAsIG90aGVyVG9vbHRpcCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvb2x0aXAgPT09IG90aGVyVG9vbHRpcDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhlY3V0ZUNvbW1hbmQoY29tbWFuZDogc3RyaW5nIHwgQ29tbWFuZCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQ3VzdG9tIGNvbW1hbmQgZnJvbSB1czogU2hvdyB0b29sdGlwXG5cdFx0aWYgKGNvbW1hbmQgPT09IFNob3dUb29sdGlwQ29tbWFuZCkge1xuXHRcdFx0dGhpcy5ob3Zlcj8uc2hvdyh0cnVlIC8qIGZvY3VzICovKTtcblx0XHR9XG5cblx0XHQvLyBBbnkgb3RoZXIgY29tbWFuZCBpcyBnb2luZyB0aHJvdWdoIGNvbW1hbmQgc2VydmljZVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgaWQgPSB0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgPyBjb21tYW5kIDogY29tbWFuZC5pZDtcblx0XHRcdGNvbnN0IGFyZ3MgPSB0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgPyBbXSA6IGNvbW1hbmQuYXJndW1lbnRzID8/IFtdO1xuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkLCBmcm9tOiAnc3RhdHVzIGJhcicgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGlkLCAuLi5hcmdzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlDb2xvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBjb2xvcjogc3RyaW5nIHwgVGhlbWVDb2xvciB8IHVuZGVmaW5lZCwgaXNCYWNrZ3JvdW5kPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBjb2xvclJlc3VsdDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzQmFja2dyb3VuZCkge1xuXHRcdFx0dGhpcy5iYWNrZ3JvdW5kTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mb3JlZ3JvdW5kTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdGlmIChpc1RoZW1lQ29sb3IoY29sb3IpKSB7XG5cdFx0XHRcdGNvbG9yUmVzdWx0ID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKGNvbG9yLmlkKT8udG9TdHJpbmcoKTtcblxuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGVtZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29sb3JWYWx1ZSA9IHRoZW1lLmdldENvbG9yKGNvbG9yLmlkKT8udG9TdHJpbmcoKTtcblxuXHRcdFx0XHRcdGlmIChpc0JhY2tncm91bmQpIHtcblx0XHRcdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBjb2xvclZhbHVlID8/ICcnO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb250YWluZXIuc3R5bGUuY29sb3IgPSBjb2xvclZhbHVlID8/ICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGlzQmFja2dyb3VuZCkge1xuXHRcdFx0XHRcdHRoaXMuYmFja2dyb3VuZExpc3RlbmVyLnZhbHVlID0gbGlzdGVuZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5mb3JlZ3JvdW5kTGlzdGVuZXIudmFsdWUgPSBsaXN0ZW5lcjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29sb3JSZXN1bHQgPSBjb2xvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29sb3JSZXN1bHQgPz8gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9IGNvbG9yUmVzdWx0ID8/ICcnO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTdGF0dXNCYXJDb2RpY29uTGFiZWwgZXh0ZW5kcyBTaW1wbGVJY29uTGFiZWwge1xuXG5cdHByaXZhdGUgcHJvZ3Jlc3NDb2RpY29uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGN1cnJlbnRUZXh0ID0gJyc7XG5cdHByaXZhdGUgY3VycmVudFNob3dQcm9ncmVzczogYm9vbGVhbiB8ICdsb2FkaW5nJyB8ICdzeW5jaW5nJyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudFxuXHQpIHtcblx0XHRzdXBlcihjb250YWluZXIpO1xuXHR9XG5cblx0c2V0IHNob3dQcm9ncmVzcyhzaG93UHJvZ3Jlc3M6IGJvb2xlYW4gfCAnbG9hZGluZycgfCAnc3luY2luZycpIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U2hvd1Byb2dyZXNzICE9PSBzaG93UHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuY3VycmVudFNob3dQcm9ncmVzcyA9IHNob3dQcm9ncmVzcztcblx0XHRcdGlmIChzaG93UHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0NvZGljb24gPSByZW5kZXJJY29uKHNob3dQcm9ncmVzcyA9PT0gJ3N5bmNpbmcnID8gc3luY2luZyA6IHNwaW5uaW5nTG9hZGluZyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRleHQgPSB0aGlzLmN1cnJlbnRUZXh0O1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldCB0ZXh0KHRleHQ6IHN0cmluZykge1xuXG5cdFx0Ly8gUHJvZ3Jlc3M6IGluc2VydCBwcm9ncmVzcyBjb2RpY29uIGFzIGZpcnN0IGVsZW1lbnQgYXMgbmVlZGVkXG5cdFx0Ly8gYnV0IGtlZXAgaXQgc3RhYmxlIHNvIHRoYXQgdGhlIGFuaW1hdGlvbiBkb2VzIG5vdCByZXNldFxuXHRcdGlmICh0aGlzLmN1cnJlbnRTaG93UHJvZ3Jlc3MgJiYgdGhpcy5wcm9ncmVzc0NvZGljb24pIHtcblxuXHRcdFx0Ly8gQXBwZW5kIGFzIG5lZWRlZFxuXHRcdFx0aWYgKHRoaXMuY29udGFpbmVyLmZpcnN0Q2hpbGQgIT09IHRoaXMucHJvZ3Jlc3NDb2RpY29uKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucHJvZ3Jlc3NDb2RpY29uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIG90aGVyc1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20odGhpcy5jb250YWluZXIuY2hpbGROb2RlcykpIHtcblx0XHRcdFx0aWYgKG5vZGUgIT09IHRoaXMucHJvZ3Jlc3NDb2RpY29uKSB7XG5cdFx0XHRcdFx0bm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBoYXZlIHRleHQgdG8gc2hvdywgYWRkIGEgc3BhY2UgdG8gc2VwYXJhdGUgZnJvbSBwcm9ncmVzc1xuXHRcdFx0bGV0IHRleHRDb250ZW50ID0gdGV4dCA/PyAnJztcblx0XHRcdGlmICh0ZXh0Q29udGVudCkge1xuXHRcdFx0XHR0ZXh0Q29udGVudCA9IGBcXHUwMEEwJHt0ZXh0Q29udGVudH1gOyAvLyBwcmVwZW5kIG5vbi1icmVha2luZyBzcGFjZVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBlbmQgbmV3IGVsZW1lbnRzXG5cdFx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKHRleHRDb250ZW50KSk7XG5cdFx0fVxuXG5cdFx0Ly8gTm8gUHJvZ3Jlc3M6IG5vIHNwZWNpYWwgaGFuZGxpbmdcblx0XHRlbHNlIHtcblx0XHRcdHN1cGVyLnRleHQgPSB0ZXh0O1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTBCLHVCQUF1QixvQkFBb0IsMkJBQTJD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
