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
import { generateUuid } from "../../../../base/common/uuid.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { language } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { asWebviewUri } from "../../webview/common/webview.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { gettingStartedContentRegistry } from "../common/gettingStartedContent.js";
let GettingStartedDetailsRenderer = class {
  constructor(fileService, notificationService, extensionService, languageService) {
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.languageService = languageService;
    this.mdCache = new ResourceMap();
    this.svgCache = new ResourceMap();
  }
  async renderMarkdown(path, base) {
    const content = await this.readAndCacheStepMarkdown(path, base);
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    const inDev = document.location.protocol === "http:";
    const imgSrcCsp = inDev ? "img-src https: data: http:" : "img-src https: data:";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${imgSrcCsp}; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					body > img {
						align-self: flex-start;
					}
					body > img[centered] {
						align-self: center;
					}
					body {
						display: flex;
						flex-direction: column;
						padding: 0;
						height: inherit;
					}
					.theme-picker-row {
						display: flex;
						justify-content: center;
						gap: 32px;
					}
					checklist {
						display: flex;
						gap: 32px;
						flex-direction: column;
					}
					checkbox {
						display: flex;
						flex-direction: column;
						align-items: center;
						margin: 5px;
						cursor: pointer;
					}
					checkbox > img {
						margin-bottom: 8px !important;
					}
					checkbox.checked > img {
						box-sizing: border-box;
					}
					checkbox.checked > img {
						outline: 2px solid var(--vscode-focusBorder);
						outline-offset: 4px;
						border-radius: 4px;
					}
					.theme-picker-link {
						margin-top: 16px;
						color: var(--vscode-textLink-foreground);
					}
					blockquote > p:first-child {
						margin-top: 0;
					}
					body > * {
						margin-block-end: 0.25em;
						margin-block-start: 0.25em;
					}
					vertically-centered {
						padding-top: 5px;
						padding-bottom: 5px;
						display: flex;
						justify-content: center;
						flex-direction: column;
					}
					html {
						height: 100%;
						padding-right: 32px;
					}
					h1 {
						font-size: 19.5px;
					}
					h2 {
						font-size: 18.5px;
					}
				</style>
			</head>
			<body>
				<vertically-centered>
					${content}
				</vertically-centered>
			</body>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();

				document.querySelectorAll('[when-checked]').forEach(el => {
					el.addEventListener('click', () => {
						vscode.postMessage(el.getAttribute('when-checked'));
					});
				});

				let ongoingLayout = undefined;
				const doLayout = () => {
					document.querySelectorAll('vertically-centered').forEach(element => {
						element.style.marginTop = Math.max((document.body.clientHeight - element.scrollHeight) * 3/10, 0) + 'px';
					});
					ongoingLayout = undefined;
				};

				const layout = () => {
					if (ongoingLayout) {
						clearTimeout(ongoingLayout);
					}
					ongoingLayout = setTimeout(doLayout, 0);
				};

				layout();

				document.querySelectorAll('img').forEach(element => {
					element.onload = layout;
				})

				window.addEventListener('message', event => {
					if (event.data.layoutMeNow) {
						layout();
					}
					if (event.data.enabledContextKeys) {
						document.querySelectorAll('.checked').forEach(element => element.classList.remove('checked'))
						for (const key of event.data.enabledContextKeys) {
							document.querySelectorAll('[checked-on="' + key + '"]').forEach(element => element.classList.add('checked'))
						}
					}
				});
		<\/script>
		</html>`;
  }
  async renderSVG(path) {
    const content = await this.readAndCacheSVGFile(path);
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					svg {
						position: fixed;
						height: 100%;
						width: 80%;
						left: 50%;
						top: 50%;
						max-width: 530px;
						min-width: 350px;
						transform: translate(-50%,-50%);
					}
				</style>
			</head>
			<body>
				${content}
			</body>
		</html>`;
  }
  async renderVideo(path, poster, description) {
    const nonce = generateUuid();
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					video {
						max-width: 100%;
						max-height: 100%;
						object-fit: cover;
					}
				</style>
			</head>
			<body>
				<video controls autoplay ${poster ? `poster="${poster.toString(true)}"` : ""} muted ${description ? `aria-label="${description}"` : ""}>
					<source src="${path.toString(true)}" type="video/mp4">
				</video>
			</body>
		</html>`;
  }
  async readAndCacheSVGFile(path) {
    if (!this.svgCache.has(path)) {
      const contents = await this.readContentsOfPath(path, false);
      this.svgCache.set(path, contents);
    }
    return assertReturnsDefined(this.svgCache.get(path));
  }
  async readAndCacheStepMarkdown(path, base) {
    if (!this.mdCache.has(path)) {
      const contents = await this.readContentsOfPath(path);
      const markdownContents = await renderMarkdownDocument(transformUris(contents, base), this.extensionService, this.languageService, {
        sanitizerConfig: {
          allowedLinkProtocols: {
            override: "*"
          },
          allowedTags: {
            augment: [
              "select",
              "checkbox",
              "checklist"
            ]
          },
          allowedAttributes: {
            augment: [
              "x-dispatch",
              "data-command",
              "when-checked",
              "checked-on",
              "checked"
            ]
          }
        }
      });
      this.mdCache.set(path, markdownContents);
    }
    return assertReturnsDefined(this.mdCache.get(path));
  }
  async readContentsOfPath(path, useModuleId = true) {
    try {
      const moduleId = JSON.parse(path.query).moduleId;
      if (useModuleId && moduleId) {
        const contents = await new Promise((resolve, reject) => {
          const provider = gettingStartedContentRegistry.getProvider(moduleId);
          if (!provider) {
            reject(`Getting started: no provider registered for ${moduleId}`);
          } else {
            resolve(provider());
          }
        });
        return contents;
      }
    } catch {
    }
    try {
      const localizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${language}.md`) });
      const generalizedLocale = language?.replace(/-.*$/, "");
      const generalizedLocalizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${generalizedLocale}.md`) });
      const fileExists = (file) => this.fileService.stat(file).then((stat) => !!stat.size).catch(() => false);
      const [localizedFileExists, generalizedLocalizedFileExists] = await Promise.all([
        fileExists(localizedPath),
        fileExists(generalizedLocalizedPath)
      ]);
      const bytes = await this.fileService.readFile(
        localizedFileExists ? localizedPath : generalizedLocalizedFileExists ? generalizedLocalizedPath : path
      );
      return bytes.value.toString();
    } catch (e) {
      this.notificationService.error("Error reading markdown document at `" + path + "`: " + e);
      return "";
    }
  }
};
GettingStartedDetailsRenderer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ILanguageService)
], GettingStartedDetailsRenderer);
const transformUri = (src, base) => {
  const path = joinPath(base, src);
  return asWebviewUri(path).toString(true);
};
const transformUris = (content, base) => content.replace(/src="([^"]*)"/g, (_, src) => {
  if (src.startsWith("https://")) {
    return `src="${src}"`;
  }
  return `src="${transformUri(src, base)}"`;
}).replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, title, src) => {
  if (src.startsWith("https://")) {
    return `![${title}](${src})`;
  }
  return `![${title}](${transformUri(src, base)})`;
});
export {
  GettingStartedDetailsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWREZXRhaWxzUmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BUktET1dOX1NUWUxFUywgcmVuZGVyTWFya2Rvd25Eb2N1bWVudCB9IGZyb20gJy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgYXNXZWJ2aWV3VXJpIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9jb21tb24vd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGdldHRpbmdTdGFydGVkQ29udGVudFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL2dldHRpbmdTdGFydGVkQ29udGVudC5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIEdldHRpbmdTdGFydGVkRGV0YWlsc1JlbmRlcmVyIHtcblx0cHJpdmF0ZSBtZENhY2hlID0gbmV3IFJlc291cmNlTWFwPFRydXN0ZWRIVE1MPigpO1xuXHRwcml2YXRlIHN2Z0NhY2hlID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyByZW5kZXJNYXJrZG93bihwYXRoOiBVUkksIGJhc2U6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZEFuZENhY2hlU3RlcE1hcmtkb3duKHBhdGgsIGJhc2UpO1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXG5cdFx0Y29uc3QgY3NzID0gY29sb3JNYXAgPyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwKGNvbG9yTWFwKSA6ICcnO1xuXG5cdFx0Y29uc3QgaW5EZXYgPSBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2h0dHA6Jztcblx0XHRjb25zdCBpbWdTcmNDc3AgPSBpbkRldiA/ICdpbWctc3JjIGh0dHBzOiBkYXRhOiBodHRwOicgOiAnaW1nLXNyYyBodHRwczogZGF0YTonO1xuXG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cblx0XHQ8aHRtbD5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC10eXBlXCIgY29udGVudD1cInRleHQvaHRtbDtjaGFyc2V0PVVURi04XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7ICR7aW1nU3JjQ3NwfTsgbWVkaWEtc3JjIGh0dHBzOjsgc2NyaXB0LXNyYyAnbm9uY2UtJHtub25jZX0nOyBzdHlsZS1zcmMgJ25vbmNlLSR7bm9uY2V9JztcIj5cblx0XHRcdFx0PHN0eWxlIG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0XHQke0RFRkFVTFRfTUFSS0RPV05fU1RZTEVTfVxuXHRcdFx0XHRcdCR7Y3NzfVxuXHRcdFx0XHRcdGJvZHkgPiBpbWcge1xuXHRcdFx0XHRcdFx0YWxpZ24tc2VsZjogZmxleC1zdGFydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ym9keSA+IGltZ1tjZW50ZXJlZF0ge1xuXHRcdFx0XHRcdFx0YWxpZ24tc2VsZjogY2VudGVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRib2R5IHtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuXHRcdFx0XHRcdFx0cGFkZGluZzogMDtcblx0XHRcdFx0XHRcdGhlaWdodDogaW5oZXJpdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LnRoZW1lLXBpY2tlci1yb3cge1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdFx0XHRcdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRcdFx0XHRcdFx0Z2FwOiAzMnB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGVja2xpc3Qge1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdFx0XHRcdGdhcDogMzJweDtcblx0XHRcdFx0XHRcdGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNoZWNrYm94IHtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuXHRcdFx0XHRcdFx0YWxpZ24taXRlbXM6IGNlbnRlcjtcblx0XHRcdFx0XHRcdG1hcmdpbjogNXB4O1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGVja2JveCA+IGltZyB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tYm90dG9tOiA4cHggIWltcG9ydGFudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA+IGltZyB7XG5cdFx0XHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGVja2JveC5jaGVja2VkID4gaW1nIHtcblx0XHRcdFx0XHRcdG91dGxpbmU6IDJweCBzb2xpZCB2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIpO1xuXHRcdFx0XHRcdFx0b3V0bGluZS1vZmZzZXQ6IDRweDtcblx0XHRcdFx0XHRcdGJvcmRlci1yYWRpdXM6IDRweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LnRoZW1lLXBpY2tlci1saW5rIHtcblx0XHRcdFx0XHRcdG1hcmdpbi10b3A6IDE2cHg7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLXRleHRMaW5rLWZvcmVncm91bmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRibG9ja3F1b3RlID4gcDpmaXJzdC1jaGlsZCB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRib2R5ID4gKiB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tYmxvY2stZW5kOiAwLjI1ZW07XG5cdFx0XHRcdFx0XHRtYXJnaW4tYmxvY2stc3RhcnQ6IDAuMjVlbTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dmVydGljYWxseS1jZW50ZXJlZCB7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXRvcDogNXB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDVweDtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0XHRcdGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGh0bWwge1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogMzJweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aDEge1xuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiAxOS41cHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGgyIHtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMTguNXB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQ8dmVydGljYWxseS1jZW50ZXJlZD5cblx0XHRcdFx0XHQke2NvbnRlbnR9XG5cdFx0XHRcdDwvdmVydGljYWxseS1jZW50ZXJlZD5cblx0XHRcdDwvYm9keT5cblx0XHRcdDxzY3JpcHQgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRjb25zdCB2c2NvZGUgPSBhY3F1aXJlVnNDb2RlQXBpKCk7XG5cblx0XHRcdFx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3doZW4tY2hlY2tlZF0nKS5mb3JFYWNoKGVsID0+IHtcblx0XHRcdFx0XHRlbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcblx0XHRcdFx0XHRcdHZzY29kZS5wb3N0TWVzc2FnZShlbC5nZXRBdHRyaWJ1dGUoJ3doZW4tY2hlY2tlZCcpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bGV0IG9uZ29pbmdMYXlvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGRvTGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3ZlcnRpY2FsbHktY2VudGVyZWQnKS5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3AgPSBNYXRoLm1heCgoZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQgLSBlbGVtZW50LnNjcm9sbEhlaWdodCkgKiAzLzEwLCAwKSArICdweCc7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0b25nb2luZ0xheW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG9uZ29pbmdMYXlvdXQpIHtcblx0XHRcdFx0XHRcdGNsZWFyVGltZW91dChvbmdvaW5nTGF5b3V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b25nb2luZ0xheW91dCA9IHNldFRpbWVvdXQoZG9MYXlvdXQsIDApO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGxheW91dCgpO1xuXG5cdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2ltZycpLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0ZWxlbWVudC5vbmxvYWQgPSBsYXlvdXQ7XG5cdFx0XHRcdH0pXG5cblx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBldmVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmRhdGEubGF5b3V0TWVOb3cpIHtcblx0XHRcdFx0XHRcdGxheW91dCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZXZlbnQuZGF0YS5lbmFibGVkQ29udGV4dEtleXMpIHtcblx0XHRcdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGVja2VkJykuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hlY2tlZCcpKVxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZXZlbnQuZGF0YS5lbmFibGVkQ29udGV4dEtleXMpIHtcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2NoZWNrZWQtb249XCInICsga2V5ICsgJ1wiXScpLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoZWNrZWQnKSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdDwvc2NyaXB0PlxuXHRcdDwvaHRtbD5gO1xuXHR9XG5cblx0YXN5bmMgcmVuZGVyU1ZHKHBhdGg6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZEFuZENhY2hlU1ZHRmlsZShwYXRoKTtcblx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblxuXHRcdGNvbnN0IGNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblx0XHRyZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuXHRcdDxodG1sPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LXR5cGVcIiBjb250ZW50PVwidGV4dC9odG1sO2NoYXJzZXQ9VVRGLThcIj5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICdub25lJzsgaW1nLXNyYyBkYXRhOjsgc3R5bGUtc3JjICdub25jZS0ke25vbmNlfSc7XCI+XG5cdFx0XHRcdDxzdHlsZSBub25jZT1cIiR7bm9uY2V9XCI+XG5cdFx0XHRcdFx0JHtERUZBVUxUX01BUktET1dOX1NUWUxFU31cblx0XHRcdFx0XHQke2Nzc31cblx0XHRcdFx0XHRzdmcge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IGZpeGVkO1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHRcdFx0d2lkdGg6IDgwJTtcblx0XHRcdFx0XHRcdGxlZnQ6IDUwJTtcblx0XHRcdFx0XHRcdHRvcDogNTAlO1xuXHRcdFx0XHRcdFx0bWF4LXdpZHRoOiA1MzBweDtcblx0XHRcdFx0XHRcdG1pbi13aWR0aDogMzUwcHg7XG5cdFx0XHRcdFx0XHR0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLC01MCUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQke2NvbnRlbnR9XG5cdFx0XHQ8L2JvZHk+XG5cdFx0PC9odG1sPmA7XG5cdH1cblxuXHRhc3luYyByZW5kZXJWaWRlbyhwYXRoOiBVUkksIHBvc3Rlcj86IFVSSSwgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRyZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuXHRcdDxodG1sPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LXR5cGVcIiBjb250ZW50PVwidGV4dC9odG1sO2NoYXJzZXQ9VVRGLThcIj5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICdub25lJzsgaW1nLXNyYyBodHRwczo7IG1lZGlhLXNyYyBodHRwczo7IHNjcmlwdC1zcmMgJ25vbmNlLSR7bm9uY2V9Jzsgc3R5bGUtc3JjICdub25jZS0ke25vbmNlfSc7XCI+XG5cdFx0XHRcdDxzdHlsZSBub25jZT1cIiR7bm9uY2V9XCI+XG5cdFx0XHRcdFx0dmlkZW8ge1xuXHRcdFx0XHRcdFx0bWF4LXdpZHRoOiAxMDAlO1xuXHRcdFx0XHRcdFx0bWF4LWhlaWdodDogMTAwJTtcblx0XHRcdFx0XHRcdG9iamVjdC1maXQ6IGNvdmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQ8dmlkZW8gY29udHJvbHMgYXV0b3BsYXkgJHtwb3N0ZXIgPyBgcG9zdGVyPVwiJHtwb3N0ZXIudG9TdHJpbmcodHJ1ZSl9XCJgIDogJyd9IG11dGVkICR7ZGVzY3JpcHRpb24gPyBgYXJpYS1sYWJlbD1cIiR7ZGVzY3JpcHRpb259XCJgIDogJyd9PlxuXHRcdFx0XHRcdDxzb3VyY2Ugc3JjPVwiJHtwYXRoLnRvU3RyaW5nKHRydWUpfVwiIHR5cGU9XCJ2aWRlby9tcDRcIj5cblx0XHRcdFx0PC92aWRlbz5cblx0XHRcdDwvYm9keT5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZEFuZENhY2hlU1ZHRmlsZShwYXRoOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy5zdmdDYWNoZS5oYXMocGF0aCkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5yZWFkQ29udGVudHNPZlBhdGgocGF0aCwgZmFsc2UpO1xuXHRcdFx0dGhpcy5zdmdDYWNoZS5zZXQocGF0aCwgY29udGVudHMpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5zdmdDYWNoZS5nZXQocGF0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkQW5kQ2FjaGVTdGVwTWFya2Rvd24ocGF0aDogVVJJLCBiYXNlOiBVUkkpOiBQcm9taXNlPFRydXN0ZWRIVE1MPiB7XG5cdFx0aWYgKCF0aGlzLm1kQ2FjaGUuaGFzKHBhdGgpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMucmVhZENvbnRlbnRzT2ZQYXRoKHBhdGgpO1xuXHRcdFx0Y29uc3QgbWFya2Rvd25Db250ZW50cyA9IGF3YWl0IHJlbmRlck1hcmtkb3duRG9jdW1lbnQodHJhbnNmb3JtVXJpcyhjb250ZW50cywgYmFzZSksIHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHtcblx0XHRcdFx0c2FuaXRpemVyQ29uZmlnOiB7XG5cdFx0XHRcdFx0YWxsb3dlZExpbmtQcm90b2NvbHM6IHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlOiAnKidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsbG93ZWRUYWdzOiB7XG5cdFx0XHRcdFx0XHRhdWdtZW50OiBbXG5cdFx0XHRcdFx0XHRcdCdzZWxlY3QnLFxuXHRcdFx0XHRcdFx0XHQnY2hlY2tib3gnLFxuXHRcdFx0XHRcdFx0XHQnY2hlY2tsaXN0Jyxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdFx0XHRhdWdtZW50OiBbXG5cdFx0XHRcdFx0XHRcdCd4LWRpc3BhdGNoJyxcblx0XHRcdFx0XHRcdFx0J2RhdGEtY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdCd3aGVuLWNoZWNrZWQnLFxuXHRcdFx0XHRcdFx0XHQnY2hlY2tlZC1vbicsXG5cdFx0XHRcdFx0XHRcdCdjaGVja2VkJyxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMubWRDYWNoZS5zZXQocGF0aCwgbWFya2Rvd25Db250ZW50cyk7XG5cdFx0fVxuXHRcdHJldHVybiBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLm1kQ2FjaGUuZ2V0KHBhdGgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZENvbnRlbnRzT2ZQYXRoKHBhdGg6IFVSSSwgdXNlTW9kdWxlSWQgPSB0cnVlKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kdWxlSWQgPSBKU09OLnBhcnNlKHBhdGgucXVlcnkpLm1vZHVsZUlkO1xuXHRcdFx0aWYgKHVzZU1vZHVsZUlkICYmIG1vZHVsZUlkKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeS5nZXRQcm92aWRlcihtb2R1bGVJZCk7XG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGBHZXR0aW5nIHN0YXJ0ZWQ6IG5vIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yICR7bW9kdWxlSWR9YCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc29sdmUocHJvdmlkZXIoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGNvbnRlbnRzO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggeyB9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9jYWxpemVkUGF0aCA9IHBhdGgud2l0aCh7IHBhdGg6IHBhdGgucGF0aC5yZXBsYWNlKC9cXC5tZCQvLCBgLm5scy4ke2xhbmd1YWdlfS5tZGApIH0pO1xuXG5cdFx0XHRjb25zdCBnZW5lcmFsaXplZExvY2FsZSA9IGxhbmd1YWdlPy5yZXBsYWNlKC8tLiokLywgJycpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbGl6ZWRMb2NhbGl6ZWRQYXRoID0gcGF0aC53aXRoKHsgcGF0aDogcGF0aC5wYXRoLnJlcGxhY2UoL1xcLm1kJC8sIGAubmxzLiR7Z2VuZXJhbGl6ZWRMb2NhbGV9Lm1kYCkgfSk7XG5cblx0XHRcdGNvbnN0IGZpbGVFeGlzdHMgPSAoZmlsZTogVVJJKSA9PiB0aGlzLmZpbGVTZXJ2aWNlXG5cdFx0XHRcdC5zdGF0KGZpbGUpXG5cdFx0XHRcdC50aGVuKChzdGF0KSA9PiAhIXN0YXQuc2l6ZSkgLy8gRG91YmxlIGNoZWNrIHRoZSBmaWxlIGFjdHVhbGx5IGhhcyBjb250ZW50IGZvciBmaWxlU3lzdGVtUHJvdmlkZXJzIHRoYXQgZmFrZSBgc3RhdGAuICMxMzE4MDlcblx0XHRcdFx0LmNhdGNoKCgpID0+IGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgW2xvY2FsaXplZEZpbGVFeGlzdHMsIGdlbmVyYWxpemVkTG9jYWxpemVkRmlsZUV4aXN0c10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdGZpbGVFeGlzdHMobG9jYWxpemVkUGF0aCksXG5cdFx0XHRcdGZpbGVFeGlzdHMoZ2VuZXJhbGl6ZWRMb2NhbGl6ZWRQYXRoKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoXG5cdFx0XHRcdGxvY2FsaXplZEZpbGVFeGlzdHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplZFBhdGhcblx0XHRcdFx0XHQ6IGdlbmVyYWxpemVkTG9jYWxpemVkRmlsZUV4aXN0c1xuXHRcdFx0XHRcdFx0PyBnZW5lcmFsaXplZExvY2FsaXplZFBhdGhcblx0XHRcdFx0XHRcdDogcGF0aCk7XG5cblx0XHRcdHJldHVybiBieXRlcy52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcignRXJyb3IgcmVhZGluZyBtYXJrZG93biBkb2N1bWVudCBhdCBgJyArIHBhdGggKyAnYDogJyArIGUpO1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB0cmFuc2Zvcm1VcmkgPSAoc3JjOiBzdHJpbmcsIGJhc2U6IFVSSSkgPT4ge1xuXHRjb25zdCBwYXRoID0gam9pblBhdGgoYmFzZSwgc3JjKTtcblx0cmV0dXJuIGFzV2Vidmlld1VyaShwYXRoKS50b1N0cmluZyh0cnVlKTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVVyaXMgPSAoY29udGVudDogc3RyaW5nLCBiYXNlOiBVUkkpOiBzdHJpbmcgPT4gY29udGVudFxuXHQucmVwbGFjZSgvc3JjPVwiKFteXCJdKilcIi9nLCAoXywgc3JjOiBzdHJpbmcpID0+IHtcblx0XHRpZiAoc3JjLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHsgcmV0dXJuIGBzcmM9XCIke3NyY31cImA7IH1cblx0XHRyZXR1cm4gYHNyYz1cIiR7dHJhbnNmb3JtVXJpKHNyYywgYmFzZSl9XCJgO1xuXHR9KVxuXHQucmVwbGFjZSgvIVxcWyhbXlxcXV0qKVxcXVxcKChbXildKilcXCkvZywgKF8sIHRpdGxlOiBzdHJpbmcsIHNyYzogc3RyaW5nKSA9PiB7XG5cdFx0aWYgKHNyYy5zdGFydHNXaXRoKCdodHRwczovLycpKSB7IHJldHVybiBgIVske3RpdGxlfV0oJHtzcmN9KWA7IH1cblx0XHRyZXR1cm4gYCFbJHt0aXRsZX1dKCR7dHJhbnNmb3JtVXJpKHNyYywgYmFzZSl9KWA7XG5cdH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5Qiw4QkFBOEI7QUFFaEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQ0FBcUM7QUFHdkMsSUFBTSxnQ0FBTixNQUFvQztBQUFBLEVBSTFDLFlBQ2dDLGFBQ1EscUJBQ0gsa0JBQ0QsaUJBQ2xDO0FBSjhCO0FBQ1E7QUFDSDtBQUNEO0FBUHBDLFNBQVEsVUFBVSxJQUFJLFlBQXlCO0FBQy9DLFNBQVEsV0FBVyxJQUFJLFlBQW9CO0FBQUEsRUFPdkM7QUFBQSxFQUVKLE1BQU0sZUFBZSxNQUFXLE1BQTRCO0FBQzNELFVBQU0sVUFBVSxNQUFNLEtBQUsseUJBQXlC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LE1BQU0sS0FBSyxLQUFLLFFBQVEsU0FBUyxRQUFRLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFFM0YsWUFBTSxvQkFBb0IsVUFBVSxRQUFRLFFBQVEsRUFBRTtBQUN0RCxZQUFNLDJCQUEyQixLQUFLLEtBQUssRUFBRSxNQUFNLEtBQUssS0FBSyxRQUFRLFNBQVMsUUFBUSxpQkFBaUIsS0FBSyxFQUFFLENBQUM7QUFFL0csWUFBTSxhQUFhLENBQUMsU0FBYyxLQUFLLFlBQ3JDLEtBQUssSUFBSSxFQUNULEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLElBQUksRUFDMUIsTUFBTSxNQUFNLEtBQUs7QUFFbkIsWUFBTSxDQUFDLHFCQUFxQiw4QkFBOEIsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQy9FLFdBQVcsYUFBYTtBQUFBLFFBQ3hCLFdBQVcsd0JBQXdCO0FBQUEsTUFDcEMsQ0FBQztBQUVELFlBQU0sUUFBUSxNQUFNLEtBQUssWUFBWTtBQUFBLFFBQ3BDLHNCQUNHLGdCQUNBLGlDQUNDLDJCQUNBO0FBQUEsTUFBSTtBQUVULGFBQU8sTUFBTSxNQUFNLFNBQVM7QUFBQSxJQUM3QixTQUFTLEdBQUc7QUFDWCxXQUFLLG9CQUFvQixNQUFNLHlDQUF5QyxPQUFPLFFBQVEsQ0FBQztBQUN4RixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQWpTYSxnQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVJVO0FBbVNiLE1BQU0sZUFBZSxDQUFDLEtBQWEsU0FBYztBQUNoRCxRQUFNLE9BQU8sU0FBUyxNQUFNLEdBQUc7QUFDL0IsU0FBTyxhQUFhLElBQUksRUFBRSxTQUFTLElBQUk7QUFDeEM7QUFFQSxNQUFNLGdCQUFnQixDQUFDLFNBQWlCLFNBQXNCLFFBQzVELFFBQVEsa0JBQWtCLENBQUMsR0FBRyxRQUFnQjtBQUM5QyxNQUFJLElBQUksV0FBVyxVQUFVLEdBQUc7QUFBRSxXQUFPLFFBQVEsR0FBRztBQUFBLEVBQUs7QUFDekQsU0FBTyxRQUFRLGFBQWEsS0FBSyxJQUFJLENBQUM7QUFDdkMsQ0FBQyxFQUNBLFFBQVEsNkJBQTZCLENBQUMsR0FBRyxPQUFlLFFBQWdCO0FBQ3hFLE1BQUksSUFBSSxXQUFXLFVBQVUsR0FBRztBQUFFLFdBQU8sS0FBSyxLQUFLLEtBQUssR0FBRztBQUFBLEVBQUs7QUFDaEUsU0FBTyxLQUFLLEtBQUssS0FBSyxhQUFhLEtBQUssSUFBSSxDQUFDO0FBQzlDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
