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
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { escapeMarkdownSyntaxTokens } from "../../../../base/common/htmlContent.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { escape } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import * as nls from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asTextOrError, IRequestService } from "../../../../platform/request/common/request.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewWorkbenchService } from "../../webviewPanel/browser/webviewWorkbenchService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { getTelemetryLevel, supportsTelemetry } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { SimpleSettingRenderer } from "../../markdown/browser/markdownSettingRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../../base/common/network.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { dirname } from "../../../../base/common/resources.js";
import { asWebviewUri } from "../../webview/common/webview.js";
let ReleaseNotesManager = class extends Disposable {
  constructor(_environmentService, _keybindingService, _languageService, _openerService, _requestService, _configurationService, _editorService, _editorGroupService, _codeEditorService, _webviewWorkbenchService, _extensionService, _productService, _instantiationService) {
    super();
    this._environmentService = _environmentService;
    this._keybindingService = _keybindingService;
    this._languageService = _languageService;
    this._openerService = _openerService;
    this._requestService = _requestService;
    this._configurationService = _configurationService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._codeEditorService = _codeEditorService;
    this._webviewWorkbenchService = _webviewWorkbenchService;
    this._extensionService = _extensionService;
    this._productService = _productService;
    this._instantiationService = _instantiationService;
    this._releaseNotesCache = /* @__PURE__ */ new Map();
    this._currentReleaseNotes = void 0;
    this._register(TokenizationRegistry.onDidChange(() => {
      return this.updateHtml();
    }));
    this._register(_configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
    this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor((e) => this.onDidChangeActiveWebviewEditor(e)));
    this._simpleSettingRenderer = this._instantiationService.createInstance(SimpleSettingRenderer);
  }
  async updateHtml() {
    if (!this._currentReleaseNotes || !this._lastMeta) {
      return;
    }
    const html = await this.renderBody(this._lastMeta);
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.webview.setHtml(html);
    }
  }
  async getBase(useCurrentFile) {
    if (useCurrentFile) {
      const currentFileUri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
      if (currentFileUri) {
        return dirname(currentFileUri);
      }
    }
    return URI.parse("https://code.visualstudio.com/raw");
  }
  async show(version, useCurrentFile) {
    const releaseNoteText = await this.loadReleaseNotes(version, useCurrentFile);
    const base = await this.getBase(useCurrentFile);
    this._lastMeta = { text: releaseNoteText, base };
    const html = await this.renderBody(this._lastMeta);
    const title = nls.localize("releaseNotesInputName", "Release Notes: {0}", version);
    const activeEditorPane = this._editorService.activeEditorPane;
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.setWebviewTitle(title);
      this._currentReleaseNotes.webview.setHtml(html);
      this._webviewWorkbenchService.revealWebview(this._currentReleaseNotes, activeEditorPane ? activeEditorPane.group : this._editorGroupService.activeGroup, false);
    } else {
      this._currentReleaseNotes = this._webviewWorkbenchService.openWebview(
        {
          title,
          options: {
            tryRestoreScrollPosition: true,
            enableFindWidget: true,
            disableServiceWorker: useCurrentFile ? false : true
          },
          contentOptions: {
            localResourceRoots: useCurrentFile ? [base] : [],
            allowScripts: true
          },
          extension: void 0
        },
        "releaseNotes",
        title,
        Codicon.vscode,
        { group: ACTIVE_GROUP, preserveFocus: false }
      );
      const disposables = new DisposableStore();
      disposables.add(this._currentReleaseNotes.webview.onDidClickLink((uri) => this.onDidClickLink(URI.parse(uri))));
      disposables.add(this._currentReleaseNotes.webview.onMessage((e) => {
        if (e.message.type === "showReleaseNotes") {
          this._configurationService.updateValue("update.showReleaseNotes", e.message.value);
        } else if (e.message.type === "clickSetting") {
          const x = this._currentReleaseNotes?.webview.container.offsetLeft + e.message.value.x;
          const y = this._currentReleaseNotes?.webview.container.offsetTop + e.message.value.y;
          this._simpleSettingRenderer.updateSetting(URI.parse(e.message.value.uri), x, y);
        }
      }));
      disposables.add(this._currentReleaseNotes.onWillDispose(() => {
        disposables.dispose();
        this._currentReleaseNotes = void 0;
      }));
      this._currentReleaseNotes.webview.setHtml(html);
    }
    return true;
  }
  async loadReleaseNotes(version, useCurrentFile) {
    const match = /^(\d+\.\d+)\./.exec(version);
    if (!match) {
      throw new Error("not found");
    }
    const versionLabel = match[1].replace(/\./g, "_");
    const baseUrl = "https://code.visualstudio.com/raw";
    const url = `${baseUrl}/v${versionLabel}.md`;
    const unassigned = nls.localize("unassigned", "unassigned");
    const escapeMdHtml = (text) => {
      return escape(text).replace(/\\/g, "\\\\");
    };
    const patchKeybindings = (text) => {
      const kb = (match2, kb2) => {
        const keybinding = this._keybindingService.lookupKeybinding(kb2);
        if (!keybinding) {
          return kb2;
        }
        return keybinding.getLabel() || kb2;
      };
      const kbstyle = (match2, kb2) => {
        const keybinding = KeybindingParser.parseKeybinding(kb2);
        if (!keybinding) {
          return unassigned;
        }
        const resolvedKeybindings = this._keybindingService.resolveKeybinding(keybinding);
        if (resolvedKeybindings.length === 0) {
          return unassigned;
        }
        return resolvedKeybindings[0].getLabel() || unassigned;
      };
      const kbCode = (match2, binding) => {
        const resolved = kb(match2, binding);
        return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
      };
      const kbstyleCode = (match2, binding) => {
        const resolved = kbstyle(match2, binding);
        return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
      };
      return text.replace(/`kb\(([a-z.\d\-]+)\)`/gi, kbCode).replace(/`kbstyle\(([^\)]+)\)`/gi, kbstyleCode).replace(/kb\(([a-z.\d\-]+)\)/gi, (match2, binding) => escapeMarkdownSyntaxTokens(kb(match2, binding))).replace(/kbstyle\(([^\)]+)\)/gi, (match2, binding) => escapeMarkdownSyntaxTokens(kbstyle(match2, binding)));
    };
    const fetchReleaseNotes = async () => {
      let text;
      try {
        if (useCurrentFile) {
          const file = this._codeEditorService.getActiveCodeEditor()?.getModel()?.getValue();
          text = file ? file.substring(file.indexOf("#")) : void 0;
        } else {
          text = await asTextOrError(await this._requestService.request({ url, callSite: "releaseNotesEditor.fetchReleaseNotes" }, CancellationToken.None));
        }
      } catch {
        throw new Error("Failed to fetch release notes");
      }
      if (!text || !/^#\s/.test(text) && !useCurrentFile) {
        throw new Error("Invalid release notes");
      }
      return patchKeybindings(text);
    };
    if (useCurrentFile) {
      return fetchReleaseNotes();
    }
    if (!this._releaseNotesCache.has(version)) {
      this._releaseNotesCache.set(version, (async () => {
        try {
          return await fetchReleaseNotes();
        } catch (err) {
          this._releaseNotesCache.delete(version);
          throw err;
        }
      })());
    }
    return this._releaseNotesCache.get(version);
  }
  async onDidClickLink(uri) {
    if (uri.scheme === Schemas.codeSetting) {
    } else {
      this.addGAParameters(uri, "ReleaseNotes").then((updated) => this._openerService.open(updated, { allowCommands: ["workbench.action.openSettings", "summarize.release.notes"] })).then(void 0, onUnexpectedError);
    }
  }
  async addGAParameters(uri, origin, experiment = "1") {
    if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === TelemetryLevel.USAGE) {
      if (uri.scheme === "https" && uri.authority === "code.visualstudio.com") {
        return uri.with({ query: `${uri.query ? uri.query + "&" : ""}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_content=${encodeURIComponent(experiment)}` });
      }
    }
    return uri;
  }
  async renderBody(fileContent) {
    const nonce = generateUuid();
    const processedContent = await renderReleaseNotesMarkdown(fileContent.text, this._extensionService, this._languageService, this._simpleSettingRenderer, this._productService.quality);
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    const showReleaseNotes = Boolean(this._configurationService.getValue("update.showReleaseNotes"));
    return `<!DOCTYPE html>
		<html>
			<head>
				<base href="${asWebviewUri(fileContent.base).toString(true)}/" >
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'nonce-${nonce}' https://code.visualstudio.com; script-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}

					/* codesetting */

					code:has(.codesetting) {
						background-color: var(--vscode-textPreformat-background);
						color: var(--vscode-textPreformat-foreground);
						padding-left: 1px;
						margin-right: 3px;
						padding-right: 0px;
					}

					code:has(.codesetting):focus {
						border: 1px solid var(--vscode-button-border, transparent);
					}

					.codesetting {
						color: var(--vscode-textPreformat-foreground);
						padding: 0px 1px 1px 0px;
						font-size: 0px;
						overflow: hidden;
						text-overflow: ellipsis;
						outline-offset: 2px !important;
						box-sizing: border-box;
						text-align: center;
						cursor: pointer;
						display: inline;
						margin-right: 3px;
					}
					.codesetting svg {
						font-size: 12px;
						text-align: center;
						cursor: pointer;
						border: 1px solid var(--vscode-button-secondaryBorder, transparent);
						outline: 1px solid transparent;
						line-height: 9px;
						margin-bottom: -5px;
						padding-left: 0px;
						padding-top: 2px;
						padding-bottom: 2px;
						padding-right: 2px;
						display: inline-block;
						text-decoration: none;
						text-rendering: auto;
						text-transform: none;
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
						user-select: none;
						-webkit-user-select: none;
					}
					.codesetting .setting-name {
						font-size: 13px;
						padding-left: 2px;
						padding-right: 3px;
						padding-top: 1px;
						padding-bottom: 1px;
						margin-top: -3px;
					}
					.codesetting:hover {
						color: var(--vscode-textPreformat-foreground) !important;
						text-decoration: none !important;
					}
					code:has(.codesetting):hover {
						filter: brightness(140%);
						text-decoration: none !important;
					}
					.codesetting:focus {
						outline: 0 !important;
						text-decoration: none !important;
						color: var(--vscode-button-hoverForeground) !important;
					}
					.codesetting .separator {
						width: 1px;
						height: 14px;
						margin-bottom: -3px;
						display: inline-block;
						background-color: var(--vscode-editor-background);
						font-size: 12px;
						margin-right: 4px;
					}

					header { display: flex; align-items: center; padding-top: 1em; }

					/* Release notes enhancements from vscode-docs */
					html {
						font-size: 10px;
						height: 100%;
						overscroll-behavior: none;
					}

					body {
						margin: 0 auto;
						max-width: 980px;
						height: auto;
						overflow-y: auto;
						overscroll-behavior: none;
					}

					/* Scroll to top button */
					#scroll-to-top {
						position: fixed;
						width: 40px;
						height: 40px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-background, #444);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-hoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-foreground);
						/* Chevron up icon */
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}

					/* Header styling */
					h2 {
						margin-top: 1.2em;
						scroll-margin-top: 1.2em;
					}

					h2:not(:first-of-type) {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h3 {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h2 + h3 {
						margin-top: 0;
					}

					/* Highlights table styling */
					.highlights-table {
						border-collapse: collapse;
						border: none;
					}

					.highlights-table th {
						vertical-align: top;
						border: none;
						padding-top: 2em;
						font-weight: bold;
					}

					.highlights-table td {
						vertical-align: top;
						border: none;
					}

					.highlights-table tr:nth-child(2) td {
						padding-bottom: 1em;
					}

					/* Main content layout */
					.toc-nav-layout {
						display: flex;
						align-items: flex-start;
					}

					/* TOC Navigation */
					#toc-nav {
						position: sticky;
						top: 20px;
						width: 10vw;
						min-width: 120px;
						margin-right: 32px;
						margin-top: 2em;
					}

					#toc-nav > div {
						font-weight: bold;
						font-size: 1em;
						margin-bottom: 1em;
						text-transform: uppercase;
					}

					#toc-nav ul {
						list-style: none;
						padding: 0;
						margin: 0;
					}

					#toc-nav ul li {
						margin-bottom: 0.5em;
					}

					#toc-nav a {
						color: var(--vscode-editor-foreground, #ccc);
						text-decoration: none !important;
						transition: background-color 0.2s, color 0.2s;
						padding: 4px 6px;
						margin: -4px -6px;
						border-radius: 4px;
						display: block;
						outline: none;
					}

					#toc-nav a:hover {
						background-color: var(--vscode-button-secondaryHoverBackground, #1177bb);
						color: var(--vscode-button-secondaryForeground, #ffffff);
						cursor: pointer;
						text-decoration: none !important;
					}

					/* Main content area */
					.notes-main {
						flex: 1;
						min-width: 0;
					}

					/* Responsive breakpoint - Hide TOC on smaller screens */
					@media (max-width: 576px) {
						#toc-nav {
							display: none;
						}

						.toc-nav-layout {
							flex-direction: column;
						}

						.notes-main {
							margin-left: 0;
						}
					}

				</style>
			</head>
			<body>
				${processedContent}
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					const container = document.createElement('p');
					container.style.display = 'flex';
					container.style.alignItems = 'center';

					const input = document.createElement('input');
					input.type = 'checkbox';
					input.id = 'showReleaseNotes';
					input.checked = ${showReleaseNotes};
					container.appendChild(input);

					const label = document.createElement('label');
					label.htmlFor = 'showReleaseNotes';
					label.textContent = '${nls.localize("showOnUpdate", "Show release notes after an update")}';
					container.appendChild(label);

					const beforeElement = document.querySelector("body > h1")?.nextElementSibling;
					if (beforeElement) {
						document.body.insertBefore(container, beforeElement);
					} else {
						document.body.appendChild(container);
					}

					window.addEventListener('message', event => {
						if (event.data.type === 'showReleaseNotes') {
							input.checked = event.data.value;
						}
					});

					window.addEventListener('click', event => {
						const href = event.target.href ?? event.target.parentElement?.href ?? event.target.parentElement?.parentElement?.href;
						if (href && (href.startsWith('${Schemas.codeSetting}'))) {
							vscode.postMessage({ type: 'clickSetting', value: { uri: href, x: event.clientX, y: event.clientY }});
						}
					});

					window.addEventListener('keypress', event => {
						if (event.keyCode === 13) {
							if (event.target.children.length > 0 && event.target.children[0].href) {
								const clientRect = event.target.getBoundingClientRect();
								vscode.postMessage({ type: 'clickSetting', value: { uri: event.target.children[0].href, x: clientRect.right , y: clientRect.bottom }});
							}
						}
					});

					input.addEventListener('change', event => {
						vscode.postMessage({ type: 'showReleaseNotes', value: input.checked }, '*');
					});
				<\/script>
			</body>
		</html>`;
  }
  onDidChangeConfiguration(e) {
    if (e.affectsConfiguration("update.showReleaseNotes")) {
      this.updateCheckboxWebview();
    }
  }
  onDidChangeActiveWebviewEditor(input) {
    if (input && input === this._currentReleaseNotes) {
      this.updateCheckboxWebview();
    }
  }
  updateCheckboxWebview() {
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.webview.postMessage({
        type: "showReleaseNotes",
        value: this._configurationService.getValue("update.showReleaseNotes")
      });
    }
  }
};
ReleaseNotesManager = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IRequestService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, ICodeEditorService),
  __decorateParam(9, IWebviewWorkbenchService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IInstantiationService)
], ReleaseNotesManager);
function processConditionalBlocks(text, activeConditions) {
  return text.replace(
    /<!--\s*%IF\s+(\w+)\s*%([\s\S]*?)%ENDIF\s*%\s*-->/gi,
    (_match, condition, content) => {
      if (activeConditions.has(condition.toUpperCase())) {
        return content;
      }
      return "";
    }
  );
}
async function renderReleaseNotesMarkdown(text, extensionService, languageService, simpleSettingRenderer, quality) {
  text = text.toString().replace(/<!--\s*TOC\s*/gi, "").replace(/\s*Navigation End\s*-->/gi, "");
  const activeConditions = /* @__PURE__ */ new Set(["IN_PRODUCT"]);
  if (quality === "stable") {
    activeConditions.add("STABLE");
  } else if (quality === "insider") {
    activeConditions.add("INSIDERS");
  }
  text = processConditionalBlocks(text, activeConditions);
  return renderMarkdownDocument(text, extensionService, languageService, {
    sanitizerConfig: {
      allowRelativeMediaPaths: true,
      allowedLinkProtocols: {
        override: [Schemas.http, Schemas.https, Schemas.command, Schemas.codeSetting]
      },
      allowedTags: { augment: ["nav", "svg", "path"] },
      allowedAttributes: { augment: ["aria-role", "viewBox", "fill", "xmlns", "d"] }
    },
    markedExtensions: [{
      renderer: {
        html: simpleSettingRenderer.getHtmlRenderer(),
        codespan: simpleSettingRenderer.getCodeSpanRenderer()
      }
    }]
  });
}
export {
  ReleaseNotesManager,
  processConditionalBlocks,
  renderReleaseNotesMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcYnJvd3NlclxccmVsZWFzZU5vdGVzRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1BhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdQYXJzZXIuanMnO1xuaW1wb3J0IHsgZXNjYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNUZXh0T3JFcnJvciwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BUktET1dOX1NUWUxFUywgcmVuZGVyTWFya2Rvd25Eb2N1bWVudCB9IGZyb20gJy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFdlYnZpZXdJbnB1dCB9IGZyb20gJy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3V29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRUZWxlbWV0cnlMZXZlbCwgc3VwcG9ydHNUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2ltcGxlU2V0dGluZ1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blNldHRpbmdSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNXZWJ2aWV3VXJpIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9jb21tb24vd2Vidmlldy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZWxlYXNlTm90ZXNNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpbXBsZVNldHRpbmdSZW5kZXJlcjogU2ltcGxlU2V0dGluZ1JlbmRlcmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxlYXNlTm90ZXNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHN0cmluZz4+KCk7XG5cblx0cHJpdmF0ZSBfY3VycmVudFJlbGVhc2VOb3RlczogV2Vidmlld0lucHV0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0TWV0YTogeyB0ZXh0OiBzdHJpbmc7IGJhc2U6IFVSSSB9IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93ZWJ2aWV3V29ya2JlbmNoU2VydmljZTogSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlSHRtbCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHRoaXMub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlV2Vidmlld0VkaXRvcigoZSkgPT4gdGhpcy5vbkRpZENoYW5nZUFjdGl2ZVdlYnZpZXdFZGl0b3IoZSkpKTtcblx0XHR0aGlzLl9zaW1wbGVTZXR0aW5nUmVuZGVyZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVTZXR0aW5nUmVuZGVyZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVIdG1sKCkge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFJlbGVhc2VOb3RlcyB8fCAhdGhpcy5fbGFzdE1ldGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaHRtbCA9IGF3YWl0IHRoaXMucmVuZGVyQm9keSh0aGlzLl9sYXN0TWV0YSk7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMud2Vidmlldy5zZXRIdG1sKGh0bWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QmFzZSh1c2VDdXJyZW50RmlsZTogYm9vbGVhbikge1xuXHRcdGlmICh1c2VDdXJyZW50RmlsZSkge1xuXHRcdFx0Y29uc3QgY3VycmVudEZpbGVVcmkgPSB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk/LmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGlmIChjdXJyZW50RmlsZVVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZGlybmFtZShjdXJyZW50RmlsZVVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBVUkkucGFyc2UoJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL3JhdycpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNob3codmVyc2lvbjogc3RyaW5nLCB1c2VDdXJyZW50RmlsZTogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlbGVhc2VOb3RlVGV4dCA9IGF3YWl0IHRoaXMubG9hZFJlbGVhc2VOb3Rlcyh2ZXJzaW9uLCB1c2VDdXJyZW50RmlsZSk7XG5cdFx0Y29uc3QgYmFzZSA9IGF3YWl0IHRoaXMuZ2V0QmFzZSh1c2VDdXJyZW50RmlsZSk7XG5cdFx0dGhpcy5fbGFzdE1ldGEgPSB7IHRleHQ6IHJlbGVhc2VOb3RlVGV4dCwgYmFzZSB9O1xuXHRcdGNvbnN0IGh0bWwgPSBhd2FpdCB0aGlzLnJlbmRlckJvZHkodGhpcy5fbGFzdE1ldGEpO1xuXHRcdGNvbnN0IHRpdGxlID0gbmxzLmxvY2FsaXplKCdyZWxlYXNlTm90ZXNJbnB1dE5hbWUnLCBcIlJlbGVhc2UgTm90ZXM6IHswfVwiLCB2ZXJzaW9uKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMuc2V0V2Vidmlld1RpdGxlKHRpdGxlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMud2Vidmlldy5zZXRIdG1sKGh0bWwpO1xuXHRcdFx0dGhpcy5fd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UucmV2ZWFsV2Vidmlldyh0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLCBhY3RpdmVFZGl0b3JQYW5lID8gYWN0aXZlRWRpdG9yUGFuZS5ncm91cCA6IHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCwgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzID0gdGhpcy5fd2Vidmlld1dvcmtiZW5jaFNlcnZpY2Uub3BlbldlYnZpZXcoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHR0cnlSZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG5cdFx0XHRcdFx0XHRlbmFibGVGaW5kV2lkZ2V0OiB0cnVlLFxuXHRcdFx0XHRcdFx0ZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHVzZUN1cnJlbnRGaWxlID8gZmFsc2UgOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGxvY2FsUmVzb3VyY2VSb290czogdXNlQ3VycmVudEZpbGUgPyBbYmFzZV0gOiBbXSxcblx0XHRcdFx0XHRcdGFsbG93U2NyaXB0czogdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWRcblx0XHRcdFx0fSxcblx0XHRcdFx0J3JlbGVhc2VOb3RlcycsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRDb2RpY29uLnZzY29kZSxcblx0XHRcdFx0eyBncm91cDogQUNUSVZFX0dST1VQLCBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLndlYnZpZXcub25EaWRDbGlja0xpbmsodXJpID0+IHRoaXMub25EaWRDbGlja0xpbmsoVVJJLnBhcnNlKHVyaSkpKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLndlYnZpZXcub25NZXNzYWdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5tZXNzYWdlLnR5cGUgPT09ICdzaG93UmVsZWFzZU5vdGVzJykge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd1cGRhdGUuc2hvd1JlbGVhc2VOb3RlcycsIGUubWVzc2FnZS52YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5tZXNzYWdlLnR5cGUgPT09ICdjbGlja1NldHRpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc3QgeCA9IHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXM/LndlYnZpZXcuY29udGFpbmVyLm9mZnNldExlZnQgKyBlLm1lc3NhZ2UudmFsdWUueDtcblx0XHRcdFx0XHRjb25zdCB5ID0gdGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcz8ud2Vidmlldy5jb250YWluZXIub2Zmc2V0VG9wICsgZS5tZXNzYWdlLnZhbHVlLnk7XG5cdFx0XHRcdFx0dGhpcy5fc2ltcGxlU2V0dGluZ1JlbmRlcmVyLnVwZGF0ZVNldHRpbmcoVVJJLnBhcnNlKGUubWVzc2FnZS52YWx1ZS51cmkpLCB4LCB5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcy5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzID0gdW5kZWZpbmVkO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLndlYnZpZXcuc2V0SHRtbChodG1sKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZFJlbGVhc2VOb3Rlcyh2ZXJzaW9uOiBzdHJpbmcsIHVzZUN1cnJlbnRGaWxlOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBtYXRjaCA9IC9eKFxcZCtcXC5cXGQrKVxcLi8uZXhlYyh2ZXJzaW9uKTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZlcnNpb25MYWJlbCA9IG1hdGNoWzFdLnJlcGxhY2UoL1xcLi9nLCAnXycpO1xuXHRcdGNvbnN0IGJhc2VVcmwgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vcmF3Jztcblx0XHRjb25zdCB1cmwgPSBgJHtiYXNlVXJsfS92JHt2ZXJzaW9uTGFiZWx9Lm1kYDtcblx0XHRjb25zdCB1bmFzc2lnbmVkID0gbmxzLmxvY2FsaXplKCd1bmFzc2lnbmVkJywgXCJ1bmFzc2lnbmVkXCIpO1xuXG5cdFx0Y29uc3QgZXNjYXBlTWRIdG1sID0gKHRleHQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRyZXR1cm4gZXNjYXBlKHRleHQpLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhdGNoS2V5YmluZGluZ3MgPSAodGV4dDogc3RyaW5nKTogc3RyaW5nID0+IHtcblx0XHRcdGNvbnN0IGtiID0gKG1hdGNoOiBzdHJpbmcsIGtiOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoa2IpO1xuXG5cdFx0XHRcdGlmICgha2V5YmluZGluZykge1xuXHRcdFx0XHRcdHJldHVybiBrYjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBrZXliaW5kaW5nLmdldExhYmVsKCkgfHwga2I7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBrYnN0eWxlID0gKG1hdGNoOiBzdHJpbmcsIGtiOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IEtleWJpbmRpbmdQYXJzZXIucGFyc2VLZXliaW5kaW5nKGtiKTtcblxuXHRcdFx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5hc3NpZ25lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZ3MgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5yZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nKTtcblxuXHRcdFx0XHRpZiAocmVzb2x2ZWRLZXliaW5kaW5ncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5hc3NpZ25lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNvbHZlZEtleWJpbmRpbmdzWzBdLmdldExhYmVsKCkgfHwgdW5hc3NpZ25lZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGtiQ29kZSA9IChtYXRjaDogc3RyaW5nLCBiaW5kaW5nOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBrYihtYXRjaCwgYmluZGluZyk7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlZCA/IGA8Y29kZSB0aXRsZT1cIiR7YmluZGluZ31cIj4ke2VzY2FwZU1kSHRtbChyZXNvbHZlZCl9PC9jb2RlPmAgOiByZXNvbHZlZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGtic3R5bGVDb2RlID0gKG1hdGNoOiBzdHJpbmcsIGJpbmRpbmc6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGtic3R5bGUobWF0Y2gsIGJpbmRpbmcpO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQgPyBgPGNvZGUgdGl0bGU9XCIke2JpbmRpbmd9XCI+JHtlc2NhcGVNZEh0bWwocmVzb2x2ZWQpfTwvY29kZT5gIDogcmVzb2x2ZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gdGV4dFxuXHRcdFx0XHQucmVwbGFjZSgvYGtiXFwoKFthLXouXFxkXFwtXSspXFwpYC9naSwga2JDb2RlKVxuXHRcdFx0XHQucmVwbGFjZSgvYGtic3R5bGVcXCgoW15cXCldKylcXClgL2dpLCBrYnN0eWxlQ29kZSlcblx0XHRcdFx0LnJlcGxhY2UoL2tiXFwoKFthLXouXFxkXFwtXSspXFwpL2dpLCAobWF0Y2gsIGJpbmRpbmcpID0+IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGtiKG1hdGNoLCBiaW5kaW5nKSkpXG5cdFx0XHRcdC5yZXBsYWNlKC9rYnN0eWxlXFwoKFteXFwpXSspXFwpL2dpLCAobWF0Y2gsIGJpbmRpbmcpID0+IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGtic3R5bGUobWF0Y2gsIGJpbmRpbmcpKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZldGNoUmVsZWFzZU5vdGVzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHRleHQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAodXNlQ3VycmVudEZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlID0gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpPy5nZXRNb2RlbCgpPy5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRcdHRleHQgPSBmaWxlID8gZmlsZS5zdWJzdHJpbmcoZmlsZS5pbmRleE9mKCcjJykpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRleHQgPSBhd2FpdCBhc1RleHRPckVycm9yKGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB1cmwsIGNhbGxTaXRlOiAncmVsZWFzZU5vdGVzRWRpdG9yLmZldGNoUmVsZWFzZU5vdGVzJyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCByZWxlYXNlIG5vdGVzJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGV4dCB8fCAoIS9eI1xccy8udGVzdCh0ZXh0KSAmJiAhdXNlQ3VycmVudEZpbGUpKSB7IC8vIHJlbGVhc2Ugbm90ZXMgYWx3YXlzIHN0YXJ0cyB3aXRoIGAjYCBmb2xsb3dlZCBieSB3aGl0ZXNwYWNlLCBleGNlcHQgd2hlbiB1c2luZyB0aGUgY3VycmVudCBmaWxlXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCByZWxlYXNlIG5vdGVzJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBwYXRjaEtleWJpbmRpbmdzKHRleHQpO1xuXHRcdH07XG5cblx0XHQvLyBEb24ndCBjYWNoZSB0aGUgY3VycmVudCBmaWxlXG5cdFx0aWYgKHVzZUN1cnJlbnRGaWxlKSB7XG5cdFx0XHRyZXR1cm4gZmV0Y2hSZWxlYXNlTm90ZXMoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9yZWxlYXNlTm90ZXNDYWNoZS5oYXModmVyc2lvbikpIHtcblx0XHRcdHRoaXMuX3JlbGVhc2VOb3Rlc0NhY2hlLnNldCh2ZXJzaW9uLCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBmZXRjaFJlbGVhc2VOb3RlcygpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWxlYXNlTm90ZXNDYWNoZS5kZWxldGUodmVyc2lvbik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVsZWFzZU5vdGVzQ2FjaGUuZ2V0KHZlcnNpb24pITtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDbGlja0xpbmsodXJpOiBVUkkpIHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5jb2RlU2V0dGluZykge1xuXHRcdFx0Ly8gaGFuZGxlZCBpbiByZWNlaXZlIG1lc3NhZ2Vcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hZGRHQVBhcmFtZXRlcnModXJpLCAnUmVsZWFzZU5vdGVzJylcblx0XHRcdFx0LnRoZW4odXBkYXRlZCA9PiB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4odXBkYXRlZCwgeyBhbGxvd0NvbW1hbmRzOiBbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgJ3N1bW1hcml6ZS5yZWxlYXNlLm5vdGVzJ10gfSkpXG5cdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkR0FQYXJhbWV0ZXJzKHVyaTogVVJJLCBvcmlnaW46IHN0cmluZywgZXhwZXJpbWVudCA9ICcxJyk6IFByb21pc2U8VVJJPiB7XG5cdFx0aWYgKHN1cHBvcnRzVGVsZW1ldHJ5KHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpICYmIGdldFRlbGVtZXRyeUxldmVsKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpIHtcblx0XHRcdGlmICh1cmkuc2NoZW1lID09PSAnaHR0cHMnICYmIHVyaS5hdXRob3JpdHkgPT09ICdjb2RlLnZpc3VhbHN0dWRpby5jb20nKSB7XG5cdFx0XHRcdHJldHVybiB1cmkud2l0aCh7IHF1ZXJ5OiBgJHt1cmkucXVlcnkgPyB1cmkucXVlcnkgKyAnJicgOiAnJ311dG1fc291cmNlPVZzQ29kZSZ1dG1fbWVkaXVtPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG9yaWdpbil9JnV0bV9jb250ZW50PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGV4cGVyaW1lbnQpfWAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlckJvZHkoZmlsZUNvbnRlbnQ6IHsgdGV4dDogc3RyaW5nOyBiYXNlOiBVUkkgfSkge1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRjb25zdCBwcm9jZXNzZWRDb250ZW50ID0gYXdhaXQgcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oZmlsZUNvbnRlbnQudGV4dCwgdGhpcy5fZXh0ZW5zaW9uU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLl9zaW1wbGVTZXR0aW5nUmVuZGVyZXIsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHkpO1xuXG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGNvbnN0IGNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblx0XHRjb25zdCBzaG93UmVsZWFzZU5vdGVzID0gQm9vbGVhbih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigndXBkYXRlLnNob3dSZWxlYXNlTm90ZXMnKSk7XG5cblx0XHRyZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuXHRcdDxodG1sPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxiYXNlIGhyZWY9XCIke2FzV2Vidmlld1VyaShmaWxlQ29udGVudC5iYXNlKS50b1N0cmluZyh0cnVlKX0vXCIgPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC10eXBlXCIgY29udGVudD1cInRleHQvaHRtbDtjaGFyc2V0PVVURi04XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7IGltZy1zcmMgaHR0cHM6IGRhdGE6OyBtZWRpYS1zcmMgaHR0cHM6OyBzdHlsZS1zcmMgJ25vbmNlLSR7bm9uY2V9JyBodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbTsgc2NyaXB0LXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuXHRcdFx0XHQ8c3R5bGUgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdCR7REVGQVVMVF9NQVJLRE9XTl9TVFlMRVN9XG5cdFx0XHRcdFx0JHtjc3N9XG5cblx0XHRcdFx0XHQvKiBjb2Rlc2V0dGluZyAqL1xuXG5cdFx0XHRcdFx0Y29kZTpoYXMoLmNvZGVzZXR0aW5nKSB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtdGV4dFByZWZvcm1hdC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtdGV4dFByZWZvcm1hdC1mb3JlZ3JvdW5kKTtcblx0XHRcdFx0XHRcdHBhZGRpbmctbGVmdDogMXB4O1xuXHRcdFx0XHRcdFx0bWFyZ2luLXJpZ2h0OiAzcHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXJpZ2h0OiAwcHg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29kZTpoYXMoLmNvZGVzZXR0aW5nKTpmb2N1cyB7XG5cdFx0XHRcdFx0XHRib3JkZXI6IDFweCBzb2xpZCB2YXIoLS12c2NvZGUtYnV0dG9uLWJvcmRlciwgdHJhbnNwYXJlbnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC5jb2Rlc2V0dGluZyB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLXRleHRQcmVmb3JtYXQtZm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nOiAwcHggMXB4IDFweCAwcHg7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDBweDtcblx0XHRcdFx0XHRcdG92ZXJmbG93OiBoaWRkZW47XG5cdFx0XHRcdFx0XHR0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcblx0XHRcdFx0XHRcdG91dGxpbmUtb2Zmc2V0OiAycHggIWltcG9ydGFudDtcblx0XHRcdFx0XHRcdGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdFx0XHR0ZXh0LWFsaWduOiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBpbmxpbmU7XG5cdFx0XHRcdFx0XHRtYXJnaW4tcmlnaHQ6IDNweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LmNvZGVzZXR0aW5nIHN2ZyB7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDEycHg7XG5cdFx0XHRcdFx0XHR0ZXh0LWFsaWduOiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdFx0XHRib3JkZXI6IDFweCBzb2xpZCB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUJvcmRlciwgdHJhbnNwYXJlbnQpO1xuXHRcdFx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuXHRcdFx0XHRcdFx0bGluZS1oZWlnaHQ6IDlweDtcblx0XHRcdFx0XHRcdG1hcmdpbi1ib3R0b206IC01cHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWxlZnQ6IDBweDtcblx0XHRcdFx0XHRcdHBhZGRpbmctdG9wOiAycHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogMnB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogMnB4O1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogaW5saW5lLWJsb2NrO1xuXHRcdFx0XHRcdFx0dGV4dC1kZWNvcmF0aW9uOiBub25lO1xuXHRcdFx0XHRcdFx0dGV4dC1yZW5kZXJpbmc6IGF1dG87XG5cdFx0XHRcdFx0XHR0ZXh0LXRyYW5zZm9ybTogbm9uZTtcblx0XHRcdFx0XHRcdC13ZWJraXQtZm9udC1zbW9vdGhpbmc6IGFudGlhbGlhc2VkO1xuXHRcdFx0XHRcdFx0LW1vei1vc3gtZm9udC1zbW9vdGhpbmc6IGdyYXlzY2FsZTtcblx0XHRcdFx0XHRcdHVzZXItc2VsZWN0OiBub25lO1xuXHRcdFx0XHRcdFx0LXdlYmtpdC11c2VyLXNlbGVjdDogbm9uZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LmNvZGVzZXR0aW5nIC5zZXR0aW5nLW5hbWUge1xuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiAxM3B4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1sZWZ0OiAycHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXJpZ2h0OiAzcHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXRvcDogMXB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDFweDtcblx0XHRcdFx0XHRcdG1hcmdpbi10b3A6IC0zcHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC5jb2Rlc2V0dGluZzpob3ZlciB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLXRleHRQcmVmb3JtYXQtZm9yZWdyb3VuZCkgIWltcG9ydGFudDtcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb2RlOmhhcyguY29kZXNldHRpbmcpOmhvdmVyIHtcblx0XHRcdFx0XHRcdGZpbHRlcjogYnJpZ2h0bmVzcygxNDAlKTtcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQuY29kZXNldHRpbmc6Zm9jdXMge1xuXHRcdFx0XHRcdFx0b3V0bGluZTogMCAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdFx0dGV4dC1kZWNvcmF0aW9uOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1ob3ZlckZvcmVncm91bmQpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC5jb2Rlc2V0dGluZyAuc2VwYXJhdG9yIHtcblx0XHRcdFx0XHRcdHdpZHRoOiAxcHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDE0cHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tYm90dG9tOiAtM3B4O1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogaW5saW5lLWJsb2NrO1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMTJweDtcblx0XHRcdFx0XHRcdG1hcmdpbi1yaWdodDogNHB4O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGhlYWRlciB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IHBhZGRpbmctdG9wOiAxZW07IH1cblxuXHRcdFx0XHRcdC8qIFJlbGVhc2Ugbm90ZXMgZW5oYW5jZW1lbnRzIGZyb20gdnNjb2RlLWRvY3MgKi9cblx0XHRcdFx0XHRodG1sIHtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMTBweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0XHRcdG92ZXJzY3JvbGwtYmVoYXZpb3I6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ym9keSB7XG5cdFx0XHRcdFx0XHRtYXJnaW46IDAgYXV0bztcblx0XHRcdFx0XHRcdG1heC13aWR0aDogOTgwcHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IGF1dG87XG5cdFx0XHRcdFx0XHRvdmVyZmxvdy15OiBhdXRvO1xuXHRcdFx0XHRcdFx0b3ZlcnNjcm9sbC1iZWhhdmlvcjogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBTY3JvbGwgdG8gdG9wIGJ1dHRvbiAqL1xuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDtcblx0XHRcdFx0XHRcdHdpZHRoOiA0MHB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiA0MHB4O1xuXHRcdFx0XHRcdFx0cmlnaHQ6IDI1cHg7XG5cdFx0XHRcdFx0XHRib3R0b206IDI1cHg7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQsICM0NDQpO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWJvcmRlcik7XG5cdFx0XHRcdFx0XHRib3JkZXItcmFkaXVzOiA1MCU7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiAxcHggMXB4IDFweCByZ2JhKDAsMCwwLC4yNSk7XG5cdFx0XHRcdFx0XHRvdXRsaW5lOiBub25lO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdFx0XHRcdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRcdFx0XHRcdFx0YWxpZ24taXRlbXM6IGNlbnRlcjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcDpob3ZlciB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWhvdmVyQmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiAycHggMnB4IDJweCByZ2JhKDAsMCwwLC4yNSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ym9keS52c2NvZGUtaGlnaC1jb250cmFzdCAjc2Nyb2xsLXRvLXRvcCB7XG5cdFx0XHRcdFx0XHRib3JkZXItd2lkdGg6IDJweDtcblx0XHRcdFx0XHRcdGJvcmRlci1zdHlsZTogc29saWQ7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wIHNwYW4uaWNvbjo6YmVmb3JlIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFwiXCI7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1idXR0b24tZm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHQvKiBDaGV2cm9uIHVwIGljb24gKi9cblx0XHRcdFx0XHRcdC13ZWJraXQtbWFzay1pbWFnZTogdXJsKCdkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBEOTRiV3dnZG1WeWMybHZiajBpTVM0d0lpQmxibU52WkdsdVp6MGlkWFJtTFRnaVB6NEtQQ0V0TFNCSFpXNWxjbUYwYjNJNklFRmtiMkpsSUVsc2JIVnpkSEpoZEc5eUlERTVMakl1TUN3Z1UxWkhJRVY0Y0c5eWRDQlFiSFZuTFVsdUlDNGdVMVpISUZabGNuTnBiMjQ2SURZdU1EQWdRblZwYkdRZ01Da2dJQzB0UGdvOGMzWm5JSFpsY25OcGIyNDlJakV1TVNJZ2FXUTlJa3hoZVdWeVh6RWlJSGh0Ykc1elBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHlNREF3TDNOMlp5SWdlRzFzYm5NNmVHeHBibXM5SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpFNU9Ua3ZlR3hwYm1zaUlIZzlJakJ3ZUNJZ2VUMGlNSEI0SWdvSklIWnBaWGRDYjNnOUlqQWdNQ0F4TmlBeE5pSWdjM1I1YkdVOUltVnVZV0pzWlMxaVlXTnJaM0p2ZFc1a09tNWxkeUF3SURBZ01UWWdNVFk3SWlCNGJXdzZjM0JoWTJVOUluQnlaWE5sY25abElqNEtQSE4wZVd4bElIUjVjR1U5SW5SbGVIUXZZM056SWo0S0NTNXpkREI3Wm1sc2JEb2pSa1pHUmtaR08zMEtDUzV6ZERGN1ptbHNiRHB1YjI1bE8zMEtQQzl6ZEhsc1pUNEtQSFJwZEd4bFBuVndZMmhsZG5KdmJqd3ZkR2wwYkdVK0NqeHdZWFJvSUdOc1lYTnpQU0p6ZERBaUlHUTlJazA0TERVdU1Xd3ROeTR6TERjdU0wd3dMREV4TGpac09DMDRiRGdzT0d3dE1DNDNMREF1TjB3NExEVXVNWG9pTHo0S1BISmxZM1FnWTJ4aGMzTTlJbk4wTVNJZ2QybGtkR2c5SWpFMklpQm9aV2xuYUhROUlqRTJJaTgrQ2p3dmMzWm5QZ289Jyk7XG5cdFx0XHRcdFx0XHRtYXNrLWltYWdlOiB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEQ5NGJXd2dkbVZ5YzJsdmJqMGlNUzR3SWlCbGJtTnZaR2x1WnowaWRYUm1MVGdpUHo0S1BDRXRMU0JIWlc1bGNtRjBiM0k2SUVGa2IySmxJRWxzYkhWemRISmhkRzl5SURFNUxqSXVNQ3dnVTFaSElFVjRjRzl5ZENCUWJIVm5MVWx1SUM0Z1UxWkhJRlpsY25OcGIyNDZJRFl1TURBZ1FuVnBiR1FnTUNrZ0lDMHRQZ284YzNabklIWmxjbk5wYjI0OUlqRXVNU0lnYVdROUlreGhlV1Z5WHpFaUlIaHRiRzV6UFNKb2RIUndPaTh2ZDNkM0xuY3pMbTl5Wnk4eU1EQXdMM04yWnlJZ2VHMXNibk02ZUd4cGJtczlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5MekU1T1RrdmVHeHBibXNpSUhnOUlqQndlQ0lnZVQwaU1IQjRJZ29KSUhacFpYZENiM2c5SWpBZ01DQXhOaUF4TmlJZ2MzUjViR1U5SW1WdVlXSnNaUzFpWVdOclozSnZkVzVrT201bGR5QXdJREFnTVRZZ01UWTdJaUI0Yld3NmMzQmhZMlU5SW5CeVpYTmxjblpsSWo0S1BITjBlV3hsSUhSNWNHVTlJblJsZUhRdlkzTnpJajRLQ1M1emREQjdabWxzYkRvalJrWkdSa1pHTzMwS0NTNXpkREY3Wm1sc2JEcHViMjVsTzMwS1BDOXpkSGxzWlQ0S1BIUnBkR3hsUG5Wd1kyaGxkbkp2Ymp3dmRHbDBiR1UrQ2p4d1lYUm9JR05zWVhOelBTSnpkREFpSUdROUlrMDRMRFV1TVd3dE55NHpMRGN1TTB3d0xERXhMalpzT0MwNGJEZ3NPR3d0TUM0M0xEQXVOMHc0TERVdU1Yb2lMejRLUEhKbFkzUWdZMnhoYzNNOUluTjBNU0lnZDJsa2RHZzlJakUySWlCb1pXbG5hSFE5SWpFMklpOCtDand2YzNablBnbz0nKTtcblx0XHRcdFx0XHRcdHdpZHRoOiAxNnB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxNnB4O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8qIEhlYWRlciBzdHlsaW5nICovXG5cdFx0XHRcdFx0aDIge1xuXHRcdFx0XHRcdFx0bWFyZ2luLXRvcDogMS4yZW07XG5cdFx0XHRcdFx0XHRzY3JvbGwtbWFyZ2luLXRvcDogMS4yZW07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aDI6bm90KDpmaXJzdC1vZi10eXBlKSB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiA0ZW07XG5cdFx0XHRcdFx0XHRzY3JvbGwtbWFyZ2luLXRvcDogMWVtO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGgzIHtcblx0XHRcdFx0XHRcdG1hcmdpbi10b3A6IDRlbTtcblx0XHRcdFx0XHRcdHNjcm9sbC1tYXJnaW4tdG9wOiAxZW07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aDIgKyBoMyB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiAwO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8qIEhpZ2hsaWdodHMgdGFibGUgc3R5bGluZyAqL1xuXHRcdFx0XHRcdC5oaWdobGlnaHRzLXRhYmxlIHtcblx0XHRcdFx0XHRcdGJvcmRlci1jb2xsYXBzZTogY29sbGFwc2U7XG5cdFx0XHRcdFx0XHRib3JkZXI6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LmhpZ2hsaWdodHMtdGFibGUgdGgge1xuXHRcdFx0XHRcdFx0dmVydGljYWwtYWxpZ246IHRvcDtcblx0XHRcdFx0XHRcdGJvcmRlcjogbm9uZTtcblx0XHRcdFx0XHRcdHBhZGRpbmctdG9wOiAyZW07XG5cdFx0XHRcdFx0XHRmb250LXdlaWdodDogYm9sZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQuaGlnaGxpZ2h0cy10YWJsZSB0ZCB7XG5cdFx0XHRcdFx0XHR2ZXJ0aWNhbC1hbGlnbjogdG9wO1xuXHRcdFx0XHRcdFx0Ym9yZGVyOiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC5oaWdobGlnaHRzLXRhYmxlIHRyOm50aC1jaGlsZCgyKSB0ZCB7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogMWVtO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8qIE1haW4gY29udGVudCBsYXlvdXQgKi9cblx0XHRcdFx0XHQudG9jLW5hdi1sYXlvdXQge1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdFx0XHRcdGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8qIFRPQyBOYXZpZ2F0aW9uICovXG5cdFx0XHRcdFx0I3RvYy1uYXYge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IHN0aWNreTtcblx0XHRcdFx0XHRcdHRvcDogMjBweDtcblx0XHRcdFx0XHRcdHdpZHRoOiAxMHZ3O1xuXHRcdFx0XHRcdFx0bWluLXdpZHRoOiAxMjBweDtcblx0XHRcdFx0XHRcdG1hcmdpbi1yaWdodDogMzJweDtcblx0XHRcdFx0XHRcdG1hcmdpbi10b3A6IDJlbTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjdG9jLW5hdiA+IGRpdiB7XG5cdFx0XHRcdFx0XHRmb250LXdlaWdodDogYm9sZDtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMWVtO1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJvdHRvbTogMWVtO1xuXHRcdFx0XHRcdFx0dGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjdG9jLW5hdiB1bCB7XG5cdFx0XHRcdFx0XHRsaXN0LXN0eWxlOiBub25lO1xuXHRcdFx0XHRcdFx0cGFkZGluZzogMDtcblx0XHRcdFx0XHRcdG1hcmdpbjogMDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjdG9jLW5hdiB1bCBsaSB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tYm90dG9tOiAwLjVlbTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjdG9jLW5hdiBhIHtcblx0XHRcdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZvcmVncm91bmQsICNjY2MpO1xuXHRcdFx0XHRcdFx0dGV4dC1kZWNvcmF0aW9uOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0XHR0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kLWNvbG9yIDAuMnMsIGNvbG9yIDAuMnM7XG5cdFx0XHRcdFx0XHRwYWRkaW5nOiA0cHggNnB4O1xuXHRcdFx0XHRcdFx0bWFyZ2luOiAtNHB4IC02cHg7XG5cdFx0XHRcdFx0XHRib3JkZXItcmFkaXVzOiA0cHg7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0XHRcdG91dGxpbmU6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3RvYy1uYXYgYTpob3ZlciB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCwgIzExNzdiYik7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlGb3JlZ3JvdW5kLCAjZmZmZmZmKTtcblx0XHRcdFx0XHRcdGN1cnNvcjogcG9pbnRlcjtcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8qIE1haW4gY29udGVudCBhcmVhICovXG5cdFx0XHRcdFx0Lm5vdGVzLW1haW4ge1xuXHRcdFx0XHRcdFx0ZmxleDogMTtcblx0XHRcdFx0XHRcdG1pbi13aWR0aDogMDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBSZXNwb25zaXZlIGJyZWFrcG9pbnQgLSBIaWRlIFRPQyBvbiBzbWFsbGVyIHNjcmVlbnMgKi9cblx0XHRcdFx0XHRAbWVkaWEgKG1heC13aWR0aDogNTc2cHgpIHtcblx0XHRcdFx0XHRcdCN0b2MtbmF2IHtcblx0XHRcdFx0XHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0LnRvYy1uYXYtbGF5b3V0IHtcblx0XHRcdFx0XHRcdFx0ZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Lm5vdGVzLW1haW4ge1xuXHRcdFx0XHRcdFx0XHRtYXJnaW4tbGVmdDogMDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQke3Byb2Nlc3NlZENvbnRlbnR9XG5cdFx0XHRcdDxzY3JpcHQgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdGNvbnN0IHZzY29kZSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblx0XHRcdFx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblxuXHRcdFx0XHRcdGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcblx0XHRcdFx0XHRpbnB1dC50eXBlID0gJ2NoZWNrYm94Jztcblx0XHRcdFx0XHRpbnB1dC5pZCA9ICdzaG93UmVsZWFzZU5vdGVzJztcblx0XHRcdFx0XHRpbnB1dC5jaGVja2VkID0gJHtzaG93UmVsZWFzZU5vdGVzfTtcblx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsYWJlbCcpO1xuXHRcdFx0XHRcdGxhYmVsLmh0bWxGb3IgPSAnc2hvd1JlbGVhc2VOb3Rlcyc7XG5cdFx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSAnJHtubHMubG9jYWxpemUoJ3Nob3dPblVwZGF0ZScsIFwiU2hvdyByZWxlYXNlIG5vdGVzIGFmdGVyIGFuIHVwZGF0ZVwiKX0nO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHRcdFx0XHRjb25zdCBiZWZvcmVFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImJvZHkgPiBoMVwiKT8ubmV4dEVsZW1lbnRTaWJsaW5nO1xuXHRcdFx0XHRcdGlmIChiZWZvcmVFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRkb2N1bWVudC5ib2R5Lmluc2VydEJlZm9yZShjb250YWluZXIsIGJlZm9yZUVsZW1lbnQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBldmVudCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnc2hvd1JlbGVhc2VOb3RlcycpIHtcblx0XHRcdFx0XHRcdFx0aW5wdXQuY2hlY2tlZCA9IGV2ZW50LmRhdGEudmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBldmVudCA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBocmVmID0gZXZlbnQudGFyZ2V0LmhyZWYgPz8gZXZlbnQudGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmhyZWYgPz8gZXZlbnQudGFyZ2V0LnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ/LmhyZWY7XG5cdFx0XHRcdFx0XHRpZiAoaHJlZiAmJiAoaHJlZi5zdGFydHNXaXRoKCcke1NjaGVtYXMuY29kZVNldHRpbmd9JykpKSB7XG5cdFx0XHRcdFx0XHRcdHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdjbGlja1NldHRpbmcnLCB2YWx1ZTogeyB1cmk6IGhyZWYsIHg6IGV2ZW50LmNsaWVudFgsIHk6IGV2ZW50LmNsaWVudFkgfX0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IDEzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChldmVudC50YXJnZXQuY2hpbGRyZW4ubGVuZ3RoID4gMCAmJiBldmVudC50YXJnZXQuY2hpbGRyZW5bMF0uaHJlZikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNsaWVudFJlY3QgPSBldmVudC50YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdFx0XHRcdFx0dnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ2NsaWNrU2V0dGluZycsIHZhbHVlOiB7IHVyaTogZXZlbnQudGFyZ2V0LmNoaWxkcmVuWzBdLmhyZWYsIHg6IGNsaWVudFJlY3QucmlnaHQgLCB5OiBjbGllbnRSZWN0LmJvdHRvbSB9fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGV2ZW50ID0+IHtcblx0XHRcdFx0XHRcdHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdzaG93UmVsZWFzZU5vdGVzJywgdmFsdWU6IGlucHV0LmNoZWNrZWQgfSwgJyonKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0PC9zY3JpcHQ+XG5cdFx0XHQ8L2JvZHk+XG5cdFx0PC9odG1sPmA7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3VwZGF0ZS5zaG93UmVsZWFzZU5vdGVzJykpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hXZWJ2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUFjdGl2ZVdlYnZpZXdFZGl0b3IoaW5wdXQ6IFdlYnZpZXdJbnB1dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChpbnB1dCAmJiBpbnB1dCA9PT0gdGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcykge1xuXHRcdFx0dGhpcy51cGRhdGVDaGVja2JveFdlYnZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZWNrYm94V2VidmlldygpIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcykge1xuXHRcdFx0dGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcy53ZWJ2aWV3LnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0dHlwZTogJ3Nob3dSZWxlYXNlTm90ZXMnLFxuXHRcdFx0XHR2YWx1ZTogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3VwZGF0ZS5zaG93UmVsZWFzZU5vdGVzJylcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFByb2Nlc3NlcyBjb25kaXRpb25hbCBibG9ja3MgaW4gdGhlIHJlbGVhc2Ugbm90ZXMgbWFya2Rvd24uXG4gKlxuICogQ29uZGl0aW9uYWwgYmxvY2tzIHVzZSBhIHNpbmdsZSBIVE1MIGNvbW1lbnQgd2l0aCB0aGUgZm9ybWF0OlxuICogYGBgXG4gKiA8IS0tICVJRiBDT05ESVRJT04gJVxuICogQ29udGVudCBvbmx5IHZpc2libGUgd2hlbiBDT05ESVRJT04gaXMgYWN0aXZlLlxuICogJUVORElGICUgLS0+XG4gKiBgYGBcbiAqXG4gKiBTdXBwb3J0ZWQgY29uZGl0aW9uczpcbiAqIC0gYElOX1BST0RVQ1RgIC0gQ29udGVudCBzaG93biBpbiBWUyBDb2RlIChib3RoIFN0YWJsZSBhbmQgSW5zaWRlcnMpXG4gKiAtIGBXRUJgIC0gQ29udGVudCBzaG93biBvbiB0aGUgd2Vic2l0ZSBvbmx5XG4gKiAtIGBTVEFCTEVgIC0gQ29udGVudCBzaG93biBpbiBWUyBDb2RlIFN0YWJsZSBvbmx5XG4gKiAtIGBJTlNJREVSU2AgLSBDb250ZW50IHNob3duIGluIFZTIENvZGUgSW5zaWRlcnMgb25seVxuICpcbiAqIE9uIHRoZSB3ZWJzaXRlLCB0aGUgZW50aXJlIGJsb2NrIGlzIGEgc2luZ2xlIEhUTUwgY29tbWVudCwgc28gdGhlXG4gKiBjb250ZW50IGlzIGhpZGRlbiBieSBkZWZhdWx0LiBUaGUgd2Vic2l0ZSByZW5kZXJlciB3b3VsZCBhY3RpdmF0ZVxuICogYFdFQmAgYmxvY2tzIGJ5IHN0cmlwcGluZyB0aGUgY29tbWVudCBtYXJrZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQ6IHN0cmluZywgYWN0aXZlQ29uZGl0aW9uczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0LnJlcGxhY2UoXG5cdFx0LzwhLS1cXHMqJUlGXFxzKyhcXHcrKVxccyolKFtcXHNcXFNdKj8pJUVORElGXFxzKiVcXHMqLS0+L2dpLFxuXHRcdChfbWF0Y2gsIGNvbmRpdGlvbjogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpID0+IHtcblx0XHRcdGlmIChhY3RpdmVDb25kaXRpb25zLmhhcyhjb25kaXRpb24udG9VcHBlckNhc2UoKSkpIHtcblx0XHRcdFx0Ly8gU3RyaXAgY29tbWVudCBtYXJrZXJzLCByZXZlYWwgY29udGVudFxuXHRcdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHRcdH1cblx0XHRcdC8vIFJlbW92ZSB0aGUgZW50aXJlIGJsb2NrXG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oXG5cdHRleHQ6IHN0cmluZyxcblx0ZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0c2ltcGxlU2V0dGluZ1JlbmRlcmVyOiBTaW1wbGVTZXR0aW5nUmVuZGVyZXIsXG5cdHF1YWxpdHk/OiBzdHJpbmcsXG4pOiBQcm9taXNlPFRydXN0ZWRIVE1MPiB7XG5cdC8vIFJlbW92ZSBIVE1MIGNvbW1lbnQgbWFya2VycyBhcm91bmQgdGFibGUgb2YgY29udGVudHMgbmF2aWdhdGlvblxuXHR0ZXh0ID0gdGV4dFxuXHRcdC50b1N0cmluZygpXG5cdFx0LnJlcGxhY2UoLzwhLS1cXHMqVE9DXFxzKi9naSwgJycpXG5cdFx0LnJlcGxhY2UoL1xccypOYXZpZ2F0aW9uIEVuZFxccyotLT4vZ2ksICcnKTtcblxuXHQvLyBQcm9jZXNzIGNvbmRpdGlvbmFsIGJsb2NrcyBiYXNlZCBvbiBhY3RpdmUgY29uZGl0aW9uc1xuXHRjb25zdCBhY3RpdmVDb25kaXRpb25zID0gbmV3IFNldDxzdHJpbmc+KFsnSU5fUFJPRFVDVCddKTtcblx0aWYgKHF1YWxpdHkgPT09ICdzdGFibGUnKSB7XG5cdFx0YWN0aXZlQ29uZGl0aW9ucy5hZGQoJ1NUQUJMRScpO1xuXHR9IGVsc2UgaWYgKHF1YWxpdHkgPT09ICdpbnNpZGVyJykge1xuXHRcdGFjdGl2ZUNvbmRpdGlvbnMuYWRkKCdJTlNJREVSUycpO1xuXHR9XG5cdHRleHQgPSBwcm9jZXNzQ29uZGl0aW9uYWxCbG9ja3ModGV4dCwgYWN0aXZlQ29uZGl0aW9ucyk7XG5cblx0cmV0dXJuIHJlbmRlck1hcmtkb3duRG9jdW1lbnQodGV4dCwgZXh0ZW5zaW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCB7XG5cdFx0c2FuaXRpemVyQ29uZmlnOiB7XG5cdFx0XHRhbGxvd1JlbGF0aXZlTWVkaWFQYXRoczogdHJ1ZSxcblx0XHRcdGFsbG93ZWRMaW5rUHJvdG9jb2xzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzLCBTY2hlbWFzLmNvbW1hbmQsIFNjaGVtYXMuY29kZVNldHRpbmddXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dlZFRhZ3M6IHsgYXVnbWVudDogWyduYXYnLCAnc3ZnJywgJ3BhdGgnXSB9LFxuXHRcdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHsgYXVnbWVudDogWydhcmlhLXJvbGUnLCAndmlld0JveCcsICdmaWxsJywgJ3htbG5zJywgJ2QnXSB9XG5cdFx0fSxcblx0XHRtYXJrZWRFeHRlbnNpb25zOiBbe1xuXHRcdFx0cmVuZGVyZXI6IHtcblx0XHRcdFx0aHRtbDogc2ltcGxlU2V0dGluZ1JlbmRlcmVyLmdldEh0bWxSZW5kZXJlcigpLFxuXHRcdFx0XHRjb2Rlc3Bhbjogc2ltcGxlU2V0dGluZ1JlbmRlcmVyLmdldENvZGVTcGFuUmVuZGVyZXIoKSxcblx0XHRcdH1cblx0XHR9XVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZSx1QkFBdUI7QUFDL0MsU0FBUyx5QkFBeUIsOEJBQThCO0FBRWhFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYyxzQkFBc0I7QUFDN0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQW9DLDZCQUE2QjtBQUNqRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFFdEIsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFPbkQsWUFDdUMscUJBQ0Qsb0JBQ0Ysa0JBQ0YsZ0JBQ0MsaUJB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QUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BK1BKLGdCQUFnQjtBQUFBLHFCQUNELEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsdUJBU0gsZ0JBQWdCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSw0QkFLWCxJQUFJLFNBQVMsZ0JBQWdCLG9DQUFvQyxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNDQWtCeEQsUUFBUSxXQUFXO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQW9CeEQ7QUFBQSxFQUVRLHlCQUF5QixHQUFvQztBQUNwRSxRQUFJLEVBQUUscUJBQXFCLHlCQUF5QixHQUFHO0FBQ3RELFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFUSwrQkFBK0IsT0FBdUM7QUFDN0UsUUFBSSxTQUFTLFVBQVUsS0FBSyxzQkFBc0I7QUFDakQsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdCQUF3QjtBQUMvQixRQUFJLEtBQUssc0JBQXNCO0FBQzlCLFdBQUsscUJBQXFCLFFBQVEsWUFBWTtBQUFBLFFBQzdDLE1BQU07QUFBQSxRQUNOLE9BQU8sS0FBSyxzQkFBc0IsU0FBa0IseUJBQXlCO0FBQUEsTUFDOUUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUE3akJhLHNCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEJVO0FBbWxCTixTQUFTLHlCQUF5QixNQUFjLGtCQUErQztBQUNyRyxTQUFPLEtBQUs7QUFBQSxJQUNYO0FBQUEsSUFDQSxDQUFDLFFBQVEsV0FBbUIsWUFBb0I7QUFDL0MsVUFBSSxpQkFBaUIsSUFBSSxVQUFVLFlBQVksQ0FBQyxHQUFHO0FBRWxELGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxlQUFzQiwyQkFDckIsTUFDQSxrQkFDQSxpQkFDQSx1QkFDQSxTQUN1QjtBQUV2QixTQUFPLEtBQ0wsU0FBUyxFQUNULFFBQVEsbUJBQW1CLEVBQUUsRUFDN0IsUUFBUSw2QkFBNkIsRUFBRTtBQUd6QyxRQUFNLG1CQUFtQixvQkFBSSxJQUFZLENBQUMsWUFBWSxDQUFDO0FBQ3ZELE1BQUksWUFBWSxVQUFVO0FBQ3pCLHFCQUFpQixJQUFJLFFBQVE7QUFBQSxFQUM5QixXQUFXLFlBQVksV0FBVztBQUNqQyxxQkFBaUIsSUFBSSxVQUFVO0FBQUEsRUFDaEM7QUFDQSxTQUFPLHlCQUF5QixNQUFNLGdCQUFnQjtBQUV0RCxTQUFPLHVCQUF1QixNQUFNLGtCQUFrQixpQkFBaUI7QUFBQSxJQUN0RSxpQkFBaUI7QUFBQSxNQUNoQix5QkFBeUI7QUFBQSxNQUN6QixzQkFBc0I7QUFBQSxRQUNyQixVQUFVLENBQUMsUUFBUSxNQUFNLFFBQVEsT0FBTyxRQUFRLFNBQVMsUUFBUSxXQUFXO0FBQUEsTUFDN0U7QUFBQSxNQUNBLGFBQWEsRUFBRSxTQUFTLENBQUMsT0FBTyxPQUFPLE1BQU0sRUFBRTtBQUFBLE1BQy9DLG1CQUFtQixFQUFFLFNBQVMsQ0FBQyxhQUFhLFdBQVcsUUFBUSxTQUFTLEdBQUcsRUFBRTtBQUFBLElBQzlFO0FBQUEsSUFDQSxrQkFBa0IsQ0FBQztBQUFBLE1BQ2xCLFVBQVU7QUFBQSxRQUNULE1BQU0sc0JBQXNCLGdCQUFnQjtBQUFBLFFBQzVDLFVBQVUsc0JBQXNCLG9CQUFvQjtBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0Y7IiwKICAibmFtZXMiOiBbIm1hdGNoIiwgImtiIl0KfQo=
