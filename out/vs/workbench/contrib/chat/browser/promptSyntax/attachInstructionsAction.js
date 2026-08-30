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
import { ChatViewId } from "../chat.js";
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from "../actions/chatActions.js";
import { localize, localize2 } from "../../../../../nls.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
import { PromptFilePickers } from "./pickers/promptFilePickers.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { getCleanPromptName } from "../../common/promptSyntax/config/promptFileLocations.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { compare } from "../../../../../base/common/strings.js";
import { PromptFileVariableKind, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
const ATTACH_INSTRUCTIONS_ACTION_ID = "workbench.action.chat.attach.instructions";
const CONFIGURE_INSTRUCTIONS_ACTION_ID = "workbench.action.chat.configure.instructions";
class ManageInstructionsFilesAction extends Action2 {
  constructor() {
    super({
      id: CONFIGURE_INSTRUCTIONS_ACTION_ID,
      title: localize2("configure-instructions", "Configure Instructions & Rules..."),
      shortTitle: localize2("configure-instructions.short", "Instructions & Rules"),
      icon: Codicon.bookmark,
      f1: true,
      precondition: ChatContextKeys.enabled,
      category: CHAT_CATEGORY,
      menu: {
        id: CHAT_CONFIG_MENU_ID,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
        order: 10,
        group: "1_level"
      }
    });
  }
  async run(accessor) {
    const openerService = accessor.get(IOpenerService);
    const instaService = accessor.get(IInstantiationService);
    const pickers = instaService.createInstance(PromptFilePickers);
    const placeholder = localize(
      "commands.prompt.manage-dialog.placeholder",
      "Select the instructions file to open"
    );
    const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.instructions, optionEdit: false });
    if (result !== void 0) {
      await openerService.open(result.promptFile);
    }
  }
}
function registerAttachPromptActions() {
  registerAction2(ManageInstructionsFilesAction);
}
let ChatInstructionsPickerPick = class {
  constructor(promptsService) {
    this.promptsService = promptsService;
    this.type = "pickerPick";
    this.label = localize("chatContext.attach.instructions.label", "Instructions...");
    this.icon = Codicon.bookmark;
    this.commandId = ATTACH_INSTRUCTIONS_ACTION_ID;
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsInstructionAttachments;
  }
  asPicker() {
    const picks = this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None).then((value) => {
      const result = [];
      value = value.slice(0).sort((a, b) => compare(a.storage, b.storage));
      let storageType;
      for (const promptsPath of value) {
        if (storageType !== promptsPath.storage) {
          storageType = promptsPath.storage;
          result.push({
            type: "separator",
            label: this.promptsService.getPromptLocationLabel(promptsPath)
          });
        }
        result.push({
          label: promptsPath.name ?? getCleanPromptName(promptsPath.uri),
          asAttachment: () => {
            return toPromptFileVariableEntry(promptsPath.uri, PromptFileVariableKind.Instruction);
          }
        });
      }
      return result;
    });
    return {
      placeholder: localize("placeholder", "Select instructions files to attach"),
      picks,
      configure: {
        label: localize("configureInstructions", "Configure Instructions..."),
        commandId: CONFIGURE_INSTRUCTIONS_ACTION_ID
      }
    };
  }
};
ChatInstructionsPickerPick = __decorateClass([
  __decorateParam(0, IPromptsService)
], ChatInstructionsPickerPick);
export {
  ATTACH_INSTRUCTIONS_ACTION_ID,
  CONFIGURE_INSTRUCTIONS_ACTION_ID,
  ChatInstructionsPickerPick,
  registerAttachPromptActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcYXR0YWNoSW5zdHJ1Y3Rpb25zQWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlksIENIQVRfQ09ORklHX01FTlVfSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlUGlja2VycyB9IGZyb20gJy4vcGlja2Vycy9wcm9tcHRGaWxlUGlja2Vycy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja2VySXRlbSwgSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0sIElDaGF0Q29udGV4dFBpY2tlciB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdldENsZWFuUHJvbXB0TmFtZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQsIHRvUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcblxuLyoqXG4gKiBBY3Rpb24gSUQgZm9yIHRoZSBgQXR0YWNoIEluc3RydWN0aW9uYCBhY3Rpb24uXG4gKi9cbmV4cG9ydCBjb25zdCBBVFRBQ0hfSU5TVFJVQ1RJT05TX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoLmluc3RydWN0aW9ucyc7XG5cbi8qKlxuICogQWN0aW9uIElEIGZvciB0aGUgYENvbmZpZ3VyZSBJbnN0cnVjdGlvbmAgYWN0aW9uLlxuICovXG5leHBvcnQgY29uc3QgQ09ORklHVVJFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvbmZpZ3VyZS5pbnN0cnVjdGlvbnMnO1xuXG5cbmNsYXNzIE1hbmFnZUluc3RydWN0aW9uc0ZpbGVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDT05GSUdVUkVfSU5TVFJVQ1RJT05TX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbmZpZ3VyZS1pbnN0cnVjdGlvbnMnLCBcIkNvbmZpZ3VyZSBJbnN0cnVjdGlvbnMgJiBSdWxlcy4uLlwiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignY29uZmlndXJlLWluc3RydWN0aW9ucy5zaG9ydCcsIFwiSW5zdHJ1Y3Rpb25zICYgUnVsZXNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmJvb2ttYXJrLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpKSxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHRncm91cDogJzFfbGV2ZWwnXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBpY2tlcnMgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZVBpY2tlcnMpO1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBsb2NhbGl6ZShcblx0XHRcdCdjb21tYW5kcy5wcm9tcHQubWFuYWdlLWRpYWxvZy5wbGFjZWhvbGRlcicsXG5cdFx0XHQnU2VsZWN0IHRoZSBpbnN0cnVjdGlvbnMgZmlsZSB0byBvcGVuJ1xuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwaWNrZXJzLnNlbGVjdFByb21wdEZpbGUoeyBwbGFjZWhvbGRlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBvcHRpb25FZGl0OiBmYWxzZSB9KTtcblx0XHRpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihyZXN1bHQucHJvbXB0RmlsZSk7XG5cdFx0fVxuXG5cdH1cbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gcmVnaXN0ZXIgdGhlIGBBdHRhY2ggUHJvbXB0YCBhY3Rpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF0dGFjaFByb21wdEFjdGlvbnMoKTogdm9pZCB7XG5cdHJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VJbnN0cnVjdGlvbnNGaWxlc0FjdGlvbik7XG59XG5cblxuZXhwb3J0IGNsYXNzIENoYXRJbnN0cnVjdGlvbnNQaWNrZXJQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoLmluc3RydWN0aW9ucy5sYWJlbCcsICdJbnN0cnVjdGlvbnMuLi4nKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uYm9va21hcms7XG5cdHJlYWRvbmx5IGNvbW1hbmRJZCA9IEFUVEFDSF9JTlNUUlVDVElPTlNfQUNUSU9OX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogUHJvbWlzZTxib29sZWFuPiB8IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzSW5zdHJ1Y3Rpb25BdHRhY2htZW50cztcblx0fVxuXG5cdGFzUGlja2VyKCk6IElDaGF0Q29udGV4dFBpY2tlciB7XG5cblx0XHRjb25zdCBwaWNrcyA9IHRoaXMucHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbih2YWx1ZSA9PiB7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogKElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXG5cdFx0XHR2YWx1ZSA9IHZhbHVlLnNsaWNlKDApLnNvcnQoKGEsIGIpID0+IGNvbXBhcmUoYS5zdG9yYWdlLCBiLnN0b3JhZ2UpKTtcblxuXHRcdFx0bGV0IHN0b3JhZ2VUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgcHJvbXB0c1BhdGggb2YgdmFsdWUpIHtcblxuXHRcdFx0XHRpZiAoc3RvcmFnZVR5cGUgIT09IHByb21wdHNQYXRoLnN0b3JhZ2UpIHtcblx0XHRcdFx0XHRzdG9yYWdlVHlwZSA9IHByb21wdHNQYXRoLnN0b3JhZ2U7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdFx0XHRsYWJlbDogdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQcm9tcHRMb2NhdGlvbkxhYmVsKHByb21wdHNQYXRoKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBwcm9tcHRzUGF0aC5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZShwcm9tcHRzUGF0aC51cmkpLFxuXHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeShwcm9tcHRzUGF0aC51cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuSW5zdHJ1Y3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgncGxhY2Vob2xkZXInLCAnU2VsZWN0IGluc3RydWN0aW9ucyBmaWxlcyB0byBhdHRhY2gnKSxcblx0XHRcdHBpY2tzLFxuXHRcdFx0Y29uZmlndXJlOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlSW5zdHJ1Y3Rpb25zJywgJ0NvbmZpZ3VyZSBJbnN0cnVjdGlvbnMuLi4nKSxcblx0XHRcdFx0Y29tbWFuZElkOiBDT05GSUdVUkVfSU5TVFJVQ1RJT05TX0FDVElPTl9JRFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxlQUFlLDJCQUEyQjtBQUNuRCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFtQyx3QkFBd0IsaUNBQWlDO0FBQzVGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBS3hCLE1BQU0sZ0NBQWdDO0FBS3RDLE1BQU0sbUNBQW1DO0FBR2hELE1BQU0sc0NBQXNDLFFBQVE7QUFBQSxFQUNuRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLDBCQUEwQixtQ0FBbUM7QUFBQSxNQUM5RSxZQUFZLFVB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
