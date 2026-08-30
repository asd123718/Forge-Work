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
import * as dom from "../../../../base/browser/dom.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../base/common/platform.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import * as nls from "../../../../nls.js";
import { IMenuService, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService, isStandaloneEditorWorkspace } from "../../../../platform/workspace/common/workspace.js";
let ContextMenuController = class {
  constructor(editor, _contextMenuService, _contextViewService, _contextKeyService, _keybindingService, _menuService, _configurationService, _workspaceContextService) {
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._configurationService = _configurationService;
    this._workspaceContextService = _workspaceContextService;
    this._toDispose = new DisposableStore();
    this._contextMenuIsBeingShownCount = 0;
    this._editor = editor;
    this._toDispose.add(this._editor.onContextMenu((e) => this._onContextMenu(e)));
    this._toDispose.add(this._editor.onMouseWheel((e) => {
      if (this._contextMenuIsBeingShownCount > 0) {
        const view = this._contextViewService.getContextViewElement();
        const target = e.srcElement;
        if (!(target.shadowRoot && dom.getShadowRoot(view) === target.shadowRoot)) {
          this._contextViewService.hideContextView();
        }
      }
    }));
    this._toDispose.add(this._editor.onKeyDown((e) => {
      if (!this._editor.getOption(EditorOption.contextmenu)) {
        return;
      }
      if (e.keyCode === KeyCode.ContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu();
      }
    }));
  }
  static get(editor) {
    return editor.getContribution(ContextMenuController.ID);
  }
  _onContextMenu(e) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (!this._editor.getOption(EditorOption.contextmenu)) {
      this._editor.focus();
      if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
        this._editor.setPosition(e.target.position);
      }
      return;
    }
    if (e.target.type === MouseTargetType.OVERLAY_WIDGET) {
      return;
    }
    if (e.target.type === MouseTargetType.CONTENT_TEXT && e.target.detail.injectedText) {
      return;
    }
    e.event.preventDefault();
    e.event.stopPropagation();
    if (e.target.type === MouseTargetType.SCROLLBAR) {
      return this._showScrollbarContextMenu(e.event);
    }
    if (e.target.type !== MouseTargetType.CONTENT_TEXT && e.target.type !== MouseTargetType.CONTENT_EMPTY && e.target.type !== MouseTargetType.TEXTAREA) {
      return;
    }
    this._editor.focus();
    if (e.target.position) {
      let hasSelectionAtPosition = false;
      for (const selection of this._editor.getSelections()) {
        if (selection.containsPosition(e.target.position)) {
          hasSelectionAtPosition = true;
          break;
        }
      }
      if (!hasSelectionAtPosition) {
        this._editor.setPosition(e.target.position);
      }
    }
    let anchor = null;
    if (e.target.type !== MouseTargetType.TEXTAREA) {
      anchor = e.event;
    }
    this.showContextMenu(anchor);
  }
  showContextMenu(anchor) {
    if (!this._editor.getOption(EditorOption.contextmenu)) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    const menuActions = this._getMenuActions(
      this._editor.getModel(),
      this._editor.contextMenuId
    );
    if (menuActions.length > 0) {
      this._doShowContextMenu(menuActions, anchor);
    }
  }
  _getMenuActions(model, menuId) {
    const result = [];
    const groups = this._menuService.getMenuActions(menuId, this._contextKeyService, { arg: model.uri });
    for (const group of groups) {
      const [, actions] = group;
      let addedItems = 0;
      for (const action of actions) {
        if (action instanceof SubmenuItemAction) {
          const subActions = this._getMenuActions(model, action.item.submenu);
          if (subActions.length > 0) {
            result.push(new SubmenuAction(action.id, action.label, subActions));
            addedItems++;
          }
        } else {
          result.push(action);
          addedItems++;
        }
      }
      if (addedItems) {
        result.push(new Separator());
      }
    }
    if (result.length) {
      result.pop();
    }
    return result;
  }
  _doShowContextMenu(actions, event = null) {
    if (!this._editor.hasModel()) {
      return;
    }
    let anchor = event;
    if (!anchor) {
      this._editor.revealPosition(this._editor.getPosition(), ScrollType.Immediate);
      this._editor.render();
      const cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());
      const editorCoords = dom.getDomNodePagePosition(this._editor.getDomNode());
      const posx = editorCoords.left + cursorCoords.left;
      const posy = editorCoords.top + cursorCoords.top + cursorCoords.height;
      anchor = { x: posx, y: posy };
    }
    const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS;
    this._contextMenuIsBeingShownCount++;
    this._contextMenuService.showContextMenu({
      domForShadowRoot: useShadowDOM ? this._editor.getOverflowWidgetsDomNode() ?? this._editor.getDomNode() : void 0,
      getAnchor: () => anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this._keybindingFor(action);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel(), isMenu: true });
        }
        const customAction = action;
        if (typeof customAction.getActionViewItem === "function") {
          return customAction.getActionViewItem();
        }
        return new ActionViewItem(action, action, { icon: true, label: true, isMenu: true });
      },
      getKeyBinding: (action) => {
        return this._keybindingFor(action);
      },
      onHide: (wasCancelled) => {
        this._contextMenuIsBeingShownCount--;
      }
    });
  }
  _showScrollbarContextMenu(anchor) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (isStandaloneEditorWorkspace(this._workspaceContextService.getWorkspace())) {
      return;
    }
    const minimapOptions = this._editor.getOption(EditorOption.minimap);
    let lastId = 0;
    const createAction = (opts) => {
      return {
        id: `menu-action-${++lastId}`,
        label: opts.label,
        tooltip: "",
        class: void 0,
        enabled: typeof opts.enabled === "undefined" ? true : opts.enabled,
        checked: opts.checked,
        run: opts.run
      };
    };
    const createSubmenuAction = (label, actions2) => {
      return new SubmenuAction(
        `menu-action-${++lastId}`,
        label,
        actions2,
        void 0
      );
    };
    const createEnumAction = (label, enabled, configName, configuredValue, options) => {
      if (!enabled) {
        return createAction({ label, enabled, run: () => {
        } });
      }
      const createRunner = (value) => {
        return () => {
          this._configurationService.updateValue(configName, value);
        };
      };
      const actions2 = [];
      for (const option of options) {
        actions2.push(createAction({
          label: option.label,
          checked: configuredValue === option.value,
          run: createRunner(option.value)
        }));
      }
      return createSubmenuAction(
        label,
        actions2
      );
    };
    const actions = [];
    actions.push(createAction({
      label: nls.localize("context.minimap.minimap", "Minimap"),
      checked: minimapOptions.enabled,
      run: () => {
        this._configurationService.updateValue(`editor.minimap.enabled`, !minimapOptions.enabled);
      }
    }));
    actions.push(new Separator());
    actions.push(createAction({
      label: nls.localize("context.minimap.renderCharacters", "Render Characters"),
      enabled: minimapOptions.enabled,
      checked: minimapOptions.renderCharacters,
      run: () => {
        this._configurationService.updateValue(`editor.minimap.renderCharacters`, !minimapOptions.renderCharacters);
      }
    }));
    actions.push(createEnumAction(
      nls.localize("context.minimap.size", "Vertical size"),
      minimapOptions.enabled,
      "editor.minimap.size",
      minimapOptions.size,
      [{
        label: nls.localize("context.minimap.size.proportional", "Proportional"),
        value: "proportional"
      }, {
        label: nls.localize("context.minimap.size.fill", "Fill"),
        value: "fill"
      }, {
        label: nls.localize("context.minimap.size.fit", "Fit"),
        value: "fit"
      }]
    ));
    actions.push(createEnumAction(
      nls.localize("context.minimap.slider", "Slider"),
      minimapOptions.enabled,
      "editor.minimap.showSlider",
      minimapOptions.showSlider,
      [{
        label: nls.localize("context.minimap.slider.mouseover", "Mouse Over"),
        value: "mouseover"
      }, {
        label: nls.localize("context.minimap.slider.always", "Always"),
        value: "always"
      }]
    ));
    actions.push(createEnumAction(
      nls.localize("context.minimap.side", "Side"),
      minimapOptions.enabled,
      "editor.minimap.side",
      minimapOptions.side,
      [{
        label: nls.localize("context.minimap.side.right", "Right"),
        value: "right"
      }, {
        label: nls.localize("context.minimap.side.left", "Left"),
        value: "left"
      }]
    ));
    const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS;
    this._contextMenuIsBeingShownCount++;
    this._contextMenuService.showContextMenu({
      domForShadowRoot: useShadowDOM ? this._editor.getDomNode() : void 0,
      getAnchor: () => anchor,
      getActions: () => actions,
      onHide: (wasCancelled) => {
        this._contextMenuIsBeingShownCount--;
        this._editor.focus();
      }
    });
  }
  _keybindingFor(action) {
    return this._keybindingService.lookupKeybinding(action.id);
  }
  dispose() {
    if (this._contextMenuIsBeingShownCount > 0) {
      this._contextViewService.hideContextView();
    }
    this._toDispose.dispose();
  }
};
ContextMenuController.ID = "editor.contrib.contextmenu";
ContextMenuController = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkspaceContextService)
], ContextMenuController);
class ShowContextMenu extends EditorAction {
  constructor() {
    super({
      id: "editor.action.showContextMenu",
      label: nls.localize2("action.showContextMenu.label", "Show Editor Context Menu"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.Shift | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    ContextMenuController.get(editor)?.showContextMenu();
  }
}
registerEditorContribution(ContextMenuController.ID, ContextMenuController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(ShowContextMenu);
export {
  ContextMenuController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvbnRleHRtZW51XFxicm93c2VyXFxjb250ZXh0bWVudS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlRXZlbnQsIElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNJT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBpc1N0YW5kYWxvbmVFZGl0b3JXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0TWVudUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmNvbnRleHRtZW51JztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogQ29udGV4dE1lbnVDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248Q29udGV4dE1lbnVDb250cm9sbGVyPihDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkNvbnRleHRNZW51KChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4gdGhpcy5fb25Db250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VXaGVlbCgoZTogSU1vdXNlV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRleHRNZW51SXNCZWluZ1Nob3duQ291bnQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuZ2V0Q29udGV4dFZpZXdFbGVtZW50KCk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUuc3JjRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcblxuXHRcdFx0XHQvLyBFdmVudCB0cmlnZ2VycyBvbiBzaGFkb3cgcm9vdCBob3N0IGZpcnN0XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBjb250ZXh0IHZpZXcgaXMgdW5kZXIgdGhpcyBob3N0IGJlZm9yZSBoaWRpbmcgaXQgIzEwMzE2OVxuXHRcdFx0XHRpZiAoISh0YXJnZXQuc2hhZG93Um9vdCAmJiBkb20uZ2V0U2hhZG93Um9vdCh2aWV3KSA9PT0gdGFyZ2V0LnNoYWRvd1Jvb3QpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uS2V5RG93bigoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29udGV4dG1lbnUpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gQ29udGV4dCBtZW51IGlzIHR1cm5lZCBvZmYgdGhyb3VnaCBjb25maWd1cmF0aW9uXG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkNvbnRleHRNZW51KSB7XG5cdFx0XHRcdC8vIENocm9tZSBpcyBmdW5ueSBsaWtlIHRoYXRcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnNob3dDb250ZXh0TWVudSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUoZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb250ZXh0bWVudSkpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0Ly8gRW5zdXJlIHRoZSBjdXJzb3IgaXMgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBtb3VzZSBjbGlja1xuXHRcdFx0aWYgKGUudGFyZ2V0LnBvc2l0aW9uICYmICF0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuY29udGFpbnNQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKGUudGFyZ2V0LnBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjsgLy8gQ29udGV4dCBtZW51IGlzIHR1cm5lZCBvZmYgdGhyb3VnaCBjb25maWd1cmF0aW9uXG5cdFx0fVxuXG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5PVkVSTEFZX1dJREdFVCkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbGxvdyBuYXRpdmUgbWVudSBvbiB3aWRnZXRzIHRvIHN1cHBvcnQgcmlnaHQgY2xpY2sgb24gaW5wdXQgZmllbGQgZm9yIGV4YW1wbGUgaW4gZmluZFxuXHRcdH1cblx0XHRpZiAoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCAmJiBlLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGFsbG93IG5hdGl2ZSBtZW51IG9uIGluamVjdGVkIHRleHRcblx0XHR9XG5cblx0XHRlLmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5ldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGlmIChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuU0NST0xMQkFSKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd1Njcm9sbGJhckNvbnRleHRNZW51KGUuZXZlbnQpO1xuXHRcdH1cblxuXHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUICYmIGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX0VNUFRZICYmIGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5URVhUQVJFQSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHN1cHBvcnQgbW91c2UgY2xpY2sgaW50byB0ZXh0IG9yIG5hdGl2ZSBjb250ZXh0IG1lbnUga2V5IGZvciBub3dcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgdGhlIGVkaXRvciBnZXRzIGZvY3VzIGlmIGl0IGhhc24ndCwgc28gdGhlIHJpZ2h0IGV2ZW50cyBhcmUgYmVpbmcgc2VudCB0byBvdGhlciBjb250cmlidXRpb25zXG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cblx0XHQvLyBFbnN1cmUgdGhlIGN1cnNvciBpcyBhdCB0aGUgcG9zaXRpb24gb2YgdGhlIG1vdXNlIGNsaWNrXG5cdFx0aWYgKGUudGFyZ2V0LnBvc2l0aW9uKSB7XG5cdFx0XHRsZXQgaGFzU2VsZWN0aW9uQXRQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uLmNvbnRhaW5zUG9zaXRpb24oZS50YXJnZXQucG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0aGFzU2VsZWN0aW9uQXRQb3NpdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFoYXNTZWxlY3Rpb25BdFBvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5sZXNzIHRoZSB1c2VyIHRyaWdnZXJkIHRoZSBjb250ZXh0IG1lbnUgdGhyb3VnaCBTaGlmdCtGMTAsIHVzZSB0aGUgbW91c2UgcG9zaXRpb24gYXMgbWVudSBwb3NpdGlvblxuXHRcdGxldCBhbmNob3I6IElNb3VzZUV2ZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5URVhUQVJFQSkge1xuXHRcdFx0YW5jaG9yID0gZS5ldmVudDtcblx0XHR9XG5cblx0XHQvLyBTaG93IHRoZSBjb250ZXh0IG1lbnVcblx0XHR0aGlzLnNob3dDb250ZXh0TWVudShhbmNob3IpO1xuXHR9XG5cblx0cHVibGljIHNob3dDb250ZXh0TWVudShhbmNob3I/OiBJTW91c2VFdmVudCB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvbnRleHRtZW51KSkge1xuXHRcdFx0cmV0dXJuOyAvLyBDb250ZXh0IG1lbnUgaXMgdHVybmVkIG9mZiB0aHJvdWdoIGNvbmZpZ3VyYXRpb25cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpbmQgYWN0aW9ucyBhdmFpbGFibGUgZm9yIG1lbnVcblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHRoaXMuX2dldE1lbnVBY3Rpb25zKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLFxuXHRcdFx0dGhpcy5fZWRpdG9yLmNvbnRleHRNZW51SWQpO1xuXG5cdFx0Ly8gU2hvdyBtZW51IGlmIHdlIGhhdmUgYWN0aW9ucyB0byBzaG93XG5cdFx0aWYgKG1lbnVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2RvU2hvd0NvbnRleHRNZW51KG1lbnVBY3Rpb25zLCBhbmNob3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldE1lbnVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBtZW51SWQ6IE1lbnVJZCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIGdldCBtZW51IGdyb3Vwc1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKG1lbnVJZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBtb2RlbC51cmkgfSk7XG5cblx0XHQvLyB0cmFuc2xhdGUgdGhlbSBpbnRvIG90aGVyIGFjdGlvbnNcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0Y29uc3QgWywgYWN0aW9uc10gPSBncm91cDtcblx0XHRcdGxldCBhZGRlZEl0ZW1zID0gMDtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3ViQWN0aW9ucyA9IHRoaXMuX2dldE1lbnVBY3Rpb25zKG1vZGVsLCBhY3Rpb24uaXRlbS5zdWJtZW51KTtcblx0XHRcdFx0XHRpZiAoc3ViQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXcgU3VibWVudUFjdGlvbihhY3Rpb24uaWQsIGFjdGlvbi5sYWJlbCwgc3ViQWN0aW9ucykpO1xuXHRcdFx0XHRcdFx0YWRkZWRJdGVtcysrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChhY3Rpb24pO1xuXHRcdFx0XHRcdGFkZGVkSXRlbXMrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWRkZWRJdGVtcykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHQucG9wKCk7IC8vIHJlbW92ZSBsYXN0IHNlcGFyYXRvclxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9kb1Nob3dDb250ZXh0TWVudShhY3Rpb25zOiBJQWN0aW9uW10sIGV2ZW50OiBJTW91c2VFdmVudCB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhbmNob3I6IElNb3VzZUV2ZW50IHwgSUFuY2hvciB8IG51bGwgPSBldmVudDtcblx0XHRpZiAoIWFuY2hvcikge1xuXHRcdFx0Ly8gRW5zdXJlIHNlbGVjdGlvbiBpcyB2aXNpYmxlXG5cdFx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUG9zaXRpb24odGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCksIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblxuXHRcdFx0dGhpcy5fZWRpdG9yLnJlbmRlcigpO1xuXHRcdFx0Y29uc3QgY3Vyc29yQ29vcmRzID0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblxuXHRcdFx0Ly8gVHJhbnNsYXRlIHRvIGFic29sdXRlIGVkaXRvciBwb3NpdGlvblxuXHRcdFx0Y29uc3QgZWRpdG9yQ29vcmRzID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSk7XG5cdFx0XHRjb25zdCBwb3N4ID0gZWRpdG9yQ29vcmRzLmxlZnQgKyBjdXJzb3JDb29yZHMubGVmdDtcblx0XHRcdGNvbnN0IHBvc3kgPSBlZGl0b3JDb29yZHMudG9wICsgY3Vyc29yQ29vcmRzLnRvcCArIGN1cnNvckNvb3Jkcy5oZWlnaHQ7XG5cblx0XHRcdGFuY2hvciA9IHsgeDogcG9zeCwgeTogcG9zeSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZVNoYWRvd0RPTSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnVzZVNoYWRvd0RPTSkgJiYgIWlzSU9TOyAvLyBEbyBub3QgdXNlIHNoYWRvdyBkb20gb24gSU9TICMxMjIwMzVcblxuXHRcdC8vIFNob3cgbWVudVxuXHRcdHRoaXMuX2NvbnRleHRNZW51SXNCZWluZ1Nob3duQ291bnQrKztcblx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGRvbUZvclNoYWRvd1Jvb3Q6IHVzZVNoYWRvd0RPTSA/IHRoaXMuX2VkaXRvci5nZXRPdmVyZmxvd1dpZGdldHNEb21Ob2RlKCkgPz8gdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSA6IHVuZGVmaW5lZCxcblxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cblx0XHRcdGdldEFjdGlvblZpZXdJdGVtOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nRm9yKGFjdGlvbik7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwga2V5YmluZGluZzoga2V5YmluZGluZy5nZXRMYWJlbCgpLCBpc01lbnU6IHRydWUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXN0b21BY3Rpb24gPSBhY3Rpb24gYXMgSUFjdGlvbiAmIHsgZ2V0QWN0aW9uVmlld0l0ZW0/OiAoKSA9PiBBY3Rpb25WaWV3SXRlbSB9O1xuXHRcdFx0XHRpZiAodHlwZW9mIGN1c3RvbUFjdGlvbi5nZXRBY3Rpb25WaWV3SXRlbSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdHJldHVybiBjdXN0b21BY3Rpb24uZ2V0QWN0aW9uVmlld0l0ZW0oKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUsIGlzTWVudTogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cblx0XHRcdGdldEtleUJpbmRpbmc6IChhY3Rpb24pOiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ0ZvcihhY3Rpb24pO1xuXHRcdFx0fSxcblxuXHRcdFx0b25IaWRlOiAod2FzQ2FuY2VsbGVkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51SXNCZWluZ1Nob3duQ291bnQtLTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dTY3JvbGxiYXJDb250ZXh0TWVudShhbmNob3I6IElNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc1N0YW5kYWxvbmVFZGl0b3JXb3Jrc3BhY2UodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpKSB7XG5cdFx0XHQvLyBjYW4ndCB1cGRhdGUgdGhlIGNvbmZpZ3VyYXRpb24gcHJvcGVybHkgaW4gdGhlIHN0YW5kYWxvbmUgZWRpdG9yXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluaW1hcE9wdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5taW5pbWFwKTtcblxuXHRcdGxldCBsYXN0SWQgPSAwO1xuXHRcdGNvbnN0IGNyZWF0ZUFjdGlvbiA9IChvcHRzOiB7IGxhYmVsOiBzdHJpbmc7IGVuYWJsZWQ/OiBib29sZWFuOyBjaGVja2VkPzogYm9vbGVhbjsgcnVuOiAoKSA9PiB2b2lkIH0pOiBJQWN0aW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBgbWVudS1hY3Rpb24tJHsrK2xhc3RJZH1gLFxuXHRcdFx0XHRsYWJlbDogb3B0cy5sYWJlbCxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6ICh0eXBlb2Ygb3B0cy5lbmFibGVkID09PSAndW5kZWZpbmVkJyA/IHRydWUgOiBvcHRzLmVuYWJsZWQpLFxuXHRcdFx0XHRjaGVja2VkOiBvcHRzLmNoZWNrZWQsXG5cdFx0XHRcdHJ1bjogb3B0cy5ydW5cblx0XHRcdH07XG5cdFx0fTtcblx0XHRjb25zdCBjcmVhdGVTdWJtZW51QWN0aW9uID0gKGxhYmVsOiBzdHJpbmcsIGFjdGlvbnM6IElBY3Rpb25bXSk6IFN1Ym1lbnVBY3Rpb24gPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBTdWJtZW51QWN0aW9uKFxuXHRcdFx0XHRgbWVudS1hY3Rpb24tJHsrK2xhc3RJZH1gLFxuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0YWN0aW9ucyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlRW51bUFjdGlvbiA9IDxUPihsYWJlbDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuLCBjb25maWdOYW1lOiBzdHJpbmcsIGNvbmZpZ3VyZWRWYWx1ZTogVCwgb3B0aW9uczogeyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogVCB9W10pOiBJQWN0aW9uID0+IHtcblx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uKHsgbGFiZWwsIGVuYWJsZWQsIHJ1bjogKCkgPT4geyB9IH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3JlYXRlUnVubmVyID0gKHZhbHVlOiBUKSA9PiB7XG5cdFx0XHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoY29uZmlnTmFtZSwgdmFsdWUpO1xuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goY3JlYXRlQWN0aW9uKHtcblx0XHRcdFx0XHRsYWJlbDogb3B0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGNvbmZpZ3VyZWRWYWx1ZSA9PT0gb3B0aW9uLnZhbHVlLFxuXHRcdFx0XHRcdHJ1bjogY3JlYXRlUnVubmVyKG9wdGlvbi52YWx1ZSlcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNyZWF0ZVN1Ym1lbnVBY3Rpb24oXG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRhY3Rpb25zXG5cdFx0XHQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRhY3Rpb25zLnB1c2goY3JlYXRlQWN0aW9uKHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5taW5pbWFwJywgXCJNaW5pbWFwXCIpLFxuXHRcdFx0Y2hlY2tlZDogbWluaW1hcE9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShgZWRpdG9yLm1pbmltYXAuZW5hYmxlZGAsICFtaW5pbWFwT3B0aW9ucy5lbmFibGVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUFjdGlvbih7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAucmVuZGVyQ2hhcmFjdGVycycsIFwiUmVuZGVyIENoYXJhY3RlcnNcIiksXG5cdFx0XHRlbmFibGVkOiBtaW5pbWFwT3B0aW9ucy5lbmFibGVkLFxuXHRcdFx0Y2hlY2tlZDogbWluaW1hcE9wdGlvbnMucmVuZGVyQ2hhcmFjdGVycyxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShgZWRpdG9yLm1pbmltYXAucmVuZGVyQ2hhcmFjdGVyc2AsICFtaW5pbWFwT3B0aW9ucy5yZW5kZXJDaGFyYWN0ZXJzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUVudW1BY3Rpb248J3Byb3BvcnRpb25hbCcgfCAnZmlsbCcgfCAnZml0Jz4oXG5cdFx0XHRubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaXplJywgXCJWZXJ0aWNhbCBzaXplXCIpLFxuXHRcdFx0bWluaW1hcE9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdCdlZGl0b3IubWluaW1hcC5zaXplJyxcblx0XHRcdG1pbmltYXBPcHRpb25zLnNpemUsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2l6ZS5wcm9wb3J0aW9uYWwnLCBcIlByb3BvcnRpb25hbFwiKSxcblx0XHRcdFx0dmFsdWU6ICdwcm9wb3J0aW9uYWwnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaXplLmZpbGwnLCBcIkZpbGxcIiksXG5cdFx0XHRcdHZhbHVlOiAnZmlsbCdcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNpemUuZml0JywgXCJGaXRcIiksXG5cdFx0XHRcdHZhbHVlOiAnZml0J1xuXHRcdFx0fV1cblx0XHQpKTtcblx0XHRhY3Rpb25zLnB1c2goY3JlYXRlRW51bUFjdGlvbjwnYWx3YXlzJyB8ICdtb3VzZW92ZXInPihcblx0XHRcdG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNsaWRlcicsIFwiU2xpZGVyXCIpLFxuXHRcdFx0bWluaW1hcE9wdGlvbnMuZW5hYmxlZCxcblx0XHRcdCdlZGl0b3IubWluaW1hcC5zaG93U2xpZGVyJyxcblx0XHRcdG1pbmltYXBPcHRpb25zLnNob3dTbGlkZXIsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb250ZXh0Lm1pbmltYXAuc2xpZGVyLm1vdXNlb3ZlcicsIFwiTW91c2UgT3ZlclwiKSxcblx0XHRcdFx0dmFsdWU6ICdtb3VzZW92ZXInXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zbGlkZXIuYWx3YXlzJywgXCJBbHdheXNcIiksXG5cdFx0XHRcdHZhbHVlOiAnYWx3YXlzJ1xuXHRcdFx0fV1cblx0XHQpKTtcblx0XHRhY3Rpb25zLnB1c2goY3JlYXRlRW51bUFjdGlvbjwncmlnaHQnIHwgJ2xlZnQnPihcblx0XHRcdG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNpZGUnLCBcIlNpZGVcIiksXG5cdFx0XHRtaW5pbWFwT3B0aW9ucy5lbmFibGVkLFxuXHRcdFx0J2VkaXRvci5taW5pbWFwLnNpZGUnLFxuXHRcdFx0bWluaW1hcE9wdGlvbnMuc2lkZSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRleHQubWluaW1hcC5zaWRlLnJpZ2h0JywgXCJSaWdodFwiKSxcblx0XHRcdFx0dmFsdWU6ICdyaWdodCdcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29udGV4dC5taW5pbWFwLnNpZGUubGVmdCcsIFwiTGVmdFwiKSxcblx0XHRcdFx0dmFsdWU6ICdsZWZ0J1xuXHRcdFx0fV1cblx0XHQpKTtcblxuXHRcdGNvbnN0IHVzZVNoYWRvd0RPTSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnVzZVNoYWRvd0RPTSkgJiYgIWlzSU9TOyAvLyBEbyBub3QgdXNlIHNoYWRvdyBkb20gb24gSU9TICMxMjIwMzVcblx0XHR0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50Kys7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRkb21Gb3JTaGFkb3dSb290OiB1c2VTaGFkb3dET00gPyB0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpIDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0b25IaWRlOiAod2FzQ2FuY2VsbGVkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51SXNCZWluZ1Nob3duQ291bnQtLTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9rZXliaW5kaW5nRm9yKGFjdGlvbjogSUFjdGlvbik6IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb250ZXh0TWVudUlzQmVpbmdTaG93bkNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgU2hvd0NvbnRleHRNZW51IGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uc2hvd0NvbnRleHRNZW51Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24uc2hvd0NvbnRleHRNZW51LmxhYmVsJywgXCJTaG93IEVkaXRvciBDb250ZXh0IE1lbnVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYxMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnNob3dDb250ZXh0TWVudSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKENvbnRleHRNZW51Q29udHJvbGxlci5JRCwgQ29udGV4dE1lbnVDb250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkJlZm9yZUZpcnN0SW50ZXJhY3Rpb24p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QUFBQSxNQUMzQyxlQUFlO0FBQUEsTUFDZjtBQUFBLE1BQ0EsZUFBZTtBQUFBLE1BQ2YsQ0FBQztBQUFBLFFBQ0EsT0FBTyxJQUFJLFNBQVMsOEJBQThCLE9BQU87QUFBQSxRQUN6RCxPQUFPO0FBQUEsTUFDUixHQUFHO0FBQUEsUUFDRixPQUFPLElBQUksU0FBUyw2QkFBNkIsTUFBTTtBQUFBLFFBQ3ZELE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLGVBQWUsS0FBSyxRQUFRLFVBQVUsYUFBYSxZQUFZLEtBQUssQ0FBQztBQUMzRSxTQUFLO0FBQ0wsU0FBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDeEMsa0JBQWtCLGVBQWUsS0FBSyxRQUFRLFdBQVcsSUFBSTtBQUFBLE1BQzdELFdBQVcsTUFBTTtBQUFBLE1BQ2pCLFlBQVksTUFBTTtBQUFBLE1BQ2xCLFFBQVEsQ0FBQyxpQkFBMEI7QUFDbEMsYUFBSztBQUNMLGFBQUssUUFBUSxNQUFNO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxlQUFlLFFBQWlEO0FBQ3ZFLFdBQU8sS0FBSyxtQkFBbUIsaUJBQWlCLE9BQU8sRUFBRTtBQUFBLEVBQzFEO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixRQUFJLEtBQUssZ0NBQWdDLEdBQUc7QUFDM0MsV0FBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsSUFDMUM7QUFFQSxTQUFLLFdBQVcsUUFBUTtBQUFBLEVBQ3pCO0FBQ0Q7QUF0V2Esc0JBRVcsS0FBSztBQUZoQix3QkFBTjtBQUFBLEVBY0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCVTtBQXdXYixNQUFNLHdCQUF3QixhQUFhO0FBQUEsRUFFMUMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLGdDQUFnQywwQkFBMEI7QUFBQSxNQUMvRSxjQUFjO0FBQUEsTUFDZCxRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsT0FBTyxRQUFRLFFBQVE7QUFBQSxRQUNoQyxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sSUFBSSxVQUE0QixRQUEyQjtBQUNqRSwwQkFBc0IsSUFBSSxNQUFNLEdBQUcsZ0JBQWdCO0FBQUEsRUFDcEQ7QUFDRDtBQUVBLDJCQUEyQixzQkFBc0IsSUFBSSx1QkFBdUIsZ0NBQWdDLHNCQUFzQjtBQUNsSSxxQkFBcUIsZUFBZTsiLAogICJuYW1lcyI6IFsiYWN0aW9ucyJdCn0K
