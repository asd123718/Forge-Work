import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { AICustomizationSources } from "../../common/aiCustomizationWorkspaceService.js";
import { sectionToPromptType } from "./aiCustomizationManagement.js";
async function generateCustomizationDebugReport(section, promptsService, workspaceService, widgetState, itemSource, harnessService, agentPluginService) {
  const promptType = sectionToPromptType(section);
  const activeDescriptor = harnessService.getActiveDescriptor();
  const lines = [];
  lines.push(`== Customization Debug: ${section} (${promptType}) ==`);
  lines.push(`Window: ${workspaceService.isSessionsWindow ? "Sessions" : "Core VS Code"}`);
  lines.push(`Active root: ${workspaceService.getActiveProjectRoot()?.fsPath ?? "(none)"}`);
  lines.push(`Sections: [${workspaceService.managementSections.join(", ")}]`);
  if (activeDescriptor) {
    lines.push("");
    lines.push("--- Active Harness ---");
    lines.push(`  id: ${activeDescriptor.id}`);
    lines.push(`  label: ${activeDescriptor.label}`);
    lines.push(`  hasItemProvider: ${!!activeDescriptor.itemProvider}`);
    lines.push(`  hasDisableProvider: ${!!activeDescriptor.syncProvider}`);
    lines.push(`  hiddenSections: ${activeDescriptor.hiddenSections ? `[${activeDescriptor.hiddenSections.join(", ")}]` : "(none)"}`);
    lines.push(`  hideGenerateButton: ${activeDescriptor.hideGenerateButton ?? false}`);
    lines.push(`  requiredAgentId: ${activeDescriptor.requiredAgentId ?? "(none)"}`);
  }
  lines.push("");
  const extensionProvider = activeDescriptor.itemProvider;
  if (extensionProvider) {
    const providerLabel = "Extension Provider";
    await appendProviderData(lines, itemSource, promptType, providerLabel);
  } else {
    lines.push("--- Stage 1: No provider available ---");
    lines.push("");
    await appendRawServiceData(lines, promptsService, promptType);
    await appendUnfilteredData(lines, promptsService, promptType);
  }
  appendWidgetState(lines, widgetState);
  await appendSourceFolders(lines, promptsService, promptType);
  if (harnessService) {
    appendAllHarnesses(lines, harnessService);
  }
  if (agentPluginService) {
    appendInstalledPlugins(lines, agentPluginService);
  }
  return lines.join("\n");
}
async function getPromptFilesByStorage(promptsService, promptType) {
  const [localFiles, userFiles, extensionFiles] = await Promise.all([
    promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
    promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
    promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None)
  ]);
  return { localFiles, userFiles, extensionFiles };
}
async function appendProviderData(lines, itemSource, promptType, label) {
  lines.push(`--- Stage 1: Provider Output (${label}) ---`);
  const allItems = await itemSource.fetchProviderItems();
  if (allItems.length === 0) {
    lines.push(`  Total items from provider: 0 (or provider returned undefined and the item source normalized it to an empty array)`);
  } else {
    lines.push(`  Total items from provider: ${allItems.length}`);
  }
  const byType = /* @__PURE__ */ new Map();
  for (const item of allItems) {
    const existing = byType.get(item.type) ?? [];
    existing.push(item);
    byType.set(item.type, existing);
  }
  for (const [type, items] of byType) {
    lines.push(`  ${type}: ${items.length} items`);
    for (const item of items) {
      const path = item.uri.scheme === "file" ? item.uri.fsPath : item.uri.toString();
      lines.push(`    ${item.name} \u2014 ${path}`);
      if (item.description) {
        lines.push(`      desc: ${item.description}`);
      }
      lines.push(`      source: ${item.source}`);
      if (item.groupKey) {
        lines.push(`      groupKey: ${item.groupKey}`);
      }
      if (item.itemKey) {
        lines.push(`      itemKey: ${item.itemKey}`);
      }
      if (item.extensionId) {
        lines.push(`      extensionId: ${item.extensionId}`);
      }
      if (item.pluginUri) {
        lines.push(`      pluginUri: ${item.pluginUri.toString()}`);
      }
      if (item.badge) {
        lines.push(`      badge: ${item.badge}`);
      }
      if (item.status) {
        lines.push(`      status: ${item.status}${item.statusMessage ? ` (${item.statusMessage})` : ""}`);
      }
      if (item.enabled === false) {
        lines.push(`      enabled: false`);
      }
    }
  }
  const sectionItems = allItems.filter((i) => i.type === promptType);
  lines.push(`  Items matching current section (${promptType}): ${sectionItems.length}`);
  lines.push("");
}
async function appendRawServiceData(lines, promptsService, promptType) {
  lines.push("--- Stage 2a: Raw PromptsService Data ---");
  const { localFiles, userFiles, extensionFiles } = await getPromptFilesByStorage(promptsService, promptType);
  lines.push(`  listPromptFilesForStorage(local):  ${localFiles.length} files`);
  appendFileList(lines, localFiles);
  lines.push(`  listPromptFilesForStorage(user):   ${userFiles.length} files`);
  appendFileList(lines, userFiles);
  lines.push(`  listPromptFilesForStorage(ext):    ${extensionFiles.length} files`);
  appendFileList(lines, extensionFiles);
  const allFiles = await promptsService.listPromptFiles(promptType, CancellationToken.None);
  lines.push(`  listPromptFiles (merged):          ${allFiles.length} files`);
  if (promptType === PromptsType.instructions) {
    const agentInstructions = await promptsService.listAgentInstructions(CancellationToken.None, void 0);
    lines.push(`  listAgentInstructions (extra):     ${agentInstructions.length} files`);
    appendFileList(lines, agentInstructions);
  }
  if (promptType === PromptsType.skill) {
    const skills = await promptsService.findAgentSkills(CancellationToken.None);
    lines.push(`  findAgentSkills:                   ${skills?.length ?? 0} skills`);
    for (const s of skills ?? []) {
      lines.push(`    ${s.name ?? "?"} [${s.storage}] ${s.uri.fsPath}`);
    }
  }
  if (promptType === PromptsType.agent) {
    const agents = await promptsService.getCustomAgents(CancellationToken.None);
    lines.push(`  getCustomAgents:                   ${agents.length} agents`);
    for (const a of agents) {
      lines.push(`    ${a.name} [${a.source.storage}] ${a.uri.fsPath}`);
    }
  }
  if (promptType === PromptsType.prompt) {
    const commands = await promptsService.getPromptSlashCommands(CancellationToken.None);
    lines.push(`  getPromptSlashCommands:            ${commands.length} commands`);
    for (const c of commands) {
      lines.push(`    /${c.name} [${c.storage}] ${c.uri.fsPath} (type=${c.type})`);
    }
  }
  lines.push("");
}
async function appendUnfilteredData(lines, promptsService, promptType) {
  lines.push("--- Stage 2b: All files (no filtering applied) ---");
  const { localFiles, userFiles, extensionFiles } = await getPromptFilesByStorage(promptsService, promptType);
  const all = [...localFiles, ...userFiles, ...extensionFiles];
  lines.push(`  Count: ${all.length} total`);
  lines.push(`    local:     ${all.filter((f) => f.storage === PromptsStorage.local).length}`);
  lines.push(`    user:      ${all.filter((f) => f.storage === PromptsStorage.user).length}`);
  lines.push(`    extension: ${all.filter((f) => f.storage === PromptsStorage.extension).length}`);
  lines.push("");
}
function appendWidgetState(lines, state) {
  lines.push("--- Stage 3: Widget State (loadItems \u2192 filterItems) ---");
  lines.push(`  allItems (after loadItems): ${state.allItems.length}`);
  lines.push(`    local:     ${state.allItems.filter((i) => i.source === AICustomizationSources.local).length}`);
  lines.push(`    user:      ${state.allItems.filter((i) => i.source === AICustomizationSources.user).length}`);
  lines.push(`    extension: ${state.allItems.filter((i) => i.source === AICustomizationSources.extension).length}`);
  lines.push(`    plugin:    ${state.allItems.filter((i) => i.source === AICustomizationSources.plugin).length}`);
  lines.push(`    built-in:  ${state.allItems.filter((i) => i.source === AICustomizationSources.builtin).length}`);
  const syncableCount = state.allItems.filter((i) => i.syncable).length;
  if (syncableCount > 0) {
    lines.push(`    syncable:  ${syncableCount}`);
  }
  for (const item of state.allItems) {
    const flags = [`storage=${item.source ?? "?"}`, `groupKey=${item.groupKey ?? "(none)"}`];
    if (item.syncable) {
      flags.push("syncable");
    }
    if (item.pluginUri) {
      flags.push(`pluginUri=${item.pluginUri.toString()}`);
    }
    lines.push(`    - ${item.name} [${flags.join(", ")}]`);
  }
  lines.push(`  displayEntries (after filterItems): ${state.displayEntries.length}`);
  const fileEntries = state.displayEntries.filter((e) => e.type === "file-item");
  lines.push(`    file items shown: ${fileEntries.length}`);
  const groupEntries = state.displayEntries.filter((e) => e.type === "group-header");
  for (const g of groupEntries) {
    lines.push(`    group "${g.label}": count=${g.count}, collapsed=${g.collapsed}`);
  }
  lines.push("");
}
async function appendSourceFolders(lines, promptsService, promptType) {
  lines.push("--- Stage 4: Source Folders (creation targets) ---");
  const sourceFolders = await promptsService.getSourceFolders(promptType);
  for (const sf of sourceFolders) {
    lines.push(`  [${sf.storage}] ${sf.uri.fsPath}`);
  }
  try {
    const resolvedFolders = await promptsService.getResolvedSourceFolders(promptType);
    lines.push("");
    lines.push("--- Resolved Source Folders (discovery order) ---");
    for (const rf of resolvedFolders) {
      lines.push(`  [${rf.storage}] ${rf.uri.fsPath} (source=${rf.source})`);
    }
  } catch {
  }
}
function appendFileList(lines, files) {
  for (const f of files) {
    lines.push(`    ${f.uri.fsPath}`);
  }
}
function appendAllHarnesses(lines, harnessService) {
  lines.push("--- Stage 5: All Registered Harnesses ---");
  const activeId = harnessService.activeHarness.get();
  const harnesses = harnessService.availableHarnesses.get();
  lines.push(`  Active: ${activeId}`);
  lines.push(`  Total harnesses: ${harnesses.length}`);
  for (const h of harnesses) {
    const isActive = h.id === activeId ? " (ACTIVE)" : "";
    lines.push(`  [${h.id}]${isActive} "${h.label}"`);
    lines.push(`    hasItemProvider: ${!!h.itemProvider}`);
    lines.push(`    hasDisableProvider: ${!!h.syncProvider}`);
    lines.push(`    hiddenSections: ${h.hiddenSections ? `[${h.hiddenSections.join(", ")}]` : "(none)"}`);
    lines.push(`    hideGenerateButton: ${h.hideGenerateButton ?? false}`);
    lines.push(`    pluginActions: ${h.pluginActions?.length ?? 0}`);
    if (h.pluginActions) {
      for (const a of h.pluginActions) {
        lines.push(`      - ${a.id}: ${a.label}`);
      }
    }
  }
  lines.push("");
}
function appendInstalledPlugins(lines, agentPluginService) {
  lines.push("--- Stage 6: Installed Plugins ---");
  const plugins = agentPluginService.plugins.get();
  lines.push(`  Total: ${plugins.length}`);
  for (const p of plugins) {
    lines.push(`  [${p.label}] ${p.uri.toString()}`);
    if (p.fromMarketplace) {
      const m = p.fromMarketplace;
      lines.push(`    fromMarketplace: ${m.name}@${m.version} (marketplace=${m.marketplace}, type=${m.marketplaceType})`);
    } else {
      lines.push(`    fromMarketplace: (none)`);
    }
  }
  lines.push("");
}
export {
  generateCustomizationDebugReport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uRGVidWdQYW5lbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlLCBJUHJvbXB0UGF0aCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIEFJQ3VzdG9taXphdGlvblNvdXJjZSwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIHNlY3Rpb25Ub1Byb21wdFR5cGUgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgdHlwZSBJQ3VzdG9taXphdGlvbkl0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UuanMnO1xuXG4vKipcbiAqIFNuYXBzaG90IG9mIHRoZSBsaXN0IHdpZGdldCdzIGludGVybmFsIHN0YXRlLCBwYXNzZWQgaW4gdG8gYXZvaWQgY291cGxpbmcuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSURlYnVnV2lkZ2V0U3RhdGUge1xuXHRyZWFkb25seSBhbGxJdGVtczogcmVhZG9ubHkgeyByZWFkb25seSBuYW1lPzogc3RyaW5nOyByZWFkb25seSBzb3VyY2U/OiBBSUN1c3RvbWl6YXRpb25Tb3VyY2U7IHJlYWRvbmx5IGdyb3VwS2V5Pzogc3RyaW5nOyByZWFkb25seSBzeW5jYWJsZT86IGJvb2xlYW47IHJlYWRvbmx5IHBsdWdpblVyaT86IFVSSSB9W107XG5cdHJlYWRvbmx5IGRpc3BsYXlFbnRyaWVzOiByZWFkb25seSB7IHR5cGU6IHN0cmluZzsgbGFiZWw/OiBzdHJpbmc7IGNvdW50PzogbnVtYmVyOyBjb2xsYXBzZWQ/OiBib29sZWFuIH1bXTtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBkZWJ1ZyBkaWFnbm9zdGljcyByZXBvcnQgZm9yIHRoZSBBSSBDdXN0b21pemF0aW9uIGxpc3Qgd2lkZ2V0LlxuICpcbiAqIFRoZSByZXBvcnQgZm9sbG93cyB0aGUgdW5pZmllZCBwaXBlbGluZTpcbiAqICAgMS4gUHJvdmlkZXIgb3V0cHV0IFx1MjAxNCB3aGF0IHRoZSBhY3RpdmUgcHJvdmlkZXIgcmV0dXJuc1xuICogICAyLiBSYXcgUHJvbXB0c1NlcnZpY2UgZGF0YSBcdTIwMTQgbG93ZXItbGV2ZWwgc2VydmljZSBvdXRwdXQgKHdoZW4gbm8gZXh0ZW5zaW9uIHByb3ZpZGVyKVxuICogICAzLiBXaWRnZXQgc3RhdGUgXHUyMDE0IG5vcm1hbGl6ZWQgaXRlbXMgYW5kIGRpc3BsYXkgZW50cmllcyBhZnRlciBncm91cGluZ1xuICogICA0LiBTb3VyY2UgZm9sZGVycyBcdTIwMTQgd2hlcmUgZmlsZXMgYXJlIGRpc2NvdmVyZWQgZnJvbVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVDdXN0b21pemF0aW9uRGVidWdSZXBvcnQoXG5cdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLFxuXHRwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0d2lkZ2V0U3RhdGU6IElEZWJ1Z1dpZGdldFN0YXRlLFxuXHRpdGVtU291cmNlOiBJQUlDdXN0b21pemF0aW9uSXRlbVNvdXJjZSxcblx0aGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IHByb21wdFR5cGUgPSBzZWN0aW9uVG9Qcm9tcHRUeXBlKHNlY3Rpb24pO1xuXHRjb25zdCBhY3RpdmVEZXNjcmlwdG9yID0gaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpO1xuXHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHRsaW5lcy5wdXNoKGA9PSBDdXN0b21pemF0aW9uIERlYnVnOiAke3NlY3Rpb259ICgke3Byb21wdFR5cGV9KSA9PWApO1xuXHRsaW5lcy5wdXNoKGBXaW5kb3c6ICR7d29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gJ1Nlc3Npb25zJyA6ICdDb3JlIFZTIENvZGUnfWApO1xuXHRsaW5lcy5wdXNoKGBBY3RpdmUgcm9vdDogJHt3b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk/LmZzUGF0aCA/PyAnKG5vbmUpJ31gKTtcblx0bGluZXMucHVzaChgU2VjdGlvbnM6IFske3dvcmtzcGFjZVNlcnZpY2UubWFuYWdlbWVudFNlY3Rpb25zLmpvaW4oJywgJyl9XWApO1xuXG5cdC8vIEFjdGl2ZSBoYXJuZXNzIGRlc2NyaXB0b3Jcblx0aWYgKGFjdGl2ZURlc2NyaXB0b3IpIHtcblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHRsaW5lcy5wdXNoKCctLS0gQWN0aXZlIEhhcm5lc3MgLS0tJyk7XG5cdFx0bGluZXMucHVzaChgICBpZDogJHthY3RpdmVEZXNjcmlwdG9yLmlkfWApO1xuXHRcdGxpbmVzLnB1c2goYCAgbGFiZWw6ICR7YWN0aXZlRGVzY3JpcHRvci5sYWJlbH1gKTtcblx0XHRsaW5lcy5wdXNoKGAgIGhhc0l0ZW1Qcm92aWRlcjogJHshIWFjdGl2ZURlc2NyaXB0b3IuaXRlbVByb3ZpZGVyfWApO1xuXHRcdGxpbmVzLnB1c2goYCAgaGFzRGlzYWJsZVByb3ZpZGVyOiAkeyEhYWN0aXZlRGVzY3JpcHRvci5zeW5jUHJvdmlkZXJ9YCk7XG5cdFx0bGluZXMucHVzaChgICBoaWRkZW5TZWN0aW9uczogJHthY3RpdmVEZXNjcmlwdG9yLmhpZGRlblNlY3Rpb25zID8gYFske2FjdGl2ZURlc2NyaXB0b3IuaGlkZGVuU2VjdGlvbnMuam9pbignLCAnKX1dYCA6ICcobm9uZSknfWApO1xuXHRcdGxpbmVzLnB1c2goYCAgaGlkZUdlbmVyYXRlQnV0dG9uOiAke2FjdGl2ZURlc2NyaXB0b3IuaGlkZUdlbmVyYXRlQnV0dG9uID8/IGZhbHNlfWApO1xuXHRcdGxpbmVzLnB1c2goYCAgcmVxdWlyZWRBZ2VudElkOiAke2FjdGl2ZURlc2NyaXB0b3IucmVxdWlyZWRBZ2VudElkID8/ICcobm9uZSknfWApO1xuXHR9XG5cdGxpbmVzLnB1c2goJycpO1xuXG5cdC8vIERldGVybWluZSB3aGljaCBwcm92aWRlciB0aGUgd2lkZ2V0IGFjdHVhbGx5IHVzZXMgKG1pcnJvcnMgZ2V0SXRlbVNvdXJjZSBsb2dpYylcblx0Y29uc3QgZXh0ZW5zaW9uUHJvdmlkZXIgPSBhY3RpdmVEZXNjcmlwdG9yLml0ZW1Qcm92aWRlcjtcblxuXHQvLyBTdGFnZSAxOiBQcm92aWRlciBvdXRwdXRcblx0aWYgKGV4dGVuc2lvblByb3ZpZGVyKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJMYWJlbCA9ICdFeHRlbnNpb24gUHJvdmlkZXInO1xuXHRcdGF3YWl0IGFwcGVuZFByb3ZpZGVyRGF0YShsaW5lcywgaXRlbVNvdXJjZSwgcHJvbXB0VHlwZSwgcHJvdmlkZXJMYWJlbCk7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gU3RhZ2UgMjogUmF3IFByb21wdHNTZXJ2aWNlIGRhdGEgXHUyMDE0IGFsd2F5cyB1c2VmdWwgZm9yIGRpYWdub3N0aWNzXG5cdFx0bGluZXMucHVzaCgnLS0tIFN0YWdlIDE6IE5vIHByb3ZpZGVyIGF2YWlsYWJsZSAtLS0nKTtcblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHRhd2FpdCBhcHBlbmRSYXdTZXJ2aWNlRGF0YShsaW5lcywgcHJvbXB0c1NlcnZpY2UsIHByb21wdFR5cGUpO1xuXHRcdGF3YWl0IGFwcGVuZFVuZmlsdGVyZWREYXRhKGxpbmVzLCBwcm9tcHRzU2VydmljZSwgcHJvbXB0VHlwZSk7XG5cdH1cblxuXG5cdC8vIFN0YWdlIDM6IFdpZGdldCBzdGF0ZVxuXHRhcHBlbmRXaWRnZXRTdGF0ZShsaW5lcywgd2lkZ2V0U3RhdGUpO1xuXG5cdC8vIFN0YWdlIDQ6IFNvdXJjZSBmb2xkZXJzXG5cdGF3YWl0IGFwcGVuZFNvdXJjZUZvbGRlcnMobGluZXMsIHByb21wdHNTZXJ2aWNlLCBwcm9tcHRUeXBlKTtcblxuXHQvLyBTdGFnZSA1OiBBbGwgcmVnaXN0ZXJlZCBoYXJuZXNzZXNcblx0aWYgKGhhcm5lc3NTZXJ2aWNlKSB7XG5cdFx0YXBwZW5kQWxsSGFybmVzc2VzKGxpbmVzLCBoYXJuZXNzU2VydmljZSk7XG5cdH1cblxuXHQvLyBTdGFnZSA2OiBJbnN0YWxsZWQgcGx1Z2luc1xuXHRpZiAoYWdlbnRQbHVnaW5TZXJ2aWNlKSB7XG5cdFx0YXBwZW5kSW5zdGFsbGVkUGx1Z2lucyhsaW5lcywgYWdlbnRQbHVnaW5TZXJ2aWNlKTtcblx0fVxuXG5cdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuaW50ZXJmYWNlIElQcm9tcHRGaWxlc0J5U3RvcmFnZSB7XG5cdHJlYWRvbmx5IGxvY2FsRmlsZXM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW107XG5cdHJlYWRvbmx5IHVzZXJGaWxlczogcmVhZG9ubHkgSVByb21wdFBhdGhbXTtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uRmlsZXM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW107XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFByb21wdEZpbGVzQnlTdG9yYWdlKHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsIHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxJUHJvbXB0RmlsZXNCeVN0b3JhZ2U+IHtcblx0Y29uc3QgW2xvY2FsRmlsZXMsIHVzZXJGaWxlcywgZXh0ZW5zaW9uRmlsZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdHByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdHByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UudXNlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShwcm9tcHRUeXBlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRdKTtcblxuXHRyZXR1cm4geyBsb2NhbEZpbGVzLCB1c2VyRmlsZXMsIGV4dGVuc2lvbkZpbGVzIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGVuZFByb3ZpZGVyRGF0YShsaW5lczogc3RyaW5nW10sIGl0ZW1Tb3VyY2U6IElBSUN1c3RvbWl6YXRpb25JdGVtU291cmNlLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgbGFiZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRsaW5lcy5wdXNoKGAtLS0gU3RhZ2UgMTogUHJvdmlkZXIgT3V0cHV0ICgke2xhYmVsfSkgLS0tYCk7XG5cblx0Y29uc3QgYWxsSXRlbXMgPSBhd2FpdCBpdGVtU291cmNlLmZldGNoUHJvdmlkZXJJdGVtcygpO1xuXG5cdGlmIChhbGxJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRsaW5lcy5wdXNoKGAgIFRvdGFsIGl0ZW1zIGZyb20gcHJvdmlkZXI6IDAgKG9yIHByb3ZpZGVyIHJldHVybmVkIHVuZGVmaW5lZCBhbmQgdGhlIGl0ZW0gc291cmNlIG5vcm1hbGl6ZWQgaXQgdG8gYW4gZW1wdHkgYXJyYXkpYCk7XG5cdH0gZWxzZSB7XG5cdFx0bGluZXMucHVzaChgICBUb3RhbCBpdGVtcyBmcm9tIHByb3ZpZGVyOiAke2FsbEl0ZW1zLmxlbmd0aH1gKTtcblx0fVxuXG5cdC8vIEdyb3VwIGJ5IHR5cGUgZm9yIHN1bW1hcnlcblx0Y29uc3QgYnlUeXBlID0gbmV3IE1hcDxzdHJpbmcsIElDdXN0b21pemF0aW9uSXRlbVtdPigpO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgYWxsSXRlbXMpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IGJ5VHlwZS5nZXQoaXRlbS50eXBlKSA/PyBbXTtcblx0XHRleGlzdGluZy5wdXNoKGl0ZW0pO1xuXHRcdGJ5VHlwZS5zZXQoaXRlbS50eXBlLCBleGlzdGluZyk7XG5cdH1cblx0Zm9yIChjb25zdCBbdHlwZSwgaXRlbXNdIG9mIGJ5VHlwZSkge1xuXHRcdGxpbmVzLnB1c2goYCAgJHt0eXBlfTogJHtpdGVtcy5sZW5ndGh9IGl0ZW1zYCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCBwYXRoID0gaXRlbS51cmkuc2NoZW1lID09PSAnZmlsZScgPyBpdGVtLnVyaS5mc1BhdGggOiBpdGVtLnVyaS50b1N0cmluZygpO1xuXHRcdFx0bGluZXMucHVzaChgICAgICR7aXRlbS5uYW1lfSBcdTIwMTQgJHtwYXRofWApO1xuXHRcdFx0aWYgKGl0ZW0uZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgZGVzYzogJHtpdGVtLmRlc2NyaXB0aW9ufWApO1xuXHRcdFx0fVxuXHRcdFx0bGluZXMucHVzaChgICAgICAgc291cmNlOiAke2l0ZW0uc291cmNlfWApO1xuXHRcdFx0aWYgKGl0ZW0uZ3JvdXBLZXkpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgZ3JvdXBLZXk6ICR7aXRlbS5ncm91cEtleX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLml0ZW1LZXkpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgaXRlbUtleTogJHtpdGVtLml0ZW1LZXl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXRlbS5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgICAgICBleHRlbnNpb25JZDogJHtpdGVtLmV4dGVuc2lvbklkfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGl0ZW0ucGx1Z2luVXJpKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goYCAgICAgIHBsdWdpblVyaTogJHtpdGVtLnBsdWdpblVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGl0ZW0uYmFkZ2UpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgYmFkZ2U6ICR7aXRlbS5iYWRnZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLnN0YXR1cykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgICAgICBzdGF0dXM6ICR7aXRlbS5zdGF0dXN9JHtpdGVtLnN0YXR1c01lc3NhZ2UgPyBgICgke2l0ZW0uc3RhdHVzTWVzc2FnZX0pYCA6ICcnfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGl0ZW0uZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgZW5hYmxlZDogZmFsc2VgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb25zdCBzZWN0aW9uSXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IHByb21wdFR5cGUpO1xuXHRsaW5lcy5wdXNoKGAgIEl0ZW1zIG1hdGNoaW5nIGN1cnJlbnQgc2VjdGlvbiAoJHtwcm9tcHRUeXBlfSk6ICR7c2VjdGlvbkl0ZW1zLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaCgnJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGVuZFJhd1NlcnZpY2VEYXRhKGxpbmVzOiBzdHJpbmdbXSwgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0bGluZXMucHVzaCgnLS0tIFN0YWdlIDJhOiBSYXcgUHJvbXB0c1NlcnZpY2UgRGF0YSAtLS0nKTtcblxuXHRjb25zdCB7IGxvY2FsRmlsZXMsIHVzZXJGaWxlcywgZXh0ZW5zaW9uRmlsZXMgfSA9IGF3YWl0IGdldFByb21wdEZpbGVzQnlTdG9yYWdlKHByb21wdHNTZXJ2aWNlLCBwcm9tcHRUeXBlKTtcblxuXHRsaW5lcy5wdXNoKGAgIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UobG9jYWwpOiAgJHtsb2NhbEZpbGVzLmxlbmd0aH0gZmlsZXNgKTtcblx0YXBwZW5kRmlsZUxpc3QobGluZXMsIGxvY2FsRmlsZXMpO1xuXG5cdGxpbmVzLnB1c2goYCAgbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh1c2VyKTogICAke3VzZXJGaWxlcy5sZW5ndGh9IGZpbGVzYCk7XG5cdGFwcGVuZEZpbGVMaXN0KGxpbmVzLCB1c2VyRmlsZXMpO1xuXG5cdGxpbmVzLnB1c2goYCAgbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShleHQpOiAgICAke2V4dGVuc2lvbkZpbGVzLmxlbmd0aH0gZmlsZXNgKTtcblx0YXBwZW5kRmlsZUxpc3QobGluZXMsIGV4dGVuc2lvbkZpbGVzKTtcblxuXHRjb25zdCBhbGxGaWxlcyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhwcm9tcHRUeXBlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0bGluZXMucHVzaChgICBsaXN0UHJvbXB0RmlsZXMgKG1lcmdlZCk6ICAgICAgICAgICR7YWxsRmlsZXMubGVuZ3RofSBmaWxlc2ApO1xuXG5cdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9ucyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB1bmRlZmluZWQpO1xuXHRcdGxpbmVzLnB1c2goYCAgbGlzdEFnZW50SW5zdHJ1Y3Rpb25zIChleHRyYSk6ICAgICAke2FnZW50SW5zdHJ1Y3Rpb25zLmxlbmd0aH0gZmlsZXNgKTtcblx0XHRhcHBlbmRGaWxlTGlzdChsaW5lcywgYWdlbnRJbnN0cnVjdGlvbnMpO1xuXHR9XG5cblx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgcHJvbXB0c1NlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGxpbmVzLnB1c2goYCAgZmluZEFnZW50U2tpbGxzOiAgICAgICAgICAgICAgICAgICAke3NraWxscz8ubGVuZ3RoID8/IDB9IHNraWxsc2ApO1xuXHRcdGZvciAoY29uc3QgcyBvZiBza2lsbHMgPz8gW10pIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgICAke3MubmFtZSA/PyAnPyd9IFske3Muc3RvcmFnZX1dICR7cy51cmkuZnNQYXRofWApO1xuXHRcdH1cblx0fVxuXG5cdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRsaW5lcy5wdXNoKGAgIGdldEN1c3RvbUFnZW50czogICAgICAgICAgICAgICAgICAgJHthZ2VudHMubGVuZ3RofSBhZ2VudHNgKTtcblx0XHRmb3IgKGNvbnN0IGEgb2YgYWdlbnRzKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgJHthLm5hbWV9IFske2Euc291cmNlLnN0b3JhZ2V9XSAke2EudXJpLmZzUGF0aH1gKTtcblx0XHR9XG5cdH1cblxuXHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0KSB7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBwcm9tcHRzU2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGxpbmVzLnB1c2goYCAgZ2V0UHJvbXB0U2xhc2hDb21tYW5kczogICAgICAgICAgICAke2NvbW1hbmRzLmxlbmd0aH0gY29tbWFuZHNgKTtcblx0XHRmb3IgKGNvbnN0IGMgb2YgY29tbWFuZHMpIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgICAvJHtjLm5hbWV9IFske2Muc3RvcmFnZX1dICR7Yy51cmkuZnNQYXRofSAodHlwZT0ke2MudHlwZX0pYCk7XG5cdFx0fVxuXHR9XG5cblx0bGluZXMucHVzaCgnJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGVuZFVuZmlsdGVyZWREYXRhKGxpbmVzOiBzdHJpbmdbXSwgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0bGluZXMucHVzaCgnLS0tIFN0YWdlIDJiOiBBbGwgZmlsZXMgKG5vIGZpbHRlcmluZyBhcHBsaWVkKSAtLS0nKTtcblxuXHRjb25zdCB7IGxvY2FsRmlsZXMsIHVzZXJGaWxlcywgZXh0ZW5zaW9uRmlsZXMgfSA9IGF3YWl0IGdldFByb21wdEZpbGVzQnlTdG9yYWdlKHByb21wdHNTZXJ2aWNlLCBwcm9tcHRUeXBlKTtcblx0Y29uc3QgYWxsOiBJUHJvbXB0UGF0aFtdID0gWy4uLmxvY2FsRmlsZXMsIC4uLnVzZXJGaWxlcywgLi4uZXh0ZW5zaW9uRmlsZXNdO1xuXHRsaW5lcy5wdXNoKGAgIENvdW50OiAke2FsbC5sZW5ndGh9IHRvdGFsYCk7XG5cdGxpbmVzLnB1c2goYCAgICBsb2NhbDogICAgICR7YWxsLmZpbHRlcihmID0+IGYuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaChgICAgIHVzZXI6ICAgICAgJHthbGwuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKS5sZW5ndGh9YCk7XG5cdGxpbmVzLnB1c2goYCAgICBleHRlbnNpb246ICR7YWxsLmZpbHRlcihmID0+IGYuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKS5sZW5ndGh9YCk7XG5cblx0bGluZXMucHVzaCgnJyk7XG59XG5cbmZ1bmN0aW9uIGFwcGVuZFdpZGdldFN0YXRlKGxpbmVzOiBzdHJpbmdbXSwgc3RhdGU6IElEZWJ1Z1dpZGdldFN0YXRlKTogdm9pZCB7XG5cdGxpbmVzLnB1c2goJy0tLSBTdGFnZSAzOiBXaWRnZXQgU3RhdGUgKGxvYWRJdGVtcyBcdTIxOTIgZmlsdGVySXRlbXMpIC0tLScpO1xuXHRsaW5lcy5wdXNoKGAgIGFsbEl0ZW1zIChhZnRlciBsb2FkSXRlbXMpOiAke3N0YXRlLmFsbEl0ZW1zLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaChgICAgIGxvY2FsOiAgICAgJHtzdGF0ZS5hbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCkubGVuZ3RofWApO1xuXHRsaW5lcy5wdXNoKGAgICAgdXNlcjogICAgICAke3N0YXRlLmFsbEl0ZW1zLmZpbHRlcihpID0+IGkuc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIpLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaChgICAgIGV4dGVuc2lvbjogJHtzdGF0ZS5hbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb24pLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaChgICAgIHBsdWdpbjogICAgJHtzdGF0ZS5hbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4pLmxlbmd0aH1gKTtcblx0bGluZXMucHVzaChgICAgIGJ1aWx0LWluOiAgJHtzdGF0ZS5hbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluKS5sZW5ndGh9YCk7XG5cdGNvbnN0IHN5bmNhYmxlQ291bnQgPSBzdGF0ZS5hbGxJdGVtcy5maWx0ZXIoaSA9PiBpLnN5bmNhYmxlKS5sZW5ndGg7XG5cdGlmIChzeW5jYWJsZUNvdW50ID4gMCkge1xuXHRcdGxpbmVzLnB1c2goYCAgICBzeW5jYWJsZTogICR7c3luY2FibGVDb3VudH1gKTtcblx0fVxuXG5cdGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5hbGxJdGVtcykge1xuXHRcdGNvbnN0IGZsYWdzOiBzdHJpbmdbXSA9IFtgc3RvcmFnZT0ke2l0ZW0uc291cmNlID8/ICc/J31gLCBgZ3JvdXBLZXk9JHtpdGVtLmdyb3VwS2V5ID8/ICcobm9uZSknfWBdO1xuXHRcdGlmIChpdGVtLnN5bmNhYmxlKSB7XG5cdFx0XHRmbGFncy5wdXNoKCdzeW5jYWJsZScpO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5wbHVnaW5VcmkpIHtcblx0XHRcdGZsYWdzLnB1c2goYHBsdWdpblVyaT0ke2l0ZW0ucGx1Z2luVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGxpbmVzLnB1c2goYCAgICAtICR7aXRlbS5uYW1lfSBbJHtmbGFncy5qb2luKCcsICcpfV1gKTtcblx0fVxuXG5cdGxpbmVzLnB1c2goYCAgZGlzcGxheUVudHJpZXMgKGFmdGVyIGZpbHRlckl0ZW1zKTogJHtzdGF0ZS5kaXNwbGF5RW50cmllcy5sZW5ndGh9YCk7XG5cdGNvbnN0IGZpbGVFbnRyaWVzID0gc3RhdGUuZGlzcGxheUVudHJpZXMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAnZmlsZS1pdGVtJyk7XG5cdGxpbmVzLnB1c2goYCAgICBmaWxlIGl0ZW1zIHNob3duOiAke2ZpbGVFbnRyaWVzLmxlbmd0aH1gKTtcblx0Y29uc3QgZ3JvdXBFbnRyaWVzID0gc3RhdGUuZGlzcGxheUVudHJpZXMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAnZ3JvdXAtaGVhZGVyJyk7XG5cdGZvciAoY29uc3QgZyBvZiBncm91cEVudHJpZXMpIHtcblx0XHRsaW5lcy5wdXNoKGAgICAgZ3JvdXAgXCIke2cubGFiZWx9XCI6IGNvdW50PSR7Zy5jb3VudH0sIGNvbGxhcHNlZD0ke2cuY29sbGFwc2VkfWApO1xuXHR9XG5cdGxpbmVzLnB1c2goJycpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBhcHBlbmRTb3VyY2VGb2xkZXJzKGxpbmVzOiBzdHJpbmdbXSwgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0bGluZXMucHVzaCgnLS0tIFN0YWdlIDQ6IFNvdXJjZSBGb2xkZXJzIChjcmVhdGlvbiB0YXJnZXRzKSAtLS0nKTtcblx0Y29uc3Qgc291cmNlRm9sZGVycyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmdldFNvdXJjZUZvbGRlcnMocHJvbXB0VHlwZSk7XG5cdGZvciAoY29uc3Qgc2Ygb2Ygc291cmNlRm9sZGVycykge1xuXHRcdGxpbmVzLnB1c2goYCAgWyR7c2Yuc3RvcmFnZX1dICR7c2YudXJpLmZzUGF0aH1gKTtcblx0fVxuXG5cdHRyeSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRGb2xkZXJzID0gYXdhaXQgcHJvbXB0c1NlcnZpY2UuZ2V0UmVzb2x2ZWRTb3VyY2VGb2xkZXJzKHByb21wdFR5cGUpO1xuXHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdGxpbmVzLnB1c2goJy0tLSBSZXNvbHZlZCBTb3VyY2UgRm9sZGVycyAoZGlzY292ZXJ5IG9yZGVyKSAtLS0nKTtcblx0XHRmb3IgKGNvbnN0IHJmIG9mIHJlc29sdmVkRm9sZGVycykge1xuXHRcdFx0bGluZXMucHVzaChgICBbJHtyZi5zdG9yYWdlfV0gJHtyZi51cmkuZnNQYXRofSAoc291cmNlPSR7cmYuc291cmNlfSlgKTtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGdldFJlc29sdmVkU291cmNlRm9sZGVycyBtYXkgbm90IGV4aXN0IGZvciBhbGwgdHlwZXNcblx0fVxufVxuXG5mdW5jdGlvbiBhcHBlbmRGaWxlTGlzdChsaW5lczogc3RyaW5nW10sIGZpbGVzOiByZWFkb25seSB7IHVyaTogVVJJIH1bXSk6IHZvaWQge1xuXHRmb3IgKGNvbnN0IGYgb2YgZmlsZXMpIHtcblx0XHRsaW5lcy5wdXNoKGAgICAgJHtmLnVyaS5mc1BhdGh9YCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kQWxsSGFybmVzc2VzKGxpbmVzOiBzdHJpbmdbXSwgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpOiB2b2lkIHtcblx0bGluZXMucHVzaCgnLS0tIFN0YWdlIDU6IEFsbCBSZWdpc3RlcmVkIEhhcm5lc3NlcyAtLS0nKTtcblx0Y29uc3QgYWN0aXZlSWQgPSBoYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpO1xuXHRjb25zdCBoYXJuZXNzZXMgPSBoYXJuZXNzU2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMuZ2V0KCk7XG5cdGxpbmVzLnB1c2goYCAgQWN0aXZlOiAke2FjdGl2ZUlkfWApO1xuXHRsaW5lcy5wdXNoKGAgIFRvdGFsIGhhcm5lc3NlczogJHtoYXJuZXNzZXMubGVuZ3RofWApO1xuXHRmb3IgKGNvbnN0IGggb2YgaGFybmVzc2VzKSB7XG5cdFx0Y29uc3QgaXNBY3RpdmUgPSBoLmlkID09PSBhY3RpdmVJZCA/ICcgKEFDVElWRSknIDogJyc7XG5cdFx0bGluZXMucHVzaChgICBbJHtoLmlkfV0ke2lzQWN0aXZlfSBcIiR7aC5sYWJlbH1cImApO1xuXHRcdGxpbmVzLnB1c2goYCAgICBoYXNJdGVtUHJvdmlkZXI6ICR7ISFoLml0ZW1Qcm92aWRlcn1gKTtcblx0XHRsaW5lcy5wdXNoKGAgICAgaGFzRGlzYWJsZVByb3ZpZGVyOiAkeyEhaC5zeW5jUHJvdmlkZXJ9YCk7XG5cdFx0bGluZXMucHVzaChgICAgIGhpZGRlblNlY3Rpb25zOiAke2guaGlkZGVuU2VjdGlvbnMgPyBgWyR7aC5oaWRkZW5TZWN0aW9ucy5qb2luKCcsICcpfV1gIDogJyhub25lKSd9YCk7XG5cdFx0bGluZXMucHVzaChgICAgIGhpZGVHZW5lcmF0ZUJ1dHRvbjogJHtoLmhpZGVHZW5lcmF0ZUJ1dHRvbiA/PyBmYWxzZX1gKTtcblx0XHRsaW5lcy5wdXNoKGAgICAgcGx1Z2luQWN0aW9uczogJHtoLnBsdWdpbkFjdGlvbnM/Lmxlbmd0aCA/PyAwfWApO1xuXHRcdGlmIChoLnBsdWdpbkFjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgYSBvZiBoLnBsdWdpbkFjdGlvbnMpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICAgICAgLSAke2EuaWR9OiAke2EubGFiZWx9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGxpbmVzLnB1c2goJycpO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRJbnN0YWxsZWRQbHVnaW5zKGxpbmVzOiBzdHJpbmdbXSwgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlKTogdm9pZCB7XG5cdGxpbmVzLnB1c2goJy0tLSBTdGFnZSA2OiBJbnN0YWxsZWQgUGx1Z2lucyAtLS0nKTtcblx0Y29uc3QgcGx1Z2lucyA9IGFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpO1xuXHRsaW5lcy5wdXNoKGAgIFRvdGFsOiAke3BsdWdpbnMubGVuZ3RofWApO1xuXHRmb3IgKGNvbnN0IHAgb2YgcGx1Z2lucykge1xuXHRcdGxpbmVzLnB1c2goYCAgWyR7cC5sYWJlbH1dICR7cC51cmkudG9TdHJpbmcoKX1gKTtcblx0XHRpZiAocC5mcm9tTWFya2V0cGxhY2UpIHtcblx0XHRcdGNvbnN0IG0gPSBwLmZyb21NYXJrZXRwbGFjZTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBmcm9tTWFya2V0cGxhY2U6ICR7bS5uYW1lfUAke20udmVyc2lvbn0gKG1hcmtldHBsYWNlPSR7bS5tYXJrZXRwbGFjZX0sIHR5cGU9JHttLm1hcmtldHBsYWNlVHlwZX0pYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBmcm9tTWFya2V0cGxhY2U6IChub25lKWApO1xuXHRcdH1cblx0fVxuXHRsaW5lcy5wdXNoKCcnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBRWxDLFNBQTBCLHNCQUFtQztBQUM3RCxTQUFTLG1CQUFt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
