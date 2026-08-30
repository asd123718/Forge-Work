import { Disposable } from "../../../base/common/lifecycle.js";
const priorityOrder = {
  mutationReconciliation: 0,
  mutation: 1,
  interactive: 2,
  mergeGate: 3,
  visible: 4,
  background: 5,
  enrichment: 6
};
class GitHubRequestQueue extends Disposable {
  constructor(_maximumConcurrency = 4, _maximumHostConcurrency = 2) {
    super();
    this._maximumConcurrency = _maximumConcurrency;
    this._maximumHostConcurrency = _maximumHostConcurrency;
    this._pending = [];
    this._activeAccounts = /* @__PURE__ */ new Set();
    this._activeHosts = /* @__PURE__ */ new Map();
    this._active = 0;
    this._sequence = 0;
  }
  enqueue(account, priority, signal, task) {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    const accountKey = GitHubRequestQueue.accountKey(account);
    return new Promise((resolve, reject) => {
      const request = {
        accountKey,
        host: account.host,
        priority,
        sequence: this._sequence++,
        signal,
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        },
        reject
      };
      this._pending.push(request);
      signal.addEventListener("abort", () => {
        const index = this._pending.indexOf(request);
        if (index >= 0) {
          this._pending.splice(index, 1);
          reject(signal.reason);
        }
      }, { once: true });
      this._drain();
    });
  }
  cancelAccount(account, reason) {
    const accountKey = GitHubRequestQueue.accountKey(account);
    for (let index = this._pending.length - 1; index >= 0; index--) {
      const request = this._pending[index];
      if (request.accountKey === accountKey) {
        this._pending.splice(index, 1);
        request.reject(reason ?? new Error("GitHub credential was invalidated"));
      }
    }
  }
  dispose() {
    for (const request of this._pending.splice(0)) {
      request.reject(new Error("GitHub request queue was disposed"));
    }
    super.dispose();
  }
  _drain() {
    while (this._active < this._maximumConcurrency) {
      const index = this._nextIndex();
      if (index < 0) {
        return;
      }
      const request = this._pending.splice(index, 1)[0];
      if (request.signal.aborted) {
        request.reject(request.signal.reason);
        continue;
      }
      this._active++;
      this._activeAccounts.add(request.accountKey);
      this._activeHosts.set(request.host, (this._activeHosts.get(request.host) ?? 0) + 1);
      void request.run().finally(() => {
        this._active--;
        this._activeAccounts.delete(request.accountKey);
        const hostActive = (this._activeHosts.get(request.host) ?? 1) - 1;
        if (hostActive === 0) {
          this._activeHosts.delete(request.host);
        } else {
          this._activeHosts.set(request.host, hostActive);
        }
        this._drain();
      });
    }
  }
  _nextIndex() {
    let selected = -1;
    for (let index = 0; index < this._pending.length; index++) {
      const candidate = this._pending[index];
      if (this._activeAccounts.has(candidate.accountKey) || (this._activeHosts.get(candidate.host) ?? 0) >= this._maximumHostConcurrency) {
        continue;
      }
      if (selected < 0 || this._compare(candidate, this._pending[selected]) < 0) {
        selected = index;
      }
    }
    return selected;
  }
  _compare(left, right) {
    return priorityOrder[left.priority] - priorityOrder[right.priority] || left.sequence - right.sequence;
  }
  static accountKey(account) {
    return `${account.host.toLowerCase()}\0${account.accountId}`;
  }
}
export {
  GitHubRequestQueue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXGdpdGh1YlJlcXVlc3RRdWV1ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgR2l0SHViQWNjb3VudEhhbmRsZSwgR2l0SHViUmVxdWVzdFByaW9yaXR5IH0gZnJvbSAnLi9naXRodWJUeXBlcy5qcyc7XG5cbmNvbnN0IHByaW9yaXR5T3JkZXI6IFJlY29yZDxHaXRIdWJSZXF1ZXN0UHJpb3JpdHksIG51bWJlcj4gPSB7XG5cdG11dGF0aW9uUmVjb25jaWxpYXRpb246IDAsXG5cdG11dGF0aW9uOiAxLFxuXHRpbnRlcmFjdGl2ZTogMixcblx0bWVyZ2VHYXRlOiAzLFxuXHR2aXNpYmxlOiA0LFxuXHRiYWNrZ3JvdW5kOiA1LFxuXHRlbnJpY2htZW50OiA2LFxufTtcblxuaW50ZXJmYWNlIElRdWV1ZWRSZXF1ZXN0IHtcblx0cmVhZG9ubHkgYWNjb3VudEtleTogc3RyaW5nO1xuXHRyZWFkb25seSBob3N0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByaW9yaXR5OiBHaXRIdWJSZXF1ZXN0UHJpb3JpdHk7XG5cdHJlYWRvbmx5IHNlcXVlbmNlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNpZ25hbDogQWJvcnRTaWduYWw7XG5cdHJlYWRvbmx5IHJ1bjogKCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgcmVqZWN0OiAocmVhc29uPzogdW5rbm93bikgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEdpdEh1YlJlcXVlc3RRdWV1ZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmc6IElRdWV1ZWRSZXF1ZXN0W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQWNjb3VudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlSG9zdHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIF9hY3RpdmUgPSAwO1xuXHRwcml2YXRlIF9zZXF1ZW5jZSA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWF4aW11bUNvbmN1cnJlbmN5ID0gNCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXhpbXVtSG9zdENvbmN1cnJlbmN5ID0gMixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGVucXVldWU8VD4oYWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSwgcHJpb3JpdHk6IEdpdEh1YlJlcXVlc3RQcmlvcml0eSwgc2lnbmFsOiBBYm9ydFNpZ25hbCwgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGlmIChzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuXHRcdH1cblx0XHRjb25zdCBhY2NvdW50S2V5ID0gR2l0SHViUmVxdWVzdFF1ZXVlLmFjY291bnRLZXkoYWNjb3VudCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3Q6IElRdWV1ZWRSZXF1ZXN0ID0ge1xuXHRcdFx0XHRhY2NvdW50S2V5LFxuXHRcdFx0XHRob3N0OiBhY2NvdW50Lmhvc3QsXG5cdFx0XHRcdHByaW9yaXR5LFxuXHRcdFx0XHRzZXF1ZW5jZTogdGhpcy5fc2VxdWVuY2UrKyxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShhd2FpdCB0YXNrKCkpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVqZWN0LFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3BlbmRpbmcucHVzaChyZXF1ZXN0KTtcblx0XHRcdHNpZ25hbC5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9wZW5kaW5nLmluZGV4T2YocmVxdWVzdCk7XG5cdFx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdHJlamVjdChzaWduYWwucmVhc29uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5fZHJhaW4oKTtcblx0XHR9KTtcblx0fVxuXG5cdGNhbmNlbEFjY291bnQoYWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSwgcmVhc29uPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGFjY291bnRLZXkgPSBHaXRIdWJSZXF1ZXN0UXVldWUuYWNjb3VudEtleShhY2NvdW50KTtcblx0XHRmb3IgKGxldCBpbmRleCA9IHRoaXMuX3BlbmRpbmcubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuX3BlbmRpbmdbaW5kZXhdO1xuXHRcdFx0aWYgKHJlcXVlc3QuYWNjb3VudEtleSA9PT0gYWNjb3VudEtleSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdHJlcXVlc3QucmVqZWN0KHJlYXNvbiA/PyBuZXcgRXJyb3IoJ0dpdEh1YiBjcmVkZW50aWFsIHdhcyBpbnZhbGlkYXRlZCcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB0aGlzLl9wZW5kaW5nLnNwbGljZSgwKSkge1xuXHRcdFx0cmVxdWVzdC5yZWplY3QobmV3IEVycm9yKCdHaXRIdWIgcmVxdWVzdCBxdWV1ZSB3YXMgZGlzcG9zZWQnKSk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2RyYWluKCk6IHZvaWQge1xuXHRcdHdoaWxlICh0aGlzLl9hY3RpdmUgPCB0aGlzLl9tYXhpbXVtQ29uY3VycmVuY3kpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbmV4dEluZGV4KCk7XG5cdFx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLl9wZW5kaW5nLnNwbGljZShpbmRleCwgMSlbMF07XG5cdFx0XHRpZiAocmVxdWVzdC5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRyZXF1ZXN0LnJlamVjdChyZXF1ZXN0LnNpZ25hbC5yZWFzb24pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGl2ZSsrO1xuXHRcdFx0dGhpcy5fYWN0aXZlQWNjb3VudHMuYWRkKHJlcXVlc3QuYWNjb3VudEtleSk7XG5cdFx0XHR0aGlzLl9hY3RpdmVIb3N0cy5zZXQocmVxdWVzdC5ob3N0LCAodGhpcy5fYWN0aXZlSG9zdHMuZ2V0KHJlcXVlc3QuaG9zdCkgPz8gMCkgKyAxKTtcblx0XHRcdHZvaWQgcmVxdWVzdC5ydW4oKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlLS07XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUFjY291bnRzLmRlbGV0ZShyZXF1ZXN0LmFjY291bnRLZXkpO1xuXHRcdFx0XHRjb25zdCBob3N0QWN0aXZlID0gKHRoaXMuX2FjdGl2ZUhvc3RzLmdldChyZXF1ZXN0Lmhvc3QpID8/IDEpIC0gMTtcblx0XHRcdFx0aWYgKGhvc3RBY3RpdmUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVIb3N0cy5kZWxldGUocmVxdWVzdC5ob3N0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVIb3N0cy5zZXQocmVxdWVzdC5ob3N0LCBob3N0QWN0aXZlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9kcmFpbigpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbmV4dEluZGV4KCk6IG51bWJlciB7XG5cdFx0bGV0IHNlbGVjdGVkID0gLTE7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuX3BlbmRpbmcubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9wZW5kaW5nW2luZGV4XTtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVBY2NvdW50cy5oYXMoY2FuZGlkYXRlLmFjY291bnRLZXkpIHx8ICh0aGlzLl9hY3RpdmVIb3N0cy5nZXQoY2FuZGlkYXRlLmhvc3QpID8/IDApID49IHRoaXMuX21heGltdW1Ib3N0Q29uY3VycmVuY3kpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VsZWN0ZWQgPCAwIHx8IHRoaXMuX2NvbXBhcmUoY2FuZGlkYXRlLCB0aGlzLl9wZW5kaW5nW3NlbGVjdGVkXSkgPCAwKSB7XG5cdFx0XHRcdHNlbGVjdGVkID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZWxlY3RlZDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBhcmUobGVmdDogSVF1ZXVlZFJlcXVlc3QsIHJpZ2h0OiBJUXVldWVkUmVxdWVzdCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHByaW9yaXR5T3JkZXJbbGVmdC5wcmlvcml0eV0gLSBwcmlvcml0eU9yZGVyW3JpZ2h0LnByaW9yaXR5XSB8fCBsZWZ0LnNlcXVlbmNlIC0gcmlnaHQuc2VxdWVuY2U7XG5cdH1cblxuXHRzdGF0aWMgYWNjb3VudEtleShhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7YWNjb3VudC5ob3N0LnRvTG93ZXJDYXNlKCl9XFx4MDAke2FjY291bnQuYWNjb3VudElkfWA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBRzNCLE1BQU0sZ0JBQXVEO0FBQUEsRUFDNUQsd0JBQXdCO0FBQUEsRUFDeEIsVUFBVTtBQUFBLEVBQ1YsYUFBYTtBQUFBLEVBQ2IsV0FBVztBQUFBLEVBQ1gsU0FBUztBQUFBLEVBQ1QsWUFBWTtBQUFBLEVBQ1osWUFBWTtBQUNiO0FBWU8sTUFBTSwyQkFBMkIsV0FBVztBQUFBLEVBUWxELFlBQ2tCLHNCQUFzQixHQUN0QiwwQkFBMEIsR0FDMUM7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQVJsQixTQUFpQixXQUE2QixDQUFDO0FBQy9DLFNBQWlCLGtCQUFrQixvQkFBSSxJQUFZO0FBQ25ELFNBQWlCLGVBQWUsb0JBQUksSUFBb0I7QUFDeEQsU0FBUSxVQUFVO0FBQ2xCLFNBQVEsWUFBWTtBQUFBLEVBT3BCO0FBQUEsRUFFQSxRQUFXLFNBQThCLFVBQWlDLFFBQXFCLE1BQW9DO0FBQ2xJLFFBQUksT0FB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
