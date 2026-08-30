import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { AbstractIncrementalTestCollection, TestDiffOpType } from "./testTypes.js";
class MainThreadTestCollection extends AbstractIncrementalTestCollection {
  constructor(uriIdentityService, expandActual) {
    super(uriIdentityService);
    this.expandActual = expandActual;
    this.testsByUrl = new ResourceMap();
    this.busyProvidersChangeEmitter = new Emitter();
    this.expandPromises = /* @__PURE__ */ new WeakMap();
    this.onBusyProvidersChange = this.busyProvidersChangeEmitter.event;
    this.changeCollector = {
      add: (node) => {
        if (!node.item.uri) {
          return;
        }
        const s = this.testsByUrl.get(node.item.uri);
        if (!s) {
          this.testsByUrl.set(node.item.uri, /* @__PURE__ */ new Set([node]));
        } else {
          s.add(node);
        }
      },
      remove: (node) => {
        if (!node.item.uri) {
          return;
        }
        const s = this.testsByUrl.get(node.item.uri);
        if (!s) {
          return;
        }
        s.delete(node);
        if (s.size === 0) {
          this.testsByUrl.delete(node.item.uri);
        }
      }
    };
  }
  /**
   * @inheritdoc
   */
  get busyProviders() {
    return this.busyControllerCount;
  }
  /**
   * @inheritdoc
   */
  get rootItems() {
    return this.roots;
  }
  /**
   * @inheritdoc
   */
  get all() {
    return this.getIterator();
  }
  get rootIds() {
    return Iterable.map(this.roots.values(), (r) => r.item.extId);
  }
  /**
   * @inheritdoc
   */
  expand(testId, levels) {
    const test = this.items.get(testId);
    if (!test) {
      return Promise.resolve();
    }
    const existing = this.expandPromises.get(test);
    if (existing && existing.pendingLvl >= levels) {
      return existing.prom;
    }
    const prom = this.expandActual(test.item.extId, levels);
    const record = { doneLvl: existing ? existing.doneLvl : -1, pendingLvl: levels, prom };
    this.expandPromises.set(test, record);
    return prom.then(() => {
      record.doneLvl = levels;
    });
  }
  /**
   * @inheritdoc
   */
  getNodeById(id) {
    return this.items.get(id);
  }
  /**
   * @inheritdoc
   */
  getNodeByUrl(uri) {
    return this.testsByUrl.get(uri) || Iterable.empty();
  }
  /**
   * @inheritdoc
   */
  getReviverDiff() {
    const ops = [{ op: TestDiffOpType.IncrementPendingExtHosts, amount: this.pendingRootCount }];
    const queue = [this.rootIds];
    while (queue.length) {
      for (const child of queue.pop()) {
        const item = this.items.get(child);
        ops.push({
          op: TestDiffOpType.Add,
          item: {
            controllerId: item.controllerId,
            expand: item.expand,
            item: item.item
          }
        });
        queue.push(item.children);
      }
    }
    return ops;
  }
  /**
   * Applies the diff to the collection.
   */
  apply(diff) {
    const prevBusy = this.busyControllerCount;
    super.apply(diff);
    if (prevBusy !== this.busyControllerCount) {
      this.busyProvidersChangeEmitter.fire(this.busyControllerCount);
    }
  }
  /**
   * Clears everything from the collection, and returns a diff that applies
   * that action.
   */
  clear() {
    const ops = [];
    for (const root of this.roots) {
      ops.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
    }
    this.roots.clear();
    this.items.clear();
    return ops;
  }
  /**
   * @override
   */
  createItem(internal) {
    return { ...internal, children: /* @__PURE__ */ new Set() };
  }
  createChangeCollector() {
    return this.changeCollector;
  }
  *getIterator() {
    const queue = new LinkedList();
    queue.push(this.rootIds);
    while (queue.size > 0) {
      for (const id of queue.pop()) {
        const node = this.getNodeById(id);
        yield node;
        queue.push(node.children);
      }
    }
  }
}
export {
  MainThreadTestCollection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcbWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24gfSBmcm9tICcuL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbiwgSVRlc3RVcmlDYW5vbmljYWxpemVyLCBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvciwgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0sIEludGVybmFsVGVzdEl0ZW0sIFRlc3REaWZmT3BUeXBlLCBUZXN0c0RpZmYgfSBmcm9tICcuL3Rlc3RUeXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb248SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0+IGltcGxlbWVudHMgSU1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbiB7XG5cdHByaXZhdGUgdGVzdHNCeVVybCA9IG5ldyBSZXNvdXJjZU1hcDxTZXQ8SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0+PigpO1xuXG5cdHByaXZhdGUgYnVzeVByb3ZpZGVyc0NoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxudW1iZXI+KCk7XG5cdHByaXZhdGUgZXhwYW5kUHJvbWlzZXMgPSBuZXcgV2Vha01hcDxJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSwge1xuXHRcdHBlbmRpbmdMdmw6IG51bWJlcjtcblx0XHRkb25lTHZsOiBudW1iZXI7XG5cdFx0cHJvbTogUHJvbWlzZTx2b2lkPjtcblx0fT4oKTtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXQgYnVzeVByb3ZpZGVycygpIHtcblx0XHRyZXR1cm4gdGhpcy5idXN5Q29udHJvbGxlckNvdW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHJvb3RJdGVtcygpIHtcblx0XHRyZXR1cm4gdGhpcy5yb290cztcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldCBhbGwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SXRlcmF0b3IoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcm9vdElkcygpIHtcblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKHRoaXMucm9vdHMudmFsdWVzKCksIHIgPT4gci5pdGVtLmV4dElkKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBvbkJ1c3lQcm92aWRlcnNDaGFuZ2UgPSB0aGlzLmJ1c3lQcm92aWRlcnNDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHVyaUlkZW50aXR5U2VydmljZTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCBwcml2YXRlIHJlYWRvbmx5IGV4cGFuZEFjdHVhbDogKGlkOiBzdHJpbmcsIGxldmVsczogbnVtYmVyKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG5cdFx0c3VwZXIodXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGV4cGFuZCh0ZXN0SWQ6IHN0cmluZywgbGV2ZWxzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXN0ID0gdGhpcy5pdGVtcy5nZXQodGVzdElkKTtcblx0XHRpZiAoIXRlc3QpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHQvLyBzaW1wbGUgY2FjaGUgdG8gYXZvaWQgZHVwbGljYXRlL3VubmVjZXNzYXJ5IGV4cGFuc2lvbiBjYWxsc1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5leHBhbmRQcm9taXNlcy5nZXQodGVzdCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLnBlbmRpbmdMdmwgPj0gbGV2ZWxzKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcucHJvbTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9tID0gdGhpcy5leHBhbmRBY3R1YWwodGVzdC5pdGVtLmV4dElkLCBsZXZlbHMpO1xuXHRcdGNvbnN0IHJlY29yZCA9IHsgZG9uZUx2bDogZXhpc3RpbmcgPyBleGlzdGluZy5kb25lTHZsIDogLTEsIHBlbmRpbmdMdmw6IGxldmVscywgcHJvbSB9O1xuXHRcdHRoaXMuZXhwYW5kUHJvbWlzZXMuc2V0KHRlc3QsIHJlY29yZCk7XG5cblx0XHRyZXR1cm4gcHJvbS50aGVuKCgpID0+IHtcblx0XHRcdHJlY29yZC5kb25lTHZsID0gbGV2ZWxzO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Tm9kZUJ5SWQoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmdldChpZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXROb2RlQnlVcmwodXJpOiBVUkkpOiBJdGVyYWJsZTxJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbT4ge1xuXHRcdHJldHVybiB0aGlzLnRlc3RzQnlVcmwuZ2V0KHVyaSkgfHwgSXRlcmFibGUuZW1wdHkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldFJldml2ZXJEaWZmKCkge1xuXHRcdGNvbnN0IG9wczogVGVzdHNEaWZmID0gW3sgb3A6IFRlc3REaWZmT3BUeXBlLkluY3JlbWVudFBlbmRpbmdFeHRIb3N0cywgYW1vdW50OiB0aGlzLnBlbmRpbmdSb290Q291bnQgfV07XG5cblx0XHRjb25zdCBxdWV1ZSA9IFt0aGlzLnJvb3RJZHNdO1xuXHRcdHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcXVldWUucG9wKCkhKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zLmdldChjaGlsZCkhO1xuXHRcdFx0XHRvcHMucHVzaCh7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRjb250cm9sbGVySWQ6IGl0ZW0uY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdFx0ZXhwYW5kOiBpdGVtLmV4cGFuZCxcblx0XHRcdFx0XHRcdGl0ZW06IGl0ZW0uaXRlbSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRxdWV1ZS5wdXNoKGl0ZW0uY2hpbGRyZW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvcHM7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyB0aGUgZGlmZiB0byB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBhcHBseShkaWZmOiBUZXN0c0RpZmYpIHtcblx0XHRjb25zdCBwcmV2QnVzeSA9IHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudDtcblx0XHRzdXBlci5hcHBseShkaWZmKTtcblxuXHRcdGlmIChwcmV2QnVzeSAhPT0gdGhpcy5idXN5Q29udHJvbGxlckNvdW50KSB7XG5cdFx0XHR0aGlzLmJ1c3lQcm92aWRlcnNDaGFuZ2VFbWl0dGVyLmZpcmUodGhpcy5idXN5Q29udHJvbGxlckNvdW50KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgY29sbGVjdGlvbiwgYW5kIHJldHVybnMgYSBkaWZmIHRoYXQgYXBwbGllc1xuXHQgKiB0aGF0IGFjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBjbGVhcigpIHtcblx0XHRjb25zdCBvcHM6IFRlc3RzRGlmZiA9IFtdO1xuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiB0aGlzLnJvb3RzKSB7XG5cdFx0XHRvcHMucHVzaCh7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmUsIGl0ZW1JZDogcm9vdC5pdGVtLmV4dElkIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMucm9vdHMuY2xlYXIoKTtcblx0XHR0aGlzLml0ZW1zLmNsZWFyKCk7XG5cblx0XHRyZXR1cm4gb3BzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUl0ZW0oaW50ZXJuYWw6IEludGVybmFsVGVzdEl0ZW0pOiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSB7XG5cdFx0cmV0dXJuIHsgLi4uaW50ZXJuYWwsIGNoaWxkcmVuOiBuZXcgU2V0KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlQ29sbGVjdG9yOiBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbT4gPSB7XG5cdFx0YWRkOiBub2RlID0+IHtcblx0XHRcdGlmICghbm9kZS5pdGVtLnVyaSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHMgPSB0aGlzLnRlc3RzQnlVcmwuZ2V0KG5vZGUuaXRlbS51cmkpO1xuXHRcdFx0aWYgKCFzKSB7XG5cdFx0XHRcdHRoaXMudGVzdHNCeVVybC5zZXQobm9kZS5pdGVtLnVyaSwgbmV3IFNldChbbm9kZV0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHMuYWRkKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVtb3ZlOiBub2RlID0+IHtcblx0XHRcdGlmICghbm9kZS5pdGVtLnVyaSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHMgPSB0aGlzLnRlc3RzQnlVcmwuZ2V0KG5vZGUuaXRlbS51cmkpO1xuXHRcdFx0aWYgKCFzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cy5kZWxldGUobm9kZSk7XG5cdFx0XHRpZiAocy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMudGVzdHNCeVVybC5kZWxldGUobm9kZS5pdGVtLnVyaSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ2hhbmdlQ29sbGVjdG9yKCk6IEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yPEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbmdlQ29sbGVjdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSAqZ2V0SXRlcmF0b3IoKSB7XG5cdFx0Y29uc3QgcXVldWUgPSBuZXcgTGlua2VkTGlzdDxJdGVyYWJsZTxzdHJpbmc+PigpO1xuXHRcdHF1ZXVlLnB1c2godGhpcy5yb290SWRzKTtcblxuXHRcdHdoaWxlIChxdWV1ZS5zaXplID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0Tm9kZUJ5SWQoaWQpITtcblx0XHRcdFx0eWllbGQgbm9kZTtcblx0XHRcdFx0cXVldWUucHVzaChub2RlLmNoaWxkcmVuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUc1QixTQUFTLG1DQUF1SSxzQkFBaUM7QUFFMUssTUFBTSxpQ0FBaUMsa0NBQXNHO0FBQUEsRUFxQ25KLFlBQVksb0JBQTRELGNBQTZEO0FBQ3BJLFVBQU0sa0JBQWtCO0FBRCtDO0FBcEN4RSxTQUFRLGFBQWEsSUFBSSxZQUFnRDtBQUV6RSxTQUFRLDZCQUE2QixJQUFJLFFBQWdCO0FBQ3pELFNBQVEsaUJBQWlCLG9CQUFJLFFBSTFCO0FBMkJILFNBQWdCLHdCQUF3QixLQUFLLDJCQUEyQjtBQXdHeEUsU0FBaUIsa0JBQTZFO0FBQUEsTUFDN0YsS0FBSyxVQUFRO0FBQ1osWUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLO0FBQ25CO0FBQUEsUUFDRDtBQUVBLGNBQU0sSUFBSSxLQUFLLFdBQVcsSUFBSSxLQUFLLEtBQUssR0FBRztBQUMzQyxZQUFJLENBQUMsR0FBRztBQUNQLGVBQUssV0FBVyxJQUFJLEtBQUssS0FBSyxLQUFLLG9CQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUFBLFFBQ25ELE9BQU87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
