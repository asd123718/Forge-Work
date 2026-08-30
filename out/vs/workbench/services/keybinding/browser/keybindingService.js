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
import * as browser from "../../../../base/browser/browser.js";
import { BrowserFeatures, KeyboardSupport } from "../../../../base/browser/canIUse.js";
import * as dom from "../../../../base/browser/dom.js";
import { printKeyboardEvent, printStandardKeyboardEvent, StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { UserSettingsLabelProvider } from "../../../../base/common/keybindingLabels.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { IMMUTABLE_CODE_TO_KEY_CODE, KeyCode, KeyCodeUtils, KeyMod, ScanCode, ScanCodeUtils } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import { isMacintosh, OperatingSystem, OS } from "../../../../base/common/platform.js";
import { dirname } from "../../../../base/common/resources.js";
import { isLocalizedString } from "../../../../platform/action/common/action.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { AbstractKeybindingService } from "../../../../platform/keybinding/common/abstractKeybindingService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingResolver } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResolvedKeybindingItem } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { remove } from "../../../../base/common/arrays.js";
import { commandsExtensionPoint } from "../../actions/common/menusExtensionPoint.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { IHostService } from "../../host/browser/host.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { KeybindingIO, OutputBuilder } from "../common/keybindingIO.js";
import { getAllUnboundCommands } from "./unboundCommands.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
function isValidContributedKeyBinding(keyBinding, rejects) {
  if (!keyBinding) {
    rejects.push(nls.localize("nonempty", "expected non-empty value."));
    return false;
  }
  if (typeof keyBinding.command !== "string") {
    rejects.push(nls.localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
    return false;
  }
  if (keyBinding.key && typeof keyBinding.key !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "key"));
    return false;
  }
  if (keyBinding.when && typeof keyBinding.when !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
    return false;
  }
  if (keyBinding.mac && typeof keyBinding.mac !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "mac"));
    return false;
  }
  if (keyBinding.linux && typeof keyBinding.linux !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "linux"));
    return false;
  }
  if (keyBinding.win && typeof keyBinding.win !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "win"));
    return false;
  }
  return true;
}
const keybindingType = {
  type: "object",
  default: { command: "", key: "" },
  required: ["command", "key"],
  properties: {
    command: {
      description: nls.localize("vscode.extension.contributes.keybindings.command", "Identifier of the command to run when keybinding is triggered."),
      type: "string"
    },
    args: {
      description: nls.localize("vscode.extension.contributes.keybindings.args", "Arguments to pass to the command to execute.")
    },
    key: {
      description: nls.localize("vscode.extension.contributes.keybindings.key", "Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord)."),
      type: "string"
    },
    mac: {
      description: nls.localize("vscode.extension.contributes.keybindings.mac", "Mac specific key or key sequence."),
      type: "string"
    },
    linux: {
      description: nls.localize("vscode.extension.contributes.keybindings.linux", "Linux specific key or key sequence."),
      type: "string"
    },
    win: {
      description: nls.localize("vscode.extension.contributes.keybindings.win", "Windows specific key or key sequence."),
      type: "string"
    },
    when: {
      description: nls.localize("vscode.extension.contributes.keybindings.when", "Condition when the key is active."),
      type: "string"
    }
  }
};
const keybindingsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "keybindings",
  deps: [commandsExtensionPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.keybindings", "Contributes keybindings."),
    oneOf: [
      keybindingType,
      {
        type: "array",
        items: keybindingType
      }
    ]
  }
});
const NUMPAD_PRINTABLE_SCANCODES = [
  ScanCode.NumpadDivide,
  ScanCode.NumpadMultiply,
  ScanCode.NumpadSubtract,
  ScanCode.NumpadAdd,
  ScanCode.Numpad1,
  ScanCode.Numpad2,
  ScanCode.Numpad3,
  ScanCode.Numpad4,
  ScanCode.Numpad5,
  ScanCode.Numpad6,
  ScanCode.Numpad7,
  ScanCode.Numpad8,
  ScanCode.Numpad9,
  ScanCode.Numpad0,
  ScanCode.NumpadDecimal
];
const otherMacNumpadMapping = /* @__PURE__ */ new Map();
otherMacNumpadMapping.set(ScanCode.Numpad1, KeyCode.Digit1);
otherMacNumpadMapping.set(ScanCode.Numpad2, KeyCode.Digit2);
otherMacNumpadMapping.set(ScanCode.Numpad3, KeyCode.Digit3);
otherMacNumpadMapping.set(ScanCode.Numpad4, KeyCode.Digit4);
otherMacNumpadMapping.set(ScanCode.Numpad5, KeyCode.Digit5);
otherMacNumpadMapping.set(ScanCode.Numpad6, KeyCode.Digit6);
otherMacNumpadMapping.set(ScanCode.Numpad7, KeyCode.Digit7);
otherMacNumpadMapping.set(ScanCode.Numpad8, KeyCode.Digit8);
otherMacNumpadMapping.set(ScanCode.Numpad9, KeyCode.Digit9);
otherMacNumpadMapping.set(ScanCode.Numpad0, KeyCode.Digit0);
let WorkbenchKeybindingService = class extends AbstractKeybindingService {
  constructor(contextKeyService, commandService, telemetryService, notificationService, userDataProfileService, hostService, extensionService, fileService, uriIdentityService, logService, keyboardLayoutService) {
    super(contextKeyService, commandService, telemetryService, notificationService, logService);
    this.hostService = hostService;
    this.keyboardLayoutService = keyboardLayoutService;
    this._contributions = [];
    this.isComposingGlobalContextKey = contextKeyService.createKey(EditorContextKeys.isComposing.key, false);
    this.kbsJsonSchema = new KeybindingsJsonSchema();
    this.updateKeybindingsJsonSchema();
    this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
    this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
      this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
      this.updateResolver();
    }));
    this._keybindingHoldMode = null;
    this._cachedResolver = null;
    this.userKeybindings = this._register(new UserKeybindings(userDataProfileService, uriIdentityService, fileService, logService));
    this.userKeybindings.initialize().then(() => {
      if (this.userKeybindings.keybindings.length) {
        this.updateResolver();
      }
    });
    this._register(this.userKeybindings.onDidChange(() => {
      logService.debug("User keybindings changed");
      this.updateResolver();
    }));
    keybindingsExtPoint.setHandler((extensions) => {
      const keybindings = [];
      for (const extension of extensions) {
        this._handleKeybindingsExtensionPointUser(extension.description.identifier, extension.description.isBuiltin, extension.value, extension.collector, keybindings);
      }
      KeybindingsRegistry.setExtensionKeybindings(keybindings);
      this.updateResolver();
    });
    this.updateKeybindingsJsonSchema();
    this._register(extensionService.onDidRegisterExtensions(() => this.updateKeybindingsJsonSchema()));
    this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => disposables.add(this._registerKeyListeners(window)), { window: mainWindow, disposables: this._store }));
    this._register(browser.onDidChangeFullscreen((windowId) => {
      if (windowId !== mainWindow.vscodeWindowId) {
        return;
      }
      const keyboard = navigator.keyboard;
      if (BrowserFeatures.keyboard === KeyboardSupport.None) {
        return;
      }
      if (browser.isFullscreen(mainWindow)) {
        keyboard?.lock(["Escape"]);
      } else {
        keyboard?.unlock();
      }
      this._cachedResolver = null;
      this._onDidUpdateKeybindings.fire();
    }));
  }
  dispose() {
    this._contributions.forEach((c) => c.listener?.dispose());
    this._contributions.length = 0;
    super.dispose();
  }
  _registerKeyListeners(window) {
    const disposables = new DisposableStore();
    disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_DOWN, (e) => {
      if (this._keybindingHoldMode) {
        return;
      }
      this.isComposingGlobalContextKey.set(e.isComposing);
      const keyEvent = new StandardKeyboardEvent(e);
      this._log(`/ Received  keydown event - ${printKeyboardEvent(e)}`);
      this._log(`| Converted keydown event - ${printStandardKeyboardEvent(keyEvent)}`);
      const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
      if (shouldPreventDefault) {
        keyEvent.preventDefault();
      }
      this.isComposingGlobalContextKey.set(false);
    }));
    disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_UP, (e) => {
      this._resetKeybindingHoldMode();
      this.isComposingGlobalContextKey.set(e.isComposing);
      const keyEvent = new StandardKeyboardEvent(e);
      const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
      if (shouldPreventDefault) {
        keyEvent.preventDefault();
      }
      this.isComposingGlobalContextKey.set(false);
    }));
    return disposables;
  }
  registerSchemaContribution(contribution) {
    const listener = contribution.onDidChange?.(() => this.updateKeybindingsJsonSchema());
    const entry = { listener, contribution };
    this._contributions.push(entry);
    this.updateKeybindingsJsonSchema();
    return toDisposable(() => {
      listener?.dispose();
      remove(this._contributions, entry);
      this.updateKeybindingsJsonSchema();
    });
  }
  updateKeybindingsJsonSchema() {
    this.kbsJsonSchema.updateSchema(this._contributions.flatMap((x) => x.contribution.getSchemaAdditions()));
  }
  _printKeybinding(keybinding) {
    return UserSettingsLabelProvider.toLabel(OS, keybinding.chords, (chord) => {
      if (chord instanceof KeyCodeChord) {
        return KeyCodeUtils.toString(chord.keyCode);
      }
      return ScanCodeUtils.toString(chord.scanCode);
    }) || "[null]";
  }
  _printResolvedKeybinding(resolvedKeybinding) {
    return resolvedKeybinding.getDispatchChords().map((x) => x || "[null]").join(" ");
  }
  _printResolvedKeybindings(output, input, resolvedKeybindings) {
    const padLength = 35;
    const firstRow = `${input.padStart(padLength, " ")} => `;
    if (resolvedKeybindings.length === 0) {
      output.push(`${firstRow}${"[NO BINDING]".padStart(padLength, " ")}`);
      return;
    }
    const firstRowIndentation = firstRow.length;
    const isFirst = true;
    for (const resolvedKeybinding of resolvedKeybindings) {
      if (isFirst) {
        output.push(`${firstRow}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, " ")}`);
      } else {
        output.push(`${" ".repeat(firstRowIndentation)}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, " ")}`);
      }
    }
  }
  _dumpResolveKeybindingDebugInfo() {
    const seenBindings = /* @__PURE__ */ new Set();
    const result = [];
    result.push(`Default Resolved Keybindings (unique only):`);
    for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
      if (!item.keybinding) {
        continue;
      }
      const input = this._printKeybinding(item.keybinding);
      if (seenBindings.has(input)) {
        continue;
      }
      seenBindings.add(input);
      const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
      this._printResolvedKeybindings(result, input, resolvedKeybindings);
    }
    result.push(`User Resolved Keybindings (unique only):`);
    for (const item of this.userKeybindings.keybindings) {
      if (!item.keybinding) {
        continue;
      }
      const input = item._sourceKey ?? "Impossible: missing source key, but has keybinding";
      if (seenBindings.has(input)) {
        continue;
      }
      seenBindings.add(input);
      const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
      this._printResolvedKeybindings(result, input, resolvedKeybindings);
    }
    return result.join("\n");
  }
  _dumpDebugInfo() {
    const layoutInfo = JSON.stringify(this.keyboardLayoutService.getCurrentKeyboardLayout(), null, "	");
    const mapperInfo = this._keyboardMapper.dumpDebugInfo();
    const resolvedKeybindings = this._dumpResolveKeybindingDebugInfo();
    const rawMapping = JSON.stringify(this.keyboardLayoutService.getRawKeyboardMapping(), null, "	");
    return `Layout info:
${layoutInfo}

${resolvedKeybindings}

${mapperInfo}

Raw mapping:
${rawMapping}`;
  }
  _dumpDebugInfoJSON() {
    const info = {
      layout: this.keyboardLayoutService.getCurrentKeyboardLayout(),
      rawMapping: this.keyboardLayoutService.getRawKeyboardMapping()
    };
    return JSON.stringify(info, null, "	");
  }
  enableKeybindingHoldMode(commandId) {
    if (this._currentlyDispatchingCommandId !== commandId) {
      return void 0;
    }
    this._keybindingHoldMode = new DeferredPromise();
    const focusTracker = dom.trackFocus(dom.getWindow(void 0));
    const listener = focusTracker.onDidBlur(() => this._resetKeybindingHoldMode());
    this._keybindingHoldMode.p.finally(() => {
      listener.dispose();
      focusTracker.dispose();
    });
    this._log(`+ Enabled hold-mode for ${commandId}.`);
    return this._keybindingHoldMode.p;
  }
  _resetKeybindingHoldMode() {
    if (this._keybindingHoldMode) {
      this._keybindingHoldMode?.complete();
      this._keybindingHoldMode = null;
    }
  }
  customKeybindingsCount() {
    return this.userKeybindings.keybindings.length;
  }
  updateResolver() {
    this._cachedResolver = null;
    this._onDidUpdateKeybindings.fire();
  }
  _getResolver() {
    if (!this._cachedResolver) {
      const defaults = this._resolveKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
      const overrides = this._resolveUserKeybindingItems(this.userKeybindings.keybindings, false);
      this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
    }
    return this._cachedResolver;
  }
  _documentHasFocus() {
    return this.hostService.hasFocus;
  }
  _resolveKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      const keybinding = item.keybinding;
      if (!keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
      } else {
        if (this._assertBrowserConflicts(keybinding)) {
          continue;
        }
        const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(keybinding);
        for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
          const resolvedKeybinding = resolvedKeybindings[i];
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
        }
      }
    }
    return result;
  }
  _resolveUserKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      if (!item.keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, null, false, item.systemWide);
      } else {
        const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
        for (const resolvedKeybinding of resolvedKeybindings) {
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false, item.systemWide);
        }
      }
    }
    return result;
  }
  _assertBrowserConflicts(keybinding) {
    if (BrowserFeatures.keyboard === KeyboardSupport.Always) {
      return false;
    }
    if (BrowserFeatures.keyboard === KeyboardSupport.FullScreen && browser.isFullscreen(mainWindow)) {
      return false;
    }
    for (const chord of keybinding.chords) {
      if (!chord.metaKey && !chord.altKey && !chord.ctrlKey && !chord.shiftKey) {
        continue;
      }
      const modifiersMask = KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift;
      let partModifiersMask = 0;
      if (chord.metaKey) {
        partModifiersMask |= KeyMod.CtrlCmd;
      }
      if (chord.shiftKey) {
        partModifiersMask |= KeyMod.Shift;
      }
      if (chord.altKey) {
        partModifiersMask |= KeyMod.Alt;
      }
      if (chord.ctrlKey && OS === OperatingSystem.Macintosh) {
        partModifiersMask |= KeyMod.WinCtrl;
      }
      if ((partModifiersMask & modifiersMask) === (KeyMod.CtrlCmd | KeyMod.Alt)) {
        if (chord instanceof ScanCodeChord && (chord.scanCode === ScanCode.ArrowLeft || chord.scanCode === ScanCode.ArrowRight)) {
          return true;
        }
        if (chord instanceof KeyCodeChord && (chord.keyCode === KeyCode.LeftArrow || chord.keyCode === KeyCode.RightArrow)) {
          return true;
        }
      }
      if ((partModifiersMask & modifiersMask) === KeyMod.CtrlCmd) {
        if (chord instanceof ScanCodeChord && (chord.scanCode >= ScanCode.Digit1 && chord.scanCode <= ScanCode.Digit0)) {
          return true;
        }
        if (chord instanceof KeyCodeChord && (chord.keyCode >= KeyCode.Digit0 && chord.keyCode <= KeyCode.Digit9)) {
          return true;
        }
      }
    }
    return false;
  }
  resolveKeybinding(kb) {
    return this._keyboardMapper.resolveKeybinding(kb);
  }
  resolveKeyboardEvent(keyboardEvent) {
    this.keyboardLayoutService.validateCurrentKeyboardMapping(keyboardEvent);
    return this._keyboardMapper.resolveKeyboardEvent(keyboardEvent);
  }
  resolveUserBinding(userBinding) {
    const keybinding = KeybindingParser.parseKeybinding(userBinding);
    return keybinding ? this._keyboardMapper.resolveKeybinding(keybinding) : [];
  }
  _handleKeybindingsExtensionPointUser(extensionId, isBuiltin, keybindings, collector, result) {
    if (Array.isArray(keybindings)) {
      for (let i = 0, len = keybindings.length; i < len; i++) {
        this._handleKeybinding(extensionId, isBuiltin, i + 1, keybindings[i], collector, result);
      }
    } else {
      this._handleKeybinding(extensionId, isBuiltin, 1, keybindings, collector, result);
    }
  }
  _handleKeybinding(extensionId, isBuiltin, idx, keybindings, collector, result) {
    const rejects = [];
    if (isValidContributedKeyBinding(keybindings, rejects)) {
      const rule = this._asCommandRule(extensionId, isBuiltin, idx++, keybindings);
      if (rule) {
        result.push(rule);
      }
    }
    if (rejects.length > 0) {
      collector.error(nls.localize(
        "invalid.keybindings",
        "Invalid `contributes.{0}`: {1}",
        keybindingsExtPoint.name,
        rejects.join("\n")
      ));
    }
  }
  static bindToCurrentPlatform(key, mac, linux, win) {
    if (OS === OperatingSystem.Windows && win) {
      if (win) {
        return win;
      }
    } else if (OS === OperatingSystem.Macintosh) {
      if (mac) {
        return mac;
      }
    } else {
      if (linux) {
        return linux;
      }
    }
    return key;
  }
  _asCommandRule(extensionId, isBuiltin, idx, binding) {
    const { command, args, when, key, mac, linux, win } = binding;
    const keybinding = WorkbenchKeybindingService.bindToCurrentPlatform(key, mac, linux, win);
    if (!keybinding) {
      return void 0;
    }
    let weight;
    if (isBuiltin) {
      weight = KeybindingWeight.BuiltinExtension + idx;
    } else {
      weight = KeybindingWeight.ExternalExtension + idx;
    }
    const commandAction = MenuRegistry.getCommand(command);
    const precondition = commandAction && commandAction.precondition;
    let fullWhen;
    if (when && precondition) {
      fullWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(when));
    } else if (when) {
      fullWhen = ContextKeyExpr.deserialize(when);
    } else if (precondition) {
      fullWhen = precondition;
    }
    const desc = {
      id: command,
      args,
      when: fullWhen,
      weight,
      keybinding: KeybindingParser.parseKeybinding(keybinding),
      extensionId: extensionId.value,
      isBuiltinExtension: isBuiltin
    };
    return desc;
  }
  getDefaultKeybindingsContent() {
    const resolver = this._getResolver();
    const defaultKeybindings = resolver.getDefaultKeybindings();
    const boundCommands = resolver.getDefaultBoundCommands();
    return WorkbenchKeybindingService._getDefaultKeybindings(defaultKeybindings) + "\n\n" + WorkbenchKeybindingService._getAllCommandsAsComment(boundCommands);
  }
  static _getDefaultKeybindings(defaultKeybindings) {
    const out = new OutputBuilder();
    out.writeLine("[");
    const lastIndex = defaultKeybindings.length - 1;
    defaultKeybindings.forEach((k, index) => {
      KeybindingIO.writeKeybindingItem(out, k);
      if (index !== lastIndex) {
        out.writeLine(",");
      } else {
        out.writeLine();
      }
    });
    out.writeLine("]");
    return out.toString();
  }
  static _getAllCommandsAsComment(boundCommands) {
    const unboundCommands = getAllUnboundCommands(boundCommands);
    const pretty = unboundCommands.sort().join("\n// - ");
    return "// " + nls.localize("unboundCommands", "Here are other available commands: ") + "\n// - " + pretty;
  }
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const code = ScanCodeUtils.toEnum(event.code);
    if (NUMPAD_PRINTABLE_SCANCODES.indexOf(code) !== -1) {
      if (event.keyCode === IMMUTABLE_CODE_TO_KEY_CODE[code]) {
        return true;
      }
      if (isMacintosh && event.keyCode === otherMacNumpadMapping.get(code)) {
        return true;
      }
      return false;
    }
    const keycode = IMMUTABLE_CODE_TO_KEY_CODE[code];
    if (keycode !== -1) {
      return false;
    }
    const mapping = this.keyboardLayoutService.getRawKeyboardMapping();
    if (!mapping) {
      return false;
    }
    const keyInfo = mapping[event.code];
    if (!keyInfo) {
      return false;
    }
    if (!keyInfo.value || /\s/.test(keyInfo.value)) {
      return false;
    }
    return true;
  }
};
WorkbenchKeybindingService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IKeyboardLayoutService)
], WorkbenchKeybindingService);
class UserKeybindings extends Disposable {
  constructor(userDataProfileService, uriIdentityService, fileService, logService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this._rawKeybindings = [];
    this._keybindings = [];
    this.watchDisposables = this._register(new DisposableStore());
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.watch();
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then((changed) => {
      if (changed) {
        this._onDidChange.fire();
      }
    }), 50));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.userDataProfileService.currentProfile.keybindingsResource))(() => {
      logService.debug("Keybindings file changed");
      this.reloadConfigurationScheduler.schedule();
    }));
    this._register(this.fileService.onDidRunOperation((e) => {
      if (e.operation === FileOperation.WRITE && e.resource.toString() === this.userDataProfileService.currentProfile.keybindingsResource.toString()) {
        logService.debug("Keybindings file written");
        this.reloadConfigurationScheduler.schedule();
      }
    }));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.keybindingsResource, e.profile.keybindingsResource)) {
        e.join(this.whenCurrentProfileChanged());
      }
    }));
  }
  get keybindings() {
    return this._keybindings;
  }
  async whenCurrentProfileChanged() {
    this.watch();
    this.reloadConfigurationScheduler.schedule();
  }
  watch() {
    this.watchDisposables.clear();
    this.watchDisposables.add(this.fileService.watch(dirname(this.userDataProfileService.currentProfile.keybindingsResource)));
    this.watchDisposables.add(this.fileService.watch(this.userDataProfileService.currentProfile.keybindingsResource));
  }
  async initialize() {
    await this.reload();
  }
  async reload() {
    const newKeybindings = await this.readUserKeybindings();
    if (objects.equals(this._rawKeybindings, newKeybindings)) {
      return false;
    }
    this._rawKeybindings = newKeybindings;
    this._keybindings = this._rawKeybindings.map((k) => KeybindingIO.readUserKeybindingItem(k));
    return true;
  }
  async readUserKeybindings() {
    try {
      const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.keybindingsResource);
      const value = parse(content.value.toString());
      return Array.isArray(value) ? value.filter(
        (v) => v && typeof v === "object"
        /* just typeof === object doesn't catch `null` */
      ) : [];
    } catch (e) {
      return [];
    }
  }
}
const _KeybindingsJsonSchema = class _KeybindingsJsonSchema {
  constructor() {
    this.commandsSchemas = [];
    this.commandsEnum = [];
    this.removalCommandsEnum = [];
    this.commandsEnumDescriptions = [];
    this.schema = {
      id: _KeybindingsJsonSchema.schemaId,
      type: "array",
      title: nls.localize("keybindings.json.title", "Keybindings configuration"),
      allowTrailingCommas: true,
      allowComments: true,
      definitions: {
        "editorGroupsSchema": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "groups": {
                "$ref": "#/definitions/editorGroupsSchema",
                "default": [{}, {}]
              },
              "size": {
                "type": "number",
                "default": 0.5
              }
            }
          }
        },
        "commandNames": {
          "type": "string",
          "enum": this.commandsEnum,
          "enumDescriptions": this.commandsEnumDescriptions,
          "description": nls.localize("keybindings.json.command", "Name of the command to execute")
        },
        "commandType": {
          "anyOf": [
            // repetition of this clause here and below is intentional: one is for nice diagnostics & one is for code completion
            {
              $ref: "#/definitions/commandNames"
            },
            {
              "type": "string",
              "enum": this.removalCommandsEnum,
              "enumDescriptions": this.commandsEnumDescriptions,
              "description": nls.localize("keybindings.json.removalCommand", "Name of the command to remove keyboard shortcut for")
            },
            {
              "type": "string"
            }
          ]
        },
        "commandsSchemas": {
          "allOf": this.commandsSchemas
        }
      },
      items: {
        "required": ["key"],
        "type": "object",
        "defaultSnippets": [{ "body": { "key": "$1", "command": "$2", "when": "$3" } }],
        "properties": {
          "key": {
            "type": "string",
            "description": nls.localize("keybindings.json.key", "Key or key sequence (separated by space)")
          },
          "command": {
            "anyOf": [
              {
                "if": {
                  "type": "array"
                },
                "then": {
                  "not": {
                    "type": "array"
                  },
                  "errorMessage": nls.localize("keybindings.commandsIsArray", `Incorrect type. Expected "{0}". The field 'command' does not support running multiple commands. Use command 'runCommands' to pass it multiple commands to run.`, "string")
                },
                "else": {
                  "$ref": "#/definitions/commandType"
                }
              },
              {
                "$ref": "#/definitions/commandType"
              }
            ]
          },
          "when": {
            "type": "string",
            "description": nls.localize("keybindings.json.when", "Condition when the key is active.")
          },
          "args": {
            "description": nls.localize("keybindings.json.args", "Arguments to pass to the command to execute.")
          },
          "systemWide": {
            "type": "boolean",
            "default": false,
            "markdownDescription": nls.localize("keybindings.json.systemWide", "When `true`, registers this keybinding as a system-wide (OS global) shortcut that fires even when the application is not focused. Desktop only. Only single key combinations are supported (no chords), and any `when` clause is ignored for the global trigger.")
          }
        },
        "$ref": "#/definitions/commandsSchemas"
      }
    };
    this.schemaRegistry = Registry.as(Extensions.JSONContribution);
    this.schemaRegistry.registerSchema(_KeybindingsJsonSchema.schemaId, this.schema);
  }
  // TODO@ulugbekna: can updates happen incrementally rather than rebuilding; concerns:
  // - is just appending additional schemas enough for the registry to pick them up?
  // - can `CommandsRegistry.getCommands` and `MenuRegistry.getCommands` return different values at different times? ie would just pushing new schemas from `additionalContributions` not be enough?
  updateSchema(additionalContributions) {
    this.commandsSchemas.length = 0;
    this.commandsEnum.length = 0;
    this.removalCommandsEnum.length = 0;
    this.commandsEnumDescriptions.length = 0;
    const knownCommands = /* @__PURE__ */ new Set();
    const addKnownCommand = (commandId, description) => {
      if (!/^_/.test(commandId)) {
        if (!knownCommands.has(commandId)) {
          knownCommands.add(commandId);
          this.commandsEnum.push(commandId);
          this.commandsEnumDescriptions.push(
            description === void 0 ? "" : isLocalizedString(description) ? description.value : description
          );
          this.removalCommandsEnum.push(`-${commandId}`);
        }
      }
    };
    const allCommands = CommandsRegistry.getCommands();
    for (const [commandId, command] of allCommands) {
      const commandMetadata = command.metadata;
      addKnownCommand(commandId, commandMetadata?.description ?? MenuRegistry.getCommand(commandId)?.title);
      if (!commandMetadata || !commandMetadata.args || commandMetadata.args.length !== 1 || !commandMetadata.args[0].schema) {
        continue;
      }
      const argsSchema = commandMetadata.args[0].schema;
      const argsRequired = typeof commandMetadata.args[0].isOptional !== "undefined" ? !commandMetadata.args[0].isOptional : Array.isArray(argsSchema.required) && argsSchema.required.length > 0;
      const addition = {
        "if": {
          "required": ["command"],
          "properties": {
            "command": { "const": commandId }
          }
        },
        "then": {
          "required": [].concat(argsRequired ? ["args"] : []),
          "properties": {
            "args": argsSchema
          }
        }
      };
      this.commandsSchemas.push(addition);
    }
    const menuCommands = MenuRegistry.getCommands();
    for (const commandId of menuCommands.keys()) {
      addKnownCommand(commandId);
    }
    this.commandsSchemas.push(...additionalContributions);
    this.schemaRegistry.notifySchemaChanged(_KeybindingsJsonSchema.schemaId);
  }
};
_KeybindingsJsonSchema.schemaId = "vscode://schemas/keybindings";
let KeybindingsJsonSchema = _KeybindingsJsonSchema;
registerSingleton(IKeybindingService, WorkbenchKeybindingService, InstantiationType.Eager);
export {
  WorkbenchKeybindingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxicm93c2VyXFxrZXliaW5kaW5nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG4vLyBiYXNlXG5pbXBvcnQgKiBhcyBicm93c2VyIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IEJyb3dzZXJGZWF0dXJlcywgS2V5Ym9hcmRTdXBwb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NhbklVc2UuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcHJpbnRLZXlib2FyZEV2ZW50LCBwcmludFN0YW5kYXJkS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIFR5cGVGcm9tSnNvblNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgVXNlclNldHRpbmdzTGFiZWxQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdMYWJlbHMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1BhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdQYXJzZXIuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZywgS2V5Q29kZUNob3JkLCBSZXNvbHZlZEtleWJpbmRpbmcsIFNjYW5Db2RlQ2hvcmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERSwgS2V5Q29kZSwgS2V5Q29kZVV0aWxzLCBLZXlNb2QsIFNjYW5Db2RlLCBTY2FuQ29kZVV0aWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG4vLyBwbGF0Zm9ybVxuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZywgaXNMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9hYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSwgSUtleWJvYXJkRXZlbnQsIEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nUmVzb2x2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbktleWJpbmRpbmdSdWxlLCBJS2V5YmluZGluZ0l0ZW0sIEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcbmltcG9ydCB7IElLZXlib2FyZExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRMYXlvdXQuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuXG4vLyB3b3JrYmVuY2hcbmltcG9ydCB7IHJlbW92ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBjb21tYW5kc0V4dGVuc2lvblBvaW50IH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jb21tb24vbWVudXNFeHRlbnNpb25Qb2ludC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJLZXliaW5kaW5nSXRlbSwgS2V5YmluZGluZ0lPLCBPdXRwdXRCdWlsZGVyIH0gZnJvbSAnLi4vY29tbW9uL2tleWJpbmRpbmdJTy5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmQsIElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQgfSBmcm9tICcuL25hdmlnYXRvcktleWJvYXJkLmpzJztcbmltcG9ydCB7IGdldEFsbFVuYm91bmRDb21tYW5kcyB9IGZyb20gJy4vdW5ib3VuZENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5cbmZ1bmN0aW9uIGlzVmFsaWRDb250cmlidXRlZEtleUJpbmRpbmcoa2V5QmluZGluZzogQ29udHJpYnV0ZWRLZXlCaW5kaW5nLCByZWplY3RzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRpZiAoIWtleUJpbmRpbmcpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdub25lbXB0eScsIFwiZXhwZWN0ZWQgbm9uLWVtcHR5IHZhbHVlLlwiKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2Yga2V5QmluZGluZy5jb21tYW5kICE9PSAnc3RyaW5nJykge1xuXHRcdHJlamVjdHMucHVzaChubHMubG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdjb21tYW5kJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoa2V5QmluZGluZy5rZXkgJiYgdHlwZW9mIGtleUJpbmRpbmcua2V5ICE9PSAnc3RyaW5nJykge1xuXHRcdHJlamVjdHMucHVzaChubHMubG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdrZXknKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChrZXlCaW5kaW5nLndoZW4gJiYgdHlwZW9mIGtleUJpbmRpbmcud2hlbiAhPT0gJ3N0cmluZycpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnd2hlbicpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGtleUJpbmRpbmcubWFjICYmIHR5cGVvZiBrZXlCaW5kaW5nLm1hYyAhPT0gJ3N0cmluZycpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnbWFjJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoa2V5QmluZGluZy5saW51eCAmJiB0eXBlb2Yga2V5QmluZGluZy5saW51eCAhPT0gJ3N0cmluZycpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnbGludXgnKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChrZXlCaW5kaW5nLndpbiAmJiB0eXBlb2Yga2V5QmluZGluZy53aW4gIT09ICdzdHJpbmcnKSB7XG5cdFx0cmVqZWN0cy5wdXNoKG5scy5sb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ3dpbicpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmNvbnN0IGtleWJpbmRpbmdUeXBlID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0ZGVmYXVsdDogeyBjb21tYW5kOiAnJywga2V5OiAnJyB9LFxuXHRyZXF1aXJlZDogWydjb21tYW5kJywgJ2tleSddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy5jb21tYW5kJywgJ0lkZW50aWZpZXIgb2YgdGhlIGNvbW1hbmQgdG8gcnVuIHdoZW4ga2V5YmluZGluZyBpcyB0cmlnZ2VyZWQuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0YXJnczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy5hcmdzJywgXCJBcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgY29tbWFuZCB0byBleGVjdXRlLlwiKVxuXHRcdH0sXG5cdFx0a2V5OiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzLmtleScsICdLZXkgb3Iga2V5IHNlcXVlbmNlIChzZXBhcmF0ZSBrZXlzIHdpdGggcGx1cy1zaWduIGFuZCBzZXF1ZW5jZXMgd2l0aCBzcGFjZSwgZS5nLiBDdHJsK08gYW5kIEN0cmwrTCBMIGZvciBhIGNob3JkKS4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRtYWM6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMua2V5YmluZGluZ3MubWFjJywgJ01hYyBzcGVjaWZpYyBrZXkgb3Iga2V5IHNlcXVlbmNlLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGxpbnV4OiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzLmxpbnV4JywgJ0xpbnV4IHNwZWNpZmljIGtleSBvciBrZXkgc2VxdWVuY2UuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0d2luOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzLndpbicsICdXaW5kb3dzIHNwZWNpZmljIGtleSBvciBrZXkgc2VxdWVuY2UuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0d2hlbjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy53aGVuJywgJ0NvbmRpdGlvbiB3aGVuIHRoZSBrZXkgaXMgYWN0aXZlLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHR9XG59IGFzIGNvbnN0IHNhdGlzZmllcyBJSlNPTlNjaGVtYTtcblxudHlwZSBDb250cmlidXRlZEtleUJpbmRpbmcgPSBUeXBlRnJvbUpzb25TY2hlbWE8dHlwZW9mIGtleWJpbmRpbmdUeXBlPjtcblxuY29uc3Qga2V5YmluZGluZ3NFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PENvbnRyaWJ1dGVkS2V5QmluZGluZyB8IENvbnRyaWJ1dGVkS2V5QmluZGluZ1tdPih7XG5cdGV4dGVuc2lvblBvaW50OiAna2V5YmluZGluZ3MnLFxuXHRkZXBzOiBbY29tbWFuZHNFeHRlbnNpb25Qb2ludF0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzJywgXCJDb250cmlidXRlcyBrZXliaW5kaW5ncy5cIiksXG5cdFx0b25lT2Y6IFtcblx0XHRcdGtleWJpbmRpbmdUeXBlLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczoga2V5YmluZGluZ1R5cGVcblx0XHRcdH1cblx0XHRdXG5cdH1cbn0pO1xuXG5jb25zdCBOVU1QQURfUFJJTlRBQkxFX1NDQU5DT0RFUyA9IFtcblx0U2NhbkNvZGUuTnVtcGFkRGl2aWRlLFxuXHRTY2FuQ29kZS5OdW1wYWRNdWx0aXBseSxcblx0U2NhbkNvZGUuTnVtcGFkU3VidHJhY3QsXG5cdFNjYW5Db2RlLk51bXBhZEFkZCxcblx0U2NhbkNvZGUuTnVtcGFkMSxcblx0U2NhbkNvZGUuTnVtcGFkMixcblx0U2NhbkNvZGUuTnVtcGFkMyxcblx0U2NhbkNvZGUuTnVtcGFkNCxcblx0U2NhbkNvZGUuTnVtcGFkNSxcblx0U2NhbkNvZGUuTnVtcGFkNixcblx0U2NhbkNvZGUuTnVtcGFkNyxcblx0U2NhbkNvZGUuTnVtcGFkOCxcblx0U2NhbkNvZGUuTnVtcGFkOSxcblx0U2NhbkNvZGUuTnVtcGFkMCxcblx0U2NhbkNvZGUuTnVtcGFkRGVjaW1hbFxuXTtcblxuY29uc3Qgb3RoZXJNYWNOdW1wYWRNYXBwaW5nID0gbmV3IE1hcDxTY2FuQ29kZSwgS2V5Q29kZT4oKTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkMSwgS2V5Q29kZS5EaWdpdDEpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQyLCBLZXlDb2RlLkRpZ2l0Mik7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDMsIEtleUNvZGUuRGlnaXQzKTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkNCwgS2V5Q29kZS5EaWdpdDQpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQ1LCBLZXlDb2RlLkRpZ2l0NSk7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDYsIEtleUNvZGUuRGlnaXQ2KTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkNywgS2V5Q29kZS5EaWdpdDcpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQ4LCBLZXlDb2RlLkRpZ2l0OCk7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDksIEtleUNvZGUuRGlnaXQ5KTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkMCwgS2V5Q29kZS5EaWdpdDApO1xuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoS2V5YmluZGluZ1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIHtcblxuXHRwcml2YXRlIF9rZXlib2FyZE1hcHBlcjogSUtleWJvYXJkTWFwcGVyO1xuXHRwcml2YXRlIF9jYWNoZWRSZXNvbHZlcjogS2V5YmluZGluZ1Jlc29sdmVyIHwgbnVsbDtcblx0cHJpdmF0ZSB1c2VyS2V5YmluZGluZ3M6IFVzZXJLZXliaW5kaW5ncztcblx0cHJpdmF0ZSBpc0NvbXBvc2luZ0dsb2JhbENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9rZXliaW5kaW5nSG9sZE1vZGU6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbnM6IEFycmF5PHtcblx0XHRyZWFkb25seSBsaXN0ZW5lcj86IElEaXNwb3NhYmxlO1xuXHRcdHJlYWRvbmx5IGNvbnRyaWJ1dGlvbjogS2V5YmluZGluZ3NTY2hlbWFDb250cmlidXRpb247XG5cdH0+ID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkga2JzSnNvblNjaGVtYTogS2V5YmluZGluZ3NKc29uU2NoZW1hO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5Ym9hcmRMYXlvdXRTZXJ2aWNlOiBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHRLZXlTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmlzQ29tcG9zaW5nR2xvYmFsQ29udGV4dEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShFZGl0b3JDb250ZXh0S2V5cy5pc0NvbXBvc2luZy5rZXksIGZhbHNlKTtcblxuXHRcdHRoaXMua2JzSnNvblNjaGVtYSA9IG5ldyBLZXliaW5kaW5nc0pzb25TY2hlbWEoKTtcblx0XHR0aGlzLnVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpO1xuXG5cdFx0dGhpcy5fa2V5Ym9hcmRNYXBwZXIgPSB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRLZXlib2FyZE1hcHBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlS2V5Ym9hcmRMYXlvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fa2V5Ym9hcmRNYXBwZXIgPSB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRLZXlib2FyZE1hcHBlcigpO1xuXHRcdFx0dGhpcy51cGRhdGVSZXNvbHZlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2tleWJpbmRpbmdIb2xkTW9kZSA9IG51bGw7XG5cdFx0dGhpcy5fY2FjaGVkUmVzb2x2ZXIgPSBudWxsO1xuXG5cdFx0dGhpcy51c2VyS2V5YmluZGluZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgVXNlcktleWJpbmRpbmdzKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLnVzZXJLZXliaW5kaW5ncy5pbml0aWFsaXplKCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy51c2VyS2V5YmluZGluZ3Mua2V5YmluZGluZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUmVzb2x2ZXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJLZXliaW5kaW5ncy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKCdVc2VyIGtleWJpbmRpbmdzIGNoYW5nZWQnKTtcblx0XHRcdHRoaXMudXBkYXRlUmVzb2x2ZXIoKTtcblx0XHR9KSk7XG5cblx0XHRrZXliaW5kaW5nc0V4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMpID0+IHtcblxuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3M6IElFeHRlbnNpb25LZXliaW5kaW5nUnVsZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUtleWJpbmRpbmdzRXh0ZW5zaW9uUG9pbnRVc2VyKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBleHRlbnNpb24uZGVzY3JpcHRpb24uaXNCdWlsdGluLCBleHRlbnNpb24udmFsdWUsIGV4dGVuc2lvbi5jb2xsZWN0b3IsIGtleWJpbmRpbmdzKTtcblx0XHRcdH1cblxuXHRcdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5zZXRFeHRlbnNpb25LZXliaW5kaW5ncyhrZXliaW5kaW5ncyk7XG5cdFx0XHR0aGlzLnVwZGF0ZVJlc29sdmVyKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblNlcnZpY2Uub25EaWRSZWdpc3RlckV4dGVuc2lvbnMoKCkgPT4gdGhpcy51cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGRvbS5vbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZWdpc3RlcktleUxpc3RlbmVycyh3aW5kb3cpKSwgeyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihicm93c2VyLm9uRGlkQ2hhbmdlRnVsbHNjcmVlbih3aW5kb3dJZCA9PiB7XG5cdFx0XHRpZiAod2luZG93SWQgIT09IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrZXlib2FyZDogSUtleWJvYXJkIHwgbnVsbCA9ICg8SU5hdmlnYXRvcldpdGhLZXlib2FyZD5uYXZpZ2F0b3IpLmtleWJvYXJkO1xuXG5cdFx0XHRpZiAoQnJvd3NlckZlYXR1cmVzLmtleWJvYXJkID09PSBLZXlib2FyZFN1cHBvcnQuTm9uZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChicm93c2VyLmlzRnVsbHNjcmVlbihtYWluV2luZG93KSkge1xuXHRcdFx0XHRrZXlib2FyZD8ubG9jayhbJ0VzY2FwZSddKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGtleWJvYXJkPy51bmxvY2soKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlIHJlc29sdmVyIHdoaWNoIHdpbGwgYnJpbmcgYmFjayBhbGwgdW5ib3VuZCBrZXlib2FyZCBzaG9ydGN1dHNcblx0XHRcdHRoaXMuX2NhY2hlZFJlc29sdmVyID0gbnVsbDtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlS2V5YmluZGluZ3MuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMuZm9yRWFjaChjID0+IGMubGlzdGVuZXI/LmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5sZW5ndGggPSAwO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJLZXlMaXN0ZW5lcnMod2luZG93OiBXaW5kb3cpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBmb3Igc3RhbmRhcmQga2V5YmluZGluZ3Ncblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fa2V5YmluZGluZ0hvbGRNb2RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuaXNDb21wb3NpbmdHbG9iYWxDb250ZXh0S2V5LnNldChlLmlzQ29tcG9zaW5nKTtcblx0XHRcdGNvbnN0IGtleUV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdHRoaXMuX2xvZyhgLyBSZWNlaXZlZCAga2V5ZG93biBldmVudCAtICR7cHJpbnRLZXlib2FyZEV2ZW50KGUpfWApO1xuXHRcdFx0dGhpcy5fbG9nKGB8IENvbnZlcnRlZCBrZXlkb3duIGV2ZW50IC0gJHtwcmludFN0YW5kYXJkS2V5Ym9hcmRFdmVudChrZXlFdmVudCl9YCk7XG5cdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRoaXMuX2Rpc3BhdGNoKGtleUV2ZW50LCBrZXlFdmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKHNob3VsZFByZXZlbnREZWZhdWx0KSB7XG5cdFx0XHRcdGtleUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlzQ29tcG9zaW5nR2xvYmFsQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGZvciBzaW5nbGUgbW9kaWZpZXIgY2hvcmQga2V5YmluZGluZ3MgKGUuZy4gc2hpZnQgc2hpZnQpXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9VUCwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX3Jlc2V0S2V5YmluZGluZ0hvbGRNb2RlKCk7XG5cdFx0XHR0aGlzLmlzQ29tcG9zaW5nR2xvYmFsQ29udGV4dEtleS5zZXQoZS5pc0NvbXBvc2luZyk7XG5cdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRoaXMuX3NpbmdsZU1vZGlmaWVyRGlzcGF0Y2goa2V5RXZlbnQsIGtleUV2ZW50LnRhcmdldCk7XG5cdFx0XHRpZiAoc2hvdWxkUHJldmVudERlZmF1bHQpIHtcblx0XHRcdFx0a2V5RXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuaXNDb21wb3NpbmdHbG9iYWxDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyU2NoZW1hQ29udHJpYnV0aW9uKGNvbnRyaWJ1dGlvbjogS2V5YmluZGluZ3NTY2hlbWFDb250cmlidXRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBjb250cmlidXRpb24ub25EaWRDaGFuZ2U/LigoKSA9PiB0aGlzLnVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpKTtcblx0XHRjb25zdCBlbnRyeSA9IHsgbGlzdGVuZXIsIGNvbnRyaWJ1dGlvbiB9O1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMucHVzaChlbnRyeSk7XG5cblx0XHR0aGlzLnVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0cmVtb3ZlKHRoaXMuX2NvbnRyaWJ1dGlvbnMsIGVudHJ5KTtcblx0XHRcdHRoaXMudXBkYXRlS2V5YmluZGluZ3NKc29uU2NoZW1hKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpIHtcblx0XHR0aGlzLmtic0pzb25TY2hlbWEudXBkYXRlU2NoZW1hKHRoaXMuX2NvbnRyaWJ1dGlvbnMuZmxhdE1hcCh4ID0+IHguY29udHJpYnV0aW9uLmdldFNjaGVtYUFkZGl0aW9ucygpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmludEtleWJpbmRpbmcoa2V5YmluZGluZzogS2V5YmluZGluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIudG9MYWJlbChPUywga2V5YmluZGluZy5jaG9yZHMsIChjaG9yZCkgPT4ge1xuXHRcdFx0aWYgKGNob3JkIGluc3RhbmNlb2YgS2V5Q29kZUNob3JkKSB7XG5cdFx0XHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9TdHJpbmcoY2hvcmQua2V5Q29kZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gU2NhbkNvZGVVdGlscy50b1N0cmluZyhjaG9yZC5zY2FuQ29kZSk7XG5cdFx0fSkgfHwgJ1tudWxsXSc7XG5cdH1cblxuXHRwcml2YXRlIF9wcmludFJlc29sdmVkS2V5YmluZGluZyhyZXNvbHZlZEtleWJpbmRpbmc6IFJlc29sdmVkS2V5YmluZGluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHJlc29sdmVkS2V5YmluZGluZy5nZXREaXNwYXRjaENob3JkcygpLm1hcCh4ID0+IHggfHwgJ1tudWxsXScpLmpvaW4oJyAnKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByaW50UmVzb2x2ZWRLZXliaW5kaW5ncyhvdXRwdXQ6IHN0cmluZ1tdLCBpbnB1dDogc3RyaW5nLCByZXNvbHZlZEtleWJpbmRpbmdzOiBSZXNvbHZlZEtleWJpbmRpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHBhZExlbmd0aCA9IDM1O1xuXHRcdGNvbnN0IGZpcnN0Um93ID0gYCR7aW5wdXQucGFkU3RhcnQocGFkTGVuZ3RoLCAnICcpfSA9PiBgO1xuXHRcdGlmIChyZXNvbHZlZEtleWJpbmRpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gYmluZGluZyBmb3VuZFxuXHRcdFx0b3V0cHV0LnB1c2goYCR7Zmlyc3RSb3d9JHsnW05PIEJJTkRJTkddJy5wYWRTdGFydChwYWRMZW5ndGgsICcgJyl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RSb3dJbmRlbnRhdGlvbiA9IGZpcnN0Um93Lmxlbmd0aDtcblx0XHRjb25zdCBpc0ZpcnN0ID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IHJlc29sdmVkS2V5YmluZGluZyBvZiByZXNvbHZlZEtleWJpbmRpbmdzKSB7XG5cdFx0XHRpZiAoaXNGaXJzdCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChgJHtmaXJzdFJvd30ke3RoaXMuX3ByaW50UmVzb2x2ZWRLZXliaW5kaW5nKHJlc29sdmVkS2V5YmluZGluZykucGFkU3RhcnQocGFkTGVuZ3RoLCAnICcpfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goYCR7JyAnLnJlcGVhdChmaXJzdFJvd0luZGVudGF0aW9uKX0ke3RoaXMuX3ByaW50UmVzb2x2ZWRLZXliaW5kaW5nKHJlc29sdmVkS2V5YmluZGluZykucGFkU3RhcnQocGFkTGVuZ3RoLCAnICcpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2R1bXBSZXNvbHZlS2V5YmluZGluZ0RlYnVnSW5mbygpOiBzdHJpbmcge1xuXG5cdFx0Y29uc3Qgc2VlbkJpbmRpbmdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0cmVzdWx0LnB1c2goYERlZmF1bHQgUmVzb2x2ZWQgS2V5YmluZGluZ3MgKHVuaXF1ZSBvbmx5KTpgKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgS2V5YmluZGluZ3NSZWdpc3RyeS5nZXREZWZhdWx0S2V5YmluZGluZ3MoKSkge1xuXHRcdFx0aWYgKCFpdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX3ByaW50S2V5YmluZGluZyhpdGVtLmtleWJpbmRpbmcpO1xuXHRcdFx0aWYgKHNlZW5CaW5kaW5ncy5oYXMoaW5wdXQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2VlbkJpbmRpbmdzLmFkZChpbnB1dCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoaXRlbS5rZXliaW5kaW5nKTtcblx0XHRcdHRoaXMuX3ByaW50UmVzb2x2ZWRLZXliaW5kaW5ncyhyZXN1bHQsIGlucHV0LCByZXNvbHZlZEtleWJpbmRpbmdzKTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChgVXNlciBSZXNvbHZlZCBLZXliaW5kaW5ncyAodW5pcXVlIG9ubHkpOmApO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnVzZXJLZXliaW5kaW5ncy5rZXliaW5kaW5ncykge1xuXHRcdFx0aWYgKCFpdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dCA9IGl0ZW0uX3NvdXJjZUtleSA/PyAnSW1wb3NzaWJsZTogbWlzc2luZyBzb3VyY2Uga2V5LCBidXQgaGFzIGtleWJpbmRpbmcnO1xuXHRcdFx0aWYgKHNlZW5CaW5kaW5ncy5oYXMoaW5wdXQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2VlbkJpbmRpbmdzLmFkZChpbnB1dCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoaXRlbS5rZXliaW5kaW5nKTtcblx0XHRcdHRoaXMuX3ByaW50UmVzb2x2ZWRLZXliaW5kaW5ncyhyZXN1bHQsIGlucHV0LCByZXNvbHZlZEtleWJpbmRpbmdzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHVibGljIF9kdW1wRGVidWdJbmZvKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IEpTT04uc3RyaW5naWZ5KHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldEN1cnJlbnRLZXlib2FyZExheW91dCgpLCBudWxsLCAnXFx0Jyk7XG5cdFx0Y29uc3QgbWFwcGVySW5mbyA9IHRoaXMuX2tleWJvYXJkTWFwcGVyLmR1bXBEZWJ1Z0luZm8oKTtcblx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fZHVtcFJlc29sdmVLZXliaW5kaW5nRGVidWdJbmZvKCk7XG5cdFx0Y29uc3QgcmF3TWFwcGluZyA9IEpTT04uc3RyaW5naWZ5KHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldFJhd0tleWJvYXJkTWFwcGluZygpLCBudWxsLCAnXFx0Jyk7XG5cdFx0cmV0dXJuIGBMYXlvdXQgaW5mbzpcXG4ke2xheW91dEluZm99XFxuXFxuJHtyZXNvbHZlZEtleWJpbmRpbmdzfVxcblxcbiR7bWFwcGVySW5mb31cXG5cXG5SYXcgbWFwcGluZzpcXG4ke3Jhd01hcHBpbmd9YDtcblx0fVxuXG5cdHB1YmxpYyBfZHVtcERlYnVnSW5mb0pTT04oKTogc3RyaW5nIHtcblx0XHRjb25zdCBpbmZvID0ge1xuXHRcdFx0bGF5b3V0OiB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRDdXJyZW50S2V5Ym9hcmRMYXlvdXQoKSxcblx0XHRcdHJhd01hcHBpbmc6IHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldFJhd0tleWJvYXJkTWFwcGluZygpXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoaW5mbywgbnVsbCwgJ1xcdCcpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZShjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50bHlEaXNwYXRjaGluZ0NvbW1hbmRJZCAhPT0gY29tbWFuZElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gZG9tLnRyYWNrRm9jdXMoZG9tLmdldFdpbmRvdyh1bmRlZmluZWQpKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5fcmVzZXRLZXliaW5kaW5nSG9sZE1vZGUoKSk7XG5cdFx0dGhpcy5fa2V5YmluZGluZ0hvbGRNb2RlLnAuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRmb2N1c1RyYWNrZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2xvZyhgKyBFbmFibGVkIGhvbGQtbW9kZSBmb3IgJHtjb21tYW5kSWR9LmApO1xuXHRcdHJldHVybiB0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGUucDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0S2V5YmluZGluZ0hvbGRNb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGUpIHtcblx0XHRcdHRoaXMuX2tleWJpbmRpbmdIb2xkTW9kZT8uY29tcGxldGUoKTtcblx0XHRcdHRoaXMuX2tleWJpbmRpbmdIb2xkTW9kZSA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGN1c3RvbUtleWJpbmRpbmdzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyS2V5YmluZGluZ3Mua2V5YmluZGluZ3MubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZXNvbHZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZWRSZXNvbHZlciA9IG51bGw7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVLZXliaW5kaW5ncy5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJlc29sdmVyKCk6IEtleWJpbmRpbmdSZXNvbHZlciB7XG5cdFx0aWYgKCF0aGlzLl9jYWNoZWRSZXNvbHZlcikge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLl9yZXNvbHZlS2V5YmluZGluZ0l0ZW1zKEtleWJpbmRpbmdzUmVnaXN0cnkuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCksIHRydWUpO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gdGhpcy5fcmVzb2x2ZVVzZXJLZXliaW5kaW5nSXRlbXModGhpcy51c2VyS2V5YmluZGluZ3Mua2V5YmluZGluZ3MsIGZhbHNlKTtcblx0XHRcdHRoaXMuX2NhY2hlZFJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihkZWZhdWx0cywgb3ZlcnJpZGVzLCAoc3RyKSA9PiB0aGlzLl9sb2coc3RyKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRSZXNvbHZlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBfZG9jdW1lbnRIYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHQvLyBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSBkb2N1bWVudCBoYXMgbG9zdCBmb2N1cywgYnV0IHRoZVxuXHRcdC8vIHdpbmRvdyBpcyBzdGlsbCBmb2N1c2VkLCBlLmcuIHdoZW4gYSA8d2Vidmlldz4gZWxlbWVudFxuXHRcdC8vIGhhcyBmb2N1c1xuXHRcdHJldHVybiB0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUtleWJpbmRpbmdJdGVtcyhpdGVtczogSUtleWJpbmRpbmdJdGVtW10sIGlzRGVmYXVsdDogYm9vbGVhbik6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IHdoZW4gPSBpdGVtLndoZW4gfHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGl0ZW0ua2V5YmluZGluZztcblx0XHRcdGlmICgha2V5YmluZGluZykge1xuXHRcdFx0XHQvLyBUaGlzIG1pZ2h0IGJlIGEgcmVtb3ZhbCBrZXliaW5kaW5nIGl0ZW0gaW4gdXNlciBzZXR0aW5ncyA9PiBhY2NlcHQgaXRcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHVuZGVmaW5lZCwgaXRlbS5jb21tYW5kLCBpdGVtLmNvbW1hbmRBcmdzLCB3aGVuLCBpc0RlZmF1bHQsIGl0ZW0uZXh0ZW5zaW9uSWQsIGl0ZW0uaXNCdWlsdGluRXh0ZW5zaW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hc3NlcnRCcm93c2VyQ29uZmxpY3RzKGtleWJpbmRpbmcpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZyk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSByZXNvbHZlZEtleWJpbmRpbmdzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5nID0gcmVzb2x2ZWRLZXliaW5kaW5nc1tpXTtcblx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0ocmVzb2x2ZWRLZXliaW5kaW5nLCBpdGVtLmNvbW1hbmQsIGl0ZW0uY29tbWFuZEFyZ3MsIHdoZW4sIGlzRGVmYXVsdCwgaXRlbS5leHRlbnNpb25JZCwgaXRlbS5pc0J1aWx0aW5FeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVVc2VyS2V5YmluZGluZ0l0ZW1zKGl0ZW1zOiBJVXNlcktleWJpbmRpbmdJdGVtW10sIGlzRGVmYXVsdDogYm9vbGVhbik6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IHdoZW4gPSBpdGVtLndoZW4gfHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFpdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdFx0Ly8gVGhpcyBtaWdodCBiZSBhIHJlbW92YWwga2V5YmluZGluZyBpdGVtIGluIHVzZXIgc2V0dGluZ3MgPT4gYWNjZXB0IGl0XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSh1bmRlZmluZWQsIGl0ZW0uY29tbWFuZCwgaXRlbS5jb21tYW5kQXJncywgd2hlbiwgaXNEZWZhdWx0LCBudWxsLCBmYWxzZSwgaXRlbS5zeXN0ZW1XaWRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZ3MgPSB0aGlzLl9rZXlib2FyZE1hcHBlci5yZXNvbHZlS2V5YmluZGluZyhpdGVtLmtleWJpbmRpbmcpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc29sdmVkS2V5YmluZGluZyBvZiByZXNvbHZlZEtleWJpbmRpbmdzKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHJlc29sdmVkS2V5YmluZGluZywgaXRlbS5jb21tYW5kLCBpdGVtLmNvbW1hbmRBcmdzLCB3aGVuLCBpc0RlZmF1bHQsIG51bGwsIGZhbHNlLCBpdGVtLnN5c3RlbVdpZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2Fzc2VydEJyb3dzZXJDb25mbGljdHMoa2V5YmluZGluZzogS2V5YmluZGluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChCcm93c2VyRmVhdHVyZXMua2V5Ym9hcmQgPT09IEtleWJvYXJkU3VwcG9ydC5BbHdheXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoQnJvd3NlckZlYXR1cmVzLmtleWJvYXJkID09PSBLZXlib2FyZFN1cHBvcnQuRnVsbFNjcmVlbiAmJiBicm93c2VyLmlzRnVsbHNjcmVlbihtYWluV2luZG93KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hvcmQgb2Yga2V5YmluZGluZy5jaG9yZHMpIHtcblx0XHRcdGlmICghY2hvcmQubWV0YUtleSAmJiAhY2hvcmQuYWx0S2V5ICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5zaGlmdEtleSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kaWZpZXJzTWFzayA9IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdDtcblxuXHRcdFx0bGV0IHBhcnRNb2RpZmllcnNNYXNrID0gMDtcblx0XHRcdGlmIChjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRcdHBhcnRNb2RpZmllcnNNYXNrIHw9IEtleU1vZC5DdHJsQ21kO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hvcmQuc2hpZnRLZXkpIHtcblx0XHRcdFx0cGFydE1vZGlmaWVyc01hc2sgfD0gS2V5TW9kLlNoaWZ0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRcdHBhcnRNb2RpZmllcnNNYXNrIHw9IEtleU1vZC5BbHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaG9yZC5jdHJsS2V5ICYmIE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0XHRcdHBhcnRNb2RpZmllcnNNYXNrIHw9IEtleU1vZC5XaW5DdHJsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKHBhcnRNb2RpZmllcnNNYXNrICYgbW9kaWZpZXJzTWFzaykgPT09IChLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQpKSB7XG5cdFx0XHRcdGlmIChjaG9yZCBpbnN0YW5jZW9mIFNjYW5Db2RlQ2hvcmQgJiYgKGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5BcnJvd0xlZnQgfHwgY2hvcmQuc2NhbkNvZGUgPT09IFNjYW5Db2RlLkFycm93UmlnaHQpKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS53YXJuKCdDdHJsL0NtZCtBcnJvdyBrZXliaW5kaW5ncyBzaG91bGQgbm90IGJlIHVzZWQgYnkgZGVmYXVsdCBpbiB3ZWIuIE9mZmVuZGVyOiAnLCBrYi5nZXRIYXNoQ29kZSgpLCAnIGZvciAnLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaG9yZCBpbnN0YW5jZW9mIEtleUNvZGVDaG9yZCAmJiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5MZWZ0QXJyb3cgfHwgY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUud2FybignQ3RybC9DbWQrQXJyb3cga2V5YmluZGluZ3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGJ5IGRlZmF1bHQgaW4gd2ViLiBPZmZlbmRlcjogJywga2IuZ2V0SGFzaENvZGUoKSwgJyBmb3IgJywgY29tbWFuZElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKHBhcnRNb2RpZmllcnNNYXNrICYgbW9kaWZpZXJzTWFzaykgPT09IEtleU1vZC5DdHJsQ21kKSB7XG5cdFx0XHRcdGlmIChjaG9yZCBpbnN0YW5jZW9mIFNjYW5Db2RlQ2hvcmQgJiYgKGNob3JkLnNjYW5Db2RlID49IFNjYW5Db2RlLkRpZ2l0MSAmJiBjaG9yZC5zY2FuQ29kZSA8PSBTY2FuQ29kZS5EaWdpdDApKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS53YXJuKCdDdHJsL0NtZCtOdW0ga2V5YmluZGluZ3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGJ5IGRlZmF1bHQgaW4gd2ViLiBPZmZlbmRlcjogJywga2IuZ2V0SGFzaENvZGUoKSwgJyBmb3IgJywgY29tbWFuZElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBLZXlDb2RlQ2hvcmQgJiYgKGNob3JkLmtleUNvZGUgPj0gS2V5Q29kZS5EaWdpdDAgJiYgY2hvcmQua2V5Q29kZSA8PSBLZXlDb2RlLkRpZ2l0OSkpIHtcblx0XHRcdFx0XHQvLyBjb25zb2xlLndhcm4oJ0N0cmwvQ21kK051bSBrZXliaW5kaW5ncyBzaG91bGQgbm90IGJlIHVzZWQgYnkgZGVmYXVsdCBpbiB3ZWIuIE9mZmVuZGVyOiAnLCBrYi5nZXRIYXNoQ29kZSgpLCAnIGZvciAnLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXliaW5kaW5nKGtiOiBLZXliaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9rZXlib2FyZE1hcHBlci5yZXNvbHZlS2V5YmluZGluZyhrYik7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBSZXNvbHZlZEtleWJpbmRpbmcge1xuXHRcdHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLnZhbGlkYXRlQ3VycmVudEtleWJvYXJkTWFwcGluZyhrZXlib2FyZEV2ZW50KTtcblx0XHRyZXR1cm4gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVVzZXJCaW5kaW5nKHVzZXJCaW5kaW5nOiBzdHJpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IEtleWJpbmRpbmdQYXJzZXIucGFyc2VLZXliaW5kaW5nKHVzZXJCaW5kaW5nKTtcblx0XHRyZXR1cm4gKGtleWJpbmRpbmcgPyB0aGlzLl9rZXlib2FyZE1hcHBlci5yZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nKSA6IFtdKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUtleWJpbmRpbmdzRXh0ZW5zaW9uUG9pbnRVc2VyKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpc0J1aWx0aW46IGJvb2xlYW4sIGtleWJpbmRpbmdzOiBDb250cmlidXRlZEtleUJpbmRpbmcgfCBDb250cmlidXRlZEtleUJpbmRpbmdbXSwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCByZXN1bHQ6IElFeHRlbnNpb25LZXliaW5kaW5nUnVsZVtdKTogdm9pZCB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoa2V5YmluZGluZ3MpKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2V5YmluZGluZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlS2V5YmluZGluZyhleHRlbnNpb25JZCwgaXNCdWlsdGluLCBpICsgMSwga2V5YmluZGluZ3NbaV0sIGNvbGxlY3RvciwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faGFuZGxlS2V5YmluZGluZyhleHRlbnNpb25JZCwgaXNCdWlsdGluLCAxLCBrZXliaW5kaW5ncywgY29sbGVjdG9yLCByZXN1bHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUtleWJpbmRpbmcoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGlzQnVpbHRpbjogYm9vbGVhbiwgaWR4OiBudW1iZXIsIGtleWJpbmRpbmdzOiBDb250cmlidXRlZEtleUJpbmRpbmcsIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgcmVzdWx0OiBJRXh0ZW5zaW9uS2V5YmluZGluZ1J1bGVbXSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcmVqZWN0czogc3RyaW5nW10gPSBbXTtcblxuXHRcdGlmIChpc1ZhbGlkQ29udHJpYnV0ZWRLZXlCaW5kaW5nKGtleWJpbmRpbmdzLCByZWplY3RzKSkge1xuXHRcdFx0Y29uc3QgcnVsZSA9IHRoaXMuX2FzQ29tbWFuZFJ1bGUoZXh0ZW5zaW9uSWQsIGlzQnVpbHRpbiwgaWR4KyssIGtleWJpbmRpbmdzKTtcblx0XHRcdGlmIChydWxlKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJ1bGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZWplY3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdCdpbnZhbGlkLmtleWJpbmRpbmdzJyxcblx0XHRcdFx0XCJJbnZhbGlkIGBjb250cmlidXRlcy57MH1gOiB7MX1cIixcblx0XHRcdFx0a2V5YmluZGluZ3NFeHRQb2ludC5uYW1lLFxuXHRcdFx0XHRyZWplY3RzLmpvaW4oJ1xcbicpXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBiaW5kVG9DdXJyZW50UGxhdGZvcm0oa2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIG1hYzogc3RyaW5nIHwgdW5kZWZpbmVkLCBsaW51eDogc3RyaW5nIHwgdW5kZWZpbmVkLCB3aW46IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyAmJiB3aW4pIHtcblx0XHRcdGlmICh3aW4pIHtcblx0XHRcdFx0cmV0dXJuIHdpbjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0XHRpZiAobWFjKSB7XG5cdFx0XHRcdHJldHVybiBtYWM7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChsaW51eCkge1xuXHRcdFx0XHRyZXR1cm4gbGludXg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBrZXk7XG5cdH1cblxuXHRwcml2YXRlIF9hc0NvbW1hbmRSdWxlKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpc0J1aWx0aW46IGJvb2xlYW4sIGlkeDogbnVtYmVyLCBiaW5kaW5nOiBDb250cmlidXRlZEtleUJpbmRpbmcpOiBJRXh0ZW5zaW9uS2V5YmluZGluZ1J1bGUgfCB1bmRlZmluZWQge1xuXG5cdFx0Y29uc3QgeyBjb21tYW5kLCBhcmdzLCB3aGVuLCBrZXksIG1hYywgbGludXgsIHdpbiB9ID0gYmluZGluZztcblx0XHRjb25zdCBrZXliaW5kaW5nID0gV29ya2JlbmNoS2V5YmluZGluZ1NlcnZpY2UuYmluZFRvQ3VycmVudFBsYXRmb3JtKGtleSwgbWFjLCBsaW51eCwgd2luKTtcblx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHdlaWdodDogbnVtYmVyO1xuXHRcdGlmIChpc0J1aWx0aW4pIHtcblx0XHRcdHdlaWdodCA9IEtleWJpbmRpbmdXZWlnaHQuQnVpbHRpbkV4dGVuc2lvbiArIGlkeDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2VpZ2h0ID0gS2V5YmluZGluZ1dlaWdodC5FeHRlcm5hbEV4dGVuc2lvbiArIGlkeDtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kQWN0aW9uID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZCk7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gY29tbWFuZEFjdGlvbiAmJiBjb21tYW5kQWN0aW9uLnByZWNvbmRpdGlvbjtcblx0XHRsZXQgZnVsbFdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh3aGVuICYmIHByZWNvbmRpdGlvbikge1xuXHRcdFx0ZnVsbFdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQocHJlY29uZGl0aW9uLCBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuKSk7XG5cdFx0fSBlbHNlIGlmICh3aGVuKSB7XG5cdFx0XHRmdWxsV2hlbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHdoZW4pO1xuXHRcdH0gZWxzZSBpZiAocHJlY29uZGl0aW9uKSB7XG5cdFx0XHRmdWxsV2hlbiA9IHByZWNvbmRpdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjOiBJRXh0ZW5zaW9uS2V5YmluZGluZ1J1bGUgPSB7XG5cdFx0XHRpZDogY29tbWFuZCxcblx0XHRcdGFyZ3MsXG5cdFx0XHR3aGVuOiBmdWxsV2hlbixcblx0XHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdFx0a2V5YmluZGluZzogS2V5YmluZGluZ1BhcnNlci5wYXJzZUtleWJpbmRpbmcoa2V5YmluZGluZyksXG5cdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uSWQudmFsdWUsXG5cdFx0XHRpc0J1aWx0aW5FeHRlbnNpb246IGlzQnVpbHRpblxuXHRcdH07XG5cdFx0cmV0dXJuIGRlc2M7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0RGVmYXVsdEtleWJpbmRpbmdzQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc29sdmVyID0gdGhpcy5fZ2V0UmVzb2x2ZXIoKTtcblx0XHRjb25zdCBkZWZhdWx0S2V5YmluZGluZ3MgPSByZXNvbHZlci5nZXREZWZhdWx0S2V5YmluZGluZ3MoKTtcblx0XHRjb25zdCBib3VuZENvbW1hbmRzID0gcmVzb2x2ZXIuZ2V0RGVmYXVsdEJvdW5kQ29tbWFuZHMoKTtcblx0XHRyZXR1cm4gKFxuXHRcdFx0V29ya2JlbmNoS2V5YmluZGluZ1NlcnZpY2UuX2dldERlZmF1bHRLZXliaW5kaW5ncyhkZWZhdWx0S2V5YmluZGluZ3MpXG5cdFx0XHQrICdcXG5cXG4nXG5cdFx0XHQrIFdvcmtiZW5jaEtleWJpbmRpbmdTZXJ2aWNlLl9nZXRBbGxDb21tYW5kc0FzQ29tbWVudChib3VuZENvbW1hbmRzKVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0RGVmYXVsdEtleWJpbmRpbmdzKGRlZmF1bHRLZXliaW5kaW5nczogcmVhZG9ubHkgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdKTogc3RyaW5nIHtcblx0XHRjb25zdCBvdXQgPSBuZXcgT3V0cHV0QnVpbGRlcigpO1xuXHRcdG91dC53cml0ZUxpbmUoJ1snKTtcblxuXHRcdGNvbnN0IGxhc3RJbmRleCA9IGRlZmF1bHRLZXliaW5kaW5ncy5sZW5ndGggLSAxO1xuXHRcdGRlZmF1bHRLZXliaW5kaW5ncy5mb3JFYWNoKChrLCBpbmRleCkgPT4ge1xuXHRcdFx0S2V5YmluZGluZ0lPLndyaXRlS2V5YmluZGluZ0l0ZW0ob3V0LCBrKTtcblx0XHRcdGlmIChpbmRleCAhPT0gbGFzdEluZGV4KSB7XG5cdFx0XHRcdG91dC53cml0ZUxpbmUoJywnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dC53cml0ZUxpbmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRvdXQud3JpdGVMaW5lKCddJyk7XG5cdFx0cmV0dXJuIG91dC50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldEFsbENvbW1hbmRzQXNDb21tZW50KGJvdW5kQ29tbWFuZHM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+KTogc3RyaW5nIHtcblx0XHRjb25zdCB1bmJvdW5kQ29tbWFuZHMgPSBnZXRBbGxVbmJvdW5kQ29tbWFuZHMoYm91bmRDb21tYW5kcyk7XG5cdFx0Y29uc3QgcHJldHR5ID0gdW5ib3VuZENvbW1hbmRzLnNvcnQoKS5qb2luKCdcXG4vLyAtICcpO1xuXHRcdHJldHVybiAnLy8gJyArIG5scy5sb2NhbGl6ZSgndW5ib3VuZENvbW1hbmRzJywgXCJIZXJlIGFyZSBvdGhlciBhdmFpbGFibGUgY29tbWFuZHM6IFwiKSArICdcXG4vLyAtICcgKyBwcmV0dHk7XG5cdH1cblxuXHRvdmVycmlkZSBtaWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZXZlbnQ6IElLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSB8fCBldmVudC5hbHRLZXkpIHtcblx0XHRcdC8vIGlnbm9yZSBjdHJsL2NtZC9hbHQtY29tYmluYXRpb24gYnV0IG5vdCBzaGlmdC1jb21iaW5hdGlvc1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBjb2RlID0gU2NhbkNvZGVVdGlscy50b0VudW0oZXZlbnQuY29kZSk7XG5cblx0XHRpZiAoTlVNUEFEX1BSSU5UQUJMRV9TQ0FOQ09ERVMuaW5kZXhPZihjb2RlKSAhPT0gLTEpIHtcblx0XHRcdC8vIFRoaXMgaXMgYSBudW1wYWQga2V5IHRoYXQgbWlnaHQgcHJvZHVjZSBhIHByaW50YWJsZSBjaGFyYWN0ZXIgYmFzZWQgb24gTnVtTG9jay5cblx0XHRcdC8vIExldCdzIGNoZWNrIGlmIE51bUxvY2sgaXMgb24gb3Igb2ZmIGJhc2VkIG9uIHRoZSBldmVudCdzIGtleUNvZGUuXG5cdFx0XHQvLyBlLmcuXG5cdFx0XHQvLyAtIHdoZW4gTnVtTG9jayBpcyBvZmYsIFNjYW5Db2RlLk51bXBhZDQgcHJvZHVjZXMgS2V5Q29kZS5MZWZ0QXJyb3dcblx0XHRcdC8vIC0gd2hlbiBOdW1Mb2NrIGlzIG9uLCBTY2FuQ29kZS5OdW1wYWQ0IHByb2R1Y2VzIEtleUNvZGUuTlVNUEFEXzRcblx0XHRcdC8vIEhvd2V2ZXIsIFNjYW5Db2RlLk51bXBhZEFkZCBhbHdheXMgcHJvZHVjZXMgS2V5Q29kZS5OVU1QQURfQUREXG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbY29kZV0pIHtcblx0XHRcdFx0Ly8gTnVtTG9jayBpcyBvbiBvciB0aGlzIGlzIC8sICosIC0sICsgb24gdGhlIG51bXBhZFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBldmVudC5rZXlDb2RlID09PSBvdGhlck1hY051bXBhZE1hcHBpbmcuZ2V0KGNvZGUpKSB7XG5cdFx0XHRcdC8vIG9uIG1hY09TLCB0aGUgbnVtcGFkIGtleXMgY2FuIGFsc28gbWFwIHRvIGtleXMgMSAtIDAuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleWNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtjb2RlXTtcblx0XHRpZiAoa2V5Y29kZSAhPT0gLTEpIHtcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83NDkzNFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBjb25zdWx0IHRoZSBLZXlib2FyZE1hcHBlckZhY3RvcnkgdG8gY2hlY2sgdGhlIGdpdmVuIGV2ZW50IGZvclxuXHRcdC8vIGEgcHJpbnRhYmxlIHZhbHVlLlxuXHRcdGNvbnN0IG1hcHBpbmcgPSB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRSYXdLZXlib2FyZE1hcHBpbmcoKTtcblx0XHRpZiAoIW1hcHBpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5SW5mbyA9IG1hcHBpbmdbZXZlbnQuY29kZV07XG5cdFx0aWYgKCFrZXlJbmZvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgha2V5SW5mby52YWx1ZSB8fCAvXFxzLy50ZXN0KGtleUluZm8udmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIFVzZXJLZXliaW5kaW5ncyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3Jhd0tleWJpbmRpbmdzOiBPYmplY3RbXSA9IFtdO1xuXHRwcml2YXRlIF9rZXliaW5kaW5nczogSVVzZXJLZXliaW5kaW5nSXRlbVtdID0gW107XG5cdGdldCBrZXliaW5kaW5ncygpOiBJVXNlcktleWJpbmRpbmdJdGVtW10geyByZXR1cm4gdGhpcy5fa2V5YmluZGluZ3M7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3YXRjaERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMud2F0Y2goKTtcblxuXHRcdHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVsb2FkKCkudGhlbihjaGFuZ2VkID0+IHtcblx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSwgNTApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gZS5jb250YWlucyh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSkpKCgpID0+IHtcblx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoJ0tleWJpbmRpbmdzIGZpbGUgY2hhbmdlZCcpO1xuXHRcdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLldSSVRFICYmIGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKCdLZXliaW5kaW5ncyBmaWxlIHdyaXR0ZW4nKTtcblx0XHRcdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLnByZXZpb3VzLmtleWJpbmRpbmdzUmVzb3VyY2UsIGUucHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlKSkge1xuXHRcdFx0XHRlLmpvaW4odGhpcy53aGVuQ3VycmVudFByb2ZpbGVDaGFuZ2VkKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2hlbkN1cnJlbnRQcm9maWxlQ2hhbmdlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLndhdGNoKCk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMud2F0Y2hEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMud2F0Y2hEaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS53YXRjaChkaXJuYW1lKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlKSkpO1xuXHRcdC8vIEFsc28gbGlzdGVuIHRvIHRoZSByZXNvdXJjZSBpbmNhc2UgdGhlIHJlc291cmNlIGlzIGEgc3ltbGluayAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTgxMzRcblx0XHR0aGlzLndhdGNoRGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UpKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5yZWxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG5ld0tleWJpbmRpbmdzID0gYXdhaXQgdGhpcy5yZWFkVXNlcktleWJpbmRpbmdzKCk7XG5cdFx0aWYgKG9iamVjdHMuZXF1YWxzKHRoaXMuX3Jhd0tleWJpbmRpbmdzLCBuZXdLZXliaW5kaW5ncykpIHtcblx0XHRcdC8vIG5vIGNoYW5nZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jhd0tleWJpbmRpbmdzID0gbmV3S2V5YmluZGluZ3M7XG5cdFx0dGhpcy5fa2V5YmluZGluZ3MgPSB0aGlzLl9yYXdLZXliaW5kaW5ncy5tYXAoKGspID0+IEtleWJpbmRpbmdJTy5yZWFkVXNlcktleWJpbmRpbmdJdGVtKGspKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZFVzZXJLZXliaW5kaW5ncygpOiBQcm9taXNlPE9iamVjdFtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gcGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKVxuXHRcdFx0XHQ/IHZhbHVlLmZpbHRlcih2ID0+IHYgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnIC8qIGp1c3QgdHlwZW9mID09PSBvYmplY3QgZG9lc24ndCBjYXRjaCBgbnVsbGAgKi8pXG5cdFx0XHRcdDogW107XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFJlZ2lzdGVycyB0aGUgYGtleWJpbmRpbmdzLmpzb25gJ3Mgc2NoZW1hIHdpdGggdGhlIEpTT04gc2NoZW1hIHJlZ2lzdHJ5LiBBbGxvd3MgdXBkYXRpbmcgdGhlIHNjaGVtYSwgZS5nLiwgd2hlbiBuZXcgY29tbWFuZHMgYXJlIHJlZ2lzdGVyZWQgKGUuZy4sIGJ5IGV4dGVuc2lvbnMpLlxuICpcbiAqIExpZmVjeWNsZSBvd25lZCBieSBgV29ya2JlbmNoS2V5YmluZGluZ1NlcnZpY2VgLiBNdXN0IGJlIGluc3RhbnRpYXRlZCBvbmx5IG9uY2UuXG4gKi9cbmNsYXNzIEtleWJpbmRpbmdzSnNvblNjaGVtYSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9rZXliaW5kaW5ncyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kc1NjaGVtYXM6IElKU09OU2NoZW1hW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kc0VudW06IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3ZhbENvbW1hbmRzRW51bTogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kc0VudW1EZXNjcmlwdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRpZDogS2V5YmluZGluZ3NKc29uU2NoZW1hLnNjaGVtYUlkLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgna2V5YmluZGluZ3MuanNvbi50aXRsZScsIFwiS2V5YmluZGluZ3MgY29uZmlndXJhdGlvblwiKSxcblx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdFx0ZGVmaW5pdGlvbnM6IHtcblx0XHRcdCdlZGl0b3JHcm91cHNTY2hlbWEnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0J2l0ZW1zJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQnZ3JvdXBzJzoge1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL2VkaXRvckdyb3Vwc1NjaGVtYScsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogW3t9LCB7fV1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnc2l6ZSc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0J2RlZmF1bHQnOiAwLjVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnY29tbWFuZE5hbWVzJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZW51bSc6IHRoaXMuY29tbWFuZHNFbnVtLFxuXHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IHRoaXMuY29tbWFuZHNFbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24uY29tbWFuZCcsIFwiTmFtZSBvZiB0aGUgY29tbWFuZCB0byBleGVjdXRlXCIpLFxuXHRcdFx0fSxcblx0XHRcdCdjb21tYW5kVHlwZSc6IHtcblx0XHRcdFx0J2FueU9mJzogWyAvLyByZXBldGl0aW9uIG9mIHRoaXMgY2xhdXNlIGhlcmUgYW5kIGJlbG93IGlzIGludGVudGlvbmFsOiBvbmUgaXMgZm9yIG5pY2UgZGlhZ25vc3RpY3MgJiBvbmUgaXMgZm9yIGNvZGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2NvbW1hbmROYW1lcydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHQnZW51bSc6IHRoaXMucmVtb3ZhbENvbW1hbmRzRW51bSxcblx0XHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogdGhpcy5jb21tYW5kc0VudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24ucmVtb3ZhbENvbW1hbmQnLCBcIk5hbWUgb2YgdGhlIGNvbW1hbmQgdG8gcmVtb3ZlIGtleWJvYXJkIHNob3J0Y3V0IGZvclwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0J2NvbW1hbmRzU2NoZW1hcyc6IHtcblx0XHRcdFx0J2FsbE9mJzogdGhpcy5jb21tYW5kc1NjaGVtYXNcblx0XHRcdH1cblx0XHR9LFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHQncmVxdWlyZWQnOiBbJ2tleSddLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdkZWZhdWx0U25pcHBldHMnOiBbeyAnYm9keSc6IHsgJ2tleSc6ICckMScsICdjb21tYW5kJzogJyQyJywgJ3doZW4nOiAnJDMnIH0gfV0sXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2tleSc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgna2V5YmluZGluZ3MuanNvbi5rZXknLCBcIktleSBvciBrZXkgc2VxdWVuY2UgKHNlcGFyYXRlZCBieSBzcGFjZSlcIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdjb21tYW5kJzoge1xuXHRcdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0J2lmJzoge1xuXHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5J1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQndGhlbic6IHtcblx0XHRcdFx0XHRcdFx0XHQnbm90Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYXJyYXknXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHQnZXJyb3JNZXNzYWdlJzogbmxzLmxvY2FsaXplKCdrZXliaW5kaW5ncy5jb21tYW5kc0lzQXJyYXknLCBcIkluY29ycmVjdCB0eXBlLiBFeHBlY3RlZCBcXFwiezB9XFxcIi4gVGhlIGZpZWxkICdjb21tYW5kJyBkb2VzIG5vdCBzdXBwb3J0IHJ1bm5pbmcgbXVsdGlwbGUgY29tbWFuZHMuIFVzZSBjb21tYW5kICdydW5Db21tYW5kcycgdG8gcGFzcyBpdCBtdWx0aXBsZSBjb21tYW5kcyB0byBydW4uXCIsICdzdHJpbmcnKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQnZWxzZSc6IHtcblx0XHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRUeXBlJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRUeXBlJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0J3doZW4nOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24ud2hlbicsIFwiQ29uZGl0aW9uIHdoZW4gdGhlIGtleSBpcyBhY3RpdmUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhcmdzJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgna2V5YmluZGluZ3MuanNvbi5hcmdzJywgXCJBcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgY29tbWFuZCB0byBleGVjdXRlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc3lzdGVtV2lkZSc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdrZXliaW5kaW5ncy5qc29uLnN5c3RlbVdpZGUnLCBcIldoZW4gYHRydWVgLCByZWdpc3RlcnMgdGhpcyBrZXliaW5kaW5nIGFzIGEgc3lzdGVtLXdpZGUgKE9TIGdsb2JhbCkgc2hvcnRjdXQgdGhhdCBmaXJlcyBldmVuIHdoZW4gdGhlIGFwcGxpY2F0aW9uIGlzIG5vdCBmb2N1c2VkLiBEZXNrdG9wIG9ubHkuIE9ubHkgc2luZ2xlIGtleSBjb21iaW5hdGlvbnMgYXJlIHN1cHBvcnRlZCAobm8gY2hvcmRzKSwgYW5kIGFueSBgd2hlbmAgY2xhdXNlIGlzIGlnbm9yZWQgZm9yIHRoZSBnbG9iYWwgdHJpZ2dlci5cIilcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCckcmVmJzogJyMvZGVmaW5pdGlvbnMvY29tbWFuZHNTY2hlbWFzJ1xuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKEtleWJpbmRpbmdzSnNvblNjaGVtYS5zY2hlbWFJZCwgdGhpcy5zY2hlbWEpO1xuXHR9XG5cblx0Ly8gVE9ET0B1bHVnYmVrbmE6IGNhbiB1cGRhdGVzIGhhcHBlbiBpbmNyZW1lbnRhbGx5IHJhdGhlciB0aGFuIHJlYnVpbGRpbmc7IGNvbmNlcm5zOlxuXHQvLyAtIGlzIGp1c3QgYXBwZW5kaW5nIGFkZGl0aW9uYWwgc2NoZW1hcyBlbm91Z2ggZm9yIHRoZSByZWdpc3RyeSB0byBwaWNrIHRoZW0gdXA/XG5cdC8vIC0gY2FuIGBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmRzYCBhbmQgYE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kc2AgcmV0dXJuIGRpZmZlcmVudCB2YWx1ZXMgYXQgZGlmZmVyZW50IHRpbWVzPyBpZSB3b3VsZCBqdXN0IHB1c2hpbmcgbmV3IHNjaGVtYXMgZnJvbSBgYWRkaXRpb25hbENvbnRyaWJ1dGlvbnNgIG5vdCBiZSBlbm91Z2g/XG5cdHVwZGF0ZVNjaGVtYShhZGRpdGlvbmFsQ29udHJpYnV0aW9uczogcmVhZG9ubHkgSUpTT05TY2hlbWFbXSkge1xuXHRcdHRoaXMuY29tbWFuZHNTY2hlbWFzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5jb21tYW5kc0VudW0ubGVuZ3RoID0gMDtcblx0XHR0aGlzLnJlbW92YWxDb21tYW5kc0VudW0ubGVuZ3RoID0gMDtcblx0XHR0aGlzLmNvbW1hbmRzRW51bURlc2NyaXB0aW9ucy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3Qga25vd25Db21tYW5kcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGFkZEtub3duQ29tbWFuZCA9IChjb21tYW5kSWQ6IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAoIS9eXy8udGVzdChjb21tYW5kSWQpKSB7XG5cdFx0XHRcdGlmICgha25vd25Db21tYW5kcy5oYXMoY29tbWFuZElkKSkge1xuXHRcdFx0XHRcdGtub3duQ29tbWFuZHMuYWRkKGNvbW1hbmRJZCk7XG5cblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRzRW51bS5wdXNoKGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kc0VudW1EZXNjcmlwdGlvbnMucHVzaChcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uID09PSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0PyAnJyAvLyBgZW51bURlc2NyaXB0aW9uc2AgaXMgYW4gYXJyYXkgb2Ygc3RyaW5ncywgc28gd2UgY2FuJ3QgdXNlIHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHQ6IChpc0xvY2FsaXplZFN0cmluZyhkZXNjcmlwdGlvbikgPyBkZXNjcmlwdGlvbi52YWx1ZSA6IGRlc2NyaXB0aW9uKVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHQvLyBBbHNvIGFkZCB0aGUgbmVnYXRpdmUgZm9ybSBmb3Iga2V5YmluZGluZyByZW1vdmFsXG5cdFx0XHRcdFx0dGhpcy5yZW1vdmFsQ29tbWFuZHNFbnVtLnB1c2goYC0ke2NvbW1hbmRJZH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBhbGxDb21tYW5kcyA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZHMoKTtcblx0XHRmb3IgKGNvbnN0IFtjb21tYW5kSWQsIGNvbW1hbmRdIG9mIGFsbENvbW1hbmRzKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kTWV0YWRhdGEgPSBjb21tYW5kLm1ldGFkYXRhO1xuXG5cdFx0XHRhZGRLbm93bkNvbW1hbmQoY29tbWFuZElkLCBjb21tYW5kTWV0YWRhdGE/LmRlc2NyaXB0aW9uID8/IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCk/LnRpdGxlKTtcblxuXHRcdFx0aWYgKCFjb21tYW5kTWV0YWRhdGEgfHwgIWNvbW1hbmRNZXRhZGF0YS5hcmdzIHx8IGNvbW1hbmRNZXRhZGF0YS5hcmdzLmxlbmd0aCAhPT0gMSB8fCAhY29tbWFuZE1ldGFkYXRhLmFyZ3NbMF0uc2NoZW1hKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhcmdzU2NoZW1hID0gY29tbWFuZE1ldGFkYXRhLmFyZ3NbMF0uc2NoZW1hO1xuXHRcdFx0Y29uc3QgYXJnc1JlcXVpcmVkID0gKFxuXHRcdFx0XHQodHlwZW9mIGNvbW1hbmRNZXRhZGF0YS5hcmdzWzBdLmlzT3B0aW9uYWwgIT09ICd1bmRlZmluZWQnKVxuXHRcdFx0XHRcdD8gKCFjb21tYW5kTWV0YWRhdGEuYXJnc1swXS5pc09wdGlvbmFsKVxuXHRcdFx0XHRcdDogKEFycmF5LmlzQXJyYXkoYXJnc1NjaGVtYS5yZXF1aXJlZCkgJiYgYXJnc1NjaGVtYS5yZXF1aXJlZC5sZW5ndGggPiAwKVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGFkZGl0aW9uID0ge1xuXHRcdFx0XHQnaWYnOiB7XG5cdFx0XHRcdFx0J3JlcXVpcmVkJzogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IHsgJ2NvbnN0JzogY29tbWFuZElkIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd0aGVuJzoge1xuXHRcdFx0XHRcdCdyZXF1aXJlZCc6ICg8c3RyaW5nW10+W10pLmNvbmNhdChhcmdzUmVxdWlyZWQgPyBbJ2FyZ3MnXSA6IFtdKSxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCdhcmdzJzogYXJnc1NjaGVtYVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5jb21tYW5kc1NjaGVtYXMucHVzaChhZGRpdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVudUNvbW1hbmRzID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmRzKCk7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kSWQgb2YgbWVudUNvbW1hbmRzLmtleXMoKSkge1xuXHRcdFx0YWRkS25vd25Db21tYW5kKGNvbW1hbmRJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21tYW5kc1NjaGVtYXMucHVzaCguLi5hZGRpdGlvbmFsQ29udHJpYnV0aW9ucyk7XG5cdFx0dGhpcy5zY2hlbWFSZWdpc3RyeS5ub3RpZnlTY2hlbWFDaGFuZ2VkKEtleWJpbmRpbmdzSnNvblNjaGVtYS5zY2hlbWFJZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUtleWJpbmRpbmdTZXJ2aWNlLCBXb3JrYmVuY2hLZXliaW5kaW5nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xu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
