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
import { URI } from "../../../../base/common/uri.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Position } from "./position.js";
import { Range } from "./range.js";
let Location = class {
  static isLocation(thing) {
    if (thing instanceof Location) {
      return true;
    }
    if (!thing) {
      return false;
    }
    return Range.isRange(thing.range) && URI.isUri(thing.uri);
  }
  constructor(uri, rangeOrPosition) {
    this.uri = uri;
    if (!rangeOrPosition) {
    } else if (Range.isRange(rangeOrPosition)) {
      this.range = Range.of(rangeOrPosition);
    } else if (Position.isPosition(rangeOrPosition)) {
      this.range = new Range(rangeOrPosition, rangeOrPosition);
    } else {
      throw new Error("Illegal argument");
    }
  }
  toJSON() {
    return {
      uri: this.uri,
      range: this.range
    };
  }
};
Location = __decorateClass([
  es5ClassCompat
], Location);
export {
  Location
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXGxvY2F0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi9yYW5nZS5qcyc7XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIExvY2F0aW9uIHtcblxuXHRzdGF0aWMgaXNMb2NhdGlvbih0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHZzY29kZS5Mb2NhdGlvbiB7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgTG9jYXRpb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBSYW5nZS5pc1JhbmdlKCg8TG9jYXRpb24+dGhpbmcpLnJhbmdlKVxuXHRcdFx0JiYgVVJJLmlzVXJpKCg8TG9jYXRpb24+dGhpbmcpLnVyaSk7XG5cdH1cblxuXHR1cmk6IFVSSTtcblx0cmFuZ2UhOiBSYW5nZTtcblxuXHRjb25zdHJ1Y3Rvcih1cmk6IFVSSSwgcmFuZ2VPclBvc2l0aW9uOiBSYW5nZSB8IFBvc2l0aW9uKSB7XG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cblx0XHRpZiAoIXJhbmdlT3JQb3NpdGlvbikge1xuXHRcdFx0Ly90aGF0J3MgT0tcblx0XHR9IGVsc2UgaWYgKFJhbmdlLmlzUmFuZ2UocmFuZ2VPclBvc2l0aW9uKSkge1xuXHRcdFx0dGhpcy5yYW5nZSA9IFJhbmdlLm9mKHJhbmdlT3JQb3NpdGlvbik7XG5cdFx0fSBlbHNlIGlmIChQb3NpdGlvbi5pc1Bvc2l0aW9uKHJhbmdlT3JQb3NpdGlvbikpIHtcblx0XHRcdHRoaXMucmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2VPclBvc2l0aW9uLCByYW5nZU9yUG9zaXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgYXJndW1lbnQnKTtcblx0XHR9XG5cdH1cblxuXHR0b0pTT04oKTogYW55IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiB0aGlzLnVyaSxcblx0XHRcdHJhbmdlOiB0aGlzLnJhbmdlXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQU1BLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFHZixJQUFNLFdBQU4sTUFBZTtBQUFBLEVBRXJCLE9BQU8sV0FBVyxPQUEwQztBQUMzRCxRQUFJLGlCQUFpQixVQUFVO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sTUFBTSxRQUFtQixNQUFPLEtBQUssS0FDeEMsSUFBSSxNQUFpQixNQUFPLEdBQUc7QUFBQSxFQUNwQztBQUFBLEVBS0EsWUFBWSxLQUFVLGlCQUFtQztBQUN4RCxTQUFLLE1BQU07QUFFWCxRQUFJLENBQUMsaUJBQWlCO0FBQUEsSUFFdEIsV0FBVyxNQUFNLFFBQVEsZUFBZSxHQUFHO0FBQzFDLFdBQUssUUFBUSxNQUFNLEdBQUcsZUFBZTtBQUFBLElBQ3RDLFdBQVcsU0FBUyxXQUFXLGVBQWUsR0FBRztBQUNoRCxXQUFLLFFBQVEsSUFBSSxNQUFNLGlCQUFpQixlQUFlO0FBQUEsSUFDeEQsT0FBTztBQUNOLFlBQU0sSUFBSSxNQUFNLGtCQUFrQjtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsU0FBYztBQUNiLFdBQU87QUFBQSxNQUNOLEtBQUssS0FBSztBQUFBLE1BQ1YsT0FBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFDRDtBQXBDYSxXQUFOO0FBQUEsRUFETjtBQUFBLEdBQ1k7IiwKICAibmFtZXMiOiBbXQp9Cg==
