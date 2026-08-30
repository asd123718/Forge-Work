import * as assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ResourceMap } from "../../../../../../../base/common/map.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { testWorkspace } from "../../../../../../../platform/workspace/test/common/testWorkspace.js";
import { FetchWebPageTool } from "../../../../electron-browser/builtInTools/fetchPageTool.js";
import { TestContextService, TestFileService } from "../../../../../../test/common/workbenchTestServices.js";
import { MockTrustedDomainService } from "../../../../../url/test/browser/mockTrustedDomainService.js";
import { InternalFetchWebPageToolId } from "../../../../common/tools/builtinTools/tools.js";
import { MockChatService } from "../../../common/chatService/mockChatService.js";
import { upcastDeepPartial } from "../../../../../../../base/test/common/mock.js";
import { LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import { Event } from "../../../../../../../base/common/event.js";
import { AgentNetworkFilterService } from "../../../../../../../platform/networkFilter/common/networkFilterService.js";
import { AgentNetworkDomainSettingId } from "../../../../../../../platform/networkFilter/common/settings.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
class TestWebContentExtractorService {
  constructor(uriToContentMap) {
    this.uriToContentMap = uriToContentMap;
    this.requestedUris = [];
  }
  async extract(uris) {
    this.requestedUris.push(...uris);
    return uris.map((uri) => {
      const content = this.uriToContentMap.get(uri);
      if (content === void 0) {
        throw new Error(`No content configured for URI: ${uri.toString()}`);
      }
      return { status: "ok", result: content };
    });
  }
}
class ExtendedTestFileService extends TestFileService {
  constructor(uriToContentMap) {
    super();
    this.uriToContentMap = uriToContentMap;
  }
  async readFile(resource, options) {
    const content = this.uriToContentMap.get(resource);
    if (content === void 0) {
      throw new Error(`File not found: ${resource.toString()}`);
    }
    const buffer = typeof content === "string" ? VSBuffer.fromString(content) : content;
    return {
      resource,
      value: buffer,
      name: "",
      size: buffer.byteLength,
      etag: "",
      mtime: 0,
      ctime: 0,
      readonly: false,
      locked: false,
      executable: false
    };
  }
  async stat(resource) {
    if (!this.uriToContentMap.has(resource)) {
      throw new Error(`File not found: ${resource.toString()}`);
    }
    return super.stat(resource);
  }
}
class MockAgentNetworkFilterService {
  constructor() {
    this.onDidChange = Event.None;
  }
  isUriAllowed(_uri) {
    return true;
  }
  formatError(uri) {
    return `Access to ${uri.authority} is blocked by network domain policy.`;
  }
}
suite("FetchWebPageTool", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should handle http/https via web content extractor and other schemes via file service", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://example.com"), "HTTPS content"],
      [URI.parse("http://example.com"), "HTTP content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://static/resource/50"), "MCP resource content"],
      [URI.parse("mcp-resource://746573742D736572766572/custom/hello/world.txt"), "Custom MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const testUrls = [
      "https://example.com",
      "http://example.com",
      "test://static/resource/50",
      "mcp-resource://746573742D736572766572/custom/hello/world.txt",
      "file:///path/to/nonexistent",
      "ftp://example.com",
      "invalid-url"
    ];
    const result = await tool.invoke(
      { callId: "test-call-1", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 7, "Should have result for each input URL");
    assert.strictEqual(result.content[0].value, "HTTPS content", "HTTPS URL should return content");
    assert.strictEqual(result.content[1].value, "HTTP content", "HTTP URL should return content");
    assert.strictEqual(result.content[2].value, "MCP resource content", "test:// URL should return content from file service");
    assert.strictEqual(result.content[3].value, "Custom MCP content", "mcp-resource:// URL should return content from file service");
    assert.strictEqual(result.content[4].value, "Invalid URL", "Nonexistent file should be invalid");
    assert.strictEqual(result.content[5].value, "Invalid URL", "ftp:// URL should be invalid");
    assert.strictEqual(result.content[6].value, "Invalid URL", "Invalid URL should be invalid");
    assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 4, "Should have 4 valid URLs in toolResultDetails");
  });
  test("blocks IPv6 literals before web content extraction", async () => {
    const urls = [
      "http://127.0.0.1/private",
      "http://[::1]/private",
      "http://[::ffff:127.0.0.1]/private"
    ];
    const webContentExtractorService = new TestWebContentExtractorService(new ResourceMap([
      [URI.parse(urls[1]), "IPv6 loopback content"],
      [URI.parse(urls[2]), "IPv4-mapped IPv6 content"]
    ]));
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
    configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
    configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
    const networkFilterService = new AgentNetworkFilterService(configService);
    try {
      const tool = new FetchWebPageTool(
        webContentExtractorService,
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        networkFilterService
      );
      const result = await tool.invoke(
        { callId: "test-call-ipv6", toolId: "fetch-page", parameters: { urls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.deepStrictEqual({
        content: result.content.map((part) => part.value),
        requestedUris: webContentExtractorService.requestedUris.map((uri) => uri.toString())
      }, {
        content: urls.map((url) => networkFilterService.formatError(URI.parse(url))),
        requestedUris: []
      });
    } finally {
      networkFilterService.dispose();
    }
  });
  test("should handle empty and undefined URLs", async () => {
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(new ResourceMap()),
      new MockTrustedDomainService([]),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const emptyResult = await tool.invoke(
      { callId: "test-call-2", toolId: "fetch-page", parameters: { urls: [] }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(emptyResult.content.length, 1, "Empty array should return single message");
    assert.strictEqual(emptyResult.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
    const undefinedResult = await tool.invoke(
      { callId: "test-call-3", toolId: "fetch-page", parameters: {}, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(undefinedResult.content.length, 1, "Undefined URLs should return single message");
    assert.strictEqual(undefinedResult.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
    const invalidResult = await tool.invoke(
      { callId: "test-call-4", toolId: "fetch-page", parameters: { urls: ["", " ", "invalid-scheme-that-fileservice-cannot-handle://test"] }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(invalidResult.content.length, 3, "Should have result for each invalid URL");
    assert.strictEqual(invalidResult.content[0].value, "Invalid URL", "Empty string should be invalid");
    assert.strictEqual(invalidResult.content[1].value, "Invalid URL", "Space-only string should be invalid");
    assert.strictEqual(invalidResult.content[2].value, "Invalid URL", "Unhandleable scheme should be invalid");
  });
  test("should provide correct past tense messages for mixed valid/invalid URLs", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://valid.com"), "Valid content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://valid/resource"), "Valid MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://valid.com", "test://valid/resource", "invalid://invalid"] }, toolCallId: "test-call-1", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.pastTenseMessage, "Should have past tense message");
    const messageText = typeof preparation.pastTenseMessage === "string" ? preparation.pastTenseMessage : preparation.pastTenseMessage.value;
    assert.ok(messageText.includes("Fetched"), "Should mention fetched resources");
    assert.ok(messageText.includes("invalid://invalid"), "Should mention invalid URL");
  });
  test("should not show confirmation dialog for file URIs inside the workspace", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"],
      [URI.file("/workspaceRoot/subdir/notes.txt"), "Notes content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/workspaceRoot/plan.md").toString()] }, toolCallId: "test-file-in-ws", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "File inside workspace should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "File inside workspace should not require post-confirmation");
  });
  test("should show confirmation dialog for file URIs outside the workspace", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/tmp/external-plan.md"), "External plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/tmp/external-plan.md").toString()] }, toolCallId: "test-file-outside-ws", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "File outside workspace should show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "File outside workspace should require post-confirmation");
  });
  test("file URI that traverses out of the workspace requires confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/etc/secret.txt"), "secret content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///workspaceRoot/../../etc/secret.txt"] }, toolCallId: "test-file-traversal", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Traversal escaping the workspace should show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Traversal escaping the workspace should require post-confirmation");
  });
  test("file URI with `..` that stays inside the workspace still skips confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///workspaceRoot/subdir/../plan.md"] }, toolCallId: "test-file-inside-traversal", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "In-workspace file (after normalization) should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "In-workspace file should not require post-confirmation");
  });
  test("workspace file mixed with untrusted web URI: only web URI triggers confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const webContentMap = new ResourceMap([
      [URI.parse("https://example.com"), "Web content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      // No trusted domains
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      {
        parameters: { urls: ["https://example.com", URI.file("/workspaceRoot/plan.md").toString()] },
        toolCallId: "test-mixed",
        chatSessionResource: void 0
      },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Should show confirmation for untrusted web URI");
    const msgValue = typeof preparation.confirmationMessages?.message === "string" ? preparation.confirmationMessages.message : preparation.confirmationMessages?.message?.value ?? "";
    assert.ok(!msgValue.includes("/workspaceRoot/"), "Confirmation message should not mention workspace file");
    assert.ok(msgValue.includes("example.com"), "Confirmation message should mention web URI");
  });
  test("should approve when all URLs were mentioned in chat", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://valid.com"), "Valid content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://valid/resource"), "Valid MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "fetch https://example.com"
              }
            }]
          };
        }
      }),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation1 = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://example.com"] }, toolCallId: "test-call-2", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation1, "Should return prepared invocation");
    assert.strictEqual(preparation1.confirmationMessages?.title, void 0);
    const preparation2 = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://other.com"] }, toolCallId: "test-call-3", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation2, "Should return prepared invocation");
    assert.ok(preparation2.confirmationMessages?.title);
  });
  test("should require confirmation for a file URI embedded inside a pasted web URL", async () => {
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///home/victim/.ssh/id_rsa"), "secret key"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "fetch https://attacker.example/p.html?u=file:///home/victim/.ssh/id_rsa"
              }
            }]
          };
        }
      }),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///home/victim/.ssh/id_rsa"] }, toolCallId: "test-call-injection", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Embedded file URI should still show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Embedded file URI should still require post-confirmation");
  });
  test("should auto-approve a standalone out-of-workspace file URI the user pasted", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/tmp/external-plan.md"), "External plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "please fetch (file:///tmp/external-plan.md) for me"
              }
            }]
          };
        }
      }),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/tmp/external-plan.md").toString()] }, toolCallId: "test-call-standalone-file", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "Explicitly referenced file URI should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "Explicitly referenced file URI should not require post-confirmation");
  });
  test("should require confirmation when a prior message only mentions a bare (scheme-less) path", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/etc/secret.txt"), "secret content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "the config lives at /etc/secret.txt on the box"
              }
            }]
          };
        }
      }),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///etc/secret.txt"] }, toolCallId: "test-call-bare-path", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Bare path mention should still show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Bare path mention should still require post-confirmation");
  });
  test("should return message for binary files indicating they are not supported", async () => {
    const binaryContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const binaryBuffer = VSBuffer.wrap(binaryContent);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///path/to/binary.dat"), binaryBuffer],
      [URI.parse("file:///path/to/text.txt"), "This is text content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-call-binary",
        toolId: "fetch-page",
        parameters: { urls: ["file:///path/to/binary.dat", "file:///path/to/text.txt"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 2, "Should have 2 results");
    assert.strictEqual(result.content[0].kind, "text", "Binary file should return text part");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, "Binary files are not supported at the moment.", "Should return not supported message");
    }
    assert.strictEqual(result.content[1].kind, "text", "Text file should return text part");
    if (result.content[1].kind === "text") {
      assert.strictEqual(result.content[1].value, "This is text content", "Should return text content");
    }
    assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 2, "Should have 2 valid URLs in toolResultDetails");
  });
  test("PNG files are now supported as image data parts (regression test)", async () => {
    const binaryContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const binaryBuffer = VSBuffer.wrap(binaryContent);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///path/to/image.png"), binaryBuffer]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-png-support",
        toolId: "fetch-page",
        parameters: { urls: ["file:///path/to/image.png"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1, "Should have 1 result");
    assert.strictEqual(result.content[0].kind, "data", "PNG file should return data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "Should have PNG MIME type");
      assert.strictEqual(result.content[0].value.data, binaryBuffer, "Should have correct binary data");
    }
  });
  test("should correctly distinguish between binary and text content", async () => {
    const jsonData = '{"name": "test", "value": 123}';
    const realBinaryData = new Uint8Array([137, 80, 78, 71, 0, 0, 0, 13, 255, 0, 171]);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///data.json"), jsonData],
      // Should be detected as text
      [URI.parse("file:///binary.dat"), VSBuffer.wrap(realBinaryData)]
      // Should be detected as binary
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-distinguish",
        toolId: "fetch-page",
        parameters: { urls: ["file:///data.json", "file:///binary.dat"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "text", "JSON should be detected as text");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, jsonData, "Should return JSON as text");
    }
    assert.strictEqual(result.content[1].kind, "text", "Binary content should return text part with message");
    if (result.content[1].kind === "text") {
      assert.strictEqual(result.content[1].value, "Binary files are not supported at the moment.", "Should return not supported message");
    }
  });
  test("Supported image files are returned as data parts", async () => {
    const pngData = VSBuffer.fromString("fake PNG data");
    const jpegData = VSBuffer.fromString("fake JPEG data");
    const gifData = VSBuffer.fromString("fake GIF data");
    const webpData = VSBuffer.fromString("fake WebP data");
    const bmpData = VSBuffer.fromString("fake BMP data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///image.png"), pngData);
    fileContentMap.set(URI.parse("file:///photo.jpg"), jpegData);
    fileContentMap.set(URI.parse("file:///animation.gif"), gifData);
    fileContentMap.set(URI.parse("file:///modern.webp"), webpData);
    fileContentMap.set(URI.parse("file:///bitmap.bmp"), bmpData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-images",
        toolId: "fetch-page",
        parameters: { urls: ["file:///image.png", "file:///photo.jpg", "file:///animation.gif", "file:///modern.webp", "file:///bitmap.bmp"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 5, "Should have 5 results");
    assert.strictEqual(result.content[0].kind, "data", "PNG should be data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "PNG should have correct MIME type");
      assert.strictEqual(result.content[0].value.data, pngData, "PNG should have correct data");
    }
    assert.strictEqual(result.content[1].kind, "data", "JPEG should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/jpeg", "JPEG should have correct MIME type");
      assert.strictEqual(result.content[1].value.data, jpegData, "JPEG should have correct data");
    }
    assert.strictEqual(result.content[2].kind, "data", "GIF should be data part");
    if (result.content[2].kind === "data") {
      assert.strictEqual(result.content[2].value.mimeType, "image/gif", "GIF should have correct MIME type");
      assert.strictEqual(result.content[2].value.data, gifData, "GIF should have correct data");
    }
    assert.strictEqual(result.content[3].kind, "data", "WebP should be data part");
    if (result.content[3].kind === "data") {
      assert.strictEqual(result.content[3].value.mimeType, "image/webp", "WebP should have correct MIME type");
      assert.strictEqual(result.content[3].value.data, webpData, "WebP should have correct data");
    }
    assert.strictEqual(result.content[4].kind, "data", "BMP should be data part");
    if (result.content[4].kind === "data") {
      assert.strictEqual(result.content[4].value.mimeType, "image/bmp", "BMP should have correct MIME type");
      assert.strictEqual(result.content[4].value.data, bmpData, "BMP should have correct data");
    }
  });
  test("Mixed image and text files work correctly", async () => {
    const textData = "This is some text content";
    const imageData = VSBuffer.fromString("fake image data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///text.txt"), textData);
    fileContentMap.set(URI.parse("file:///image.png"), imageData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-mixed",
        toolId: "fetch-page",
        parameters: { urls: ["file:///text.txt", "file:///image.png"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "text", "Text file should be text part");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, textData, "Text should have correct content");
    }
    assert.strictEqual(result.content[1].kind, "data", "Image file should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/png", "Image should have correct MIME type");
      assert.strictEqual(result.content[1].value.data, imageData, "Image should have correct data");
    }
  });
  test("Case insensitive image extensions work", async () => {
    const imageData = VSBuffer.fromString("fake image data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///image.PNG"), imageData);
    fileContentMap.set(URI.parse("file:///photo.JPEG"), imageData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-case",
        toolId: "fetch-page",
        parameters: { urls: ["file:///image.PNG", "file:///photo.JPEG"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "data", "PNG with uppercase extension should be data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "Should have correct MIME type");
    }
    assert.strictEqual(result.content[1].kind, "data", "JPEG with uppercase extension should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/jpeg", "Should have correct MIME type");
    }
  });
  suite("toolResultDetails", () => {
    test("should include only successfully fetched URIs in correct order", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success1.com"), "Content 1"],
        [URI.parse("https://success2.com"), "Content 2"]
      ]);
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///success.txt"), "File content"],
        [URI.parse("mcp-resource://server/file.txt"), "MCP content"]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://success1.com",
        // index 0 - should be in toolResultDetails
        "invalid-url",
        // index 1 - should NOT be in toolResultDetails
        "file:///success.txt",
        // index 2 - should be in toolResultDetails
        "https://success2.com",
        // index 3 - should be in toolResultDetails
        "file:///nonexistent.txt",
        // index 4 - should NOT be in toolResultDetails
        "mcp-resource://server/file.txt"
        // index 5 - should be in toolResultDetails
      ];
      const result = await tool.invoke(
        { callId: "test-details", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 4, "Should have 4 successful URIs");
      const uriDetails = result.toolResultDetails;
      assert.ok(uriDetails.every((uri) => uri instanceof URI), "All toolResultDetails entries should be URI objects");
      const expectedUris = [
        "https://success1.com/",
        "https://success2.com/",
        "file:///success.txt",
        "mcp-resource://server/file.txt"
      ];
      const actualUriStrings = uriDetails.map((uri) => uri.toString());
      assert.deepStrictEqual(actualUriStrings.sort(), expectedUris.sort(), "Should contain exactly the expected successful URIs");
      assert.strictEqual(result.content.length, 6, "Content should have result for each input URL");
      assert.strictEqual(result.content[0].value, "Content 1", "First web URI content");
      assert.strictEqual(result.content[1].value, "Invalid URL", "Invalid URL marked as invalid");
      assert.strictEqual(result.content[2].value, "File content", "File URI content");
      assert.strictEqual(result.content[3].value, "Content 2", "Second web URI content");
      assert.strictEqual(result.content[4].value, "Invalid URL", "Nonexistent file marked as invalid");
      assert.strictEqual(result.content[5].value, "MCP content", "MCP resource content");
    });
    test("should exclude failed web requests from toolResultDetails", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success.com"), "Success content"]
        // https://failure.com not in map - will throw error
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://success.com",
        // Should succeed
        "https://failure.com"
        // Should fail (not in content map)
      ];
      try {
        await tool.invoke(
          { callId: "test-web-failure", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
          () => Promise.resolve(0),
          { report: () => {
          } },
          CancellationToken.None
        );
        assert.fail("Expected test web content extractor to throw for missing URI");
      } catch (error) {
        assert.ok(error.message.includes("No content configured for URI"), "Should throw for unconfigured URI");
      }
    });
    test("should exclude failed file reads from toolResultDetails", async () => {
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///existing.txt"), "File exists"]
        // file:///missing.txt not in map - will throw error
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "file:///existing.txt",
        // Should succeed
        "file:///missing.txt"
        // Should fail (not in file map)
      ];
      const result = await tool.invoke(
        { callId: "test-file-failure", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 1, "Should have only 1 successful URI");
      const uriDetails = result.toolResultDetails;
      assert.strictEqual(uriDetails[0].toString(), "file:///existing.txt", "Should contain only the successful file URI");
      assert.strictEqual(result.content.length, 2, "Should have results for both input URLs");
      assert.strictEqual(result.content[0].value, "File exists", "First file should have content");
      assert.strictEqual(result.content[1].value, "Invalid URL", "Second file should be marked invalid");
    });
    test("should handle mixed success and failure scenarios", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://web-success.com"), "Web success"]
      ]);
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///file-success.txt"), "File success"],
        [URI.parse("mcp-resource://good/file.txt"), VSBuffer.fromString("MCP binary content")]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "invalid-scheme://bad",
        // Invalid URI
        "https://web-success.com",
        // Web success
        "file:///file-missing.txt",
        // File failure
        "file:///file-success.txt",
        // File success
        "completely-invalid-url",
        // Invalid URL format
        "mcp-resource://good/file.txt"
        // MCP success
      ];
      const result = await tool.invoke(
        { callId: "test-mixed", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 3, "Should have 3 successful URIs");
      const uriDetails = result.toolResultDetails;
      const actualUriStrings = uriDetails.map((uri) => uri.toString());
      const expectedSuccessful = [
        "https://web-success.com/",
        "file:///file-success.txt",
        "mcp-resource://good/file.txt"
      ];
      assert.deepStrictEqual(actualUriStrings.sort(), expectedSuccessful.sort(), "Should contain exactly the successful URIs");
      assert.strictEqual(result.content.length, 6, "Should have results for all input URLs");
      assert.strictEqual(result.content[0].value, "Invalid URL", "Invalid scheme marked as invalid");
      assert.strictEqual(result.content[1].value, "Web success", "Web success content");
      assert.strictEqual(result.content[2].value, "Invalid URL", "Missing file marked as invalid");
      assert.strictEqual(result.content[3].value, "File success", "File success content");
      assert.strictEqual(result.content[4].value, "Invalid URL", "Invalid URL marked as invalid");
      assert.strictEqual(result.content[5].value, "MCP binary content", "MCP success content");
    });
    test("should return empty toolResultDetails when all requests fail", async () => {
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        // Empty - all web requests fail
        new ExtendedTestFileService(new ResourceMap()),
        // Empty - all file ,
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://nonexistent.com",
        "file:///missing.txt",
        "invalid-url",
        "bad://scheme"
      ];
      try {
        const result = await tool.invoke(
          { callId: "test-all-fail", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
          () => Promise.resolve(0),
          { report: () => {
          } },
          CancellationToken.None
        );
        assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
        assert.strictEqual(result.toolResultDetails.length, 0, "Should have no successful URIs");
        assert.strictEqual(result.content.length, 4, "Should have results for all input URLs");
        assert.ok(result.content.every((content) => content.value === "Invalid URL"), "All content should be marked as invalid");
      } catch (error) {
        assert.ok(error.message.includes("No content configured for URI"), "Should throw for unconfigured URI");
      }
    });
    test("should handle empty URL array", async () => {
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-empty", toolId: "fetch-page", parameters: { urls: [] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1, "Should have one content item for empty URLs");
      assert.strictEqual(result.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
      assert.ok(!result.toolResultDetails, "toolResultDetails should not be present for empty URLs");
    });
    test("should handle image files in toolResultDetails", async () => {
      const imageBuffer = VSBuffer.fromString("fake-png-data");
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///image.png"), imageBuffer],
        [URI.parse("file:///document.txt"), "Text content"]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-images", toolId: "fetch-page", parameters: { urls: ["file:///image.png", "file:///document.txt"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 2, "Should have 2 successful file URIs");
      const uriDetails = result.toolResultDetails;
      assert.strictEqual(uriDetails[0].toString(), "file:///image.png", "Should include image file");
      assert.strictEqual(uriDetails[1].toString(), "file:///document.txt", "Should include text file");
      assert.strictEqual(result.content[0].kind, "data", "Image should be data part");
      assert.strictEqual(result.content[1].kind, "text", "Text file should be text part");
    });
    test("confirmResults is false when all web contents are errors or redirects", async () => {
      const webContentMap = new ResourceMap();
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return uris.map(() => ({ status: "error", error: "Failed to fetch" }));
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, false, "confirmResults should be false when all results are errors");
    });
    test("confirmResults is false when all web contents are redirects", async () => {
      const webContentMap = new ResourceMap();
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return uris.map(() => ({ status: "redirect", toURI: URI.parse("https://redirected.com") }));
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, false, "confirmResults should be false when all results are redirects");
    });
    test("confirmResults is undefined when at least one web content succeeds", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success.com"), "Success content"]
      ]);
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return [
              { status: "ok", result: "Success content" },
              { status: "error", error: "Failed" }
            ];
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://success.com", "https://error.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, void 0, "confirmResults should be undefined when at least one result succeeds");
    });
    test("redirect result provides correct message with new URL", async () => {
      const redirectURI = URI.parse("https://redirected.com/page");
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(new ResourceMap());
          }
          async extract(uris) {
            return [{ status: "redirect", toURI: redirectURI }];
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      if (result.content[0].kind === "text") {
        assert.ok(result.content[0].value.includes(redirectURI.toString(true)), "Redirect message should include target URL");
        assert.ok(result.content[0].value.includes(InternalFetchWebPageToolId), "Redirect message should suggest using tool again");
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHRvb2xzXFxidWlsdGluVG9vbHNcXGZldGNoUGFnZVRvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJUmVhZEZpbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSwgV2ViQ29udGVudEV4dHJhY3RSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IHRlc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBGZXRjaFdlYlBhZ2VUb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci9idWlsdEluVG9vbHMvZmV0Y2hQYWdlVG9vbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi91cmwvdGVzdC9icm93c2VyL21vY2tUcnVzdGVkRG9tYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbEZldGNoV2ViUGFnZVRvb2xJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvdG9vbHMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyB1cGNhc3REZWVwUGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSwgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbmNsYXNzIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBpbXBsZW1lbnRzIElXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVxdWVzdGVkVXJpczogVVJJW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHVyaVRvQ29udGVudE1hcDogUmVzb3VyY2VNYXA8c3RyaW5nPikgeyB9XG5cblx0YXN5bmMgZXh0cmFjdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V2ViQ29udGVudEV4dHJhY3RSZXN1bHRbXT4ge1xuXHRcdHRoaXMucmVxdWVzdGVkVXJpcy5wdXNoKC4uLnVyaXMpO1xuXHRcdHJldHVybiB1cmlzLm1hcCh1cmkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMudXJpVG9Db250ZW50TWFwLmdldCh1cmkpO1xuXHRcdFx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGNvbnRlbnQgY29uZmlndXJlZCBmb3IgVVJJOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnb2snLCByZXN1bHQ6IGNvbnRlbnQgfTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZSBleHRlbmRzIFRlc3RGaWxlU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdXJpVG9Db250ZW50TWFwOiBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLnVyaVRvQ29udGVudE1hcC5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmlsZSBub3QgZm91bmQ6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBidWZmZXIgPSB0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycgPyBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpIDogY29udGVudDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR2YWx1ZTogYnVmZmVyLFxuXHRcdFx0bmFtZTogJycsXG5cdFx0XHRzaXplOiBidWZmZXIuYnl0ZUxlbmd0aCxcblx0XHRcdGV0YWc6ICcnLFxuXHRcdFx0bXRpbWU6IDAsXG5cdFx0XHRjdGltZTogMCxcblx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpIHtcblx0XHQvLyBDaGVjayBpZiB0aGUgcmVzb3VyY2UgZXhpc3RzIGluIG91ciBtYXBcblx0XHRpZiAoIXRoaXMudXJpVG9Db250ZW50TWFwLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmlsZSBub3QgZm91bmQ6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuc3RhdChyZXNvdXJjZSk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRpc1VyaUFsbG93ZWQoX3VyaTogVVJJKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGZvcm1hdEVycm9yKHVyaTogVVJJKTogc3RyaW5nIHsgcmV0dXJuIGBBY2Nlc3MgdG8gJHt1cmkuYXV0aG9yaXR5fSBpcyBibG9ja2VkIGJ5IG5ldHdvcmsgZG9tYWluIHBvbGljeS5gOyB9XG59XG5cbnN1aXRlKCdGZXRjaFdlYlBhZ2VUb29sJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGh0dHAvaHR0cHMgdmlhIHdlYiBjb250ZW50IGV4dHJhY3RvciBhbmQgb3RoZXIgc2NoZW1lcyB2aWEgZmlsZSBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyksICdIVFRQUyBjb250ZW50J10sXG5cdFx0XHRbVVJJLnBhcnNlKCdodHRwOi8vZXhhbXBsZS5jb20nKSwgJ0hUVFAgY29udGVudCddXG5cdFx0XSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5wYXJzZSgndGVzdDovL3N0YXRpYy9yZXNvdXJjZS81MCcpLCAnTUNQIHJlc291cmNlIGNvbnRlbnQnXSxcblx0XHRcdFtVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL3dvcmxkLnR4dCcpLCAnQ3VzdG9tIE1DUCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRlc3RVcmxzID0gW1xuXHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0J2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQndGVzdDovL3N0YXRpYy9yZXNvdXJjZS81MCcsXG5cdFx0XHQnbWNwLXJlc291cmNlOi8vNzQ2NTczNzQyRDczNjU3Mjc2NjU3Mi9jdXN0b20vaGVsbG8vd29ybGQudHh0Jyxcblx0XHRcdCdmaWxlOi8vL3BhdGgvdG8vbm9uZXhpc3RlbnQnLFxuXHRcdFx0J2Z0cDovL2V4YW1wbGUuY29tJyxcblx0XHRcdCdpbnZhbGlkLXVybCdcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbC0xJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogdGVzdFVybHMgfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDcgcmVzdWx0cyAob25lIGZvciBlYWNoIGlucHV0IFVSTClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCA3LCAnU2hvdWxkIGhhdmUgcmVzdWx0IGZvciBlYWNoIGlucHV0IFVSTCcpO1xuXG5cdFx0Ly8gSFRUUCBhbmQgSFRUUFMgVVJMcyBzaG91bGQgaGF2ZSB0aGVpciBjb250ZW50IGZyb20gd2ViIGV4dHJhY3RvclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ0hUVFBTIGNvbnRlbnQnLCAnSFRUUFMgVVJMIHNob3VsZCByZXR1cm4gY29udGVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ0hUVFAgY29udGVudCcsICdIVFRQIFVSTCBzaG91bGQgcmV0dXJuIGNvbnRlbnQnKTtcblxuXHRcdC8vIE1DUCByZXNvdXJjZXMgc2hvdWxkIGhhdmUgdGhlaXIgY29udGVudCBmcm9tIGZpbGUgc2VydmljZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsyXS52YWx1ZSwgJ01DUCByZXNvdXJjZSBjb250ZW50JywgJ3Rlc3Q6Ly8gVVJMIHNob3VsZCByZXR1cm4gY29udGVudCBmcm9tIGZpbGUgc2VydmljZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFszXS52YWx1ZSwgJ0N1c3RvbSBNQ1AgY29udGVudCcsICdtY3AtcmVzb3VyY2U6Ly8gVVJMIHNob3VsZCByZXR1cm4gY29udGVudCBmcm9tIGZpbGUgc2VydmljZScpO1xuXG5cdFx0Ly8gTm9uZXhpc3RlbnQgZmlsZSBzaG91bGQgYmUgbWFya2VkIGFzIGludmFsaWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNF0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdOb25leGlzdGVudCBmaWxlIHNob3VsZCBiZSBpbnZhbGlkJyk7XG5cblx0XHQvLyBVbnN1cHBvcnRlZCBzY2hlbWUgKGZ0cCkgc2hvdWxkIGJlIG1hcmtlZCBhcyBpbnZhbGlkIHNpbmNlIGZpbGUgc2VydmljZSBjYW4ndCBoYW5kbGUgaXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNV0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdmdHA6Ly8gVVJMIHNob3VsZCBiZSBpbnZhbGlkJyk7XG5cblx0XHQvLyBJbnZhbGlkIFVSTCBzaG91bGQgYmUgbWFya2VkIGFzIGludmFsaWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNl0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdJbnZhbGlkIFVSTCBzaG91bGQgYmUgaW52YWxpZCcpO1xuXG5cdFx0Ly8gQWxsIHN1Y2Nlc3NmdWxseSBmZXRjaGVkIFVSTHMgc2hvdWxkIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSA/IHJlc3VsdC50b29sUmVzdWx0RGV0YWlscy5sZW5ndGggOiAwLCA0LCAnU2hvdWxkIGhhdmUgNCB2YWxpZCBVUkxzIGluIHRvb2xSZXN1bHREZXRhaWxzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jsb2NrcyBJUHY2IGxpdGVyYWxzIGJlZm9yZSB3ZWIgY29udGVudCBleHRyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVybHMgPSBbXG5cdFx0XHQnaHR0cDovLzEyNy4wLjAuMS9wcml2YXRlJyxcblx0XHRcdCdodHRwOi8vWzo6MV0vcHJpdmF0ZScsXG5cdFx0XHQnaHR0cDovL1s6OmZmZmY6MTI3LjAuMC4xXS9wcml2YXRlJyxcblx0XHRdO1xuXHRcdGNvbnN0IHdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlID0gbmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRbVVJJLnBhcnNlKHVybHNbMV0pLCAnSVB2NiBsb29wYmFjayBjb250ZW50J10sXG5cdFx0XHRbVVJJLnBhcnNlKHVybHNbMl0pLCAnSVB2NC1tYXBwZWQgSVB2NiBjb250ZW50J10sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuTmV0d29ya0ZpbHRlciwgdHJ1ZSk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zLCBbXSk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnMsIFtdKTtcblx0XHRjb25zdCBuZXR3b3JrRmlsdGVyU2VydmljZSA9IG5ldyBBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKGNvbmZpZ1NlcnZpY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdFx0d2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCkpLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXR3b3JrRmlsdGVyU2VydmljZSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbC1pcHY2JywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJscyB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb250ZW50OiByZXN1bHQuY29udGVudC5tYXAocGFydCA9PiBwYXJ0LnZhbHVlKSxcblx0XHRcdFx0cmVxdWVzdGVkVXJpczogd2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UucmVxdWVzdGVkVXJpcy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29udGVudDogdXJscy5tYXAodXJsID0+IG5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmZvcm1hdEVycm9yKFVSSS5wYXJzZSh1cmwpKSksXG5cdFx0XHRcdHJlcXVlc3RlZFVyaXM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgYW5kIHVuZGVmaW5lZCBVUkxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdC8vIFRlc3QgZW1wdHkgYXJyYXlcblx0XHRjb25zdCBlbXB0eVJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwtMicsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IFtdIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVtcHR5UmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAxLCAnRW1wdHkgYXJyYXkgc2hvdWxkIHJldHVybiBzaW5nbGUgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbXB0eVJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnTm8gdmFsaWQgVVJMcyBwcm92aWRlZC4nLCAnU2hvdWxkIGluZGljYXRlIG5vIHZhbGlkIFVSTHMnKTtcblxuXHRcdC8vIFRlc3QgdW5kZWZpbmVkXG5cdFx0Y29uc3QgdW5kZWZpbmVkUmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbC0zJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHt9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRlZmluZWRSZXN1bHQuY29udGVudC5sZW5ndGgsIDEsICdVbmRlZmluZWQgVVJMcyBzaG91bGQgcmV0dXJuIHNpbmdsZSBtZXNzYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZGVmaW5lZFJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnTm8gdmFsaWQgVVJMcyBwcm92aWRlZC4nLCAnU2hvdWxkIGluZGljYXRlIG5vIHZhbGlkIFVSTHMnKTtcblxuXHRcdC8vIFRlc3QgYXJyYXkgd2l0aCBpbnZhbGlkIFVSTHNcblx0XHRjb25zdCBpbnZhbGlkUmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbC00JywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogWycnLCAnICcsICdpbnZhbGlkLXNjaGVtZS10aGF0LWZpbGVzZXJ2aWNlLWNhbm5vdC1oYW5kbGU6Ly90ZXN0J10gfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIHJlc3VsdCBmb3IgZWFjaCBpbnZhbGlkIFVSTCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZhbGlkUmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdFbXB0eSBzdHJpbmcgc2hvdWxkIGJlIGludmFsaWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFJlc3VsdC5jb250ZW50WzFdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnU3BhY2Utb25seSBzdHJpbmcgc2hvdWxkIGJlIGludmFsaWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFJlc3VsdC5jb250ZW50WzJdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnVW5oYW5kbGVhYmxlIHNjaGVtZSBzaG91bGQgYmUgaW52YWxpZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJvdmlkZSBjb3JyZWN0IHBhc3QgdGVuc2UgbWVzc2FnZXMgZm9yIG1peGVkIHZhbGlkL2ludmFsaWQgVVJMcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly92YWxpZC5jb20nKSwgJ1ZhbGlkIGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ3Rlc3Q6Ly92YWxpZC9yZXNvdXJjZScpLCAnVmFsaWQgTUNQIGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSh3ZWJDb250ZW50TWFwKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHsgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2h0dHBzOi8vdmFsaWQuY29tJywgJ3Rlc3Q6Ly92YWxpZC9yZXNvdXJjZScsICdpbnZhbGlkOi8vaW52YWxpZCddIH0sIHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwtMScsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24ucGFzdFRlbnNlTWVzc2FnZSwgJ1Nob3VsZCBoYXZlIHBhc3QgdGVuc2UgbWVzc2FnZScpO1xuXHRcdGNvbnN0IG1lc3NhZ2VUZXh0ID0gdHlwZW9mIHByZXBhcmF0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgPT09ICdzdHJpbmcnID8gcHJlcGFyYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA6IHByZXBhcmF0aW9uLnBhc3RUZW5zZU1lc3NhZ2UhLnZhbHVlO1xuXHRcdGFzc2VydC5vayhtZXNzYWdlVGV4dC5pbmNsdWRlcygnRmV0Y2hlZCcpLCAnU2hvdWxkIG1lbnRpb24gZmV0Y2hlZCByZXNvdXJjZXMnKTtcblx0XHRhc3NlcnQub2sobWVzc2FnZVRleHQuaW5jbHVkZXMoJ2ludmFsaWQ6Ly9pbnZhbGlkJyksICdTaG91bGQgbWVudGlvbiBpbnZhbGlkIFVSTCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IHNob3cgY29uZmlybWF0aW9uIGRpYWxvZyBmb3IgZmlsZSBVUklzIGluc2lkZSB0aGUgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFVzZSBhIHdvcmtzcGFjZSByb290ZWQgYXQgL3dvcmtzcGFjZVJvb3Rcblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290Jyk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHRlc3RXb3Jrc3BhY2Uod29ya3NwYWNlUm9vdCkpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QvcGxhbi5tZCcpLCAnUGxhbiBjb250ZW50J10sXG5cdFx0XHRbVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3N1YmRpci9ub3Rlcy50eHQnKSwgJ05vdGVzIGNvbnRlbnQnXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZShbXSksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHQvLyBGaWxlIGluc2lkZSB3b3Jrc3BhY2UgLSBzaG91bGQgTk9UIHRyaWdnZXIgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHsgcGFyYW1ldGVyczogeyB1cmxzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3BsYW4ubWQnKS50b1N0cmluZygpXSB9LCB0b29sQ2FsbElkOiAndGVzdC1maWxlLWluLXdzJywgY2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCB1bmRlZmluZWQsICdGaWxlIGluc2lkZSB3b3Jrc3BhY2Ugc2hvdWxkIG5vdCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCBmYWxzZSwgJ0ZpbGUgaW5zaWRlIHdvcmtzcGFjZSBzaG91bGQgbm90IHJlcXVpcmUgcG9zdC1jb25maXJtYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHNob3cgY29uZmlybWF0aW9uIGRpYWxvZyBmb3IgZmlsZSBVUklzIG91dHNpZGUgdGhlIHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBVc2UgYSB3b3Jrc3BhY2Ugcm9vdGVkIGF0IC93b3Jrc3BhY2VSb290XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLmZpbGUoJy90bXAvZXh0ZXJuYWwtcGxhbi5tZCcpLCAnRXh0ZXJuYWwgcGxhbiBjb250ZW50J10sXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Ly8gRmlsZSBvdXRzaWRlIHdvcmtzcGFjZSAtIHNob3VsZCBzdGlsbCB0cmlnZ2VyIGNvbmZpcm1hdGlvblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogW1VSSS5maWxlKCcvdG1wL2V4dGVybmFsLXBsYW4ubWQnKS50b1N0cmluZygpXSB9LCB0b29sQ2FsbElkOiAndGVzdC1maWxlLW91dHNpZGUtd3MnLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdGaWxlIG91dHNpZGUgd29ya3NwYWNlIHNob3VsZCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCB0cnVlLCAnRmlsZSBvdXRzaWRlIHdvcmtzcGFjZSBzaG91bGQgcmVxdWlyZSBwb3N0LWNvbmZpcm1hdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIFVSSSB0aGF0IHRyYXZlcnNlcyBvdXQgb2YgdGhlIHdvcmtzcGFjZSByZXF1aXJlcyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogYSBgLi5gIHRyYXZlcnNhbCB0aGF0IGVzY2FwZXMgdGhlIHdvcmtzcGFjZSBtdXN0IG5vdCBiZSBqdWRnZWQgYXMgaW5zaWRlIGl0LlxuXHRcdC8vIFRoZSBtZW1iZXJzaGlwIGNoZWNrIGFuZCB0aGUgcmVhZCBtdXN0IGFncmVlIG9uIHRoZSBjYW5vbmljYWwgKG5vcm1hbGl6ZWQpIHBhdGguXG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdC8vIFRoZSByZWFsIHRhcmdldCwgYWZ0ZXIgcmVzb2x2aW5nIGAuLmAsIGxpdmVzIG91dHNpZGUgdGhlIHdvcmtzcGFjZS5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5maWxlKCcvZXRjL3NlY3JldC50eHQnKSwgJ3NlY3JldCBjb250ZW50J10sXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHsgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vd29ya3NwYWNlUm9vdC8uLi8uLi9ldGMvc2VjcmV0LnR4dCddIH0sIHRvb2xDYWxsSWQ6ICd0ZXN0LWZpbGUtdHJhdmVyc2FsJywgY2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCAnVHJhdmVyc2FsIGVzY2FwaW5nIHRoZSB3b3Jrc3BhY2Ugc2hvdWxkIHNob3cgY29uZmlybWF0aW9uIGRpYWxvZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMsIHRydWUsICdUcmF2ZXJzYWwgZXNjYXBpbmcgdGhlIHdvcmtzcGFjZSBzaG91bGQgcmVxdWlyZSBwb3N0LWNvbmZpcm1hdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIFVSSSB3aXRoIGAuLmAgdGhhdCBzdGF5cyBpbnNpZGUgdGhlIHdvcmtzcGFjZSBzdGlsbCBza2lwcyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTm9ybWFsaXphdGlvbiBtdXN0IG5vdCBvdmVyLWJsb2NrOiBhbiBpbi13b3Jrc3BhY2UgcGF0aCB0aGF0IGhhcHBlbnMgdG8gY29udGFpbiBgLi5gXG5cdFx0Ly8gcmVzb2x2ZXMgYmFjayBpbnNpZGUgdGhlIHdvcmtzcGFjZSBhbmQgc2hvdWxkIG5vdCBwcm9tcHQuXG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3BsYW4ubWQnKSwgJ1BsYW4gY29udGVudCddLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL3dvcmtzcGFjZVJvb3Qvc3ViZGlyLy4uL3BsYW4ubWQnXSB9LCB0b29sQ2FsbElkOiAndGVzdC1maWxlLWluc2lkZS10cmF2ZXJzYWwnLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsIHVuZGVmaW5lZCwgJ0luLXdvcmtzcGFjZSBmaWxlIChhZnRlciBub3JtYWxpemF0aW9uKSBzaG91bGQgbm90IHNob3cgY29uZmlybWF0aW9uIGRpYWxvZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMsIGZhbHNlLCAnSW4td29ya3NwYWNlIGZpbGUgc2hvdWxkIG5vdCByZXF1aXJlIHBvc3QtY29uZmlybWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtzcGFjZSBmaWxlIG1peGVkIHdpdGggdW50cnVzdGVkIHdlYiBVUkk6IG9ubHkgd2ViIFVSSSB0cmlnZ2VycyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyksICdXZWIgY29udGVudCddXG5cdFx0XSk7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QvcGxhbi5tZCcpLCAnUGxhbiBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZShbXSksIC8vIE5vIHRydXN0ZWQgZG9tYWluc1xuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Ly8gTWl4OiBvbmUgdW50cnVzdGVkIHdlYiBVUkkgKyBvbmUgd29ya3NwYWNlIGZpbGUgVVJJXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyB1cmxzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nLCBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QvcGxhbi5tZCcpLnRvU3RyaW5nKCldIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0ZXN0LW1peGVkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0Ly8gQ29uZmlybWF0aW9uIHNob3VsZCBvbmx5IGJlIGZvciB0aGUgd2ViIFVSSVxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdTaG91bGQgc2hvdyBjb25maXJtYXRpb24gZm9yIHVudHJ1c3RlZCB3ZWIgVVJJJyk7XG5cdFx0Ly8gVGhlIGNvbmZpcm1hdGlvbiBtZXNzYWdlIHNob3VsZCBtZW50aW9uIG9ubHkgdGhlIHdlYiBVUkksIG5vdCB0aGUgd29ya3NwYWNlIGZpbGVcblx0XHRjb25zdCBtc2dWYWx1ZSA9IHR5cGVvZiBwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdD8gcHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZVxuXHRcdFx0OiBwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZT8udmFsdWUgPz8gJyc7XG5cdFx0YXNzZXJ0Lm9rKCFtc2dWYWx1ZS5pbmNsdWRlcygnL3dvcmtzcGFjZVJvb3QvJyksICdDb25maXJtYXRpb24gbWVzc2FnZSBzaG91bGQgbm90IG1lbnRpb24gd29ya3NwYWNlIGZpbGUnKTtcblx0XHRhc3NlcnQub2sobXNnVmFsdWUuaW5jbHVkZXMoJ2V4YW1wbGUuY29tJyksICdDb25maXJtYXRpb24gbWVzc2FnZSBzaG91bGQgbWVudGlvbiB3ZWIgVVJJJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhcHByb3ZlIHdoZW4gYWxsIFVSTHMgd2VyZSBtZW50aW9uZWQgaW4gY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly92YWxpZC5jb20nKSwgJ1ZhbGlkIGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ3Rlc3Q6Ly92YWxpZC9yZXNvdXJjZScpLCAnVmFsaWQgTUNQIGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSh3ZWJDb250ZW50TWFwKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHR1cGNhc3REZWVwUGFydGlhbDxJQ2hhdFNlcnZpY2U+KHtcblx0XHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdmZXRjaCBodHRwczovL2V4YW1wbGUuY29tJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24xID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL2V4YW1wbGUuY29tJ10gfSwgdG9vbENhbGxJZDogJ3Rlc3QtY2FsbC0yJywgY2hhdFNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhJykgfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uMSwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbjEuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24yID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL290aGVyLmNvbSddIH0sIHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwtMycsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYScpIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbjIsICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24yLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiBmb3IgYSBmaWxlIFVSSSBlbWJlZGRlZCBpbnNpZGUgYSBwYXN0ZWQgd2ViIFVSTCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9ob21lL3ZpY3RpbS8uc3NoL2lkX3JzYScpLCAnc2VjcmV0IGtleSddXG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdXNlciBvbmx5IGV2ZXIgcGFzdGVkIGEgd2ViIFVSTCB0aGF0IGhhcHBlbnMgdG8gY29udGFpbiB0aGUgZmlsZSBVUkkgYXMgYVxuXHRcdC8vIHF1ZXJ5LXBhcmFtZXRlciB2YWx1ZS4gSXQgbXVzdCBOT1QgYmUgdHJlYXRlZCBhcyBhbiBleHBsaWNpdCByZXF1ZXN0IGZvciB0aGUgZmlsZSxcblx0XHQvLyBzbyB0aGUgY29uZmlybWF0aW9uIGRpYWxvZyBtdXN0IHN0aWxsIGJlIHNob3duLlxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0dXBjYXN0RGVlcFBhcnRpYWw8SUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRcdGdldFNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZmV0Y2ggaHR0cHM6Ly9hdHRhY2tlci5leGFtcGxlL3AuaHRtbD91PWZpbGU6Ly8vaG9tZS92aWN0aW0vLnNzaC9pZF9yc2EnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy9ob21lL3ZpY3RpbS8uc3NoL2lkX3JzYSddIH0sIHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwtaW5qZWN0aW9uJywgY2hhdFNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhJykgfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSwgJ0VtYmVkZGVkIGZpbGUgVVJJIHNob3VsZCBzdGlsbCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCB0cnVlLCAnRW1iZWRkZWQgZmlsZSBVUkkgc2hvdWxkIHN0aWxsIHJlcXVpcmUgcG9zdC1jb25maXJtYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBhIHN0YW5kYWxvbmUgb3V0LW9mLXdvcmtzcGFjZSBmaWxlIFVSSSB0aGUgdXNlciBwYXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLmZpbGUoJy90bXAvZXh0ZXJuYWwtcGxhbi5tZCcpLCAnRXh0ZXJuYWwgcGxhbiBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdC8vIFRoZSB1c2VyIGV4cGxpY2l0bHkgcmVmZXJlbmNlZCB0aGUgZmlsZSBVUkkgYXMgaXRzIG93biB0b2tlbiwgc28gaXQgc2hvdWxkIGJlXG5cdFx0Ly8gdHJlYXRlZCBhcyB1c2VyLWFwcHJvdmVkIGV2ZW4gdGhvdWdoIGl0IGxpdmVzIG91dHNpZGUgdGhlIHdvcmtzcGFjZS5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0dXBjYXN0RGVlcFBhcnRpYWw8SUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRcdGdldFNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAncGxlYXNlIGZldGNoIChmaWxlOi8vL3RtcC9leHRlcm5hbC1wbGFuLm1kKSBmb3IgbWUnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogW1VSSS5maWxlKCcvdG1wL2V4dGVybmFsLXBsYW4ubWQnKS50b1N0cmluZygpXSB9LCB0b29sQ2FsbElkOiAndGVzdC1jYWxsLXN0YW5kYWxvbmUtZmlsZScsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYScpIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsIHVuZGVmaW5lZCwgJ0V4cGxpY2l0bHkgcmVmZXJlbmNlZCBmaWxlIFVSSSBzaG91bGQgbm90IHNob3cgY29uZmlybWF0aW9uIGRpYWxvZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMsIGZhbHNlLCAnRXhwbGljaXRseSByZWZlcmVuY2VkIGZpbGUgVVJJIHNob3VsZCBub3QgcmVxdWlyZSBwb3N0LWNvbmZpcm1hdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiBhIHByaW9yIG1lc3NhZ2Ugb25seSBtZW50aW9ucyBhIGJhcmUgKHNjaGVtZS1sZXNzKSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5maWxlKCcvZXRjL3NlY3JldC50eHQnKSwgJ3NlY3JldCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdC8vIFRoZSB1c2VyIG9ubHkgZXZlciB0eXBlZCBhIGJhcmUgZmlsZXN5c3RlbSBwYXRoIChubyBgZmlsZTovL2Agc2NoZW1lKS4gSXQgbXVzdCBub3QgYmVcblx0XHQvLyB0cmVhdGVkIGFzIGEgcmVmZXJlbmNlZCByZXNvdXJjZSBcdTIwMTQgYSBzY2hlbWUtbGVzcyB0b2tlbiBtdXN0IG5vdCBkZWZhdWx0IHRvIGEgZmlsZSBVUklcblx0XHQvLyBhbmQgYXV0by1hcHByb3ZlIGEgbWF0Y2hpbmcgcmVhZC5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0dXBjYXN0RGVlcFBhcnRpYWw8SUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRcdGdldFNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAndGhlIGNvbmZpZyBsaXZlcyBhdCAvZXRjL3NlY3JldC50eHQgb24gdGhlIGJveCdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHsgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vZXRjL3NlY3JldC50eHQnXSB9LCB0b29sQ2FsbElkOiAndGVzdC1jYWxsLWJhcmUtcGF0aCcsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYScpIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdCYXJlIHBhdGggbWVudGlvbiBzaG91bGQgc3RpbGwgc2hvdyBjb25maXJtYXRpb24gZGlhbG9nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cywgdHJ1ZSwgJ0JhcmUgcGF0aCBtZW50aW9uIHNob3VsZCBzdGlsbCByZXF1aXJlIHBvc3QtY29uZmlybWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gbWVzc2FnZSBmb3IgYmluYXJ5IGZpbGVzIGluZGljYXRpbmcgdGhleSBhcmUgbm90IHN1cHBvcnRlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcmVhdGUgYmluYXJ5IGNvbnRlbnQgKGEgc2ltcGxlIFBORy1saWtlIGhlYWRlciB3aXRoIG51bGwgYnl0ZXMpXG5cdFx0Y29uc3QgYmluYXJ5Q29udGVudCA9IG5ldyBVaW50OEFycmF5KFsweDg5LCAweDUwLCAweDRFLCAweDQ3LCAweDBELCAweDBBLCAweDFBLCAweDBBLCAweDAwLCAweDAwLCAweDAwLCAweDBEXSk7XG5cdFx0Y29uc3QgYmluYXJ5QnVmZmVyID0gVlNCdWZmZXIud3JhcChiaW5hcnlDb250ZW50KTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvdG8vYmluYXJ5LmRhdCcpLCBiaW5hcnlCdWZmZXJdLFxuXHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9wYXRoL3RvL3RleHQudHh0JyksICdUaGlzIGlzIHRleHQgY29udGVudCddXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdHtcblx0XHRcdFx0Y2FsbElkOiAndGVzdC1jYWxsLWJpbmFyeScsXG5cdFx0XHRcdHRvb2xJZDogJ2ZldGNoLXBhZ2UnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy9wYXRoL3RvL2JpbmFyeS5kYXQnLCAnZmlsZTovLy9wYXRoL3RvL3RleHQudHh0J10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBTaG91bGQgaGF2ZSAyIHJlc3VsdHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgMiByZXN1bHRzJyk7XG5cblx0XHQvLyBGaXJzdCByZXN1bHQgc2hvdWxkIGJlIGEgdGV4dCBwYXJ0IHdpdGggYmluYXJ5IG5vdCBzdXBwb3J0ZWQgbWVzc2FnZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS5raW5kLCAndGV4dCcsICdCaW5hcnkgZmlsZSBzaG91bGQgcmV0dXJuIHRleHQgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFswXS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ0JpbmFyeSBmaWxlcyBhcmUgbm90IHN1cHBvcnRlZCBhdCB0aGUgbW9tZW50LicsICdTaG91bGQgcmV0dXJuIG5vdCBzdXBwb3J0ZWQgbWVzc2FnZScpO1xuXHRcdH1cblxuXHRcdC8vIFNlY29uZCByZXN1bHQgc2hvdWxkIGJlIGEgdGV4dCBwYXJ0IGZvciB0aGUgdGV4dCBmaWxlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICd0ZXh0JywgJ1RleHQgZmlsZSBzaG91bGQgcmV0dXJuIHRleHQgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFsxXS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ1RoaXMgaXMgdGV4dCBjb250ZW50JywgJ1Nob3VsZCByZXR1cm4gdGV4dCBjb250ZW50Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gQm90aCBmaWxlcyBzaG91bGQgYmUgaW4gdG9vbFJlc3VsdERldGFpbHMgc2luY2UgdGhleSB3ZXJlIHN1Y2Nlc3NmdWxseSBmZXRjaGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSA/IHJlc3VsdC50b29sUmVzdWx0RGV0YWlscy5sZW5ndGggOiAwLCAyLCAnU2hvdWxkIGhhdmUgMiB2YWxpZCBVUkxzIGluIHRvb2xSZXN1bHREZXRhaWxzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BORyBmaWxlcyBhcmUgbm93IHN1cHBvcnRlZCBhcyBpbWFnZSBkYXRhIHBhcnRzIChyZWdyZXNzaW9uIHRlc3QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgdGVzdCBlbnN1cmVzIHRoYXQgUE5HIGZpbGVzIHRoYXQgcHJldmlvdXNseSByZXR1cm5lZCBcIm5vdCBzdXBwb3J0ZWRcIlxuXHRcdC8vIG1lc3NhZ2VzIG5vdyByZXR1cm4gcHJvcGVyIGltYWdlIGRhdGEgcGFydHNcblx0XHRjb25zdCBiaW5hcnlDb250ZW50ID0gbmV3IFVpbnQ4QXJyYXkoWzB4ODksIDB4NTAsIDB4NEUsIDB4NDcsIDB4MEQsIDB4MEEsIDB4MUEsIDB4MEEsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MERdKTtcblx0XHRjb25zdCBiaW5hcnlCdWZmZXIgPSBWU0J1ZmZlci53cmFwKGJpbmFyeUNvbnRlbnQpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC90by9pbWFnZS5wbmcnKSwgYmluYXJ5QnVmZmVyXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJ3Rlc3QtcG5nLXN1cHBvcnQnLFxuXHRcdFx0XHR0b29sSWQ6ICdmZXRjaC1wYWdlJyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vcGF0aC90by9pbWFnZS5wbmcnXSB9LFxuXHRcdFx0XHRjb250ZXh0OiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDEgcmVzdWx0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIDEgcmVzdWx0Jyk7XG5cblx0XHQvLyBQTkcgZmlsZSBzaG91bGQgbm93IGJlIHJldHVybmVkIGFzIGEgZGF0YSBwYXJ0LCBub3QgYSBcIm5vdCBzdXBwb3J0ZWRcIiBtZXNzYWdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICdkYXRhJywgJ1BORyBmaWxlIHNob3VsZCByZXR1cm4gZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvcG5nJywgJ1Nob3VsZCBoYXZlIFBORyBNSU1FIHR5cGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZS5kYXRhLCBiaW5hcnlCdWZmZXIsICdTaG91bGQgaGF2ZSBjb3JyZWN0IGJpbmFyeSBkYXRhJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGRpc3Rpbmd1aXNoIGJldHdlZW4gYmluYXJ5IGFuZCB0ZXh0IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIGNvbnRlbnQgdGhhdCBtaWdodCBiZSBhbWJpZ3VvdXNcblx0XHRjb25zdCBqc29uRGF0YSA9ICd7XCJuYW1lXCI6IFwidGVzdFwiLCBcInZhbHVlXCI6IDEyM30nO1xuXHRcdC8vIENyZWF0ZSBkZWZpbml0ZWx5IGJpbmFyeSBkYXRhIC0gc29tZSByYW5kb20gYnl0ZXMgd2l0aCBudWxsIGJ5dGVzIHRoYXQgZG9uJ3QgZm9sbG93IFVURi0xNiBwYXR0ZXJuXG5cdFx0Y29uc3QgcmVhbEJpbmFyeURhdGEgPSBuZXcgVWludDhBcnJheShbMHg4OSwgMHg1MCwgMHg0RSwgMHg0NywgMHgwMCwgMHgwMCwgMHgwMCwgMHgwRCwgMHhGRiwgMHgwMCwgMHhBQl0pOyAvLyBNb3JlIGNsZWFybHkgYmluYXJ5XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9kYXRhLmpzb24nKSwganNvbkRhdGFdLCAvLyBTaG91bGQgYmUgZGV0ZWN0ZWQgYXMgdGV4dFxuXHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9iaW5hcnkuZGF0JyksIFZTQnVmZmVyLndyYXAocmVhbEJpbmFyeURhdGEpXSAvLyBTaG91bGQgYmUgZGV0ZWN0ZWQgYXMgYmluYXJ5XG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdHtcblx0XHRcdFx0Y2FsbElkOiAndGVzdC1kaXN0aW5ndWlzaCcsXG5cdFx0XHRcdHRvb2xJZDogJ2ZldGNoLXBhZ2UnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy9kYXRhLmpzb24nLCAnZmlsZTovLy9iaW5hcnkuZGF0J10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBKU09OIHNob3VsZCBiZSByZXR1cm5lZCBhcyB0ZXh0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0JywgJ0pTT04gc2hvdWxkIGJlIGRldGVjdGVkIGFzIHRleHQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsIGpzb25EYXRhLCAnU2hvdWxkIHJldHVybiBKU09OIGFzIHRleHQnKTtcblx0XHR9XG5cblx0XHQvLyBCaW5hcnkgZGF0YSBzaG91bGQgYmUgcmV0dXJuZWQgYXMgbm90IHN1cHBvcnRlZCBtZXNzYWdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICd0ZXh0JywgJ0JpbmFyeSBjb250ZW50IHNob3VsZCByZXR1cm4gdGV4dCBwYXJ0IHdpdGggbWVzc2FnZScpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFsxXS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ0JpbmFyeSBmaWxlcyBhcmUgbm90IHN1cHBvcnRlZCBhdCB0aGUgbW9tZW50LicsICdTaG91bGQgcmV0dXJuIG5vdCBzdXBwb3J0ZWQgbWVzc2FnZScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU3VwcG9ydGVkIGltYWdlIGZpbGVzIGFyZSByZXR1cm5lZCBhcyBkYXRhIHBhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgZGF0YSBmb3IgZGlmZmVyZW50IHN1cHBvcnRlZCBpbWFnZSBmb3JtYXRzXG5cdFx0Y29uc3QgcG5nRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgUE5HIGRhdGEnKTtcblx0XHRjb25zdCBqcGVnRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgSlBFRyBkYXRhJyk7XG5cdFx0Y29uc3QgZ2lmRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgR0lGIGRhdGEnKTtcblx0XHRjb25zdCB3ZWJwRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgV2ViUCBkYXRhJyk7XG5cdFx0Y29uc3QgYm1wRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgQk1QIGRhdGEnKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vaW1hZ2UucG5nJyksIHBuZ0RhdGEpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vcGhvdG8uanBnJyksIGpwZWdEYXRhKTtcblx0XHRmaWxlQ29udGVudE1hcC5zZXQoVVJJLnBhcnNlKCdmaWxlOi8vL2FuaW1hdGlvbi5naWYnKSwgZ2lmRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy9tb2Rlcm4ud2VicCcpLCB3ZWJwRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy9iaXRtYXAuYm1wJyksIGJtcERhdGEpO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJ3Rlc3QtaW1hZ2VzJyxcblx0XHRcdFx0dG9vbElkOiAnZmV0Y2gtcGFnZScsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL2ltYWdlLnBuZycsICdmaWxlOi8vL3Bob3RvLmpwZycsICdmaWxlOi8vL2FuaW1hdGlvbi5naWYnLCAnZmlsZTovLy9tb2Rlcm4ud2VicCcsICdmaWxlOi8vL2JpdG1hcC5ibXAnXSB9LFxuXHRcdFx0XHRjb250ZXh0OiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdC8vIEFsbCBpbWFnZXMgc2hvdWxkIGJlIHJldHVybmVkIGFzIGRhdGEgcGFydHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCA1LCAnU2hvdWxkIGhhdmUgNSByZXN1bHRzJyk7XG5cblx0XHQvLyBDaGVjayBQTkdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ2RhdGEnLCAnUE5HIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUubWltZVR5cGUsICdpbWFnZS9wbmcnLCAnUE5HIHNob3VsZCBoYXZlIGNvcnJlY3QgTUlNRSB0eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUuZGF0YSwgcG5nRGF0YSwgJ1BORyBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBKUEVHXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICdkYXRhJywgJ0pQRUcgc2hvdWxkIGJlIGRhdGEgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFsxXS5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZS5taW1lVHlwZSwgJ2ltYWdlL2pwZWcnLCAnSlBFRyBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLnZhbHVlLmRhdGEsIGpwZWdEYXRhLCAnSlBFRyBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBHSUZcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMl0ua2luZCwgJ2RhdGEnLCAnR0lGIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMl0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMl0udmFsdWUubWltZVR5cGUsICdpbWFnZS9naWYnLCAnR0lGIHNob3VsZCBoYXZlIGNvcnJlY3QgTUlNRSB0eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMl0udmFsdWUuZGF0YSwgZ2lmRGF0YSwgJ0dJRiBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBXZWJQXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzNdLmtpbmQsICdkYXRhJywgJ1dlYlAgc2hvdWxkIGJlIGRhdGEgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFszXS5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFszXS52YWx1ZS5taW1lVHlwZSwgJ2ltYWdlL3dlYnAnLCAnV2ViUCBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzNdLnZhbHVlLmRhdGEsIHdlYnBEYXRhLCAnV2ViUCBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBCTVBcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNF0ua2luZCwgJ2RhdGEnLCAnQk1QIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbNF0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNF0udmFsdWUubWltZVR5cGUsICdpbWFnZS9ibXAnLCAnQk1QIHNob3VsZCBoYXZlIGNvcnJlY3QgTUlNRSB0eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNF0udmFsdWUuZGF0YSwgYm1wRGF0YSwgJ0JNUCBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ01peGVkIGltYWdlIGFuZCB0ZXh0IGZpbGVzIHdvcmsgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHREYXRhID0gJ1RoaXMgaXMgc29tZSB0ZXh0IGNvbnRlbnQnO1xuXHRcdGNvbnN0IGltYWdlRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgaW1hZ2UgZGF0YScpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy90ZXh0LnR4dCcpLCB0ZXh0RGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy9pbWFnZS5wbmcnKSwgaW1hZ2VEYXRhKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0e1xuXHRcdFx0XHRjYWxsSWQ6ICd0ZXN0LW1peGVkJyxcblx0XHRcdFx0dG9vbElkOiAnZmV0Y2gtcGFnZScsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL3RleHQudHh0JywgJ2ZpbGU6Ly8vaW1hZ2UucG5nJ10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBUZXh0IHNob3VsZCBiZSByZXR1cm5lZCBhcyB0ZXh0IHBhcnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnLCAnVGV4dCBmaWxlIHNob3VsZCBiZSB0ZXh0IHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsIHRleHREYXRhLCAnVGV4dCBzaG91bGQgaGF2ZSBjb3JyZWN0IGNvbnRlbnQnKTtcblx0XHR9XG5cblx0XHQvLyBJbWFnZSBzaG91bGQgYmUgcmV0dXJuZWQgYXMgZGF0YSBwYXJ0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICdkYXRhJywgJ0ltYWdlIGZpbGUgc2hvdWxkIGJlIGRhdGEgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFsxXS5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZS5taW1lVHlwZSwgJ2ltYWdlL3BuZycsICdJbWFnZSBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLnZhbHVlLmRhdGEsIGltYWdlRGF0YSwgJ0ltYWdlIHNob3VsZCBoYXZlIGNvcnJlY3QgZGF0YScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnQ2FzZSBpbnNlbnNpdGl2ZSBpbWFnZSBleHRlbnNpb25zIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW1hZ2VEYXRhID0gVlNCdWZmZXIuZnJvbVN0cmluZygnZmFrZSBpbWFnZSBkYXRhJyk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKTtcblx0XHRmaWxlQ29udGVudE1hcC5zZXQoVVJJLnBhcnNlKCdmaWxlOi8vL2ltYWdlLlBORycpLCBpbWFnZURhdGEpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vcGhvdG8uSlBFRycpLCBpbWFnZURhdGEpO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJ3Rlc3QtY2FzZScsXG5cdFx0XHRcdHRvb2xJZDogJ2ZldGNoLXBhZ2UnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy9pbWFnZS5QTkcnLCAnZmlsZTovLy9waG90by5KUEVHJ10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBCb3RoIHNob3VsZCBiZSByZXR1cm5lZCBhcyBkYXRhIHBhcnRzIGRlc3BpdGUgdXBwZXJjYXNlIGV4dGVuc2lvbnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ2RhdGEnLCAnUE5HIHdpdGggdXBwZXJjYXNlIGV4dGVuc2lvbiBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvcG5nJywgJ1Nob3VsZCBoYXZlIGNvcnJlY3QgTUlNRSB0eXBlJyk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICdkYXRhJywgJ0pQRUcgd2l0aCB1cHBlcmNhc2UgZXh0ZW5zaW9uIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMV0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUubWltZVR5cGUsICdpbWFnZS9qcGVnJywgJ1Nob3VsZCBoYXZlIGNvcnJlY3QgTUlNRSB0eXBlJyk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBDb21wcmVoZW5zaXZlIHRlc3RzIGZvciB0b29sUmVzdWx0RGV0YWlsc1xuXHRzdWl0ZSgndG9vbFJlc3VsdERldGFpbHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgb25seSBzdWNjZXNzZnVsbHkgZmV0Y2hlZCBVUklzIGluIGNvcnJlY3Qgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL3N1Y2Nlc3MxLmNvbScpLCAnQ29udGVudCAxJ10sXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vc3VjY2VzczIuY29tJyksICdDb250ZW50IDInXVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vc3VjY2Vzcy50eHQnKSwgJ0ZpbGUgY29udGVudCddLFxuXHRcdFx0XHRbVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly9zZXJ2ZXIvZmlsZS50eHQnKSwgJ01DUCBjb250ZW50J11cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGVzdFVybHMgPSBbXG5cdFx0XHRcdCdodHRwczovL3N1Y2Nlc3MxLmNvbScsICAgICAgIC8vIGluZGV4IDAgLSBzaG91bGQgYmUgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdFx0J2ludmFsaWQtdXJsJywgICAgICAgICAgICAgICAgLy8gaW5kZXggMSAtIHNob3VsZCBOT1QgYmUgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdFx0J2ZpbGU6Ly8vc3VjY2Vzcy50eHQnLCAgICAgICAgLy8gaW5kZXggMiAtIHNob3VsZCBiZSBpbiB0b29sUmVzdWx0RGV0YWlsc1xuXHRcdFx0XHQnaHR0cHM6Ly9zdWNjZXNzMi5jb20nLCAgICAgICAvLyBpbmRleCAzIC0gc2hvdWxkIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRcdCdmaWxlOi8vL25vbmV4aXN0ZW50LnR4dCcsICAgIC8vIGluZGV4IDQgLSBzaG91bGQgTk9UIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRcdCdtY3AtcmVzb3VyY2U6Ly9zZXJ2ZXIvZmlsZS50eHQnIC8vIGluZGV4IDUgLSBzaG91bGQgYmUgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtZGV0YWlscycsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IHRlc3RVcmxzIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRvb2xSZXN1bHREZXRhaWxzIGNvbnRhaW5zIGV4YWN0bHkgdGhlIHN1Y2Nlc3NmdWwgVVJJc1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSwgJ3Rvb2xSZXN1bHREZXRhaWxzIHNob3VsZCBiZSBhbiBhcnJheScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b29sUmVzdWx0RGV0YWlscy5sZW5ndGgsIDQsICdTaG91bGQgaGF2ZSA0IHN1Y2Nlc3NmdWwgVVJJcycpO1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IGFsbCBlbnRyaWVzIGFyZSBVUkkgb2JqZWN0c1xuXHRcdFx0Y29uc3QgdXJpRGV0YWlscyA9IHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyBhcyBVUklbXTtcblx0XHRcdGFzc2VydC5vayh1cmlEZXRhaWxzLmV2ZXJ5KHVyaSA9PiB1cmkgaW5zdGFuY2VvZiBVUkkpLCAnQWxsIHRvb2xSZXN1bHREZXRhaWxzIGVudHJpZXMgc2hvdWxkIGJlIFVSSSBvYmplY3RzJyk7XG5cblx0XHRcdC8vIENoZWNrIHNwZWNpZmljIFVSSXMgYXJlIGluY2x1ZGVkICh3ZWIgVVJJcyBmaXJzdCwgdGhlbiBzdWNjZXNzZnVsIGZpbGUgVVJJcylcblx0XHRcdGNvbnN0IGV4cGVjdGVkVXJpcyA9IFtcblx0XHRcdFx0J2h0dHBzOi8vc3VjY2VzczEuY29tLycsXG5cdFx0XHRcdCdodHRwczovL3N1Y2Nlc3MyLmNvbS8nLFxuXHRcdFx0XHQnZmlsZTovLy9zdWNjZXNzLnR4dCcsXG5cdFx0XHRcdCdtY3AtcmVzb3VyY2U6Ly9zZXJ2ZXIvZmlsZS50eHQnXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBhY3R1YWxVcmlTdHJpbmdzID0gdXJpRGV0YWlscy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVXJpU3RyaW5ncy5zb3J0KCksIGV4cGVjdGVkVXJpcy5zb3J0KCksICdTaG91bGQgY29udGFpbiBleGFjdGx5IHRoZSBleHBlY3RlZCBzdWNjZXNzZnVsIFVSSXMnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgYXJyYXkgbWF0Y2hlcyBpbnB1dCBvcmRlciAoaW5jbHVkaW5nIGZhaWx1cmVzKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgNiwgJ0NvbnRlbnQgc2hvdWxkIGhhdmUgcmVzdWx0IGZvciBlYWNoIGlucHV0IFVSTCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnQ29udGVudCAxJywgJ0ZpcnN0IHdlYiBVUkkgY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnSW52YWxpZCBVUkwgbWFya2VkIGFzIGludmFsaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsyXS52YWx1ZSwgJ0ZpbGUgY29udGVudCcsICdGaWxlIFVSSSBjb250ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbM10udmFsdWUsICdDb250ZW50IDInLCAnU2Vjb25kIHdlYiBVUkkgY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzRdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnTm9uZXhpc3RlbnQgZmlsZSBtYXJrZWQgYXMgaW52YWxpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzVdLnZhbHVlLCAnTUNQIGNvbnRlbnQnLCAnTUNQIHJlc291cmNlIGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleGNsdWRlIGZhaWxlZCB3ZWIgcmVxdWVzdHMgZnJvbSB0b29sUmVzdWx0RGV0YWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNldCB1cCB3ZWIgY29udGVudCBleHRyYWN0b3IgdGhhdCB3aWxsIHRocm93IGZvciBzb21lIFVSSXNcblx0XHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vc3VjY2Vzcy5jb20nKSwgJ1N1Y2Nlc3MgY29udGVudCddXG5cdFx0XHRcdC8vIGh0dHBzOi8vZmFpbHVyZS5jb20gbm90IGluIG1hcCAtIHdpbGwgdGhyb3cgZXJyb3Jcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCkpLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGVzdFVybHMgPSBbXG5cdFx0XHRcdCdodHRwczovL3N1Y2Nlc3MuY29tJywgIC8vIFNob3VsZCBzdWNjZWVkXG5cdFx0XHRcdCdodHRwczovL2ZhaWx1cmUuY29tJyAgIC8vIFNob3VsZCBmYWlsIChub3QgaW4gY29udGVudCBtYXApXG5cdFx0XHRdO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3Qtd2ViLWZhaWx1cmUnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiB0ZXN0VXJscyB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHQvLyBJZiB0aGUgd2ViIGV4dHJhY3RvciB0aHJvd3MsIGl0IHNob3VsZCBiZSBoYW5kbGVkIGdyYWNlZnVsbHlcblx0XHRcdFx0Ly8gQnV0IGluIHRoaXMgdGVzdCBzZXR1cCwgdGhlIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB0aHJvd3MgZm9yIG1pc3NpbmcgY29udGVudFxuXHRcdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgdGVzdCB3ZWIgY29udGVudCBleHRyYWN0b3IgdG8gdGhyb3cgZm9yIG1pc3NpbmcgVVJJJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGV4cGVjdGVkIGJlaGF2aW9yIHdpdGggdGhlIGN1cnJlbnQgdGVzdCBzZXR1cFxuXHRcdFx0XHQvLyBUaGUgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHRocm93cyB3aGVuIGNvbnRlbnQgaXMgbm90IGZvdW5kXG5cdFx0XHRcdGFzc2VydC5vayhlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdObyBjb250ZW50IGNvbmZpZ3VyZWQgZm9yIFVSSScpLCAnU2hvdWxkIHRocm93IGZvciB1bmNvbmZpZ3VyZWQgVVJJJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXhjbHVkZSBmYWlsZWQgZmlsZSByZWFkcyBmcm9tIHRvb2xSZXN1bHREZXRhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9leGlzdGluZy50eHQnKSwgJ0ZpbGUgZXhpc3RzJ11cblx0XHRcdFx0Ly8gZmlsZTovLy9taXNzaW5nLnR4dCBub3QgaW4gbWFwIC0gd2lsbCB0aHJvdyBlcnJvclxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXN0VXJscyA9IFtcblx0XHRcdFx0J2ZpbGU6Ly8vZXhpc3RpbmcudHh0JywgIC8vIFNob3VsZCBzdWNjZWVkXG5cdFx0XHRcdCdmaWxlOi8vL21pc3NpbmcudHh0JyAgICAvLyBTaG91bGQgZmFpbCAobm90IGluIGZpbGUgbWFwKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1maWxlLWZhaWx1cmUnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiB0ZXN0VXJscyB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdC8vIFZlcmlmeSBvbmx5IHN1Y2Nlc3NmdWwgZmlsZSBVUkkgaXMgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyksICd0b29sUmVzdWx0RGV0YWlscyBzaG91bGQgYmUgYW4gYXJyYXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgb25seSAxIHN1Y2Nlc3NmdWwgVVJJJyk7XG5cblx0XHRcdGNvbnN0IHVyaURldGFpbHMgPSByZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpRGV0YWlsc1swXS50b1N0cmluZygpLCAnZmlsZTovLy9leGlzdGluZy50eHQnLCAnU2hvdWxkIGNvbnRhaW4gb25seSB0aGUgc3VjY2Vzc2Z1bCBmaWxlIFVSSScpO1xuXG5cdFx0XHQvLyBWZXJpZnkgY29udGVudCByZWZsZWN0cyBib3RoIGF0dGVtcHRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgcmVzdWx0cyBmb3IgYm90aCBpbnB1dCBVUkxzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdGaWxlIGV4aXN0cycsICdGaXJzdCBmaWxlIHNob3VsZCBoYXZlIGNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ1NlY29uZCBmaWxlIHNob3VsZCBiZSBtYXJrZWQgaW52YWxpZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBzdWNjZXNzIGFuZCBmYWlsdXJlIHNjZW5hcmlvcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vd2ViLXN1Y2Nlc3MuY29tJyksICdXZWIgc3VjY2VzcyddXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9maWxlLXN1Y2Nlc3MudHh0JyksICdGaWxlIHN1Y2Nlc3MnXSxcblx0XHRcdFx0W1VSSS5wYXJzZSgnbWNwLXJlc291cmNlOi8vZ29vZC9maWxlLnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdNQ1AgYmluYXJ5IGNvbnRlbnQnKV1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGVzdFVybHMgPSBbXG5cdFx0XHRcdCdpbnZhbGlkLXNjaGVtZTovL2JhZCcsICAgICAgLy8gSW52YWxpZCBVUklcblx0XHRcdFx0J2h0dHBzOi8vd2ViLXN1Y2Nlc3MuY29tJywgICAvLyBXZWIgc3VjY2Vzc1xuXHRcdFx0XHQnZmlsZTovLy9maWxlLW1pc3NpbmcudHh0JywgIC8vIEZpbGUgZmFpbHVyZVxuXHRcdFx0XHQnZmlsZTovLy9maWxlLXN1Y2Nlc3MudHh0JywgIC8vIEZpbGUgc3VjY2Vzc1xuXHRcdFx0XHQnY29tcGxldGVseS1pbnZhbGlkLXVybCcsICAgIC8vIEludmFsaWQgVVJMIGZvcm1hdFxuXHRcdFx0XHQnbWNwLXJlc291cmNlOi8vZ29vZC9maWxlLnR4dCcgLy8gTUNQIHN1Y2Nlc3Ncblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtbWl4ZWQnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiB0ZXN0VXJscyB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIDMgc3VjY2Vzc2Z1bCBVUklzOiB3ZWItc3VjY2VzcywgZmlsZS1zdWNjZXNzLCBtY3Atc3VjY2Vzc1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSwgJ3Rvb2xSZXN1bHREZXRhaWxzIHNob3VsZCBiZSBhbiBhcnJheScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW10pLmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIDMgc3VjY2Vzc2Z1bCBVUklzJyk7XG5cblx0XHRcdGNvbnN0IHVyaURldGFpbHMgPSByZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW107XG5cdFx0XHRjb25zdCBhY3R1YWxVcmlTdHJpbmdzID0gdXJpRGV0YWlscy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkU3VjY2Vzc2Z1bCA9IFtcblx0XHRcdFx0J2h0dHBzOi8vd2ViLXN1Y2Nlc3MuY29tLycsXG5cdFx0XHRcdCdmaWxlOi8vL2ZpbGUtc3VjY2Vzcy50eHQnLFxuXHRcdFx0XHQnbWNwLXJlc291cmNlOi8vZ29vZC9maWxlLnR4dCdcblx0XHRcdF07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVXJpU3RyaW5ncy5zb3J0KCksIGV4cGVjdGVkU3VjY2Vzc2Z1bC5zb3J0KCksICdTaG91bGQgY29udGFpbiBleGFjdGx5IHRoZSBzdWNjZXNzZnVsIFVSSXMnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgYXJyYXkgcmVmbGVjdHMgYWxsIGlucHV0cyBpbiBvcmlnaW5hbCBvcmRlclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgNiwgJ1Nob3VsZCBoYXZlIHJlc3VsdHMgZm9yIGFsbCBpbnB1dCBVUkxzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdJbnZhbGlkIHNjaGVtZSBtYXJrZWQgYXMgaW52YWxpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLnZhbHVlLCAnV2ViIHN1Y2Nlc3MnLCAnV2ViIHN1Y2Nlc3MgY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzJdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnTWlzc2luZyBmaWxlIG1hcmtlZCBhcyBpbnZhbGlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbM10udmFsdWUsICdGaWxlIHN1Y2Nlc3MnLCAnRmlsZSBzdWNjZXNzIGNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFs0XS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ0ludmFsaWQgVVJMIG1hcmtlZCBhcyBpbnZhbGlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNV0udmFsdWUsICdNQ1AgYmluYXJ5IGNvbnRlbnQnLCAnTUNQIHN1Y2Nlc3MgY29udGVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBlbXB0eSB0b29sUmVzdWx0RGV0YWlscyB3aGVuIGFsbCByZXF1ZXN0cyBmYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLCAvLyBFbXB0eSAtIGFsbCB3ZWIgcmVxdWVzdHMgZmFpbFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSwgLy8gRW1wdHkgLSBhbGwgZmlsZSAsXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXN0VXJscyA9IFtcblx0XHRcdFx0J2h0dHBzOi8vbm9uZXhpc3RlbnQuY29tJyxcblx0XHRcdFx0J2ZpbGU6Ly8vbWlzc2luZy50eHQnLFxuXHRcdFx0XHQnaW52YWxpZC11cmwnLFxuXHRcdFx0XHQnYmFkOi8vc2NoZW1lJ1xuXHRcdFx0XTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWFsbC1mYWlsJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogdGVzdFVybHMgfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Ly8gSWYgd2ViIGV4dHJhY3RvciBkb2Vzbid0IHRocm93LCBjaGVjayB0aGUgcmVzdWx0c1xuXHRcdFx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyZXN1bHQudG9vbFJlc3VsdERldGFpbHMpLCAndG9vbFJlc3VsdERldGFpbHMgc2hvdWxkIGJlIGFuIGFycmF5Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzIGFzIFVSSVtdKS5sZW5ndGgsIDAsICdTaG91bGQgaGF2ZSBubyBzdWNjZXNzZnVsIFVSSXMnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgNCwgJ1Nob3VsZCBoYXZlIHJlc3VsdHMgZm9yIGFsbCBpbnB1dCBVUkxzJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQuY29udGVudC5ldmVyeShjb250ZW50ID0+IGNvbnRlbnQudmFsdWUgPT09ICdJbnZhbGlkIFVSTCcpLCAnQWxsIGNvbnRlbnQgc2hvdWxkIGJlIG1hcmtlZCBhcyBpbnZhbGlkJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBFeHBlY3RlZCB3aXRoIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB3aGVuIG5vIGNvbnRlbnQgaXMgY29uZmlndXJlZFxuXHRcdFx0XHRhc3NlcnQub2soZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTm8gY29udGVudCBjb25maWd1cmVkIGZvciBVUkknKSwgJ1Nob3VsZCB0aHJvdyBmb3IgdW5jb25maWd1cmVkIFVSSScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBVUkwgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCkpLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1lbXB0eScsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IFtdIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIG9uZSBjb250ZW50IGl0ZW0gZm9yIGVtcHR5IFVSTHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ05vIHZhbGlkIFVSTHMgcHJvdmlkZWQuJywgJ1Nob3VsZCBpbmRpY2F0ZSBubyB2YWxpZCBVUkxzJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC50b29sUmVzdWx0RGV0YWlscywgJ3Rvb2xSZXN1bHREZXRhaWxzIHNob3VsZCBub3QgYmUgcHJlc2VudCBmb3IgZW1wdHkgVVJMcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbWFnZSBmaWxlcyBpbiB0b29sUmVzdWx0RGV0YWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGltYWdlQnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZygnZmFrZS1wbmctZGF0YScpO1xuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9pbWFnZS5wbmcnKSwgaW1hZ2VCdWZmZXJdLFxuXHRcdFx0XHRbVVJJLnBhcnNlKCdmaWxlOi8vL2RvY3VtZW50LnR4dCcpLCAnVGV4dCBjb250ZW50J11cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1pbWFnZXMnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vaW1hZ2UucG5nJywgJ2ZpbGU6Ly8vZG9jdW1lbnQudHh0J10gfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBCb3RoIGZpbGVzIHNob3VsZCBiZSBzdWNjZXNzZnVsIGFuZCBpbiB0b29sUmVzdWx0RGV0YWlsc1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSwgJ3Rvb2xSZXN1bHREZXRhaWxzIHNob3VsZCBiZSBhbiBhcnJheScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW10pLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgc3VjY2Vzc2Z1bCBmaWxlIFVSSXMnKTtcblxuXHRcdFx0Y29uc3QgdXJpRGV0YWlscyA9IHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyBhcyBVUklbXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmlEZXRhaWxzWzBdLnRvU3RyaW5nKCksICdmaWxlOi8vL2ltYWdlLnBuZycsICdTaG91bGQgaW5jbHVkZSBpbWFnZSBmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpRGV0YWlsc1sxXS50b1N0cmluZygpLCAnZmlsZTovLy9kb2N1bWVudC50eHQnLCAnU2hvdWxkIGluY2x1ZGUgdGV4dCBmaWxlJyk7XG5cblx0XHRcdC8vIENoZWNrIGNvbnRlbnQgdHlwZXNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS5raW5kLCAnZGF0YScsICdJbWFnZSBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0ua2luZCwgJ3RleHQnLCAnVGV4dCBmaWxlIHNob3VsZCBiZSB0ZXh0IHBhcnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmZpcm1SZXN1bHRzIGlzIGZhbHNlIHdoZW4gYWxsIHdlYiBjb250ZW50cyBhcmUgZXJyb3JzIG9yIHJlZGlyZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih3ZWJDb250ZW50TWFwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZXh0cmFjdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V2ViQ29udGVudEV4dHJhY3RSZXN1bHRbXT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVyaXMubWFwKCgpID0+ICh7IHN0YXR1czogJ2Vycm9yJywgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2gnIH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oKSxcblx0XHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKSksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1jYWxsJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL2V4YW1wbGUuY29tJ10gfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpcm1SZXN1bHRzLCBmYWxzZSwgJ2NvbmZpcm1SZXN1bHRzIHNob3VsZCBiZSBmYWxzZSB3aGVuIGFsbCByZXN1bHRzIGFyZSBlcnJvcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmZpcm1SZXN1bHRzIGlzIGZhbHNlIHdoZW4gYWxsIHdlYiBjb250ZW50cyBhcmUgcmVkaXJlY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2ViQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKHdlYkNvbnRlbnRNYXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBleHRyYWN0KHVyaXM6IFVSSVtdKTogUHJvbWlzZTxXZWJDb250ZW50RXh0cmFjdFJlc3VsdFtdPiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdXJpcy5tYXAoKCkgPT4gKHsgc3RhdHVzOiAncmVkaXJlY3QnLCB0b1VSSTogVVJJLnBhcnNlKCdodHRwczovL3JlZGlyZWN0ZWQuY29tJykgfSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSgpLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29uZmlybVJlc3VsdHMsIGZhbHNlLCAnY29uZmlybVJlc3VsdHMgc2hvdWxkIGJlIGZhbHNlIHdoZW4gYWxsIHJlc3VsdHMgYXJlIHJlZGlyZWN0cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29uZmlybVJlc3VsdHMgaXMgdW5kZWZpbmVkIHdoZW4gYXQgbGVhc3Qgb25lIHdlYiBjb250ZW50IHN1Y2NlZWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2ViQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KFtcblx0XHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly9zdWNjZXNzLmNvbScpLCAnU3VjY2VzcyBjb250ZW50J11cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih3ZWJDb250ZW50TWFwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZXh0cmFjdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V2ViQ29udGVudEV4dHJhY3RSZXN1bHRbXT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdFx0eyBzdGF0dXM6ICdvaycsIHJlc3VsdDogJ1N1Y2Nlc3MgY29udGVudCcgfSxcblx0XHRcdFx0XHRcdFx0eyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiAnRmFpbGVkJyB9XG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSgpLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2h0dHBzOi8vc3VjY2Vzcy5jb20nLCAnaHR0cHM6Ly9lcnJvci5jb20nXSB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29uZmlybVJlc3VsdHMsIHVuZGVmaW5lZCwgJ2NvbmZpcm1SZXN1bHRzIHNob3VsZCBiZSB1bmRlZmluZWQgd2hlbiBhdCBsZWFzdCBvbmUgcmVzdWx0IHN1Y2NlZWRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWRpcmVjdCByZXN1bHQgcHJvdmlkZXMgY29ycmVjdCBtZXNzYWdlIHdpdGggbmV3IFVSTCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZGlyZWN0VVJJID0gVVJJLnBhcnNlKCdodHRwczovL3JlZGlyZWN0ZWQuY29tL3BhZ2UnKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBleHRyYWN0KHVyaXM6IFVSSVtdKTogUHJvbWlzZTxXZWJDb250ZW50RXh0cmFjdFJlc3VsdFtdPiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW3sgc3RhdHVzOiAncmVkaXJlY3QnLCB0b1VSSTogcmVkaXJlY3RVUkkgfV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KCksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCkpLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbCcsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRcdGlmIChyZXN1bHQuY29udGVudFswXS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKHJlZGlyZWN0VVJJLnRvU3RyaW5nKHRydWUpKSwgJ1JlZGlyZWN0IG1lc3NhZ2Ugc2hvdWxkIGluY2x1ZGUgdGFyZ2V0IFVSTCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0LmNvbnRlbnRbMF0udmFsdWUuaW5jbHVkZXMoSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQpLCAnUmVkaXJlY3QgbWVzc2FnZSBzaG91bGQgc3VnZ2VzdCB1c2luZyB0b29sIGFnYWluJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsK0NBQStDO0FBR3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CLHVCQUF1QjtBQUNwRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQ0FBNkQ7QUFDdEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSwrQkFBc0U7QUFBQSxFQUkzRSxZQUFvQixp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
