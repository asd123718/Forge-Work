import "../widget/chatContentParts/media/chatInlineAnchorWidget.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { dirname } from "../../../../../base/common/resources.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { localize } from "../../../../../nls.js";
import { FileKind } from "../../../../../platform/files/common/files.js";
import { InlineAnchorWidget } from "../widget/chatContentParts/chatInlineAnchorWidget.js";
import { setupCollapsibleToggle } from "./chatDebugCollapsible.js";
const $ = DOM.$;
function getSettingsKeyForDiscoveryType(discoveryType) {
  switch (discoveryType) {
    case "prompt":
      return "chat.promptFilesLocations";
    case "instructions":
      return "chat.instructionsFilesLocations";
    case "agent":
      return "chat.agentFilesLocations";
    case "skill":
      return "chat.agentSkillsLocations";
    case "hook":
      return "chat.hookFilesLocations";
    default:
      return void 0;
  }
}
function getFileLocationLabel(file, labelService, discoveryType) {
  if (file.extensionId) {
    return file.extensionId;
  }
  const parentDir = discoveryType === "skill" ? dirname(dirname(file.uri)) : dirname(file.uri);
  return labelService.getUriLabel(parentDir, { relative: true });
}
function createInlineFileLink(uri, displayText, fileKind, openerService, modelService, languageService, hoverService, labelService, disposables, hoverSuffix) {
  const link = $(`a.${InlineAnchorWidget.className}.show-file-icons`);
  link.tabIndex = -1;
  const iconEl = DOM.append(link, $("span.icon"));
  const iconClasses = getIconClasses(modelService, languageService, uri, fileKind);
  iconEl.classList.add(...iconClasses);
  DOM.append(link, $("span.icon-label", void 0, displayText));
  const relativeLabel = labelService.getUriLabel(uri, { relative: true });
  const hoverText = hoverSuffix ? `${relativeLabel} ${hoverSuffix}` : relativeLabel;
  disposables.add(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), link, hoverText));
  disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, (e) => {
    e.preventDefault();
    e.stopPropagation();
    openerService.open(uri, { editorOptions: { preserveFocus: true } });
  }));
  return link;
}
function setupFileListNavigation(listEl, rows, disposables) {
  if (rows.length === 0) {
    return;
  }
  for (let i = 0; i < rows.length; i++) {
    rows[i].element.tabIndex = i === 0 ? 0 : -1;
    rows[i].element.setAttribute("role", "listitem");
  }
  disposables.add(DOM.addDisposableListener(listEl, DOM.EventType.KEY_DOWN, (e) => {
    const target = e.target;
    const index = rows.findIndex((r) => r.element === target);
    if (index === -1) {
      return;
    }
    let nextIndex;
    switch (e.key) {
      case "ArrowDown":
        nextIndex = Math.min(index + 1, rows.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(index - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = rows.length - 1;
        break;
      case "Enter": {
        rows[index].activate();
        e.preventDefault();
        return;
      }
    }
    if (nextIndex !== void 0 && nextIndex !== index) {
      e.preventDefault();
      rows[index].element.tabIndex = -1;
      rows[nextIndex].element.tabIndex = 0;
      rows[nextIndex].element.focus();
    }
  }));
}
function renderCustomizationDiscoveryContent(content, openerService, modelService, languageService, hoverService, labelService, scrollable) {
  const disposables = new DisposableStore();
  const container = $("div.chat-debug-file-list");
  container.tabIndex = 0;
  const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
  DOM.append(container, $("div.chat-debug-file-list-title", void 0, localize("chatDebug.discoveryResults", "{0} Discovery Results", capitalizedType)));
  DOM.append(container, $("div.chat-debug-file-list-summary", void 0, localize("chatDebug.totalFiles", "Total files: {0}", content.files.length)));
  const loaded = content.files.filter((f) => f.status === "loaded");
  if (loaded.length > 0) {
    const section = DOM.append(container, $("div.chat-debug-file-list-section"));
    DOM.append(section, $(
      "div.chat-debug-file-list-section-title",
      void 0,
      localize("chatDebug.loadedFiles", "Loaded ({0})", loaded.length)
    ));
    const groups = /* @__PURE__ */ new Map();
    for (const file of loaded) {
      const key = getFileLocationLabel(file, labelService, content.discoveryType);
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(file);
    }
    const listEl = DOM.append(section, $("div.chat-debug-file-list-rows"));
    listEl.setAttribute("role", "list");
    listEl.setAttribute("aria-label", localize("chatDebug.loadedFilesList", "Loaded files"));
    const rows = [];
    for (const [locationLabel, files] of groups) {
      const groupHeader = DOM.append(listEl, $("div.chat-debug-file-list-group-header"));
      const firstFile = files[0];
      if (firstFile.extensionId) {
        const link = DOM.append(groupHeader, $("a.chat-debug-file-list-group-label.chat-debug-file-list-badge-link"));
        link.textContent = locationLabel;
        link.tabIndex = -1;
        disposables.add(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), link, localize("chatDebug.openExtension", "Open {0} in Extensions", firstFile.extensionId)));
        disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, (e) => {
          e.preventDefault();
          e.stopPropagation();
          openerService.open(URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([firstFile.extensionId]))}`), { allowCommands: true });
        }));
      } else {
        DOM.append(groupHeader, $("span.chat-debug-file-list-group-label", void 0, locationLabel));
      }
      for (const file of files) {
        const row = DOM.append(listEl, $("div.chat-debug-file-list-row"));
        DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.check)}`));
        row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables));
        const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
        row.setAttribute("aria-label", relativeLabel);
        const uri = file.uri;
        rows.push({ element: row, activate: () => openerService.open(uri, { editorOptions: { preserveFocus: true } }) });
      }
    }
    setupFileListNavigation(listEl, rows, disposables);
  }
  const skipped = content.files.filter((f) => f.status === "skipped");
  if (skipped.length > 0) {
    const section = DOM.append(container, $("div.chat-debug-file-list-section"));
    DOM.append(section, $(
      "div.chat-debug-file-list-section-title",
      void 0,
      localize("chatDebug.skippedFiles", "Skipped ({0})", skipped.length)
    ));
    const groups = /* @__PURE__ */ new Map();
    for (const file of skipped) {
      const key = file.skipReason ?? localize("chatDebug.unknown", "unknown");
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(file);
    }
    const listEl = DOM.append(section, $("div.chat-debug-file-list-rows"));
    listEl.setAttribute("role", "list");
    listEl.setAttribute("aria-label", localize("chatDebug.skippedFilesList", "Skipped files"));
    const rows = [];
    for (const [reasonLabel, files] of groups) {
      const groupHeader = DOM.append(listEl, $("div.chat-debug-file-list-group-header"));
      DOM.append(groupHeader, $("span.chat-debug-file-list-group-label", void 0, reasonLabel));
      for (const file of files) {
        const row = DOM.append(listEl, $("div.chat-debug-file-list-row"));
        DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.close)}`));
        let detail = "";
        if (file.errorMessage) {
          detail += file.errorMessage;
        }
        if (file.duplicateOf) {
          if (detail) {
            detail += ", ";
          }
          detail += localize("chatDebug.duplicateOf", "duplicate of {0}", file.duplicateOf.path);
        }
        row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables));
        if (detail) {
          DOM.append(row, $("span.chat-debug-file-list-detail", void 0, ` (${detail})`));
        }
        const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
        row.setAttribute("aria-label", relativeLabel);
        const uri = file.uri;
        rows.push({ element: row, activate: () => openerService.open(uri, { editorOptions: { preserveFocus: true } }) });
      }
    }
    setupFileListNavigation(listEl, rows, disposables);
  }
  if (content.sourceFolders && content.sourceFolders.length > 0) {
    const sectionEl = DOM.append(container, $("div.chat-debug-message-section"));
    const header = DOM.append(sectionEl, $("div.chat-debug-message-section-header"));
    const chevron = DOM.append(header, $("span.chat-debug-message-section-chevron"));
    DOM.append(header, $(
      "span.chat-debug-message-section-title",
      void 0,
      localize("chatDebug.sourceFolders", "Sources ({0})", content.sourceFolders.length)
    ));
    const settingsKey = getSettingsKeyForDiscoveryType(content.discoveryType);
    if (settingsKey) {
      const gearBtn = disposables.add(new Button(header, {
        title: localize("chatDebug.openSettingsTooltip", "Configure locations"),
        ariaLabel: localize("chatDebug.configureLocations", "Configure locations"),
        hoverDelegate: getDefaultHoverDelegate("mouse")
      }));
      gearBtn.icon = Codicon.settingsGear;
      gearBtn.element.classList.add("chat-debug-settings-gear");
      disposables.add(DOM.addDisposableListener(gearBtn.element, DOM.EventType.MOUSE_ENTER, () => {
        header.classList.add("chat-debug-settings-gear-header-passthrough");
      }));
      disposables.add(DOM.addDisposableListener(gearBtn.element, DOM.EventType.MOUSE_LEAVE, () => {
        header.classList.remove("chat-debug-settings-gear-header-passthrough");
      }));
      disposables.add(gearBtn.onDidClick((e) => {
        if (e) {
          DOM.EventHelper.stop(e, true);
        }
        openerService.open(URI.parse(`command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify([`@id:${settingsKey}`]))}`), { allowCommands: true });
      }));
    }
    const contentEl = DOM.append(sectionEl, $("div.chat-debug-source-folder-content"));
    contentEl.tabIndex = 0;
    contentEl.setAttribute("role", "region");
    contentEl.setAttribute("aria-label", localize("chatDebug.sourceFoldersContent", "Source folders"));
    const capitalizedType2 = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
    const sourcesCaption = capitalizedType2.endsWith("s") ? capitalizedType2 : capitalizedType2 + "s";
    DOM.append(contentEl, $(
      "div.chat-debug-source-folder-note",
      void 0,
      localize("chatDebug.sourcesNote", "{0} were discovered by checking the following sources in order:", sourcesCaption)
    ));
    for (let i = 0; i < content.sourceFolders.length; i++) {
      const folder = content.sourceFolders[i];
      const row = DOM.append(contentEl, $("div.chat-debug-source-folder-row"));
      DOM.append(row, $("span.chat-debug-source-folder-index", void 0, `${i + 1}.`));
      DOM.append(row, $("span.chat-debug-source-folder-label", void 0, folder.uri.path));
    }
    setupCollapsibleToggle(
      chevron,
      header,
      contentEl,
      disposables,
      /* initiallyCollapsed */
      true,
      scrollable
    );
  }
  return { element: container, disposables };
}
function fileListToPlainText(content) {
  const lines = [];
  const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
  lines.push(localize("chatDebug.plainText.discoveryResults", "{0} Discovery Results", capitalizedType));
  lines.push(localize("chatDebug.plainText.totalFiles", "Total files: {0}", content.files.length));
  lines.push("");
  const loaded = content.files.filter((f) => f.status === "loaded");
  const skipped = content.files.filter((f) => f.status === "skipped");
  if (loaded.length > 0) {
    lines.push(localize("chatDebug.plainText.loaded", "Loaded ({0})", loaded.length));
    const groups = /* @__PURE__ */ new Map();
    for (const f of loaded) {
      const parentDir = content.discoveryType === "skill" ? dirname(dirname(f.uri)) : dirname(f.uri);
      const key = f.extensionId ?? parentDir.path;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(f);
    }
    for (const [locationLabel, files] of groups) {
      lines.push(`  ${locationLabel}`);
      for (const f of files) {
        const label = f.name ?? f.uri.path;
        lines.push(`    \u2713 ${label}`);
      }
    }
    lines.push("");
  }
  if (skipped.length > 0) {
    lines.push(localize("chatDebug.plainText.skipped", "Skipped ({0})", skipped.length));
    const skippedGroups = /* @__PURE__ */ new Map();
    for (const f of skipped) {
      const key = f.skipReason ?? localize("chatDebug.plainText.unknown", "unknown");
      let group = skippedGroups.get(key);
      if (!group) {
        group = [];
        skippedGroups.set(key, group);
      }
      group.push(f);
    }
    for (const [reasonLabel, files] of skippedGroups) {
      lines.push(`  ${reasonLabel}`);
      for (const f of files) {
        const label = f.name ?? f.uri.path;
        let detail = `    \u2717 ${label}`;
        if (f.errorMessage || f.duplicateOf) {
          const parts = [];
          if (f.errorMessage) {
            parts.push(f.errorMessage);
          }
          if (f.duplicateOf) {
            parts.push(localize("chatDebug.plainText.duplicateOf", "duplicate of {0}", f.duplicateOf.path));
          }
          detail += ` (${parts.join(", ")})`;
        }
        lines.push(detail);
      }
    }
  }
  if (content.sourceFolders && content.sourceFolders.length > 0) {
    lines.push("");
    lines.push(localize("chatDebug.plainText.sourceFolders", "Sources ({0})", content.sourceFolders.length));
    for (const folder of content.sourceFolders) {
      lines.push(`  ${folder.uri.path}`);
    }
  }
  return lines.join("\n");
}
function getCategorySectionTitle(category, count) {
  switch (category) {
    case "applying":
      return localize("chatDebug.customization.instructions", "Instructions ({0})", count);
    case "referenced":
      return localize("chatDebug.customization.referenced", "Referenced ({0})", count);
    case "skill":
      return localize("chatDebug.customization.skill", "Skills ({0})", count);
    case "custom-agent":
      return localize("chatDebug.customization.customAgent", "Agents ({0})", count);
    case "hook":
      return localize("chatDebug.customization.hook", "Hooks ({0})", count);
    case "skipped":
      return localize("chatDebug.customization.skipped", "Skipped ({0})", count);
  }
}
function renderCustomizationSummaryContent(content, openerService, modelService, languageService, hoverService, labelService, scrollable) {
  const disposables = new DisposableStore();
  const container = $("div.chat-debug-customization-summary");
  container.tabIndex = 0;
  const mainSection = DOM.append(container, $("div.chat-debug-file-list"));
  DOM.append(mainSection, $(
    "div.chat-debug-file-list-title",
    void 0,
    localize("chatDebug.customizationTitle", "Customization Resolution Results")
  ));
  DOM.append(mainSection, $(
    "div.chat-debug-file-list-summary",
    void 0,
    localize(
      "chatDebug.customizationSummary",
      "{0} instructions, {1} skills, {2} agents, {3} hooks, {4} skipped in {5}ms",
      content.counts.instructions,
      content.counts.skills,
      content.counts.agents,
      content.counts.hooks,
      content.counts.skipped,
      content.durationInMillis.toFixed(1)
    )
  ));
  const instructionEntries = content.resolutionLogs.filter((e) => e.category === "applying" || e.category === "referenced");
  const skillEntries = content.resolutionLogs.filter((e) => e.category === "skill");
  const agentEntries = content.resolutionLogs.filter((e) => e.category === "custom-agent");
  const hookEntries = content.resolutionLogs.filter((e) => e.category === "hook");
  const skippedEntries = content.resolutionLogs.filter((e) => e.category === "skipped");
  const sections = [
    { title: getCategorySectionTitle("applying", instructionEntries.length), icon: Codicon.book, entries: instructionEntries },
    { title: getCategorySectionTitle("skill", skillEntries.length), icon: Codicon.lightbulb, entries: skillEntries },
    { title: getCategorySectionTitle("custom-agent", agentEntries.length), icon: Codicon.agent, entries: agentEntries },
    { title: getCategorySectionTitle("hook", hookEntries.length), icon: Codicon.zap, entries: hookEntries },
    { title: getCategorySectionTitle("skipped", skippedEntries.length), icon: Codicon.close, entries: skippedEntries }
  ];
  for (const { title, icon, entries } of sections) {
    if (entries.length === 0) {
      continue;
    }
    const section = DOM.append(mainSection, $("div.chat-debug-file-list-section"));
    DOM.append(section, $("div.chat-debug-file-list-section-title", void 0, title));
    const listEl = DOM.append(section, $("div.chat-debug-file-list-rows"));
    listEl.setAttribute("role", "list");
    listEl.setAttribute("aria-label", title);
    const rows = [];
    const isHookSection = entries.length > 0 && entries[0].category === "hook";
    if (isHookSection) {
      const groupedByType = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        const hookType = entry.reason ?? "";
        let group = groupedByType.get(hookType);
        if (!group) {
          group = [];
          groupedByType.set(hookType, group);
        }
        group.push(entry);
      }
      for (const [hookType, groupEntries] of groupedByType) {
        if (hookType) {
          DOM.append(listEl, $("div.chat-debug-file-list-group-header", void 0, hookType));
        }
        for (const entry of groupEntries) {
          const row = DOM.append(listEl, $("div.chat-debug-file-list-row"));
          DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(icon)}`));
          if (entry.uri) {
            row.appendChild(createInlineFileLink(
              entry.uri,
              entry.name,
              FileKind.FILE,
              openerService,
              modelService,
              languageService,
              hoverService,
              labelService,
              disposables
            ));
            const uri = entry.uri;
            rows.push({ element: row, activate: () => openerService.open(uri, { editorOptions: { preserveFocus: true } }) });
          } else {
            DOM.append(row, $("span", void 0, entry.name));
          }
          row.setAttribute("aria-label", entry.reason ? `${entry.name} \u2014 ${entry.reason}` : entry.name);
        }
      }
    } else {
      for (const entry of entries) {
        const row = DOM.append(listEl, $("div.chat-debug-file-list-row"));
        DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(icon)}`));
        const showReason = entry.category !== "skill" && entry.category !== "custom-agent";
        if (entry.uri) {
          row.appendChild(createInlineFileLink(
            entry.uri,
            entry.name,
            FileKind.FILE,
            openerService,
            modelService,
            languageService,
            hoverService,
            labelService,
            disposables,
            showReason ? entry.reason : void 0
          ));
          const uri = entry.uri;
          rows.push({ element: row, activate: () => openerService.open(uri, { editorOptions: { preserveFocus: true } }) });
        } else {
          DOM.append(row, $("span", void 0, entry.name));
        }
        if (showReason && entry.reason) {
          DOM.append(row, $("span.chat-debug-file-list-detail", void 0, ` \u2014 ${entry.reason}`));
        }
        row.setAttribute("aria-label", entry.reason ? `${entry.name} \u2014 ${entry.reason}` : entry.name);
      }
    }
    setupFileListNavigation(listEl, rows, disposables);
  }
  if (content.resolutionLogs.length === 0) {
    DOM.append(mainSection, $(
      "div.chat-debug-file-list-summary",
      void 0,
      localize("chatDebug.noResolutionLogs", "No resolution logs")
    ));
  }
  return { element: container, disposables };
}
function customizationSummaryToPlainText(content) {
  const lines = [];
  lines.push(localize("chatDebug.plainText.customizationTitle", "Customization Resolution Results"));
  lines.push(localize(
    "chatDebug.plainText.customizationSummary",
    "{0} instructions, {1} skills, {2} agents, {3} hooks, {4} skipped in {5}ms",
    content.counts.instructions,
    content.counts.skills,
    content.counts.agents,
    content.counts.hooks,
    content.counts.skipped,
    content.durationInMillis.toFixed(1)
  ));
  lines.push("");
  for (const entry of content.resolutionLogs) {
    const detail = entry.reason ? `${entry.name} \u2014 ${entry.reason}` : entry.name;
    lines.push(`  [${entry.category}] ${detail}`);
  }
  return lines.join("\n");
}
export {
  customizationSummaryToPlainText,
  fileListToPlainText,
  renderCustomizationDiscoveryContent,
  renderCustomizationSummaryContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnlSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvbWVkaWEvY2hhdElubGluZUFuY2hvcldpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeSwgSUNoYXREZWJ1Z0V2ZW50Q3VzdG9taXphdGlvblN1bW1hcnlDb250ZW50LCBJQ2hhdERlYnVnRXZlbnRGaWxlTGlzdENvbnRlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVBbmNob3JXaWRnZXQgfSBmcm9tICcuLi93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IHNldHVwQ29sbGFwc2libGVUb2dnbGUgfSBmcm9tICcuL2NoYXREZWJ1Z0NvbGxhcHNpYmxlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG4vKipcbiAqIE1hcCBhIGRpc2NvdmVyeSB0eXBlIHN0cmluZyB0byBpdHMgY29ycmVzcG9uZGluZyBzZXR0aW5ncyBrZXkuXG4gKi9cbmZ1bmN0aW9uIGdldFNldHRpbmdzS2V5Rm9yRGlzY292ZXJ5VHlwZShkaXNjb3ZlcnlUeXBlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGRpc2NvdmVyeVR5cGUpIHtcblx0XHRjYXNlICdwcm9tcHQnOiByZXR1cm4gJ2NoYXQucHJvbXB0RmlsZXNMb2NhdGlvbnMnO1xuXHRcdGNhc2UgJ2luc3RydWN0aW9ucyc6IHJldHVybiAnY2hhdC5pbnN0cnVjdGlvbnNGaWxlc0xvY2F0aW9ucyc7XG5cdFx0Y2FzZSAnYWdlbnQnOiByZXR1cm4gJ2NoYXQuYWdlbnRGaWxlc0xvY2F0aW9ucyc7XG5cdFx0Y2FzZSAnc2tpbGwnOiByZXR1cm4gJ2NoYXQuYWdlbnRTa2lsbHNMb2NhdGlvbnMnO1xuXHRcdGNhc2UgJ2hvb2snOiByZXR1cm4gJ2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zJztcblx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogR2V0IGEgZGlzcGxheSBsYWJlbCBmb3IgYSBmaWxlJ3MgbG9jYXRpb24uXG4gKiBFeHRlbnNpb24gZmlsZXMgc2hvdyB0aGUgZXh0ZW5zaW9uIElELFxuICogYWxsIG90aGVyIGZpbGVzIHNob3cgdGhlIHJlbGF0aXZlIChvciB0aWxkaWZpZWQpIHBhcmVudCBmb2xkZXIgcGF0aC5cbiAqL1xuZnVuY3Rpb24gZ2V0RmlsZUxvY2F0aW9uTGFiZWwoZmlsZTogeyB1cmk6IFVSSTsgc3RvcmFnZT86IHN0cmluZzsgZXh0ZW5zaW9uSWQ/OiBzdHJpbmcgfSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBkaXNjb3ZlcnlUeXBlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGZpbGUuZXh0ZW5zaW9uSWQpIHtcblx0XHRyZXR1cm4gZmlsZS5leHRlbnNpb25JZDtcblx0fVxuXHQvLyBTa2lsbHMgbGl2ZSBpbnNpZGUgaW5kaXZpZHVhbCBza2lsbCBmb2xkZXJzIChlLmcuIC5naXRodWIvc2tpbGxzL2Zvby9TS0lMTC5tZCksXG5cdC8vIHNvIGdyb3VwIGJ5IHRoZSBwYXJlbnQgb2YgdGhlIHNraWxsIGZvbGRlciBmb3IgYSBtb3JlIHVzZWZ1bCBsYWJlbC5cblx0Y29uc3QgcGFyZW50RGlyID0gZGlzY292ZXJ5VHlwZSA9PT0gJ3NraWxsJyA/IGRpcm5hbWUoZGlybmFtZShmaWxlLnVyaSkpIDogZGlybmFtZShmaWxlLnVyaSk7XG5cdHJldHVybiBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocGFyZW50RGlyLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGZpbGUgbGluayBlbGVtZW50IHN0eWxlZCBsaWtlIHRoZSBjaGF0IHBhbmVsJ3MgSW5saW5lQW5jaG9yV2lkZ2V0LlxuICovXG5mdW5jdGlvbiBjcmVhdGVJbmxpbmVGaWxlTGluayh1cmk6IFVSSSwgZGlzcGxheVRleHQ6IHN0cmluZywgZmlsZUtpbmQ6IEZpbGVLaW5kLCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBob3ZlclN1ZmZpeD86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgbGluayA9ICQoYGEuJHtJbmxpbmVBbmNob3JXaWRnZXQuY2xhc3NOYW1lfS5zaG93LWZpbGUtaWNvbnNgKTtcblx0bGluay50YWJJbmRleCA9IC0xO1xuXG5cdGNvbnN0IGljb25FbCA9IERPTS5hcHBlbmQobGluaywgJCgnc3Bhbi5pY29uJykpO1xuXHRjb25zdCBpY29uQ2xhc3NlcyA9IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCB1cmksIGZpbGVLaW5kKTtcblx0aWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzZXMpO1xuXG5cdERPTS5hcHBlbmQobGluaywgJCgnc3Bhbi5pY29uLWxhYmVsJywgdW5kZWZpbmVkLCBkaXNwbGF5VGV4dCkpO1xuXG5cdGNvbnN0IHJlbGF0aXZlTGFiZWwgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRjb25zdCBob3ZlclRleHQgPSBob3ZlclN1ZmZpeCA/IGAke3JlbGF0aXZlTGFiZWx9ICR7aG92ZXJTdWZmaXh9YCA6IHJlbGF0aXZlTGFiZWw7XG5cdGRpc3Bvc2FibGVzLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgbGluaywgaG92ZXJUZXh0KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIERPTS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0b3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBlZGl0b3JPcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KTtcblx0fSkpO1xuXG5cdHJldHVybiBsaW5rO1xufVxuXG4vKipcbiAqIFNldCB1cCByb3ZpbmcgdGFiaW5kZXggd2l0aCBhcnJvdy1rZXkgbmF2aWdhdGlvbiBvbiBhIGxpc3Qgb2Ygcm93cy5cbiAqIFRoZSBmaXJzdCByb3cgc3RhcnRzIHdpdGggdGFiSW5kZXggMDsgdGhlIHJlc3QgZ2V0IC0xLlxuICogVXAvRG93biBhcnJvdyBrZXlzIG1vdmUgZm9jdXMsIEhvbWUvRW5kIGp1bXAgdG8gZmlyc3QvbGFzdC5cbiAqIEVudGVyIG9uIGEgZm9jdXNlZCByb3cgYWN0aXZhdGVzIHRoZSBhc3NvY2lhdGVkIGFjdGlvbi5cbiAqL1xuZnVuY3Rpb24gc2V0dXBGaWxlTGlzdE5hdmlnYXRpb24obGlzdEVsOiBIVE1MRWxlbWVudCwgcm93czogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgYWN0aXZhdGU6ICgpID0+IHZvaWQgfVtdLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdGlmIChyb3dzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuXHRcdHJvd3NbaV0uZWxlbWVudC50YWJJbmRleCA9IGkgPT09IDAgPyAwIDogLTE7XG5cdFx0cm93c1tpXS5lbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0aXRlbScpO1xuXHR9XG5cblx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobGlzdEVsLCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnN0IGluZGV4ID0gcm93cy5maW5kSW5kZXgociA9PiByLmVsZW1lbnQgPT09IHRhcmdldCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBuZXh0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKGUua2V5KSB7XG5cdFx0XHRjYXNlICdBcnJvd0Rvd24nOlxuXHRcdFx0XHRuZXh0SW5kZXggPSBNYXRoLm1pbihpbmRleCArIDEsIHJvd3MubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQXJyb3dVcCc6XG5cdFx0XHRcdG5leHRJbmRleCA9IE1hdGgubWF4KGluZGV4IC0gMSwgMCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnSG9tZSc6XG5cdFx0XHRcdG5leHRJbmRleCA9IDA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRW5kJzpcblx0XHRcdFx0bmV4dEluZGV4ID0gcm93cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0VudGVyJzoge1xuXHRcdFx0XHRyb3dzW2luZGV4XS5hY3RpdmF0ZSgpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmV4dEluZGV4ICE9PSB1bmRlZmluZWQgJiYgbmV4dEluZGV4ICE9PSBpbmRleCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0cm93c1tpbmRleF0uZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdFx0cm93c1tuZXh0SW5kZXhdLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0cm93c1tuZXh0SW5kZXhdLmVsZW1lbnQuZm9jdXMoKTtcblx0XHR9XG5cdH0pKTtcbn1cblxuLyoqXG4gKiBSZW5kZXIgYSBmaWxlIGxpc3QgcmVzb2x2ZWQgY29udGVudCBhcyBhIHJpY2ggSFRNTCBlbGVtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQ3VzdG9taXphdGlvbkRpc2NvdmVyeUNvbnRlbnQoY29udGVudDogSUNoYXREZWJ1Z0V2ZW50RmlsZUxpc3RDb250ZW50LCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBzY3JvbGxhYmxlPzogeyBzY2FuRG9tTm9kZSgpOiB2b2lkIH0pOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH0ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0Jyk7XG5cdGNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0Y29uc3QgY2FwaXRhbGl6ZWRUeXBlID0gY29udGVudC5kaXNjb3ZlcnlUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgY29udGVudC5kaXNjb3ZlcnlUeXBlLnNsaWNlKDEpO1xuXHRET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmRpc2NvdmVyeVJlc3VsdHMnLCBcInswfSBEaXNjb3ZlcnkgUmVzdWx0c1wiLCBjYXBpdGFsaXplZFR5cGUpKSk7XG5cdERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtc3VtbWFyeScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy50b3RhbEZpbGVzJywgXCJUb3RhbCBmaWxlczogezB9XCIsIGNvbnRlbnQuZmlsZXMubGVuZ3RoKSkpO1xuXG5cdC8vIExvYWRlZCBmaWxlcyAtIGdyb3VwZWQgYnkgc291cmNlIGxvY2F0aW9uXG5cdGNvbnN0IGxvYWRlZCA9IGNvbnRlbnQuZmlsZXMuZmlsdGVyKGYgPT4gZi5zdGF0dXMgPT09ICdsb2FkZWQnKTtcblx0aWYgKGxvYWRlZC5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtc2VjdGlvbicpKTtcblx0XHRET00uYXBwZW5kKHNlY3Rpb24sICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1zZWN0aW9uLXRpdGxlJywgdW5kZWZpbmVkLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5sb2FkZWRGaWxlcycsIFwiTG9hZGVkICh7MH0pXCIsIGxvYWRlZC5sZW5ndGgpKSk7XG5cblx0XHQvLyBHcm91cCBmaWxlcyBieSBsb2NhdGlvbiBsYWJlbCAoZXh0ZW5zaW9uIElEIG9yIGZvbGRlciBwYXRoKVxuXHRcdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB0eXBlb2YgbG9hZGVkPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBsb2FkZWQpIHtcblx0XHRcdGNvbnN0IGtleSA9IGdldEZpbGVMb2NhdGlvbkxhYmVsKGZpbGUsIGxhYmVsU2VydmljZSwgY29udGVudC5kaXNjb3ZlcnlUeXBlKTtcblx0XHRcdGxldCBncm91cCA9IGdyb3Vwcy5nZXQoa2V5KTtcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Z3JvdXAgPSBbXTtcblx0XHRcdFx0Z3JvdXBzLnNldChrZXksIGdyb3VwKTtcblx0XHRcdH1cblx0XHRcdGdyb3VwLnB1c2goZmlsZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdEVsID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtcm93cycpKTtcblx0XHRsaXN0RWwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3QnKTtcblx0XHRsaXN0RWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXREZWJ1Zy5sb2FkZWRGaWxlc0xpc3QnLCBcIkxvYWRlZCBmaWxlc1wiKSk7XG5cblx0XHRjb25zdCByb3dzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBhY3RpdmF0ZTogKCkgPT4gdm9pZCB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtsb2NhdGlvbkxhYmVsLCBmaWxlc10gb2YgZ3JvdXBzKSB7XG5cdFx0XHQvLyBHcm91cCBoZWFkZXIgLSBzaG93IHRoZSBzb3VyY2UgbG9jYXRpb25cblx0XHRcdGNvbnN0IGdyb3VwSGVhZGVyID0gRE9NLmFwcGVuZChsaXN0RWwsICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1ncm91cC1oZWFkZXInKSk7XG5cdFx0XHRjb25zdCBmaXJzdEZpbGUgPSBmaWxlc1swXTtcblx0XHRcdGlmIChmaXJzdEZpbGUuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0Y29uc3QgbGluayA9IERPTS5hcHBlbmQoZ3JvdXBIZWFkZXIsICQoJ2EuY2hhdC1kZWJ1Zy1maWxlLWxpc3QtZ3JvdXAtbGFiZWwuY2hhdC1kZWJ1Zy1maWxlLWxpc3QtYmFkZ2UtbGluaycpKTtcblx0XHRcdFx0bGluay50ZXh0Q29udGVudCA9IGxvY2F0aW9uTGFiZWw7XG5cdFx0XHRcdGxpbmsudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBsaW5rLCBsb2NhbGl6ZSgnY2hhdERlYnVnLm9wZW5FeHRlbnNpb24nLCBcIk9wZW4gezB9IGluIEV4dGVuc2lvbnNcIiwgZmlyc3RGaWxlLmV4dGVuc2lvbklkKSkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCBET00uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdG9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoYGNvbW1hbmQ6ZXh0ZW5zaW9uLm9wZW4/JHtlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoW2ZpcnN0RmlsZS5leHRlbnNpb25JZF0pKX1gKSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRET00uYXBwZW5kKGdyb3VwSGVhZGVyLCAkKCdzcGFuLmNoYXQtZGVidWctZmlsZS1saXN0LWdyb3VwLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhdGlvbkxhYmVsKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGxpc3RFbCwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXJvdycpKTtcblx0XHRcdFx0RE9NLmFwcGVuZChyb3csICQoYHNwYW4uY2hhdC1kZWJ1Zy1maWxlLWxpc3QtaWNvbiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jaGVjayl9YCkpO1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoY3JlYXRlSW5saW5lRmlsZUxpbmsoZmlsZS51cmksIGZpbGUubmFtZSA/PyBmaWxlLnVyaS5wYXRoLCBGaWxlS2luZC5GSUxFLCBvcGVuZXJTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGNvbnN0IHJlbGF0aXZlTGFiZWwgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZmlsZS51cmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByZWxhdGl2ZUxhYmVsKTtcblx0XHRcdFx0Y29uc3QgdXJpID0gZmlsZS51cmk7XG5cdFx0XHRcdHJvd3MucHVzaCh7IGVsZW1lbnQ6IHJvdywgYWN0aXZhdGU6ICgpID0+IG9wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgZWRpdG9yT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldHVwRmlsZUxpc3ROYXZpZ2F0aW9uKGxpc3RFbCwgcm93cywgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0Ly8gU2tpcHBlZCBmaWxlcyAtIGdyb3VwZWQgYnkgc2tpcCByZWFzb25cblx0Y29uc3Qgc2tpcHBlZCA9IGNvbnRlbnQuZmlsZXMuZmlsdGVyKGYgPT4gZi5zdGF0dXMgPT09ICdza2lwcGVkJyk7XG5cdGlmIChza2lwcGVkLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBzZWN0aW9uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1zZWN0aW9uJykpO1xuXHRcdERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXNlY3Rpb24tdGl0bGUnLCB1bmRlZmluZWQsXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLnNraXBwZWRGaWxlcycsIFwiU2tpcHBlZCAoezB9KVwiLCBza2lwcGVkLmxlbmd0aCkpKTtcblxuXHRcdC8vIEdyb3VwIGZpbGVzIGJ5IHNraXAgcmVhc29uXG5cdFx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHR5cGVvZiBza2lwcGVkPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBza2lwcGVkKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBmaWxlLnNraXBSZWFzb24gPz8gbG9jYWxpemUoJ2NoYXREZWJ1Zy51bmtub3duJywgXCJ1bmtub3duXCIpO1xuXHRcdFx0bGV0IGdyb3VwID0gZ3JvdXBzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRncm91cCA9IFtdO1xuXHRcdFx0XHRncm91cHMuc2V0KGtleSwgZ3JvdXApO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXAucHVzaChmaWxlKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaXN0RWwgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1yb3dzJykpO1xuXHRcdGxpc3RFbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdCcpO1xuXHRcdGxpc3RFbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdERlYnVnLnNraXBwZWRGaWxlc0xpc3QnLCBcIlNraXBwZWQgZmlsZXNcIikpO1xuXG5cdFx0Y29uc3Qgcm93czogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgYWN0aXZhdGU6ICgpID0+IHZvaWQgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbcmVhc29uTGFiZWwsIGZpbGVzXSBvZiBncm91cHMpIHtcblx0XHRcdC8vIEdyb3VwIGhlYWRlciAtIHNob3cgdGhlIHNraXAgcmVhc29uXG5cdFx0XHRjb25zdCBncm91cEhlYWRlciA9IERPTS5hcHBlbmQobGlzdEVsLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3QtZ3JvdXAtaGVhZGVyJykpO1xuXHRcdFx0RE9NLmFwcGVuZChncm91cEhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1ncm91cC1sYWJlbCcsIHVuZGVmaW5lZCwgcmVhc29uTGFiZWwpKTtcblxuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQobGlzdEVsLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtcm93JykpO1xuXHRcdFx0XHRET00uYXBwZW5kKHJvdywgJChgc3Bhbi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1pY29uJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNsb3NlKX1gKSk7XG5cblx0XHRcdFx0Ly8gQnVpbGQgcGVyLWZpbGUgZGV0YWlsIChlcnJvciBtZXNzYWdlIC8gZHVwbGljYXRlIGluZm8pXG5cdFx0XHRcdGxldCBkZXRhaWwgPSAnJztcblx0XHRcdFx0aWYgKGZpbGUuZXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRcdFx0ZGV0YWlsICs9IGZpbGUuZXJyb3JNZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWxlLmR1cGxpY2F0ZU9mKSB7XG5cdFx0XHRcdFx0aWYgKGRldGFpbCkge1xuXHRcdFx0XHRcdFx0ZGV0YWlsICs9ICcsICc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRldGFpbCArPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmR1cGxpY2F0ZU9mJywgXCJkdXBsaWNhdGUgb2YgezB9XCIsIGZpbGUuZHVwbGljYXRlT2YucGF0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoY3JlYXRlSW5saW5lRmlsZUxpbmsoZmlsZS51cmksIGZpbGUubmFtZSA/PyBmaWxlLnVyaS5wYXRoLCBGaWxlS2luZC5GSUxFLCBvcGVuZXJTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGlmIChkZXRhaWwpIHtcblx0XHRcdFx0XHRET00uYXBwZW5kKHJvdywgJCgnc3Bhbi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1kZXRhaWwnLCB1bmRlZmluZWQsIGAgKCR7ZGV0YWlsfSlgKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVsYXRpdmVMYWJlbCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaWxlLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHJlbGF0aXZlTGFiZWwpO1xuXHRcdFx0XHRjb25zdCB1cmkgPSBmaWxlLnVyaTtcblx0XHRcdFx0cm93cy5wdXNoKHsgZWxlbWVudDogcm93LCBhY3RpdmF0ZTogKCkgPT4gb3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBlZGl0b3JPcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0dXBGaWxlTGlzdE5hdmlnYXRpb24obGlzdEVsLCByb3dzLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHQvLyBTb3VyY2UgZm9sZGVycyAocGF0aHMgYXR0ZW1wdGVkKSAtIGNvbGxhcHNpYmxlLCBpbml0aWFsbHkgY29sbGFwc2VkXG5cdGlmIChjb250ZW50LnNvdXJjZUZvbGRlcnMgJiYgY29udGVudC5zb3VyY2VGb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBzZWN0aW9uRWwgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmNoYXQtZGVidWctbWVzc2FnZS1zZWN0aW9uJykpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZChzZWN0aW9uRWwsICQoJ2Rpdi5jaGF0LWRlYnVnLW1lc3NhZ2Utc2VjdGlvbi1oZWFkZXInKSk7XG5cblx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1tZXNzYWdlLXNlY3Rpb24tY2hldnJvbicpKTtcblx0XHRET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLW1lc3NhZ2Utc2VjdGlvbi10aXRsZScsIHVuZGVmaW5lZCxcblx0XHRcdGxvY2FsaXplKCdjaGF0RGVidWcuc291cmNlRm9sZGVycycsIFwiU291cmNlcyAoezB9KVwiLCBjb250ZW50LnNvdXJjZUZvbGRlcnMubGVuZ3RoKSkpO1xuXG5cdFx0Ly8gU2V0dGluZ3MgZ2VhciBidXR0b24gb24gdGhlIHJpZ2h0IHNpZGUgb2YgdGhlIGhlYWRlclxuXHRcdGNvbnN0IHNldHRpbmdzS2V5ID0gZ2V0U2V0dGluZ3NLZXlGb3JEaXNjb3ZlcnlUeXBlKGNvbnRlbnQuZGlzY292ZXJ5VHlwZSk7XG5cdFx0aWYgKHNldHRpbmdzS2V5KSB7XG5cdFx0XHRjb25zdCBnZWFyQnRuID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oaGVhZGVyLCB7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLm9wZW5TZXR0aW5nc1Rvb2x0aXAnLCBcIkNvbmZpZ3VyZSBsb2NhdGlvbnNcIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jb25maWd1cmVMb2NhdGlvbnMnLCBcIkNvbmZpZ3VyZSBsb2NhdGlvbnNcIiksXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGU6IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLFxuXHRcdFx0fSkpO1xuXHRcdFx0Z2VhckJ0bi5pY29uID0gQ29kaWNvbi5zZXR0aW5nc0dlYXI7XG5cdFx0XHRnZWFyQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1zZXR0aW5ncy1nZWFyJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZWFyQnRuLmVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRU5URVIsICgpID0+IHtcblx0XHRcdFx0aGVhZGVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctc2V0dGluZ3MtZ2Vhci1oZWFkZXItcGFzc3Rocm91Z2gnKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdlYXJCdG4uZWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0XHRoZWFkZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1kZWJ1Zy1zZXR0aW5ncy1nZWFyLWhlYWRlci1wYXNzdGhyb3VnaCcpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGdlYXJCdG4ub25EaWRDbGljaygoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoYGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JHtlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoW2BAaWQ6JHtzZXR0aW5nc0tleX1gXSkpfWApLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudEVsID0gRE9NLmFwcGVuZChzZWN0aW9uRWwsICQoJ2Rpdi5jaGF0LWRlYnVnLXNvdXJjZS1mb2xkZXItY29udGVudCcpKTtcblx0XHRjb250ZW50RWwudGFiSW5kZXggPSAwO1xuXHRcdGNvbnRlbnRFbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0Y29udGVudEVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0RGVidWcuc291cmNlRm9sZGVyc0NvbnRlbnQnLCBcIlNvdXJjZSBmb2xkZXJzXCIpKTtcblxuXHRcdGNvbnN0IGNhcGl0YWxpemVkVHlwZSA9IGNvbnRlbnQuZGlzY292ZXJ5VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNvbnRlbnQuZGlzY292ZXJ5VHlwZS5zbGljZSgxKTtcblx0XHRjb25zdCBzb3VyY2VzQ2FwdGlvbiA9IGNhcGl0YWxpemVkVHlwZS5lbmRzV2l0aCgncycpID8gY2FwaXRhbGl6ZWRUeXBlIDogY2FwaXRhbGl6ZWRUeXBlICsgJ3MnO1xuXHRcdERPTS5hcHBlbmQoY29udGVudEVsLCAkKCdkaXYuY2hhdC1kZWJ1Zy1zb3VyY2UtZm9sZGVyLW5vdGUnLCB1bmRlZmluZWQsXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLnNvdXJjZXNOb3RlJywgXCJ7MH0gd2VyZSBkaXNjb3ZlcmVkIGJ5IGNoZWNraW5nIHRoZSBmb2xsb3dpbmcgc291cmNlcyBpbiBvcmRlcjpcIiwgc291cmNlc0NhcHRpb24pKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb250ZW50LnNvdXJjZUZvbGRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGZvbGRlciA9IGNvbnRlbnQuc291cmNlRm9sZGVyc1tpXTtcblx0XHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQoY29udGVudEVsLCAkKCdkaXYuY2hhdC1kZWJ1Zy1zb3VyY2UtZm9sZGVyLXJvdycpKTtcblx0XHRcdERPTS5hcHBlbmQocm93LCAkKCdzcGFuLmNoYXQtZGVidWctc291cmNlLWZvbGRlci1pbmRleCcsIHVuZGVmaW5lZCwgYCR7aSArIDF9LmApKTtcblx0XHRcdERPTS5hcHBlbmQocm93LCAkKCdzcGFuLmNoYXQtZGVidWctc291cmNlLWZvbGRlci1sYWJlbCcsIHVuZGVmaW5lZCwgZm9sZGVyLnVyaS5wYXRoKSk7XG5cdFx0fVxuXG5cdFx0c2V0dXBDb2xsYXBzaWJsZVRvZ2dsZShjaGV2cm9uLCBoZWFkZXIsIGNvbnRlbnRFbCwgZGlzcG9zYWJsZXMsIC8qIGluaXRpYWxseUNvbGxhcHNlZCAqLyB0cnVlLCBzY3JvbGxhYmxlKTtcblx0fVxuXG5cdHJldHVybiB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgZGlzcG9zYWJsZXMgfTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IGEgZmlsZSBsaXN0IGNvbnRlbnQgdG8gcGxhaW4gdGV4dCBmb3IgY2xpcGJvYXJkIC8gZWRpdG9yIG91dHB1dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbGVMaXN0VG9QbGFpblRleHQoY29udGVudDogSUNoYXREZWJ1Z0V2ZW50RmlsZUxpc3RDb250ZW50KTogc3RyaW5nIHtcblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGNhcGl0YWxpemVkVHlwZSA9IGNvbnRlbnQuZGlzY292ZXJ5VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNvbnRlbnQuZGlzY292ZXJ5VHlwZS5zbGljZSgxKTtcblx0bGluZXMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLnBsYWluVGV4dC5kaXNjb3ZlcnlSZXN1bHRzJywgXCJ7MH0gRGlzY292ZXJ5IFJlc3VsdHNcIiwgY2FwaXRhbGl6ZWRUeXBlKSk7XG5cdGxpbmVzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5wbGFpblRleHQudG90YWxGaWxlcycsIFwiVG90YWwgZmlsZXM6IHswfVwiLCBjb250ZW50LmZpbGVzLmxlbmd0aCkpO1xuXHRsaW5lcy5wdXNoKCcnKTtcblxuXHRjb25zdCBsb2FkZWQgPSBjb250ZW50LmZpbGVzLmZpbHRlcihmID0+IGYuc3RhdHVzID09PSAnbG9hZGVkJyk7XG5cdGNvbnN0IHNraXBwZWQgPSBjb250ZW50LmZpbGVzLmZpbHRlcihmID0+IGYuc3RhdHVzID09PSAnc2tpcHBlZCcpO1xuXG5cdGlmIChsb2FkZWQubGVuZ3RoID4gMCkge1xuXHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5wbGFpblRleHQubG9hZGVkJywgXCJMb2FkZWQgKHswfSlcIiwgbG9hZGVkLmxlbmd0aCkpO1xuXHRcdC8vIEdyb3VwIGJ5IGxvY2F0aW9uXG5cdFx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHR5cGVvZiBsb2FkZWQ+KCk7XG5cdFx0Zm9yIChjb25zdCBmIG9mIGxvYWRlZCkge1xuXHRcdFx0Y29uc3QgcGFyZW50RGlyID0gY29udGVudC5kaXNjb3ZlcnlUeXBlID09PSAnc2tpbGwnID8gZGlybmFtZShkaXJuYW1lKGYudXJpKSkgOiBkaXJuYW1lKGYudXJpKTtcblx0XHRcdGNvbnN0IGtleSA9IGYuZXh0ZW5zaW9uSWQgPz8gcGFyZW50RGlyLnBhdGg7XG5cdFx0XHRsZXQgZ3JvdXAgPSBncm91cHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0gW107XG5cdFx0XHRcdGdyb3Vwcy5zZXQoa2V5LCBncm91cCk7XG5cdFx0XHR9XG5cdFx0XHRncm91cC5wdXNoKGYpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtsb2NhdGlvbkxhYmVsLCBmaWxlc10gb2YgZ3JvdXBzKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICR7bG9jYXRpb25MYWJlbH1gKTtcblx0XHRcdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IGYubmFtZSA/PyBmLnVyaS5wYXRoO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgICAgXFx1MjcxMyAke2xhYmVsfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsaW5lcy5wdXNoKCcnKTtcblx0fVxuXG5cdGlmIChza2lwcGVkLmxlbmd0aCA+IDApIHtcblx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcucGxhaW5UZXh0LnNraXBwZWQnLCBcIlNraXBwZWQgKHswfSlcIiwgc2tpcHBlZC5sZW5ndGgpKTtcblx0XHQvLyBHcm91cCBieSBza2lwIHJlYXNvblxuXHRcdGNvbnN0IHNraXBwZWRHcm91cHMgPSBuZXcgTWFwPHN0cmluZywgdHlwZW9mIHNraXBwZWQ+KCk7XG5cdFx0Zm9yIChjb25zdCBmIG9mIHNraXBwZWQpIHtcblx0XHRcdGNvbnN0IGtleSA9IGYuc2tpcFJlYXNvbiA/PyBsb2NhbGl6ZSgnY2hhdERlYnVnLnBsYWluVGV4dC51bmtub3duJywgXCJ1bmtub3duXCIpO1xuXHRcdFx0bGV0IGdyb3VwID0gc2tpcHBlZEdyb3Vwcy5nZXQoa2V5KTtcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Z3JvdXAgPSBbXTtcblx0XHRcdFx0c2tpcHBlZEdyb3Vwcy5zZXQoa2V5LCBncm91cCk7XG5cdFx0XHR9XG5cdFx0XHRncm91cC5wdXNoKGYpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtyZWFzb25MYWJlbCwgZmlsZXNdIG9mIHNraXBwZWRHcm91cHMpIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgJHtyZWFzb25MYWJlbH1gKTtcblx0XHRcdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IGYubmFtZSA/PyBmLnVyaS5wYXRoO1xuXHRcdFx0XHRsZXQgZGV0YWlsID0gYCAgICBcXHUyNzE3ICR7bGFiZWx9YDtcblx0XHRcdFx0aWYgKGYuZXJyb3JNZXNzYWdlIHx8IGYuZHVwbGljYXRlT2YpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRpZiAoZi5lcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdHBhcnRzLnB1c2goZi5lcnJvck1lc3NhZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZi5kdXBsaWNhdGVPZikge1xuXHRcdFx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLnBsYWluVGV4dC5kdXBsaWNhdGVPZicsIFwiZHVwbGljYXRlIG9mIHswfVwiLCBmLmR1cGxpY2F0ZU9mLnBhdGgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGV0YWlsICs9IGAgKCR7cGFydHMuam9pbignLCAnKX0pYDtcblx0XHRcdFx0fVxuXHRcdFx0XHRsaW5lcy5wdXNoKGRldGFpbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGNvbnRlbnQuc291cmNlRm9sZGVycyAmJiBjb250ZW50LnNvdXJjZUZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5wbGFpblRleHQuc291cmNlRm9sZGVycycsIFwiU291cmNlcyAoezB9KVwiLCBjb250ZW50LnNvdXJjZUZvbGRlcnMubGVuZ3RoKSk7XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgY29udGVudC5zb3VyY2VGb2xkZXJzKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICR7Zm9sZGVyLnVyaS5wYXRofWApO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBHZXQgYSBodW1hbi1yZWFkYWJsZSBzZWN0aW9uIHRpdGxlIGZvciBhIHJlc29sdXRpb24gbG9nIGNhdGVnb3J5LlxuICovXG5mdW5jdGlvbiBnZXRDYXRlZ29yeVNlY3Rpb25UaXRsZShjYXRlZ29yeTogSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeVsnY2F0ZWdvcnknXSwgY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdHN3aXRjaCAoY2F0ZWdvcnkpIHtcblx0XHRjYXNlICdhcHBseWluZyc6IHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmN1c3RvbWl6YXRpb24uaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnMgKHswfSlcIiwgY291bnQpO1xuXHRcdGNhc2UgJ3JlZmVyZW5jZWQnOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jdXN0b21pemF0aW9uLnJlZmVyZW5jZWQnLCBcIlJlZmVyZW5jZWQgKHswfSlcIiwgY291bnQpO1xuXHRcdGNhc2UgJ3NraWxsJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY3VzdG9taXphdGlvbi5za2lsbCcsIFwiU2tpbGxzICh7MH0pXCIsIGNvdW50KTtcblx0XHRjYXNlICdjdXN0b20tYWdlbnQnOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jdXN0b21pemF0aW9uLmN1c3RvbUFnZW50JywgXCJBZ2VudHMgKHswfSlcIiwgY291bnQpO1xuXHRcdGNhc2UgJ2hvb2snOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jdXN0b21pemF0aW9uLmhvb2snLCBcIkhvb2tzICh7MH0pXCIsIGNvdW50KTtcblx0XHRjYXNlICdza2lwcGVkJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY3VzdG9taXphdGlvbi5za2lwcGVkJywgXCJTa2lwcGVkICh7MH0pXCIsIGNvdW50KTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlciBhIGN1c3RvbWl6YXRpb24gc3VtbWFyeSBzaG93aW5nIHBlci1maWxlIHJlc29sdXRpb24gbG9nc1xuICogZnJvbSB0aGUgaW5zdHJ1Y3Rpb25zIGNvbnRleHQgY29tcHV0ZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDdXN0b21pemF0aW9uU3VtbWFyeUNvbnRlbnQoY29udGVudDogSUNoYXREZWJ1Z0V2ZW50Q3VzdG9taXphdGlvblN1bW1hcnlDb250ZW50LCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBzY3JvbGxhYmxlPzogeyBzY2FuRG9tTm9kZSgpOiB2b2lkIH0pOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH0ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2LmNoYXQtZGVidWctY3VzdG9taXphdGlvbi1zdW1tYXJ5Jyk7XG5cdGNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0Ly8gVGl0bGUgd2l0aCBjb3VudHMgYW5kIGR1cmF0aW9uXG5cdGNvbnN0IG1haW5TZWN0aW9uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdCcpKTtcblx0RE9NLmFwcGVuZChtYWluU2VjdGlvbiwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXRpdGxlJywgdW5kZWZpbmVkLFxuXHRcdGxvY2FsaXplKCdjaGF0RGVidWcuY3VzdG9taXphdGlvblRpdGxlJywgXCJDdXN0b21pemF0aW9uIFJlc29sdXRpb24gUmVzdWx0c1wiKSkpO1xuXHRET00uYXBwZW5kKG1haW5TZWN0aW9uLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtc3VtbWFyeScsIHVuZGVmaW5lZCxcblx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLmN1c3RvbWl6YXRpb25TdW1tYXJ5JywgXCJ7MH0gaW5zdHJ1Y3Rpb25zLCB7MX0gc2tpbGxzLCB7Mn0gYWdlbnRzLCB7M30gaG9va3MsIHs0fSBza2lwcGVkIGluIHs1fW1zXCIsXG5cdFx0XHRjb250ZW50LmNvdW50cy5pbnN0cnVjdGlvbnMsIGNvbnRlbnQuY291bnRzLnNraWxscywgY29udGVudC5jb3VudHMuYWdlbnRzLCBjb250ZW50LmNvdW50cy5ob29rcywgY29udGVudC5jb3VudHMuc2tpcHBlZCwgY29udGVudC5kdXJhdGlvbkluTWlsbGlzLnRvRml4ZWQoMSkpKSk7XG5cblx0Ly8gR3JvdXAgZW50cmllcyBieSBkaXNwbGF5IHNlY3Rpb246IGluc3RydWN0aW9ucyAoYXBwbHlpbmcrcmVmZXJlbmNlZCksIHNraWxscywgYWdlbnRzLCBza2lwcGVkXG5cdC8vIEluc3RydWN0aW9ucyBzZWN0aW9uIG1lcmdlcyBhcHBseWluZyArIHJlZmVyZW5jZWRcblx0Y29uc3QgaW5zdHJ1Y3Rpb25FbnRyaWVzID0gY29udGVudC5yZXNvbHV0aW9uTG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnYXBwbHlpbmcnIHx8IGUuY2F0ZWdvcnkgPT09ICdyZWZlcmVuY2VkJyk7XG5cdGNvbnN0IHNraWxsRW50cmllcyA9IGNvbnRlbnQucmVzb2x1dGlvbkxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ3NraWxsJyk7XG5cdGNvbnN0IGFnZW50RW50cmllcyA9IGNvbnRlbnQucmVzb2x1dGlvbkxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ2N1c3RvbS1hZ2VudCcpO1xuXHRjb25zdCBob29rRW50cmllcyA9IGNvbnRlbnQucmVzb2x1dGlvbkxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ2hvb2snKTtcblx0Y29uc3Qgc2tpcHBlZEVudHJpZXMgPSBjb250ZW50LnJlc29sdXRpb25Mb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdza2lwcGVkJyk7XG5cblx0Y29uc3Qgc2VjdGlvbnM6IHsgdGl0bGU6IHN0cmluZzsgaWNvbjogVGhlbWVJY29uOyBlbnRyaWVzOiByZWFkb25seSBJQ2hhdERlYnVnQ3VzdG9taXphdGlvbkxvZ0VudHJ5W10gfVtdID0gW1xuXHRcdHsgdGl0bGU6IGdldENhdGVnb3J5U2VjdGlvblRpdGxlKCdhcHBseWluZycsIGluc3RydWN0aW9uRW50cmllcy5sZW5ndGgpLCBpY29uOiBDb2RpY29uLmJvb2ssIGVudHJpZXM6IGluc3RydWN0aW9uRW50cmllcyB9LFxuXHRcdHsgdGl0bGU6IGdldENhdGVnb3J5U2VjdGlvblRpdGxlKCdza2lsbCcsIHNraWxsRW50cmllcy5sZW5ndGgpLCBpY29uOiBDb2RpY29uLmxpZ2h0YnVsYiwgZW50cmllczogc2tpbGxFbnRyaWVzIH0sXG5cdFx0eyB0aXRsZTogZ2V0Q2F0ZWdvcnlTZWN0aW9uVGl0bGUoJ2N1c3RvbS1hZ2VudCcsIGFnZW50RW50cmllcy5sZW5ndGgpLCBpY29uOiBDb2RpY29uLmFnZW50LCBlbnRyaWVzOiBhZ2VudEVudHJpZXMgfSxcblx0XHR7IHRpdGxlOiBnZXRDYXRlZ29yeVNlY3Rpb25UaXRsZSgnaG9vaycsIGhvb2tFbnRyaWVzLmxlbmd0aCksIGljb246IENvZGljb24uemFwLCBlbnRyaWVzOiBob29rRW50cmllcyB9LFxuXHRcdHsgdGl0bGU6IGdldENhdGVnb3J5U2VjdGlvblRpdGxlKCdza2lwcGVkJywgc2tpcHBlZEVudHJpZXMubGVuZ3RoKSwgaWNvbjogQ29kaWNvbi5jbG9zZSwgZW50cmllczogc2tpcHBlZEVudHJpZXMgfSxcblx0XTtcblxuXHRmb3IgKGNvbnN0IHsgdGl0bGUsIGljb24sIGVudHJpZXMgfSBvZiBzZWN0aW9ucykge1xuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VjdGlvbiA9IERPTS5hcHBlbmQobWFpblNlY3Rpb24sICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1zZWN0aW9uJykpO1xuXHRcdERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXNlY3Rpb24tdGl0bGUnLCB1bmRlZmluZWQsIHRpdGxlKSk7XG5cblx0XHRjb25zdCBsaXN0RWwgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1yb3dzJykpO1xuXHRcdGxpc3RFbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdCcpO1xuXHRcdGxpc3RFbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aXRsZSk7XG5cblx0XHRjb25zdCByb3dzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBhY3RpdmF0ZTogKCkgPT4gdm9pZCB9W10gPSBbXTtcblxuXHRcdC8vIEZvciBob29rcywgZ3JvdXAgZW50cmllcyBieSBsaWZlY3ljbGUgZXZlbnQgKHN0b3JlZCBpbiByZWFzb24pLlxuXHRcdGNvbnN0IGlzSG9va1NlY3Rpb24gPSBlbnRyaWVzLmxlbmd0aCA+IDAgJiYgZW50cmllc1swXS5jYXRlZ29yeSA9PT0gJ2hvb2snO1xuXHRcdGlmIChpc0hvb2tTZWN0aW9uKSB7XG5cdFx0XHQvLyBDb2xsZWN0IGVudHJpZXMgYnkgaG9vayB0eXBlLCBwcmVzZXJ2aW5nIGluc2VydGlvbiBvcmRlci5cblx0XHRcdGNvbnN0IGdyb3VwZWRCeVR5cGUgPSBuZXcgTWFwPHN0cmluZywgSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeVtdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tUeXBlID0gZW50cnkucmVhc29uID8/ICcnO1xuXHRcdFx0XHRsZXQgZ3JvdXAgPSBncm91cGVkQnlUeXBlLmdldChob29rVHlwZSk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRncm91cCA9IFtdO1xuXHRcdFx0XHRcdGdyb3VwZWRCeVR5cGUuc2V0KGhvb2tUeXBlLCBncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXAucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgW2hvb2tUeXBlLCBncm91cEVudHJpZXNdIG9mIGdyb3VwZWRCeVR5cGUpIHtcblx0XHRcdFx0aWYgKGhvb2tUeXBlKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZChsaXN0RWwsICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1ncm91cC1oZWFkZXInLCB1bmRlZmluZWQsIGhvb2tUeXBlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBncm91cEVudHJpZXMpIHtcblx0XHRcdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGxpc3RFbCwgJCgnZGl2LmNoYXQtZGVidWctZmlsZS1saXN0LXJvdycpKTtcblx0XHRcdFx0XHRET00uYXBwZW5kKHJvdywgJChgc3Bhbi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1pY29uJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKX1gKSk7XG5cblx0XHRcdFx0XHRpZiAoZW50cnkudXJpKSB7XG5cdFx0XHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoY3JlYXRlSW5saW5lRmlsZUxpbmsoXG5cdFx0XHRcdFx0XHRcdGVudHJ5LnVyaSwgZW50cnkubmFtZSwgRmlsZUtpbmQuRklMRSxcblx0XHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZSwgbW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlLCBkaXNwb3NhYmxlcyxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gZW50cnkudXJpO1xuXHRcdFx0XHRcdFx0cm93cy5wdXNoKHsgZWxlbWVudDogcm93LCBhY3RpdmF0ZTogKCkgPT4gb3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBlZGl0b3JPcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KSB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0RE9NLmFwcGVuZChyb3csICQoJ3NwYW4nLCB1bmRlZmluZWQsIGVudHJ5Lm5hbWUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGVudHJ5LnJlYXNvbiA/IGAke2VudHJ5Lm5hbWV9IFx1MjAxNCAke2VudHJ5LnJlYXNvbn1gIDogZW50cnkubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQobGlzdEVsLCAkKCdkaXYuY2hhdC1kZWJ1Zy1maWxlLWxpc3Qtcm93JykpO1xuXHRcdFx0XHRET00uYXBwZW5kKHJvdywgJChgc3Bhbi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1pY29uJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKX1gKSk7XG5cblx0XHRcdFx0Ly8gSGlkZSB0aGUgcmVhc29uIGZvciBza2lsbHMgKGUuZy4gXCJsb2NhbFwiKSBhbmQgY3VzdG9tLWFnZW50cyBcdTIwMTQgaXQncyBub2lzZSBpbiB0aGUgVUkuXG5cdFx0XHRcdGNvbnN0IHNob3dSZWFzb24gPSBlbnRyeS5jYXRlZ29yeSAhPT0gJ3NraWxsJyAmJiBlbnRyeS5jYXRlZ29yeSAhPT0gJ2N1c3RvbS1hZ2VudCc7XG5cblx0XHRcdFx0aWYgKGVudHJ5LnVyaSkge1xuXHRcdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChjcmVhdGVJbmxpbmVGaWxlTGluayhcblx0XHRcdFx0XHRcdGVudHJ5LnVyaSwgZW50cnkubmFtZSwgRmlsZUtpbmQuRklMRSxcblx0XHRcdFx0XHRcdG9wZW5lclNlcnZpY2UsIG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGxhYmVsU2VydmljZSwgZGlzcG9zYWJsZXMsXG5cdFx0XHRcdFx0XHRzaG93UmVhc29uID8gZW50cnkucmVhc29uIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gZW50cnkudXJpO1xuXHRcdFx0XHRcdHJvd3MucHVzaCh7IGVsZW1lbnQ6IHJvdywgYWN0aXZhdGU6ICgpID0+IG9wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgZWRpdG9yT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSkgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZChyb3csICQoJ3NwYW4nLCB1bmRlZmluZWQsIGVudHJ5Lm5hbWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzaG93UmVhc29uICYmIGVudHJ5LnJlYXNvbikge1xuXHRcdFx0XHRcdERPTS5hcHBlbmQocm93LCAkKCdzcGFuLmNoYXQtZGVidWctZmlsZS1saXN0LWRldGFpbCcsIHVuZGVmaW5lZCwgYCBcdTIwMTQgJHtlbnRyeS5yZWFzb259YCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBlbnRyeS5yZWFzb24gPyBgJHtlbnRyeS5uYW1lfSBcdTIwMTQgJHtlbnRyeS5yZWFzb259YCA6IGVudHJ5Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzZXR1cEZpbGVMaXN0TmF2aWdhdGlvbihsaXN0RWwsIHJvd3MsIGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdGlmIChjb250ZW50LnJlc29sdXRpb25Mb2dzLmxlbmd0aCA9PT0gMCkge1xuXHRcdERPTS5hcHBlbmQobWFpblNlY3Rpb24sICQoJ2Rpdi5jaGF0LWRlYnVnLWZpbGUtbGlzdC1zdW1tYXJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5ub1Jlc29sdXRpb25Mb2dzJywgXCJObyByZXNvbHV0aW9uIGxvZ3NcIikpKTtcblx0fVxuXG5cdHJldHVybiB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgZGlzcG9zYWJsZXMgfTtcbn1cblxuLyoqXG4gKiBTZXJpYWxpemUgYSBjdXN0b21pemF0aW9uIHN1bW1hcnkgdG8gcGxhaW4gdGV4dCBmb3IgY2xpcGJvYXJkIC8gZnVsbC1zY3JlZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjdXN0b21pemF0aW9uU3VtbWFyeVRvUGxhaW5UZXh0KGNvbnRlbnQ6IElDaGF0RGVidWdFdmVudEN1c3RvbWl6YXRpb25TdW1tYXJ5Q29udGVudCk6IHN0cmluZyB7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGxpbmVzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5wbGFpblRleHQuY3VzdG9taXphdGlvblRpdGxlJywgXCJDdXN0b21pemF0aW9uIFJlc29sdXRpb24gUmVzdWx0c1wiKSk7XG5cdGxpbmVzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5wbGFpblRleHQuY3VzdG9taXphdGlvblN1bW1hcnknLCBcInswfSBpbnN0cnVjdGlvbnMsIHsxfSBza2lsbHMsIHsyfSBhZ2VudHMsIHszfSBob29rcywgezR9IHNraXBwZWQgaW4gezV9bXNcIixcblx0XHRjb250ZW50LmNvdW50cy5pbnN0cnVjdGlvbnMsIGNvbnRlbnQuY291bnRzLnNraWxscywgY29udGVudC5jb3VudHMuYWdlbnRzLCBjb250ZW50LmNvdW50cy5ob29rcywgY29udGVudC5jb3VudHMuc2tpcHBlZCwgY29udGVudC5kdXJhdGlvbkluTWlsbGlzLnRvRml4ZWQoMSkpKTtcblx0bGluZXMucHVzaCgnJyk7XG5cdGZvciAoY29uc3QgZW50cnkgb2YgY29udGVudC5yZXNvbHV0aW9uTG9ncykge1xuXHRcdGNvbnN0IGRldGFpbCA9IGVudHJ5LnJlYXNvbiA/IGAke2VudHJ5Lm5hbWV9IFx1MjAxNCAke2VudHJ5LnJlYXNvbn1gIDogZW50cnkubmFtZTtcblx0XHRsaW5lcy5wdXNoKGAgIFske2VudHJ5LmNhdGVnb3J5fV0gJHtkZXRhaWx9YCk7XG5cdH1cblxuXHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG4iXSwKICAibWFwcGlu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LEVBQUUsU0FBUyxLQUFLLFVBQVUsTUFBTSxjQUFjLEtBQUssS0FBSyxFQUFFLGVBQWUsRUFBRSxlQUFlLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ2hILE9BQU87QUFDTixjQUFJLE9BQU8sS0FBSyxFQUFFLFFBQVEsUUFBVyxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ2pEO0FBRUEsWUFBSSxjQUFjLE1BQU0sUUFBUTtBQUMvQixjQUFJLE9BQU8sS0FBSyxFQUFFLG9DQUFvQyxRQUFXLFdBQU0sTUFBTSxNQUFNLEVBQUUsQ0FBQztBQUFBLFFBQ3ZGO0FBQ0EsWUFBSSxhQUFhLGNBQWMsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLFdBQU0sTUFBTSxNQUFNLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDN0Y7QUFBQSxJQUNEO0FBQ0EsNEJBQXdCLFFBQVEsTUFBTSxXQUFXO0FBQUEsRUFDbEQ7QUFFQSxNQUFJLFFBQVEsZUFBZSxXQUFXLEdBQUc7QUFDeEMsUUFBSSxPQUFPLGFBQWE7QUFBQSxNQUFFO0FBQUEsTUFBb0M7QUFBQSxNQUM3RCxTQUFTLDhCQUE4QixvQkFBb0I7QUFBQSxJQUFDLENBQUM7QUFBQSxFQUMvRDtBQUVBLFNBQU8sRUFBRSxTQUFTLFdBQVcsWUFBWTtBQUMxQztBQUtPLFNBQVMsZ0NBQWdDLFNBQTZEO0FBQzVHLFFBQU0sUUFBa0IsQ0FBQztBQUV6QixRQUFNLEtBQUssU0FBUywwQ0FBMEMsa0NBQWtDLENBQUM7QUFDakcsUUFBTSxLQUFLO0FBQUEsSUFBUztBQUFBLElBQTRDO0FBQUEsSUFDL0QsUUFBUSxPQUFPO0FBQUEsSUFBYyxRQUFRLE9BQU87QUFBQSxJQUFRLFFBQVEsT0FBTztBQUFBLElBQVEsUUFBUSxPQUFPO0FBQUEsSUFBTyxRQUFRLE9BQU87QUFBQSxJQUFTLFFBQVEsaUJBQWlCLFFBQVEsQ0FBQztBQUFBLEVBQUMsQ0FBQztBQUM5SixRQUFNLEtBQUssRUFBRTtBQUNiLGFBQVcsU0FBUyxRQUFRLGdCQUFnQjtBQUMzQyxVQUFNLFNBQVMsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLFdBQU0sTUFBTSxNQUFNLEtBQUssTUFBTTtBQUN4RSxVQUFNLEtBQUssTUFBTSxNQUFNLFFBQVEsS0FBSyxNQUFNLEVBQUU7QUFBQSxFQUM3QztBQUVBLFNBQU8sTUFBTSxLQUFLLElBQUk7QUFDdkI7IiwKICAibmFtZXMiOiBbImNhcGl0YWxpemVkVHlwZSJdCn0K
