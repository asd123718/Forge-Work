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
import { memoize } from "./decorators.js";
class LinkedText {
  constructor(nodes) {
    this.nodes = nodes;
  }
  toString() {
    return this.nodes.map((node) => typeof node === "string" ? node : node.label).join("");
  }
}
__decorateClass([
  memoize
], LinkedText.prototype, "toString", 1);
const LINK_REGEX = /\[([^\]]+)\]\(((?:https?:\/\/|command:|file:)[^\)\s]+)(?: (["'])(.+?)(\3))?\)/gi;
function parseLinkedText(text) {
  const result = [];
  let index = 0;
  let match;
  while (match = LINK_REGEX.exec(text)) {
    if (match.index - index > 0) {
      result.push(text.substring(index, match.index));
    }
    const [, label, href, , title] = match;
    if (title) {
      result.push({ label, href, title });
    } else {
      result.push({ label, href });
    }
    index = match.index + match[0].length;
  }
  if (index < text.length) {
    result.push(text.substring(index));
  }
  return new LinkedText(result);
}
export {
  LinkedText,
  parseLinkedText
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGxpbmtlZFRleHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi9kZWNvcmF0b3JzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTGluayB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhyZWY6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIExpbmtlZFRleHROb2RlID0gc3RyaW5nIHwgSUxpbms7XG5cbmV4cG9ydCBjbGFzcyBMaW5rZWRUZXh0IHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBub2RlczogTGlua2VkVGV4dE5vZGVbXSkgeyB9XG5cblx0QG1lbW9pemVcblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5tYXAobm9kZSA9PiB0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycgPyBub2RlIDogbm9kZS5sYWJlbCkuam9pbignJyk7XG5cdH1cbn1cblxuY29uc3QgTElOS19SRUdFWCA9IC9cXFsoW15cXF1dKylcXF1cXCgoKD86aHR0cHM/OlxcL1xcL3xjb21tYW5kOnxmaWxlOilbXlxcKVxcc10rKSg/OiAoW1wiJ10pKC4rPykoXFwzKSk/XFwpL2dpO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaW5rZWRUZXh0KHRleHQ6IHN0cmluZyk6IExpbmtlZFRleHQge1xuXHRjb25zdCByZXN1bHQ6IExpbmtlZFRleHROb2RlW10gPSBbXTtcblxuXHRsZXQgaW5kZXggPSAwO1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cblx0d2hpbGUgKG1hdGNoID0gTElOS19SRUdFWC5leGVjKHRleHQpKSB7XG5cdFx0aWYgKG1hdGNoLmluZGV4IC0gaW5kZXggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh0ZXh0LnN1YnN0cmluZyhpbmRleCwgbWF0Y2guaW5kZXgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBbLCBsYWJlbCwgaHJlZiwgLCB0aXRsZV0gPSBtYXRjaDtcblxuXHRcdGlmICh0aXRsZSkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBsYWJlbCwgaHJlZiwgdGl0bGUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgbGFiZWwsIGhyZWYgfSk7XG5cdFx0fVxuXG5cdFx0aW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcblx0fVxuXG5cdGlmIChpbmRleCA8IHRleHQubGVuZ3RoKSB7XG5cdFx0cmVzdWx0LnB1c2godGV4dC5zdWJzdHJpbmcoaW5kZXgpKTtcblx0fVxuXG5cdHJldHVybiBuZXcgTGlua2VkVGV4dChyZXN1bHQpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQVVqQixNQUFNLFdBQVc7QUFBQSxFQUV2QixZQUFxQixPQUF5QjtBQUF6QjtBQUFBLEVBQTJCO0FBQUEsRUFHaEQsV0FBbUI7QUFDbEIsV0FBTyxLQUFLLE1BQU0sSUFBSSxVQUFRLE9BQU8sU0FBUyxXQUFXLE9BQU8sS0FBSyxLQUFLLEVBQUUsS0FBSyxFQUFFO0FBQUEsRUFDcEY7QUFDRDtBQUhDO0FBQUEsRUFEQztBQUFBLEdBSlcsV0FLWjtBQUtELE1BQU0sYUFBYTtBQUVaLFNBQVMsZ0JBQWdCLE1BQTBCO0FBQ3pELFFBQU0sU0FBMkIsQ0FBQztBQUVsQyxNQUFJLFFBQVE7QUFDWixNQUFJO0FBRUosU0FBTyxRQUFRLFdBQVcsS0FBSyxJQUFJLEdBQUc7QUFDckMsUUFBSSxNQUFNLFFBQVEsUUFBUSxHQUFHO0FBQzVCLGFBQU8sS0FBSyxLQUFLLFVBQVUsT0FBTyxNQUFNLEtBQUssQ0FBQztBQUFBLElBQy9DO0FBRUEsVUFBTSxDQUFDLEVBQUUsT0FBTyxNQUFNLEVBQUUsS0FBSyxJQUFJO0FBRWpDLFFBQUksT0FBTztBQUNWLGFBQU8sS0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUNuQyxPQUFPO0FBQ04sYUFBTyxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFBQSxJQUM1QjtBQUVBLFlBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFO0FBQUEsRUFDaEM7QUFFQSxNQUFJLFFBQVEsS0FBSyxRQUFRO0FBQ3hCLFdBQU8sS0FBSyxLQUFLLFVBQVUsS0FBSyxDQUFDO0FBQUEsRUFDbEM7QUFFQSxTQUFPLElBQUksV0FBVyxNQUFNO0FBQzdCOyIsCiAgIm5hbWVzIjogW10KfQo=
