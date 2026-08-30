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
import { Dimension, getActiveDocument } from "../../../../base/browser/dom.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { codiconsLibrary } from "../../../../base/common/codiconsLibrary.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { WorkbenchIconSelectBox } from "../../../services/userDataProfile/browser/iconSelectBox.js";
const icons = new Lazy(() => {
  const iconDefinitions = getIconRegistry().getIcons();
  const includedChars = /* @__PURE__ */ new Set();
  const dedupedIcons = iconDefinitions.filter((e) => {
    if (e.id === codiconsLibrary.blank.id) {
      return false;
    }
    if (ThemeIcon.isThemeIcon(e.defaults)) {
      return false;
    }
    if (includedChars.has(e.defaults.fontCharacter)) {
      return false;
    }
    includedChars.add(e.defaults.fontCharacter);
    return true;
  });
  return dedupedIcons;
});
let TerminalIconPicker = class extends Disposable {
  constructor(instantiationService, _hoverService, _layoutService) {
    super();
    this._hoverService = _hoverService;
    this._layoutService = _layoutService;
    this._iconSelectBox = instantiationService.createInstance(WorkbenchIconSelectBox, {
      icons: icons.value,
      inputBoxStyles: defaultInputBoxStyles
    });
  }
  async pickIcons() {
    const dimension = new Dimension(486, 260);
    return new Promise((resolve) => {
      this._register(this._iconSelectBox.onDidSelect((e) => {
        resolve(e);
        this._iconSelectBox.dispose();
      }));
      this._iconSelectBox.clearInput();
      const body = getActiveDocument().body;
      const bodyRect = body.getBoundingClientRect();
      const hoverWidget = this._hoverService.showInstantHover({
        content: this._iconSelectBox.domNode,
        target: {
          targetElements: [body],
          x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
          y: bodyRect.top + this._layoutService.activeContainerOffset.top
        },
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        }
      }, true);
      if (hoverWidget) {
        this._register(hoverWidget);
      }
      this._iconSelectBox.layout(dimension);
      this._iconSelectBox.focus();
    });
  }
};
TerminalIconPicker = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, ILayoutService)
], TerminalIconPicker);
export {
  TerminalIconPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbEljb25QaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaW1lbnNpb24sIGdldEFjdGl2ZURvY3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IGNvZGljb25zTGlicmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zTGlicmFyeS5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5LCBJY29uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hJY29uU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvaWNvblNlbGVjdEJveC5qcyc7XG5cbmNvbnN0IGljb25zID0gbmV3IExhenk8SWNvbkNvbnRyaWJ1dGlvbltdPigoKSA9PiB7XG5cdGNvbnN0IGljb25EZWZpbml0aW9ucyA9IGdldEljb25SZWdpc3RyeSgpLmdldEljb25zKCk7XG5cdGNvbnN0IGluY2x1ZGVkQ2hhcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgZGVkdXBlZEljb25zID0gaWNvbkRlZmluaXRpb25zLmZpbHRlcihlID0+IHtcblx0XHRpZiAoZS5pZCA9PT0gY29kaWNvbnNMaWJyYXJ5LmJsYW5rLmlkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oZS5kZWZhdWx0cykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGluY2x1ZGVkQ2hhcnMuaGFzKGUuZGVmYXVsdHMuZm9udENoYXJhY3RlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aW5jbHVkZWRDaGFycy5hZGQoZS5kZWZhdWx0cy5mb250Q2hhcmFjdGVyKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG5cdHJldHVybiBkZWR1cGVkSWNvbnM7XG59KTtcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsSWNvblBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uU2VsZWN0Qm94OiBXb3JrYmVuY2hJY29uU2VsZWN0Qm94O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faWNvblNlbGVjdEJveCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEljb25TZWxlY3RCb3gsIHtcblx0XHRcdGljb25zOiBpY29ucy52YWx1ZSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHBpY2tJY29ucygpOiBQcm9taXNlPFRoZW1lSWNvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IG5ldyBEaW1lbnNpb24oNDg2LCAyNjApO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUaGVtZUljb24gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faWNvblNlbGVjdEJveC5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRcdFx0cmVzb2x2ZShlKTtcblx0XHRcdFx0dGhpcy5faWNvblNlbGVjdEJveC5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9pY29uU2VsZWN0Qm94LmNsZWFySW5wdXQoKTtcblx0XHRcdGNvbnN0IGJvZHkgPSBnZXRBY3RpdmVEb2N1bWVudCgpLmJvZHk7XG5cdFx0XHRjb25zdCBib2R5UmVjdCA9IGJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBob3ZlcldpZGdldCA9IHRoaXMuX2hvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogdGhpcy5faWNvblNlbGVjdEJveC5kb21Ob2RlLFxuXHRcdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0XHR0YXJnZXRFbGVtZW50czogW2JvZHldLFxuXHRcdFx0XHRcdHg6IGJvZHlSZWN0LmxlZnQgKyAoYm9keVJlY3Qud2lkdGggLSBkaW1lbnNpb24ud2lkdGgpIC8gMixcblx0XHRcdFx0XHR5OiBib2R5UmVjdC50b3AgKyB0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lck9mZnNldC50b3Bcblx0XHRcdFx0fSxcblx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHRydWUpO1xuXHRcdFx0aWYgKGhvdmVyV2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyV2lkZ2V0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2ljb25TZWxlY3RCb3gubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0XHR0aGlzLl9pY29uU2VsZWN0Qm94LmZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXLHlCQUF5QjtBQUM3QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBeUM7QUFDbEQsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSxRQUFRLElBQUksS0FBeUIsTUFBTTtBQUNoRCxRQUFNLGtCQUFrQixnQkFBZ0IsRUFBRSxTQUFTO0FBQ25ELFFBQU0sZ0JBQWdCLG9CQUFJLElBQVk7QUFDdEMsUUFBTSxlQUFlLGdCQUFnQixPQUFPLE9BQUs7QUFDaEQsUUFBSSxFQUFFLE9BQU8sZ0JBQWdCLE1BQU0sSUFBSTtBQUN0QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksVUFBVSxZQUFZLEVBQUUsUUFBUSxHQUFHO0FBQ3RDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxjQUFjLElBQUksRUFBRSxTQUFTLGFBQWEsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLGtCQUFjLElBQUksRUFBRSxTQUFTLGFBQWE7QUFDMUMsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUNELFNBQU87QUFDUixDQUFDO0FBRU0sSUFBTSxxQkFBTixjQUFpQyxXQUFXO0FBQUEsRUFHbEQsWUFDd0Isc0JBQ1MsZUFDQyxnQkFDaEM7QUFDRCxVQUFNO0FBSDBCO0FBQ0M7QUFJakMsU0FBSyxpQkFBaUIscUJBQXFCLGVBQWUsd0JBQXdCO0FBQUEsTUFDakYsT0FBTyxNQUFNO0FBQUEsTUFDYixnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxZQUE0QztBQUNqRCxVQUFNLFlBQVksSUFBSSxVQUFVLEtBQUssR0FBRztBQUN4QyxXQUFPLElBQUksUUFBK0IsYUFBVztBQUNwRCxXQUFLLFVBQVUsS0FBSyxlQUFlLFlBQVksT0FBSztBQUNuRCxnQkFBUSxDQUFDO0FBQ1QsYUFBSyxlQUFlLFFBQVE7QUFBQSxNQUM3QixDQUFDLENBQUM7QUFDRixXQUFLLGVBQWUsV0FBVztBQUMvQixZQUFNLE9BQU8sa0JBQWtCLEVBQUU7QUFDakMsWUFBTSxXQUFXLEtBQUssc0JBQXNCO0FBQzVDLFlBQU0sY0FBYyxLQUFLLGNBQWMsaUJBQWlCO0FBQUEsUUFDdkQsU0FBUyxLQUFLLGVBQWU7QUFBQSxRQUM3QixRQUFRO0FBQUEsVUFDUCxnQkFBZ0IsQ0FBQyxJQUFJO0FBQUEsVUFDckIsR0FBRyxTQUFTLFFBQVEsU0FBUyxRQUFRLFVBQVUsU0FBUztBQUFBLFVBQ3hELEdBQUcsU0FBUyxNQUFNLEtBQUssZUFBZSxzQkFBc0I7QUFBQSxRQUM3RDtBQUFBLFFBQ0EsVUFBVTtBQUFBLFVBQ1QsZUFBZSxjQUFjO0FBQUEsUUFDOUI7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLFFBQVE7QUFBQSxRQUNUO0FBQUEsTUFDRCxHQUFHLElBQUk7QUFDUCxVQUFJLGFBQWE7QUFDaEIsYUFBSyxVQUFVLFdBQVc7QUFBQSxNQUMzQjtBQUNBLFdBQUssZUFBZSxPQUFPLFNBQVM7QUFDcEMsV0FBSyxlQUFlLE1BQU07QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBL0NhLHFCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
