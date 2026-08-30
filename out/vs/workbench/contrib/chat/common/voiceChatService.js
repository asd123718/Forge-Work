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
import { localize } from "../../../../nls.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { rtrim } from "../../../../base/common/strings.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatAgentService } from "./participants/chatAgents.js";
import { chatAgentLeader, chatSubcommandLeader } from "./requestParser/chatParserTypes.js";
import { ISpeechService, SpeechToTextStatus } from "../../speech/common/speechService.js";
const IVoiceChatService = createDecorator("voiceChatService");
var PhraseTextType = /* @__PURE__ */ ((PhraseTextType2) => {
  PhraseTextType2[PhraseTextType2["AGENT"] = 1] = "AGENT";
  PhraseTextType2[PhraseTextType2["COMMAND"] = 2] = "COMMAND";
  PhraseTextType2[PhraseTextType2["AGENT_AND_COMMAND"] = 3] = "AGENT_AND_COMMAND";
  return PhraseTextType2;
})(PhraseTextType || {});
const VoiceChatInProgress = new RawContextKey("voiceChatInProgress", false, { type: "boolean", description: localize("voiceChatInProgress", "A speech-to-text session is in progress for chat.") });
let VoiceChatService = class extends Disposable {
  constructor(speechService, chatAgentService, contextKeyService) {
    super();
    this.speechService = speechService;
    this.chatAgentService = chatAgentService;
    this.activeVoiceChatSessions = 0;
    this.voiceChatInProgress = VoiceChatInProgress.bindTo(contextKeyService);
  }
  createPhrases(model) {
    const phrases = /* @__PURE__ */ new Map();
    for (const agent of this.chatAgentService.getActivatedAgents()) {
      const agentPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]} ${VoiceChatService.CHAT_AGENT_ALIAS.get(agent.name) ?? agent.name}`.toLowerCase();
      phrases.set(agentPhrase, { agent: agent.name });
      for (const slashCommand of agent.slashCommands) {
        const slashCommandPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]} ${slashCommand.name}`.toLowerCase();
        phrases.set(slashCommandPhrase, { agent: agent.name, command: slashCommand.name });
        const agentSlashCommandPhrase = `${agentPhrase} ${slashCommandPhrase}`.toLowerCase();
        phrases.set(agentSlashCommandPhrase, { agent: agent.name, command: slashCommand.name });
      }
    }
    return phrases;
  }
  toText(value, type) {
    switch (type) {
      case 1 /* AGENT */:
        return `${VoiceChatService.AGENT_PREFIX}${value.agent}`;
      case 2 /* COMMAND */:
        return `${VoiceChatService.COMMAND_PREFIX}${value.command}`;
      case 3 /* AGENT_AND_COMMAND */:
        return `${VoiceChatService.AGENT_PREFIX}${value.agent} ${VoiceChatService.COMMAND_PREFIX}${value.command}`;
    }
  }
  async createVoiceChatSession(token, options) {
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = (dispose) => {
      this.activeVoiceChatSessions = Math.max(0, this.activeVoiceChatSessions - 1);
      if (this.activeVoiceChatSessions === 0) {
        this.voiceChatInProgress.reset();
      }
      if (dispose) {
        disposables.dispose();
      }
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));
    let detectedAgent = false;
    let detectedSlashCommand = false;
    const emitter = disposables.add(new Emitter());
    const session = await this.speechService.createSpeechToTextSession(token, "chat");
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled(true);
    }
    const phrases = this.createPhrases(options.model);
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case SpeechToTextStatus.Recognizing:
        case SpeechToTextStatus.Recognized: {
          let massagedEvent = e;
          if (e.text) {
            const startsWithAgent = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.AGENT_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]);
            const startsWithSlashCommand = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.COMMAND_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]);
            if (startsWithAgent || startsWithSlashCommand) {
              const originalWords = e.text.split(" ");
              let transformedWords;
              let waitingForInput = false;
              if (options.usesAgents && startsWithAgent && !detectedAgent && !detectedSlashCommand && originalWords.length >= 4) {
                const phrase = phrases.get(originalWords.slice(0, 4).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(phrase, 3 /* AGENT_AND_COMMAND */), ...originalWords.slice(4)];
                  waitingForInput = originalWords.length === 4;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedAgent = true;
                    detectedSlashCommand = true;
                  }
                }
              }
              if (options.usesAgents && startsWithAgent && !detectedAgent && !transformedWords && originalWords.length >= 2) {
                const phrase = phrases.get(originalWords.slice(0, 2).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(phrase, 1 /* AGENT */), ...originalWords.slice(2)];
                  waitingForInput = originalWords.length === 2;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedAgent = true;
                  }
                }
              }
              if (startsWithSlashCommand && !detectedSlashCommand && !transformedWords && originalWords.length >= 2) {
                const phrase = phrases.get(originalWords.slice(0, 2).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(
                    phrase,
                    options.usesAgents && !detectedAgent ? 3 /* AGENT_AND_COMMAND */ : (
                      // rewrite `/fix` to `@workspace /foo` in this case
                      2 /* COMMAND */
                    )
                    // when we have not yet detected an agent before
                  ), ...originalWords.slice(2)];
                  waitingForInput = originalWords.length === 2;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedSlashCommand = true;
                  }
                }
              }
              massagedEvent = {
                status: e.status,
                text: (transformedWords ?? originalWords).join(" "),
                waitingForInput
              };
            }
          }
          emitter.fire(massagedEvent);
          break;
        }
        case SpeechToTextStatus.Started:
          this.activeVoiceChatSessions++;
          this.voiceChatInProgress.set(true);
          emitter.fire(e);
          break;
        case SpeechToTextStatus.Stopped:
          onSessionStoppedOrCanceled(false);
          emitter.fire(e);
          break;
        case SpeechToTextStatus.Error:
          emitter.fire(e);
          break;
      }
    }));
    return {
      onDidChange: emitter.event
    };
  }
  normalizeWord(word) {
    word = rtrim(word, ".");
    word = rtrim(word, ",");
    word = rtrim(word, "?");
    return word.toLowerCase();
  }
};
VoiceChatService.AGENT_PREFIX = chatAgentLeader;
VoiceChatService.COMMAND_PREFIX = chatSubcommandLeader;
VoiceChatService.PHRASES_LOWER = {
  [VoiceChatService.AGENT_PREFIX]: "at",
  [VoiceChatService.COMMAND_PREFIX]: "slash"
};
VoiceChatService.PHRASES_UPPER = {
  [VoiceChatService.AGENT_PREFIX]: "At",
  [VoiceChatService.COMMAND_PREFIX]: "Slash"
};
VoiceChatService.CHAT_AGENT_ALIAS = /* @__PURE__ */ new Map([["vscode", "code"]]);
VoiceChatService = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IContextKeyService)
], VoiceChatService);
export {
  IVoiceChatService,
  VoiceChatInProgress,
  VoiceChatService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdm9pY2VDaGF0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJ0cmltIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBjaGF0U3ViY29tbWFuZExlYWRlciB9IGZyb20gJy4vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSVNwZWVjaFNlcnZpY2UsIElTcGVlY2hUb1RleHRFdmVudCwgU3BlZWNoVG9UZXh0U3RhdHVzIH0gZnJvbSAnLi4vLi4vc3BlZWNoL2NvbW1vbi9zcGVlY2hTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElWb2ljZUNoYXRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElWb2ljZUNoYXRTZXJ2aWNlPigndm9pY2VDaGF0U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUNoYXRTZXNzaW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHVzZXNBZ2VudHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBtb2RlbD86IElDaGF0TW9kZWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlQ2hhdFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2ltaWxhciB0byBgSVNwZWVjaFNlcnZpY2UuY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbmAsIGJ1dCB3aXRoXG5cdCAqIHN1cHBvcnQgZm9yIGFnZW50IHByZWZpeGVzIGFuZCBjb21tYW5kIHByZWZpeGVzLiBGb3IgZXhhbXBsZSxcblx0ICogaWYgdGhlIHVzZXIgc2F5cyBcImF0IHdvcmtzcGFjZSBzbGFzaCBmaXggdGhpcyBwcm9ibGVtXCIsIHRoZSByZXN1bHRcblx0ICogd2lsbCBiZSBcIkB3b3Jrc3BhY2UgL2ZpeCB0aGlzIHByb2JsZW1cIi5cblx0ICovXG5cdGNyZWF0ZVZvaWNlQ2hhdFNlc3Npb24odG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zOiBJVm9pY2VDaGF0U2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPElWb2ljZUNoYXRTZXNzaW9uPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VDaGF0VGV4dEV2ZW50IGV4dGVuZHMgSVNwZWVjaFRvVGV4dEV2ZW50IHtcblxuXHQvKipcblx0ICogVGhpcyBwcm9wZXJ0eSB3aWxsIGJlIGB0cnVlYCB3aGVuIHRoZSB0ZXh0IHJlY29nbml6ZWRcblx0ICogc28gZmFyIG9ubHkgY29uc2lzdHMgb2YgYWdlbnQgcHJlZml4ZXMgKGBAd29ya3NwYWNlYClcblx0ICogYW5kL29yIGNvbW1hbmQgcHJlZml4ZXMgKGBAd29ya3NwYWNlIC9maXhgKS5cblx0ICovXG5cdHJlYWRvbmx5IHdhaXRpbmdGb3JJbnB1dD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlQ2hhdFNlc3Npb24ge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SVZvaWNlQ2hhdFRleHRFdmVudD47XG59XG5cbmludGVyZmFjZSBJUGhyYXNlVmFsdWUge1xuXHRyZWFkb25seSBhZ2VudDogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nO1xufVxuXG5lbnVtIFBocmFzZVRleHRUeXBlIHtcblx0QUdFTlQgPSAxLFxuXHRDT01NQU5EID0gMixcblx0QUdFTlRfQU5EX0NPTU1BTkQgPSAzXG59XG5cbmV4cG9ydCBjb25zdCBWb2ljZUNoYXRJblByb2dyZXNzID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3ZvaWNlQ2hhdEluUHJvZ3Jlc3MnLCBmYWxzZSwgeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndm9pY2VDaGF0SW5Qcm9ncmVzcycsIFwiQSBzcGVlY2gtdG8tdGV4dCBzZXNzaW9uIGlzIGluIHByb2dyZXNzIGZvciBjaGF0LlwiKSB9KTtcblxuZXhwb3J0IGNsYXNzIFZvaWNlQ2hhdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVZvaWNlQ2hhdFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBBR0VOVF9QUkVGSVggPSBjaGF0QWdlbnRMZWFkZXI7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENPTU1BTkRfUFJFRklYID0gY2hhdFN1YmNvbW1hbmRMZWFkZXI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUEhSQVNFU19MT1dFUiA9IHtcblx0XHRbdGhpcy5BR0VOVF9QUkVGSVhdOiAnYXQnLFxuXHRcdFt0aGlzLkNPTU1BTkRfUFJFRklYXTogJ3NsYXNoJ1xuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBIUkFTRVNfVVBQRVIgPSB7XG5cdFx0W3RoaXMuQUdFTlRfUFJFRklYXTogJ0F0Jyxcblx0XHRbdGhpcy5DT01NQU5EX1BSRUZJWF06ICdTbGFzaCdcblx0fTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDSEFUX0FHRU5UX0FMSUFTID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oW1sndnNjb2RlJywgJ2NvZGUnXV0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdm9pY2VDaGF0SW5Qcm9ncmVzczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgYWN0aXZlVm9pY2VDaGF0U2Vzc2lvbnMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3BlZWNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNwZWVjaFNlcnZpY2U6IElTcGVlY2hTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy52b2ljZUNoYXRJblByb2dyZXNzID0gVm9pY2VDaGF0SW5Qcm9ncmVzcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQaHJhc2VzKG1vZGVsPzogSUNoYXRNb2RlbCk6IE1hcDxzdHJpbmcsIElQaHJhc2VWYWx1ZT4ge1xuXHRcdGNvbnN0IHBocmFzZXMgPSBuZXcgTWFwPHN0cmluZywgSVBocmFzZVZhbHVlPigpO1xuXG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWN0aXZhdGVkQWdlbnRzKCkpIHtcblx0XHRcdGNvbnN0IGFnZW50UGhyYXNlID0gYCR7Vm9pY2VDaGF0U2VydmljZS5QSFJBU0VTX0xPV0VSW1ZvaWNlQ2hhdFNlcnZpY2UuQUdFTlRfUFJFRklYXX0gJHtWb2ljZUNoYXRTZXJ2aWNlLkNIQVRfQUdFTlRfQUxJQVMuZ2V0KGFnZW50Lm5hbWUpID8/IGFnZW50Lm5hbWV9YC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0cGhyYXNlcy5zZXQoYWdlbnRQaHJhc2UsIHsgYWdlbnQ6IGFnZW50Lm5hbWUgfSk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2xhc2hDb21tYW5kIG9mIGFnZW50LnNsYXNoQ29tbWFuZHMpIHtcblx0XHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kUGhyYXNlID0gYCR7Vm9pY2VDaGF0U2VydmljZS5QSFJBU0VTX0xPV0VSW1ZvaWNlQ2hhdFNlcnZpY2UuQ09NTUFORF9QUkVGSVhdfSAke3NsYXNoQ29tbWFuZC5uYW1lfWAudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0cGhyYXNlcy5zZXQoc2xhc2hDb21tYW5kUGhyYXNlLCB7IGFnZW50OiBhZ2VudC5uYW1lLCBjb21tYW5kOiBzbGFzaENvbW1hbmQubmFtZSB9KTtcblxuXHRcdFx0XHRjb25zdCBhZ2VudFNsYXNoQ29tbWFuZFBocmFzZSA9IGAke2FnZW50UGhyYXNlfSAke3NsYXNoQ29tbWFuZFBocmFzZX1gLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdHBocmFzZXMuc2V0KGFnZW50U2xhc2hDb21tYW5kUGhyYXNlLCB7IGFnZW50OiBhZ2VudC5uYW1lLCBjb21tYW5kOiBzbGFzaENvbW1hbmQubmFtZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcGhyYXNlcztcblx0fVxuXG5cdHByaXZhdGUgdG9UZXh0KHZhbHVlOiBJUGhyYXNlVmFsdWUsIHR5cGU6IFBocmFzZVRleHRUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUGhyYXNlVGV4dFR5cGUuQUdFTlQ6XG5cdFx0XHRcdHJldHVybiBgJHtWb2ljZUNoYXRTZXJ2aWNlLkFHRU5UX1BSRUZJWH0ke3ZhbHVlLmFnZW50fWA7XG5cdFx0XHRjYXNlIFBocmFzZVRleHRUeXBlLkNPTU1BTkQ6XG5cdFx0XHRcdHJldHVybiBgJHtWb2ljZUNoYXRTZXJ2aWNlLkNPTU1BTkRfUFJFRklYfSR7dmFsdWUuY29tbWFuZH1gO1xuXHRcdFx0Y2FzZSBQaHJhc2VUZXh0VHlwZS5BR0VOVF9BTkRfQ09NTUFORDpcblx0XHRcdFx0cmV0dXJuIGAke1ZvaWNlQ2hhdFNlcnZpY2UuQUdFTlRfUFJFRklYfSR7dmFsdWUuYWdlbnR9ICR7Vm9pY2VDaGF0U2VydmljZS5DT01NQU5EX1BSRUZJWH0ke3ZhbHVlLmNvbW1hbmR9YDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGVWb2ljZUNoYXRTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgb3B0aW9uczogSVZvaWNlQ2hhdFNlc3Npb25PcHRpb25zKTogUHJvbWlzZTxJVm9pY2VDaGF0U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQgPSAoZGlzcG9zZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmVWb2ljZUNoYXRTZXNzaW9ucyA9IE1hdGgubWF4KDAsIHRoaXMuYWN0aXZlVm9pY2VDaGF0U2Vzc2lvbnMgLSAxKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZVZvaWNlQ2hhdFNlc3Npb25zID09PSAwKSB7XG5cdFx0XHRcdHRoaXMudm9pY2VDaGF0SW5Qcm9ncmVzcy5yZXNldCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlzcG9zZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCh0cnVlKSkpO1xuXG5cdFx0bGV0IGRldGVjdGVkQWdlbnQgPSBmYWxzZTtcblx0XHRsZXQgZGV0ZWN0ZWRTbGFzaENvbW1hbmQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVZvaWNlQ2hhdFRleHRFdmVudD4oKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuc3BlZWNoU2VydmljZS5jcmVhdGVTcGVlY2hUb1RleHRTZXNzaW9uKHRva2VuLCAnY2hhdCcpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCh0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBwaHJhc2VzID0gdGhpcy5jcmVhdGVQaHJhc2VzKG9wdGlvbnMubW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlLnN0YXR1cykge1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZzpcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZDoge1xuXHRcdFx0XHRcdGxldCBtYXNzYWdlZEV2ZW50OiBJVm9pY2VDaGF0VGV4dEV2ZW50ID0gZTtcblx0XHRcdFx0XHRpZiAoZS50ZXh0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydHNXaXRoQWdlbnQgPSBlLnRleHQuc3RhcnRzV2l0aChWb2ljZUNoYXRTZXJ2aWNlLlBIUkFTRVNfVVBQRVJbVm9pY2VDaGF0U2VydmljZS5BR0VOVF9QUkVGSVhdKSB8fCBlLnRleHQuc3RhcnRzV2l0aChWb2ljZUNoYXRTZXJ2aWNlLlBIUkFTRVNfTE9XRVJbVm9pY2VDaGF0U2VydmljZS5BR0VOVF9QUkVGSVhdKTtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0c1dpdGhTbGFzaENvbW1hbmQgPSBlLnRleHQuc3RhcnRzV2l0aChWb2ljZUNoYXRTZXJ2aWNlLlBIUkFTRVNfVVBQRVJbVm9pY2VDaGF0U2VydmljZS5DT01NQU5EX1BSRUZJWF0pIHx8IGUudGV4dC5zdGFydHNXaXRoKFZvaWNlQ2hhdFNlcnZpY2UuUEhSQVNFU19MT1dFUltWb2ljZUNoYXRTZXJ2aWNlLkNPTU1BTkRfUFJFRklYXSk7XG5cdFx0XHRcdFx0XHRpZiAoc3RhcnRzV2l0aEFnZW50IHx8IHN0YXJ0c1dpdGhTbGFzaENvbW1hbmQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxXb3JkcyA9IGUudGV4dC5zcGxpdCgnICcpO1xuXHRcdFx0XHRcdFx0XHRsZXQgdHJhbnNmb3JtZWRXb3Jkczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdFx0bGV0IHdhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xuXG5cdFx0XHRcdFx0XHRcdC8vIENoZWNrIGZvciBhZ2VudCArIHNsYXNoIGNvbW1hbmRcblx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnMudXNlc0FnZW50cyAmJiBzdGFydHNXaXRoQWdlbnQgJiYgIWRldGVjdGVkQWdlbnQgJiYgIWRldGVjdGVkU2xhc2hDb21tYW5kICYmIG9yaWdpbmFsV29yZHMubGVuZ3RoID49IDQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwaHJhc2UgPSBwaHJhc2VzLmdldChvcmlnaW5hbFdvcmRzLnNsaWNlKDAsIDQpLm1hcCh3b3JkID0+IHRoaXMubm9ybWFsaXplV29yZCh3b3JkKSkuam9pbignICcpKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGhyYXNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0cmFuc2Zvcm1lZFdvcmRzID0gW3RoaXMudG9UZXh0KHBocmFzZSwgUGhyYXNlVGV4dFR5cGUuQUdFTlRfQU5EX0NPTU1BTkQpLCAuLi5vcmlnaW5hbFdvcmRzLnNsaWNlKDQpXTtcblxuXHRcdFx0XHRcdFx0XHRcdFx0d2FpdGluZ0ZvcklucHV0ID0gb3JpZ2luYWxXb3Jkcy5sZW5ndGggPT09IDQ7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChlLnN0YXR1cyA9PT0gU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRBZ2VudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRldGVjdGVkU2xhc2hDb21tYW5kID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvLyBDaGVjayBmb3IgYWdlbnQgKGlmIG5vdCBkb25lIGFscmVhZHkpXG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zLnVzZXNBZ2VudHMgJiYgc3RhcnRzV2l0aEFnZW50ICYmICFkZXRlY3RlZEFnZW50ICYmICF0cmFuc2Zvcm1lZFdvcmRzICYmIG9yaWdpbmFsV29yZHMubGVuZ3RoID49IDIpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwaHJhc2UgPSBwaHJhc2VzLmdldChvcmlnaW5hbFdvcmRzLnNsaWNlKDAsIDIpLm1hcCh3b3JkID0+IHRoaXMubm9ybWFsaXplV29yZCh3b3JkKSkuam9pbignICcpKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGhyYXNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0cmFuc2Zvcm1lZFdvcmRzID0gW3RoaXMudG9UZXh0KHBocmFzZSwgUGhyYXNlVGV4dFR5cGUuQUdFTlQpLCAuLi5vcmlnaW5hbFdvcmRzLnNsaWNlKDIpXTtcblxuXHRcdFx0XHRcdFx0XHRcdFx0d2FpdGluZ0ZvcklucHV0ID0gb3JpZ2luYWxXb3Jkcy5sZW5ndGggPT09IDI7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChlLnN0YXR1cyA9PT0gU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRBZ2VudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHNsYXNoIGNvbW1hbmQgKGlmIG5vdCBkb25lIGFscmVhZHkpXG5cdFx0XHRcdFx0XHRcdGlmIChzdGFydHNXaXRoU2xhc2hDb21tYW5kICYmICFkZXRlY3RlZFNsYXNoQ29tbWFuZCAmJiAhdHJhbnNmb3JtZWRXb3JkcyAmJiBvcmlnaW5hbFdvcmRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGhyYXNlID0gcGhyYXNlcy5nZXQob3JpZ2luYWxXb3Jkcy5zbGljZSgwLCAyKS5tYXAod29yZCA9PiB0aGlzLm5vcm1hbGl6ZVdvcmQod29yZCkpLmpvaW4oJyAnKSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBocmFzZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHJhbnNmb3JtZWRXb3JkcyA9IFt0aGlzLnRvVGV4dChwaHJhc2UsIG9wdGlvbnMudXNlc0FnZW50cyAmJiAhZGV0ZWN0ZWRBZ2VudCA/XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFBocmFzZVRleHRUeXBlLkFHRU5UX0FORF9DT01NQU5EIDogXHQvLyByZXdyaXRlIGAvZml4YCB0byBgQHdvcmtzcGFjZSAvZm9vYCBpbiB0aGlzIGNhc2Vcblx0XHRcdFx0XHRcdFx0XHRcdFx0UGhyYXNlVGV4dFR5cGUuQ09NTUFORFx0XHRcdFx0Ly8gd2hlbiB3ZSBoYXZlIG5vdCB5ZXQgZGV0ZWN0ZWQgYW4gYWdlbnQgYmVmb3JlXG5cdFx0XHRcdFx0XHRcdFx0XHQpLCAuLi5vcmlnaW5hbFdvcmRzLnNsaWNlKDIpXTtcblxuXHRcdFx0XHRcdFx0XHRcdFx0d2FpdGluZ0ZvcklucHV0ID0gb3JpZ2luYWxXb3Jkcy5sZW5ndGggPT09IDI7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChlLnN0YXR1cyA9PT0gU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRTbGFzaENvbW1hbmQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdG1hc3NhZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRcdFx0c3RhdHVzOiBlLnN0YXR1cyxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAodHJhbnNmb3JtZWRXb3JkcyA/PyBvcmlnaW5hbFdvcmRzKS5qb2luKCcgJyksXG5cdFx0XHRcdFx0XHRcdFx0d2FpdGluZ0ZvcklucHV0XG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShtYXNzYWdlZEV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5TdGFydGVkOlxuXHRcdFx0XHRcdHRoaXMuYWN0aXZlVm9pY2VDaGF0U2Vzc2lvbnMrKztcblx0XHRcdFx0XHR0aGlzLnZvaWNlQ2hhdEluUHJvZ3Jlc3Muc2V0KHRydWUpO1xuXHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZChmYWxzZSk7XG5cdFx0XHRcdFx0ZW1pdHRlci5maXJlKGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5FcnJvcjpcblx0XHRcdFx0XHRlbWl0dGVyLmZpcmUoZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgbm9ybWFsaXplV29yZCh3b3JkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHdvcmQgPSBydHJpbSh3b3JkLCAnLicpO1xuXHRcdHdvcmQgPSBydHJpbSh3b3JkLCAnLCcpO1xuXHRcdHdvcmQgPSBydHJpbSh3b3JkLCAnPycpO1xuXG5cdFx0cmV0dXJuIHdvcmQudG9Mb3dlckNhc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBQ3RCLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxpQkFBaUIsNEJBQTRCO0FBQ3RELFNBQVMsZ0JBQW9DLDBCQUEwQjtBQUVoRSxNQUFNLG9CQUFvQixnQkFBbUMsa0JBQWtCO0FBdUN0RixJQUFLLGlCQUFMLGtCQUFLQSxvQkFBTDtB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
