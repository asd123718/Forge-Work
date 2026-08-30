import { $ } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Button, ButtonBar, ButtonWithDescription, unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { Toggle, Checkbox, unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { InputBox, MessageType, unthemedInboxStyles } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { defineComponentFixture, defineThemedFixtureGroup } from "./fixtureUtils.js";
var baseUI_fixture_default = defineThemedFixtureGroup({
  Buttons: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderButtons
  }),
  ButtonBar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderButtonBar
  }),
  Toggles: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderToggles
  }),
  InputBoxes: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderInputBoxes
  }),
  CountBadges: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderCountBadges
  }),
  ActionBar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderActionBar
  }),
  ProgressBars: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderProgressBars
  }),
  HighlightedLabels: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderHighlightedLabels
  })
});
const themedButtonStyles = {
  ...unthemedButtonStyles,
  buttonBackground: "var(--vscode-button-background)",
  buttonHoverBackground: "var(--vscode-button-hoverBackground)",
  buttonForeground: "var(--vscode-button-foreground)",
  buttonSecondaryBackground: "var(--vscode-button-secondaryBackground)",
  buttonSecondaryHoverBackground: "var(--vscode-button-secondaryHoverBackground)",
  buttonSecondaryForeground: "var(--vscode-button-secondaryForeground)",
  buttonBorder: "var(--vscode-button-border)"
};
const themedToggleStyles = {
  ...unthemedToggleStyles,
  inputActiveOptionBorder: "var(--vscode-inputOption-activeBorder)",
  inputActiveOptionForeground: "var(--vscode-inputOption-activeForeground)",
  inputActiveOptionBackground: "var(--vscode-inputOption-activeBackground)"
};
const themedCheckboxStyles = {
  checkboxBackground: "var(--vscode-checkbox-background)",
  checkboxBorder: "var(--vscode-checkbox-border)",
  checkboxForeground: "var(--vscode-checkbox-foreground)",
  checkboxDisabledBackground: void 0,
  checkboxDisabledForeground: void 0
};
const themedInputBoxStyles = {
  ...unthemedInboxStyles,
  inputBackground: "var(--vscode-input-background)",
  inputForeground: "var(--vscode-input-foreground)",
  inputBorder: "var(--vscode-input-border)",
  inputValidationInfoBackground: "var(--vscode-inputValidation-infoBackground)",
  inputValidationInfoBorder: "var(--vscode-inputValidation-infoBorder)",
  inputValidationWarningBackground: "var(--vscode-inputValidation-warningBackground)",
  inputValidationWarningBorder: "var(--vscode-inputValidation-warningBorder)",
  inputValidationErrorBackground: "var(--vscode-inputValidation-errorBackground)",
  inputValidationErrorBorder: "var(--vscode-inputValidation-errorBorder)"
};
const themedBadgeStyles = {
  badgeBackground: "var(--vscode-badge-background)",
  badgeForeground: "var(--vscode-badge-foreground)",
  badgeBorder: void 0
};
const themedProgressBarOptions = {
  progressBarBackground: "var(--vscode-progressBar-background)"
};
function renderButtons({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";
  const primarySection = $("div");
  primarySection.style.display = "flex";
  primarySection.style.gap = "8px";
  primarySection.style.alignItems = "center";
  container.appendChild(primarySection);
  const primaryButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "Primary button" }));
  primaryButton.label = "Primary Button";
  const primaryIconButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "With Icon", supportIcons: true }));
  primaryIconButton.label = "$(add) Add Item";
  const smallButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: "Small button", small: true }));
  smallButton.label = "Small";
  const secondarySection = $("div");
  secondarySection.style.display = "flex";
  secondarySection.style.gap = "8px";
  secondarySection.style.alignItems = "center";
  container.appendChild(secondarySection);
  const secondaryButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: "Secondary button" }));
  secondaryButton.label = "Secondary Button";
  const secondaryIconButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: "Cancel", supportIcons: true }));
  secondaryIconButton.label = "$(close) Cancel";
  const disabledSection = $("div");
  disabledSection.style.display = "flex";
  disabledSection.style.gap = "8px";
  disabledSection.style.alignItems = "center";
  container.appendChild(disabledSection);
  const disabledButton = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, title: "Disabled", disabled: true }));
  disabledButton.label = "Disabled";
  disabledButton.enabled = false;
  const disabledSecondary = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, secondary: true, title: "Disabled Secondary", disabled: true }));
  disabledSecondary.label = "Disabled Secondary";
  disabledSecondary.enabled = false;
}
function renderButtonBar({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  const barContainer = $("div");
  container.appendChild(barContainer);
  const buttonBar = new ButtonBar(barContainer);
  disposableStore.add(buttonBar);
  const okButton = buttonBar.addButton({ ...themedButtonStyles, title: "OK" });
  okButton.label = "OK";
  const cancelButton = buttonBar.addButton({ ...themedButtonStyles, secondary: true, title: "Cancel" });
  cancelButton.label = "Cancel";
  const descContainer = $("div");
  descContainer.style.width = "300px";
  container.appendChild(descContainer);
  const buttonWithDesc = disposableStore.add(new ButtonWithDescription(descContainer, { ...themedButtonStyles, title: "Install Extension", supportIcons: true }));
  buttonWithDesc.label = "$(extensions) Install Extension";
  buttonWithDesc.description = "This will install the extension and enable it globally";
}
function renderToggles({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";
  const toggleSection = $("div");
  toggleSection.style.display = "flex";
  toggleSection.style.gap = "16px";
  toggleSection.style.alignItems = "center";
  container.appendChild(toggleSection);
  const toggle1 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Case Sensitive",
    isChecked: false,
    icon: Codicon.caseSensitive
  }));
  toggleSection.appendChild(toggle1.domNode);
  const toggle2 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Whole Word",
    isChecked: true,
    icon: Codicon.wholeWord
  }));
  toggleSection.appendChild(toggle2.domNode);
  const toggle3 = disposableStore.add(new Toggle({
    ...themedToggleStyles,
    title: "Use Regular Expression",
    isChecked: false,
    icon: Codicon.regex
  }));
  toggleSection.appendChild(toggle3.domNode);
  const checkboxSection = $("div");
  checkboxSection.style.display = "flex";
  checkboxSection.style.flexDirection = "column";
  checkboxSection.style.gap = "8px";
  container.appendChild(checkboxSection);
  const createCheckboxRow = (label, checked) => {
    const row = $("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    const checkbox = disposableStore.add(new Checkbox(label, checked, themedCheckboxStyles));
    row.appendChild(checkbox.domNode);
    const labelEl = $("span");
    labelEl.textContent = label;
    labelEl.style.color = "var(--vscode-foreground)";
    row.appendChild(labelEl);
    return row;
  };
  checkboxSection.appendChild(createCheckboxRow("Enable auto-save", true));
  checkboxSection.appendChild(createCheckboxRow("Show line numbers", true));
  checkboxSection.appendChild(createCheckboxRow("Word wrap", false));
}
function renderInputBoxes({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  container.style.width = "350px";
  const filledInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "File path",
    inputBoxStyles: themedInputBoxStyles
  }));
  filledInput.value = "/src/vs/editor/browser";
  const infoInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Username",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => value.length < 3 ? { content: "Username must be at least 3 characters", type: MessageType.INFO } : null
    }
  }));
  infoInput.value = "ab";
  infoInput.validate();
  const warningInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Password",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => value.length < 8 ? { content: "Password should be at least 8 characters for security", type: MessageType.WARNING } : null
    }
  }));
  warningInput.value = "pass";
  warningInput.validate();
  const errorInput = disposableStore.add(new InputBox(container, void 0, {
    placeholder: "Email address",
    inputBoxStyles: themedInputBoxStyles,
    validationOptions: {
      validation: (value) => !value.includes("@") ? { content: "Please enter a valid email address", type: MessageType.ERROR } : null
    }
  }));
  errorInput.value = "invalid-email";
  errorInput.validate();
}
function renderCountBadges({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.gap = "12px";
  container.style.alignItems = "center";
  const counts = [1, 5, 12, 99, 999];
  for (const count of counts) {
    const badgeContainer = $("div");
    badgeContainer.style.display = "flex";
    badgeContainer.style.alignItems = "center";
    badgeContainer.style.gap = "8px";
    const label = $("span");
    label.textContent = "Issues";
    label.style.color = "var(--vscode-foreground)";
    badgeContainer.appendChild(label);
    disposableStore.add(new CountBadge(badgeContainer, { count }, themedBadgeStyles));
    container.appendChild(badgeContainer);
  }
}
function renderActionBar({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  const horizontalLabel = $("div");
  horizontalLabel.textContent = "Horizontal Actions:";
  horizontalLabel.style.color = "var(--vscode-foreground)";
  horizontalLabel.style.marginBottom = "4px";
  container.appendChild(horizontalLabel);
  const horizontalContainer = $("div");
  container.appendChild(horizontalContainer);
  const horizontalBar = disposableStore.add(new ActionBar(horizontalContainer, {
    ariaLabel: "Editor Actions"
  }));
  horizontalBar.push([
    disposableStore.add(new Action("editor.action.save", "Save", ThemeIcon.asClassName(Codicon.save), true, async () => console.log("Save"))),
    disposableStore.add(new Action("editor.action.undo", "Undo", ThemeIcon.asClassName(Codicon.discard), true, async () => console.log("Undo"))),
    disposableStore.add(new Action("editor.action.redo", "Redo", ThemeIcon.asClassName(Codicon.redo), true, async () => console.log("Redo"))),
    new Separator(),
    disposableStore.add(new Action("editor.action.find", "Find", ThemeIcon.asClassName(Codicon.search), true, async () => console.log("Find"))),
    disposableStore.add(new Action("editor.action.replace", "Replace", ThemeIcon.asClassName(Codicon.replaceAll), true, async () => console.log("Replace")))
  ]);
  const mixedLabel = $("div");
  mixedLabel.textContent = "Mixed States:";
  mixedLabel.style.color = "var(--vscode-foreground)";
  mixedLabel.style.marginBottom = "4px";
  container.appendChild(mixedLabel);
  const mixedContainer = $("div");
  container.appendChild(mixedContainer);
  const mixedBar = disposableStore.add(new ActionBar(mixedContainer, {
    ariaLabel: "Mixed Actions"
  }));
  mixedBar.push([
    disposableStore.add(new Action("action.enabled", "Enabled", ThemeIcon.asClassName(Codicon.play), true, async () => {
    })),
    disposableStore.add(new Action("action.disabled", "Disabled", ThemeIcon.asClassName(Codicon.debugPause), false, async () => {
    })),
    disposableStore.add(new Action("action.enabled2", "Enabled", ThemeIcon.asClassName(Codicon.debugStop), true, async () => {
    }))
  ]);
}
function renderProgressBars({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "24px";
  container.style.width = "400px";
  const createSection = (label) => {
    const section = $("div");
    const labelEl = $("div");
    labelEl.textContent = label;
    labelEl.style.color = "var(--vscode-foreground)";
    labelEl.style.marginBottom = "8px";
    labelEl.style.fontSize = "12px";
    section.appendChild(labelEl);
    const barContainer = $("div");
    barContainer.style.position = "relative";
    barContainer.style.width = "100%";
    barContainer.style.height = "4px";
    barContainer.style.overflow = "hidden";
    section.appendChild(barContainer);
    container.appendChild(section);
    return barContainer;
  };
  const progress30Section = createSection("Discrete Progress - 30%");
  const progress30Bar = disposableStore.add(new ProgressBar(progress30Section, themedProgressBarOptions));
  progress30Bar.total(100);
  progress30Bar.worked(30);
  const progress60Section = createSection("Discrete Progress - 60%");
  const progress60Bar = disposableStore.add(new ProgressBar(progress60Section, themedProgressBarOptions));
  progress60Bar.total(100);
  progress60Bar.worked(60);
  const progress90Section = createSection("Discrete Progress - 90%");
  const progress90Bar = disposableStore.add(new ProgressBar(progress90Section, themedProgressBarOptions));
  progress90Bar.total(100);
  progress90Bar.worked(90);
  const doneSection = createSection("Completed (100%)");
  const doneBar = disposableStore.add(new ProgressBar(doneSection, themedProgressBarOptions));
  doneBar.total(100);
  doneBar.worked(100);
}
function renderHighlightedLabels({ container, disposableStore }) {
  container.style.padding = "16px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "8px";
  container.style.color = "var(--vscode-foreground)";
  const createHighlightedLabel = (text, highlights) => {
    const row = $("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    const labelContainer = $("div");
    const label = disposableStore.add(new HighlightedLabel(labelContainer));
    label.set(text, highlights);
    row.appendChild(labelContainer);
    const queryLabel = $("span");
    queryLabel.style.color = "var(--vscode-descriptionForeground)";
    queryLabel.style.fontSize = "12px";
    queryLabel.textContent = `(matches highlighted)`;
    row.appendChild(queryLabel);
    return row;
  };
  container.appendChild(createHighlightedLabel("codeEditorWidget.ts", [{ start: 0, end: 4 }]));
  container.appendChild(createHighlightedLabel("inlineCompletionsController.ts", [{ start: 6, end: 10 }]));
  container.appendChild(createHighlightedLabel("diffEditorViewModel.ts", [{ start: 0, end: 4 }, { start: 10, end: 14 }]));
  container.appendChild(createHighlightedLabel("workbenchTestServices.ts", [{ start: 9, end: 13 }]));
}
export {
  baseUI_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxiYXNlVUkuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcblxuLy8gVUkgQ29tcG9uZW50c1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25CYXIsIEJ1dHRvbldpdGhEZXNjcmlwdGlvbiwgdW50aGVtZWRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBUb2dnbGUsIENoZWNrYm94LCB1bnRoZW1lZFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElucHV0Qm94LCBNZXNzYWdlVHlwZSwgdW50aGVtZWRJbmJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBIaWdobGlnaHRlZExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5cbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAgfSBmcm9tICcuL2ZpeHR1cmVVdGlscy5qcyc7XG5cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHtcblx0QnV0dG9uczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyQnV0dG9ucyxcblx0fSksXG5cblx0QnV0dG9uQmFyOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJCdXR0b25CYXIsXG5cdH0pLFxuXG5cdFRvZ2dsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlclRvZ2dsZXMsXG5cdH0pLFxuXG5cdElucHV0Qm94ZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlcklucHV0Qm94ZXMsXG5cdH0pLFxuXG5cdENvdW50QmFkZ2VzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJDb3VudEJhZGdlcyxcblx0fSksXG5cblx0QWN0aW9uQmFyOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJBY3Rpb25CYXIsXG5cdH0pLFxuXG5cdFByb2dyZXNzQmFyczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyUHJvZ3Jlc3NCYXJzLFxuXHR9KSxcblxuXHRIaWdobGlnaHRlZExhYmVsczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVySGlnaGxpZ2h0ZWRMYWJlbHMsXG5cdH0pLFxufSk7XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU3R5bGVzICh0aGVtZWQgdmVyc2lvbnMgZm9yIGZpeHR1cmUgZGlzcGxheSlcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY29uc3QgdGhlbWVkQnV0dG9uU3R5bGVzID0ge1xuXHQuLi51bnRoZW1lZEJ1dHRvblN0eWxlcyxcblx0YnV0dG9uQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tYmFja2dyb3VuZCknLFxuXHRidXR0b25Ib3ZlckJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLWhvdmVyQmFja2dyb3VuZCknLFxuXHRidXR0b25Gb3JlZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1mb3JlZ3JvdW5kKScsXG5cdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUJhY2tncm91bmQpJyxcblx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQpJyxcblx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5Rm9yZWdyb3VuZCknLFxuXHRidXR0b25Cb3JkZXI6ICd2YXIoLS12c2NvZGUtYnV0dG9uLWJvcmRlciknLFxufTtcblxuY29uc3QgdGhlbWVkVG9nZ2xlU3R5bGVzID0ge1xuXHQuLi51bnRoZW1lZFRvZ2dsZVN0eWxlcyxcblx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6ICd2YXIoLS12c2NvZGUtaW5wdXRPcHRpb24tYWN0aXZlQm9yZGVyKScsXG5cdGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dE9wdGlvbi1hY3RpdmVGb3JlZ3JvdW5kKScsXG5cdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dE9wdGlvbi1hY3RpdmVCYWNrZ3JvdW5kKScsXG59O1xuXG5jb25zdCB0aGVtZWRDaGVja2JveFN0eWxlcyA9IHtcblx0Y2hlY2tib3hCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWNoZWNrYm94LWJhY2tncm91bmQpJyxcblx0Y2hlY2tib3hCb3JkZXI6ICd2YXIoLS12c2NvZGUtY2hlY2tib3gtYm9yZGVyKScsXG5cdGNoZWNrYm94Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1jaGVja2JveC1mb3JlZ3JvdW5kKScsXG5cdGNoZWNrYm94RGlzYWJsZWRCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGNoZWNrYm94RGlzYWJsZWRGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG59O1xuXG5jb25zdCB0aGVtZWRJbnB1dEJveFN0eWxlcyA9IHtcblx0Li4udW50aGVtZWRJbmJveFN0eWxlcyxcblx0aW5wdXRCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlucHV0LWJhY2tncm91bmQpJyxcblx0aW5wdXRGb3JlZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlucHV0LWZvcmVncm91bmQpJyxcblx0aW5wdXRCb3JkZXI6ICd2YXIoLS12c2NvZGUtaW5wdXQtYm9yZGVyKScsXG5cdGlucHV0VmFsaWRhdGlvbkluZm9CYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1pbmZvQmFja2dyb3VuZCknLFxuXHRpbnB1dFZhbGlkYXRpb25JbmZvQm9yZGVyOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1pbmZvQm9yZGVyKScsXG5cdGlucHV0VmFsaWRhdGlvbldhcm5pbmdCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi13YXJuaW5nQmFja2dyb3VuZCknLFxuXHRpbnB1dFZhbGlkYXRpb25XYXJuaW5nQm9yZGVyOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi13YXJuaW5nQm9yZGVyKScsXG5cdGlucHV0VmFsaWRhdGlvbkVycm9yQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24tZXJyb3JCYWNrZ3JvdW5kKScsXG5cdGlucHV0VmFsaWRhdGlvbkVycm9yQm9yZGVyOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1lcnJvckJvcmRlciknLFxufTtcblxuY29uc3QgdGhlbWVkQmFkZ2VTdHlsZXMgPSB7XG5cdGJhZGdlQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1iYWRnZS1iYWNrZ3JvdW5kKScsXG5cdGJhZGdlRm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1iYWRnZS1mb3JlZ3JvdW5kKScsXG5cdGJhZGdlQm9yZGVyOiB1bmRlZmluZWQsXG59O1xuXG5jb25zdCB0aGVtZWRQcm9ncmVzc0Jhck9wdGlvbnMgPSB7XG5cdHByb2dyZXNzQmFyQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1wcm9ncmVzc0Jhci1iYWNrZ3JvdW5kKScsXG59O1xuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJ1dHRvbnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gcmVuZGVyQnV0dG9ucyh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcxMnB4JztcblxuXHQvLyBTZWN0aW9uOiBQcmltYXJ5IEJ1dHRvbnNcblx0Y29uc3QgcHJpbWFyeVNlY3Rpb24gPSAkKCdkaXYnKTtcblx0cHJpbWFyeVNlY3Rpb24uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0cHJpbWFyeVNlY3Rpb24uc3R5bGUuZ2FwID0gJzhweCc7XG5cdHByaW1hcnlTZWN0aW9uLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHByaW1hcnlTZWN0aW9uKTtcblxuXHRjb25zdCBwcmltYXJ5QnV0dG9uID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQnV0dG9uKHByaW1hcnlTZWN0aW9uLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgdGl0bGU6ICdQcmltYXJ5IGJ1dHRvbicgfSkpO1xuXHRwcmltYXJ5QnV0dG9uLmxhYmVsID0gJ1ByaW1hcnkgQnV0dG9uJztcblxuXHRjb25zdCBwcmltYXJ5SWNvbkJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihwcmltYXJ5U2VjdGlvbiwgeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHRpdGxlOiAnV2l0aCBJY29uJywgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0cHJpbWFyeUljb25CdXR0b24ubGFiZWwgPSAnJChhZGQpIEFkZCBJdGVtJztcblxuXHRjb25zdCBzbWFsbEJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihwcmltYXJ5U2VjdGlvbiwgeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHRpdGxlOiAnU21hbGwgYnV0dG9uJywgc21hbGw6IHRydWUgfSkpO1xuXHRzbWFsbEJ1dHRvbi5sYWJlbCA9ICdTbWFsbCc7XG5cblx0Ly8gU2VjdGlvbjogU2Vjb25kYXJ5IEJ1dHRvbnNcblx0Y29uc3Qgc2Vjb25kYXJ5U2VjdGlvbiA9ICQoJ2RpdicpO1xuXHRzZWNvbmRhcnlTZWN0aW9uLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdHNlY29uZGFyeVNlY3Rpb24uc3R5bGUuZ2FwID0gJzhweCc7XG5cdHNlY29uZGFyeVNlY3Rpb24uc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2Vjb25kYXJ5U2VjdGlvbik7XG5cblx0Y29uc3Qgc2Vjb25kYXJ5QnV0dG9uID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQnV0dG9uKHNlY29uZGFyeVNlY3Rpb24sIHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHRpdGxlOiAnU2Vjb25kYXJ5IGJ1dHRvbicgfSkpO1xuXHRzZWNvbmRhcnlCdXR0b24ubGFiZWwgPSAnU2Vjb25kYXJ5IEJ1dHRvbic7XG5cblx0Y29uc3Qgc2Vjb25kYXJ5SWNvbkJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihzZWNvbmRhcnlTZWN0aW9uLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogJ0NhbmNlbCcsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdHNlY29uZGFyeUljb25CdXR0b24ubGFiZWwgPSAnJChjbG9zZSkgQ2FuY2VsJztcblxuXHQvLyBTZWN0aW9uOiBEaXNhYmxlZCBCdXR0b25zXG5cdGNvbnN0IGRpc2FibGVkU2VjdGlvbiA9ICQoJ2RpdicpO1xuXHRkaXNhYmxlZFNlY3Rpb24uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0ZGlzYWJsZWRTZWN0aW9uLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRkaXNhYmxlZFNlY3Rpb24uc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZGlzYWJsZWRTZWN0aW9uKTtcblxuXHRjb25zdCBkaXNhYmxlZEJ1dHRvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihkaXNhYmxlZFNlY3Rpb24sIHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCB0aXRsZTogJ0Rpc2FibGVkJywgZGlzYWJsZWQ6IHRydWUgfSkpO1xuXHRkaXNhYmxlZEJ1dHRvbi5sYWJlbCA9ICdEaXNhYmxlZCc7XG5cdGRpc2FibGVkQnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblxuXHRjb25zdCBkaXNhYmxlZFNlY29uZGFyeSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbihkaXNhYmxlZFNlY3Rpb24sIHsgLi4udGhlbWVkQnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHRpdGxlOiAnRGlzYWJsZWQgU2Vjb25kYXJ5JywgZGlzYWJsZWQ6IHRydWUgfSkpO1xuXHRkaXNhYmxlZFNlY29uZGFyeS5sYWJlbCA9ICdEaXNhYmxlZCBTZWNvbmRhcnknO1xuXHRkaXNhYmxlZFNlY29uZGFyeS5lbmFibGVkID0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckJ1dHRvbkJhcih7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcxNnB4JztcblxuXHQvLyBCdXR0b24gQmFyXG5cdGNvbnN0IGJhckNvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoYmFyQ29udGFpbmVyKTtcblxuXHRjb25zdCBidXR0b25CYXIgPSBuZXcgQnV0dG9uQmFyKGJhckNvbnRhaW5lcik7XG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQoYnV0dG9uQmFyKTtcblxuXHRjb25zdCBva0J1dHRvbiA9IGJ1dHRvbkJhci5hZGRCdXR0b24oeyAuLi50aGVtZWRCdXR0b25TdHlsZXMsIHRpdGxlOiAnT0snIH0pO1xuXHRva0J1dHRvbi5sYWJlbCA9ICdPSyc7XG5cblx0Y29uc3QgY2FuY2VsQnV0dG9uID0gYnV0dG9uQmFyLmFkZEJ1dHRvbih7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogJ0NhbmNlbCcgfSk7XG5cdGNhbmNlbEJ1dHRvbi5sYWJlbCA9ICdDYW5jZWwnO1xuXG5cdC8vIEJ1dHRvbiB3aXRoIERlc2NyaXB0aW9uXG5cdGNvbnN0IGRlc2NDb250YWluZXIgPSAkKCdkaXYnKTtcblx0ZGVzY0NvbnRhaW5lci5zdHlsZS53aWR0aCA9ICczMDBweCc7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkZXNjQ29udGFpbmVyKTtcblxuXHRjb25zdCBidXR0b25XaXRoRGVzYyA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEJ1dHRvbldpdGhEZXNjcmlwdGlvbihkZXNjQ29udGFpbmVyLCB7IC4uLnRoZW1lZEJ1dHRvblN0eWxlcywgdGl0bGU6ICdJbnN0YWxsIEV4dGVuc2lvbicsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdGJ1dHRvbldpdGhEZXNjLmxhYmVsID0gJyQoZXh0ZW5zaW9ucykgSW5zdGFsbCBFeHRlbnNpb24nO1xuXHRidXR0b25XaXRoRGVzYy5kZXNjcmlwdGlvbiA9ICdUaGlzIHdpbGwgaW5zdGFsbCB0aGUgZXh0ZW5zaW9uIGFuZCBlbmFibGUgaXQgZ2xvYmFsbHknO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFRvZ2dsZXMgYW5kIENoZWNrYm94ZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gcmVuZGVyVG9nZ2xlcyh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcxMnB4JztcblxuXHQvLyBUb2dnbGVzXG5cdGNvbnN0IHRvZ2dsZVNlY3Rpb24gPSAkKCdkaXYnKTtcblx0dG9nZ2xlU2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHR0b2dnbGVTZWN0aW9uLnN0eWxlLmdhcCA9ICcxNnB4Jztcblx0dG9nZ2xlU2VjdGlvbi5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0b2dnbGVTZWN0aW9uKTtcblxuXHRjb25zdCB0b2dnbGUxID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVG9nZ2xlKHtcblx0XHQuLi50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdFx0dGl0bGU6ICdDYXNlIFNlbnNpdGl2ZScsXG5cdFx0aXNDaGVja2VkOiBmYWxzZSxcblx0XHRpY29uOiBDb2RpY29uLmNhc2VTZW5zaXRpdmUsXG5cdH0pKTtcblx0dG9nZ2xlU2VjdGlvbi5hcHBlbmRDaGlsZCh0b2dnbGUxLmRvbU5vZGUpO1xuXG5cdGNvbnN0IHRvZ2dsZTIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBUb2dnbGUoe1xuXHRcdC4uLnRoZW1lZFRvZ2dsZVN0eWxlcyxcblx0XHR0aXRsZTogJ1dob2xlIFdvcmQnLFxuXHRcdGlzQ2hlY2tlZDogdHJ1ZSxcblx0XHRpY29uOiBDb2RpY29uLndob2xlV29yZCxcblx0fSkpO1xuXHR0b2dnbGVTZWN0aW9uLmFwcGVuZENoaWxkKHRvZ2dsZTIuZG9tTm9kZSk7XG5cblx0Y29uc3QgdG9nZ2xlMyA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFRvZ2dsZSh7XG5cdFx0Li4udGhlbWVkVG9nZ2xlU3R5bGVzLFxuXHRcdHRpdGxlOiAnVXNlIFJlZ3VsYXIgRXhwcmVzc2lvbicsXG5cdFx0aXNDaGVja2VkOiBmYWxzZSxcblx0XHRpY29uOiBDb2RpY29uLnJlZ2V4LFxuXHR9KSk7XG5cdHRvZ2dsZVNlY3Rpb24uYXBwZW5kQ2hpbGQodG9nZ2xlMy5kb21Ob2RlKTtcblxuXHQvLyBDaGVja2JveGVzXG5cdGNvbnN0IGNoZWNrYm94U2VjdGlvbiA9ICQoJ2RpdicpO1xuXHRjaGVja2JveFNlY3Rpb24uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y2hlY2tib3hTZWN0aW9uLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y2hlY2tib3hTZWN0aW9uLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hlY2tib3hTZWN0aW9uKTtcblxuXHRjb25zdCBjcmVhdGVDaGVja2JveFJvdyA9IChsYWJlbDogc3RyaW5nLCBjaGVja2VkOiBib29sZWFuKSA9PiB7XG5cdFx0Y29uc3Qgcm93ID0gJCgnZGl2Jyk7XG5cdFx0cm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0cm93LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0XHRyb3cuc3R5bGUuZ2FwID0gJzhweCc7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IENoZWNrYm94KGxhYmVsLCBjaGVja2VkLCB0aGVtZWRDaGVja2JveFN0eWxlcykpO1xuXHRcdHJvdy5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IGxhYmVsRWwgPSAkKCdzcGFuJyk7XG5cdFx0bGFiZWxFbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdGxhYmVsRWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJztcblx0XHRyb3cuYXBwZW5kQ2hpbGQobGFiZWxFbCk7XG5cblx0XHRyZXR1cm4gcm93O1xuXHR9O1xuXG5cdGNoZWNrYm94U2VjdGlvbi5hcHBlbmRDaGlsZChjcmVhdGVDaGVja2JveFJvdygnRW5hYmxlIGF1dG8tc2F2ZScsIHRydWUpKTtcblx0Y2hlY2tib3hTZWN0aW9uLmFwcGVuZENoaWxkKGNyZWF0ZUNoZWNrYm94Um93KCdTaG93IGxpbmUgbnVtYmVycycsIHRydWUpKTtcblx0Y2hlY2tib3hTZWN0aW9uLmFwcGVuZENoaWxkKGNyZWF0ZUNoZWNrYm94Um93KCdXb3JkIHdyYXAnLCBmYWxzZSkpO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIElucHV0IEJveGVzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlcklucHV0Qm94ZXMoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxNnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnMTZweCc7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICczNTBweCc7XG5cblx0Ly8gSW5wdXQgd2l0aCB2YWx1ZVxuXHRjb25zdCBmaWxsZWRJbnB1dCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IElucHV0Qm94KGNvbnRhaW5lciwgdW5kZWZpbmVkLCB7XG5cdFx0cGxhY2Vob2xkZXI6ICdGaWxlIHBhdGgnLFxuXHRcdGlucHV0Qm94U3R5bGVzOiB0aGVtZWRJbnB1dEJveFN0eWxlcyxcblx0fSkpO1xuXHRmaWxsZWRJbnB1dC52YWx1ZSA9ICcvc3JjL3ZzL2VkaXRvci9icm93c2VyJztcblxuXHQvLyBJbnB1dCB3aXRoIGluZm8gdmFsaWRhdGlvblxuXHRjb25zdCBpbmZvSW5wdXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdHBsYWNlaG9sZGVyOiAnVXNlcm5hbWUnLFxuXHRcdGlucHV0Qm94U3R5bGVzOiB0aGVtZWRJbnB1dEJveFN0eWxlcyxcblx0XHR2YWxpZGF0aW9uT3B0aW9uczoge1xuXHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPCAzID8geyBjb250ZW50OiAnVXNlcm5hbWUgbXVzdCBiZSBhdCBsZWFzdCAzIGNoYXJhY3RlcnMnLCB0eXBlOiBNZXNzYWdlVHlwZS5JTkZPIH0gOiBudWxsXG5cdFx0fVxuXHR9KSk7XG5cdGluZm9JbnB1dC52YWx1ZSA9ICdhYic7XG5cdGluZm9JbnB1dC52YWxpZGF0ZSgpO1xuXG5cdC8vIElucHV0IHdpdGggd2FybmluZyB2YWxpZGF0aW9uXG5cdGNvbnN0IHdhcm5pbmdJbnB1dCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IElucHV0Qm94KGNvbnRhaW5lciwgdW5kZWZpbmVkLCB7XG5cdFx0cGxhY2Vob2xkZXI6ICdQYXNzd29yZCcsXG5cdFx0aW5wdXRCb3hTdHlsZXM6IHRoZW1lZElucHV0Qm94U3R5bGVzLFxuXHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHR2YWxpZGF0aW9uOiAodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA8IDggPyB7IGNvbnRlbnQ6ICdQYXNzd29yZCBzaG91bGQgYmUgYXQgbGVhc3QgOCBjaGFyYWN0ZXJzIGZvciBzZWN1cml0eScsIHR5cGU6IE1lc3NhZ2VUeXBlLldBUk5JTkcgfSA6IG51bGxcblx0XHR9XG5cdH0pKTtcblx0d2FybmluZ0lucHV0LnZhbHVlID0gJ3Bhc3MnO1xuXHR3YXJuaW5nSW5wdXQudmFsaWRhdGUoKTtcblxuXHQvLyBJbnB1dCB3aXRoIGVycm9yIHZhbGlkYXRpb25cblx0Y29uc3QgZXJyb3JJbnB1dCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IElucHV0Qm94KGNvbnRhaW5lciwgdW5kZWZpbmVkLCB7XG5cdFx0cGxhY2Vob2xkZXI6ICdFbWFpbCBhZGRyZXNzJyxcblx0XHRpbnB1dEJveFN0eWxlczogdGhlbWVkSW5wdXRCb3hTdHlsZXMsXG5cdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4gIXZhbHVlLmluY2x1ZGVzKCdAJykgPyB7IGNvbnRlbnQ6ICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBlbWFpbCBhZGRyZXNzJywgdHlwZTogTWVzc2FnZVR5cGUuRVJST1IgfSA6IG51bGxcblx0XHR9XG5cdH0pKTtcblx0ZXJyb3JJbnB1dC52YWx1ZSA9ICdpbnZhbGlkLWVtYWlsJztcblx0ZXJyb3JJbnB1dC52YWxpZGF0ZSgpO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIENvdW50IEJhZGdlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJDb3VudEJhZGdlcyh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcxMnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblxuXHQvLyBWYXJpb3VzIGJhZGdlIGNvdW50c1xuXHRjb25zdCBjb3VudHMgPSBbMSwgNSwgMTIsIDk5LCA5OTldO1xuXG5cdGZvciAoY29uc3QgY291bnQgb2YgY291bnRzKSB7XG5cdFx0Y29uc3QgYmFkZ2VDb250YWluZXIgPSAkKCdkaXYnKTtcblx0XHRiYWRnZUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGJhZGdlQ29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0XHRiYWRnZUNvbnRhaW5lci5zdHlsZS5nYXAgPSAnOHB4JztcblxuXHRcdGNvbnN0IGxhYmVsID0gJCgnc3BhbicpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gJ0lzc3Vlcyc7XG5cdFx0bGFiZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJztcblx0XHRiYWRnZUNvbnRhaW5lci5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBDb3VudEJhZGdlKGJhZGdlQ29udGFpbmVyLCB7IGNvdW50IH0sIHRoZW1lZEJhZGdlU3R5bGVzKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGJhZGdlQ29udGFpbmVyKTtcblx0fVxufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFjdGlvbiBCYXJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gcmVuZGVyQWN0aW9uQmFyKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmcgPSAnMTZweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRjb250YWluZXIuc3R5bGUuZ2FwID0gJzE2cHgnO1xuXG5cdC8vIEhvcml6b250YWwgYWN0aW9uIGJhclxuXHRjb25zdCBob3Jpem9udGFsTGFiZWwgPSAkKCdkaXYnKTtcblx0aG9yaXpvbnRhbExhYmVsLnRleHRDb250ZW50ID0gJ0hvcml6b250YWwgQWN0aW9uczonO1xuXHRob3Jpem9udGFsTGFiZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJztcblx0aG9yaXpvbnRhbExhYmVsLnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc0cHgnO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaG9yaXpvbnRhbExhYmVsKTtcblxuXHRjb25zdCBob3Jpem9udGFsQ29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChob3Jpem9udGFsQ29udGFpbmVyKTtcblxuXHRjb25zdCBob3Jpem9udGFsQmFyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGhvcml6b250YWxDb250YWluZXIsIHtcblx0XHRhcmlhTGFiZWw6ICdFZGl0b3IgQWN0aW9ucycsXG5cdH0pKTtcblxuXHRob3Jpem9udGFsQmFyLnB1c2goW1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignZWRpdG9yLmFjdGlvbi5zYXZlJywgJ1NhdmUnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zYXZlKSwgdHJ1ZSwgYXN5bmMgKCkgPT4gY29uc29sZS5sb2coJ1NhdmUnKSkpLFxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignZWRpdG9yLmFjdGlvbi51bmRvJywgJ1VuZG8nLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kaXNjYXJkKSwgdHJ1ZSwgYXN5bmMgKCkgPT4gY29uc29sZS5sb2coJ1VuZG8nKSkpLFxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignZWRpdG9yLmFjdGlvbi5yZWRvJywgJ1JlZG8nLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZWRvKSwgdHJ1ZSwgYXN5bmMgKCkgPT4gY29uc29sZS5sb2coJ1JlZG8nKSkpLFxuXHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2VkaXRvci5hY3Rpb24uZmluZCcsICdGaW5kJywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc2VhcmNoKSwgdHJ1ZSwgYXN5bmMgKCkgPT4gY29uc29sZS5sb2coJ0ZpbmQnKSkpLFxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignZWRpdG9yLmFjdGlvbi5yZXBsYWNlJywgJ1JlcGxhY2UnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZXBsYWNlQWxsKSwgdHJ1ZSwgYXN5bmMgKCkgPT4gY29uc29sZS5sb2coJ1JlcGxhY2UnKSkpLFxuXHRdKTtcblxuXHQvLyBBY3Rpb24gYmFyIHdpdGggZGlzYWJsZWQgaXRlbXNcblx0Y29uc3QgbWl4ZWRMYWJlbCA9ICQoJ2RpdicpO1xuXHRtaXhlZExhYmVsLnRleHRDb250ZW50ID0gJ01peGVkIFN0YXRlczonO1xuXHRtaXhlZExhYmVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdG1peGVkTGFiZWwuc3R5bGUubWFyZ2luQm90dG9tID0gJzRweCc7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChtaXhlZExhYmVsKTtcblxuXHRjb25zdCBtaXhlZENvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWl4ZWRDb250YWluZXIpO1xuXG5cdGNvbnN0IG1peGVkQmFyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKG1peGVkQ29udGFpbmVyLCB7XG5cdFx0YXJpYUxhYmVsOiAnTWl4ZWQgQWN0aW9ucycsXG5cdH0pKTtcblxuXHRtaXhlZEJhci5wdXNoKFtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2FjdGlvbi5lbmFibGVkJywgJ0VuYWJsZWQnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wbGF5KSwgdHJ1ZSwgYXN5bmMgKCkgPT4geyB9KSksXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKCdhY3Rpb24uZGlzYWJsZWQnLCAnRGlzYWJsZWQnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z1BhdXNlKSwgZmFsc2UsIGFzeW5jICgpID0+IHsgfSkpLFxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignYWN0aW9uLmVuYWJsZWQyJywgJ0VuYWJsZWQnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z1N0b3ApLCB0cnVlLCBhc3luYyAoKSA9PiB7IH0pKSxcblx0XSk7XG59XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUHJvZ3Jlc3MgQmFyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlclByb2dyZXNzQmFycyh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzE2cHgnO1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0Y29udGFpbmVyLnN0eWxlLmdhcCA9ICcyNHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzQwMHB4JztcblxuXHRjb25zdCBjcmVhdGVTZWN0aW9uID0gKGxhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBzZWN0aW9uID0gJCgnZGl2Jyk7XG5cdFx0Y29uc3QgbGFiZWxFbCA9ICQoJ2RpdicpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRsYWJlbEVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdFx0bGFiZWxFbC5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnOHB4Jztcblx0XHRsYWJlbEVsLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuXHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQobGFiZWxFbCk7XG5cblx0XHQvLyBQcm9ncmVzcyBiYXIgY29udGFpbmVyIHdpdGggcHJvcGVyIGNvbnN0cmFpbnRzXG5cdFx0Y29uc3QgYmFyQ29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdFx0YmFyQ29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRiYXJDb250YWluZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0YmFyQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICc0cHgnO1xuXHRcdGJhckNvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoYmFyQ29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblx0XHRyZXR1cm4gYmFyQ29udGFpbmVyO1xuXHR9O1xuXG5cdC8vIERpc2NyZXRlIHByb2dyZXNzIC0gMzAlXG5cdGNvbnN0IHByb2dyZXNzMzBTZWN0aW9uID0gY3JlYXRlU2VjdGlvbignRGlzY3JldGUgUHJvZ3Jlc3MgLSAzMCUnKTtcblx0Y29uc3QgcHJvZ3Jlc3MzMEJhciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFByb2dyZXNzQmFyKHByb2dyZXNzMzBTZWN0aW9uLCB0aGVtZWRQcm9ncmVzc0Jhck9wdGlvbnMpKTtcblx0cHJvZ3Jlc3MzMEJhci50b3RhbCgxMDApO1xuXHRwcm9ncmVzczMwQmFyLndvcmtlZCgzMCk7XG5cblx0Ly8gRGlzY3JldGUgcHJvZ3Jlc3MgLSA2MCVcblx0Y29uc3QgcHJvZ3Jlc3M2MFNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKCdEaXNjcmV0ZSBQcm9ncmVzcyAtIDYwJScpO1xuXHRjb25zdCBwcm9ncmVzczYwQmFyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgUHJvZ3Jlc3NCYXIocHJvZ3Jlc3M2MFNlY3Rpb24sIHRoZW1lZFByb2dyZXNzQmFyT3B0aW9ucykpO1xuXHRwcm9ncmVzczYwQmFyLnRvdGFsKDEwMCk7XG5cdHByb2dyZXNzNjBCYXIud29ya2VkKDYwKTtcblxuXHQvLyBEaXNjcmV0ZSBwcm9ncmVzcyAtIDkwJVxuXHRjb25zdCBwcm9ncmVzczkwU2VjdGlvbiA9IGNyZWF0ZVNlY3Rpb24oJ0Rpc2NyZXRlIFByb2dyZXNzIC0gOTAlJyk7XG5cdGNvbnN0IHByb2dyZXNzOTBCYXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBQcm9ncmVzc0Jhcihwcm9ncmVzczkwU2VjdGlvbiwgdGhlbWVkUHJvZ3Jlc3NCYXJPcHRpb25zKSk7XG5cdHByb2dyZXNzOTBCYXIudG90YWwoMTAwKTtcblx0cHJvZ3Jlc3M5MEJhci53b3JrZWQoOTApO1xuXG5cdC8vIENvbXBsZXRlZCBwcm9ncmVzc1xuXHRjb25zdCBkb25lU2VjdGlvbiA9IGNyZWF0ZVNlY3Rpb24oJ0NvbXBsZXRlZCAoMTAwJSknKTtcblx0Y29uc3QgZG9uZUJhciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFByb2dyZXNzQmFyKGRvbmVTZWN0aW9uLCB0aGVtZWRQcm9ncmVzc0Jhck9wdGlvbnMpKTtcblx0ZG9uZUJhci50b3RhbCgxMDApO1xuXHRkb25lQmFyLndvcmtlZCgxMDApO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEhpZ2hsaWdodGVkIExhYmVsXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHJlbmRlckhpZ2hsaWdodGVkTGFiZWxzKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmcgPSAnMTZweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRjb250YWluZXIuc3R5bGUuZ2FwID0gJzhweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXG5cdGNvbnN0IGNyZWF0ZUhpZ2hsaWdodGVkTGFiZWwgPSAodGV4dDogc3RyaW5nLCBoaWdobGlnaHRzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSkgPT4ge1xuXHRcdGNvbnN0IHJvdyA9ICQoJ2RpdicpO1xuXHRcdHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHJvdy5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdFx0cm93LnN0eWxlLmdhcCA9ICc4cHgnO1xuXG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSAkKCdkaXYnKTtcblx0XHRjb25zdCBsYWJlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwobGFiZWxDb250YWluZXIpKTtcblx0XHRsYWJlbC5zZXQodGV4dCwgaGlnaGxpZ2h0cyk7XG5cdFx0cm93LmFwcGVuZENoaWxkKGxhYmVsQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHF1ZXJ5TGFiZWwgPSAkKCdzcGFuJyk7XG5cdFx0cXVlcnlMYWJlbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cdFx0cXVlcnlMYWJlbC5zdHlsZS5mb250U2l6ZSA9ICcxMnB4Jztcblx0XHRxdWVyeUxhYmVsLnRleHRDb250ZW50ID0gYChtYXRjaGVzIGhpZ2hsaWdodGVkKWA7XG5cdFx0cm93LmFwcGVuZENoaWxkKHF1ZXJ5TGFiZWwpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fTtcblxuXHQvLyBGaWxlIHNlYXJjaCBleGFtcGxlc1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlSGlnaGxpZ2h0ZWRMYWJlbCgnY29kZUVkaXRvcldpZGdldC50cycsIFt7IHN0YXJ0OiAwLCBlbmQ6IDQgfV0pKTsgLy8gXCJjb2RlXCJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZUhpZ2hsaWdodGVkTGFiZWwoJ2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci50cycsIFt7IHN0YXJ0OiA2LCBlbmQ6IDEwIH1dKSk7IC8vIFwiQ29tcFwiXG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVIaWdobGlnaHRlZExhYmVsKCdkaWZmRWRpdG9yVmlld01vZGVsLnRzJywgW3sgc3RhcnQ6IDAsIGVuZDogNCB9LCB7IHN0YXJ0OiAxMCwgZW5kOiAxNCB9XSkpOyAvLyBcImRpZmZcIiBhbmQgXCJWaWV3XCJcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZUhpZ2hsaWdodGVkTGFiZWwoJ3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy50cycsIFt7IHN0YXJ0OiA5LCBlbmQ6IDEzIH1dKSk7IC8vIFwiVGVzdFwiXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsUUFBUSxpQkFBaUI7QUFHbEMsU0FBUyxRQUFRLFdBQVcsdUJBQXVCLDRCQUE0QjtBQUMvRSxTQUFTLFFBQVEsVUFBVSw0QkFBNEI7QUFDdkQsU0FBUyxVQUFVLGFBQWEsMkJBQTJCO0FBQzNELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQWtDLHdCQUF3QixnQ0FBZ0M7QUFHMUYsSUFBTyx5QkFBUSx5QkFBeUI7QUFBQSxF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
