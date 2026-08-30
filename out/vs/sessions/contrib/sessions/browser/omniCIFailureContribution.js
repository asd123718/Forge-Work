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
import { equals } from "../../../../base/common/arrays.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derivedOpts } from "../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IChatInputWindowService } from "../../../../workbench/contrib/chat/common/chatInputWindow.js";
import { BlockedSessionReason, BlockedSessions } from "../../blockedSessions/browser/blockedSessions.js";
import { IBlockedSessionsCIFixModel } from "./blockedSessionsCIFixModel.js";
class OmniCIFailureProvider extends Disposable {
  constructor(_blockedSessions, _ciFixModel, enabled) {
    super();
    this._blockedSessions = _blockedSessions;
    this._ciFixModel = _ciFixModel;
    this.failures = derivedOpts({
      owner: this,
      equalsFn: (a, b) => equals(a, b, (x, y) => x.sessionResource.toString() === y.sessionResource.toString() && x.occurrenceId === y.occurrenceId && x.label === y.label && x.failed === y.failed && x.pending === y.pending && x.updatedAt === y.updatedAt)
    }, (reader) => {
      if (!enabled) {
        return [];
      }
      const hiddenSessions = this._ciFixModel.hiddenSessions.read(reader);
      const failures = [];
      for (const blocked of this._blockedSessions.blockedSessionsWithReasons.read(reader)) {
        if (blocked.reason !== BlockedSessionReason.FailingCI || hiddenSessions.has(blocked.session.sessionId)) {
          continue;
        }
        const state = this._ciFixModel.getCIFix(blocked.session).read(reader);
        if (!state) {
          continue;
        }
        failures.push({
          sessionResource: blocked.session.resource,
          occurrenceId: blocked.occurrenceId,
          label: blocked.session.title.read(reader),
          failed: state.failed,
          pending: state.pending,
          updatedAt: blocked.session.updatedAt.read(reader).getTime()
        });
      }
      return failures;
    });
  }
  fixCI(sessionResource) {
    const blocked = this._blockedSessions.blockedSessionsWithReasons.get().find((candidate) => candidate.reason === BlockedSessionReason.FailingCI && candidate.session.resource.toString() === sessionResource.toString());
    if (blocked) {
      this._ciFixModel.fixCI(blocked.session);
    }
  }
}
let OmniCIFailureContribution = class extends Disposable {
  constructor(chatInputWindowService, instantiationService, productService, ciFixModel) {
    super();
    const blockedSessions = this._register(instantiationService.createInstance(BlockedSessions));
    const provider = this._register(new OmniCIFailureProvider(blockedSessions, ciFixModel, productService.quality !== "stable"));
    this._register(chatInputWindowService.registerCIFailureProvider(provider));
  }
};
OmniCIFailureContribution.ID = "sessions.contrib.omniCIFailure";
OmniCIFailureContribution = __decorateClass([
  __decorateParam(0, IChatInputWindowService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IBlockedSessionsCIFixModel)
], OmniCIFailureContribution);
export {
  OmniCIFailureContribution,
  OmniCIFailureProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXG9tbmlDSUZhaWx1cmVDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXRXaW5kb3dDSUZhaWx1cmUsIElDaGF0SW5wdXRXaW5kb3dDSUZhaWx1cmVQcm92aWRlciwgSUNoYXRJbnB1dFdpbmRvd1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0SW5wdXRXaW5kb3cuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25SZWFzb24sIEJsb2NrZWRTZXNzaW9ucyB9IGZyb20gJy4uLy4uL2Jsb2NrZWRTZXNzaW9ucy9icm93c2VyL2Jsb2NrZWRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCB9IGZyb20gJy4vYmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBPbW5pQ0lGYWlsdXJlUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRJbnB1dFdpbmRvd0NJRmFpbHVyZVByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBmYWlsdXJlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRJbnB1dFdpbmRvd0NJRmFpbHVyZVtdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ibG9ja2VkU2Vzc2lvbnM6IEJsb2NrZWRTZXNzaW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaUZpeE1vZGVsOiBJQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCxcblx0XHRlbmFibGVkOiBib29sZWFuLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5mYWlsdXJlcyA9IGRlcml2ZWRPcHRzKHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46IChhLCBiKSA9PiBlcXVhbHMoYSwgYiwgKHgsIHkpID0+XG5cdFx0XHRcdHguc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHkuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdFx0JiYgeC5vY2N1cnJlbmNlSWQgPT09IHkub2NjdXJyZW5jZUlkXG5cdFx0XHRcdCYmIHgubGFiZWwgPT09IHkubGFiZWxcblx0XHRcdFx0JiYgeC5mYWlsZWQgPT09IHkuZmFpbGVkXG5cdFx0XHRcdCYmIHgucGVuZGluZyA9PT0geS5wZW5kaW5nXG5cdFx0XHRcdCYmIHgudXBkYXRlZEF0ID09PSB5LnVwZGF0ZWRBdCksXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhpZGRlblNlc3Npb25zID0gdGhpcy5fY2lGaXhNb2RlbC5oaWRkZW5TZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmYWlsdXJlczogSUNoYXRJbnB1dFdpbmRvd0NJRmFpbHVyZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGJsb2NrZWQgb2YgdGhpcy5fYmxvY2tlZFNlc3Npb25zLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpZiAoYmxvY2tlZC5yZWFzb24gIT09IEJsb2NrZWRTZXNzaW9uUmVhc29uLkZhaWxpbmdDSSB8fCBoaWRkZW5TZXNzaW9ucy5oYXMoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2NpRml4TW9kZWwuZ2V0Q0lGaXgoYmxvY2tlZC5zZXNzaW9uKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmYWlsdXJlcy5wdXNoKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGJsb2NrZWQuc2Vzc2lvbi5yZXNvdXJjZSxcblx0XHRcdFx0XHRvY2N1cnJlbmNlSWQ6IGJsb2NrZWQub2NjdXJyZW5jZUlkLFxuXHRcdFx0XHRcdGxhYmVsOiBibG9ja2VkLnNlc3Npb24udGl0bGUucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdGZhaWxlZDogc3RhdGUuZmFpbGVkLFxuXHRcdFx0XHRcdHBlbmRpbmc6IHN0YXRlLnBlbmRpbmcsXG5cdFx0XHRcdFx0dXBkYXRlZEF0OiBibG9ja2VkLnNlc3Npb24udXBkYXRlZEF0LnJlYWQocmVhZGVyKS5nZXRUaW1lKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhaWx1cmVzO1xuXHRcdH0pO1xuXHR9XG5cblx0Zml4Q0koc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBibG9ja2VkID0gdGhpcy5fYmxvY2tlZFNlc3Npb25zLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLmdldCgpLmZpbmQoY2FuZGlkYXRlID0+XG5cdFx0XHRjYW5kaWRhdGUucmVhc29uID09PSBCbG9ja2VkU2Vzc2lvblJlYXNvbi5GYWlsaW5nQ0lcblx0XHRcdCYmIGNhbmRpZGF0ZS5zZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoYmxvY2tlZCkge1xuXHRcdFx0dGhpcy5fY2lGaXhNb2RlbC5maXhDSShibG9ja2VkLnNlc3Npb24pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT21uaUNJRmFpbHVyZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jb250cmliLm9tbmlDSUZhaWx1cmUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdElucHV0V2luZG93U2VydmljZSBjaGF0SW5wdXRXaW5kb3dTZXJ2aWNlOiBJQ2hhdElucHV0V2luZG93U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCBjaUZpeE1vZGVsOiBJQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGJsb2NrZWRTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJsb2NrZWRTZXNzaW9ucykpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE9tbmlDSUZhaWx1cmVQcm92aWRlcihibG9ja2VkU2Vzc2lvbnMsIGNpRml4TW9kZWwsIHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdElucHV0V2luZG93U2VydmljZS5yZWdpc3RlckNJRmFpbHVyZVByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQWdDO0FBRXpDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXVFLCtCQUErQjtBQUN0RyxTQUFTLHNCQUFzQix1QkFBdUI7QUFDdEQsU0FBUyxrQ0FBa0M7QUFFcEMsTUFBTSw4QkFBOEIsV0FBd0Q7QUFBQSxFQUlsRyxZQUNrQixrQkFDQSxhQUNqQixTQUNDO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFLakIsU0FBSyxXQUFXLFlBQVk7QUFBQSxNQUMzQixPQUFPO0FBQUEsTUFDUCxVQUFVLENBQUMsR0FBRyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsR0FBRyxNQUNwQyxFQUFFLGdCQUFnQixTQUFTLE1BQU0sRUFBRSxnQkFBZ0IsU0FBUyxLQUN6RCxFQUFFLGlCQUFpQixFQUFFLGdCQUNyQixFQUFFLFVBQVUsRUFBRSxTQUNkLEVBQUUsV0FBVyxFQUFFLFVBQ2YsRUFBRSxZQUFZLEVBQUUsV0FDaEIsRUFBRSxjQUFjLEVBQUUsU0FBUztBQUFBLElBQ2hDLEdBQUcsWUFBVTtBQUNaLFVBQUksQ0FBQyxTQUFTO0FBQ2IsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUVBLFlBQU0saUJBQWlCLEtBQUssWUFBWSxlQUFlLEtBQUssTUFBTTtBQUNsRSxZQUFNLFdBQXdDLENBQUM7QUFDL0MsaUJBQVcsV0FBVyxLQUFLLGlCQUFpQiwyQkFBMkIsS0FBSyxNQUFNLEdBQUc7QUFDcEYsWUFBSSxRQUFRLFdBQVcscUJBQXFCLGFBQWEsZUFBZSxJQUFJLFFBQVEsUUFBUSxTQUFTLEdBQUc7QUFDdkc7QUFBQSxRQUNEO0FBQ0EsY0FBTSxRQUFRLEtBQUssWUFBWSxTQUFTLFFBQVEsT0FBTyxFQUFFLEtBQUssTUFBTTtBQUNwRSxZQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsUUFDRDtBQUNBLGlCQUFTLEtBQUs7QUFBQSxVQUNiLGlCQUFpQixRQUFRLFFBQVE7QUFBQSxVQUNqQyxjQUFjLFFBQVE7QUFBQSxVQUN0QixPQUFPLFFBQVEsUUFBUSxNQUFNLEtBQUssTUFBTTtBQUFBLFVBQ3hDLFFBQVEsTUFBTTtBQUFBLFVBQ2QsU0FBUyxNQUFNO0FBQUEsVUFDZixXQUFXLFFBQVEsUUFBUSxVQUFVLEtBQUssTUFBTSxFQUFFLFFBQVE7QUFBQSxRQUMzRCxDQUFDO0FBQUEsTUFDRjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGlCQUE0QjtBQUNqQyxVQUFNLFVBQVUsS0FBSyxpQkFBaUIsMkJBQTJCLElBQUksRUFBRSxLQUFLLGVBQzNFLFVBQVUsV0FBVyxxQkFBcUIsYUFDdkMsVUFBVSxRQUFRLFNBQVMsU0FBUyxNQUFNLGdCQUFnQixTQUFTLENBQUM7QUFDeEUsUUFBSSxTQUFTO0FBQ1osV0FBSyxZQUFZLE1BQU0sUUFBUSxPQUFPO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxJQUFNLDRCQUFOLGNBQXdDLFdBQVc7QUFBQSxFQUl6RCxZQUMwQix3QkFDRixzQkFDTixnQkFDVyxZQUMzQjtBQUNELFVBQU07QUFFTixVQUFNLGtCQUFrQixLQUFLLFVBQVUscUJBQXFCLGVBQWUsZUFBZSxDQUFDO0FBQzNGLFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxzQkFBc0IsaUJBQWlCLFlBQVksZUFBZSxZQUFZLFFBQVEsQ0FBQztBQUMzSCxTQUFLLFVBQVUsdUJBQXVCLDBCQUEwQixRQUFRLENBQUM7QUFBQSxFQUMxRTtBQUNEO0FBaEJhLDBCQUVJLEtBQUs7QUFGVCw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
