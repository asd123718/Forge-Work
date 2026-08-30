import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { textmateColorsSchemaId, textmateColorGroupSchemaId } from "./colorThemeSchema.js";
import { workbenchColorsSchemaId } from "../../../../platform/theme/common/colorRegistry.js";
import { tokenStylingSchemaId } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
import { ThemeSettings, ThemeSettingDefaults } from "./workbenchThemeService.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { isWeb } from "../../../../base/common/platform.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
const colorThemeSettingEnum = [];
const colorThemeSettingEnumItemLabels = [];
const colorThemeSettingEnumDescriptions = [];
function formatSettingAsLink(str) {
  return `\`#${str}#\``;
}
const COLOR_THEME_CONFIGURATION_SETTINGS_TAG = "colorThemeConfiguration";
const colorThemeSettingSchema = {
  type: "string",
  markdownDescription: nls.localize({ key: "colorTheme", comment: ["{0} will become a link to another setting."] }, "Specifies the color theme used in the workbench when {0} is not enabled.", formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
  default: isWeb ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
  enum: colorThemeSettingEnum,
  enumDescriptions: colorThemeSettingEnumDescriptions,
  enumItemLabels: colorThemeSettingEnumItemLabels,
  errorMessage: nls.localize("colorThemeError", "Theme is unknown or not installed.")
};
const preferredDarkThemeSettingSchema = {
  type: "string",
  //
  markdownDescription: nls.localize({ key: "preferredDarkColorTheme", comment: ["{0} will become a link to another setting."] }, "Specifies the color theme when system color mode is dark and {0} is enabled.", formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
  default: ThemeSettingDefaults.COLOR_THEME_DARK,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
  enum: colorThemeSettingEnum,
  enumDescriptions: colorThemeSettingEnumDescriptions,
  enumItemLabels: colorThemeSettingEnumItemLabels,
  errorMessage: nls.localize("colorThemeError", "Theme is unknown or not installed.")
};
const preferredLightThemeSettingSchema = {
  type: "string",
  markdownDescription: nls.localize({ key: "preferredLightColorTheme", comment: ["{0} will become a link to another setting."] }, "Specifies the color theme when system color mode is light and {0} is enabled.", formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
  default: ThemeSettingDefaults.COLOR_THEME_LIGHT,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
  enum: colorThemeSettingEnum,
  enumDescriptions: colorThemeSettingEnumDescriptions,
  enumItemLabels: colorThemeSettingEnumItemLabels,
  errorMessage: nls.localize("colorThemeError", "Theme is unknown or not installed.")
};
const preferredHCDarkThemeSettingSchema = {
  type: "string",
  markdownDescription: nls.localize({ key: "preferredHCDarkColorTheme", comment: ["{0} will become a link to another setting."] }, "Specifies the color theme when in high contrast dark mode and {0} is enabled.", formatSettingAsLink(ThemeSettings.DETECT_HC)),
  default: ThemeSettingDefaults.COLOR_THEME_HC_DARK,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
  enum: colorThemeSettingEnum,
  enumDescriptions: colorThemeSettingEnumDescriptions,
  enumItemLabels: colorThemeSettingEnumItemLabels,
  errorMessage: nls.localize("colorThemeError", "Theme is unknown or not installed.")
};
const preferredHCLightThemeSettingSchema = {
  type: "string",
  markdownDescription: nls.localize({ key: "preferredHCLightColorTheme", comment: ["{0} will become a link to another setting."] }, "Specifies the color theme when in high contrast light mode and {0} is enabled.", formatSettingAsLink(ThemeSettings.DETECT_HC)),
  default: ThemeSettingDefaults.COLOR_THEME_HC_LIGHT,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
  enum: colorThemeSettingEnum,
  enumDescriptions: colorThemeSettingEnumDescriptions,
  enumItemLabels: colorThemeSettingEnumItemLabels,
  errorMessage: nls.localize("colorThemeError", "Theme is unknown or not installed.")
};
const detectColorSchemeSettingSchema = {
  type: "boolean",
  markdownDescription: nls.localize({ key: "detectColorScheme", comment: ["{0} and {1} will become links to other settings."] }, "If enabled, will automatically select a color theme based on the system color mode. If the system color mode is dark, {0} is used, else {1}.", formatSettingAsLink(ThemeSettings.PREFERRED_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_LIGHT_THEME)),
  default: false,
  ...isWeb ? { agentsWindow: { default: true } } : {},
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG]
};
const colorCustomizationsSchema = {
  type: "object",
  description: nls.localize("workbenchColors", "Overrides colors from the currently selected color theme."),
  allOf: [{ $ref: workbenchColorsSchemaId }],
  default: {},
  defaultSnippets: [{
    body: {}
  }]
};
const fileIconThemeSettingSchema = {
  type: ["string", "null"],
  default: ThemeSettingDefaults.FILE_ICON_THEME,
  description: nls.localize("iconTheme", "Specifies the file icon theme used in the workbench or 'null' to not show any file icons."),
  enum: [null],
  enumItemLabels: [nls.localize("noIconThemeLabel", "None")],
  enumDescriptions: [nls.localize("noIconThemeDesc", "No file icons")],
  errorMessage: nls.localize("iconThemeError", "File icon theme is unknown or not installed.")
};
const productIconThemeSettingSchema = {
  type: ["string", "null"],
  default: ThemeSettingDefaults.PRODUCT_ICON_THEME,
  description: nls.localize("productIconTheme", "Specifies the product icon theme used."),
  enum: [ThemeSettingDefaults.PRODUCT_ICON_THEME],
  enumItemLabels: [nls.localize("defaultProductIconThemeLabel", "Default")],
  enumDescriptions: [nls.localize("defaultProductIconThemeDesc", "Default")],
  errorMessage: nls.localize("productIconThemeError", "Product icon theme is unknown or not installed.")
};
const detectHCSchemeSettingSchema = {
  type: "boolean",
  default: true,
  markdownDescription: nls.localize({ key: "autoDetectHighContrast", comment: ["{0} and {1} will become links to other settings."] }, "If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme. The high contrast theme to use is specified by {0} and {1}.", formatSettingAsLink(ThemeSettings.PREFERRED_HC_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_HC_LIGHT_THEME)),
  scope: ConfigurationScope.APPLICATION,
  tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG]
};
const themeSettingsConfiguration = {
  id: "workbench",
  order: 7.1,
  type: "object",
  properties: {
    [ThemeSettings.COLOR_THEME]: colorThemeSettingSchema,
    [ThemeSettings.PREFERRED_DARK_THEME]: preferredDarkThemeSettingSchema,
    [ThemeSettings.PREFERRED_LIGHT_THEME]: preferredLightThemeSettingSchema,
    [ThemeSettings.PREFERRED_HC_DARK_THEME]: preferredHCDarkThemeSettingSchema,
    [ThemeSettings.PREFERRED_HC_LIGHT_THEME]: preferredHCLightThemeSettingSchema,
    [ThemeSettings.FILE_ICON_THEME]: fileIconThemeSettingSchema,
    [ThemeSettings.COLOR_CUSTOMIZATIONS]: colorCustomizationsSchema,
    [ThemeSettings.PRODUCT_ICON_THEME]: productIconThemeSettingSchema
  }
};
configurationRegistry.registerConfiguration(themeSettingsConfiguration);
const themeSettingsWindowConfiguration = {
  id: "window",
  order: 8.1,
  type: "object",
  properties: {
    [ThemeSettings.DETECT_HC]: detectHCSchemeSettingSchema,
    [ThemeSettings.DETECT_COLOR_SCHEME]: detectColorSchemeSettingSchema
  }
};
configurationRegistry.registerConfiguration(themeSettingsWindowConfiguration);
function tokenGroupSettings(description) {
  return {
    description,
    $ref: textmateColorGroupSchemaId
  };
}
const themeSpecificSettingKey = "^\\[[^\\]]*(\\]\\s*\\[[^\\]]*)*\\]$";
const tokenColorSchema = {
  type: "object",
  properties: {
    comments: tokenGroupSettings(nls.localize("editorColors.comments", "Sets the colors and styles for comments")),
    strings: tokenGroupSettings(nls.localize("editorColors.strings", "Sets the colors and styles for strings literals.")),
    keywords: tokenGroupSettings(nls.localize("editorColors.keywords", "Sets the colors and styles for keywords.")),
    numbers: tokenGroupSettings(nls.localize("editorColors.numbers", "Sets the colors and styles for number literals.")),
    types: tokenGroupSettings(nls.localize("editorColors.types", "Sets the colors and styles for type declarations and references.")),
    functions: tokenGroupSettings(nls.localize("editorColors.functions", "Sets the colors and styles for functions declarations and references.")),
    variables: tokenGroupSettings(nls.localize("editorColors.variables", "Sets the colors and styles for variables declarations and references.")),
    textMateRules: {
      description: nls.localize("editorColors.textMateRules", "Sets colors and styles using textmate theming rules (advanced)."),
      $ref: textmateColorsSchemaId
    },
    semanticHighlighting: {
      description: nls.localize("editorColors.semanticHighlighting", "Whether semantic highlighting should be enabled for this theme."),
      deprecationMessage: nls.localize("editorColors.semanticHighlighting.deprecationMessage", "Use `enabled` in `editor.semanticTokenColorCustomizations` setting instead."),
      markdownDeprecationMessage: nls.localize({ key: "editorColors.semanticHighlighting.deprecationMessageMarkdown", comment: ["{0} will become a link to another setting."] }, "Use `enabled` in {0} setting instead.", formatSettingAsLink("editor.semanticTokenColorCustomizations")),
      type: "boolean"
    }
  },
  additionalProperties: false
};
const tokenColorCustomizationSchema = {
  description: nls.localize("editorColors", "Overrides editor syntax colors and font style from the currently selected color theme."),
  default: {},
  allOf: [{ ...tokenColorSchema, patternProperties: { "^\\[": {} } }]
};
const semanticTokenColorSchema = {
  type: "object",
  properties: {
    enabled: {
      type: "boolean",
      description: nls.localize("editorColors.semanticHighlighting.enabled", "Whether semantic highlighting is enabled or disabled for this theme"),
      suggestSortText: "0_enabled"
    },
    rules: {
      $ref: tokenStylingSchemaId,
      description: nls.localize("editorColors.semanticHighlighting.rules", "Semantic token styling rules for this theme."),
      suggestSortText: "0_rules"
    }
  },
  additionalProperties: false
};
const semanticTokenColorCustomizationSchema = {
  description: nls.localize("semanticTokenColors", "Overrides editor semantic token color and styles from the currently selected color theme."),
  default: {},
  allOf: [{ ...semanticTokenColorSchema, patternProperties: { "^\\[": {} } }]
};
const tokenColorCustomizationConfiguration = {
  id: "editor",
  order: 7.2,
  type: "object",
  properties: {
    [ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS]: tokenColorCustomizationSchema,
    [ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS]: semanticTokenColorCustomizationSchema
  }
};
configurationRegistry.registerConfiguration(tokenColorCustomizationConfiguration);
function updateColorThemeConfigurationSchemas(themes) {
  themes.sort((a, b) => a.label.localeCompare(b.label));
  colorThemeSettingEnum.splice(0, colorThemeSettingEnum.length, ...themes.map((t) => t.settingsId));
  colorThemeSettingEnumDescriptions.splice(0, colorThemeSettingEnumDescriptions.length, ...themes.map((t) => t.description || ""));
  colorThemeSettingEnumItemLabels.splice(0, colorThemeSettingEnumItemLabels.length, ...themes.map((t) => t.label || ""));
  const themeSpecificWorkbenchColors = { properties: {} };
  const themeSpecificTokenColors = { properties: {} };
  const themeSpecificSemanticTokenColors = { properties: {} };
  const workbenchColors = { $ref: workbenchColorsSchemaId, additionalProperties: false };
  const tokenColors = { properties: tokenColorSchema.properties, additionalProperties: false };
  for (const t of themes) {
    const themeId = `[${t.settingsId}]`;
    themeSpecificWorkbenchColors.properties[themeId] = workbenchColors;
    themeSpecificTokenColors.properties[themeId] = tokenColors;
    themeSpecificSemanticTokenColors.properties[themeId] = semanticTokenColorSchema;
  }
  themeSpecificWorkbenchColors.patternProperties = { [themeSpecificSettingKey]: workbenchColors };
  themeSpecificTokenColors.patternProperties = { [themeSpecificSettingKey]: tokenColors };
  themeSpecificSemanticTokenColors.patternProperties = { [themeSpecificSettingKey]: semanticTokenColorSchema };
  colorCustomizationsSchema.allOf[1] = themeSpecificWorkbenchColors;
  tokenColorCustomizationSchema.allOf[1] = themeSpecificTokenColors;
  semanticTokenColorCustomizationSchema.allOf[1] = themeSpecificSemanticTokenColors;
  configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration, tokenColorCustomizationConfiguration);
}
function updateFileIconThemeConfigurationSchemas(themes) {
  fileIconThemeSettingSchema.enum.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.settingsId));
  fileIconThemeSettingSchema.enumItemLabels.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.label));
  fileIconThemeSettingSchema.enumDescriptions.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.description || ""));
  configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}
