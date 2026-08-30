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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
let AccessibilityStatus = class extends Disposable {
  constructor(configurationService, notificationService, accessibilityService, statusbarService, openerService) {
    super();
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.accessibilityService = accessibilityService;
    this.statusbarService = statusbarService;
    this.openerService = openerService;
    this.screenReaderNotification = null;
    this.promptedScreenReader = false;
    this.screenReaderModeElement = this._register(new MutableDisposable());
    this._register(CommandsRegistry.registerCommand({ id: "showEditorScreenReaderNotification", handler: () => this.showScreenReaderNotification() }));
    this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));
    this._register(this.configurationService.onDidChangeConfiguration((c) => {
      if (c.affectsConfiguration("editor.accessibilitySupport")) {
        this.onScreenReaderModeChange();
      }
    }));
  }
  showScreenReaderNotification() {
    this.screenReaderNotification = this.notificationService.prompt(
      Severity.Info,
      localize("screenReaderDetectedExplanation.question", "Screen reader usage detected. Do you want to enable {0} to optimize the editor for screen reader usage?", "editor.accessibilitySupport"),
      [
        {
          label: localize("screenReaderDetectedExplanation.answerYes", "Yes"),
          run: () => {
            this.configurationService.updateValue("editor.accessibilitySupport", "on", ConfigurationTarget.USER);
          }
        },
        {
          label: localize("screenReaderDetectedExplanation.answerNo", "No"),
          run: () => {
            this.configurationService.updateValue("editor.accessibilitySupport", "off", ConfigurationTarget.USER);
          }
        },
        {
          label: localize("screenReaderDetectedExplanation.answerLearnMore", "Learn More"),
          run: () => {
            this.openerService.open("https://code.visualstudio.com/docs/editor/accessibility#_screen-readers");
          }
        }
      ],
      {
        sticky: true,
        priority: NotificationPriority.URGENT
      }
    );
    Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
  }
  updateScreenReaderModeElement(visible) {
    if (visible) {
      if (!this.screenReaderModeElement.value) {
        const text = localize("screenReaderDetected", "Screen Reader Optimized");
        this.screenReaderModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.screenReaderMode", "Screen Reader Mode"),
          text,
          ariaLabel: text,
          command: "showEditorScreenReaderNotification",
          kind: "prominent",
          showInAllWindows: true
        }, "status.editor.screenReaderMode", StatusbarAlignment.RIGHT, 100.6);
      }
    } else {
      this.screenReaderModeElement.clear();
    }
  }
  onScreenReaderModeChange() {
    const screenReaderDetected = this.accessibilityService.isScreenReaderOptimized();
    if (screenReaderDetected) {
      const screenReaderConfiguration = this.configurationService.getValue("editor.accessibilitySupport");
      if (screenReaderConfiguration === "auto") {
        if (!this.promptedScreenReader) {
          this.promptedScreenReader = true;
          setTimeout(() => this.showScreenReaderNotification(), 100);
        }
      }
    }
    if (this.screenReaderNotification) {
      this.screenReaderNotification.close();
    }
    this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
  }
};
AccessibilityStatus.ID = "workbench.contrib.accessibilityStatus";
AccessibilityStatus = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IAccessibilityService),
  __decorateParam(3, IStatusbarService),
  __decorateParam(4, IOpenerService)
], AccessibilityStatus);
export {
  AccessibilityStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFjY2Vzc2liaWxpdHlcXGJyb3dzZXJcXGFjY2Vzc2liaWxpdHlTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uSGFuZGxlLCBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBY2Nlc3NpYmlsaXR5U3RhdHVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hY2Nlc3NpYmlsaXR5U3RhdHVzJztcblxuXHRwcml2YXRlIHNjcmVlblJlYWRlck5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbkhhbmRsZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHByb21wdGVkU2NyZWVuUmVhZGVyOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoeyBpZDogJ3Nob3dFZGl0b3JTY3JlZW5SZWFkZXJOb3RpZmljYXRpb24nLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnNob3dTY3JlZW5SZWFkZXJOb3RpZmljYXRpb24oKSB9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVNjcmVlblJlYWRlck1vZGVFbGVtZW50KHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy5vblNjcmVlblJlYWRlck1vZGVDaGFuZ2UoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYyA9PiB7XG5cdFx0XHRpZiAoYy5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JykpIHtcblx0XHRcdFx0dGhpcy5vblNjcmVlblJlYWRlck1vZGVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dTY3JlZW5SZWFkZXJOb3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JlZW5SZWFkZXJOb3RpZmljYXRpb24gPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdGxvY2FsaXplKCdzY3JlZW5SZWFkZXJEZXRlY3RlZEV4cGxhbmF0aW9uLnF1ZXN0aW9uJywgXCJTY3JlZW4gcmVhZGVyIHVzYWdlIGRldGVjdGVkLiBEbyB5b3Ugd2FudCB0byBlbmFibGUgezB9IHRvIG9wdGltaXplIHRoZSBlZGl0b3IgZm9yIHNjcmVlbiByZWFkZXIgdXNhZ2U/XCIsICdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2NyZWVuUmVhZGVyRGV0ZWN0ZWRFeHBsYW5hdGlvbi5hbnN3ZXJZZXMnLCBcIlllc1wiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JywgJ29uJywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NjcmVlblJlYWRlckRldGVjdGVkRXhwbGFuYXRpb24uYW5zd2VyTm8nLCBcIk5vXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnLCAnb2ZmJywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzY3JlZW5SZWFkZXJEZXRlY3RlZEV4cGxhbmF0aW9uLmFuc3dlckxlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2FjY2Vzc2liaWxpdHkjX3NjcmVlbi1yZWFkZXJzJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0e1xuXHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlRcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0RXZlbnQub25jZSh0aGlzLnNjcmVlblJlYWRlck5vdGlmaWNhdGlvbi5vbkRpZENsb3NlKSgoKSA9PiB0aGlzLnNjcmVlblJlYWRlck5vdGlmaWNhdGlvbiA9IG51bGwpO1xuXHR9XG5cdHByaXZhdGUgdXBkYXRlU2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCdzY3JlZW5SZWFkZXJEZXRlY3RlZCcsIFwiU2NyZWVuIFJlYWRlciBPcHRpbWl6ZWRcIik7XG5cdFx0XHRcdHRoaXMuc2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQudmFsdWUgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoe1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLnNjcmVlblJlYWRlck1vZGUnLCBcIlNjcmVlbiBSZWFkZXIgTW9kZVwiKSxcblx0XHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHRjb21tYW5kOiAnc2hvd0VkaXRvclNjcmVlblJlYWRlck5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdFx0a2luZDogJ3Byb21pbmVudCcsXG5cdFx0XHRcdFx0c2hvd0luQWxsV2luZG93czogdHJ1ZVxuXHRcdFx0XHR9LCAnc3RhdHVzLmVkaXRvci5zY3JlZW5SZWFkZXJNb2RlJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuNik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uU2NyZWVuUmVhZGVyTW9kZUNoYW5nZSgpOiB2b2lkIHtcblxuXHRcdC8vIFdlIG9ubHkgc3VwcG9ydCB0ZXh0IGJhc2VkIGVkaXRvcnNcblx0XHRjb25zdCBzY3JlZW5SZWFkZXJEZXRlY3RlZCA9IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblx0XHRpZiAoc2NyZWVuUmVhZGVyRGV0ZWN0ZWQpIHtcblx0XHRcdGNvbnN0IHNjcmVlblJlYWRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnKTtcblx0XHRcdGlmIChzY3JlZW5SZWFkZXJDb25maWd1cmF0aW9uID09PSAnYXV0bycpIHtcblx0XHRcdFx0aWYgKCF0aGlzLnByb21wdGVkU2NyZWVuUmVhZGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9tcHRlZFNjcmVlblJlYWRlciA9IHRydWU7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLnNob3dTY3JlZW5SZWFkZXJOb3RpZmljYXRpb24oKSwgMTAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNjcmVlblJlYWRlck5vdGlmaWNhdGlvbikge1xuXHRcdFx0dGhpcy5zY3JlZW5SZWFkZXJOb3RpZmljYXRpb24uY2xvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVTY3JlZW5SZWFkZXJNb2RlRWxlbWVudCh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxhQUFhO0FBQ3RCLE9BQU8sY0FBYztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBOEIsc0JBQXNCLDRCQUE0QjtBQUVoRixTQUFrQyxtQkFBbUIsMEJBQTBCO0FBQy9FLFNBQVMsc0JBQXNCO0FBRXhCLElBQU0sc0JBQU4sY0FBa0MsV0FBNkM7QUFBQSxFQVFyRixZQUN5QyxzQkFDRCxxQkFDQyxzQkFDSixrQkFDSCxlQUNoQztBQUNELFVBQU07QUFOa0M7QUFDRDtBQUNDO0FBQ0o7QUFDSDtBQVRsQyxTQUFRLDJCQUF1RDtBQUMvRCxTQUFRLHVCQUFnQztBQUN4QyxTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksa0JBQTJDLENBQUM7QUFXekcsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0IsRUFBRSxJQUFJLHNDQUFzQyxTQUFTLE1BQU0sS0FBSyw2QkFBNkIsRUFBRSxDQUFD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
