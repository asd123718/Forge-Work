import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { convertToolCallResult } from "../../../node/claude/clientTools/claudeClientToolResult.js";
import { ToolResultContentType } from "../../../common/state/protocol/channels-chat/state.js";
function makeResult(over) {
  return {
    success: true,
    pastTenseMessage: "did the thing",
    ...over
  };
}
suite("claudeClientToolResult / convertToolCallResult", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("text-only result maps to MCP text blocks; no isError when success", () => {
    const out = convertToolCallResult(makeResult({
      content: [{ type: ToolResultContentType.Text, text: "hello" }]
    }), "tu_1");
    assert.deepStrictEqual(out.content, [{ type: "text", text: "hello" }]);
    assert.strictEqual(out.isError, void 0);
  });
  test("error result carries isError=true", () => {
    const out = convertToolCallResult(makeResult({
      success: false,
      error: { message: "boom" },
      content: [{ type: ToolResultContentType.Text, text: "failed" }]
    }), "tu_2");
    assert.strictEqual(out.isError, true);
  });
  test("image embedded resource \u2192 MCP image block (field rename + repackage)", () => {
    const out = convertToolCallResult(makeResult({
      content: [{
        type: ToolResultContentType.EmbeddedResource,
        data: "BASE64PNG",
        contentType: "image/png"
      }]
    }), "tu_3");
    assert.deepStrictEqual(out.content[0], {
      type: "image",
      data: "BASE64PNG",
      mimeType: "image/png"
    });
  });
  test("non-image embedded resource \u2192 MCP resource block with synthesized claude-client:// URI", () => {
    const out = convertToolCallResult(makeResult({
      content: [
        { type: ToolResultContentType.EmbeddedResource, data: "BASE64PDF", contentType: "application/pdf" },
        { type: ToolResultContentType.EmbeddedResource, data: "BASE64ZIP", contentType: "application/zip" }
      ]
    }), "tu/with-slash");
    assert.deepStrictEqual(out.content[0], {
      type: "resource",
      resource: { uri: "claude-client://tu%2Fwith-slash/0", mimeType: "application/pdf", blob: "BASE64PDF" }
    });
    assert.deepStrictEqual(out.content[1], {
      type: "resource",
      resource: { uri: "claude-client://tu%2Fwith-slash/1", mimeType: "application/zip", blob: "BASE64ZIP" }
    });
  });
  test("unknown block kind collapses to a stringified text block (warn logged, no throw)", () => {
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      const malformedBlock = { type: "not-a-real-kind", ref: "r1", mimeType: "text/plain" };
      const out = convertToolCallResult(makeResult({
        content: [malformedBlock]
      }), "tu_5");
      assert.strictEqual(out.content[0].type, "text");
      assert.ok(typeof out.content[0].text === "string");
      assert.strictEqual(warned, true);
    } finally {
      console.warn = originalWarn;
    }
  });
  test("structuredContent passes through unchanged", () => {
    const out = convertToolCallResult(makeResult({
      structuredContent: { k: "v" }
    }), "tu_6");
    assert.deepStrictEqual(out.structuredContent, { k: "v" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGllbnRUb29sc1xcY2xhdWRlQ2xpZW50VG9vbFJlc3VsdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0VG9vbENhbGxSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NsYXVkZS9jbGllbnRUb29scy9jbGF1ZGVDbGllbnRUb29sUmVzdWx0LmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb250ZW50VHlwZSwgdHlwZSBUb29sQ2FsbFJlc3VsdCwgdHlwZSBUb29sUmVzdWx0Q29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGF0L3N0YXRlLmpzJztcblxuZnVuY3Rpb24gbWFrZVJlc3VsdChvdmVyOiBQYXJ0aWFsPFRvb2xDYWxsUmVzdWx0Pik6IFRvb2xDYWxsUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdkaWQgdGhlIHRoaW5nJyxcblx0XHQuLi5vdmVyLFxuXHR9O1xufVxuXG5zdWl0ZSgnY2xhdWRlQ2xpZW50VG9vbFJlc3VsdCAvIGNvbnZlcnRUb29sQ2FsbFJlc3VsdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0ZXh0LW9ubHkgcmVzdWx0IG1hcHMgdG8gTUNQIHRleHQgYmxvY2tzOyBubyBpc0Vycm9yIHdoZW4gc3VjY2VzcycsICgpID0+IHtcblx0XHRjb25zdCBvdXQgPSBjb252ZXJ0VG9vbENhbGxSZXN1bHQobWFrZVJlc3VsdCh7XG5cdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hlbGxvJyB9XSxcblx0XHR9KSwgJ3R1XzEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG91dC5jb250ZW50LCBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbycgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXQuaXNFcnJvciwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZXJyb3IgcmVzdWx0IGNhcnJpZXMgaXNFcnJvcj10cnVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dCA9IGNvbnZlcnRUb29sQ2FsbFJlc3VsdChtYWtlUmVzdWx0KHtcblx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ2Jvb20nIH0sXG5cdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZhaWxlZCcgfV0sXG5cdFx0fSksICd0dV8yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dC5pc0Vycm9yLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW1hZ2UgZW1iZWRkZWQgcmVzb3VyY2UgXHUyMTkyIE1DUCBpbWFnZSBibG9jayAoZmllbGQgcmVuYW1lICsgcmVwYWNrYWdlKScsICgpID0+IHtcblx0XHRjb25zdCBvdXQgPSBjb252ZXJ0VG9vbENhbGxSZXN1bHQobWFrZVJlc3VsdCh7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdFx0ZGF0YTogJ0JBU0U2NFBORycsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdH1dLFxuXHRcdH0pLCAndHVfMycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0LmNvbnRlbnRbMF0sIHtcblx0XHRcdHR5cGU6ICdpbWFnZScsXG5cdFx0XHRkYXRhOiAnQkFTRTY0UE5HJyxcblx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9uLWltYWdlIGVtYmVkZGVkIHJlc291cmNlIFx1MjE5MiBNQ1AgcmVzb3VyY2UgYmxvY2sgd2l0aCBzeW50aGVzaXplZCBjbGF1ZGUtY2xpZW50Oi8vIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBvdXQgPSBjb252ZXJ0VG9vbENhbGxSZXN1bHQobWFrZVJlc3VsdCh7XG5cdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UsIGRhdGE6ICdCQVNFNjRQREYnLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL3BkZicgfSxcblx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZSwgZGF0YTogJ0JBU0U2NFpJUCcsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vemlwJyB9LFxuXHRcdFx0XSxcblx0XHR9KSwgJ3R1L3dpdGgtc2xhc2gnKTtcblx0XHQvLyBQZXItY2FsbCBVUkkgY2FycmllcyB0aGUgdG9vbF91c2VfaWQgKGVuY29kZWQpIGFuZCB0aGUgYmxvY2sgaW5kZXgsIHNvXG5cdFx0Ly8gcGFyYWxsZWwgY2FsbHMgd2l0aCB0aGUgc2FtZSBzaGFwZSBzdGF5IGRpc2FtYmlndWF0ZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdXQuY29udGVudFswXSwge1xuXHRcdFx0dHlwZTogJ3Jlc291cmNlJyxcblx0XHRcdHJlc291cmNlOiB7IHVyaTogJ2NsYXVkZS1jbGllbnQ6Ly90dSUyRndpdGgtc2xhc2gvMCcsIG1pbWVUeXBlOiAnYXBwbGljYXRpb24vcGRmJywgYmxvYjogJ0JBU0U2NFBERicgfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG91dC5jb250ZW50WzFdLCB7XG5cdFx0XHR0eXBlOiAncmVzb3VyY2UnLFxuXHRcdFx0cmVzb3VyY2U6IHsgdXJpOiAnY2xhdWRlLWNsaWVudDovL3R1JTJGd2l0aC1zbGFzaC8xJywgbWltZVR5cGU6ICdhcHBsaWNhdGlvbi96aXAnLCBibG9iOiAnQkFTRTY0WklQJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIGJsb2NrIGtpbmQgY29sbGFwc2VzIHRvIGEgc3RyaW5naWZpZWQgdGV4dCBibG9jayAod2FybiBsb2dnZWQsIG5vIHRocm93KScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFdhcm4gPSBjb25zb2xlLndhcm47XG5cdFx0bGV0IHdhcm5lZCA9IGZhbHNlO1xuXHRcdGNvbnNvbGUud2FybiA9ICgpID0+IHsgd2FybmVkID0gdHJ1ZTsgfTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWFsZm9ybWVkQmxvY2sgPSB7IHR5cGU6ICdub3QtYS1yZWFsLWtpbmQnLCByZWY6ICdyMScsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicgfSBhcyB1bmtub3duIGFzIFRvb2xSZXN1bHRDb250ZW50O1xuXHRcdFx0Y29uc3Qgb3V0ID0gY29udmVydFRvb2xDYWxsUmVzdWx0KG1ha2VSZXN1bHQoe1xuXHRcdFx0XHRjb250ZW50OiBbbWFsZm9ybWVkQmxvY2tdLFxuXHRcdFx0fSksICd0dV81Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0LmNvbnRlbnRbMF0udHlwZSwgJ3RleHQnKTtcblx0XHRcdGFzc2VydC5vayh0eXBlb2YgKG91dC5jb250ZW50WzBdIGFzIHsgdGV4dDogc3RyaW5nIH0pLnRleHQgPT09ICdzdHJpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuZWQsIHRydWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb25zb2xlLndhcm4gPSBvcmlnaW5hbFdhcm47XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzdHJ1Y3R1cmVkQ29udGVudCBwYXNzZXMgdGhyb3VnaCB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0ID0gY29udmVydFRvb2xDYWxsUmVzdWx0KG1ha2VSZXN1bHQoe1xuXHRcdFx0c3RydWN0dXJlZENvbnRlbnQ6IHsgazogJ3YnIH0sXG5cdFx0fSksICd0dV82Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdXQuc3RydWN0dXJlZENvbnRlbnQsIHsgazogJ3YnIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTBFO0FBRW5GLFNBQVMsV0FBVyxNQUErQztBQUNsRSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxrQkFBa0I7QUFBQSxJQUNsQixHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsTUFBTSxrREFBa0QsTUFBTTtBQUU3RCwwQ0FBd0M7QUFFeEMsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLE1BQU0sc0JB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
