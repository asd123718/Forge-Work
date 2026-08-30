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
import * as nls from "../../../../nls.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { FileAccess } from "../../../../base/common/network.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { KeymapInfo } from "../common/keymapInfo.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { DispatchConfig, readKeyboardConfig } from "../../../../platform/keyboardLayout/common/keyboardConfig.js";
import { CachedKeyboardMapper } from "../../../../platform/keyboardLayout/common/keyboardMapper.js";
import { OS, OperatingSystem, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { WindowsKeyboardMapper } from "../common/windowsKeyboardMapper.js";
import { FallbackKeyboardMapper } from "../common/fallbackKeyboardMapper.js";
import { MacLinuxKeyboardMapper } from "../common/macLinuxKeyboardMapper.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { parse, getNodeType } from "../../../../base/common/json.js";
import * as objects from "../../../../base/common/objects.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { getKeyboardLayoutId, IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
class BrowserKeyboardMapperFactoryBase extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    this._onDidChangeKeyboardMapper = this._register(new Emitter());
    this.onDidChangeKeyboardMapper = this._onDidChangeKeyboardMapper.event;
    this.keyboardLayoutMapAllowed = navigator.keyboard !== void 0;
    this._keyboardMapper = null;
    this._initialized = false;
    this._keymapInfos = [];
    this._mru = [];
    this._activeKeymapInfo = null;
    if (navigator.keyboard && navigator.keyboard.addEventListener) {
      navigator.keyboard.addEventListener("layoutchange", () => {
        this._getBrowserKeyMapping().then((mapping) => {
          if (this.isKeyMappingActive(mapping)) {
            return;
          }
          this.setLayoutFromBrowserAPI();
        });
      });
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("keyboard")) {
        this._keyboardMapper = null;
        this._onDidChangeKeyboardMapper.fire();
      }
    }));
  }
  get activeKeymap() {
    return this._activeKeymapInfo;
  }
  get keymapInfos() {
    return this._keymapInfos;
  }
  get activeKeyboardLayout() {
    if (!this._initialized) {
      return null;
    }
    return this._activeKeymapInfo?.layout ?? null;
  }
  get activeKeyMapping() {
    if (!this._initialized) {
      return null;
    }
    return this._activeKeymapInfo?.mapping ?? null;
  }
  get keyboardLayouts() {
    return this._keymapInfos.map((keymapInfo) => keymapInfo.layout);
  }
  registerKeyboardLayout(layout) {
    this._keymapInfos.push(layout);
    this._mru = this._keymapInfos;
  }
  removeKeyboardLayout(layout) {
    let index = this._mru.indexOf(layout);
    if (index !== -1) {
      this._mru.splice(index, 1);
    }
    index = this._keymapInfos.indexOf(layout);
    if (index !== -1) {
      this._keymapInfos.splice(index, 1);
    }
  }
  getMatchedKeymapInfo(keyMapping) {
    if (!keyMapping) {
      return null;
    }
    const usStandard = this.getUSStandardLayout();
    if (usStandard) {
      let maxScore = usStandard.getScore(keyMapping);
      if (maxScore === 0) {
        return {
          result: usStandard,
          score: 0
        };
      }
      let result = usStandard;
      for (let i = 0; i < this._mru.length; i++) {
        const score = this._mru[i].getScore(keyMapping);
        if (score > maxScore) {
          if (score === 0) {
            return {
              result: this._mru[i],
              score: 0
            };
          }
          maxScore = score;
          result = this._mru[i];
        }
      }
      return {
        result,
        score: maxScore
      };
    }
    for (let i = 0; i < this._mru.length; i++) {
      if (this._mru[i].fuzzyEqual(keyMapping)) {
        return {
          result: this._mru[i],
          score: 0
        };
      }
    }
    return null;
  }
  getUSStandardLayout() {
    const usStandardLayouts = this._mru.filter((layout) => layout.layout.isUSStandard);
    if (usStandardLayouts.length) {
      return usStandardLayouts[0];
    }
    return null;
  }
  isKeyMappingActive(keymap) {
    return this._activeKeymapInfo && keymap && this._activeKeymapInfo.fuzzyEqual(keymap);
  }
  setUSKeyboardLayout() {
    this._activeKeymapInfo = this.getUSStandardLayout();
  }
  setActiveKeyMapping(keymap) {
    let keymapUpdated = false;
    const matchedKeyboardLayout = this.getMatchedKeymapInfo(keymap);
    if (matchedKeyboardLayout) {
      if (!this._activeKeymapInfo) {
        this._activeKeymapInfo = matchedKeyboardLayout.result;
        keymapUpdated = true;
      } else if (keymap) {
        if (matchedKeyboardLayout.result.getScore(keymap) > this._activeKeymapInfo.getScore(keymap)) {
          this._activeKeymapInfo = matchedKeyboardLayout.result;
          keymapUpdated = true;
        }
      }
    }
    if (!this._activeKeymapInfo) {
      this._activeKeymapInfo = this.getUSStandardLayout();
      keymapUpdated = true;
    }
    if (!this._activeKeymapInfo || !keymapUpdated) {
      return;
    }
    const index = this._mru.indexOf(this._activeKeymapInfo);
    this._mru.splice(index, 1);
    this._mru.unshift(this._activeKeymapInfo);
    this._setKeyboardData(this._activeKeymapInfo);
  }
  setActiveKeymapInfo(keymapInfo) {
    this._activeKeymapInfo = keymapInfo;
    const index = this._mru.indexOf(this._activeKeymapInfo);
    if (index === 0) {
      return;
    }
    this._mru.splice(index, 1);
    this._mru.unshift(this._activeKeymapInfo);
    this._setKeyboardData(this._activeKeymapInfo);
  }
  setLayoutFromBrowserAPI() {
    this._updateKeyboardLayoutAsync(this._initialized);
  }
  _updateKeyboardLayoutAsync(initialized, keyboardEvent) {
    if (!initialized) {
      return;
    }
    this._getBrowserKeyMapping(keyboardEvent).then((keyMap) => {
      if (this.isKeyMappingActive(keyMap)) {
        return;
      }
      this.setActiveKeyMapping(keyMap);
    });
  }
  getKeyboardMapper() {
    const config = readKeyboardConfig(this._configurationService);
    if (config.dispatch === DispatchConfig.KeyCode || !this._initialized || !this._activeKeymapInfo) {
      return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
    }
    if (!this._keyboardMapper) {
      this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._activeKeymapInfo, config.mapAltGrToCtrlAlt));
    }
    return this._keyboardMapper;
  }
  validateCurrentKeyboardMapping(keyboardEvent) {
    if (!this._initialized) {
      return;
    }
    const isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);
    if (isCurrentKeyboard) {
      return;
    }
    this._updateKeyboardLayoutAsync(true, keyboardEvent);
  }
  setKeyboardLayout(layoutName) {
    const matchedLayouts = this.keymapInfos.filter((keymapInfo) => getKeyboardLayoutId(keymapInfo.layout) === layoutName);
    if (matchedLayouts.length > 0) {
      this.setActiveKeymapInfo(matchedLayouts[0]);
    }
  }
  _setKeyboardData(keymapInfo) {
    this._initialized = true;
    this._keyboardMapper = null;
    this._onDidChangeKeyboardMapper.fire();
  }
  static _createKeyboardMapper(keymapInfo, mapAltGrToCtrlAlt) {
    const rawMapping = keymapInfo.mapping;
    const isUSStandard = !!keymapInfo.layout.isUSStandard;
    if (OS === OperatingSystem.Windows) {
      return new WindowsKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt);
    }
    if (Object.keys(rawMapping).length === 0) {
      return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
    }
    return new MacLinuxKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt, OS);
  }
  //#region Browser API
  _validateCurrentKeyboardMapping(keyboardEvent) {
    if (!this._initialized) {
      return true;
    }
    const standardKeyboardEvent = keyboardEvent;
    const currentKeymap = this._activeKeymapInfo;
    if (!currentKeymap) {
      return true;
    }
    if (standardKeyboardEvent.browserEvent.key === "Dead" || standardKeyboardEvent.browserEvent.isComposing) {
      return true;
    }
    const mapping = currentKeymap.mapping[standardKeyboardEvent.code];
    if (!mapping) {
      return false;
    }
    if (mapping.value === "") {
      if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
        setTimeout(() => {
          this._getBrowserKeyMapping().then((keymap) => {
            if (this.isKeyMappingActive(keymap)) {
              return;
            }
            this.setLayoutFromBrowserAPI();
          });
        }, 350);
      }
      return true;
    }
    const expectedValue = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey ? mapping.withShiftAltGr : standardKeyboardEvent.altKey ? mapping.withAltGr : standardKeyboardEvent.shiftKey ? mapping.withShift : mapping.value;
    const isDead = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey && mapping.withShiftAltGrIsDeadKey || standardKeyboardEvent.altKey && mapping.withAltGrIsDeadKey || standardKeyboardEvent.shiftKey && mapping.withShiftIsDeadKey || mapping.valueIsDeadKey;
    if (isDead && standardKeyboardEvent.browserEvent.key !== "Dead") {
      return false;
    }
    if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
      return false;
    }
    return true;
  }
  async _getBrowserKeyMapping(keyboardEvent) {
    if (this.keyboardLayoutMapAllowed) {
      try {
        return await navigator.keyboard.getLayoutMap().then((e) => {
          const ret = {};
          for (const key of e) {
            ret[key[0]] = {
              "value": key[1],
              "withShift": "",
              "withAltGr": "",
              "withShiftAltGr": ""
            };
          }
          return ret;
        });
      } catch {
        this.keyboardLayoutMapAllowed = false;
      }
    }
    if (keyboardEvent && !keyboardEvent.shiftKey && !keyboardEvent.altKey && !keyboardEvent.metaKey && !keyboardEvent.metaKey) {
      const ret = {};
      const standardKeyboardEvent = keyboardEvent;
      ret[standardKeyboardEvent.browserEvent.code] = {
        "value": standardKeyboardEvent.browserEvent.key,
        "withShift": "",
        "withAltGr": "",
        "withShiftAltGr": ""
      };
      const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);
      if (matchedKeyboardLayout) {
        return ret;
      }
      return null;
    }
    return null;
  }
  //#endregion
}
class BrowserKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
  constructor(configurationService, notificationService, storageService, commandService) {
    super(configurationService);
    const platform = isWindows ? "win" : isMacintosh ? "darwin" : "linux";
    import(
      /* webpackIgnore: true */
      FileAccess.asBrowserUri(`vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.${platform}.js`).path
    ).then((m) => {
      const keymapInfos = m.KeyboardLayoutContribution.INSTANCE.layoutInfos;
      this._keymapInfos.push(...keymapInfos.map((info) => new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout)));
      this._mru = this._keymapInfos;
      this._initialized = true;
      this.setLayoutFromBrowserAPI();
    });
  }
}
class UserKeyboardLayout extends Disposable {
  constructor(keyboardLayoutResource, fileService) {
    super();
    this.keyboardLayoutResource = keyboardLayoutResource;
    this.fileService = fileService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._keyboardLayout = null;
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then((changed) => {
      if (changed) {
        this._onDidChange.fire();
      }
    }), 50));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.keyboardLayoutResource))(() => this.reloadConfigurationScheduler.schedule()));
  }
  get keyboardLayout() {
    return this._keyboardLayout;
  }
  async initialize() {
    await this.reload();
  }
  async reload() {
    const existing = this._keyboardLayout;
    try {
      const content = await this.fileService.readFile(this.keyboardLayoutResource);
      const value = parse(content.value.toString());
      if (getNodeType(value) === "object") {
        const layoutInfo = value.layout;
        const mappings = value.rawMapping;
        this._keyboardLayout = KeymapInfo.createKeyboardLayoutFromDebugInfo(layoutInfo, mappings, true);
      } else {
        this._keyboardLayout = null;
      }
    } catch (e) {
      this._keyboardLayout = null;
    }
    return existing ? !objects.equals(existing, this._keyboardLayout) : true;
  }
}
let BrowserKeyboardLayoutService = class extends Disposable {
  constructor(environmentService, fileService, notificationService, storageService, commandService, configurationService) {
    super();
    this.configurationService = configurationService;
    this._onDidChangeKeyboardLayout = this._register(new Emitter());
    this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
    const keyboardConfig = configurationService.getValue("keyboard");
    const layout = keyboardConfig.layout;
    this._keyboardLayoutMode = layout ?? "autodetect";
    this._factory = new BrowserKeyboardMapperFactory(configurationService, notificationService, storageService, commandService);
    this._register(this._factory.onDidChangeKeyboardMapper(() => {
      this._onDidChangeKeyboardLayout.fire();
    }));
    if (layout && layout !== "autodetect") {
      this._factory.setKeyboardLayout(layout);
    }
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("keyboard.layout")) {
        const keyboardConfig2 = configurationService.getValue("keyboard");
        const layout2 = keyboardConfig2.layout;
        this._keyboardLayoutMode = layout2;
        if (layout2 === "autodetect") {
          this._factory.setLayoutFromBrowserAPI();
        } else {
          this._factory.setKeyboardLayout(layout2);
        }
      }
    }));
    this._userKeyboardLayout = new UserKeyboardLayout(environmentService.keyboardLayoutResource, fileService);
    this._userKeyboardLayout.initialize().then(() => {
      if (this._userKeyboardLayout.keyboardLayout) {
        this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
        this.setUserKeyboardLayoutIfMatched();
      }
    });
    this._register(this._userKeyboardLayout.onDidChange(() => {
      const userKeyboardLayouts = this._factory.keymapInfos.filter((layout2) => layout2.isUserKeyboardLayout);
      if (userKeyboardLayouts.length) {
        if (this._userKeyboardLayout.keyboardLayout) {
          userKeyboardLayouts[0].update(this._userKeyboardLayout.keyboardLayout);
        } else {
          this._factory.removeKeyboardLayout(userKeyboardLayouts[0]);
        }
      } else {
        if (this._userKeyboardLayout.keyboardLayout) {
          this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
        }
      }
      this.setUserKeyboardLayoutIfMatched();
    }));
  }
  setUserKeyboardLayoutIfMatched() {
    const keyboardConfig = this.configurationService.getValue("keyboard");
    const layout = keyboardConfig.layout;
    if (layout && this._userKeyboardLayout.keyboardLayout) {
      if (getKeyboardLayoutId(this._userKeyboardLayout.keyboardLayout.layout) === layout && this._factory.activeKeymap) {
        if (!this._userKeyboardLayout.keyboardLayout.equal(this._factory.activeKeymap)) {
          this._factory.setActiveKeymapInfo(this._userKeyboardLayout.keyboardLayout);
        }
      }
    }
  }
  getKeyboardMapper() {
    return this._factory.getKeyboardMapper();
  }
  getCurrentKeyboardLayout() {
    return this._factory.activeKeyboardLayout;
  }
  getAllKeyboardLayouts() {
    return this._factory.keyboardLayouts;
  }
  getRawKeyboardMapping() {
    return this._factory.activeKeyMapping;
  }
  validateCurrentKeyboardMapping(keyboardEvent) {
    if (this._keyboardLayoutMode !== "autodetect") {
      return;
    }
    this._factory.validateCurrentKeyboardMapping(keyboardEvent);
  }
};
BrowserKeyboardLayoutService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService)
], BrowserKeyboardLayoutService);
registerSingleton(IKeyboardLayoutService, BrowserKeyboardLayoutService, InstantiationType.Delayed);
const configurationRegistry = Registry.as(ConfigExtensions.Configuration);
const keyboardConfiguration = {
  "id": "keyboard",
  "order": 15,
  "type": "object",
  "title": nls.localize("keyboardConfigurationTitle", "Keyboard"),
  "properties": {
    "keyboard.layout": {
      "type": "string",
      "default": "autodetect",
      "description": nls.localize("keyboard.layout.config", "Control the keyboard layout used in web.")
    }
  }
};
configurationRegistry.registerConfiguration(keyboardConfiguration);
export {
  BrowserKeyboardLayoutService,
  BrowserKeyboardMapperFactory,
  BrowserKeyboardMapperFactoryBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxicm93c2VyXFxrZXlib2FyZExheW91dFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQXBwUmVzb3VyY2VQYXRoLCBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEtleW1hcEluZm8sIElSYXdNaXhlZEtleWJvYXJkTWFwcGluZywgSUtleW1hcEluZm8gfSBmcm9tICcuLi9jb21tb24va2V5bWFwSW5mby5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IERpc3BhdGNoQ29uZmlnLCByZWFkS2V5Ym9hcmRDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRDb25maWcuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkTWFwcGVyLCBDYWNoZWRLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBPUywgT3BlcmF0aW5nU3lzdGVtLCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgV2luZG93c0tleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vY29tbW9uL3dpbmRvd3NLZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBGYWxsYmFja0tleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vY29tbW9uL2ZhbGxiYWNrS2V5Ym9hcmRNYXBwZXIuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIgfSBmcm9tICcuLi9jb21tb24vbWFjTGludXhLZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBwYXJzZSwgZ2V0Tm9kZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlnRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgSUNvbmZpZ3VyYXRpb25Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5hdmlnYXRvcldpdGhLZXlib2FyZCB9IGZyb20gJy4vbmF2aWdhdG9yS2V5Ym9hcmQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBnZXRLZXlib2FyZExheW91dElkLCBJS2V5Ym9hcmRMYXlvdXRJbmZvLCBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLCBJS2V5Ym9hcmRNYXBwaW5nLCBJTWFjTGludXhLZXlib2FyZE1hcHBpbmcsIElXaW5kb3dzS2V5Ym9hcmRNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTGF5b3V0LmpzJztcblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJLZXlib2FyZE1hcHBlckZhY3RvcnlCYXNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8vIGtleWJvYXJkIG1hcHBlclxuXHRwcm90ZWN0ZWQgX2luaXRpYWxpemVkOiBib29sZWFuO1xuXHRwcm90ZWN0ZWQgX2tleWJvYXJkTWFwcGVyOiBJS2V5Ym9hcmRNYXBwZXIgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUtleWJvYXJkTWFwcGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUtleWJvYXJkTWFwcGVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlS2V5Ym9hcmRNYXBwZXIuZXZlbnQ7XG5cblx0Ly8ga2V5bWFwIGluZm9zXG5cdHByb3RlY3RlZCBfa2V5bWFwSW5mb3M6IEtleW1hcEluZm9bXTtcblx0cHJvdGVjdGVkIF9tcnU6IEtleW1hcEluZm9bXTtcblx0cHJpdmF0ZSBfYWN0aXZlS2V5bWFwSW5mbzogS2V5bWFwSW5mbyB8IG51bGw7XG5cdHByaXZhdGUga2V5Ym9hcmRMYXlvdXRNYXBBbGxvd2VkOiBib29sZWFuID0gKG5hdmlnYXRvciBhcyBJTmF2aWdhdG9yV2l0aEtleWJvYXJkKS5rZXlib2FyZCAhPT0gdW5kZWZpbmVkO1xuXG5cdGdldCBhY3RpdmVLZXltYXAoKTogS2V5bWFwSW5mbyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVLZXltYXBJbmZvO1xuXHR9XG5cblx0Z2V0IGtleW1hcEluZm9zKCk6IEtleW1hcEluZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleW1hcEluZm9zO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUtleWJvYXJkTGF5b3V0KCk6IElLZXlib2FyZExheW91dEluZm8gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlS2V5bWFwSW5mbz8ubGF5b3V0ID8/IG51bGw7XG5cdH1cblxuXHRnZXQgYWN0aXZlS2V5TWFwcGluZygpOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9pbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUtleW1hcEluZm8/Lm1hcHBpbmcgPz8gbnVsbDtcblx0fVxuXG5cdGdldCBrZXlib2FyZExheW91dHMoKTogSUtleWJvYXJkTGF5b3V0SW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5bWFwSW5mb3MubWFwKGtleW1hcEluZm8gPT4ga2V5bWFwSW5mby5sYXlvdXQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0Ly8gcHJpdmF0ZSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0Ly8gcHJpdmF0ZSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHQvLyBwcml2YXRlIF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fa2V5Ym9hcmRNYXBwZXIgPSBudWxsO1xuXHRcdHRoaXMuX2luaXRpYWxpemVkID0gZmFsc2U7XG5cdFx0dGhpcy5fa2V5bWFwSW5mb3MgPSBbXTtcblx0XHR0aGlzLl9tcnUgPSBbXTtcblx0XHR0aGlzLl9hY3RpdmVLZXltYXBJbmZvID0gbnVsbDtcblxuXHRcdGlmICgoPElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQ+bmF2aWdhdG9yKS5rZXlib2FyZCAmJiAoPElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQ+bmF2aWdhdG9yKS5rZXlib2FyZC5hZGRFdmVudExpc3RlbmVyKSB7XG5cdFx0XHQoPElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQ+bmF2aWdhdG9yKS5rZXlib2FyZC5hZGRFdmVudExpc3RlbmVyISgnbGF5b3V0Y2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBVcGRhdGUgdXNlciBrZXlib2FyZCBtYXAgc2V0dGluZ3Ncblx0XHRcdFx0dGhpcy5fZ2V0QnJvd3NlcktleU1hcHBpbmcoKS50aGVuKChtYXBwaW5nOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzS2V5TWFwcGluZ0FjdGl2ZShtYXBwaW5nKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuc2V0TGF5b3V0RnJvbUJyb3dzZXJBUEkoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdrZXlib2FyZCcpKSB7XG5cdFx0XHRcdHRoaXMuX2tleWJvYXJkTWFwcGVyID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VLZXlib2FyZE1hcHBlci5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJLZXlib2FyZExheW91dChsYXlvdXQ6IEtleW1hcEluZm8pIHtcblx0XHR0aGlzLl9rZXltYXBJbmZvcy5wdXNoKGxheW91dCk7XG5cdFx0dGhpcy5fbXJ1ID0gdGhpcy5fa2V5bWFwSW5mb3M7XG5cdH1cblxuXHRyZW1vdmVLZXlib2FyZExheW91dChsYXlvdXQ6IEtleW1hcEluZm8pOiB2b2lkIHtcblx0XHRsZXQgaW5kZXggPSB0aGlzLl9tcnUuaW5kZXhPZihsYXlvdXQpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX21ydS5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0XHRpbmRleCA9IHRoaXMuX2tleW1hcEluZm9zLmluZGV4T2YobGF5b3V0KTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9rZXltYXBJbmZvcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdGdldE1hdGNoZWRLZXltYXBJbmZvKGtleU1hcHBpbmc6IElLZXlib2FyZE1hcHBpbmcgfCBudWxsKTogeyByZXN1bHQ6IEtleW1hcEluZm87IHNjb3JlOiBudW1iZXIgfSB8IG51bGwge1xuXHRcdGlmICgha2V5TWFwcGluZykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNTdGFuZGFyZCA9IHRoaXMuZ2V0VVNTdGFuZGFyZExheW91dCgpO1xuXG5cdFx0aWYgKHVzU3RhbmRhcmQpIHtcblx0XHRcdGxldCBtYXhTY29yZSA9IHVzU3RhbmRhcmQuZ2V0U2NvcmUoa2V5TWFwcGluZyk7XG5cdFx0XHRpZiAobWF4U2NvcmUgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZXN1bHQ6IHVzU3RhbmRhcmQsXG5cdFx0XHRcdFx0c2NvcmU6IDBcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc3VsdCA9IHVzU3RhbmRhcmQ7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX21ydS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzY29yZSA9IHRoaXMuX21ydVtpXS5nZXRTY29yZShrZXlNYXBwaW5nKTtcblx0XHRcdFx0aWYgKHNjb3JlID4gbWF4U2NvcmUpIHtcblx0XHRcdFx0XHRpZiAoc2NvcmUgPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdDogdGhpcy5fbXJ1W2ldLFxuXHRcdFx0XHRcdFx0XHRzY29yZTogMFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRtYXhTY29yZSA9IHNjb3JlO1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRoaXMuX21ydVtpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdHNjb3JlOiBtYXhTY29yZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX21ydS5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMuX21ydVtpXS5mdXp6eUVxdWFsKGtleU1hcHBpbmcpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzdWx0OiB0aGlzLl9tcnVbaV0sXG5cdFx0XHRcdFx0c2NvcmU6IDBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldFVTU3RhbmRhcmRMYXlvdXQoKSB7XG5cdFx0Y29uc3QgdXNTdGFuZGFyZExheW91dHMgPSB0aGlzLl9tcnUuZmlsdGVyKGxheW91dCA9PiBsYXlvdXQubGF5b3V0LmlzVVNTdGFuZGFyZCk7XG5cblx0XHRpZiAodXNTdGFuZGFyZExheW91dHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdXNTdGFuZGFyZExheW91dHNbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRpc0tleU1hcHBpbmdBY3RpdmUoa2V5bWFwOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCkge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVLZXltYXBJbmZvICYmIGtleW1hcCAmJiB0aGlzLl9hY3RpdmVLZXltYXBJbmZvLmZ1enp5RXF1YWwoa2V5bWFwKTtcblx0fVxuXG5cdHNldFVTS2V5Ym9hcmRMYXlvdXQoKSB7XG5cdFx0dGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA9IHRoaXMuZ2V0VVNTdGFuZGFyZExheW91dCgpO1xuXHR9XG5cblx0c2V0QWN0aXZlS2V5TWFwcGluZyhrZXltYXA6IElLZXlib2FyZE1hcHBpbmcgfCBudWxsKSB7XG5cdFx0bGV0IGtleW1hcFVwZGF0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBtYXRjaGVkS2V5Ym9hcmRMYXlvdXQgPSB0aGlzLmdldE1hdGNoZWRLZXltYXBJbmZvKGtleW1hcCk7XG5cdFx0aWYgKG1hdGNoZWRLZXlib2FyZExheW91dCkge1xuXHRcdFx0Ly8gbGV0IHNjb3JlID0gbWF0Y2hlZEtleWJvYXJkTGF5b3V0LnNjb3JlO1xuXG5cdFx0XHQvLyBEdWUgdG8gaHR0cHM6Ly9idWdzLmNocm9taXVtLm9yZy9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9OTc3NjA5LCBhbnkga2V5IGFmdGVyIGEgZGVhZCBrZXkgd2lsbCBnZW5lcmF0ZSBhIHdyb25nIG1hcHBpbmcsXG5cdFx0XHQvLyB3ZSBzaG91ZCBhdm9pZCB5aWVsZGluZyB0aGUgZmFsc2UgZXJyb3IuXG5cdFx0XHQvLyBpZiAoa2V5bWFwICYmIHNjb3JlIDwgMCkge1xuXHRcdFx0Ly8gY29uc3QgZG9ub3RBc2tVcGRhdGVLZXkgPSAnbWlzc2luZy5rZXlib2FyZGxheW91dC5kb25vdGFzayc7XG5cdFx0XHQvLyBpZiAodGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihkb25vdEFza1VwZGF0ZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSkge1xuXHRcdFx0Ly8gXHRyZXR1cm47XG5cdFx0XHQvLyB9XG5cblx0XHRcdC8vIHRoZSBrZXlib2FyZCBsYXlvdXQgZG9lc24ndCBhY3R1YWxseSBtYXRjaCB0aGUga2V5IGV2ZW50IG9yIHRoZSBrZXltYXAgZnJvbSBjaHJvbWl1bVxuXHRcdFx0Ly8gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHQvLyBcdFNldmVyaXR5LkluZm8sXG5cdFx0XHQvLyBcdG5scy5sb2NhbGl6ZSgnbWlzc2luZy5rZXlib2FyZGxheW91dCcsICdGYWlsIHRvIGZpbmQgbWF0Y2hpbmcga2V5Ym9hcmQgbGF5b3V0JyksXG5cdFx0XHQvLyBcdFt7XG5cdFx0XHQvLyBcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRMYXlvdXRNaXNzaW5nLmNvbmZpZ3VyZScsIFwiQ29uZmlndXJlXCIpLFxuXHRcdFx0Ly8gXHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbktleWJvYXJkTGF5b3V0UGlja2VyJylcblx0XHRcdC8vIFx0fSwge1xuXHRcdFx0Ly8gXHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ25ldmVyQWdhaW4nLCBcIkRvbid0IFNob3cgQWdhaW5cIiksXG5cdFx0XHQvLyBcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHQvLyBcdFx0cnVuOiAoKSA9PiB0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShkb25vdEFza1VwZGF0ZUtleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKVxuXHRcdFx0Ly8gXHR9XVxuXHRcdFx0Ly8gKTtcblxuXHRcdFx0Ly8gY29uc29sZS53YXJuKCdBY3RpdmUga2V5bWFwL2tleWV2ZW50IGRvZXMgbm90IG1hdGNoIGN1cnJlbnQga2V5Ym9hcmQgbGF5b3V0JywgSlNPTi5zdHJpbmdpZnkoa2V5bWFwKSwgdGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA/IEpTT04uc3RyaW5naWZ5KHRoaXMuX2FjdGl2ZUtleW1hcEluZm8ubGF5b3V0KSA6ICcnKTtcblxuXHRcdFx0Ly8gcmV0dXJuO1xuXHRcdFx0Ly8gfVxuXG5cdFx0XHRpZiAoIXRoaXMuX2FjdGl2ZUtleW1hcEluZm8pIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA9IG1hdGNoZWRLZXlib2FyZExheW91dC5yZXN1bHQ7XG5cdFx0XHRcdGtleW1hcFVwZGF0ZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChrZXltYXApIHtcblx0XHRcdFx0aWYgKG1hdGNoZWRLZXlib2FyZExheW91dC5yZXN1bHQuZ2V0U2NvcmUoa2V5bWFwKSA+IHRoaXMuX2FjdGl2ZUtleW1hcEluZm8uZ2V0U2NvcmUoa2V5bWFwKSkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZUtleW1hcEluZm8gPSBtYXRjaGVkS2V5Ym9hcmRMYXlvdXQucmVzdWx0O1xuXHRcdFx0XHRcdGtleW1hcFVwZGF0ZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVLZXltYXBJbmZvKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVLZXltYXBJbmZvID0gdGhpcy5nZXRVU1N0YW5kYXJkTGF5b3V0KCk7XG5cdFx0XHRrZXltYXBVcGRhdGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2FjdGl2ZUtleW1hcEluZm8gfHwgIWtleW1hcFVwZGF0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX21ydS5pbmRleE9mKHRoaXMuX2FjdGl2ZUtleW1hcEluZm8pO1xuXG5cdFx0dGhpcy5fbXJ1LnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5fbXJ1LnVuc2hpZnQodGhpcy5fYWN0aXZlS2V5bWFwSW5mbyk7XG5cblx0XHR0aGlzLl9zZXRLZXlib2FyZERhdGEodGhpcy5fYWN0aXZlS2V5bWFwSW5mbyk7XG5cdH1cblxuXHRzZXRBY3RpdmVLZXltYXBJbmZvKGtleW1hcEluZm86IEtleW1hcEluZm8pIHtcblx0XHR0aGlzLl9hY3RpdmVLZXltYXBJbmZvID0ga2V5bWFwSW5mbztcblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbXJ1LmluZGV4T2YodGhpcy5fYWN0aXZlS2V5bWFwSW5mbyk7XG5cblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tcnUuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLl9tcnUudW5zaGlmdCh0aGlzLl9hY3RpdmVLZXltYXBJbmZvKTtcblxuXHRcdHRoaXMuX3NldEtleWJvYXJkRGF0YSh0aGlzLl9hY3RpdmVLZXltYXBJbmZvKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRMYXlvdXRGcm9tQnJvd3NlckFQSSgpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVLZXlib2FyZExheW91dEFzeW5jKHRoaXMuX2luaXRpYWxpemVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUtleWJvYXJkTGF5b3V0QXN5bmMoaW5pdGlhbGl6ZWQ6IGJvb2xlYW4sIGtleWJvYXJkRXZlbnQ/OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlmICghaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9nZXRCcm93c2VyS2V5TWFwcGluZyhrZXlib2FyZEV2ZW50KS50aGVuKGtleU1hcCA9PiB7XG5cdFx0XHQvLyBtaWdodCBiZSBmYWxzZSBwb3NpdGl2ZVxuXHRcdFx0aWYgKHRoaXMuaXNLZXlNYXBwaW5nQWN0aXZlKGtleU1hcCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXRBY3RpdmVLZXlNYXBwaW5nKGtleU1hcCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0S2V5Ym9hcmRNYXBwZXIoKTogSUtleWJvYXJkTWFwcGVyIHtcblx0XHRjb25zdCBjb25maWcgPSByZWFkS2V5Ym9hcmRDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWcuZGlzcGF0Y2ggPT09IERpc3BhdGNoQ29uZmlnLktleUNvZGUgfHwgIXRoaXMuX2luaXRpYWxpemVkIHx8ICF0aGlzLl9hY3RpdmVLZXltYXBJbmZvKSB7XG5cdFx0XHQvLyBGb3JjZWZ1bGx5IHNldCB0byB1c2Uga2V5Q29kZVxuXHRcdFx0cmV0dXJuIG5ldyBGYWxsYmFja0tleWJvYXJkTWFwcGVyKGNvbmZpZy5tYXBBbHRHclRvQ3RybEFsdCwgT1MpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2tleWJvYXJkTWFwcGVyKSB7XG5cdFx0XHR0aGlzLl9rZXlib2FyZE1hcHBlciA9IG5ldyBDYWNoZWRLZXlib2FyZE1hcHBlcihCcm93c2VyS2V5Ym9hcmRNYXBwZXJGYWN0b3J5Ll9jcmVhdGVLZXlib2FyZE1hcHBlcih0aGlzLl9hY3RpdmVLZXltYXBJbmZvLCBjb25maWcubWFwQWx0R3JUb0N0cmxBbHQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2tleWJvYXJkTWFwcGVyO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlQ3VycmVudEtleWJvYXJkTWFwcGluZyhrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0N1cnJlbnRLZXlib2FyZCA9IHRoaXMuX3ZhbGlkYXRlQ3VycmVudEtleWJvYXJkTWFwcGluZyhrZXlib2FyZEV2ZW50KTtcblxuXHRcdGlmIChpc0N1cnJlbnRLZXlib2FyZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUtleWJvYXJkTGF5b3V0QXN5bmModHJ1ZSwga2V5Ym9hcmRFdmVudCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0S2V5Ym9hcmRMYXlvdXQobGF5b3V0TmFtZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbWF0Y2hlZExheW91dHM6IEtleW1hcEluZm9bXSA9IHRoaXMua2V5bWFwSW5mb3MuZmlsdGVyKGtleW1hcEluZm8gPT4gZ2V0S2V5Ym9hcmRMYXlvdXRJZChrZXltYXBJbmZvLmxheW91dCkgPT09IGxheW91dE5hbWUpO1xuXG5cdFx0aWYgKG1hdGNoZWRMYXlvdXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlS2V5bWFwSW5mbyhtYXRjaGVkTGF5b3V0c1swXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0S2V5Ym9hcmREYXRhKGtleW1hcEluZm86IEtleW1hcEluZm8pOiB2b2lkIHtcblx0XHR0aGlzLl9pbml0aWFsaXplZCA9IHRydWU7XG5cblx0XHR0aGlzLl9rZXlib2FyZE1hcHBlciA9IG51bGw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VLZXlib2FyZE1hcHBlci5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlS2V5Ym9hcmRNYXBwZXIoa2V5bWFwSW5mbzogS2V5bWFwSW5mbywgbWFwQWx0R3JUb0N0cmxBbHQ6IGJvb2xlYW4pOiBJS2V5Ym9hcmRNYXBwZXIge1xuXHRcdGNvbnN0IHJhd01hcHBpbmcgPSBrZXltYXBJbmZvLm1hcHBpbmc7XG5cdFx0Y29uc3QgaXNVU1N0YW5kYXJkID0gISFrZXltYXBJbmZvLmxheW91dC5pc1VTU3RhbmRhcmQ7XG5cdFx0aWYgKE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIG5ldyBXaW5kb3dzS2V5Ym9hcmRNYXBwZXIoaXNVU1N0YW5kYXJkLCA8SVdpbmRvd3NLZXlib2FyZE1hcHBpbmc+cmF3TWFwcGluZywgbWFwQWx0R3JUb0N0cmxBbHQpO1xuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXMocmF3TWFwcGluZykubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBMb29rcyBsaWtlIHJlYWRpbmcgdGhlIG1hcHBpbmdzIGZhaWxlZCAobW9zdCBsaWtlbHkgTWFjICsgSmFwYW5lc2UvQ2hpbmVzZSBrZXlib2FyZCBsYXlvdXRzKVxuXHRcdFx0cmV0dXJuIG5ldyBGYWxsYmFja0tleWJvYXJkTWFwcGVyKG1hcEFsdEdyVG9DdHJsQWx0LCBPUyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBNYWNMaW51eEtleWJvYXJkTWFwcGVyKGlzVVNTdGFuZGFyZCwgPElNYWNMaW51eEtleWJvYXJkTWFwcGluZz5yYXdNYXBwaW5nLCBtYXBBbHRHclRvQ3RybEFsdCwgT1MpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEJyb3dzZXIgQVBJXG5cdHByaXZhdGUgX3ZhbGlkYXRlQ3VycmVudEtleWJvYXJkTWFwcGluZyhrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IGtleWJvYXJkRXZlbnQgYXMgU3RhbmRhcmRLZXlib2FyZEV2ZW50O1xuXHRcdGNvbnN0IGN1cnJlbnRLZXltYXAgPSB0aGlzLl9hY3RpdmVLZXltYXBJbmZvO1xuXHRcdGlmICghY3VycmVudEtleW1hcCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQua2V5ID09PSAnRGVhZCcgfHwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LmJyb3dzZXJFdmVudC5pc0NvbXBvc2luZykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFwcGluZyA9IGN1cnJlbnRLZXltYXAubWFwcGluZ1tzdGFuZGFyZEtleWJvYXJkRXZlbnQuY29kZV07XG5cblx0XHRpZiAoIW1hcHBpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAobWFwcGluZy52YWx1ZSA9PT0gJycpIHtcblx0XHRcdC8vIFRoZSB2YWx1ZSBpcyBlbXB0eSB3aGVuIHRoZSBrZXkgaXMgbm90IGEgcHJpbnRhYmxlIGNoYXJhY3Rlciwgd2Ugc2tpcCB2YWxpZGF0aW9uLlxuXHRcdFx0aWYgKGtleWJvYXJkRXZlbnQuY3RybEtleSB8fCBrZXlib2FyZEV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZ2V0QnJvd3NlcktleU1hcHBpbmcoKS50aGVuKChrZXltYXA6IElSYXdNaXhlZEtleWJvYXJkTWFwcGluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmlzS2V5TWFwcGluZ0FjdGl2ZShrZXltYXApKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5zZXRMYXlvdXRGcm9tQnJvd3NlckFQSSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LCAzNTApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwZWN0ZWRWYWx1ZSA9IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5hbHRLZXkgJiYgc3RhbmRhcmRLZXlib2FyZEV2ZW50LnNoaWZ0S2V5ID8gbWFwcGluZy53aXRoU2hpZnRBbHRHciA6XG5cdFx0XHRzdGFuZGFyZEtleWJvYXJkRXZlbnQuYWx0S2V5ID8gbWFwcGluZy53aXRoQWx0R3IgOlxuXHRcdFx0XHRzdGFuZGFyZEtleWJvYXJkRXZlbnQuc2hpZnRLZXkgPyBtYXBwaW5nLndpdGhTaGlmdCA6IG1hcHBpbmcudmFsdWU7XG5cblx0XHRjb25zdCBpc0RlYWQgPSAoc3RhbmRhcmRLZXlib2FyZEV2ZW50LmFsdEtleSAmJiBzdGFuZGFyZEtleWJvYXJkRXZlbnQuc2hpZnRLZXkgJiYgbWFwcGluZy53aXRoU2hpZnRBbHRHcklzRGVhZEtleSkgfHxcblx0XHRcdChzdGFuZGFyZEtleWJvYXJkRXZlbnQuYWx0S2V5ICYmIG1hcHBpbmcud2l0aEFsdEdySXNEZWFkS2V5KSB8fFxuXHRcdFx0KHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zaGlmdEtleSAmJiBtYXBwaW5nLndpdGhTaGlmdElzRGVhZEtleSkgfHxcblx0XHRcdG1hcHBpbmcudmFsdWVJc0RlYWRLZXk7XG5cblx0XHRpZiAoaXNEZWFkICYmIHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQua2V5ICE9PSAnRGVhZCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBUT0RPLCB0aGlzIGFzc3VtcHRpb24gaXMgd3JvbmcgYXMgYGJyb3dzZXJFdmVudC5rZXlgIGRvZXNuJ3QgbmVjZXNzYXJpbHkgZXF1YWwgZXhwZWN0ZWRWYWx1ZSBmcm9tIHJlYWwga2V5bWFwXG5cdFx0aWYgKCFpc0RlYWQgJiYgc3RhbmRhcmRLZXlib2FyZEV2ZW50LmJyb3dzZXJFdmVudC5rZXkgIT09IGV4cGVjdGVkVmFsdWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEJyb3dzZXJLZXlNYXBwaW5nKGtleWJvYXJkRXZlbnQ/OiBJS2V5Ym9hcmRFdmVudCk6IFByb21pc2U8SVJhd01peGVkS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmtleWJvYXJkTGF5b3V0TWFwQWxsb3dlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IChuYXZpZ2F0b3IgYXMgSU5hdmlnYXRvcldpdGhLZXlib2FyZCkua2V5Ym9hcmQuZ2V0TGF5b3V0TWFwKCkudGhlbigoZTogYW55KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmV0OiBJS2V5Ym9hcmRNYXBwaW5nID0ge307XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZSkge1xuXHRcdFx0XHRcdFx0cmV0W2tleVswXV0gPSB7XG5cdFx0XHRcdFx0XHRcdCd2YWx1ZSc6IGtleVsxXSxcblx0XHRcdFx0XHRcdFx0J3dpdGhTaGlmdCc6ICcnLFxuXHRcdFx0XHRcdFx0XHQnd2l0aEFsdEdyJzogJycsXG5cdFx0XHRcdFx0XHRcdCd3aXRoU2hpZnRBbHRHcic6ICcnXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiByZXQ7XG5cblx0XHRcdFx0XHQvLyBjb25zdCBtYXRjaGVkS2V5Ym9hcmRMYXlvdXQgPSB0aGlzLmdldE1hdGNoZWRLZXltYXBJbmZvKHJldCk7XG5cblx0XHRcdFx0XHQvLyBpZiAobWF0Y2hlZEtleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRcdFx0Ly8gXHRyZXR1cm4gbWF0Y2hlZEtleWJvYXJkTGF5b3V0LnJlc3VsdC5tYXBwaW5nO1xuXHRcdFx0XHRcdC8vIH1cblxuXHRcdFx0XHRcdC8vIHJldHVybiBudWxsO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBnZXRMYXlvdXRNYXAgY2FuIHRocm93IGlmIGludm9rZWQgZnJvbSBhIG5lc3RlZCBicm93c2luZyBjb250ZXh0XG5cdFx0XHRcdHRoaXMua2V5Ym9hcmRMYXlvdXRNYXBBbGxvd2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChrZXlib2FyZEV2ZW50ICYmICFrZXlib2FyZEV2ZW50LnNoaWZ0S2V5ICYmICFrZXlib2FyZEV2ZW50LmFsdEtleSAmJiAha2V5Ym9hcmRFdmVudC5tZXRhS2V5ICYmICFrZXlib2FyZEV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdGNvbnN0IHJldDogSUtleWJvYXJkTWFwcGluZyA9IHt9O1xuXHRcdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0ga2V5Ym9hcmRFdmVudCBhcyBTdGFuZGFyZEtleWJvYXJkRXZlbnQ7XG5cdFx0XHRyZXRbc3RhbmRhcmRLZXlib2FyZEV2ZW50LmJyb3dzZXJFdmVudC5jb2RlXSA9IHtcblx0XHRcdFx0J3ZhbHVlJzogc3RhbmRhcmRLZXlib2FyZEV2ZW50LmJyb3dzZXJFdmVudC5rZXksXG5cdFx0XHRcdCd3aXRoU2hpZnQnOiAnJyxcblx0XHRcdFx0J3dpdGhBbHRHcic6ICcnLFxuXHRcdFx0XHQnd2l0aFNoaWZ0QWx0R3InOiAnJ1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbWF0Y2hlZEtleWJvYXJkTGF5b3V0ID0gdGhpcy5nZXRNYXRjaGVkS2V5bWFwSW5mbyhyZXQpO1xuXG5cdFx0XHRpZiAobWF0Y2hlZEtleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRcdHJldHVybiByZXQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyS2V5Ym9hcmRNYXBwZXJGYWN0b3J5IGV4dGVuZHMgQnJvd3NlcktleWJvYXJkTWFwcGVyRmFjdG9yeUJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkge1xuXHRcdC8vIHN1cGVyKG5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGxhdGZvcm0gPSBpc1dpbmRvd3MgPyAnd2luJyA6IGlzTWFjaW50b3NoID8gJ2RhcndpbicgOiAnbGludXgnO1xuXG5cdFx0aW1wb3J0KC8qIHdlYnBhY2tJZ25vcmU6IHRydWUgKi9GaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvYnJvd3Nlci9rZXlib2FyZExheW91dHMvbGF5b3V0LmNvbnRyaWJ1dGlvbi4ke3BsYXRmb3JtfS5qc2Agc2F0aXNmaWVzIEFwcFJlc291cmNlUGF0aCkucGF0aCkudGhlbigobSkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5bWFwSW5mb3M6IElLZXltYXBJbmZvW10gPSBtLktleWJvYXJkTGF5b3V0Q29udHJpYnV0aW9uLklOU1RBTkNFLmxheW91dEluZm9zO1xuXHRcdFx0dGhpcy5fa2V5bWFwSW5mb3MucHVzaCguLi5rZXltYXBJbmZvcy5tYXAoaW5mbyA9PiAobmV3IEtleW1hcEluZm8oaW5mby5sYXlvdXQsIGluZm8uc2Vjb25kYXJ5TGF5b3V0cywgaW5mby5tYXBwaW5nLCBpbmZvLmlzVXNlcktleWJvYXJkTGF5b3V0KSkpKTtcblx0XHRcdHRoaXMuX21ydSA9IHRoaXMuX2tleW1hcEluZm9zO1xuXHRcdFx0dGhpcy5faW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5zZXRMYXlvdXRGcm9tQnJvd3NlckFQSSgpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFVzZXJLZXlib2FyZExheW91dCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9rZXlib2FyZExheW91dDogS2V5bWFwSW5mbyB8IG51bGw7XG5cdGdldCBrZXlib2FyZExheW91dCgpOiBLZXltYXBJbmZvIHwgbnVsbCB7IHJldHVybiB0aGlzLl9rZXlib2FyZExheW91dDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5Ym9hcmRMYXlvdXRSZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fa2V5Ym9hcmRMYXlvdXQgPSBudWxsO1xuXG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5yZWxvYWQoKS50aGVuKGNoYW5nZWQgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pLCA1MCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgZSA9PiBlLmNvbnRhaW5zKHRoaXMua2V5Ym9hcmRMYXlvdXRSZXNvdXJjZSkpKCgpID0+IHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVsb2FkKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2tleWJvYXJkTGF5b3V0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmtleWJvYXJkTGF5b3V0UmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBwYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGdldE5vZGVUeXBlKHZhbHVlKSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHZhbHVlLmxheW91dDtcblx0XHRcdFx0Y29uc3QgbWFwcGluZ3MgPSB2YWx1ZS5yYXdNYXBwaW5nO1xuXHRcdFx0XHR0aGlzLl9rZXlib2FyZExheW91dCA9IEtleW1hcEluZm8uY3JlYXRlS2V5Ym9hcmRMYXlvdXRGcm9tRGVidWdJbmZvKGxheW91dEluZm8sIG1hcHBpbmdzLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2tleWJvYXJkTGF5b3V0ID0gbnVsbDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9rZXlib2FyZExheW91dCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4aXN0aW5nID8gIW9iamVjdHMuZXF1YWxzKGV4aXN0aW5nLCB0aGlzLl9rZXlib2FyZExheW91dCkgOiB0cnVlO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJLZXlib2FyZExheW91dFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUtleWJvYXJkTGF5b3V0U2VydmljZSB7XG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VLZXlib2FyZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VLZXlib2FyZExheW91dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUtleWJvYXJkTGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgX3VzZXJLZXlib2FyZExheW91dDogVXNlcktleWJvYXJkTGF5b3V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZhY3Rvcnk6IEJyb3dzZXJLZXlib2FyZE1hcHBlckZhY3Rvcnk7XG5cdHByaXZhdGUgX2tleWJvYXJkTGF5b3V0TW9kZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qga2V5Ym9hcmRDb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IGxheW91dDogc3RyaW5nIH0+KCdrZXlib2FyZCcpO1xuXHRcdGNvbnN0IGxheW91dCA9IGtleWJvYXJkQ29uZmlnLmxheW91dDtcblx0XHR0aGlzLl9rZXlib2FyZExheW91dE1vZGUgPSBsYXlvdXQgPz8gJ2F1dG9kZXRlY3QnO1xuXHRcdHRoaXMuX2ZhY3RvcnkgPSBuZXcgQnJvd3NlcktleWJvYXJkTWFwcGVyRmFjdG9yeShjb25maWd1cmF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZhY3Rvcnkub25EaWRDaGFuZ2VLZXlib2FyZE1hcHBlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUtleWJvYXJkTGF5b3V0LmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHRpZiAobGF5b3V0ICYmIGxheW91dCAhPT0gJ2F1dG9kZXRlY3QnKSB7XG5cdFx0XHQvLyBzZXQga2V5Ym9hcmQgbGF5b3V0XG5cdFx0XHR0aGlzLl9mYWN0b3J5LnNldEtleWJvYXJkTGF5b3V0KGxheW91dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2tleWJvYXJkLmxheW91dCcpKSB7XG5cdFx0XHRcdGNvbnN0IGtleWJvYXJkQ29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBsYXlvdXQ6IHN0cmluZyB9Pigna2V5Ym9hcmQnKTtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0ga2V5Ym9hcmRDb25maWcubGF5b3V0O1xuXHRcdFx0XHR0aGlzLl9rZXlib2FyZExheW91dE1vZGUgPSBsYXlvdXQ7XG5cblx0XHRcdFx0aWYgKGxheW91dCA9PT0gJ2F1dG9kZXRlY3QnKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmFjdG9yeS5zZXRMYXlvdXRGcm9tQnJvd3NlckFQSSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2ZhY3Rvcnkuc2V0S2V5Ym9hcmRMYXlvdXQobGF5b3V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VzZXJLZXlib2FyZExheW91dCA9IG5ldyBVc2VyS2V5Ym9hcmRMYXlvdXQoZW52aXJvbm1lbnRTZXJ2aWNlLmtleWJvYXJkTGF5b3V0UmVzb3VyY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHR0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQuaW5pdGlhbGl6ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dCkge1xuXHRcdFx0XHR0aGlzLl9mYWN0b3J5LnJlZ2lzdGVyS2V5Ym9hcmRMYXlvdXQodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KTtcblxuXHRcdFx0XHR0aGlzLnNldFVzZXJLZXlib2FyZExheW91dElmTWF0Y2hlZCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IHVzZXJLZXlib2FyZExheW91dHMgPSB0aGlzLl9mYWN0b3J5LmtleW1hcEluZm9zLmZpbHRlcihsYXlvdXQgPT4gbGF5b3V0LmlzVXNlcktleWJvYXJkTGF5b3V0KTtcblxuXHRcdFx0aWYgKHVzZXJLZXlib2FyZExheW91dHMubGVuZ3RoKSB7XG5cdFx0XHRcdGlmICh0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdFx0XHR1c2VyS2V5Ym9hcmRMYXlvdXRzWzBdLnVwZGF0ZSh0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2ZhY3RvcnkucmVtb3ZlS2V5Ym9hcmRMYXlvdXQodXNlcktleWJvYXJkTGF5b3V0c1swXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdFx0XHR0aGlzLl9mYWN0b3J5LnJlZ2lzdGVyS2V5Ym9hcmRMYXlvdXQodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldFVzZXJLZXlib2FyZExheW91dElmTWF0Y2hlZCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldFVzZXJLZXlib2FyZExheW91dElmTWF0Y2hlZCgpIHtcblx0XHRjb25zdCBrZXlib2FyZENvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBsYXlvdXQ6IHN0cmluZyB9Pigna2V5Ym9hcmQnKTtcblx0XHRjb25zdCBsYXlvdXQgPSBrZXlib2FyZENvbmZpZy5sYXlvdXQ7XG5cblx0XHRpZiAobGF5b3V0ICYmIHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dCkge1xuXHRcdFx0aWYgKGdldEtleWJvYXJkTGF5b3V0SWQodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0LmxheW91dCkgPT09IGxheW91dCAmJiB0aGlzLl9mYWN0b3J5LmFjdGl2ZUtleW1hcCkge1xuXG5cdFx0XHRcdGlmICghdGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0LmVxdWFsKHRoaXMuX2ZhY3RvcnkuYWN0aXZlS2V5bWFwKSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZhY3Rvcnkuc2V0QWN0aXZlS2V5bWFwSW5mbyh0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0S2V5Ym9hcmRNYXBwZXIoKTogSUtleWJvYXJkTWFwcGVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZmFjdG9yeS5nZXRLZXlib2FyZE1hcHBlcigpO1xuXHR9XG5cblx0cHVibGljIGdldEN1cnJlbnRLZXlib2FyZExheW91dCgpOiBJS2V5Ym9hcmRMYXlvdXRJbmZvIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZhY3RvcnkuYWN0aXZlS2V5Ym9hcmRMYXlvdXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsS2V5Ym9hcmRMYXlvdXRzKCk6IElLZXlib2FyZExheW91dEluZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZhY3Rvcnkua2V5Ym9hcmRMYXlvdXRzO1xuXHR9XG5cblx0cHVibGljIGdldFJhd0tleWJvYXJkTWFwcGluZygpOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZhY3RvcnkuYWN0aXZlS2V5TWFwcGluZztcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fa2V5Ym9hcmRMYXlvdXRNb2RlICE9PSAnYXV0b2RldGVjdCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mYWN0b3J5LnZhbGlkYXRlQ3VycmVudEtleWJvYXJkTWFwcGluZyhrZXlib2FyZEV2ZW50KTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLCBCcm93c2VyS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLy8gQ29uZmlndXJhdGlvblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlnRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcbmNvbnN0IGtleWJvYXJkQ29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHQnaWQnOiAna2V5Ym9hcmQnLFxuXHQnb3JkZXInOiAxNSxcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3RpdGxlJzogbmxzLmxvY2FsaXplKCdrZXlib2FyZENvbmZpZ3VyYXRpb25UaXRsZScsIFwiS2V5Ym9hcmRcIiksXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdCdrZXlib2FyZC5sYXlvdXQnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2RlZmF1bHQnOiAnYXV0b2RldGVjdCcsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJvYXJkLmxheW91dC5jb25maWcnLCBcIkNvbnRyb2wgdGhlIGtleWJvYXJkIGxheW91dCB1c2VkIGluIHdlYi5cIilcblx0XHR9XG5cdH1cbn07XG5cbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oa2V5Ym9hcmRDb25maWd1cmF0aW9uKTtcbiJd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
