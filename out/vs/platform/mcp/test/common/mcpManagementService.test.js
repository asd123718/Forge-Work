import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { upcastPartial } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { AbstractCommonMcpManagementService, AbstractMcpResourceManagementService, McpUserResourceManagementService } from "../../common/mcpManagementService.js";
import { GalleryMcpServerStatus, RegistryType, TransportType } from "../../common/mcpManagement.js";
import { McpServerType, McpServerVariableType } from "../../common/mcpPlatformTypes.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ConfigurationTarget } from "../../../configuration/common/configuration.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpResourceScannerService } from "../../common/mcpResourceScannerService.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
  }
  error(message, ...args) {
    this.errors.push([message, ...args].join(" "));
  }
}
class TestMcpManagementService extends AbstractCommonMcpManagementService {
  constructor() {
    super(...arguments);
    this.onInstallMcpServer = Event.None;
    this.onDidInstallMcpServers = Event.None;
    this.onDidUpdateMcpServers = Event.None;
    this.onUninstallMcpServer = Event.None;
    this.onDidUninstallMcpServer = Event.None;
  }
  getInstalled(mcpResource) {
    throw new Error("Method not implemented.");
  }
  install(server, options) {
    throw new Error("Method not implemented.");
  }
  installFromGallery(server, options) {
    throw new Error("Method not implemented.");
  }
  updateMetadata(local, server, profileLocation) {
    throw new Error("Method not implemented.");
  }
  uninstall(server, options) {
    throw new Error("Method not implemented.");
  }
  canInstall(server) {
    throw new Error("Not supported");
  }
}
class TestMcpResourceManagementService extends AbstractMcpResourceManagementService {
  constructor(mcpResource, fileService, uriIdentityService, mcpResourceScannerService, allowedMcpServersService = { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true }) {
    super(
      mcpResource,
      ConfigurationTarget.USER,
      {},
      fileService,
      uriIdentityService,
      new NullLogService(),
      mcpResourceScannerService,
      allowedMcpServersService
    );
  }
  reload(source) {
    return this.updateLocal(source);
  }
  canInstall(_server) {
    throw new Error("Not supported");
  }
  getLocalServerInfo(_name, _mcpServerConfig) {
    return Promise.resolve(void 0);
  }
  installFromUri(_uri) {
    throw new Error("Not supported");
  }
  installFromGallery(_server, _options) {
    throw new Error("Not supported");
  }
  updateMetadata(_local, _server) {
    throw new Error("Not supported");
  }
}
suite("McpManagementService - getMcpServerConfigurationFromManifest", () => {
  let service;
  setup(() => {
    service = new TestMcpManagementService(new NullLogService());
  });
  teardown(() => {
    service.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("NPM Package Tests", () => {
    test("basic NPM package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@modelcontextprotocol/server-brave-search",
          transport: { type: TransportType.STDIO },
          version: "1.0.2",
          environmentVariables: [{
            name: "BRAVE_API_KEY",
            value: "test-key"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["@modelcontextprotocol/server-brave-search@1.0.2"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "BRAVE_API_KEY": "test-key" });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs, void 0);
    });
    test("NPM package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          registryBaseUrl: "https://custom-registry.example.com",
          identifier: "@company/internal-package",
          transport: { type: TransportType.STDIO },
          version: "2.1.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "--registry",
          "https://custom-registry.example.com",
          "@company/internal-package@2.1.0"
        ]);
      }
    });
    test("NPM package without version", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@modelcontextprotocol/everything",
          version: "",
          transport: { type: TransportType.STDIO }
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["@modelcontextprotocol/everything"]);
      }
    });
    test("NPM package with environment variables containing variables", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          environmentVariables: [{
            name: "API_KEY",
            value: "key-{api_token}",
            variables: {
              api_token: {
                description: "Your API token",
                isSecret: true,
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "API_KEY": "key-${input:api_token}" });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_token");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Your API token");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
    });
    test("environment variable with empty value should create input variable (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "@modelcontextprotocol/server-brave-search",
          version: "1.0.2",
          environmentVariables: [{
            name: "BRAVE_API_KEY",
            value: "",
            // Empty value should create input variable
            description: "Brave Search API Key",
            isRequired: true,
            isSecret: true
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "BRAVE_API_KEY");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Brave Search API Key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "BRAVE_API_KEY": "${input:BRAVE_API_KEY}" });
      }
    });
    test("environment variable with choices but empty value should create pick input (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          environmentVariables: [{
            name: "SSL_MODE",
            value: "",
            // Empty value should create input variable
            description: "SSL connection mode",
            default: "prefer",
            choices: ["disable", "prefer", "require"]
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "SSL_MODE");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "SSL connection mode");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, "prefer");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["disable", "prefer", "require"]);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "SSL_MODE": "${input:SSL_MODE}" });
      }
    });
    test("NPM package with package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "snyk",
          version: "1.1298.0",
          packageArguments: [
            { type: "positional", value: "mcp", valueHint: "command", isRepeated: false },
            {
              type: "named",
              name: "-t",
              value: "stdio",
              isRepeated: false
            }
          ]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["snyk@1.1298.0", "mcp", "-t", "stdio"]);
      }
    });
  });
  suite("Python Package Tests", () => {
    test("basic Python package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "weather-mcp-server",
          version: "0.5.0",
          environmentVariables: [{
            name: "WEATHER_API_KEY",
            value: "test-key"
          }, {
            name: "WEATHER_UNITS",
            value: "celsius"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["weather-mcp-server@0.5.0"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
          "WEATHER_API_KEY": "test-key",
          "WEATHER_UNITS": "celsius"
        });
      }
    });
    test("Python package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          registryBaseUrl: "https://custom-pypi.example.com/simple",
          transport: { type: TransportType.STDIO },
          identifier: "internal-python-server",
          version: "1.2.3"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "--index-url",
          "https://custom-pypi.example.com/simple",
          "internal-python-server@1.2.3"
        ]);
      }
    });
    test("Python package without version", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "weather-mcp-server",
          version: ""
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["weather-mcp-server"]);
      }
    });
  });
  suite("Docker Package Tests", () => {
    test("basic Docker package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "mcp/filesystem",
          version: "1.0.2",
          runtimeArguments: [{
            type: "named",
            name: "--mount",
            value: "type=bind,src=/host/path,dst=/container/path",
            isRepeated: false
          }],
          environmentVariables: [{
            name: "LOG_LEVEL",
            value: "info"
          }],
          packageArguments: [{
            type: "positional",
            value: "/project",
            valueHint: "directory",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "--mount",
          "type=bind,src=/host/path,dst=/container/path",
          "-e",
          "LOG_LEVEL",
          "mcp/filesystem:1.0.2",
          "/project"
        ]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "LOG_LEVEL": "info" });
      }
    });
    test("Docker package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          registryBaseUrl: "registry.company.com",
          transport: { type: TransportType.STDIO },
          identifier: "internal/mcp-server",
          version: "3.2.1"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "registry.company.com/internal/mcp-server:3.2.1"
        ]);
      }
    });
    test("Docker package with variables in runtime arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "example/database-manager-mcp",
          version: "3.1.0",
          runtimeArguments: [{
            type: "named",
            name: "-e",
            value: "DB_TYPE={db_type}",
            isRepeated: false,
            variables: {
              db_type: {
                description: "Type of database",
                choices: ["postgres", "mysql", "mongodb", "redis"],
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "-e",
          "DB_TYPE=${input:db_type}",
          "example/database-manager-mcp:3.1.0"
        ]);
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "db_type");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["postgres", "mysql", "mongodb", "redis"]);
    });
    test("Docker package arguments without values should create input variables (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "example/database-manager-mcp",
          version: "3.1.0",
          packageArguments: [{
            type: "named",
            name: "--host",
            description: "Database host",
            default: "localhost",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field - should create input variable
          }, {
            type: "positional",
            valueHint: "database_name",
            description: "Name of the database to connect to",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field - should create input variable
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
      const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "host");
      assert.strictEqual(hostInput?.description, "Database host");
      assert.strictEqual(hostInput?.default, "localhost");
      assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);
      const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "database_name");
      assert.strictEqual(dbNameInput?.description, "Name of the database to connect to");
      assert.strictEqual(dbNameInput?.type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "example/database-manager-mcp:3.1.0",
          "--host",
          "${input:host}",
          "${input:database_name}"
        ]);
      }
    });
    test("Docker Hub backward compatibility", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          identifier: "example/test-image",
          transport: { type: TransportType.STDIO },
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "example/test-image:1.0.0"
        ]);
      }
    });
  });
  suite("NuGet Package Tests", () => {
    test("basic NuGet package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          transport: { type: TransportType.STDIO },
          identifier: "Knapcode.SampleMcpServer",
          version: "0.5.0",
          environmentVariables: [{
            name: "WEATHER_CHOICES",
            value: "sunny,cloudy,rainy"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "dnx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["Knapcode.SampleMcpServer@0.5.0", "--yes"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "WEATHER_CHOICES": "sunny,cloudy,rainy" });
      }
    });
    test("NuGet package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          registryBaseUrl: "https://nuget.company.com/v3/index.json",
          transport: { type: TransportType.STDIO },
          identifier: "Company.Internal.McpServer",
          version: "4.5.6"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "dnx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "Company.Internal.McpServer@4.5.6",
          "--yes",
          "--source",
          "https://nuget.company.com/v3/index.json"
        ]);
      }
    });
    test("NuGet package with package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          transport: { type: TransportType.STDIO },
          identifier: "Knapcode.SampleMcpServer",
          version: "0.4.0-beta",
          packageArguments: [{
            type: "positional",
            value: "mcp",
            valueHint: "command",
            isRepeated: false
          }, {
            type: "positional",
            value: "start",
            valueHint: "action",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "Knapcode.SampleMcpServer@0.4.0-beta",
          "--yes",
          "--",
          "mcp",
          "start"
        ]);
      }
    });
  });
  suite("Remote Server Tests", () => {
    test("SSE remote server configuration", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "http://mcp-fs.anonymous.modelcontextprotocol.io/sse"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "http://mcp-fs.anonymous.modelcontextprotocol.io/sse");
        assert.strictEqual(result.mcpServerConfiguration.config.headers, void 0);
      }
    });
    test("SSE remote server with headers and variables", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "https://mcp.anonymous.modelcontextprotocol.io/sse",
          headers: [{
            name: "X-API-Key",
            value: "{api_key}",
            variables: {
              api_key: {
                description: "API key for authentication",
                isRequired: true,
                isSecret: true
              }
            }
          }, {
            name: "X-Region",
            value: "us-east-1"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
          "X-API-Key": "${input:api_key}",
          "X-Region": "us-east-1"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
    });
    test("streamable HTTP remote server", () => {
      const manifest = {
        remotes: [{
          type: TransportType.STREAMABLE_HTTP,
          url: "https://mcp.anonymous.modelcontextprotocol.io/http"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "https://mcp.anonymous.modelcontextprotocol.io/http");
      }
    });
    test("remote headers without values should create input variables", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "https://api.example.com/mcp",
          headers: [{
            name: "Authorization",
            description: "API token for authentication",
            isSecret: true,
            isRequired: true
            // Note: No 'value' field - should create input variable
          }, {
            name: "X-Custom-Header",
            description: "Custom header value",
            default: "default-value",
            choices: ["option1", "option2", "option3"]
            // Note: No 'value' field - should create input variable with choices
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "https://api.example.com/mcp");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
          "Authorization": "${input:Authorization}",
          "X-Custom-Header": "${input:X-Custom-Header}"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
      const authInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "Authorization");
      assert.strictEqual(authInput?.description, "API token for authentication");
      assert.strictEqual(authInput?.password, true);
      assert.strictEqual(authInput?.type, McpServerVariableType.PROMPT);
      const customInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "X-Custom-Header");
      assert.strictEqual(customInput?.description, "Custom header value");
      assert.strictEqual(customInput?.default, "default-value");
      assert.strictEqual(customInput?.type, McpServerVariableType.PICK);
      assert.deepStrictEqual(customInput?.options, ["option1", "option2", "option3"]);
    });
  });
  suite("Variable Interpolation Tests", () => {
    test("multiple variables in single value", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          environmentVariables: [{
            name: "CONNECTION_STRING",
            value: "server={host};port={port};database={db_name}",
            variables: {
              host: {
                description: "Database host",
                default: "localhost"
              },
              port: {
                description: "Database port",
                format: "number",
                default: "5432"
              },
              db_name: {
                description: "Database name",
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
          "CONNECTION_STRING": "server=${input:host};port=${input:port};database=${input:db_name}"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 3);
      const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "host");
      assert.strictEqual(hostInput?.default, "localhost");
      assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);
      const portInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "port");
      assert.strictEqual(portInput?.default, "5432");
      const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "db_name");
      assert.strictEqual(dbNameInput?.description, "Database name");
    });
    test("variable with choices creates pick input", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "--log-level",
            value: "{level}",
            isRepeated: false,
            variables: {
              level: {
                description: "Log level",
                choices: ["debug", "info", "warn", "error"],
                default: "info"
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["debug", "info", "warn", "error"]);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, "info");
    });
    test("variables in package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          identifier: "test-image",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          packageArguments: [{
            type: "named",
            name: "--host",
            value: "{db_host}",
            isRepeated: false,
            variables: {
              db_host: {
                description: "Database host",
                default: "localhost"
              }
            }
          }, {
            type: "positional",
            value: "{database_name}",
            valueHint: "database_name",
            isRepeated: false,
            variables: {
              database_name: {
                description: "Name of the database to connect to",
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "test-image:1.0.0",
          "--host",
          "${input:db_host}",
          "${input:database_name}"
        ]);
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
    });
    test("positional arguments with value_hint should create input variables (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@example/math-tool",
          transport: { type: TransportType.STDIO },
          version: "2.0.1",
          packageArguments: [{
            type: "positional",
            valueHint: "calculation_type",
            description: "Type of calculation to enable",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field, only value_hint - should create input variable
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "calculation_type");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Type of calculation to enable");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "@example/math-tool@2.0.1",
          "${input:calculation_type}"
        ]);
      }
    });
  });
  suite("Edge Cases and Error Handling", () => {
    test("empty manifest should throw error", () => {
      const manifest = {};
      assert.throws(() => {
        service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      }, /No server package found/);
    });
    test("manifest with no matching package type should use first package", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "python-server",
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["python-server@1.0.0"]);
      }
    });
    test("manifest with matching package type should use that package", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "python-server",
          version: "1.0.0"
        }, {
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "node-server",
          version: "2.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["node-server@2.0.0"]);
      }
    });
    test("undefined environment variables should be omitted", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.env, void 0);
      }
    });
    test("named argument without value should only add name", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "--verbose",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["--verbose", "test-server@1.0.0"]);
      }
    });
    test("positional argument with undefined value should use value_hint", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          packageArguments: [{
            type: "positional",
            valueHint: "target_directory",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0", "target_directory"]);
      }
    });
    test("named argument with no name should generate notice", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            value: "some-value",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.notices.length, 1);
      assert.ok(result.notices[0].includes("Named argument is missing a name"));
      assert.ok(result.notices[0].includes("some-value"));
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0"]);
      }
    });
    test("named argument with empty name should generate notice", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "",
            value: "some-value",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.notices.length, 1);
      assert.ok(result.notices[0].includes("Named argument is missing a name"));
      assert.ok(result.notices[0].includes("some-value"));
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0"]);
      }
    });
  });
  suite("Variable Processing Order", () => {
    test("should use explicit variables instead of auto-generating when both are possible", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          environmentVariables: [{
            name: "API_KEY",
            value: "Bearer {api_key}",
            description: "Should not be used",
            // This should be ignored since we have explicit variables
            variables: {
              api_key: {
                description: "Your API key",
                isSecret: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Your API key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.env?.["API_KEY"], "Bearer ${input:api_key}");
      }
    });
  });
});
suite("McpResourceManagementService", () => {
  const mcpResource = URI.from({ scheme: Schemas.inMemory, path: "/mcp.json" });
  let disposables;
  let fileService;
  let uriIdentityService;
  let scannerService;
  let service;
  function createGallery() {
    return {
      name: "test",
      displayName: "Test",
      description: "",
      version: "1.0.0",
      isLatest: true,
      status: GalleryMcpServerStatus.Active,
      configuration: {},
      publisher: "test"
    };
  }
  setup(async () => {
    disposables = new DisposableStore();
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    uriIdentityService = disposables.add(new UriIdentityService(fileService));
    scannerService = disposables.add(new McpResourceScannerService(fileService, uriIdentityService));
    service = disposables.add(new TestMcpResourceManagementService(mcpResource, fileService, uriIdentityService, scannerService));
    await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
      sandbox: {
        network: { allowedDomains: ["example.com"] }
      },
      servers: {
        test: {
          type: "stdio",
          command: "node",
          sandboxEnabled: true
        }
      }
    }, null, "	")));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fires update when root sandbox changes", async () => {
    const initial = await service.getInstalled();
    assert.strictEqual(initial.length, 1);
    assert.deepStrictEqual(initial[0].rootSandbox, {
      network: { allowedDomains: ["example.com"] }
    });
    let updateCount = 0;
    const updatePromise = new Promise((resolve) => disposables.add(service.onDidUpdateMcpServers((e) => {
      assert.strictEqual(e.length, 1);
      updateCount++;
      resolve();
    })));
    const updatedSandbox = {
      network: { allowedDomains: ["changed.example.com"] }
    };
    await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
      sandbox: updatedSandbox,
      servers: {
        test: {
          type: "stdio",
          command: "node",
          sandboxEnabled: true
        }
      }
    }, null, "	")));
    await service.reload();
    await updatePromise;
    const updated = await service.getInstalled();
    assert.strictEqual(updateCount, 1);
    assert.deepStrictEqual(updated[0].rootSandbox, updatedSandbox);
  });
  test("propagates the gallery source when loading an installed server", async () => {
    const gallery = createGallery();
    const installPromise = Event.toPromise(service.onDidInstallMcpServers);
    await service.reload(gallery);
    const result = await installPromise;
    assert.strictEqual(result[0].source, gallery);
  });
  test("updateMetadata propagates the gallery source when updating an installed server", async () => {
    const galleryResource = URI.from({ scheme: Schemas.inMemory, path: "/gallery-mcp.json" });
    await fileService.writeFile(galleryResource, VSBuffer.fromString(JSON.stringify({
      servers: {
        test: {
          type: "stdio",
          command: "node",
          gallery: true,
          version: "1.0.0"
        }
      }
    }, null, "	")));
    const gallery = createGallery();
    const galleryService = disposables.add(new McpUserResourceManagementService(
      galleryResource,
      upcastPartial({}),
      fileService,
      uriIdentityService,
      new NullLogService(),
      scannerService,
      { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true },
      upcastPartial({ userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: "/user" }) })
    ));
    const [local] = await galleryService.getInstalled();
    const updatePromise = Event.toPromise(galleryService.onDidUpdateMcpServers);
    await galleryService.updateMetadata(local, gallery);
    const result = await updatePromise;
    assert.strictEqual(result[0].source, gallery);
  });
  test("missing gallery metadata cache is not logged as an error", async () => {
    const galleryResource = URI.from({ scheme: Schemas.inMemory, path: "/missing-gallery-metadata-mcp.json" });
    await fileService.writeFile(galleryResource, VSBuffer.fromString(JSON.stringify({
      servers: {
        test: {
          type: "stdio",
          command: "node",
          gallery: true,
          version: "1.0.0"
        }
      }
    }, null, "	")));
    const logService = new TestLogService();
    const galleryService = disposables.add(new McpUserResourceManagementService(
      galleryResource,
      upcastPartial({}),
      fileService,
      uriIdentityService,
      logService,
      scannerService,
      { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true },
      upcastPartial({ userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: "/user" }) })
    ));
    const installed = await galleryService.getInstalled();
    assert.deepStrictEqual({
      installed: installed.map((server) => ({ name: server.name, version: server.version, location: server.location })),
      errors: logService.errors
    }, {
      installed: [{ name: "test", version: "1.0.0", location: void 0 }],
      errors: []
    });
  });
});
suite("McpResourceManagementService - install policy enforcement", () => {
  const mcpResource = URI.from({ scheme: Schemas.inMemory, path: "/mcp-policy.json" });
  let disposables;
  let fileService;
  let uriIdentityService;
  let scannerService;
  const server = { name: "my-server", config: { type: McpServerType.LOCAL, command: "node", args: [] } };
  function createService(isAllowed) {
    const allowedMcpServersService = { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed, isServerAllowed: () => true };
    return disposables.add(new TestMcpResourceManagementService(mcpResource, fileService, uriIdentityService, scannerService, allowedMcpServersService));
  }
  setup(() => {
    disposables = new DisposableStore();
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    uriIdentityService = disposables.add(new UriIdentityService(fileService));
    scannerService = disposables.add(new McpResourceScannerService(fileService, uriIdentityService));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("install throws and does not persist a server blocked by policy", async () => {
    const service = createService(() => new MarkdownString("This mcp server is blocked by your organization."));
    await assert.rejects(() => service.install(server), /blocked by your organization/);
    assert.strictEqual((await service.getInstalled()).find((s) => s.name === server.name), void 0);
  });
  test("install persists a server allowed by policy", async () => {
    const service = createService(() => true);
    const local = await service.install(server);
    assert.strictEqual(local.name, server.name);
    assert.ok((await service.getInstalled()).some((s) => s.name === server.name));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFx0ZXN0XFxjb21tb25cXG1jcE1hbmFnZW1lbnRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEFic3RyYWN0Q29tbW9uTWNwTWFuYWdlbWVudFNlcnZpY2UsIEFic3RyYWN0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSwgTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2FsbGVyeU1jcFNlcnZlclN0YXR1cywgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgSUdhbGxlcnlNY3BTZXJ2ZXIsIElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSUluc3RhbGxhYmxlTWNwU2VydmVyLCBJTG9jYWxNY3BTZXJ2ZXIsIElNY3BHYWxsZXJ5U2VydmljZSwgSW5zdGFsbE9wdGlvbnMsIFJlZ2lzdHJ5VHlwZSwgVHJhbnNwb3J0VHlwZSwgVW5pbnN0YWxsT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgTWNwU2VydmVyVHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLCBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5cbmNsYXNzIFRlc3RMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuZXJyb3JzLnB1c2goW21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdE1jcE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RDb21tb25NY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0b3ZlcnJpZGUgb25JbnN0YWxsTWNwU2VydmVyID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgb25EaWRJbnN0YWxsTWNwU2VydmVycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIG9uRGlkVXBkYXRlTWNwU2VydmVycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIG9uVW5pbnN0YWxsTWNwU2VydmVyID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSBFdmVudC5Ob25lO1xuXG5cdG92ZXJyaWRlIGdldEluc3RhbGxlZChtY3BSZXNvdXJjZT86IFVSSSk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyW10+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0b3ZlcnJpZGUgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0b3ZlcnJpZGUgaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdG92ZXJyaWRlIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXIsIHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbj86IFVSSSk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdG92ZXJyaWRlIHVuaW5zdGFsbChzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRvdmVycmlkZSBjYW5JbnN0YWxsKHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIgfCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKG1jcFJlc291cmNlOiBVUkksIGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlOiBVcmlJZGVudGl0eVNlcnZpY2UsIG1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U6IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsIGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBvbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzOiBFdmVudC5Ob25lLCBpc0FsbG93ZWQ6ICgpID0+IHRydWUsIGlzU2VydmVyQWxsb3dlZDogKCkgPT4gdHJ1ZSB9KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRtY3BSZXNvdXJjZSxcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdHt9IGFzIElNY3BHYWxsZXJ5U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdFx0YWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmVsb2FkKHNvdXJjZT86IElHYWxsZXJ5TWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlTG9jYWwoc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkluc3RhbGwoX3NlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIgfCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMb2NhbFNlcnZlckluZm8oX25hbWU6IHN0cmluZywgX21jcFNlcnZlckNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5zdGFsbEZyb21VcmkoX3VyaTogVVJJKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGluc3RhbGxGcm9tR2FsbGVyeShfc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgX29wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVNZXRhZGF0YShfbG9jYWw6IElMb2NhbE1jcFNlcnZlciwgX3NlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG59XG5cbnN1aXRlKCdNY3BNYW5hZ2VtZW50U2VydmljZSAtIGdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QnLCAoKSA9PiB7XG5cdGxldCBzZXJ2aWNlOiBUZXN0TWNwTWFuYWdlbWVudFNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgVGVzdE1jcE1hbmFnZW1lbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnTlBNIFBhY2thZ2UgVGVzdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWMgTlBNIHBhY2thZ2UgY29uZmlndXJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZXJ2ZXItYnJhdmUtc2VhcmNoJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMicsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQlJBVkVfQVBJX0tFWScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3Rlc3Qta2V5J1xuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICducHgnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWJyYXZlLXNlYXJjaEAxLjAuMiddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB7ICdCUkFWRV9BUElfS0VZJzogJ3Rlc3Qta2V5JyB9KTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdOUE0gcGFja2FnZSB3aXRoIGN1c3RvbSByZWdpc3RyeSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdHJlZ2lzdHJ5QmFzZVVybDogJ2h0dHBzOi8vY3VzdG9tLXJlZ2lzdHJ5LmV4YW1wbGUuY29tJyxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnQGNvbXBhbnkvaW50ZXJuYWwtcGFja2FnZScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMi4xLjAnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICducHgnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCctLXJlZ2lzdHJ5JywgJ2h0dHBzOi8vY3VzdG9tLXJlZ2lzdHJ5LmV4YW1wbGUuY29tJyxcblx0XHRcdFx0XHQnQGNvbXBhbnkvaW50ZXJuYWwtcGFja2FnZUAyLjEuMCdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdOUE0gcGFja2FnZSB3aXRob3V0IHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvZXZlcnl0aGluZycsXG5cdFx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAnbnB4Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsnQG1vZGVsY29udGV4dHByb3RvY29sL2V2ZXJ5dGhpbmcnXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdOUE0gcGFja2FnZSB3aXRoIGVudmlyb25tZW50IHZhcmlhYmxlcyBjb250YWluaW5nIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQVBJX0tFWScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ2tleS17YXBpX3Rva2VufScsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0YXBpX3Rva2VuOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdZb3VyIEFQSSB0b2tlbicsXG5cdFx0XHRcdFx0XHRcdFx0aXNTZWNyZXQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmVudiwgeyAnQVBJX0tFWSc6ICdrZXktJHtpbnB1dDphcGlfdG9rZW59JyB9KTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uaWQsICdhcGlfdG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5kZXNjcmlwdGlvbiwgJ1lvdXIgQVBJIHRva2VuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ucGFzc3dvcmQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW52aXJvbm1lbnQgdmFyaWFibGUgd2l0aCBlbXB0eSB2YWx1ZSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlIChHaXRIdWIgaXNzdWUgIzI2NjEwNiknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZXJ2ZXItYnJhdmUtc2VhcmNoJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjInLFxuXHRcdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ0JSQVZFX0FQSV9LRVknLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICcnLCAvLyBFbXB0eSB2YWx1ZSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0JyYXZlIFNlYXJjaCBBUEkgS2V5Jyxcblx0XHRcdFx0XHRcdGlzUmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpc1NlY3JldDogdHJ1ZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0Ly8gQlVHOiBDdXJyZW50bHkgdGhpcyBjcmVhdGVzIGVudiB3aXRoIGVtcHR5IHN0cmluZyBpbnN0ZWFkIG9mIGlucHV0IHZhcmlhYmxlXG5cdFx0XHQvLyBTaG91bGQgY3JlYXRlIGFuIGlucHV0IHZhcmlhYmxlIHNpbmNlIG5vIG1lYW5pbmdmdWwgdmFsdWUgaXMgcHJvdmlkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uaWQsICdCUkFWRV9BUElfS0VZJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uZGVzY3JpcHRpb24sICdCcmF2ZSBTZWFyY2ggQVBJIEtleScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnBhc3N3b3JkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblxuXHRcdFx0Ly8gRW52aXJvbm1lbnQgc2hvdWxkIHVzZSBpbnB1dCB2YXJpYWJsZSBpbnRlcnBvbGF0aW9uXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB7ICdCUkFWRV9BUElfS0VZJzogJyR7aW5wdXQ6QlJBVkVfQVBJX0tFWX0nIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW52aXJvbm1lbnQgdmFyaWFibGUgd2l0aCBjaG9pY2VzIGJ1dCBlbXB0eSB2YWx1ZSBzaG91bGQgY3JlYXRlIHBpY2sgaW5wdXQgKEdpdEh1YiBpc3N1ZSAjMjY2MTA2KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnU1NMX01PREUnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICcnLCAvLyBFbXB0eSB2YWx1ZSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NTTCBjb25uZWN0aW9uIG1vZGUnLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ3ByZWZlcicsXG5cdFx0XHRcdFx0XHRjaG9pY2VzOiBbJ2Rpc2FibGUnLCAncHJlZmVyJywgJ3JlcXVpcmUnXVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0Ly8gQlVHOiBDdXJyZW50bHkgdGhpcyBjcmVhdGVzIGVudiB3aXRoIGVtcHR5IHN0cmluZyBpbnN0ZWFkIG9mIGlucHV0IHZhcmlhYmxlXG5cdFx0XHQvLyBTaG91bGQgY3JlYXRlIGEgcGljayBpbnB1dCB2YXJpYWJsZSBzaW5jZSBjaG9pY2VzIGFyZSBwcm92aWRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5pZCwgJ1NTTF9NT0RFJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uZGVzY3JpcHRpb24sICdTU0wgY29ubmVjdGlvbiBtb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uZGVmYXVsdCwgJ3ByZWZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QSUNLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ub3B0aW9ucywgWydkaXNhYmxlJywgJ3ByZWZlcicsICdyZXF1aXJlJ10pO1xuXG5cdFx0XHQvLyBFbnZpcm9ubWVudCBzaG91bGQgdXNlIGlucHV0IHZhcmlhYmxlIGludGVycG9sYXRpb25cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHsgJ1NTTF9NT0RFJzogJyR7aW5wdXQ6U1NMX01PREV9JyB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ05QTSBwYWNrYWdlIHdpdGggcGFja2FnZSBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3NueWsnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjEyOTguMCcsXG5cdFx0XHRcdFx0cGFja2FnZUFyZ3VtZW50czogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAncG9zaXRpb25hbCcsIHZhbHVlOiAnbWNwJywgdmFsdWVIaW50OiAnY29tbWFuZCcsIGlzUmVwZWF0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHRcdG5hbWU6ICctdCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiAnc3RkaW8nLFxuXHRcdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsnc255a0AxLjEyOTguMCcsICdtY3AnLCAnLXQnLCAnc3RkaW8nXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQeXRob24gUGFja2FnZSBUZXN0cycsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyBQeXRob24gcGFja2FnZSBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuUFlUSE9OLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3dlYXRoZXItbWNwLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzAuNS4wJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdXRUFUSEVSX0FQSV9LRVknLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICd0ZXN0LWtleSdcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnV0VBVEhFUl9VTklUUycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ2NlbHNpdXMnXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlBZVEhPTik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAndXZ4Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsnd2VhdGhlci1tY3Atc2VydmVyQDAuNS4wJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHtcblx0XHRcdFx0XHQnV0VBVEhFUl9BUElfS0VZJzogJ3Rlc3Qta2V5Jyxcblx0XHRcdFx0XHQnV0VBVEhFUl9VTklUUyc6ICdjZWxzaXVzJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ1B5dGhvbiBwYWNrYWdlIHdpdGggY3VzdG9tIHJlZ2lzdHJ5IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLlBZVEhPTixcblx0XHRcdFx0XHRyZWdpc3RyeUJhc2VVcmw6ICdodHRwczovL2N1c3RvbS1weXBpLmV4YW1wbGUuY29tL3NpbXBsZScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnaW50ZXJuYWwtcHl0aG9uLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMi4zJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuUFlUSE9OKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICd1dngnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCctLWluZGV4LXVybCcsICdodHRwczovL2N1c3RvbS1weXBpLmV4YW1wbGUuY29tL3NpbXBsZScsXG5cdFx0XHRcdFx0J2ludGVybmFsLXB5dGhvbi1zZXJ2ZXJAMS4yLjMnXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUHl0aG9uIHBhY2thZ2Ugd2l0aG91dCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuUFlUSE9OLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3dlYXRoZXItbWNwLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJydcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlBZVEhPTik7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJ3dlYXRoZXItbWNwLXNlcnZlciddKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RvY2tlciBQYWNrYWdlIFRlc3RzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIERvY2tlciBwYWNrYWdlIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5ET0NLRVIsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnbWNwL2ZpbGVzeXN0ZW0nLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMicsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHRuYW1lOiAnLS1tb3VudCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3R5cGU9YmluZCxzcmM9L2hvc3QvcGF0aCxkc3Q9L2NvbnRhaW5lci9wYXRoJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnTE9HX0xFVkVMJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAnaW5mbydcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICcvcHJvamVjdCcsXG5cdFx0XHRcdFx0XHR2YWx1ZUhpbnQ6ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICdkb2NrZXInKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdydW4nLCAnLWknLCAnLS1ybScsXG5cdFx0XHRcdFx0Jy0tbW91bnQnLCAndHlwZT1iaW5kLHNyYz0vaG9zdC9wYXRoLGRzdD0vY29udGFpbmVyL3BhdGgnLFxuXHRcdFx0XHRcdCctZScsICdMT0dfTEVWRUwnLFxuXHRcdFx0XHRcdCdtY3AvZmlsZXN5c3RlbToxLjAuMicsXG5cdFx0XHRcdFx0Jy9wcm9qZWN0J1xuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB7ICdMT0dfTEVWRUwnOiAnaW5mbycgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdEb2NrZXIgcGFja2FnZSB3aXRoIGN1c3RvbSByZWdpc3RyeSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5ET0NLRVIsXG5cdFx0XHRcdFx0cmVnaXN0cnlCYXNlVXJsOiAncmVnaXN0cnkuY29tcGFueS5jb20nLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2ludGVybmFsL21jcC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICczLjIuMSdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLkRPQ0tFUik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAnZG9ja2VyJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQncnVuJywgJy1pJywgJy0tcm0nLFxuXHRcdFx0XHRcdCdyZWdpc3RyeS5jb21wYW55LmNvbS9pbnRlcm5hbC9tY3Atc2VydmVyOjMuMi4xJ1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0RvY2tlciBwYWNrYWdlIHdpdGggdmFyaWFibGVzIGluIHJ1bnRpbWUgYXJndW1lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuRE9DS0VSLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2V4YW1wbGUvZGF0YWJhc2UtbWFuYWdlci1tY3AnLFxuXHRcdFx0XHRcdHZlcnNpb246ICczLjEuMCcsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHRuYW1lOiAnLWUnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdEQl9UWVBFPXtkYl90eXBlfScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRkYl90eXBlOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUeXBlIG9mIGRhdGFiYXNlJyxcblx0XHRcdFx0XHRcdFx0XHRjaG9pY2VzOiBbJ3Bvc3RncmVzJywgJ215c3FsJywgJ21vbmdvZGInLCAncmVkaXMnXSxcblx0XHRcdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0J3J1bicsICctaScsICctLXJtJyxcblx0XHRcdFx0XHQnLWUnLCAnREJfVFlQRT0ke2lucHV0OmRiX3R5cGV9Jyxcblx0XHRcdFx0XHQnZXhhbXBsZS9kYXRhYmFzZS1tYW5hZ2VyLW1jcDozLjEuMCdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmlkLCAnZGJfdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QSUNLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ub3B0aW9ucywgWydwb3N0Z3JlcycsICdteXNxbCcsICdtb25nb2RiJywgJ3JlZGlzJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRG9ja2VyIHBhY2thZ2UgYXJndW1lbnRzIHdpdGhvdXQgdmFsdWVzIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVzIChHaXRIdWIgaXNzdWUgIzI2NjEwNiknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5ET0NLRVIsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXhhbXBsZS9kYXRhYmFzZS1tYW5hZ2VyLW1jcCcsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzMuMS4wJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctLWhvc3QnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXRhYmFzZSBob3N0Jyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdsb2NhbGhvc3QnLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0XHQvLyBOb3RlOiBObyAndmFsdWUnIGZpZWxkIC0gc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwb3NpdGlvbmFsJyxcblx0XHRcdFx0XHRcdHZhbHVlSGludDogJ2RhdGFiYXNlX25hbWUnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBkYXRhYmFzZSB0byBjb25uZWN0IHRvJyxcblx0XHRcdFx0XHRcdGlzUmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdFx0Ly8gTm90ZTogTm8gJ3ZhbHVlJyBmaWVsZCAtIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0Ly8gQlVHOiBDdXJyZW50bHkgbmFtZWQgYXJncyB3aXRob3V0IHZhbHVlIGFyZSBpZ25vcmVkLCBwb3NpdGlvbmFsIHVzZXMgdmFsdWVfaGludCBhcyBsaXRlcmFsXG5cdFx0XHQvLyBTaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlcyBmb3IgYm90aCBhcmd1bWVudHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMik7XG5cblx0XHRcdGNvbnN0IGhvc3RJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3RJbnB1dD8uZGVzY3JpcHRpb24sICdEYXRhYmFzZSBob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdElucHV0Py5kZWZhdWx0LCAnbG9jYWxob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdElucHV0Py50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblxuXHRcdFx0Y29uc3QgZGJOYW1lSW5wdXQgPSByZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LmZpbmQoKGk6IElNY3BTZXJ2ZXJWYXJpYWJsZSkgPT4gaS5pZCA9PT0gJ2RhdGFiYXNlX25hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYk5hbWVJbnB1dD8uZGVzY3JpcHRpb24sICdOYW1lIG9mIHRoZSBkYXRhYmFzZSB0byBjb25uZWN0IHRvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGJOYW1lSW5wdXQ/LnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXG5cdFx0XHQvLyBBcmdzIHNob3VsZCB1c2UgaW5wdXQgdmFyaWFibGUgaW50ZXJwb2xhdGlvblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQncnVuJywgJy1pJywgJy0tcm0nLFxuXHRcdFx0XHRcdCdleGFtcGxlL2RhdGFiYXNlLW1hbmFnZXItbWNwOjMuMS4wJyxcblx0XHRcdFx0XHQnLS1ob3N0JywgJyR7aW5wdXQ6aG9zdH0nLFxuXHRcdFx0XHRcdCcke2lucHV0OmRhdGFiYXNlX25hbWV9J1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0RvY2tlciBIdWIgYmFja3dhcmQgY29tcGF0aWJpbGl0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLkRPQ0tFUixcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXhhbXBsZS90ZXN0LWltYWdlJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLkRPQ0tFUik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAnZG9ja2VyJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQncnVuJywgJy1pJywgJy0tcm0nLFxuXHRcdFx0XHRcdCdleGFtcGxlL3Rlc3QtaW1hZ2U6MS4wLjAnXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTnVHZXQgUGFja2FnZSBUZXN0cycsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyBOdUdldCBwYWNrYWdlIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OVUdFVCxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdLbmFwY29kZS5TYW1wbGVNY3BTZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcwLjUuMCcsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnV0VBVEhFUl9DSE9JQ0VTJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAnc3VubnksY2xvdWR5LHJhaW55J1xuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OVUdFVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAnZG54Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsnS25hcGNvZGUuU2FtcGxlTWNwU2VydmVyQDAuNS4wJywgJy0teWVzJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHsgJ1dFQVRIRVJfQ0hPSUNFUyc6ICdzdW5ueSxjbG91ZHkscmFpbnknIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnTnVHZXQgcGFja2FnZSB3aXRoIGN1c3RvbSByZWdpc3RyeSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OVUdFVCxcblx0XHRcdFx0XHRyZWdpc3RyeUJhc2VVcmw6ICdodHRwczovL251Z2V0LmNvbXBhbnkuY29tL3YzL2luZGV4Lmpzb24nLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0NvbXBhbnkuSW50ZXJuYWwuTWNwU2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnNC41LjYnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OVUdFVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5jb21tYW5kLCAnZG54Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQnQ29tcGFueS5JbnRlcm5hbC5NY3BTZXJ2ZXJANC41LjYnLFxuXHRcdFx0XHRcdCctLXllcycsXG5cdFx0XHRcdFx0Jy0tc291cmNlJywgJ2h0dHBzOi8vbnVnZXQuY29tcGFueS5jb20vdjMvaW5kZXguanNvbidcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdOdUdldCBwYWNrYWdlIHdpdGggcGFja2FnZSBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OVUdFVCxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdLbmFwY29kZS5TYW1wbGVNY3BTZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcwLjQuMC1iZXRhJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdtY3AnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwb3NpdGlvbmFsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAnc3RhcnQnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAnYWN0aW9uJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5VR0VUKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQnS25hcGNvZGUuU2FtcGxlTWNwU2VydmVyQDAuNC4wLWJldGEnLFxuXHRcdFx0XHRcdCctLXllcycsXG5cdFx0XHRcdFx0Jy0tJyxcblx0XHRcdFx0XHQnbWNwJyxcblx0XHRcdFx0XHQnc3RhcnQnXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmVtb3RlIFNlcnZlciBUZXN0cycsICgpID0+IHtcblx0XHR0ZXN0KCdTU0UgcmVtb3RlIHNlcnZlciBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cmVtb3RlczogW3tcblx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNTRSxcblx0XHRcdFx0XHR1cmw6ICdodHRwOi8vbWNwLWZzLmFub255bW91cy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9zc2UnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5SRU1PVEUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5SRU1PVEUpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy51cmwsICdodHRwOi8vbWNwLWZzLmFub255bW91cy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9zc2UnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5oZWFkZXJzLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU1NFIHJlbW90ZSBzZXJ2ZXIgd2l0aCBoZWFkZXJzIGFuZCB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRyZW1vdGVzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRyYW5zcG9ydFR5cGUuU1NFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vbWNwLmFub255bW91cy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9zc2UnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnWC1BUEktS2V5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiAne2FwaV9rZXl9Jyxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRhcGlfa2V5OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBUEkga2V5IGZvciBhdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRpc1NlY3JldDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0bmFtZTogJ1gtUmVnaW9uJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAndXMtZWFzdC0xJ1xuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5SRU1PVEUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5SRU1PVEUpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuaGVhZGVycywge1xuXHRcdFx0XHRcdCdYLUFQSS1LZXknOiAnJHtpbnB1dDphcGlfa2V5fScsXG5cdFx0XHRcdFx0J1gtUmVnaW9uJzogJ3VzLWVhc3QtMSdcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmlkLCAnYXBpX2tleScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnBhc3N3b3JkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmVhbWFibGUgSFRUUCByZW1vdGUgc2VydmVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cmVtb3RlczogW3tcblx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNUUkVBTUFCTEVfSFRUUCxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL21jcC5hbm9ueW1vdXMubW9kZWxjb250ZXh0cHJvdG9jb2wuaW8vaHR0cCdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlJFTU9URSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnVybCwgJ2h0dHBzOi8vbWNwLmFub255bW91cy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9odHRwJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdGUgaGVhZGVycyB3aXRob3V0IHZhbHVlcyBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHJlbW90ZXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogVHJhbnNwb3J0VHlwZS5TU0UsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vbWNwJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ0F1dGhvcml6YXRpb24nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBUEkgdG9rZW4gZm9yIGF1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRcdGlzU2VjcmV0OiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0Ly8gTm90ZTogTm8gJ3ZhbHVlJyBmaWVsZCAtIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnWC1DdXN0b20tSGVhZGVyJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ3VzdG9tIGhlYWRlciB2YWx1ZScsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdC12YWx1ZScsXG5cdFx0XHRcdFx0XHRjaG9pY2VzOiBbJ29wdGlvbjEnLCAnb3B0aW9uMicsICdvcHRpb24zJ11cblx0XHRcdFx0XHRcdC8vIE5vdGU6IE5vICd2YWx1ZScgZmllbGQgLSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlIHdpdGggY2hvaWNlc1xuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5SRU1PVEUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5SRU1PVEUpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy51cmwsICdodHRwczovL2FwaS5leGFtcGxlLmNvbS9tY3AnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuaGVhZGVycywge1xuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogJyR7aW5wdXQ6QXV0aG9yaXphdGlvbn0nLFxuXHRcdFx0XHRcdCdYLUN1c3RvbS1IZWFkZXInOiAnJHtpbnB1dDpYLUN1c3RvbS1IZWFkZXJ9J1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZXMgZm9yIGhlYWRlcnMgd2l0aG91dCB2YWx1ZXNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMik7XG5cblx0XHRcdGNvbnN0IGF1dGhJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnQXV0aG9yaXphdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhJbnB1dD8uZGVzY3JpcHRpb24sICdBUEkgdG9rZW4gZm9yIGF1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aElucHV0Py5wYXNzd29yZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aElucHV0Py50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblxuXHRcdFx0Y29uc3QgY3VzdG9tSW5wdXQgPSByZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LmZpbmQoKGk6IElNY3BTZXJ2ZXJWYXJpYWJsZSkgPT4gaS5pZCA9PT0gJ1gtQ3VzdG9tLUhlYWRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbUlucHV0Py5kZXNjcmlwdGlvbiwgJ0N1c3RvbSBoZWFkZXIgdmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21JbnB1dD8uZGVmYXVsdCwgJ2RlZmF1bHQtdmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21JbnB1dD8udHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLlBJQ0spO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21JbnB1dD8ub3B0aW9ucywgWydvcHRpb24xJywgJ29wdGlvbjInLCAnb3B0aW9uMyddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1ZhcmlhYmxlIEludGVycG9sYXRpb24gVGVzdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbXVsdGlwbGUgdmFyaWFibGVzIGluIHNpbmdsZSB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQ09OTkVDVElPTl9TVFJJTkcnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdzZXJ2ZXI9e2hvc3R9O3BvcnQ9e3BvcnR9O2RhdGFiYXNlPXtkYl9uYW1lfScsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0aG9zdDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgaG9zdCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2xvY2FsaG9zdCdcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cG9ydDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgcG9ydCcsXG5cdFx0XHRcdFx0XHRcdFx0Zm9ybWF0OiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnNTQzMidcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGJfbmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgbmFtZScsXG5cdFx0XHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB7XG5cdFx0XHRcdFx0J0NPTk5FQ1RJT05fU1RSSU5HJzogJ3NlcnZlcj0ke2lucHV0Omhvc3R9O3BvcnQ9JHtpbnB1dDpwb3J0fTtkYXRhYmFzZT0ke2lucHV0OmRiX25hbWV9J1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMyk7XG5cblx0XHRcdGNvbnN0IGhvc3RJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3RJbnB1dD8uZGVmYXVsdCwgJ2xvY2FsaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3RJbnB1dD8udHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLlBST01QVCk7XG5cblx0XHRcdGNvbnN0IHBvcnRJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAncG9ydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvcnRJbnB1dD8uZGVmYXVsdCwgJzU0MzInKTtcblxuXHRcdFx0Y29uc3QgZGJOYW1lSW5wdXQgPSByZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LmZpbmQoKGk6IElNY3BTZXJ2ZXJWYXJpYWJsZSkgPT4gaS5pZCA9PT0gJ2RiX25hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYk5hbWVJbnB1dD8uZGVzY3JpcHRpb24sICdEYXRhYmFzZSBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YXJpYWJsZSB3aXRoIGNob2ljZXMgY3JlYXRlcyBwaWNrIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRydW50aW1lQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctLWxvZy1sZXZlbCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3tsZXZlbH0nLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0bGV2ZWw6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0xvZyBsZXZlbCcsXG5cdFx0XHRcdFx0XHRcdFx0Y2hvaWNlczogWydkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnaW5mbydcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLm9wdGlvbnMsIFsnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmRlZmF1bHQsICdpbmZvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YXJpYWJsZXMgaW4gcGFja2FnZSBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5ET0NLRVIsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3QtaW1hZ2UnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctLWhvc3QnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICd7ZGJfaG9zdH0nLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0ZGJfaG9zdDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgaG9zdCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2xvY2FsaG9zdCdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwb3NpdGlvbmFsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAne2RhdGFiYXNlX25hbWV9Jyxcblx0XHRcdFx0XHRcdHZhbHVlSGludDogJ2RhdGFiYXNlX25hbWUnLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0ZGF0YWJhc2VfbmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgZGF0YWJhc2UgdG8gY29ubmVjdCB0bycsXG5cdFx0XHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLkRPQ0tFUik7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0J3J1bicsICctaScsICctLXJtJyxcblx0XHRcdFx0XHQndGVzdC1pbWFnZToxLjAuMCcsXG5cdFx0XHRcdFx0Jy0taG9zdCcsICcke2lucHV0OmRiX2hvc3R9Jyxcblx0XHRcdFx0XHQnJHtpbnB1dDpkYXRhYmFzZV9uYW1lfSdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncG9zaXRpb25hbCBhcmd1bWVudHMgd2l0aCB2YWx1ZV9oaW50IHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVzIChHaXRIdWIgaXNzdWUgIzI2NjEwNiknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdAZXhhbXBsZS9tYXRoLXRvb2wnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzIuMC4xJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAnY2FsY3VsYXRpb25fdHlwZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1R5cGUgb2YgY2FsY3VsYXRpb24gdG8gZW5hYmxlJyxcblx0XHRcdFx0XHRcdGlzUmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdFx0Ly8gTm90ZTogTm8gJ3ZhbHVlJyBmaWVsZCwgb25seSB2YWx1ZV9oaW50IC0gc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0Ly8gQlVHOiBDdXJyZW50bHkgdmFsdWVfaGludCBpcyB1c2VkIGFzIGxpdGVyYWwgdmFsdWUgaW5zdGVhZCBvZiBjcmVhdGluZyBpbnB1dCB2YXJpYWJsZVxuXHRcdFx0Ly8gU2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZSBpbnN0ZWFkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmlkLCAnY2FsY3VsYXRpb25fdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmRlc2NyaXB0aW9uLCAnVHlwZSBvZiBjYWxjdWxhdGlvbiB0byBlbmFibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblxuXHRcdFx0Ly8gQXJncyBzaG91bGQgdXNlIGlucHV0IHZhcmlhYmxlIGludGVycG9sYXRpb25cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0J0BleGFtcGxlL21hdGgtdG9vbEAyLjAuMScsXG5cdFx0XHRcdFx0JyR7aW5wdXQ6Y2FsY3VsYXRpb25fdHlwZX0nXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRWRnZSBDYXNlcyBhbmQgRXJyb3IgSGFuZGxpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZW1wdHkgbWFuaWZlc3Qgc2hvdWxkIHRocm93IGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHt9O1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0c2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cdFx0XHR9LCAvTm8gc2VydmVyIHBhY2thZ2UgZm91bmQvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hbmlmZXN0IHdpdGggbm8gbWF0Y2hpbmcgcGFja2FnZSB0eXBlIHNob3VsZCB1c2UgZmlyc3QgcGFja2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLlBZVEhPTixcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdweXRob24tc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICd1dngnKTsgLy8gUHl0aG9uIGNvbW1hbmQgc2luY2UgdGhhdCdzIHRoZSBwYWNrYWdlIHR5cGVcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydweXRob24tc2VydmVyQDEuMC4wJ10pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuaWZlc3Qgd2l0aCBtYXRjaGluZyBwYWNrYWdlIHR5cGUgc2hvdWxkIHVzZSB0aGF0IHBhY2thZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5QWVRIT04sXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAncHl0aG9uLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJ1xuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdub2RlLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzIuMC4wJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICducHgnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydub2RlLXNlcnZlckAyLjAuMCddKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZGVmaW5lZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgc2hvdWxkIGJlIG9taXR0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmFtZWQgYXJndW1lbnQgd2l0aG91dCB2YWx1ZSBzaG91bGQgb25seSBhZGQgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHRuYW1lOiAnLS12ZXJib3NlJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWyctLXZlcmJvc2UnLCAndGVzdC1zZXJ2ZXJAMS4wLjAnXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwb3NpdGlvbmFsIGFyZ3VtZW50IHdpdGggdW5kZWZpbmVkIHZhbHVlIHNob3VsZCB1c2UgdmFsdWVfaGludCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0cGFja2FnZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICdwb3NpdGlvbmFsJyxcblx0XHRcdFx0XHRcdHZhbHVlSGludDogJ3RhcmdldF9kaXJlY3RvcnknLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJ3Rlc3Qtc2VydmVyQDEuMC4wJywgJ3RhcmdldF9kaXJlY3RvcnknXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lZCBhcmd1bWVudCB3aXRoIG5vIG5hbWUgc2hvdWxkIGdlbmVyYXRlIG5vdGljZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdHJ1bnRpbWVBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbmFtZWQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdzb21lLXZhbHVlJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCBhcyBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGdlbmVyYXRlIGEgbm90aWNlIGFib3V0IHRoZSBtaXNzaW5nIG5hbWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubm90aWNlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ub3RpY2VzWzBdLmluY2x1ZGVzKCdOYW1lZCBhcmd1bWVudCBpcyBtaXNzaW5nIGEgbmFtZScpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubm90aWNlc1swXS5pbmNsdWRlcygnc29tZS12YWx1ZScpKTsgLy8gU2hvdWxkIGluY2x1ZGUgdGhlIGFyZ3VtZW50IGRldGFpbHMgaW4gSlNPTiBmb3JtYXRcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsndGVzdC1zZXJ2ZXJAMS4wLjAnXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lZCBhcmd1bWVudCB3aXRoIGVtcHR5IG5hbWUgc2hvdWxkIGdlbmVyYXRlIG5vdGljZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHRuYW1lOiAnJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAnc29tZS12YWx1ZScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGdlbmVyYXRlIGEgbm90aWNlIGFib3V0IHRoZSBtaXNzaW5nIG5hbWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubm90aWNlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ub3RpY2VzWzBdLmluY2x1ZGVzKCdOYW1lZCBhcmd1bWVudCBpcyBtaXNzaW5nIGEgbmFtZScpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubm90aWNlc1swXS5pbmNsdWRlcygnc29tZS12YWx1ZScpKTsgLy8gU2hvdWxkIGluY2x1ZGUgdGhlIGFyZ3VtZW50IGRldGFpbHMgaW4gSlNPTiBmb3JtYXRcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsndGVzdC1zZXJ2ZXJAMS4wLjAnXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdWYXJpYWJsZSBQcm9jZXNzaW5nIE9yZGVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZXhwbGljaXQgdmFyaWFibGVzIGluc3RlYWQgb2YgYXV0by1nZW5lcmF0aW5nIHdoZW4gYm90aCBhcmUgcG9zc2libGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ0FQSV9LRVknLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdCZWFyZXIge2FwaV9rZXl9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvdWxkIG5vdCBiZSB1c2VkJywgLy8gVGhpcyBzaG91bGQgYmUgaWdub3JlZCBzaW5jZSB3ZSBoYXZlIGV4cGxpY2l0IHZhcmlhYmxlc1xuXHRcdFx0XHRcdFx0dmFyaWFibGVzOiB7XG5cdFx0XHRcdFx0XHRcdGFwaV9rZXk6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1lvdXIgQVBJIGtleScsXG5cdFx0XHRcdFx0XHRcdFx0aXNTZWNyZXQ6IHRydWVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5pZCwgJ2FwaV9rZXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5kZXNjcmlwdGlvbiwgJ1lvdXIgQVBJIGtleScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnBhc3N3b3JkLCB0cnVlKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52Py5bJ0FQSV9LRVknXSwgJ0JlYXJlciAke2lucHV0OmFwaV9rZXl9Jyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBtY3BSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21jcC5qc29uJyB9KTtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCB1cmlJZGVudGl0eVNlcnZpY2U6IFVyaUlkZW50aXR5U2VydmljZTtcblx0bGV0IHNjYW5uZXJTZXJ2aWNlOiBNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlO1xuXHRsZXQgc2VydmljZTogVGVzdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlR2FsbGVyeSgpOiBJR2FsbGVyeU1jcFNlcnZlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0aXNMYXRlc3Q6IHRydWUsXG5cdFx0XHRzdGF0dXM6IEdhbGxlcnlNY3BTZXJ2ZXJTdGF0dXMuQWN0aXZlLFxuXHRcdFx0Y29uZmlndXJhdGlvbjoge30sXG5cdFx0XHRwdWJsaXNoZXI6ICd0ZXN0Jyxcblx0XHR9O1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHR1cmlJZGVudGl0eVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVyaUlkZW50aXR5U2VydmljZShmaWxlU2VydmljZSkpO1xuXHRcdHNjYW5uZXJTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlKGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgc2Nhbm5lclNlcnZpY2UpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzYW5kYm94OiB7XG5cdFx0XHRcdG5ldHdvcms6IHsgYWxsb3dlZERvbWFpbnM6IFsnZXhhbXBsZS5jb20nXSB9XG5cdFx0XHR9LFxuXHRcdFx0c2VydmVyczoge1xuXHRcdFx0XHR0ZXN0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0c2FuZGJveEVuYWJsZWQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIG51bGwsICdcXHQnKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmaXJlcyB1cGRhdGUgd2hlbiByb290IHNhbmRib3ggY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbml0aWFsID0gYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5pdGlhbFswXS5yb290U2FuZGJveCwge1xuXHRcdFx0bmV0d29yazogeyBhbGxvd2VkRG9tYWluczogWydleGFtcGxlLmNvbSddIH1cblx0XHR9KTtcblxuXHRcdGxldCB1cGRhdGVDb3VudCA9IDA7XG5cdFx0Y29uc3QgdXBkYXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGUgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUubGVuZ3RoLCAxKTtcblx0XHRcdHVwZGF0ZUNvdW50Kys7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWRTYW5kYm94OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRuZXR3b3JrOiB7IGFsbG93ZWREb21haW5zOiBbJ2NoYW5nZWQuZXhhbXBsZS5jb20nXSB9XG5cdFx0fTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzYW5kYm94OiB1cGRhdGVkU2FuZGJveCxcblx0XHRcdHNlcnZlcnM6IHtcblx0XHRcdFx0dGVzdDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdHNhbmRib3hFbmFibGVkOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBudWxsLCAnXFx0JykpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21pc2U7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlQ291bnQsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlZFswXS5yb290U2FuZGJveCwgdXBkYXRlZFNhbmRib3gpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9wYWdhdGVzIHRoZSBnYWxsZXJ5IHNvdXJjZSB3aGVuIGxvYWRpbmcgYW4gaW5zdGFsbGVkIHNlcnZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnYWxsZXJ5ID0gY3JlYXRlR2FsbGVyeSgpO1xuXHRcdGNvbnN0IGluc3RhbGxQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRJbnN0YWxsTWNwU2VydmVycyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlbG9hZChnYWxsZXJ5KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YWxsUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uc291cmNlLCBnYWxsZXJ5KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlTWV0YWRhdGEgcHJvcGFnYXRlcyB0aGUgZ2FsbGVyeSBzb3VyY2Ugd2hlbiB1cGRhdGluZyBhbiBpbnN0YWxsZWQgc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdhbGxlcnlSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2dhbGxlcnktbWNwLmpzb24nIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShnYWxsZXJ5UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2VydmVyczoge1xuXHRcdFx0XHR0ZXN0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0Z2FsbGVyeTogdHJ1ZSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBudWxsLCAnXFx0JykpKTtcblx0XHRjb25zdCBnYWxsZXJ5ID0gY3JlYXRlR2FsbGVyeSgpO1xuXHRcdGNvbnN0IGdhbGxlcnlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNY3BVc2VyUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShcblx0XHRcdGdhbGxlcnlSZXNvdXJjZSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SU1jcEdhbGxlcnlTZXJ2aWNlPih7fSksXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0c2Nhbm5lclNlcnZpY2UsXG5cdFx0XHR7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgb25EaWRDaGFuZ2VBbGxvd2VkTWNwU2VydmVyczogRXZlbnQuTm9uZSwgaXNBbGxvd2VkOiAoKSA9PiB0cnVlLCBpc1NlcnZlckFsbG93ZWQ6ICgpID0+IHRydWUgfSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4oeyB1c2VyUm9hbWluZ0RhdGFIb21lOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy91c2VyJyB9KSB9KSxcblx0XHQpKTtcblx0XHRjb25zdCBbbG9jYWxdID0gYXdhaXQgZ2FsbGVyeVNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0Y29uc3QgdXBkYXRlUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShnYWxsZXJ5U2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMpO1xuXG5cdFx0YXdhaXQgZ2FsbGVyeVNlcnZpY2UudXBkYXRlTWV0YWRhdGEobG9jYWwsIGdhbGxlcnkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHVwZGF0ZVByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnNvdXJjZSwgZ2FsbGVyeSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pc3NpbmcgZ2FsbGVyeSBtZXRhZGF0YSBjYWNoZSBpcyBub3QgbG9nZ2VkIGFzIGFuIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdhbGxlcnlSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21pc3NpbmctZ2FsbGVyeS1tZXRhZGF0YS1tY3AuanNvbicgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGdhbGxlcnlSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzZXJ2ZXJzOiB7XG5cdFx0XHRcdHRlc3Q6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RkaW8nLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRnYWxsZXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIG51bGwsICdcXHQnKSkpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgVGVzdExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBnYWxsZXJ5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UoXG5cdFx0XHRnYWxsZXJ5UmVzb3VyY2UsXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElNY3BHYWxsZXJ5U2VydmljZT4oe30pLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHR1cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0c2Nhbm5lclNlcnZpY2UsXG5cdFx0XHR7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgb25EaWRDaGFuZ2VBbGxvd2VkTWNwU2VydmVyczogRXZlbnQuTm9uZSwgaXNBbGxvd2VkOiAoKSA9PiB0cnVlLCBpc1NlcnZlckFsbG93ZWQ6ICgpID0+IHRydWUgfSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4oeyB1c2VyUm9hbWluZ0RhdGFIb21lOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy91c2VyJyB9KSB9KSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnN0YWxsZWQ6IGluc3RhbGxlZC5tYXAoc2VydmVyID0+ICh7IG5hbWU6IHNlcnZlci5uYW1lLCB2ZXJzaW9uOiBzZXJ2ZXIudmVyc2lvbiwgbG9jYXRpb246IHNlcnZlci5sb2NhdGlvbiB9KSksXG5cdFx0XHRlcnJvcnM6IGxvZ1NlcnZpY2UuZXJyb3JzLFxuXHRcdH0sIHtcblx0XHRcdGluc3RhbGxlZDogW3sgbmFtZTogJ3Rlc3QnLCB2ZXJzaW9uOiAnMS4wLjAnLCBsb2NhdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0ZXJyb3JzOiBbXSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ01jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgLSBpbnN0YWxsIHBvbGljeSBlbmZvcmNlbWVudCcsICgpID0+IHtcblx0Y29uc3QgbWNwUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tY3AtcG9saWN5Lmpzb24nIH0pO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IHVyaUlkZW50aXR5U2VydmljZTogVXJpSWRlbnRpdHlTZXJ2aWNlO1xuXHRsZXQgc2Nhbm5lclNlcnZpY2U6IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U7XG5cblx0Y29uc3Qgc2VydmVyOiBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIgPSB7IG5hbWU6ICdteS1zZXJ2ZXInLCBjb25maWc6IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ25vZGUnLCBhcmdzOiBbXSB9IH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShpc0FsbG93ZWQ6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2VbJ2lzQWxsb3dlZCddKTogVGVzdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBvbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzOiBFdmVudC5Ob25lLCBpc0FsbG93ZWQsIGlzU2VydmVyQWxsb3dlZDogKCkgPT4gdHJ1ZSB9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBzY2FubmVyU2VydmljZSwgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlKSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHVyaUlkZW50aXR5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0c2Nhbm5lclNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UoZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbnN0YWxsIHRocm93cyBhbmQgZG9lcyBub3QgcGVyc2lzdCBhIHNlcnZlciBibG9ja2VkIGJ5IHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgoKSA9PiBuZXcgTWFya2Rvd25TdHJpbmcoJ1RoaXMgbWNwIHNlcnZlciBpcyBibG9ja2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uLicpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuaW5zdGFsbChzZXJ2ZXIpLCAvYmxvY2tlZCBieSB5b3VyIG9yZ2FuaXphdGlvbi8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKSkuZmluZChzID0+IHMubmFtZSA9PT0gc2VydmVyLm5hbWUpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnN0YWxsIHBlcnNpc3RzIGEgc2VydmVyIGFsbG93ZWQgYnkgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCgpID0+IHRydWUpO1xuXG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGwoc2VydmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwubmFtZSwgc2VydmVyLm5hbWUpO1xuXHRcdGFzc2VydC5vaygoYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKSkuc29tZShzID0+IHMubmFtZSA9PT0gc2VydmVyLm5hbWUpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQ0FBb0Msc0NBQXNDLHdDQUF3QztBQUMzSCxTQUFTLHdCQUFrTCxjQUFjLHFCQUF1QztBQUNoUCxTQUFtQyxlQUFlLDZCQUEwRTtBQUM1SCxTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUduQyxNQUFNLHVCQUF1QixlQUFlO0FBQUEsRUFBNUM7QUFBQTtBQUNDLFNBQVMsU0FBbUIsQ0FBQztBQUFBO0FBQUEsRUFFcEIsTUFBTSxZQUE0QixNQUF1QjtBQUNqRSxTQUFLLE9BQU8sS0FBSyxDQUFDLFNBQVMsR0FBRyxJQUFJLEVBQUUsS0FBSyxHQUFHLENBQUM7QUFBQSxFQUM5QztBQUNEO0FBRUEsTUFBTSxpQ0FBaUMsbUNBQW1DO0FBQUEsRUFBMUU7QUFBQTtBQUVDLFNBQVMscUJBQXFCLE1BQU07QUFDcEMsU0FBUyx5QkFBeUIsTUFBTTtBQUN4QyxTQUFTLHdCQUF3QixNQUFNO0FBQ3ZDLFNBQVMsdUJBQXVCLE1BQU07QUFDdEMsU0FBUywwQkFBMEIsTUFBTTtBQUFBO0FBQUEsRUFFaEMsYUFBYSxhQUErQztBQUNwRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ1MsUUFBUSxRQUErQixTQUFvRDtBQUNuRyxVQUFNLElBQUksTUFB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
