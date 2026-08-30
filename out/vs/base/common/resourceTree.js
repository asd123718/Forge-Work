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
import { PathIterator } from "./ternarySearchTree.js";
import * as paths from "./path.js";
import { extUri as defaultExtUri } from "./resources.js";
import { URI } from "./uri.js";
class Node {
  constructor(uri, relativePath, context, element = void 0, parent = void 0) {
    this.uri = uri;
    this.relativePath = relativePath;
    this.context = context;
    this.element = element;
    this.parent = parent;
    this._children = /* @__PURE__ */ new Map();
  }
  get childrenCount() {
    return this._children.size;
  }
  get children() {
    return this._children.values();
  }
  get name() {
    return paths.posix.basename(this.relativePath);
  }
  get(path) {
    return this._children.get(path);
  }
  set(path, child) {
    this._children.set(path, child);
  }
  delete(path) {
    this._children.delete(path);
  }
  clear() {
    this._children.clear();
  }
}
__decorateClass([
  memoize
], Node.prototype, "name", 1);
function collect(node, result) {
  if (typeof node.element !== "undefined") {
    result.push(node.element);
  }
  for (const child of node.children) {
    collect(child, result);
  }
  return result;
}
class ResourceTree {
  constructor(context, rootURI = URI.file("/"), extUri = defaultExtUri) {
    this.extUri = extUri;
    this.root = new Node(rootURI, "", context);
  }
  static getRoot(node) {
    while (node.parent) {
      node = node.parent;
    }
    return node;
  }
  static collect(node) {
    return collect(node, []);
  }
  static isResourceNode(obj) {
    return obj instanceof Node;
  }
  add(uri, element) {
    const key = this.extUri.relativePath(this.root.uri, uri) || uri.path;
    const iterator = new PathIterator(false).reset(key);
    let node = this.root;
    let path = "";
    while (true) {
      const name = iterator.value();
      path = path + "/" + name;
      let child = node.get(name);
      if (!child) {
        child = new Node(
          this.extUri.joinPath(this.root.uri, path),
          path,
          this.root.context,
          iterator.hasNext() ? void 0 : element,
          node
        );
        node.set(name, child);
      } else if (!iterator.hasNext()) {
        child.element = element;
      }
      node = child;
      if (!iterator.hasNext()) {
        return;
      }
      iterator.next();
    }
  }
  delete(uri) {
    const key = this.extUri.relativePath(this.root.uri, uri) || uri.path;
    const iterator = new PathIterator(false).reset(key);
    return this._delete(this.root, iterator);
  }
  _delete(node, iterator) {
    const name = iterator.value();
    const child = node.get(name);
    if (!child) {
      return void 0;
    }
    if (iterator.hasNext()) {
      const result = this._delete(child, iterator.next());
      if (typeof result !== "undefined" && child.childrenCount === 0) {
        node.delete(name);
      }
      return result;
    }
    node.delete(name);
    return child.element;
  }
  clear() {
    this.root.clear();
  }
  getNode(uri) {
    const key = this.extUri.relativePath(this.root.uri, uri) || uri.path;
    const iterator = new PathIterator(false).reset(key);
    let node = this.root;
    while (true) {
      const name = iterator.value();
      const child = node.get(name);
      if (!child || !iterator.hasNext()) {
        return child;
      }
      node = child;
      iterator.next();
    }
  }
}
export {
  ResourceTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHJlc291cmNlVHJlZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgUGF0aEl0ZXJhdG9yIH0gZnJvbSAnLi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgKiBhcyBwYXRocyBmcm9tICcuL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpIGFzIGRlZmF1bHRFeHRVcmksIElFeHRVcmkgfSBmcm9tICcuL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuL3VyaS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc291cmNlTm9kZTxULCBDID0gdm9pZD4ge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgcmVsYXRpdmVQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZWxlbWVudDogVCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hpbGRyZW46IEl0ZXJhYmxlPElSZXNvdXJjZU5vZGU8VCwgQz4+O1xuXHRyZWFkb25seSBjaGlsZHJlbkNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhcmVudDogSVJlc291cmNlTm9kZTxULCBDPiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udGV4dDogQztcblx0Z2V0KGNoaWxkTmFtZTogc3RyaW5nKTogSVJlc291cmNlTm9kZTxULCBDPiB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgTm9kZTxULCBDPiBpbXBsZW1lbnRzIElSZXNvdXJjZU5vZGU8VCwgQz4ge1xuXG5cdHByaXZhdGUgX2NoaWxkcmVuID0gbmV3IE1hcDxzdHJpbmcsIE5vZGU8VCwgQz4+KCk7XG5cblx0Z2V0IGNoaWxkcmVuQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4uc2l6ZTtcblx0fVxuXG5cdGdldCBjaGlsZHJlbigpOiBJdGVyYWJsZTxOb2RlPFQsIEM+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuLnZhbHVlcygpO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcGF0aHMucG9zaXguYmFzZW5hbWUodGhpcy5yZWxhdGl2ZVBhdGgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgcmVsYXRpdmVQYXRoOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY29udGV4dDogQyxcblx0XHRwdWJsaWMgZWxlbWVudDogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBwYXJlbnQ6IElSZXNvdXJjZU5vZGU8VCwgQz4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWRcblx0KSB7IH1cblxuXHRnZXQocGF0aDogc3RyaW5nKTogTm9kZTxULCBDPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuLmdldChwYXRoKTtcblx0fVxuXG5cdHNldChwYXRoOiBzdHJpbmcsIGNoaWxkOiBOb2RlPFQsIEM+KTogdm9pZCB7XG5cdFx0dGhpcy5fY2hpbGRyZW4uc2V0KHBhdGgsIGNoaWxkKTtcblx0fVxuXG5cdGRlbGV0ZShwYXRoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGlsZHJlbi5kZWxldGUocGF0aCk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGlsZHJlbi5jbGVhcigpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3Q8VCwgQz4obm9kZTogSVJlc291cmNlTm9kZTxULCBDPiwgcmVzdWx0OiBUW10pOiBUW10ge1xuXHRpZiAodHlwZW9mIG5vZGUuZWxlbWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXN1bHQucHVzaChub2RlLmVsZW1lbnQpO1xuXHR9XG5cblx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0Y29sbGVjdChjaGlsZCwgcmVzdWx0KTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZVRyZWU8VCBleHRlbmRzIE5vbk51bGxhYmxlPHVua25vd24+LCBDPiB7XG5cblx0cmVhZG9ubHkgcm9vdDogTm9kZTxULCBDPjtcblxuXHRzdGF0aWMgZ2V0Um9vdDxULCBDPihub2RlOiBJUmVzb3VyY2VOb2RlPFQsIEM+KTogSVJlc291cmNlTm9kZTxULCBDPiB7XG5cdFx0d2hpbGUgKG5vZGUucGFyZW50KSB7XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRzdGF0aWMgY29sbGVjdDxULCBDPihub2RlOiBJUmVzb3VyY2VOb2RlPFQsIEM+KTogVFtdIHtcblx0XHRyZXR1cm4gY29sbGVjdChub2RlLCBbXSk7XG5cdH1cblxuXHRzdGF0aWMgaXNSZXNvdXJjZU5vZGU8VCwgQz4ob2JqOiB1bmtub3duKTogb2JqIGlzIElSZXNvdXJjZU5vZGU8VCwgQz4ge1xuXHRcdHJldHVybiBvYmogaW5zdGFuY2VvZiBOb2RlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogQywgcm9vdFVSSTogVVJJID0gVVJJLmZpbGUoJy8nKSwgcHJpdmF0ZSBleHRVcmk6IElFeHRVcmkgPSBkZWZhdWx0RXh0VXJpKSB7XG5cdFx0dGhpcy5yb290ID0gbmV3IE5vZGUocm9vdFVSSSwgJycsIGNvbnRleHQpO1xuXHR9XG5cblx0YWRkKHVyaTogVVJJLCBlbGVtZW50OiBUKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5leHRVcmkucmVsYXRpdmVQYXRoKHRoaXMucm9vdC51cmksIHVyaSkgfHwgdXJpLnBhdGg7XG5cdFx0Y29uc3QgaXRlcmF0b3IgPSBuZXcgUGF0aEl0ZXJhdG9yKGZhbHNlKS5yZXNldChrZXkpO1xuXHRcdGxldCBub2RlID0gdGhpcy5yb290O1xuXHRcdGxldCBwYXRoID0gJyc7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGl0ZXJhdG9yLnZhbHVlKCk7XG5cdFx0XHRwYXRoID0gcGF0aCArICcvJyArIG5hbWU7XG5cblx0XHRcdGxldCBjaGlsZCA9IG5vZGUuZ2V0KG5hbWUpO1xuXG5cdFx0XHRpZiAoIWNoaWxkKSB7XG5cdFx0XHRcdGNoaWxkID0gbmV3IE5vZGUoXG5cdFx0XHRcdFx0dGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5yb290LnVyaSwgcGF0aCksXG5cdFx0XHRcdFx0cGF0aCxcblx0XHRcdFx0XHR0aGlzLnJvb3QuY29udGV4dCxcblx0XHRcdFx0XHRpdGVyYXRvci5oYXNOZXh0KCkgPyB1bmRlZmluZWQgOiBlbGVtZW50LFxuXHRcdFx0XHRcdG5vZGVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRub2RlLnNldChuYW1lLCBjaGlsZCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpdGVyYXRvci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0Y2hpbGQuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUgPSBjaGlsZDtcblxuXHRcdFx0aWYgKCFpdGVyYXRvci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVyYXRvci5uZXh0KCk7XG5cdFx0fVxuXHR9XG5cblx0ZGVsZXRlKHVyaTogVVJJKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5leHRVcmkucmVsYXRpdmVQYXRoKHRoaXMucm9vdC51cmksIHVyaSkgfHwgdXJpLnBhdGg7XG5cdFx0Y29uc3QgaXRlcmF0b3IgPSBuZXcgUGF0aEl0ZXJhdG9yKGZhbHNlKS5yZXNldChrZXkpO1xuXHRcdHJldHVybiB0aGlzLl9kZWxldGUodGhpcy5yb290LCBpdGVyYXRvcik7XG5cdH1cblxuXHRwcml2YXRlIF9kZWxldGUobm9kZTogTm9kZTxULCBDPiwgaXRlcmF0b3I6IFBhdGhJdGVyYXRvcik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5hbWUgPSBpdGVyYXRvci52YWx1ZSgpO1xuXHRcdGNvbnN0IGNoaWxkID0gbm9kZS5nZXQobmFtZSk7XG5cblx0XHRpZiAoIWNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChpdGVyYXRvci5oYXNOZXh0KCkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RlbGV0ZShjaGlsZCwgaXRlcmF0b3IubmV4dCgpKTtcblxuXHRcdFx0aWYgKHR5cGVvZiByZXN1bHQgIT09ICd1bmRlZmluZWQnICYmIGNoaWxkLmNoaWxkcmVuQ291bnQgPT09IDApIHtcblx0XHRcdFx0bm9kZS5kZWxldGUobmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0bm9kZS5kZWxldGUobmFtZSk7XG5cdFx0cmV0dXJuIGNoaWxkLmVsZW1lbnQ7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLnJvb3QuY2xlYXIoKTtcblx0fVxuXG5cdGdldE5vZGUodXJpOiBVUkkpOiBJUmVzb3VyY2VOb2RlPFQsIEM+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmV4dFVyaS5yZWxhdGl2ZVBhdGgodGhpcy5yb290LnVyaSwgdXJpKSB8fCB1cmkucGF0aDtcblx0XHRjb25zdCBpdGVyYXRvciA9IG5ldyBQYXRoSXRlcmF0b3IoZmFsc2UpLnJlc2V0KGtleSk7XG5cdFx0bGV0IG5vZGUgPSB0aGlzLnJvb3Q7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGl0ZXJhdG9yLnZhbHVlKCk7XG5cdFx0XHRjb25zdCBjaGlsZCA9IG5vZGUuZ2V0KG5hbWUpO1xuXG5cdFx0XHRpZiAoIWNoaWxkIHx8ICFpdGVyYXRvci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXG5cdFx0XHRub2RlID0gY2hpbGQ7XG5cdFx0XHRpdGVyYXRvci5uZXh0KCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksV0FBVztBQUN2QixTQUFTLFVBQVUscUJBQThCO0FBQ2pELFNBQVMsV0FBVztBQWNwQixNQUFNLEtBQTBDO0FBQUEsRUFpQi9DLFlBQ1UsS0FDQSxjQUNBLFNBQ0YsVUFBeUIsUUFDdkIsU0FBMEMsUUFDbEQ7QUFMUTtBQUNBO0FBQ0E7QUFDRjtBQUNFO0FBcEJWLFNBQVEsWUFBWSxvQkFBSSxJQUF3QjtBQUFBLEVBcUI1QztBQUFBLEVBbkJKLElBQUksZ0JBQXdCO0FBQzNCLFdBQU8sS0FBSyxVQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksV0FBaUM7QUFDcEMsV0FBTyxLQUFLLFVBQVUsT0FBTztBQUFBLEVBQzlCO0FBQUEsRUFHQSxJQUFJLE9BQWU7QUFDbEIsV0FBTyxNQUFNLE1BQU0sU0FBUyxLQUFLLFlBQVk7QUFBQSxFQUM5QztB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
