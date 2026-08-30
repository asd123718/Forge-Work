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
import { IMcpManagementService } from "./mcpManagement.js";
let McpManagementCli = class {
  constructor(_logger, _mcpManagementService) {
    this._logger = _logger;
    this._mcpManagementService = _mcpManagementService;
  }
  async addMcpDefinitions(definitions) {
    const configs = definitions.map((config) => this.validateConfiguration(config));
    await this.updateMcpInResource(configs);
    this._logger.info(`Added MCP servers: ${configs.map((c) => c.name).join(", ")}`);
  }
  async updateMcpInResource(configs) {
    await Promise.all(configs.map(({ name, config, inputs }) => this._mcpManagementService.install({ name, config, inputs })));
  }
  validateConfiguration(config) {
    let parsed;
    try {
      parsed = JSON.parse(config);
    } catch (e) {
      throw new InvalidMcpOperationError(`Invalid JSON '${config}': ${e}`);
    }
    if (!parsed.name) {
      throw new InvalidMcpOperationError(`Missing name property in ${config}`);
    }
    if (!("command" in parsed) && !("url" in parsed)) {
      throw new InvalidMcpOperationError(`Missing command or URL property in ${config}`);
    }
    const { name, inputs, ...rest } = parsed;
    return { name, inputs, config: rest };
  }
};
McpManagementCli = __decorateClass([
  __decorateParam(1, IMcpManagementService)
], McpManagementCli);
class InvalidMcpOperationError extends Error {
  constructor(message) {
    super(message);
    this.stack = message;
  }
}
export {
  McpManagementCli
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFxjb21tb25cXG1jcE1hbmFnZW1lbnRDbGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTG9nZ2VyIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTZXJ2ZXJWYXJpYWJsZSB9IGZyb20gJy4vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuL21jcE1hbmFnZW1lbnQuanMnO1xuXG50eXBlIFZhbGlkYXRlZENvbmZpZyA9IHsgbmFtZTogc3RyaW5nOyBjb25maWc6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uOyBpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXSB9O1xuXG5leHBvcnQgY2xhc3MgTWNwTWFuYWdlbWVudENsaSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ2dlcixcblx0XHRASU1jcE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJTWNwTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgYWRkTWNwRGVmaW5pdGlvbnMoXG5cdFx0ZGVmaW5pdGlvbnM6IHN0cmluZ1tdLFxuXHQpIHtcblx0XHRjb25zdCBjb25maWdzID0gZGVmaW5pdGlvbnMubWFwKChjb25maWcpID0+IHRoaXMudmFsaWRhdGVDb25maWd1cmF0aW9uKGNvbmZpZykpO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlTWNwSW5SZXNvdXJjZShjb25maWdzKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgQWRkZWQgTUNQIHNlcnZlcnM6ICR7Y29uZmlncy5tYXAoYyA9PiBjLm5hbWUpLmpvaW4oJywgJyl9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZU1jcEluUmVzb3VyY2UoY29uZmlnczogVmFsaWRhdGVkQ29uZmlnW10pIHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChjb25maWdzLm1hcCgoeyBuYW1lLCBjb25maWcsIGlucHV0cyB9KSA9PiB0aGlzLl9tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHsgbmFtZSwgY29uZmlnLCBpbnB1dHMgfSkpKTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVDb25maWd1cmF0aW9uKGNvbmZpZzogc3RyaW5nKTogVmFsaWRhdGVkQ29uZmlnIHtcblx0XHRsZXQgcGFyc2VkOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiAmIHsgbmFtZTogc3RyaW5nOyBpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXSB9O1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKGNvbmZpZyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3cgbmV3IEludmFsaWRNY3BPcGVyYXRpb25FcnJvcihgSW52YWxpZCBKU09OICcke2NvbmZpZ30nOiAke2V9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwYXJzZWQubmFtZSkge1xuXHRcdFx0dGhyb3cgbmV3IEludmFsaWRNY3BPcGVyYXRpb25FcnJvcihgTWlzc2luZyBuYW1lIHByb3BlcnR5IGluICR7Y29uZmlnfWApO1xuXHRcdH1cblxuXHRcdGlmICghKCdjb21tYW5kJyBpbiBwYXJzZWQpICYmICEoJ3VybCcgaW4gcGFyc2VkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEludmFsaWRNY3BPcGVyYXRpb25FcnJvcihgTWlzc2luZyBjb21tYW5kIG9yIFVSTCBwcm9wZXJ0eSBpbiAke2NvbmZpZ31gKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG5hbWUsIGlucHV0cywgLi4ucmVzdCB9ID0gcGFyc2VkO1xuXHRcdHJldHVybiB7IG5hbWUsIGlucHV0cywgY29uZmlnOiByZXN0IGFzIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIH07XG5cdH1cbn1cblxuY2xhc3MgSW52YWxpZE1jcE9wZXJhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLnN0YWNrID0gbWVzc2FnZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLDZCQUE2QjtBQUkvQixJQUFNLG1CQUFOLE1BQXVCO0FBQUEsRUFDN0IsWUFDa0IsU0FDdUIsdUJBQ3ZDO0FBRmdCO0FBQ3VCO0FBQUEsRUFDckM7QUFBQSxFQUVKLE1BQU0sa0JBQ0wsYUFDQztBQUNELFVBQU0sVUFBVSxZQUFZLElBQUksQ0FBQyxXQUFXLEtBQUssc0JBQXNCLE1BQU0sQ0FBQztBQUM5RSxVQUFNLEtBQUssb0JBQW9CLE9BQU87QUFDdEMsU0FBSyxRQUFRLEtBQUssc0JBQXNCLFFBQVEsSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFBQSxFQUM5RTtBQUFBLEVBRUEsTUFBYyxvQkFBb0IsU0FBNEI7QUFDN0QsVUFBTSxRQUFRLElBQUksUUFBUSxJQUFJLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyxNQUFNLEtBQUssc0JBQXNCLFFBQVEsRUFBRSxNQUFNLFFBQVEsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQzFIO0FBQUEsRUFFUSxzQkFBc0IsUUFBaUM7QUFDOUQsUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLEtBQUssTUFBTSxNQUFNO0FBQUEsSUFDM0IsU0FBUyxHQUFHO0FBQ1gsWUFBTSxJQUFJLHlCQUF5QixpQkFBaUIsTUFBTSxNQUFNLENBQUMsRUFBRTtBQUFBLElBQ3BFO0FBRUEsUUFBSSxDQUFDLE9BQU8sTUFBTTtBQUNqQixZQUFNLElBQUkseUJBQXlCLDRCQUE0QixNQUFNLEVBQUU7QUFBQSxJQUN4RTtBQUVBLFFBQUksRUFBRSxhQUFhLFdBQVcsRUFBRSxTQUFTLFNBQVM7QUFDakQsWUFBTSxJQUFJLHlCQUF5QixzQ0FBc0MsTUFBTSxFQUFFO0FBQUEsSUFDbEY7QUFFQSxVQUFNLEVBQUUsTUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJO0FBQ2xDLFdBQU8sRUFBRSxNQUFNLFFBQVEsUUFBUSxLQUFnQztBQUFBLEVBQ2hFO0FBQ0Q7QUFyQ2EsbUJBQU47QUFBQSxFQUdKO0FBQUEsR0FIVTtBQXVDYixNQUFNLGlDQUFpQyxNQUFNO0FBQUEsRUFDNUMsWUFBWSxTQUFpQjtBQUM1QixVQUFNLE9BQU87QUFDYixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
