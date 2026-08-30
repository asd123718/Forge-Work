import { constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ChatRichLink } from "../../../../contrib/chat/browser/widget/chatContentParts/chatRichLink.js";
import { defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { renderChatWidget } from "./chatWidget.fixture.js";
function renderRichLinks(context, presentations) {
  context.container.classList.add("monaco-workbench", "chat-rich-link-fixture");
  context.container.style.display = "grid";
  context.container.style.gridTemplateColumns = "repeat(2, max-content)";
  context.container.style.alignItems = "center";
  context.container.style.gap = "12px";
  context.container.style.padding = "12px";
  context.container.style.width = "720px";
  context.container.style.minHeight = "180px";
  context.container.style.backgroundColor = "var(--vscode-editor-background)";
  for (const presentation of presentations) {
    const anchor = context.container.ownerDocument.createElement("a");
    anchor.href = "#";
    const authoredLabel = context.container.ownerDocument.createElement("span");
    authoredLabel.textContent = presentation.title ?? presentation.reference ?? presentation.kind;
    const richLink = context.disposableStore.add(ChatRichLink.mount(anchor, authoredLabel));
    richLink.update(presentation);
    context.container.appendChild(anchor);
  }
}
function createLinkPresentationService(presentation) {
  return new class extends mock() {
    getLinkPresentationRule() {
      return { id: "fixture", uriPattern: /.*/, initialKind: "resource" };
    }
    createLinkPresentationWatcher() {
      return {
        presentation: constObservable(presentation),
        dispose() {
        }
      };
    }
  }();
}
const githubPullRequestPresentation = {
  kind: "pullRequest",
  title: "Validate schemas through declared meta-schemas",
  reference: "#7",
  status: { kind: "draft", label: "Draft" },
  secondaryStatus: { kind: "success", label: "Checks passed" },
  tooltip: "hediet/demo-json-schema-validator#7 \xB7 Draft \xB7 Checks passed",
  ariaLabel: "Pull request hediet slash demo-json-schema-validator number 7, Draft, Checks passed: Validate schemas through declared meta-schemas"
};
var chatRichLink_fixture_default = defineThemedFixtureGroup({ path: "chat/" }, {
  inChat: defineComponentFixture({
    render: (context) => renderChatWidget(context, {
      width: 720,
      height: 320,
      inputVisible: false,
      linkPresentationService: createLinkPresentationService({
        kind: "session",
        title: "Implement rich links",
        detail: "Agent session",
        status: { kind: "pending", label: "Working" }
      }),
      messages: [{
        user: "Continue the implementation",
        assistant: [{
          kind: "markdown",
          text: "The [implementation session](agent-host-session://copilotcli/rich-links) is still working."
        }]
      }]
    })
  }),
  githubPullRequestInChat: defineComponentFixture({
    render: (context) => renderChatWidget(context, {
      width: 720,
      height: 320,
      inputVisible: false,
      linkPresentationService: createLinkPresentationService(githubPullRequestPresentation),
      messages: [{
        user: "What is open?",
        assistant: [{
          kind: "markdown",
          text: "## Open\n\n- [#7 \u2014 Validate schemas through declared meta-schemas](https://github.com/hediet/demo-json-schema-validator/pull/7) \u2014 **Draft**"
        }]
      }]
    })
  }),
  loadingGithubPullRequestInChat: defineComponentFixture({
    render: (context) => renderChatWidget(context, {
      width: 720,
      height: 320,
      inputVisible: false,
      linkPresentationService: createLinkPresentationService({
        ...githubPullRequestPresentation,
        isLoading: true
      }),
      messages: [{
        user: "What is open?",
        assistant: [{
          kind: "markdown",
          text: "## Open\n\n- [#7 \u2014 Validate schemas through declared meta-schemas](https://github.com/hediet/demo-json-schema-validator/pull/7) \u2014 **Draft**"
        }]
      }]
    })
  }),
  sessionStates: defineComponentFixture({
    render: (context) => renderRichLinks(context, [
      { kind: "session", title: "Preparing implementation", status: { kind: "pending", label: "Loading" } },
      { kind: "session", title: "Implement rich links", status: { kind: "pending", label: "Working" } },
      { kind: "session", title: "Review architecture", status: { kind: "warning", label: "Needs input" } },
      { kind: "session", title: "Update fixtures", status: { kind: "success", label: "Completed" } },
      { kind: "session", title: "Run validation", status: { kind: "error", label: "Error" } }
    ])
  }),
  presentationKinds: defineComponentFixture({
    render: (context) => renderRichLinks(context, [
      { kind: "issue", title: "Rich links in chat", reference: "#330678", status: { kind: "open", label: "Open" } },
      { kind: "pullRequest", title: "Render rich links", reference: "#330678", status: { kind: "merged", label: "Merged" }, secondaryStatus: { kind: "success", label: "Checks passed" } },
      { kind: "commit", title: "Refine rich links", reference: "4d291e3", changes: { insertions: 42, deletions: 7 } },
      { kind: "file", title: "chatRichLink.ts", detail: "src/vs/workbench/contrib/chat" },
      { kind: "folder", title: "componentFixtures", detail: "src/vs/workbench/test/browser" },
      { kind: "repository", title: "microsoft/vscode", detail: "main" }
    ])
  })
});
export {
  chatRichLink_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxjaGF0XFxjaGF0UmljaExpbmsuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTGlua1ByZXNlbnRhdGlvbiwgSUxpbmtQcmVzZW50YXRpb25SdWxlLCBJTGlua1ByZXNlbnRhdGlvblNlcnZpY2UsIElMaW5rUHJlc2VudGF0aW9uV2F0Y2hlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBDaGF0UmljaExpbmssIElDaGF0TGlua1ByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRSaWNoTGluay5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IHJlbmRlckNoYXRXaWRnZXQgfSBmcm9tICcuL2NoYXRXaWRnZXQuZml4dHVyZS5qcyc7XG5cbmZ1bmN0aW9uIHJlbmRlclJpY2hMaW5rcyhjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgcHJlc2VudGF0aW9uczogcmVhZG9ubHkgSUNoYXRMaW5rUHJlc2VudGF0aW9uW10pOiB2b2lkIHtcblx0Y29udGV4dC5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXdvcmtiZW5jaCcsICdjaGF0LXJpY2gtbGluay1maXh0dXJlJyk7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZ3JpZCc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmdyaWRUZW1wbGF0ZUNvbHVtbnMgPSAncmVwZWF0KDIsIG1heC1jb250ZW50KSc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0Y29udGV4dC5jb250YWluZXIuc3R5bGUuZ2FwID0gJzEycHgnO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzEycHgnO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc3MjBweCc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLm1pbkhlaWdodCA9ICcxODBweCc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJztcblxuXHRmb3IgKGNvbnN0IHByZXNlbnRhdGlvbiBvZiBwcmVzZW50YXRpb25zKSB7XG5cdFx0Y29uc3QgYW5jaG9yID0gY29udGV4dC5jb250YWluZXIub3duZXJEb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0YW5jaG9yLmhyZWYgPSAnIyc7XG5cdFx0Y29uc3QgYXV0aG9yZWRMYWJlbCA9IGNvbnRleHQuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGF1dGhvcmVkTGFiZWwudGV4dENvbnRlbnQgPSBwcmVzZW50YXRpb24udGl0bGUgPz8gcHJlc2VudGF0aW9uLnJlZmVyZW5jZSA/PyBwcmVzZW50YXRpb24ua2luZDtcblx0XHRjb25zdCByaWNoTGluayA9IGNvbnRleHQuZGlzcG9zYWJsZVN0b3JlLmFkZChDaGF0UmljaExpbmsubW91bnQoYW5jaG9yLCBhdXRob3JlZExhYmVsKSk7XG5cdFx0cmljaExpbmsudXBkYXRlKHByZXNlbnRhdGlvbik7XG5cdFx0Y29udGV4dC5jb250YWluZXIuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVMaW5rUHJlc2VudGF0aW9uU2VydmljZShwcmVzZW50YXRpb246IElMaW5rUHJlc2VudGF0aW9uKTogSUxpbmtQcmVzZW50YXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxpbmtQcmVzZW50YXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRMaW5rUHJlc2VudGF0aW9uUnVsZSgpOiBJTGlua1ByZXNlbnRhdGlvblJ1bGUge1xuXHRcdFx0cmV0dXJuIHsgaWQ6ICdmaXh0dXJlJywgdXJpUGF0dGVybjogLy4qLywgaW5pdGlhbEtpbmQ6ICdyZXNvdXJjZScgfTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgY3JlYXRlTGlua1ByZXNlbnRhdGlvbldhdGNoZXIoKTogSUxpbmtQcmVzZW50YXRpb25XYXRjaGVyIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByZXNlbnRhdGlvbjogY29uc3RPYnNlcnZhYmxlKHByZXNlbnRhdGlvbiksXG5cdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0fSgpO1xufVxuXG5jb25zdCBnaXRodWJQdWxsUmVxdWVzdFByZXNlbnRhdGlvbjogSUxpbmtQcmVzZW50YXRpb24gPSB7XG5cdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdHRpdGxlOiAnVmFsaWRhdGUgc2NoZW1hcyB0aHJvdWdoIGRlY2xhcmVkIG1ldGEtc2NoZW1hcycsXG5cdHJlZmVyZW5jZTogJyM3Jyxcblx0c3RhdHVzOiB7IGtpbmQ6ICdkcmFmdCcsIGxhYmVsOiAnRHJhZnQnIH0sXG5cdHNlY29uZGFyeVN0YXR1czogeyBraW5kOiAnc3VjY2VzcycsIGxhYmVsOiAnQ2hlY2tzIHBhc3NlZCcgfSxcblx0dG9vbHRpcDogJ2hlZGlldC9kZW1vLWpzb24tc2NoZW1hLXZhbGlkYXRvciM3IFx1MDBCNyBEcmFmdCBcdTAwQjcgQ2hlY2tzIHBhc3NlZCcsXG5cdGFyaWFMYWJlbDogJ1B1bGwgcmVxdWVzdCBoZWRpZXQgc2xhc2ggZGVtby1qc29uLXNjaGVtYS12YWxpZGF0b3IgbnVtYmVyIDcsIERyYWZ0LCBDaGVja3MgcGFzc2VkOiBWYWxpZGF0ZSBzY2hlbWFzIHRocm91Z2ggZGVjbGFyZWQgbWV0YS1zY2hlbWFzJyxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdjaGF0LycgfSwge1xuXHRpbkNoYXQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJDaGF0V2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdHdpZHRoOiA3MjAsXG5cdFx0XHRoZWlnaHQ6IDMyMCxcblx0XHRcdGlucHV0VmlzaWJsZTogZmFsc2UsXG5cdFx0XHRsaW5rUHJlc2VudGF0aW9uU2VydmljZTogY3JlYXRlTGlua1ByZXNlbnRhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRraW5kOiAnc2Vzc2lvbicsXG5cdFx0XHRcdHRpdGxlOiAnSW1wbGVtZW50IHJpY2ggbGlua3MnLFxuXHRcdFx0XHRkZXRhaWw6ICdBZ2VudCBzZXNzaW9uJyxcblx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdwZW5kaW5nJywgbGFiZWw6ICdXb3JraW5nJyB9LFxuXHRcdFx0fSksXG5cdFx0XHRtZXNzYWdlczogW3tcblx0XHRcdFx0dXNlcjogJ0NvbnRpbnVlIHRoZSBpbXBsZW1lbnRhdGlvbicsXG5cdFx0XHRcdGFzc2lzdGFudDogW3tcblx0XHRcdFx0XHRraW5kOiAnbWFya2Rvd24nLFxuXHRcdFx0XHRcdHRleHQ6ICdUaGUgW2ltcGxlbWVudGF0aW9uIHNlc3Npb25dKGFnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3RjbGkvcmljaC1saW5rcykgaXMgc3RpbGwgd29ya2luZy4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pLFxuXHR9KSxcblx0Z2l0aHViUHVsbFJlcXVlc3RJbkNoYXQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJDaGF0V2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdHdpZHRoOiA3MjAsXG5cdFx0XHRoZWlnaHQ6IDMyMCxcblx0XHRcdGlucHV0VmlzaWJsZTogZmFsc2UsXG5cdFx0XHRsaW5rUHJlc2VudGF0aW9uU2VydmljZTogY3JlYXRlTGlua1ByZXNlbnRhdGlvblNlcnZpY2UoZ2l0aHViUHVsbFJlcXVlc3RQcmVzZW50YXRpb24pLFxuXHRcdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHRcdHVzZXI6ICdXaGF0IGlzIG9wZW4/Jyxcblx0XHRcdFx0YXNzaXN0YW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0dGV4dDogJyMjIE9wZW5cXG5cXG4tIFsjNyBcdTIwMTQgVmFsaWRhdGUgc2NoZW1hcyB0aHJvdWdoIGRlY2xhcmVkIG1ldGEtc2NoZW1hc10oaHR0cHM6Ly9naXRodWIuY29tL2hlZGlldC9kZW1vLWpzb24tc2NoZW1hLXZhbGlkYXRvci9wdWxsLzcpIFx1MjAxNCAqKkRyYWZ0KionLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pLFxuXHR9KSxcblx0bG9hZGluZ0dpdGh1YlB1bGxSZXF1ZXN0SW5DaGF0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyQ2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0XHR3aWR0aDogNzIwLFxuXHRcdFx0aGVpZ2h0OiAzMjAsXG5cdFx0XHRpbnB1dFZpc2libGU6IGZhbHNlLFxuXHRcdFx0bGlua1ByZXNlbnRhdGlvblNlcnZpY2U6IGNyZWF0ZUxpbmtQcmVzZW50YXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0Li4uZ2l0aHViUHVsbFJlcXVlc3RQcmVzZW50YXRpb24sXG5cdFx0XHRcdGlzTG9hZGluZzogdHJ1ZSxcblx0XHRcdH0pLFxuXHRcdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHRcdHVzZXI6ICdXaGF0IGlzIG9wZW4/Jyxcblx0XHRcdFx0YXNzaXN0YW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0dGV4dDogJyMjIE9wZW5cXG5cXG4tIFsjNyBcdTIwMTQgVmFsaWRhdGUgc2NoZW1hcyB0aHJvdWdoIGRlY2xhcmVkIG1ldGEtc2NoZW1hc10oaHR0cHM6Ly9naXRodWIuY29tL2hlZGlldC9kZW1vLWpzb24tc2NoZW1hLXZhbGlkYXRvci9wdWxsLzcpIFx1MjAxNCAqKkRyYWZ0KionLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pLFxuXHR9KSxcblx0c2Vzc2lvblN0YXRlczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlclJpY2hMaW5rcyhjb250ZXh0LCBbXG5cdFx0XHR7IGtpbmQ6ICdzZXNzaW9uJywgdGl0bGU6ICdQcmVwYXJpbmcgaW1wbGVtZW50YXRpb24nLCBzdGF0dXM6IHsga2luZDogJ3BlbmRpbmcnLCBsYWJlbDogJ0xvYWRpbmcnIH0gfSxcblx0XHRcdHsga2luZDogJ3Nlc3Npb24nLCB0aXRsZTogJ0ltcGxlbWVudCByaWNoIGxpbmtzJywgc3RhdHVzOiB7IGtpbmQ6ICdwZW5kaW5nJywgbGFiZWw6ICdXb3JraW5nJyB9IH0sXG5cdFx0XHR7IGtpbmQ6ICdzZXNzaW9uJywgdGl0bGU6ICdSZXZpZXcgYXJjaGl0ZWN0dXJlJywgc3RhdHVzOiB7IGtpbmQ6ICd3YXJuaW5nJywgbGFiZWw6ICdOZWVkcyBpbnB1dCcgfSB9LFxuXHRcdFx0eyBraW5kOiAnc2Vzc2lvbicsIHRpdGxlOiAnVXBkYXRlIGZpeHR1cmVzJywgc3RhdHVzOiB7IGtpbmQ6ICdzdWNjZXNzJywgbGFiZWw6ICdDb21wbGV0ZWQnIH0gfSxcblx0XHRcdHsga2luZDogJ3Nlc3Npb24nLCB0aXRsZTogJ1J1biB2YWxpZGF0aW9uJywgc3RhdHVzOiB7IGtpbmQ6ICdlcnJvcicsIGxhYmVsOiAnRXJyb3InIH0gfSxcblx0XHRdKSxcblx0fSksXG5cdHByZXNlbnRhdGlvbktpbmRzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyUmljaExpbmtzKGNvbnRleHQsIFtcblx0XHRcdHsga2luZDogJ2lzc3VlJywgdGl0bGU6ICdSaWNoIGxpbmtzIGluIGNoYXQnLCByZWZlcmVuY2U6ICcjMzMwNjc4Jywgc3RhdHVzOiB7IGtpbmQ6ICdvcGVuJywgbGFiZWw6ICdPcGVuJyB9IH0sXG5cdFx0XHR7IGtpbmQ6ICdwdWxsUmVxdWVzdCcsIHRpdGxlOiAnUmVuZGVyIHJpY2ggbGlua3MnLCByZWZlcmVuY2U6ICcjMzMwNjc4Jywgc3RhdHVzOiB7IGtpbmQ6ICdtZXJnZWQnLCBsYWJlbDogJ01lcmdlZCcgfSwgc2Vjb25kYXJ5U3RhdHVzOiB7IGtpbmQ6ICdzdWNjZXNzJywgbGFiZWw6ICdDaGVja3MgcGFzc2VkJyB9IH0sXG5cdFx0XHR7IGtpbmQ6ICdjb21taXQnLCB0aXRsZTogJ1JlZmluZSByaWNoIGxpbmtzJywgcmVmZXJlbmNlOiAnNGQyOTFlMycsIGNoYW5nZXM6IHsgaW5zZXJ0aW9uczogNDIsIGRlbGV0aW9uczogNyB9IH0sXG5cdFx0XHR7IGtpbmQ6ICdmaWxlJywgdGl0bGU6ICdjaGF0UmljaExpbmsudHMnLCBkZXRhaWw6ICdzcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdCcgfSxcblx0XHRcdHsga2luZDogJ2ZvbGRlcicsIHRpdGxlOiAnY29tcG9uZW50Rml4dHVyZXMnLCBkZXRhaWw6ICdzcmMvdnMvd29ya2JlbmNoL3Rlc3QvYnJvd3NlcicgfSxcblx0XHRcdHsga2luZDogJ3JlcG9zaXRvcnknLCB0aXRsZTogJ21pY3Jvc29mdC92c2NvZGUnLCBkZXRhaWw6ICdtYWluJyB9LFxuXHRcdF0pLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBRXJCLFNBQVMsb0JBQTJDO0FBQ3BELFNBQWtDLHdCQUF3QixnQ0FBZ0M7QUFDMUYsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxnQkFBZ0IsU0FBa0MsZUFBdUQ7QUFDakgsVUFBUSxVQUFVLFVBQVUsSUFBSSxvQkFBb0Isd0JBQXdCO0FBQzVFLFVBQVEsVUFBVSxNQUFNLFVBQVU7QUFDbEMsVUFBUSxVQUFVLE1BQU0sc0JBQXNCO0FBQzlDLFVBQVEsVUFBVSxNQUFNLGFBQWE7QUFDckMsVUFBUSxVQUFVLE1BQU0sTUFBTTtBQUM5QixVQUFRLFVBQVUsTUFBTSxVQUFVO0FBQ2xDLFVBQVEsVUFBVSxNQUFNLFFBQVE7QUFDaEMsVUFBUSxVQUFVLE1BQU0sWUFBWTtBQUNwQyxVQUFRLFVBQVUsTUFBTSxrQkFBa0I7QUFFMUMsYUFBVyxnQkFBZ0IsZUFBZTtBQUN6QyxVQUFNLFNBQVMsUUFBUSxVQUFVLGNBQWMsY0FBYyxHQUFHO0FBQ2hFLFdBQU8sT0FBTztBQUNkLFVBQU0sZ0JBQWdCLFFBQVEsVUFB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
