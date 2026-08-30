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
import "./media/editorHoverWrapper.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { HoverAction } from "../../../../../../../base/browser/ui/hover/hoverWidget.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
const $ = dom.$;
const h = dom.h;
let ChatEditorHoverWrapper = class {
  constructor(hoverContentElement, actions, keybindingService) {
    this.keybindingService = keybindingService;
    const hoverElement = h(
      ".chat-editor-hover-wrapper@root",
      [h(".chat-editor-hover-wrapper-content@content")]
    );
    this.domNode = hoverElement.root;
    hoverElement.content.appendChild(hoverContentElement);
    if (actions && actions.length > 0) {
      const statusBarElement = $(".hover-row.status-bar");
      const actionsElement = $(".actions");
      actions.forEach((action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.commandId);
        const keybindingLabel = keybinding ? keybinding.getLabel() : null;
        HoverAction.render(actionsElement, {
          label: action.label,
          commandId: action.commandId,
          run: (e) => {
            action.run(e);
          },
          iconClass: action.iconClass
        }, keybindingLabel);
      });
      statusBarElement.appendChild(actionsElement);
      this.domNode.appendChild(statusBarElement);
    }
  }
};
ChatEditorHoverWrapper = __decorateClass([
  __decorateParam(2, IKeybindingService)
], ChatEditorHoverWrapper);
export {
  ChatEditorHoverWrapper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcZWRpdG9ySG92ZXJXcmFwcGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2VkaXRvckhvdmVyV3JhcHBlci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUhvdmVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5jb25zdCBoID0gZG9tLmg7XG5cbi8qKlxuICogVGhpcyBib3Jyb3dzIHNvbWUgb2YgSG92ZXJXaWRnZXQgc28gdGhhdCBhIGNoYXQgZWRpdG9yIGhvdmVyIGNhbiBiZSByZW5kZXJlZCBpbiB0aGUgc2FtZSB3YXkgYXMgYSB3b3JrYmVuY2ggaG92ZXIuXG4gKiBNYXliZSBpdCBjYW4gYmUgcmV1c2FibGUgaW4gYSBnZW5lcmljIHdheS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0b3JIb3ZlcldyYXBwZXIge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJDb250ZW50RWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0YWN0aW9uczogSUhvdmVyQWN0aW9uW10gfCB1bmRlZmluZWQsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9IGgoXG5cdFx0XHQnLmNoYXQtZWRpdG9yLWhvdmVyLXdyYXBwZXJAcm9vdCcsXG5cdFx0XHRbaCgnLmNoYXQtZWRpdG9yLWhvdmVyLXdyYXBwZXItY29udGVudEBjb250ZW50JyldKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBob3ZlckVsZW1lbnQucm9vdDtcblx0XHRob3ZlckVsZW1lbnQuY29udGVudC5hcHBlbmRDaGlsZChob3ZlckNvbnRlbnRFbGVtZW50KTtcblxuXHRcdGlmIChhY3Rpb25zICYmIGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhdHVzQmFyRWxlbWVudCA9ICQoJy5ob3Zlci1yb3cuc3RhdHVzLWJhcicpO1xuXHRcdFx0Y29uc3QgYWN0aW9uc0VsZW1lbnQgPSAkKCcuYWN0aW9ucycpO1xuXHRcdFx0YWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmNvbW1hbmRJZCk7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgOiBudWxsO1xuXHRcdFx0XHRIb3ZlckFjdGlvbi5yZW5kZXIoYWN0aW9uc0VsZW1lbnQsIHtcblx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogYWN0aW9uLmNvbW1hbmRJZCxcblx0XHRcdFx0XHRydW46IGUgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uLnJ1bihlKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGljb25DbGFzczogYWN0aW9uLmljb25DbGFzc1xuXHRcdFx0XHR9LCBrZXliaW5kaW5nTGFiZWwpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdGF0dXNCYXJFbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbnNFbGVtZW50KTtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChzdGF0dXNCYXJFbGVtZW50KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUVyQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLElBQUksSUFBSTtBQUNkLE1BQU0sSUFBSSxJQUFJO0FBTVAsSUFBTSx5QkFBTixNQUE2QjtBQUFBLEVBR25DLFlBQ0MscUJBQ0EsU0FDcUMsbUJBQ3BDO0FBRG9DO0FBRXJDLFVBQU0sZUFBZTtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxDQUFDLEVBQUUsNENBQTRDLENBQUM7QUFBQSxJQUFDO0FBQ2xELFNBQUssVUFBVSxhQUFhO0FBQzVCLGlCQUFhLFFBQVEsWUFBWSxtQkFBbUI7QUFFcEQsUUFBSSxXQUFXLFFBQVEsU0FBUyxHQUFHO0FBQ2xDLFlBQU0sbUJBQW1CLEVBQUUsdUJBQXVCO0FBQ2xELFlBQU0saUJBQWlCLEVBQUUsVUFBVTtBQUNuQyxjQUFRLFFBQVEsWUFBVTtBQUN6QixjQUFNLGFBQWEsS0FBSyxrQkFBa0IsaUJBQWlCLE9BQU8sU0FBUztBQUMzRSxjQUFNLGtCQUFrQixhQUFhLFdBQVcsU0FBUyxJQUFJO0FBQzdELG9CQUFZLE9BQU8sZ0JBQWdCO0FBQUEsVUFDbEMsT0FBTyxPQUFPO0FBQUEsVUFDZCxXQUFXLE9BQU87QUFBQSxVQUNsQixLQUFLLE9BQUs7QUFDVCxtQkFBTyxJQUFJLENBQUM7QUFBQSxVQUNiO0FBQUEsVUFDQSxXQUFXLE9BQU87QUFBQSxRQUNuQixHQUFHLGVBQWU7QUFBQSxNQUNuQixDQUFDO0FBQ0QsdUJBQWlCLFlBQVksY0FBYztBQUMzQyxXQUFLLFFBQVEsWUFBWSxnQkFBZ0I7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFDRDtBQWpDYSx5QkFBTjtBQUFBLEVBTUo7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
