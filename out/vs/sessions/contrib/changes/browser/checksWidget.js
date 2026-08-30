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
import "./media/checksWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { GitHubCheckConclusion, GitHubCheckStatus } from "../../github/common/types.js";
import { parseWorkflowRunId } from "../../github/browser/models/githubPullRequestCIModel.js";
import { CICheckGroup, getCheckGroup, getCheckStateLabel } from "./checksActions.js";
const $ = dom.$;
const _CICheckListDelegate = class _CICheckListDelegate {
  getHeight(_element) {
    return _CICheckListDelegate.ITEM_HEIGHT;
  }
  getTemplateId(_element) {
    return CICheckListRenderer.TEMPLATE_ID;
  }
};
_CICheckListDelegate.ITEM_HEIGHT = 28;
let CICheckListDelegate = _CICheckListDelegate;
const _CICheckListRenderer = class _CICheckListRenderer {
  constructor(_labels, _openerService, _getModel) {
    this._labels = _labels;
    this._openerService = _openerService;
    this._getModel = _getModel;
    this.templateId = _CICheckListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $(".ci-status-widget-check"));
    const labelContainer = dom.append(row, $(".ci-status-widget-check-label"));
    const label = templateDisposables.add(this._labels.create(labelContainer, { supportIcons: true }));
    const actionBarContainer = dom.append(row, $(".ci-status-widget-check-actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    return {
      row,
      label,
      actionBar,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore())
    };
  }
  renderElement(element, _index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
    templateData.row.className = `ci-status-widget-check ${getCheckStatusClass(element.check)}`;
    const title = localize("ci.checkTitle", "{0}: {1}", element.check.name, getCheckStateLabel(element.check));
    templateData.label.setResource({
      name: element.check.name,
      resource: URI.from({ scheme: "github-check", path: `/${element.check.id}/${element.check.name}` })
    }, {
      icon: getCheckIcon(element.check),
      title
    });
    const actions = [];
    if (element.group === CICheckGroup.Failed && parseWorkflowRunId(element.check.detailsUrl) !== void 0) {
      actions.push(templateData.elementDisposables.add(new Action(
        "ci.rerunCheck",
        localize("ci.rerunCheck", "Rerun Check"),
        ThemeIcon.asClassName(Codicon.debugRerun),
        true,
        async () => {
          await this._getModel()?.rerunFailedCheck(element.check);
        }
      )));
    }
    if (element.check.detailsUrl) {
      actions.push(templateData.elementDisposables.add(new Action(
        "ci.openOnGitHub",
        localize("ci.openOnGitHub", "Open on GitHub"),
        ThemeIcon.asClassName(Codicon.linkExternal),
        true,
        async () => {
          await this._openerService.open(URI.parse(element.check.detailsUrl));
        }
      )));
    }
    templateData.actionBar.push(actions, { icon: true, label: false });
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_CICheckListRenderer.TEMPLATE_ID = "ciCheck";
let CICheckListRenderer = _CICheckListRenderer;
let CIStatusWidget = class extends Disposable {
  constructor(container, _openerService, _instantiationService) {
    super();
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidToggleCollapsed = this._register(new Emitter());
    this.onDidToggleCollapsed = this._onDidToggleCollapsed.event;
    this._checkCount = 0;
    this._collapsed = false;
    this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this._domNode = dom.append(container, $(".ci-status-widget"));
    this._domNode.style.display = "none";
    this._headerNode = dom.append(this._domNode, $(".ci-status-widget-header"));
    this._titleNode = dom.append(this._headerNode, $(".ci-status-widget-title"));
    this._titleLabelNode = dom.append(this._titleNode, $(".ci-status-widget-title-label"));
    this._titleLabelNode.textContent = localize("ci.checksLabel", "Checks");
    this._countsNode = dom.append(this._titleNode, $(".ci-status-widget-counts"));
    this._chevronNode = dom.append(this._headerNode, $(".group-chevron"));
    this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._headerNode.setAttribute("role", "button");
    this._headerNode.setAttribute("aria-label", localize("ci.toggleChecks", "Toggle Checks"));
    this._headerNode.setAttribute("aria-expanded", "true");
    this._headerNode.tabIndex = 0;
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.CLICK, () => {
      this._toggleCollapsed();
    }));
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === this._headerNode) {
        e.preventDefault();
        this._toggleCollapsed();
      }
    }));
    const bodyId = "ci-status-widget-body";
    this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
    this._bodyNode.id = bodyId;
    this._headerNode.setAttribute("aria-controls", bodyId);
    const listContainer = $(".ci-status-widget-list");
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "CIStatusWidget",
      listContainer,
      new CICheckListDelegate(),
      [new CICheckListRenderer(this._labels, this._openerService, () => this._model)],
      {
        multipleSelectionSupport: false,
        openOnSingleClick: false,
        accessibilityProvider: {
          getWidgetAriaLabel: () => localize("ci.checksListAriaLabel", "Checks"),
          getAriaLabel: (item) => localize("ci.checkAriaLabel", "{0}, {1}", item.check.name, getCheckStateLabel(item.check))
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => item.check.name
        }
      }
    ));
    this._bodyNode.appendChild(listContainer);
  }
  get element() {
    return this._domNode;
  }
  /** The full content height the widget would like (header + all checks). */
  get desiredHeight() {
    if (this._checkCount === 0) {
      return 0;
    }
    if (this._collapsed) {
      return CIStatusWidget.HEADER_HEIGHT;
    }
    return CIStatusWidget.HEADER_HEIGHT + this._checkCount * CICheckListDelegate.ITEM_HEIGHT;
  }
  /** Whether the widget is currently visible (has checks to show). */
  get visible() {
    return this._checkCount > 0;
  }
  /** Whether the body is collapsed (header-only). */
  get collapsed() {
    return this._collapsed;
  }
  setInput(input) {
    return autorun((reader) => {
      this._model = input.checksObs.read(reader);
      if (!this._model) {
        this._checkCount = 0;
        this._renderBody([]);
        this._domNode.style.display = "none";
        this._onDidChangeHeight.fire();
        return;
      }
      const checks = this._model.checks.read(reader);
      if (checks.length === 0) {
        this._checkCount = 0;
        this._renderBody([]);
        this._domNode.style.display = "none";
        this._onDidChangeHeight.fire();
        return;
      }
      const sorted = sortChecks(checks);
      const oldCount = this._checkCount;
      this._checkCount = sorted.length;
      this._domNode.style.display = "";
      this._renderHeader(checks);
      this._renderBody(sorted);
      if (this._checkCount !== oldCount) {
        this._onDidChangeHeight.fire();
      }
    });
  }
  _renderHeader(checks) {
    const counts = getCheckCounts(checks);
    dom.clearNode(this._countsNode);
    if (counts.running > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-running"));
      badge.appendChild(renderIcon(Codicon.circleFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.running}`;
    }
    if (counts.failed > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-failure"));
      badge.appendChild(renderIcon(Codicon.errorCompact));
      dom.append(badge, $("span")).textContent = `${counts.failed}`;
    }
    if (counts.pending > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-pending"));
      badge.appendChild(renderIcon(Codicon.circleFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.pending}`;
    }
    if (counts.successful > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-success"));
      badge.appendChild(renderIcon(Codicon.passFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.successful}`;
    }
  }
  /**
   * Layout the widget body list to the given height.
   * Called by the parent view after computing available space.
   */
  layout(height) {
    if (this._collapsed) {
      this._bodyNode.style.display = "none";
      return;
    }
    this._bodyNode.style.display = "";
    this._list.layout(height);
  }
  _toggleCollapsed() {
    this.setCollapsed(!this._collapsed);
  }
  /** Sets the collapsed state and notifies the SplitView layout. */
  setCollapsed(collapsed) {
    if (this._collapsed === collapsed) {
      return;
    }
    this._setCollapsed(collapsed);
    this._onDidToggleCollapsed.fire(collapsed);
    this._onDidChangeHeight.fire();
  }
  /**
   * Expand the body if it is currently collapsed, notifying listeners so the
   * parent pane restores its size. No-op when already expanded.
   */
  expand() {
    this.setCollapsed(false);
  }
  /**
   * Move keyboard focus into the checks list. Falls back to the header when
   * the body is collapsed or there is nothing to focus.
   */
  focus() {
    if (this._collapsed || this._checkCount === 0) {
      this._headerNode.focus();
      return;
    }
    this._list.domFocus();
    if (this._list.length > 0 && this._list.getFocus().length === 0) {
      this._list.setFocus([0]);
    }
  }
  _setCollapsed(collapsed) {
    this._collapsed = collapsed;
    this._updateChevron();
    this._headerNode.classList.toggle("collapsed", collapsed);
    this._headerNode.setAttribute("aria-expanded", String(!collapsed));
  }
  _updateChevron() {
    this._chevronNode.className = "group-chevron";
    this._chevronNode.classList.add(
      ...ThemeIcon.asClassNameArray(
        this._collapsed ? Codicon.chevronRight : Codicon.chevronDown
      )
    );
  }
  _renderBody(checks) {
    this._list.splice(0, this._list.length, checks);
  }
};
CIStatusWidget.HEADER_HEIGHT = 34;
// 6px header margin-top + 8px header padding + 20px header min-height
CIStatusWidget.MIN_BODY_HEIGHT = 5 * CICheckListDelegate.ITEM_HEIGHT;
CIStatusWidget.PREFERRED_BODY_HEIGHT = 5 * CICheckListDelegate.ITEM_HEIGHT;
CIStatusWidget.MAX_BODY_HEIGHT = 240;
CIStatusWidget = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IInstantiationService)
], CIStatusWidget);
function sortChecks(checks) {
  return [...checks].sort(compareChecks).map((check) => ({ check, group: getCheckGroup(check) }));
}
function compareChecks(a, b) {
  const groupDiff = getCheckGroup(a) - getCheckGroup(b);
  if (groupDiff !== 0) {
    return groupDiff;
  }
  return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
}
function getCheckCounts(checks) {
  let running = 0;
  let pending = 0;
  let failed = 0;
  let successful = 0;
  for (const check of checks) {
    switch (getCheckGroup(check)) {
      case CICheckGroup.Running:
        running++;
        break;
      case CICheckGroup.Pending:
        pending++;
        break;
      case CICheckGroup.Failed:
        failed++;
        break;
      case CICheckGroup.Successful:
        successful++;
        break;
    }
  }
  return { running, pending, failed, successful };
}
function getCheckIcon(check) {
  switch (check.status) {
    case GitHubCheckStatus.InProgress:
      return Codicon.syncCompact;
    case GitHubCheckStatus.Queued:
      return Codicon.circleFilledCompact;
    case GitHubCheckStatus.Completed:
      switch (check.conclusion) {
        case GitHubCheckConclusion.Success:
          return Codicon.passFilledCompact;
        case GitHubCheckConclusion.Failure:
        case GitHubCheckConclusion.TimedOut:
        case GitHubCheckConclusion.ActionRequired:
          return Codicon.errorCompact;
        case GitHubCheckConclusion.Cancelled:
          return Codicon.circleSlashCompact;
        case GitHubCheckConclusion.Skipped:
          return Codicon.debugStepOver;
        default:
          return Codicon.circleFilledCompact;
      }
    default:
      return Codicon.circleFilledCompact;
  }
}
function getCheckStatusClass(check) {
  switch (getCheckGroup(check)) {
    case CICheckGroup.Running:
      return "ci-status-running";
    case CICheckGroup.Pending:
      return "ci-status-pending";
    case CICheckGroup.Failed:
      return "ci-status-failure";
    case CICheckGroup.Successful:
      return "ci-status-success";
  }
}
export {
  CIStatusWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hlY2tzV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoZWNrc1dpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDaGVja0NvbmNsdXNpb24sIEdpdEh1YkNoZWNrU3RhdHVzLCBJR2l0SHViQ0lDaGVjayB9IGZyb20gJy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsLCBwYXJzZVdvcmtmbG93UnVuSWQgfSBmcm9tICcuLi8uLi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUHVsbFJlcXVlc3RDSU1vZGVsLmpzJztcbmltcG9ydCB7IENJQ2hlY2tHcm91cCwgZ2V0Q2hlY2tHcm91cCwgZ2V0Q2hlY2tTdGF0ZUxhYmVsIH0gZnJvbSAnLi9jaGVja3NBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoZWNrc1ZpZXdNb2RlbCB9IGZyb20gJy4vY2hlY2tzVmlld01vZGVsLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5pbnRlcmZhY2UgSUNJQ2hlY2tMaXN0SXRlbSB7XG5cdHJlYWRvbmx5IGNoZWNrOiBJR2l0SHViQ0lDaGVjaztcblx0cmVhZG9ubHkgZ3JvdXA6IENJQ2hlY2tHcm91cDtcbn1cblxuaW50ZXJmYWNlIElDSUNoZWNrQ291bnRzIHtcblx0cmVhZG9ubHkgcnVubmluZzogbnVtYmVyO1xuXHRyZWFkb25seSBwZW5kaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IGZhaWxlZDogbnVtYmVyO1xuXHRyZWFkb25seSBzdWNjZXNzZnVsOiBudW1iZXI7XG59XG5cbmNsYXNzIENJQ2hlY2tMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJQ0lDaGVja0xpc3RJdGVtPiB7XG5cdHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVCA9IDI4O1xuXG5cdGdldEhlaWdodChfZWxlbWVudDogSUNJQ2hlY2tMaXN0SXRlbSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIENJQ2hlY2tMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKF9lbGVtZW50OiBJQ0lDaGVja0xpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ0lDaGVja0xpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNJQ2hlY2tUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSByb3c6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBDSUNoZWNrTGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJQ0lDaGVja0xpc3RJdGVtLCBJQ0lDaGVja1RlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnY2lDaGVjayc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBDSUNoZWNrTGlzdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0TW9kZWw6ICgpID0+IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB8IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNJQ2hlY2tUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgcm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaS1zdGF0dXMtd2lkZ2V0LWNoZWNrJykpO1xuXG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSBkb20uYXBwZW5kKHJvdywgJCgnLmNpLXN0YXR1cy13aWRnZXQtY2hlY2stbGFiZWwnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9sYWJlbHMuY3JlYXRlKGxhYmVsQ29udGFpbmVyLCB7IHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBkb20uYXBwZW5kKHJvdywgJCgnLmNpLXN0YXR1cy13aWRnZXQtY2hlY2stYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbnRhaW5lcikpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvdyxcblx0XHRcdGxhYmVsLFxuXHRcdFx0YWN0aW9uQmFyLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSxcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJQ0lDaGVja0xpc3RJdGVtLCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ0lDaGVja1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cblx0XHR0ZW1wbGF0ZURhdGEucm93LmNsYXNzTmFtZSA9IGBjaS1zdGF0dXMtd2lkZ2V0LWNoZWNrICR7Z2V0Q2hlY2tTdGF0dXNDbGFzcyhlbGVtZW50LmNoZWNrKX1gO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZSgnY2kuY2hlY2tUaXRsZScsIFwiezB9OiB7MX1cIiwgZWxlbWVudC5jaGVjay5uYW1lLCBnZXRDaGVja1N0YXRlTGFiZWwoZWxlbWVudC5jaGVjaykpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRSZXNvdXJjZSh7XG5cdFx0XHRuYW1lOiBlbGVtZW50LmNoZWNrLm5hbWUsXG5cdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICdnaXRodWItY2hlY2snLCBwYXRoOiBgLyR7ZWxlbWVudC5jaGVjay5pZH0vJHtlbGVtZW50LmNoZWNrLm5hbWV9YCB9KSxcblx0XHR9LCB7XG5cdFx0XHRpY29uOiBnZXRDaGVja0ljb24oZWxlbWVudC5jaGVjayksXG5cdFx0XHR0aXRsZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cblx0XHRpZiAoZWxlbWVudC5ncm91cCA9PT0gQ0lDaGVja0dyb3VwLkZhaWxlZCAmJiBwYXJzZVdvcmtmbG93UnVuSWQoZWxlbWVudC5jaGVjay5kZXRhaWxzVXJsKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2NpLnJlcnVuQ2hlY2snLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2kucmVydW5DaGVjaycsIFwiUmVydW4gQ2hlY2tcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmRlYnVnUmVydW4pLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZ2V0TW9kZWwoKT8ucmVydW5GYWlsZWRDaGVjayhlbGVtZW50LmNoZWNrKTtcblx0XHRcdFx0fSxcblx0XHRcdCkpKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5jaGVjay5kZXRhaWxzVXJsKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2NpLm9wZW5PbkdpdEh1YicsXG5cdFx0XHRcdGxvY2FsaXplKCdjaS5vcGVuT25HaXRIdWInLCBcIk9wZW4gb24gR2l0SHViXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5saW5rRXh0ZXJuYWwpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShlbGVtZW50LmNoZWNrLmRldGFpbHNVcmwhKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpKSk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElDSUNoZWNrTGlzdEl0ZW0sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDSUNoZWNrVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElDSUNoZWNrVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogQSB3aWRnZXQgdGhhdCBzaG93cyB0aGUgQ0kgc3RhdHVzIG9mIGEgUFIuXG4gKiBSZW5kZXJlZCBiZW5lYXRoIHRoZSBjaGFuZ2VzIHRyZWUgaW4gdGhlIGNoYW5nZXMgdmlldyBhcyBhIFNwbGl0VmlldyBwYW5lLlxuICovXG5leHBvcnQgY2xhc3MgQ0lTdGF0dXNXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSEVBREVSX0hFSUdIVCA9IDM0OyAvLyA2cHggaGVhZGVyIG1hcmdpbi10b3AgKyA4cHggaGVhZGVyIHBhZGRpbmcgKyAyMHB4IGhlYWRlciBtaW4taGVpZ2h0XG5cdHN0YXRpYyByZWFkb25seSBNSU5fQk9EWV9IRUlHSFQgPSA1ICogQ0lDaGVja0xpc3REZWxlZ2F0ZS5JVEVNX0hFSUdIVDtcblx0c3RhdGljIHJlYWRvbmx5IFBSRUZFUlJFRF9CT0RZX0hFSUdIVCA9IDUgKiBDSUNoZWNrTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRzdGF0aWMgcmVhZG9ubHkgTUFYX0JPRFlfSEVJR0hUID0gMjQwOyAvLyBhdCBtb3N0IH44IGNoZWNrc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWFkZXJOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVMYWJlbE5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb3VudHNOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0OiBXb3JrYmVuY2hMaXN0PElDSUNoZWNrTGlzdEl0ZW0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVDb2xsYXBzZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRUb2dnbGVDb2xsYXBzZWQgPSB0aGlzLl9vbkRpZFRvZ2dsZUNvbGxhcHNlZC5ldmVudDtcblxuXHRwcml2YXRlIF9jaGVja0NvdW50ID0gMDtcblx0cHJpdmF0ZSBfY29sbGFwc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX21vZGVsOiBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZXZyb25Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHQvKiogVGhlIGZ1bGwgY29udGVudCBoZWlnaHQgdGhlIHdpZGdldCB3b3VsZCBsaWtlIChoZWFkZXIgKyBhbGwgY2hlY2tzKS4gKi9cblx0Z2V0IGRlc2lyZWRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY2hlY2tDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybiBDSVN0YXR1c1dpZGdldC5IRUFERVJfSEVJR0hUO1xuXHRcdH1cblx0XHRyZXR1cm4gQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIHRoaXMuX2NoZWNrQ291bnQgKiBDSUNoZWNrTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgdGhlIHdpZGdldCBpcyBjdXJyZW50bHkgdmlzaWJsZSAoaGFzIGNoZWNrcyB0byBzaG93KS4gKi9cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrQ291bnQgPiAwO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgdGhlIGJvZHkgaXMgY29sbGFwc2VkIChoZWFkZXItb25seSkuICovXG5cdGdldCBjb2xsYXBzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbGxhcHNlZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9sYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSKSk7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaS1zdGF0dXMtd2lkZ2V0JykpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdC8vIEhlYWRlciAoYWx3YXlzIHZpc2libGUsIGNsaWNrIHRvIGNvbGxhcHNlL2V4cGFuZClcblx0XHR0aGlzLl9oZWFkZXJOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1oZWFkZXInKSk7XG5cdFx0dGhpcy5fdGl0bGVOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC10aXRsZScpKTtcblx0XHR0aGlzLl90aXRsZUxhYmVsTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5fdGl0bGVOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC10aXRsZS1sYWJlbCcpKTtcblx0XHR0aGlzLl90aXRsZUxhYmVsTm9kZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaS5jaGVja3NMYWJlbCcsIFwiQ2hlY2tzXCIpO1xuXHRcdHRoaXMuX2NvdW50c05vZGUgPSBkb20uYXBwZW5kKHRoaXMuX3RpdGxlTm9kZSwgJCgnLmNpLXN0YXR1cy13aWRnZXQtY291bnRzJykpO1xuXHRcdHRoaXMuX2NoZXZyb25Ob2RlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJOb2RlLCAkKCcuZ3JvdXAtY2hldnJvbicpKTtcblx0XHR0aGlzLl9jaGV2cm9uTm9kZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hldnJvbkRvd24pKTtcblxuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NpLnRvZ2dsZUNoZWNrcycsIFwiVG9nZ2xlIENoZWNrc1wiKSk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUudGFiSW5kZXggPSAwO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWFkZXJOb2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90b2dnbGVDb2xsYXBzZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWFkZXJOb2RlLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmICgoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykgJiYgZS50YXJnZXQgPT09IHRoaXMuX2hlYWRlck5vZGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl90b2dnbGVDb2xsYXBzZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBCb2R5IChsaXN0IG9mIGNoZWNrcylcblx0XHRjb25zdCBib2R5SWQgPSAnY2ktc3RhdHVzLXdpZGdldC1ib2R5Jztcblx0XHR0aGlzLl9ib2R5Tm9kZSA9IGRvbS5hcHBlbmQodGhpcy5fZG9tTm9kZSwgJChgLiR7Ym9keUlkfWApKTtcblx0XHR0aGlzLl9ib2R5Tm9kZS5pZCA9IGJvZHlJZDtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIGJvZHlJZCk7XG5cblx0XHRjb25zdCBsaXN0Q29udGFpbmVyID0gJCgnLmNpLXN0YXR1cy13aWRnZXQtbGlzdCcpO1xuXHRcdHRoaXMuX2xpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3Q8SUNJQ2hlY2tMaXN0SXRlbT4sXG5cdFx0XHQnQ0lTdGF0dXNXaWRnZXQnLFxuXHRcdFx0bGlzdENvbnRhaW5lcixcblx0XHRcdG5ldyBDSUNoZWNrTGlzdERlbGVnYXRlKCksXG5cdFx0XHRbbmV3IENJQ2hlY2tMaXN0UmVuZGVyZXIodGhpcy5fbGFiZWxzLCB0aGlzLl9vcGVuZXJTZXJ2aWNlLCAoKSA9PiB0aGlzLl9tb2RlbCldLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2NpLmNoZWNrc0xpc3RBcmlhTGFiZWwnLCBcIkNoZWNrc1wiKSxcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IGl0ZW0gPT4gbG9jYWxpemUoJ2NpLmNoZWNrQXJpYUxhYmVsJywgXCJ7MH0sIHsxfVwiLCBpdGVtLmNoZWNrLm5hbWUsIGdldENoZWNrU3RhdGVMYWJlbChpdGVtLmNoZWNrKSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogaXRlbSA9PiBpdGVtLmNoZWNrLm5hbWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmFwcGVuZENoaWxkKGxpc3RDb250YWluZXIpO1xuXHR9XG5cblx0c2V0SW5wdXQoaW5wdXQ6IENoZWNrc1ZpZXdNb2RlbCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fbW9kZWwgPSBpbnB1dC5jaGVja3NPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX21vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2NoZWNrQ291bnQgPSAwO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJCb2R5KFtdKTtcblx0XHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hlY2tzID0gdGhpcy5fbW9kZWwuY2hlY2tzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKGNoZWNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fY2hlY2tDb3VudCA9IDA7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckJvZHkoW10pO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzb3J0ZWQgPSBzb3J0Q2hlY2tzKGNoZWNrcyk7XG5cdFx0XHRjb25zdCBvbGRDb3VudCA9IHRoaXMuX2NoZWNrQ291bnQ7XG5cdFx0XHR0aGlzLl9jaGVja0NvdW50ID0gc29ydGVkLmxlbmd0aDtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9yZW5kZXJIZWFkZXIoY2hlY2tzKTtcblx0XHRcdHRoaXMuX3JlbmRlckJvZHkoc29ydGVkKTtcblxuXHRcdFx0aWYgKHRoaXMuX2NoZWNrQ291bnQgIT09IG9sZENvdW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckhlYWRlcihjaGVja3M6IHJlYWRvbmx5IElHaXRIdWJDSUNoZWNrW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb3VudHMgPSBnZXRDaGVja0NvdW50cyhjaGVja3MpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvdW50IGJhZGdlc1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY291bnRzTm9kZSk7XG5cblx0XHRpZiAoY291bnRzLnJ1bm5pbmcgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IGRvbS5hcHBlbmQodGhpcy5fY291bnRzTm9kZSwgJCgnLmNpLXN0YXR1cy13aWRnZXQtY291bnQtYmFkZ2UuY2ktc3RhdHVzLXJ1bm5pbmcnKSk7XG5cdFx0XHRiYWRnZS5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2lyY2xlRmlsbGVkQ29tcGFjdCkpO1xuXHRcdFx0ZG9tLmFwcGVuZChiYWRnZSwgJCgnc3BhbicpKS50ZXh0Q29udGVudCA9IGAke2NvdW50cy5ydW5uaW5nfWA7XG5cdFx0fVxuXG5cdFx0aWYgKGNvdW50cy5mYWlsZWQgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IGRvbS5hcHBlbmQodGhpcy5fY291bnRzTm9kZSwgJCgnLmNpLXN0YXR1cy13aWRnZXQtY291bnQtYmFkZ2UuY2ktc3RhdHVzLWZhaWx1cmUnKSk7XG5cdFx0XHRiYWRnZS5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uZXJyb3JDb21wYWN0KSk7XG5cdFx0XHRkb20uYXBwZW5kKGJhZGdlLCAkKCdzcGFuJykpLnRleHRDb250ZW50ID0gYCR7Y291bnRzLmZhaWxlZH1gO1xuXHRcdH1cblxuXHRcdGlmIChjb3VudHMucGVuZGluZyA+IDApIHtcblx0XHRcdGNvbnN0IGJhZGdlID0gZG9tLmFwcGVuZCh0aGlzLl9jb3VudHNOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jb3VudC1iYWRnZS5jaS1zdGF0dXMtcGVuZGluZycpKTtcblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWRDb21wYWN0KSk7XG5cdFx0XHRkb20uYXBwZW5kKGJhZGdlLCAkKCdzcGFuJykpLnRleHRDb250ZW50ID0gYCR7Y291bnRzLnBlbmRpbmd9YDtcblx0XHR9XG5cblx0XHRpZiAoY291bnRzLnN1Y2Nlc3NmdWwgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IGRvbS5hcHBlbmQodGhpcy5fY291bnRzTm9kZSwgJCgnLmNpLXN0YXR1cy13aWRnZXQtY291bnQtYmFkZ2UuY2ktc3RhdHVzLXN1Y2Nlc3MnKSk7XG5cdFx0XHRiYWRnZS5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24ucGFzc0ZpbGxlZENvbXBhY3QpKTtcblx0XHRcdGRvbS5hcHBlbmQoYmFkZ2UsICQoJ3NwYW4nKSkudGV4dENvbnRlbnQgPSBgJHtjb3VudHMuc3VjY2Vzc2Z1bH1gO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHdpZGdldCBib2R5IGxpc3QgdG8gdGhlIGdpdmVuIGhlaWdodC5cblx0ICogQ2FsbGVkIGJ5IHRoZSBwYXJlbnQgdmlldyBhZnRlciBjb21wdXRpbmcgYXZhaWxhYmxlIHNwYWNlLlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlZCkge1xuXHRcdFx0dGhpcy5fYm9keU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYm9keU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGVDb2xsYXBzZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRDb2xsYXBzZWQoIXRoaXMuX2NvbGxhcHNlZCk7XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgY29sbGFwc2VkIHN0YXRlIGFuZCBub3RpZmllcyB0aGUgU3BsaXRWaWV3IGxheW91dC4gKi9cblx0c2V0Q29sbGFwc2VkKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQgPT09IGNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRDb2xsYXBzZWQoY29sbGFwc2VkKTtcblx0XHR0aGlzLl9vbkRpZFRvZ2dsZUNvbGxhcHNlZC5maXJlKGNvbGxhcHNlZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZCB0aGUgYm9keSBpZiBpdCBpcyBjdXJyZW50bHkgY29sbGFwc2VkLCBub3RpZnlpbmcgbGlzdGVuZXJzIHNvIHRoZVxuXHQgKiBwYXJlbnQgcGFuZSByZXN0b3JlcyBpdHMgc2l6ZS4gTm8tb3Agd2hlbiBhbHJlYWR5IGV4cGFuZGVkLlxuXHQgKi9cblx0ZXhwYW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q29sbGFwc2VkKGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIGtleWJvYXJkIGZvY3VzIGludG8gdGhlIGNoZWNrcyBsaXN0LiBGYWxscyBiYWNrIHRvIHRoZSBoZWFkZXIgd2hlblxuXHQgKiB0aGUgYm9keSBpcyBjb2xsYXBzZWQgb3IgdGhlcmUgaXMgbm90aGluZyB0byBmb2N1cy5cblx0ICovXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQgfHwgdGhpcy5fY2hlY2tDb3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5faGVhZGVyTm9kZS5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0aWYgKHRoaXMuX2xpc3QubGVuZ3RoID4gMCAmJiB0aGlzLl9saXN0LmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFswXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29sbGFwc2VkKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbGxhcHNlZCA9IGNvbGxhcHNlZDtcblx0XHR0aGlzLl91cGRhdGVDaGV2cm9uKCk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCBjb2xsYXBzZWQpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNoZXZyb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUuY2xhc3NOYW1lID0gJ2dyb3VwLWNoZXZyb24nO1xuXHRcdHRoaXMuX2NoZXZyb25Ob2RlLmNsYXNzTGlzdC5hZGQoXG5cdFx0XHQuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShcblx0XHRcdFx0dGhpcy5fY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duXG5cdFx0XHQpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckJvZHkoY2hlY2tzOiByZWFkb25seSBJQ0lDaGVja0xpc3RJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgY2hlY2tzKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzb3J0Q2hlY2tzKGNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSk6IElDSUNoZWNrTGlzdEl0ZW1bXSB7XG5cdHJldHVybiBbLi4uY2hlY2tzXVxuXHRcdC5zb3J0KGNvbXBhcmVDaGVja3MpXG5cdFx0Lm1hcChjaGVjayA9PiAoeyBjaGVjaywgZ3JvdXA6IGdldENoZWNrR3JvdXAoY2hlY2spIH0pKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUNoZWNrcyhhOiBJR2l0SHViQ0lDaGVjaywgYjogSUdpdEh1YkNJQ2hlY2spOiBudW1iZXIge1xuXHRjb25zdCBncm91cERpZmYgPSBnZXRDaGVja0dyb3VwKGEpIC0gZ2V0Q2hlY2tHcm91cChiKTtcblx0aWYgKGdyb3VwRGlmZiAhPT0gMCkge1xuXHRcdHJldHVybiBncm91cERpZmY7XG5cdH1cblxuXHRyZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lLCB1bmRlZmluZWQsIHsgc2Vuc2l0aXZpdHk6ICdiYXNlJyB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2hlY2tDb3VudHMoY2hlY2tzOiByZWFkb25seSBJR2l0SHViQ0lDaGVja1tdKTogSUNJQ2hlY2tDb3VudHMge1xuXHRsZXQgcnVubmluZyA9IDA7XG5cdGxldCBwZW5kaW5nID0gMDtcblx0bGV0IGZhaWxlZCA9IDA7XG5cdGxldCBzdWNjZXNzZnVsID0gMDtcblxuXHRmb3IgKGNvbnN0IGNoZWNrIG9mIGNoZWNrcykge1xuXHRcdHN3aXRjaCAoZ2V0Q2hlY2tHcm91cChjaGVjaykpIHtcblx0XHRcdGNhc2UgQ0lDaGVja0dyb3VwLlJ1bm5pbmc6XG5cdFx0XHRcdHJ1bm5pbmcrKztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENJQ2hlY2tHcm91cC5QZW5kaW5nOlxuXHRcdFx0XHRwZW5kaW5nKys7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDSUNoZWNrR3JvdXAuRmFpbGVkOlxuXHRcdFx0XHRmYWlsZWQrKztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENJQ2hlY2tHcm91cC5TdWNjZXNzZnVsOlxuXHRcdFx0XHRzdWNjZXNzZnVsKys7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IHJ1bm5pbmcsIHBlbmRpbmcsIGZhaWxlZCwgc3VjY2Vzc2Z1bCB9O1xufVxuXG5mdW5jdGlvbiBnZXRDaGVja0ljb24oY2hlY2s6IElHaXRIdWJDSUNoZWNrKTogVGhlbWVJY29uIHtcblx0c3dpdGNoIChjaGVjay5zdGF0dXMpIHtcblx0XHRjYXNlIEdpdEh1YkNoZWNrU3RhdHVzLkluUHJvZ3Jlc3M6XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5zeW5jQ29tcGFjdDtcblx0XHRjYXNlIEdpdEh1YkNoZWNrU3RhdHVzLlF1ZXVlZDpcblx0XHRcdHJldHVybiBDb2RpY29uLmNpcmNsZUZpbGxlZENvbXBhY3Q7XG5cdFx0Y2FzZSBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQ6XG5cdFx0XHRzd2l0Y2ggKGNoZWNrLmNvbmNsdXNpb24pIHtcblx0XHRcdFx0Y2FzZSBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2Vzczpcblx0XHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5wYXNzRmlsbGVkQ29tcGFjdDtcblx0XHRcdFx0Y2FzZSBHaXRIdWJDaGVja0NvbmNsdXNpb24uRmFpbHVyZTpcblx0XHRcdFx0Y2FzZSBHaXRIdWJDaGVja0NvbmNsdXNpb24uVGltZWRPdXQ6XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLkFjdGlvblJlcXVpcmVkOlxuXHRcdFx0XHRcdHJldHVybiBDb2RpY29uLmVycm9yQ29tcGFjdDtcblx0XHRcdFx0Y2FzZSBHaXRIdWJDaGVja0NvbmNsdXNpb24uQ2FuY2VsbGVkOlxuXHRcdFx0XHRcdHJldHVybiBDb2RpY29uLmNpcmNsZVNsYXNoQ29tcGFjdDtcblx0XHRcdFx0Y2FzZSBHaXRIdWJDaGVja0NvbmNsdXNpb24uU2tpcHBlZDpcblx0XHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5kZWJ1Z1N0ZXBPdmVyO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBDb2RpY29uLmNpcmNsZUZpbGxlZENvbXBhY3Q7XG5cdFx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBDb2RpY29uLmNpcmNsZUZpbGxlZENvbXBhY3Q7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Q2hlY2tTdGF0dXNDbGFzcyhjaGVjazogSUdpdEh1YkNJQ2hlY2spOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGdldENoZWNrR3JvdXAoY2hlY2spKSB7XG5cdFx0Y2FzZSBDSUNoZWNrR3JvdXAuUnVubmluZzpcblx0XHRcdHJldHVybiAnY2ktc3RhdHVzLXJ1bm5pbmcnO1xuXHRcdGNhc2UgQ0lDaGVja0dyb3VwLlBlbmRpbmc6XG5cdFx0XHRyZXR1cm4gJ2NpLXN0YXR1cy1wZW5kaW5nJztcblx0XHRjYXNlIENJQ2hlY2tHcm91cC5GYWlsZWQ6XG5cdFx0XHRyZXR1cm4gJ2NpLXN0YXR1cy1mYWlsdXJlJztcblx0XHRjYXNlIENJQ2hlY2tHcm91cC5TdWNjZXNzZnVsOlxuXHRcdFx0cmV0dXJuICdjaS1zdGF0dXMtc3VjY2Vzcyc7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEMsc0JBQXNCO0FBQ3pFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLHlCQUF5QztBQUN6RSxTQUFtQywwQkFBMEI7QUFDN0QsU0FBUyxjQUFjLGVBQWUsMEJBQTBCO0FBR2hFLE1BQU0s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
