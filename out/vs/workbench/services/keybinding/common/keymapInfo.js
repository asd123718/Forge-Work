import { isWindows, isLinux } from "../../../../base/common/platform.js";
import { getKeyboardLayoutId } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
function deserializeMapping(serializedMapping) {
  const mapping = serializedMapping;
  const ret = {};
  for (const key in mapping) {
    const result = mapping[key];
    if (result.length) {
      const value = result[0];
      const withShift = result[1];
      const withAltGr = result[2];
      const withShiftAltGr = result[3];
      const mask = Number(result[4]);
      const vkey = result.length === 6 ? result[5] : void 0;
      ret[key] = {
        "value": value,
        "vkey": vkey,
        "withShift": withShift,
        "withAltGr": withAltGr,
        "withShiftAltGr": withShiftAltGr,
        "valueIsDeadKey": (mask & 1) > 0,
        "withShiftIsDeadKey": (mask & 2) > 0,
        "withAltGrIsDeadKey": (mask & 4) > 0,
        "withShiftAltGrIsDeadKey": (mask & 8) > 0
      };
    } else {
      ret[key] = {
        "value": "",
        "valueIsDeadKey": false,
        "withShift": "",
        "withShiftIsDeadKey": false,
        "withAltGr": "",
        "withAltGrIsDeadKey": false,
        "withShiftAltGr": "",
        "withShiftAltGrIsDeadKey": false
      };
    }
  }
  return ret;
}
class KeymapInfo {
  constructor(layout, secondaryLayouts, keyboardMapping, isUserKeyboardLayout) {
    this.layout = layout;
    this.secondaryLayouts = secondaryLayouts;
    this.mapping = deserializeMapping(keyboardMapping);
    this.isUserKeyboardLayout = !!isUserKeyboardLayout;
    this.layout.isUserKeyboardLayout = !!isUserKeyboardLayout;
  }
  static createKeyboardLayoutFromDebugInfo(layout, value, isUserKeyboardLayout) {
    const keyboardLayoutInfo = new KeymapInfo(layout, [], {}, true);
    keyboardLayoutInfo.mapping = value;
    return keyboardLayoutInfo;
  }
  update(other) {
    this.layout = other.layout;
    this.secondaryLayouts = other.secondaryLayouts;
    this.mapping = other.mapping;
    this.isUserKeyboardLayout = other.isUserKeyboardLayout;
    this.layout.isUserKeyboardLayout = other.isUserKeyboardLayout;
  }
  getScore(other) {
    let score = 0;
    for (const key in other) {
      if (isWindows && (key === "Backslash" || key === "KeyQ")) {
        continue;
      }
      if (isLinux && (key === "Backspace" || key === "Escape")) {
        continue;
      }
      const currentMapping = this.mapping[key];
      if (currentMapping === void 0) {
        score -= 1;
      }
      const otherMapping = other[key];
      if (currentMapping && otherMapping && currentMapping.value !== otherMapping.value) {
        score -= 1;
      }
    }
    return score;
  }
  equal(other) {
    if (this.isUserKeyboardLayout !== other.isUserKeyboardLayout) {
      return false;
    }
    if (getKeyboardLayoutId(this.layout) !== getKeyboardLayoutId(other.layout)) {
      return false;
    }
    return this.fuzzyEqual(other.mapping);
  }
  fuzzyEqual(other) {
    for (const key in other) {
      if (isWindows && (key === "Backslash" || key === "KeyQ")) {
        continue;
      }
      if (this.mapping[key] === void 0) {
        return false;
      }
      const currentMapping = this.mapping[key];
      const otherMapping = other[key];
      if (currentMapping.value !== otherMapping.value) {
        return false;
      }
    }
    return true;
  }
}
export {
  KeymapInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxjb21tb25cXGtleW1hcEluZm8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzTGludXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRLZXlib2FyZExheW91dElkLCBJS2V5Ym9hcmRMYXlvdXRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTGF5b3V0LmpzJztcblxuZnVuY3Rpb24gZGVzZXJpYWxpemVNYXBwaW5nKHNlcmlhbGl6ZWRNYXBwaW5nOiBJU2VyaWFsaXplZE1hcHBpbmcpIHtcblx0Y29uc3QgbWFwcGluZyA9IHNlcmlhbGl6ZWRNYXBwaW5nO1xuXG5cdGNvbnN0IHJldDogeyBba2V5OiBzdHJpbmddOiBhbnkgfSA9IHt9O1xuXHRmb3IgKGNvbnN0IGtleSBpbiBtYXBwaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0OiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gbWFwcGluZ1trZXldO1xuXHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlc3VsdFswXTtcblx0XHRcdGNvbnN0IHdpdGhTaGlmdCA9IHJlc3VsdFsxXTtcblx0XHRcdGNvbnN0IHdpdGhBbHRHciA9IHJlc3VsdFsyXTtcblx0XHRcdGNvbnN0IHdpdGhTaGlmdEFsdEdyID0gcmVzdWx0WzNdO1xuXHRcdFx0Y29uc3QgbWFzayA9IE51bWJlcihyZXN1bHRbNF0pO1xuXHRcdFx0Y29uc3QgdmtleSA9IHJlc3VsdC5sZW5ndGggPT09IDYgPyByZXN1bHRbNV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXRba2V5XSA9IHtcblx0XHRcdFx0J3ZhbHVlJzogdmFsdWUsXG5cdFx0XHRcdCd2a2V5JzogdmtleSxcblx0XHRcdFx0J3dpdGhTaGlmdCc6IHdpdGhTaGlmdCxcblx0XHRcdFx0J3dpdGhBbHRHcic6IHdpdGhBbHRHcixcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogd2l0aFNoaWZ0QWx0R3IsXG5cdFx0XHRcdCd2YWx1ZUlzRGVhZEtleSc6IChtYXNrICYgMSkgPiAwLFxuXHRcdFx0XHQnd2l0aFNoaWZ0SXNEZWFkS2V5JzogKG1hc2sgJiAyKSA+IDAsXG5cdFx0XHRcdCd3aXRoQWx0R3JJc0RlYWRLZXknOiAobWFzayAmIDQpID4gMCxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdySXNEZWFkS2V5JzogKG1hc2sgJiA4KSA+IDBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldFtrZXldID0ge1xuXHRcdFx0XHQndmFsdWUnOiAnJyxcblx0XHRcdFx0J3ZhbHVlSXNEZWFkS2V5JzogZmFsc2UsXG5cdFx0XHRcdCd3aXRoU2hpZnQnOiAnJyxcblx0XHRcdFx0J3dpdGhTaGlmdElzRGVhZEtleSc6IGZhbHNlLFxuXHRcdFx0XHQnd2l0aEFsdEdyJzogJycsXG5cdFx0XHRcdCd3aXRoQWx0R3JJc0RlYWRLZXknOiBmYWxzZSxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogJycsXG5cdFx0XHRcdCd3aXRoU2hpZnRBbHRHcklzRGVhZEtleSc6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhd01peGVkS2V5Ym9hcmRNYXBwaW5nIHtcblx0W2tleTogc3RyaW5nXToge1xuXHRcdHZhbHVlOiBzdHJpbmc7XG5cdFx0d2l0aFNoaWZ0OiBzdHJpbmc7XG5cdFx0d2l0aEFsdEdyOiBzdHJpbmc7XG5cdFx0d2l0aFNoaWZ0QWx0R3I6IHN0cmluZztcblx0XHR2YWx1ZUlzRGVhZEtleT86IGJvb2xlYW47XG5cdFx0d2l0aFNoaWZ0SXNEZWFkS2V5PzogYm9vbGVhbjtcblx0XHR3aXRoQWx0R3JJc0RlYWRLZXk/OiBib29sZWFuO1xuXHRcdHdpdGhTaGlmdEFsdEdySXNEZWFkS2V5PzogYm9vbGVhbjtcblxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRNYXBwaW5nIHtcblx0W2tleTogc3RyaW5nXTogKHN0cmluZyB8IG51bWJlcilbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJS2V5bWFwSW5mbyB7XG5cdGxheW91dDogSUtleWJvYXJkTGF5b3V0SW5mbztcblx0c2Vjb25kYXJ5TGF5b3V0czogSUtleWJvYXJkTGF5b3V0SW5mb1tdO1xuXHRtYXBwaW5nOiBJU2VyaWFsaXplZE1hcHBpbmc7XG5cdGlzVXNlcktleWJvYXJkTGF5b3V0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEtleW1hcEluZm8ge1xuXHRtYXBwaW5nOiBJUmF3TWl4ZWRLZXlib2FyZE1hcHBpbmc7XG5cdGlzVXNlcktleWJvYXJkTGF5b3V0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBsYXlvdXQ6IElLZXlib2FyZExheW91dEluZm8sIHB1YmxpYyBzZWNvbmRhcnlMYXlvdXRzOiBJS2V5Ym9hcmRMYXlvdXRJbmZvW10sIGtleWJvYXJkTWFwcGluZzogSVNlcmlhbGl6ZWRNYXBwaW5nLCBpc1VzZXJLZXlib2FyZExheW91dD86IGJvb2xlYW4pIHtcblx0XHR0aGlzLm1hcHBpbmcgPSBkZXNlcmlhbGl6ZU1hcHBpbmcoa2V5Ym9hcmRNYXBwaW5nKTtcblx0XHR0aGlzLmlzVXNlcktleWJvYXJkTGF5b3V0ID0gISFpc1VzZXJLZXlib2FyZExheW91dDtcblx0XHR0aGlzLmxheW91dC5pc1VzZXJLZXlib2FyZExheW91dCA9ICEhaXNVc2VyS2V5Ym9hcmRMYXlvdXQ7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlS2V5Ym9hcmRMYXlvdXRGcm9tRGVidWdJbmZvKGxheW91dDogSUtleWJvYXJkTGF5b3V0SW5mbywgdmFsdWU6IElSYXdNaXhlZEtleWJvYXJkTWFwcGluZywgaXNVc2VyS2V5Ym9hcmRMYXlvdXQ/OiBib29sZWFuKTogS2V5bWFwSW5mbyB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRMYXlvdXRJbmZvID0gbmV3IEtleW1hcEluZm8obGF5b3V0LCBbXSwge30sIHRydWUpO1xuXHRcdGtleWJvYXJkTGF5b3V0SW5mby5tYXBwaW5nID0gdmFsdWU7XG5cdFx0cmV0dXJuIGtleWJvYXJkTGF5b3V0SW5mbztcblx0fVxuXG5cdHVwZGF0ZShvdGhlcjogS2V5bWFwSW5mbykge1xuXHRcdHRoaXMubGF5b3V0ID0gb3RoZXIubGF5b3V0O1xuXHRcdHRoaXMuc2Vjb25kYXJ5TGF5b3V0cyA9IG90aGVyLnNlY29uZGFyeUxheW91dHM7XG5cdFx0dGhpcy5tYXBwaW5nID0gb3RoZXIubWFwcGluZztcblx0XHR0aGlzLmlzVXNlcktleWJvYXJkTGF5b3V0ID0gb3RoZXIuaXNVc2VyS2V5Ym9hcmRMYXlvdXQ7XG5cdFx0dGhpcy5sYXlvdXQuaXNVc2VyS2V5Ym9hcmRMYXlvdXQgPSBvdGhlci5pc1VzZXJLZXlib2FyZExheW91dDtcblx0fVxuXG5cdGdldFNjb3JlKG90aGVyOiBJUmF3TWl4ZWRLZXlib2FyZE1hcHBpbmcpOiBudW1iZXIge1xuXHRcdGxldCBzY29yZSA9IDA7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gb3RoZXIpIHtcblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgKGtleSA9PT0gJ0JhY2tzbGFzaCcgfHwga2V5ID09PSAnS2V5UScpKSB7XG5cdFx0XHRcdC8vIGtleW1hcCBmcm9tIENocm9taXVtIGlzIHByb2JhYmx5IHdyb25nLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzTGludXggJiYgKGtleSA9PT0gJ0JhY2tzcGFjZScgfHwga2V5ID09PSAnRXNjYXBlJykpIHtcblx0XHRcdFx0Ly8gbmF0aXZlIGtleW1hcCBkb2Vzbid0IGFsaWduIHdpdGgga2V5Ym9hcmQgZXZlbnRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRNYXBwaW5nID0gdGhpcy5tYXBwaW5nW2tleV07XG5cblx0XHRcdGlmIChjdXJyZW50TWFwcGluZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNjb3JlIC09IDE7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG90aGVyTWFwcGluZyA9IG90aGVyW2tleV07XG5cblx0XHRcdGlmIChjdXJyZW50TWFwcGluZyAmJiBvdGhlck1hcHBpbmcgJiYgY3VycmVudE1hcHBpbmcudmFsdWUgIT09IG90aGVyTWFwcGluZy52YWx1ZSkge1xuXHRcdFx0XHRzY29yZSAtPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzY29yZTtcblx0fVxuXG5cdGVxdWFsKG90aGVyOiBLZXltYXBJbmZvKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaXNVc2VyS2V5Ym9hcmRMYXlvdXQgIT09IG90aGVyLmlzVXNlcktleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGdldEtleWJvYXJkTGF5b3V0SWQodGhpcy5sYXlvdXQpICE9PSBnZXRLZXlib2FyZExheW91dElkKG90aGVyLmxheW91dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5mdXp6eUVxdWFsKG90aGVyLm1hcHBpbmcpO1xuXHR9XG5cblx0ZnV6enlFcXVhbChvdGhlcjogSVJhd01peGVkS2V5Ym9hcmRNYXBwaW5nKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gb3RoZXIpIHtcblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgKGtleSA9PT0gJ0JhY2tzbGFzaCcgfHwga2V5ID09PSAnS2V5UScpKSB7XG5cdFx0XHRcdC8vIGtleW1hcCBmcm9tIENocm9taXVtIGlzIHByb2JhYmx5IHdyb25nLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm1hcHBpbmdba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudE1hcHBpbmcgPSB0aGlzLm1hcHBpbmdba2V5XTtcblx0XHRcdGNvbnN0IG90aGVyTWFwcGluZyA9IG90aGVyW2tleV07XG5cblx0XHRcdGlmIChjdXJyZW50TWFwcGluZy52YWx1ZSAhPT0gb3RoZXJNYXBwaW5nLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLGVBQWU7QUFDbkMsU0FBUywyQkFBZ0Q7QUFFekQsU0FBUyxtQkFBbUIsbUJBQXVDO0FBQ2xFLFFBQU0sVUFBVTtBQUVoQixRQUFNLE1BQThCLENBQUM7QUFDckMsYUFBVyxPQUFPLFNBQVM7QUFDMUIsVUFBTSxTQUE4QixRQUFRLEdBQUc7QUFDL0MsUUFBSSxPQUFPLFFBQVE7QUFDbEIsWUFBTSxRQUFRLE9BQU8sQ0FBQztBQUN0QixZQUFNLFlBQVksT0FBTyxDQUFDO0FBQzFCLFlBQU0sWUFBWSxPQUFPLENBQUM7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
