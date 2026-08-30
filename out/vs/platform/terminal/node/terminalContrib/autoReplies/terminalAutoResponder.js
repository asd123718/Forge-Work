import { timeout } from "../../../../../base/common/async.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { isString } from "../../../../../base/common/types.js";
import { isWindows } from "../../../../../base/common/platform.js";
class TerminalAutoResponder extends Disposable {
  constructor(proc, matchWord, response, logService) {
    super();
    this._pointer = 0;
    this._paused = false;
    /**
     * Each reply is throttled by a second to avoid resource starvation and responding to screen
     * reprints on Winodws.
     */
    this._throttled = false;
    this._register(proc.onProcessData((e) => {
      if (this._paused || this._throttled) {
        return;
      }
      const data = isString(e) ? e : e.data;
      for (let i = 0; i < data.length; i++) {
        if (data[i] === matchWord[this._pointer]) {
          this._pointer++;
        } else {
          this._reset();
        }
        if (this._pointer === matchWord.length) {
          logService.debug(`Auto reply match: "${matchWord}", response: "${response}"`);
          proc.input(response);
          this._throttled = true;
          timeout(1e3).then(() => this._throttled = false);
          this._reset();
        }
      }
    }));
  }
  _reset() {
    this._pointer = 0;
  }
  /**
   * No auto response will happen after a resize on Windows in case the resize is a result of
   * reprinting the screen.
   */
  handleResize() {
    if (isWindows) {
      this._paused = true;
    }
  }
  handleInput() {
    this._paused = false;
  }
}
export {
  TerminalAutoResponder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHRlcm1pbmFsQ29udHJpYlxcYXV0b1JlcGxpZXNcXHRlcm1pbmFsQXV0b1Jlc3BvbmRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGlsZFByb2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGVybWluYWwuanMnO1xuXG4vKipcbiAqIFRyYWNrcyBhIHRlcm1pbmFsIHByb2Nlc3MncyBkYXRhIHN0cmVhbSBhbmQgcmVzcG9uZHMgaW1tZWRpYXRlbHkgd2hlbiBhIG1hdGNoaW5nIHN0cmluZyBpc1xuICogcmVjZWl2ZWQuIFRoaXMgaXMgZG9uZSBpbiBhIGxvdyBvdmVyaGVhZCB3YXkgYW5kIGlzIGlkZWFsbHkgcnVuIG9uIHRoZSBzYW1lIHByb2Nlc3MgYXMgdGhlXG4gKiB3aGVyZSB0aGUgcHJvY2VzcyBpcyBoYW5kbGVkIHRvIG1pbmltaXplIGxhdGVuY3kuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbEF1dG9SZXNwb25kZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfcG9pbnRlciA9IDA7XG5cdHByaXZhdGUgX3BhdXNlZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBFYWNoIHJlcGx5IGlzIHRocm90dGxlZCBieSBhIHNlY29uZCB0byBhdm9pZCByZXNvdXJjZSBzdGFydmF0aW9uIGFuZCByZXNwb25kaW5nIHRvIHNjcmVlblxuXHQgKiByZXByaW50cyBvbiBXaW5vZHdzLlxuXHQgKi9cblx0cHJpdmF0ZSBfdGhyb3R0bGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvYzogSVRlcm1pbmFsQ2hpbGRQcm9jZXNzLFxuXHRcdG1hdGNoV29yZDogc3RyaW5nLFxuXHRcdHJlc3BvbnNlOiBzdHJpbmcsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb2Mub25Qcm9jZXNzRGF0YShlID0+IHtcblx0XHRcdGlmICh0aGlzLl9wYXVzZWQgfHwgdGhpcy5fdGhyb3R0bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRhdGEgPSBpc1N0cmluZyhlKSA/IGUgOiBlLmRhdGE7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGRhdGFbaV0gPT09IG1hdGNoV29yZFt0aGlzLl9wb2ludGVyXSkge1xuXHRcdFx0XHRcdHRoaXMuX3BvaW50ZXIrKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yZXNldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEF1dG8gcmVwbHkgYW5kIHJlc2V0XG5cdFx0XHRcdGlmICh0aGlzLl9wb2ludGVyID09PSBtYXRjaFdvcmQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS5kZWJ1ZyhgQXV0byByZXBseSBtYXRjaDogXCIke21hdGNoV29yZH1cIiwgcmVzcG9uc2U6IFwiJHtyZXNwb25zZX1cImApO1xuXHRcdFx0XHRcdHByb2MuaW5wdXQocmVzcG9uc2UpO1xuXHRcdFx0XHRcdHRoaXMuX3Rocm90dGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGltZW91dCgxMDAwKS50aGVuKCgpID0+IHRoaXMuX3Rocm90dGxlZCA9IGZhbHNlKTtcblx0XHRcdFx0XHR0aGlzLl9yZXNldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXQoKSB7XG5cdFx0dGhpcy5fcG9pbnRlciA9IDA7XG5cdH1cblxuXHQvKipcblx0ICogTm8gYXV0byByZXNwb25zZSB3aWxsIGhhcHBlbiBhZnRlciBhIHJlc2l6ZSBvbiBXaW5kb3dzIGluIGNhc2UgdGhlIHJlc2l6ZSBpcyBhIHJlc3VsdCBvZlxuXHQgKiByZXByaW50aW5nIHRoZSBzY3JlZW4uXG5cdCAqL1xuXHRoYW5kbGVSZXNpemUoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0dGhpcy5fcGF1c2VkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRoYW5kbGVJbnB1dCgpIHtcblx0XHR0aGlzLl9wYXVzZWQgPSBmYWxzZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBU25CLE1BQU0sOEJBQThCLFdBQVc7QUFBQSxFQVVyRCxZQUNDLE1BQ0EsV0FDQSxVQUNBLFlBQ0M7QUFDRCxVQUFNO0FBZlAsU0FBUSxXQUFXO0FBQ25CLFNBQVEsVUFBVTtBQU1sQjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsYUFBYTtBQVVwQixTQUFLLFVBQVUsS0FBSyxjQUFjLE9BQUs7QUFDdEMsVUFBSSxLQUFLLFdBQVcsS0FBSyxZQUFZO0FBQ3BDO0FBQUEsTUFDRDtBQUNBLFlBQU0sT0FBTyxTQUFTLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFDakMsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQyxZQUFJLEtBQUssQ0FBQyxNQUFNLFVBQVUsS0FBSyxRQUFRLEdBQUc7QUFDekMsZUFBSztBQUFBLFFBQ04sT0FBTztBQUNOLGVBQUssT0FBTztBQUFBLFFBQ2I7QUFFQSxZQUFJLEtBQUssYUFBYSxVQUFVLFFBQVE7QUFDdkMscUJBQVcsTUFBTSxzQkFBc0IsU0FBUyxpQkFBaUIsUUFBUSxHQUFHO0FBQzVFLGVBQUssTUFBTSxRQUFRO0FBQ25CLGVBQUssYUFBYTtBQUNsQixrQkFBUSxHQUFJLEVBQUUsS0FBSyxNQUFNLEtBQUssYUFBYSxLQUFLO0FBQ2hELGVBQUssT0FBTztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxTQUFTO0FBQ2hCLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGVBQWU7QUFDZCxRQUFJLFdBQVc7QUFDZCxXQUFLLFVBQVU7QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGNBQWM7QUFDYixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
