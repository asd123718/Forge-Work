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
import "./media/chatPullRequestContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { addDisposableListener } from "../../../../../../base/browser/dom.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
let ChatPullRequestContentPart = class extends Disposable {
  constructor(pullRequestContent, commandService) {
    super();
    this.pullRequestContent = pullRequestContent;
    this.commandService = commandService;
    this.domNode = dom.$(".chat-pull-request-content-part");
    const container = dom.append(this.domNode, dom.$(".container"));
    const contentContainer = dom.append(container, dom.$(".content-container"));
    const titleContainer = dom.append(contentContainer, dom.$(".title-container"));
    const icon = dom.append(titleContainer, dom.$(".icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));
    const titleLink = dom.append(titleContainer, dom.$("a.title"));
    titleLink.textContent = `${this.pullRequestContent.title} - ${this.pullRequestContent.author}`;
    if (this.pullRequestContent.uri) {
      titleLink.href = this.pullRequestContent.uri?.toString();
    }
    this._register(addDisposableListener(titleLink, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(this.pullRequestContent.command.id, ...this.pullRequestContent.command.arguments ?? []);
    }));
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "pullRequest";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatPullRequestContentPart = __decorateClass([
  __decorateParam(1, ICommandService)
], ChatPullRequestContentPart);
export {
  ChatPullRequestContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFB1bGxSZXF1ZXN0Q29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFB1bGxSZXF1ZXN0Q29udGVudC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNoYXRQdWxsUmVxdWVzdENvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UHVsbFJlcXVlc3RDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHVsbFJlcXVlc3RDb250ZW50OiBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtcHVsbC1yZXF1ZXN0LWNvbnRlbnQtcGFydCcpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjb250ZW50Q29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY29udGVudC1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCB0aXRsZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGVudENvbnRhaW5lciwgZG9tLiQoJy50aXRsZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQodGl0bGVDb250YWluZXIsIGRvbS4kKCcuaWNvbicpKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5naXRQdWxsUmVxdWVzdCkpO1xuXHRcdGNvbnN0IHRpdGxlTGluazogSFRNTEFuY2hvckVsZW1lbnQgPSBkb20uYXBwZW5kKHRpdGxlQ29udGFpbmVyLCBkb20uJCgnYS50aXRsZScpKTtcblx0XHR0aXRsZUxpbmsudGV4dENvbnRlbnQgPSBgJHt0aGlzLnB1bGxSZXF1ZXN0Q29udGVudC50aXRsZX0gLSAke3RoaXMucHVsbFJlcXVlc3RDb250ZW50LmF1dGhvcn1gO1xuXHRcdGlmICh0aGlzLnB1bGxSZXF1ZXN0Q29udGVudC51cmkpIHtcblx0XHRcdHRpdGxlTGluay5ocmVmID0gdGhpcy5wdWxsUmVxdWVzdENvbnRlbnQudXJpPy50b1N0cmluZygpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGl0bGVMaW5rLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGhpcy5wdWxsUmVxdWVzdENvbnRlbnQuY29tbWFuZC5pZCwgLi4uKHRoaXMucHVsbFJlcXVlc3RDb250ZW50LmNvbW1hbmQuYXJndW1lbnRzID8/IFtdKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ3B1bGxSZXF1ZXN0Jztcblx0fVxuXG5cdGFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQStCO0FBS3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUV6QixJQUFNLDZCQUFOLGNBQXlDLFdBQXVDO0FBQUEsRUFHdEYsWUFDa0Isb0JBQ2lCLGdCQUFpQztBQUNuRSxVQUFNO0FBRlc7QUFDaUI7QUFHbEMsU0FBSyxVQUFVLElBQUksRUFBRSxpQ0FBaUM7QUFDdEQsVUFBTSxZQUFZLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLFlBQVksQ0FBQztBQUM5RCxVQUFNLG1CQUFtQixJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsb0JBQW9CLENBQUM7QUFFMUUsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLGtCQUFrQixJQUFJLEVBQUUsa0JBQWtCLENBQUM7QUFDN0UsVUFBTSxPQUFPLElBQUksT0FBTyxnQkFBZ0IsSUFBSSxFQUFFLE9BQU8sQ0FBQztBQUN0RCxTQUFLLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsY0FBYyxDQUFDO0FBQ3hFLFVBQU0sWUFBK0IsSUFBSSxPQUFPLGdCQUFnQixJQUFJLEVBQUUsU0FBUyxDQUFDO0FBQ2hGLGNBQVUsY0FBYyxHQUFHLEtBQUssbUJBQW1CLEtBQUssTUFBTSxLQUFLLG1CQUFtQixNQUFNO0FBQzVGLFFBQUksS0FBSyxtQkFBbUIsS0FBSztBQUNoQyxnQkFBVSxPQUFPLEtBQUssbUJBQW1CLEtBQUssU0FBUztBQUFBLElBQ3hEO0FBQ0EsU0FBSyxVQUFVLHNCQUFzQixXQUFXLFNBQVMsQ0FBQyxNQUFNO0FBQy9ELFFBQUUsZUFBZTtBQUNqQixRQUFFLGdCQUFnQjtBQUNsQixXQUFLLGVBQWUsZUFBZSxLQUFLLG1CQUFtQixRQUFRLElBQUksR0FBSSxLQUFLLG1CQUFtQixRQUFRLGFBQWEsQ0FBQyxDQUFFO0FBQUEsSUFDNUgsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsZUFBZSxPQUE2QixrQkFBMEMsU0FBZ0M7QUFDckgsV0FBTyxNQUFNLFNBQVM7QUFBQSxFQUN2QjtBQUFBLEVBRUEsY0FBYyxZQUErQjtBQUM1QyxTQUFLLFVBQVUsVUFBVTtBQUFBLEVBQzFCO0FBQ0Q7QUFsQ2EsNkJBQU47QUFBQSxFQUtKO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
