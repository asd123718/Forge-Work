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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IExtensionManagementService } from "../../../../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { CancelChatActionId } from "../../../actions/chatExecuteActions.js";
import { AcceptToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatConfirmationWidget } from "../chatConfirmationWidget.js";
import { ChatExtensionsContentPart } from "../chatExtensionsContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
let ExtensionsInstallConfirmationWidgetSubPart = class extends BaseChatToolInvocationSubPart {
  get codeblocks() {
    return this._confirmWidget?.codeblocks || [];
  }
  get codeblocksPartId() {
    return this._confirmWidget?.codeblocksPartId || "<none>";
  }
  constructor(toolInvocation, context, keybindingService, contextKeyService, chatWidgetService, extensionManagementService, instantiationService) {
    super(toolInvocation);
    if (toolInvocation.toolSpecificData?.kind !== "extensions") {
      throw new Error("Tool specific data is missing or not of kind extensions");
    }
    const extensionsContent = toolInvocation.toolSpecificData;
    this.domNode = dom.$("");
    const chatExtensionsContentPart = this._register(instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent));
    dom.append(this.domNode, chatExtensionsContentPart.domNode);
    const state = toolInvocation.state.get();
    if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      const allowLabel = localize("allow", "Allow");
      const allowTooltip = keybindingService.appendKeybinding(allowLabel, AcceptToolConfirmationActionId);
      const cancelLabel = localize("cancel", "Cancel");
      const cancelTooltip = keybindingService.appendKeybinding(cancelLabel, CancelChatActionId);
      const enableAllowButtonEvent = this._register(new Emitter());
      const buttons = [
        {
          label: allowLabel,
          data: { type: ToolConfirmKind.UserAction },
          tooltip: allowTooltip,
          disabled: true,
          onDidChangeDisablement: enableAllowButtonEvent.event
        },
        {
          label: cancelLabel,
          data: { type: ToolConfirmKind.Denied },
          isSecondary: true,
          tooltip: cancelTooltip
        }
      ];
      const confirmWidget = this._register(instantiationService.createInstance(
        ChatConfirmationWidget,
        context,
        {
          title: state.confirmationMessages?.title ?? localize("installExtensions", "Install Extensions"),
          message: state.confirmationMessages?.message ?? localize("installExtensionsConfirmation", "Click the Install button on the extension and then press Allow when finished."),
          buttons
        }
      ));
      this._confirmWidget = confirmWidget;
      dom.append(this.domNode, confirmWidget.domNode);
      this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
        IChatToolInvocation.confirmWith(toolInvocation, button.data);
        if (!isTouchClick) {
          chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
        }
      }));
      const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(contextKeyService);
      hasToolConfirmationKey.set(true);
      this._register(toDisposable(() => hasToolConfirmationKey.reset()));
      const disposable = this._register(extensionManagementService.onInstallExtension((e) => {
        if (extensionsContent.extensions.some((id) => areSameExtensions({ id }, e.identifier))) {
          disposable.dispose();
          enableAllowButtonEvent.fire(false);
        }
      }));
    }
  }
};
ExtensionsInstallConfirmationWidgetSubPart = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IExtensionManagementService),
  __decorateParam(6, IInstantiationService)
], ExtensionsInstallConfirmationWidgetSubPart);
export {
  ExtensionsInstallConfirmationWidgetSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdEV4dGVuc2lvbnNJbnN0YWxsVG9vbFN1YlBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsQ2hhdEFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWNjZXB0VG9vbENvbmZpcm1hdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlybWF0aW9uV2lkZ2V0LCBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbiB9IGZyb20gJy4uL2NoYXRDb25maXJtYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRFeHRlbnNpb25zQ29udGVudFBhcnQgfSBmcm9tICcuLi9jaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNJbnN0YWxsQ29uZmlybWF0aW9uV2lkZ2V0U3ViUGFydCBleHRlbmRzIEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtV2lkZ2V0PzogQ2hhdENvbmZpcm1hdGlvbldpZGdldDxDb25maXJtZWRSZWFzb24+O1xuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2NrcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybVdpZGdldD8uY29kZWJsb2NrcyB8fCBbXTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgY29kZWJsb2Nrc1BhcnRJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybVdpZGdldD8uY29kZWJsb2Nrc1BhcnRJZCB8fCAnPG5vbmU+Jztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnZXh0ZW5zaW9ucycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVG9vbCBzcGVjaWZpYyBkYXRhIGlzIG1pc3Npbmcgb3Igbm90IG9mIGtpbmQgZXh0ZW5zaW9ucycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNDb250ZW50ID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnJyk7XG5cdFx0Y29uc3QgY2hhdEV4dGVuc2lvbnNDb250ZW50UGFydCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFeHRlbnNpb25zQ29udGVudFBhcnQsIGV4dGVuc2lvbnNDb250ZW50KSk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGNoYXRFeHRlbnNpb25zQ29udGVudFBhcnQuZG9tTm9kZSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBhbGxvd0xhYmVsID0gbG9jYWxpemUoJ2FsbG93JywgXCJBbGxvd1wiKTtcblx0XHRcdGNvbnN0IGFsbG93VG9vbHRpcCA9IGtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoYWxsb3dMYWJlbCwgQWNjZXB0VG9vbENvbmZpcm1hdGlvbkFjdGlvbklkKTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsTGFiZWwgPSBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIik7XG5cdFx0XHRjb25zdCBjYW5jZWxUb29sdGlwID0ga2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhjYW5jZWxMYWJlbCwgQ2FuY2VsQ2hhdEFjdGlvbklkKTtcblx0XHRcdGNvbnN0IGVuYWJsZUFsbG93QnV0dG9uRXZlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uczogSUNoYXRDb25maXJtYXRpb25CdXR0b248Q29uZmlybWVkUmVhc29uPltdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGFsbG93TGFiZWwsXG5cdFx0XHRcdFx0ZGF0YTogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9LFxuXHRcdFx0XHRcdHRvb2x0aXA6IGFsbG93VG9vbHRpcCxcblx0XHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRvbkRpZENoYW5nZURpc2FibGVtZW50OiBlbmFibGVBbGxvd0J1dHRvbkV2ZW50LmV2ZW50XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogY2FuY2VsTGFiZWwsXG5cdFx0XHRcdFx0ZGF0YTogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIH0sXG5cdFx0XHRcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdFx0dG9vbHRpcDogY2FuY2VsVG9vbHRpcFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBjb25maXJtV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRDb25maXJtYXRpb25XaWRnZXQ8Q29uZmlybWVkUmVhc29uPixcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRpdGxlOiBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUgPz8gbG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25zJywgXCJJbnN0YWxsIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0bWVzc2FnZTogc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2UgPz8gbG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25zQ29uZmlybWF0aW9uJywgXCJDbGljayB0aGUgSW5zdGFsbCBidXR0b24gb24gdGhlIGV4dGVuc2lvbiBhbmQgdGhlbiBwcmVzcyBBbGxvdyB3aGVuIGZpbmlzaGVkLlwiKSxcblx0XHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHRcdHRoaXMuX2NvbmZpcm1XaWRnZXQgPSBjb25maXJtV2lkZ2V0O1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGNvbmZpcm1XaWRnZXQuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihjb25maXJtV2lkZ2V0Lm9uRGlkQ2xpY2soKHsgYnV0dG9uLCBpc1RvdWNoQ2xpY2sgfSkgPT4ge1xuXHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHRvb2xJbnZvY2F0aW9uLCBidXR0b24uZGF0YSk7XG5cdFx0XHRcdGlmICghaXNUb3VjaENsaWNrKSB7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk/LmZvY3VzSW5wdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgaGFzVG9vbENvbmZpcm1hdGlvbktleSA9IENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1Rvb2xDb25maXJtYXRpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGhhc1Rvb2xDb25maXJtYXRpb25LZXkuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGhhc1Rvb2xDb25maXJtYXRpb25LZXkucmVzZXQoKSkpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbEV4dGVuc2lvbihlID0+IHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNDb250ZW50LmV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGUuaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZW5hYmxlQWxsb3dCdXR0b25FdmVudC5maXJlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMEIscUJBQXFCLHVCQUF1QjtBQUN0RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUF1RDtB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
