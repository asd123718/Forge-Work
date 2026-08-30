import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { convertBareEnvVarsToVsCodeSyntax as convertBareEnvVarsToVsCodeSyntaxRaw } from "../../../common/plugins/agentPluginServiceImpl.js";
import { CustomizationType, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
function stubMcpCustomization() {
  return { type: CustomizationType.McpServer, id: "stub", uri: "file:///test", name: "test", state: { kind: McpServerStatus.Starting } };
}
function convertBareEnvVarsToVsCodeSyntax(def) {
  return convertBareEnvVarsToVsCodeSyntaxRaw({ ...def, customization: stubMcpCustomization() });
}
suite("convertBareEnvVarsToVsCodeSyntax", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function asStdio(result) {
    assert.strictEqual(result.configuration.type, McpServerType.LOCAL);
    return result.configuration;
  }
  function asRemote(result) {
    assert.strictEqual(result.configuration.type, McpServerType.REMOTE);
    return result.configuration;
  }
  suite("stdio (LOCAL) servers", () => {
    test("converts bare ${VAR} in command to ${env:VAR}", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_TOOL_PATH}/bin/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:MY_TOOL_PATH}/bin/server");
    });
    test("converts bare ${VAR} in args", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "node",
          args: ["--token", "${ENTERPRISE_GITHUB_TOKEN}"]
        }
      }));
      assert.deepStrictEqual(cfg.args, ["--token", "${env:ENTERPRISE_GITHUB_TOKEN}"]);
    });
    test("converts bare ${VAR} in env values", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          env: {
            TOKEN: "${ENTERPRISE_GITHUB_TOKEN}",
            STATIC: "literal-value"
          }
        }
      }));
      assert.strictEqual(cfg.env.TOKEN, "${env:ENTERPRISE_GITHUB_TOKEN}");
      assert.strictEqual(cfg.env.STATIC, "literal-value");
    });
    test("converts bare ${VAR} in cwd", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          cwd: "${PROJECT_DIR}/subdir"
        }
      }));
      assert.strictEqual(cfg.cwd, "${env:PROJECT_DIR}/subdir");
    });
    test("converts bare ${VAR} in envFile", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          envFile: "${HOME}/.env"
        }
      }));
      assert.strictEqual(cfg.envFile, "${env:HOME}/.env");
    });
    test("does not convert already-namespaced ${env:VAR} references", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${env:ALREADY_RESOLVED}/bin/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:ALREADY_RESOLVED}/bin/server");
    });
    test("does not convert ${config:...} references", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${config:editor.fontSize}"
        }
      }));
      assert.strictEqual(cfg.command, "${config:editor.fontSize}");
    });
    test("does not convert lowercase/camelCase VS Code variable tokens", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${workspaceFolder}/server",
          cwd: "${fileDirname}"
        }
      }));
      assert.strictEqual(cfg.command, "${workspaceFolder}/server");
      assert.strictEqual(cfg.cwd, "${fileDirname}");
    });
    test("converts multiple bare ${VAR} references in a single string", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${BIN_DIR}/run --config ${CONFIG_DIR}/cfg.json"
        }
      }));
      assert.strictEqual(cfg.command, "${env:BIN_DIR}/run --config ${env:CONFIG_DIR}/cfg.json");
    });
    test("leaves strings without any ${VAR} unchanged", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "/usr/bin/server",
          args: ["--port", "8080"],
          env: { KEY: "plain-value" }
        }
      }));
      assert.strictEqual(cfg.command, "/usr/bin/server");
      assert.deepStrictEqual(cfg.args, ["--port", "8080"]);
      assert.strictEqual(cfg.env.KEY, "plain-value");
    });
    test("preserves non-string env values (numbers and null)", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          env: {
            PORT: 3e3,
            UNSET: null,
            TOKEN: "${MY_TOKEN}"
          }
        }
      }));
      assert.strictEqual(cfg.env.PORT, 3e3);
      assert.strictEqual(cfg.env.UNSET, null);
      assert.strictEqual(cfg.env.TOKEN, "${env:MY_TOKEN}");
    });
    test("converts underscore-prefixed variable names", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${_PRIVATE_BIN}/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:_PRIVATE_BIN}/server");
    });
    test("preserves the definition name unchanged", () => {
      const result = convertBareEnvVarsToVsCodeSyntax({
        name: "my-mcp-server",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_PATH}/server"
        }
      });
      assert.strictEqual(result.name, "my-mcp-server");
    });
    test("preserves uri as a URI instance", () => {
      const input = URI.parse("file:///plugins/my-plugin");
      const result = convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: input,
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_PATH}/server"
        }
      });
      assert.ok(URI.isUri(result.uri), "uri must remain a URI instance");
      assert.strictEqual(result.uri.toString(), input.toString());
    });
  });
  suite("remote (HTTP) servers", () => {
    test("converts bare ${VAR} in url", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://${API_HOST}/mcp"
        }
      }));
      assert.strictEqual(cfg.url, "https://${env:API_HOST}/mcp");
    });
    test("converts bare ${VAR} in header values", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer ${API_TOKEN}",
            "X-Custom": "static-value"
          }
        }
      }));
      assert.strictEqual(cfg.headers.Authorization, "Bearer ${env:API_TOKEN}");
      assert.strictEqual(cfg.headers["X-Custom"], "static-value");
    });
    test("does not convert already-namespaced ${env:VAR} in url", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://${env:API_HOST}/mcp"
        }
      }));
      assert.strictEqual(cfg.url, "https://${env:API_HOST}/mcp");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccGx1Z2luc1xcY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uLCBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4IGFzIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4UmF3IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1jcFNlcnZlckRlZmluaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuXG5mdW5jdGlvbiBzdHViTWNwQ3VzdG9taXphdGlvbigpOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLCBpZDogJ3N0dWInLCB1cmk6ICdmaWxlOi8vL3Rlc3QnLCBuYW1lOiAndGVzdCcsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9IH07XG59XG5cbi8qKlxuICogV3JhcHMgdGhlIHByb2R1Y3Rpb24ge0BsaW5rIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4UmF3fSBzbyB0ZXN0c1xuICogZG9uJ3QgaGF2ZSB0byBzcGVsbCBvdXQgdGhlIHByb3RvY29sLWxldmVsIGBjdXN0b21pemF0aW9uYCBwcm9qZWN0aW9uIG9uXG4gKiBldmVyeSBmaXh0dXJlIFx1MjAxNCB0aGUgZW52LXZhciBjb252ZXJzaW9uIG5ldmVyIHRvdWNoZXMgaXQuXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KGRlZjogT21pdDxJTWNwU2VydmVyRGVmaW5pdGlvbiwgJ2N1c3RvbWl6YXRpb24nPikge1xuXHRyZXR1cm4gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXhSYXcoeyAuLi5kZWYsIGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCkgfSk7XG59XG5cbnN1aXRlKCdjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqIEhlbHBlciB0byBuYXJyb3cgdGhlIHJlc3VsdCBjb25maWd1cmF0aW9uIHRvIGEgc3RkaW8gc2VydmVyLiAqL1xuXHRmdW5jdGlvbiBhc1N0ZGlvKHJlc3VsdDogUmV0dXJuVHlwZTx0eXBlb2YgY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXg+KTogSU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvbiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25maWd1cmF0aW9uLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdHJldHVybiByZXN1bHQuY29uZmlndXJhdGlvbiBhcyBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0LyoqIEhlbHBlciB0byBuYXJyb3cgdGhlIHJlc3VsdCBjb25maWd1cmF0aW9uIHRvIGEgcmVtb3RlIHNlcnZlci4gKi9cblx0ZnVuY3Rpb24gYXNSZW1vdGUocmVzdWx0OiBSZXR1cm5UeXBlPHR5cGVvZiBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheD4pOiBJTWNwUmVtb3RlU2VydmVyQ29uZmlndXJhdGlvbiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25maWd1cmF0aW9uLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHRyZXR1cm4gcmVzdWx0LmNvbmZpZ3VyYXRpb24gYXMgSU1jcFJlbW90ZVNlcnZlckNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRzdWl0ZSgnc3RkaW8gKExPQ0FMKSBzZXJ2ZXJzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSAke1ZBUn0gaW4gY29tbWFuZCB0byAke2VudjpWQVJ9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtNWV9UT09MX1BBVEh9L2Jpbi9zZXJ2ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnJHtlbnY6TVlfVE9PTF9QQVRIfS9iaW4vc2VydmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBiYXJlICR7VkFSfSBpbiBhcmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0YXJnczogWyctLXRva2VuJywgJyR7RU5URVJQUklTRV9HSVRIVUJfVE9LRU59J10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNmZy5hcmdzLCBbJy0tdG9rZW4nLCAnJHtlbnY6RU5URVJQUklTRV9HSVRIVUJfVE9LRU59J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSAke1ZBUn0gaW4gZW52IHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0ZW52OiB7XG5cdFx0XHRcdFx0XHRUT0tFTjogJyR7RU5URVJQUklTRV9HSVRIVUJfVE9LRU59Jyxcblx0XHRcdFx0XHRcdFNUQVRJQzogJ2xpdGVyYWwtdmFsdWUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmVudiEuVE9LRU4sICcke2VudjpFTlRFUlBSSVNFX0dJVEhVQl9UT0tFTn0nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5TVEFUSUMsICdsaXRlcmFsLXZhbHVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBiYXJlICR7VkFSfSBpbiBjd2QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdGN3ZDogJyR7UFJPSkVDVF9ESVJ9L3N1YmRpcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmN3ZCwgJyR7ZW52OlBST0pFQ1RfRElSfS9zdWJkaXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGJhcmUgJHtWQVJ9IGluIGVudkZpbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdGVudkZpbGU6ICcke0hPTUV9Ly5lbnYnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5lbnZGaWxlLCAnJHtlbnY6SE9NRX0vLmVudicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY29udmVydCBhbHJlYWR5LW5hbWVzcGFjZWQgJHtlbnY6VkFSfSByZWZlcmVuY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtlbnY6QUxSRUFEWV9SRVNPTFZFRH0vYmluL3NlcnZlcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmNvbW1hbmQsICcke2VudjpBTFJFQURZX1JFU09MVkVEfS9iaW4vc2VydmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjb252ZXJ0ICR7Y29uZmlnOi4uLn0gcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7Y29uZmlnOmVkaXRvci5mb250U2l6ZX0nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnJHtjb25maWc6ZWRpdG9yLmZvbnRTaXplfScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY29udmVydCBsb3dlcmNhc2UvY2FtZWxDYXNlIFZTIENvZGUgdmFyaWFibGUgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9L3NlcnZlcicsXG5cdFx0XHRcdFx0Y3dkOiAnJHtmaWxlRGlybmFtZX0nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnJHt3b3Jrc3BhY2VGb2xkZXJ9L3NlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jd2QsICcke2ZpbGVEaXJuYW1lfScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgbXVsdGlwbGUgYmFyZSAke1ZBUn0gcmVmZXJlbmNlcyBpbiBhIHNpbmdsZSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke0JJTl9ESVJ9L3J1biAtLWNvbmZpZyAke0NPTkZJR19ESVJ9L2NmZy5qc29uJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuY29tbWFuZCwgJyR7ZW52OkJJTl9ESVJ9L3J1biAtLWNvbmZpZyAke2VudjpDT05GSUdfRElSfS9jZmcuanNvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIHN0cmluZ3Mgd2l0aG91dCBhbnkgJHtWQVJ9IHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJy91c3IvYmluL3NlcnZlcicsXG5cdFx0XHRcdFx0YXJnczogWyctLXBvcnQnLCAnODA4MCddLFxuXHRcdFx0XHRcdGVudjogeyBLRVk6ICdwbGFpbi12YWx1ZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuY29tbWFuZCwgJy91c3IvYmluL3NlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZmcuYXJncywgWyctLXBvcnQnLCAnODA4MCddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5LRVksICdwbGFpbi12YWx1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIG5vbi1zdHJpbmcgZW52IHZhbHVlcyAobnVtYmVycyBhbmQgbnVsbCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdGVudjoge1xuXHRcdFx0XHRcdFx0UE9SVDogMzAwMCxcblx0XHRcdFx0XHRcdFVOU0VUOiBudWxsLFxuXHRcdFx0XHRcdFx0VE9LRU46ICcke01ZX1RPS0VOfScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5QT1JULCAzMDAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5VTlNFVCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmVudiEuVE9LRU4sICcke2VudjpNWV9UT0tFTn0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIHVuZGVyc2NvcmUtcHJlZml4ZWQgdmFyaWFibGUgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke19QUklWQVRFX0JJTn0vc2VydmVyJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuY29tbWFuZCwgJyR7ZW52Ol9QUklWQVRFX0JJTn0vc2VydmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdGhlIGRlZmluaXRpb24gbmFtZSB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICdteS1tY3Atc2VydmVyJyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtNWV9QQVRIfS9zZXJ2ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICdteS1tY3Atc2VydmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdXJpIGFzIGEgVVJJIGluc3RhbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGx1Z2lucy9teS1wbHVnaW4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IGlucHV0LFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtNWV9QQVRIfS9zZXJ2ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC51cmkpLCAndXJpIG11c3QgcmVtYWluIGEgVVJJIGluc3RhbmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVyaS50b1N0cmluZygpLCBpbnB1dC50b1N0cmluZygpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlbW90ZSAoSFRUUCkgc2VydmVycycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGJhcmUgJHtWQVJ9IGluIHVybCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzUmVtb3RlKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovLyR7QVBJX0hPU1R9L21jcCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLnVybCwgJ2h0dHBzOi8vJHtlbnY6QVBJX0hPU1R9L21jcCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSAke1ZBUn0gaW4gaGVhZGVyIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzUmVtb3RlKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL21jcCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0QXV0aG9yaXphdGlvbjogJ0JlYXJlciAke0FQSV9UT0tFTn0nLFxuXHRcdFx0XHRcdFx0J1gtQ3VzdG9tJzogJ3N0YXRpYy12YWx1ZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuaGVhZGVycyEuQXV0aG9yaXphdGlvbiwgJ0JlYXJlciAke2VudjpBUElfVE9LRU59Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmhlYWRlcnMhWydYLUN1c3RvbSddLCAnc3RhdGljLXZhbHVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjb252ZXJ0IGFscmVhZHktbmFtZXNwYWNlZCAke2VudjpWQVJ9IGluIHVybCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzUmVtb3RlKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovLyR7ZW52OkFQSV9IT1NUfS9tY3AnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy51cmwsICdodHRwczovLyR7ZW52OkFQSV9IT1NUfS9tY3AnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtB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
