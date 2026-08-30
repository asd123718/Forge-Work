import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { isOrganizationPromptFile } from "../../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { mockService } from "./mock.js";
suite("promptsServiceUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isOrganizationPromptFile", () => {
    const CHAT_EXTENSION_ID = "github.copilot-chat";
    function createProductService(chatExtensionId) {
      return mockService({
        defaultChatAgent: chatExtensionId ? { chatExtensionId } : void 0
      });
    }
    test("returns false when no chatExtensionId is configured", () => {
      const uri = URI.file("/some/path/github/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(void 0);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when chatExtensionId is not configured"
      );
    });
    test("returns false when extension ID does not match", () => {
      const uri = URI.file("/some/path/github/prompt.md");
      const extensionId = new ExtensionIdentifier("some.other-extension");
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when extension ID does not match the built-in chat extension"
      );
    });
    test("returns false when path does not contain /github/", () => {
      const uri = URI.file("/some/path/to/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when path does not contain /github/"
      );
    });
    test("returns true when extension matches and path contains /github/", () => {
      const uri = URI.file("/some/path/github/prompts/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        true,
        "Should return true when extension matches and path contains /github/"
      );
    });
    test("extension ID comparison is case-insensitive", () => {
      const uri = URI.file("/some/github/prompt.md");
      const extensionId = new ExtensionIdentifier("GITHUB.COPILOT-CHAT");
      const productService = createProductService("github.copilot-chat");
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        true,
        "Extension ID comparison should be case-insensitive"
      );
    });
    test("returns false when defaultChatAgent exists but chatExtensionId is empty", () => {
      const uri = URI.file("/some/github/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = mockService({
        defaultChatAgent: { chatExtensionId: "" }
      });
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when chatExtensionId is empty string"
      );
    });
    test("returns false for similar but incorrect paths", () => {
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      const invalidPaths = [
        "/some/githubs/prompt.md",
        // extra 's'
        "/some/github-org/prompt.md",
        // hyphenated
        "/some/mygithub/prompt.md",
        // prefix
        "/some/githubstuff/prompt.md",
        // suffix
        "/some/GITHUB/prompt.md",
        // uppercase (path matching is case-sensitive)
        "/some/Github/prompt.md"
        // mixed case
      ];
      for (const path of invalidPaths) {
        const uri = URI.file(path);
        assert.strictEqual(
          isOrganizationPromptFile(uri, extensionId, productService),
          false,
          `Should return false for path: ${path}`
        );
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFx1dGlsc1xccHJvbXB0c1NlcnZpY2VVdGlscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRzU2VydmljZVV0aWxzLmpzJztcbmltcG9ydCB7IG1vY2tTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrLmpzJztcblxuc3VpdGUoJ3Byb21wdHNTZXJ2aWNlVXRpbHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdpc09yZ2FuaXphdGlvblByb21wdEZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgQ0hBVF9FWFRFTlNJT05fSUQgPSAnZ2l0aHViLmNvcGlsb3QtY2hhdCc7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVQcm9kdWN0U2VydmljZShjaGF0RXh0ZW5zaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElQcm9kdWN0U2VydmljZSB7XG5cdFx0XHRyZXR1cm4gbW9ja1NlcnZpY2U8SVByb2R1Y3RTZXJ2aWNlPih7XG5cdFx0XHRcdGRlZmF1bHRDaGF0QWdlbnQ6IGNoYXRFeHRlbnNpb25JZCA/IHsgY2hhdEV4dGVuc2lvbklkIH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9IGFzIFBhcnRpYWw8SVByb2R1Y3RTZXJ2aWNlPik7XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIG5vIGNoYXRFeHRlbnNpb25JZCBpcyBjb25maWd1cmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZ2l0aHViL3Byb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihDSEFUX0VYVEVOU0lPTl9JRCk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGNyZWF0ZVByb2R1Y3RTZXJ2aWNlKHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0aXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKHVyaSwgZXh0ZW5zaW9uSWQsIHByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gY2hhdEV4dGVuc2lvbklkIGlzIG5vdCBjb25maWd1cmVkJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gZXh0ZW5zaW9uIElEIGRvZXMgbm90IG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvZ2l0aHViL3Byb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignc29tZS5vdGhlci1leHRlbnNpb24nKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gY3JlYXRlUHJvZHVjdFNlcnZpY2UoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSh1cmksIGV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIGV4dGVuc2lvbiBJRCBkb2VzIG5vdCBtYXRjaCB0aGUgYnVpbHQtaW4gY2hhdCBleHRlbnNpb24nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBwYXRoIGRvZXMgbm90IGNvbnRhaW4gL2dpdGh1Yi8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC90by9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBjcmVhdGVQcm9kdWN0U2VydmljZShDSEFUX0VYVEVOU0lPTl9JRCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0aXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKHVyaSwgZXh0ZW5zaW9uSWQsIHByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gcGF0aCBkb2VzIG5vdCBjb250YWluIC9naXRodWIvJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgd2hlbiBleHRlbnNpb24gbWF0Y2hlcyBhbmQgcGF0aCBjb250YWlucyAvZ2l0aHViLycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2dpdGh1Yi9wcm9tcHRzL3Byb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihDSEFUX0VYVEVOU0lPTl9JRCk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGNyZWF0ZVByb2R1Y3RTZXJ2aWNlKENIQVRfRVhURU5TSU9OX0lEKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc09yZ2FuaXphdGlvblByb21wdEZpbGUodXJpLCBleHRlbnNpb25JZCwgcHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQnU2hvdWxkIHJldHVybiB0cnVlIHdoZW4gZXh0ZW5zaW9uIG1hdGNoZXMgYW5kIHBhdGggY29udGFpbnMgL2dpdGh1Yi8nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dGVuc2lvbiBJRCBjb21wYXJpc29uIGlzIGNhc2UtaW5zZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NvbWUvZ2l0aHViL3Byb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignR0lUSFVCLkNPUElMT1QtQ0hBVCcpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBjcmVhdGVQcm9kdWN0U2VydmljZSgnZ2l0aHViLmNvcGlsb3QtY2hhdCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSh1cmksIGV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCdFeHRlbnNpb24gSUQgY29tcGFyaXNvbiBzaG91bGQgYmUgY2FzZS1pbnNlbnNpdGl2ZScsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGRlZmF1bHRDaGF0QWdlbnQgZXhpc3RzIGJ1dCBjaGF0RXh0ZW5zaW9uSWQgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NvbWUvZ2l0aHViL3Byb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihDSEFUX0VYVEVOU0lPTl9JRCk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IG1vY2tTZXJ2aWNlPElQcm9kdWN0U2VydmljZT4oe1xuXHRcdFx0XHRkZWZhdWx0Q2hhdEFnZW50OiB7IGNoYXRFeHRlbnNpb25JZDogJycgfSxcblx0XHRcdH0gYXMgUGFydGlhbDxJUHJvZHVjdFNlcnZpY2U+KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc09yZ2FuaXphdGlvblByb21wdEZpbGUodXJpLCBleHRlbnNpb25JZCwgcHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBjaGF0RXh0ZW5zaW9uSWQgaXMgZW1wdHkgc3RyaW5nJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBzaW1pbGFyIGJ1dCBpbmNvcnJlY3QgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKENIQVRfRVhURU5TSU9OX0lEKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gY3JlYXRlUHJvZHVjdFNlcnZpY2UoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXG5cdFx0XHRjb25zdCBpbnZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdCcvc29tZS9naXRodWJzL3Byb21wdC5tZCcsICAgICAgLy8gZXh0cmEgJ3MnXG5cdFx0XHRcdCcvc29tZS9naXRodWItb3JnL3Byb21wdC5tZCcsICAgLy8gaHlwaGVuYXRlZFxuXHRcdFx0XHQnL3NvbWUvbXlnaXRodWIvcHJvbXB0Lm1kJywgICAgIC8vIHByZWZpeFxuXHRcdFx0XHQnL3NvbWUvZ2l0aHVic3R1ZmYvcHJvbXB0Lm1kJywgIC8vIHN1ZmZpeFxuXHRcdFx0XHQnL3NvbWUvR0lUSFVCL3Byb21wdC5tZCcsICAgICAgIC8vIHVwcGVyY2FzZSAocGF0aCBtYXRjaGluZyBpcyBjYXNlLXNlbnNpdGl2ZSlcblx0XHRcdFx0Jy9zb21lL0dpdGh1Yi9wcm9tcHQubWQnLCAgICAgICAvLyBtaXhlZCBjYXNlXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKHBhdGgpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0aXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKHVyaSwgZXh0ZW5zaW9uSWQsIHByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgU2hvdWxkIHJldHVybiBmYWxzZSBmb3IgcGF0aDogJHtw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
