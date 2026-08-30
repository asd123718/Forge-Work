import { TransactionImpl } from "../transaction.js";
import { getLogger } from "../logging/logging.js";
import { BaseObservable } from "./baseObservable.js";
class LazyObservableValue extends BaseObservable {
  constructor(_debugNameData, initialValue, _equalityComparator, debugLocation) {
    super(debugLocation);
    this._debugNameData = _debugNameData;
    this._equalityComparator = _equalityComparator;
    this._isUpToDate = true;
    this._deltas = [];
    this._updateCounter = 0;
    this._value = initialValue;
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "LazyObservableValue";
  }
  get() {
    this._update();
    return this._value;
  }
  _update() {
    if (this._isUpToDate) {
      return;
    }
    this._isUpToDate = true;
    if (this._deltas.length > 0) {
      for (const change of this._deltas) {
        getLogger()?.handleObservableUpdated(this, { change, didChange: true, oldValue: "(unknown)", newValue: this._value, hadValue: true });
        for (const observer of this._observers) {
          observer.handleChange(this, change);
        }
      }
      this._deltas.length = 0;
    } else {
      getLogger()?.handleObservableUpdated(this, { change: void 0, didChange: true, oldValue: "(unknown)", newValue: this._value, hadValue: true });
      for (const observer of this._observers) {
        observer.handleChange(this, void 0);
      }
    }
  }
  _beginUpdate() {
    this._updateCounter++;
    if (this._updateCounter === 1) {
      for (const observer of this._observers) {
        observer.beginUpdate(this);
      }
    }
  }
  _endUpdate() {
    this._updateCounter--;
    if (this._updateCounter === 0) {
      this._update();
      const observers = [...this._observers];
      for (const r of observers) {
        r.endUpdate(this);
      }
    }
  }
  addObserver(observer) {
    const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCounter > 0;
    super.addObserver(observer);
    if (shouldCallBeginUpdate) {
      observer.beginUpdate(this);
    }
  }
  removeObserver(observer) {
    const shouldCallEndUpdate = this._observers.has(observer) && this._updateCounter > 0;
    super.removeObserver(observer);
    if (shouldCallEndUpdate) {
      observer.endUpdate(this);
    }
  }
  set(value, tx, change) {
    if (change === void 0 && this._equalityComparator(this._value, value)) {
      return;
    }
    let _tx;
    if (!tx) {
      tx = _tx = new TransactionImpl(() => {
      }, () => `Setting ${this.debugName}`);
    }
    try {
      this._isUpToDate = false;
      this._setValue(value);
      if (change !== void 0) {
        this._deltas.push(change);
      }
      tx.updateObserver({
        beginUpdate: () => this._beginUpdate(),
        endUpdate: () => this._endUpdate(),
        handleChange: (observable, change2) => {
        },
        handlePossibleChange: (observable) => {
        }
      }, this);
      if (this._updateCounter > 1) {
        for (const observer of this._observers) {
          observer.handlePossibleChange(this);
        }
      }
    } finally {
      if (_tx) {
        _tx.finish();
      }
    }
  }
  toString() {
    return `${this.debugName}: ${this._value}`;
  }
  _setValue(newValue) {
    this._value = newValue;
  }
}
export {
  LazyObservableValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcb2JzZXJ2YWJsZXNcXGxhenlPYnNlcnZhYmxlVmFsdWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFcXVhbGl0eUNvbXBhcmVyIH0gZnJvbSAnLi4vY29tbW9uRmFjYWRlL2RlcHMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24gfSBmcm9tICcuLi9iYXNlLmpzJztcbmltcG9ydCB7IFRyYW5zYWN0aW9uSW1wbCB9IGZyb20gJy4uL3RyYW5zYWN0aW9uLmpzJztcbmltcG9ydCB7IERlYnVnTmFtZURhdGEgfSBmcm9tICcuLi9kZWJ1Z05hbWUuanMnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2luZy9sb2dnaW5nLmpzJztcbmltcG9ydCB7IEJhc2VPYnNlcnZhYmxlIH0gZnJvbSAnLi9iYXNlT2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xvY2F0aW9uIH0gZnJvbSAnLi4vZGVidWdMb2NhdGlvbi5qcyc7XG5cbi8qKlxuICogSG9sZHMgb2ZmIHVwZGF0aW5nIG9ic2VydmVycyB1bnRpbCB0aGUgdmFsdWUgaXMgYWN0dWFsbHkgcmVhZC5cbiovXG5leHBvcnQgY2xhc3MgTGF6eU9ic2VydmFibGVWYWx1ZTxULCBUQ2hhbmdlID0gdm9pZD5cblx0ZXh0ZW5kcyBCYXNlT2JzZXJ2YWJsZTxULCBUQ2hhbmdlPlxuXHRpbXBsZW1lbnRzIElTZXR0YWJsZU9ic2VydmFibGU8VCwgVENoYW5nZT4ge1xuXHRwcm90ZWN0ZWQgX3ZhbHVlOiBUO1xuXHRwcml2YXRlIF9pc1VwVG9EYXRlID0gdHJ1ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVsdGFzOiBUQ2hhbmdlW10gPSBbXTtcblxuXHRnZXQgZGVidWdOYW1lKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z05hbWVEYXRhLmdldERlYnVnTmFtZSh0aGlzKSA/PyAnTGF6eU9ic2VydmFibGVWYWx1ZSc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z05hbWVEYXRhOiBEZWJ1Z05hbWVEYXRhLFxuXHRcdGluaXRpYWxWYWx1ZTogVCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lcXVhbGl0eUNvbXBhcmF0b3I6IEVxdWFsaXR5Q29tcGFyZXI8VD4sXG5cdFx0ZGVidWdMb2NhdGlvbjogRGVidWdMb2NhdGlvblxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z0xvY2F0aW9uKTtcblx0XHR0aGlzLl92YWx1ZSA9IGluaXRpYWxWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQoKTogVCB7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1VwVG9EYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzVXBUb0RhdGUgPSB0cnVlO1xuXG5cdFx0aWYgKHRoaXMuX2RlbHRhcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLl9kZWx0YXMpIHtcblx0XHRcdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZU9ic2VydmFibGVVcGRhdGVkKHRoaXMsIHsgY2hhbmdlLCBkaWRDaGFuZ2U6IHRydWUsIG9sZFZhbHVlOiAnKHVua25vd24pJywgbmV3VmFsdWU6IHRoaXMuX3ZhbHVlLCBoYWRWYWx1ZTogdHJ1ZSB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdFx0XHRvYnNlcnZlci5oYW5kbGVDaGFuZ2UodGhpcywgY2hhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGVsdGFzLmxlbmd0aCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdldExvZ2dlcigpPy5oYW5kbGVPYnNlcnZhYmxlVXBkYXRlZCh0aGlzLCB7IGNoYW5nZTogdW5kZWZpbmVkLCBkaWRDaGFuZ2U6IHRydWUsIG9sZFZhbHVlOiAnKHVua25vd24pJywgbmV3VmFsdWU6IHRoaXMuX3ZhbHVlLCBoYWRWYWx1ZTogdHJ1ZSB9KTtcblx0XHRcdGZvciAoY29uc3Qgb2JzZXJ2ZXIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdG9ic2VydmVyLmhhbmRsZUNoYW5nZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgX2JlZ2luVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXIrKztcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMSkge1xuXHRcdFx0Zm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdFx0b2JzZXJ2ZXIuYmVnaW5VcGRhdGUodGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXItLTtcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cblx0XHRcdC8vIEVuZCB1cGRhdGUgY291bGQgY2hhbmdlIHRoZSBvYnNlcnZlciBsaXN0LlxuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXJzID0gWy4uLnRoaXMuX29ic2VydmVyc107XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2Ygb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdHIuZW5kVXBkYXRlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhZGRPYnNlcnZlcihvYnNlcnZlcjogSU9ic2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQ2FsbEJlZ2luVXBkYXRlID0gIXRoaXMuX29ic2VydmVycy5oYXMob2JzZXJ2ZXIpICYmIHRoaXMuX3VwZGF0ZUNvdW50ZXIgPiAwO1xuXHRcdHN1cGVyLmFkZE9ic2VydmVyKG9ic2VydmVyKTtcblxuXHRcdGlmIChzaG91bGRDYWxsQmVnaW5VcGRhdGUpIHtcblx0XHRcdG9ic2VydmVyLmJlZ2luVXBkYXRlKHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW1vdmVPYnNlcnZlcihvYnNlcnZlcjogSU9ic2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQ2FsbEVuZFVwZGF0ZSA9IHRoaXMuX29ic2VydmVycy5oYXMob2JzZXJ2ZXIpICYmIHRoaXMuX3VwZGF0ZUNvdW50ZXIgPiAwO1xuXHRcdHN1cGVyLnJlbW92ZU9ic2VydmVyKG9ic2VydmVyKTtcblxuXHRcdGlmIChzaG91bGRDYWxsRW5kVXBkYXRlKSB7XG5cdFx0XHQvLyBDYWxsaW5nIGVuZCB1cGRhdGUgYWZ0ZXIgcmVtb3ZpbmcgdGhlIG9ic2VydmVyIG1ha2VzIHN1cmUgZW5kVXBkYXRlIGNhbm5vdCBiZSBjYWxsZWQgdHdpY2UgaGVyZS5cblx0XHRcdG9ic2VydmVyLmVuZFVwZGF0ZSh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0KHZhbHVlOiBULCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkLCBjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRpZiAoY2hhbmdlID09PSB1bmRlZmluZWQgJiYgdGhpcy5fZXF1YWxpdHlDb21wYXJhdG9yKHRoaXMuX3ZhbHVlLCB2YWx1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgX3R4OiBUcmFuc2FjdGlvbkltcGwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0eCkge1xuXHRcdFx0dHggPSBfdHggPSBuZXcgVHJhbnNhY3Rpb25JbXBsKCgpID0+IHsgfSwgKCkgPT4gYFNldHRpbmcgJHt0aGlzLmRlYnVnTmFtZX1gKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzVXBUb0RhdGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3NldFZhbHVlKHZhbHVlKTtcblx0XHRcdGlmIChjaGFuZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9kZWx0YXMucHVzaChjaGFuZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0eC51cGRhdGVPYnNlcnZlcih7XG5cdFx0XHRcdGJlZ2luVXBkYXRlOiAoKSA9PiB0aGlzLl9iZWdpblVwZGF0ZSgpLFxuXHRcdFx0XHRlbmRVcGRhdGU6ICgpID0+IHRoaXMuX2VuZFVwZGF0ZSgpLFxuXHRcdFx0XHRoYW5kbGVDaGFuZ2U6IChvYnNlcnZhYmxlLCBjaGFuZ2UpID0+IHsgfSxcblx0XHRcdFx0aGFuZGxlUG9zc2libGVDaGFuZ2U6IChvYnNlcnZhYmxlKSA9PiB7IH0sXG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0aWYgKHRoaXMuX3VwZGF0ZUNvdW50ZXIgPiAxKSB7XG5cdFx0XHRcdC8vIFdlIGFscmVhZHkgc3RhcnRlZCBiZWdpbi9lbmQgdXBkYXRlLCBzbyB3ZSBuZWVkIHRvIG1hbnVhbGx5IGNhbGwgaGFuZGxlUG9zc2libGVDaGFuZ2Vcblx0XHRcdFx0Zm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdFx0XHRvYnNlcnZlci5oYW5kbGVQb3NzaWJsZUNoYW5nZSh0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChfdHgpIHtcblx0XHRcdFx0X3R4LmZpbmlzaCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuZGVidWdOYW1lfTogJHt0aGlzLl92YWx1ZX1gO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXRWYWx1ZShuZXdWYWx1ZTogVCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlID0gbmV3VmFsdWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsc0JBQXNCO0FBTXhCLE1BQU0sNEJBQ0osZUFDbUM7QUFBQSxFQVMzQyxZQUNrQixnQkFDakIsY0FDaUIscUJBQ2pCLGVBQ0M7QUFDRCxVQUFNLGFBQWE7QUFMRjtBQUVBO0FBVmxCLFNBQVEsY0FBYztBQUN0QixTQUFpQixVQUFxQixDQUFDO0FBMkN2QyxTQUFRLGlCQUFpQjtBQTlCeEIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBWkEsSUFBSSxZQUFZO0FBQ2YsV0FBTyxLQUFLLGVBQWUsYUFBYSxJQUFJLEtBQUs7QUFBQSxFQUNsRDtBQUFBLEVBWWdCLE1BQVM7QUFDeEIsU0FBSyxRQUFRO0FBQ2IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsVUFBZ0I7QUFDdkIsUUFBSSxLQUFLLGFBQWE7QUFDckI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxjQUFjO0FBRW5CLFFBQUksS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM1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
