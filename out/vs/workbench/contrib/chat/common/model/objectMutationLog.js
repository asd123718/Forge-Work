import { assertNever } from "../../../../../base/common/assert.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { isUndefinedOrNull } from "../../../../../base/common/types.js";
function prefixError(e, prefix) {
  e.message = prefix + e.message;
  if (e.stack) {
    const nlIdx = e.stack.indexOf("\n");
    e.stack = nlIdx !== -1 ? `${e.name}: ${e.message}${e.stack.slice(nlIdx)}` : `${e.name}: ${e.message}`;
  }
}
function rethrowWithPathSegment(e, segment) {
  if (e instanceof Error) {
    const part = typeof segment === "number" ? `[${segment}]` : `.${segment}`;
    const needsSep = !e.message.startsWith("[") && !e.message.startsWith(".");
    prefixError(e, part + (needsSep ? ": " : ""));
  }
  throw e;
}
var TransformKind = /* @__PURE__ */ ((TransformKind2) => {
  TransformKind2[TransformKind2["Key"] = 0] = "Key";
  TransformKind2[TransformKind2["Primitive"] = 1] = "Primitive";
  TransformKind2[TransformKind2["Array"] = 2] = "Array";
  TransformKind2[TransformKind2["Object"] = 3] = "Object";
  return TransformKind2;
})(TransformKind || {});
function key(comparator) {
  return {
    kind: 0 /* Key */,
    extract: (from) => from,
    equals: comparator ?? ((a, b) => a === b)
  };
}
function value(comparator) {
  return {
    kind: 1 /* Primitive */,
    extract: (from) => {
      let value2 = from;
      if (!!value2 && typeof value2 === "object") {
        value2 = deepCloneWithFallback(value2);
      }
      return value2;
    },
    equals: comparator ?? ((a, b) => a === b)
  };
}
function array(schema) {
  return {
    kind: 2 /* Array */,
    itemSchema: schema,
    extract: (from) => from?.map((item, i) => {
      try {
        return schema.extract(item);
      } catch (e) {
        rethrowWithPathSegment(e, i);
      }
    })
  };
}
function object(schema, options) {
  const entries = Object.entries(schema).sort(([, a], [, b]) => a.kind - b.kind);
  return {
    kind: 3 /* Object */,
    children: entries,
    sealed: options?.sealed,
    extract: (from) => {
      if (isUndefinedOrNull(from)) {
        return from;
      }
      const result = /* @__PURE__ */ Object.create(null);
      for (const [key2, transform] of entries) {
        try {
          result[key2] = transform.extract(from);
        } catch (e) {
          rethrowWithPathSegment(e, key2);
        }
      }
      return result;
    }
  };
}
function t(getter, schema) {
  return {
    ...schema,
    extract: (from) => schema.extract(getter(from))
  };
}
function v(getter, comparator) {
  const inner = value(comparator);
  return {
    ...inner,
    extract: (from) => inner.extract(getter(from))
  };
}
var EntryKind = /* @__PURE__ */ ((EntryKind2) => {
  EntryKind2[EntryKind2["Initial"] = 0] = "Initial";
  EntryKind2[EntryKind2["Set"] = 1] = "Set";
  EntryKind2[EntryKind2["Push"] = 2] = "Push";
  EntryKind2[EntryKind2["Delete"] = 3] = "Delete";
  return EntryKind2;
})(EntryKind || {});
const LF = VSBuffer.fromString("\n");
const PERSIST_ENTRY_MAX_STRING_CHARS = 1 * 1024 * 1024;
const PERSIST_ENTRY_MAX_TOTAL_CHARS = 100 * 1024 * 1024;
const TRUNCATION_MARKER_PREFIX = "[VS Code: value truncated for persistence";
const TRUNCATION_MARKER_TOTAL = `${TRUNCATION_MARKER_PREFIX}; entry exceeded size budget]`;
function stringifyEntryWithFallback(entry) {
  try {
    return JSON.stringify(entry);
  } catch (e) {
    if (!(e instanceof RangeError)) {
      throw e;
    }
    return JSON.stringify(entry, makeTruncatingReplacer(PERSIST_ENTRY_MAX_STRING_CHARS, PERSIST_ENTRY_MAX_TOTAL_CHARS));
  }
}
function deepCloneWithFallback(value2) {
  return JSON.parse(stringifyEntryWithFallback(value2));
}
function makeTruncatingReplacer(maxStringChars, maxTotalChars) {
  let total = 0;
  return (_key, val) => {
    if (typeof val === "string") {
      let emitted;
      if (val.length > maxStringChars) {
        emitted = `${TRUNCATION_MARKER_PREFIX}; original ${val.length} chars]`;
      } else if (total + val.length + 2 > maxTotalChars) {
        emitted = TRUNCATION_MARKER_TOTAL;
      } else {
        total += val.length + 2;
        return val;
      }
      total += emitted.length + 2;
      return emitted;
    }
    return val;
  };
}
class ObjectMutationLog {
  constructor(_transform, _compactAfterEntries = 512) {
    this._transform = _transform;
    this._compactAfterEntries = _compactAfterEntries;
    this._entryCount = 0;
    this._hasPendingWrite = false;
    this._pendingEntryCount = 0;
  }
  /**
   * Creates an initial log file from the given object.
   */
  createInitial(current) {
    return this.createInitialFromSerialized(this._transform.extract(current));
  }
  /**
   * Creates an initial log file from the serialized object.
   *
   * Unlike {@link write}, this commits state immediately without requiring
   * {@link confirmWrite}. This is safe because the returned buffer contains
   * a self-contained `Initial` entry — if it fails to persist, no
   * incremental entries can be appended to a non-existent file.
   */
  createInitialFromSerialized(value2) {
    this._previous = value2;
    this._entryCount = 1;
    this._clearPending();
    const entry = { kind: 0 /* Initial */, v: value2 };
    return VSBuffer.fromString(stringifyEntryWithFallback(entry) + "\n");
  }
  /**
   * Reads and reconstructs the state from a log file.
   */
  read(content) {
    let state;
    let lineCount = 0;
    let start = 0;
    const len = content.byteLength;
    while (start < len) {
      let end = content.indexOf(LF, start);
      if (end === -1) {
        end = len;
      }
      if (end > start) {
        const line = content.slice(start, end);
        if (line.byteLength > 0) {
          lineCount++;
          const entry = JSON.parse(line.toString());
          switch (entry.kind) {
            case 0 /* Initial */:
              state = entry.v;
              break;
            case 1 /* Set */:
              if (state === void 0) {
                throw new Error("Log file is missing an initial entry");
              }
              this._applySet(state, entry.k, entry.v);
              break;
            case 2 /* Push */:
              if (state === void 0) {
                throw new Error("Log file is missing an initial entry");
              }
              this._applyPush(state, entry.k, entry.v, entry.i);
              break;
            case 3 /* Delete */:
              if (state === void 0) {
                throw new Error("Log file is missing an initial entry");
              }
              this._applySet(state, entry.k, void 0);
              break;
            default:
              assertNever(entry);
          }
        }
      }
      start = end + 1;
    }
    if (lineCount === 0) {
      throw new Error("Empty log file");
    }
    this._previous = state;
    this._entryCount = lineCount;
    this._clearPending();
    return state;
  }
  /**
   * Writes updates to the log. Returns the operation type and data to write.
   * The caller **must** invoke {@link confirmWrite} after the data is
   * successfully persisted to commit the internal state. Without confirmation,
   * the next write is computed against the last confirmed state, and will only
   * produce a full initial entry when no confirmed state exists, preventing
   * corrupted log files when a write fails.
   */
  write(current) {
    const currentValue = this._transform.extract(current);
    if (!this._previous || this._entryCount > this._compactAfterEntries) {
      this._hasPendingWrite = true;
      this._pendingPrevious = currentValue;
      this._pendingEntryCount = 1;
      const entry = { kind: 0 /* Initial */, v: currentValue };
      return { op: "replace", data: VSBuffer.fromString(stringifyEntryWithFallback(entry) + "\n") };
    }
    const entries = [];
    const path = [];
    try {
      this._diff(this._transform, path, this._previous, currentValue, entries);
    } catch (e) {
      if (e instanceof Error) {
        const pathStr = path.map((s) => typeof s === "number" ? `[${s}]` : `.${s}`).join("") || "<root>";
        prefixError(e, `error diffing at ${pathStr}: `);
      }
      throw e;
    }
    if (entries.length === 0) {
      this._clearPending();
      return { op: "append", data: VSBuffer.fromString("") };
    }
    this._hasPendingWrite = true;
    this._pendingEntryCount = this._entryCount + entries.length;
    this._pendingPrevious = currentValue;
    let data = "";
    for (const e of entries) {
      data += stringifyEntryWithFallback(e) + "\n";
    }
    return { op: "append", data: VSBuffer.fromString(data) };
  }
  /**
   * Commits the internal state after a successful write to disk.
   */
  confirmWrite() {
    if (this._hasPendingWrite) {
      this._previous = this._pendingPrevious;
      this._entryCount = this._pendingEntryCount;
      this._clearPending();
    }
  }
  _clearPending() {
    this._hasPendingWrite = false;
    this._pendingPrevious = void 0;
    this._pendingEntryCount = 0;
  }
  _applySet(state, path, value2) {
    if (path.length === 0) {
      return;
    }
    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value2;
  }
  _applyPush(state, path, values, startIndex) {
    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    const arrayKey = path[path.length - 1];
    const arr = current[arrayKey] || [];
    if (startIndex !== void 0) {
      arr.length = startIndex;
    }
    if (values && values.length > 0) {
      arr.push(...values);
    }
    current[arrayKey] = arr;
  }
  _diff(transform, path, prev, curr, entries) {
    if (transform.kind === 0 /* Key */ || transform.kind === 1 /* Primitive */) {
      if (!transform.equals(prev, curr)) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
      }
    } else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
      if (prev !== curr) {
        if (curr === void 0) {
          entries.push({ kind: 3 /* Delete */, k: path.slice() });
        } else if (curr === null) {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: null });
        } else {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        }
      }
    } else if (transform.kind === 2 /* Array */) {
      this._diffArray(transform, path, prev, curr, entries);
    } else if (transform.kind === 3 /* Object */) {
      this._diffObject(transform.children, path, prev, curr, entries, transform.sealed);
    } else {
      throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
    }
  }
  _diffObject(children, path, prev, curr, entries, sealed) {
    const prevObj = prev;
    const currObj = curr;
    let i = 0;
    for (; i < children.length; i++) {
      const [key2, transform] = children[i];
      if (transform.kind !== 0 /* Key */) {
        break;
      }
      if (!transform.equals(prevObj?.[key2], currObj[key2])) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        return;
      }
    }
    if (sealed && sealed(prev, true) && sealed(curr, false)) {
      return;
    }
    for (; i < children.length; i++) {
      const [key2, transform] = children[i];
      path.push(key2);
      this._diff(transform, path, prevObj?.[key2], currObj[key2], entries);
      path.pop();
    }
  }
  _diffArray(transform, path, prev, curr, entries) {
    const prevArr = prev || [];
    const currArr = curr || [];
    const itemSchema = transform.itemSchema;
    const minLen = Math.min(prevArr.length, currArr.length);
    if (itemSchema.kind === 3 /* Object */) {
      const childEntries = itemSchema.children;
      for (let i = 0; i < minLen; i++) {
        const prevItem = prevArr[i];
        const currItem = currArr[i];
        if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
          const newItems = currArr.slice(i);
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i });
          return;
        }
        path.push(i);
        this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
        path.pop();
      }
      if (currArr.length > prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
      } else if (currArr.length < prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
      }
    } else {
      let firstMismatch = -1;
      for (let i = 0; i < minLen; i++) {
        if (!itemSchema.equals(prevArr[i], currArr[i])) {
          firstMismatch = i;
          break;
        }
      }
      if (firstMismatch === -1) {
        if (currArr.length > prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
        } else if (currArr.length < prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
        }
      } else {
        const newItems = currArr.slice(firstMismatch);
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i: firstMismatch });
      }
    }
  }
  _hasKeyMismatch(children, prev, curr) {
    const prevObj = prev;
    const currObj = curr;
    for (const [key2, transform] of children) {
      if (transform.kind !== 0 /* Key */) {
        break;
      }
      if (!transform.equals(prevObj?.[key2], currObj[key2])) {
        return true;
      }
    }
    return false;
  }
}
export {
  ObjectMutationLog,
  PERSIST_ENTRY_MAX_STRING_CHARS,
  PERSIST_ENTRY_MAX_TOTAL_CHARS,
  array,
  deepCloneWithFallback,
  key,
  makeTruncatingReplacer,
  object,
  stringifyEntryWithFallback,
  t,
  v,
  value
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXG9iamVjdE11dGF0aW9uTG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbi8qKlxuICogVXBkYXRlcyBhbiBlcnJvcidzIG1lc3NhZ2UgYW5kIHN0YWNrIHRyYWNlIHdpdGggYSBwcmVmaXguIEluIFY4IHRoZSBzdGFja1xuICogc3RyaW5nIHN0YXJ0cyB3aXRoIFwiRXJyb3JOYW1lOiBtZXNzYWdlXFxuICBhdCBcdTIwMjZcIiwgc28gd2UgcmVidWlsZCB0aGUgaGVhZGVyXG4gKiBhZnRlciBtdXRhdGluZyB0aGUgbWVzc2FnZS5cbiAqL1xuZnVuY3Rpb24gcHJlZml4RXJyb3IoZTogRXJyb3IsIHByZWZpeDogc3RyaW5nKTogdm9pZCB7XG5cdGUubWVzc2FnZSA9IHByZWZpeCArIGUubWVzc2FnZTtcblx0aWYgKGUuc3RhY2spIHtcblx0XHRjb25zdCBubElkeCA9IGUuc3RhY2suaW5kZXhPZignXFxuJyk7XG5cdFx0ZS5zdGFjayA9IG5sSWR4ICE9PSAtMVxuXHRcdFx0PyBgJHtlLm5hbWV9OiAke2UubWVzc2FnZX0ke2Uuc3RhY2suc2xpY2UobmxJZHgpfWBcblx0XHRcdDogYCR7ZS5uYW1lfTogJHtlLm1lc3NhZ2V9YDtcblx0fVxufVxuXG4vKipcbiAqIFByZXBlbmRzIGEgcGF0aCBzZWdtZW50IHRvIGFuIGVycm9yIGFzIGl0IHVud2luZHMgdGhyb3VnaCBuZXN0ZWQgZXh0cmFjdFxuICogY2FsbHMuIEVhY2ggbGV2ZWwgYWRkcyBpdHMgc2VnbWVudCBzbyB0aGUgZmluYWwgbWVzc2FnZSByZWFkcyBlLmcuXG4gKiBgLnJlc3BvbnNlc1syXS5jb250ZW50OiBDYW5ub3QgcmVhZCBwcm9wZXJ0eSAneCcgb2YgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gcmV0aHJvd1dpdGhQYXRoU2VnbWVudChlOiB1bmtub3duLCBzZWdtZW50OiBzdHJpbmcgfCBudW1iZXIpOiBuZXZlciB7XG5cdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRjb25zdCBwYXJ0ID0gdHlwZW9mIHNlZ21lbnQgPT09ICdudW1iZXInID8gYFske3NlZ21lbnR9XWAgOiBgLiR7c2VnbWVudH1gO1xuXHRcdGNvbnN0IG5lZWRzU2VwID0gIWUubWVzc2FnZS5zdGFydHNXaXRoKCdbJykgJiYgIWUubWVzc2FnZS5zdGFydHNXaXRoKCcuJyk7XG5cdFx0cHJlZml4RXJyb3IoZSwgcGFydCArIChuZWVkc1NlcCA/ICc6ICcgOiAnJykpO1xuXHR9XG5cdHRocm93IGU7XG59XG5cbi8qKiBJTVBPUlRBTlQ6IGBLZXlgIGNvbWVzIGZpcnN0LiBUaGVuIHdlIHNob3VsZCBzb3J0IGluIG9yZGVyIG9mIGxlYXN0LT5tb3N0IGV4cGVuc2l2ZSB0byBkaWZmICovXG5jb25zdCBlbnVtIFRyYW5zZm9ybUtpbmQge1xuXHRLZXksXG5cdFByaW1pdGl2ZSxcblx0QXJyYXksXG5cdE9iamVjdCxcbn1cblxuLyoqIFNjaGVtYSBlbnRyaWVzIHNvcnRlZCB3aXRoIGtleSBwcm9wZXJ0aWVzIGZpcnN0ICovXG5leHBvcnQgdHlwZSBTY2hlbWFFbnRyaWVzID0gW3N0cmluZywgVHJhbnNmb3JtPHVua25vd24sIHVua25vd24+XVtdO1xuXG5pbnRlcmZhY2UgVHJhbnNmb3JtQmFzZTxURnJvbSwgVFRvPiB7XG5cdHJlYWRvbmx5IGtpbmQ6IFRyYW5zZm9ybUtpbmQ7XG5cdC8qKiBFeHRyYWN0cyB0aGUgc2VyaWFsaXphYmxlIHZhbHVlIGZyb20gdGhlIHNvdXJjZSBvYmplY3QgKi9cblx0ZXh0cmFjdChmcm9tOiBURnJvbSk6IFRUbztcbn1cblxuLyoqIFRyYW5zZm9ybSBmb3IgcHJpbWl0aXZlIHZhbHVlcyAoa2V5cyBhbmQgdmFsdWVzKSB0aGF0IGNhbiBiZSBjb21wYXJlZCBmb3IgZXF1YWxpdHkgKi9cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmb3JtVmFsdWU8VEZyb20sIFRUbz4gZXh0ZW5kcyBUcmFuc2Zvcm1CYXNlPFRGcm9tLCBUVG8+IHtcblx0cmVhZG9ubHkga2luZDogVHJhbnNmb3JtS2luZC5LZXkgfCBUcmFuc2Zvcm1LaW5kLlByaW1pdGl2ZTtcblx0LyoqIENvbXBhcmVzIHR3byBzZXJpYWxpemVkIHZhbHVlcyBmb3IgZXF1YWxpdHkgKi9cblx0ZXF1YWxzKGE6IFRUbywgYjogVFRvKTogYm9vbGVhbjtcbn1cblxuLyoqIFRyYW5zZm9ybSBmb3IgYXJyYXlzIHdpdGggYW4gaXRlbSBzY2hlbWEgKi9cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmb3JtQXJyYXk8VEZyb20sIFRUbz4gZXh0ZW5kcyBUcmFuc2Zvcm1CYXNlPFRGcm9tLCBUVG8+IHtcblx0cmVhZG9ubHkga2luZDogVHJhbnNmb3JtS2luZC5BcnJheTtcblx0LyoqIFRoZSBzY2hlbWEgZm9yIGFycmF5IGl0ZW1zICovXG5cdHJlYWRvbmx5IGl0ZW1TY2hlbWE6IFRyYW5zZm9ybU9iamVjdDx1bmtub3duLCB1bmtub3duPiB8IFRyYW5zZm9ybVZhbHVlPHVua25vd24sIHVua25vd24+O1xufVxuXG4vKiogVHJhbnNmb3JtIGZvciBvYmplY3RzIHdpdGggY2hpbGQgcHJvcGVydGllcyAqL1xuZXhwb3J0IGludGVyZmFjZSBUcmFuc2Zvcm1PYmplY3Q8VEZyb20sIFRUbz4gZXh0ZW5kcyBUcmFuc2Zvcm1CYXNlPFRGcm9tLCBUVG8+IHtcblx0cmVhZG9ubHkga2luZDogVHJhbnNmb3JtS2luZC5PYmplY3Q7XG5cdC8qKiBTY2hlbWEgZW50cmllcyBzb3J0ZWQgd2l0aCBLZXkgcHJvcGVydGllcyBmaXJzdCAqL1xuXHRyZWFkb25seSBjaGlsZHJlbjogU2NoZW1hRW50cmllcztcblx0LyoqIENoZWNrcyBpZiB0aGUgb2JqZWN0IGlzIHNlYWxlZCAod29uJ3QgY2hhbmdlKS4gKi9cblx0c2VhbGVkPyhvYmo6IFRUbywgd2FzU2VyaWFsaXplZDogYm9vbGVhbik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIFRyYW5zZm9ybTxURnJvbSwgVFRvPiA9XG5cdHwgVHJhbnNmb3JtVmFsdWU8VEZyb20sIFRUbz5cblx0fCBUcmFuc2Zvcm1BcnJheTxURnJvbSwgVFRvPlxuXHR8IFRyYW5zZm9ybU9iamVjdDxURnJvbSwgVFRvPjtcblxuZXhwb3J0IHR5cGUgU2NoZW1hPFRGcm9tLCBUVG8+ID0ge1xuXHRbSyBpbiBrZXlvZiBSZXF1aXJlZDxUVG8+XTogVHJhbnNmb3JtPFRGcm9tLCBUVG9bS10+XG59O1xuXG4vKipcbiAqIEEgcHJpbWl0aXZlIHRoYXQgd2lsbCBiZSB0cmFja2VkIGFuZCBjb21wYXJlZCBmaXJzdC4gSWYgdGhpcyBpcyBjaGFuZ2VkLCB0aGUgZW50aXJlXG4gKiBvYmplY3QgaXMgdGhyb3duIG91dCBhbmQgcmUtc3RvcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24ga2V5PFQsIFIgPSBUPihjb21wYXJhdG9yPzogKGE6IFIsIGI6IFIpID0+IGJvb2xlYW4pOiBUcmFuc2Zvcm1WYWx1ZTxULCBSPiB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogVHJhbnNmb3JtS2luZC5LZXksXG5cdFx0ZXh0cmFjdDogKGZyb206IFQpID0+IGZyb20gYXMgdW5rbm93biBhcyBSLFxuXHRcdGVxdWFsczogY29tcGFyYXRvciA/PyAoKGEsIGIpID0+IGEgPT09IGIpLFxuXHR9O1xufVxuXG4vKiogQSB2YWx1ZSB0aGF0IHdpbGwgYmUgdHJhY2tlZCBhbmQgcmVwbGFjZWQgaWYgdGhlIGNvbXBhcmF0b3IgaXMgbm90IGVxdWFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlPFQsIFIgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkPigpOiBUcmFuc2Zvcm1WYWx1ZTxULCBSPjtcbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZTxULCBSPihjb21wYXJhdG9yOiAoYTogUiwgYjogUikgPT4gYm9vbGVhbik6IFRyYW5zZm9ybVZhbHVlPFQsIFI+O1xuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlPFQsIFI+KGNvbXBhcmF0b3I/OiAoYTogUiwgYjogUikgPT4gYm9vbGVhbik6IFRyYW5zZm9ybVZhbHVlPFQsIFI+IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBUcmFuc2Zvcm1LaW5kLlByaW1pdGl2ZSxcblx0XHRleHRyYWN0OiAoZnJvbTogVCkgPT4ge1xuXHRcdFx0bGV0IHZhbHVlID0gZnJvbSBhcyB1bmtub3duIGFzIFI7XG5cdFx0XHQvLyBXZSBtYXAgdGhlIG9iamVjdCB0byBKU09OIGZvciB0d28gcmVhc29ucyAoYSkgcmVkdWNlIGlzc3VlcyB3aXRoIHJlZmVyZW5jZXMgdG9cblx0XHRcdC8vIG11dGFibGUgdHlwZSB0aGF0IGNvdWxkIGJlIGhlbGQgaW50ZXJuYWxseSBpbiB0aGUgTG9nQWRhcHRlciBhbmQgKGIpIHRvIG1ha2Vcblx0XHRcdC8vIG9iamVjdCBjb21wYXJpc29uIHdvcmsgd2l0aCB0aGUgZGF0YSB3ZSByZS1oeWRyYXRlIGZyb20gZGlzayAoZS5nLiBpZiB1c2luZ1xuXHRcdFx0Ly8gb2JqZWN0c0VxdWFsLCBhIGh5ZHJhdGVkIFVSSSBpcyBub3QgZXF1YWwgdG8gdGhlIHNlcmlhbGl6ZWQgVXJpQ29tcG9uZW50cylcblx0XHRcdGlmICghIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0dmFsdWUgPSBkZWVwQ2xvbmVXaXRoRmFsbGJhY2sodmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRlcXVhbHM6IGNvbXBhcmF0b3IgPz8gKChhLCBiKSA9PiBhID09PSBiKSxcblx0fTtcbn1cblxuLyoqIEFuIGFycmF5IHRoYXQgd2lsbCB1c2UgdGhlIHNjaGVtYSB0byBjb21wYXJlIGl0ZW1zIHBvc2l0aW9uYWxseS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcnJheTxULCBSPihzY2hlbWE6IFRyYW5zZm9ybU9iamVjdDxULCBSPiB8IFRyYW5zZm9ybVZhbHVlPFQsIFI+KTogVHJhbnNmb3JtQXJyYXk8cmVhZG9ubHkgVFtdLCBSW10+IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBUcmFuc2Zvcm1LaW5kLkFycmF5LFxuXHRcdGl0ZW1TY2hlbWE6IHNjaGVtYSxcblx0XHRleHRyYWN0OiBmcm9tID0+IGZyb20/Lm1hcCgoaXRlbSwgaSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHNjaGVtYS5leHRyYWN0KGl0ZW0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRyZXRocm93V2l0aFBhdGhTZWdtZW50KGUsIGkpO1xuXHRcdFx0fVxuXHRcdH0pLFxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9iamVjdE9wdGlvbnM8Uj4ge1xuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBvYmplY3QgaXMgc2VhbGVkIGFuZCB3aWxsIG5ldmVyIGNoYW5nZSBhZ2Fpbi5cblx0ICogV2hlbiBjb21wYXJpbmcgdHdvIHNlYWxlZCBvYmplY3RzLCBvbmx5IGtleSBmaWVsZHMgYXJlIGNvbXBhcmVkXG5cdCAqICh0byBkZXRlY3QgcmVwbGFjZW1lbnQpLCBidXQgb3RoZXIgZmllbGRzIGFyZSBub3QgZGlmZmVkLlxuXHQgKi9cblx0c2VhbGVkPzogKG9iajogUiwgd2FzU2VyaWFsaXplZDogYm9vbGVhbikgPT4gYm9vbGVhbjtcbn1cblxuLyoqIEFuIG9iamVjdCBzY2hlbWEuICovXG5leHBvcnQgZnVuY3Rpb24gb2JqZWN0PFQsIFIgZXh0ZW5kcyBvYmplY3Q+KHNjaGVtYTogU2NoZW1hPFQsIFI+LCBvcHRpb25zPzogT2JqZWN0T3B0aW9uczxSPik6IFRyYW5zZm9ybU9iamVjdDxULCBSPiB7XG5cdC8vIFNvcnQgZW50cmllcyB3aXRoIGtleSBwcm9wZXJ0aWVzIGZpcnN0IGZvciBmYXN0IGtleSBjaGVja2luZ1xuXHRjb25zdCBlbnRyaWVzID0gKE9iamVjdC5lbnRyaWVzKHNjaGVtYSkgYXMgW3N0cmluZywgVHJhbnNmb3JtPFQsIFJba2V5b2YgUl0+XVtdKS5zb3J0KChbLCBhXSwgWywgYl0pID0+IGEua2luZCAtIGIua2luZCk7XG5cdHJldHVybiB7XG5cdFx0a2luZDogVHJhbnNmb3JtS2luZC5PYmplY3QsXG5cdFx0Y2hpbGRyZW46IGVudHJpZXMgYXMgU2NoZW1hRW50cmllcyxcblx0XHRzZWFsZWQ6IG9wdGlvbnM/LnNlYWxlZCxcblx0XHRleHRyYWN0OiAoZnJvbTogVCkgPT4ge1xuXHRcdFx0aWYgKGlzVW5kZWZpbmVkT3JOdWxsKGZyb20pKSB7XG5cdFx0XHRcdHJldHVybiBmcm9tIGFzIHVua25vd24gYXMgUjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHRyYW5zZm9ybV0gb2YgZW50cmllcykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc3VsdFtrZXldID0gdHJhbnNmb3JtLmV4dHJhY3QoZnJvbSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRyZXRocm93V2l0aFBhdGhTZWdtZW50KGUsIGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQgYXMgUjtcblx0XHR9LFxuXHR9O1xufVxuXG4vKipcbiAqIERlZmluZXMgYSBnZXR0ZXIgb24gdGhlIG9iamVjdCB0byBleHRyYWN0IGEgdmFsdWUsIGNvbXBhcmVkIHdpdGggdGhlIGdpdmVuIHNjaGVtYS5cbiAqIEl0IHNob3VsZCByZXR1cm4gdGhlIHZhbHVlIHRoYXQgd2lsbCBnZXQgc2VyaWFsaXplZCBpbiB0aGUgcmVzdWx0aW5nIGxvZyBmaWxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdDxULCBPLCBSPihnZXR0ZXI6IChvYmo6IFQpID0+IE8sIHNjaGVtYTogVHJhbnNmb3JtPE8sIFI+KTogVHJhbnNmb3JtPFQsIFI+IHtcblx0cmV0dXJuIHtcblx0XHQuLi5zY2hlbWEsXG5cdFx0ZXh0cmFjdDogKGZyb206IFQpID0+IHNjaGVtYS5leHRyYWN0KGdldHRlcihmcm9tKSksXG5cdH07XG59XG5cbi8qKiBTaG9ydGN1dCBmb3IgdChmbiwgdmFsdWUoKSkgKi9cbmV4cG9ydCBmdW5jdGlvbiB2PFQsIFIgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkPihnZXR0ZXI6IChvYmo6IFQpID0+IFIpOiBUcmFuc2Zvcm1WYWx1ZTxULCBSPjtcbmV4cG9ydCBmdW5jdGlvbiB2PFQsIFI+KGdldHRlcjogKG9iajogVCkgPT4gUiwgY29tcGFyYXRvcjogKGE6IFIsIGI6IFIpID0+IGJvb2xlYW4pOiBUcmFuc2Zvcm1WYWx1ZTxULCBSPjtcbmV4cG9ydCBmdW5jdGlvbiB2PFQsIFI+KGdldHRlcjogKG9iajogVCkgPT4gUiwgY29tcGFyYXRvcj86IChhOiBSLCBiOiBSKSA9PiBib29sZWFuKTogVHJhbnNmb3JtVmFsdWU8VCwgUj4ge1xuXHRjb25zdCBpbm5lciA9IHZhbHVlKGNvbXBhcmF0b3IhKTtcblx0cmV0dXJuIHtcblx0XHQuLi5pbm5lcixcblx0XHRleHRyYWN0OiAoZnJvbTogVCkgPT4gaW5uZXIuZXh0cmFjdChnZXR0ZXIoZnJvbSkpLFxuXHR9O1xufVxuXG5cbmNvbnN0IGVudW0gRW50cnlLaW5kIHtcblx0LyoqIEluaXRpYWwgY29tcGxldGUgb2JqZWN0IHN0YXRlLCB2YWxpZCBvbmx5IGFzIHRoZSBmaXJzdCBlbnRyeSAqL1xuXHRJbml0aWFsID0gMCxcblx0LyoqIFByb3BlcnR5IHVwZGF0ZSAqL1xuXHRTZXQgPSAxLFxuXHQvKiogQXJyYXkgcHVzaC9zcGxpY2UuICovXG5cdFB1c2ggPSAyLFxuXHQvKiogRGVsZXRlIGEgcHJvcGVydHkgKi9cblx0RGVsZXRlID0gMyxcbn1cblxudHlwZSBPYmplY3RQYXRoID0gKHN0cmluZyB8IG51bWJlcilbXTtcblxudHlwZSBFbnRyeSA9XG5cdHwgeyBraW5kOiBFbnRyeUtpbmQuSW5pdGlhbDsgdjogdW5rbm93biB9XG5cdC8qKiBVcGRhdGUgYSBwcm9wZXJ0eSBvZiBhbiBvYmplY3QsIHJlcGxhY2luZyBpdCBlbnRpcmVseSAqL1xuXHR8IHsga2luZDogRW50cnlLaW5kLlNldDsgazogT2JqZWN0UGF0aDsgdjogdW5rbm93biB9XG5cdC8qKiBEZWxldGUgYSBwcm9wZXJ0eSBvZiBhbiBvYmplY3QgKi9cblx0fCB7IGtpbmQ6IEVudHJ5S2luZC5EZWxldGU7IGs6IE9iamVjdFBhdGggfVxuXHQvKiogUHVzaGVzIDAgb3IgbW9yZSBuZXcgZW50cmllcyB0byBhbiBhcnJheS4gSWYgYGlgIGlzIHNldCwgZXZlcnl0aGluZyBhZnRlciB0aGF0IGluZGV4IGlzIHJlbW92ZWQgKi9cblx0fCB7IGtpbmQ6IEVudHJ5S2luZC5QdXNoOyBrOiBPYmplY3RQYXRoOyB2PzogdW5rbm93bltdOyBpPzogbnVtYmVyIH07XG5cbmNvbnN0IExGID0gVlNCdWZmZXIuZnJvbVN0cmluZygnXFxuJyk7XG5cbi8qKlxuICogUGVyLXN0cmluZyBjYXAgKGluIFVURi0xNiBjb2RlIHVuaXRzLCBtYXRjaGluZyBgc3RyaW5nLmxlbmd0aGApIGFwcGxpZWQgd2hlblxuICoge0BsaW5rIHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrfSByZXRyaWVzIGFmdGVyIGBKU09OLnN0cmluZ2lmeWAgdGhyb3dzXG4gKiBgUmFuZ2VFcnJvcjogSW52YWxpZCBzdHJpbmcgbGVuZ3RoYCAoVjgncyBtYXggc3RyaW5nIGxlbmd0aCBpcyB+NTEyIE1pQiBvblxuICogNjQtYml0KS4gQW55IHNpbmdsZSBzdHJpbmcgbG9uZ2VyIHRoYW4gdGhpcyBpcyByZXBsYWNlZCB3aXRoIGEgbWFya2VyIG9uXG4gKiByZXRyeS4gR2VuZXJvdXMgc28gaXQgdHJpZ2dlcnMgb25seSBvbiBvdXRsaWVycy5cbiAqL1xuZXhwb3J0IGNvbnN0IFBFUlNJU1RfRU5UUllfTUFYX1NUUklOR19DSEFSUyA9IDEgKiAxMDI0ICogMTAyNDtcblxuLyoqXG4gKiBUb3RhbC1zaXplIGJ1ZGdldCAoc3VtIG9mIGBzdHJpbmcubGVuZ3RoYCBmb3IgdHJhY2tlZCBzdHJpbmdzLCBpbiBVVEYtMTZcbiAqIGNvZGUgdW5pdHMpIGZvciB0aGUgcmV0cnkgb2Yge0BsaW5rIHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrfS4gT25jZSB0aGVcbiAqIGN1bXVsYXRpdmUgdHJhY2tlZCBzaXplIGR1cmluZyBzZXJpYWxpemF0aW9uIGV4Y2VlZHMgdGhpcywgcmVtYWluaW5nIHZhbHVlc1xuICogYXJlIHJlcGxhY2VkIHdpdGggYSBtYXJrZXIuXG4gKlxuICogVGhpcyBpcyBhbiBhcHByb3hpbWF0aW9uOiBKU09OIGVzY2FwaW5nLCBwcm9wZXJ0eSBrZXlzLCBhbmQgbm9uLXN0cmluZ1xuICogcGF5bG9hZCBhcmUgbm90IGNvdW50ZWQsIHNvIHRoZSBhY3R1YWwgb3V0cHV0IG1heSBiZSBtb2RlcmF0ZWx5IGxhcmdlci5cbiAqIFRoZSBjYXAgaXMgc2l6ZWQgd2VsbCB1bmRlciBWOCdzIG1heCBzdHJpbmcgbGVuZ3RoIHRvIGxlYXZlIGFtcGxlIGhlYWRyb29tXG4gKiBmb3IgdGhhdCBvdmVyaGVhZC5cbiAqL1xuZXhwb3J0IGNvbnN0IFBFUlNJU1RfRU5UUllfTUFYX1RPVEFMX0NIQVJTID0gMTAwICogMTAyNCAqIDEwMjQ7XG5cbmNvbnN0IFRSVU5DQVRJT05fTUFSS0VSX1BSRUZJWCA9ICdbVlMgQ29kZTogdmFsdWUgdHJ1bmNhdGVkIGZvciBwZXJzaXN0ZW5jZSc7XG5jb25zdCBUUlVOQ0FUSU9OX01BUktFUl9UT1RBTCA9IGAke1RSVU5DQVRJT05fTUFSS0VSX1BSRUZJWH07IGVudHJ5IGV4Y2VlZGVkIHNpemUgYnVkZ2V0XWA7XG5cbi8qKlxuICogV3JhcHMgYEpTT04uc3RyaW5naWZ5KGVudHJ5KWAgd2l0aCBhIHNhZmV0eSBuZXQgZm9yIHRoZSBWOCBtYXgtc3RyaW5nLWxlbmd0aFxuICogbGltaXQuIFRoZSBjb21tb24gcGF0aCBpcyBhIHNpbmdsZSBgSlNPTi5zdHJpbmdpZnlgIHdpdGggemVybyBvdmVyaGVhZC4gSWZcbiAqIHN0cmluZ2lmaWNhdGlvbiB0aHJvd3MgYFJhbmdlRXJyb3JgICh0aGUgcmVzdWx0aW5nIEpTT04gd291bGQgZXhjZWVkIFY4J3NcbiAqIH41MTIgTWlCIG1heCBzdHJpbmcgbGVuZ3RoIFx1MjAxNCBzZWUgbWljcm9zb2Z0L3ZzY29kZSMzMDg4NDMpLCByZXRyeSB3aXRoIGFcbiAqIHJlcGxhY2VyIHRoYXQgdHJ1bmNhdGVzIG92ZXJzaXplZCBzdHJpbmdzLiBFeHRlbnNpb25zIHNvbWV0aW1lcyBwdXQgdmVyeVxuICogbGFyZ2UgY29udGVudCAoYnJvd3NlciBkdW1wcywgY29tbWFuZCBvdXRwdXQsIFx1MjAyNikgaW50byBjaGF0IHJlc3VsdCBtZXRhZGF0YTtcbiAqIGxvc2luZyB0aGUgdGFpbCBvZiBvbmUgc3VjaCB2YWx1ZSBpcyBkcmFtYXRpY2FsbHkgYmV0dGVyIHRoYW4gbG9zaW5nIHRoZVxuICogZW50aXJlIGNoYXQgc2Vzc2lvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGVudHJ5OiB1bmtub3duKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZW50cnkpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0aWYgKCEoZSBpbnN0YW5jZW9mIFJhbmdlRXJyb3IpKSB7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZW50cnksIG1ha2VUcnVuY2F0aW5nUmVwbGFjZXIoUEVSU0lTVF9FTlRSWV9NQVhfU1RSSU5HX0NIQVJTLCBQRVJTSVNUX0VOVFJZX01BWF9UT1RBTF9DSEFSUykpO1xuXHR9XG59XG5cbi8qKlxuICogRGVlcC1jbG9uZXMgYHZhbHVlYCB0aHJvdWdoIEpTT04gd2l0aCB0aGUgc2FtZSBWOCBtYXgtc3RyaW5nLWxlbmd0aCBzYWZldHkgbmV0XG4gKiBhcyB7QGxpbmsgc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2t9LiBFeHBvcnRlZCBmb3IgdGVzdGluZyBvbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVlcENsb25lV2l0aEZhbGxiYWNrPFQ+KHZhbHVlOiBUKTogVCB7XG5cdHJldHVybiBKU09OLnBhcnNlKHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKHZhbHVlKSkgYXMgVDtcbn1cblxuLyoqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdGluZyBvbmx5LiBCdWlsZHMgdGhlIHN0YXRlZnVsIGBKU09OLnN0cmluZ2lmeWAgcmVwbGFjZXJcbiAqIHVzZWQgYnkge0BsaW5rIHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrfSBvbiBpdHMgcmV0cnkgcGF0aC5cbiAqXG4gKiBTaXplcyBhcmUgdHJhY2tlZCBpbiBVVEYtMTYgY29kZSB1bml0cyAoYHN0cmluZy5sZW5ndGhgKTsgSlNPTiBlc2NhcGluZyxcbiAqIHByb3BlcnR5IGtleXMsIGFuZCBub24tc3RyaW5nIHBheWxvYWQgYXJlIG5vdCBjb3VudGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFrZVRydW5jYXRpbmdSZXBsYWNlcihtYXhTdHJpbmdDaGFyczogbnVtYmVyLCBtYXhUb3RhbENoYXJzOiBudW1iZXIpOiAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSA9PiB1bmtub3duIHtcblx0bGV0IHRvdGFsID0gMDtcblx0cmV0dXJuIChfa2V5LCB2YWwpID0+IHtcblx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGxldCBlbWl0dGVkOiBzdHJpbmc7XG5cdFx0XHRpZiAodmFsLmxlbmd0aCA+IG1heFN0cmluZ0NoYXJzKSB7XG5cdFx0XHRcdGVtaXR0ZWQgPSBgJHtUUlVOQ0FUSU9OX01BUktFUl9QUkVGSVh9OyBvcmlnaW5hbCAke3ZhbC5sZW5ndGh9IGNoYXJzXWA7XG5cdFx0XHR9IGVsc2UgaWYgKHRvdGFsICsgdmFsLmxlbmd0aCArIDIgPiBtYXhUb3RhbENoYXJzKSB7XG5cdFx0XHRcdGVtaXR0ZWQgPSBUUlVOQ0FUSU9OX01BUktFUl9UT1RBTDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRvdGFsICs9IHZhbC5sZW5ndGggKyAyO1xuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fVxuXHRcdFx0dG90YWwgKz0gZW1pdHRlZC5sZW5ndGggKyAyO1xuXHRcdFx0cmV0dXJuIGVtaXR0ZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWw7XG5cdH07XG59XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gb2YgYW4gYXBwZW5kLWJhc2VkIG11dGF0aW9uIGxvZ2dlci4gR2l2ZW4gYSBgVHJhbnNmb3JtYFxuICogZGVmaW5pdGlvbiBvZiBhbiBvYmplY3QsIGl0IGNhbiByZWNyZWF0ZSBpdCBmcm9tIGEgZmlsZSBvbiBkaXNrLiBJdCBpc1xuICogdGhlbiBzdGF0ZWZ1bCwgYW5kIGdpdmVuIGEgYHdyaXRlYCBjYWxsIGl0IGNhbiB1cGRhdGUgdGhlIGxvZyBpbiBhIG1pbmltYWxcbiAqIHdheS5cbiAqL1xuZXhwb3J0IGNsYXNzIE9iamVjdE11dGF0aW9uTG9nPFRGcm9tLCBUVG8+IHtcblx0cHJpdmF0ZSBfcHJldmlvdXM6IFRUbyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZW50cnlDb3VudCA9IDA7XG5cdHByaXZhdGUgX2hhc1BlbmRpbmdXcml0ZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wZW5kaW5nUHJldmlvdXM6IFRUbyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ0VudHJ5Q291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zZm9ybTogVHJhbnNmb3JtPFRGcm9tLCBUVG8+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBhY3RBZnRlckVudHJpZXMgPSA1MTIsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gaW5pdGlhbCBsb2cgZmlsZSBmcm9tIHRoZSBnaXZlbiBvYmplY3QuXG5cdCAqL1xuXHRjcmVhdGVJbml0aWFsKGN1cnJlbnQ6IFRGcm9tKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUluaXRpYWxGcm9tU2VyaWFsaXplZCh0aGlzLl90cmFuc2Zvcm0uZXh0cmFjdChjdXJyZW50KSk7XG5cdH1cblxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGluaXRpYWwgbG9nIGZpbGUgZnJvbSB0aGUgc2VyaWFsaXplZCBvYmplY3QuXG5cdCAqXG5cdCAqIFVubGlrZSB7QGxpbmsgd3JpdGV9LCB0aGlzIGNvbW1pdHMgc3RhdGUgaW1tZWRpYXRlbHkgd2l0aG91dCByZXF1aXJpbmdcblx0ICoge0BsaW5rIGNvbmZpcm1Xcml0ZX0uIFRoaXMgaXMgc2FmZSBiZWNhdXNlIHRoZSByZXR1cm5lZCBidWZmZXIgY29udGFpbnNcblx0ICogYSBzZWxmLWNvbnRhaW5lZCBgSW5pdGlhbGAgZW50cnkgXHUyMDE0IGlmIGl0IGZhaWxzIHRvIHBlcnNpc3QsIG5vXG5cdCAqIGluY3JlbWVudGFsIGVudHJpZXMgY2FuIGJlIGFwcGVuZGVkIHRvIGEgbm9uLWV4aXN0ZW50IGZpbGUuXG5cdCAqL1xuXHRjcmVhdGVJbml0aWFsRnJvbVNlcmlhbGl6ZWQodmFsdWU6IFRUbyk6IFZTQnVmZmVyIHtcblx0XHR0aGlzLl9wcmV2aW91cyA9IHZhbHVlO1xuXHRcdHRoaXMuX2VudHJ5Q291bnQgPSAxO1xuXHRcdHRoaXMuX2NsZWFyUGVuZGluZygpO1xuXHRcdGNvbnN0IGVudHJ5OiBFbnRyeSA9IHsga2luZDogRW50cnlLaW5kLkluaXRpYWwsIHY6IHZhbHVlIH07XG5cdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2soZW50cnkpICsgJ1xcbicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIGFuZCByZWNvbnN0cnVjdHMgdGhlIHN0YXRlIGZyb20gYSBsb2cgZmlsZS5cblx0ICovXG5cdHJlYWQoY29udGVudDogVlNCdWZmZXIpOiBUVG8ge1xuXHRcdGxldCBzdGF0ZTogdW5rbm93bjtcblx0XHRsZXQgbGluZUNvdW50ID0gMDtcblxuXHRcdGxldCBzdGFydCA9IDA7XG5cdFx0Y29uc3QgbGVuID0gY29udGVudC5ieXRlTGVuZ3RoO1xuXHRcdHdoaWxlIChzdGFydCA8IGxlbikge1xuXHRcdFx0bGV0IGVuZCA9IGNvbnRlbnQuaW5kZXhPZihMRiwgc3RhcnQpO1xuXHRcdFx0aWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdFx0ZW5kID0gbGVuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW5kID4gc3RhcnQpIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGNvbnRlbnQuc2xpY2Uoc3RhcnQsIGVuZCk7XG5cdFx0XHRcdGlmIChsaW5lLmJ5dGVMZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0bGluZUNvdW50Kys7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKGxpbmUudG9TdHJpbmcoKSkgYXMgRW50cnk7XG5cdFx0XHRcdFx0c3dpdGNoIChlbnRyeS5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlIEVudHJ5S2luZC5Jbml0aWFsOlxuXHRcdFx0XHRcdFx0XHRzdGF0ZSA9IGVudHJ5LnY7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBFbnRyeUtpbmQuU2V0OlxuXHRcdFx0XHRcdFx0XHRpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTG9nIGZpbGUgaXMgbWlzc2luZyBhbiBpbml0aWFsIGVudHJ5Jyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5fYXBwbHlTZXQoc3RhdGUsIGVudHJ5LmssIGVudHJ5LnYpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRW50cnlLaW5kLlB1c2g6XG5cdFx0XHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMb2cgZmlsZSBpcyBtaXNzaW5nIGFuIGluaXRpYWwgZW50cnknKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLl9hcHBseVB1c2goc3RhdGUsIGVudHJ5LmssIGVudHJ5LnYsIGVudHJ5LmkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRW50cnlLaW5kLkRlbGV0ZTpcblx0XHRcdFx0XHRcdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xvZyBmaWxlIGlzIG1pc3NpbmcgYW4gaW5pdGlhbCBlbnRyeScpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FwcGx5U2V0KHN0YXRlLCBlbnRyeS5rLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdGFzc2VydE5ldmVyKGVudHJ5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHN0YXJ0ID0gZW5kICsgMTtcblx0XHR9XG5cblx0XHRpZiAobGluZUNvdW50ID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VtcHR5IGxvZyBmaWxlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlvdXMgPSBzdGF0ZSBhcyBUVG87XG5cdFx0dGhpcy5fZW50cnlDb3VudCA9IGxpbmVDb3VudDtcblx0XHR0aGlzLl9jbGVhclBlbmRpbmcoKTtcblx0XHRyZXR1cm4gc3RhdGUgYXMgVFRvO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyaXRlcyB1cGRhdGVzIHRvIHRoZSBsb2cuIFJldHVybnMgdGhlIG9wZXJhdGlvbiB0eXBlIGFuZCBkYXRhIHRvIHdyaXRlLlxuXHQgKiBUaGUgY2FsbGVyICoqbXVzdCoqIGludm9rZSB7QGxpbmsgY29uZmlybVdyaXRlfSBhZnRlciB0aGUgZGF0YSBpc1xuXHQgKiBzdWNjZXNzZnVsbHkgcGVyc2lzdGVkIHRvIGNvbW1pdCB0aGUgaW50ZXJuYWwgc3RhdGUuIFdpdGhvdXQgY29uZmlybWF0aW9uLFxuXHQgKiB0aGUgbmV4dCB3cml0ZSBpcyBjb21wdXRlZCBhZ2FpbnN0IHRoZSBsYXN0IGNvbmZpcm1lZCBzdGF0ZSwgYW5kIHdpbGwgb25seVxuXHQgKiBwcm9kdWNlIGEgZnVsbCBpbml0aWFsIGVudHJ5IHdoZW4gbm8gY29uZmlybWVkIHN0YXRlIGV4aXN0cywgcHJldmVudGluZ1xuXHQgKiBjb3JydXB0ZWQgbG9nIGZpbGVzIHdoZW4gYSB3cml0ZSBmYWlscy5cblx0ICovXG5cdHdyaXRlKGN1cnJlbnQ6IFRGcm9tKTogeyBvcDogJ2FwcGVuZCcgfCAncmVwbGFjZSc7IGRhdGE6IFZTQnVmZmVyIH0ge1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHRoaXMuX3RyYW5zZm9ybS5leHRyYWN0KGN1cnJlbnQpO1xuXG5cdFx0aWYgKCF0aGlzLl9wcmV2aW91cyB8fCB0aGlzLl9lbnRyeUNvdW50ID4gdGhpcy5fY29tcGFjdEFmdGVyRW50cmllcykge1xuXHRcdFx0Ly8gTm8gcHJldmlvdXMgc3RhdGUsIGNyZWF0ZSBpbml0aWFsXG5cdFx0XHR0aGlzLl9oYXNQZW5kaW5nV3JpdGUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1ByZXZpb3VzID0gY3VycmVudFZhbHVlO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0VudHJ5Q291bnQgPSAxO1xuXHRcdFx0Y29uc3QgZW50cnk6IEVudHJ5ID0geyBraW5kOiBFbnRyeUtpbmQuSW5pdGlhbCwgdjogY3VycmVudFZhbHVlIH07XG5cdFx0XHRyZXR1cm4geyBvcDogJ3JlcGxhY2UnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGVudHJ5KSArICdcXG4nKSB9O1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGRpZmYgZW50cmllc1xuXHRcdGNvbnN0IGVudHJpZXM6IEVudHJ5W10gPSBbXTtcblx0XHRjb25zdCBwYXRoOiBPYmplY3RQYXRoID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2RpZmYodGhpcy5fdHJhbnNmb3JtLCBwYXRoLCB0aGlzLl9wcmV2aW91cywgY3VycmVudFZhbHVlLCBlbnRyaWVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IHBhdGhTdHIgPSBwYXRoLm1hcChzID0+IHR5cGVvZiBzID09PSAnbnVtYmVyJyA/IGBbJHtzfV1gIDogYC4ke3N9YCkuam9pbignJykgfHwgJzxyb290Pic7XG5cdFx0XHRcdHByZWZpeEVycm9yKGUsIGBlcnJvciBkaWZmaW5nIGF0ICR7cGF0aFN0cn06IGApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cblx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIE5vIGNoYW5nZXNcblx0XHRcdHRoaXMuX2NsZWFyUGVuZGluZygpO1xuXHRcdFx0cmV0dXJuIHsgb3A6ICdhcHBlbmQnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhc1BlbmRpbmdXcml0ZSA9IHRydWU7XG5cdFx0dGhpcy5fcGVuZGluZ0VudHJ5Q291bnQgPSB0aGlzLl9lbnRyeUNvdW50ICsgZW50cmllcy5sZW5ndGg7XG5cdFx0dGhpcy5fcGVuZGluZ1ByZXZpb3VzID0gY3VycmVudFZhbHVlO1xuXG5cdFx0Ly8gQXBwZW5kIGVudHJpZXMgLSBidWlsZCBzdHJpbmcgZGlyZWN0bHlcblx0XHRsZXQgZGF0YSA9ICcnO1xuXHRcdGZvciAoY29uc3QgZSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRkYXRhICs9IHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGUpICsgJ1xcbic7XG5cdFx0fVxuXHRcdHJldHVybiB7IG9wOiAnYXBwZW5kJywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZyhkYXRhKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbW1pdHMgdGhlIGludGVybmFsIHN0YXRlIGFmdGVyIGEgc3VjY2Vzc2Z1bCB3cml0ZSB0byBkaXNrLlxuXHQgKi9cblx0Y29uZmlybVdyaXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oYXNQZW5kaW5nV3JpdGUpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzID0gdGhpcy5fcGVuZGluZ1ByZXZpb3VzO1xuXHRcdFx0dGhpcy5fZW50cnlDb3VudCA9IHRoaXMuX3BlbmRpbmdFbnRyeUNvdW50O1xuXHRcdFx0dGhpcy5fY2xlYXJQZW5kaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQZW5kaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hhc1BlbmRpbmdXcml0ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3BlbmRpbmdQcmV2aW91cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wZW5kaW5nRW50cnlDb3VudCA9IDA7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVNldChzdGF0ZTogdW5rbm93biwgcGF0aDogT2JqZWN0UGF0aCwgdmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAocGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gUm9vdCByZXBsYWNlbWVudCBoYW5kbGVkIGJ5IGNhbGxlclxuXHRcdH1cblxuXHRcdGxldCBjdXJyZW50ID0gc3RhdGUgYXMgUmVjb3JkPHN0cmluZyB8IG51bWJlciwgdW5rbm93bj47XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXRoLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0Y3VycmVudCA9IGN1cnJlbnRbcGF0aFtpXV0gYXMgUmVjb3JkPHN0cmluZyB8IG51bWJlciwgdW5rbm93bj47XG5cdFx0fVxuXG5cdFx0Y3VycmVudFtwYXRoW3BhdGgubGVuZ3RoIC0gMV1dID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVB1c2goc3RhdGU6IHVua25vd24sIHBhdGg6IE9iamVjdFBhdGgsIHZhbHVlczogdW5rbm93bltdIHwgdW5kZWZpbmVkLCBzdGFydEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRsZXQgY3VycmVudCA9IHN0YXRlIGFzIFJlY29yZDxzdHJpbmcgfCBudW1iZXIsIHVua25vd24+O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGF0aC5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50W3BhdGhbaV1dIGFzIFJlY29yZDxzdHJpbmcgfCBudW1iZXIsIHVua25vd24+O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFycmF5S2V5ID0gcGF0aFtwYXRoLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IGFyciA9IGN1cnJlbnRbYXJyYXlLZXldIGFzIHVua25vd25bXSB8fCBbXTtcblxuXHRcdGlmIChzdGFydEluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFyci5sZW5ndGggPSBzdGFydEluZGV4O1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZXMgJiYgdmFsdWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGFyci5wdXNoKC4uLnZhbHVlcyk7XG5cdFx0fVxuXG5cdFx0Y3VycmVudFthcnJheUtleV0gPSBhcnI7XG5cdH1cblxuXHRwcml2YXRlIF9kaWZmPFQsIFI+KFxuXHRcdHRyYW5zZm9ybTogVHJhbnNmb3JtPFQsIFI+LFxuXHRcdHBhdGg6IE9iamVjdFBhdGgsXG5cdFx0cHJldjogUixcblx0XHRjdXJyOiBSLFxuXHRcdGVudHJpZXM6IEVudHJ5W11cblx0KTogdm9pZCB7XG5cdFx0aWYgKHRyYW5zZm9ybS5raW5kID09PSBUcmFuc2Zvcm1LaW5kLktleSB8fCB0cmFuc2Zvcm0ua2luZCA9PT0gVHJhbnNmb3JtS2luZC5QcmltaXRpdmUpIHtcblx0XHRcdC8vIFNpbXBsZSB2YWx1ZSBjaGFuZ2UgLSBjb3B5IHBhdGggc2luY2Ugd2UncmUgc3RvcmluZyBpdFxuXHRcdFx0aWYgKCF0cmFuc2Zvcm0uZXF1YWxzKHByZXYsIGN1cnIpKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5TZXQsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyciB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzVW5kZWZpbmVkT3JOdWxsKHByZXYpIHx8IGlzVW5kZWZpbmVkT3JOdWxsKGN1cnIpKSB7XG5cdFx0XHRpZiAocHJldiAhPT0gY3Vycikge1xuXHRcdFx0XHRpZiAoY3VyciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLkRlbGV0ZSwgazogcGF0aC5zbGljZSgpIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1cnIgPT09IG51bGwpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuU2V0LCBrOiBwYXRoLnNsaWNlKCksIHY6IG51bGwgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlNldCwgazogcGF0aC5zbGljZSgpLCB2OiBjdXJyIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0cmFuc2Zvcm0ua2luZCA9PT0gVHJhbnNmb3JtS2luZC5BcnJheSkge1xuXHRcdFx0dGhpcy5fZGlmZkFycmF5KHRyYW5zZm9ybSwgcGF0aCwgcHJldiBhcyB1bmtub3duW10sIGN1cnIgYXMgdW5rbm93bltdLCBlbnRyaWVzKTtcblx0XHR9IGVsc2UgaWYgKHRyYW5zZm9ybS5raW5kID09PSBUcmFuc2Zvcm1LaW5kLk9iamVjdCkge1xuXHRcdFx0dGhpcy5fZGlmZk9iamVjdCh0cmFuc2Zvcm0uY2hpbGRyZW4sIHBhdGgsIHByZXYsIGN1cnIsIGVudHJpZXMsIHRyYW5zZm9ybS5zZWFsZWQgYXMgKChvYmo6IHVua25vd24sIHdhc1NlcmlhbGl6ZWQ6IGJvb2xlYW4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRyYW5zZm9ybSBraW5kICR7SlNPTi5zdHJpbmdpZnkodHJhbnNmb3JtKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWZmT2JqZWN0KFxuXHRcdGNoaWxkcmVuOiBTY2hlbWFFbnRyaWVzLFxuXHRcdHBhdGg6IE9iamVjdFBhdGgsXG5cdFx0cHJldjogdW5rbm93bixcblx0XHRjdXJyOiB1bmtub3duLFxuXHRcdGVudHJpZXM6IEVudHJ5W10sXG5cdFx0c2VhbGVkPzogKG9iajogdW5rbm93biwgd2FzU2VyaWFsaXplZDogYm9vbGVhbikgPT4gYm9vbGVhbixcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldk9iaiA9IHByZXYgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3Vyck9iaiA9IGN1cnIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cblx0XHQvLyBGaXJzdCBjaGVjayBrZXkgZmllbGRzIChzb3J0ZWQgdG8gZnJvbnQpIC0gaWYgYW55IGtleSBjaGFuZ2VkLCByZXBsYWNlIHRoZSBlbnRpcmUgb2JqZWN0XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGZvciAoOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IFtrZXksIHRyYW5zZm9ybV0gPSBjaGlsZHJlbltpXTtcblx0XHRcdGlmICh0cmFuc2Zvcm0ua2luZCAhPT0gVHJhbnNmb3JtS2luZC5LZXkpIHtcblx0XHRcdFx0YnJlYWs7IC8vIEtleXMgYXJlIHNvcnRlZCB0byBmcm9udCwgc28gd2UgY2FuIHN0b3Bcblx0XHRcdH1cblx0XHRcdGlmICghdHJhbnNmb3JtLmVxdWFscyhwcmV2T2JqPy5ba2V5XSwgY3Vyck9ialtrZXldKSkge1xuXHRcdFx0XHQvLyBLZXkgY2hhbmdlZCwgcmVwbGFjZSBlbnRpcmUgb2JqZWN0XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5TZXQsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyciB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIGJvdGggb2JqZWN0cyBhcmUgc2VhbGVkLCB3ZSd2ZSBhbHJlYWR5IHZlcmlmaWVkIGtleXMgbWF0Y2ggYWJvdmUsXG5cdFx0Ly8gc28gd2UgY2FuIHNraXAgZGlmZmluZyB0aGUgb3RoZXIgcHJvcGVydGllcyBzaW5jZSBzZWFsZWQgb2JqZWN0cyBkb24ndCBjaGFuZ2Vcblx0XHRpZiAoc2VhbGVkICYmIHNlYWxlZChwcmV2LCB0cnVlKSAmJiBzZWFsZWQoY3VyciwgZmFsc2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZiBlYWNoIHByb3BlcnR5IHVzaW5nIG11dGFibGUgcGF0aFxuXHRcdGZvciAoOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IFtrZXksIHRyYW5zZm9ybV0gPSBjaGlsZHJlbltpXTtcblx0XHRcdHBhdGgucHVzaChrZXkpO1xuXHRcdFx0dGhpcy5fZGlmZih0cmFuc2Zvcm0sIHBhdGgsIHByZXZPYmo/LltrZXldLCBjdXJyT2JqW2tleV0sIGVudHJpZXMpO1xuXHRcdFx0cGF0aC5wb3AoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWZmQXJyYXk8VCwgUj4oXG5cdFx0dHJhbnNmb3JtOiBUcmFuc2Zvcm1BcnJheTxULCBSPixcblx0XHRwYXRoOiBPYmplY3RQYXRoLFxuXHRcdHByZXY6IHVua25vd25bXSB8IHVuZGVmaW5lZCxcblx0XHRjdXJyOiB1bmtub3duW10gfCB1bmRlZmluZWQsXG5cdFx0ZW50cmllczogRW50cnlbXVxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2QXJyID0gcHJldiB8fCBbXTtcblx0XHRjb25zdCBjdXJyQXJyID0gY3VyciB8fCBbXTtcblxuXHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSB0cmFuc2Zvcm0uaXRlbVNjaGVtYTtcblx0XHRjb25zdCBtaW5MZW4gPSBNYXRoLm1pbihwcmV2QXJyLmxlbmd0aCwgY3VyckFyci5sZW5ndGgpO1xuXG5cdFx0Ly8gSWYgdGhlIGl0ZW0gc2NoZW1hIGlzIGFuIG9iamVjdCwgd2UgY2FuIHJlY3Vyc2UgaW50byBpdCB0byBkaWZmIGluZGl2aWR1YWxcblx0XHQvLyBwcm9wZXJ0aWVzIGluc3RlYWQgb2YgcmVwbGFjaW5nIHRoZSBlbnRpcmUgaXRlbS4gSG93ZXZlciwgd2Ugb25seSBkbyB0aGlzXG5cdFx0Ly8gaWYgdGhlIGtleSBmaWVsZHMgbWF0Y2guXG5cdFx0aWYgKGl0ZW1TY2hlbWEua2luZCA9PT0gVHJhbnNmb3JtS2luZC5PYmplY3QpIHtcblx0XHRcdGNvbnN0IGNoaWxkRW50cmllcyA9IGl0ZW1TY2hlbWEuY2hpbGRyZW47XG5cblx0XHRcdC8vIERpZmYgY29tbW9uIGVsZW1lbnRzIGJ5IHJlY3Vyc2luZyBpbnRvIHRoZW1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWluTGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcHJldkl0ZW0gPSBwcmV2QXJyW2ldO1xuXHRcdFx0XHRjb25zdCBjdXJySXRlbSA9IGN1cnJBcnJbaV07XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYga2V5IGZpZWxkcyBtYXRjaCAtIGlmIG5vdCwgd2UgbmVlZCB0byByZXBsYWNlIGZyb20gdGhpcyBwb2ludFxuXHRcdFx0XHRpZiAodGhpcy5faGFzS2V5TWlzbWF0Y2goY2hpbGRFbnRyaWVzLCBwcmV2SXRlbSwgY3Vyckl0ZW0pKSB7XG5cdFx0XHRcdFx0Ly8gS2V5IG1pc21hdGNoOiByZXBsYWNlIGZyb20gdGhpcyBwb2ludCBvbndhcmRcblx0XHRcdFx0XHRjb25zdCBuZXdJdGVtcyA9IGN1cnJBcnIuc2xpY2UoaSk7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgdjogbmV3SXRlbXMubGVuZ3RoID4gMCA/IG5ld0l0ZW1zIDogdW5kZWZpbmVkLCBpIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEtleXMgbWF0Y2gsIHJlY3Vyc2UgaW50byB0aGUgb2JqZWN0XG5cdFx0XHRcdHBhdGgucHVzaChpKTtcblx0XHRcdFx0dGhpcy5fZGlmZk9iamVjdChjaGlsZEVudHJpZXMsIHBhdGgsIHByZXZJdGVtLCBjdXJySXRlbSwgZW50cmllcywgaXRlbVNjaGVtYS5zZWFsZWQpO1xuXHRcdFx0XHRwYXRoLnBvcCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgbGVuZ3RoIGNoYW5nZXNcblx0XHRcdGlmIChjdXJyQXJyLmxlbmd0aCA+IHByZXZBcnIubGVuZ3RoKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIHY6IGN1cnJBcnIuc2xpY2UocHJldkFyci5sZW5ndGgpIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChjdXJyQXJyLmxlbmd0aCA8IHByZXZBcnIubGVuZ3RoKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIGk6IGN1cnJBcnIubGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBObyBjaGlsZHJlbiBzY2hlbWEsIHVzZSB0aGUgb3JpZ2luYWwgcG9zaXRpb25hbCBjb21wYXJpc29uXG5cdFx0XHRsZXQgZmlyc3RNaXNtYXRjaCA9IC0xO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1pbkxlbjsgaSsrKSB7XG5cdFx0XHRcdGlmICghaXRlbVNjaGVtYS5lcXVhbHMocHJldkFycltpXSwgY3VyckFycltpXSkpIHtcblx0XHRcdFx0XHRmaXJzdE1pc21hdGNoID0gaTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmlyc3RNaXNtYXRjaCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gQWxsIGNvbW1vbiBlbGVtZW50cyBtYXRjaFxuXHRcdFx0XHRpZiAoY3VyckFyci5sZW5ndGggPiBwcmV2QXJyLmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIE5ldyBpdGVtcyBhcHBlbmRlZFxuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIHY6IGN1cnJBcnIuc2xpY2UocHJldkFyci5sZW5ndGgpIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJBcnIubGVuZ3RoIDwgcHJldkFyci5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBJdGVtcyByZW1vdmVkIGZyb20gZW5kXG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgaTogY3VyckFyci5sZW5ndGggfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gZWxzZTogc2FtZSBsZW5ndGgsIGFsbCBtYXRjaCAtIG5vIGNoYW5nZVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTWlzbWF0Y2ggZm91bmQsIHJld3JpdGUgZnJvbSB0aGF0IHBvaW50XG5cdFx0XHRcdGNvbnN0IG5ld0l0ZW1zID0gY3VyckFyci5zbGljZShmaXJzdE1pc21hdGNoKTtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgdjogbmV3SXRlbXMubGVuZ3RoID4gMCA/IG5ld0l0ZW1zIDogdW5kZWZpbmVkLCBpOiBmaXJzdE1pc21hdGNoIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc0tleU1pc21hdGNoKGNoaWxkcmVuOiBTY2hlbWFFbnRyaWVzLCBwcmV2OiB1bmtub3duLCBjdXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJldk9iaiA9IHByZXYgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3Vyck9iaiA9IGN1cnIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Zm9yIChjb25zdCBba2V5LCB0cmFuc2Zvcm1dIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRpZiAodHJhbnNmb3JtLmtpbmQgIT09IFRyYW5zZm9ybUtpbmQuS2V5KSB7XG5cdFx0XHRcdGJyZWFrOyAvLyBLZXlzIGFyZSBzb3J0ZWQgdG8gZnJvbnQsIHNvIHdlIGNhbiBzdG9wXG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRyYW5zZm9ybS5lcXVhbHMocHJldk9iaj8uW2tleV0sIGN1cnJPYmpba2V5XSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRc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Q1Y7QUFHQSxVQUFJLFFBQVEsU0FBUyxRQUFRLFFBQVE7QUFDcEMsZ0JBQVEsS0FBSyxFQUFFLE1BQU0sY0FBZ0IsR0FBRyxLQUFLLE1BQU0sR0FBRyxHQUFHLFFBQVEsTUFBTSxRQUFRLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDekYsV0FBVyxRQUFRLFNBQVMsUUFBUSxRQUFRO0FBQzNDLGdCQUFRLEtBQUssRUFBRSxNQUFNLGNBQWdCLEdBQUcsS0FBSyxNQUFNLEdBQUcsR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUFBLE1BQzFFO0FBQUEsSUFDRCxPQUFPO0FBRU4sVUFBSSxnQkFBZ0I7QUFFcEIsZUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDaEMsWUFBSSxDQUFDLFdBQVcsT0FBTyxRQUFRLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxHQUFHO0FBQy9DLDBCQUFnQjtBQUNoQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxrQkFBa0IsSUFBSTtBQUV6QixZQUFJLFFBQVEsU0FBUyxRQUFRLFFBQVE7QUFFcEMsa0JBQVEsS0FBSyxFQUFFLE1BQU0sY0FBZ0IsR0FBRyxLQUFLLE1BQU0sR0FBRyxHQUFHLFFBQVEsTUFBTSxRQUFRLE1BQU0sRUFBRSxDQUFDO0FBQUEsUUFDekYsV0FBVyxRQUFRLFNBQVMsUUFBUSxRQUFRO0FBRTNDLGtCQUFRLEtBQUssRUFBRSxNQUFNLGNBQWdCLEdBQUcsS0FBSyxNQUFNLEdBQUcsR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUFBLFFBQzFFO0FBQUEsTUFFRCxPQUFPO0FBRU4sY0FBTSxXQUFXLFFBQVEsTUFBTSxhQUFhO0FBQzVDLGdCQUFRLEtBQUssRUFBRSxNQUFNLGNBQWdCLEdBQUcsS0FBSyxNQUFNLEdBQUcsR0FBRyxTQUFTLFNBQVMsSUFBSSxXQUFXLFFBQVcsR0FBRyxjQUFjLENBQUM7QUFBQSxNQUN4SDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsVUFBeUIsTUFBZSxNQUF3QjtBQUN2RixVQUFNLFVBQVU7QUFDaEIsVUFBTSxVQUFVO0FBQ2hCLGVBQVcsQ0FBQ0EsTUFBSyxTQUFTLEtBQUssVUFBVTtBQUN4QyxVQUFJLFVBQVUsU0FBUyxhQUFtQjtBQUN6QztBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsVUFBVSxPQUFPLFVBQVVBLElBQUcsR0FBRyxRQUFRQSxJQUFHLENBQUMsR0FBRztBQUNwRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJUcmFuc2Zvcm1LaW5kIiwgInZhbHVlIiwgImtleSIsICJFbnRyeUtpbmQiXQp9Cg==
