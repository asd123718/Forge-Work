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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { chatSubcommandLeader } from "../../../common/requestParser/chatParserTypes.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { localize } from "../../../../../../nls.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { HoverStyle } from "../../../../../../base/browser/ui/hover/hover.js";
let ChatAgentCommandContentPart = class extends Disposable {
  constructor(cmd, onClick, _hoverService) {
    super();
    this._hoverService = _hoverService;
    this.domNode = document.createElement("span");
    this.domNode.classList.add("chat-agent-command");
    this.domNode.setAttribute("aria-label", cmd.name);
    this.domNode.setAttribute("role", "button");
    const groupId = generateUuid();
    const commandSpan = document.createElement("span");
    this.domNode.appendChild(commandSpan);
    commandSpan.innerText = chatSubcommandLeader + cmd.name;
    this._store.add(this._hoverService.setupDelayedHover(commandSpan, {
      content: cmd.description,
      style: HoverStyle.Pointer
    }, { groupId }));
    const rerun = localize("rerun", "Rerun without {0}{1}", chatSubcommandLeader, cmd.name);
    const btn = new Button(this.domNode, { ariaLabel: rerun });
    btn.icon = Codicon.closeSmall;
    this._store.add(btn.onDidClick(() => onClick()));
    this._store.add(btn);
    this._store.add(this._hoverService.setupDelayedHover(btn.element, {
      content: rerun,
      style: HoverStyle.Pointer
    }, { groupId }));
  }
  hasSameContent(other, followingContent, element) {
    return false;
  }
};
ChatAgentCommandContentPart = __decorateClass([
  __decorateParam(2, IHoverService)
], ChatAgentCommandContentPart);
export {
  ChatAgentCommandContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdEFnZW50Q29tbWFuZENvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IGNoYXRTdWJjb21tYW5kTGVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y21kOiBJQ2hhdEFnZW50Q29tbWFuZCxcblx0XHRvbkNsaWNrOiAoKSA9PiB2b2lkLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1hZ2VudC1jb21tYW5kJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGNtZC5uYW1lKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXG5cdFx0Y29uc3QgZ3JvdXBJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0Y29uc3QgY29tbWFuZFNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGNvbW1hbmRTcGFuKTtcblx0XHRjb21tYW5kU3Bhbi5pbm5lclRleHQgPSBjaGF0U3ViY29tbWFuZExlYWRlciArIGNtZC5uYW1lO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoY29tbWFuZFNwYW4sIHtcblx0XHRcdGNvbnRlbnQ6IGNtZC5kZXNjcmlwdGlvbixcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0fSwgeyBncm91cElkIH0pKTtcblxuXHRcdGNvbnN0IHJlcnVuID0gbG9jYWxpemUoJ3JlcnVuJywgXCJSZXJ1biB3aXRob3V0IHswfXsxfVwiLCBjaGF0U3ViY29tbWFuZExlYWRlciwgY21kLm5hbWUpO1xuXHRcdGNvbnN0IGJ0biA9IG5ldyBCdXR0b24odGhpcy5kb21Ob2RlLCB7IGFyaWFMYWJlbDogcmVydW4gfSk7XG5cdFx0YnRuLmljb24gPSBDb2RpY29uLmNsb3NlU21hbGw7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGJ0bi5vbkRpZENsaWNrKCgpID0+IG9uQ2xpY2soKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChidG4pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoYnRuLmVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IHJlcnVuLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9LCB7IGdyb3VwSWQgfSkpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyw0QkFBNEI7QUFJckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUdwQixJQUFNLDhCQUFOLGNBQTBDLFdBQXVDO0FBQUEsRUFJdkYsWUFDQyxLQUNBLFNBQ2dDLGVBQy9CO0FBQ0QsVUFBTTtBQUYwQjtBQUxqQyxTQUFTLFVBQXVCLFNBQVMsY0FBYyxNQUFNO0FBUTVELFNBQUssUUFBUSxVQUFVLElBQUksb0JBQW9CO0FBQy9DLFNBQUssUUFBUSxhQUFhLGNBQWMsSUFBSSxJQUFJO0FBQ2hELFNBQUssUUFBUSxhQUFhLFFBQVEsUUFBUTtBQUUxQyxVQUFNLFVBQVUsYUFBYTtBQUU3QixVQUFNLGNBQWMsU0FBUyxjQUFjLE1BQU07QUFDakQsU0FBSyxRQUFRLFlBQVksV0FBVztBQUNwQyxnQkFBWSxZQUFZLHVCQUF1QixJQUFJO0FBQ25ELFNBQUssT0FBTyxJQUFJLEtBQUssY0FBYyxrQkFBa0IsYUFBYTtBQUFBLE1BQ2pFLFNBQVMsSUFBSTtBQUFBLE1BQ2IsT0FBTyxXQUFXO0FBQUEsSUFDbkIsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBRWYsVUFBTSxRQUFRLFNBQVMsU0FBUyx3QkFBd0Isc0JBQXNCLElBQUksSUFBSTtBQUN0RixVQUFNLE1BQU0sSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLFdBQVcsTUFBTSxDQUFDO0FBQ3pELFFBQUksT0FBTyxRQUFRO0FBQ25CLFNBQUssT0FBTyxJQUFJLElBQUksV0FBVyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQy9DLFNBQUssT0FBTyxJQUFJLEdBQUc7QUFDbkIsU0FBSyxPQUFPLElBQUksS0FBSyxjQUFjLGtCQUFrQixJQUFJLFNBQVM7QUFBQSxNQUNqRSxTQUFTO0FBQUEsTUFDVCxPQUFPLFdBQVc7QUFBQSxJQUNuQixHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsZUFBZSxPQUE2QixrQkFBMEMsU0FBZ0M7QUFDckgsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXRDYSw4QkFBTjtBQUFBLEVBT0o7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
