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
import { DeferredPromise } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../log/common/log.js";
let ClaudePromptQueue = class extends Disposable {
  constructor(_sessionId, _getAbortSignal, _onSteeringYielded, _logService) {
    super();
    this._sessionId = _sessionId;
    this._getAbortSignal = _getAbortSignal;
    this._onSteeringYielded = _onSteeringYielded;
    this._logService = _logService;
    this._toYield = [];
    this._yielded = [];
    /**
     * Entries that have been popped by {@link settleHead} during the
     * current turn but whose deferreds haven't been completed yet — we
     * batch-complete them when the turn fully drains so an intermediate
     * `result` (steering preempt; CONTEXT.md M10) does NOT settle the
     * original `sendMessage`'s deferred.
     */
    this._popped = [];
    this._pendingPromptDeferred = new DeferredPromise();
    this.iterable = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          while (true) {
            if (this._getAbortSignal().aborted) {
              return { done: true, value: void 0 };
            }
            if (this._toYield.length > 0) {
              const entry = this._toYield.shift();
              this._yielded.push(entry);
              this._logService.info(`[Claude:${this._sessionId}] queue yielded sdkUuid=${entry.sdkUuid} turnId=${entry.turnId}${entry.steeringPendingId ? ` steeringPendingId=${entry.steeringPendingId}` : ""}`);
              if (entry.steeringPendingId) {
                this._onSteeringYielded(entry.steeringPendingId);
              }
              return { done: false, value: entry.sdkMessage };
            }
            await this._pendingPromptDeferred.p;
            this._pendingPromptDeferred = new DeferredPromise();
          }
        }
      })
    };
  }
  /** True iff no entries are queued or in-flight. */
  get isEmpty() {
    return this._toYield.length === 0 && this._yielded.length === 0;
  }
  /**
   * Push an entry. Resolves with the entry's deferred (which the
   * consumer settles on `result` via {@link settleHead}).
   */
  push(entry) {
    this._toYield.push(entry);
    this._pendingPromptDeferred.complete();
    return entry.deferred.p;
  }
  /**
   * Most-recent in-flight or queued entry, used by steering to inherit
   * its parent's `turnId`. Prefers the in-flight head over the latest
   * queued entry (matches CONTEXT.md M10: steering folds into the
   * in-progress protocol Turn).
   */
  peekParent() {
    return this._yielded[0] ?? this._toYield[this._toYield.length - 1];
  }
  /**
   * Pop the head of the yielded list. If the queue is now fully
   * drained (no more pending or in-flight entries), batch-complete
   * every popped-but-deferred deferred from this turn including the
   * one we just popped. Otherwise hold the popped entry's deferred
   * until the turn ends — the M10 invariant for steering preempt.
   * Called by the consumer on every `result` message.
   */
  settleHead() {
    const completed = this._yielded.shift();
    if (!completed) {
      return void 0;
    }
    if (this.isEmpty) {
      completed.deferred.complete();
      for (const e of this._popped) {
        if (!e.deferred.isSettled) {
          e.deferred.complete();
        }
      }
      this._popped = [];
    } else {
      this._popped.push(completed);
    }
    return completed;
  }
  /** Reject every pending deferred with `err` and clear all lists. */
  failAll(err) {
    const rejectAll = (list) => {
      for (const entry of list) {
        if (!entry.deferred.isSettled) {
          entry.deferred.error(err);
        }
      }
    };
    rejectAll(this._toYield);
    rejectAll(this._yielded);
    rejectAll(this._popped);
    this._toYield = [];
    this._yielded = [];
    this._popped = [];
  }
  /** Wake any parked `next()` — call after the controller is aborted so the iterable returns `done`. */
  notifyAborted() {
    this._pendingPromptDeferred.complete();
  }
  /** Re-create the parked deferred for a fresh Query binding. */
  resetForRebind() {
    this._pendingPromptDeferred = new DeferredPromise();
  }
};
ClaudePromptQueue = __decorateClass([
  __decorateParam(3, ILogService)
], ClaudePromptQueue);
export {
  ClaudePromptQueue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZVByb21wdFF1ZXVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBTREtVc2VyTWVzc2FnZSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcblxuLyoqXG4gKiBPbmUge0BsaW5rIFNES1VzZXJNZXNzYWdlfSB0aGUgcXVldWUgaGFzIGhhbmRlZCB0byAob3IgaXMgYWJvdXQgdG9cbiAqIGhhbmQgdG8pIHRoZSBTREsuIExpZmVjeWNsZTpcbiAqICAgMS4gQ3JlYXRlZCBieSB0aGUgY2FsbGVyIGFuZCBwdXNoZWQgdmlhIHtAbGluayBDbGF1ZGVQcm9tcHRRdWV1ZS5wdXNofS5cbiAqICAgMi4gU2hpZnRlZCBvZmYgdGhlIHRvLXlpZWxkIGxpc3QgYW5kIHB1c2hlZCB0byB0aGUgeWllbGRlZCBsaXN0IHdoZW5cbiAqICAgICAgdGhlIHByb21wdCBpdGVyYWJsZSBoYW5kcyBpdCB0byB0aGUgU0RLLlxuICogICAzLiBTaGlmdGVkIG9mZiB0aGUgeWllbGRlZCBsaXN0IGFuZCB7QGxpbmsgZGVmZXJyZWR9IHNldHRsZWQgd2hlblxuICogICAgICB0aGUgbWF0Y2hpbmcgU0RLIGByZXN1bHRgIG1lc3NhZ2UgYXJyaXZlcyAodmlhXG4gKiAgICAgIHtAbGluayBDbGF1ZGVQcm9tcHRRdWV1ZS5zZXR0bGVIZWFkfSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBlbmRpbmdTZGtNZXNzYWdlIHtcblx0cmVhZG9ubHkgc2RrTWVzc2FnZTogU0RLVXNlck1lc3NhZ2U7XG5cdHJlYWRvbmx5IHNka1V1aWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dDtcblx0cmVhZG9ubHkgc3RvcFdhdGNoOiBTdG9wV2F0Y2g7XG5cdHJlYWRvbmx5IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD47XG5cdHJlYWRvbmx5IHN0ZWVyaW5nUGVuZGluZ0lkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIE93bnMgdGhlIHByb21wdCBxdWV1ZSArIHRoZSBhc3luYyBpdGVyYWJsZSBoYW5kZWQgdG9cbiAqIGBXYXJtUXVlcnkucXVlcnkoKWAuIEtub3dzIG5vdGhpbmcgYWJvdXQgdGhlIFNESyBRdWVyeSBsaWZlY3ljbGUsXG4gKiBjb25maWcgcHVzaCwgb3IgbWVzc2FnZSBkaXNwYXRjaCBcdTIwMTQgdGhvc2UgbGl2ZSBvbiB0aGUgcGlwZWxpbmUuXG4gKlxuICogSW52YXJpYW50czpcbiAqICAgXHUyMDIyIFB1c2hpbmcgd2FrZXMgdGhlIGl0ZXJhYmxlJ3MgcGFya2VkIGBuZXh0KClgLlxuICogICBcdTIwMjIgVGhlIGl0ZXJhYmxlIHJldHVybnMgYGRvbmVgIHdoZW4gdGhlIHN1cHBsaWVkIGBnZXRBYm9ydFNpZ25hbCgpYFxuICogICAgIGlzIGFib3J0ZWQ7IHBpcGVsaW5lIGNhbGxzIHtAbGluayBub3RpZnlBYm9ydGVkfSBhZnRlciBmbGlwcGluZ1xuICogICAgIHRoZSBjb250cm9sbGVyIHNvIHRoZSBwYXJrZWQgYG5leHQoKWAgcmV0dXJucyBpbW1lZGlhdGVseS5cbiAqICAgXHUyMDIyIHtAbGluayBzZXR0bGVIZWFkfSBwb3BzIHRoZSBoZWFkIG9mIHRoZSB5aWVsZGVkIGxpc3QgKGNhbGxlZCBieVxuICogICAgIHRoZSBjb25zdW1lciBsb29wIG9uIGV2ZXJ5IGByZXN1bHRgIG1lc3NhZ2UpLlxuICogICBcdTIwMjIge0BsaW5rIGZhaWxBbGx9IHJlamVjdHMgZXZlcnkgcGVuZGluZyBkZWZlcnJlZCBhbmQgY2xlYXJzIGJvdGhcbiAqICAgICBsaXN0czsgdXNlZCBieSBhYm9ydCBhbmQgY3Jhc2ggZmFuLW91dC5cbiAqICAgXHUyMDIyIHtAbGluayByZXNldEZvclJlYmluZH0gcmUtY3JlYXRlcyB0aGUgcGFya2VkIGRlZmVycmVkIGZvciBhIGZyZXNoXG4gKiAgICAgUXVlcnkgYmluZGluZyAodGhlIHF1ZXVlIGl0c2VsZiBzdXJ2aXZlcyBhY3Jvc3MgcmViaW5kcykuXG4gKi9cbmV4cG9ydCBjbGFzcyBDbGF1ZGVQcm9tcHRRdWV1ZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3RvWWllbGQ6IElQZW5kaW5nU2RrTWVzc2FnZVtdID0gW107XG5cdHByaXZhdGUgX3lpZWxkZWQ6IElQZW5kaW5nU2RrTWVzc2FnZVtdID0gW107XG5cdC8qKlxuXHQgKiBFbnRyaWVzIHRoYXQgaGF2ZSBiZWVuIHBvcHBlZCBieSB7QGxpbmsgc2V0dGxlSGVhZH0gZHVyaW5nIHRoZVxuXHQgKiBjdXJyZW50IHR1cm4gYnV0IHdob3NlIGRlZmVycmVkcyBoYXZlbid0IGJlZW4gY29tcGxldGVkIHlldCBcdTIwMTQgd2Vcblx0ICogYmF0Y2gtY29tcGxldGUgdGhlbSB3aGVuIHRoZSB0dXJuIGZ1bGx5IGRyYWlucyBzbyBhbiBpbnRlcm1lZGlhdGVcblx0ICogYHJlc3VsdGAgKHN0ZWVyaW5nIHByZWVtcHQ7IENPTlRFWFQubWQgTTEwKSBkb2VzIE5PVCBzZXR0bGUgdGhlXG5cdCAqIG9yaWdpbmFsIGBzZW5kTWVzc2FnZWAncyBkZWZlcnJlZC5cblx0ICovXG5cdHByaXZhdGUgX3BvcHBlZDogSVBlbmRpbmdTZGtNZXNzYWdlW10gPSBbXTtcblx0cHJpdmF0ZSBfcGVuZGluZ1Byb21wdERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdHJlYWRvbmx5IGl0ZXJhYmxlOiBBc3luY0l0ZXJhYmxlPFNES1VzZXJNZXNzYWdlPiA9IHtcblx0XHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdOiAoKSA9PiAoe1xuXHRcdFx0bmV4dDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9nZXRBYm9ydFNpZ25hbCgpLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3RvWWllbGQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl90b1lpZWxkLnNoaWZ0KCkhO1xuXHRcdFx0XHRcdFx0dGhpcy5feWllbGRlZC5wdXNoKGVudHJ5KTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3RoaXMuX3Nlc3Npb25JZH1dIHF1ZXVlIHlpZWxkZWQgc2RrVXVpZD0ke2VudHJ5LnNka1V1aWR9IHR1cm5JZD0ke2VudHJ5LnR1cm5JZH0ke2VudHJ5LnN0ZWVyaW5nUGVuZGluZ0lkID8gYCBzdGVlcmluZ1BlbmRpbmdJZD0ke2VudHJ5LnN0ZWVyaW5nUGVuZGluZ0lkfWAgOiAnJ31gKTtcblx0XHRcdFx0XHRcdGlmIChlbnRyeS5zdGVlcmluZ1BlbmRpbmdJZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vblN0ZWVyaW5nWWllbGRlZChlbnRyeS5zdGVlcmluZ1BlbmRpbmdJZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBkb25lOiBmYWxzZSwgdmFsdWU6IGVudHJ5LnNka01lc3NhZ2UgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcGVuZGluZ1Byb21wdERlZmVycmVkLnA7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb21wdERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pLFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEFib3J0U2lnbmFsOiAoKSA9PiBBYm9ydFNpZ25hbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vblN0ZWVyaW5nWWllbGRlZDogKHBlbmRpbmdJZDogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKiBUcnVlIGlmZiBubyBlbnRyaWVzIGFyZSBxdWV1ZWQgb3IgaW4tZmxpZ2h0LiAqL1xuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9ZaWVsZC5sZW5ndGggPT09IDAgJiYgdGhpcy5feWllbGRlZC5sZW5ndGggPT09IDA7XG5cdH1cblx0LyoqXG5cdCAqIFB1c2ggYW4gZW50cnkuIFJlc29sdmVzIHdpdGggdGhlIGVudHJ5J3MgZGVmZXJyZWQgKHdoaWNoIHRoZVxuXHQgKiBjb25zdW1lciBzZXR0bGVzIG9uIGByZXN1bHRgIHZpYSB7QGxpbmsgc2V0dGxlSGVhZH0pLlxuXHQgKi9cblx0cHVzaChlbnRyeTogSVBlbmRpbmdTZGtNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdG9ZaWVsZC5wdXNoKGVudHJ5KTtcblx0XHR0aGlzLl9wZW5kaW5nUHJvbXB0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRyZXR1cm4gZW50cnkuZGVmZXJyZWQucDtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3N0LXJlY2VudCBpbi1mbGlnaHQgb3IgcXVldWVkIGVudHJ5LCB1c2VkIGJ5IHN0ZWVyaW5nIHRvIGluaGVyaXRcblx0ICogaXRzIHBhcmVudCdzIGB0dXJuSWRgLiBQcmVmZXJzIHRoZSBpbi1mbGlnaHQgaGVhZCBvdmVyIHRoZSBsYXRlc3Rcblx0ICogcXVldWVkIGVudHJ5IChtYXRjaGVzIENPTlRFWFQubWQgTTEwOiBzdGVlcmluZyBmb2xkcyBpbnRvIHRoZVxuXHQgKiBpbi1wcm9ncmVzcyBwcm90b2NvbCBUdXJuKS5cblx0ICovXG5cdHBlZWtQYXJlbnQoKTogSVBlbmRpbmdTZGtNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5feWllbGRlZFswXSA/PyB0aGlzLl90b1lpZWxkW3RoaXMuX3RvWWllbGQubGVuZ3RoIC0gMV07XG5cdH1cblxuXHQvKipcblx0ICogUG9wIHRoZSBoZWFkIG9mIHRoZSB5aWVsZGVkIGxpc3QuIElmIHRoZSBxdWV1ZSBpcyBub3cgZnVsbHlcblx0ICogZHJhaW5lZCAobm8gbW9yZSBwZW5kaW5nIG9yIGluLWZsaWdodCBlbnRyaWVzKSwgYmF0Y2gtY29tcGxldGVcblx0ICogZXZlcnkgcG9wcGVkLWJ1dC1kZWZlcnJlZCBkZWZlcnJlZCBmcm9tIHRoaXMgdHVybiBpbmNsdWRpbmcgdGhlXG5cdCAqIG9uZSB3ZSBqdXN0IHBvcHBlZC4gT3RoZXJ3aXNlIGhvbGQgdGhlIHBvcHBlZCBlbnRyeSdzIGRlZmVycmVkXG5cdCAqIHVudGlsIHRoZSB0dXJuIGVuZHMgXHUyMDE0IHRoZSBNMTAgaW52YXJpYW50IGZvciBzdGVlcmluZyBwcmVlbXB0LlxuXHQgKiBDYWxsZWQgYnkgdGhlIGNvbnN1bWVyIG9uIGV2ZXJ5IGByZXN1bHRgIG1lc3NhZ2UuXG5cdCAqL1xuXHRzZXR0bGVIZWFkKCk6IElQZW5kaW5nU2RrTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gdGhpcy5feWllbGRlZC5zaGlmdCgpO1xuXHRcdGlmICghY29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc0VtcHR5KSB7XG5cdFx0XHRjb21wbGV0ZWQuZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLl9wb3BwZWQpIHtcblx0XHRcdFx0aWYgKCFlLmRlZmVycmVkLmlzU2V0dGxlZCkge1xuXHRcdFx0XHRcdGUuZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcG9wcGVkID0gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BvcHBlZC5wdXNoKGNvbXBsZXRlZCk7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wbGV0ZWQ7XG5cdH1cblxuXHQvKiogUmVqZWN0IGV2ZXJ5IHBlbmRpbmcgZGVmZXJyZWQgd2l0aCBgZXJyYCBhbmQgY2xlYXIgYWxsIGxpc3RzLiAqL1xuXHRmYWlsQWxsKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHRjb25zdCByZWplY3RBbGwgPSAobGlzdDogSVBlbmRpbmdTZGtNZXNzYWdlW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbGlzdCkge1xuXHRcdFx0XHRpZiAoIWVudHJ5LmRlZmVycmVkLmlzU2V0dGxlZCkge1xuXHRcdFx0XHRcdGVudHJ5LmRlZmVycmVkLmVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdHJlamVjdEFsbCh0aGlzLl90b1lpZWxkKTtcblx0XHRyZWplY3RBbGwodGhpcy5feWllbGRlZCk7XG5cdFx0cmVqZWN0QWxsKHRoaXMuX3BvcHBlZCk7XG5cdFx0dGhpcy5fdG9ZaWVsZCA9IFtdO1xuXHRcdHRoaXMuX3lpZWxkZWQgPSBbXTtcblx0XHR0aGlzLl9wb3BwZWQgPSBbXTtcblx0fVxuXG5cdC8qKiBXYWtlIGFueSBwYXJrZWQgYG5leHQoKWAgXHUyMDE0IGNhbGwgYWZ0ZXIgdGhlIGNvbnRyb2xsZXIgaXMgYWJvcnRlZCBzbyB0aGUgaXRlcmFibGUgcmV0dXJucyBgZG9uZWAuICovXG5cdG5vdGlmeUFib3J0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Byb21wdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdH1cblxuXHQvKiogUmUtY3JlYXRlIHRoZSBwYXJrZWQgZGVmZXJyZWQgZm9yIGEgZnJlc2ggUXVlcnkgYmluZGluZy4gKi9cblx0cmVzZXRGb3JSZWJpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Byb21wdERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsbUJBQW1CO0FBd0NyQixJQUFNLG9CQUFOLGNBQWdDLFdBQVc7QUFBQSxFQXFDakQsWUFDa0IsWUFDQSxpQkFDQSxvQkFDYSxhQUM3QjtBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUFDYTtBQXZDL0IsU0FBUSxXQUFpQyxDQUFDO0FBQzFDLFNBQVEsV0FBaUMsQ0FBQztBQVExQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsVUFBZ0MsQ0FBQztBQUN6QyxTQUFRLHlCQUF5QixJQUFJLGdCQUFzQjtBQUUzRCxTQUFTLFdBQTBDO0FBQUEsTUFDbEQsQ0FBQyxPQUFPLGFBQWEsR0FBRyxPQUFPO0FBQUEsUUFDOUIsTUFBTSxZQUFZO0FBQ2pCLGlCQUFPLE1BQU07QUFDWixnQkFBSSxLQUFLLGdCQUFnQixFQUFFLFNBQVM7QUFDbkMscUJBQU8sRUFBRSxNQUFNLE1BQU0sT0FBTyxPQUFVO0FBQUEsWUFDdkM7QUFDQSxnQkFBSSxLQUFLLFNBQVMsU0FBUyxHQUFHO0FBQzdCLG9CQUFNLFFBQVEsS0FBSyxTQUFTLE1BQU07QUFDbEMsbUJBQUssU0FBUyxLQUFLLEtBQUs7QUFDeEIsbUJBQUssWUFBWSxLQUFLLFdBQVcsS0FBSyxVQUFVLDJCQUEyQixNQUFNLE9BQU8sV0FBVyxNQUFNLE1BQU0sR0FBRyxNQUFNLG9CQUFvQixzQkFBc0IsTUFBTSxpQkFBaUIsS0FBSyxFQUFFLEVBQUU7QUFDbE0sa0JBQUksTUFBTSxtQkFBbUI7QUFDNUIscUJBQUssbUJBQW1CLE1BQU0saUJBQWlCO0FBQUEsY0FDaEQ7QUFDQSxxQkFBTyxFQUFFLE1BQU0sT0FBTyxPQUFPLE1BQU0sV0FBVztBQUFBLFlBQy9DO0FBQ0Esa0JBQU0sS0FBSyx1QkFBdUI7QUFDbEMsaUJBQUsseUJBQXlCLElBQUksZ0JBQXNCO0FBQUEsVUFDekQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQVNBO0FBQUE7QUFBQSxFQUdBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLLFNBQVMsV0FBVyxLQUFLLEtBQUssU0FBUyxXQUFXO0FBQUEsRUFDL0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsS0FBSyxPQUEwQztBQUM5QyxTQUFLLFNBQVMsS0FBSyxLQUFLO0FBQ3hCLFNBQUssdUJBQXVCLFNBQVM7QUFDckMsV0FBTyxNQUFNLFNBQVM7QUFBQSxFQUN2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsYUFBNkM7QUFDNUMsV0FBTyxLQUFLLFNBQVMsQ0FBQyxLQUFLLEtBQUssU0FBUyxLQUFLLFNBQVMsU0FBUyxDQUFDO0FBQUEsRUFDbEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSxhQUE2QztBQUM1QyxVQUFNLFlBQVksS0FBSyxTQUFTLE1BQU07QUFDdEMsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxTQUFTO0FBQ2pCLGdCQUFVLFNBQVMsU0FBUztBQUM1QixpQkFBVyxLQUFLLEtBQUssU0FBUztBQUM3QixZQUFJLENBQUMsRUFBRSxTQUFTLFdBQVc7QUFDMUIsWUFBRSxTQUFTLFNBQVM7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFVBQVUsQ0FBQztBQUFBLElBQ2pCLE9BQU87QUFDTixXQUFLLFFBQVEsS0FBSyxTQUFTO0FBQUEsSUFDNUI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFHQSxRQUFRLEtBQWtCO0FBQ3pCLFVBQU0sWUFBWSxDQUFDLFNBQStCO0FBQ2pELGlCQUFXLFNBQVMsTUFBTTtBQUN6QixZQUFJLENBQUMsTUFBTSxTQUFTLFdBQVc7QUFDOUIsZ0JBQU0sU0FBUyxNQUFNLEdBQUc7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsY0FBVSxLQUFLLFFBQVE7QUFDdkIsY0FBVSxLQUFLLFFBQVE7QUFDdkIsY0FBVSxLQUFLLE9BQU87QUFDdEIsU0FBSyxXQUFXLENBQUM7QUFDakIsU0FBSyxXQUFXLENBQUM7QUFDakIsU0FBSyxVQUFVLENBQUM7QUFBQSxFQUNqQjtBQUFBO0FBQUEsRUFHQSxnQkFBc0I7QUFDckIsU0FBSyx1QkFBdUIsU0FBUztBQUFBLEVBQ3RDO0FBQUE7QUFBQSxFQUdBLGlCQUF1QjtBQUN0QixTQUFLLHlCQUF5QixJQUFJLGdCQUFzQjtBQUFBLEVBQ3pEO0FBQ0Q7QUEzSGEsb0JBQU47QUFBQSxFQXlDSjtBQUFBLEdBekNVOyIsCiAgIm5hbWVzIjogW10KfQo=
