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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IPreferencesService } from "../../../../../services/preferences/common/preferences.js";
import { ToolConfirmKind } from "../../chatService/chatService.js";
import { ChatConfiguration } from "../../constants.js";
import { extractUrlPatterns, getPatternLabel, isUrlApproved } from "./chatUrlFetchingPatterns.js";
const trashButton = {
  iconClass: ThemeIcon.asClassName(Codicon.trash),
  tooltip: localize("delete", "Delete")
};
let ChatUrlFetchingConfirmationContribution = class {
  constructor(_getURLS, _configurationService, _quickInputService, _preferencesService) {
    this._getURLS = _getURLS;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._preferencesService = _preferencesService;
    this.canUseDefaultApprovals = false;
  }
  getPreConfirmAction(ref) {
    return this._checkApproval(ref, true);
  }
  getPostConfirmAction(ref) {
    return this._checkApproval(ref, false);
  }
  _checkApproval(ref, checkRequest) {
    const urls = this._getURLS(ref.parameters);
    if (!urls || urls.length === 0) {
      return void 0;
    }
    const approvedUrls = this._getApprovedUrls();
    const allApproved = urls.every((url) => {
      try {
        const uri = URI.parse(url);
        return isUrlApproved(uri, approvedUrls, checkRequest);
      } catch {
        return false;
      }
    });
    if (allApproved) {
      return {
        type: ToolConfirmKind.Setting,
        id: ChatConfiguration.AutoApprovedUrls
      };
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    return this._getConfirmActions(ref, true);
  }
  getPostConfirmActions(ref) {
    return this._getConfirmActions(ref, false);
  }
  _getConfirmActions(ref, forRequest) {
    const urls = this._getURLS(ref.parameters);
    if (!urls || urls.length === 0) {
      return [];
    }
    const urlsWithoutQuery = urls.map((u) => u.split("?")[0]);
    const actions = [];
    const uniqueUrls = Array.from(new Set(urlsWithoutQuery)).map((u) => URI.parse(u));
    const urlPatterns = new ResourceMap(uniqueUrls.map((u) => [u, extractUrlPatterns(u)]));
    if (urlPatterns.size === 1) {
      const uri = uniqueUrls[0];
      const patterns = urlPatterns.get(uri);
      const topPatterns = patterns.slice(0, 2);
      for (const pattern of topPatterns) {
        const patternLabel = getPatternLabel(uri, pattern);
        actions.push({
          label: forRequest ? localize("approveRequestTo", "Allow requests to {0}", patternLabel) : localize("approveResponseFrom", "Allow responses from {0}", patternLabel),
          select: async () => {
            await this._approvePattern(pattern, forRequest, !forRequest);
            return true;
          }
        });
      }
      actions.push({
        label: localize("moreOptions", "Allow requests to..."),
        select: async () => {
          const result = await this._showMoreOptions(ref, [{ uri, patterns }], forRequest);
          return result;
        }
      });
    } else {
      actions.push({
        label: localize("moreOptionsMultiple", "Configure URL Approvals..."),
        select: async () => {
          await this._showMoreOptions(ref, [...urlPatterns].map(([uri, patterns]) => ({ uri, patterns })), forRequest);
          return true;
        }
      });
    }
    return actions;
  }
  async _showMoreOptions(ref, urls, forRequest) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      const quickTree = disposables.add(this._quickInputService.createQuickTree());
      quickTree.ignoreFocusOut = true;
      quickTree.sortByLabel = false;
      quickTree.placeholder = localize("selectApproval", "Select URL pattern to approve");
      const treeItems = [];
      const approvedUrls = this._getApprovedUrls();
      const dedupedPatterns = /* @__PURE__ */ new Set();
      for (const { uri, patterns } of urls) {
        for (const pattern of patterns.slice().sort((a, b) => b.length - a.length)) {
          if (dedupedPatterns.has(pattern)) {
            continue;
          }
          dedupedPatterns.add(pattern);
          const settings = approvedUrls[pattern];
          const requestChecked = typeof settings === "boolean" ? settings : settings?.approveRequest ?? false;
          const responseChecked = typeof settings === "boolean" ? settings : settings?.approveResponse ?? false;
          treeItems.push({
            label: getPatternLabel(uri, pattern),
            pattern,
            checked: requestChecked && responseChecked ? true : !requestChecked && !responseChecked ? false : "mixed",
            collapsed: true,
            children: [
              {
                label: localize("allowRequestsCheckbox", "Make requests without confirmation"),
                pattern,
                approvalType: "request",
                checked: requestChecked
              },
              {
                label: localize("allowResponsesCheckbox", "Allow responses without confirmation"),
                pattern,
                approvalType: "response",
                checked: responseChecked
              }
            ]
          });
        }
      }
      quickTree.setItemTree(treeItems);
      const updateApprovals = () => {
        const current = { ...this._getApprovedUrls() };
        for (const item of quickTree.itemTree) {
          const allowPre = item.children?.find((c) => c.approvalType === "request")?.checked;
          const allowPost = item.children?.find((c) => c.approvalType === "response")?.checked;
          if (allowPost && allowPre) {
            current[item.pattern] = true;
          } else if (!allowPost && !allowPre) {
            delete current[item.pattern];
          } else {
            current[item.pattern] = {
              approveRequest: !!allowPre || void 0,
              approveResponse: !!allowPost || void 0
            };
          }
        }
        return this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, current);
      };
      disposables.add(quickTree.onDidAccept(async () => {
        quickTree.busy = true;
        await updateApprovals();
        resolve(!!this._checkApproval(ref, forRequest));
        quickTree.hide();
      }));
      disposables.add(quickTree.onDidHide(() => {
        updateApprovals();
        disposables.dispose();
        resolve(false);
      }));
      quickTree.show();
    });
  }
  async _approvePattern(pattern, approveRequest, approveResponse) {
    const approvedUrls = { ...this._getApprovedUrls() };
    const existingSettings = approvedUrls[pattern];
    let existingRequest = false;
    let existingResponse = false;
    if (typeof existingSettings === "boolean") {
      existingRequest = existingSettings;
      existingResponse = existingSettings;
    } else if (existingSettings) {
      existingRequest = existingSettings.approveRequest ?? false;
      existingResponse = existingSettings.approveResponse ?? false;
    }
    const mergedRequest = approveRequest || existingRequest;
    const mergedResponse = approveResponse || existingResponse;
    let value;
    if (mergedRequest === mergedResponse) {
      value = mergedRequest;
    } else {
      value = { approveRequest: mergedRequest, approveResponse: mergedResponse };
    }
    approvedUrls[pattern] = value;
    await this._configurationService.updateValue(
      ChatConfiguration.AutoApprovedUrls,
      approvedUrls
    );
  }
  getManageActions() {
    const approvedUrls = { ...this._getApprovedUrls() };
    const items = [];
    for (const [pattern, settings] of Object.entries(approvedUrls)) {
      const label = pattern;
      let description;
      if (typeof settings === "boolean") {
        description = settings ? localize("approveAll", "Approve all") : localize("denyAll", "Deny all");
      } else {
        const parts = [];
        if (settings.approveRequest) {
          parts.push(localize("requests", "requests"));
        }
        if (settings.approveResponse) {
          parts.push(localize("responses", "responses"));
        }
        description = parts.length > 0 ? localize("approves", "Approves {0}", parts.join(", ")) : localize("noApprovals", "No approvals");
      }
      const item = {
        label,
        description,
        buttons: [trashButton],
        checked: true,
        onDidChangeChecked: (checked) => {
          if (checked) {
            approvedUrls[pattern] = settings;
          } else {
            delete approvedUrls[pattern];
          }
          this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, approvedUrls);
        }
      };
      items.push(item);
    }
    items.push({
      pickable: false,
      label: localize("moreOptionsManage", "More Options..."),
      description: localize("openSettings", "Open settings"),
      onDidOpen: () => {
        this._preferencesService.openUserSettings({ query: ChatConfiguration.AutoApprovedUrls });
      }
    });
    return items;
  }
  async reset() {
    await this._configurationService.updateValue(
      ChatConfiguration.AutoApprovedUrls,
      {}
    );
  }
  _getApprovedUrls() {
    return this._configurationService.getValue(
      ChatConfiguration.AutoApprovedUrls
    ) || {};
  }
};
ChatUrlFetchingConfirmationContribution = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IPreferencesService)
], ChatUrlFetchingConfirmationContribution);
export {
  ChatUrlFetchingConfirmationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcY2hhdFVybEZldGNoaW5nQ29uZmlybWF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrVHJlZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQge1xuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zLFxuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24sXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0sXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZlxufSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RVcmxQYXR0ZXJucywgZ2V0UGF0dGVybkxhYmVsLCBpc1VybEFwcHJvdmVkLCBJVXJsQXBwcm92YWxTZXR0aW5ncyB9IGZyb20gJy4vY2hhdFVybEZldGNoaW5nUGF0dGVybnMuanMnO1xuXG5jb25zdCB0cmFzaEJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2gpLFxuXHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZXRlJywgXCJEZWxldGVcIilcbn07XG5cbmV4cG9ydCBjbGFzcyBDaGF0VXJsRmV0Y2hpbmdDb25maXJtYXRpb25Db250cmlidXRpb24gaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24ge1xuXHRyZWFkb25seSBjYW5Vc2VEZWZhdWx0QXBwcm92YWxzID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0VVJMUzogKHBhcmFtZXRlcnM6IHVua25vd24pID0+IHN0cmluZ1tdIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbihyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrQXBwcm92YWwocmVmLCB0cnVlKTtcblx0fVxuXG5cdGdldFBvc3RDb25maXJtQWN0aW9uKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hlY2tBcHByb3ZhbChyZWYsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrQXBwcm92YWwocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYsIGNoZWNrUmVxdWVzdDogYm9vbGVhbik6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdXJscyA9IHRoaXMuX2dldFVSTFMocmVmLnBhcmFtZXRlcnMpO1xuXHRcdGlmICghdXJscyB8fCB1cmxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhcHByb3ZlZFVybHMgPSB0aGlzLl9nZXRBcHByb3ZlZFVybHMoKTtcblxuXHRcdC8vIENoZWNrIGlmIGFsbCBVUkxzIGFyZSBhcHByb3ZlZFxuXHRcdGNvbnN0IGFsbEFwcHJvdmVkID0gdXJscy5ldmVyeSh1cmwgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVybCk7XG5cdFx0XHRcdHJldHVybiBpc1VybEFwcHJvdmVkKHVyaSwgYXBwcm92ZWRVcmxzLCBjaGVja1JlcXVlc3QpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChhbGxBcHByb3ZlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsXG5cdFx0XHRcdGlkOiBDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRQcmVDb25maXJtQWN0aW9ucyhyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldENvbmZpcm1BY3Rpb25zKHJlZiwgdHJ1ZSk7XG5cdH1cblxuXHRnZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb25maXJtQWN0aW9ucyhyZWYsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmLCBmb3JSZXF1ZXN0OiBib29sZWFuKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRjb25zdCB1cmxzID0gdGhpcy5fZ2V0VVJMUyhyZWYucGFyYW1ldGVycyk7XG5cdFx0aWYgKCF1cmxzIHx8IHVybHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly9yZW1vdmUgcXVlcnkgc3RyaW5nc1xuXHRcdGNvbnN0IHVybHNXaXRob3V0UXVlcnkgPSB1cmxzLm1hcCh1ID0+IHUuc3BsaXQoJz8nKVswXSk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10gPSBbXTtcblxuXHRcdC8vIEdldCB1bmlxdWUgVVJMcyAobWF5IGhhdmUgZHVwbGljYXRlcylcblx0XHRjb25zdCB1bmlxdWVVcmxzID0gQXJyYXkuZnJvbShuZXcgU2V0KHVybHNXaXRob3V0UXVlcnkpKS5tYXAodSA9PiBVUkkucGFyc2UodSkpO1xuXG5cdFx0Ly8gRm9yIGVhY2ggVVJMLCBnZXQgaXRzIHBhdHRlcm5zXG5cdFx0Y29uc3QgdXJsUGF0dGVybnMgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nW10+KHVuaXF1ZVVybHMubWFwKHUgPT4gW3UsIGV4dHJhY3RVcmxQYXR0ZXJucyh1KV0gYXMgY29uc3QpKTtcblxuXHRcdC8vIElmIG9ubHkgb25lIFVSTCwgc2hvdyBxdWljayBhY3Rpb25zIGZvciBzcGVjaWZpYyBwYXR0ZXJuc1xuXHRcdGlmICh1cmxQYXR0ZXJucy5zaXplID09PSAxKSB7XG5cdFx0XHRjb25zdCB1cmkgPSB1bmlxdWVVcmxzWzBdO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSB1cmxQYXR0ZXJucy5nZXQodXJpKSE7XG5cblx0XHRcdC8vIFNob3cgdG9wIDIgbW9zdCByZWxldmFudCBwYXR0ZXJucyBhcyBxdWljayBhY3Rpb25zXG5cdFx0XHRjb25zdCB0b3BQYXR0ZXJucyA9IHBhdHRlcm5zLnNsaWNlKDAsIDIpO1xuXHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHRvcFBhdHRlcm5zKSB7XG5cdFx0XHRcdGNvbnN0IHBhdHRlcm5MYWJlbCA9IGdldFBhdHRlcm5MYWJlbCh1cmksIHBhdHRlcm4pO1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBmb3JSZXF1ZXN0XG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhcHByb3ZlUmVxdWVzdFRvJywgXCJBbGxvdyByZXF1ZXN0cyB0byB7MH1cIiwgcGF0dGVybkxhYmVsKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXBwcm92ZVJlc3BvbnNlRnJvbScsIFwiQWxsb3cgcmVzcG9uc2VzIGZyb20gezB9XCIsIHBhdHRlcm5MYWJlbCksXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hcHByb3ZlUGF0dGVybihwYXR0ZXJuLCBmb3JSZXF1ZXN0LCAhZm9yUmVxdWVzdCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBcIk1vcmUgb3B0aW9uc1wiIGFjdGlvblxuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb3JlT3B0aW9ucycsIFwiQWxsb3cgcmVxdWVzdHMgdG8uLi5cIiksXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Nob3dNb3JlT3B0aW9ucyhyZWYsIFt7IHVyaSwgcGF0dGVybnMgfV0sIGZvclJlcXVlc3QpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBNdWx0aXBsZSBVUkxzIC0gc2hvdyBcIk1vcmUgb3B0aW9uc1wiIG9ubHlcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW9yZU9wdGlvbnNNdWx0aXBsZScsIFwiQ29uZmlndXJlIFVSTCBBcHByb3ZhbHMuLi5cIiksXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Nob3dNb3JlT3B0aW9ucyhyZWYsIFsuLi51cmxQYXR0ZXJuc10ubWFwKChbdXJpLCBwYXR0ZXJuc10pID0+ICh7IHVyaSwgcGF0dGVybnMgfSkpLCBmb3JSZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93TW9yZU9wdGlvbnMocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYsIHVybHM6IHsgdXJpOiBVUkk7IHBhdHRlcm5zOiBzdHJpbmdbXSB9W10sIGZvclJlcXVlc3Q6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpbnRlcmZhY2UgSVBhdHRlcm5UcmVlSXRlbSBleHRlbmRzIElRdWlja1RyZWVJdGVtIHtcblx0XHRcdHBhdHRlcm46IHN0cmluZztcblx0XHRcdGFwcHJvdmFsVHlwZT86ICdyZXF1ZXN0JyB8ICdyZXNwb25zZSc7XG5cdFx0XHRjaGlsZHJlbj86IElQYXR0ZXJuVHJlZUl0ZW1bXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4oKHJlc29sdmUpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcXVpY2tUcmVlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrVHJlZTxJUGF0dGVyblRyZWVJdGVtPigpKTtcblx0XHRcdHF1aWNrVHJlZS5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRxdWlja1RyZWUuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHRcdHF1aWNrVHJlZS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWxlY3RBcHByb3ZhbCcsIFwiU2VsZWN0IFVSTCBwYXR0ZXJuIHRvIGFwcHJvdmVcIik7XG5cblx0XHRcdGNvbnN0IHRyZWVJdGVtczogSVBhdHRlcm5UcmVlSXRlbVtdID0gW107XG5cdFx0XHRjb25zdCBhcHByb3ZlZFVybHMgPSB0aGlzLl9nZXRBcHByb3ZlZFVybHMoKTtcblx0XHRcdGNvbnN0IGRlZHVwZWRQYXR0ZXJucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgdXJpLCBwYXR0ZXJucyB9IG9mIHVybHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zLnNsaWNlKCkuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRpZiAoZGVkdXBlZFBhdHRlcm5zLmhhcyhwYXR0ZXJuKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZHVwZWRQYXR0ZXJucy5hZGQocGF0dGVybik7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBhcHByb3ZlZFVybHNbcGF0dGVybl07XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdENoZWNrZWQgPSB0eXBlb2Ygc2V0dGluZ3MgPT09ICdib29sZWFuJyA/IHNldHRpbmdzIDogKHNldHRpbmdzPy5hcHByb3ZlUmVxdWVzdCA/PyBmYWxzZSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2VDaGVja2VkID0gdHlwZW9mIHNldHRpbmdzID09PSAnYm9vbGVhbicgPyBzZXR0aW5ncyA6IChzZXR0aW5ncz8uYXBwcm92ZVJlc3BvbnNlID8/IGZhbHNlKTtcblxuXHRcdFx0XHRcdHRyZWVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBnZXRQYXR0ZXJuTGFiZWwodXJpLCBwYXR0ZXJuKSxcblx0XHRcdFx0XHRcdHBhdHRlcm4sXG5cdFx0XHRcdFx0XHRjaGVja2VkOiByZXF1ZXN0Q2hlY2tlZCAmJiByZXNwb25zZUNoZWNrZWQgPyB0cnVlIDogKCFyZXF1ZXN0Q2hlY2tlZCAmJiAhcmVzcG9uc2VDaGVja2VkID8gZmFsc2UgOiAnbWl4ZWQnKSxcblx0XHRcdFx0XHRcdGNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93UmVxdWVzdHNDaGVja2JveCcsIFwiTWFrZSByZXF1ZXN0cyB3aXRob3V0IGNvbmZpcm1hdGlvblwiKSxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuLFxuXHRcdFx0XHRcdFx0XHRcdGFwcHJvdmFsVHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHJlcXVlc3RDaGVja2VkXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93UmVzcG9uc2VzQ2hlY2tib3gnLCBcIkFsbG93IHJlc3BvbnNlcyB3aXRob3V0IGNvbmZpcm1hdGlvblwiKSxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuLFxuXHRcdFx0XHRcdFx0XHRcdGFwcHJvdmFsVHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0XHRcdFx0XHRjaGVja2VkOiByZXNwb25zZUNoZWNrZWRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRxdWlja1RyZWUuc2V0SXRlbVRyZWUodHJlZUl0ZW1zKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlQXBwcm92YWxzID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0geyAuLi50aGlzLl9nZXRBcHByb3ZlZFVybHMoKSB9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcXVpY2tUcmVlLml0ZW1UcmVlKSB7XG5cdFx0XHRcdFx0Ly8gcm9vdC1sZXZlbCBpdGVtc1xuXG5cdFx0XHRcdFx0Y29uc3QgYWxsb3dQcmUgPSBpdGVtLmNoaWxkcmVuPy5maW5kKGMgPT4gYy5hcHByb3ZhbFR5cGUgPT09ICdyZXF1ZXN0Jyk/LmNoZWNrZWQ7XG5cdFx0XHRcdFx0Y29uc3QgYWxsb3dQb3N0ID0gaXRlbS5jaGlsZHJlbj8uZmluZChjID0+IGMuYXBwcm92YWxUeXBlID09PSAncmVzcG9uc2UnKT8uY2hlY2tlZDtcblxuXHRcdFx0XHRcdGlmIChhbGxvd1Bvc3QgJiYgYWxsb3dQcmUpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRbaXRlbS5wYXR0ZXJuXSA9IHRydWU7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghYWxsb3dQb3N0ICYmICFhbGxvd1ByZSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGN1cnJlbnRbaXRlbS5wYXR0ZXJuXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y3VycmVudFtpdGVtLnBhdHRlcm5dID0ge1xuXHRcdFx0XHRcdFx0XHRhcHByb3ZlUmVxdWVzdDogISFhbGxvd1ByZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVSZXNwb25zZTogISFhbGxvd1Bvc3QgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJscywgY3VycmVudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tUcmVlLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0cXVpY2tUcmVlLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCB1cGRhdGVBcHByb3ZhbHMoKTtcblx0XHRcdFx0cmVzb2x2ZSghIXRoaXMuX2NoZWNrQXBwcm92YWwocmVmLCBmb3JSZXF1ZXN0KSk7XG5cdFx0XHRcdHF1aWNrVHJlZS5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1RyZWUub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0dXBkYXRlQXBwcm92YWxzKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZShmYWxzZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrVHJlZS5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHByb3ZlUGF0dGVybihwYXR0ZXJuOiBzdHJpbmcsIGFwcHJvdmVSZXF1ZXN0OiBib29sZWFuLCBhcHByb3ZlUmVzcG9uc2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcHByb3ZlZFVybHMgPSB7IC4uLnRoaXMuX2dldEFwcHJvdmVkVXJscygpIH07XG5cblx0XHQvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHNldHRpbmdzIGZvciB0aGlzIHBhdHRlcm5cblx0XHRjb25zdCBleGlzdGluZ1NldHRpbmdzID0gYXBwcm92ZWRVcmxzW3BhdHRlcm5dO1xuXHRcdGxldCBleGlzdGluZ1JlcXVlc3QgPSBmYWxzZTtcblx0XHRsZXQgZXhpc3RpbmdSZXNwb25zZSA9IGZhbHNlO1xuXHRcdGlmICh0eXBlb2YgZXhpc3RpbmdTZXR0aW5ncyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRleGlzdGluZ1JlcXVlc3QgPSBleGlzdGluZ1NldHRpbmdzO1xuXHRcdFx0ZXhpc3RpbmdSZXNwb25zZSA9IGV4aXN0aW5nU2V0dGluZ3M7XG5cdFx0fSBlbHNlIGlmIChleGlzdGluZ1NldHRpbmdzKSB7XG5cdFx0XHRleGlzdGluZ1JlcXVlc3QgPSBleGlzdGluZ1NldHRpbmdzLmFwcHJvdmVSZXF1ZXN0ID8/IGZhbHNlO1xuXHRcdFx0ZXhpc3RpbmdSZXNwb25zZSA9IGV4aXN0aW5nU2V0dGluZ3MuYXBwcm92ZVJlc3BvbnNlID8/IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlZFJlcXVlc3QgPSBhcHByb3ZlUmVxdWVzdCB8fCBleGlzdGluZ1JlcXVlc3Q7XG5cdFx0Y29uc3QgbWVyZ2VkUmVzcG9uc2UgPSBhcHByb3ZlUmVzcG9uc2UgfHwgZXhpc3RpbmdSZXNwb25zZTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgYXBwcm92YWwgc2V0dGluZ3Ncblx0XHRsZXQgdmFsdWU6IGJvb2xlYW4gfCBJVXJsQXBwcm92YWxTZXR0aW5ncztcblx0XHRpZiAobWVyZ2VkUmVxdWVzdCA9PT0gbWVyZ2VkUmVzcG9uc2UpIHtcblx0XHRcdHZhbHVlID0gbWVyZ2VkUmVxdWVzdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsdWUgPSB7IGFwcHJvdmVSZXF1ZXN0OiBtZXJnZWRSZXF1ZXN0LCBhcHByb3ZlUmVzcG9uc2U6IG1lcmdlZFJlc3BvbnNlIH07XG5cdFx0fVxuXG5cdFx0YXBwcm92ZWRVcmxzW3BhdHRlcm5dID0gdmFsdWU7XG5cblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShcblx0XHRcdENoYXRDb25maWd1cmF0aW9uLkF1dG9BcHByb3ZlZFVybHMsXG5cdFx0XHRhcHByb3ZlZFVybHNcblx0XHQpO1xuXHR9XG5cblx0Z2V0TWFuYWdlQWN0aW9ucygpOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtW10ge1xuXHRcdGNvbnN0IGFwcHJvdmVkVXJscyA9IHsgLi4udGhpcy5fZ2V0QXBwcm92ZWRVcmxzKCkgfTtcblx0XHRjb25zdCBpdGVtczogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtwYXR0ZXJuLCBzZXR0aW5nc10gb2YgT2JqZWN0LmVudHJpZXMoYXBwcm92ZWRVcmxzKSkge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBwYXR0ZXJuO1xuXHRcdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2V0dGluZ3MgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IHNldHRpbmdzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYXBwcm92ZUFsbCcsIFwiQXBwcm92ZSBhbGxcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkZW55QWxsJywgXCJEZW55IGFsbFwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRpZiAoc2V0dGluZ3MuYXBwcm92ZVJlcXVlc3QpIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdyZXF1ZXN0cycsIFwicmVxdWVzdHNcIikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXR0aW5ncy5hcHByb3ZlUmVzcG9uc2UpIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdyZXNwb25zZXMnLCBcInJlc3BvbnNlc1wiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBwYXJ0cy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYXBwcm92ZXMnLCBcIkFwcHJvdmVzIHswfVwiLCBwYXJ0cy5qb2luKCcsICcpKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ25vQXBwcm92YWxzJywgXCJObyBhcHByb3ZhbHNcIik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW06IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0gPSB7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0YnV0dG9uczogW3RyYXNoQnV0dG9uXSxcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDaGVja2VkOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChjaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRhcHByb3ZlZFVybHNbcGF0dGVybl0gPSBzZXR0aW5ncztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGFwcHJvdmVkVXJsc1twYXR0ZXJuXTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzLCBhcHByb3ZlZFVybHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb3JlT3B0aW9uc01hbmFnZScsIFwiTW9yZSBPcHRpb25zLi4uXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdvcGVuU2V0dGluZ3MnLCBcIk9wZW4gc2V0dGluZ3NcIiksXG5cdFx0XHRvbkRpZE9wZW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoeyBxdWVyeTogQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJscyB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdGFzeW5jIHJlc2V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFxuXHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJscyxcblx0XHRcdHt9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFwcHJvdmVkVXJscygpOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgSVVybEFwcHJvdmFsU2V0dGluZ3M+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCBJVXJsQXBwcm92YWxTZXR0aW5ncz4+KFxuXHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJsc1xuXHRcdCkgfHwge307XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUE0QiwwQkFBMEM7QUFDdEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBMEIsdUJBQXVCO0FBQ2pELFNBQVMseUJBQXlCO0FBT2xDLFNBQVMsb0JBQW9CLGlCQUFpQixxQkFBMkM7QUFFekYsTUFBTSxjQUFpQztBQUFBLEVBQ3RDLFdBQVcsVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLEVBQzlDLFNBQVMsU0FBUyxVQUFVLFFBQVE7QUFDckM7QUFFTyxJQUFNLDBDQUFOLE1BQW9HO0FBQUEsRUFHMUcsWUFDa0IsVUFDdUIsdUJBQ0gsb0JBQ0MscUJBQ3JDO0FBSmdCO0FBQ3VCO0FBQ0g7QUFDQztB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
