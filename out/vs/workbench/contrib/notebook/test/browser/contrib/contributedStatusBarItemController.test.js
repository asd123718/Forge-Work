import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ContributedStatusBarItemController } from "../../../browser/contrib/cellStatusBar/contributedStatusBarItemController.js";
import { INotebookCellStatusBarService } from "../../../common/notebookCellStatusBarService.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { withTestNotebook } from "../testNotebookEditor.js";
suite("Notebook Statusbar", () => {
  const testDisposables = new DisposableStore();
  teardown(() => {
    testDisposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Calls item provider", async function() {
    await withTestNotebook(
      [
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header a", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const cellStatusbarSvc = accessor.get(INotebookCellStatusBarService);
        testDisposables.add(accessor.createInstance(ContributedStatusBarItemController, editor));
        const provider = testDisposables.add(new class extends Disposable {
          constructor() {
            super(...arguments);
            this.provideCalls = 0;
            this._onProvideCalled = this._register(new Emitter());
            this.onProvideCalled = this._onProvideCalled.event;
            this._onDidChangeStatusBarItems = this._register(new Emitter());
            this.onDidChangeStatusBarItems = this._onDidChangeStatusBarItems.event;
            this.viewType = editor.textModel.viewType;
          }
          async provideCellStatusBarItems(_uri, index, _token) {
            if (index === 0) {
              this.provideCalls++;
              this._onProvideCalled.fire(this.provideCalls);
            }
            return { items: [] };
          }
        }());
        const providePromise1 = asPromise(provider.onProvideCalled, "registering provider");
        testDisposables.add(cellStatusbarSvc.registerCellStatusBarItemProvider(provider));
        assert.strictEqual(await providePromise1, 1, "should call provider on registration");
        const providePromise2 = asPromise(provider.onProvideCalled, "updating metadata");
        const cell0 = editor.textModel.cells[0];
        cell0.metadata = { ...cell0.metadata, ...{ newMetadata: true } };
        assert.strictEqual(await providePromise2, 2, "should call provider on updating metadata");
        const providePromise3 = asPromise(provider.onProvideCalled, "changing cell language");
        cell0.language = "newlanguage";
        assert.strictEqual(await providePromise3, 3, "should call provider on changing language");
        const providePromise4 = asPromise(provider.onProvideCalled, "manually firing change event");
        provider._onDidChangeStatusBarItems.fire();
        assert.strictEqual(await providePromise4, 4, "should call provider on manually firing change event");
      }
    );
  });
});
async function asPromise(event, message) {
  const error = new Error("asPromise TIMEOUT reached: " + message);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      sub.dispose();
      reject(error);
    }, 1e3);
    const sub = event((e) => {
      clearTimeout(handle);
      sub.dispose();
      resolve(e);
    });
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjb250cmliXFxjb250cmlidXRlZFN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRlZFN0YXR1c0Jhckl0ZW1Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cmliL2NlbGxTdGF0dXNCYXIvY29udHJpYnV0ZWRTdGF0dXNCYXJJdGVtQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2sgU3RhdHVzYmFyJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRlc3REaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdDYWxscyBpdGVtIHByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBjZWxsU3RhdHVzYmFyU3ZjID0gYWNjZXNzb3IuZ2V0KElOb3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlKTtcblx0XHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5jcmVhdGVJbnN0YW5jZShDb250cmlidXRlZFN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLCBlZGl0b3IpKTtcblxuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IGNsYXNzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRcdHByaXZhdGUgcHJvdmlkZUNhbGxzID0gMDtcblxuXHRcdFx0XHRcdHByaXZhdGUgX29uUHJvdmlkZUNhbGxlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdFx0cHVibGljIG9uUHJvdmlkZUNhbGxlZCA9IHRoaXMuX29uUHJvdmlkZUNhbGxlZC5ldmVudDtcblxuXHRcdFx0XHRcdHB1YmxpYyBfb25EaWRDaGFuZ2VTdGF0dXNCYXJJdGVtcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0XHRcdHB1YmxpYyBvbkRpZENoYW5nZVN0YXR1c0Jhckl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXNCYXJJdGVtcy5ldmVudDtcblxuXHRcdFx0XHRcdGFzeW5jIHByb3ZpZGVDZWxsU3RhdHVzQmFySXRlbXMoX3VyaTogVVJJLCBpbmRleDogbnVtYmVyLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5wcm92aWRlQ2FsbHMrKztcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25Qcm92aWRlQ2FsbGVkLmZpcmUodGhpcy5wcm92aWRlQ2FsbHMpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR2aWV3VHlwZSA9IGVkaXRvci50ZXh0TW9kZWwudmlld1R5cGU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBwcm92aWRlUHJvbWlzZTEgPSBhc1Byb21pc2UocHJvdmlkZXIub25Qcm92aWRlQ2FsbGVkLCAncmVnaXN0ZXJpbmcgcHJvdmlkZXInKTtcblx0XHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjZWxsU3RhdHVzYmFyU3ZjLnJlZ2lzdGVyQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcihwcm92aWRlcikpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcHJvdmlkZVByb21pc2UxLCAxLCAnc2hvdWxkIGNhbGwgcHJvdmlkZXIgb24gcmVnaXN0cmF0aW9uJyk7XG5cblx0XHRcdFx0Y29uc3QgcHJvdmlkZVByb21pc2UyID0gYXNQcm9taXNlKHByb3ZpZGVyLm9uUHJvdmlkZUNhbGxlZCwgJ3VwZGF0aW5nIG1ldGFkYXRhJyk7XG5cdFx0XHRcdGNvbnN0IGNlbGwwID0gZWRpdG9yLnRleHRNb2RlbC5jZWxsc1swXTtcblx0XHRcdFx0Y2VsbDAubWV0YWRhdGEgPSB7IC4uLmNlbGwwLm1ldGFkYXRhLCAuLi57IG5ld01ldGFkYXRhOiB0cnVlIH0gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHByb3ZpZGVQcm9taXNlMiwgMiwgJ3Nob3VsZCBjYWxsIHByb3ZpZGVyIG9uIHVwZGF0aW5nIG1ldGFkYXRhJyk7XG5cblx0XHRcdFx0Y29uc3QgcHJvdmlkZVByb21pc2UzID0gYXNQcm9taXNlKHByb3ZpZGVyLm9uUHJvdmlkZUNhbGxlZCwgJ2NoYW5naW5nIGNlbGwgbGFuZ3VhZ2UnKTtcblx0XHRcdFx0Y2VsbDAubGFuZ3VhZ2UgPSAnbmV3bGFuZ3VhZ2UnO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcHJvdmlkZVByb21pc2UzLCAzLCAnc2hvdWxkIGNhbGwgcHJvdmlkZXIgb24gY2hhbmdpbmcgbGFuZ3VhZ2UnKTtcblxuXHRcdFx0XHRjb25zdCBwcm92aWRlUHJvbWlzZTQgPSBhc1Byb21pc2UocHJvdmlkZXIub25Qcm92aWRlQ2FsbGVkLCAnbWFudWFsbHkgZmlyaW5nIGNoYW5nZSBldmVudCcpO1xuXHRcdFx0XHRwcm92aWRlci5fb25EaWRDaGFuZ2VTdGF0dXNCYXJJdGVtcy5maXJlKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwcm92aWRlUHJvbWlzZTQsIDQsICdzaG91bGQgY2FsbCBwcm92aWRlciBvbiBtYW51YWxseSBmaXJpbmcgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0XHR9KTtcblx0fSk7XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gYXNQcm9taXNlPFQ+KGV2ZW50OiBFdmVudDxUPiwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxUPiB7XG5cdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdhc1Byb21pc2UgVElNRU9VVCByZWFjaGVkOiAnICsgbWVzc2FnZSk7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHR9LCAxMDAwKTtcblxuXHRcdGNvbnN0IHN1YiA9IGV2ZW50KGUgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZShlKTtcblx0XHR9KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVC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
