import { BugIndicatingError } from "./errors.js";
class ReentrancyBarrier {
  constructor() {
    this._isOccupied = false;
  }
  /**
   * Calls `runner` if the barrier is not occupied.
   * During the call, the barrier becomes occupied.
   */
  runExclusivelyOrSkip(runner) {
    if (this._isOccupied) {
      return;
    }
    this._isOccupied = true;
    try {
      runner();
    } finally {
      this._isOccupied = false;
    }
  }
  /**
   * Calls `runner`. If the barrier is occupied, throws an error.
   * During the call, the barrier becomes active.
   */
  runExclusivelyOrThrow(runner) {
    if (this._isOccupied) {
      throw new BugIndicatingError(`ReentrancyBarrier: reentrant call detected!`);
    }
    this._isOccupied = true;
    try {
      runner();
    } finally {
      this._isOccupied = false;
    }
  }
  /**
   * Indicates if some runner occupies this barrier.
  */
  get isOccupied() {
    return this._isOccupied;
  }
  makeExclusiveOrSkip(fn) {
    return ((...args) => {
      if (this._isOccupied) {
        return;
      }
      this._isOccupied = true;
      try {
        return fn(...args);
      } finally {
        this._isOccupied = false;
      }
    });
  }
}
export {
  ReentrancyBarrier
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGNvbnRyb2xGbG93LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4vZXJyb3JzLmpzJztcblxuLypcbiAqIFRoaXMgZmlsZSBjb250YWlucyBoZWxwZXIgY2xhc3NlcyB0byBtYW5hZ2UgY29udHJvbCBmbG93LlxuKi9cblxuLyoqXG4gKiBQcmV2ZW50cyBjb2RlIGZyb20gYmVpbmcgcmUtZW50cmFudC5cbiovXG5leHBvcnQgY2xhc3MgUmVlbnRyYW5jeUJhcnJpZXIge1xuXHRwcml2YXRlIF9pc09jY3VwaWVkID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIENhbGxzIGBydW5uZXJgIGlmIHRoZSBiYXJyaWVyIGlzIG5vdCBvY2N1cGllZC5cblx0ICogRHVyaW5nIHRoZSBjYWxsLCB0aGUgYmFycmllciBiZWNvbWVzIG9jY3VwaWVkLlxuXHQgKi9cblx0cHVibGljIHJ1bkV4Y2x1c2l2ZWx5T3JTa2lwKHJ1bm5lcjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc09jY3VwaWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzT2NjdXBpZWQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRydW5uZXIoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNPY2N1cGllZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxscyBgcnVubmVyYC4gSWYgdGhlIGJhcnJpZXIgaXMgb2NjdXBpZWQsIHRocm93cyBhbiBlcnJvci5cblx0ICogRHVyaW5nIHRoZSBjYWxsLCB0aGUgYmFycmllciBiZWNvbWVzIGFjdGl2ZS5cblx0ICovXG5cdHB1YmxpYyBydW5FeGNsdXNpdmVseU9yVGhyb3cocnVubmVyOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzT2NjdXBpZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoYFJlZW50cmFuY3lCYXJyaWVyOiByZWVudHJhbnQgY2FsbCBkZXRlY3RlZCFgKTtcblx0XHR9XG5cdFx0dGhpcy5faXNPY2N1cGllZCA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHJ1bm5lcigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc09jY3VwaWVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEluZGljYXRlcyBpZiBzb21lIHJ1bm5lciBvY2N1cGllcyB0aGlzIGJhcnJpZXIuXG5cdCovXG5cdHB1YmxpYyBnZXQgaXNPY2N1cGllZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faXNPY2N1cGllZDtcblx0fVxuXG5cdHB1YmxpYyBtYWtlRXhjbHVzaXZlT3JTa2lwPFRBcmdzIGV4dGVuZHMgdW5rbm93bltdPihmbjogKC4uLmFyZ3M6IFRBcmdzKSA9PiB2b2lkKTogKC4uLmFyZ3M6IFRBcmdzKSA9PiB2b2lkIHtcblx0XHRyZXR1cm4gKCguLi5hcmdzOiBUQXJncykgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzT2NjdXBpZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faXNPY2N1cGllZCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gZm4oLi4uYXJncyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc09jY3VwaWVkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsMEJBQTBCO0FBUzVCLE1BQU0sa0JBQWtCO0FBQUEsRUFBeEI7QUFDTixTQUFRLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNZixxQkFBcUIsUUFBMEI7QUFDckQsUUFBSSxLQUFLLGFBQWE7QUFDckI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxjQUFjO0FBQ25CLFFBQUk7QUFDSCxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLHNCQUFzQixRQUEwQjtBQUN0RCxRQUFJLEtBQUssYUFBYTtBQUNyQixZQUFNLElBQUksbUJBQW1CLDZDQUE2QztBQUFBLElBQzNFO0FBQ0EsU0FBSyxjQUFjO0FBQ25CLFFBQUk7QUFDSCxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLGFBQWE7QUFDdkIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sb0JBQTZDLElBQXdEO0FBQzNHLFlBQVEsSUFBSSxTQUFnQjtBQUMzQixVQUFJLEtBQUssYUFBYTtBQUNyQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGNBQWM7QUFDbkIsVUFBSTtBQUNILGVBQU8sR0FBRyxHQUFHLElBQUk7QUFBQSxNQUNsQixVQUFFO0FBQ0QsYUFBSyxjQUFjO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
