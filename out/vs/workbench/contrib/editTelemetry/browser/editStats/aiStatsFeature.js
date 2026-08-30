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
import { sumBy } from "../../../../../base/common/arrays.js";
import { TaskQueue, timeout } from "../../../../../base/common/async.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, mapObservableArrayCached, observableValue, runOnChange } from "../../../../../base/common/observable.js";
import { AnnotatedStringEdit } from "../../../../../editor/common/core/edits/stringEdit.js";
import { isAiEdit, isUserEdit } from "../../../../../editor/common/textModelEditSource.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { AiStatsStatusBar } from "./aiStatsStatusBar.js";
let AiStatsFeature = class extends Disposable {
  constructor(annotatedDocuments, _storageService, _instantiationService) {
    super();
    this._storageService = _storageService;
    this._instantiationService = _instantiationService;
    this._dataVersion = observableValue(this, 0);
    this.aiRate = this._dataVersion.map(() => {
      const val = this._data.getValue();
      if (!val) {
        return 0;
      }
      const r = average(val.sessions, (session) => {
        const sum = session.typedCharacters + session.aiCharacters;
        if (sum === 0) {
          return 0;
        }
        return session.aiCharacters / sum;
      });
      return r;
    });
    this.sessionCount = derived(this, (r) => {
      this._dataVersion.read(r);
      const val = this._data.getValue();
      if (!val) {
        return 0;
      }
      return val.sessions.length;
    });
    this.sessions = derived(this, (r) => {
      this._dataVersion.read(r);
      const val = this._data.getValue();
      if (!val) {
        return [];
      }
      return val.sessions;
    });
    this.acceptedInlineSuggestionsToday = derived(this, (r) => {
      this._dataVersion.read(r);
      const val = this._data.getValue();
      if (!val) {
        return 0;
      }
      const startOfToday = /* @__PURE__ */ new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sessionsToday = val.sessions.filter((s) => s.startTime > startOfToday.getTime());
      return sumBy(sessionsToday, (s) => s.acceptedInlineSuggestions ?? 0);
    });
    const storedValue = getStoredValue(this._storageService, "aiStats", StorageScope.WORKSPACE, StorageTarget.USER);
    this._data = rateLimitWrite(storedValue, 1 / 60, this._store);
    this.aiRate.recomputeInitiallyAndOnChange(this._store);
    this._register(autorun((reader) => {
      reader.store.add(this._instantiationService.createInstance(AiStatsStatusBar.hot.read(reader), this));
    }));
    const lastRequestIds = [];
    const obs = mapObservableArrayCached(this, annotatedDocuments.documents, (doc, store) => {
      store.add(runOnChange(doc.documentWithAnnotations.value, (_val, _prev, edit) => {
        const e = AnnotatedStringEdit.compose(edit.map((e2) => e2.edit));
        const curSession = new Lazy(() => this._getDataAndSession());
        for (const r of e.replacements) {
          if (isAiEdit(r.data.editSource)) {
            curSession.value.currentSession.aiCharacters += r.newText.length;
          } else if (isUserEdit(r.data.editSource)) {
            curSession.value.currentSession.typedCharacters += r.newText.length;
          }
        }
        if (e.replacements.length > 0) {
          const sessionToUpdate = curSession.value.currentSession;
          const s = e.replacements[0].data.editSource;
          if (s.metadata.source === "inlineCompletionAccept") {
            if (sessionToUpdate.acceptedInlineSuggestions === void 0) {
              sessionToUpdate.acceptedInlineSuggestions = 0;
            }
            sessionToUpdate.acceptedInlineSuggestions += 1;
          }
          if (s.metadata.source === "Chat.applyEdits" && s.metadata.$$requestId !== void 0) {
            const didSeeRequestId = lastRequestIds.includes(s.metadata.$$requestId);
            if (!didSeeRequestId) {
              lastRequestIds.push(s.metadata.$$requestId);
              if (lastRequestIds.length > 10) {
                lastRequestIds.shift();
              }
              if (sessionToUpdate.chatEditCount === void 0) {
                sessionToUpdate.chatEditCount = 0;
              }
              sessionToUpdate.chatEditCount += 1;
            }
          }
        }
        if (curSession.hasValue) {
          this._data.writeValue(curSession.value.data);
          this._dataVersion.set(this._dataVersion.get() + 1, void 0);
        }
      }));
    });
    obs.recomputeInitiallyAndOnChange(this._store);
  }
  _getDataAndSession() {
    const state = this._data.getValue() ?? { sessions: [] };
    const sessionLengthMs = 5 * 60 * 1e3;
    let lastSession = state.sessions.at(-1);
    const nowTime = Date.now();
    if (!lastSession || nowTime - lastSession.startTime > sessionLengthMs) {
      state.sessions.push({
        startTime: nowTime,
        typedCharacters: 0,
        aiCharacters: 0,
        acceptedInlineSuggestions: 0,
        chatEditCount: 0
      });
      lastSession = state.sessions.at(-1);
      const dayMs = 24 * 60 * 60 * 1e3;
      while (state.sessions.length > dayMs / sessionLengthMs) {
        state.sessions.shift();
      }
    }
    return { data: state, currentSession: lastSession };
  }
};
AiStatsFeature = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IInstantiationService)
], AiStatsFeature);
function average(arr, selector) {
  if (arr.length === 0) {
    return 0;
  }
  const s = sumBy(arr, selector);
  return s / arr.length;
}
function rateLimitWrite(targetValue, maxWritesPerSecond, store) {
  const queue = new TaskQueue();
  let _value = void 0;
  let valueVersion = 0;
  let savedVersion = 0;
  store.add(toDisposable(() => {
    if (valueVersion !== savedVersion) {
      targetValue.writeValue(_value);
      savedVersion = valueVersion;
    }
  }));
  return {
    writeValue(value) {
      valueVersion++;
      const v = valueVersion;
      _value = value;
      queue.clearPending();
      queue.schedule(async () => {
        targetValue.writeValue(value);
        savedVersion = v;
        await timeout(5e3);
      });
    },
    getValue() {
      if (valueVersion > 0) {
        return _value;
      }
      return targetValue.getValue();
    }
  };
}
function getStoredValue(service, key, scope, target) {
  let lastValue = void 0;
  let hasLastValue = false;
  return {
    writeValue(value) {
      if (value === void 0) {
        service.remove(key, scope);
      } else {
        service.store(key, JSON.stringify(value), scope, target);
      }
      lastValue = value;
    },
    getValue() {
      if (hasLastValue) {
        return lastValue;
      }
      const strVal = service.get(key, scope);
      lastValue = strVal === void 0 ? void 0 : JSON.parse(strVal);
      hasLastValue = true;
      return lastValue;
    }
  };
}
export {
  AiStatsFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXGVkaXRTdGF0c1xcYWlTdGF0c0ZlYXR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdW1CeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBUYXNrUXVldWUsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVWYWx1ZSwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEFubm90YXRlZFN0cmluZ0VkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBpc0FpRWRpdCwgaXNVc2VyRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBbm5vdGF0ZWREb2N1bWVudHMgfSBmcm9tICcuLi9oZWxwZXJzL2Fubm90YXRlZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBBaVN0YXRzU3RhdHVzQmFyIH0gZnJvbSAnLi9haVN0YXRzU3RhdHVzQmFyLmpzJztcblxuZXhwb3J0IGNsYXNzIEFpU3RhdHNGZWF0dXJlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IElWYWx1ZTxJRGF0YT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFWZXJzaW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFubm90YXRlZERvY3VtZW50czogQW5ub3RhdGVkRG9jdW1lbnRzLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzdG9yZWRWYWx1ZSA9IGdldFN0b3JlZFZhbHVlPElEYXRhPih0aGlzLl9zdG9yYWdlU2VydmljZSwgJ2FpU3RhdHMnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdHRoaXMuX2RhdGEgPSByYXRlTGltaXRXcml0ZTxJRGF0YT4oc3RvcmVkVmFsdWUsIDEgLyA2MCwgdGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5haVJhdGUucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBaVN0YXRzU3RhdHVzQmFyLmhvdC5yZWFkKHJlYWRlciksIHRoaXMpKTtcblx0XHR9KSk7XG5cblxuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0SWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgb2JzID0gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkKHRoaXMsIGFubm90YXRlZERvY3VtZW50cy5kb2N1bWVudHMsIChkb2MsIHN0b3JlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocnVuT25DaGFuZ2UoZG9jLmRvY3VtZW50V2l0aEFubm90YXRpb25zLnZhbHVlLCAoX3ZhbCwgX3ByZXYsIGVkaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgZSA9IEFubm90YXRlZFN0cmluZ0VkaXQuY29tcG9zZShlZGl0Lm1hcChlID0+IGUuZWRpdCkpO1xuXG5cdFx0XHRcdGNvbnN0IGN1clNlc3Npb24gPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9nZXREYXRhQW5kU2Vzc2lvbigpKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgZS5yZXBsYWNlbWVudHMpIHtcblx0XHRcdFx0XHRpZiAoaXNBaUVkaXQoci5kYXRhLmVkaXRTb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRjdXJTZXNzaW9uLnZhbHVlLmN1cnJlbnRTZXNzaW9uLmFpQ2hhcmFjdGVycyArPSByLm5ld1RleHQubGVuZ3RoO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNVc2VyRWRpdChyLmRhdGEuZWRpdFNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdGN1clNlc3Npb24udmFsdWUuY3VycmVudFNlc3Npb24udHlwZWRDaGFyYWN0ZXJzICs9IHIubmV3VGV4dC5sZW5ndGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUucmVwbGFjZW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVG9VcGRhdGUgPSBjdXJTZXNzaW9uLnZhbHVlLmN1cnJlbnRTZXNzaW9uO1xuXHRcdFx0XHRcdGNvbnN0IHMgPSBlLnJlcGxhY2VtZW50c1swXS5kYXRhLmVkaXRTb3VyY2U7XG5cdFx0XHRcdFx0aWYgKHMubWV0YWRhdGEuc291cmNlID09PSAnaW5saW5lQ29tcGxldGlvbkFjY2VwdCcpIHtcblx0XHRcdFx0XHRcdGlmIChzZXNzaW9uVG9VcGRhdGUuYWNjZXB0ZWRJbmxpbmVTdWdnZXN0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25Ub1VwZGF0ZS5hY2NlcHRlZElubGluZVN1Z2dlc3Rpb25zID0gMDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHNlc3Npb25Ub1VwZGF0ZS5hY2NlcHRlZElubGluZVN1Z2dlc3Rpb25zICs9IDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHMubWV0YWRhdGEuc291cmNlID09PSAnQ2hhdC5hcHBseUVkaXRzJyAmJiBzLm1ldGFkYXRhLiQkcmVxdWVzdElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpZFNlZVJlcXVlc3RJZCA9IGxhc3RSZXF1ZXN0SWRzLmluY2x1ZGVzKHMubWV0YWRhdGEuJCRyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0aWYgKCFkaWRTZWVSZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRcdFx0bGFzdFJlcXVlc3RJZHMucHVzaChzLm1ldGFkYXRhLiQkcmVxdWVzdElkKTtcblx0XHRcdFx0XHRcdFx0aWYgKGxhc3RSZXF1ZXN0SWRzLmxlbmd0aCA+IDEwKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFzdFJlcXVlc3RJZHMuc2hpZnQoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblRvVXBkYXRlLmNoYXRFZGl0Q291bnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25Ub1VwZGF0ZS5jaGF0RWRpdENvdW50ID0gMDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uVG9VcGRhdGUuY2hhdEVkaXRDb3VudCArPSAxO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJTZXNzaW9uLmhhc1ZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGF0YS53cml0ZVZhbHVlKGN1clNlc3Npb24udmFsdWUuZGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5fZGF0YVZlcnNpb24uc2V0KHRoaXMuX2RhdGFWZXJzaW9uLmdldCgpICsgMSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0b2JzLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBhaVJhdGUgPSB0aGlzLl9kYXRhVmVyc2lvbi5tYXAoKCkgPT4ge1xuXHRcdGNvbnN0IHZhbCA9IHRoaXMuX2RhdGEuZ2V0VmFsdWUoKTtcblx0XHRpZiAoIXZhbCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgciA9IGF2ZXJhZ2UodmFsLnNlc3Npb25zLCBzZXNzaW9uID0+IHtcblx0XHRcdGNvbnN0IHN1bSA9IHNlc3Npb24udHlwZWRDaGFyYWN0ZXJzICsgc2Vzc2lvbi5haUNoYXJhY3RlcnM7XG5cdFx0XHRpZiAoc3VtID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlc3Npb24uYWlDaGFyYWN0ZXJzIC8gc3VtO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHI7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzZXNzaW9uQ291bnQgPSBkZXJpdmVkKHRoaXMsIHIgPT4ge1xuXHRcdHRoaXMuX2RhdGFWZXJzaW9uLnJlYWQocik7XG5cdFx0Y29uc3QgdmFsID0gdGhpcy5fZGF0YS5nZXRWYWx1ZSgpO1xuXHRcdGlmICghdmFsKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbC5zZXNzaW9ucy5sZW5ndGg7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzZXNzaW9ucyA9IGRlcml2ZWQodGhpcywgciA9PiB7XG5cdFx0dGhpcy5fZGF0YVZlcnNpb24ucmVhZChyKTtcblx0XHRjb25zdCB2YWwgPSB0aGlzLl9kYXRhLmdldFZhbHVlKCk7XG5cdFx0aWYgKCF2YWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbC5zZXNzaW9ucztcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGFjY2VwdGVkSW5saW5lU3VnZ2VzdGlvbnNUb2RheSA9IGRlcml2ZWQodGhpcywgciA9PiB7XG5cdFx0dGhpcy5fZGF0YVZlcnNpb24ucmVhZChyKTtcblx0XHRjb25zdCB2YWwgPSB0aGlzLl9kYXRhLmdldFZhbHVlKCk7XG5cdFx0aWYgKCF2YWwpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZSgpO1xuXHRcdHN0YXJ0T2ZUb2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zVG9kYXkgPSB2YWwuc2Vzc2lvbnMuZmlsdGVyKHMgPT4gcy5zdGFydFRpbWUgPiBzdGFydE9mVG9kYXkuZ2V0VGltZSgpKTtcblx0XHRyZXR1cm4gc3VtQnkoc2Vzc2lvbnNUb2RheSwgcyA9PiBzLmFjY2VwdGVkSW5saW5lU3VnZ2VzdGlvbnMgPz8gMCk7XG5cdH0pO1xuXG5cdHByaXZhdGUgX2dldERhdGFBbmRTZXNzaW9uKCk6IHsgZGF0YTogSURhdGE7IGN1cnJlbnRTZXNzaW9uOiBJU2Vzc2lvbiB9IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2RhdGEuZ2V0VmFsdWUoKSA/PyB7IHNlc3Npb25zOiBbXSB9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkxlbmd0aE1zID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXG5cblx0XHRsZXQgbGFzdFNlc3Npb24gPSBzdGF0ZS5zZXNzaW9ucy5hdCgtMSk7XG5cdFx0Y29uc3Qgbm93VGltZSA9IERhdGUubm93KCk7XG5cdFx0aWYgKCFsYXN0U2Vzc2lvbiB8fCBub3dUaW1lIC0gbGFzdFNlc3Npb24uc3RhcnRUaW1lID4gc2Vzc2lvbkxlbmd0aE1zKSB7XG5cdFx0XHRzdGF0ZS5zZXNzaW9ucy5wdXNoKHtcblx0XHRcdFx0c3RhcnRUaW1lOiBub3dUaW1lLFxuXHRcdFx0XHR0eXBlZENoYXJhY3RlcnM6IDAsXG5cdFx0XHRcdGFpQ2hhcmFjdGVyczogMCxcblx0XHRcdFx0YWNjZXB0ZWRJbmxpbmVTdWdnZXN0aW9uczogMCxcblx0XHRcdFx0Y2hhdEVkaXRDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdFx0bGFzdFNlc3Npb24gPSBzdGF0ZS5zZXNzaW9ucy5hdCgtMSkhO1xuXG5cdFx0XHRjb25zdCBkYXlNcyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0aFxuXHRcdFx0Ly8gQ2xlYW4gdXAgb2xkIHNlc3Npb25zLCBrZWVwIG9ubHkgdGhlIGxhc3QgMjRoIHdvcnRoIG9mIHNlc3Npb25zXG5cdFx0XHR3aGlsZSAoc3RhdGUuc2Vzc2lvbnMubGVuZ3RoID4gZGF5TXMgLyBzZXNzaW9uTGVuZ3RoTXMpIHtcblx0XHRcdFx0c3RhdGUuc2Vzc2lvbnMuc2hpZnQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZGF0YTogc3RhdGUsIGN1cnJlbnRTZXNzaW9uOiBsYXN0U2Vzc2lvbiB9O1xuXHR9XG59XG5cbmludGVyZmFjZSBJRGF0YSB7XG5cdHNlc3Npb25zOiBJU2Vzc2lvbltdO1xufVxuXG4vLyA1IG1pbiB3aW5kb3dcbmludGVyZmFjZSBJU2Vzc2lvbiB7XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHR0eXBlZENoYXJhY3RlcnM6IG51bWJlcjtcblx0YWlDaGFyYWN0ZXJzOiBudW1iZXI7XG5cdGFjY2VwdGVkSW5saW5lU3VnZ2VzdGlvbnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y2hhdEVkaXRDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5cbmZ1bmN0aW9uIGF2ZXJhZ2U8VD4oYXJyOiBUW10sIHNlbGVjdG9yOiAoaXRlbTogVCkgPT4gbnVtYmVyKTogbnVtYmVyIHtcblx0aWYgKGFyci5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHRjb25zdCBzID0gc3VtQnkoYXJyLCBzZWxlY3Rvcik7XG5cdHJldHVybiBzIC8gYXJyLmxlbmd0aDtcbn1cblxuXG5pbnRlcmZhY2UgSVZhbHVlPFQ+IHtcblx0d3JpdGVWYWx1ZSh2YWx1ZTogVCB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdGdldFZhbHVlKCk6IFQgfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJhdGVMaW1pdFdyaXRlPFQ+KHRhcmdldFZhbHVlOiBJVmFsdWU8VD4sIG1heFdyaXRlc1BlclNlY29uZDogbnVtYmVyLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSVZhbHVlPFQ+IHtcblx0Y29uc3QgcXVldWUgPSBuZXcgVGFza1F1ZXVlKCk7XG5cdGxldCBfdmFsdWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCB2YWx1ZVZlcnNpb24gPSAwO1xuXHRsZXQgc2F2ZWRWZXJzaW9uID0gMDtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0aWYgKHZhbHVlVmVyc2lvbiAhPT0gc2F2ZWRWZXJzaW9uKSB7XG5cdFx0XHR0YXJnZXRWYWx1ZS53cml0ZVZhbHVlKF92YWx1ZSk7XG5cdFx0XHRzYXZlZFZlcnNpb24gPSB2YWx1ZVZlcnNpb247XG5cdFx0fVxuXHR9KSk7XG5cblx0cmV0dXJuIHtcblx0XHR3cml0ZVZhbHVlKHZhbHVlOiBUIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHR2YWx1ZVZlcnNpb24rKztcblx0XHRcdGNvbnN0IHYgPSB2YWx1ZVZlcnNpb247XG5cdFx0XHRfdmFsdWUgPSB2YWx1ZTtcblxuXHRcdFx0cXVldWUuY2xlYXJQZW5kaW5nKCk7XG5cdFx0XHRxdWV1ZS5zY2hlZHVsZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRhcmdldFZhbHVlLndyaXRlVmFsdWUodmFsdWUpO1xuXHRcdFx0XHRzYXZlZFZlcnNpb24gPSB2O1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUwMDApO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRnZXRWYWx1ZSgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICh2YWx1ZVZlcnNpb24gPiAwKSB7XG5cdFx0XHRcdHJldHVybiBfdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFyZ2V0VmFsdWUuZ2V0VmFsdWUoKTtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JlZFZhbHVlPFQ+KHNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwga2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCk6IElWYWx1ZTxUPiB7XG5cdGxldCBsYXN0VmFsdWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBoYXNMYXN0VmFsdWUgPSBmYWxzZTtcblx0cmV0dXJuIHtcblx0XHR3cml0ZVZhbHVlKHZhbHVlOiBUIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzZXJ2aWNlLnJlbW92ZShrZXksIHNjb3BlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlcnZpY2Uuc3RvcmUoa2V5LCBKU09OLnN0cmluZ2lmeSh2YWx1ZSksIHNjb3BlLCB0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFZhbHVlID0gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXRWYWx1ZSgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmIChoYXNMYXN0VmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0clZhbCA9IHNlcnZpY2UuZ2V0KGtleSwgc2NvcGUpO1xuXHRcdFx0bGFzdFZhbHVlID0gc3RyVmFsID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBKU09OLnBhcnNlKHN0clZhbCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0XHRcdGhhc0xhc3RWYWx1ZSA9IHRydWU7XG5cdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdH1cblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVyxlQUFlO0FBQ25DLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQTZCLG9CQUFvQjtBQUMxRCxTQUFTLFNBQVMsU0FBUywwQkFBMEIsaUJBQWlCLG1CQUFtQjtBQUN6RixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFVBQVUsa0JBQWtCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBRTdELFNBQVMsd0JBQXdCO0FBRTFCLElBQU0saUJBQU4sY0FBNkIsV0FBVztBQUFBLEVBSTlDLFlBQ0Msb0JBQ2tDLGlCQUNNLHVCQUN2QztBQUNELFVBQU07QUFINEI7QUFDTTtBQUx6QyxTQUFpQixlQUFlLGdCQUFnQixNQUFNLENBQUM7QUFzRXZELFNBQWdCLFNBQVMsS0FBSyxhQUFhLElBQUksTUFBTTtBQUNwRCxZQUFNLE1BQU0sS0FBSyxNQUFNLFNBQVM7QUFDaEMsVUFBSSxDQUFDLEtBQUs7QUFDVCxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sSUFBSSxRQUFRLElBQUksVUFBVSxhQUFXO0FBQzFDLGNBQU0sTUFBTSxRQUFRLGtCQUFrQixRQUFRO0FBQzlDLFlBQUksUUFBUSxHQUFHO0FBQ2QsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTyxRQUFRLGVBQWU7QUFBQSxNQUMvQixDQUFDO0FBRUQsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFNBQWdCLGVBQWUsUUFBUSxNQUFNLE9BQUs7QUFDakQsV0FBSyxhQUFhLEtBQUssQ0FBQztBQUN4QixZQUFNLE1BQU0sS0FBSyxNQUFNLFNBQVM7QUFDaEMsVUFBSSxDQUFDLEtBQUs7QUFDVCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8sSUFBSSxTQUFTO0FBQUEsSUFDckIsQ0FBQztBQUVELFNBQWdCLFdBQVcsUUFBUSxNQUFNLE9BQUs7QUFDN0MsV0FBSyxhQUFhLEtBQUssQ0FBQztBQUN4QixZQUFNLE1BQU0sS0FBSyxNQUFNLFNBQVM7QUFDaEMsVUFBSSxDQUFDLEtBQUs7QUFDVCxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsYUFBTyxJQUFJO0FBQUEsSUFDWixDQUFDO0FBRUQsU0FBZ0IsaUNBQWlDLFFBQVEsTUFBTSxPQUFLO0FBQ25FLFdBQUssYUFBYSxLQUFLLENBQUM7QUFDeEIsWUFBTSxNQUFNLEtBQUssTUFBTSxTQUFTO0FBQ2hDLFVBQUksQ0FBQyxLQUFLO0FBQ1QsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLGVBQWUsb0JBQUksS0FBSztBQUM5QixtQkFBYSxTQUFTLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFFaEMsWUFBTSxnQkFBZ0IsSUFBSSxTQUFTLE9BQU8sT0FBSyxFQUFFLFlBQVksYUFBYSxRQUFRLENBQUM7QUFDbkYsYUFBTyxNQUFNLGVBQWUsT0FBSyxFQUFFLDZCQUE2QixDQUFDO0FBQUEsSUFDbEUsQ0FBQztBQTNHQSxVQUFNLGNBQWMsZUFBc0IsS0FBSyxpQkFBaUIsV0FBVyxhQUFhLFdBQVcsY0FBYyxJQUFJO0FBQ3JILFNBQUssUUFBUSxlQUFzQixhQUFhLElBQUksSUFBSSxLQUFLLE1BQU07QUFFbkUsU0FBSyxPQUFPLDhCQUE4QixLQUFLLE1BQU07QUFFckQsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxhQUFPLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixlQUFlLGlCQUFpQixJQUFJLEtBQUssTUFBTSxHQUFHLElBQUksQ0FBQztBQUFBLElBQ3BHLENBQUMsQ0FBQztBQUdGLFVBQU0saUJBQTJCLENBQUM7QUFFbEMsVUFBTSxNQUFNLHlCQUF5QixNQUFNLG1CQUFtQixXQUFXLENBQUMsS0FBSyxVQUFVO0FBQ3hGLFlBQU0sSUFBSSxZQUFZLElBQUksd0JBQXdCLE9BQU8sQ0FBQyxNQUFNLE9BQU8sU0FBUztBQUMvRSxjQUFNLElBQUksb0JBQW9CLFFBQVEsS0FBSyxJQUFJLENBQUFBLE9BQUtBLEdBQUUsSUFBSSxDQUFDO0FBRTNELGNBQU0sYUFBYSxJQUFJLEtBQUssTUFBTSxLQUFLLG1CQUFtQixDQUFDO0FBRTNELG1CQUFXLEtBQUssRUFBRSxjQUFjO0FBQy9CLGNBQUksU0FBUyxFQUFFLEtBQUssVUFBVSxHQUFHO0FBQ2hDLHVCQUFXLE1BQU0sZUFBZSxnQkFBZ0IsRUFBRSxRQUFRO0FBQUEsVUFDM0QsV0FBVyxXQUFXLEVBQUUsS0FBSyxVQUFVLEdBQUc7QUFDekMsdUJBQVcsTUFBTSxlQUFlLG1CQUFtQixFQUFFLFFBQVE7QUFBQSxVQUM5RDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEVBQUUsYUFBYSxTQUFTLEdBQUc7QUFDOUIsZ0JBQU0sa0JBQWtCLFdBQVcsTUFBTTtBQUN6QyxnQkFBTSxJQUFJLEVBQUUsYUFBYSxDQUFDLEVBQUUsS0FBSztBQUNqQyxjQUFJLEVBQUUsU0FBUyxXQUFXLDBCQUEwQjtBQUNuRCxnQkFBSSxnQkFBZ0IsOEJBQThCLFFBQVc7QUFDNUQsOEJBQWdCLDRCQUE0QjtBQUFBLFlBQzdDO0FBQ0EsNEJBQWdCLDZCQUE2QjtBQUFBLFVBQzlDO0FBRUEsY0FBSSxFQUFFLFNBQVMsV0FBVyxxQkFBcUIsRUFBRSxTQUFTLGdCQUFnQixRQUFXO0FBQ3BGLGtCQUFNLGtCQUFrQixlQUFlLFNBQVMsRUFBRSxTQUFTLFdBQVc7QUFDdEUsZ0JBQUksQ0FBQyxpQkFBaUI7QUFDckIsNkJBQWUsS0FBSyxFQUFFLFNBQVMsV0FBVztBQUMxQyxrQkFBSSxlQUFlLFNBQVMsSUFBSTtBQUMvQiwrQkFBZSxNQUFNO0FBQUEsY0FDdEI7QUFDQSxrQkFBSSxnQkFBZ0Isa0JBQWtCLFFBQVc7QUFDaEQsZ0NBQWdCLGdCQUFnQjtBQUFBLGNBQ2pDO0FBQ0EsOEJBQWdCLGlCQUFpQjtBQUFBLFlBQ2xDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLFdBQVcsVUFBVTtBQUN4QixlQUFLLE1BQU0sV0FBVyxXQUFXLE1BQU0sSUFBSTtBQUMzQyxlQUFLLGFBQWEsSUFBSSxLQUFLLGFBQWEsSUFBSSxJQUFJLEdBQUcsTUFBUztBQUFBLFFBQzdEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFFRCxRQUFJLDhCQUE4QixLQUFLLE1BQU07QUFBQSxFQUM5QztBQUFBLEVBa0RRLHFCQUFnRTtBQUN2RSxVQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxFQUFFO0FBRXRELFVBQU0sa0JBQWtCLElBQUksS0FBSztBQUVqQyxRQUFJLGNBQWMsTUFBTSxTQUFTLEdBQUcsRUFBRTtBQUN0QyxVQUFNLFVBQVUsS0FBSyxJQUFJO0FBQ3pCLFFBQUksQ0FBQyxlQUFlLFVBQVUsWUFBWSxZQUFZLGlCQUFpQjtBQUN0RSxZQUFNLFNBQVMsS0FBSztBQUFBLFFBQ25CLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFFBQ2pCLGNBQWM7QUFBQSxRQUNkLDJCQUEyQjtBQUFBLFFBQzNCLGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQ0Qsb0JBQWMsTUFBTSxTQUFTLEdBQUcsRUFBRTtBQUVsQyxZQUFNLFFBQVEsS0FBSyxLQUFLLEtBQUs7QUFFN0IsYUFBTyxNQUFNLFNBQVMsU0FBUyxRQUFRLGlCQUFpQjtBQUN2RCxjQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxNQUFNLE9BQU8sZ0JBQWdCLFlBQVk7QUFBQSxFQUNuRDtBQUNEO0FBakphLGlCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVO0FBaUtiLFNBQVMsUUFBVyxLQUFVLFVBQXVDO0FBQ3BFLE1BQUksSUFBSSxXQUFXLEdBQUc7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLElBQUksTUFBTSxLQUFLLFFBQVE7QUFDN0IsU0FBTyxJQUFJLElBQUk7QUFDaEI7QUFRQSxTQUFTLGVBQWtCLGFBQXdCLG9CQUE0QixPQUFtQztBQUNqSCxRQUFNLFFBQVEsSUFBSSxVQUFVO0FBQzVCLE1BQUksU0FBd0I7QUFDNUIsTUFBSSxlQUFlO0FBQ25CLE1BQUksZUFBZTtBQUNuQixRQUFNLElBQUksYUFBYSxNQUFNO0FBQzVCLFFBQUksaUJBQWlCLGNBQWM7QUFDbEMsa0JBQVksV0FBVyxNQUFNO0FBQzdCLHFCQUFlO0FBQUEsSUFDaEI7QUFBQSxFQUNELENBQUMsQ0FBQztBQUVGLFNBQU87QUFBQSxJQUNOLFdBQVcsT0FBNEI7QUFDdEM7QUFDQSxZQUFNLElBQUk7QUFDVixlQUFTO0FBRVQsWUFBTSxhQUFhO0FBQ25CLFlBQU0sU0FBUyxZQUFZO0FBQzFCLG9CQUFZLFdBQVcsS0FBSztBQUM1Qix1QkFBZTtBQUNmLGNBQU0sUUFBUSxHQUFJO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLFdBQTBCO0FBQ3pCLFVBQUksZUFBZSxHQUFHO0FBQ3JCLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxZQUFZLFNBQVM7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsZUFBa0IsU0FBMEIsS0FBYSxPQUFxQixRQUFrQztBQUN4SCxNQUFJLFlBQTJCO0FBQy9CLE1BQUksZUFBZTtBQUNuQixTQUFPO0FBQUEsSUFDTixXQUFXLE9BQTRCO0FBQ3RDLFVBQUksVUFBVSxRQUFXO0FBQ3hCLGdCQUFRLE9BQU8sS0FBSyxLQUFLO0FBQUEsTUFDMUIsT0FBTztBQUNOLGdCQUFRLE1BQU0sS0FBSyxLQUFLLFVBQVUsS0FBSyxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3hEO0FBQ0Esa0JBQVk7QUFBQSxJQUNiO0FBQUEsSUFDQSxXQUEwQjtBQUN6QixVQUFJLGNBQWM7QUFDakIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFNBQVMsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNyQyxrQkFBWSxXQUFXLFNBQVksU0FBWSxLQUFLLE1BQU0sTUFBTTtBQUNoRSxxQkFBZTtBQUNmLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJlIl0KfQo=
