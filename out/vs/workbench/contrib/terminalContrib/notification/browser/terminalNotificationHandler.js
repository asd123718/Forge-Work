import { Action } from "../../../../../base/common/actions.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../base/common/buffer.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { NotificationPriority, Severity } from "../../../../../platform/notification/common/notification.js";
var Osc99PayloadType = /* @__PURE__ */ ((Osc99PayloadType2) => {
  Osc99PayloadType2["Title"] = "title";
  Osc99PayloadType2["Body"] = "body";
  Osc99PayloadType2["Buttons"] = "buttons";
  Osc99PayloadType2["Close"] = "close";
  Osc99PayloadType2["Query"] = "?";
  Osc99PayloadType2["Alive"] = "alive";
  return Osc99PayloadType2;
})(Osc99PayloadType || {});
class TerminalNotificationHandler extends Disposable {
  constructor(_host) {
    super();
    this._host = _host;
    this._osc99PendingNotifications = /* @__PURE__ */ new Map();
    this._osc99ActiveNotifications = /* @__PURE__ */ new Map();
  }
  handleSequence(data) {
    const { metadata, payload } = this._splitOsc99Data(data);
    const metadataEntries = this._parseOsc99Metadata(metadata);
    const payloadTypes = metadataEntries.get("p");
    const rawPayloadType = payloadTypes && payloadTypes.length > 0 ? payloadTypes[payloadTypes.length - 1] : void 0;
    const payloadType = rawPayloadType && rawPayloadType.length > 0 ? rawPayloadType : "title" /* Title */;
    const id = this._sanitizeOsc99Id(metadataEntries.get("i")?.[0]);
    if (!this._host.isEnabled()) {
      return true;
    }
    switch (payloadType) {
      case "?" /* Query */:
        this._sendOsc99QueryResponse(id);
        return true;
      case "alive" /* Alive */:
        this._sendOsc99AliveResponse(id);
        return true;
      case "close" /* Close */:
        this._closeOsc99Notification(id);
        return true;
    }
    const state = this._getOrCreateOsc99State(id);
    this._updateOsc99StateFromMetadata(state, metadataEntries);
    const isEncoded = metadataEntries.get("e")?.[0] === "1";
    const payloadText = this._decodeOsc99Payload(payload, isEncoded);
    const isDone = metadataEntries.get("d")?.[0] !== "0";
    switch (payloadType) {
      case "title" /* Title */:
        state.title += payloadText;
        break;
      case "body" /* Body */:
        state.body += payloadText;
        break;
      case "buttons" /* Buttons */:
        state.buttonsPayload += payloadText;
        break;
      default:
        return true;
    }
    if (!isDone) {
      return true;
    }
    if (!this._shouldHonorOsc99Occasion(state.occasion)) {
      this._clearOsc99PendingState(id);
      return true;
    }
    if (this._showOsc99Notification(state)) {
      this._clearOsc99PendingState(id);
    }
    return true;
  }
  _splitOsc99Data(data) {
    const separatorIndex = data.indexOf(";");
    if (separatorIndex === -1) {
      return { metadata: data, payload: "" };
    }
    return {
      metadata: data.substring(0, separatorIndex),
      payload: data.substring(separatorIndex + 1)
    };
  }
  _parseOsc99Metadata(metadata) {
    const result = /* @__PURE__ */ new Map();
    if (!metadata) {
      return result;
    }
    for (const entry of metadata.split(":")) {
      if (!entry) {
        continue;
      }
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }
      const key = entry.substring(0, separatorIndex);
      const value = entry.substring(separatorIndex + 1);
      if (!key) {
        continue;
      }
      let values = result.get(key);
      if (!values) {
        values = [];
        result.set(key, values);
      }
      values.push(value);
    }
    return result;
  }
  _decodeOsc99Payload(payload, isEncoded) {
    if (!isEncoded) {
      return payload;
    }
    try {
      return decodeBase64(payload).toString();
    } catch {
      this._host.logWarn("Failed to decode OSC 99 payload");
      return "";
    }
  }
  _sanitizeOsc99Id(rawId) {
    if (!rawId) {
      return void 0;
    }
    const sanitized = rawId.replace(/[^a-zA-Z0-9_\-+.]/g, "");
    return sanitized.length > 0 ? sanitized : void 0;
  }
  _sanitizeOsc99MessageText(text) {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  }
  _getOrCreateOsc99State(id) {
    if (!id) {
      if (!this._osc99PendingAnonymous) {
        this._osc99PendingAnonymous = this._createOsc99State(void 0);
      }
      return this._osc99PendingAnonymous;
    }
    let state = this._osc99PendingNotifications.get(id);
    if (!state) {
      state = this._createOsc99State(id);
      this._osc99PendingNotifications.set(id, state);
    }
    return state;
  }
  _createOsc99State(id) {
    return {
      id,
      title: "",
      body: "",
      buttonsPayload: "",
      focusOnActivate: true,
      reportOnActivate: false,
      reportOnClose: false,
      urgency: void 0,
      autoCloseMs: void 0,
      occasion: void 0
    };
  }
  _clearOsc99PendingState(id) {
    if (!id) {
      this._osc99PendingAnonymous = void 0;
      return;
    }
    this._osc99PendingNotifications.delete(id);
  }
  _updateOsc99StateFromMetadata(state, metadataEntries) {
    const actionValues = metadataEntries.get("a");
    const actionValue = actionValues && actionValues.length > 0 ? actionValues[actionValues.length - 1] : void 0;
    if (actionValue !== void 0) {
      const actions = this._parseOsc99Actions(actionValue);
      state.focusOnActivate = actions.focusOnActivate;
      state.reportOnActivate = actions.reportOnActivate;
    }
    const closeValues = metadataEntries.get("c");
    const closeValue = closeValues && closeValues.length > 0 ? closeValues[closeValues.length - 1] : void 0;
    if (closeValue !== void 0) {
      state.reportOnClose = closeValue === "1";
    }
    const urgencyValues = metadataEntries.get("u");
    const urgencyValue = urgencyValues && urgencyValues.length > 0 ? urgencyValues[urgencyValues.length - 1] : void 0;
    if (urgencyValue !== void 0) {
      const urgency = Number.parseInt(urgencyValue, 10);
      if (!Number.isNaN(urgency)) {
        state.urgency = urgency;
      }
    }
    const autoCloseValues = metadataEntries.get("w");
    const autoCloseValue = autoCloseValues && autoCloseValues.length > 0 ? autoCloseValues[autoCloseValues.length - 1] : void 0;
    if (autoCloseValue !== void 0) {
      const autoClose = Number.parseInt(autoCloseValue, 10);
      if (!Number.isNaN(autoClose)) {
        state.autoCloseMs = autoClose;
      }
    }
    const occasionValues = metadataEntries.get("o");
    const occasionValue = occasionValues && occasionValues.length > 0 ? occasionValues[occasionValues.length - 1] : void 0;
    if (occasionValue === "always" || occasionValue === "unfocused" || occasionValue === "invisible") {
      state.occasion = occasionValue;
    }
  }
  _parseOsc99Actions(value) {
    let focusOnActivate = true;
    let reportOnActivate = false;
    for (const token of value.split(",")) {
      switch (token) {
        case "focus":
          focusOnActivate = true;
          break;
        case "-focus":
          focusOnActivate = false;
          break;
        case "report":
          reportOnActivate = true;
          break;
        case "-report":
          reportOnActivate = false;
          break;
      }
    }
    return { focusOnActivate, reportOnActivate };
  }
  _shouldHonorOsc99Occasion(occasion) {
    if (!occasion || occasion === "always") {
      return true;
    }
    const windowFocused = this._host.isWindowFocused();
    switch (occasion) {
      case "unfocused":
        return !windowFocused;
      case "invisible":
        return !windowFocused && !this._host.isTerminalVisible();
      default:
        return true;
    }
  }
  _showOsc99Notification(state) {
    const message = this._getOsc99NotificationMessage(state);
    if (!message) {
      return false;
    }
    const severity = state.urgency === 2 ? Severity.Warning : Severity.Info;
    const priority = this._getOsc99NotificationPriority(state.urgency);
    const source = {
      id: "terminal",
      label: localize("terminalNotificationSource", "Terminal")
    };
    const buttons = state.buttonsPayload.length > 0 ? state.buttonsPayload.split("\u2028") : [];
    const actionStore = this._register(new DisposableStore());
    const handleRef = { current: void 0 };
    const activeRef = { current: void 0 };
    const reportActivation = (buttonIndex, forceFocus) => {
      if (forceFocus || state.focusOnActivate) {
        this._host.focusTerminal();
      }
      if (state.reportOnActivate) {
        this._sendOsc99ActivationReport(state.id, buttonIndex);
      }
    };
    const primaryActions = [];
    for (let i = 0; i < buttons.length; i++) {
      const label = buttons[i];
      if (!label) {
        continue;
      }
      const action = actionStore.add(new Action(`terminal.osc99.button.${i}`, label, void 0, true, () => {
        if (activeRef.current) {
          activeRef.current.closeReason = "button";
        }
        reportActivation(i + 1);
        handleRef.current?.close();
      }));
      primaryActions.push(action);
    }
    const secondaryActions = [];
    secondaryActions.push(actionStore.add(new Action(
      "terminal.osc99.dismiss",
      localize("terminalNotificationDismiss", "Dismiss"),
      void 0,
      true,
      () => {
        if (activeRef.current) {
          activeRef.current.closeReason = "secondary";
        }
        handleRef.current?.close();
      }
    )));
    secondaryActions.push(actionStore.add(new Action(
      "terminal.osc99.disable",
      localize("terminalNotificationDisable", "Disable Terminal Notifications"),
      void 0,
      true,
      async () => {
        await this._host.updateEnableNotifications(false);
        if (activeRef.current) {
          activeRef.current.closeReason = "secondary";
        }
        handleRef.current?.close();
      }
    )));
    const actions = { primary: primaryActions, secondary: secondaryActions };
    if (state.id) {
      const existing = this._osc99ActiveNotifications.get(state.id);
      if (existing) {
        activeRef.current = existing;
        handleRef.current = existing.handle;
        existing.handle.updateMessage(message);
        existing.handle.updateSeverity(severity);
        existing.handle.updateActions(actions);
        existing.actionStore.dispose();
        existing.actionStore = actionStore;
        existing.focusOnActivate = state.focusOnActivate;
        existing.reportOnActivate = state.reportOnActivate;
        existing.reportOnClose = state.reportOnClose;
        existing.autoCloseDisposable?.dispose();
        existing.autoCloseDisposable = this._scheduleOsc99AutoClose(existing, state.autoCloseMs);
        return true;
      }
    }
    const handle = this._host.notify({
      id: state.id ? `terminal.osc99.${state.id}` : void 0,
      severity,
      message,
      source,
      actions,
      priority
    });
    handleRef.current = handle;
    const active = {
      id: state.id,
      handle,
      actionStore,
      autoCloseDisposable: void 0,
      reportOnActivate: state.reportOnActivate,
      reportOnClose: state.reportOnClose,
      focusOnActivate: state.focusOnActivate,
      closeReason: void 0
    };
    activeRef.current = active;
    active.autoCloseDisposable = this._scheduleOsc99AutoClose(active, state.autoCloseMs);
    this._register(handle.onDidClose(() => {
      if (active.reportOnActivate && active.closeReason === void 0) {
        if (active.focusOnActivate) {
          this._host.focusTerminal();
        }
        this._sendOsc99ActivationReport(active.id);
      }
      if (active.reportOnClose) {
        this._sendOsc99CloseReport(active.id);
      }
      active.actionStore.dispose();
      active.autoCloseDisposable?.dispose();
      if (active.id) {
        this._osc99ActiveNotifications.delete(active.id);
      }
    }));
    if (active.id) {
      this._osc99ActiveNotifications.set(active.id, active);
    }
    return true;
  }
  _getOsc99NotificationMessage(state) {
    const title = this._sanitizeOsc99MessageText(state.title);
    const body = this._sanitizeOsc99MessageText(state.body);
    const hasTitle = title.trim().length > 0;
    const hasBody = body.trim().length > 0;
    if (hasTitle && hasBody) {
      return `${title}: ${body}`;
    }
    if (hasTitle) {
      return title;
    }
    if (hasBody) {
      return body;
    }
    return void 0;
  }
  _getOsc99NotificationPriority(urgency) {
    switch (urgency) {
      case 0:
        return NotificationPriority.SILENT;
      case 1:
        return NotificationPriority.DEFAULT;
      case 2:
        return NotificationPriority.URGENT;
      default:
        return void 0;
    }
  }
  _scheduleOsc99AutoClose(active, autoCloseMs) {
    if (autoCloseMs === void 0 || autoCloseMs <= 0) {
      return void 0;
    }
    return disposableTimeout(() => {
      active.closeReason = "auto";
      active.handle.close();
    }, autoCloseMs, this._store);
  }
  _closeOsc99Notification(id) {
    if (!id) {
      return;
    }
    const active = this._osc99ActiveNotifications.get(id);
    if (active) {
      active.closeReason = "protocol";
      active.handle.close();
    }
    this._osc99PendingNotifications.delete(id);
  }
  _sendOsc99QueryResponse(id) {
    const requestId = id ?? "0";
    this._sendOsc99Response([
      `i=${requestId}`,
      "p=?",
      "a=report,focus",
      "c=1",
      "o=always,unfocused,invisible",
      "p=title,body,buttons,close,alive,?",
      "u=0,1,2",
      "w=1"
    ]);
  }
  _sendOsc99AliveResponse(id) {
    const requestId = id ?? "0";
    const aliveIds = Array.from(this._osc99ActiveNotifications.keys()).join(",");
    this._sendOsc99Response([
      `i=${requestId}`,
      "p=alive"
    ], aliveIds);
  }
  _sendOsc99ActivationReport(id, buttonIndex) {
    const reportId = id ?? "0";
    this._sendOsc99Response([`i=${reportId}`], buttonIndex !== void 0 ? String(buttonIndex) : "");
  }
  _sendOsc99CloseReport(id) {
    const reportId = id ?? "0";
    this._sendOsc99Response([`i=${reportId}`, "p=close"]);
  }
  _sendOsc99Response(metadataParts, payload = "") {
    const metadata = metadataParts.join(":");
    this._host.writeToProcess(`\x1B]99;${metadata};${payload}\x1B\\`);
  }
}
export {
  TerminalNotificationHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbm90aWZpY2F0aW9uXFxicm93c2VyXFx0ZXJtaW5hbE5vdGlmaWNhdGlvbkhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdHlwZSBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHksIHR5cGUgSU5vdGlmaWNhdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uSGFuZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuXG5jb25zdCBlbnVtIE9zYzk5UGF5bG9hZFR5cGUge1xuXHRUaXRsZSA9ICd0aXRsZScsXG5cdEJvZHkgPSAnYm9keScsXG5cdEJ1dHRvbnMgPSAnYnV0dG9ucycsXG5cdENsb3NlID0gJ2Nsb3NlJyxcblx0UXVlcnkgPSAnPycsXG5cdEFsaXZlID0gJ2FsaXZlJ1xufVxuXG50eXBlIE9zYzk5T2NjYXNpb24gPSAnYWx3YXlzJyB8ICd1bmZvY3VzZWQnIHwgJ2ludmlzaWJsZSc7XG50eXBlIE9zYzk5Q2xvc2VSZWFzb24gPSAnYnV0dG9uJyB8ICdzZWNvbmRhcnknIHwgJ2F1dG8nIHwgJ3Byb3RvY29sJztcblxuaW50ZXJmYWNlIElPc2M5OU5vdGlmaWNhdGlvblN0YXRlIHtcblx0aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dGl0bGU6IHN0cmluZztcblx0Ym9keTogc3RyaW5nO1xuXHRidXR0b25zUGF5bG9hZDogc3RyaW5nO1xuXHRmb2N1c09uQWN0aXZhdGU6IGJvb2xlYW47XG5cdHJlcG9ydE9uQWN0aXZhdGU6IGJvb2xlYW47XG5cdHJlcG9ydE9uQ2xvc2U6IGJvb2xlYW47XG5cdHVyZ2VuY3k6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0YXV0b0Nsb3NlTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0b2NjYXNpb246IE9zYzk5T2NjYXNpb24gfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJT3NjOTlBY3RpdmVOb3RpZmljYXRpb24ge1xuXHRpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRoYW5kbGU6IElOb3RpZmljYXRpb25IYW5kbGU7XG5cdGFjdGlvblN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGF1dG9DbG9zZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRyZXBvcnRPbkFjdGl2YXRlOiBib29sZWFuO1xuXHRyZXBvcnRPbkNsb3NlOiBib29sZWFuO1xuXHRmb2N1c09uQWN0aXZhdGU6IGJvb2xlYW47XG5cdGNsb3NlUmVhc29uOiBPc2M5OUNsb3NlUmVhc29uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M5OU5vdGlmaWNhdGlvbkhvc3Qge1xuXHRpc0VuYWJsZWQoKTogYm9vbGVhbjtcblx0aXNXaW5kb3dGb2N1c2VkKCk6IGJvb2xlYW47XG5cdGlzVGVybWluYWxWaXNpYmxlKCk6IGJvb2xlYW47XG5cdGZvY3VzVGVybWluYWwoKTogdm9pZDtcblx0bm90aWZ5KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IElOb3RpZmljYXRpb25IYW5kbGU7XG5cdHVwZGF0ZUVuYWJsZU5vdGlmaWNhdGlvbnModmFsdWU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRsb2dXYXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQ7XG5cdHdyaXRlVG9Qcm9jZXNzKGRhdGE6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbE5vdGlmaWNhdGlvbkhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb3NjOTlQZW5kaW5nTm90aWZpY2F0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJT3NjOTlOb3RpZmljYXRpb25TdGF0ZT4oKTtcblx0cHJpdmF0ZSBfb3NjOTlQZW5kaW5nQW5vbnltb3VzOiBJT3NjOTlOb3RpZmljYXRpb25TdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3NjOTlBY3RpdmVOb3RpZmljYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElPc2M5OUFjdGl2ZU5vdGlmaWNhdGlvbj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3N0OiBJT3NjOTlOb3RpZmljYXRpb25Ib3N0XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRoYW5kbGVTZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB7IG1ldGFkYXRhLCBwYXlsb2FkIH0gPSB0aGlzLl9zcGxpdE9zYzk5RGF0YShkYXRhKTtcblx0XHRjb25zdCBtZXRhZGF0YUVudHJpZXMgPSB0aGlzLl9wYXJzZU9zYzk5TWV0YWRhdGEobWV0YWRhdGEpO1xuXHRcdGNvbnN0IHBheWxvYWRUeXBlcyA9IG1ldGFkYXRhRW50cmllcy5nZXQoJ3AnKTtcblx0XHRjb25zdCByYXdQYXlsb2FkVHlwZSA9IHBheWxvYWRUeXBlcyAmJiBwYXlsb2FkVHlwZXMubGVuZ3RoID4gMCA/IHBheWxvYWRUeXBlc1twYXlsb2FkVHlwZXMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGF5bG9hZFR5cGUgPSByYXdQYXlsb2FkVHlwZSAmJiByYXdQYXlsb2FkVHlwZS5sZW5ndGggPiAwID8gcmF3UGF5bG9hZFR5cGUgOiBPc2M5OVBheWxvYWRUeXBlLlRpdGxlO1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fc2FuaXRpemVPc2M5OUlkKG1ldGFkYXRhRW50cmllcy5nZXQoJ2knKT8uWzBdKTtcblxuXHRcdGlmICghdGhpcy5faG9zdC5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChwYXlsb2FkVHlwZSkge1xuXHRcdFx0Y2FzZSBPc2M5OVBheWxvYWRUeXBlLlF1ZXJ5OlxuXHRcdFx0XHR0aGlzLl9zZW5kT3NjOTlRdWVyeVJlc3BvbnNlKGlkKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIE9zYzk5UGF5bG9hZFR5cGUuQWxpdmU6XG5cdFx0XHRcdHRoaXMuX3NlbmRPc2M5OUFsaXZlUmVzcG9uc2UoaWQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgT3NjOTlQYXlsb2FkVHlwZS5DbG9zZTpcblx0XHRcdFx0dGhpcy5fY2xvc2VPc2M5OU5vdGlmaWNhdGlvbihpZCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0T3JDcmVhdGVPc2M5OVN0YXRlKGlkKTtcblx0XHR0aGlzLl91cGRhdGVPc2M5OVN0YXRlRnJvbU1ldGFkYXRhKHN0YXRlLCBtZXRhZGF0YUVudHJpZXMpO1xuXG5cdFx0Y29uc3QgaXNFbmNvZGVkID0gbWV0YWRhdGFFbnRyaWVzLmdldCgnZScpPy5bMF0gPT09ICcxJztcblx0XHRjb25zdCBwYXlsb2FkVGV4dCA9IHRoaXMuX2RlY29kZU9zYzk5UGF5bG9hZChwYXlsb2FkLCBpc0VuY29kZWQpO1xuXHRcdGNvbnN0IGlzRG9uZSA9IG1ldGFkYXRhRW50cmllcy5nZXQoJ2QnKT8uWzBdICE9PSAnMCc7XG5cblx0XHRzd2l0Y2ggKHBheWxvYWRUeXBlKSB7XG5cdFx0XHRjYXNlIE9zYzk5UGF5bG9hZFR5cGUuVGl0bGU6XG5cdFx0XHRcdHN0YXRlLnRpdGxlICs9IHBheWxvYWRUZXh0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT3NjOTlQYXlsb2FkVHlwZS5Cb2R5OlxuXHRcdFx0XHRzdGF0ZS5ib2R5ICs9IHBheWxvYWRUZXh0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT3NjOTlQYXlsb2FkVHlwZS5CdXR0b25zOlxuXHRcdFx0XHRzdGF0ZS5idXR0b25zUGF5bG9hZCArPSBwYXlsb2FkVGV4dDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIWlzRG9uZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fc2hvdWxkSG9ub3JPc2M5OU9jY2FzaW9uKHN0YXRlLm9jY2FzaW9uKSkge1xuXHRcdFx0dGhpcy5fY2xlYXJPc2M5OVBlbmRpbmdTdGF0ZShpZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hvd09zYzk5Tm90aWZpY2F0aW9uKHN0YXRlKSkge1xuXHRcdFx0dGhpcy5fY2xlYXJPc2M5OVBlbmRpbmdTdGF0ZShpZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaXRPc2M5OURhdGEoZGF0YTogc3RyaW5nKTogeyBtZXRhZGF0YTogc3RyaW5nOyBwYXlsb2FkOiBzdHJpbmcgfSB7XG5cdFx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBkYXRhLmluZGV4T2YoJzsnKTtcblx0XHRpZiAoc2VwYXJhdG9ySW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4geyBtZXRhZGF0YTogZGF0YSwgcGF5bG9hZDogJycgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1ldGFkYXRhOiBkYXRhLnN1YnN0cmluZygwLCBzZXBhcmF0b3JJbmRleCksXG5cdFx0XHRwYXlsb2FkOiBkYXRhLnN1YnN0cmluZyhzZXBhcmF0b3JJbmRleCArIDEpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlT3NjOTlNZXRhZGF0YShtZXRhZGF0YTogc3RyaW5nKTogTWFwPHN0cmluZywgc3RyaW5nW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdFx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBtZXRhZGF0YS5zcGxpdCgnOicpKSB7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBlbnRyeS5pbmRleE9mKCc9Jyk7XG5cdFx0XHRpZiAoc2VwYXJhdG9ySW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5ID0gZW50cnkuc3Vic3RyaW5nKDAsIHNlcGFyYXRvckluZGV4KTtcblx0XHRcdGNvbnN0IHZhbHVlID0gZW50cnkuc3Vic3RyaW5nKHNlcGFyYXRvckluZGV4ICsgMSk7XG5cdFx0XHRpZiAoIWtleSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZXMgPSByZXN1bHQuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0XHR2YWx1ZXMgPSBbXTtcblx0XHRcdFx0cmVzdWx0LnNldChrZXksIHZhbHVlcyk7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZXMucHVzaCh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVPc2M5OVBheWxvYWQocGF5bG9hZDogc3RyaW5nLCBpc0VuY29kZWQ6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmICghaXNFbmNvZGVkKSB7XG5cdFx0XHRyZXR1cm4gcGF5bG9hZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBkZWNvZGVCYXNlNjQocGF5bG9hZCkudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2hvc3QubG9nV2FybignRmFpbGVkIHRvIGRlY29kZSBPU0MgOTkgcGF5bG9hZCcpO1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nhbml0aXplT3NjOTlJZChyYXdJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzYW5pdGl6ZWQgPSByYXdJZC5yZXBsYWNlKC9bXmEtekEtWjAtOV9cXC0rLl0vZywgJycpO1xuXHRcdHJldHVybiBzYW5pdGl6ZWQubGVuZ3RoID4gMCA/IHNhbml0aXplZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Nhbml0aXplT3NjOTlNZXNzYWdlVGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcWyhbXlxcXV0rKVxcXVxcKChbXildKylcXCkvZywgJyQxJyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZU9zYzk5U3RhdGUoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElPc2M5OU5vdGlmaWNhdGlvblN0YXRlIHtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX29zYzk5UGVuZGluZ0Fub255bW91cykge1xuXHRcdFx0XHR0aGlzLl9vc2M5OVBlbmRpbmdBbm9ueW1vdXMgPSB0aGlzLl9jcmVhdGVPc2M5OVN0YXRlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3NjOTlQZW5kaW5nQW5vbnltb3VzO1xuXHRcdH1cblx0XHRsZXQgc3RhdGUgPSB0aGlzLl9vc2M5OVBlbmRpbmdOb3RpZmljYXRpb25zLmdldChpZCk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0c3RhdGUgPSB0aGlzLl9jcmVhdGVPc2M5OVN0YXRlKGlkKTtcblx0XHRcdHRoaXMuX29zYzk5UGVuZGluZ05vdGlmaWNhdGlvbnMuc2V0KGlkLCBzdGF0ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU9zYzk5U3RhdGUoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElPc2M5OU5vdGlmaWNhdGlvblN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHR0aXRsZTogJycsXG5cdFx0XHRib2R5OiAnJyxcblx0XHRcdGJ1dHRvbnNQYXlsb2FkOiAnJyxcblx0XHRcdGZvY3VzT25BY3RpdmF0ZTogdHJ1ZSxcblx0XHRcdHJlcG9ydE9uQWN0aXZhdGU6IGZhbHNlLFxuXHRcdFx0cmVwb3J0T25DbG9zZTogZmFsc2UsXG5cdFx0XHR1cmdlbmN5OiB1bmRlZmluZWQsXG5cdFx0XHRhdXRvQ2xvc2VNczogdW5kZWZpbmVkLFxuXHRcdFx0b2NjYXNpb246IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhck9zYzk5UGVuZGluZ1N0YXRlKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHR0aGlzLl9vc2M5OVBlbmRpbmdBbm9ueW1vdXMgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29zYzk5UGVuZGluZ05vdGlmaWNhdGlvbnMuZGVsZXRlKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU9zYzk5U3RhdGVGcm9tTWV0YWRhdGEoc3RhdGU6IElPc2M5OU5vdGlmaWNhdGlvblN0YXRlLCBtZXRhZGF0YUVudHJpZXM6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvblZhbHVlcyA9IG1ldGFkYXRhRW50cmllcy5nZXQoJ2EnKTtcblx0XHRjb25zdCBhY3Rpb25WYWx1ZSA9IGFjdGlvblZhbHVlcyAmJiBhY3Rpb25WYWx1ZXMubGVuZ3RoID4gMCA/IGFjdGlvblZhbHVlc1thY3Rpb25WYWx1ZXMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGlvblZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLl9wYXJzZU9zYzk5QWN0aW9ucyhhY3Rpb25WYWx1ZSk7XG5cdFx0XHRzdGF0ZS5mb2N1c09uQWN0aXZhdGUgPSBhY3Rpb25zLmZvY3VzT25BY3RpdmF0ZTtcblx0XHRcdHN0YXRlLnJlcG9ydE9uQWN0aXZhdGUgPSBhY3Rpb25zLnJlcG9ydE9uQWN0aXZhdGU7XG5cdFx0fVxuXHRcdGNvbnN0IGNsb3NlVmFsdWVzID0gbWV0YWRhdGFFbnRyaWVzLmdldCgnYycpO1xuXHRcdGNvbnN0IGNsb3NlVmFsdWUgPSBjbG9zZVZhbHVlcyAmJiBjbG9zZVZhbHVlcy5sZW5ndGggPiAwID8gY2xvc2VWYWx1ZXNbY2xvc2VWYWx1ZXMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNsb3NlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3RhdGUucmVwb3J0T25DbG9zZSA9IGNsb3NlVmFsdWUgPT09ICcxJztcblx0XHR9XG5cdFx0Y29uc3QgdXJnZW5jeVZhbHVlcyA9IG1ldGFkYXRhRW50cmllcy5nZXQoJ3UnKTtcblx0XHRjb25zdCB1cmdlbmN5VmFsdWUgPSB1cmdlbmN5VmFsdWVzICYmIHVyZ2VuY3lWYWx1ZXMubGVuZ3RoID4gMCA/IHVyZ2VuY3lWYWx1ZXNbdXJnZW5jeVZhbHVlcy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodXJnZW5jeVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHVyZ2VuY3kgPSBOdW1iZXIucGFyc2VJbnQodXJnZW5jeVZhbHVlLCAxMCk7XG5cdFx0XHRpZiAoIU51bWJlci5pc05hTih1cmdlbmN5KSkge1xuXHRcdFx0XHRzdGF0ZS51cmdlbmN5ID0gdXJnZW5jeTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgYXV0b0Nsb3NlVmFsdWVzID0gbWV0YWRhdGFFbnRyaWVzLmdldCgndycpO1xuXHRcdGNvbnN0IGF1dG9DbG9zZVZhbHVlID0gYXV0b0Nsb3NlVmFsdWVzICYmIGF1dG9DbG9zZVZhbHVlcy5sZW5ndGggPiAwID8gYXV0b0Nsb3NlVmFsdWVzW2F1dG9DbG9zZVZhbHVlcy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoYXV0b0Nsb3NlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlID0gTnVtYmVyLnBhcnNlSW50KGF1dG9DbG9zZVZhbHVlLCAxMCk7XG5cdFx0XHRpZiAoIU51bWJlci5pc05hTihhdXRvQ2xvc2UpKSB7XG5cdFx0XHRcdHN0YXRlLmF1dG9DbG9zZU1zID0gYXV0b0Nsb3NlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBvY2Nhc2lvblZhbHVlcyA9IG1ldGFkYXRhRW50cmllcy5nZXQoJ28nKTtcblx0XHRjb25zdCBvY2Nhc2lvblZhbHVlID0gb2NjYXNpb25WYWx1ZXMgJiYgb2NjYXNpb25WYWx1ZXMubGVuZ3RoID4gMCA/IG9jY2FzaW9uVmFsdWVzW29jY2FzaW9uVmFsdWVzLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChvY2Nhc2lvblZhbHVlID09PSAnYWx3YXlzJyB8fCBvY2Nhc2lvblZhbHVlID09PSAndW5mb2N1c2VkJyB8fCBvY2Nhc2lvblZhbHVlID09PSAnaW52aXNpYmxlJykge1xuXHRcdFx0c3RhdGUub2NjYXNpb24gPSBvY2Nhc2lvblZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlT3NjOTlBY3Rpb25zKHZhbHVlOiBzdHJpbmcpOiB7IGZvY3VzT25BY3RpdmF0ZTogYm9vbGVhbjsgcmVwb3J0T25BY3RpdmF0ZTogYm9vbGVhbiB9IHtcblx0XHRsZXQgZm9jdXNPbkFjdGl2YXRlID0gdHJ1ZTtcblx0XHRsZXQgcmVwb3J0T25BY3RpdmF0ZSA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgdG9rZW4gb2YgdmFsdWUuc3BsaXQoJywnKSkge1xuXHRcdFx0c3dpdGNoICh0b2tlbikge1xuXHRcdFx0XHRjYXNlICdmb2N1cyc6XG5cdFx0XHRcdFx0Zm9jdXNPbkFjdGl2YXRlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnLWZvY3VzJzpcblx0XHRcdFx0XHRmb2N1c09uQWN0aXZhdGUgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncmVwb3J0Jzpcblx0XHRcdFx0XHRyZXBvcnRPbkFjdGl2YXRlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnLXJlcG9ydCc6XG5cdFx0XHRcdFx0cmVwb3J0T25BY3RpdmF0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBmb2N1c09uQWN0aXZhdGUsIHJlcG9ydE9uQWN0aXZhdGUgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEhvbm9yT3NjOTlPY2Nhc2lvbihvY2Nhc2lvbjogT3NjOTlPY2Nhc2lvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghb2NjYXNpb24gfHwgb2NjYXNpb24gPT09ICdhbHdheXMnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgd2luZG93Rm9jdXNlZCA9IHRoaXMuX2hvc3QuaXNXaW5kb3dGb2N1c2VkKCk7XG5cdFx0c3dpdGNoIChvY2Nhc2lvbikge1xuXHRcdFx0Y2FzZSAndW5mb2N1c2VkJzpcblx0XHRcdFx0cmV0dXJuICF3aW5kb3dGb2N1c2VkO1xuXHRcdFx0Y2FzZSAnaW52aXNpYmxlJzpcblx0XHRcdFx0cmV0dXJuICF3aW5kb3dGb2N1c2VkICYmICF0aGlzLl9ob3N0LmlzVGVybWluYWxWaXNpYmxlKCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93T3NjOTlOb3RpZmljYXRpb24oc3RhdGU6IElPc2M5OU5vdGlmaWNhdGlvblN0YXRlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuX2dldE9zYzk5Tm90aWZpY2F0aW9uTWVzc2FnZShzdGF0ZSk7XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V2ZXJpdHkgPSBzdGF0ZS51cmdlbmN5ID09PSAyID8gU2V2ZXJpdHkuV2FybmluZyA6IFNldmVyaXR5LkluZm87XG5cdFx0Y29uc3QgcHJpb3JpdHkgPSB0aGlzLl9nZXRPc2M5OU5vdGlmaWNhdGlvblByaW9yaXR5KHN0YXRlLnVyZ2VuY3kpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHtcblx0XHRcdGlkOiAndGVybWluYWwnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbE5vdGlmaWNhdGlvblNvdXJjZScsICdUZXJtaW5hbCcpXG5cdFx0fTtcblx0XHRjb25zdCBidXR0b25zID0gc3RhdGUuYnV0dG9uc1BheWxvYWQubGVuZ3RoID4gMCA/IHN0YXRlLmJ1dHRvbnNQYXlsb2FkLnNwbGl0KCdcXHUyMDI4JykgOiBbXTtcblx0XHRjb25zdCBhY3Rpb25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRjb25zdCBoYW5kbGVSZWY6IHsgY3VycmVudDogSU5vdGlmaWNhdGlvbkhhbmRsZSB8IHVuZGVmaW5lZCB9ID0geyBjdXJyZW50OiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBhY3RpdmVSZWY6IHsgY3VycmVudDogSU9zYzk5QWN0aXZlTm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkIH0gPSB7IGN1cnJlbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHJlcG9ydEFjdGl2YXRpb24gPSAoYnV0dG9uSW5kZXg/OiBudW1iZXIsIGZvcmNlRm9jdXM/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoZm9yY2VGb2N1cyB8fCBzdGF0ZS5mb2N1c09uQWN0aXZhdGUpIHtcblx0XHRcdFx0dGhpcy5faG9zdC5mb2N1c1Rlcm1pbmFsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUucmVwb3J0T25BY3RpdmF0ZSkge1xuXHRcdFx0XHR0aGlzLl9zZW5kT3NjOTlBY3RpdmF0aW9uUmVwb3J0KHN0YXRlLmlkLCBidXR0b25JbmRleCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJ1dHRvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gYnV0dG9uc1tpXTtcblx0XHRcdGlmICghbGFiZWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBhY3Rpb25TdG9yZS5hZGQobmV3IEFjdGlvbihgdGVybWluYWwub3NjOTkuYnV0dG9uLiR7aX1gLCBsYWJlbCwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdGlmIChhY3RpdmVSZWYuY3VycmVudCkge1xuXHRcdFx0XHRcdGFjdGl2ZVJlZi5jdXJyZW50LmNsb3NlUmVhc29uID0gJ2J1dHRvbic7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVwb3J0QWN0aXZhdGlvbihpICsgMSk7XG5cdFx0XHRcdGhhbmRsZVJlZi5jdXJyZW50Py5jbG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdHNlY29uZGFyeUFjdGlvbnMucHVzaChhY3Rpb25TdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdCd0ZXJtaW5hbC5vc2M5OS5kaXNtaXNzJyxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbE5vdGlmaWNhdGlvbkRpc21pc3MnLCAnRGlzbWlzcycpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0aWYgKGFjdGl2ZVJlZi5jdXJyZW50KSB7XG5cdFx0XHRcdFx0YWN0aXZlUmVmLmN1cnJlbnQuY2xvc2VSZWFzb24gPSAnc2Vjb25kYXJ5Jztcblx0XHRcdFx0fVxuXHRcdFx0XHRoYW5kbGVSZWYuY3VycmVudD8uY2xvc2UoKTtcblx0XHRcdH1cblx0XHQpKSk7XG5cdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKGFjdGlvblN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J3Rlcm1pbmFsLm9zYzk5LmRpc2FibGUnLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsTm90aWZpY2F0aW9uRGlzYWJsZScsICdEaXNhYmxlIFRlcm1pbmFsIE5vdGlmaWNhdGlvbnMnKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hvc3QudXBkYXRlRW5hYmxlTm90aWZpY2F0aW9ucyhmYWxzZSk7XG5cdFx0XHRcdGlmIChhY3RpdmVSZWYuY3VycmVudCkge1xuXHRcdFx0XHRcdGFjdGl2ZVJlZi5jdXJyZW50LmNsb3NlUmVhc29uID0gJ3NlY29uZGFyeSc7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFuZGxlUmVmLmN1cnJlbnQ/LmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0KSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHsgcHJpbWFyeTogcHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeTogc2Vjb25kYXJ5QWN0aW9ucyB9O1xuXG5cdFx0aWYgKHN0YXRlLmlkKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX29zYzk5QWN0aXZlTm90aWZpY2F0aW9ucy5nZXQoc3RhdGUuaWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGFjdGl2ZVJlZi5jdXJyZW50ID0gZXhpc3Rpbmc7XG5cdFx0XHRcdGhhbmRsZVJlZi5jdXJyZW50ID0gZXhpc3RpbmcuaGFuZGxlO1xuXHRcdFx0XHRleGlzdGluZy5oYW5kbGUudXBkYXRlTWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdFx0ZXhpc3RpbmcuaGFuZGxlLnVwZGF0ZVNldmVyaXR5KHNldmVyaXR5KTtcblx0XHRcdFx0ZXhpc3RpbmcuaGFuZGxlLnVwZGF0ZUFjdGlvbnMoYWN0aW9ucyk7XG5cdFx0XHRcdGV4aXN0aW5nLmFjdGlvblN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZXhpc3RpbmcuYWN0aW9uU3RvcmUgPSBhY3Rpb25TdG9yZTtcblx0XHRcdFx0ZXhpc3RpbmcuZm9jdXNPbkFjdGl2YXRlID0gc3RhdGUuZm9jdXNPbkFjdGl2YXRlO1xuXHRcdFx0XHRleGlzdGluZy5yZXBvcnRPbkFjdGl2YXRlID0gc3RhdGUucmVwb3J0T25BY3RpdmF0ZTtcblx0XHRcdFx0ZXhpc3RpbmcucmVwb3J0T25DbG9zZSA9IHN0YXRlLnJlcG9ydE9uQ2xvc2U7XG5cdFx0XHRcdGV4aXN0aW5nLmF1dG9DbG9zZURpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0ZXhpc3RpbmcuYXV0b0Nsb3NlRGlzcG9zYWJsZSA9IHRoaXMuX3NjaGVkdWxlT3NjOTlBdXRvQ2xvc2UoZXhpc3RpbmcsIHN0YXRlLmF1dG9DbG9zZU1zKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5faG9zdC5ub3RpZnkoe1xuXHRcdFx0aWQ6IHN0YXRlLmlkID8gYHRlcm1pbmFsLm9zYzk5LiR7c3RhdGUuaWR9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHNldmVyaXR5LFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHNvdXJjZSxcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRwcmlvcml0eVxuXHRcdH0pO1xuXHRcdGhhbmRsZVJlZi5jdXJyZW50ID0gaGFuZGxlO1xuXG5cdFx0Y29uc3QgYWN0aXZlOiBJT3NjOTlBY3RpdmVOb3RpZmljYXRpb24gPSB7XG5cdFx0XHRpZDogc3RhdGUuaWQsXG5cdFx0XHRoYW5kbGUsXG5cdFx0XHRhY3Rpb25TdG9yZSxcblx0XHRcdGF1dG9DbG9zZURpc3Bvc2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdHJlcG9ydE9uQWN0aXZhdGU6IHN0YXRlLnJlcG9ydE9uQWN0aXZhdGUsXG5cdFx0XHRyZXBvcnRPbkNsb3NlOiBzdGF0ZS5yZXBvcnRPbkNsb3NlLFxuXHRcdFx0Zm9jdXNPbkFjdGl2YXRlOiBzdGF0ZS5mb2N1c09uQWN0aXZhdGUsXG5cdFx0XHRjbG9zZVJlYXNvbjogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRhY3RpdmVSZWYuY3VycmVudCA9IGFjdGl2ZTtcblx0XHRhY3RpdmUuYXV0b0Nsb3NlRGlzcG9zYWJsZSA9IHRoaXMuX3NjaGVkdWxlT3NjOTlBdXRvQ2xvc2UoYWN0aXZlLCBzdGF0ZS5hdXRvQ2xvc2VNcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGFuZGxlLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0aWYgKGFjdGl2ZS5yZXBvcnRPbkFjdGl2YXRlICYmIGFjdGl2ZS5jbG9zZVJlYXNvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChhY3RpdmUuZm9jdXNPbkFjdGl2YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5faG9zdC5mb2N1c1Rlcm1pbmFsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2VuZE9zYzk5QWN0aXZhdGlvblJlcG9ydChhY3RpdmUuaWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGl2ZS5yZXBvcnRPbkNsb3NlKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmRPc2M5OUNsb3NlUmVwb3J0KGFjdGl2ZS5pZCk7XG5cdFx0XHR9XG5cdFx0XHRhY3RpdmUuYWN0aW9uU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0YWN0aXZlLmF1dG9DbG9zZURpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdGlmIChhY3RpdmUuaWQpIHtcblx0XHRcdFx0dGhpcy5fb3NjOTlBY3RpdmVOb3RpZmljYXRpb25zLmRlbGV0ZShhY3RpdmUuaWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChhY3RpdmUuaWQpIHtcblx0XHRcdHRoaXMuX29zYzk5QWN0aXZlTm90aWZpY2F0aW9ucy5zZXQoYWN0aXZlLmlkLCBhY3RpdmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9zYzk5Tm90aWZpY2F0aW9uTWVzc2FnZShzdGF0ZTogSU9zYzk5Tm90aWZpY2F0aW9uU3RhdGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fc2FuaXRpemVPc2M5OU1lc3NhZ2VUZXh0KHN0YXRlLnRpdGxlKTtcblx0XHRjb25zdCBib2R5ID0gdGhpcy5fc2FuaXRpemVPc2M5OU1lc3NhZ2VUZXh0KHN0YXRlLmJvZHkpO1xuXHRcdGNvbnN0IGhhc1RpdGxlID0gdGl0bGUudHJpbSgpLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgaGFzQm9keSA9IGJvZHkudHJpbSgpLmxlbmd0aCA+IDA7XG5cdFx0aWYgKGhhc1RpdGxlICYmIGhhc0JvZHkpIHtcblx0XHRcdHJldHVybiBgJHt0aXRsZX06ICR7Ym9keX1gO1xuXHRcdH1cblx0XHRpZiAoaGFzVGl0bGUpIHtcblx0XHRcdHJldHVybiB0aXRsZTtcblx0XHR9XG5cdFx0aWYgKGhhc0JvZHkpIHtcblx0XHRcdHJldHVybiBib2R5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3NjOTlOb3RpZmljYXRpb25Qcmlvcml0eSh1cmdlbmN5OiBudW1iZXIgfCB1bmRlZmluZWQpOiBOb3RpZmljYXRpb25Qcmlvcml0eSB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoICh1cmdlbmN5KSB7XG5cdFx0XHRjYXNlIDA6XG5cdFx0XHRcdHJldHVybiBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQ7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHJldHVybiBOb3RpZmljYXRpb25Qcmlvcml0eS5ERUZBVUxUO1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHRyZXR1cm4gTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZU9zYzk5QXV0b0Nsb3NlKGFjdGl2ZTogSU9zYzk5QWN0aXZlTm90aWZpY2F0aW9uLCBhdXRvQ2xvc2VNczogbnVtYmVyIHwgdW5kZWZpbmVkKTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChhdXRvQ2xvc2VNcyA9PT0gdW5kZWZpbmVkIHx8IGF1dG9DbG9zZU1zIDw9IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRhY3RpdmUuY2xvc2VSZWFzb24gPSAnYXV0byc7XG5cdFx0XHRhY3RpdmUuaGFuZGxlLmNsb3NlKCk7XG5cdFx0fSwgYXV0b0Nsb3NlTXMsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2Nsb3NlT3NjOTlOb3RpZmljYXRpb24oaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fb3NjOTlBY3RpdmVOb3RpZmljYXRpb25zLmdldChpZCk7XG5cdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0YWN0aXZlLmNsb3NlUmVhc29uID0gJ3Byb3RvY29sJztcblx0XHRcdGFjdGl2ZS5oYW5kbGUuY2xvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fb3NjOTlQZW5kaW5nTm90aWZpY2F0aW9ucy5kZWxldGUoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZE9zYzk5UXVlcnlSZXNwb25zZShpZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gaWQgPz8gJzAnO1xuXHRcdHRoaXMuX3NlbmRPc2M5OVJlc3BvbnNlKFtcblx0XHRcdGBpPSR7cmVxdWVzdElkfWAsXG5cdFx0XHQncD0/Jyxcblx0XHRcdCdhPXJlcG9ydCxmb2N1cycsXG5cdFx0XHQnYz0xJyxcblx0XHRcdCdvPWFsd2F5cyx1bmZvY3VzZWQsaW52aXNpYmxlJyxcblx0XHRcdCdwPXRpdGxlLGJvZHksYnV0dG9ucyxjbG9zZSxhbGl2ZSw/Jyxcblx0XHRcdCd1PTAsMSwyJyxcblx0XHRcdCd3PTEnXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kT3NjOTlBbGl2ZVJlc3BvbnNlKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBpZCA/PyAnMCc7XG5cdFx0Y29uc3QgYWxpdmVJZHMgPSBBcnJheS5mcm9tKHRoaXMuX29zYzk5QWN0aXZlTm90aWZpY2F0aW9ucy5rZXlzKCkpLmpvaW4oJywnKTtcblx0XHR0aGlzLl9zZW5kT3NjOTlSZXNwb25zZShbXG5cdFx0XHRgaT0ke3JlcXVlc3RJZH1gLFxuXHRcdFx0J3A9YWxpdmUnXG5cdFx0XSwgYWxpdmVJZHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZE9zYzk5QWN0aXZhdGlvblJlcG9ydChpZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBidXR0b25JbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlcG9ydElkID0gaWQgPz8gJzAnO1xuXHRcdHRoaXMuX3NlbmRPc2M5OVJlc3BvbnNlKFtgaT0ke3JlcG9ydElkfWBdLCBidXR0b25JbmRleCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGJ1dHRvbkluZGV4KSA6ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRPc2M5OUNsb3NlUmVwb3J0KGlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZXBvcnRJZCA9IGlkID8/ICcwJztcblx0XHR0aGlzLl9zZW5kT3NjOTlSZXNwb25zZShbYGk9JHtyZXBvcnRJZH1gLCAncD1jbG9zZSddKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRPc2M5OVJlc3BvbnNlKG1ldGFkYXRhUGFydHM6IHN0cmluZ1tdLCBwYXlsb2FkOiBzdHJpbmcgPSAnJyk6IHZvaWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gbWV0YWRhdGFQYXJ0cy5qb2luKCc6Jyk7XG5cdFx0dGhpcy5faG9zdC53cml0ZVRvUHJvY2VzcyhgXFx4MWJdOTk7JHttZXRhZGF0YX07JHtwYXlsb2FkfVxceDFiXFxcXGApO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGNBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWSx1QkFB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
