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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { MarkdownString, createMarkdownLink } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { ADVANCED_INDICATOR_DESCRIPTION, EXPERIMENTAL_INDICATOR_DESCRIPTION, POLICY_SETTING_TAG, PREVIEW_INDICATOR_DESCRIPTION } from "../common/preferences.js";
const $ = DOM.$;
let cachedSyncIgnoredSettingsSet = /* @__PURE__ */ new Set();
let cachedSyncIgnoredSettings = [];
let SettingsTreeIndicatorsLabel = class {
  constructor(container, configurationService, hoverService, userDataSyncEnablementService, languageService, commandService) {
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.languageService = languageService;
    this.commandService = commandService;
    /** Indicators that each have their own square container at the top-right of the setting */
    this.isolatedIndicators = [];
    this.keybindingListeners = new DisposableStore();
    this.focusedIndex = 0;
    this.defaultHoverOptions = {
      trapFocus: true,
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: HoverPosition.BELOW
      }
    };
    this.indicatorsContainerElement = DOM.append(container, $(".setting-indicators-container"));
    this.indicatorsContainerElement.style.display = "inline";
    this.previewIndicator = this.createPreviewIndicator();
    this.advancedIndicator = this.createAdvancedIndicator();
    this.isolatedIndicators = [this.previewIndicator, this.advancedIndicator];
    this.workspaceTrustIndicator = this.createWorkspaceTrustIndicator();
    this.scopeOverridesIndicator = this.createScopeOverridesIndicator();
    this.syncIgnoredIndicator = this.createSyncIgnoredIndicator();
    this.defaultOverrideIndicator = this.createDefaultOverrideIndicator();
    this.parenthesizedIndicators = [this.workspaceTrustIndicator, this.scopeOverridesIndicator, this.syncIgnoredIndicator, this.defaultOverrideIndicator];
  }
  createWorkspaceTrustIndicator() {
    const disposables = new DisposableStore();
    const workspaceTrustElement = $("span.setting-indicator.setting-item-workspace-trust");
    const workspaceTrustLabel = disposables.add(new SimpleIconLabel(workspaceTrustElement));
    workspaceTrustLabel.text = "$(shield) " + localize("workspaceUntrustedLabel", "Requires workspace trust");
    const content = localize("trustLabel", "The setting value can only be applied in a trusted workspace.");
    disposables.add(this.hoverService.setupDelayedHover(workspaceTrustElement, () => ({
      ...this.defaultHoverOptions,
      content,
      actions: [{
        label: localize("manageWorkspaceTrust", "Manage Workspace Trust"),
        commandId: "workbench.trust.manage",
        run: (target) => {
          this.commandService.executeCommand("workbench.trust.manage");
        }
      }]
    }), { setupKeyboardEvents: true }));
    return {
      element: workspaceTrustElement,
      label: workspaceTrustLabel,
      disposables
    };
  }
  createScopeOverridesIndicator() {
    const disposables = new DisposableStore();
    const otherOverridesElement = $("span.setting-item-overrides");
    const otherOverridesLabel = disposables.add(new SimpleIconLabel(otherOverridesElement));
    return {
      element: otherOverridesElement,
      label: otherOverridesLabel,
      disposables
    };
  }
  createSyncIgnoredIndicator() {
    const disposables = new DisposableStore();
    const syncIgnoredElement = $("span.setting-indicator.setting-item-ignored");
    const syncIgnoredLabel = disposables.add(new SimpleIconLabel(syncIgnoredElement));
    syncIgnoredLabel.text = localize("extensionSyncIgnoredLabel", "Not synced");
    const syncIgnoredHoverContent = localize("syncIgnoredTitle", "This setting is ignored during sync");
    disposables.add(this.hoverService.setupDelayedHover(syncIgnoredElement, {
      ...this.defaultHoverOptions,
      content: syncIgnoredHoverContent
    }, { setupKeyboardEvents: true }));
    return {
      element: syncIgnoredElement,
      label: syncIgnoredLabel,
      disposables
    };
  }
  createDefaultOverrideIndicator() {
    const disposables = new DisposableStore();
    const defaultOverrideIndicator = $("span.setting-indicator.setting-item-default-overridden");
    const defaultOverrideLabel = disposables.add(new SimpleIconLabel(defaultOverrideIndicator));
    defaultOverrideLabel.text = localize("defaultOverriddenLabel", "Default value changed");
    return {
      element: defaultOverrideIndicator,
      label: defaultOverrideLabel,
      disposables
    };
  }
  createPreviewIndicator() {
    const disposables = new DisposableStore();
    const previewIndicator = $("span.setting-indicator.setting-item-preview");
    const previewLabel = disposables.add(new SimpleIconLabel(previewIndicator));
    return {
      element: previewIndicator,
      label: previewLabel,
      disposables
    };
  }
  createAdvancedIndicator() {
    const disposables = new DisposableStore();
    const advancedIndicator = $("span.setting-indicator.setting-item-preview");
    const advancedLabel = disposables.add(new SimpleIconLabel(advancedIndicator));
    advancedLabel.text = localize("advancedLabel", "Advanced");
    disposables.add(this.hoverService.setupDelayedHover(advancedIndicator, {
      ...this.defaultHoverOptions,
      content: ADVANCED_INDICATOR_DESCRIPTION
    }, { setupKeyboardEvents: true }));
    return {
      element: advancedIndicator,
      label: advancedLabel,
      disposables
    };
  }
  render() {
    this.indicatorsContainerElement.innerText = "";
    this.indicatorsContainerElement.style.display = "none";
    const isolatedIndicatorsToShow = this.isolatedIndicators.filter((indicator) => {
      return indicator.element.style.display !== "none";
    });
    if (isolatedIndicatorsToShow.length) {
      this.indicatorsContainerElement.style.display = "inline";
      for (let i = 0; i < isolatedIndicatorsToShow.length; i++) {
        DOM.append(this.indicatorsContainerElement, isolatedIndicatorsToShow[i].element);
      }
    }
    const parenthesizedIndicatorsToShow = this.parenthesizedIndicators.filter((indicator) => {
      return indicator.element.style.display !== "none";
    });
    if (parenthesizedIndicatorsToShow.length) {
      this.indicatorsContainerElement.style.display = "inline";
      DOM.append(this.indicatorsContainerElement, $("span", void 0, "("));
      for (let i = 0; i < parenthesizedIndicatorsToShow.length - 1; i++) {
        DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[i].element);
        DOM.append(this.indicatorsContainerElement, $("span.comma", void 0, " \u2022 "));
      }
      DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[parenthesizedIndicatorsToShow.length - 1].element);
      DOM.append(this.indicatorsContainerElement, $("span", void 0, ")"));
    }
    this.resetIndicatorNavigationKeyBindings([...isolatedIndicatorsToShow, ...parenthesizedIndicatorsToShow]);
  }
  resetIndicatorNavigationKeyBindings(indicators) {
    this.keybindingListeners.clear();
    this.indicatorsContainerElement.role = indicators.length >= 1 ? "toolbar" : "button";
    if (!indicators.length) {
      return;
    }
    const firstElement = indicators[0].focusElement ?? indicators[0].element;
    firstElement.tabIndex = 0;
    this.keybindingListeners.add(DOM.addDisposableListener(this.indicatorsContainerElement, "keydown", (e) => {
      const ev = new StandardKeyboardEvent(e);
      let handled = true;
      if (ev.equals(KeyCode.Home)) {
        this.focusIndicatorAt(indicators, 0);
      } else if (ev.equals(KeyCode.End)) {
        this.focusIndicatorAt(indicators, indicators.length - 1);
      } else if (ev.equals(KeyCode.RightArrow)) {
        const indexToFocus = (this.focusedIndex + 1) % indicators.length;
        this.focusIndicatorAt(indicators, indexToFocus);
      } else if (ev.equals(KeyCode.LeftArrow)) {
        const indexToFocus = this.focusedIndex ? this.focusedIndex - 1 : indicators.length - 1;
        this.focusIndicatorAt(indicators, indexToFocus);
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
  }
  focusIndicatorAt(indicators, index) {
    if (index === this.focusedIndex) {
      return;
    }
    const indicator = indicators[index];
    const elementToFocus = indicator.focusElement ?? indicator.element;
    elementToFocus.tabIndex = 0;
    elementToFocus.focus();
    const currentlyFocusedIndicator = indicators[this.focusedIndex];
    const previousFocusedElement = currentlyFocusedIndicator.focusElement ?? currentlyFocusedIndicator.element;
    previousFocusedElement.tabIndex = -1;
    this.focusedIndex = index;
  }
  updateWorkspaceTrust(element) {
    this.workspaceTrustIndicator.element.style.display = element.isUntrusted ? "inline" : "none";
    this.render();
  }
  updateSyncIgnored(element, ignoredSettings) {
    this.syncIgnoredIndicator.element.style.display = this.userDataSyncEnablementService.isEnabled() && ignoredSettings.includes(element.setting.key) ? "inline" : "none";
    this.render();
    if (cachedSyncIgnoredSettings !== ignoredSettings) {
      cachedSyncIgnoredSettings = ignoredSettings;
      cachedSyncIgnoredSettingsSet = new Set(cachedSyncIgnoredSettings);
    }
  }
  updatePreviewIndicator(element) {
    const isPreviewSetting = element.tags?.has("preview");
    const isExperimentalSetting = element.tags?.has("experimental");
    this.previewIndicator.element.style.display = isPreviewSetting || isExperimentalSetting ? "inline" : "none";
    this.previewIndicator.label.text = isPreviewSetting ? localize("previewLabel", "Preview") : localize("experimentalLabel", "Experimental");
    const content = isPreviewSetting ? PREVIEW_INDICATOR_DESCRIPTION : EXPERIMENTAL_INDICATOR_DESCRIPTION;
    this.previewIndicator.disposables.add(this.hoverService.setupDelayedHover(this.previewIndicator.element, {
      ...this.defaultHoverOptions,
      content
    }, { setupKeyboardEvents: true }));
    this.render();
  }
  updateAdvancedIndicator(element) {
    const isAdvancedSetting = element.tags?.has("advanced");
    this.advancedIndicator.element.style.display = isAdvancedSetting ? "inline" : "none";
    this.render();
  }
  getInlineScopeDisplayText(completeScope) {
    const [scope, language] = completeScope.split(":");
    const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
    if (language) {
      return `${this.languageService.getLanguageName(language)} > ${localizedScope}`;
    }
    return localizedScope;
  }
  dispose() {
    this.keybindingListeners.dispose();
    for (const indicator of this.isolatedIndicators) {
      indicator.disposables.dispose();
    }
    for (const indicator of this.parenthesizedIndicators) {
      indicator.disposables.dispose();
    }
  }
  updateScopeOverrides(element, onDidClickOverrideElement, onApplyFilter) {
    this.scopeOverridesIndicator.disposables.clear();
    this.scopeOverridesIndicator.element.innerText = "";
    this.scopeOverridesIndicator.element.style.display = "none";
    this.scopeOverridesIndicator.focusElement = this.scopeOverridesIndicator.element;
    if (element.hasPolicyValue) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = "$(briefcase) " + localize("policyLabelText", "Managed by organization");
      const content = localize("policyDescription", "This setting is managed by your organization and its actual value cannot be changed.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
        ...this.defaultHoverOptions,
        content,
        actions: [{
          label: localize("policyFilterLink", "View policy settings"),
          commandId: "_settings.action.viewPolicySettings",
          run: (_) => {
            onApplyFilter.fire(`@${POLICY_SETTING_TAG}`);
          }
        }]
      }), { setupKeyboardEvents: true }));
    } else if (element.isAgentsWindowReadOnly) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = "$(lock) " + localize("agentsWindowReadOnlyLabelText", "Cannot be changed in Agents window");
      const content = localize("agentsWindowReadOnlyDescription", "This setting cannot be changed in the Agents window.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, {
        ...this.defaultHoverOptions,
        content
      }, { setupKeyboardEvents: true }));
    } else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && this.configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = localize("applicationSetting", "Applies to all profiles");
      const content = localize("applicationSettingDescription", "The setting is not specific to the current profile, and will retain its value when switching profiles.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, {
        ...this.defaultHoverOptions,
        content
      }, { setupKeyboardEvents: true }));
    } else if (element.overriddenScopeList.length || element.overriddenDefaultsLanguageList.length) {
      if (element.overriddenScopeList.length === 1 && !element.overriddenDefaultsLanguageList.length) {
        this.scopeOverridesIndicator.element.style.display = "inline";
        this.scopeOverridesIndicator.element.classList.remove("setting-indicator");
        const prefaceText = element.isConfigured ? localize("alsoConfiguredIn", "Also modified in") : localize("configuredIn", "Modified in");
        this.scopeOverridesIndicator.label.text = `${prefaceText} `;
        const overriddenScope = element.overriddenScopeList[0];
        const view = DOM.append(this.scopeOverridesIndicator.element, $("a.modified-scope", void 0, this.getInlineScopeDisplayText(overriddenScope)));
        view.tabIndex = -1;
        this.scopeOverridesIndicator.focusElement = view;
        const onClickOrKeydown = (e) => {
          const [scope, language] = overriddenScope.split(":");
          onDidClickOverrideElement.fire({
            settingKey: element.setting.key,
            scope,
            language
          });
          e.preventDefault();
          e.stopPropagation();
        };
        this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.CLICK, (e) => {
          onClickOrKeydown(e);
        }));
        this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.KEY_DOWN, (e) => {
          const ev = new StandardKeyboardEvent(e);
          if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
            onClickOrKeydown(e);
          }
        }));
      } else {
        this.scopeOverridesIndicator.element.style.display = "inline";
        this.scopeOverridesIndicator.element.classList.add("setting-indicator");
        const scopeOverridesLabelText = element.isConfigured ? localize("alsoConfiguredElsewhere", "Also modified elsewhere") : localize("configuredElsewhere", "Modified elsewhere");
        this.scopeOverridesIndicator.label.text = scopeOverridesLabelText;
        let contentMarkdownString = "";
        if (element.overriddenScopeList.length) {
          const prefaceText = element.isConfigured ? localize("alsoModifiedInScopes", "The setting has also been modified in the following scopes:") : localize("modifiedInScopes", "The setting has been modified in the following scopes:");
          contentMarkdownString = prefaceText;
          for (const scope of element.overriddenScopeList) {
            const scopeDisplayText = this.getInlineScopeDisplayText(scope);
            contentMarkdownString += "\n- " + createMarkdownLink(scopeDisplayText, SettingScopeLink.create(scope).toString(), getAccessibleScopeDisplayText(scope, this.languageService));
          }
        }
        if (element.overriddenDefaultsLanguageList.length) {
          if (contentMarkdownString) {
            contentMarkdownString += `

`;
          }
          const prefaceText = localize("hasDefaultOverridesForLanguages", "The following languages have default overrides:");
          contentMarkdownString += prefaceText;
          for (const language of element.overriddenDefaultsLanguageList) {
            const scopeDisplayText = this.languageService.getLanguageName(language);
            contentMarkdownString += "\n- " + createMarkdownLink(scopeDisplayText ?? language, SettingScopeLink.create(`default:${language}`).toString());
          }
        }
        const content = {
          value: contentMarkdownString,
          isTrusted: false,
          supportHtml: false
        };
        this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
          ...this.defaultHoverOptions,
          content,
          linkHandler: (url) => {
            const [scope, language] = SettingScopeLink.parse(url).split(":");
            onDidClickOverrideElement.fire({
              settingKey: element.setting.key,
              scope,
              language
            });
          }
        }), { setupKeyboardEvents: true }));
      }
    }
    this.render();
  }
  updateDefaultOverrideIndicator(element) {
    this.defaultOverrideIndicator.element.style.display = "none";
    let sourceToDisplay = getDefaultValueSourceToDisplay(element);
    if (sourceToDisplay !== void 0) {
      this.defaultOverrideIndicator.element.style.display = "inline";
      this.defaultOverrideIndicator.disposables.clear();
      if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
        sourceToDisplay = sourceToDisplay[0];
      }
      let defaultOverrideHoverContent;
      if (!Array.isArray(sourceToDisplay)) {
        defaultOverrideHoverContent = localize("defaultOverriddenDetails", "Default setting value overridden by `{0}`", sourceToDisplay);
      } else {
        sourceToDisplay = sourceToDisplay.map((source) => `\`${source}\``);
        defaultOverrideHoverContent = localize("multipledefaultOverriddenDetails", "A default values has been set by {0}", sourceToDisplay.slice(0, -1).join(", ") + " & " + sourceToDisplay.slice(-1));
      }
      this.defaultOverrideIndicator.disposables.add(this.hoverService.setupDelayedHover(this.defaultOverrideIndicator.element, () => ({
        content: new MarkdownString().appendMarkdown(defaultOverrideHoverContent),
        style: HoverStyle.Pointer,
        position: {
          hoverPosition: HoverPosition.BELOW
        }
      }), { setupKeyboardEvents: true }));
    }
    this.render();
  }
};
SettingsTreeIndicatorsLabel = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IUserDataSyncEnablementService),
  __decorateParam(4, ILanguageService),
  __decorateParam(5, ICommandService)
], SettingsTreeIndicatorsLabel);
function getDefaultValueSourceToDisplay(element) {
  let sourceToDisplay;
  const defaultValueSource = element.defaultValueSource;
  if (defaultValueSource) {
    if (defaultValueSource instanceof Map) {
      sourceToDisplay = [];
      for (const [, value] of defaultValueSource) {
        const newValue = typeof value !== "string" ? value.displayName ?? value.id : value;
        if (!sourceToDisplay.includes(newValue)) {
          sourceToDisplay.push(newValue);
        }
      }
    } else if (typeof defaultValueSource === "string") {
      sourceToDisplay = defaultValueSource;
    } else {
      sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
    }
  }
  return sourceToDisplay;
}
function getAccessibleScopeDisplayText(completeScope, languageService) {
  const [scope, language] = completeScope.split(":");
  const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
  if (language) {
    return localize("modifiedInScopeForLanguage", "The {0} scope for {1}", localizedScope, languageService.getLanguageName(language));
  }
  return localizedScope;
}
function getAccessibleScopeDisplayMidSentenceText(completeScope, languageService) {
  const [scope, language] = completeScope.split(":");
  const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
  if (language) {
    return localize("modifiedInScopeForLanguageMidSentence", "the {0} scope for {1}", localizedScope.toLowerCase(), languageService.getLanguageName(language));
  }
  return localizedScope;
}
function getIndicatorsLabelAriaLabel(element, configurationService, userDataProfilesService, languageService) {
  const ariaLabelSections = [];
  if (element.tags?.has("preview")) {
    ariaLabelSections.push(localize("previewLabel", "Preview"));
  } else if (element.tags?.has("experimental")) {
    ariaLabelSections.push(localize("experimentalLabel", "Experimental"));
  }
  if (element.tags?.has("advanced")) {
    ariaLabelSections.push(localize("advancedLabel", "Advanced"));
  }
  if (element.isUntrusted) {
    ariaLabelSections.push(localize("workspaceUntrustedAriaLabel", "Workspace untrusted; setting value not applied"));
  }
  if (element.hasPolicyValue) {
    ariaLabelSections.push(localize("policyDescriptionAccessible", "Managed by organization policy; setting value not applied"));
  } else if (element.isAgentsWindowReadOnly) {
    ariaLabelSections.push(localize("agentsWindowReadOnlyAccessible", "Cannot be changed in Agents window"));
  } else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
    ariaLabelSections.push(localize("applicationSettingDescriptionAccessible", "Setting value retained when switching profiles"));
  } else {
    const otherOverridesStart = element.isConfigured ? localize("alsoConfiguredIn", "Also modified in") : localize("configuredIn", "Modified in");
    const otherOverridesList = element.overriddenScopeList.map((scope) => getAccessibleScopeDisplayMidSentenceText(scope, languageService)).join(", ");
    if (element.overriddenScopeList.length) {
      ariaLabelSections.push(`${otherOverridesStart} ${otherOverridesList}`);
    }
  }
  if (cachedSyncIgnoredSettingsSet.has(element.setting.key)) {
    ariaLabelSections.push(localize("syncIgnoredAriaLabel", "Setting ignored during sync"));
  }
  let sourceToDisplay = getDefaultValueSourceToDisplay(element);
  if (sourceToDisplay !== void 0) {
    if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
      sourceToDisplay = sourceToDisplay[0];
    }
    let overriddenDetailsText;
    if (!Array.isArray(sourceToDisplay)) {
      overriddenDetailsText = localize("defaultOverriddenDetailsAriaLabel", "{0} overrides the default value", sourceToDisplay);
    } else {
      overriddenDetailsText = localize("multipleDefaultOverriddenDetailsAriaLabel", "{0} override the default value", sourceToDisplay.slice(0, -1).join(", ") + " & " + sourceToDisplay.slice(-1));
    }
    ariaLabelSections.push(overriddenDetailsText);
  }
  const otherLanguageOverridesList = element.overriddenDefaultsLanguageList.map((language) => languageService.getLanguageName(language)).join(", ");
  if (element.overriddenDefaultsLanguageList.length) {
    const otherLanguageOverridesText = localize("defaultOverriddenLanguagesList", "Language-specific default values exist for {0}", otherLanguageOverridesList);
    ariaLabelSections.push(otherLanguageOverridesText);
  }
  const ariaLabel = ariaLabelSections.join(". ");
  return ariaLabel;
}
var SettingScopeLink;
((SettingScopeLink2) => {
  function create(scope) {
    return URI.from({
      scheme: Schemas.internal,
      path: "/",
      query: encodeURIComponent(scope)
    });
  }
  SettingScopeLink2.create = create;
  function parse(link) {
    const uri = URI.parse(link);
    return decodeURIComponent(uri.query);
  }
  SettingScopeLink2.parse = parse;
})(SettingScopeLink || (SettingScopeLink = {}));
export {
  SettingsTreeIndicatorsLabel,
  getIndicatorsLabelAriaLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc0VkaXRvclNldHRpbmdJbmRpY2F0b3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSwgdHlwZSBJSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2ltcGxlSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9zaW1wbGVJY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcsIGNyZWF0ZU1hcmtkb3duTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQURWQU5DRURfSU5ESUNBVE9SX0RFU0NSSVBUSU9OLCBFWFBFUklNRU5UQUxfSU5ESUNBVE9SX0RFU0NSSVBUSU9OLCBQT0xJQ1lfU0VUVElOR19UQUcsIFBSRVZJRVdfSU5ESUNBVE9SX0RFU0NSSVBUSU9OIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50IH0gZnJvbSAnLi9zZXR0aW5nc1RyZWVNb2RlbHMuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbnR5cGUgU2NvcGVTdHJpbmcgPSAnd29ya3NwYWNlJyB8ICd1c2VyJyB8ICdyZW1vdGUnIHwgJ2RlZmF1bHQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50IHtcblx0c2NvcGU6IFNjb3BlU3RyaW5nO1xuXHRsYW5ndWFnZTogc3RyaW5nO1xuXHRzZXR0aW5nS2V5OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTZXR0aW5nSW5kaWNhdG9yIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdC8qKlxuXHQgKiBUaGUgZWxlbWVudCB0byBmb2N1cyBvbiB3aGVuIG5hdmlnYXRpbmcgd2l0aCBrZXlib2FyZC5cblx0ICogV2hlbiB1bmRlZmluZWQsIHVzZSB7QGxpbmsgZWxlbWVudH0gaW5zdGVhZC5cblx0ICovXG5cdGZvY3VzRWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRsYWJlbDogU2ltcGxlSWNvbkxhYmVsO1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG4vKipcbiAqIENvbnRhaW5zIGEgc2V0IG9mIHRoZSBzeW5jLWlnbm9yZWQgc2V0dGluZ3NcbiAqIHRvIGtlZXAgdGhlIHN5bmMgaWdub3JlZCBpbmRpY2F0b3IgYW5kIHRoZSBnZXRJbmRpY2F0b3JzTGFiZWxBcmlhTGFiZWwoKSBmdW5jdGlvbiBpbiBzeW5jLlxuICogU2V0dGluZ3NUcmVlSW5kaWNhdG9yc0xhYmVsI3VwZGF0ZVN5bmNJZ25vcmVkIHByb3ZpZGVzIHRoZSBzb3VyY2Ugb2YgdHJ1dGguXG4gKi9cbmxldCBjYWNoZWRTeW5jSWdub3JlZFNldHRpbmdzU2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4vKipcbiAqIENvbnRhaW5zIGEgY29weSBvZiB0aGUgc3luYy1pZ25vcmVkIHNldHRpbmdzIHRvIGRldGVybWluZSB3aGVuIHRvIHVwZGF0ZVxuICogY2FjaGVkU3luY0lnbm9yZWRTZXR0aW5nc1NldC5cbiAqL1xubGV0IGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdID0gW107XG5cbi8qKlxuICogUmVuZGVycyB0aGUgaW5kaWNhdG9ycyBuZXh0IHRvIGEgc2V0dGluZywgc3VjaCBhcyBcIkFsc28gTW9kaWZpZWQgSW5cIi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNldHRpbmdzVHJlZUluZGljYXRvcnNMYWJlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBpbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3SW5kaWNhdG9yOiBTZXR0aW5nSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFkdmFuY2VkSW5kaWNhdG9yOiBTZXR0aW5nSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0SW5kaWNhdG9yOiBTZXR0aW5nSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yOiBTZXR0aW5nSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN5bmNJZ25vcmVkSW5kaWNhdG9yOiBTZXR0aW5nSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRPdmVycmlkZUluZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblxuXHQvKiogSW5kaWNhdG9ycyB0aGF0IGVhY2ggaGF2ZSB0aGVpciBvd24gc3F1YXJlIGNvbnRhaW5lciBhdCB0aGUgdG9wLXJpZ2h0IG9mIHRoZSBzZXR0aW5nICovXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNvbGF0ZWRJbmRpY2F0b3JzOiBTZXR0aW5nSW5kaWNhdG9yW10gPSBbXTtcblx0LyoqIEluZGljYXRvcnMgdGhhdCBlbmQgdXAgd3JhcHBlZCBpbiBhIHBhcmVudGhlc2lzIGF0IHRoZSB0b3AtcmlnaHQgb2YgdGhlIHNldHRpbmcgKi9cblx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnRoZXNpemVkSW5kaWNhdG9yczogU2V0dGluZ0luZGljYXRvcltdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ0xpc3RlbmVyczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGZvY3VzZWRJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkge1xuXHRcdHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaW5kaWNhdG9ycy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cblx0XHR0aGlzLnByZXZpZXdJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZVByZXZpZXdJbmRpY2F0b3IoKTtcblx0XHR0aGlzLmFkdmFuY2VkSW5kaWNhdG9yID0gdGhpcy5jcmVhdGVBZHZhbmNlZEluZGljYXRvcigpO1xuXHRcdHRoaXMuaXNvbGF0ZWRJbmRpY2F0b3JzID0gW3RoaXMucHJldmlld0luZGljYXRvciwgdGhpcy5hZHZhbmNlZEluZGljYXRvcl07XG5cblx0XHR0aGlzLndvcmtzcGFjZVRydXN0SW5kaWNhdG9yID0gdGhpcy5jcmVhdGVXb3Jrc3BhY2VUcnVzdEluZGljYXRvcigpO1xuXHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZVNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5zeW5jSWdub3JlZEluZGljYXRvciA9IHRoaXMuY3JlYXRlU3luY0lnbm9yZWRJbmRpY2F0b3IoKTtcblx0XHR0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvciA9IHRoaXMuY3JlYXRlRGVmYXVsdE92ZXJyaWRlSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5wYXJlbnRoZXNpemVkSW5kaWNhdG9ycyA9IFt0aGlzLndvcmtzcGFjZVRydXN0SW5kaWNhdG9yLCB0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLCB0aGlzLnN5bmNJZ25vcmVkSW5kaWNhdG9yLCB0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvcl07XG5cdH1cblxuXHRwcml2YXRlIGRlZmF1bHRIb3Zlck9wdGlvbnM6IFBhcnRpYWw8SUhvdmVyT3B0aW9ucz4gPSB7XG5cdFx0dHJhcEZvY3VzOiB0cnVlLFxuXHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0cG9zaXRpb246IHtcblx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1csXG5cdFx0fSxcblx0fTtcblxuXG5cdHByaXZhdGUgY3JlYXRlV29ya3NwYWNlVHJ1c3RJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVHJ1c3RFbGVtZW50ID0gJCgnc3Bhbi5zZXR0aW5nLWluZGljYXRvci5zZXR0aW5nLWl0ZW0td29ya3NwYWNlLXRydXN0Jyk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVHJ1c3RMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKHdvcmtzcGFjZVRydXN0RWxlbWVudCkpO1xuXHRcdHdvcmtzcGFjZVRydXN0TGFiZWwudGV4dCA9ICckKHNoaWVsZCkgJyArIGxvY2FsaXplKCd3b3Jrc3BhY2VVbnRydXN0ZWRMYWJlbCcsIFwiUmVxdWlyZXMgd29ya3NwYWNlIHRydXN0XCIpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGxvY2FsaXplKCd0cnVzdExhYmVsJywgXCJUaGUgc2V0dGluZyB2YWx1ZSBjYW4gb25seSBiZSBhcHBsaWVkIGluIGEgdHJ1c3RlZCB3b3Jrc3BhY2UuXCIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih3b3Jrc3BhY2VUcnVzdEVsZW1lbnQsICgpID0+ICh7XG5cdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0YWN0aW9uczogW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtYW5hZ2VXb3Jrc3BhY2VUcnVzdCcsIFwiTWFuYWdlIFdvcmtzcGFjZSBUcnVzdFwiKSxcblx0XHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLnRydXN0Lm1hbmFnZScsXG5cdFx0XHRcdHJ1bjogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2gudHJ1c3QubWFuYWdlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdH0pLCB7IHNldHVwS2V5Ym9hcmRFdmVudHM6IHRydWUgfSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiB3b3Jrc3BhY2VUcnVzdEVsZW1lbnQsXG5cdFx0XHRsYWJlbDogd29ya3NwYWNlVHJ1c3RMYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2NvcGVPdmVycmlkZXNJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gRG9uJ3QgYWRkIC5zZXR0aW5nLWluZGljYXRvciBjbGFzcyBoZXJlLCBiZWNhdXNlIGl0IGdldHMgY29uZGl0aW9uYWxseSBhZGRlZCBsYXRlci5cblx0XHRjb25zdCBvdGhlck92ZXJyaWRlc0VsZW1lbnQgPSAkKCdzcGFuLnNldHRpbmctaXRlbS1vdmVycmlkZXMnKTtcblx0XHRjb25zdCBvdGhlck92ZXJyaWRlc0xhYmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTaW1wbGVJY29uTGFiZWwob3RoZXJPdmVycmlkZXNFbGVtZW50KSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IG90aGVyT3ZlcnJpZGVzRWxlbWVudCxcblx0XHRcdGxhYmVsOiBvdGhlck92ZXJyaWRlc0xhYmVsLFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTeW5jSWdub3JlZEluZGljYXRvcigpOiBTZXR0aW5nSW5kaWNhdG9yIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzeW5jSWdub3JlZEVsZW1lbnQgPSAkKCdzcGFuLnNldHRpbmctaW5kaWNhdG9yLnNldHRpbmctaXRlbS1pZ25vcmVkJyk7XG5cdFx0Y29uc3Qgc3luY0lnbm9yZWRMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKHN5bmNJZ25vcmVkRWxlbWVudCkpO1xuXHRcdHN5bmNJZ25vcmVkTGFiZWwudGV4dCA9IGxvY2FsaXplKCdleHRlbnNpb25TeW5jSWdub3JlZExhYmVsJywgJ05vdCBzeW5jZWQnKTtcblxuXHRcdGNvbnN0IHN5bmNJZ25vcmVkSG92ZXJDb250ZW50ID0gbG9jYWxpemUoJ3N5bmNJZ25vcmVkVGl0bGUnLCBcIlRoaXMgc2V0dGluZyBpcyBpZ25vcmVkIGR1cmluZyBzeW5jXCIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihzeW5jSWdub3JlZEVsZW1lbnQsIHtcblx0XHRcdC4uLnRoaXMuZGVmYXVsdEhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IHN5bmNJZ25vcmVkSG92ZXJDb250ZW50LFxuXHRcdH0sIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogc3luY0lnbm9yZWRFbGVtZW50LFxuXHRcdFx0bGFiZWw6IHN5bmNJZ25vcmVkTGFiZWwsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURlZmF1bHRPdmVycmlkZUluZGljYXRvcigpOiBTZXR0aW5nSW5kaWNhdG9yIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBkZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IgPSAkKCdzcGFuLnNldHRpbmctaW5kaWNhdG9yLnNldHRpbmctaXRlbS1kZWZhdWx0LW92ZXJyaWRkZW4nKTtcblx0XHRjb25zdCBkZWZhdWx0T3ZlcnJpZGVMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKGRlZmF1bHRPdmVycmlkZUluZGljYXRvcikpO1xuXHRcdGRlZmF1bHRPdmVycmlkZUxhYmVsLnRleHQgPSBsb2NhbGl6ZSgnZGVmYXVsdE92ZXJyaWRkZW5MYWJlbCcsIFwiRGVmYXVsdCB2YWx1ZSBjaGFuZ2VkXCIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IGRlZmF1bHRPdmVycmlkZUluZGljYXRvcixcblx0XHRcdGxhYmVsOiBkZWZhdWx0T3ZlcnJpZGVMYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUHJldmlld0luZGljYXRvcigpOiBTZXR0aW5nSW5kaWNhdG9yIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcmV2aWV3SW5kaWNhdG9yID0gJCgnc3Bhbi5zZXR0aW5nLWluZGljYXRvci5zZXR0aW5nLWl0ZW0tcHJldmlldycpO1xuXHRcdGNvbnN0IHByZXZpZXdMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKHByZXZpZXdJbmRpY2F0b3IpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBwcmV2aWV3SW5kaWNhdG9yLFxuXHRcdFx0bGFiZWw6IHByZXZpZXdMYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWR2YW5jZWRJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWR2YW5jZWRJbmRpY2F0b3IgPSAkKCdzcGFuLnNldHRpbmctaW5kaWNhdG9yLnNldHRpbmctaXRlbS1wcmV2aWV3Jyk7XG5cdFx0Y29uc3QgYWR2YW5jZWRMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKGFkdmFuY2VkSW5kaWNhdG9yKSk7XG5cdFx0YWR2YW5jZWRMYWJlbC50ZXh0ID0gbG9jYWxpemUoJ2FkdmFuY2VkTGFiZWwnLCBcIkFkdmFuY2VkXCIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGFkdmFuY2VkSW5kaWNhdG9yLCB7XG5cdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBBRFZBTkNFRF9JTkRJQ0FUT1JfREVTQ1JJUFRJT04sXG5cdFx0fSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBhZHZhbmNlZEluZGljYXRvcixcblx0XHRcdGxhYmVsOiBhZHZhbmNlZExhYmVsLFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKSB7XG5cdFx0dGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudC5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCBpc29sYXRlZEluZGljYXRvcnNUb1Nob3cgPSB0aGlzLmlzb2xhdGVkSW5kaWNhdG9ycy5maWx0ZXIoaW5kaWNhdG9yID0+IHtcblx0XHRcdHJldHVybiBpbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG5cdFx0fSk7XG5cdFx0aWYgKGlzb2xhdGVkSW5kaWNhdG9yc1RvU2hvdy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpc29sYXRlZEluZGljYXRvcnNUb1Nob3cubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0RE9NLmFwcGVuZCh0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LCBpc29sYXRlZEluZGljYXRvcnNUb1Nob3dbaV0uZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50aGVzaXplZEluZGljYXRvcnNUb1Nob3cgPSB0aGlzLnBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzLmZpbHRlcihpbmRpY2F0b3IgPT4ge1xuXHRcdFx0cmV0dXJuIGluZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0XHR9KTtcblx0XHRpZiAocGFyZW50aGVzaXplZEluZGljYXRvcnNUb1Nob3cubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdERPTS5hcHBlbmQodGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgJygnKSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93Lmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0XHRET00uYXBwZW5kKHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQsIHBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93W2ldLmVsZW1lbnQpO1xuXHRcdFx0XHRET00uYXBwZW5kKHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQsICQoJ3NwYW4uY29tbWEnLCB1bmRlZmluZWQsICcgXHUyMDIyICcpKTtcblx0XHRcdH1cblx0XHRcdERPTS5hcHBlbmQodGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudCwgcGFyZW50aGVzaXplZEluZGljYXRvcnNUb1Nob3dbcGFyZW50aGVzaXplZEluZGljYXRvcnNUb1Nob3cubGVuZ3RoIC0gMV0uZWxlbWVudCk7XG5cdFx0XHRET00uYXBwZW5kKHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQsICQoJ3NwYW4nLCB1bmRlZmluZWQsICcpJykpO1xuXHRcdH1cblx0XHR0aGlzLnJlc2V0SW5kaWNhdG9yTmF2aWdhdGlvbktleUJpbmRpbmdzKFsuLi5pc29sYXRlZEluZGljYXRvcnNUb1Nob3csIC4uLnBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93XSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0SW5kaWNhdG9yTmF2aWdhdGlvbktleUJpbmRpbmdzKGluZGljYXRvcnM6IFNldHRpbmdJbmRpY2F0b3JbXSkge1xuXHRcdHRoaXMua2V5YmluZGluZ0xpc3RlbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQucm9sZSA9IGluZGljYXRvcnMubGVuZ3RoID49IDEgPyAndG9vbGJhcicgOiAnYnV0dG9uJztcblx0XHRpZiAoIWluZGljYXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZpcnN0RWxlbWVudCA9IGluZGljYXRvcnNbMF0uZm9jdXNFbGVtZW50ID8/IGluZGljYXRvcnNbMF0uZWxlbWVudDtcblx0XHRmaXJzdEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMua2V5YmluZGluZ0xpc3RlbmVycy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRjb25zdCBldiA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRsZXQgaGFuZGxlZCA9IHRydWU7XG5cdFx0XHRpZiAoZXYuZXF1YWxzKEtleUNvZGUuSG9tZSkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c0luZGljYXRvckF0KGluZGljYXRvcnMsIDApO1xuXHRcdFx0fSBlbHNlIGlmIChldi5lcXVhbHMoS2V5Q29kZS5FbmQpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNJbmRpY2F0b3JBdChpbmRpY2F0b3JzLCBpbmRpY2F0b3JzLmxlbmd0aCAtIDEpO1xuXHRcdFx0fSBlbHNlIGlmIChldi5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0XHRjb25zdCBpbmRleFRvRm9jdXMgPSAodGhpcy5mb2N1c2VkSW5kZXggKyAxKSAlIGluZGljYXRvcnMubGVuZ3RoO1xuXHRcdFx0XHR0aGlzLmZvY3VzSW5kaWNhdG9yQXQoaW5kaWNhdG9ycywgaW5kZXhUb0ZvY3VzKTtcblx0XHRcdH0gZWxzZSBpZiAoZXYuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSkge1xuXHRcdFx0XHRjb25zdCBpbmRleFRvRm9jdXMgPSB0aGlzLmZvY3VzZWRJbmRleCA/IHRoaXMuZm9jdXNlZEluZGV4IC0gMSA6IGluZGljYXRvcnMubGVuZ3RoIC0gMTtcblx0XHRcdFx0dGhpcy5mb2N1c0luZGljYXRvckF0KGluZGljYXRvcnMsIGluZGV4VG9Gb2N1cyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYW5kbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzSW5kaWNhdG9yQXQoaW5kaWNhdG9yczogU2V0dGluZ0luZGljYXRvcltdLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0aWYgKGluZGV4ID09PSB0aGlzLmZvY3VzZWRJbmRleCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRpY2F0b3IgPSBpbmRpY2F0b3JzW2luZGV4XTtcblx0XHRjb25zdCBlbGVtZW50VG9Gb2N1cyA9IGluZGljYXRvci5mb2N1c0VsZW1lbnQgPz8gaW5kaWNhdG9yLmVsZW1lbnQ7XG5cdFx0ZWxlbWVudFRvRm9jdXMudGFiSW5kZXggPSAwO1xuXHRcdGVsZW1lbnRUb0ZvY3VzLmZvY3VzKCk7XG5cblx0XHRjb25zdCBjdXJyZW50bHlGb2N1c2VkSW5kaWNhdG9yID0gaW5kaWNhdG9yc1t0aGlzLmZvY3VzZWRJbmRleF07XG5cdFx0Y29uc3QgcHJldmlvdXNGb2N1c2VkRWxlbWVudCA9IGN1cnJlbnRseUZvY3VzZWRJbmRpY2F0b3IuZm9jdXNFbGVtZW50ID8/IGN1cnJlbnRseUZvY3VzZWRJbmRpY2F0b3IuZWxlbWVudDtcblx0XHRwcmV2aW91c0ZvY3VzZWRFbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cblx0XHR0aGlzLmZvY3VzZWRJbmRleCA9IGluZGV4O1xuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlVHJ1c3QoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHR0aGlzLndvcmtzcGFjZVRydXN0SW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGVsZW1lbnQuaXNVbnRydXN0ZWQgPyAnaW5saW5lJyA6ICdub25lJztcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0dXBkYXRlU3luY0lnbm9yZWQoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIGlnbm9yZWRTZXR0aW5nczogc3RyaW5nW10pIHtcblx0XHR0aGlzLnN5bmNJZ25vcmVkSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKClcblx0XHRcdCYmIGlnbm9yZWRTZXR0aW5ncy5pbmNsdWRlcyhlbGVtZW50LnNldHRpbmcua2V5KSA/ICdpbmxpbmUnIDogJ25vbmUnO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0aWYgKGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3MgIT09IGlnbm9yZWRTZXR0aW5ncykge1xuXHRcdFx0Y2FjaGVkU3luY0lnbm9yZWRTZXR0aW5ncyA9IGlnbm9yZWRTZXR0aW5ncztcblx0XHRcdGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3NTZXQgPSBuZXcgU2V0PHN0cmluZz4oY2FjaGVkU3luY0lnbm9yZWRTZXR0aW5ncyk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlUHJldmlld0luZGljYXRvcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdGNvbnN0IGlzUHJldmlld1NldHRpbmcgPSBlbGVtZW50LnRhZ3M/LmhhcygncHJldmlldycpO1xuXHRcdGNvbnN0IGlzRXhwZXJpbWVudGFsU2V0dGluZyA9IGVsZW1lbnQudGFncz8uaGFzKCdleHBlcmltZW50YWwnKTtcblx0XHR0aGlzLnByZXZpZXdJbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gKGlzUHJldmlld1NldHRpbmcgfHwgaXNFeHBlcmltZW50YWxTZXR0aW5nKSA/ICdpbmxpbmUnIDogJ25vbmUnO1xuXHRcdHRoaXMucHJldmlld0luZGljYXRvci5sYWJlbC50ZXh0ID0gaXNQcmV2aWV3U2V0dGluZyA/XG5cdFx0XHRsb2NhbGl6ZSgncHJldmlld0xhYmVsJywgXCJQcmV2aWV3XCIpIDpcblx0XHRcdGxvY2FsaXplKCdleHBlcmltZW50YWxMYWJlbCcsIFwiRXhwZXJpbWVudGFsXCIpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGlzUHJldmlld1NldHRpbmcgPyBQUkVWSUVXX0lORElDQVRPUl9ERVNDUklQVElPTiA6IEVYUEVSSU1FTlRBTF9JTkRJQ0FUT1JfREVTQ1JJUFRJT047XG5cdFx0dGhpcy5wcmV2aWV3SW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLnByZXZpZXdJbmRpY2F0b3IuZWxlbWVudCwge1xuXHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudCxcblx0XHR9LCB7IHNldHVwS2V5Ym9hcmRFdmVudHM6IHRydWUgfSkpO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHVwZGF0ZUFkdmFuY2VkSW5kaWNhdG9yKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0Y29uc3QgaXNBZHZhbmNlZFNldHRpbmcgPSBlbGVtZW50LnRhZ3M/LmhhcygnYWR2YW5jZWQnKTtcblx0XHR0aGlzLmFkdmFuY2VkSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGlzQWR2YW5jZWRTZXR0aW5nID8gJ2lubGluZScgOiAnbm9uZSc7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5saW5lU2NvcGVEaXNwbGF5VGV4dChjb21wbGV0ZVNjb3BlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IFtzY29wZSwgbGFuZ3VhZ2VdID0gY29tcGxldGVTY29wZS5zcGxpdCgnOicpO1xuXHRcdGNvbnN0IGxvY2FsaXplZFNjb3BlID0gc2NvcGUgPT09ICd1c2VyJyA/XG5cdFx0XHRsb2NhbGl6ZSgndXNlcicsIFwiVXNlclwiKSA6IHNjb3BlID09PSAnd29ya3NwYWNlJyA/XG5cdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSA6IGxvY2FsaXplKCdyZW1vdGUnLCBcIlJlbW90ZVwiKTtcblx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdHJldHVybiBgJHt0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpfSA+ICR7bG9jYWxpemVkU2NvcGV9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplZFNjb3BlO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmtleWJpbmRpbmdMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3QgaW5kaWNhdG9yIG9mIHRoaXMuaXNvbGF0ZWRJbmRpY2F0b3JzKSB7XG5cdFx0XHRpbmRpY2F0b3IuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGluZGljYXRvciBvZiB0aGlzLnBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzKSB7XG5cdFx0XHRpbmRpY2F0b3IuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVNjb3BlT3ZlcnJpZGVzKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBvbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50OiBFbWl0dGVyPElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50Piwgb25BcHBseUZpbHRlcjogRW1pdHRlcjxzdHJpbmc+KSB7XG5cdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmZvY3VzRWxlbWVudCA9IHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudDtcblx0XHRpZiAoZWxlbWVudC5oYXNQb2xpY3lWYWx1ZSkge1xuXHRcdFx0Ly8gSWYgdGhlIHNldHRpbmcgZmFsbHMgdW5kZXIgYSBwb2xpY3ksIHRoZW4gbm8gbWF0dGVyIHdoYXQgdGhlIHVzZXIgc2V0cywgdGhlIHBvbGljeSB2YWx1ZSB0YWtlcyBlZmZlY3QuXG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaW5kaWNhdG9yJyk7XG5cblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IubGFiZWwudGV4dCA9ICckKGJyaWVmY2FzZSkgJyArIGxvY2FsaXplKCdwb2xpY3lMYWJlbFRleHQnLCBcIk1hbmFnZWQgYnkgb3JnYW5pemF0aW9uXCIpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGxvY2FsaXplKCdwb2xpY3lEZXNjcmlwdGlvbicsIFwiVGhpcyBzZXR0aW5nIGlzIG1hbmFnZWQgYnkgeW91ciBvcmdhbml6YXRpb24gYW5kIGl0cyBhY3R1YWwgdmFsdWUgY2Fubm90IGJlIGNoYW5nZWQuXCIpO1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LCAoKSA9PiAoe1xuXHRcdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwb2xpY3lGaWx0ZXJMaW5rJywgXCJWaWV3IHBvbGljeSBzZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRjb21tYW5kSWQ6ICdfc2V0dGluZ3MuYWN0aW9uLnZpZXdQb2xpY3lTZXR0aW5ncycsXG5cdFx0XHRcdFx0cnVuOiAoXykgPT4ge1xuXHRcdFx0XHRcdFx0b25BcHBseUZpbHRlci5maXJlKGBAJHtQT0xJQ1lfU0VUVElOR19UQUd9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdH0pLCB7IHNldHVwS2V5Ym9hcmRFdmVudHM6IHRydWUgfSkpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5KSB7XG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaW5kaWNhdG9yJyk7XG5cblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IubGFiZWwudGV4dCA9ICckKGxvY2spICcgKyBsb2NhbGl6ZSgnYWdlbnRzV2luZG93UmVhZE9ubHlMYWJlbFRleHQnLCBcIkNhbm5vdCBiZSBjaGFuZ2VkIGluIEFnZW50cyB3aW5kb3dcIik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1dpbmRvd1JlYWRPbmx5RGVzY3JpcHRpb24nLCBcIlRoaXMgc2V0dGluZyBjYW5ub3QgYmUgY2hhbmdlZCBpbiB0aGUgQWdlbnRzIHdpbmRvdy5cIik7XG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQsIHtcblx0XHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0fSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhlbGVtZW50LnNldHRpbmcua2V5KSkge1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWluZGljYXRvcicpO1xuXG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmxhYmVsLnRleHQgPSBsb2NhbGl6ZSgnYXBwbGljYXRpb25TZXR0aW5nJywgXCJBcHBsaWVzIHRvIGFsbCBwcm9maWxlc1wiKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGxvY2FsaXplKCdhcHBsaWNhdGlvblNldHRpbmdEZXNjcmlwdGlvbicsIFwiVGhlIHNldHRpbmcgaXMgbm90IHNwZWNpZmljIHRvIHRoZSBjdXJyZW50IHByb2ZpbGUsIGFuZCB3aWxsIHJldGFpbiBpdHMgdmFsdWUgd2hlbiBzd2l0Y2hpbmcgcHJvZmlsZXMuXCIpO1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LCB7XG5cdFx0XHRcdC4uLnRoaXMuZGVmYXVsdEhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdH0sIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3QubGVuZ3RoIHx8IGVsZW1lbnQub3ZlcnJpZGRlbkRlZmF1bHRzTGFuZ3VhZ2VMaXN0Lmxlbmd0aCkge1xuXHRcdFx0aWYgKGVsZW1lbnQub3ZlcnJpZGRlblNjb3BlTGlzdC5sZW5ndGggPT09IDEgJiYgIWVsZW1lbnQub3ZlcnJpZGRlbkRlZmF1bHRzTGFuZ3VhZ2VMaXN0Lmxlbmd0aCkge1xuXHRcdFx0XHQvLyBXZSBjYW4gaW5saW5lIHRoZSBvdmVycmlkZSBhbmQgc2hvdyBhbGwgdGhlIHRleHQgaW4gdGhlIGxhYmVsXG5cdFx0XHRcdC8vIHNvIHRoYXQgdXNlcnMgZG9uJ3QgaGF2ZSB0byB3YWl0IGZvciB0aGUgaG92ZXIgdG8gbG9hZFxuXHRcdFx0XHQvLyBqdXN0IHRvIGNsaWNrIGludG8gdGhlIG9uZSBvdmVycmlkZSB0aGVyZSBpcy5cblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3NldHRpbmctaW5kaWNhdG9yJyk7XG5cblx0XHRcdFx0Y29uc3QgcHJlZmFjZVRleHQgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ2Fsc29Db25maWd1cmVkSW4nLCBcIkFsc28gbW9kaWZpZWQgaW5cIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdjb25maWd1cmVkSW4nLCBcIk1vZGlmaWVkIGluXCIpO1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmxhYmVsLnRleHQgPSBgJHtwcmVmYWNlVGV4dH0gYDtcblxuXHRcdFx0XHRjb25zdCBvdmVycmlkZGVuU2NvcGUgPSBlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3RbMF07XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBET00uYXBwZW5kKHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudCwgJCgnYS5tb2RpZmllZC1zY29wZScsIHVuZGVmaW5lZCwgdGhpcy5nZXRJbmxpbmVTY29wZURpc3BsYXlUZXh0KG92ZXJyaWRkZW5TY29wZSkpKTtcblx0XHRcdFx0dmlldy50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmZvY3VzRWxlbWVudCA9IHZpZXc7XG5cdFx0XHRcdGNvbnN0IG9uQ2xpY2tPcktleWRvd24gPSAoZTogVUlFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IFtzY29wZSwgbGFuZ3VhZ2VdID0gb3ZlcnJpZGRlblNjb3BlLnNwbGl0KCc6Jyk7XG5cdFx0XHRcdFx0b25EaWRDbGlja092ZXJyaWRlRWxlbWVudC5maXJlKHtcblx0XHRcdFx0XHRcdHNldHRpbmdLZXk6IGVsZW1lbnQuc2V0dGluZy5rZXksXG5cdFx0XHRcdFx0XHRzY29wZTogc2NvcGUgYXMgU2NvcGVTdHJpbmcsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHZpZXcsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdFx0b25DbGlja09yS2V5ZG93bihlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHZpZXcsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXYgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRcdGlmIChldi5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXYuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0XHRvbkNsaWNrT3JLZXlkb3duKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaW5kaWNhdG9yJyk7XG5cdFx0XHRcdGNvbnN0IHNjb3BlT3ZlcnJpZGVzTGFiZWxUZXh0ID0gZWxlbWVudC5pc0NvbmZpZ3VyZWQgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdhbHNvQ29uZmlndXJlZEVsc2V3aGVyZScsIFwiQWxzbyBtb2RpZmllZCBlbHNld2hlcmVcIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdjb25maWd1cmVkRWxzZXdoZXJlJywgXCJNb2RpZmllZCBlbHNld2hlcmVcIik7XG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IubGFiZWwudGV4dCA9IHNjb3BlT3ZlcnJpZGVzTGFiZWxUZXh0O1xuXG5cdFx0XHRcdGxldCBjb250ZW50TWFya2Rvd25TdHJpbmcgPSAnJztcblx0XHRcdFx0aWYgKGVsZW1lbnQub3ZlcnJpZGRlblNjb3BlTGlzdC5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBwcmVmYWNlVGV4dCA9IGVsZW1lbnQuaXNDb25maWd1cmVkID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhbHNvTW9kaWZpZWRJblNjb3BlcycsIFwiVGhlIHNldHRpbmcgaGFzIGFsc28gYmVlbiBtb2RpZmllZCBpbiB0aGUgZm9sbG93aW5nIHNjb3BlczpcIikgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ21vZGlmaWVkSW5TY29wZXMnLCBcIlRoZSBzZXR0aW5nIGhhcyBiZWVuIG1vZGlmaWVkIGluIHRoZSBmb2xsb3dpbmcgc2NvcGVzOlwiKTtcblx0XHRcdFx0XHRjb250ZW50TWFya2Rvd25TdHJpbmcgPSBwcmVmYWNlVGV4dDtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIGVsZW1lbnQub3ZlcnJpZGRlblNjb3BlTGlzdCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2NvcGVEaXNwbGF5VGV4dCA9IHRoaXMuZ2V0SW5saW5lU2NvcGVEaXNwbGF5VGV4dChzY29wZSk7XG5cdFx0XHRcdFx0XHRjb250ZW50TWFya2Rvd25TdHJpbmcgKz0gJ1xcbi0gJyArIGNyZWF0ZU1hcmtkb3duTGluayhzY29wZURpc3BsYXlUZXh0LCBTZXR0aW5nU2NvcGVMaW5rLmNyZWF0ZShzY29wZSkudG9TdHJpbmcoKSwgZ2V0QWNjZXNzaWJsZVNjb3BlRGlzcGxheVRleHQoc2NvcGUsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbGVtZW50Lm92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdC5sZW5ndGgpIHtcblx0XHRcdFx0XHRpZiAoY29udGVudE1hcmtkb3duU3RyaW5nKSB7XG5cdFx0XHRcdFx0XHRjb250ZW50TWFya2Rvd25TdHJpbmcgKz0gYFxcblxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHByZWZhY2VUZXh0ID0gbG9jYWxpemUoJ2hhc0RlZmF1bHRPdmVycmlkZXNGb3JMYW5ndWFnZXMnLCBcIlRoZSBmb2xsb3dpbmcgbGFuZ3VhZ2VzIGhhdmUgZGVmYXVsdCBvdmVycmlkZXM6XCIpO1xuXHRcdFx0XHRcdGNvbnRlbnRNYXJrZG93blN0cmluZyArPSBwcmVmYWNlVGV4dDtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGxhbmd1YWdlIG9mIGVsZW1lbnQub3ZlcnJpZGRlbkRlZmF1bHRzTGFuZ3VhZ2VMaXN0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzY29wZURpc3BsYXlUZXh0ID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlKTtcblx0XHRcdFx0XHRcdGNvbnRlbnRNYXJrZG93blN0cmluZyArPSAnXFxuLSAnICsgY3JlYXRlTWFya2Rvd25MaW5rKHNjb3BlRGlzcGxheVRleHQgPz8gbGFuZ3VhZ2UsIFNldHRpbmdTY29wZUxpbmsuY3JlYXRlKGBkZWZhdWx0OiR7bGFuZ3VhZ2V9YCkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQ6IElNYXJrZG93blN0cmluZyA9IHtcblx0XHRcdFx0XHR2YWx1ZTogY29udGVudE1hcmtkb3duU3RyaW5nLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0c3VwcG9ydEh0bWw6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRsaW5rSGFuZGxlcjogKHVybDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBbc2NvcGUsIGxhbmd1YWdlXSA9IFNldHRpbmdTY29wZUxpbmsucGFyc2UodXJsKS5zcGxpdCgnOicpO1xuXHRcdFx0XHRcdFx0b25EaWRDbGlja092ZXJyaWRlRWxlbWVudC5maXJlKHtcblx0XHRcdFx0XHRcdFx0c2V0dGluZ0tleTogZWxlbWVudC5zZXR0aW5nLmtleSxcblx0XHRcdFx0XHRcdFx0c2NvcGU6IHNjb3BlIGFzIFNjb3BlU3RyaW5nLFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHVwZGF0ZURlZmF1bHRPdmVycmlkZUluZGljYXRvcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdHRoaXMuZGVmYXVsdE92ZXJyaWRlSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRsZXQgc291cmNlVG9EaXNwbGF5ID0gZ2V0RGVmYXVsdFZhbHVlU291cmNlVG9EaXNwbGF5KGVsZW1lbnQpO1xuXHRcdGlmIChzb3VyY2VUb0Rpc3BsYXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5kZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHR0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvci5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHQvLyBTaG93IHNvdXJjZSBvZiBkZWZhdWx0IHZhbHVlIHdoZW4gaG92ZXJlZFxuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc291cmNlVG9EaXNwbGF5KSAmJiBzb3VyY2VUb0Rpc3BsYXkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHNvdXJjZVRvRGlzcGxheSA9IHNvdXJjZVRvRGlzcGxheVswXTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGRlZmF1bHRPdmVycmlkZUhvdmVyQ29udGVudDtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShzb3VyY2VUb0Rpc3BsYXkpKSB7XG5cdFx0XHRcdGRlZmF1bHRPdmVycmlkZUhvdmVyQ29udGVudCA9IGxvY2FsaXplKCdkZWZhdWx0T3ZlcnJpZGRlbkRldGFpbHMnLCBcIkRlZmF1bHQgc2V0dGluZyB2YWx1ZSBvdmVycmlkZGVuIGJ5IGB7MH1gXCIsIHNvdXJjZVRvRGlzcGxheSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzb3VyY2VUb0Rpc3BsYXkgPSBzb3VyY2VUb0Rpc3BsYXkubWFwKHNvdXJjZSA9PiBgXFxgJHtzb3VyY2V9XFxgYCk7XG5cdFx0XHRcdGRlZmF1bHRPdmVycmlkZUhvdmVyQ29udGVudCA9IGxvY2FsaXplKCdtdWx0aXBsZWRlZmF1bHRPdmVycmlkZGVuRGV0YWlscycsIFwiQSBkZWZhdWx0IHZhbHVlcyBoYXMgYmVlbiBzZXQgYnkgezB9XCIsIHNvdXJjZVRvRGlzcGxheS5zbGljZSgwLCAtMSkuam9pbignLCAnKSArICcgJiAnICsgc291cmNlVG9EaXNwbGF5LnNsaWNlKC0xKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZGVmYXVsdE92ZXJyaWRlSW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvci5lbGVtZW50LCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihkZWZhdWx0T3ZlcnJpZGVIb3ZlckNvbnRlbnQpLFxuXHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1csXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXREZWZhdWx0VmFsdWVTb3VyY2VUb0Rpc3BsYXkoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBzdHJpbmdbXSB7XG5cdGxldCBzb3VyY2VUb0Rpc3BsYXk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHN0cmluZ1tdO1xuXHRjb25zdCBkZWZhdWx0VmFsdWVTb3VyY2UgPSBlbGVtZW50LmRlZmF1bHRWYWx1ZVNvdXJjZTtcblx0aWYgKGRlZmF1bHRWYWx1ZVNvdXJjZSkge1xuXHRcdGlmIChkZWZhdWx0VmFsdWVTb3VyY2UgaW5zdGFuY2VvZiBNYXApIHtcblx0XHRcdHNvdXJjZVRvRGlzcGxheSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBbLCB2YWx1ZV0gb2YgZGVmYXVsdFZhbHVlU291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyA/IHZhbHVlLmRpc3BsYXlOYW1lID8/IHZhbHVlLmlkIDogdmFsdWU7XG5cdFx0XHRcdGlmICghc291cmNlVG9EaXNwbGF5LmluY2x1ZGVzKG5ld1ZhbHVlKSkge1xuXHRcdFx0XHRcdHNvdXJjZVRvRGlzcGxheS5wdXNoKG5ld1ZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHNvdXJjZVRvRGlzcGxheSA9IGRlZmF1bHRWYWx1ZVNvdXJjZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c291cmNlVG9EaXNwbGF5ID0gZGVmYXVsdFZhbHVlU291cmNlLmRpc3BsYXlOYW1lID8/IGRlZmF1bHRWYWx1ZVNvdXJjZS5pZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNvdXJjZVRvRGlzcGxheTtcbn1cblxuZnVuY3Rpb24gZ2V0QWNjZXNzaWJsZVNjb3BlRGlzcGxheVRleHQoY29tcGxldGVTY29wZTogc3RyaW5nLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCBbc2NvcGUsIGxhbmd1YWdlXSA9IGNvbXBsZXRlU2NvcGUuc3BsaXQoJzonKTtcblx0Y29uc3QgbG9jYWxpemVkU2NvcGUgPSBzY29wZSA9PT0gJ3VzZXInID9cblx0XHRsb2NhbGl6ZSgndXNlcicsIFwiVXNlclwiKSA6IHNjb3BlID09PSAnd29ya3NwYWNlJyA/XG5cdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIikgOiBsb2NhbGl6ZSgncmVtb3RlJywgXCJSZW1vdGVcIik7XG5cdGlmIChsYW5ndWFnZSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbW9kaWZpZWRJblNjb3BlRm9yTGFuZ3VhZ2UnLCBcIlRoZSB7MH0gc2NvcGUgZm9yIHsxfVwiLCBsb2NhbGl6ZWRTY29wZSwgbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZSkpO1xuXHR9XG5cdHJldHVybiBsb2NhbGl6ZWRTY29wZTtcbn1cblxuZnVuY3Rpb24gZ2V0QWNjZXNzaWJsZVNjb3BlRGlzcGxheU1pZFNlbnRlbmNlVGV4dChjb21wbGV0ZVNjb3BlOiBzdHJpbmcsIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSk6IHN0cmluZyB7XG5cdGNvbnN0IFtzY29wZSwgbGFuZ3VhZ2VdID0gY29tcGxldGVTY29wZS5zcGxpdCgnOicpO1xuXHRjb25zdCBsb2NhbGl6ZWRTY29wZSA9IHNjb3BlID09PSAndXNlcicgP1xuXHRcdGxvY2FsaXplKCd1c2VyJywgXCJVc2VyXCIpIDogc2NvcGUgPT09ICd3b3Jrc3BhY2UnID9cblx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSA6IGxvY2FsaXplKCdyZW1vdGUnLCBcIlJlbW90ZVwiKTtcblx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdtb2RpZmllZEluU2NvcGVGb3JMYW5ndWFnZU1pZFNlbnRlbmNlJywgXCJ0aGUgezB9IHNjb3BlIGZvciB7MX1cIiwgbG9jYWxpemVkU2NvcGUudG9Mb3dlckNhc2UoKSwgbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZSkpO1xuXHR9XG5cdHJldHVybiBsb2NhbGl6ZWRTY29wZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEluZGljYXRvcnNMYWJlbEFyaWFMYWJlbChlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlKTogc3RyaW5nIHtcblx0Y29uc3QgYXJpYUxhYmVsU2VjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gQWRkIHByZXZpZXcgb3IgZXhwZXJpbWVudGFsIGluZGljYXRvciB0ZXh0XG5cdGlmIChlbGVtZW50LnRhZ3M/LmhhcygncHJldmlldycpKSB7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChsb2NhbGl6ZSgncHJldmlld0xhYmVsJywgXCJQcmV2aWV3XCIpKTtcblx0fSBlbHNlIGlmIChlbGVtZW50LnRhZ3M/LmhhcygnZXhwZXJpbWVudGFsJykpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCdleHBlcmltZW50YWxMYWJlbCcsIFwiRXhwZXJpbWVudGFsXCIpKTtcblx0fVxuXG5cdGlmIChlbGVtZW50LnRhZ3M/LmhhcygnYWR2YW5jZWQnKSkge1xuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobG9jYWxpemUoJ2FkdmFuY2VkTGFiZWwnLCBcIkFkdmFuY2VkXCIpKTtcblx0fVxuXG5cdC8vIEFkZCB3b3Jrc3BhY2UgdHJ1c3QgdGV4dFxuXHRpZiAoZWxlbWVudC5pc1VudHJ1c3RlZCkge1xuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobG9jYWxpemUoJ3dvcmtzcGFjZVVudHJ1c3RlZEFyaWFMYWJlbCcsIFwiV29ya3NwYWNlIHVudHJ1c3RlZDsgc2V0dGluZyB2YWx1ZSBub3QgYXBwbGllZFwiKSk7XG5cdH1cblxuXHRpZiAoZWxlbWVudC5oYXNQb2xpY3lWYWx1ZSkge1xuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobG9jYWxpemUoJ3BvbGljeURlc2NyaXB0aW9uQWNjZXNzaWJsZScsIFwiTWFuYWdlZCBieSBvcmdhbml6YXRpb24gcG9saWN5OyBzZXR0aW5nIHZhbHVlIG5vdCBhcHBsaWVkXCIpKTtcblx0fSBlbHNlIGlmIChlbGVtZW50LmlzQWdlbnRzV2luZG93UmVhZE9ubHkpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCdhZ2VudHNXaW5kb3dSZWFkT25seUFjY2Vzc2libGUnLCBcIkNhbm5vdCBiZSBjaGFuZ2VkIGluIEFnZW50cyB3aW5kb3dcIikpO1xuXHR9IGVsc2UgaWYgKGVsZW1lbnQuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCAmJiBjb25maWd1cmF0aW9uU2VydmljZS5pc1NldHRpbmdBcHBsaWVkRm9yQWxsUHJvZmlsZXMoZWxlbWVudC5zZXR0aW5nLmtleSkpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCdhcHBsaWNhdGlvblNldHRpbmdEZXNjcmlwdGlvbkFjY2Vzc2libGUnLCBcIlNldHRpbmcgdmFsdWUgcmV0YWluZWQgd2hlbiBzd2l0Y2hpbmcgcHJvZmlsZXNcIikpO1xuXHR9IGVsc2Uge1xuXHRcdC8vIEFkZCBvdGhlciBvdmVycmlkZXMgdGV4dFxuXHRcdGNvbnN0IG90aGVyT3ZlcnJpZGVzU3RhcnQgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0XHRsb2NhbGl6ZSgnYWxzb0NvbmZpZ3VyZWRJbicsIFwiQWxzbyBtb2RpZmllZCBpblwiKSA6XG5cdFx0XHRsb2NhbGl6ZSgnY29uZmlndXJlZEluJywgXCJNb2RpZmllZCBpblwiKTtcblx0XHRjb25zdCBvdGhlck92ZXJyaWRlc0xpc3QgPSBlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3Rcblx0XHRcdC5tYXAoc2NvcGUgPT4gZ2V0QWNjZXNzaWJsZVNjb3BlRGlzcGxheU1pZFNlbnRlbmNlVGV4dChzY29wZSwgbGFuZ3VhZ2VTZXJ2aWNlKSkuam9pbignLCAnKTtcblx0XHRpZiAoZWxlbWVudC5vdmVycmlkZGVuU2NvcGVMaXN0Lmxlbmd0aCkge1xuXHRcdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChgJHtvdGhlck92ZXJyaWRlc1N0YXJ0fSAke290aGVyT3ZlcnJpZGVzTGlzdH1gKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBZGQgc3luYyBpZ25vcmVkIHRleHRcblx0aWYgKGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3NTZXQuaGFzKGVsZW1lbnQuc2V0dGluZy5rZXkpKSB7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChsb2NhbGl6ZSgnc3luY0lnbm9yZWRBcmlhTGFiZWwnLCBcIlNldHRpbmcgaWdub3JlZCBkdXJpbmcgc3luY1wiKSk7XG5cdH1cblxuXHQvLyBBZGQgZGVmYXVsdCBvdmVycmlkZSBpbmRpY2F0b3IgdGV4dFxuXHRsZXQgc291cmNlVG9EaXNwbGF5ID0gZ2V0RGVmYXVsdFZhbHVlU291cmNlVG9EaXNwbGF5KGVsZW1lbnQpO1xuXHRpZiAoc291cmNlVG9EaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShzb3VyY2VUb0Rpc3BsYXkpICYmIHNvdXJjZVRvRGlzcGxheS5sZW5ndGggPT09IDEpIHtcblx0XHRcdHNvdXJjZVRvRGlzcGxheSA9IHNvdXJjZVRvRGlzcGxheVswXTtcblx0XHR9XG5cblx0XHRsZXQgb3ZlcnJpZGRlbkRldGFpbHNUZXh0O1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzb3VyY2VUb0Rpc3BsYXkpKSB7XG5cdFx0XHRvdmVycmlkZGVuRGV0YWlsc1RleHQgPSBsb2NhbGl6ZSgnZGVmYXVsdE92ZXJyaWRkZW5EZXRhaWxzQXJpYUxhYmVsJywgXCJ7MH0gb3ZlcnJpZGVzIHRoZSBkZWZhdWx0IHZhbHVlXCIsIHNvdXJjZVRvRGlzcGxheSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG92ZXJyaWRkZW5EZXRhaWxzVGV4dCA9IGxvY2FsaXplKCdtdWx0aXBsZURlZmF1bHRPdmVycmlkZGVuRGV0YWlsc0FyaWFMYWJlbCcsIFwiezB9IG92ZXJyaWRlIHRoZSBkZWZhdWx0IHZhbHVlXCIsIHNvdXJjZVRvRGlzcGxheS5zbGljZSgwLCAtMSkuam9pbignLCAnKSArICcgJiAnICsgc291cmNlVG9EaXNwbGF5LnNsaWNlKC0xKSk7XG5cdFx0fVxuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gob3ZlcnJpZGRlbkRldGFpbHNUZXh0KTtcblx0fVxuXG5cdC8vIEFkZCB0ZXh0IGFib3V0IGRlZmF1bHQgdmFsdWVzIGJlaW5nIG92ZXJyaWRkZW4gaW4gb3RoZXIgbGFuZ3VhZ2VzXG5cdGNvbnN0IG90aGVyTGFuZ3VhZ2VPdmVycmlkZXNMaXN0ID0gZWxlbWVudC5vdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3Rcblx0XHQubWFwKGxhbmd1YWdlID0+IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpKS5qb2luKCcsICcpO1xuXHRpZiAoZWxlbWVudC5vdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3QubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgb3RoZXJMYW5ndWFnZU92ZXJyaWRlc1RleHQgPSBsb2NhbGl6ZSgnZGVmYXVsdE92ZXJyaWRkZW5MYW5ndWFnZXNMaXN0JywgXCJMYW5ndWFnZS1zcGVjaWZpYyBkZWZhdWx0IHZhbHVlcyBleGlzdCBmb3IgezB9XCIsIG90aGVyTGFuZ3VhZ2VPdmVycmlkZXNMaXN0KTtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKG90aGVyTGFuZ3VhZ2VPdmVycmlkZXNUZXh0KTtcblx0fVxuXG5cdGNvbnN0IGFyaWFMYWJlbCA9IGFyaWFMYWJlbFNlY3Rpb25zLmpvaW4oJy4gJyk7XG5cdHJldHVybiBhcmlhTGFiZWw7XG59XG5cbi8qKlxuICogSW50ZXJuYWwgbGlua3MgdXNlZCB0byBvcGVuIGEgc3BlY2lmaWMgc2NvcGUgaW4gdGhlIHNldHRpbmdzIGVkaXRvclxuICovXG5uYW1lc3BhY2UgU2V0dGluZ1Njb3BlTGluayB7XG5cdGV4cG9ydCBmdW5jdGlvbiBjcmVhdGUoc2NvcGU6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy5pbnRlcm5hbCxcblx0XHRcdHBhdGg6ICcvJyxcblx0XHRcdHF1ZXJ5OiBlbmNvZGVVUklDb21wb25lbnQoc2NvcGUpXG5cdFx0fSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2UobGluazogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UobGluayk7XG5cdFx0cmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudCh1cmkucXVlcnkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFzQztBQUMvQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUVoQyxTQUEwQixnQkFBZ0IsMEJBQTBCO0FBQ3BFLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZ0NBQWdDLG9DQUFvQyxvQkFBb0IscUNBQXFDO0FBR3RJLE1BQU0sSUFBSSxJQUFJO0FBMEJkLElBQUksK0JBQTRDLG9CQUFJLElBQVk7QUFNaEUsSUFBSSw0QkFBc0MsQ0FBQztBQUtwQyxJQUFNLDhCQUFOLE1BQXlEO0FBQUEsRUFrQi9ELFlBQ0MsV0FDaUQsc0JBQ2pCLGNBQ2lCLCtCQUNkLGlCQUNELGdCQUFpQztBQUpsQjtBQUNqQjtBQUNpQjtBQUNkO0FBQ0Q7QUFibkM7QUFBQSxTQUFpQixxQkFBeUMsQ0FBQztBQUkzRCxTQUFpQixzQkFBdUMsSUFBSSxnQkFBZ0I7QUFDNUUsU0FBUSxlQUFlO0FBdUJ2QixTQUFRLHNCQUE4QztBQUFBLE1BQ3JELFdBQVc7QUFBQSxNQUNYLE9BQU8sV0FBVztBQUFBLE1BQ2xCLFVBQVU7QUFBQSxRQUNULGVBQWUsY0FBYztBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQXBCQyxTQUFLLDZCQUE2QixJQUFJLE9BQU8sV0FB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QkFBa0IsS0FBSyxHQUFHLG1CQUFtQixJQUFJLGtCQUFrQixFQUFFO0FBQUEsSUFDdEU7QUFBQSxFQUNEO0FBR0EsTUFBSSw2QkFBNkIsSUFBSSxRQUFRLFFBQVEsR0FBRyxHQUFHO0FBQzFELHNCQUFrQixLQUFLLFNBQVMsd0JBQXdCLDZCQUE2QixDQUFDO0FBQUEsRUFDdkY7QUFHQSxNQUFJLGtCQUFrQiwrQkFBK0IsT0FBTztBQUM1RCxNQUFJLG9CQUFvQixRQUFXO0FBQ2xDLFFBQUksTUFBTSxRQUFRLGVBQWUsS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ25FLHdCQUFrQixnQkFBZ0IsQ0FBQztBQUFBLElBQ3BDO0FBRUEsUUFBSTtBQUNKLFFBQUksQ0FBQyxNQUFNLFFBQVEsZUFBZSxHQUFHO0FBQ3BDLDhCQUF3QixTQUFTLHFDQUFxQyxtQ0FBbUMsZUFBZTtBQUFBLElBQ3pILE9BQU87QUFDTiw4QkFBd0IsU0FBUyw2Q0FBNkMsa0NBQWtDLGdCQUFnQixNQUFNLEdBQUcsRUFBRSxFQUFFLEtBQUssSUFBSSxJQUFJLFFBQVEsZ0JBQWdCLE1BQU0sRUFBRSxDQUFDO0FBQUEsSUFDNUw7QUFDQSxzQkFBa0IsS0FBSyxxQkFBcUI7QUFBQSxFQUM3QztBQUdBLFFBQU0sNkJBQTZCLFFBQVEsK0JBQ3pDLElBQUksY0FBWSxnQkFBZ0IsZ0JBQWdCLFFBQVEsQ0FBQyxFQUFFLEtBQUssSUFBSTtBQUN0RSxNQUFJLFFBQVEsK0JBQStCLFFBQVE7QUFDbEQsVUFBTSw2QkFBNkIsU0FBUyxrQ0FBa0Msa0RBQWtELDBCQUEwQjtBQUMxSixzQkFBa0IsS0FBSywwQkFBMEI7QUFBQSxFQUNsRDtBQUVBLFFBQU0sWUFBWSxrQkFBa0IsS0FBSyxJQUFJO0FBQzdDLFNBQU87QUFDUjtBQUtBLElBQVU7QUFBQSxDQUFWLENBQVVBLHNCQUFWO0FBQ1EsV0FBUyxPQUFPLE9BQW9CO0FBQzFDLFdBQU8sSUFBSSxLQUFLO0FBQUEsTUFDZixRQUFRLFFBQVE7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQixLQUFLO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0Y7QUFOTyxFQUFBQSxrQkFBUztBQVFULFdBQVMsTUFBTSxNQUFzQjtBQUMzQyxVQUFNLE1BQU0sSUFBSSxNQUFNLElBQUk7QUFDMUIsV0FBTyxtQkFBbUIsSUFBSSxLQUFLO0FBQUEsRUFDcEM7QUFITyxFQUFBQSxrQkFBUztBQUFBLEdBVFA7IiwKICAibmFtZXMiOiBbIlNldHRpbmdTY29wZUxpbmsiXQp9Cg==
