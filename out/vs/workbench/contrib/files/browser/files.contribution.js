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
import { sep } from "../../../../base/common/path.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { AutoSaveConfiguration, HotExitConfiguration, FILES_EXCLUDE_CONFIG, FILES_ASSOCIATIONS_CONFIG, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, FILES_READONLY_FROM_PERMISSIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { SortOrder, LexicographicOptions, FILE_EDITOR_INPUT_ID, BINARY_TEXT_FILE_MODE, UndoConfirmLevel } from "../common/files.js";
import { TextFileEditorTracker } from "./editors/textFileEditorTracker.js";
import { TextFileSaveErrorHandler } from "./editors/textFileSaveErrorHandler.js";
import { FileEditorInput } from "./editors/fileEditorInput.js";
import { BinaryFileEditor } from "./editors/binaryFileEditor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { isNative, isWeb, isWindows } from "../../../../base/common/platform.js";
import { ExplorerViewletViewsContribution } from "./explorerViewlet.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ExplorerService, UNDO_REDO_SOURCE } from "./explorerService.js";
import { GUESSABLE_ENCODINGS, SUPPORTED_ENCODINGS } from "../../../services/textfile/common/encoding.js";
import { Schemas } from "../../../../base/common/network.js";
import { WorkspaceWatcher } from "./workspaceWatcher.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { DirtyFilesIndicator } from "../common/dirtyFilesIndicator.js";
import { UndoCommand, RedoCommand } from "../../../../editor/browser/editorExtensions.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IExplorerService } from "./files.js";
import { FileEditorInputSerializer, FileEditorWorkingCopyEditorHandler } from "./editors/fileEditorHandler.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TextFileEditor } from "./editors/textFileEditor.js";
let FileUriLabelContribution = class {
  constructor(labelService) {
    labelService.registerFormatter({
      scheme: Schemas.file,
      formatting: {
        label: "${authority}${path}",
        separator: sep,
        tildify: !isWindows,
        normalizeDriveLetter: isWindows,
        authorityPrefix: sep + sep,
        workspaceSuffix: ""
      }
    });
  }
};
FileUriLabelContribution.ID = "workbench.contrib.fileUriLabel";
FileUriLabelContribution = __decorateClass([
  __decorateParam(0, ILabelService)
], FileUriLabelContribution);
registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextFileEditor,
    TextFileEditor.ID,
    nls.localize("textFileEditor", "Text File Editor")
  ),
  [
    new SyncDescriptor(FileEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    BinaryFileEditor,
    BinaryFileEditor.ID,
    nls.localize("binaryFileEditor", "Binary File Editor")
  ),
  [
    new SyncDescriptor(FileEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerFileEditorFactory({
  typeId: FILE_EDITOR_INPUT_ID,
  createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService) => {
    return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
  },
  isFileEditor: (obj) => {
    return obj instanceof FileEditorInput;
  }
});
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(FILE_EDITOR_INPUT_ID, FileEditorInputSerializer);
registerWorkbenchContribution2(FileEditorWorkingCopyEditorHandler.ID, FileEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ExplorerViewletViewsContribution.ID, ExplorerViewletViewsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(TextFileEditorTracker.ID, TextFileEditorTracker, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(TextFileSaveErrorHandler.ID, TextFileSaveErrorHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(FileUriLabelContribution.ID, FileUriLabelContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorkspaceWatcher.ID, WorkspaceWatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DirtyFilesIndicator.ID, DirtyFilesIndicator, WorkbenchPhase.BlockStartup);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
const hotExitConfiguration = isNative ? {
  "type": "string",
  "scope": ConfigurationScope.APPLICATION,
  "enum": [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
  "default": HotExitConfiguration.ON_EXIT,
  "markdownEnumDescriptions": [
    nls.localize("hotExit.off", "Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes."),
    nls.localize("hotExit.onExit", "Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu). All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`"),
    nls.localize("hotExit.onExitAndWindowClose", "Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), and also for any window with a folder opened regardless of whether it's the last window. All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`")
  ],
  "markdownDescription": nls.localize("hotExit", "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
} : {
  "type": "string",
  "scope": ConfigurationScope.APPLICATION,
  "enum": [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
  "default": HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE,
  "markdownEnumDescriptions": [
    nls.localize("hotExit.off", "Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes."),
    nls.localize("hotExit.onExitAndWindowCloseBrowser", "Hot exit will be triggered when the browser quits or the window or tab is closed.")
  ],
  "markdownDescription": nls.localize("hotExit", "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
};
configurationRegistry.registerConfiguration({
  "id": "files",
  "order": 9,
  "title": nls.localize("filesConfigurationTitle", "Files"),
  "type": "object",
  "properties": {
    [FILES_EXCLUDE_CONFIG]: {
      "type": "object",
      "markdownDescription": nls.localize("exclude", "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders. For example, the File Explorer decides which files and folders to show or hide based on this setting. Refer to the `#search.exclude#` setting to define search-specific excludes. Refer to the `#explorer.excludeGitIgnore#` setting for ignoring files based on your `.gitignore`."),
      "default": {
        ...{ "**/.git": true, "**/.svn": true, "**/.hg": true, "**/.DS_Store": true, "**/Thumbs.db": true },
        ...isWeb ? {
          "**/*.crswap": true
          /* filter out swap files used for local file access */
        } : void 0
      },
      "scope": ConfigurationScope.RESOURCE,
      "additionalProperties": {
        "anyOf": [
          {
            "type": "boolean",
            "enum": [true, false],
            "enumDescriptions": [nls.localize("trueDescription", "Enable the pattern."), nls.localize("falseDescription", "Disable the pattern.")],
            "description": nls.localize("files.exclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            "type": "object",
            "properties": {
              "when": {
                "type": "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                "pattern": "\\w*\\$\\(basename\\)\\w*",
                "default": "$(basename).ext",
                "markdownDescription": nls.localize({ key: "files.exclude.when", comment: ["\\$(basename) should not be translated"] }, "Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.")
              }
            }
          }
        ]
      }
    },
    [FILES_ASSOCIATIONS_CONFIG]: {
      "type": "object",
      "markdownDescription": nls.localize("associations", 'Configure [glob patterns](https://aka.ms/vscode-glob-patterns) of file associations to languages (for example `"*.extension": "html"`). Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. These have precedence over the default associations of the languages installed.'),
      "additionalProperties": {
        "type": "string"
      }
    },
    "files.encoding": {
      "type": "string",
      "enum": Object.keys(SUPPORTED_ENCODINGS),
      "default": "utf8",
      "description": nls.localize("encoding", "The default character set encoding to use when reading and writing files. This setting can also be configured per language."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE,
      "enumDescriptions": Object.keys(SUPPORTED_ENCODINGS).map((key) => SUPPORTED_ENCODINGS[key].labelLong),
      "enumItemLabels": Object.keys(SUPPORTED_ENCODINGS).map((key) => SUPPORTED_ENCODINGS[key].labelLong)
    },
    "files.autoGuessEncoding": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoGuessEncoding", "When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language. Note, this setting is not respected by text search. Only {0} is respected.", "`#files.encoding#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.candidateGuessEncodings": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": Object.keys(GUESSABLE_ENCODINGS),
        "enumDescriptions": Object.keys(GUESSABLE_ENCODINGS).map((key) => GUESSABLE_ENCODINGS[key].labelLong)
      },
      "default": [],
      "markdownDescription": nls.localize("candidateGuessEncodings", "List of character set encodings that the editor should attempt to guess in the order they are listed. In case it cannot be determined, {0} is respected", "`#files.encoding#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.eol": {
      "type": "string",
      "enum": [
        "\n",
        "\r\n",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("eol.LF", "LF"),
        nls.localize("eol.CRLF", "CRLF"),
        nls.localize("eol.auto", "Uses operating system specific end of line character.")
      ],
      "default": "auto",
      "description": nls.localize("eol", "The default end of line character."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.enableTrash": {
      "type": "boolean",
      "default": true,
      "description": nls.localize("useTrash", "Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.")
    },
    "files.trimTrailingWhitespace": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("trimTrailingWhitespace", "When enabled, will trim trailing whitespace when saving a file."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.trimTrailingWhitespaceInRegexAndStrings": {
      "type": "boolean",
      "default": true,
      "description": nls.localize("trimTrailingWhitespaceInRegexAndStrings", "When enabled, trailing whitespace will be removed from multiline strings and regexes on save or when executing 'editor.action.trimTrailingWhitespace'. This can cause whitespace to not be trimmed from lines when there isn't up-to-date token information."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.insertFinalNewline": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("insertFinalNewline", "When enabled, insert a final new line at the end of the file when saving it."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.trimFinalNewlines": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("trimFinalNewlines", "When enabled, will trim all new lines after the final new line at the end of the file when saving it."),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSave": {
      "type": "string",
      "enum": [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE],
      "markdownEnumDescriptions": [
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.off" }, "An editor with changes is never automatically saved."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.afterDelay" }, "An editor with changes is automatically saved after the configured `#files.autoSaveDelay#`."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.onFocusChange" }, "An editor with changes is automatically saved when the editor loses focus."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.onWindowChange" }, "An editor with changes is automatically saved when the window loses focus.")
      ],
      "default": isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF,
      "markdownDescription": nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "autoSave" }, "Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE, AutoSaveConfiguration.AFTER_DELAY),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      agentsWindow: { default: "afterDelay" }
    },
    "files.autoSaveDelay": {
      "type": "number",
      "default": 1e3,
      "minimum": 0,
      "markdownDescription": nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "autoSaveDelay" }, "Controls the delay in milliseconds after which an editor with unsaved changes is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.", AutoSaveConfiguration.AFTER_DELAY),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSaveWorkspaceFilesOnly": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoSaveWorkspaceFilesOnly", "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that are inside the opened workspace. Only applies when {0} is enabled.", "`#files.autoSave#`"),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSaveWhenNoErrors": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoSaveWhenNoErrors", "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that have no errors reported in them at the time the auto save is triggered. Only applies when {0} is enabled.", "`#files.autoSave#`"),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.watcherExclude": {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {
        // Avoiding a '**' pattern here which results in a very complex
        // RegExp that can slow things down significantly in large workspaces
        ".git/objects/**": true,
        ".git/subtree-cache/**": true,
        ".hg/store/**": true,
        "*/.git/objects/**": true,
        "*/.git/subtree-cache/**": true,
        "*/.hg/store/**": true
      },
      "markdownDescription": nls.localize("watcherExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from file watching. Paths can either be relative to the watched folder or absolute. Glob patterns are matched relative from the watched folder. When you experience the file watcher process consuming a lot of CPU, make sure to exclude large folders that are of less interest (such as build output folders)."),
      "scope": ConfigurationScope.RESOURCE
    },
    "files.watcherInclude": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": [],
      "description": nls.localize("watcherInclude", "Configure extra paths to watch for changes inside the workspace. By default, all workspace folders will be watched recursively, except for folders that are symbolic links. You can explicitly add absolute or relative paths to support watching folders that are symbolic links. Relative paths will be resolved to an absolute path using the currently opened workspace."),
      "scope": ConfigurationScope.RESOURCE
    },
    "files.hotExit": hotExitConfiguration,
    "files.defaultLanguage": {
      "type": "string",
      "markdownDescription": nls.localize("defaultLanguage", "The default language identifier that is assigned to new files. If configured to `${activeEditorLanguage}`, will use the language identifier of the currently active text editor if any.")
    },
    [FILES_READONLY_INCLUDE_CONFIG]: {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {},
      "markdownDescription": nls.localize("filesReadonlyInclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to mark as read-only. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. You can exclude matching paths via the `#files.readonlyExclude#` setting. Files from readonly file system providers will always be read-only independent of this setting."),
      "scope": ConfigurationScope.RESOURCE
    },
    [FILES_READONLY_EXCLUDE_CONFIG]: {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {},
      "markdownDescription": nls.localize("filesReadonlyExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from being marked as read-only if they match as a result of the `#files.readonlyInclude#` setting. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. Files from readonly file system providers will always be read-only independent of this setting."),
      "scope": ConfigurationScope.RESOURCE
    },
    [FILES_READONLY_FROM_PERMISSIONS_CONFIG]: {
      "type": "boolean",
      "markdownDescription": nls.localize("filesReadonlyFromPermissions", "Marks files as read-only when their file permissions indicate as such. This can be overridden via `#files.readonlyInclude#` and `#files.readonlyExclude#` settings."),
      "default": false
    },
    "files.restoreUndoStack": {
      "type": "boolean",
      "description": nls.localize("files.restoreUndoStack", "Restore the undo stack when a file is reopened."),
      "default": true
    },
    "files.saveConflictResolution": {
      "type": "string",
      "enum": [
        "askUser",
        "overwriteFileOnDisk"
      ],
      "enumDescriptions": [
        nls.localize("askUser", "Will refuse to save and ask for resolving the save conflict manually."),
        nls.localize("overwriteFileOnDisk", "Will resolve the save conflict by overwriting the file on disk with the changes in the editor.")
      ],
      "description": nls.localize("files.saveConflictResolution", "A save conflict can occur when a file is saved to disk that was changed by another program in the meantime. To prevent data loss, the user is asked to compare the changes in the editor with the version on disk. This setting should only be changed if you frequently encounter save conflict errors and may result in data loss if used without caution."),
      "default": "askUser",
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.dialog.defaultPath": {
      "type": "string",
      "pattern": "^((\\/|\\\\\\\\|[a-zA-Z]:\\\\).*)?$",
      // slash OR UNC-root OR drive-root OR undefined
      "patternErrorMessage": nls.localize("defaultPathErrorMessage", "Default path for file dialogs must be an absolute path (e.g. C:\\\\myFolder or /myFolder)."),
      "description": nls.localize("fileDialogDefaultPath", "Default path for file dialogs, overriding user's home path. Only used in the absence of a context-specific path, such as most recently opened file or folder."),
      "scope": ConfigurationScope.MACHINE
    },
    "files.simpleDialog.enable": {
      "type": "boolean",
      "description": nls.localize("files.simpleDialog.enable", "Enables the simple file dialog for opening and saving files and folders. The simple file dialog replaces the system file dialog when enabled."),
      "default": false
    },
    "files.participants.timeout": {
      type: "number",
      default: 6e4,
      markdownDescription: nls.localize("files.participants.timeout", "Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants.")
    }
  }
});
configurationRegistry.registerConfiguration({
  ...editorConfigurationBaseNode,
  properties: {
    "editor.formatOnSave": {
      "type": "boolean",
      "markdownDescription": nls.localize("formatOnSave", "Format a file on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", "`#files.autoSave#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "editor.formatOnSaveMode": {
      "type": "string",
      "default": "file",
      "enum": [
        "file",
        "modifications",
        "modificationsIfAvailable"
      ],
      "enumDescriptions": [
        nls.localize({ key: "everything", comment: ["This is the description of an option"] }, "Format the whole file."),
        nls.localize({ key: "modification", comment: ["This is the description of an option"] }, "Format modifications. Requires source control and a formatter that supports 'Format Selection'."),
        nls.localize({ key: "modificationIfAvailable", comment: ["This is the description of an option"] }, "Will attempt to format modifications only (requires source control and a formatter that supports 'Format Selection'). If source control can't be used, then the whole file will be formatted.")
      ],
      "markdownDescription": nls.localize("formatOnSaveMode", "Controls if format on save formats the whole file or only modifications. Only applies when `#editor.formatOnSave#` is enabled."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    }
  }
});
configurationRegistry.registerConfiguration({
  "id": "explorer",
  "order": 10,
  "title": nls.localize("explorerConfigurationTitle", "File Explorer"),
  "type": "object",
  "properties": {
    "explorer.openEditors.visible": {
      "type": "number",
      "description": nls.localize({ key: "openEditorsVisible", comment: ["Open is an adjective"] }, "The initial maximum number of editors shown in the Open Editors pane. Exceeding this limit will show a scroll bar and allow resizing the pane to display more items."),
      "default": 9,
      "minimum": 1
    },
    "explorer.openEditors.minVisible": {
      "type": "number",
      "description": nls.localize({ key: "openEditorsVisibleMin", comment: ["Open is an adjective"] }, "The minimum number of editor slots pre-allocated in the Open Editors pane. If set to 0 the Open Editors pane will dynamically resize based on the number of editors."),
      "default": 0,
      "minimum": 0
    },
    "explorer.openEditors.sortOrder": {
      "type": "string",
      "enum": ["editorOrder", "alphabetical", "fullPath"],
      "description": nls.localize({ key: "openEditorsSortOrder", comment: ["Open is an adjective"] }, "Controls the sorting order of editors in the Open Editors pane."),
      "enumDescriptions": [
        nls.localize("sortOrder.editorOrder", "Editors are ordered in the same order editor tabs are shown."),
        nls.localize("sortOrder.alphabetical", "Editors are ordered alphabetically by tab name inside each editor group."),
        nls.localize("sortOrder.fullPath", "Editors are ordered alphabetically by full path inside each editor group.")
      ],
      "default": "editorOrder"
    },
    "explorer.autoReveal": {
      "type": ["boolean", "string"],
      "enum": [true, false, "focusNoScroll"],
      "default": true,
      "enumDescriptions": [
        nls.localize("autoReveal.on", "Files will be revealed and selected."),
        nls.localize("autoReveal.off", "Files will not be revealed and selected."),
        nls.localize("autoReveal.focusNoScroll", "Files will not be scrolled into view, but will still be focused.")
      ],
      "description": nls.localize("autoReveal", "Controls whether the Explorer should automatically reveal and select files when opening them.")
    },
    "explorer.autoRevealExclude": {
      "type": "object",
      "markdownDescription": nls.localize("autoRevealExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders from being revealed and selected in the Explorer when they are opened. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths."),
      "default": { "**/node_modules": true, "**/bower_components": true },
      "additionalProperties": {
        "anyOf": [
          {
            "type": "boolean",
            "description": nls.localize("explorer.autoRevealExclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            type: "object",
            properties: {
              when: {
                type: "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                pattern: "\\w*\\$\\(basename\\)\\w*",
                default: "$(basename).ext",
                description: nls.localize("explorer.autoRevealExclude.when", "Additional check on the siblings of a matching file. Use {0} as variable for the matching file name.", "$(basename)")
              }
            }
          }
        ]
      }
    },
    "explorer.enableDragAndDrop": {
      "type": "boolean",
      "description": nls.localize("enableDragAndDrop", "Controls whether the Explorer should allow to move files and folders via drag and drop. This setting only effects drag and drop from inside the Explorer."),
      "default": true
    },
    "explorer.confirmDragAndDrop": {
      "type": "boolean",
      "description": nls.localize("confirmDragAndDrop", "Controls whether the Explorer should ask for confirmation to move files and folders via drag and drop."),
      "default": true
    },
    "explorer.confirmPasteNative": {
      "type": "boolean",
      "description": nls.localize("confirmPasteNative", "Controls whether the Explorer should ask for confirmation when pasting native files and folders."),
      "default": true
    },
    "explorer.confirmDelete": {
      "type": "boolean",
      "description": nls.localize("confirmDelete", "Controls whether the Explorer should ask for confirmation when deleting files and folders."),
      "default": true
    },
    "explorer.enableUndo": {
      "type": "boolean",
      "description": nls.localize("enableUndo", "Controls whether the Explorer should support undoing file and folder operations."),
      "default": true
    },
    "explorer.confirmUndo": {
      "type": "string",
      "enum": [UndoConfirmLevel.Verbose, UndoConfirmLevel.Default, UndoConfirmLevel.Light],
      "description": nls.localize("confirmUndo", "Controls whether the Explorer should ask for confirmation when undoing."),
      "default": UndoConfirmLevel.Default,
      "enumDescriptions": [
        nls.localize("enableUndo.verbose", "Explorer will prompt before all undo operations."),
        nls.localize("enableUndo.default", "Explorer will prompt before destructive undo operations."),
        nls.localize("enableUndo.light", "Explorer will not prompt before undo operations when focused.")
      ]
    },
    "explorer.expandSingleFolderWorkspaces": {
      "type": "boolean",
      "description": nls.localize("expandSingleFolderWorkspaces", "Controls whether the Explorer should expand multi-root workspaces containing only one folder during initialization"),
      "default": true
    },
    "explorer.sortOrder": {
      "type": "string",
      "enum": [SortOrder.Default, SortOrder.Mixed, SortOrder.FilesFirst, SortOrder.Type, SortOrder.Modified, SortOrder.FoldersNestsFiles],
      "default": SortOrder.Default,
      "enumDescriptions": [
        nls.localize("sortOrder.default", "Files and folders are sorted by their names. Folders are displayed before files."),
        nls.localize("sortOrder.mixed", "Files and folders are sorted by their names. Files are interwoven with folders."),
        nls.localize("sortOrder.filesFirst", "Files and folders are sorted by their names. Files are displayed before folders."),
        nls.localize("sortOrder.type", "Files and folders are grouped by extension type then sorted by their names. Folders are displayed before files."),
        nls.localize("sortOrder.modified", "Files and folders are sorted by last modified date in descending order. Folders are displayed before files."),
        nls.localize("sortOrder.foldersNestsFiles", "Files and folders are sorted by their names. Folders are displayed before files. Files with nested children are displayed before other files.")
      ],
      "markdownDescription": nls.localize("sortOrder", "Controls the property-based sorting of files and folders in the Explorer. When `#explorer.fileNesting.enabled#` is enabled, also controls sorting of nested files.")
    },
    "explorer.sortOrderLexicographicOptions": {
      "type": "string",
      "enum": [LexicographicOptions.Default, LexicographicOptions.Upper, LexicographicOptions.Lower, LexicographicOptions.Unicode],
      "default": LexicographicOptions.Default,
      "enumDescriptions": [
        nls.localize("sortOrderLexicographicOptions.default", "Uppercase and lowercase names are mixed together."),
        nls.localize("sortOrderLexicographicOptions.upper", "Uppercase names are grouped together before lowercase names."),
        nls.localize("sortOrderLexicographicOptions.lower", "Lowercase names are grouped together before uppercase names."),
        nls.localize("sortOrderLexicographicOptions.unicode", "Names are sorted in Unicode order.")
      ],
      "description": nls.localize("sortOrderLexicographicOptions", "Controls the lexicographic sorting of file and folder names in the Explorer.")
    },
    "explorer.sortOrderReverse": {
      "type": "boolean",
      "description": nls.localize("sortOrderReverse", "Controls whether the file and folder sort order, should be reversed."),
      "default": false
    },
    "explorer.decorations.colors": {
      type: "boolean",
      description: nls.localize("explorer.decorations.colors", "Controls whether file decorations should use colors."),
      default: true
    },
    "explorer.decorations.badges": {
      type: "boolean",
      description: nls.localize("explorer.decorations.badges", "Controls whether file decorations should use badges."),
      default: true
    },
    "explorer.incrementalNaming": {
      "type": "string",
      enum: ["simple", "smart", "disabled"],
      enumDescriptions: [
        nls.localize("simple", 'Appends the word "copy" at the end of the duplicated name potentially followed by a number.'),
        nls.localize("smart", "Adds a number at the end of the duplicated name. If some number is already part of the name, tries to increase that number."),
        nls.localize("disabled", "Disables incremental naming. If two files with the same name exist you will be prompted to overwrite the existing file.")
      ],
      description: nls.localize("explorer.incrementalNaming", "Controls which naming strategy to use when giving a new name to a duplicated Explorer item on paste."),
      default: "simple"
    },
    "explorer.autoOpenDroppedFile": {
      "type": "boolean",
      "description": nls.localize("autoOpenDroppedFile", "Controls whether the Explorer should automatically open a file when it is dropped into the explorer"),
      "default": true
    },
    "explorer.compactFolders": {
      "type": "boolean",
      "description": nls.localize("compressSingleChildFolders", "Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element. Useful for Java package structures, for example."),
      "default": true
    },
    "explorer.copyRelativePathSeparator": {
      "type": "string",
      "enum": [
        "/",
        "\\",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("copyRelativePathSeparator.slash", "Use slash as path separation character."),
        nls.localize("copyRelativePathSeparator.backslash", "Use backslash as path separation character."),
        nls.localize("copyRelativePathSeparator.auto", "Uses operating system specific path separation character.")
      ],
      "description": nls.localize("copyRelativePathSeparator", "The path separation character used when copying relative file paths."),
      "default": "auto"
    },
    "explorer.copyPathSeparator": {
      "type": "string",
      "enum": [
        "/",
        "\\",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("copyPathSeparator.slash", "Use slash as path separation character."),
        nls.localize("copyPathSeparator.backslash", "Use backslash as path separation character."),
        nls.localize("copyPathSeparator.auto", "Uses operating system specific path separation character.")
      ],
      "description": nls.localize("copyPathSeparator", "The path separation character used when copying file paths."),
      "default": "auto"
    },
    "explorer.excludeGitIgnore": {
      type: "boolean",
      markdownDescription: nls.localize("excludeGitignore", "Controls whether entries in .gitignore should be parsed and excluded from the Explorer. Similar to {0}.", "`#files.exclude#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "explorer.fileNesting.enabled": {
      "type": "boolean",
      scope: ConfigurationScope.RESOURCE,
      "markdownDescription": nls.localize("fileNestingEnabled", "Controls whether file nesting is enabled in the Explorer. File nesting allows for related files in a directory to be visually grouped together under a single parent file."),
      "default": false
    },
    "explorer.fileNesting.expand": {
      "type": "boolean",
      "markdownDescription": nls.localize("fileNestingExpand", "Controls whether file nests are automatically expanded. {0} must be set for this to take effect.", "`#explorer.fileNesting.enabled#`"),
      "default": true
    },
    "explorer.fileNesting.patterns": {
      "type": "object",
      scope: ConfigurationScope.RESOURCE,
      "markdownDescription": nls.localize("fileNestingPatterns", "Controls nesting of files in the Explorer. {0} must be set for this to take effect. Each __Item__ represents a parent pattern and may contain a single `*` character that matches any string. Each __Value__ represents a comma separated list of the child patterns that should be shown nested under a given parent. Child patterns may contain several special tokens:\n- `${capture}`: Matches the resolved value of the `*` from the parent pattern\n- `${basename}`: Matches the parent file's basename, the `file` in `file.ts`\n- `${extname}`: Matches the parent file's extension, the `ts` in `file.ts`\n- `${dirname}`: Matches the parent file's directory name, the `src` in `src/file.ts`\n- `*`:  Matches any string, may only be used once per child pattern", "`#explorer.fileNesting.enabled#`"),
      patternProperties: {
        "^[^*]*\\*?[^*]*$": {
          markdownDescription: nls.localize("fileNesting.description", "Each key pattern may contain a single `*` character which will match any string."),
          type: "string",
          pattern: "^([^,*]*\\*?[^,*]*)(, ?[^,*]*\\*?[^,*]*)*$"
        }
      },
      additionalProperties: false,
      "default": {
        "*.ts": "${capture}.js",
        "*.js": "${capture}.js.map, ${capture}.min.js, ${capture}.d.ts",
        "*.jsx": "${capture}.js",
        "*.tsx": "${capture}.ts",
        "tsconfig.json": "tsconfig.*.json",
        "package.json": "package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock"
      }
    }
  }
});
UndoCommand.addImplementation(110, "explorer", (accessor) => {
  const undoRedoService = accessor.get(IUndoRedoService);
  const explorerService = accessor.get(IExplorerService);
  const configurationService = accessor.get(IConfigurationService);
  const explorerCanUndo = configurationService.getValue().explorer.enableUndo;
  if (explorerService.hasViewFocus() && undoRedoService.canUndo(UNDO_REDO_SOURCE) && explorerCanUndo) {
    undoRedoService.undo(UNDO_REDO_SOURCE);
    return true;
  }
  return false;
});
RedoCommand.addImplementation(110, "explorer", (accessor) => {
  const undoRedoService = accessor.get(IUndoRedoService);
  const explorerService = accessor.get(IExplorerService);
  const configurationService = accessor.get(IConfigurationService);
  const explorerCanUndo = configurationService.getValue().explorer.enableUndo;
  if (explorerService.hasViewFocus() && undoRedoService.canRedo(UNDO_REDO_SOURCE) && explorerCanUndo) {
    undoRedoService.redo(UNDO_REDO_SOURCE);
    return true;
  }
  return false;
});
ModesRegistry.registerLanguage({
  id: BINARY_TEXT_FILE_MODE,
  aliases: ["Binary"],
  mimetypes: ["text/x-code-binary"]
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxmaWxlcy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHNlcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZUVkaXRvcklucHV0LCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24sIEhvdEV4aXRDb25maWd1cmF0aW9uLCBGSUxFU19FWENMVURFX0NPTkZJRywgRklMRVNfQVNTT0NJQVRJT05TX0NPTkZJRywgRklMRVNfUkVBRE9OTFlfSU5DTFVERV9DT05GSUcsIEZJTEVTX1JFQURPTkxZX0VYQ0xVREVfQ09ORklHLCBGSUxFU19SRUFET05MWV9GUk9NX1BFUk1JU1NJT05TX0NPTkZJRyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTb3J0T3JkZXIsIExleGljb2dyYXBoaWNPcHRpb25zLCBGSUxFX0VESVRPUl9JTlBVVF9JRCwgQklOQVJZX1RFWFRfRklMRV9NT0RFLCBVbmRvQ29uZmlybUxldmVsLCBJRmlsZXNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yVHJhY2tlciB9IGZyb20gJy4vZWRpdG9ycy90ZXh0RmlsZUVkaXRvclRyYWNrZXIuanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVTYXZlRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi9lZGl0b3JzL3RleHRGaWxlU2F2ZUVycm9ySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuL2VkaXRvcnMvZmlsZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEJpbmFyeUZpbGVFZGl0b3IgfSBmcm9tICcuL2VkaXRvcnMvYmluYXJ5RmlsZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IGlzTmF0aXZlLCBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJWaWV3bGV0Vmlld3NDb250cmlidXRpb24gfSBmcm9tICcuL2V4cGxvcmVyVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVJlZ2lzdHJ5LCBFZGl0b3JQYW5lRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlclNlcnZpY2UsIFVORE9fUkVET19TT1VSQ0UgfSBmcm9tICcuL2V4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHVUVTU0FCTEVfRU5DT0RJTkdTLCBTVVBQT1JURURfRU5DT0RJTkdTIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVdhdGNoZXIgfSBmcm9tICcuL3dvcmtzcGFjZVdhdGNoZXIuanMnO1xuaW1wb3J0IHsgZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXJ0eUZpbGVzSW5kaWNhdG9yIH0gZnJvbSAnLi4vY29tbW9uL2RpcnR5RmlsZXNJbmRpY2F0b3IuanMnO1xuaW1wb3J0IHsgVW5kb0NvbW1hbmQsIFJlZG9Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dFNlcmlhbGl6ZXIsIEZpbGVFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIgfSBmcm9tICcuL2VkaXRvcnMvZmlsZUVkaXRvckhhbmRsZXIuanMnO1xuaW1wb3J0IHsgTW9kZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvciB9IGZyb20gJy4vZWRpdG9ycy90ZXh0RmlsZUVkaXRvci5qcyc7XG5cbmNsYXNzIEZpbGVVcmlMYWJlbENvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5maWxlVXJpTGFiZWwnO1xuXG5cdGNvbnN0cnVjdG9yKEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSkge1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuZmlsZSxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke2F1dGhvcml0eX0ke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiBzZXAsXG5cdFx0XHRcdHRpbGRpZnk6ICFpc1dpbmRvd3MsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiBpc1dpbmRvd3MsXG5cdFx0XHRcdGF1dGhvcml0eVByZWZpeDogc2VwICsgc2VwLFxuXHRcdFx0XHR3b3Jrc3BhY2VTdWZmaXg6ICcnXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUV4cGxvcmVyU2VydmljZSwgRXhwbG9yZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLy8gUmVnaXN0ZXIgZmlsZSBlZGl0b3JzXG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0VGV4dEZpbGVFZGl0b3IsXG5cdFx0VGV4dEZpbGVFZGl0b3IuSUQsXG5cdFx0bmxzLmxvY2FsaXplKCd0ZXh0RmlsZUVkaXRvcicsIFwiVGV4dCBGaWxlIEVkaXRvclwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKEZpbGVFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRCaW5hcnlGaWxlRWRpdG9yLFxuXHRcdEJpbmFyeUZpbGVFZGl0b3IuSUQsXG5cdFx0bmxzLmxvY2FsaXplKCdiaW5hcnlGaWxlRWRpdG9yJywgXCJCaW5hcnkgRmlsZSBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihGaWxlRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cbi8vIFJlZ2lzdGVyIGRlZmF1bHQgZmlsZSBpbnB1dCBmYWN0b3J5XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRmlsZUVkaXRvckZhY3Rvcnkoe1xuXG5cdHR5cGVJZDogRklMRV9FRElUT1JfSU5QVVRfSUQsXG5cblx0Y3JlYXRlRmlsZUVkaXRvcjogKHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgcHJlZmVycmVkTmFtZSwgcHJlZmVycmVkRGVzY3JpcHRpb24sIHByZWZlcnJlZEVuY29kaW5nLCBwcmVmZXJyZWRMYW5ndWFnZUlkLCBwcmVmZXJyZWRDb250ZW50cywgaW5zdGFudGlhdGlvblNlcnZpY2UpOiBJRmlsZUVkaXRvcklucHV0ID0+IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRvcklucHV0LCByZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIHByZWZlcnJlZE5hbWUsIHByZWZlcnJlZERlc2NyaXB0aW9uLCBwcmVmZXJyZWRFbmNvZGluZywgcHJlZmVycmVkTGFuZ3VhZ2VJZCwgcHJlZmVycmVkQ29udGVudHMpO1xuXHR9LFxuXG5cdGlzRmlsZUVkaXRvcjogKG9iaik6IG9iaiBpcyBJRmlsZUVkaXRvcklucHV0ID0+IHtcblx0XHRyZXR1cm4gb2JqIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0O1xuXHR9XG59KTtcblxuLy8gUmVnaXN0ZXIgRWRpdG9yIElucHV0IFNlcmlhbGl6ZXIgJiBIYW5kbGVyXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihGSUxFX0VESVRPUl9JTlBVVF9JRCwgRmlsZUVkaXRvcklucHV0U2VyaWFsaXplcik7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRmlsZUVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlci5JRCwgRmlsZUVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuLy8gUmVnaXN0ZXIgRXhwbG9yZXIgdmlld3NcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFeHBsb3JlclZpZXdsZXRWaWV3c0NvbnRyaWJ1dGlvbi5JRCwgRXhwbG9yZXJWaWV3bGV0Vmlld3NDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbi8vIFJlZ2lzdGVyIFRleHQgRmlsZSBFZGl0b3IgVHJhY2tlclxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFRleHRGaWxlRWRpdG9yVHJhY2tlci5JRCwgVGV4dEZpbGVFZGl0b3JUcmFja2VyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG4vLyBSZWdpc3RlciBUZXh0IEZpbGUgU2F2ZSBFcnJvciBIYW5kbGVyXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoVGV4dEZpbGVTYXZlRXJyb3JIYW5kbGVyLklELCBUZXh0RmlsZVNhdmVFcnJvckhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbi8vIFJlZ2lzdGVyIHVyaSBkaXNwbGF5IGZvciBmaWxlIHVyaXNcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihGaWxlVXJpTGFiZWxDb250cmlidXRpb24uSUQsIEZpbGVVcmlMYWJlbENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuLy8gUmVnaXN0ZXIgV29ya3NwYWNlIFdhdGNoZXJcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihXb3Jrc3BhY2VXYXRjaGVyLklELCBXb3Jrc3BhY2VXYXRjaGVyLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuLy8gUmVnaXN0ZXIgRGlydHkgRmlsZXMgSW5kaWNhdG9yXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRGlydHlGaWxlc0luZGljYXRvci5JRCwgRGlydHlGaWxlc0luZGljYXRvciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuLy8gQ29uZmlndXJhdGlvblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cbmNvbnN0IGhvdEV4aXRDb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0gaXNOYXRpdmUgP1xuXHR7XG5cdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0J2VudW0nOiBbSG90RXhpdENvbmZpZ3VyYXRpb24uT0ZGLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0VdLFxuXHRcdCdkZWZhdWx0JzogSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCxcblx0XHQnbWFya2Rvd25FbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdob3RFeGl0Lm9mZicsICdEaXNhYmxlIGhvdCBleGl0LiBBIHByb21wdCB3aWxsIHNob3cgd2hlbiBhdHRlbXB0aW5nIHRvIGNsb3NlIGEgd2luZG93IHdpdGggZWRpdG9ycyB0aGF0IGhhdmUgdW5zYXZlZCBjaGFuZ2VzLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdob3RFeGl0Lm9uRXhpdCcsICdIb3QgZXhpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIHRoZSBsYXN0IHdpbmRvdyBpcyBjbG9zZWQgb24gV2luZG93cy9MaW51eCBvciB3aGVuIHRoZSBgd29ya2JlbmNoLmFjdGlvbi5xdWl0YCBjb21tYW5kIGlzIHRyaWdnZXJlZCAoY29tbWFuZCBwYWxldHRlLCBrZXliaW5kaW5nLCBtZW51KS4gQWxsIHdpbmRvd3Mgd2l0aG91dCBmb2xkZXJzIG9wZW5lZCB3aWxsIGJlIHJlc3RvcmVkIHVwb24gbmV4dCBsYXVuY2guIEEgbGlzdCBvZiBwcmV2aW91c2x5IG9wZW5lZCB3aW5kb3dzIHdpdGggdW5zYXZlZCBmaWxlcyBjYW4gYmUgYWNjZXNzZWQgdmlhIGBGaWxlID4gT3BlbiBSZWNlbnQgPiBNb3JlLi4uYCcpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdob3RFeGl0Lm9uRXhpdEFuZFdpbmRvd0Nsb3NlJywgJ0hvdCBleGl0IHdpbGwgYmUgdHJpZ2dlcmVkIHdoZW4gdGhlIGxhc3Qgd2luZG93IGlzIGNsb3NlZCBvbiBXaW5kb3dzL0xpbnV4IG9yIHdoZW4gdGhlIGB3b3JrYmVuY2guYWN0aW9uLnF1aXRgIGNvbW1hbmQgaXMgdHJpZ2dlcmVkIChjb21tYW5kIHBhbGV0dGUsIGtleWJpbmRpbmcsIG1lbnUpLCBhbmQgYWxzbyBmb3IgYW55IHdpbmRvdyB3aXRoIGEgZm9sZGVyIG9wZW5lZCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXRcXCdzIHRoZSBsYXN0IHdpbmRvdy4gQWxsIHdpbmRvd3Mgd2l0aG91dCBmb2xkZXJzIG9wZW5lZCB3aWxsIGJlIHJlc3RvcmVkIHVwb24gbmV4dCBsYXVuY2guIEEgbGlzdCBvZiBwcmV2aW91c2x5IG9wZW5lZCB3aW5kb3dzIHdpdGggdW5zYXZlZCBmaWxlcyBjYW4gYmUgYWNjZXNzZWQgdmlhIGBGaWxlID4gT3BlbiBSZWNlbnQgPiBNb3JlLi4uYCcpXG5cdFx0XSxcblx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnaG90RXhpdCcsIFwiW0hvdCBFeGl0XShodHRwczovL2FrYS5tcy92c2NvZGUtaG90LWV4aXQpIGNvbnRyb2xzIHdoZXRoZXIgdW5zYXZlZCBmaWxlcyBhcmUgcmVtZW1iZXJlZCBiZXR3ZWVuIHNlc3Npb25zLCBhbGxvd2luZyB0aGUgc2F2ZSBwcm9tcHQgd2hlbiBleGl0aW5nIHRoZSBlZGl0b3IgdG8gYmUgc2tpcHBlZC5cIiwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFKVxuXHR9IDoge1xuXHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdCdlbnVtJzogW0hvdEV4aXRDb25maWd1cmF0aW9uLk9GRiwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFXSxcblx0XHQnZGVmYXVsdCc6IEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSxcblx0XHQnbWFya2Rvd25FbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdob3RFeGl0Lm9mZicsICdEaXNhYmxlIGhvdCBleGl0LiBBIHByb21wdCB3aWxsIHNob3cgd2hlbiBhdHRlbXB0aW5nIHRvIGNsb3NlIGEgd2luZG93IHdpdGggZWRpdG9ycyB0aGF0IGhhdmUgdW5zYXZlZCBjaGFuZ2VzLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdob3RFeGl0Lm9uRXhpdEFuZFdpbmRvd0Nsb3NlQnJvd3NlcicsICdIb3QgZXhpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIHRoZSBicm93c2VyIHF1aXRzIG9yIHRoZSB3aW5kb3cgb3IgdGFiIGlzIGNsb3NlZC4nKVxuXHRcdF0sXG5cdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2hvdEV4aXQnLCBcIltIb3QgRXhpdF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWhvdC1leGl0KSBjb250cm9scyB3aGV0aGVyIHVuc2F2ZWQgZmlsZXMgYXJlIHJlbWVtYmVyZWQgYmV0d2VlbiBzZXNzaW9ucywgYWxsb3dpbmcgdGhlIHNhdmUgcHJvbXB0IHdoZW4gZXhpdGluZyB0aGUgZWRpdG9yIHRvIGJlIHNraXBwZWQuXCIsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSlcblx0fTtcblxuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdCdpZCc6ICdmaWxlcycsXG5cdCdvcmRlcic6IDksXG5cdCd0aXRsZSc6IG5scy5sb2NhbGl6ZSgnZmlsZXNDb25maWd1cmF0aW9uVGl0bGUnLCBcIkZpbGVzXCIpLFxuXHQndHlwZSc6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHRbRklMRVNfRVhDTFVERV9DT05GSUddOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2V4Y2x1ZGUnLCBcIkNvbmZpZ3VyZSBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIGZvciBleGNsdWRpbmcgZmlsZXMgYW5kIGZvbGRlcnMuIEZvciBleGFtcGxlLCB0aGUgRmlsZSBFeHBsb3JlciBkZWNpZGVzIHdoaWNoIGZpbGVzIGFuZCBmb2xkZXJzIHRvIHNob3cgb3IgaGlkZSBiYXNlZCBvbiB0aGlzIHNldHRpbmcuIFJlZmVyIHRvIHRoZSBgI3NlYXJjaC5leGNsdWRlI2Agc2V0dGluZyB0byBkZWZpbmUgc2VhcmNoLXNwZWNpZmljIGV4Y2x1ZGVzLiBSZWZlciB0byB0aGUgYCNleHBsb3Jlci5leGNsdWRlR2l0SWdub3JlI2Agc2V0dGluZyBmb3IgaWdub3JpbmcgZmlsZXMgYmFzZWQgb24geW91ciBgLmdpdGlnbm9yZWAuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdC4uLnsgJyoqLy5naXQnOiB0cnVlLCAnKiovLnN2bic6IHRydWUsICcqKi8uaGcnOiB0cnVlLCAnKiovLkRTX1N0b3JlJzogdHJ1ZSwgJyoqL1RodW1icy5kYic6IHRydWUgfSxcblx0XHRcdFx0Li4uKGlzV2ViID8geyAnKiovKi5jcnN3YXAnOiB0cnVlIC8qIGZpbHRlciBvdXQgc3dhcCBmaWxlcyB1c2VkIGZvciBsb2NhbCBmaWxlIGFjY2VzcyAqLyB9IDogdW5kZWZpbmVkKVxuXHRcdFx0fSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSxcblx0XHRcdCdhZGRpdGlvbmFsUHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0J2VudW0nOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbbmxzLmxvY2FsaXplKCd0cnVlRGVzY3JpcHRpb24nLCBcIkVuYWJsZSB0aGUgcGF0dGVybi5cIiksIG5scy5sb2NhbGl6ZSgnZmFsc2VEZXNjcmlwdGlvbicsIFwiRGlzYWJsZSB0aGUgcGF0dGVybi5cIildLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlcy5leGNsdWRlLmJvb2xlYW4nLCBcIlRoZSBnbG9iIHBhdHRlcm4gdG8gbWF0Y2ggZmlsZSBwYXRocyBhZ2FpbnN0LiBTZXQgdG8gdHJ1ZSBvciBmYWxzZSB0byBlbmFibGUgb3IgZGlzYWJsZSB0aGUgcGF0dGVybi5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdCd3aGVuJzoge1xuXHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsIC8vIGV4cHJlc3Npb24gKHsgXCIqKi8qLmpzXCI6IHsgXCJ3aGVuXCI6IFwiJChiYXNlbmFtZSkuanNcIiB9IH0pXG5cdFx0XHRcdFx0XHRcdFx0J3BhdHRlcm4nOiAnXFxcXHcqXFxcXCRcXFxcKGJhc2VuYW1lXFxcXClcXFxcdyonLFxuXHRcdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogJyQoYmFzZW5hbWUpLmV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoeyBrZXk6ICdmaWxlcy5leGNsdWRlLndoZW4nLCBjb21tZW50OiBbJ1xcXFwkKGJhc2VuYW1lKSBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQnXSB9LCBcIkFkZGl0aW9uYWwgY2hlY2sgb24gdGhlIHNpYmxpbmdzIG9mIGEgbWF0Y2hpbmcgZmlsZS4gVXNlIFxcXFwkKGJhc2VuYW1lKSBhcyB2YXJpYWJsZSBmb3IgdGhlIG1hdGNoaW5nIGZpbGUgbmFtZS5cIilcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0ZJTEVTX0FTU09DSUFUSU9OU19DT05GSUddOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2Fzc29jaWF0aW9ucycsIFwiQ29uZmlndXJlIFtnbG9iIHBhdHRlcm5zXShodHRwczovL2FrYS5tcy92c2NvZGUtZ2xvYi1wYXR0ZXJucykgb2YgZmlsZSBhc3NvY2lhdGlvbnMgdG8gbGFuZ3VhZ2VzIChmb3IgZXhhbXBsZSBgXFxcIiouZXh0ZW5zaW9uXFxcIjogXFxcImh0bWxcXFwiYCkuIFBhdHRlcm5zIHdpbGwgbWF0Y2ggb24gdGhlIGFic29sdXRlIHBhdGggb2YgYSBmaWxlIGlmIHRoZXkgY29udGFpbiBhIHBhdGggc2VwYXJhdG9yIGFuZCB3aWxsIG1hdGNoIG9uIHRoZSBuYW1lIG9mIHRoZSBmaWxlIG90aGVyd2lzZS4gVGhlc2UgaGF2ZSBwcmVjZWRlbmNlIG92ZXIgdGhlIGRlZmF1bHQgYXNzb2NpYXRpb25zIG9mIHRoZSBsYW5ndWFnZXMgaW5zdGFsbGVkLlwiKSxcblx0XHRcdCdhZGRpdGlvbmFsUHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmVuY29kaW5nJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogT2JqZWN0LmtleXMoU1VQUE9SVEVEX0VOQ09ESU5HUyksXG5cdFx0XHQnZGVmYXVsdCc6ICd1dGY4Jyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZW5jb2RpbmcnLCBcIlRoZSBkZWZhdWx0IGNoYXJhY3RlciBzZXQgZW5jb2RpbmcgdG8gdXNlIHdoZW4gcmVhZGluZyBhbmQgd3JpdGluZyBmaWxlcy4gVGhpcyBzZXR0aW5nIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgcGVyIGxhbmd1YWdlLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogT2JqZWN0LmtleXMoU1VQUE9SVEVEX0VOQ09ESU5HUykubWFwKGtleSA9PiBTVVBQT1JURURfRU5DT0RJTkdTW2tleV0ubGFiZWxMb25nKSxcblx0XHRcdCdlbnVtSXRlbUxhYmVscyc6IE9iamVjdC5rZXlzKFNVUFBPUlRFRF9FTkNPRElOR1MpLm1hcChrZXkgPT4gU1VQUE9SVEVEX0VOQ09ESU5HU1trZXldLmxhYmVsTG9uZylcblx0XHR9LFxuXHRcdCdmaWxlcy5hdXRvR3Vlc3NFbmNvZGluZyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhdXRvR3Vlc3NFbmNvZGluZycsIFwiV2hlbiBlbmFibGVkLCB0aGUgZWRpdG9yIHdpbGwgYXR0ZW1wdCB0byBndWVzcyB0aGUgY2hhcmFjdGVyIHNldCBlbmNvZGluZyB3aGVuIG9wZW5pbmcgZmlsZXMuIFRoaXMgc2V0dGluZyBjYW4gYWxzbyBiZSBjb25maWd1cmVkIHBlciBsYW5ndWFnZS4gTm90ZSwgdGhpcyBzZXR0aW5nIGlzIG5vdCByZXNwZWN0ZWQgYnkgdGV4dCBzZWFyY2guIE9ubHkgezB9IGlzIHJlc3BlY3RlZC5cIiwgJ2AjZmlsZXMuZW5jb2RpbmcjYCcpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMuY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MnOiB7XG5cdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHQnaXRlbXMnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdlbnVtJzogT2JqZWN0LmtleXMoR1VFU1NBQkxFX0VOQ09ESU5HUyksXG5cdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogT2JqZWN0LmtleXMoR1VFU1NBQkxFX0VOQ09ESU5HUykubWFwKGtleSA9PiBHVUVTU0FCTEVfRU5DT0RJTkdTW2tleV0ubGFiZWxMb25nKVxuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0JzogW10sXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MnLCBcIkxpc3Qgb2YgY2hhcmFjdGVyIHNldCBlbmNvZGluZ3MgdGhhdCB0aGUgZWRpdG9yIHNob3VsZCBhdHRlbXB0IHRvIGd1ZXNzIGluIHRoZSBvcmRlciB0aGV5IGFyZSBsaXN0ZWQuIEluIGNhc2UgaXQgY2Fubm90IGJlIGRldGVybWluZWQsIHswfSBpcyByZXNwZWN0ZWRcIiwgJ2AjZmlsZXMuZW5jb2RpbmcjYCcpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMuZW9sJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHQnXFxuJyxcblx0XHRcdFx0J1xcclxcbicsXG5cdFx0XHRcdCdhdXRvJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VvbC5MRicsIFwiTEZcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZW9sLkNSTEYnLCBcIkNSTEZcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZW9sLmF1dG8nLCBcIlVzZXMgb3BlcmF0aW5nIHN5c3RlbSBzcGVjaWZpYyBlbmQgb2YgbGluZSBjaGFyYWN0ZXIuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J2RlZmF1bHQnOiAnYXV0bycsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2VvbCcsIFwiVGhlIGRlZmF1bHQgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmVuYWJsZVRyYXNoJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3VzZVRyYXNoJywgXCJNb3ZlcyBmaWxlcy9mb2xkZXJzIHRvIHRoZSBPUyB0cmFzaCAocmVjeWNsZSBiaW4gb24gV2luZG93cykgd2hlbiBkZWxldGluZy4gRGlzYWJsaW5nIHRoaXMgd2lsbCBkZWxldGUgZmlsZXMvZm9sZGVycyBwZXJtYW5lbnRseS5cIilcblx0XHR9LFxuXHRcdCdmaWxlcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCd0cmltVHJhaWxpbmdXaGl0ZXNwYWNlJywgXCJXaGVuIGVuYWJsZWQsIHdpbGwgdHJpbSB0cmFpbGluZyB3aGl0ZXNwYWNlIHdoZW4gc2F2aW5nIGEgZmlsZS5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlSW5SZWdleEFuZFN0cmluZ3MnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgndHJpbVRyYWlsaW5nV2hpdGVzcGFjZUluUmVnZXhBbmRTdHJpbmdzJywgXCJXaGVuIGVuYWJsZWQsIHRyYWlsaW5nIHdoaXRlc3BhY2Ugd2lsbCBiZSByZW1vdmVkIGZyb20gbXVsdGlsaW5lIHN0cmluZ3MgYW5kIHJlZ2V4ZXMgb24gc2F2ZSBvciB3aGVuIGV4ZWN1dGluZyAnZWRpdG9yLmFjdGlvbi50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJy4gVGhpcyBjYW4gY2F1c2Ugd2hpdGVzcGFjZSB0byBub3QgYmUgdHJpbW1lZCBmcm9tIGxpbmVzIHdoZW4gdGhlcmUgaXNuJ3QgdXAtdG8tZGF0ZSB0b2tlbiBpbmZvcm1hdGlvbi5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy5pbnNlcnRGaW5hbE5ld2xpbmUnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2luc2VydEZpbmFsTmV3bGluZScsIFwiV2hlbiBlbmFibGVkLCBpbnNlcnQgYSBmaW5hbCBuZXcgbGluZSBhdCB0aGUgZW5kIG9mIHRoZSBmaWxlIHdoZW4gc2F2aW5nIGl0LlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLnRyaW1GaW5hbE5ld2xpbmVzJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCd0cmltRmluYWxOZXdsaW5lcycsIFwiV2hlbiBlbmFibGVkLCB3aWxsIHRyaW0gYWxsIG5ldyBsaW5lcyBhZnRlciB0aGUgZmluYWwgbmV3IGxpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZmlsZSB3aGVuIHNhdmluZyBpdC5cIiksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdH0sXG5cdFx0J2ZpbGVzLmF1dG9TYXZlJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW0F1dG9TYXZlQ29uZmlndXJhdGlvbi5PRkYsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSwgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9OX0ZPQ1VTX0NIQU5HRSwgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9OX1dJTkRPV19DSEFOR0VdLFxuXHRcdFx0J21hcmtkb3duRW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnZmlsZXMuYXV0b1NhdmUub2ZmJyB9LCBcIkFuIGVkaXRvciB3aXRoIGNoYW5nZXMgaXMgbmV2ZXIgYXV0b21hdGljYWxseSBzYXZlZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2ZpbGVzLmF1dG9TYXZlLmFmdGVyRGVsYXknIH0sIFwiQW4gZWRpdG9yIHdpdGggY2hhbmdlcyBpcyBhdXRvbWF0aWNhbGx5IHNhdmVkIGFmdGVyIHRoZSBjb25maWd1cmVkIGAjZmlsZXMuYXV0b1NhdmVEZWxheSNgLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnZmlsZXMuYXV0b1NhdmUub25Gb2N1c0NoYW5nZScgfSwgXCJBbiBlZGl0b3Igd2l0aCBjaGFuZ2VzIGlzIGF1dG9tYXRpY2FsbHkgc2F2ZWQgd2hlbiB0aGUgZWRpdG9yIGxvc2VzIGZvY3VzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnZmlsZXMuYXV0b1NhdmUub25XaW5kb3dDaGFuZ2UnIH0sIFwiQW4gZWRpdG9yIHdpdGggY2hhbmdlcyBpcyBhdXRvbWF0aWNhbGx5IHNhdmVkIHdoZW4gdGhlIHdpbmRvdyBsb3NlcyBmb2N1cy5cIilcblx0XHRcdF0sXG5cdFx0XHQnZGVmYXVsdCc6IGlzV2ViID8gQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZIDogQXV0b1NhdmVDb25maWd1cmF0aW9uLk9GRixcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnYXV0b1NhdmUnIH0sIFwiQ29udHJvbHMgW2F1dG8gc2F2ZV0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvY29kZWJhc2ljcyNfc2F2ZS1hdXRvLXNhdmUpIG9mIGVkaXRvcnMgdGhhdCBoYXZlIHVuc2F2ZWQgY2hhbmdlcy5cIiwgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9GRiwgQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT05fRk9DVVNfQ0hBTkdFLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT05fV0lORE9XX0NIQU5HRSwgQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogJ2FmdGVyRGVsYXknIH0sXG5cdFx0fSxcblx0XHQnZmlsZXMuYXV0b1NhdmVEZWxheSc6IHtcblx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHQnZGVmYXVsdCc6IDEwMDAsXG5cdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2F1dG9TYXZlRGVsYXknIH0sIFwiQ29udHJvbHMgdGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBhbiBlZGl0b3Igd2l0aCB1bnNhdmVkIGNoYW5nZXMgaXMgc2F2ZWQgYXV0b21hdGljYWxseS4gT25seSBhcHBsaWVzIHdoZW4gYCNmaWxlcy5hdXRvU2F2ZSNgIGlzIHNldCB0byBgezB9YC5cIiwgQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy5hdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seScsIFwiV2hlbiBlbmFibGVkLCB3aWxsIGxpbWl0IFthdXRvIHNhdmVdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2NvZGViYXNpY3MjX3NhdmUtYXV0by1zYXZlKSBvZiBlZGl0b3JzIHRvIGZpbGVzIHRoYXQgYXJlIGluc2lkZSB0aGUgb3BlbmVkIHdvcmtzcGFjZS4gT25seSBhcHBsaWVzIHdoZW4gezB9IGlzIGVuYWJsZWQuXCIsICdgI2ZpbGVzLmF1dG9TYXZlI2AnKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy5hdXRvU2F2ZVdoZW5Ob0Vycm9ycyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhdXRvU2F2ZVdoZW5Ob0Vycm9ycycsIFwiV2hlbiBlbmFibGVkLCB3aWxsIGxpbWl0IFthdXRvIHNhdmVdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2NvZGViYXNpY3MjX3NhdmUtYXV0by1zYXZlKSBvZiBlZGl0b3JzIHRvIGZpbGVzIHRoYXQgaGF2ZSBubyBlcnJvcnMgcmVwb3J0ZWQgaW4gdGhlbSBhdCB0aGUgdGltZSB0aGUgYXV0byBzYXZlIGlzIHRyaWdnZXJlZC4gT25seSBhcHBsaWVzIHdoZW4gezB9IGlzIGVuYWJsZWQuXCIsICdgI2ZpbGVzLmF1dG9TYXZlI2AnKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy53YXRjaGVyRXhjbHVkZSc6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncGF0dGVyblByb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCcuKic6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfVxuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQvLyBBdm9pZGluZyBhICcqKicgcGF0dGVybiBoZXJlIHdoaWNoIHJlc3VsdHMgaW4gYSB2ZXJ5IGNvbXBsZXhcblx0XHRcdFx0Ly8gUmVnRXhwIHRoYXQgY2FuIHNsb3cgdGhpbmdzIGRvd24gc2lnbmlmaWNhbnRseSBpbiBsYXJnZSB3b3Jrc3BhY2VzXG5cdFx0XHRcdCcuZ2l0L29iamVjdHMvKionOiB0cnVlLFxuXHRcdFx0XHQnLmdpdC9zdWJ0cmVlLWNhY2hlLyoqJzogdHJ1ZSxcblx0XHRcdFx0Jy5oZy9zdG9yZS8qKic6IHRydWUsXG5cdFx0XHRcdCcqLy5naXQvb2JqZWN0cy8qKic6IHRydWUsXG5cdFx0XHRcdCcqLy5naXQvc3VidHJlZS1jYWNoZS8qKic6IHRydWUsXG5cdFx0XHRcdCcqLy5oZy9zdG9yZS8qKic6IHRydWVcblx0XHRcdH0sXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnd2F0Y2hlckV4Y2x1ZGUnLCBcIkNvbmZpZ3VyZSBwYXRocyBvciBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIHRvIGV4Y2x1ZGUgZnJvbSBmaWxlIHdhdGNoaW5nLiBQYXRocyBjYW4gZWl0aGVyIGJlIHJlbGF0aXZlIHRvIHRoZSB3YXRjaGVkIGZvbGRlciBvciBhYnNvbHV0ZS4gR2xvYiBwYXR0ZXJucyBhcmUgbWF0Y2hlZCByZWxhdGl2ZSBmcm9tIHRoZSB3YXRjaGVkIGZvbGRlci4gV2hlbiB5b3UgZXhwZXJpZW5jZSB0aGUgZmlsZSB3YXRjaGVyIHByb2Nlc3MgY29uc3VtaW5nIGEgbG90IG9mIENQVSwgbWFrZSBzdXJlIHRvIGV4Y2x1ZGUgbGFyZ2UgZm9sZGVycyB0aGF0IGFyZSBvZiBsZXNzIGludGVyZXN0IChzdWNoIGFzIGJ1aWxkIG91dHB1dCBmb2xkZXJzKS5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0Vcblx0XHR9LFxuXHRcdCdmaWxlcy53YXRjaGVySW5jbHVkZSc6IHtcblx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdCdpdGVtcyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0JzogW10sXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3dhdGNoZXJJbmNsdWRlJywgXCJDb25maWd1cmUgZXh0cmEgcGF0aHMgdG8gd2F0Y2ggZm9yIGNoYW5nZXMgaW5zaWRlIHRoZSB3b3Jrc3BhY2UuIEJ5IGRlZmF1bHQsIGFsbCB3b3Jrc3BhY2UgZm9sZGVycyB3aWxsIGJlIHdhdGNoZWQgcmVjdXJzaXZlbHksIGV4Y2VwdCBmb3IgZm9sZGVycyB0aGF0IGFyZSBzeW1ib2xpYyBsaW5rcy4gWW91IGNhbiBleHBsaWNpdGx5IGFkZCBhYnNvbHV0ZSBvciByZWxhdGl2ZSBwYXRocyB0byBzdXBwb3J0IHdhdGNoaW5nIGZvbGRlcnMgdGhhdCBhcmUgc3ltYm9saWMgbGlua3MuIFJlbGF0aXZlIHBhdGhzIHdpbGwgYmUgcmVzb2x2ZWQgdG8gYW4gYWJzb2x1dGUgcGF0aCB1c2luZyB0aGUgY3VycmVudGx5IG9wZW5lZCB3b3Jrc3BhY2UuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHQnZmlsZXMuaG90RXhpdCc6IGhvdEV4aXRDb25maWd1cmF0aW9uLFxuXHRcdCdmaWxlcy5kZWZhdWx0TGFuZ3VhZ2UnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2RlZmF1bHRMYW5ndWFnZScsIFwiVGhlIGRlZmF1bHQgbGFuZ3VhZ2UgaWRlbnRpZmllciB0aGF0IGlzIGFzc2lnbmVkIHRvIG5ldyBmaWxlcy4gSWYgY29uZmlndXJlZCB0byBgJHthY3RpdmVFZGl0b3JMYW5ndWFnZX1gLCB3aWxsIHVzZSB0aGUgbGFuZ3VhZ2UgaWRlbnRpZmllciBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSB0ZXh0IGVkaXRvciBpZiBhbnkuXCIpXG5cdFx0fSxcblx0XHRbRklMRVNfUkVBRE9OTFlfSU5DTFVERV9DT05GSUddOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3BhdHRlcm5Qcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnLionOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH1cblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IHt9LFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVzUmVhZG9ubHlJbmNsdWRlJywgXCJDb25maWd1cmUgcGF0aHMgb3IgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1nbG9iLXBhdHRlcm5zKSB0byBtYXJrIGFzIHJlYWQtb25seS4gR2xvYiBwYXR0ZXJucyBhcmUgYWx3YXlzIGV2YWx1YXRlZCByZWxhdGl2ZSB0byB0aGUgcGF0aCBvZiB0aGUgd29ya3NwYWNlIGZvbGRlciB1bmxlc3MgdGhleSBhcmUgYWJzb2x1dGUgcGF0aHMuIFlvdSBjYW4gZXhjbHVkZSBtYXRjaGluZyBwYXRocyB2aWEgdGhlIGAjZmlsZXMucmVhZG9ubHlFeGNsdWRlI2Agc2V0dGluZy4gRmlsZXMgZnJvbSByZWFkb25seSBmaWxlIHN5c3RlbSBwcm92aWRlcnMgd2lsbCBhbHdheXMgYmUgcmVhZC1vbmx5IGluZGVwZW5kZW50IG9mIHRoaXMgc2V0dGluZy5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0Vcblx0XHR9LFxuXHRcdFtGSUxFU19SRUFET05MWV9FWENMVURFX0NPTkZJR106IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncGF0dGVyblByb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCcuKic6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfVxuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0Jzoge30sXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZXNSZWFkb25seUV4Y2x1ZGUnLCBcIkNvbmZpZ3VyZSBwYXRocyBvciBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIHRvIGV4Y2x1ZGUgZnJvbSBiZWluZyBtYXJrZWQgYXMgcmVhZC1vbmx5IGlmIHRoZXkgbWF0Y2ggYXMgYSByZXN1bHQgb2YgdGhlIGAjZmlsZXMucmVhZG9ubHlJbmNsdWRlI2Agc2V0dGluZy4gR2xvYiBwYXR0ZXJucyBhcmUgYWx3YXlzIGV2YWx1YXRlZCByZWxhdGl2ZSB0byB0aGUgcGF0aCBvZiB0aGUgd29ya3NwYWNlIGZvbGRlciB1bmxlc3MgdGhleSBhcmUgYWJzb2x1dGUgcGF0aHMuIEZpbGVzIGZyb20gcmVhZG9ubHkgZmlsZSBzeXN0ZW0gcHJvdmlkZXJzIHdpbGwgYWx3YXlzIGJlIHJlYWQtb25seSBpbmRlcGVuZGVudCBvZiB0aGlzIHNldHRpbmcuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHRbRklMRVNfUkVBRE9OTFlfRlJPTV9QRVJNSVNTSU9OU19DT05GSUddOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlc1JlYWRvbmx5RnJvbVBlcm1pc3Npb25zJywgXCJNYXJrcyBmaWxlcyBhcyByZWFkLW9ubHkgd2hlbiB0aGVpciBmaWxlIHBlcm1pc3Npb25zIGluZGljYXRlIGFzIHN1Y2guIFRoaXMgY2FuIGJlIG92ZXJyaWRkZW4gdmlhIGAjZmlsZXMucmVhZG9ubHlJbmNsdWRlI2AgYW5kIGAjZmlsZXMucmVhZG9ubHlFeGNsdWRlI2Agc2V0dGluZ3MuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZVxuXHRcdH0sXG5cdFx0J2ZpbGVzLnJlc3RvcmVVbmRvU3RhY2snOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZXMucmVzdG9yZVVuZG9TdGFjaycsIFwiUmVzdG9yZSB0aGUgdW5kbyBzdGFjayB3aGVuIGEgZmlsZSBpcyByZW9wZW5lZC5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdmaWxlcy5zYXZlQ29uZmxpY3RSZXNvbHV0aW9uJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHQnYXNrVXNlcicsXG5cdFx0XHRcdCdvdmVyd3JpdGVGaWxlT25EaXNrJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2Fza1VzZXInLCBcIldpbGwgcmVmdXNlIHRvIHNhdmUgYW5kIGFzayBmb3IgcmVzb2x2aW5nIHRoZSBzYXZlIGNvbmZsaWN0IG1hbnVhbGx5LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdvdmVyd3JpdGVGaWxlT25EaXNrJywgXCJXaWxsIHJlc29sdmUgdGhlIHNhdmUgY29uZmxpY3QgYnkgb3ZlcndyaXRpbmcgdGhlIGZpbGUgb24gZGlzayB3aXRoIHRoZSBjaGFuZ2VzIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlcy5zYXZlQ29uZmxpY3RSZXNvbHV0aW9uJywgXCJBIHNhdmUgY29uZmxpY3QgY2FuIG9jY3VyIHdoZW4gYSBmaWxlIGlzIHNhdmVkIHRvIGRpc2sgdGhhdCB3YXMgY2hhbmdlZCBieSBhbm90aGVyIHByb2dyYW0gaW4gdGhlIG1lYW50aW1lLiBUbyBwcmV2ZW50IGRhdGEgbG9zcywgdGhlIHVzZXIgaXMgYXNrZWQgdG8gY29tcGFyZSB0aGUgY2hhbmdlcyBpbiB0aGUgZWRpdG9yIHdpdGggdGhlIHZlcnNpb24gb24gZGlzay4gVGhpcyBzZXR0aW5nIHNob3VsZCBvbmx5IGJlIGNoYW5nZWQgaWYgeW91IGZyZXF1ZW50bHkgZW5jb3VudGVyIHNhdmUgY29uZmxpY3QgZXJyb3JzIGFuZCBtYXkgcmVzdWx0IGluIGRhdGEgbG9zcyBpZiB1c2VkIHdpdGhvdXQgY2F1dGlvbi5cIiksXG5cdFx0XHQnZGVmYXVsdCc6ICdhc2tVc2VyJyxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmRpYWxvZy5kZWZhdWx0UGF0aCc6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQncGF0dGVybic6ICdeKChcXFxcL3xcXFxcXFxcXFxcXFxcXFxcfFthLXpBLVpdOlxcXFxcXFxcKS4qKT8kJywgLy8gc2xhc2ggT1IgVU5DLXJvb3QgT1IgZHJpdmUtcm9vdCBPUiB1bmRlZmluZWRcblx0XHRcdCdwYXR0ZXJuRXJyb3JNZXNzYWdlJzogbmxzLmxvY2FsaXplKCdkZWZhdWx0UGF0aEVycm9yTWVzc2FnZScsIFwiRGVmYXVsdCBwYXRoIGZvciBmaWxlIGRpYWxvZ3MgbXVzdCBiZSBhbiBhYnNvbHV0ZSBwYXRoIChlLmcuIEM6XFxcXFxcXFxteUZvbGRlciBvciAvbXlGb2xkZXIpLlwiKSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZURpYWxvZ0RlZmF1bHRQYXRoJywgXCJEZWZhdWx0IHBhdGggZm9yIGZpbGUgZGlhbG9ncywgb3ZlcnJpZGluZyB1c2VyJ3MgaG9tZSBwYXRoLiBPbmx5IHVzZWQgaW4gdGhlIGFic2VuY2Ugb2YgYSBjb250ZXh0LXNwZWNpZmljIHBhdGgsIHN1Y2ggYXMgbW9zdCByZWNlbnRseSBvcGVuZWQgZmlsZSBvciBmb2xkZXIuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkVcblx0XHR9LFxuXHRcdCdmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGUnLCBcIkVuYWJsZXMgdGhlIHNpbXBsZSBmaWxlIGRpYWxvZyBmb3Igb3BlbmluZyBhbmQgc2F2aW5nIGZpbGVzIGFuZCBmb2xkZXJzLiBUaGUgc2ltcGxlIGZpbGUgZGlhbG9nIHJlcGxhY2VzIHRoZSBzeXN0ZW0gZmlsZSBkaWFsb2cgd2hlbiBlbmFibGVkLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2Vcblx0XHR9LFxuXHRcdCdmaWxlcy5wYXJ0aWNpcGFudHMudGltZW91dCc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogNjAwMDAsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbGVzLnBhcnRpY2lwYW50cy50aW1lb3V0JywgXCJUaW1lb3V0IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBmaWxlIHBhcnRpY2lwYW50cyBmb3IgY3JlYXRlLCByZW5hbWUsIGFuZCBkZWxldGUgYXJlIGNhbmNlbGxlZC4gVXNlIGAwYCB0byBkaXNhYmxlIHBhcnRpY2lwYW50cy5cIiksXG5cdFx0fVxuXHR9XG59KTtcblxuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLmVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSxcblx0cHJvcGVydGllczoge1xuXHRcdCdlZGl0b3IuZm9ybWF0T25TYXZlJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZm9ybWF0T25TYXZlJywgXCJGb3JtYXQgYSBmaWxlIG9uIHNhdmUuIEEgZm9ybWF0dGVyIG11c3QgYmUgYXZhaWxhYmxlIGFuZCB0aGUgZWRpdG9yIG11c3Qgbm90IGJlIHNodXR0aW5nIGRvd24uIFdoZW4gezB9IGlzIHNldCB0byBgYWZ0ZXJEZWxheWAsIHRoZSBmaWxlIHdpbGwgb25seSBiZSBmb3JtYXR0ZWQgd2hlbiBzYXZlZCBleHBsaWNpdGx5LlwiLCAnYCNmaWxlcy5hdXRvU2F2ZSNgJyksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0fSxcblx0XHQnZWRpdG9yLmZvcm1hdE9uU2F2ZU1vZGUnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2RlZmF1bHQnOiAnZmlsZScsXG5cdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0J2ZpbGUnLFxuXHRcdFx0XHQnbW9kaWZpY2F0aW9ucycsXG5cdFx0XHRcdCdtb2RpZmljYXRpb25zSWZBdmFpbGFibGUnXG5cdFx0XHRdLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGtleTogJ2V2ZXJ5dGhpbmcnLCBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIG9mIGFuIG9wdGlvbiddIH0sIFwiRm9ybWF0IHRoZSB3aG9sZSBmaWxlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsga2V5OiAnbW9kaWZpY2F0aW9uJywgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBvZiBhbiBvcHRpb24nXSB9LCBcIkZvcm1hdCBtb2RpZmljYXRpb25zLiBSZXF1aXJlcyBzb3VyY2UgY29udHJvbCBhbmQgYSBmb3JtYXR0ZXIgdGhhdCBzdXBwb3J0cyAnRm9ybWF0IFNlbGVjdGlvbicuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoeyBrZXk6ICdtb2RpZmljYXRpb25JZkF2YWlsYWJsZScsIGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gb2YgYW4gb3B0aW9uJ10gfSwgXCJXaWxsIGF0dGVtcHQgdG8gZm9ybWF0IG1vZGlmaWNhdGlvbnMgb25seSAocmVxdWlyZXMgc291cmNlIGNvbnRyb2wgYW5kIGEgZm9ybWF0dGVyIHRoYXQgc3VwcG9ydHMgJ0Zvcm1hdCBTZWxlY3Rpb24nKS4gSWYgc291cmNlIGNvbnRyb2wgY2FuJ3QgYmUgdXNlZCwgdGhlbiB0aGUgd2hvbGUgZmlsZSB3aWxsIGJlIGZvcm1hdHRlZC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2Zvcm1hdE9uU2F2ZU1vZGUnLCBcIkNvbnRyb2xzIGlmIGZvcm1hdCBvbiBzYXZlIGZvcm1hdHMgdGhlIHdob2xlIGZpbGUgb3Igb25seSBtb2RpZmljYXRpb25zLiBPbmx5IGFwcGxpZXMgd2hlbiBgI2VkaXRvci5mb3JtYXRPblNhdmUjYCBpcyBlbmFibGVkLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHR9LFxuXHR9XG59KTtcblxuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdCdpZCc6ICdleHBsb3JlcicsXG5cdCdvcmRlcic6IDEwLFxuXHQndGl0bGUnOiBubHMubG9jYWxpemUoJ2V4cGxvcmVyQ29uZmlndXJhdGlvblRpdGxlJywgXCJGaWxlIEV4cGxvcmVyXCIpLFxuXHQndHlwZSc6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQnZXhwbG9yZXIub3BlbkVkaXRvcnMudmlzaWJsZSc6IHtcblx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoeyBrZXk6ICdvcGVuRWRpdG9yc1Zpc2libGUnLCBjb21tZW50OiBbJ09wZW4gaXMgYW4gYWRqZWN0aXZlJ10gfSwgXCJUaGUgaW5pdGlhbCBtYXhpbXVtIG51bWJlciBvZiBlZGl0b3JzIHNob3duIGluIHRoZSBPcGVuIEVkaXRvcnMgcGFuZS4gRXhjZWVkaW5nIHRoaXMgbGltaXQgd2lsbCBzaG93IGEgc2Nyb2xsIGJhciBhbmQgYWxsb3cgcmVzaXppbmcgdGhlIHBhbmUgdG8gZGlzcGxheSBtb3JlIGl0ZW1zLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogOSxcblx0XHRcdCdtaW5pbXVtJzogMVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLm9wZW5FZGl0b3JzLm1pblZpc2libGUnOiB7XG5cdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKHsga2V5OiAnb3BlbkVkaXRvcnNWaXNpYmxlTWluJywgY29tbWVudDogWydPcGVuIGlzIGFuIGFkamVjdGl2ZSddIH0sIFwiVGhlIG1pbmltdW0gbnVtYmVyIG9mIGVkaXRvciBzbG90cyBwcmUtYWxsb2NhdGVkIGluIHRoZSBPcGVuIEVkaXRvcnMgcGFuZS4gSWYgc2V0IHRvIDAgdGhlIE9wZW4gRWRpdG9ycyBwYW5lIHdpbGwgZHluYW1pY2FsbHkgcmVzaXplIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgZWRpdG9ycy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IDAsXG5cdFx0XHQnbWluaW11bSc6IDBcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5vcGVuRWRpdG9ycy5zb3J0T3JkZXInOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbJ2VkaXRvck9yZGVyJywgJ2FscGhhYmV0aWNhbCcsICdmdWxsUGF0aCddLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKHsga2V5OiAnb3BlbkVkaXRvcnNTb3J0T3JkZXInLCBjb21tZW50OiBbJ09wZW4gaXMgYW4gYWRqZWN0aXZlJ10gfSwgXCJDb250cm9scyB0aGUgc29ydGluZyBvcmRlciBvZiBlZGl0b3JzIGluIHRoZSBPcGVuIEVkaXRvcnMgcGFuZS5cIiksXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXIuZWRpdG9yT3JkZXInLCAnRWRpdG9ycyBhcmUgb3JkZXJlZCBpbiB0aGUgc2FtZSBvcmRlciBlZGl0b3IgdGFicyBhcmUgc2hvd24uJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLmFscGhhYmV0aWNhbCcsICdFZGl0b3JzIGFyZSBvcmRlcmVkIGFscGhhYmV0aWNhbGx5IGJ5IHRhYiBuYW1lIGluc2lkZSBlYWNoIGVkaXRvciBncm91cC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXIuZnVsbFBhdGgnLCAnRWRpdG9ycyBhcmUgb3JkZXJlZCBhbHBoYWJldGljYWxseSBieSBmdWxsIHBhdGggaW5zaWRlIGVhY2ggZWRpdG9yIGdyb3VwLicpXG5cdFx0XHRdLFxuXHRcdFx0J2RlZmF1bHQnOiAnZWRpdG9yT3JkZXInXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuYXV0b1JldmVhbCc6IHtcblx0XHRcdCd0eXBlJzogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0J2VudW0nOiBbdHJ1ZSwgZmFsc2UsICdmb2N1c05vU2Nyb2xsJ10sXG5cdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhdXRvUmV2ZWFsLm9uJywgJ0ZpbGVzIHdpbGwgYmUgcmV2ZWFsZWQgYW5kIHNlbGVjdGVkLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2F1dG9SZXZlYWwub2ZmJywgJ0ZpbGVzIHdpbGwgbm90IGJlIHJldmVhbGVkIGFuZCBzZWxlY3RlZC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhdXRvUmV2ZWFsLmZvY3VzTm9TY3JvbGwnLCAnRmlsZXMgd2lsbCBub3QgYmUgc2Nyb2xsZWQgaW50byB2aWV3LCBidXQgd2lsbCBzdGlsbCBiZSBmb2N1c2VkLicpLFxuXHRcdFx0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnYXV0b1JldmVhbCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGF1dG9tYXRpY2FsbHkgcmV2ZWFsIGFuZCBzZWxlY3QgZmlsZXMgd2hlbiBvcGVuaW5nIHRoZW0uXCIpXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuYXV0b1JldmVhbEV4Y2x1ZGUnOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2F1dG9SZXZlYWxFeGNsdWRlJywgXCJDb25maWd1cmUgcGF0aHMgb3IgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1nbG9iLXBhdHRlcm5zKSBmb3IgZXhjbHVkaW5nIGZpbGVzIGFuZCBmb2xkZXJzIGZyb20gYmVpbmcgcmV2ZWFsZWQgYW5kIHNlbGVjdGVkIGluIHRoZSBFeHBsb3JlciB3aGVuIHRoZXkgYXJlIG9wZW5lZC4gR2xvYiBwYXR0ZXJucyBhcmUgYWx3YXlzIGV2YWx1YXRlZCByZWxhdGl2ZSB0byB0aGUgcGF0aCBvZiB0aGUgd29ya3NwYWNlIGZvbGRlciB1bmxlc3MgdGhleSBhcmUgYWJzb2x1dGUgcGF0aHMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB7ICcqKi9ub2RlX21vZHVsZXMnOiB0cnVlLCAnKiovYm93ZXJfY29tcG9uZW50cyc6IHRydWUgfSxcblx0XHRcdCdhZGRpdGlvbmFsUHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdleHBsb3Jlci5hdXRvUmV2ZWFsRXhjbHVkZS5ib29sZWFuJywgXCJUaGUgZ2xvYiBwYXR0ZXJuIHRvIG1hdGNoIGZpbGUgcGF0aHMgYWdhaW5zdC4gU2V0IHRvIHRydWUgb3IgZmFsc2UgdG8gZW5hYmxlIG9yIGRpc2FibGUgdGhlIHBhdHRlcm4uXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJywgLy8gZXhwcmVzc2lvbiAoeyBcIioqLyouanNcIjogeyBcIndoZW5cIjogXCIkKGJhc2VuYW1lKS5qc1wiIH0gfSlcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXFxcXHcqXFxcXCRcXFxcKGJhc2VuYW1lXFxcXClcXFxcdyonLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICckKGJhc2VuYW1lKS5leHQnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4cGxvcmVyLmF1dG9SZXZlYWxFeGNsdWRlLndoZW4nLCAnQWRkaXRpb25hbCBjaGVjayBvbiB0aGUgc2libGluZ3Mgb2YgYSBtYXRjaGluZyBmaWxlLiBVc2UgezB9IGFzIHZhcmlhYmxlIGZvciB0aGUgbWF0Y2hpbmcgZmlsZSBuYW1lLicsICckKGJhc2VuYW1lKScpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdleHBsb3Jlci5lbmFibGVEcmFnQW5kRHJvcCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdlbmFibGVEcmFnQW5kRHJvcCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGFsbG93IHRvIG1vdmUgZmlsZXMgYW5kIGZvbGRlcnMgdmlhIGRyYWcgYW5kIGRyb3AuIFRoaXMgc2V0dGluZyBvbmx5IGVmZmVjdHMgZHJhZyBhbmQgZHJvcCBmcm9tIGluc2lkZSB0aGUgRXhwbG9yZXIuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29uZmlybURyYWdBbmREcm9wJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2NvbmZpcm1EcmFnQW5kRHJvcCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGFzayBmb3IgY29uZmlybWF0aW9uIHRvIG1vdmUgZmlsZXMgYW5kIGZvbGRlcnMgdmlhIGRyYWcgYW5kIGRyb3AuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29uZmlybVBhc3RlTmF0aXZlJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2NvbmZpcm1QYXN0ZU5hdGl2ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGFzayBmb3IgY29uZmlybWF0aW9uIHdoZW4gcGFzdGluZyBuYXRpdmUgZmlsZXMgYW5kIGZvbGRlcnMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29uZmlybURlbGV0ZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdjb25maXJtRGVsZXRlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBFeHBsb3JlciBzaG91bGQgYXNrIGZvciBjb25maXJtYXRpb24gd2hlbiBkZWxldGluZyBmaWxlcyBhbmQgZm9sZGVycy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5lbmFibGVVbmRvJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2VuYWJsZVVuZG8nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBzdXBwb3J0IHVuZG9pbmcgZmlsZSBhbmQgZm9sZGVyIG9wZXJhdGlvbnMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29uZmlybVVuZG8nOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbVW5kb0NvbmZpcm1MZXZlbC5WZXJib3NlLCBVbmRvQ29uZmlybUxldmVsLkRlZmF1bHQsIFVuZG9Db25maXJtTGV2ZWwuTGlnaHRdLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdjb25maXJtVW5kbycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGFzayBmb3IgY29uZmlybWF0aW9uIHdoZW4gdW5kb2luZy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IFVuZG9Db25maXJtTGV2ZWwuRGVmYXVsdCxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VuYWJsZVVuZG8udmVyYm9zZScsICdFeHBsb3JlciB3aWxsIHByb21wdCBiZWZvcmUgYWxsIHVuZG8gb3BlcmF0aW9ucy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlbmFibGVVbmRvLmRlZmF1bHQnLCAnRXhwbG9yZXIgd2lsbCBwcm9tcHQgYmVmb3JlIGRlc3RydWN0aXZlIHVuZG8gb3BlcmF0aW9ucy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlbmFibGVVbmRvLmxpZ2h0JywgJ0V4cGxvcmVyIHdpbGwgbm90IHByb21wdCBiZWZvcmUgdW5kbyBvcGVyYXRpb25zIHdoZW4gZm9jdXNlZC4nKSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZXhwYW5kU2luZ2xlRm9sZGVyV29ya3NwYWNlcyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdleHBhbmRTaW5nbGVGb2xkZXJXb3Jrc3BhY2VzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBFeHBsb3JlciBzaG91bGQgZXhwYW5kIG11bHRpLXJvb3Qgd29ya3NwYWNlcyBjb250YWluaW5nIG9ubHkgb25lIGZvbGRlciBkdXJpbmcgaW5pdGlhbGl6YXRpb25cIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5zb3J0T3JkZXInOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbU29ydE9yZGVyLkRlZmF1bHQsIFNvcnRPcmRlci5NaXhlZCwgU29ydE9yZGVyLkZpbGVzRmlyc3QsIFNvcnRPcmRlci5UeXBlLCBTb3J0T3JkZXIuTW9kaWZpZWQsIFNvcnRPcmRlci5Gb2xkZXJzTmVzdHNGaWxlc10sXG5cdFx0XHQnZGVmYXVsdCc6IFNvcnRPcmRlci5EZWZhdWx0LFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLmRlZmF1bHQnLCAnRmlsZXMgYW5kIGZvbGRlcnMgYXJlIHNvcnRlZCBieSB0aGVpciBuYW1lcy4gRm9sZGVycyBhcmUgZGlzcGxheWVkIGJlZm9yZSBmaWxlcy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXIubWl4ZWQnLCAnRmlsZXMgYW5kIGZvbGRlcnMgYXJlIHNvcnRlZCBieSB0aGVpciBuYW1lcy4gRmlsZXMgYXJlIGludGVyd292ZW4gd2l0aCBmb2xkZXJzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci5maWxlc0ZpcnN0JywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBzb3J0ZWQgYnkgdGhlaXIgbmFtZXMuIEZpbGVzIGFyZSBkaXNwbGF5ZWQgYmVmb3JlIGZvbGRlcnMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLnR5cGUnLCAnRmlsZXMgYW5kIGZvbGRlcnMgYXJlIGdyb3VwZWQgYnkgZXh0ZW5zaW9uIHR5cGUgdGhlbiBzb3J0ZWQgYnkgdGhlaXIgbmFtZXMuIEZvbGRlcnMgYXJlIGRpc3BsYXllZCBiZWZvcmUgZmlsZXMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLm1vZGlmaWVkJywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBzb3J0ZWQgYnkgbGFzdCBtb2RpZmllZCBkYXRlIGluIGRlc2NlbmRpbmcgb3JkZXIuIEZvbGRlcnMgYXJlIGRpc3BsYXllZCBiZWZvcmUgZmlsZXMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLmZvbGRlcnNOZXN0c0ZpbGVzJywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBzb3J0ZWQgYnkgdGhlaXIgbmFtZXMuIEZvbGRlcnMgYXJlIGRpc3BsYXllZCBiZWZvcmUgZmlsZXMuIEZpbGVzIHdpdGggbmVzdGVkIGNoaWxkcmVuIGFyZSBkaXNwbGF5ZWQgYmVmb3JlIG90aGVyIGZpbGVzLicpXG5cdFx0XHRdLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3NvcnRPcmRlcicsIFwiQ29udHJvbHMgdGhlIHByb3BlcnR5LWJhc2VkIHNvcnRpbmcgb2YgZmlsZXMgYW5kIGZvbGRlcnMgaW4gdGhlIEV4cGxvcmVyLiBXaGVuIGAjZXhwbG9yZXIuZmlsZU5lc3RpbmcuZW5hYmxlZCNgIGlzIGVuYWJsZWQsIGFsc28gY29udHJvbHMgc29ydGluZyBvZiBuZXN0ZWQgZmlsZXMuXCIpXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuc29ydE9yZGVyTGV4aWNvZ3JhcGhpY09wdGlvbnMnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbTGV4aWNvZ3JhcGhpY09wdGlvbnMuRGVmYXVsdCwgTGV4aWNvZ3JhcGhpY09wdGlvbnMuVXBwZXIsIExleGljb2dyYXBoaWNPcHRpb25zLkxvd2VyLCBMZXhpY29ncmFwaGljT3B0aW9ucy5Vbmljb2RlXSxcblx0XHRcdCdkZWZhdWx0JzogTGV4aWNvZ3JhcGhpY09wdGlvbnMuRGVmYXVsdCxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zLmRlZmF1bHQnLCAnVXBwZXJjYXNlIGFuZCBsb3dlcmNhc2UgbmFtZXMgYXJlIG1peGVkIHRvZ2V0aGVyLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zLnVwcGVyJywgJ1VwcGVyY2FzZSBuYW1lcyBhcmUgZ3JvdXBlZCB0b2dldGhlciBiZWZvcmUgbG93ZXJjYXNlIG5hbWVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zLmxvd2VyJywgJ0xvd2VyY2FzZSBuYW1lcyBhcmUgZ3JvdXBlZCB0b2dldGhlciBiZWZvcmUgdXBwZXJjYXNlIG5hbWVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zLnVuaWNvZGUnLCAnTmFtZXMgYXJlIHNvcnRlZCBpbiBVbmljb2RlIG9yZGVyLicpXG5cdFx0XHRdLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdzb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucycsIFwiQ29udHJvbHMgdGhlIGxleGljb2dyYXBoaWMgc29ydGluZyBvZiBmaWxlIGFuZCBmb2xkZXIgbmFtZXMgaW4gdGhlIEV4cGxvcmVyLlwiKVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLnNvcnRPcmRlclJldmVyc2UnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyUmV2ZXJzZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZmlsZSBhbmQgZm9sZGVyIHNvcnQgb3JkZXIsIHNob3VsZCBiZSByZXZlcnNlZC5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmRlY29yYXRpb25zLmNvbG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4cGxvcmVyLmRlY29yYXRpb25zLmNvbG9ycycsIFwiQ29udHJvbHMgd2hldGhlciBmaWxlIGRlY29yYXRpb25zIHNob3VsZCB1c2UgY29sb3JzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5kZWNvcmF0aW9ucy5iYWRnZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHBsb3Jlci5kZWNvcmF0aW9ucy5iYWRnZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsZSBkZWNvcmF0aW9ucyBzaG91bGQgdXNlIGJhZGdlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuaW5jcmVtZW50YWxOYW1pbmcnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzaW1wbGUnLCAnc21hcnQnLCAnZGlzYWJsZWQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaW1wbGUnLCBcIkFwcGVuZHMgdGhlIHdvcmQgXFxcImNvcHlcXFwiIGF0IHRoZSBlbmQgb2YgdGhlIGR1cGxpY2F0ZWQgbmFtZSBwb3RlbnRpYWxseSBmb2xsb3dlZCBieSBhIG51bWJlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc21hcnQnLCBcIkFkZHMgYSBudW1iZXIgYXQgdGhlIGVuZCBvZiB0aGUgZHVwbGljYXRlZCBuYW1lLiBJZiBzb21lIG51bWJlciBpcyBhbHJlYWR5IHBhcnQgb2YgdGhlIG5hbWUsIHRyaWVzIHRvIGluY3JlYXNlIHRoYXQgbnVtYmVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaXNhYmxlZCcsIFwiRGlzYWJsZXMgaW5jcmVtZW50YWwgbmFtaW5nLiBJZiB0d28gZmlsZXMgd2l0aCB0aGUgc2FtZSBuYW1lIGV4aXN0IHlvdSB3aWxsIGJlIHByb21wdGVkIHRvIG92ZXJ3cml0ZSB0aGUgZXhpc3RpbmcgZmlsZS5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHBsb3Jlci5pbmNyZW1lbnRhbE5hbWluZycsIFwiQ29udHJvbHMgd2hpY2ggbmFtaW5nIHN0cmF0ZWd5IHRvIHVzZSB3aGVuIGdpdmluZyBhIG5ldyBuYW1lIHRvIGEgZHVwbGljYXRlZCBFeHBsb3JlciBpdGVtIG9uIHBhc3RlLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdzaW1wbGUnXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuYXV0b09wZW5Ecm9wcGVkRmlsZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhdXRvT3BlbkRyb3BwZWRGaWxlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBFeHBsb3JlciBzaG91bGQgYXV0b21hdGljYWxseSBvcGVuIGEgZmlsZSB3aGVuIGl0IGlzIGRyb3BwZWQgaW50byB0aGUgZXhwbG9yZXJcIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5jb21wYWN0Rm9sZGVycyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdjb21wcmVzc1NpbmdsZUNoaWxkRm9sZGVycycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIHJlbmRlciBmb2xkZXJzIGluIGEgY29tcGFjdCBmb3JtLiBJbiBzdWNoIGEgZm9ybSwgc2luZ2xlIGNoaWxkIGZvbGRlcnMgd2lsbCBiZSBjb21wcmVzc2VkIGluIGEgY29tYmluZWQgdHJlZSBlbGVtZW50LiBVc2VmdWwgZm9yIEphdmEgcGFja2FnZSBzdHJ1Y3R1cmVzLCBmb3IgZXhhbXBsZS5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5jb3B5UmVsYXRpdmVQYXRoU2VwYXJhdG9yJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHQnLycsXG5cdFx0XHRcdCdcXFxcJyxcblx0XHRcdFx0J2F1dG8nXG5cdFx0XHRdLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29weVJlbGF0aXZlUGF0aFNlcGFyYXRvci5zbGFzaCcsIFwiVXNlIHNsYXNoIGFzIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGhTZXBhcmF0b3IuYmFja3NsYXNoJywgXCJVc2UgYmFja3NsYXNoIGFzIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGhTZXBhcmF0b3IuYXV0bycsIFwiVXNlcyBvcGVyYXRpbmcgc3lzdGVtIHNwZWNpZmljIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY29weVJlbGF0aXZlUGF0aFNlcGFyYXRvcicsIFwiVGhlIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIgdXNlZCB3aGVuIGNvcHlpbmcgcmVsYXRpdmUgZmlsZSBwYXRocy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6ICdhdXRvJ1xuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmNvcHlQYXRoU2VwYXJhdG9yJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHQnLycsXG5cdFx0XHRcdCdcXFxcJyxcblx0XHRcdFx0J2F1dG8nXG5cdFx0XHRdLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29weVBhdGhTZXBhcmF0b3Iuc2xhc2gnLCBcIlVzZSBzbGFzaCBhcyBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb3B5UGF0aFNlcGFyYXRvci5iYWNrc2xhc2gnLCBcIlVzZSBiYWNrc2xhc2ggYXMgcGF0aCBzZXBhcmF0aW9uIGNoYXJhY3Rlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29weVBhdGhTZXBhcmF0b3IuYXV0bycsIFwiVXNlcyBvcGVyYXRpbmcgc3lzdGVtIHNwZWNpZmljIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY29weVBhdGhTZXBhcmF0b3InLCBcIlRoZSBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyIHVzZWQgd2hlbiBjb3B5aW5nIGZpbGUgcGF0aHMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiAnYXV0bydcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5leGNsdWRlR2l0SWdub3JlJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleGNsdWRlR2l0aWdub3JlJywgXCJDb250cm9scyB3aGV0aGVyIGVudHJpZXMgaW4gLmdpdGlnbm9yZSBzaG91bGQgYmUgcGFyc2VkIGFuZCBleGNsdWRlZCBmcm9tIHRoZSBFeHBsb3Jlci4gU2ltaWxhciB0byB7MH0uXCIsICdgI2ZpbGVzLmV4Y2x1ZGUjYCcpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZmlsZU5lc3RpbmcuZW5hYmxlZCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlTmVzdGluZ0VuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsZSBuZXN0aW5nIGlzIGVuYWJsZWQgaW4gdGhlIEV4cGxvcmVyLiBGaWxlIG5lc3RpbmcgYWxsb3dzIGZvciByZWxhdGVkIGZpbGVzIGluIGEgZGlyZWN0b3J5IHRvIGJlIHZpc3VhbGx5IGdyb3VwZWQgdG9nZXRoZXIgdW5kZXIgYSBzaW5nbGUgcGFyZW50IGZpbGUuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5maWxlTmVzdGluZy5leHBhbmQnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlTmVzdGluZ0V4cGFuZCcsIFwiQ29udHJvbHMgd2hldGhlciBmaWxlIG5lc3RzIGFyZSBhdXRvbWF0aWNhbGx5IGV4cGFuZGVkLiB7MH0gbXVzdCBiZSBzZXQgZm9yIHRoaXMgdG8gdGFrZSBlZmZlY3QuXCIsICdgI2V4cGxvcmVyLmZpbGVOZXN0aW5nLmVuYWJsZWQjYCcpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmZpbGVOZXN0aW5nLnBhdHRlcm5zJzoge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZU5lc3RpbmdQYXR0ZXJucycsIFwiQ29udHJvbHMgbmVzdGluZyBvZiBmaWxlcyBpbiB0aGUgRXhwbG9yZXIuIHswfSBtdXN0IGJlIHNldCBmb3IgdGhpcyB0byB0YWtlIGVmZmVjdC4gRWFjaCBfX0l0ZW1fXyByZXByZXNlbnRzIGEgcGFyZW50IHBhdHRlcm4gYW5kIG1heSBjb250YWluIGEgc2luZ2xlIGAqYCBjaGFyYWN0ZXIgdGhhdCBtYXRjaGVzIGFueSBzdHJpbmcuIEVhY2ggX19WYWx1ZV9fIHJlcHJlc2VudHMgYSBjb21tYSBzZXBhcmF0ZWQgbGlzdCBvZiB0aGUgY2hpbGQgcGF0dGVybnMgdGhhdCBzaG91bGQgYmUgc2hvd24gbmVzdGVkIHVuZGVyIGEgZ2l2ZW4gcGFyZW50LiBDaGlsZCBwYXR0ZXJucyBtYXkgY29udGFpbiBzZXZlcmFsIHNwZWNpYWwgdG9rZW5zOlxcbi0gYCR7Y2FwdHVyZX1gOiBNYXRjaGVzIHRoZSByZXNvbHZlZCB2YWx1ZSBvZiB0aGUgYCpgIGZyb20gdGhlIHBhcmVudCBwYXR0ZXJuXFxuLSBgJHtiYXNlbmFtZX1gOiBNYXRjaGVzIHRoZSBwYXJlbnQgZmlsZSdzIGJhc2VuYW1lLCB0aGUgYGZpbGVgIGluIGBmaWxlLnRzYFxcbi0gYCR7ZXh0bmFtZX1gOiBNYXRjaGVzIHRoZSBwYXJlbnQgZmlsZSdzIGV4dGVuc2lvbiwgdGhlIGB0c2AgaW4gYGZpbGUudHNgXFxuLSBgJHtkaXJuYW1lfWA6IE1hdGNoZXMgdGhlIHBhcmVudCBmaWxlJ3MgZGlyZWN0b3J5IG5hbWUsIHRoZSBgc3JjYCBpbiBgc3JjL2ZpbGUudHNgXFxuLSBgKmA6ICBNYXRjaGVzIGFueSBzdHJpbmcsIG1heSBvbmx5IGJlIHVzZWQgb25jZSBwZXIgY2hpbGQgcGF0dGVyblwiLCAnYCNleHBsb3Jlci5maWxlTmVzdGluZy5lbmFibGVkI2AnKSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdeW14qXSpcXFxcKj9bXipdKiQnOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaWxlTmVzdGluZy5kZXNjcmlwdGlvbicsIFwiRWFjaCBrZXkgcGF0dGVybiBtYXkgY29udGFpbiBhIHNpbmdsZSBgKmAgY2hhcmFjdGVyIHdoaWNoIHdpbGwgbWF0Y2ggYW55IHN0cmluZy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0cGF0dGVybjogJ14oW14sKl0qXFxcXCo/W14sKl0qKSgsID9bXiwqXSpcXFxcKj9bXiwqXSopKiQnLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCcqLnRzJzogJyR7Y2FwdHVyZX0uanMnLFxuXHRcdFx0XHQnKi5qcyc6ICcke2NhcHR1cmV9LmpzLm1hcCwgJHtjYXB0dXJlfS5taW4uanMsICR7Y2FwdHVyZX0uZC50cycsXG5cdFx0XHRcdCcqLmpzeCc6ICcke2NhcHR1cmV9LmpzJyxcblx0XHRcdFx0JyoudHN4JzogJyR7Y2FwdHVyZX0udHMnLFxuXHRcdFx0XHQndHNjb25maWcuanNvbic6ICd0c2NvbmZpZy4qLmpzb24nLFxuXHRcdFx0XHQncGFja2FnZS5qc29uJzogJ3BhY2thZ2UtbG9jay5qc29uLCB5YXJuLmxvY2ssIHBucG0tbG9jay55YW1sLCBidW4ubG9ja2IsIGJ1bi5sb2NrJyxcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5VbmRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbigxMTAsICdleHBsb3JlcicsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRjb25zdCB1bmRvUmVkb1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVuZG9SZWRvU2VydmljZSk7XG5cdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBleHBsb3JlckNhblVuZG8gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmVuYWJsZVVuZG87XG5cdGlmIChleHBsb3JlclNlcnZpY2UuaGFzVmlld0ZvY3VzKCkgJiYgdW5kb1JlZG9TZXJ2aWNlLmNhblVuZG8oVU5ET19SRURPX1NPVVJDRSkgJiYgZXhwbG9yZXJDYW5VbmRvKSB7XG5cdFx0dW5kb1JlZG9TZXJ2aWNlLnVuZG8oVU5ET19SRURPX1NPVVJDRSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59KTtcblxuUmVkb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oMTEwLCAnZXhwbG9yZXInLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgdW5kb1JlZG9TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVbmRvUmVkb1NlcnZpY2UpO1xuXHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0Y29uc3QgZXhwbG9yZXJDYW5VbmRvID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5lbmFibGVVbmRvO1xuXHRpZiAoZXhwbG9yZXJTZXJ2aWNlLmhhc1ZpZXdGb2N1cygpICYmIHVuZG9SZWRvU2VydmljZS5jYW5SZWRvKFVORE9fUkVET19TT1VSQ0UpICYmIGV4cGxvcmVyQ2FuVW5kbykge1xuXHRcdHVuZG9SZWRvU2VydmljZS5yZWRvKFVORE9fUkVET19TT1VSQ0UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufSk7XG5cbk1vZGVzUmVnaXN0cnkucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdGlkOiBCSU5BUllfVEVYVF9GSUxFX01PREUsXG5cdGFsaWFzZXM6IFsnQmluYXJ5J10sXG5cdG1pbWV0eXBlczogWyd0ZXh0L3gtY29kZS1iaW5hcnknXVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsY0FBYyx5QkFBeUIsMEJBQXdEO0FBQ2hJLFNBQWlDLGdCQUFnQixzQ0FBc0M7QUFDdkYsU0FBbUQsd0JBQXdCO0FBQzNFLFNBQVMsdUJBQXVCLHNCQUFzQixzQkFBc0IsMkJBQTJCLCtCQUErQiwrQkFBK0IsOENBQThDO0FBQ25OLFNBQVMsV0FBVyxzQkFBc0Isc0JBQXNCLHVCQUF1Qix3QkFBNkM7QUFDcEksU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxVQUFVLE9BQU8saUJBQWlCO0FBQzNDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQThCLDRCQUE0QjtBQUMxRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxpQkFBaUIsd0JBQXdCO0FBQ2xELFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxt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
