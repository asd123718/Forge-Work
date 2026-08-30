import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ChatPromptReference, ChatRequestModeInstructions, ChatResponseVoiceProgressPart, ChatToolInvocationPart, IconPath } from "../../common/extHostTypeConverters.js";
import { ChatReferenceBinaryData, ChatResponseVoiceProgressPart as ExtHostChatResponseVoiceProgressPart, ChatSubagentToolInvocationData, ChatToolInvocationPart as ExtHostChatToolInvocationPart, ThemeColor, ThemeIcon } from "../../common/extHostTypes.js";
suite("extHostTypeConverters", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts voice progress to hidden chat progress", () => {
    assert.deepStrictEqual(
      ChatResponseVoiceProgressPart.from(new ExtHostChatResponseVoiceProgressPart("investigating", "Investigating the relevant code.")),
      { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." }
    );
  });
  suite("IconPath", function() {
    suite("from", function() {
      test("undefined", function() {
        assert.strictEqual(IconPath.from(void 0), void 0);
      });
      test("ThemeIcon", function() {
        const themeIcon = new ThemeIcon("account", new ThemeColor("testing.iconForeground"));
        assert.strictEqual(IconPath.from(themeIcon), themeIcon);
      });
      test("URI", function() {
        const uri = URI.parse("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
        assert.strictEqual(IconPath.from(uri), uri);
      });
      test("string", function() {
        const str = "/path/to/icon.png";
        const r1 = IconPath.from(str);
        assert.ok(URI.isUri(r1));
        assert.strictEqual(r1.scheme, "file");
        assert.strictEqual(r1.path, str);
      });
      test("dark only", function() {
        const input = { dark: URI.file("/path/to/dark.png") };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), input.dark.toString());
        assert.strictEqual(result.light.toString(), input.dark.toString());
      });
      test("dark/light", function() {
        const input = { light: URI.file("/path/to/light.png"), dark: URI.file("/path/to/dark.png") };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), input.dark.toString());
        assert.strictEqual(result.light.toString(), input.light.toString());
      });
      test("dark/light strings", function() {
        const input = { light: "/path/to/light.png", dark: "/path/to/dark.png" };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.path, input.dark);
        assert.strictEqual(result.light.path, input.light);
      });
      test("invalid object", function() {
        const invalidObject = { foo: "bar" };
        const result = IconPath.from(invalidObject);
        assert.strictEqual(result, void 0);
      });
      test("light only", function() {
        const input = { light: URI.file("/path/to/light.png") };
        const result = IconPath.from(input);
        assert.strictEqual(result, void 0);
      });
    });
    suite("to", function() {
      test("undefined", function() {
        assert.strictEqual(IconPath.to(void 0), void 0);
      });
      test("ThemeIcon", function() {
        const themeIcon = new ThemeIcon("account");
        assert.strictEqual(IconPath.to(themeIcon), themeIcon);
      });
      test("URI", function() {
        const uri = { scheme: "data", path: "image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
        const result = IconPath.to(uri);
        assert.ok(URI.isUri(result));
        assert.strictEqual(result.toString(), URI.revive(uri).toString());
      });
      test("dark/light", function() {
        const input = {
          light: { scheme: "file", path: "/path/to/light.png" },
          dark: { scheme: "file", path: "/path/to/dark.png" }
        };
        const result = IconPath.to(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), URI.revive(input.dark).toString());
        assert.strictEqual(result.light.toString(), URI.revive(input.light).toString());
      });
    });
  });
  suite("ChatPromptReference", function() {
    test("expands an element with a screenshot into text and binary references", async function() {
      const variable = {
        id: "element-1",
        name: "button#submit",
        kind: "element",
        value: '<button id="submit">Submit</button>',
        imageData: new Uint8Array([1, 2, 3]),
        imageMimeType: "image/jpeg"
      };
      const references = ChatPromptReference.toReferences(variable, [], new NullLogService());
      const binaryReference = references[1].value;
      assert.ok(binaryReference instanceof ChatReferenceBinaryData);
      assert.deepStrictEqual({
        references: references.map((reference) => ({
          id: reference.id,
          name: reference.name,
          value: typeof reference.value === "string" ? reference.value : reference.value instanceof ChatReferenceBinaryData ? "ChatReferenceBinaryData" : void 0
        })),
        mimeType: binaryReference.mimeType,
        data: Array.from(await binaryReference.data())
      }, {
        references: [
          { id: "element-1", name: "button#submit", value: '<button id="submit">Submit</button>' },
          { id: "element-1-screenshot", name: "button#submit screenshot", value: "ChatReferenceBinaryData" }
        ],
        mimeType: "image/jpeg",
        data: [1, 2, 3]
      });
    });
  });
  suite("ChatRequestModeInstructions", function() {
    test("to returns undefined for undefined input", function() {
      assert.strictEqual(ChatRequestModeInstructions.to(void 0), void 0);
    });
    test("from returns undefined for undefined input", function() {
      assert.strictEqual(ChatRequestModeInstructions.from(void 0), void 0);
    });
    test("to converts IChatRequestModeInstructions to API type", function() {
      const uri = URI.parse("file:///custom-agent");
      const input = {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{
          kind: "tool",
          id: "tool1",
          name: "tool1",
          value: void 0,
          range: { start: 0, endExclusive: 5 }
        }],
        allowedSubagents: ["agent1", "agent2"],
        metadata: { key: "value" },
        isBuiltin: false
      };
      const result = ChatRequestModeInstructions.to(input);
      assert.deepStrictEqual(result, {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{ name: "tool1", range: [0, 5] }],
        allowedSubagents: ["agent1", "agent2"],
        metadata: { key: "value" },
        isBuiltin: false
      });
    });
    test("to handles Dto with UriComponents", function() {
      const input = {
        uri: { scheme: "file", path: "/custom-agent" },
        name: "test-mode",
        content: "test content",
        toolReferences: [],
        allowedSubagents: void 0,
        metadata: void 0,
        isBuiltin: true
      };
      const result = ChatRequestModeInstructions.to(input);
      assert.ok(URI.isUri(result.uri));
      assert.strictEqual(result.name, "test-mode");
      assert.strictEqual(result.isBuiltin, true);
      assert.deepStrictEqual(result.toolReferences, []);
    });
    test("from converts API type to IChatRequestModeInstructions", function() {
      const uri = URI.parse("file:///custom-agent");
      const input = {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{ name: "tool1", range: [0, 5] }],
        metadata: { key: "value" },
        isBuiltin: false
      };
      const result = ChatRequestModeInstructions.from(input);
      assert.deepStrictEqual(result, {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{
          kind: "tool",
          id: "tool1",
          name: "tool1",
          value: void 0,
          range: { start: 0, endExclusive: 5 }
        }],
        allowedSubagents: void 0,
        metadata: { key: "value" },
        isBuiltin: false
      });
    });
    test("from handles missing toolReferences", function() {
      const input = {
        name: "test-mode",
        content: "test content"
      };
      const result = ChatRequestModeInstructions.from(input);
      assert.deepStrictEqual(result.toolReferences, []);
    });
    test("roundtrip from -> to preserves data", function() {
      const uri = URI.parse("file:///custom-agent");
      const apiInput = {
        uri,
        name: "roundtrip-mode",
        content: "roundtrip content",
        toolReferences: [
          { name: "tool1" },
          { name: "tool2", range: [10, 20] }
        ],
        metadata: { flag: true },
        isBuiltin: false
      };
      const internal = ChatRequestModeInstructions.from(apiInput);
      const backToApi = ChatRequestModeInstructions.to(internal);
      assert.strictEqual(backToApi.name, apiInput.name);
      assert.strictEqual(backToApi.content, apiInput.content);
      assert.strictEqual(backToApi.isBuiltin, apiInput.isBuiltin);
      assert.strictEqual(backToApi.uri?.toString(), uri.toString());
      assert.strictEqual(backToApi.toolReferences?.length, 2);
      assert.strictEqual(backToApi.toolReferences?.[0].name, "tool1");
      assert.strictEqual(backToApi.toolReferences?.[0].range, void 0);
      assert.strictEqual(backToApi.toolReferences?.[1].name, "tool2");
      assert.deepStrictEqual(backToApi.toolReferences?.[1].range, [10, 20]);
    });
  });
  suite("ChatToolInvocationPart", function() {
    test("converts subagent data with its model name", function() {
      const data = new ChatSubagentToolInvocationData("Run tests", "execution", "npm test", "Passed");
      data.modelName = "Execution Model";
      const part = new ExtHostChatToolInvocationPart("execution_subagent", "tool-call-id");
      part.toolSpecificData = data;
      assert.deepStrictEqual(ChatToolInvocationPart.from(part).toolSpecificData, {
        kind: "subagent",
        description: "Run tests",
        agentName: "execution",
        prompt: "npm test",
        result: "Passed",
        modelName: "Execution Model"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcY29tbW9uXFxleHRIb3N0VHlwZUNvbnZlcnRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSWNvblBhdGhEdG8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvbXB0UmVmZXJlbmNlLCBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMsIENoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0LCBDaGF0VG9vbEludm9jYXRpb25QYXJ0LCBJY29uUGF0aCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEsIENoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0IGFzIEV4dEhvc3RDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCwgQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhLCBDaGF0VG9vbEludm9jYXRpb25QYXJ0IGFzIEV4dEhvc3RDaGF0VG9vbEludm9jYXRpb25QYXJ0LCBUaGVtZUNvbG9yLCBUaGVtZUljb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElFbGVtZW50VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcblxuc3VpdGUoJ2V4dEhvc3RUeXBlQ29udmVydGVycycsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29udmVydHMgdm9pY2UgcHJvZ3Jlc3MgdG8gaGlkZGVuIGNoYXQgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdENoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0LmZyb20obmV3IEV4dEhvc3RDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCgnaW52ZXN0aWdhdGluZycsICdJbnZlc3RpZ2F0aW5nIHRoZSByZWxldmFudCBjb2RlLicpKSxcblx0XHRcdHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogJ2ludmVzdGlnYXRpbmcnLCB2YWx1ZTogJ0ludmVzdGlnYXRpbmcgdGhlIHJlbGV2YW50IGNvZGUuJyB9XG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ0ljb25QYXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdHN1aXRlKCdmcm9tJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGVzdCgndW5kZWZpbmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSWNvblBhdGguZnJvbSh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ1RoZW1lSWNvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVJY29uID0gbmV3IFRoZW1lSWNvbignYWNjb3VudCcsIG5ldyBUaGVtZUNvbG9yKCd0ZXN0aW5nLmljb25Gb3JlZ3JvdW5kJykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSWNvblBhdGguZnJvbSh0aGVtZUljb24pLCB0aGVtZUljb24pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ1VSSScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdkYXRhOmltYWdlL3BuZztiYXNlNjQsaVZCT1J3MEtHZ29BQUFBTlNVaEVVZ0FBQUFFQUFBQUJDQVlBQUFBZkZjU0pBQUFBRFVsRVFWUjQybU5rK005UUR3QURoZ0dBV2pSOWF3QUFBQUJKUlU1RXJrSmdnZz09Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJY29uUGF0aC5mcm9tKHVyaSksIHVyaSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc3RyaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBzdHIgPSAnL3BhdGgvdG8vaWNvbi5wbmcnO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcjEgPSBJY29uUGF0aC5mcm9tKHN0ciBhcyBhbnkpIGFzIGFueSBhcyBVUkk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocjEpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLnBhdGgsIHN0cik7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZGFyayBvbmx5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IHsgZGFyazogVVJJLmZpbGUoJy9wYXRoL3RvL2RhcmsucG5nJykgfTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IEljb25QYXRoLmZyb20oaW5wdXQgYXMgYW55KSBhcyB1bmtub3duIGFzIHsgZGFyazogVVJJOyBsaWdodDogVVJJIH07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0LCAnb2JqZWN0Jyk7XG5cdFx0XHRcdGFzc2VydC5vaygnbGlnaHQnIGluIHJlc3VsdCAmJiAnZGFyaycgaW4gcmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQubGlnaHQpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQuZGFyaykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRhcmsudG9TdHJpbmcoKSwgaW5wdXQuZGFyay50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5saWdodC50b1N0cmluZygpLCBpbnB1dC5kYXJrLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2RhcmsvbGlnaHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0geyBsaWdodDogVVJJLmZpbGUoJy9wYXRoL3RvL2xpZ2h0LnBuZycpLCBkYXJrOiBVUkkuZmlsZSgnL3BhdGgvdG8vZGFyay5wbmcnKSB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBJY29uUGF0aC5mcm9tKGlucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdvYmplY3QnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCdsaWdodCcgaW4gcmVzdWx0ICYmICdkYXJrJyBpbiByZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC5saWdodCkpO1xuXHRcdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC5kYXJrKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGFyay50b1N0cmluZygpLCBpbnB1dC5kYXJrLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZ2h0LnRvU3RyaW5nKCksIGlucHV0LmxpZ2h0LnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2RhcmsvbGlnaHQgc3RyaW5ncycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgaW5wdXQgPSB7IGxpZ2h0OiAnL3BhdGgvdG8vbGlnaHQucG5nJywgZGFyazogJy9wYXRoL3RvL2RhcmsucG5nJyB9O1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGguZnJvbShpbnB1dCBhcyBhbnkpIGFzIHVua25vd24gYXMgSWNvblBhdGhEdG87XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0LCAnb2JqZWN0Jyk7XG5cdFx0XHRcdGFzc2VydC5vaygnbGlnaHQnIGluIHJlc3VsdCAmJiAnZGFyaycgaW4gcmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQubGlnaHQpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQuZGFyaykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRhcmsucGF0aCwgaW5wdXQuZGFyayk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlnaHQucGF0aCwgaW5wdXQubGlnaHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ludmFsaWQgb2JqZWN0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBpbnZhbGlkT2JqZWN0ID0geyBmb286ICdiYXInIH07XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBJY29uUGF0aC5mcm9tKGludmFsaWRPYmplY3QgYXMgYW55KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaWdodCBvbmx5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IHsgbGlnaHQ6IFVSSS5maWxlKCcvcGF0aC90by9saWdodC5wbmcnKSB9O1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGguZnJvbShpbnB1dCBhcyBhbnkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgndG8nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0ZXN0KCd1bmRlZmluZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJY29uUGF0aC50byh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ1RoZW1lSWNvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVJY29uID0gbmV3IFRoZW1lSWNvbignYWNjb3VudCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSWNvblBhdGgudG8odGhlbWVJY29uKSwgdGhlbWVJY29uKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdVUkknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHVyaTogVXJpQ29tcG9uZW50cyA9IHsgc2NoZW1lOiAnZGF0YScsIHBhdGg6ICdpbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FZQUFBQWZGY1NKQUFBQURVbEVRVlI0Mm1OaytNOVFEd0FEaGdHQVdqUjlhd0FBQUFCSlJVNUVya0pnZ2c9PScgfTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGgudG8odXJpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCBVUkkucmV2aXZlKHVyaSkudG9TdHJpbmcoKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZGFyay9saWdodCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgaW5wdXQ6IHsgbGlnaHQ6IFVyaUNvbXBvbmVudHM7IGRhcms6IFVyaUNvbXBvbmVudHMgfSA9IHtcblx0XHRcdFx0XHRsaWdodDogeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9wYXRoL3RvL2xpZ2h0LnBuZycgfSxcblx0XHRcdFx0XHRkYXJrOiB7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL3BhdGgvdG8vZGFyay5wbmcnIH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGgudG8oaW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdCwgJ29iamVjdCcpO1xuXHRcdFx0XHRhc3NlcnQub2soJ2xpZ2h0JyBpbiByZXN1bHQgJiYgJ2RhcmsnIGluIHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmxpZ2h0KSk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmRhcmspKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kYXJrLnRvU3RyaW5nKCksIFVSSS5yZXZpdmUoaW5wdXQuZGFyaykudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlnaHQudG9TdHJpbmcoKSwgVVJJLnJldml2ZShpbnB1dC5saWdodCkudG9TdHJpbmcoKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NoYXRQcm9tcHRSZWZlcmVuY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnZXhwYW5kcyBhbiBlbGVtZW50IHdpdGggYSBzY3JlZW5zaG90IGludG8gdGV4dCBhbmQgYmluYXJ5IHJlZmVyZW5jZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZTogSUVsZW1lbnRWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0XHRpZDogJ2VsZW1lbnQtMScsXG5cdFx0XHRcdG5hbWU6ICdidXR0b24jc3VibWl0Jyxcblx0XHRcdFx0a2luZDogJ2VsZW1lbnQnLFxuXHRcdFx0XHR2YWx1ZTogJzxidXR0b24gaWQ9XCJzdWJtaXRcIj5TdWJtaXQ8L2J1dHRvbj4nLFxuXHRcdFx0XHRpbWFnZURhdGE6IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSksXG5cdFx0XHRcdGltYWdlTWltZVR5cGU6ICdpbWFnZS9qcGVnJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBDaGF0UHJvbXB0UmVmZXJlbmNlLnRvUmVmZXJlbmNlcyh2YXJpYWJsZSwgW10sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGJpbmFyeVJlZmVyZW5jZSA9IHJlZmVyZW5jZXNbMV0udmFsdWU7XG5cdFx0XHRhc3NlcnQub2soYmluYXJ5UmVmZXJlbmNlIGluc3RhbmNlb2YgQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVmZXJlbmNlczogcmVmZXJlbmNlcy5tYXAocmVmZXJlbmNlID0+ICh7XG5cdFx0XHRcdFx0aWQ6IHJlZmVyZW5jZS5pZCxcblx0XHRcdFx0XHRuYW1lOiByZWZlcmVuY2UubmFtZSxcblx0XHRcdFx0XHR2YWx1ZTogdHlwZW9mIHJlZmVyZW5jZS52YWx1ZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdD8gcmVmZXJlbmNlLnZhbHVlXG5cdFx0XHRcdFx0XHQ6IHJlZmVyZW5jZS52YWx1ZSBpbnN0YW5jZW9mIENoYXRSZWZlcmVuY2VCaW5hcnlEYXRhID8gJ0NoYXRSZWZlcmVuY2VCaW5hcnlEYXRhJyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRtaW1lVHlwZTogYmluYXJ5UmVmZXJlbmNlLm1pbWVUeXBlLFxuXHRcdFx0XHRkYXRhOiBBcnJheS5mcm9tKGF3YWl0IGJpbmFyeVJlZmVyZW5jZS5kYXRhKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWZlcmVuY2VzOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2VsZW1lbnQtMScsIG5hbWU6ICdidXR0b24jc3VibWl0JywgdmFsdWU6ICc8YnV0dG9uIGlkPVwic3VibWl0XCI+U3VibWl0PC9idXR0b24+JyB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdlbGVtZW50LTEtc2NyZWVuc2hvdCcsIG5hbWU6ICdidXR0b24jc3VibWl0IHNjcmVlbnNob3QnLCB2YWx1ZTogJ0NoYXRSZWZlcmVuY2VCaW5hcnlEYXRhJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL2pwZWcnLFxuXHRcdFx0XHRkYXRhOiBbMSwgMiwgM10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCd0byByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5kZWZpbmVkIGlucHV0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy50byh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJvbSByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5kZWZpbmVkIGlucHV0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy5mcm9tKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0byBjb252ZXJ0cyBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHRvIEFQSSB0eXBlJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2N1c3RvbS1hZ2VudCcpO1xuXHRcdFx0Y29uc3QgaW5wdXQ6IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgPSB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ3Rlc3QtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd0ZXN0IGNvbnRlbnQnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW3tcblx0XHRcdFx0XHRraW5kOiAndG9vbCcsXG5cdFx0XHRcdFx0aWQ6ICd0b29sMScsXG5cdFx0XHRcdFx0bmFtZTogJ3Rvb2wxJyxcblx0XHRcdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDUgfSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IFsnYWdlbnQxJywgJ2FnZW50MiddLFxuXHRcdFx0XHRtZXRhZGF0YTogeyBrZXk6ICd2YWx1ZScgfSxcblx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy50byhpbnB1dCkhO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC1tb2RlJyxcblx0XHRcdFx0Y29udGVudDogJ3Rlc3QgY29udGVudCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbeyBuYW1lOiAndG9vbDEnLCByYW5nZTogWzAsIDVdIH1dLFxuXHRcdFx0XHRhbGxvd2VkU3ViYWdlbnRzOiBbJ2FnZW50MScsICdhZ2VudDInXSxcblx0XHRcdFx0bWV0YWRhdGE6IHsga2V5OiAndmFsdWUnIH0sXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RvIGhhbmRsZXMgRHRvIHdpdGggVXJpQ29tcG9uZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGlucHV0OiBEdG88SUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucz4gPSB7XG5cdFx0XHRcdHVyaTogeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9jdXN0b20tYWdlbnQnIH0gYXMgVXJpQ29tcG9uZW50cyxcblx0XHRcdFx0bmFtZTogJ3Rlc3QtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd0ZXN0IGNvbnRlbnQnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNCdWlsdGluOiB0cnVlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLnRvKGlucHV0KSE7XG5cdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC51cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ3Rlc3QtbW9kZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pc0J1aWx0aW4sIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFJlZmVyZW5jZXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zyb20gY29udmVydHMgQVBJIHR5cGUgdG8gSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jdXN0b20tYWdlbnQnKTtcblx0XHRcdGNvbnN0IGlucHV0ID0ge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICd0ZXN0LW1vZGUnLFxuXHRcdFx0XHRjb250ZW50OiAndGVzdCBjb250ZW50Jyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFt7IG5hbWU6ICd0b29sMScsIHJhbmdlOiBbMCwgNV0gYXMgW251bWJlciwgbnVtYmVyXSB9XSxcblx0XHRcdFx0bWV0YWRhdGE6IHsga2V5OiAndmFsdWUnIH0sXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMuZnJvbShpbnB1dCkhO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC1tb2RlJyxcblx0XHRcdFx0Y29udGVudDogJ3Rlc3QgY29udGVudCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sJyxcblx0XHRcdFx0XHRpZDogJ3Rvb2wxJyxcblx0XHRcdFx0XHRuYW1lOiAndG9vbDEnLFxuXHRcdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogNSB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0YWxsb3dlZFN1YmFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXRhZGF0YTogeyBrZXk6ICd2YWx1ZScgfSxcblx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJvbSBoYW5kbGVzIG1pc3NpbmcgdG9vbFJlZmVyZW5jZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd0ZXN0IGNvbnRlbnQnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLmZyb20oaW5wdXQpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xSZWZlcmVuY2VzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZHRyaXAgZnJvbSAtPiB0byBwcmVzZXJ2ZXMgZGF0YScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jdXN0b20tYWdlbnQnKTtcblx0XHRcdGNvbnN0IGFwaUlucHV0ID0ge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICdyb3VuZHRyaXAtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICdyb3VuZHRyaXAgY29udGVudCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAndG9vbDEnIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAndG9vbDInLCByYW5nZTogWzEwLCAyMF0gYXMgW251bWJlciwgbnVtYmVyXSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtZXRhZGF0YTogeyBmbGFnOiB0cnVlIH0sXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBpbnRlcm5hbCA9IENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy5mcm9tKGFwaUlucHV0KSE7XG5cdFx0XHRjb25zdCBiYWNrVG9BcGkgPSBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMudG8oaW50ZXJuYWwpITtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS5uYW1lLCBhcGlJbnB1dC5uYW1lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkuY29udGVudCwgYXBpSW5wdXQuY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja1RvQXBpLmlzQnVpbHRpbiwgYXBpSW5wdXQuaXNCdWlsdGluKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkudXJpPy50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja1RvQXBpLnRvb2xSZWZlcmVuY2VzPy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS50b29sUmVmZXJlbmNlcz8uWzBdLm5hbWUsICd0b29sMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS50b29sUmVmZXJlbmNlcz8uWzBdLnJhbmdlLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS50b29sUmVmZXJlbmNlcz8uWzFdLm5hbWUsICd0b29sMicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChiYWNrVG9BcGkudG9vbFJlZmVyZW5jZXM/LlsxXS5yYW5nZSwgWzEwLCAyMF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdjb252ZXJ0cyBzdWJhZ2VudCBkYXRhIHdpdGggaXRzIG1vZGVsIG5hbWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IENoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSgnUnVuIHRlc3RzJywgJ2V4ZWN1dGlvbicsICducG0gdGVzdCcsICdQYXNzZWQnKTtcblx0XHRcdGRhdGEubW9kZWxOYW1lID0gJ0V4ZWN1dGlvbiBNb2RlbCc7XG5cdFx0XHRjb25zdCBwYXJ0ID0gbmV3IEV4dEhvc3RDaGF0VG9vbEludm9jYXRpb25QYXJ0KCdleGVjdXRpb25fc3ViYWdlbnQnLCAndG9vbC1jYWxsLWlkJyk7XG5cdFx0XHQocGFydCBhcyB1bmtub3duIGFzIHsgdG9vbFNwZWNpZmljRGF0YTogQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSBkYXRhO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKENoYXRUb29sSW52b2NhdGlvblBhcnQuZnJvbShwYXJ0IGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2YgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydC5mcm9tPlswXSkudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1biB0ZXN0cycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ2V4ZWN1dGlvbicsXG5cdFx0XHRcdHByb21wdDogJ25wbSB0ZXN0Jyxcblx0XHRcdFx0cmVzdWx0OiAnUGFzc2VkJyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnRXhlY3V0aW9uIE1vZGVsJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNB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
