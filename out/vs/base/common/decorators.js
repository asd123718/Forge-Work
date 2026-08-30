function createDecorator(mapFn) {
  return (_target, key, descriptor) => {
    let fnKey = null;
    let fn = null;
    if (typeof descriptor.value === "function") {
      fnKey = "value";
      fn = descriptor.value;
    } else if (typeof descriptor.get === "function") {
      fnKey = "get";
      fn = descriptor.get;
    }
    if (!fn || typeof key === "symbol") {
      throw new Error("not supported");
    }
    descriptor[fnKey] = mapFn(fn, key);
  };
}
function memoize(_target, key, descriptor) {
  let fnKey = null;
  let fn = null;
  if (typeof descriptor.value === "function") {
    fnKey = "value";
    fn = descriptor.value;
    if (fn.length !== 0) {
      console.warn("Memoize should only be used in functions with zero parameters");
    }
  } else if (typeof descriptor.get === "function") {
    fnKey = "get";
    fn = descriptor.get;
  }
  if (!fn) {
    throw new Error("not supported");
  }
  const memoizeKey = `$memoize$${key}`;
  descriptor[fnKey] = function(...args) {
    if (!this.hasOwnProperty(memoizeKey)) {
      Object.defineProperty(this, memoizeKey, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: fn.apply(this, args)
      });
    }
    return this[memoizeKey];
  };
}
function debounce(delay, reducer, initialValueProvider) {
  return createDecorator((fn, key) => {
    const timerKey = `$debounce$${key}`;
    const resultKey = `$debounce$result$${key}`;
    return function(...args) {
      if (!this[resultKey]) {
        this[resultKey] = initialValueProvider ? initialValueProvider() : void 0;
      }
      clearTimeout(this[timerKey]);
      if (reducer) {
        this[resultKey] = reducer(this[resultKey], ...args);
        args = [this[resultKey]];
      }
      this[timerKey] = setTimeout(() => {
        fn.apply(this, args);
        this[resultKey] = initialValueProvider ? initialValueProvider() : void 0;
      }, delay);
    };
  });
}
function throttle(delay, reducer, initialValueProvider) {
  return createDecorator((fn, key) => {
    const timerKey = `$throttle$timer$${key}`;
    const resultKey = `$throttle$result$${key}`;
    const lastRunKey = `$throttle$lastRun$${key}`;
    const pendingKey = `$throttle$pending$${key}`;
    return function(...args) {
      if (!this[resultKey]) {
        this[resultKey] = initialValueProvider ? initialValueProvider() : void 0;
      }
      if (this[lastRunKey] === null || this[lastRunKey] === void 0) {
        this[lastRunKey] = -Number.MAX_VALUE;
      }
      if (reducer) {
        this[resultKey] = reducer(this[resultKey], ...args);
      }
      if (this[pendingKey]) {
        return;
      }
      const nextTime = this[lastRunKey] + delay;
      if (nextTime <= Date.now()) {
        this[lastRunKey] = Date.now();
        fn.apply(this, [this[resultKey]]);
        this[resultKey] = initialValueProvider ? initialValueProvider() : void 0;
      } else {
        this[pendingKey] = true;
        this[timerKey] = setTimeout(() => {
          this[pendingKey] = false;
          this[lastRunKey] = Date.now();
          fn.apply(this, [this[resultKey]]);
          this[resultKey] = initialValueProvider ? initialValueProvider() : void 0;
        }, nextTime - Date.now());
      }
    };
  });
}
import { cancelPreviousCalls } from "./decorators/cancelPreviousCalls.js";
export {
  cancelPreviousCalls,
  debounce,
  memoize,
  throttle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGRlY29yYXRvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5mdW5jdGlvbiBjcmVhdGVEZWNvcmF0b3IobWFwRm46IChmbjogRnVuY3Rpb24sIGtleTogc3RyaW5nKSA9PiBGdW5jdGlvbik6IE1ldGhvZERlY29yYXRvciB7XG5cdHJldHVybiAoX3RhcmdldDogT2JqZWN0LCBrZXk6IHN0cmluZyB8IHN5bWJvbCwgZGVzY3JpcHRvcjogVHlwZWRQcm9wZXJ0eURlc2NyaXB0b3I8YW55PikgPT4ge1xuXHRcdGxldCBmbktleTogJ3ZhbHVlJyB8ICdnZXQnIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGZuOiBGdW5jdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLnZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRmbktleSA9ICd2YWx1ZSc7XG5cdFx0XHRmbiA9IGRlc2NyaXB0b3IudmFsdWU7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgZGVzY3JpcHRvci5nZXQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGZuS2V5ID0gJ2dldCc7XG5cdFx0XHRmbiA9IGRlc2NyaXB0b3IuZ2V0O1xuXHRcdH1cblxuXHRcdGlmICghZm4gfHwgdHlwZW9mIGtleSA9PT0gJ3N5bWJvbCcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblxuXHRcdGRlc2NyaXB0b3JbZm5LZXkhXSA9IG1hcEZuKGZuLCBrZXkpO1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVtb2l6ZShfdGFyZ2V0OiBPYmplY3QsIGtleTogc3RyaW5nLCBkZXNjcmlwdG9yOiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcblx0bGV0IGZuS2V5OiAndmFsdWUnIHwgJ2dldCcgfCBudWxsID0gbnVsbDtcblx0bGV0IGZuOiBGdW5jdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdGlmICh0eXBlb2YgZGVzY3JpcHRvci52YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGZuS2V5ID0gJ3ZhbHVlJztcblx0XHRmbiA9IGRlc2NyaXB0b3IudmFsdWU7XG5cblx0XHRpZiAoZm4hLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdNZW1vaXplIHNob3VsZCBvbmx5IGJlIHVzZWQgaW4gZnVuY3Rpb25zIHdpdGggemVybyBwYXJhbWV0ZXJzJyk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHR5cGVvZiBkZXNjcmlwdG9yLmdldCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGZuS2V5ID0gJ2dldCc7XG5cdFx0Zm4gPSBkZXNjcmlwdG9yLmdldDtcblx0fVxuXG5cdGlmICghZm4pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdGNvbnN0IG1lbW9pemVLZXkgPSBgJG1lbW9pemUkJHtrZXl9YDtcblx0ZGVzY3JpcHRvcltmbktleSFdID0gZnVuY3Rpb24gKHRoaXM6IGFueSwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0aWYgKCF0aGlzLmhhc093blByb3BlcnR5KG1lbW9pemVLZXkpKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgbWVtb2l6ZUtleSwge1xuXHRcdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdFx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRcdFx0d3JpdGFibGU6IGZhbHNlLFxuXHRcdFx0XHR2YWx1ZTogZm4uYXBwbHkodGhpcywgYXJncylcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpc1ttZW1vaXplS2V5XTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVib3VuY2VSZWR1Y2VyPFQ+IHtcblx0KHByZXZpb3VzVmFsdWU6IFQsIC4uLmFyZ3M6IGFueVtdKTogVDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlPFQ+KGRlbGF5OiBudW1iZXIsIHJlZHVjZXI/OiBJRGVib3VuY2VSZWR1Y2VyPFQ+LCBpbml0aWFsVmFsdWVQcm92aWRlcj86ICgpID0+IFQpIHtcblx0cmV0dXJuIGNyZWF0ZURlY29yYXRvcigoZm4sIGtleSkgPT4ge1xuXHRcdGNvbnN0IHRpbWVyS2V5ID0gYCRkZWJvdW5jZSQke2tleX1gO1xuXHRcdGNvbnN0IHJlc3VsdEtleSA9IGAkZGVib3VuY2UkcmVzdWx0JCR7a2V5fWA7XG5cblx0XHRyZXR1cm4gZnVuY3Rpb24gKHRoaXM6IGFueSwgLi4uYXJnczogYW55W10pIHtcblx0XHRcdGlmICghdGhpc1tyZXN1bHRLZXldKSB7XG5cdFx0XHRcdHRoaXNbcmVzdWx0S2V5XSA9IGluaXRpYWxWYWx1ZVByb3ZpZGVyID8gaW5pdGlhbFZhbHVlUHJvdmlkZXIoKSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXNbdGltZXJLZXldKTtcblxuXHRcdFx0aWYgKHJlZHVjZXIpIHtcblx0XHRcdFx0dGhpc1tyZXN1bHRLZXldID0gcmVkdWNlcih0aGlzW3Jlc3VsdEtleV0sIC4uLmFyZ3MpO1xuXHRcdFx0XHRhcmdzID0gW3RoaXNbcmVzdWx0S2V5XV07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXNbdGltZXJLZXldID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdFx0XHR0aGlzW3Jlc3VsdEtleV0gPSBpbml0aWFsVmFsdWVQcm92aWRlciA/IGluaXRpYWxWYWx1ZVByb3ZpZGVyKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LCBkZWxheSk7XG5cdFx0fTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxUPihkZWxheTogbnVtYmVyLCByZWR1Y2VyPzogSURlYm91bmNlUmVkdWNlcjxUPiwgaW5pdGlhbFZhbHVlUHJvdmlkZXI/OiAoKSA9PiBUKSB7XG5cdHJldHVybiBjcmVhdGVEZWNvcmF0b3IoKGZuLCBrZXkpID0+IHtcblx0XHRjb25zdCB0aW1lcktleSA9IGAkdGhyb3R0bGUkdGltZXIkJHtrZXl9YDtcblx0XHRjb25zdCByZXN1bHRLZXkgPSBgJHRocm90dGxlJHJlc3VsdCQke2tleX1gO1xuXHRcdGNvbnN0IGxhc3RSdW5LZXkgPSBgJHRocm90dGxlJGxhc3RSdW4kJHtrZXl9YDtcblx0XHRjb25zdCBwZW5kaW5nS2V5ID0gYCR0aHJvdHRsZSRwZW5kaW5nJCR7a2V5fWA7XG5cblx0XHRyZXR1cm4gZnVuY3Rpb24gKHRoaXM6IGFueSwgLi4uYXJnczogYW55W10pIHtcblx0XHRcdGlmICghdGhpc1tyZXN1bHRLZXldKSB7XG5cdFx0XHRcdHRoaXNbcmVzdWx0S2V5XSA9IGluaXRpYWxWYWx1ZVByb3ZpZGVyID8gaW5pdGlhbFZhbHVlUHJvdmlkZXIoKSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzW2xhc3RSdW5LZXldID09PSBudWxsIHx8IHRoaXNbbGFzdFJ1bktleV0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzW2xhc3RSdW5LZXldID0gLU51bWJlci5NQVhfVkFMVUU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWR1Y2VyKSB7XG5cdFx0XHRcdHRoaXNbcmVzdWx0S2V5XSA9IHJlZHVjZXIodGhpc1tyZXN1bHRLZXldLCAuLi5hcmdzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXNbcGVuZGluZ0tleV0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXh0VGltZSA9IHRoaXNbbGFzdFJ1bktleV0gKyBkZWxheTtcblx0XHRcdGlmIChuZXh0VGltZSA8PSBEYXRlLm5vdygpKSB7XG5cdFx0XHRcdHRoaXNbbGFzdFJ1bktleV0gPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRmbi5hcHBseSh0aGlzLCBbdGhpc1tyZXN1bHRLZXldXSk7XG5cdFx0XHRcdHRoaXNbcmVzdWx0S2V5XSA9IGluaXRpYWxWYWx1ZVByb3ZpZGVyID8gaW5pdGlhbFZhbHVlUHJvdmlkZXIoKSA6IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXNbcGVuZGluZ0tleV0gPSB0cnVlO1xuXHRcdFx0XHR0aGlzW3RpbWVyS2V5XSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXNbcGVuZGluZ0tleV0gPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzW2xhc3RSdW5LZXldID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRmbi5hcHBseSh0aGlzLCBbdGhpc1tyZXN1bHRLZXldXSk7XG5cdFx0XHRcdFx0dGhpc1tyZXN1bHRLZXldID0gaW5pdGlhbFZhbHVlUHJvdmlkZXIgPyBpbml0aWFsVmFsdWVQcm92aWRlcigpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9LCBuZXh0VGltZSAtIERhdGUubm93KCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xufVxuXG5leHBvcnQgeyBjYW5jZWxQcmV2aW91c0NhbGxzIH0gZnJvbSAnLi9kZWNvcmF0b3JzL2NhbmNlbFByZXZpb3VzQ2FsbHMuanMnO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0Es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
