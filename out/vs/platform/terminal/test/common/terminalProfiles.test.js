import { deepStrictEqual } from "assert";
import { Codicon } from "../../../../base/common/codicons.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { createProfileSchemaEnums } from "../../common/terminalProfiles.js";
suite("terminalProfiles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("createProfileSchemaEnums", () => {
    test("should return an empty array when there are no profiles", () => {
      deepStrictEqual(createProfileSchemaEnums([]), {
        values: [
          null
        ],
        markdownDescriptions: [
          "Automatically detect the default"
        ]
      });
    });
    test("should return a single entry when there is one profile", () => {
      const profile = {
        profileName: "name",
        path: "path",
        isDefault: true
      };
      deepStrictEqual(createProfileSchemaEnums([profile]), {
        values: [
          null,
          "name"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          "$(terminal) name\n- path: path"
        ]
      });
    });
    test("should show all profile information", () => {
      const profile = {
        profileName: "name",
        path: "path",
        isDefault: true,
        args: ["a", "b"],
        color: "terminal.ansiRed",
        env: {
          c: "d",
          e: "f"
        },
        icon: Codicon.zap,
        overrideName: true
      };
      deepStrictEqual(createProfileSchemaEnums([profile]), {
        values: [
          null,
          "name"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          `$(zap) name
- path: path
- args: ['a','b']
- overrideName: true
- color: terminal.ansiRed
- env: {"c":"d","e":"f"}`
        ]
      });
    });
    test("should return a multiple entries when there are multiple profiles", () => {
      const profile1 = {
        profileName: "name",
        path: "path",
        isDefault: true
      };
      const profile2 = {
        profileName: "foo",
        path: "bar",
        isDefault: false
      };
      deepStrictEqual(createProfileSchemaEnums([profile1, profile2]), {
        values: [
          null,
          "name",
          "foo"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          "$(terminal) name\n- path: path",
          "$(terminal) foo\n- path: bar"
        ]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXHRlc3RcXGNvbW1vblxcdGVybWluYWxQcm9maWxlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGUgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlUHJvZmlsZVNjaGVtYUVudW1zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsUHJvZmlsZXMuanMnO1xuXG5zdWl0ZSgndGVybWluYWxQcm9maWxlcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2NyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGFuIGVtcHR5IGFycmF5IHdoZW4gdGhlcmUgYXJlIG5vIHByb2ZpbGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyhbXSksIHtcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0bnVsbFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdCdBdXRvbWF0aWNhbGx5IGRldGVjdCB0aGUgZGVmYXVsdCdcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBhIHNpbmdsZSBlbnRyeSB3aGVuIHRoZXJlIGlzIG9uZSBwcm9maWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSA9IHtcblx0XHRcdFx0cHJvZmlsZU5hbWU6ICduYW1lJyxcblx0XHRcdFx0cGF0aDogJ3BhdGgnLFxuXHRcdFx0XHRpc0RlZmF1bHQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoY3JlYXRlUHJvZmlsZVNjaGVtYUVudW1zKFtwcm9maWxlXSksIHtcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0bnVsbCxcblx0XHRcdFx0XHQnbmFtZSdcblx0XHRcdFx0XSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHQnQXV0b21hdGljYWxseSBkZXRlY3QgdGhlIGRlZmF1bHQnLFxuXHRcdFx0XHRcdCckKHRlcm1pbmFsKSBuYW1lXFxuLSBwYXRoOiBwYXRoJ1xuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgc2hvdyBhbGwgcHJvZmlsZSBpbmZvcm1hdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgPSB7XG5cdFx0XHRcdHByb2ZpbGVOYW1lOiAnbmFtZScsXG5cdFx0XHRcdHBhdGg6ICdwYXRoJyxcblx0XHRcdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRhcmdzOiBbJ2EnLCAnYiddLFxuXHRcdFx0XHRjb2xvcjogJ3Rlcm1pbmFsLmFuc2lSZWQnLFxuXHRcdFx0XHRlbnY6IHtcblx0XHRcdFx0XHRjOiAnZCcsXG5cdFx0XHRcdFx0ZTogJ2YnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IENvZGljb24uemFwLFxuXHRcdFx0XHRvdmVycmlkZU5hbWU6IHRydWVcblx0XHRcdH07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoY3JlYXRlUHJvZmlsZVNjaGVtYUVudW1zKFtwcm9maWxlXSksIHtcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0bnVsbCxcblx0XHRcdFx0XHQnbmFtZSdcblx0XHRcdFx0XSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHQnQXV0b21hdGljYWxseSBkZXRlY3QgdGhlIGRlZmF1bHQnLFxuXHRcdFx0XHRcdGAkKHphcCkgbmFtZVxcbi0gcGF0aDogcGF0aFxcbi0gYXJnczogWydhJywnYiddXFxuLSBvdmVycmlkZU5hbWU6IHRydWVcXG4tIGNvbG9yOiB0ZXJtaW5hbC5hbnNpUmVkXFxuLSBlbnY6IHtcXFwiY1xcXCI6XFxcImRcXFwiLFxcXCJlXFxcIjpcXFwiZlxcXCJ9YFxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGEgbXVsdGlwbGUgZW50cmllcyB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9maWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGUxOiBJVGVybWluYWxQcm9maWxlID0ge1xuXHRcdFx0XHRwcm9maWxlTmFtZTogJ25hbWUnLFxuXHRcdFx0XHRwYXRoOiAncGF0aCcsXG5cdFx0XHRcdGlzRGVmYXVsdDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb2ZpbGUyOiBJVGVybWluYWxQcm9maWxlID0ge1xuXHRcdFx0XHRwcm9maWxlTmFtZTogJ2ZvbycsXG5cdFx0XHRcdHBhdGg6ICdiYXInLFxuXHRcdFx0XHRpc0RlZmF1bHQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyhbcHJvZmlsZTEsIHByb2ZpbGUyXSksIHtcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0bnVsbCxcblx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0J2Zvbydcblx0XHRcdFx0XSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHQnQXV0b21hdGljYWxseSBkZXRlY3QgdGhlIGRlZmF1bHQnLFxuXHRcdFx0XHRcdCckKHRlcm1pbmFsKSBuYW1lXFxuLSBwYXRoOiBwYXRoJyxcblx0XHRcdFx0XHQnJCh0ZXJtaW5hbCkgZm9vXFxuLSBwYXRoOiBiYXInXG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDO0FBRXpDLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsMENBQXdDO0FBRXhDLFFBQU0sNEJBQTRCLE1BQU07QUFDdkMsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxzQkFBZ0IseUJBQXlCLENBQUMsQ0FBQyxHQUFHO0FBQUEsUUFDN0MsUUFBUTtBQUFBLFVBQ1A7QUFBQSxRQUNEO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxVQUNyQjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0sVUFBNEI7QUFBQSxRQUNqQyxhQUFhO0FBQUEsUUFDYixNQUFNO0FBQUEsUUFDTixXQUFXO0FBQUEsTUFDWjtBQUNBLHNCQUFnQix5QkFBeUIsQ0FBQyxPQUFPLENBQUMsR0FBRztBQUFBLFFBQ3BELFFBQVE7QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLHNCQUFzQjtBQUFBLFVBQ3JCO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxTQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFlBQU0sVUFBNEI7QUFBQSxRQUNqQyxhQUFhO0FBQUEsUUFDYixNQUFNO0FBQUEsUUFDTixXQUFXO0FBQUEsUUFDWCxNQUFNLENBQUMsS0FBSyxHQUFHO0FBQUEsUUFDZixPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsVUFDSixHQUFHO0FBQUEsVUFDSCxHQUFHO0FBQUEsUUFDSjtBQUFBLFFBQ0EsTUFBTSxRQUFRO0FBQUEsUUFDZCxjQUFjO0FBQUEsTUFDZjtBQUNBLHNCQUFnQix5QkFBeUIsQ0FBQyxPQUFPLENBQUMsR0FBRztBQUFBLFFBQ3BELFFBQVE7QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLHNCQUFzQjtBQUFBLFVBQ3JCO0FBQUEsVUFDQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsU0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxZQUFNLFdBQTZCO0FBQUEsUUFDbEMsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLE1BQ1o7QUFDQSxZQUFNLFdBQTZCO0FBQUEsUUFDbEMsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLE1BQ1o7QUFDQSxzQkFBZ0IseUJBQXlCLENBQUMsVUFBVSxRQUFRLENBQUMsR0FBRztBQUFBLFFBQy9ELFFBQVE7QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxVQUNyQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
