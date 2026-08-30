import assert from "assert";
import { decodeHex } from "../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { getEntryAddress, RemoteAgentHostEntryType } from "../../../platform/agentHost/common/remoteAgentHostService.js";
import { resolveRemoteAuthority, sshAuthorityString } from "../../browser/openInVSCodeUtils.js";
suite("resolveRemoteAuthority", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeProvidersService(remoteAddress) {
    return {
      getProvider: (id) => remoteAddress ? { id, remoteAddress } : void 0
    };
  }
  function makeRemoteAgentHostService(entries = []) {
    return {
      getEntryByAddress: (address) => entries.find((e) => getEntryAddress(e) === address)
    };
  }
  test("returns undefined for a local provider", () => {
    const result = resolveRemoteAuthority(
      "local-provider",
      makeProvidersService(void 0),
      makeRemoteAgentHostService()
    );
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when provider has no remoteAddress", () => {
    const noRemoteProviders = {
      getProvider: (id) => ({
        id
        /* no remoteAddress */
      })
    };
    const result = resolveRemoteAuthority(
      "agenthost-no-address",
      noRemoteProviders,
      makeRemoteAgentHostService()
    );
    assert.strictEqual(result, void 0);
  });
  test("returns ssh-remote authority for SSH with sshConfigHost", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          sshConfigHost: "my-ssh-host",
          hostName: "myserver.example.com"
        }
      }])
    );
    assert.strictEqual(result, "ssh-remote+my-ssh-host");
  });
  test("returns ssh-remote with simple hostName for SSH without sshConfigHost", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          hostName: "myserver"
        }
      }])
    );
    assert.strictEqual(result, "ssh-remote+myserver");
  });
  test("returns ssh-remote with hex-encoded authority for SSH with user and port", () => {
    const result = resolveRemoteAuthority(
      "agenthost-myserver",
      makeProvidersService("localhost:4321"),
      makeRemoteAgentHostService([{
        name: "My Server",
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: "localhost:4321",
          hostName: "myserver.example.com",
          user: "admin",
          port: 2222
        }
      }])
    );
    assert.ok(result?.startsWith("ssh-remote+"));
    const authority = result.slice("ssh-remote+".length);
    const decoded = decodeHex(authority).toString();
    assert.deepStrictEqual(JSON.parse(decoded), {
      hostName: "myserver.example.com",
      user: "admin",
      port: 2222
    });
  });
  test("returns tunnel authority using label", () => {
    const result = resolveRemoteAuthority(
      "agenthost-tunnel",
      makeProvidersService("tunnel:myTunnelId"),
      makeRemoteAgentHostService([{
        name: "My Tunnel",
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: "myTunnelId",
          clusterId: "usw2",
          label: "my-machine"
        }
      }])
    );
    assert.strictEqual(result, "tunnel+my-machine");
  });
  test("returns tunnel authority falling back to tunnelId when no label", () => {
    const result = resolveRemoteAuthority(
      "agenthost-tunnel",
      makeProvidersService("tunnel:myTunnelId"),
      makeRemoteAgentHostService([{
        name: "My Tunnel",
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: "myTunnelId",
          clusterId: "usw2"
        }
      }])
    );
    assert.strictEqual(result, "tunnel+myTunnelId.usw2");
  });
  test("returns undefined for WebSocket connections", () => {
    const result = resolveRemoteAuthority(
      "agenthost-ws",
      makeProvidersService("myhost:4321"),
      makeRemoteAgentHostService([{
        name: "WS Host",
        connection: {
          type: RemoteAgentHostEntryType.WebSocket,
          address: "myhost:4321"
        }
      }])
    );
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when no matching entry found", () => {
    const result = resolveRemoteAuthority(
      "agenthost-missing",
      makeProvidersService("unknown-address:9999"),
      makeRemoteAgentHostService([{
        name: "Other",
        connection: {
          type: RemoteAgentHostEntryType.WebSocket,
          address: "different-address:1234"
        }
      }])
    );
    assert.strictEqual(result, void 0);
  });
});
suite("sshAuthorityString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hex-encodes when user is present", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "myserver",
      user: "admin"
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "myserver", user: "admin" });
  });
  test("hex-encodes when port is present", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "myserver",
      port: 2222
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "myserver", port: 2222 });
  });
  test("hex-encodes when hostName has uppercase letters", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "MyServer"
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), { hostName: "MyServer" });
  });
  test("hex-encodes with all fields", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "MyServer.example.com",
      user: "root",
      port: 22
    });
    const decoded = decodeHex(result).toString();
    assert.deepStrictEqual(JSON.parse(decoded), {
      hostName: "MyServer.example.com",
      user: "root",
      port: 22
    });
  });
  test("uses hostName directly when address differs", () => {
    const result = sshAuthorityString({
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      hostName: "actualhost"
    });
    assert.strictEqual(result, "actualhost");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3NlclxccmVzb2x2ZVJlbW90ZUF1dGhvcml0eS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZGVjb2RlSGV4IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdEVudHJ5LCBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgZ2V0RW50cnlBZGRyZXNzLCBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZVJlbW90ZUF1dGhvcml0eSwgc3NoQXV0aG9yaXR5U3RyaW5nIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9vcGVuSW5WU0NvZGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgncmVzb2x2ZVJlbW90ZUF1dGhvcml0eScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlUHJvdmlkZXJzU2VydmljZShyZW1vdGVBZGRyZXNzPzogc3RyaW5nKTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldFByb3ZpZGVyOiAoaWQ6IHN0cmluZykgPT4gcmVtb3RlQWRkcmVzcyA/IHsgaWQsIHJlbW90ZUFkZHJlc3MgfSA6IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZTsgLy8gbm8tYXMtYW55IGp1c3RpZmljYXRpb246IGxpZ2h0d2VpZ2h0IHRlc3QgbW9jayBmb3IgYSBtdWx0aS1tZXRob2Qgc2VydmljZSBpbnRlcmZhY2Vcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKGVudHJpZXM6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdID0gW10pOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldEVudHJ5QnlBZGRyZXNzOiAoYWRkcmVzczogc3RyaW5nKSA9PiBlbnRyaWVzLmZpbmQoZSA9PiBnZXRFbnRyeUFkZHJlc3MoZSkgPT09IGFkZHJlc3MpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZTsgLy8gbm8tYXMtYW55IGp1c3RpZmljYXRpb246IGxpZ2h0d2VpZ2h0IHRlc3QgbW9jayBmb3IgYSBtdWx0aS1tZXRob2Qgc2VydmljZSBpbnRlcmZhY2Vcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBhIGxvY2FsIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVSZW1vdGVBdXRob3JpdHkoXG5cdFx0XHQnbG9jYWwtcHJvdmlkZXInLFxuXHRcdFx0bWFrZVByb3ZpZGVyc1NlcnZpY2UodW5kZWZpbmVkKSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gcHJvdmlkZXIgaGFzIG5vIHJlbW90ZUFkZHJlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9SZW1vdGVQcm92aWRlcnMgPSB7XG5cdFx0XHRnZXRQcm92aWRlcjogKGlkOiBzdHJpbmcpID0+ICh7IGlkIC8qIG5vIHJlbW90ZUFkZHJlc3MgKi8gfSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U7IC8vIG5vLWFzLWFueSBqdXN0aWZpY2F0aW9uOiBsaWdodHdlaWdodCB0ZXN0IG1vY2sgZm9yIGEgbXVsdGktbWV0aG9kIHNlcnZpY2UgaW50ZXJmYWNlXG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3Qtbm8tYWRkcmVzcycsXG5cdFx0XHRub1JlbW90ZVByb3ZpZGVycyxcblx0XHRcdG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkgYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHNzaC1yZW1vdGUgYXV0aG9yaXR5IGZvciBTU0ggd2l0aCBzc2hDb25maWdIb3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVSZW1vdGVBdXRob3JpdHkoXG5cdFx0XHQnYWdlbnRob3N0LW15c2VydmVyJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCdsb2NhbGhvc3Q6NDMyMScpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnTXkgU2VydmVyJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0XHRzc2hDb25maWdIb3N0OiAnbXktc3NoLWhvc3QnLFxuXHRcdFx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3NzaC1yZW1vdGUrbXktc3NoLWhvc3QnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBzc2gtcmVtb3RlIHdpdGggc2ltcGxlIGhvc3ROYW1lIGZvciBTU0ggd2l0aG91dCBzc2hDb25maWdIb3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVSZW1vdGVBdXRob3JpdHkoXG5cdFx0XHQnYWdlbnRob3N0LW15c2VydmVyJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCdsb2NhbGhvc3Q6NDMyMScpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnTXkgU2VydmVyJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0XHRob3N0TmFtZTogJ215c2VydmVyJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdzc2gtcmVtb3RlK215c2VydmVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgc3NoLXJlbW90ZSB3aXRoIGhleC1lbmNvZGVkIGF1dGhvcml0eSBmb3IgU1NIIHdpdGggdXNlciBhbmQgcG9ydCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlUmVtb3RlQXV0aG9yaXR5KFxuXHRcdFx0J2FnZW50aG9zdC1teXNlcnZlcicsXG5cdFx0XHRtYWtlUHJvdmlkZXJzU2VydmljZSgnbG9jYWxob3N0OjQzMjEnKSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoW3tcblx0XHRcdFx0bmFtZTogJ015IFNlcnZlcicsXG5cdFx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRcdFx0aG9zdE5hbWU6ICdteXNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHRcdFx0dXNlcjogJ2FkbWluJyxcblx0XHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdD8uc3RhcnRzV2l0aCgnc3NoLXJlbW90ZSsnKSk7XG5cdFx0Ly8gVGhlIGF1dGhvcml0eSBzaG91bGQgYmUgaGV4LWVuY29kZWQgSlNPTlxuXHRcdGNvbnN0IGF1dGhvcml0eSA9IHJlc3VsdCEuc2xpY2UoJ3NzaC1yZW1vdGUrJy5sZW5ndGgpO1xuXHRcdGNvbnN0IGRlY29kZWQgPSBkZWNvZGVIZXgoYXV0aG9yaXR5KS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShkZWNvZGVkKSwge1xuXHRcdFx0aG9zdE5hbWU6ICdteXNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHR1c2VyOiAnYWRtaW4nLFxuXHRcdFx0cG9ydDogMjIyMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0dW5uZWwgYXV0aG9yaXR5IHVzaW5nIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVSZW1vdGVBdXRob3JpdHkoXG5cdFx0XHQnYWdlbnRob3N0LXR1bm5lbCcsXG5cdFx0XHRtYWtlUHJvdmlkZXJzU2VydmljZSgndHVubmVsOm15VHVubmVsSWQnKSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoW3tcblx0XHRcdFx0bmFtZTogJ015IFR1bm5lbCcsXG5cdFx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuVHVubmVsLFxuXHRcdFx0XHRcdHR1bm5lbElkOiAnbXlUdW5uZWxJZCcsXG5cdFx0XHRcdFx0Y2x1c3RlcklkOiAndXN3MicsXG5cdFx0XHRcdFx0bGFiZWw6ICdteS1tYWNoaW5lJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0dW5uZWwrbXktbWFjaGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHR1bm5lbCBhdXRob3JpdHkgZmFsbGluZyBiYWNrIHRvIHR1bm5lbElkIHdoZW4gbm8gbGFiZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3QtdHVubmVsJyxcblx0XHRcdG1ha2VQcm92aWRlcnNTZXJ2aWNlKCd0dW5uZWw6bXlUdW5uZWxJZCcpIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRtYWtlUmVtb3RlQWdlbnRIb3N0U2VydmljZShbe1xuXHRcdFx0XHRuYW1lOiAnTXkgVHVubmVsJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsXG5cdFx0XHRcdFx0dHVubmVsSWQ6ICdteVR1bm5lbElkJyxcblx0XHRcdFx0XHRjbHVzdGVySWQ6ICd1c3cyJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0dW5uZWwrbXlUdW5uZWxJZC51c3cyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBXZWJTb2NrZXQgY29ubmVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3Qtd3MnLFxuXHRcdFx0bWFrZVByb3ZpZGVyc1NlcnZpY2UoJ215aG9zdDo0MzIxJykgYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRcdG1ha2VSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKFt7XG5cdFx0XHRcdG5hbWU6ICdXUyBIb3N0Jyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsXG5cdFx0XHRcdFx0YWRkcmVzczogJ215aG9zdDo0MzIxJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gbWF0Y2hpbmcgZW50cnkgZm91bmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVJlbW90ZUF1dGhvcml0eShcblx0XHRcdCdhZ2VudGhvc3QtbWlzc2luZycsXG5cdFx0XHRtYWtlUHJvdmlkZXJzU2VydmljZSgndW5rbm93bi1hZGRyZXNzOjk5OTknKSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0bWFrZVJlbW90ZUFnZW50SG9zdFNlcnZpY2UoW3tcblx0XHRcdFx0bmFtZTogJ090aGVyJyxcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsXG5cdFx0XHRcdFx0YWRkcmVzczogJ2RpZmZlcmVudC1hZGRyZXNzOjEyMzQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3NzaEF1dGhvcml0eVN0cmluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoZXgtZW5jb2RlcyB3aGVuIHVzZXIgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzc2hBdXRob3JpdHlTdHJpbmcoe1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRob3N0TmFtZTogJ215c2VydmVyJyxcblx0XHRcdHVzZXI6ICdhZG1pbicsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZUhleChyZXN1bHQpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGRlY29kZWQpLCB7IGhvc3ROYW1lOiAnbXlzZXJ2ZXInLCB1c2VyOiAnYWRtaW4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoZXgtZW5jb2RlcyB3aGVuIHBvcnQgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzc2hBdXRob3JpdHlTdHJpbmcoe1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRob3N0TmFtZTogJ215c2VydmVyJyxcblx0XHRcdHBvcnQ6IDIyMjIsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZUhleChyZXN1bHQpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGRlY29kZWQpLCB7IGhvc3ROYW1lOiAnbXlzZXJ2ZXInLCBwb3J0OiAyMjIyIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoZXgtZW5jb2RlcyB3aGVuIGhvc3ROYW1lIGhhcyB1cHBlcmNhc2UgbGV0dGVycycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzc2hBdXRob3JpdHlTdHJpbmcoe1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRob3N0TmFtZTogJ015U2VydmVyJyxcblx0XHR9KTtcblx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2RlSGV4KHJlc3VsdCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoZGVjb2RlZCksIHsgaG9zdE5hbWU6ICdNeVNlcnZlcicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hleC1lbmNvZGVzIHdpdGggYWxsIGZpZWxkcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzc2hBdXRob3JpdHlTdHJpbmcoe1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRob3N0TmFtZTogJ015U2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdHVzZXI6ICdyb290Jyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGRlY29kZWQgPSBkZWNvZGVIZXgocmVzdWx0KS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShkZWNvZGVkKSwge1xuXHRcdFx0aG9zdE5hbWU6ICdNeVNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHR1c2VyOiAncm9vdCcsXG5cdFx0XHRwb3J0OiAyMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBob3N0TmFtZSBkaXJlY3RseSB3aGVuIGFkZHJlc3MgZGlmZmVycycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzc2hBdXRob3JpdHlTdHJpbmcoe1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRob3N0TmFtZTogJ2FjdHVhbGhvc3QnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdhY3R1YWxob3N0Jyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBeUQsaUJBQWlCLGdDQUFnQztBQUMxRyxTQUFT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
