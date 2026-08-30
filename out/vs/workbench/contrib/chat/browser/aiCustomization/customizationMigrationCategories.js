import { localize } from "../../../../../nls.js";
import { ChatConfiguration } from "../../common/constants.js";
import { PromptFileSource, PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
var CustomizationMigrationCategoryId = /* @__PURE__ */ ((CustomizationMigrationCategoryId2) => {
  CustomizationMigrationCategoryId2["PromptFiles"] = "promptFiles";
  CustomizationMigrationCategoryId2["UserData"] = "userData";
  return CustomizationMigrationCategoryId2;
})(CustomizationMigrationCategoryId || {});
const SKILLS_DOCUMENTATION_URL = "https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product";
const CUSTOMIZATION_DOCUMENTATION_URL = "https://code.visualstudio.com/docs/agent-customization/overview?referrer=in-product";
const promptFilesMigrationCategory = {
  id: "promptFiles" /* PromptFiles */,
  sourceTypes: [PromptsType.prompt],
  enablementSetting: ChatConfiguration.ChatCustomizationsPromptMigrationEnabled,
  shortcutLabel: localize("promptMigrationShortcutLabel", "Migrate Prompts"),
  shortcutTooltip: localize("promptMigrationShortcutTooltip", "Convert deprecated prompt files to skills"),
  cardLabel: localize("promptMigrationCardLabel", "Migrate Prompt Files"),
  cardActionLabel: localize("promptMigrationCardAction", "Convert to Skills..."),
  cardActionAriaLabel: localize("promptMigrationCardActionAriaLabel", "Convert prompt files to skills"),
  pageTitle: localize("promptMigrationPageTitle", "Migrate Prompt Files"),
  pageLinkLabel: localize("promptMigrationLearnMore", "Learn more about agent skills"),
  pageLinkUrl: SKILLS_DOCUMENTATION_URL,
  pageEmptyMessage: localize("promptMigrationPageEmpty", "No prompt files are available to migrate."),
  searchEmptyMessage: localize("promptMigrationSearchEmpty", "No prompt files match your search."),
  migrateButtonTooltip: localize("promptMigrationPageButtonTooltip", "Convert selected prompt files to skills"),
  backLabel: localize("backToPromptMigration", "Back to Migrate Prompt Files"),
  noFilesMigratedMessage: localize("promptMigrationNoFilesConverted", "No prompt files were converted."),
  isCandidate(customization) {
    return customization.type === PromptsType.prompt && (customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
  },
  group(customizations) {
    return [
      {
        key: PromptsStorage.local,
        label: localize("promptMigrationWorkspaceGroup", "Workspace"),
        customizations: customizations.filter((customization) => customization.storage === PromptsStorage.local)
      },
      {
        key: PromptsStorage.user,
        label: localize("promptMigrationUserGroup", "User"),
        customizations: customizations.filter((customization) => customization.storage === PromptsStorage.user)
      }
    ];
  },
  getShortcutAriaLabel(count) {
    return localize("promptMigrationShortcutAriaLabelWithCount", "Prompts, {0} deprecated prompt files need migration", count);
  },
  getCardDescription(customizations, harnessLabel) {
    const { workspaceCount, userCount, totalCount } = countPromptStorages(customizations);
    if (workspaceCount > 0 && userCount > 0) {
      return localize(
        "promptMigrationCardDescriptionWorkspaceAndUser",
        "Prompt files are deprecated for this harness. Found {0} prompt files ({1} workspace, {2} global) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
        totalCount,
        workspaceCount,
        userCount,
        harnessLabel
      );
    }
    if (workspaceCount > 0) {
      return localize(
        "promptMigrationCardDescriptionWorkspace",
        "Prompt files are deprecated for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
        workspaceCount,
        harnessLabel
      );
    }
    return localize(
      "promptMigrationCardDescriptionUser",
      "Prompt files are deprecated for this harness. Found {0} global prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
      userCount,
      harnessLabel
    );
  },
  getPageDescription(customizations, harnessLabel) {
    const { workspaceCount, userCount, totalCount } = countPromptStorages(customizations);
    if (totalCount === 0) {
      return localize("promptMigrationPageDescription", "Select prompt files to convert into skills for the active harness.");
    }
    if (workspaceCount > 0 && userCount > 0) {
      return localize(
        "promptMigrationPageDescriptionWorkspaceAndUser",
        "Prompt files are not supported for this harness. Found {0} prompt files ({1} workspace, {2} user) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
        totalCount,
        workspaceCount,
        userCount,
        harnessLabel
      );
    }
    if (workspaceCount > 0) {
      return localize(
        "promptMigrationPageDescriptionWorkspace",
        "Prompt files are not supported for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
        workspaceCount,
        harnessLabel
      );
    }
    return localize(
      "promptMigrationPageDescriptionUser",
      "Prompt files are not supported for this harness. Found {0} user prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
      userCount,
      harnessLabel
    );
  },
  getConfirmation(customizations) {
    const { workspaceCount, userCount } = countPromptStorages(customizations);
    const detail = workspaceCount > 0 && userCount > 0 ? localize("promptMigrationConfirmDetailWorkspaceAndUser", "This converts {0} workspace prompt files and {1} user prompt files into skills.", workspaceCount, userCount) : workspaceCount > 0 ? localize("promptMigrationConfirmDetailWorkspace", "This converts {0} workspace prompt files into skills.", workspaceCount) : localize("promptMigrationConfirmDetailUser", "This converts {0} user prompt files into skills.", userCount);
    return {
      message: localize("promptMigrationConfirmMessage", "Convert prompt files to skills?"),
      detail,
      primaryButton: localize("promptMigrationConfirmButton", "Convert to Skills"),
      deleteOriginalsLabel: localize("promptMigrationDeletePromptFilesCheckbox", "Delete original prompt files after migration")
    };
  },
  getMigratedMessage(migratedCount) {
    return localize("promptMigrationConverted", "Converted {0} prompt files to skills.", migratedCount);
  },
  getMigratedWithReviewMessage(migratedCount, unsupportedHeaderKeys) {
    return localize(
      "promptMigrationConvertedWithReview",
      "Converted {0} prompt files to skills. Review migrated skills that used unsupported prompt headers: {1}.",
      migratedCount,
      unsupportedHeaderKeys
    );
  },
  getFailedMessage(failedFileNames, hiddenFileCount) {
    return hiddenFileCount > 0 ? localize("promptMigrationFilesFailedWithRemainder", "Failed to migrate {0} prompt files: {1}, and {2} more.", failedFileNames.length + hiddenFileCount, failedFileNames.join(", "), hiddenFileCount) : localize("promptMigrationFilesFailed", "Failed to migrate {0} prompt files: {1}.", failedFileNames.length, failedFileNames.join(", "));
  }
};
const userDataMigrationCategory = {
  id: "userData" /* UserData */,
  sourceTypes: [PromptsType.agent, PromptsType.instructions],
  enablementSetting: ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled,
  shortcutLabel: localize("userDataMigrationShortcutLabel", "Migrate User Data"),
  shortcutTooltip: localize("userDataMigrationShortcutTooltip", "Move user data agents and instructions to the active harness"),
  cardLabel: localize("userDataMigrationCardLabel", "Migrate User Data Customizations"),
  cardActionLabel: localize("userDataMigrationCardAction", "Migrate..."),
  cardActionAriaLabel: localize("userDataMigrationCardActionAriaLabel", "Migrate user data customizations to the active harness"),
  pageTitle: localize("userDataMigrationPageTitle", "Migrate User Data Customizations"),
  pageLinkLabel: localize("userDataMigrationLearnMore", "Learn more about agent customizations"),
  pageLinkUrl: CUSTOMIZATION_DOCUMENTATION_URL,
  pageEmptyMessage: localize("userDataMigrationPageEmpty", "No user data customizations are available to migrate."),
  searchEmptyMessage: localize("userDataMigrationSearchEmpty", "No user data customizations match your search."),
  migrateButtonTooltip: localize("userDataMigrationPageButtonTooltip", "Move the selected user data customizations to the active harness"),
  backLabel: localize("backToUserDataMigration", "Back to Migrate User Data Customizations"),
  noFilesMigratedMessage: localize("userDataMigrationNoFilesMigrated", "No user data customizations were migrated."),
  isCandidate(customization) {
    return customization.source === PromptFileSource.UserData && (customization.type === PromptsType.agent || customization.type === PromptsType.instructions);
  },
  group(customizations) {
    return [
      {
        key: PromptsType.agent,
        label: localize("userDataMigrationAgentsGroup", "Agents"),
        customizations: customizations.filter((customization) => customization.type === PromptsType.agent)
      },
      {
        key: PromptsType.instructions,
        label: localize("userDataMigrationInstructionsGroup", "Instructions"),
        customizations: customizations.filter((customization) => customization.type === PromptsType.instructions)
      }
    ];
  },
  getShortcutAriaLabel(count) {
    return count === 1 ? localize("userDataMigrationShortcutAriaLabelSingle", "User data, 1 customization needs migration") : localize("userDataMigrationShortcutAriaLabelWithCount", "User data, {0} customizations need migration", count);
  },
  getCardDescription(customizations, harnessLabel) {
    const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
    if (agentCount > 0 && instructionsCount > 0) {
      return localize(
        "userDataMigrationCardDescriptionMixed",
        "User data customizations are only used by VS Code. Found {0} customizations that {1} ignores. Move them to keep them available.",
        totalCount,
        harnessLabel
      );
    }
    if (agentCount > 0) {
      return agentCount === 1 ? localize(
        "userDataMigrationCardDescriptionAgent",
        "User data customizations are only used by VS Code. Found 1 agent that {0} ignores. Move it to keep it available.",
        harnessLabel
      ) : localize(
        "userDataMigrationCardDescriptionAgents",
        "User data customizations are only used by VS Code. Found {0} agents that {1} ignores. Move them to keep them available.",
        agentCount,
        harnessLabel
      );
    }
    return instructionsCount === 1 ? localize(
      "userDataMigrationCardDescriptionInstruction",
      "User data customizations are only used by VS Code. Found 1 instruction file that {0} ignores. Move it to keep it available.",
      harnessLabel
    ) : localize(
      "userDataMigrationCardDescriptionInstructions",
      "User data customizations are only used by VS Code. Found {0} instruction files that {1} ignores. Move them to keep them available.",
      instructionsCount,
      harnessLabel
    );
  },
  getBanner(customizations, harnessLabel) {
    const { totalCount } = countUserDataTypes(customizations);
    return {
      title: totalCount === 1 ? localize("userDataMigrationBannerTitleSingle", "1 customization is not available to {0}", harnessLabel) : localize("userDataMigrationBannerTitle", "{0} customizations are not available to {1}", totalCount, harnessLabel),
      // The grouped list below already breaks these down by type, so the
      // message explains the move rather than repeating the counts.
      message: localize(
        "userDataMigrationBannerMessage",
        "They are stored in user data, which only VS Code reads. Migrating moves them into the folders {0} reads, keeping their name, type, and content, so you can keep using them.",
        harnessLabel
      ),
      consequence: localize(
        "userDataMigrationBannerConsequence",
        "Migrated files won't use Settings Sync. Commit them to a repository to share them."
      )
    };
  },
  getPageDescription(customizations, harnessLabel) {
    const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
    if (totalCount === 0) {
      return localize("userDataMigrationPageDescription", "Select user data customizations to move to the active harness.");
    }
    if (agentCount > 0 && instructionsCount > 0) {
      return localize(
        "userDataMigrationPageDescriptionAgentsAndInstructions",
        "Found {0} customizations in user data that local VS Code can still use, but {1} ignores. Move them to the harness folders to keep their type and content.",
        totalCount,
        harnessLabel
      );
    }
    if (agentCount > 0) {
      return agentCount === 1 ? localize(
        "userDataMigrationPageDescriptionAgent",
        "Found 1 agent in user data that local VS Code can still use, but {0} ignores. Move it to the harness agents folder to keep it available.",
        harnessLabel
      ) : localize(
        "userDataMigrationPageDescriptionAgents",
        "Found {0} agents in user data that local VS Code can still use, but {1} ignores. Move them to the harness agents folder to keep them available.",
        agentCount,
        harnessLabel
      );
    }
    return instructionsCount === 1 ? localize(
      "userDataMigrationPageDescriptionInstruction",
      "Found 1 instruction file in user data that local VS Code can still use, but {0} ignores. Move it to the harness instructions folder to keep it available.",
      harnessLabel
    ) : localize(
      "userDataMigrationPageDescriptionInstructions",
      "Found {0} instruction files in user data that local VS Code can still use, but {1} ignores. Move them to the harness instructions folder to keep them available.",
      instructionsCount,
      harnessLabel
    );
  },
  getConfirmation(customizations, harnessLabel) {
    const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
    let detail;
    if (agentCount > 0 && instructionsCount > 0) {
      detail = localize("userDataMigrationConfirmDetailMixed", "This moves {0} customizations out of user data.", totalCount);
    } else if (agentCount > 0) {
      detail = agentCount === 1 ? localize("userDataMigrationConfirmDetailAgent", "This moves 1 agent out of user data.") : localize("userDataMigrationConfirmDetailAgents", "This moves {0} agents out of user data.", agentCount);
    } else {
      detail = instructionsCount === 1 ? localize("userDataMigrationConfirmDetailInstruction", "This moves 1 instruction file out of user data.") : localize("userDataMigrationConfirmDetailInstructions", "This moves {0} instruction files out of user data.", instructionsCount);
    }
    return {
      message: localize("userDataMigrationConfirmMessage", "Migrate user data customizations to {0}?", harnessLabel),
      detail,
      primaryButton: localize("userDataMigrationConfirmButton", "Migrate"),
      deleteOriginalsLabel: localize("userDataMigrationDeleteOriginalFilesCheckbox", "Delete the original files from user data after migration")
    };
  },
  getMigratedMessage(migratedCount) {
    return migratedCount === 1 ? localize("userDataMigrationCompletedSingle", "Migrated 1 user data customization.") : localize("userDataMigrationCompleted", "Migrated {0} user data customizations.", migratedCount);
  },
  getFailedMessage(failedFileNames, hiddenFileCount) {
    const failedCount = failedFileNames.length + hiddenFileCount;
    if (failedCount === 1) {
      return localize("userDataMigrationFileFailed", "Failed to migrate 1 user data customization: {0}.", failedFileNames[0]);
    }
    return hiddenFileCount > 0 ? localize("userDataMigrationFilesFailedWithRemainder", "Failed to migrate {0} user data customizations: {1}, and {2} more.", failedCount, failedFileNames.join(", "), hiddenFileCount) : localize("userDataMigrationFilesFailed", "Failed to migrate {0} user data customizations: {1}.", failedCount, failedFileNames.join(", "));
  }
};
const CUSTOMIZATION_MIGRATION_CATEGORIES = [
  promptFilesMigrationCategory,
  userDataMigrationCategory
];
function getCustomizationMigrationCategory(id) {
  const category = CUSTOMIZATION_MIGRATION_CATEGORIES.find((candidate) => candidate.id === id);
  if (!category) {
    throw new Error(`Unknown customization migration category: ${id}`);
  }
  return category;
}
function getCustomizationMigrationSourceTypes(categories) {
  return Array.from(new Set(categories.flatMap((category) => category.sourceTypes)));
}
function countPromptStorages(customizations) {
  const workspaceCount = customizations.filter((customization) => customization.storage === PromptsStorage.local).length;
  const userCount = customizations.filter((customization) => customization.storage === PromptsStorage.user).length;
  return { workspaceCount, userCount, totalCount: workspaceCount + userCount };
}
function countUserDataTypes(customizations) {
  const agentCount = customizations.filter((customization) => customization.type === PromptsType.agent).length;
  const instructionsCount = customizations.filter((customization) => customization.type === PromptsType.instructions).length;
  return { agentCount, instructionsCount, totalCount: agentCount + instructionsCount };
}
export {
  CUSTOMIZATION_MIGRATION_CATEGORIES,
  CustomizationMigrationCategoryId,
  getCustomizationMigrationCategory,
  getCustomizationMigrationSourceTypes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcY3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3JpZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVNvdXJjZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9tcHRQYXRoLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkIHtcblx0UHJvbXB0RmlsZXMgPSAncHJvbXB0RmlsZXMnLFxuXHRVc2VyRGF0YSA9ICd1c2VyRGF0YScsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25Hcm91cCB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVByb21wdFBhdGhbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNvbmZpcm1hdGlvbiB7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcblx0cmVhZG9ubHkgZGV0YWlsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByaW1hcnlCdXR0b246IHN0cmluZztcblx0cmVhZG9ubHkgZGVsZXRlT3JpZ2luYWxzTGFiZWw6IHN0cmluZztcbn1cblxuLyoqXG4gKiBQcm9taW5lbnQgZXhwbGFuYXRpb24gc2hvd24gYWJvdmUgdGhlIG1pZ3JhdGlvbiBsaXN0LCBmb3IgbWlncmF0aW9ucyB3aG9zZVxuICogdHJhZGUtb2ZmIG5lZWRzIHN0YXRpbmcgYmVmb3JlIHRoZSB1c2VyIGNvbW1pdHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25CYW5uZXIge1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7XG5cdC8qKiBXaGF0IHRoZSB1c2VyIGdpdmVzIHVwIGJ5IG1pZ3JhdGluZywgc28gdGhlIGNob2ljZSBpcyBtYWRlIGtub3dpbmdseS4gKi9cblx0cmVhZG9ubHkgY29uc2VxdWVuY2U6IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHNlbGYtY29udGFpbmVkIG1pZ3JhdGlvbiBmbG93LiBFYWNoIGNhdGVnb3J5IG93bnMgaXRzIGNhbmRpZGF0ZXMsIGdyb3VwaW5nLFxuICogYW5kIHVzZXItdmlzaWJsZSBjb3B5IHNvIHRoZSB0d28gbWlncmF0aW9ucyBzdGF5IGZvY3VzZWQgYW5kIGluZGVwZW5kZW50bHkgcmVhZGFibGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSB7XG5cdHJlYWRvbmx5IGlkOiBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZDtcblx0LyoqIFByb21wdCB0eXBlcyBzY2FubmVkIHdoZW4gY29sbGVjdGluZyBjYW5kaWRhdGVzIGZvciB0aGlzIGNhdGVnb3J5LiAqL1xuXHRyZWFkb25seSBzb3VyY2VUeXBlczogcmVhZG9ubHkgUHJvbXB0c1R5cGVbXTtcblx0LyoqIEV4cGVyaW1lbnRhbCBzZXR0aW5nIGdhdGluZyB0aGlzIG1pZ3JhdGlvbi4gRWFjaCBjYXRlZ29yeSBpcyBlbmFibGVkIGluZGVwZW5kZW50bHkuICovXG5cdHJlYWRvbmx5IGVuYWJsZW1lbnRTZXR0aW5nOiBDaGF0Q29uZmlndXJhdGlvbjtcblx0cmVhZG9ubHkgc2hvcnRjdXRMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzaG9ydGN1dFRvb2x0aXA6IHN0cmluZztcblx0cmVhZG9ubHkgY2FyZExhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhcmRBY3Rpb25MYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBjYXJkQWN0aW9uQXJpYUxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhZ2VUaXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBwYWdlTGlua0xhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhZ2VMaW5rVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhZ2VFbXB0eU1lc3NhZ2U6IHN0cmluZztcblx0cmVhZG9ubHkgc2VhcmNoRW1wdHlNZXNzYWdlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1pZ3JhdGVCdXR0b25Ub29sdGlwOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJhY2tMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBub0ZpbGVzTWlncmF0ZWRNZXNzYWdlOiBzdHJpbmc7XG5cdGlzQ2FuZGlkYXRlKGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoKTogYm9vbGVhbjtcblx0Z3JvdXAoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10pOiByZWFkb25seSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkdyb3VwW107XG5cdGdldFNob3J0Y3V0QXJpYUxhYmVsKGNvdW50OiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldENhcmREZXNjcmlwdGlvbihjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSwgaGFybmVzc0xhYmVsOiBzdHJpbmcpOiBzdHJpbmc7XG5cdGdldFBhZ2VEZXNjcmlwdGlvbihjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSwgaGFybmVzc0xhYmVsOiBzdHJpbmcpOiBzdHJpbmc7XG5cdC8qKiBXaGVuIHByZXNlbnQsIHJlcGxhY2VzIHRoZSBwYWdlIGRlc2NyaXB0aW9uIHdpdGggYSBwcm9taW5lbnQgYmFubmVyLiAqL1xuXHRnZXRCYW5uZXI/KGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBJUHJvbXB0UGF0aFtdLCBoYXJuZXNzTGFiZWw6IHN0cmluZyk6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQmFubmVyO1xuXHRnZXRDb25maXJtYXRpb24oY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10sIGhhcm5lc3NMYWJlbDogc3RyaW5nKTogSUN1c3RvbWl6YXRpb25NaWdyYXRpb25Db25maXJtYXRpb247XG5cdGdldE1pZ3JhdGVkTWVzc2FnZShtaWdyYXRlZENvdW50OiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldE1pZ3JhdGVkV2l0aFJldmlld01lc3NhZ2U/KG1pZ3JhdGVkQ291bnQ6IG51bWJlciwgdW5zdXBwb3J0ZWRIZWFkZXJLZXlzOiBzdHJpbmcpOiBzdHJpbmc7XG5cdGdldEZhaWxlZE1lc3NhZ2UoZmFpbGVkRmlsZU5hbWVzOiByZWFkb25seSBzdHJpbmdbXSwgaGlkZGVuRmlsZUNvdW50OiBudW1iZXIpOiBzdHJpbmc7XG59XG5cbmNvbnN0IFNLSUxMU19ET0NVTUVOVEFUSU9OX1VSTCA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50LWN1c3RvbWl6YXRpb24vYWdlbnQtc2tpbGxzP3JlZmVycmVyPWluLXByb2R1Y3QnO1xuY29uc3QgQ1VTVE9NSVpBVElPTl9ET0NVTUVOVEFUSU9OX1VSTCA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50LWN1c3RvbWl6YXRpb24vb3ZlcnZpZXc/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cbi8qKlxuICogQ29udmVydHMgYCoucHJvbXB0Lm1kYCBmaWxlcyBpbnRvIHNraWxscy4gQWdlbnQtaG9zdCBoYXJuZXNzZXMgaWdub3JlIHByb21wdFxuICogZmlsZXMgZW50aXJlbHksIHNvIGJvdGggd29ya3NwYWNlIGFuZCB1c2VyIHByb21wdHMgYXJlIG9mZmVyZWQgaGVyZS5cbiAqL1xuY29uc3QgcHJvbXB0RmlsZXNNaWdyYXRpb25DYXRlZ29yeTogSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSA9IHtcblx0aWQ6IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlByb21wdEZpbGVzLFxuXHRzb3VyY2VUeXBlczogW1Byb21wdHNUeXBlLnByb21wdF0sXG5cdGVuYWJsZW1lbnRTZXR0aW5nOiBDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNQcm9tcHRNaWdyYXRpb25FbmFibGVkLFxuXHRzaG9ydGN1dExhYmVsOiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uU2hvcnRjdXRMYWJlbCcsIFwiTWlncmF0ZSBQcm9tcHRzXCIpLFxuXHRzaG9ydGN1dFRvb2x0aXA6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25TaG9ydGN1dFRvb2x0aXAnLCBcIkNvbnZlcnQgZGVwcmVjYXRlZCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzXCIpLFxuXHRjYXJkTGFiZWw6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25DYXJkTGFiZWwnLCBcIk1pZ3JhdGUgUHJvbXB0IEZpbGVzXCIpLFxuXHRjYXJkQWN0aW9uTGFiZWw6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25DYXJkQWN0aW9uJywgXCJDb252ZXJ0IHRvIFNraWxscy4uLlwiKSxcblx0Y2FyZEFjdGlvbkFyaWFMYWJlbDogbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbkNhcmRBY3Rpb25BcmlhTGFiZWwnLCBcIkNvbnZlcnQgcHJvbXB0IGZpbGVzIHRvIHNraWxsc1wiKSxcblx0cGFnZVRpdGxlOiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uUGFnZVRpdGxlJywgXCJNaWdyYXRlIFByb21wdCBGaWxlc1wiKSxcblx0cGFnZUxpbmtMYWJlbDogbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbkxlYXJuTW9yZScsIFwiTGVhcm4gbW9yZSBhYm91dCBhZ2VudCBza2lsbHNcIiksXG5cdHBhZ2VMaW5rVXJsOiBTS0lMTFNfRE9DVU1FTlRBVElPTl9VUkwsXG5cdHBhZ2VFbXB0eU1lc3NhZ2U6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25QYWdlRW1wdHknLCBcIk5vIHByb21wdCBmaWxlcyBhcmUgYXZhaWxhYmxlIHRvIG1pZ3JhdGUuXCIpLFxuXHRzZWFyY2hFbXB0eU1lc3NhZ2U6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25TZWFyY2hFbXB0eScsIFwiTm8gcHJvbXB0IGZpbGVzIG1hdGNoIHlvdXIgc2VhcmNoLlwiKSxcblx0bWlncmF0ZUJ1dHRvblRvb2x0aXA6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25QYWdlQnV0dG9uVG9vbHRpcCcsIFwiQ29udmVydCBzZWxlY3RlZCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzXCIpLFxuXHRiYWNrTGFiZWw6IGxvY2FsaXplKCdiYWNrVG9Qcm9tcHRNaWdyYXRpb24nLCBcIkJhY2sgdG8gTWlncmF0ZSBQcm9tcHQgRmlsZXNcIiksXG5cdG5vRmlsZXNNaWdyYXRlZE1lc3NhZ2U6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Ob0ZpbGVzQ29udmVydGVkJywgXCJObyBwcm9tcHQgZmlsZXMgd2VyZSBjb252ZXJ0ZWQuXCIpLFxuXG5cdGlzQ2FuZGlkYXRlKGN1c3RvbWl6YXRpb24pIHtcblx0XHRyZXR1cm4gY3VzdG9taXphdGlvbi50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHRcblx0XHRcdCYmIChjdXN0b21pemF0aW9uLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsIHx8IGN1c3RvbWl6YXRpb24uc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcik7XG5cdH0sXG5cblx0Z3JvdXAoY3VzdG9taXphdGlvbnMpIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRrZXk6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbldvcmtzcGFjZUdyb3VwJywgXCJXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtleTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Vc2VyR3JvdXAnLCBcIlVzZXJcIiksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9LFxuXG5cdGdldFNob3J0Y3V0QXJpYUxhYmVsKGNvdW50KSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25TaG9ydGN1dEFyaWFMYWJlbFdpdGhDb3VudCcsIFwiUHJvbXB0cywgezB9IGRlcHJlY2F0ZWQgcHJvbXB0IGZpbGVzIG5lZWQgbWlncmF0aW9uXCIsIGNvdW50KTtcblx0fSxcblxuXHRnZXRDYXJkRGVzY3JpcHRpb24oY3VzdG9taXphdGlvbnMsIGhhcm5lc3NMYWJlbCkge1xuXHRcdGNvbnN0IHsgd29ya3NwYWNlQ291bnQsIHVzZXJDb3VudCwgdG90YWxDb3VudCB9ID0gY291bnRQcm9tcHRTdG9yYWdlcyhjdXN0b21pemF0aW9ucyk7XG5cdFx0aWYgKHdvcmtzcGFjZUNvdW50ID4gMCAmJiB1c2VyQ291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25Xb3Jrc3BhY2VBbmRVc2VyJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIGRlcHJlY2F0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHByb21wdCBmaWxlcyAoezF9IHdvcmtzcGFjZSwgezJ9IGdsb2JhbCkgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCBydW4sIGJ1dCB7M30gaWdub3Jlcy4gQ29udmVydCB0aGVtIHRvIHNraWxscyB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR0b3RhbENvdW50LCB3b3Jrc3BhY2VDb3VudCwgdXNlckNvdW50LCBoYXJuZXNzTGFiZWwsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAod29ya3NwYWNlQ291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25Xb3Jrc3BhY2UnLFxuXHRcdFx0XHRcIlByb21wdCBmaWxlcyBhcmUgZGVwcmVjYXRlZCBmb3IgdGhpcyBoYXJuZXNzLiBGb3VuZCB7MH0gd29ya3NwYWNlIHByb21wdCBmaWxlcyB0aGF0IGxvY2FsIFZTIENvZGUgY2FuIHN0aWxsIHJ1biwgYnV0IHsxfSBpZ25vcmVzLiBDb252ZXJ0IHRoZW0gdG8gc2tpbGxzIHRvIGtlZXAgdGhlbSBhdmFpbGFibGUuXCIsXG5cdFx0XHRcdHdvcmtzcGFjZUNvdW50LCBoYXJuZXNzTGFiZWwsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHQncHJvbXB0TWlncmF0aW9uQ2FyZERlc2NyaXB0aW9uVXNlcicsXG5cdFx0XHRcIlByb21wdCBmaWxlcyBhcmUgZGVwcmVjYXRlZCBmb3IgdGhpcyBoYXJuZXNzLiBGb3VuZCB7MH0gZ2xvYmFsIHByb21wdCBmaWxlcyB0aGF0IGxvY2FsIFZTIENvZGUgY2FuIHN0aWxsIHJ1biwgYnV0IHsxfSBpZ25vcmVzLiBDb252ZXJ0IHRoZW0gdG8gc2tpbGxzIHRvIGtlZXAgdGhlbSBhdmFpbGFibGUuXCIsXG5cdFx0XHR1c2VyQ291bnQsIGhhcm5lc3NMYWJlbCxcblx0XHQpO1xuXHR9LFxuXG5cdGdldFBhZ2VEZXNjcmlwdGlvbihjdXN0b21pemF0aW9ucywgaGFybmVzc0xhYmVsKSB7XG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2VDb3VudCwgdXNlckNvdW50LCB0b3RhbENvdW50IH0gPSBjb3VudFByb21wdFN0b3JhZ2VzKGN1c3RvbWl6YXRpb25zKTtcblx0XHRpZiAodG90YWxDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25QYWdlRGVzY3JpcHRpb24nLCBcIlNlbGVjdCBwcm9tcHQgZmlsZXMgdG8gY29udmVydCBpbnRvIHNraWxscyBmb3IgdGhlIGFjdGl2ZSBoYXJuZXNzLlwiKTtcblx0XHR9XG5cdFx0aWYgKHdvcmtzcGFjZUNvdW50ID4gMCAmJiB1c2VyQ291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRNaWdyYXRpb25QYWdlRGVzY3JpcHRpb25Xb3Jrc3BhY2VBbmRVc2VyJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHByb21wdCBmaWxlcyAoezF9IHdvcmtzcGFjZSwgezJ9IHVzZXIpIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgcnVuLCBidXQgezN9IGlnbm9yZXMuIENvbnZlcnQgdGhlbSB0byBza2lsbHMgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdFx0dG90YWxDb3VudCwgd29ya3NwYWNlQ291bnQsIHVzZXJDb3VudCwgaGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKHdvcmtzcGFjZUNvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHQncHJvbXB0TWlncmF0aW9uUGFnZURlc2NyaXB0aW9uV29ya3NwYWNlJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCBydW4sIGJ1dCB7MX0gaWdub3Jlcy4gQ29udmVydCB0aGVtIHRvIHNraWxscyB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR3b3Jrc3BhY2VDb3VudCwgaGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0J3Byb21wdE1pZ3JhdGlvblBhZ2VEZXNjcmlwdGlvblVzZXInLFxuXHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHVzZXIgcHJvbXB0IGZpbGVzIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgcnVuLCBidXQgezF9IGlnbm9yZXMuIENvbnZlcnQgdGhlbSB0byBza2lsbHMgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdHVzZXJDb3VudCwgaGFybmVzc0xhYmVsLFxuXHRcdCk7XG5cdH0sXG5cblx0Z2V0Q29uZmlybWF0aW9uKGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2VDb3VudCwgdXNlckNvdW50IH0gPSBjb3VudFByb21wdFN0b3JhZ2VzKGN1c3RvbWl6YXRpb25zKTtcblx0XHRjb25zdCBkZXRhaWwgPSB3b3Jrc3BhY2VDb3VudCA+IDAgJiYgdXNlckNvdW50ID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uQ29uZmlybURldGFpbFdvcmtzcGFjZUFuZFVzZXInLCBcIlRoaXMgY29udmVydHMgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgYW5kIHsxfSB1c2VyIHByb21wdCBmaWxlcyBpbnRvIHNraWxscy5cIiwgd29ya3NwYWNlQ291bnQsIHVzZXJDb3VudClcblx0XHRcdDogd29ya3NwYWNlQ291bnQgPiAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbkNvbmZpcm1EZXRhaWxXb3Jrc3BhY2UnLCBcIlRoaXMgY29udmVydHMgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgaW50byBza2lsbHMuXCIsIHdvcmtzcGFjZUNvdW50KVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Db25maXJtRGV0YWlsVXNlcicsIFwiVGhpcyBjb252ZXJ0cyB7MH0gdXNlciBwcm9tcHQgZmlsZXMgaW50byBza2lsbHMuXCIsIHVzZXJDb3VudCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Db25maXJtTWVzc2FnZScsIFwiQ29udmVydCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzP1wiKSxcblx0XHRcdGRldGFpbCxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Db25maXJtQnV0dG9uJywgXCJDb252ZXJ0IHRvIFNraWxsc1wiKSxcblx0XHRcdGRlbGV0ZU9yaWdpbmFsc0xhYmVsOiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uRGVsZXRlUHJvbXB0RmlsZXNDaGVja2JveCcsIFwiRGVsZXRlIG9yaWdpbmFsIHByb21wdCBmaWxlcyBhZnRlciBtaWdyYXRpb25cIiksXG5cdFx0fTtcblx0fSxcblxuXHRnZXRNaWdyYXRlZE1lc3NhZ2UobWlncmF0ZWRDb3VudCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uQ29udmVydGVkJywgXCJDb252ZXJ0ZWQgezB9IHByb21wdCBmaWxlcyB0byBza2lsbHMuXCIsIG1pZ3JhdGVkQ291bnQpO1xuXHR9LFxuXG5cdGdldE1pZ3JhdGVkV2l0aFJldmlld01lc3NhZ2UobWlncmF0ZWRDb3VudCwgdW5zdXBwb3J0ZWRIZWFkZXJLZXlzKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0J3Byb21wdE1pZ3JhdGlvbkNvbnZlcnRlZFdpdGhSZXZpZXcnLFxuXHRcdFx0XCJDb252ZXJ0ZWQgezB9IHByb21wdCBmaWxlcyB0byBza2lsbHMuIFJldmlldyBtaWdyYXRlZCBza2lsbHMgdGhhdCB1c2VkIHVuc3VwcG9ydGVkIHByb21wdCBoZWFkZXJzOiB7MX0uXCIsXG5cdFx0XHRtaWdyYXRlZENvdW50LCB1bnN1cHBvcnRlZEhlYWRlcktleXMsXG5cdFx0KTtcblx0fSxcblxuXHRnZXRGYWlsZWRNZXNzYWdlKGZhaWxlZEZpbGVOYW1lcywgaGlkZGVuRmlsZUNvdW50KSB7XG5cdFx0cmV0dXJuIGhpZGRlbkZpbGVDb3VudCA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbkZpbGVzRmFpbGVkV2l0aFJlbWFpbmRlcicsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgezB9IHByb21wdCBmaWxlczogezF9LCBhbmQgezJ9IG1vcmUuXCIsIGZhaWxlZEZpbGVOYW1lcy5sZW5ndGggKyBoaWRkZW5GaWxlQ291bnQsIGZhaWxlZEZpbGVOYW1lcy5qb2luKCcsICcpLCBoaWRkZW5GaWxlQ291bnQpXG5cdFx0XHQ6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25GaWxlc0ZhaWxlZCcsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgezB9IHByb21wdCBmaWxlczogezF9LlwiLCBmYWlsZWRGaWxlTmFtZXMubGVuZ3RoLCBmYWlsZWRGaWxlTmFtZXMuam9pbignLCAnKSk7XG5cdH0sXG59O1xuXG4vKipcbiAqIFJlbG9jYXRlcyBhZ2VudHMgYW5kIGluc3RydWN0aW9ucyBrZXB0IGluIHRoZSBwcm9maWxlJ3MgVXNlciBEYXRhIHByb21wdHMgZm9sZGVyXG4gKiB0byB0aGUgYWN0aXZlIGhhcm5lc3Mgcm9vdHMuIFRoZXNlIGZpbGVzIGtlZXAgdGhlaXIgdHlwZSBhbmQgY29udGVudDsgb25seSB0aGVpclxuICogbG9jYXRpb24gY2hhbmdlcy4gVXNlciBEYXRhIHByb21wdCBmaWxlcyBhcmUgaW50ZW50aW9uYWxseSBsZWZ0IHRvXG4gKiB7QGxpbmsgcHJvbXB0RmlsZXNNaWdyYXRpb25DYXRlZ29yeX0gc28gZXZlcnkgcHJvbXB0IGZpbGUgaXMgY29udmVydGVkIGluIG9uZSBwbGFjZS5cbiAqL1xuY29uc3QgdXNlckRhdGFNaWdyYXRpb25DYXRlZ29yeTogSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSA9IHtcblx0aWQ6IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlVzZXJEYXRhLFxuXHRzb3VyY2VUeXBlczogW1Byb21wdHNUeXBlLmFnZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdLFxuXHRlbmFibGVtZW50U2V0dGluZzogQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zVXNlckRhdGFNaWdyYXRpb25FbmFibGVkLFxuXHRzaG9ydGN1dExhYmVsOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25TaG9ydGN1dExhYmVsJywgXCJNaWdyYXRlIFVzZXIgRGF0YVwiKSxcblx0c2hvcnRjdXRUb29sdGlwOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25TaG9ydGN1dFRvb2x0aXAnLCBcIk1vdmUgdXNlciBkYXRhIGFnZW50cyBhbmQgaW5zdHJ1Y3Rpb25zIHRvIHRoZSBhY3RpdmUgaGFybmVzc1wiKSxcblx0Y2FyZExhYmVsOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25DYXJkTGFiZWwnLCBcIk1pZ3JhdGUgVXNlciBEYXRhIEN1c3RvbWl6YXRpb25zXCIpLFxuXHRjYXJkQWN0aW9uTGFiZWw6IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkNhcmRBY3Rpb24nLCBcIk1pZ3JhdGUuLi5cIiksXG5cdGNhcmRBY3Rpb25BcmlhTGFiZWw6IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkNhcmRBY3Rpb25BcmlhTGFiZWwnLCBcIk1pZ3JhdGUgdXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIHRvIHRoZSBhY3RpdmUgaGFybmVzc1wiKSxcblx0cGFnZVRpdGxlOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25QYWdlVGl0bGUnLCBcIk1pZ3JhdGUgVXNlciBEYXRhIEN1c3RvbWl6YXRpb25zXCIpLFxuXHRwYWdlTGlua0xhYmVsOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25MZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgYWdlbnQgY3VzdG9taXphdGlvbnNcIiksXG5cdHBhZ2VMaW5rVXJsOiBDVVNUT01JWkFUSU9OX0RPQ1VNRU5UQVRJT05fVVJMLFxuXHRwYWdlRW1wdHlNZXNzYWdlOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25QYWdlRW1wdHknLCBcIk5vIHVzZXIgZGF0YSBjdXN0b21pemF0aW9ucyBhcmUgYXZhaWxhYmxlIHRvIG1pZ3JhdGUuXCIpLFxuXHRzZWFyY2hFbXB0eU1lc3NhZ2U6IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvblNlYXJjaEVtcHR5JywgXCJObyB1c2VyIGRhdGEgY3VzdG9taXphdGlvbnMgbWF0Y2ggeW91ciBzZWFyY2guXCIpLFxuXHRtaWdyYXRlQnV0dG9uVG9vbHRpcDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uUGFnZUJ1dHRvblRvb2x0aXAnLCBcIk1vdmUgdGhlIHNlbGVjdGVkIHVzZXIgZGF0YSBjdXN0b21pemF0aW9ucyB0byB0aGUgYWN0aXZlIGhhcm5lc3NcIiksXG5cdGJhY2tMYWJlbDogbG9jYWxpemUoJ2JhY2tUb1VzZXJEYXRhTWlncmF0aW9uJywgXCJCYWNrIHRvIE1pZ3JhdGUgVXNlciBEYXRhIEN1c3RvbWl6YXRpb25zXCIpLFxuXHRub0ZpbGVzTWlncmF0ZWRNZXNzYWdlOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25Ob0ZpbGVzTWlncmF0ZWQnLCBcIk5vIHVzZXIgZGF0YSBjdXN0b21pemF0aW9ucyB3ZXJlIG1pZ3JhdGVkLlwiKSxcblxuXHRpc0NhbmRpZGF0ZShjdXN0b21pemF0aW9uKSB7XG5cdFx0cmV0dXJuIGN1c3RvbWl6YXRpb24uc291cmNlID09PSBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhXG5cdFx0XHQmJiAoY3VzdG9taXphdGlvbi50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCB8fCBjdXN0b21pemF0aW9uLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdH0sXG5cblx0Z3JvdXAoY3VzdG9taXphdGlvbnMpIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRrZXk6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uQWdlbnRzR3JvdXAnLCBcIkFnZW50c1wiKSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IGN1c3RvbWl6YXRpb25zLmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2V5OiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25JbnN0cnVjdGlvbnNHcm91cCcsIFwiSW5zdHJ1Y3Rpb25zXCIpLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogY3VzdG9taXphdGlvbnMuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9LFxuXG5cdGdldFNob3J0Y3V0QXJpYUxhYmVsKGNvdW50KSB7XG5cdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvblNob3J0Y3V0QXJpYUxhYmVsU2luZ2xlJywgXCJVc2VyIGRhdGEsIDEgY3VzdG9taXphdGlvbiBuZWVkcyBtaWdyYXRpb25cIilcblx0XHRcdDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uU2hvcnRjdXRBcmlhTGFiZWxXaXRoQ291bnQnLCBcIlVzZXIgZGF0YSwgezB9IGN1c3RvbWl6YXRpb25zIG5lZWQgbWlncmF0aW9uXCIsIGNvdW50KTtcblx0fSxcblxuXHRnZXRDYXJkRGVzY3JpcHRpb24oY3VzdG9taXphdGlvbnMsIGhhcm5lc3NMYWJlbCkge1xuXHRcdGNvbnN0IHsgYWdlbnRDb3VudCwgaW5zdHJ1Y3Rpb25zQ291bnQsIHRvdGFsQ291bnQgfSA9IGNvdW50VXNlckRhdGFUeXBlcyhjdXN0b21pemF0aW9ucyk7XG5cdFx0aWYgKGFnZW50Q291bnQgPiAwICYmIGluc3RydWN0aW9uc0NvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHQndXNlckRhdGFNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25NaXhlZCcsXG5cdFx0XHRcdFwiVXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIGFyZSBvbmx5IHVzZWQgYnkgVlMgQ29kZS4gRm91bmQgezB9IGN1c3RvbWl6YXRpb25zIHRoYXQgezF9IGlnbm9yZXMuIE1vdmUgdGhlbSB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR0b3RhbENvdW50LCBoYXJuZXNzTGFiZWwsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoYWdlbnRDb3VudCA+IDApIHtcblx0XHRcdHJldHVybiBhZ2VudENvdW50ID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoXG5cdFx0XHRcdFx0J3VzZXJEYXRhTWlncmF0aW9uQ2FyZERlc2NyaXB0aW9uQWdlbnQnLFxuXHRcdFx0XHRcdFwiVXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIGFyZSBvbmx5IHVzZWQgYnkgVlMgQ29kZS4gRm91bmQgMSBhZ2VudCB0aGF0IHswfSBpZ25vcmVzLiBNb3ZlIGl0IHRvIGtlZXAgaXQgYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHRcdGhhcm5lc3NMYWJlbCxcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCd1c2VyRGF0YU1pZ3JhdGlvbkNhcmREZXNjcmlwdGlvbkFnZW50cycsXG5cdFx0XHRcdFx0XCJVc2VyIGRhdGEgY3VzdG9taXphdGlvbnMgYXJlIG9ubHkgdXNlZCBieSBWUyBDb2RlLiBGb3VuZCB7MH0gYWdlbnRzIHRoYXQgezF9IGlnbm9yZXMuIE1vdmUgdGhlbSB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHRcdGFnZW50Q291bnQsIGhhcm5lc3NMYWJlbCxcblx0XHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RydWN0aW9uc0NvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKFxuXHRcdFx0XHQndXNlckRhdGFNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25JbnN0cnVjdGlvbicsXG5cdFx0XHRcdFwiVXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIGFyZSBvbmx5IHVzZWQgYnkgVlMgQ29kZS4gRm91bmQgMSBpbnN0cnVjdGlvbiBmaWxlIHRoYXQgezB9IGlnbm9yZXMuIE1vdmUgaXQgdG8ga2VlcCBpdCBhdmFpbGFibGUuXCIsXG5cdFx0XHRcdGhhcm5lc3NMYWJlbCxcblx0XHRcdClcblx0XHRcdDogbG9jYWxpemUoXG5cdFx0XHRcdCd1c2VyRGF0YU1pZ3JhdGlvbkNhcmREZXNjcmlwdGlvbkluc3RydWN0aW9ucycsXG5cdFx0XHRcdFwiVXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIGFyZSBvbmx5IHVzZWQgYnkgVlMgQ29kZS4gRm91bmQgezB9IGluc3RydWN0aW9uIGZpbGVzIHRoYXQgezF9IGlnbm9yZXMuIE1vdmUgdGhlbSB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnNDb3VudCwgaGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0fSxcblxuXHRnZXRCYW5uZXIoY3VzdG9taXphdGlvbnMsIGhhcm5lc3NMYWJlbCkge1xuXHRcdGNvbnN0IHsgdG90YWxDb3VudCB9ID0gY291bnRVc2VyRGF0YVR5cGVzKGN1c3RvbWl6YXRpb25zKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0aXRsZTogdG90YWxDb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkJhbm5lclRpdGxlU2luZ2xlJywgXCIxIGN1c3RvbWl6YXRpb24gaXMgbm90IGF2YWlsYWJsZSB0byB7MH1cIiwgaGFybmVzc0xhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkJhbm5lclRpdGxlJywgXCJ7MH0gY3VzdG9taXphdGlvbnMgYXJlIG5vdCBhdmFpbGFibGUgdG8gezF9XCIsIHRvdGFsQ291bnQsIGhhcm5lc3NMYWJlbCksXG5cdFx0XHQvLyBUaGUgZ3JvdXBlZCBsaXN0IGJlbG93IGFscmVhZHkgYnJlYWtzIHRoZXNlIGRvd24gYnkgdHlwZSwgc28gdGhlXG5cdFx0XHQvLyBtZXNzYWdlIGV4cGxhaW5zIHRoZSBtb3ZlIHJhdGhlciB0aGFuIHJlcGVhdGluZyB0aGUgY291bnRzLlxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdCd1c2VyRGF0YU1pZ3JhdGlvbkJhbm5lck1lc3NhZ2UnLFxuXHRcdFx0XHRcIlRoZXkgYXJlIHN0b3JlZCBpbiB1c2VyIGRhdGEsIHdoaWNoIG9ubHkgVlMgQ29kZSByZWFkcy4gTWlncmF0aW5nIG1vdmVzIHRoZW0gaW50byB0aGUgZm9sZGVycyB7MH0gcmVhZHMsIGtlZXBpbmcgdGhlaXIgbmFtZSwgdHlwZSwgYW5kIGNvbnRlbnQsIHNvIHlvdSBjYW4ga2VlcCB1c2luZyB0aGVtLlwiLFxuXHRcdFx0XHRoYXJuZXNzTGFiZWwsXG5cdFx0XHQpLFxuXHRcdFx0Y29uc2VxdWVuY2U6IGxvY2FsaXplKFxuXHRcdFx0XHQndXNlckRhdGFNaWdyYXRpb25CYW5uZXJDb25zZXF1ZW5jZScsXG5cdFx0XHRcdFwiTWlncmF0ZWQgZmlsZXMgd29uJ3QgdXNlIFNldHRpbmdzIFN5bmMuIENvbW1pdCB0aGVtIHRvIGEgcmVwb3NpdG9yeSB0byBzaGFyZSB0aGVtLlwiLFxuXHRcdFx0KSxcblx0XHR9O1xuXHR9LFxuXG5cdGdldFBhZ2VEZXNjcmlwdGlvbihjdXN0b21pemF0aW9ucywgaGFybmVzc0xhYmVsKSB7XG5cdFx0Y29uc3QgeyBhZ2VudENvdW50LCBpbnN0cnVjdGlvbnNDb3VudCwgdG90YWxDb3VudCB9ID0gY291bnRVc2VyRGF0YVR5cGVzKGN1c3RvbWl6YXRpb25zKTtcblx0XHRpZiAodG90YWxDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvblBhZ2VEZXNjcmlwdGlvbicsIFwiU2VsZWN0IHVzZXIgZGF0YSBjdXN0b21pemF0aW9ucyB0byBtb3ZlIHRvIHRoZSBhY3RpdmUgaGFybmVzcy5cIik7XG5cdFx0fVxuXHRcdGlmIChhZ2VudENvdW50ID4gMCAmJiBpbnN0cnVjdGlvbnNDb3VudCA+IDApIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdFx0J3VzZXJEYXRhTWlncmF0aW9uUGFnZURlc2NyaXB0aW9uQWdlbnRzQW5kSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XCJGb3VuZCB7MH0gY3VzdG9taXphdGlvbnMgaW4gdXNlciBkYXRhIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgdXNlLCBidXQgezF9IGlnbm9yZXMuIE1vdmUgdGhlbSB0byB0aGUgaGFybmVzcyBmb2xkZXJzIHRvIGtlZXAgdGhlaXIgdHlwZSBhbmQgY29udGVudC5cIixcblx0XHRcdFx0dG90YWxDb3VudCwgaGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKGFnZW50Q291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gYWdlbnRDb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKFxuXHRcdFx0XHRcdCd1c2VyRGF0YU1pZ3JhdGlvblBhZ2VEZXNjcmlwdGlvbkFnZW50Jyxcblx0XHRcdFx0XHRcIkZvdW5kIDEgYWdlbnQgaW4gdXNlciBkYXRhIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgdXNlLCBidXQgezB9IGlnbm9yZXMuIE1vdmUgaXQgdG8gdGhlIGhhcm5lc3MgYWdlbnRzIGZvbGRlciB0byBrZWVwIGl0IGF2YWlsYWJsZS5cIixcblx0XHRcdFx0XHRoYXJuZXNzTGFiZWwsXG5cdFx0XHRcdClcblx0XHRcdFx0OiBsb2NhbGl6ZShcblx0XHRcdFx0XHQndXNlckRhdGFNaWdyYXRpb25QYWdlRGVzY3JpcHRpb25BZ2VudHMnLFxuXHRcdFx0XHRcdFwiRm91bmQgezB9IGFnZW50cyBpbiB1c2VyIGRhdGEgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCB1c2UsIGJ1dCB7MX0gaWdub3Jlcy4gTW92ZSB0aGVtIHRvIHRoZSBoYXJuZXNzIGFnZW50cyBmb2xkZXIgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdFx0XHRhZ2VudENvdW50LCBoYXJuZXNzTGFiZWwsXG5cdFx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiBpbnN0cnVjdGlvbnNDb3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZShcblx0XHRcdFx0J3VzZXJEYXRhTWlncmF0aW9uUGFnZURlc2NyaXB0aW9uSW5zdHJ1Y3Rpb24nLFxuXHRcdFx0XHRcIkZvdW5kIDEgaW5zdHJ1Y3Rpb24gZmlsZSBpbiB1c2VyIGRhdGEgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCB1c2UsIGJ1dCB7MH0gaWdub3Jlcy4gTW92ZSBpdCB0byB0aGUgaGFybmVzcyBpbnN0cnVjdGlvbnMgZm9sZGVyIHRvIGtlZXAgaXQgYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHRoYXJuZXNzTGFiZWwsXG5cdFx0XHQpXG5cdFx0XHQ6IGxvY2FsaXplKFxuXHRcdFx0XHQndXNlckRhdGFNaWdyYXRpb25QYWdlRGVzY3JpcHRpb25JbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcIkZvdW5kIHswfSBpbnN0cnVjdGlvbiBmaWxlcyBpbiB1c2VyIGRhdGEgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCB1c2UsIGJ1dCB7MX0gaWdub3Jlcy4gTW92ZSB0aGVtIHRvIHRoZSBoYXJuZXNzIGluc3RydWN0aW9ucyBmb2xkZXIgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zQ291bnQsIGhhcm5lc3NMYWJlbCxcblx0XHRcdCk7XG5cdH0sXG5cblx0Z2V0Q29uZmlybWF0aW9uKGN1c3RvbWl6YXRpb25zLCBoYXJuZXNzTGFiZWwpIHtcblx0XHRjb25zdCB7IGFnZW50Q291bnQsIGluc3RydWN0aW9uc0NvdW50LCB0b3RhbENvdW50IH0gPSBjb3VudFVzZXJEYXRhVHlwZXMoY3VzdG9taXphdGlvbnMpO1xuXHRcdGxldCBkZXRhaWw6IHN0cmluZztcblx0XHRpZiAoYWdlbnRDb3VudCA+IDAgJiYgaW5zdHJ1Y3Rpb25zQ291bnQgPiAwKSB7XG5cdFx0XHRkZXRhaWwgPSBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25Db25maXJtRGV0YWlsTWl4ZWQnLCBcIlRoaXMgbW92ZXMgezB9IGN1c3RvbWl6YXRpb25zIG91dCBvZiB1c2VyIGRhdGEuXCIsIHRvdGFsQ291bnQpO1xuXHRcdH0gZWxzZSBpZiAoYWdlbnRDb3VudCA+IDApIHtcblx0XHRcdGRldGFpbCA9IGFnZW50Q291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25Db25maXJtRGV0YWlsQWdlbnQnLCBcIlRoaXMgbW92ZXMgMSBhZ2VudCBvdXQgb2YgdXNlciBkYXRhLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkNvbmZpcm1EZXRhaWxBZ2VudHMnLCBcIlRoaXMgbW92ZXMgezB9IGFnZW50cyBvdXQgb2YgdXNlciBkYXRhLlwiLCBhZ2VudENvdW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGV0YWlsID0gaW5zdHJ1Y3Rpb25zQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25Db25maXJtRGV0YWlsSW5zdHJ1Y3Rpb24nLCBcIlRoaXMgbW92ZXMgMSBpbnN0cnVjdGlvbiBmaWxlIG91dCBvZiB1c2VyIGRhdGEuXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uQ29uZmlybURldGFpbEluc3RydWN0aW9ucycsIFwiVGhpcyBtb3ZlcyB7MH0gaW5zdHJ1Y3Rpb24gZmlsZXMgb3V0IG9mIHVzZXIgZGF0YS5cIiwgaW5zdHJ1Y3Rpb25zQ291bnQpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uQ29uZmlybU1lc3NhZ2UnLCBcIk1pZ3JhdGUgdXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIHRvIHswfT9cIiwgaGFybmVzc0xhYmVsKSxcblx0XHRcdGRldGFpbCxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCd1c2VyRGF0YU1pZ3JhdGlvbkNvbmZpcm1CdXR0b24nLCBcIk1pZ3JhdGVcIiksXG5cdFx0XHRkZWxldGVPcmlnaW5hbHNMYWJlbDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uRGVsZXRlT3JpZ2luYWxGaWxlc0NoZWNrYm94JywgXCJEZWxldGUgdGhlIG9yaWdpbmFsIGZpbGVzIGZyb20gdXNlciBkYXRhIGFmdGVyIG1pZ3JhdGlvblwiKSxcblx0XHR9O1xuXHR9LFxuXG5cdGdldE1pZ3JhdGVkTWVzc2FnZShtaWdyYXRlZENvdW50KSB7XG5cdFx0cmV0dXJuIG1pZ3JhdGVkQ291bnQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uQ29tcGxldGVkU2luZ2xlJywgXCJNaWdyYXRlZCAxIHVzZXIgZGF0YSBjdXN0b21pemF0aW9uLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25Db21wbGV0ZWQnLCBcIk1pZ3JhdGVkIHswfSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbnMuXCIsIG1pZ3JhdGVkQ291bnQpO1xuXHR9LFxuXG5cdGdldEZhaWxlZE1lc3NhZ2UoZmFpbGVkRmlsZU5hbWVzLCBoaWRkZW5GaWxlQ291bnQpIHtcblx0XHRjb25zdCBmYWlsZWRDb3VudCA9IGZhaWxlZEZpbGVOYW1lcy5sZW5ndGggKyBoaWRkZW5GaWxlQ291bnQ7XG5cdFx0aWYgKGZhaWxlZENvdW50ID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uRmlsZUZhaWxlZCcsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgMSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbjogezB9LlwiLCBmYWlsZWRGaWxlTmFtZXNbMF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaGlkZGVuRmlsZUNvdW50ID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgndXNlckRhdGFNaWdyYXRpb25GaWxlc0ZhaWxlZFdpdGhSZW1haW5kZXInLCBcIkZhaWxlZCB0byBtaWdyYXRlIHswfSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbnM6IHsxfSwgYW5kIHsyfSBtb3JlLlwiLCBmYWlsZWRDb3VudCwgZmFpbGVkRmlsZU5hbWVzLmpvaW4oJywgJyksIGhpZGRlbkZpbGVDb3VudClcblx0XHRcdDogbG9jYWxpemUoJ3VzZXJEYXRhTWlncmF0aW9uRmlsZXNGYWlsZWQnLCBcIkZhaWxlZCB0byBtaWdyYXRlIHswfSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbnM6IHsxfS5cIiwgZmFpbGVkQ291bnQsIGZhaWxlZEZpbGVOYW1lcy5qb2luKCcsICcpKTtcblx0fSxcbn07XG5cbmV4cG9ydCBjb25zdCBDVVNUT01JWkFUSU9OX01JR1JBVElPTl9DQVRFR09SSUVTOiByZWFkb25seSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5W10gPSBbXG5cdHByb21wdEZpbGVzTWlncmF0aW9uQ2F0ZWdvcnksXG5cdHVzZXJEYXRhTWlncmF0aW9uQ2F0ZWdvcnksXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5KGlkOiBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCk6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnkge1xuXHRjb25zdCBjYXRlZ29yeSA9IENVU1RPTUlaQVRJT05fTUlHUkFUSU9OX0NBVEVHT1JJRVMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBpZCk7XG5cdGlmICghY2F0ZWdvcnkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY3VzdG9taXphdGlvbiBtaWdyYXRpb24gY2F0ZWdvcnk6ICR7aWR9YCk7XG5cdH1cblx0cmV0dXJuIGNhdGVnb3J5O1xufVxuXG4vKipcbiAqIEFsbCBwcm9tcHQgdHlwZXMgdGhlIGdpdmVuIGNhdGVnb3JpZXMgY2FuIGRpc2NvdmVyLCBzbyBjYW5kaWRhdGVzIGNhbiBiZSBjb2xsZWN0ZWQgd2l0aCBvbmUgcGFzcyBwZXIgdHlwZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEN1c3RvbWl6YXRpb25NaWdyYXRpb25Tb3VyY2VUeXBlcyhjYXRlZ29yaWVzOiByZWFkb25seSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5W10pOiByZWFkb25seSBQcm9tcHRzVHlwZVtdIHtcblx0cmV0dXJuIEFycmF5LmZyb20obmV3IFNldChjYXRlZ29yaWVzLmZsYXRNYXAoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuc291cmNlVHlwZXMpKSk7XG59XG5cbmZ1bmN0aW9uIGNvdW50UHJvbXB0U3RvcmFnZXMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10pOiB7IHdvcmtzcGFjZUNvdW50OiBudW1iZXI7IHVzZXJDb3VudDogbnVtYmVyOyB0b3RhbENvdW50OiBudW1iZXIgfSB7XG5cdGNvbnN0IHdvcmtzcGFjZUNvdW50ID0gY3VzdG9taXphdGlvbnMuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCkubGVuZ3RoO1xuXHRjb25zdCB1c2VyQ291bnQgPSBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpLmxlbmd0aDtcblx0cmV0dXJuIHsgd29ya3NwYWNlQ291bnQsIHVzZXJDb3VudCwgdG90YWxDb3VudDogd29ya3NwYWNlQ291bnQgKyB1c2VyQ291bnQgfTtcbn1cblxuZnVuY3Rpb24gY291bnRVc2VyRGF0YVR5cGVzKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBJUHJvbXB0UGF0aFtdKTogeyBhZ2VudENvdW50OiBudW1iZXI7IGluc3RydWN0aW9uc0NvdW50OiBudW1iZXI7IHRvdGFsQ291bnQ6IG51bWJlciB9IHtcblx0Y29uc3QgYWdlbnRDb3VudCA9IGN1c3RvbWl6YXRpb25zLmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLmxlbmd0aDtcblx0Y29uc3QgaW5zdHJ1Y3Rpb25zQ291bnQgPSBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykubGVuZ3RoO1xuXHRyZXR1cm4geyBhZ2VudENvdW50LCBpbnN0cnVjdGlvbnNDb3VudCwgdG90YWxDb3VudDogYWdlbnRDb3VudCArIGluc3RydWN0aW9uc0NvdW50IH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBc0Isc0JBQXNCO0FBRXJDLElBQVcsbUNBQVgsa0JBQVdBLHNDQUFYO0FBQ04sRUFBQUEsa0NBQUEsaUJBQWM7QUFDZCxFQUFBQSxrQ0FBQSxjQUFXO0FBRk0sU0FBQUE7QUFBQSxHQUFBO0FBaUVsQixNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLGtDQUFrQztBQU14QyxNQUFNLCtCQUFnRTtBQUFBLEVBQ3JFLElBQUk7QUFBQSxFQUNKLGFBQWEsQ0FBQyxZQUFZLE1BQU07QUFBQSxFQUNoQyxtQkFBbUIsa0JBQWtCO0FBQUEsRUFDckMsZUFBZSxTQUFTLGdDQUFnQyxpQkFBaUI7QUFBQSxFQUN6RSxpQkFBaUIsU0FBUyxrQ0FBa0MsMkNBQTJDO0FBQUEsRUFDdkcsV0FBVyxTQUFTLDRCQUE0QixzQkFBc0I7QUFBQSxFQUN0RSxpQkFBaUIsU0FBUyw2QkFBNkIsc0JBQXNCO0FBQUEsRUFDN0UscUJBQXFCLFNBQVMsc0NBQXNDLGdDQUFnQztBQUFBLEVBQ3BHLFdBQVcsU0FBUyw0QkFBNEIsc0JBQXNCO0FBQUEsRUFDdEUsZUFBZSxTQUFTLDRCQUE0QiwrQkFBK0I7QUFBQSxFQUNuRixhQUFhO0FBQUEsRUFDYixrQkFBa0IsU0FBUyw0QkFBNEIsMkNBQTJDO0FBQUEsRUFDbEcsb0JBQW9CLFNBQVMsOEJBQThCLG9DQUFvQztBQUFBLEVBQy9GLHNCQUFzQixTQUFTLG9DQUFvQyx5Q0FBeUM7QUFBQSxFQUM1RyxXQUFXLFNBQVMseUJBQXlCLDhCQUE4QjtBQUFBLEVBQzNFLHdCQUF3QixTQUFTLG1DQUFtQyxpQ0FBaUM7QUFBQSxFQUVyRyxZQUFZLGVBQWU7QUFDMUIsV0FBTyxj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QUFTLHFDQUFxQyxZQUFnRjtBQUNwSSxTQUFPLE1BQU0sS0FBSyxJQUFJLElBQUksV0FBVyxRQUFRLGNBQVksU0FBUyxXQUFXLENBQUMsQ0FBQztBQUNoRjtBQUVBLFNBQVMsb0JBQW9CLGdCQUEyRztBQUN2SSxRQUFNLGlCQUFpQixlQUFlLE9BQU8sbUJBQWlCLGNBQWMsWUFBWSxlQUFlLEtBQUssRUFBRTtBQUM5RyxRQUFNLFlBQVksZUFBZSxPQUFPLG1CQUFpQixjQUFjLFlBQVksZUFBZSxJQUFJLEVBQUU7QUFDeEcsU0FBTyxFQUFFLGdCQUFnQixXQUFXLFlBQVksaUJBQWlCLFVBQVU7QUFDNUU7QUFFQSxTQUFTLG1CQUFtQixnQkFBK0c7QUFDMUksUUFBTSxhQUFhLGVBQWUsT0FBTyxtQkFBaUIsY0FBYyxTQUFTLFlBQVksS0FBSyxFQUFFO0FBQ3BHLFFBQU0sb0JBQW9CLGVBQWUsT0FBTyxtQkFBaUIsY0FBYyxTQUFTLFlBQVksWUFBWSxFQUFFO0FBQ2xILFNBQU8sRUFBRSxZQUFZLG1CQUFtQixZQUFZLGFBQWEsa0JBQWtCO0FBQ3BGOyIsCiAgIm5hbWVzIjogWyJDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCJdCn0K
