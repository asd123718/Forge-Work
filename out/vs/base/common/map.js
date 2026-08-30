var _a, _b, _c;
function getOrSet(map, key, value) {
  let result = map.get(key);
  if (result === void 0) {
    result = value;
    map.set(key, result);
  }
  return result;
}
function mapToString(map) {
  const entries = [];
  map.forEach((value, key) => {
    entries.push(`${key} => ${value}`);
  });
  return `Map(${map.size}) {${entries.join(", ")}}`;
}
function setToString(set) {
  const entries = [];
  set.forEach((value) => {
    entries.push(value);
  });
  return `Set(${set.size}) {${entries.join(", ")}}`;
}
class ResourceMapEntry {
  constructor(uri, value) {
    this.uri = uri;
    this.value = value;
  }
}
function isEntries(arg) {
  return Array.isArray(arg);
}
const _ResourceMap = class _ResourceMap {
  constructor(arg, toKey) {
    this[_a] = "ResourceMap";
    if (arg instanceof _ResourceMap) {
      this.map = new Map(arg.map);
      this.toKey = toKey ?? _ResourceMap.defaultToKey;
    } else if (isEntries(arg)) {
      this.map = /* @__PURE__ */ new Map();
      this.toKey = toKey ?? _ResourceMap.defaultToKey;
      for (const [resource, value] of arg) {
        this.set(resource, value);
      }
    } else {
      this.map = /* @__PURE__ */ new Map();
      this.toKey = arg ?? _ResourceMap.defaultToKey;
    }
  }
  set(resource, value) {
    this.map.set(this.toKey(resource), new ResourceMapEntry(resource, value));
    return this;
  }
  get(resource) {
    return this.map.get(this.toKey(resource))?.value;
  }
  has(resource) {
    return this.map.has(this.toKey(resource));
  }
  get size() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  delete(resource) {
    return this.map.delete(this.toKey(resource));
  }
  forEach(clb, thisArg) {
    if (typeof thisArg !== "undefined") {
      clb = clb.bind(thisArg);
    }
    for (const [_, entry] of this.map) {
      clb(entry.value, entry.uri, this);
    }
  }
  *values() {
    for (const entry of this.map.values()) {
      yield entry.value;
    }
  }
  *keys() {
    for (const entry of this.map.values()) {
      yield entry.uri;
    }
  }
  *entries() {
    for (const entry of this.map.values()) {
      yield [entry.uri, entry.value];
    }
  }
  *[(_a = Symbol.toStringTag, Symbol.iterator)]() {
    for (const [, entry] of this.map) {
      yield [entry.uri, entry.value];
    }
  }
};
_ResourceMap.defaultToKey = (resource) => resource.toString();
let ResourceMap = _ResourceMap;
class ResourceSet {
  constructor(entriesOrKey, toKey) {
    this[_b] = "ResourceSet";
    if (!entriesOrKey || typeof entriesOrKey === "function") {
      this._map = new ResourceMap(entriesOrKey);
    } else {
      this._map = new ResourceMap(toKey);
      entriesOrKey.forEach(this.add, this);
    }
  }
  get size() {
    return this._map.size;
  }
  add(value) {
    this._map.set(value, value);
    return this;
  }
  clear() {
    this._map.clear();
  }
  delete(value) {
    return this._map.delete(value);
  }
  forEach(callbackfn, thisArg) {
    this._map.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
  }
  has(value) {
    return this._map.has(value);
  }
  entries() {
    return this._map.entries();
  }
  keys() {
    return this._map.keys();
  }
  values() {
    return this._map.keys();
  }
  [(_b = Symbol.toStringTag, Symbol.iterator)]() {
    return this.keys();
  }
}
var Touch = /* @__PURE__ */ ((Touch2) => {
  Touch2[Touch2["None"] = 0] = "None";
  Touch2[Touch2["AsOld"] = 1] = "AsOld";
  Touch2[Touch2["AsNew"] = 2] = "AsNew";
  return Touch2;
})(Touch || {});
class LinkedMap {
  constructor() {
    this[_c] = "LinkedMap";
    this._map = /* @__PURE__ */ new Map();
    this._head = void 0;
    this._tail = void 0;
    this._size = 0;
    this._state = 0;
  }
  clear() {
    this._map.clear();
    this._head = void 0;
    this._tail = void 0;
    this._size = 0;
    this._state++;
  }
  isEmpty() {
    return !this._head && !this._tail;
  }
  get size() {
    return this._size;
  }
  get first() {
    return this._head?.value;
  }
  get last() {
    return this._tail?.value;
  }
  has(key) {
    return this._map.has(key);
  }
  get(key, touch = 0 /* None */) {
    const item = this._map.get(key);
    if (!item) {
      return void 0;
    }
    if (touch !== 0 /* None */) {
      this.touch(item, touch);
    }
    return item.value;
  }
  set(key, value, touch = 0 /* None */) {
    let item = this._map.get(key);
    if (item) {
      item.value = value;
      if (touch !== 0 /* None */) {
        this.touch(item, touch);
      }
    } else {
      item = { key, value, next: void 0, previous: void 0 };
      switch (touch) {
        case 0 /* None */:
          this.addItemLast(item);
          break;
        case 1 /* AsOld */:
          this.addItemFirst(item);
          break;
        case 2 /* AsNew */:
          this.addItemLast(item);
          break;
        default:
          this.addItemLast(item);
          break;
      }
      this._map.set(key, item);
      this._size++;
    }
    return this;
  }
  delete(key) {
    return !!this.remove(key);
  }
  remove(key) {
    const item = this._map.get(key);
    if (!item) {
      return void 0;
    }
    this._map.delete(key);
    this.removeItem(item);
    this._size--;
    return item.value;
  }
  shift() {
    if (!this._head && !this._tail) {
      return void 0;
    }
    if (!this._head || !this._tail) {
      throw new Error("Invalid list");
    }
    const item = this._head;
    this._map.delete(item.key);
    this.removeItem(item);
    this._size--;
    return item.value;
  }
  forEach(callbackfn, thisArg) {
    const state = this._state;
    let current = this._head;
    while (current) {
      if (thisArg) {
        callbackfn.bind(thisArg)(current.value, current.key, this);
      } else {
        callbackfn(current.value, current.key, this);
      }
      if (this._state !== state) {
        throw new Error(`LinkedMap got modified during iteration.`);
      }
      current = current.next;
    }
  }
  keys() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: current.key, done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  values() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: current.value, done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  entries() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: [current.key, current.value], done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  [(_c = Symbol.toStringTag, Symbol.iterator)]() {
    return this.entries();
  }
  trimOld(newSize) {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }
    let current = this._head;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this._map.delete(current.key);
      current = current.next;
      currentSize--;
    }
    this._head = current;
    this._size = currentSize;
    if (current) {
      current.previous = void 0;
    }
    this._state++;
  }
  trimNew(newSize) {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }
    let current = this._tail;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this._map.delete(current.key);
      current = current.previous;
      currentSize--;
    }
    this._tail = current;
    this._size = currentSize;
    if (current) {
      current.next = void 0;
    }
    this._state++;
  }
  addItemFirst(item) {
    if (!this._head && !this._tail) {
      this._tail = item;
    } else if (!this._head) {
      throw new Error("Invalid list");
    } else {
      item.next = this._head;
      this._head.previous = item;
    }
    this._head = item;
    this._state++;
  }
  addItemLast(item) {
    if (!this._head && !this._tail) {
      this._head = item;
    } else if (!this._tail) {
      throw new Error("Invalid list");
    } else {
      item.previous = this._tail;
      this._tail.next = item;
    }
    this._tail = item;
    this._state++;
  }
  removeItem(item) {
    if (item === this._head && item === this._tail) {
      this._head = void 0;
      this._tail = void 0;
    } else if (item === this._head) {
      if (!item.next) {
        throw new Error("Invalid list");
      }
      item.next.previous = void 0;
      this._head = item.next;
    } else if (item === this._tail) {
      if (!item.previous) {
        throw new Error("Invalid list");
      }
      item.previous.next = void 0;
      this._tail = item.previous;
    } else {
      const next = item.next;
      const previous = item.previous;
      if (!next || !previous) {
        throw new Error("Invalid list");
      }
      next.previous = previous;
      previous.next = next;
    }
    item.next = void 0;
    item.previous = void 0;
    this._state++;
  }
  touch(item, touch) {
    if (!this._head || !this._tail) {
      throw new Error("Invalid list");
    }
    if (touch !== 1 /* AsOld */ && touch !== 2 /* AsNew */) {
      return;
    }
    if (touch === 1 /* AsOld */) {
      if (item === this._head) {
        return;
      }
      const next = item.next;
      const previous = item.previous;
      if (item === this._tail) {
        previous.next = void 0;
        this._tail = previous;
      } else {
        next.previous = previous;
        previous.next = next;
      }
      item.previous = void 0;
      item.next = this._head;
      this._head.previous = item;
      this._head = item;
      this._state++;
    } else if (touch === 2 /* AsNew */) {
      if (item === this._tail) {
        return;
      }
      const next = item.next;
      const previous = item.previous;
      if (item === this._head) {
        next.previous = void 0;
        this._head = next;
      } else {
        next.previous = previous;
        previous.next = next;
      }
      item.next = void 0;
      item.previous = this._tail;
      this._tail.next = item;
      this._tail = item;
      this._state++;
    }
  }
  toJSON() {
    const data = [];
    this.forEach((value, key) => {
      data.push([key, value]);
    });
    return data;
  }
  fromJSON(data) {
    this.clear();
    for (const [key, value] of data) {
      this.set(key, value);
    }
  }
}
class Cache extends LinkedMap {
  constructor(limit, ratio = 1) {
    super();
    this._limit = limit;
    this._ratio = Math.min(Math.max(0, ratio), 1);
  }
  get limit() {
    return this._limit;
  }
  set limit(limit) {
    this._limit = limit;
    this.checkTrim();
  }
  get ratio() {
    return this._ratio;
  }
  set ratio(ratio) {
    this._ratio = Math.min(Math.max(0, ratio), 1);
    this.checkTrim();
  }
  get(key, touch = 2 /* AsNew */) {
    return super.get(key, touch);
  }
  peek(key) {
    return super.get(key, 0 /* None */);
  }
  set(key, value) {
    super.set(key, value, 2 /* AsNew */);
    return this;
  }
  checkTrim() {
    if (this.size > this._limit) {
      this.trim(Math.round(this._limit * this._ratio));
    }
  }
}
class LRUCache extends Cache {
  constructor(limit, ratio = 1) {
    super(limit, ratio);
  }
  trim(newSize) {
    this.trimOld(newSize);
  }
  set(key, value) {
    super.set(key, value);
    this.checkTrim();
    return this;
  }
}
class MRUCache extends Cache {
  constructor(limit, ratio = 1) {
    super(limit, ratio);
  }
  trim(newSize) {
    this.trimNew(newSize);
  }
  set(key, value) {
    if (this._limit <= this.size && !this.has(key)) {
      this.trim(Math.round(this._limit * this._ratio) - 1);
    }
    super.set(key, value);
    return this;
  }
}
class CounterSet {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  add(value) {
    this.map.set(value, (this.map.get(value) || 0) + 1);
    return this;
  }
  delete(value) {
    let counter = this.map.get(value) || 0;
    if (counter === 0) {
      return false;
    }
    counter--;
    if (counter === 0) {
      this.map.delete(value);
    } else {
      this.map.set(value, counter);
    }
    return true;
  }
  has(value) {
    return this.map.has(value);
  }
}
class BidirectionalMap {
  constructor(entries) {
    this._m1 = /* @__PURE__ */ new Map();
    this._m2 = /* @__PURE__ */ new Map();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }
  clear() {
    this._m1.clear();
    this._m2.clear();
  }
  set(key, value) {
    const previousValue = this._m1.get(key);
    if (previousValue !== void 0) {
      this._m2.delete(previousValue);
    }
    this._m1.set(key, value);
    this._m2.set(value, key);
  }
  get(key) {
    return this._m1.get(key);
  }
  getKey(value) {
    return this._m2.get(value);
  }
  delete(key) {
    const value = this._m1.get(key);
    if (value === void 0) {
      return false;
    }
    this._m1.delete(key);
    this._m2.delete(value);
    return true;
  }
  forEach(callbackfn, thisArg) {
    this._m1.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }
  keys() {
    return this._m1.keys();
  }
  values() {
    return this._m1.values();
  }
}
class SetMap {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    let values = this.map.get(key);
    if (!values) {
      values = /* @__PURE__ */ new Set();
      this.map.set(key, values);
    }
    values.add(value);
  }
  delete(key, value) {
    const values = this.map.get(key);
    if (!values) {
      return;
    }
    values.delete(value);
    if (values.size === 0) {
      this.map.delete(key);
    }
  }
  forEach(key, fn) {
    const values = this.map.get(key);
    if (!values) {
      return;
    }
    values.forEach(fn);
  }
  get(key) {
    const values = this.map.get(key);
    if (!values) {
      return /* @__PURE__ */ new Set();
    }
    return values;
  }
}
function mapsStrictEqualIgnoreOrder(a, b) {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (!b.has(key) || b.get(key) !== value) {
      return false;
    }
  }
  for (const [key] of b) {
    if (!a.has(key)) {
      return false;
    }
  }
  return true;
}
class NKeyMap {
  constructor() {
    this._data = /* @__PURE__ */ new Map();
  }
  /**
   * Sets a value on the map. Note that unlike a standard `Map`, the first argument is the value.
   * This is because the spread operator is used for the keys and must be last..
   * @param value The value to set.
   * @param keys The keys for the value.
   */
  set(value, ...keys) {
    let currentMap = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      let nextMap = currentMap.get(keys[i]);
      if (nextMap === void 0) {
        nextMap = /* @__PURE__ */ new Map();
        currentMap.set(keys[i], nextMap);
      }
      currentMap = nextMap;
    }
    currentMap.set(keys[keys.length - 1], value);
  }
  get(...keys) {
    let currentMap = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      const nextMap = currentMap.get(keys[i]);
      if (nextMap === void 0) {
        return void 0;
      }
      currentMap = nextMap;
    }
    return currentMap.get(keys[keys.length - 1]);
  }
  delete(...keys) {
    const maps = [this._data];
    let currentMap = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      const nextMap = currentMap.get(keys[i]);
      if (nextMap === void 0) {
        return false;
      }
      currentMap = nextMap;
      maps.push(currentMap);
    }
    const deleted = currentMap.delete(keys[keys.length - 1]);
    for (let i = keys.length - 2; deleted && i >= 0; i--) {
      if (maps[i + 1].size === 0) {
        maps[i].delete(keys[i]);
      }
    }
    return deleted;
  }
  deleteAll(...keys) {
    if (keys.length === 0) {
      const hadData = this._data.size > 0;
      this._data.clear();
      return hadData;
    }
    const maps = [this._data];
    let currentMap = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      const nextMap = currentMap.get(keys[i]);
      if (nextMap === void 0) {
        return false;
      }
      currentMap = nextMap;
      maps.push(currentMap);
    }
    const deleted = currentMap.delete(keys[keys.length - 1]);
    for (let i = keys.length - 2; deleted && i >= 0; i--) {
      if (maps[i + 1].size === 0) {
        maps[i].delete(keys[i]);
      }
    }
    return deleted;
  }
  clear() {
    this._data.clear();
  }
  *getAll(...keys) {
    let currentMap = this._data;
    for (const key of keys) {
      const nextMap = currentMap.get(key);
      if (nextMap === void 0) {
        return;
      }
      currentMap = nextMap;
    }
    yield* this._values(currentMap);
  }
  *values() {
    yield* this._values(this._data);
  }
  *_values(map) {
    for (const value of map.values()) {
      if (value instanceof Map) {
        yield* this._values(value);
      } else {
        yield value;
      }
    }
  }
  /**
   * Get a textual representation of the map for debugging purposes.
   */
  toString() {
    const printMap = (map, depth) => {
      let result = "";
      for (const [key, value] of map) {
        result += `${"  ".repeat(depth)}${key}: `;
        if (value instanceof Map) {
          result += "\n" + printMap(value, depth + 1);
        } else {
          result += `${value}
`;
        }
      }
      return result;
    };
    return printMap(this._data, 0);
  }
}
export {
  BidirectionalMap,
  CounterSet,
  LRUCache,
  LinkedMap,
  MRUCache,
  NKeyMap,
  ResourceMap,
  ResourceSet,
  SetMap,
  Touch,
  getOrSet,
  mapToString,
  mapsStrictEqualIgnoreOrder,
  setToString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG1hcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4vdXJpLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9yU2V0PEssIFY+KG1hcDogTWFwPEssIFY+LCBrZXk6IEssIHZhbHVlOiBWKTogViB7XG5cdGxldCByZXN1bHQgPSBtYXAuZ2V0KGtleSk7XG5cdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJlc3VsdCA9IHZhbHVlO1xuXHRcdG1hcC5zZXQoa2V5LCByZXN1bHQpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcFRvU3RyaW5nPEssIFY+KG1hcDogTWFwPEssIFY+KTogc3RyaW5nIHtcblx0Y29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcblx0bWFwLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRlbnRyaWVzLnB1c2goYCR7a2V5fSA9PiAke3ZhbHVlfWApO1xuXHR9KTtcblxuXHRyZXR1cm4gYE1hcCgke21hcC5zaXplfSkgeyR7ZW50cmllcy5qb2luKCcsICcpfX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0VG9TdHJpbmc8Sz4oc2V0OiBTZXQ8Sz4pOiBzdHJpbmcge1xuXHRjb25zdCBlbnRyaWVzOiBLW10gPSBbXTtcblx0c2V0LmZvckVhY2godmFsdWUgPT4ge1xuXHRcdGVudHJpZXMucHVzaCh2YWx1ZSk7XG5cdH0pO1xuXG5cdHJldHVybiBgU2V0KCR7c2V0LnNpemV9KSB7JHtlbnRyaWVzLmpvaW4oJywgJyl9fWA7XG59XG5cbmludGVyZmFjZSBSZXNvdXJjZU1hcEtleUZuIHtcblx0KHJlc291cmNlOiBVUkkpOiBzdHJpbmc7XG59XG5cbmNsYXNzIFJlc291cmNlTWFwRW50cnk8VD4ge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB1cmk6IFVSSSwgcmVhZG9ubHkgdmFsdWU6IFQpIHsgfVxufVxuXG5mdW5jdGlvbiBpc0VudHJpZXM8VD4oYXJnOiBSZXNvdXJjZU1hcDxUPiB8IFJlc291cmNlTWFwS2V5Rm4gfCByZWFkb25seSAocmVhZG9ubHkgW1VSSSwgVF0pW10gfCB1bmRlZmluZWQpOiBhcmcgaXMgcmVhZG9ubHkgKHJlYWRvbmx5IFtVUkksIFRdKVtdIHtcblx0cmV0dXJuIEFycmF5LmlzQXJyYXkoYXJnKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlc291cmNlTWFwPFQ+IGltcGxlbWVudHMgTWFwPFVSSSwgVD4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGRlZmF1bHRUb0tleSA9IChyZXNvdXJjZTogVVJJKSA9PiByZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdHJlYWRvbmx5IFtTeW1ib2wudG9TdHJpbmdUYWddID0gJ1Jlc291cmNlTWFwJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcDogTWFwPHN0cmluZywgUmVzb3VyY2VNYXBFbnRyeTxUPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9LZXk6IFJlc291cmNlTWFwS2V5Rm47XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSB0b0tleSBDdXN0b20gdXJpIGlkZW50aXR5IGZ1bmN0aW9uLCBlLmcgdXNlIGFuIGV4aXN0aW5nIGBJRXh0VXJpI2dldENvbXBhcmlzb25gLXV0aWxcblx0ICovXG5cdGNvbnN0cnVjdG9yKHRvS2V5PzogUmVzb3VyY2VNYXBLZXlGbik7XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSBvdGhlciBBbm90aGVyIHJlc291cmNlIHdoaWNoIHRoaXMgbWFwcyBpcyBjcmVhdGVkIGZyb21cblx0ICogQHBhcmFtIHRvS2V5IEN1c3RvbSB1cmkgaWRlbnRpdHkgZnVuY3Rpb24sIGUuZyB1c2UgYW4gZXhpc3RpbmcgYElFeHRVcmkjZ2V0Q29tcGFyaXNvbmAtdXRpbFxuXHQgKi9cblx0Y29uc3RydWN0b3Iob3RoZXI/OiBSZXNvdXJjZU1hcDxUPiwgdG9LZXk/OiBSZXNvdXJjZU1hcEtleUZuKTtcblxuXHQvKipcblx0ICpcblx0ICogQHBhcmFtIG90aGVyIEFub3RoZXIgcmVzb3VyY2Ugd2hpY2ggdGhpcyBtYXBzIGlzIGNyZWF0ZWQgZnJvbVxuXHQgKiBAcGFyYW0gdG9LZXkgQ3VzdG9tIHVyaSBpZGVudGl0eSBmdW5jdGlvbiwgZS5nIHVzZSBhbiBleGlzdGluZyBgSUV4dFVyaSNnZXRDb21wYXJpc29uYC11dGlsXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihlbnRyaWVzPzogcmVhZG9ubHkgKHJlYWRvbmx5IFtVUkksIFRdKVtdLCB0b0tleT86IFJlc291cmNlTWFwS2V5Rm4pO1xuXG5cdGNvbnN0cnVjdG9yKGFyZz86IFJlc291cmNlTWFwPFQ+IHwgUmVzb3VyY2VNYXBLZXlGbiB8IHJlYWRvbmx5IChyZWFkb25seSBbVVJJLCBUXSlbXSwgdG9LZXk/OiBSZXNvdXJjZU1hcEtleUZuKSB7XG5cdFx0aWYgKGFyZyBpbnN0YW5jZW9mIFJlc291cmNlTWFwKSB7XG5cdFx0XHR0aGlzLm1hcCA9IG5ldyBNYXAoYXJnLm1hcCk7XG5cdFx0XHR0aGlzLnRvS2V5ID0gdG9LZXkgPz8gUmVzb3VyY2VNYXAuZGVmYXVsdFRvS2V5O1xuXHRcdH0gZWxzZSBpZiAoaXNFbnRyaWVzKGFyZykpIHtcblx0XHRcdHRoaXMubWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0dGhpcy50b0tleSA9IHRvS2V5ID8/IFJlc291cmNlTWFwLmRlZmF1bHRUb0tleTtcblxuXHRcdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIHZhbHVlXSBvZiBhcmcpIHtcblx0XHRcdFx0dGhpcy5zZXQocmVzb3VyY2UsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLnRvS2V5ID0gYXJnID8/IFJlc291cmNlTWFwLmRlZmF1bHRUb0tleTtcblx0XHR9XG5cdH1cblxuXHRzZXQocmVzb3VyY2U6IFVSSSwgdmFsdWU6IFQpOiB0aGlzIHtcblx0XHR0aGlzLm1hcC5zZXQodGhpcy50b0tleShyZXNvdXJjZSksIG5ldyBSZXNvdXJjZU1hcEVudHJ5KHJlc291cmNlLCB2YWx1ZSkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0Z2V0KHJlc291cmNlOiBVUkkpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tYXAuZ2V0KHRoaXMudG9LZXkocmVzb3VyY2UpKT8udmFsdWU7XG5cdH1cblxuXHRoYXMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hcC5oYXModGhpcy50b0tleShyZXNvdXJjZSkpO1xuXHR9XG5cblx0Z2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tYXAuc2l6ZTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMubWFwLmNsZWFyKCk7XG5cdH1cblxuXHRkZWxldGUocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hcC5kZWxldGUodGhpcy50b0tleShyZXNvdXJjZSkpO1xuXHR9XG5cblx0Zm9yRWFjaChjbGI6ICh2YWx1ZTogVCwga2V5OiBVUkksIG1hcDogTWFwPFVSSSwgVD4pID0+IHZvaWQsIHRoaXNBcmc/OiBvYmplY3QpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXNBcmcgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjbGIgPSBjbGIuYmluZCh0aGlzQXJnKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbXywgZW50cnldIG9mIHRoaXMubWFwKSB7XG5cdFx0XHRjbGIoZW50cnkudmFsdWUsIGVudHJ5LnVyaSwgdGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0KnZhbHVlcygpOiBNYXBJdGVyYXRvcjxUPiB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLm1hcC52YWx1ZXMoKSkge1xuXHRcdFx0eWllbGQgZW50cnkudmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0KmtleXMoKTogTWFwSXRlcmF0b3I8VVJJPiB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLm1hcC52YWx1ZXMoKSkge1xuXHRcdFx0eWllbGQgZW50cnkudXJpO1xuXHRcdH1cblx0fVxuXG5cdCplbnRyaWVzKCk6IE1hcEl0ZXJhdG9yPFtVUkksIFRdPiB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLm1hcC52YWx1ZXMoKSkge1xuXHRcdFx0eWllbGQgW2VudHJ5LnVyaSwgZW50cnkudmFsdWVdO1xuXHRcdH1cblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBNYXBJdGVyYXRvcjxbVVJJLCBUXT4ge1xuXHRcdGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMubWFwKSB7XG5cdFx0XHR5aWVsZCBbZW50cnkudXJpLCBlbnRyeS52YWx1ZV07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZVNldCBpbXBsZW1lbnRzIFNldDxVUkk+IHtcblxuXHRyZWFkb25seSBbU3ltYm9sLnRvU3RyaW5nVGFnXTogc3RyaW5nID0gJ1Jlc291cmNlU2V0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXA6IFJlc291cmNlTWFwPFVSST47XG5cblx0Y29uc3RydWN0b3IodG9LZXk/OiBSZXNvdXJjZU1hcEtleUZuKTtcblx0Y29uc3RydWN0b3IoZW50cmllczogcmVhZG9ubHkgVVJJW10sIHRvS2V5PzogUmVzb3VyY2VNYXBLZXlGbik7XG5cdGNvbnN0cnVjdG9yKGVudHJpZXNPcktleT86IHJlYWRvbmx5IFVSSVtdIHwgUmVzb3VyY2VNYXBLZXlGbiwgdG9LZXk/OiBSZXNvdXJjZU1hcEtleUZuKSB7XG5cdFx0aWYgKCFlbnRyaWVzT3JLZXkgfHwgdHlwZW9mIGVudHJpZXNPcktleSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhpcy5fbWFwID0gbmV3IFJlc291cmNlTWFwKGVudHJpZXNPcktleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21hcCA9IG5ldyBSZXNvdXJjZU1hcCh0b0tleSk7XG5cdFx0XHRlbnRyaWVzT3JLZXkuZm9yRWFjaCh0aGlzLmFkZCwgdGhpcyk7XG5cdFx0fVxuXHR9XG5cblxuXHRnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuc2l6ZTtcblx0fVxuXG5cdGFkZCh2YWx1ZTogVVJJKTogdGhpcyB7XG5cdFx0dGhpcy5fbWFwLnNldCh2YWx1ZSwgdmFsdWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFwLmNsZWFyKCk7XG5cdH1cblxuXHRkZWxldGUodmFsdWU6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuZGVsZXRlKHZhbHVlKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2tmbjogKHZhbHVlOiBVUkksIHZhbHVlMjogVVJJLCBzZXQ6IFNldDxVUkk+KSA9PiB2b2lkLCB0aGlzQXJnPzogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX21hcC5mb3JFYWNoKChfdmFsdWUsIGtleSkgPT4gY2FsbGJhY2tmbi5jYWxsKHRoaXNBcmcsIGtleSwga2V5LCB0aGlzKSk7XG5cdH1cblxuXHRoYXModmFsdWU6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuaGFzKHZhbHVlKTtcblx0fVxuXG5cdGVudHJpZXMoKTogU2V0SXRlcmF0b3I8W1VSSSwgVVJJXT4ge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuZW50cmllcygpIGFzIHVua25vd24gYXMgU2V0SXRlcmF0b3I8W1VSSSwgVVJJXT47XG5cdH1cblxuXHRrZXlzKCk6IFNldEl0ZXJhdG9yPFVSST4ge1xuXHRcdHJldHVybiB0aGlzLl9tYXAua2V5cygpIGFzIHVua25vd24gYXMgU2V0SXRlcmF0b3I8VVJJPjtcblx0fVxuXG5cdHZhbHVlcygpOiBTZXRJdGVyYXRvcjxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwLmtleXMoKSBhcyB1bmtub3duIGFzIFNldEl0ZXJhdG9yPFVSST47XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBTZXRJdGVyYXRvcjxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5rZXlzKCk7XG5cdH1cbn1cblxuXG5pbnRlcmZhY2UgSXRlbTxLLCBWPiB7XG5cdHByZXZpb3VzOiBJdGVtPEssIFY+IHwgdW5kZWZpbmVkO1xuXHRuZXh0OiBJdGVtPEssIFY+IHwgdW5kZWZpbmVkO1xuXHRrZXk6IEs7XG5cdHZhbHVlOiBWO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUb3VjaCB7XG5cdE5vbmUgPSAwLFxuXHRBc09sZCA9IDEsXG5cdEFzTmV3ID0gMlxufVxuXG5leHBvcnQgY2xhc3MgTGlua2VkTWFwPEssIFY+IGltcGxlbWVudHMgTWFwPEssIFY+IHtcblxuXHRyZWFkb25seSBbU3ltYm9sLnRvU3RyaW5nVGFnXSA9ICdMaW5rZWRNYXAnO1xuXG5cdHByaXZhdGUgX21hcDogTWFwPEssIEl0ZW08SywgVj4+O1xuXHRwcml2YXRlIF9oZWFkOiBJdGVtPEssIFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90YWlsOiBJdGVtPEssIFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaXplOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfc3RhdGU6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9tYXAgPSBuZXcgTWFwPEssIEl0ZW08SywgVj4+KCk7XG5cdFx0dGhpcy5faGVhZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90YWlsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NpemUgPSAwO1xuXHRcdHRoaXMuX3N0YXRlID0gMDtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX21hcC5jbGVhcigpO1xuXHRcdHRoaXMuX2hlYWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGFpbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zaXplID0gMDtcblx0XHR0aGlzLl9zdGF0ZSsrO1xuXHR9XG5cblx0aXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX2hlYWQgJiYgIXRoaXMuX3RhaWw7XG5cdH1cblxuXHRnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zaXplO1xuXHR9XG5cblx0Z2V0IGZpcnN0KCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9oZWFkPy52YWx1ZTtcblx0fVxuXG5cdGdldCBsYXN0KCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90YWlsPy52YWx1ZTtcblx0fVxuXG5cdGhhcyhrZXk6IEspOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwLmhhcyhrZXkpO1xuXHR9XG5cblx0Z2V0KGtleTogSywgdG91Y2g6IFRvdWNoID0gVG91Y2guTm9uZSk6IFYgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9tYXAuZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodG91Y2ggIT09IFRvdWNoLk5vbmUpIHtcblx0XHRcdHRoaXMudG91Y2goaXRlbSwgdG91Y2gpO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbS52YWx1ZTtcblx0fVxuXG5cdHNldChrZXk6IEssIHZhbHVlOiBWLCB0b3VjaDogVG91Y2ggPSBUb3VjaC5Ob25lKTogdGhpcyB7XG5cdFx0bGV0IGl0ZW0gPSB0aGlzLl9tYXAuZ2V0KGtleSk7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdGl0ZW0udmFsdWUgPSB2YWx1ZTtcblx0XHRcdGlmICh0b3VjaCAhPT0gVG91Y2guTm9uZSkge1xuXHRcdFx0XHR0aGlzLnRvdWNoKGl0ZW0sIHRvdWNoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbSA9IHsga2V5LCB2YWx1ZSwgbmV4dDogdW5kZWZpbmVkLCBwcmV2aW91czogdW5kZWZpbmVkIH07XG5cdFx0XHRzd2l0Y2ggKHRvdWNoKSB7XG5cdFx0XHRcdGNhc2UgVG91Y2guTm9uZTpcblx0XHRcdFx0XHR0aGlzLmFkZEl0ZW1MYXN0KGl0ZW0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRvdWNoLkFzT2xkOlxuXHRcdFx0XHRcdHRoaXMuYWRkSXRlbUZpcnN0KGl0ZW0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRvdWNoLkFzTmV3OlxuXHRcdFx0XHRcdHRoaXMuYWRkSXRlbUxhc3QoaXRlbSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhpcy5hZGRJdGVtTGFzdChpdGVtKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuX21hcC5zZXQoa2V5LCBpdGVtKTtcblx0XHRcdHRoaXMuX3NpemUrKztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRkZWxldGUoa2V5OiBLKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5yZW1vdmUoa2V5KTtcblx0fVxuXG5cdHJlbW92ZShrZXk6IEspOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fbWFwLmdldChrZXkpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fbWFwLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMucmVtb3ZlSXRlbShpdGVtKTtcblx0XHR0aGlzLl9zaXplLS07XG5cdFx0cmV0dXJuIGl0ZW0udmFsdWU7XG5cdH1cblxuXHRzaGlmdCgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2hlYWQgJiYgIXRoaXMuX3RhaWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faGVhZCB8fCAhdGhpcy5fdGFpbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3QnKTtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2hlYWQ7XG5cdFx0dGhpcy5fbWFwLmRlbGV0ZShpdGVtLmtleSk7XG5cdFx0dGhpcy5yZW1vdmVJdGVtKGl0ZW0pO1xuXHRcdHRoaXMuX3NpemUtLTtcblx0XHRyZXR1cm4gaXRlbS52YWx1ZTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2tmbjogKHZhbHVlOiBWLCBrZXk6IEssIG1hcDogTWFwPEssIFY+KSA9PiB2b2lkLCB0aGlzQXJnPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdFx0bGV0IGN1cnJlbnQgPSB0aGlzLl9oZWFkO1xuXHRcdHdoaWxlIChjdXJyZW50KSB7XG5cdFx0XHRpZiAodGhpc0FyZykge1xuXHRcdFx0XHRjYWxsYmFja2ZuLmJpbmQodGhpc0FyZykoY3VycmVudC52YWx1ZSwgY3VycmVudC5rZXksIHRoaXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FsbGJhY2tmbihjdXJyZW50LnZhbHVlLCBjdXJyZW50LmtleSwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUgIT09IHN0YXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTGlua2VkTWFwIGdvdCBtb2RpZmllZCBkdXJpbmcgaXRlcmF0aW9uLmApO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudCA9IGN1cnJlbnQubmV4dDtcblx0XHR9XG5cdH1cblxuXHRrZXlzKCk6IE1hcEl0ZXJhdG9yPEs+IHtcblx0XHRjb25zdCBtYXAgPSB0aGlzO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdFx0bGV0IGN1cnJlbnQgPSB0aGlzLl9oZWFkO1xuXHRcdGNvbnN0IGl0ZXJhdG9yOiBNYXBJdGVyYXRvcjxLPiA9IHtcblx0XHRcdFtTeW1ib2wuaXRlcmF0b3JdKCkge1xuXHRcdFx0XHRyZXR1cm4gaXRlcmF0b3I7XG5cdFx0XHR9LFxuXHRcdFx0W1N5bWJvbC5kaXNwb3NlXSgpIHsgLyogbm8tb3AgKi8gfSxcblx0XHRcdG5leHQoKTogSXRlcmF0b3JSZXN1bHQ8Sz4ge1xuXHRcdFx0XHRpZiAobWFwLl9zdGF0ZSAhPT0gc3RhdGUpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExpbmtlZE1hcCBnb3QgbW9kaWZpZWQgZHVyaW5nIGl0ZXJhdGlvbi5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHsgdmFsdWU6IGN1cnJlbnQua2V5LCBkb25lOiBmYWxzZSB9O1xuXHRcdFx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogdW5kZWZpbmVkLCBkb25lOiB0cnVlIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBpdGVyYXRvcjtcblx0fVxuXG5cdHZhbHVlcygpOiBNYXBJdGVyYXRvcjxWPiB7XG5cdFx0Y29uc3QgbWFwID0gdGhpcztcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlO1xuXHRcdGxldCBjdXJyZW50ID0gdGhpcy5faGVhZDtcblx0XHRjb25zdCBpdGVyYXRvcjogTWFwSXRlcmF0b3I8Vj4gPSB7XG5cdFx0XHRbU3ltYm9sLml0ZXJhdG9yXSgpIHtcblx0XHRcdFx0cmV0dXJuIGl0ZXJhdG9yO1xuXHRcdFx0fSxcblx0XHRcdFtTeW1ib2wuZGlzcG9zZV0oKSB7IC8qIG5vLW9wICovIH0sXG5cdFx0XHRuZXh0KCk6IEl0ZXJhdG9yUmVzdWx0PFY+IHtcblx0XHRcdFx0aWYgKG1hcC5fc3RhdGUgIT09IHN0YXRlKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMaW5rZWRNYXAgZ290IG1vZGlmaWVkIGR1cmluZyBpdGVyYXRpb24uYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSB7IHZhbHVlOiBjdXJyZW50LnZhbHVlLCBkb25lOiBmYWxzZSB9O1xuXHRcdFx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogdW5kZWZpbmVkLCBkb25lOiB0cnVlIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBpdGVyYXRvcjtcblx0fVxuXG5cdGVudHJpZXMoKTogTWFwSXRlcmF0b3I8W0ssIFZdPiB7XG5cdFx0Y29uc3QgbWFwID0gdGhpcztcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlO1xuXHRcdGxldCBjdXJyZW50ID0gdGhpcy5faGVhZDtcblx0XHRjb25zdCBpdGVyYXRvcjogTWFwSXRlcmF0b3I8W0ssIFZdPiA9IHtcblx0XHRcdFtTeW1ib2wuaXRlcmF0b3JdKCkge1xuXHRcdFx0XHRyZXR1cm4gaXRlcmF0b3I7XG5cdFx0XHR9LFxuXHRcdFx0W1N5bWJvbC5kaXNwb3NlXSgpIHsgLyogbm8tb3AgKi8gfSxcblx0XHRcdG5leHQoKTogSXRlcmF0b3JSZXN1bHQ8W0ssIFZdPiB7XG5cdFx0XHRcdGlmIChtYXAuX3N0YXRlICE9PSBzdGF0ZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTGlua2VkTWFwIGdvdCBtb2RpZmllZCBkdXJpbmcgaXRlcmF0aW9uLmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjdXJyZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJdGVyYXRvclJlc3VsdDxbSywgVl0+ID0geyB2YWx1ZTogW2N1cnJlbnQua2V5LCBjdXJyZW50LnZhbHVlXSwgZG9uZTogZmFsc2UgfTtcblx0XHRcdFx0XHRjdXJyZW50ID0gY3VycmVudC5uZXh0O1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IHVuZGVmaW5lZCwgZG9uZTogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXR1cm4gaXRlcmF0b3I7XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBNYXBJdGVyYXRvcjxbSywgVl0+IHtcblx0XHRyZXR1cm4gdGhpcy5lbnRyaWVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdHJpbU9sZChuZXdTaXplOiBudW1iZXIpIHtcblx0XHRpZiAobmV3U2l6ZSA+PSB0aGlzLnNpemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG5ld1NpemUgPT09IDApIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGN1cnJlbnQgPSB0aGlzLl9oZWFkO1xuXHRcdGxldCBjdXJyZW50U2l6ZSA9IHRoaXMuc2l6ZTtcblx0XHR3aGlsZSAoY3VycmVudCAmJiBjdXJyZW50U2l6ZSA+IG5ld1NpemUpIHtcblx0XHRcdHRoaXMuX21hcC5kZWxldGUoY3VycmVudC5rZXkpO1xuXHRcdFx0Y3VycmVudCA9IGN1cnJlbnQubmV4dDtcblx0XHRcdGN1cnJlbnRTaXplLS07XG5cdFx0fVxuXHRcdHRoaXMuX2hlYWQgPSBjdXJyZW50O1xuXHRcdHRoaXMuX3NpemUgPSBjdXJyZW50U2l6ZTtcblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0Y3VycmVudC5wcmV2aW91cyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUrKztcblx0fVxuXG5cdHByb3RlY3RlZCB0cmltTmV3KG5ld1NpemU6IG51bWJlcikge1xuXHRcdGlmIChuZXdTaXplID49IHRoaXMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobmV3U2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY3VycmVudCA9IHRoaXMuX3RhaWw7XG5cdFx0bGV0IGN1cnJlbnRTaXplID0gdGhpcy5zaXplO1xuXHRcdHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnRTaXplID4gbmV3U2l6ZSkge1xuXHRcdFx0dGhpcy5fbWFwLmRlbGV0ZShjdXJyZW50LmtleSk7XG5cdFx0XHRjdXJyZW50ID0gY3VycmVudC5wcmV2aW91cztcblx0XHRcdGN1cnJlbnRTaXplLS07XG5cdFx0fVxuXHRcdHRoaXMuX3RhaWwgPSBjdXJyZW50O1xuXHRcdHRoaXMuX3NpemUgPSBjdXJyZW50U2l6ZTtcblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0Y3VycmVudC5uZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZSsrO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRJdGVtRmlyc3QoaXRlbTogSXRlbTxLLCBWPik6IHZvaWQge1xuXHRcdC8vIEZpcnN0IHRpbWUgSW5zZXJ0XG5cdFx0aWYgKCF0aGlzLl9oZWFkICYmICF0aGlzLl90YWlsKSB7XG5cdFx0XHR0aGlzLl90YWlsID0gaXRlbTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLl9oZWFkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbGlzdCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtLm5leHQgPSB0aGlzLl9oZWFkO1xuXHRcdFx0dGhpcy5faGVhZC5wcmV2aW91cyA9IGl0ZW07XG5cdFx0fVxuXHRcdHRoaXMuX2hlYWQgPSBpdGVtO1xuXHRcdHRoaXMuX3N0YXRlKys7XG5cdH1cblxuXHRwcml2YXRlIGFkZEl0ZW1MYXN0KGl0ZW06IEl0ZW08SywgVj4pOiB2b2lkIHtcblx0XHQvLyBGaXJzdCB0aW1lIEluc2VydFxuXHRcdGlmICghdGhpcy5faGVhZCAmJiAhdGhpcy5fdGFpbCkge1xuXHRcdFx0dGhpcy5faGVhZCA9IGl0ZW07XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fdGFpbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3QnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbS5wcmV2aW91cyA9IHRoaXMuX3RhaWw7XG5cdFx0XHR0aGlzLl90YWlsLm5leHQgPSBpdGVtO1xuXHRcdH1cblx0XHR0aGlzLl90YWlsID0gaXRlbTtcblx0XHR0aGlzLl9zdGF0ZSsrO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVJdGVtKGl0ZW06IEl0ZW08SywgVj4pOiB2b2lkIHtcblx0XHRpZiAoaXRlbSA9PT0gdGhpcy5faGVhZCAmJiBpdGVtID09PSB0aGlzLl90YWlsKSB7XG5cdFx0XHR0aGlzLl9oZWFkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdGFpbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoaXRlbSA9PT0gdGhpcy5faGVhZCkge1xuXHRcdFx0Ly8gVGhpcyBjYW4gb25seSBoYXBwZW4gaWYgc2l6ZSA9PT0gMSB3aGljaCBpcyBoYW5kbGVkXG5cdFx0XHQvLyBieSB0aGUgY2FzZSBhYm92ZS5cblx0XHRcdGlmICghaXRlbS5uZXh0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsaXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpdGVtLm5leHQucHJldmlvdXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9oZWFkID0gaXRlbS5uZXh0O1xuXHRcdH1cblx0XHRlbHNlIGlmIChpdGVtID09PSB0aGlzLl90YWlsKSB7XG5cdFx0XHQvLyBUaGlzIGNhbiBvbmx5IGhhcHBlbiBpZiBzaXplID09PSAxIHdoaWNoIGlzIGhhbmRsZWRcblx0XHRcdC8vIGJ5IHRoZSBjYXNlIGFib3ZlLlxuXHRcdFx0aWYgKCFpdGVtLnByZXZpb3VzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsaXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpdGVtLnByZXZpb3VzLm5leHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl90YWlsID0gaXRlbS5wcmV2aW91cztcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gaXRlbS5uZXh0O1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSBpdGVtLnByZXZpb3VzO1xuXHRcdFx0aWYgKCFuZXh0IHx8ICFwcmV2aW91cykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbGlzdCcpO1xuXHRcdFx0fVxuXHRcdFx0bmV4dC5wcmV2aW91cyA9IHByZXZpb3VzO1xuXHRcdFx0cHJldmlvdXMubmV4dCA9IG5leHQ7XG5cdFx0fVxuXHRcdGl0ZW0ubmV4dCA9IHVuZGVmaW5lZDtcblx0XHRpdGVtLnByZXZpb3VzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0YXRlKys7XG5cdH1cblxuXHRwcml2YXRlIHRvdWNoKGl0ZW06IEl0ZW08SywgVj4sIHRvdWNoOiBUb3VjaCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGVhZCB8fCAhdGhpcy5fdGFpbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3QnKTtcblx0XHR9XG5cdFx0aWYgKCh0b3VjaCAhPT0gVG91Y2guQXNPbGQgJiYgdG91Y2ggIT09IFRvdWNoLkFzTmV3KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0b3VjaCA9PT0gVG91Y2guQXNPbGQpIHtcblx0XHRcdGlmIChpdGVtID09PSB0aGlzLl9oZWFkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dCA9IGl0ZW0ubmV4dDtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0gaXRlbS5wcmV2aW91cztcblxuXHRcdFx0Ly8gVW5saW5rIHRoZSBpdGVtXG5cdFx0XHRpZiAoaXRlbSA9PT0gdGhpcy5fdGFpbCkge1xuXHRcdFx0XHQvLyBwcmV2aW91cyBtdXN0IGJlIGRlZmluZWQgc2luY2UgaXRlbSB3YXMgbm90IGhlYWQgYnV0IGlzIHRhaWxcblx0XHRcdFx0Ly8gU28gdGhlcmUgYXJlIG1vcmUgdGhhbiBvbiBpdGVtIGluIHRoZSBtYXBcblx0XHRcdFx0cHJldmlvdXMhLm5leHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3RhaWwgPSBwcmV2aW91cztcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvLyBCb3RoIG5leHQgYW5kIHByZXZpb3VzIGFyZSBub3QgdW5kZWZpbmVkIHNpbmNlIGl0ZW0gd2FzIG5laXRoZXIgaGVhZCBub3IgdGFpbC5cblx0XHRcdFx0bmV4dCEucHJldmlvdXMgPSBwcmV2aW91cztcblx0XHRcdFx0cHJldmlvdXMhLm5leHQgPSBuZXh0O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnNlcnQgdGhlIG5vZGUgYXQgaGVhZFxuXHRcdFx0aXRlbS5wcmV2aW91cyA9IHVuZGVmaW5lZDtcblx0XHRcdGl0ZW0ubmV4dCA9IHRoaXMuX2hlYWQ7XG5cdFx0XHR0aGlzLl9oZWFkLnByZXZpb3VzID0gaXRlbTtcblx0XHRcdHRoaXMuX2hlYWQgPSBpdGVtO1xuXHRcdFx0dGhpcy5fc3RhdGUrKztcblx0XHR9IGVsc2UgaWYgKHRvdWNoID09PSBUb3VjaC5Bc05ldykge1xuXHRcdFx0aWYgKGl0ZW0gPT09IHRoaXMuX3RhaWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXh0ID0gaXRlbS5uZXh0O1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSBpdGVtLnByZXZpb3VzO1xuXG5cdFx0XHQvLyBVbmxpbmsgdGhlIGl0ZW0uXG5cdFx0XHRpZiAoaXRlbSA9PT0gdGhpcy5faGVhZCkge1xuXHRcdFx0XHQvLyBuZXh0IG11c3QgYmUgZGVmaW5lZCBzaW5jZSBpdGVtIHdhcyBub3QgdGFpbCBidXQgaXMgaGVhZFxuXHRcdFx0XHQvLyBTbyB0aGVyZSBhcmUgbW9yZSB0aGFuIG9uIGl0ZW0gaW4gdGhlIG1hcFxuXHRcdFx0XHRuZXh0IS5wcmV2aW91cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5faGVhZCA9IG5leHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBCb3RoIG5leHQgYW5kIHByZXZpb3VzIGFyZSBub3QgdW5kZWZpbmVkIHNpbmNlIGl0ZW0gd2FzIG5laXRoZXIgaGVhZCBub3IgdGFpbC5cblx0XHRcdFx0bmV4dCEucHJldmlvdXMgPSBwcmV2aW91cztcblx0XHRcdFx0cHJldmlvdXMhLm5leHQgPSBuZXh0O1xuXHRcdFx0fVxuXHRcdFx0aXRlbS5uZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0aXRlbS5wcmV2aW91cyA9IHRoaXMuX3RhaWw7XG5cdFx0XHR0aGlzLl90YWlsLm5leHQgPSBpdGVtO1xuXHRcdFx0dGhpcy5fdGFpbCA9IGl0ZW07XG5cdFx0XHR0aGlzLl9zdGF0ZSsrO1xuXHRcdH1cblx0fVxuXG5cdHRvSlNPTigpOiBbSywgVl1bXSB7XG5cdFx0Y29uc3QgZGF0YTogW0ssIFZdW10gPSBbXTtcblxuXHRcdHRoaXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0ZGF0YS5wdXNoKFtrZXksIHZhbHVlXSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdGZyb21KU09OKGRhdGE6IFtLLCBWXVtdKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZGF0YSkge1xuXHRcdFx0dGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIENhY2hlPEssIFY+IGV4dGVuZHMgTGlua2VkTWFwPEssIFY+IHtcblxuXHRwcm90ZWN0ZWQgX2xpbWl0OiBudW1iZXI7XG5cdHByb3RlY3RlZCBfcmF0aW86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihsaW1pdDogbnVtYmVyLCByYXRpbzogbnVtYmVyID0gMSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbGltaXQgPSBsaW1pdDtcblx0XHR0aGlzLl9yYXRpbyA9IE1hdGgubWluKE1hdGgubWF4KDAsIHJhdGlvKSwgMSk7XG5cdH1cblxuXHRnZXQgbGltaXQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGltaXQ7XG5cdH1cblxuXHRzZXQgbGltaXQobGltaXQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2xpbWl0ID0gbGltaXQ7XG5cdFx0dGhpcy5jaGVja1RyaW0oKTtcblx0fVxuXG5cdGdldCByYXRpbygpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yYXRpbztcblx0fVxuXG5cdHNldCByYXRpbyhyYXRpbzogbnVtYmVyKSB7XG5cdFx0dGhpcy5fcmF0aW8gPSBNYXRoLm1pbihNYXRoLm1heCgwLCByYXRpbyksIDEpO1xuXHRcdHRoaXMuY2hlY2tUcmltKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQoa2V5OiBLLCB0b3VjaDogVG91Y2ggPSBUb3VjaC5Bc05ldyk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBzdXBlci5nZXQoa2V5LCB0b3VjaCk7XG5cdH1cblxuXHRwZWVrKGtleTogSyk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBzdXBlci5nZXQoa2V5LCBUb3VjaC5Ob25lKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldChrZXk6IEssIHZhbHVlOiBWKTogdGhpcyB7XG5cdFx0c3VwZXIuc2V0KGtleSwgdmFsdWUsIFRvdWNoLkFzTmV3KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHByb3RlY3RlZCBjaGVja1RyaW0oKSB7XG5cdFx0aWYgKHRoaXMuc2l6ZSA+IHRoaXMuX2xpbWl0KSB7XG5cdFx0XHR0aGlzLnRyaW0oTWF0aC5yb3VuZCh0aGlzLl9saW1pdCAqIHRoaXMuX3JhdGlvKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHRyaW0obmV3U2l6ZTogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIExSVUNhY2hlPEssIFY+IGV4dGVuZHMgQ2FjaGU8SywgVj4ge1xuXG5cdGNvbnN0cnVjdG9yKGxpbWl0OiBudW1iZXIsIHJhdGlvOiBudW1iZXIgPSAxKSB7XG5cdFx0c3VwZXIobGltaXQsIHJhdGlvKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0cmltKG5ld1NpemU6IG51bWJlcikge1xuXHRcdHRoaXMudHJpbU9sZChuZXdTaXplKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldChrZXk6IEssIHZhbHVlOiBWKTogdGhpcyB7XG5cdFx0c3VwZXIuc2V0KGtleSwgdmFsdWUpO1xuXHRcdHRoaXMuY2hlY2tUcmltKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1SVUNhY2hlPEssIFY+IGV4dGVuZHMgQ2FjaGU8SywgVj4ge1xuXG5cdGNvbnN0cnVjdG9yKGxpbWl0OiBudW1iZXIsIHJhdGlvOiBudW1iZXIgPSAxKSB7XG5cdFx0c3VwZXIobGltaXQsIHJhdGlvKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0cmltKG5ld1NpemU6IG51bWJlcikge1xuXHRcdHRoaXMudHJpbU5ldyhuZXdTaXplKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldChrZXk6IEssIHZhbHVlOiBWKTogdGhpcyB7XG5cdFx0aWYgKHRoaXMuX2xpbWl0IDw9IHRoaXMuc2l6ZSAmJiAhdGhpcy5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy50cmltKE1hdGgucm91bmQodGhpcy5fbGltaXQgKiB0aGlzLl9yYXRpbykgLSAxKTtcblx0XHR9XG5cblx0XHRzdXBlci5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdW50ZXJTZXQ8VD4ge1xuXG5cdHByaXZhdGUgbWFwID0gbmV3IE1hcDxULCBudW1iZXI+KCk7XG5cblx0YWRkKHZhbHVlOiBUKTogQ291bnRlclNldDxUPiB7XG5cdFx0dGhpcy5tYXAuc2V0KHZhbHVlLCAodGhpcy5tYXAuZ2V0KHZhbHVlKSB8fCAwKSArIDEpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZGVsZXRlKHZhbHVlOiBUKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNvdW50ZXIgPSB0aGlzLm1hcC5nZXQodmFsdWUpIHx8IDA7XG5cblx0XHRpZiAoY291bnRlciA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvdW50ZXItLTtcblxuXHRcdGlmIChjb3VudGVyID09PSAwKSB7XG5cdFx0XHR0aGlzLm1hcC5kZWxldGUodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcC5zZXQodmFsdWUsIGNvdW50ZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aGFzKHZhbHVlOiBUKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWFwLmhhcyh2YWx1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIG1hcCB0aGF0IGFsbG93cyBhY2Nlc3MgYm90aCBieSBrZXlzIGFuZCB2YWx1ZXMuXG4gKiAqKk5PVEUqKjogdmFsdWVzIG5lZWQgdG8gYmUgdW5pcXVlLlxuICovXG5leHBvcnQgY2xhc3MgQmlkaXJlY3Rpb25hbE1hcDxLLCBWPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbTEgPSBuZXcgTWFwPEssIFY+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX20yID0gbmV3IE1hcDxWLCBLPigpO1xuXG5cdGNvbnN0cnVjdG9yKGVudHJpZXM/OiByZWFkb25seSAocmVhZG9ubHkgW0ssIFZdKVtdKSB7XG5cdFx0aWYgKGVudHJpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGVudHJpZXMpIHtcblx0XHRcdFx0dGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbTEuY2xlYXIoKTtcblx0XHR0aGlzLl9tMi5jbGVhcigpO1xuXHR9XG5cblx0c2V0KGtleTogSywgdmFsdWU6IFYpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c1ZhbHVlID0gdGhpcy5fbTEuZ2V0KGtleSk7XG5cdFx0aWYgKHByZXZpb3VzVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbTIuZGVsZXRlKHByZXZpb3VzVmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLl9tMS5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0dGhpcy5fbTIuc2V0KHZhbHVlLCBrZXkpO1xuXHR9XG5cblx0Z2V0KGtleTogSyk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tMS5nZXQoa2V5KTtcblx0fVxuXG5cdGdldEtleSh2YWx1ZTogVik6IEsgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tMi5nZXQodmFsdWUpO1xuXHR9XG5cblx0ZGVsZXRlKGtleTogSyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fbTEuZ2V0KGtleSk7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbTEuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fbTIuZGVsZXRlKHZhbHVlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2tmbjogKHZhbHVlOiBWLCBrZXk6IEssIG1hcDogQmlkaXJlY3Rpb25hbE1hcDxLLCBWPikgPT4gdm9pZCwgdGhpc0FyZz86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9tMS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRjYWxsYmFja2ZuLmNhbGwodGhpc0FyZywgdmFsdWUsIGtleSwgdGhpcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRrZXlzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Sz4ge1xuXHRcdHJldHVybiB0aGlzLl9tMS5rZXlzKCk7XG5cdH1cblxuXHR2YWx1ZXMoKTogSXRlcmFibGVJdGVyYXRvcjxWPiB7XG5cdFx0cmV0dXJuIHRoaXMuX20xLnZhbHVlcygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRNYXA8SywgVj4ge1xuXG5cdHByaXZhdGUgbWFwID0gbmV3IE1hcDxLLCBTZXQ8Vj4+KCk7XG5cblx0YWRkKGtleTogSywgdmFsdWU6IFYpOiB2b2lkIHtcblx0XHRsZXQgdmFsdWVzID0gdGhpcy5tYXAuZ2V0KGtleSk7XG5cblx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0dmFsdWVzID0gbmV3IFNldDxWPigpO1xuXHRcdFx0dGhpcy5tYXAuc2V0KGtleSwgdmFsdWVzKTtcblx0XHR9XG5cblx0XHR2YWx1ZXMuYWRkKHZhbHVlKTtcblx0fVxuXG5cdGRlbGV0ZShrZXk6IEssIHZhbHVlOiBWKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWVzID0gdGhpcy5tYXAuZ2V0KGtleSk7XG5cblx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhbHVlcy5kZWxldGUodmFsdWUpO1xuXG5cdFx0aWYgKHZhbHVlcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLm1hcC5kZWxldGUoa2V5KTtcblx0XHR9XG5cdH1cblxuXHRmb3JFYWNoKGtleTogSywgZm46ICh2YWx1ZTogVikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlcyA9IHRoaXMubWFwLmdldChrZXkpO1xuXG5cdFx0aWYgKCF2YWx1ZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YWx1ZXMuZm9yRWFjaChmbik7XG5cdH1cblxuXHRnZXQoa2V5OiBLKTogUmVhZG9ubHlTZXQ8Vj4ge1xuXHRcdGNvbnN0IHZhbHVlcyA9IHRoaXMubWFwLmdldChrZXkpO1xuXHRcdGlmICghdmFsdWVzKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNldDxWPigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWVzO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlcihhOiBNYXA8dW5rbm93biwgdW5rbm93bj4sIGI6IE1hcDx1bmtub3duLCB1bmtub3duPik6IGJvb2xlYW4ge1xuXHRpZiAoYSA9PT0gYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKGEuc2l6ZSAhPT0gYi5zaXplKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgYSkge1xuXHRcdGlmICghYi5oYXMoa2V5KSB8fCBiLmdldChrZXkpICE9PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgW2tleV0gb2YgYikge1xuXHRcdGlmICghYS5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIEEgbWFwIHRoYXQgaXMgYWRkcmVzc2FibGUgd2l0aCBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGtleXMuIFRoaXMgaXMgdXNlZnVsIGluIGhpZ2ggcGVyZm9ybWFuY2VcbiAqIHNjZW5hcmlvcyB3aGVyZSBjcmVhdGluZyBhIGNvbXBvc2l0ZSBrZXkgd2hlbmV2ZXIgdGhlIGRhdGEgaXMgYWNjZXNzZWQgaXMgdG9vIGV4cGVuc2l2ZS4gRm9yXG4gKiBleGFtcGxlIGZvciBhIHZlcnkgaG90IGZ1bmN0aW9uLCBjb25zdHJ1Y3RpbmcgYSBzdHJpbmcgbGlrZSBgZmlyc3Qtc2Vjb25kLXRoaXJkYCBmb3IgZXZlcnkgY2FsbFxuICogd2lsbCBjYXVzZSBhIHNpZ25pZmljYW50IGhpdCB0byBwZXJmb3JtYW5jZS5cbiAqL1xuZXhwb3J0IGNsYXNzIE5LZXlNYXA8VFZhbHVlLCBUS2V5cyBleHRlbmRzIChzdHJpbmcgfCBib29sZWFuIHwgbnVtYmVyKVtdPiB7XG5cdHByaXZhdGUgX2RhdGE6IE1hcDxhbnksIGFueT4gPSBuZXcgTWFwKCk7XG5cblx0LyoqXG5cdCAqIFNldHMgYSB2YWx1ZSBvbiB0aGUgbWFwLiBOb3RlIHRoYXQgdW5saWtlIGEgc3RhbmRhcmQgYE1hcGAsIHRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgdmFsdWUuXG5cdCAqIFRoaXMgaXMgYmVjYXVzZSB0aGUgc3ByZWFkIG9wZXJhdG9yIGlzIHVzZWQgZm9yIHRoZSBrZXlzIGFuZCBtdXN0IGJlIGxhc3QuLlxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHZhbHVlIHRvIHNldC5cblx0ICogQHBhcmFtIGtleXMgVGhlIGtleXMgZm9yIHRoZSB2YWx1ZS5cblx0ICovXG5cdHB1YmxpYyBzZXQodmFsdWU6IFRWYWx1ZSwgLi4ua2V5czogWy4uLlRLZXlzXSk6IHZvaWQge1xuXHRcdGxldCBjdXJyZW50TWFwID0gdGhpcy5fZGF0YTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0XHRsZXQgbmV4dE1hcCA9IGN1cnJlbnRNYXAuZ2V0KGtleXNbaV0pO1xuXHRcdFx0aWYgKG5leHRNYXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRuZXh0TWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRjdXJyZW50TWFwLnNldChrZXlzW2ldLCBuZXh0TWFwKTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRNYXAgPSBuZXh0TWFwO1xuXHRcdH1cblx0XHRjdXJyZW50TWFwLnNldChrZXlzW2tleXMubGVuZ3RoIC0gMV0sIHZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoLi4ua2V5czogWy4uLlRLZXlzXSk6IFRWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGN1cnJlbnRNYXAgPSB0aGlzLl9kYXRhO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdGNvbnN0IG5leHRNYXAgPSBjdXJyZW50TWFwLmdldChrZXlzW2ldKTtcblx0XHRcdGlmIChuZXh0TWFwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRNYXAgPSBuZXh0TWFwO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudE1hcC5nZXQoa2V5c1trZXlzLmxlbmd0aCAtIDFdKTtcblx0fVxuXG5cdHB1YmxpYyBkZWxldGUoLi4ua2V5czogWy4uLlRLZXlzXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1hcHM6IE1hcDxhbnksIGFueT5bXSA9IFt0aGlzLl9kYXRhXTtcblx0XHRsZXQgY3VycmVudE1hcCA9IHRoaXMuX2RhdGE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0Y29uc3QgbmV4dE1hcCA9IGN1cnJlbnRNYXAuZ2V0KGtleXNbaV0pO1xuXHRcdFx0aWYgKG5leHRNYXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjdXJyZW50TWFwID0gbmV4dE1hcDtcblx0XHRcdG1hcHMucHVzaChjdXJyZW50TWFwKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVsZXRlZCA9IGN1cnJlbnRNYXAuZGVsZXRlKGtleXNba2V5cy5sZW5ndGggLSAxXSk7XG5cdFx0Zm9yIChsZXQgaSA9IGtleXMubGVuZ3RoIC0gMjsgZGVsZXRlZCAmJiBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKG1hcHNbaSArIDFdLnNpemUgPT09IDApIHtcblx0XHRcdFx0bWFwc1tpXS5kZWxldGUoa2V5c1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkZWxldGVkO1xuXHR9XG5cblx0cHVibGljIGRlbGV0ZUFsbCguLi5rZXlzOiBQYXJ0aWFsPFRLZXlzPik6IGJvb2xlYW4ge1xuXHRcdGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgaGFkRGF0YSA9IHRoaXMuX2RhdGEuc2l6ZSA+IDA7XG5cdFx0XHR0aGlzLl9kYXRhLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm4gaGFkRGF0YTtcblx0XHR9XG5cdFx0Y29uc3QgbWFwczogTWFwPGFueSwgYW55PltdID0gW3RoaXMuX2RhdGFdO1xuXHRcdGxldCBjdXJyZW50TWFwID0gdGhpcy5fZGF0YTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0XHRjb25zdCBuZXh0TWFwID0gY3VycmVudE1hcC5nZXQoa2V5c1tpXSk7XG5cdFx0XHRpZiAobmV4dE1hcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRNYXAgPSBuZXh0TWFwO1xuXHRcdFx0bWFwcy5wdXNoKGN1cnJlbnRNYXApO1xuXHRcdH1cblx0XHRjb25zdCBkZWxldGVkID0gY3VycmVudE1hcC5kZWxldGUoa2V5c1trZXlzLmxlbmd0aCAtIDFdKTtcblx0XHRmb3IgKGxldCBpID0ga2V5cy5sZW5ndGggLSAyOyBkZWxldGVkICYmIGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAobWFwc1tpICsgMV0uc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRtYXBzW2ldLmRlbGV0ZShrZXlzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRlbGV0ZWQ7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YS5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljICpnZXRBbGwoLi4ua2V5czogUGFydGlhbDxUS2V5cz4pOiBJdGVyYWJsZUl0ZXJhdG9yPFRWYWx1ZT4ge1xuXHRcdGxldCBjdXJyZW50TWFwID0gdGhpcy5fZGF0YTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCBuZXh0TWFwID0gY3VycmVudE1hcC5nZXQoa2V5KTtcblx0XHRcdGlmIChuZXh0TWFwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudE1hcCA9IG5leHRNYXA7XG5cdFx0fVxuXHRcdHlpZWxkKiB0aGlzLl92YWx1ZXMoY3VycmVudE1hcCk7XG5cdH1cblxuXHRwdWJsaWMgKnZhbHVlcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFRWYWx1ZT4ge1xuXHRcdHlpZWxkKiB0aGlzLl92YWx1ZXModGhpcy5fZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlICpfdmFsdWVzKG1hcDogTWFwPGFueSwgYW55Pik6IEl0ZXJhYmxlSXRlcmF0b3I8VFZhbHVlPiB7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiBtYXAudmFsdWVzKCkpIHtcblx0XHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdFx0XHR5aWVsZCogdGhpcy5fdmFsdWVzKHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHlpZWxkIHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSB0ZXh0dWFsIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBtYXAgZm9yIGRlYnVnZ2luZyBwdXJwb3Nlcy5cblx0ICovXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHByaW50TWFwID0gKG1hcDogTWFwPGFueSwgYW55PiwgZGVwdGg6IG51bWJlcik6IHN0cmluZyA9PiB7XG5cdFx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBtYXApIHtcblx0XHRcdFx0cmVzdWx0ICs9IGAkeycgICcucmVwZWF0KGRlcHRoKX0ke2tleX06IGA7XG5cdFx0XHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdFx0XHRcdHJlc3VsdCArPSAnXFxuJyArIHByaW50TWFwKHZhbHVlLCBkZXB0aCArIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdCArPSBgJHt2YWx1ZX1cXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRyZXR1cm4gcHJpbnRNYXAodGhpcy5fZGF0YSwgMCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUFBO0FBT08sU0FBUyxTQUFlLEtBQWdCLEtBQVEsT0FBYTtBQUNuRSxNQUFJLFNBQVMsSUFBSSxJQUFJLEdBQUc7QUFDeEIsTUFBSSxXQUFXLFFBQVc7QUFDekIsYUFBUztBQUNULFFBQUksSUFBSSxLQUFLLE1BQU07QUFBQSxFQUNwQjtBQUVBLFNBQU87QUFDUjtBQUVPLFNBQVMsWUFBa0IsS0FBd0I7QUFDekQsUUFBTSxVQUFvQixDQUFDO0FBQzNCLE1BQUksUUFBUSxDQUFDLE9BQU8sUUFBUTtBQUMzQixZQUFRLEtBQUssR0FBRyxHQUFHLE9BQU8sS0FBSyxFQUFFO0FBQUEsRUFDbEMsQ0FBQztBQUVELFNBQU8sT0FBTyxJQUFJLElBQUksTUFBTSxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQy9DO0FBRU8sU0FBUyxZQUFlLEtBQXFCO0FBQ25ELFFBQU0sVUFBZSxDQUFDO0FBQ3RCLE1BQUksUUFBUSxXQUFTO0FBQ3BCLFlBQVEsS0FBSyxLQUFLO0FBQUEsRUFDbkIsQ0FBQztBQUVELFNBQU8sT0FBTyxJQUFJLElBQUksTUFBTSxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQy9DO0FBTUEsTUFBTSxpQkFBb0I7QUFBQSxFQUN6QixZQUFxQixLQUFtQixPQUFVO0FBQTdCO0FBQW1CO0FBQUEsRUFBWTtBQUNyRDtBQUVBLFNBQVMsVUFBYSxLQUE0SDtBQUNqSixTQUFPLE1BQU0sUUFBUSxHQUFHO0FBQ3pCO0FB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
