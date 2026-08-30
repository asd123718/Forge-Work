var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { LogLevel, NullLogger } from "../../../../../platform/log/common/log.js";
import { StorageScope } from "../../../../../platform/storage/common/storage.js";
import { McpServerConnection } from "../../common/mcpServerConnection.js";
import { LazyCollectionState, McpConnectionState, McpServerTransportType, McpServerTrust } from "../../common/mcpTypes.js";
import { MCP } from "../../common/modelContextProtocol.js";
class TestMcpMessageTransport extends Disposable {
  constructor() {
    super();
    this._onDidLog = this._register(new Emitter());
    this.onDidLog = this._onDidLog.event;
    this._onDidReceiveMessage = this._register(new Emitter());
    this.onDidReceiveMessage = this._onDidReceiveMessage.event;
    this._stateValue = observableValue("testTransportState", { state: McpConnectionState.Kind.Starting });
    this.state = this._stateValue;
    this._sentMessages = [];
    this.setResponder("initialize", () => ({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: 1,
      // The handler uses 1 for the first request
      result: {
        protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
        serverInfo: {
          name: "Test MCP Server",
          version: "1.0.0"
        },
        capabilities: {
          resources: {
            supportedTypes: ["text/plain"]
          },
          tools: {
            supportsCancellation: true
          }
        }
      }
    }));
  }
  /**
   * Set a responder function for a specific method.
   * The responder receives the sent message and should return a response object,
   * which will be simulated as a server response.
   */
  setResponder(method, responder) {
    if (!this._responders) {
      this._responders = /* @__PURE__ */ new Map();
    }
    this._responders.set(method, responder);
  }
  /**
   * Send a message through the transport.
   */
  send(message) {
    this._sentMessages.push(message);
    if (this._responders && "method" in message && typeof message.method === "string") {
      const responder = this._responders.get(message.method);
      if (responder) {
        const response = responder(message);
        if (response) {
          setTimeout(() => this.simulateReceiveMessage(response));
        }
      }
    }
  }
  /**
   * Stop the transport.
   */
  stop() {
    this._stateValue.set({ state: McpConnectionState.Kind.Stopped }, void 0);
  }
  // Test Helper Methods
  /**
   * Simulate receiving a message from the server.
   */
  simulateReceiveMessage(message) {
    this._onDidReceiveMessage.fire(message);
  }
  /**
   * Simulates a reply to an 'initialized' request.
   */
  simulateInitialized() {
    if (!this._sentMessages.length) {
      throw new Error("initialize was not called yet");
    }
    this.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: this.getSentMessages()[0].id,
      result: {
        protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "Test Server",
          version: "1.0.0"
        }
      }
    });
  }
  /**
   * Simulate a log event.
   */
  simulateLog(message) {
    this._onDidLog.fire({ level: LogLevel.Info, message });
  }
  /**
   * Set the connection state.
   */
  setConnectionState(state) {
    this._stateValue.set(state, void 0);
  }
  /**
   * Get all messages that have been sent.
   */
  getSentMessages() {
    return [...this._sentMessages];
  }
  /**
   * Clear the sent messages history.
   */
  clearSentMessages() {
    this._sentMessages.length = 0;
  }
}
let TestMcpRegistry = class {
  constructor(_instantiationService) {
    this._instantiationService = _instantiationService;
    this.makeTestTransport = () => new TestMcpMessageTransport();
    this.onDidChangeInputs = Event.None;
    this.collections = observableValue(this, [{
      id: "test-collection",
      remoteAuthority: null,
      label: "Test Collection",
      configTarget: ConfigurationTarget.USER,
      order: 0,
      serverDefinitions: observableValue(this, [{
        id: "test-server",
        label: "Test Server",
        launch: { type: McpServerTransportType.Stdio, command: "echo", args: ["Hello MCP"], env: {}, envFile: void 0, cwd: void 0, sandbox: void 0 },
        cacheNonce: "a"
      }]),
      trustBehavior: McpServerTrust.Kind.Trusted,
      scope: StorageScope.APPLICATION
    }]);
    this.delegates = observableValue(this, [{
      priority: 0,
      canStart: () => true,
      substituteVariables(serverDefinition, launch) {
        return Promise.resolve(launch);
      },
      start: () => {
        const t = this.makeTestTransport();
        setTimeout(() => t.setConnectionState({ state: McpConnectionState.Kind.Running }));
        return t;
      },
      waitForInitialProviderPromises: () => Promise.resolve()
    }]);
    this.lazyCollectionState = observableValue(this, { state: LazyCollectionState.AllKnown, collections: [] });
  }
  collectionToolPrefix(collection) {
    return observableValue(this, `mcp-${collection.id}-`);
  }
  getServerDefinition(collectionRef, definitionRef) {
    const collectionObs = this.collections.map((cols) => cols.find((c) => c.id === collectionRef.id));
    return collectionObs.map((collection, reader) => {
      const server = collection?.serverDefinitions.read(reader).find((s) => s.id === definitionRef.id);
      return { collection, server };
    });
  }
  discoverCollections() {
    throw new Error("Method not implemented.");
  }
  registerDelegate(delegate) {
    throw new Error("Method not implemented.");
  }
  registerCollection(collection) {
    throw new Error("Method not implemented.");
  }
  resetTrust() {
    throw new Error("Method not implemented.");
  }
  clearSavedInputs(scope, inputId) {
    throw new Error("Method not implemented.");
  }
  editSavedInput(inputId, folderData, configSection, target) {
    throw new Error("Method not implemented.");
  }
  setSavedInput(inputId, target, value) {
    throw new Error("Method not implemented.");
  }
  getSavedInputs(scope) {
    throw new Error("Method not implemented.");
  }
  resolveConnection(options) {
    const collection = this.collections.get().find((c) => c.id === options.collectionRef.id);
    const definition = collection?.serverDefinitions.get().find((d) => d.id === options.definitionRef.id);
    if (!collection || !definition) {
      throw new Error(`Collection or definition not found: ${options.collectionRef.id}, ${options.definitionRef.id}`);
    }
    const del = this.delegates.get()[0];
    return Promise.resolve(new McpServerConnection(
      collection,
      definition,
      del,
      definition.launch,
      new NullLogger(),
      false,
      options.taskManager,
      this._instantiationService
    ));
  }
};
TestMcpRegistry = __decorateClass([
  __decorateParam(0, IInstantiationService)
], TestMcpRegistry);
export {
  TestMcpMessageTransport,
  TestMcpRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BSZWdpc3RyeVR5cGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IExvZ0xldmVsLCBOdWxsTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLmpzJztcbmltcG9ydCB7IElNY3BIb3N0RGVsZWdhdGUsIElNY3BNZXNzYWdlVHJhbnNwb3J0LCBJTWNwUmVnaXN0cnksIElNY3BSZXNvbHZlQ29ubmVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFNlcnZlckNvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbm5lY3Rpb24sIExhenlDb2xsZWN0aW9uU3RhdGUsIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uUmVmZXJlbmNlLCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcERlZmluaXRpb25SZWZlcmVuY2UsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUsIE1jcFNlcnZlclRydXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgSU1jcE1lc3NhZ2VUcmFuc3BvcnQgZm9yIHRlc3RpbmcgcHVycG9zZXMuXG4gKiBBbGxvd3MgdGVzdHMgdG8gZWFzaWx5IHNlbmQvcmVjZWl2ZSBtZXNzYWdlcyBhbmQgY29udHJvbCB0aGUgY29ubmVjdGlvbiBzdGF0ZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BNZXNzYWdlVHJhbnNwb3J0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMb2cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGxldmVsOiBMb2dMZXZlbDsgbWVzc2FnZTogc3RyaW5nIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRMb2cgPSB0aGlzLl9vbkRpZExvZy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TUNQLkpTT05SUENNZXNzYWdlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVjZWl2ZU1lc3NhZ2UgPSB0aGlzLl9vbkRpZFJlY2VpdmVNZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlVmFsdWUgPSBvYnNlcnZhYmxlVmFsdWU8TWNwQ29ubmVjdGlvblN0YXRlPigndGVzdFRyYW5zcG9ydFN0YXRlJywgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmcgfSk7XG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZSA9IHRoaXMuX3N0YXRlVmFsdWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VudE1lc3NhZ2VzOiBNQ1AuSlNPTlJQQ01lc3NhZ2VbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNldFJlc3BvbmRlcignaW5pdGlhbGl6ZScsICgpID0+ICh7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IDEsIC8vIFRoZSBoYW5kbGVyIHVzZXMgMSBmb3IgdGhlIGZpcnN0IHJlcXVlc3Rcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb246IE1DUC5MQVRFU1RfUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdFx0c2VydmVySW5mbzoge1xuXHRcdFx0XHRcdG5hbWU6ICdUZXN0IE1DUCBTZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRcdHJlc291cmNlczoge1xuXHRcdFx0XHRcdFx0c3VwcG9ydGVkVHlwZXM6IFsndGV4dC9wbGFpbiddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dG9vbHM6IHtcblx0XHRcdFx0XHRcdHN1cHBvcnRzQ2FuY2VsbGF0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgYSByZXNwb25kZXIgZnVuY3Rpb24gZm9yIGEgc3BlY2lmaWMgbWV0aG9kLlxuXHQgKiBUaGUgcmVzcG9uZGVyIHJlY2VpdmVzIHRoZSBzZW50IG1lc3NhZ2UgYW5kIHNob3VsZCByZXR1cm4gYSByZXNwb25zZSBvYmplY3QsXG5cdCAqIHdoaWNoIHdpbGwgYmUgc2ltdWxhdGVkIGFzIGEgc2VydmVyIHJlc3BvbnNlLlxuXHQgKi9cblx0cHVibGljIHNldFJlc3BvbmRlcihtZXRob2Q6IHN0cmluZywgcmVzcG9uZGVyOiAobWVzc2FnZTogdW5rbm93bikgPT4gTUNQLkpTT05SUENNZXNzYWdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9yZXNwb25kZXJzKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25kZXJzID0gbmV3IE1hcCgpO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNwb25kZXJzLnNldChtZXRob2QsIHJlc3BvbmRlcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNwb25kZXJzPzogTWFwPHN0cmluZywgKG1lc3NhZ2U6IE1DUC5KU09OUlBDTWVzc2FnZSkgPT4gTUNQLkpTT05SUENNZXNzYWdlIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogU2VuZCBhIG1lc3NhZ2UgdGhyb3VnaCB0aGUgdHJhbnNwb3J0LlxuXHQgKi9cblx0cHVibGljIHNlbmQobWVzc2FnZTogTUNQLkpTT05SUENNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VudE1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0aWYgKHRoaXMuX3Jlc3BvbmRlcnMgJiYgJ21ldGhvZCcgaW4gbWVzc2FnZSAmJiB0eXBlb2YgbWVzc2FnZS5tZXRob2QgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCByZXNwb25kZXIgPSB0aGlzLl9yZXNwb25kZXJzLmdldChtZXNzYWdlLm1ldGhvZCk7XG5cdFx0XHRpZiAocmVzcG9uZGVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uZGVyKG1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuc2ltdWxhdGVSZWNlaXZlTWVzc2FnZShyZXNwb25zZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3AgdGhlIHRyYW5zcG9ydC5cblx0ICovXG5cdHB1YmxpYyBzdG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlVmFsdWUuc2V0KHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIFRlc3QgSGVscGVyIE1ldGhvZHNcblxuXHQvKipcblx0ICogU2ltdWxhdGUgcmVjZWl2aW5nIGEgbWVzc2FnZSBmcm9tIHRoZSBzZXJ2ZXIuXG5cdCAqL1xuXHRwdWJsaWMgc2ltdWxhdGVSZWNlaXZlTWVzc2FnZShtZXNzYWdlOiBNQ1AuSlNPTlJQQ01lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlY2VpdmVNZXNzYWdlLmZpcmUobWVzc2FnZSk7XG5cdH1cblxuXHQvKipcblx0ICogU2ltdWxhdGVzIGEgcmVwbHkgdG8gYW4gJ2luaXRpYWxpemVkJyByZXF1ZXN0LlxuXHQgKi9cblx0cHVibGljIHNpbXVsYXRlSW5pdGlhbGl6ZWQoKSB7XG5cdFx0aWYgKCF0aGlzLl9zZW50TWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2luaXRpYWxpemUgd2FzIG5vdCBjYWxsZWQgeWV0Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04sXG5cdFx0XHRpZDogKHRoaXMuZ2V0U2VudE1lc3NhZ2VzKClbMF0gYXMgTUNQLkpTT05SUENSZXF1ZXN0KS5pZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb246IE1DUC5MQVRFU1RfUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdFx0dG9vbHM6IHt9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXJ2ZXJJbmZvOiB7XG5cdFx0XHRcdFx0bmFtZTogJ1Rlc3QgU2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnXG5cdFx0XHRcdH0sXG5cdFx0XHR9IHNhdGlzZmllcyBNQ1AuSW5pdGlhbGl6ZVJlc3VsdFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNpbXVsYXRlIGEgbG9nIGV2ZW50LlxuXHQgKi9cblx0cHVibGljIHNpbXVsYXRlTG9nKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkTG9nLmZpcmUoeyBsZXZlbDogTG9nTGV2ZWwuSW5mbywgbWVzc2FnZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGNvbm5lY3Rpb24gc3RhdGUuXG5cdCAqL1xuXHRwdWJsaWMgc2V0Q29ubmVjdGlvblN0YXRlKHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZVZhbHVlLnNldChzdGF0ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIG1lc3NhZ2VzIHRoYXQgaGF2ZSBiZWVuIHNlbnQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0U2VudE1lc3NhZ2VzKCk6IHJlYWRvbmx5IE1DUC5KU09OUlBDTWVzc2FnZVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3NlbnRNZXNzYWdlc107XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgdGhlIHNlbnQgbWVzc2FnZXMgaGlzdG9yeS5cblx0ICovXG5cdHB1YmxpYyBjbGVhclNlbnRNZXNzYWdlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zZW50TWVzc2FnZXMubGVuZ3RoID0gMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE1jcFJlZ2lzdHJ5IGltcGxlbWVudHMgSU1jcFJlZ2lzdHJ5IHtcblx0cHVibGljIG1ha2VUZXN0VHJhbnNwb3J0ID0gKCkgPT4gbmV3IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0KCk7XG5cblx0Y29uc3RydWN0b3IoQElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSB7IH1cblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdG9uRGlkQ2hhbmdlSW5wdXRzID0gRXZlbnQuTm9uZTtcblx0Y29sbGVjdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgTWNwQ29sbGVjdGlvbkRlZmluaXRpb25bXT4odGhpcywgW3tcblx0XHRpZDogJ3Rlc3QtY29sbGVjdGlvbicsXG5cdFx0cmVtb3RlQXV0aG9yaXR5OiBudWxsLFxuXHRcdGxhYmVsOiAnVGVzdCBDb2xsZWN0aW9uJyxcblx0XHRjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRvcmRlcjogMCxcblx0XHRzZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFt7XG5cdFx0XHRpZDogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdGxhYmVsOiAnVGVzdCBTZXJ2ZXInLFxuXHRcdFx0bGF1bmNoOiB7IHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydIZWxsbyBNQ1AnXSwgZW52OiB7fSwgZW52RmlsZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCwgc2FuZGJveDogdW5kZWZpbmVkIH0sXG5cdFx0XHRjYWNoZU5vbmNlOiAnYScsXG5cdFx0fSBzYXRpc2ZpZXMgTWNwU2VydmVyRGVmaW5pdGlvbl0pLFxuXHRcdHRydXN0QmVoYXZpb3I6IE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZCxcblx0XHRzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHR9XSk7XG5cdGRlbGVnYXRlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJTWNwSG9zdERlbGVnYXRlW10+KHRoaXMsIFt7XG5cdFx0cHJpb3JpdHk6IDAsXG5cdFx0Y2FuU3RhcnQ6ICgpID0+IHRydWUsXG5cdFx0c3Vic3RpdHV0ZVZhcmlhYmxlcyhzZXJ2ZXJEZWZpbml0aW9uLCBsYXVuY2gpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobGF1bmNoKTtcblx0XHR9LFxuXHRcdHN0YXJ0OiAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gdGhpcy5tYWtlVGVzdFRyYW5zcG9ydCgpO1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pKTtcblx0XHRcdHJldHVybiB0O1xuXHRcdH0sXG5cdFx0d2FpdEZvckluaXRpYWxQcm92aWRlclByb21pc2VzOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0fV0pO1xuXHRsYXp5Q29sbGVjdGlvblN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHsgc3RhdGU6IExhenlDb2xsZWN0aW9uU3RhdGUuQWxsS25vd24sIGNvbGxlY3Rpb25zOiBbXSB9KTtcblx0Y29sbGVjdGlvblRvb2xQcmVmaXgoY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvblJlZmVyZW5jZSk6IElPYnNlcnZhYmxlPHN0cmluZz4ge1xuXHRcdHJldHVybiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPih0aGlzLCBgbWNwLSR7Y29sbGVjdGlvbi5pZH0tYCk7XG5cdH1cblx0Z2V0U2VydmVyRGVmaW5pdGlvbihjb2xsZWN0aW9uUmVmOiBNY3BEZWZpbml0aW9uUmVmZXJlbmNlLCBkZWZpbml0aW9uUmVmOiBNY3BEZWZpbml0aW9uUmVmZXJlbmNlKTogSU9ic2VydmFibGU8eyBzZXJ2ZXI6IE1jcFNlcnZlckRlZmluaXRpb24gfCB1bmRlZmluZWQ7IGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBjb2xsZWN0aW9uT2JzID0gdGhpcy5jb2xsZWN0aW9ucy5tYXAoY29scyA9PiBjb2xzLmZpbmQoYyA9PiBjLmlkID09PSBjb2xsZWN0aW9uUmVmLmlkKSk7XG5cdFx0cmV0dXJuIGNvbGxlY3Rpb25PYnMubWFwKChjb2xsZWN0aW9uLCByZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlciA9IGNvbGxlY3Rpb24/LnNlcnZlckRlZmluaXRpb25zLnJlYWQocmVhZGVyKS5maW5kKHMgPT4gcy5pZCA9PT0gZGVmaW5pdGlvblJlZi5pZCk7XG5cdFx0XHRyZXR1cm4geyBjb2xsZWN0aW9uLCBzZXJ2ZXIgfTtcblx0XHR9KTtcblx0fVxuXHRkaXNjb3ZlckNvbGxlY3Rpb25zKCk6IFByb21pc2U8TWNwQ29sbGVjdGlvbkRlZmluaXRpb25bXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRyZWdpc3RlckRlbGVnYXRlKGRlbGVnYXRlOiBJTWNwSG9zdERlbGVnYXRlKTogSURpc3Bvc2FibGUge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRyZWdpc3RlckNvbGxlY3Rpb24oY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJlc2V0VHJ1c3QoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGNsZWFyU2F2ZWRJbnB1dHMoc2NvcGU6IFN0b3JhZ2VTY29wZSwgaW5wdXRJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRlZGl0U2F2ZWRJbnB1dChpbnB1dElkOiBzdHJpbmcsIGZvbGRlckRhdGE6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCBjb25maWdTZWN0aW9uOiBzdHJpbmcsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzZXRTYXZlZElucHV0KGlucHV0SWQ6IHN0cmluZywgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldFNhdmVkSW5wdXRzKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBQcm9taXNlPHsgW2lkOiBzdHJpbmddOiBJUmVzb2x2ZWRWYWx1ZSB9PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJlc29sdmVDb25uZWN0aW9uKG9wdGlvbnM6IElNY3BSZXNvbHZlQ29ubmVjdGlvbk9wdGlvbnMpOiBQcm9taXNlPElNY3BTZXJ2ZXJDb25uZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IHRoaXMuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IG9wdGlvbnMuY29sbGVjdGlvblJlZi5pZCk7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbiA9IGNvbGxlY3Rpb24/LnNlcnZlckRlZmluaXRpb25zLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBvcHRpb25zLmRlZmluaXRpb25SZWYuaWQpO1xuXHRcdGlmICghY29sbGVjdGlvbiB8fCAhZGVmaW5pdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2xsZWN0aW9uIG9yIGRlZmluaXRpb24gbm90IGZvdW5kOiAke29wdGlvbnMuY29sbGVjdGlvblJlZi5pZH0sICR7b3B0aW9ucy5kZWZpbml0aW9uUmVmLmlkfWApO1xuXHRcdH1cblx0XHRjb25zdCBkZWwgPSB0aGlzLmRlbGVnYXRlcy5nZXQoKVswXTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBNY3BTZXJ2ZXJDb25uZWN0aW9uKFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdGRlZmluaXRpb24sXG5cdFx0XHRkZWwsXG5cdFx0XHRkZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdG9wdGlvbnMudGFza01hbmFnZXIsXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0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
