class ExplorerFileNestingTrie {
  constructor(config) {
    this.root = new PreTrie();
    for (const [parentPattern, childPatterns] of config) {
      for (const childPattern of childPatterns) {
        this.root.add(parentPattern, childPattern);
      }
    }
  }
  toString() {
    return this.root.toString();
  }
  getAttributes(filename, dirname) {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot < 1) {
      return {
        dirname,
        basename: filename,
        extname: ""
      };
    } else {
      return {
        dirname,
        basename: filename.substring(0, lastDot),
        extname: filename.substring(lastDot + 1)
      };
    }
  }
  nest(files, dirname) {
    const parentFinder = new PreTrie();
    for (const potentialParent of files) {
      const attributes = this.getAttributes(potentialParent, dirname);
      const children = this.root.get(potentialParent, attributes);
      for (const child of children) {
        parentFinder.add(child, potentialParent);
      }
    }
    const findAllRootAncestors = (file, seen = /* @__PURE__ */ new Set()) => {
      if (seen.has(file)) {
        return [];
      }
      seen.add(file);
      const attributes = this.getAttributes(file, dirname);
      const ancestors = parentFinder.get(file, attributes);
      if (ancestors.length === 0) {
        return [file];
      }
      if (ancestors.length === 1 && ancestors[0] === file) {
        return [file];
      }
      return ancestors.flatMap((a) => findAllRootAncestors(a, seen));
    };
    const result = /* @__PURE__ */ new Map();
    for (const file of files) {
      let ancestors = findAllRootAncestors(file);
      if (ancestors.length === 0) {
        ancestors = [file];
      }
      for (const ancestor of ancestors) {
        let existing = result.get(ancestor);
        if (!existing) {
          result.set(ancestor, existing = /* @__PURE__ */ new Set());
        }
        if (file !== ancestor) {
          existing.add(file);
        }
      }
    }
    return result;
  }
}
class PreTrie {
  constructor() {
    this.value = new SufTrie();
    this.map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    if (key === "") {
      this.value.add(key, value);
    } else if (key[0] === "*") {
      this.value.add(key, value);
    } else {
      const head = key[0];
      const rest = key.slice(1);
      let existing = this.map.get(head);
      if (!existing) {
        this.map.set(head, existing = new PreTrie());
      }
      existing.add(rest, value);
    }
  }
  get(key, attributes) {
    const results = [];
    results.push(...this.value.get(key, attributes));
    const head = key[0];
    const rest = key.slice(1);
    const existing = this.map.get(head);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }
    return results;
  }
  toString(indentation = "") {
    const lines = [];
    if (this.value.hasItems) {
      lines.push("* => \n" + this.value.toString(indentation + "  "));
    }
    [...this.map.entries()].map(([key, trie]) => lines.push("^" + key + " => \n" + trie.toString(indentation + "  ")));
    return lines.map((l) => indentation + l).join("\n");
  }
}
class SufTrie {
  constructor() {
    this.star = [];
    this.epsilon = [];
    this.map = /* @__PURE__ */ new Map();
    this.hasItems = false;
  }
  add(key, value) {
    this.hasItems = true;
    if (key === "*") {
      this.star.push(new SubstitutionString(value));
    } else if (key === "") {
      this.epsilon.push(new SubstitutionString(value));
    } else {
      const tail = key[key.length - 1];
      const rest = key.slice(0, key.length - 1);
      if (tail === "*") {
        throw Error("Unexpected star in SufTrie key: " + key);
      } else {
        let existing = this.map.get(tail);
        if (!existing) {
          this.map.set(tail, existing = new SufTrie());
        }
        existing.add(rest, value);
      }
    }
  }
  get(key, attributes) {
    const results = [];
    if (key === "") {
      results.push(...this.epsilon.map((ss) => ss.substitute(attributes)));
    }
    if (this.star.length) {
      results.push(...this.star.map((ss) => ss.substitute(attributes, key)));
    }
    const tail = key[key.length - 1];
    const rest = key.slice(0, key.length - 1);
    const existing = this.map.get(tail);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }
    return results;
  }
  toString(indentation = "") {
    const lines = [];
    if (this.star.length) {
      lines.push("* => " + this.star.join("; "));
    }
    if (this.epsilon.length) {
      lines.push("\u03B5 => " + this.epsilon.join("; "));
    }
    [...this.map.entries()].map(([key, trie]) => lines.push(key + "$ => \n" + trie.toString(indentation + "  ")));
    return lines.map((l) => indentation + l).join("\n");
  }
}
var SubstitutionType = /* @__PURE__ */ ((SubstitutionType2) => {
  SubstitutionType2["capture"] = "capture";
  SubstitutionType2["basename"] = "basename";
  SubstitutionType2["dirname"] = "dirname";
  SubstitutionType2["extname"] = "extname";
  return SubstitutionType2;
})(SubstitutionType || {});
const substitutionStringTokenizer = /\$[({](capture|basename|dirname|extname)[)}]/g;
class SubstitutionString {
  constructor(pattern) {
    this.tokens = [];
    substitutionStringTokenizer.lastIndex = 0;
    let token;
    let lastIndex = 0;
    while (token = substitutionStringTokenizer.exec(pattern)) {
      const prefix = pattern.slice(lastIndex, token.index);
      this.tokens.push(prefix);
      const type = token[1];
      switch (type) {
        case "basename" /* basename */:
        case "dirname" /* dirname */:
        case "extname" /* extname */:
        case "capture" /* capture */:
          this.tokens.push({ capture: type });
          break;
        default:
          throw Error("unknown substitution type: " + type);
      }
      lastIndex = token.index + token[0].length;
    }
    if (lastIndex !== pattern.length) {
      const suffix = pattern.slice(lastIndex, pattern.length);
      this.tokens.push(suffix);
    }
  }
  substitute(attributes, capture) {
    return this.tokens.map((t) => {
      if (typeof t === "string") {
        return t;
      }
      switch (t.capture) {
        case "basename" /* basename */:
          return attributes.basename;
        case "dirname" /* dirname */:
          return attributes.dirname;
        case "extname" /* extname */:
          return attributes.extname;
        case "capture" /* capture */:
          return capture || "";
      }
    }).join("");
  }
}
export {
  ExplorerFileNestingTrie,
  PreTrie,
  SufTrie
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxjb21tb25cXGV4cGxvcmVyRmlsZU5lc3RpbmdUcmllLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxudHlwZSBGaWxlbmFtZUF0dHJpYnV0ZXMgPSB7XG5cdC8vIGluZGV4LnRlc3QgaW4gaW5kZXgudGVzdC5qc29uXG5cdGJhc2VuYW1lOiBzdHJpbmc7XG5cdC8vIGpzb24gaW4gaW5kZXgudGVzdC5qc29uXG5cdGV4dG5hbWU6IHN0cmluZztcblx0Ly8gbXktZm9sZGVyIGluIG15LWZvbGRlci9pbmRleC50ZXN0Lmpzb25cblx0ZGlybmFtZTogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBBIHNvcnQgb2YgZG91YmxlLWVuZGVkIHRyaWUsIHVzZWQgdG8gZWZmaWNpZW50bHkgcXVlcnkgZm9yIG1hdGNoZXMgdG8gXCJzdGFyXCIgcGF0dGVybnMsIHdoZXJlXG4gKiBhIGdpdmVuIGtleSByZXByZXNlbnRzIGEgcGFyZW50IGFuZCBtYXkgY29udGFpbiBhIGNhcHR1cmluZyBncm91cCAoXCIqXCIpLCB3aGljaCBjYW4gdGhlbiBiZVxuICogcmVmZXJlbmNlZCB2aWEgdGhlIHRva2VuIFwiJChjYXB0dXJlKVwiIGluIGFzc29jaWF0ZWQgY2hpbGQgcGF0dGVybnMuXG4gKlxuICogVGhlIGdlbmVyYXRlZCB0cmVlIHdpbGwgaGF2ZSBhdCBtb3N0IHR3byBsZXZlbHMsIGFzIHN1YnRyZWVzIGFyZSBmbGF0dGVuZWQgcmF0aGVyIHRoYW4gbmVzdGVkLlxuICpcbiAqIEV4YW1wbGU6XG4gKiBUaGUgY29uZmlnOiBbXG4gKiBbICoudHMgLCBbICQoY2FwdHVyZSkuKi50cyA7ICQoY2FwdHVyZSkuanMgXSBdXG4gKiBbICouanMgLCBbICQoY2FwdHVyZSkubWluLmpzIF0gXSBdXG4gKiBOZXN0cyB0aGUgZmlsZXM6IFsgYS50cyA7IGEuZC50cyA7IGEuanMgOyBhLm1pbi5qcyA7IGIudHMgOyBiLm1pbi5qcyBdXG4gKiBBczpcbiAqIC0gYS50cyA9PiBbIGEuZC50cyA7IGEuanMgOyBhLm1pbi5qcyBdXG4gKiAtIGIudHMgPT4gWyBdXG4gKiAtIGIubWluLnRzID0+IFsgXVxuICovXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUge1xuXHRwcml2YXRlIHJvb3QgPSBuZXcgUHJlVHJpZSgpO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZzogW3N0cmluZywgc3RyaW5nW11dW10pIHtcblx0XHRmb3IgKGNvbnN0IFtwYXJlbnRQYXR0ZXJuLCBjaGlsZFBhdHRlcm5zXSBvZiBjb25maWcpIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGRQYXR0ZXJuIG9mIGNoaWxkUGF0dGVybnMpIHtcblx0XHRcdFx0dGhpcy5yb290LmFkZChwYXJlbnRQYXR0ZXJuLCBjaGlsZFBhdHRlcm4pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRvU3RyaW5nKCkge1xuXHRcdHJldHVybiB0aGlzLnJvb3QudG9TdHJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXR0cmlidXRlcyhmaWxlbmFtZTogc3RyaW5nLCBkaXJuYW1lOiBzdHJpbmcpOiBGaWxlbmFtZUF0dHJpYnV0ZXMge1xuXHRcdGNvbnN0IGxhc3REb3QgPSBmaWxlbmFtZS5sYXN0SW5kZXhPZignLicpO1xuXHRcdGlmIChsYXN0RG90IDwgMSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlybmFtZSxcblx0XHRcdFx0YmFzZW5hbWU6IGZpbGVuYW1lLFxuXHRcdFx0XHRleHRuYW1lOiAnJ1xuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlybmFtZSxcblx0XHRcdFx0YmFzZW5hbWU6IGZpbGVuYW1lLnN1YnN0cmluZygwLCBsYXN0RG90KSxcblx0XHRcdFx0ZXh0bmFtZTogZmlsZW5hbWUuc3Vic3RyaW5nKGxhc3REb3QgKyAxKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRuZXN0KGZpbGVzOiBzdHJpbmdbXSwgZGlybmFtZTogc3RyaW5nKTogTWFwPHN0cmluZywgU2V0PHN0cmluZz4+IHtcblx0XHRjb25zdCBwYXJlbnRGaW5kZXIgPSBuZXcgUHJlVHJpZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBwb3RlbnRpYWxQYXJlbnQgb2YgZmlsZXMpIHtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSB0aGlzLmdldEF0dHJpYnV0ZXMocG90ZW50aWFsUGFyZW50LCBkaXJuYW1lKTtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy5yb290LmdldChwb3RlbnRpYWxQYXJlbnQsIGF0dHJpYnV0ZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRwYXJlbnRGaW5kZXIuYWRkKGNoaWxkLCBwb3RlbnRpYWxQYXJlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRBbGxSb290QW5jZXN0b3JzID0gKGZpbGU6IHN0cmluZywgc2VlbjogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCkpOiBzdHJpbmdbXSA9PiB7XG5cdFx0XHRpZiAoc2Vlbi5oYXMoZmlsZSkpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRzZWVuLmFkZChmaWxlKTtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSB0aGlzLmdldEF0dHJpYnV0ZXMoZmlsZSwgZGlybmFtZSk7XG5cdFx0XHRjb25zdCBhbmNlc3RvcnMgPSBwYXJlbnRGaW5kZXIuZ2V0KGZpbGUsIGF0dHJpYnV0ZXMpO1xuXHRcdFx0aWYgKGFuY2VzdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIFtmaWxlXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFuY2VzdG9ycy5sZW5ndGggPT09IDEgJiYgYW5jZXN0b3JzWzBdID09PSBmaWxlKSB7XG5cdFx0XHRcdHJldHVybiBbZmlsZV07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhbmNlc3RvcnMuZmxhdE1hcChhID0+IGZpbmRBbGxSb290QW5jZXN0b3JzKGEsIHNlZW4pKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0bGV0IGFuY2VzdG9ycyA9IGZpbmRBbGxSb290QW5jZXN0b3JzKGZpbGUpO1xuXHRcdFx0aWYgKGFuY2VzdG9ycy5sZW5ndGggPT09IDApIHsgYW5jZXN0b3JzID0gW2ZpbGVdOyB9XG5cdFx0XHRmb3IgKGNvbnN0IGFuY2VzdG9yIG9mIGFuY2VzdG9ycykge1xuXHRcdFx0XHRsZXQgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGFuY2VzdG9yKTtcblx0XHRcdFx0aWYgKCFleGlzdGluZykgeyByZXN1bHQuc2V0KGFuY2VzdG9yLCBleGlzdGluZyA9IG5ldyBTZXQoKSk7IH1cblx0XHRcdFx0aWYgKGZpbGUgIT09IGFuY2VzdG9yKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmcuYWRkKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLyoqIEV4cG9ydCBmb3IgdGVzdCBvbmx5LiAqL1xuZXhwb3J0IGNsYXNzIFByZVRyaWUge1xuXHRwcml2YXRlIHZhbHVlOiBTdWZUcmllID0gbmV3IFN1ZlRyaWUoKTtcblxuXHRwcml2YXRlIG1hcDogTWFwPHN0cmluZywgUHJlVHJpZT4gPSBuZXcgTWFwKCk7XG5cblx0YWRkKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKGtleSA9PT0gJycpIHtcblx0XHRcdHRoaXMudmFsdWUuYWRkKGtleSwgdmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoa2V5WzBdID09PSAnKicpIHtcblx0XHRcdHRoaXMudmFsdWUuYWRkKGtleSwgdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBoZWFkID0ga2V5WzBdO1xuXHRcdFx0Y29uc3QgcmVzdCA9IGtleS5zbGljZSgxKTtcblx0XHRcdGxldCBleGlzdGluZyA9IHRoaXMubWFwLmdldChoZWFkKTtcblx0XHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdFx0dGhpcy5tYXAuc2V0KGhlYWQsIGV4aXN0aW5nID0gbmV3IFByZVRyaWUoKSk7XG5cdFx0XHR9XG5cdFx0XHRleGlzdGluZy5hZGQocmVzdCwgdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IHN0cmluZywgYXR0cmlidXRlczogRmlsZW5hbWVBdHRyaWJ1dGVzKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdHM6IHN0cmluZ1tdID0gW107XG5cdFx0cmVzdWx0cy5wdXNoKC4uLnRoaXMudmFsdWUuZ2V0KGtleSwgYXR0cmlidXRlcykpO1xuXG5cdFx0Y29uc3QgaGVhZCA9IGtleVswXTtcblx0XHRjb25zdCByZXN0ID0ga2V5LnNsaWNlKDEpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5tYXAuZ2V0KGhlYWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmVzdWx0cy5wdXNoKC4uLmV4aXN0aW5nLmdldChyZXN0LCBhdHRyaWJ1dGVzKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHR0b1N0cmluZyhpbmRlbnRhdGlvbiA9ICcnKTogc3RyaW5nIHtcblx0XHRjb25zdCBsaW5lcyA9IFtdO1xuXHRcdGlmICh0aGlzLnZhbHVlLmhhc0l0ZW1zKSB7XG5cdFx0XHRsaW5lcy5wdXNoKCcqID0+IFxcbicgKyB0aGlzLnZhbHVlLnRvU3RyaW5nKGluZGVudGF0aW9uICsgJyAgJykpO1xuXHRcdH1cblx0XHRbLi4udGhpcy5tYXAuZW50cmllcygpXS5tYXAoKFtrZXksIHRyaWVdKSA9PlxuXHRcdFx0bGluZXMucHVzaCgnXicgKyBrZXkgKyAnID0+IFxcbicgKyB0cmllLnRvU3RyaW5nKGluZGVudGF0aW9uICsgJyAgJykpKTtcblx0XHRyZXR1cm4gbGluZXMubWFwKGwgPT4gaW5kZW50YXRpb24gKyBsKS5qb2luKCdcXG4nKTtcblx0fVxufVxuXG4vKiogRXhwb3J0IGZvciB0ZXN0IG9ubHkuICovXG5leHBvcnQgY2xhc3MgU3VmVHJpZSB7XG5cdHByaXZhdGUgc3RhcjogU3Vic3RpdHV0aW9uU3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBlcHNpbG9uOiBTdWJzdGl0dXRpb25TdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgbWFwOiBNYXA8c3RyaW5nLCBTdWZUcmllPiA9IG5ldyBNYXAoKTtcblx0aGFzSXRlbXM6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRhZGQoa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmhhc0l0ZW1zID0gdHJ1ZTtcblx0XHRpZiAoa2V5ID09PSAnKicpIHtcblx0XHRcdHRoaXMuc3Rhci5wdXNoKG5ldyBTdWJzdGl0dXRpb25TdHJpbmcodmFsdWUpKTtcblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJycpIHtcblx0XHRcdHRoaXMuZXBzaWxvbi5wdXNoKG5ldyBTdWJzdGl0dXRpb25TdHJpbmcodmFsdWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdGFpbCA9IGtleVtrZXkubGVuZ3RoIC0gMV07XG5cdFx0XHRjb25zdCByZXN0ID0ga2V5LnNsaWNlKDAsIGtleS5sZW5ndGggLSAxKTtcblx0XHRcdGlmICh0YWlsID09PSAnKicpIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ1VuZXhwZWN0ZWQgc3RhciBpbiBTdWZUcmllIGtleTogJyArIGtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgZXhpc3RpbmcgPSB0aGlzLm1hcC5nZXQodGFpbCk7XG5cdFx0XHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdFx0XHR0aGlzLm1hcC5zZXQodGFpbCwgZXhpc3RpbmcgPSBuZXcgU3VmVHJpZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleGlzdGluZy5hZGQocmVzdCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IHN0cmluZywgYXR0cmlidXRlczogRmlsZW5hbWVBdHRyaWJ1dGVzKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGtleSA9PT0gJycpIHtcblx0XHRcdHJlc3VsdHMucHVzaCguLi50aGlzLmVwc2lsb24ubWFwKHNzID0+IHNzLnN1YnN0aXR1dGUoYXR0cmlidXRlcykpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3Rhci5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdHMucHVzaCguLi50aGlzLnN0YXIubWFwKHNzID0+IHNzLnN1YnN0aXR1dGUoYXR0cmlidXRlcywga2V5KSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhaWwgPSBrZXlba2V5Lmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IHJlc3QgPSBrZXkuc2xpY2UoMCwga2V5Lmxlbmd0aCAtIDEpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5tYXAuZ2V0KHRhaWwpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmVzdWx0cy5wdXNoKC4uLmV4aXN0aW5nLmdldChyZXN0LCBhdHRyaWJ1dGVzKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHR0b1N0cmluZyhpbmRlbnRhdGlvbiA9ICcnKTogc3RyaW5nIHtcblx0XHRjb25zdCBsaW5lcyA9IFtdO1xuXHRcdGlmICh0aGlzLnN0YXIubGVuZ3RoKSB7XG5cdFx0XHRsaW5lcy5wdXNoKCcqID0+ICcgKyB0aGlzLnN0YXIuam9pbignOyAnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXBzaWxvbi5sZW5ndGgpIHtcblx0XHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdFx0bGluZXMucHVzaCgnXHUwM0I1ID0+ICcgKyB0aGlzLmVwc2lsb24uam9pbignOyAnKSk7XG5cdFx0fVxuXG5cdFx0Wy4uLnRoaXMubWFwLmVudHJpZXMoKV0ubWFwKChba2V5LCB0cmllXSkgPT5cblx0XHRcdGxpbmVzLnB1c2goa2V5ICsgJyQnICsgJyA9PiBcXG4nICsgdHJpZS50b1N0cmluZyhpbmRlbnRhdGlvbiArICcgICcpKSk7XG5cblx0XHRyZXR1cm4gbGluZXMubWFwKGwgPT4gaW5kZW50YXRpb24gKyBsKS5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIFN1YnN0aXR1dGlvblR5cGUge1xuXHRjYXB0dXJlID0gJ2NhcHR1cmUnLFxuXHRiYXNlbmFtZSA9ICdiYXNlbmFtZScsXG5cdGRpcm5hbWUgPSAnZGlybmFtZScsXG5cdGV4dG5hbWUgPSAnZXh0bmFtZScsXG59XG5cbmNvbnN0IHN1YnN0aXR1dGlvblN0cmluZ1Rva2VuaXplciA9IC9cXCRbKHtdKGNhcHR1cmV8YmFzZW5hbWV8ZGlybmFtZXxleHRuYW1lKVspfV0vZztcblxuY2xhc3MgU3Vic3RpdHV0aW9uU3RyaW5nIHtcblxuXHRwcml2YXRlIHRva2VuczogKHN0cmluZyB8IHsgY2FwdHVyZTogU3Vic3RpdHV0aW9uVHlwZSB9KVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocGF0dGVybjogc3RyaW5nKSB7XG5cdFx0c3Vic3RpdHV0aW9uU3RyaW5nVG9rZW5pemVyLmxhc3RJbmRleCA9IDA7XG5cdFx0bGV0IHRva2VuO1xuXHRcdGxldCBsYXN0SW5kZXggPSAwO1xuXHRcdHdoaWxlICh0b2tlbiA9IHN1YnN0aXR1dGlvblN0cmluZ1Rva2VuaXplci5leGVjKHBhdHRlcm4pKSB7XG5cdFx0XHRjb25zdCBwcmVmaXggPSBwYXR0ZXJuLnNsaWNlKGxhc3RJbmRleCwgdG9rZW4uaW5kZXgpO1xuXHRcdFx0dGhpcy50b2tlbnMucHVzaChwcmVmaXgpO1xuXG5cdFx0XHRjb25zdCB0eXBlID0gdG9rZW5bMV07XG5cdFx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmJhc2VuYW1lOlxuXHRcdFx0XHRjYXNlIFN1YnN0aXR1dGlvblR5cGUuZGlybmFtZTpcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmV4dG5hbWU6XG5cdFx0XHRcdGNhc2UgU3Vic3RpdHV0aW9uVHlwZS5jYXB0dXJlOlxuXHRcdFx0XHRcdHRoaXMudG9rZW5zLnB1c2goeyBjYXB0dXJlOiB0eXBlIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OiB0aHJvdyBFcnJvcigndW5rbm93biBzdWJzdGl0dXRpb24gdHlwZTogJyArIHR5cGUpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdEluZGV4ID0gdG9rZW4uaW5kZXggKyB0b2tlblswXS5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RJbmRleCAhPT0gcGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHN1ZmZpeCA9IHBhdHRlcm4uc2xpY2UobGFzdEluZGV4LCBwYXR0ZXJuLmxlbmd0aCk7XG5cdFx0XHR0aGlzLnRva2Vucy5wdXNoKHN1ZmZpeCk7XG5cdFx0fVxuXHR9XG5cblx0c3Vic3RpdHV0ZShhdHRyaWJ1dGVzOiBGaWxlbmFtZUF0dHJpYnV0ZXMsIGNhcHR1cmU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnRva2Vucy5tYXAodCA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIHQgPT09ICdzdHJpbmcnKSB7IHJldHVybiB0OyB9XG5cdFx0XHRzd2l0Y2ggKHQuY2FwdHVyZSkge1xuXHRcdFx0XHRjYXNlIFN1YnN0aXR1dGlvblR5cGUuYmFzZW5hbWU6IHJldHVybiBhdHRyaWJ1dGVzLmJhc2VuYW1lO1xuXHRcdFx0XHRjYXNlIFN1YnN0aXR1dGlvblR5cGUuZGlybmFtZTogcmV0dXJuIGF0dHJpYnV0ZXMuZGlybmFtZTtcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmV4dG5hbWU6IHJldHVybiBhdHRyaWJ1dGVzLmV4dG5hbWU7XG5cdFx0XHRcdGNhc2UgU3Vic3RpdHV0aW9uVHlwZS5jYXB0dXJlOiByZXR1cm4gY2FwdHVyZSB8fCAnJztcblx0XHRcdH1cblx0XHR9KS5qb2luKCcnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBK0JPLE1BQU0sd0JBQXdCO0FBQUEsRUFHcEMsWUFBWSxRQUE4QjtBQUYxQyxTQUFRLE9BQU8sSUFBSSxRQUFRO0FBRzFCLGVBQVcsQ0FBQyxlQUFlLGFBQWEsS0FBSyxRQUFRO0FBQ3BELGlCQUFXLGdCQUFnQixlQUFlO0FBQ3pDLGFBQUssS0FBSyxJQUFJLGVBQWUsWUFBWTtBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFdBQVc7QUFDVixXQUFPLEtBQUssS0FBSyxTQUFTO0FBQUEsRUFDM0I7QUFBQSxFQUVRLGNBQWMsVUFBa0IsU0FBcUM7QUFDNUUsVUFBTSxVQUFVLFNBQVMsWUFBWSxHQUFHO0FBQ3hDLFFBQUksVUFBVSxHQUFHO0FBQ2hCLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxVQUFVO0FBQUEsUUFDVixTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0QsT0FBTztBQUNOLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxVQUFVLFNBQVMsVUFBVSxHQUFHLE9BQU87QUFBQSxRQUN2QyxTQUFTLFNBQVMsVUFBVSxVQUFVLENBQUM7QUFB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
