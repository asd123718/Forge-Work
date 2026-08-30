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
import { Codicon } from "../../../../base/common/codicons.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalSettingPrefix } from "../../../../platform/terminal/common/terminal.js";
import { getUriClasses, getColorClass, createColorStyleElement } from "./terminalIcon.js";
import { configureTerminalProfileIcon } from "./terminalIcons.js";
import * as nls from "../../../../nls.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../common/terminal.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { basename } from "../../../../base/common/path.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { hasKey, isString } from "../../../../base/common/types.js";
import { Event } from "../../../../base/common/event.js";
let TerminalProfileQuickpick = class {
  constructor(_terminalProfileService, _terminalProfileResolverService, _configurationService, _quickInputService, _themeService, _notificationService) {
    this._terminalProfileService = _terminalProfileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._themeService = _themeService;
    this._notificationService = _notificationService;
  }
  async showAndGetResult(type) {
    const platformKey = await this._terminalProfileService.getPlatformKey();
    const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
    const result = await this._createAndShow(type);
    const defaultProfileKey = `${TerminalSettingPrefix.DefaultProfile}${platformKey}`;
    if (!result) {
      return;
    }
    if (type === "setDefault") {
      if (hasKey(result.profile, { id: true })) {
        await this._configurationService.updateValue(defaultProfileKey, result.profile.title, ConfigurationTarget.USER);
        return {
          config: {
            extensionIdentifier: result.profile.extensionIdentifier,
            id: result.profile.id,
            title: result.profile.title,
            options: {
              color: result.profile.color,
              icon: result.profile.icon
            }
          },
          keyMods: result.keyMods
        };
      }
      if (hasKey(result.profile, { profileName: true })) {
        const profilesConfig = await this._configurationService.getValue(profilesKey);
        if (typeof profilesConfig === "object") {
          const newProfile = {
            path: result.profile.path
          };
          if (result.profile.args) {
            newProfile.args = result.profile.args;
          }
          profilesConfig[result.profile.profileName] = this._createNewProfileConfig(result.profile);
          await this._configurationService.updateValue(profilesKey, profilesConfig, ConfigurationTarget.USER);
        }
      }
      await this._configurationService.updateValue(defaultProfileKey, result.profileName, ConfigurationTarget.USER);
    } else if (type === "createInstance") {
      if (hasKey(result.profile, { id: true })) {
        const config = {
          extensionIdentifier: result.profile.extensionIdentifier,
          id: result.profile.id,
          title: result.profile.title,
          options: {
            icon: result.profile.icon,
            color: result.profile.color
          }
        };
        if (result.profile.titleTemplate !== void 0) {
          config.titleTemplate = result.profile.titleTemplate;
        }
        return {
          config,
          keyMods: result.keyMods
        };
      } else {
        return { config: result.profile, keyMods: result.keyMods };
      }
    }
    return hasKey(result.profile, { profileName: true }) ? result.profile.profileName : result.profile.title;
  }
  async _createAndShow(type) {
    const platformKey = await this._terminalProfileService.getPlatformKey();
    const profiles = this._terminalProfileService.availableProfiles;
    const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
    const defaultProfileName = this._terminalProfileService.getDefaultProfileName();
    let keyMods;
    const options = {
      placeHolder: type === "createInstance" ? nls.localize("terminal.integrated.selectProfileToCreate", "Select the terminal profile to create") : nls.localize("terminal.integrated.chooseDefaultProfile", "Select your default terminal profile"),
      onDidTriggerItemButton: async (context) => {
        if (!await this._isProfileSafe(context.item.profile)) {
          return;
        }
        if (hasKey(context.item.profile, { id: true })) {
          return;
        }
        const configProfiles2 = this._configurationService.getValue(TerminalSettingPrefix.Profiles + platformKey);
        const existingProfiles = !!configProfiles2 ? Object.keys(configProfiles2) : [];
        const name = await this._quickInputService.input({
          prompt: nls.localize("enterTerminalProfileName", "Enter terminal profile name"),
          value: context.item.profile.profileName,
          validateInput: async (input) => {
            if (existingProfiles.includes(input)) {
              return nls.localize("terminalProfileAlreadyExists", "A terminal profile already exists with that name");
            }
            return void 0;
          }
        });
        if (!name) {
          return;
        }
        const newConfigValue = {
          ...configProfiles2,
          [name]: this._createNewProfileConfig(context.item.profile)
        };
        await this._configurationService.updateValue(profilesKey, newConfigValue, ConfigurationTarget.USER);
      },
      onKeyMods: (mods) => keyMods = mods
    };
    const quickPickItems = [];
    const configProfiles = profiles.filter((e) => !e.isAutoDetected);
    const autoDetectedProfiles = profiles.filter((e) => e.isAutoDetected);
    if (configProfiles.length > 0) {
      quickPickItems.push({ type: "separator", label: nls.localize("terminalProfiles", "profiles") });
      quickPickItems.push(...this._sortProfileQuickPickItems(configProfiles.map((e) => this._createProfileQuickPickItem(e)), defaultProfileName));
    }
    quickPickItems.push({ type: "separator", label: nls.localize("ICreateContributedTerminalProfileOptions", "contributed") });
    const contributedProfiles = [];
    for (const contributed of this._terminalProfileService.contributedProfiles) {
      let icon;
      if (isString(contributed.icon)) {
        if (contributed.icon.startsWith("$(")) {
          icon = ThemeIcon.fromString(contributed.icon);
        } else {
          icon = ThemeIcon.fromId(contributed.icon);
        }
      }
      if (!icon || !getIconRegistry().getIcon(icon.id)) {
        icon = this._terminalProfileResolverService.getDefaultIcon();
      }
      const uriClasses = getUriClasses(contributed, this._themeService.getColorTheme().type, true);
      const colorClass = getColorClass(contributed);
      const iconClasses = [];
      if (uriClasses) {
        iconClasses.push(...uriClasses);
      }
      if (colorClass) {
        iconClasses.push(colorClass);
      }
      contributedProfiles.push({
        label: `$(${icon.id}) ${contributed.title}`,
        profile: {
          extensionIdentifier: contributed.extensionIdentifier,
          title: contributed.title,
          icon: contributed.icon,
          id: contributed.id,
          color: contributed.color,
          titleTemplate: contributed.titleTemplate
        },
        profileName: contributed.title,
        iconClasses
      });
    }
    if (contributedProfiles.length > 0) {
      quickPickItems.push(...this._sortProfileQuickPickItems(contributedProfiles, defaultProfileName));
    }
    if (autoDetectedProfiles.length > 0) {
      quickPickItems.push({ type: "separator", label: nls.localize("terminalProfiles.detected", "detected") });
      quickPickItems.push(...this._sortProfileQuickPickItems(autoDetectedProfiles.map((e) => this._createProfileQuickPickItem(e)), defaultProfileName));
    }
    const colorStyleDisposable = createColorStyleElement(this._themeService.getColorTheme());
    const result = await this._quickInputService.pick(quickPickItems, options);
    colorStyleDisposable.dispose();
    if (!result) {
      return void 0;
    }
    if (!await this._isProfileSafe(result.profile)) {
      return void 0;
    }
    if (keyMods) {
      result.keyMods = keyMods;
    }
    return result;
  }
  _createNewProfileConfig(profile) {
    const result = { path: profile.path };
    if (profile.args) {
      result.args = profile.args;
    }
    if (profile.env) {
      result.env = profile.env;
    }
    return result;
  }
  async _isProfileSafe(profile) {
    const isUnsafePath = hasKey(profile, { profileName: true }) && profile.isUnsafePath;
    const requiresUnsafePath = hasKey(profile, { profileName: true }) && profile.requiresUnsafePath;
    if (!isUnsafePath && !requiresUnsafePath) {
      return true;
    }
    return await new Promise((r) => {
      const unsafePaths = [];
      if (isUnsafePath) {
        unsafePaths.push(profile.path);
      }
      if (requiresUnsafePath) {
        unsafePaths.push(requiresUnsafePath);
      }
      const handle = this._notificationService.prompt(
        Severity.Warning,
        nls.localize("unsafePathWarning", "This terminal profile uses a potentially unsafe path that can be modified by another user: {0}. Are you sure you want to use it?", `"${unsafePaths.join(",")}"`),
        [{
          label: nls.localize("yes", "Yes"),
          run: () => r(true)
        }, {
          label: nls.localize("cancel", "Cancel"),
          run: () => r(false)
        }]
      );
      Event.once(handle.onDidClose)(() => {
        r(false);
      });
    });
  }
  _createProfileQuickPickItem(profile) {
    const buttons = [{
      iconClass: ThemeIcon.asClassName(configureTerminalProfileIcon),
      tooltip: nls.localize("createQuickLaunchProfile", "Configure Terminal Profile")
    }];
    const icon = profile.icon && ThemeIcon.isThemeIcon(profile.icon) ? profile.icon : Codicon.terminal;
    const label = `$(${icon.id}) ${profile.profileName}`;
    const friendlyPath = profile.isFromPath ? basename(profile.path) : profile.path;
    const colorClass = getColorClass(profile);
    const iconClasses = [];
    if (colorClass) {
      iconClasses.push(colorClass);
    }
    if (profile.args) {
      if (isString(profile.args)) {
        return { label, description: `${profile.path} ${profile.args}`, profile, profileName: profile.profileName, buttons, iconClasses };
      }
      const argsString = profile.args.map((e) => {
        if (e.includes(" ")) {
          return `"${e.replace(/"/g, '\\"')}"`;
        }
        return e;
      }).join(" ");
      return { label, description: `${friendlyPath} ${argsString}`, profile, profileName: profile.profileName, buttons, iconClasses };
    }
    return { label, description: friendlyPath, profile, profileName: profile.profileName, buttons, iconClasses };
  }
  _sortProfileQuickPickItems(items, defaultProfileName) {
    return items.sort((a, b) => {
      if (b.profileName === defaultProfileName) {
        return 1;
      }
      if (a.profileName === defaultProfileName) {
        return -1;
      }
      return a.profileName.localeCompare(b.profileName);
    });
  }
};
TerminalProfileQuickpick = __decorateClass([
  __decorateParam(0, ITerminalProfileService),
  __decorateParam(1, ITerminalProfileResolverService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, INotificationService)
], TerminalProfileQuickpick);
export {
  TerminalProfileQuickpick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElLZXlNb2RzLCBJUGlja09wdGlvbnMsIElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsUHJvZmlsZU9iamVjdCwgVGVybWluYWxTZXR0aW5nUHJlZml4LCB0eXBlIElUZXJtaW5hbEV4ZWN1dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZ2V0VXJpQ2xhc3NlcywgZ2V0Q29sb3JDbGFzcywgY3JlYXRlQ29sb3JTdHlsZUVsZW1lbnQgfSBmcm9tICcuL3Rlcm1pbmFsSWNvbi5qcyc7XG5pbXBvcnQgeyBjb25maWd1cmVUZXJtaW5hbFByb2ZpbGVJY29uIH0gZnJvbSAnLi90ZXJtaW5hbEljb25zLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tUZXJtaW5hbE9iamVjdCwgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5cbnR5cGUgRGVmYXVsdFByb2ZpbGVOYW1lID0gc3RyaW5nO1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUHJvZmlsZVF1aWNrcGljayB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgc2hvd0FuZEdldFJlc3VsdCh0eXBlOiAnc2V0RGVmYXVsdCcgfCAnY3JlYXRlSW5zdGFuY2UnKTogUHJvbWlzZTxJUXVpY2tQaWNrVGVybWluYWxPYmplY3QgfCBEZWZhdWx0UHJvZmlsZU5hbWUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwbGF0Zm9ybUtleSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuZ2V0UGxhdGZvcm1LZXkoKTtcblx0XHRjb25zdCBwcm9maWxlc0tleSA9IFRlcm1pbmFsU2V0dGluZ1ByZWZpeC5Qcm9maWxlcyArIHBsYXRmb3JtS2V5O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NyZWF0ZUFuZFNob3codHlwZSk7XG5cdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGVLZXkgPSBgJHtUZXJtaW5hbFNldHRpbmdQcmVmaXguRGVmYXVsdFByb2ZpbGV9JHtwbGF0Zm9ybUtleX1gO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSAnc2V0RGVmYXVsdCcpIHtcblx0XHRcdGlmIChoYXNLZXkocmVzdWx0LnByb2ZpbGUsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0Ly8gZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHByb2ZpbGVcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoZGVmYXVsdFByb2ZpbGVLZXksIHJlc3VsdC5wcm9maWxlLnRpdGxlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogcmVzdWx0LnByb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdFx0XHRcdGlkOiByZXN1bHQucHJvZmlsZS5pZCxcblx0XHRcdFx0XHRcdHRpdGxlOiByZXN1bHQucHJvZmlsZS50aXRsZSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHJlc3VsdC5wcm9maWxlLmNvbG9yLFxuXHRcdFx0XHRcdFx0XHRpY29uOiByZXN1bHQucHJvZmlsZS5pY29uXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRrZXlNb2RzOiByZXN1bHQua2V5TW9kc1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgdGhlIHByb2ZpbGUgdG8gc2V0dGluZ3MgaWYgbmVjZXNzYXJ5XG5cdFx0XHRpZiAoaGFzS2V5KHJlc3VsdC5wcm9maWxlLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzQ29uZmlnID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocHJvZmlsZXNLZXkpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHByb2ZpbGVzQ29uZmlnID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Byb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGVPYmplY3QgPSB7XG5cdFx0XHRcdFx0XHRwYXRoOiByZXN1bHQucHJvZmlsZS5wYXRoXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnByb2ZpbGUuYXJncykge1xuXHRcdFx0XHRcdFx0bmV3UHJvZmlsZS5hcmdzID0gcmVzdWx0LnByb2ZpbGUuYXJncztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KHByb2ZpbGVzQ29uZmlnIGFzIHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsUHJvZmlsZU9iamVjdCB9KVtyZXN1bHQucHJvZmlsZS5wcm9maWxlTmFtZV0gPSB0aGlzLl9jcmVhdGVOZXdQcm9maWxlQ29uZmlnKHJlc3VsdC5wcm9maWxlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShwcm9maWxlc0tleSwgcHJvZmlsZXNDb25maWcsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFNldCB0aGUgZGVmYXVsdCBwcm9maWxlXG5cdFx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShkZWZhdWx0UHJvZmlsZUtleSwgcmVzdWx0LnByb2ZpbGVOYW1lLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NyZWF0ZUluc3RhbmNlJykge1xuXHRcdFx0aWYgKGhhc0tleShyZXN1bHQucHJvZmlsZSwgeyBpZDogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBjb25maWc6IHtcblx0XHRcdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmc7XG5cdFx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHRcdHRpdGxlVGVtcGxhdGU/OiBzdHJpbmc7XG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0aWNvbjogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVsnaWNvbiddO1xuXHRcdFx0XHRcdFx0Y29sb3I6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbJ2NvbG9yJ107XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSA9IHtcblx0XHRcdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiByZXN1bHQucHJvZmlsZS5leHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdFx0XHRcdGlkOiByZXN1bHQucHJvZmlsZS5pZCxcblx0XHRcdFx0XHR0aXRsZTogcmVzdWx0LnByb2ZpbGUudGl0bGUsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0aWNvbjogcmVzdWx0LnByb2ZpbGUuaWNvbixcblx0XHRcdFx0XHRcdGNvbG9yOiByZXN1bHQucHJvZmlsZS5jb2xvcixcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChyZXN1bHQucHJvZmlsZS50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25maWcudGl0bGVUZW1wbGF0ZSA9IHJlc3VsdC5wcm9maWxlLnRpdGxlVGVtcGxhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25maWcsXG5cdFx0XHRcdFx0a2V5TW9kczogcmVzdWx0LmtleU1vZHNcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbmZpZzogcmVzdWx0LnByb2ZpbGUsIGtleU1vZHM6IHJlc3VsdC5rZXlNb2RzIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIGZvciB0ZXN0c1xuXHRcdHJldHVybiBoYXNLZXkocmVzdWx0LnByb2ZpbGUsIHsgcHJvZmlsZU5hbWU6IHRydWUgfSkgPyByZXN1bHQucHJvZmlsZS5wcm9maWxlTmFtZSA6IHJlc3VsdC5wcm9maWxlLnRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQW5kU2hvdyh0eXBlOiAnc2V0RGVmYXVsdCcgfCAnY3JlYXRlSW5zdGFuY2UnKTogUHJvbWlzZTxJUHJvZmlsZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwbGF0Zm9ybUtleSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuZ2V0UGxhdGZvcm1LZXkoKTtcblx0XHRjb25zdCBwcm9maWxlcyA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXM7XG5cdFx0Y29uc3QgcHJvZmlsZXNLZXkgPSBUZXJtaW5hbFNldHRpbmdQcmVmaXguUHJvZmlsZXMgKyBwbGF0Zm9ybUtleTtcblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZU5hbWUgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlTmFtZSgpO1xuXHRcdGxldCBrZXlNb2RzOiBJS2V5TW9kcyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcHRpb25zOiBJUGlja09wdGlvbnM8SVByb2ZpbGVRdWlja1BpY2tJdGVtPiA9IHtcblx0XHRcdHBsYWNlSG9sZGVyOiB0eXBlID09PSAnY3JlYXRlSW5zdGFuY2UnID8gbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNlbGVjdFByb2ZpbGVUb0NyZWF0ZScsIFwiU2VsZWN0IHRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIGNyZWF0ZVwiKSA6IG5scy5sb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jaG9vc2VEZWZhdWx0UHJvZmlsZScsIFwiU2VsZWN0IHlvdXIgZGVmYXVsdCB0ZXJtaW5hbCBwcm9maWxlXCIpLFxuXHRcdFx0b25EaWRUcmlnZ2VySXRlbUJ1dHRvbjogYXN5bmMgKGNvbnRleHQpID0+IHtcblx0XHRcdFx0Ly8gR2V0IHRoZSB1c2VyJ3MgZXhwbGljaXQgcGVybWlzc2lvbiB0byB1c2UgYSBwb3RlbnRpYWxseSB1bnNhZmUgcGF0aFxuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2lzUHJvZmlsZVNhZmUoY29udGV4dC5pdGVtLnByb2ZpbGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNLZXkoY29udGV4dC5pdGVtLnByb2ZpbGUsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29uZmlnUHJvZmlsZXM6IHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsRXhlY3V0YWJsZSB8IG51bGwgfCB1bmRlZmluZWQgfSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ1ByZWZpeC5Qcm9maWxlcyArIHBsYXRmb3JtS2V5KTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdQcm9maWxlcyA9ICEhY29uZmlnUHJvZmlsZXMgPyBPYmplY3Qua2V5cyhjb25maWdQcm9maWxlcykgOiBbXTtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdFx0XHRwcm9tcHQ6IG5scy5sb2NhbGl6ZSgnZW50ZXJUZXJtaW5hbFByb2ZpbGVOYW1lJywgXCJFbnRlciB0ZXJtaW5hbCBwcm9maWxlIG5hbWVcIiksXG5cdFx0XHRcdFx0dmFsdWU6IGNvbnRleHQuaXRlbS5wcm9maWxlLnByb2ZpbGVOYW1lLFxuXHRcdFx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIGlucHV0ID0+IHtcblx0XHRcdFx0XHRcdGlmIChleGlzdGluZ1Byb2ZpbGVzLmluY2x1ZGVzKGlucHV0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGVBbHJlYWR5RXhpc3RzJywgXCJBIHRlcm1pbmFsIHByb2ZpbGUgYWxyZWFkeSBleGlzdHMgd2l0aCB0aGF0IG5hbWVcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZXdDb25maWdWYWx1ZTogeyBba2V5OiBzdHJpbmddOiBJVGVybWluYWxFeGVjdXRhYmxlIHwgbnVsbCB8IHVuZGVmaW5lZCB9ID0ge1xuXHRcdFx0XHRcdC4uLmNvbmZpZ1Byb2ZpbGVzLFxuXHRcdFx0XHRcdFtuYW1lXTogdGhpcy5fY3JlYXRlTmV3UHJvZmlsZUNvbmZpZyhjb250ZXh0Lml0ZW0ucHJvZmlsZSlcblx0XHRcdFx0fTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUocHJvZmlsZXNLZXksIG5ld0NvbmZpZ1ZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fSxcblx0XHRcdG9uS2V5TW9kczogbW9kcyA9PiBrZXlNb2RzID0gbW9kc1xuXHRcdH07XG5cblx0XHQvLyBCdWlsZCBxdWljayBwaWNrIGl0ZW1zXG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IChJUHJvZmlsZVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0Y29uc3QgY29uZmlnUHJvZmlsZXMgPSBwcm9maWxlcy5maWx0ZXIoZSA9PiAhZS5pc0F1dG9EZXRlY3RlZCk7XG5cdFx0Y29uc3QgYXV0b0RldGVjdGVkUHJvZmlsZXMgPSBwcm9maWxlcy5maWx0ZXIoZSA9PiBlLmlzQXV0b0RldGVjdGVkKTtcblxuXHRcdGlmIChjb25maWdQcm9maWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZXMnLCBcInByb2ZpbGVzXCIpIH0pO1xuXHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCguLi50aGlzLl9zb3J0UHJvZmlsZVF1aWNrUGlja0l0ZW1zKGNvbmZpZ1Byb2ZpbGVzLm1hcChlID0+IHRoaXMuX2NyZWF0ZVByb2ZpbGVRdWlja1BpY2tJdGVtKGUpKSwgZGVmYXVsdFByb2ZpbGVOYW1lISkpO1xuXHRcdH1cblxuXHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgnSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucycsIFwiY29udHJpYnV0ZWRcIikgfSk7XG5cdFx0Y29uc3QgY29udHJpYnV0ZWRQcm9maWxlczogSVByb2ZpbGVRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGVkIG9mIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcykge1xuXHRcdFx0bGV0IGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc1N0cmluZyhjb250cmlidXRlZC5pY29uKSkge1xuXHRcdFx0XHRpZiAoY29udHJpYnV0ZWQuaWNvbi5zdGFydHNXaXRoKCckKCcpKSB7XG5cdFx0XHRcdFx0aWNvbiA9IFRoZW1lSWNvbi5mcm9tU3RyaW5nKGNvbnRyaWJ1dGVkLmljb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGljb24gPSBUaGVtZUljb24uZnJvbUlkKGNvbnRyaWJ1dGVkLmljb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWljb24gfHwgIWdldEljb25SZWdpc3RyeSgpLmdldEljb24oaWNvbi5pZCkpIHtcblx0XHRcdFx0aWNvbiA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5nZXREZWZhdWx0SWNvbigpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXJpQ2xhc3NlcyA9IGdldFVyaUNsYXNzZXMoY29udHJpYnV0ZWQsIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBjb2xvckNsYXNzID0gZ2V0Q29sb3JDbGFzcyhjb250cmlidXRlZCk7XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NlcyA9IFtdO1xuXHRcdFx0aWYgKHVyaUNsYXNzZXMpIHtcblx0XHRcdFx0aWNvbkNsYXNzZXMucHVzaCguLi51cmlDbGFzc2VzKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb2xvckNsYXNzKSB7XG5cdFx0XHRcdGljb25DbGFzc2VzLnB1c2goY29sb3JDbGFzcyk7XG5cdFx0XHR9XG5cdFx0XHRjb250cmlidXRlZFByb2ZpbGVzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogYCQoJHtpY29uLmlkfSkgJHtjb250cmlidXRlZC50aXRsZX1gLFxuXHRcdFx0XHRwcm9maWxlOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogY29udHJpYnV0ZWQuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdFx0XHR0aXRsZTogY29udHJpYnV0ZWQudGl0bGUsXG5cdFx0XHRcdFx0aWNvbjogY29udHJpYnV0ZWQuaWNvbixcblx0XHRcdFx0XHRpZDogY29udHJpYnV0ZWQuaWQsXG5cdFx0XHRcdFx0Y29sb3I6IGNvbnRyaWJ1dGVkLmNvbG9yLFxuXHRcdFx0XHRcdHRpdGxlVGVtcGxhdGU6IGNvbnRyaWJ1dGVkLnRpdGxlVGVtcGxhdGVcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvZmlsZU5hbWU6IGNvbnRyaWJ1dGVkLnRpdGxlLFxuXHRcdFx0XHRpY29uQ2xhc3Nlc1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRyaWJ1dGVkUHJvZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCguLi50aGlzLl9zb3J0UHJvZmlsZVF1aWNrUGlja0l0ZW1zKGNvbnRyaWJ1dGVkUHJvZmlsZXMsIGRlZmF1bHRQcm9maWxlTmFtZSEpKTtcblx0XHR9XG5cblx0XHRpZiAoYXV0b0RldGVjdGVkUHJvZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGVzLmRldGVjdGVkJywgXCJkZXRlY3RlZFwiKSB9KTtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goLi4udGhpcy5fc29ydFByb2ZpbGVRdWlja1BpY2tJdGVtcyhhdXRvRGV0ZWN0ZWRQcm9maWxlcy5tYXAoZSA9PiB0aGlzLl9jcmVhdGVQcm9maWxlUXVpY2tQaWNrSXRlbShlKSksIGRlZmF1bHRQcm9maWxlTmFtZSEpKTtcblx0XHR9XG5cdFx0Y29uc3QgY29sb3JTdHlsZURpc3Bvc2FibGUgPSBjcmVhdGVDb2xvclN0eWxlRWxlbWVudCh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2socXVpY2tQaWNrSXRlbXMsIG9wdGlvbnMpO1xuXHRcdGNvbG9yU3R5bGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9pc1Byb2ZpbGVTYWZlKHJlc3VsdC5wcm9maWxlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGtleU1vZHMpIHtcblx0XHRcdHJlc3VsdC5rZXlNb2RzID0ga2V5TW9kcztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU5ld1Byb2ZpbGVDb25maWcocHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSk6IElUZXJtaW5hbEV4ZWN1dGFibGUge1xuXHRcdGNvbnN0IHJlc3VsdDogSVRlcm1pbmFsRXhlY3V0YWJsZSA9IHsgcGF0aDogcHJvZmlsZS5wYXRoIH07XG5cdFx0aWYgKHByb2ZpbGUuYXJncykge1xuXHRcdFx0cmVzdWx0LmFyZ3MgPSBwcm9maWxlLmFyZ3M7XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlLmVudikge1xuXHRcdFx0cmVzdWx0LmVudiA9IHByb2ZpbGUuZW52O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNQcm9maWxlU2FmZShwcm9maWxlOiBJVGVybWluYWxQcm9maWxlIHwgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGlzVW5zYWZlUGF0aCA9IGhhc0tleShwcm9maWxlLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pICYmIHByb2ZpbGUuaXNVbnNhZmVQYXRoO1xuXHRcdGNvbnN0IHJlcXVpcmVzVW5zYWZlUGF0aCA9IGhhc0tleShwcm9maWxlLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pICYmIHByb2ZpbGUucmVxdWlyZXNVbnNhZmVQYXRoO1xuXHRcdGlmICghaXNVbnNhZmVQYXRoICYmICFyZXF1aXJlc1Vuc2FmZVBhdGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgdXNlcidzIGV4cGxpY2l0IHBlcm1pc3Npb24gdG8gdXNlIGEgcG90ZW50aWFsbHkgdW5zYWZlIHBhdGhcblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2U8Ym9vbGVhbj4ociA9PiB7XG5cdFx0XHRjb25zdCB1bnNhZmVQYXRocyA9IFtdO1xuXHRcdFx0aWYgKGlzVW5zYWZlUGF0aCkge1xuXHRcdFx0XHR1bnNhZmVQYXRocy5wdXNoKHByb2ZpbGUucGF0aCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVxdWlyZXNVbnNhZmVQYXRoKSB7XG5cdFx0XHRcdHVuc2FmZVBhdGhzLnB1c2gocmVxdWlyZXNVbnNhZmVQYXRoKTtcblx0XHRcdH1cblx0XHRcdC8vIE5vdGlmeSBhYm91dCB1bnNhZmUgcGF0aChzKS4gQXQgdGhlIHRpbWUgb2Ygd3JpdGluZywgbXVsdGlwbGUgdW5zYWZlIHBhdGhzIGlzbid0XG5cdFx0XHQvLyBwb3NzaWJsZSBzbyB0aGUgbWVzc2FnZSBpcyBvcHRpbWl6ZWQgZm9yIGEgc2luZ2xlIHBhdGguXG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd1bnNhZmVQYXRoV2FybmluZycsICdUaGlzIHRlcm1pbmFsIHByb2ZpbGUgdXNlcyBhIHBvdGVudGlhbGx5IHVuc2FmZSBwYXRoIHRoYXQgY2FuIGJlIG1vZGlmaWVkIGJ5IGFub3RoZXIgdXNlcjogezB9LiBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gdXNlIGl0PycsIGBcIiR7dW5zYWZlUGF0aHMuam9pbignLCcpfVwiYCksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgneWVzJywgJ1llcycpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gcih0cnVlKVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2FuY2VsJywgJ0NhbmNlbCcpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gcihmYWxzZSlcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0XHRFdmVudC5vbmNlKGhhbmRsZS5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRcdHIoZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVQcm9maWxlUXVpY2tQaWNrSXRlbShwcm9maWxlOiBJVGVybWluYWxQcm9maWxlKTogSVByb2ZpbGVRdWlja1BpY2tJdGVtIHtcblx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW3tcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbmZpZ3VyZVRlcm1pbmFsUHJvZmlsZUljb24pLFxuXHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdjcmVhdGVRdWlja0xhdW5jaFByb2ZpbGUnLCBcIkNvbmZpZ3VyZSBUZXJtaW5hbCBQcm9maWxlXCIpXG5cdFx0fV07XG5cdFx0Y29uc3QgaWNvbiA9IChwcm9maWxlLmljb24gJiYgVGhlbWVJY29uLmlzVGhlbWVJY29uKHByb2ZpbGUuaWNvbikpID8gcHJvZmlsZS5pY29uIDogQ29kaWNvbi50ZXJtaW5hbDtcblx0XHRjb25zdCBsYWJlbCA9IGAkKCR7aWNvbi5pZH0pICR7cHJvZmlsZS5wcm9maWxlTmFtZX1gO1xuXHRcdGNvbnN0IGZyaWVuZGx5UGF0aCA9IHByb2ZpbGUuaXNGcm9tUGF0aCA/IGJhc2VuYW1lKHByb2ZpbGUucGF0aCkgOiBwcm9maWxlLnBhdGg7XG5cdFx0Y29uc3QgY29sb3JDbGFzcyA9IGdldENvbG9yQ2xhc3MocHJvZmlsZSk7XG5cdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBbXTtcblx0XHRpZiAoY29sb3JDbGFzcykge1xuXHRcdFx0aWNvbkNsYXNzZXMucHVzaChjb2xvckNsYXNzKTtcblx0XHR9XG5cblx0XHRpZiAocHJvZmlsZS5hcmdzKSB7XG5cdFx0XHRpZiAoaXNTdHJpbmcocHJvZmlsZS5hcmdzKSkge1xuXHRcdFx0XHRyZXR1cm4geyBsYWJlbCwgZGVzY3JpcHRpb246IGAke3Byb2ZpbGUucGF0aH0gJHtwcm9maWxlLmFyZ3N9YCwgcHJvZmlsZSwgcHJvZmlsZU5hbWU6IHByb2ZpbGUucHJvZmlsZU5hbWUsIGJ1dHRvbnMsIGljb25DbGFzc2VzIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhcmdzU3RyaW5nID0gcHJvZmlsZS5hcmdzLm1hcChlID0+IHtcblx0XHRcdFx0aWYgKGUuaW5jbHVkZXMoJyAnKSkge1xuXHRcdFx0XHRcdHJldHVybiBgXCIke2UucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpfVwiYDsgLy8gQ29kZVFMIFtTTTAyMzgzXSBqcy9pbmNvbXBsZXRlLXNhbml0aXphdGlvbiBUaGlzIGlzIG9ubHkgdXNlZCBhcyBhIGxhYmVsIG9uIHRoZSBVSSBzbyB0aGlzIGlzbid0IGEgcHJvYmxlbVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlO1xuXHRcdFx0fSkuam9pbignICcpO1xuXHRcdFx0cmV0dXJuIHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBgJHtmcmllbmRseVBhdGh9ICR7YXJnc1N0cmluZ31gLCBwcm9maWxlLCBwcm9maWxlTmFtZTogcHJvZmlsZS5wcm9maWxlTmFtZSwgYnV0dG9ucywgaWNvbkNsYXNzZXMgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBmcmllbmRseVBhdGgsIHByb2ZpbGUsIHByb2ZpbGVOYW1lOiBwcm9maWxlLnByb2ZpbGVOYW1lLCBidXR0b25zLCBpY29uQ2xhc3NlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc29ydFByb2ZpbGVRdWlja1BpY2tJdGVtcyhpdGVtczogSVByb2ZpbGVRdWlja1BpY2tJdGVtW10sIGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIGl0ZW1zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChiLnByb2ZpbGVOYW1lID09PSBkZWZhdWx0UHJvZmlsZU5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYS5wcm9maWxlTmFtZSA9PT0gZGVmYXVsdFByb2ZpbGVOYW1lKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLnByb2ZpbGVOYW1lLmxvY2FsZUNvbXBhcmUoYi5wcm9maWxlTmFtZSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvZmlsZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgfCBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlO1xuXHRwcm9maWxlTmFtZTogc3RyaW5nO1xuXHRrZXlNb2RzPzogSUtleU1vZHMgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUXVpY2tQaWNrSXRlbSBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0ge1xuXHR0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2U7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUywwQkFBMEc7QUFDbkgsU0FBOEUsNkJBQXVEO0FBQ3JJLFNBQVMsZUFBZSxlQUFlLCtCQUErQjtBQUN0RSxTQUFTLG9DQUFvQztBQUM3QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQ0FBaUMsK0JBQStCO0FBR3pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMv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QUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsNEJBQTRCLFNBQWtEO0FBQ3JGLFVBQU0sVUFBK0IsQ0FBQztBQUFBLE1BQ3JDLFdBQVcsVUFBVSxZQUFZLDRCQUE0QjtBQUFBLE1BQzdELFNBQVMsSUFBSSxTQUFTLDRCQUE0Qiw0QkFBNEI7QUFBQSxJQUMvRSxDQUFDO0FBQ0QsVUFBTSxPQUFRLFFBQVEsUUFBUSxVQUFVLFlBQVksUUFBUSxJQUFJLElBQUssUUFBUSxPQUFPLFFBQVE7QUFDNUYsVUFBTSxRQUFRLEtBQUssS0FBSyxFQUFFLEtBQUssUUFBUSxXQUFXO0FBQ2xELFVBQU0sZUFBZSxRQUFRLGFBQWEsU0FBUyxRQUFRLElBQUksSUFBSSxRQUFRO0FBQzNFLFVBQU0sYUFBYSxjQUFjLE9BQU87QUFDeEMsVUFBTSxjQUFjLENBQUM7QUFDckIsUUFBSSxZQUFZO0FBQ2Ysa0JBQVksS0FBSyxVQUFVO0FBQUEsSUFDNUI7QUFFQSxRQUFJLFFBQVEsTUFBTTtBQUNqQixVQUFJLFNBQVMsUUFBUSxJQUFJLEdBQUc7QUFDM0IsZUFBTyxFQUFFLE9BQU8sYUFBYSxHQUFHLFFBQVEsSUFBSSxJQUFJLFFBQVEsSUFBSSxJQUFJLFNBQVMsYUFBYSxRQUFRLGFBQWEsU0FBUyxZQUFZO0FBQUEsTUFDakk7QUFDQSxZQUFNLGFBQWEsUUFBUSxLQUFLLElBQUksT0FBSztBQUN4QyxZQUFJLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDcEIsaUJBQU8sSUFBSSxFQUFFLFFBQVEsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUNsQztBQUNBLGVBQU87QUFBQSxNQUNSLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFDWCxhQUFPLEVBQUUsT0FBTyxhQUFhLEdBQUcsWUFBWSxJQUFJLFVBQVUsSUFBSSxTQUFTLGFBQWEsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLElBQy9IO0FBQ0EsV0FBTyxFQUFFLE9BQU8sYUFBYSxjQUFjLFNBQVMsYUFBYSxRQUFRLGFBQWEsU0FBUyxZQUFZO0FBQUEsRUFDNUc7QUFBQSxFQUVRLDJCQUEyQixPQUFnQyxvQkFBNEI7QUFDOUYsV0FBTyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDM0IsVUFBSSxFQUFFLGdCQUFnQixvQkFBb0I7QUFDekMsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLEVBQUUsZ0JBQWdCLG9CQUFvQjtBQUN6QyxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8sRUFBRSxZQUFZLGNBQWMsRUFBRSxXQUFXO0FBQUEsSUFDakQsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdSYSwyQkFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbImNvbmZpZ1Byb2ZpbGVzIl0KfQo=
