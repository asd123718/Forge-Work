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
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IssueSource } from "../common/issue.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let IssueQuickAccess = class extends PickerQuickAccessProvider {
  constructor(menuService, contextKeyService, commandService, extensionService, productService) {
    super(IssueQuickAccess.PREFIX, { canAcceptInBackground: true });
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.productService = productService;
  }
  _getPicks(filter) {
    const issuePicksConst = new Array();
    const issuePicksParts = new Array();
    const extensionIdSet = /* @__PURE__ */ new Set();
    const productLabel = this.productService.nameLong;
    const marketPlaceLabel = localize("reportExtensionMarketplace", "Extension Marketplace");
    const productFilter = matchesFuzzy(filter, productLabel, true);
    const marketPlaceFilter = matchesFuzzy(filter, marketPlaceLabel, true);
    if (productFilter) {
      issuePicksConst.push({
        label: productLabel,
        ariaLabel: productLabel,
        highlights: { label: productFilter },
        accept: () => this.commandService.executeCommand("workbench.action.openIssueReporter", { issueSource: IssueSource.VSCode })
      });
    }
    if (marketPlaceFilter) {
      issuePicksConst.push({
        label: marketPlaceLabel,
        ariaLabel: marketPlaceLabel,
        highlights: { label: marketPlaceFilter },
        accept: () => this.commandService.executeCommand("workbench.action.openIssueReporter", { issueSource: IssueSource.Marketplace })
      });
    }
    issuePicksConst.push({ type: "separator", label: localize("extensions", "Extensions") });
    const actions = this.menuService.getMenuActions(MenuId.IssueReporter, this.contextKeyService, { renderShortTitle: true }).flatMap((entry) => entry[1]);
    actions.forEach((action) => {
      if ("source" in action.item && action.item.source) {
        extensionIdSet.add(action.item.source.id);
      }
      const pick = this._createPick(filter, action);
      if (pick) {
        issuePicksParts.push(pick);
      }
    });
    this.extensionService.extensions.forEach((extension) => {
      if (!extension.isBuiltin) {
        const pick = this._createPick(filter, void 0, extension);
        const id = extension.identifier.value;
        if (pick && !extensionIdSet.has(id)) {
          issuePicksParts.push(pick);
        }
        extensionIdSet.add(id);
      }
    });
    issuePicksParts.sort((a, b) => {
      const aLabel = a.label ?? "";
      const bLabel = b.label ?? "";
      return aLabel.localeCompare(bLabel);
    });
    return [...issuePicksConst, ...issuePicksParts];
  }
  _createPick(filter, action, extension) {
    const buttons = [{
      iconClass: ThemeIcon.asClassName(Codicon.info),
      tooltip: localize("contributedIssuePage", "Open Extension Page")
    }];
    let label;
    let trigger;
    let accept;
    if (action && "source" in action.item && action.item.source) {
      label = action.item.source?.title;
      trigger = () => {
        if ("source" in action.item && action.item.source) {
          this.commandService.executeCommand("extension.open", action.item.source.id);
        }
        return TriggerAction.CLOSE_PICKER;
      };
      accept = () => {
        action.run();
      };
    } else if (extension) {
      label = extension.displayName ?? extension.name;
      trigger = () => {
        this.commandService.executeCommand("extension.open", extension.identifier.value);
        return TriggerAction.CLOSE_PICKER;
      };
      accept = () => {
        this.commandService.executeCommand("workbench.action.openIssueReporter", extension.identifier.value);
      };
    } else {
      return void 0;
    }
    const highlights = matchesFuzzy(filter, label, true);
    if (highlights) {
      return {
        label,
        highlights: { label: highlights },
        buttons,
        trigger,
        accept
      };
    }
    return void 0;
  }
};
IssueQuickAccess.PREFIX = "issue ";
IssueQuickAccess = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService)
], IssueQuickAccess);
export {
  IssueQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxpc3N1ZVF1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgRmFzdEFuZFNsb3dQaWNrcywgUGlja3MsIFRyaWdnZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzRnV6enkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElzc3VlU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL2lzc3VlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIElzc3VlUXVpY2tBY2Nlc3MgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHRzdGF0aWMgUFJFRklYID0gJ2lzc3VlICc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoSXNzdWVRdWlja0FjY2Vzcy5QUkVGSVgsIHsgY2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZyk6IFBpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHwgRmFzdEFuZFNsb3dQaWNrczxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB8IFByb21pc2U8UGlja3M8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4gfCBGYXN0QW5kU2xvd1BpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+PiB8IG51bGwge1xuXHRcdGNvbnN0IGlzc3VlUGlja3NDb25zdCA9IG5ldyBBcnJheTxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4oKTtcblx0XHRjb25zdCBpc3N1ZVBpY2tzUGFydHMgPSBuZXcgQXJyYXk8SVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+KCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdC8vIEFkZCBkZWZhdWx0IGl0ZW1zXG5cdFx0Y29uc3QgcHJvZHVjdExhYmVsID0gdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZztcblx0XHRjb25zdCBtYXJrZXRQbGFjZUxhYmVsID0gbG9jYWxpemUoXCJyZXBvcnRFeHRlbnNpb25NYXJrZXRwbGFjZVwiLCBcIkV4dGVuc2lvbiBNYXJrZXRwbGFjZVwiKTtcblx0XHRjb25zdCBwcm9kdWN0RmlsdGVyID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgcHJvZHVjdExhYmVsLCB0cnVlKTtcblx0XHRjb25zdCBtYXJrZXRQbGFjZUZpbHRlciA9IG1hdGNoZXNGdXp6eShmaWx0ZXIsIG1hcmtldFBsYWNlTGFiZWwsIHRydWUpO1xuXG5cdFx0Ly8gQWRkIHByb2R1Y3QgcGljayBpZiBwcm9kdWN0IGZpbHRlciBtYXRjaGVzXG5cdFx0aWYgKHByb2R1Y3RGaWx0ZXIpIHtcblx0XHRcdGlzc3VlUGlja3NDb25zdC5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHByb2R1Y3RMYWJlbCxcblx0XHRcdFx0YXJpYUxhYmVsOiBwcm9kdWN0TGFiZWwsXG5cdFx0XHRcdGhpZ2hsaWdodHM6IHsgbGFiZWw6IHByb2R1Y3RGaWx0ZXIgfSxcblx0XHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJywgeyBpc3N1ZVNvdXJjZTogSXNzdWVTb3VyY2UuVlNDb2RlIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgbWFya2V0cGxhY2UgcGljayBpZiBtYXJrZXRwbGFjZSBmaWx0ZXIgbWF0Y2hlc1xuXHRcdGlmIChtYXJrZXRQbGFjZUZpbHRlcikge1xuXHRcdFx0aXNzdWVQaWNrc0NvbnN0LnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbWFya2V0UGxhY2VMYWJlbCxcblx0XHRcdFx0YXJpYUxhYmVsOiBtYXJrZXRQbGFjZUxhYmVsLFxuXHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBtYXJrZXRQbGFjZUZpbHRlciB9LFxuXHRcdFx0XHRhY2NlcHQ6ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInLCB7IGlzc3VlU291cmNlOiBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZSB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aXNzdWVQaWNrc0NvbnN0LnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpIH0pO1xuXG5cblx0XHQvLyBnZXRzIG1lbnUgYWN0aW9ucyBmcm9tIGNvbnRyaWJ1dGVkXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLklzc3VlUmVwb3J0ZXIsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHsgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9KS5mbGF0TWFwKGVudHJ5ID0+IGVudHJ5WzFdKTtcblxuXHRcdC8vIGNyZWF0ZSBwaWNrcyBmcm9tIGNvbnRyaWJ1dGVkIG1lbnVcblx0XHRhY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHtcblx0XHRcdGlmICgnc291cmNlJyBpbiBhY3Rpb24uaXRlbSAmJiBhY3Rpb24uaXRlbS5zb3VyY2UpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWRTZXQuYWRkKGFjdGlvbi5pdGVtLnNvdXJjZS5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9jcmVhdGVQaWNrKGZpbHRlciwgYWN0aW9uKTtcblx0XHRcdGlmIChwaWNrKSB7XG5cdFx0XHRcdGlzc3VlUGlja3NQYXJ0cy5wdXNoKHBpY2spO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cblx0XHQvLyBjcmVhdGUgcGlja3MgZnJvbSBleHRlbnNpb25zXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZm9yRWFjaChleHRlbnNpb24gPT4ge1xuXHRcdFx0aWYgKCFleHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9jcmVhdGVQaWNrKGZpbHRlciwgdW5kZWZpbmVkLCBleHRlbnNpb24pO1xuXHRcdFx0XHRjb25zdCBpZCA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdFx0XHRpZiAocGljayAmJiAhZXh0ZW5zaW9uSWRTZXQuaGFzKGlkKSkge1xuXHRcdFx0XHRcdGlzc3VlUGlja3NQYXJ0cy5wdXNoKHBpY2spO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dGVuc2lvbklkU2V0LmFkZChpZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpc3N1ZVBpY2tzUGFydHMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgYUxhYmVsID0gYS5sYWJlbCA/PyAnJztcblx0XHRcdGNvbnN0IGJMYWJlbCA9IGIubGFiZWwgPz8gJyc7XG5cdFx0XHRyZXR1cm4gYUxhYmVsLmxvY2FsZUNvbXBhcmUoYkxhYmVsKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBbLi4uaXNzdWVQaWNrc0NvbnN0LCAuLi5pc3N1ZVBpY2tzUGFydHNdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUGljayhmaWx0ZXI6IHN0cmluZywgYWN0aW9uPzogTWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbiB8IHVuZGVmaW5lZCwgZXh0ZW5zaW9uPzogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnV0dG9ucyA9IFt7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbnRyaWJ1dGVkSXNzdWVQYWdlJywgXCJPcGVuIEV4dGVuc2lvbiBQYWdlXCIpXG5cdFx0fV07XG5cblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRsZXQgdHJpZ2dlcjogKCkgPT4gVHJpZ2dlckFjdGlvbjtcblx0XHRsZXQgYWNjZXB0OiAoKSA9PiB2b2lkO1xuXHRcdGlmIChhY3Rpb24gJiYgJ3NvdXJjZScgaW4gYWN0aW9uLml0ZW0gJiYgYWN0aW9uLml0ZW0uc291cmNlKSB7XG5cdFx0XHRsYWJlbCA9IGFjdGlvbi5pdGVtLnNvdXJjZT8udGl0bGU7XG5cdFx0XHR0cmlnZ2VyID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoJ3NvdXJjZScgaW4gYWN0aW9uLml0ZW0gJiYgYWN0aW9uLml0ZW0uc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLm9wZW4nLCBhY3Rpb24uaXRlbS5zb3VyY2UuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdH07XG5cdFx0XHRhY2NlcHQgPSAoKSA9PiB7XG5cdFx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdH07XG5cblx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbikge1xuXHRcdFx0bGFiZWwgPSBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLm5hbWU7XG5cdFx0XHR0cmlnZ2VyID0gKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24ub3BlbicsIGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXHRcdFx0fTtcblx0XHRcdGFjY2VwdCA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcicsIGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdH07XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoaWdobGlnaHRzID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgbGFiZWwsIHRydWUpO1xuXHRcdGlmIChoaWdobGlnaHRzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0aGlnaGxpZ2h0czogeyBsYWJlbDogaGlnaGxpZ2h0cyB9LFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHR0cmlnZ2VyLFxuXHRcdFx0XHRhY2NlcHRcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywyQkFBNEUscUJBQXFCO0FBQzFHLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYyxjQUFpRDtBQUN4RSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFFekIsSUFBTSxtQkFBTixjQUErQiwwQkFBa0Q7QUFBQSxFQUl2RixZQUNnQyxhQUNNLG1CQUNILGdCQUNFLGtCQUNGLGdCQUNqQztBQUNELFVBQU0saUJBQWlCLFFBQVEsRUFBRSx1QkFBdUIsS0FBSyxDQUFDO0FBTi9CO0FBQ007QUFDSDtBQUNFO0FBQ0Y7QUFBQSxFQUduQztBQUFBLEVBRW1CLFVBQVUsUUFBcUw7QUFDak4sVUFBTSxrQkFBa0IsSUFBSSxNQUFvRDtBQUNoRixVQUFNLGtCQUFrQixJQUFJLE1BQW9EO0FBQ2hGLFVBQU0saUJBQWlCLG9CQUFJLElBQVk7QUFHdkMsVUFBTSxlQUFlLEtBQUssZUFBZTtBQUN6QyxVQUFNLG1CQUFtQixTQUFTLDhCQUE4Qix1QkFBdUI7QUFDdkYsVUFBTSxnQkFBZ0IsYUFBYSxRQUFRLGNBQWMsSUFBSTtBQUM3RCxV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
