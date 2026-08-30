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
import { Lazy } from "../../../../../base/common/lazy.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../../../platform/secrets/common/secrets.js";
import { getCurrentAuthenticationSessionInfo } from "../../../../services/authentication/browser/authenticationService.js";
import { IAuthenticationService } from "../../../../services/authentication/common/authentication.js";
class ManageAccountsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.manageAccounts",
      title: localize2("manageAccounts", "Manage Accounts"),
      category: localize2("accounts", "Accounts"),
      f1: true
    });
  }
  run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    return instantiationService.createInstance(ManageAccountsActionImpl).run();
  }
}
let ManageAccountsActionImpl = class {
  constructor(quickInputService, authenticationService, commandService, secretStorageService, productService) {
    this.quickInputService = quickInputService;
    this.authenticationService = authenticationService;
    this.commandService = commandService;
    this.secretStorageService = secretStorageService;
    this.productService = productService;
  }
  async run() {
    const placeHolder = localize("pickAccount", "Select an account to manage");
    const accounts = await this.listAccounts();
    if (!accounts.length) {
      await this.quickInputService.pick([{ label: localize("noActiveAccounts", "There are no active accounts.") }], { placeHolder });
      return;
    }
    const account = await this.quickInputService.pick(accounts, { placeHolder, matchOnDescription: true });
    if (!account) {
      return;
    }
    await this.showAccountActions(account);
  }
  async listAccounts() {
    const activeSession = new Lazy(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));
    const accounts = [];
    for (const providerId of this.authenticationService.getProviderIds()) {
      const provider = this.authenticationService.getProvider(providerId);
      for (const { label, id } of await this.authenticationService.getAccounts(providerId)) {
        accounts.push({
          label,
          description: provider.label,
          providerId,
          canUseMcp: !!provider.authorizationServers?.length,
          canSignOut: async () => this.canSignOut(provider, id, await activeSession.value)
        });
      }
    }
    return accounts;
  }
  async canSignOut(provider, accountId, session) {
    if (session && !session.canSignOut && session.providerId === provider.id) {
      const sessions = await this.authenticationService.getSessions(provider.id);
      return !sessions.some((o) => o.id === session.id && o.account.id === accountId);
    }
    return true;
  }
  async showAccountActions(account) {
    const { providerId, label: accountLabel, canUseMcp, canSignOut } = account;
    const store = new DisposableStore();
    const quickPick = store.add(this.quickInputService.createQuickPick());
    quickPick.title = localize("manageAccount", "Manage '{0}'", accountLabel);
    quickPick.placeholder = localize("selectAction", "Select an action");
    quickPick.buttons = [this.quickInputService.backButton];
    const items = [{
      label: localize("manageTrustedExtensions", "Manage Trusted Extensions"),
      action: () => this.commandService.executeCommand("_manageTrustedExtensionsForAccount", { providerId, accountLabel })
    }];
    if (canUseMcp) {
      items.push({
        label: localize("manageTrustedMCPServers", "Manage Trusted MCP Servers"),
        action: () => this.commandService.executeCommand("_manageTrustedMCPServersForAccount", { providerId, accountLabel })
      });
    }
    if (await canSignOut()) {
      items.push({
        label: localize("signOut", "Sign Out"),
        action: () => this.commandService.executeCommand("_signOutOfAccount", { providerId, accountLabel })
      });
    }
    quickPick.items = items;
    store.add(quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        quickPick.hide();
        selected.action();
      }
    }));
    store.add(quickPick.onDidTriggerButton((button) => {
      if (button === this.quickInputService.backButton) {
        void this.run();
      }
    }));
    store.add(quickPick.onDidHide(() => store.dispose()));
    quickPick.show();
  }
};
ManageAccountsActionImpl = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, ISecretStorageService),
  __decorateParam(4, IProductService)
], ManageAccountsActionImpl);
export {
  ManageAccountsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGF1dGhlbnRpY2F0aW9uXFxicm93c2VyXFxhY3Rpb25zXFxtYW5hZ2VBY2NvdW50c0FjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbywgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VBY2NvdW50c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubWFuYWdlQWNjb3VudHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFuYWdlQWNjb3VudHMnLCBcIk1hbmFnZSBBY2NvdW50c1wiKSxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ2FjY291bnRzJywgXCJBY2NvdW50c1wiKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFuYWdlQWNjb3VudHNBY3Rpb25JbXBsKS5ydW4oKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgQWNjb3VudFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHByb3ZpZGVySWQ6IHN0cmluZztcblx0Y2FuVXNlTWNwOiBib29sZWFuO1xuXHRjYW5TaWduT3V0OiAoKSA9PiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG5pbnRlcmZhY2UgQWNjb3VudEFjdGlvblF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGFjdGlvbjogKCkgPT4gdm9pZDtcbn1cblxuY2xhc3MgTWFuYWdlQWNjb3VudHNBY3Rpb25JbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGFzeW5jIHJ1bigpIHtcblx0XHRjb25zdCBwbGFjZUhvbGRlciA9IGxvY2FsaXplKCdwaWNrQWNjb3VudCcsIFwiU2VsZWN0IGFuIGFjY291bnQgdG8gbWFuYWdlXCIpO1xuXG5cdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLmxpc3RBY2NvdW50cygpO1xuXHRcdGlmICghYWNjb3VudHMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0FjdGl2ZUFjY291bnRzJywgXCJUaGVyZSBhcmUgbm8gYWN0aXZlIGFjY291bnRzLlwiKSB9XSwgeyBwbGFjZUhvbGRlciB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY2NvdW50ID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKGFjY291bnRzLCB7IHBsYWNlSG9sZGVyLCBtYXRjaE9uRGVzY3JpcHRpb246IHRydWUgfSk7XG5cdFx0aWYgKCFhY2NvdW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zaG93QWNjb3VudEFjdGlvbnMoYWNjb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxpc3RBY2NvdW50cygpOiBQcm9taXNlPEFjY291bnRRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gbmV3IExhenkoKCkgPT4gZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8odGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSkpO1xuXHRcdGNvbnN0IGFjY291bnRzOiBBY2NvdW50UXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCkpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbGFiZWwsIGlkIH0gb2YgYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0YWNjb3VudHMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdHByb3ZpZGVySWQsXG5cdFx0XHRcdFx0Y2FuVXNlTWNwOiAhIXByb3ZpZGVyLmF1dGhvcml6YXRpb25TZXJ2ZXJzPy5sZW5ndGgsXG5cdFx0XHRcdFx0Y2FuU2lnbk91dDogYXN5bmMgKCkgPT4gdGhpcy5jYW5TaWduT3V0KHByb3ZpZGVyLCBpZCwgYXdhaXQgYWN0aXZlU2Vzc2lvbi52YWx1ZSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhY2NvdW50cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuU2lnbk91dChwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIGFjY291bnRJZDogc3RyaW5nLCBzZXNzaW9uPzogQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmNhblNpZ25PdXQgJiYgc2Vzc2lvbi5wcm92aWRlcklkID09PSBwcm92aWRlci5pZCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlci5pZCk7XG5cdFx0XHRyZXR1cm4gIXNlc3Npb25zLnNvbWUobyA9PiBvLmlkID09PSBzZXNzaW9uLmlkICYmIG8uYWNjb3VudC5pZCA9PT0gYWNjb3VudElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dBY2NvdW50QWN0aW9ucyhhY2NvdW50OiBBY2NvdW50UXVpY2tQaWNrSXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXJJZCwgbGFiZWw6IGFjY291bnRMYWJlbCwgY2FuVXNlTWNwLCBjYW5TaWduT3V0IH0gPSBhY2NvdW50O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gc3RvcmUuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPEFjY291bnRBY3Rpb25RdWlja1BpY2tJdGVtPigpKTtcblxuXHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdtYW5hZ2VBY2NvdW50JywgXCJNYW5hZ2UgJ3swfSdcIiwgYWNjb3VudExhYmVsKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VsZWN0QWN0aW9uJywgXCJTZWxlY3QgYW4gYWN0aW9uXCIpO1xuXHRcdHF1aWNrUGljay5idXR0b25zID0gW3RoaXMucXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbl07XG5cblx0XHRjb25zdCBpdGVtczogQWNjb3VudEFjdGlvblF1aWNrUGlja0l0ZW1bXSA9IFt7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRFeHRlbnNpb25zJywgXCJNYW5hZ2UgVHJ1c3RlZCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0YWN0aW9uOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWwgfSlcblx0XHR9XTtcblxuXHRcdGlmIChjYW5Vc2VNY3ApIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRNQ1BTZXJ2ZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0YWN0aW9uOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZE1DUFNlcnZlcnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWwgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChhd2FpdCBjYW5TaWduT3V0KCkpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NpZ25PdXQnLCBcIlNpZ24gT3V0XCIpLFxuXHRcdFx0XHRhY3Rpb246ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19zaWduT3V0T2ZBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWwgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRcdHNlbGVjdGVkLmFjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKChidXR0b24pID0+IHtcblx0XHRcdGlmIChidXR0b24gPT09IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbikge1xuXHRcdFx0XHR2b2lkIHRoaXMucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKSk7XG5cblx0XHRxdWlja1BpY2suc2hvdygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQztBQUNuRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFvQywyQ0FBMkM7QUFDL0UsU0FBa0MsOEJBQThCO0FBRXpELE1BQU0sNkJBQTZCLFFBQVE7QUFBQSxFQUNqRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGtCQUFrQixpQkFBaUI7QUFBQSxNQUNwRCxVQUFVLFVBQVUsWUFBWSxVQUFVO0FBQUEsTUFDMUMsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVnQixJQUFJLFVBQTJDO0FBQzlELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsV0FBTyxxQkFBcUIsZUFBZSx3QkFBd0IsRUFBRSxJQUFJO0FBQUEsRUFDMUU7QUFDRDtBQVlBLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUM5QixZQUNzQyxtQkFDSSx1QkFDUCxnQkFDTSxzQkFDTixnQkFDakM7QUFMb0M7QUFDSTtBQUNQO0FBQ007QUFDTjtBQUFBLEVBQy9CO0FBQUEsRUFFSixNQUFhLE1BQU07QUFDbEIsVUFBTSxjQUFjLFNBQVMsZUFBZSw2QkFBNkI7QUFFekUsVUFBTSxXQUFXLE1BQU0sS0FBSyxhQUFhO0FBQ3pDLFFBQUksQ0FBQyxTQUFTLFFBQVE7QUFDckIsWUFBTSxLQUFLLGtCQUFrQixLQUFLLENBQUMsRUFBRSxPQUFPLFNBQVMsb0JBQW9CLCtCQUErQixF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
