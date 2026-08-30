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
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { markOnboardingTarget } from "../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { reportNewChatPickerClosed } from "../../../chat/browser/newChatPickerTelemetry.js";
import { BranchPicker as SharedBranchPicker } from "../../../chat/browser/branchPicker.js";
import { SessionIsolationPickerVisibleContext } from "../../../../common/contextkeys.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { CopilotChatSessionsProvider } from "./copilotChatSessionsProvider.js";
let BranchPicker = class extends Disposable {
  // Guards context key until DOM exists (#323361)
  constructor(_session, _configurationService, contextKeyService, sessionsProvidersService, telemetryService, instantiationService) {
    super();
    this._session = _session;
    this._configurationService = _configurationService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.telemetryService = telemetryService;
    this._hasGitRepo = false;
    this._rendered = false;
    this._visibleKey = SessionIsolationPickerVisibleContext.bindTo(contextKeyService);
    this._register(toDisposable(() => this._visibleKey.reset()));
    this._isolationOptionEnabled = this._configurationService.getValue("github.copilot.chat.cli.isolationOption.enabled") !== false;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("github.copilot.chat.cli.isolationOption.enabled")) {
        this._isolationOptionEnabled = this._configurationService.getValue("github.copilot.chat.cli.isolationOption.enabled") !== false;
        if (!this._isolationOptionEnabled) {
          this._setModeOnSession("worktree");
        }
        this._update();
      }
    }));
    this._picker = this._register(instantiationService.createInstance(SharedBranchPicker, {
      user: "branchPicker",
      onSelectBranch: (branch) => {
        const session = this._getSession();
        const selectedBranch = session?.branch.get();
        reportNewChatPickerClosed(this.telemetryService, {
          id: "NewChatBranchPicker",
          name: "NewChatBranchPicker",
          optionIdBefore: selectedBranch,
          optionIdAfter: branch,
          optionLabelBefore: selectedBranch,
          optionLabelAfter: branch,
          isPII: true
        });
        session?.setBranch(branch);
      },
      isolation: {
        label: localize("isolationMode.worktree", "New Worktree"),
        ariaLabel: localize("isolationPicker.checkboxAriaLabel", "Worktree isolation"),
        onToggle: (checked) => this._applyIsolationToggle(checked),
        markTarget: (element) => markOnboardingTarget(element, "sessions.newSession.isolation")
      }
    }));
    this._register(autorun((reader) => {
      const session = this._session.read(reader);
      const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : void 0;
      const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : void 0;
      if (providerSession) {
        const isLoading = session?.loading.read(reader);
        const gitRepo = providerSession.gitRepository;
        const repoState = gitRepo?.state?.read?.(reader);
        const hasHeadCommit = repoState ? !!repoState.HEAD?.commit : true;
        this._hasGitRepo = !isLoading && !!gitRepo && hasHeadCommit;
        providerSession.branches.read(reader);
        providerSession.branch.read(reader);
        providerSession.isolationMode.read(reader);
      } else {
        this._hasGitRepo = false;
      }
      this._update();
    }));
  }
  _getSession() {
    const session = this._session.get();
    if (!session) {
      return void 0;
    }
    const provider = this.sessionsProvidersService.getProvider(session.providerId);
    return provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : void 0;
  }
  _getIsolationMode() {
    return this._getSession()?.isolationMode.get() ?? "worktree";
  }
  _setModeOnSession(mode) {
    this._getSession()?.setIsolationMode(mode);
  }
  _applyIsolationToggle(checked) {
    const before = this._getIsolationMode();
    const after = checked ? "worktree" : "workspace";
    reportNewChatPickerClosed(this.telemetryService, {
      id: "NewChatIsolationPicker",
      name: "NewChatIsolationPicker",
      optionIdBefore: before,
      optionIdAfter: after,
      optionLabelBefore: void 0,
      optionLabelAfter: void 0,
      isPII: false
    });
    this._setModeOnSession(after);
  }
  render(container) {
    this._rendered = true;
    this._picker.render(container);
    this._update();
  }
  showPicker() {
    this._picker.showPicker();
  }
  _update() {
    const session = this._getSession();
    const branches = session?.branches.get() ?? [];
    const selectedBranch = session?.branch.get();
    const isLoading = session?.loading.get() ?? false;
    const isWorkspace = session?.isolationMode.get() === "workspace";
    const isolationState = !this._isolationOptionEnabled ? "hidden" : this._hasGitRepo ? "enabled" : "disabled";
    this._picker.update({
      label: selectedBranch ?? localize("branchPicker.select", "Branch"),
      branches: branches.map((branch) => ({ name: branch, selected: branch === selectedBranch })),
      status: isLoading ? "loading" : branches.length > 0 ? "ready" : "empty",
      canOpen: !isLoading && !isWorkspace && branches.length > 0,
      isolation: {
        checked: this._getIsolationMode() === "worktree",
        state: isolationState,
        disabledReason: !this._hasGitRepo ? localize("isolationPicker.noGitRepo", "Git repository required for worktree isolation") : void 0
      }
    });
    this._visibleKey.set(this._rendered && this._hasGitRepo && this._isolationOptionEnabled);
  }
};
BranchPicker = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ISessionsProvidersService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IInstantiationService)
], BranchPicker);
export {
  BranchPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxjb3BpbG90Q2hhdFNlc3Npb25zXFxicm93c2VyXFxicmFuY2hQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9icm93c2VyL3Nwb3RsaWdodC9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdFBpY2tlclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBCcmFuY2hQaWNrZXIgYXMgU2hhcmVkQnJhbmNoUGlja2VyIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2JyYW5jaFBpY2tlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSXNvbGF0aW9uUGlja2VyVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIsIElDb3BpbG90Q2hhdFNlc3Npb24gfSBmcm9tICcuL2NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbi8qKlxuICogQ29waWxvdC1zcGVjaWZpYyBhZGFwdGVyIHRoYXQgZHJpdmVzIHRoZSBzaGFyZWQgQnJhbmNoUGlja2VyIHdpdGhcbiAqIHNlc3Npb24gc3RhdGUsIGluY2x1ZGluZyB0aGUgb3B0aW9uYWwgaXNvbGF0aW9uIGNoZWNrYm94LlxuICovXG5leHBvcnQgY2xhc3MgQnJhbmNoUGlja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpY2tlcjogU2hhcmVkQnJhbmNoUGlja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaGFzR2l0UmVwbyA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc29sYXRpb25PcHRpb25FbmFibGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9yZW5kZXJlZCA9IGZhbHNlOyAvLyBHdWFyZHMgY29udGV4dCBrZXkgdW50aWwgRE9NIGV4aXN0cyAoIzMyMzM2MSlcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl92aXNpYmxlS2V5ID0gU2Vzc2lvbklzb2xhdGlvblBpY2tlclZpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Zpc2libGVLZXkucmVzZXQoKSkpO1xuXHRcdHRoaXMuX2lzb2xhdGlvbk9wdGlvbkVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZ2l0aHViLmNvcGlsb3QuY2hhdC5jbGkuaXNvbGF0aW9uT3B0aW9uLmVuYWJsZWQnKSAhPT0gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZ2l0aHViLmNvcGlsb3QuY2hhdC5jbGkuaXNvbGF0aW9uT3B0aW9uLmVuYWJsZWQnKSkge1xuXHRcdFx0XHR0aGlzLl9pc29sYXRpb25PcHRpb25FbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2xpLmlzb2xhdGlvbk9wdGlvbi5lbmFibGVkJykgIT09IGZhbHNlO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzb2xhdGlvbk9wdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRNb2RlT25TZXNzaW9uKCd3b3JrdHJlZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3BpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoYXJlZEJyYW5jaFBpY2tlciwge1xuXHRcdFx0dXNlcjogJ2JyYW5jaFBpY2tlcicsXG5cdFx0XHRvblNlbGVjdEJyYW5jaDogYnJhbmNoID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldFNlc3Npb24oKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRCcmFuY2ggPSBzZXNzaW9uPy5icmFuY2guZ2V0KCk7XG5cdFx0XHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0aWQ6ICdOZXdDaGF0QnJhbmNoUGlja2VyJyxcblx0XHRcdFx0XHRuYW1lOiAnTmV3Q2hhdEJyYW5jaFBpY2tlcicsXG5cdFx0XHRcdFx0b3B0aW9uSWRCZWZvcmU6IHNlbGVjdGVkQnJhbmNoLFxuXHRcdFx0XHRcdG9wdGlvbklkQWZ0ZXI6IGJyYW5jaCxcblx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogc2VsZWN0ZWRCcmFuY2gsXG5cdFx0XHRcdFx0b3B0aW9uTGFiZWxBZnRlcjogYnJhbmNoLFxuXHRcdFx0XHRcdGlzUElJOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2Vzc2lvbj8uc2V0QnJhbmNoKGJyYW5jaCk7XG5cdFx0XHR9LFxuXHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaXNvbGF0aW9uTW9kZS53b3JrdHJlZScsIFwiTmV3IFdvcmt0cmVlXCIpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdpc29sYXRpb25QaWNrZXIuY2hlY2tib3hBcmlhTGFiZWwnLCBcIldvcmt0cmVlIGlzb2xhdGlvblwiKSxcblx0XHRcdFx0b25Ub2dnbGU6IGNoZWNrZWQgPT4gdGhpcy5fYXBwbHlJc29sYXRpb25Ub2dnbGUoY2hlY2tlZCksXG5cdFx0XHRcdG1hcmtUYXJnZXQ6IGVsZW1lbnQgPT4gbWFya09uYm9hcmRpbmdUYXJnZXQoZWxlbWVudCwgJ3Nlc3Npb25zLm5ld1Nlc3Npb24uaXNvbGF0aW9uJyksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gc2Vzc2lvbiA/IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm92aWRlclNlc3Npb24gPSBwcm92aWRlciBpbnN0YW5jZW9mIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlciA/IHByb3ZpZGVyLmdldFNlc3Npb24oc2Vzc2lvbiEuc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwcm92aWRlclNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgaXNMb2FkaW5nID0gc2Vzc2lvbj8ubG9hZGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGdpdFJlcG8gPSBwcm92aWRlclNlc3Npb24uZ2l0UmVwb3NpdG9yeTtcblx0XHRcdFx0Y29uc3QgcmVwb1N0YXRlID0gZ2l0UmVwbz8uc3RhdGU/LnJlYWQ/LihyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBoYXNIZWFkQ29tbWl0ID0gcmVwb1N0YXRlID8gISFyZXBvU3RhdGUuSEVBRD8uY29tbWl0IDogdHJ1ZTtcblx0XHRcdFx0dGhpcy5faGFzR2l0UmVwbyA9ICFpc0xvYWRpbmcgJiYgISFnaXRSZXBvICYmIGhhc0hlYWRDb21taXQ7XG5cdFx0XHRcdHByb3ZpZGVyU2Vzc2lvbi5icmFuY2hlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHByb3ZpZGVyU2Vzc2lvbi5icmFuY2gucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRwcm92aWRlclNlc3Npb24uaXNvbGF0aW9uTW9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9oYXNHaXRSZXBvID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZXNzaW9uKCk6IElDb3BpbG90Q2hhdFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBwcm92aWRlciBpbnN0YW5jZW9mIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlciA/IHByb3ZpZGVyLmdldFNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SXNvbGF0aW9uTW9kZSgpOiAnd29ya3RyZWUnIHwgJ3dvcmtzcGFjZScge1xuXHRcdHJldHVybiB0aGlzLl9nZXRTZXNzaW9uKCk/Lmlzb2xhdGlvbk1vZGUuZ2V0KCkgPz8gJ3dvcmt0cmVlJztcblx0fVxuXG5cdHByaXZhdGUgX3NldE1vZGVPblNlc3Npb24obW9kZTogJ3dvcmt0cmVlJyB8ICd3b3Jrc3BhY2UnKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2V0U2Vzc2lvbigpPy5zZXRJc29sYXRpb25Nb2RlKG1vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlJc29sYXRpb25Ub2dnbGUoY2hlY2tlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGJlZm9yZSA9IHRoaXMuX2dldElzb2xhdGlvbk1vZGUoKTtcblx0XHRjb25zdCBhZnRlcjogJ3dvcmt0cmVlJyB8ICd3b3Jrc3BhY2UnID0gY2hlY2tlZCA/ICd3b3JrdHJlZScgOiAnd29ya3NwYWNlJztcblx0XHRyZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0aWQ6ICdOZXdDaGF0SXNvbGF0aW9uUGlja2VyJyxcblx0XHRcdG5hbWU6ICdOZXdDaGF0SXNvbGF0aW9uUGlja2VyJyxcblx0XHRcdG9wdGlvbklkQmVmb3JlOiBiZWZvcmUsXG5cdFx0XHRvcHRpb25JZEFmdGVyOiBhZnRlcixcblx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25MYWJlbEFmdGVyOiB1bmRlZmluZWQsXG5cdFx0XHRpc1BJSTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2V0TW9kZU9uU2Vzc2lvbihhZnRlcik7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkID0gdHJ1ZTtcblx0XHR0aGlzLl9waWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRzaG93UGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpY2tlci5zaG93UGlja2VyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldFNlc3Npb24oKTtcblx0XHRjb25zdCBicmFuY2hlcyA9IHNlc3Npb24/LmJyYW5jaGVzLmdldCgpID8/IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGVkQnJhbmNoID0gc2Vzc2lvbj8uYnJhbmNoLmdldCgpO1xuXHRcdGNvbnN0IGlzTG9hZGluZyA9IHNlc3Npb24/LmxvYWRpbmcuZ2V0KCkgPz8gZmFsc2U7XG5cdFx0Y29uc3QgaXNXb3Jrc3BhY2UgPSBzZXNzaW9uPy5pc29sYXRpb25Nb2RlLmdldCgpID09PSAnd29ya3NwYWNlJztcblxuXHRcdGNvbnN0IGlzb2xhdGlvblN0YXRlOiAnZW5hYmxlZCcgfCAnZGlzYWJsZWQnIHwgJ2hpZGRlbicgPVxuXHRcdFx0IXRoaXMuX2lzb2xhdGlvbk9wdGlvbkVuYWJsZWQgPyAnaGlkZGVuJyA6XG5cdFx0XHRcdHRoaXMuX2hhc0dpdFJlcG8gPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnO1xuXG5cdFx0dGhpcy5fcGlja2VyLnVwZGF0ZSh7XG5cdFx0XHRsYWJlbDogc2VsZWN0ZWRCcmFuY2ggPz8gbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5zZWxlY3QnLCBcIkJyYW5jaFwiKSxcblx0XHRcdGJyYW5jaGVzOiBicmFuY2hlcy5tYXAoYnJhbmNoID0+ICh7IG5hbWU6IGJyYW5jaCwgc2VsZWN0ZWQ6IGJyYW5jaCA9PT0gc2VsZWN0ZWRCcmFuY2ggfSkpLFxuXHRcdFx0c3RhdHVzOiBpc0xvYWRpbmcgPyAnbG9hZGluZycgOiBicmFuY2hlcy5sZW5ndGggPiAwID8gJ3JlYWR5JyA6ICdlbXB0eScsXG5cdFx0XHRjYW5PcGVuOiAhaXNMb2FkaW5nICYmICFpc1dvcmtzcGFjZSAmJiBicmFuY2hlcy5sZW5ndGggPiAwLFxuXHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuX2dldElzb2xhdGlvbk1vZGUoKSA9PT0gJ3dvcmt0cmVlJyxcblx0XHRcdFx0c3RhdGU6IGlzb2xhdGlvblN0YXRlLFxuXHRcdFx0XHRkaXNhYmxlZFJlYXNvbjogIXRoaXMuX2hhc0dpdFJlcG8gPyBsb2NhbGl6ZSgnaXNvbGF0aW9uUGlja2VyLm5vR2l0UmVwbycsIFwiR2l0IHJlcG9zaXRvcnkgcmVxdWlyZWQgZm9yIHdvcmt0cmVlIGlzb2xhdGlvblwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5fdmlzaWJsZUtleS5zZXQodGhpcy5fcmVuZGVyZWQgJiYgdGhpcy5faGFzR2l0UmVwbyAmJiB0aGlzLl9pc29sYXRpb25PcHRpb25FbmFibGVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBp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
