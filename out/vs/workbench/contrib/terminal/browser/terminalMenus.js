import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Schemas } from "../../../../base/common/network.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { TaskExecutionSupportedContext } from "../../tasks/common/taskService.js";
import { TerminalCommandId, TERMINAL_VIEW_ID } from "../common/terminal.js";
import { TerminalContextKeys, TerminalContextKeyStrings } from "../common/terminalContextKey.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { HasSpeechProvider } from "../../speech/common/speechService.js";
import { hasKey } from "../../../../base/common/types.js";
import { TerminalContribContextKeyStrings } from "../terminalContribExports.js";
var TerminalContextMenuGroup = /* @__PURE__ */ ((TerminalContextMenuGroup2) => {
  TerminalContextMenuGroup2["Chat"] = "0_chat";
  TerminalContextMenuGroup2["Create"] = "1_create";
  TerminalContextMenuGroup2["Edit"] = "3_edit";
  TerminalContextMenuGroup2["Clear"] = "5_clear";
  TerminalContextMenuGroup2["Kill"] = "7_kill";
  TerminalContextMenuGroup2["Config"] = "9_config";
  return TerminalContextMenuGroup2;
})(TerminalContextMenuGroup || {});
var TerminalMenuBarGroup = /* @__PURE__ */ ((TerminalMenuBarGroup2) => {
  TerminalMenuBarGroup2["Create"] = "1_create";
  TerminalMenuBarGroup2["Run"] = "3_run";
  TerminalMenuBarGroup2["Manage"] = "5_manage";
  TerminalMenuBarGroup2["Configure"] = "7_configure";
  return TerminalMenuBarGroup2;
})(TerminalMenuBarGroup || {});
function setupTerminalMenus() {
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.New,
            title: localize({ key: "miNewTerminal", comment: ["&& denotes a mnemonic"] }, "&&New Terminal")
          },
          order: 1
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.NewInNewWindow,
            title: localize({ key: "miNewInNewWindow", comment: ["&& denotes a mnemonic"] }, "New Terminal &&Window"),
            precondition: ContextKeyExpr.has(TerminalContextKeyStrings.IsOpen)
          },
          order: 2,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.Split,
            title: localize({ key: "miSplitTerminal", comment: ["&& denotes a mnemonic"] }, "&&Split Terminal"),
            precondition: ContextKeyExpr.has(TerminalContextKeyStrings.IsOpen)
          },
          order: 2,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "3_run" /* Run */,
          command: {
            id: TerminalCommandId.RunActiveFile,
            title: localize({ key: "miRunActiveFile", comment: ["&& denotes a mnemonic"] }, "Run &&Active File")
          },
          order: 3,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "3_run" /* Run */,
          command: {
            id: TerminalCommandId.RunSelectedText,
            title: localize({ key: "miRunSelectedText", comment: ["&& denotes a mnemonic"] }, "Run &&Selected Text")
          },
          order: 4,
          when: TerminalContextKeys.processSupported
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.KillViewOrEditor,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelection,
            title: localize("workbench.action.terminal.copySelection.short", "Copy")
          },
          group: "3_edit" /* Edit */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelectionAsHtml,
            title: localize("workbench.action.terminal.copySelectionAsHtml", "Copy as HTML")
          },
          group: "3_edit" /* Edit */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Paste,
            title: localize("workbench.action.terminal.paste.short", "Paste")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clear", "Clear")
          },
          group: "5_clear" /* Clear */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SelectAll,
            title: localize("workbench.action.terminal.selectAll", "Select All")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      }
    ]
  );
  MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, {
    command: {
      id: TerminalCommandId.CreateTerminalEditorSameGroup,
      title: terminalStrings.new
    },
    group: "1_zzz_file",
    order: 30,
    when: TerminalContextKeys.processSupported
  });
  MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, {
    command: {
      id: TerminalCommandId.CreateTerminalEditorSameGroup,
      title: terminalStrings.new
    },
    group: "1_zzz_file",
    order: 30,
    when: TerminalContextKeys.processSupported
  });
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value
          }
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new
          },
          group: "1_create" /* Create */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.KillEditor,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelection,
            title: localize("workbench.action.terminal.copySelection.short", "Copy")
          },
          group: "3_edit" /* Edit */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelectionAsHtml,
            title: localize("workbench.action.terminal.copySelectionAsHtml", "Copy as HTML")
          },
          group: "3_edit" /* Edit */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Paste,
            title: localize("workbench.action.terminal.paste.short", "Paste")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clear", "Clear")
          },
          group: "5_clear" /* Clear */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SelectAll,
            title: localize("workbench.action.terminal.selectAll", "Select All")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "9_config" /* Config */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalTabEmptyAreaContext,
        item: {
          command: {
            id: TerminalCommandId.NewWithProfile,
            title: localize("workbench.action.terminal.newWithProfile.short", "New Terminal With Profile...")
          },
          group: "1_create" /* Create */
        }
      },
      {
        id: MenuId.TerminalTabEmptyAreaContext,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new
          },
          group: "1_create" /* Create */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: TerminalCommandId.SelectDefaultProfile,
            title: localize2("workbench.action.terminal.selectDefaultProfile", "Select Default Profile")
          },
          group: "3_configure"
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: TerminalCommandId.ConfigureTerminalSettings,
            title: localize("workbench.action.terminal.openSettings", "Configure Terminal Settings")
          },
          group: "3_configure"
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: "workbench.action.tasks.runTask",
            title: localize("workbench.action.tasks.runTask", "Run Task...")
          },
          when: TaskExecutionSupportedContext,
          group: "4_tasks",
          order: 1
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: "workbench.action.tasks.configureTaskRunner",
            title: localize("workbench.action.tasks.configureTaskRunner", "Configure Tasks...")
          },
          when: TaskExecutionSupportedContext,
          group: "4_tasks",
          order: 2
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.SwitchTerminal,
            title: localize2("workbench.action.terminal.switchTerminal", "Switch Terminal")
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`)
          )
        }
      },
      {
        // This is used to show instead of tabs when there is only a single terminal
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Focus,
            title: terminalStrings.focus
          },
          alt: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.not(TerminalContribContextKeyStrings.ChatHasHiddenTerminals),
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.has(`config.${TerminalSettingId.TabsEnabled}`),
            ContextKeyExpr.or(
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleTerminal"),
                ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
              ),
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleTerminalOrNarrow"),
                ContextKeyExpr.or(
                  ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1),
                  ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
                )
              ),
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleGroup"),
                ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
              ),
              ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "always")
            )
          )
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 2,
          when: TerminalContextKeys.shouldShowViewInlineActions
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Kill,
            title: terminalStrings.kill,
            icon: Codicon.trash
          },
          group: "navigation",
          order: 3,
          when: TerminalContextKeys.shouldShowViewInlineActions
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new,
            icon: Codicon.plus
          },
          alt: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.or(TerminalContextKeys.webExtensionContributedProfile, TerminalContextKeys.processSupported)
          )
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clearLong", "Clear Terminal"),
            icon: Codicon.clearAll
          },
          group: "navigation",
          order: 6,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.RunActiveFile,
            title: localize("workbench.action.terminal.runActiveFile", "Run Active File"),
            icon: Codicon.run
          },
          group: "navigation",
          order: 7,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.RunSelectedText,
            title: localize("workbench.action.terminal.runSelectedText", "Run Selected Text"),
            icon: Codicon.selection
          },
          group: "navigation",
          order: 8,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.StartVoice,
            title: localize("workbench.action.terminal.startVoice", "Start Dictation")
          },
          group: "navigation",
          order: 9,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("view", TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress.toNegated()),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.StopVoice,
            title: localize("workbench.action.terminal.stopVoice", "Stop Dictation")
          },
          group: "navigation",
          order: 9,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("view", TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress),
          isHiddenByDefault: true
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.SplitActiveTab,
            title: terminalStrings.split.value
          },
          group: "1_create" /* Create */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.MoveToEditor,
            title: terminalStrings.moveToEditor.value
          },
          group: "1_create" /* Create */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.MoveIntoNewWindow,
            title: terminalStrings.moveIntoNewWindow.value
          },
          group: "1_create" /* Create */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.RenameActiveTab,
            title: localize("workbench.action.terminal.renameInstance", "Rename...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.ChangeIconActiveTab,
            title: localize("workbench.action.terminal.changeIcon", "Change Icon...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.ChangeColorActiveTab,
            title: localize("workbench.action.terminal.changeColor", "Change Color...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.JoinActiveTab,
            title: localize("workbench.action.terminal.joinInstance", "Join Terminals")
          },
          when: TerminalContextKeys.tabsSingularSelection.toNegated(),
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.Unsplit,
            title: terminalStrings.unsplit.value
          },
          when: ContextKeyExpr.and(TerminalContextKeys.tabsSingularSelection, TerminalContextKeys.splitTerminalTabFocused),
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.KillActiveTab,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.MoveToTerminalPanel,
      title: terminalStrings.moveToTerminalPanel
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.Rename,
      title: terminalStrings.rename
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.ChangeColor,
      title: terminalStrings.changeColor
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.ChangeIcon,
      title: terminalStrings.changeIcon
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.SizeToContentWidth,
      title: terminalStrings.toggleSizeToContentWidth
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  for (const menuId of [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle]) {
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.CreateTerminalEditorSameGroup,
        title: terminalStrings.new,
        icon: Codicon.plus
      },
      alt: {
        id: TerminalCommandId.Split,
        title: terminalStrings.split.value,
        icon: Codicon.splitHorizontal
      },
      group: "navigation",
      order: 0,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal)
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.Clear,
        title: localize("workbench.action.terminal.clearLong", "Clear Terminal"),
        icon: Codicon.clearAll
      },
      group: "navigation",
      order: 6,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.RunActiveFile,
        title: localize("workbench.action.terminal.runActiveFile", "Run Active File"),
        icon: Codicon.run
      },
      group: "navigation",
      order: 7,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.RunSelectedText,
        title: localize("workbench.action.terminal.runSelectedText", "Run Selected Text"),
        icon: Codicon.selection
      },
      group: "navigation",
      order: 8,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.StartVoice,
        title: localize("workbench.action.terminal.startVoiceEditor", "Start Dictation"),
        icon: Codicon.mic
      },
      group: "navigation",
      order: 9,
      when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), TerminalContextKeys.terminalDictationInProgress.negate()),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.StopVoice,
        title: localize("workbench.action.terminal.stopVoiceEditor", "Stop Dictation"),
        icon: Codicon.run
      },
      group: "navigation",
      order: 10,
      when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), HasSpeechProvider, TerminalContextKeys.terminalDictationInProgress),
      isHiddenByDefault: true
    });
  }
}
function getTerminalActionBarArgs(location, profiles, defaultProfileName, contributedProfiles, terminalService, dropdownMenu, disposableStore) {
  profiles = profiles.filter((e) => !e.isAutoDetected);
  const [aiProfiles, otherProfiles] = splitProfiles(profiles);
  const [aiContributedProfiles, otherContributedProfiles] = splitContributedProfiles(contributedProfiles);
  const dropdownActions = [];
  const submenuActions = [];
  const splitLocation = location === TerminalLocation.Editor || typeof location === "object" && hasKey(location, { viewColumn: true }) && location.viewColumn === ACTIVE_GROUP ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
  if (location === TerminalLocation.Editor) {
    location = { viewColumn: ACTIVE_GROUP };
  }
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.New, terminalStrings.new, void 0, true, () => terminalService.createAndFocusTerminal())));
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.NewInNewWindow, terminalStrings.newInNewWindow.value, void 0, true, () => terminalService.createAndFocusTerminal({
    location: {
      viewColumn: AUX_WINDOW_GROUP,
      auxiliary: { compact: true }
    }
  }))));
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.Split, terminalStrings.split.value, void 0, true, () => terminalService.createAndFocusTerminal({
    location: splitLocation
  }))));
  dropdownActions.push(new Separator());
  for (const p of aiProfiles) {
    addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  for (const contributed of aiContributedProfiles) {
    addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  if ((aiProfiles.length > 0 || aiContributedProfiles.length > 0) && (otherProfiles.length > 0 || otherContributedProfiles.length > 0)) {
    dropdownActions.push(new Separator());
  }
  for (const p of otherProfiles) {
    addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  for (const contributed of otherContributedProfiles) {
    addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  if (dropdownActions.length > 0) {
    dropdownActions.push(new SubmenuAction("split.profile", localize("split.profile", "Split Terminal with Profile"), submenuActions));
    dropdownActions.push(new Separator());
  }
  const actions = dropdownMenu.getActions();
  dropdownActions.push(...Separator.join(...actions.map((a) => a[1])));
  const dropdownAction = disposableStore.add(new Action("refresh profiles", localize("launchProfile", "Launch Profile..."), "codicon-chevron-down", true));
  return { dropdownAction, dropdownMenuActions: dropdownActions, className: `terminal-tab-actions-${terminalService.resolveLocation(location)}` };
}
function splitProfiles(profiles) {
  const aiProfiles = [];
  const otherProfiles = [];
  for (const profile of profiles) {
    if (isAiProfileName(profile.profileName)) {
      aiProfiles.push(profile);
    } else {
      otherProfiles.push(profile);
    }
  }
  return [aiProfiles, otherProfiles];
}
function splitContributedProfiles(contributedProfiles) {
  const aiContributedProfiles = [];
  const otherContributedProfiles = [];
  for (const profile of contributedProfiles) {
    if (isAiContributedProfile(profile)) {
      aiContributedProfiles.push(profile);
    } else {
      otherContributedProfiles.push(profile);
    }
  }
  return [aiContributedProfiles, otherContributedProfiles];
}
function isAiContributedProfile(profile) {
  const extensionIdentifier = profile.extensionIdentifier.toLowerCase();
  if (extensionIdentifier === "github.copilot-chat" || extensionIdentifier === "anthropic.claude-code") {
    return true;
  }
  return isAiProfileName(profile.title);
}
function isAiProfileName(name) {
  const lowerCaseName = name.toLowerCase();
  return lowerCaseName.includes("copilot") || lowerCaseName.includes("claude");
}
function addProfileActions(profile, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
  const isDefault = profile.profileName === defaultProfileName;
  const options = { config: profile, location };
  const splitOptions = { config: profile, location: splitLocation };
  const sanitizedProfileName = profile.profileName.replace(/[\n\r\t]/g, "");
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.NewWithProfile, isDefault ? localize("defaultTerminalProfile", "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, void 0, true, async () => {
    await terminalService.createAndFocusTerminal(options);
  })));
  submenuActions.push(disposableStore.add(new Action(TerminalCommandId.Split, isDefault ? localize("defaultTerminalProfile", "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, void 0, true, async () => {
    await terminalService.createAndFocusTerminal(splitOptions);
  })));
}
function addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
  const isDefault = contributed.title === defaultProfileName;
  const title = isDefault ? localize("defaultTerminalProfile", "{0} (Default)", contributed.title.replace(/[\n\r\t]/g, "")) : contributed.title.replace(/[\n\r\t]/g, "");
  dropdownActions.push(disposableStore.add(new Action("contributed", title, void 0, true, () => terminalService.createAndFocusTerminal({
    config: {
      extensionIdentifier: contributed.extensionIdentifier,
      id: contributed.id,
      title
    },
    location
  }))));
  submenuActions.push(disposableStore.add(new Action("contributed-split", title, void 0, true, () => terminalService.createAndFocusTerminal({
    config: {
      extensionIdentifier: contributed.extensionIdentifier,
      id: contributed.id,
      title
    },
    location: splitLocation
  }))));
}
export {
  TerminalContextMenuGroup,
  TerminalMenuBarGroup,
  getTerminalActionBarArgs,
  setupTerminalMenus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbE1lbnVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51LCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsTG9jYXRpb24sIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlVGVybWluYWxPcHRpb25zLCBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZElkLCBURVJNSU5BTF9WSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMsIFRlcm1pbmFsQ29udGV4dEtleVN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IHRlcm1pbmFsU3RyaW5ncyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBBVVhfV0lORE9XX0dST1VQLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBIYXNTcGVlY2hQcm92aWRlciB9IGZyb20gJy4uLy4uL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRyaWJDb250ZXh0S2V5U3RyaW5ncyB9IGZyb20gJy4uL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAge1xuXHRDaGF0ID0gJzBfY2hhdCcsXG5cdENyZWF0ZSA9ICcxX2NyZWF0ZScsXG5cdEVkaXQgPSAnM19lZGl0Jyxcblx0Q2xlYXIgPSAnNV9jbGVhcicsXG5cdEtpbGwgPSAnN19raWxsJyxcblx0Q29uZmlnID0gJzlfY29uZmlnJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbE1lbnVCYXJHcm91cCB7XG5cdENyZWF0ZSA9ICcxX2NyZWF0ZScsXG5cdFJ1biA9ICczX3J1bicsXG5cdE1hbmFnZSA9ICc1X21hbmFnZScsXG5cdENvbmZpZ3VyZSA9ICc3X2NvbmZpZ3VyZSdcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwVGVybWluYWxNZW51cygpOiB2b2lkIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5DcmVhdGUsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ldyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV3VGVybWluYWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXcgVGVybWluYWxcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5DcmVhdGUsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ld0luTmV3V2luZG93LFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXdJbk5ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJOZXcgVGVybWluYWwgJiZXaW5kb3dcIiksXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmhhcyhUZXJtaW5hbENvbnRleHRLZXlTdHJpbmdzLklzT3Blbilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3BsaXRUZXJtaW5hbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNwbGl0IFRlcm1pbmFsXCIpLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5Jc09wZW4pXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLlJ1bixcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuQWN0aXZlRmlsZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUnVuQWN0aXZlRmlsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJSdW4gJiZBY3RpdmUgRmlsZVwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5SdW4sXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1blNlbGVjdGVkVGV4dCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUnVuU2VsZWN0ZWRUZXh0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlJ1biAmJlNlbGVjdGVkIFRleHRcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdF1cblx0KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFxuXHRcdFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsVmlld09yRWRpdG9yLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLnZhbHVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5LaWxsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ29weVNlbGVjdGlvbixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5U2VsZWN0aW9uLnNob3J0JywgXCJDb3B5XCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Db3B5U2VsZWN0aW9uQXNIdG1sLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlTZWxlY3Rpb25Bc0h0bWwnLCBcIkNvcHkgYXMgSFRNTFwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUGFzdGUsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucGFzdGUuc2hvcnQnLCBcIlBhc3RlXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DbGVhcixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jbGVhcicsIFwiQ2xlYXJcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ2xlYXIsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy50b2dnbGVTaXplVG9Db250ZW50V2lkdGhcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ29uZmlnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RBbGwsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0QWxsJywgXCJTZWxlY3QgQWxsXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XVxuXHQpO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAsXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ld1xuXHRcdH0sXG5cdFx0Z3JvdXA6ICcxX3p6el9maWxlJyxcblx0XHRvcmRlcjogMzAsXG5cdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRW1wdHlFZGl0b3JHcm91cENvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAsXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ld1xuXHRcdH0sXG5cdFx0Z3JvdXA6ICcxX3p6el9maWxlJyxcblx0XHRvcmRlcjogMzAsXG5cdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoXG5cdFx0W1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsRWRpdG9ySW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DcmVhdGUsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zcGxpdC52YWx1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ld1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DcmVhdGVcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsRWRpdG9yLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLnZhbHVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLktpbGxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Db3B5U2VsZWN0aW9uLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlTZWxlY3Rpb24uc2hvcnQnLCBcIkNvcHlcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsRWRpdG9ySW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNvcHlTZWxlY3Rpb25Bc0h0bWwsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weVNlbGVjdGlvbkFzSHRtbCcsIFwiQ29weSBhcyBIVE1MXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5QYXN0ZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5wYXN0ZS5zaG9ydCcsIFwiUGFzdGVcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsRWRpdG9ySW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNsZWFyLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyJywgXCJDbGVhclwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DbGVhcixcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RBbGwsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0QWxsJywgXCJTZWxlY3QgQWxsXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy50b2dnbGVTaXplVG9Db250ZW50V2lkdGhcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ29uZmlnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJFbXB0eUFyZWFDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ld1dpdGhQcm9maWxlLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dpdGhQcm9maWxlLnNob3J0JywgXCJOZXcgVGVybWluYWwgV2l0aCBQcm9maWxlLi4uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNyZWF0ZVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiRW1wdHlBcmVhQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ld1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DcmVhdGVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFxuXHRcdFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbE5ld0Ryb3Bkb3duQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3REZWZhdWx0UHJvZmlsZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0RGVmYXVsdFByb2ZpbGUnLCAnU2VsZWN0IERlZmF1bHQgUHJvZmlsZScpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyZSdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbE5ld0Ryb3Bkb3duQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Db25maWd1cmVUZXJtaW5hbFNldHRpbmdzLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm9wZW5TZXR0aW5ncycsIFwiQ29uZmlndXJlIFRlcm1pbmFsIFNldHRpbmdzXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJlJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsTmV3RHJvcGRvd25Db250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLCBcIlJ1biBUYXNrLi4uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzRfdGFza3MnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsTmV3RHJvcGRvd25Db250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZVRhc2tSdW5uZXInLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZVRhc2tSdW5uZXInLCBcIkNvbmZpZ3VyZSBUYXNrcy4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICc0X3Rhc2tzJyxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdF1cblx0KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFxuXHRcdFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3dpdGNoVGVybWluYWwsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN3aXRjaFRlcm1pbmFsJywgJ1N3aXRjaCBUZXJtaW5hbCcpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KGBjb25maWcuJHtUZXJtaW5hbFNldHRpbmdJZC5UYWJzRW5hYmxlZH1gKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdC8vIFRoaXMgaXMgdXNlZCB0byBzaG93IGluc3RlYWQgb2YgdGFicyB3aGVuIHRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgdGVybWluYWxcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXMsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmZvY3VzXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbHQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQudmFsdWUsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnNwbGl0SG9yaXpvbnRhbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoVGVybWluYWxDb250cmliQ29udGV4dEtleVN0cmluZ3MuQ2hhdEhhc0hpZGRlblRlcm1pbmFscyksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWR9YCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic1Nob3dBY3RpdmVUZXJtaW5hbH1gLCAnc2luZ2xlVGVybWluYWwnKSxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5Hcm91cENvdW50LCAxKVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFNldHRpbmdJZC5UYWJzU2hvd0FjdGl2ZVRlcm1pbmFsfWAsICdzaW5nbGVUZXJtaW5hbE9yTmFycm93JyksXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5Hcm91cENvdW50LCAxKSxcblx0XHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhUZXJtaW5hbENvbnRleHRLZXlTdHJpbmdzLlRhYnNOYXJyb3cpXG5cdFx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFNldHRpbmdJZC5UYWJzU2hvd0FjdGl2ZVRlcm1pbmFsfWAsICdzaW5nbGVHcm91cCcpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhUZXJtaW5hbENvbnRleHRLZXlTdHJpbmdzLkdyb3VwQ291bnQsIDEpXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic1Nob3dBY3RpdmVUZXJtaW5hbH1gLCAnYWx3YXlzJylcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnNwbGl0SG9yaXpvbnRhbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnNob3VsZFNob3dWaWV3SW5saW5lQWN0aW9uc1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50cmFzaFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnNob3VsZFNob3dWaWV3SW5saW5lQWN0aW9uc1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ldyxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24ucGx1c1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWx0OiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNwbGl0LnZhbHVlLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zcGxpdEhvcml6b250YWxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLndlYkV4dGVuc2lvbkNvbnRyaWJ1dGVkUHJvZmlsZSwgVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2xlYXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2xlYXJMb25nJywgXCJDbGVhciBUZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uY2xlYXJBbGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDYsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuQWN0aXZlRmlsZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5ydW5BY3RpdmVGaWxlJywgXCJSdW4gQWN0aXZlIEZpbGVcIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnJ1blxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogNyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSxcblx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SdW5TZWxlY3RlZFRleHQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuU2VsZWN0ZWRUZXh0JywgXCJSdW4gU2VsZWN0ZWQgVGV4dFwiKSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uc2VsZWN0aW9uXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiA4LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TdGFydFZvaWNlLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0YXJ0Vm9pY2UnLCBcIlN0YXJ0IERpY3RhdGlvblwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDksXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcy50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlN0b3BWb2ljZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdG9wVm9pY2UnLCBcIlN0b3AgRGljdGF0aW9uXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogOSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzKSxcblx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0QWN0aXZlVGFiLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zcGxpdC52YWx1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb0VkaXRvcixcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZVRvRWRpdG9yLnZhbHVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNyZWF0ZSxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlSW50b05ld1dpbmRvdyxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZUludG9OZXdXaW5kb3cudmFsdWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlbmFtZUFjdGl2ZVRhYixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZW5hbWVJbnN0YW5jZScsIFwiUmVuYW1lLi4uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2hhbmdlSWNvbkFjdGl2ZVRhYixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGFuZ2VJY29uJywgXCJDaGFuZ2UgSWNvbi4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUNvbG9yQWN0aXZlVGFiLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZUNvbG9yJywgXCJDaGFuZ2UgQ29sb3IuLi5cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TaXplVG9Db250ZW50V2lkdGgsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnRvZ2dsZVNpemVUb0NvbnRlbnRXaWR0aFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkpvaW5BY3RpdmVUYWIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuam9pbkluc3RhbmNlJywgXCJKb2luIFRlcm1pbmFsc1wiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy50YWJzU2luZ3VsYXJTZWxlY3Rpb24udG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5Db25maWdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuVW5zcGxpdCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MudW5zcGxpdC52YWx1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMudGFic1Npbmd1bGFyU2VsZWN0aW9uLCBUZXJtaW5hbENvbnRleHRLZXlzLnNwbGl0VGVybWluYWxUYWJGb2N1c2VkKSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNvbmZpZ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsQWN0aXZlVGFiLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLnZhbHVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLktpbGwsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTW92ZVRvVGVybWluYWxQYW5lbCxcblx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZVRvVGVybWluYWxQYW5lbFxuXHRcdH0sXG5cdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0Z3JvdXA6ICcyX2ZpbGVzJ1xuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SZW5hbWUsXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnJlbmFtZVxuXHRcdH0sXG5cdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0Z3JvdXA6ICcyX2ZpbGVzJ1xuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DaGFuZ2VDb2xvcixcblx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlQ29sb3Jcblx0XHR9LFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdGdyb3VwOiAnMl9maWxlcydcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2hhbmdlSWNvbixcblx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlSWNvblxuXHRcdH0sXG5cdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0Z3JvdXA6ICcyX2ZpbGVzJ1xuXHR9KTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy50b2dnbGVTaXplVG9Db250ZW50V2lkdGhcblx0XHR9LFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdGdyb3VwOiAnMl9maWxlcydcblx0fSk7XG5cblx0Zm9yIChjb25zdCBtZW51SWQgb2YgW01lbnVJZC5FZGl0b3JUaXRsZSwgTWVudUlkLkNvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZV0pIHtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DcmVhdGVUZXJtaW5hbEVkaXRvclNhbWVHcm91cCxcblx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXcsXG5cdFx0XHRcdGljb246IENvZGljb24ucGx1c1xuXHRcdFx0fSxcblx0XHRcdGFsdDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQudmFsdWUsXG5cdFx0XHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbClcblx0XHR9KTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DbGVhcixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyTG9uZycsIFwiQ2xlYXIgVGVybWluYWxcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uY2xlYXJBbGxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDYsXG5cdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuQWN0aXZlRmlsZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1bkFjdGl2ZUZpbGUnLCBcIlJ1biBBY3RpdmUgRmlsZVwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5ydW5cblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDcsXG5cdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuU2VsZWN0ZWRUZXh0LFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuU2VsZWN0ZWRUZXh0JywgXCJSdW4gU2VsZWN0ZWQgVGV4dFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZWxlY3Rpb25cblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDgsXG5cdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3RhcnRWb2ljZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0YXJ0Vm9pY2VFZGl0b3InLCBcIlN0YXJ0IERpY3RhdGlvblwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5taWNcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzLm5lZ2F0ZSgpKSxcblx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3RvcFZvaWNlLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3RvcFZvaWNlRWRpdG9yJywgXCJTdG9wIERpY3RhdGlvblwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5ydW5cblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLCBIYXNTcGVlY2hQcm92aWRlciwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3MpLFxuXHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGVybWluYWxBY3Rpb25CYXJBcmdzKGxvY2F0aW9uOiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsIHByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10sIGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nLCBjb250cmlidXRlZFByb2ZpbGVzOiByZWFkb25seSBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10sIHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSwgZHJvcGRvd25NZW51OiBJTWVudSwgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB7XG5cdGRyb3Bkb3duQWN0aW9uOiBJQWN0aW9uO1xuXHRkcm9wZG93bk1lbnVBY3Rpb25zOiBJQWN0aW9uW107XG5cdGNsYXNzTmFtZTogc3RyaW5nO1xuXHRkcm9wZG93bkljb24/OiBzdHJpbmc7XG59IHtcblx0cHJvZmlsZXMgPSBwcm9maWxlcy5maWx0ZXIoZSA9PiAhZS5pc0F1dG9EZXRlY3RlZCk7XG5cdGNvbnN0IFthaVByb2ZpbGVzLCBvdGhlclByb2ZpbGVzXSA9IHNwbGl0UHJvZmlsZXMocHJvZmlsZXMpO1xuXHRjb25zdCBbYWlDb250cmlidXRlZFByb2ZpbGVzLCBvdGhlckNvbnRyaWJ1dGVkUHJvZmlsZXNdID0gc3BsaXRDb250cmlidXRlZFByb2ZpbGVzKGNvbnRyaWJ1dGVkUHJvZmlsZXMpO1xuXHRjb25zdCBkcm9wZG93bkFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRjb25zdCBzdWJtZW51QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGNvbnN0IHNwbGl0TG9jYXRpb24gPSAobG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yIHx8ICh0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShsb2NhdGlvbiwgeyB2aWV3Q29sdW1uOiB0cnVlIH0pICYmIGxvY2F0aW9uLnZpZXdDb2x1bW4gPT09IEFDVElWRV9HUk9VUCkpID8geyB2aWV3Q29sdW1uOiBTSURFX0dST1VQIH0gOiB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfTtcblxuXHRpZiAobG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0bG9jYXRpb24gPSB7IHZpZXdDb2x1bW46IEFDVElWRV9HUk9VUCB9O1xuXHR9XG5cblx0ZHJvcGRvd25BY3Rpb25zLnB1c2goZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLk5ldywgdGVybWluYWxTdHJpbmdzLm5ldywgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCgpKSkpO1xuXHRkcm9wZG93bkFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oVGVybWluYWxDb21tYW5kSWQuTmV3SW5OZXdXaW5kb3csIHRlcm1pbmFsU3RyaW5ncy5uZXdJbk5ld1dpbmRvdy52YWx1ZSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCh7XG5cdFx0bG9jYXRpb246IHtcblx0XHRcdHZpZXdDb2x1bW46IEFVWF9XSU5ET1dfR1JPVVAsXG5cdFx0XHRhdXhpbGlhcnk6IHsgY29tcGFjdDogdHJ1ZSB9LFxuXHRcdH1cblx0fSkpKSk7XG5cdGRyb3Bkb3duQWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbihUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCwgdGVybWluYWxTdHJpbmdzLnNwbGl0LnZhbHVlLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRlcm1pbmFsU2VydmljZS5jcmVhdGVBbmRGb2N1c1Rlcm1pbmFsKHtcblx0XHRsb2NhdGlvbjogc3BsaXRMb2NhdGlvblxuXHR9KSkpKTtcblx0ZHJvcGRvd25BY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0Zm9yIChjb25zdCBwIG9mIGFpUHJvZmlsZXMpIHtcblx0XHRhZGRQcm9maWxlQWN0aW9ucyhwLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGxvY2F0aW9uLCBzcGxpdExvY2F0aW9uLCB0ZXJtaW5hbFNlcnZpY2UsIGRyb3Bkb3duQWN0aW9ucywgc3VibWVudUFjdGlvbnMsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdH1cblx0Zm9yIChjb25zdCBjb250cmlidXRlZCBvZiBhaUNvbnRyaWJ1dGVkUHJvZmlsZXMpIHtcblx0XHRhZGRDb250cmlidXRlZFByb2ZpbGVBY3Rpb25zKGNvbnRyaWJ1dGVkLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGxvY2F0aW9uLCBzcGxpdExvY2F0aW9uLCB0ZXJtaW5hbFNlcnZpY2UsIGRyb3Bkb3duQWN0aW9ucywgc3VibWVudUFjdGlvbnMsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdH1cblx0aWYgKChhaVByb2ZpbGVzLmxlbmd0aCA+IDAgfHwgYWlDb250cmlidXRlZFByb2ZpbGVzLmxlbmd0aCA+IDApICYmIChvdGhlclByb2ZpbGVzLmxlbmd0aCA+IDAgfHwgb3RoZXJDb250cmlidXRlZFByb2ZpbGVzLmxlbmd0aCA+IDApKSB7XG5cdFx0ZHJvcGRvd25BY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0fVxuXG5cdGZvciAoY29uc3QgcCBvZiBvdGhlclByb2ZpbGVzKSB7XG5cdFx0YWRkUHJvZmlsZUFjdGlvbnMocCwgZGVmYXVsdFByb2ZpbGVOYW1lLCBsb2NhdGlvbiwgc3BsaXRMb2NhdGlvbiwgdGVybWluYWxTZXJ2aWNlLCBkcm9wZG93bkFjdGlvbnMsIHN1Ym1lbnVBY3Rpb25zLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHR9XG5cblx0Zm9yIChjb25zdCBjb250cmlidXRlZCBvZiBvdGhlckNvbnRyaWJ1dGVkUHJvZmlsZXMpIHtcblx0XHRhZGRDb250cmlidXRlZFByb2ZpbGVBY3Rpb25zKGNvbnRyaWJ1dGVkLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGxvY2F0aW9uLCBzcGxpdExvY2F0aW9uLCB0ZXJtaW5hbFNlcnZpY2UsIGRyb3Bkb3duQWN0aW9ucywgc3VibWVudUFjdGlvbnMsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdH1cblxuXHRpZiAoZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRkcm9wZG93bkFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignc3BsaXQucHJvZmlsZScsIGxvY2FsaXplKCdzcGxpdC5wcm9maWxlJywgJ1NwbGl0IFRlcm1pbmFsIHdpdGggUHJvZmlsZScpLCBzdWJtZW51QWN0aW9ucykpO1xuXHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdH1cblx0Y29uc3QgYWN0aW9ucyA9IGRyb3Bkb3duTWVudS5nZXRBY3Rpb25zKCk7XG5cdGRyb3Bkb3duQWN0aW9ucy5wdXNoKC4uLlNlcGFyYXRvci5qb2luKC4uLmFjdGlvbnMubWFwKGEgPT4gYVsxXSkpKTtcblxuXHRjb25zdCBkcm9wZG93bkFjdGlvbiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbigncmVmcmVzaCBwcm9maWxlcycsIGxvY2FsaXplKCdsYXVuY2hQcm9maWxlJywgJ0xhdW5jaCBQcm9maWxlLi4uJyksICdjb2RpY29uLWNoZXZyb24tZG93bicsIHRydWUpKTtcblx0cmV0dXJuIHsgZHJvcGRvd25BY3Rpb24sIGRyb3Bkb3duTWVudUFjdGlvbnM6IGRyb3Bkb3duQWN0aW9ucywgY2xhc3NOYW1lOiBgdGVybWluYWwtdGFiLWFjdGlvbnMtJHt0ZXJtaW5hbFNlcnZpY2UucmVzb2x2ZUxvY2F0aW9uKGxvY2F0aW9uKX1gIH07XG59XG5cbmZ1bmN0aW9uIHNwbGl0UHJvZmlsZXMocHJvZmlsZXM6IHJlYWRvbmx5IElUZXJtaW5hbFByb2ZpbGVbXSk6IFtJVGVybWluYWxQcm9maWxlW10sIElUZXJtaW5hbFByb2ZpbGVbXV0ge1xuXHRjb25zdCBhaVByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10gPSBbXTtcblx0Y29uc3Qgb3RoZXJQcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdID0gW107XG5cdGZvciAoY29uc3QgcHJvZmlsZSBvZiBwcm9maWxlcykge1xuXHRcdGlmIChpc0FpUHJvZmlsZU5hbWUocHJvZmlsZS5wcm9maWxlTmFtZSkpIHtcblx0XHRcdGFpUHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3RoZXJQcm9maWxlcy5wdXNoKHByb2ZpbGUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gW2FpUHJvZmlsZXMsIG90aGVyUHJvZmlsZXNdO1xufVxuXG5mdW5jdGlvbiBzcGxpdENvbnRyaWJ1dGVkUHJvZmlsZXMoY29udHJpYnV0ZWRQcm9maWxlczogcmVhZG9ubHkgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdKTogW0lFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbXSwgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdXSB7XG5cdGNvbnN0IGFpQ29udHJpYnV0ZWRQcm9maWxlczogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdID0gW107XG5cdGNvbnN0IG90aGVyQ29udHJpYnV0ZWRQcm9maWxlczogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdID0gW107XG5cdGZvciAoY29uc3QgcHJvZmlsZSBvZiBjb250cmlidXRlZFByb2ZpbGVzKSB7XG5cdFx0aWYgKGlzQWlDb250cmlidXRlZFByb2ZpbGUocHJvZmlsZSkpIHtcblx0XHRcdGFpQ29udHJpYnV0ZWRQcm9maWxlcy5wdXNoKHByb2ZpbGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvdGhlckNvbnRyaWJ1dGVkUHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFthaUNvbnRyaWJ1dGVkUHJvZmlsZXMsIG90aGVyQ29udHJpYnV0ZWRQcm9maWxlc107XG59XG5cbmZ1bmN0aW9uIGlzQWlDb250cmlidXRlZFByb2ZpbGUocHJvZmlsZTogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSk6IGJvb2xlYW4ge1xuXHRjb25zdCBleHRlbnNpb25JZGVudGlmaWVyID0gcHJvZmlsZS5leHRlbnNpb25JZGVudGlmaWVyLnRvTG93ZXJDYXNlKCk7XG5cdGlmIChleHRlbnNpb25JZGVudGlmaWVyID09PSAnZ2l0aHViLmNvcGlsb3QtY2hhdCcgfHwgZXh0ZW5zaW9uSWRlbnRpZmllciA9PT0gJ2FudGhyb3BpYy5jbGF1ZGUtY29kZScpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBpc0FpUHJvZmlsZU5hbWUocHJvZmlsZS50aXRsZSk7XG59XG5cbmZ1bmN0aW9uIGlzQWlQcm9maWxlTmFtZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgbG93ZXJDYXNlTmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIGxvd2VyQ2FzZU5hbWUuaW5jbHVkZXMoJ2NvcGlsb3QnKSB8fCBsb3dlckNhc2VOYW1lLmluY2x1ZGVzKCdjbGF1ZGUnKTtcbn1cblxuZnVuY3Rpb24gYWRkUHJvZmlsZUFjdGlvbnMoXG5cdHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUsXG5cdGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nLFxuXHRsb2NhdGlvbjogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLFxuXHRzcGxpdExvY2F0aW9uOiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsXG5cdHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0ZHJvcGRvd25BY3Rpb25zOiBJQWN0aW9uW10sXG5cdHN1Ym1lbnVBY3Rpb25zOiBJQWN0aW9uW10sXG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlXG4pOiB2b2lkIHtcblx0Y29uc3QgaXNEZWZhdWx0ID0gcHJvZmlsZS5wcm9maWxlTmFtZSA9PT0gZGVmYXVsdFByb2ZpbGVOYW1lO1xuXHRjb25zdCBvcHRpb25zOiBJQ3JlYXRlVGVybWluYWxPcHRpb25zID0geyBjb25maWc6IHByb2ZpbGUsIGxvY2F0aW9uIH07XG5cdGNvbnN0IHNwbGl0T3B0aW9uczogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyA9IHsgY29uZmlnOiBwcm9maWxlLCBsb2NhdGlvbjogc3BsaXRMb2NhdGlvbiB9O1xuXHRjb25zdCBzYW5pdGl6ZWRQcm9maWxlTmFtZSA9IHByb2ZpbGUucHJvZmlsZU5hbWUucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpO1xuXHRkcm9wZG93bkFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oVGVybWluYWxDb21tYW5kSWQuTmV3V2l0aFByb2ZpbGUsIGlzRGVmYXVsdCA/IGxvY2FsaXplKCdkZWZhdWx0VGVybWluYWxQcm9maWxlJywgXCJ7MH0gKERlZmF1bHQpXCIsIHNhbml0aXplZFByb2ZpbGVOYW1lKSA6IHNhbml0aXplZFByb2ZpbGVOYW1lLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbChvcHRpb25zKTtcblx0fSkpKTtcblx0c3VibWVudUFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oVGVybWluYWxDb21tYW5kSWQuU3BsaXQsIGlzRGVmYXVsdCA/IGxvY2FsaXplKCdkZWZhdWx0VGVybWluYWxQcm9maWxlJywgXCJ7MH0gKERlZmF1bHQpXCIsIHNhbml0aXplZFByb2ZpbGVOYW1lKSA6IHNhbml0aXplZFByb2ZpbGVOYW1lLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbChzcGxpdE9wdGlvbnMpO1xuXHR9KSkpO1xufVxuXG5mdW5jdGlvbiBhZGRDb250cmlidXRlZFByb2ZpbGVBY3Rpb25zKFxuXHRjb250cmlidXRlZDogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSxcblx0ZGVmYXVsdFByb2ZpbGVOYW1lOiBzdHJpbmcsXG5cdGxvY2F0aW9uOiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsXG5cdHNwbGl0TG9jYXRpb246IElUZXJtaW5hbExvY2F0aW9uT3B0aW9ucyxcblx0dGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRkcm9wZG93bkFjdGlvbnM6IElBY3Rpb25bXSxcblx0c3VibWVudUFjdGlvbnM6IElBY3Rpb25bXSxcblx0ZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmVcbik6IHZvaWQge1xuXHRjb25zdCBpc0RlZmF1bHQgPSBjb250cmlidXRlZC50aXRsZSA9PT0gZGVmYXVsdFByb2ZpbGVOYW1lO1xuXHRjb25zdCB0aXRsZSA9IGlzRGVmYXVsdCA/IGxvY2FsaXplKCdkZWZhdWx0VGVybWluYWxQcm9maWxlJywgXCJ7MH0gKERlZmF1bHQpXCIsIGNvbnRyaWJ1dGVkLnRpdGxlLnJlcGxhY2UoL1tcXG5cXHJcXHRdL2csICcnKSkgOiBjb250cmlidXRlZC50aXRsZS5yZXBsYWNlKC9bXFxuXFxyXFx0XS9nLCAnJyk7XG5cdGRyb3Bkb3duQWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignY29udHJpYnV0ZWQnLCB0aXRsZSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCh7XG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiBjb250cmlidXRlZC5leHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdFx0aWQ6IGNvbnRyaWJ1dGVkLmlkLFxuXHRcdFx0dGl0bGVcblx0XHR9LFxuXHRcdGxvY2F0aW9uXG5cdH0pKSkpO1xuXHRzdWJtZW51QWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbignY29udHJpYnV0ZWQtc3BsaXQnLCB0aXRsZSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCh7XG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiBjb250cmlidXRlZC5leHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdFx0aWQ6IGNvbnRyaWJ1dGVkLmlkLFxuXHRcdFx0dGl0bGVcblx0XHR9LFxuXHRcdGxvY2F0aW9uOiBzcGxpdExvY2F0aW9uXG5cdH0pKSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxRQUFpQixXQUFXLHFCQUFxQjtBQUMxRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBZ0IsUUFBUSxvQkFBb0I7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBc0Qsa0JBQWtCLHlCQUF5QjtBQUNqRyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLG1CQUFtQix3QkFBd0I7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
