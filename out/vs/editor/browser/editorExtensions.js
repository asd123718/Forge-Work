import * as nls from "../../nls.js";
import { URI } from "../../base/common/uri.js";
import { ICodeEditorService } from "./services/codeEditorService.js";
import { Position } from "../common/core/position.js";
import { IModelService } from "../common/services/model.js";
import { ITextModelService } from "../common/services/resolverService.js";
import { MenuId, MenuRegistry, Action2 } from "../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { assertType } from "../../base/common/types.js";
import { KeyMod, KeyCode } from "../../base/common/keyCodes.js";
import { ILogService } from "../../platform/log/common/log.js";
import { getActiveElement } from "../../base/browser/dom.js";
import { TriggerInlineEditCommandsRegistry } from "./triggerInlineEditCommandsRegistry.js";
var EditorContributionInstantiation = /* @__PURE__ */ ((EditorContributionInstantiation2) => {
  EditorContributionInstantiation2[EditorContributionInstantiation2["Eager"] = 0] = "Eager";
  EditorContributionInstantiation2[EditorContributionInstantiation2["AfterFirstRender"] = 1] = "AfterFirstRender";
  EditorContributionInstantiation2[EditorContributionInstantiation2["BeforeFirstInteraction"] = 2] = "BeforeFirstInteraction";
  EditorContributionInstantiation2[EditorContributionInstantiation2["Eventually"] = 3] = "Eventually";
  EditorContributionInstantiation2[EditorContributionInstantiation2["Lazy"] = 4] = "Lazy";
  return EditorContributionInstantiation2;
})(EditorContributionInstantiation || {});
class Command {
  constructor(opts) {
    this.id = opts.id;
    this.precondition = opts.precondition;
    this._kbOpts = opts.kbOpts;
    this._menuOpts = opts.menuOpts;
    this.metadata = opts.metadata;
    this.canTriggerInlineEdits = opts.canTriggerInlineEdits;
  }
  register() {
    if (Array.isArray(this._menuOpts)) {
      this._menuOpts.forEach(this._registerMenuItem, this);
    } else if (this._menuOpts) {
      this._registerMenuItem(this._menuOpts);
    }
    if (this._kbOpts) {
      const kbOptsArr = Array.isArray(this._kbOpts) ? this._kbOpts : [this._kbOpts];
      for (const kbOpts of kbOptsArr) {
        let kbWhen = kbOpts.kbExpr;
        if (this.precondition) {
          if (kbWhen) {
            kbWhen = ContextKeyExpr.and(kbWhen, this.precondition);
          } else {
            kbWhen = this.precondition;
          }
        }
        const desc = {
          id: this.id,
          weight: kbOpts.weight,
          args: kbOpts.args,
          when: kbWhen,
          primary: kbOpts.primary,
          secondary: kbOpts.secondary,
          win: kbOpts.win,
          linux: kbOpts.linux,
          mac: kbOpts.mac
        };
        KeybindingsRegistry.registerKeybindingRule(desc);
      }
    }
    CommandsRegistry.registerCommand({
      id: this.id,
      handler: (accessor, args) => this.runCommand(accessor, args),
      metadata: this.metadata
    });
    if (this.canTriggerInlineEdits) {
      TriggerInlineEditCommandsRegistry.registerCommand(this.id);
    }
  }
  _registerMenuItem(item) {
    MenuRegistry.appendMenuItem(item.menuId, {
      group: item.group,
      command: {
        id: this.id,
        title: item.title,
        icon: item.icon,
        precondition: this.precondition
      },
      when: item.when,
      order: item.order
    });
  }
}
class MultiCommand extends Command {
  constructor() {
    super(...arguments);
    this._implementations = [];
  }
  /**
   * A higher priority gets to be looked at first
   */
  addImplementation(priority, name, implementation, when) {
    this._implementations.push({ priority, name, implementation, when });
    this._implementations.sort((a, b) => b.priority - a.priority);
    return {
      dispose: () => {
        for (let i = 0; i < this._implementations.length; i++) {
          if (this._implementations[i].implementation === implementation) {
            this._implementations.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  runCommand(accessor, args) {
    const logService = accessor.get(ILogService);
    const contextKeyService = accessor.get(IContextKeyService);
    logService.trace(`Executing Command '${this.id}' which has ${this._implementations.length} bound.`);
    for (const impl of this._implementations) {
      if (impl.when) {
        const context = contextKeyService.getContext(getActiveElement());
        const value = impl.when.evaluate(context);
        if (!value) {
          continue;
        }
      }
      const result = impl.implementation(accessor, args);
      if (result) {
        logService.trace(`Command '${this.id}' was handled by '${impl.name}'.`);
        if (typeof result === "boolean") {
          return;
        }
        return result;
      }
    }
    logService.trace(`The Command '${this.id}' was not handled by any implementation.`);
  }
}
class ProxyCommand extends Command {
  constructor(command, opts) {
    super(opts);
    this.command = command;
  }
  runCommand(accessor, args) {
    return this.command.runCommand(accessor, args);
  }
}
class EditorCommand extends Command {
  /**
   * Create a command class that is bound to a certain editor contribution.
   */
  static bindToContribution(controllerGetter) {
    return class EditorControllerCommandImpl extends EditorCommand {
      constructor(opts) {
        super(opts);
        this._callback = opts.handler;
      }
      runEditorCommand(accessor, editor, args) {
        const controller = controllerGetter(editor);
        if (controller) {
          this._callback(controller, args);
        }
      }
    };
  }
  static runEditorCommand(accessor, args, precondition, runner) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
    if (!editor) {
      return;
    }
    return editor.invokeWithinContext((editorAccessor) => {
      const kbService = editorAccessor.get(IContextKeyService);
      if (!kbService.contextMatchesRules(precondition ?? void 0)) {
        return;
      }
      return runner(editorAccessor, editor, args);
    });
  }
  runCommand(accessor, args) {
    return EditorCommand.runEditorCommand(accessor, args, this.precondition, (accessor2, editor, args2) => this.runEditorCommand(accessor2, editor, args2));
  }
}
class EditorAction extends EditorCommand {
  static convertOptions(opts) {
    let menuOpts;
    if (Array.isArray(opts.menuOpts)) {
      menuOpts = opts.menuOpts;
    } else if (opts.menuOpts) {
      menuOpts = [opts.menuOpts];
    } else {
      menuOpts = [];
    }
    function withDefaults(item) {
      if (!item.menuId) {
        item.menuId = MenuId.EditorContext;
      }
      if (!item.title) {
        item.title = typeof opts.label === "string" ? opts.label : opts.label.value;
      }
      item.when = ContextKeyExpr.and(opts.precondition, item.when);
      return item;
    }
    if (Array.isArray(opts.contextMenuOpts)) {
      menuOpts.push(...opts.contextMenuOpts.map(withDefaults));
    } else if (opts.contextMenuOpts) {
      menuOpts.push(withDefaults(opts.contextMenuOpts));
    }
    opts.menuOpts = menuOpts;
    return opts;
  }
  constructor(opts) {
    super(EditorAction.convertOptions(opts));
    if (typeof opts.label === "string") {
      this.label = opts.label;
      this.alias = opts.alias ?? opts.label;
    } else {
      this.label = opts.label.value;
      this.alias = opts.alias ?? opts.label.original;
    }
  }
  runEditorCommand(accessor, editor, args) {
    this.reportTelemetry(accessor, editor);
    return this.run(accessor, editor, args || {});
  }
  reportTelemetry(accessor, editor) {
    accessor.get(ITelemetryService).publicLog2("editorActionInvoked", { name: this.label, id: this.id });
  }
}
class MultiEditorAction extends EditorAction {
  constructor() {
    super(...arguments);
    this._implementations = [];
  }
  /**
   * A higher priority gets to be looked at first
   */
  addImplementation(priority, implementation) {
    this._implementations.push([priority, implementation]);
    this._implementations.sort((a, b) => b[0] - a[0]);
    return {
      dispose: () => {
        for (let i = 0; i < this._implementations.length; i++) {
          if (this._implementations[i][1] === implementation) {
            this._implementations.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  run(accessor, editor, args) {
    for (const impl of this._implementations) {
      const result = impl[1](accessor, editor, args);
      if (result) {
        if (typeof result === "boolean") {
          return;
        }
        return result;
      }
    }
  }
}
class EditorAction2 extends Action2 {
  run(accessor, ...args) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
    if (!editor) {
      return;
    }
    return editor.invokeWithinContext((editorAccessor) => {
      const kbService = editorAccessor.get(IContextKeyService);
      const logService = editorAccessor.get(ILogService);
      const enabled = kbService.contextMatchesRules(this.desc.precondition ?? void 0);
      if (!enabled) {
        logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
        return;
      }
      return this.runEditorCommand(editorAccessor, editor, ...args);
    });
  }
}
function registerModelAndPositionCommand(id, handler) {
  CommandsRegistry.registerCommand(id, function(accessor, ...args) {
    const instaService = accessor.get(IInstantiationService);
    const [resource, position] = args;
    assertType(URI.isUri(resource));
    assertType(Position.isIPosition(position));
    const model = accessor.get(IModelService).getModel(resource);
    if (model) {
      const editorPosition = Position.lift(position);
      return instaService.invokeFunction(handler, model, editorPosition, ...args.slice(2));
    }
    return accessor.get(ITextModelService).createModelReference(resource).then((reference) => {
      return new Promise((resolve, reject) => {
        try {
          const result = instaService.invokeFunction(handler, reference.object.textEditorModel, Position.lift(position), args.slice(2));
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }).finally(() => {
        reference.dispose();
      });
    });
  });
}
function registerEditorCommand(editorCommand) {
  EditorContributionRegistry.INSTANCE.registerEditorCommand(editorCommand);
  return editorCommand;
}
function registerEditorAction(ctor) {
  const action = new ctor();
  EditorContributionRegistry.INSTANCE.registerEditorAction(action);
  return action;
}
function registerMultiEditorAction(action) {
  EditorContributionRegistry.INSTANCE.registerEditorAction(action);
  return action;
}
function registerInstantiatedEditorAction(editorAction) {
  EditorContributionRegistry.INSTANCE.registerEditorAction(editorAction);
}
function registerEditorContribution(id, ctor, instantiation) {
  EditorContributionRegistry.INSTANCE.registerEditorContribution(id, ctor, instantiation);
}
function registerDiffEditorContribution(id, ctor) {
  EditorContributionRegistry.INSTANCE.registerDiffEditorContribution(id, ctor);
}
var EditorExtensionsRegistry;
((EditorExtensionsRegistry2) => {
  function getEditorCommand(commandId) {
    return EditorContributionRegistry.INSTANCE.getEditorCommand(commandId);
  }
  EditorExtensionsRegistry2.getEditorCommand = getEditorCommand;
  function getEditorActions() {
    return EditorContributionRegistry.INSTANCE.getEditorActions();
  }
  EditorExtensionsRegistry2.getEditorActions = getEditorActions;
  function getEditorContributions() {
    return EditorContributionRegistry.INSTANCE.getEditorContributions();
  }
  EditorExtensionsRegistry2.getEditorContributions = getEditorContributions;
  function getSomeEditorContributions(ids) {
    return EditorContributionRegistry.INSTANCE.getEditorContributions().filter((c) => ids.indexOf(c.id) >= 0);
  }
  EditorExtensionsRegistry2.getSomeEditorContributions = getSomeEditorContributions;
  function getDiffEditorContributions() {
    return EditorContributionRegistry.INSTANCE.getDiffEditorContributions();
  }
  EditorExtensionsRegistry2.getDiffEditorContributions = getDiffEditorContributions;
})(EditorExtensionsRegistry || (EditorExtensionsRegistry = {}));
const Extensions = {
  EditorCommonContributions: "editor.contributions"
};
const _EditorContributionRegistry = class _EditorContributionRegistry {
  constructor() {
    this.editorContributions = [];
    this.diffEditorContributions = [];
    this.editorActions = [];
    this.editorCommands = /* @__PURE__ */ Object.create(null);
  }
  registerEditorContribution(id, ctor, instantiation) {
    this.editorContributions.push({ id, ctor, instantiation });
  }
  getEditorContributions() {
    return this.editorContributions.slice(0);
  }
  registerDiffEditorContribution(id, ctor) {
    this.diffEditorContributions.push({ id, ctor });
  }
  getDiffEditorContributions() {
    return this.diffEditorContributions.slice(0);
  }
  registerEditorAction(action) {
    action.register();
    this.editorActions.push(action);
  }
  getEditorActions() {
    return this.editorActions;
  }
  registerEditorCommand(editorCommand) {
    editorCommand.register();
    this.editorCommands[editorCommand.id] = editorCommand;
  }
  getEditorCommand(commandId) {
    return this.editorCommands[commandId] || null;
  }
};
_EditorContributionRegistry.INSTANCE = new _EditorContributionRegistry();
let EditorContributionRegistry = _EditorContributionRegistry;
Registry.add(Extensions.EditorCommonContributions, EditorContributionRegistry.INSTANCE);
function registerCommand(command) {
  command.register();
  return command;
}
const UndoCommand = registerCommand(new MultiCommand({
  id: "undo",
  precondition: void 0,
  kbOpts: {
    weight: KeybindingWeight.EditorCore,
    primary: KeyMod.CtrlCmd | KeyCode.KeyZ
  },
  menuOpts: [{
    menuId: MenuId.MenubarEditMenu,
    group: "1_do",
    title: nls.localize({ key: "miUndo", comment: ["&& denotes a mnemonic"] }, "&&Undo"),
    order: 1
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("undo", "Undo"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: "1_do",
    title: nls.localize("undo", "Undo"),
    order: 1
  }]
}));
registerCommand(new ProxyCommand(UndoCommand, { id: "default:undo", precondition: void 0 }));
const RedoCommand = registerCommand(new MultiCommand({
  id: "redo",
  precondition: void 0,
  kbOpts: {
    weight: KeybindingWeight.EditorCore,
    primary: KeyMod.CtrlCmd | KeyCode.KeyY,
    secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ],
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ }
  },
  menuOpts: [{
    menuId: MenuId.MenubarEditMenu,
    group: "1_do",
    title: nls.localize({ key: "miRedo", comment: ["&& denotes a mnemonic"] }, "&&Redo"),
    order: 2
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("redo", "Redo"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: "1_do",
    title: nls.localize("redo", "Redo"),
    order: 2
  }]
}));
registerCommand(new ProxyCommand(RedoCommand, { id: "default:redo", precondition: void 0 }));
const SelectAllCommand = registerCommand(new MultiCommand({
  id: "editor.action.selectAll",
  precondition: void 0,
  kbOpts: {
    weight: KeybindingWeight.EditorCore,
    kbExpr: null,
    primary: KeyMod.CtrlCmd | KeyCode.KeyA
  },
  menuOpts: [{
    menuId: MenuId.MenubarSelectionMenu,
    group: "1_basic",
    title: nls.localize({ key: "miSelectAll", comment: ["&& denotes a mnemonic"] }, "&&Select All"),
    order: 1
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("selectAll", "Select All"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: "9_select",
    title: nls.localize("selectAll", "Select All"),
    order: 1
  }]
}));
export {
  Command,
  EditorAction,
  EditorAction2,
  EditorCommand,
  EditorContributionInstantiation,
  EditorExtensionsRegistry,
  MultiCommand,
  MultiEditorAction,
  ProxyCommand,
  RedoCommand,
  SelectAllCommand,
  UndoCommand,
  registerDiffEditorContribution,
  registerEditorAction,
  registerEditorCommand,
  registerEditorContribution,
  registerInstantiatedEditorAction,
  registerModelAndPositionCommand,
  registerMultiEditorAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGVkaXRvckV4dGVuc2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSURpZmZFZGl0b3IgfSBmcm9tICcuL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElEaWZmRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIGFzIEluc3RhbnRpYXRpb25TZXJ2aWNlc0FjY2Vzc29yLCBCcmFuZGVkU2VydmljZSwgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBJQ29uc3RydWN0b3JTaWduYXR1cmUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5ncywgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgVHJpZ2dlcklubGluZUVkaXRDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi90cmlnZ2VySW5saW5lRWRpdENvbW1hbmRzUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgdHlwZSBTZXJ2aWNlc0FjY2Vzc29yID0gSW5zdGFudGlhdGlvblNlcnZpY2VzQWNjZXNzb3I7XG5leHBvcnQgdHlwZSBFZGl0b3JDb250cmlidXRpb25DdG9yID0gSUNvbnN0cnVjdG9yU2lnbmF0dXJlPElFZGl0b3JDb250cmlidXRpb24sIFtJQ29kZUVkaXRvcl0+O1xuZXhwb3J0IHR5cGUgRGlmZkVkaXRvckNvbnRyaWJ1dGlvbkN0b3IgPSBJQ29uc3RydWN0b3JTaWduYXR1cmU8SURpZmZFZGl0b3JDb250cmlidXRpb24sIFtJRGlmZkVkaXRvcl0+O1xuXG5leHBvcnQgY29uc3QgZW51bSBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uIHtcblx0LyoqXG5cdCAqIFRoZSBjb250cmlidXRpb24gaXMgY3JlYXRlZCBlYWdlcmx5IHdoZW4gdGhlIHtAbGlua2NvZGUgSUNvZGVFZGl0b3J9IGlzIGluc3RhbnRpYXRlZC5cblx0ICogT25seSBFYWdlciBjb250cmlidXRpb25zIGNhbiBwYXJ0aWNpcGF0ZSBpbiBzYXZpbmcgb3IgcmVzdG9yaW5nIG9mIHZpZXcgc3RhdGUuXG5cdCAqL1xuXHRFYWdlcixcblxuXHQvKipcblx0ICogVGhlIGNvbnRyaWJ1dGlvbiBpcyBjcmVhdGVkIGF0IHRoZSBsYXRlc3QgNTBtcyBhZnRlciB0aGUgZmlyc3QgcmVuZGVyIGFmdGVyIGF0dGFjaGluZyBhIHRleHQgbW9kZWwuXG5cdCAqIElmIHRoZSBjb250cmlidXRpb24gaXMgZXhwbGljaXRseSByZXF1ZXN0ZWQgdmlhIGBnZXRDb250cmlidXRpb25gLCBpdCB3aWxsIGJlIGluc3RhbnRpYXRlZCBzb29uZXIuXG5cdCAqIElmIHRoZXJlIGlzIGlkbGUgdGltZSBhdmFpbGFibGUsIGl0IHdpbGwgYmUgaW5zdGFudGlhdGVkIHNvb25lci5cblx0ICovXG5cdEFmdGVyRmlyc3RSZW5kZXIsXG5cblx0LyoqXG5cdCAqIFRoZSBjb250cmlidXRpb24gaXMgY3JlYXRlZCBiZWZvcmUgdGhlIGVkaXRvciBlbWl0cyBldmVudHMgcHJvZHVjZWQgYnkgdXNlciBpbnRlcmFjdGlvbiAobW91c2UgZXZlbnRzLCBrZXlib2FyZCBldmVudHMpLlxuXHQgKiBJZiB0aGUgY29udHJpYnV0aW9uIGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkIHZpYSBgZ2V0Q29udHJpYnV0aW9uYCwgaXQgd2lsbCBiZSBpbnN0YW50aWF0ZWQgc29vbmVyLlxuXHQgKiBJZiB0aGVyZSBpcyBpZGxlIHRpbWUgYXZhaWxhYmxlLCBpdCB3aWxsIGJlIGluc3RhbnRpYXRlZCBzb29uZXIuXG5cdCAqL1xuXHRCZWZvcmVGaXJzdEludGVyYWN0aW9uLFxuXG5cdC8qKlxuXHQgKiBUaGUgY29udHJpYnV0aW9uIGlzIGNyZWF0ZWQgd2hlbiB0aGVyZSBpcyBpZGxlIHRpbWUgYXZhaWxhYmxlLCBhdCB0aGUgbGF0ZXN0IDUwMDBtcyBhZnRlciB0aGUgZWRpdG9yIGNyZWF0aW9uLlxuXHQgKiBJZiB0aGUgY29udHJpYnV0aW9uIGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkIHZpYSBgZ2V0Q29udHJpYnV0aW9uYCwgaXQgd2lsbCBiZSBpbnN0YW50aWF0ZWQgc29vbmVyLlxuXHQgKi9cblx0RXZlbnR1YWxseSxcblxuXHQvKipcblx0ICogVGhlIGNvbnRyaWJ1dGlvbiBpcyBjcmVhdGVkIG9ubHkgd2hlbiBleHBsaWNpdGx5IHJlcXVlc3RlZCB2aWEgYGdldENvbnRyaWJ1dGlvbmAuXG5cdCAqL1xuXHRMYXp5LFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGN0b3I6IEVkaXRvckNvbnRyaWJ1dGlvbkN0b3I7XG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb246IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdGN0b3I6IERpZmZFZGl0b3JDb250cmlidXRpb25DdG9yO1xufVxuXG4vLyNyZWdpb24gQ29tbWFuZFxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kS2V5YmluZGluZ3NPcHRpb25zIGV4dGVuZHMgSUtleWJpbmRpbmdzIHtcblx0a2JFeHByPzogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsO1xuXHR3ZWlnaHQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIHRoZSBkZWZhdWx0IGtleWJpbmRpbmcgYXJndW1lbnRzXG5cdCAqL1xuXHRhcmdzPzogdW5rbm93bjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRNZW51T3B0aW9ucyB7XG5cdG1lbnVJZDogTWVudUlkO1xuXHRncm91cDogc3RyaW5nO1xuXHRvcmRlcjogbnVtYmVyO1xuXHR3aGVuPzogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGljb24/OiBUaGVtZUljb247XG59XG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kT3B0aW9ucyB7XG5cdGlkOiBzdHJpbmc7XG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cdGtiT3B0cz86IElDb21tYW5kS2V5YmluZGluZ3NPcHRpb25zIHwgSUNvbW1hbmRLZXliaW5kaW5nc09wdGlvbnNbXTtcblx0bWV0YWRhdGE/OiBJQ29tbWFuZE1ldGFkYXRhO1xuXHRtZW51T3B0cz86IElDb21tYW5kTWVudU9wdGlvbnMgfCBJQ29tbWFuZE1lbnVPcHRpb25zW107XG5cdGNhblRyaWdnZXJJbmxpbmVFZGl0cz86IGJvb2xlYW47XG59XG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ29tbWFuZCB7XG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfa2JPcHRzOiBJQ29tbWFuZEtleWJpbmRpbmdzT3B0aW9ucyB8IElDb21tYW5kS2V5YmluZGluZ3NPcHRpb25zW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVPcHRzOiBJQ29tbWFuZE1lbnVPcHRpb25zIHwgSUNvbW1hbmRNZW51T3B0aW9uc1tdIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWV0YWRhdGE6IElDb21tYW5kTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjYW5UcmlnZ2VySW5saW5lRWRpdHM6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Iob3B0czogSUNvbW1hbmRPcHRpb25zKSB7XG5cdFx0dGhpcy5pZCA9IG9wdHMuaWQ7XG5cdFx0dGhpcy5wcmVjb25kaXRpb24gPSBvcHRzLnByZWNvbmRpdGlvbjtcblx0XHR0aGlzLl9rYk9wdHMgPSBvcHRzLmtiT3B0cztcblx0XHR0aGlzLl9tZW51T3B0cyA9IG9wdHMubWVudU9wdHM7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG9wdHMubWV0YWRhdGE7XG5cdFx0dGhpcy5jYW5UcmlnZ2VySW5saW5lRWRpdHMgPSBvcHRzLmNhblRyaWdnZXJJbmxpbmVFZGl0cztcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlcigpOiB2b2lkIHtcblxuXHRcdGlmIChBcnJheS5pc0FycmF5KHRoaXMuX21lbnVPcHRzKSkge1xuXHRcdFx0dGhpcy5fbWVudU9wdHMuZm9yRWFjaCh0aGlzLl9yZWdpc3Rlck1lbnVJdGVtLCB0aGlzKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX21lbnVPcHRzKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlck1lbnVJdGVtKHRoaXMuX21lbnVPcHRzKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fa2JPcHRzKSB7XG5cdFx0XHRjb25zdCBrYk9wdHNBcnIgPSBBcnJheS5pc0FycmF5KHRoaXMuX2tiT3B0cykgPyB0aGlzLl9rYk9wdHMgOiBbdGhpcy5fa2JPcHRzXTtcblx0XHRcdGZvciAoY29uc3Qga2JPcHRzIG9mIGtiT3B0c0Fycikge1xuXHRcdFx0XHRsZXQga2JXaGVuID0ga2JPcHRzLmtiRXhwcjtcblx0XHRcdFx0aWYgKHRoaXMucHJlY29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKGtiV2hlbikge1xuXHRcdFx0XHRcdFx0a2JXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKGtiV2hlbiwgdGhpcy5wcmVjb25kaXRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRrYldoZW4gPSB0aGlzLnByZWNvbmRpdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkZXNjID0ge1xuXHRcdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0XHRcdHdlaWdodDoga2JPcHRzLndlaWdodCxcblx0XHRcdFx0XHRhcmdzOiBrYk9wdHMuYXJncyxcblx0XHRcdFx0XHR3aGVuOiBrYldoZW4sXG5cdFx0XHRcdFx0cHJpbWFyeToga2JPcHRzLnByaW1hcnksXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBrYk9wdHMuc2Vjb25kYXJ5LFxuXHRcdFx0XHRcdHdpbjoga2JPcHRzLndpbixcblx0XHRcdFx0XHRsaW51eDoga2JPcHRzLmxpbnV4LFxuXHRcdFx0XHRcdG1hYzoga2JPcHRzLm1hYyxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoZGVzYyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3MpID0+IHRoaXMucnVuQ29tbWFuZChhY2Nlc3NvciwgYXJncyksXG5cdFx0XHRtZXRhZGF0YTogdGhpcy5tZXRhZGF0YVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuY2FuVHJpZ2dlcklubGluZUVkaXRzKSB7XG5cdFx0XHRUcmlnZ2VySW5saW5lRWRpdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHRoaXMuaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTWVudUl0ZW0oaXRlbTogSUNvbW1hbmRNZW51T3B0aW9ucyk6IHZvaWQge1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShpdGVtLm1lbnVJZCwge1xuXHRcdFx0Z3JvdXA6IGl0ZW0uZ3JvdXAsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0XHR0aXRsZTogaXRlbS50aXRsZSxcblx0XHRcdFx0aWNvbjogaXRlbS5pY29uLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHRoaXMucHJlY29uZGl0aW9uXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogaXRlbS53aGVuLFxuXHRcdFx0b3JkZXI6IGl0ZW0ub3JkZXJcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbi8vI2VuZHJlZ2lvbiBDb21tYW5kXG5cbi8vI3JlZ2lvbiBNdWx0aXBsZXhpbmdDb21tYW5kXG5cbi8qKlxuICogUG90ZW50aWFsIG92ZXJyaWRlIGZvciBhIGNvbW1hbmQuXG4gKlxuICogQHJldHVybiBgdHJ1ZWAgb3IgYSBQcm9taXNlIGlmIHRoZSBjb21tYW5kIHdhcyBzdWNjZXNzZnVsbHkgcnVuLiBUaGlzIHN0b3BzIG90aGVyIG92ZXJyaWRlcyBmcm9tIGJlaW5nIGV4ZWN1dGVkLlxuICovXG5leHBvcnQgdHlwZSBDb21tYW5kSW1wbGVtZW50YXRpb24gPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IGJvb2xlYW4gfCBQcm9taXNlPHZvaWQ+O1xuXG5pbnRlcmZhY2UgSUNvbW1hbmRJbXBsZW1lbnRhdGlvblJlZ2lzdHJhdGlvbiB7XG5cdHByaW9yaXR5OiBudW1iZXI7XG5cdG5hbWU6IHN0cmluZztcblx0aW1wbGVtZW50YXRpb246IENvbW1hbmRJbXBsZW1lbnRhdGlvbjtcblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlDb21tYW5kIGV4dGVuZHMgQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW1wbGVtZW50YXRpb25zOiBJQ29tbWFuZEltcGxlbWVudGF0aW9uUmVnaXN0cmF0aW9uW10gPSBbXTtcblxuXHQvKipcblx0ICogQSBoaWdoZXIgcHJpb3JpdHkgZ2V0cyB0byBiZSBsb29rZWQgYXQgZmlyc3Rcblx0ICovXG5cdHB1YmxpYyBhZGRJbXBsZW1lbnRhdGlvbihwcmlvcml0eTogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIGltcGxlbWVudGF0aW9uOiBDb21tYW5kSW1wbGVtZW50YXRpb24sIHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9pbXBsZW1lbnRhdGlvbnMucHVzaCh7IHByaW9yaXR5LCBuYW1lLCBpbXBsZW1lbnRhdGlvbiwgd2hlbiB9KTtcblx0XHR0aGlzLl9pbXBsZW1lbnRhdGlvbnMuc29ydCgoYSwgYikgPT4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5faW1wbGVtZW50YXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2ltcGxlbWVudGF0aW9uc1tpXS5pbXBsZW1lbnRhdGlvbiA9PT0gaW1wbGVtZW50YXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ltcGxlbWVudGF0aW9ucy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bG9nU2VydmljZS50cmFjZShgRXhlY3V0aW5nIENvbW1hbmQgJyR7dGhpcy5pZH0nIHdoaWNoIGhhcyAke3RoaXMuX2ltcGxlbWVudGF0aW9ucy5sZW5ndGh9IGJvdW5kLmApO1xuXHRcdGZvciAoY29uc3QgaW1wbCBvZiB0aGlzLl9pbXBsZW1lbnRhdGlvbnMpIHtcblx0XHRcdGlmIChpbXBsLndoZW4pIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBpbXBsLndoZW4uZXZhbHVhdGUoY29udGV4dCk7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaW1wbC5pbXBsZW1lbnRhdGlvbihhY2Nlc3NvciwgYXJncyk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYENvbW1hbmQgJyR7dGhpcy5pZH0nIHdhcyBoYW5kbGVkIGJ5ICcke2ltcGwubmFtZX0nLmApO1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2UudHJhY2UoYFRoZSBDb21tYW5kICcke3RoaXMuaWR9JyB3YXMgbm90IGhhbmRsZWQgYnkgYW55IGltcGxlbWVudGF0aW9uLmApO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIEEgY29tbWFuZCB0aGF0IGRlbGVnYXRlcyB0byBhbm90aGVyIGNvbW1hbmQncyBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBUaGlzIGxldHMgZGlmZmVyZW50IGNvbW1hbmRzIGJlIHJlZ2lzdGVyZWQgYnV0IHNoYXJlIHRoZSBzYW1lIGltcGxlbWVudGF0aW9uXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm94eUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kOiBDb21tYW5kLFxuXHRcdG9wdHM6IElDb21tYW5kT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0fVxuXG5cdHB1YmxpYyBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbW1hbmQucnVuQ29tbWFuZChhY2Nlc3NvciwgYXJncyk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIEVkaXRvckNvbW1hbmRcblxuZXhwb3J0IGludGVyZmFjZSBJQ29udHJpYnV0aW9uQ29tbWFuZE9wdGlvbnM8VD4gZXh0ZW5kcyBJQ29tbWFuZE9wdGlvbnMge1xuXHRoYW5kbGVyOiAoY29udHJvbGxlcjogVCwgYXJnczogdW5rbm93bikgPT4gdm9pZDtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yQ29udHJvbGxlckNvbW1hbmQ8VCBleHRlbmRzIElFZGl0b3JDb250cmlidXRpb24+IHtcblx0bmV3KG9wdHM6IElDb250cmlidXRpb25Db21tYW5kT3B0aW9uczxUPik6IEVkaXRvckNvbW1hbmQ7XG59XG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRWRpdG9yQ29tbWFuZCBleHRlbmRzIENvbW1hbmQge1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBjb21tYW5kIGNsYXNzIHRoYXQgaXMgYm91bmQgdG8gYSBjZXJ0YWluIGVkaXRvciBjb250cmlidXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGJpbmRUb0NvbnRyaWJ1dGlvbjxUIGV4dGVuZHMgSUVkaXRvckNvbnRyaWJ1dGlvbj4oY29udHJvbGxlckdldHRlcjogKGVkaXRvcjogSUNvZGVFZGl0b3IpID0+IFQgfCBudWxsKTogRWRpdG9yQ29udHJvbGxlckNvbW1hbmQ8VD4ge1xuXHRcdHJldHVybiBjbGFzcyBFZGl0b3JDb250cm9sbGVyQ29tbWFuZEltcGwgZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxiYWNrOiAoY29udHJvbGxlcjogVCwgYXJnczogdW5rbm93bikgPT4gdm9pZDtcblxuXHRcdFx0Y29uc3RydWN0b3Iob3B0czogSUNvbnRyaWJ1dGlvbkNvbW1hbmRPcHRpb25zPFQ+KSB7XG5cdFx0XHRcdHN1cGVyKG9wdHMpO1xuXG5cdFx0XHRcdHRoaXMuX2NhbGxiYWNrID0gb3B0cy5oYW5kbGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRwdWJsaWMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY29udHJvbGxlckdldHRlcihlZGl0b3IpO1xuXHRcdFx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHRoaXMuX2NhbGxiYWNrKGNvbnRyb2xsZXIsIGFyZ3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcnVuRWRpdG9yQ29tbWFuZDxUID0gdW5rbm93bj4oXG5cdFx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdFx0YXJnczogVCxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHJ1bm5lcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBUKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPlxuXHQpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdC8vIEZpbmQgdGhlIGVkaXRvciB3aXRoIHRleHQgZm9jdXMgb3IgYWN0aXZlXG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSB8fCBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdC8vIHdlbGwsIGF0IGxlYXN0IHdlIHRyaWVkLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KChlZGl0b3JBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gZWRpdG9yQWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRpZiAoIWtiU2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHByZWNvbmRpdGlvbiA/PyB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdC8vIHByZWNvbmRpdGlvbiBkb2VzIG5vdCBob2xkXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJ1bm5lcihlZGl0b3JBY2Nlc3NvciwgZWRpdG9yLCBhcmdzKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBFZGl0b3JDb21tYW5kLnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIGFyZ3MsIHRoaXMucHJlY29uZGl0aW9uLCAoYWNjZXNzb3IsIGVkaXRvciwgYXJncykgPT4gdGhpcy5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBlZGl0b3IsIGFyZ3MpKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbi8vI2VuZHJlZ2lvbiBFZGl0b3JDb21tYW5kXG5cbi8vI3JlZ2lvbiBFZGl0b3JBY3Rpb25cblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yQWN0aW9uQ29udGV4dE1lbnVPcHRpb25zIHtcblx0Z3JvdXA6IHN0cmluZztcblx0b3JkZXI6IG51bWJlcjtcblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtZW51SWQ/OiBNZW51SWQ7XG59XG5leHBvcnQgdHlwZSBJQWN0aW9uT3B0aW9ucyA9IElDb21tYW5kT3B0aW9ucyAmIHtcblx0Y29udGV4dE1lbnVPcHRzPzogSUVkaXRvckFjdGlvbkNvbnRleHRNZW51T3B0aW9ucyB8IElFZGl0b3JBY3Rpb25Db250ZXh0TWVudU9wdGlvbnNbXTtcbn0gJiAoe1xuXHRsYWJlbDogbmxzLklMb2NhbGl6ZWRTdHJpbmc7XG5cdGFsaWFzPzogc3RyaW5nO1xufSB8IHtcblx0bGFiZWw6IHN0cmluZztcblx0YWxpYXM6IHN0cmluZztcbn0pO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRWRpdG9yQWN0aW9uIGV4dGVuZHMgRWRpdG9yQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgY29udmVydE9wdGlvbnMob3B0czogSUFjdGlvbk9wdGlvbnMpOiBJQ29tbWFuZE9wdGlvbnMge1xuXG5cdFx0bGV0IG1lbnVPcHRzOiBJQ29tbWFuZE1lbnVPcHRpb25zW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob3B0cy5tZW51T3B0cykpIHtcblx0XHRcdG1lbnVPcHRzID0gb3B0cy5tZW51T3B0cztcblx0XHR9IGVsc2UgaWYgKG9wdHMubWVudU9wdHMpIHtcblx0XHRcdG1lbnVPcHRzID0gW29wdHMubWVudU9wdHNdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZW51T3B0cyA9IFtdO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHdpdGhEZWZhdWx0cyhpdGVtOiBQYXJ0aWFsPElDb21tYW5kTWVudU9wdGlvbnM+KTogSUNvbW1hbmRNZW51T3B0aW9ucyB7XG5cdFx0XHRpZiAoIWl0ZW0ubWVudUlkKSB7XG5cdFx0XHRcdGl0ZW0ubWVudUlkID0gTWVudUlkLkVkaXRvckNvbnRleHQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWl0ZW0udGl0bGUpIHtcblx0XHRcdFx0aXRlbS50aXRsZSA9IHR5cGVvZiBvcHRzLmxhYmVsID09PSAnc3RyaW5nJyA/IG9wdHMubGFiZWwgOiBvcHRzLmxhYmVsLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aXRlbS53aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKG9wdHMucHJlY29uZGl0aW9uLCBpdGVtLndoZW4pO1xuXHRcdFx0cmV0dXJuIDxJQ29tbWFuZE1lbnVPcHRpb25zPml0ZW07XG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob3B0cy5jb250ZXh0TWVudU9wdHMpKSB7XG5cdFx0XHRtZW51T3B0cy5wdXNoKC4uLm9wdHMuY29udGV4dE1lbnVPcHRzLm1hcCh3aXRoRGVmYXVsdHMpKTtcblx0XHR9IGVsc2UgaWYgKG9wdHMuY29udGV4dE1lbnVPcHRzKSB7XG5cdFx0XHRtZW51T3B0cy5wdXNoKHdpdGhEZWZhdWx0cyhvcHRzLmNvbnRleHRNZW51T3B0cykpO1xuXHRcdH1cblxuXHRcdG9wdHMubWVudU9wdHMgPSBtZW51T3B0cztcblx0XHRyZXR1cm4gPElDb21tYW5kT3B0aW9ucz5vcHRzO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBhbGlhczogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKG9wdHM6IElBY3Rpb25PcHRpb25zKSB7XG5cdFx0c3VwZXIoRWRpdG9yQWN0aW9uLmNvbnZlcnRPcHRpb25zKG9wdHMpKTtcblx0XHRpZiAodHlwZW9mIG9wdHMubGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmxhYmVsID0gb3B0cy5sYWJlbDtcblx0XHRcdHRoaXMuYWxpYXMgPSBvcHRzLmFsaWFzID8/IG9wdHMubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGFiZWwgPSBvcHRzLmxhYmVsLnZhbHVlO1xuXHRcdFx0dGhpcy5hbGlhcyA9IG9wdHMuYWxpYXMgPz8gb3B0cy5sYWJlbC5vcmlnaW5hbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnJlcG9ydFRlbGVtZXRyeShhY2Nlc3NvciwgZWRpdG9yKTtcblx0XHRyZXR1cm4gdGhpcy5ydW4oYWNjZXNzb3IsIGVkaXRvciwgYXJncyB8fCB7fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVwb3J0VGVsZW1ldHJ5KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0dHlwZSBFZGl0b3JBY3Rpb25JbnZva2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdGNvbW1lbnQ6ICdBbiBlZGl0b3IgYWN0aW9uIGhhcyBiZWVuIGludm9rZWQuJztcblx0XHRcdG5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbGFiZWwgb2YgdGhlIGFjdGlvbiB0aGF0IHdhcyBpbnZva2VkLicgfTtcblx0XHRcdGlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGFjdGlvbiB0aGF0IHdhcyBpbnZva2VkLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgRWRpdG9yQWN0aW9uSW52b2tlZEV2ZW50ID0ge1xuXHRcdFx0bmFtZTogc3RyaW5nO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9O1xuXHRcdGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSkucHVibGljTG9nMjxFZGl0b3JBY3Rpb25JbnZva2VkRXZlbnQsIEVkaXRvckFjdGlvbkludm9rZWRDbGFzc2lmaWNhdGlvbj4oJ2VkaXRvckFjdGlvbkludm9rZWQnLCB7IG5hbWU6IHRoaXMubGFiZWwsIGlkOiB0aGlzLmlkIH0pO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgdHlwZSBFZGl0b3JBY3Rpb25JbXBsZW1lbnRhdGlvbiA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bikgPT4gYm9vbGVhbiB8IFByb21pc2U8dm9pZD47XG5cbmV4cG9ydCBjbGFzcyBNdWx0aUVkaXRvckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW1wbGVtZW50YXRpb25zOiBbbnVtYmVyLCBFZGl0b3JBY3Rpb25JbXBsZW1lbnRhdGlvbl1bXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBBIGhpZ2hlciBwcmlvcml0eSBnZXRzIHRvIGJlIGxvb2tlZCBhdCBmaXJzdFxuXHQgKi9cblx0cHVibGljIGFkZEltcGxlbWVudGF0aW9uKHByaW9yaXR5OiBudW1iZXIsIGltcGxlbWVudGF0aW9uOiBFZGl0b3JBY3Rpb25JbXBsZW1lbnRhdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9pbXBsZW1lbnRhdGlvbnMucHVzaChbcHJpb3JpdHksIGltcGxlbWVudGF0aW9uXSk7XG5cdFx0dGhpcy5faW1wbGVtZW50YXRpb25zLnNvcnQoKGEsIGIpID0+IGJbMF0gLSBhWzBdKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2ltcGxlbWVudGF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9pbXBsZW1lbnRhdGlvbnNbaV1bMV0gPT09IGltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbXBsZW1lbnRhdGlvbnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgaW1wbCBvZiB0aGlzLl9pbXBsZW1lbnRhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGltcGxbMV0oYWNjZXNzb3IsIGVkaXRvciwgYXJncyk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxufVxuXG4vLyNlbmRyZWdpb24gRWRpdG9yQWN0aW9uXG5cbi8vI3JlZ2lvbiBFZGl0b3JBY3Rpb24yXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBFZGl0b3JBY3Rpb24yIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHQvLyBGaW5kIHRoZSBlZGl0b3Igd2l0aCB0ZXh0IGZvY3VzIG9yIGFjdGl2ZVxuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSB8fCBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdC8vIHdlbGwsIGF0IGxlYXN0IHdlIHRyaWVkLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIHByZWNvbmRpdGlvbiBkb2VzIGhvbGRcblx0XHRyZXR1cm4gZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoKGVkaXRvckFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBlZGl0b3JBY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBlZGl0b3JBY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGtiU2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRoaXMuZGVzYy5wcmVjb25kaXRpb24gPz8gdW5kZWZpbmVkKTtcblx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKGBbRWRpdG9yQWN0aW9uMl0gTk9UIHJ1bm5pbmcgY29tbWFuZCBiZWNhdXNlIGl0cyBwcmVjb25kaXRpb24gaXMgRkFMU0VgLCB0aGlzLmRlc2MuaWQsIHRoaXMuZGVzYy5wcmVjb25kaXRpb24/LnNlcmlhbGl6ZSgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMucnVuRWRpdG9yQ29tbWFuZChlZGl0b3JBY2Nlc3NvciwgZWRpdG9yLCAuLi5hcmdzKTtcblx0XHR9KTtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHVua25vd247XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyAtLS0gUmVnaXN0cmF0aW9uIG9mIGNvbW1hbmRzIGFuZCBhY3Rpb25zXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTW9kZWxBbmRQb3NpdGlvbkNvbW1hbmQoaWQ6IHN0cmluZywgaGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHVua25vd24pIHtcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoaWQsIGZ1bmN0aW9uIChhY2Nlc3NvciwgLi4uYXJncykge1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBbcmVzb3VyY2UsIHBvc2l0aW9uXSA9IGFyZ3M7XG5cdFx0YXNzZXJ0VHlwZShVUkkuaXNVcmkocmVzb3VyY2UpKTtcblx0XHRhc3NlcnRUeXBlKFBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvc2l0aW9uKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JQb3NpdGlvbiA9IFBvc2l0aW9uLmxpZnQocG9zaXRpb24pO1xuXHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihoYW5kbGVyLCBtb2RlbCwgZWRpdG9yUG9zaXRpb24sIC4uLmFyZ3Muc2xpY2UoMikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKS50aGVuKHJlZmVyZW5jZSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihoYW5kbGVyLCByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgUG9zaXRpb24ubGlmdChwb3NpdGlvbiksIGFyZ3Muc2xpY2UoMikpO1xuXHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRyZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJFZGl0b3JDb21tYW5kPFQgZXh0ZW5kcyBFZGl0b3JDb21tYW5kPihlZGl0b3JDb21tYW5kOiBUKTogVCB7XG5cdEVkaXRvckNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklOU1RBTkNFLnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChlZGl0b3JDb21tYW5kKTtcblx0cmV0dXJuIGVkaXRvckNvbW1hbmQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckVkaXRvckFjdGlvbjxUIGV4dGVuZHMgRWRpdG9yQWN0aW9uPihjdG9yOiB7IG5ldygpOiBUIH0pOiBUIHtcblx0Y29uc3QgYWN0aW9uID0gbmV3IGN0b3IoKTtcblx0RWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkuSU5TVEFOQ0UucmVnaXN0ZXJFZGl0b3JBY3Rpb24oYWN0aW9uKTtcblx0cmV0dXJuIGFjdGlvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTXVsdGlFZGl0b3JBY3Rpb248VCBleHRlbmRzIE11bHRpRWRpdG9yQWN0aW9uPihhY3Rpb246IFQpOiBUIHtcblx0RWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkuSU5TVEFOQ0UucmVnaXN0ZXJFZGl0b3JBY3Rpb24oYWN0aW9uKTtcblx0cmV0dXJuIGFjdGlvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVySW5zdGFudGlhdGVkRWRpdG9yQWN0aW9uKGVkaXRvckFjdGlvbjogRWRpdG9yQWN0aW9uKTogdm9pZCB7XG5cdEVkaXRvckNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklOU1RBTkNFLnJlZ2lzdGVyRWRpdG9yQWN0aW9uKGVkaXRvckFjdGlvbik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGVkaXRvciBjb250cmlidXRpb24uIEVkaXRvciBjb250cmlidXRpb25zIGhhdmUgYSBsaWZlY3ljbGUgd2hpY2ggaXMgYm91bmRcbiAqIHRvIGEgc3BlY2lmaWMgY29kZSBlZGl0b3IgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbjxTZXJ2aWNlcyBleHRlbmRzIEJyYW5kZWRTZXJ2aWNlW10+KGlkOiBzdHJpbmcsIGN0b3I6IHsgbmV3KGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLnNlcnZpY2VzOiBTZXJ2aWNlcyk6IElFZGl0b3JDb250cmlidXRpb24gfSwgaW5zdGFudGlhdGlvbjogRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbik6IHZvaWQge1xuXHRFZGl0b3JDb250cmlidXRpb25SZWdpc3RyeS5JTlNUQU5DRS5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihpZCwgY3RvciwgaW5zdGFudGlhdGlvbik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgZGlmZiBlZGl0b3IgY29udHJpYnV0aW9uLiBEaWZmIGVkaXRvciBjb250cmlidXRpb25zIGhhdmUgYSBsaWZlY3ljbGUgd2hpY2hcbiAqIGlzIGJvdW5kIHRvIGEgc3BlY2lmaWMgZGlmZiBlZGl0b3IgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRpZmZFZGl0b3JDb250cmlidXRpb248U2VydmljZXMgZXh0ZW5kcyBCcmFuZGVkU2VydmljZVtdPihpZDogc3RyaW5nLCBjdG9yOiB7IG5ldyhlZGl0b3I6IElEaWZmRWRpdG9yLCAuLi5zZXJ2aWNlczogU2VydmljZXMpOiBJRWRpdG9yQ29udHJpYnV0aW9uIH0pOiB2b2lkIHtcblx0RWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkuSU5TVEFOQ0UucmVnaXN0ZXJEaWZmRWRpdG9yQ29udHJpYnV0aW9uKGlkLCBjdG9yKTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JDb21tYW5kKGNvbW1hbmRJZDogc3RyaW5nKTogRWRpdG9yQ29tbWFuZCB7XG5cdFx0cmV0dXJuIEVkaXRvckNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklOU1RBTkNFLmdldEVkaXRvckNvbW1hbmQoY29tbWFuZElkKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JBY3Rpb25zKCk6IEl0ZXJhYmxlPEVkaXRvckFjdGlvbj4ge1xuXHRcdHJldHVybiBFZGl0b3JDb250cmlidXRpb25SZWdpc3RyeS5JTlNUQU5DRS5nZXRFZGl0b3JBY3Rpb25zKCk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpOiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIEVkaXRvckNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklOU1RBTkNFLmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhpZHM6IHN0cmluZ1tdKTogSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW10ge1xuXHRcdHJldHVybiBFZGl0b3JDb250cmlidXRpb25SZWdpc3RyeS5JTlNUQU5DRS5nZXRFZGl0b3JDb250cmlidXRpb25zKCkuZmlsdGVyKGMgPT4gaWRzLmluZGV4T2YoYy5pZCkgPj0gMCk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZ2V0RGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMoKTogSURpZmZFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdIHtcblx0XHRyZXR1cm4gRWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkuSU5TVEFOQ0UuZ2V0RGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMoKTtcblx0fVxufVxuXG4vLyBFZGl0b3IgZXh0ZW5zaW9uIHBvaW50c1xuY29uc3QgRXh0ZW5zaW9ucyA9IHtcblx0RWRpdG9yQ29tbW9uQ29udHJpYnV0aW9uczogJ2VkaXRvci5jb250cmlidXRpb25zJ1xufTtcblxuY2xhc3MgRWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSU5TVEFOQ0UgPSBuZXcgRWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckNvbnRyaWJ1dGlvbnM6IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlmZkVkaXRvckNvbnRyaWJ1dGlvbnM6IElEaWZmRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckFjdGlvbnM6IEVkaXRvckFjdGlvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQ29tbWFuZHM6IHsgW2NvbW1hbmRJZDogc3RyaW5nXTogRWRpdG9yQ29tbWFuZCB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbjxTZXJ2aWNlcyBleHRlbmRzIEJyYW5kZWRTZXJ2aWNlW10+KGlkOiBzdHJpbmcsIGN0b3I6IHsgbmV3KGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLnNlcnZpY2VzOiBTZXJ2aWNlcyk6IElFZGl0b3JDb250cmlidXRpb24gfSwgaW5zdGFudGlhdGlvbjogRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yQ29udHJpYnV0aW9ucy5wdXNoKHsgaWQsIGN0b3I6IGN0b3IgYXMgRWRpdG9yQ29udHJpYnV0aW9uQ3RvciwgaW5zdGFudGlhdGlvbiB9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0b3JDb250cmlidXRpb25zKCk6IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JDb250cmlidXRpb25zLnNsaWNlKDApO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGlmZkVkaXRvckNvbnRyaWJ1dGlvbjxTZXJ2aWNlcyBleHRlbmRzIEJyYW5kZWRTZXJ2aWNlW10+KGlkOiBzdHJpbmcsIGN0b3I6IHsgbmV3KGVkaXRvcjogSURpZmZFZGl0b3IsIC4uLnNlcnZpY2VzOiBTZXJ2aWNlcyk6IElFZGl0b3JDb250cmlidXRpb24gfSk6IHZvaWQge1xuXHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMucHVzaCh7IGlkLCBjdG9yOiBjdG9yIGFzIERpZmZFZGl0b3JDb250cmlidXRpb25DdG9yIH0pO1xuXHR9XG5cblx0cHVibGljIGdldERpZmZFZGl0b3JDb250cmlidXRpb25zKCk6IElEaWZmRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMuc2xpY2UoMCk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJFZGl0b3JBY3Rpb24oYWN0aW9uOiBFZGl0b3JBY3Rpb24pIHtcblx0XHRhY3Rpb24ucmVnaXN0ZXIoKTtcblx0XHR0aGlzLmVkaXRvckFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIGdldEVkaXRvckFjdGlvbnMoKTogSXRlcmFibGU8RWRpdG9yQWN0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yQWN0aW9ucztcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckVkaXRvckNvbW1hbmQoZWRpdG9yQ29tbWFuZDogRWRpdG9yQ29tbWFuZCkge1xuXHRcdGVkaXRvckNvbW1hbmQucmVnaXN0ZXIoKTtcblx0XHR0aGlzLmVkaXRvckNvbW1hbmRzW2VkaXRvckNvbW1hbmQuaWRdID0gZWRpdG9yQ29tbWFuZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0b3JDb21tYW5kKGNvbW1hbmRJZDogc3RyaW5nKTogRWRpdG9yQ29tbWFuZCB7XG5cdFx0cmV0dXJuICh0aGlzLmVkaXRvckNvbW1hbmRzW2NvbW1hbmRJZF0gfHwgbnVsbCk7XG5cdH1cblxufVxuUmVnaXN0cnkuYWRkKEV4dGVuc2lvbnMuRWRpdG9yQ29tbW9uQ29udHJpYnV0aW9ucywgRWRpdG9yQ29udHJpYnV0aW9uUmVnaXN0cnkuSU5TVEFOQ0UpO1xuXG5mdW5jdGlvbiByZWdpc3RlckNvbW1hbmQ8VCBleHRlbmRzIENvbW1hbmQ+KGNvbW1hbmQ6IFQpOiBUIHtcblx0Y29tbWFuZC5yZWdpc3RlcigpO1xuXHRyZXR1cm4gY29tbWFuZDtcbn1cblxuZXhwb3J0IGNvbnN0IFVuZG9Db21tYW5kID0gcmVnaXN0ZXJDb21tYW5kKG5ldyBNdWx0aUNvbW1hbmQoe1xuXHRpZDogJ3VuZG8nLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvcmUsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVpcblx0fSxcblx0bWVudU9wdHM6IFt7XG5cdFx0bWVudUlkOiBNZW51SWQuTWVudWJhckVkaXRNZW51LFxuXHRcdGdyb3VwOiAnMV9kbycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pVW5kbycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlVuZG9cIiksXG5cdFx0b3JkZXI6IDFcblx0fSwge1xuXHRcdG1lbnVJZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdGdyb3VwOiAnJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd1bmRvJywgXCJVbmRvXCIpLFxuXHRcdG9yZGVyOiAxXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5TaW1wbGVFZGl0b3JDb250ZXh0LFxuXHRcdGdyb3VwOiAnMV9kbycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndW5kbycsIFwiVW5kb1wiKSxcblx0XHRvcmRlcjogMVxuXHR9XVxufSkpO1xuXG5yZWdpc3RlckNvbW1hbmQobmV3IFByb3h5Q29tbWFuZChVbmRvQ29tbWFuZCwgeyBpZDogJ2RlZmF1bHQ6dW5kbycsIHByZWNvbmRpdGlvbjogdW5kZWZpbmVkIH0pKTtcblxuZXhwb3J0IGNvbnN0IFJlZG9Db21tYW5kID0gcmVnaXN0ZXJDb21tYW5kKG5ldyBNdWx0aUNvbW1hbmQoe1xuXHRpZDogJ3JlZG8nLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvcmUsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVksXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVpdLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5WiB9XG5cdH0sXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJFZGl0TWVudSxcblx0XHRncm91cDogJzFfZG8nLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJlZG8nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZWRvXCIpLFxuXHRcdG9yZGVyOiAyXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRncm91cDogJycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgncmVkbycsIFwiUmVkb1wiKSxcblx0XHRvcmRlcjogMVxuXHR9LCB7XG5cdFx0bWVudUlkOiBNZW51SWQuU2ltcGxlRWRpdG9yQ29udGV4dCxcblx0XHRncm91cDogJzFfZG8nLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3JlZG8nLCBcIlJlZG9cIiksXG5cdFx0b3JkZXI6IDJcblx0fV1cbn0pKTtcblxucmVnaXN0ZXJDb21tYW5kKG5ldyBQcm94eUNvbW1hbmQoUmVkb0NvbW1hbmQsIHsgaWQ6ICdkZWZhdWx0OnJlZG8nLCBwcmVjb25kaXRpb246IHVuZGVmaW5lZCB9KSk7XG5cbmV4cG9ydCBjb25zdCBTZWxlY3RBbGxDb21tYW5kID0gcmVnaXN0ZXJDb21tYW5kKG5ldyBNdWx0aUNvbW1hbmQoe1xuXHRpZDogJ2VkaXRvci5hY3Rpb24uc2VsZWN0QWxsJyxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb3JlLFxuXHRcdGtiRXhwcjogbnVsbCxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QVxuXHR9LFxuXHRtZW51T3B0czogW3tcblx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRncm91cDogJzFfYmFzaWMnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVNlbGVjdEFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNlbGVjdCBBbGxcIiksXG5cdFx0b3JkZXI6IDFcblx0fSwge1xuXHRcdG1lbnVJZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdGdyb3VwOiAnJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZWxlY3RBbGwnLCBcIlNlbGVjdCBBbGxcIiksXG5cdFx0b3JkZXI6IDFcblx0fSwge1xuXHRcdG1lbnVJZDogTWVudUlkLlNpbXBsZUVkaXRvckNvbnRleHQsXG5cdFx0Z3JvdXA6ICc5X3NlbGVjdCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2VsZWN0QWxsJywgXCJTZWxlY3QgQWxsXCIpLFxuXHRcdG9yZGVyOiAxXG5c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QSxFQUNKLGNBQWM7QUFBQSxFQUNkLFFBQVE7QUFBQSxJQUNQLFFBQVEsaUJBQWlCO0FBQUEsSUFDekIsUUFBUTtBQUFBLElBQ1IsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLEVBQ25DO0FBQUEsRUFDQSxVQUFVLENBQUM7QUFBQSxJQUNWLFFBQVEsT0FBTztBQUFBLElBQ2YsT0FBTztBQUFBLElBQ1AsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLGVBQWUsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsY0FBYztBQUFBLElBQzlGLE9BQU87QUFBQSxFQUNSLEdBQUc7QUFBQSxJQUNGLFFBQVEsT0FBTztBQUFBLElBQ2YsT0FBTztBQUFBLElBQ1AsT0FBTyxJQUFJLFNBQVMsYUFBYSxZQUFZO0FBQUEsSUFDN0MsT0FBTztBQUFBLEVBQ1IsR0FBRztBQUFBLElBQ0YsUUFBUSxPQUFPO0FBQUEsSUFDZixPQUFPO0FBQUEsSUFDUCxPQUFPLElBQUksU0FBUyxhQUFhLFlBQVk7QUFBQSxJQUM3QyxPQUFPO0FBQUEsRUFDUixDQUFDO0FBQ0YsQ0FBQyxDQUFDOyIsCiAgIm5hbWVzIjogWyJFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uIiwgImFjY2Vzc29yIiwgImFyZ3MiLCAiRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5Il0KfQo=
