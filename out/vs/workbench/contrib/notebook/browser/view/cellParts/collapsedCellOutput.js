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
import * as DOM from "../../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { EXPAND_CELL_OUTPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
const $ = DOM.$;
let CollapsedCellOutput = class extends CellContentPart {
  constructor(notebookEditor, cellOutputCollapseContainer, keybindingService) {
    super();
    this.notebookEditor = notebookEditor;
    const placeholder = DOM.append(cellOutputCollapseContainer, $("span.expandOutputPlaceholder"));
    placeholder.textContent = localize("cellOutputsCollapsedMsg", "Outputs are collapsed");
    const expandIcon = DOM.append(cellOutputCollapseContainer, $("span.expandOutputIcon"));
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    const keybinding = keybindingService.lookupKeybinding(EXPAND_CELL_OUTPUT_COMMAND_ID);
    if (keybinding) {
      placeholder.title = localize("cellExpandOutputButtonLabelWithDoubleClick", "Double-click to expand cell output ({0})", keybinding.getLabel());
      cellOutputCollapseContainer.title = localize("cellExpandOutputButtonLabel", "Expand Cell Output (${0})", keybinding.getLabel());
    }
    DOM.hide(cellOutputCollapseContainer);
    this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => this.expand()));
    this._register(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => this.expand()));
  }
  expand() {
    if (!this.currentCell) {
      return;
    }
    if (!this.currentCell) {
      return;
    }
    const textModel = this.notebookEditor.textModel;
    const index = textModel.cells.indexOf(this.currentCell.model);
    if (index < 0) {
      return;
    }
    this.currentCell.isOutputCollapsed = !this.currentCell.isOutputCollapsed;
  }
};
CollapsedCellOutput = __decorateClass([
  __decorateParam(2, IKeybindingService)
], CollapsedCellOutput);
export {
  CollapsedCellOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNvbGxhcHNlZENlbGxPdXRwdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRVhQQU5EX0NFTExfT1VUUFVUX0NPTU1BTkRfSUQsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsQ29udGVudFBhcnQgfSBmcm9tICcuLi9jZWxsUGFydC5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuZXhwb3J0IGNsYXNzIENvbGxhcHNlZENlbGxPdXRwdXQgZXh0ZW5kcyBDZWxsQ29udGVudFBhcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0Y2VsbE91dHB1dENvbGxhcHNlQ29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gRE9NLmFwcGVuZChjZWxsT3V0cHV0Q29sbGFwc2VDb250YWluZXIsICQoJ3NwYW4uZXhwYW5kT3V0cHV0UGxhY2Vob2xkZXInKSkgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0cGxhY2Vob2xkZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2VsbE91dHB1dHNDb2xsYXBzZWRNc2cnLCBcIk91dHB1dHMgYXJlIGNvbGxhcHNlZFwiKTtcblx0XHRjb25zdCBleHBhbmRJY29uID0gRE9NLmFwcGVuZChjZWxsT3V0cHV0Q29sbGFwc2VDb250YWluZXIsICQoJ3NwYW4uZXhwYW5kT3V0cHV0SWNvbicpKTtcblx0XHRleHBhbmRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5tb3JlKSk7XG5cblx0XHRjb25zdCBrZXliaW5kaW5nID0ga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhFWFBBTkRfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCk7XG5cdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdHBsYWNlaG9sZGVyLnRpdGxlID0gbG9jYWxpemUoJ2NlbGxFeHBhbmRPdXRwdXRCdXR0b25MYWJlbFdpdGhEb3VibGVDbGljaycsIFwiRG91YmxlLWNsaWNrIHRvIGV4cGFuZCBjZWxsIG91dHB1dCAoezB9KVwiLCBrZXliaW5kaW5nLmdldExhYmVsKCkpO1xuXHRcdFx0Y2VsbE91dHB1dENvbGxhcHNlQ29udGFpbmVyLnRpdGxlID0gbG9jYWxpemUoJ2NlbGxFeHBhbmRPdXRwdXRCdXR0b25MYWJlbCcsIFwiRXhwYW5kIENlbGwgT3V0cHV0ICgkezB9KVwiLCBrZXliaW5kaW5nLmdldExhYmVsKCkpO1xuXHRcdH1cblxuXHRcdERPTS5oaWRlKGNlbGxPdXRwdXRDb2xsYXBzZUNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGV4cGFuZEljb24sIERPTS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuZXhwYW5kKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNlbGxPdXRwdXRDb2xsYXBzZUNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5EQkxDTElDSywgKCkgPT4gdGhpcy5leHBhbmQoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHBhbmQoKSB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRDZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRDZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwhO1xuXHRcdGNvbnN0IGluZGV4ID0gdGV4dE1vZGVsLmNlbGxzLmluZGV4T2YodGhpcy5jdXJyZW50Q2VsbC5tb2RlbCk7XG5cblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50Q2VsbC5pc091dHB1dENvbGxhcHNlZCA9ICF0aGlzLmN1cnJlbnRDZWxsLmlzT3V0cHV0Q29sbGFwc2VkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQ0FBc0Q7QUFDL0QsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxJQUFJLElBQUk7QUFFUCxJQUFNLHNCQUFOLGNBQWtDLGdCQUFnQjtBQUFBLEVBQ3hELFlBQ2tCLGdCQUNqQiw2QkFDb0IsbUJBQ25CO0FBQ0QsVUFBTTtBQUpXO0FBTWpCLFVBQU0sY0FBYyxJQUFJLE9BQU8sNkJBQTZCLEVBQUUsOEJBQThCLENBQUM7QUFDN0YsZ0JBQVksY0FBYyxTQUFTLDJCQUEyQix1QkFBdUI7QUFDckYsVUFBTSxhQUFhLElBQUksT0FBTyw2QkFBNkIsRUFBRSx1QkFBdUIsQ0FBQztBQUNyRixlQUFXLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsSUFBSSxDQUFDO0FBRXBFLFVBQU0sYUFBYSxrQkFBa0IsaUJBQWlCLDZCQUE2QjtBQUNuRixRQUFJLFlBQVk7QUFDZixrQkFBWSxRQUFRLFNBQVMsOENBQThDLDRDQUE0QyxXQUFXLFNBQVMsQ0FBQztBQUM1SSxrQ0FBNEIsUUFBUSxTQUFTLCtCQUErQiw2QkFBNkIsV0FBVyxTQUFTLENBQUM7QUFBQSxJQUMvSDtBQUVBLFFBQUksS0FBSywyQkFBMkI7QUFFcEMsU0FBSyxVQUFVLElBQUksc0JBQXNCLFlBQVksSUFBSSxVQUFVLE9BQU8sTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQzlGLFNBQUssVUFBVSxJQUFJLHNCQUFzQiw2QkFBNkIsSUFBSSxVQUFVLFVBQVUsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDbkg7QUFBQSxFQUVRLFNBQVM7QUFDaEIsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLGVBQWU7QUFDdEMsVUFBTSxRQUFRLFVBQVUsTUFBTSxRQUFRLEtBQUssWUFBWSxLQUFLO0FBRTVELFFBQUksUUFBUSxHQUFHO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZLG9CQUFvQixDQUFDLEtBQUssWUFBWTtBQUFBLEVBQ3hEO0FBQ0Q7QUEzQ2Esc0JBQU47QUFBQSxFQUlKO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
