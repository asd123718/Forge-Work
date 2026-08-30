import { ObjectTree } from "../../../../../base/browser/ui/tree/objectTree.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { TestItemTreeElement, TestTreeErrorMessage } from "../../browser/explorerProjections/index.js";
import { MainThreadTestCollection } from "../../common/mainThreadTestCollection.js";
import { testStubs } from "../common/testStubs.js";
const element = document.createElement("div");
element.style.height = "1000px";
element.style.width = "200px";
class TestObjectTree extends ObjectTree {
  constructor(serializer, sorter) {
    super(
      "test",
      element,
      {
        getHeight: () => 20,
        getTemplateId: () => "default"
      },
      [
        {
          disposeTemplate: ({ store }) => store.dispose(),
          renderElement: ({ depth, element: element2 }, _index, { container, store }) => {
            const render = () => {
              container.textContent = `${depth}:${serializer(element2)}`;
              Object.assign(container.dataset, element2);
            };
            render();
            if (element2 instanceof TestItemTreeElement) {
              store.add(element2.onChange(render));
            }
          },
          disposeElement: (_el, _index, { store }) => store.clear(),
          renderTemplate: (container) => ({ container, store: new DisposableStore() }),
          templateId: "default"
        }
      ],
      {
        sorter: sorter ?? {
          compare: (a, b) => serializer(a).localeCompare(serializer(b))
        }
      }
    );
    this.layout(1e3, 200);
  }
  getRendered(getProperty) {
    const elements = element.querySelectorAll(".monaco-tl-contents");
    const sorted = [...elements].sort((a, b) => pos(a) - pos(b));
    const chain = [{ e: "", children: [] }];
    for (const element2 of sorted) {
      const [depthStr, label] = element2.textContent.split(":");
      const depth = Number(depthStr);
      const parent = chain[depth - 1];
      const child = { e: label };
      if (getProperty) {
        child.data = element2.dataset[getProperty];
      }
      parent.children = parent.children?.concat(child) ?? [child];
      chain[depth] = child;
    }
    return chain[0].children;
  }
}
const pos = (element2) => Number(element2.parentElement.parentElement.getAttribute("aria-posinset"));
class ByLabelTreeSorter {
  compare(a, b) {
    if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
      return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
    }
    if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
      const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
      if (delta !== 0) {
        return delta;
      }
    }
    return (a.test.item.sortText || a.test.item.label).localeCompare(b.test.item.sortText || b.test.item.label);
  }
}
class TestTreeTestHarness extends Disposable {
  constructor(makeTree, c = testStubs.nested()) {
    super();
    this.c = c;
    this.onDiff = this._register(new Emitter());
    this.onFolderChange = this._register(new Emitter());
    this.isProcessingDiff = false;
    this._register(c);
    this._register(this.c.onDidGenerateDiff((d) => this.c.setDiff(
      d
      /* don't clear during testing */
    )));
    const collection = new MainThreadTestCollection({ asCanonicalUri: (u) => u }, (testId, levels) => {
      this.c.expand(testId, levels);
      if (!this.isProcessingDiff) {
        this.onDiff.fire(this.c.collectDiff());
      }
      return Promise.resolve();
    });
    this._register(this.onDiff.event((diff) => collection.apply(diff)));
    this.projection = this._register(makeTree({
      collection,
      onDidProcessDiff: this.onDiff.event
    }));
    const sorter = new ByLabelTreeSorter();
    this.tree = this._register(new TestObjectTree((t) => "test" in t ? t.test.item.label : t.message.toString(), sorter));
    this._register(this.tree.onDidChangeCollapseState((evt) => {
      if (evt.node.element instanceof TestItemTreeElement) {
        this.projection.expandElement(evt.node.element, evt.deep ? Infinity : 0);
      }
    }));
  }
  pushDiff(...diff) {
    this.onDiff.fire(diff);
  }
  flush() {
    this.isProcessingDiff = true;
    while (this.c.currentDiff.length) {
      this.onDiff.fire(this.c.collectDiff());
    }
    this.isProcessingDiff = false;
    this.projection.applyTo(this.tree);
    return this.tree.getRendered();
  }
}
export {
  TestTreeTestHarness
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGJyb3dzZXJcXHRlc3RPYmplY3RUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RUcmVlUHJvamVjdGlvbiwgVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIFRlc3RJdGVtVHJlZUVsZW1lbnQsIFRlc3RUcmVlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leHBsb3JlclByb2plY3Rpb25zL2luZGV4LmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tYWluVGhyZWFkVGVzdENvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdHNEaWZmLCBUZXN0c0RpZmZPcCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRlc3RTdHVicyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0U3R1YnMuanMnO1xuaW1wb3J0IHsgSVRyZWVSZW5kZXJlciwgSVRyZWVTb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcblxudHlwZSBTZXJpYWxpemVkVHJlZSA9IHsgZTogc3RyaW5nOyBjaGlsZHJlbj86IFNlcmlhbGl6ZWRUcmVlW107IGRhdGE/OiBzdHJpbmcgfTtcblxuY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwMHB4JztcbmVsZW1lbnQuc3R5bGUud2lkdGggPSAnMjAwcHgnO1xuXG5jbGFzcyBUZXN0T2JqZWN0VHJlZTxUPiBleHRlbmRzIE9iamVjdFRyZWU8VCwgYW55PiB7XG5cdGNvbnN0cnVjdG9yKHNlcmlhbGl6ZXI6IChub2RlOiBUKSA9PiBzdHJpbmcsIHNvcnRlcj86IElUcmVlU29ydGVyPFQ+KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRIZWlnaHQ6ICgpID0+IDIwLFxuXHRcdFx0XHRnZXRUZW1wbGF0ZUlkOiAoKSA9PiAnZGVmYXVsdCdcblx0XHRcdH0sXG5cdFx0XHRbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaXNwb3NlVGVtcGxhdGU6ICh7IHN0b3JlIH0pID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0XHRcdFx0XHRyZW5kZXJFbGVtZW50OiAoeyBkZXB0aCwgZWxlbWVudCB9LCBfaW5kZXgsIHsgY29udGFpbmVyLCBzdG9yZSB9KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCByZW5kZXIgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci50ZXh0Q29udGVudCA9IGAke2RlcHRofToke3NlcmlhbGl6ZXIoZWxlbWVudCl9YDtcblx0XHRcdFx0XHRcdFx0T2JqZWN0LmFzc2lnbihjb250YWluZXIuZGF0YXNldCwgZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0cmVuZGVyKCk7XG5cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQoZWxlbWVudC5vbkNoYW5nZShyZW5kZXIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2VFbGVtZW50OiAoX2VsLCBfaW5kZXgsIHsgc3RvcmUgfSkgPT4gc3RvcmUuY2xlYXIoKSxcblx0XHRcdFx0XHRyZW5kZXJUZW1wbGF0ZTogY29udGFpbmVyID0+ICh7IGNvbnRhaW5lciwgc3RvcmU6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9KSxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiAnZGVmYXVsdCdcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVRyZWVSZW5kZXJlcjxULCBhbnksIHsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTsgY29udGFpbmVyOiBIVE1MRWxlbWVudCB9PlxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0c29ydGVyOiBzb3J0ZXIgPz8ge1xuXHRcdFx0XHRcdGNvbXBhcmU6IChhLCBiKSA9PiBzZXJpYWxpemVyKGEpLmxvY2FsZUNvbXBhcmUoc2VyaWFsaXplcihiKSlcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5sYXlvdXQoMTAwMCwgMjAwKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZW5kZXJlZChnZXRQcm9wZXJ0eT86IHN0cmluZykge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLm1vbmFjby10bC1jb250ZW50cycpO1xuXHRcdGNvbnN0IHNvcnRlZCA9IFsuLi5lbGVtZW50c10uc29ydCgoYSwgYikgPT4gcG9zKGEpIC0gcG9zKGIpKTtcblx0XHRjb25zdCBjaGFpbjogU2VyaWFsaXplZFRyZWVbXSA9IFt7IGU6ICcnLCBjaGlsZHJlbjogW10gfV07XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHNvcnRlZCkge1xuXHRcdFx0Y29uc3QgW2RlcHRoU3RyLCBsYWJlbF0gPSBlbGVtZW50LnRleHRDb250ZW50IS5zcGxpdCgnOicpO1xuXHRcdFx0Y29uc3QgZGVwdGggPSBOdW1iZXIoZGVwdGhTdHIpO1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gY2hhaW5bZGVwdGggLSAxXTtcblx0XHRcdGNvbnN0IGNoaWxkOiBTZXJpYWxpemVkVHJlZSA9IHsgZTogbGFiZWwgfTtcblx0XHRcdGlmIChnZXRQcm9wZXJ0eSkge1xuXHRcdFx0XHRjaGlsZC5kYXRhID0gZWxlbWVudC5kYXRhc2V0W2dldFByb3BlcnR5XTtcblx0XHRcdH1cblx0XHRcdHBhcmVudC5jaGlsZHJlbiA9IHBhcmVudC5jaGlsZHJlbj8uY29uY2F0KGNoaWxkKSA/PyBbY2hpbGRdO1xuXHRcdFx0Y2hhaW5bZGVwdGhdID0gY2hpbGQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNoYWluWzBdLmNoaWxkcmVuO1xuXHR9XG59XG5cbmNvbnN0IHBvcyA9IChlbGVtZW50OiBFbGVtZW50KSA9PiBOdW1iZXIoZWxlbWVudC5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50IS5nZXRBdHRyaWJ1dGUoJ2FyaWEtcG9zaW5zZXQnKSk7XG5cblxuY2xhc3MgQnlMYWJlbFRyZWVTb3J0ZXIgaW1wbGVtZW50cyBJVHJlZVNvcnRlcjxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudD4ge1xuXHRwdWJsaWMgY29tcGFyZShhOiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCwgYjogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGlmIChhIGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2UgfHwgYiBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gKGEgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSA/IC0xIDogMCkgKyAoYiBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlID8gMSA6IDApO1xuXHRcdH1cblxuXHRcdGlmIChhIGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCAmJiBiIGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCAmJiBhLnRlc3QuaXRlbS51cmkgJiYgYi50ZXN0Lml0ZW0udXJpICYmIGEudGVzdC5pdGVtLnVyaS50b1N0cmluZygpID09PSBiLnRlc3QuaXRlbS51cmkudG9TdHJpbmcoKSAmJiBhLnRlc3QuaXRlbS5yYW5nZSAmJiBiLnRlc3QuaXRlbS5yYW5nZSkge1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBhLnRlc3QuaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSBiLnRlc3QuaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRpZiAoZGVsdGEgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGRlbHRhO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAoYS50ZXN0Lml0ZW0uc29ydFRleHQgfHwgYS50ZXN0Lml0ZW0ubGFiZWwpLmxvY2FsZUNvbXBhcmUoYi50ZXN0Lml0ZW0uc29ydFRleHQgfHwgYi50ZXN0Lml0ZW0ubGFiZWwpO1xuXHR9XG59XG5cbi8vIG5hbWVzIGFyZSBoYXJkXG5leHBvcnQgY2xhc3MgVGVzdFRyZWVUZXN0SGFybmVzczxUIGV4dGVuZHMgSVRlc3RUcmVlUHJvamVjdGlvbiA9IElUZXN0VHJlZVByb2plY3Rpb24+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWZmID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVzdHNEaWZmPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRm9sZGVyQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHByaXZhdGUgaXNQcm9jZXNzaW5nRGlmZiA9IGZhbHNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvamVjdGlvbjogVDtcblx0cHVibGljIHJlYWRvbmx5IHRyZWU6IFRlc3RPYmplY3RUcmVlPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PjtcblxuXHRjb25zdHJ1Y3RvcihtYWtlVHJlZTogKGxpc3RlbmVyOiBJVGVzdFNlcnZpY2UpID0+IFQsIHB1YmxpYyByZWFkb25seSBjID0gdGVzdFN0dWJzLm5lc3RlZCgpKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmMub25EaWRHZW5lcmF0ZURpZmYoZCA9PiB0aGlzLmMuc2V0RGlmZihkIC8qIGRvbid0IGNsZWFyIGR1cmluZyB0ZXN0aW5nICovKSkpO1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24oeyBhc0Nhbm9uaWNhbFVyaTogdSA9PiB1IH0sICh0ZXN0SWQsIGxldmVscykgPT4ge1xuXHRcdFx0dGhpcy5jLmV4cGFuZCh0ZXN0SWQsIGxldmVscyk7XG5cdFx0XHRpZiAoIXRoaXMuaXNQcm9jZXNzaW5nRGlmZikge1xuXHRcdFx0XHR0aGlzLm9uRGlmZi5maXJlKHRoaXMuYy5jb2xsZWN0RGlmZigpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlmZi5ldmVudChkaWZmID0+IGNvbGxlY3Rpb24uYXBwbHkoZGlmZikpKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHRoaXMucHJvamVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG1ha2VUcmVlKHtcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRvbkRpZFByb2Nlc3NEaWZmOiB0aGlzLm9uRGlmZi5ldmVudCxcblx0XHR9IGFzIGFueSkpO1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBCeUxhYmVsVHJlZVNvcnRlcigpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXN0T2JqZWN0VHJlZSh0ID0+ICd0ZXN0JyBpbiB0ID8gdC50ZXN0Lml0ZW0ubGFiZWwgOiB0Lm1lc3NhZ2UudG9TdHJpbmcoKSwgc29ydGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShldnQgPT4ge1xuXHRcdFx0aWYgKGV2dC5ub2RlLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucHJvamVjdGlvbi5leHBhbmRFbGVtZW50KGV2dC5ub2RlLmVsZW1lbnQsIGV2dC5kZWVwID8gSW5maW5pdHkgOiAwKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgcHVzaERpZmYoLi4uZGlmZjogVGVzdHNEaWZmT3BbXSkge1xuXHRcdHRoaXMub25EaWZmLmZpcmUoZGlmZik7XG5cdH1cblxuXHRwdWJsaWMgZmx1c2goKSB7XG5cdFx0dGhpcy5pc1Byb2Nlc3NpbmdEaWZmID0gdHJ1ZTtcblx0XHR3aGlsZSAodGhpcy5jLmN1cnJlbnREaWZmLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5vbkRpZmYuZmlyZSh0aGlzLmMuY29sbGVjdERpZmYoKSk7XG5cdFx0fVxuXHRcdHRoaXMuaXNQcm9jZXNzaW5nRGlmZiA9IGZhbHNlO1xuXG5cdFx0dGhpcy5wcm9qZWN0aW9uLmFwcGx5VG8odGhpcy50cmVlKTtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmdldFJlbmRlcmVkKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBRTVDLFNBQXVELHFCQUFxQiw0QkFBNEI7QUFDeEcsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUyxpQkFBaUI7QUFLMUIsTUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFFBQVEsTUFBTSxTQUFTO0FBQ3ZCLFFBQVEsTUFBTSxRQUFRO0FBRXRCLE1BQU0sdUJBQTBCLFdBQW1CO0FBQUEsRUFDbEQsWUFBWSxZQUFpQyxRQUF5QjtBQUNyRTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsV0FBVyxNQUFNO0FBQUEsUUFDakIsZUFBZSxNQUFNO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFVBQ0MsaUJBQWlCLENBQUMsRUFBRSxNQUFNLE1BQU0sTUFBTSxRQUFRO0FBQUEsVUFDOUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxTQUFBQSxTQUFRLEdBQUcsUUFBUSxFQUFFLFdBQVcsTUFBTSxNQUFNO0FBQ3BFLGtCQUFNLFNBQVMsTUFBTTtBQUNwQix3QkFBVSxjQUFjLEdBQUcsS0FBSyxJQUFJLFdBQVdBLFFBQU8sQ0FBQztBQUN2RCxxQkFBTyxPQUFPLFVBQVUsU0FBU0EsUUFBTztBQUFBLFlBQ3pDO0FBQ0EsbUJBQU87QUFFUCxnQkFBSUEsb0JBQW1CLHFCQUFxQjtBQUMzQyxvQkFBTSxJQUFJQSxTQUFRLFNBQVMsTUFBTSxDQUFDO0FBQUEsWUFDbkM7QUFBQSxVQUNEO0FBQUEsVUFD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
