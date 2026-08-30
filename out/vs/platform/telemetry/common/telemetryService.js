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
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { mixin } from "../../../base/common/objects.js";
import { isWeb } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import product from "../../product/common/product.js";
import { IProductService } from "../../product/common/productService.js";
import { Registry } from "../../registry/common/platform.js";
import { TelemetryConfiguration, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SECTION_ID, TELEMETRY_SETTING_ID } from "./telemetry.js";
import { cleanData, getTelemetryLevel, TelemetryTrustedValue } from "./telemetryUtils.js";
let TelemetryService = class {
  constructor(config, _configurationService, _productService) {
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._experimentProperties = {};
    this._pendingEvents = [];
    this._isExperimentPropertySet = false;
    this._disposables = new DisposableStore();
    this._cleanupPatterns = [];
    this._appenders = config.appenders;
    this._commonProperties = config.commonProperties ?? /* @__PURE__ */ Object.create(null);
    this.sessionId = this._commonProperties["sessionID"];
    this.machineId = this._commonProperties["common.machineId"];
    this.sqmId = this._commonProperties["common.sqmId"];
    this.devDeviceId = this._commonProperties["common.devDeviceId"];
    this.firstSessionDate = this._commonProperties["common.firstSessionDate"];
    this.msftInternal = this._commonProperties["common.msftInternal"];
    this._piiPaths = config.piiPaths || [];
    this._telemetryLevel = TelemetryLevel.USAGE;
    this._sendErrorTelemetry = !!config.sendErrorTelemetry;
    this._meteredConnectionService = config.meteredConnectionService;
    this._cleanupPatterns = [/(vscode-)?file:\/\/.*?\/resources\/app\//gi];
    for (const piiPath of this._piiPaths) {
      this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath), "gi"));
      if (piiPath.indexOf("\\") >= 0) {
        this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath.replace(/\\/g, "/")), "gi"));
      }
    }
    this._updateTelemetryLevel();
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      const affectsTelemetryConfig = e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID);
      if (affectsTelemetryConfig) {
        this._updateTelemetryLevel();
      }
    }));
    if (config.waitForExperimentProperties) {
      this._flushTimeout = setTimeout(() => this._flushPendingEvents(), TelemetryService.BUFFER_FLUSH_TIMEOUT);
    } else {
      this._isExperimentPropertySet = true;
    }
  }
  setExperimentProperty(name, value) {
    this._experimentProperties[name] = new TelemetryTrustedValue(value);
    if (!this._isExperimentPropertySet) {
      this._flushPendingEvents();
    }
  }
  setCommonProperty(name, value) {
    this._commonProperties[name] = value;
  }
  _flushPendingEvents() {
    if (this._isExperimentPropertySet) {
      return;
    }
    this._isExperimentPropertySet = true;
    if (this._flushTimeout !== void 0) {
      clearTimeout(this._flushTimeout);
      this._flushTimeout = void 0;
    }
    for (const event of this._pendingEvents) {
      this._doLog(event.eventName, event.eventLevel, event.data);
    }
    this._pendingEvents = [];
  }
  _updateTelemetryLevel() {
    let level = getTelemetryLevel(this._configurationService);
    const collectableTelemetry = this._productService.enabledTelemetryLevels;
    if (collectableTelemetry) {
      this._sendErrorTelemetry = this.sendErrorTelemetry ? collectableTelemetry.error : false;
      const maxCollectableTelemetryLevel = collectableTelemetry.usage ? TelemetryLevel.USAGE : collectableTelemetry.error ? TelemetryLevel.ERROR : TelemetryLevel.NONE;
      level = Math.min(level, maxCollectableTelemetryLevel);
    }
    this._telemetryLevel = level;
  }
  get sendErrorTelemetry() {
    return this._sendErrorTelemetry;
  }
  get telemetryLevel() {
    return this._telemetryLevel;
  }
  dispose() {
    this._flushPendingEvents();
    this._disposables.dispose();
  }
  _log(eventName, eventLevel, data) {
    if (this._telemetryLevel < eventLevel) {
      return;
    }
    if (this._meteredConnectionService?.isConnectionMetered) {
      return;
    }
    if (!this._isExperimentPropertySet) {
      if (this._pendingEvents.length < TelemetryService.MAX_BUFFER_SIZE) {
        this._pendingEvents.push({ eventName, eventLevel, data });
      }
      return;
    }
    this._doLog(eventName, eventLevel, data);
  }
  _doLog(eventName, eventLevel, data) {
    data = mixin(data, this._experimentProperties);
    data = cleanData(data, this._cleanupPatterns);
    data = mixin(data, this._commonProperties);
    if (eventLevel === TelemetryLevel.ERROR) {
      data = { ...data, "isError": true };
    }
    this._appenders.forEach((a) => a.log(eventName, data ?? {}));
  }
  publicLog(eventName, data) {
    this._log(eventName, TelemetryLevel.USAGE, data);
  }
  publicLog2(eventName, data) {
    this.publicLog(eventName, data);
  }
  publicLogError(errorEventName, data) {
    if (!this._sendErrorTelemetry) {
      return;
    }
    this._log(errorEventName, TelemetryLevel.ERROR, data);
  }
  publicLogError2(eventName, data) {
    this.publicLogError(eventName, data);
  }
};
TelemetryService.IDLE_START_EVENT_NAME = "UserIdleStart";
TelemetryService.IDLE_STOP_EVENT_NAME = "UserIdleStop";
TelemetryService.BUFFER_FLUSH_TIMEOUT = 1e4;
// 10 seconds
TelemetryService.MAX_BUFFER_SIZE = 1e3;
TelemetryService = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IProductService)
], TelemetryService);
function getTelemetryLevelSettingDescription() {
  const telemetryText = localize("telemetry.telemetryLevelMd", "Controls {0} telemetry, first-party extension telemetry, and participating third-party extension telemetry. Some third party extensions might not respect this setting. Consult the specific extension's documentation to be sure. Telemetry helps us better understand how {0} is performing, where improvements need to be made, and how features are being used.", product.nameLong);
  const externalLinksStatement = !product.privacyStatementUrl ? localize("telemetry.docsStatement", "Read more about the [data we collect]({0}).", "https://aka.ms/vscode-telemetry") : localize("telemetry.docsAndPrivacyStatement", "Read more about the [data we collect]({0}) and our [privacy statement]({1}).", "https://aka.ms/vscode-telemetry", product.privacyStatementUrl);
  const restartString = !isWeb ? localize("telemetry.restart", "A full restart of the application is necessary for crash reporting changes to take effect.") : "";
  const crashReportsHeader = localize("telemetry.crashReports", "Crash Reports");
  const errorsHeader = localize("telemetry.errors", "Error Telemetry");
  const usageHeader = localize("telemetry.usage", "Usage Data");
  const telemetryTableDescription = localize("telemetry.telemetryLevel.tableDescription", "The following table outlines the data sent with each setting:");
  const telemetryTable = `
|       | ${crashReportsHeader} | ${errorsHeader} | ${usageHeader} |
|:------|:-------------:|:---------------:|:----------:|
| all   |       \u2713       |        \u2713        |     \u2713      |
| error |       \u2713       |        \u2713        |     -      |
| crash |       \u2713       |        -        |     -      |
| off   |       -       |        -        |     -      |
`;
  const deprecatedSettingNote = localize("telemetry.telemetryLevel.deprecated", "****Note:*** If this setting is 'off', no telemetry will be sent regardless of other telemetry settings. If this setting is set to anything except 'off' and telemetry is disabled with deprecated settings, no telemetry will be sent.*");
  const telemetryDescription = `
${telemetryText} ${externalLinksStatement} ${restartString}

&nbsp;

${telemetryTableDescription}
${telemetryTable}

&nbsp;

${deprecatedSettingNote}
`;
  return telemetryDescription;
}
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  "id": TELEMETRY_SECTION_ID,
  "order": 1,
  "type": "object",
  "title": localize("telemetryConfigurationTitle", "Telemetry"),
  "properties": {
    [TELEMETRY_SETTING_ID]: {
      "type": "string",
      "enum": [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
      "enumDescriptions": [
        localize("telemetry.telemetryLevel.default", "Sends usage data, errors, and crash reports."),
        localize("telemetry.telemetryLevel.error", "Sends general error telemetry and crash reports."),
        localize("telemetry.telemetryLevel.crash", "Sends OS level crash reports."),
        localize("telemetry.telemetryLevel.off", "Disables all product telemetry.")
      ],
      "markdownDescription": getTelemetryLevelSettingDescription(),
      "default": TelemetryConfiguration.ON,
      "restricted": true,
      "scope": ConfigurationScope.APPLICATION,
      "tags": ["usesOnlineServices", "telemetry"],
      "policy": {
        name: "TelemetryLevel",
        category: PolicyCategory.Telemetry,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "telemetry.telemetryLevel.policyDescription",
            value: localize("telemetry.telemetryLevel.policyDescription", "Controls the level of telemetry.")
          },
          enumDescriptions: [
            {
              key: "telemetry.telemetryLevel.default",
              value: localize("telemetry.telemetryLevel.default", "Sends usage data, errors, and crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.error",
              value: localize("telemetry.telemetryLevel.error", "Sends general error telemetry and crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.crash",
              value: localize("telemetry.telemetryLevel.crash", "Sends OS level crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.off",
              value: localize("telemetry.telemetryLevel.off", "Disables all product telemetry.")
            }
          ]
        }
      }
    },
    "telemetry.feedback.enabled": {
      type: "boolean",
      default: true,
      description: localize("telemetry.feedback.enabled", "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options."),
      policy: {
        name: "EnableFeedback",
        category: PolicyCategory.Telemetry,
        minimumVersion: "1.99",
        localization: { description: { key: "telemetry.feedback.enabled", value: localize("telemetry.feedback.enabled", "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options.") } }
      }
    },
    // Deprecated telemetry setting
    [TELEMETRY_OLD_SETTING_ID]: {
      "type": "boolean",
      "markdownDescription": !product.privacyStatementUrl ? localize("telemetry.enableTelemetry", "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) : localize("telemetry.enableTelemetryMd", "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl),
      "default": true,
      "restricted": true,
      "markdownDeprecationMessage": localize("enableTelemetryDeprecated", "If this setting is false, no telemetry will be sent regardless of the new setting's value. Deprecated in favor of the {0} setting.", `\`#${TELEMETRY_SETTING_ID}#\``),
      "scope": ConfigurationScope.APPLICATION,
      "tags": ["usesOnlineServices", "telemetry"]
    }
  }
});
export {
  TelemetryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFxjb21tb25cXHRlbGVtZXRyeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWl4aW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENsYXNzaWZpZWRFdmVudCwgSUdEUFJQcm9wZXJ0eSwgT21pdE1ldGFkYXRhLCBTdHJpY3RQcm9wZXJ0eUNoZWNrIH0gZnJvbSAnLi9nZHByVHlwaW5ncy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5RGF0YSwgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24sIFRlbGVtZXRyeUxldmVsLCBURUxFTUVUUllfQ1JBU0hfUkVQT1JURVJfU0VUVElOR19JRCwgVEVMRU1FVFJZX09MRF9TRVRUSU5HX0lELCBURUxFTUVUUllfU0VDVElPTl9JRCwgVEVMRU1FVFJZX1NFVFRJTkdfSUQsIElDb21tb25Qcm9wZXJ0aWVzIH0gZnJvbSAnLi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgY2xlYW5EYXRhLCBnZXRUZWxlbWV0cnlMZXZlbCwgSVRlbGVtZXRyeUFwcGVuZGVyLCBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuL3RlbGVtZXRyeVV0aWxzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVsZW1ldHJ5U2VydmljZUNvbmZpZyB7XG5cdGFwcGVuZGVyczogSVRlbGVtZXRyeUFwcGVuZGVyW107XG5cdHNlbmRFcnJvclRlbGVtZXRyeT86IGJvb2xlYW47XG5cdGNvbW1vblByb3BlcnRpZXM/OiBJQ29tbW9uUHJvcGVydGllcztcblx0cGlpUGF0aHM/OiBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIElmIHRydWUsIHRlbGVtZXRyeSBldmVudHMgd2lsbCBiZSBidWZmZXJlZCB1bnRpbCBzZXRFeHBlcmltZW50UHJvcGVydHkgaXMgY2FsbGVkXG5cdCAqICh1cCB0byAxMCBzZWNvbmRzKSB0byBlbnN1cmUgZXhwZXJpbWVudCBjb250ZXh0IGlzIGF0dGFjaGVkIHRvIGFsbCBldmVudHMuXG5cdCAqL1xuXHR3YWl0Rm9yRXhwZXJpbWVudFByb3BlcnRpZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIHRlbGVtZXRyeSBldmVudHMgd2lsbCBiZSBkcm9wcGVkIHdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgbWV0ZXJlZC5cblx0ICovXG5cdG1ldGVyZWRDb25uZWN0aW9uU2VydmljZT86IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U7XG59XG5cbmludGVyZmFjZSBJUGVuZGluZ0V2ZW50IHtcblx0ZXZlbnROYW1lOiBzdHJpbmc7XG5cdGV2ZW50TGV2ZWw6IFRlbGVtZXRyeUxldmVsO1xuXHRkYXRhOiBJVGVsZW1ldHJ5RGF0YSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFRlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElETEVfU1RBUlRfRVZFTlRfTkFNRSA9ICdVc2VySWRsZVN0YXJ0Jztcblx0c3RhdGljIHJlYWRvbmx5IElETEVfU1RPUF9FVkVOVF9OQU1FID0gJ1VzZXJJZGxlU3RvcCc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQlVGRkVSX0ZMVVNIX1RJTUVPVVQgPSAxMDAwMDsgLy8gMTAgc2Vjb25kc1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQlVGRkVSX1NJWkUgPSAxMDAwO1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBtYWNoaW5lSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc3FtSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSBtc2Z0SW50ZXJuYWw6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfYXBwZW5kZXJzOiBJVGVsZW1ldHJ5QXBwZW5kZXJbXTtcblx0cHJpdmF0ZSBfY29tbW9uUHJvcGVydGllczogSUNvbW1vblByb3BlcnRpZXM7XG5cdHByaXZhdGUgX2V4cGVyaW1lbnRQcm9wZXJ0aWVzOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfCBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPiB9ID0ge307XG5cdHByaXZhdGUgX3BpaVBhdGhzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBfdGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsO1xuXHRwcml2YXRlIF9zZW5kRXJyb3JUZWxlbWV0cnk6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlOiBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3BlbmRpbmdFdmVudHM6IElQZW5kaW5nRXZlbnRbXSA9IFtdO1xuXHRwcml2YXRlIF9pc0V4cGVyaW1lbnRQcm9wZXJ0eVNldCA9IGZhbHNlO1xuXHRwcml2YXRlIF9mbHVzaFRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9jbGVhbnVwUGF0dGVybnM6IFJlZ0V4cFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29uZmlnOiBJVGVsZW1ldHJ5U2VydmljZUNvbmZpZyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2FwcGVuZGVycyA9IGNvbmZpZy5hcHBlbmRlcnM7XG5cdFx0dGhpcy5fY29tbW9uUHJvcGVydGllcyA9IGNvbmZpZy5jb21tb25Qcm9wZXJ0aWVzID8/IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHR0aGlzLnNlc3Npb25JZCA9IHRoaXMuX2NvbW1vblByb3BlcnRpZXNbJ3Nlc3Npb25JRCddIGFzIHN0cmluZztcblx0XHR0aGlzLm1hY2hpbmVJZCA9IHRoaXMuX2NvbW1vblByb3BlcnRpZXNbJ2NvbW1vbi5tYWNoaW5lSWQnXSBhcyBzdHJpbmc7XG5cdFx0dGhpcy5zcW1JZCA9IHRoaXMuX2NvbW1vblByb3BlcnRpZXNbJ2NvbW1vbi5zcW1JZCddIGFzIHN0cmluZztcblx0XHR0aGlzLmRldkRldmljZUlkID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snY29tbW9uLmRldkRldmljZUlkJ10gYXMgc3RyaW5nO1xuXHRcdHRoaXMuZmlyc3RTZXNzaW9uRGF0ZSA9IHRoaXMuX2NvbW1vblByb3BlcnRpZXNbJ2NvbW1vbi5maXJzdFNlc3Npb25EYXRlJ10gYXMgc3RyaW5nO1xuXHRcdHRoaXMubXNmdEludGVybmFsID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snY29tbW9uLm1zZnRJbnRlcm5hbCddIGFzIGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9waWlQYXRocyA9IGNvbmZpZy5waWlQYXRocyB8fCBbXTtcblx0XHR0aGlzLl90ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRcdHRoaXMuX3NlbmRFcnJvclRlbGVtZXRyeSA9ICEhY29uZmlnLnNlbmRFcnJvclRlbGVtZXRyeTtcblx0XHR0aGlzLl9tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgPSBjb25maWcubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlO1xuXG5cdFx0Ly8gc3RhdGljIGNsZWFudXAgcGF0dGVybiBmb3I6IGB2c2NvZGUtZmlsZTovLy9EQU5HRVJPVVMvUEFUSC9yZXNvdXJjZXMvYXBwL1VzZWZ1bC9JbmZvcm1hdGlvbmBcblx0XHR0aGlzLl9jbGVhbnVwUGF0dGVybnMgPSBbLyh2c2NvZGUtKT9maWxlOlxcL1xcLy4qP1xcL3Jlc291cmNlc1xcL2FwcFxcLy9naV07XG5cblx0XHRmb3IgKGNvbnN0IHBpaVBhdGggb2YgdGhpcy5fcGlpUGF0aHMpIHtcblx0XHRcdHRoaXMuX2NsZWFudXBQYXR0ZXJucy5wdXNoKG5ldyBSZWdFeHAoZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwaWlQYXRoKSwgJ2dpJykpO1xuXG5cdFx0XHRpZiAocGlpUGF0aC5pbmRleE9mKCdcXFxcJykgPj0gMCkge1xuXHRcdFx0XHR0aGlzLl9jbGVhbnVwUGF0dGVybnMucHVzaChuZXcgUmVnRXhwKGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMocGlpUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJykpLCAnZ2knKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0Ly8gQ2hlY2sgb24gdGhlIHRlbGVtZXRyeSBzZXR0aW5ncyBhbmQgdXBkYXRlIHRoZSBzdGF0ZSBpZiBjaGFuZ2VkXG5cdFx0XHRjb25zdCBhZmZlY3RzVGVsZW1ldHJ5Q29uZmlnID1cblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURUxFTUVUUllfU0VUVElOR19JRClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURUxFTUVUUllfT0xEX1NFVFRJTkdfSUQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVEVMRU1FVFJZX0NSQVNIX1JFUE9SVEVSX1NFVFRJTkdfSUQpO1xuXHRcdFx0aWYgKGFmZmVjdHNUZWxlbWV0cnlDb25maWcpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBCdWZmZXIgZXZlbnRzIHVudGlsIGV4cGVyaW1lbnQgcHJvcGVydGllcyBhcmUgc2V0IChvciB0aW1lb3V0IGV4cGlyZXMpLlxuXHRcdC8vIFRoaXMgZW5zdXJlcyBlYXJseSBldmVudHMgaW5jbHVkZSBleHBlcmltZW50IGNvbnRleHQgd2hlbiBhdmFpbGFibGUuXG5cdFx0aWYgKGNvbmZpZy53YWl0Rm9yRXhwZXJpbWVudFByb3BlcnRpZXMpIHtcblx0XHRcdHRoaXMuX2ZsdXNoVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fZmx1c2hQZW5kaW5nRXZlbnRzKCksIFRlbGVtZXRyeVNlcnZpY2UuQlVGRkVSX0ZMVVNIX1RJTUVPVVQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pc0V4cGVyaW1lbnRQcm9wZXJ0eVNldCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2V4cGVyaW1lbnRQcm9wZXJ0aWVzW25hbWVdID0gbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSh2YWx1ZSk7XG5cblx0XHQvLyBPbiBmaXJzdCBjYWxsLCBmbHVzaCBhbGwgcGVuZGluZyBldmVudHMgdGhhdCB3ZXJlIGJ1ZmZlcmVkIHdhaXRpbmcgZm9yIGV4cGVyaW1lbnQgcHJvcGVydGllc1xuXHRcdGlmICghdGhpcy5faXNFeHBlcmltZW50UHJvcGVydHlTZXQpIHtcblx0XHRcdHRoaXMuX2ZsdXNoUGVuZGluZ0V2ZW50cygpO1xuXHRcdH1cblx0fVxuXG5cdHNldENvbW1vblByb3BlcnR5KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tb25Qcm9wZXJ0aWVzW25hbWVdID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9mbHVzaFBlbmRpbmdFdmVudHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRXhwZXJpbWVudFByb3BlcnR5U2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNFeHBlcmltZW50UHJvcGVydHlTZXQgPSB0cnVlO1xuXG5cdFx0aWYgKHRoaXMuX2ZsdXNoVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZmx1c2hUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2ZsdXNoVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTZW5kIGFsbCBidWZmZXJlZCBldmVudHMgbm93IHRoYXQgZXhwZXJpbWVudCBwcm9wZXJ0aWVzIGFyZSBhdmFpbGFibGVcblx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIHRoaXMuX3BlbmRpbmdFdmVudHMpIHtcblx0XHRcdHRoaXMuX2RvTG9nKGV2ZW50LmV2ZW50TmFtZSwgZXZlbnQuZXZlbnRMZXZlbCwgZXZlbnQuZGF0YSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdFdmVudHMgPSBbXTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRlbGVtZXRyeUxldmVsKCk6IHZvaWQge1xuXHRcdGxldCBsZXZlbCA9IGdldFRlbGVtZXRyeUxldmVsKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb2xsZWN0YWJsZVRlbGVtZXRyeSA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmVuYWJsZWRUZWxlbWV0cnlMZXZlbHM7XG5cdFx0Ly8gQWxzbyBlbnN1cmUgdGhhdCBlcnJvciB0ZWxlbWV0cnkgaXMgcmVzcGVjdGluZyB0aGUgcHJvZHVjdCBjb25maWd1cmF0aW9uIGZvciBjb2xsZWN0YWJsZSB0ZWxlbWV0cnlcblx0XHRpZiAoY29sbGVjdGFibGVUZWxlbWV0cnkpIHtcblx0XHRcdHRoaXMuX3NlbmRFcnJvclRlbGVtZXRyeSA9IHRoaXMuc2VuZEVycm9yVGVsZW1ldHJ5ID8gY29sbGVjdGFibGVUZWxlbWV0cnkuZXJyb3IgOiBmYWxzZTtcblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgdGVsZW1ldHJ5IGxldmVsIGZyb20gdGhlIHNlcnZpY2UgaXMgdGhlIG1pbmltdW0gb2YgdGhlIGNvbmZpZyBhbmQgcHJvZHVjdFxuXHRcdFx0Y29uc3QgbWF4Q29sbGVjdGFibGVUZWxlbWV0cnlMZXZlbCA9IGNvbGxlY3RhYmxlVGVsZW1ldHJ5LnVzYWdlID8gVGVsZW1ldHJ5TGV2ZWwuVVNBR0UgOiBjb2xsZWN0YWJsZVRlbGVtZXRyeS5lcnJvciA/IFRlbGVtZXRyeUxldmVsLkVSUk9SIDogVGVsZW1ldHJ5TGV2ZWwuTk9ORTtcblx0XHRcdGxldmVsID0gTWF0aC5taW4obGV2ZWwsIG1heENvbGxlY3RhYmxlVGVsZW1ldHJ5TGV2ZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RlbGVtZXRyeUxldmVsID0gbGV2ZWw7XG5cdH1cblxuXHRnZXQgc2VuZEVycm9yVGVsZW1ldHJ5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kRXJyb3JUZWxlbWV0cnk7XG5cdH1cblxuXHRnZXQgdGVsZW1ldHJ5TGV2ZWwoKTogVGVsZW1ldHJ5TGV2ZWwge1xuXHRcdHJldHVybiB0aGlzLl90ZWxlbWV0cnlMZXZlbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gRmx1c2ggYW55IHJlbWFpbmluZyBwZW5kaW5nIGV2ZW50cyBiZWZvcmUgZGlzcG9zaW5nXG5cdFx0dGhpcy5fZmx1c2hQZW5kaW5nRXZlbnRzKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nKGV2ZW50TmFtZTogc3RyaW5nLCBldmVudExldmVsOiBUZWxlbWV0cnlMZXZlbCwgZGF0YT86IElUZWxlbWV0cnlEYXRhKSB7XG5cdFx0Ly8gZG9uJ3Qgc2VuZCBldmVudHMgd2hlbiB0aGUgdXNlciBpcyBvcHRvdXRcblx0XHRpZiAodGhpcy5fdGVsZW1ldHJ5TGV2ZWwgPCBldmVudExldmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2VuZCBldmVudHMgd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBtZXRlcmVkXG5cdFx0aWYgKHRoaXMuX21ldGVyZWRDb25uZWN0aW9uU2VydmljZT8uaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJ1ZmZlciBldmVudHMgdW50aWwgZXhwZXJpbWVudCBwcm9wZXJ0aWVzIGFyZSBzZXQgKG9yIHRpbWVvdXQgZXhwaXJlcylcblx0XHRpZiAoIXRoaXMuX2lzRXhwZXJpbWVudFByb3BlcnR5U2V0KSB7XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0V2ZW50cy5sZW5ndGggPCBUZWxlbWV0cnlTZXJ2aWNlLk1BWF9CVUZGRVJfU0laRSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGV2ZW50TGV2ZWwsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZG9Mb2coZXZlbnROYW1lLCBldmVudExldmVsLCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2RvTG9nKGV2ZW50TmFtZTogc3RyaW5nLCBldmVudExldmVsOiBUZWxlbWV0cnlMZXZlbCwgZGF0YT86IElUZWxlbWV0cnlEYXRhKSB7XG5cdFx0Ly8gYWRkIGV4cGVyaW1lbnQgcHJvcGVydGllc1xuXHRcdGRhdGEgPSBtaXhpbihkYXRhLCB0aGlzLl9leHBlcmltZW50UHJvcGVydGllcyk7XG5cblx0XHQvLyByZW1vdmUgYWxsIFBJSSBmcm9tIGRhdGFcblx0XHRkYXRhID0gY2xlYW5EYXRhKGRhdGEsIHRoaXMuX2NsZWFudXBQYXR0ZXJucyk7XG5cblx0XHQvLyBhZGQgY29tbW9uIHByb3BlcnRpZXNcblx0XHRkYXRhID0gbWl4aW4oZGF0YSwgdGhpcy5fY29tbW9uUHJvcGVydGllcyk7XG5cblx0XHQvLyB0YWcgZXJyb3ItbGV2ZWwgZXZlbnRzIHNvIHRoZSBiYWNrZW5kIGNhbiBpZGVudGlmeSB0aGVtIGdlbmVyaWNhbGx5XG5cdFx0aWYgKGV2ZW50TGV2ZWwgPT09IFRlbGVtZXRyeUxldmVsLkVSUk9SKSB7XG5cdFx0XHRkYXRhID0geyAuLi5kYXRhLCAnaXNFcnJvcic6IHRydWUgfTtcblx0XHR9XG5cblx0XHQvLyBMb2cgdG8gdGhlIGFwcGVuZGVycyBvZiBzdWZmaWNpZW50IGxldmVsXG5cdFx0dGhpcy5fYXBwZW5kZXJzLmZvckVhY2goYSA9PiBhLmxvZyhldmVudE5hbWUsIGRhdGEgPz8ge30pKTtcblx0fVxuXG5cdHB1YmxpY0xvZyhldmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKSB7XG5cdFx0dGhpcy5fbG9nKGV2ZW50TmFtZSwgVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsIGRhdGEpO1xuXHR9XG5cblx0cHVibGljTG9nMjxFIGV4dGVuZHMgQ2xhc3NpZmllZEV2ZW50PE9taXRNZXRhZGF0YTxUPj4gPSBuZXZlciwgVCBleHRlbmRzIElHRFBSUHJvcGVydHkgPSBuZXZlcj4oZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBTdHJpY3RQcm9wZXJ0eUNoZWNrPFQsIEU+KSB7XG5cdFx0dGhpcy5wdWJsaWNMb2coZXZlbnROYW1lLCBkYXRhIGFzIElUZWxlbWV0cnlEYXRhKTtcblx0fVxuXG5cdHB1YmxpY0xvZ0Vycm9yKGVycm9yRXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSkge1xuXHRcdGlmICghdGhpcy5fc2VuZEVycm9yVGVsZW1ldHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VuZCBlcnJvciBldmVudCBhbmQgYW5vbnltaXplIHBhdGhzXG5cdFx0dGhpcy5fbG9nKGVycm9yRXZlbnROYW1lLCBUZWxlbWV0cnlMZXZlbC5FUlJPUiwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWNMb2dFcnJvcjI8RSBleHRlbmRzIENsYXNzaWZpZWRFdmVudDxPbWl0TWV0YWRhdGE8VD4+ID0gbmV2ZXIsIFQgZXh0ZW5kcyBJR0RQUlByb3BlcnR5ID0gbmV2ZXI+KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogU3RyaWN0UHJvcGVydHlDaGVjazxULCBFPikge1xuXHRcdHRoaXMucHVibGljTG9nRXJyb3IoZXZlbnROYW1lLCBkYXRhIGFzIElUZWxlbWV0cnlEYXRhKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRUZWxlbWV0cnlMZXZlbFNldHRpbmdEZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRjb25zdCB0ZWxlbWV0cnlUZXh0ID0gbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbE1kJywgXCJDb250cm9scyB7MH0gdGVsZW1ldHJ5LCBmaXJzdC1wYXJ0eSBleHRlbnNpb24gdGVsZW1ldHJ5LCBhbmQgcGFydGljaXBhdGluZyB0aGlyZC1wYXJ0eSBleHRlbnNpb24gdGVsZW1ldHJ5LiBTb21lIHRoaXJkIHBhcnR5IGV4dGVuc2lvbnMgbWlnaHQgbm90IHJlc3BlY3QgdGhpcyBzZXR0aW5nLiBDb25zdWx0IHRoZSBzcGVjaWZpYyBleHRlbnNpb24ncyBkb2N1bWVudGF0aW9uIHRvIGJlIHN1cmUuIFRlbGVtZXRyeSBoZWxwcyB1cyBiZXR0ZXIgdW5kZXJzdGFuZCBob3cgezB9IGlzIHBlcmZvcm1pbmcsIHdoZXJlIGltcHJvdmVtZW50cyBuZWVkIHRvIGJlIG1hZGUsIGFuZCBob3cgZmVhdHVyZXMgYXJlIGJlaW5nIHVzZWQuXCIsIHByb2R1Y3QubmFtZUxvbmcpO1xuXHRjb25zdCBleHRlcm5hbExpbmtzU3RhdGVtZW50ID0gIXByb2R1Y3QucHJpdmFjeVN0YXRlbWVudFVybCA/XG5cdFx0bG9jYWxpemUoXCJ0ZWxlbWV0cnkuZG9jc1N0YXRlbWVudFwiLCBcIlJlYWQgbW9yZSBhYm91dCB0aGUgW2RhdGEgd2UgY29sbGVjdF0oezB9KS5cIiwgJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS10ZWxlbWV0cnknKSA6XG5cdFx0bG9jYWxpemUoXCJ0ZWxlbWV0cnkuZG9jc0FuZFByaXZhY3lTdGF0ZW1lbnRcIiwgXCJSZWFkIG1vcmUgYWJvdXQgdGhlIFtkYXRhIHdlIGNvbGxlY3RdKHswfSkgYW5kIG91ciBbcHJpdmFjeSBzdGF0ZW1lbnRdKHsxfSkuXCIsICdodHRwczovL2FrYS5tcy92c2NvZGUtdGVsZW1ldHJ5JywgcHJvZHVjdC5wcml2YWN5U3RhdGVtZW50VXJsKTtcblx0Y29uc3QgcmVzdGFydFN0cmluZyA9ICFpc1dlYiA/IGxvY2FsaXplKCd0ZWxlbWV0cnkucmVzdGFydCcsICdBIGZ1bGwgcmVzdGFydCBvZiB0aGUgYXBwbGljYXRpb24gaXMgbmVjZXNzYXJ5IGZvciBjcmFzaCByZXBvcnRpbmcgY2hhbmdlcyB0byB0YWtlIGVmZmVjdC4nKSA6ICcnO1xuXG5cdGNvbnN0IGNyYXNoUmVwb3J0c0hlYWRlciA9IGxvY2FsaXplKCd0ZWxlbWV0cnkuY3Jhc2hSZXBvcnRzJywgXCJDcmFzaCBSZXBvcnRzXCIpO1xuXHRjb25zdCBlcnJvcnNIZWFkZXIgPSBsb2NhbGl6ZSgndGVsZW1ldHJ5LmVycm9ycycsIFwiRXJyb3IgVGVsZW1ldHJ5XCIpO1xuXHRjb25zdCB1c2FnZUhlYWRlciA9IGxvY2FsaXplKCd0ZWxlbWV0cnkudXNhZ2UnLCBcIlVzYWdlIERhdGFcIik7XG5cblx0Y29uc3QgdGVsZW1ldHJ5VGFibGVEZXNjcmlwdGlvbiA9IGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwudGFibGVEZXNjcmlwdGlvbicsIFwiVGhlIGZvbGxvd2luZyB0YWJsZSBvdXRsaW5lcyB0aGUgZGF0YSBzZW50IHdpdGggZWFjaCBzZXR0aW5nOlwiKTtcblx0Y29uc3QgdGVsZW1ldHJ5VGFibGUgPSBgXG58ICAgICAgIHwgJHtjcmFzaFJlcG9ydHNIZWFkZXJ9IHwgJHtlcnJvcnNIZWFkZXJ9IHwgJHt1c2FnZUhlYWRlcn0gfFxufDotLS0tLS18Oi0tLS0tLS0tLS0tLS06fDotLS0tLS0tLS0tLS0tLS06fDotLS0tLS0tLS0tOnxcbnwgYWxsICAgfCAgICAgICBcdTI3MTMgICAgICAgfCAgICAgICAgXHUyNzEzICAgICAgICB8ICAgICBcdTI3MTMgICAgICB8XG58IGVycm9yIHwgICAgICAgXHUyNzEzICAgICAgIHwgICAgICAgIFx1MjcxMyAgICAgICAgfCAgICAgLSAgICAgIHxcbnwgY3Jhc2ggfCAgICAgICBcdTI3MTMgICAgICAgfCAgICAgICAgLSAgICAgICAgfCAgICAgLSAgICAgIHxcbnwgb2ZmICAgfCAgICAgICAtICAgICAgIHwgICAgICAgIC0gICAgICAgIHwgICAgIC0gICAgICB8XG5gO1xuXG5cdGNvbnN0IGRlcHJlY2F0ZWRTZXR0aW5nTm90ZSA9IGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuZGVwcmVjYXRlZCcsIFwiKioqKk5vdGU6KioqIElmIHRoaXMgc2V0dGluZyBpcyAnb2ZmJywgbm8gdGVsZW1ldHJ5IHdpbGwgYmUgc2VudCByZWdhcmRsZXNzIG9mIG90aGVyIHRlbGVtZXRyeSBzZXR0aW5ncy4gSWYgdGhpcyBzZXR0aW5nIGlzIHNldCB0byBhbnl0aGluZyBleGNlcHQgJ29mZicgYW5kIHRlbGVtZXRyeSBpcyBkaXNhYmxlZCB3aXRoIGRlcHJlY2F0ZWQgc2V0dGluZ3MsIG5vIHRlbGVtZXRyeSB3aWxsIGJlIHNlbnQuKlwiKTtcblx0Y29uc3QgdGVsZW1ldHJ5RGVzY3JpcHRpb24gPSBgXG4ke3RlbGVtZXRyeVRleHR9ICR7ZXh0ZXJuYWxMaW5rc1N0YXRlbWVudH0gJHtyZXN0YXJ0U3RyaW5nfVxuXG4mbmJzcDtcblxuJHt0ZWxlbWV0cnlUYWJsZURlc2NyaXB0aW9ufVxuJHt0ZWxlbWV0cnlUYWJsZX1cblxuJm5ic3A7XG5cbiR7ZGVwcmVjYXRlZFNldHRpbmdOb3RlfVxuYDtcblxuXHRyZXR1cm4gdGVsZW1ldHJ5RGVzY3JpcHRpb247XG59XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0J2lkJzogVEVMRU1FVFJZX1NFQ1RJT05fSUQsXG5cdCdvcmRlcic6IDEsXG5cdCd0eXBlJzogJ29iamVjdCcsXG5cdCd0aXRsZSc6IGxvY2FsaXplKCd0ZWxlbWV0cnlDb25maWd1cmF0aW9uVGl0bGUnLCBcIlRlbGVtZXRyeVwiKSxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0W1RFTEVNRVRSWV9TRVRUSU5HX0lEXToge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1RlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT04sIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uRVJST1IsIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uQ1JBU0gsIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT0ZGXSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmRlZmF1bHQnLCBcIlNlbmRzIHVzYWdlIGRhdGEsIGVycm9ycywgYW5kIGNyYXNoIHJlcG9ydHMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmVycm9yJywgXCJTZW5kcyBnZW5lcmFsIGVycm9yIHRlbGVtZXRyeSBhbmQgY3Jhc2ggcmVwb3J0cy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuY3Jhc2gnLCBcIlNlbmRzIE9TIGxldmVsIGNyYXNoIHJlcG9ydHMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLm9mZicsIFwiRGlzYWJsZXMgYWxsIHByb2R1Y3QgdGVsZW1ldHJ5LlwiKVxuXHRcdFx0XSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogZ2V0VGVsZW1ldHJ5TGV2ZWxTZXR0aW5nRGVzY3JpcHRpb24oKSxcblx0XHRcdCdkZWZhdWx0JzogVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTixcblx0XHRcdCdyZXN0cmljdGVkJzogdHJ1ZSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdCd0YWdzJzogWyd1c2VzT25saW5lU2VydmljZXMnLCAndGVsZW1ldHJ5J10sXG5cdFx0XHQncG9saWN5Jzoge1xuXHRcdFx0XHRuYW1lOiAnVGVsZW1ldHJ5TGV2ZWwnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuVGVsZW1ldHJ5LFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuOTknLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLnBvbGljeURlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLnBvbGljeURlc2NyaXB0aW9uJywgXCJDb250cm9scyB0aGUgbGV2ZWwgb2YgdGVsZW1ldHJ5LlwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmRlZmF1bHQnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5kZWZhdWx0JywgXCJTZW5kcyB1c2FnZSBkYXRhLCBlcnJvcnMsIGFuZCBjcmFzaCByZXBvcnRzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5lcnJvcicsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmVycm9yJywgXCJTZW5kcyBnZW5lcmFsIGVycm9yIHRlbGVtZXRyeSBhbmQgY3Jhc2ggcmVwb3J0cy5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuY3Jhc2gnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5jcmFzaCcsIFwiU2VuZHMgT1MgbGV2ZWwgY3Jhc2ggcmVwb3J0cy5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwub2ZmJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwub2ZmJywgXCJEaXNhYmxlcyBhbGwgcHJvZHVjdCB0ZWxlbWV0cnkuXCIpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3RlbGVtZXRyeS5mZWVkYmFjay5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LmZlZWRiYWNrLmVuYWJsZWQnLCBcIkVuYWJsZSBmZWVkYmFjayBtZWNoYW5pc21zIHN1Y2ggYXMgdGhlIGlzc3VlIHJlcG9ydGVyLCBzdXJ2ZXlzLCBhbmQgb3RoZXIgZmVlZGJhY2sgb3B0aW9ucy5cIiksXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0VuYWJsZUZlZWRiYWNrJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LlRlbGVtZXRyeSxcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJ3RlbGVtZXRyeS5mZWVkYmFjay5lbmFibGVkJywgdmFsdWU6IGxvY2FsaXplKCd0ZWxlbWV0cnkuZmVlZGJhY2suZW5hYmxlZCcsIFwiRW5hYmxlIGZlZWRiYWNrIG1lY2hhbmlzbXMgc3VjaCBhcyB0aGUgaXNzdWUgcmVwb3J0ZXIsIHN1cnZleXMsIGFuZCBvdGhlciBmZWVkYmFjayBvcHRpb25zLlwiKSB9IH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQvLyBEZXByZWNhdGVkIHRlbGVtZXRyeSBzZXR0aW5nXG5cdFx0W1RFTEVNRVRSWV9PTERfU0VUVElOR19JRF06IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOlxuXHRcdFx0XHQhcHJvZHVjdC5wcml2YWN5U3RhdGVtZW50VXJsID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgndGVsZW1ldHJ5LmVuYWJsZVRlbGVtZXRyeScsIFwiRW5hYmxlIGRpYWdub3N0aWMgZGF0YSB0byBiZSBjb2xsZWN0ZWQuIFRoaXMgaGVscHMgdXMgdG8gYmV0dGVyIHVuZGVyc3RhbmQgaG93IHswfSBpcyBwZXJmb3JtaW5nIGFuZCB3aGVyZSBpbXByb3ZlbWVudHMgbmVlZCB0byBiZSBtYWRlLlwiLCBwcm9kdWN0Lm5hbWVMb25nKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3RlbGVtZXRyeS5lbmFibGVUZWxlbWV0cnlNZCcsIFwiRW5hYmxlIGRpYWdub3N0aWMgZGF0YSB0byBiZSBjb2xsZWN0ZWQuIFRoaXMgaGVscHMgdXMgdG8gYmV0dGVyIHVuZGVyc3RhbmQgaG93IHswfSBpcyBwZXJmb3JtaW5nIGFuZCB3aGVyZSBpbXByb3ZlbWVudHMgbmVlZCB0byBiZSBtYWRlLiBbUmVhZCBtb3JlXSh7MX0pIGFib3V0IHdoYXQgd2UgY29sbGVjdCBhbmQgb3VyIHByaXZhY3kgc3RhdGVtZW50LlwiLCBwcm9kdWN0Lm5hbWVMb25nLCBwcm9kdWN0LnByaXZhY3lTdGF0ZW1lbnRVcmwpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J3Jlc3RyaWN0ZWQnOiB0cnVlLFxuXHRcdFx0J21hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlJzogbG9jYWxpemUoJ2VuYWJsZVRlbGVtZXRyeURlcHJlY2F0ZWQnLCBcIklmIHRoaXMgc2V0dGluZyBpcyBmYWxzZSwgbm8gdGVsZW1ldHJ5IHdpbGwgYmUgc2VudCByZWdhcmRsZXNzIG9mIHRoZSBuZXcgc2V0dGluZydzIHZhbHVlLiBEZXByZWNhdGVkIGluIGZhdm9yIG9mIHRoZSB7MH0gc2V0dGluZy5cIiwgYFxcYCMke1RFTEVNRVRSWV9TRVRUSU5HX0lEfSNcXGBgKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdCd0YWdzJzogWyd1c2VzT25saW5lU2VydmljZXMnLCAndGVsZW1ldHJ5J11cblx0XHR9XG5cdH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6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VCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLFNBQVMsOENBQThDLGtDQUFrQztBQUFBLFVBQ2pHO0FBQUEsVUFDQSxrQkFBa0I7QUFBQSxZQUNqQjtBQUFBLGNBQ0MsS0FBSztBQUFBLGNBQ0wsT0FBTyxTQUFTLG9DQUFvQyw4Q0FBOEM7QUFBQSxZQUNuRztBQUFBLFlBQ0E7QUFBQSxjQUNDLEtBQUs7QUFBQSxjQUNMLE9BQU8sU0FBUyxrQ0FBa0Msa0RBQWtEO0FBQUEsWUFDckc7QUFBQSxZQUNBO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FDTCxPQUFPLFNBQVMsa0NBQWtDLCtCQUErQjtBQUFBLFlBQ2xGO0FBQUEsWUFDQTtBQUFBLGNBQ0MsS0FBSztBQUFBLGNBQ0wsT0FBTyxTQUFTLGdDQUFnQyxpQ0FBaUM7QUFBQSxZQUNsRjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLDhCQUE4QjtBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyw4QkFBOEIsNkZBQTZGO0FBQUEsTUFDakosUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYyxFQUFFLGFBQWEsRUFBRSxLQUFLLDhCQUE4QixPQUFPLFNBQVMsOEJBQThCLDZGQUE2RixFQUFFLEVBQUU7QUFBQSxNQUNsTjtBQUFBLElBQ0Q7QUFBQTtBQUFBLElBRUEsQ0FBQyx3QkFBd0IsR0FBRztBQUFBLE1BQzNCLFFBQVE7QUFBQSxNQUNSLHVCQUNDLENBQUMsUUFBUSxzQkFDUixTQUFTLDZCQUE2Qiw0SUFBNEksUUFBUSxRQUFRLElBQ2xNLFNBQVMsK0JBQStCLDhNQUE4TSxRQUFRLFVBQVUsUUFBUSxtQkFBbUI7QUFBQSxNQUNyUyxXQUFXO0FBQUEsTUFDWCxjQUFjO0FBQUEsTUFDZCw4QkFBOEIsU0FBUyw2QkFBNkIsc0lBQXNJLE1BQU0sb0JBQW9CLEtBQUs7QUFBQSxNQUN6TyxTQUFTLG1CQUFtQjtBQUFBLE1BQzVCLFFBQVEsQ0FBQyxzQkFBc0IsV0FBVztBQUFBLElBQzNDO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
