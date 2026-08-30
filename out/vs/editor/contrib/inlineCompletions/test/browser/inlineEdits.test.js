import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AnnotatedText, InlineEditContext, MockSearchReplaceCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from "./utils.js";
suite("Inline Edits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const val = new AnnotatedText(`
class Point {
	constructor(public x: number, public y: number) {}

	getLength2D(): number {
		return\u2193 Math.sqrt(this.x * this.x + this.y * this.y\u2193);
	}

	getJson(): string {
		return \u2193\xDC;
	}
}
`);
  async function runTest(cb) {
    const provider = new MockSearchReplaceCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      val.value,
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async (ctx) => {
        const view = new InlineEditContext(ctx.model, ctx.editor);
        ctx.store.add(view);
        await cb(ctx, provider, view);
      }
    );
  }
  test("Can Accept Inline Edit", async function() {
    await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
      provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
      await model.trigger();
      await timeout(1e4);
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        void 0,
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe...\n...y * this.y\u2770 + th...his.z\u2771);\n"
      ]);
      model.accept();
      assert.deepStrictEqual(editor.getValue(), `
class Point {
	constructor(public x: number, public y: number) {}

	getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	getJson(): string {
		return \xDC;
	}
}
`);
    });
  });
  test("Can Type Inline Edit", async function() {
    await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
      provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
      await model.trigger();
      await timeout(1e4);
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        void 0,
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe...\n...y * this.y\u2770 + th...his.z\u2771);\n"
      ]);
      editor.setPosition(val.getMarkerPosition(1));
      editorViewModel.type(" + t");
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe...\n...this.y + t\u2770his.z...his.z\u2771);\n"
      ]);
      editorViewModel.type("his.z * this.z");
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe..."
      ]);
    });
  });
  test("Inline Edit Is Correctly Shifted When Typing", async function() {
    await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
      provider.add("\xDC", "{x: this.x, y: this.y}");
      await model.trigger();
      await timeout(1e4);
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        void 0,
        "...\n		return \u2770\xDC\u21A6{x: t...is.y}\u2771;\n"
      ]);
      editor.setPosition(val.getMarkerPosition(2));
      editorViewModel.type("{");
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        "...		return {\u2770\xDC\u21A6x: th...is.y}\u2771;\n"
      ]);
    });
  });
  test("Inline Edit Stays On Unrelated Edit", async function() {
    await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
      provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
      await model.trigger();
      await timeout(1e4);
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        void 0,
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe...\n...y * this.y\u2770 + th...his.z\u2771);\n"
      ]);
      editor.setPosition(val.getMarkerPosition(0));
      editorViewModel.type("/* */");
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        "\n	get\u2770Length2\u21A6Length3\u2771D(): numbe...\n...y * this.y\u2770 + th...his.z\u2771);\n"
      ]);
      await timeout(1e4);
      assert.deepStrictEqual(view.getAndClearViewStates(), [
        void 0
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxpbmxpbmVFZGl0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQW5ub3RhdGVkVGV4dCwgSW5saW5lRWRpdENvbnRleHQsIElXaXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwsIE1vY2tTZWFyY2hSZXBsYWNlQ29tcGxldGlvbnNQcm92aWRlciwgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdJbmxpbmUgRWRpdHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHZhbCA9IG5ldyBBbm5vdGF0ZWRUZXh0KGBcbmNsYXNzIFBvaW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIHg6IG51bWJlciwgcHVibGljIHk6IG51bWJlcikge31cblxuXHRnZXRMZW5ndGgyRCgpOiBudW1iZXIge1xuXHRcdHJldHVyblx1MjE5MyBNYXRoLnNxcnQodGhpcy54ICogdGhpcy54ICsgdGhpcy55ICogdGhpcy55XHUyMTkzKTtcblx0fVxuXG5cdGdldEpzb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXHUyMTkzXHUwMERDO1xuXHR9XG59XG5gKTtcblxuXHRhc3luYyBmdW5jdGlvbiBydW5UZXN0KGNiOiAoY3R4OiBJV2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsLCBwcm92aWRlcjogTW9ja1NlYXJjaFJlcGxhY2VDb21wbGV0aW9uc1Byb3ZpZGVyLCB2aWV3OiBJbmxpbmVFZGl0Q29udGV4dCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tTZWFyY2hSZXBsYWNlQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCh2YWwudmFsdWUsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIsIGlubGluZVN1Z2dlc3Q6IHsgZW5hYmxlZDogdHJ1ZSB9IH0sXG5cdFx0XHRhc3luYyAoY3R4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBuZXcgSW5saW5lRWRpdENvbnRleHQoY3R4Lm1vZGVsLCBjdHguZWRpdG9yKTtcblx0XHRcdFx0Y3R4LnN0b3JlLmFkZCh2aWV3KTtcblx0XHRcdFx0YXdhaXQgY2IoY3R4LCBwcm92aWRlciwgdmlldyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ0NhbiBBY2NlcHQgSW5saW5lIEVkaXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcnVuVGVzdChhc3luYyAoeyBjb250ZXh0LCBtb2RlbCwgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwgfSwgcHJvdmlkZXIsIHZpZXcpID0+IHtcblx0XHRcdHByb3ZpZGVyLmFkZChgZ2V0TGVuZ3RoMkQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSk7XG5cdH1gLCBgZ2V0TGVuZ3RoM0QoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSArIHRoaXMueiAqIHRoaXMueik7XG5cdH1gKTtcblxuXHRcdFx0YXdhaXQgbW9kZWwudHJpZ2dlcigpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0J1xcblxcdGdldFx1Mjc3MExlbmd0aDJcdTIxQTZMZW5ndGgzXHUyNzcxRCgpOiBudW1iZS4uLlxcbi4uLnkgKiB0aGlzLnlcdTI3NzAgKyB0aC4uLmhpcy56XHUyNzcxKTtcXG4nXG5cdFx0XHRdKSk7XG5cblx0XHRcdG1vZGVsLmFjY2VwdCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCBgXG5jbGFzcyBQb2ludCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyB4OiBudW1iZXIsIHB1YmxpYyB5OiBudW1iZXIpIHt9XG5cblx0Z2V0TGVuZ3RoM0QoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSArIHRoaXMueiAqIHRoaXMueik7XG5cdH1cblxuXHRnZXRKc29uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFx1MDBEQztcblx0fVxufVxuYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbiBUeXBlIElubGluZSBFZGl0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJ1blRlc3QoYXN5bmMgKHsgY29udGV4dCwgbW9kZWwsIGVkaXRvciwgZWRpdG9yVmlld01vZGVsIH0sIHByb3ZpZGVyLCB2aWV3KSA9PiB7XG5cdFx0XHRwcm92aWRlci5hZGQoYGdldExlbmd0aDJEKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkpO1xuXHR9YCwgYGdldExlbmd0aDNEKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkgKyB0aGlzLnogKiB0aGlzLnopO1xuXHR9YCk7XG5cdFx0XHRhd2FpdCBtb2RlbC50cmlnZ2VyKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFtcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnXFxuXFx0Z2V0XHUyNzcwTGVuZ3RoMlx1MjFBNkxlbmd0aDNcdTI3NzFEKCk6IG51bWJlLi4uXFxuLi4ueSAqIHRoaXMueVx1Mjc3MCArIHRoLi4uaGlzLnpcdTI3NzEpO1xcbidcblx0XHRcdF0pKTtcblxuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHZhbC5nZXRNYXJrZXJQb3NpdGlvbigxKSk7XG5cdFx0XHRlZGl0b3JWaWV3TW9kZWwudHlwZSgnICsgdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbXG5cdFx0XHRcdCdcXG5cXHRnZXRcdTI3NzBMZW5ndGgyXHUyMUE2TGVuZ3RoM1x1Mjc3MUQoKTogbnVtYmUuLi5cXG4uLi50aGlzLnkgKyB0XHUyNzcwaGlzLnouLi5oaXMuelx1Mjc3MSk7XFxuJ1xuXHRcdFx0XSkpO1xuXG5cdFx0XHRlZGl0b3JWaWV3TW9kZWwudHlwZSgnaGlzLnogKiB0aGlzLnonKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFtcblx0XHRcdFx0J1xcblxcdGdldFx1Mjc3MExlbmd0aDJcdTIxQTZMZW5ndGgzXHUyNzcxRCgpOiBudW1iZS4uLidcblx0XHRcdF0pKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnSW5saW5lIEVkaXQgSXMgQ29ycmVjdGx5IFNoaWZ0ZWQgV2hlbiBUeXBpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcnVuVGVzdChhc3luYyAoeyBjb250ZXh0LCBtb2RlbCwgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwgfSwgcHJvdmlkZXIsIHZpZXcpID0+IHtcblx0XHRcdHByb3ZpZGVyLmFkZCgnXHUwMERDJywgJ3t4OiB0aGlzLngsIHk6IHRoaXMueX0nKTtcblx0XHRcdGF3YWl0IG1vZGVsLnRyaWdnZXIoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCAoW1xuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCcuLi5cXG5cXHRcXHRyZXR1cm4gXHUyNzcwXHUwMERDXHUyMUE2e3g6IHQuLi5pcy55fVx1Mjc3MTtcXG4nXG5cdFx0XHRdKSk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24odmFsLmdldE1hcmtlclBvc2l0aW9uKDIpKTtcblx0XHRcdGVkaXRvclZpZXdNb2RlbC50eXBlKCd7Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFtcblx0XHRcdFx0Jy4uLlxcdFxcdHJldHVybiB7XHUyNzcwXHUwMERDXHUyMUE2eDogdGguLi5pcy55fVx1Mjc3MTtcXG4nXG5cdFx0XHRdKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lubGluZSBFZGl0IFN0YXlzIE9uIFVucmVsYXRlZCBFZGl0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJ1blRlc3QoYXN5bmMgKHsgY29udGV4dCwgbW9kZWwsIGVkaXRvciwgZWRpdG9yVmlld01vZGVsIH0sIHByb3ZpZGVyLCB2aWV3KSA9PiB7XG5cdFx0XHRwcm92aWRlci5hZGQoYGdldExlbmd0aDJEKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkpO1xuXHR9YCwgYGdldExlbmd0aDNEKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguc3FydCh0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnkgKyB0aGlzLnogKiB0aGlzLnopO1xuXHR9YCk7XG5cdFx0XHRhd2FpdCBtb2RlbC50cmlnZ2VyKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFtcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnXFxuXFx0Z2V0XHUyNzcwTGVuZ3RoMlx1MjFBNkxlbmd0aDNcdTI3NzFEKCk6IG51bWJlLi4uXFxuLi4ueSAqIHRoaXMueVx1Mjc3MCArIHRoLi4uaGlzLnpcdTI3NzEpO1xcbidcblx0XHRcdF0pKTtcblxuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHZhbC5nZXRNYXJrZXJQb3NpdGlvbigwKSk7XG5cdFx0XHRlZGl0b3JWaWV3TW9kZWwudHlwZSgnLyogKi8nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCAoW1xuXHRcdFx0XHQnXFxuXFx0Z2V0XHUyNzcwTGVuZ3RoMlx1MjFBNkxlbmd0aDNcdTI3NzFEKCk6IG51bWJlLi4uXFxuLi4ueSAqIHRoaXMueVx1Mjc3MCArIHRoLi4uaGlzLnpcdTI3NzEpO1xcbidcblx0XHRcdF0pKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XSkpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGVBQWUsbUJBQXNFLHNDQUFzQyx3REFBd0Q7QUFFNUwsTUFBTSxnQkFBZ0IsTUFBTTtBQUMzQiwwQ0FBd0M7QUFFeEMsUUFBTSxNQUFNLElBQUksY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxDQVk5QjtBQUVBLGlCQUFlLFFBQVEsSUFBdUs7QUFDN0wsVUFBTSxXQUFXLElBQUkscUNBQXFDO0FBQzFELFVBQU07QUFBQSxNQUFpRCxJQUFJO0FBQUEsTUFDMUQsRUFBRSxXQUFXLE1BQU0sVUFBVSxlQUFlLEVBQUUsU0FBUyxLQUFLLEVBQUU7QUFBQSxNQUM5RCxPQUFPLFFBQVE7QUFDZCxjQUFNLE9BQU8sSUFBSSxrQkFBa0IsSUFBSSxPQUFPLElBQUksTUFBTTtBQUN4RCxZQUFJLE1BQU0sSUFBSSxJQUFJO0FBQ2xCLGNBQU0sR0FBRyxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLDBCQUEwQixpQkFBa0I7QUFDaEQsVUFBTSxRQUFRLE9B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
