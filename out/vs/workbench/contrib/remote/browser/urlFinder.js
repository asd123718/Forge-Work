import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { RunOnceWorker } from "../../../../base/common/async.js";
const _UrlFinder = class _UrlFinder extends Disposable {
  constructor(terminalService, debugService) {
    super();
    this._onDidMatchLocalUrl = this._register(new Emitter());
    this.onDidMatchLocalUrl = this._onDidMatchLocalUrl.event;
    this.listeners = /* @__PURE__ */ new Map();
    this.terminalDataWorkers = this._register(new DisposableMap());
    this.replPositions = /* @__PURE__ */ new Map();
    terminalService.instances.forEach((instance) => {
      this.registerTerminalInstance(instance);
    });
    this._register(terminalService.onDidCreateInstance((instance) => {
      this.registerTerminalInstance(instance);
    }));
    this._register(terminalService.onDidDisposeInstance((instance) => {
      this.listeners.get(instance)?.dispose();
      this.listeners.delete(instance);
      this.terminalDataWorkers.deleteAndDispose(instance);
    }));
    this._register(debugService.onDidNewSession((session) => {
      if (!session.parentSession || session.parentSession && session.hasSeparateRepl()) {
        this.listeners.set(session.getId(), session.onDidChangeReplElements(() => {
          this.processNewReplElements(session);
        }));
      }
    }));
    this._register(debugService.onDidEndSession(({ session }) => {
      if (this.listeners.has(session.getId())) {
        this.listeners.get(session.getId())?.dispose();
        this.listeners.delete(session.getId());
      }
    }));
  }
  registerTerminalInstance(instance) {
    if (!_UrlFinder.excludeTerminals.includes(instance.title)) {
      this.listeners.set(instance, instance.onData((data) => {
        this.getOrCreateWorker(instance).work(data);
      }));
    }
  }
  getOrCreateWorker(instance) {
    let worker = this.terminalDataWorkers.get(instance);
    if (!worker) {
      worker = new RunOnceWorker((chunks) => this.processTerminalData(chunks), _UrlFinder.dataDebounceTimeout);
      this.terminalDataWorkers.set(instance, worker);
    }
    return worker;
  }
  processTerminalData(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (totalLength > _UrlFinder.maxDataLength) {
      return;
    }
    this.processData(chunks.join(""));
  }
  processNewReplElements(session) {
    const oldReplPosition = this.replPositions.get(session.getId());
    const replElements = session.getReplElements();
    this.replPositions.set(session.getId(), { position: replElements.length - 1, tail: replElements[replElements.length - 1] });
    if (!oldReplPosition && replElements.length > 0) {
      replElements.forEach((element) => this.processData(element.toString()));
    } else if (oldReplPosition && replElements.length - 1 !== oldReplPosition.position) {
      for (let i = replElements.length - 1; i >= 0; i--) {
        const element = replElements[i];
        if (element === oldReplPosition.tail) {
          break;
        } else {
          this.processData(element.toString());
        }
      }
    }
  }
  dispose() {
    super.dispose();
    for (const listener of this.listeners.values()) {
      listener.dispose();
    }
  }
  processData(data) {
    data = removeAnsiEscapeCodes(data);
    const urlMatches = data.match(_UrlFinder.localUrlRegex) || [];
    if (urlMatches && urlMatches.length > 0) {
      urlMatches.forEach((match) => {
        let serverUrl;
        try {
          serverUrl = new URL(match);
        } catch (e) {
        }
        if (serverUrl) {
          const portMatch = match.match(_UrlFinder.extractPortRegex);
          const port = parseFloat(serverUrl.port ? serverUrl.port : portMatch ? portMatch[2] : "NaN");
          if (!isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
            let host = serverUrl.hostname;
            if (host !== "0.0.0.0" && host !== "127.0.0.1") {
              host = "localhost";
            }
            if (port !== 9229 && data.startsWith("Debugger listening on")) {
              return;
            }
            this._onDidMatchLocalUrl.fire({ port, host });
          }
        }
      });
    } else {
      const pythonMatch = data.match(_UrlFinder.localPythonServerRegex);
      if (pythonMatch && pythonMatch.length === 3) {
        this._onDidMatchLocalUrl.fire({ host: pythonMatch[1], port: Number(pythonMatch[2]) });
      }
    }
  }
};
/**
 * Debounce time in ms before processing accumulated terminal data.
 */
