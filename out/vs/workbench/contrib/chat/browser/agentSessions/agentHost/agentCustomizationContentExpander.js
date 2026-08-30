import { extname } from "../../../../../../base/common/path.js";
import { joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { parseFrontMatter } from "../../../../../../base/common/yaml.js";
import { SKILL_FILENAME } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
class AgentCustomizationContentExpander {
  constructor(fileService, logService) {
    this.fileService = fileService;
    this.logService = logService;
  }
  async expandPluginContents(pluginUri, groupKey, isBundleItem, source, pluginLabel, token) {
    const fsRoot = pluginUri;
    const children = [];
    try {
      if (!await this.fileService.canHandleResource(fsRoot)) {
        return [];
      }
      if (token.isCancellationRequested) {
        return [];
      }
      const dirNames = ["agents", "skills", "commands", "rules"];
      const promptTypes = [PromptsType.agent, PromptsType.skill, PromptsType.prompt, PromptsType.instructions];
      const stats = await this.fileService.resolveAll(dirNames.map((name) => ({ resource: URI.joinPath(fsRoot, name) })));
      if (token.isCancellationRequested) {
        return [];
      }
      for (let i = 0; i < dirNames.length; i++) {
        const stat = stats[i];
        const promptType = promptTypes[i];
        if (!stat.success || !stat.stat?.isDirectory || !stat.stat.children) {
          continue;
        }
        if (promptType === PromptsType.skill) {
          children.push(...await this.collectFromSkillDir(stat.stat.children, pluginUri, source, groupKey, isBundleItem, pluginLabel, token));
        } else {
          children.push(...await this.collectFromRegularDir(stat.stat.children, pluginUri, source, promptType, groupKey, isBundleItem, pluginLabel, token));
        }
      }
      children.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
    } catch (err) {
      this.logService.trace(`[AgentCustomizationContentExpander] Failed to expand plugin ${pluginUri.toString()}: ${err}`);
      return [];
    }
    return children;
  }
  /**
   * Emits one item per skill subfolder that contains a SKILL.md file.
   * The skill metadata comes from SKILL.md frontmatter.
   */
  async collectFromSkillDir(entries, pluginUri, source, groupKey, isBundleItem, pluginLabel, token) {
    const eligible = [];
    const readMetaDataPromises = [];
    for (const child of entries) {
      if (child.name.startsWith(".")) {
        continue;
      }
      if (!child.isDirectory) {
        continue;
      }
      eligible.push(child);
      readMetaDataPromises.push(this.readPromptMetadata(joinPath(child.resource, SKILL_FILENAME), token));
    }
    const promptMetadata = await Promise.all(readMetaDataPromises);
    if (token.isCancellationRequested) {
      return [];
    }
    const items = [];
    for (let i = 0; i < eligible.length; i++) {
      const child = eligible[i];
      const meta = promptMetadata[i];
      if (!meta) {
        continue;
      }
      const uri = joinPath(child.resource, SKILL_FILENAME);
      const name = meta.name ?? child.name;
      const description = meta.description;
      const userInvocable = meta.userInvocable;
      items.push({
        uri,
        type: PromptsType.skill,
        name,
        description,
        source,
        groupKey,
        extensionId: void 0,
        pluginUri: isBundleItem ? void 0 : pluginUri,
        pluginLabel: isBundleItem ? void 0 : pluginLabel,
        userInvocable
      });
    }
    return items;
  }
  /**
   * Emits one item per markdown file for agent/rules/command folders.
   * Agents and instructions read frontmatter name/description, and
   * agents additionally surface userInvocable. Instruction (rules)
   * folders additionally accept `.mdc` files per the Open Plugins spec.
   */
  async collectFromRegularDir(entries, pluginUri, source, promptType, groupKey, isBundleItem, pluginLabel, token) {
    const eligible = [];
    for (const child of entries) {
      if (child.name.startsWith(".")) {
        continue;
      }
      if (child.isDirectory) {
        continue;
      }
      const ext = extname(child.name);
      if (ext !== ".md" && !(promptType === PromptsType.instructions && ext === ".mdc")) {
        continue;
      }
      eligible.push(child);
    }
    const parseMetadata = promptType === PromptsType.agent || promptType === PromptsType.instructions;
    const promptMetadata = parseMetadata ? await Promise.all(eligible.map((child) => this.readPromptMetadata(child.resource, token))) : void 0;
    if (token.isCancellationRequested) {
      return [];
    }
    const items = [];
    for (let i = 0; i < eligible.length; i++) {
      const child = eligible[i];
      const meta = promptMetadata?.[i];
      items.push({
        uri: child.resource,
        type: promptType,
        name: meta?.name ?? stripPromptFileExtensions(child.name),
        description: meta?.description,
        source,
        groupKey,
        extensionId: void 0,
        pluginUri: isBundleItem ? void 0 : pluginUri,
        pluginLabel: isBundleItem ? void 0 : pluginLabel,
        userInvocable: promptType === PromptsType.agent ? meta?.userInvocable : void 0
      });
    }
    return items;
  }
  /**
   * Reads a prompt markdown file and returns selected frontmatter
   * metadata. Returns `undefined` when the file is not markdown, or
   * when it cannot be read/parsed.
   */
  async readPromptMetadata(promptFileUri, token) {
    if (extname(promptFileUri.path) !== ".md") {
      return void 0;
    }
    try {
      const content = await this.fileService.readFile(promptFileUri);
      if (token.isCancellationRequested) {
        return void 0;
      }
      const frontmatter = parseFrontMatter(content.value.toString());
      if (frontmatter) {
        const name = frontmatter.getStringValue("name");
        const description = frontmatter.getStringValue("description");
        const userInvocableStr = frontmatter.getStringValue("user-invocable");
        const userInvocable = userInvocableStr === "true" ? true : userInvocableStr === "false" ? false : void 0;
        return { name, description, userInvocable };
      }
      return { name: void 0, description: void 0, userInvocable: void 0 };
    } catch (err) {
      this.logService.trace(`[AgentCustomizationContentExpander] Failed to read prompt metadata ${promptFileUri.toString()}: ${err}`);
      return void 0;
    }
  }
}
function stripPromptFileExtensions(filename) {
  const ext = extname(filename);
  if (!ext) {
    return filename;
  }
  const stem = filename.slice(0, -ext.length);
  const dotInStem = stem.lastIndexOf(".");
  return dotInStem > 0 ? stem.slice(0, dotInStem) : stem;
}
export {
  AgentCustomizationContentExpander
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHBhcnNlRnJvbnRNYXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi95YW1sLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU0tJTExfRklMRU5BTUUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5cbi8qKlxuICogRXhwYW5kcyBwbHVnaW4gcm9vdHMgaW50byBpbmRpdmlkdWFsIGN1c3RvbWl6YXRpb24gaXRlbXMgYnkgc2Nhbm5pbmcgdGhlXG4gKiBjYW5vbmljYWwgc3ViZm9sZGVycyAoYWdlbnRzL3NraWxscy9jb21tYW5kcy9ydWxlcykuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGV4cGFuZFBsdWdpbkNvbnRlbnRzKHBsdWdpblVyaTogVVJJLCBncm91cEtleTogc3RyaW5nLCBpc0J1bmRsZUl0ZW06IGJvb2xlYW4sIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlLCBwbHVnaW5MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdFx0Ly8gcGx1Z2luVXJpIGlzIGFscmVhZHkgYW4gYWdlbnQtaG9zdDovLyBVUkkgKGZyb20gdG9SZW1vdGVVcmkpLFxuXHRcdC8vIHNvIHVzZSBpdCBkaXJlY3RseSBhcyB0aGUgZmlsZXN5c3RlbSByb290LlxuXHRcdGNvbnN0IGZzUm9vdCA9IHBsdWdpblVyaTtcblx0XHRjb25zdCBjaGlsZHJlbjogSUN1c3RvbWl6YXRpb25JdGVtW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKGZzUm9vdCkpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGlyTmFtZXMgPSBbJ2FnZW50cycsICdza2lsbHMnLCAnY29tbWFuZHMnLCAncnVsZXMnXSBhcyBjb25zdDtcblx0XHRcdGNvbnN0IHByb21wdFR5cGVzID0gW1Byb21wdHNUeXBlLmFnZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdIGFzIGNvbnN0O1xuXHRcdFx0Y29uc3Qgc3RhdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmVBbGwoZGlyTmFtZXMubWFwKG5hbWUgPT4gKHsgcmVzb3VyY2U6IFVSSS5qb2luUGF0aChmc1Jvb3QsIG5hbWUpIH0pKSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGlyTmFtZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IHN0YXRzW2ldO1xuXHRcdFx0XHRjb25zdCBwcm9tcHRUeXBlID0gcHJvbXB0VHlwZXNbaV07XG5cdFx0XHRcdGlmICghc3RhdC5zdWNjZXNzIHx8ICFzdGF0LnN0YXQ/LmlzRGlyZWN0b3J5IHx8ICFzdGF0LnN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmF3YWl0IHRoaXMuY29sbGVjdEZyb21Ta2lsbERpcihzdGF0LnN0YXQuY2hpbGRyZW4sIHBsdWdpblVyaSwgc291cmNlLCBncm91cEtleSwgaXNCdW5kbGVJdGVtLCBwbHVnaW5MYWJlbCwgdG9rZW4pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmF3YWl0IHRoaXMuY29sbGVjdEZyb21SZWd1bGFyRGlyKHN0YXQuc3RhdC5jaGlsZHJlbiwgcGx1Z2luVXJpLCBzb3VyY2UsIHByb21wdFR5cGUsIGdyb3VwS2V5LCBpc0J1bmRsZUl0ZW0sIHBsdWdpbkxhYmVsLCB0b2tlbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBgJHthLnR5cGV9OiR7YS5uYW1lfWAubG9jYWxlQ29tcGFyZShgJHtiLnR5cGV9OiR7Yi5uYW1lfWApKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcl0gRmFpbGVkIHRvIGV4cGFuZCBwbHVnaW4gJHtwbHVnaW5VcmkudG9TdHJpbmcoKX06ICR7ZXJyfWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgb25lIGl0ZW0gcGVyIHNraWxsIHN1YmZvbGRlciB0aGF0IGNvbnRhaW5zIGEgU0tJTEwubWQgZmlsZS5cblx0ICogVGhlIHNraWxsIG1ldGFkYXRhIGNvbWVzIGZyb20gU0tJTEwubWQgZnJvbnRtYXR0ZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RGcm9tU2tpbGxEaXIoZW50cmllczogcmVhZG9ubHkgeyBuYW1lOiBzdHJpbmc7IHJlc291cmNlOiBVUkk7IGlzRGlyZWN0b3J5OiBib29sZWFuIH1bXSwgcGx1Z2luVXJpOiBVUkksIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlLCBncm91cEtleTogc3RyaW5nLCBpc0J1bmRsZUl0ZW06IGJvb2xlYW4sIHBsdWdpbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHR0eXBlIEVudHJ5ID0geyBuYW1lOiBzdHJpbmc7IHJlc291cmNlOiBVUkk7IGlzRGlyZWN0b3J5OiBib29sZWFuIH07XG5cdFx0Y29uc3QgZWxpZ2libGU6IEVudHJ5W10gPSBbXTtcblx0XHRjb25zdCByZWFkTWV0YURhdGFQcm9taXNlcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZW50cmllcykge1xuXHRcdFx0Ly8gU2tpcCBkb3RmaWxlcyAoZS5nLiAuRFNfU3RvcmUpXG5cdFx0XHRpZiAoY2hpbGQubmFtZS5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNoaWxkLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZWxpZ2libGUucHVzaChjaGlsZCk7XG5cdFx0XHRyZWFkTWV0YURhdGFQcm9taXNlcy5wdXNoKHRoaXMucmVhZFByb21wdE1ldGFkYXRhKGpvaW5QYXRoKGNoaWxkLnJlc291cmNlLCBTS0lMTF9GSUxFTkFNRSksIHRva2VuKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbXB0TWV0YWRhdGEgPSBhd2FpdCBQcm9taXNlLmFsbChyZWFkTWV0YURhdGFQcm9taXNlcyk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IElDdXN0b21pemF0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbGlnaWJsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBlbGlnaWJsZVtpXTtcblx0XHRcdGNvbnN0IG1ldGEgPSBwcm9tcHRNZXRhZGF0YVtpXTtcblx0XHRcdGlmICghbWV0YSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVyaSA9IGpvaW5QYXRoKGNoaWxkLnJlc291cmNlLCBTS0lMTF9GSUxFTkFNRSk7XG5cdFx0XHRjb25zdCBuYW1lID0gbWV0YS5uYW1lID8/IGNoaWxkLm5hbWU7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG1ldGEuZGVzY3JpcHRpb247XG5cdFx0XHRjb25zdCB1c2VySW52b2NhYmxlID0gbWV0YS51c2VySW52b2NhYmxlO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdG5hbWU6IG5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdGdyb3VwS2V5LFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IGlzQnVuZGxlSXRlbSA/IHVuZGVmaW5lZCA6IHBsdWdpblVyaSxcblx0XHRcdFx0cGx1Z2luTGFiZWw6IGlzQnVuZGxlSXRlbSA/IHVuZGVmaW5lZCA6IHBsdWdpbkxhYmVsLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlXG5cdFx0XHR9IHNhdGlzZmllcyBJQ3VzdG9taXphdGlvbkl0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgb25lIGl0ZW0gcGVyIG1hcmtkb3duIGZpbGUgZm9yIGFnZW50L3J1bGVzL2NvbW1hbmQgZm9sZGVycy5cblx0ICogQWdlbnRzIGFuZCBpbnN0cnVjdGlvbnMgcmVhZCBmcm9udG1hdHRlciBuYW1lL2Rlc2NyaXB0aW9uLCBhbmRcblx0ICogYWdlbnRzIGFkZGl0aW9uYWxseSBzdXJmYWNlIHVzZXJJbnZvY2FibGUuIEluc3RydWN0aW9uIChydWxlcylcblx0ICogZm9sZGVycyBhZGRpdGlvbmFsbHkgYWNjZXB0IGAubWRjYCBmaWxlcyBwZXIgdGhlIE9wZW4gUGx1Z2lucyBzcGVjLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0RnJvbVJlZ3VsYXJEaXIoZW50cmllczogcmVhZG9ubHkgeyBuYW1lOiBzdHJpbmc7IHJlc291cmNlOiBVUkk7IGlzRGlyZWN0b3J5OiBib29sZWFuIH1bXSwgcGx1Z2luVXJpOiBVUkksIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgZ3JvdXBLZXk6IHN0cmluZywgaXNCdW5kbGVJdGVtOiBib29sZWFuLCBwbHVnaW5MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdFx0dHlwZSBFbnRyeSA9IHsgbmFtZTogc3RyaW5nOyByZXNvdXJjZTogVVJJOyBpc0RpcmVjdG9yeTogYm9vbGVhbiB9O1xuXHRcdGNvbnN0IGVsaWdpYmxlOiBFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoY2hpbGQubmFtZS5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleHQgPSBleHRuYW1lKGNoaWxkLm5hbWUpO1xuXHRcdFx0aWYgKGV4dCAhPT0gJy5tZCcgJiYgIShwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgJiYgZXh0ID09PSAnLm1kYycpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZWxpZ2libGUucHVzaChjaGlsZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VNZXRhZGF0YSA9IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50IHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucztcblx0XHRjb25zdCBwcm9tcHRNZXRhZGF0YSA9IHBhcnNlTWV0YWRhdGEgPyBhd2FpdCBQcm9taXNlLmFsbChlbGlnaWJsZS5tYXAoY2hpbGQgPT4gdGhpcy5yZWFkUHJvbXB0TWV0YWRhdGEoY2hpbGQucmVzb3VyY2UsIHRva2VuKSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IElDdXN0b21pemF0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbGlnaWJsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBlbGlnaWJsZVtpXTtcblx0XHRcdGNvbnN0IG1ldGEgPSBwcm9tcHRNZXRhZGF0YT8uW2ldO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdHVyaTogY2hpbGQucmVzb3VyY2UsXG5cdFx0XHRcdHR5cGU6IHByb21wdFR5cGUsXG5cdFx0XHRcdG5hbWU6IG1ldGE/Lm5hbWUgPz8gc3RyaXBQcm9tcHRGaWxlRXh0ZW5zaW9ucyhjaGlsZC5uYW1lKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG1ldGE/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdGdyb3VwS2V5LFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IGlzQnVuZGxlSXRlbSA/IHVuZGVmaW5lZCA6IHBsdWdpblVyaSxcblx0XHRcdFx0cGx1Z2luTGFiZWw6IGlzQnVuZGxlSXRlbSA/IHVuZGVmaW5lZCA6IHBsdWdpbkxhYmVsLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCA/IG1ldGE/LnVzZXJJbnZvY2FibGUgOiB1bmRlZmluZWQsXG5cdFx0XHR9IHNhdGlzZmllcyBJQ3VzdG9taXphdGlvbkl0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYSBwcm9tcHQgbWFya2Rvd24gZmlsZSBhbmQgcmV0dXJucyBzZWxlY3RlZCBmcm9udG1hdHRlclxuXHQgKiBtZXRhZGF0YS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBmaWxlIGlzIG5vdCBtYXJrZG93biwgb3Jcblx0ICogd2hlbiBpdCBjYW5ub3QgYmUgcmVhZC9wYXJzZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlYWRQcm9tcHRNZXRhZGF0YShwcm9tcHRGaWxlVXJpOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHVzZXJJbnZvY2FibGU6IGJvb2xlYW4gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChleHRuYW1lKHByb21wdEZpbGVVcmkucGF0aCkgIT09ICcubWQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUocHJvbXB0RmlsZVVyaSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZyb250bWF0dGVyID0gcGFyc2VGcm9udE1hdHRlcihjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGZyb250bWF0dGVyKSB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBmcm9udG1hdHRlci5nZXRTdHJpbmdWYWx1ZSgnbmFtZScpO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGZyb250bWF0dGVyLmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRjb25zdCB1c2VySW52b2NhYmxlU3RyID0gZnJvbnRtYXR0ZXIuZ2V0U3RyaW5nVmFsdWUoJ3VzZXItaW52b2NhYmxlJyk7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSB1c2VySW52b2NhYmxlU3RyID09PSAndHJ1ZScgPyB0cnVlIDogdXNlckludm9jYWJsZVN0ciA9PT0gJ2ZhbHNlJyA/IGZhbHNlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4geyBuYW1lLCBkZXNjcmlwdGlvbiwgdXNlckludm9jYWJsZSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgbmFtZTogdW5kZWZpbmVkLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB1bmRlZmluZWQgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcl0gRmFpbGVkIHRvIHJlYWQgcHJvbXB0IG1ldGFkYXRhICR7cHJvbXB0RmlsZVVyaS50b1N0cmluZygpfTogJHtlcnJ9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFN0cmlwcyBjb252ZW50aW9uYWwgcHJvbXB0IGZpbGUgZXh0ZW5zaW9ucyBzbyB3ZSBjYW4gc2hvdyBgZm9vYFxuICogZm9yIGBmb28ucHJvbXB0Lm1kYCwgYGZvby5pbnN0cnVjdGlvbnMubWRgLCBldGMuXG4gKi9cbmZ1bmN0aW9uIHN0cmlwUHJvbXB0RmlsZUV4dGVuc2lvbnMoZmlsZW5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGV4dCA9IGV4dG5hbWUoZmlsZW5hbWUpO1xuXHRpZiAoIWV4dCkge1xuXHRcdHJldHVybiBmaWxlbmFtZTtcblx0fVxuXHRjb25zdCBzdGVtID0gZmlsZW5hbWUuc2xpY2UoMCwgLWV4dC5sZW5ndGgpO1xuXHRjb25zdCBkb3RJblN0ZW0gPSBzdGVtLmxhc3RJbmRleE9mKCcuJyk7XG5cdHJldHVybiBkb3RJblN0ZW0gPiAwID8gc3RlbS5zbGljZSgwLCBkb3RJblN0ZW0pIDogc3RlbTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFLakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFNckIsTUFBTSxrQ0FBa0M7QUFBQSxFQUU5QyxZQUNrQixhQUNBLFlBQ2hCO0FBRmdCO0FBQ0E7QUFBQSxFQUVsQjtBQUFBLEVBRUEsTUFBTSxxQkFBcUIsV0FBZ0IsVUFBa0IsY0FBdUIsUUFBK0IsYUFBaUMsT0FBa0U7QUFHck4sVUFBTSxTQUFTO0FBQ2YsVUFBTSxXQUFpQyxDQUFDO0FBQ3hDLFFBQUk7QUFDSCxVQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksa0JBQWtCLE1BQU0sR0FBRztBQUN0RCxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxl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
