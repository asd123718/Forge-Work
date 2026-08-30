import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { parse as parseJSONC } from "../../../../../base/common/jsonc.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename, dirname, joinPath } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { InstalledAgentPluginsViewId } from "../chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { IMcpRegistry } from "../../../mcp/common/mcpRegistryTypes.js";
import { McpCollectionSortOrder, McpServerTransportType } from "../../../mcp/common/mcpTypes.js";
import { CHAT_CATEGORY } from "./chatActions.js";
const VALID_PLUGIN_NAME = /^[a-z0-9]([a-z0-9\-.]*[a-z0-9])?$/;
const INVALID_CONSECUTIVE = /--|[.][.]/;
function validatePluginName(name) {
  if (!name) {
    return localize("pluginNameRequired", "Plugin name is required.");
  }
  if (name.length > 64) {
    return localize("pluginNameTooLong", "Plugin name must be at most 64 characters.");
  }
  if (!VALID_PLUGIN_NAME.test(name)) {
    return localize("pluginNameInvalid", "Plugin name must contain only lowercase alphanumeric characters, hyphens, and periods, and must start and end with an alphanumeric character.");
  }
  if (INVALID_CONSECUTIVE.test(name)) {
    return localize("pluginNameConsecutive", "Plugin name must not contain consecutive hyphens or periods.");
  }
  return void 0;
}
function isUserDefined(storage) {
  return storage === PromptsStorage.local || storage === PromptsStorage.user;
}
function isUserDefinedMcpCollection(collection) {
  const order = collection.order;
  return order === McpCollectionSortOrder.User || order === McpCollectionSortOrder.WorkspaceFolder || order === McpCollectionSortOrder.Workspace;
}
function getResourceLabel(r) {
  if (r.name) {
    return r.name;
  }
  if (r.type === PromptsType.skill && basename(r.uri).toLowerCase() === "skill.md") {
    return basename(dirname(r.uri));
  }
  return basename(r.uri);
}
function getResourceFileName(r) {
  const label = getResourceLabel(r);
  const colonIndex = label.indexOf(":");
  return colonIndex >= 0 ? label.substring(colonIndex + 1) : label;
}
const _CreatePluginAction = class _CreatePluginAction extends Action2 {
  constructor() {
    super({
      id: _CreatePluginAction.ID,
      title: localize2("chat.createPlugin", "Create Plugin"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ChatContextKeys.enabled,
      icon: Codicon.save,
      menu: [{
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", InstalledAgentPluginsViewId),
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate()
        ),
        group: "navigation",
        order: 2
      }]
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const promptsService = accessor.get(IPromptsService);
    const mcpRegistry = accessor.get(IMcpRegistry);
    const fileDialogService = accessor.get(IFileDialogService);
    const fileService = accessor.get(IFileService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const [instructions, prompts, agents, skills, hooks] = await (async () => {
      const cts = new CancellationTokenSource();
      try {
        return await Promise.all([
          promptsService.listPromptFiles(PromptsType.instructions, cts.token),
          promptsService.listPromptFiles(PromptsType.prompt, cts.token),
          promptsService.listPromptFiles(PromptsType.agent, cts.token),
          promptsService.listPromptFiles(PromptsType.skill, cts.token),
          promptsService.listPromptFiles(PromptsType.hook, cts.token)
        ]);
      } finally {
        cts.dispose(true);
      }
    })();
    const mcpCollections = mcpRegistry.collections.get();
    let showAll = false;
    const buildTree = () => {
      const groups = [];
      const addGroup = (resources, resourceType, groupLabel, icon) => {
        const filtered = showAll ? resources : resources.filter((r) => isUserDefined(r.storage));
        if (filtered.length === 0) {
          return;
        }
        const children = filtered.map((r) => ({
          label: getResourceLabel(r),
          description: r.storage,
          resourceType,
          promptPath: r,
          checked: false
        }));
        groups.push({
          label: groupLabel,
          iconClass: ThemeIcon.asClassName(icon),
          checked: void 0,
          collapsed: false,
          pickable: false,
          children
        });
      };
      addGroup(instructions, "instruction", localize("instructions", "Instructions"), Codicon.book);
      addGroup(prompts, "prompt", localize("prompts", "Prompts"), Codicon.comment);
      addGroup(agents, "agent", localize("agents", "Agents"), Codicon.copilot);
      addGroup(skills, "skill", localize("skills", "Skills"), Codicon.lightbulb);
      addGroup(hooks, "hook", localize("hooks", "Hooks"), Codicon.zap);
      const mcpChildren = [];
      for (const collection of mcpCollections) {
        if (!showAll && !isUserDefinedMcpCollection(collection)) {
          continue;
        }
        const defs = collection.serverDefinitions.get();
        for (const def of defs) {
          mcpChildren.push({
            label: def.label,
            description: collection.label,
            resourceType: "mcp",
            mcpServer: { collection, definition: def },
            checked: false
          });
        }
      }
      if (mcpChildren.length > 0) {
        groups.push({
          label: localize("mcpServers", "MCP Servers"),
          iconClass: ThemeIcon.asClassName(Codicon.mcp),
          checked: void 0,
          collapsed: false,
          pickable: false,
          children: mcpChildren
        });
      }
      return groups;
    };
    const disposables = new DisposableStore();
    const tree = disposables.add(quickInputService.createQuickTree());
    tree.placeholder = localize("selectResources", "Select resources to include in the plugin");
    tree.matchOnDescription = true;
    tree.matchOnLabel = true;
    tree.sortByLabel = false;
    tree.title = localize("createPluginTitle", "Create Plugin");
    tree.setItemTree(buildTree());
    const toggleButton = { iconClass: ThemeIcon.asClassName(Codicon.filter), tooltip: localize("showAll", "Show Built-in, Extension, and Plugin Resources") };
    tree.buttons = [toggleButton];
    disposables.add(tree.onDidTriggerButton((button) => {
      if (button === toggleButton) {
        showAll = !showAll;
        tree.setItemTree(buildTree());
      }
    }));
    const selectedItems = await new Promise((resolve) => {
      disposables.add(tree.onDidAccept(() => {
        resolve(tree.checkedLeafItems);
        tree.hide();
      }));
      disposables.add(tree.onDidHide(() => {
        resolve(void 0);
      }));
      tree.show();
    });
    disposables.dispose();
    if (!selectedItems || selectedItems.length === 0) {
      return;
    }
    const selected = selectedItems.filter((i) => !!i.resourceType);
    const pluginName = await quickInputService.input({
      prompt: localize("pluginNamePrompt", "Enter a name for the plugin"),
      placeHolder: "my-plugin",
      validateInput: async (value) => validatePluginName(value)
    });
    if (!pluginName) {
      return;
    }
    const folderUris = await fileDialogService.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: localize("selectPluginLocation", "Select Plugin Save Location"),
      openLabel: localize("selectFolder", "Select Folder")
    });
    if (!folderUris || folderUris.length === 0) {
      return;
    }
    const targetDir = folderUris[0];
    const pluginRoot = joinPath(targetDir, pluginName);
    if (await fileService.exists(pluginRoot)) {
      notificationService.error(localize("pluginExists", "A directory named '{0}' already exists at this location. Please choose a different name or location.", pluginName));
      return;
    }
    try {
      await writePluginToDisk(fileService, pluginRoot, pluginName, selected);
      await updateMarketplaceIfNeeded(fileService, targetDir, pluginName);
      try {
        await commandService.executeCommand("revealFileInOS", pluginRoot);
      } catch {
      }
      notificationService.info(localize("pluginCreated", "Plugin '{0}' created successfully.", pluginName));
    } catch (err) {
      notificationService.error(localize("pluginCreateError", "Failed to create plugin: {0}", String(err)));
    }
  }
};
_CreatePluginAction.ID = "workbench.action.chat.createPlugin";
let CreatePluginAction = _CreatePluginAction;
async function writePluginToDisk(fileService, pluginRoot, pluginName, selected) {
  await fileService.createFolder(pluginRoot);
  const manifestDir = joinPath(pluginRoot, ".plugin");
  await fileService.createFolder(manifestDir);
  const manifest = {
    name: pluginName,
    version: "1.0.0",
    description: ""
  };
  await fileService.writeFile(joinPath(manifestDir, "plugin.json"), VSBuffer.fromString(JSON.stringify(manifest, null, "	")));
  const byType = {
    instruction: selected.filter((i) => i.resourceType === "instruction"),
    prompt: selected.filter((i) => i.resourceType === "prompt"),
    agent: selected.filter((i) => i.resourceType === "agent"),
    skill: selected.filter((i) => i.resourceType === "skill"),
    hook: selected.filter((i) => i.resourceType === "hook"),
    mcp: selected.filter((i) => i.resourceType === "mcp")
  };
  if (byType.instruction.length > 0) {
    const rulesDir = joinPath(pluginRoot, "rules");
    await fileService.createFolder(rulesDir);
    for (const item of byType.instruction) {
      if (!item.promptPath) {
        continue;
      }
      const name = getResourceFileName(item.promptPath);
      const fileName = name.endsWith(".instructions.md") || name.endsWith(".mdc") || name.endsWith(".md") ? name : name + ".instructions.md";
      const content = await fileService.readFile(item.promptPath.uri);
      await fileService.writeFile(joinPath(rulesDir, fileName), content.value);
    }
  }
  if (byType.prompt.length > 0) {
    const commandsDir = joinPath(pluginRoot, "commands");
    await fileService.createFolder(commandsDir);
    for (const item of byType.prompt) {
      if (!item.promptPath) {
        continue;
      }
      const name = getResourceFileName(item.promptPath);
      const fileName = name.endsWith(".md") ? name : name + ".md";
      const content = await fileService.readFile(item.promptPath.uri);
      await fileService.writeFile(joinPath(commandsDir, fileName), content.value);
    }
  }
  if (byType.agent.length > 0) {
    const agentsDir = joinPath(pluginRoot, "agents");
    await fileService.createFolder(agentsDir);
    for (const item of byType.agent) {
      if (!item.promptPath) {
        continue;
      }
      const name = getResourceFileName(item.promptPath);
      const fileName = name.endsWith(".md") ? name : name + ".md";
      const content = await fileService.readFile(item.promptPath.uri);
      await fileService.writeFile(joinPath(agentsDir, fileName), content.value);
    }
  }
  if (byType.skill.length > 0) {
    const skillsDir = joinPath(pluginRoot, "skills");
    await fileService.createFolder(skillsDir);
    for (const item of byType.skill) {
      if (!item.promptPath) {
        continue;
      }
      const sourceUri = item.promptPath.uri;
      const skillName = getResourceFileName(item.promptPath);
      const sourceName = basename(sourceUri);
      const isFile = sourceName.toLowerCase() === "skill.md";
      const skillSourceDir = isFile ? joinPath(sourceUri, "..") : sourceUri;
      const destSkillDir = joinPath(skillsDir, skillName);
      await copyDirectory(fileService, skillSourceDir, destSkillDir);
    }
  }
  if (byType.hook.length > 0) {
    const hooksDir = joinPath(pluginRoot, "hooks");
    await fileService.createFolder(hooksDir);
    const mergedHooks = {};
    for (const item of byType.hook) {
      if (!item.promptPath) {
        continue;
      }
      try {
        const content = await fileService.readFile(item.promptPath.uri);
        const parsed = parseJSONC(content.value.toString());
        const hooksObj = parsed?.hooks ?? parsed;
        if (hooksObj && typeof hooksObj === "object") {
          for (const [hookType, commands] of Object.entries(hooksObj)) {
            if (Array.isArray(commands)) {
              if (!mergedHooks[hookType]) {
                mergedHooks[hookType] = [];
              }
              for (const cmd of commands) {
                mergedHooks[hookType].push(serializeHookCommand(cmd));
              }
            }
          }
        }
      } catch {
      }
    }
    const hooksJson = { hooks: mergedHooks };
    await fileService.writeFile(
      joinPath(hooksDir, "hooks.json"),
      VSBuffer.fromString(JSON.stringify(hooksJson, null, "	"))
    );
  }
  if (byType.mcp.length > 0) {
    const mcpServers = {};
    for (const item of byType.mcp) {
      if (!item.mcpServer) {
        continue;
      }
      const def = item.mcpServer.definition;
      mcpServers[def.label] = serializeMcpLaunch(def.launch);
    }
    const mcpJson = { mcpServers };
    await fileService.writeFile(
      joinPath(pluginRoot, ".mcp.json"),
      VSBuffer.fromString(JSON.stringify(mcpJson, null, "	"))
    );
  }
}
function serializeHookCommand(cmd) {
  const result = { type: "command" };
  if (typeof cmd.command === "string") {
    result["command"] = cmd.command;
  }
  if (typeof cmd.windows === "string") {
    result["windows"] = cmd.windows;
  }
  if (typeof cmd.linux === "string") {
    result["linux"] = cmd.linux;
  }
  if (typeof cmd.osx === "string") {
    result["osx"] = cmd.osx;
  }
  if (cmd.cwd !== void 0) {
    result["cwd"] = isUriComponents(cmd.cwd) ? URI.revive(cmd.cwd).fsPath : String(cmd.cwd);
  }
  if (cmd.env && typeof cmd.env === "object" && Object.keys(cmd.env).length > 0) {
    result["env"] = cmd.env;
  }
  if (typeof cmd.timeout === "number") {
    result["timeout"] = cmd.timeout;
  }
  return result;
}
function serializeMcpLaunch(launch) {
  if (launch.type === McpServerTransportType.Stdio) {
    const result = {
      type: "stdio",
      command: launch.command
    };
    if (launch.args.length > 0) {
      result["args"] = [...launch.args];
    }
    if (launch.cwd) {
      result["cwd"] = launch.cwd;
    }
    if (Object.keys(launch.env).length > 0) {
      result["env"] = { ...launch.env };
    }
    return result;
  } else {
    const result = {
      type: "http",
      url: launch.uri.toString()
    };
    if (launch.headers.length > 0) {
      const headers = {};
      for (const [key, value] of launch.headers) {
        headers[key] = value;
      }
      result["headers"] = headers;
    }
    return result;
  }
}
async function copyDirectory(fileService, source, target) {
  const stat = await fileService.resolve(source);
  if (stat.isDirectory) {
    await fileService.createFolder(target);
    if (stat.children) {
      for (const child of stat.children) {
        const childName = basename(child.resource);
        await copyDirectory(fileService, child.resource, joinPath(target, childName));
      }
    }
  } else {
    const content = await fileService.readFile(source);
    await fileService.writeFile(target, content.value);
  }
}
const MARKETPLACE_PATHS = [
  "marketplace.json",
  ".plugin/marketplace.json"
];
async function updateMarketplaceIfNeeded(fileService, targetDir, pluginName) {
  for (const relPath of MARKETPLACE_PATHS) {
    const marketplaceUri = joinPath(targetDir, relPath);
    if (await fileService.exists(marketplaceUri)) {
      try {
        const content = await fileService.readFile(marketplaceUri);
        const marketplace = parseJSONC(content.value.toString());
        if (marketplace && typeof marketplace === "object") {
          if (!Array.isArray(marketplace["plugins"])) {
            marketplace["plugins"] = [];
          }
          const plugins = marketplace["plugins"];
          if (plugins.some((p) => p.name === pluginName)) {
            return;
          }
          plugins.push({
            name: pluginName,
            source: `./${pluginName}/`
          });
          await fileService.writeFile(
            marketplaceUri,
            VSBuffer.fromString(JSON.stringify(marketplace, null, "	"))
          );
        }
      } catch {
      }
      return;
    }
  }
}
function registerCreatePluginAction() {
  const store = new DisposableStore();
  store.add(registerAction2(CreatePluginAction));
  return store;
}
export {
  copyDirectory,
  getResourceFileName,
  getResourceLabel,
  registerCreatePluginAction,
  serializeHookCommand,
  serializeMcpLaunch,
  updateMarketplaceIfNeeded,
  validatePluginName,
  writePluginToDisk
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNyZWF0ZVBsdWdpbkFjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUpTT05DIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1RyZWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsZWRBZ2VudFBsdWdpbnNWaWV3SWQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5cbmNvbnN0IFZBTElEX1BMVUdJTl9OQU1FID0gL15bYS16MC05XShbYS16MC05XFwtLl0qW2EtejAtOV0pPyQvO1xuY29uc3QgSU5WQUxJRF9DT05TRUNVVElWRSA9IC8tLXxbLl1bLl0vO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVQbHVnaW5OYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghbmFtZSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncGx1Z2luTmFtZVJlcXVpcmVkJywgXCJQbHVnaW4gbmFtZSBpcyByZXF1aXJlZC5cIik7XG5cdH1cblx0aWYgKG5hbWUubGVuZ3RoID4gNjQpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3BsdWdpbk5hbWVUb29Mb25nJywgXCJQbHVnaW4gbmFtZSBtdXN0IGJlIGF0IG1vc3QgNjQgY2hhcmFjdGVycy5cIik7XG5cdH1cblx0aWYgKCFWQUxJRF9QTFVHSU5fTkFNRS50ZXN0KG5hbWUpKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdwbHVnaW5OYW1lSW52YWxpZCcsIFwiUGx1Z2luIG5hbWUgbXVzdCBjb250YWluIG9ubHkgbG93ZXJjYXNlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzLCBoeXBoZW5zLCBhbmQgcGVyaW9kcywgYW5kIG11c3Qgc3RhcnQgYW5kIGVuZCB3aXRoIGFuIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXIuXCIpO1xuXHR9XG5cdGlmIChJTlZBTElEX0NPTlNFQ1VUSVZFLnRlc3QobmFtZSkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3BsdWdpbk5hbWVDb25zZWN1dGl2ZScsIFwiUGx1Z2luIG5hbWUgbXVzdCBub3QgY29udGFpbiBjb25zZWN1dGl2ZSBoeXBoZW5zIG9yIHBlcmlvZHMuXCIpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbnR5cGUgUmVzb3VyY2VUeXBlID0gJ2luc3RydWN0aW9uJyB8ICdwcm9tcHQnIHwgJ2FnZW50JyB8ICdza2lsbCcgfCAnaG9vaycgfCAnbWNwJztcblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb3VyY2VUcmVlSXRlbSBleHRlbmRzIElRdWlja1RyZWVJdGVtIHtcblx0cmVhZG9ubHkgcmVzb3VyY2VUeXBlOiBSZXNvdXJjZVR5cGU7XG5cdHJlYWRvbmx5IHByb21wdFBhdGg/OiBJUHJvbXB0UGF0aDtcblx0cmVhZG9ubHkgbWNwU2VydmVyPzogeyBjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbjsgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiB9O1xuXHRjaGlsZHJlbj86IHJlYWRvbmx5IElSZXNvdXJjZVRyZWVJdGVtW107XG59XG5cbmludGVyZmFjZSBJR3JvdXBUcmVlSXRlbSBleHRlbmRzIElRdWlja1RyZWVJdGVtIHtcblx0cmVhZG9ubHkgcmVzb3VyY2VUeXBlPzogdW5kZWZpbmVkO1xuXHRjaGlsZHJlbjogSVJlc291cmNlVHJlZUl0ZW1bXTtcbn1cblxuZnVuY3Rpb24gaXNVc2VyRGVmaW5lZChzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwgfHwgc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcjtcbn1cblxuZnVuY3Rpb24gaXNVc2VyRGVmaW5lZE1jcENvbGxlY3Rpb24oY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24pOiBib29sZWFuIHtcblx0Y29uc3Qgb3JkZXIgPSBjb2xsZWN0aW9uLm9yZGVyO1xuXHRyZXR1cm4gb3JkZXIgPT09IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuVXNlclxuXHRcdHx8IG9yZGVyID09PSBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLldvcmtzcGFjZUZvbGRlclxuXHRcdHx8IG9yZGVyID09PSBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLldvcmtzcGFjZTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgZGlzcGxheSBsYWJlbCBmb3IgYSBwcm9tcHQgcmVzb3VyY2UuIFNraWxscyBuZWVkIHNwZWNpYWwgaGFuZGxpbmdcbiAqIGJlY2F1c2UgdGhlaXIgVVJJIHBvaW50cyB0byBgU0tJTEwubWRgLCBzbyB3ZSB1c2UgdGhlIHBhcmVudCBkaXJlY3RvcnkgbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFJlc291cmNlTGFiZWwocjogSVByb21wdFBhdGgpOiBzdHJpbmcge1xuXHRpZiAoci5uYW1lKSB7XG5cdFx0cmV0dXJuIHIubmFtZTtcblx0fVxuXHRpZiAoci50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCAmJiBiYXNlbmFtZShyLnVyaSkudG9Mb3dlckNhc2UoKSA9PT0gJ3NraWxsLm1kJykge1xuXHRcdHJldHVybiBiYXNlbmFtZShkaXJuYW1lKHIudXJpKSk7XG5cdH1cblx0cmV0dXJuIGJhc2VuYW1lKHIudXJpKTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgZmlsZXN5c3RlbS1zYWZlIG5hbWUgZm9yIGEgcmVzb3VyY2UsIHN0cmlwcGluZyBhbnkgbmFtZXNwYWNlIHByZWZpeFxuICogKGUuZy4gYHBsdWdpbjpza2lsbG5hbWVgIFx1MjE5MiBgc2tpbGxuYW1lYCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNvdXJjZUZpbGVOYW1lKHI6IElQcm9tcHRQYXRoKTogc3RyaW5nIHtcblx0Y29uc3QgbGFiZWwgPSBnZXRSZXNvdXJjZUxhYmVsKHIpO1xuXHRjb25zdCBjb2xvbkluZGV4ID0gbGFiZWwuaW5kZXhPZignOicpO1xuXHRyZXR1cm4gY29sb25JbmRleCA+PSAwID8gbGFiZWwuc3Vic3RyaW5nKGNvbG9uSW5kZXggKyAxKSA6IGxhYmVsO1xufVxuXG5jbGFzcyBDcmVhdGVQbHVnaW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNyZWF0ZVBsdWdpbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENyZWF0ZVBsdWdpbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuY3JlYXRlUGx1Z2luJywgXCJDcmVhdGUgUGx1Z2luXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNhdmUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEluc3RhbGxlZEFnZW50UGx1Z2luc1ZpZXdJZCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb21wdHNTZXJ2aWNlKTtcblx0XHRjb25zdCBtY3BSZWdpc3RyeSA9IGFjY2Vzc29yLmdldChJTWNwUmVnaXN0cnkpO1xuXHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gU3RlcCAxOiBHYXRoZXIgcmVzb3VyY2VzXG5cdFx0Y29uc3QgW2luc3RydWN0aW9ucywgcHJvbXB0cywgYWdlbnRzLCBza2lsbHMsIGhvb2tzXSA9IGF3YWl0IChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgY3RzLnRva2VuKSxcblx0XHRcdFx0XHRwcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBjdHMudG9rZW4pLFxuXHRcdFx0XHRcdHByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgY3RzLnRva2VuKSxcblx0XHRcdFx0XHRwcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIGN0cy50b2tlbiksXG5cdFx0XHRcdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIGN0cy50b2tlbiksXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdGNvbnN0IG1jcENvbGxlY3Rpb25zID0gbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCk7XG5cblx0XHQvLyBTdGVwIDI6IEJ1aWxkIHRyZWUgaXRlbXMgZ3JvdXBlZCBieSByZXNvdXJjZSB0eXBlXG5cdFx0bGV0IHNob3dBbGwgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGJ1aWxkVHJlZSA9ICgpOiAoSUdyb3VwVHJlZUl0ZW0gfCBJUmVzb3VyY2VUcmVlSXRlbSlbXSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHM6IChJR3JvdXBUcmVlSXRlbSB8IElSZXNvdXJjZVRyZWVJdGVtKVtdID0gW107XG5cblx0XHRcdGNvbnN0IGFkZEdyb3VwID0gKFxuXHRcdFx0XHRyZXNvdXJjZXM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10sXG5cdFx0XHRcdHJlc291cmNlVHlwZTogUmVzb3VyY2VUeXBlLFxuXHRcdFx0XHRncm91cExhYmVsOiBzdHJpbmcsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbixcblx0XHRcdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZCA9IHNob3dBbGwgPyByZXNvdXJjZXMgOiByZXNvdXJjZXMuZmlsdGVyKHIgPT4gaXNVc2VyRGVmaW5lZChyLnN0b3JhZ2UpKTtcblx0XHRcdFx0aWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbjogSVJlc291cmNlVHJlZUl0ZW1bXSA9IGZpbHRlcmVkLm1hcChyID0+ICh7XG5cdFx0XHRcdFx0bGFiZWw6IGdldFJlc291cmNlTGFiZWwociksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHIuc3RvcmFnZSxcblx0XHRcdFx0XHRyZXNvdXJjZVR5cGUsXG5cdFx0XHRcdFx0cHJvbXB0UGF0aDogcixcblx0XHRcdFx0XHRjaGVja2VkOiBmYWxzZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRncm91cHMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGdyb3VwTGFiZWwsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiksXG5cdFx0XHRcdFx0Y2hlY2tlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNoaWxkcmVuLFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGFkZEdyb3VwKGluc3RydWN0aW9ucywgJ2luc3RydWN0aW9uJywgbG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiSW5zdHJ1Y3Rpb25zXCIpLCBDb2RpY29uLmJvb2spO1xuXHRcdFx0YWRkR3JvdXAocHJvbXB0cywgJ3Byb21wdCcsIGxvY2FsaXplKCdwcm9tcHRzJywgXCJQcm9tcHRzXCIpLCBDb2RpY29uLmNvbW1lbnQpO1xuXHRcdFx0YWRkR3JvdXAoYWdlbnRzLCAnYWdlbnQnLCBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksIENvZGljb24uY29waWxvdCk7XG5cdFx0XHRhZGRHcm91cChza2lsbHMsICdza2lsbCcsIGxvY2FsaXplKCdza2lsbHMnLCBcIlNraWxsc1wiKSwgQ29kaWNvbi5saWdodGJ1bGIpO1xuXHRcdFx0YWRkR3JvdXAoaG9va3MsICdob29rJywgbG9jYWxpemUoJ2hvb2tzJywgXCJIb29rc1wiKSwgQ29kaWNvbi56YXApO1xuXG5cdFx0XHQvLyBNQ1Agc2VydmVyc1xuXHRcdFx0Y29uc3QgbWNwQ2hpbGRyZW46IElSZXNvdXJjZVRyZWVJdGVtW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBvZiBtY3BDb2xsZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoIXNob3dBbGwgJiYgIWlzVXNlckRlZmluZWRNY3BDb2xsZWN0aW9uKGNvbGxlY3Rpb24pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZGVmcyA9IGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZGVmIG9mIGRlZnMpIHtcblx0XHRcdFx0XHRtY3BDaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBkZWYubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29sbGVjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdHJlc291cmNlVHlwZTogJ21jcCcsXG5cdFx0XHRcdFx0XHRtY3BTZXJ2ZXI6IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbjogZGVmIH0sXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBmYWxzZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG1jcENoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwU2VydmVycycsIFwiTUNQIFNlcnZlcnNcIiksXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5tY3ApLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBpY2thYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogbWNwQ2hpbGRyZW4sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZ3JvdXBzO1xuXHRcdH07XG5cblx0XHQvLyBTdGVwIDM6IFNob3cgUXVpY2tUcmVlIGZvciBtdWx0aS1zZWxlY3Qgd2l0aCBncm91cGluZ3Ncblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB0cmVlID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrVHJlZTxJR3JvdXBUcmVlSXRlbSB8IElSZXNvdXJjZVRyZWVJdGVtPigpKTtcblx0XHR0cmVlLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlbGVjdFJlc291cmNlcycsIFwiU2VsZWN0IHJlc291cmNlcyB0byBpbmNsdWRlIGluIHRoZSBwbHVnaW5cIik7XG5cdFx0dHJlZS5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHRyZWUubWF0Y2hPbkxhYmVsID0gdHJ1ZTtcblx0XHR0cmVlLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0dHJlZS50aXRsZSA9IGxvY2FsaXplKCdjcmVhdGVQbHVnaW5UaXRsZScsIFwiQ3JlYXRlIFBsdWdpblwiKTtcblx0XHR0cmVlLnNldEl0ZW1UcmVlKGJ1aWxkVHJlZSgpKTtcblxuXHRcdGNvbnN0IHRvZ2dsZUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7IGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZmlsdGVyKSwgdG9vbHRpcDogbG9jYWxpemUoJ3Nob3dBbGwnLCBcIlNob3cgQnVpbHQtaW4sIEV4dGVuc2lvbiwgYW5kIFBsdWdpbiBSZXNvdXJjZXNcIikgfTtcblx0XHR0cmVlLmJ1dHRvbnMgPSBbdG9nZ2xlQnV0dG9uXTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkVHJpZ2dlckJ1dHRvbigoYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbikgPT4ge1xuXHRcdFx0aWYgKGJ1dHRvbiA9PT0gdG9nZ2xlQnV0dG9uKSB7XG5cdFx0XHRcdHNob3dBbGwgPSAhc2hvd0FsbDtcblx0XHRcdFx0dHJlZS5zZXRJdGVtVHJlZShidWlsZFRyZWUoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IGF3YWl0IG5ldyBQcm9taXNlPHJlYWRvbmx5IChJR3JvdXBUcmVlSXRlbSB8IElSZXNvdXJjZVRyZWVJdGVtKVtdIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh0cmVlLmNoZWNrZWRMZWFmSXRlbXMpO1xuXHRcdFx0XHR0cmVlLmhpZGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdHRyZWUuc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKCFzZWxlY3RlZEl0ZW1zIHx8IHNlbGVjdGVkSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RlZEl0ZW1zLmZpbHRlcigoaSk6IGkgaXMgSVJlc291cmNlVHJlZUl0ZW0gPT4gISFpLnJlc291cmNlVHlwZSk7XG5cblx0XHQvLyBTdGVwIDQ6IEFzayBmb3IgcGx1Z2luIG5hbWVcblx0XHRjb25zdCBwbHVnaW5OYW1lID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgncGx1Z2luTmFtZVByb21wdCcsIFwiRW50ZXIgYSBuYW1lIGZvciB0aGUgcGx1Z2luXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICdteS1wbHVnaW4nLFxuXHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHZhbGlkYXRlUGx1Z2luTmFtZSh2YWx1ZSksXG5cdFx0fSk7XG5cblx0XHRpZiAoIXBsdWdpbk5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdGVwIDU6IEFzayB3aGVyZSB0byBzYXZlXG5cdFx0Y29uc3QgZm9sZGVyVXJpcyA9IGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0UGx1Z2luTG9jYXRpb24nLCBcIlNlbGVjdCBQbHVnaW4gU2F2ZSBMb2NhdGlvblwiKSxcblx0XHRcdG9wZW5MYWJlbDogbG9jYWxpemUoJ3NlbGVjdEZvbGRlcicsIFwiU2VsZWN0IEZvbGRlclwiKSxcblx0XHR9KTtcblxuXHRcdGlmICghZm9sZGVyVXJpcyB8fCBmb2xkZXJVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldERpciA9IGZvbGRlclVyaXNbMF07XG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IGpvaW5QYXRoKHRhcmdldERpciwgcGx1Z2luTmFtZSk7XG5cblx0XHQvLyBDaGVjayBpZiBwbHVnaW4gZGlyZWN0b3J5IGFscmVhZHkgZXhpc3RzXG5cdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhwbHVnaW5Sb290KSkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncGx1Z2luRXhpc3RzJywgXCJBIGRpcmVjdG9yeSBuYW1lZCAnezB9JyBhbHJlYWR5IGV4aXN0cyBhdCB0aGlzIGxvY2F0aW9uLiBQbGVhc2UgY2hvb3NlIGEgZGlmZmVyZW50IG5hbWUgb3IgbG9jYXRpb24uXCIsIHBsdWdpbk5hbWUpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdGVwIDY6IENyZWF0ZSBwbHVnaW4gc3RydWN0dXJlXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCBwbHVnaW5OYW1lLCBzZWxlY3RlZCk7XG5cblx0XHRcdC8vIFN0ZXAgNzogQ2hlY2sgZm9yIG1hcmtldHBsYWNlLmpzb24gYW5kIHVwZGF0ZSBpdFxuXHRcdFx0YXdhaXQgdXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZChmaWxlU2VydmljZSwgdGFyZ2V0RGlyLCBwbHVnaW5OYW1lKTtcblxuXHRcdFx0Ly8gU3RlcCA4OiBSZXZlYWwgdGhlIHBsdWdpbiBkaXJlY3RvcnkgaW4gdGhlIE9TIGZpbGUgZXhwbG9yZXJcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdyZXZlYWxGaWxlSW5PUycsIHBsdWdpblJvb3QpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIHJldmVhbEZpbGVJbk9TIG1heSBub3QgYmUgYXZhaWxhYmxlIGZvciBhbGwgVVJJIHNjaGVtZXNcblx0XHRcdH1cblxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdwbHVnaW5DcmVhdGVkJywgXCJQbHVnaW4gJ3swfScgY3JlYXRlZCBzdWNjZXNzZnVsbHkuXCIsIHBsdWdpbk5hbWUpKTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncGx1Z2luQ3JlYXRlRXJyb3InLCBcIkZhaWxlZCB0byBjcmVhdGUgcGx1Z2luOiB7MH1cIiwgU3RyaW5nKGVycikpKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBXcml0ZXMgYSBwbHVnaW4gZGlyZWN0b3J5IHN0cnVjdHVyZSB0byBkaXNrIGZyb20gc2VsZWN0ZWQgcmVzb3VyY2VzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd3JpdGVQbHVnaW5Ub0Rpc2soXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdHBsdWdpblJvb3Q6IFVSSSxcblx0cGx1Z2luTmFtZTogc3RyaW5nLFxuXHRzZWxlY3RlZDogcmVhZG9ubHkgSVJlc291cmNlVHJlZUl0ZW1bXSxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocGx1Z2luUm9vdCk7XG5cblx0Ly8gQ3JlYXRlIC5wbHVnaW4vcGx1Z2luLmpzb25cblx0Y29uc3QgbWFuaWZlc3REaXIgPSBqb2luUGF0aChwbHVnaW5Sb290LCAnLnBsdWdpbicpO1xuXHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIobWFuaWZlc3REaXIpO1xuXHRjb25zdCBtYW5pZmVzdCA9IHtcblx0XHRuYW1lOiBwbHVnaW5OYW1lLFxuXHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0ZGVzY3JpcHRpb246ICcnLFxuXHR9O1xuXHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoam9pblBhdGgobWFuaWZlc3REaXIsICdwbHVnaW4uanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAnXFx0JykpKTtcblxuXHQvLyBHcm91cCBzZWxlY3RlZCBpdGVtcyBieSB0eXBlXG5cdGNvbnN0IGJ5VHlwZSA9IHtcblx0XHRpbnN0cnVjdGlvbjogc2VsZWN0ZWQuZmlsdGVyKGkgPT4gaS5yZXNvdXJjZVR5cGUgPT09ICdpbnN0cnVjdGlvbicpLFxuXHRcdHByb21wdDogc2VsZWN0ZWQuZmlsdGVyKGkgPT4gaS5yZXNvdXJjZVR5cGUgPT09ICdwcm9tcHQnKSxcblx0XHRhZ2VudDogc2VsZWN0ZWQuZmlsdGVyKGkgPT4gaS5yZXNvdXJjZVR5cGUgPT09ICdhZ2VudCcpLFxuXHRcdHNraWxsOiBzZWxlY3RlZC5maWx0ZXIoaSA9PiBpLnJlc291cmNlVHlwZSA9PT0gJ3NraWxsJyksXG5cdFx0aG9vazogc2VsZWN0ZWQuZmlsdGVyKGkgPT4gaS5yZXNvdXJjZVR5cGUgPT09ICdob29rJyksXG5cdFx0bWNwOiBzZWxlY3RlZC5maWx0ZXIoaSA9PiBpLnJlc291cmNlVHlwZSA9PT0gJ21jcCcpLFxuXHR9O1xuXG5cdC8vIENvcHkgaW5zdHJ1Y3Rpb25zIFx1MjE5MiBydWxlcy9cblx0aWYgKGJ5VHlwZS5pbnN0cnVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgcnVsZXNEaXIgPSBqb2luUGF0aChwbHVnaW5Sb290LCAncnVsZXMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocnVsZXNEaXIpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBieVR5cGUuaW5zdHJ1Y3Rpb24pIHtcblx0XHRcdGlmICghaXRlbS5wcm9tcHRQYXRoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9IGdldFJlc291cmNlRmlsZU5hbWUoaXRlbS5wcm9tcHRQYXRoKTtcblx0XHRcdGNvbnN0IGZpbGVOYW1lID0gbmFtZS5lbmRzV2l0aCgnLmluc3RydWN0aW9ucy5tZCcpIHx8IG5hbWUuZW5kc1dpdGgoJy5tZGMnKSB8fCBuYW1lLmVuZHNXaXRoKCcubWQnKVxuXHRcdFx0XHQ/IG5hbWVcblx0XHRcdFx0OiBuYW1lICsgJy5pbnN0cnVjdGlvbnMubWQnO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGl0ZW0ucHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKHJ1bGVzRGlyLCBmaWxlTmFtZSksIGNvbnRlbnQudmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIENvcHkgcHJvbXB0cyBcdTIxOTIgY29tbWFuZHMvXG5cdGlmIChieVR5cGUucHJvbXB0Lmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBjb21tYW5kc0RpciA9IGpvaW5QYXRoKHBsdWdpblJvb3QsICdjb21tYW5kcycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihjb21tYW5kc0Rpcik7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGJ5VHlwZS5wcm9tcHQpIHtcblx0XHRcdGlmICghaXRlbS5wcm9tcHRQYXRoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9IGdldFJlc291cmNlRmlsZU5hbWUoaXRlbS5wcm9tcHRQYXRoKTtcblx0XHRcdGNvbnN0IGZpbGVOYW1lID0gbmFtZS5lbmRzV2l0aCgnLm1kJykgPyBuYW1lIDogbmFtZSArICcubWQnO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGl0ZW0ucHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKGNvbW1hbmRzRGlyLCBmaWxlTmFtZSksIGNvbnRlbnQudmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIENvcHkgYWdlbnRzIFx1MjE5MiBhZ2VudHMvXG5cdGlmIChieVR5cGUuYWdlbnQubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IGFnZW50c0RpciA9IGpvaW5QYXRoKHBsdWdpblJvb3QsICdhZ2VudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoYWdlbnRzRGlyKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYnlUeXBlLmFnZW50KSB7XG5cdFx0XHRpZiAoIWl0ZW0ucHJvbXB0UGF0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRSZXNvdXJjZUZpbGVOYW1lKGl0ZW0ucHJvbXB0UGF0aCk7XG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IG5hbWUuZW5kc1dpdGgoJy5tZCcpID8gbmFtZSA6IG5hbWUgKyAnLm1kJztcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShpdGVtLnByb21wdFBhdGgudXJpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShqb2luUGF0aChhZ2VudHNEaXIsIGZpbGVOYW1lKSwgY29udGVudC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQ29weSBza2lsbHMgXHUyMTkyIHNraWxscy8gKHJlY3Vyc2l2ZSBkaXJlY3RvcnkgY29weSlcblx0aWYgKGJ5VHlwZS5za2lsbC5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3Qgc2tpbGxzRGlyID0gam9pblBhdGgocGx1Z2luUm9vdCwgJ3NraWxscycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihza2lsbHNEaXIpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBieVR5cGUuc2tpbGwpIHtcblx0XHRcdGlmICghaXRlbS5wcm9tcHRQYXRoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlVXJpID0gaXRlbS5wcm9tcHRQYXRoLnVyaTtcblx0XHRcdGNvbnN0IHNraWxsTmFtZSA9IGdldFJlc291cmNlRmlsZU5hbWUoaXRlbS5wcm9tcHRQYXRoKTtcblxuXHRcdFx0Ly8gVGhlIFVSSSBmb3IgYSBza2lsbCBtaWdodCBwb2ludCB0byB0aGUgU0tJTEwubWQgZmlsZSBvciB0byB0aGUgZGlyZWN0b3J5XG5cdFx0XHRjb25zdCBzb3VyY2VOYW1lID0gYmFzZW5hbWUoc291cmNlVXJpKTtcblx0XHRcdGNvbnN0IGlzRmlsZSA9IHNvdXJjZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3NraWxsLm1kJztcblx0XHRcdGNvbnN0IHNraWxsU291cmNlRGlyID0gaXNGaWxlID8gam9pblBhdGgoc291cmNlVXJpLCAnLi4nKSA6IHNvdXJjZVVyaTtcblxuXHRcdFx0Y29uc3QgZGVzdFNraWxsRGlyID0gam9pblBhdGgoc2tpbGxzRGlyLCBza2lsbE5hbWUpO1xuXHRcdFx0YXdhaXQgY29weURpcmVjdG9yeShmaWxlU2VydmljZSwgc2tpbGxTb3VyY2VEaXIsIGRlc3RTa2lsbERpcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQ29weSBob29rcyBcdTIxOTIgaG9va3MvaG9va3MuanNvbiAobWVyZ2UgYWxsIHNlbGVjdGVkIGhvb2sgZmlsZXMpXG5cdGlmIChieVR5cGUuaG9vay5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgaG9va3NEaXIgPSBqb2luUGF0aChwbHVnaW5Sb290LCAnaG9va3MnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoaG9va3NEaXIpO1xuXG5cdFx0Y29uc3QgbWVyZ2VkSG9va3M6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHVua25vd24+W10+ID0ge307XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGJ5VHlwZS5ob29rKSB7XG5cdFx0XHRpZiAoIWl0ZW0ucHJvbXB0UGF0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShpdGVtLnByb21wdFBhdGgudXJpKTtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VKU09OQzxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgaG9va3NPYmogPSAocGFyc2VkPy5ob29rcyA/PyBwYXJzZWQpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoaG9va3NPYmogJiYgdHlwZW9mIGhvb2tzT2JqID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW2hvb2tUeXBlLCBjb21tYW5kc10gb2YgT2JqZWN0LmVudHJpZXMoaG9va3NPYmopKSB7XG5cdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjb21tYW5kcykpIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFtZXJnZWRIb29rc1tob29rVHlwZV0pIHtcblx0XHRcdFx0XHRcdFx0XHRtZXJnZWRIb29rc1tob29rVHlwZV0gPSBbXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBjb21tYW5kcykge1xuXHRcdFx0XHRcdFx0XHRcdG1lcmdlZEhvb2tzW2hvb2tUeXBlXS5wdXNoKHNlcmlhbGl6ZUhvb2tDb21tYW5kKGNtZCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU2tpcCB1bnBhcnNlYWJsZSBob29rIGZpbGVzXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG9va3NKc29uID0geyBob29rczogbWVyZ2VkSG9va3MgfTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoXG5cdFx0XHRqb2luUGF0aChob29rc0RpciwgJ2hvb2tzLmpzb24nKSxcblx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoaG9va3NKc29uLCBudWxsLCAnXFx0JykpXG5cdFx0KTtcblx0fVxuXG5cdC8vIEV4cG9ydCBNQ1Agc2VydmVycyBcdTIxOTIgLm1jcC5qc29uXG5cdGlmIChieVR5cGUubWNwLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJzOiBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+ID0ge307XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGJ5VHlwZS5tY3ApIHtcblx0XHRcdGlmICghaXRlbS5tY3BTZXJ2ZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWYgPSBpdGVtLm1jcFNlcnZlci5kZWZpbml0aW9uO1xuXHRcdFx0bWNwU2VydmVyc1tkZWYubGFiZWxdID0gc2VyaWFsaXplTWNwTGF1bmNoKGRlZi5sYXVuY2gpO1xuXHRcdH1cblx0XHRjb25zdCBtY3BKc29uID0geyBtY3BTZXJ2ZXJzIH07XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFxuXHRcdFx0am9pblBhdGgocGx1Z2luUm9vdCwgJy5tY3AuanNvbicpLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShtY3BKc29uLCBudWxsLCAnXFx0JykpXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplSG9va0NvbW1hbmQoY21kOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgdHlwZTogJ2NvbW1hbmQnIH07XG5cdGlmICh0eXBlb2YgY21kLmNvbW1hbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmVzdWx0Wydjb21tYW5kJ10gPSBjbWQuY29tbWFuZDtcblx0fVxuXHRpZiAodHlwZW9mIGNtZC53aW5kb3dzID09PSAnc3RyaW5nJykge1xuXHRcdHJlc3VsdFsnd2luZG93cyddID0gY21kLndpbmRvd3M7XG5cdH1cblx0aWYgKHR5cGVvZiBjbWQubGludXggPT09ICdzdHJpbmcnKSB7XG5cdFx0cmVzdWx0WydsaW51eCddID0gY21kLmxpbnV4O1xuXHR9XG5cdGlmICh0eXBlb2YgY21kLm9zeCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXN1bHRbJ29zeCddID0gY21kLm9zeDtcblx0fVxuXHRpZiAoY21kLmN3ZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmVzdWx0Wydjd2QnXSA9IGlzVXJpQ29tcG9uZW50cyhjbWQuY3dkKSA/IFVSSS5yZXZpdmUoY21kLmN3ZCkuZnNQYXRoIDogU3RyaW5nKGNtZC5jd2QpO1xuXHR9XG5cdGlmIChjbWQuZW52ICYmIHR5cGVvZiBjbWQuZW52ID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhjbWQuZW52IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5sZW5ndGggPiAwKSB7XG5cdFx0cmVzdWx0WydlbnYnXSA9IGNtZC5lbnY7XG5cdH1cblx0aWYgKHR5cGVvZiBjbWQudGltZW91dCA9PT0gJ251bWJlcicpIHtcblx0XHRyZXN1bHRbJ3RpbWVvdXQnXSA9IGNtZC50aW1lb3V0O1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVNY3BMYXVuY2gobGF1bmNoOiBNY3BTZXJ2ZXJEZWZpbml0aW9uWydsYXVuY2gnXSk6IG9iamVjdCB7XG5cdGlmIChsYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHR0eXBlOiAnc3RkaW8nLFxuXHRcdFx0Y29tbWFuZDogbGF1bmNoLmNvbW1hbmQsXG5cdFx0fTtcblx0XHRpZiAobGF1bmNoLmFyZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdWx0WydhcmdzJ10gPSBbLi4ubGF1bmNoLmFyZ3NdO1xuXHRcdH1cblx0XHRpZiAobGF1bmNoLmN3ZCkge1xuXHRcdFx0cmVzdWx0Wydjd2QnXSA9IGxhdW5jaC5jd2Q7XG5cdFx0fVxuXHRcdGlmIChPYmplY3Qua2V5cyhsYXVuY2guZW52KS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHRbJ2VudiddID0geyAuLi5sYXVuY2guZW52IH07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcblx0XHRcdHR5cGU6ICdodHRwJyxcblx0XHRcdHVybDogbGF1bmNoLnVyaS50b1N0cmluZygpLFxuXHRcdH07XG5cdFx0aWYgKGxhdW5jaC5oZWFkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGxhdW5jaC5oZWFkZXJzKSB7XG5cdFx0XHRcdGhlYWRlcnNba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0WydoZWFkZXJzJ10gPSBoZWFkZXJzO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb3B5RGlyZWN0b3J5KGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzdGF0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShzb3VyY2UpO1xuXHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih0YXJnZXQpO1xuXHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgY2hpbGROYW1lID0gYmFzZW5hbWUoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRhd2FpdCBjb3B5RGlyZWN0b3J5KGZpbGVTZXJ2aWNlLCBjaGlsZC5yZXNvdXJjZSwgam9pblBhdGgodGFyZ2V0LCBjaGlsZE5hbWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNvdXJjZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgY29udGVudC52YWx1ZSk7XG5cdH1cbn1cblxuY29uc3QgTUFSS0VUUExBQ0VfUEFUSFMgPSBbXG5cdCdtYXJrZXRwbGFjZS5qc29uJyxcblx0Jy5wbHVnaW4vbWFya2V0cGxhY2UuanNvbicsXG5dO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZChmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCB0YXJnZXREaXI6IFVSSSwgcGx1Z2luTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGZvciAoY29uc3QgcmVsUGF0aCBvZiBNQVJLRVRQTEFDRV9QQVRIUykge1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlVXJpID0gam9pblBhdGgodGFyZ2V0RGlyLCByZWxQYXRoKTtcblx0XHRpZiAoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKG1hcmtldHBsYWNlVXJpKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1hcmtldHBsYWNlVXJpKTtcblx0XHRcdFx0Y29uc3QgbWFya2V0cGxhY2UgPSBwYXJzZUpTT05DPFJlY29yZDxzdHJpbmcsIHVua25vd24+Pihjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAobWFya2V0cGxhY2UgJiYgdHlwZW9mIG1hcmtldHBsYWNlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShtYXJrZXRwbGFjZVsncGx1Z2lucyddKSkge1xuXHRcdFx0XHRcdFx0bWFya2V0cGxhY2VbJ3BsdWdpbnMnXSA9IFtdO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHBsdWdpbnMgPSBtYXJrZXRwbGFjZVsncGx1Z2lucyddIGFzIHsgbmFtZT86IHN0cmluZzsgc291cmNlPzogc3RyaW5nIH1bXTtcblxuXHRcdFx0XHRcdC8vIFNraXAgaWYgYSBwbHVnaW4gd2l0aCB0aGlzIG5hbWUgYWxyZWFkeSBleGlzdHNcblx0XHRcdFx0XHRpZiAocGx1Z2lucy5zb21lKHAgPT4gcC5uYW1lID09PSBwbHVnaW5OYW1lKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHBsdWdpbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRuYW1lOiBwbHVnaW5OYW1lLFxuXHRcdFx0XHRcdFx0c291cmNlOiBgLi8ke3BsdWdpbk5hbWV9L2AsXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoXG5cdFx0XHRcdFx0XHRtYXJrZXRwbGFjZVVyaSxcblx0XHRcdFx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobWFya2V0cGxhY2UsIG51bGwsICdcXHQnKSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU2tpcCBpZiBtYXJrZXRwbGFjZS5qc29uIGlzIHVucGFyc2VhYmxlXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47IC8vIE9ubHkgdXBkYXRlIHRoZSBmaXJzdCBmb3VuZCBtYXJrZXRwbGFjZVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDcmVhdGVQbHVnaW5BY3Rpb24oKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ3JlYXRlUGx1Z2luQWN0aW9uKSk7XG5cdHJldHVybiBzdG9yZTtc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