function updateProductIconThemeConfigurationSchemas(themes) {
  productIconThemeSettingSchema.enum.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.settingsId));
  productIconThemeSettingSchema.enumItemLabels.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.label));
  productIconThemeSettingSchema.enumDescriptions.splice(1, Number.MAX_VALUE, ...themes.map((t) => t.description || ""));
  configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}
const colorSchemeToPreferred = {
  [ColorScheme.DARK]: ThemeSettings.PREFERRED_DARK_THEME,
  [ColorScheme.LIGHT]: ThemeSettings.PREFERRED_LIGHT_THEME,
  [ColorScheme.HIGH_CONTRAST_DARK]: ThemeSettings.PREFERRED_HC_DARK_THEME,
  [ColorScheme.HIGH_CONTRAST_LIGHT]: ThemeSettings.PREFERRED_HC_LIGHT_THEME
};
class ThemeConfiguration {
  constructor(configurationService, hostColorService) {
    this.configurationService = configurationService;
    this.hostColorService = hostColorService;
  }
  get colorTheme() {
    return this.configurationService.getValue(this.getColorThemeSettingId());
  }
  get fileIconTheme() {
    return this.configurationService.getValue(ThemeSettings.FILE_ICON_THEME);
  }
  get productIconTheme() {
    return this.configurationService.getValue(ThemeSettings.PRODUCT_ICON_THEME);
  }
  get colorCustomizations() {
    return this.configurationService.getValue(ThemeSettings.COLOR_CUSTOMIZATIONS) || {};
  }
  get tokenColorCustomizations() {
    const tokenColorCustomization = this.configurationService.getValue(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS) || {};
    const textMateRules = tokenColorCustomization.textMateRules;
    if (!textMateRules) {
      return tokenColorCustomization;
    }
    const updatedRules = textMateRules.map((rule) => {
      const fontSize = rule.settings?.fontSize;
      const lineHeight = rule.settings?.lineHeight;
      if (fontSize !== void 0 && lineHeight === void 0) {
        return {
          ...rule,
          settings: {
            ...rule.settings,
            lineHeight: fontSize
          }
        };
      }
      return rule;
    });
    const updatedTokenColorCustomization = {
      ...tokenColorCustomization,
      textMateRules: updatedRules
    };
    return updatedTokenColorCustomization;
  }
  get semanticTokenColorCustomizations() {
    return this.configurationService.getValue(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS);
  }
  getPreferredColorScheme() {
    if (this.configurationService.getValue(ThemeSettings.DETECT_HC) && this.hostColorService.highContrast) {
      return this.hostColorService.dark ? ColorScheme.HIGH_CONTRAST_DARK : ColorScheme.HIGH_CONTRAST_LIGHT;
    }
    if (this.isDetectingColorScheme()) {
      return this.hostColorService.dark ? ColorScheme.DARK : ColorScheme.LIGHT;
    }
    return void 0;
  }
  isDetectingHighContrast() {
    return this.configurationService.getValue(ThemeSettings.DETECT_HC);
  }
  isDetectingColorScheme() {
    return this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME);
  }
  isPreferredColorSchemeChange(previous) {
    const darkChanged = previous.dark !== this.hostColorService.dark;
    if (this.isDetectingColorScheme() && darkChanged) {
      return true;
    }
    if (this.isDetectingHighContrast()) {
      return previous.highContrast !== this.hostColorService.highContrast || this.hostColorService.highContrast && darkChanged;
    }
    return false;
  }
  getColorThemeSettingId() {
    const preferredScheme = this.getPreferredColorScheme();
    return preferredScheme ? colorSchemeToPreferred[preferredScheme] : ThemeSettings.COLOR_THEME;
  }
  async setColorTheme(theme, settingsTarget) {
    await this.writeConfiguration(this.getColorThemeSettingId(), theme.settingsId, settingsTarget);
    return theme;
  }
  async setFileIconTheme(theme, settingsTarget) {
    await this.writeConfiguration(ThemeSettings.FILE_ICON_THEME, theme.settingsId, settingsTarget);
    return theme;
  }
  async setProductIconTheme(theme, settingsTarget) {
    await this.writeConfiguration(ThemeSettings.PRODUCT_ICON_THEME, theme.settingsId, settingsTarget);
    return theme;
  }
  isDefaultColorTheme() {
    const settings = this.configurationService.inspect(this.getColorThemeSettingId());
    return settings && settings.default?.value === settings.value;
  }
  findAutoConfigurationTarget(key) {
    const settings = this.configurationService.inspect(key);
    if (!types.isUndefined(settings.workspaceFolderValue)) {
      return ConfigurationTarget.WORKSPACE_FOLDER;
    } else if (!types.isUndefined(settings.workspaceValue)) {
      return ConfigurationTarget.WORKSPACE;
    } else if (!types.isUndefined(settings.userRemoteValue)) {
      return ConfigurationTarget.USER_REMOTE;
    }
    return ConfigurationTarget.USER;
  }
  async writeConfiguration(key, value, settingsTarget) {
    if (settingsTarget === void 0 || settingsTarget === "preview") {
      return;
    }
    const settings = this.configurationService.inspect(key);
    if (settingsTarget === "auto") {
      return this.configurationService.updateValue(key, value);
    }
    if (settingsTarget === ConfigurationTarget.USER) {
      if (value === settings.userValue) {
        return Promise.resolve(void 0);
      } else if (value === settings.defaultValue) {
        if (types.isUndefined(settings.userValue)) {
          return Promise.resolve(void 0);
        }
        value = void 0;
      }
    } else if (settingsTarget === ConfigurationTarget.WORKSPACE || settingsTarget === ConfigurationTarget.WORKSPACE_FOLDER || settingsTarget === ConfigurationTarget.USER_REMOTE) {
      if (value === settings.value) {
        return Promise.resolve(void 0);
      }
    }
    return this.configurationService.updateValue(key, value, settingsTarget);
  }
}
export {
  COLOR_THEME_CONFIGURATION_SETTINGS_TAG,
  ThemeConfiguration,
  formatSettingAsLink,
  updateColorThemeConfigurationSchemas,
  updateFileIconThemeConfigurationSchemas,
  updateProductIconThemeConfigurationSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcdGhlbWVDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvbk5vZGUsIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5cbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyB0ZXh0bWF0ZUNvbG9yc1NjaGVtYUlkLCB0ZXh0bWF0ZUNvbG9yR3JvdXBTY2hlbWFJZCB9IGZyb20gJy4vY29sb3JUaGVtZVNjaGVtYS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hDb2xvcnNTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHRva2VuU3R5bGluZ1NjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3Rva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUaGVtZVNldHRpbmdzLCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIElDb2xvckN1c3RvbWl6YXRpb25zLCBJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zLCBJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZSwgSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zLCBUaGVtZVNldHRpbmdUYXJnZXQsIFRoZW1lU2V0dGluZ0RlZmF1bHRzIH0gZnJvbSAnLi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElIb3N0Q29sb3JTY2hlbWVTZXJ2aWNlIH0gZnJvbSAnLi9ob3N0Q29sb3JTY2hlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2xvclNjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcblxuLy8gQ29uZmlndXJhdGlvbjogVGhlbWVzXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuY29uc3QgY29sb3JUaGVtZVNldHRpbmdFbnVtOiBzdHJpbmdbXSA9IFtdO1xuY29uc3QgY29sb3JUaGVtZVNldHRpbmdFbnVtSXRlbUxhYmVsczogc3RyaW5nW10gPSBbXTtcbmNvbnN0IGNvbG9yVGhlbWVTZXR0aW5nRW51bURlc2NyaXB0aW9uczogc3RyaW5nW10gPSBbXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFNldHRpbmdBc0xpbmsoc3RyOiBzdHJpbmcpIHtcblx0cmV0dXJuIGBcXGAjJHtzdHJ9I1xcYGA7XG59XG5cbmV4cG9ydCBjb25zdCBDT0xPUl9USEVNRV9DT05GSUdVUkFUSU9OX1NFVFRJTkdTX1RBRyA9ICdjb2xvclRoZW1lQ29uZmlndXJhdGlvbic7XG5cbmNvbnN0IGNvbG9yVGhlbWVTZXR0aW5nU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnY29sb3JUaGVtZScsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmVjb21lIGEgbGluayB0byBhbm90aGVyIHNldHRpbmcuJ10gfSwgXCJTcGVjaWZpZXMgdGhlIGNvbG9yIHRoZW1lIHVzZWQgaW4gdGhlIHdvcmtiZW5jaCB3aGVuIHswfSBpcyBub3QgZW5hYmxlZC5cIiwgZm9ybWF0U2V0dGluZ0FzTGluayhUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUpKSxcblx0ZGVmYXVsdDogaXNXZWIgPyBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVCA6IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUkssXG5cdHRhZ3M6IFtDT0xPUl9USEVNRV9DT05GSUdVUkFUSU9OX1NFVFRJTkdTX1RBR10sXG5cdGVudW06IGNvbG9yVGhlbWVTZXR0aW5nRW51bSxcblx0ZW51bURlc2NyaXB0aW9uczogY29sb3JUaGVtZVNldHRpbmdFbnVtRGVzY3JpcHRpb25zLFxuXHRlbnVtSXRlbUxhYmVsczogY29sb3JUaGVtZVNldHRpbmdFbnVtSXRlbUxhYmVscyxcblx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbG9yVGhlbWVFcnJvcicsIFwiVGhlbWUgaXMgdW5rbm93biBvciBub3QgaW5zdGFsbGVkLlwiKSxcbn07XG5jb25zdCBwcmVmZXJyZWREYXJrVGhlbWVTZXR0aW5nU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJywgLy9cblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncHJlZmVycmVkRGFya0NvbG9yVGhlbWUnLCBjb21tZW50OiBbJ3swfSB3aWxsIGJlY29tZSBhIGxpbmsgdG8gYW5vdGhlciBzZXR0aW5nLiddIH0sICdTcGVjaWZpZXMgdGhlIGNvbG9yIHRoZW1lIHdoZW4gc3lzdGVtIGNvbG9yIG1vZGUgaXMgZGFyayBhbmQgezB9IGlzIGVuYWJsZWQuJywgZm9ybWF0U2V0dGluZ0FzTGluayhUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUpKSxcblx0ZGVmYXVsdDogVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSyxcblx0dGFnczogW0NPTE9SX1RIRU1FX0NPTkZJR1VSQVRJT05fU0VUVElOR1NfVEFHXSxcblx0ZW51bTogY29sb3JUaGVtZVNldHRpbmdFbnVtLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBjb2xvclRoZW1lU2V0dGluZ0VudW1EZXNjcmlwdGlvbnMsXG5cdGVudW1JdGVtTGFiZWxzOiBjb2xvclRoZW1lU2V0dGluZ0VudW1JdGVtTGFiZWxzLFxuXHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29sb3JUaGVtZUVycm9yJywgXCJUaGVtZSBpcyB1bmtub3duIG9yIG5vdCBpbnN0YWxsZWQuXCIpLFxufTtcbmNvbnN0IHByZWZlcnJlZExpZ2h0VGhlbWVTZXR0aW5nU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncHJlZmVycmVkTGlnaHRDb2xvclRoZW1lJywgY29tbWVudDogWyd7MH0gd2lsbCBiZWNvbWUgYSBsaW5rIHRvIGFub3RoZXIgc2V0dGluZy4nXSB9LCAnU3BlY2lmaWVzIHRoZSBjb2xvciB0aGVtZSB3aGVuIHN5c3RlbSBjb2xvciBtb2RlIGlzIGxpZ2h0IGFuZCB7MH0gaXMgZW5hYmxlZC4nLCBmb3JtYXRTZXR0aW5nQXNMaW5rKFRoZW1lU2V0dGluZ3MuREVURUNUX0NPTE9SX1NDSEVNRSkpLFxuXHRkZWZhdWx0OiBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVCxcblx0dGFnczogW0NPTE9SX1RIRU1FX0NPTkZJR1VSQVRJT05fU0VUVElOR1NfVEFHXSxcblx0ZW51bTogY29sb3JUaGVtZVNldHRpbmdFbnVtLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBjb2xvclRoZW1lU2V0dGluZ0VudW1EZXNjcmlwdGlvbnMsXG5cdGVudW1JdGVtTGFiZWxzOiBjb2xvclRoZW1lU2V0dGluZ0VudW1JdGVtTGFiZWxzLFxuXHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29sb3JUaGVtZUVycm9yJywgXCJUaGVtZSBpcyB1bmtub3duIG9yIG5vdCBpbnN0YWxsZWQuXCIpLFxufTtcbmNvbnN0IHByZWZlcnJlZEhDRGFya1RoZW1lU2V0dGluZ1NjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3ByZWZlcnJlZEhDRGFya0NvbG9yVGhlbWUnLCBjb21tZW50OiBbJ3swfSB3aWxsIGJlY29tZSBhIGxpbmsgdG8gYW5vdGhlciBzZXR0aW5nLiddIH0sICdTcGVjaWZpZXMgdGhlIGNvbG9yIHRoZW1lIHdoZW4gaW4gaGlnaCBjb250cmFzdCBkYXJrIG1vZGUgYW5kIHswfSBpcyBlbmFibGVkLicsIGZvcm1hdFNldHRpbmdBc0xpbmsoVGhlbWVTZXR0aW5ncy5ERVRFQ1RfSEMpKSxcblx0ZGVmYXVsdDogVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfSENfREFSSyxcblx0dGFnczogW0NPTE9SX1RIRU1FX0NPTkZJR1VSQVRJT05fU0VUVElOR1NfVEFHXSxcblx0ZW51bTogY29sb3JUaGVtZVNldHRpbmdFbnVtLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBjb2xvclRoZW1lU2V0dGluZ0VudW1EZXNjcmlwdGlvbnMsXG5cdGVudW1JdGVtTGFiZWxzOiBjb2xvclRoZW1lU2V0dGluZ0VudW1JdGVtTGFiZWxzLFxuXHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29sb3JUaGVtZUVycm9yJywgXCJUaGVtZSBpcyB1bmtub3duIG9yIG5vdCBpbnN0YWxsZWQuXCIpLFxufTtcbmNvbnN0IHByZWZlcnJlZEhDTGlnaHRUaGVtZVNldHRpbmdTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdwcmVmZXJyZWRIQ0xpZ2h0Q29sb3JUaGVtZScsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmVjb21lIGEgbGluayB0byBhbm90aGVyIHNldHRpbmcuJ10gfSwgJ1NwZWNpZmllcyB0aGUgY29sb3IgdGhlbWUgd2hlbiBpbiBoaWdoIGNvbnRyYXN0IGxpZ2h0IG1vZGUgYW5kIHswfSBpcyBlbmFibGVkLicsIGZvcm1hdFNldHRpbmdBc0xpbmsoVGhlbWVTZXR0aW5ncy5ERVRFQ1RfSEMpKSxcblx0ZGVmYXVsdDogVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfSENfTElHSFQsXG5cdHRhZ3M6IFtDT0xPUl9USEVNRV9DT05GSUdVUkFUSU9OX1NFVFRJTkdTX1RBR10sXG5cdGVudW06IGNvbG9yVGhlbWVTZXR0aW5nRW51bSxcblx0ZW51bURlc2NyaXB0aW9uczogY29sb3JUaGVtZVNldHRpbmdFbnVtRGVzY3JpcHRpb25zLFxuXHRlbnVtSXRlbUxhYmVsczogY29sb3JUaGVtZVNldHRpbmdFbnVtSXRlbUxhYmVscyxcblx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbG9yVGhlbWVFcnJvcicsIFwiVGhlbWUgaXMgdW5rbm93biBvciBub3QgaW5zdGFsbGVkLlwiKSxcbn07XG5jb25zdCBkZXRlY3RDb2xvclNjaGVtZVNldHRpbmdTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnZGV0ZWN0Q29sb3JTY2hlbWUnLCBjb21tZW50OiBbJ3swfSBhbmQgezF9IHdpbGwgYmVjb21lIGxpbmtzIHRvIG90aGVyIHNldHRpbmdzLiddIH0sICdJZiBlbmFibGVkLCB3aWxsIGF1dG9tYXRpY2FsbHkgc2VsZWN0IGEgY29sb3IgdGhlbWUgYmFzZWQgb24gdGhlIHN5c3RlbSBjb2xvciBtb2RlLiBJZiB0aGUgc3lzdGVtIGNvbG9yIG1vZGUgaXMgZGFyaywgezB9IGlzIHVzZWQsIGVsc2UgezF9LicsIGZvcm1hdFNldHRpbmdBc0xpbmsoVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfREFSS19USEVNRSksIGZvcm1hdFNldHRpbmdBc0xpbmsoVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfTElHSFRfVEhFTUUpKSxcblx0ZGVmYXVsdDogZmFsc2UsXG5cdC4uLihpc1dlYiA/IHsgYWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSB9IDoge30pLFxuXHR0YWdzOiBbQ09MT1JfVEhFTUVfQ09ORklHVVJBVElPTl9TRVRUSU5HU19UQUddLFxufTtcblxuY29uc3QgY29sb3JDdXN0b21pemF0aW9uc1NjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtiZW5jaENvbG9ycycsIFwiT3ZlcnJpZGVzIGNvbG9ycyBmcm9tIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgY29sb3IgdGhlbWUuXCIpLFxuXHRhbGxPZjogW3sgJHJlZjogd29ya2JlbmNoQ29sb3JzU2NoZW1hSWQgfV0sXG5cdGRlZmF1bHQ6IHt9LFxuXHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0Ym9keToge1xuXHRcdH1cblx0fV1cbn07XG5jb25zdCBmaWxlSWNvblRoZW1lU2V0dGluZ1NjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRkZWZhdWx0OiBUaGVtZVNldHRpbmdEZWZhdWx0cy5GSUxFX0lDT05fVEhFTUUsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ljb25UaGVtZScsIFwiU3BlY2lmaWVzIHRoZSBmaWxlIGljb24gdGhlbWUgdXNlZCBpbiB0aGUgd29ya2JlbmNoIG9yICdudWxsJyB0byBub3Qgc2hvdyBhbnkgZmlsZSBpY29ucy5cIiksXG5cdGVudW06IFtudWxsXSxcblx0ZW51bUl0ZW1MYWJlbHM6IFtubHMubG9jYWxpemUoJ25vSWNvblRoZW1lTGFiZWwnLCAnTm9uZScpXSxcblx0ZW51bURlc2NyaXB0aW9uczogW25scy5sb2NhbGl6ZSgnbm9JY29uVGhlbWVEZXNjJywgJ05vIGZpbGUgaWNvbnMnKV0sXG5cdGVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdpY29uVGhlbWVFcnJvcicsIFwiRmlsZSBpY29uIHRoZW1lIGlzIHVua25vd24gb3Igbm90IGluc3RhbGxlZC5cIilcbn07XG5jb25zdCBwcm9kdWN0SWNvblRoZW1lU2V0dGluZ1NjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRkZWZhdWx0OiBUaGVtZVNldHRpbmdEZWZhdWx0cy5QUk9EVUNUX0lDT05fVEhFTUUsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Byb2R1Y3RJY29uVGhlbWUnLCBcIlNwZWNpZmllcyB0aGUgcHJvZHVjdCBpY29uIHRoZW1lIHVzZWQuXCIpLFxuXHRlbnVtOiBbVGhlbWVTZXR0aW5nRGVmYXVsdHMuUFJPRFVDVF9JQ09OX1RIRU1FXSxcblx0ZW51bUl0ZW1MYWJlbHM6IFtubHMubG9jYWxpemUoJ2RlZmF1bHRQcm9kdWN0SWNvblRoZW1lTGFiZWwnLCAnRGVmYXVsdCcpXSxcblx0ZW51bURlc2NyaXB0aW9uczogW25scy5sb2NhbGl6ZSgnZGVmYXVsdFByb2R1Y3RJY29uVGhlbWVEZXNjJywgJ0RlZmF1bHQnKV0sXG5cdGVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdwcm9kdWN0SWNvblRoZW1lRXJyb3InLCBcIlByb2R1Y3QgaWNvbiB0aGVtZSBpcyB1bmtub3duIG9yIG5vdCBpbnN0YWxsZWQuXCIpXG59O1xuXG5jb25zdCBkZXRlY3RIQ1NjaGVtZVNldHRpbmdTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0ZGVmYXVsdDogdHJ1ZSxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnYXV0b0RldGVjdEhpZ2hDb250cmFzdCcsIGNvbW1lbnQ6IFsnezB9IGFuZCB7MX0gd2lsbCBiZWNvbWUgbGlua3MgdG8gb3RoZXIgc2V0dGluZ3MuJ10gfSwgXCJJZiBlbmFibGVkLCB3aWxsIGF1dG9tYXRpY2FsbHkgY2hhbmdlIHRvIGhpZ2ggY29udHJhc3QgdGhlbWUgaWYgdGhlIE9TIGlzIHVzaW5nIGEgaGlnaCBjb250cmFzdCB0aGVtZS4gVGhlIGhpZ2ggY29udHJhc3QgdGhlbWUgdG8gdXNlIGlzIHNwZWNpZmllZCBieSB7MH0gYW5kIHsxfS5cIiwgZm9ybWF0U2V0dGluZ0FzTGluayhUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19EQVJLX1RIRU1FKSwgZm9ybWF0U2V0dGluZ0FzTGluayhUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRSkpLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHR0YWdzOiBbQ09MT1JfVEhFTUVfQ09ORklHVVJBVElPTl9TRVRUSU5HU19UQUddLFxufTtcblxuY29uc3QgdGhlbWVTZXR0aW5nc0NvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0aWQ6ICd3b3JrYmVuY2gnLFxuXHRvcmRlcjogNy4xLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtUaGVtZVNldHRpbmdzLkNPTE9SX1RIRU1FXTogY29sb3JUaGVtZVNldHRpbmdTY2hlbWEsXG5cdFx0W1RoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0RBUktfVEhFTUVdOiBwcmVmZXJyZWREYXJrVGhlbWVTZXR0aW5nU2NoZW1hLFxuXHRcdFtUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9MSUdIVF9USEVNRV06IHByZWZlcnJlZExpZ2h0VGhlbWVTZXR0aW5nU2NoZW1hLFxuXHRcdFtUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19EQVJLX1RIRU1FXTogcHJlZmVycmVkSENEYXJrVGhlbWVTZXR0aW5nU2NoZW1hLFxuXHRcdFtUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRV06IHByZWZlcnJlZEhDTGlnaHRUaGVtZVNldHRpbmdTY2hlbWEsXG5cdFx0W1RoZW1lU2V0dGluZ3MuRklMRV9JQ09OX1RIRU1FXTogZmlsZUljb25UaGVtZVNldHRpbmdTY2hlbWEsXG5cdFx0W1RoZW1lU2V0dGluZ3MuQ09MT1JfQ1VTVE9NSVpBVElPTlNdOiBjb2xvckN1c3RvbWl6YXRpb25zU2NoZW1hLFxuXHRcdFtUaGVtZVNldHRpbmdzLlBST0RVQ1RfSUNPTl9USEVNRV06IHByb2R1Y3RJY29uVGhlbWVTZXR0aW5nU2NoZW1hXG5cdH1cbn07XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHRoZW1lU2V0dGluZ3NDb25maWd1cmF0aW9uKTtcblxuY29uc3QgdGhlbWVTZXR0aW5nc1dpbmRvd0NvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0aWQ6ICd3aW5kb3cnLFxuXHRvcmRlcjogOC4xLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtUaGVtZVNldHRpbmdzLkRFVEVDVF9IQ106IGRldGVjdEhDU2NoZW1lU2V0dGluZ1NjaGVtYSxcblx0XHRbVGhlbWVTZXR0aW5ncy5ERVRFQ1RfQ09MT1JfU0NIRU1FXTogZGV0ZWN0Q29sb3JTY2hlbWVTZXR0aW5nU2NoZW1hLFxuXHR9XG59O1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih0aGVtZVNldHRpbmdzV2luZG93Q29uZmlndXJhdGlvbik7XG5cbmZ1bmN0aW9uIHRva2VuR3JvdXBTZXR0aW5ncyhkZXNjcmlwdGlvbjogc3RyaW5nKTogSUpTT05TY2hlbWEge1xuXHRyZXR1cm4ge1xuXHRcdGRlc2NyaXB0aW9uLFxuXHRcdCRyZWY6IHRleHRtYXRlQ29sb3JHcm91cFNjaGVtYUlkXG5cdH07XG59XG5cbmNvbnN0IHRoZW1lU3BlY2lmaWNTZXR0aW5nS2V5ID0gJ15cXFxcW1teXFxcXF1dKihcXFxcXVxcXFxzKlxcXFxbW15cXFxcXV0qKSpcXFxcXSQnO1xuXG5jb25zdCB0b2tlbkNvbG9yU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRjb21tZW50czogdG9rZW5Hcm91cFNldHRpbmdzKG5scy5sb2NhbGl6ZSgnZWRpdG9yQ29sb3JzLmNvbW1lbnRzJywgXCJTZXRzIHRoZSBjb2xvcnMgYW5kIHN0eWxlcyBmb3IgY29tbWVudHNcIikpLFxuXHRcdHN0cmluZ3M6IHRva2VuR3JvdXBTZXR0aW5ncyhubHMubG9jYWxpemUoJ2VkaXRvckNvbG9ycy5zdHJpbmdzJywgXCJTZXRzIHRoZSBjb2xvcnMgYW5kIHN0eWxlcyBmb3Igc3RyaW5ncyBsaXRlcmFscy5cIikpLFxuXHRcdGtleXdvcmRzOiB0b2tlbkdyb3VwU2V0dGluZ3MobmxzLmxvY2FsaXplKCdlZGl0b3JDb2xvcnMua2V5d29yZHMnLCBcIlNldHMgdGhlIGNvbG9ycyBhbmQgc3R5bGVzIGZvciBrZXl3b3Jkcy5cIikpLFxuXHRcdG51bWJlcnM6IHRva2VuR3JvdXBTZXR0aW5ncyhubHMubG9jYWxpemUoJ2VkaXRvckNvbG9ycy5udW1iZXJzJywgXCJTZXRzIHRoZSBjb2xvcnMgYW5kIHN0eWxlcyBmb3IgbnVtYmVyIGxpdGVyYWxzLlwiKSksXG5cdFx0dHlwZXM6IHRva2VuR3JvdXBTZXR0aW5ncyhubHMubG9jYWxpemUoJ2VkaXRvckNvbG9ycy50eXBlcycsIFwiU2V0cyB0aGUgY29sb3JzIGFuZCBzdHlsZXMgZm9yIHR5cGUgZGVjbGFyYXRpb25zIGFuZCByZWZlcmVuY2VzLlwiKSksXG5cdFx0ZnVuY3Rpb25zOiB0b2tlbkdyb3VwU2V0dGluZ3MobmxzLmxvY2FsaXplKCdlZGl0b3JDb2xvcnMuZnVuY3Rpb25zJywgXCJTZXRzIHRoZSBjb2xvcnMgYW5kIHN0eWxlcyBmb3IgZnVuY3Rpb25zIGRlY2xhcmF0aW9ucyBhbmQgcmVmZXJlbmNlcy5cIikpLFxuXHRcdHZhcmlhYmxlczogdG9rZW5Hcm91cFNldHRpbmdzKG5scy5sb2NhbGl6ZSgnZWRpdG9yQ29sb3JzLnZhcmlhYmxlcycsIFwiU2V0cyB0aGUgY29sb3JzIGFuZCBzdHlsZXMgZm9yIHZhcmlhYmxlcyBkZWNsYXJhdGlvbnMgYW5kIHJlZmVyZW5jZXMuXCIpKSxcblx0XHR0ZXh0TWF0ZVJ1bGVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3JDb2xvcnMudGV4dE1hdGVSdWxlcycsICdTZXRzIGNvbG9ycyBhbmQgc3R5bGVzIHVzaW5nIHRleHRtYXRlIHRoZW1pbmcgcnVsZXMgKGFkdmFuY2VkKS4nKSxcblx0XHRcdCRyZWY6IHRleHRtYXRlQ29sb3JzU2NoZW1hSWRcblx0XHR9LFxuXHRcdHNlbWFudGljSGlnaGxpZ2h0aW5nOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3JDb2xvcnMuc2VtYW50aWNIaWdobGlnaHRpbmcnLCAnV2hldGhlciBzZW1hbnRpYyBoaWdobGlnaHRpbmcgc2hvdWxkIGJlIGVuYWJsZWQgZm9yIHRoaXMgdGhlbWUuJyksXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZWRpdG9yQ29sb3JzLnNlbWFudGljSGlnaGxpZ2h0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZScsICdVc2UgYGVuYWJsZWRgIGluIGBlZGl0b3Iuc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnNgIHNldHRpbmcgaW5zdGVhZC4nKSxcblx0XHRcdG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoeyBrZXk6ICdlZGl0b3JDb2xvcnMuc2VtYW50aWNIaWdobGlnaHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlTWFya2Rvd24nLCBjb21tZW50OiBbJ3swfSB3aWxsIGJlY29tZSBhIGxpbmsgdG8gYW5vdGhlciBzZXR0aW5nLiddIH0sICdVc2UgYGVuYWJsZWRgIGluIHswfSBzZXR0aW5nIGluc3RlYWQuJywgZm9ybWF0U2V0dGluZ0FzTGluaygnZWRpdG9yLnNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zJykpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0fVxuXHR9LFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcbn07XG5cbmNvbnN0IHRva2VuQ29sb3JDdXN0b21pemF0aW9uU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3JDb2xvcnMnLCBcIk92ZXJyaWRlcyBlZGl0b3Igc3ludGF4IGNvbG9ycyBhbmQgZm9udCBzdHlsZSBmcm9tIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgY29sb3IgdGhlbWUuXCIpLFxuXHRkZWZhdWx0OiB7fSxcblx0YWxsT2Y6IFt7IC4uLnRva2VuQ29sb3JTY2hlbWEsIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7ICdeXFxcXFsnOiB7fSB9IH1dXG59O1xuXG5jb25zdCBzZW1hbnRpY1Rva2VuQ29sb3JTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdGVuYWJsZWQ6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvckNvbG9ycy5zZW1hbnRpY0hpZ2hsaWdodGluZy5lbmFibGVkJywgJ1doZXRoZXIgc2VtYW50aWMgaGlnaGxpZ2h0aW5nIGlzIGVuYWJsZWQgb3IgZGlzYWJsZWQgZm9yIHRoaXMgdGhlbWUnKSxcblx0XHRcdHN1Z2dlc3RTb3J0VGV4dDogJzBfZW5hYmxlZCdcblx0XHR9LFxuXHRcdHJ1bGVzOiB7XG5cdFx0XHQkcmVmOiB0b2tlblN0eWxpbmdTY2hlbWFJZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvckNvbG9ycy5zZW1hbnRpY0hpZ2hsaWdodGluZy5ydWxlcycsICdTZW1hbnRpYyB0b2tlbiBzdHlsaW5nIHJ1bGVzIGZvciB0aGlzIHRoZW1lLicpLFxuXHRcdFx0c3VnZ2VzdFNvcnRUZXh0OiAnMF9ydWxlcydcblx0XHR9XG5cdH0sXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxufTtcblxuY29uc3Qgc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvblNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VtYW50aWNUb2tlbkNvbG9ycycsIFwiT3ZlcnJpZGVzIGVkaXRvciBzZW1hbnRpYyB0b2tlbiBjb2xvciBhbmQgc3R5bGVzIGZyb20gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBjb2xvciB0aGVtZS5cIiksXG5cdGRlZmF1bHQ6IHt9LFxuXHRhbGxPZjogW3sgLi4uc2VtYW50aWNUb2tlbkNvbG9yU2NoZW1hLCBwYXR0ZXJuUHJvcGVydGllczogeyAnXlxcXFxbJzoge30gfSB9XVxufTtcblxuY29uc3QgdG9rZW5Db2xvckN1c3RvbWl6YXRpb25Db25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdGlkOiAnZWRpdG9yJyxcblx0b3JkZXI6IDcuMixcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbVGhlbWVTZXR0aW5ncy5UT0tFTl9DT0xPUl9DVVNUT01JWkFUSU9OU106IHRva2VuQ29sb3JDdXN0b21pemF0aW9uU2NoZW1hLFxuXHRcdFtUaGVtZVNldHRpbmdzLlNFTUFOVElDX1RPS0VOX0NPTE9SX0NVU1RPTUlaQVRJT05TXTogc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvblNjaGVtYVxuXHR9XG59O1xuXG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHRva2VuQ29sb3JDdXN0b21pemF0aW9uQ29uZmlndXJhdGlvbik7XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVDb2xvclRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXModGhlbWVzOiBJV29ya2JlbmNoQ29sb3JUaGVtZVtdKSB7XG5cdC8vIHVwZGF0ZXMgZW51bSBmb3IgdGhlICd3b3JrYmVuY2guY29sb3JUaGVtZWAgc2V0dGluZ1xuXHR0aGVtZXMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblx0Y29sb3JUaGVtZVNldHRpbmdFbnVtLnNwbGljZSgwLCBjb2xvclRoZW1lU2V0dGluZ0VudW0ubGVuZ3RoLCAuLi50aGVtZXMubWFwKHQgPT4gdC5zZXR0aW5nc0lkKSk7XG5cdGNvbG9yVGhlbWVTZXR0aW5nRW51bURlc2NyaXB0aW9ucy5zcGxpY2UoMCwgY29sb3JUaGVtZVNldHRpbmdFbnVtRGVzY3JpcHRpb25zLmxlbmd0aCwgLi4udGhlbWVzLm1hcCh0ID0+IHQuZGVzY3JpcHRpb24gfHwgJycpKTtcblx0Y29sb3JUaGVtZVNldHRpbmdFbnVtSXRlbUxhYmVscy5zcGxpY2UoMCwgY29sb3JUaGVtZVNldHRpbmdFbnVtSXRlbUxhYmVscy5sZW5ndGgsIC4uLnRoZW1lcy5tYXAodCA9PiB0LmxhYmVsIHx8ICcnKSk7XG5cblx0Y29uc3QgdGhlbWVTcGVjaWZpY1dvcmtiZW5jaENvbG9yczogSUpTT05TY2hlbWEgPSB7IHByb3BlcnRpZXM6IHt9IH07XG5cdGNvbnN0IHRoZW1lU3BlY2lmaWNUb2tlbkNvbG9yczogSUpTT05TY2hlbWEgPSB7IHByb3BlcnRpZXM6IHt9IH07XG5cdGNvbnN0IHRoZW1lU3BlY2lmaWNTZW1hbnRpY1Rva2VuQ29sb3JzOiBJSlNPTlNjaGVtYSA9IHsgcHJvcGVydGllczoge30gfTtcblxuXHRjb25zdCB3b3JrYmVuY2hDb2xvcnMgPSB7ICRyZWY6IHdvcmtiZW5jaENvbG9yc1NjaGVtYUlkLCBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UgfTtcblx0Y29uc3QgdG9rZW5Db2xvcnMgPSB7IHByb3BlcnRpZXM6IHRva2VuQ29sb3JTY2hlbWEucHJvcGVydGllcywgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlIH07XG5cdGZvciAoY29uc3QgdCBvZiB0aGVtZXMpIHtcblx0XHQvLyBhZGQgdGhlbWUgc3BlY2lmaWMgY29sb3IgY3VzdG9taXphdGlvbiAoXCJbQWJ5c3NdXCI6eyAuLi4gfSlcblx0XHRjb25zdCB0aGVtZUlkID0gYFske3Quc2V0dGluZ3NJZH1dYDtcblx0XHR0aGVtZVNwZWNpZmljV29ya2JlbmNoQ29sb3JzLnByb3BlcnRpZXMhW3RoZW1lSWRdID0gd29ya2JlbmNoQ29sb3JzO1xuXHRcdHRoZW1lU3BlY2lmaWNUb2tlbkNvbG9ycy5wcm9wZXJ0aWVzIVt0aGVtZUlkXSA9IHRva2VuQ29sb3JzO1xuXHRcdHRoZW1lU3BlY2lmaWNTZW1hbnRpY1Rva2VuQ29sb3JzLnByb3BlcnRpZXMhW3RoZW1lSWRdID0gc2VtYW50aWNUb2tlbkNvbG9yU2NoZW1hO1xuXHR9XG5cdHRoZW1lU3BlY2lmaWNXb3JrYmVuY2hDb2xvcnMucGF0dGVyblByb3BlcnRpZXMgPSB7IFt0aGVtZVNwZWNpZmljU2V0dGluZ0tleV06IHdvcmtiZW5jaENvbG9ycyB9O1xuXHR0aGVtZVNwZWNpZmljVG9rZW5Db2xvcnMucGF0dGVyblByb3BlcnRpZXMgPSB7IFt0aGVtZVNwZWNpZmljU2V0dGluZ0tleV06IHRva2VuQ29sb3JzIH07XG5cdHRoZW1lU3BlY2lmaWNTZW1hbnRpY1Rva2VuQ29sb3JzLnBhdHRlcm5Qcm9wZXJ0aWVzID0geyBbdGhlbWVTcGVjaWZpY1NldHRpbmdLZXldOiBzZW1hbnRpY1Rva2VuQ29sb3JTY2hlbWEgfTtcblxuXHRjb2xvckN1c3RvbWl6YXRpb25zU2NoZW1hLmFsbE9mIVsxXSA9IHRoZW1lU3BlY2lmaWNXb3JrYmVuY2hDb2xvcnM7XG5cdHRva2VuQ29sb3JDdXN0b21pemF0aW9uU2NoZW1hLmFsbE9mIVsxXSA9IHRoZW1lU3BlY2lmaWNUb2tlbkNvbG9ycztcblx0c2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvblNjaGVtYS5hbGxPZiFbMV0gPSB0aGVtZVNwZWNpZmljU2VtYW50aWNUb2tlbkNvbG9ycztcblxuXHRjb25maWd1cmF0aW9uUmVnaXN0cnkubm90aWZ5Q29uZmlndXJhdGlvblNjaGVtYVVwZGF0ZWQodGhlbWVTZXR0aW5nc0NvbmZpZ3VyYXRpb24sIHRva2VuQ29sb3JDdXN0b21pemF0aW9uQ29uZmlndXJhdGlvbik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVGaWxlSWNvblRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXModGhlbWVzOiBJV29ya2JlbmNoRmlsZUljb25UaGVtZVtdKSB7XG5cdGZpbGVJY29uVGhlbWVTZXR0aW5nU2NoZW1hLmVudW0hLnNwbGljZSgxLCBOdW1iZXIuTUFYX1ZBTFVFLCAuLi50aGVtZXMubWFwKHQgPT4gdC5zZXR0aW5nc0lkKSk7XG5cdGZpbGVJY29uVGhlbWVTZXR0aW5nU2NoZW1hLmVudW1JdGVtTGFiZWxzIS5zcGxpY2UoMSwgTnVtYmVyLk1BWF9WQUxVRSwgLi4udGhlbWVzLm1hcCh0ID0+IHQubGFiZWwpKTtcblx0ZmlsZUljb25UaGVtZVNldHRpbmdTY2hlbWEuZW51bURlc2NyaXB0aW9ucyEuc3BsaWNlKDEsIE51bWJlci5NQVhfVkFMVUUsIC4uLnRoZW1lcy5tYXAodCA9PiB0LmRlc2NyaXB0aW9uIHx8ICcnKSk7XG5cblx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5Lm5vdGlmeUNvbmZpZ3VyYXRpb25TY2hlbWFVcGRhdGVkKHRoZW1lU2V0dGluZ3NDb25maWd1cmF0aW9uKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVByb2R1Y3RJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyh0aGVtZXM6IElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lW10pIHtcblx0cHJvZHVjdEljb25UaGVtZVNldHRpbmdTY2hlbWEuZW51bSEuc3BsaWNlKDEsIE51bWJlci5NQVhfVkFMVUUsIC4uLnRoZW1lcy5tYXAodCA9PiB0LnNldHRpbmdzSWQpKTtcblx0cHJvZHVjdEljb25UaGVtZVNldHRpbmdTY2hlbWEuZW51bUl0ZW1MYWJlbHMhLnNwbGljZSgxLCBOdW1iZXIuTUFYX1ZBTFVFLCAuLi50aGVtZXMubWFwKHQgPT4gdC5sYWJlbCkpO1xuXHRwcm9kdWN0SWNvblRoZW1lU2V0dGluZ1NjaGVtYS5lbnVtRGVzY3JpcHRpb25zIS5zcGxpY2UoMSwgTnVtYmVyLk1BWF9WQUxVRSwgLi4udGhlbWVzLm1hcCh0ID0+IHQuZGVzY3JpcHRpb24gfHwgJycpKTtcblxuXHRjb25maWd1cmF0aW9uUmVnaXN0cnkubm90aWZ5Q29uZmlndXJhdGlvblNjaGVtYVVwZGF0ZWQodGhlbWVTZXR0aW5nc0NvbmZpZ3VyYXRpb24pO1xufVxuXG5jb25zdCBjb2xvclNjaGVtZVRvUHJlZmVycmVkID0ge1xuXHRbQ29sb3JTY2hlbWUuREFSS106IFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0RBUktfVEhFTUUsXG5cdFtDb2xvclNjaGVtZS5MSUdIVF06IFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0xJR0hUX1RIRU1FLFxuXHRbQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLXTogVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfSENfREFSS19USEVNRSxcblx0W0NvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFRdOiBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRVxufTtcblxuZXhwb3J0IGNsYXNzIFRoZW1lQ29uZmlndXJhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgcHJpdmF0ZSBob3N0Q29sb3JTZXJ2aWNlOiBJSG9zdENvbG9yU2NoZW1lU2VydmljZSkge1xuXHR9XG5cblx0cHVibGljIGdldCBjb2xvclRoZW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPih0aGlzLmdldENvbG9yVGhlbWVTZXR0aW5nSWQoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGZpbGVJY29uVGhlbWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgbnVsbD4oVGhlbWVTZXR0aW5ncy5GSUxFX0lDT05fVEhFTUUpO1xuXHR9XG5cblx0cHVibGljIGdldCBwcm9kdWN0SWNvblRoZW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihUaGVtZVNldHRpbmdzLlBST0RVQ1RfSUNPTl9USEVNRSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbG9yQ3VzdG9taXphdGlvbnMoKTogSUNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElDb2xvckN1c3RvbWl6YXRpb25zPihUaGVtZVNldHRpbmdzLkNPTE9SX0NVU1RPTUlaQVRJT05TKSB8fCB7fTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKCk6IElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRcdGNvbnN0IHRva2VuQ29sb3JDdXN0b21pemF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zPihUaGVtZVNldHRpbmdzLlRPS0VOX0NPTE9SX0NVU1RPTUlaQVRJT05TKSB8fCB7fTtcblx0XHRjb25zdCB0ZXh0TWF0ZVJ1bGVzID0gdG9rZW5Db2xvckN1c3RvbWl6YXRpb24udGV4dE1hdGVSdWxlcztcblx0XHRpZiAoIXRleHRNYXRlUnVsZXMpIHtcblx0XHRcdHJldHVybiB0b2tlbkNvbG9yQ3VzdG9taXphdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgdXBkYXRlZFJ1bGVzID0gdGV4dE1hdGVSdWxlcy5tYXAocnVsZSA9PiB7XG5cdFx0XHRjb25zdCBmb250U2l6ZSA9IHJ1bGUuc2V0dGluZ3M/LmZvbnRTaXplO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHJ1bGUuc2V0dGluZ3M/LmxpbmVIZWlnaHQ7XG5cdFx0XHRpZiAoZm9udFNpemUgIT09IHVuZGVmaW5lZCAmJiBsaW5lSGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5ydWxlLFxuXHRcdFx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0XHQuLi5ydWxlLnNldHRpbmdzLFxuXHRcdFx0XHRcdFx0bGluZUhlaWdodDogZm9udFNpemVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcnVsZTtcblx0XHR9KTtcblx0XHRjb25zdCB1cGRhdGVkVG9rZW5Db2xvckN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi50b2tlbkNvbG9yQ3VzdG9taXphdGlvbixcblx0XHRcdHRleHRNYXRlUnVsZXM6IHVwZGF0ZWRSdWxlc1xuXHRcdH07XG5cdFx0cmV0dXJuIHVwZGF0ZWRUb2tlbkNvbG9yQ3VzdG9taXphdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMoKTogSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnM+KFRoZW1lU2V0dGluZ3MuU0VNQU5USUNfVE9LRU5fQ09MT1JfQ1VTVE9NSVpBVElPTlMpO1xuXHR9XG5cblx0cHVibGljIGdldFByZWZlcnJlZENvbG9yU2NoZW1lKCk6IENvbG9yU2NoZW1lIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUaGVtZVNldHRpbmdzLkRFVEVDVF9IQykgJiYgdGhpcy5ob3N0Q29sb3JTZXJ2aWNlLmhpZ2hDb250cmFzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaG9zdENvbG9yU2VydmljZS5kYXJrID8gQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLIDogQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9MSUdIVDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNEZXRlY3RpbmdDb2xvclNjaGVtZSgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ob3N0Q29sb3JTZXJ2aWNlLmRhcmsgPyBDb2xvclNjaGVtZS5EQVJLIDogQ29sb3JTY2hlbWUuTElHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgaXNEZXRlY3RpbmdIaWdoQ29udHJhc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGhlbWVTZXR0aW5ncy5ERVRFQ1RfSEMpO1xuXHR9XG5cblx0cHVibGljIGlzRGV0ZWN0aW5nQ29sb3JTY2hlbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGhlbWVTZXR0aW5ncy5ERVRFQ1RfQ09MT1JfU0NIRU1FKTtcblx0fVxuXG5cdHB1YmxpYyBpc1ByZWZlcnJlZENvbG9yU2NoZW1lQ2hhbmdlKHByZXZpb3VzOiBJQ29sb3JTY2hlbWUpOiBib29sZWFuIHtcblx0XHRjb25zdCBkYXJrQ2hhbmdlZCA9IHByZXZpb3VzLmRhcmsgIT09IHRoaXMuaG9zdENvbG9yU2VydmljZS5kYXJrO1xuXHRcdGlmICh0aGlzLmlzRGV0ZWN0aW5nQ29sb3JTY2hlbWUoKSAmJiBkYXJrQ2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzRGV0ZWN0aW5nSGlnaENvbnRyYXN0KCkpIHtcblx0XHRcdHJldHVybiBwcmV2aW91cy5oaWdoQ29udHJhc3QgIT09IHRoaXMuaG9zdENvbG9yU2VydmljZS5oaWdoQ29udHJhc3QgfHwgKHRoaXMuaG9zdENvbG9yU2VydmljZS5oaWdoQ29udHJhc3QgJiYgZGFya0NoYW5nZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sb3JUaGVtZVNldHRpbmdJZCgpOiBUaGVtZVNldHRpbmdzIHtcblx0XHRjb25zdCBwcmVmZXJyZWRTY2hlbWUgPSB0aGlzLmdldFByZWZlcnJlZENvbG9yU2NoZW1lKCk7XG5cdFx0cmV0dXJuIHByZWZlcnJlZFNjaGVtZSA/IGNvbG9yU2NoZW1lVG9QcmVmZXJyZWRbcHJlZmVycmVkU2NoZW1lXSA6IFRoZW1lU2V0dGluZ3MuQ09MT1JfVEhFTUU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0Q29sb3JUaGVtZSh0aGVtZTogSVdvcmtiZW5jaENvbG9yVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hDb2xvclRoZW1lPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUNvbmZpZ3VyYXRpb24odGhpcy5nZXRDb2xvclRoZW1lU2V0dGluZ0lkKCksIHRoZW1lLnNldHRpbmdzSWQsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHRyZXR1cm4gdGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0RmlsZUljb25UaGVtZSh0aGVtZTogSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUNvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5GSUxFX0lDT05fVEhFTUUsIHRoZW1lLnNldHRpbmdzSWQsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHRyZXR1cm4gdGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0UHJvZHVjdEljb25UaGVtZSh0aGVtZTogSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUNvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5QUk9EVUNUX0lDT05fVEhFTUUsIHRoZW1lLnNldHRpbmdzSWQsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHRyZXR1cm4gdGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgaXNEZWZhdWx0Q29sb3JUaGVtZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCh0aGlzLmdldENvbG9yVGhlbWVTZXR0aW5nSWQoKSk7XG5cdFx0cmV0dXJuIHNldHRpbmdzICYmIHNldHRpbmdzLmRlZmF1bHQ/LnZhbHVlID09PSBzZXR0aW5ncy52YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kQXV0b0NvbmZpZ3VyYXRpb25UYXJnZXQoa2V5OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChrZXkpO1xuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoc2V0dGluZ3Mud29ya3NwYWNlRm9sZGVyVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXHRcdH0gZWxzZSBpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKHNldHRpbmdzLndvcmtzcGFjZVZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdH0gZWxzZSBpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKHNldHRpbmdzLnVzZXJSZW1vdGVWYWx1ZSkpIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZUNvbmZpZ3VyYXRpb24oa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNldHRpbmdzVGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgc2V0dGluZ3NUYXJnZXQgPT09ICdwcmV2aWV3Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSk7XG5cdFx0aWYgKHNldHRpbmdzVGFyZ2V0ID09PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmIChzZXR0aW5nc1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHNldHRpbmdzLnVzZXJWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IHNldHRpbmdzLmRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRpZiAodHlwZXMuaXNVbmRlZmluZWQoc2V0dGluZ3MudXNlclZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gbm90aGluZyB0byBkb1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZhbHVlID0gdW5kZWZpbmVkOyAvLyByZW1vdmUgY29uZmlndXJhdGlvbiBmcm9tIHVzZXIgc2V0dGluZ3Ncblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSB8fCBzZXR0aW5nc1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIHx8IHNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHNldHRpbmdzLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gbm90aGluZyB0byBkb1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCBzZXR0aW5nc1RhcmdldCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsY0FBYyx5QkFBMkUsMEJBQTBCO0FBR3BKLFNBQVMsd0JBQXdCLGtDQUFrQztBQUNuRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWtNLDRCQUE0QjtBQUN2TyxTQUFnQywyQkFBMkI7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBSzVCLE1BQU0sd0JBQXdCLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWE7QUFFdkcsTUFBTSx3QkFBa0MsQ0FBQztBQUN6QyxNQUFNLGtDQUE0QyxDQUFDO0FBQ25ELE1BQU0sb0NBQThDLENBQUM7QUFFOUMsU0FBUyxvQkFBb0IsS0FBYTtBQUNoRCxTQUFPLE1BQU0sR0FBRztBQUNqQjtBQUVPLE1BQU0seUNBQXlDO0FBRXRELE1BQU0sMEJBQXdEO0FBQUEsRUFDN0QsTUFBTTtBQUFBLEVBQ04scUJBQXFCLElBQUksU0FBUyxFQUFFLEtBQUssY0FBYyxTQUFTLENBQUMsNENBQTRDLEVBQUUsR0FBRyw0RUFBNEUsb0JB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
