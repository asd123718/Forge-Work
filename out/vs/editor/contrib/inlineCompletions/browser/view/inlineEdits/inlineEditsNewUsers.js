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
import { timeout } from "../../../../../../base/common/async.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, runOnChange, runOnChangeWithCancellationToken } from "../../../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
var UserKind = /* @__PURE__ */ ((UserKind2) => {
  UserKind2["FirstTime"] = "firstTime";
  UserKind2["SecondTime"] = "secondTime";
  UserKind2["Active"] = "active";
  return UserKind2;
})(UserKind || {});
let InlineEditsOnboardingExperience = class extends Disposable {
  constructor(_model, _indicator, _collapsedView, _storageService, _configurationService) {
    super();
    this._model = _model;
    this._indicator = _indicator;
    this._collapsedView = _collapsedView;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._disposables = this._register(new MutableDisposable());
    this._setupDone = observableValue({ name: "setupDone" }, false);
    this._activeCompletionId = derived((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      if (!this._setupDone.read(reader)) {
        return void 0;
      }
      const indicator = this._indicator.read(reader);
      if (!indicator || !indicator.isVisible.read(reader)) {
        return void 0;
      }
      return model.inlineEdit.inlineCompletion.identity.id;
    });
    this._register(this._initializeDebugSetting());
    this._disposables.value = this.setupNewUserExperience();
    this._setupDone.set(true, void 0);
  }
  setupNewUserExperience() {
    if (this.getNewUserType() === "active" /* Active */) {
      return void 0;
    }
    const disposableStore = new DisposableStore();
    let userHasHoveredOverIcon = false;
    let inlineEditHasBeenAccepted = false;
    let firstTimeUserAnimationCount = 0;
    let secondTimeUserAnimationCount = 0;
    disposableStore.add(runOnChangeWithCancellationToken(this._activeCompletionId, async (id, _, __, token) => {
      if (id === void 0) {
        return;
      }
      let userType = this.getNewUserType();
      switch (userType) {
        case "firstTime" /* FirstTime */: {
          if (firstTimeUserAnimationCount++ >= 5 || userHasHoveredOverIcon) {
            userType = "secondTime" /* SecondTime */;
            this.setNewUserType(userType);
          }
          break;
        }
        case "secondTime" /* SecondTime */: {
          if (secondTimeUserAnimationCount++ >= 3 && inlineEditHasBeenAccepted) {
            userType = "active" /* Active */;
            this.setNewUserType(userType);
          }
          break;
        }
      }
      switch (userType) {
        case "firstTime" /* FirstTime */: {
          for (let i = 0; i < 3 && !token.isCancellationRequested; i++) {
            await this._indicator.get()?.triggerAnimation();
            await timeout(500);
          }
          break;
        }
        case "secondTime" /* SecondTime */: {
          this._indicator.get()?.triggerAnimation();
          break;
        }
      }
    }));
    disposableStore.add(autorun((reader) => {
      if (this._collapsedView.isVisible.read(reader)) {
        if (this.getNewUserType() !== "active" /* Active */) {
          this._collapsedView.triggerAnimation();
        }
      }
    }));
    disposableStore.add(autorun((reader) => {
      const indicator = this._indicator.read(reader);
      if (!indicator) {
        return;
      }
      reader.store.add(runOnChange(indicator.isHoveredOverIcon, async (isHovered) => {
        if (isHovered) {
          userHasHoveredOverIcon = true;
        }
      }));
    }));
    disposableStore.add(autorun((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return;
      }
      reader.store.add(model.onDidAccept(() => {
        inlineEditHasBeenAccepted = true;
      }));
    }));
    return disposableStore;
  }
  getNewUserType() {
    return this._storageService.get("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION, "firstTime" /* FirstTime */);
  }
  setNewUserType(value) {
    switch (value) {
      case "firstTime" /* FirstTime */:
        throw new BugIndicatingError("UserKind should not be set to first time");
      case "secondTime" /* SecondTime */:
        break;
      case "active" /* Active */:
        this._disposables.clear();
        break;
    }
    this._storageService.store("inlineEditsGutterIndicatorUserKind", value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  _initializeDebugSetting() {
    const hiddenDebugSetting = "editor.inlineSuggest.edits.resetNewUserExperience";
    if (this._configurationService.getValue(hiddenDebugSetting)) {
      this._storageService.remove("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION);
    }
    const disposable = this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(hiddenDebugSetting) && this._configurationService.getValue(hiddenDebugSetting)) {
        this._storageService.remove("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION);
        this._disposables.value = this.setupNewUserExperience();
      }
    });
    return disposable;
  }
};
InlineEditsOnboardingExperience = __decorateClass([
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService)
], InlineEditsOnboardingExperience);
export {
  InlineEditsOnboardingExperience
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNOZXdVc2Vycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgcnVuT25DaGFuZ2UsIHJ1bk9uQ2hhbmdlV2l0aENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c0d1dHRlckluZGljYXRvciB9IGZyb20gJy4vY29tcG9uZW50cy9ndXR0ZXJJbmRpY2F0b3JWaWV3LmpzJztcbmltcG9ydCB7IE1vZGVsUGVySW5saW5lRWRpdCB9IGZyb20gJy4vaW5saW5lRWRpdHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c0NvbGxhcHNlZFZpZXcgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3LmpzJztcblxuZW51bSBVc2VyS2luZCB7XG5cdEZpcnN0VGltZSA9ICdmaXJzdFRpbWUnLFxuXHRTZWNvbmRUaW1lID0gJ3NlY29uZFRpbWUnLFxuXHRBY3RpdmUgPSAnYWN0aXZlJ1xufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNPbmJvYXJkaW5nRXhwZXJpZW5jZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NldHVwRG9uZSA9IG9ic2VydmFibGVWYWx1ZSh7IG5hbWU6ICdzZXR1cERvbmUnIH0sIGZhbHNlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDb21wbGV0aW9uSWQgPSBkZXJpdmVkPHN0cmluZyB8IHVuZGVmaW5lZD4ocmVhZGVyID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIW1vZGVsKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGlmICghdGhpcy5fc2V0dXBEb25lLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBpbmRpY2F0b3IgPSB0aGlzLl9pbmRpY2F0b3IucmVhZChyZWFkZXIpO1xuXHRcdGlmICghaW5kaWNhdG9yIHx8ICFpbmRpY2F0b3IuaXNWaXNpYmxlLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRyZXR1cm4gbW9kZWwuaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLmlkZW50aXR5LmlkO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSU9ic2VydmFibGU8TW9kZWxQZXJJbmxpbmVFZGl0IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbmRpY2F0b3I6IElPYnNlcnZhYmxlPElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsYXBzZWRWaWV3OiBJbmxpbmVFZGl0c0NvbGxhcHNlZFZpZXcsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luaXRpYWxpemVEZWJ1Z1NldHRpbmcoKSk7XG5cblx0XHQvLyBTZXR1cCB0aGUgb25ib2FyZGluZyBleHBlcmllbmNlIGZvciBuZXcgdXNlcnNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZSA9IHRoaXMuc2V0dXBOZXdVc2VyRXhwZXJpZW5jZSgpO1xuXG5cdFx0dGhpcy5fc2V0dXBEb25lLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cE5ld1VzZXJFeHBlcmllbmNlKCk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5nZXROZXdVc2VyVHlwZSgpID09PSBVc2VyS2luZC5BY3RpdmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0bGV0IHVzZXJIYXNIb3ZlcmVkT3Zlckljb24gPSBmYWxzZTtcblx0XHRsZXQgaW5saW5lRWRpdEhhc0JlZW5BY2NlcHRlZCA9IGZhbHNlO1xuXHRcdGxldCBmaXJzdFRpbWVVc2VyQW5pbWF0aW9uQ291bnQgPSAwO1xuXHRcdGxldCBzZWNvbmRUaW1lVXNlckFuaW1hdGlvbkNvdW50ID0gMDtcblxuXHRcdC8vIHB1bHNlIGFuaW1hdGlvbiBmb3IgbmV3IHVzZXJzXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChydW5PbkNoYW5nZVdpdGhDYW5jZWxsYXRpb25Ub2tlbih0aGlzLl9hY3RpdmVDb21wbGV0aW9uSWQsIGFzeW5jIChpZCwgXywgX18sIHRva2VuKSA9PiB7XG5cdFx0XHRpZiAoaWQgPT09IHVuZGVmaW5lZCkgeyByZXR1cm47IH1cblx0XHRcdGxldCB1c2VyVHlwZSA9IHRoaXMuZ2V0TmV3VXNlclR5cGUoKTtcblxuXHRcdFx0Ly8gVXNlciBLaW5kIFRyYW5zaXRpb25cblx0XHRcdHN3aXRjaCAodXNlclR5cGUpIHtcblx0XHRcdFx0Y2FzZSBVc2VyS2luZC5GaXJzdFRpbWU6IHtcblx0XHRcdFx0XHRpZiAoZmlyc3RUaW1lVXNlckFuaW1hdGlvbkNvdW50KysgPj0gNSB8fCB1c2VySGFzSG92ZXJlZE92ZXJJY29uKSB7XG5cdFx0XHRcdFx0XHR1c2VyVHlwZSA9IFVzZXJLaW5kLlNlY29uZFRpbWU7XG5cdFx0XHRcdFx0XHR0aGlzLnNldE5ld1VzZXJUeXBlKHVzZXJUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBVc2VyS2luZC5TZWNvbmRUaW1lOiB7XG5cdFx0XHRcdFx0aWYgKHNlY29uZFRpbWVVc2VyQW5pbWF0aW9uQ291bnQrKyA+PSAzICYmIGlubGluZUVkaXRIYXNCZWVuQWNjZXB0ZWQpIHtcblx0XHRcdFx0XHRcdHVzZXJUeXBlID0gVXNlcktpbmQuQWN0aXZlO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXROZXdVc2VyVHlwZSh1c2VyVHlwZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFuaW1hdGlvblxuXHRcdFx0c3dpdGNoICh1c2VyVHlwZSkge1xuXHRcdFx0XHRjYXNlIFVzZXJLaW5kLkZpcnN0VGltZToge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMyAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7IGkrKykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faW5kaWNhdG9yLmdldCgpPy50cmlnZ2VyQW5pbWF0aW9uKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVXNlcktpbmQuU2Vjb25kVGltZToge1xuXHRcdFx0XHRcdHRoaXMuX2luZGljYXRvci5nZXQoKT8udHJpZ2dlckFuaW1hdGlvbigpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29sbGFwc2VkVmlldy5pc1Zpc2libGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmdldE5ld1VzZXJUeXBlKCkgIT09IFVzZXJLaW5kLkFjdGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxhcHNlZFZpZXcudHJpZ2dlckFuaW1hdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2hlbiB0aGUgdXNlciBoYXMgaG92ZXJlZCBvdmVyIHRoZSBpY29uXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IGluZGljYXRvciA9IHRoaXMuX2luZGljYXRvci5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWluZGljYXRvcikgeyByZXR1cm47IH1cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UoaW5kaWNhdG9yLmlzSG92ZXJlZE92ZXJJY29uLCBhc3luYyAoaXNIb3ZlcmVkKSA9PiB7XG5cdFx0XHRcdGlmIChpc0hvdmVyZWQpIHtcblx0XHRcdFx0XHR1c2VySGFzSG92ZXJlZE92ZXJJY29uID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlbWVtYmVyIHdoZW4gdGhlIHVzZXIgaGFzIGFjY2VwdGVkIGFuIGlubGluZSBlZGl0XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCkgeyByZXR1cm47IH1cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQobW9kZWwub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRpbmxpbmVFZGl0SGFzQmVlbkFjY2VwdGVkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZVN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXdVc2VyVHlwZSgpOiBVc2VyS2luZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldCgnaW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3JVc2VyS2luZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgVXNlcktpbmQuRmlyc3RUaW1lKSBhcyBVc2VyS2luZDtcblx0fVxuXG5cdHByaXZhdGUgc2V0TmV3VXNlclR5cGUodmFsdWU6IFVzZXJLaW5kKTogdm9pZCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBVc2VyS2luZC5GaXJzdFRpbWU6XG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1VzZXJLaW5kIHNob3VsZCBub3QgYmUgc2V0IHRvIGZpcnN0IHRpbWUnKTtcblx0XHRcdGNhc2UgVXNlcktpbmQuU2Vjb25kVGltZTpcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFVzZXJLaW5kLkFjdGl2ZTpcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2lubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yVXNlcktpbmQnLCB2YWx1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZURlYnVnU2V0dGluZygpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gRGVidWcgc2V0dGluZyB0byByZXNldCB0aGUgbmV3IHVzZXIgZXhwZXJpZW5jZVxuXHRcdGNvbnN0IGhpZGRlbkRlYnVnU2V0dGluZyA9ICdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5yZXNldE5ld1VzZXJFeHBlcmllbmNlJztcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaGlkZGVuRGVidWdTZXR0aW5nKSkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKCdpbmxpbmVFZGl0c0d1dHRlckluZGljYXRvclVzZXJLaW5kJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaGlkZGVuRGVidWdTZXR0aW5nKSAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShoaWRkZW5EZWJ1Z1NldHRpbmcpKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZSgnaW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3JVc2VyS2luZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlID0gdGhpcy5zZXR1cE5ld1VzZXJFeHBlcmllbmNlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxTQUFTLFNBQXNCLGlCQUFpQixhQUFhLHdDQUF3QztBQUM5RyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUs3RCxJQUFLLFdBQUwsa0JBQUtBLGNBQUw7QUFDQyxFQUFBQSxVQUFBLGVBQVk7QUFDWixFQUFBQSxVQUFBLGdCQUFhO0FBQ2IsRUFBQUEsVUFBQSxZQUFTO0FBSEwsU0FBQUE7QUFBQSxHQUFBO0FBTUUsSUFBTSxrQ0FBTixjQUE4QyxXQUFXO0FBQUEsRUFrQi9ELFlB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
