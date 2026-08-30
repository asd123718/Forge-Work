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
import { decodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { equals } from "../../../../base/common/objects.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IImageResizeService } from "../../../../platform/imageResize/common/imageResizeService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { mcpAppsEnabledConfig } from "../../../../platform/mcp/common/mcpManagement.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { isContributionEnabled } from "../../chat/common/enablement.js";
import { ChatResponseResource, getAttachableImageExtension } from "../../chat/common/model/chatModel.js";
import { LanguageModelPartAudience } from "../../chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { IMcpService, McpResourceURI, McpToolResourceLinkMimeType, McpToolVisibility } from "./mcpTypes.js";
import { mcpServerToSourceData } from "./mcpTypesUtils.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { McpServer } from "./mcpServer.js";
let McpLanguageModelToolContribution = class extends Disposable {
  constructor(_toolsService, mcpService, _instantiationService, _mcpRegistry, lifecycleService) {
    super();
    this._toolsService = _toolsService;
    this._instantiationService = _instantiationService;
    this._mcpRegistry = _mcpRegistry;
    this.lifecycleService = lifecycleService;
    const previous = this._register(new DisposableMap());
    this._register(autorun((reader) => {
      const servers = mcpService.servers.read(reader);
      const toDelete = new Set(previous.keys());
      for (const server of servers) {
        if (!isContributionEnabled(server.enablement.read(reader))) {
          continue;
        }
        const previousRec = previous.get(server);
        if (previousRec) {
          toDelete.delete(server);
          if (!previousRec.source || equals(previousRec.source, mcpServerToSourceData(server, reader))) {
            continue;
          }
          previousRec.dispose();
        }
        const store = new DisposableStore();
        const rec = { dispose: () => store.dispose() };
        const toolSet = new Lazy(() => {
          const source = rec.source = mcpServerToSourceData(server);
          const referenceName = server.definition.label.toLowerCase().replace(/\s+/g, "-");
          const toolSet2 = store.add(this._toolsService.createToolSet(
            source,
            server.definition.id,
            referenceName,
            {
              icon: Codicon.mcp,
              description: localize("mcp.toolset", "{0}: All Tools", server.definition.label),
              deprecated: true
            }
          ));
          return { toolSet: toolSet2, source };
        });
        this._syncTools(server, toolSet, store);
        previous.set(server, rec);
      }
      for (const key of toDelete) {
        previous.deleteAndDispose(key);
      }
    }));
  }
  _syncTools(server, collectionData, store) {
    const tools = /* @__PURE__ */ new Map();
    const collectionObservable = this._mcpRegistry.collections.map((collections) => collections.find((c) => c.id === server.collection.id));
    store.add(autorun((reader) => {
      const toDelete = new Set(tools.keys());
      const toRegister = [];
      const registerTool = (tool, toolData, store2) => {
        store2.add(this._toolsService.registerTool(toolData, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
        store2.add(collectionData.value.toolSet.addTool(toolData));
      };
      if (this.lifecycleService.willShutdown) {
        return;
      }
      const collection = collectionObservable.read(reader);
      if (!collection) {
        tools.forEach((t) => t.store.dispose());
        tools.clear();
        return;
      }
      for (const tool of server.tools.read(reader)) {
        if (!(tool.visibility & McpToolVisibility.Model)) {
          continue;
        }
        const existing = tools.get(tool.id);
        const icons = tool.icons.getUrl(22);
        const toolData = {
          id: tool.id,
          source: collectionData.value.source,
          icon: icons || Codicon.tools,
          // duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
          displayName: tool.definition.annotations?.title || tool.definition.title || tool.definition.name,
          toolReferenceName: tool.referenceName,
          modelDescription: tool.definition.description ?? "",
          userDescription: tool.definition.description ?? "",
          inputSchema: tool.definition.inputSchema,
          canBeReferencedInPrompt: true,
          alwaysDisplayInputOutput: true,
          canRequestPreApproval: !tool.definition.annotations?.readOnlyHint,
          canRequestPostApproval: !!tool.definition.annotations?.openWorldHint,
          runsInWorkspace: collection?.scope === StorageScope.WORKSPACE || !!collection?.remoteAuthority,
          tags: ["mcp"]
        };
        if (existing) {
          if (!equals(existing.toolData, toolData)) {
            existing.toolData = toolData;
            existing.store.clear();
            registerTool(tool, toolData, existing.store);
          }
          toDelete.delete(tool.id);
        } else {
          const store2 = new DisposableStore();
          toRegister.push(() => registerTool(tool, toolData, store2));
          tools.set(tool.id, { toolData, store: store2 });
        }
      }
      for (const id of toDelete) {
        const tool = tools.get(id);
        if (tool) {
          tool.store.dispose();
          tools.delete(id);
        }
      }
      for (const fn of toRegister) {
        fn();
      }
      this._toolsService.flushToolUpdates();
    }));
    store.add(toDisposable(() => {
      for (const tool of tools.values()) {
        tool.store.dispose();
      }
    }));
  }
};
McpLanguageModelToolContribution.ID = "workbench.contrib.mcp.languageModelTools";
McpLanguageModelToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMcpRegistry),
  __decorateParam(4, ILifecycleService)
], McpLanguageModelToolContribution);
let McpToolImplementation = class {
  constructor(_tool, _server, _configurationService, _productService, _fileService, _imageResizeService) {
    this._tool = _tool;
    this._server = _server;
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._fileService = _fileService;
    this._imageResizeService = _imageResizeService;
  }
  async prepareToolInvocation(context) {
    const tool = this._tool;
    const server = this._server;
    const sandboxEnabled = await McpServer.callOn(server, async (_handler, connection) => {
      return connection.definition.sandboxEnabled;
    });
    const isSandboxedServer = sandboxEnabled === true;
    const mcpToolWarning = localize(
      "mcp.tool.warning",
      "Note that MCP servers or malicious conversation content may attempt to misuse '{0}' through tools.",
      this._productService.nameShort
    );
    const title = tool.definition.annotations?.title || tool.definition.title || "`" + tool.definition.name + "`";
    let confirm;
    if (!isSandboxedServer) {
      confirm = {};
      if (!tool.definition.annotations?.readOnlyHint) {
        confirm.title = new MarkdownString(localize("msg.title", "Run {0}", title));
        confirm.message = new MarkdownString(tool.definition.description, { supportThemeIcons: true });
        confirm.disclaimer = mcpToolWarning;
        confirm.allowAutoConfirm = true;
      }
      if (tool.definition.annotations?.openWorldHint) {
        confirm.confirmResults = true;
      }
    }
    const mcpUiEnabled = this._configurationService.getValue(mcpAppsEnabledConfig);
    return {
      confirmationMessages: confirm,
      invocationMessage: new MarkdownString(localize("msg.run", "Running {0}", title)),
      pastTenseMessage: new MarkdownString(localize("msg.ran", "Ran {0} ", title)),
      originMessage: localize("msg.subtitle", "{0} (MCP Server)", server.definition.label),
      toolSpecificData: {
        kind: "input",
        rawInput: context.parameters,
        mcpAppData: mcpUiEnabled && tool.uiResourceUri ? {
          kind: "local",
          resourceUri: tool.uiResourceUri,
          serverDefinitionId: server.definition.id,
          collectionId: server.collection.id
        } : void 0
      }
    };
  }
  async invoke(invocation, _countTokens, progress, token) {
    const result = {
      content: []
    };
    const callResult = await this._tool.callWithProgress(invocation.parameters, progress, {
      chatRequestId: invocation.chatRequestId,
      chatSessionResource: invocation.context?.sessionResource,
      traceparent: invocation.traceparent,
      tracestate: invocation.tracestate
    }, token);
    const details = {
      input: JSON.stringify(invocation.parameters, void 0, 2),
      output: [],
      isError: callResult.isError === true
    };
    for (const item of callResult.content) {
      const audience = item.annotations?.audience?.map((a) => {
        if (a === "assistant") {
          return LanguageModelPartAudience.Assistant;
        } else if (a === "user") {
          return LanguageModelPartAudience.User;
        } else {
          return void 0;
        }
      }).filter(isDefined);
      if (audience?.includes(LanguageModelPartAudience.User)) {
        if (item.type === "text") {
          progress.report({ message: item.text });
        }
      }
      const addAsInlineData = async (mimeType, value, uri) => {
        details.output.push({ type: "embed", mimeType, value, uri, audience });
        if (isForModel) {
          let finalData;
          try {
            const resized = await this._imageResizeService.resizeImage(decodeBase64(value).buffer, mimeType);
            finalData = VSBuffer.wrap(resized);
          } catch {
            finalData = decodeBase64(value);
          }
          result.content.push({ kind: "data", value: { mimeType, data: finalData }, audience });
        }
      };
      const addAsLinkedResource = (uri, mimeType) => {
        const json = { uri, underlyingMimeType: mimeType };
        result.content.push({
          kind: "data",
          audience,
          value: {
            mimeType: McpToolResourceLinkMimeType,
            data: VSBuffer.fromString(JSON.stringify(json))
          }
        });
      };
      const isForModel = !audience || audience.includes(LanguageModelPartAudience.Assistant);
      if (item.type === "text") {
        details.output.push({ type: "embed", isText: true, value: item.text });
        if (isForModel && !callResult.structuredContent) {
          result.content.push({
            kind: "text",
            audience,
            value: item.text
          });
        }
      } else if (item.type === "image" || item.type === "audio") {
        await addAsInlineData(item.mimeType || "image/png", item.data);
      } else if (item.type === "resource_link") {
        const uri = McpResourceURI.fromServer(this._server.definition, item.uri);
        details.output.push({
          type: "ref",
          uri,
          audience,
          mimeType: item.mimeType
        });
        if (isForModel) {
          if (item.mimeType && getAttachableImageExtension(item.mimeType)) {
            result.content.push({
              kind: "data",
              audience,
              value: {
                mimeType: item.mimeType,
                data: await this._fileService.readFile(uri).then((f) => f.value).catch(() => VSBuffer.alloc(0))
              }
            });
          } else {
            addAsLinkedResource(uri, item.mimeType);
          }
        }
      } else if (item.type === "resource") {
        const uri = McpResourceURI.fromServer(this._server.definition, item.resource.uri);
        if (item.resource.mimeType && getAttachableImageExtension(item.resource.mimeType) && "blob" in item.resource) {
          await addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
        } else {
          details.output.push({
            type: "embed",
            uri,
            isText: "text" in item.resource,
            mimeType: item.resource.mimeType,
            value: "blob" in item.resource ? item.resource.blob : item.resource.text,
            audience,
            asResource: true
          });
          if (isForModel) {
            const permalink = invocation.context && ChatResponseResource.createUri(invocation.context.sessionResource, invocation.chatStreamToolCallId || invocation.callId, result.content.length, basename(uri));
            addAsLinkedResource(permalink || uri, item.resource.mimeType);
          }
        }
      }
    }
    if (callResult.structuredContent) {
      details.output.push({ type: "embed", isText: true, value: JSON.stringify(callResult.structuredContent, null, 2), audience: [LanguageModelPartAudience.Assistant] });
      result.content.push({ kind: "text", value: JSON.stringify(callResult.structuredContent), audience: [LanguageModelPartAudience.Assistant] });
    }
    if (this._tool.uiResourceUri) {
      details.mcpOutput = callResult;
    }
    result.toolResultDetails = details;
    return result;
  }
};
McpToolImplementation = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IImageResizeService)
], McpToolImplementation);
export {
  McpLanguageModelToolContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BMYW5ndWFnZU1vZGVsVG9vbENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkLCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW1hZ2VSZXNpemVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW1hZ2VSZXNpemUvY29tbW9uL2ltYWdlUmVzaXplU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWNwQXBwc0VuYWJsZWRDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgaXNDb250cmlidXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZSwgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMsIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgSVRvb2xSZXN1bHQsIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzLCBUb29sU2V0IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlciwgSU1jcFNlcnZpY2UsIElNY3BUb29sLCBJTWNwVG9vbFJlc291cmNlTGlua0NvbnRlbnRzLCBNY3BSZXNvdXJjZVVSSSwgTWNwVG9vbFJlc291cmNlTGlua01pbWVUeXBlLCBNY3BUb29sVmlzaWJpbGl0eSB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgbWNwU2VydmVyVG9Tb3VyY2VEYXRhIH0gZnJvbSAnLi9tY3BUeXBlc1V0aWxzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyIH0gZnJvbSAnLi9tY3BTZXJ2ZXIuanMnO1xuXG5pbnRlcmZhY2UgSVN5bmNlZFRvb2xEYXRhIHtcblx0dG9vbERhdGE6IElUb29sRGF0YTtcblx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcExhbmd1YWdlTW9kZWxUb29sQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubWNwLmxhbmd1YWdlTW9kZWxUb29scyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX21jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0eXBlIFJlYyA9IHsgc291cmNlPzogVG9vbERhdGFTb3VyY2UgfSAmIElEaXNwb3NhYmxlO1xuXG5cdFx0Ly8gS2VlcCB0b29scyBpbiBzeW5jIHdpdGggdGhlIHRvb2xzIHNlcnZpY2UuXG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJTWNwU2VydmVyLCBSZWM+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSBtY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IG5ldyBTZXQocHJldmlvdXMua2V5cygpKTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdFx0Ly8gU2tpcCBkaXNhYmxlZCBzZXJ2ZXJzIFx1MjAxNCBkb24ndCByZWdpc3RlciB0aGVpciB0b29scy5cblx0XHRcdFx0aWYgKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoc2VydmVyLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJldmlvdXNSZWMgPSBwcmV2aW91cy5nZXQoc2VydmVyKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzUmVjKSB7XG5cdFx0XHRcdFx0dG9EZWxldGUuZGVsZXRlKHNlcnZlcik7XG5cdFx0XHRcdFx0aWYgKCFwcmV2aW91c1JlYy5zb3VyY2UgfHwgZXF1YWxzKHByZXZpb3VzUmVjLnNvdXJjZSwgbWNwU2VydmVyVG9Tb3VyY2VEYXRhKHNlcnZlciwgcmVhZGVyKSkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBzYW1lIGRlZmluaXRpb24sIG5vIG5lZWQgdG8gdXBkYXRlXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cHJldmlvdXNSZWMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHJlYzogUmVjID0geyBkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCkgfTtcblx0XHRcdFx0Y29uc3QgdG9vbFNldCA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSByZWMuc291cmNlID0gbWNwU2VydmVyVG9Tb3VyY2VEYXRhKHNlcnZlcik7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlTmFtZSA9IHNlcnZlci5kZWZpbml0aW9uLmxhYmVsLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXFxzKy9nLCAnLScpOyAvLyBzZWUgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3ODE1MlxuXHRcdFx0XHRcdGNvbnN0IHRvb2xTZXQgPSBzdG9yZS5hZGQodGhpcy5fdG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdFx0XHRzZXJ2ZXIuZGVmaW5pdGlvbi5pZCxcblx0XHRcdFx0XHRcdHJlZmVyZW5jZU5hbWUsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGljb246IENvZGljb24ubWNwLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC50b29sc2V0JywgXCJ7MH06IEFsbCBUb29sc1wiLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdFx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KSk7XG5cblx0XHRcdFx0XHRyZXR1cm4geyB0b29sU2V0LCBzb3VyY2UgfTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5fc3luY1Rvb2xzKHNlcnZlciwgdG9vbFNldCwgc3RvcmUpO1xuXHRcdFx0XHRwcmV2aW91cy5zZXQoc2VydmVyLCByZWMpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB0b0RlbGV0ZSkge1xuXHRcdFx0XHRwcmV2aW91cy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY1Rvb2xzKHNlcnZlcjogSU1jcFNlcnZlciwgY29sbGVjdGlvbkRhdGE6IExhenk8eyB0b29sU2V0OiBUb29sU2V0OyBzb3VyY2U6IFRvb2xEYXRhU291cmNlIH0+LCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0Y29uc3QgdG9vbHMgPSBuZXcgTWFwPC8qIHRvb2wgSUQgKi9zdHJpbmcsIElTeW5jZWRUb29sRGF0YT4oKTtcblxuXHRcdGNvbnN0IGNvbGxlY3Rpb25PYnNlcnZhYmxlID0gdGhpcy5fbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb25zID0+XG5cdFx0XHRjb2xsZWN0aW9ucy5maW5kKGMgPT4gYy5pZCA9PT0gc2VydmVyLmNvbGxlY3Rpb24uaWQpKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IG5ldyBTZXQodG9vbHMua2V5cygpKTtcblxuXHRcdFx0Ly8gdG9SZWdpc3RlciBpcyBkZWZlcnJlZCB1bnRpbCBkZWxldGluZyB0b29scyB0aGF0IG1vdmluZyBhIHRvb2wgYmV0d2VlblxuXHRcdFx0Ly8gc2VydmVycyAob3IgZGVsZXRpbmcgb25lIGluc3RhbmNlIG9mIGEgbXVsdGktaW5zdGFuY2Ugc2VydmVyKSBkb2Vzbid0IGNhdXNlIGFuIGVycm9yLlxuXHRcdFx0Y29uc3QgdG9SZWdpc3RlcjogKCgpID0+IHZvaWQpW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyVG9vbCA9ICh0b29sOiBJTWNwVG9vbCwgdG9vbERhdGE6IElUb29sRGF0YSwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSkgPT4ge1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5fdG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbCh0b29sRGF0YSwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwVG9vbEltcGxlbWVudGF0aW9uLCB0b29sLCBzZXJ2ZXIpKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChjb2xsZWN0aW9uRGF0YS52YWx1ZS50b29sU2V0LmFkZFRvb2wodG9vbERhdGEpKTtcblx0XHRcdH07XG5cblx0XHRcdC8vIERvbid0IGJvdGhlciBjbGVhbmluZyB1cCB0b29scyBpbnRlcm5hbGx5IGR1cmluZyBzaHV0ZG93bi4gVGhpcyBqdXN0IGNvc3RzIHRpbWUgZm9yIG5vIGJlbmVmaXQuXG5cdFx0XHRpZiAodGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBjb2xsZWN0aW9uT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWNvbGxlY3Rpb24pIHtcblx0XHRcdFx0dG9vbHMuZm9yRWFjaCh0ID0+IHQuc3RvcmUuZGlzcG9zZSgpKTtcblx0XHRcdFx0dG9vbHMuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2Ygc2VydmVyLnRvb2xzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHQvLyBTa2lwIGFwcC1vbmx5IHRvb2xzIC0gdGhleSBzaG91bGQgbm90IGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGUgbGFuZ3VhZ2UgbW9kZWwgdG9vbHMgc2VydmljZVxuXHRcdFx0XHRpZiAoISh0b29sLnZpc2liaWxpdHkgJiBNY3BUb29sVmlzaWJpbGl0eS5Nb2RlbCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdG9vbHMuZ2V0KHRvb2wuaWQpO1xuXHRcdFx0XHRjb25zdCBpY29ucyA9IHRvb2wuaWNvbnMuZ2V0VXJsKDIyKTtcblx0XHRcdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0XHRpZDogdG9vbC5pZCxcblx0XHRcdFx0XHRzb3VyY2U6IGNvbGxlY3Rpb25EYXRhLnZhbHVlLnNvdXJjZSxcblx0XHRcdFx0XHRpY29uOiBpY29ucyB8fCBDb2RpY29uLnRvb2xzLFxuXHRcdFx0XHRcdC8vIGR1cGxpY2F0aXZlOiBodHRwczovL2dpdGh1Yi5jb20vbW9kZWxjb250ZXh0cHJvdG9jb2wvbW9kZWxjb250ZXh0cHJvdG9jb2wvcHVsbC84MTNcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogdG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy50aXRsZSB8fCB0b29sLmRlZmluaXRpb24udGl0bGUgfHwgdG9vbC5kZWZpbml0aW9uLm5hbWUsXG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6IHRvb2wucmVmZXJlbmNlTmFtZSxcblx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiB0b29sLmRlZmluaXRpb24uZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0dXNlckRlc2NyaXB0aW9uOiB0b29sLmRlZmluaXRpb24uZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHRvb2wuZGVmaW5pdGlvbi5pbnB1dFNjaGVtYSxcblx0XHRcdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdFx0XHRhbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQ6IHRydWUsXG5cdFx0XHRcdFx0Y2FuUmVxdWVzdFByZUFwcHJvdmFsOiAhdG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy5yZWFkT25seUhpbnQsXG5cdFx0XHRcdFx0Y2FuUmVxdWVzdFBvc3RBcHByb3ZhbDogISF0b29sLmRlZmluaXRpb24uYW5ub3RhdGlvbnM/Lm9wZW5Xb3JsZEhpbnQsXG5cdFx0XHRcdFx0cnVuc0luV29ya3NwYWNlOiBjb2xsZWN0aW9uPy5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLldPUktTUEFDRSB8fCAhIWNvbGxlY3Rpb24/LnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHR0YWdzOiBbJ21jcCddLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdGlmICghZXF1YWxzKGV4aXN0aW5nLnRvb2xEYXRhLCB0b29sRGF0YSkpIHtcblx0XHRcdFx0XHRcdGV4aXN0aW5nLnRvb2xEYXRhID0gdG9vbERhdGE7XG5cdFx0XHRcdFx0XHRleGlzdGluZy5zdG9yZS5jbGVhcigpO1xuXHRcdFx0XHRcdFx0Ly8gV2UgbmVlZCB0byByZS1yZWdpc3RlciBib3RoIHRoZSBkYXRhIGFuZCBpbXBsZW1lbnRhdGlvbiwgYXMgdGhlXG5cdFx0XHRcdFx0XHQvLyBpbXBsZW1lbnRhdGlvbiBpcyBkaXNjYXJkZWQgd2hlbiB0aGUgZGF0YSBpcyByZW1vdmVkICgjMjQ1OTIxKVxuXHRcdFx0XHRcdFx0cmVnaXN0ZXJUb29sKHRvb2wsIHRvb2xEYXRhLCBleGlzdGluZy5zdG9yZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRvRGVsZXRlLmRlbGV0ZSh0b29sLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHR0b1JlZ2lzdGVyLnB1c2goKCkgPT4gcmVnaXN0ZXJUb29sKHRvb2wsIHRvb2xEYXRhLCBzdG9yZSkpO1xuXHRcdFx0XHRcdHRvb2xzLnNldCh0b29sLmlkLCB7IHRvb2xEYXRhLCBzdG9yZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRvRGVsZXRlKSB7XG5cdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAodG9vbCkge1xuXHRcdFx0XHRcdHRvb2wuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBmbiBvZiB0b1JlZ2lzdGVyKSB7XG5cdFx0XHRcdGZuKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEltcG9ydGFudDogZmx1c2ggdG9vbCB1cGRhdGVzIHdoZW4gdGhlIHNlcnZlciBpcyBmdWxseSByZWdpc3RlcmVkIHNvIHRoYXRcblx0XHRcdC8vIGFueSBjb25zdW1pbmcgKGUuZy4gYXV0b3N0YXJ0aW5nKSByZXF1ZXN0cyBoYXZlIHRoZSB0b29scyBhdmFpbGFibGUgaW1tZWRpYXRlbHkuXG5cdFx0XHR0aGlzLl90b29sc1NlcnZpY2UuZmx1c2hUb29sVXBkYXRlcygpO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHRvb2wuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBNY3BUb29sSW1wbGVtZW50YXRpb24gaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b29sOiBJTWNwVG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXI6IElNY3BTZXJ2ZXIsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbWFnZVJlc2l6ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW1hZ2VSZXNpemVTZXJ2aWNlOiBJSW1hZ2VSZXNpemVTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQpOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uPiB7XG5cdFx0Y29uc3QgdG9vbCA9IHRoaXMuX3Rvb2w7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fc2VydmVyO1xuXHRcdC8vIFRvRE86IG5lZWQgdG8gYmUgcmV2aXNpdGVkIGFzIHRoZSBmaXJzdCB0b29sIGludm9jYXRpb24gZG9lc250IGhhdmUgc2FuZGJveCBpbmZvIGFuZCB3ZSBhcmUgb3B0aW1pc3RpY2FsbHkgYXNzdW1pbmcgaXQgaXMgbm90IHNhbmRib3hlZC4gV2Ugc2hvdWxkIGlkZWFsbHkgaGF2ZSB0aGUgc2FuZGJveCBpbmZvLlxuXHRcdGNvbnN0IHNhbmRib3hFbmFibGVkID0gYXdhaXQgTWNwU2VydmVyLmNhbGxPbihzZXJ2ZXIsIGFzeW5jIChfaGFuZGxlciwgY29ubmVjdGlvbikgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24uZGVmaW5pdGlvbi5zYW5kYm94RW5hYmxlZDtcblx0XHR9KTtcblx0XHRjb25zdCBpc1NhbmRib3hlZFNlcnZlciA9IHNhbmRib3hFbmFibGVkID09PSB0cnVlO1xuXG5cdFx0Y29uc3QgbWNwVG9vbFdhcm5pbmcgPSBsb2NhbGl6ZShcblx0XHRcdCdtY3AudG9vbC53YXJuaW5nJyxcblx0XHRcdFwiTm90ZSB0aGF0IE1DUCBzZXJ2ZXJzIG9yIG1hbGljaW91cyBjb252ZXJzYXRpb24gY29udGVudCBtYXkgYXR0ZW1wdCB0byBtaXN1c2UgJ3swfScgdGhyb3VnaCB0b29scy5cIixcblx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydFxuXHRcdCk7XG5cblx0XHQvLyBkdXBsaWNhdGl2ZTogaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL21vZGVsY29udGV4dHByb3RvY29sL3B1bGwvODEzXG5cdFx0Y29uc3QgdGl0bGUgPSB0b29sLmRlZmluaXRpb24uYW5ub3RhdGlvbnM/LnRpdGxlIHx8IHRvb2wuZGVmaW5pdGlvbi50aXRsZSB8fCAoJ2AnICsgdG9vbC5kZWZpbml0aW9uLm5hbWUgKyAnYCcpO1xuXG5cdFx0bGV0IGNvbmZpcm06IElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFpc1NhbmRib3hlZFNlcnZlcikge1xuXHRcdFx0Y29uZmlybSA9IHt9O1xuXHRcdFx0aWYgKCF0b29sLmRlZmluaXRpb24uYW5ub3RhdGlvbnM/LnJlYWRPbmx5SGludCkge1xuXHRcdFx0XHRjb25maXJtLnRpdGxlID0gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdtc2cudGl0bGUnLCBcIlJ1biB7MH1cIiwgdGl0bGUpKTtcblx0XHRcdFx0Y29uZmlybS5tZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKHRvb2wuZGVmaW5pdGlvbi5kZXNjcmlwdGlvbiwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uZmlybS5kaXNjbGFpbWVyID0gbWNwVG9vbFdhcm5pbmc7XG5cdFx0XHRcdGNvbmZpcm0uYWxsb3dBdXRvQ29uZmlybSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy5vcGVuV29ybGRIaW50KSB7XG5cdFx0XHRcdGNvbmZpcm0uY29uZmlybVJlc3VsdHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1jcFVpRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KG1jcEFwcHNFbmFibGVkQ29uZmlnKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogY29uZmlybSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21zZy5ydW4nLCBcIlJ1bm5pbmcgezB9XCIsIHRpdGxlKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21zZy5yYW4nLCBcIlJhbiB7MH0gXCIsIHRpdGxlKSksXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiBsb2NhbGl6ZSgnbXNnLnN1YnRpdGxlJywgXCJ7MH0gKE1DUCBTZXJ2ZXIpXCIsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0cmF3SW5wdXQ6IGNvbnRleHQucGFyYW1ldGVycyxcblx0XHRcdFx0bWNwQXBwRGF0YTogbWNwVWlFbmFibGVkICYmIHRvb2wudWlSZXNvdXJjZVVyaSA/IHtcblx0XHRcdFx0XHRraW5kOiAnbG9jYWwnLFxuXHRcdFx0XHRcdHJlc291cmNlVXJpOiB0b29sLnVpUmVzb3VyY2VVcmksXG5cdFx0XHRcdFx0c2VydmVyRGVmaW5pdGlvbklkOiBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCxcblx0XHRcdFx0XHRjb2xsZWN0aW9uSWQ6IHNlcnZlci5jb2xsZWN0aW9uLmlkLFxuXHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVG9vbFJlc3VsdCA9IHtcblx0XHRcdGNvbnRlbnQ6IFtdXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNhbGxSZXN1bHQgPSBhd2FpdCB0aGlzLl90b29sLmNhbGxXaXRoUHJvZ3Jlc3MoaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9ncmVzcywge1xuXHRcdFx0Y2hhdFJlcXVlc3RJZDogaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0cmFjZXBhcmVudDogaW52b2NhdGlvbi50cmFjZXBhcmVudCxcblx0XHRcdHRyYWNlc3RhdGU6IGludm9jYXRpb24udHJhY2VzdGF0ZSxcblx0XHR9LCB0b2tlbik7XG5cdFx0Y29uc3QgZGV0YWlsczogTXV0YWJsZTxJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscz4gPSB7XG5cdFx0XHRpbnB1dDogSlNPTi5zdHJpbmdpZnkoaW52b2NhdGlvbi5wYXJhbWV0ZXJzLCB1bmRlZmluZWQsIDIpLFxuXHRcdFx0b3V0cHV0OiBbXSxcblx0XHRcdGlzRXJyb3I6IGNhbGxSZXN1bHQuaXNFcnJvciA9PT0gdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNhbGxSZXN1bHQuY29udGVudCkge1xuXHRcdFx0Y29uc3QgYXVkaWVuY2UgPSBpdGVtLmFubm90YXRpb25zPy5hdWRpZW5jZT8ubWFwKGEgPT4ge1xuXHRcdFx0XHRpZiAoYSA9PT0gJ2Fzc2lzdGFudCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZS5Bc3Npc3RhbnQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYSA9PT0gJ3VzZXInKSB7XG5cdFx0XHRcdFx0cmV0dXJuIExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UuVXNlcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdFx0Ly8gRXhwbGljaXQgdXNlciBwYXJ0cyBnZXQgcHVzaGVkIHRvIHByb2dyZXNzIHRvIHNob3cgaW4gdGhlIHN0YXR1cyBVSVxuXHRcdFx0aWYgKGF1ZGllbmNlPy5pbmNsdWRlcyhMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLlVzZXIpKSB7XG5cdFx0XHRcdGlmIChpdGVtLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGl0ZW0udGV4dCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXdyaXRlIGltYWdlIHJlc291cmNlcyB0byBpbWFnZXMgc28gdGhleSBhcmUgaW5saW5lZCBuaWNlbHlcblx0XHRcdGNvbnN0IGFkZEFzSW5saW5lRGF0YSA9IGFzeW5jIChtaW1lVHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB1cmk/OiBVUkkpOiBQcm9taXNlPFZTQnVmZmVyIHwgdm9pZD4gPT4ge1xuXHRcdFx0XHRkZXRhaWxzLm91dHB1dC5wdXNoKHsgdHlwZTogJ2VtYmVkJywgbWltZVR5cGUsIHZhbHVlLCB1cmksIGF1ZGllbmNlIH0pO1xuXHRcdFx0XHRpZiAoaXNGb3JNb2RlbCkge1xuXHRcdFx0XHRcdGxldCBmaW5hbERhdGE6IFZTQnVmZmVyO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNpemVkID0gYXdhaXQgdGhpcy5faW1hZ2VSZXNpemVTZXJ2aWNlLnJlc2l6ZUltYWdlKGRlY29kZUJhc2U2NCh2YWx1ZSkuYnVmZmVyLCBtaW1lVHlwZSk7XG5cdFx0XHRcdFx0XHRmaW5hbERhdGEgPSBWU0J1ZmZlci53cmFwKHJlc2l6ZWQpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0ZmluYWxEYXRhID0gZGVjb2RlQmFzZTY0KHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0LmNvbnRlbnQucHVzaCh7IGtpbmQ6ICdkYXRhJywgdmFsdWU6IHsgbWltZVR5cGUsIGRhdGE6IGZpbmFsRGF0YSB9LCBhdWRpZW5jZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWRkQXNMaW5rZWRSZXNvdXJjZSA9ICh1cmk6IFVSSSwgbWltZVR5cGU/OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbjogSU1jcFRvb2xSZXNvdXJjZUxpbmtDb250ZW50cyA9IHsgdXJpLCB1bmRlcmx5aW5nTWltZVR5cGU6IG1pbWVUeXBlIH07XG5cdFx0XHRcdHJlc3VsdC5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdkYXRhJyxcblx0XHRcdFx0XHRhdWRpZW5jZSxcblx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0bWltZVR5cGU6IE1jcFRvb2xSZXNvdXJjZUxpbmtNaW1lVHlwZSxcblx0XHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoanNvbikpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaXNGb3JNb2RlbCA9ICFhdWRpZW5jZSB8fCBhdWRpZW5jZS5pbmNsdWRlcyhMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLkFzc2lzdGFudCk7XG5cdFx0XHRpZiAoaXRlbS50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0ZGV0YWlscy5vdXRwdXQucHVzaCh7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IGl0ZW0udGV4dCB9KTtcblx0XHRcdFx0Ly8gc3RydWN0dXJlZCBjb250ZW50ICdyZXByZXNlbnRzIHRoZSByZXN1bHQgb2YgdGhlIHRvb2wgY2FsbCcsIHNvIHRha2Vcblx0XHRcdFx0Ly8gdGhhdCBpbiBwbGFjZSBvZiBhbnkgdGV4dHVhbCBkZXNjcmlwdGlvbiB3aGVuIHByZXNlbnQuXG5cdFx0XHRcdGlmIChpc0Zvck1vZGVsICYmICFjYWxsUmVzdWx0LnN0cnVjdHVyZWRDb250ZW50KSB7XG5cdFx0XHRcdFx0cmVzdWx0LmNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRhdWRpZW5jZSxcblx0XHRcdFx0XHRcdHZhbHVlOiBpdGVtLnRleHRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdpbWFnZScgfHwgaXRlbS50eXBlID09PSAnYXVkaW8nKSB7XG5cdFx0XHRcdC8vIGRlZmF1bHQgdG8gc29tZSBpbWFnZSB0eXBlIGlmIG5vdCBnaXZlbiB0byBoaW50XG5cdFx0XHRcdGF3YWl0IGFkZEFzSW5saW5lRGF0YShpdGVtLm1pbWVUeXBlIHx8ICdpbWFnZS9wbmcnLCBpdGVtLmRhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdyZXNvdXJjZV9saW5rJykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHRoaXMuX3NlcnZlci5kZWZpbml0aW9uLCBpdGVtLnVyaSk7XG5cdFx0XHRcdGRldGFpbHMub3V0cHV0LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdyZWYnLFxuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRhdWRpZW5jZSxcblx0XHRcdFx0XHRtaW1lVHlwZTogaXRlbS5taW1lVHlwZSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGlzRm9yTW9kZWwpIHtcblx0XHRcdFx0XHRpZiAoaXRlbS5taW1lVHlwZSAmJiBnZXRBdHRhY2hhYmxlSW1hZ2VFeHRlbnNpb24oaXRlbS5taW1lVHlwZSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0XHRcdGF1ZGllbmNlLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRcdG1pbWVUeXBlOiBpdGVtLm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSkudGhlbihmID0+IGYudmFsdWUpLmNhdGNoKCgpID0+IFZTQnVmZmVyLmFsbG9jKDApKSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFkZEFzTGlua2VkUmVzb3VyY2UodXJpLCBpdGVtLm1pbWVUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IE1jcFJlc291cmNlVVJJLmZyb21TZXJ2ZXIodGhpcy5fc2VydmVyLmRlZmluaXRpb24sIGl0ZW0ucmVzb3VyY2UudXJpKTtcblx0XHRcdFx0aWYgKGl0ZW0ucmVzb3VyY2UubWltZVR5cGUgJiYgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uKGl0ZW0ucmVzb3VyY2UubWltZVR5cGUpICYmICdibG9iJyBpbiBpdGVtLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWRkQXNJbmxpbmVEYXRhKGl0ZW0ucmVzb3VyY2UubWltZVR5cGUsIGl0ZW0ucmVzb3VyY2UuYmxvYiwgdXJpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXRhaWxzLm91dHB1dC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6ICdlbWJlZCcsXG5cdFx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0XHRpc1RleHQ6ICd0ZXh0JyBpbiBpdGVtLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6IGl0ZW0ucmVzb3VyY2UubWltZVR5cGUsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ2Jsb2InIGluIGl0ZW0ucmVzb3VyY2UgPyBpdGVtLnJlc291cmNlLmJsb2IgOiBpdGVtLnJlc291cmNlLnRleHQsXG5cdFx0XHRcdFx0XHRhdWRpZW5jZSxcblx0XHRcdFx0XHRcdGFzUmVzb3VyY2U6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAoaXNGb3JNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGVybWFsaW5rID0gaW52b2NhdGlvbi5jb250ZXh0ICYmIENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlLCBpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkIHx8IGludm9jYXRpb24uY2FsbElkLCByZXN1bHQuY29udGVudC5sZW5ndGgsIGJhc2VuYW1lKHVyaSkpO1xuXHRcdFx0XHRcdFx0YWRkQXNMaW5rZWRSZXNvdXJjZShwZXJtYWxpbmsgfHwgdXJpLCBpdGVtLnJlc291cmNlLm1pbWVUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2FsbFJlc3VsdC5zdHJ1Y3R1cmVkQ29udGVudCkge1xuXHRcdFx0ZGV0YWlscy5vdXRwdXQucHVzaCh7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IEpTT04uc3RyaW5naWZ5KGNhbGxSZXN1bHQuc3RydWN0dXJlZENvbnRlbnQsIG51bGwsIDIpLCBhdWRpZW5jZTogW0xhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UuQXNzaXN0YW50XSB9KTtcblx0XHRcdHJlc3VsdC5jb250ZW50LnB1c2goeyBraW5kOiAndGV4dCcsIHZhbHVlOiBKU09OLnN0cmluZ2lmeShjYWxsUmVzdWx0LnN0cnVjdHVyZWRDb250ZW50KSwgYXVkaWVuY2U6IFtMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLkFzc2lzdGFudF0gfSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHJhdyBNQ1Agb3V0cHV0IGZvciBNQ1AgQXBwIFVJIHJlbmRlcmluZyBpZiB0aGlzIHRvb2wgaGFzIFVJXG5cdFx0aWYgKHRoaXMuX3Rvb2wudWlSZXNvdXJjZVVyaSkge1xuXHRcdFx0ZGV0YWlscy5tY3BPdXRwdXQgPSBjYWxsUmVzdWx0O1xuXHRcdH1cblxuXHRcdHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyA9IGRldGFpbHM7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYyxnQkFBZ0I7QUFFdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksZUFBZSxpQkFBOEIsb0JBQW9CO0FBQ3RGLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBMEI7QUFFbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0IsbUNBQW1DO0FBQ2xFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQThCLGtDQUFtUDtBQUNqUixTQUFTLG9CQUFvQjtBQUM3QixTQUFxQixhQUFxRCxnQkFBZ0IsNkJBQTZCLHlCQUF5QjtBQUNoSixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQjtBQU9uQixJQUFNLG1DQUFOLGNBQStDLFdBQTZDO0FBQUEsRUFJbEcsWUFDOEMsZUFDaEMsWUFDMkIsdUJBQ1QsY0FDSyxrQkFDbkM7QUFDRCxVQUFNO0FBTnVDO0FBRUw7QUFDVDtBQUNLO0FBT3BDLFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxjQUErQixDQUFDO0FBQ3BFLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxVQUFVLFdBQVcsUUFBUSxLQUFLLE1BQU07QUFFOUMsWUFBTSxXQUFXLElBQUksSUFBSSxTQUFTLEtBQUssQ0FBQztBQUN4Qyxp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
