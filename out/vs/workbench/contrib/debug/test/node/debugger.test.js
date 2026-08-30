import assert from "assert";
import { join, normalize } from "../../../../../base/common/path.js";
import * as platform from "../../../../../base/common/platform.js";
import { Debugger } from "../../common/debugger.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { URI } from "../../../../../base/common/uri.js";
import { ExecutableDebugAdapter } from "../../node/debugAdapter.js";
import { TestTextResourcePropertiesService } from "../../../../../editor/test/common/services/testTextResourcePropertiesService.js";
import { ExtensionIdentifier, TargetPlatform } from "../../../../../platform/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
suite("Debug - Debugger", () => {
  let _debugger;
  const extensionFolderPath = "/a/b/c/";
  const debuggerContribution = {
    type: "mock",
    label: "Mock Debug",
    program: "./out/mock/mockDebug.js",
    args: ["arg1", "arg2"],
    configurationAttributes: {
      launch: {
        required: ["program"],
        properties: {
          program: {
            "type": "string",
            "description": "Workspace relative path to a text file.",
            "default": "readme.md"
          }
        }
      }
    },
    variables: null,
    initialConfigurations: [
      {
        name: "Mock-Debug",
        type: "mock",
        request: "launch",
        program: "readme.md"
      }
    ]
  };
  const extensionDescriptor0 = {
    id: "adapter",
    identifier: new ExtensionIdentifier("adapter"),
    name: "myAdapter",
    version: "1.0.0",
    publisher: "vscode",
    extensionLocation: URI.file(extensionFolderPath),
    isBuiltin: false,
    isUserBuiltin: false,
    isUnderDevelopment: false,
    engines: null,
    targetPlatform: TargetPlatform.UNDEFINED,
    contributes: {
      "debuggers": [
        debuggerContribution
      ]
    },
    enabledApiProposals: void 0,
    preRelease: false
  };
  const extensionDescriptor1 = {
    id: "extension1",
    identifier: new ExtensionIdentifier("extension1"),
    name: "extension1",
    version: "1.0.0",
    publisher: "vscode",
    extensionLocation: URI.file("/e1/b/c/"),
    isBuiltin: false,
    isUserBuiltin: false,
    isUnderDevelopment: false,
    engines: null,
    targetPlatform: TargetPlatform.UNDEFINED,
    contributes: {
      "debuggers": [
        {
          type: "mock",
          runtime: "runtime",
          runtimeArgs: ["rarg"],
          program: "mockprogram",
          args: ["parg"]
        }
      ]
    },
    enabledApiProposals: void 0,
    preRelease: false
  };
  const extensionDescriptor2 = {
    id: "extension2",
    identifier: new ExtensionIdentifier("extension2"),
    name: "extension2",
    version: "1.0.0",
    publisher: "vscode",
    extensionLocation: URI.file("/e2/b/c/"),
    isBuiltin: false,
    isUserBuiltin: false,
    isUnderDevelopment: false,
    engines: null,
    targetPlatform: TargetPlatform.UNDEFINED,
    contributes: {
      "debuggers": [
        {
          type: "mock",
          win: {
            runtime: "winRuntime",
            program: "winProgram"
          },
          linux: {
            runtime: "linuxRuntime",
            program: "linuxProgram"
          },
          osx: {
            runtime: "osxRuntime",
            program: "osxProgram"
          }
        }
      ]
    },
    enabledApiProposals: void 0,
    preRelease: false
  };
  const adapterManager = {
    getDebugAdapterDescriptor(session, config) {
      return Promise.resolve(void 0);
    }
  };
  ensureNoDisposablesAreLeakedInTestSuite();
  const configurationService = new TestConfigurationService();
  const testResourcePropertiesService = new TestTextResourcePropertiesService(configurationService);
  setup(() => {
    _debugger = new Debugger(adapterManager, debuggerContribution, extensionDescriptor0, configurationService, testResourcePropertiesService, void 0, void 0, void 0, void 0, void 0, void 0);
  });
  teardown(() => {
    _debugger = null;
  });
  test("attributes", () => {
    assert.strictEqual(_debugger.type, debuggerContribution.type);
    assert.strictEqual(_debugger.label, debuggerContribution.label);
    const ae = ExecutableDebugAdapter.platformAdapterExecutable([extensionDescriptor0], "mock");
    assert.strictEqual(ae.command, join(extensionFolderPath, debuggerContribution.program));
    assert.deepStrictEqual(ae.args, debuggerContribution.args);
  });
  test("merge platform specific attributes", function() {
    if (!process.versions.electron) {
      this.skip();
    }
    const ae = ExecutableDebugAdapter.platformAdapterExecutable([extensionDescriptor1, extensionDescriptor2], "mock");
    assert.strictEqual(ae.command, platform.isLinux ? "linuxRuntime" : platform.isMacintosh ? "osxRuntime" : "winRuntime");
    const xprogram = platform.isLinux ? "linuxProgram" : platform.isMacintosh ? "osxProgram" : "winProgram";
    assert.deepStrictEqual(ae.args, ["rarg", normalize("/e2/b/c/") + xprogram, "parg"]);
  });
  test("initial config file content", () => {
    const expected = [
      "{",
      "	// Use IntelliSense to learn about possible attributes.",
      "	// Hover to view descriptions of existing attributes.",
      "	// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387",
      '	"version": "0.2.0",',
      '	"configurations": [',
      "		{",
      '			"name": "Mock-Debug",',
      '			"type": "mock",',
      '			"request": "launch",',
      '			"program": "readme.md"',
      "		}",
      "	]",
      "}"
    ].join(testResourcePropertiesService.getEOL(URI.file("somefile")));
    return _debugger.getInitialConfigurationContent().then((content) => {
      assert.strictEqual(content, expected);
    }, (err) => assert.fail(err));
  });
  test("getSchemaAttributes logs malformed properties and ignores them", () => {
    let warningMessage;
    const logService = new class extends NullLogService {
      warn(message) {
        warningMessage = message;
      }
    }();
    const malformedContribution = {
      ...debuggerContribution,
      configurationAttributes: {
        launch: {
          properties: {
            valid: { type: "string" },
            malformed: "integer"
          }
        }
      }
    };
    const malformedDebugger = new Debugger(adapterManager, malformedContribution, extensionDescriptor0, configurationService, testResourcePropertiesService, void 0, void 0, void 0, void 0, void 0, logService);
    const definitions = { common: { properties: {} } };
    const attributes = malformedDebugger.getSchemaAttributes(definitions);
    assert.ok(attributes);
    assert.strictEqual(attributes[0].properties?.["valid"].type, "string");
    assert.strictEqual(attributes[0].properties?.["malformed"], "integer");
    assert.ok(warningMessage);
    assert.match(warningMessage, /^Ignoring malformed debug configuration schema properties for type 'mock': malformed$/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxub2RlXFxkZWJ1Z2dlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgam9pbiwgbm9ybWFsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSwgSUNvbmZpZywgSURlYnVnU2Vzc2lvbiwgSUFkYXB0ZXJNYW5hZ2VyLCBJRGVidWdnZXJDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRGVidWdnZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZGVidWdnZXIuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2RlYnVnQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuXG5zdWl0ZSgnRGVidWcgLSBEZWJ1Z2dlcicsICgpID0+IHtcblx0bGV0IF9kZWJ1Z2dlcjogRGVidWdnZXI7XG5cblx0Y29uc3QgZXh0ZW5zaW9uRm9sZGVyUGF0aCA9ICcvYS9iL2MvJztcblx0Y29uc3QgZGVidWdnZXJDb250cmlidXRpb246IElEZWJ1Z2dlckNvbnRyaWJ1dGlvbiA9IHtcblx0XHR0eXBlOiAnbW9jaycsXG5cdFx0bGFiZWw6ICdNb2NrIERlYnVnJyxcblx0XHRwcm9ncmFtOiAnLi9vdXQvbW9jay9tb2NrRGVidWcuanMnLFxuXHRcdGFyZ3M6IFsnYXJnMScsICdhcmcyJ10sXG5cdFx0Y29uZmlndXJhdGlvbkF0dHJpYnV0ZXM6IHtcblx0XHRcdGxhdW5jaDoge1xuXHRcdFx0XHRyZXF1aXJlZDogWydwcm9ncmFtJ10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRwcm9ncmFtOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1dvcmtzcGFjZSByZWxhdGl2ZSBwYXRoIHRvIGEgdGV4dCBmaWxlLicsXG5cdFx0XHRcdFx0XHQnZGVmYXVsdCc6ICdyZWFkbWUubWQnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHR2YXJpYWJsZXM6IG51bGwhLFxuXHRcdGluaXRpYWxDb25maWd1cmF0aW9uczogW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnTW9jay1EZWJ1ZycsXG5cdFx0XHRcdHR5cGU6ICdtb2NrJyxcblx0XHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRcdHByb2dyYW06ICdyZWFkbWUubWQnXG5cdFx0XHR9XG5cdFx0XVxuXHR9O1xuXG5cdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0b3IwID0gPElFeHRlbnNpb25EZXNjcmlwdGlvbj57XG5cdFx0aWQ6ICdhZGFwdGVyJyxcblx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYWRhcHRlcicpLFxuXHRcdG5hbWU6ICdteUFkYXB0ZXInLFxuXHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0cHVibGlzaGVyOiAndnNjb2RlJyxcblx0XHRleHRlbnNpb25Mb2NhdGlvbjogVVJJLmZpbGUoZXh0ZW5zaW9uRm9sZGVyUGF0aCksXG5cdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRpc1VzZXJCdWlsdGluOiBmYWxzZSxcblx0XHRpc1VuZGVyRGV2ZWxvcG1lbnQ6IGZhbHNlLFxuXHRcdGVuZ2luZXM6IG51bGwhLFxuXHRcdHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQsXG5cdFx0Y29udHJpYnV0ZXM6IHtcblx0XHRcdCdkZWJ1Z2dlcnMnOiBbXG5cdFx0XHRcdGRlYnVnZ2VyQ29udHJpYnV0aW9uXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiB1bmRlZmluZWQsXG5cdFx0cHJlUmVsZWFzZTogZmFsc2UsXG5cdH07XG5cblx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRvcjEgPSB7XG5cdFx0aWQ6ICdleHRlbnNpb24xJyxcblx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZXh0ZW5zaW9uMScpLFxuXHRcdG5hbWU6ICdleHRlbnNpb24xJyxcblx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdHB1Ymxpc2hlcjogJ3ZzY29kZScsXG5cdFx0ZXh0ZW5zaW9uTG9jYXRpb246IFVSSS5maWxlKCcvZTEvYi9jLycpLFxuXHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0aXNVc2VyQnVpbHRpbjogZmFsc2UsXG5cdFx0aXNVbmRlckRldmVsb3BtZW50OiBmYWxzZSxcblx0XHRlbmdpbmVzOiBudWxsISxcblx0XHR0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVELFxuXHRcdGNvbnRyaWJ1dGVzOiB7XG5cdFx0XHQnZGVidWdnZXJzJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ21vY2snLFxuXHRcdFx0XHRcdHJ1bnRpbWU6ICdydW50aW1lJyxcblx0XHRcdFx0XHRydW50aW1lQXJnczogWydyYXJnJ10sXG5cdFx0XHRcdFx0cHJvZ3JhbTogJ21vY2twcm9ncmFtJyxcblx0XHRcdFx0XHRhcmdzOiBbJ3BhcmcnXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiB1bmRlZmluZWQsXG5cdFx0cHJlUmVsZWFzZTogZmFsc2UsXG5cdH07XG5cblx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRvcjIgPSB7XG5cdFx0aWQ6ICdleHRlbnNpb24yJyxcblx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZXh0ZW5zaW9uMicpLFxuXHRcdG5hbWU6ICdleHRlbnNpb24yJyxcblx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdHB1Ymxpc2hlcjogJ3ZzY29kZScsXG5cdFx0ZXh0ZW5zaW9uTG9jYXRpb246IFVSSS5maWxlKCcvZTIvYi9jLycpLFxuXHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0aXNVc2VyQnVpbHRpbjogZmFsc2UsXG5cdFx0aXNVbmRlckRldmVsb3BtZW50OiBmYWxzZSxcblx0XHRlbmdpbmVzOiBudWxsISxcblx0XHR0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVELFxuXHRcdGNvbnRyaWJ1dGVzOiB7XG5cdFx0XHQnZGVidWdnZXJzJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ21vY2snLFxuXHRcdFx0XHRcdHdpbjoge1xuXHRcdFx0XHRcdFx0cnVudGltZTogJ3dpblJ1bnRpbWUnLFxuXHRcdFx0XHRcdFx0cHJvZ3JhbTogJ3dpblByb2dyYW0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0cnVudGltZTogJ2xpbnV4UnVudGltZScsXG5cdFx0XHRcdFx0XHRwcm9ncmFtOiAnbGludXhQcm9ncmFtJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0XHRydW50aW1lOiAnb3N4UnVudGltZScsXG5cdFx0XHRcdFx0XHRwcm9ncmFtOiAnb3N4UHJvZ3JhbSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IHVuZGVmaW5lZCxcblx0XHRwcmVSZWxlYXNlOiBmYWxzZSxcblx0fTtcblxuXG5cdGNvbnN0IGFkYXB0ZXJNYW5hZ2VyID0gPElBZGFwdGVyTWFuYWdlcj57XG5cdFx0Z2V0RGVidWdBZGFwdGVyRGVzY3JpcHRvcihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBjb25maWc6IElDb25maWcpOiBQcm9taXNlPElEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9O1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25zdCB0ZXN0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSA9IG5ldyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRfZGVidWdnZXIgPSBuZXcgRGVidWdnZXIoYWRhcHRlck1hbmFnZXIsIGRlYnVnZ2VyQ29udHJpYnV0aW9uLCBleHRlbnNpb25EZXNjcmlwdG9yMCwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRlc3RSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdF9kZWJ1Z2dlciA9IG51bGwhO1xuXHR9KTtcblxuXHR0ZXN0KCdhdHRyaWJ1dGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZGVidWdnZXIudHlwZSwgZGVidWdnZXJDb250cmlidXRpb24udHlwZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9kZWJ1Z2dlci5sYWJlbCwgZGVidWdnZXJDb250cmlidXRpb24ubGFiZWwpO1xuXG5cdFx0Y29uc3QgYWUgPSBFeGVjdXRhYmxlRGVidWdBZGFwdGVyLnBsYXRmb3JtQWRhcHRlckV4ZWN1dGFibGUoW2V4dGVuc2lvbkRlc2NyaXB0b3IwXSwgJ21vY2snKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZSEuY29tbWFuZCwgam9pbihleHRlbnNpb25Gb2xkZXJQYXRoLCBkZWJ1Z2dlckNvbnRyaWJ1dGlvbi5wcm9ncmFtISkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWUhLmFyZ3MsIGRlYnVnZ2VyQ29udHJpYnV0aW9uLmFyZ3MpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBwbGF0Zm9ybSBzcGVjaWZpYyBhdHRyaWJ1dGVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghcHJvY2Vzcy52ZXJzaW9ucy5lbGVjdHJvbikge1xuXHRcdFx0dGhpcy5za2lwKCk7IC8vVE9ET0BkZWJ1ZyB0aGlzIHRlc3QgZmFpbHMgd2hlbiBydW4gaW4gbm9kZS5qcyBlbnZpcm9ubWVudHNcblx0XHR9XG5cdFx0Y29uc3QgYWUgPSBFeGVjdXRhYmxlRGVidWdBZGFwdGVyLnBsYXRmb3JtQWRhcHRlckV4ZWN1dGFibGUoW2V4dGVuc2lvbkRlc2NyaXB0b3IxLCBleHRlbnNpb25EZXNjcmlwdG9yMl0sICdtb2NrJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZS5jb21tYW5kLCBwbGF0Zm9ybS5pc0xpbnV4ID8gJ2xpbnV4UnVudGltZScgOiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyAnb3N4UnVudGltZScgOiAnd2luUnVudGltZScpKTtcblx0XHRjb25zdCB4cHJvZ3JhbSA9IHBsYXRmb3JtLmlzTGludXggPyAnbGludXhQcm9ncmFtJyA6IChwbGF0Zm9ybS5pc01hY2ludG9zaCA/ICdvc3hQcm9ncmFtJyA6ICd3aW5Qcm9ncmFtJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZS5hcmdzLCBbJ3JhcmcnLCBub3JtYWxpemUoJy9lMi9iL2MvJykgKyB4cHJvZ3JhbSwgJ3BhcmcnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWwgY29uZmlnIGZpbGUgY29udGVudCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gWyd7Jyxcblx0XHRcdCdcdC8vIFVzZSBJbnRlbGxpU2Vuc2UgdG8gbGVhcm4gYWJvdXQgcG9zc2libGUgYXR0cmlidXRlcy4nLFxuXHRcdFx0J1x0Ly8gSG92ZXIgdG8gdmlldyBkZXNjcmlwdGlvbnMgb2YgZXhpc3RpbmcgYXR0cmlidXRlcy4nLFxuXHRcdFx0J1x0Ly8gRm9yIG1vcmUgaW5mb3JtYXRpb24sIHZpc2l0OiBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9ODMwMzg3Jyxcblx0XHRcdCdcdFwidmVyc2lvblwiOiBcIjAuMi4wXCIsJyxcblx0XHRcdCdcdFwiY29uZmlndXJhdGlvbnNcIjogWycsXG5cdFx0XHQnXHRcdHsnLFxuXHRcdFx0J1x0XHRcdFwibmFtZVwiOiBcIk1vY2stRGVidWdcIiwnLFxuXHRcdFx0J1x0XHRcdFwidHlwZVwiOiBcIm1vY2tcIiwnLFxuXHRcdFx0J1x0XHRcdFwicmVxdWVzdFwiOiBcImxhdW5jaFwiLCcsXG5cdFx0XHQnXHRcdFx0XCJwcm9ncmFtXCI6IFwicmVhZG1lLm1kXCInLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdF0nLFxuXHRcdFx0J30nXS5qb2luKHRlc3RSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLmdldEVPTChVUkkuZmlsZSgnc29tZWZpbGUnKSkpO1xuXG5cdFx0cmV0dXJuIF9kZWJ1Z2dlci5nZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQoKS50aGVuKGNvbnRlbnQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0XHR9LCBlcnIgPT4gYXNzZXJ0LmZhaWwoZXJyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNjaGVtYUF0dHJpYnV0ZXMgbG9ncyBtYWxmb3JtZWQgcHJvcGVydGllcyBhbmQgaWdub3JlcyB0aGVtJywgKCkgPT4ge1xuXHRcdGxldCB3YXJuaW5nTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSB3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHR3YXJuaW5nTWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXG5cdFx0Y29uc3QgbWFsZm9ybWVkQ29udHJpYnV0aW9uOiBJRGVidWdnZXJDb250cmlidXRpb24gPSB7XG5cdFx0XHQuLi5kZWJ1Z2dlckNvbnRyaWJ1dGlvbixcblx0XHRcdGNvbmZpZ3VyYXRpb25BdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdGxhdW5jaDoge1xuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHZhbGlkOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRtYWxmb3JtZWQ6ICdpbnRlZ2VyJyBhcyBuZXZlclxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgbWFsZm9ybWVkRGVidWdnZXIgPSBuZXcgRGVidWdnZXIoYWRhcHRlck1hbmFnZXIsIG1hbGZvcm1lZENvbnRyaWJ1dGlvbiwgZXh0ZW5zaW9uRGVzY3JpcHRvcjAsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXN0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbnM6IElKU09OU2NoZW1hTWFwID0geyBjb21tb246IHsgcHJvcGVydGllczoge30gfSB9O1xuXG5cdFx0Y29uc3QgYXR0cmlidXRlcyA9IG1hbGZvcm1lZERlYnVnZ2VyLmdldFNjaGVtYUF0dHJpYnV0ZXMoZGVmaW5pdGlvbnMpO1xuXG5cdFx0YXNzZXJ0Lm9rKGF0dHJpYnV0ZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRyaWJ1dGVzIVswXS5wcm9wZXJ0aWVzPy5bJ3ZhbGlkJ10udHlwZSwgJ3N0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRyaWJ1dGVzIVswXS5wcm9wZXJ0aWVzPy5bJ21hbGZvcm1lZCddLCAnaW50ZWdlcicpO1xuXHRcdGFzc2VydC5vayh3YXJuaW5nTWVzc2FnZSk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHdhcm5pbmdNZXNzYWdlLCAvXklnbm9yaW5nIG1hbGZvcm1lZCBkZWJ1ZyBjb25maWd1cmF0aW9uIHNjaGVtYSBwcm9wZXJ0aWVzIGZvciB0eXBlICdtb2NrJzogbWFsZm9ybWVkJC8pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsTUFBTSxpQkFBaUI7QUFDaEMsWUFBWSxjQUFjO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsV0FBVztBQUNwQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHFCQUE0QyxzQkFBc0I7QUFDM0UsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFHL0IsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQixNQUFJO0FBRUosUUFBTSxzQkFBc0I7QUFDNUIsUUFBTSx1QkFBOEM7QUFBQSxJQUNuRCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxTQUFTO0FBQUEsSUFDVCxNQUFNLENBQUMsUUFBUSxNQUFNO0FBQUEsSUFDckIseUJBQXlCO0FBQUEsTUFDeEIsUUFBUTtBQUFBLFFBQ1AsVUFBVSxDQUFDLFNBQVM7QUFBQSxRQUNwQixZQUFZO0FBQUEsVUFDWCxTQUFTO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixlQUFl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
