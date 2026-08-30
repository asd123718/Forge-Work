import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { extractImagesFromChatRequest, extractImagesFromChatResponse, extractImagesFromToolInvocationMessages } from "../../common/chatImageExtraction.js";
function makeToolInvocation(overrides = {}) {
  return {
    kind: "toolInvocationSerialized",
    toolCallId: "call_1",
    toolId: "test-tool",
    invocationMessage: "Running tool",
    originMessage: void 0,
    pastTenseMessage: "Ran tool",
    isConfirmed: true,
    isComplete: true,
    source: void 0,
    presentation: void 0,
    resultDetails: void 0,
    ...overrides
  };
}
function makeInlineReference(uri, name) {
  return {
    kind: "inlineReference",
    inlineReference: uri,
    name
  };
}
function makeResponse(items, opts = {}) {
  const sessionResource = opts.sessionResource ?? URI.parse("chat-session://test/session");
  const requestId = opts.requestId ?? "req-1";
  const responseId = opts.id ?? "resp-1";
  const requestMessageText = opts.requestMessageText ?? "Show me images";
  return {
    id: responseId,
    requestId,
    sessionResource,
    response: { value: items },
    session: {
      getItems: () => opts.noMatchingRequest ? [] : [{
        id: requestId,
        messageText: requestMessageText,
        message: { parts: [], text: requestMessageText },
        variables: opts.requestVariables ?? []
      }]
    }
  };
}
const fakeReadFile = (uri) => Promise.resolve(VSBuffer.fromString(`data-for-${uri.path}`));
function makeRequest(variables, opts = {}) {
  return {
    id: opts.id ?? "req-1",
    sessionResource: URI.parse("chat-session://test/session"),
    dataId: "data-1",
    username: "test-user",
    message: { text: opts.messageText ?? "Show me images", parts: [] },
    messageText: opts.messageText ?? "Show me images",
    attempt: 0,
    variables,
    currentRenderedHeight: void 0,
    shouldBeRemovedOnSend: void 0,
    isComplete: true,
    isCompleteAddedRequest: true,
    slashCommand: void 0,
    agentOrSlashCommandDetected: false,
    shouldBeBlocked: void 0,
    timestamp: 0
  };
}
function makeImageVariableEntry(overrides) {
  const { value, ...rest } = overrides;
  return {
    id: "img-1",
    kind: "image",
    name: "cat.png",
    value,
    mimeType: "image/png",
    ...rest
  };
}
suite("extractImagesFromChatResponse", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty images when response has no items", async () => {
    const response = makeResponse([]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.deepStrictEqual(result, {
      id: response.sessionResource.toString() + "_" + response.id,
      title: "Show me images",
      images: []
    });
  });
  test("uses default title when no matching request is found", async () => {
    const response = makeResponse([], { noMatchingRequest: true });
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.title, "Images");
  });
  test("uses attachment summary title when matching request has no message text", async () => {
    const image = makeImageVariableEntry({ value: VSBuffer.fromString("image").buffer });
    const response = makeResponse([], { requestMessageText: "", requestVariables: [image] });
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.title, "Attached 1 image");
  });
  test("extracts image from tool invocation with IToolResultOutputDetails", async () => {
    const resultDetails = {
      output: { type: "data", mimeType: "image/png", base64Data: "AQID" }
    };
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_img",
      toolId: "screenshot-tool",
      pastTenseMessage: "Took a screenshot",
      resultDetails
    });
    const response = makeResponse([toolInvocation]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].id, "call_img_0");
    assert.strictEqual(result.images[0].mimeType, "image/png");
    assert.ok(result.images[0].source.includes("screenshot-tool"));
    assert.strictEqual(result.images[0].caption, "Took a screenshot");
  });
  test("extracts multiple images from tool invocation with IToolResultInputOutputDetails", async () => {
    const resultDetails = {
      input: "",
      output: [
        { type: "embed", mimeType: "image/png", value: "AQID", isText: false },
        { type: "embed", mimeType: "text/plain", value: "text", isText: true },
        { type: "embed", mimeType: "image/jpeg", value: "BAUG", isText: false }
      ]
    };
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_multi",
      toolId: "multi-tool",
      pastTenseMessage: "Generated images",
      resultDetails
    });
    const response = makeResponse([toolInvocation]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 2);
    assert.strictEqual(result.images[0].id, "call_multi_0");
    assert.strictEqual(result.images[0].mimeType, "image/png");
    assert.strictEqual(result.images[1].id, "call_multi_2");
    assert.strictEqual(result.images[1].mimeType, "image/jpeg");
  });
  test("skips tool invocations without image results", async () => {
    const resultDetails = {
      output: { type: "data", mimeType: "text/plain", base64Data: "aGVsbG8=" }
    };
    const toolInvocation = makeToolInvocation({ resultDetails });
    const response = makeResponse([toolInvocation]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 0);
  });
  test("extracts image from inline reference URI when readFile is provided", async () => {
    const imageUri = URI.file("/photos/cat.png");
    const inlineRef = makeInlineReference(imageUri, "cat.png");
    const response = makeResponse([inlineRef]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
    assert.strictEqual(result.images[0].name, "cat.png");
    assert.strictEqual(result.images[0].mimeType, "image/png");
    assert.strictEqual(result.images[0].source, "File");
  });
  test("extracts image from inline reference Location", async () => {
    const imageUri = URI.file("/photos/dog.jpg");
    const inlineRef = {
      kind: "inlineReference",
      inlineReference: { uri: imageUri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } }
    };
    const response = makeResponse([inlineRef]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
  });
  test("skips non-image inline references", async () => {
    const codeUri = URI.file("/src/main.ts");
    const inlineRef = makeInlineReference(codeUri);
    const response = makeResponse([inlineRef]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 0);
  });
  test("uses filename from URI path when name is not provided", async () => {
    const imageUri = URI.file("/assets/banner.gif");
    const inlineRef = makeInlineReference(imageUri);
    const response = makeResponse([inlineRef]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].name, "banner.gif");
  });
  test("preserves interleaved order of tool and inline reference images", async () => {
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_first",
      toolId: "tool-1",
      resultDetails: {
        output: { type: "data", mimeType: "image/png", base64Data: "AQID" }
      }
    });
    const inlineRef = makeInlineReference(URI.file("/middle.png"), "middle.png");
    const toolInvocation2 = makeToolInvocation({
      toolCallId: "call_last",
      toolId: "tool-2",
      resultDetails: {
        output: { type: "data", mimeType: "image/jpeg", base64Data: "BAUG" }
      }
    });
    const response = makeResponse([toolInvocation, inlineRef, toolInvocation2]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 3);
    assert.strictEqual(result.images[0].id, "call_first_0");
    assert.strictEqual(result.images[1].name, "middle.png");
    assert.strictEqual(result.images[2].id, "call_last_0");
  });
  test("collection id combines sessionResource and response id", async () => {
    const sessionResource = URI.parse("chat-session://test/my-session");
    const response = makeResponse([], { sessionResource, id: "response-42" });
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.id, sessionResource.toString() + "_response-42");
  });
  test("skips inline reference when readFile fails", async () => {
    const imageUri = URI.file("/photos/missing.png");
    const inlineRef = makeInlineReference(imageUri, "missing.png");
    const failingReadFile = (_uri) => Promise.reject(new Error("File not found"));
    const response = makeResponse([inlineRef]);
    const result = await extractImagesFromChatResponse(response, failingReadFile);
    assert.strictEqual(result.images.length, 0);
  });
  test("extracts images from tool invocation message URIs", async () => {
    const imageUri = URI.file("/screenshots/result.png");
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_msg",
      toolId: "screenshot-tool",
      pastTenseMessage: { value: "Took a screenshot", isTrusted: false, uris: { "0": imageUri.toJSON() } }
    });
    const response = makeResponse([toolInvocation]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
    assert.strictEqual(result.images[0].name, "result.png");
    assert.strictEqual(result.images[0].mimeType, "image/png");
    const caption = result.images[0].caption;
    assert.ok(isMarkdownString(caption), "caption should be an IMarkdownString");
    assert.strictEqual(caption.value, "Took a screenshot");
  });
  test("combines output details images and message URI images", async () => {
    const imageUri = URI.file("/screenshots/msg-image.jpg");
    const resultDetails = {
      output: { type: "data", mimeType: "image/png", base64Data: "AQID" }
    };
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_both",
      toolId: "combo-tool",
      pastTenseMessage: { value: "Ran combo tool", isTrusted: false, uris: { "0": imageUri.toJSON() } },
      resultDetails
    });
    const response = makeResponse([toolInvocation]);
    const result = await extractImagesFromChatResponse(response, fakeReadFile);
    assert.strictEqual(result.images.length, 2);
    assert.strictEqual(result.images[0].id, "call_both_0");
    assert.strictEqual(result.images[1].uri.toString(), imageUri.toString());
  });
});
suite("extractImagesFromToolInvocationMessages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty when message is undefined", async () => {
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: void 0,
      invocationMessage: void 0
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.deepStrictEqual(result, []);
  });
  test("returns empty when message is a string", async () => {
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: "some string message"
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.deepStrictEqual(result, []);
  });
  test("returns empty when message has no uris", async () => {
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: { value: "No URIs here", isTrusted: false }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.deepStrictEqual(result, []);
  });
  test("returns empty when message uris are empty", async () => {
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: { value: "Empty URIs", isTrusted: false, uris: {} }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.deepStrictEqual(result, []);
  });
  test("skips non-image URIs", async () => {
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: { value: "Code file", isTrusted: false, uris: { "0": URI.file("/src/main.ts").toJSON() } }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.deepStrictEqual(result, []);
  });
  test("extracts image from message URI", async () => {
    const imageUri = URI.file("/screenshots/capture.png");
    const toolInvocation = makeToolInvocation({
      toolCallId: "call_uri",
      toolId: "screenshot-tool",
      pastTenseMessage: { value: "Captured screenshot", isTrusted: false, uris: { "0": imageUri.toJSON() } }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].uri.toString(), imageUri.toString());
    assert.strictEqual(result[0].name, "capture.png");
    assert.strictEqual(result[0].mimeType, "image/png");
    const caption = result[0].caption;
    assert.ok(isMarkdownString(caption), "caption should be an IMarkdownString");
    assert.strictEqual(caption.value, "Captured screenshot");
    assert.ok(result[0].source.includes("screenshot-tool"));
  });
  test("extracts multiple images from message URIs", async () => {
    const uri1 = URI.file("/img/a.png");
    const uri2 = URI.file("/img/b.jpg");
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: {
        value: "Generated images",
        isTrusted: false,
        uris: { "0": uri1.toJSON(), "1": uri2.toJSON() }
      }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].mimeType, "image/png");
    assert.strictEqual(result[1].mimeType, "image/jpg");
  });
  test("continues when readFile fails for one URI", async () => {
    const goodUri = URI.file("/img/good.png");
    const badUri = URI.file("/img/bad.png");
    const failingReadFile = (uri) => {
      if (uri.path.includes("bad")) {
        return Promise.reject(new Error("File not found"));
      }
      return Promise.resolve(VSBuffer.fromString("image-data"));
    };
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: {
        value: "Mixed results",
        isTrusted: false,
        uris: { "0": badUri.toJSON(), "1": goodUri.toJSON() }
      }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, failingReadFile);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].uri.toString(), goodUri.toString());
  });
  test("falls back to invocationMessage when pastTenseMessage is undefined", async () => {
    const imageUri = URI.file("/img/fallback.png");
    const toolInvocation = makeToolInvocation({
      pastTenseMessage: void 0,
      invocationMessage: { value: "Running tool", isTrusted: false, uris: { "0": imageUri.toJSON() } }
    });
    const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
    assert.strictEqual(result.length, 1);
    const caption = result[0].caption;
    assert.ok(isMarkdownString(caption), "caption should be an IMarkdownString");
    assert.strictEqual(caption.value, "Running tool");
  });
});
suite("extractImagesFromChatRequest", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("extracts image attachment from Uint8Array", () => {
    const request = makeRequest([
      makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
    ]);
    const result = extractImagesFromChatRequest(request);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "cat.png");
    assert.strictEqual(result[0].mimeType, "image/png");
    assert.deepStrictEqual([...result[0].data.buffer], [1, 2, 3]);
  });
  test("extracts image attachment from ArrayBuffer", () => {
    const request = makeRequest([
      makeImageVariableEntry({ value: new Uint8Array([4, 5, 6]).buffer })
    ]);
    const result = extractImagesFromChatRequest(request);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual([...result[0].data.buffer], [4, 5, 6]);
  });
  test("extracts restored image attachment from plain object bytes", () => {
    const request = makeRequest([
      makeImageVariableEntry({ value: { 0: 7, 1: 8, 2: 9 } })
    ]);
    const result = extractImagesFromChatRequest(request);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual([...result[0].data.buffer], [7, 8, 9]);
  });
  test("extracts restored image attachment from reordered plain object bytes", () => {
    const request = makeRequest([
      makeImageVariableEntry({ value: { 2: 9, 0: 7, 1: 8 } })
    ]);
    const result = extractImagesFromChatRequest(request);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual([...result[0].data.buffer], [7, 8, 9]);
  });
  test("does not treat a URI-backed image attachment as inline image bytes", () => {
    const uri = URI.file("/tmp/cat.png");
    const request = makeRequest([
      makeImageVariableEntry({ value: uri, references: [{ kind: "reference", reference: uri }] })
    ]);
    assert.deepStrictEqual(extractImagesFromChatRequest(request), []);
  });
  test("uses attachment resource URI when available", () => {
    const uri = URI.file("/tmp/cat.png");
    const request = makeRequest([
      makeImageVariableEntry({ value: new Uint8Array([1]), references: [{ kind: "reference", reference: uri }] })
    ]);
    const result = extractImagesFromChatRequest(request);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].uri.toString(), uri.toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdEltYWdlRXh0cmFjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElJbWFnZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UsIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEltYWdlc0Zyb21DaGF0UmVxdWVzdCwgZXh0cmFjdEltYWdlc0Zyb21DaGF0UmVzcG9uc2UsIGV4dHJhY3RJbWFnZXNGcm9tVG9vbEludm9jYXRpb25NZXNzYWdlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLmpzJztcblxuZnVuY3Rpb24gbWFrZVRvb2xJbnZvY2F0aW9uKG92ZXJyaWRlczogUGFydGlhbDxJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZD4gPSB7fSk6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHR0b29sQ2FsbElkOiAnY2FsbF8xJyxcblx0XHR0b29sSWQ6ICd0ZXN0LXRvb2wnLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0b29sJyxcblx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiB0b29sJyxcblx0XHRpc0NvbmZpcm1lZDogdHJ1ZSxcblx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VJbmxpbmVSZWZlcmVuY2UodXJpOiBVUkksIG5hbWU/OiBzdHJpbmcpOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdGlubGluZVJlZmVyZW5jZTogdXJpLFxuXHRcdG5hbWUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VSZXNwb25zZShpdGVtczogUmVhZG9ubHlBcnJheTxJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50Piwgb3B0czoge1xuXHRzZXNzaW9uUmVzb3VyY2U/OiBVUkk7XG5cdHJlcXVlc3RJZD86IHN0cmluZztcblx0aWQ/OiBzdHJpbmc7XG5cdHJlcXVlc3RNZXNzYWdlVGV4dD86IHN0cmluZztcblx0cmVxdWVzdFZhcmlhYmxlcz86IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0bm9NYXRjaGluZ1JlcXVlc3Q/OiBib29sZWFuO1xufSA9IHt9KTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB7XG5cdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IG9wdHMuc2Vzc2lvblJlc291cmNlID8/IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uJyk7XG5cdGNvbnN0IHJlcXVlc3RJZCA9IG9wdHMucmVxdWVzdElkID8/ICdyZXEtMSc7XG5cdGNvbnN0IHJlc3BvbnNlSWQgPSBvcHRzLmlkID8/ICdyZXNwLTEnO1xuXHRjb25zdCByZXF1ZXN0TWVzc2FnZVRleHQgPSBvcHRzLnJlcXVlc3RNZXNzYWdlVGV4dCA/PyAnU2hvdyBtZSBpbWFnZXMnO1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlc3BvbnNlSWQsXG5cdFx0cmVxdWVzdElkLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRyZXNwb25zZTogeyB2YWx1ZTogaXRlbXMgfSxcblx0XHRzZXNzaW9uOiB7XG5cdFx0XHRnZXRJdGVtczogKCkgPT4gb3B0cy5ub01hdGNoaW5nUmVxdWVzdCA/IFtdIDogW3tcblx0XHRcdFx0aWQ6IHJlcXVlc3RJZCxcblx0XHRcdFx0bWVzc2FnZVRleHQ6IHJlcXVlc3RNZXNzYWdlVGV4dCxcblx0XHRcdFx0bWVzc2FnZTogeyBwYXJ0czogW10sIHRleHQ6IHJlcXVlc3RNZXNzYWdlVGV4dCB9LFxuXHRcdFx0XHR2YXJpYWJsZXM6IG9wdHMucmVxdWVzdFZhcmlhYmxlcyA/PyBbXSxcblx0XHRcdH1dLFxuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xufVxuXG5jb25zdCBmYWtlUmVhZEZpbGUgPSAodXJpOiBVUkkpID0+IFByb21pc2UucmVzb2x2ZShWU0J1ZmZlci5mcm9tU3RyaW5nKGBkYXRhLWZvci0ke3VyaS5wYXRofWApKTtcblxuZnVuY3Rpb24gbWFrZVJlcXVlc3QodmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWxbJ3ZhcmlhYmxlcyddLCBvcHRzOiB7IGlkPzogc3RyaW5nOyBtZXNzYWdlVGV4dD86IHN0cmluZyB9ID0ge30pOiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBvcHRzLmlkID8/ICdyZXEtMScsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdGRhdGFJZDogJ2RhdGEtMScsXG5cdFx0dXNlcm5hbWU6ICd0ZXN0LXVzZXInLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogb3B0cy5tZXNzYWdlVGV4dCA/PyAnU2hvdyBtZSBpbWFnZXMnLCBwYXJ0czogW10gfSxcblx0XHRtZXNzYWdlVGV4dDogb3B0cy5tZXNzYWdlVGV4dCA/PyAnU2hvdyBtZSBpbWFnZXMnLFxuXHRcdGF0dGVtcHQ6IDAsXG5cdFx0dmFyaWFibGVzLFxuXHRcdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogdW5kZWZpbmVkLFxuXHRcdHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogdW5kZWZpbmVkLFxuXHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0aXNDb21wbGV0ZUFkZGVkUmVxdWVzdDogdHJ1ZSxcblx0XHRzbGFzaENvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHRhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQ6IGZhbHNlLFxuXHRcdHNob3VsZEJlQmxvY2tlZDogdW5kZWZpbmVkISxcblx0XHR0aW1lc3RhbXA6IDAsXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWw7XG59XG5cbmZ1bmN0aW9uIG1ha2VJbWFnZVZhcmlhYmxlRW50cnkob3ZlcnJpZGVzOiBQYXJ0aWFsPElJbWFnZVZhcmlhYmxlRW50cnk+ICYgUGljazxJSW1hZ2VWYXJpYWJsZUVudHJ5LCAndmFsdWUnPik6IElJbWFnZVZhcmlhYmxlRW50cnkge1xuXHRjb25zdCB7IHZhbHVlLCAuLi5yZXN0IH0gPSBvdmVycmlkZXM7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdpbWctMScsXG5cdFx0a2luZDogJ2ltYWdlJyxcblx0XHRuYW1lOiAnY2F0LnBuZycsXG5cdFx0dmFsdWUsXG5cdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdC4uLnJlc3QsXG5cdH07XG59XG5cbnN1aXRlKCdleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBpbWFnZXMgd2hlbiByZXNwb25zZSBoYXMgbm8gaXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoW10pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRpZDogcmVzcG9uc2Uuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgKyAnXycgKyByZXNwb25zZS5pZCxcblx0XHRcdHRpdGxlOiAnU2hvdyBtZSBpbWFnZXMnLFxuXHRcdFx0aW1hZ2VzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBkZWZhdWx0IHRpdGxlIHdoZW4gbm8gbWF0Y2hpbmcgcmVxdWVzdCBpcyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbXSwgeyBub01hdGNoaW5nUmVxdWVzdDogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRpdGxlLCAnSW1hZ2VzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYXR0YWNobWVudCBzdW1tYXJ5IHRpdGxlIHdoZW4gbWF0Y2hpbmcgcmVxdWVzdCBoYXMgbm8gbWVzc2FnZSB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGltYWdlID0gbWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdpbWFnZScpLmJ1ZmZlciB9KTtcblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbXSwgeyByZXF1ZXN0TWVzc2FnZVRleHQ6ICcnLCByZXF1ZXN0VmFyaWFibGVzOiBbaW1hZ2VdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudGl0bGUsICdBdHRhY2hlZCAxIGltYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIGltYWdlIGZyb20gdG9vbCBpbnZvY2F0aW9uIHdpdGggSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdERldGFpbHM6IElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQgPSB7XG5cdFx0XHRvdXRwdXQ6IHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGJhc2U2NERhdGE6ICdBUUlEJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGxfaW1nJyxcblx0XHRcdHRvb2xJZDogJ3NjcmVlbnNob3QtdG9vbCcsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnVG9vayBhIHNjcmVlbnNob3QnLFxuXHRcdFx0cmVzdWx0RGV0YWlscyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKFt0b29sSW52b2NhdGlvbl0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5pZCwgJ2NhbGxfaW1nXzAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5taW1lVHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW1hZ2VzWzBdLnNvdXJjZS5pbmNsdWRlcygnc2NyZWVuc2hvdC10b29sJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzWzBdLmNhcHRpb24sICdUb29rIGEgc2NyZWVuc2hvdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyBtdWx0aXBsZSBpbWFnZXMgZnJvbSB0b29sIGludm9jYXRpb24gd2l0aCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHREZXRhaWxzOiBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyA9IHtcblx0XHRcdGlucHV0OiAnJyxcblx0XHRcdG91dHB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdlbWJlZCcsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgdmFsdWU6ICdBUUlEJywgaXNUZXh0OiBmYWxzZSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdlbWJlZCcsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicsIHZhbHVlOiAndGV4dCcsIGlzVGV4dDogdHJ1ZSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdlbWJlZCcsIG1pbWVUeXBlOiAnaW1hZ2UvanBlZycsIHZhbHVlOiAnQkFVRycsIGlzVGV4dDogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG1ha2VUb29sSW52b2NhdGlvbih7XG5cdFx0XHR0b29sQ2FsbElkOiAnY2FsbF9tdWx0aScsXG5cdFx0XHR0b29sSWQ6ICdtdWx0aS10b29sJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdHZW5lcmF0ZWQgaW1hZ2VzJyxcblx0XHRcdHJlc3VsdERldGFpbHMsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbdG9vbEludm9jYXRpb25dKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0uaWQsICdjYWxsX211bHRpXzAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5taW1lVHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzWzFdLmlkLCAnY2FsbF9tdWx0aV8yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMV0ubWltZVR5cGUsICdpbWFnZS9qcGVnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHRvb2wgaW52b2NhdGlvbnMgd2l0aG91dCBpbWFnZSByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdERldGFpbHM6IElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQgPSB7XG5cdFx0XHRvdXRwdXQ6IHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nLCBiYXNlNjREYXRhOiAnYUdWc2JHOD0nIH0sXG5cdFx0fTtcblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG1ha2VUb29sSW52b2NhdGlvbih7IHJlc3VsdERldGFpbHMgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbdG9vbEludm9jYXRpb25dKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyBpbWFnZSBmcm9tIGlubGluZSByZWZlcmVuY2UgVVJJIHdoZW4gcmVhZEZpbGUgaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW1hZ2VVcmkgPSBVUkkuZmlsZSgnL3Bob3Rvcy9jYXQucG5nJyk7XG5cdFx0Y29uc3QgaW5saW5lUmVmID0gbWFrZUlubGluZVJlZmVyZW5jZShpbWFnZVVyaSwgJ2NhdC5wbmcnKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKFtpbmxpbmVSZWZdKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0udXJpLnRvU3RyaW5nKCksIGltYWdlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzWzBdLm5hbWUsICdjYXQucG5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0ubWltZVR5cGUsICdpbWFnZS9wbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5zb3VyY2UsICdGaWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIGltYWdlIGZyb20gaW5saW5lIHJlZmVyZW5jZSBMb2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbWFnZVVyaSA9IFVSSS5maWxlKCcvcGhvdG9zL2RvZy5qcGcnKTtcblx0XHRjb25zdCBpbmxpbmVSZWY6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSA9IHtcblx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7IHVyaTogaW1hZ2VVcmksIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKFtpbmxpbmVSZWZdKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0udXJpLnRvU3RyaW5nKCksIGltYWdlVXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBub24taW1hZ2UgaW5saW5lIHJlZmVyZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29kZVVyaSA9IFVSSS5maWxlKCcvc3JjL21haW4udHMnKTtcblx0XHRjb25zdCBpbmxpbmVSZWYgPSBtYWtlSW5saW5lUmVmZXJlbmNlKGNvZGVVcmkpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoW2lubGluZVJlZl0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZmlsZW5hbWUgZnJvbSBVUkkgcGF0aCB3aGVuIG5hbWUgaXMgbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGltYWdlVXJpID0gVVJJLmZpbGUoJy9hc3NldHMvYmFubmVyLmdpZicpO1xuXHRcdGNvbnN0IGlubGluZVJlZiA9IG1ha2VJbmxpbmVSZWZlcmVuY2UoaW1hZ2VVcmkpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoW2lubGluZVJlZl0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5uYW1lLCAnYmFubmVyLmdpZicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgaW50ZXJsZWF2ZWQgb3JkZXIgb2YgdG9vbCBhbmQgaW5saW5lIHJlZmVyZW5jZSBpbWFnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGxfZmlyc3QnLFxuXHRcdFx0dG9vbElkOiAndG9vbC0xJyxcblx0XHRcdHJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0b3V0cHV0OiB7IHR5cGU6ICdkYXRhJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBiYXNlNjREYXRhOiAnQVFJRCcgfSxcblx0XHRcdH0gc2F0aXNmaWVzIElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbmxpbmVSZWYgPSBtYWtlSW5saW5lUmVmZXJlbmNlKFVSSS5maWxlKCcvbWlkZGxlLnBuZycpLCAnbWlkZGxlLnBuZycpO1xuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24yID0gbWFrZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsX2xhc3QnLFxuXHRcdFx0dG9vbElkOiAndG9vbC0yJyxcblx0XHRcdHJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0b3V0cHV0OiB7IHR5cGU6ICdkYXRhJywgbWltZVR5cGU6ICdpbWFnZS9qcGVnJywgYmFzZTY0RGF0YTogJ0JBVUcnIH0sXG5cdFx0XHR9IHNhdGlzZmllcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoW3Rvb2xJbnZvY2F0aW9uLCBpbmxpbmVSZWYsIHRvb2xJbnZvY2F0aW9uMl0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5pZCwgJ2NhbGxfZmlyc3RfMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzWzFdLm5hbWUsICdtaWRkbGUucG5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMl0uaWQsICdjYWxsX2xhc3RfMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsZWN0aW9uIGlkIGNvbWJpbmVzIHNlc3Npb25SZXNvdXJjZSBhbmQgcmVzcG9uc2UgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L215LXNlc3Npb24nKTtcblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbXSwgeyBzZXNzaW9uUmVzb3VyY2UsIGlkOiAncmVzcG9uc2UtNDInIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaWQsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpICsgJ19yZXNwb25zZS00MicpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBpbmxpbmUgcmVmZXJlbmNlIHdoZW4gcmVhZEZpbGUgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW1hZ2VVcmkgPSBVUkkuZmlsZSgnL3Bob3Rvcy9taXNzaW5nLnBuZycpO1xuXHRcdGNvbnN0IGlubGluZVJlZiA9IG1ha2VJbmxpbmVSZWZlcmVuY2UoaW1hZ2VVcmksICdtaXNzaW5nLnBuZycpO1xuXHRcdGNvbnN0IGZhaWxpbmdSZWFkRmlsZSA9IChfdXJpOiBVUkkpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignRmlsZSBub3QgZm91bmQnKSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbaW5saW5lUmVmXSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0cmFjdEltYWdlc0Zyb21DaGF0UmVzcG9uc2UocmVzcG9uc2UsIGZhaWxpbmdSZWFkRmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgaW1hZ2VzIGZyb20gdG9vbCBpbnZvY2F0aW9uIG1lc3NhZ2UgVVJJcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbWFnZVVyaSA9IFVSSS5maWxlKCcvc2NyZWVuc2hvdHMvcmVzdWx0LnBuZycpO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbWFrZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsX21zZycsXG5cdFx0XHR0b29sSWQ6ICdzY3JlZW5zaG90LXRvb2wnLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyB2YWx1ZTogJ1Rvb2sgYSBzY3JlZW5zaG90JywgaXNUcnVzdGVkOiBmYWxzZSwgdXJpczogeyAnMCc6IGltYWdlVXJpLnRvSlNPTigpIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKFt0b29sSW52b2NhdGlvbl0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlc3BvbnNlKHJlc3BvbnNlLCBmYWtlUmVhZEZpbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS51cmkudG9TdHJpbmcoKSwgaW1hZ2VVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0ubmFtZSwgJ3Jlc3VsdC5wbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmltYWdlc1swXS5taW1lVHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdGNvbnN0IGNhcHRpb24gPSByZXN1bHQuaW1hZ2VzWzBdLmNhcHRpb247XG5cdFx0YXNzZXJ0Lm9rKGlzTWFya2Rvd25TdHJpbmcoY2FwdGlvbiksICdjYXB0aW9uIHNob3VsZCBiZSBhbiBJTWFya2Rvd25TdHJpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdGlvbi52YWx1ZSwgJ1Rvb2sgYSBzY3JlZW5zaG90Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbWJpbmVzIG91dHB1dCBkZXRhaWxzIGltYWdlcyBhbmQgbWVzc2FnZSBVUkkgaW1hZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGltYWdlVXJpID0gVVJJLmZpbGUoJy9zY3JlZW5zaG90cy9tc2ctaW1hZ2UuanBnJyk7XG5cdFx0Y29uc3QgcmVzdWx0RGV0YWlsczogSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCA9IHtcblx0XHRcdG91dHB1dDogeyB0eXBlOiAnZGF0YScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgYmFzZTY0RGF0YTogJ0FRSUQnIH0sXG5cdFx0fTtcblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG1ha2VUb29sSW52b2NhdGlvbih7XG5cdFx0XHR0b29sQ2FsbElkOiAnY2FsbF9ib3RoJyxcblx0XHRcdHRvb2xJZDogJ2NvbWJvLXRvb2wnLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyB2YWx1ZTogJ1JhbiBjb21ibyB0b29sJywgaXNUcnVzdGVkOiBmYWxzZSwgdXJpczogeyAnMCc6IGltYWdlVXJpLnRvSlNPTigpIH0gfSxcblx0XHRcdHJlc3VsdERldGFpbHMsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZShbdG9vbEludm9jYXRpb25dKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXNwb25zZShyZXNwb25zZSwgZmFrZVJlYWRGaWxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbWFnZXNbMF0uaWQsICdjYWxsX2JvdGhfMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW1hZ2VzWzFdLnVyaS50b1N0cmluZygpLCBpbWFnZVVyaS50b1N0cmluZygpKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2V4dHJhY3RJbWFnZXNGcm9tVG9vbEludm9jYXRpb25NZXNzYWdlcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB3aGVuIG1lc3NhZ2UgaXMgdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbWFrZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk1lc3NhZ2VzKHRvb2xJbnZvY2F0aW9uLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgd2hlbiBtZXNzYWdlIGlzIGEgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbWFrZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdzb21lIHN0cmluZyBtZXNzYWdlJyxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uTWVzc2FnZXModG9vbEludm9jYXRpb24sIGZha2VSZWFkRmlsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB3aGVuIG1lc3NhZ2UgaGFzIG5vIHVyaXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyB2YWx1ZTogJ05vIFVSSXMgaGVyZScsIGlzVHJ1c3RlZDogZmFsc2UgfSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uTWVzc2FnZXModG9vbEludm9jYXRpb24sIGZha2VSZWFkRmlsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB3aGVuIG1lc3NhZ2UgdXJpcyBhcmUgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyB2YWx1ZTogJ0VtcHR5IFVSSXMnLCBpc1RydXN0ZWQ6IGZhbHNlLCB1cmlzOiB7fSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tVG9vbEludm9jYXRpb25NZXNzYWdlcyh0b29sSW52b2NhdGlvbiwgZmFrZVJlYWRGaWxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBub24taW1hZ2UgVVJJcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG1ha2VUb29sSW52b2NhdGlvbih7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB7IHZhbHVlOiAnQ29kZSBmaWxlJywgaXNUcnVzdGVkOiBmYWxzZSwgdXJpczogeyAnMCc6IFVSSS5maWxlKCcvc3JjL21haW4udHMnKS50b0pTT04oKSB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk1lc3NhZ2VzKHRvb2xJbnZvY2F0aW9uLCBmYWtlUmVhZEZpbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIGltYWdlIGZyb20gbWVzc2FnZSBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW1hZ2VVcmkgPSBVUkkuZmlsZSgnL3NjcmVlbnNob3RzL2NhcHR1cmUucG5nJyk7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGxfdXJpJyxcblx0XHRcdHRvb2xJZDogJ3NjcmVlbnNob3QtdG9vbCcsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB7IHZhbHVlOiAnQ2FwdHVyZWQgc2NyZWVuc2hvdCcsIGlzVHJ1c3RlZDogZmFsc2UsIHVyaXM6IHsgJzAnOiBpbWFnZVVyaS50b0pTT04oKSB9IH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uTWVzc2FnZXModG9vbEludm9jYXRpb24sIGZha2VSZWFkRmlsZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS51cmkudG9TdHJpbmcoKSwgaW1hZ2VVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLCAnY2FwdHVyZS5wbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm1pbWVUeXBlLCAnaW1hZ2UvcG5nJyk7XG5cdFx0Y29uc3QgY2FwdGlvbiA9IHJlc3VsdFswXS5jYXB0aW9uO1xuXHRcdGFzc2VydC5vayhpc01hcmtkb3duU3RyaW5nKGNhcHRpb24pLCAnY2FwdGlvbiBzaG91bGQgYmUgYW4gSU1hcmtkb3duU3RyaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHRpb24udmFsdWUsICdDYXB0dXJlZCBzY3JlZW5zaG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdFswXS5zb3VyY2UuaW5jbHVkZXMoJ3NjcmVlbnNob3QtdG9vbCcpKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgbXVsdGlwbGUgaW1hZ2VzIGZyb20gbWVzc2FnZSBVUklzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaTEgPSBVUkkuZmlsZSgnL2ltZy9hLnBuZycpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkuZmlsZSgnL2ltZy9iLmpwZycpO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbWFrZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHtcblx0XHRcdFx0dmFsdWU6ICdHZW5lcmF0ZWQgaW1hZ2VzJyxcblx0XHRcdFx0aXNUcnVzdGVkOiBmYWxzZSxcblx0XHRcdFx0dXJpczogeyAnMCc6IHVyaTEudG9KU09OKCksICcxJzogdXJpMi50b0pTT04oKSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dHJhY3RJbWFnZXNGcm9tVG9vbEludm9jYXRpb25NZXNzYWdlcyh0b29sSW52b2NhdGlvbiwgZmFrZVJlYWRGaWxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm1pbWVUeXBlLCAnaW1hZ2UvcG5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5taW1lVHlwZSwgJ2ltYWdlL2pwZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250aW51ZXMgd2hlbiByZWFkRmlsZSBmYWlscyBmb3Igb25lIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnb29kVXJpID0gVVJJLmZpbGUoJy9pbWcvZ29vZC5wbmcnKTtcblx0XHRjb25zdCBiYWRVcmkgPSBVUkkuZmlsZSgnL2ltZy9iYWQucG5nJyk7XG5cdFx0Y29uc3QgZmFpbGluZ1JlYWRGaWxlID0gKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRpZiAodXJpLnBhdGguaW5jbHVkZXMoJ2JhZCcpKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0ZpbGUgbm90IGZvdW5kJykpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdpbWFnZS1kYXRhJykpO1xuXHRcdH07XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZToge1xuXHRcdFx0XHR2YWx1ZTogJ01peGVkIHJlc3VsdHMnLFxuXHRcdFx0XHRpc1RydXN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR1cmlzOiB7ICcwJzogYmFkVXJpLnRvSlNPTigpLCAnMSc6IGdvb2RVcmkudG9KU09OKCkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uTWVzc2FnZXModG9vbEludm9jYXRpb24sIGZhaWxpbmdSZWFkRmlsZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS51cmkudG9TdHJpbmcoKSwgZ29vZFVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBpbnZvY2F0aW9uTWVzc2FnZSB3aGVuIHBhc3RUZW5zZU1lc3NhZ2UgaXMgdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGltYWdlVXJpID0gVVJJLmZpbGUoJy9pbWcvZmFsbGJhY2sucG5nJyk7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBtYWtlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgdmFsdWU6ICdSdW5uaW5nIHRvb2wnLCBpc1RydXN0ZWQ6IGZhbHNlLCB1cmlzOiB7ICcwJzogaW1hZ2VVcmkudG9KU09OKCkgfSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk1lc3NhZ2VzKHRvb2xJbnZvY2F0aW9uLCBmYWtlUmVhZEZpbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGNhcHRpb24gPSByZXN1bHRbMF0uY2FwdGlvbjtcblx0XHRhc3NlcnQub2soaXNNYXJrZG93blN0cmluZyhjYXB0aW9uKSwgJ2NhcHRpb24gc2hvdWxkIGJlIGFuIElNYXJrZG93blN0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0aW9uLnZhbHVlLCAnUnVubmluZyB0b29sJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXF1ZXN0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdleHRyYWN0cyBpbWFnZSBhdHRhY2htZW50IGZyb20gVWludDhBcnJheScsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVJlcXVlc3QoW1xuXHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEltYWdlc0Zyb21DaGF0UmVxdWVzdChyZXF1ZXN0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdjYXQucG5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5taW1lVHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdFswXS5kYXRhLmJ1ZmZlcl0sIFsxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIGltYWdlIGF0dGFjaG1lbnQgZnJvbSBBcnJheUJ1ZmZlcicsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVJlcXVlc3QoW1xuXHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBuZXcgVWludDhBcnJheShbNCwgNSwgNl0pLmJ1ZmZlciB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlcXVlc3QocmVxdWVzdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0WzBdLmRhdGEuYnVmZmVyXSwgWzQsIDUsIDZdKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgcmVzdG9yZWQgaW1hZ2UgYXR0YWNobWVudCBmcm9tIHBsYWluIG9iamVjdCBieXRlcycsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVJlcXVlc3QoW1xuXHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiB7IDA6IDcsIDE6IDgsIDI6IDkgfSB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlcXVlc3QocmVxdWVzdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0WzBdLmRhdGEuYnVmZmVyXSwgWzcsIDgsIDldKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgcmVzdG9yZWQgaW1hZ2UgYXR0YWNobWVudCBmcm9tIHJlb3JkZXJlZCBwbGFpbiBvYmplY3QgYnl0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KFtcblx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoeyB2YWx1ZTogeyAyOiA5LCAwOiA3LCAxOiA4IH0gfSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SW1hZ2VzRnJvbUNoYXRSZXF1ZXN0KHJlcXVlc3QpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdFswXS5kYXRhLmJ1ZmZlcl0sIFs3LCA4LCA5XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHRyZWF0IGEgVVJJLWJhY2tlZCBpbWFnZSBhdHRhY2htZW50IGFzIGlubGluZSBpbWFnZSBieXRlcycsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3RtcC9jYXQucG5nJyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KFtcblx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoeyB2YWx1ZTogdXJpLCByZWZlcmVuY2VzOiBbeyBraW5kOiAncmVmZXJlbmNlJywgcmVmZXJlbmNlOiB1cmkgfV0gfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RJbWFnZXNGcm9tQ2hhdFJlcXVlc3QocmVxdWVzdCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBhdHRhY2htZW50IHJlc291cmNlIFVSSSB3aGVuIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3RtcC9jYXQucG5nJyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KFtcblx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoeyB2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzFdKSwgcmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogdXJpIH1dIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEltYWdlc0Zyb21DaGF0UmVxdWVzdChyZXF1ZXN0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnVyaS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBTXhELFNBQVMsOEJBQThCLCtCQUErQiwrQ0FBK0M7QUFFckgsU0FBUyxtQkFBbUIsWUFBb0QsQ0FBQyxHQUFrQztBQUNsSCxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZ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RyxHQUFHLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUVELFVBQU0sU0FBUyw2QkFBNkIsT0FBTztBQUVuRCxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxFQUFFLEtBQUssTUFBTSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsdUJBQXVCLEVBQUUsT0FBTyxFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFFRCxVQUFNLFNBQVMsNkJBQTZCLE9BQU87QUFFbkQsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sZ0JBQWdCLENBQUMsR0FBRyxPQUFPLENBQUMsRUFBRSxLQUFLLE1BQU0sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLE1BQU0sSUFBSSxLQUFLLGNBQWM7QUFDbkMsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQix1QkFBdUIsRUFBRSxPQUFPLEtBQUssWUFBWSxDQUFDLEVBQUUsTUFBTSxhQUFhLFdBQVcsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzNGLENBQUM7QUFFRCxXQUFPLGdCQUFnQiw2QkFBNkIsT0FBTyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELFVBQU0sTUFBTSxJQUFJLEtBQUssY0FBYztBQUNuQyxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLHVCQUF1QixFQUFFLE9BQU8sSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDLEVBQUUsTUFBTSxhQUFhLFdBQVcsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzNHLENBQUM7QUFFRCxVQUFNLFNBQVMsNkJBQTZCLE9BQU87QUFFbkQsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxJQUFJLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQztBQUFBLEVBQzVELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
