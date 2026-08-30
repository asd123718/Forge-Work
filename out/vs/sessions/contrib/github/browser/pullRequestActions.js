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
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { $ } from "../../../../base/browser/dom.js";
import { arrayEquals } from "../../../../base/common/equals.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, derivedOpts } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuItemAction, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { asCssVariable } from "../../../../platform/theme/common/colorUtils.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { Menus } from "../../../browser/menus.js";
import { SessionHeaderMetaActionViewItem } from "../../../browser/parts/sessionHeaderMetaActionViewItem.js";
import { SessionHasPullRequestContext } from "../../../common/contextkeys.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { computePullRequestIcon, GitHubPullRequestState } from "../common/types.js";
import { IGitHubService } from "./githubService.js";
import { GitHubReferenceList } from "./githubReferenceList.js";
import { createPullRequestHoverElement } from "./pullRequestHover.js";
import { IPullRequestIconCache } from "./pullRequestIconCache.js";
import { computePullRequestIconStatus } from "./pullRequestIconStatus.js";
const _OpenPullRequestAction = class _OpenPullRequestAction extends Action2 {
  constructor() {
    super({
      id: _OpenPullRequestAction.ID,
      title: localize2("agentSessions.openPullRequest", "Open Pull Request"),
      icon: Codicon.gitPullRequest,
      f1: false,
      // Pull request pill shown in the session header meta row
      // (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
      // custom action view item that summarizes the session's PRs.
      menu: [{
        id: Menus.SessionHeaderMeta,
        group: "navigation",
        order: 1,
        when: SessionHasPullRequestContext
      }, {
        id: Menus.SessionItemContextMenu,
        group: "2_pullRequest",
        order: 0,
        when: SessionHasPullRequestContext
      }]
    });
  }
  async run(accessor, session) {
    const openerService = accessor.get(IOpenerService);
    const sessionsService = accessor.get(ISessionsService);
    const targetSession = (Array.isArray(session) ? session[0] : session) ?? sessionsService.activeSession.get();
    const pullRequestUri = getSessionPullRequestUri(targetSession);
    if (!pullRequestUri) {
      return;
    }
    await openerService.open(pullRequestUri, { openExternal: true });
  }
};
_OpenPullRequestAction.ID = "workbench.agentSessions.action.openPullRequest";
let OpenPullRequestAction = _OpenPullRequestAction;
registerAction2(OpenPullRequestAction);
function getSessionPullRequestUri(session) {
  return session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest?.uri;
}
const _CopyPullRequestUrlAction = class _CopyPullRequestUrlAction extends Action2 {
  constructor() {
    super({
      id: _CopyPullRequestUrlAction.ID,
      title: localize2("agentSessions.copyPullRequestUrl", "Copy Pull Request URL"),
      f1: false,
      menu: [{
        id: Menus.SessionItemContextMenu,
        group: "2_pullRequest",
        order: 1,
        when: SessionHasPullRequestContext
      }]
    });
  }
  async run(accessor, session) {
    const clipboardService = accessor.get(IClipboardService);
    const sessionsService = accessor.get(ISessionsService);
    const targetSession = (Array.isArray(session) ? session[0] : session) ?? sessionsService.activeSession.get();
    const pullRequestUri = getSessionPullRequestUri(targetSession);
    if (!pullRequestUri) {
      return;
    }
    await clipboardService.writeText(pullRequestUri.toString(true));
  }
};
_CopyPullRequestUrlAction.ID = "workbench.agentSessions.action.copyPullRequestUrl";
let CopyPullRequestUrlAction = _CopyPullRequestUrlAction;
registerAction2(CopyPullRequestUrlAction);
let OpenPullRequestActionViewItem = class extends SessionHeaderMetaActionViewItem {
  constructor(action, options, sessionContext, _gitHubService, _pullRequestIconCache, _openerService, _hoverService) {
    super(void 0, action, options);
    this._gitHubService = _gitHubService;
    this._pullRequestIconCache = _pullRequestIconCache;
    this._openerService = _openerService;
    this._hoverService = _hoverService;
    this._pullRequestRefsObs = derivedOpts({
      owner: this,
      equalsFn: (a, b) => arrayEquals(a, b, (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number && isEqual(x.uri, y.uri) && (x.icon === y.icon || !!x.icon && !!y.icon && ThemeIcon.isEqual(x.icon, y.icon)))
    }, (reader) => {
      const session = sessionContext.session.read(reader);
      const workspace = session?.workspace.read(reader);
      const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
      if (!gitHubInfo) {
        return [];
      }
      if (gitHubInfo.pullRequests?.length) {
        return gitHubInfo.pullRequests;
      }
      return gitHubInfo.pullRequest ? [{
        owner: gitHubInfo.owner,
        repo: gitHubInfo.repo,
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri,
        icon: gitHubInfo.pullRequest.icon
      }] : [];
    });
    this._pullRequestIdentitiesObs = derivedOpts({
      owner: this,
      equalsFn: (a, b) => arrayEquals(a, b, (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number)
    }, (reader) => this._pullRequestRefsObs.read(reader).map(({ owner, repo, number }) => ({ owner, repo, number })));
    this._pullRequestsObs = derived((reader) => this._pullRequestRefsObs.read(reader).map((ref) => {
      const reference = reader.store.add(this._gitHubService.createPullRequestModelReference(ref.owner, ref.repo, ref.number));
      const pullRequest = reference.object.pullRequest.read(reader);
      const status = pullRequest ? computePullRequestIconStatus(reader, this._gitHubService, ref.owner, ref.repo, pullRequest) : {};
      const icon = pullRequest ? computePullRequestIcon(pullRequest.isDraft ? "draft" : pullRequest.state, status) : this._pullRequestIconCache.get(ref.uri.toString()) ?? ref.icon ?? computePullRequestIcon(GitHubPullRequestState.Open);
      if (pullRequest) {
        this._pullRequestIconCache.set(ref.uri.toString(), icon);
      }
      return {
        ref,
        pullRequest,
        icon,
        status
      };
    }));
    this._register(autorun((reader) => {
      for (const identity of this._pullRequestIdentitiesObs.read(reader)) {
        const reference = reader.store.add(this._gitHubService.createPullRequestModelReference(identity.owner, identity.repo, identity.number));
        const model = reference.object;
        model.refresh();
        const shouldPoll = derived(this, (pollReader) => {
          const state = model.pullRequest.read(pollReader)?.state;
          return state === void 0 || state === GitHubPullRequestState.Open;
        });
        reader.store.add(autorun((pollReader) => {
          if (shouldPoll.read(pollReader)) {
            pollReader.store.add(model.startPolling());
          }
        }));
        reader.store.add(autorun((statusReader) => {
          const pullRequest = model.pullRequest.read(statusReader);
          if (!pullRequest || pullRequest.isDraft || pullRequest.state !== GitHubPullRequestState.Open) {
            return;
          }
          const ciReference = statusReader.store.add(this._gitHubService.createPullRequestCIModelReference(identity.owner, identity.repo, identity.number, pullRequest.headSha));
          ciReference.object.refresh();
          statusReader.store.add(ciReference.object.startPolling());
          const reviewThreadsReference = statusReader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(identity.owner, identity.repo, identity.number));
          reviewThreadsReference.object.refresh();
          statusReader.store.add(reviewThreadsReference.object.startPolling());
        }));
      }
    }));
    this._register(autorun((reader) => {
      const pullRequests = this._pullRequestsObs.read(reader);
      this._pullRequestList?.update(this._getPullRequestListEntries(pullRequests));
      this.updateLabel();
      this.updateTooltip();
    }));
  }
  onDidClickButton() {
    const pullRequests = this._pullRequestsObs.get();
    if (pullRequests.length > 1) {
      this._showPullRequestPicker(pullRequests);
      return;
    }
    super.onDidClickButton();
  }
  getIconElement() {
    const icon = this._pullRequestsObs.get()[0]?.icon ?? Codicon.gitPullRequest;
    const iconElement = $(`span.chat-composite-bar-meta-item-icon${ThemeIcon.asCSSSelector(icon)}`);
    if (icon.color) {
      iconElement.style.setProperty("color", asCssVariable(icon.color.id), "important");
    }
    return iconElement;
  }
  getLabelText() {
    const pullRequests = this._pullRequestsObs.get();
    if (pullRequests.length === 0) {
      return "";
    }
    return pullRequests.length === 1 ? `#${pullRequests[0].ref.number}` : localize("agentSessions.openPullRequest.count", "{0} Pull Requests", pullRequests.length);
  }
  getHoverContents() {
    const pullRequests = this._pullRequestsObs.get();
    if (pullRequests.length !== 1) {
      return this.getTooltip();
    }
    const { ref, pullRequest } = pullRequests[0];
    return {
      element: () => createPullRequestHoverElement({
        owner: ref.owner,
        repo: ref.repo,
        number: ref.number,
        repositoryHref: this._getRepositoryUri(ref).toString(true),
        pullRequest,
        onDidClickRepository: () => this._openerService.open(this._getRepositoryUri(ref), { openExternal: true })
      })
    };
  }
  getTooltip() {
    const pullRequests = this._pullRequestsObs.get();
    if (pullRequests.length > 1) {
      return localize("agentSessions.openPullRequest.tooltipMany", "Show the {0} Pull Requests Associated with This Session", pullRequests.length);
    }
    const number = pullRequests[0]?.ref.number;
    return number !== void 0 ? localize("agentSessions.openPullRequest.tooltipWithNumber", "Open Pull Request #{0}", number) : localize("agentSessions.openPullRequest.tooltip", "Open Pull Request");
  }
  _showPullRequestPicker(pullRequests) {
    const target = this.button?.element;
    if (!target) {
      return;
    }
    const list = new GitHubReferenceList(this._getPullRequestListEntries(pullRequests), (entry) => {
      this._hoverService.hideHover();
      this._openerService.open(entry.uri, { openExternal: true });
    });
    list.element.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this._hoverService.hideHover();
      }
    };
    this._pullRequestList = list;
    const hover = this._hoverService.showInstantHover({
      content: list.element,
      target,
      position: { hoverPosition: HoverPosition.BELOW },
      persistence: { sticky: true, hideOnKeyDown: false },
      appearance: { showPointer: false, skipFadeInAnimation: true },
      trapFocus: true,
      onDidHide: () => {
        if (this._pullRequestList === list) {
          this._pullRequestList = void 0;
        }
      }
    }, true);
    if (!hover) {
      this._pullRequestList = void 0;
    }
  }
  _getRepositoryUri(ref) {
    return URI.parse(`https://github.com/${ref.owner}/${ref.repo}`);
  }
  _getPullRequestListEntries(pullRequests) {
    return pullRequests.map(({ ref, pullRequest, icon, status }) => ({
      number: ref.number,
      title: pullRequest?.title,
      icon,
      uri: ref.uri,
      ariaLabel: getPullRequestAriaLabel(ref, pullRequest, status)
    }));
  }
};
OpenPullRequestActionViewItem = __decorateClass([
  __decorateParam(2, ISessionContext),
  __decorateParam(3, IGitHubService),
  __decorateParam(4, IPullRequestIconCache),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IHoverService)
], OpenPullRequestActionViewItem);
function getPullRequestAriaLabel(ref, pullRequest, status) {
  let kind;
  if (pullRequest?.isDraft) {
    kind = localize("agentSessions.pullRequestList.draft", "Draft Pull Request");
  } else {
    switch (pullRequest?.state) {
      case GitHubPullRequestState.Open:
        kind = localize("agentSessions.pullRequestList.open", "Open Pull Request");
        break;
      case GitHubPullRequestState.Merged:
        kind = localize("agentSessions.pullRequestList.merged", "Merged Pull Request");
        break;
      case GitHubPullRequestState.Closed:
        kind = localize("agentSessions.pullRequestList.closed", "Closed Pull Request");
        break;
      default:
        kind = localize("agentSessions.pullRequestList.pullRequest", "Pull Request");
    }
  }
  const baseLabel = pullRequest?.title ? localize("agentSessions.pullRequestList.labelWithTitle", "{0} #{1}: {2}", kind, ref.number, pullRequest.title) : localize("agentSessions.pullRequestList.label", "{0} #{1}", kind, ref.number);
  let attention;
  if (status.hasFailingChecks && status.hasUnresolvedComments) {
    attention = localize("agentSessions.pullRequestList.failingChecksAndUnresolvedComments", "failing checks and unresolved comments");
  } else if (status.hasFailingChecks) {
    attention = localize("agentSessions.pullRequestList.failingChecks", "failing checks");
  } else if (status.hasUnresolvedComments) {
    attention = localize("agentSessions.pullRequestList.unresolvedComments", "unresolved comments");
  }
  return attention ? localize("agentSessions.pullRequestList.labelWithAttention", "{0}, {1}", baseLabel, attention) : baseLabel;
}
let OpenPullRequestActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionHeaderMeta, OpenPullRequestAction.ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(OpenPullRequestActionViewItem, action, options);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
OpenPullRequestActionViewItemContribution.ID = "workbench.contrib.openPullRequestActionViewItem";
OpenPullRequestActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], OpenPullRequestActionViewItemContribution);
registerWorkbenchContribution2(OpenPullRequestActionViewItemContribution.ID, OpenPullRequestActionViewItemContribution, WorkbenchPhase.AfterRestored);
export {
  OpenPullRequestActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFxicm93c2VyXFxwdWxsUmVxdWVzdEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFycmF5RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJdGVtQWN0aW9uLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3Nlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IFNlc3Npb25IYXNQdWxsUmVxdWVzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElHaXRIdWJQdWxsUmVxdWVzdFJlZiwgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLCBJR2l0SHViUHVsbFJlcXVlc3QsIElQdWxsUmVxdWVzdEljb25TdGF0dXMgfSBmcm9tICcuLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVmZXJlbmNlTGlzdCwgSUdpdEh1YlJlZmVyZW5jZUxpc3RFbnRyeSB9IGZyb20gJy4vZ2l0aHViUmVmZXJlbmNlTGlzdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQdWxsUmVxdWVzdEhvdmVyRWxlbWVudCB9IGZyb20gJy4vcHVsbFJlcXVlc3RIb3Zlci5qcyc7XG5pbXBvcnQgeyBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgfSBmcm9tICcuL3B1bGxSZXF1ZXN0SWNvbkNhY2hlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVQdWxsUmVxdWVzdEljb25TdGF0dXMgfSBmcm9tICcuL3B1bGxSZXF1ZXN0SWNvblN0YXR1cy5qcyc7XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRTZXNzaW9uUHVsbFJlcXVlc3Qge1xuXHRyZWFkb25seSByZWY6IElHaXRIdWJQdWxsUmVxdWVzdFJlZjtcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3Q6IElHaXRIdWJQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBzdGF0dXM6IElQdWxsUmVxdWVzdEljb25TdGF0dXM7XG59XG5cbmludGVyZmFjZSBJUHVsbFJlcXVlc3RJZGVudGl0eSB7XG5cdHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG86IHN0cmluZztcblx0cmVhZG9ubHkgbnVtYmVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJUHVsbFJlcXVlc3RMaXN0RW50cnkgZXh0ZW5kcyBJR2l0SHViUmVmZXJlbmNlTGlzdEVudHJ5IHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG59XG5cbi8vIC0tLSBPcGVuIFB1bGwgUmVxdWVzdCBhY3Rpb25cblxuY2xhc3MgT3BlblB1bGxSZXF1ZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWdlbnRTZXNzaW9ucy5hY3Rpb24ub3BlblB1bGxSZXF1ZXN0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlblB1bGxSZXF1ZXN0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5vcGVuUHVsbFJlcXVlc3QnLCBcIk9wZW4gUHVsbCBSZXF1ZXN0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRQdWxsUmVxdWVzdCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdC8vIFB1bGwgcmVxdWVzdCBwaWxsIHNob3duIGluIHRoZSBzZXNzaW9uIGhlYWRlciBtZXRhIHJvd1xuXHRcdFx0Ly8gKHZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvc2Vzc2lvbkhlYWRlci50cykuIFJlbmRlcmVkIHdpdGggYVxuXHRcdFx0Ly8gY3VzdG9tIGFjdGlvbiB2aWV3IGl0ZW0gdGhhdCBzdW1tYXJpemVzIHRoZSBzZXNzaW9uJ3MgUFJzLlxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25IZWFkZXJNZXRhLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogU2Vzc2lvbkhhc1B1bGxSZXF1ZXN0Q29udGV4dFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkl0ZW1Db250ZXh0TWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX3B1bGxSZXF1ZXN0Jyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IFNlc3Npb25IYXNQdWxsUmVxdWVzdENvbnRleHRcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uPzogSUFjdGl2ZVNlc3Npb24gfCBJU2Vzc2lvbiB8IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cblx0XHRjb25zdCB0YXJnZXRTZXNzaW9uID0gKEFycmF5LmlzQXJyYXkoc2Vzc2lvbikgPyBzZXNzaW9uWzBdIDogc2Vzc2lvbikgPz8gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RVcmkgPSBnZXRTZXNzaW9uUHVsbFJlcXVlc3RVcmkodGFyZ2V0U2Vzc2lvbik7XG5cdFx0aWYgKCFwdWxsUmVxdWVzdFVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihwdWxsUmVxdWVzdFVyaSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihPcGVuUHVsbFJlcXVlc3RBY3Rpb24pO1xuXG4vLyAtLS0gQ29weSBQdWxsIFJlcXVlc3QgVVJMIGFjdGlvblxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uUHVsbFJlcXVlc3RVcmkoc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gc2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpPy5wdWxsUmVxdWVzdD8udXJpO1xufVxuXG5jbGFzcyBDb3B5UHVsbFJlcXVlc3RVcmxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmFjdGlvbi5jb3B5UHVsbFJlcXVlc3RVcmwnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb3B5UHVsbFJlcXVlc3RVcmxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudFNlc3Npb25zLmNvcHlQdWxsUmVxdWVzdFVybCcsIFwiQ29weSBQdWxsIFJlcXVlc3QgVVJMXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25JdGVtQ29udGV4dE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9wdWxsUmVxdWVzdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0XG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbj86IElBY3RpdmVTZXNzaW9uIHwgSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0U2Vzc2lvbiA9IChBcnJheS5pc0FycmF5KHNlc3Npb24pID8gc2Vzc2lvblswXSA6IHNlc3Npb24pID8/IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0VXJpID0gZ2V0U2Vzc2lvblB1bGxSZXF1ZXN0VXJpKHRhcmdldFNlc3Npb24pO1xuXHRcdGlmICghcHVsbFJlcXVlc3RVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChwdWxsUmVxdWVzdFVyaS50b1N0cmluZyh0cnVlKSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihDb3B5UHVsbFJlcXVlc3RVcmxBY3Rpb24pO1xuXG4vLyAtLS0gT3BlbiBQdWxsIFJlcXVlc3QgYWN0aW9uIHZpZXcgaXRlbSAoc2Vzc2lvbiBoZWFkZXIgcHVsbCByZXF1ZXN0IHBpbGwpXG5cbi8qKlxuICogUmVuZGVycyB0aGUgc2Vzc2lvbidzIHB1bGwgcmVxdWVzdHMgYXMgYSBzaW5nbGUgaGVhZGVyIHBpbGwgYW5kIG9wZW5zIGEgcGlja2VyIGZvciBoaXN0b3J5LlxuICovXG5leHBvcnQgY2xhc3MgT3BlblB1bGxSZXF1ZXN0QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBTZXNzaW9uSGVhZGVyTWV0YUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdFJlZnNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElHaXRIdWJQdWxsUmVxdWVzdFJlZltdPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3RJZGVudGl0aWVzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUHVsbFJlcXVlc3RJZGVudGl0eVtdPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3RzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUmVzb2x2ZWRTZXNzaW9uUHVsbFJlcXVlc3RbXT47XG5cdHByaXZhdGUgX3B1bGxSZXF1ZXN0TGlzdDogR2l0SHViUmVmZXJlbmNlTGlzdDxJUHVsbFJlcXVlc3RMaXN0RW50cnk+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASVNlc3Npb25Db250ZXh0IHNlc3Npb25Db250ZXh0OiBJU2Vzc2lvbkNvbnRleHQsXG5cdFx0QElHaXRIdWJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgcHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3RJY29uQ2FjaGU6IElQdWxsUmVxdWVzdEljb25DYWNoZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLl9wdWxsUmVxdWVzdFJlZnNPYnMgPSBkZXJpdmVkT3B0czxyZWFkb25seSBJR2l0SHViUHVsbFJlcXVlc3RSZWZbXT4oe1xuXHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRlcXVhbHNGbjogKGEsIGIpID0+IGFycmF5RXF1YWxzKGEsIGIsICh4LCB5KSA9PlxuXHRcdFx0XHR4Lm93bmVyID09PSB5Lm93bmVyICYmXG5cdFx0XHRcdHgucmVwbyA9PT0geS5yZXBvICYmXG5cdFx0XHRcdHgubnVtYmVyID09PSB5Lm51bWJlciAmJlxuXHRcdFx0XHRpc0VxdWFsKHgudXJpLCB5LnVyaSkgJiZcblx0XHRcdFx0KHguaWNvbiA9PT0geS5pY29uIHx8ICghIXguaWNvbiAmJiAhIXkuaWNvbiAmJiBUaGVtZUljb24uaXNFcXVhbCh4Lmljb24sIHkuaWNvbikpKSlcblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25Db250ZXh0LnNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGdpdEh1YkluZm8gPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFnaXRIdWJJbmZvKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGlmIChnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0cztcblx0XHRcdH1cblx0XHRcdHJldHVybiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0ID8gW3tcblx0XHRcdFx0b3duZXI6IGdpdEh1YkluZm8ub3duZXIsXG5cdFx0XHRcdHJlcG86IGdpdEh1YkluZm8ucmVwbyxcblx0XHRcdFx0bnVtYmVyOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lm51bWJlcixcblx0XHRcdFx0dXJpOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0LnVyaSxcblx0XHRcdFx0aWNvbjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5pY29uLFxuXHRcdFx0fV0gOiBbXTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3B1bGxSZXF1ZXN0SWRlbnRpdGllc09icyA9IGRlcml2ZWRPcHRzPHJlYWRvbmx5IElQdWxsUmVxdWVzdElkZW50aXR5W10+KHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46IChhLCBiKSA9PiBhcnJheUVxdWFscyhhLCBiLCAoeCwgeSkgPT4geC5vd25lciA9PT0geS5vd25lciAmJiB4LnJlcG8gPT09IHkucmVwbyAmJiB4Lm51bWJlciA9PT0geS5udW1iZXIpXG5cdFx0fSwgcmVhZGVyID0+IHRoaXMuX3B1bGxSZXF1ZXN0UmVmc09icy5yZWFkKHJlYWRlcikubWFwKCh7IG93bmVyLCByZXBvLCBudW1iZXIgfSkgPT4gKHsgb3duZXIsIHJlcG8sIG51bWJlciB9KSkpO1xuXG5cdFx0dGhpcy5fcHVsbFJlcXVlc3RzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fcHVsbFJlcXVlc3RSZWZzT2JzLnJlYWQocmVhZGVyKS5tYXAocmVmID0+IHtcblx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHJlYWRlci5zdG9yZS5hZGQodGhpcy5fZ2l0SHViU2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlKHJlZi5vd25lciwgcmVmLnJlcG8sIHJlZi5udW1iZXIpKTtcblx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0ID0gcmVmZXJlbmNlLm9iamVjdC5wdWxsUmVxdWVzdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBwdWxsUmVxdWVzdCA/IGNvbXB1dGVQdWxsUmVxdWVzdEljb25TdGF0dXMocmVhZGVyLCB0aGlzLl9naXRIdWJTZXJ2aWNlLCByZWYub3duZXIsIHJlZi5yZXBvLCBwdWxsUmVxdWVzdCkgOiB7fTtcblx0XHRcdGNvbnN0IGljb24gPSBwdWxsUmVxdWVzdFxuXHRcdFx0XHQ/IGNvbXB1dGVQdWxsUmVxdWVzdEljb24ocHVsbFJlcXVlc3QuaXNEcmFmdCA/ICdkcmFmdCcgOiBwdWxsUmVxdWVzdC5zdGF0ZSwgc3RhdHVzKVxuXHRcdFx0XHQ6IHRoaXMuX3B1bGxSZXF1ZXN0SWNvbkNhY2hlLmdldChyZWYudXJpLnRvU3RyaW5nKCkpID8/IHJlZi5pY29uID8/IGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKTtcblx0XHRcdGlmIChwdWxsUmVxdWVzdCkge1xuXHRcdFx0XHR0aGlzLl9wdWxsUmVxdWVzdEljb25DYWNoZS5zZXQocmVmLnVyaS50b1N0cmluZygpLCBpY29uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlZixcblx0XHRcdFx0cHVsbFJlcXVlc3QsXG5cdFx0XHRcdGljb24sXG5cdFx0XHRcdHN0YXR1cyxcblx0XHRcdH07XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpZGVudGl0eSBvZiB0aGlzLl9wdWxsUmVxdWVzdElkZW50aXRpZXNPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHJlYWRlci5zdG9yZS5hZGQodGhpcy5fZ2l0SHViU2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlKGlkZW50aXR5Lm93bmVyLCBpZGVudGl0eS5yZXBvLCBpZGVudGl0eS5udW1iZXIpKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSByZWZlcmVuY2Uub2JqZWN0O1xuXHRcdFx0XHRtb2RlbC5yZWZyZXNoKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2hvdWxkUG9sbCA9IGRlcml2ZWQodGhpcywgcG9sbFJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBtb2RlbC5wdWxsUmVxdWVzdC5yZWFkKHBvbGxSZWFkZXIpPy5zdGF0ZTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGUgPT09IHVuZGVmaW5lZCB8fCBzdGF0ZSA9PT0gR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHBvbGxSZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGlmIChzaG91bGRQb2xsLnJlYWQocG9sbFJlYWRlcikpIHtcblx0XHRcdFx0XHRcdHBvbGxSZWFkZXIuc3RvcmUuYWRkKG1vZGVsLnN0YXJ0UG9sbGluZygpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4oc3RhdHVzUmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBwdWxsUmVxdWVzdCA9IG1vZGVsLnB1bGxSZXF1ZXN0LnJlYWQoc3RhdHVzUmVhZGVyKTtcblx0XHRcdFx0XHRpZiAoIXB1bGxSZXF1ZXN0IHx8IHB1bGxSZXF1ZXN0LmlzRHJhZnQgfHwgcHVsbFJlcXVlc3Quc3RhdGUgIT09IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3Blbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNpUmVmZXJlbmNlID0gc3RhdHVzUmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9naXRIdWJTZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZShpZGVudGl0eS5vd25lciwgaWRlbnRpdHkucmVwbywgaWRlbnRpdHkubnVtYmVyLCBwdWxsUmVxdWVzdC5oZWFkU2hhKSk7XG5cdFx0XHRcdFx0Y2lSZWZlcmVuY2Uub2JqZWN0LnJlZnJlc2goKTtcblx0XHRcdFx0XHRzdGF0dXNSZWFkZXIuc3RvcmUuYWRkKGNpUmVmZXJlbmNlLm9iamVjdC5zdGFydFBvbGxpbmcoKSk7XG5cblx0XHRcdFx0XHRjb25zdCByZXZpZXdUaHJlYWRzUmVmZXJlbmNlID0gc3RhdHVzUmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9naXRIdWJTZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsUmVmZXJlbmNlKGlkZW50aXR5Lm93bmVyLCBpZGVudGl0eS5yZXBvLCBpZGVudGl0eS5udW1iZXIpKTtcblx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzUmVmZXJlbmNlLm9iamVjdC5yZWZyZXNoKCk7XG5cdFx0XHRcdFx0c3RhdHVzUmVhZGVyLnN0b3JlLmFkZChyZXZpZXdUaHJlYWRzUmVmZXJlbmNlLm9iamVjdC5zdGFydFBvbGxpbmcoKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdHMgPSB0aGlzLl9wdWxsUmVxdWVzdHNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcHVsbFJlcXVlc3RMaXN0Py51cGRhdGUodGhpcy5fZ2V0UHVsbFJlcXVlc3RMaXN0RW50cmllcyhwdWxsUmVxdWVzdHMpKTtcblx0XHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZENsaWNrQnV0dG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0cyA9IHRoaXMuX3B1bGxSZXF1ZXN0c09icy5nZXQoKTtcblx0XHRpZiAocHVsbFJlcXVlc3RzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHRoaXMuX3Nob3dQdWxsUmVxdWVzdFBpY2tlcihwdWxsUmVxdWVzdHMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLm9uRGlkQ2xpY2tCdXR0b24oKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRJY29uRWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuX3B1bGxSZXF1ZXN0c09icy5nZXQoKVswXT8uaWNvbiA/PyBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0O1xuXHRcdGNvbnN0IGljb25FbGVtZW50ID0gJChgc3Bhbi5jaGF0LWNvbXBvc2l0ZS1iYXItbWV0YS1pdGVtLWljb24ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb24pfWApO1xuXHRcdGlmIChpY29uLmNvbG9yKSB7XG5cdFx0XHQvLyBJbmxpbmUgYCFpbXBvcnRhbnRgIHdpbnMgb3ZlciBgYnV0dG9uLmNzc2AncyBgLm1vbmFjby10ZXh0LWJ1dHRvbiAuY29kaWNvblxuXHRcdFx0Ly8geyBjb2xvcjogaW5oZXJpdCAhaW1wb3J0YW50IH1gLCBzbyB0aGUgZ2x5cGggcmVmbGVjdHMgdGhlIGxpdmUgUFIgc3RhdGUgY29sb3IuXG5cdFx0XHRpY29uRWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnY29sb3InLCBhc0Nzc1ZhcmlhYmxlKGljb24uY29sb3IuaWQpLCAnaW1wb3J0YW50Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBpY29uRWxlbWVudDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMYWJlbFRleHQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBwdWxsUmVxdWVzdHMgPSB0aGlzLl9wdWxsUmVxdWVzdHNPYnMuZ2V0KCk7XG5cdFx0aWYgKHB1bGxSZXF1ZXN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHB1bGxSZXF1ZXN0cy5sZW5ndGggPT09IDFcblx0XHRcdD8gYCMke3B1bGxSZXF1ZXN0c1swXS5yZWYubnVtYmVyfWBcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMub3BlblB1bGxSZXF1ZXN0LmNvdW50JywgXCJ7MH0gUHVsbCBSZXF1ZXN0c1wiLCBwdWxsUmVxdWVzdHMubGVuZ3RoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRIb3ZlckNvbnRlbnRzKCk6IElNYW5hZ2VkSG92ZXJDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwdWxsUmVxdWVzdHMgPSB0aGlzLl9wdWxsUmVxdWVzdHNPYnMuZ2V0KCk7XG5cdFx0aWYgKHB1bGxSZXF1ZXN0cy5sZW5ndGggIT09IDEpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFRvb2x0aXAoKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlZiwgcHVsbFJlcXVlc3QgfSA9IHB1bGxSZXF1ZXN0c1swXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogKCkgPT4gY3JlYXRlUHVsbFJlcXVlc3RIb3ZlckVsZW1lbnQoe1xuXHRcdFx0XHRvd25lcjogcmVmLm93bmVyLFxuXHRcdFx0XHRyZXBvOiByZWYucmVwbyxcblx0XHRcdFx0bnVtYmVyOiByZWYubnVtYmVyLFxuXHRcdFx0XHRyZXBvc2l0b3J5SHJlZjogdGhpcy5fZ2V0UmVwb3NpdG9yeVVyaShyZWYpLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRwdWxsUmVxdWVzdCxcblx0XHRcdFx0b25EaWRDbGlja1JlcG9zaXRvcnk6ICgpID0+IHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih0aGlzLl9nZXRSZXBvc2l0b3J5VXJpKHJlZiksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RzID0gdGhpcy5fcHVsbFJlcXVlc3RzT2JzLmdldCgpO1xuXHRcdGlmIChwdWxsUmVxdWVzdHMubGVuZ3RoID4gMSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLm9wZW5QdWxsUmVxdWVzdC50b29sdGlwTWFueScsIFwiU2hvdyB0aGUgezB9IFB1bGwgUmVxdWVzdHMgQXNzb2NpYXRlZCB3aXRoIFRoaXMgU2Vzc2lvblwiLCBwdWxsUmVxdWVzdHMubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3QgbnVtYmVyID0gcHVsbFJlcXVlc3RzWzBdPy5yZWYubnVtYmVyO1xuXHRcdHJldHVybiBudW1iZXIgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5vcGVuUHVsbFJlcXVlc3QudG9vbHRpcFdpdGhOdW1iZXInLCBcIk9wZW4gUHVsbCBSZXF1ZXN0ICN7MH1cIiwgbnVtYmVyKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5vcGVuUHVsbFJlcXVlc3QudG9vbHRpcCcsIFwiT3BlbiBQdWxsIFJlcXVlc3RcIik7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93UHVsbFJlcXVlc3RQaWNrZXIocHVsbFJlcXVlc3RzOiByZWFkb25seSBJUmVzb2x2ZWRTZXNzaW9uUHVsbFJlcXVlc3RbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuYnV0dG9uPy5lbGVtZW50O1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdCA9IG5ldyBHaXRIdWJSZWZlcmVuY2VMaXN0KHRoaXMuX2dldFB1bGxSZXF1ZXN0TGlzdEVudHJpZXMocHVsbFJlcXVlc3RzKSwgZW50cnkgPT4ge1xuXHRcdFx0dGhpcy5faG92ZXJTZXJ2aWNlLmhpZGVIb3ZlcigpO1xuXHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGVudHJ5LnVyaSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0fSk7XG5cdFx0bGlzdC5lbGVtZW50Lm9ua2V5ZG93biA9IGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdExpc3QgPSBsaXN0O1xuXG5cdFx0Y29uc3QgaG92ZXIgPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRjb250ZW50OiBsaXN0LmVsZW1lbnQsXG5cdFx0XHR0YXJnZXQsXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUsIGhpZGVPbktleURvd246IGZhbHNlIH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiBmYWxzZSwgc2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZSB9LFxuXHRcdFx0dHJhcEZvY3VzOiB0cnVlLFxuXHRcdFx0b25EaWRIaWRlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9wdWxsUmVxdWVzdExpc3QgPT09IGxpc3QpIHtcblx0XHRcdFx0XHR0aGlzLl9wdWxsUmVxdWVzdExpc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSwgdHJ1ZSk7XG5cdFx0aWYgKCFob3Zlcikge1xuXHRcdFx0dGhpcy5fcHVsbFJlcXVlc3RMaXN0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJlcG9zaXRvcnlVcmkocmVmOiB7IHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7IHJlYWRvbmx5IHJlcG86IHN0cmluZyB9KTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGBodHRwczovL2dpdGh1Yi5jb20vJHtyZWYub3duZXJ9LyR7cmVmLnJlcG99YCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQdWxsUmVxdWVzdExpc3RFbnRyaWVzKHB1bGxSZXF1ZXN0czogcmVhZG9ubHkgSVJlc29sdmVkU2Vzc2lvblB1bGxSZXF1ZXN0W10pOiByZWFkb25seSBJUHVsbFJlcXVlc3RMaXN0RW50cnlbXSB7XG5cdFx0cmV0dXJuIHB1bGxSZXF1ZXN0cy5tYXAoKHsgcmVmLCBwdWxsUmVxdWVzdCwgaWNvbiwgc3RhdHVzIH0pID0+ICh7XG5cdFx0XHRudW1iZXI6IHJlZi5udW1iZXIsXG5cdFx0XHR0aXRsZTogcHVsbFJlcXVlc3Q/LnRpdGxlLFxuXHRcdFx0aWNvbixcblx0XHRcdHVyaTogcmVmLnVyaSxcblx0XHRcdGFyaWFMYWJlbDogZ2V0UHVsbFJlcXVlc3RBcmlhTGFiZWwocmVmLCBwdWxsUmVxdWVzdCwgc3RhdHVzKSxcblx0XHR9KSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0UHVsbFJlcXVlc3RBcmlhTGFiZWwocmVmOiBJR2l0SHViUHVsbFJlcXVlc3RSZWYsIHB1bGxSZXF1ZXN0OiBJR2l0SHViUHVsbFJlcXVlc3QgfCB1bmRlZmluZWQsIHN0YXR1czogSVB1bGxSZXF1ZXN0SWNvblN0YXR1cyk6IHN0cmluZyB7XG5cdGxldCBraW5kOiBzdHJpbmc7XG5cdGlmIChwdWxsUmVxdWVzdD8uaXNEcmFmdCkge1xuXHRcdGtpbmQgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5wdWxsUmVxdWVzdExpc3QuZHJhZnQnLCBcIkRyYWZ0IFB1bGwgUmVxdWVzdFwiKTtcblx0fSBlbHNlIHtcblx0XHRzd2l0Y2ggKHB1bGxSZXF1ZXN0Py5zdGF0ZSkge1xuXHRcdFx0Y2FzZSBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW46XG5cdFx0XHRcdGtpbmQgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5wdWxsUmVxdWVzdExpc3Qub3BlbicsIFwiT3BlbiBQdWxsIFJlcXVlc3RcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZDpcblx0XHRcdFx0a2luZCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnB1bGxSZXF1ZXN0TGlzdC5tZXJnZWQnLCBcIk1lcmdlZCBQdWxsIFJlcXVlc3RcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLkNsb3NlZDpcblx0XHRcdFx0a2luZCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnB1bGxSZXF1ZXN0TGlzdC5jbG9zZWQnLCBcIkNsb3NlZCBQdWxsIFJlcXVlc3RcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0a2luZCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnB1bGxSZXF1ZXN0TGlzdC5wdWxsUmVxdWVzdCcsIFwiUHVsbCBSZXF1ZXN0XCIpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGJhc2VMYWJlbCA9IHB1bGxSZXF1ZXN0Py50aXRsZVxuXHRcdD8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMucHVsbFJlcXVlc3RMaXN0LmxhYmVsV2l0aFRpdGxlJywgXCJ7MH0gI3sxfTogezJ9XCIsIGtpbmQsIHJlZi5udW1iZXIsIHB1bGxSZXF1ZXN0LnRpdGxlKVxuXHRcdDogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMucHVsbFJlcXVlc3RMaXN0LmxhYmVsJywgXCJ7MH0gI3sxfVwiLCBraW5kLCByZWYubnVtYmVyKTtcblxuXHRsZXQgYXR0ZW50aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlmIChzdGF0dXMuaGFzRmFpbGluZ0NoZWNrcyAmJiBzdGF0dXMuaGFzVW5yZXNvbHZlZENvbW1lbnRzKSB7XG5cdFx0YXR0ZW50aW9uID0gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMucHVsbFJlcXVlc3RMaXN0LmZhaWxpbmdDaGVja3NBbmRVbnJlc29sdmVkQ29tbWVudHMnLCBcImZhaWxpbmcgY2hlY2tzIGFuZCB1bnJlc29sdmVkIGNvbW1lbnRzXCIpO1xuXHR9IGVsc2UgaWYgKHN0YXR1cy5oYXNGYWlsaW5nQ2hlY2tzKSB7XG5cdFx0YXR0ZW50aW9uID0gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMucHVsbFJlcXVlc3RMaXN0LmZhaWxpbmdDaGVja3MnLCBcImZhaWxpbmcgY2hlY2tzXCIpO1xuXHR9IGVsc2UgaWYgKHN0YXR1cy5oYXNVbnJlc29sdmVkQ29tbWVudHMpIHtcblx0XHRhdHRlbnRpb24gPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5wdWxsUmVxdWVzdExpc3QudW5yZXNvbHZlZENvbW1lbnRzJywgXCJ1bnJlc29sdmVkIGNvbW1lbnRzXCIpO1xuXHR9XG5cblx0cmV0dXJuIGF0dGVudGlvblxuXHRcdD8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMucHVsbFJlcXVlc3RMaXN0LmxhYmVsV2l0aEF0dGVudGlvbicsIFwiezB9LCB7MX1cIiwgYmFzZUxhYmVsLCBhdHRlbnRpb24pXG5cdFx0OiBiYXNlTGFiZWw7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIHRoZSB7QGxpbmsgT3BlblB1bGxSZXF1ZXN0QWN0aW9uVmlld0l0ZW19IGZvciB0aGUgb3Blbi1wdWxsLXJlcXVlc3QgYWN0aW9uIGluIHRoZVxuICogc2Vzc2lvbiBoZWFkZXIgbWV0YSB0b29sYmFyLiBSZWdpc3RlcmluZyBpdCBoZXJlIChyYXRoZXIgdGhhbiBpbiB0aGUgY29yZSBzZXNzaW9uIGhlYWRlcilcbiAqIGtlZXBzIHRoZSByZW5kZXJpbmcgb2YgdGhlIEdpdEh1Yi1vd25lZCBhY3Rpb24gY28tbG9jYXRlZCB3aXRoIHRoZSBhY3Rpb24gaXRzZWxmLlxuICovXG5jbGFzcyBPcGVuUHVsbFJlcXVlc3RBY3Rpb25WaWV3SXRlbUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIub3BlblB1bGxSZXF1ZXN0QWN0aW9uVmlld0l0ZW0nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRoZSBhY3Rpb24gdmlldyBpdGVtIHNlcnZpY2Ugb25seSBub3RpZmllcyB0b29sYmFycyBvZiBhIGZhY3RvcnkgdmlhXG5cdFx0Ly8gdGhlIGV2ZW50IHBhc3NlZCB0byByZWdpc3RlcigpLCBub3Qgb24gcmVnaXN0cmF0aW9uIGl0c2VsZi4gQSBzZXNzaW9uXG5cdFx0Ly8gaGVhZGVyIHJlc3RvcmVkIHdpdGggYW4gZXhpc3RpbmcgcHVsbCByZXF1ZXN0IG1heSBjcmVhdGUgaXRzIG1ldGFcblx0XHQvLyB0b29sYmFyIGJlZm9yZSB0aGlzIGNvbnRyaWJ1dGlvbiBydW5zLCBzbyBhbm5vdW5jZSB0aGUgZmFjdG9yeSBvbmNlXG5cdFx0Ly8gcmlnaHQgYWZ0ZXIgcmVnaXN0ZXJpbmcgdG8gbWFrZSB0aG9zZSB0b29sYmFycyByZS1yZW5kZXIgYW5kIHBpY2sgaXQgdXAuXG5cdFx0Y29uc3Qgb25EaWRSZWdpc3RlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TZXNzaW9uSGVhZGVyTWV0YSwgT3BlblB1bGxSZXF1ZXN0QWN0aW9uLklELCAoYWN0aW9uLCBvcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BlblB1bGxSZXF1ZXN0QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fSwgb25EaWRSZWdpc3Rlci5ldmVudCkpO1xuXHRcdG9uRGlkUmVnaXN0ZXIuZmlyZSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihPcGVuUHVsbFJlcXVlc3RBY3Rpb25WaWV3SXRlbUNvbnRyaWJ1dGlvbi5JRCwgT3BlblB1bGxSZXF1ZXN0QWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFNBQVM7QUFDbEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxTQUFTLG1CQUFnQztBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxnQkFBZ0IsdUJBQXVCO0FBQ3pELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyxhQUFhO0FB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
