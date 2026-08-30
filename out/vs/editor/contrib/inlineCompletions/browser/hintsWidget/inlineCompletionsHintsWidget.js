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
import { h, n } from "../../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../../base/browser/markdownRenderer.js";
import { ActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { KeybindingLabel, unthemedKeybindingLabelOptions } from "../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { equals } from "../../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { createHotClass } from "../../../../../base/common/hotReloadHelpers.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, derivedObservableWithCache, observableFromEvent } from "../../../../../base/common/observable.js";
import { OS } from "../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { MenuEntryActionViewItem, getActionBarActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { WorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { registerIcon } from "../../../../../platform/theme/common/iconRegistry.js";
import { ContentWidgetPositionPreference } from "../../../../browser/editorBrowser.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { Position } from "../../../../common/core/position.js";
import { InlineCompletionTriggerKind } from "../../../../common/languages.js";
import { PositionAffinity } from "../../../../common/model.js";
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from "../controller/commandIds.js";
import "./inlineCompletionsHintsWidget.css";
let InlineCompletionsHintsWidget = class extends Disposable {
  constructor(editor, model, instantiationService) {
    super();
    this.editor = editor;
    this.model = model;
    this.instantiationService = instantiationService;
    this.alwaysShowToolbar = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).showToolbar === "always");
    this.sessionPosition = void 0;
    this.position = derived(this, (reader) => {
      const ghostText = this.model.read(reader)?.primaryGhostText.read(reader);
      if (!this.alwaysShowToolbar.read(reader) || !ghostText || ghostText.parts.length === 0) {
        this.sessionPosition = void 0;
        return null;
      }
      const firstColumn = ghostText.parts[0].column;
      if (this.sessionPosition && this.sessionPosition.lineNumber !== ghostText.lineNumber) {
        this.sessionPosition = void 0;
      }
      const position = new Position(ghostText.lineNumber, Math.min(firstColumn, this.sessionPosition?.column ?? Number.MAX_SAFE_INTEGER));
      this.sessionPosition = position;
      return position;
    });
    this._register(autorunWithStore((reader, store) => {
      const model2 = this.model.read(reader);
      if (!model2 || !this.alwaysShowToolbar.read(reader)) {
        return;
      }
      const contentWidgetValue = derived((reader2) => {
        const contentWidget = reader2.store.add(this.instantiationService.createInstance(
          InlineSuggestionHintsContentWidget.hot.read(reader2),
          this.editor,
          true,
          this.position,
          model2.selectedInlineCompletionIndex,
          model2.inlineCompletionsCount,
          model2.activeCommands,
          model2.warning,
          () => {
          }
        ));
        editor.addContentWidget(contentWidget);
        reader2.store.add(toDisposable(() => editor.removeContentWidget(contentWidget)));
        reader2.store.add(autorun((reader3) => {
          const position = this.position.read(reader3);
          if (!position) {
            return;
          }
          if (model2.lastTriggerKind.read(reader3) !== InlineCompletionTriggerKind.Explicit) {
            model2.triggerExplicitly();
          }
        }));
        return contentWidget;
      });
      const hadPosition = derivedObservableWithCache(this, (reader2, lastValue) => !!this.position.read(reader2) || !!lastValue);
      store.add(autorun((reader2) => {
        if (hadPosition.read(reader2)) {
          contentWidgetValue.read(reader2);
        }
      }));
    }));
  }
};
InlineCompletionsHintsWidget = __decorateClass([
  __decorateParam(2, IInstantiationService)
], InlineCompletionsHintsWidget);
const inlineSuggestionHintsNextIcon = registerIcon("inline-suggestion-hints-next", Codicon.chevronRight, localize("parameterHintsNextIcon", "Icon for show next parameter hint."));
const inlineSuggestionHintsPreviousIcon = registerIcon("inline-suggestion-hints-previous", Codicon.chevronLeft, localize("parameterHintsPreviousIcon", "Icon for show previous parameter hint."));
let InlineSuggestionHintsContentWidget = class extends Disposable {
  constructor(editor, withBorder, _position, _currentSuggestionIdx, _suggestionCount, _extraCommands, _warning, _relayout, _commandService, instantiationService, keybindingService, _contextKeyService, _menuService) {
    super();
    this.editor = editor;
    this.withBorder = withBorder;
    this._position = _position;
    this._currentSuggestionIdx = _currentSuggestionIdx;
    this._suggestionCount = _suggestionCount;
    this._extraCommands = _extraCommands;
    this._warning = _warning;
    this._relayout = _relayout;
    this._commandService = _commandService;
    this.keybindingService = keybindingService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this.id = `InlineSuggestionHintsContentWidget${InlineSuggestionHintsContentWidget.id++}`;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = false;
    this._warningMessageContentNode = derived((reader) => {
      const warning = this._warning.read(reader);
      if (!warning) {
        return void 0;
      }
      if (typeof warning.message === "string") {
        return warning.message;
      }
      const markdownElement = reader.store.add(renderMarkdown(warning.message));
      return markdownElement.element;
    });
    this._warningMessageNode = n.div({
      class: "warningMessage",
      style: {
        maxWidth: 400,
        margin: 4,
        marginBottom: 4,
        display: derived((reader) => this._warning.read(reader) ? "block" : "none")
      }
    }, [
      this._warningMessageContentNode
    ]).keepUpdated(this._store);
    this.nodes = h("div.inlineSuggestionsHints", { className: this.withBorder ? "monaco-hover monaco-hover-content" : "" }, [
      this._warningMessageNode.element,
      h("div@toolBar")
    ]);
    this.previousAction = this._register(this.createCommandAction(showPreviousInlineSuggestionActionId, localize("previous", "Previous"), ThemeIcon.asClassName(inlineSuggestionHintsPreviousIcon)));
    this.availableSuggestionCountAction = this._register(new Action("inlineSuggestionHints.availableSuggestionCount", "", void 0, false));
    this.nextAction = this._register(this.createCommandAction(showNextInlineSuggestionActionId, localize("next", "Next"), ThemeIcon.asClassName(inlineSuggestionHintsNextIcon)));
    this.inlineCompletionsActionsMenus = this._register(this._menuService.createMenu(
      MenuId.InlineCompletionsActions,
      this._contextKeyService
    ));
    this.clearAvailableSuggestionCountLabelDebounced = this._register(new RunOnceScheduler(() => {
      this.availableSuggestionCountAction.label = "";
    }, 100));
    this.disableButtonsDebounced = this._register(new RunOnceScheduler(() => {
      this.previousAction.enabled = this.nextAction.enabled = false;
    }, 100));
    this._register(autorun((reader) => {
      this._warningMessageContentNode.read(reader);
      this._warningMessageNode.readEffect(reader);
      this._relayout();
    }));
    this.toolBar = this._register(instantiationService.createInstance(CustomizedMenuWorkbenchToolBar, this.nodes.toolBar, MenuId.InlineSuggestionToolbar, {
      menuOptions: { renderShortTitle: true },
      toolbarOptions: { primaryGroup: (g) => g.startsWith("primary") },
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          return instantiationService.createInstance(StatusBarViewItem, action, void 0);
        }
        if (action === this.availableSuggestionCountAction) {
          const a = new ActionViewItemWithClassName(void 0, action, { label: true, icon: false });
          a.setClass("availableSuggestionCount");
          return a;
        }
        return void 0;
      },
      telemetrySource: "InlineSuggestionToolbar"
    }));
    this.toolBar.setPrependedPrimaryActions([
      this.previousAction,
      this.availableSuggestionCountAction,
      this.nextAction
    ]);
    this._register(this.toolBar.onDidChangeDropdownVisibility((e) => {
      InlineSuggestionHintsContentWidget._dropDownVisible = e;
    }));
    this._register(autorun((reader) => {
      this._position.read(reader);
      this.editor.layoutContentWidget(this);
    }));
    this._register(autorun((reader) => {
      const suggestionCount = this._suggestionCount.read(reader);
      const currentSuggestionIdx = this._currentSuggestionIdx.read(reader);
      if (suggestionCount !== void 0) {
        this.clearAvailableSuggestionCountLabelDebounced.cancel();
        this.availableSuggestionCountAction.label = `${currentSuggestionIdx + 1}/${suggestionCount}`;
      } else {
        this.clearAvailableSuggestionCountLabelDebounced.schedule();
      }
      if (suggestionCount !== void 0 && suggestionCount > 1) {
        this.disableButtonsDebounced.cancel();
        this.previousAction.enabled = this.nextAction.enabled = true;
      } else {
        this.disableButtonsDebounced.schedule();
      }
    }));
    this._register(autorun((reader) => {
      const extraCommands = this._extraCommands.read(reader);
      const extraActions = extraCommands.map((c) => ({
        class: void 0,
        id: c.command.id,
        enabled: true,
        tooltip: c.command.tooltip || "",
        label: c.command.title,
        run: () => this._commandService.executeCommand(c.command.id, ...c.command.arguments ?? [])
      }));
      for (const [_, group] of this.inlineCompletionsActionsMenus.getActions()) {
        for (const action of group) {
          if (action instanceof MenuItemAction) {
            extraActions.push(action);
          }
        }
      }
      if (extraActions.length > 0) {
        extraActions.unshift(new Separator());
      }
      this.toolBar.setAdditionalSecondaryActions(extraActions);
    }));
  }
  static get dropDownVisible() {
    return this._dropDownVisible;
  }
  createCommandAction(commandId, label, iconClassName) {
    const action = new Action(
      commandId,
      label,
      iconClassName,
      true,
      () => this._commandService.executeCommand(commandId)
    );
    action.tooltip = this.keybindingService.appendKeybinding(label, commandId, this._contextKeyService);
    return action;
  }
  getId() {
    return this.id;
  }
  getDomNode() {
    return this.nodes.root;
  }
  getPosition() {
    return {
      position: this._position.get(),
      preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW],
      positionAffinity: PositionAffinity.LeftOfInjectedText
    };
  }
};
InlineSuggestionHintsContentWidget.hot = createHotClass(InlineSuggestionHintsContentWidget);
InlineSuggestionHintsContentWidget._dropDownVisible = false;
InlineSuggestionHintsContentWidget.id = 0;
InlineSuggestionHintsContentWidget = __decorateClass([
  __decorateParam(8, ICommandService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, IMenuService)
], InlineSuggestionHintsContentWidget);
class ActionViewItemWithClassName extends ActionViewItem {
  constructor() {
    super(...arguments);
    this._className = void 0;
  }
  setClass(className) {
    this._className = className;
  }
  render(container) {
    super.render(container);
    if (this._className) {
      container.classList.add(this._className);
    }
  }
  updateTooltip() {
  }
}
class StatusBarViewItem extends MenuEntryActionViewItem {
  updateLabel() {
    const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
    if (!kb) {
      return super.updateLabel();
    }
    if (this.label) {
      const div = h("div.keybinding").root;
      const k = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
      k.set(kb);
      this.label.textContent = this._action.label;
      this.label.appendChild(div);
      this.label.classList.add("inlineSuggestionStatusBarItemLabel");
    }
  }
  updateTooltip() {
  }
}
let CustomizedMenuWorkbenchToolBar = class extends WorkbenchToolBar {
  constructor(container, menuId, options2, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService) {
    super(container, { resetMenu: menuId, ...options2 }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
    this.menuId = menuId;
    this.options2 = options2;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.menu = this._store.add(this.menuService.createMenu(this.menuId, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
    this.additionalActions = [];
    this.prependedPrimaryActions = [];
    this.additionalPrimaryActions = [];
    this._store.add(this.menu.onDidChange(() => this.updateToolbar()));
    this.updateToolbar();
  }
  updateToolbar() {
    const { primary, secondary } = getActionBarActions(
      this.menu.getActions(this.options2?.menuOptions),
      this.options2?.toolbarOptions?.primaryGroup,
      this.options2?.toolbarOptions?.shouldInlineSubmenu,
      this.options2?.toolbarOptions?.useSeparatorsInPrimaryActions
    );
    secondary.push(...this.additionalActions);
    primary.unshift(...this.prependedPrimaryActions);
    primary.push(...this.additionalPrimaryActions);
    this.setActions(primary, secondary);
  }
  setPrependedPrimaryActions(actions) {
    if (equals(this.prependedPrimaryActions, actions, (a, b) => a === b)) {
      return;
    }
    this.prependedPrimaryActions = actions;
    this.updateToolbar();
  }
  setAdditionalPrimaryActions(actions) {
    if (equals(this.additionalPrimaryActions, actions, (a, b) => a === b)) {
      return;
    }
    this.additionalPrimaryActions = actions;
    this.updateToolbar();
  }
  setAdditionalSecondaryActions(actions) {
    if (equals(this.additionalActions, actions, (a, b) => a === b)) {
      return;
    }
    this.additionalActions = actions;
    this.updateToolbar();
  }
};
CustomizedMenuWorkbenchToolBar = __decorateClass([
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService)
], CustomizedMenuWorkbenchToolBar);
export {
  CustomizedMenuWorkbenchToolBar,
  InlineCompletionsHintsWidget,
  InlineSuggestionHintsContentWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxoaW50c1dpZGdldFxcaW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGgsIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwsIHVudGhlbWVkS2V5YmluZGluZ0xhYmVsT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVIb3RDbGFzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hvdFJlbG9hZEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVXb3JrYmVuY2hUb29sQmFyT3B0aW9ucywgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbW1hbmQsIElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCwgSW5saW5lQ29tcGxldGlvbldhcm5pbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uQWZmaW5pdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgc2hvd05leHRJbmxpbmVTdWdnZXN0aW9uQWN0aW9uSWQsIHNob3dQcmV2aW91c0lubGluZVN1Z2dlc3Rpb25BY3Rpb25JZCB9IGZyb20gJy4uL2NvbnRyb2xsZXIvY29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgJy4vaW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldC5jc3MnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsd2F5c1Nob3dUb29sYmFyO1xuXG5cdHByaXZhdGUgc2Vzc2lvblBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBvc2l0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJT2JzZXJ2YWJsZTxJbmxpbmVDb21wbGV0aW9uc01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmFsd2F5c1Nob3dUb29sYmFyID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sICgpID0+IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkuc2hvd1Rvb2xiYXIgPT09ICdhbHdheXMnKTtcblx0XHR0aGlzLnNlc3Npb25Qb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnBvc2l0aW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZ2hvc3RUZXh0ID0gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik/LnByaW1hcnlHaG9zdFRleHQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoIXRoaXMuYWx3YXlzU2hvd1Rvb2xiYXIucmVhZChyZWFkZXIpIHx8ICFnaG9zdFRleHQgfHwgZ2hvc3RUZXh0LnBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25Qb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpcnN0Q29sdW1uID0gZ2hvc3RUZXh0LnBhcnRzWzBdLmNvbHVtbjtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25Qb3NpdGlvbiAmJiB0aGlzLnNlc3Npb25Qb3NpdGlvbi5saW5lTnVtYmVyICE9PSBnaG9zdFRleHQubGluZU51bWJlcikge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25Qb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oZ2hvc3RUZXh0LmxpbmVOdW1iZXIsIE1hdGgubWluKGZpcnN0Q29sdW1uLCB0aGlzLnNlc3Npb25Qb3NpdGlvbj8uY29sdW1uID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSk7XG5cdFx0XHR0aGlzLnNlc3Npb25Qb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHRcdFx0cmV0dXJuIHBvc2l0aW9uO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBzZXR1cCBjb250ZW50IHdpZGdldCAqL1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbW9kZWwgfHwgIXRoaXMuYWx3YXlzU2hvd1Rvb2xiYXIucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudFdpZGdldFZhbHVlID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRXaWRnZXQgPSByZWFkZXIuc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0SW5saW5lU3VnZ2VzdGlvbkhpbnRzQ29udGVudFdpZGdldC5ob3QucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdHRoaXMuZWRpdG9yLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0dGhpcy5wb3NpdGlvbixcblx0XHRcdFx0XHRtb2RlbC5zZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleCxcblx0XHRcdFx0XHRtb2RlbC5pbmxpbmVDb21wbGV0aW9uc0NvdW50LFxuXHRcdFx0XHRcdG1vZGVsLmFjdGl2ZUNvbW1hbmRzLFxuXHRcdFx0XHRcdG1vZGVsLndhcm5pbmcsXG5cdFx0XHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0XHQpKTtcblx0XHRcdFx0ZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQoY29udGVudFdpZGdldCk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KGNvbnRlbnRXaWRnZXQpKSk7XG5cblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiByZXF1ZXN0IGV4cGxpY2l0ICovXG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtb2RlbC5sYXN0VHJpZ2dlcktpbmQucmVhZChyZWFkZXIpICE9PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXQpIHtcblx0XHRcdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybiBjb250ZW50V2lkZ2V0O1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhhZFBvc2l0aW9uID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUodGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiAhIXRoaXMucG9zaXRpb24ucmVhZChyZWFkZXIpIHx8ICEhbGFzdFZhbHVlKTtcblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGlmIChoYWRQb3NpdGlvbi5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRjb250ZW50V2lkZ2V0VmFsdWUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNvbnN0IGlubGluZVN1Z2dlc3Rpb25IaW50c05leHRJY29uID0gcmVnaXN0ZXJJY29uKCdpbmxpbmUtc3VnZ2VzdGlvbi1oaW50cy1uZXh0JywgQ29kaWNvbi5jaGV2cm9uUmlnaHQsIGxvY2FsaXplKCdwYXJhbWV0ZXJIaW50c05leHRJY29uJywgJ0ljb24gZm9yIHNob3cgbmV4dCBwYXJhbWV0ZXIgaGludC4nKSk7XG5jb25zdCBpbmxpbmVTdWdnZXN0aW9uSGludHNQcmV2aW91c0ljb24gPSByZWdpc3Rlckljb24oJ2lubGluZS1zdWdnZXN0aW9uLWhpbnRzLXByZXZpb3VzJywgQ29kaWNvbi5jaGV2cm9uTGVmdCwgbG9jYWxpemUoJ3BhcmFtZXRlckhpbnRzUHJldmlvdXNJY29uJywgJ0ljb24gZm9yIHNob3cgcHJldmlvdXMgcGFyYW1ldGVyIGhpbnQuJykpO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lU3VnZ2VzdGlvbkhpbnRzQ29udGVudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaG90ID0gY3JlYXRlSG90Q2xhc3ModGhpcyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2Ryb3BEb3duVmlzaWJsZSA9IGZhbHNlO1xuXHRwdWJsaWMgc3RhdGljIGdldCBkcm9wRG93blZpc2libGUoKSB7IHJldHVybiB0aGlzLl9kcm9wRG93blZpc2libGU7IH1cblxuXHRwcml2YXRlIHN0YXRpYyBpZCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpZDtcblx0cHVibGljIHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3c7XG5cdHB1YmxpYyByZWFkb25seSBzdXBwcmVzc01vdXNlRG93bjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93YXJuaW5nTWVzc2FnZUNvbnRlbnROb2RlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhcm5pbmdNZXNzYWdlTm9kZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG5vZGVzO1xuXG5cdHByaXZhdGUgY3JlYXRlQ29tbWFuZEFjdGlvbihjb21tYW5kSWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgaWNvbkNsYXNzTmFtZTogc3RyaW5nKTogQWN0aW9uIHtcblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0Y29tbWFuZElkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRpY29uQ2xhc3NOYW1lLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCksXG5cdFx0KTtcblx0XHRhY3Rpb24udG9vbHRpcCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhsYWJlbCwgY29tbWFuZElkLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0cmV0dXJuIGFjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldmlvdXNBY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgYXZhaWxhYmxlU3VnZ2VzdGlvbkNvdW50QWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IG5leHRBY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSB0b29sQmFyOiBDdXN0b21pemVkTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cblx0Ly8gVE9ET0BoZWRpZXQ6IGRlcHJlY2F0ZSBNZW51SWQuSW5saW5lQ29tcGxldGlvbnNBY3Rpb25zXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5saW5lQ29tcGxldGlvbnNBY3Rpb25zTWVudXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbGVhckF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudExhYmVsRGVib3VuY2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzYWJsZUJ1dHRvbnNEZWJvdW5jZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2l0aEJvcmRlcjogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wb3NpdGlvbjogSU9ic2VydmFibGU8UG9zaXRpb24gfCBudWxsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50U3VnZ2VzdGlvbklkeDogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdWdnZXN0aW9uQ291bnQ6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0cmFDb21tYW5kczogSU9ic2VydmFibGU8SW5saW5lQ29tcGxldGlvbkNvbW1hbmRbXT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2FybmluZzogSU9ic2VydmFibGU8SW5saW5lQ29tcGxldGlvbldhcm5pbmcgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5b3V0OiAoKSA9PiB2b2lkLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmlkID0gYElubGluZVN1Z2dlc3Rpb25IaW50c0NvbnRlbnRXaWRnZXQke0lubGluZVN1Z2dlc3Rpb25IaW50c0NvbnRlbnRXaWRnZXQuaWQrK31gO1xuXHRcdHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdyA9IHRydWU7XG5cdFx0dGhpcy5zdXBwcmVzc01vdXNlRG93biA9IGZhbHNlO1xuXHRcdHRoaXMuX3dhcm5pbmdNZXNzYWdlQ29udGVudE5vZGUgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHdhcm5pbmcgPSB0aGlzLl93YXJuaW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghd2FybmluZykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiB3YXJuaW5nLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB3YXJuaW5nLm1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYXJrZG93bkVsZW1lbnQgPSByZWFkZXIuc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKHdhcm5pbmcubWVzc2FnZSkpO1xuXHRcdFx0cmV0dXJuIG1hcmtkb3duRWxlbWVudC5lbGVtZW50O1xuXHRcdH0pO1xuXHRcdHRoaXMuX3dhcm5pbmdNZXNzYWdlTm9kZSA9IG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnd2FybmluZ01lc3NhZ2UnLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0bWF4V2lkdGg6IDQwMCxcblx0XHRcdFx0bWFyZ2luOiA0LFxuXHRcdFx0XHRtYXJnaW5Cb3R0b206IDQsXG5cdFx0XHRcdGRpc3BsYXk6IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3dhcm5pbmcucmVhZChyZWFkZXIpID8gJ2Jsb2NrJyA6ICdub25lJyksXG5cdFx0XHR9XG5cdFx0fSwgW1xuXHRcdFx0dGhpcy5fd2FybmluZ01lc3NhZ2VDb250ZW50Tm9kZSxcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5ub2RlcyA9IGgoJ2Rpdi5pbmxpbmVTdWdnZXN0aW9uc0hpbnRzJywgeyBjbGFzc05hbWU6IHRoaXMud2l0aEJvcmRlciA/ICdtb25hY28taG92ZXIgbW9uYWNvLWhvdmVyLWNvbnRlbnQnIDogJycgfSwgW1xuXHRcdFx0dGhpcy5fd2FybmluZ01lc3NhZ2VOb2RlLmVsZW1lbnQsXG5cdFx0XHRoKCdkaXZAdG9vbEJhcicpLFxuXHRcdF0pO1xuXHRcdHRoaXMucHJldmlvdXNBY3Rpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZUNvbW1hbmRBY3Rpb24oc2hvd1ByZXZpb3VzSW5saW5lU3VnZ2VzdGlvbkFjdGlvbklkLCBsb2NhbGl6ZSgncHJldmlvdXMnLCAnUHJldmlvdXMnKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGlubGluZVN1Z2dlc3Rpb25IaW50c1ByZXZpb3VzSWNvbikpKTtcblx0XHR0aGlzLmF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ2lubGluZVN1Z2dlc3Rpb25IaW50cy5hdmFpbGFibGVTdWdnZXN0aW9uQ291bnQnLCAnJywgdW5kZWZpbmVkLCBmYWxzZSkpO1xuXHRcdHRoaXMubmV4dEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlQ29tbWFuZEFjdGlvbihzaG93TmV4dElubGluZVN1Z2dlc3Rpb25BY3Rpb25JZCwgbG9jYWxpemUoJ25leHQnLCAnTmV4dCcpLCBUaGVtZUljb24uYXNDbGFzc05hbWUoaW5saW5lU3VnZ2VzdGlvbkhpbnRzTmV4dEljb24pKSk7XG5cdFx0dGhpcy5pbmxpbmVDb21wbGV0aW9uc0FjdGlvbnNNZW51cyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoXG5cdFx0XHRNZW51SWQuSW5saW5lQ29tcGxldGlvbnNBY3Rpb25zLFxuXHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2Vcblx0XHQpKTtcblx0XHR0aGlzLmNsZWFyQXZhaWxhYmxlU3VnZ2VzdGlvbkNvdW50TGFiZWxEZWJvdW5jZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLmF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudEFjdGlvbi5sYWJlbCA9ICcnO1xuXHRcdH0sIDEwMCkpO1xuXHRcdHRoaXMuZGlzYWJsZUJ1dHRvbnNEZWJvdW5jZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnByZXZpb3VzQWN0aW9uLmVuYWJsZWQgPSB0aGlzLm5leHRBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH0sIDEwMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fd2FybmluZ01lc3NhZ2VDb250ZW50Tm9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl93YXJuaW5nTWVzc2FnZU5vZGUucmVhZEVmZmVjdChyZWFkZXIpO1xuXHRcdFx0Ly8gT25seSB1cGRhdGUgYWZ0ZXIgdGhlIHdhcm5pbmcgbWVzc2FnZSBub2RlIGhhcyBiZWVuIHJlbmRlcmVkXG5cdFx0XHR0aGlzLl9yZWxheW91dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudG9vbEJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbWl6ZWRNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5ub2Rlcy50b29sQmFyLCBNZW51SWQuSW5saW5lU3VnZ2VzdGlvblRvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogZyA9PiBnLnN0YXJ0c1dpdGgoJ3ByaW1hcnknKSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhdHVzQmFyVmlld0l0ZW0sIGFjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uID09PSB0aGlzLmF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudEFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGEgPSBuZXcgQWN0aW9uVmlld0l0ZW1XaXRoQ2xhc3NOYW1lKHVuZGVmaW5lZCwgYWN0aW9uLCB7IGxhYmVsOiB0cnVlLCBpY29uOiBmYWxzZSB9KTtcblx0XHRcdFx0XHRhLnNldENsYXNzKCdhdmFpbGFibGVTdWdnZXN0aW9uQ291bnQnKTtcblx0XHRcdFx0XHRyZXR1cm4gYTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ0lubGluZVN1Z2dlc3Rpb25Ub29sYmFyJyxcblx0XHR9KSk7XG5cblx0XHR0aGlzLnRvb2xCYXIuc2V0UHJlcGVuZGVkUHJpbWFyeUFjdGlvbnMoW1xuXHRcdFx0dGhpcy5wcmV2aW91c0FjdGlvbixcblx0XHRcdHRoaXMuYXZhaWxhYmxlU3VnZ2VzdGlvbkNvdW50QWN0aW9uLFxuXHRcdFx0dGhpcy5uZXh0QWN0aW9uLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50b29sQmFyLm9uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0SW5saW5lU3VnZ2VzdGlvbkhpbnRzQ29udGVudFdpZGdldC5fZHJvcERvd25WaXNpYmxlID0gZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBwb3NpdGlvbiAqL1xuXHRcdFx0dGhpcy5fcG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvdW50cyAqL1xuXHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbkNvdW50ID0gdGhpcy5fc3VnZ2VzdGlvbkNvdW50LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdWdnZXN0aW9uSWR4ID0gdGhpcy5fY3VycmVudFN1Z2dlc3Rpb25JZHgucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoc3VnZ2VzdGlvbkNvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5jbGVhckF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudExhYmVsRGVib3VuY2VkLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLmF2YWlsYWJsZVN1Z2dlc3Rpb25Db3VudEFjdGlvbi5sYWJlbCA9IGAke2N1cnJlbnRTdWdnZXN0aW9uSWR4ICsgMX0vJHtzdWdnZXN0aW9uQ291bnR9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJBdmFpbGFibGVTdWdnZXN0aW9uQ291bnRMYWJlbERlYm91bmNlZC5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3VnZ2VzdGlvbkNvdW50ICE9PSB1bmRlZmluZWQgJiYgc3VnZ2VzdGlvbkNvdW50ID4gMSkge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVCdXR0b25zRGVib3VuY2VkLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzQWN0aW9uLmVuYWJsZWQgPSB0aGlzLm5leHRBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVCdXR0b25zRGVib3VuY2VkLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBleHRyYSBjb21tYW5kcyAqL1xuXHRcdFx0Y29uc3QgZXh0cmFDb21tYW5kcyA9IHRoaXMuX2V4dHJhQ29tbWFuZHMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZXh0cmFBY3Rpb25zID0gZXh0cmFDb21tYW5kcy5tYXA8SUFjdGlvbj4oYyA9PiAoe1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRpZDogYy5jb21tYW5kLmlkLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR0b29sdGlwOiBjLmNvbW1hbmQudG9vbHRpcCB8fCAnJyxcblx0XHRcdFx0bGFiZWw6IGMuY29tbWFuZC50aXRsZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjLmNvbW1hbmQuaWQsIC4uLihjLmNvbW1hbmQuYXJndW1lbnRzID8/IFtdKSksXG5cdFx0XHR9KSk7XG5cblx0XHRcdGZvciAoY29uc3QgW18sIGdyb3VwXSBvZiB0aGlzLmlubGluZUNvbXBsZXRpb25zQWN0aW9uc01lbnVzLmdldEFjdGlvbnMoKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBncm91cCkge1xuXHRcdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdFx0ZXh0cmFBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4dHJhQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGV4dHJhQWN0aW9ucy51bnNoaWZ0KG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudG9vbEJhci5zZXRBZGRpdGlvbmFsU2Vjb25kYXJ5QWN0aW9ucyhleHRyYUFjdGlvbnMpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmlkOyB9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXMucm9vdDtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHRoaXMuX3Bvc2l0aW9uLmdldCgpLFxuXHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUsIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1ddLFxuXHRcdFx0cG9zaXRpb25BZmZpbml0eTogUG9zaXRpb25BZmZpbml0eS5MZWZ0T2ZJbmplY3RlZFRleHQsXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBBY3Rpb25WaWV3SXRlbVdpdGhDbGFzc05hbWUgZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgX2NsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHNldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRpZiAodGhpcy5fY2xhc3NOYW1lKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCh0aGlzLl9jbGFzc05hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVUb29sdGlwKCk6IHZvaWQge1xuXHRcdC8vIE5PT1AsIGRpc2FibGUgdG9vbHRpcFxuXHR9XG59XG5cbmNsYXNzIFN0YXR1c0JhclZpZXdJdGVtIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0ge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKSB7XG5cdFx0Y29uc3Qga2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuX2FjdGlvbi5pZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRydWUpO1xuXHRcdGlmICgha2IpIHtcblx0XHRcdHJldHVybiBzdXBlci51cGRhdGVMYWJlbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0Y29uc3QgZGl2ID0gaCgnZGl2LmtleWJpbmRpbmcnKS5yb290O1xuXG5cdFx0XHRjb25zdCBrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWJpbmRpbmdMYWJlbChkaXYsIE9TLCB7IGRpc2FibGVUaXRsZTogdHJ1ZSwgLi4udW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zIH0pKTtcblx0XHRcdGsuc2V0KGtiKTtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLl9hY3Rpb24ubGFiZWw7XG5cdFx0XHR0aGlzLmxhYmVsLmFwcGVuZENoaWxkKGRpdik7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoJ2lubGluZVN1Z2dlc3Rpb25TdGF0dXNCYXJJdGVtTGFiZWwnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlVG9vbHRpcCgpOiB2b2lkIHtcblx0XHQvLyBOT09QLCBkaXNhYmxlIHRvb2x0aXBcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3VzdG9taXplZE1lbnVXb3JrYmVuY2hUb29sQmFyIGV4dGVuZHMgV29ya2JlbmNoVG9vbEJhciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVudTtcblx0cHJpdmF0ZSBhZGRpdGlvbmFsQWN0aW9uczogSUFjdGlvbltdO1xuXHRwcml2YXRlIHByZXBlbmRlZFByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW107XG5cdHByaXZhdGUgYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lbnVJZDogTWVudUlkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczI6IElNZW51V29ya2JlbmNoVG9vbEJhck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250YWluZXIsIHsgcmVzZXRNZW51OiBtZW51SWQsIC4uLm9wdGlvbnMyIH0sIG1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMubWVudSA9IHRoaXMuX3N0b3JlLmFkZCh0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGhpcy5tZW51SWQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHsgZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzOiB0cnVlIH0pKTtcblx0XHR0aGlzLmFkZGl0aW9uYWxBY3Rpb25zID0gW107XG5cdFx0dGhpcy5wcmVwZW5kZWRQcmltYXJ5QWN0aW9ucyA9IFtdO1xuXHRcdHRoaXMuYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zID0gW107XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5tZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlVG9vbGJhcigpKSk7XG5cdFx0dGhpcy51cGRhdGVUb29sYmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvb2xiYXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHR0aGlzLm1lbnUuZ2V0QWN0aW9ucyh0aGlzLm9wdGlvbnMyPy5tZW51T3B0aW9ucyksXG5cdFx0XHR0aGlzLm9wdGlvbnMyPy50b29sYmFyT3B0aW9ucz8ucHJpbWFyeUdyb3VwLCB0aGlzLm9wdGlvbnMyPy50b29sYmFyT3B0aW9ucz8uc2hvdWxkSW5saW5lU3VibWVudSwgdGhpcy5vcHRpb25zMj8udG9vbGJhck9wdGlvbnM/LnVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zXG5cdFx0KTtcblxuXHRcdHNlY29uZGFyeS5wdXNoKC4uLnRoaXMuYWRkaXRpb25hbEFjdGlvbnMpO1xuXHRcdHByaW1hcnkudW5zaGlmdCguLi50aGlzLnByZXBlbmRlZFByaW1hcnlBY3Rpb25zKTtcblx0XHRwcmltYXJ5LnB1c2goLi4udGhpcy5hZGRpdGlvbmFsUHJpbWFyeUFjdGlvbnMpO1xuXHRcdHRoaXMuc2V0QWN0aW9ucyhwcmltYXJ5LCBzZWNvbmRhcnkpO1xuXHR9XG5cblx0c2V0UHJlcGVuZGVkUHJpbWFyeUFjdGlvbnMoYWN0aW9uczogSUFjdGlvbltdKTogdm9pZCB7XG5cdFx0aWYgKGVxdWFscyh0aGlzLnByZXBlbmRlZFByaW1hcnlBY3Rpb25zLCBhY3Rpb25zLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnByZXBlbmRlZFByaW1hcnlBY3Rpb25zID0gYWN0aW9ucztcblx0XHR0aGlzLnVwZGF0ZVRvb2xiYXIoKTtcblx0fVxuXG5cdHNldEFkZGl0aW9uYWxQcmltYXJ5QWN0aW9ucyhhY3Rpb25zOiBJQWN0aW9uW10pOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zLCBhY3Rpb25zLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFkZGl0aW9uYWxQcmltYXJ5QWN0aW9ucyA9IGFjdGlvbnM7XG5cdFx0dGhpcy51cGRhdGVUb29sYmFyKCk7XG5cdH1cblxuXHRzZXRBZGRpdGlvbmFsU2Vjb25kYXJ5QWN0aW9ucyhhY3Rpb25zOiBJQWN0aW9uW10pOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuYWRkaXRpb25hbEFjdGlvbnMsIGFjdGlvbnMsIChhLCBiKSA9PiBhID09PSBiKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkaXRpb25hbEFjdGlvbnMgPSBhY3Rpb25zO1xuXHRcdHRoaXMudXBkYXRlVG9vbGJhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLHNDQUFzQztBQUNoRSxTQUFTLFFBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBc0IsU0FBUyxrQkFBa0IsU0FBUyw0QkFBNEIsMkJBQTJCO0FBQ2pILFNBQVMsVUFBVTtBQUNuQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QiwyQkFBMkI7QUFDN0Qs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
