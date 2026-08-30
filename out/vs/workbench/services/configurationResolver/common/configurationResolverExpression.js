import { Iterable } from "../../../../base/common/iterator.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
const _ConfigurationResolverExpression = class _ConfigurationResolverExpression {
  constructor(object) {
    this.locations = /* @__PURE__ */ new Map();
    /**
     * Callbacks when a new replacement is made, so that nested resolutions from
     * `expr.unresolved()` can be fulfilled in the same iteration.
     */
    this.newReplacementNotifiers = /* @__PURE__ */ new Set();
    if (typeof object === "string") {
      this.stringRoot = true;
      this.root = { value: object };
    } else {
      this.stringRoot = false;
      this.root = structuredClone(object);
    }
  }
  /**
   * Creates a new {@link ConfigurationResolverExpression} from an object.
   * Note that platform-specific keys (i.e. `windows`, `osx`, `linux`) are
   * applied during parsing.
   */
  static parse(object) {
    if (object instanceof _ConfigurationResolverExpression) {
      return object;
    }
    const expr = new _ConfigurationResolverExpression(object);
    expr.applyPlatformSpecificKeys();
    expr.parseObject(expr.root);
    return expr;
  }
  applyPlatformSpecificKeys() {
    const config = this.root;
    const key = isWindows ? "windows" : isMacintosh ? "osx" : isLinux ? "linux" : void 0;
    if (key && config && typeof config === "object" && config.hasOwnProperty(key)) {
      Object.keys(config[key]).forEach((k) => config[k] = config[key][k]);
    }
    delete config.windows;
    delete config.osx;
    delete config.linux;
  }
  parseVariable(str, start) {
    if (str[start] !== "$" || str[start + 1] !== "{") {
      return void 0;
    }
    let end = start + 2;
    let braceCount = 1;
    while (end < str.length) {
      if (str[end] === "{") {
        braceCount++;
      } else if (str[end] === "}") {
        braceCount--;
        if (braceCount === 0) {
          break;
        }
      }
      end++;
    }
    if (braceCount !== 0) {
      return void 0;
    }
    const id = str.slice(start, end + 1);
    const inner = str.substring(start + 2, end);
    const colonIdx = inner.indexOf(":");
    if (colonIdx === -1) {
      return { replacement: { id, name: inner, inner }, end };
    }
    return {
      replacement: {
        id,
        inner,
        name: inner.slice(0, colonIdx),
        arg: inner.slice(colonIdx + 1)
      },
      end
    };
  }
  parseObject(obj) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value === "string") {
          this.parseString(obj, i, value);
        } else {
          this.parseObject(value);
        }
      }
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      this.parseString(obj, key, key, true);
      if (typeof value === "string") {
        this.parseString(obj, key, value);
      } else {
        this.parseObject(value);
      }
    }
  }
  parseString(object, propertyName, value, replaceKeyName, replacementPath) {
    let pos = 0;
    while (pos < value.length) {
      const match = value.indexOf("${", pos);
      if (match === -1) {
        break;
      }
      const parsed = this.parseVariable(value, match);
      if (parsed) {
        pos = parsed.end + 1;
        if (replacementPath?.includes(parsed.replacement.id)) {
          continue;
        }
        const locations = this.locations.get(parsed.replacement.id) || { locations: [], replacement: parsed.replacement };
        const newLocation = { object, propertyName, replaceKeyName };
        locations.locations.push(newLocation);
        this.locations.set(parsed.replacement.id, locations);
        if (locations.resolved) {
          this._resolveAtLocation(parsed.replacement, newLocation, locations.resolved, replacementPath);
        } else {
          this.newReplacementNotifiers.forEach((n) => n(parsed.replacement));
        }
      } else {
        pos = match + 2;
      }
    }
  }
  *unresolved() {
    const newReplacements = /* @__PURE__ */ new Map();
    const notifier = (replacement) => {
      newReplacements.set(replacement.id, replacement);
    };
    for (const location of this.locations.values()) {
      if (location.resolved === void 0) {
        newReplacements.set(location.replacement.id, location.replacement);
      }
    }
    this.newReplacementNotifiers.add(notifier);
    while (true) {
      const next = Iterable.first(newReplacements);
      if (!next) {
        break;
      }
      const [key, value] = next;
      yield value;
      newReplacements.delete(key);
    }
    this.newReplacementNotifiers.delete(notifier);
  }
  resolved() {
    return Iterable.map(Iterable.filter(this.locations.values(), (l) => !!l.resolved), (l) => [l.replacement, l.resolved]);
  }
  resolve(replacement, data) {
    if (typeof data !== "object") {
      data = { value: String(data) };
    }
    const location = this.locations.get(replacement.id);
    if (!location) {
      return;
    }
    location.resolved = data;
    if (data.value !== void 0) {
      for (const l of location.locations || Iterable.empty()) {
        this._resolveAtLocation(replacement, l, data);
      }
    }
  }
  _resolveAtLocation(replacement, { replaceKeyName, propertyName, object }, data, path = []) {
    if (data.value === void 0) {
      return;
    }
    path.push(replacement.id);
    if (replaceKeyName && typeof propertyName === "string") {
      const value = object[propertyName];
      const newKey = propertyName.replaceAll(replacement.id, data.value);
      delete object[propertyName];
      object[newKey] = value;
      this._renameKeyInLocations(object, propertyName, newKey);
      this.parseString(object, newKey, data.value, true, path);
    } else {
      object[propertyName] = object[propertyName].replaceAll(replacement.id, data.value);
      this.parseString(object, propertyName, data.value, false, path);
    }
    path.pop();
  }
  _renameKeyInLocations(obj, oldKey, newKey) {
    for (const location of this.locations.values()) {
      for (const loc of location.locations) {
        if (loc.object === obj && loc.propertyName === oldKey) {
          loc.propertyName = newKey;
        }
      }
    }
  }
  toObject() {
    if (this.stringRoot) {
      return this.root.value;
    }
    return this.root;
  }
};
_ConfigurationResolverExpression.VARIABLE_LHS = "${";
let ConfigurationResolverExpression = _ConfigurationResolverExpression;
export {
  ConfigurationResolverExpression
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXGNvbW1vblxcY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZWRJbnB1dCB9IGZyb20gJy4vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcblxuLyoqIEEgcmVwbGFjZW1lbnQgZm91bmQgaW4gdGhlIG9iamVjdCwgYXMgJHtuYW1lfSBvciAke25hbWU6YXJnfSAqL1xuZXhwb3J0IHR5cGUgUmVwbGFjZW1lbnQgPSB7XG5cdC8qKiAke25hbWU6YXJnfSAqL1xuXHRpZDogc3RyaW5nO1xuXHQvKiogVGhlIGBuYW1lOmFyZ2AgaW4gJHtuYW1lOmFyZ30gKi9cblx0aW5uZXI6IHN0cmluZztcblx0LyoqIFRoZSBgbmFtZWAgaW4gJHtuYW1lOmFyZ30gKi9cblx0bmFtZTogc3RyaW5nO1xuXHQvKiogVGhlIGBhcmdgIGluICR7bmFtZTphcmd9ICovXG5cdGFyZz86IHN0cmluZztcbn07XG5cbmludGVyZmFjZSBJQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbjxUPiB7XG5cdC8qKlxuXHQgKiBHZXRzIHRoZSByZXBsYWNlbWVudHMgd2hpY2ggaGF2ZSBub3QgeWV0IGJlZW5cblx0ICogcmVzb2x2ZWQuXG5cdCAqL1xuXHR1bnJlc29sdmVkKCk6IEl0ZXJhYmxlPFJlcGxhY2VtZW50PjtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgcmVwbGFjZW1lbnRzIHdoaWNoIGhhdmUgYmVlbiByZXNvbHZlZC5cblx0ICovXG5cdHJlc29sdmVkKCk6IEl0ZXJhYmxlPFtSZXBsYWNlbWVudCwgSVJlc29sdmVkVmFsdWVdPjtcblxuXHQvKipcblx0ICogUmVzb2x2ZXMgYSByZXBsYWNlbWVudCBpbnRvIHRoZSBzdHJpbmcgdmFsdWUuXG5cdCAqIElmIHRoZSB2YWx1ZSBpcyB1bmRlZmluZWQsIHRoZSBvcmlnaW5hbCB2YXJpYWJsZSB0ZXh0IHdpbGwgYmUgcHJlc2VydmVkLlxuXHQgKi9cblx0cmVzb2x2ZShyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQsIGRhdGE6IHN0cmluZyB8IElSZXNvbHZlZFZhbHVlKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY29tcGxldGUgb2JqZWN0LiBBbnkgdW5yZXNvbHZlZCByZXBsYWNlbWVudHMgYXJlIGxlZnQgaW50YWN0LlxuXHQgKi9cblx0dG9PYmplY3QoKTogVDtcbn1cblxudHlwZSBQcm9wZXJ0eUxvY2F0aW9uID0ge1xuXHRvYmplY3Q6IGFueTtcblx0cHJvcGVydHlOYW1lOiBzdHJpbmcgfCBudW1iZXI7XG5cdHJlcGxhY2VLZXlOYW1lPzogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkVmFsdWUge1xuXHR2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBQcmVzZW50IHdoZW4gdGhlIHZhcmlhYmxlIGlzIHJlc29sdmVkIGZyb20gYW4gaW5wdXQgZmllbGQuICovXG5cdGlucHV0PzogQ29uZmlndXJlZElucHV0O1xufVxuXG5pbnRlcmZhY2UgSVJlcGxhY2VtZW50TG9jYXRpb24ge1xuXHRyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQ7XG5cdGxvY2F0aW9uczogUHJvcGVydHlMb2NhdGlvbltdO1xuXHRyZXNvbHZlZD86IElSZXNvbHZlZFZhbHVlO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbjxUPiBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uPFQ+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBWQVJJQUJMRV9MSFMgPSAnJHsnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElSZXBsYWNlbWVudExvY2F0aW9uPigpO1xuXHRwcml2YXRlIHJvb3Q6IFQ7XG5cdHByaXZhdGUgc3RyaW5nUm9vdDogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENhbGxiYWNrcyB3aGVuIGEgbmV3IHJlcGxhY2VtZW50IGlzIG1hZGUsIHNvIHRoYXQgbmVzdGVkIHJlc29sdXRpb25zIGZyb21cblx0ICogYGV4cHIudW5yZXNvbHZlZCgpYCBjYW4gYmUgZnVsZmlsbGVkIGluIHRoZSBzYW1lIGl0ZXJhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgbmV3UmVwbGFjZW1lbnROb3RpZmllcnMgPSBuZXcgU2V0PChyOiBSZXBsYWNlbWVudCkgPT4gdm9pZD4oKTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKG9iamVjdDogVCkge1xuXHRcdC8vIElmIHRoZSBpbnB1dCBpcyBhIHN0cmluZywgd3JhcCBpdCBpbiBhbiBvYmplY3Qgc28gd2UgY2FuIHVzZSB0aGUgc2FtZSBsb2dpY1xuXHRcdGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zdHJpbmdSb290ID0gdHJ1ZTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0dGhpcy5yb290ID0geyB2YWx1ZTogb2JqZWN0IH0gYXMgYW55O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0cmluZ1Jvb3QgPSBmYWxzZTtcblx0XHRcdHRoaXMucm9vdCA9IHN0cnVjdHVyZWRDbG9uZShvYmplY3QpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IHtAbGluayBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9ufSBmcm9tIGFuIG9iamVjdC5cblx0ICogTm90ZSB0aGF0IHBsYXRmb3JtLXNwZWNpZmljIGtleXMgKGkuZS4gYHdpbmRvd3NgLCBgb3N4YCwgYGxpbnV4YCkgYXJlXG5cdCAqIGFwcGxpZWQgZHVyaW5nIHBhcnNpbmcuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHBhcnNlPFQ+KG9iamVjdDogVCk6IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248VD4ge1xuXHRcdGlmIChvYmplY3QgaW5zdGFuY2VvZiBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gb2JqZWN0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHIgPSBuZXcgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbjxUPihvYmplY3QpO1xuXHRcdGV4cHIuYXBwbHlQbGF0Zm9ybVNwZWNpZmljS2V5cygpO1xuXHRcdGV4cHIucGFyc2VPYmplY3QoZXhwci5yb290KTtcblx0XHRyZXR1cm4gZXhwcjtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlQbGF0Zm9ybVNwZWNpZmljS2V5cygpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLnJvb3QgYXMgYW55OyAvLyBhbHJlYWR5IGNsb25lZCBieSBjdG9yLCBzYWZlIHRvIGNoYW5nZVxuXHRcdGNvbnN0IGtleSA9IGlzV2luZG93cyA/ICd3aW5kb3dzJyA6IGlzTWFjaW50b3NoID8gJ29zeCcgOiBpc0xpbnV4ID8gJ2xpbnV4JyA6IHVuZGVmaW5lZDtcblxuXHRcdGlmIChrZXkgJiYgY29uZmlnICYmIHR5cGVvZiBjb25maWcgPT09ICdvYmplY3QnICYmIGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRPYmplY3Qua2V5cyhjb25maWdba2V5XSkuZm9yRWFjaChrID0+IGNvbmZpZ1trXSA9IGNvbmZpZ1trZXldW2tdKTtcblx0XHR9XG5cblx0XHRkZWxldGUgY29uZmlnLndpbmRvd3M7XG5cdFx0ZGVsZXRlIGNvbmZpZy5vc3g7XG5cdFx0ZGVsZXRlIGNvbmZpZy5saW51eDtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VWYXJpYWJsZShzdHI6IHN0cmluZywgc3RhcnQ6IG51bWJlcik6IHsgcmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50OyBlbmQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RyW3N0YXJ0XSAhPT0gJyQnIHx8IHN0cltzdGFydCArIDFdICE9PSAneycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGVuZCA9IHN0YXJ0ICsgMjtcblx0XHRsZXQgYnJhY2VDb3VudCA9IDE7XG5cdFx0d2hpbGUgKGVuZCA8IHN0ci5sZW5ndGgpIHtcblx0XHRcdGlmIChzdHJbZW5kXSA9PT0gJ3snKSB7XG5cdFx0XHRcdGJyYWNlQ291bnQrKztcblx0XHRcdH0gZWxzZSBpZiAoc3RyW2VuZF0gPT09ICd9Jykge1xuXHRcdFx0XHRicmFjZUNvdW50LS07XG5cdFx0XHRcdGlmIChicmFjZUNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVuZCsrO1xuXHRcdH1cblxuXHRcdGlmIChicmFjZUNvdW50ICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkID0gc3RyLnNsaWNlKHN0YXJ0LCBlbmQgKyAxKTtcblx0XHRjb25zdCBpbm5lciA9IHN0ci5zdWJzdHJpbmcoc3RhcnQgKyAyLCBlbmQpO1xuXHRcdGNvbnN0IGNvbG9uSWR4ID0gaW5uZXIuaW5kZXhPZignOicpO1xuXHRcdGlmIChjb2xvbklkeCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiB7IHJlcGxhY2VtZW50OiB7IGlkLCBuYW1lOiBpbm5lciwgaW5uZXIgfSwgZW5kIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlcGxhY2VtZW50OiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRpbm5lcixcblx0XHRcdFx0bmFtZTogaW5uZXIuc2xpY2UoMCwgY29sb25JZHgpLFxuXHRcdFx0XHRhcmc6IGlubmVyLnNsaWNlKGNvbG9uSWR4ICsgMSlcblx0XHRcdH0sXG5cdFx0XHRlbmRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZU9iamVjdChvYmo6IGFueSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyB8fCBvYmogPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShvYmopKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9iai5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IG9ialtpXTtcblx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aGlzLnBhcnNlU3RyaW5nKG9iaiwgaSwgdmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucGFyc2VPYmplY3QodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuXHRcdFx0dGhpcy5wYXJzZVN0cmluZyhvYmosIGtleSwga2V5LCB0cnVlKTsgLy8gcGFyc2Uga2V5XG5cblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRoaXMucGFyc2VTdHJpbmcob2JqLCBrZXksIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucGFyc2VPYmplY3QodmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTdHJpbmcob2JqZWN0OiBhbnksIHByb3BlcnR5TmFtZTogc3RyaW5nIHwgbnVtYmVyLCB2YWx1ZTogc3RyaW5nLCByZXBsYWNlS2V5TmFtZT86IGJvb2xlYW4sIHJlcGxhY2VtZW50UGF0aD86IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0bGV0IHBvcyA9IDA7XG5cdFx0d2hpbGUgKHBvcyA8IHZhbHVlLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5pbmRleE9mKCckeycsIHBvcyk7XG5cdFx0XHRpZiAobWF0Y2ggPT09IC0xKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVZhcmlhYmxlKHZhbHVlLCBtYXRjaCk7XG5cdFx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRcdHBvcyA9IHBhcnNlZC5lbmQgKyAxO1xuXHRcdFx0XHRpZiAocmVwbGFjZW1lbnRQYXRoPy5pbmNsdWRlcyhwYXJzZWQucmVwbGFjZW1lbnQuaWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsb2NhdGlvbnMgPSB0aGlzLmxvY2F0aW9ucy5nZXQocGFyc2VkLnJlcGxhY2VtZW50LmlkKSB8fCB7IGxvY2F0aW9uczogW10sIHJlcGxhY2VtZW50OiBwYXJzZWQucmVwbGFjZW1lbnQgfTtcblx0XHRcdFx0Y29uc3QgbmV3TG9jYXRpb246IFByb3BlcnR5TG9jYXRpb24gPSB7IG9iamVjdCwgcHJvcGVydHlOYW1lLCByZXBsYWNlS2V5TmFtZSB9O1xuXHRcdFx0XHRsb2NhdGlvbnMubG9jYXRpb25zLnB1c2gobmV3TG9jYXRpb24pO1xuXHRcdFx0XHR0aGlzLmxvY2F0aW9ucy5zZXQocGFyc2VkLnJlcGxhY2VtZW50LmlkLCBsb2NhdGlvbnMpO1xuXG5cdFx0XHRcdGlmIChsb2NhdGlvbnMucmVzb2x2ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlQXRMb2NhdGlvbihwYXJzZWQucmVwbGFjZW1lbnQsIG5ld0xvY2F0aW9uLCBsb2NhdGlvbnMucmVzb2x2ZWQsIHJlcGxhY2VtZW50UGF0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5uZXdSZXBsYWNlbWVudE5vdGlmaWVycy5mb3JFYWNoKG4gPT4gbihwYXJzZWQucmVwbGFjZW1lbnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cG9zID0gbWF0Y2ggKyAyO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAqdW5yZXNvbHZlZCgpOiBJdGVyYWJsZTxSZXBsYWNlbWVudD4ge1xuXHRcdGNvbnN0IG5ld1JlcGxhY2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBSZXBsYWNlbWVudD4oKTtcblx0XHRjb25zdCBub3RpZmllciA9IChyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQpID0+IHtcblx0XHRcdG5ld1JlcGxhY2VtZW50cy5zZXQocmVwbGFjZW1lbnQuaWQsIHJlcGxhY2VtZW50KTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiB0aGlzLmxvY2F0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGxvY2F0aW9uLnJlc29sdmVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bmV3UmVwbGFjZW1lbnRzLnNldChsb2NhdGlvbi5yZXBsYWNlbWVudC5pZCwgbG9jYXRpb24ucmVwbGFjZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubmV3UmVwbGFjZW1lbnROb3RpZmllcnMuYWRkKG5vdGlmaWVyKTtcblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gSXRlcmFibGUuZmlyc3QobmV3UmVwbGFjZW1lbnRzKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2tleSwgdmFsdWVdID0gbmV4dDtcblx0XHRcdHlpZWxkIHZhbHVlO1xuXHRcdFx0bmV3UmVwbGFjZW1lbnRzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblxuXHRcdHRoaXMubmV3UmVwbGFjZW1lbnROb3RpZmllcnMuZGVsZXRlKG5vdGlmaWVyKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlZCgpOiBJdGVyYWJsZTxbUmVwbGFjZW1lbnQsIElSZXNvbHZlZFZhbHVlXT4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5tYXAoSXRlcmFibGUuZmlsdGVyKHRoaXMubG9jYXRpb25zLnZhbHVlcygpLCBsID0+ICEhbC5yZXNvbHZlZCksIGwgPT4gW2wucmVwbGFjZW1lbnQsIGwucmVzb2x2ZWQhXSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZShyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQsIGRhdGE6IHN0cmluZyB8IElSZXNvbHZlZFZhbHVlKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0ZGF0YSA9IHsgdmFsdWU6IFN0cmluZyhkYXRhKSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5sb2NhdGlvbnMuZ2V0KHJlcGxhY2VtZW50LmlkKTtcblx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bG9jYXRpb24ucmVzb2x2ZWQgPSBkYXRhO1xuXG5cdFx0aWYgKGRhdGEudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yIChjb25zdCBsIG9mIGxvY2F0aW9uLmxvY2F0aW9ucyB8fCBJdGVyYWJsZS5lbXB0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVBdExvY2F0aW9uKHJlcGxhY2VtZW50LCBsLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQXRMb2NhdGlvbihyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQsIHsgcmVwbGFjZUtleU5hbWUsIHByb3BlcnR5TmFtZSwgb2JqZWN0IH06IFByb3BlcnR5TG9jYXRpb24sIGRhdGE6IElSZXNvbHZlZFZhbHVlLCBwYXRoOiBzdHJpbmdbXSA9IFtdKSB7XG5cdFx0aWYgKGRhdGEudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGF2b2lkIHJlY3Vyc2l2ZSByZXNvbHV0aW9uLCBlLmcuICR7ZW52OkZPT30gLT4gJHtlbnY6QkFSfT0ke2VudjpGT099XG5cdFx0cGF0aC5wdXNoKHJlcGxhY2VtZW50LmlkKTtcblxuXHRcdC8vIG5vdGU6IGluIG5lc3RlZCBgdGhpcy5wYXJzZVN0cmluZ2AsIHBhcnNlIG9ubHkgdGhlIG5ldyBzdWJzdHJpbmcgZm9yIGFueSByZXBsYWNlbWVudHMsIGRvbid0IHJlcGFyc2UgdGhlIHdob2xlIHN0cmluZ1xuXHRcdGlmIChyZXBsYWNlS2V5TmFtZSAmJiB0eXBlb2YgcHJvcGVydHlOYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBvYmplY3RbcHJvcGVydHlOYW1lXTtcblx0XHRcdGNvbnN0IG5ld0tleSA9IHByb3BlcnR5TmFtZS5yZXBsYWNlQWxsKHJlcGxhY2VtZW50LmlkLCBkYXRhLnZhbHVlKTtcblx0XHRcdGRlbGV0ZSBvYmplY3RbcHJvcGVydHlOYW1lXTtcblx0XHRcdG9iamVjdFtuZXdLZXldID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9yZW5hbWVLZXlJbkxvY2F0aW9ucyhvYmplY3QsIHByb3BlcnR5TmFtZSwgbmV3S2V5KTtcblx0XHRcdHRoaXMucGFyc2VTdHJpbmcob2JqZWN0LCBuZXdLZXksIGRhdGEudmFsdWUsIHRydWUsIHBhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvYmplY3RbcHJvcGVydHlOYW1lXSA9IG9iamVjdFtwcm9wZXJ0eU5hbWVdLnJlcGxhY2VBbGwocmVwbGFjZW1lbnQuaWQsIGRhdGEudmFsdWUpO1xuXHRcdFx0dGhpcy5wYXJzZVN0cmluZyhvYmplY3QsIHByb3BlcnR5TmFtZSwgZGF0YS52YWx1ZSwgZmFsc2UsIHBhdGgpO1xuXHRcdH1cblxuXHRcdHBhdGgucG9wKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5hbWVLZXlJbkxvY2F0aW9ucyhvYmo6IG9iamVjdCwgb2xkS2V5OiBzdHJpbmcsIG5ld0tleTogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiB0aGlzLmxvY2F0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBsb2Mgb2YgbG9jYXRpb24ubG9jYXRpb25zKSB7XG5cdFx0XHRcdGlmIChsb2Mub2JqZWN0ID09PSBvYmogJiYgbG9jLnByb3BlcnR5TmFtZSA9PT0gb2xkS2V5KSB7XG5cdFx0XHRcdFx0bG9jLnByb3BlcnR5TmFtZSA9IG5ld0tleTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b09iamVjdCgpOiBUIHtcblx0XHQvLyBJZiB3ZSB3cmFwcGVkIGEgc3RyaW5nLCB1bndyYXAgaXRcblx0XHRpZiAodGhpcy5zdHJpbmdSb290KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiAodGhpcy5yb290IGFzIGFueSkudmFsdWUgYXMgVDtcblx0XHR9XG5cblx0XHRyZXR1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
