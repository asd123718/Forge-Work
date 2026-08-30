var LazyValueState = /* @__PURE__ */ ((LazyValueState2) => {
  LazyValueState2[LazyValueState2["Uninitialized"] = 0] = "Uninitialized";
  LazyValueState2[LazyValueState2["Running"] = 1] = "Running";
  LazyValueState2[LazyValueState2["Completed"] = 2] = "Completed";
  return LazyValueState2;
})(LazyValueState || {});
class Lazy {
  constructor(executor) {
    this.executor = executor;
    this._state = 0 /* Uninitialized */;
  }
  /**
   * True if the lazy value has been resolved.
   */
  get hasValue() {
    return this._state === 2 /* Completed */;
  }
  /**
   * Get the wrapped value.
   *
   * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
   * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
   */
  get value() {
    if (this._state === 0 /* Uninitialized */) {
      this._state = 1 /* Running */;
      try {
        this._value = this.executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._state = 2 /* Completed */;
      }
    } else if (this._state === 1 /* Running */) {
      throw new Error("Cannot read the value of a lazy that is being initialized");
    }
    if (this._error) {
      throw this._error;
    }
    return this._value;
  }
  /**
   * Get the wrapped value without forcing evaluation.
   */
  get rawValue() {
    return this._value;
  }
}
export {
  Lazy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGxhenkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5lbnVtIExhenlWYWx1ZVN0YXRlIHtcblx0VW5pbml0aWFsaXplZCxcblx0UnVubmluZyxcblx0Q29tcGxldGVkLFxufVxuXG5leHBvcnQgY2xhc3MgTGF6eTxUPiB7XG5cblx0cHJpdmF0ZSBfc3RhdGUgPSBMYXp5VmFsdWVTdGF0ZS5VbmluaXRpYWxpemVkO1xuXHRwcml2YXRlIF92YWx1ZT86IFQ7XG5cdHByaXZhdGUgX2Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4ZWN1dG9yOiAoKSA9PiBULFxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBUcnVlIGlmIHRoZSBsYXp5IHZhbHVlIGhhcyBiZWVuIHJlc29sdmVkLlxuXHQgKi9cblx0Z2V0IGhhc1ZhbHVlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3RhdGUgPT09IExhenlWYWx1ZVN0YXRlLkNvbXBsZXRlZDsgfVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHdyYXBwZWQgdmFsdWUuXG5cdCAqXG5cdCAqIFRoaXMgd2lsbCBmb3JjZSBldmFsdWF0aW9uIG9mIHRoZSBsYXp5IHZhbHVlIGlmIGl0IGhhcyBub3QgYmVlbiByZXNvbHZlZCB5ZXQuIExhenkgdmFsdWVzIGFyZSBvbmx5XG5cdCAqIHJlc29sdmVkIG9uY2UuIGBnZXRWYWx1ZWAgd2lsbCByZS10aHJvdyBleGNlcHRpb25zIHRoYXQgYXJlIGhpdCB3aGlsZSByZXNvbHZpbmcgdGhlIHZhbHVlXG5cdCAqL1xuXHRnZXQgdmFsdWUoKTogVCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBMYXp5VmFsdWVTdGF0ZS5VbmluaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IExhenlWYWx1ZVN0YXRlLlJ1bm5pbmc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl92YWx1ZSA9IHRoaXMuZXhlY3V0b3IoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9lcnJvciA9IGVycjtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gTGF6eVZhbHVlU3RhdGUuQ29tcGxldGVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGUgPT09IExhenlWYWx1ZVN0YXRlLlJ1bm5pbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlYWQgdGhlIHZhbHVlIG9mIGEgbGF6eSB0aGF0IGlzIGJlaW5nIGluaXRpYWxpemVkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9lcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlITtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHdyYXBwZWQgdmFsdWUgd2l0aG91dCBmb3JjaW5nIGV2YWx1YXRpb24uXG5cdCAqL1xuXHRnZXQgcmF3VmFsdWUoKTogVCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsSUFBSyxpQkFBTCxrQkFBS0Esb0JBQUw7QUFDQyxFQUFBQSxnQ0FBQTtBQUNBLEVBQUFBLGdDQUFBO0FBQ0EsRUFBQUEsZ0NBQUE7QUFISSxTQUFBQTtBQUFBLEdBQUE7QUFNRSxNQUFNLEtBQVE7QUFBQSxFQU1wQixZQUNrQixVQUNoQjtBQURnQjtBQUxsQixTQUFRLFNBQVM7QUFBQSxFQU1iO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLSixJQUFJLFdBQW9CO0FBQUUsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUEwQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUTNFLElBQUksUUFBVztBQUNkLFFBQUksS0FBSyxXQUFXLHVCQUE4QjtBQUNqRCxXQUFLLFNBQVM7QUFDZCxVQUFJO0FBQ0gsYUFBSyxTQUFTLEtBQUssU0FBUztBQUFBLE1BQzdCLFNBQVMsS0FBSztBQUNiLGFBQUssU0FBUztBQUFBLE1BQ2YsVUFBRTtBQUNELGFBQUssU0FBUztBQUFBLE1BQ2Y7QUFBQSxJQUNELFdBQVcsS0FBSyxXQUFXLGlCQUF3QjtBQUNsRCxZQUFNLElBQUksTUFBTSwyREFBMkQ7QUFBQSxJQUM1RTtBQUVBLFFBQUksS0FBSyxRQUFRO0FBQ2hCLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFJLFdBQTBCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUTtBQUNyRDsiLAogICJuYW1lcyI6IFsiTGF6eVZhbHVlU3RhdGUiXQp9Cg==
