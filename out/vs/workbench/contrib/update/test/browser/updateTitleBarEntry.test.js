import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Action } from "../../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { State } from "../../../../../platform/update/common/update.js";
import { UpdateTitleBarEntry } from "../../browser/updateTitleBarEntry.js";
import { UpdateTooltip } from "../../browser/updateTooltip.js";
class TestCommandService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidExecuteCommand = new Emitter();
    this.onDidExecuteCommand = this._onDidExecuteCommand.event;
  }
  fireDidExecuteCommand(commandId) {
    this._onDidExecuteCommand.fire({ commandId, args: [] });
  }
  dispose() {
    this._onDidExecuteCommand.dispose();
  }
}
class TestHoverWidget {
  constructor() {
    this.isDisposed = false;
  }
  dispose() {
    this.isDisposed = true;
  }
}
class TestHoverService extends mock() {
  constructor() {
    super(...arguments);
    this.showRequests = [];
  }
  showInstantHover(options, focus) {
    this.showRequests.push({ focus: !!focus, trapFocus: !!options.trapFocus });
    return new TestHoverWidget();
  }
}
suite("UpdateTitleBarEntry", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Show or Focus Hover focuses the tooltip while Tab remains unhandled", () => {
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const commandService = store.add(new TestCommandService());
    const hoverService = new TestHoverService();
    const action = store.add(new Action("workbench.actions.updateIndicator", "Update"));
    const entry = store.add(new UpdateTitleBarEntry(
      action,
      {},
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.domNode = mainWindow.document.createElement("div");
        }
      }(),
      () => {
      },
      () => {
      },
      commandService,
      hoverService,
      new class extends mock() {
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onStateChange = Event.None;
          this.state = State.Uninitialized;
        }
      }()
    ));
    entry.render(container);
    entry.focus();
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", keyCode: 9, bubbles: true, cancelable: true });
    container.dispatchEvent(tabEvent);
    commandService.fireDidExecuteCommand("workbench.action.showHover");
    assert.deepStrictEqual({
      tabDefaultPrevented: tabEvent.defaultPrevented,
      hoverShowRequests: hoverService.showRequests
    }, {
      tabDefaultPrevented: false,
      hoverShowRequests: [{ focus: true, trapFocus: true }]
    });
  });
});
suite("UpdateTooltip", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("removes hidden actions from the tab order", () => {
    const configurationService = new TestConfigurationService({ "update.mode": "default" });
    store.add(configurationService.onDidChangeConfigurationEmitter);
    const tooltip = store.add(new UpdateTooltip(
      new class extends mock() {
      }(),
      store.add(new TestCommandService()),
      configurationService,
      new TestHoverService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.isConnectionMetered = false;
        }
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.nameLong = "Code - OSS Dev";
          this.version = "1.134.0";
          this.commit = "current";
        }
      }()
    ));
    tooltip.renderState(State.Ready({ version: "next", productVersion: "1.135.0" }, false, false));
    assert.deepStrictEqual(
      Array.from(tooltip.domNode.querySelectorAll("button, [tabindex]")).map((element) => ({
        className: element.className,
        display: element.style.display,
        tabIndex: element.tabIndex
      })),
      [
        { className: "copy-version-button", display: "", tabIndex: 0 },
        { className: "copy-version-button", display: "", tabIndex: 0 },
        { className: "release-notes-button", display: "", tabIndex: 0 },
        { className: "action-button", display: "none", tabIndex: -1 }
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcdGVzdFxcYnJvd3NlclxcdXBkYXRlVGl0bGVCYXJFbnRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJPcHRpb25zLCBJSG92ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kRXZlbnQsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgVXBkYXRlVGl0bGVCYXJFbnRyeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdXBkYXRlVGl0bGVCYXJFbnRyeS5qcyc7XG5pbXBvcnQgeyBVcGRhdGVUb29sdGlwIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci91cGRhdGVUb29sdGlwLmpzJztcblxuY2xhc3MgVGVzdENvbW1hbmRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ29tbWFuZFNlcnZpY2U+KCkge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEV4ZWN1dGVDb21tYW5kID0gbmV3IEVtaXR0ZXI8SUNvbW1hbmRFdmVudD4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRFeGVjdXRlQ29tbWFuZCA9IHRoaXMuX29uRGlkRXhlY3V0ZUNvbW1hbmQuZXZlbnQ7XG5cblx0ZmlyZURpZEV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZC5maXJlKHsgY29tbWFuZElkLCBhcmdzOiBbXSB9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEhvdmVyV2lkZ2V0IGltcGxlbWVudHMgSUhvdmVyV2lkZ2V0IHtcblx0aXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBUZXN0SG92ZXJTZXJ2aWNlIGV4dGVuZHMgbW9jazxJSG92ZXJTZXJ2aWNlPigpIHtcblx0cmVhZG9ubHkgc2hvd1JlcXVlc3RzOiB7IHJlYWRvbmx5IGZvY3VzOiBib29sZWFuOyByZWFkb25seSB0cmFwRm9jdXM6IGJvb2xlYW4gfVtdID0gW107XG5cblx0b3ZlcnJpZGUgc2hvd0luc3RhbnRIb3ZlcihvcHRpb25zOiBJSG92ZXJPcHRpb25zLCBmb2N1cz86IGJvb2xlYW4pOiBJSG92ZXJXaWRnZXQge1xuXHRcdHRoaXMuc2hvd1JlcXVlc3RzLnB1c2goeyBmb2N1czogISFmb2N1cywgdHJhcEZvY3VzOiAhIW9wdGlvbnMudHJhcEZvY3VzIH0pO1xuXHRcdHJldHVybiBuZXcgVGVzdEhvdmVyV2lkZ2V0KCk7XG5cdH1cbn1cblxuc3VpdGUoJ1VwZGF0ZVRpdGxlQmFyRW50cnknLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnU2hvdyBvciBGb2N1cyBIb3ZlciBmb2N1c2VzIHRoZSB0b29sdGlwIHdoaWxlIFRhYiByZW1haW5zIHVuaGFuZGxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGhvdmVyU2VydmljZSA9IG5ldyBUZXN0SG92ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYWN0aW9uID0gc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb25zLnVwZGF0ZUluZGljYXRvcicsICdVcGRhdGUnKSk7XG5cdFx0Y29uc3QgZW50cnkgPSBzdG9yZS5hZGQobmV3IFVwZGF0ZVRpdGxlQmFyRW50cnkoXG5cdFx0XHRhY3Rpb24sXG5cdFx0XHR7fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8VXBkYXRlVG9vbHRpcD4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0fSxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVsZW1ldHJ5U2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcGRhdGVTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25TdGF0ZUNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gU3RhdGUuVW5pbml0aWFsaXplZDtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0ZW50cnkucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0ZW50cnkuZm9jdXMoKTtcblxuXHRcdGNvbnN0IHRhYkV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGtleUNvZGU6IDksIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSk7XG5cdFx0Y29udGFpbmVyLmRpc3BhdGNoRXZlbnQodGFiRXZlbnQpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmZpcmVEaWRFeGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5zaG93SG92ZXInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGFiRGVmYXVsdFByZXZlbnRlZDogdGFiRXZlbnQuZGVmYXVsdFByZXZlbnRlZCxcblx0XHRcdGhvdmVyU2hvd1JlcXVlc3RzOiBob3ZlclNlcnZpY2Uuc2hvd1JlcXVlc3RzLFxuXHRcdH0sIHtcblx0XHRcdHRhYkRlZmF1bHRQcmV2ZW50ZWQ6IGZhbHNlLFxuXHRcdFx0aG92ZXJTaG93UmVxdWVzdHM6IFt7IGZvY3VzOiB0cnVlLCB0cmFwRm9jdXM6IHRydWUgfV0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdVcGRhdGVUb29sdGlwJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlbW92ZXMgaGlkZGVuIGFjdGlvbnMgZnJvbSB0aGUgdGFiIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICd1cGRhdGUubW9kZSc6ICdkZWZhdWx0JyB9KTtcblx0XHRzdG9yZS5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlcik7XG5cdFx0Y29uc3QgdG9vbHRpcCA9IHN0b3JlLmFkZChuZXcgVXBkYXRlVG9vbHRpcChcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNsaXBib2FyZFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBUZXN0SG92ZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Nvbm5lY3Rpb25NZXRlcmVkID0gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBuYW1lTG9uZyA9ICdDb2RlIC0gT1NTIERldic7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZlcnNpb24gPSAnMS4xMzQuMCc7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbW1pdCA9ICdjdXJyZW50Jztcblx0XHRcdH0sXG5cdFx0KSk7XG5cblx0XHR0b29sdGlwLnJlbmRlclN0YXRlKFN0YXRlLlJlYWR5KHsgdmVyc2lvbjogJ25leHQnLCBwcm9kdWN0VmVyc2lvbjogJzEuMTM1LjAnIH0sIGZhbHNlLCBmYWxzZSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEFycmF5LmZyb20odG9vbHRpcC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdidXR0b24sIFt0YWJpbmRleF0nKSkubWFwKGVsZW1lbnQgPT4gKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiBlbGVtZW50LmNsYXNzTmFtZSxcblx0XHRcdFx0ZGlzcGxheTogZWxlbWVudC5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0XHR0YWJJbmRleDogZWxlbWVudC50YWJJbmRleCxcblx0XHRcdH0pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjb3B5LXZlcnNpb24tYnV0dG9uJywgZGlzcGxheTogJycsIHRhYkluZGV4OiAwIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnY29weS12ZXJzaW9uLWJ1dHRvbicsIGRpc3BsYXk6ICcnLCB0YWJJbmRleDogMCB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ3JlbGVhc2Utbm90ZXMtYnV0dG9uJywgZGlzcGxheTogJycsIHRhYkluZGV4OiAwIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnYWN0aW9uLWJ1dHRvbicsIGRpc3BsYXk6ICdub25lJywgdGFiSW5kZXg6IC0xIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLGdDQUFnQztBQUt6QyxTQUF5QixhQUFhO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sMkJBQTJCLEtBQXNCLEVBQUU7QUFBQSxFQUF6RDtBQUFBO0FBQ0MsU0FBaUIsdUJBQXVCLElBQUksUUFBdUI7QUFDbkUsU0FBa0Isc0JBQXNCLEtBQUsscUJBQXFCO0FBQUE7QUFBQSxFQUVsRSxzQkFBc0IsV0FBeUI7QUFDOUMsU0FBSyxxQkFBcUIsS0FBSyxFQUFFLFdBQVcsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUsscUJBQXFCLFFBQVE7QUFBQSxFQUNuQztBQUNEO0FBRUEsTUFBTSxnQkFBd0M7QUFBQSxFQUE5QztBQUNDLHNCQUFhO0FBQUE7QUFBQSxFQUViLFVBQWdCO0FBQ2YsU0FBSyxhQUFhO0FBQUEsRUFDbkI7QUFDRDtBQUVBLE1BQU0seUJBQXlCLEtBQW9CLEVBQUU7QUFBQSxFQUFyRDtBQUFBO0FBQ0MsU0FBUyxlQUEyRSxDQUFDO0FBQUE7QUFBQSxFQUU1RSxpQkFBaUIsU0FBd0IsT0FBK0I7QUFDaEYsU0FBSyxhQUFhLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxPQUFPLFdBQVcsQ0FBQyxDQUFDLFFBQVEsVUFBVSxDQUFDO0FBQ3pFLFdBQU8sSUFBSSxnQkFBZ0I7QUFBQSxFQUM1QjtBQUNEO0FBRUEsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxZQUFZLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDekQsZUFBVyxTQUFTLEtBQUssWUFBWSxTQUFTO0FBQzlDLFVBQU0sSUFBSSxhQUFhLE1BQU0sVUFBVSxPQUFPLENBQUMsQ0FBQztBQUVoRCxVQUFNLGlCQUFpQixNQUFNLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUN6RCxVQUFNLGVBQWUsSUFBSSxpQkFBaUI7QUFDMUMsVUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLE9BQU8scUNBQXFDLFFBQVEsQ0FBQztBQUNsRixVQUFNLFFBQVEsTUFBTSxJQUFJLElBQUk7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsQ0FBQztBQUFBLE1BQ0QsSUFBSSxjQUFjLEtBQW9CLEVBQUU7QUFBQSxRQUFwQztBQUFBO0FBQ0gsZUFBa0IsVUFBVSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQUE7QUFBQSxNQUNwRTtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsTUFBRTtBQUFBLE1BQzlDLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsUUFBckM7QUFBQTtBQUNILGVBQWtCLGdCQUFnQixNQUFNO0FBQ3hDLGVBQWtCLFFBQVEsTUFBTTtBQUFBO0FBQUEsTUFDakM7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLE9BQU8sU0FBUztBQUN0QixVQUFNLE1BQU07QUFFWixVQUFNLFdBQVcsSUFBSSxjQUFjLFdBQVcsRUFBRSxLQUFLLE9BQU8sU0FBUyxHQUFHLFNBQVMsTUFBTSxZQUFZLEtBQUssQ0FBQztBQUN6RyxjQUFVLGNBQWMsUUFBUTtBQUNoQyxtQkFBZSxzQkFBc0IsNEJBQTRCO0FBRWpFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIscUJBQXFCLFNBQVM7QUFBQSxNQUM5QixtQkFBbUIsYUFBYTtBQUFBLElBQ2pDLEdBQUc7QUFBQSxNQUNGLHFCQUFxQjtBQUFBLE1BQ3JCLG1CQUFtQixDQUFDLEVBQUUsT0FBTyxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDckQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGlCQUFpQixNQUFNO0FBQzVCLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QixFQUFFLGVBQWUsVUFBVSxDQUFDO0FBQ3RGLFVBQU0sSUFBSSxxQkFBcUIsK0JBQStCO0FBQzlELFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSTtBQUFBLE1BQzdCLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsTUFBRTtBQUFBLE1BQzlDLE1BQU0sSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQUEsTUFDbEM7QUFBQSxNQUNBLElBQUksaUJBQWlCO0FBQUEsTUFDckIsSUFBSSxjQUFjLEtBQWdDLEVBQUU7QUFBQSxRQUFoRDtBQUFBO0FBQ0gsZUFBa0Isc0JBQXNCO0FBQUE7QUFBQSxNQUN6QztBQUFBLE1BQ0EsSUFBSSxjQUFjLEtBQXNCLEVBQUU7QUFBQSxRQUF0QztBQUFBO0FBQ0gsZUFBa0IsV0FBVztBQUM3QixlQUFrQixVQUFVO0FBQzVCLGVBQWtCLFNBQVM7QUFBQTtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDO0FBRUQsWUFBUSxZQUFZLE1BQU0sTUFBTSxFQUFFLFNBQVMsUUFBUSxnQkFBZ0IsVUFBVSxHQUFHLE9BQU8sS0FBSyxDQUFDO0FBRTdGLFdBQU87QUFBQSxNQUNOLE1BQU0sS0FBSyxRQUFRLFFBQVEsaUJBQThCLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxjQUFZO0FBQUEsUUFDL0YsV0FBVyxRQUFRO0FBQUEsUUFDbkIsU0FBUyxRQUFRLE1BQU07QUFBQSxRQUN2QixVQUFVLFFBQVE7QUFBQSxNQUNuQixFQUFFO0FBQUEsTUFDRjtBQUFBLFFBQ0MsRUFBRSxXQUFXLHVCQUF1QixTQUFTLElBQUksVUFBVSxFQUFFO0FBQUEsUUFDN0QsRUFBRSxXQUFXLHVCQUF1QixTQUFTLElBQUksVUFBVSxFQUFFO0FBQUEsUUFDN0QsRUFBRSxXQUFXLHdCQUF3QixTQUFTLElBQUksVUFBVSxFQUFFO0FBQUEsUUFDOUQsRUFBRSxXQUFXLGlCQUFpQixTQUFTLFFBQVEsVUFBVSxHQUFHO0FBQUEsTUFDN0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
