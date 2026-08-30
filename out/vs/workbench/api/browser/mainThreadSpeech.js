var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { raceCancellation } from "../../../base/common/async.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { ISpeechService, TextToSpeechStatus } from "../../contrib/speech/common/speechService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadSpeech = class {
  constructor(extHostContext, speechService, logService) {
    this.speechService = speechService;
    this.logService = logService;
    this.providerRegistrations = /* @__PURE__ */ new Map();
    this.speechToTextSessions = /* @__PURE__ */ new Map();
    this.textToSpeechSessions = /* @__PURE__ */ new Map();
    this.keywordRecognitionSessions = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostSpeech);
  }
  $registerProvider(handle, identifier, metadata) {
    this.logService.trace("[Speech] extension registered provider", metadata.extension.value);
    const registration = this.speechService.registerSpeechProvider(identifier, {
      metadata,
      createSpeechToTextSession: (token, options) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createSpeechToTextSession(handle, session, options?.language);
        const onDidChange = disposables.add(new Emitter());
        this.speechToTextSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelSpeechToTextSession(session);
          this.speechToTextSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event
        };
      },
      createTextToSpeechSession: (token, options) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None,
            synthesize: async () => {
            }
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createTextToSpeechSession(handle, session, options?.language);
        const onDidChange = disposables.add(new Emitter());
        this.textToSpeechSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelTextToSpeechSession(session);
          this.textToSpeechSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event,
          synthesize: async (text) => {
            await this.proxy.$synthesizeSpeech(session, text);
            const disposable = new DisposableStore();
            try {
              await raceCancellation(Event.toPromise(Event.filter(onDidChange.event, (e) => e.status === TextToSpeechStatus.Stopped, disposable), disposable), token);
            } finally {
              disposable.dispose();
            }
          }
        };
      },
      createKeywordRecognitionSession: (token) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createKeywordRecognitionSession(handle, session);
        const onDidChange = disposables.add(new Emitter());
        this.keywordRecognitionSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelKeywordRecognitionSession(session);
          this.keywordRecognitionSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event
        };
      }
    });
    this.providerRegistrations.set(handle, {
      dispose: () => {
        registration.dispose();
      }
    });
  }
  $unregisterProvider(handle) {
    const registration = this.providerRegistrations.get(handle);
    if (registration) {
      registration.dispose();
      this.providerRegistrations.delete(handle);
    }
  }
  $emitSpeechToTextEvent(session, event) {
    const providerSession = this.speechToTextSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  $emitTextToSpeechEvent(session, event) {
    const providerSession = this.textToSpeechSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  $emitKeywordRecognitionEvent(session, event) {
    const providerSession = this.keywordRecognitionSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  dispose() {
    this.providerRegistrations.forEach((disposable) => disposable.dispose());
    this.providerRegistrations.clear();
    this.speechToTextSessions.forEach((session) => session.onDidChange.dispose());
    this.speechToTextSessions.clear();
    this.textToSpeechSessions.forEach((session) => session.onDidChange.dispose());
    this.textToSpeechSessions.clear();
    this.keywordRecognitionSessions.forEach((session) => session.onDidChange.dispose());
    this.keywordRecognitionSessions.clear();
  }
};
MainThreadSpeech = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadSpeech),
  __decorateParam(1, ISpeechService),
  __decorateParam(2, ILogService)
], MainThreadSpeech);
export {
  MainThreadSpeech
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFNwZWVjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdFNwZWVjaFNoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFNwZWVjaFNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUtleXdvcmRSZWNvZ25pdGlvbkV2ZW50LCBJU3BlZWNoUHJvdmlkZXJNZXRhZGF0YSwgSVNwZWVjaFNlcnZpY2UsIElTcGVlY2hUb1RleHRFdmVudCwgSVRleHRUb1NwZWVjaEV2ZW50LCBUZXh0VG9TcGVlY2hTdGF0dXMgfSBmcm9tICcuLi8uLi9jb250cmliL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5cbnR5cGUgU3BlZWNoVG9UZXh0U2Vzc2lvbiA9IHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEVtaXR0ZXI8SVNwZWVjaFRvVGV4dEV2ZW50Pjtcbn07XG5cbnR5cGUgVGV4dFRvU3BlZWNoU2Vzc2lvbiA9IHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEVtaXR0ZXI8SVRleHRUb1NwZWVjaEV2ZW50Pjtcbn07XG5cbnR5cGUgS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbiA9IHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEVtaXR0ZXI8SUtleXdvcmRSZWNvZ25pdGlvbkV2ZW50Pjtcbn07XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkU3BlZWNoKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRTcGVlY2ggaW1wbGVtZW50cyBNYWluVGhyZWFkU3BlZWNoU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RTcGVlY2hTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyUmVnaXN0cmF0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNwZWVjaFRvVGV4dFNlc3Npb25zID0gbmV3IE1hcDxudW1iZXIsIFNwZWVjaFRvVGV4dFNlc3Npb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dFRvU3BlZWNoU2Vzc2lvbnMgPSBuZXcgTWFwPG51bWJlciwgVGV4dFRvU3BlZWNoU2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBrZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElTcGVlY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTcGVlY2gpO1xuXHR9XG5cblx0JHJlZ2lzdGVyUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGlkZW50aWZpZXI6IHN0cmluZywgbWV0YWRhdGE6IElTcGVlY2hQcm92aWRlck1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbU3BlZWNoXSBleHRlbnNpb24gcmVnaXN0ZXJlZCBwcm92aWRlcicsIG1ldGFkYXRhLmV4dGVuc2lvbi52YWx1ZSk7XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLnNwZWVjaFNlcnZpY2UucmVnaXN0ZXJTcGVlY2hQcm92aWRlcihpZGVudGlmaWVyLCB7XG5cdFx0XHRtZXRhZGF0YSxcblx0XHRcdGNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb246ICh0b2tlbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBNYXRoLnJhbmRvbSgpO1xuXG5cdFx0XHRcdHRoaXMucHJveHkuJGNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb24oaGFuZGxlLCBzZXNzaW9uLCBvcHRpb25zPy5sYW5ndWFnZSk7XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNwZWVjaFRvVGV4dEV2ZW50PigpKTtcblx0XHRcdFx0dGhpcy5zcGVlY2hUb1RleHRTZXNzaW9ucy5zZXQoc2Vzc2lvbiwgeyBvbkRpZENoYW5nZSB9KTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJveHkuJGNhbmNlbFNwZWVjaFRvVGV4dFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5zcGVlY2hUb1RleHRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbik7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnRcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVUZXh0VG9TcGVlY2hTZXNzaW9uOiAodG9rZW4sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdFx0c3ludGhlc2l6ZTogYXN5bmMgKCkgPT4geyB9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gTWF0aC5yYW5kb20oKTtcblxuXHRcdFx0XHR0aGlzLnByb3h5LiRjcmVhdGVUZXh0VG9TcGVlY2hTZXNzaW9uKGhhbmRsZSwgc2Vzc2lvbiwgb3B0aW9ucz8ubGFuZ3VhZ2UpO1xuXG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElUZXh0VG9TcGVlY2hFdmVudD4oKSk7XG5cdFx0XHRcdHRoaXMudGV4dFRvU3BlZWNoU2Vzc2lvbnMuc2V0KHNlc3Npb24sIHsgb25EaWRDaGFuZ2UgfSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnByb3h5LiRjYW5jZWxUZXh0VG9TcGVlY2hTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0XHRcdHRoaXMudGV4dFRvU3BlZWNoU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRcdHN5bnRoZXNpemU6IGFzeW5jIHRleHQgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wcm94eS4kc3ludGhlc2l6ZVNwZWVjaChzZXNzaW9uLCB0ZXh0KTtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIob25EaWRDaGFuZ2UuZXZlbnQsIGUgPT4gZS5zdGF0dXMgPT09IFRleHRUb1NwZWVjaFN0YXR1cy5TdG9wcGVkLCBkaXNwb3NhYmxlKSwgZGlzcG9zYWJsZSksIHRva2VuKTtcblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uOiB0b2tlbiA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IE1hdGgucmFuZG9tKCk7XG5cblx0XHRcdFx0dGhpcy5wcm94eS4kY3JlYXRlS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbihoYW5kbGUsIHNlc3Npb24pO1xuXG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElLZXl3b3JkUmVjb2duaXRpb25FdmVudD4oKSk7XG5cdFx0XHRcdHRoaXMua2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMuc2V0KHNlc3Npb24sIHsgb25EaWRDaGFuZ2UgfSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnByb3h5LiRjYW5jZWxLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0XHRcdHRoaXMua2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5wcm92aWRlclJlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHRoaXMucHJvdmlkZXJSZWdpc3RyYXRpb25zLmdldChoYW5kbGUpO1xuXHRcdGlmIChyZWdpc3RyYXRpb24pIHtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnByb3ZpZGVyUmVnaXN0cmF0aW9ucy5kZWxldGUoaGFuZGxlKTtcblx0XHR9XG5cdH1cblxuXHQkZW1pdFNwZWVjaFRvVGV4dEV2ZW50KHNlc3Npb246IG51bWJlciwgZXZlbnQ6IElTcGVlY2hUb1RleHRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbiA9IHRoaXMuc3BlZWNoVG9UZXh0U2Vzc2lvbnMuZ2V0KHNlc3Npb24pO1xuXHRcdHByb3ZpZGVyU2Vzc2lvbj8ub25EaWRDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHQkZW1pdFRleHRUb1NwZWVjaEV2ZW50KHNlc3Npb246IG51bWJlciwgZXZlbnQ6IElUZXh0VG9TcGVlY2hFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbiA9IHRoaXMudGV4dFRvU3BlZWNoU2Vzc2lvbnMuZ2V0KHNlc3Npb24pO1xuXHRcdHByb3ZpZGVyU2Vzc2lvbj8ub25EaWRDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHQkZW1pdEtleXdvcmRSZWNvZ25pdGlvbkV2ZW50KHNlc3Npb246IG51bWJlciwgZXZlbnQ6IElLZXl3b3JkUmVjb2duaXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbiA9IHRoaXMua2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMuZ2V0KHNlc3Npb24pO1xuXHRcdHByb3ZpZGVyU2Vzc2lvbj8ub25EaWRDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucHJvdmlkZXJSZWdpc3RyYXRpb25zLmZvckVhY2goZGlzcG9zYWJsZSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5wcm92aWRlclJlZ2lzdHJhdGlvbnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuc3BlZWNoVG9UZXh0U2Vzc2lvbnMuZm9yRWFjaChzZXNzaW9uID0+IHNlc3Npb24ub25EaWRDaGFuZ2UuZGlzcG9zZSgpKTtcblx0XHR0aGlzLnNwZWVjaFRvVGV4dFNlc3Npb25zLmNsZWFyKCk7XG5cblx0XHR0aGlzLnRleHRUb1NwZWVjaFNlc3Npb25zLmZvckVhY2goc2Vzc2lvbiA9PiBzZXNzaW9uLm9uRGlkQ2hhbmdlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy50ZXh0VG9TcGVlY2hTZXNzaW9ucy5jbGVhcigpO1xuXG5cdFx0dGhpcy5rZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucy5mb3JFYWNoKHNlc3Npb24gPT4gc2Vzc2lvbi5vbkRpZENoYW5nZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMua2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFvQyxtQkFBMEM7QUFDdkYsU0FBNEQsZ0JBQXdELDBCQUEw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
