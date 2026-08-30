import { Disposable } from "../../lifecycle.js";
import { DisposableStore, toDisposable } from "../commonFacade/deps.js";
import { observableValue } from "../observables/observableValue.js";
import { autorun } from "../reactions/autorun.js";
class TotalTrueTimeObservable extends Disposable {
  constructor(value) {
    super();
    this.value = value;
    this._totalTime = 0;
    this._startTime = void 0;
    this._register(autorun((reader) => {
      const isTrue = this.value.read(reader);
      if (isTrue) {
        this._startTime = Date.now();
      } else {
        if (this._startTime !== void 0) {
          const delta = Date.now() - this._startTime;
          this._totalTime += delta;
          this._startTime = void 0;
        }
      }
    }));
  }
  /**
   * Reports the total time the observable has been true in milliseconds.
   * E.g. `true` for 100ms, then `false` for 50ms, then `true` for 200ms results in 300ms.
  */
  totalTimeMs() {
    if (this._startTime !== void 0) {
      return this._totalTime + (Date.now() - this._startTime);
    }
    return this._totalTime;
  }
  /**
   * Runs the callback when the total time the observable has been true increased by the given delta in milliseconds.
  */
  fireWhenTimeIncreasedBy(deltaTimeMs, callback) {
    const store = new DisposableStore();
    let accumulatedTime = 0;
    let startTime = void 0;
    store.add(autorun((reader) => {
      const isTrue = this.value.read(reader);
      if (isTrue) {
        startTime = Date.now();
        const remainingTime = deltaTimeMs - accumulatedTime;
        if (remainingTime <= 0) {
          callback();
          store.dispose();
          return;
        }
        const handle = setTimeout(() => {
          accumulatedTime += Date.now() - startTime;
          startTime = void 0;
          callback();
          store.dispose();
        }, remainingTime);
        reader.store.add(toDisposable(() => {
          clearTimeout(handle);
          if (startTime !== void 0) {
            accumulatedTime += Date.now() - startTime;
            startTime = void 0;
          }
        }));
      }
    }));
    return store;
  }
}
function wasTrueRecently(obs, timeMs, store) {
  const result = observableValue("wasTrueRecently", false);
  let timeout;
  store.add(autorun((reader) => {
    const value = obs.read(reader);
    if (value) {
      result.set(true, void 0);
      if (timeout !== void 0) {
        clearTimeout(timeout);
        timeout = void 0;
      }
    } else {
      timeout = setTimeout(() => {
        result.set(false, void 0);
        timeout = void 0;
      }, timeMs);
    }
  }));
  store.add(toDisposable(() => {
    if (timeout !== void 0) {
      clearTimeout(timeout);
    }
  }));
  return result;
}
export {
  TotalTrueTimeObservable,
  wasTrueRecently
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcZXhwZXJpbWVudGFsXFx0aW1lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uL2Jhc2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vY29tbW9uRmFjYWRlL2RlcHMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi9yZWFjdGlvbnMvYXV0b3J1bi5qcyc7XG5cbi8qKiBNZWFzdXJlcyB0aGUgdG90YWwgdGltZSBhbiBvYnNlcnZhYmxlIGhhZCB0aGUgdmFsdWUgXCJ0cnVlXCIuICovXG5leHBvcnQgY2xhc3MgVG90YWxUcnVlVGltZU9ic2VydmFibGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfdG90YWxUaW1lID0gMDtcblx0cHJpdmF0ZSBfc3RhcnRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNUcnVlID0gdGhpcy52YWx1ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNUcnVlKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhcnRUaW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBkZWx0YSA9IERhdGUubm93KCkgLSB0aGlzLl9zdGFydFRpbWU7XG5cdFx0XHRcdFx0dGhpcy5fdG90YWxUaW1lICs9IGRlbHRhO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0VGltZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBvcnRzIHRoZSB0b3RhbCB0aW1lIHRoZSBvYnNlcnZhYmxlIGhhcyBiZWVuIHRydWUgaW4gbWlsbGlzZWNvbmRzLlxuXHQgKiBFLmcuIGB0cnVlYCBmb3IgMTAwbXMsIHRoZW4gYGZhbHNlYCBmb3IgNTBtcywgdGhlbiBgdHJ1ZWAgZm9yIDIwMG1zIHJlc3VsdHMgaW4gMzAwbXMuXG5cdCovXG5cdHB1YmxpYyB0b3RhbFRpbWVNcygpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9zdGFydFRpbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvdGFsVGltZSArIChEYXRlLm5vdygpIC0gdGhpcy5fc3RhcnRUaW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RvdGFsVGltZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIHRoZSBjYWxsYmFjayB3aGVuIHRoZSB0b3RhbCB0aW1lIHRoZSBvYnNlcnZhYmxlIGhhcyBiZWVuIHRydWUgaW5jcmVhc2VkIGJ5IHRoZSBnaXZlbiBkZWx0YSBpbiBtaWxsaXNlY29uZHMuXG5cdCovXG5cdHB1YmxpYyBmaXJlV2hlblRpbWVJbmNyZWFzZWRCeShkZWx0YVRpbWVNczogbnVtYmVyLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgYWNjdW11bGF0ZWRUaW1lID0gMDtcblx0XHRsZXQgc3RhcnRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNUcnVlID0gdGhpcy52YWx1ZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmIChpc1RydWUpIHtcblx0XHRcdFx0c3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nVGltZSA9IGRlbHRhVGltZU1zIC0gYWNjdW11bGF0ZWRUaW1lO1xuXG5cdFx0XHRcdGlmIChyZW1haW5pbmdUaW1lIDw9IDApIHtcblx0XHRcdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRhY2N1bXVsYXRlZFRpbWUgKz0gKERhdGUubm93KCkgLSBzdGFydFRpbWUhKTtcblx0XHRcdFx0XHRzdGFydFRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y2FsbGJhY2soKTtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH0sIHJlbWFpbmluZ1RpbWUpO1xuXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoc3RhcnRUaW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGFjY3VtdWxhdGVkVGltZSArPSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG5cdFx0XHRcdFx0XHRzdGFydFRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBhbiBvYnNlcnZhYmxlIHRoYXQgaXMgdHJ1ZSB3aGVuIHRoZSBpbnB1dCBvYnNlcnZhYmxlIHdhcyB0cnVlIHdpdGhpbiB0aGUgbGFzdCBgdGltZU1zYCBtaWxsaXNlY29uZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXNUcnVlUmVjZW50bHkob2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPiwgdGltZU1zOiBudW1iZXIsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdGNvbnN0IHJlc3VsdCA9IG9ic2VydmFibGVWYWx1ZSgnd2FzVHJ1ZVJlY2VudGx5JywgZmFsc2UpO1xuXHRsZXQgdGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cblx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IG9icy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRyZXN1bHQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAodGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0dGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRyZXN1bHQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgdGltZU1zKTtcblx0XHR9XG5cdH0pKTtcblxuXHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRpZiAodGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFHakIsTUFBTSxnQ0FBZ0MsV0FBVztBQUFBLEVBSXZELFlBQ2tCLE9BQ2hCO0FBQ0QsVUFBTTtBQUZXO0FBSmxCLFNBQVEsYUFBYTtBQUNyQixTQUFRLGFBQWlDO0FBTXhDLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDckMsVUFBSSxRQUFRO0FBQ1gsYUFBSyxhQUFhLEtBQUssSUFBSTtBQUFBLE1BQzVCLE9BQU87QUFDTixZQUFJLEtBQUssZUFBZSxRQUFXO0FBQ2xDLGdCQUFNLFFBQVEsS0FBSyxJQUFJLElBQUksS0FBSztBQUNoQyxlQUFLLGNBQWM7QUFDbkIsZUFBSyxhQUFhO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLGNBQXNCO0FBQzVCLFFBQUksS0FBSyxlQUFlLFFBQVc7QUFDbEMsYUFBTyxLQUFLLGNBQWMsS0FBSyxJQUFJLElBQUksS0FBSztBQUFBLElBQzdDO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sd0JBQXdCLGFBQXFCLFVBQW1DO0FBQ3RGLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxRQUFJLGtCQUFrQjtBQUN0QixRQUFJLFlBQWdDO0FBRXBDLFVBQU0sSUFBSSxRQUFRLFlBQVU7QUFDM0IsWUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLE1BQU07QUFFckMsVUFBSSxRQUFRO0FBQ1gsb0JBQVksS0FBSyxJQUFJO0FBQ3JCLGNBQU0sZ0JBQWdCLGNBQWM7QUFFcEMsWUFBSSxpQkFBaUIsR0FBRztBQUN2QixtQkFBUztBQUNULGdCQUFNLFFBQVE7QUFDZDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLFNBQVMsV0FBVyxNQUFNO0FBQy9CLDZCQUFvQixLQUFLLElBQUksSUFBSTtBQUNqQyxzQkFBWTtBQUNaLG1CQUFTO0FBQ1QsZ0JBQU0sUUFBUTtBQUFBLFFBQ2YsR0FBRyxhQUFhO0FBRWhCLGVBQU8sTUFBTSxJQUFJLGFBQWEsTUFBTTtBQUNuQyx1QkFBYSxNQUFNO0FBQ25CLGNBQUksY0FBYyxRQUFXO0FBQzVCLCtCQUFvQixLQUFLLElBQUksSUFBSTtBQUNqQyx3QkFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFLTyxTQUFTLGdCQUFnQixLQUEyQixRQUFnQixPQUE4QztBQUN4SCxRQUFNLFNBQVMsZ0JBQWdCLG1CQUFtQixLQUFLO0FBQ3ZELE1BQUk7QUFFSixRQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFVBQU0sUUFBUSxJQUFJLEtBQUssTUFBTTtBQUM3QixRQUFJLE9BQU87QUFDVixhQUFPLElBQUksTUFBTSxNQUFTO0FBQzFCLFVBQUksWUFBWSxRQUFXO0FBQzFCLHFCQUFhLE9BQU87QUFDcEIsa0JBQVU7QUFBQSxNQUNYO0FBQUEsSUFDRCxPQUFPO0FBQ04sZ0JBQVUsV0FBVyxNQUFNO0FBQzFCLGVBQU8sSUFBSSxPQUFPLE1BQVM7QUFDM0Isa0JBQVU7QUFBQSxNQUNYLEdBQUcsTUFBTTtBQUFBLElBQ1Y7QUFBQSxFQUNELENBQUMsQ0FBQztBQUVGLFFBQU0sSUFBSSxhQUFhLE1BQU07QUFDNUIsUUFBSSxZQUFZLFFBQVc7QUFDMUIsbUJBQWEsT0FBTztBQUFBLElBQ3JCO0FBQUEsRUFDRCxDQUFDLENBQUM7QUFFRixTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