_UrlFinder.dataDebounceTimeout = 500;
/**
 * Maximum amount of data to accumulate before skipping URL detection.
 * When data exceeds this threshold, it indicates high-throughput scenarios
 * (like games or animations) where URL detection is unlikely to find useful results.
 */
_UrlFinder.maxDataLength = 1e4;
/**
 * Local server url pattern matching following urls:
 * http://localhost:3000/ - commonly used across multiple frameworks
 * https://127.0.0.1:5001/ - ASP.NET
 * http://:8080 - Beego Golang
 * http://0.0.0.0:4000 - Elixir Phoenix
 */
_UrlFinder.localUrlRegex = /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim;
_UrlFinder.extractPortRegex = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/;
/**
 * https://github.com/microsoft/vscode-remote-release/issues/3949
 */
_UrlFinder.localPythonServerRegex = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/;
_UrlFinder.excludeTerminals = ["Dev Containers"];
let UrlFinder = _UrlFinder;
export {
  UrlFinder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxcdXJsRmluZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQgfSBmcm9tICcuLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlV29ya2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgVXJsRmluZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBEZWJvdW5jZSB0aW1lIGluIG1zIGJlZm9yZSBwcm9jZXNzaW5nIGFjY3VtdWxhdGVkIHRlcm1pbmFsIGRhdGEuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBkYXRhRGVib3VuY2VUaW1lb3V0ID0gNTAwO1xuXG5cdC8qKlxuXHQgKiBNYXhpbXVtIGFtb3VudCBvZiBkYXRhIHRvIGFjY3VtdWxhdGUgYmVmb3JlIHNraXBwaW5nIFVSTCBkZXRlY3Rpb24uXG5cdCAqIFdoZW4gZGF0YSBleGNlZWRzIHRoaXMgdGhyZXNob2xkLCBpdCBpbmRpY2F0ZXMgaGlnaC10aHJvdWdocHV0IHNjZW5hcmlvc1xuXHQgKiAobGlrZSBnYW1lcyBvciBhbmltYXRpb25zKSB3aGVyZSBVUkwgZGV0ZWN0aW9uIGlzIHVubGlrZWx5IHRvIGZpbmQgdXNlZnVsIHJlc3VsdHMuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBtYXhEYXRhTGVuZ3RoID0gMTAwMDA7XG5cdC8qKlxuXHQgKiBMb2NhbCBzZXJ2ZXIgdXJsIHBhdHRlcm4gbWF0Y2hpbmcgZm9sbG93aW5nIHVybHM6XG5cdCAqIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8gLSBjb21tb25seSB1c2VkIGFjcm9zcyBtdWx0aXBsZSBmcmFtZXdvcmtzXG5cdCAqIGh0dHBzOi8vMTI3LjAuMC4xOjUwMDEvIC0gQVNQLk5FVFxuXHQgKiBodHRwOi8vOjgwODAgLSBCZWVnbyBHb2xhbmdcblx0ICogaHR0cDovLzAuMC4wLjA6NDAwMCAtIEVsaXhpciBQaG9lbml4XG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBsb2NhbFVybFJlZ2V4ID0gL1xcYlxcd3swLDIwfSg/OjpcXC9cXC8pPyg/OmxvY2FsaG9zdHwxMjdcXC4wXFwuMFxcLjF8MFxcLjBcXC4wXFwuMHw6XFxkezIsNX0pW1xcd1xcLVxcLlxcfjpcXC9cXD9cXCNbXFxdXFxAIVxcJCZcXChcXClcXCpcXCtcXCxcXDtcXD1dKi9naW07XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGV4dHJhY3RQb3J0UmVnZXggPSAvKGxvY2FsaG9zdHwxMjdcXC4wXFwuMFxcLjF8MFxcLjBcXC4wXFwuMCk6KFxcZHsxLDV9KS87XG5cdC8qKlxuXHQgKiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS1yZW1vdGUtcmVsZWFzZS9pc3N1ZXMvMzk0OVxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgbG9jYWxQeXRob25TZXJ2ZXJSZWdleCA9IC9IVFRQXFxzb25cXHMoMTI3XFwuMFxcLjBcXC4xfDBcXC4wXFwuMFxcLjApXFxzcG9ydFxccyhcXGQrKS87XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZXhjbHVkZVRlcm1pbmFscyA9IFsnRGV2IENvbnRhaW5lcnMnXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1hdGNoTG9jYWxVcmwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1hdGNoTG9jYWxVcmwgPSB0aGlzLl9vbkRpZE1hdGNoTG9jYWxVcmwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGlzdGVuZXJzOiBNYXA8SVRlcm1pbmFsSW5zdGFuY2UgfCBzdHJpbmcsIElEaXNwb3NhYmxlPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbERhdGFXb3JrZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SVRlcm1pbmFsSW5zdGFuY2UsIFJ1bk9uY2VXb3JrZXI8c3RyaW5nPj4oKSk7XG5cblx0Y29uc3RydWN0b3IodGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLCBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIFRlcm1pbmFsXG5cdFx0dGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5mb3JFYWNoKGluc3RhbmNlID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlKGluc3RhbmNlKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXJtaW5hbFNlcnZpY2Uub25EaWRDcmVhdGVJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLmxpc3RlbmVycy5nZXQoaW5zdGFuY2UpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmxpc3RlbmVycy5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy50ZXJtaW5hbERhdGFXb3JrZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaW5zdGFuY2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERlYnVnXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGVidWdTZXJ2aWNlLm9uRGlkTmV3U2Vzc2lvbihzZXNzaW9uID0+IHtcblx0XHRcdGlmICghc2Vzc2lvbi5wYXJlbnRTZXNzaW9uIHx8IChzZXNzaW9uLnBhcmVudFNlc3Npb24gJiYgc2Vzc2lvbi5oYXNTZXBhcmF0ZVJlcGwoKSkpIHtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuc2V0KHNlc3Npb24uZ2V0SWQoKSwgc2Vzc2lvbi5vbkRpZENoYW5nZVJlcGxFbGVtZW50cygoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wcm9jZXNzTmV3UmVwbEVsZW1lbnRzKHNlc3Npb24pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oKHsgc2Vzc2lvbiB9KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5saXN0ZW5lcnMuaGFzKHNlc3Npb24uZ2V0SWQoKSkpIHtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuZ2V0KHNlc3Npb24uZ2V0SWQoKSk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5saXN0ZW5lcnMuZGVsZXRlKHNlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclRlcm1pbmFsSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0aWYgKCFVcmxGaW5kZXIuZXhjbHVkZVRlcm1pbmFscy5pbmNsdWRlcyhpbnN0YW5jZS50aXRsZSkpIHtcblx0XHRcdHRoaXMubGlzdGVuZXJzLnNldChpbnN0YW5jZSwgaW5zdGFuY2Uub25EYXRhKGRhdGEgPT4ge1xuXHRcdFx0XHR0aGlzLmdldE9yQ3JlYXRlV29ya2VyKGluc3RhbmNlKS53b3JrKGRhdGEpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0T3JDcmVhdGVXb3JrZXIoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogUnVuT25jZVdvcmtlcjxzdHJpbmc+IHtcblx0XHRsZXQgd29ya2VyID0gdGhpcy50ZXJtaW5hbERhdGFXb3JrZXJzLmdldChpbnN0YW5jZSk7XG5cdFx0aWYgKCF3b3JrZXIpIHtcblx0XHRcdHdvcmtlciA9IG5ldyBSdW5PbmNlV29ya2VyPHN0cmluZz4oY2h1bmtzID0+IHRoaXMucHJvY2Vzc1Rlcm1pbmFsRGF0YShjaHVua3MpLCBVcmxGaW5kZXIuZGF0YURlYm91bmNlVGltZW91dCk7XG5cdFx0XHR0aGlzLnRlcm1pbmFsRGF0YVdvcmtlcnMuc2V0KGluc3RhbmNlLCB3b3JrZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya2VyO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9jZXNzVGVybWluYWxEYXRhKGNodW5rczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHQvLyBTa2lwIHByb2Nlc3NpbmcgaWYgZGF0YSBleGNlZWRzIHRocmVzaG9sZCAoaGlnaC10aHJvdWdocHV0IHNjZW5hcmlvIGxpa2UgZ2FtZXMpXG5cdFx0Y29uc3QgdG90YWxMZW5ndGggPSBjaHVua3MucmVkdWNlKChzdW0sIGNodW5rKSA9PiBzdW0gKyBjaHVuay5sZW5ndGgsIDApO1xuXHRcdGlmICh0b3RhbExlbmd0aCA+IFVybEZpbmRlci5tYXhEYXRhTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucHJvY2Vzc0RhdGEoY2h1bmtzLmpvaW4oJycpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVwbFBvc2l0aW9uczogTWFwPHN0cmluZywgeyBwb3NpdGlvbjogbnVtYmVyOyB0YWlsOiBJUmVwbEVsZW1lbnQgfT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcHJvY2Vzc05ld1JlcGxFbGVtZW50cyhzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSB7XG5cdFx0Y29uc3Qgb2xkUmVwbFBvc2l0aW9uID0gdGhpcy5yZXBsUG9zaXRpb25zLmdldChzZXNzaW9uLmdldElkKCkpO1xuXHRcdGNvbnN0IHJlcGxFbGVtZW50cyA9IHNlc3Npb24uZ2V0UmVwbEVsZW1lbnRzKCk7XG5cdFx0dGhpcy5yZXBsUG9zaXRpb25zLnNldChzZXNzaW9uLmdldElkKCksIHsgcG9zaXRpb246IHJlcGxFbGVtZW50cy5sZW5ndGggLSAxLCB0YWlsOiByZXBsRWxlbWVudHNbcmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdIH0pO1xuXG5cdFx0aWYgKCFvbGRSZXBsUG9zaXRpb24gJiYgcmVwbEVsZW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlcGxFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4gdGhpcy5wcm9jZXNzRGF0YShlbGVtZW50LnRvU3RyaW5nKCkpKTtcblx0XHR9IGVsc2UgaWYgKG9sZFJlcGxQb3NpdGlvbiAmJiAocmVwbEVsZW1lbnRzLmxlbmd0aCAtIDEgIT09IG9sZFJlcGxQb3NpdGlvbi5wb3NpdGlvbikpIHtcblx0XHRcdC8vIFByb2Nlc3MgbGluZXMgdW50aWwgd2UgcmVhY2ggdGhlIG9sZCBcInRhaWxcIlxuXHRcdFx0Zm9yIChsZXQgaSA9IHJlcGxFbGVtZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gcmVwbEVsZW1lbnRzW2ldO1xuXHRcdFx0XHRpZiAoZWxlbWVudCA9PT0gb2xkUmVwbFBvc2l0aW9uLnRhaWwpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnByb2Nlc3NEYXRhKGVsZW1lbnQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMubGlzdGVuZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcm9jZXNzRGF0YShkYXRhOiBzdHJpbmcpIHtcblx0XHQvLyBzdHJpcCBBTlNJIHRlcm1pbmFsIGNvZGVzXG5cdFx0ZGF0YSA9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhkYXRhKTtcblx0XHRjb25zdCB1cmxNYXRjaGVzID0gZGF0YS5tYXRjaChVcmxGaW5kZXIubG9jYWxVcmxSZWdleCkgfHwgW107XG5cdFx0aWYgKHVybE1hdGNoZXMgJiYgdXJsTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR1cmxNYXRjaGVzLmZvckVhY2goKG1hdGNoKSA9PiB7XG5cdFx0XHRcdC8vIGNoZWNrIGlmIHZhbGlkIHVybFxuXHRcdFx0XHRsZXQgc2VydmVyVXJsO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHNlcnZlclVybCA9IG5ldyBVUkwobWF0Y2gpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gTm90IGEgdmFsaWQgVVJMXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlcnZlclVybCkge1xuXHRcdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSBwb3J0IGlzIGEgdmFsaWQgaW50ZWdlciB2YWx1ZVxuXHRcdFx0XHRcdGNvbnN0IHBvcnRNYXRjaCA9IG1hdGNoLm1hdGNoKFVybEZpbmRlci5leHRyYWN0UG9ydFJlZ2V4KTtcblx0XHRcdFx0XHRjb25zdCBwb3J0ID0gcGFyc2VGbG9hdChzZXJ2ZXJVcmwucG9ydCA/IHNlcnZlclVybC5wb3J0IDogKHBvcnRNYXRjaCA/IHBvcnRNYXRjaFsyXSA6ICdOYU4nKSk7XG5cdFx0XHRcdFx0aWYgKCFpc05hTihwb3J0KSAmJiBOdW1iZXIuaXNJbnRlZ2VyKHBvcnQpICYmIHBvcnQgPiAwICYmIHBvcnQgPD0gNjU1MzUpIHtcblx0XHRcdFx0XHRcdC8vIG5vcm1hbGl6ZSB0aGUgaG9zdCBuYW1lXG5cdFx0XHRcdFx0XHRsZXQgaG9zdCA9IHNlcnZlclVybC5ob3N0bmFtZTtcblx0XHRcdFx0XHRcdGlmIChob3N0ICE9PSAnMC4wLjAuMCcgJiYgaG9zdCAhPT0gJzEyNy4wLjAuMScpIHtcblx0XHRcdFx0XHRcdFx0aG9zdCA9ICdsb2NhbGhvc3QnO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gRXhjbHVkZSBub2RlIGluc3BlY3QsIGV4Y2VwdCB3aGVuIHVzaW5nIGRlZmF1bHQgcG9ydFxuXHRcdFx0XHRcdFx0aWYgKHBvcnQgIT09IDkyMjkgJiYgZGF0YS5zdGFydHNXaXRoKCdEZWJ1Z2dlciBsaXN0ZW5pbmcgb24nKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZE1hdGNoTG9jYWxVcmwuZmlyZSh7IHBvcnQsIGhvc3QgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVHJ5IHNwZWNpYWwgcHl0aG9uIGNhc2Vcblx0XHRcdGNvbnN0IHB5dGhvbk1hdGNoID0gZGF0YS5tYXRjaChVcmxGaW5kZXIubG9jYWxQeXRob25TZXJ2ZXJSZWdleCk7XG5cdFx0XHRpZiAocHl0aG9uTWF0Y2ggJiYgcHl0aG9uTWF0Y2gubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkTWF0Y2hMb2NhbFVybC5maXJlKHsgaG9zdDogcHl0aG9uTWF0Y2hbMV0sIHBvcnQ6IE51bWJlcihweXRob25NYXRjaFsyXSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHFCQUFrQztBQUV2RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUV2QixNQUFNLGFBQU4sTUFBTSxtQkFBa0IsV0FBVztBQUFBLEVBaUN6QyxZQUFZLGlCQUFtQyxjQUE2QjtBQUMzRSxVQUFNO0FBTlAsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXdDLENBQUM7QUFDbkcsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFDdkQsU0FBaUIsWUFBMEQsb0JBQUksSUFBSTtBQUNuRixTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksY0FBd0QsQ0FBQztBQTJEbkgsU0FBUSxnQkFBdUUsb0JBQUksSUFBSTtBQXREdEYsb0JBQWdCLFVBQVUsUUFBUSxjQUFZO0FBQzdDLFdBQUsseUJBQXlCLFFBQVE7QUFBQSxJQUN2QyxDQUFDO0FBQ0QsU0FBSyxVQUFVLGdCQUFnQixvQkFBb0IsY0FBWTtBQUM5RCxXQUFLLHlCQUF5QixRQUFRO0FBQUEsSUFDdkMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLGdCQUFnQixxQkFBcUIsY0FBWTtBQUMvRCxXQUFLLFVBQVUsSUFBSSxRQUFRLEdBQUcsUUFBUTtBQUN0QyxXQUFLLFVBQVUsT0FBTyxRQUFRO0FBQzlCLFdBQUssb0JB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
