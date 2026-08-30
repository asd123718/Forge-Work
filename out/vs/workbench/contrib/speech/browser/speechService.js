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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { HasSpeechProvider, SpeechToTextInProgress, KeywordRecognitionStatus, SpeechToTextStatus, speechLanguageConfigToLanguage, SPEECH_LANGUAGE_CONFIG, TextToSpeechInProgress, TextToSpeechStatus } from "../common/speechService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
const speechProvidersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "speechProviders",
  jsonSchema: {
    description: localize("vscode.extension.contributes.speechProvider", "Contributes a Speech Provider"),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { name: "", description: "" } }],
      required: ["name"],
      properties: {
        name: {
          description: localize("speechProviderName", "Unique name for this Speech Provider."),
          type: "string"
        },
        description: {
          description: localize("speechProviderDescription", "A description of this Speech Provider, shown in the UI."),
          type: "string"
        }
      }
    }
  }
});
let SpeechService = class extends Disposable {
  constructor(logService, contextKeyService, hostService, telemetryService, configurationService, extensionService) {
    super();
    this.logService = logService;
    this.hostService = hostService;
    this.telemetryService = telemetryService;
    this.configurationService = configurationService;
    this.extensionService = extensionService;
    this._onDidChangeHasSpeechProvider = this._register(new Emitter());
    this.onDidChangeHasSpeechProvider = this._onDidChangeHasSpeechProvider.event;
    this.providers = /* @__PURE__ */ new Map();
    this.providerDescriptors = /* @__PURE__ */ new Map();
    //#region Speech to Text
    this._onDidStartSpeechToTextSession = this._register(new Emitter());
    this.onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;
    this._onDidEndSpeechToTextSession = this._register(new Emitter());
    this.onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;
    this.activeSpeechToTextSessions = 0;
    //#endregion
    //#region Text to Speech
    this._onDidStartTextToSpeechSession = this._register(new Emitter());
    this.onDidStartTextToSpeechSession = this._onDidStartTextToSpeechSession.event;
    this._onDidEndTextToSpeechSession = this._register(new Emitter());
    this.onDidEndTextToSpeechSession = this._onDidEndTextToSpeechSession.event;
    this.activeTextToSpeechSessions = 0;
    //#endregion
    //#region Keyword Recognition
    this._onDidStartKeywordRecognition = this._register(new Emitter());
    this.onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;
    this._onDidEndKeywordRecognition = this._register(new Emitter());
    this.onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;
    this.activeKeywordRecognitionSessions = 0;
    this.hasSpeechProviderContext = HasSpeechProvider.bindTo(contextKeyService);
    this.textToSpeechInProgress = TextToSpeechInProgress.bindTo(contextKeyService);
    this.speechToTextInProgress = SpeechToTextInProgress.bindTo(contextKeyService);
    this.handleAndRegisterSpeechExtensions();
  }
  get hasSpeechProvider() {
    return this.providerDescriptors.size > 0 || this.providers.size > 0;
  }
  handleAndRegisterSpeechExtensions() {
    speechProvidersExtensionPoint.setHandler((extensions, delta) => {
      const oldHasSpeechProvider = this.hasSpeechProvider;
      for (const extension of delta.removed) {
        for (const descriptor of extension.value) {
          this.providerDescriptors.delete(descriptor.name);
        }
      }
      for (const extension of delta.added) {
        for (const descriptor of extension.value) {
          this.providerDescriptors.set(descriptor.name, descriptor);
        }
      }
      if (oldHasSpeechProvider !== this.hasSpeechProvider) {
        this.handleHasSpeechProviderChange();
      }
    });
  }
  registerSpeechProvider(identifier, provider) {
    if (this.providers.has(identifier)) {
      throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
    }
    const oldHasSpeechProvider = this.hasSpeechProvider;
    this.providers.set(identifier, provider);
    if (oldHasSpeechProvider !== this.hasSpeechProvider) {
      this.handleHasSpeechProviderChange();
    }
    return toDisposable(() => {
      const oldHasSpeechProvider2 = this.hasSpeechProvider;
      this.providers.delete(identifier);
      if (oldHasSpeechProvider2 !== this.hasSpeechProvider) {
        this.handleHasSpeechProviderChange();
      }
    });
  }
  handleHasSpeechProviderChange() {
    this.hasSpeechProviderContext.set(this.hasSpeechProvider);
    this._onDidChangeHasSpeechProvider.fire();
  }
  get hasActiveSpeechToTextSession() {
    return this.activeSpeechToTextSessions > 0;
  }
  async createSpeechToTextSession(token, context = "speech") {
    const provider = await this.getProvider();
    const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
    const session = provider.createSpeechToTextSession(token, typeof language === "string" ? { language } : void 0);
    const sessionStart = Date.now();
    let sessionRecognized = false;
    let sessionError = false;
    let sessionContentLength = 0;
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = () => {
      this.activeSpeechToTextSessions = Math.max(0, this.activeSpeechToTextSessions - 1);
      if (!this.hasActiveSpeechToTextSession) {
        this.speechToTextInProgress.reset();
      }
      this._onDidEndSpeechToTextSession.fire();
      this.telemetryService.publicLog2("speechToTextSession", {
        context,
        sessionDuration: Date.now() - sessionStart,
        sessionRecognized,
        sessionError,
        sessionContentLength,
        sessionLanguage: language
      });
      disposables.dispose();
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled();
    }
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case SpeechToTextStatus.Started:
          this.activeSpeechToTextSessions++;
          this.speechToTextInProgress.set(true);
          this._onDidStartSpeechToTextSession.fire();
          break;
        case SpeechToTextStatus.Recognizing:
          sessionRecognized = true;
          break;
        case SpeechToTextStatus.Recognized:
          if (typeof e.text === "string") {
            sessionContentLength += e.text.length;
          }
          break;
        case SpeechToTextStatus.Stopped:
          onSessionStoppedOrCanceled();
          break;
        case SpeechToTextStatus.Error:
          this.logService.error(`Speech provider error in speech to text session: ${e.text}`);
          sessionError = true;
          break;
      }
    }));
    return session;
  }
  async getProvider() {
    await this.extensionService.activateByEvent("onSpeech");
    const provider = Array.from(this.providers.values()).at(0);
    if (!provider) {
      throw new Error(`No Speech provider is registered.`);
    } else if (this.providers.size > 1) {
      this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
    }
    return provider;
  }
  get hasActiveTextToSpeechSession() {
    return this.activeTextToSpeechSessions > 0;
  }
  async createTextToSpeechSession(token, context = "speech") {
    const provider = await this.getProvider();
    const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
    const session = provider.createTextToSpeechSession(token, typeof language === "string" ? { language } : void 0);
    const sessionStart = Date.now();
    let sessionError = false;
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = (dispose) => {
      this.activeTextToSpeechSessions = Math.max(0, this.activeTextToSpeechSessions - 1);
      if (!this.hasActiveTextToSpeechSession) {
        this.textToSpeechInProgress.reset();
      }
      this._onDidEndTextToSpeechSession.fire();
      this.telemetryService.publicLog2("textToSpeechSession", {
        context,
        sessionDuration: Date.now() - sessionStart,
        sessionError,
        sessionLanguage: language
      });
      if (dispose) {
        disposables.dispose();
      }
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled(true);
    }
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case TextToSpeechStatus.Started:
          this.activeTextToSpeechSessions++;
          this.textToSpeechInProgress.set(true);
          this._onDidStartTextToSpeechSession.fire();
          break;
        case TextToSpeechStatus.Stopped:
          onSessionStoppedOrCanceled(false);
          break;
        case TextToSpeechStatus.Error:
          this.logService.error(`Speech provider error in text to speech session: ${e.text}`);
          sessionError = true;
          break;
      }
    }));
    return session;
  }
  get hasActiveKeywordRecognition() {
    return this.activeKeywordRecognitionSessions > 0;
  }
  async recognizeKeyword(token) {
    const result = new DeferredPromise();
    const disposables = new DisposableStore();
    disposables.add(token.onCancellationRequested(() => {
      disposables.dispose();
      result.complete(KeywordRecognitionStatus.Canceled);
    }));
    const recognizeKeywordDisposables = disposables.add(new DisposableStore());
    let activeRecognizeKeywordSession = void 0;
    const recognizeKeyword = () => {
      recognizeKeywordDisposables.clear();
      const cts = new CancellationTokenSource(token);
      recognizeKeywordDisposables.add(toDisposable(() => cts.dispose(true)));
      const currentRecognizeKeywordSession = activeRecognizeKeywordSession = this.doRecognizeKeyword(cts.token).then((status2) => {
        if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
          result.complete(status2);
        }
      }, (error) => {
        if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
          result.error(error);
        }
      });
    };
    disposables.add(this.hostService.onDidChangeFocus((focused) => {
      if (!focused && activeRecognizeKeywordSession) {
        recognizeKeywordDisposables.clear();
        activeRecognizeKeywordSession = void 0;
      } else if (!activeRecognizeKeywordSession) {
        recognizeKeyword();
      }
    }));
    if (this.hostService.hasFocus) {
      recognizeKeyword();
    }
    let status;
    try {
      status = await result.p;
    } finally {
      disposables.dispose();
    }
    this.telemetryService.publicLog2("keywordRecognition", {
      keywordRecognized: status === KeywordRecognitionStatus.Recognized
    });
    return status;
  }
  async doRecognizeKeyword(token) {
    const provider = await this.getProvider();
    const session = provider.createKeywordRecognitionSession(token);
    this.activeKeywordRecognitionSessions++;
    this._onDidStartKeywordRecognition.fire();
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = () => {
      this.activeKeywordRecognitionSessions = Math.max(0, this.activeKeywordRecognitionSessions - 1);
      this._onDidEndKeywordRecognition.fire();
      disposables.dispose();
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled();
    }
    disposables.add(session.onDidChange((e) => {
      if (e.status === KeywordRecognitionStatus.Stopped) {
        onSessionStoppedOrCanceled();
      }
    }));
    try {
      return (await Event.toPromise(session.onDidChange)).status;
    } finally {
      onSessionStoppedOrCanceled();
    }
  }
  //#endregion
};
SpeechService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHostService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IExtensionService)
], SpeechService);
export {
  SpeechService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNwZWVjaFxcYnJvd3Nlclxcc3BlZWNoU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTcGVlY2hTZXJ2aWNlLCBJU3BlZWNoUHJvdmlkZXIsIEhhc1NwZWVjaFByb3ZpZGVyLCBJU3BlZWNoVG9UZXh0U2Vzc2lvbiwgU3BlZWNoVG9UZXh0SW5Qcm9ncmVzcywgS2V5d29yZFJlY29nbml0aW9uU3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMsIHNwZWVjaExhbmd1YWdlQ29uZmlnVG9MYW5ndWFnZSwgU1BFRUNIX0xBTkdVQUdFX0NPTkZJRywgSVRleHRUb1NwZWVjaFNlc3Npb24sIFRleHRUb1NwZWVjaEluUHJvZ3Jlc3MsIFRleHRUb1NwZWVjaFN0YXR1cyB9IGZyb20gJy4uL2NvbW1vbi9zcGVlY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU3BlZWNoUHJvdmlkZXJEZXNjcmlwdG9yIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuY29uc3Qgc3BlZWNoUHJvdmlkZXJzRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJU3BlZWNoUHJvdmlkZXJEZXNjcmlwdG9yW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdzcGVlY2hQcm92aWRlcnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnNwZWVjaFByb3ZpZGVyJywgJ0NvbnRyaWJ1dGVzIGEgU3BlZWNoIFByb3ZpZGVyJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbmFtZTogJycsIGRlc2NyaXB0aW9uOiAnJyB9IH1dLFxuXHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzcGVlY2hQcm92aWRlck5hbWUnLCBcIlVuaXF1ZSBuYW1lIGZvciB0aGlzIFNwZWVjaCBQcm92aWRlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NwZWVjaFByb3ZpZGVyRGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2YgdGhpcyBTcGVlY2ggUHJvdmlkZXIsIHNob3duIGluIHRoZSBVSS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBTcGVlY2hTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTcGVlY2hTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIYXNTcGVlY2hQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhhc1NwZWVjaFByb3ZpZGVyID0gdGhpcy5fb25EaWRDaGFuZ2VIYXNTcGVlY2hQcm92aWRlci5ldmVudDtcblxuXHRnZXQgaGFzU3BlZWNoUHJvdmlkZXIoKSB7IHJldHVybiB0aGlzLnByb3ZpZGVyRGVzY3JpcHRvcnMuc2l6ZSA+IDAgfHwgdGhpcy5wcm92aWRlcnMuc2l6ZSA+IDA7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJU3BlZWNoUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXJEZXNjcmlwdG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBJU3BlZWNoUHJvdmlkZXJEZXNjcmlwdG9yPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzU3BlZWNoUHJvdmlkZXJDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaGFzU3BlZWNoUHJvdmlkZXJDb250ZXh0ID0gSGFzU3BlZWNoUHJvdmlkZXIuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRleHRUb1NwZWVjaEluUHJvZ3Jlc3MgPSBUZXh0VG9TcGVlY2hJblByb2dyZXNzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zcGVlY2hUb1RleHRJblByb2dyZXNzID0gU3BlZWNoVG9UZXh0SW5Qcm9ncmVzcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5oYW5kbGVBbmRSZWdpc3RlclNwZWVjaEV4dGVuc2lvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQW5kUmVnaXN0ZXJTcGVlY2hFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdHNwZWVjaFByb3ZpZGVyc0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRjb25zdCBvbGRIYXNTcGVlY2hQcm92aWRlciA9IHRoaXMuaGFzU3BlZWNoUHJvdmlkZXI7XG5cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMucHJvdmlkZXJEZXNjcmlwdG9ycy5kZWxldGUoZGVzY3JpcHRvci5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2YgZXh0ZW5zaW9uLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm92aWRlckRlc2NyaXB0b3JzLnNldChkZXNjcmlwdG9yLm5hbWUsIGRlc2NyaXB0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvbGRIYXNTcGVlY2hQcm92aWRlciAhPT0gdGhpcy5oYXNTcGVlY2hQcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUhhc1NwZWVjaFByb3ZpZGVyQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlclNwZWVjaFByb3ZpZGVyKGlkZW50aWZpZXI6IHN0cmluZywgcHJvdmlkZXI6IElTcGVlY2hQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5wcm92aWRlcnMuaGFzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNwZWVjaCBwcm92aWRlciB3aXRoIGlkZW50aWZpZXIgJHtpZGVudGlmaWVyfSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkSGFzU3BlZWNoUHJvdmlkZXIgPSB0aGlzLmhhc1NwZWVjaFByb3ZpZGVyO1xuXG5cdFx0dGhpcy5wcm92aWRlcnMuc2V0KGlkZW50aWZpZXIsIHByb3ZpZGVyKTtcblxuXHRcdGlmIChvbGRIYXNTcGVlY2hQcm92aWRlciAhPT0gdGhpcy5oYXNTcGVlY2hQcm92aWRlcikge1xuXHRcdFx0dGhpcy5oYW5kbGVIYXNTcGVlY2hQcm92aWRlckNoYW5nZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb2xkSGFzU3BlZWNoUHJvdmlkZXIgPSB0aGlzLmhhc1NwZWVjaFByb3ZpZGVyO1xuXG5cdFx0XHR0aGlzLnByb3ZpZGVycy5kZWxldGUoaWRlbnRpZmllcik7XG5cblx0XHRcdGlmIChvbGRIYXNTcGVlY2hQcm92aWRlciAhPT0gdGhpcy5oYXNTcGVlY2hQcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUhhc1NwZWVjaFByb3ZpZGVyQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUhhc1NwZWVjaFByb3ZpZGVyQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuaGFzU3BlZWNoUHJvdmlkZXJDb250ZXh0LnNldCh0aGlzLmhhc1NwZWVjaFByb3ZpZGVyKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGFzU3BlZWNoUHJvdmlkZXIuZmlyZSgpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFNwZWVjaCB0byBUZXh0XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFNwZWVjaFRvVGV4dFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFNwZWVjaFRvVGV4dFNlc3Npb24gPSB0aGlzLl9vbkRpZFN0YXJ0U3BlZWNoVG9UZXh0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZFNwZWVjaFRvVGV4dFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbmRTcGVlY2hUb1RleHRTZXNzaW9uID0gdGhpcy5fb25EaWRFbmRTcGVlY2hUb1RleHRTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgYWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbnMgPSAwO1xuXHRnZXQgaGFzQWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbigpIHsgcmV0dXJuIHRoaXMuYWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbnMgPiAwOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBzcGVlY2hUb1RleHRJblByb2dyZXNzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRhc3luYyBjcmVhdGVTcGVlY2hUb1RleHRTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogc3RyaW5nID0gJ3NwZWVjaCcpOiBQcm9taXNlPElTcGVlY2hUb1RleHRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLmdldFByb3ZpZGVyKCk7XG5cblx0XHRjb25zdCBsYW5ndWFnZSA9IHNwZWVjaExhbmd1YWdlQ29uZmlnVG9MYW5ndWFnZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHVua25vd24+KFNQRUVDSF9MQU5HVUFHRV9DT05GSUcpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbih0b2tlbiwgdHlwZW9mIGxhbmd1YWdlID09PSAnc3RyaW5nJyA/IHsgbGFuZ3VhZ2UgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGxldCBzZXNzaW9uUmVjb2duaXplZCA9IGZhbHNlO1xuXHRcdGxldCBzZXNzaW9uRXJyb3IgPSBmYWxzZTtcblx0XHRsZXQgc2Vzc2lvbkNvbnRlbnRMZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCA9ICgpID0+IHtcblx0XHRcdHRoaXMuYWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbnMgPSBNYXRoLm1heCgwLCB0aGlzLmFjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb25zIC0gMSk7XG5cdFx0XHRpZiAoIXRoaXMuaGFzQWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLnNwZWVjaFRvVGV4dEluUHJvZ3Jlc3MucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRW5kU3BlZWNoVG9UZXh0U2Vzc2lvbi5maXJlKCk7XG5cblx0XHRcdHR5cGUgU3BlZWNoVG9UZXh0U2Vzc2lvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0XHRjb21tZW50OiAnQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIGEgc3BlZWNoIHRvIHRleHQgc2Vzc2lvbiBpcyBjcmVhdGVkJztcblx0XHRcdFx0Y29udGV4dDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0NvbnRleHQgb2YgdGhlIHNlc3Npb24uJyB9O1xuXHRcdFx0XHRzZXNzaW9uRHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdEdXJhdGlvbiBvZiB0aGUgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdHNlc3Npb25SZWNvZ25pemVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWYgc3BlZWNoIHdhcyByZWNvZ25pemVkLicgfTtcblx0XHRcdFx0c2Vzc2lvbkVycm9yOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWYgc3BlZWNoIHJlc3VsdGVkIGluIGVycm9yLicgfTtcblx0XHRcdFx0c2Vzc2lvbkNvbnRlbnRMZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdMZW5ndGggb2YgdGhlIHJlY29nbml6ZWQgdGV4dC4nIH07XG5cdFx0XHRcdHNlc3Npb25MYW5ndWFnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0NvbmZpZ3VyZWQgbGFuZ3VhZ2UgZm9yIHRoZSBzZXNzaW9uLicgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIFNwZWVjaFRvVGV4dFNlc3Npb25FdmVudCA9IHtcblx0XHRcdFx0Y29udGV4dDogc3RyaW5nO1xuXHRcdFx0XHRzZXNzaW9uRHVyYXRpb246IG51bWJlcjtcblx0XHRcdFx0c2Vzc2lvblJlY29nbml6ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdHNlc3Npb25FcnJvcjogYm9vbGVhbjtcblx0XHRcdFx0c2Vzc2lvbkNvbnRlbnRMZW5ndGg6IG51bWJlcjtcblx0XHRcdFx0c2Vzc2lvbkxhbmd1YWdlOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U3BlZWNoVG9UZXh0U2Vzc2lvbkV2ZW50LCBTcGVlY2hUb1RleHRTZXNzaW9uQ2xhc3NpZmljYXRpb24+KCdzcGVlY2hUb1RleHRTZXNzaW9uJywge1xuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRzZXNzaW9uRHVyYXRpb246IERhdGUubm93KCkgLSBzZXNzaW9uU3RhcnQsXG5cdFx0XHRcdHNlc3Npb25SZWNvZ25pemVkLFxuXHRcdFx0XHRzZXNzaW9uRXJyb3IsXG5cdFx0XHRcdHNlc3Npb25Db250ZW50TGVuZ3RoLFxuXHRcdFx0XHRzZXNzaW9uTGFuZ3VhZ2U6IGxhbmd1YWdlXG5cdFx0XHR9KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKSkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5zdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RhcnRlZDpcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb25zKys7XG5cdFx0XHRcdFx0dGhpcy5zcGVlY2hUb1RleHRJblByb2dyZXNzLnNldCh0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFN0YXJ0U3BlZWNoVG9UZXh0U2Vzc2lvbi5maXJlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nOlxuXHRcdFx0XHRcdHNlc3Npb25SZWNvZ25pemVkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZDpcblx0XHRcdFx0XHRpZiAodHlwZW9mIGUudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHNlc3Npb25Db250ZW50TGVuZ3RoICs9IGUudGV4dC5sZW5ndGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5TdG9wcGVkOlxuXHRcdFx0XHRcdG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLkVycm9yOlxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgU3BlZWNoIHByb3ZpZGVyIGVycm9yIGluIHNwZWVjaCB0byB0ZXh0IHNlc3Npb246ICR7ZS50ZXh0fWApO1xuXHRcdFx0XHRcdHNlc3Npb25FcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByb3ZpZGVyKCk6IFByb21pc2U8SVNwZWVjaFByb3ZpZGVyPiB7XG5cblx0XHQvLyBTZW5kIG91dCBleHRlbnNpb24gYWN0aXZhdGlvbiB0byBlbnN1cmUgcHJvdmlkZXJzIGNhbiByZWdpc3RlclxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoJ29uU3BlZWNoJyk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IEFycmF5LmZyb20odGhpcy5wcm92aWRlcnMudmFsdWVzKCkpLmF0KDApO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gU3BlZWNoIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQuYCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnByb3ZpZGVycy5zaXplID4gMSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYE11bHRpcGxlIHNwZWVjaCBwcm92aWRlcnMgcmVnaXN0ZXJlZC4gUGlja2luZyBmaXJzdCBvbmU6ICR7cHJvdmlkZXIubWV0YWRhdGEuZGlzcGxheU5hbWV9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFRleHQgdG8gU3BlZWNoXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFRleHRUb1NwZWVjaFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFRleHRUb1NwZWVjaFNlc3Npb24gPSB0aGlzLl9vbkRpZFN0YXJ0VGV4dFRvU3BlZWNoU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZFRleHRUb1NwZWVjaFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbmRUZXh0VG9TcGVlY2hTZXNzaW9uID0gdGhpcy5fb25EaWRFbmRUZXh0VG9TcGVlY2hTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgYWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbnMgPSAwO1xuXHRnZXQgaGFzQWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbigpIHsgcmV0dXJuIHRoaXMuYWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbnMgPiAwOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0VG9TcGVlY2hJblByb2dyZXNzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRhc3luYyBjcmVhdGVUZXh0VG9TcGVlY2hTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogc3RyaW5nID0gJ3NwZWVjaCcpOiBQcm9taXNlPElUZXh0VG9TcGVlY2hTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLmdldFByb3ZpZGVyKCk7XG5cblx0XHRjb25zdCBsYW5ndWFnZSA9IHNwZWVjaExhbmd1YWdlQ29uZmlnVG9MYW5ndWFnZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHVua25vd24+KFNQRUVDSF9MQU5HVUFHRV9DT05GSUcpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlVGV4dFRvU3BlZWNoU2Vzc2lvbih0b2tlbiwgdHlwZW9mIGxhbmd1YWdlID09PSAnc3RyaW5nJyA/IHsgbGFuZ3VhZ2UgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGxldCBzZXNzaW9uRXJyb3IgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQgPSAoZGlzcG9zZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmVUZXh0VG9TcGVlY2hTZXNzaW9ucyA9IE1hdGgubWF4KDAsIHRoaXMuYWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbnMgLSAxKTtcblx0XHRcdGlmICghdGhpcy5oYXNBY3RpdmVUZXh0VG9TcGVlY2hTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMudGV4dFRvU3BlZWNoSW5Qcm9ncmVzcy5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRFbmRUZXh0VG9TcGVlY2hTZXNzaW9uLmZpcmUoKTtcblxuXHRcdFx0dHlwZSBUZXh0VG9TcGVlY2hTZXNzaW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnYnBhc2Vybyc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdBbiBldmVudCB0aGF0IGZpcmVzIHdoZW4gYSB0ZXh0IHRvIHNwZWVjaCBzZXNzaW9uIGlzIGNyZWF0ZWQnO1xuXHRcdFx0XHRjb250ZXh0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQ29udGV4dCBvZiB0aGUgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdHNlc3Npb25EdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0R1cmF0aW9uIG9mIHRoZSBzZXNzaW9uLicgfTtcblx0XHRcdFx0c2Vzc2lvbkVycm9yOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWYgc3BlZWNoIHJlc3VsdGVkIGluIGVycm9yLicgfTtcblx0XHRcdFx0c2Vzc2lvbkxhbmd1YWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQ29uZmlndXJlZCBsYW5ndWFnZSBmb3IgdGhlIHNlc3Npb24uJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgVGV4dFRvU3BlZWNoU2Vzc2lvbkV2ZW50ID0ge1xuXHRcdFx0XHRjb250ZXh0OiBzdHJpbmc7XG5cdFx0XHRcdHNlc3Npb25EdXJhdGlvbjogbnVtYmVyO1xuXHRcdFx0XHRzZXNzaW9uRXJyb3I6IGJvb2xlYW47XG5cdFx0XHRcdHNlc3Npb25MYW5ndWFnZTogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRleHRUb1NwZWVjaFNlc3Npb25FdmVudCwgVGV4dFRvU3BlZWNoU2Vzc2lvbkNsYXNzaWZpY2F0aW9uPigndGV4dFRvU3BlZWNoU2Vzc2lvbicsIHtcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0c2Vzc2lvbkR1cmF0aW9uOiBEYXRlLm5vdygpIC0gc2Vzc2lvblN0YXJ0LFxuXHRcdFx0XHRzZXNzaW9uRXJyb3IsXG5cdFx0XHRcdHNlc3Npb25MYW5ndWFnZTogbGFuZ3VhZ2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZGlzcG9zZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCh0cnVlKSkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGUuc3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgVGV4dFRvU3BlZWNoU3RhdHVzLlN0YXJ0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVUZXh0VG9TcGVlY2hTZXNzaW9ucysrO1xuXHRcdFx0XHRcdHRoaXMudGV4dFRvU3BlZWNoSW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTdGFydFRleHRUb1NwZWVjaFNlc3Npb24uZmlyZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRUb1NwZWVjaFN0YXR1cy5TdG9wcGVkOlxuXHRcdFx0XHRcdG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkKGZhbHNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUZXh0VG9TcGVlY2hTdGF0dXMuRXJyb3I6XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBTcGVlY2ggcHJvdmlkZXIgZXJyb3IgaW4gdGV4dCB0byBzcGVlY2ggc2Vzc2lvbjogJHtlLnRleHR9YCk7XG5cdFx0XHRcdFx0c2Vzc2lvbkVycm9yID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBLZXl3b3JkIFJlY29nbml0aW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydEtleXdvcmRSZWNvZ25pdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0S2V5d29yZFJlY29nbml0aW9uID0gdGhpcy5fb25EaWRTdGFydEtleXdvcmRSZWNvZ25pdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZEtleXdvcmRSZWNvZ25pdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVuZEtleXdvcmRSZWNvZ25pdGlvbiA9IHRoaXMuX29uRGlkRW5kS2V5d29yZFJlY29nbml0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgYWN0aXZlS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMgPSAwO1xuXHRnZXQgaGFzQWN0aXZlS2V5d29yZFJlY29nbml0aW9uKCkgeyByZXR1cm4gdGhpcy5hY3RpdmVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucyA+IDA7IH1cblxuXHRhc3luYyByZWNvZ25pemVLZXl3b3JkKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8S2V5d29yZFJlY29nbml0aW9uU3RhdHVzPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxLZXl3b3JkUmVjb2duaXRpb25TdGF0dXM+KCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cmVzdWx0LmNvbXBsZXRlKEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cy5DYW5jZWxlZCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb2duaXplS2V5d29yZERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IGFjdGl2ZVJlY29nbml6ZUtleXdvcmRTZXNzaW9uOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlY29nbml6ZUtleXdvcmQgPSAoKSA9PiB7XG5cdFx0XHRyZWNvZ25pemVLZXl3b3JkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRcdHJlY29nbml6ZUtleXdvcmREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRjb25zdCBjdXJyZW50UmVjb2duaXplS2V5d29yZFNlc3Npb24gPSBhY3RpdmVSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbiA9IHRoaXMuZG9SZWNvZ25pemVLZXl3b3JkKGN0cy50b2tlbikudGhlbihzdGF0dXMgPT4ge1xuXHRcdFx0XHRpZiAoY3VycmVudFJlY29nbml6ZUtleXdvcmRTZXNzaW9uID09PSBhY3RpdmVSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbikge1xuXHRcdFx0XHRcdHJlc3VsdC5jb21wbGV0ZShzdGF0dXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRcdGlmIChjdXJyZW50UmVjb2duaXplS2V5d29yZFNlc3Npb24gPT09IGFjdGl2ZVJlY29nbml6ZUtleXdvcmRTZXNzaW9uKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXNlZCA9PiB7XG5cdFx0XHRpZiAoIWZvY3VzZWQgJiYgYWN0aXZlUmVjb2duaXplS2V5d29yZFNlc3Npb24pIHtcblx0XHRcdFx0cmVjb2duaXplS2V5d29yZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdGFjdGl2ZVJlY29nbml6ZUtleXdvcmRTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIGlmICghYWN0aXZlUmVjb2duaXplS2V5d29yZFNlc3Npb24pIHtcblx0XHRcdFx0cmVjb2duaXplS2V5d29yZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRyZWNvZ25pemVLZXl3b3JkKCk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXR1czogS2V5d29yZFJlY29nbml0aW9uU3RhdHVzO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0dXMgPSBhd2FpdCByZXN1bHQucDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHR5cGUgS2V5d29yZFJlY29nbml0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiBhIHNwZWVjaCBrZXl3b3JkIGRldGVjdGlvbiBpcyBzdGFydGVkJztcblx0XHRcdGtleXdvcmRSZWNvZ25pemVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWYgdGhlIGtleXdvcmQgd2FzIHJlY29nbml6ZWQuJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBLZXl3b3JkUmVjb2duaXRpb25FdmVudCA9IHtcblx0XHRcdGtleXdvcmRSZWNvZ25pemVkOiBib29sZWFuO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8S2V5d29yZFJlY29nbml0aW9uRXZlbnQsIEtleXdvcmRSZWNvZ25pdGlvbkNsYXNzaWZpY2F0aW9uPigna2V5d29yZFJlY29nbml0aW9uJywge1xuXHRcdFx0a2V5d29yZFJlY29nbml6ZWQ6IHN0YXR1cyA9PT0gS2V5d29yZFJlY29nbml0aW9uU3RhdHVzLlJlY29nbml6ZWRcblx0XHR9KTtcblxuXHRcdHJldHVybiBzdGF0dXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVjb2duaXplS2V5d29yZCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cz4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy5nZXRQcm92aWRlcigpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZUtleXdvcmRSZWNvZ25pdGlvblNlc3Npb24odG9rZW4pO1xuXHRcdHRoaXMuYWN0aXZlS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMrKztcblx0XHR0aGlzLl9vbkRpZFN0YXJ0S2V5d29yZFJlY29nbml0aW9uLmZpcmUoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmFjdGl2ZUtleXdvcmRSZWNvZ25pdGlvblNlc3Npb25zID0gTWF0aC5tYXgoMCwgdGhpcy5hY3RpdmVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucyAtIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRFbmRLZXl3b3JkUmVjb2duaXRpb24uZmlyZSgpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCgpKSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCgpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuc3RhdHVzID09PSBLZXl3b3JkUmVjb2duaXRpb25TdGF0dXMuU3RvcHBlZCkge1xuXHRcdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IEV2ZW50LnRvUHJvbWlzZShzZXNzaW9uLm9uRGlkQ2hhbmdlKSkuc3RhdHVzO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFB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
