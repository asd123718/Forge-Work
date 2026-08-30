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
import { es5ClassCompat } from "./es5ClassCompat.js";
let SnippetString = class {
  constructor(value) {
    this._tabstop = 1;
    this.value = value || "";
  }
  static isSnippetString(thing) {
    if (thing instanceof SnippetString) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return typeof thing.value === "string";
  }
  static _escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  appendText(string) {
    this.value += SnippetString._escape(string);
    return this;
  }
  appendTabstop(number = this._tabstop++) {
    this.value += "$";
    this.value += number;
    return this;
  }
  appendPlaceholder(value, number = this._tabstop++) {
    if (typeof value === "function") {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      value(nested);
      this._tabstop = nested._tabstop;
      value = nested.value;
    } else {
      value = SnippetString._escape(value);
    }
    this.value += "${";
    this.value += number;
    this.value += ":";
    this.value += value;
    this.value += "}";
    return this;
  }
  appendChoice(values, number = this._tabstop++) {
    const value = values.map((s) => s.replaceAll(/[|\\,]/g, "\\$&")).join(",");
    this.value += "${";
    this.value += number;
    this.value += "|";
    this.value += value;
    this.value += "|}";
    return this;
  }
  appendVariable(name, defaultValue) {
    if (typeof defaultValue === "function") {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      defaultValue(nested);
      this._tabstop = nested._tabstop;
      defaultValue = nested.value;
    } else if (typeof defaultValue === "string") {
      defaultValue = defaultValue.replace(/\$|}/g, "\\$&");
    }
    this.value += "${";
    this.value += name;
    if (defaultValue) {
      this.value += ":";
      this.value += defaultValue;
    }
    this.value += "}";
    return this;
  }
};
SnippetString = __decorateClass([
  es5ClassCompat
], SnippetString);
export {
  SnippetString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHNuaXBwZXRTdHJpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBTbmlwcGV0U3RyaW5nIHtcblxuXHRzdGF0aWMgaXNTbmlwcGV0U3RyaW5nKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgU25pcHBldFN0cmluZyB7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgU25pcHBldFN0cmluZykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghdGhpbmcgfHwgdHlwZW9mIHRoaW5nICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mICg8U25pcHBldFN0cmluZz50aGluZykudmFsdWUgPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2VzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFwkfH18XFxcXC9nLCAnXFxcXCQmJyk7XG5cdH1cblxuXHRwcml2YXRlIF90YWJzdG9wOiBudW1iZXIgPSAxO1xuXG5cdHZhbHVlOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodmFsdWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWUgfHwgJyc7XG5cdH1cblxuXHRhcHBlbmRUZXh0KHN0cmluZzogc3RyaW5nKTogU25pcHBldFN0cmluZyB7XG5cdFx0dGhpcy52YWx1ZSArPSBTbmlwcGV0U3RyaW5nLl9lc2NhcGUoc3RyaW5nKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZFRhYnN0b3AobnVtYmVyOiBudW1iZXIgPSB0aGlzLl90YWJzdG9wKyspOiBTbmlwcGV0U3RyaW5nIHtcblx0XHR0aGlzLnZhbHVlICs9ICckJztcblx0XHR0aGlzLnZhbHVlICs9IG51bWJlcjtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZFBsYWNlaG9sZGVyKHZhbHVlOiBzdHJpbmcgfCAoKHNuaXBwZXQ6IFNuaXBwZXRTdHJpbmcpID0+IHVua25vd24pLCBudW1iZXI6IG51bWJlciA9IHRoaXMuX3RhYnN0b3ArKyk6IFNuaXBwZXRTdHJpbmcge1xuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Y29uc3QgbmVzdGVkID0gbmV3IFNuaXBwZXRTdHJpbmcoKTtcblx0XHRcdG5lc3RlZC5fdGFic3RvcCA9IHRoaXMuX3RhYnN0b3A7XG5cdFx0XHR2YWx1ZShuZXN0ZWQpO1xuXHRcdFx0dGhpcy5fdGFic3RvcCA9IG5lc3RlZC5fdGFic3RvcDtcblx0XHRcdHZhbHVlID0gbmVzdGVkLnZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IFNuaXBwZXRTdHJpbmcuX2VzY2FwZSh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSArPSAnJHsnO1xuXHRcdHRoaXMudmFsdWUgKz0gbnVtYmVyO1xuXHRcdHRoaXMudmFsdWUgKz0gJzonO1xuXHRcdHRoaXMudmFsdWUgKz0gdmFsdWU7XG5cdFx0dGhpcy52YWx1ZSArPSAnfSc7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZENob2ljZSh2YWx1ZXM6IHN0cmluZ1tdLCBudW1iZXI6IG51bWJlciA9IHRoaXMuX3RhYnN0b3ArKyk6IFNuaXBwZXRTdHJpbmcge1xuXHRcdGNvbnN0IHZhbHVlID0gdmFsdWVzLm1hcChzID0+IHMucmVwbGFjZUFsbCgvW3xcXFxcLF0vZywgJ1xcXFwkJicpKS5qb2luKCcsJyk7XG5cblx0XHR0aGlzLnZhbHVlICs9ICckeyc7XG5cdFx0dGhpcy52YWx1ZSArPSBudW1iZXI7XG5cdFx0dGhpcy52YWx1ZSArPSAnfCc7XG5cdFx0dGhpcy52YWx1ZSArPSB2YWx1ZTtcblx0XHR0aGlzLnZhbHVlICs9ICd8fSc7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZFZhcmlhYmxlKG5hbWU6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogc3RyaW5nIHwgKChzbmlwcGV0OiBTbmlwcGV0U3RyaW5nKSA9PiB1bmtub3duKSk6IFNuaXBwZXRTdHJpbmcge1xuXG5cdFx0aWYgKHR5cGVvZiBkZWZhdWx0VmFsdWUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGNvbnN0IG5lc3RlZCA9IG5ldyBTbmlwcGV0U3RyaW5nKCk7XG5cdFx0XHRuZXN0ZWQuX3RhYnN0b3AgPSB0aGlzLl90YWJzdG9wO1xuXHRcdFx0ZGVmYXVsdFZhbHVlKG5lc3RlZCk7XG5cdFx0XHR0aGlzLl90YWJzdG9wID0gbmVzdGVkLl90YWJzdG9wO1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gbmVzdGVkLnZhbHVlO1xuXG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gZGVmYXVsdFZhbHVlLnJlcGxhY2UoL1xcJHx9L2csICdcXFxcJCYnKTsgLy8gQ29kZVFMIFtTTTAyMzgzXSBJIGRvIG5vdCB3YW50IHRvIGVzY2FwZSBiYWNrc2xhc2hlcyBoZXJlXG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSArPSAnJHsnO1xuXHRcdHRoaXMudmFsdWUgKz0gbmFtZTtcblx0XHRpZiAoZGVmYXVsdFZhbHVlKSB7XG5cdFx0XHR0aGlzLnZhbHVlICs9ICc6Jztcblx0XHRcdHRoaXMudmFsdWUgKz0gZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHR0aGlzLnZhbHVlICs9ICd9JztcblxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUd4QixJQUFNLGdCQUFOLE1BQW9CO0FBQUEsRUFvQjFCLFlBQVksT0FBZ0I7QUFKNUIsU0FBUSxXQUFtQjtBQUsxQixTQUFLLFFBQVEsU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFwQkEsT0FBTyxnQkFBZ0IsT0FBd0M7QUFDOUQsUUFBSSxpQkFBaUIsZUFBZTtBQUNuQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUF1QixNQUFPLFVBQVU7QUFBQSxFQUNoRDtBQUFBLEVBRUEsT0FBZSxRQUFRLE9BQXVCO0FBQzdDLFdBQU8sTUFBTSxRQUFRLFlBQVksTUFBTTtBQUFBLEVBQ3hDO0FBQUEsRUFVQSxXQUFXLFFBQStCO0FBQ3pDLFNBQUssU0FBUyxjQUFjLFFBQVEsTUFBTTtBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxTQUFpQixLQUFLLFlBQTJCO0FBQzlELFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxrQkFBa0IsT0FBdUQsU0FBaUIsS0FBSyxZQUEyQjtBQUV6SCxRQUFJLE9BQU8sVUFBVSxZQUFZO0FBQ2hDLFlBQU0sU0FBUyxJQUFJLGNBQWM7QUFDakMsYUFBTyxXQUFXLEtBQUs7QUFDdkIsWUFBTSxNQUFNO0FBQ1osV0FBSyxXQUFXLE9BQU87QUFDdkIsY0FBUSxPQUFPO0FBQUEsSUFDaEIsT0FBTztBQUNOLGNBQVEsY0FBYyxRQUFRLEtBQUs7QUFBQSxJQUNwQztBQUVBLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUVkLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxhQUFhLFFBQWtCLFNBQWlCLEtBQUssWUFBMkI7QUFDL0UsVUFBTSxRQUFRLE9BQU8sSUFBSSxPQUFLLEVBQUUsV0FBVyxXQUFXLE1BQU0sQ0FBQyxFQUFFLEtBQUssR0FBRztBQUV2RSxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFFZCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZUFBZSxNQUFjLGNBQThFO0FBRTFHLFFBQUksT0FBTyxpQkFBaUIsWUFBWTtBQUN2QyxZQUFNLFNBQVMsSUFBSSxjQUFjO0FBQ2pDLGFBQU8sV0FBVyxLQUFLO0FBQ3ZCLG1CQUFhLE1BQU07QUFDbkIsV0FBSyxXQUFXLE9BQU87QUFDdkIscUJBQWUsT0FBTztBQUFBLElBRXZCLFdBQVcsT0FBTyxpQkFBaUIsVUFBVTtBQUM1QyxxQkFBZSxhQUFhLFFBQVEsU0FBUyxNQUFNO0FBQUEsSUFDcEQ7QUFFQSxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxRQUFJLGNBQWM7QUFDakIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxTQUFTO0FBQUEsSUFDZjtBQUNBLFNBQUssU0FBUztBQUdkLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUE1RmEsZ0JBQU47QUFBQSxFQUROO0FBQUEsR0FDWTsiLAogICJuYW1lcyI6IFtdCn0K
