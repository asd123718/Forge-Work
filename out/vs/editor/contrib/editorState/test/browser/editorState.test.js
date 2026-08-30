import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { Selection } from "../../../../common/core/selection.js";
import { CodeEditorStateFlag, EditorState } from "../../browser/editorState.js";
suite("Editor Core - Editor State", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const allFlags = CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Position | CodeEditorStateFlag.Scroll;
  test("empty editor state should be valid", () => {
    const result = validate({}, {});
    assert.strictEqual(result, true);
  });
  test("different model URIs should be invalid", () => {
    const result = validate(
      { model: { uri: URI.parse("http://test1") } },
      { model: { uri: URI.parse("http://test2") } }
    );
    assert.strictEqual(result, false);
  });
  test("different model versions should be invalid", () => {
    const result = validate(
      { model: { version: 1 } },
      { model: { version: 2 } }
    );
    assert.strictEqual(result, false);
  });
  test("different positions should be invalid", () => {
    const result = validate(
      { position: new Position(1, 2) },
      { position: new Position(2, 3) }
    );
    assert.strictEqual(result, false);
  });
  test("different selections should be invalid", () => {
    const result = validate(
      { selection: new Selection(1, 2, 3, 4) },
      { selection: new Selection(5, 2, 3, 4) }
    );
    assert.strictEqual(result, false);
  });
  test("different scroll positions should be invalid", () => {
    const result = validate(
      { scroll: { left: 1, top: 2 } },
      { scroll: { left: 3, top: 2 } }
    );
    assert.strictEqual(result, false);
  });
  function validate(source, target) {
    const sourceEditor = createEditor(source), targetEditor = createEditor(target);
    const result = new EditorState(sourceEditor, allFlags).validate(targetEditor);
    return result;
  }
  function createEditor({ model, position, selection, scroll } = {}) {
    const mappedModel = model ? { uri: model.uri ? model.uri : URI.parse("http://dummy.org"), getVersionId: () => model.version } : null;
    return {
      // eslint-disable-next-line local/code-no-any-casts
      getModel: () => mappedModel,
      getPosition: () => position,
      getSelection: () => selection,
      getScrollLeft: () => scroll && scroll.left,
      getScrollTop: () => scroll && scroll.top
    };
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGVkaXRvclN0YXRlXFx0ZXN0XFxicm93c2VyXFxlZGl0b3JTdGF0ZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yU3RhdGUuanMnO1xuXG5pbnRlcmZhY2UgSVN0dWJFZGl0b3JTdGF0ZSB7XG5cdG1vZGVsPzogeyB1cmk/OiBVUkk7IHZlcnNpb24/OiBudW1iZXIgfTtcblx0cG9zaXRpb24/OiBQb3NpdGlvbjtcblx0c2VsZWN0aW9uPzogU2VsZWN0aW9uO1xuXHRzY3JvbGw/OiB7IGxlZnQ/OiBudW1iZXI7IHRvcD86IG51bWJlciB9O1xufVxuXG5zdWl0ZSgnRWRpdG9yIENvcmUgLSBFZGl0b3IgU3RhdGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgYWxsRmxhZ3MgPSAoXG5cdFx0Q29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZVxuXHRcdHwgQ29kZUVkaXRvclN0YXRlRmxhZy5TZWxlY3Rpb25cblx0XHR8IENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb25cblx0XHR8IENvZGVFZGl0b3JTdGF0ZUZsYWcuU2Nyb2xsXG5cdCk7XG5cblx0dGVzdCgnZW1wdHkgZWRpdG9yIHN0YXRlIHNob3VsZCBiZSB2YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2YWxpZGF0ZSh7fSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgbW9kZWwgVVJJcyBzaG91bGQgYmUgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2YWxpZGF0ZShcblx0XHRcdHsgbW9kZWw6IHsgdXJpOiBVUkkucGFyc2UoJ2h0dHA6Ly90ZXN0MScpIH0gfSxcblx0XHRcdHsgbW9kZWw6IHsgdXJpOiBVUkkucGFyc2UoJ2h0dHA6Ly90ZXN0MicpIH0gfVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmZlcmVudCBtb2RlbCB2ZXJzaW9ucyBzaG91bGQgYmUgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2YWxpZGF0ZShcblx0XHRcdHsgbW9kZWw6IHsgdmVyc2lvbjogMSB9IH0sXG5cdFx0XHR7IG1vZGVsOiB7IHZlcnNpb246IDIgfSB9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IHBvc2l0aW9ucyBzaG91bGQgYmUgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2YWxpZGF0ZShcblx0XHRcdHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAyKSB9LFxuXHRcdFx0eyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDMpIH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgc2VsZWN0aW9ucyBzaG91bGQgYmUgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2YWxpZGF0ZShcblx0XHRcdHsgc2VsZWN0aW9uOiBuZXcgU2VsZWN0aW9uKDEsIDIsIDMsIDQpIH0sXG5cdFx0XHR7IHNlbGVjdGlvbjogbmV3IFNlbGVjdGlvbig1LCAyLCAzLCA0KSB9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IHNjcm9sbCBwb3NpdGlvbnMgc2hvdWxkIGJlIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmFsaWRhdGUoXG5cdFx0XHR7IHNjcm9sbDogeyBsZWZ0OiAxLCB0b3A6IDIgfSB9LFxuXHRcdFx0eyBzY3JvbGw6IHsgbGVmdDogMywgdG9wOiAyIH0gfVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdH0pO1xuXG5cblx0ZnVuY3Rpb24gdmFsaWRhdGUoc291cmNlOiBJU3R1YkVkaXRvclN0YXRlLCB0YXJnZXQ6IElTdHViRWRpdG9yU3RhdGUpIHtcblx0XHRjb25zdCBzb3VyY2VFZGl0b3IgPSBjcmVhdGVFZGl0b3Ioc291cmNlKSxcblx0XHRcdHRhcmdldEVkaXRvciA9IGNyZWF0ZUVkaXRvcih0YXJnZXQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEVkaXRvclN0YXRlKHNvdXJjZUVkaXRvciwgYWxsRmxhZ3MpLnZhbGlkYXRlKHRhcmdldEVkaXRvcik7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRWRpdG9yKHsgbW9kZWwsIHBvc2l0aW9uLCBzZWxlY3Rpb24sIHNjcm9sbCB9OiBJU3R1YkVkaXRvclN0YXRlID0ge30pOiBJQ29kZUVkaXRvciB7XG5cdFx0Y29uc3QgbWFwcGVkTW9kZWwgPSBtb2RlbCA/IHsgdXJpOiBtb2RlbC51cmkgPyBtb2RlbC51cmkgOiBVUkkucGFyc2UoJ2h0dHA6Ly9kdW1teS5vcmcnKSwgZ2V0VmVyc2lvbklkOiAoKSA9PiBtb2RlbC52ZXJzaW9uIH0gOiBudWxsO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0Z2V0TW9kZWw6ICgpOiBJVGV4dE1vZGVsID0+IDxhbnk+bWFwcGVkTW9kZWwsXG5cdFx0XHRnZXRQb3NpdGlvbjogKCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkID0+IHBvc2l0aW9uLFxuXHRcdFx0Z2V0U2VsZWN0aW9uOiAoKTogU2VsZWN0aW9uIHwgdW5kZWZpbmVkID0+IHNlbGVjdGlvbixcblx0XHRcdGdldFNjcm9sbExlZnQ6ICgpOiBudW1iZXIgfCB1bmRlZmluZWQgPT4gc2Nyb2xsICYmIHNjcm9sbC5sZWZ0LFxuXHRcdFx0Z2V0U2Nyb2xsVG9wOiAoKTogbnVtYmVyIHwgdW5kZWZpbmVkID0+IHNjcm9sbCAmJiBzY3JvbGwudG9wXG5cdFx0fSBhcyBJQ29kZUVkaXRvcjtcblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxxQkFBcUIsbUJBQW1CO0FBU2pELE1BQU0sOEJBQThCLE1BQU07QUFFekMsMENBQXdDO0FBRXhDLFFBQU0sV0FDTCxvQkFBb0IsUUFDbEIsb0JBQW9CLFlBQ3BCLG9CQUFvQixXQUNwQixvQkFBb0I7QUFHdkIsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxVQUFNLFNBQVMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzlCLFdBQU8sWUFBWSxRQUFRLElBQUk7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxVQUFNLFNBQVM7QUFBQSxNQUNkLEVBQUUsT0FBTyxFQUFFLEtBQUssSUFBSSxNQUFNLGNBQWMsRUFBRSxFQUFFO0FBQUEsTUFDNUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxJQUFJLE1BQU0sY0FBYyxFQUFFLEVBQUU7QUFBQSxJQUM3QztBQUVBLFdBQU8sWUFBWSxRQUFRLEtBQUs7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLFNBQVM7QUFBQSxNQUNkLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFO0FBQUEsTUFDeEIsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUU7QUFBQSxJQUN6QjtBQUVBLFdBQU8sWUFBWSxRQUFRLEtBQUs7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxVQUFNLFNBQVM7QUFBQSxNQUNkLEVBQUUsVUFBVSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFBQSxNQUMvQixFQUFFLFVBQVUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDaEM7QUFFQSxXQUFPLFlBQVksUUFBUSxLQUFLO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsVUFBTSxTQUFTO0FBQUEsTUFDZCxFQUFFLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRTtBQUFBLE1BQ3ZDLEVBQUUsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDeEM7QUFFQSxXQUFPLFlBQVksUUFBUSxLQUFLO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssZ0RBQWdELE1BQU07QUFDMUQsVUFBTSxTQUFTO0FBQUEsTUFDZCxFQUFFLFFBQVEsRUFBRSxNQUFNLEdBQUcsS0FBSyxFQUFFLEVBQUU7QUFBQSxNQUM5QixFQUFFLFFBQVEsRUFBRSxNQUFNLEdBQUcsS0FBSyxFQUFFLEVBQUU7QUFBQSxJQUMvQjtBQUVBLFdBQU8sWUFBWSxRQUFRLEtBQUs7QUFBQSxFQUNqQyxDQUFDO0FBR0QsV0FBUyxTQUFTLFFBQTBCLFFBQTBCO0FBQ3JFLFVBQU0sZUFBZSxhQUFhLE1BQU0sR0FDdkMsZUFBZSxhQUFhLE1BQU07QUFFbkMsVUFBTSxTQUFTLElBQUksWUFBWSxjQUFjLFFBQVEsRUFBRSxTQUFTLFlBQVk7QUFFNUUsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLGFBQWEsRUFBRSxPQUFPLFVBQVUsV0FBVyxPQUFPLElBQXNCLENBQUMsR0FBZ0I7QUFDakcsVUFBTSxjQUFjLFFBQVEsRUFBRSxLQUFLLE1BQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxNQUFNLGtCQUFrQixHQUFHLGNBQWMsTUFBTSxNQUFNLFFBQVEsSUFBSTtBQUVoSSxXQUFPO0FBQUE7QUFBQSxNQUVOLFVBQVUsTUFBdUI7QUFBQSxNQUNqQyxhQUFhLE1BQTRCO0FBQUEsTUFDekMsY0FBYyxNQUE2QjtBQUFBLE1BQzNDLGVBQWUsTUFBMEIsVUFBVSxPQUFPO0FBQUEsTUFDMUQsY0FBYyxNQUEwQixVQUFVLE9BQU87QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFFRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
