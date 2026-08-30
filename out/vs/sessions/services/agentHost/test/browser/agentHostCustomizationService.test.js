import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CustomizationType, McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILoggerService, NullLoggerService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IOutputService } from "../../../../../workbench/services/output/common/output.js";
import { AgentHostCustomizationService } from "../../browser/agentHostCustomizationService.js";
suite("AgentHostCustomizationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reports client-bundled MCP servers from the active client", () => {
    const sessionResource = URI.parse("agent-host-copilot:///session-1");
    const session = new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = sessionResource;
        this.providerId = "agenthost-test";
        this.sessionId = "agenthost-test:session-1";
      }
    }();
    const server = {
      type: CustomizationType.McpServer,
      id: "context7",
      uri: "file:///plugin/.mcp.json",
      name: "context7",
      state: { kind: McpServerStatus.Stopped }
    };
    const plugin = {
      type: CustomizationType.Plugin,
      id: "plugin",
      uri: "vscode-synced-customization:///plugin",
      name: "Plugin",
      children: [server]
    };
    const provider = new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-test";
        this.onDidChangeCustomAgents = Event.None;
        this.onDidChangeCustomizations = Event.None;
      }
      getCustomizations() {
        return [plugin];
      }
      getWorkingDirectory() {
        return void 0;
      }
      getWorkingDirectories() {
        return [];
      }
      getRootConfig() {
        return void 0;
      }
      getMcpServers() {
        return [];
      }
      authenticate() {
        return Promise.resolve({ authenticated: false });
      }
      setCustomizationEnablement() {
      }
    }();
    const sessionsManagementService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeSessions = Event.None;
      }
      getSession(resource) {
        return resource.toString() === sessionResource.toString() ? session : void 0;
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = observableValue(this, void 0);
      }
    }();
    const sessionsProvidersService = new class extends mock() {
      constructor(_provider) {
        super();
        this._provider = _provider;
      }
      getProvider() {
        return this._provider;
      }
    }(provider);
    const activeClientService = new class extends mock() {
      isBundledMcpServer(pluginUri, serverName) {
        return pluginUri === plugin.uri && serverName === server.name;
      }
    }();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
    instantiationService.stub(IOutputService, {
      getChannel: () => void 0,
      getChannelDescriptor: () => void 0,
      showChannel: async () => {
      }
    });
    const service = store.add(new AgentHostCustomizationService(
      sessionsManagementService,
      sessionsService,
      sessionsProvidersService,
      instantiationService,
      new NullLogService(),
      activeClientService
    ));
    const [mcpServer] = service.getMcpServers(sessionResource);
    assert.deepStrictEqual({ isClientBundled: mcpServer.isClientBundled }, { isClientBundled: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXGFnZW50SG9zdFxcdGVzdFxcYnJvd3NlclxcYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dnZXJTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXBvcnRzIGNsaWVudC1idW5kbGVkIE1DUCBzZXJ2ZXJzIGZyb20gdGhlIGFjdGl2ZSBjbGllbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6Ly8vc2Vzc2lvbi0xJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBwcm92aWRlcklkID0gJ2FnZW50aG9zdC10ZXN0Jztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25JZCA9ICdhZ2VudGhvc3QtdGVzdDpzZXNzaW9uLTEnO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmVyOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0aWQ6ICdjb250ZXh0NycsXG5cdFx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbi8ubWNwLmpzb24nLFxuXHRcdFx0bmFtZTogJ2NvbnRleHQ3Jyxcblx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0fTtcblx0XHRjb25zdCBwbHVnaW46IFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogJ3BsdWdpbicsXG5cdFx0XHR1cmk6ICd2c2NvZGUtc3luY2VkLWN1c3RvbWl6YXRpb246Ly8vcGx1Z2luJyxcblx0XHRcdG5hbWU6ICdQbHVnaW4nLFxuXHRcdFx0Y2hpbGRyZW46IFtzZXJ2ZXJdLFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2FnZW50aG9zdC10ZXN0Jztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0Q3VzdG9taXphdGlvbnMoKTogQ3VzdG9taXphdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIFtwbHVnaW5dO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0V29ya2luZ0RpcmVjdG9yeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0V29ya2luZ0RpcmVjdG9yaWVzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0Um9vdENvbmZpZygpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldE1jcFNlcnZlcnMoKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGF1dGhlbnRpY2F0ZSgpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoKTogdm9pZCB7XG5cdFx0XHRcdC8vIG5vLW9wXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID8gc2Vzc2lvbiA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyKSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXIgYXMgVDtcblx0XHRcdH1cblx0XHR9KHByb3ZpZGVyKTtcblx0XHRjb25zdCBhY3RpdmVDbGllbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gcGx1Z2luVXJpID09PSBwbHVnaW4udXJpICYmIHNlcnZlck5hbWUgPT09IHNlcnZlci5uYW1lO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dnZXJTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IE51bGxMb2dnZXJTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPdXRwdXRTZXJ2aWNlLCB7XG5cdFx0XHRnZXRDaGFubmVsOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRDaGFubmVsRGVzY3JpcHRvcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0NoYW5uZWw6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZShcblx0XHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRzZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHRzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0YWN0aXZlQ2xpZW50U2VydmljZSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IFttY3BTZXJ2ZXJdID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJzKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaXNDbGllbnRCdW5kbGVkOiBtY3BTZXJ2ZXIuaXNDbGllbnRCdW5kbGVkIH0sIHsgaXNDbGllbnRCdW5kbGVkOiB0cnVlIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLHVCQUFrRztBQUM5SCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQixtQkFBbUIsc0JBQXNCO0FBQ2xFLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMscUNBQXFDO0FBTzlDLE1BQU0saUNBQWlDLE1BQU07QUFDNUMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sa0JBQWtCLElBQUksTUFBTSxpQ0FBaUM7QUFDbkUsVUFBTSxVQUFVLElBQUksY0FBYyxLQUFlLEVBQUU7QUFBQSxNQUEvQjtBQUFBO0FBQ25CLGFBQWtCLFdBQVc7QUFDN0IsYUFBa0IsYUFB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
