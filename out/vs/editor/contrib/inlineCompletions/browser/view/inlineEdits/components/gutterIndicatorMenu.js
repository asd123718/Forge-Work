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
import { n } from "../../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeybindingLabel } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { autorun, constObservable, derived, observableFromEvent, observableValue } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { nativeHoverDelegate } from "../../../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { defaultKeybindingLabelStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, descriptionForeground, editorActionListForeground, editorHoverBorder } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, toggleShowCollapsedId } from "../../../controller/commandIds.js";
let GutterIndicatorMenuContent = class {
  constructor(_editorObs, _data, _close, _contextKeyService, _keybindingService, _commandService) {
    this._editorObs = _editorObs;
    this._data = _data;
    this._close = _close;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._inlineEditsShowCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.showCollapsed);
  }
  toDisposableLiveElement() {
    return this._createHoverContent().toDisposableLiveElement();
  }
  _createHoverContent() {
    const activeElement = observableValue("active", void 0);
    const createOptionArgs = (options) => {
      return {
        title: options.title,
        icon: options.icon,
        keybinding: typeof options.commandId === "string" ? this._getKeybinding(options.commandArgs ? void 0 : options.commandId) : derived(this, (reader) => typeof options.commandId === "string" ? void 0 : this._getKeybinding(options.commandArgs ? void 0 : options.commandId.read(reader)).read(reader)),
        isActive: activeElement.map((v) => v === options.id),
        onHoverChange: (v) => activeElement.set(v ? options.id : void 0, void 0),
        onAction: () => {
          const commandId = typeof options.commandId === "string" ? options.commandId : options.commandId.get();
          this._close(true, commandId);
          return this._commandService.executeCommand(commandId, ...options.commandArgs ?? []);
        }
      };
    };
    const extensionCommandGroups = this._data.extensionCommands.map(
      (group) => group.map((c, idx) => option(createOptionArgs({
        id: c.command.id + "_" + idx,
        title: c.command.title,
        icon: c.icon ?? Codicon.symbolEvent,
        commandId: c.command.id,
        commandArgs: c.command.arguments
      })))
    );
    const extensionCommandNodes = [];
    for (const group of extensionCommandGroups) {
      if (group.length > 0) {
        extensionCommandNodes.push(separator());
        extensionCommandNodes.push(...group);
      }
    }
    if (this._data.extensionCommandsOnly) {
      return hoverContent(extensionCommandNodes.slice(1));
    }
    const title = header(this._data.displayName);
    const gotoAndAccept = option(createOptionArgs({
      id: "gotoAndAccept",
      title: localize("gotoAndAccept", "Go To / Accept"),
      icon: Codicon.check,
      commandId: inlineSuggestCommitId
    }));
    const reject = option(createOptionArgs({
      id: "reject",
      title: localize("reject", "Reject"),
      icon: Codicon.close,
      commandId: hideInlineCompletionId
    }));
    const alternativeCommand = this._data.alternativeAction ? option(createOptionArgs({
      id: "alternativeCommand",
      title: this._data.alternativeAction.command.title,
      icon: this._data.alternativeAction.icon,
      commandId: inlineSuggestCommitAlternativeActionId
    })) : void 0;
    const showModelEnabled = false;
    const modelOptions = showModelEnabled ? this._data.modelInfo?.models.map((m) => option({
      title: m.name,
      icon: m.id === this._data.modelInfo?.currentModelId ? Codicon.check : Codicon.circle,
      keybinding: constObservable(void 0),
      isActive: activeElement.map((v) => v === "model_" + m.id),
      onHoverChange: (v) => activeElement.set(v ? "model_" + m.id : void 0, void 0),
      onAction: () => {
        this._close(true);
        this._data.setModelId?.(m.id);
      }
    })) ?? [] : [];
    const toggleCollapsedMode = this._inlineEditsShowCollapsed.map(
      (showCollapsed) => showCollapsed ? option(createOptionArgs({
        id: "showExpanded",
        title: localize("showExpanded", "Show Expanded"),
        icon: Codicon.expandAll,
        commandId: toggleShowCollapsedId
      })) : option(createOptionArgs({
        id: "showCollapsed",
        title: localize("showCollapsed", "Show Collapsed"),
        icon: Codicon.collapseAll,
        commandId: toggleShowCollapsedId
      }))
    );
    const snooze = option(createOptionArgs({
      id: "snooze",
      title: localize("snooze", "Snooze"),
      icon: Codicon.bellSlash,
      commandId: "editor.action.inlineSuggest.snooze"
    }));
    const settings = option(createOptionArgs({
      id: "settings",
      title: localize("settings", "Settings"),
      icon: Codicon.gear,
      commandId: "workbench.action.openSettings",
      commandArgs: ["@tag:nextEditSuggestions"]
    }));
    const actions = this._data.action ? [this._data.action] : [];
    const actionBarFooter = actions.length > 0 ? actionBar(
      actions.map((action) => ({
        id: action.id,
        label: action.title + "...",
        enabled: true,
        run: () => this._commandService.executeCommand(action.id, ...action.arguments ?? []),
        class: void 0,
        tooltip: action.tooltip ?? action.title
      })),
      {
        hoverDelegate: nativeHoverDelegate
        /* unable to show hover inside another hover */
      }
    ) : void 0;
    return hoverContent([
      title,
      gotoAndAccept,
      alternativeCommand,
      reject,
      toggleCollapsedMode,
      modelOptions.length ? separator() : void 0,
      ...modelOptions,
      snooze,
      settings,
      ...extensionCommandNodes,
      actionBarFooter ? separator() : void 0,
      actionBarFooter
    ]);
  }
  _getKeybinding(commandId) {
    if (!commandId) {
      return constObservable(void 0);
    }
    return observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId));
  }
};
GutterIndicatorMenuContent = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, ICommandService)
], GutterIndicatorMenuContent);
function hoverContent(content) {
  return n.div({
    class: "content",
    style: {
      margin: 4,
      minWidth: 180
    }
  }, content);
}
function header(title) {
  return n.div({
    class: "header",
    style: {
      color: asCssVariable(descriptionForeground),
      fontSize: "13px",
      fontWeight: "600",
      padding: "0 4px",
      lineHeight: 28
    }
  }, [title]);
}
function option(props) {
  return derived({ name: "inlineEdits.option" }, (_reader) => n.div({
    class: ["monaco-menu-option", props.isActive?.map((v) => v && "active")],
    onmouseenter: () => props.onHoverChange?.(true),
    onmouseleave: () => props.onHoverChange?.(false),
    onclick: props.onAction,
    onkeydown: (e) => {
      if (e.key === "Enter") {
        props.onAction?.();
      }
    },
    tabIndex: 0,
    style: {
      borderRadius: 3
      // same as hover widget border radius
    }
  }, [
    n.elem("span", {
      style: {
        fontSize: 16,
        display: "flex"
      }
    }, [ThemeIcon.isThemeIcon(props.icon) ? renderIcon(props.icon) : props.icon.map((icon) => renderIcon(icon))]),
    n.elem("span", {}, [props.title]),
    n.div({
      style: { marginLeft: "auto" },
      ref: (elem) => {
        const keybindingLabel = _reader.store.add(new KeybindingLabel(elem, OS, {
          disableTitle: true,
          ...defaultKeybindingLabelStyles,
          keybindingLabelShadow: void 0,
          keybindingLabelForeground: asCssVariable(descriptionForeground),
          keybindingLabelBackground: "transparent",
          keybindingLabelBorder: "transparent",
          keybindingLabelBottomBorder: void 0
        }));
        _reader.store.add(autorun((reader) => {
          keybindingLabel.set(props.keybinding.read(reader));
        }));
      }
    })
  ]));
}
function actionBar(actions, options) {
  return derived({ name: "inlineEdits.actionBar" }, (_reader) => n.div({
    class: ["action-widget-action-bar"],
    style: {
      padding: "3px 24px"
    }
  }, [
    n.div({
      ref: (elem) => {
        const actionBar2 = _reader.store.add(new ActionBar(elem, options));
        actionBar2.push(actions, { icon: false, label: true });
      }
    })
  ]));
}
function separator() {
  return n.div({
    id: "inline-edit-gutter-indicator-menu-separator",
    class: "menu-separator",
    style: {
      color: asCssVariable(editorActionListForeground),
      padding: "2px 0"
    }
  }, n.div({
    style: {
      borderBottom: `1px solid ${asCssVariable(editorHoverBorder)}`
    }
  }));
}
export {
  GutterIndicatorMenuContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcY29tcG9uZW50c1xcZ3V0dGVySW5kaWNhdG9yTWVudS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hpbGROb2RlLCBMaXZlRWxlbWVudCwgbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uQmFyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGRlc2NyaXB0aW9uRm9yZWdyb3VuZCwgZWRpdG9yQWN0aW9uTGlzdEZvcmVncm91bmQsIGVkaXRvckhvdmVyQm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBoaWRlSW5saW5lQ29tcGxldGlvbklkLCBpbmxpbmVTdWdnZXN0Q29tbWl0QWx0ZXJuYXRpdmVBY3Rpb25JZCwgaW5saW5lU3VnZ2VzdENvbW1pdElkLCB0b2dnbGVTaG93Q29sbGFwc2VkSWQgfSBmcm9tICcuLi8uLi8uLi9jb250cm9sbGVyL2NvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgRmlyc3RGbkFyZywgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEgfSBmcm9tICcuL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgR3V0dGVySW5kaWNhdG9yTWVudUNvbnRlbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0c1Nob3dDb2xsYXBzZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9iczogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGF0YTogSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlOiAoZm9jdXNFZGl0b3I6IGJvb2xlYW4sIGNvbW1hbmRJZD86IHN0cmluZykgPT4gdm9pZCxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5faW5saW5lRWRpdHNTaG93Q29sbGFwc2VkID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkubWFwKHMgPT4gcy5lZGl0cy5zaG93Q29sbGFwc2VkKTtcblx0fVxuXG5cdHB1YmxpYyB0b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpOiBMaXZlRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUhvdmVyQ29udGVudCgpLnRvRGlzcG9zYWJsZUxpdmVFbGVtZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVIb3ZlckNvbnRlbnQoKSB7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdhY3RpdmUnLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgY3JlYXRlT3B0aW9uQXJncyA9IChvcHRpb25zOiB7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGljb246IElPYnNlcnZhYmxlPFRoZW1lSWNvbj4gfCBUaGVtZUljb247IGNvbW1hbmRJZDogc3RyaW5nIHwgSU9ic2VydmFibGU8c3RyaW5nPjsgY29tbWFuZEFyZ3M/OiB1bmtub3duW10gfSk6IEZpcnN0Rm5Bcmc8dHlwZW9mIG9wdGlvbj4gPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IG9wdGlvbnMudGl0bGUsXG5cdFx0XHRcdGljb246IG9wdGlvbnMuaWNvbixcblx0XHRcdFx0a2V5YmluZGluZzogdHlwZW9mIG9wdGlvbnMuY29tbWFuZElkID09PSAnc3RyaW5nJyA/IHRoaXMuX2dldEtleWJpbmRpbmcob3B0aW9ucy5jb21tYW5kQXJncyA/IHVuZGVmaW5lZCA6IG9wdGlvbnMuY29tbWFuZElkKSA6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHR5cGVvZiBvcHRpb25zLmNvbW1hbmRJZCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiB0aGlzLl9nZXRLZXliaW5kaW5nKG9wdGlvbnMuY29tbWFuZEFyZ3MgPyB1bmRlZmluZWQgOiBvcHRpb25zLmNvbW1hbmRJZC5yZWFkKHJlYWRlcikpLnJlYWQocmVhZGVyKSksXG5cdFx0XHRcdGlzQWN0aXZlOiBhY3RpdmVFbGVtZW50Lm1hcCh2ID0+IHYgPT09IG9wdGlvbnMuaWQpLFxuXHRcdFx0XHRvbkhvdmVyQ2hhbmdlOiB2ID0+IGFjdGl2ZUVsZW1lbnQuc2V0KHYgPyBvcHRpb25zLmlkIDogdW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRvbkFjdGlvbjogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IHR5cGVvZiBvcHRpb25zLmNvbW1hbmRJZCA9PT0gJ3N0cmluZycgPyBvcHRpb25zLmNvbW1hbmRJZCA6IG9wdGlvbnMuY29tbWFuZElkLmdldCgpO1xuXHRcdFx0XHRcdHRoaXMuX2Nsb3NlKHRydWUsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCwgLi4uKG9wdGlvbnMuY29tbWFuZEFyZ3MgPz8gW10pKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkNvbW1hbmRHcm91cHMgPSB0aGlzLl9kYXRhLmV4dGVuc2lvbkNvbW1hbmRzLm1hcChncm91cCA9PlxuXHRcdFx0Z3JvdXAubWFwKChjLCBpZHgpID0+IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdFx0aWQ6IGMuY29tbWFuZC5pZCArICdfJyArIGlkeCxcblx0XHRcdFx0dGl0bGU6IGMuY29tbWFuZC50aXRsZSxcblx0XHRcdFx0aWNvbjogYy5pY29uID8/IENvZGljb24uc3ltYm9sRXZlbnQsXG5cdFx0XHRcdGNvbW1hbmRJZDogYy5jb21tYW5kLmlkLFxuXHRcdFx0XHRjb21tYW5kQXJnczogYy5jb21tYW5kLmFyZ3VtZW50c1xuXHRcdFx0fSkpKVxuXHRcdCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25Db21tYW5kTm9kZXM6IENoaWxkTm9kZSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZXh0ZW5zaW9uQ29tbWFuZEdyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXh0ZW5zaW9uQ29tbWFuZE5vZGVzLnB1c2goc2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRleHRlbnNpb25Db21tYW5kTm9kZXMucHVzaCguLi5ncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RhdGEuZXh0ZW5zaW9uQ29tbWFuZHNPbmx5KSB7XG5cdFx0XHQvLyBkcm9wIGxlYWRpbmcgc2VwYXJhdG9yXG5cdFx0XHRyZXR1cm4gaG92ZXJDb250ZW50KGV4dGVuc2lvbkNvbW1hbmROb2Rlcy5zbGljZSgxKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGl0bGUgPSBoZWFkZXIodGhpcy5fZGF0YS5kaXNwbGF5TmFtZSk7XG5cblx0XHRjb25zdCBnb3RvQW5kQWNjZXB0ID0gb3B0aW9uKGNyZWF0ZU9wdGlvbkFyZ3Moe1xuXHRcdFx0aWQ6ICdnb3RvQW5kQWNjZXB0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ290b0FuZEFjY2VwdCcsIFwiR28gVG8gLyBBY2NlcHRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0Y29tbWFuZElkOiBpbmxpbmVTdWdnZXN0Q29tbWl0SWQsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVqZWN0ID0gb3B0aW9uKGNyZWF0ZU9wdGlvbkFyZ3Moe1xuXHRcdFx0aWQ6ICdyZWplY3QnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZWplY3QnLCBcIlJlamVjdFwiKSxcblx0XHRcdGljb246IENvZGljb24uY2xvc2UsXG5cdFx0XHRjb21tYW5kSWQ6IGhpZGVJbmxpbmVDb21wbGV0aW9uSWRcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhbHRlcm5hdGl2ZUNvbW1hbmQgPSB0aGlzLl9kYXRhLmFsdGVybmF0aXZlQWN0aW9uID8gb3B0aW9uKGNyZWF0ZU9wdGlvbkFyZ3Moe1xuXHRcdFx0aWQ6ICdhbHRlcm5hdGl2ZUNvbW1hbmQnLFxuXHRcdFx0dGl0bGU6IHRoaXMuX2RhdGEuYWx0ZXJuYXRpdmVBY3Rpb24uY29tbWFuZC50aXRsZSxcblx0XHRcdGljb246IHRoaXMuX2RhdGEuYWx0ZXJuYXRpdmVBY3Rpb24uaWNvbixcblx0XHRcdGNvbW1hbmRJZDogaW5saW5lU3VnZ2VzdENvbW1pdEFsdGVybmF0aXZlQWN0aW9uSWQsXG5cdFx0fSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2hvd01vZGVsRW5hYmxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG1vZGVsT3B0aW9ucyA9IHNob3dNb2RlbEVuYWJsZWQgPyB0aGlzLl9kYXRhLm1vZGVsSW5mbz8ubW9kZWxzLm1hcCgobTogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSkgPT4gb3B0aW9uKHtcblx0XHRcdHRpdGxlOiBtLm5hbWUsXG5cdFx0XHRpY29uOiBtLmlkID09PSB0aGlzLl9kYXRhLm1vZGVsSW5mbz8uY3VycmVudE1vZGVsSWQgPyBDb2RpY29uLmNoZWNrIDogQ29kaWNvbi5jaXJjbGUsXG5cdFx0XHRrZXliaW5kaW5nOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRcdGlzQWN0aXZlOiBhY3RpdmVFbGVtZW50Lm1hcCh2ID0+IHYgPT09ICdtb2RlbF8nICsgbS5pZCksXG5cdFx0XHRvbkhvdmVyQ2hhbmdlOiB2ID0+IGFjdGl2ZUVsZW1lbnQuc2V0KHYgPyAnbW9kZWxfJyArIG0uaWQgOiB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRvbkFjdGlvbjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jbG9zZSh0cnVlKTtcblx0XHRcdFx0dGhpcy5fZGF0YS5zZXRNb2RlbElkPy4obS5pZCk7XG5cdFx0XHR9LFxuXHRcdH0pKSA/PyBbXSA6IFtdO1xuXG5cdFx0Y29uc3QgdG9nZ2xlQ29sbGFwc2VkTW9kZSA9IHRoaXMuX2lubGluZUVkaXRzU2hvd0NvbGxhcHNlZC5tYXAoc2hvd0NvbGxhcHNlZCA9PiBzaG93Q29sbGFwc2VkID9cblx0XHRcdG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdFx0aWQ6ICdzaG93RXhwYW5kZWQnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nob3dFeHBhbmRlZCcsIFwiU2hvdyBFeHBhbmRlZFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5leHBhbmRBbGwsXG5cdFx0XHRcdGNvbW1hbmRJZDogdG9nZ2xlU2hvd0NvbGxhcHNlZElkXG5cdFx0XHR9KSlcblx0XHRcdDogb3B0aW9uKGNyZWF0ZU9wdGlvbkFyZ3Moe1xuXHRcdFx0XHRpZDogJ3Nob3dDb2xsYXBzZWQnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nob3dDb2xsYXBzZWQnLCBcIlNob3cgQ29sbGFwc2VkXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0XHRjb21tYW5kSWQ6IHRvZ2dsZVNob3dDb2xsYXBzZWRJZFxuXHRcdFx0fSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHNub296ZSA9IG9wdGlvbihjcmVhdGVPcHRpb25BcmdzKHtcblx0XHRcdGlkOiAnc25vb3plJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc25vb3plJywgXCJTbm9vemVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmJlbGxTbGFzaCxcblx0XHRcdGNvbW1hbmRJZDogJ2VkaXRvci5hY3Rpb24uaW5saW5lU3VnZ2VzdC5zbm9vemUnXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBvcHRpb24oY3JlYXRlT3B0aW9uQXJncyh7XG5cdFx0XHRpZDogJ3NldHRpbmdzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nZWFyLFxuXHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0Y29tbWFuZEFyZ3M6IFsnQHRhZzpuZXh0RWRpdFN1Z2dlc3Rpb25zJ11cblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5fZGF0YS5hY3Rpb24gPyBbdGhpcy5fZGF0YS5hY3Rpb25dIDogW107XG5cdFx0Y29uc3QgYWN0aW9uQmFyRm9vdGVyID0gYWN0aW9ucy5sZW5ndGggPiAwID8gYWN0aW9uQmFyKFxuXHRcdFx0YWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRcdGlkOiBhY3Rpb24uaWQsXG5cdFx0XHRcdGxhYmVsOiBhY3Rpb24udGl0bGUgKyAnLi4uJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3Rpb24uaWQsIC4uLihhY3Rpb24uYXJndW1lbnRzID8/IFtdKSksXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2x0aXA6IGFjdGlvbi50b29sdGlwID8/IGFjdGlvbi50aXRsZVxuXHRcdFx0fSkpLFxuXHRcdFx0eyBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIC8qIHVuYWJsZSB0byBzaG93IGhvdmVyIGluc2lkZSBhbm90aGVyIGhvdmVyICovIH1cblx0XHQpIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIGhvdmVyQ29udGVudChbXG5cdFx0XHR0aXRsZSxcblx0XHRcdGdvdG9BbmRBY2NlcHQsXG5cdFx0XHRhbHRlcm5hdGl2ZUNvbW1hbmQsXG5cdFx0XHRyZWplY3QsXG5cdFx0XHR0b2dnbGVDb2xsYXBzZWRNb2RlLFxuXHRcdFx0bW9kZWxPcHRpb25zLmxlbmd0aCA/IHNlcGFyYXRvcigpIDogdW5kZWZpbmVkLFxuXHRcdFx0Li4ubW9kZWxPcHRpb25zLFxuXHRcdFx0c25vb3plLFxuXHRcdFx0c2V0dGluZ3MsXG5cblx0XHRcdC4uLmV4dGVuc2lvbkNvbW1hbmROb2RlcyxcblxuXHRcdFx0YWN0aW9uQmFyRm9vdGVyID8gc2VwYXJhdG9yKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb25CYXJGb290ZXJcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEtleWJpbmRpbmcoY29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWNvbW1hbmRJZCkge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsICgpID0+IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZElkKSk7IC8vIFRPRE86IHVzZSBjb250ZXh0a2V5c2VydmljZSB0byB1c2UgZGlmZmVyZW50IHJlbmRlcmluZ3Ncblx0fVxufVxuXG5mdW5jdGlvbiBob3ZlckNvbnRlbnQoY29udGVudDogQ2hpbGROb2RlKSB7XG5cdHJldHVybiBuLmRpdih7XG5cdFx0Y2xhc3M6ICdjb250ZW50Jyxcblx0XHRzdHlsZToge1xuXHRcdFx0bWFyZ2luOiA0LFxuXHRcdFx0bWluV2lkdGg6IDE4MCxcblx0XHR9XG5cdH0sIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBoZWFkZXIodGl0bGU6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz4pIHtcblx0cmV0dXJuIG4uZGl2KHtcblx0XHRjbGFzczogJ2hlYWRlcicsXG5cdFx0c3R5bGU6IHtcblx0XHRcdGNvbG9yOiBhc0Nzc1ZhcmlhYmxlKGRlc2NyaXB0aW9uRm9yZWdyb3VuZCksXG5cdFx0XHRmb250U2l6ZTogJzEzcHgnLFxuXHRcdFx0Zm9udFdlaWdodDogJzYwMCcsXG5cdFx0XHRwYWRkaW5nOiAnMCA0cHgnLFxuXHRcdFx0bGluZUhlaWdodDogMjgsXG5cdFx0fVxuXHR9LCBbdGl0bGVdKTtcbn1cblxuZnVuY3Rpb24gb3B0aW9uKHByb3BzOiB7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGljb246IElPYnNlcnZhYmxlPFRoZW1lSWNvbj4gfCBUaGVtZUljb247XG5cdGtleWJpbmRpbmc6IElPYnNlcnZhYmxlPFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZD47XG5cdGlzQWN0aXZlPzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdG9uSG92ZXJDaGFuZ2U/OiAoaXNIb3ZlcmVkOiBib29sZWFuKSA9PiB2b2lkO1xuXHRvbkFjdGlvbj86ICgpID0+IHZvaWQ7XG59KSB7XG5cdHJldHVybiBkZXJpdmVkKHsgbmFtZTogJ2lubGluZUVkaXRzLm9wdGlvbicgfSwgKF9yZWFkZXIpID0+IG4uZGl2KHtcblx0XHRjbGFzczogWydtb25hY28tbWVudS1vcHRpb24nLCBwcm9wcy5pc0FjdGl2ZT8ubWFwKHYgPT4gdiAmJiAnYWN0aXZlJyldLFxuXHRcdG9ubW91c2VlbnRlcjogKCkgPT4gcHJvcHMub25Ib3ZlckNoYW5nZT8uKHRydWUpLFxuXHRcdG9ubW91c2VsZWF2ZTogKCkgPT4gcHJvcHMub25Ib3ZlckNoYW5nZT8uKGZhbHNlKSxcblx0XHRvbmNsaWNrOiBwcm9wcy5vbkFjdGlvbixcblx0XHRvbmtleWRvd246IGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG5cdFx0XHRcdHByb3BzLm9uQWN0aW9uPy4oKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHRhYkluZGV4OiAwLFxuXHRcdHN0eWxlOiB7XG5cdFx0XHRib3JkZXJSYWRpdXM6IDMsIC8vIHNhbWUgYXMgaG92ZXIgd2lkZ2V0IGJvcmRlciByYWRpdXNcblx0XHR9XG5cdH0sIFtcblx0XHRuLmVsZW0oJ3NwYW4nLCB7XG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHRmb250U2l6ZTogMTYsXG5cdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdH1cblx0XHR9LCBbVGhlbWVJY29uLmlzVGhlbWVJY29uKHByb3BzLmljb24pID8gcmVuZGVySWNvbihwcm9wcy5pY29uKSA6IHByb3BzLmljb24ubWFwKGljb24gPT4gcmVuZGVySWNvbihpY29uKSldKSxcblx0XHRuLmVsZW0oJ3NwYW4nLCB7fSwgW3Byb3BzLnRpdGxlXSksXG5cdFx0bi5kaXYoe1xuXHRcdFx0c3R5bGU6IHsgbWFyZ2luTGVmdDogJ2F1dG8nIH0sXG5cdFx0XHRyZWY6IGVsZW0gPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSBfcmVhZGVyLnN0b3JlLmFkZChuZXcgS2V5YmluZGluZ0xhYmVsKGVsZW0sIE9TLCB7XG5cdFx0XHRcdFx0ZGlzYWJsZVRpdGxlOiB0cnVlLFxuXHRcdFx0XHRcdC4uLmRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMsXG5cdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsU2hhZG93OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsRm9yZWdyb3VuZDogYXNDc3NWYXJpYWJsZShkZXNjcmlwdGlvbkZvcmVncm91bmQpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJhY2tncm91bmQ6ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQm9yZGVyOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJvdHRvbUJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdF9yZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRrZXliaW5kaW5nTGFiZWwuc2V0KHByb3BzLmtleWJpbmRpbmcucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdF0pKTtcbn1cblxuLy8gVE9ETzogbWFrZSB0aGlzIG9ic2VydmFibGVcbmZ1bmN0aW9uIGFjdGlvbkJhcihhY3Rpb25zOiBJQWN0aW9uW10sIG9wdGlvbnM6IElBY3Rpb25CYXJPcHRpb25zKSB7XG5cdHJldHVybiBkZXJpdmVkKHsgbmFtZTogJ2lubGluZUVkaXRzLmFjdGlvbkJhcicgfSwgKF9yZWFkZXIpID0+IG4uZGl2KHtcblx0XHRjbGFzczogWydhY3Rpb24td2lkZ2V0LWFjdGlvbi1iYXInXSxcblx0XHRzdHlsZToge1xuXHRcdFx0cGFkZGluZzogJzNweCAyNHB4Jyxcblx0XHR9XG5cdH0sIFtcblx0XHRuLmRpdih7XG5cdFx0XHRyZWY6IGVsZW0gPT4ge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25CYXIgPSBfcmVhZGVyLnN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGVsZW0sIG9wdGlvbnMpKTtcblx0XHRcdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSlcblx0XSkpO1xufVxuXG5mdW5jdGlvbiBzZXBhcmF0b3IoKSB7XG5cdHJldHVybiBuLmRpdih7XG5cdFx0aWQ6ICdpbmxpbmUtZWRpdC1ndXR0ZXItaW5kaWNhdG9yLW1lbnUtc2VwYXJhdG9yJyxcblx0XHRjbGFzczogJ21lbnUtc2VwYXJhdG9yJyxcblx0XHRzdHlsZToge1xuXHRcdFx0Y29sb3I6IGFzQ3NzVmFyaWFibGUoZWRpdG9yQWN0aW9uTGlzdEZvcmVncm91bmQpLFxuXHRcdFx0cGFkZGluZzogJzJweCAwJyxcblx0XHR9XG5cdH0sIG4uZGl2KHtcblx0XHRzdHlsZToge1xuXHRcdFx0Ym9yZGVyQm90dG9tOiBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShlZGl0b3JIb3ZlckJvcmRlcil9YCxcblx0XHR9XG5cdH0pKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBU0EsU0FBaUMsU0FBUztBQUMxQyxTQUFTLGlCQUFvQztBQUM3QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGVBQWU7QUFFeEIsU0FBc0IsU0FBUyxpQkFBaUIsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3JHLFNBQVMsVUFBVTtBQUNuQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdC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
