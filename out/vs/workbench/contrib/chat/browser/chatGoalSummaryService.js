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
import { LRUCache } from "../../../../base/common/map.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ChatMessageRole, ILanguageModelsService } from "../common/languageModels.js";
const IChatGoalSummaryService = createDecorator("chatGoalSummaryService");
const MAX_PROMPT_CHARS = 4e3;
const MAX_SUMMARY_CHARS = 100;
const CACHE_SIZE = 50;
const REFUSAL_PREFIX_RE = /^(?:sorry\b|unfortunately\b|my apologies\b|as an ai\b|i\s+apologi[sz]e\b|i\s*['\u2019]?m\s+sorry\b|i\s+am\s+sorry\b|i\s*['\u2019]?m\s+unable\b|i\s+am\s+unable\b|i\s+am\s+not\s+able\b|i\s*(?:can['\u2019]?t|cannot|can\s?not|won['\u2019]?t)\b)/i;
let ChatGoalSummaryService = class {
  constructor(_languageModelsService) {
    this._languageModelsService = _languageModelsService;
    this._cache = new LRUCache(CACHE_SIZE);
    this._inFlight = /* @__PURE__ */ new Map();
  }
  async summarize(prompt, token) {
    const key = prompt.trim();
    if (!key) {
      return void 0;
    }
    const cached = this._cache.get(key);
    if (cached) {
      return cached;
    }
    const inflight = this._inFlight.get(key);
    if (inflight) {
      return inflight;
    }
    const promise = (async () => {
      try {
        const summary = await this._invokeModel(key, token);
        if (summary && !token.isCancellationRequested) {
          this._cache.set(key, summary);
        }
        return summary;
      } catch {
        return void 0;
      } finally {
        this._inFlight.delete(key);
      }
    })();
    this._inFlight.set(key, promise);
    return promise;
  }
  async _invokeModel(prompt, token) {
    const models = await this._languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
    if (!models.length || token.isCancellationRequested) {
      return void 0;
    }
    const truncatedPrompt = prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) + "...[truncated]" : prompt;
    const systemPrompt = [
      "You summarize a user's coding request into a single short phrase suitable for a status badge.",
      'Reply with the phrase only \u2014 no prose, no quotes, no leading "Goal:", no punctuation at the end.',
      'Use the imperative ("Add tests for X", "Fix the avatar popup bug").',
      "Keep it under 80 characters. Prefer the user's own nouns and verbs.",
      "This is a benign labeling task: never refuse or apologize. Always restate the request as a phrase, even if it seems unusual."
    ].join(" ");
    const response = await this._languageModelsService.sendChatRequest(
      models[0],
      void 0,
      [
        { role: ChatMessageRole.System, content: [{ type: "text", value: systemPrompt }] },
        { role: ChatMessageRole.User, content: [{ type: "text", value: truncatedPrompt }] }
      ],
      {},
      token
    );
    let text = "";
    for await (const part of response.stream) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (Array.isArray(part)) {
        for (const p of part) {
          if (p.type === "text") {
            text += p.value;
          }
        }
      } else if (part.type === "text") {
        text += part.value;
      }
    }
    await response.result;
    if (token.isCancellationRequested) {
      return void 0;
    }
    return cleanGoalSummary(text);
  }
};
ChatGoalSummaryService = __decorateClass([
  __decorateParam(0, ILanguageModelsService)
], ChatGoalSummaryService);
function cleanGoalSummary(raw) {
  let s = raw.trim();
  if (!s) {
    return void 0;
  }
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/^\s*goal\s*[:\-—]\s*/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || REFUSAL_PREFIX_RE.test(s)) {
    return void 0;
  }
  if (s.length > MAX_SUMMARY_CHARS) {
    s = s.slice(0, MAX_SUMMARY_CHARS - 1).replace(/\s+\S*$/, "") + "\u2026";
  }
  return s || void 0;
}
export {
  ChatGoalSummaryService,
  IChatGoalSummaryService,
  cleanGoalSummary
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRHb2FsU3VtbWFyeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRNZXNzYWdlUm9sZSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZT4oJ2NoYXRHb2FsU3VtbWFyeVNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyBhIHNob3J0IChvbmUtcGhyYXNlKSBzdW1tYXJ5IG9mIHRoZSB1c2VyJ3MgcHJvbXB0IHN1aXRhYmxlIGZvciBkaXNwbGF5XG5cdCAqIGFzIGEgXCJHb2FsOiA8c3VtbWFyeT5cIiBiYW5uZXIgYWJvdmUgdGhlIGNoYXQgaW5wdXQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlblxuXHQgKiBubyBtb2RlbCBpcyBhdmFpbGFibGUsIHRoZSBtb2RlbCBkZWNsaW5lcyB0byBzdW1tYXJpemUsIG9yIHRoZSBzdW1tYXJ5IGNhbm5vdFxuXHQgKiBiZSBwcm9kdWNlZC5cblx0ICovXG5cdHN1bW1hcml6ZShwcm9tcHQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xufVxuXG5jb25zdCBNQVhfUFJPTVBUX0NIQVJTID0gNDAwMDtcbmNvbnN0IE1BWF9TVU1NQVJZX0NIQVJTID0gMTAwO1xuY29uc3QgQ0FDSEVfU0laRSA9IDUwO1xuXG4vKipcbiAqIE1hdGNoZXMgcmVzcG9uc2VzIHdoZXJlIHRoZSBzdW1tYXJ5IG1vZGVsIGRlY2xpbmVkIHRvIHN1bW1hcml6ZSB0aGUgcHJvbXB0IGFuZFxuICogcmV0dXJuZWQgYSByZWZ1c2FsIChlLmcuIFwiU29ycnksIEkgY2FuJ3QgYXNzaXN0IHdpdGggdGhhdC5cIikgaW5zdGVhZCBvZiBhIGdvYWxcbiAqIHBocmFzZS4gQW5jaG9yZWQgYXQgdGhlIHN0YXJ0OiB2YWxpZCBzdW1tYXJpZXMgYXJlIGltcGVyYXRpdmUgcGhyYXNlcyAoXCJBZGRcbiAqIHRlc3RzIGZvciBYXCIsIFwiRml4IHRoZSBwb3B1cCBidWdcIikgYW5kIG5ldmVyIGJlZ2luIHdpdGggYW4gYXBvbG9neSBvciBhblxuICogaW5hYmlsaXR5IHN0YXRlbWVudCwgc28gbGVnaXRpbWF0ZSBzdW1tYXJpZXMgdGhhdCBtZXJlbHkgbWVudGlvbiB0aGVzZSB3b3Jkc1xuICogKHN1Y2ggYXMgYSByZXF1ZXN0IHRvIGZpeCBhIFwiY2FuJ3QgYXNzaXN0XCIgZXJyb3IpIGFyZSBub3QgbWlzY2xhc3NpZmllZC5cbiAqL1xuY29uc3QgUkVGVVNBTF9QUkVGSVhfUkUgPSAvXig/OnNvcnJ5XFxifHVuZm9ydHVuYXRlbHlcXGJ8bXkgYXBvbG9naWVzXFxifGFzIGFuIGFpXFxifGlcXHMrYXBvbG9naVtzel1lXFxifGlcXHMqWydcXHUyMDE5XT9tXFxzK3NvcnJ5XFxifGlcXHMrYW1cXHMrc29ycnlcXGJ8aVxccypbJ1xcdTIwMTldP21cXHMrdW5hYmxlXFxifGlcXHMrYW1cXHMrdW5hYmxlXFxifGlcXHMrYW1cXHMrbm90XFxzK2FibGVcXGJ8aVxccyooPzpjYW5bJ1xcdTIwMTldP3R8Y2Fubm90fGNhblxccz9ub3R8d29uWydcXHUyMDE5XT90KVxcYikvaTtcblxuZXhwb3J0IGNsYXNzIENoYXRHb2FsU3VtbWFyeVNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPihDQUNIRV9TSVpFKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBzdW1tYXJpemUocHJvbXB0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gcHJvbXB0LnRyaW0oKTtcblx0XHRpZiAoIWtleSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9jYWNoZS5nZXQoa2V5KTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZmxpZ2h0ID0gdGhpcy5faW5GbGlnaHQuZ2V0KGtleSk7XG5cdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5mbGlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gYXdhaXQgdGhpcy5faW52b2tlTW9kZWwoa2V5LCB0b2tlbik7XG5cdFx0XHRcdGlmIChzdW1tYXJ5ICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIHN1bW1hcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdW1tYXJ5O1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pbkZsaWdodC5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0dGhpcy5faW5GbGlnaHQuc2V0KGtleSwgcHJvbWlzZSk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnZva2VNb2RlbChwcm9tcHQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICdjb3BpbG90JywgaWQ6ICdjb3BpbG90LXV0aWxpdHktc21hbGwnIH0pO1xuXHRcdGlmICghbW9kZWxzLmxlbmd0aCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0cnVuY2F0ZWRQcm9tcHQgPSBwcm9tcHQubGVuZ3RoID4gTUFYX1BST01QVF9DSEFSUyA/IHByb21wdC5zbGljZSgwLCBNQVhfUFJPTVBUX0NIQVJTKSArICcuLi5bdHJ1bmNhdGVkXScgOiBwcm9tcHQ7XG5cdFx0Y29uc3Qgc3lzdGVtUHJvbXB0ID0gW1xuXHRcdFx0J1lvdSBzdW1tYXJpemUgYSB1c2VyXFwncyBjb2RpbmcgcmVxdWVzdCBpbnRvIGEgc2luZ2xlIHNob3J0IHBocmFzZSBzdWl0YWJsZSBmb3IgYSBzdGF0dXMgYmFkZ2UuJyxcblx0XHRcdCdSZXBseSB3aXRoIHRoZSBwaHJhc2Ugb25seSBcdTIwMTQgbm8gcHJvc2UsIG5vIHF1b3Rlcywgbm8gbGVhZGluZyBcIkdvYWw6XCIsIG5vIHB1bmN0dWF0aW9uIGF0IHRoZSBlbmQuJyxcblx0XHRcdCdVc2UgdGhlIGltcGVyYXRpdmUgKFwiQWRkIHRlc3RzIGZvciBYXCIsIFwiRml4IHRoZSBhdmF0YXIgcG9wdXAgYnVnXCIpLicsXG5cdFx0XHQnS2VlcCBpdCB1bmRlciA4MCBjaGFyYWN0ZXJzLiBQcmVmZXIgdGhlIHVzZXJcXCdzIG93biBub3VucyBhbmQgdmVyYnMuJyxcblx0XHRcdCdUaGlzIGlzIGEgYmVuaWduIGxhYmVsaW5nIHRhc2s6IG5ldmVyIHJlZnVzZSBvciBhcG9sb2dpemUuIEFsd2F5cyByZXN0YXRlIHRoZSByZXF1ZXN0IGFzIGEgcGhyYXNlLCBldmVuIGlmIGl0IHNlZW1zIHVudXN1YWwuJyxcblx0XHRdLmpvaW4oJyAnKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbmRDaGF0UmVxdWVzdChcblx0XHRcdG1vZGVsc1swXSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtcblx0XHRcdFx0eyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuU3lzdGVtLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBzeXN0ZW1Qcm9tcHQgfV0gfSxcblx0XHRcdFx0eyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogdHJ1bmNhdGVkUHJvbXB0IH1dIH0sXG5cdFx0XHRdLFxuXHRcdFx0e30sXG5cdFx0XHR0b2tlbixcblx0XHQpO1xuXG5cdFx0bGV0IHRleHQgPSAnJztcblx0XHRmb3IgYXdhaXQgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2Uuc3RyZWFtKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcCBvZiBwYXJ0KSB7XG5cdFx0XHRcdFx0aWYgKHAudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHR0ZXh0ICs9IHAudmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdHRleHQgKz0gcGFydC52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgcmVzcG9uc2UucmVzdWx0O1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2xlYW5Hb2FsU3VtbWFyeSh0ZXh0KTtcblx0fVxufVxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSByYXcgc3VtbWFyeS1tb2RlbCByZXNwb25zZSBpbnRvIGEgZ29hbCBwaHJhc2Ugc3VpdGFibGUgZm9yIHRoZVxuICogYmFubmVyLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vdGhpbmcgdXNhYmxlIHJlbWFpbnMuIFN0cmlwcyBxdW90ZXMgYW5kIGFcbiAqIGxlYWRpbmcgXCJHb2FsOlwiLCBjb2xsYXBzZXMgd2hpdGVzcGFjZSwgc3VwcHJlc3NlcyBtb2RlbCByZWZ1c2FscyAoc2VlXG4gKiB7QGxpbmsgUkVGVVNBTF9QUkVGSVhfUkV9KSwgYW5kIHRydW5jYXRlcyB0byB7QGxpbmsgTUFYX1NVTU1BUllfQ0hBUlN9LlxuICpcbiAqIEV4cG9ydGVkIGZvciB1bml0IHRlc3RpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhbkdvYWxTdW1tYXJ5KHJhdzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0bGV0IHMgPSByYXcudHJpbSgpO1xuXHRpZiAoIXMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIFN0cmlwIHN1cnJvdW5kaW5nIHF1b3RlcyBhbmQgYW55IGxlYWRpbmcgXCJHb2FsOlwiIHRoZSBtb2RlbCBtYXkgaGF2ZSBhZGRlZC5cblx0cyA9IHMucmVwbGFjZSgvXltcIidgXSt8W1wiJ2BdKyQvZywgJycpO1xuXHRzID0gcy5yZXBsYWNlKC9eXFxzKmdvYWxcXHMqWzpcXC1cdTIwMTRdXFxzKi9pLCAnJyk7XG5cdHMgPSBzLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdC8vIFRoZSBzdW1tYXJ5IG1vZGVsIG9jY2FzaW9uYWxseSBkZWNsaW5lcyB0byBzdW1tYXJpemUgKGUuZy4gY29udGVudFxuXHQvLyBmaWx0ZXJpbmcpIGFuZCByZXBsaWVzIHdpdGggYSByZWZ1c2FsIGxpa2UgXCJTb3JyeSwgSSBjYW4ndCBhc3Npc3Qgd2l0aFxuXHQvLyB0aGF0LlwiLiBUaGF0IGlzIGEgcmVmdXNhbCwgbm90IGEgZ29hbCwgc28gc3VwcHJlc3MgdGhlIGJhbm5lciBlbnRpcmVseVxuXHQvLyByYXRoZXIgdGhhbiBzdXJmYWNpbmcgdGhlIHJlZnVzYWwgdGV4dC5cblx0aWYgKCFzIHx8IFJFRlVTQUxfUFJFRklYX1JFLnRlc3QocykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzLmxlbmd0aCA+IE1BWF9TVU1NQVJZX0NIQVJTKSB7XG5cdFx0cyA9IHMuc2xpY2UoMCwgTUFYX1NVTU1BUllfQ0hBUlMgLSAxKS5yZXBsYWNlKC9cXHMrXFxTKiQvLCAnJykgKyAnXHUyMDI2Jztcblx0fVxuXHRyZXR1cm4gcyB8fCB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLDhCQUE4QjtBQUVqRCxNQUFNLDBCQUEwQixnQkFBeUMsd0JBQXdCO0FBY3hHLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sYUFBYTtBQVVuQixNQUFNLG9CQUFvQjtBQUVuQixJQUFNLHlCQUFOLE1BQWdFO0FBQUEsRUFNdEUsWUFDMEMsd0JBQ3hDO0FBRHdDO0FBSjFDLFNBQWlCLFNBQVMsSUFBSSxTQUF5QixVQUFVO0FBQ2pFLFNBQWlCLFlBQVksb0JBQUksSUFBeUM7QUFBQSxFQUl0RTtBQUFBLEVBRUosTUFBTSxVQUFVLFFBQWdCLE9BQXVEO0FBQ3RGLFVBQU0sTUFBTSxPQUFPLEtBQUs7QUFDeEIsUUFBSSxDQUFDLEtBQUs7QUFDVCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxLQUFLLE9BQU8sSUFBSSxHQUFHO0FBQ2xDLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDdkMsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcs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
