import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
const COMMONLY_USED_SETTINGS = [
  "editor.fontSize",
  "editor.formatOnSave",
  "files.autoSave",
  "GitHub.copilot-chat.manageExtension",
  "editor.defaultFormatter",
  "editor.fontFamily",
  "editor.wordWrap",
  "chat.agent.maxRequests",
  "files.exclude",
  "workbench.colorTheme",
  "editor.tabSize",
  "editor.mouseWheelZoom",
  "editor.formatOnPaste"
];
function getCommonlyUsedData(settingGroups) {
  const allSettings = /* @__PURE__ */ new Map();
  for (const group of settingGroups) {
    for (const section of group.sections) {
      for (const s of section.settings) {
        allSettings.set(s.key, s);
      }
    }
  }
  const settings = [];
  for (const id of COMMONLY_USED_SETTINGS) {
    const setting = allSettings.get(id);
    if (setting) {
      settings.push(setting);
    }
  }
  return {
    id: "commonlyUsed",
    label: localize("commonlyUsed", "Commonly Used"),
    settings
  };
}
const tocData = {
  id: "root",
  label: "root",
  children: [
    {
      id: "editor",
      label: localize("textEditor", "Text Editor"),
      settings: ["editor.*"],
      children: [
        {
          id: "editor/cursor",
          label: localize("cursor", "Cursor"),
          settings: ["editor.cursor*"]
        },
        {
          id: "editor/find",
          label: localize("find", "Find"),
          settings: ["editor.find.*"]
        },
        {
          id: "editor/font",
          label: localize("font", "Font"),
          settings: ["editor.font*"]
        },
        {
          id: "editor/format",
          label: localize("formatting", "Formatting"),
          settings: ["editor.format*"]
        },
        {
          id: "editor/diffEditor",
          label: localize("diffEditor", "Diff Editor"),
          settings: ["diffEditor.*"]
        },
        {
          id: "editor/multiDiffEditor",
          label: localize("multiDiffEditor", "Multi-File Diff Editor"),
          settings: ["multiDiffEditor.*"]
        },
        {
          id: "editor/minimap",
          label: localize("minimap", "Minimap"),
          settings: ["editor.minimap.*"]
        },
        {
          id: "editor/suggestions",
          label: localize("suggestions", "Suggestions"),
          settings: ["editor.*suggest*"]
        },
        {
          id: "editor/files",
          label: localize("files", "Files"),
          settings: ["files.*"]
        }
      ]
    },
    {
      id: "workbench",
      label: localize("workbench", "Workbench"),
      settings: ["workbench.*"],
      children: [
        {
          id: "workbench/appearance",
          label: localize("appearance", "Appearance"),
          settings: ["workbench.activityBar.*", "workbench.*color*", "workbench.fontAliasing", "workbench.iconTheme", "workbench.sidebar.location", "workbench.*.visible", "workbench.tips.enabled", "workbench.tree.*", "workbench.view.*"]
        },
        {
          id: "workbench/breadcrumbs",
          label: localize("breadcrumbs", "Breadcrumbs"),
          settings: ["breadcrumbs.*"]
        },
        {
          id: "workbench/editor",
          label: localize("editorManagement", "Editor Management"),
          settings: ["workbench.editor.*"]
        },
        {
          id: "workbench/settings",
          label: localize("settings", "Settings Editor"),
          settings: ["workbench.settings.*"]
        },
        {
          id: "workbench/zenmode",
          label: localize("zenMode", "Zen Mode"),
          settings: ["zenmode.*"]
        },
        {
          id: "workbench/screencastmode",
          label: localize("screencastMode", "Screencast Mode"),
          settings: ["screencastMode.*"]
        },
        {
          id: "workbench/browser",
          label: localize("browser", "Browser"),
          settings: ["workbench.browser.*"]
        }
      ]
    },
    {
      id: "window",
      label: localize("window", "Window"),
      settings: ["window.*"],
      children: [
        {
          id: "window/newWindow",
          label: localize("newWindow", "New Window"),
          settings: ["window.*newwindow*"]
        }
      ]
    },
    {
      id: "chat",
      label: localize("chat", "Chat"),
      children: [
        {
          id: "chat/agent",
          label: localize("chatAgent", "Agent"),
          settings: [
            "chat.agent.*",
            "chat.checkpoints.*",
            "chat.editRequests",
            "chat.requestQueuing.*",
            "chat.undoRequests.*",
            "chat.customAgentInSubagent.*",
            "chat.editing.autoAcceptDelay",
            "chat.editing.confirmEditRequest*",
            "chat.planAgent.defaultModel"
          ]
        },
        {
          id: "chat/appearance",
          label: localize("chatAppearance", "Appearance"),
          settings: [
            "chat.editor.*",
            "chat.fontFamily",
            "chat.fontSize",
            "chat.math.*",
            "chat.agentsControl.*",
            "chat.alternativeToolAction.*",
            "chat.codeBlock.*",
            "chat.editing.explainChanges.enabled",
            "chat.editorAssociations",
            "chat.extensionUnification.*",
            "chat.inlineReferences.*",
            "chat.notifyWindow*",
            "chat.statusWidget.*",
            "chat.tips.*",
            "chat.unifiedAgentsBar.*",
            "accessibility.signals.chatUserActionRequired",
            "accessibility.signals.chatResponseReceived"
          ]
        },
        {
          id: "chat/sessions",
          label: localize("chatSessions", "Sessions"),
          settings: [
            "chat.agentSessionProjection.*",
            "chat.sessions.*",
            "chat.viewProgressBadge.*",
            "chat.viewSessions.*",
            "chat.restoreLastPanelSession",
            "chat.exitAfterDelegation",
            "chat.repoInfo.*"
          ]
        },
        {
          id: "chat/tools",
          label: localize("chatTools", "Tools"),
          settings: [
            "chat.tools.*",
            "chat.extensionTools.*"
          ]
        },
        {
          id: "chat/mcp",
          label: localize("chatMcp", "MCP"),
          settings: ["mcp", "chat.mcp.*", "mcp.*"]
        },
        {
          id: "chat/context",
          label: localize("chatContext", "Context"),
          settings: [
            "chat.detectParticipant.*",
            "chat.experimental.detectParticipant.*",
            "chat.implicitContext.*",
            "chat.promptFilesLocations",
            "chat.instructionsFilesLocations",
            "chat.modeFilesLocations",
            "chat.agentFilesLocations",
            "chat.agentSkillsLocations",
            "chat.hookFilesLocations",
            "chat.promptFilesRecommendations",
            "chat.useAgentsMdFile",
            "chat.useNestedAgentsMdFiles",
            "chat.useAgentSkills",
            "chat.experimental.useSkillAdherencePrompt",
            "chat.useHooks",
            "chat.includeApplyingInstructions",
            "chat.includeReferencedInstructions",
            "chat.useClaudeMdFile"
          ]
        },
        {
          id: "chat/inlineChat",
          label: localize("chatInlineChat", "Inline Chat"),
          settings: ["inlineChat.*"]
        },
        {
          id: "chat/miscellaneous",
          label: localize("chatMiscellaneous", "Miscellaneous"),
          settings: [
            ChatAIDisabledSettingId,
            "chat.allowAnonymousAccess"
          ]
        }
      ]
    },
    {
      id: "features",
      label: localize("features", "Features"),
      children: [
        {
          id: "features/accessibilitySignals",
          label: localize("accessibility.signals", "Accessibility Signals"),
          settings: ["accessibility.signal*"]
        },
        {
          id: "features/accessibility",
          label: localize("accessibility", "Accessibility"),
          settings: ["accessibility.*"]
        },
        {
          id: "features/explorer",
          label: localize("fileExplorer", "Explorer"),
          settings: ["explorer.*", "outline.*"]
        },
        {
          id: "features/search",
          label: localize("search", "Search"),
          settings: ["search.*"]
        },
        {
          id: "features/debug",
          label: localize("debug", "Debug"),
          settings: ["debug.*", "launch"]
        },
        {
          id: "features/testing",
          label: localize("testing", "Testing"),
          settings: ["testing.*"]
        },
        {
          id: "features/scm",
          label: localize("scm", "Source Control"),
          settings: ["scm.*"]
        },
        {
          id: "features/extensions",
          label: localize("extensions", "Extensions"),
          settings: ["extensions.*"]
        },
        {
          id: "features/terminal",
          label: localize("terminal", "Terminal"),
          settings: ["terminal.*"]
        },
        {
          id: "features/task",
          label: localize("task", "Task"),
          settings: ["task.*"]
        },
        {
          id: "features/problems",
          label: localize("problems", "Problems"),
          settings: ["problems.*"]
        },
        {
          id: "features/output",
          label: localize("output", "Output"),
          settings: ["output.*"]
        },
        {
          id: "features/comments",
          label: localize("comments", "Comments"),
          settings: ["comments.*"]
        },
        {
          id: "features/remote",
          label: localize("remote", "Remote"),
          settings: ["remote.*"]
        },
        {
          id: "features/timeline",
          label: localize("timeline", "Timeline"),
          settings: ["timeline.*"]
        },
        {
          id: "features/notebook",
          label: localize("notebook", "Notebook"),
          settings: ["notebook.*", "interactiveWindow.*"]
        },
        {
          id: "features/mergeEditor",
          label: localize("mergeEditor", "Merge Editor"),
          settings: ["mergeEditor.*"]
        },
        {
          id: "features/issueReporter",
          label: localize("issueReporter", "Issue Reporter"),
          settings: ["issueReporter.*"],
          hide: !isWeb
        }
      ]
    },
    {
      id: "application",
      label: localize("application", "Application"),
      children: [
        {
          id: "application/http",
          label: localize("proxy", "Proxy"),
          settings: ["http.*"]
        },
        {
          id: "application/keyboard",
          label: localize("keyboard", "Keyboard"),
          settings: ["keyboard.*"]
        },
        {
          id: "application/update",
          label: localize("update", "Update"),
          settings: ["update.*"]
        },
        {
          id: "application/telemetry",
          label: localize("telemetry", "Telemetry"),
          settings: ["telemetry.*"]
        },
        {
          id: "application/settingsSync",
          label: localize("settingsSync", "Settings Sync"),
          settings: ["settingsSync.*"]
        },
        {
          id: "application/network",
          label: localize("network", "Network"),
          settings: ["network.*"]
        },
        {
          id: "application/experimental",
          label: localize("experimental", "Experimental"),
          settings: ["application.experimental.*"]
        },
        {
          id: "application/other",
          label: localize("other", "Other"),
          settings: ["application.*"],
          hide: isWindows
        }
      ]
    },
    {
      id: "security",
      label: localize("security", "Security"),
      settings: ["security.*"],
      children: [
        {
          id: "security/workspace",
          label: localize("workspace", "Workspace"),
          settings: ["security.workspace.*"]
        }
      ]
    }
  ]
};
export {
  getCommonlyUsedData,
  tocData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc0xheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzV2ViLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZywgSVNldHRpbmdzR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9jaGF0U2V0dGluZ3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUT0NGaWx0ZXIge1xuXHRpbmNsdWRlPzoge1xuXHRcdGtleVBhdHRlcm5zPzogc3RyaW5nW107XG5cdFx0dGFncz86IHN0cmluZ1tdO1xuXHR9O1xuXHRleGNsdWRlPzoge1xuXHRcdGtleVBhdHRlcm5zPzogc3RyaW5nW107XG5cdFx0dGFncz86IHN0cmluZ1tdO1xuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUT0NFbnRyeTxUPiB7XG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdG9yZGVyPzogbnVtYmVyO1xuXHRjaGlsZHJlbj86IElUT0NFbnRyeTxUPltdO1xuXHRzZXR0aW5ncz86IEFycmF5PFQ+O1xuXHRoaWRlPzogYm9vbGVhbjtcbn1cblxuY29uc3QgQ09NTU9OTFlfVVNFRF9TRVRUSU5HUzogcmVhZG9ubHkgc3RyaW5nW10gPSBbXG5cdCdlZGl0b3IuZm9udFNpemUnLFxuXHQnZWRpdG9yLmZvcm1hdE9uU2F2ZScsXG5cdCdmaWxlcy5hdXRvU2F2ZScsXG5cdCdHaXRIdWIuY29waWxvdC1jaGF0Lm1hbmFnZUV4dGVuc2lvbicsXG5cdCdlZGl0b3IuZGVmYXVsdEZvcm1hdHRlcicsXG5cdCdlZGl0b3IuZm9udEZhbWlseScsXG5cdCdlZGl0b3Iud29yZFdyYXAnLFxuXHQnY2hhdC5hZ2VudC5tYXhSZXF1ZXN0cycsXG5cdCdmaWxlcy5leGNsdWRlJyxcblx0J3dvcmtiZW5jaC5jb2xvclRoZW1lJyxcblx0J2VkaXRvci50YWJTaXplJyxcblx0J2VkaXRvci5tb3VzZVdoZWVsWm9vbScsXG5cdCdlZGl0b3IuZm9ybWF0T25QYXN0ZSdcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21tb25seVVzZWREYXRhKHNldHRpbmdHcm91cHM6IElTZXR0aW5nc0dyb3VwW10pOiBJVE9DRW50cnk8SVNldHRpbmc+IHtcblx0Y29uc3QgYWxsU2V0dGluZ3MgPSBuZXcgTWFwPHN0cmluZywgSVNldHRpbmc+KCk7XG5cdGZvciAoY29uc3QgZ3JvdXAgb2Ygc2V0dGluZ0dyb3Vwcykge1xuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0YWxsU2V0dGluZ3Muc2V0KHMua2V5LCBzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Y29uc3Qgc2V0dGluZ3M6IElTZXR0aW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBpZCBvZiBDT01NT05MWV9VU0VEX1NFVFRJTkdTKSB7XG5cdFx0Y29uc3Qgc2V0dGluZyA9IGFsbFNldHRpbmdzLmdldChpZCk7XG5cdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdHNldHRpbmdzLnB1c2goc2V0dGluZyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdjb21tb25seVVzZWQnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29tbW9ubHlVc2VkJywgXCJDb21tb25seSBVc2VkXCIpLFxuXHRcdHNldHRpbmdzXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCB0b2NEYXRhOiBJVE9DRW50cnk8c3RyaW5nPiA9IHtcblx0aWQ6ICdyb290Jyxcblx0bGFiZWw6ICdyb290Jyxcblx0Y2hpbGRyZW46IFtcblx0XHR7XG5cdFx0XHRpZDogJ2VkaXRvcicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3RleHRFZGl0b3InLCBcIlRleHQgRWRpdG9yXCIpLFxuXHRcdFx0c2V0dGluZ3M6IFsnZWRpdG9yLionXSxcblx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9jdXJzb3InLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY3Vyc29yJywgXCJDdXJzb3JcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZWRpdG9yLmN1cnNvcionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvZmluZCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmaW5kJywgXCJGaW5kXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2VkaXRvci5maW5kLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvZm9udCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmb250JywgXCJGb250XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2VkaXRvci5mb250KiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9mb3JtYXQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9ybWF0dGluZycsIFwiRm9ybWF0dGluZ1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydlZGl0b3IuZm9ybWF0KiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9kaWZmRWRpdG9yJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RpZmZFZGl0b3InLCBcIkRpZmYgRWRpdG9yXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2RpZmZFZGl0b3IuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9tdWx0aURpZmZFZGl0b3InLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbXVsdGlEaWZmRWRpdG9yJywgXCJNdWx0aS1GaWxlIERpZmYgRWRpdG9yXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ211bHRpRGlmZkVkaXRvci4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZWRpdG9yL21pbmltYXAnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWluaW1hcCcsIFwiTWluaW1hcFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydlZGl0b3IubWluaW1hcC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZWRpdG9yL3N1Z2dlc3Rpb25zJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3N1Z2dlc3Rpb25zJywgXCJTdWdnZXN0aW9uc1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydlZGl0b3IuKnN1Z2dlc3QqJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZWRpdG9yL2ZpbGVzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZpbGVzJywgXCJGaWxlc1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydmaWxlcy4qJ11cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3b3JrYmVuY2gnLCBcIldvcmtiZW5jaFwiKSxcblx0XHRcdHNldHRpbmdzOiBbJ3dvcmtiZW5jaC4qJ10sXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gvYXBwZWFyYW5jZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhcHBlYXJhbmNlJywgXCJBcHBlYXJhbmNlXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3dvcmtiZW5jaC5hY3Rpdml0eUJhci4qJywgJ3dvcmtiZW5jaC4qY29sb3IqJywgJ3dvcmtiZW5jaC5mb250QWxpYXNpbmcnLCAnd29ya2JlbmNoLmljb25UaGVtZScsICd3b3JrYmVuY2guc2lkZWJhci5sb2NhdGlvbicsICd3b3JrYmVuY2guKi52aXNpYmxlJywgJ3dvcmtiZW5jaC50aXBzLmVuYWJsZWQnLCAnd29ya2JlbmNoLnRyZWUuKicsICd3b3JrYmVuY2gudmlldy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoL2JyZWFkY3J1bWJzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2JyZWFkY3J1bWJzJywgXCJCcmVhZGNydW1ic1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydicmVhZGNydW1icy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoL2VkaXRvcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdlZGl0b3JNYW5hZ2VtZW50JywgXCJFZGl0b3IgTWFuYWdlbWVudFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd3b3JrYmVuY2guZWRpdG9yLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gvc2V0dGluZ3MnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzIEVkaXRvclwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd3b3JrYmVuY2guc2V0dGluZ3MuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC96ZW5tb2RlJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3plbk1vZGUnLCBcIlplbiBNb2RlXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3plbm1vZGUuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC9zY3JlZW5jYXN0bW9kZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZScsIFwiU2NyZWVuY2FzdCBNb2RlXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3NjcmVlbmNhc3RNb2RlLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gvYnJvd3NlcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyJywgXCJCcm93c2VyXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3dvcmtiZW5jaC5icm93c2VyLionXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ3dpbmRvdycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3dpbmRvdycsIFwiV2luZG93XCIpLFxuXHRcdFx0c2V0dGluZ3M6IFsnd2luZG93LionXSxcblx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dpbmRvdy9uZXdXaW5kb3cnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbmV3V2luZG93JywgXCJOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3dpbmRvdy4qbmV3d2luZG93KiddXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnY2hhdCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQnLCBcIkNoYXRcIiksXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0L2FnZW50Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRBZ2VudCcsIFwiQWdlbnRcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFtcblx0XHRcdFx0XHRcdCdjaGF0LmFnZW50LionLFxuXHRcdFx0XHRcdFx0J2NoYXQuY2hlY2twb2ludHMuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5lZGl0UmVxdWVzdHMnLFxuXHRcdFx0XHRcdFx0J2NoYXQucmVxdWVzdFF1ZXVpbmcuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC51bmRvUmVxdWVzdHMuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5jdXN0b21BZ2VudEluU3ViYWdlbnQuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheScsXG5cdFx0XHRcdFx0XHQnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdConLFxuXHRcdFx0XHRcdFx0J2NoYXQucGxhbkFnZW50LmRlZmF1bHRNb2RlbCdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvYXBwZWFyYW5jZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0QXBwZWFyYW5jZScsIFwiQXBwZWFyYW5jZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogW1xuXHRcdFx0XHRcdFx0J2NoYXQuZWRpdG9yLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuZm9udEZhbWlseScsXG5cdFx0XHRcdFx0XHQnY2hhdC5mb250U2l6ZScsXG5cdFx0XHRcdFx0XHQnY2hhdC5tYXRoLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuYWdlbnRzQ29udHJvbC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmFsdGVybmF0aXZlVG9vbEFjdGlvbi4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmNvZGVCbG9jay4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmVkaXRpbmcuZXhwbGFpbkNoYW5nZXMuZW5hYmxlZCcsXG5cdFx0XHRcdFx0XHQnY2hhdC5lZGl0b3JBc3NvY2lhdGlvbnMnLFxuXHRcdFx0XHRcdFx0J2NoYXQuZXh0ZW5zaW9uVW5pZmljYXRpb24uKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5pbmxpbmVSZWZlcmVuY2VzLionLFxuXHRcdFx0XHRcdFx0J2NoYXQubm90aWZ5V2luZG93KicsXG5cdFx0XHRcdFx0XHQnY2hhdC5zdGF0dXNXaWRnZXQuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC50aXBzLionLFxuXHRcdFx0XHRcdFx0J2NoYXQudW5pZmllZEFnZW50c0Jhci4qJyxcblx0XHRcdFx0XHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsXG5cdFx0XHRcdFx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY2hhdC9zZXNzaW9ucycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnMnLCBcIlNlc3Npb25zXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbXG5cdFx0XHRcdFx0XHQnY2hhdC5hZ2VudFNlc3Npb25Qcm9qZWN0aW9uLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuc2Vzc2lvbnMuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC52aWV3UHJvZ3Jlc3NCYWRnZS4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LnZpZXdTZXNzaW9ucy4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LnJlc3RvcmVMYXN0UGFuZWxTZXNzaW9uJyxcblx0XHRcdFx0XHRcdCdjaGF0LmV4aXRBZnRlckRlbGVnYXRpb24nLFxuXHRcdFx0XHRcdFx0J2NoYXQucmVwb0luZm8uKidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvdG9vbHMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdFRvb2xzJywgXCJUb29sc1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogW1xuXHRcdFx0XHRcdFx0J2NoYXQudG9vbHMuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5leHRlbnNpb25Ub29scy4qJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY2hhdC9tY3AnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdE1jcCcsIFwiTUNQXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ21jcCcsICdjaGF0Lm1jcC4qJywgJ21jcC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY2hhdC9jb250ZXh0Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRDb250ZXh0JywgXCJDb250ZXh0XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbXG5cdFx0XHRcdFx0XHQnY2hhdC5kZXRlY3RQYXJ0aWNpcGFudC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmV4cGVyaW1lbnRhbC5kZXRlY3RQYXJ0aWNpcGFudC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmltcGxpY2l0Q29udGV4dC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LnByb21wdEZpbGVzTG9jYXRpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0Lmluc3RydWN0aW9uc0ZpbGVzTG9jYXRpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0Lm1vZGVGaWxlc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5hZ2VudEZpbGVzTG9jYXRpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0Lmhvb2tGaWxlc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5wcm9tcHRGaWxlc1JlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC51c2VBZ2VudHNNZEZpbGUnLFxuXHRcdFx0XHRcdFx0J2NoYXQudXNlTmVzdGVkQWdlbnRzTWRGaWxlcycsXG5cdFx0XHRcdFx0XHQnY2hhdC51c2VBZ2VudFNraWxscycsXG5cdFx0XHRcdFx0XHQnY2hhdC5leHBlcmltZW50YWwudXNlU2tpbGxBZGhlcmVuY2VQcm9tcHQnLFxuXHRcdFx0XHRcdFx0J2NoYXQudXNlSG9va3MnLFxuXHRcdFx0XHRcdFx0J2NoYXQuaW5jbHVkZUFwcGx5aW5nSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0LmluY2x1ZGVSZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0LnVzZUNsYXVkZU1kRmlsZSdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvaW5saW5lQ2hhdCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0SW5saW5lQ2hhdCcsIFwiSW5saW5lIENoYXRcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnaW5saW5lQ2hhdC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY2hhdC9taXNjZWxsYW5lb3VzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRNaXNjZWxsYW5lb3VzJywgXCJNaXNjZWxsYW5lb3VzXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbXG5cdFx0XHRcdFx0XHRDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCxcblx0XHRcdFx0XHRcdCdjaGF0LmFsbG93QW5vbnltb3VzQWNjZXNzJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnZmVhdHVyZXMnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmZWF0dXJlcycsIFwiRmVhdHVyZXNcIiksXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9hY2Nlc3NpYmlsaXR5U2lnbmFscycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMnLCAnQWNjZXNzaWJpbGl0eSBTaWduYWxzJyksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnYWNjZXNzaWJpbGl0eS5zaWduYWwqJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvYWNjZXNzaWJpbGl0eScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5JywgXCJBY2Nlc3NpYmlsaXR5XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2FjY2Vzc2liaWxpdHkuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL2V4cGxvcmVyJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZpbGVFeHBsb3JlcicsIFwiRXhwbG9yZXJcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZXhwbG9yZXIuKicsICdvdXRsaW5lLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9zZWFyY2gnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2VhcmNoJywgXCJTZWFyY2hcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnc2VhcmNoLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9kZWJ1ZycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkZWJ1ZycsIFwiRGVidWdcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZGVidWcuKicsICdsYXVuY2gnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy90ZXN0aW5nJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Rlc3RpbmcnLCBcIlRlc3RpbmdcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsndGVzdGluZy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvc2NtJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NjbScsIFwiU291cmNlIENvbnRyb2xcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnc2NtLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9leHRlbnNpb25zJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbnMnLCBcIkV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZXh0ZW5zaW9ucy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvdGVybWluYWwnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndGVybWluYWwnLCBcIlRlcm1pbmFsXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3Rlcm1pbmFsLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy90YXNrJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Rhc2snLCBcIlRhc2tcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsndGFzay4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvcHJvYmxlbXMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvYmxlbXMnLCBcIlByb2JsZW1zXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3Byb2JsZW1zLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9vdXRwdXQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3V0cHV0JywgXCJPdXRwdXRcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnb3V0cHV0LionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9jb21tZW50cycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb21tZW50cycsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnY29tbWVudHMuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL3JlbW90ZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZW1vdGUnLCBcIlJlbW90ZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydyZW1vdGUuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL3RpbWVsaW5lJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd0aW1lbGluZS4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvbm90ZWJvb2snLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm90ZWJvb2snLCAnTm90ZWJvb2snKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydub3RlYm9vay4qJywgJ2ludGVyYWN0aXZlV2luZG93LionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9tZXJnZUVkaXRvcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtZXJnZUVkaXRvcicsICdNZXJnZSBFZGl0b3InKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydtZXJnZUVkaXRvci4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvaXNzdWVSZXBvcnRlcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpc3N1ZVJlcG9ydGVyJywgJ0lzc3VlIFJlcG9ydGVyJyksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnaXNzdWVSZXBvcnRlci4qJ10sXG5cdFx0XHRcdFx0aGlkZTogIWlzV2ViXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnYXBwbGljYXRpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhcHBsaWNhdGlvbicsIFwiQXBwbGljYXRpb25cIiksXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi9odHRwJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb3h5JywgXCJQcm94eVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydodHRwLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi9rZXlib2FyZCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdrZXlib2FyZCcsIFwiS2V5Ym9hcmRcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsna2V5Ym9hcmQuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FwcGxpY2F0aW9uL3VwZGF0ZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd1cGRhdGUnLCBcIlVwZGF0ZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd1cGRhdGUuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FwcGxpY2F0aW9uL3RlbGVtZXRyeScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZWxlbWV0cnknLCBcIlRlbGVtZXRyeVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd0ZWxlbWV0cnkuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FwcGxpY2F0aW9uL3NldHRpbmdzU3luYycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZXR0aW5nc1N5bmMnLCBcIlNldHRpbmdzIFN5bmNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnc2V0dGluZ3NTeW5jLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi9uZXR3b3JrJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25ldHdvcmsnLCBcIk5ldHdvcmtcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnbmV0d29yay4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYXBwbGljYXRpb24vZXhwZXJpbWVudGFsJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4cGVyaW1lbnRhbCcsIFwiRXhwZXJpbWVudGFsXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2FwcGxpY2F0aW9uLmV4cGVyaW1lbnRhbC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYXBwbGljYXRpb24vb3RoZXInLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3RoZXInLCBcIk90aGVyXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2FwcGxpY2F0aW9uLionXSxcblx0XHRcdFx0XHRoaWRlOiBpc1dpbmRvd3Ncblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICdzZWN1cml0eScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlY3VyaXR5JywgXCJTZWN1cml0eVwiKSxcblx0XHRcdHNldHRpbmdzOiBbJ3NlY3VyaXR5LionXSxcblx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3NlY3VyaXR5L3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydzZWN1cml0eS53b3Jrc3BhY2UuKiddXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdF1cbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLE9BQU8saUJBQWlCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsK0JBQStCO0FBc0J4QyxNQUFNLHlCQUE0QztBQUFBLEVBQ2pEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFTyxTQUFTLG9CQUFvQixlQUFzRDtBQUN6RixRQUFNLGNBQWMsb0JBQUksSUFBc0I7QUFDOUMsYUFBVyxTQUFTLGVBQWU7QUFDbEMsZUFBVyxXQUFXLE1BQU0sVUFBVTtBQUNyQyxpQkFBVyxLQUFLLFFBQVEsVUFBVTtBQUNqQyxvQkFBWSxJQUFJLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFFBQU0sV0FBdUIsQ0FBQztBQUM5QixhQUFXLE1BQU0sd0JBQXdCO0FBQ3hDLFVBQU0sVUFBVSxZQUFZLElBQUksRUFBRTtBQUNsQyxRQUFJLFNBQVM7QUFDWixlQUFTLEtBQUssT0FBTztBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFBQSxJQUNOLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSxVQUE2QjtBQUFBLEVBQ3pDLElB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
