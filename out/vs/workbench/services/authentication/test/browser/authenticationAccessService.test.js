import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { TestStorageService, TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { AuthenticationAccessService } from "../../browser/authenticationAccessService.js";
suite("AuthenticationAccessService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let storageService;
  let productService;
  let authenticationAccessService;
  setup(() => {
    instantiationService = disposables.add(new TestInstantiationService());
    storageService = disposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    productService = { ...TestProductService, trustedExtensionAuthAccess: void 0 };
    instantiationService.stub(IProductService, productService);
    authenticationAccessService = disposables.add(instantiationService.createInstance(AuthenticationAccessService));
  });
  teardown(() => {
    if (productService) {
      productService.trustedExtensionAuthAccess = void 0;
    }
  });
  suite("isAccessAllowed", () => {
    test("returns undefined for unknown extension with no product configuration", () => {
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "unknown-extension");
      assert.strictEqual(result, void 0);
    });
    test("returns true for trusted extension from product.json (array format)", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension-1", "trusted-extension-2"];
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "trusted-extension-1");
      assert.strictEqual(result, true);
    });
    test("returns true for trusted extension from product.json (object format)", () => {
      productService.trustedExtensionAuthAccess = {
        "github": ["github-extension"],
        "microsoft": ["microsoft-extension"]
      };
      const result1 = authenticationAccessService.isAccessAllowed("github", "user@example.com", "github-extension");
      assert.strictEqual(result1, true);
      const result2 = authenticationAccessService.isAccessAllowed("microsoft", "user@microsoft.com", "microsoft-extension");
      assert.strictEqual(result2, true);
    });
    test("returns undefined for extension not in trusted list", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension"];
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "untrusted-extension");
      assert.strictEqual(result, void 0);
    });
    test("returns stored allowed state when extension is in storage", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [{
        id: "stored-extension",
        name: "Stored Extension",
        allowed: false
      }]);
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "stored-extension");
      assert.strictEqual(result, false);
    });
    test("returns true for extension in storage with allowed=true", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [{
        id: "allowed-extension",
        name: "Allowed Extension",
        allowed: true
      }]);
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "allowed-extension");
      assert.strictEqual(result, true);
    });
    test("returns true for extension in storage with undefined allowed property (legacy behavior)", () => {
      const legacyExtension = {
        id: "legacy-extension",
        name: "Legacy Extension"
        // allowed property is undefined
      };
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [legacyExtension]);
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "legacy-extension");
      assert.strictEqual(result, true);
    });
    test("product.json trusted extensions take precedence over storage", () => {
      productService.trustedExtensionAuthAccess = ["product-trusted-extension"];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [{
        id: "product-trusted-extension",
        name: "Product Trusted Extension",
        allowed: false
      }]);
      const result = authenticationAccessService.isAccessAllowed("github", "user@example.com", "product-trusted-extension");
      assert.strictEqual(result, true);
    });
  });
  suite("readAllowedExtensions", () => {
    test("returns empty array when no data exists", () => {
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
    test("returns stored extensions", () => {
      const extensions = [
        { id: "extension1", name: "Extension 1", allowed: true },
        { id: "extension2", name: "Extension 2", allowed: false }
      ];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", extensions);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, "extension1");
      assert.strictEqual(result[0].allowed, true);
      assert.strictEqual(result[1].id, "extension2");
      assert.strictEqual(result[1].allowed, false);
    });
    test("includes trusted extensions from product.json (array format)", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension-1", "trusted-extension-2"];
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const trustedExtension1 = result.find((e) => e.id === "trusted-extension-1");
      assert.ok(trustedExtension1);
      assert.strictEqual(trustedExtension1.allowed, true);
      assert.strictEqual(trustedExtension1.trusted, true);
      assert.strictEqual(trustedExtension1.name, "trusted-extension-1");
      const trustedExtension2 = result.find((e) => e.id === "trusted-extension-2");
      assert.ok(trustedExtension2);
      assert.strictEqual(trustedExtension2.allowed, true);
      assert.strictEqual(trustedExtension2.trusted, true);
    });
    test("includes trusted extensions from product.json (object format)", () => {
      productService.trustedExtensionAuthAccess = {
        "github": ["github-extension"],
        "microsoft": ["microsoft-extension"]
      };
      const githubResult = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(githubResult.length, 1);
      assert.strictEqual(githubResult[0].id, "github-extension");
      assert.strictEqual(githubResult[0].trusted, true);
      const microsoftResult = authenticationAccessService.readAllowedExtensions("microsoft", "user@microsoft.com");
      assert.strictEqual(microsoftResult.length, 1);
      assert.strictEqual(microsoftResult[0].id, "microsoft-extension");
      assert.strictEqual(microsoftResult[0].trusted, true);
      const unknownResult = authenticationAccessService.readAllowedExtensions("unknown", "user@unknown.com");
      assert.strictEqual(unknownResult.length, 0);
    });
    test("merges stored extensions with trusted extensions from product.json", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension"];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "stored-extension", name: "Stored Extension", allowed: false }
      ]);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const trustedExtension = result.find((e) => e.id === "trusted-extension");
      assert.ok(trustedExtension);
      assert.strictEqual(trustedExtension.trusted, true);
      assert.strictEqual(trustedExtension.allowed, true);
      const storedExtension = result.find((e) => e.id === "stored-extension");
      assert.ok(storedExtension);
      assert.strictEqual(storedExtension.trusted, void 0);
      assert.strictEqual(storedExtension.allowed, false);
    });
    test("updates existing stored extension to trusted when found in product.json", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: false }
      ]);
      productService.trustedExtensionAuthAccess = ["extension1"];
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "extension1");
      assert.strictEqual(result[0].trusted, true);
      assert.strictEqual(result[0].allowed, true);
    });
    test("handles malformed storage data gracefully", () => {
      storageService.store("github-user@example.com", "invalid-json", StorageScope.APPLICATION, StorageTarget.USER);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
  });
  suite("updateAllowedExtensions", () => {
    test("adds new extensions to storage", () => {
      const extensions = [
        { id: "extension1", name: "Extension 1", allowed: true },
        { id: "extension2", name: "Extension 2", allowed: false }
      ];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", extensions);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, "extension1");
      assert.strictEqual(result[1].id, "extension2");
    });
    test("updates existing extension allowed status", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: true }
      ]);
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: false }
      ]);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].allowed, false);
    });
    test("updates existing extension name when new name is provided", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "extension1", allowed: true }
      ]);
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "My Extension", allowed: true }
      ]);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "My Extension");
    });
    test("does not update name when new name is same as ID", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "My Extension", allowed: true }
      ]);
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "extension1", allowed: false }
      ]);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "My Extension");
      assert.strictEqual(result[0].allowed, false);
    });
    test("does not store trusted extensions - they should only come from product.json", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension"];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "regular-extension", name: "Regular Extension", allowed: true },
        { id: "trusted-extension", name: "Trusted Extension", allowed: false }
      ]);
      const storedData = storageService.get("github-user@example.com", StorageScope.APPLICATION);
      assert.ok(storedData);
      const parsedData = JSON.parse(storedData);
      assert.strictEqual(parsedData.length, 1);
      assert.strictEqual(parsedData[0].id, "regular-extension");
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const trustedExt = result.find((e) => e.id === "trusted-extension");
      assert.ok(trustedExt);
      assert.strictEqual(trustedExt.trusted, true);
      assert.strictEqual(trustedExt.allowed, true);
      const regularExt = result.find((e) => e.id === "regular-extension");
      assert.ok(regularExt);
      assert.strictEqual(regularExt.trusted, void 0);
      assert.strictEqual(regularExt.allowed, true);
    });
    test("filters out trusted extensions before storing", () => {
      productService.trustedExtensionAuthAccess = ["trusted-ext-1", "trusted-ext-2"];
      const extensions = [
        { id: "regular-ext", name: "Regular Extension", allowed: true },
        { id: "trusted-ext-1", name: "Trusted Extension 1", allowed: false },
        { id: "another-regular-ext", name: "Another Regular Extension", allowed: false },
        { id: "trusted-ext-2", name: "Trusted Extension 2", allowed: true }
      ];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", extensions);
      const storedData = storageService.get("github-user@example.com", StorageScope.APPLICATION);
      assert.ok(storedData);
      const parsedData = JSON.parse(storedData);
      assert.strictEqual(parsedData.length, 2);
      assert.ok(parsedData.find((e) => e.id === "regular-ext"));
      assert.ok(parsedData.find((e) => e.id === "another-regular-ext"));
      assert.ok(!parsedData.find((e) => e.id === "trusted-ext-1"));
      assert.ok(!parsedData.find((e) => e.id === "trusted-ext-2"));
    });
    test("fires onDidChangeExtensionSessionAccess event", () => {
      let eventFired = false;
      let eventData;
      const subscription = authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
        eventFired = true;
        eventData = e;
      });
      disposables.add(subscription);
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: true }
      ]);
      assert.strictEqual(eventFired, true);
      assert.ok(eventData);
      assert.strictEqual(eventData.providerId, "github");
      assert.strictEqual(eventData.accountName, "user@example.com");
    });
  });
  suite("removeAllowedExtensions", () => {
    test("removes all extensions from storage", () => {
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: true },
        { id: "extension2", name: "Extension 2", allowed: false }
      ]);
      const result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.ok(result.length > 0);
      authenticationAccessService.removeAllowedExtensions("github", "user@example.com");
      const storedData = storageService.get("github-user@example.com", StorageScope.APPLICATION);
      assert.strictEqual(storedData, void 0);
    });
    test("fires onDidChangeExtensionSessionAccess event", () => {
      let eventFired = false;
      let eventData;
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "extension1", name: "Extension 1", allowed: true }
      ]);
      const subscription = authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
        eventFired = true;
        eventData = e;
      });
      disposables.add(subscription);
      authenticationAccessService.removeAllowedExtensions("github", "user@example.com");
      assert.strictEqual(eventFired, true);
      assert.ok(eventData);
      assert.strictEqual(eventData.providerId, "github");
      assert.strictEqual(eventData.accountName, "user@example.com");
    });
    test("does not affect trusted extensions from product.json", () => {
      productService.trustedExtensionAuthAccess = ["trusted-extension"];
      authenticationAccessService.updateAllowedExtensions("github", "user@example.com", [
        { id: "regular-extension", name: "Regular Extension", allowed: true }
      ]);
      let result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      authenticationAccessService.removeAllowedExtensions("github", "user@example.com");
      result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "trusted-extension");
      assert.strictEqual(result[0].trusted, true);
    });
  });
  suite("integration with product.json configurations", () => {
    test("handles switching between array and object format", () => {
      productService.trustedExtensionAuthAccess = ["ext1", "ext2"];
      let result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      productService.trustedExtensionAuthAccess = {
        "github": ["ext1", "ext3"],
        "microsoft": ["ext4"]
      };
      result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      assert.ok(result.find((e) => e.id === "ext1"));
      assert.ok(result.find((e) => e.id === "ext3"));
      assert.ok(!result.find((e) => e.id === "ext2"));
    });
    test("handles empty trusted extension configurations", () => {
      productService.trustedExtensionAuthAccess = void 0;
      let result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 0);
      productService.trustedExtensionAuthAccess = [];
      result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 0);
      productService.trustedExtensionAuthAccess = {};
      result = authenticationAccessService.readAllowedExtensions("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcdGVzdFxcYnJvd3NlclxcYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UsIElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBbGxvd2VkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcblxuc3VpdGUoJ0F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBUZXN0U3RvcmFnZVNlcnZpY2U7XG5cdGxldCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlICYgeyB0cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2Vzcz86IHN0cmluZ1tdIHwgUmVjb3JkPHN0cmluZywgc3RyaW5nW10+IH07XG5cdGxldCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHQvLyBTZXQgdXAgc3RvcmFnZSBzZXJ2aWNlXG5cdFx0c3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Ly8gU2V0IHVwIHByb2R1Y3Qgc2VydmljZSB3aXRoIG5vIHRydXN0ZWQgZXh0ZW5zaW9ucyBieSBkZWZhdWx0XG5cdFx0cHJvZHVjdFNlcnZpY2UgPSB7IC4uLlRlc3RQcm9kdWN0U2VydmljZSwgdHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3M6IHVuZGVmaW5lZCB9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHNlcnZpY2UgaW5zdGFuY2Vcblx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHQvLyBSZXNldCBwcm9kdWN0IHNlcnZpY2UgY29uZmlndXJhdGlvbiB0byBwcmV2ZW50IHRlc3QgaW50ZXJmZXJlbmNlXG5cdFx0aWYgKHByb2R1Y3RTZXJ2aWNlKSB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXG5cdHN1aXRlKCdpc0FjY2Vzc0FsbG93ZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gZXh0ZW5zaW9uIHdpdGggbm8gcHJvZHVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAndW5rbm93bi1leHRlbnNpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHRydXN0ZWQgZXh0ZW5zaW9uIGZyb20gcHJvZHVjdC5qc29uIChhcnJheSBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSBbJ3RydXN0ZWQtZXh0ZW5zaW9uLTEnLCAndHJ1c3RlZC1leHRlbnNpb24tMiddO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICd0cnVzdGVkLWV4dGVuc2lvbi0xJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgdHJ1c3RlZCBleHRlbnNpb24gZnJvbSBwcm9kdWN0Lmpzb24gKG9iamVjdCBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSB7XG5cdFx0XHRcdCdnaXRodWInOiBbJ2dpdGh1Yi1leHRlbnNpb24nXSxcblx0XHRcdFx0J21pY3Jvc29mdCc6IFsnbWljcm9zb2Z0LWV4dGVuc2lvbiddXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnZ2l0aHViLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEsIHRydWUpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnbWljcm9zb2Z0JywgJ3VzZXJAbWljcm9zb2Z0LmNvbScsICdtaWNyb3NvZnQtZXh0ZW5zaW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MiwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZXh0ZW5zaW9uIG5vdCBpbiB0cnVzdGVkIGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyA9IFsndHJ1c3RlZC1leHRlbnNpb24nXTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAndW50cnVzdGVkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgc3RvcmVkIGFsbG93ZWQgc3RhdGUgd2hlbiBleHRlbnNpb24gaXMgaW4gc3RvcmFnZScsICgpID0+IHtcblx0XHRcdC8vIEFkZCBleHRlbnNpb24gdG8gc3RvcmFnZVxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFt7XG5cdFx0XHRcdGlkOiAnc3RvcmVkLWV4dGVuc2lvbicsXG5cdFx0XHRcdG5hbWU6ICdTdG9yZWQgRXh0ZW5zaW9uJyxcblx0XHRcdFx0YWxsb3dlZDogZmFsc2Vcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnc3RvcmVkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBleHRlbnNpb24gaW4gc3RvcmFnZSB3aXRoIGFsbG93ZWQ9dHJ1ZScsICgpID0+IHtcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbe1xuXHRcdFx0XHRpZDogJ2FsbG93ZWQtZXh0ZW5zaW9uJyxcblx0XHRcdFx0bmFtZTogJ0FsbG93ZWQgRXh0ZW5zaW9uJyxcblx0XHRcdFx0YWxsb3dlZDogdHJ1ZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICdhbGxvd2VkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGV4dGVuc2lvbiBpbiBzdG9yYWdlIHdpdGggdW5kZWZpbmVkIGFsbG93ZWQgcHJvcGVydHkgKGxlZ2FjeSBiZWhhdmlvciknLCAoKSA9PiB7XG5cdFx0XHQvLyBTaW11bGF0ZSBsZWdhY3kgZGF0YSB3aGVyZSBhbGxvd2VkIHByb3BlcnR5IGRpZG4ndCBleGlzdFxuXHRcdFx0Y29uc3QgbGVnYWN5RXh0ZW5zaW9uOiBBbGxvd2VkRXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZDogJ2xlZ2FjeS1leHRlbnNpb24nLFxuXHRcdFx0XHRuYW1lOiAnTGVnYWN5IEV4dGVuc2lvbidcblx0XHRcdFx0Ly8gYWxsb3dlZCBwcm9wZXJ0eSBpcyB1bmRlZmluZWRcblx0XHRcdH07XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbbGVnYWN5RXh0ZW5zaW9uXSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ2xlZ2FjeS1leHRlbnNpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjdC5qc29uIHRydXN0ZWQgZXh0ZW5zaW9ucyB0YWtlIHByZWNlZGVuY2Ugb3ZlciBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSBbJ3Byb2R1Y3QtdHJ1c3RlZC1leHRlbnNpb24nXTtcblxuXHRcdFx0Ly8gVHJ5IHRvIHN0b3JlIHRoZSBzYW1lIGV4dGVuc2lvbiBhcyBub3QgYWxsb3dlZFxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFt7XG5cdFx0XHRcdGlkOiAncHJvZHVjdC10cnVzdGVkLWV4dGVuc2lvbicsXG5cdFx0XHRcdG5hbWU6ICdQcm9kdWN0IFRydXN0ZWQgRXh0ZW5zaW9uJyxcblx0XHRcdFx0YWxsb3dlZDogZmFsc2Vcblx0XHRcdH1dKTtcblxuXHRcdFx0Ly8gUHJvZHVjdC5qc29uIHNob3VsZCB0YWtlIHByZWNlZGVuY2Vcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ3Byb2R1Y3QtdHJ1c3RlZC1leHRlbnNpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVhZEFsbG93ZWRFeHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBubyBkYXRhIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHN0b3JlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uczogQWxsb3dlZEV4dGVuc2lvbltdID0gW1xuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMScsIG5hbWU6ICdFeHRlbnNpb24gMScsIGFsbG93ZWQ6IHRydWUgfSxcblx0XHRcdFx0eyBpZDogJ2V4dGVuc2lvbjInLCBuYW1lOiAnRXh0ZW5zaW9uIDInLCBhbGxvd2VkOiBmYWxzZSB9XG5cdFx0XHRdO1xuXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgZXh0ZW5zaW9ucyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlkLCAnZXh0ZW5zaW9uMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5hbGxvd2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uaWQsICdleHRlbnNpb24yJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmFsbG93ZWQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHRydXN0ZWQgZXh0ZW5zaW9ucyBmcm9tIHByb2R1Y3QuanNvbiAoYXJyYXkgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzID0gWyd0cnVzdGVkLWV4dGVuc2lvbi0xJywgJ3RydXN0ZWQtZXh0ZW5zaW9uLTInXTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3QgdHJ1c3RlZEV4dGVuc2lvbjEgPSByZXN1bHQuZmluZChlID0+IGUuaWQgPT09ICd0cnVzdGVkLWV4dGVuc2lvbi0xJyk7XG5cdFx0XHRhc3NlcnQub2sodHJ1c3RlZEV4dGVuc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRFeHRlbnNpb24xLmFsbG93ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRFeHRlbnNpb24xLnRydXN0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRFeHRlbnNpb24xLm5hbWUsICd0cnVzdGVkLWV4dGVuc2lvbi0xJyk7IC8vIFNob3VsZCBkZWZhdWx0IHRvIElEXG5cblx0XHRcdGNvbnN0IHRydXN0ZWRFeHRlbnNpb24yID0gcmVzdWx0LmZpbmQoZSA9PiBlLmlkID09PSAndHJ1c3RlZC1leHRlbnNpb24tMicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRydXN0ZWRFeHRlbnNpb24yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkRXh0ZW5zaW9uMi5hbGxvd2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkRXh0ZW5zaW9uMi50cnVzdGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHRydXN0ZWQgZXh0ZW5zaW9ucyBmcm9tIHByb2R1Y3QuanNvbiAob2JqZWN0IGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyA9IHtcblx0XHRcdFx0J2dpdGh1Yic6IFsnZ2l0aHViLWV4dGVuc2lvbiddLFxuXHRcdFx0XHQnbWljcm9zb2Z0JzogWydtaWNyb3NvZnQtZXh0ZW5zaW9uJ11cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGdpdGh1YlJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0aHViUmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0aHViUmVzdWx0WzBdLmlkLCAnZ2l0aHViLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdGh1YlJlc3VsdFswXS50cnVzdGVkLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgbWljcm9zb2Z0UmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygnbWljcm9zb2Z0JywgJ3VzZXJAbWljcm9zb2Z0LmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pY3Jvc29mdFJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pY3Jvc29mdFJlc3VsdFswXS5pZCwgJ21pY3Jvc29mdC1leHRlbnNpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWNyb3NvZnRSZXN1bHRbMF0udHJ1c3RlZCwgdHJ1ZSk7XG5cblx0XHRcdC8vIFByb3ZpZGVyIG5vdCBpbiB0cnVzdGVkIGxpc3Qgc2hvdWxkIHJldHVybiBlbXB0eSAobm8gc3RvcmVkIGV4dGVuc2lvbnMpXG5cdFx0XHRjb25zdCB1bmtub3duUmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygndW5rbm93bicsICd1c2VyQHVua25vd24uY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5rbm93blJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2VzIHN0b3JlZCBleHRlbnNpb25zIHdpdGggdHJ1c3RlZCBleHRlbnNpb25zIGZyb20gcHJvZHVjdC5qc29uJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSBbJ3RydXN0ZWQtZXh0ZW5zaW9uJ107XG5cblx0XHRcdC8vIEFkZCBzb21lIHN0b3JlZCBleHRlbnNpb25zXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc3RvcmVkLWV4dGVuc2lvbicsIG5hbWU6ICdTdG9yZWQgRXh0ZW5zaW9uJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cblx0XHRcdGNvbnN0IHRydXN0ZWRFeHRlbnNpb24gPSByZXN1bHQuZmluZChlID0+IGUuaWQgPT09ICd0cnVzdGVkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRydXN0ZWRFeHRlbnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRFeHRlbnNpb24udHJ1c3RlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RlZEV4dGVuc2lvbi5hbGxvd2VkLCB0cnVlKTtcblxuXHRcdFx0Y29uc3Qgc3RvcmVkRXh0ZW5zaW9uID0gcmVzdWx0LmZpbmQoZSA9PiBlLmlkID09PSAnc3RvcmVkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0b3JlZEV4dGVuc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmVkRXh0ZW5zaW9uLnRydXN0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmVkRXh0ZW5zaW9uLmFsbG93ZWQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZXMgZXhpc3Rpbmcgc3RvcmVkIGV4dGVuc2lvbiB0byB0cnVzdGVkIHdoZW4gZm91bmQgaW4gcHJvZHVjdC5qc29uJywgKCkgPT4ge1xuXHRcdFx0Ly8gRmlyc3QgYWRkIGFuIGV4dGVuc2lvbiB0byBzdG9yYWdlXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMScsIG5hbWU6ICdFeHRlbnNpb24gMScsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBUaGVuIGFkZCBpdCB0byB0cnVzdGVkIGxpc3Rcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzID0gWydleHRlbnNpb24xJ107XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlkLCAnZXh0ZW5zaW9uMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS50cnVzdGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uYWxsb3dlZCwgdHJ1ZSk7IC8vIFNob3VsZCBiZSBtYXJrZWQgYXMgYWxsb3dlZCBkdWUgdG8gYmVpbmcgdHJ1c3RlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtYWxmb3JtZWQgc3RvcmFnZSBkYXRhIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHQvLyBEaXJlY3RseSBzdG9yZSBtYWxmb3JtZWQgZGF0YSBpbiBzdG9yYWdlXG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZ2l0aHViLXVzZXJAZXhhbXBsZS5jb20nLCAnaW52YWxpZC1qc29uJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApOyAvLyBTaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IGluc3RlYWQgb2YgdGhyb3dpbmdcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VwZGF0ZUFsbG93ZWRFeHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FkZHMgbmV3IGV4dGVuc2lvbnMgdG8gc3RvcmFnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnM6IEFsbG93ZWRFeHRlbnNpb25bXSA9IFtcblx0XHRcdFx0eyBpZDogJ2V4dGVuc2lvbjEnLCBuYW1lOiAnRXh0ZW5zaW9uIDEnLCBhbGxvd2VkOiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICdleHRlbnNpb24yJywgbmFtZTogJ0V4dGVuc2lvbiAyJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XTtcblxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIGV4dGVuc2lvbnMpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pZCwgJ2V4dGVuc2lvbjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uaWQsICdleHRlbnNpb24yJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGV4aXN0aW5nIGV4dGVuc2lvbiBhbGxvd2VkIHN0YXR1cycsICgpID0+IHtcblx0XHRcdC8vIEZpcnN0IGFkZCBhbiBleHRlbnNpb25cblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdleHRlbnNpb24xJywgbmFtZTogJ0V4dGVuc2lvbiAxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiB1cGRhdGUgaXRzIGFsbG93ZWQgc3RhdHVzXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMScsIG5hbWU6ICdFeHRlbnNpb24gMScsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5hbGxvd2VkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGV4aXN0aW5nIGV4dGVuc2lvbiBuYW1lIHdoZW4gbmV3IG5hbWUgaXMgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCBhZGQgYW4gZXh0ZW5zaW9uIHdpdGggZGVmYXVsdCBuYW1lXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMScsIG5hbWU6ICdleHRlbnNpb24xJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiB1cGRhdGUgd2l0aCBhIHByb3BlciBuYW1lXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMScsIG5hbWU6ICdNeSBFeHRlbnNpb24nLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLCAnTXkgRXh0ZW5zaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB1cGRhdGUgbmFtZSB3aGVuIG5ldyBuYW1lIGlzIHNhbWUgYXMgSUQnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCBhZGQgYW4gZXh0ZW5zaW9uIHdpdGggYSBwcm9wZXIgbmFtZVxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ2V4dGVuc2lvbjEnLCBuYW1lOiAnTXkgRXh0ZW5zaW9uJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiB0cnkgdG8gdXBkYXRlIHdpdGggSUQgYXMgbmFtZSAoc2hvdWxkIGtlZXAgZXhpc3RpbmcgbmFtZSlcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdleHRlbnNpb24xJywgbmFtZTogJ2V4dGVuc2lvbjEnLCBhbGxvd2VkOiBmYWxzZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ015IEV4dGVuc2lvbicpOyAvLyBTaG91bGQga2VlcCB0aGUgb3JpZ2luYWwgbmFtZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5hbGxvd2VkLCBmYWxzZSk7IC8vIEJ1dCB1cGRhdGUgdGhlIGFsbG93ZWQgc3RhdHVzXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdG9yZSB0cnVzdGVkIGV4dGVuc2lvbnMgLSB0aGV5IHNob3VsZCBvbmx5IGNvbWUgZnJvbSBwcm9kdWN0Lmpzb24nLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyA9IFsndHJ1c3RlZC1leHRlbnNpb24nXTtcblxuXHRcdFx0Ly8gVHJ5IHRvIHN0b3JlIGEgdHJ1c3RlZCBleHRlbnNpb24gYWxvbmcgd2l0aCByZWd1bGFyIGV4dGVuc2lvbnNcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdyZWd1bGFyLWV4dGVuc2lvbicsIG5hbWU6ICdSZWd1bGFyIEV4dGVuc2lvbicsIGFsbG93ZWQ6IHRydWUgfSxcblx0XHRcdFx0eyBpZDogJ3RydXN0ZWQtZXh0ZW5zaW9uJywgbmFtZTogJ1RydXN0ZWQgRXh0ZW5zaW9uJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIENoZWNrIHdoYXQncyBhY3R1YWxseSBzdG9yZWQgaW4gc3RvcmFnZSAoc2hvdWxkIG9ubHkgYmUgdGhlIHJlZ3VsYXIgZXh0ZW5zaW9uKVxuXHRcdFx0Y29uc3Qgc3RvcmVkRGF0YSA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgnZ2l0aHViLXVzZXJAZXhhbXBsZS5jb20nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0b3JlZERhdGEpO1xuXHRcdFx0Y29uc3QgcGFyc2VkRGF0YSA9IEpTT04ucGFyc2Uoc3RvcmVkRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkRGF0YS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZERhdGFbMF0uaWQsICdyZWd1bGFyLWV4dGVuc2lvbicpO1xuXG5cdFx0XHQvLyBCdXQgd2hlbiB3ZSByZWFkLCB3ZSBzaG91bGQgZ2V0IGJvdGggKHRydXN0ZWQgZnJvbSBwcm9kdWN0Lmpzb24gKyBzdG9yZWQpXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXG5cdFx0XHRjb25zdCB0cnVzdGVkRXh0ID0gcmVzdWx0LmZpbmQoZSA9PiBlLmlkID09PSAndHJ1c3RlZC1leHRlbnNpb24nKTtcblx0XHRcdGFzc2VydC5vayh0cnVzdGVkRXh0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkRXh0LnRydXN0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRFeHQuYWxsb3dlZCwgdHJ1ZSk7IC8vIFNob3VsZCBiZSB0cnVlIGZyb20gcHJvZHVjdC5qc29uLCBub3QgZmFsc2UgZnJvbSBzdG9yYWdlXG5cblx0XHRcdGNvbnN0IHJlZ3VsYXJFeHQgPSByZXN1bHQuZmluZChlID0+IGUuaWQgPT09ICdyZWd1bGFyLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZ3VsYXJFeHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ3VsYXJFeHQudHJ1c3RlZCwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWd1bGFyRXh0LmFsbG93ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBvdXQgdHJ1c3RlZCBleHRlbnNpb25zIGJlZm9yZSBzdG9yaW5nJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSBbJ3RydXN0ZWQtZXh0LTEnLCAndHJ1c3RlZC1leHQtMiddO1xuXG5cdFx0XHQvLyBBZGQgYm90aCB0cnVzdGVkIGFuZCByZWd1bGFyIGV4dGVuc2lvbnNcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnM6IEFsbG93ZWRFeHRlbnNpb25bXSA9IFtcblx0XHRcdFx0eyBpZDogJ3JlZ3VsYXItZXh0JywgbmFtZTogJ1JlZ3VsYXIgRXh0ZW5zaW9uJywgYWxsb3dlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkOiAndHJ1c3RlZC1leHQtMScsIG5hbWU6ICdUcnVzdGVkIEV4dGVuc2lvbiAxJywgYWxsb3dlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBpZDogJ2Fub3RoZXItcmVndWxhci1leHQnLCBuYW1lOiAnQW5vdGhlciBSZWd1bGFyIEV4dGVuc2lvbicsIGFsbG93ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsgaWQ6ICd0cnVzdGVkLWV4dC0yJywgbmFtZTogJ1RydXN0ZWQgRXh0ZW5zaW9uIDInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF07XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBleHRlbnNpb25zKTtcblxuXHRcdFx0Ly8gQ2hlY2sgc3RvcmFnZSAtIHNob3VsZCBvbmx5IGNvbnRhaW4gcmVndWxhciBleHRlbnNpb25zXG5cdFx0XHRjb25zdCBzdG9yZWREYXRhID0gc3RvcmFnZVNlcnZpY2UuZ2V0KCdnaXRodWItdXNlckBleGFtcGxlLmNvbScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRhc3NlcnQub2soc3RvcmVkRGF0YSk7XG5cdFx0XHRjb25zdCBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShzdG9yZWREYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWREYXRhLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2socGFyc2VkRGF0YS5maW5kKChlOiBBbGxvd2VkRXh0ZW5zaW9uKSA9PiBlLmlkID09PSAncmVndWxhci1leHQnKSk7XG5cdFx0XHRhc3NlcnQub2socGFyc2VkRGF0YS5maW5kKChlOiBBbGxvd2VkRXh0ZW5zaW9uKSA9PiBlLmlkID09PSAnYW5vdGhlci1yZWd1bGFyLWV4dCcpKTtcblx0XHRcdGFzc2VydC5vayghcGFyc2VkRGF0YS5maW5kKChlOiBBbGxvd2VkRXh0ZW5zaW9uKSA9PiBlLmlkID09PSAndHJ1c3RlZC1leHQtMScpKTtcblx0XHRcdGFzc2VydC5vayghcGFyc2VkRGF0YS5maW5kKChlOiBBbGxvd2VkRXh0ZW5zaW9uKSA9PiBlLmlkID09PSAndHJ1c3RlZC1leHQtMicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlRXh0ZW5zaW9uU2Vzc2lvbkFjY2VzcyBldmVudCcsICgpID0+IHtcblx0XHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0XHRsZXQgZXZlbnREYXRhOiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgYWNjb3VudE5hbWU6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25TZXNzaW9uQWNjZXNzKGUgPT4ge1xuXHRcdFx0XHRldmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0ZXZlbnREYXRhID0gZTtcblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN1YnNjcmlwdGlvbik7XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdleHRlbnNpb24xJywgbmFtZTogJ0V4dGVuc2lvbiAxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50RGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnREYXRhLnByb3ZpZGVySWQsICdnaXRodWInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudERhdGEuYWNjb3VudE5hbWUsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW1vdmVBbGxvd2VkRXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdyZW1vdmVzIGFsbCBleHRlbnNpb25zIGZyb20gc3RvcmFnZScsICgpID0+IHtcblx0XHRcdC8vIEZpcnN0IGFkZCBzb21lIGV4dGVuc2lvbnNcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdleHRlbnNpb24xJywgbmFtZTogJ0V4dGVuc2lvbiAxJywgYWxsb3dlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkOiAnZXh0ZW5zaW9uMicsIG5hbWU6ICdFeHRlbnNpb24gMicsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhleSBleGlzdFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubGVuZ3RoID4gMCk7XG5cblx0XHRcdC8vIFJlbW92ZSB0aGVtXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBzdG9yYWdlIGlzIGVtcHR5IChidXQgdHJ1c3RlZCBleHRlbnNpb25zIGZyb20gcHJvZHVjdC5qc29uIG1pZ2h0IHN0aWxsIGJlIHRoZXJlKVxuXHRcdFx0Y29uc3Qgc3RvcmVkRGF0YSA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgnZ2l0aHViLXVzZXJAZXhhbXBsZS5jb20nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZERhdGEsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUV4dGVuc2lvblNlc3Npb25BY2Nlc3MgZXZlbnQnLCAoKSA9PiB7XG5cdFx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGV2ZW50RGF0YTogeyBwcm92aWRlcklkOiBzdHJpbmc7IGFjY291bnROYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRmlyc3QgYWRkIGFuIGV4dGVuc2lvblxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ2V4dGVuc2lvbjEnLCBuYW1lOiAnRXh0ZW5zaW9uIDEnLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBUaGVuIGxpc3RlbiBmb3IgdGhlIHJlbW92ZSBldmVudFxuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uU2Vzc2lvbkFjY2VzcyhlID0+IHtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdGV2ZW50RGF0YSA9IGU7XG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24pO1xuXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhldmVudERhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RGF0YS5wcm92aWRlcklkLCAnZ2l0aHViJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnREYXRhLmFjY291bnROYW1lLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgYWZmZWN0IHRydXN0ZWQgZXh0ZW5zaW9ucyBmcm9tIHByb2R1Y3QuanNvbicsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzID0gWyd0cnVzdGVkLWV4dGVuc2lvbiddO1xuXG5cdFx0XHQvLyBBZGQgc29tZSByZWd1bGFyIGV4dGVuc2lvbnMgYW5kIHZlcmlmeSBib3RoIHRydXN0ZWQgYW5kIHJlZ3VsYXIgZXhpc3Rcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdyZWd1bGFyLWV4dGVuc2lvbicsIG5hbWU6ICdSZWd1bGFyIEV4dGVuc2lvbicsIGFsbG93ZWQ6IHRydWUgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGxldCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpOyAvLyAxIHRydXN0ZWQgKyAxIHJlZ3VsYXJcblxuXHRcdFx0Ly8gUmVtb3ZlIHN0b3JlZCBleHRlbnNpb25zXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cblx0XHRcdC8vIFRydXN0ZWQgZXh0ZW5zaW9uIHNob3VsZCBzdGlsbCBiZSB0aGVyZVxuXHRcdFx0cmVzdWx0ID0gYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaWQsICd0cnVzdGVkLWV4dGVuc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS50cnVzdGVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludGVncmF0aW9uIHdpdGggcHJvZHVjdC5qc29uIGNvbmZpZ3VyYXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2hhbmRsZXMgc3dpdGNoaW5nIGJldHdlZW4gYXJyYXkgYW5kIG9iamVjdCBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBTdGFydCB3aXRoIGFycmF5IGZvcm1hdFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSBbJ2V4dDEnLCAnZXh0MiddO1xuXHRcdFx0bGV0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFN3aXRjaCB0byBvYmplY3QgZm9ybWF0XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyA9IHtcblx0XHRcdFx0J2dpdGh1Yic6IFsnZXh0MScsICdleHQzJ10sXG5cdFx0XHRcdCdtaWNyb3NvZnQnOiBbJ2V4dDQnXVxuXHRcdFx0fTtcblx0XHRcdHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7IC8vIGV4dDEgYW5kIGV4dDMgZm9yIGdpdGh1YlxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5maW5kKGUgPT4gZS5pZCA9PT0gJ2V4dDEnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmZpbmQoZSA9PiBlLmlkID09PSAnZXh0MycpKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0LmZpbmQoZSA9PiBlLmlkID09PSAnZXh0MicpKTsgLy8gU2hvdWxkIG5vdCBiZSB0aGVyZSBhbnltb3JlXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IHRydXN0ZWQgZXh0ZW5zaW9uIGNvbmZpZ3VyYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB1bmRlZmluZWRcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cblx0XHRcdC8vIFRlc3QgZW1wdHkgYXJyYXlcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzID0gW107XG5cdFx0XHRyZXN1bHQgPSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXG5cdFx0XHQvLyBUZXN0IGVtcHR5IG9iamVjdFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvbkF1dGhBY2Nlc3MgPSB7fTtcblx0XHRcdHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0IsMEJBQTBCO0FBQ3ZELFNBQVMsbUNBQWlFO0FBRzFFLE1BQU0sK0JBQStCLE1BQU07QUFDMUMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsMkJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBR3JFLHFCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUN6RCx5QkFBcUIsS0FBSyxpQkFBaUIsY0FBYztBQUd6RCxxQkFBaUIsRUFBRSxHQUFHLG9CQUFvQiw0QkFBNEIsT0FBVTtBQUNoRix5QkFBcUIsS0FBSyxpQkFBaUIsY0FBYztBQUd6RCxrQ0FBOEIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLDJCQUEyQixDQUFDO0FBQUEsRUFDL0csQ0FBQztBQUVELFdBQVMsTUFBTTtBQUVkLFFBQUks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
