import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ListProjection } from "../../../browser/explorerProjections/listProjection.js";
import { TestId } from "../../../common/testId.js";
import { TestDiffOpType, TestItemExpandState } from "../../../common/testTypes.js";
import { TestTreeTestHarness } from "../testObjectTree.js";
import { TestTestItem } from "../../common/testStubs.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
suite("Workbench - Testing Explorer Hierarchal by Name Projection", () => {
  let harness;
  let onTestChanged;
  let resultsService;
  teardown(() => {
    harness.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    onTestChanged = new Emitter();
    resultsService = upcastPartial({
      onResultsChanged: Event.None,
      onTestChanged: onTestChanged.event,
      getStateById: () => void 0
    });
    harness = new TestTreeTestHarness((l) => new ListProjection({}, l, resultsService));
  });
  test("renders initial tree", () => {
    harness.flush();
    assert.deepStrictEqual(harness.tree.getRendered(), [
      { e: "aa" },
      { e: "ab" },
      { e: "b" }
    ]);
  });
  test("updates render if second test provider appears", async () => {
    harness.flush();
    harness.pushDiff({
      op: TestDiffOpType.Add,
      item: { controllerId: "ctrl2", expand: TestItemExpandState.Expanded, item: new TestTestItem(new TestId(["ctrl2"]), "root2").toTestItem() }
    }, {
      op: TestDiffOpType.Add,
      item: { controllerId: "ctrl2", expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(["ctrl2", "id-c"]), "c", void 0).toTestItem() }
    });
    assert.deepStrictEqual(harness.flush(), [
      { e: "root", children: [{ e: "aa" }, { e: "ab" }, { e: "b" }] },
      { e: "root2", children: [{ e: "c" }] }
    ]);
  });
  test("updates nodes if they add children", async () => {
    harness.flush();
    harness.c.root.children.get("id-a").children.add(new TestTestItem(new TestId(["ctrlId", "id-a", "id-ac"]), "ac"));
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "ab" },
      { e: "ac" },
      { e: "b" }
    ]);
  });
  test("updates nodes if they remove children", async () => {
    harness.flush();
    harness.c.root.children.get("id-a").children.delete("id-ab");
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "b" }
    ]);
  });
  test("swaps when node is no longer leaf", async () => {
    harness.flush();
    harness.c.root.children.get("id-b").children.add(new TestTestItem(new TestId(["ctrlId", "id-b", "id-ba"]), "ba"));
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "ab" },
      { e: "ba" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGJyb3dzZXJcXGV4cGxvcmVyUHJvamVjdGlvbnNcXG5hbWVQcm9qZWN0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTGlzdFByb2plY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2V4cGxvcmVyUHJvamVjdGlvbnMvbGlzdFByb2plY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBUZXN0UmVzdWx0SXRlbUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0LmpzJztcbmltcG9ydCB7IFRlc3REaWZmT3BUeXBlLCBUZXN0SXRlbUV4cGFuZFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0VHJlZVRlc3RIYXJuZXNzIH0gZnJvbSAnLi4vdGVzdE9iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgVGVzdFRlc3RJdGVtIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RTdHVicy5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXN0aW5nIEV4cGxvcmVyIEhpZXJhcmNoYWwgYnkgTmFtZSBQcm9qZWN0aW9uJywgKCkgPT4ge1xuXHRsZXQgaGFybmVzczogVGVzdFRyZWVUZXN0SGFybmVzczxMaXN0UHJvamVjdGlvbj47XG5cdGxldCBvblRlc3RDaGFuZ2VkOiBFbWl0dGVyPFRlc3RSZXN1bHRJdGVtQ2hhbmdlPjtcblx0bGV0IHJlc3VsdHNTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2U7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGhhcm5lc3MuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0b25UZXN0Q2hhbmdlZCA9IG5ldyBFbWl0dGVyKCk7XG5cdFx0cmVzdWx0c1NlcnZpY2UgPSB1cGNhc3RQYXJ0aWFsPElUZXN0UmVzdWx0U2VydmljZT4oe1xuXHRcdFx0b25SZXN1bHRzQ2hhbmdlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uVGVzdENoYW5nZWQ6IG9uVGVzdENoYW5nZWQuZXZlbnQsXG5cdFx0XHRnZXRTdGF0ZUJ5SWQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGhhcm5lc3MgPSBuZXcgVGVzdFRyZWVUZXN0SGFybmVzcyhsID0+IG5ldyBMaXN0UHJvamVjdGlvbih7fSwgbCwgcmVzdWx0c1NlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBpbml0aWFsIHRyZWUnLCAoKSA9PiB7XG5cdFx0aGFybmVzcy5mbHVzaCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFybmVzcy50cmVlLmdldFJlbmRlcmVkKCksIFtcblx0XHRcdHsgZTogJ2FhJyB9LCB7IGU6ICdhYicgfSwgeyBlOiAnYicgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHJlbmRlciBpZiBzZWNvbmQgdGVzdCBwcm92aWRlciBhcHBlYXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGhhcm5lc3MuZmx1c2goKTtcblx0XHRoYXJuZXNzLnB1c2hEaWZmKHtcblx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmwyJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGVkLCBpdGVtOiBuZXcgVGVzdFRlc3RJdGVtKG5ldyBUZXN0SWQoWydjdHJsMiddKSwgJ3Jvb3QyJykudG9UZXN0SXRlbSgpIH0sXG5cdFx0fSwge1xuXHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybDInLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSwgaXRlbTogbmV3IFRlc3RUZXN0SXRlbShuZXcgVGVzdElkKFsnY3RybDInLCAnaWQtYyddKSwgJ2MnLCB1bmRlZmluZWQpLnRvVGVzdEl0ZW0oKSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLmZsdXNoKCksIFtcblx0XHRcdHsgZTogJ3Jvb3QnLCBjaGlsZHJlbjogW3sgZTogJ2FhJyB9LCB7IGU6ICdhYicgfSwgeyBlOiAnYicgfV0gfSxcblx0XHRcdHsgZTogJ3Jvb3QyJywgY2hpbGRyZW46IFt7IGU6ICdjJyB9XSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIG5vZGVzIGlmIHRoZXkgYWRkIGNoaWxkcmVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGhhcm5lc3MuZmx1c2goKTtcblxuXHRcdGhhcm5lc3MuYy5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5hZGQobmV3IFRlc3RUZXN0SXRlbShuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnLCAnaWQtYWMnXSksICdhYycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFybmVzcy5mbHVzaCgpLCBbXG5cdFx0XHR7IGU6ICdhYScgfSxcblx0XHRcdHsgZTogJ2FiJyB9LFxuXHRcdFx0eyBlOiAnYWMnIH0sXG5cdFx0XHR7IGU6ICdiJyB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgbm9kZXMgaWYgdGhleSByZW1vdmUgY2hpbGRyZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0aGFybmVzcy5mbHVzaCgpO1xuXHRcdGhhcm5lc3MuYy5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5kZWxldGUoJ2lkLWFiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuZmx1c2goKSwgW1xuXHRcdFx0eyBlOiAnYWEnIH0sXG5cdFx0XHR7IGU6ICdiJyB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N3YXBzIHdoZW4gbm9kZSBpcyBubyBsb25nZXIgbGVhZicsIGFzeW5jICgpID0+IHtcblx0XHRoYXJuZXNzLmZsdXNoKCk7XG5cdFx0aGFybmVzcy5jLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykhLmNoaWxkcmVuLmFkZChuZXcgVGVzdFRlc3RJdGVtKG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYicsICdpZC1iYSddKSwgJ2JhJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLmZsdXNoKCksIFtcblx0XHRcdHsgZTogJ2FhJyB9LFxuXHRcdFx0eyBlOiAnYWInIH0sXG5cdFx0XHR7IGU6ICdiYScgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWM7QUFFdkIsU0FBUyxnQkFBZ0IsMkJBQTJCO0FBQ3BELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBRzlCLE1BQU0sOERBQThELE1BQU07QUFDekUsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosV0FBUyxNQUFNO0FBQ2QsWUFBUSxRQUFRO0FBQUEsRUFDakIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxRQUFNLE1BQU07QUFDWCxvQkFBZ0IsSUFBSSxRQUFRO0FBQzVCLHFCQUFpQixjQUFrQztBQUFBLE1BQ2xELGtCQUFrQixNQUFNO0FBQUEsTUFDeEIsZUFBZSxjQUFjO0FBQUEsTUFDN0IsY0FBYyxNQUFNO0FBQUEsSUFDckIsQ0FBQztBQUVELGNBQVUsSUFBSSxvQkFBb0IsT0FBSyxJQUFJLGVBQWUsQ0FBQyxHQUFHLEdBQUcsY0FBYyxDQUFDO0FBQUEsRUFDakYsQ0FBQztBQUVELE9BQUssd0JBQXdCLE1BQU07QUFDbEMsWUFBUSxNQUFNO0FBQ2QsV0FBTyxnQkFBZ0IsUUFBUSxLQUFLLFlBQVksR0FBRztBQUFBLE1BQ2xELEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFBRyxFQUFFLEdBQUcsS0FBSztBQUFBLE1BQUcsRUFBRSxHQUFHLElBQUk7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrREFBa0QsWUFBWTtBQUNsRSxZQUFRLE1BQU07QUFDZCxZQUFRLFNBQVM7QUFBQSxNQUNoQixJQUFJLGVBQWU7QUFBQSxNQUNuQixNQUFNLEVBQUUsY0FBYyxTQUFTLFFBQVEsb0JBQW9CLFVBQVUsTUFBTSxJQUFJLGFBQWEsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsT0FBTyxFQUFFLFdBQVcsRUFBRTtBQUFBLElBQzFJLEdBQUc7QUFBQSxNQUNGLElBQUksZUFBZTtBQUFBLE1BQ25CLE1BQU0sRUFBRSxjQUFjLFNBQVMsUUFBUSxvQkFBb0IsZUFBZSxNQUFNLElBQUksYUFBYSxJQUFJLE9BQU8sQ0FBQyxTQUFTLE1BQU0sQ0FBQyxHQUFHLEtBQUssTUFBUyxFQUFFLFdBQVcsRUFBRTtBQUFBLElBQzlKLENBQUM7QUFFRCxXQUFPLGdCQUFnQixRQUFRLE1BQU0sR0FBRztBQUFBLE1BQ3ZDLEVBQUUsR0FBRyxRQUFRLFVBQVUsQ0FBQyxFQUFFLEdBQUcsS0FBSyxHQUFHLEVBQUUsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDOUQsRUFBRSxHQUFHLFNBQVMsVUFBVSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRTtBQUFBLElBQ3RDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNDQUFzQyxZQUFZO0FBQ3RELFlBQVEsTUFBTTtBQUVkLFlBQVEsRUFBRSxLQUFLLFNBQVMsSUFBSSxNQUFNLEVBQUcsU0FBUyxJQUFJLElBQUksYUFBYSxJQUFJLE9BQU8sQ0FBQyxVQUFVLFFBQVEsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBRWpILFdBQU8sZ0JBQWdCLFFBQVEsTUFBTSxHQUFHO0FBQUEsTUFDdkMsRUFBRSxHQUFHLEtBQUs7QUFBQSxNQUNWLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFDVixFQUFFLEdBQUcsS0FBSztBQUFBLE1BQ1YsRUFBRSxHQUFHLElBQUk7QUFBQSxJQUNWLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxZQUFZO0FBQ3pELFlBQVEsTUFBTTtBQUNkLFlBQVEsRUFBRSxLQUFLLFNBQVMsSUFBSSxNQUFNLEVBQUcsU0FBUyxPQUFPLE9BQU87QUFFNUQsV0FBTyxnQkFBZ0IsUUFBUSxNQUFNLEdBQUc7QUFBQSxNQUN2QyxFQUFFLEdBQUcsS0FBSztBQUFBLE1BQ1YsRUFBRSxHQUFHLElBQUk7QUFBQSxJQUNWLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFlBQVEsTUFBTTtBQUNkLFlBQVEsRUFBRSxLQUFLLFNBQVMsSUFBSSxNQUFNLEVBQUcsU0FBUyxJQUFJLElBQUksYUFBYSxJQUFJLE9BQU8sQ0FBQyxVQUFVLFFBQVEsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBRWpILFdBQU8sZ0JBQWdCLFFBQVEsTUFBTSxHQUFHO0FBQUEsTUFDdkMsRUFBRSxHQUFHLEtBQUs7QUFBQSxNQUNWLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFDVixFQUFFLEdBQUcsS0FBSztBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
