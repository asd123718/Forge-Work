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
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../editor/common/core/range.js";
import { OffsetRange } from "../../../../editor/common/core/ranges/offsetRange.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { getCommandArgumentHint, getCompletionAction } from "../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { AgentHostCompletionReferenceKind, getAgentHostCompletionReferenceKind, isAgentHostCompletionVariableEntry, isPastedTextArtifact, toAgentHostCompletionVariableEntry } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { chatVariableLeader } from "../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js";
import { AgentHostInputCompletionsBase } from "../../../../workbench/contrib/chat/browser/widget/input/editor/agentHostInputCompletionsBase.js";
import { getInputPlaceholderColor, getRangeForPlaceholder } from "../../../../workbench/contrib/chat/browser/widget/input/editor/chatInputPlaceholderDecoration.js";
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from "../../../../workbench/contrib/chat/browser/agentHostCompletionAction.js";
import { isAgentHostProvider } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
const ADD_REFERENCE_COMMAND = "sessions.chat.addAgentHostReference";
CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg) => {
  arg.handler.acceptCompletion(arg.entry, arg.insertText, arg.range);
});
const CONFIG_ACTION_COMMAND = "sessions.chat.applyAgentHostConfigAction";
CommandsRegistry.registerCommand(CONFIG_ACTION_COMMAND, async (accessor, arg) => {
  await arg.handler.applyConfigAction(accessor, arg);
});
function getAgentHostCompletionAttachmentRange(value, referenceText, preferredRange, messageOffset, messageLength) {
  if (!referenceText) {
    return void 0;
  }
  let bestIndex = -1;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  let from = 0;
  const endsWithDigit = /\d$/.test(referenceText);
  while (true) {
    const index = value.indexOf(referenceText, from);
    if (index < 0) {
      break;
    }
    from = index + referenceText.length;
    if (endsWithDigit && /\d/.test(value.charAt(from))) {
      continue;
    }
    const distance = preferredRange ? Math.abs(index - preferredRange.start) : index;
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  if (bestIndex < 0) {
    return void 0;
  }
  const start = bestIndex - messageOffset;
  const endExclusive = start + referenceText.length;
  if (start < 0 || endExclusive > messageLength) {
    return void 0;
  }
  return new OffsetRange(start, endExclusive);
}
function getCommandArgumentHintPlaceholder(value, attachments, insertedReferences) {
  for (const entry of attachments) {
    if (getAgentHostCompletionReferenceKind(entry) !== AgentHostCompletionReferenceKind.Command) {
      continue;
    }
    const argumentHint = getCommandArgumentHint(entry._meta);
    if (!argumentHint) {
      continue;
    }
    const reference = insertedReferences.get(entry.id);
    if (!reference) {
      continue;
    }
    const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
    if (!range) {
      continue;
    }
    if (value.slice(0, range.start).trim().length > 0 || value.slice(range.endExclusive) !== " ") {
      return void 0;
    }
    return { argumentHint, endOffset: range.endExclusive };
  }
  return void 0;
}
let AgentHostInputCompletionHandler = class extends AgentHostInputCompletionsBase {
  constructor(_editor, _contextAttachments, languageFeaturesService, _sessionContext, chatSessionsService, _codeEditorService, _themeService, _configurationService) {
    super(languageFeaturesService, chatSessionsService);
    this._editor = _editor;
    this._contextAttachments = _contextAttachments;
    this._sessionContext = _sessionContext;
    this._codeEditorService = _codeEditorService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._registration = this._register(new MutableDisposable());
    /**
     * Inserted reference per accepted attachment id. Used to find and decorate
     * the accepted occurrence in the editor and dropped when the user removes
     * the attachment chip.
     */
    this._insertedReferences = /* @__PURE__ */ new Map();
    /** Ids whose inline reference should be removed with the attachment. */
    this._artifactReferenceIds = /* @__PURE__ */ new Set();
    this._register(this._codeEditorService.registerDecorationType(AgentHostInputCompletionHandler._argumentHintDecorationDescription, AgentHostInputCompletionHandler._argumentHintDecorationType, {}));
    this._decorations = this._editor.createDecorationsCollection();
    this._registerDecorations();
    let currentScheme;
    this._register(autorun((reader) => {
      const session = this._sessionContext.session.read(reader);
      const scheme = session ? getChatSessionType(session.resource) : void 0;
      if (scheme === currentScheme) {
        return;
      }
      currentScheme = scheme;
      this._registration.clear();
      if (scheme && isAgentHostTarget(scheme)) {
        void this._registerForScheme(scheme);
      }
    }));
  }
  async _registerForScheme(scheme) {
    const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
    if (!triggerCharacters || triggerCharacters.length === 0) {
      return;
    }
    const activeSession = this._sessionContext.session.get();
    if (!activeSession || getChatSessionType(activeSession.resource) !== scheme) {
      return;
    }
    const editorUri = this._editor.getModel()?.uri;
    if (!editorUri) {
      return;
    }
    this._registration.value = this._registerProvider(
      { scheme: editorUri.scheme, hasAccessToAllModels: true },
      `sessionsAgentHostInputCompletions[${scheme}]`,
      triggerCharacters,
      scheme
    );
  }
  _resolveContext(model, scheme) {
    if (/^\s*\/troubleshoot\b/.test(model.getValue())) {
      return void 0;
    }
    const session = this._sessionContext.session.get();
    if (!session) {
      return void 0;
    }
    const sessionResource = session.resource;
    if (getChatSessionType(sessionResource) !== scheme) {
      return void 0;
    }
    return { sessionResource, context: void 0 };
  }
  _buildItem(position, item) {
    const replaceRange = AgentHostInputCompletionHandler.computeRange(position, item);
    const attachment = item.attachment;
    switch (attachment.kind) {
      case "command": {
        const action = getCompletionAction(attachment._meta);
        if (action) {
          if (isPolicyBlockedCompletionAction(action, this._configurationService)) {
            return void 0;
          }
          const keep = item.insertText !== "";
          const label = item.label ?? item.insertText;
          const referenceText2 = item.insertText.trimEnd();
          const entry2 = keep ? toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, referenceText2, attachment.command, attachment._meta) : void 0;
          return {
            label: { label, description: attachment.description },
            insertText: item.insertText,
            filterText: label,
            range: replaceRange,
            kind: CompletionItemKind.Text,
            documentation: attachment.description,
            command: {
              id: CONFIG_ACTION_COMMAND,
              title: "",
              arguments: [{
                handler: this,
                action,
                entry: entry2,
                referenceText: referenceText2,
                referenceRange: entry2 ? this._toOffsetRange(replaceRange.replace, referenceText2) : void 0
              }]
            }
          };
        }
        const referenceText = item.insertText.trimEnd();
        const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, referenceText, attachment.command, attachment._meta);
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          documentation: attachment.description,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: referenceText,
              range: this._toOffsetRange(replaceRange.replace, referenceText)
            }]
          }
        };
      }
      case "skill": {
        const referenceText = item.insertText.trimEnd();
        const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, referenceText, attachment.uri, attachment._meta);
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          documentation: attachment.description,
          kind: CompletionItemKind.Text,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: referenceText,
              range: this._toOffsetRange(replaceRange.replace, referenceText)
            }]
          }
        };
      }
      case "chat": {
        return void 0;
      }
      default: {
        const label = attachment.displayName ?? item.insertText;
        const description = attachment.uri.path;
        const kind = attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File;
        const entry = {
          id: attachment.uri.toString(),
          name: attachment.displayName ?? this._basename(attachment.uri),
          value: attachment.uri,
          kind: attachment.isDirectory ? "directory" : "file",
          _meta: attachment._meta
        };
        return {
          label: { label, description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: item.insertText,
              range: this._toOffsetRange(replaceRange.replace, item.insertText)
            }]
          }
        };
      }
    }
  }
  _basename(uri) {
    const idx = uri.path.lastIndexOf("/");
    return idx >= 0 ? uri.path.slice(idx + 1) : uri.path;
  }
  // --- Attachment + decoration bridging ---
  /**
   * Called when the user accepts an item from the Monaco completion
   * widget (via the registered command). Adds the resource to the
   * context attachments and tracks the inserted text so it can be
   * highlighted in the editor.
   */
  acceptCompletion(entry, insertText, range) {
    this._insertedReferences.set(entry.id, { text: insertText, range });
    this._contextAttachments.setAttachments([...this._contextAttachments.attachments.filter((e) => e.id !== entry.id), entry]);
    this._updateDecorations();
  }
  /**
   * Accept handler for config-action completions (permission/mode toggles).
   * Applies the session-config change (gated by the elevated-permission
   * confirmation for `autoApprove`) via this input's scoped session's
   * agent-host provider. Keep-text items (non-empty insertText) then add their
   * argument-hint reference; toggle items insert nothing, so there is no text
   * to remove.
   */
  async applyConfigAction(accessor, arg) {
    const session = this._sessionContext.session.get();
    if (!session) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const sessionsProvidersService = accessor.get(ISessionsProvidersService);
    const applied = await applyAgentHostCompletionAction(arg.action, dialogService, storageService, async (config) => {
      const provider = sessionsProvidersService.getProvider(session.providerId);
      if (provider && isAgentHostProvider(provider)) {
        await Promise.all(Object.entries(config).map(([key, value]) => provider.setSessionConfigValue(session.sessionId, key, value).catch(() => {
        })));
      }
    });
    if (applied && arg.entry) {
      this.acceptCompletion(arg.entry, arg.referenceText, arg.referenceRange);
    }
  }
  getAttachmentsForSend(messageText, messageOffset = 0) {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const messageLength = messageText?.length ?? value.length;
    const result = [];
    for (const entry of this._contextAttachments.attachments) {
      const reference = this._insertedReferences.get(entry.id) ?? (isAgentHostCompletionVariableEntry(entry) ? { text: entry.name, range: void 0 } : void 0);
      if (!reference) {
        if (!isPastedTextArtifact(entry) || !entry.range) {
          result.push(entry);
        }
        continue;
      }
      const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, messageOffset, messageLength);
      if (!range) {
        if (!isAgentHostCompletionVariableEntry(entry) && (!isPastedTextArtifact(entry) || !entry.range)) {
          result.push(entry);
        }
        continue;
      }
      result.push({ ...entry, range });
    }
    return result;
  }
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._register(this._contextAttachments.onDidChangeContext(() => this._updateDecorations()));
    this._updateDecorations();
  }
  /**
   * Drops tracking for a reference without touching the input text, for callers
   * that remove that text themselves. The paste pipeline's undo does: the undo
   * stack removes the pasted reference text as its own step, so the chip-removal
   * cleanup below must not run a competing edit while that undo is unwinding.
   */
  forgetReference(id) {
    this._insertedReferences.delete(id);
    this._artifactReferenceIds.delete(id);
  }
  /** Removes an inline reference's text, including one trailing space. */
  _removeReferenceText(text, preferredRange) {
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    const value = model.getValue();
    const range = getAgentHostCompletionAttachmentRange(value, text, preferredRange, 0, value.length);
    if (!range) {
      return;
    }
    const endExclusive = value.charAt(range.endExclusive) === " " ? range.endExclusive + 1 : range.endExclusive;
    const start = model.getPositionAt(range.start);
    const end = model.getPositionAt(endExclusive);
    this._editor.executeEdits("sessionsChat.removeAttachmentReference", [{
      range: Range.fromPositions(start, end),
      text: ""
    }]);
  }
  _updateDecorations() {
    const attachedIds = new Set(this._contextAttachments.attachments.map((a) => a.id));
    for (const id of [...this._insertedReferences.keys()]) {
      if (!attachedIds.has(id)) {
        const removed = this._insertedReferences.get(id);
        this._insertedReferences.delete(id);
        if (removed && this._artifactReferenceIds.delete(id)) {
          this._removeReferenceText(removed.text, removed.range);
        }
      }
    }
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    const value = model.getValue();
    const orphanedArtifacts = [];
    for (const entry of this._contextAttachments.attachments) {
      if (!isPastedTextArtifact(entry) || !entry.range) {
        continue;
      }
      const text = `${chatVariableLeader}attachment:${entry.name}`;
      const preferredRange = new OffsetRange(entry.range.start, entry.range.endExclusive);
      const range = getAgentHostCompletionAttachmentRange(value, text, preferredRange, 0, value.length);
      if (range) {
        this._artifactReferenceIds.add(entry.id);
        this._insertedReferences.set(entry.id, { text, range });
      } else {
        orphanedArtifacts.push(entry.id);
      }
    }
    for (const id of orphanedArtifacts) {
      this._insertedReferences.delete(id);
      this._contextAttachments.removeAttachment(id);
    }
    const decos = [];
    for (const reference of this._insertedReferences.values()) {
      const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
      if (!range) {
        continue;
      }
      const startPos = model.getPositionAt(range.start);
      const endPos = model.getPositionAt(range.endExclusive);
      decos.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        },
        options: { description: "sessions-agent-host-reference", inlineClassName: AgentHostInputCompletionHandler._className }
      });
    }
    this._decorations.set(decos);
    this._editor.setDecorationsByType(
      AgentHostInputCompletionHandler._argumentHintDecorationDescription,
      AgentHostInputCompletionHandler._argumentHintDecorationType,
      this._getArgumentHintDecorations(model, value)
    );
  }
  /**
   * Computes the inline placeholder (ghost text) shown after an accepted
   * agent-host slash command whose `_meta` carries an argument hint. Shown
   * only while the command is the sole content followed by a single trailing
   * space (i.e. before any argument has been typed).
   */
  _getArgumentHintDecorations(model, value) {
    const placeholder = getCommandArgumentHintPlaceholder(value, this._contextAttachments.attachments, this._insertedReferences);
    if (!placeholder) {
      return [];
    }
    const endPos = model.getPositionAt(placeholder.endOffset);
    return [{
      range: getRangeForPlaceholder({ startLineNumber: endPos.lineNumber, endLineNumber: endPos.lineNumber, startColumn: endPos.column, endColumn: endPos.column }),
      renderOptions: { after: { contentText: placeholder.argumentHint, color: getInputPlaceholderColor(this._themeService) } }
    }];
  }
  _toOffsetRange(range, insertText) {
    const model = this._editor.getModel();
    if (!model) {
      return void 0;
    }
    const start = model.getOffsetAt(range.getStartPosition());
    return new OffsetRange(start, start + insertText.length);
  }
};
AgentHostInputCompletionHandler._className = "sessions-agent-host-reference";
AgentHostInputCompletionHandler._argumentHintDecorationDescription = "sessions-chat";
AgentHostInputCompletionHandler._argumentHintDecorationType = "sessions-command-argument-hint";
AgentHostInputCompletionHandler = __decorateClass([
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ISessionContext),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IConfigurationService)
], AgentHostInputCompletionHandler);
export {
  AgentHostInputCompletionHandler,
  getAgentHostCompletionAttachmentRange,
  getCommandArgumentHintPlaceholder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucywgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q29tbWFuZEFyZ3VtZW50SGludCwgZ2V0Q29tcGxldGlvbkFjdGlvbiwgdHlwZSBJQWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudENvbXBsZXRpb25BdHRhY2htZW50TWV0YS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCwgZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnksIGlzUGFzdGVkVGV4dEFydGlmYWN0LCB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IGdldElucHV0UGxhY2Vob2xkZXJDb2xvciwgZ2V0UmFuZ2VGb3JQbGFjZWhvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dFBsYWNlaG9sZGVyRGVjb3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBhcHBseUFnZW50SG9zdENvbXBsZXRpb25BY3Rpb24sIGlzUG9saWN5QmxvY2tlZENvbXBsZXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbkNvbnRleHQuanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRBdHRhY2htZW50cyB9IGZyb20gJy4vbmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy5qcyc7XG5cbi8qKlxuICogQ29tbWFuZCBJRCB1c2VkIGJ5IGNvbXBsZXRpb24gaXRlbXMgdG8gYXR0YWNoIGFuIGFnZW50LWhvc3Qtc3VwcGxpZWRcbiAqIHJlc291cmNlIHJlZmVyZW5jZSAocmV0dXJuZWQgYnkgYElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlci5wcm92aWRlQ2hhdElucHV0Q29tcGxldGlvbnNgKVxuICogdG8gdGhlIHNlc3Npb25zIGNvbnRleHQgYXR0YWNobWVudHMuXG4gKi9cbmNvbnN0IEFERF9SRUZFUkVOQ0VfQ09NTUFORCA9ICdzZXNzaW9ucy5jaGF0LmFkZEFnZW50SG9zdFJlZmVyZW5jZSc7XG5cbmludGVyZmFjZSBJUmVmZXJlbmNlQXJnIHtcblx0cmVhZG9ubHkgaGFuZGxlcjogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlcjtcblx0cmVhZG9ubHkgZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk7XG5cdHJlYWRvbmx5IGluc2VydFRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkO1xufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBRERfUkVGRVJFTkNFX0NPTU1BTkQsIChfYWNjZXNzb3IsIGFyZzogSVJlZmVyZW5jZUFyZykgPT4ge1xuXHRhcmcuaGFuZGxlci5hY2NlcHRDb21wbGV0aW9uKGFyZy5lbnRyeSwgYXJnLmluc2VydFRleHQsIGFyZy5yYW5nZSk7XG59KTtcblxuLyoqXG4gKiBDb21tYW5kIElEIHVzZWQgYnkgY29uZmlnLWFjdGlvbiBjb21wbGV0aW9uIGl0ZW1zIChwZXJtaXNzaW9uL21vZGUgdG9nZ2xlcylcbiAqIHRvIGFwcGx5IHRoZSBzZXNzaW9uLWNvbmZpZyBjaGFuZ2Ugb24gYWNjZXB0LlxuICovXG5jb25zdCBDT05GSUdfQUNUSU9OX0NPTU1BTkQgPSAnc2Vzc2lvbnMuY2hhdC5hcHBseUFnZW50SG9zdENvbmZpZ0FjdGlvbic7XG5cbmludGVyZmFjZSBJQ29uZmlnQWN0aW9uQXJnIHtcblx0cmVhZG9ubHkgaGFuZGxlcjogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlcjtcblx0cmVhZG9ubHkgYWN0aW9uOiBJQWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbjtcblx0LyoqIFJlZmVyZW5jZSB0byBhZGQgKGZvciB0aGUgYXJndW1lbnQgaGludCkgZm9yIGtlZXAtdGV4dCBpdGVtczsgdW5kZWZpbmVkIGZvciB0b2dnbGVzLiAqL1xuXHRyZWFkb25seSBlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZDtcblx0LyoqIFRleHQgb2YgdGhlIGtlcHQgY29tbWFuZCByZWZlcmVuY2UgKHdpdGhvdXQgdGhlIHRyYWlsaW5nIHNwYWNlKS4gKi9cblx0cmVhZG9ubHkgcmVmZXJlbmNlVGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSByZWZlcmVuY2VSYW5nZTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQ7XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKENPTkZJR19BQ1RJT05fQ09NTUFORCwgYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IElDb25maWdBY3Rpb25BcmcpID0+IHtcblx0YXdhaXQgYXJnLmhhbmRsZXIuYXBwbHlDb25maWdBY3Rpb24oYWNjZXNzb3IsIGFyZyk7XG59KTtcblxuLyoqXG4gKiBGaW5kcyB0aGUgY29tcGxldGlvbiByZWZlcmVuY2UgY2xvc2VzdCB0byB0aGUgYWNjZXB0ZWQgcmFuZ2UgYW5kIHJldHVybnNcbiAqIGl0cyByYW5nZSBpbiB0aGUgbWVzc2FnZSB0ZXh0IHRoYXQgd2lsbCBiZSBzZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbkF0dGFjaG1lbnRSYW5nZShcblx0dmFsdWU6IHN0cmluZyxcblx0cmVmZXJlbmNlVGV4dDogc3RyaW5nLFxuXHRwcmVmZXJyZWRSYW5nZTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQsXG5cdG1lc3NhZ2VPZmZzZXQ6IG51bWJlcixcblx0bWVzc2FnZUxlbmd0aDogbnVtYmVyXG4pOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVmZXJlbmNlVGV4dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgYmVzdEluZGV4ID0gLTE7XG5cdGxldCBiZXN0RGlzdGFuY2UgPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0bGV0IGZyb20gPSAwO1xuXHQvLyBBIHJlZmVyZW5jZSBlbmRpbmcgaW4gZGlnaXRzIGlzIGEgcHJlZml4IG9mIGl0cyBoaWdoZXItbnVtYmVyZWQgc2libGluZ3Ncblx0Ly8gKGAuLi4gIzFgIGluc2lkZSBgLi4uICMxMGApLCBzbyBzdWNoIGEgbWF0Y2ggbXVzdCBub3QgY29udGludWUgd2l0aCBhIGRpZ2l0LlxuXHRjb25zdCBlbmRzV2l0aERpZ2l0ID0gL1xcZCQvLnRlc3QocmVmZXJlbmNlVGV4dCk7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB2YWx1ZS5pbmRleE9mKHJlZmVyZW5jZVRleHQsIGZyb20pO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRmcm9tID0gaW5kZXggKyByZWZlcmVuY2VUZXh0Lmxlbmd0aDtcblx0XHRpZiAoZW5kc1dpdGhEaWdpdCAmJiAvXFxkLy50ZXN0KHZhbHVlLmNoYXJBdChmcm9tKSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBkaXN0YW5jZSA9IHByZWZlcnJlZFJhbmdlID8gTWF0aC5hYnMoaW5kZXggLSBwcmVmZXJyZWRSYW5nZS5zdGFydCkgOiBpbmRleDtcblx0XHRpZiAoZGlzdGFuY2UgPCBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdGJlc3RJbmRleCA9IGluZGV4O1xuXHRcdFx0YmVzdERpc3RhbmNlID0gZGlzdGFuY2U7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGJlc3RJbmRleCA8IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgc3RhcnQgPSBiZXN0SW5kZXggLSBtZXNzYWdlT2Zmc2V0O1xuXHRjb25zdCBlbmRFeGNsdXNpdmUgPSBzdGFydCArIHJlZmVyZW5jZVRleHQubGVuZ3RoO1xuXHRpZiAoc3RhcnQgPCAwIHx8IGVuZEV4Y2x1c2l2ZSA+IG1lc3NhZ2VMZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZEV4Y2x1c2l2ZSk7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIGlubGluZSBhcmd1bWVudC1oaW50IHBsYWNlaG9sZGVyIHNob3VsZCBiZSBzaG93biBmb3IgYW5cbiAqIGFjY2VwdGVkIGFnZW50LWhvc3Qgc2xhc2ggY29tbWFuZC4gUmV0dXJucyB0aGUgaGludCB0ZXh0IGFuZCB0aGUgb2Zmc2V0IGp1c3RcbiAqIGFmdGVyIHRoZSBjb21tYW5kIHRva2VuIHdoZW4gdGhlIGNvbW1hbmQgaXMgdGhlIHNvbGUgY29udGVudCBvZiBgdmFsdWVgXG4gKiBmb2xsb3dlZCBieSBleGFjdGx5IG9uZSB0cmFpbGluZyBzcGFjZSAoaS5lLiBubyBhcmd1bWVudCBoYXMgYmVlbiB0eXBlZCB5ZXQpLFxuICogb3IgYHVuZGVmaW5lZGAgb3RoZXJ3aXNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tbWFuZEFyZ3VtZW50SGludFBsYWNlaG9sZGVyKFxuXHR2YWx1ZTogc3RyaW5nLFxuXHRhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdLFxuXHRpbnNlcnRlZFJlZmVyZW5jZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgeyB0ZXh0OiBzdHJpbmc7IHJhbmdlOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB9Pixcbik6IHsgYXJndW1lbnRIaW50OiBzdHJpbmc7IGVuZE9mZnNldDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGF0dGFjaG1lbnRzKSB7XG5cdFx0aWYgKGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kKGVudHJ5KSAhPT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFyZ3VtZW50SGludCA9IGdldENvbW1hbmRBcmd1bWVudEhpbnQoZW50cnkuX21ldGEpO1xuXHRcdGlmICghYXJndW1lbnRIaW50KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gaW5zZXJ0ZWRSZWZlcmVuY2VzLmdldChlbnRyeS5pZCk7XG5cdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IGdldEFnZW50SG9zdENvbXBsZXRpb25BdHRhY2htZW50UmFuZ2UodmFsdWUsIHJlZmVyZW5jZS50ZXh0LCByZWZlcmVuY2UucmFuZ2UsIDAsIHZhbHVlLmxlbmd0aCk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIE9ubHkgc2hvdyB0aGUgaGludCB3aGlsZSB0aGUgY29tbWFuZCBpcyB0aGUgc29sZSBjb250ZW50IGZvbGxvd2VkIGJ5IGV4YWN0bHkgb25lIHRyYWlsaW5nIHNwYWNlLlxuXHRcdGlmICh2YWx1ZS5zbGljZSgwLCByYW5nZS5zdGFydCkudHJpbSgpLmxlbmd0aCA+IDAgfHwgdmFsdWUuc2xpY2UocmFuZ2UuZW5kRXhjbHVzaXZlKSAhPT0gJyAnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBhcmd1bWVudEhpbnQsIGVuZE9mZnNldDogcmFuZ2UuZW5kRXhjbHVzaXZlIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBCcmlkZ2VzIHRoZSBuZXctY2hhdCBpbnB1dCBlZGl0b3IgdG8gdGhlIGFnZW50IGhvc3QncyBgY29tcGxldGlvbnNgXG4gKiBjb21tYW5kIGZvciB0aGUgY3VycmVudGx5LXNlbGVjdGVkIHNlc3Npb24gdHlwZS4gTWlycm9yc1xuICoge0BsaW5rIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnN9ICh3aGljaCBoYW5kbGVzIHRoZSAqZXhpc3RpbmcqIGNoYXRcbiAqIHdpZGdldCkgYnV0IGZlZWRzIHJlc3VsdHMgaW50byB7QGxpbmsgSU5ld0NoYXRBdHRhY2htZW50c31cbiAqIGluc3RlYWQgb2YgdGhlIGNoYXQgd2lkZ2V0J3MgYENoYXREeW5hbWljVmFyaWFibGVNb2RlbGAuXG4gKlxuICogVGhlIE1vbmFjbyBjb21wbGV0aW9uIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQgZHluYW1pY2FsbHkgcGVyIGFjdGl2ZVxuICogc2Vzc2lvbiB0eXBlIHNvIHRyaWdnZXIgY2hhcmFjdGVycyByZWZsZWN0IHdoYXQgdGhlIGhvc3QgYW5ub3VuY2VzIGluXG4gKiBpdHMgYEluaXRpYWxpemVSZXN1bHQuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYC4gV2hlbiB0aGUgdXNlclxuICogcGlja3MgYSBkaWZmZXJlbnQgc2Vzc2lvbiB0eXBlLCB0aGUgcmVnaXN0cmF0aW9uIGlzIHRvcm4gZG93biBhbmRcbiAqIHJlLWJ1aWx0IHdpdGggdGhlIG5ldyBob3N0J3MgdHJpZ2dlciBjaGFycy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIgZXh0ZW5kcyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZTx2b2lkLCBzdHJpbmc+IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfY2xhc3NOYW1lID0gJ3Nlc3Npb25zLWFnZW50LWhvc3QtcmVmZXJlbmNlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2FyZ3VtZW50SGludERlY29yYXRpb25EZXNjcmlwdGlvbiA9ICdzZXNzaW9ucy1jaGF0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2FyZ3VtZW50SGludERlY29yYXRpb25UeXBlID0gJ3Nlc3Npb25zLWNvbW1hbmQtYXJndW1lbnQtaGludCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdC8qKlxuXHQgKiBJbnNlcnRlZCByZWZlcmVuY2UgcGVyIGFjY2VwdGVkIGF0dGFjaG1lbnQgaWQuIFVzZWQgdG8gZmluZCBhbmQgZGVjb3JhdGVcblx0ICogdGhlIGFjY2VwdGVkIG9jY3VycmVuY2UgaW4gdGhlIGVkaXRvciBhbmQgZHJvcHBlZCB3aGVuIHRoZSB1c2VyIHJlbW92ZXNcblx0ICogdGhlIGF0dGFjaG1lbnQgY2hpcC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc2VydGVkUmVmZXJlbmNlcyA9IG5ldyBNYXA8c3RyaW5nIC8qIGlkICovLCB7IHRleHQ6IHN0cmluZzsgcmFuZ2U6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIH0+KCk7XG5cblx0LyoqIElkcyB3aG9zZSBpbmxpbmUgcmVmZXJlbmNlIHNob3VsZCBiZSByZW1vdmVkIHdpdGggdGhlIGF0dGFjaG1lbnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FydGlmYWN0UmVmZXJlbmNlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0QXR0YWNobWVudHM6IElOZXdDaGF0QXR0YWNobWVudHMsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNvbnRleHQgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkNvbnRleHQ6IElTZXNzaW9uQ29udGV4dCxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlci5fYXJndW1lbnRIaW50RGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLl9hcmd1bWVudEhpbnREZWNvcmF0aW9uVHlwZSwge30pKTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyRGVjb3JhdGlvbnMoKTtcblxuXHRcdC8vIFdhdGNoIHRoaXMgaW5wdXQncyBzY29wZWQgc2Vzc2lvbiBhbmQgKHJlLSlyZWdpc3RlciB0aGUgTW9uYWNvXG5cdFx0Ly8gcHJvdmlkZXIgd2l0aCB0aGUgdHJpZ2dlciBjaGFyYWN0ZXJzIGFubm91bmNlZCBieSB3aGljaGV2ZXIgY29udGVudFxuXHRcdC8vIHByb3ZpZGVyIGhhbmRsZXMgdGhhdCBzZXNzaW9uJ3MgcmVzb3VyY2Ugc2NoZW1lLiBVc2luZyB0aGVcblx0XHQvLyBpbnB1dC1zY29wZWQgYElTZXNzaW9uQ29udGV4dGAgKHJhdGhlciB0aGFuIHRoZSB3aW5kb3ctZ2xvYmFsIGFjdGl2ZVxuXHRcdC8vIHNlc3Npb24pIGVuc3VyZXMgY29tcGxldGlvbnMgXHUyMDE0IGFuZCB0aGUgY29uZmlnIGNoYW5nZXMgdGhleSBhcHBseSBvblxuXHRcdC8vIGFjY2VwdCBcdTIwMTQgdGFyZ2V0IHRoZSBzZXNzaW9uIHRoaXMgaW5wdXQgY29tcG9zZXMgZm9yLCBldmVuIHdoZW4gYW5vdGhlclxuXHRcdC8vIHNhbWUtdHlwZSBzZXNzaW9uIGlzIHRoZSB3aW5kb3cncyBhY3RpdmUgb25lLlxuXHRcdC8vXG5cdFx0Ly8gV2Uga2V5IG9mZiB0aGUgcmVzb3VyY2Ugc2NoZW1lICh2aWEgYGdldENoYXRTZXNzaW9uVHlwZWApIHJhdGhlclxuXHRcdC8vIHRoYW4gYElTZXNzaW9uLnNlc3Npb25UeXBlYCBiZWNhdXNlIHRoZSBsYXR0ZXIgaXMgdGhlICphZ2VudFxuXHRcdC8vIHByb3ZpZGVyKiBuYW1lIChlLmcuIGBjb3BpbG90Y2xpYCksIHdoaWxlIGNvbnRlbnQgcHJvdmlkZXJzIGFyZVxuXHRcdC8vIHJlZ2lzdGVyZWQgZm9yIHRoZSByZXNvdXJjZSBzY2hlbWUgKGUuZy4gYGFnZW50LWhvc3QtY29waWxvdGAgb3Jcblx0XHQvLyBgcmVtb3RlLTxob3N0Pi1jb3BpbG90YCkuIE9ubHkgdGhlIHNjaGVtZSBtYXRjaGVzIHRoZSBrZXlzXG5cdFx0Ly8gYElDaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRJbnB1dENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyc2Bcblx0XHQvLyBsb29rcyB1cC5cblx0XHRsZXQgY3VycmVudFNjaGVtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ29udGV4dC5zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNjaGVtZSA9IHNlc3Npb24gPyBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvbi5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc2NoZW1lID09PSBjdXJyZW50U2NoZW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRTY2hlbWUgPSBzY2hlbWU7XG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb24uY2xlYXIoKTtcblx0XHRcdGlmIChzY2hlbWUgJiYgaXNBZ2VudEhvc3RUYXJnZXQoc2NoZW1lKSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3JlZ2lzdGVyRm9yU2NoZW1lKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVnaXN0ZXJGb3JTY2hlbWUoc2NoZW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0cmlnZ2VyQ2hhcmFjdGVycyA9IGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKHNjaGVtZSk7XG5cdFx0aWYgKCF0cmlnZ2VyQ2hhcmFjdGVycyB8fCB0cmlnZ2VyQ2hhcmFjdGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgc2NvcGVkIHNlc3Npb24gbWF5IGhhdmUgY2hhbmdlZCBtaWQtYXdhaXQgXHUyMDE0IGJhaWwgaWYgaXRzXG5cdFx0Ly8gcmVzb3VyY2Ugc2NoZW1lIGlzIG5vIGxvbmdlciB0aGUgb25lIHdlIHJlZ2lzdGVyZWQgZm9yLlxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbiB8fCBnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSkgIT09IHNjaGVtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclVyaSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0aWYgKCFlZGl0b3JVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb24udmFsdWUgPSB0aGlzLl9yZWdpc3RlclByb3ZpZGVyKFxuXHRcdFx0eyBzY2hlbWU6IGVkaXRvclVyaS5zY2hlbWUsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sXG5cdFx0XHRgc2Vzc2lvbnNBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zWyR7c2NoZW1lfV1gLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRzY2hlbWUsXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVzb2x2ZUNvbnRleHQobW9kZWw6IElUZXh0TW9kZWwsIHNjaGVtZTogc3RyaW5nKTogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgY29udGV4dDogdm9pZCB9IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBGb3IgYSBgL3Ryb3VibGVzaG9vdGAgcmVxdWVzdCwgYCNgIHJlZmVyZW5jZXMgdGFyZ2V0IHNlc3Npb25zIChzZXJ2ZWRcblx0XHQvLyBieSB0aGUgYCNzZXNzaW9uYCBwcm92aWRlcik7IHN1cHByZXNzIGhvc3Qtc3VwcGxpZWQgY29tcGxldGlvbnMgKGUuZy5cblx0XHQvLyB0aGUgaG9zdCdzIGAjZmlsZWAgbGlzdCkgc28gb25seSBzZXNzaW9ucyBhcmUgb2ZmZXJlZC5cblx0XHRpZiAoL15cXHMqXFwvdHJvdWJsZXNob290XFxiLy50ZXN0KG1vZGVsLmdldFZhbHVlKCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2U7XG5cdFx0Ly8gT25seSByZXNwb25kIHdoZW4gdGhpcyBpbnB1dCdzIHNjb3BlZCBzZXNzaW9uIG1hdGNoZXMgdGhlXG5cdFx0Ly8gc2NoZW1lIHRoaXMgcmVnaXN0cmF0aW9uIHdhcyBtYWRlIGZvci4gU3RhbGUgcmVnaXN0cmF0aW9uc1xuXHRcdC8vICh0aGUgc2NvcGVkIHNlc3Npb24gY2hhbmdlZCBkdXJpbmcgdGhlIGhvc3QgUlBDLCBldGMuKSBhcmVcblx0XHQvLyBzaWxlbnRseSBpZ25vcmVkLlxuXHRcdGlmIChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSAhPT0gc2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uUmVzb3VyY2UsIGNvbnRleHQ6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9idWlsZEl0ZW0ocG9zaXRpb246IFBvc2l0aW9uLCBpdGVtOiBJQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0pOiBDb21wbGV0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVwbGFjZVJhbmdlID0gQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlci5jb21wdXRlUmFuZ2UocG9zaXRpb24sIGl0ZW0pO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBpdGVtLmF0dGFjaG1lbnQ7XG5cdFx0c3dpdGNoIChhdHRhY2htZW50LmtpbmQpIHtcblx0XHRcdGNhc2UgJ2NvbW1hbmQnOiB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldENvbXBsZXRpb25BY3Rpb24oYXR0YWNobWVudC5fbWV0YSk7XG5cdFx0XHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdFx0XHQvLyBPbWl0IGFuIGVsZXZhdGVkIGF1dG8tYXBwcm92ZSB0b2dnbGUgKEFsbG93IGFsbCAvIEFzc2lzdGVkKVxuXHRcdFx0XHRcdC8vIHdoZW4gZW50ZXJwcmlzZSBwb2xpY3kgZGlzYWJsZXMgZ2xvYmFsIGF1dG8tYXBwcm92YWwsIHJhdGhlclxuXHRcdFx0XHRcdC8vIHRoYW4gb2ZmZXJpbmcgYW4gaXRlbSB0aGF0IHdvdWxkIHdhcm4gdGhlbiBjbGFtcCB0byBEZWZhdWx0LlxuXHRcdFx0XHRcdGlmIChpc1BvbGljeUJsb2NrZWRDb21wbGV0aW9uQWN0aW9uKGFjdGlvbiwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDb25maWctYWN0aW9uIGNvbXBsZXRpb24gKHBlcm1pc3Npb24vbW9kZSB0b2dnbGUpLiBLZWVwLXRleHRcblx0XHRcdFx0XHQvLyBpdGVtcyAobm9uLWVtcHR5IGluc2VydFRleHQpIHJldGFpbiB0aGUgYC9jb21tYW5kIGAgdGV4dCBhbmRcblx0XHRcdFx0XHQvLyBpdHMgYXJndW1lbnQtaGludCByZWZlcmVuY2U7IHRvZ2dsZSBpdGVtcyBpbnNlcnQgbm90aGluZy5cblx0XHRcdFx0XHRjb25zdCBrZWVwID0gaXRlbS5pbnNlcnRUZXh0ICE9PSAnJztcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGl0ZW0ubGFiZWwgPz8gaXRlbS5pbnNlcnRUZXh0O1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZVRleHQgPSBpdGVtLmluc2VydFRleHQudHJpbUVuZCgpO1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0ga2VlcFxuXHRcdFx0XHRcdFx0PyB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQsIHJlZmVyZW5jZVRleHQsIGF0dGFjaG1lbnQuY29tbWFuZCwgYXR0YWNobWVudC5fbWV0YSlcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbCwgZGVzY3JpcHRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGxhYmVsLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IENPTkZJR19BQ1RJT05fQ09NTUFORCxcblx0XHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlcjogdGhpcyxcblx0XHRcdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0XHRcdFx0cmVmZXJlbmNlVGV4dCxcblx0XHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VSYW5nZTogZW50cnkgPyB0aGlzLl90b09mZnNldFJhbmdlKHJlcGxhY2VSYW5nZS5yZXBsYWNlLCByZWZlcmVuY2VUZXh0KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNvbmZpZ0FjdGlvbkFyZ10sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlVGV4dCA9IGl0ZW0uaW5zZXJ0VGV4dC50cmltRW5kKCk7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Db21tYW5kLCByZWZlcmVuY2VUZXh0LCBhdHRhY2htZW50LmNvbW1hbmQsIGF0dGFjaG1lbnQuX21ldGEpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBpdGVtLmluc2VydFRleHQsIGRlc2NyaXB0aW9uOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFERF9SRUZFUkVOQ0VfQ09NTUFORCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdFx0aGFuZGxlcjogdGhpcyxcblx0XHRcdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHJlZmVyZW5jZVRleHQsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiB0aGlzLl90b09mZnNldFJhbmdlKHJlcGxhY2VSYW5nZS5yZXBsYWNlLCByZWZlcmVuY2VUZXh0KSxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElSZWZlcmVuY2VBcmddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdza2lsbCc6IHtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlVGV4dCA9IGl0ZW0uaW5zZXJ0VGV4dC50cmltRW5kKCk7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Ta2lsbCwgcmVmZXJlbmNlVGV4dCwgYXR0YWNobWVudC51cmksIGF0dGFjaG1lbnQuX21ldGEpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBpdGVtLmluc2VydFRleHQsIGRlc2NyaXB0aW9uOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFERF9SRUZFUkVOQ0VfQ09NTUFORCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdFx0aGFuZGxlcjogdGhpcyxcblx0XHRcdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHJlZmVyZW5jZVRleHQsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiB0aGlzLl90b09mZnNldFJhbmdlKHJlcGxhY2VSYW5nZS5yZXBsYWNlLCByZWZlcmVuY2VUZXh0KSxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElSZWZlcmVuY2VBcmddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdjaGF0Jzoge1xuXHRcdFx0XHQvLyBUaGUgbmV3LWNoYXQgc3VyZmFjZSBkb2VzIG5vdCBzdXBwb3J0IGNoYXQgcmVmZXJlbmNlczsgaWdub3JlLlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgPz8gaXRlbS5pbnNlcnRUZXh0O1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGF0dGFjaG1lbnQudXJpLnBhdGg7XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSBhdHRhY2htZW50LmlzRGlyZWN0b3J5ID8gQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciA6IENvbXBsZXRpb25JdGVtS2luZC5GaWxlO1xuXHRcdFx0XHRjb25zdCBlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdFx0XHRpZDogYXR0YWNobWVudC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8/IHRoaXMuX2Jhc2VuYW1lKGF0dGFjaG1lbnQudXJpKSxcblx0XHRcdFx0XHR2YWx1ZTogYXR0YWNobWVudC51cmksXG5cdFx0XHRcdFx0a2luZDogYXR0YWNobWVudC5pc0RpcmVjdG9yeSA/ICdkaXJlY3RvcnknIDogJ2ZpbGUnLFxuXHRcdFx0XHRcdF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBBRERfUkVGRVJFTkNFX0NPTU1BTkQsXG5cdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZXI6IHRoaXMsXG5cdFx0XHRcdFx0XHRcdGVudHJ5LFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiB0aGlzLl90b09mZnNldFJhbmdlKHJlcGxhY2VSYW5nZS5yZXBsYWNlLCBpdGVtLmluc2VydFRleHQpLFxuXHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSVJlZmVyZW5jZUFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iYXNlbmFtZSh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaWR4ID0gdXJpLnBhdGgubGFzdEluZGV4T2YoJy8nKTtcblx0XHRyZXR1cm4gaWR4ID49IDAgPyB1cmkucGF0aC5zbGljZShpZHggKyAxKSA6IHVyaS5wYXRoO1xuXHR9XG5cblx0Ly8gLS0tIEF0dGFjaG1lbnQgKyBkZWNvcmF0aW9uIGJyaWRnaW5nIC0tLVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgdXNlciBhY2NlcHRzIGFuIGl0ZW0gZnJvbSB0aGUgTW9uYWNvIGNvbXBsZXRpb25cblx0ICogd2lkZ2V0ICh2aWEgdGhlIHJlZ2lzdGVyZWQgY29tbWFuZCkuIEFkZHMgdGhlIHJlc291cmNlIHRvIHRoZVxuXHQgKiBjb250ZXh0IGF0dGFjaG1lbnRzIGFuZCB0cmFja3MgdGhlIGluc2VydGVkIHRleHQgc28gaXQgY2FuIGJlXG5cdCAqIGhpZ2hsaWdodGVkIGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRhY2NlcHRDb21wbGV0aW9uKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpbnNlcnRUZXh0OiBzdHJpbmcsIHJhbmdlOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2luc2VydGVkUmVmZXJlbmNlcy5zZXQoZW50cnkuaWQsIHsgdGV4dDogaW5zZXJ0VGV4dCwgcmFuZ2UgfSk7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnNldEF0dGFjaG1lbnRzKFsuLi50aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHMuZmlsdGVyKGUgPT4gZS5pZCAhPT0gZW50cnkuaWQpLCBlbnRyeV0pO1xuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdH1cblxuXHQvKipcblx0ICogQWNjZXB0IGhhbmRsZXIgZm9yIGNvbmZpZy1hY3Rpb24gY29tcGxldGlvbnMgKHBlcm1pc3Npb24vbW9kZSB0b2dnbGVzKS5cblx0ICogQXBwbGllcyB0aGUgc2Vzc2lvbi1jb25maWcgY2hhbmdlIChnYXRlZCBieSB0aGUgZWxldmF0ZWQtcGVybWlzc2lvblxuXHQgKiBjb25maXJtYXRpb24gZm9yIGBhdXRvQXBwcm92ZWApIHZpYSB0aGlzIGlucHV0J3Mgc2NvcGVkIHNlc3Npb24nc1xuXHQgKiBhZ2VudC1ob3N0IHByb3ZpZGVyLiBLZWVwLXRleHQgaXRlbXMgKG5vbi1lbXB0eSBpbnNlcnRUZXh0KSB0aGVuIGFkZCB0aGVpclxuXHQgKiBhcmd1bWVudC1oaW50IHJlZmVyZW5jZTsgdG9nZ2xlIGl0ZW1zIGluc2VydCBub3RoaW5nLCBzbyB0aGVyZSBpcyBubyB0ZXh0XG5cdCAqIHRvIHJlbW92ZS5cblx0ICovXG5cdGFzeW5jIGFwcGx5Q29uZmlnQWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IElDb25maWdBY3Rpb25BcmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdFx0Y29uc3QgYXBwbGllZCA9IGF3YWl0IGFwcGx5QWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbihhcmcuYWN0aW9uLCBkaWFsb2dTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgYXN5bmMgY29uZmlnID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocHJvdmlkZXIgJiYgaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoT2JqZWN0LmVudHJpZXMoY29uZmlnKS5tYXAoKFtrZXksIHZhbHVlXSkgPT4gcHJvdmlkZXIuc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb24uc2Vzc2lvbklkLCBrZXksIHZhbHVlKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Ly8gS2VlcC10ZXh0IGl0ZW1zIGFkZCB0aGVpciBhcmd1bWVudC1oaW50IHJlZmVyZW5jZSBvbmNlIGFwcGxpZWQuIFRvZ2dsZVxuXHRcdC8vIGl0ZW1zIGluc2VydCBub3RoaW5nLCBzbyB0aGVyZSBpcyBubyB0ZXh0IHRvIHJlbW92ZS5cblx0XHRpZiAoYXBwbGllZCAmJiBhcmcuZW50cnkpIHtcblx0XHRcdHRoaXMuYWNjZXB0Q29tcGxldGlvbihhcmcuZW50cnksIGFyZy5yZWZlcmVuY2VUZXh0LCBhcmcucmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldEF0dGFjaG1lbnRzRm9yU2VuZChtZXNzYWdlVGV4dD86IHN0cmluZywgbWVzc2FnZU9mZnNldCA9IDApOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbD8uZ2V0VmFsdWUoKSA/PyAnJztcblx0XHRjb25zdCBtZXNzYWdlTGVuZ3RoID0gbWVzc2FnZVRleHQ/Lmxlbmd0aCA/PyB2YWx1ZS5sZW5ndGg7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50cykge1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gdGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzLmdldChlbnRyeS5pZClcblx0XHRcdFx0Pz8gKGlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoZW50cnkpID8geyB0ZXh0OiBlbnRyeS5uYW1lLCByYW5nZTogdW5kZWZpbmVkIH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdFx0aWYgKCFpc1Bhc3RlZFRleHRBcnRpZmFjdChlbnRyeSkgfHwgIWVudHJ5LnJhbmdlKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBnZXRBZ2VudEhvc3RDb21wbGV0aW9uQXR0YWNobWVudFJhbmdlKHZhbHVlLCByZWZlcmVuY2UudGV4dCwgcmVmZXJlbmNlLnJhbmdlLCBtZXNzYWdlT2Zmc2V0LCBtZXNzYWdlTGVuZ3RoKTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0aWYgKCFpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KGVudHJ5KSAmJiAoIWlzUGFzdGVkVGV4dEFydGlmYWN0KGVudHJ5KSB8fCAhZW50cnkucmFuZ2UpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeyAuLi5lbnRyeSwgcmFuZ2UgfSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdC8vIFJlLWRlY29yYXRlIHdoZW4gdGhlIGVkaXRvciBjb250ZW50IGNoYW5nZXMgKHRoZSB1c2VyIHR5cGVkLFxuXHRcdC8vIHBhc3RlZCwgb3IgdGhlIGluc2VydGVkIHRleHQgbW92ZWQpIGFuZCB3aGVuIGF0dGFjaG1lbnRzIGNoYW5nZVxuXHRcdC8vIChhIGNoaXAgd2FzIHJlbW92ZWQsIGRyYWZ0IHN0YXRlIHJlc3RvcmVkLCBldGMuKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4gdGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5vbkRpZENoYW5nZUNvbnRleHQoKCkgPT4gdGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdH1cblxuXHQvKipcblx0ICogRHJvcHMgdHJhY2tpbmcgZm9yIGEgcmVmZXJlbmNlIHdpdGhvdXQgdG91Y2hpbmcgdGhlIGlucHV0IHRleHQsIGZvciBjYWxsZXJzXG5cdCAqIHRoYXQgcmVtb3ZlIHRoYXQgdGV4dCB0aGVtc2VsdmVzLiBUaGUgcGFzdGUgcGlwZWxpbmUncyB1bmRvIGRvZXM6IHRoZSB1bmRvXG5cdCAqIHN0YWNrIHJlbW92ZXMgdGhlIHBhc3RlZCByZWZlcmVuY2UgdGV4dCBhcyBpdHMgb3duIHN0ZXAsIHNvIHRoZSBjaGlwLXJlbW92YWxcblx0ICogY2xlYW51cCBiZWxvdyBtdXN0IG5vdCBydW4gYSBjb21wZXRpbmcgZWRpdCB3aGlsZSB0aGF0IHVuZG8gaXMgdW53aW5kaW5nLlxuXHQgKi9cblx0Zm9yZ2V0UmVmZXJlbmNlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl9hcnRpZmFjdFJlZmVyZW5jZUlkcy5kZWxldGUoaWQpO1xuXHR9XG5cblx0LyoqIFJlbW92ZXMgYW4gaW5saW5lIHJlZmVyZW5jZSdzIHRleHQsIGluY2x1ZGluZyBvbmUgdHJhaWxpbmcgc3BhY2UuICovXG5cdHByaXZhdGUgX3JlbW92ZVJlZmVyZW5jZVRleHQodGV4dDogc3RyaW5nLCBwcmVmZXJyZWRSYW5nZTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IHJhbmdlID0gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbkF0dGFjaG1lbnRSYW5nZSh2YWx1ZSwgdGV4dCwgcHJlZmVycmVkUmFuZ2UsIDAsIHZhbHVlLmxlbmd0aCk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmRFeGNsdXNpdmUgPSB2YWx1ZS5jaGFyQXQocmFuZ2UuZW5kRXhjbHVzaXZlKSA9PT0gJyAnID8gcmFuZ2UuZW5kRXhjbHVzaXZlICsgMSA6IHJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHRjb25zdCBzdGFydCA9IG1vZGVsLmdldFBvc2l0aW9uQXQocmFuZ2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGVuZCA9IG1vZGVsLmdldFBvc2l0aW9uQXQoZW5kRXhjbHVzaXZlKTtcblx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKCdzZXNzaW9uc0NoYXQucmVtb3ZlQXR0YWNobWVudFJlZmVyZW5jZScsIFt7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgZW5kKSxcblx0XHRcdHRleHQ6ICcnLFxuXHRcdH1dKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdC8vIERyb3AgdHJhY2tpbmcgZm9yIGFueSBVUkkgdGhhdCBpcyBubyBsb25nZXIgYXR0YWNoZWQuIFRoZSBjaGlwXG5cdFx0Ly8gYmVpbmcgcmVtb3ZlZCBpcyB0aGUgY2Fub25pY2FsIHNpZ25hbCB0aGF0IHRoZSByZWZlcmVuY2UgaXNcblx0XHQvLyBnb25lLCBldmVuIGlmIGl0cyBpbnNlcnRlZCB0ZXh0IHN0aWxsIGhhcHBlbnMgdG8gYXBwZWFyIGluIHRoZVxuXHRcdC8vIGVkaXRvci5cblx0XHRjb25zdCBhdHRhY2hlZElkcyA9IG5ldyBTZXQodGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmF0dGFjaG1lbnRzLm1hcChhID0+IGEuaWQpKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIFsuLi50aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMua2V5cygpXSkge1xuXHRcdFx0aWYgKCFhdHRhY2hlZElkcy5oYXMoaWQpKSB7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMuZ2V0KGlkKTtcblx0XHRcdFx0dGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdC8vIEEgcGFzdGVkLXRleHQgYXJ0aWZhY3QgaXMgYm91bmQgdG8gaXRzIGlubGluZSByZWZlcmVuY2UsIHNvIHJlbW92aW5nXG5cdFx0XHRcdC8vIHRoZSBjaGlwIHRha2VzIHRoZSByZWZlcmVuY2UgdGV4dCB3aXRoIGl0IHJhdGhlciB0aGFuIGxlYXZpbmcgYSB0b2tlblxuXHRcdFx0XHQvLyB0aGF0IG5vIGxvbmdlciByZXNvbHZlcyB0byBhbnl0aGluZy5cblx0XHRcdFx0aWYgKHJlbW92ZWQgJiYgdGhpcy5fYXJ0aWZhY3RSZWZlcmVuY2VJZHMuZGVsZXRlKGlkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW92ZVJlZmVyZW5jZVRleHQocmVtb3ZlZC50ZXh0LCByZW1vdmVkLnJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IG1vZGVsLmdldFZhbHVlKCk7XG5cdFx0Y29uc3Qgb3JwaGFuZWRBcnRpZmFjdHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHMpIHtcblx0XHRcdGlmICghaXNQYXN0ZWRUZXh0QXJ0aWZhY3QoZW50cnkpIHx8ICFlbnRyeS5yYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9YXR0YWNobWVudDoke2VudHJ5Lm5hbWV9YDtcblx0XHRcdGNvbnN0IHByZWZlcnJlZFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKGVudHJ5LnJhbmdlLnN0YXJ0LCBlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBnZXRBZ2VudEhvc3RDb21wbGV0aW9uQXR0YWNobWVudFJhbmdlKHZhbHVlLCB0ZXh0LCBwcmVmZXJyZWRSYW5nZSwgMCwgdmFsdWUubGVuZ3RoKTtcblx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHR0aGlzLl9hcnRpZmFjdFJlZmVyZW5jZUlkcy5hZGQoZW50cnkuaWQpO1xuXHRcdFx0XHR0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMuc2V0KGVudHJ5LmlkLCB7IHRleHQsIHJhbmdlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhlIGlubGluZSByZWZlcmVuY2UgaXMgdGhlIG9ubHkgaGFuZGxlIG9uIGFuIGFydGlmYWN0LCBzbyB0aGVcblx0XHRcdFx0Ly8gYXR0YWNobWVudCBnb2VzIHdpdGggaXQuIE1pcnJvcnMgdGhlIHdvcmtiZW5jaCBwcm9tcHQtYXR0YWNobWVudCBhdXRvcnVuLlxuXHRcdFx0XHRvcnBoYW5lZEFydGlmYWN0cy5wdXNoKGVudHJ5LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBvcnBoYW5lZEFydGlmYWN0cykge1xuXHRcdFx0dGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMucmVtb3ZlQXR0YWNobWVudChpZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlIG9mIHRoaXMuX2luc2VydGVkUmVmZXJlbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBnZXRBZ2VudEhvc3RDb21wbGV0aW9uQXR0YWNobWVudFJhbmdlKHZhbHVlLCByZWZlcmVuY2UudGV4dCwgcmVmZXJlbmNlLnJhbmdlLCAwLCB2YWx1ZS5sZW5ndGgpO1xuXHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXJ0UG9zID0gbW9kZWwuZ2V0UG9zaXRpb25BdChyYW5nZS5zdGFydCk7XG5cdFx0XHRjb25zdCBlbmRQb3MgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KHJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdFx0XHRkZWNvcy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0UG9zLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHN0YXJ0UG9zLmNvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmRQb3MubGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IGVuZFBvcy5jb2x1bW4sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdzZXNzaW9ucy1hZ2VudC1ob3N0LXJlZmVyZW5jZScsIGlubGluZUNsYXNzTmFtZTogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlci5fY2xhc3NOYW1lIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXQoZGVjb3MpO1xuXG5cdFx0dGhpcy5fZWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKFxuXHRcdFx0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlci5fYXJndW1lbnRIaW50RGVjb3JhdGlvbkRlc2NyaXB0aW9uLFxuXHRcdFx0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlci5fYXJndW1lbnRIaW50RGVjb3JhdGlvblR5cGUsXG5cdFx0XHR0aGlzLl9nZXRBcmd1bWVudEhpbnREZWNvcmF0aW9ucyhtb2RlbCwgdmFsdWUpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIGlubGluZSBwbGFjZWhvbGRlciAoZ2hvc3QgdGV4dCkgc2hvd24gYWZ0ZXIgYW4gYWNjZXB0ZWRcblx0ICogYWdlbnQtaG9zdCBzbGFzaCBjb21tYW5kIHdob3NlIGBfbWV0YWAgY2FycmllcyBhbiBhcmd1bWVudCBoaW50LiBTaG93blxuXHQgKiBvbmx5IHdoaWxlIHRoZSBjb21tYW5kIGlzIHRoZSBzb2xlIGNvbnRlbnQgZm9sbG93ZWQgYnkgYSBzaW5nbGUgdHJhaWxpbmdcblx0ICogc3BhY2UgKGkuZS4gYmVmb3JlIGFueSBhcmd1bWVudCBoYXMgYmVlbiB0eXBlZCkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRBcmd1bWVudEhpbnREZWNvcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgdmFsdWU6IHN0cmluZyk6IElEZWNvcmF0aW9uT3B0aW9uc1tdIHtcblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IGdldENvbW1hbmRBcmd1bWVudEhpbnRQbGFjZWhvbGRlcih2YWx1ZSwgdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmF0dGFjaG1lbnRzLCB0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMpO1xuXHRcdGlmICghcGxhY2Vob2xkZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZW5kUG9zID0gbW9kZWwuZ2V0UG9zaXRpb25BdChwbGFjZWhvbGRlci5lbmRPZmZzZXQpO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0cmFuZ2U6IGdldFJhbmdlRm9yUGxhY2Vob2xkZXIoeyBzdGFydExpbmVOdW1iZXI6IGVuZFBvcy5saW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBlbmRQb3MubGluZU51bWJlciwgc3RhcnRDb2x1bW46IGVuZFBvcy5jb2x1bW4sIGVuZENvbHVtbjogZW5kUG9zLmNvbHVtbiB9KSxcblx0XHRcdHJlbmRlck9wdGlvbnM6IHsgYWZ0ZXI6IHsgY29udGVudFRleHQ6IHBsYWNlaG9sZGVyLmFyZ3VtZW50SGludCwgY29sb3I6IGdldElucHV0UGxhY2Vob2xkZXJDb2xvcih0aGlzLl90aGVtZVNlcnZpY2UpIH0gfVxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9PZmZzZXRSYW5nZShyYW5nZTogUmFuZ2UsIGluc2VydFRleHQ6IHN0cmluZyk6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwuZ2V0T2Zmc2V0QXQocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBzdGFydCArIGluc2VydFRleHQubGVuZ3RoKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNB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
