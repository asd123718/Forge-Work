import { escape } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
const sendSystemInfoLabel = escape(localize("sendSystemInfo", "Include my system information"));
const sendProcessInfoLabel = escape(localize("sendProcessInfo", "Include my currently running processes"));
const sendWorkspaceInfoLabel = escape(localize("sendWorkspaceInfo", "Include my workspace metadata"));
const sendExtensionsLabel = escape(localize("sendExtensions", "Include my enabled extensions"));
const sendExperimentsLabel = escape(localize("sendExperiments", "Include A/B experiment info"));
const sendExtensionData = escape(localize("sendExtensionData", "Include additional extension info"));
const acknowledgementsLabel = escape(localize("acknowledgements", "I acknowledge that my VS Code version is not updated and this issue may be closed."));
const reviewGuidanceLabel = localize(
  // intentionally not escaped because of its embedded tags
  {
    key: "reviewGuidanceLabel",
    comment: [
      '{Locked="<a href="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions" target="_blank">"}',
      '{Locked="</a>"}'
    ]
  },
  'Before you report an issue here please <a href="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions" target="_blank">review the guidance we provide</a>. Please complete the form in English.'
);
var issueReporterPage_default = () => `
<div id="update-banner" class="issue-reporter-update-banner hidden">
	<span class="update-banner-text" id="update-banner-text">
		<!-- To be dynamically filled -->
	</span>
</div>
<div class="issue-reporter" id="issue-reporter">
	<div id="english" class="input-group hidden">${escape(localize("completeInEnglish", "Please complete the form in English."))}</div>

	<div id="review-guidance-help-text" class="input-group">${reviewGuidanceLabel}</div>

	<div class="section">
		<div class="input-group">
			<label class="inline-label" for="issue-type">${escape(localize("issueTypeLabel", "This is a"))}</label>
			<select id="issue-type" class="inline-form-control">
				<!-- To be dynamically filled -->
			</select>
		</div>

		<div class="input-group" id="problem-source">
			<label class="inline-label" for="issue-source">${escape(localize("issueSourceLabel", "For"))} <span class="required-input">*</span></label>
			<select id="issue-source" class="inline-form-control" required>
				<!-- To be dynamically filled -->
			</select>
			<div id="issue-source-empty-error" class="validation-error hidden" role="alert">${escape(localize("issueSourceEmptyValidation", "An issue source is required."))}</div>
			<div id="problem-source-help-text" class="instructions hidden">${escape(localize("disableExtensionsLabelText", "Try to reproduce the problem after {0}. If the problem only reproduces when extensions are active, it is likely an issue with an extension.")).replace("{0}", () => `<span tabIndex=0 role="button" id="disableExtensions" class="workbenchCommand">${escape(localize("disableExtensions", "disabling all extensions and reloading the window"))}</span>`)}
			</div>

			<div id="extension-selection">
				<label class="inline-label" for="extension-selector">${escape(localize("chooseExtension", "Extension"))} <span class="required-input">*</span></label>
				<select id="extension-selector" class="inline-form-control">
					<!-- To be dynamically filled -->
				</select>
				<div id="extension-selection-validation-error" class="validation-error hidden" role="alert">${escape(localize("extensionWithNonstandardBugsUrl", "The issue reporter is unable to create issues for this extension. Please visit {0} to report an issue.")).replace("{0}", () => `<span tabIndex=0 role="button" id="extensionBugsLink" class="workbenchCommand"><!-- To be dynamically filled --></span>`)}</div>
				<div id="extension-selection-validation-error-no-url" class="validation-error hidden" role="alert">
					${escape(localize("extensionWithNoBugsUrl", "The issue reporter is unable to create issues for this extension, as it does not specify a URL for reporting issues. Please check the marketplace page of this extension to see if other instructions are available."))}
				</div>
			</div>
		</div>

		<div id="issue-title-container" class="input-group">
			<label class="inline-label" for="issue-title">${escape(localize("issueTitleLabel", "Title"))} <span class="required-input">*</span></label>
			<input id="issue-title" type="text" class="inline-form-control" placeholder="${escape(localize("issueTitleRequired", "Please enter a title."))}" required>
			<div id="issue-title-empty-error" class="validation-error hidden" role="alert">${escape(localize("titleEmptyValidation", "A title is required."))}</div>
			<div id="issue-title-length-validation-error" class="validation-error hidden" role="alert">${escape(localize("titleLengthValidation", "The title is too long."))}</div>
			<small id="similar-issues">
				<!-- To be dynamically filled -->
			</small>
		</div>

	</div>

	<div class="input-group description-section">
		<label for="description" id="issue-description-label">
			<!-- To be dynamically filled -->
		</label>
		<div class="instructions" id="issue-description-subtitle">
			<!-- To be dynamically filled -->
		</div>
		<div class="block-info-text">
			<textarea name="description" id="description" placeholder="${escape(localize("details", "Please enter details."))}" required></textarea>
		</div>
		<div id="description-empty-error" class="validation-error hidden" role="alert">${escape(localize("descriptionEmptyValidation", "A description is required."))}</div>
		<div id="description-short-error" class="validation-error hidden" role="alert">${escape(localize("descriptionTooShortValidation", "Please provide a longer description."))}</div>
	</div>

	<div class="system-info" id="block-container">
		<div class="block block-extension-data">
			<input class="send-extension-data" aria-label="${sendExtensionData}" type="checkbox" id="includeExtensionData" checked/>
			<label class="extension-caption" id="extension-caption" for="includeExtensionData">
				${sendExtensionData}
				<span id="ext-loading" hidden></span>
				<span class="ext-parens" hidden>(</span><a href="#" class="showInfo" id="extension-id">${escape(localize("show", "show"))}</a><span class="ext-parens" hidden>)</span>
				<a id="extension-data-download">${escape(localize("downloadExtensionData", "Download Extension Data"))}</a>
			</label>
			<pre class="block-info" id="extension-data" placeholder="${escape(localize("extensionData", "Extension does not have additional data to include."))}" style="white-space: pre-wrap; user-select: text;">
				<!-- To be dynamically filled -->
			</pre>
		</div>

		<div class="block block-system">
			<input class="sendData" aria-label="${sendSystemInfoLabel}" type="checkbox" id="includeSystemInfo" checked/>
			<label class="caption" for="includeSystemInfo">
				${sendSystemInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<div class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
		</div>
		</div>
		<div class="block block-process">
			<input class="sendData" aria-label="${sendProcessInfoLabel}" type="checkbox" id="includeProcessInfo" checked/>
			<label class="caption" for="includeProcessInfo">
				${sendProcessInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre class="block-info hidden" style="user-select: text;">
				<code>
				<!-- To be dynamically filled -->
				</code>
			</pre>
		</div>
		<div class="block block-workspace">
			<input class="sendData" aria-label="${sendWorkspaceInfoLabel}" type="checkbox" id="includeWorkspaceInfo" checked/>
			<label class="caption" for="includeWorkspaceInfo">
				${sendWorkspaceInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre id="systemInfo" class="block-info hidden" style="user-select: text;">
				<code>
				<!-- To be dynamically filled -->
				</code>
			</pre>
		</div>
		<div class="block block-extensions">
			<input class="sendData" aria-label="${sendExtensionsLabel}" type="checkbox" id="includeExtensions" checked/>
			<label class="caption" for="includeExtensions">
				${sendExtensionsLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<div id="systemInfo" class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
			</div>
		</div>
		<div class="block block-experiments">
			<input class="sendData" aria-label="${sendExperimentsLabel}" type="checkbox" id="includeExperiments" checked/>
			<label class="caption" for="includeExperiments">
				${sendExperimentsLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
			</pre>
		</div>
		<div class="block block-acknowledgements hidden" id="version-acknowledgements">
			<input class="sendData" aria-label="${acknowledgementsLabel}" type="checkbox" id="includeAcknowledgement"/>
			<label class="caption" for="includeAcknowledgement">
				${acknowledgementsLabel}
			</label>
		</div>
	</div>

</div>`;
export {
  issueReporterPage_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxpc3N1ZVJlcG9ydGVyUGFnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVzY2FwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5jb25zdCBzZW5kU3lzdGVtSW5mb0xhYmVsID0gZXNjYXBlKGxvY2FsaXplKCdzZW5kU3lzdGVtSW5mbycsIFwiSW5jbHVkZSBteSBzeXN0ZW0gaW5mb3JtYXRpb25cIikpO1xuY29uc3Qgc2VuZFByb2Nlc3NJbmZvTGFiZWwgPSBlc2NhcGUobG9jYWxpemUoJ3NlbmRQcm9jZXNzSW5mbycsIFwiSW5jbHVkZSBteSBjdXJyZW50bHkgcnVubmluZyBwcm9jZXNzZXNcIikpO1xuY29uc3Qgc2VuZFdvcmtzcGFjZUluZm9MYWJlbCA9IGVzY2FwZShsb2NhbGl6ZSgnc2VuZFdvcmtzcGFjZUluZm8nLCBcIkluY2x1ZGUgbXkgd29ya3NwYWNlIG1ldGFkYXRhXCIpKTtcbmNvbnN0IHNlbmRFeHRlbnNpb25zTGFiZWwgPSBlc2NhcGUobG9jYWxpemUoJ3NlbmRFeHRlbnNpb25zJywgXCJJbmNsdWRlIG15IGVuYWJsZWQgZXh0ZW5zaW9uc1wiKSk7XG5jb25zdCBzZW5kRXhwZXJpbWVudHNMYWJlbCA9IGVzY2FwZShsb2NhbGl6ZSgnc2VuZEV4cGVyaW1lbnRzJywgXCJJbmNsdWRlIEEvQiBleHBlcmltZW50IGluZm9cIikpO1xuY29uc3Qgc2VuZEV4dGVuc2lvbkRhdGEgPSBlc2NhcGUobG9jYWxpemUoJ3NlbmRFeHRlbnNpb25EYXRhJywgXCJJbmNsdWRlIGFkZGl0aW9uYWwgZXh0ZW5zaW9uIGluZm9cIikpO1xuY29uc3QgYWNrbm93bGVkZ2VtZW50c0xhYmVsID0gZXNjYXBlKGxvY2FsaXplKCdhY2tub3dsZWRnZW1lbnRzJywgXCJJIGFja25vd2xlZGdlIHRoYXQgbXkgVlMgQ29kZSB2ZXJzaW9uIGlzIG5vdCB1cGRhdGVkIGFuZCB0aGlzIGlzc3VlIG1heSBiZSBjbG9zZWQuXCIpKTtcbmNvbnN0IHJldmlld0d1aWRhbmNlTGFiZWwgPSBsb2NhbGl6ZSggLy8gaW50ZW50aW9uYWxseSBub3QgZXNjYXBlZCBiZWNhdXNlIG9mIGl0cyBlbWJlZGRlZCB0YWdzXG5cdHtcblx0XHRrZXk6ICdyZXZpZXdHdWlkYW5jZUxhYmVsJyxcblx0XHRjb21tZW50OiBbXG5cdFx0XHQne0xvY2tlZD1cIjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvU3VibWl0dGluZy1CdWdzLWFuZC1TdWdnZXN0aW9uc1xcXCIgdGFyZ2V0PVxcXCJfYmxhbmtcXFwiPlwifScsXG5cdFx0XHQne0xvY2tlZD1cIjwvYT5cIn0nXG5cdFx0XVxuXHR9LFxuXHQnQmVmb3JlIHlvdSByZXBvcnQgYW4gaXNzdWUgaGVyZSBwbGVhc2UgPGEgaHJlZj1cImh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvU3VibWl0dGluZy1CdWdzLWFuZC1TdWdnZXN0aW9uc1wiIHRhcmdldD1cIl9ibGFua1wiPnJldmlldyB0aGUgZ3VpZGFuY2Ugd2UgcHJvdmlkZTwvYT4uIFBsZWFzZSBjb21wbGV0ZSB0aGUgZm9ybSBpbiBFbmdsaXNoLidcbik7XG5cbmV4cG9ydCBkZWZhdWx0ICgpOiBzdHJpbmcgPT4gYFxuPGRpdiBpZD1cInVwZGF0ZS1iYW5uZXJcIiBjbGFzcz1cImlzc3VlLXJlcG9ydGVyLXVwZGF0ZS1iYW5uZXIgaGlkZGVuXCI+XG5cdDxzcGFuIGNsYXNzPVwidXBkYXRlLWJhbm5lci10ZXh0XCIgaWQ9XCJ1cGRhdGUtYmFubmVyLXRleHRcIj5cblx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0PC9zcGFuPlxuPC9kaXY+XG48ZGl2IGNsYXNzPVwiaXNzdWUtcmVwb3J0ZXJcIiBpZD1cImlzc3VlLXJlcG9ydGVyXCI+XG5cdDxkaXYgaWQ9XCJlbmdsaXNoXCIgY2xhc3M9XCJpbnB1dC1ncm91cCBoaWRkZW5cIj4ke2VzY2FwZShsb2NhbGl6ZSgnY29tcGxldGVJbkVuZ2xpc2gnLCBcIlBsZWFzZSBjb21wbGV0ZSB0aGUgZm9ybSBpbiBFbmdsaXNoLlwiKSl9PC9kaXY+XG5cblx0PGRpdiBpZD1cInJldmlldy1ndWlkYW5jZS1oZWxwLXRleHRcIiBjbGFzcz1cImlucHV0LWdyb3VwXCI+JHtyZXZpZXdHdWlkYW5jZUxhYmVsfTwvZGl2PlxuXG5cdDxkaXYgY2xhc3M9XCJzZWN0aW9uXCI+XG5cdFx0PGRpdiBjbGFzcz1cImlucHV0LWdyb3VwXCI+XG5cdFx0XHQ8bGFiZWwgY2xhc3M9XCJpbmxpbmUtbGFiZWxcIiBmb3I9XCJpc3N1ZS10eXBlXCI+JHtlc2NhcGUobG9jYWxpemUoJ2lzc3VlVHlwZUxhYmVsJywgXCJUaGlzIGlzIGFcIikpfTwvbGFiZWw+XG5cdFx0XHQ8c2VsZWN0IGlkPVwiaXNzdWUtdHlwZVwiIGNsYXNzPVwiaW5saW5lLWZvcm0tY29udHJvbFwiPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdDwvc2VsZWN0PlxuXHRcdDwvZGl2PlxuXG5cdFx0PGRpdiBjbGFzcz1cImlucHV0LWdyb3VwXCIgaWQ9XCJwcm9ibGVtLXNvdXJjZVwiPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiaW5saW5lLWxhYmVsXCIgZm9yPVwiaXNzdWUtc291cmNlXCI+JHtlc2NhcGUobG9jYWxpemUoJ2lzc3VlU291cmNlTGFiZWwnLCBcIkZvclwiKSl9IDxzcGFuIGNsYXNzPVwicmVxdWlyZWQtaW5wdXRcIj4qPC9zcGFuPjwvbGFiZWw+XG5cdFx0XHQ8c2VsZWN0IGlkPVwiaXNzdWUtc291cmNlXCIgY2xhc3M9XCJpbmxpbmUtZm9ybS1jb250cm9sXCIgcmVxdWlyZWQ+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0PC9zZWxlY3Q+XG5cdFx0XHQ8ZGl2IGlkPVwiaXNzdWUtc291cmNlLWVtcHR5LWVycm9yXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdpc3N1ZVNvdXJjZUVtcHR5VmFsaWRhdGlvbicsIFwiQW4gaXNzdWUgc291cmNlIGlzIHJlcXVpcmVkLlwiKSl9PC9kaXY+XG5cdFx0XHQ8ZGl2IGlkPVwicHJvYmxlbS1zb3VyY2UtaGVscC10ZXh0XCIgY2xhc3M9XCJpbnN0cnVjdGlvbnMgaGlkZGVuXCI+JHtlc2NhcGUobG9jYWxpemUoJ2Rpc2FibGVFeHRlbnNpb25zTGFiZWxUZXh0JywgXCJUcnkgdG8gcmVwcm9kdWNlIHRoZSBwcm9ibGVtIGFmdGVyIHswfS4gSWYgdGhlIHByb2JsZW0gb25seSByZXByb2R1Y2VzIHdoZW4gZXh0ZW5zaW9ucyBhcmUgYWN0aXZlLCBpdCBpcyBsaWtlbHkgYW4gaXNzdWUgd2l0aCBhbiBleHRlbnNpb24uXCIpKVxuXHRcdC5yZXBsYWNlKCd7MH0nLCAoKSA9PiBgPHNwYW4gdGFiSW5kZXg9MCByb2xlPVwiYnV0dG9uXCIgaWQ9XCJkaXNhYmxlRXh0ZW5zaW9uc1wiIGNsYXNzPVwid29ya2JlbmNoQ29tbWFuZFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdkaXNhYmxlRXh0ZW5zaW9ucycsIFwiZGlzYWJsaW5nIGFsbCBleHRlbnNpb25zIGFuZCByZWxvYWRpbmcgdGhlIHdpbmRvd1wiKSl9PC9zcGFuPmApfVxuXHRcdFx0PC9kaXY+XG5cblx0XHRcdDxkaXYgaWQ9XCJleHRlbnNpb24tc2VsZWN0aW9uXCI+XG5cdFx0XHRcdDxsYWJlbCBjbGFzcz1cImlubGluZS1sYWJlbFwiIGZvcj1cImV4dGVuc2lvbi1zZWxlY3RvclwiPiR7ZXNjYXBlKGxvY2FsaXplKCdjaG9vc2VFeHRlbnNpb24nLCBcIkV4dGVuc2lvblwiKSl9IDxzcGFuIGNsYXNzPVwicmVxdWlyZWQtaW5wdXRcIj4qPC9zcGFuPjwvbGFiZWw+XG5cdFx0XHRcdDxzZWxlY3QgaWQ9XCJleHRlbnNpb24tc2VsZWN0b3JcIiBjbGFzcz1cImlubGluZS1mb3JtLWNvbnRyb2xcIj5cblx0XHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdFx0PC9zZWxlY3Q+XG5cdFx0XHRcdDxkaXYgaWQ9XCJleHRlbnNpb24tc2VsZWN0aW9uLXZhbGlkYXRpb24tZXJyb3JcIiBjbGFzcz1cInZhbGlkYXRpb24tZXJyb3IgaGlkZGVuXCIgcm9sZT1cImFsZXJ0XCI+JHtlc2NhcGUobG9jYWxpemUoJ2V4dGVuc2lvbldpdGhOb25zdGFuZGFyZEJ1Z3NVcmwnLCBcIlRoZSBpc3N1ZSByZXBvcnRlciBpcyB1bmFibGUgdG8gY3JlYXRlIGlzc3VlcyBmb3IgdGhpcyBleHRlbnNpb24uIFBsZWFzZSB2aXNpdCB7MH0gdG8gcmVwb3J0IGFuIGlzc3VlLlwiKSlcblx0XHQucmVwbGFjZSgnezB9JywgKCkgPT4gYDxzcGFuIHRhYkluZGV4PTAgcm9sZT1cImJ1dHRvblwiIGlkPVwiZXh0ZW5zaW9uQnVnc0xpbmtcIiBjbGFzcz1cIndvcmtiZW5jaENvbW1hbmRcIj48IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT48L3NwYW4+YCl9PC9kaXY+XG5cdFx0XHRcdDxkaXYgaWQ9XCJleHRlbnNpb24tc2VsZWN0aW9uLXZhbGlkYXRpb24tZXJyb3Itbm8tdXJsXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPlxuXHRcdFx0XHRcdCR7ZXNjYXBlKGxvY2FsaXplKCdleHRlbnNpb25XaXRoTm9CdWdzVXJsJywgXCJUaGUgaXNzdWUgcmVwb3J0ZXIgaXMgdW5hYmxlIHRvIGNyZWF0ZSBpc3N1ZXMgZm9yIHRoaXMgZXh0ZW5zaW9uLCBhcyBpdCBkb2VzIG5vdCBzcGVjaWZ5IGEgVVJMIGZvciByZXBvcnRpbmcgaXNzdWVzLiBQbGVhc2UgY2hlY2sgdGhlIG1hcmtldHBsYWNlIHBhZ2Ugb2YgdGhpcyBleHRlbnNpb24gdG8gc2VlIGlmIG90aGVyIGluc3RydWN0aW9ucyBhcmUgYXZhaWxhYmxlLlwiKSl9XG5cdFx0XHRcdDwvZGl2PlxuXHRcdFx0PC9kaXY+XG5cdFx0PC9kaXY+XG5cblx0XHQ8ZGl2IGlkPVwiaXNzdWUtdGl0bGUtY29udGFpbmVyXCIgY2xhc3M9XCJpbnB1dC1ncm91cFwiPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiaW5saW5lLWxhYmVsXCIgZm9yPVwiaXNzdWUtdGl0bGVcIj4ke2VzY2FwZShsb2NhbGl6ZSgnaXNzdWVUaXRsZUxhYmVsJywgXCJUaXRsZVwiKSl9IDxzcGFuIGNsYXNzPVwicmVxdWlyZWQtaW5wdXRcIj4qPC9zcGFuPjwvbGFiZWw+XG5cdFx0XHQ8aW5wdXQgaWQ9XCJpc3N1ZS10aXRsZVwiIHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJpbmxpbmUtZm9ybS1jb250cm9sXCIgcGxhY2Vob2xkZXI9XCIke2VzY2FwZShsb2NhbGl6ZSgnaXNzdWVUaXRsZVJlcXVpcmVkJywgXCJQbGVhc2UgZW50ZXIgYSB0aXRsZS5cIikpfVwiIHJlcXVpcmVkPlxuXHRcdFx0PGRpdiBpZD1cImlzc3VlLXRpdGxlLWVtcHR5LWVycm9yXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPiR7ZXNjYXBlKGxvY2FsaXplKCd0aXRsZUVtcHR5VmFsaWRhdGlvbicsIFwiQSB0aXRsZSBpcyByZXF1aXJlZC5cIikpfTwvZGl2PlxuXHRcdFx0PGRpdiBpZD1cImlzc3VlLXRpdGxlLWxlbmd0aC12YWxpZGF0aW9uLWVycm9yXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPiR7ZXNjYXBlKGxvY2FsaXplKCd0aXRsZUxlbmd0aFZhbGlkYXRpb24nLCBcIlRoZSB0aXRsZSBpcyB0b28gbG9uZy5cIikpfTwvZGl2PlxuXHRcdFx0PHNtYWxsIGlkPVwic2ltaWxhci1pc3N1ZXNcIj5cblx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHQ8L3NtYWxsPlxuXHRcdDwvZGl2PlxuXG5cdDwvZGl2PlxuXG5cdDxkaXYgY2xhc3M9XCJpbnB1dC1ncm91cCBkZXNjcmlwdGlvbi1zZWN0aW9uXCI+XG5cdFx0PGxhYmVsIGZvcj1cImRlc2NyaXB0aW9uXCIgaWQ9XCJpc3N1ZS1kZXNjcmlwdGlvbi1sYWJlbFwiPlxuXHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0PC9sYWJlbD5cblx0XHQ8ZGl2IGNsYXNzPVwiaW5zdHJ1Y3Rpb25zXCIgaWQ9XCJpc3N1ZS1kZXNjcmlwdGlvbi1zdWJ0aXRsZVwiPlxuXHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0PC9kaXY+XG5cdFx0PGRpdiBjbGFzcz1cImJsb2NrLWluZm8tdGV4dFwiPlxuXHRcdFx0PHRleHRhcmVhIG5hbWU9XCJkZXNjcmlwdGlvblwiIGlkPVwiZGVzY3JpcHRpb25cIiBwbGFjZWhvbGRlcj1cIiR7ZXNjYXBlKGxvY2FsaXplKCdkZXRhaWxzJywgXCJQbGVhc2UgZW50ZXIgZGV0YWlscy5cIikpfVwiIHJlcXVpcmVkPjwvdGV4dGFyZWE+XG5cdFx0PC9kaXY+XG5cdFx0PGRpdiBpZD1cImRlc2NyaXB0aW9uLWVtcHR5LWVycm9yXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdkZXNjcmlwdGlvbkVtcHR5VmFsaWRhdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBpcyByZXF1aXJlZC5cIikpfTwvZGl2PlxuXHRcdDxkaXYgaWQ9XCJkZXNjcmlwdGlvbi1zaG9ydC1lcnJvclwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj4ke2VzY2FwZShsb2NhbGl6ZSgnZGVzY3JpcHRpb25Ub29TaG9ydFZhbGlkYXRpb24nLCBcIlBsZWFzZSBwcm92aWRlIGEgbG9uZ2VyIGRlc2NyaXB0aW9uLlwiKSl9PC9kaXY+XG5cdDwvZGl2PlxuXG5cdDxkaXYgY2xhc3M9XCJzeXN0ZW0taW5mb1wiIGlkPVwiYmxvY2stY29udGFpbmVyXCI+XG5cdFx0PGRpdiBjbGFzcz1cImJsb2NrIGJsb2NrLWV4dGVuc2lvbi1kYXRhXCI+XG5cdFx0XHQ8aW5wdXQgY2xhc3M9XCJzZW5kLWV4dGVuc2lvbi1kYXRhXCIgYXJpYS1sYWJlbD1cIiR7c2VuZEV4dGVuc2lvbkRhdGF9XCIgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJpbmNsdWRlRXh0ZW5zaW9uRGF0YVwiIGNoZWNrZWQvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiZXh0ZW5zaW9uLWNhcHRpb25cIiBpZD1cImV4dGVuc2lvbi1jYXB0aW9uXCIgZm9yPVwiaW5jbHVkZUV4dGVuc2lvbkRhdGFcIj5cblx0XHRcdFx0JHtzZW5kRXh0ZW5zaW9uRGF0YX1cblx0XHRcdFx0PHNwYW4gaWQ9XCJleHQtbG9hZGluZ1wiIGhpZGRlbj48L3NwYW4+XG5cdFx0XHRcdDxzcGFuIGNsYXNzPVwiZXh0LXBhcmVuc1wiIGhpZGRlbj4oPC9zcGFuPjxhIGhyZWY9XCIjXCIgY2xhc3M9XCJzaG93SW5mb1wiIGlkPVwiZXh0ZW5zaW9uLWlkXCI+JHtlc2NhcGUobG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIikpfTwvYT48c3BhbiBjbGFzcz1cImV4dC1wYXJlbnNcIiBoaWRkZW4+KTwvc3Bhbj5cblx0XHRcdFx0PGEgaWQ9XCJleHRlbnNpb24tZGF0YS1kb3dubG9hZFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdkb3dubG9hZEV4dGVuc2lvbkRhdGEnLCBcIkRvd25sb2FkIEV4dGVuc2lvbiBEYXRhXCIpKX08L2E+XG5cdFx0XHQ8L2xhYmVsPlxuXHRcdFx0PHByZSBjbGFzcz1cImJsb2NrLWluZm9cIiBpZD1cImV4dGVuc2lvbi1kYXRhXCIgcGxhY2Vob2xkZXI9XCIke2VzY2FwZShsb2NhbGl6ZSgnZXh0ZW5zaW9uRGF0YScsIFwiRXh0ZW5zaW9uIGRvZXMgbm90IGhhdmUgYWRkaXRpb25hbCBkYXRhIHRvIGluY2x1ZGUuXCIpKX1cIiBzdHlsZT1cIndoaXRlLXNwYWNlOiBwcmUtd3JhcDsgdXNlci1zZWxlY3Q6IHRleHQ7XCI+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0PC9wcmU+XG5cdFx0PC9kaXY+XG5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2stc3lzdGVtXCI+XG5cdFx0XHQ8aW5wdXQgY2xhc3M9XCJzZW5kRGF0YVwiIGFyaWEtbGFiZWw9XCIke3NlbmRTeXN0ZW1JbmZvTGFiZWx9XCIgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJpbmNsdWRlU3lzdGVtSW5mb1wiIGNoZWNrZWQvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiY2FwdGlvblwiIGZvcj1cImluY2x1ZGVTeXN0ZW1JbmZvXCI+XG5cdFx0XHRcdCR7c2VuZFN5c3RlbUluZm9MYWJlbH1cblx0XHRcdFx0KDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJzaG93SW5mb1wiPiR7ZXNjYXBlKGxvY2FsaXplKCdzaG93JywgXCJzaG93XCIpKX08L2E+KVxuXHRcdFx0PC9sYWJlbD5cblx0XHRcdDxkaXYgY2xhc3M9XCJibG9jay1pbmZvIGhpZGRlblwiIHN0eWxlPVwidXNlci1zZWxlY3Q6IHRleHQ7XCI+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdDwvZGl2PlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgY2xhc3M9XCJibG9jayBibG9jay1wcm9jZXNzXCI+XG5cdFx0XHQ8aW5wdXQgY2xhc3M9XCJzZW5kRGF0YVwiIGFyaWEtbGFiZWw9XCIke3NlbmRQcm9jZXNzSW5mb0xhYmVsfVwiIHR5cGU9XCJjaGVja2JveFwiIGlkPVwiaW5jbHVkZVByb2Nlc3NJbmZvXCIgY2hlY2tlZC8+XG5cdFx0XHQ8bGFiZWwgY2xhc3M9XCJjYXB0aW9uXCIgZm9yPVwiaW5jbHVkZVByb2Nlc3NJbmZvXCI+XG5cdFx0XHRcdCR7c2VuZFByb2Nlc3NJbmZvTGFiZWx9XG5cdFx0XHRcdCg8YSBocmVmPVwiI1wiIGNsYXNzPVwic2hvd0luZm9cIj4ke2VzY2FwZShsb2NhbGl6ZSgnc2hvdycsIFwic2hvd1wiKSl9PC9hPilcblx0XHRcdDwvbGFiZWw+XG5cdFx0XHQ8cHJlIGNsYXNzPVwiYmxvY2staW5mbyBoaWRkZW5cIiBzdHlsZT1cInVzZXItc2VsZWN0OiB0ZXh0O1wiPlxuXHRcdFx0XHQ8Y29kZT5cblx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHRcdDwvY29kZT5cblx0XHRcdDwvcHJlPlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgY2xhc3M9XCJibG9jayBibG9jay13b3Jrc3BhY2VcIj5cblx0XHRcdDxpbnB1dCBjbGFzcz1cInNlbmREYXRhXCIgYXJpYS1sYWJlbD1cIiR7c2VuZFdvcmtzcGFjZUluZm9MYWJlbH1cIiB0eXBlPVwiY2hlY2tib3hcIiBpZD1cImluY2x1ZGVXb3Jrc3BhY2VJbmZvXCIgY2hlY2tlZC8+XG5cdFx0XHQ8bGFiZWwgY2xhc3M9XCJjYXB0aW9uXCIgZm9yPVwiaW5jbHVkZVdvcmtzcGFjZUluZm9cIj5cblx0XHRcdFx0JHtzZW5kV29ya3NwYWNlSW5mb0xhYmVsfVxuXHRcdFx0XHQoPGEgaHJlZj1cIiNcIiBjbGFzcz1cInNob3dJbmZvXCI+JHtlc2NhcGUobG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIikpfTwvYT4pXG5cdFx0XHQ8L2xhYmVsPlxuXHRcdFx0PHByZSBpZD1cInN5c3RlbUluZm9cIiBjbGFzcz1cImJsb2NrLWluZm8gaGlkZGVuXCIgc3R5bGU9XCJ1c2VyLXNlbGVjdDogdGV4dDtcIj5cblx0XHRcdFx0PGNvZGU+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0XHQ8L2NvZGU+XG5cdFx0XHQ8L3ByZT5cblx0XHQ8L2Rpdj5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2stZXh0ZW5zaW9uc1wiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZERhdGFcIiBhcmlhLWxhYmVsPVwiJHtzZW5kRXh0ZW5zaW9uc0xhYmVsfVwiIHR5cGU9XCJjaGVja2JveFwiIGlkPVwiaW5jbHVkZUV4dGVuc2lvbnNcIiBjaGVja2VkLz5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImNhcHRpb25cIiBmb3I9XCJpbmNsdWRlRXh0ZW5zaW9uc1wiPlxuXHRcdFx0XHQke3NlbmRFeHRlbnNpb25zTGFiZWx9XG5cdFx0XHRcdCg8YSBocmVmPVwiI1wiIGNsYXNzPVwic2hvd0luZm9cIj4ke2VzY2FwZShsb2NhbGl6ZSgnc2hvdycsIFwic2hvd1wiKSl9PC9hPilcblx0XHRcdDwvbGFiZWw+XG5cdFx0XHQ8ZGl2IGlkPVwic3lzdGVtSW5mb1wiIGNsYXNzPVwiYmxvY2staW5mbyBoaWRkZW5cIiBzdHlsZT1cInVzZXItc2VsZWN0OiB0ZXh0O1wiPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdDwvZGl2PlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgY2xhc3M9XCJibG9jayBibG9jay1leHBlcmltZW50c1wiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZERhdGFcIiBhcmlhLWxhYmVsPVwiJHtzZW5kRXhwZXJpbWVudHNMYWJlbH1cIiB0eXBlPVwiY2hlY2tib3hcIiBpZD1cImluY2x1ZGVFeHBlcmltZW50c1wiIGNoZWNrZWQvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiY2FwdGlvblwiIGZvcj1cImluY2x1ZGVFeHBlcmltZW50c1wiPlxuXHRcdFx0XHQke3NlbmRFeHBlcmltZW50c0xhYmVsfVxuXHRcdFx0XHQoPGEgaHJlZj1cIiNcIiBjbGFzcz1cInNob3dJbmZvXCI+JHtlc2NhcGUobG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIikpfTwvYT4pXG5cdFx0XHQ8L2xhYmVsPlxuXHRcdFx0PHByZSBjbGFzcz1cImJsb2NrLWluZm8gaGlkZGVuXCIgc3R5bGU9XCJ1c2VyLXNlbGVjdDogdGV4dDtcIj5cblx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHQ8L3ByZT5cblx0XHQ8L2Rpdj5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2stYWNrbm93bGVkZ2VtZW50cyBoaWRkZW5cIiBpZD1cInZlcnNpb24tYWNrbm93bGVkZ2VtZW50c1wiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZERhdGFcIiBhcmlhLWxhYmVsPVwiJHthY2tub3dsZWRnZW1lbnRzTGFiZWx9XCIgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJpbmNsdWRlQWNrbm93bGVkZ2VtZW50XCIvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiY2FwdGlvblwiIGZvcj1cImluY2x1ZGVBY2tub3dsZWRnZW1lbnRcIj5cblx0XHRcdFx0JHthY2tub3dsZWRnZW1lbnRzTGFiZWx9XG5cdFx0XHQ8L2xhYmVsPlxuXHRcdDwvZGl2PlxuXHQ8L2Rpdj5cblxuPC9kaXY+YDtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtB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
