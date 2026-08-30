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
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { BrowserDialogHandler } from "./dialogHandler.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { createBrowserAboutDialogDetails } from "./dialog.js";
let DialogHandlerContribution = class extends Disposable {
  constructor(dialogService, instantiationService, productService) {
    super();
    this.dialogService = dialogService;
    this.productService = productService;
    this.impl = new Lazy(() => instantiationService.createInstance(BrowserDialogHandler));
    this.model = this.dialogService.model;
    this._register(this.model.onWillShowDialog(() => {
      if (!this.currentDialog) {
        this.processDialogs();
      }
    }));
    this.processDialogs();
  }
  async processDialogs() {
    while (this.model.dialogs.length) {
      this.currentDialog = this.model.dialogs[0];
      let result = void 0;
      try {
        if (this.currentDialog.args.confirmArgs) {
          const args = this.currentDialog.args.confirmArgs;
          result = await this.impl.value.confirm(args.confirmation);
        } else if (this.currentDialog.args.inputArgs) {
          const args = this.currentDialog.args.inputArgs;
          result = await this.impl.value.input(args.input);
        } else if (this.currentDialog.args.promptArgs) {
          const args = this.currentDialog.args.promptArgs;
          result = await this.impl.value.prompt(args.prompt);
        } else {
          const aboutDialogDetails = createBrowserAboutDialogDetails(this.productService);
          await this.impl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
        }
      } catch (error) {
        result = error;
      }
      this.currentDialog.close(result);
      this.currentDialog = void 0;
    }
  }
};
DialogHandlerContribution.ID = "workbench.contrib.dialogHandler";
DialogHandlerContribution = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService)
], DialogHandlerContribution);
registerWorkbenchContribution2(
  DialogHandlerContribution.ID,
  DialogHandlerContribution,
  WorkbenchPhase.BlockStartup
  // Block to allow for dialogs to show before restore finished
);
export {
  DialogHandlerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxkaWFsb2dzXFxkaWFsb2cud2ViLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaWFsb2dIYW5kbGVyLCBJRGlhbG9nUmVzdWx0LCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElEaWFsb2dzTW9kZWwsIElEaWFsb2dWaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJEaWFsb2dIYW5kbGVyIH0gZnJvbSAnLi9kaWFsb2dIYW5kbGVyLmpzJztcbmltcG9ydCB7IERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kaWFsb2dzL2NvbW1vbi9kaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCcm93c2VyQWJvdXREaWFsb2dEZXRhaWxzIH0gZnJvbSAnLi9kaWFsb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgRGlhbG9nSGFuZGxlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZGlhbG9nSGFuZGxlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSURpYWxvZ3NNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBpbXBsOiBMYXp5PElEaWFsb2dIYW5kbGVyPjtcblxuXHRwcml2YXRlIGN1cnJlbnREaWFsb2c6IElEaWFsb2dWaWV3SXRlbSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmltcGwgPSBuZXcgTGF6eSgoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyRGlhbG9nSGFuZGxlcikpO1xuXHRcdHRoaXMubW9kZWwgPSAodGhpcy5kaWFsb2dTZXJ2aWNlIGFzIERpYWxvZ1NlcnZpY2UpLm1vZGVsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbldpbGxTaG93RGlhbG9nKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5jdXJyZW50RGlhbG9nKSB7XG5cdFx0XHRcdHRoaXMucHJvY2Vzc0RpYWxvZ3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnByb2Nlc3NEaWFsb2dzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb2Nlc3NEaWFsb2dzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHdoaWxlICh0aGlzLm1vZGVsLmRpYWxvZ3MubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREaWFsb2cgPSB0aGlzLm1vZGVsLmRpYWxvZ3NbMF07XG5cblx0XHRcdGxldCByZXN1bHQ6IElEaWFsb2dSZXN1bHQgfCBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnREaWFsb2cuYXJncy5jb25maXJtQXJncykge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSB0aGlzLmN1cnJlbnREaWFsb2cuYXJncy5jb25maXJtQXJncztcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmltcGwudmFsdWUuY29uZmlybShhcmdzLmNvbmZpcm1hdGlvbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jdXJyZW50RGlhbG9nLmFyZ3MuaW5wdXRBcmdzKSB7XG5cdFx0XHRcdFx0Y29uc3QgYXJncyA9IHRoaXMuY3VycmVudERpYWxvZy5hcmdzLmlucHV0QXJncztcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmltcGwudmFsdWUuaW5wdXQoYXJncy5pbnB1dCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jdXJyZW50RGlhbG9nLmFyZ3MucHJvbXB0QXJncykge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSB0aGlzLmN1cnJlbnREaWFsb2cuYXJncy5wcm9tcHRBcmdzO1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuaW1wbC52YWx1ZS5wcm9tcHQoYXJncy5wcm9tcHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGFib3V0RGlhbG9nRGV0YWlscyA9IGNyZWF0ZUJyb3dzZXJBYm91dERpYWxvZ0RldGFpbHModGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbXBsLnZhbHVlLmFib3V0KGFib3V0RGlhbG9nRGV0YWlscy50aXRsZSwgYWJvdXREaWFsb2dEZXRhaWxzLmRldGFpbHMsIGFib3V0RGlhbG9nRGV0YWlscy5kZXRhaWxzVG9Db3B5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmVzdWx0ID0gZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudERpYWxvZy5jbG9zZShyZXN1bHQpO1xuXHRcdFx0dGhpcy5jdXJyZW50RGlhbG9nID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdERpYWxvZ0hhbmRsZXJDb250cmlidXRpb24uSUQsXG5cdERpYWxvZ0hhbmRsZXJDb250cmlidXRpb24sXG5cdFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCAvLyBCbG9jayB0byBhbGxvdyBmb3IgZGlhbG9ncyB0byBzaG93IGJlZm9yZSByZXN0b3JlIGZpbmlzaGVkXG4pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUF3QyxzQkFBc0I7QUFDOUQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUV2RixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFlBQVk7QUFDckIsU0FBUyx1Q0FBdUM7QUFFekMsSUFBTSw0QkFBTixjQUF3QyxXQUE2QztBQUFBLEVBUzNGLFlBQ3lCLGVBQ0Qsc0JBQ0UsZ0JBQ3hCO0FBQ0QsVUFBTTtBQUprQjtBQUVDO0FBSXpCLFNBQUssT0FBTyxJQUFJLEtBQUssTUFBTSxxQkFBcUIsZUFBZSxvQkFBb0IsQ0FBQztBQUNwRixTQUFLLFFBQVMsS0FBSyxjQUFnQztBQUVuRCxTQUFLLFVBQVUsS0FBSyxNQUFNLGlCQUFpQixNQUFNO0FBQ2hELFVBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsYUFBSyxlQUFlO0FBQUEsTUFDckI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFjLGlCQUFnQztBQUM3QyxXQUFPLEtBQUssTUFBTSxRQUFRLFFBQVE7QUFDakMsV0FBSyxnQkFBZ0IsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUV6QyxVQUFJLFNBQTRDO0FBQ2hELFVBQUk7QUFDSCxZQUFJLEtBQUssY0FBYyxLQUFLLGFBQWE7QUFDeEMsZ0JBQU0sT0FBTyxLQUFLLGNBQWMsS0FBSztBQUNyQyxtQkFBUyxNQUFNLEtBQUssS0FBSyxNQUFNLFFBQVEsS0FBSyxZQUFZO0FBQUEsUUFDekQsV0FBVyxLQUFLLGNBQWMsS0FBSyxXQUFXO0FBQzdDLGdCQUFNLE9BQU8sS0FBSyxjQUFjLEtBQUs7QUFDckMsbUJBQVMsTUFBTSxLQUFLLEtBQUssTUFBTSxNQUFNLEtBQUssS0FBSztBQUFBLFFBQ2hELFdBQVcsS0FBSyxjQUFjLEtBQUssWUFBWTtBQUM5QyxnQkFBTSxPQUFPLEtBQUssY0FBYyxLQUFLO0FBQ3JDLG1CQUFTLE1BQU0sS0FBSyxLQUFLLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFBQSxRQUNsRCxPQUFPO0FBQ04sZ0JBQU0scUJBQXFCLGdDQUFnQyxLQUFLLGNBQWM7QUFDOUUsZ0JBQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxtQkFBbUIsT0FBTyxtQkFBbUIsU0FBUyxtQkFBbUIsYUFBYTtBQUFBLFFBQ25IO0FBQUEsTUFDRCxTQUFTLE9BQU87QUFDZixpQkFBUztBQUFBLE1BQ1Y7QUFFQSxXQUFLLGNBQWMsTUFBTSxNQUFNO0FBQy9CLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUF2RGEsMEJBRUksS0FBSztBQUZULDRCQUFOO0FBQUEsRUFVSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTtBQXlEYjtBQUFBLEVBQ0MsMEJBQTBCO0FBQUEsRUFDMUI7QUFBQSxFQUNBLGVBQWU7QUFBQTtBQUNoQjsiLAogICJuYW1lcyI6IFtdCn0K
