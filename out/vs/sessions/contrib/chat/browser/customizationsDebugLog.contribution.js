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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IAICustomizationWorkspaceService } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IPromptsService, PromptsStorage } from "../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { IMcpService } from "../../../../workbench/contrib/mcp/common/mcpTypes.js";
const PROMPT_SECTIONS = [
  { section: AICustomizationManagementSection.Agents, type: PromptsType.agent },
  { section: AICustomizationManagementSection.Skills, type: PromptsType.skill },
  { section: AICustomizationManagementSection.Instructions, type: PromptsType.instructions },
  { section: AICustomizationManagementSection.Hooks, type: PromptsType.hook }
];
let CustomizationsDebugLogContribution = class extends Disposable {
  constructor(loggerService, _promptsService, _workspaceService, _workspaceContextService, _mcpService) {
    super();
    this._promptsService = _promptsService;
    this._workspaceService = _workspaceService;
    this._workspaceContextService = _workspaceContextService;
    this._mcpService = _mcpService;
    this._snapshotDirty = false;
    this._logger = this._register(loggerService.createLogger("customizationsDebug", { name: "Customizations Debug" }));
    this._register(this._promptsService.onDidChangeCustomAgents(() => this._logSnapshot()));
    this._register(this._promptsService.onDidChangeSlashCommands(() => this._logSnapshot()));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._logSnapshot()));
    this._register(autorun((reader) => {
      this._workspaceService.activeProjectRoot.read(reader);
      this._logSnapshot();
    }));
    this._register(autorun((reader) => {
      this._mcpService.servers.read(reader);
      this._logSnapshot();
    }));
  }
  _logSnapshot() {
    if (this._pendingSnapshot) {
      this._snapshotDirty = true;
      return;
    }
    this._pendingSnapshot = this._doLogSnapshot().finally(() => {
      this._pendingSnapshot = void 0;
      if (this._snapshotDirty) {
        this._snapshotDirty = false;
        this._logSnapshot();
      }
    });
  }
  async _doLogSnapshot() {
    const root = this._workspaceService.getActiveProjectRoot()?.fsPath ?? "(none)";
    this._logger.info("");
    this._logger.info("=== Customizations Snapshot ===");
    this._logger.info(`  Root: ${root}`);
    this._logger.info(`  Sections: ${this._workspaceService.managementSections.join(", ")}`);
    this._logger.info("");
    this._logger.info(`  ${"Section".padEnd(16)} ${"Local".padStart(6)} ${"User".padStart(6)} ${"Ext".padStart(6)} ${"Total".padStart(7)}`);
    this._logger.info(`  ${"--------".padEnd(16)} ${"-----".padStart(6)} ${"----".padStart(6)} ${"---".padStart(6)} ${"-----".padStart(7)}`);
    for (const { section, type } of PROMPT_SECTIONS) {
      await this._logSectionRow(section, type);
    }
    this._logger.info("");
    for (const { section, type } of PROMPT_SECTIONS) {
      await this._logSectionDetails(section, type);
    }
    this._logMcpServers();
  }
  _logMcpServers() {
    const servers = this._mcpService.servers.get();
    this._logger.info(`  -- MCP Servers (${servers.length}) --`);
    if (servers.length === 0) {
      this._logger.info("     (none registered)");
    }
    for (const server of servers) {
      const state = server.connectionState.get();
      const stateStr = state?.state ?? "unknown";
      this._logger.info(`     ${server.definition.label} [${stateStr}] id=${server.definition.id}`);
    }
    this._logger.info("");
  }
  async _logSectionRow(section, type) {
    try {
      const [localFiles, userFiles, extensionFiles] = await Promise.all([
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None)
      ]);
      const all = [...localFiles, ...userFiles, ...extensionFiles];
      const local = all.filter((f) => f.storage === PromptsStorage.local).length;
      const user = all.filter((f) => f.storage === PromptsStorage.user).length;
      const ext = all.filter((f) => f.storage === PromptsStorage.extension).length;
      this._logger.info(`  ${section.padEnd(16)} ${String(local).padStart(6)} ${String(user).padStart(6)} ${String(ext).padStart(6)} ${String(all.length).padStart(7)}`);
    } catch {
      this._logger.info(`  ${section.padEnd(16)}  (error)`);
    }
  }
  async _logSectionDetails(section, type) {
    try {
      const sourceFolders = await this._promptsService.getSourceFolders(type);
      if (sourceFolders.length > 0) {
        this._logger.info(`  -- ${section} --`);
        this._logger.info(`     Search paths:`);
        for (const sf of sourceFolders) {
          this._logger.info(`       [${sf.storage}] ${sf.uri.fsPath}`);
        }
      }
      const [localFiles, userFiles, extensionFiles] = await Promise.all([
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None)
      ]);
      const all = [...localFiles, ...userFiles, ...extensionFiles];
      if (all.length > 0) {
        if (sourceFolders.length === 0) {
          this._logger.info(`  -- ${section} --`);
        }
        this._logger.info(`     Found ${all.length} item(s):`);
        for (const f of all) {
          this._logger.info(`       [${f.storage}] ${f.uri.fsPath}`);
        }
      }
      if (sourceFolders.length > 0 || all.length > 0) {
        this._logger.info("");
      }
    } catch {
    }
  }
};
CustomizationsDebugLogContribution.ID = "sessions.customizationsDebugLog";
CustomizationsDebugLogContribution = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IPromptsService),
  __decorateParam(2, IAICustomizationWorkspaceService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IMcpService)
], CustomizationsDebugLogContribution);
registerWorkbenchContribution2(
  CustomizationsDebugLogContribution.ID,
  CustomizationsDebugLogContribution,
  WorkbenchPhase.AfterRestored
);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcY3VzdG9taXphdGlvbnNEZWJ1Z0xvZy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSwgSVByb21wdFBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuXG5jb25zdCBQUk9NUFRfU0VDVElPTlM6IHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb247IHR5cGU6IFByb21wdHNUeXBlIH1bXSA9IFtcblx0eyBzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50IH0sXG5cdHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHR7IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucywgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sXG5cdHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MsIHR5cGU6IFByb21wdHNUeXBlLmhvb2sgfSxcbl07XG5cbmNsYXNzIEN1c3RvbWl6YXRpb25zRGVidWdMb2dDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb25zRGVidWdMb2cnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ2dlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcFNlcnZpY2U6IElNY3BTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoJ2N1c3RvbWl6YXRpb25zRGVidWcnLCB7IG5hbWU6ICdDdXN0b21pemF0aW9ucyBEZWJ1ZycgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKCkgPT4gdGhpcy5fbG9nU25hcHNob3QoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygoKSA9PiB0aGlzLl9sb2dTbmFwc2hvdCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMuX2xvZ1NuYXBzaG90KCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmFjdGl2ZVByb2plY3RSb290LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2xvZ1NuYXBzaG90KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9sb2dTbmFwc2hvdCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3BlbmRpbmdTbmFwc2hvdDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc25hcHNob3REaXJ0eSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2xvZ1NuYXBzaG90KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nU25hcHNob3QpIHtcblx0XHRcdHRoaXMuX3NuYXBzaG90RGlydHkgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nU25hcHNob3QgPSB0aGlzLl9kb0xvZ1NuYXBzaG90KCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU25hcHNob3QgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5fc25hcHNob3REaXJ0eSkge1xuXHRcdFx0XHR0aGlzLl9zbmFwc2hvdERpcnR5ID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2xvZ1NuYXBzaG90KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0xvZ1NuYXBzaG90KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk/LmZzUGF0aCA/PyAnKG5vbmUpJztcblxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCcnKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnPT09IEN1c3RvbWl6YXRpb25zIFNuYXBzaG90ID09PScpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgIFJvb3Q6ICR7cm9vdH1gKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICBTZWN0aW9uczogJHt0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLm1hbmFnZW1lbnRTZWN0aW9ucy5qb2luKCcsICcpfWApO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCcnKTtcblxuXHRcdC8vIEhlYWRlclxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgICR7J1NlY3Rpb24nLnBhZEVuZCgxNil9ICR7J0xvY2FsJy5wYWRTdGFydCg2KX0gJHsnVXNlcicucGFkU3RhcnQoNil9ICR7J0V4dCcucGFkU3RhcnQoNil9ICR7J1RvdGFsJy5wYWRTdGFydCg3KX1gKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAkeyctLS0tLS0tLScucGFkRW5kKDE2KX0gJHsnLS0tLS0nLnBhZFN0YXJ0KDYpfSAkeyctLS0tJy5wYWRTdGFydCg2KX0gJHsnLS0tJy5wYWRTdGFydCg2KX0gJHsnLS0tLS0nLnBhZFN0YXJ0KDcpfWApO1xuXG5cdFx0Zm9yIChjb25zdCB7IHNlY3Rpb24sIHR5cGUgfSBvZiBQUk9NUFRfU0VDVElPTlMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2xvZ1NlY3Rpb25Sb3coc2VjdGlvbiwgdHlwZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oJycpO1xuXG5cdFx0Ly8gRGV0YWlscyBwZXIgc2VjdGlvblxuXHRcdGZvciAoY29uc3QgeyBzZWN0aW9uLCB0eXBlIH0gb2YgUFJPTVBUX1NFQ1RJT05TKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9sb2dTZWN0aW9uRGV0YWlscyhzZWN0aW9uLCB0eXBlKTtcblx0XHR9XG5cblx0XHQvLyBNQ1AgU2VydmVyc1xuXHRcdHRoaXMuX2xvZ01jcFNlcnZlcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ01jcFNlcnZlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycy5nZXQoKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAtLSBNQ1AgU2VydmVycyAoJHtzZXJ2ZXJzLmxlbmd0aH0pIC0tYCk7XG5cdFx0aWYgKHNlcnZlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnICAgICAobm9uZSByZWdpc3RlcmVkKScpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZlci5jb25uZWN0aW9uU3RhdGUuZ2V0KCk7XG5cdFx0XHRjb25zdCBzdGF0ZVN0ciA9IHN0YXRlPy5zdGF0ZSA/PyAndW5rbm93bic7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAgICAke3NlcnZlci5kZWZpbml0aW9uLmxhYmVsfSBbJHtzdGF0ZVN0cn1dIGlkPSR7c2VydmVyLmRlZmluaXRpb24uaWR9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xvZ1NlY3Rpb25Sb3coc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFtsb2NhbEZpbGVzLCB1c2VyRmlsZXMsIGV4dGVuc2lvbkZpbGVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UudXNlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgYWxsOiBJUHJvbXB0UGF0aFtdID0gWy4uLmxvY2FsRmlsZXMsIC4uLnVzZXJGaWxlcywgLi4uZXh0ZW5zaW9uRmlsZXNdO1xuXHRcdFx0Y29uc3QgbG9jYWwgPSBhbGwuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCkubGVuZ3RoO1xuXHRcdFx0Y29uc3QgdXNlciA9IGFsbC5maWx0ZXIoZiA9PiBmLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpLmxlbmd0aDtcblx0XHRcdGNvbnN0IGV4dCA9IGFsbC5maWx0ZXIoZiA9PiBmLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikubGVuZ3RoO1xuXG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAke3NlY3Rpb24ucGFkRW5kKDE2KX0gJHtTdHJpbmcobG9jYWwpLnBhZFN0YXJ0KDYpfSAke1N0cmluZyh1c2VyKS5wYWRTdGFydCg2KX0gJHtTdHJpbmcoZXh0KS5wYWRTdGFydCg2KX0gJHtTdHJpbmcoYWxsLmxlbmd0aCkucGFkU3RhcnQoNyl9YCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAke3NlY3Rpb24ucGFkRW5kKDE2KX0gIChlcnJvcilgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sb2dTZWN0aW9uRGV0YWlscyhzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgdHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gU291cmNlIGZvbGRlcnMgLSB3aGVyZSB3ZSBsb29rIGZvciBmaWxlc1xuXHRcdFx0Y29uc3Qgc291cmNlRm9sZGVycyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmdldFNvdXJjZUZvbGRlcnModHlwZSk7XG5cdFx0XHRpZiAoc291cmNlRm9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgIC0tICR7c2VjdGlvbn0gLS1gKTtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgICAgU2VhcmNoIHBhdGhzOmApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNmIG9mIHNvdXJjZUZvbGRlcnMpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAgICAgIFske3NmLnN0b3JhZ2V9XSAke3NmLnVyaS5mc1BhdGh9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2xvY2FsRmlsZXMsIHVzZXJGaWxlcywgZXh0ZW5zaW9uRmlsZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKHR5cGUsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0dGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS51c2VyLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0dGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBhbGw6IElQcm9tcHRQYXRoW10gPSBbLi4ubG9jYWxGaWxlcywgLi4udXNlckZpbGVzLCAuLi5leHRlbnNpb25GaWxlc107XG5cblx0XHRcdGlmIChhbGwubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoc291cmNlRm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAtLSAke3NlY3Rpb259IC0tYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgICAgRm91bmQgJHthbGwubGVuZ3RofSBpdGVtKHMpOmApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGYgb2YgYWxsKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgICAgICBbJHtmLnN0b3JhZ2V9XSAke2YudXJpLmZzUGF0aH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc291cmNlRm9sZGVycy5sZW5ndGggPiAwIHx8IGFsbC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKCcnKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGFscmVhZHkgbG9nZ2VkIGluIHJvd1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdEN1c3RvbWl6YXRpb25zRGVidWdMb2dDb250cmlidXRpb24uSUQsXG5cdEN1c3RvbWl6YXRpb25zRGVidWdMb2dDb250cmlidXRpb24sXG5cdFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQsXG4pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBa0Isc0JBQXNCO0FBQ3hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxpQkFBaUIsc0JBQW1DO0FBQzdELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsbUJBQW1CO0FBRTVCLE1BQU0sa0JBQXNGO0FBQUEsRUFDM0YsRUFBRSxTQUFTLGlDQUFpQyxRQUFRLE1BQU0sWUFBWSxNQUFNO0FBQUEsRUFDNUUsRUFBRSxTQUFTLGlDQUFpQyxRQUFRLE1BQU0sWUFBWSxNQUFNO0FBQUEsRUFDNUUsRUFBRSxTQUFTLGlDQUFpQyxjQUFjLE1BQU0sWUFBWSxhQUFhO0FBQUEsRUFDekYsRUFBRSxTQUFTLGlDQUFpQyxPQUFPLE1BQU0sWUFBWSxLQUFLO0FBQzNFO0FBRUEsSUFBTSxxQ0FBTixjQUFpRCxXQUE2QztBQUFBLEVBTTdGLFlBQ2lCLGVBQ2tCLGlCQUNpQixtQkFDUiwwQkFDYixhQUM3QjtBQUNELFVBQU07QUFMNEI7QUFDaUI7QUFDUjtBQUNiO0FBbUIvQixTQUFRLGlCQUFpQjtBQWhCeEIsU0FBSyxVQUFVLEtBQUssVUFBVSxjQUFjLGFBQWEsdUJBQXVCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQyxDQUFDO0FBRWpILFNBQUssVUFBVSxLQUFLLGdCQUFnQix3QkFBd0IsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQ3RGLFNBQUssVUFBVSxLQUFLLGdCQUFn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
