import { SetWithKey } from "./collections.js";
import { ArrayNavigator } from "./navigator.js";
class HistoryNavigator {
  constructor(_history = /* @__PURE__ */ new Set(), limit = 10) {
    this._history = _history;
    this._limit = limit;
    this._onChange();
    if (this._history.onDidChange) {
      this._disposable = this._history.onDidChange(() => this._onChange());
    }
  }
  getHistory() {
    return this._elements;
  }
  add(t) {
    this._history.delete(t);
    this._history.add(t);
    this._onChange();
  }
  next() {
    return this._navigator.next();
  }
  previous() {
    if (this._currentPosition() !== 0) {
      return this._navigator.previous();
    }
    return null;
  }
  current() {
    return this._navigator.current();
  }
  first() {
    return this._navigator.first();
  }
  last() {
    return this._navigator.last();
  }
  isFirst() {
    return this._currentPosition() === 0;
  }
  isLast() {
    return this._currentPosition() >= this._elements.length - 1;
  }
  isNowhere() {
    return this._navigator.current() === null;
  }
  has(t) {
    return this._history.has(t);
  }
  clear() {
    this._history.clear();
    this._onChange();
  }
  _onChange() {
    this._reduceToLimit();
    const elements = this._elements;
    this._navigator = new ArrayNavigator(elements, 0, elements.length, elements.length);
  }
  _reduceToLimit() {
    const data = this._elements;
    if (data.length > this._limit) {
      const replaceValue = data.slice(data.length - this._limit);
      if (this._history.replace) {
        this._history.replace(replaceValue);
      } else {
        this._history = new Set(replaceValue);
      }
    }
  }
  _currentPosition() {
    const currentElement = this._navigator.current();
    if (!currentElement) {
      return -1;
    }
    return this._elements.indexOf(currentElement);
  }
  get _elements() {
    const elements = [];
    this._history.forEach((e) => elements.push(e));
    return elements;
  }
  dispose() {
    if (this._disposable) {
      this._disposable.dispose();
      this._disposable = void 0;
    }
  }
}
class HistoryNavigator2 {
  constructor(history, capacity = 10, identityFn = (t) => t) {
    this.capacity = capacity;
    this.identityFn = identityFn;
    if (history.length < 1) {
      throw new Error("not supported");
    }
    this._size = 1;
    this.head = this.tail = this.cursor = {
      value: history[0],
      previous: void 0,
      next: void 0
    };
    this.valueSet = new SetWithKey([history[0]], identityFn);
    for (let i = 1; i < history.length; i++) {
      this.add(history[i]);
    }
  }
  get size() {
    return this._size;
  }
  add(value) {
    const node = {
      value,
      previous: this.tail,
      next: void 0
    };
    this.tail.next = node;
    this.tail = node;
    this.cursor = this.tail;
    this._size++;
    if (this.valueSet.has(value)) {
      this._deleteFromList(value);
    } else {
      this.valueSet.add(value);
    }
    while (this._size > this.capacity) {
      this.valueSet.delete(this.head.value);
      this.head = this.head.next;
      this.head.previous = void 0;
      this._size--;
    }
  }
  /**
   * @returns old last value
   */
  replaceLast(value) {
    if (this.identityFn(this.tail.value) === this.identityFn(value)) {
      return value;
    }
    const oldValue = this.tail.value;
    this.valueSet.delete(oldValue);
    this.tail.value = value;
    if (this.valueSet.has(value)) {
      this._deleteFromList(value);
    } else {
      this.valueSet.add(value);
    }
    return oldValue;
  }
  prepend(value) {
    if (this._size === this.capacity || this.valueSet.has(value)) {
      return;
    }
    const node = {
      value,
      previous: void 0,
      next: this.head
    };
    this.head.previous = node;
    this.head = node;
    this._size++;
    this.valueSet.add(value);
  }
  isAtEnd() {
    return this.cursor === this.tail;
  }
  current() {
    return this.cursor.value;
  }
  previous() {
    if (this.cursor.previous) {
      this.cursor = this.cursor.previous;
    }
    return this.cursor.value;
  }
  next() {
    if (this.cursor.next) {
      this.cursor = this.cursor.next;
    }
    return this.cursor.value;
  }
  has(t) {
    return this.valueSet.has(t);
  }
  resetCursor() {
    this.cursor = this.tail;
    return this.cursor.value;
  }
  *[Symbol.iterator]() {
    let node = this.head;
    while (node) {
      yield node.value;
      node = node.next;
    }
  }
  _deleteFromList(value) {
    let temp = this.head;
    const valueKey = this.identityFn(value);
    while (temp !== this.tail) {
      if (this.identityFn(temp.value) === valueKey) {
        if (temp === this.head) {
          this.head = this.head.next;
          this.head.previous = void 0;
        } else {
          temp.previous.next = temp.next;
          temp.next.previous = temp.previous;
        }
        this._size--;
      }
      temp = temp.next;
    }
  }
}
export {
  HistoryNavigator,
  HistoryNavigator2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGhpc3RvcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXRXaXRoS2V5IH0gZnJvbSAnLi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBcnJheU5hdmlnYXRvciwgSU5hdmlnYXRvciB9IGZyb20gJy4vbmF2aWdhdG9yLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJSGlzdG9yeTxUPiB7XG5cdGRlbGV0ZSh0OiBUKTogYm9vbGVhbjtcblx0YWRkKHQ6IFQpOiB0aGlzO1xuXHRoYXModDogVCk6IGJvb2xlYW47XG5cdGNsZWFyKCk6IHZvaWQ7XG5cdGZvckVhY2goY2FsbGJhY2tmbjogKHZhbHVlOiBULCB2YWx1ZTI6IFQsIHNldDogU2V0PFQ+KSA9PiB2b2lkLCB0aGlzQXJnPzogdW5rbm93bik6IHZvaWQ7XG5cdHJlcGxhY2U/KHQ6IFRbXSk6IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlPzogRXZlbnQ8c3RyaW5nW10+O1xufVxuXG5leHBvcnQgY2xhc3MgSGlzdG9yeU5hdmlnYXRvcjxUPiBpbXBsZW1lbnRzIElOYXZpZ2F0b3I8VD4ge1xuXHRwcml2YXRlIF9saW1pdDogbnVtYmVyO1xuXHRwcml2YXRlIF9uYXZpZ2F0b3IhOiBBcnJheU5hdmlnYXRvcjxUPjtcblx0cHJpdmF0ZSBfZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfaGlzdG9yeTogSUhpc3Rvcnk8VD4gPSBuZXcgU2V0KCksXG5cdFx0bGltaXQ6IG51bWJlciA9IDEwLFxuXHQpIHtcblx0XHR0aGlzLl9saW1pdCA9IGxpbWl0O1xuXHRcdHRoaXMuX29uQ2hhbmdlKCk7XG5cdFx0aWYgKHRoaXMuX2hpc3Rvcnkub25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGUgPSB0aGlzLl9oaXN0b3J5Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uQ2hhbmdlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRIaXN0b3J5KCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzO1xuXHR9XG5cblx0cHVibGljIGFkZCh0OiBUKSB7XG5cdFx0dGhpcy5faGlzdG9yeS5kZWxldGUodCk7XG5cdFx0dGhpcy5faGlzdG9yeS5hZGQodCk7XG5cdFx0dGhpcy5fb25DaGFuZ2UoKTtcblx0fVxuXG5cdHB1YmxpYyBuZXh0KCk6IFQgfCBudWxsIHtcblx0XHQvLyBUaGlzIHdpbGwgbmF2aWdhdGUgcGFzdCB0aGUgZW5kIG9mIHRoZSBsYXN0IGVsZW1lbnQsIGFuZCBpbiB0aGF0IGNhc2UgdGhlIGlucHV0IHNob3VsZCBiZSBjbGVhcmVkXG5cdFx0cmV0dXJuIHRoaXMuX25hdmlnYXRvci5uZXh0KCk7XG5cdH1cblxuXHRwdWJsaWMgcHJldmlvdXMoKTogVCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UG9zaXRpb24oKSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX25hdmlnYXRvci5wcmV2aW91cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBjdXJyZW50KCk6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbmF2aWdhdG9yLmN1cnJlbnQoKTtcblx0fVxuXG5cdHB1YmxpYyBmaXJzdCgpOiBUIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX25hdmlnYXRvci5maXJzdCgpO1xuXHR9XG5cblx0cHVibGljIGxhc3QoKTogVCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9uYXZpZ2F0b3IubGFzdCgpO1xuXHR9XG5cblx0cHVibGljIGlzRmlyc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRQb3NpdGlvbigpID09PSAwO1xuXHR9XG5cblx0cHVibGljIGlzTGFzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFBvc2l0aW9uKCkgPj0gdGhpcy5fZWxlbWVudHMubGVuZ3RoIC0gMTtcblx0fVxuXG5cdHB1YmxpYyBpc05vd2hlcmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX25hdmlnYXRvci5jdXJyZW50KCkgPT09IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgaGFzKHQ6IFQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGlzdG9yeS5oYXModCk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5faGlzdG9yeS5jbGVhcigpO1xuXHRcdHRoaXMuX29uQ2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNoYW5nZSgpIHtcblx0XHR0aGlzLl9yZWR1Y2VUb0xpbWl0KCk7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLl9lbGVtZW50cztcblx0XHR0aGlzLl9uYXZpZ2F0b3IgPSBuZXcgQXJyYXlOYXZpZ2F0b3IoZWxlbWVudHMsIDAsIGVsZW1lbnRzLmxlbmd0aCwgZWxlbWVudHMubGVuZ3RoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZHVjZVRvTGltaXQoKSB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2VsZW1lbnRzO1xuXHRcdGlmIChkYXRhLmxlbmd0aCA+IHRoaXMuX2xpbWl0KSB7XG5cdFx0XHRjb25zdCByZXBsYWNlVmFsdWUgPSBkYXRhLnNsaWNlKGRhdGEubGVuZ3RoIC0gdGhpcy5fbGltaXQpO1xuXHRcdFx0aWYgKHRoaXMuX2hpc3RvcnkucmVwbGFjZSkge1xuXHRcdFx0XHR0aGlzLl9oaXN0b3J5LnJlcGxhY2UocmVwbGFjZVZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2hpc3RvcnkgPSBuZXcgU2V0KHJlcGxhY2VWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3VycmVudFBvc2l0aW9uKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgY3VycmVudEVsZW1lbnQgPSB0aGlzLl9uYXZpZ2F0b3IuY3VycmVudCgpO1xuXHRcdGlmICghY3VycmVudEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudHMuaW5kZXhPZihjdXJyZW50RWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfZWxlbWVudHMoKTogVFtdIHtcblx0XHRjb25zdCBlbGVtZW50czogVFtdID0gW107XG5cdFx0dGhpcy5faGlzdG9yeS5mb3JFYWNoKGUgPT4gZWxlbWVudHMucHVzaChlKSk7XG5cdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIEhpc3RvcnlOb2RlPFQ+IHtcblx0dmFsdWU6IFQ7XG5cdHByZXZpb3VzOiBIaXN0b3J5Tm9kZTxUPiB8IHVuZGVmaW5lZDtcblx0bmV4dDogSGlzdG9yeU5vZGU8VD4gfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVGhlIHJpZ2h0IHdheSB0byB1c2UgSGlzdG9yeU5hdmlnYXRvcjIgaXMgZm9yIHRoZSBsYXN0IGl0ZW0gaW4gdGhlIGxpc3QgdG8gYmUgdGhlIHVzZXIncyB1bmNvbW1pdHRlZCBjdXJyZW50IHRleHQuIGVnIGVtcHR5IHN0cmluZywgb3Igd2hhdGV2ZXIgaGFzIGJlZW4gdHlwZWQuIFRoZW5cbiAqIHRoZSB1c2VyIGNhbiBuYXZpZ2F0ZSBhd2F5IGZyb20gdGhlIGxhc3QgaXRlbSB0aHJvdWdoIHRoZSBsaXN0LCBhbmQgYmFjayB0byBpdC4gV2hlbiB1cGRhdGluZyB0aGUgbGFzdCBpdGVtLCBjYWxsIHJlcGxhY2VMYXN0LlxuICovXG5leHBvcnQgY2xhc3MgSGlzdG9yeU5hdmlnYXRvcjI8VD4ge1xuXG5cdHByaXZhdGUgdmFsdWVTZXQ6IFNldDxUPjtcblx0cHJpdmF0ZSBoZWFkOiBIaXN0b3J5Tm9kZTxUPjtcblx0cHJpdmF0ZSB0YWlsOiBIaXN0b3J5Tm9kZTxUPjtcblx0cHJpdmF0ZSBjdXJzb3I6IEhpc3RvcnlOb2RlPFQ+O1xuXHRwcml2YXRlIF9zaXplOiBudW1iZXI7XG5cdGdldCBzaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9zaXplOyB9XG5cblx0Y29uc3RydWN0b3IoaGlzdG9yeTogcmVhZG9ubHkgVFtdLCBwcml2YXRlIGNhcGFjaXR5OiBudW1iZXIgPSAxMCwgcHJpdmF0ZSBpZGVudGl0eUZuOiAodDogVCkgPT4gdW5rbm93biA9IHQgPT4gdCkge1xuXHRcdGlmIChoaXN0b3J5Lmxlbmd0aCA8IDEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NpemUgPSAxO1xuXHRcdHRoaXMuaGVhZCA9IHRoaXMudGFpbCA9IHRoaXMuY3Vyc29yID0ge1xuXHRcdFx0dmFsdWU6IGhpc3RvcnlbMF0sXG5cdFx0XHRwcmV2aW91czogdW5kZWZpbmVkLFxuXHRcdFx0bmV4dDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdHRoaXMudmFsdWVTZXQgPSBuZXcgU2V0V2l0aEtleTxUPihbaGlzdG9yeVswXV0sIGlkZW50aXR5Rm4pO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgaGlzdG9yeS5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5hZGQoaGlzdG9yeVtpXSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkKHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZTogSGlzdG9yeU5vZGU8VD4gPSB7XG5cdFx0XHR2YWx1ZSxcblx0XHRcdHByZXZpb3VzOiB0aGlzLnRhaWwsXG5cdFx0XHRuZXh0OiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0dGhpcy50YWlsLm5leHQgPSBub2RlO1xuXHRcdHRoaXMudGFpbCA9IG5vZGU7XG5cdFx0dGhpcy5jdXJzb3IgPSB0aGlzLnRhaWw7XG5cdFx0dGhpcy5fc2l6ZSsrO1xuXG5cdFx0aWYgKHRoaXMudmFsdWVTZXQuaGFzKHZhbHVlKSkge1xuXHRcdFx0dGhpcy5fZGVsZXRlRnJvbUxpc3QodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZhbHVlU2V0LmFkZCh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRoaXMuX3NpemUgPiB0aGlzLmNhcGFjaXR5KSB7XG5cdFx0XHR0aGlzLnZhbHVlU2V0LmRlbGV0ZSh0aGlzLmhlYWQudmFsdWUpO1xuXG5cdFx0XHR0aGlzLmhlYWQgPSB0aGlzLmhlYWQubmV4dCE7XG5cdFx0XHR0aGlzLmhlYWQucHJldmlvdXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zaXplLS07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIG9sZCBsYXN0IHZhbHVlXG5cdCAqL1xuXHRyZXBsYWNlTGFzdCh2YWx1ZTogVCk6IFQge1xuXHRcdGlmICh0aGlzLmlkZW50aXR5Rm4odGhpcy50YWlsLnZhbHVlKSA9PT0gdGhpcy5pZGVudGl0eUZuKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZFZhbHVlID0gdGhpcy50YWlsLnZhbHVlO1xuXHRcdHRoaXMudmFsdWVTZXQuZGVsZXRlKG9sZFZhbHVlKTtcblx0XHR0aGlzLnRhaWwudmFsdWUgPSB2YWx1ZTtcblxuXHRcdGlmICh0aGlzLnZhbHVlU2V0Lmhhcyh2YWx1ZSkpIHtcblx0XHRcdHRoaXMuX2RlbGV0ZUZyb21MaXN0KHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52YWx1ZVNldC5hZGQodmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBvbGRWYWx1ZTtcblx0fVxuXG5cdHByZXBlbmQodmFsdWU6IFQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2l6ZSA9PT0gdGhpcy5jYXBhY2l0eSB8fCB0aGlzLnZhbHVlU2V0Lmhhcyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlOiBIaXN0b3J5Tm9kZTxUPiA9IHtcblx0XHRcdHZhbHVlLFxuXHRcdFx0cHJldmlvdXM6IHVuZGVmaW5lZCxcblx0XHRcdG5leHQ6IHRoaXMuaGVhZFxuXHRcdH07XG5cblx0XHR0aGlzLmhlYWQucHJldmlvdXMgPSBub2RlO1xuXHRcdHRoaXMuaGVhZCA9IG5vZGU7XG5cdFx0dGhpcy5fc2l6ZSsrO1xuXG5cdFx0dGhpcy52YWx1ZVNldC5hZGQodmFsdWUpO1xuXHR9XG5cblx0aXNBdEVuZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJzb3IgPT09IHRoaXMudGFpbDtcblx0fVxuXG5cdGN1cnJlbnQoKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuY3Vyc29yLnZhbHVlO1xuXHR9XG5cblx0cHJldmlvdXMoKTogVCB7XG5cdFx0aWYgKHRoaXMuY3Vyc29yLnByZXZpb3VzKSB7XG5cdFx0XHR0aGlzLmN1cnNvciA9IHRoaXMuY3Vyc29yLnByZXZpb3VzO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmN1cnNvci52YWx1ZTtcblx0fVxuXG5cdG5leHQoKTogVCB7XG5cdFx0aWYgKHRoaXMuY3Vyc29yLm5leHQpIHtcblx0XHRcdHRoaXMuY3Vyc29yID0gdGhpcy5jdXJzb3IubmV4dDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jdXJzb3IudmFsdWU7XG5cdH1cblxuXHRoYXModDogVCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlU2V0Lmhhcyh0KTtcblx0fVxuXG5cdHJlc2V0Q3Vyc29yKCk6IFQge1xuXHRcdHRoaXMuY3Vyc29yID0gdGhpcy50YWlsO1xuXHRcdHJldHVybiB0aGlzLmN1cnNvci52YWx1ZTtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxUPiB7XG5cdFx0bGV0IG5vZGU6IEhpc3RvcnlOb2RlPFQ+IHwgdW5kZWZpbmVkID0gdGhpcy5oZWFkO1xuXG5cdFx0d2hpbGUgKG5vZGUpIHtcblx0XHRcdHlpZWxkIG5vZGUudmFsdWU7XG5cdFx0XHRub2RlID0gbm9kZS5uZXh0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RlbGV0ZUZyb21MaXN0KHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0bGV0IHRlbXAgPSB0aGlzLmhlYWQ7XG5cblx0XHRjb25zdCB2YWx1ZUtleSA9IHRoaXMuaWRlbnRpdHlGbih2YWx1ZSk7XG5cdFx0d2hpbGUgKHRlbXAgIT09IHRoaXMudGFpbCkge1xuXHRcdFx0aWYgKHRoaXMuaWRlbnRpdHlGbih0ZW1wLnZhbHVlKSA9PT0gdmFsdWVLZXkpIHtcblx0XHRcdFx0aWYgKHRlbXAgPT09IHRoaXMuaGVhZCkge1xuXHRcdFx0XHRcdHRoaXMuaGVhZCA9IHRoaXMuaGVhZC5uZXh0ITtcblx0XHRcdFx0XHR0aGlzLmhlYWQucHJldmlvdXMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGVtcC5wcmV2aW91cyEubmV4dCA9IHRlbXAubmV4dDtcblx0XHRcdFx0XHR0ZW1wLm5leHQhLnByZXZpb3VzID0gdGVtcC5wcmV2aW91cztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3NpemUtLTtcblx0XHRcdH1cblxuXHRcdFx0dGVtcCA9IHRlbXAubmV4dCE7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUczQixTQUFTLHNCQUFrQztBQVlwQyxNQUFNLGlCQUE2QztBQUFBLEVBS3pELFlBQ1MsV0FBd0Isb0JBQUksSUFBSSxHQUN4QyxRQUFnQixJQUNmO0FBRk87QUFHUixTQUFLLFNBQVM7QUFDZCxTQUFLLFVBQVU7QUFDZixRQUFJLEtBQUssU0FBUyxhQUFhO0FBQzlCLFdBQUssY0FBYyxLQUFLLFNBQVMsWUFBWSxNQUFNLEtBQUssVUFBVSxDQUFDO0FBQUEsSUFDcEU7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUFrQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxJQUFJLEdBQU07QUFDaEIsU0FBSyxTQUFTLE9BQU8sQ0FBQztBQUN0QixTQUFLLFNBQVMsSUFBSSxDQUFDO0FBQ25CLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFTyxPQUFpQjtBQUV2QixXQUFPLEtBQUssV0FBVyxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVPLFdBQXFCO0FBQzNCLFFBQUksS0FBSyxpQkFBaUIsTUFBTSxHQUFHO0FBQ2xDLGFBQU8sS0FBSyxXQUFXLFNBQVM7QUFBQSxJQUNqQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxVQUFvQjtBQUMxQixXQUFPLEtBQUssV0FBVyxRQUFRO0FBQUEsRUFDaEM7QUFBQSxFQUVPLFFBQWtCO0FBQ3hCLFdBQU8sS0FBSyxXQUFXLE1BQU07QUFBQSxFQUM5QjtBQUFBLEVBRU8sT0FBaUI7QUFDdkIsV0FBTyxLQUFLLFdB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
