import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { URI } from "../../../../../base/common/uri.js";
import { buildCollectionArgs, buildSingleImageArgs, collectCarouselSections, findClickedImageIndex } from "../../browser/chatImageCarouselService.js";
import { ChatResponseResource } from "../../common/model/chatModel.js";
import { ToolDataSource } from "../../common/tools/languageModelToolsService.js";
suite("ChatImageCarouselService helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeRequest(id, variables, messageText = "Request") {
    return {
      id,
      sessionResource: URI.parse("chat-session://test/session"),
      dataId: `data-${id}`,
      username: "test-user",
      message: { text: messageText, parts: [] },
      messageText,
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
  function makeResponse(requestId, id = "resp-1", responseValue = []) {
    return {
      id,
      requestId,
      sessionResource: URI.parse("chat-session://test/session"),
      response: { value: responseValue },
      session: { getItems: () => [] },
      setVote: () => {
      }
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
  function makeImage(id, name = "img.png", mimeType = "image/png") {
    return { id, name, mimeType, data: new Uint8Array([1, 2, 3]) };
  }
  function makeSections(...imageCounts) {
    return imageCounts.map((count, sectionIdx) => ({
      title: `Section ${sectionIdx}`,
      images: Array.from(
        { length: count },
        (_, imgIdx) => makeImage(URI.file(`/image_s${sectionIdx}_i${imgIdx}.png`).toString(), `image_s${sectionIdx}_i${imgIdx}.png`)
      )
    }));
  }
  suite("findClickedImageIndex", () => {
    test("finds image by URI string match in first section", () => {
      const sections = makeSections(3);
      const targetUri = URI.parse(sections[0].images[1].id);
      assert.strictEqual(findClickedImageIndex(sections, targetUri), 1);
    });
    test("finds image by URI string match in second section", () => {
      const sections = makeSections(2, 3);
      const targetUri = URI.parse(sections[1].images[2].id);
      assert.strictEqual(findClickedImageIndex(sections, targetUri), 4);
    });
    test("returns -1 when no match found", () => {
      const sections = makeSections(2, 2);
      const unknownUri = URI.file("/nonexistent.png");
      assert.strictEqual(findClickedImageIndex(sections, unknownUri), -1);
    });
    test("falls back to data buffer match", () => {
      const sections = [{
        title: "Section",
        images: [
          { id: "custom-id-1", name: "a.png", mimeType: "image/png", data: new Uint8Array([10, 20]) },
          { id: "custom-id-2", name: "b.png", mimeType: "image/png", data: new Uint8Array([30, 40]) }
        ]
      }];
      const unknownUri = URI.from({ scheme: "data", path: "b.png" });
      assert.strictEqual(findClickedImageIndex(sections, unknownUri, new Uint8Array([30, 40])), 1);
    });
    test("prefers a later exact URI match over an earlier image with identical data", () => {
      const firstUri = URI.parse("vscode-chat-response-resource://session/tool-call-1/0/file.png");
      const secondUri = URI.parse("vscode-chat-response-resource://session/tool-call-2/0/file.png");
      const identicalData = new Uint8Array([10, 20, 30]);
      const sections = [
        {
          title: "Earlier",
          images: [
            { id: firstUri.toString(), name: "first.png", mimeType: "image/png", data: identicalData }
          ]
        },
        {
          title: "Later",
          images: [
            { id: secondUri.toString(), name: "second.png", mimeType: "image/png", data: identicalData }
          ]
        }
      ];
      assert.strictEqual(findClickedImageIndex(sections, secondUri, identicalData), 1);
    });
    test("prefers the current input section when the same URI appeared earlier", () => {
      const repeatedUri = URI.file("/repeated.png");
      const sections = [
        { title: "History", images: [{ id: repeatedUri.toString(), name: "historical.png", mimeType: "image/png", data: new Uint8Array([1]) }] },
        { title: "Current Input", images: [{ id: repeatedUri.toString(), name: "current.png", mimeType: "image/png", data: new Uint8Array([1]) }] }
      ];
      assert.strictEqual(findClickedImageIndex(sections, repeatedUri, new Uint8Array([1]), 1), 1);
    });
    test("returns -1 for empty sections", () => {
      assert.strictEqual(findClickedImageIndex([], URI.file("/x.png")), -1);
    });
  });
  suite("buildCollectionArgs", () => {
    test("uses section title when single section", () => {
      const sections = makeSections(2);
      const result = buildCollectionArgs(sections, 0, URI.file("/session"));
      assert.deepStrictEqual(result, {
        collection: {
          id: URI.file("/session").toString() + "_carousel",
          title: "Section 0",
          sections
        },
        startIndex: 0
      });
    });
    test("uses generic title for multiple sections", () => {
      const sections = makeSections(1, 1);
      const result = buildCollectionArgs(sections, 1, URI.file("/session"));
      assert.strictEqual(result.collection.title, "Conversation Images");
      assert.strictEqual(result.startIndex, 1);
    });
    test("falls back to default title when single section has empty title", () => {
      const sections = [{
        title: "",
        images: [makeImage(URI.file("/img.png").toString())]
      }];
      const result = buildCollectionArgs(sections, 0, URI.file("/session"));
      assert.strictEqual(result.collection.title, "Conversation Images");
    });
  });
  suite("buildSingleImageArgs", () => {
    test("extracts name and mime from URI path", () => {
      const uri = URI.file("/path/to/photo.jpg");
      const data = new Uint8Array([1, 2, 3]);
      assert.deepStrictEqual(buildSingleImageArgs(uri, data), {
        name: "photo.jpg",
        mimeType: "image/jpg",
        data,
        title: "photo.jpg"
      });
    });
    test("defaults mime to image/png for unknown extension", () => {
      const uri = URI.file("/path/to/file.xyz");
      const data = new Uint8Array([1]);
      assert.strictEqual(buildSingleImageArgs(uri, data).mimeType, "image/png");
    });
    test("decodes percent-encoded filename for display", () => {
      const uri = URI.file("/path/to/Element%20Screenshot.png");
      const data = new Uint8Array([1, 2, 3]);
      assert.deepStrictEqual(buildSingleImageArgs(uri, data), {
        name: "Element Screenshot.png",
        mimeType: "image/png",
        data,
        title: "Element Screenshot.png"
      });
    });
  });
  suite("collectCarouselSections", () => {
    test("collects request attachment images for pending requests", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
      ], "Pending request");
      const result = await collectCarouselSections([request], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, "Pending request");
      assert.strictEqual(result[0].images.length, 1);
      assert.deepStrictEqual({
        id: result[0].images[0].id,
        name: result[0].images[0].name,
        mimeType: result[0].images[0].mimeType,
        data: [...result[0].images[0].data]
      }, {
        id: URI.from({ scheme: "data", path: "img-1/cat.png" }).toString(),
        name: "cat.png",
        mimeType: "image/png",
        data: [1, 2, 3]
      });
    });
    test("collects all current input image attachments", async () => {
      const attachments = [
        makeImageVariableEntry({ id: "img-1", name: "first.png", value: new Uint8Array([1]) }),
        makeImageVariableEntry({ id: "img-2", name: "second.png", value: new Uint8Array([2]) }),
        makeImageVariableEntry({ id: "img-3", name: "third.png", value: new Uint8Array([3]) })
      ];
      const result = await collectCarouselSections([], async () => new Uint8Array(), { text: "", attachments });
      assert.deepStrictEqual(result.map((section) => ({
        ...section,
        images: section.images.map((image) => ({ ...image, data: [...image.data] }))
      })), [{
        title: "Current Input",
        images: [
          { id: "data:img-1/first.png", name: "first.png", mimeType: "image/png", data: [1], caption: void 0 },
          { id: "data:img-2/second.png", name: "second.png", mimeType: "image/png", data: [2], caption: void 0 },
          { id: "data:img-3/third.png", name: "third.png", mimeType: "image/png", data: [3], caption: void 0 }
        ]
      }]);
    });
    test("collects request attachment images restored as plain objects", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: { 0: 4, 1: 5, 2: 6 } })
      ], "Pending request");
      const result = await collectCarouselSections([request], async () => new Uint8Array());
      assert.deepStrictEqual([...result[0].images[0].data], [4, 5, 6]);
    });
    test("merges request images into matching response section", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
      ], "Show me images");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async (uri) => VSBuffer.fromString(`data-for-${uri.path}`).buffer);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, "Show me images");
      assert.strictEqual(result[0].images.length, 1);
      assert.strictEqual(result[0].images[0].name, "cat.png");
    });
    test("prefers paired request message text over extracted response title", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
      ], "Request title wins");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].title, "Request title wins");
    });
    test("does not duplicate request images when response exists", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
      ], "Show me images");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].images.length, 1);
    });
    test("deduplicates consecutive images with the same URI", async () => {
      const uri = URI.file("/screenshot.png");
      const request = makeRequest("req-1", [
        makeImageVariableEntry({
          value: new Uint8Array([1, 2, 3]),
          references: [{ reference: uri, kind: "reference" }]
        }),
        makeImageVariableEntry({
          id: "img-2",
          value: new Uint8Array([1, 2, 3]),
          references: [{ reference: uri, kind: "reference" }]
        })
      ], "Two same images");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].images.length, 1);
    });
    test("keeps non-consecutive images with the same URI", async () => {
      const uri = URI.file("/screenshot.png");
      const otherUri = URI.file("/other.png");
      const request = makeRequest("req-1", [
        makeImageVariableEntry({
          value: new Uint8Array([1, 2, 3]),
          references: [{ reference: uri, kind: "reference" }]
        }),
        makeImageVariableEntry({
          id: "img-2",
          name: "other.png",
          value: new Uint8Array([4, 5, 6]),
          references: [{ reference: otherUri, kind: "reference" }]
        }),
        makeImageVariableEntry({
          id: "img-3",
          value: new Uint8Array([1, 2, 3]),
          references: [{ reference: uri, kind: "reference" }]
        })
      ], "Non-consecutive duplicates");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].images.length, 3);
    });
    test("uses tool image URIs as carousel image ids", async () => {
      const request = makeRequest("req-1", [], "Request with tool output image");
      const toolCallId = "tool-call-1";
      const sessionResource = URI.parse("chat-session://test/session");
      const expectedUri = ChatResponseResource.createUri(sessionResource, toolCallId, 0, "file.png").toString();
      const response = makeResponse("req-1", "resp-1", [
        {
          kind: "toolInvocationSerialized",
          toolId: "test_tool",
          toolCallId,
          invocationMessage: "Took screenshot",
          originMessage: void 0,
          pastTenseMessage: void 0,
          presentation: void 0,
          resultDetails: {
            output: {
              type: "data",
              mimeType: "image/png",
              base64Data: "AQID"
            }
          },
          isConfirmed: { type: 0 },
          isComplete: true,
          source: ToolDataSource.Internal,
          generatedTitle: void 0,
          isAttachedToThinking: false
        }
      ]);
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].images.length, 1);
      assert.strictEqual(result[0].images[0].id, expectedUri);
      assert.strictEqual(result[0].images[0].caption, "Took screenshot");
    });
    test("strips markdown from tool invocation message captions", async () => {
      const imageUri = URI.file("/screenshots/homepage.png");
      const request = makeRequest("req-1", [], "Take a screenshot");
      const response = makeResponse("req-1", "resp-1", [
        {
          kind: "toolInvocationSerialized",
          toolId: "view_image",
          toolCallId: "tool-call-1",
          invocationMessage: "Viewing image",
          originMessage: void 0,
          pastTenseMessage: { value: "Viewed image [](file:///screenshots/homepage.png)", isTrusted: false, uris: { "0": imageUri.toJSON() } },
          presentation: void 0,
          resultDetails: void 0,
          isConfirmed: { type: 0 },
          isComplete: true,
          source: ToolDataSource.Internal,
          generatedTitle: void 0,
          isAttachedToThinking: false
        }
      ]);
      const result = await collectCarouselSections([request, response], async () => new Uint8Array([1, 2, 3]));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].images.length, 1);
      assert.strictEqual(result[0].images[0].caption, "Viewed image homepage.png");
    });
    test("image data is a plain Uint8Array usable by Blob constructor", async () => {
      const request = makeRequest("req-1", [
        makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })
      ], "Screenshot request");
      const response = makeResponse("req-1");
      const result = await collectCarouselSections([request, response], async () => new Uint8Array());
      assert.strictEqual(result.length, 1);
      const data = result[0].images[0].data;
      assert.ok(data instanceof Uint8Array, "image data should be Uint8Array");
      assert.deepStrictEqual([...data], [1, 2, 3]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRJbWFnZUNhcm91c2VsU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYnVpbGRDb2xsZWN0aW9uQXJncywgYnVpbGRTaW5nbGVJbWFnZUFyZ3MsIGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zLCBmaW5kQ2xpY2tlZEltYWdlSW5kZXgsIElDYXJvdXNlbFNlY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUltYWdlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIGhlbHBlcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VSZXF1ZXN0KGlkOiBzdHJpbmcsIHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0Vmlld01vZGVsWyd2YXJpYWJsZXMnXSwgbWVzc2FnZVRleHQ6IHN0cmluZyA9ICdSZXF1ZXN0Jyk6IElDaGF0UmVxdWVzdFZpZXdNb2RlbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdFx0ZGF0YUlkOiBgZGF0YS0ke2lkfWAsXG5cdFx0XHR1c2VybmFtZTogJ3Rlc3QtdXNlcicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6IG1lc3NhZ2VUZXh0LCBwYXJ0czogW10gfSxcblx0XHRcdG1lc3NhZ2VUZXh0LFxuXHRcdFx0YXR0ZW1wdDogMCxcblx0XHRcdHZhcmlhYmxlcyxcblx0XHRcdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvdWxkQmVSZW1vdmVkT25TZW5kOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aXNDb21wbGV0ZUFkZGVkUmVxdWVzdDogdHJ1ZSxcblx0XHRcdHNsYXNoQ29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0YWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkOiBmYWxzZSxcblx0XHRcdHNob3VsZEJlQmxvY2tlZDogdW5kZWZpbmVkISxcblx0XHRcdHRpbWVzdGFtcDogMCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVJlc3BvbnNlKHJlcXVlc3RJZDogc3RyaW5nLCBpZDogc3RyaW5nID0gJ3Jlc3AtMScsIHJlc3BvbnNlVmFsdWU6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ3Jlc3BvbnNlJ11bJ3ZhbHVlJ10gPSBbXSk6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24nKSxcblx0XHRcdHJlc3BvbnNlOiB7IHZhbHVlOiByZXNwb25zZVZhbHVlIH0sXG5cdFx0XHRzZXNzaW9uOiB7IGdldEl0ZW1zOiAoKSA9PiBbXSB9LFxuXHRcdFx0c2V0Vm90ZTogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUltYWdlVmFyaWFibGVFbnRyeShvdmVycmlkZXM6IFBhcnRpYWw8SUltYWdlVmFyaWFibGVFbnRyeT4gJiBQaWNrPElJbWFnZVZhcmlhYmxlRW50cnksICd2YWx1ZSc+KTogSUltYWdlVmFyaWFibGVFbnRyeSB7XG5cdFx0Y29uc3QgeyB2YWx1ZSwgLi4ucmVzdCB9ID0gb3ZlcnJpZGVzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogJ2ltZy0xJyxcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRuYW1lOiAnY2F0LnBuZycsXG5cdFx0XHR2YWx1ZSxcblx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdC4uLnJlc3QsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VJbWFnZShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcgPSAnaW1nLnBuZycsIG1pbWVUeXBlOiBzdHJpbmcgPSAnaW1hZ2UvcG5nJyk6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBtaW1lVHlwZTogc3RyaW5nOyBkYXRhOiBVaW50OEFycmF5IH0ge1xuXHRcdHJldHVybiB7IGlkLCBuYW1lLCBtaW1lVHlwZSwgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVNlY3Rpb25zKC4uLmltYWdlQ291bnRzOiBudW1iZXJbXSk6IElDYXJvdXNlbFNlY3Rpb25bXSB7XG5cdFx0cmV0dXJuIGltYWdlQ291bnRzLm1hcCgoY291bnQsIHNlY3Rpb25JZHgpID0+ICh7XG5cdFx0XHR0aXRsZTogYFNlY3Rpb24gJHtzZWN0aW9uSWR4fWAsXG5cdFx0XHRpbWFnZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IGNvdW50IH0sIChfLCBpbWdJZHgpID0+XG5cdFx0XHRcdG1ha2VJbWFnZShVUkkuZmlsZShgL2ltYWdlX3Mke3NlY3Rpb25JZHh9X2kke2ltZ0lkeH0ucG5nYCkudG9TdHJpbmcoKSwgYGltYWdlX3Mke3NlY3Rpb25JZHh9X2kke2ltZ0lkeH0ucG5nYClcblx0XHRcdCksXG5cdFx0fSkpO1xuXHR9XG5cblx0c3VpdGUoJ2ZpbmRDbGlja2VkSW1hZ2VJbmRleCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZpbmRzIGltYWdlIGJ5IFVSSSBzdHJpbmcgbWF0Y2ggaW4gZmlyc3Qgc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gbWFrZVNlY3Rpb25zKDMpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0VXJpID0gVVJJLnBhcnNlKHNlY3Rpb25zWzBdLmltYWdlc1sxXS5pZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENsaWNrZWRJbWFnZUluZGV4KHNlY3Rpb25zLCB0YXJnZXRVcmkpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGltYWdlIGJ5IFVSSSBzdHJpbmcgbWF0Y2ggaW4gc2Vjb25kIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IG1ha2VTZWN0aW9ucygyLCAzKTtcblx0XHRcdGNvbnN0IHRhcmdldFVyaSA9IFVSSS5wYXJzZShzZWN0aW9uc1sxXS5pbWFnZXNbMl0uaWQpO1xuXHRcdFx0Ly8gZ2xvYmFsT2Zmc2V0ID0gMiAoZmlyc3Qgc2VjdGlvbikgKyAyICh0aGlyZCBpbiBzZWNvbmQgc2VjdGlvbikgPSA0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENsaWNrZWRJbWFnZUluZGV4KHNlY3Rpb25zLCB0YXJnZXRVcmkpLCA0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgLTEgd2hlbiBubyBtYXRjaCBmb3VuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gbWFrZVNlY3Rpb25zKDIsIDIpO1xuXHRcdFx0Y29uc3QgdW5rbm93blVyaSA9IFVSSS5maWxlKCcvbm9uZXhpc3RlbnQucG5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENsaWNrZWRJbWFnZUluZGV4KHNlY3Rpb25zLCB1bmtub3duVXJpKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBkYXRhIGJ1ZmZlciBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlY3Rpb25zOiBJQ2Fyb3VzZWxTZWN0aW9uW10gPSBbe1xuXHRcdFx0XHR0aXRsZTogJ1NlY3Rpb24nLFxuXHRcdFx0XHRpbWFnZXM6IFtcblx0XHRcdFx0XHR7IGlkOiAnY3VzdG9tLWlkLTEnLCBuYW1lOiAnYS5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IG5ldyBVaW50OEFycmF5KFsxMCwgMjBdKSB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdjdXN0b20taWQtMicsIG5hbWU6ICdiLnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzMwLCA0MF0pIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IHVua25vd25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2RhdGEnLCBwYXRoOiAnYi5wbmcnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRDbGlja2VkSW1hZ2VJbmRleChzZWN0aW9ucywgdW5rbm93blVyaSwgbmV3IFVpbnQ4QXJyYXkoWzMwLCA0MF0pKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIGEgbGF0ZXIgZXhhY3QgVVJJIG1hdGNoIG92ZXIgYW4gZWFybGllciBpbWFnZSB3aXRoIGlkZW50aWNhbCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXJlc3BvbnNlLXJlc291cmNlOi8vc2Vzc2lvbi90b29sLWNhbGwtMS8wL2ZpbGUucG5nJyk7XG5cdFx0XHRjb25zdCBzZWNvbmRVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXJlc3BvbnNlLXJlc291cmNlOi8vc2Vzc2lvbi90b29sLWNhbGwtMi8wL2ZpbGUucG5nJyk7XG5cdFx0XHRjb25zdCBpZGVudGljYWxEYXRhID0gbmV3IFVpbnQ4QXJyYXkoWzEwLCAyMCwgMzBdKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zOiBJQ2Fyb3VzZWxTZWN0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0aXRsZTogJ0VhcmxpZXInLFxuXHRcdFx0XHRcdGltYWdlczogW1xuXHRcdFx0XHRcdFx0eyBpZDogZmlyc3RVcmkudG9TdHJpbmcoKSwgbmFtZTogJ2ZpcnN0LnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogaWRlbnRpY2FsRGF0YSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0aXRsZTogJ0xhdGVyJyxcblx0XHRcdFx0XHRpbWFnZXM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6IHNlY29uZFVyaS50b1N0cmluZygpLCBuYW1lOiAnc2Vjb25kLnBuZycsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogaWRlbnRpY2FsRGF0YSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENsaWNrZWRJbWFnZUluZGV4KHNlY3Rpb25zLCBzZWNvbmRVcmksIGlkZW50aWNhbERhdGEpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZWZlcnMgdGhlIGN1cnJlbnQgaW5wdXQgc2VjdGlvbiB3aGVuIHRoZSBzYW1lIFVSSSBhcHBlYXJlZCBlYXJsaWVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwZWF0ZWRVcmkgPSBVUkkuZmlsZSgnL3JlcGVhdGVkLnBuZycpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnM6IElDYXJvdXNlbFNlY3Rpb25bXSA9IFtcblx0XHRcdFx0eyB0aXRsZTogJ0hpc3RvcnknLCBpbWFnZXM6IFt7IGlkOiByZXBlYXRlZFVyaS50b1N0cmluZygpLCBuYW1lOiAnaGlzdG9yaWNhbC5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IG5ldyBVaW50OEFycmF5KFsxXSkgfV0gfSxcblx0XHRcdFx0eyB0aXRsZTogJ0N1cnJlbnQgSW5wdXQnLCBpbWFnZXM6IFt7IGlkOiByZXBlYXRlZFVyaS50b1N0cmluZygpLCBuYW1lOiAnY3VycmVudC5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IG5ldyBVaW50OEFycmF5KFsxXSkgfV0gfSxcblx0XHRcdF07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQ2xpY2tlZEltYWdlSW5kZXgoc2VjdGlvbnMsIHJlcGVhdGVkVXJpLCBuZXcgVWludDhBcnJheShbMV0pLCAxKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIC0xIGZvciBlbXB0eSBzZWN0aW9ucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQ2xpY2tlZEltYWdlSW5kZXgoW10sIFVSSS5maWxlKCcveC5wbmcnKSksIC0xKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQ29sbGVjdGlvbkFyZ3MnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd1c2VzIHNlY3Rpb24gdGl0bGUgd2hlbiBzaW5nbGUgc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gbWFrZVNlY3Rpb25zKDIpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRDb2xsZWN0aW9uQXJncyhzZWN0aW9ucywgMCwgVVJJLmZpbGUoJy9zZXNzaW9uJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0Y29sbGVjdGlvbjoge1xuXHRcdFx0XHRcdGlkOiBVUkkuZmlsZSgnL3Nlc3Npb24nKS50b1N0cmluZygpICsgJ19jYXJvdXNlbCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdTZWN0aW9uIDAnLFxuXHRcdFx0XHRcdHNlY3Rpb25zLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGFydEluZGV4OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGdlbmVyaWMgdGl0bGUgZm9yIG11bHRpcGxlIHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBtYWtlU2VjdGlvbnMoMSwgMSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBidWlsZENvbGxlY3Rpb25BcmdzKHNlY3Rpb25zLCAxLCBVUkkuZmlsZSgnL3Nlc3Npb24nKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbGxlY3Rpb24udGl0bGUsICdDb252ZXJzYXRpb24gSW1hZ2VzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0SW5kZXgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBkZWZhdWx0IHRpdGxlIHdoZW4gc2luZ2xlIHNlY3Rpb24gaGFzIGVtcHR5IHRpdGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnM6IElDYXJvdXNlbFNlY3Rpb25bXSA9IFt7XG5cdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0aW1hZ2VzOiBbbWFrZUltYWdlKFVSSS5maWxlKCcvaW1nLnBuZycpLnRvU3RyaW5nKCkpXSxcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRDb2xsZWN0aW9uQXJncyhzZWN0aW9ucywgMCwgVVJJLmZpbGUoJy9zZXNzaW9uJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb2xsZWN0aW9uLnRpdGxlLCAnQ29udmVyc2F0aW9uIEltYWdlcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRTaW5nbGVJbWFnZUFyZ3MnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBuYW1lIGFuZCBtaW1lIGZyb20gVVJJIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3BhdGgvdG8vcGhvdG8uanBnJyk7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTaW5nbGVJbWFnZUFyZ3ModXJpLCBkYXRhKSwge1xuXHRcdFx0XHRuYW1lOiAncGhvdG8uanBnJyxcblx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9qcGcnLFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0XHR0aXRsZTogJ3Bob3RvLmpwZycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIG1pbWUgdG8gaW1hZ2UvcG5nIGZvciB1bmtub3duIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvcGF0aC90by9maWxlLnh5eicpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KFsxXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTaW5nbGVJbWFnZUFyZ3ModXJpLCBkYXRhKS5taW1lVHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVjb2RlcyBwZXJjZW50LWVuY29kZWQgZmlsZW5hbWUgZm9yIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3BhdGgvdG8vRWxlbWVudCUyMFNjcmVlbnNob3QucG5nJyk7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTaW5nbGVJbWFnZUFyZ3ModXJpLCBkYXRhKSwge1xuXHRcdFx0XHRuYW1lOiAnRWxlbWVudCBTY3JlZW5zaG90LnBuZycsXG5cdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0ZGF0YSxcblx0XHRcdFx0dGl0bGU6ICdFbGVtZW50IFNjcmVlbnNob3QucG5nJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29sbGVjdENhcm91c2VsU2VjdGlvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb2xsZWN0cyByZXF1ZXN0IGF0dGFjaG1lbnQgaW1hZ2VzIGZvciBwZW5kaW5nIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KCdyZXEtMScsIFtcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pIH0pLFxuXHRcdFx0XSwgJ1BlbmRpbmcgcmVxdWVzdCcpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2xsZWN0Q2Fyb3VzZWxTZWN0aW9ucyhbcmVxdWVzdF0sIGFzeW5jICgpID0+IG5ldyBVaW50OEFycmF5KCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnRpdGxlLCAnUGVuZGluZyByZXF1ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmltYWdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlkOiByZXN1bHRbMF0uaW1hZ2VzWzBdLmlkLFxuXHRcdFx0XHRuYW1lOiByZXN1bHRbMF0uaW1hZ2VzWzBdLm5hbWUsXG5cdFx0XHRcdG1pbWVUeXBlOiByZXN1bHRbMF0uaW1hZ2VzWzBdLm1pbWVUeXBlLFxuXHRcdFx0XHRkYXRhOiBbLi4ucmVzdWx0WzBdLmltYWdlc1swXS5kYXRhXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IFVSSS5mcm9tKHsgc2NoZW1lOiAnZGF0YScsIHBhdGg6ICdpbWctMS9jYXQucG5nJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lOiAnY2F0LnBuZycsXG5cdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0ZGF0YTogWzEsIDIsIDNdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2xsZWN0cyBhbGwgY3VycmVudCBpbnB1dCBpbWFnZSBhdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW1xuXHRcdFx0XHRtYWtlSW1hZ2VWYXJpYWJsZUVudHJ5KHsgaWQ6ICdpbWctMScsIG5hbWU6ICdmaXJzdC5wbmcnLCB2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzFdKSB9KSxcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IGlkOiAnaW1nLTInLCBuYW1lOiAnc2Vjb25kLnBuZycsIHZhbHVlOiBuZXcgVWludDhBcnJheShbMl0pIH0pLFxuXHRcdFx0XHRtYWtlSW1hZ2VWYXJpYWJsZUVudHJ5KHsgaWQ6ICdpbWctMycsIG5hbWU6ICd0aGlyZC5wbmcnLCB2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzNdKSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zKFtdLCBhc3luYyAoKSA9PiBuZXcgVWludDhBcnJheSgpLCB7IHRleHQ6ICcnLCBhdHRhY2htZW50cyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNlY3Rpb24gPT4gKHtcblx0XHRcdFx0Li4uc2VjdGlvbixcblx0XHRcdFx0aW1hZ2VzOiBzZWN0aW9uLmltYWdlcy5tYXAoaW1hZ2UgPT4gKHsgLi4uaW1hZ2UsIGRhdGE6IFsuLi5pbWFnZS5kYXRhXSB9KSksXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdHRpdGxlOiAnQ3VycmVudCBJbnB1dCcsXG5cdFx0XHRcdGltYWdlczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdkYXRhOmltZy0xL2ZpcnN0LnBuZycsIG5hbWU6ICdmaXJzdC5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IFsxXSwgY2FwdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2RhdGE6aW1nLTIvc2Vjb25kLnBuZycsIG5hbWU6ICdzZWNvbmQucG5nJywgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBkYXRhOiBbMl0sIGNhcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdkYXRhOmltZy0zL3RoaXJkLnBuZycsIG5hbWU6ICd0aGlyZC5wbmcnLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IFszXSwgY2FwdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2xsZWN0cyByZXF1ZXN0IGF0dGFjaG1lbnQgaW1hZ2VzIHJlc3RvcmVkIGFzIHBsYWluIG9iamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVJlcXVlc3QoJ3JlcS0xJywgW1xuXHRcdFx0XHRtYWtlSW1hZ2VWYXJpYWJsZUVudHJ5KHsgdmFsdWU6IHsgMDogNCwgMTogNSwgMjogNiB9IH0pLFxuXHRcdFx0XSwgJ1BlbmRpbmcgcmVxdWVzdCcpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2xsZWN0Q2Fyb3VzZWxTZWN0aW9ucyhbcmVxdWVzdF0sIGFzeW5jICgpID0+IG5ldyBVaW50OEFycmF5KCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5yZXN1bHRbMF0uaW1hZ2VzWzBdLmRhdGFdLCBbNCwgNSwgNl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2VzIHJlcXVlc3QgaW1hZ2VzIGludG8gbWF0Y2hpbmcgcmVzcG9uc2Ugc2VjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtYWtlUmVxdWVzdCgncmVxLTEnLCBbXG5cdFx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoeyB2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSB9KSxcblx0XHRcdF0sICdTaG93IG1lIGltYWdlcycpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoJ3JlcS0xJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zKFtyZXF1ZXN0LCByZXNwb25zZV0sIGFzeW5jIHVyaSA9PiBWU0J1ZmZlci5mcm9tU3RyaW5nKGBkYXRhLWZvci0ke3VyaS5wYXRofWApLmJ1ZmZlcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0udGl0bGUsICdTaG93IG1lIGltYWdlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbWFnZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaW1hZ2VzWzBdLm5hbWUsICdjYXQucG5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIHBhaXJlZCByZXF1ZXN0IG1lc3NhZ2UgdGV4dCBvdmVyIGV4dHJhY3RlZCByZXNwb25zZSB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtYWtlUmVxdWVzdCgncmVxLTEnLCBbXG5cdFx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoeyB2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSB9KSxcblx0XHRcdF0sICdSZXF1ZXN0IHRpdGxlIHdpbnMnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKCdyZXEtMScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2xsZWN0Q2Fyb3VzZWxTZWN0aW9ucyhbcmVxdWVzdCwgcmVzcG9uc2VdLCBhc3luYyAoKSA9PiBuZXcgVWludDhBcnJheSgpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS50aXRsZSwgJ1JlcXVlc3QgdGl0bGUgd2lucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZHVwbGljYXRlIHJlcXVlc3QgaW1hZ2VzIHdoZW4gcmVzcG9uc2UgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KCdyZXEtMScsIFtcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pIH0pLFxuXHRcdFx0XSwgJ1Nob3cgbWUgaW1hZ2VzJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IG1ha2VSZXNwb25zZSgncmVxLTEnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29sbGVjdENhcm91c2VsU2VjdGlvbnMoW3JlcXVlc3QsIHJlc3BvbnNlXSwgYXN5bmMgKCkgPT4gbmV3IFVpbnQ4QXJyYXkoKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaW1hZ2VzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWR1cGxpY2F0ZXMgY29uc2VjdXRpdmUgaW1hZ2VzIHdpdGggdGhlIHNhbWUgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zY3JlZW5zaG90LnBuZycpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KCdyZXEtMScsIFtcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7XG5cdFx0XHRcdFx0dmFsdWU6IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSksXG5cdFx0XHRcdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiB1cmksIGtpbmQ6ICdyZWZlcmVuY2UnIH1dLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7XG5cdFx0XHRcdFx0aWQ6ICdpbWctMicsXG5cdFx0XHRcdFx0dmFsdWU6IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSksXG5cdFx0XHRcdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiB1cmksIGtpbmQ6ICdyZWZlcmVuY2UnIH1dLFxuXHRcdFx0XHR9KSxcblx0XHRcdF0sICdUd28gc2FtZSBpbWFnZXMnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKCdyZXEtMScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2xsZWN0Q2Fyb3VzZWxTZWN0aW9ucyhbcmVxdWVzdCwgcmVzcG9uc2VdLCBhc3luYyAoKSA9PiBuZXcgVWludDhBcnJheSgpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbWFnZXMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIG5vbi1jb25zZWN1dGl2ZSBpbWFnZXMgd2l0aCB0aGUgc2FtZSBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NjcmVlbnNob3QucG5nJyk7XG5cdFx0XHRjb25zdCBvdGhlclVyaSA9IFVSSS5maWxlKCcvb3RoZXIucG5nJyk7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVJlcXVlc3QoJ3JlcS0xJywgW1xuXHRcdFx0XHRtYWtlSW1hZ2VWYXJpYWJsZUVudHJ5KHtcblx0XHRcdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzOiBbeyByZWZlcmVuY2U6IHVyaSwga2luZDogJ3JlZmVyZW5jZScgfV0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRtYWtlSW1hZ2VWYXJpYWJsZUVudHJ5KHtcblx0XHRcdFx0XHRpZDogJ2ltZy0yJyxcblx0XHRcdFx0XHRuYW1lOiAnb3RoZXIucG5nJyxcblx0XHRcdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzQsIDUsIDZdKSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzOiBbeyByZWZlcmVuY2U6IG90aGVyVXJpLCBraW5kOiAncmVmZXJlbmNlJyB9XSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdG1ha2VJbWFnZVZhcmlhYmxlRW50cnkoe1xuXHRcdFx0XHRcdGlkOiAnaW1nLTMnLFxuXHRcdFx0XHRcdHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pLFxuXHRcdFx0XHRcdHJlZmVyZW5jZXM6IFt7IHJlZmVyZW5jZTogdXJpLCBraW5kOiAncmVmZXJlbmNlJyB9XSxcblx0XHRcdFx0fSksXG5cdFx0XHRdLCAnTm9uLWNvbnNlY3V0aXZlIGR1cGxpY2F0ZXMnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKCdyZXEtMScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2xsZWN0Q2Fyb3VzZWxTZWN0aW9ucyhbcmVxdWVzdCwgcmVzcG9uc2VdLCBhc3luYyAoKSA9PiBuZXcgVWludDhBcnJheSgpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbWFnZXMubGVuZ3RoLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdG9vbCBpbWFnZSBVUklzIGFzIGNhcm91c2VsIGltYWdlIGlkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtYWtlUmVxdWVzdCgncmVxLTEnLCBbXSwgJ1JlcXVlc3Qgd2l0aCB0b29sIG91dHB1dCBpbWFnZScpO1xuXHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9ICd0b29sLWNhbGwtMSc7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRVcmkgPSBDaGF0UmVzcG9uc2VSZXNvdXJjZS5jcmVhdGVVcmkoc2Vzc2lvblJlc291cmNlLCB0b29sQ2FsbElkLCAwLCAnZmlsZS5wbmcnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoJ3JlcS0xJywgJ3Jlc3AtMScsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1Rvb2sgc2NyZWVuc2hvdCcsXG5cdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0XHRvdXRwdXQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL3BuZycsXG5cdFx0XHRcdFx0XHRcdGJhc2U2NERhdGE6ICdBUUlEJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogMCB9LFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHRnZW5lcmF0ZWRUaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zKFtyZXF1ZXN0LCByZXNwb25zZV0sIGFzeW5jICgpID0+IG5ldyBVaW50OEFycmF5KCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmltYWdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbWFnZXNbMF0uaWQsIGV4cGVjdGVkVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaW1hZ2VzWzBdLmNhcHRpb24sICdUb29rIHNjcmVlbnNob3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBtYXJrZG93biBmcm9tIHRvb2wgaW52b2NhdGlvbiBtZXNzYWdlIGNhcHRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW1hZ2VVcmkgPSBVUkkuZmlsZSgnL3NjcmVlbnNob3RzL2hvbWVwYWdlLnBuZycpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KCdyZXEtMScsIFtdLCAnVGFrZSBhIHNjcmVlbnNob3QnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gbWFrZVJlc3BvbnNlKCdyZXEtMScsICdyZXNwLTEnLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdFx0XHR0b29sSWQ6ICd2aWV3X2ltYWdlJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnVmlld2luZyBpbWFnZScsXG5cdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHsgdmFsdWU6ICdWaWV3ZWQgaW1hZ2UgW10oZmlsZTovLy9zY3JlZW5zaG90cy9ob21lcGFnZS5wbmcpJywgaXNUcnVzdGVkOiBmYWxzZSwgdXJpczogeyAnMCc6IGltYWdlVXJpLnRvSlNPTigpIH0gfSxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogMCB9LFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHRnZW5lcmF0ZWRUaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zKFtyZXF1ZXN0LCByZXNwb25zZV0sIGFzeW5jICgpID0+IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmltYWdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbWFnZXNbMF0uY2FwdGlvbiwgJ1ZpZXdlZCBpbWFnZSBob21lcGFnZS5wbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltYWdlIGRhdGEgaXMgYSBwbGFpbiBVaW50OEFycmF5IHVzYWJsZSBieSBCbG9iIGNvbnN0cnVjdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1ha2VSZXF1ZXN0KCdyZXEtMScsIFtcblx0XHRcdFx0bWFrZUltYWdlVmFyaWFibGVFbnRyeSh7IHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pIH0pLFxuXHRcdFx0XSwgJ1NjcmVlbnNob3QgcmVxdWVzdCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBtYWtlUmVzcG9uc2UoJ3JlcS0xJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbGxlY3RDYXJvdXNlbFNlY3Rpb25zKFtyZXF1ZXN0LCByZXNwb25zZV0sIGFzeW5jICgpID0+IG5ldyBVaW50OEFycmF5KCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBkYXRhID0gcmVzdWx0WzBdLmltYWdlc1swXS5kYXRhO1xuXHRcdFx0Ly8gZGF0YSBtdXN0IGJlIGEgVWludDhBcnJheSAobm90IFZTQnVmZmVyIG9yIEFycmF5QnVmZmVyKSBzbyB0aGF0XG5cdFx0XHQvLyBuZXcgQmxvYihbZGF0YV0pIGluIHRoZSBjYXJvdXNlbCBlZGl0b3Igd29ya3MgY29ycmVjdGx5LlxuXHRcdFx0YXNzZXJ0Lm9rKGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5LCAnaW1hZ2UgZGF0YSBzaG91bGQgYmUgVWludDhBcnJheScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uZGF0YV0sIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUIsc0JBQXNCLHlCQUF5Qiw2QkFBK0M7QUFFNUgsU0FBUyw0QkFBNEI7QUFHckMsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxvQ0FBb0MsTUFBTTtBQUMvQywwQ0FBd0M7QUFFeEMsV0FBUyxZQUFZLElBQVksV0FBK0MsY0FBc0IsV0FBa0M7QUFDdkksV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLGlCQUFpQixJQUFJLE1BQU0sNkJBQTZCO0FBQUEsTUFDeEQsUUFBUSxRQUFRLEVBQUU7QUFBQSxNQUNsQixVQUFVO0FBQUEsTUFDVixTQUFTLEVBQUUsTUFBTSxhQUFhLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDeEM7QUFBQSxNQUNBLFNBQVM7QUFB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
