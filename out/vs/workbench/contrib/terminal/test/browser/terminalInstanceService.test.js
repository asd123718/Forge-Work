import { deepStrictEqual } from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TerminalInstanceService } from "../../browser/terminalInstanceService.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("Workbench - TerminalInstanceService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let terminalInstanceService;
  setup(async () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    terminalInstanceService = store.add(instantiationService.createInstance(TerminalInstanceService));
  });
  suite("convertProfileToShellLaunchConfig", () => {
    test("should return an empty shell launch config when undefined is provided", () => {
      deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(), {});
      deepStrictEqual(terminalInstanceService.convertProfileToShellLaunchConfig(void 0), {});
    });
    test("should return the same shell launch config when provided", () => {
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({}),
        {}
      );
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({ executable: "/foo" }),
        { executable: "/foo" }
      );
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({ executable: "/foo", cwd: "/bar", args: ["a", "b"] }),
        { executable: "/foo", cwd: "/bar", args: ["a", "b"] }
      );
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({ executable: "/foo" }, "/bar"),
        { executable: "/foo", cwd: "/bar" }
      );
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({ executable: "/foo", cwd: "/bar" }, "/baz"),
        { executable: "/foo", cwd: "/baz" }
      );
    });
    test("should convert a provided profile to a shell launch config", () => {
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({
          profileName: "abc",
          path: "/foo",
          isDefault: true
        }),
        {
          args: void 0,
          color: void 0,
          cwd: void 0,
          env: void 0,
          executable: "/foo",
          icon: void 0,
          name: void 0
        }
      );
      const icon = URI.file("/icon");
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({
          profileName: "abc",
          path: "/foo",
          isDefault: true,
          args: ["a", "b"],
          color: "color",
          env: { test: "TEST" },
          icon
        }, "/bar"),
        {
          args: ["a", "b"],
          color: "color",
          cwd: "/bar",
          env: { test: "TEST" },
          executable: "/foo",
          icon,
          name: void 0
        }
      );
    });
    test("should respect overrideName in profile", () => {
      deepStrictEqual(
        terminalInstanceService.convertProfileToShellLaunchConfig({
          profileName: "abc",
          path: "/foo",
          isDefault: true,
          overrideName: true
        }),
        {
          args: void 0,
          color: void 0,
          cwd: void 0,
          env: void 0,
          executable: "/foo",
          icon: void 0,
          name: "abc"
        }
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbEluc3RhbmNlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEluc3RhbmNlU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb252ZXJ0UHJvZmlsZVRvU2hlbGxMYXVuY2hDb25maWcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBhbiBlbXB0eSBzaGVsbCBsYXVuY2ggY29uZmlnIHdoZW4gdW5kZWZpbmVkIGlzIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNvbnZlcnRQcm9maWxlVG9TaGVsbExhdW5jaENvbmZpZygpLCB7fSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKHVuZGVmaW5lZCksIHt9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRoZSBzYW1lIHNoZWxsIGxhdW5jaCBjb25maWcgd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKHt9KSxcblx0XHRcdFx0e31cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNvbnZlcnRQcm9maWxlVG9TaGVsbExhdW5jaENvbmZpZyh7IGV4ZWN1dGFibGU6ICcvZm9vJyB9KSxcblx0XHRcdFx0eyBleGVjdXRhYmxlOiAnL2ZvbycgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKHsgZXhlY3V0YWJsZTogJy9mb28nLCBjd2Q6ICcvYmFyJywgYXJnczogWydhJywgJ2InXSB9KSxcblx0XHRcdFx0eyBleGVjdXRhYmxlOiAnL2ZvbycsIGN3ZDogJy9iYXInLCBhcmdzOiBbJ2EnLCAnYiddIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNvbnZlcnRQcm9maWxlVG9TaGVsbExhdW5jaENvbmZpZyh7IGV4ZWN1dGFibGU6ICcvZm9vJyB9LCAnL2JhcicpLFxuXHRcdFx0XHR7IGV4ZWN1dGFibGU6ICcvZm9vJywgY3dkOiAnL2JhcicgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKHsgZXhlY3V0YWJsZTogJy9mb28nLCBjd2Q6ICcvYmFyJyB9LCAnL2JheicpLFxuXHRcdFx0XHR7IGV4ZWN1dGFibGU6ICcvZm9vJywgY3dkOiAnL2JheicgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBhIHByb3ZpZGVkIHByb2ZpbGUgdG8gYSBzaGVsbCBsYXVuY2ggY29uZmlnJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5jb252ZXJ0UHJvZmlsZVRvU2hlbGxMYXVuY2hDb25maWcoe1xuXHRcdFx0XHRcdHByb2ZpbGVOYW1lOiAnYWJjJyxcblx0XHRcdFx0XHRwYXRoOiAnL2ZvbycsXG5cdFx0XHRcdFx0aXNEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXJnczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y3dkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZW52OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXhlY3V0YWJsZTogJy9mb28nLFxuXHRcdFx0XHRcdGljb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRuYW1lOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGljb24gPSBVUkkuZmlsZSgnL2ljb24nKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKHtcblx0XHRcdFx0XHRwcm9maWxlTmFtZTogJ2FiYycsXG5cdFx0XHRcdFx0cGF0aDogJy9mb28nLFxuXHRcdFx0XHRcdGlzRGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRhcmdzOiBbJ2EnLCAnYiddLFxuXHRcdFx0XHRcdGNvbG9yOiAnY29sb3InLFxuXHRcdFx0XHRcdGVudjogeyB0ZXN0OiAnVEVTVCcgfSxcblx0XHRcdFx0XHRpY29uXG5cdFx0XHRcdH0gYXMgSVRlcm1pbmFsUHJvZmlsZSwgJy9iYXInKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFyZ3M6IFsnYScsICdiJ10sXG5cdFx0XHRcdFx0Y29sb3I6ICdjb2xvcicsXG5cdFx0XHRcdFx0Y3dkOiAnL2JhcicsXG5cdFx0XHRcdFx0ZW52OiB7IHRlc3Q6ICdURVNUJyB9LFxuXHRcdFx0XHRcdGV4ZWN1dGFibGU6ICcvZm9vJyxcblx0XHRcdFx0XHRpY29uLFxuXHRcdFx0XHRcdG5hbWU6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNwZWN0IG92ZXJyaWRlTmFtZSBpbiBwcm9maWxlJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5jb252ZXJ0UHJvZmlsZVRvU2hlbGxMYXVuY2hDb25maWcoe1xuXHRcdFx0XHRcdHByb2ZpbGVOYW1lOiAnYWJjJyxcblx0XHRcdFx0XHRwYXRoOiAnL2ZvbycsXG5cdFx0XHRcdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG92ZXJyaWRlTmFtZTogdHJ1ZVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFyZ3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb2xvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGN3ZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVudjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGV4ZWN1dGFibGU6ICcvZm9vJyxcblx0XHRcdFx0XHRpY29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bmFtZTogJ2FiYydcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFDQUFx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
