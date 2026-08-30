import { coalesce } from "../../../../base/common/arrays.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { DisposableStore, isDisposable } from "../../../../base/common/lifecycle.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../common/core/range.js";
import { IModelService } from "../../../common/services/model.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
class Link {
  constructor(link, provider) {
    this._link = link;
    this._provider = provider;
  }
  toJSON() {
    return {
      range: this.range,
      url: this.url,
      tooltip: this.tooltip
    };
  }
  get range() {
    return this._link.range;
  }
  get url() {
    return this._link.url;
  }
  get tooltip() {
    return this._link.tooltip;
  }
  async resolve(token) {
    if (this._link.url) {
      return this._link.url;
    }
    if (typeof this._provider.resolveLink === "function") {
      return Promise.resolve(this._provider.resolveLink(this._link, token)).then((value) => {
        this._link = value || this._link;
        if (this._link.url) {
          return this.resolve(token);
        }
        return Promise.reject(new Error("missing"));
      });
    }
    return Promise.reject(new Error("missing"));
  }
}
const _LinksList = class _LinksList {
  constructor(tuples) {
    this._disposables = new DisposableStore();
    let links = [];
    for (const [list, provider] of tuples) {
      const newLinks = list.links.map((link) => new Link(link, provider));
      links = _LinksList._union(links, newLinks);
      if (isDisposable(list)) {
        this._disposables ??= new DisposableStore();
        this._disposables.add(list);
      }
    }
    this.links = links;
  }
  dispose() {
    this._disposables?.dispose();
    this.links.length = 0;
  }
  static _union(oldLinks, newLinks) {
    const result = [];
    let oldIndex;
    let oldLen;
    let newIndex;
    let newLen;
    for (oldIndex = 0, newIndex = 0, oldLen = oldLinks.length, newLen = newLinks.length; oldIndex < oldLen && newIndex < newLen; ) {
      const oldLink = oldLinks[oldIndex];
      const newLink = newLinks[newIndex];
      if (Range.areIntersectingOrTouching(oldLink.range, newLink.range)) {
        oldIndex++;
        continue;
      }
      const comparisonResult = Range.compareRangesUsingStarts(oldLink.range, newLink.range);
      if (comparisonResult < 0) {
        result.push(oldLink);
        oldIndex++;
      } else {
        result.push(newLink);
        newIndex++;
      }
    }
    for (; oldIndex < oldLen; oldIndex++) {
      result.push(oldLinks[oldIndex]);
    }
    for (; newIndex < newLen; newIndex++) {
      result.push(newLinks[newIndex]);
    }
    return result;
  }
};
_LinksList.Empty = new _LinksList([]);
let LinksList = _LinksList;
async function getLinks(providers, model, token) {
  const lists = [];
  const promises = providers.ordered(model).reverse().map(async (provider, i) => {
    try {
      const result = await provider.provideLinks(model, token);
      if (result) {
        lists[i] = [result, provider];
      }
    } catch (err) {
      onUnexpectedExternalError(err);
    }
  });
  await Promise.all(promises);
  let res = new LinksList(coalesce(lists));
  if (token.isCancellationRequested) {
    res.dispose();
    res = LinksList.Empty;
  }
  return res;
}
CommandsRegistry.registerCommand("_executeLinkProvider", async (accessor, ...args) => {
  let [uri, resolveCount] = args;
  assertType(uri instanceof URI);
  if (typeof resolveCount !== "number") {
    resolveCount = 0;
  }
  const { linkProvider } = accessor.get(ILanguageFeaturesService);
  const model = accessor.get(IModelService).getModel(uri);
  if (!model) {
    return [];
  }
  const list = await getLinks(linkProvider, model, CancellationToken.None);
  if (!list) {
    return [];
  }
  for (let i = 0; i < Math.min(resolveCount, list.links.length); i++) {
    await list.links[i].resolve(CancellationToken.None);
  }
  const result = list.links.slice(0);
  list.dispose();
  return result;
});
export {
  Link,
  LinksList,
  getLinks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmtzXFxicm93c2VyXFxnZXRMaW5rcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGluaywgSUxpbmtzTGlzdCwgTGlua1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTGluayBpbXBsZW1lbnRzIElMaW5rIHtcblxuXHRwcml2YXRlIF9saW5rOiBJTGluaztcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IExpbmtQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3RvcihsaW5rOiBJTGluaywgcHJvdmlkZXI6IExpbmtQcm92aWRlcikge1xuXHRcdHRoaXMuX2xpbmsgPSBsaW5rO1xuXHRcdHRoaXMuX3Byb3ZpZGVyID0gcHJvdmlkZXI7XG5cdH1cblxuXHR0b0pTT04oKTogSUxpbmsge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogdGhpcy5yYW5nZSxcblx0XHRcdHVybDogdGhpcy51cmwsXG5cdFx0XHR0b29sdGlwOiB0aGlzLnRvb2x0aXBcblx0XHR9O1xuXHR9XG5cblx0Z2V0IHJhbmdlKCk6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmsucmFuZ2U7XG5cdH1cblxuXHRnZXQgdXJsKCk6IFVSSSB8IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmsudXJsO1xuXHR9XG5cblx0Z2V0IHRvb2x0aXAoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluay50b29sdGlwO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSSB8IHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9saW5rLnVybCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xpbmsudXJsO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZUxpbmsgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJvdmlkZXIucmVzb2x2ZUxpbmsodGhpcy5fbGluaywgdG9rZW4pKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0dGhpcy5fbGluayA9IHZhbHVlIHx8IHRoaXMuX2xpbms7XG5cdFx0XHRcdGlmICh0aGlzLl9saW5rLnVybCkge1xuXHRcdFx0XHRcdC8vIHJlY3Vyc2Vcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlKHRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ21pc3NpbmcnKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdtaXNzaW5nJykpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5rc0xpc3Qge1xuXG5cdHN0YXRpYyByZWFkb25seSBFbXB0eSA9IG5ldyBMaW5rc0xpc3QoW10pO1xuXG5cdHJlYWRvbmx5IGxpbmtzOiBMaW5rW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcih0dXBsZXM6IFtJTGlua3NMaXN0LCBMaW5rUHJvdmlkZXJdW10pIHtcblxuXHRcdGxldCBsaW5rczogTGlua1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbbGlzdCwgcHJvdmlkZXJdIG9mIHR1cGxlcykge1xuXHRcdFx0Ly8gbWVyZ2UgYWxsIGxpbmtzXG5cdFx0XHRjb25zdCBuZXdMaW5rcyA9IGxpc3QubGlua3MubWFwKGxpbmsgPT4gbmV3IExpbmsobGluaywgcHJvdmlkZXIpKTtcblx0XHRcdGxpbmtzID0gTGlua3NMaXN0Ll91bmlvbihsaW5rcywgbmV3TGlua3MpO1xuXHRcdFx0Ly8gcmVnaXN0ZXIgZGlzcG9zYWJsZXNcblx0XHRcdGlmIChpc0Rpc3Bvc2FibGUobGlzdCkpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMgPz89IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGxpc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmxpbmtzID0gbGlua3M7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5saW5rcy5sZW5ndGggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3VuaW9uKG9sZExpbmtzOiBMaW5rW10sIG5ld0xpbmtzOiBMaW5rW10pOiBMaW5rW10ge1xuXHRcdC8vIHJldW5pdGUgb2xkTGlua3Mgd2l0aCBuZXdMaW5rcyBhbmQgcmVtb3ZlIGR1cGxpY2F0ZXNcblx0XHRjb25zdCByZXN1bHQ6IExpbmtbXSA9IFtdO1xuXHRcdGxldCBvbGRJbmRleDogbnVtYmVyO1xuXHRcdGxldCBvbGRMZW46IG51bWJlcjtcblx0XHRsZXQgbmV3SW5kZXg6IG51bWJlcjtcblx0XHRsZXQgbmV3TGVuOiBudW1iZXI7XG5cblx0XHRmb3IgKG9sZEluZGV4ID0gMCwgbmV3SW5kZXggPSAwLCBvbGRMZW4gPSBvbGRMaW5rcy5sZW5ndGgsIG5ld0xlbiA9IG5ld0xpbmtzLmxlbmd0aDsgb2xkSW5kZXggPCBvbGRMZW4gJiYgbmV3SW5kZXggPCBuZXdMZW47KSB7XG5cdFx0XHRjb25zdCBvbGRMaW5rID0gb2xkTGlua3Nbb2xkSW5kZXhdO1xuXHRcdFx0Y29uc3QgbmV3TGluayA9IG5ld0xpbmtzW25ld0luZGV4XTtcblxuXHRcdFx0aWYgKFJhbmdlLmFyZUludGVyc2VjdGluZ09yVG91Y2hpbmcob2xkTGluay5yYW5nZSwgbmV3TGluay5yYW5nZSkpIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBvbGRMaW5rXG5cdFx0XHRcdG9sZEluZGV4Kys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21wYXJpc29uUmVzdWx0ID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKG9sZExpbmsucmFuZ2UsIG5ld0xpbmsucmFuZ2UpO1xuXG5cdFx0XHRpZiAoY29tcGFyaXNvblJlc3VsdCA8IDApIHtcblx0XHRcdFx0Ly8gb2xkTGluayBpcyBiZWZvcmVcblx0XHRcdFx0cmVzdWx0LnB1c2gob2xkTGluayk7XG5cdFx0XHRcdG9sZEluZGV4Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBuZXdMaW5rIGlzIGJlZm9yZVxuXHRcdFx0XHRyZXN1bHQucHVzaChuZXdMaW5rKTtcblx0XHRcdFx0bmV3SW5kZXgrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKDsgb2xkSW5kZXggPCBvbGRMZW47IG9sZEluZGV4KyspIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9sZExpbmtzW29sZEluZGV4XSk7XG5cdFx0fVxuXHRcdGZvciAoOyBuZXdJbmRleCA8IG5ld0xlbjsgbmV3SW5kZXgrKykge1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3TGlua3NbbmV3SW5kZXhdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldExpbmtzKHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TGlua1Byb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TGlua3NMaXN0PiB7XG5cdGNvbnN0IGxpc3RzOiBbSUxpbmtzTGlzdCwgTGlua1Byb3ZpZGVyXVtdID0gW107XG5cblx0Ly8gYXNrIGFsbCBwcm92aWRlcnMgZm9yIGxpbmtzIGluIHBhcmFsbGVsXG5cdGNvbnN0IHByb21pc2VzID0gcHJvdmlkZXJzLm9yZGVyZWQobW9kZWwpLnJldmVyc2UoKS5tYXAoYXN5bmMgKHByb3ZpZGVyLCBpKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVMaW5rcyhtb2RlbCwgdG9rZW4pO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRsaXN0c1tpXSA9IFtyZXN1bHQsIHByb3ZpZGVyXTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZXJyKTtcblx0XHR9XG5cdH0pO1xuXG5cdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRsZXQgcmVzID0gbmV3IExpbmtzTGlzdChjb2FsZXNjZShsaXN0cykpO1xuXG5cdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdHJlcy5kaXNwb3NlKCk7XG5cdFx0cmVzID0gTGlua3NMaXN0LkVtcHR5O1xuXHR9XG5cblx0cmV0dXJuIHJlcztcbn1cblxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2V4ZWN1dGVMaW5rUHJvdmlkZXInLCBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3MpOiBQcm9taXNlPElMaW5rW10+ID0+IHtcblx0bGV0IFt1cmksIHJlc29sdmVDb3VudF0gPSBhcmdzO1xuXHRhc3NlcnRUeXBlKHVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cblx0aWYgKHR5cGVvZiByZXNvbHZlQ291bnQgIT09ICdudW1iZXInKSB7XG5cdFx0cmVzb2x2ZUNvdW50ID0gMDtcblx0fVxuXG5cdGNvbnN0IHsgbGlua1Byb3ZpZGVyIH0gPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWwgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSkuZ2V0TW9kZWwodXJpKTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBsaXN0ID0gYXdhaXQgZ2V0TGlua3MobGlua1Byb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdGlmICghbGlzdCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8vIHJlc29sdmUgbGlua3Ncblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihyZXNvbHZlQ291bnQgYXMgbnVtYmVyLCBsaXN0LmxpbmtzLmxlbmd0aCk7IGkrKykge1xuXHRcdGF3YWl0IGxpc3QubGlua3NbaV0ucmVzb2x2ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdCA9IGxpc3QubGlua3Muc2xpY2UoMCk7XG5cdGxpc3QuZGlzcG9zZSgpO1xuXHRyZXR1cm4gcmVzdWx0O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQWlCLGFBQWE7QUFHOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFF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Q1I7QUFFRDtBQXRFYSxXQUVJLFFBQVEsSUFBSSxXQUFVLENBQUMsQ0FBQztBQUZsQyxJQUFNLFlBQU47QUF3RVAsZUFBc0IsU0FBUyxXQUFrRCxPQUFtQixPQUE4QztBQUNqSixRQUFNLFFBQXNDLENBQUM7QUFHN0MsUUFBTSxXQUFXLFVBQVUsUUFBUSxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksT0FBTyxVQUFVLE1BQU07QUFDOUUsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLFNBQVMsYUFBYSxPQUFPLEtBQUs7QUFDdkQsVUFBSSxRQUFRO0FBQ1gsY0FBTSxDQUFDLElBQUksQ0FBQyxRQUFRLFFBQVE7QUFBQSxNQUM3QjtBQUFBLElBQ0QsU0FBUyxLQUFLO0FBQ2IsZ0NBQTBCLEdBQUc7QUFBQSxJQUM5QjtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sUUFBUSxJQUFJLFFBQVE7QUFFMUIsTUFBSSxNQUFNLElBQUksVUFBVSxTQUFTLEtBQUssQ0FBQztBQUV2QyxNQUFJLE1BQU0seUJBQXlCO0FBQ2xDLFFBQUksUUFBUTtBQUNaLFVBQU0sVUFBVTtBQUFBLEVBQ2pCO0FBRUEsU0FBTztBQUNSO0FBR0EsaUJBQWlCLGdCQUFnQix3QkFBd0IsT0FBTyxhQUFhLFNBQTJCO0FBQ3ZHLE1BQUksQ0FBQyxLQUFLLFlBQVksSUFBSTtBQUMxQixhQUFXLGVBQWUsR0FBRztBQUU3QixNQUFJLE9BQU8saUJBQWlCLFVBQVU7QUFDckMsbUJBQWU7QUFBQSxFQUNoQjtBQUVBLFFBQU0sRUFBRSxhQUFhLElBQUksU0FBUyxJQUFJLHdCQUF3QjtBQUM5RCxRQUFNLFFBQVEsU0FBUyxJQUFJLGFBQWEsRUFBRSxTQUFTLEdBQUc7QUFDdEQsTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQ0EsUUFBTSxPQUFPLE1BQU0sU0FBUyxjQUFjLE9BQU8sa0JBQWtCLElBQUk7QUFDdkUsTUFBSSxDQUFDLE1BQU07QUFDVixXQUFPLENBQUM7QUFBQSxFQUNUO0FBR0EsV0FBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLElBQUksY0FBd0IsS0FBSyxNQUFNLE1BQU0sR0FBRyxLQUFLO0FBQzdFLFVBQU0sS0FBSyxNQUFNLENBQUMsRUFBRSxRQUFRLGtCQUFrQixJQUFJO0FBQUEsRUFDbkQ7QUFFQSxRQUFNLFNBQVMsS0FBSyxNQUFNLE1BQU0sQ0FBQztBQUNqQyxPQUFLLFFBQVE7QUFDYixTQUFPO0FBQ1IsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
