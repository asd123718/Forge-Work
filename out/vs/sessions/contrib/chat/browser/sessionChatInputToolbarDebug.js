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
import * as DOM from "../../../../base/browser/dom.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { createWorkbenchDialogOptions } from "../../../../workbench/browser/parts/dialogs/dialog.js";
import { IHostService } from "../../../../workbench/services/host/browser/host.js";
import "./media/sessionChatInputToolbarDebug.css";
const $ = DOM.$;
const ISessionChatPillsDebugService = createDecorator("sessionChatPillsDebugService");
const SessionChatPillsDebugAvailableContext = new RawContextKey("sessionsChatPillsDebugAvailable", false, localize("sessionsChatPillsDebugAvailable", "Whether a session chat view is active and can show fake status pills"));
const SHOW_SESSION_CHAT_PILLS_DEBUG_COMMAND_ID = "sessions.debug.showFakeChatPills";
function weightedRandomDebugIncrement(first = Math.random(), second = Math.random()) {
  return Math.min(Math.floor(first * 16), Math.floor(second * 16));
}
function isNonNegativeIntegerInput(raw) {
  if (raw.trim().length === 0) {
    return false;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0;
}
let SessionChatPillsDebugService = class extends Disposable {
  constructor(contextKeyService, _contextViewService, _keybindingService, _layoutService, productService, _hostService) {
    super();
    this._contextViewService = _contextViewService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._hostService = _hostService;
    this._changesTimer = this._register(new MutableDisposable());
    this._availableContext = SessionChatPillsDebugAvailableContext.bindTo(contextKeyService);
    if (productService.quality !== "stable") {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: SHOW_SESSION_CHAT_PILLS_DEBUG_COMMAND_ID,
            title: localize2("sessions.debug.showFakeChatPills", "Configure Fake Session Chat UI"),
            category: Categories.Developer,
            precondition: SessionChatPillsDebugAvailableContext,
            menu: [{ id: MenuId.CommandPalette, when: SessionChatPillsDebugAvailableContext }]
          });
        }
        run(accessor) {
          return accessor.get(ISessionChatPillsDebugService).showDialog();
        }
      }));
    }
  }
  register(toolbar, banners, isActive) {
    const disposables = new DisposableStore();
    disposables.add(autorun((reader) => {
      if (isActive.read(reader)) {
        this._setActiveTarget(toolbar, banners);
      } else if (this._activeToolbar === toolbar) {
        this._setActiveTarget(void 0, void 0);
      }
    }));
    disposables.add(toDisposable(() => {
      if (this._activeToolbar === toolbar) {
        this._setActiveTarget(void 0, void 0);
      }
    }));
    return disposables;
  }
  clear(toolbar) {
    if (this._activeToolbar === toolbar) {
      this._setDebugData(void 0);
    }
  }
  async showDialog() {
    const toolbar = this._activeToolbar;
    if (!toolbar) {
      return;
    }
    const initial = toolbar.getDebugData();
    const state = {
      files: String(initial?.stats.files ?? 0),
      insertions: String(initial?.stats.insertions ?? 0),
      deletions: String(initial?.stats.deletions ?? 0),
      markdownFiles: initial?.markdownFiles.join("\n") ?? "",
      subagents: initial?.subagents.join("\n") ?? "",
      browsers: initial?.browsers.join("\n") ?? "",
      ciFailed: String(initial?.ciFailed ?? 0),
      ciPending: String(initial?.ciPending ?? 0),
      prFeedback: String(initial?.prFeedback ?? 0),
      agentFeedback: String(initial?.agentFeedback ?? 0),
      autoIncrementChanges: initial?.autoIncrementChanges ?? false
    };
    const disposables = new DisposableStore();
    let applyButton;
    let numericInputs = [];
    let revalidate = () => {
    };
    const dialog = disposables.add(new Dialog(
      this._layoutService.activeContainer,
      localize("sessions.debug.chatPills.title", "Fake Session Chat UI"),
      [
        localize("sessions.debug.chatPills.apply", "Apply"),
        localize("sessions.debug.chatPills.clear", "Clear"),
        localize("sessions.debug.chatPills.cancel", "Cancel")
      ],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["session-chat-pills-debug-dialog"],
        cancelId: 2,
        dialogStyles: defaultDialogStyles,
        buttonOptions: [{
          styleButton: (button) => {
            applyButton = button;
            revalidate();
          }
        }],
        renderBody: (container) => {
          const form = DOM.append(container, $(".session-chat-pills-debug-form"));
          DOM.append(form, $("p.session-chat-pills-debug-description", void 0, localize("sessions.debug.chatPills.description", "Configure the values shown by status pills and input banners. Separate multiple names with commas or new lines.")));
          const stats = DOM.append(form, $(".session-chat-pills-debug-stats"));
          const files = this._createInput(stats, disposables, localize("sessions.debug.chatPills.files", "Files"), state.files, (value) => state.files = value, true, () => revalidate());
          const insertions = this._createInput(stats, disposables, localize("sessions.debug.chatPills.insertions", "Insertions"), state.insertions, (value) => state.insertions = value, true, () => revalidate());
          const deletions = this._createInput(stats, disposables, localize("sessions.debug.chatPills.deletions", "Deletions"), state.deletions, (value) => state.deletions = value, true, () => revalidate());
          numericInputs = [files, insertions, deletions];
          const autoIncrementLabel = localize("sessions.debug.chatPills.autoIncrementChanges", "Automatically increase insertions and deletions every 2 seconds");
          const autoIncrementRow = DOM.append(form, $(".session-chat-pills-debug-checkbox-row"));
          const autoIncrementCheckbox = disposables.add(new Checkbox(autoIncrementLabel, state.autoIncrementChanges, defaultCheckboxStyles));
          DOM.append(autoIncrementRow, autoIncrementCheckbox.domNode);
          const autoIncrementLabelElement = DOM.append(autoIncrementRow, $("span.session-chat-pills-debug-checkbox-label", void 0, autoIncrementLabel));
          const setAutoIncrement = (value) => {
            autoIncrementCheckbox.checked = value;
            state.autoIncrementChanges = value;
          };
          disposables.add(autoIncrementCheckbox.onChange(() => state.autoIncrementChanges = autoIncrementCheckbox.checked));
          disposables.add(DOM.addDisposableListener(autoIncrementLabelElement, DOM.EventType.CLICK, () => setAutoIncrement(!autoIncrementCheckbox.checked)));
          this._createInput(form, disposables, localize("sessions.debug.chatPills.markdownFiles", "Markdown File Names"), state.markdownFiles, (value) => state.markdownFiles = value);
          this._createInput(form, disposables, localize("sessions.debug.chatPills.subagents", "Subagent Names"), state.subagents, (value) => state.subagents = value);
          this._createInput(form, disposables, localize("sessions.debug.chatPills.browsers", "Browser Labels"), state.browsers, (value) => state.browsers = value);
          DOM.append(form, $("h3.session-chat-pills-debug-heading", void 0, localize("sessions.debug.chatPills.inputBanners", "Input Banners")));
          const bannerStats = DOM.append(form, $(".session-chat-pills-debug-banner-stats"));
          const ciFailed = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.ciFailed", "Failed CI Checks"), state.ciFailed, (value) => state.ciFailed = value, true, () => revalidate());
          const ciPending = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.ciPending", "Pending CI Checks"), state.ciPending, (value) => state.ciPending = value, true, () => revalidate());
          const prFeedback = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.prFeedback", "PR Feedback to Address"), state.prFeedback, (value) => state.prFeedback = value, true, () => revalidate());
          const agentFeedback = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.agentFeedback", "Agent Feedback to Address"), state.agentFeedback, (value) => state.agentFeedback = value, true, () => revalidate());
          numericInputs = [...numericInputs, ciFailed, ciPending, prFeedback, agentFeedback];
          revalidate = () => {
            const valid = numericInputs.every((input) => input.validate() !== MessageType.ERROR);
            if (applyButton) {
              applyButton.enabled = valid;
            }
          };
          revalidate();
        }
      }, this._keybindingService, this._layoutService, this._hostService)
    ));
    try {
      const result = await dialog.show();
      if (this._activeToolbar !== toolbar) {
        return;
      }
      if (result.button === 1) {
        this._setDebugData(void 0);
        return;
      }
      if (result.button !== 0 || numericInputs.some((input) => input.validate() === MessageType.ERROR)) {
        return;
      }
      this._setDebugData({
        stats: {
          files: Number(state.files),
          insertions: Number(state.insertions),
          deletions: Number(state.deletions)
        },
        markdownFiles: this._parseList(state.markdownFiles),
        subagents: this._parseList(state.subagents),
        browsers: this._parseList(state.browsers),
        ciFailed: Number(state.ciFailed),
        ciPending: Number(state.ciPending),
        prFeedback: Number(state.prFeedback),
        agentFeedback: Number(state.agentFeedback),
        autoIncrementChanges: state.autoIncrementChanges
      });
    } finally {
      disposables.dispose();
    }
  }
  _createInput(container, disposables, label, value, onChange, numeric = false, onDidChange) {
    const row = DOM.append(container, $(".session-chat-pills-debug-row"));
    DOM.append(row, $("span.session-chat-pills-debug-label", void 0, label));
    const input = disposables.add(new InputBox(DOM.append(row, $(".session-chat-pills-debug-input")), this._contextViewService, {
      inputBoxStyles: defaultInputBoxStyles,
      ariaLabel: label,
      type: numeric ? "number" : "text",
      flexibleHeight: !numeric,
      flexibleMaxHeight: 100,
      validationOptions: numeric ? {
        validation: (raw) => {
          return isNonNegativeIntegerInput(raw) ? null : { content: localize("sessions.debug.chatPills.nonNegativeInteger", "Enter a whole number greater than or equal to 0."), type: MessageType.ERROR };
        }
      } : void 0
    }));
    input.value = value;
    if (numeric) {
      input.inputElement.min = "0";
      input.inputElement.step = "1";
    }
    disposables.add(input.onDidChange((changed) => {
      onChange(changed);
      onDidChange?.();
    }));
    return input;
  }
  _parseList(value) {
    return value.split(/[\n,]/).map((item) => item.trim()).filter((item) => item.length > 0);
  }
  _setDebugData(data) {
    this._changesTimer.clear();
    this._debugData = data;
    this._applyDebugData(data);
    if (data?.autoIncrementChanges && this._activeToolbar) {
      const timer = new DOM.WindowIntervalTimer(this._activeToolbar.element);
      this._changesTimer.value = timer;
      timer.cancelAndSet(() => this._incrementChanges(), 2e3);
    }
  }
  _applyDebugData(data) {
    this._activeToolbar?.setDebugData(data);
    this._activeBanners?.setDebugData(data);
  }
  _incrementChanges() {
    const data = this._debugData;
    if (!data?.autoIncrementChanges || !this._activeToolbar) {
      this._changesTimer.clear();
      return;
    }
    this._debugData = {
      ...data,
      stats: {
        ...data.stats,
        insertions: data.stats.insertions + weightedRandomDebugIncrement(),
        deletions: data.stats.deletions + weightedRandomDebugIncrement()
      }
    };
    this._applyDebugData(this._debugData);
  }
  _setActiveTarget(toolbar, banners) {
    if (this._activeToolbar === toolbar && this._activeBanners === banners) {
      return;
    }
    this._setDebugData(void 0);
    this._activeToolbar = toolbar;
    this._activeBanners = banners;
    this._availableContext.set(!!toolbar);
  }
};
SessionChatPillsDebugService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ILayoutService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IHostService)
], SessionChatPillsDebugService);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
export {
  ISessionChatPillsDebugService,
  isNonNegativeIntegerInput,
  weightedRandomDebugIncrement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXJEZWJ1Zy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBEaWFsb2cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCwgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdERpYWxvZ1N0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9kaWFsb2dzL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJRGlmZlN0YXRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0VHVyblBpbGxzLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSW5wdXRCYW5uZXJzIH0gZnJvbSAnLi4vLi4vc2Vzc2lvbklucHV0QmFubmVycy9icm93c2VyL3Nlc3Npb25JbnB1dEJhbm5lcnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIgfSBmcm9tICcuL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmNzcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB7XG5cdHJlYWRvbmx5IHN0YXRzOiBJRGlmZlN0YXRzO1xuXHRyZWFkb25seSBtYXJrZG93bkZpbGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc3ViYWdlbnRzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgYnJvd3NlcnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBjaUZhaWxlZDogbnVtYmVyO1xuXHRyZWFkb25seSBjaVBlbmRpbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgcHJGZWVkYmFjazogbnVtYmVyO1xuXHRyZWFkb25seSBhZ2VudEZlZWRiYWNrOiBudW1iZXI7XG5cdHJlYWRvbmx5IGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2U+KCdzZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyKHRvb2xiYXI6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyLCBiYW5uZXJzOiBTZXNzaW9uSW5wdXRCYW5uZXJzLCBpc0FjdGl2ZTogSU9ic2VydmFibGU8Ym9vbGVhbj4pOiBJRGlzcG9zYWJsZTtcblx0Y2xlYXIodG9vbGJhcjogU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIpOiB2b2lkO1xuXHRzaG93RGlhbG9nKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmNvbnN0IFNlc3Npb25DaGF0UGlsbHNEZWJ1Z0F2YWlsYWJsZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbnNDaGF0UGlsbHNEZWJ1Z0F2YWlsYWJsZScsIGZhbHNlLCBsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0UGlsbHNEZWJ1Z0F2YWlsYWJsZScsIFwiV2hldGhlciBhIHNlc3Npb24gY2hhdCB2aWV3IGlzIGFjdGl2ZSBhbmQgY2FuIHNob3cgZmFrZSBzdGF0dXMgcGlsbHNcIikpO1xuY29uc3QgU0hPV19TRVNTSU9OX0NIQVRfUElMTFNfREVCVUdfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5kZWJ1Zy5zaG93RmFrZUNoYXRQaWxscyc7XG5cbmludGVyZmFjZSBJRGVidWdGb3JtU3RhdGUge1xuXHRmaWxlczogc3RyaW5nO1xuXHRpbnNlcnRpb25zOiBzdHJpbmc7XG5cdGRlbGV0aW9uczogc3RyaW5nO1xuXHRtYXJrZG93bkZpbGVzOiBzdHJpbmc7XG5cdHN1YmFnZW50czogc3RyaW5nO1xuXHRicm93c2Vyczogc3RyaW5nO1xuXHRjaUZhaWxlZDogc3RyaW5nO1xuXHRjaVBlbmRpbmc6IHN0cmluZztcblx0cHJGZWVkYmFjazogc3RyaW5nO1xuXHRhZ2VudEZlZWRiYWNrOiBzdHJpbmc7XG5cdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2VpZ2h0ZWRSYW5kb21EZWJ1Z0luY3JlbWVudChmaXJzdCA9IE1hdGgucmFuZG9tKCksIHNlY29uZCA9IE1hdGgucmFuZG9tKCkpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5taW4oTWF0aC5mbG9vcihmaXJzdCAqIDE2KSwgTWF0aC5mbG9vcihzZWNvbmQgKiAxNikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOb25OZWdhdGl2ZUludGVnZXJJbnB1dChyYXc6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAocmF3LnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgcGFyc2VkID0gTnVtYmVyKHJhdyk7XG5cdHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHBhcnNlZCkgJiYgcGFyc2VkID49IDA7XG59XG5cbmNsYXNzIFNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZUNvbnRleHQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxET00uV2luZG93SW50ZXJ2YWxUaW1lcj4oKSk7XG5cdHByaXZhdGUgX2FjdGl2ZVRvb2xiYXI6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVCYW5uZXJzOiBTZXNzaW9uSW5wdXRCYW5uZXJzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWJ1Z0RhdGE6IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdEYXRhIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2F2YWlsYWJsZUNvbnRleHQgPSBTZXNzaW9uQ2hhdFBpbGxzRGVidWdBdmFpbGFibGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAocHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZScpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogU0hPV19TRVNTSU9OX0NIQVRfUElMTFNfREVCVUdfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nlc3Npb25zLmRlYnVnLnNob3dGYWtlQ2hhdFBpbGxzJywgXCJDb25maWd1cmUgRmFrZSBTZXNzaW9uIENoYXQgVUlcIiksXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IFNlc3Npb25DaGF0UGlsbHNEZWJ1Z0F2YWlsYWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0XHRtZW51OiBbeyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLCB3aGVuOiBTZXNzaW9uQ2hhdFBpbGxzRGVidWdBdmFpbGFibGVDb250ZXh0IH1dLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnU2VydmljZSkuc2hvd0RpYWxvZygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXIodG9vbGJhcjogU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIsIGJhbm5lcnM6IFNlc3Npb25JbnB1dEJhbm5lcnMsIGlzQWN0aXZlOiBJT2JzZXJ2YWJsZTxib29sZWFuPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKGlzQWN0aXZlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVUYXJnZXQodG9vbGJhciwgYmFubmVycyk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjdGl2ZVRvb2xiYXIgPT09IHRvb2xiYXIpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlVGFyZ2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlVG9vbGJhciA9PT0gdG9vbGJhcikge1xuXHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVUYXJnZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRjbGVhcih0b29sYmFyOiBTZXNzaW9uQ2hhdElucHV0VG9vbGJhcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVUb29sYmFyID09PSB0b29sYmFyKSB7XG5cdFx0XHR0aGlzLl9zZXREZWJ1Z0RhdGEodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzaG93RGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLl9hY3RpdmVUb29sYmFyO1xuXHRcdGlmICghdG9vbGJhcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRpYWwgPSB0b29sYmFyLmdldERlYnVnRGF0YSgpO1xuXHRcdGNvbnN0IHN0YXRlOiBJRGVidWdGb3JtU3RhdGUgPSB7XG5cdFx0XHRmaWxlczogU3RyaW5nKGluaXRpYWw/LnN0YXRzLmZpbGVzID8/IDApLFxuXHRcdFx0aW5zZXJ0aW9uczogU3RyaW5nKGluaXRpYWw/LnN0YXRzLmluc2VydGlvbnMgPz8gMCksXG5cdFx0XHRkZWxldGlvbnM6IFN0cmluZyhpbml0aWFsPy5zdGF0cy5kZWxldGlvbnMgPz8gMCksXG5cdFx0XHRtYXJrZG93bkZpbGVzOiBpbml0aWFsPy5tYXJrZG93bkZpbGVzLmpvaW4oJ1xcbicpID8/ICcnLFxuXHRcdFx0c3ViYWdlbnRzOiBpbml0aWFsPy5zdWJhZ2VudHMuam9pbignXFxuJykgPz8gJycsXG5cdFx0XHRicm93c2VyczogaW5pdGlhbD8uYnJvd3NlcnMuam9pbignXFxuJykgPz8gJycsXG5cdFx0XHRjaUZhaWxlZDogU3RyaW5nKGluaXRpYWw/LmNpRmFpbGVkID8/IDApLFxuXHRcdFx0Y2lQZW5kaW5nOiBTdHJpbmcoaW5pdGlhbD8uY2lQZW5kaW5nID8/IDApLFxuXHRcdFx0cHJGZWVkYmFjazogU3RyaW5nKGluaXRpYWw/LnByRmVlZGJhY2sgPz8gMCksXG5cdFx0XHRhZ2VudEZlZWRiYWNrOiBTdHJpbmcoaW5pdGlhbD8uYWdlbnRGZWVkYmFjayA/PyAwKSxcblx0XHRcdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBpbml0aWFsPy5hdXRvSW5jcmVtZW50Q2hhbmdlcyA/PyBmYWxzZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGFwcGx5QnV0dG9uOiBJQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBudW1lcmljSW5wdXRzOiByZWFkb25seSBJbnB1dEJveFtdID0gW107XG5cdFx0bGV0IHJldmFsaWRhdGUgPSAoKSA9PiB7IH07XG5cdFx0Y29uc3QgZGlhbG9nID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaWFsb2coXG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMudGl0bGUnLCBcIkZha2UgU2Vzc2lvbiBDaGF0IFVJXCIpLFxuXHRcdFx0W1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmFwcGx5JywgXCJBcHBseVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5jbGVhcicsIFwiQ2xlYXJcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRdLFxuXHRcdFx0Y3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyh7XG5cdFx0XHRcdHR5cGU6ICdub25lJyxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ3Nlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1kaWFsb2cnXSxcblx0XHRcdFx0Y2FuY2VsSWQ6IDIsXG5cdFx0XHRcdGRpYWxvZ1N0eWxlczogZGVmYXVsdERpYWxvZ1N0eWxlcyxcblx0XHRcdFx0YnV0dG9uT3B0aW9uczogW3tcblx0XHRcdFx0XHRzdHlsZUJ1dHRvbjogYnV0dG9uID0+IHtcblx0XHRcdFx0XHRcdGFwcGx5QnV0dG9uID0gYnV0dG9uO1xuXHRcdFx0XHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZW5kZXJCb2R5OiBjb250YWluZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZvcm0gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1mb3JtJykpO1xuXHRcdFx0XHRcdERPTS5hcHBlbmQoZm9ybSwgJCgncC5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctZGVzY3JpcHRpb24nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZSB0aGUgdmFsdWVzIHNob3duIGJ5IHN0YXR1cyBwaWxscyBhbmQgaW5wdXQgYmFubmVycy4gU2VwYXJhdGUgbXVsdGlwbGUgbmFtZXMgd2l0aCBjb21tYXMgb3IgbmV3IGxpbmVzLlwiKSkpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHMgPSBET00uYXBwZW5kKGZvcm0sICQoJy5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctc3RhdHMnKSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZXMgPSB0aGlzLl9jcmVhdGVJbnB1dChzdGF0cywgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuZmlsZXMnLCBcIkZpbGVzXCIpLCBzdGF0ZS5maWxlcywgdmFsdWUgPT4gc3RhdGUuZmlsZXMgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRjb25zdCBpbnNlcnRpb25zID0gdGhpcy5fY3JlYXRlSW5wdXQoc3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmluc2VydGlvbnMnLCBcIkluc2VydGlvbnNcIiksIHN0YXRlLmluc2VydGlvbnMsIHZhbHVlID0+IHN0YXRlLmluc2VydGlvbnMgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRjb25zdCBkZWxldGlvbnMgPSB0aGlzLl9jcmVhdGVJbnB1dChzdGF0cywgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuZGVsZXRpb25zJywgXCJEZWxldGlvbnNcIiksIHN0YXRlLmRlbGV0aW9ucywgdmFsdWUgPT4gc3RhdGUuZGVsZXRpb25zID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0bnVtZXJpY0lucHV0cyA9IFtmaWxlcywgaW5zZXJ0aW9ucywgZGVsZXRpb25zXTtcblxuXHRcdFx0XHRcdGNvbnN0IGF1dG9JbmNyZW1lbnRMYWJlbCA9IGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuYXV0b0luY3JlbWVudENoYW5nZXMnLCBcIkF1dG9tYXRpY2FsbHkgaW5jcmVhc2UgaW5zZXJ0aW9ucyBhbmQgZGVsZXRpb25zIGV2ZXJ5IDIgc2Vjb25kc1wiKTtcblx0XHRcdFx0XHRjb25zdCBhdXRvSW5jcmVtZW50Um93ID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWNoZWNrYm94LXJvdycpKTtcblx0XHRcdFx0XHRjb25zdCBhdXRvSW5jcmVtZW50Q2hlY2tib3ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGF1dG9JbmNyZW1lbnRMYWJlbCwgc3RhdGUuYXV0b0luY3JlbWVudENoYW5nZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdFx0XHRcdERPTS5hcHBlbmQoYXV0b0luY3JlbWVudFJvdywgYXV0b0luY3JlbWVudENoZWNrYm94LmRvbU5vZGUpO1xuXHRcdFx0XHRcdGNvbnN0IGF1dG9JbmNyZW1lbnRMYWJlbEVsZW1lbnQgPSBET00uYXBwZW5kKGF1dG9JbmNyZW1lbnRSb3csICQoJ3NwYW4uc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWNoZWNrYm94LWxhYmVsJywgdW5kZWZpbmVkLCBhdXRvSW5jcmVtZW50TGFiZWwpKTtcblx0XHRcdFx0XHRjb25zdCBzZXRBdXRvSW5jcmVtZW50ID0gKHZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0XHRhdXRvSW5jcmVtZW50Q2hlY2tib3guY2hlY2tlZCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0c3RhdGUuYXV0b0luY3JlbWVudENoYW5nZXMgPSB2YWx1ZTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvSW5jcmVtZW50Q2hlY2tib3gub25DaGFuZ2UoKCkgPT4gc3RhdGUuYXV0b0luY3JlbWVudENoYW5nZXMgPSBhdXRvSW5jcmVtZW50Q2hlY2tib3guY2hlY2tlZCkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1dG9JbmNyZW1lbnRMYWJlbEVsZW1lbnQsIERPTS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHNldEF1dG9JbmNyZW1lbnQoIWF1dG9JbmNyZW1lbnRDaGVja2JveC5jaGVja2VkKSkpO1xuXG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlSW5wdXQoZm9ybSwgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMubWFya2Rvd25GaWxlcycsIFwiTWFya2Rvd24gRmlsZSBOYW1lc1wiKSwgc3RhdGUubWFya2Rvd25GaWxlcywgdmFsdWUgPT4gc3RhdGUubWFya2Rvd25GaWxlcyA9IHZhbHVlKTtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVJbnB1dChmb3JtLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5zdWJhZ2VudHMnLCBcIlN1YmFnZW50IE5hbWVzXCIpLCBzdGF0ZS5zdWJhZ2VudHMsIHZhbHVlID0+IHN0YXRlLnN1YmFnZW50cyA9IHZhbHVlKTtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVJbnB1dChmb3JtLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5icm93c2VycycsIFwiQnJvd3NlciBMYWJlbHNcIiksIHN0YXRlLmJyb3dzZXJzLCB2YWx1ZSA9PiBzdGF0ZS5icm93c2VycyA9IHZhbHVlKTtcblxuXHRcdFx0XHRcdERPTS5hcHBlbmQoZm9ybSwgJCgnaDMuc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWhlYWRpbmcnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuaW5wdXRCYW5uZXJzJywgXCJJbnB1dCBCYW5uZXJzXCIpKSk7XG5cdFx0XHRcdFx0Y29uc3QgYmFubmVyU3RhdHMgPSBET00uYXBwZW5kKGZvcm0sICQoJy5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctYmFubmVyLXN0YXRzJykpO1xuXHRcdFx0XHRcdGNvbnN0IGNpRmFpbGVkID0gdGhpcy5fY3JlYXRlSW5wdXQoYmFubmVyU3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmNpRmFpbGVkJywgXCJGYWlsZWQgQ0kgQ2hlY2tzXCIpLCBzdGF0ZS5jaUZhaWxlZCwgdmFsdWUgPT4gc3RhdGUuY2lGYWlsZWQgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRjb25zdCBjaVBlbmRpbmcgPSB0aGlzLl9jcmVhdGVJbnB1dChiYW5uZXJTdGF0cywgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuY2lQZW5kaW5nJywgXCJQZW5kaW5nIENJIENoZWNrc1wiKSwgc3RhdGUuY2lQZW5kaW5nLCB2YWx1ZSA9PiBzdGF0ZS5jaVBlbmRpbmcgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRjb25zdCBwckZlZWRiYWNrID0gdGhpcy5fY3JlYXRlSW5wdXQoYmFubmVyU3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLnByRmVlZGJhY2snLCBcIlBSIEZlZWRiYWNrIHRvIEFkZHJlc3NcIiksIHN0YXRlLnByRmVlZGJhY2ssIHZhbHVlID0+IHN0YXRlLnByRmVlZGJhY2sgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRjb25zdCBhZ2VudEZlZWRiYWNrID0gdGhpcy5fY3JlYXRlSW5wdXQoYmFubmVyU3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmFnZW50RmVlZGJhY2snLCBcIkFnZW50IEZlZWRiYWNrIHRvIEFkZHJlc3NcIiksIHN0YXRlLmFnZW50RmVlZGJhY2ssIHZhbHVlID0+IHN0YXRlLmFnZW50RmVlZGJhY2sgPSB2YWx1ZSwgdHJ1ZSwgKCkgPT4gcmV2YWxpZGF0ZSgpKTtcblx0XHRcdFx0XHRudW1lcmljSW5wdXRzID0gWy4uLm51bWVyaWNJbnB1dHMsIGNpRmFpbGVkLCBjaVBlbmRpbmcsIHByRmVlZGJhY2ssIGFnZW50RmVlZGJhY2tdO1xuXG5cdFx0XHRcdFx0cmV2YWxpZGF0ZSA9ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbGlkID0gbnVtZXJpY0lucHV0cy5ldmVyeShpbnB1dCA9PiBpbnB1dC52YWxpZGF0ZSgpICE9PSBNZXNzYWdlVHlwZS5FUlJPUik7XG5cdFx0XHRcdFx0XHRpZiAoYXBwbHlCdXR0b24pIHtcblx0XHRcdFx0XHRcdFx0YXBwbHlCdXR0b24uZW5hYmxlZCA9IHZhbGlkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2xheW91dFNlcnZpY2UsIHRoaXMuX2hvc3RTZXJ2aWNlKSxcblx0XHQpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRvb2xiYXIgIT09IHRvb2xiYXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5idXR0b24gPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fc2V0RGVidWdEYXRhKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuYnV0dG9uICE9PSAwIHx8IG51bWVyaWNJbnB1dHMuc29tZShpbnB1dCA9PiBpbnB1dC52YWxpZGF0ZSgpID09PSBNZXNzYWdlVHlwZS5FUlJPUikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zZXREZWJ1Z0RhdGEoe1xuXHRcdFx0XHRzdGF0czoge1xuXHRcdFx0XHRcdGZpbGVzOiBOdW1iZXIoc3RhdGUuZmlsZXMpLFxuXHRcdFx0XHRcdGluc2VydGlvbnM6IE51bWJlcihzdGF0ZS5pbnNlcnRpb25zKSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IE51bWJlcihzdGF0ZS5kZWxldGlvbnMpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZG93bkZpbGVzOiB0aGlzLl9wYXJzZUxpc3Qoc3RhdGUubWFya2Rvd25GaWxlcyksXG5cdFx0XHRcdHN1YmFnZW50czogdGhpcy5fcGFyc2VMaXN0KHN0YXRlLnN1YmFnZW50cyksXG5cdFx0XHRcdGJyb3dzZXJzOiB0aGlzLl9wYXJzZUxpc3Qoc3RhdGUuYnJvd3NlcnMpLFxuXHRcdFx0XHRjaUZhaWxlZDogTnVtYmVyKHN0YXRlLmNpRmFpbGVkKSxcblx0XHRcdFx0Y2lQZW5kaW5nOiBOdW1iZXIoc3RhdGUuY2lQZW5kaW5nKSxcblx0XHRcdFx0cHJGZWVkYmFjazogTnVtYmVyKHN0YXRlLnByRmVlZGJhY2spLFxuXHRcdFx0XHRhZ2VudEZlZWRiYWNrOiBOdW1iZXIoc3RhdGUuYWdlbnRGZWVkYmFjayksXG5cdFx0XHRcdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBzdGF0ZS5hdXRvSW5jcmVtZW50Q2hhbmdlcyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSW5wdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZywgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkLCBudW1lcmljID0gZmFsc2UsIG9uRGlkQ2hhbmdlPzogKCkgPT4gdm9pZCk6IElucHV0Qm94IHtcblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1yb3cnKSk7XG5cdFx0RE9NLmFwcGVuZChyb3csICQoJ3NwYW4uc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveChET00uYXBwZW5kKHJvdywgJCgnLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1pbnB1dCcpKSwgdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0YXJpYUxhYmVsOiBsYWJlbCxcblx0XHRcdHR5cGU6IG51bWVyaWMgPyAnbnVtYmVyJyA6ICd0ZXh0Jyxcblx0XHRcdGZsZXhpYmxlSGVpZ2h0OiAhbnVtZXJpYyxcblx0XHRcdGZsZXhpYmxlTWF4SGVpZ2h0OiAxMDAsXG5cdFx0XHR2YWxpZGF0aW9uT3B0aW9uczogbnVtZXJpYyA/IHtcblx0XHRcdFx0dmFsaWRhdGlvbjogcmF3ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gaXNOb25OZWdhdGl2ZUludGVnZXJJbnB1dChyYXcpXG5cdFx0XHRcdFx0XHQ/IG51bGxcblx0XHRcdFx0XHRcdDogeyBjb250ZW50OiBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLm5vbk5lZ2F0aXZlSW50ZWdlcicsIFwiRW50ZXIgYSB3aG9sZSBudW1iZXIgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDAuXCIpLCB0eXBlOiBNZXNzYWdlVHlwZS5FUlJPUiB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdFx0aW5wdXQudmFsdWUgPSB2YWx1ZTtcblx0XHRpZiAobnVtZXJpYykge1xuXHRcdFx0aW5wdXQuaW5wdXRFbGVtZW50Lm1pbiA9ICcwJztcblx0XHRcdGlucHV0LmlucHV0RWxlbWVudC5zdGVwID0gJzEnO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2UoY2hhbmdlZCA9PiB7XG5cdFx0XHRvbkNoYW5nZShjaGFuZ2VkKTtcblx0XHRcdG9uRGlkQ2hhbmdlPy4oKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VMaXN0KHZhbHVlOiBzdHJpbmcpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHZhbHVlLnNwbGl0KC9bXFxuLF0vKS5tYXAoaXRlbSA9PiBpdGVtLnRyaW0oKSkuZmlsdGVyKGl0ZW0gPT4gaXRlbS5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldERlYnVnRGF0YShkYXRhOiBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYW5nZXNUaW1lci5jbGVhcigpO1xuXHRcdHRoaXMuX2RlYnVnRGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5fYXBwbHlEZWJ1Z0RhdGEoZGF0YSk7XG5cdFx0aWYgKGRhdGE/LmF1dG9JbmNyZW1lbnRDaGFuZ2VzICYmIHRoaXMuX2FjdGl2ZVRvb2xiYXIpIHtcblx0XHRcdGNvbnN0IHRpbWVyID0gbmV3IERPTS5XaW5kb3dJbnRlcnZhbFRpbWVyKHRoaXMuX2FjdGl2ZVRvb2xiYXIuZWxlbWVudCk7XG5cdFx0XHR0aGlzLl9jaGFuZ2VzVGltZXIudmFsdWUgPSB0aW1lcjtcblx0XHRcdHRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLl9pbmNyZW1lbnRDaGFuZ2VzKCksIDIwMDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5RGVidWdEYXRhKGRhdGE6IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdEYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbGJhcj8uc2V0RGVidWdEYXRhKGRhdGEpO1xuXHRcdHRoaXMuX2FjdGl2ZUJhbm5lcnM/LnNldERlYnVnRGF0YShkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2luY3JlbWVudENoYW5nZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RlYnVnRGF0YTtcblx0XHRpZiAoIWRhdGE/LmF1dG9JbmNyZW1lbnRDaGFuZ2VzIHx8ICF0aGlzLl9hY3RpdmVUb29sYmFyKSB7XG5cdFx0XHR0aGlzLl9jaGFuZ2VzVGltZXIuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVidWdEYXRhID0ge1xuXHRcdFx0Li4uZGF0YSxcblx0XHRcdHN0YXRzOiB7XG5cdFx0XHRcdC4uLmRhdGEuc3RhdHMsXG5cdFx0XHRcdGluc2VydGlvbnM6IGRhdGEuc3RhdHMuaW5zZXJ0aW9ucyArIHdlaWdodGVkUmFuZG9tRGVidWdJbmNyZW1lbnQoKSxcblx0XHRcdFx0ZGVsZXRpb25zOiBkYXRhLnN0YXRzLmRlbGV0aW9ucyArIHdlaWdodGVkUmFuZG9tRGVidWdJbmNyZW1lbnQoKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0aGlzLl9hcHBseURlYnVnRGF0YSh0aGlzLl9kZWJ1Z0RhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QWN0aXZlVGFyZ2V0KHRvb2xiYXI6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyIHwgdW5kZWZpbmVkLCBiYW5uZXJzOiBTZXNzaW9uSW5wdXRCYW5uZXJzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZVRvb2xiYXIgPT09IHRvb2xiYXIgJiYgdGhpcy5fYWN0aXZlQmFubmVycyA9PT0gYmFubmVycykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXREZWJ1Z0RhdGEodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sYmFyID0gdG9vbGJhcjtcblx0XHR0aGlzLl9hY3RpdmVCYW5uZXJzID0gYmFubmVycztcblx0XHR0aGlzLl9hdmFpbGFibGVDb250ZXh0LnNldCghIXRvb2xiYXIpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlLCBTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsY0FBYztBQUN2QixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsb0JBQW9CLHFCQUFxQjtBQUNsRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyx1QkFBeUM7QUFDbEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUIscUJBQXFCLDZCQUE2QjtBQUNsRixTQUFTLG9DQUFvQztBQUU3QyxTQUFTLG9CQUFvQjtBQUc3QixPQUFPO0FBRVAsTUFBTSxJQUFJLElBQUk7QUFjUCxNQUFNLGdDQUFnQyxnQkFBK0MsOEJBQThCO0FBUzFILE1BQU0sd0NBQXdDLElBQUksY0FBdUIsbUNBQW1DLE9BQU8sU0FBUyxtQ0FBbUMsc0VBQXNFLENBQUM7QUFDdE8sTUFBTSwyQ0FBMkM7QUFnQjFDLFNBQVMsNkJBQTZCLFFBQVEsS0FBSyxPQUFPLEdBQUcsU0FBUyxLQUFLLE9BQU8sR0FBVztBQUNuRyxTQUFPLEtBQUssSUFBSSxLQUFLLE1BQU0sUUFBUSxFQUFFLEdBQUcsS0FBSyxNQUFNLFNBQVMsRUFBRSxDQUFDO0FBQ2hFO0FBRU8sU0FBUywwQkFBMEIsS0FBc0I7QUFDL0QsTUFBSSxJQUFJLEtBQUssRUFBRSxX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
