var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _delegate;
import { MarkdownString as BaseMarkdownString } from "../../../../base/common/htmlContent.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
let MarkdownString = class {
  constructor(value, supportThemeIcons = false) {
    __privateAdd(this, _delegate);
    __privateSet(this, _delegate, new BaseMarkdownString(value, { supportThemeIcons }));
  }
  static isMarkdownString(thing) {
    if (thing instanceof MarkdownString) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return thing.appendCodeblock && thing.appendMarkdown && thing.appendText && thing.value !== void 0;
  }
  get value() {
    return __privateGet(this, _delegate).value;
  }
  set value(value) {
    __privateGet(this, _delegate).value = value;
  }
  get isTrusted() {
    return __privateGet(this, _delegate).isTrusted;
  }
  set isTrusted(value) {
    __privateGet(this, _delegate).isTrusted = value;
  }
  get supportThemeIcons() {
    return __privateGet(this, _delegate).supportThemeIcons;
  }
  set supportThemeIcons(value) {
    __privateGet(this, _delegate).supportThemeIcons = value;
  }
  get supportHtml() {
    return __privateGet(this, _delegate).supportHtml;
  }
  set supportHtml(value) {
    __privateGet(this, _delegate).supportHtml = value;
  }
  get supportAlertSyntax() {
    return __privateGet(this, _delegate).supportAlertSyntax;
  }
  set supportAlertSyntax(value) {
    __privateGet(this, _delegate).supportAlertSyntax = value;
  }
  get baseUri() {
    return __privateGet(this, _delegate).baseUri;
  }
  set baseUri(value) {
    __privateGet(this, _delegate).baseUri = value;
  }
  appendText(value) {
    __privateGet(this, _delegate).appendText(value);
    return this;
  }
  appendMarkdown(value) {
    __privateGet(this, _delegate).appendMarkdown(value);
    return this;
  }
  appendCodeblock(value, language) {
    __privateGet(this, _delegate).appendCodeblock(language ?? "", value);
    return this;
  }
};
_delegate = new WeakMap();
MarkdownString = __decorateClass([
  es5ClassCompat
], MarkdownString);
export {
  MarkdownString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXG1hcmtkb3duU3RyaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIGFzIEJhc2VNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmdUcnVzdGVkT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVzNUNsYXNzQ29tcGF0IH0gZnJvbSAnLi9lczVDbGFzc0NvbXBhdC5qcyc7XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIE1hcmtkb3duU3RyaW5nIGltcGxlbWVudHMgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHtcblxuXHRyZWFkb25seSAjZGVsZWdhdGU6IEJhc2VNYXJrZG93blN0cmluZztcblxuXHRzdGF0aWMgaXNNYXJrZG93blN0cmluZyh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHZzY29kZS5NYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGluZyBhcyB2c2NvZGUuTWFya2Rvd25TdHJpbmcpLmFwcGVuZENvZGVibG9jayAmJiAodGhpbmcgYXMgdnNjb2RlLk1hcmtkb3duU3RyaW5nKS5hcHBlbmRNYXJrZG93biAmJiAodGhpbmcgYXMgdnNjb2RlLk1hcmtkb3duU3RyaW5nKS5hcHBlbmRUZXh0ICYmICgodGhpbmcgYXMgdnNjb2RlLk1hcmtkb3duU3RyaW5nKS52YWx1ZSAhPT0gdW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHZhbHVlPzogc3RyaW5nLCBzdXBwb3J0VGhlbWVJY29uczogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0dGhpcy4jZGVsZWdhdGUgPSBuZXcgQmFzZU1hcmtkb3duU3RyaW5nKHZhbHVlLCB7IHN1cHBvcnRUaGVtZUljb25zIH0pO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuI2RlbGVnYXRlLnZhbHVlO1xuXHR9XG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy4jZGVsZWdhdGUudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBpc1RydXN0ZWQoKTogYm9vbGVhbiB8IE1hcmtkb3duU3RyaW5nVHJ1c3RlZE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS5pc1RydXN0ZWQ7XG5cdH1cblxuXHRzZXQgaXNUcnVzdGVkKHZhbHVlOiBib29sZWFuIHwgTWFya2Rvd25TdHJpbmdUcnVzdGVkT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuI2RlbGVnYXRlLmlzVHJ1c3RlZCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRUaGVtZUljb25zKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS5zdXBwb3J0VGhlbWVJY29ucztcblx0fVxuXG5cdHNldCBzdXBwb3J0VGhlbWVJY29ucyh2YWx1ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuI2RlbGVnYXRlLnN1cHBvcnRUaGVtZUljb25zID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgc3VwcG9ydEh0bWwoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI2RlbGVnYXRlLnN1cHBvcnRIdG1sO1xuXHR9XG5cblx0c2V0IHN1cHBvcnRIdG1sKHZhbHVlOiBib29sZWFuIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy4jZGVsZWdhdGUuc3VwcG9ydEh0bWwgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBzdXBwb3J0QWxlcnRTeW50YXgoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI2RlbGVnYXRlLnN1cHBvcnRBbGVydFN5bnRheDtcblx0fVxuXG5cdHNldCBzdXBwb3J0QWxlcnRTeW50YXgodmFsdWU6IGJvb2xlYW4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5zdXBwb3J0QWxlcnRTeW50YXggPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBiYXNlVXJpKCk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS5iYXNlVXJpO1xuXHR9XG5cblx0c2V0IGJhc2VVcmkodmFsdWU6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5iYXNlVXJpID0gdmFsdWU7XG5cdH1cblxuXHRhcHBlbmRUZXh0KHZhbHVlOiBzdHJpbmcpOiB2c2NvZGUuTWFya2Rvd25TdHJpbmcge1xuXHRcdHRoaXMuI2RlbGVnYXRlLmFwcGVuZFRleHQodmFsdWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXBwZW5kTWFya2Rvd24odmFsdWU6IHN0cmluZyk6IHZzY29kZS5NYXJrZG93blN0cmluZyB7XG5cdFx0dGhpcy4jZGVsZWdhdGUuYXBwZW5kTWFya2Rvd24odmFsdWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXBwZW5kQ29kZWJsb2NrKHZhbHVlOiBzdHJpbmcsIGxhbmd1YWdlPzogc3RyaW5nKTogdnNjb2RlLk1hcmtkb3duU3RyaW5nIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5hcHBlbmRDb2RlYmxvY2sobGFuZ3VhZ2UgPz8gJycsIHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQU1BLFNBQVMsa0JBQWtCLDBCQUF3RDtBQUNuRixTQUFTLHNCQUFzQjtBQUd4QixJQUFNLGlCQUFOLE1BQXNEO0FBQUEsRUFjNUQsWUFBWSxPQUFnQixvQkFBNkIsT0FBTztBQVpoRSx1QkFBUztBQWFSLHVCQUFLLFdBQVksSUFBSSxtQkFBbUIsT0FBTyxFQUFFLGtCQUFrQixDQUFDO0FBQUEsRUFDckU7QUFBQSxFQVpBLE9BQU8saUJBQWlCLE9BQWdEO0FBQ3ZFLFFBQUksaUJBQWlCLGdCQUFnQjtBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBUSxNQUFnQyxtQkFBb0IsTUFBZ0Msa0JBQW1CLE1BQWdDLGNBQWdCLE1BQWdDLFVBQVU7QUFBQSxFQUMxTTtBQUFBLEVBTUEsSUFBSSxRQUFnQjtBQUNuQixXQUFPLG1CQUFLLFdBQVU7QUFBQSxFQUN2QjtBQUFBLEVBQ0EsSUFBSSxNQUFNLE9BQWU7QUFDeEIsdUJBQUssV0FBVSxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUVBLElBQUksWUFBZ0U7QUFDbkUsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksVUFBVSxPQUEyRDtBQUN4RSx1QkFBSyxXQUFVLFlBQVk7QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBSSxvQkFBeUM7QUFDNUMsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksa0JBQWtCLE9BQTRCO0FBQ2pELHVCQUFLLFdBQVUsb0JBQW9CO0FBQUEsRUFDcEM7QUFBQSxFQUVBLElBQUksY0FBbUM7QUFDdEMsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksWUFBWSxPQUE0QjtBQUMzQyx1QkFBSyxXQUFVLGNBQWM7QUFBQSxFQUM5QjtBQUFBLEVBRUEsSUFBSSxxQkFBMEM7QUFDN0MsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksbUJBQW1CLE9BQTRCO0FBQ2xELHVCQUFLLFdBQVUscUJBQXFCO0FBQUEsRUFDckM7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksUUFBUSxPQUErQjtBQUMxQyx1QkFBSyxXQUFVLFVBQVU7QUFBQSxFQUMxQjtBQUFBLEVBRUEsV0FBVyxPQUFzQztBQUNoRCx1QkFBSyxXQUFVLFdBQVcsS0FBSztBQUMvQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZUFBZSxPQUFzQztBQUNwRCx1QkFBSyxXQUFVLGVBQWUsS0FBSztBQUNuQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZ0JBQWdCLE9BQWUsVUFBMEM7QUFDeEUsdUJBQUssV0FBVSxnQkFBZ0IsWUFBWSxJQUFJLEtBQUs7QUFDcEQsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTdFVTtBQUZHLGlCQUFOO0FBQUEsRUFETjtBQUFBLEdBQ1k7IiwKICAibmFtZXMiOiBbXQp9Cg==
