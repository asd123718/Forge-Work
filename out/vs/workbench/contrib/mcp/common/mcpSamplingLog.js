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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { observableMemento } from "../../../../platform/observable/common/observableMemento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["SamplingRetentionDays"] = 7] = "SamplingRetentionDays";
  Constants2[Constants2["MsPerDay"] = 864e5] = "MsPerDay";
  Constants2[Constants2["SamplingRetentionMs"] = 6048e5] = "SamplingRetentionMs";
  Constants2[Constants2["SamplingLastNMessage"] = 30] = "SamplingLastNMessage";
  return Constants2;
})(Constants || {});
const samplingMemento = observableMemento({
  defaultValue: /* @__PURE__ */ new Map(),
  key: "mcp.sampling.logs",
  toStorage: (v) => JSON.stringify(Array.from(v.entries())),
  fromStorage: (v) => new Map(JSON.parse(v))
});
let McpSamplingLog = class extends Disposable {
  constructor(_storageService) {
    super();
    this._storageService = _storageService;
    this._logs = {};
  }
  has(server) {
    const storage = this._getLogStorageForServer(server);
    return storage.get().has(server.definition.id);
  }
  get(server) {
    const storage = this._getLogStorageForServer(server);
    return storage.get().get(server.definition.id);
  }
  getAsText(server) {
    const storage = this._getLogStorageForServer(server);
    const record = storage.get().get(server.definition.id);
    if (!record) {
      return "";
    }
    const parts = [];
    const total = record.bins.reduce((sum, value) => sum + value, 0);
    parts.push(localize("mcp.sampling.rpd", "{0} total requests in the last 7 days.", total));
    parts.push(this._formatRecentRequests(record));
    return parts.join("\n");
  }
  _formatRecentRequests(data) {
    if (!data.lastReqs.length) {
      return "\nNo recent requests.";
    }
    const result = [];
    for (let i = 0; i < data.lastReqs.length; i++) {
      const { request, response, at, model } = data.lastReqs[i];
      result.push(`
[${i + 1}] ${new Date(at).toISOString()} ${model}`);
      result.push("  Request:");
      for (const msg of request) {
        const role = msg.role.padEnd(9);
        let content = "";
        if ("text" in msg.content && msg.content.type === "text") {
          content = msg.content.text;
        } else if ("data" in msg.content) {
          content = `[${msg.content.type} data: ${msg.content.mimeType}]`;
        }
        result.push(`    ${role}: ${content}`);
      }
      result.push("  Response:");
      result.push(`    ${response}`);
    }
    return result.join("\n");
  }
  async add(server, request, response, model) {
    const now = Date.now();
    const utcOrdinal = Math.floor(now / 864e5 /* MsPerDay */);
    const storage = this._getLogStorageForServer(server);
    const next = new Map(storage.get());
    let record = next.get(server.definition.id);
    if (!record) {
      record = {
        head: utcOrdinal,
        bins: Array.from({ length: 7 /* SamplingRetentionDays */ }, () => 0),
        lastReqs: []
      };
    } else {
      for (let i = 0; i < utcOrdinal - record.head && i < 7 /* SamplingRetentionDays */; i++) {
        record.bins.pop();
        record.bins.unshift(0);
      }
      record.head = utcOrdinal;
    }
    record.bins[0]++;
    record.lastReqs.unshift({ request, response, at: now, model });
    while (record.lastReqs.length > 30 /* SamplingLastNMessage */) {
      record.lastReqs.pop();
    }
    next.set(server.definition.id, record);
    storage.set(next, void 0);
  }
  _getLogStorageForServer(server) {
    const scope = server.readDefinitions().get().collection?.scope ?? StorageScope.WORKSPACE;
    return this._logs[scope] ??= this._register(samplingMemento(scope, StorageTarget.MACHINE, this._storageService));
  }
};
McpSamplingLog = __decorateClass([
  __decorateParam(0, IStorageService)
], McpSamplingLog);
export {
  McpSamplingLog
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTYW1wbGluZ0xvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZU1lbWVudG8sIG9ic2VydmFibGVNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vb2JzZXJ2YWJsZU1lbWVudG8uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXIgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdFNhbXBsaW5nUmV0ZW50aW9uRGF5cyA9IDcsXG5cdE1zUGVyRGF5ID0gMjQgKiA2MCAqIDYwICogMTAwMCxcblx0U2FtcGxpbmdSZXRlbnRpb25NcyA9IFNhbXBsaW5nUmV0ZW50aW9uRGF5cyAqIE1zUGVyRGF5LFxuXHRTYW1wbGluZ0xhc3ROTWVzc2FnZSA9IDMwLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTYW1wbGluZ1N0b3JlZERhdGEge1xuXHQvLyBVVEMgZGF5IG9yZGluYWwgb2YgdGhlIGZpcnN0IGJpbiBpbiB0aGUgYmluc1xuXHRoZWFkOiBudW1iZXI7XG5cdC8vIFJlcXVlc3RzIHBlciBkYXksIG1heCBsZW5ndGggb2YgYENvbnN0YW50cy5TYW1wbGluZ1JldGVudGlvbkRheXNgXG5cdGJpbnM6IG51bWJlcltdO1xuXHQvLyBMYXN0IHNhbXBsaW5nIHJlcXVlc3RzL3Jlc3BvbnNlc1xuXHRsYXN0UmVxczogeyByZXF1ZXN0OiBNQ1AuU2FtcGxpbmdNZXNzYWdlW107IHJlc3BvbnNlOiBzdHJpbmc7IGF0OiBudW1iZXI7IG1vZGVsOiBzdHJpbmcgfVtdO1xufVxuXG5jb25zdCBzYW1wbGluZ01lbWVudG8gPSBvYnNlcnZhYmxlTWVtZW50bzxSZWFkb25seU1hcDxzdHJpbmcsIElTYW1wbGluZ1N0b3JlZERhdGE+Pih7XG5cdGRlZmF1bHRWYWx1ZTogbmV3IE1hcCgpLFxuXHRrZXk6ICdtY3Auc2FtcGxpbmcubG9ncycsXG5cdHRvU3RvcmFnZTogdiA9PiBKU09OLnN0cmluZ2lmeShBcnJheS5mcm9tKHYuZW50cmllcygpKSksXG5cdGZyb21TdG9yYWdlOiB2ID0+IG5ldyBNYXAoSlNPTi5wYXJzZSh2KSksXG59KTtcblxuZXhwb3J0IGNsYXNzIE1jcFNhbXBsaW5nTG9nIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ3M6IHsgW0sgaW4gU3RvcmFnZVNjb3BlXT86IE9ic2VydmFibGVNZW1lbnRvPFJlYWRvbmx5TWFwPHN0cmluZywgSVNhbXBsaW5nU3RvcmVkRGF0YT4+IH0gPSB7fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgaGFzKHNlcnZlcjogSU1jcFNlcnZlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9nZXRMb2dTdG9yYWdlRm9yU2VydmVyKHNlcnZlcik7XG5cdFx0cmV0dXJuIHN0b3JhZ2UuZ2V0KCkuaGFzKHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoc2VydmVyOiBJTWNwU2VydmVyKTogUmVhZG9ubHk8SVNhbXBsaW5nU3RvcmVkRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9nZXRMb2dTdG9yYWdlRm9yU2VydmVyKHNlcnZlcik7XG5cdFx0cmV0dXJuIHN0b3JhZ2UuZ2V0KCkuZ2V0KHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBc1RleHQoc2VydmVyOiBJTWNwU2VydmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fZ2V0TG9nU3RvcmFnZUZvclNlcnZlcihzZXJ2ZXIpO1xuXHRcdGNvbnN0IHJlY29yZCA9IHN0b3JhZ2UuZ2V0KCkuZ2V0KHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHRvdGFsID0gcmVjb3JkLmJpbnMucmVkdWNlKChzdW0sIHZhbHVlKSA9PiBzdW0gKyB2YWx1ZSwgMCk7XG5cdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLnJwZCcsICd7MH0gdG90YWwgcmVxdWVzdHMgaW4gdGhlIGxhc3QgNyBkYXlzLicsIHRvdGFsKSk7XG5cblx0XHRwYXJ0cy5wdXNoKHRoaXMuX2Zvcm1hdFJlY2VudFJlcXVlc3RzKHJlY29yZCkpO1xuXHRcdHJldHVybiBwYXJ0cy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdFJlY2VudFJlcXVlc3RzKGRhdGE6IElTYW1wbGluZ1N0b3JlZERhdGEpOiBzdHJpbmcge1xuXHRcdGlmICghZGF0YS5sYXN0UmVxcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAnXFxuTm8gcmVjZW50IHJlcXVlc3RzLic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sYXN0UmVxcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgeyByZXF1ZXN0LCByZXNwb25zZSwgYXQsIG1vZGVsIH0gPSBkYXRhLmxhc3RSZXFzW2ldO1xuXHRcdFx0cmVzdWx0LnB1c2goYFxcblske2kgKyAxfV0gJHtuZXcgRGF0ZShhdCkudG9JU09TdHJpbmcoKX0gJHttb2RlbH1gKTtcblxuXHRcdFx0cmVzdWx0LnB1c2goJyAgUmVxdWVzdDonKTtcblx0XHRcdGZvciAoY29uc3QgbXNnIG9mIHJlcXVlc3QpIHtcblx0XHRcdFx0Y29uc3Qgcm9sZSA9IG1zZy5yb2xlLnBhZEVuZCg5KTtcblx0XHRcdFx0bGV0IGNvbnRlbnQgPSAnJztcblx0XHRcdFx0aWYgKCd0ZXh0JyBpbiBtc2cuY29udGVudCAmJiBtc2cuY29udGVudC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRjb250ZW50ID0gbXNnLmNvbnRlbnQudGV4dDtcblx0XHRcdFx0fSBlbHNlIGlmICgnZGF0YScgaW4gbXNnLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRjb250ZW50ID0gYFske21zZy5jb250ZW50LnR5cGV9IGRhdGE6ICR7bXNnLmNvbnRlbnQubWltZVR5cGV9XWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2goYCAgICAke3JvbGV9OiAke2NvbnRlbnR9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCgnICBSZXNwb25zZTonKTtcblx0XHRcdHJlc3VsdC5wdXNoKGAgICAgJHtyZXNwb25zZX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFkZChzZXJ2ZXI6IElNY3BTZXJ2ZXIsIHJlcXVlc3Q6IE1DUC5TYW1wbGluZ01lc3NhZ2VbXSwgcmVzcG9uc2U6IHN0cmluZywgbW9kZWw6IHN0cmluZykge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdXRjT3JkaW5hbCA9IE1hdGguZmxvb3Iobm93IC8gQ29uc3RhbnRzLk1zUGVyRGF5KTtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fZ2V0TG9nU3RvcmFnZUZvclNlcnZlcihzZXJ2ZXIpO1xuXG5cdFx0Y29uc3QgbmV4dCA9IG5ldyBNYXAoc3RvcmFnZS5nZXQoKSk7XG5cdFx0bGV0IHJlY29yZCA9IG5leHQuZ2V0KHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0cmVjb3JkID0ge1xuXHRcdFx0XHRoZWFkOiB1dGNPcmRpbmFsLFxuXHRcdFx0XHRiaW5zOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiBDb25zdGFudHMuU2FtcGxpbmdSZXRlbnRpb25EYXlzIH0sICgpID0+IDApLFxuXHRcdFx0XHRsYXN0UmVxczogW10sXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaGlmdCBiaW5zIGJhY2sgYnkgZGF5c1NpbmNlSGVhZCwgZHJvcHBpbmcgb2xkIGRheXNcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgKHV0Y09yZGluYWwgLSByZWNvcmQuaGVhZCkgJiYgaSA8IENvbnN0YW50cy5TYW1wbGluZ1JldGVudGlvbkRheXM7IGkrKykge1xuXHRcdFx0XHRyZWNvcmQuYmlucy5wb3AoKTtcblx0XHRcdFx0cmVjb3JkLmJpbnMudW5zaGlmdCgwKTtcblx0XHRcdH1cblx0XHRcdHJlY29yZC5oZWFkID0gdXRjT3JkaW5hbDtcblx0XHR9XG5cblx0XHQvLyBJbmNyZW1lbnQgdGhlIGN1cnJlbnQgZGF5J3MgYmluIChoZWFkKVxuXHRcdHJlY29yZC5iaW5zWzBdKys7XG5cdFx0cmVjb3JkLmxhc3RSZXFzLnVuc2hpZnQoeyByZXF1ZXN0LCByZXNwb25zZSwgYXQ6IG5vdywgbW9kZWwgfSk7XG5cdFx0d2hpbGUgKHJlY29yZC5sYXN0UmVxcy5sZW5ndGggPiBDb25zdGFudHMuU2FtcGxpbmdMYXN0Tk1lc3NhZ2UpIHtcblx0XHRcdHJlY29yZC5sYXN0UmVxcy5wb3AoKTtcblx0XHR9XG5cblx0XHRuZXh0LnNldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgcmVjb3JkKTtcblx0XHRzdG9yYWdlLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TG9nU3RvcmFnZUZvclNlcnZlcihzZXJ2ZXI6IElNY3BTZXJ2ZXIpIHtcblx0XHRjb25zdCBzY29wZSA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5nZXQoKS5jb2xsZWN0aW9uPy5zY29wZSA/PyBTdG9yYWdlU2NvcGUuV09SS1NQQUNFO1xuXHRcdHJldHVybiB0aGlzLl9sb2dzW3Njb3BlXSA/Pz0gdGhpcy5fcmVnaXN0ZXIoc2FtcGxpbmdNZW1lbnRvKHNjb3BlLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBSTdELElBQVcsWUFB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
