import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { UnicodeTextModelHighlighter } from "../../../common/services/unicodeTextModelHighlighter.js";
import { createTextModel } from "../testTextModel.js";
suite("UnicodeTextModelHighlighter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function t(text, options) {
    const m = createTextModel(text);
    const r = UnicodeTextModelHighlighter.computeUnicodeHighlights(m, options);
    m.dispose();
    return {
      ...r,
      ranges: r.ranges.map((r2) => Range.lift(r2).toString())
    };
  }
  test("computeUnicodeHighlights (#168068)", () => {
    assert.deepStrictEqual(
      t(`
	For\xA0\xE5\xA0gi\xA0et\xA0eksempel
`, {
        allowedCodePoints: [],
        allowedLocales: [],
        ambiguousCharacters: true,
        invisibleCharacters: true,
        includeComments: false,
        includeStrings: false,
        nonBasicASCII: false
      }),
      {
        ambiguousCharacterCount: 0,
        hasMore: false,
        invisibleCharacterCount: 4,
        nonBasicAsciiCharacterCount: 0,
        ranges: [
          "[2,5 -> 2,6]",
          "[2,7 -> 2,8]",
          "[2,10 -> 2,11]",
          "[2,13 -> 2,14]"
        ]
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXHVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMsIFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbnN1aXRlKCdVbmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHQodGV4dDogc3RyaW5nLCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zKTogdW5rbm93biB7XG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0XHRjb25zdCByID0gVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmNvbXB1dGVVbmljb2RlSGlnaGxpZ2h0cyhtLCBvcHRpb25zKTtcblx0XHRtLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5yLFxuXHRcdFx0cmFuZ2VzOiByLnJhbmdlcy5tYXAociA9PiBSYW5nZS5saWZ0KHIpLnRvU3RyaW5nKCkpXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2NvbXB1dGVVbmljb2RlSGlnaGxpZ2h0cyAoIzE2ODA2OCknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHQoYFxuXHRGb3JcdTAwQTBcdTAwRTVcdTAwQTBnaVx1MDBBMGV0XHUwMEEwZWtzZW1wZWxcbmAsIHtcblx0XHRcdFx0YWxsb3dlZENvZGVQb2ludHM6IFtdLFxuXHRcdFx0XHRhbGxvd2VkTG9jYWxlczogW10sXG5cdFx0XHRcdGFtYmlndW91c0NoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRcdGluY2x1ZGVDb21tZW50czogZmFsc2UsXG5cdFx0XHRcdGluY2x1ZGVTdHJpbmdzOiBmYWxzZSxcblx0XHRcdFx0bm9uQmFzaWNBU0NJSTogZmFsc2Vcblx0XHRcdH0pLFxuXHRcdFx0e1xuXHRcdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudDogMCxcblx0XHRcdFx0aGFzTW9yZTogZmFsc2UsXG5cdFx0XHRcdGludmlzaWJsZUNoYXJhY3RlckNvdW50OiA0LFxuXHRcdFx0XHRub25CYXNpY0FzY2lpQ2hhcmFjdGVyQ291bnQ6IDAsXG5cdFx0XHRcdHJhbmdlczogW1xuXHRcdFx0XHRcdCdbMiw1IC0+IDIsNl0nLFxuXHRcdFx0XHRcdCdbMiw3IC0+IDIsOF0nLFxuXHRcdFx0XHRcdCdbMiwxMCAtPiAyLDExXScsXG5cdFx0XHRcdFx0J1syLDEzIC0+IDIsMTRdJ1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBb0MsbUNBQW1DO0FBQ3ZFLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sK0JBQStCLE1BQU07QUFDMUMsMENBQXdDO0FBRXhDLFdBQVMsRUFBRSxNQUFjLFNBQTZDO0FBQ3JFLFVBQU0sSUFBSSxnQkFBZ0IsSUFBSTtBQUM5QixVQUFNLElBQUksNEJBQTRCLHlCQUF5QixHQUFHLE9BQU87QUFDekUsTUFBRSxRQUFRO0FBRVYsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsUUFBUSxFQUFFLE9BQU8sSUFBSSxDQUFBQSxPQUFLLE1BQU0sS0FBS0EsRUFBQyxFQUFFLFNBQVMsQ0FBQztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUVBLE9BQUssc0NBQXNDLE1BQU07QUFDaEQsV0FBTztBQUFBLE1BQ04sRUFBRTtBQUFBO0FBQUEsR0FFRjtBQUFBLFFBQ0MsbUJBQW1CLENBQUM7QUFBQSxRQUNwQixnQkFBZ0IsQ0FBQztBQUFBLFFBQ2pCLHFCQUFxQjtBQUFBLFFBQ3JCLHFCQUFxQjtBQUFBLFFBQ3JCLGlCQUFpQjtBQUFBLFFBQ2pCLGdCQUFnQjtBQUFBLFFBQ2hCLGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQ0MseUJBQXlCO0FBQUEsUUFDekIsU0FBUztBQUFBLFFBQ1QseUJBQXlCO0FBQUEsUUFDekIsNkJBQTZCO0FBQUEsUUFDN0IsUUFBUTtBQUFBLFVBQ1A7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJyIl0KfQo=
