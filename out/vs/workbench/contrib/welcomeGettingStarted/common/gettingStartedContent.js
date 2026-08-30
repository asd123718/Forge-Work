import themePickerContent from "./media/theme_picker.js";
import themePickerSmallContent from "./media/theme_picker_small.js";
import notebookProfileContent from "./media/notebookProfile.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { NotebookSetting } from "../../notebook/common/notebookCommon.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import product from "../../../../platform/product/common/product.js";
const defaultChat = {
  documentationUrl: product.defaultChatAgent?.documentationUrl ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { name: "" } },
  publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? "",
  termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? "",
  privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ""
};
function copilotSettingsMessage(manageSettingsUrl) {
  return localize({ key: "settings", comment: ['{Locked="["}', '{Locked="]({0})"}', '{Locked="]({1})"}'] }, "{0} Copilot may show [public code]({1}) suggestions and use your data to improve the product. You can change these [settings]({2}) anytime.", defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, manageSettingsUrl);
}
class GettingStartedContentProviderRegistry {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
  }
  registerProvider(moduleId, provider) {
    this.providers.set(moduleId, provider);
  }
  getProvider(moduleId) {
    return this.providers.get(moduleId);
  }
}
const gettingStartedContentRegistry = new GettingStartedContentProviderRegistry();
async function moduleToContent(resource) {
  if (!resource.query) {
    throw new Error("Getting Started: invalid resource");
  }
  const query = JSON.parse(resource.query);
  if (!query.moduleId) {
    throw new Error("Getting Started: invalid resource");
  }
  const provider = gettingStartedContentRegistry.getProvider(query.moduleId);
  if (!provider) {
    throw new Error(`Getting Started: no provider registered for ${query.moduleId}`);
  }
  return provider();
}
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker", themePickerContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker_small", themePickerSmallContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/notebookProfile", notebookProfileContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/empty", () => "");
const setupIcon = registerIcon("getting-started-setup", Codicon.zap, localize("getting-started-setup-icon", "Icon used for the setup category of welcome page"));
const beginnerIcon = registerIcon("getting-started-beginner", Codicon.lightbulb, localize("getting-started-beginner-icon", "Icon used for the beginner category of welcome page"));
const startEntries = [
  {
    id: "welcome.showNewFileEntries",
    title: localize("gettingStarted.newFile.title", "New File..."),
    description: localize("gettingStarted.newFile.description", "Open a new untitled text file, notebook, or custom editor."),
    icon: Codicon.newFile,
    content: {
      type: "startEntry",
      command: "command:welcome.showNewFileEntries"
    }
  },
  {
    id: "topLevelOpenMac",
    title: localize("gettingStarted.openMac.title", "Open..."),
    description: localize("gettingStarted.openMac.description", "Open a file or folder to start working"),
    icon: Codicon.folderOpened,
    when: "!isWeb && isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFileFolder"
    }
  },
  {
    id: "topLevelOpenFile",
    title: localize("gettingStarted.openFile.title", "Open File..."),
    description: localize("gettingStarted.openFile.description", "Open a file to start working"),
    icon: Codicon.goToFile,
    when: "isWeb || !isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFile"
    }
  },
  {
    id: "topLevelOpenFolder",
    title: localize("gettingStarted.openFolder.title", "Open Folder..."),
    description: localize("gettingStarted.openFolder.description", "Open a folder to start working"),
    icon: Codicon.folderOpened,
    when: "!isWeb && !isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFolder"
    }
  },
  {
    id: "topLevelOpenFolderWeb",
    title: localize("gettingStarted.openFolder.title", "Open Folder..."),
    description: localize("gettingStarted.openFolder.description", "Open a folder to start working"),
    icon: Codicon.folderOpened,
    when: "!openFolderWorkspaceSupport && workbenchState == 'workspace'",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFolderViaWorkspace"
    }
  },
  {
    id: "topLevelGitClone",
    title: localize("gettingStarted.topLevelGitClone.title", "Clone Git Repository..."),
    description: localize("gettingStarted.topLevelGitClone.description", "Clone a remote repository to a local folder"),
    when: "config.git.enabled && !git.missing",
    icon: Codicon.sourceControl,
    content: {
      type: "startEntry",
      command: "command:git.clone"
    }
  },
  {
    id: "topLevelGitOpen",
    title: localize("gettingStarted.topLevelGitOpen.title", "Open Repository..."),
    description: localize("gettingStarted.topLevelGitOpen.description", "Connect to a remote repository or pull request to browse, search, edit, and commit"),
    when: "workspacePlatform == 'webworker'",
    icon: Codicon.sourceControl,
    content: {
      type: "startEntry",
      command: "command:remoteHub.openRepository"
    }
  },
  {
    id: "topLevelRemoteOpen",
    title: localize("gettingStarted.topLevelRemoteOpen.title", "Connect to..."),
    description: localize("gettingStarted.topLevelRemoteOpen.description", "Connect to remote development workspaces."),
    when: "!isWeb",
    icon: Codicon.remote,
    content: {
      type: "startEntry",
      command: "command:workbench.action.remote.showMenu"
    }
  },
  {
    id: "topLevelOpenTunnel",
    title: localize("gettingStarted.topLevelOpenTunnel.title", "Open Tunnel..."),
    description: localize("gettingStarted.topLevelOpenTunnel.description", "Connect to a remote machine through a Tunnel"),
    when: "isWeb && showRemoteStartEntryInWeb",
    icon: Codicon.remote,
    content: {
      type: "startEntry",
      command: "command:workbench.action.remote.showWebStartEntryActions"
    }
  },
  {
    id: "topLevelNewWorkspaceChat",
    title: localize("gettingStarted.newWorkspaceChat.title", "Generate New Workspace..."),
    description: localize("gettingStarted.newWorkspaceChat.description", "Chat to create a new workspace"),
    icon: Codicon.chatSparkle,
    when: "!isWeb && !chatSetupHidden && !chatSetupDisabledInWorkspace",
    content: {
      type: "startEntry",
      command: "command:welcome.newWorkspaceChat"
    }
  }
];
const Button = (title, href) => `[${title}](${href})`;
const CopilotStepTitle = localize("gettingStarted.copilotSetup.title", "Use AI features with Copilot for free");
const CopilotDescription = localize({ key: "gettingStarted.copilotSetup.description", comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You can use [Copilot]({0}) to generate code across multiple files, fix errors, ask questions about your code, and much more using natural language.", defaultChat.documentationUrl ?? "");
const CopilotTermsString = localize({ key: "gettingStarted.copilotSetup.terms", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
const CopilotAnonymousButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetupAnonymousWithoutDialog`);
const CopilotSignedOutButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotSignedInButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotCompleteButton = Button(localize("setupCopilotButton.chatWithCopilot", "Start to Chat"), "command:workbench.action.chat.open");
function createCopilotSetupStep(id, button, when, includeTerms) {
  const description = includeTerms ? `${CopilotDescription}
${CopilotTermsString}
${button}` : `${CopilotDescription}
${button}`;
  return {
    id,
    title: CopilotStepTitle,
    description,
    when: `${when} && !chatSetupHidden && !chatSetupDisabledInWorkspace`,
    media: {
      type: "svg",
      altText: "VS Code Copilot multi file edits",
      path: "multi-file-edits.svg"
    }
  };
}
const walkthroughs = [
  {
    id: "Setup",
    title: localize("gettingStarted.setup.title", "Get started with VS Code"),
    description: localize("gettingStarted.setup.description", "Customize your editor, learn the basics, and start coding"),
    isFeatured: true,
    icon: setupIcon,
    when: "!isWeb",
    walkthroughPageTitle: localize("gettingStarted.setup.walkthroughPageTitle", "Setup VS Code"),
    next: "Beginner",
    content: {
      type: "steps",
      steps: [
        createCopilotSetupStep("CopilotSetupAnonymous", CopilotAnonymousButton, "chatAnonymous && !chatSetupCompleted", true),
        createCopilotSetupStep("CopilotSetupSignedOut", CopilotSignedOutButton, "chatEntitlementSignedOut && !chatAnonymous && !github.copilot.hasByokModels", false),
        createCopilotSetupStep("CopilotSetupComplete", CopilotCompleteButton, "chatSetupCompleted && !chatSetupDisabled && (chatAnonymous || chatPlanPro || chatPlanProPlus || chatPlanMax || chatPlanBusiness || chatPlanEnterprise || chatPlanFree)", false),
        createCopilotSetupStep("CopilotSetupSignedIn", CopilotSignedInButton, "!chatEntitlementSignedOut && (!chatSetupCompleted || chatSetupDisabled || chatPlanCanSignUp)", false),
        {
          id: "pickColorTheme",
          title: localize("gettingStarted.pickColor.title", "Choose your theme"),
          description: localize("gettingStarted.pickColor.description.interpolated", "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize("titleID", "Browse Color Themes"), "command:workbench.action.selectTheme")),
          completionEvents: [
            "onSettingChanged:workbench.colorTheme",
            "onCommand:workbench.action.selectTheme"
          ],
          media: { type: "markdown", path: "theme_picker" }
        },
        {
          id: "videoTutorial",
          title: localize("gettingStarted.videoTutorial.title", "Watch video tutorials"),
          description: localize("gettingStarted.videoTutorial.description.interpolated", "Watch the first in a series of short & practical video tutorials for VS Code's key features.\n{0}", Button(localize("watch", "Watch Tutorial"), "https://aka.ms/vscode-getting-started-video")),
          media: { type: "svg", altText: "VS Code Settings", path: "learn.svg" }
        }
      ]
    }
  },
  {
    id: "SetupWeb",
    title: localize("gettingStarted.setupWeb.title", "Get Started with VS Code for the Web"),
    description: localize("gettingStarted.setupWeb.description", "Customize your editor, learn the basics, and start coding"),
    isFeatured: true,
    icon: setupIcon,
    when: "isWeb",
    next: "Beginner",
    walkthroughPageTitle: localize("gettingStarted.setupWeb.walkthroughPageTitle", "Setup VS Code Web"),
    content: {
      type: "steps",
      steps: [
        {
          id: "pickColorThemeWeb",
          title: localize("gettingStarted.pickColor.title", "Choose your theme"),
          description: localize("gettingStarted.pickColor.description.interpolated", "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize("titleID", "Browse Color Themes"), "command:workbench.action.selectTheme")),
          completionEvents: [
            "onSettingChanged:workbench.colorTheme",
            "onCommand:workbench.action.selectTheme"
          ],
          media: { type: "markdown", path: "theme_picker" }
        },
        {
          id: "menuBarWeb",
          title: localize("gettingStarted.menuBar.title", "Just the right amount of UI"),
          description: localize("gettingStarted.menuBar.description.interpolated", "The full menu bar is available in the dropdown menu to make room for your code. Toggle its appearance for faster access. \n{0}", Button(localize("toggleMenuBar", "Toggle Menu Bar"), "command:workbench.action.toggleMenuBar")),
          when: "isWeb",
          media: {
            type: "svg",
            altText: "Comparing menu dropdown with the visible menu bar.",
            path: "menuBar.svg"
          }
        },
        {
          id: "extensionsWebWeb",
          title: localize("gettingStarted.extensions.title", "Code with extensions"),
          description: localize("gettingStarted.extensionsWeb.description.interpolated", "Extensions are VS Code's power-ups. A growing number are becoming available in the web.\n{0}", Button(localize("browsePopularWeb", "Browse Popular Web Extensions"), "command:workbench.extensions.action.showPopularExtensions")),
          when: "workspacePlatform == 'webworker'",
          media: {
            type: "svg",
            altText: "VS Code extension marketplace with featured language extensions",
            path: "extensions-web.svg"
          }
        },
        {
          id: "findLanguageExtensionsWeb",
          title: localize("gettingStarted.findLanguageExts.title", "Rich support for all your languages"),
          description: localize("gettingStarted.findLanguageExts.description.interpolated", "Code smarter with syntax highlighting, inline suggestions, linting and debugging. While many languages are built-in, many more can be added as extensions.\n{0}", Button(localize("browseLangExts", "Browse Language Extensions"), "command:workbench.extensions.action.showLanguageExtensions")),
          when: "workspacePlatform != 'webworker'",
          media: {
            type: "svg",
            altText: "Language extensions",
            path: "languages.svg"
          }
        },
        {
          id: "settingsSyncWeb",
          title: localize("gettingStarted.settingsSync.title", "Sync settings across devices"),
          description: localize("gettingStarted.settingsSync.description.interpolated", "Keep your essential customizations backed up and updated across all your devices.\n{0}", Button(localize("enableSync", "Backup and Sync Settings"), "command:workbench.userDataSync.actions.turnOn")),
          when: "syncStatus != uninitialized",
          completionEvents: ["onEvent:sync-enabled"],
          media: {
            type: "svg",
            altText: 'The "Turn on Sync" entry in the settings gear menu.',
            path: "settingsSync.svg"
          }
        },
        {
          id: "commandPaletteTaskWeb",
          title: localize("gettingStarted.commandPalette.title", "Unlock productivity with the Command Palette "),
          description: localize("gettingStarted.commandPalette.description.interpolated", "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize("commandPalette", "Open Command Palette"), "command:workbench.action.showCommands")),
          media: { type: "svg", altText: "Command Palette overlay for searching and executing commands.", path: "commandPalette.svg" }
        },
        {
          id: "pickAFolderTask-WebWeb",
          title: localize("gettingStarted.setup.OpenFolder.title", "Open up your code"),
          description: localize("gettingStarted.setup.OpenFolderWeb.description.interpolated", "You're all set to start coding. You can open a local project or a remote repository to get your files into VS Code.\n{0}\n{1}", Button(localize("openFolder", "Open Folder"), "command:workbench.action.addRootFolder"), Button(localize("openRepository", "Open Repository"), "command:remoteHub.openRepository")),
          when: "workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Explorer view showing buttons for opening folder and cloning repository.",
            path: "openFolder.svg"
          }
        },
        {
          id: "quickOpenWeb",
          title: localize("gettingStarted.quickOpen.title", "Quickly navigate between your files"),
          description: localize("gettingStarted.quickOpen.description.interpolated", "Navigate between files in an instant with one keystroke. Tip: Open multiple files by pressing the right arrow key.\n{0}", Button(localize("quickOpen", "Quick Open a File"), "command:toSide:workbench.action.quickOpen")),
          when: "workspaceFolderCount != 0",
          media: {
            type: "svg",
            altText: "Go to file in quick search.",
            path: "search.svg"
          }
        }
      ]
    }
  },
  {
    id: "SetupAccessibility",
    title: localize("gettingStarted.setupAccessibility.title", "Get Started with Accessibility Features"),
    description: localize("gettingStarted.setupAccessibility.description", "Learn the tools and shortcuts that make VS Code accessible. Note that some actions are not actionable from within the context of the walkthrough."),
    isFeatured: true,
    icon: setupIcon,
    when: CONTEXT_ACCESSIBILITY_MODE_ENABLED.key,
    next: "Setup",
    walkthroughPageTitle: localize("gettingStarted.setupAccessibility.walkthroughPageTitle", "Setup VS Code Accessibility"),
    content: {
      type: "steps",
      steps: [
        {
          id: "accessibilityHelp",
          title: localize("gettingStarted.accessibilityHelp.title", "Use the accessibility help dialog to learn about features"),
          description: localize("gettingStarted.accessibilityHelp.description.interpolated", "The accessibility help dialog provides information about what to expect from a feature and the commands/keybindings to operate them.\n With focus in an editor, terminal, notebook, chat response, comment, or debug console, the relevant dialog can be opened with the Open Accessibility Help command.\n{0}", Button(localize("openAccessibilityHelp", "Open Accessibility Help"), "command:editor.action.accessibilityHelp")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibleView",
          title: localize("gettingStarted.accessibleView.title", "Screen reader users can inspect content line by line, character by character in the accessible view."),
          description: localize("gettingStarted.accessibleView.description.interpolated", "The accessible view is available for the terminal, hovers, notifications, comments, notebook output, chat responses, inline completions, and debug console output.\n With focus in any of those features, it can be opened with the Open Accessible View command.\n{0}", Button(localize("openAccessibleView", "Open Accessible View"), "command:editor.action.accessibleView")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "verbositySettings",
          title: localize("gettingStarted.verbositySettings.title", "Control the verbosity of aria labels"),
          description: localize("gettingStarted.verbositySettings.description.interpolated", "Screen reader verbosity settings exist for features around the workbench so that once a user is familiar with a feature, they can avoid hearing hints about how to operate it. For example, features for which an accessibility help dialog exists will indicate how to open the dialog until the verbosity setting for that feature has been disabled.\n These and other accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize("openVerbositySettings", "Open Accessibility Settings"), "command:workbench.action.openAccessibilitySettings")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "commandPaletteTaskAccessibility",
          title: localize("gettingStarted.commandPaletteAccessibility.title", "Unlock productivity with the Command Palette "),
          description: localize("gettingStarted.commandPaletteAccessibility.description.interpolated", "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize("commandPalette", "Open Command Palette"), "command:workbench.action.showCommands")),
          media: { type: "markdown", path: "empty" }
        },
        {
          id: "keybindingsAccessibility",
          title: localize("gettingStarted.keyboardShortcuts.title", "Customize your keyboard shortcuts"),
          description: localize("gettingStarted.keyboardShortcuts.description.interpolated", "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize("keyboardShortcuts", "Keyboard Shortcuts"), "command:toSide:workbench.action.openGlobalKeybindings")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibilitySignals",
          title: localize("gettingStarted.accessibilitySignals.title", "Fine tune which accessibility signals you want to receive via audio or a braille device"),
          description: localize("gettingStarted.accessibilitySignals.description.interpolated", "Accessibility sounds and announcements are played around the workbench for different events.\n These can be discovered and configured using the List Signal Sounds and List Signal Announcements commands.\n{0}\n{1}", Button(localize("listSignalSounds", "List Signal Sounds"), "command:signals.sounds.help"), Button(localize("listSignalAnnouncements", "List Signal Announcements"), "command:accessibility.announcement.help")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "hover",
          title: localize("gettingStarted.hover.title", "Access the hover in the editor to get more information on a variable or symbol"),
          description: localize("gettingStarted.hover.description.interpolated", "While focus is in the editor on a variable or symbol, a hover can be focused with the Show or Open Hover command.\n{0}", Button(localize("showOrFocusHover", "Show or Focus Hover"), "command:editor.action.showHover")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "goToSymbol",
          title: localize("gettingStarted.goToSymbol.title", "Navigate to symbols in a file"),
          description: localize("gettingStarted.goToSymbol.description.interpolated", "The Go to Symbol command is useful for navigating between important landmarks in a document.\n{0}", Button(localize("openGoToSymbol", "Go to Symbol"), "command:editor.action.goToSymbol")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "codeFolding",
          title: localize("gettingStarted.codeFolding.title", "Use code folding to collapse blocks of code and focus on the code you're interested in."),
          description: localize("gettingStarted.codeFolding.description.interpolated", "Fold or unfold a code section with the Toggle Fold command.\n{0}\n Fold or unfold recursively with the Toggle Fold Recursively Command\n{1}\n", Button(localize("toggleFold", "Toggle Fold"), "command:editor.toggleFold"), Button(localize("toggleFoldRecursively", "Toggle Fold Recursively"), "command:editor.toggleFoldRecursively")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "intellisense",
          title: localize("gettingStarted.intellisense.title", "Use Intellisense to improve coding efficiency"),
          description: localize("gettingStarted.intellisense.description.interpolated", "Intellisense suggestions can be opened with the Trigger Intellisense command.\n{0}\n Inline intellisense suggestions can be triggered with Trigger Inline Suggestion\n{1}\n Useful settings include editor.inlineCompletionsAccessibilityVerbose and editor.screenReaderAnnounceInlineSuggestion.", Button(localize("triggerIntellisense", "Trigger Intellisense"), "command:editor.action.triggerSuggest"), Button(localize("triggerInlineSuggestion", "Trigger Inline Suggestion"), "command:editor.action.inlineSuggest.trigger")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibilitySettings",
          title: localize("gettingStarted.accessibilitySettings.title", "Configure accessibility settings"),
          description: localize("gettingStarted.accessibilitySettings.description.interpolated", "Accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize("openAccessibilitySettings", "Open Accessibility Settings"), "command:workbench.action.openAccessibilitySettings")),
          media: { type: "markdown", path: "empty" }
        },
        {
          id: "dictation",
          title: localize("gettingStarted.dictation.title", "Use dictation to write code and text in the editor and terminal"),
          description: localize("gettingStarted.dictation.description.interpolated", "Dictation allows you to write code and text using your voice. It can be activated with the Voice: Start Dictation in Editor command.\n{0}\n For dictation in the terminal, use the Voice: Start Dictation in Terminal and Voice: Stop Dictation in Terminal commands.\n{1}\n{2}", Button(localize("toggleDictation", "Voice: Start Dictation in Editor"), "command:workbench.action.editorDictation.start"), Button(localize("terminalStartDictation", "Terminal: Start Dictation in Terminal"), "command:workbench.action.terminal.startVoice"), Button(localize("terminalStopDictation", "Terminal: Stop Dictation in Terminal"), "command:workbench.action.terminal.stopVoice")),
          when: "hasSpeechProvider",
          media: { type: "markdown", path: "empty" }
        }
      ]
    }
  },
  {
    id: "Beginner",
    isFeatured: false,
    title: localize("gettingStarted.beginner.title", "Learn the Fundamentals"),
    icon: beginnerIcon,
    description: localize("gettingStarted.beginner.description", "Get an overview of the most essential features"),
    walkthroughPageTitle: localize("gettingStarted.beginner.walkthroughPageTitle", "Essential Features"),
    content: {
      type: "steps",
      steps: [
        {
          id: "settingsAndSync",
          title: localize("gettingStarted.settings.title", "Tune your settings"),
          description: localize("gettingStarted.settingsAndSync.description.interpolated", "Customize every aspect of VS Code and [sync](command:workbench.userDataSync.actions.turnOn) customizations across devices.\n{0}", Button(localize("tweakSettings", "Open Settings"), "command:toSide:workbench.action.openSettings")),
          when: "workspacePlatform != 'webworker' && syncStatus != uninitialized",
          completionEvents: ["onEvent:sync-enabled"],
          media: {
            type: "svg",
            altText: "VS Code Settings",
            path: "settings.svg"
          }
        },
        {
          id: "extensions",
          title: localize("gettingStarted.extensions.title", "Code with extensions"),
          description: localize("gettingStarted.extensions.description.interpolated", "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize("browsePopular", "Browse Popular Extensions"), "command:workbench.extensions.action.showPopularExtensions")),
          when: "workspacePlatform != 'webworker'",
          media: {
            type: "svg",
            altText: "VS Code extension marketplace with featured language extensions",
            path: "extensions.svg"
          }
        },
        {
          id: "terminal",
          title: localize("gettingStarted.terminal.title", "Built-in terminal"),
          description: localize("gettingStarted.terminal.description.interpolated", "Quickly run shell commands and monitor build output, right next to your code.\n{0}", Button(localize("showTerminal", "Open Terminal"), "command:workbench.action.terminal.toggleTerminal")),
          when: "workspacePlatform != 'webworker' && remoteName != codespaces && !terminalIsOpen",
          media: {
            type: "svg",
            altText: "Integrated terminal running a few npm commands",
            path: "terminal.svg"
          }
        },
        {
          id: "debugging",
          title: localize("gettingStarted.debug.title", "Watch your code in action"),
          description: localize("gettingStarted.debug.description.interpolated", "Accelerate your edit, build, test, and debug loop by setting up a launch configuration.\n{0}", Button(localize("runProject", "Run your Project"), "command:workbench.action.debug.selectandstart")),
          when: "workspacePlatform != 'webworker' && workspaceFolderCount != 0",
          media: {
            type: "svg",
            altText: "Run and debug view.",
            path: "debug.svg"
          }
        },
        {
          id: "scmClone",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scmClone.description.interpolated", "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize("cloneRepo", "Clone Repository"), "command:git.clone")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "scmSetup",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scmSetup.description.interpolated", "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize("initRepo", "Initialize Git Repository"), "command:git.init")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount == 0",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "scm",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scm.description.interpolated", "No more looking up Git commands! Git and GitHub workflows are seamlessly integrated.\n{0}", Button(localize("openSCM", "Open Source Control"), "command:workbench.view.scm")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount != 0 && activeViewlet != 'workbench.view.scm'",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "installGit",
          title: localize("gettingStarted.installGit.title", "Install Git"),
          description: localize({ key: "gettingStarted.installGit.description.interpolated", comment: ["The placeholders are command link items should not be translated"] }, "Install Git to track changes in your projects.\n{0}\n{1}Reload window{2} after installation to complete Git setup.", Button(localize("installGit", "Install Git"), "https://aka.ms/vscode-install-git"), "[", "](command:workbench.action.reloadWindow)"),
          when: "git.missing",
          media: {
            type: "svg",
            altText: "Install Git.",
            path: "git.svg"
          },
          completionEvents: [
            "onContext:git.state == initialized"
          ]
        },
        {
          id: "tasks",
          title: localize("gettingStarted.tasks.title", "Automate your project tasks"),
          when: "workspaceFolderCount != 0 && workspacePlatform != 'webworker'",
          description: localize("gettingStarted.tasks.description.interpolated", "Create tasks for your common workflows and enjoy the integrated experience of running scripts and automatically checking results.\n{0}", Button(localize("runTasks", "Run Auto-detected Tasks"), "command:workbench.action.tasks.runTask")),
          media: {
            type: "svg",
            altText: "Task runner.",
            path: "runTask.svg"
          }
        },
        {
          id: "shortcuts",
          title: localize("gettingStarted.shortcuts.title", "Customize your shortcuts"),
          description: localize("gettingStarted.shortcuts.description.interpolated", "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize("keyboardShortcuts", "Keyboard Shortcuts"), "command:toSide:workbench.action.openGlobalKeybindings")),
          media: {
            type: "svg",
            altText: "Interactive shortcuts.",
            path: "shortcuts.svg"
          }
        },
        {
          id: "workspaceTrust",
          title: localize("gettingStarted.workspaceTrust.title", "Safely browse and edit code"),
          description: localize("gettingStarted.workspaceTrust.description.interpolated", "{0} lets you decide whether your project folders should **allow or restrict** automatic code execution __(required for extensions, debugging, etc)__.\nOpening a file/folder will prompt to grant trust. You can always {1} later.", Button(localize("workspaceTrust", "Workspace Trust"), "https://code.visualstudio.com/docs/editor/workspace-trust"), Button(localize("enableTrust", "enable trust"), "command:toSide:workbench.trust.manage")),
          when: "workspacePlatform != 'webworker' && !isWorkspaceTrusted && workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Workspace Trust editor in Restricted mode and a primary button for switching to Trusted mode.",
            path: "workspaceTrust.svg"
          }
        }
      ]
    }
  },
  {
    id: "notebooks",
    title: localize("gettingStarted.notebook.title", "Customize Notebooks"),
    description: "",
    icon: setupIcon,
    isFeatured: false,
    when: `config.${NotebookSetting.openGettingStarted} && userHasOpenedNotebook`,
    walkthroughPageTitle: localize("gettingStarted.notebook.walkthroughPageTitle", "Notebooks"),
    content: {
      type: "steps",
      steps: [
        {
          completionEvents: ["onCommand:notebook.setProfile"],
          id: "notebookProfile",
          title: localize("gettingStarted.notebookProfile.title", "Select the layout for your notebooks"),
          description: localize("gettingStarted.notebookProfile.description", "Get notebooks to feel just the way you prefer"),
          when: "userHasOpenedNotebook",
          media: {
            type: "markdown",
            path: "notebookProfile"
          }
        }
      ]
    }
  }
];
export {
  copilotSettingsMessage,
  gettingStartedContentRegistry,
  moduleToContent,
  startEntries,
  walkthroughs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcY29tbW9uXFxnZXR0aW5nU3RhcnRlZENvbnRlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdGhlbWVQaWNrZXJDb250ZW50IGZyb20gJy4vbWVkaWEvdGhlbWVfcGlja2VyLmpzJztcbmltcG9ydCB0aGVtZVBpY2tlclNtYWxsQ29udGVudCBmcm9tICcuL21lZGlhL3RoZW1lX3BpY2tlcl9zbWFsbC5qcyc7XG5pbXBvcnQgbm90ZWJvb2tQcm9maWxlQ29udGVudCBmcm9tICcuL21lZGlhL25vdGVib29rUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcblxuaW50ZXJmYWNlIElHZXR0aW5nU3RhcnRlZENvbnRlbnRQcm92aWRlciB7XG5cdCgpOiBzdHJpbmc7XG59XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0ge1xuXHRkb2N1bWVudGF0aW9uVXJsOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmRvY3VtZW50YXRpb25VcmwgPz8gJycsXG5cdHByb3ZpZGVyOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyID8/IHsgZGVmYXVsdDogeyBuYW1lOiAnJyB9IH0sXG5cdHB1YmxpY0NvZGVNYXRjaGVzVXJsOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnB1YmxpY0NvZGVNYXRjaGVzVXJsID8/ICcnLFxuXHR0ZXJtc1N0YXRlbWVudFVybDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py50ZXJtc1N0YXRlbWVudFVybCA/PyAnJyxcblx0cHJpdmFjeVN0YXRlbWVudFVybDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcml2YWN5U3RhdGVtZW50VXJsID8/ICcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY29waWxvdFNldHRpbmdzTWVzc2FnZShtYW5hZ2VTZXR0aW5nc1VybDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxvY2FsaXplKHsga2V5OiAnc2V0dGluZ3MnLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCJbXCJ9JywgJ3tMb2NrZWQ9XCJdKHswfSlcIn0nLCAne0xvY2tlZD1cIl0oezF9KVwifSddIH0sIFwiezB9IENvcGlsb3QgbWF5IHNob3cgW3B1YmxpYyBjb2RlXSh7MX0pIHN1Z2dlc3Rpb25zIGFuZCB1c2UgeW91ciBkYXRhIHRvIGltcHJvdmUgdGhlIHByb2R1Y3QuIFlvdSBjYW4gY2hhbmdlIHRoZXNlIFtzZXR0aW5nc10oezJ9KSBhbnl0aW1lLlwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUsIGRlZmF1bHRDaGF0LnB1YmxpY0NvZGVNYXRjaGVzVXJsLCBtYW5hZ2VTZXR0aW5nc1VybCk7XG59XG5cbmNsYXNzIEdldHRpbmdTdGFydGVkQ29udGVudFByb3ZpZGVyUmVnaXN0cnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElHZXR0aW5nU3RhcnRlZENvbnRlbnRQcm92aWRlcj4oKTtcblxuXHRyZWdpc3RlclByb3ZpZGVyKG1vZHVsZUlkOiBzdHJpbmcsIHByb3ZpZGVyOiBJR2V0dGluZ1N0YXJ0ZWRDb250ZW50UHJvdmlkZXIpOiB2b2lkIHtcblx0XHR0aGlzLnByb3ZpZGVycy5zZXQobW9kdWxlSWQsIHByb3ZpZGVyKTtcblx0fVxuXG5cdGdldFByb3ZpZGVyKG1vZHVsZUlkOiBzdHJpbmcpOiBJR2V0dGluZ1N0YXJ0ZWRDb250ZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVycy5nZXQobW9kdWxlSWQpO1xuXHR9XG59XG5leHBvcnQgY29uc3QgZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkgPSBuZXcgR2V0dGluZ1N0YXJ0ZWRDb250ZW50UHJvdmlkZXJSZWdpc3RyeSgpO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW9kdWxlVG9Db250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRpZiAoIXJlc291cmNlLnF1ZXJ5KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdHZXR0aW5nIFN0YXJ0ZWQ6IGludmFsaWQgcmVzb3VyY2UnKTtcblx0fVxuXG5cdGNvbnN0IHF1ZXJ5ID0gSlNPTi5wYXJzZShyZXNvdXJjZS5xdWVyeSk7XG5cdGlmICghcXVlcnkubW9kdWxlSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0dldHRpbmcgU3RhcnRlZDogaW52YWxpZCByZXNvdXJjZScpO1xuXHR9XG5cblx0Y29uc3QgcHJvdmlkZXIgPSBnZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeS5nZXRQcm92aWRlcihxdWVyeS5tb2R1bGVJZCk7XG5cdGlmICghcHJvdmlkZXIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEdldHRpbmcgU3RhcnRlZDogbm8gcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3IgJHtxdWVyeS5tb2R1bGVJZH1gKTtcblx0fVxuXG5cdHJldHVybiBwcm92aWRlcigpO1xufVxuXG5nZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeS5yZWdpc3RlclByb3ZpZGVyKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhL3RoZW1lX3BpY2tlcicsIHRoZW1lUGlja2VyQ29udGVudCk7XG5nZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeS5yZWdpc3RlclByb3ZpZGVyKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhL3RoZW1lX3BpY2tlcl9zbWFsbCcsIHRoZW1lUGlja2VyU21hbGxDb250ZW50KTtcbmdldHRpbmdTdGFydGVkQ29udGVudFJlZ2lzdHJ5LnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvbm90ZWJvb2tQcm9maWxlJywgbm90ZWJvb2tQcm9maWxlQ29udGVudCk7XG4vLyBSZWdpc3RlciBlbXB0eSBtZWRpYSBmb3IgYWNjZXNzaWJpbGl0eSB3YWxrdGhyb3VnaFxuZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkucmVnaXN0ZXJQcm92aWRlcigndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS9lbXB0eScsICgpID0+ICcnKTtcblxuY29uc3Qgc2V0dXBJY29uID0gcmVnaXN0ZXJJY29uKCdnZXR0aW5nLXN0YXJ0ZWQtc2V0dXAnLCBDb2RpY29uLnphcCwgbG9jYWxpemUoJ2dldHRpbmctc3RhcnRlZC1zZXR1cC1pY29uJywgXCJJY29uIHVzZWQgZm9yIHRoZSBzZXR1cCBjYXRlZ29yeSBvZiB3ZWxjb21lIHBhZ2VcIikpO1xuY29uc3QgYmVnaW5uZXJJY29uID0gcmVnaXN0ZXJJY29uKCdnZXR0aW5nLXN0YXJ0ZWQtYmVnaW5uZXInLCBDb2RpY29uLmxpZ2h0YnVsYiwgbG9jYWxpemUoJ2dldHRpbmctc3RhcnRlZC1iZWdpbm5lci1pY29uJywgXCJJY29uIHVzZWQgZm9yIHRoZSBiZWdpbm5lciBjYXRlZ29yeSBvZiB3ZWxjb21lIHBhZ2VcIikpO1xuXG5leHBvcnQgdHlwZSBCdWlsdGluR2V0dGluZ1N0YXJ0ZWRTdGVwID0ge1xuXHRpZDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRjb21wbGV0aW9uRXZlbnRzPzogc3RyaW5nW107XG5cdHdoZW4/OiBzdHJpbmc7XG5cdG1lZGlhOlxuXHR8IHsgdHlwZTogJ2ltYWdlJzsgcGF0aDogc3RyaW5nIHwgeyBoYzogc3RyaW5nOyBoY0xpZ2h0Pzogc3RyaW5nOyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmcgfTsgYWx0VGV4dDogc3RyaW5nIH1cblx0fCB7IHR5cGU6ICdzdmcnOyBwYXRoOiBzdHJpbmc7IGFsdFRleHQ6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnbWFya2Rvd24nOyBwYXRoOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ3ZpZGVvJzsgcGF0aDogc3RyaW5nIHwgeyBoYzogc3RyaW5nOyBoY0xpZ2h0Pzogc3RyaW5nOyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmcgfTsgcG9zdGVyPzogc3RyaW5nIHwgeyBoYzogc3RyaW5nOyBoY0xpZ2h0Pzogc3RyaW5nOyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmcgfTsgYWx0VGV4dDogc3RyaW5nIH07XG59O1xuXG5leHBvcnQgdHlwZSBCdWlsdGluR2V0dGluZ1N0YXJ0ZWRDYXRlZ29yeSA9IHtcblx0aWQ6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0aXNGZWF0dXJlZDogYm9vbGVhbjtcblx0bmV4dD86IHN0cmluZztcblx0aWNvbjogVGhlbWVJY29uO1xuXHR3aGVuPzogc3RyaW5nO1xuXHRjb250ZW50OlxuXHR8IHsgdHlwZTogJ3N0ZXBzJzsgc3RlcHM6IEJ1aWx0aW5HZXR0aW5nU3RhcnRlZFN0ZXBbXSB9O1xuXHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgQnVpbHRpbkdldHRpbmdTdGFydGVkU3RhcnRFbnRyeSA9IHtcblx0aWQ6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0aWNvbjogVGhlbWVJY29uO1xuXHR3aGVuPzogc3RyaW5nO1xuXHRjb250ZW50OlxuXHR8IHsgdHlwZTogJ3N0YXJ0RW50cnknOyBjb21tYW5kOiBzdHJpbmcgfTtcbn07XG5cbnR5cGUgR2V0dGluZ1N0YXJ0ZWRXYWxrdGhyb3VnaENvbnRlbnQgPSBCdWlsdGluR2V0dGluZ1N0YXJ0ZWRDYXRlZ29yeVtdO1xudHlwZSBHZXR0aW5nU3RhcnRlZFN0YXJ0RW50cnlDb250ZW50ID0gQnVpbHRpbkdldHRpbmdTdGFydGVkU3RhcnRFbnRyeVtdO1xuXG5leHBvcnQgY29uc3Qgc3RhcnRFbnRyaWVzOiBHZXR0aW5nU3RhcnRlZFN0YXJ0RW50cnlDb250ZW50ID0gW1xuXHR7XG5cdFx0aWQ6ICd3ZWxjb21lLnNob3dOZXdGaWxlRW50cmllcycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5uZXdGaWxlLnRpdGxlJywgXCJOZXcgRmlsZS4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5ld0ZpbGUuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSBuZXcgdW50aXRsZWQgdGV4dCBmaWxlLCBub3RlYm9vaywgb3IgY3VzdG9tIGVkaXRvci5cIiksXG5cdFx0aWNvbjogQ29kaWNvbi5uZXdGaWxlLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGFydEVudHJ5Jyxcblx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kOndlbGNvbWUuc2hvd05ld0ZpbGVFbnRyaWVzJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsT3Blbk1hYycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5vcGVuTWFjLnRpdGxlJywgXCJPcGVuLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQub3Blbk1hYy5kZXNjcmlwdGlvbicsIFwiT3BlbiBhIGZpbGUgb3IgZm9sZGVyIHRvIHN0YXJ0IHdvcmtpbmdcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQsXG5cdFx0d2hlbjogJyFpc1dlYiAmJiBpc01hYycsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRmlsZUZvbGRlcicsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0b3BMZXZlbE9wZW5GaWxlJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5GaWxlLnRpdGxlJywgXCJPcGVuIEZpbGUuLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5vcGVuRmlsZS5kZXNjcmlwdGlvbicsIFwiT3BlbiBhIGZpbGUgdG8gc3RhcnQgd29ya2luZ1wiKSxcblx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdHdoZW46ICdpc1dlYiB8fCAhaXNNYWMnLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGFydEVudHJ5Jyxcblx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZpbGUnLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxPcGVuRm9sZGVyJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5Gb2xkZXIudGl0bGUnLCBcIk9wZW4gRm9sZGVyLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQub3BlbkZvbGRlci5kZXNjcmlwdGlvbicsIFwiT3BlbiBhIGZvbGRlciB0byBzdGFydCB3b3JraW5nXCIpLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLFxuXHRcdHdoZW46ICchaXNXZWIgJiYgIWlzTWFjJyxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXInLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxPcGVuRm9sZGVyV2ViJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5Gb2xkZXIudGl0bGUnLCBcIk9wZW4gRm9sZGVyLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQub3BlbkZvbGRlci5kZXNjcmlwdGlvbicsIFwiT3BlbiBhIGZvbGRlciB0byBzdGFydCB3b3JraW5nXCIpLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLFxuXHRcdHdoZW46ICchb3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnQgJiYgd29ya2JlbmNoU3RhdGUgPT0gXFwnd29ya3NwYWNlXFwnJyxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2UnLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxHaXRDbG9uZScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbEdpdENsb25lLnRpdGxlJywgXCJDbG9uZSBHaXQgUmVwb3NpdG9yeS4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsR2l0Q2xvbmUuZGVzY3JpcHRpb24nLCBcIkNsb25lIGEgcmVtb3RlIHJlcG9zaXRvcnkgdG8gYSBsb2NhbCBmb2xkZXJcIiksXG5cdFx0d2hlbjogJ2NvbmZpZy5naXQuZW5hYmxlZCAmJiAhZ2l0Lm1pc3NpbmcnLFxuXHRcdGljb246IENvZGljb24uc291cmNlQ29udHJvbCxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDpnaXQuY2xvbmUnLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxHaXRPcGVuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsR2l0T3Blbi50aXRsZScsIFwiT3BlbiBSZXBvc2l0b3J5Li4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudG9wTGV2ZWxHaXRPcGVuLmRlc2NyaXB0aW9uJywgXCJDb25uZWN0IHRvIGEgcmVtb3RlIHJlcG9zaXRvcnkgb3IgcHVsbCByZXF1ZXN0IHRvIGJyb3dzZSwgc2VhcmNoLCBlZGl0LCBhbmQgY29tbWl0XCIpLFxuXHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSA9PSBcXCd3ZWJ3b3JrZXJcXCcnLFxuXHRcdGljb246IENvZGljb24uc291cmNlQ29udHJvbCxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDpyZW1vdGVIdWIub3BlblJlcG9zaXRvcnknLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxSZW1vdGVPcGVuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsUmVtb3RlT3Blbi50aXRsZScsIFwiQ29ubmVjdCB0by4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsUmVtb3RlT3Blbi5kZXNjcmlwdGlvbicsIFwiQ29ubmVjdCB0byByZW1vdGUgZGV2ZWxvcG1lbnQgd29ya3NwYWNlcy5cIiksXG5cdFx0d2hlbjogJyFpc1dlYicsXG5cdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5yZW1vdGUuc2hvd01lbnUnLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxPcGVuVHVubmVsJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsT3BlblR1bm5lbC50aXRsZScsIFwiT3BlbiBUdW5uZWwuLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbE9wZW5UdW5uZWwuZGVzY3JpcHRpb24nLCBcIkNvbm5lY3QgdG8gYSByZW1vdGUgbWFjaGluZSB0aHJvdWdoIGEgVHVubmVsXCIpLFxuXHRcdHdoZW46ICdpc1dlYiAmJiBzaG93UmVtb3RlU3RhcnRFbnRyeUluV2ViJyxcblx0XHRpY29uOiBDb2RpY29uLnJlbW90ZSxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnJlbW90ZS5zaG93V2ViU3RhcnRFbnRyeUFjdGlvbnMnLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxOZXdXb3Jrc3BhY2VDaGF0Jyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5ld1dvcmtzcGFjZUNoYXQudGl0bGUnLCBcIkdlbmVyYXRlIE5ldyBXb3Jrc3BhY2UuLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5uZXdXb3Jrc3BhY2VDaGF0LmRlc2NyaXB0aW9uJywgXCJDaGF0IHRvIGNyZWF0ZSBhIG5ldyB3b3Jrc3BhY2VcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHR3aGVuOiAnIWlzV2ViICYmICFjaGF0U2V0dXBIaWRkZW4gJiYgIWNoYXRTZXR1cERpc2FibGVkSW5Xb3Jrc3BhY2UnLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGFydEVudHJ5Jyxcblx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kOndlbGNvbWUubmV3V29ya3NwYWNlQ2hhdCcsXG5cdFx0fVxuXHR9LFxuXTtcblxuY29uc3QgQnV0dG9uID0gKHRpdGxlOiBzdHJpbmcsIGhyZWY6IHN0cmluZykgPT4gYFske3RpdGxlfV0oJHtocmVmfSlgO1xuXG5jb25zdCBDb3BpbG90U3RlcFRpdGxlID0gbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmNvcGlsb3RTZXR1cC50aXRsZScsIFwiVXNlIEFJIGZlYXR1cmVzIHdpdGggQ29waWxvdCBmb3IgZnJlZVwiKTtcbmNvbnN0IENvcGlsb3REZXNjcmlwdGlvbiA9IGxvY2FsaXplKHsga2V5OiAnZ2V0dGluZ1N0YXJ0ZWQuY29waWxvdFNldHVwLmRlc2NyaXB0aW9uJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MH0pXCJ9J10gfSwgXCJZb3UgY2FuIHVzZSBbQ29waWxvdF0oezB9KSB0byBnZW5lcmF0ZSBjb2RlIGFjcm9zcyBtdWx0aXBsZSBmaWxlcywgZml4IGVycm9ycywgYXNrIHF1ZXN0aW9ucyBhYm91dCB5b3VyIGNvZGUsIGFuZCBtdWNoIG1vcmUgdXNpbmcgbmF0dXJhbCBsYW5ndWFnZS5cIiwgZGVmYXVsdENoYXQuZG9jdW1lbnRhdGlvblVybCA/PyAnJyk7XG5jb25zdCBDb3BpbG90VGVybXNTdHJpbmcgPSBsb2NhbGl6ZSh7IGtleTogJ2dldHRpbmdTdGFydGVkLmNvcGlsb3RTZXR1cC50ZXJtcycsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezJ9KVwifScsICd7TG9ja2VkPVwiXSh7M30pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nIHdpdGggezB9IENvcGlsb3QsIHlvdSBhZ3JlZSB0byB7MX0ncyBbVGVybXNdKHsyfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezN9KVwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSwgZGVmYXVsdENoYXQudGVybXNTdGF0ZW1lbnRVcmwsIGRlZmF1bHRDaGF0LnByaXZhY3lTdGF0ZW1lbnRVcmwpO1xuY29uc3QgQ29waWxvdEFub255bW91c0J1dHRvbiA9IEJ1dHRvbihsb2NhbGl6ZSgnc2V0dXBDb3BpbG90QnV0dG9uLnNldHVwJywgXCJVc2UgQUkgRmVhdHVyZXNcIiksIGBjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBBbm9ueW1vdXNXaXRob3V0RGlhbG9nYCk7XG5jb25zdCBDb3BpbG90U2lnbmVkT3V0QnV0dG9uID0gQnV0dG9uKGxvY2FsaXplKCdzZXR1cENvcGlsb3RCdXR0b24uc2V0dXAnLCBcIlVzZSBBSSBGZWF0dXJlc1wiKSwgYGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cGApO1xuY29uc3QgQ29waWxvdFNpZ25lZEluQnV0dG9uID0gQnV0dG9uKGxvY2FsaXplKCdzZXR1cENvcGlsb3RCdXR0b24uc2V0dXAnLCBcIlVzZSBBSSBGZWF0dXJlc1wiKSwgYGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cGApO1xuY29uc3QgQ29waWxvdENvbXBsZXRlQnV0dG9uID0gQnV0dG9uKGxvY2FsaXplKCdzZXR1cENvcGlsb3RCdXR0b24uY2hhdFdpdGhDb3BpbG90JywgXCJTdGFydCB0byBDaGF0XCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicpO1xuXG5mdW5jdGlvbiBjcmVhdGVDb3BpbG90U2V0dXBTdGVwKGlkOiBzdHJpbmcsIGJ1dHRvbjogc3RyaW5nLCB3aGVuOiBzdHJpbmcsIGluY2x1ZGVUZXJtczogYm9vbGVhbik6IEJ1aWx0aW5HZXR0aW5nU3RhcnRlZFN0ZXAge1xuXHRjb25zdCBkZXNjcmlwdGlvbiA9IGluY2x1ZGVUZXJtcyA/XG5cdFx0YCR7Q29waWxvdERlc2NyaXB0aW9ufVxcbiR7Q29waWxvdFRlcm1zU3RyaW5nfVxcbiR7YnV0dG9ufWAgOlxuXHRcdGAke0NvcGlsb3REZXNjcmlwdGlvbn1cXG4ke2J1dHRvbn1gO1xuXG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0dGl0bGU6IENvcGlsb3RTdGVwVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0d2hlbjogYCR7d2hlbn0gJiYgIWNoYXRTZXR1cEhpZGRlbiAmJiAhY2hhdFNldHVwRGlzYWJsZWRJbldvcmtzcGFjZWAsXG5cdFx0bWVkaWE6IHtcblx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnVlMgQ29kZSBDb3BpbG90IG11bHRpIGZpbGUgZWRpdHMnLCBwYXRoOiAnbXVsdGktZmlsZS1lZGl0cy5zdmcnXG5cdFx0fSxcblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IHdhbGt0aHJvdWdoczogR2V0dGluZ1N0YXJ0ZWRXYWxrdGhyb3VnaENvbnRlbnQgPSBbXG5cdHtcblx0XHRpZDogJ1NldHVwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwLnRpdGxlJywgXCJHZXQgc3RhcnRlZCB3aXRoIFZTIENvZGVcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cC5kZXNjcmlwdGlvbicsIFwiQ3VzdG9taXplIHlvdXIgZWRpdG9yLCBsZWFybiB0aGUgYmFzaWNzLCBhbmQgc3RhcnQgY29kaW5nXCIpLFxuXHRcdGlzRmVhdHVyZWQ6IHRydWUsXG5cdFx0aWNvbjogc2V0dXBJY29uLFxuXHRcdHdoZW46ICchaXNXZWInLFxuXHRcdHdhbGt0aHJvdWdoUGFnZVRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXAud2Fsa3Rocm91Z2hQYWdlVGl0bGUnLCAnU2V0dXAgVlMgQ29kZScpLFxuXHRcdG5leHQ6ICdCZWdpbm5lcicsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0ZXBzJyxcblx0XHRcdHN0ZXBzOiBbXG5cdFx0XHRcdGNyZWF0ZUNvcGlsb3RTZXR1cFN0ZXAoJ0NvcGlsb3RTZXR1cEFub255bW91cycsIENvcGlsb3RBbm9ueW1vdXNCdXR0b24sICdjaGF0QW5vbnltb3VzICYmICFjaGF0U2V0dXBDb21wbGV0ZWQnLCB0cnVlKSxcblx0XHRcdFx0Y3JlYXRlQ29waWxvdFNldHVwU3RlcCgnQ29waWxvdFNldHVwU2lnbmVkT3V0JywgQ29waWxvdFNpZ25lZE91dEJ1dHRvbiwgJ2NoYXRFbnRpdGxlbWVudFNpZ25lZE91dCAmJiAhY2hhdEFub255bW91cyAmJiAhZ2l0aHViLmNvcGlsb3QuaGFzQnlva01vZGVscycsIGZhbHNlKSxcblx0XHRcdFx0Y3JlYXRlQ29waWxvdFNldHVwU3RlcCgnQ29waWxvdFNldHVwQ29tcGxldGUnLCBDb3BpbG90Q29tcGxldGVCdXR0b24sICdjaGF0U2V0dXBDb21wbGV0ZWQgJiYgIWNoYXRTZXR1cERpc2FibGVkICYmIChjaGF0QW5vbnltb3VzIHx8IGNoYXRQbGFuUHJvIHx8IGNoYXRQbGFuUHJvUGx1cyB8fCBjaGF0UGxhbk1heCB8fCBjaGF0UGxhbkJ1c2luZXNzIHx8IGNoYXRQbGFuRW50ZXJwcmlzZSB8fCBjaGF0UGxhbkZyZWUpJywgZmFsc2UpLFxuXHRcdFx0XHRjcmVhdGVDb3BpbG90U2V0dXBTdGVwKCdDb3BpbG90U2V0dXBTaWduZWRJbicsIENvcGlsb3RTaWduZWRJbkJ1dHRvbiwgJyFjaGF0RW50aXRsZW1lbnRTaWduZWRPdXQgJiYgKCFjaGF0U2V0dXBDb21wbGV0ZWQgfHwgY2hhdFNldHVwRGlzYWJsZWQgfHwgY2hhdFBsYW5DYW5TaWduVXApJywgZmFsc2UpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdwaWNrQ29sb3JUaGVtZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5waWNrQ29sb3IudGl0bGUnLCBcIkNob29zZSB5b3VyIHRoZW1lXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQucGlja0NvbG9yLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiVGhlIHJpZ2h0IHRoZW1lIGhlbHBzIHlvdSBmb2N1cyBvbiB5b3VyIGNvZGUsIGlzIGVhc3kgb24geW91ciBleWVzLCBhbmQgaXMgc2ltcGx5IG1vcmUgZnVuIHRvIHVzZS5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCd0aXRsZUlEJywgXCJCcm93c2UgQ29sb3IgVGhlbWVzXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnNlbGVjdFRoZW1lJykpLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFtcblx0XHRcdFx0XHRcdCdvblNldHRpbmdDaGFuZ2VkOndvcmtiZW5jaC5jb2xvclRoZW1lJyxcblx0XHRcdFx0XHRcdCdvbkNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5zZWxlY3RUaGVtZSdcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdG1lZGlhOiB7IHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICd0aGVtZV9waWNrZXInLCB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ZpZGVvVHV0b3JpYWwnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudmlkZW9UdXRvcmlhbC50aXRsZScsIFwiV2F0Y2ggdmlkZW8gdHV0b3JpYWxzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudmlkZW9UdXRvcmlhbC5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIldhdGNoIHRoZSBmaXJzdCBpbiBhIHNlcmllcyBvZiBzaG9ydCAmIHByYWN0aWNhbCB2aWRlbyB0dXRvcmlhbHMgZm9yIFZTIENvZGUncyBrZXkgZmVhdHVyZXMuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnd2F0Y2gnLCBcIldhdGNoIFR1dG9yaWFsXCIpLCAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdldHRpbmctc3RhcnRlZC12aWRlbycpKSxcblx0XHRcdFx0XHRtZWRpYTogeyB0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1ZTIENvZGUgU2V0dGluZ3MnLCBwYXRoOiAnbGVhcm4uc3ZnJyB9LFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHR9LFxuXG5cdHtcblx0XHRpZDogJ1NldHVwV2ViJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwV2ViLnRpdGxlJywgXCJHZXQgU3RhcnRlZCB3aXRoIFZTIENvZGUgZm9yIHRoZSBXZWJcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cFdlYi5kZXNjcmlwdGlvbicsIFwiQ3VzdG9taXplIHlvdXIgZWRpdG9yLCBsZWFybiB0aGUgYmFzaWNzLCBhbmQgc3RhcnQgY29kaW5nXCIpLFxuXHRcdGlzRmVhdHVyZWQ6IHRydWUsXG5cdFx0aWNvbjogc2V0dXBJY29uLFxuXHRcdHdoZW46ICdpc1dlYicsXG5cdFx0bmV4dDogJ0JlZ2lubmVyJyxcblx0XHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwV2ViLndhbGt0aHJvdWdoUGFnZVRpdGxlJywgJ1NldHVwIFZTIENvZGUgV2ViJyksXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0ZXBzJyxcblx0XHRcdHN0ZXBzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3BpY2tDb2xvclRoZW1lV2ViJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnBpY2tDb2xvci50aXRsZScsIFwiQ2hvb3NlIHlvdXIgdGhlbWVcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5waWNrQ29sb3IuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJUaGUgcmlnaHQgdGhlbWUgaGVscHMgeW91IGZvY3VzIG9uIHlvdXIgY29kZSwgaXMgZWFzeSBvbiB5b3VyIGV5ZXMsIGFuZCBpcyBzaW1wbHkgbW9yZSBmdW4gdG8gdXNlLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3RpdGxlSUQnLCBcIkJyb3dzZSBDb2xvciBUaGVtZXNcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uc2VsZWN0VGhlbWUnKSksXG5cdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czogW1xuXHRcdFx0XHRcdFx0J29uU2V0dGluZ0NoYW5nZWQ6d29ya2JlbmNoLmNvbG9yVGhlbWUnLFxuXHRcdFx0XHRcdFx0J29uQ29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnNlbGVjdFRoZW1lJ1xuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0bWVkaWE6IHsgdHlwZTogJ21hcmtkb3duJywgcGF0aDogJ3RoZW1lX3BpY2tlcicsIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnbWVudUJhcldlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5tZW51QmFyLnRpdGxlJywgXCJKdXN0IHRoZSByaWdodCBhbW91bnQgb2YgVUlcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5tZW51QmFyLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiVGhlIGZ1bGwgbWVudSBiYXIgaXMgYXZhaWxhYmxlIGluIHRoZSBkcm9wZG93biBtZW51IHRvIG1ha2Ugcm9vbSBmb3IgeW91ciBjb2RlLiBUb2dnbGUgaXRzIGFwcGVhcmFuY2UgZm9yIGZhc3RlciBhY2Nlc3MuIFxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3RvZ2dsZU1lbnVCYXInLCBcIlRvZ2dsZSBNZW51IEJhclwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi50b2dnbGVNZW51QmFyJykpLFxuXHRcdFx0XHRcdHdoZW46ICdpc1dlYicsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnQ29tcGFyaW5nIG1lbnUgZHJvcGRvd24gd2l0aCB0aGUgdmlzaWJsZSBtZW51IGJhci4nLCBwYXRoOiAnbWVudUJhci5zdmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZXh0ZW5zaW9uc1dlYldlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5leHRlbnNpb25zLnRpdGxlJywgXCJDb2RlIHdpdGggZXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmV4dGVuc2lvbnNXZWIuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJFeHRlbnNpb25zIGFyZSBWUyBDb2RlJ3MgcG93ZXItdXBzLiBBIGdyb3dpbmcgbnVtYmVyIGFyZSBiZWNvbWluZyBhdmFpbGFibGUgaW4gdGhlIHdlYi5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdicm93c2VQb3B1bGFyV2ViJywgXCJCcm93c2UgUG9wdWxhciBXZWIgRXh0ZW5zaW9uc1wiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dQb3B1bGFyRXh0ZW5zaW9ucycpKSxcblx0XHRcdFx0XHR3aGVuOiAnd29ya3NwYWNlUGxhdGZvcm0gPT0gXFwnd2Vid29ya2VyXFwnJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdWUyBDb2RlIGV4dGVuc2lvbiBtYXJrZXRwbGFjZSB3aXRoIGZlYXR1cmVkIGxhbmd1YWdlIGV4dGVuc2lvbnMnLCBwYXRoOiAnZXh0ZW5zaW9ucy13ZWIuc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZpbmRMYW5ndWFnZUV4dGVuc2lvbnNXZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZmluZExhbmd1YWdlRXh0cy50aXRsZScsIFwiUmljaCBzdXBwb3J0IGZvciBhbGwgeW91ciBsYW5ndWFnZXNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5maW5kTGFuZ3VhZ2VFeHRzLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiQ29kZSBzbWFydGVyIHdpdGggc3ludGF4IGhpZ2hsaWdodGluZywgaW5saW5lIHN1Z2dlc3Rpb25zLCBsaW50aW5nIGFuZCBkZWJ1Z2dpbmcuIFdoaWxlIG1hbnkgbGFuZ3VhZ2VzIGFyZSBidWlsdC1pbiwgbWFueSBtb3JlIGNhbiBiZSBhZGRlZCBhcyBleHRlbnNpb25zLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ2Jyb3dzZUxhbmdFeHRzJywgXCJCcm93c2UgTGFuZ3VhZ2UgRXh0ZW5zaW9uc1wiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dMYW5ndWFnZUV4dGVuc2lvbnMnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJycsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnTGFuZ3VhZ2UgZXh0ZW5zaW9ucycsIHBhdGg6ICdsYW5ndWFnZXMuc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3NldHRpbmdzU3luY1dlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR0aW5nc1N5bmMudGl0bGUnLCBcIlN5bmMgc2V0dGluZ3MgYWNyb3NzIGRldmljZXNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR0aW5nc1N5bmMuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJLZWVwIHlvdXIgZXNzZW50aWFsIGN1c3RvbWl6YXRpb25zIGJhY2tlZCB1cCBhbmQgdXBkYXRlZCBhY3Jvc3MgYWxsIHlvdXIgZGV2aWNlcy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdlbmFibGVTeW5jJywgXCJCYWNrdXAgYW5kIFN5bmMgU2V0dGluZ3NcIiksICdjb21tYW5kOndvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT24nKSksXG5cdFx0XHRcdFx0d2hlbjogJ3N5bmNTdGF0dXMgIT0gdW5pbml0aWFsaXplZCcsXG5cdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czogWydvbkV2ZW50OnN5bmMtZW5hYmxlZCddLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1RoZSBcIlR1cm4gb24gU3luY1wiIGVudHJ5IGluIHRoZSBzZXR0aW5ncyBnZWFyIG1lbnUuJywgcGF0aDogJ3NldHRpbmdzU3luYy5zdmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY29tbWFuZFBhbGV0dGVUYXNrV2ViJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmNvbW1hbmRQYWxldHRlLnRpdGxlJywgXCJVbmxvY2sgcHJvZHVjdGl2aXR5IHdpdGggdGhlIENvbW1hbmQgUGFsZXR0ZSBcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb21tYW5kUGFsZXR0ZS5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlJ1biBjb21tYW5kcyB3aXRob3V0IHJlYWNoaW5nIGZvciB5b3VyIG1vdXNlIHRvIGFjY29tcGxpc2ggYW55IHRhc2sgaW4gVlMgQ29kZS5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdjb21tYW5kUGFsZXR0ZScsIFwiT3BlbiBDb21tYW5kIFBhbGV0dGVcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uc2hvd0NvbW1hbmRzJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7IHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnQ29tbWFuZCBQYWxldHRlIG92ZXJsYXkgZm9yIHNlYXJjaGluZyBhbmQgZXhlY3V0aW5nIGNvbW1hbmRzLicsIHBhdGg6ICdjb21tYW5kUGFsZXR0ZS5zdmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3BpY2tBRm9sZGVyVGFzay1XZWJXZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXAuT3BlbkZvbGRlci50aXRsZScsIFwiT3BlbiB1cCB5b3VyIGNvZGVcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cC5PcGVuRm9sZGVyV2ViLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiWW91J3JlIGFsbCBzZXQgdG8gc3RhcnQgY29kaW5nLiBZb3UgY2FuIG9wZW4gYSBsb2NhbCBwcm9qZWN0IG9yIGEgcmVtb3RlIHJlcG9zaXRvcnkgdG8gZ2V0IHlvdXIgZmlsZXMgaW50byBWUyBDb2RlLlxcbnswfVxcbnsxfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5Gb2xkZXInLCBcIk9wZW4gRm9sZGVyXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmFkZFJvb3RGb2xkZXInKSwgQnV0dG9uKGxvY2FsaXplKCdvcGVuUmVwb3NpdG9yeScsIFwiT3BlbiBSZXBvc2l0b3J5XCIpLCAnY29tbWFuZDpyZW1vdGVIdWIub3BlblJlcG9zaXRvcnknKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZUZvbGRlckNvdW50ID09IDAnLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0V4cGxvcmVyIHZpZXcgc2hvd2luZyBidXR0b25zIGZvciBvcGVuaW5nIGZvbGRlciBhbmQgY2xvbmluZyByZXBvc2l0b3J5LicsIHBhdGg6ICdvcGVuRm9sZGVyLnN2Zydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3F1aWNrT3BlbldlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5xdWlja09wZW4udGl0bGUnLCBcIlF1aWNrbHkgbmF2aWdhdGUgYmV0d2VlbiB5b3VyIGZpbGVzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQucXVpY2tPcGVuLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiTmF2aWdhdGUgYmV0d2VlbiBmaWxlcyBpbiBhbiBpbnN0YW50IHdpdGggb25lIGtleXN0cm9rZS4gVGlwOiBPcGVuIG11bHRpcGxlIGZpbGVzIGJ5IHByZXNzaW5nIHRoZSByaWdodCBhcnJvdyBrZXkuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgncXVpY2tPcGVuJywgXCJRdWljayBPcGVuIGEgRmlsZVwiKSwgJ2NvbW1hbmQ6dG9TaWRlOndvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuJykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VGb2xkZXJDb3VudCAhPSAwJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdHbyB0byBmaWxlIGluIHF1aWNrIHNlYXJjaC4nLCBwYXRoOiAnc2VhcmNoLnN2Zydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ1NldHVwQWNjZXNzaWJpbGl0eScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cEFjY2Vzc2liaWxpdHkudGl0bGUnLCBcIkdldCBTdGFydGVkIHdpdGggQWNjZXNzaWJpbGl0eSBGZWF0dXJlc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwQWNjZXNzaWJpbGl0eS5kZXNjcmlwdGlvbicsIFwiTGVhcm4gdGhlIHRvb2xzIGFuZCBzaG9ydGN1dHMgdGhhdCBtYWtlIFZTIENvZGUgYWNjZXNzaWJsZS4gTm90ZSB0aGF0IHNvbWUgYWN0aW9ucyBhcmUgbm90IGFjdGlvbmFibGUgZnJvbSB3aXRoaW4gdGhlIGNvbnRleHQgb2YgdGhlIHdhbGt0aHJvdWdoLlwiKSxcblx0XHRpc0ZlYXR1cmVkOiB0cnVlLFxuXHRcdGljb246IHNldHVwSWNvbixcblx0XHR3aGVuOiBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELmtleSxcblx0XHRuZXh0OiAnU2V0dXAnLFxuXHRcdHdhbGt0aHJvdWdoUGFnZVRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXBBY2Nlc3NpYmlsaXR5LndhbGt0aHJvdWdoUGFnZVRpdGxlJywgJ1NldHVwIFZTIENvZGUgQWNjZXNzaWJpbGl0eScpLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGVwcycsXG5cdFx0XHRzdGVwczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhY2Nlc3NpYmlsaXR5SGVscCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5hY2Nlc3NpYmlsaXR5SGVscC50aXRsZScsIFwiVXNlIHRoZSBhY2Nlc3NpYmlsaXR5IGhlbHAgZGlhbG9nIHRvIGxlYXJuIGFib3V0IGZlYXR1cmVzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJpbGl0eUhlbHAuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJUaGUgYWNjZXNzaWJpbGl0eSBoZWxwIGRpYWxvZyBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCB3aGF0IHRvIGV4cGVjdCBmcm9tIGEgZmVhdHVyZSBhbmQgdGhlIGNvbW1hbmRzL2tleWJpbmRpbmdzIHRvIG9wZXJhdGUgdGhlbS5cXG4gV2l0aCBmb2N1cyBpbiBhbiBlZGl0b3IsIHRlcm1pbmFsLCBub3RlYm9vaywgY2hhdCByZXNwb25zZSwgY29tbWVudCwgb3IgZGVidWcgY29uc29sZSwgdGhlIHJlbGV2YW50IGRpYWxvZyBjYW4gYmUgb3BlbmVkIHdpdGggdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnb3BlbkFjY2Vzc2liaWxpdHlIZWxwJywgXCJPcGVuIEFjY2Vzc2liaWxpdHkgSGVscFwiKSwgJ2NvbW1hbmQ6ZWRpdG9yLmFjdGlvbi5hY2Nlc3NpYmlsaXR5SGVscCcpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYWNjZXNzaWJsZVZpZXcnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJsZVZpZXcudGl0bGUnLCBcIlNjcmVlbiByZWFkZXIgdXNlcnMgY2FuIGluc3BlY3QgY29udGVudCBsaW5lIGJ5IGxpbmUsIGNoYXJhY3RlciBieSBjaGFyYWN0ZXIgaW4gdGhlIGFjY2Vzc2libGUgdmlldy5cIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5hY2Nlc3NpYmxlVmlldy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlRoZSBhY2Nlc3NpYmxlIHZpZXcgaXMgYXZhaWxhYmxlIGZvciB0aGUgdGVybWluYWwsIGhvdmVycywgbm90aWZpY2F0aW9ucywgY29tbWVudHMsIG5vdGVib29rIG91dHB1dCwgY2hhdCByZXNwb25zZXMsIGlubGluZSBjb21wbGV0aW9ucywgYW5kIGRlYnVnIGNvbnNvbGUgb3V0cHV0LlxcbiBXaXRoIGZvY3VzIGluIGFueSBvZiB0aG9zZSBmZWF0dXJlcywgaXQgY2FuIGJlIG9wZW5lZCB3aXRoIHRoZSBPcGVuIEFjY2Vzc2libGUgVmlldyBjb21tYW5kLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5BY2Nlc3NpYmxlVmlldycsIFwiT3BlbiBBY2Nlc3NpYmxlIFZpZXdcIiksICdjb21tYW5kOmVkaXRvci5hY3Rpb24uYWNjZXNzaWJsZVZpZXcnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ZlcmJvc2l0eVNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnZlcmJvc2l0eVNldHRpbmdzLnRpdGxlJywgXCJDb250cm9sIHRoZSB2ZXJib3NpdHkgb2YgYXJpYSBsYWJlbHNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC52ZXJib3NpdHlTZXR0aW5ncy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlNjcmVlbiByZWFkZXIgdmVyYm9zaXR5IHNldHRpbmdzIGV4aXN0IGZvciBmZWF0dXJlcyBhcm91bmQgdGhlIHdvcmtiZW5jaCBzbyB0aGF0IG9uY2UgYSB1c2VyIGlzIGZhbWlsaWFyIHdpdGggYSBmZWF0dXJlLCB0aGV5IGNhbiBhdm9pZCBoZWFyaW5nIGhpbnRzIGFib3V0IGhvdyB0byBvcGVyYXRlIGl0LiBGb3IgZXhhbXBsZSwgZmVhdHVyZXMgZm9yIHdoaWNoIGFuIGFjY2Vzc2liaWxpdHkgaGVscCBkaWFsb2cgZXhpc3RzIHdpbGwgaW5kaWNhdGUgaG93IHRvIG9wZW4gdGhlIGRpYWxvZyB1bnRpbCB0aGUgdmVyYm9zaXR5IHNldHRpbmcgZm9yIHRoYXQgZmVhdHVyZSBoYXMgYmVlbiBkaXNhYmxlZC5cXG4gVGhlc2UgYW5kIG90aGVyIGFjY2Vzc2liaWxpdHkgc2V0dGluZ3MgY2FuIGJlIGNvbmZpZ3VyZWQgYnkgcnVubmluZyB0aGUgT3BlbiBBY2Nlc3NpYmlsaXR5IFNldHRpbmdzIGNvbW1hbmQuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnb3BlblZlcmJvc2l0eVNldHRpbmdzJywgXCJPcGVuIEFjY2Vzc2liaWxpdHkgU2V0dGluZ3NcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlbkFjY2Vzc2liaWxpdHlTZXR0aW5ncycpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY29tbWFuZFBhbGV0dGVUYXNrQWNjZXNzaWJpbGl0eScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb21tYW5kUGFsZXR0ZUFjY2Vzc2liaWxpdHkudGl0bGUnLCBcIlVubG9jayBwcm9kdWN0aXZpdHkgd2l0aCB0aGUgQ29tbWFuZCBQYWxldHRlIFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmNvbW1hbmRQYWxldHRlQWNjZXNzaWJpbGl0eS5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlJ1biBjb21tYW5kcyB3aXRob3V0IHJlYWNoaW5nIGZvciB5b3VyIG1vdXNlIHRvIGFjY29tcGxpc2ggYW55IHRhc2sgaW4gVlMgQ29kZS5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdjb21tYW5kUGFsZXR0ZScsIFwiT3BlbiBDb21tYW5kIFBhbGV0dGVcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uc2hvd0NvbW1hbmRzJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7IHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eScgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAna2V5YmluZGluZ3NBY2Nlc3NpYmlsaXR5Jyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmtleWJvYXJkU2hvcnRjdXRzLnRpdGxlJywgXCJDdXN0b21pemUgeW91ciBrZXlib2FyZCBzaG9ydGN1dHNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5rZXlib2FyZFNob3J0Y3V0cy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIk9uY2UgeW91IGhhdmUgZGlzY292ZXJlZCB5b3VyIGZhdm9yaXRlIGNvbW1hbmRzLCBjcmVhdGUgY3VzdG9tIGtleWJvYXJkIHNob3J0Y3V0cyBmb3IgaW5zdGFudCBhY2Nlc3MuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgna2V5Ym9hcmRTaG9ydGN1dHMnLCBcIktleWJvYXJkIFNob3J0Y3V0c1wiKSwgJ2NvbW1hbmQ6dG9TaWRlOndvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYWNjZXNzaWJpbGl0eVNpZ25hbHMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJpbGl0eVNpZ25hbHMudGl0bGUnLCBcIkZpbmUgdHVuZSB3aGljaCBhY2Nlc3NpYmlsaXR5IHNpZ25hbHMgeW91IHdhbnQgdG8gcmVjZWl2ZSB2aWEgYXVkaW8gb3IgYSBicmFpbGxlIGRldmljZVwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2liaWxpdHlTaWduYWxzLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiQWNjZXNzaWJpbGl0eSBzb3VuZHMgYW5kIGFubm91bmNlbWVudHMgYXJlIHBsYXllZCBhcm91bmQgdGhlIHdvcmtiZW5jaCBmb3IgZGlmZmVyZW50IGV2ZW50cy5cXG4gVGhlc2UgY2FuIGJlIGRpc2NvdmVyZWQgYW5kIGNvbmZpZ3VyZWQgdXNpbmcgdGhlIExpc3QgU2lnbmFsIFNvdW5kcyBhbmQgTGlzdCBTaWduYWwgQW5ub3VuY2VtZW50cyBjb21tYW5kcy5cXG57MH1cXG57MX1cIiwgQnV0dG9uKGxvY2FsaXplKCdsaXN0U2lnbmFsU291bmRzJywgXCJMaXN0IFNpZ25hbCBTb3VuZHNcIiksICdjb21tYW5kOnNpZ25hbHMuc291bmRzLmhlbHAnKSwgQnV0dG9uKGxvY2FsaXplKCdsaXN0U2lnbmFsQW5ub3VuY2VtZW50cycsIFwiTGlzdCBTaWduYWwgQW5ub3VuY2VtZW50c1wiKSwgJ2NvbW1hbmQ6YWNjZXNzaWJpbGl0eS5hbm5vdW5jZW1lbnQuaGVscCcpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnaG92ZXInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuaG92ZXIudGl0bGUnLCBcIkFjY2VzcyB0aGUgaG92ZXIgaW4gdGhlIGVkaXRvciB0byBnZXQgbW9yZSBpbmZvcm1hdGlvbiBvbiBhIHZhcmlhYmxlIG9yIHN5bWJvbFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmhvdmVyLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiV2hpbGUgZm9jdXMgaXMgaW4gdGhlIGVkaXRvciBvbiBhIHZhcmlhYmxlIG9yIHN5bWJvbCwgYSBob3ZlciBjYW4gYmUgZm9jdXNlZCB3aXRoIHRoZSBTaG93IG9yIE9wZW4gSG92ZXIgY29tbWFuZC5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdzaG93T3JGb2N1c0hvdmVyJywgXCJTaG93IG9yIEZvY3VzIEhvdmVyXCIpLCAnY29tbWFuZDplZGl0b3IuYWN0aW9uLnNob3dIb3ZlcicpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZ29Ub1N5bWJvbCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5nb1RvU3ltYm9sLnRpdGxlJywgXCJOYXZpZ2F0ZSB0byBzeW1ib2xzIGluIGEgZmlsZVwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmdvVG9TeW1ib2wuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJUaGUgR28gdG8gU3ltYm9sIGNvbW1hbmQgaXMgdXNlZnVsIGZvciBuYXZpZ2F0aW5nIGJldHdlZW4gaW1wb3J0YW50IGxhbmRtYXJrcyBpbiBhIGRvY3VtZW50LlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5Hb1RvU3ltYm9sJywgXCJHbyB0byBTeW1ib2xcIiksICdjb21tYW5kOmVkaXRvci5hY3Rpb24uZ29Ub1N5bWJvbCcpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY29kZUZvbGRpbmcnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuY29kZUZvbGRpbmcudGl0bGUnLCBcIlVzZSBjb2RlIGZvbGRpbmcgdG8gY29sbGFwc2UgYmxvY2tzIG9mIGNvZGUgYW5kIGZvY3VzIG9uIHRoZSBjb2RlIHlvdSdyZSBpbnRlcmVzdGVkIGluLlwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmNvZGVGb2xkaW5nLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiRm9sZCBvciB1bmZvbGQgYSBjb2RlIHNlY3Rpb24gd2l0aCB0aGUgVG9nZ2xlIEZvbGQgY29tbWFuZC5cXG57MH1cXG4gRm9sZCBvciB1bmZvbGQgcmVjdXJzaXZlbHkgd2l0aCB0aGUgVG9nZ2xlIEZvbGQgUmVjdXJzaXZlbHkgQ29tbWFuZFxcbnsxfVxcblwiLCBCdXR0b24obG9jYWxpemUoJ3RvZ2dsZUZvbGQnLCBcIlRvZ2dsZSBGb2xkXCIpLCAnY29tbWFuZDplZGl0b3IudG9nZ2xlRm9sZCcpLCBCdXR0b24obG9jYWxpemUoJ3RvZ2dsZUZvbGRSZWN1cnNpdmVseScsIFwiVG9nZ2xlIEZvbGQgUmVjdXJzaXZlbHlcIiksICdjb21tYW5kOmVkaXRvci50b2dnbGVGb2xkUmVjdXJzaXZlbHknKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ludGVsbGlzZW5zZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5pbnRlbGxpc2Vuc2UudGl0bGUnLCBcIlVzZSBJbnRlbGxpc2Vuc2UgdG8gaW1wcm92ZSBjb2RpbmcgZWZmaWNpZW5jeVwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmludGVsbGlzZW5zZS5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkludGVsbGlzZW5zZSBzdWdnZXN0aW9ucyBjYW4gYmUgb3BlbmVkIHdpdGggdGhlIFRyaWdnZXIgSW50ZWxsaXNlbnNlIGNvbW1hbmQuXFxuezB9XFxuIElubGluZSBpbnRlbGxpc2Vuc2Ugc3VnZ2VzdGlvbnMgY2FuIGJlIHRyaWdnZXJlZCB3aXRoIFRyaWdnZXIgSW5saW5lIFN1Z2dlc3Rpb25cXG57MX1cXG4gVXNlZnVsIHNldHRpbmdzIGluY2x1ZGUgZWRpdG9yLmlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UgYW5kIGVkaXRvci5zY3JlZW5SZWFkZXJBbm5vdW5jZUlubGluZVN1Z2dlc3Rpb24uXCIsIEJ1dHRvbihsb2NhbGl6ZSgndHJpZ2dlckludGVsbGlzZW5zZScsIFwiVHJpZ2dlciBJbnRlbGxpc2Vuc2VcIiksICdjb21tYW5kOmVkaXRvci5hY3Rpb24udHJpZ2dlclN1Z2dlc3QnKSwgQnV0dG9uKGxvY2FsaXplKCd0cmlnZ2VySW5saW5lU3VnZ2VzdGlvbicsICdUcmlnZ2VyIElubGluZSBTdWdnZXN0aW9uJyksICdjb21tYW5kOmVkaXRvci5hY3Rpb24uaW5saW5lU3VnZ2VzdC50cmlnZ2VyJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhY2Nlc3NpYmlsaXR5U2V0dGluZ3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJpbGl0eVNldHRpbmdzLnRpdGxlJywgXCJDb25maWd1cmUgYWNjZXNzaWJpbGl0eSBzZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2liaWxpdHlTZXR0aW5ncy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkFjY2Vzc2liaWxpdHkgc2V0dGluZ3MgY2FuIGJlIGNvbmZpZ3VyZWQgYnkgcnVubmluZyB0aGUgT3BlbiBBY2Nlc3NpYmlsaXR5IFNldHRpbmdzIGNvbW1hbmQuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnb3BlbkFjY2Vzc2liaWxpdHlTZXR0aW5ncycsIFwiT3BlbiBBY2Nlc3NpYmlsaXR5IFNldHRpbmdzXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5BY2Nlc3NpYmlsaXR5U2V0dGluZ3MnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHsgdHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5JyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2RpY3RhdGlvbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5kaWN0YXRpb24udGl0bGUnLCBcIlVzZSBkaWN0YXRpb24gdG8gd3JpdGUgY29kZSBhbmQgdGV4dCBpbiB0aGUgZWRpdG9yIGFuZCB0ZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmRpY3RhdGlvbi5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkRpY3RhdGlvbiBhbGxvd3MgeW91IHRvIHdyaXRlIGNvZGUgYW5kIHRleHQgdXNpbmcgeW91ciB2b2ljZS4gSXQgY2FuIGJlIGFjdGl2YXRlZCB3aXRoIHRoZSBWb2ljZTogU3RhcnQgRGljdGF0aW9uIGluIEVkaXRvciBjb21tYW5kLlxcbnswfVxcbiBGb3IgZGljdGF0aW9uIGluIHRoZSB0ZXJtaW5hbCwgdXNlIHRoZSBWb2ljZTogU3RhcnQgRGljdGF0aW9uIGluIFRlcm1pbmFsIGFuZCBWb2ljZTogU3RvcCBEaWN0YXRpb24gaW4gVGVybWluYWwgY29tbWFuZHMuXFxuezF9XFxuezJ9XCIsIEJ1dHRvbihsb2NhbGl6ZSgndG9nZ2xlRGljdGF0aW9uJywgXCJWb2ljZTogU3RhcnQgRGljdGF0aW9uIGluIEVkaXRvclwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5lZGl0b3JEaWN0YXRpb24uc3RhcnQnKSwgQnV0dG9uKGxvY2FsaXplKCd0ZXJtaW5hbFN0YXJ0RGljdGF0aW9uJywgXCJUZXJtaW5hbDogU3RhcnQgRGljdGF0aW9uIGluIFRlcm1pbmFsXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0YXJ0Vm9pY2UnKSwgQnV0dG9uKGxvY2FsaXplKCd0ZXJtaW5hbFN0b3BEaWN0YXRpb24nLCBcIlRlcm1pbmFsOiBTdG9wIERpY3RhdGlvbiBpbiBUZXJtaW5hbFwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdG9wVm9pY2UnKSksXG5cdFx0XHRcdFx0d2hlbjogJ2hhc1NwZWVjaFByb3ZpZGVyJyxcblx0XHRcdFx0XHRtZWRpYTogeyB0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknIH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAnQmVnaW5uZXInLFxuXHRcdGlzRmVhdHVyZWQ6IGZhbHNlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYmVnaW5uZXIudGl0bGUnLCBcIkxlYXJuIHRoZSBGdW5kYW1lbnRhbHNcIiksXG5cdFx0aWNvbjogYmVnaW5uZXJJY29uLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYmVnaW5uZXIuZGVzY3JpcHRpb24nLCBcIkdldCBhbiBvdmVydmlldyBvZiB0aGUgbW9zdCBlc3NlbnRpYWwgZmVhdHVyZXNcIiksXG5cdFx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5iZWdpbm5lci53YWxrdGhyb3VnaFBhZ2VUaXRsZScsICdFc3NlbnRpYWwgRmVhdHVyZXMnKSxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RlcHMnLFxuXHRcdFx0c3RlcHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnc2V0dGluZ3NBbmRTeW5jJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHRpbmdzLnRpdGxlJywgXCJUdW5lIHlvdXIgc2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR0aW5nc0FuZFN5bmMuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJDdXN0b21pemUgZXZlcnkgYXNwZWN0IG9mIFZTIENvZGUgYW5kIFtzeW5jXShjb21tYW5kOndvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT24pIGN1c3RvbWl6YXRpb25zIGFjcm9zcyBkZXZpY2VzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3R3ZWFrU2V0dGluZ3MnLCBcIk9wZW4gU2V0dGluZ3NcIiksICdjb21tYW5kOnRvU2lkZTp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycpKSxcblx0XHRcdFx0XHR3aGVuOiAnd29ya3NwYWNlUGxhdGZvcm0gIT0gXFwnd2Vid29ya2VyXFwnICYmIHN5bmNTdGF0dXMgIT0gdW5pbml0aWFsaXplZCcsXG5cdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czogWydvbkV2ZW50OnN5bmMtZW5hYmxlZCddLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1ZTIENvZGUgU2V0dGluZ3MnLCBwYXRoOiAnc2V0dGluZ3Muc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2V4dGVuc2lvbnMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZXh0ZW5zaW9ucy50aXRsZScsIFwiQ29kZSB3aXRoIGV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5leHRlbnNpb25zLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiRXh0ZW5zaW9ucyBhcmUgVlMgQ29kZSdzIHBvd2VyLXVwcy4gVGhleSByYW5nZSBmcm9tIGhhbmR5IHByb2R1Y3Rpdml0eSBoYWNrcywgZXhwYW5kaW5nIG91dC1vZi10aGUtYm94IGZlYXR1cmVzLCB0byBhZGRpbmcgY29tcGxldGVseSBuZXcgY2FwYWJpbGl0aWVzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ2Jyb3dzZVBvcHVsYXInLCBcIkJyb3dzZSBQb3B1bGFyIEV4dGVuc2lvbnNcIiksICdjb21tYW5kOndvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93UG9wdWxhckV4dGVuc2lvbnMnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJycsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnVlMgQ29kZSBleHRlbnNpb24gbWFya2V0cGxhY2Ugd2l0aCBmZWF0dXJlZCBsYW5ndWFnZSBleHRlbnNpb25zJywgcGF0aDogJ2V4dGVuc2lvbnMuc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRlcm1pbmFsLnRpdGxlJywgXCJCdWlsdC1pbiB0ZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRlcm1pbmFsLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiUXVpY2tseSBydW4gc2hlbGwgY29tbWFuZHMgYW5kIG1vbml0b3IgYnVpbGQgb3V0cHV0LCByaWdodCBuZXh0IHRvIHlvdXIgY29kZS5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdzaG93VGVybWluYWwnLCBcIk9wZW4gVGVybWluYWxcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24udGVybWluYWwudG9nZ2xlVGVybWluYWwnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJyAmJiByZW1vdGVOYW1lICE9IGNvZGVzcGFjZXMgJiYgIXRlcm1pbmFsSXNPcGVuJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdJbnRlZ3JhdGVkIHRlcm1pbmFsIHJ1bm5pbmcgYSBmZXcgbnBtIGNvbW1hbmRzJywgcGF0aDogJ3Rlcm1pbmFsLnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdkZWJ1Z2dpbmcnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZGVidWcudGl0bGUnLCBcIldhdGNoIHlvdXIgY29kZSBpbiBhY3Rpb25cIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5kZWJ1Zy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkFjY2VsZXJhdGUgeW91ciBlZGl0LCBidWlsZCwgdGVzdCwgYW5kIGRlYnVnIGxvb3AgYnkgc2V0dGluZyB1cCBhIGxhdW5jaCBjb25maWd1cmF0aW9uLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3J1blByb2plY3QnLCBcIlJ1biB5b3VyIFByb2plY3RcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2VsZWN0YW5kc3RhcnQnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJyAmJiB3b3Jrc3BhY2VGb2xkZXJDb3VudCAhPSAwJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdSdW4gYW5kIGRlYnVnIHZpZXcuJywgcGF0aDogJ2RlYnVnLnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnc2NtQ2xvbmUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2NtLnRpdGxlJywgXCJUcmFjayB5b3VyIGNvZGUgd2l0aCBHaXRcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zY21DbG9uZS5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlNldCB1cCB0aGUgYnVpbHQtaW4gdmVyc2lvbiBjb250cm9sIGZvciB5b3VyIHByb2plY3QgdG8gdHJhY2sgeW91ciBjaGFuZ2VzIGFuZCBjb2xsYWJvcmF0ZSB3aXRoIG90aGVycy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdjbG9uZVJlcG8nLCBcIkNsb25lIFJlcG9zaXRvcnlcIiksICdjb21tYW5kOmdpdC5jbG9uZScpKSxcblx0XHRcdFx0XHR3aGVuOiAnY29uZmlnLmdpdC5lbmFibGVkICYmICFnaXQubWlzc2luZyAmJiB3b3Jrc3BhY2VGb2xkZXJDb3VudCA9PSAwJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdTb3VyY2UgQ29udHJvbCB2aWV3LicsIHBhdGg6ICdnaXQuc3ZnJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdzY21TZXR1cCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zY20udGl0bGUnLCBcIlRyYWNrIHlvdXIgY29kZSB3aXRoIEdpdFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNjbVNldHVwLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiU2V0IHVwIHRoZSBidWlsdC1pbiB2ZXJzaW9uIGNvbnRyb2wgZm9yIHlvdXIgcHJvamVjdCB0byB0cmFjayB5b3VyIGNoYW5nZXMgYW5kIGNvbGxhYm9yYXRlIHdpdGggb3RoZXJzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ2luaXRSZXBvJywgXCJJbml0aWFsaXplIEdpdCBSZXBvc2l0b3J5XCIpLCAnY29tbWFuZDpnaXQuaW5pdCcpKSxcblx0XHRcdFx0XHR3aGVuOiAnY29uZmlnLmdpdC5lbmFibGVkICYmICFnaXQubWlzc2luZyAmJiB3b3Jrc3BhY2VGb2xkZXJDb3VudCAhPSAwICYmIGdpdE9wZW5SZXBvc2l0b3J5Q291bnQgPT0gMCcsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnU291cmNlIENvbnRyb2wgdmlldy4nLCBwYXRoOiAnZ2l0LnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnc2NtJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNjbS50aXRsZScsIFwiVHJhY2sgeW91ciBjb2RlIHdpdGggR2l0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2NtLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiTm8gbW9yZSBsb29raW5nIHVwIEdpdCBjb21tYW5kcyEgR2l0IGFuZCBHaXRIdWIgd29ya2Zsb3dzIGFyZSBzZWFtbGVzc2x5IGludGVncmF0ZWQuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnb3BlblNDTScsIFwiT3BlbiBTb3VyY2UgQ29udHJvbFwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLnZpZXcuc2NtJykpLFxuXHRcdFx0XHRcdHdoZW46ICdjb25maWcuZ2l0LmVuYWJsZWQgJiYgIWdpdC5taXNzaW5nICYmIHdvcmtzcGFjZUZvbGRlckNvdW50ICE9IDAgJiYgZ2l0T3BlblJlcG9zaXRvcnlDb3VudCAhPSAwICYmIGFjdGl2ZVZpZXdsZXQgIT0gXFwnd29ya2JlbmNoLnZpZXcuc2NtXFwnJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdTb3VyY2UgQ29udHJvbCB2aWV3LicsIHBhdGg6ICdnaXQuc3ZnJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdpbnN0YWxsR2l0Jyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmluc3RhbGxHaXQudGl0bGUnLCBcIkluc3RhbGwgR2l0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSh7IGtleTogJ2dldHRpbmdTdGFydGVkLmluc3RhbGxHaXQuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgY29tbWVudDogWydUaGUgcGxhY2Vob2xkZXJzIGFyZSBjb21tYW5kIGxpbmsgaXRlbXMgc2hvdWxkIG5vdCBiZSB0cmFuc2xhdGVkJ10gfSwgXCJJbnN0YWxsIEdpdCB0byB0cmFjayBjaGFuZ2VzIGluIHlvdXIgcHJvamVjdHMuXFxuezB9XFxuezF9UmVsb2FkIHdpbmRvd3syfSBhZnRlciBpbnN0YWxsYXRpb24gdG8gY29tcGxldGUgR2l0IHNldHVwLlwiLCBCdXR0b24obG9jYWxpemUoJ2luc3RhbGxHaXQnLCBcIkluc3RhbGwgR2l0XCIpLCAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWluc3RhbGwtZ2l0JyksICdbJywgJ10oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnJlbG9hZFdpbmRvdyknKSxcblx0XHRcdFx0XHR3aGVuOiAnZ2l0Lm1pc3NpbmcnLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0luc3RhbGwgR2l0LicsIHBhdGg6ICdnaXQuc3ZnJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFtcblx0XHRcdFx0XHRcdCdvbkNvbnRleHQ6Z2l0LnN0YXRlID09IGluaXRpYWxpemVkJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd0YXNrcycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50YXNrcy50aXRsZScsIFwiQXV0b21hdGUgeW91ciBwcm9qZWN0IHRhc2tzXCIpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VGb2xkZXJDb3VudCAhPSAwICYmIHdvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50YXNrcy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkNyZWF0ZSB0YXNrcyBmb3IgeW91ciBjb21tb24gd29ya2Zsb3dzIGFuZCBlbmpveSB0aGUgaW50ZWdyYXRlZCBleHBlcmllbmNlIG9mIHJ1bm5pbmcgc2NyaXB0cyBhbmQgYXV0b21hdGljYWxseSBjaGVja2luZyByZXN1bHRzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3J1blRhc2tzJywgXCJSdW4gQXV0by1kZXRlY3RlZCBUYXNrc1wiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1Rhc2sgcnVubmVyLicsIHBhdGg6ICdydW5UYXNrLnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnc2hvcnRjdXRzJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNob3J0Y3V0cy50aXRsZScsIFwiQ3VzdG9taXplIHlvdXIgc2hvcnRjdXRzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2hvcnRjdXRzLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiT25jZSB5b3UgaGF2ZSBkaXNjb3ZlcmVkIHlvdXIgZmF2b3JpdGUgY29tbWFuZHMsIGNyZWF0ZSBjdXN0b20ga2V5Ym9hcmQgc2hvcnRjdXRzIGZvciBpbnN0YW50IGFjY2Vzcy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdrZXlib2FyZFNob3J0Y3V0cycsIFwiS2V5Ym9hcmQgU2hvcnRjdXRzXCIpLCAnY29tbWFuZDp0b1NpZGU6d29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3MnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnSW50ZXJhY3RpdmUgc2hvcnRjdXRzLicsIHBhdGg6ICdzaG9ydGN1dHMuc3ZnJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtzcGFjZVRydXN0Jyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLndvcmtzcGFjZVRydXN0LnRpdGxlJywgXCJTYWZlbHkgYnJvd3NlIGFuZCBlZGl0IGNvZGVcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC53b3Jrc3BhY2VUcnVzdC5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcInswfSBsZXRzIHlvdSBkZWNpZGUgd2hldGhlciB5b3VyIHByb2plY3QgZm9sZGVycyBzaG91bGQgKiphbGxvdyBvciByZXN0cmljdCoqIGF1dG9tYXRpYyBjb2RlIGV4ZWN1dGlvbiBfXyhyZXF1aXJlZCBmb3IgZXh0ZW5zaW9ucywgZGVidWdnaW5nLCBldGMpX18uXFxuT3BlbmluZyBhIGZpbGUvZm9sZGVyIHdpbGwgcHJvbXB0IHRvIGdyYW50IHRydXN0LiBZb3UgY2FuIGFsd2F5cyB7MX0gbGF0ZXIuXCIsIEJ1dHRvbihsb2NhbGl6ZSgnd29ya3NwYWNlVHJ1c3QnLCBcIldvcmtzcGFjZSBUcnVzdFwiKSwgJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL3dvcmtzcGFjZS10cnVzdCcpLCBCdXR0b24obG9jYWxpemUoJ2VuYWJsZVRydXN0JywgXCJlbmFibGUgdHJ1c3RcIiksICdjb21tYW5kOnRvU2lkZTp3b3JrYmVuY2gudHJ1c3QubWFuYWdlJykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcgJiYgIWlzV29ya3NwYWNlVHJ1c3RlZCAmJiB3b3Jrc3BhY2VGb2xkZXJDb3VudCA9PSAwJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdXb3Jrc3BhY2UgVHJ1c3QgZWRpdG9yIGluIFJlc3RyaWN0ZWQgbW9kZSBhbmQgYSBwcmltYXJ5IGJ1dHRvbiBmb3Igc3dpdGNoaW5nIHRvIFRydXN0ZWQgbW9kZS4nLCBwYXRoOiAnd29ya3NwYWNlVHJ1c3Quc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdub3RlYm9va3MnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubm90ZWJvb2sudGl0bGUnLCBcIkN1c3RvbWl6ZSBOb3RlYm9va3NcIiksXG5cdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdGljb246IHNldHVwSWNvbixcblx0XHRpc0ZlYXR1cmVkOiBmYWxzZSxcblx0XHR3aGVuOiBgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLm9wZW5HZXR0aW5nU3RhcnRlZH0gJiYgdXNlckhhc09wZW5lZE5vdGVib29rYCxcblx0XHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5vdGVib29rLndhbGt0aHJvdWdoUGFnZVRpdGxlJywgJ05vdGVib29rcycpLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGVwcycsXG5cdFx0XHRzdGVwczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czogWydvbkNvbW1hbmQ6bm90ZWJvb2suc2V0UHJvZmlsZSddLFxuXHRcdFx0XHRcdGlkOiAnbm90ZWJvb2tQcm9maWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5vdGVib29rUHJvZmlsZS50aXRsZScsIFwiU2VsZWN0IHRoZSBsYXlvdXQgZm9yIHlvdXIgbm90ZWJvb2tzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubm90ZWJvb2tQcm9maWxlLmRlc2NyaXB0aW9uJywgXCJHZXQgbm90ZWJvb2tzIHRvIGZlZWwganVzdCB0aGUgd2F5IHlvdSBwcmVmZXJcIiksXG5cdFx0XHRcdFx0d2hlbjogJ3VzZXJIYXNPcGVuZWROb3RlYm9vaycsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdub3RlYm9va1Byb2ZpbGUnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRc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
