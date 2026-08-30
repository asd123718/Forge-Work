import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { AsyncIterableObject, raceCancellationError } from "../../../base/common/async.js";
import * as errors from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { combinedDisposable } from "../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../base/common/network.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { TextEditorCursorStyle } from "../../../editor/common/config/editorOptions.js";
import { score, targetsNotebooks } from "../../../editor/common/languageSelector.js";
import * as languageConfiguration from "../../../editor/common/languages/languageConfiguration.js";
import { OverviewRulerLane } from "../../../editor/common/model.js";
import { ExtensionError, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import * as files from "../../../platform/files/common/files.js";
import { ILogService, ILoggerService, LogLevel } from "../../../platform/log/common/log.js";
import { getRemoteName } from "../../../platform/remote/common/remoteHosts.js";
import { TelemetryTrustedValue } from "../../../platform/telemetry/common/telemetryUtils.js";
import { EditSessionIdentityMatch } from "../../../platform/workspace/common/editSessions.js";
import { DebugConfigurationProviderTriggerKind } from "../../contrib/debug/common/debug.js";
import { PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
import { UIKind } from "../../services/extensions/common/extensionHostProtocol.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { AISearchKeyword, ExcludeSettingOptions, TextSearchCompleteMessageType, TextSearchContext2, TextSearchMatch2 } from "../../services/search/common/searchExtTypes.js";
import { CandidatePortSource, ExtHostContext, MainContext } from "./extHost.protocol.js";
import { ExtHostRelatedInformation } from "./extHostAiRelatedInformation.js";
import { ExtHostAiSettingsSearch } from "./extHostAiSettingsSearch.js";
import { ExtHostApiCommands } from "./extHostApiCommands.js";
import { IExtHostApiDeprecationService } from "./extHostApiDeprecationService.js";
import { IExtHostAuthentication } from "./extHostAuthentication.js";
import { ExtHostBulkEdits } from "./extHostBulkEdits.js";
import { ExtHostChatAgents2 } from "./extHostChatAgents2.js";
import { ExtHostChatOutputRenderer } from "./extHostChatOutputRenderer.js";
import { ExtHostChatSessions } from "./extHostChatSessions.js";
import { ExtHostChatStatus } from "./extHostChatStatus.js";
import { ExtHostChatQuota } from "./extHostChatQuota.js";
import { ExtHostChatInputNotification } from "./extHostChatInputNotification.js";
import { ExtHostClipboard } from "./extHostClipboard.js";
import { ExtHostEditorInsets } from "./extHostCodeInsets.js";
import { ExtHostCodeMapper } from "./extHostCodeMapper.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { createExtHostComments } from "./extHostComments.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { ExtHostCustomEditors } from "./extHostCustomEditors.js";
import { IExtHostDataChannels } from "./extHostDataChannels.js";
import { IExtHostDebugService } from "./extHostDebugService.js";
import { IExtHostDecorations } from "./extHostDecorations.js";
import { ExtHostDiagnostics } from "./extHostDiagnostics.js";
import { ExtHostDialogs } from "./extHostDialogs.js";
import { ExtHostDocumentContentProvider } from "./extHostDocumentContentProviders.js";
import { ExtHostDocumentSaveParticipant } from "./extHostDocumentSaveParticipant.js";
import { ExtHostDocuments } from "./extHostDocuments.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { ExtHostEmbeddings } from "./extHostEmbedding.js";
import { ExtHostAiEmbeddingVector } from "./extHostEmbeddingVector.js";
import { Extension, IExtHostExtensionService } from "./extHostExtensionService.js";
import { ExtHostFileSystem } from "./extHostFileSystem.js";
import { IExtHostConsumerFileSystem } from "./extHostFileSystemConsumer.js";
import { ExtHostFileSystemEventService } from "./extHostFileSystemEventService.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { ExtHostInteractive } from "./extHostInteractive.js";
import { ExtHostLabelService } from "./extHostLabelService.js";
import { ExtHostLanguageFeatures } from "./extHostLanguageFeatures.js";
import { ExtHostLanguageModelTools } from "./extHostLanguageModelTools.js";
import { IExtHostLanguageModels } from "./extHostLanguageModels.js";
import { ExtHostLanguages } from "./extHostLanguages.js";
import { IExtHostLocalizationService } from "./extHostLocalizationService.js";
import { IExtHostManagedSockets } from "./extHostManagedSockets.js";
import { IExtHostBrowserTunnelProxy } from "./extHostBrowserTunnelProxy.js";
import { IExtHostMpcService } from "./extHostMcp.js";
import { ExtHostMessageService } from "./extHostMessageService.js";
import { ExtHostNotebookController } from "./extHostNotebook.js";
import { ExtHostNotebookDocumentSaveParticipant } from "./extHostNotebookDocumentSaveParticipant.js";
import { ExtHostNotebookDocuments } from "./extHostNotebookDocuments.js";
import { ExtHostNotebookEditors } from "./extHostNotebookEditors.js";
import { ExtHostNotebookKernels } from "./extHostNotebookKernels.js";
import { ExtHostNotebookRenderers } from "./extHostNotebookRenderers.js";
import { IExtHostOutputService } from "./extHostOutput.js";
import { ExtHostProfileContentHandlers } from "./extHostProfileContentHandler.js";
import { IExtHostProgress } from "./extHostProgress.js";
import { ExtHostQuickDiff } from "./extHostQuickDiff.js";
import { ExtHostAgentEditorComments } from "./extHostAgentEditorComments.js";
import { createExtHostQuickOpen } from "./extHostQuickOpen.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostSCM } from "./extHostSCM.js";
import { IExtHostSearch } from "./extHostSearch.js";
import { IExtHostSecretState } from "./extHostSecretState.js";
import { ExtHostShare } from "./extHostShare.js";
import { ExtHostSpeech } from "./extHostSpeech.js";
import { ExtHostBrowsers } from "./extHostBrowsers.js";
import { ExtHostStatusBar } from "./extHostStatusBar.js";
import { IExtHostStorage } from "./extHostStorage.js";
import { IExtensionStoragePaths } from "./extHostStoragePaths.js";
import { IExtHostTask } from "./extHostTask.js";
import { ExtHostTelemetryLogger, IExtHostTelemetry, isNewAppInstall } from "./extHostTelemetry.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostTerminalShellIntegration } from "./extHostTerminalShellIntegration.js";
import { IExtHostTesting } from "./extHostTesting.js";
import { ExtHostEditors } from "./extHostTextEditors.js";
import { ExtHostTheming } from "./extHostTheming.js";
import { ExtHostTimeline } from "./extHostTimeline.js";
import { ExtHostTreeViews } from "./extHostTreeViews.js";
import { IExtHostTunnelService } from "./extHostTunnelService.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { ExtHostUriOpeners } from "./extHostUriOpener.js";
import { IURITransformerService } from "./extHostUriTransformerService.js";
import { IExtHostUrlsService } from "./extHostUrls.js";
import { ExtHostWebviews } from "./extHostWebview.js";
import { ExtHostWebviewPanels } from "./extHostWebviewPanels.js";
import { ExtHostWebviewViews } from "./extHostWebviewView.js";
import { IExtHostWindow } from "./extHostWindow.js";
import { IExtHostPower } from "./extHostPower.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { ExtHostChatContext } from "./extHostChatContext.js";
import { ExtHostChatDebug } from "./extHostChatDebug.js";
import { IExtHostMeteredConnection } from "./extHostMeteredConnection.js";
import { IExtHostGitExtensionService } from "./extHostGitExtensionService.js";
function getTerminalInternalOptions(extension, options) {
  if (options.isRemoteResolverTerminal) {
    checkProposedApiEnabled(extension, "terminalRemoteResolver");
    return { isRemoteResolverTerminal: true };
  }
  return void 0;
}
function createApiFactoryAndRegisterActors(accessor) {
  const initData = accessor.get(IExtHostInitDataService);
  const extHostFileSystemInfo = accessor.get(IExtHostFileSystemInfo);
  const extHostConsumerFileSystem = accessor.get(IExtHostConsumerFileSystem);
  const extensionService = accessor.get(IExtHostExtensionService);
  const extHostWorkspace = accessor.get(IExtHostWorkspace);
  const extHostTelemetry = accessor.get(IExtHostTelemetry);
  const extHostConfiguration = accessor.get(IExtHostConfiguration);
  const uriTransformer = accessor.get(IURITransformerService);
  const rpcProtocol = accessor.get(IExtHostRpcService);
  const extHostStorage = accessor.get(IExtHostStorage);
  const extensionStoragePaths = accessor.get(IExtensionStoragePaths);
  const extHostLoggerService = accessor.get(ILoggerService);
  const extHostLogService = accessor.get(ILogService);
  const extHostTunnelService = accessor.get(IExtHostTunnelService);
  const extHostApiDeprecation = accessor.get(IExtHostApiDeprecationService);
  const extHostWindow = accessor.get(IExtHostWindow);
  const extHostPower = accessor.get(IExtHostPower);
  const extHostUrls = accessor.get(IExtHostUrlsService);
  const extHostSecretState = accessor.get(IExtHostSecretState);
  const extHostEditorTabs = accessor.get(IExtHostEditorTabs);
  const extHostManagedSockets = accessor.get(IExtHostManagedSockets);
  const extHostBrowserTunnelProxy = accessor.get(IExtHostBrowserTunnelProxy);
  const extHostProgress = accessor.get(IExtHostProgress);
  const extHostAuthentication = accessor.get(IExtHostAuthentication);
  const extHostLanguageModels = accessor.get(IExtHostLanguageModels);
  const extHostMcp = accessor.get(IExtHostMpcService);
  const extHostDataChannels = accessor.get(IExtHostDataChannels);
  const extHostMeteredConnection = accessor.get(IExtHostMeteredConnection);
  const extHostGitExtensionService = accessor.get(IExtHostGitExtensionService);
  rpcProtocol.set(ExtHostContext.ExtHostFileSystemInfo, extHostFileSystemInfo);
  rpcProtocol.set(ExtHostContext.ExtHostLogLevelServiceShape, extHostLoggerService);
  rpcProtocol.set(ExtHostContext.ExtHostWorkspace, extHostWorkspace);
  rpcProtocol.set(ExtHostContext.ExtHostConfiguration, extHostConfiguration);
  rpcProtocol.set(ExtHostContext.ExtHostExtensionService, extensionService);
  rpcProtocol.set(ExtHostContext.ExtHostStorage, extHostStorage);
  rpcProtocol.set(ExtHostContext.ExtHostTunnelService, extHostTunnelService);
  rpcProtocol.set(ExtHostContext.ExtHostWindow, extHostWindow);
  rpcProtocol.set(ExtHostContext.ExtHostPower, extHostPower);
  rpcProtocol.set(ExtHostContext.ExtHostUrls, extHostUrls);
  rpcProtocol.set(ExtHostContext.ExtHostSecretState, extHostSecretState);
  rpcProtocol.set(ExtHostContext.ExtHostTelemetry, extHostTelemetry);
  rpcProtocol.set(ExtHostContext.ExtHostEditorTabs, extHostEditorTabs);
  rpcProtocol.set(ExtHostContext.ExtHostManagedSockets, extHostManagedSockets);
  rpcProtocol.set(ExtHostContext.ExtHostBrowserTunnelProxy, extHostBrowserTunnelProxy);
  rpcProtocol.set(ExtHostContext.ExtHostProgress, extHostProgress);
  rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
  rpcProtocol.set(ExtHostContext.ExtHostChatProvider, extHostLanguageModels);
  rpcProtocol.set(ExtHostContext.ExtHostDataChannels, extHostDataChannels);
  rpcProtocol.set(ExtHostContext.ExtHostMeteredConnection, extHostMeteredConnection);
  rpcProtocol.set(ExtHostContext.ExtHostGitExtension, extHostGitExtensionService);
  const extHostDecorations = rpcProtocol.set(ExtHostContext.ExtHostDecorations, accessor.get(IExtHostDecorations));
  const extHostDocumentsAndEditors = rpcProtocol.set(ExtHostContext.ExtHostDocumentsAndEditors, accessor.get(IExtHostDocumentsAndEditors));
  const extHostCommands = rpcProtocol.set(ExtHostContext.ExtHostCommands, accessor.get(IExtHostCommands));
  const extHostTerminalService = rpcProtocol.set(ExtHostContext.ExtHostTerminalService, accessor.get(IExtHostTerminalService));
  const extHostTerminalShellIntegration = rpcProtocol.set(ExtHostContext.ExtHostTerminalShellIntegration, accessor.get(IExtHostTerminalShellIntegration));
  const extHostDebugService = rpcProtocol.set(ExtHostContext.ExtHostDebugService, accessor.get(IExtHostDebugService));
  const extHostSearch = rpcProtocol.set(ExtHostContext.ExtHostSearch, accessor.get(IExtHostSearch));
  const extHostTask = rpcProtocol.set(ExtHostContext.ExtHostTask, accessor.get(IExtHostTask));
  const extHostOutputService = rpcProtocol.set(ExtHostContext.ExtHostOutputService, accessor.get(IExtHostOutputService));
  const extHostLocalization = rpcProtocol.set(ExtHostContext.ExtHostLocalization, accessor.get(IExtHostLocalizationService));
  const extHostDocuments = rpcProtocol.set(ExtHostContext.ExtHostDocuments, new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors));
  const extHostDocumentContentProviders = rpcProtocol.set(ExtHostContext.ExtHostDocumentContentProviders, new ExtHostDocumentContentProvider(rpcProtocol, extHostDocumentsAndEditors, extHostLogService));
  const extHostDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostDocumentSaveParticipant, new ExtHostDocumentSaveParticipant(extHostLogService, extHostDocuments, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
  const extHostNotebook = rpcProtocol.set(ExtHostContext.ExtHostNotebook, new ExtHostNotebookController(rpcProtocol, extHostCommands, extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, extHostLogService));
  const extHostNotebookDocuments = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocuments, new ExtHostNotebookDocuments(extHostNotebook));
  const extHostNotebookEditors = rpcProtocol.set(ExtHostContext.ExtHostNotebookEditors, new ExtHostNotebookEditors(extHostLogService, extHostNotebook));
  const extHostNotebookKernels = rpcProtocol.set(ExtHostContext.ExtHostNotebookKernels, new ExtHostNotebookKernels(rpcProtocol, initData, extHostNotebook, extHostCommands, extHostLogService));
  const extHostNotebookRenderers = rpcProtocol.set(ExtHostContext.ExtHostNotebookRenderers, new ExtHostNotebookRenderers(rpcProtocol, extHostNotebook));
  const extHostNotebookDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocumentSaveParticipant, new ExtHostNotebookDocumentSaveParticipant(extHostLogService, extHostNotebook, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
  const extHostEditors = rpcProtocol.set(ExtHostContext.ExtHostEditors, new ExtHostEditors(rpcProtocol, extHostDocumentsAndEditors));
  const extHostTreeViews = rpcProtocol.set(ExtHostContext.ExtHostTreeViews, new ExtHostTreeViews(rpcProtocol.getProxy(MainContext.MainThreadTreeViews), extHostCommands, extHostLogService));
  const extHostEditorInsets = rpcProtocol.set(ExtHostContext.ExtHostEditorInsets, new ExtHostEditorInsets(rpcProtocol.getProxy(MainContext.MainThreadEditorInsets), extHostEditors, initData.remote));
  const extHostDiagnostics = rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, new ExtHostDiagnostics(rpcProtocol, extHostLogService, extHostFileSystemInfo, extHostDocumentsAndEditors));
  const extHostLanguages = rpcProtocol.set(ExtHostContext.ExtHostLanguages, new ExtHostLanguages(rpcProtocol, extHostDocuments, extHostCommands.converter, uriTransformer));
  const extHostLanguageFeatures = rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, new ExtHostLanguageFeatures(rpcProtocol, uriTransformer, extHostDocuments, extHostCommands, extHostDiagnostics, extHostLogService, extHostApiDeprecation, extHostTelemetry));
  const extHostCodeMapper = rpcProtocol.set(ExtHostContext.ExtHostCodeMapper, new ExtHostCodeMapper(rpcProtocol));
  const extHostFileSystem = rpcProtocol.set(ExtHostContext.ExtHostFileSystem, new ExtHostFileSystem(rpcProtocol, extHostLanguageFeatures));
  const extHostFileSystemEvent = rpcProtocol.set(ExtHostContext.ExtHostFileSystemEventService, new ExtHostFileSystemEventService(rpcProtocol, extHostLogService, extHostDocumentsAndEditors));
  const extHostQuickOpen = rpcProtocol.set(ExtHostContext.ExtHostQuickOpen, createExtHostQuickOpen(rpcProtocol, extHostWorkspace, extHostCommands));
  const extHostSCM = rpcProtocol.set(ExtHostContext.ExtHostSCM, new ExtHostSCM(rpcProtocol, extHostCommands, extHostDocuments, extHostLogService));
  const extHostQuickDiff = rpcProtocol.set(ExtHostContext.ExtHostQuickDiff, new ExtHostQuickDiff(rpcProtocol, extHostDocuments, uriTransformer));
  const extHostAgentEditorComments = rpcProtocol.set(ExtHostContext.ExtHostAgentEditorComments, new ExtHostAgentEditorComments(rpcProtocol));
  const extHostShare = rpcProtocol.set(ExtHostContext.ExtHostShare, new ExtHostShare(rpcProtocol, uriTransformer));
  const extHostComment = rpcProtocol.set(ExtHostContext.ExtHostComments, createExtHostComments(rpcProtocol, extHostCommands, extHostDocuments));
  const extHostLabelService = rpcProtocol.set(ExtHostContext.ExtHostLabelService, new ExtHostLabelService(rpcProtocol));
  const extHostTheming = rpcProtocol.set(ExtHostContext.ExtHostTheming, new ExtHostTheming(rpcProtocol));
  const extHostTimeline = rpcProtocol.set(ExtHostContext.ExtHostTimeline, new ExtHostTimeline(rpcProtocol, extHostCommands));
  const extHostWebviews = rpcProtocol.set(ExtHostContext.ExtHostWebviews, new ExtHostWebviews(rpcProtocol, initData.remote, extHostWorkspace, extHostLogService, extHostApiDeprecation));
  const extHostWebviewPanels = rpcProtocol.set(ExtHostContext.ExtHostWebviewPanels, new ExtHostWebviewPanels(rpcProtocol, extHostWebviews, extHostWorkspace));
  const extHostCustomEditors = rpcProtocol.set(ExtHostContext.ExtHostCustomEditors, new ExtHostCustomEditors(rpcProtocol, extHostDocuments, extensionStoragePaths, extHostWebviews, extHostWebviewPanels));
  const extHostWebviewViews = rpcProtocol.set(ExtHostContext.ExtHostWebviewViews, new ExtHostWebviewViews(rpcProtocol, extHostWebviews));
  const extHostTesting = rpcProtocol.set(ExtHostContext.ExtHostTesting, accessor.get(IExtHostTesting));
  const extHostUriOpeners = rpcProtocol.set(ExtHostContext.ExtHostUriOpeners, new ExtHostUriOpeners(rpcProtocol));
  const extHostProfileContentHandlers = rpcProtocol.set(ExtHostContext.ExtHostProfileContentHandlers, new ExtHostProfileContentHandlers(rpcProtocol));
  const extHostChatOutputRenderer = rpcProtocol.set(ExtHostContext.ExtHostChatOutputRenderer, new ExtHostChatOutputRenderer(rpcProtocol, extHostWebviews));
  rpcProtocol.set(ExtHostContext.ExtHostInteractive, new ExtHostInteractive(rpcProtocol, extHostNotebook, extHostDocumentsAndEditors, extHostCommands, extHostLogService));
  const extHostLanguageModelTools = rpcProtocol.set(ExtHostContext.ExtHostLanguageModelTools, new ExtHostLanguageModelTools(rpcProtocol, extHostLanguageModels));
  const extHostChatSessions = rpcProtocol.set(ExtHostContext.ExtHostChatSessions, new ExtHostChatSessions(extHostCommands, extHostLanguageModels, rpcProtocol, extHostLogService));
  const extHostChatAgents2 = rpcProtocol.set(ExtHostContext.ExtHostChatAgents2, new ExtHostChatAgents2(rpcProtocol, extHostLogService, extHostCommands, extHostDocuments, extHostDocumentsAndEditors, extHostLanguageModels, extHostDiagnostics, extHostLanguageModelTools, extHostChatSessions));
  const extHostChatContext = rpcProtocol.set(ExtHostContext.ExtHostChatContext, new ExtHostChatContext(rpcProtocol, extHostCommands, extHostEditorTabs));
  const extHostChatDebug = rpcProtocol.set(ExtHostContext.ExtHostChatDebug, new ExtHostChatDebug(rpcProtocol));
  const extHostAiRelatedInformation = rpcProtocol.set(ExtHostContext.ExtHostAiRelatedInformation, new ExtHostRelatedInformation(rpcProtocol));
  const extHostAiEmbeddingVector = rpcProtocol.set(ExtHostContext.ExtHostAiEmbeddingVector, new ExtHostAiEmbeddingVector(rpcProtocol));
  const extHostAiSettingsSearch = rpcProtocol.set(ExtHostContext.ExtHostAiSettingsSearch, new ExtHostAiSettingsSearch(rpcProtocol));
  const extHostStatusBar = rpcProtocol.set(ExtHostContext.ExtHostStatusBar, new ExtHostStatusBar(rpcProtocol, extHostCommands.converter));
  const extHostSpeech = rpcProtocol.set(ExtHostContext.ExtHostSpeech, new ExtHostSpeech(rpcProtocol));
  const extHostEmbeddings = rpcProtocol.set(ExtHostContext.ExtHostEmbeddings, new ExtHostEmbeddings(rpcProtocol));
  const extHostBrowsers = rpcProtocol.set(ExtHostContext.ExtHostBrowsers, new ExtHostBrowsers(rpcProtocol));
  const extHostChatQuota = rpcProtocol.set(ExtHostContext.ExtHostChatQuota, new ExtHostChatQuota(rpcProtocol));
  rpcProtocol.set(ExtHostContext.ExtHostMcp, accessor.get(IExtHostMpcService));
  const expected = Object.values(ExtHostContext);
  rpcProtocol.assertRegistered(expected);
  const extHostBulkEdits = new ExtHostBulkEdits(rpcProtocol, extHostDocumentsAndEditors);
  const extHostClipboard = new ExtHostClipboard(rpcProtocol);
  const extHostMessageService = new ExtHostMessageService(rpcProtocol, extHostLogService);
  const extHostDialogs = new ExtHostDialogs(rpcProtocol);
  const extHostChatStatus = new ExtHostChatStatus(rpcProtocol);
  const extHostChatInputNotification = new ExtHostChatInputNotification(rpcProtocol);
  ExtHostApiCommands.register(extHostCommands);
  return function(extension, extensionInfo, configProvider) {
    function _asExtensionEvent(actual) {
      return (listener, thisArgs, disposables) => {
        const handle = actual((e) => {
          try {
            listener.call(thisArgs, e);
          } catch (err) {
            errors.onUnexpectedExternalError(new ExtensionError(extension.identifier, err, "FAILED to handle event"));
          }
        });
        disposables?.push(handle);
        return handle;
      };
    }
    const checkSelector = (function() {
      let done = !extension.isUnderDevelopment;
      function informOnce() {
        if (!done) {
          extHostLogService.info(`Extension '${extension.identifier.value}' uses a document selector without scheme. Learn more about this: https://go.microsoft.com/fwlink/?linkid=872305`);
          done = true;
        }
      }
      return function perform(selector) {
        if (Array.isArray(selector)) {
          selector.forEach(perform);
        } else if (typeof selector === "string") {
          informOnce();
        } else {
          const filter = selector;
          if (typeof filter.scheme === "undefined") {
            informOnce();
          }
          if (typeof filter.exclusive === "boolean") {
            checkProposedApiEnabled(extension, "documentFiltersExclusive");
          }
        }
        return selector;
      };
    })();
    const authentication = {
      getSession(providerId, scopesOrChallenge, options) {
        if (typeof options?.forceNewSession === "object" && options.forceNewSession.learnMore || typeof options?.createIfNone === "object" && options.createIfNone.learnMore) {
          checkProposedApiEnabled(extension, "authLearnMore");
        }
        if (options?.authorizationServer) {
          checkProposedApiEnabled(extension, "authIssuers");
        }
        return extHostAuthentication.getSession(extension, providerId, scopesOrChallenge, options);
      },
      getAccounts(providerId) {
        return extHostAuthentication.getAccounts(providerId);
      },
      // TODO: remove this after GHPR and Codespaces move off of it
      async hasSession(providerId, scopes) {
        checkProposedApiEnabled(extension, "authSession");
        return !!await extHostAuthentication.getSession(extension, providerId, scopes, { silent: true });
      },
      get onDidChangeSessions() {
        return _asExtensionEvent(extHostAuthentication.getExtensionScopedSessionsEvent(extension.identifier.value));
      },
      registerAuthenticationProvider(id, label, provider, options) {
        if (options?.supportedAuthorizationServers) {
          checkProposedApiEnabled(extension, "authIssuers");
        }
        return extHostAuthentication.registerAuthenticationProvider(id, label, provider, options);
      }
    };
    const commands = {
      registerCommand(id, command, thisArgs) {
        return extHostCommands.registerCommand(true, id, command, thisArgs, void 0, extension);
      },
      registerTextEditorCommand(id, callback, thisArg) {
        return extHostCommands.registerCommand(true, id, (...args) => {
          const activeTextEditor = extHostEditors.getActiveTextEditor();
          if (!activeTextEditor) {
            extHostLogService.warn("Cannot execute " + id + " because there is no active text editor.");
            return void 0;
          }
          return activeTextEditor.edit((edit) => {
            callback.apply(thisArg, [activeTextEditor, edit, ...args]);
          }).then((result) => {
            if (!result) {
              extHostLogService.warn("Edits from command " + id + " were not applied.");
            }
          }, (err) => {
            extHostLogService.warn("An error occurred while running command " + id, err);
          });
        }, void 0, void 0, extension);
      },
      registerDiffInformationCommand: (id, callback, thisArg) => {
        checkProposedApiEnabled(extension, "diffCommand");
        return extHostCommands.registerCommand(true, id, async (...args) => {
          const activeTextEditor = extHostDocumentsAndEditors.activeEditor(true);
          if (!activeTextEditor) {
            extHostLogService.warn("Cannot execute " + id + " because there is no active text editor.");
            return void 0;
          }
          const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
          callback.apply(thisArg, [diff, ...args]);
        }, void 0, void 0, extension);
      },
      executeCommand(id, ...args) {
        return extHostCommands.executeCommand(id, ...args);
      },
      getCommands(filterInternal = false) {
        return extHostCommands.getCommands(filterInternal);
      }
    };
    const env = {
      get machineId() {
        return initData.telemetryInfo.machineId;
      },
      get devDeviceId() {
        checkProposedApiEnabled(extension, "devDeviceId");
        return initData.telemetryInfo.devDeviceId ?? initData.telemetryInfo.machineId;
      },
      get isAppPortable() {
        return initData.environment.isPortable ?? false;
      },
      get sessionId() {
        return initData.telemetryInfo.sessionId;
      },
      get language() {
        return initData.environment.appLanguage;
      },
      get appName() {
        return initData.environment.appName;
      },
      get appRoot() {
        return initData.environment.appRoot?.fsPath ?? "";
      },
      get appHost() {
        return initData.environment.appHost;
      },
      get uriScheme() {
        return initData.environment.appUriScheme;
      },
      get clipboard() {
        return extHostClipboard.value;
      },
      get shell() {
        return extHostTerminalService.getDefaultShell(false);
      },
      get onDidChangeShell() {
        return _asExtensionEvent(extHostTerminalService.onDidChangeShell);
      },
      get isTelemetryEnabled() {
        return extHostTelemetry.getTelemetryConfiguration();
      },
      get onDidChangeTelemetryEnabled() {
        return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryEnabled);
      },
      get telemetryConfiguration() {
        checkProposedApiEnabled(extension, "telemetry");
        return extHostTelemetry.getTelemetryDetails();
      },
      get onDidChangeTelemetryConfiguration() {
        checkProposedApiEnabled(extension, "telemetry");
        return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryConfiguration);
      },
      get isMeteredConnection() {
        checkProposedApiEnabled(extension, "envIsConnectionMetered");
        return extHostMeteredConnection.isConnectionMetered;
      },
      get onDidChangeMeteredConnection() {
        checkProposedApiEnabled(extension, "envIsConnectionMetered");
        return _asExtensionEvent(extHostMeteredConnection.onDidChangeIsConnectionMetered);
      },
      get isNewAppInstall() {
        return isNewAppInstall(initData.telemetryInfo.firstSessionDate);
      },
      createTelemetryLogger(sender, options) {
        ExtHostTelemetryLogger.validateSender(sender);
        return extHostTelemetry.instantiateLogger(extension, sender, options);
      },
      async openExternal(uri, options) {
        return extHostWindow.openUri(uri, {
          allowTunneling: initData.remote.isRemote ?? (initData.remote.authority ? await extHostTunnelService.hasTunnelProvider() : false),
          allowContributedOpeners: options?.allowContributedOpeners
        });
      },
      async asExternalUri(uri) {
        if (uri.scheme === initData.environment.appUriScheme) {
          return extHostUrls.createAppUri(uri);
        }
        try {
          return await extHostWindow.asExternalUri(uri, { allowTunneling: !!initData.remote.authority });
        } catch (err) {
          if (matchesScheme(uri, Schemas.http) || matchesScheme(uri, Schemas.https)) {
            return uri;
          }
          throw err;
        }
      },
      get remoteName() {
        return getRemoteName(initData.remote.authority);
      },
      get remoteAuthority() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.remote.authority;
      },
      get uiKind() {
        return initData.uiKind;
      },
      get logLevel() {
        return extHostLogService.getLevel();
      },
      get onDidChangeLogLevel() {
        return _asExtensionEvent(extHostLogService.onDidChangeLogLevel);
      },
      get appQuality() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.quality;
      },
      get appCommit() {
        checkProposedApiEnabled(extension, "resolvers");
        return initData.commit;
      },
      getDataChannel(channelId) {
        checkProposedApiEnabled(extension, "dataChannels");
        return extHostDataChannels.createDataChannel(extension, channelId);
      },
      get power() {
        checkProposedApiEnabled(extension, "environmentPower");
        return {
          get onDidSuspend() {
            return _asExtensionEvent(extHostPower.onDidSuspend);
          },
          get onDidResume() {
            return _asExtensionEvent(extHostPower.onDidResume);
          },
          get onDidChangeOnBatteryPower() {
            return _asExtensionEvent(extHostPower.onDidChangeOnBatteryPower);
          },
          get onDidChangeThermalState() {
            return _asExtensionEvent(extHostPower.onDidChangeThermalState);
          },
          get onDidChangeSpeedLimit() {
            return _asExtensionEvent(extHostPower.onDidChangeSpeedLimit);
          },
          get onWillShutdown() {
            return _asExtensionEvent(extHostPower.onWillShutdown);
          },
          get onDidLockScreen() {
            return _asExtensionEvent(extHostPower.onDidLockScreen);
          },
          get onDidUnlockScreen() {
            return _asExtensionEvent(extHostPower.onDidUnlockScreen);
          },
          getSystemIdleState(idleThresholdSeconds) {
            return extHostPower.getSystemIdleState(idleThresholdSeconds);
          },
          getSystemIdleTime() {
            return extHostPower.getSystemIdleTime();
          },
          getCurrentThermalState() {
            return extHostPower.getCurrentThermalState();
          },
          isOnBatteryPower() {
            return extHostPower.isOnBatteryPower();
          },
          async startPowerSaveBlocker(type) {
            const blocker = await extHostPower.startPowerSaveBlocker(type);
            return {
              id: blocker.id,
              get isStarted() {
                return blocker.isStarted;
              },
              dispose() {
                blocker.dispose();
              }
            };
          }
        };
      }
    };
    if (!initData.environment.extensionTestsLocationURI) {
      Object.freeze(env);
    }
    const tests = {
      createTestController(provider, label, refreshHandler) {
        return extHostTesting.createTestController(extension, provider, label, refreshHandler);
      },
      createTestObserver() {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.createTestObserver();
      },
      runTests(provider) {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.runTests(provider);
      },
      registerTestFollowupProvider(provider) {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.registerTestFollowupProvider(provider);
      },
      get onDidChangeTestResults() {
        checkProposedApiEnabled(extension, "testObserver");
        return _asExtensionEvent(extHostTesting.onResultsChanged);
      },
      get testResults() {
        checkProposedApiEnabled(extension, "testObserver");
        return extHostTesting.results;
      }
    };
    const extensionKind = initData.remote.isRemote ? extHostTypes.ExtensionKind.Workspace : extHostTypes.ExtensionKind.UI;
    const extensions = {
      getExtension(extensionId, includeFromDifferentExtensionHosts) {
        if (!isProposedApiEnabled(extension, "extensionsAny")) {
          includeFromDifferentExtensionHosts = false;
        }
        const mine = extensionInfo.mine.getExtensionDescription(extensionId);
        if (mine) {
          return new Extension(extensionService, extension.identifier, mine, extensionKind, false);
        }
        if (includeFromDifferentExtensionHosts) {
          const foreign = extensionInfo.all.getExtensionDescription(extensionId);
          if (foreign) {
            return new Extension(extensionService, extension.identifier, foreign, extensionKind, true);
          }
        }
        return void 0;
      },
      get all() {
        const result = [];
        for (const desc of extensionInfo.mine.getAllExtensionDescriptions()) {
          result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, false));
        }
        return result;
      },
      get allAcrossExtensionHosts() {
        checkProposedApiEnabled(extension, "extensionsAny");
        const local = new ExtensionIdentifierSet(extensionInfo.mine.getAllExtensionDescriptions().map((desc) => desc.identifier));
        const result = [];
        for (const desc of extensionInfo.all.getAllExtensionDescriptions()) {
          const isFromDifferentExtensionHost = !local.has(desc.identifier);
          result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, isFromDifferentExtensionHost));
        }
        return result;
      },
      get onDidChange() {
        if (isProposedApiEnabled(extension, "extensionsAny")) {
          return _asExtensionEvent(Event.any(extensionInfo.mine.onDidChange, extensionInfo.all.onDidChange));
        }
        return _asExtensionEvent(extensionInfo.mine.onDidChange);
      }
    };
    const languages = {
      createDiagnosticCollection(name) {
        return extHostDiagnostics.createDiagnosticCollection(extension.identifier, name);
      },
      get onDidChangeDiagnostics() {
        return _asExtensionEvent(extHostDiagnostics.onDidChangeDiagnostics);
      },
      getDiagnostics: (resource) => {
        return extHostDiagnostics.getDiagnostics(resource);
      },
      getLanguages() {
        return extHostLanguages.getLanguages();
      },
      setTextDocumentLanguage(document, languageId) {
        return extHostLanguages.changeLanguage(document.uri, languageId);
      },
      match(selector, document) {
        const interalSelector = typeConverters.LanguageSelector.from(selector);
        let notebook;
        if (targetsNotebooks(interalSelector)) {
          notebook = extHostNotebook.notebookDocuments.find((value) => value.apiNotebook.getCells().find((c) => c.document === document))?.apiNotebook;
        }
        return score(interalSelector, document.uri, document.languageId, true, notebook?.uri, notebook?.notebookType);
      },
      registerCodeActionsProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerCodeActionProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerDocumentPasteEditProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentPasteEditProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerCodeLensProvider(selector, provider) {
        return extHostLanguageFeatures.registerCodeLensProvider(extension, checkSelector(selector), provider);
      },
      registerDefinitionProvider(selector, provider) {
        return extHostLanguageFeatures.registerDefinitionProvider(extension, checkSelector(selector), provider);
      },
      registerDeclarationProvider(selector, provider) {
        return extHostLanguageFeatures.registerDeclarationProvider(extension, checkSelector(selector), provider);
      },
      registerImplementationProvider(selector, provider) {
        return extHostLanguageFeatures.registerImplementationProvider(extension, checkSelector(selector), provider);
      },
      registerTypeDefinitionProvider(selector, provider) {
        return extHostLanguageFeatures.registerTypeDefinitionProvider(extension, checkSelector(selector), provider);
      },
      registerHoverProvider(selector, provider) {
        return extHostLanguageFeatures.registerHoverProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerEvaluatableExpressionProvider(selector, provider) {
        return extHostLanguageFeatures.registerEvaluatableExpressionProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerInlineValuesProvider(selector, provider) {
        return extHostLanguageFeatures.registerInlineValuesProvider(extension, checkSelector(selector), provider, extension.identifier);
      },
      registerDocumentHighlightProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentHighlightProvider(extension, checkSelector(selector), provider);
      },
      registerMultiDocumentHighlightProvider(selector, provider) {
        return extHostLanguageFeatures.registerMultiDocumentHighlightProvider(extension, checkSelector(selector), provider);
      },
      registerLinkedEditingRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerLinkedEditingRangeProvider(extension, checkSelector(selector), provider);
      },
      registerReferenceProvider(selector, provider) {
        return extHostLanguageFeatures.registerReferenceProvider(extension, checkSelector(selector), provider);
      },
      registerRenameProvider(selector, provider) {
        return extHostLanguageFeatures.registerRenameProvider(extension, checkSelector(selector), provider);
      },
      registerNewSymbolNamesProvider(selector, provider) {
        checkProposedApiEnabled(extension, "newSymbolNamesProvider");
        return extHostLanguageFeatures.registerNewSymbolNamesProvider(extension, checkSelector(selector), provider);
      },
      registerDocumentSymbolProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentSymbolProvider(extension, checkSelector(selector), provider, metadata);
      },
      registerWorkspaceSymbolProvider(provider) {
        return extHostLanguageFeatures.registerWorkspaceSymbolProvider(extension, provider);
      },
      registerDocumentFormattingEditProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentFormattingEditProvider(extension, checkSelector(selector), provider);
      },
      registerDocumentRangeFormattingEditProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentRangeFormattingEditProvider(extension, checkSelector(selector), provider);
      },
      registerOnTypeFormattingEditProvider(selector, provider, firstTriggerCharacter, ...moreTriggerCharacters) {
        return extHostLanguageFeatures.registerOnTypeFormattingEditProvider(extension, checkSelector(selector), provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
      },
      registerDocumentSemanticTokensProvider(selector, provider, legend) {
        return extHostLanguageFeatures.registerDocumentSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
      },
      registerDocumentRangeSemanticTokensProvider(selector, provider, legend) {
        return extHostLanguageFeatures.registerDocumentRangeSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
      },
      registerSignatureHelpProvider(selector, provider, firstItem, ...remaining) {
        if (typeof firstItem === "object") {
          return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, firstItem);
        }
        return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, typeof firstItem === "undefined" ? [] : [firstItem, ...remaining]);
      },
      registerCompletionItemProvider(selector, provider, ...triggerCharacters) {
        return extHostLanguageFeatures.registerCompletionItemProvider(extension, checkSelector(selector), provider, triggerCharacters);
      },
      registerInlineCompletionItemProvider(selector, provider, metadata) {
        if (provider.handleDidShowCompletionItem) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        if (provider.handleDidPartiallyAcceptCompletionItem) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        if (metadata) {
          checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        }
        return extHostLanguageFeatures.registerInlineCompletionsProvider(extension, checkSelector(selector), provider, metadata);
      },
      get inlineCompletionsUnificationState() {
        checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        return extHostLanguageFeatures.inlineCompletionsUnificationState;
      },
      onDidChangeCompletionsUnificationState(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "inlineCompletionsAdditions");
        return _asExtensionEvent(extHostLanguageFeatures.onDidChangeInlineCompletionsUnificationState)(listener, thisArg, disposables);
      },
      registerDocumentLinkProvider(selector, provider) {
        return extHostLanguageFeatures.registerDocumentLinkProvider(extension, checkSelector(selector), provider);
      },
      registerColorProvider(selector, provider) {
        return extHostLanguageFeatures.registerColorProvider(extension, checkSelector(selector), provider);
      },
      registerFoldingRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerFoldingRangeProvider(extension, checkSelector(selector), provider);
      },
      registerSelectionRangeProvider(selector, provider) {
        return extHostLanguageFeatures.registerSelectionRangeProvider(extension, selector, provider);
      },
      registerCallHierarchyProvider(selector, provider) {
        return extHostLanguageFeatures.registerCallHierarchyProvider(extension, selector, provider);
      },
      registerTypeHierarchyProvider(selector, provider) {
        return extHostLanguageFeatures.registerTypeHierarchyProvider(extension, selector, provider);
      },
      setLanguageConfiguration: (language, configuration) => {
        return extHostLanguageFeatures.setLanguageConfiguration(extension, language, configuration);
      },
      getTokenInformationAtPosition(doc, pos) {
        checkProposedApiEnabled(extension, "tokenInformation");
        return extHostLanguages.tokenAtPosition(doc, pos);
      },
      computeFullSyntaxHighlighting(source, languageId) {
        checkProposedApiEnabled(extension, "documentSyntaxHighlighting");
        return extHostLanguages.computeFullSyntaxHighlighting(source, languageId);
      },
      get onDidChangeSyntaxHighlighting() {
        checkProposedApiEnabled(extension, "documentSyntaxHighlighting");
        return extHostLanguages.onDidChangeSyntaxHighlighting;
      },
      registerInlayHintsProvider(selector, provider) {
        return extHostLanguageFeatures.registerInlayHintsProvider(extension, selector, provider);
      },
      createLanguageStatusItem(id, selector) {
        return extHostLanguages.createLanguageStatusItem(extension, id, selector);
      },
      registerDocumentDropEditProvider(selector, provider, metadata) {
        return extHostLanguageFeatures.registerDocumentOnDropEditProvider(extension, selector, provider, metadata);
      }
    };
    const window = {
      get activeTextEditor() {
        return extHostEditors.getActiveTextEditor();
      },
      get visibleTextEditors() {
        return extHostEditors.getVisibleTextEditors();
      },
      get activeTerminal() {
        return extHostTerminalService.activeTerminal;
      },
      get terminals() {
        return extHostTerminalService.terminals;
      },
      async showTextDocument(documentOrUri, columnOrOptions, preserveFocus) {
        if (URI.isUri(documentOrUri) && documentOrUri.scheme === Schemas.vscodeRemote && !documentOrUri.authority) {
          extHostApiDeprecation.report("workspace.showTextDocument", extension, `A URI of 'vscode-remote' scheme requires an authority.`);
        }
        const document = await (URI.isUri(documentOrUri) ? Promise.resolve(workspace.openTextDocument(documentOrUri)) : Promise.resolve(documentOrUri));
        return extHostEditors.showTextDocument(document, columnOrOptions, preserveFocus);
      },
      createTextEditorDecorationType(options) {
        return extHostEditors.createTextEditorDecorationType(extension, options);
      },
      onDidChangeActiveTextEditor(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeActiveTextEditor)(listener, thisArg, disposables);
      },
      onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeVisibleTextEditors)(listener, thisArg, disposables);
      },
      onDidChangeTextEditorSelection(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorSelection)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorOptions(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorOptions)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorVisibleRanges(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorVisibleRanges)(listener, thisArgs, disposables);
      },
      onDidChangeTextEditorViewColumn(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorViewColumn)(listener, thisArg, disposables);
      },
      onDidChangeTextEditorDiffInformation(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "textEditorDiffInformation");
        return _asExtensionEvent(extHostEditors.onDidChangeTextEditorDiffInformation)(listener, thisArg, disposables);
      },
      onDidCloseTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidCloseTerminal)(listener, thisArg, disposables);
      },
      onDidOpenTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidOpenTerminal)(listener, thisArg, disposables);
      },
      onDidChangeActiveTerminal(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidChangeActiveTerminal)(listener, thisArg, disposables);
      },
      onDidChangeTerminalDimensions(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalDimensions");
        return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalDimensions)(listener, thisArg, disposables);
      },
      onDidChangeTerminalState(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalState)(listener, thisArg, disposables);
      },
      onDidWriteTerminalData(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalDataWriteEvent");
        return _asExtensionEvent(extHostTerminalService.onDidWriteTerminalData)(listener, thisArg, disposables);
      },
      onDidExecuteTerminalCommand(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "terminalExecuteCommandEvent");
        return _asExtensionEvent(extHostTerminalService.onDidExecuteTerminalCommand)(listener, thisArg, disposables);
      },
      onDidChangeTerminalShellIntegration(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidChangeTerminalShellIntegration)(listener, thisArg, disposables);
      },
      onDidStartTerminalShellExecution(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidStartTerminalShellExecution)(listener, thisArg, disposables);
      },
      onDidEndTerminalShellExecution(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTerminalShellIntegration.onDidEndTerminalShellExecution)(listener, thisArg, disposables);
      },
      get state() {
        return extHostWindow.getState();
      },
      onDidChangeWindowState(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostWindow.onDidChangeWindowState)(listener, thisArg, disposables);
      },
      showInformationMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Info, message, rest[0], rest.slice(1));
      },
      showWarningMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Warning, message, rest[0], rest.slice(1));
      },
      showErrorMessage(message, ...rest) {
        return extHostMessageService.showMessage(extension, Severity.Error, message, rest[0], rest.slice(1));
      },
      showQuickPick(items, options, token) {
        return extHostQuickOpen.showQuickPick(extension, items, options, token);
      },
      showWorkspaceFolderPick(options) {
        return extHostQuickOpen.showWorkspaceFolderPick(options);
      },
      showInputBox(options, token) {
        return extHostQuickOpen.showInput(options, token);
      },
      showOpenDialog(options) {
        return extHostDialogs.showOpenDialog(options);
      },
      showSaveDialog(options) {
        return extHostDialogs.showSaveDialog(options);
      },
      createStatusBarItem(alignmentOrId, priorityOrAlignment, priorityArg) {
        let id;
        let alignment;
        let priority;
        if (typeof alignmentOrId === "string") {
          id = alignmentOrId;
          alignment = priorityOrAlignment;
          priority = priorityArg;
        } else {
          alignment = alignmentOrId;
          priority = priorityOrAlignment;
        }
        return extHostStatusBar.createStatusBarEntry(extension, id, alignment, priority);
      },
      setStatusBarMessage(text, timeoutOrThenable) {
        return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
      },
      withScmProgress(task) {
        extHostApiDeprecation.report(
          "window.withScmProgress",
          extension,
          `Use 'withProgress' instead.`
        );
        return extHostProgress.withProgress(extension, { location: extHostTypes.ProgressLocation.SourceControl }, (progress, token) => task({ report(n) {
        } }));
      },
      withProgress(options, task) {
        return extHostProgress.withProgress(extension, options, task);
      },
      createOutputChannel(name, options) {
        return extHostOutputService.createOutputChannel(name, options, extension);
      },
      createWebviewPanel(viewType, title, showOptions, options) {
        return extHostWebviewPanels.createWebviewPanel(extension, viewType, title, showOptions, options);
      },
      createWebviewTextEditorInset(editor, line, height, options) {
        checkProposedApiEnabled(extension, "editorInsets");
        return extHostEditorInsets.createWebviewEditorInset(editor, line, height, options, extension);
      },
      createTerminal(nameOrOptions, shellPath, shellArgs) {
        if (typeof nameOrOptions === "object") {
          let options = nameOrOptions;
          if (!isProposedApiEnabled(extension, "terminalTitle") && "titleTemplate" in nameOrOptions && nameOrOptions.titleTemplate !== void 0) {
            console.error(`[${extension.identifier.value}] \`titleTemplate\` was provided to window.createTerminal but is ignored because the \`terminalTitle\` proposed API is not enabled.`);
            options = { ...nameOrOptions, titleTemplate: void 0 };
          }
          if ("pty" in options) {
            return extHostTerminalService.createExtensionTerminal(options);
          }
          return extHostTerminalService.createTerminalFromOptions(options, getTerminalInternalOptions(extension, options));
        }
        return extHostTerminalService.createTerminal(nameOrOptions, shellPath, shellArgs);
      },
      registerTerminalLinkProvider(provider) {
        return extHostTerminalService.registerLinkProvider(provider);
      },
      registerTerminalProfileProvider(id, provider) {
        return extHostTerminalService.registerProfileProvider(extension, id, provider);
      },
      registerTerminalCompletionProvider(provider, ...triggerCharacters) {
        checkProposedApiEnabled(extension, "terminalCompletionProvider");
        return extHostTerminalService.registerTerminalCompletionProvider(extension, provider, ...triggerCharacters);
      },
      registerTerminalQuickFixProvider(id, provider) {
        checkProposedApiEnabled(extension, "terminalQuickFixProvider");
        return extHostTerminalService.registerTerminalQuickFixProvider(id, extension.identifier.value, provider);
      },
      registerTreeDataProvider(viewId, treeDataProvider) {
        return extHostTreeViews.registerTreeDataProvider(viewId, treeDataProvider, extension);
      },
      createTreeView(viewId, options) {
        return extHostTreeViews.createTreeView(viewId, options, extension);
      },
      registerWebviewPanelSerializer: (viewType, serializer) => {
        return extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializer);
      },
      registerCustomEditorProvider: (viewType, provider, options = {}) => {
        return extHostCustomEditors.registerCustomEditorProvider(extension, viewType, provider, options);
      },
      registerFileDecorationProvider(provider) {
        return extHostDecorations.registerFileDecorationProvider(provider, extension);
      },
      registerUriHandler(handler) {
        return extHostUrls.registerUriHandler(extension, handler);
      },
      createQuickPick() {
        return extHostQuickOpen.createQuickPick(extension);
      },
      createInputBox() {
        return extHostQuickOpen.createInputBox(extension);
      },
      get activeColorTheme() {
        return extHostTheming.activeColorTheme;
      },
      onDidChangeActiveColorTheme(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostTheming.onDidChangeActiveColorTheme)(listener, thisArg, disposables);
      },
      registerWebviewViewProvider(viewId, provider, options) {
        return extHostWebviewViews.registerWebviewViewProvider(extension, viewId, provider, options?.webviewOptions);
      },
      get activeNotebookEditor() {
        return extHostNotebook.activeNotebookEditor;
      },
      onDidChangeActiveNotebookEditor(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebook.onDidChangeActiveNotebookEditor)(listener, thisArgs, disposables);
      },
      get visibleNotebookEditors() {
        return extHostNotebook.visibleNotebookEditors;
      },
      get onDidChangeVisibleNotebookEditors() {
        return _asExtensionEvent(extHostNotebook.onDidChangeVisibleNotebookEditors);
      },
      onDidChangeNotebookEditorSelection(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorSelection)(listener, thisArgs, disposables);
      },
      onDidChangeNotebookEditorVisibleRanges(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorVisibleRanges)(listener, thisArgs, disposables);
      },
      showNotebookDocument(document, options) {
        return extHostNotebook.showNotebookDocument(document, options);
      },
      registerExternalUriOpener(id, opener, metadata) {
        checkProposedApiEnabled(extension, "externalUriOpener");
        return extHostUriOpeners.registerExternalUriOpener(extension.identifier, id, opener, metadata);
      },
      registerProfileContentHandler(id, handler) {
        checkProposedApiEnabled(extension, "profileContentHandlers");
        return extHostProfileContentHandlers.registerProfileContentHandler(extension, id, handler);
      },
      registerQuickDiffProvider(selector, quickDiffProvider, id, label, rootUri) {
        checkProposedApiEnabled(extension, "quickDiffProvider");
        return extHostQuickDiff.registerQuickDiffProvider(extension, checkSelector(selector), quickDiffProvider, id, label, rootUri);
      },
      createSourceControlDiffInformation(uri) {
        checkProposedApiEnabled(extension, "textEditorDiffInformation");
        return extHostQuickDiff.createSourceControlDiffInformation(uri);
      },
      get linkPresentationRules() {
        checkProposedApiEnabled(extension, "linkPresentation");
        return extHostDataChannels.linkPresentationRules;
      },
      get onDidChangeLinkPresentationRules() {
        checkProposedApiEnabled(extension, "linkPresentation");
        return extHostDataChannels.onDidChangeLinkPresentationRules;
      },
      createLinkPresentationWatcher(id, resource) {
        checkProposedApiEnabled(extension, "linkPresentation");
        return extHostDataChannels.createLinkPresentationWatcher(extension, id, resource);
      },
      registerLinkPresentationProvider(id, provider) {
        checkProposedApiEnabled(extension, "linkPresentation");
        return extHostDataChannels.registerLinkPresentationProvider(extension, id, provider);
      },
      createAgentEditorComments(uri) {
        checkProposedApiEnabled(extension, "agentEditorComments");
        return extHostAgentEditorComments.createAgentEditorComments(uri);
      },
      get tabGroups() {
        return extHostEditorTabs.tabGroups;
      },
      registerShareProvider(selector, provider) {
        checkProposedApiEnabled(extension, "shareProvider");
        return extHostShare.registerShareProvider(checkSelector(selector), provider);
      },
      get nativeHandle() {
        checkProposedApiEnabled(extension, "nativeWindowHandle");
        return extHostWindow.nativeHandle;
      },
      createChatStatusItem: (id) => {
        checkProposedApiEnabled(extension, "chatStatusItem");
        return extHostChatStatus.createChatStatusItem(extension, id);
      },
      get activeChatPanelSessionResource() {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.activeChatPanelSessionResource;
      },
      onDidChangeActiveChatPanelSessionResource: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return _asExtensionEvent(extHostChatAgents2.onDidChangeActiveChatPanelSessionResource)(listeners, thisArgs, disposables);
      },
      get browserTabs() {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.browserTabs;
      },
      onDidOpenBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidOpenBrowserTab)(listener, thisArg, disposables);
      },
      onDidCloseBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidCloseBrowserTab)(listener, thisArg, disposables);
      },
      get activeBrowserTab() {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.activeBrowserTab;
      },
      onDidChangeActiveBrowserTab(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidChangeActiveBrowserTab)(listener, thisArg, disposables);
      },
      onDidChangeBrowserTabState(listener, thisArg, disposables) {
        checkProposedApiEnabled(extension, "browser");
        return _asExtensionEvent(extHostBrowsers.onDidChangeBrowserTabState)(listener, thisArg, disposables);
      },
      openBrowserTab(url, options) {
        checkProposedApiEnabled(extension, "browser");
        return extHostBrowsers.openBrowserTab(url, options);
      }
    };
    const workspace = {
      get rootPath() {
        extHostApiDeprecation.report(
          "workspace.rootPath",
          extension,
          `Please use 'workspace.workspaceFolders' instead. More details: https://aka.ms/vscode-eliminating-rootpath`
        );
        return extHostWorkspace.getPath();
      },
      set rootPath(value) {
        throw new errors.ReadonlyError("rootPath");
      },
      getWorkspaceFolder(resource) {
        return extHostWorkspace.getWorkspaceFolder(resource);
      },
      get workspaceFolders() {
        return extHostWorkspace.getWorkspaceFolders();
      },
      get name() {
        return extHostWorkspace.name;
      },
      set name(value) {
        throw new errors.ReadonlyError("name");
      },
      get workspaceFile() {
        return extHostWorkspace.workspaceFile;
      },
      set workspaceFile(value) {
        throw new errors.ReadonlyError("workspaceFile");
      },
      get isAgentSessionsWorkspace() {
        checkProposedApiEnabled(extension, "agentSessionsWorkspace");
        return !!initData.environment.isSessionsWindow;
      },
      updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) => {
        return extHostWorkspace.updateWorkspaceFolders(extension, index, deleteCount || 0, ...workspaceFoldersToAdd);
      },
      onDidChangeWorkspaceFolders: function(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspace)(listener, thisArgs, disposables);
      },
      asRelativePath: (pathOrUri, includeWorkspace) => {
        return extHostWorkspace.getRelativePath(pathOrUri, includeWorkspace);
      },
      findFiles: (include, exclude, maxResults, token) => {
        return extHostWorkspace.findFiles(include, exclude, maxResults, extension.identifier, token);
      },
      findFiles2: (filePattern, options, token) => {
        checkProposedApiEnabled(extension, "findFiles2");
        return extHostWorkspace.findFiles2(filePattern, options, extension.identifier, token);
      },
      findTextInFiles: (query, optionsOrCallback, callbackOrToken, token) => {
        checkProposedApiEnabled(extension, "findTextInFiles");
        let options;
        let callback;
        if (typeof optionsOrCallback === "object") {
          options = optionsOrCallback;
          callback = callbackOrToken;
        } else {
          options = {};
          callback = optionsOrCallback;
          token = callbackOrToken;
        }
        return extHostWorkspace.findTextInFiles(query, options || {}, callback, extension.identifier, token);
      },
      findTextInFiles2: (query, options, token) => {
        checkProposedApiEnabled(extension, "findTextInFiles2");
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostWorkspace.findTextInFiles2(query, options, extension.identifier, token);
      },
      getTextDiff(originalDocument, modifiedDocument, options, token) {
        checkProposedApiEnabled(extension, "documentDiff");
        const proxy = rpcProtocol.getProxy(MainContext.MainThreadDocumentDiff);
        if (token?.isCancellationRequested) {
          const error = new errors.CancellationError();
          return {
            changes: AsyncIterableObject.EMPTY,
            complete: Promise.reject(error)
          };
        }
        const resultPromise = proxy.$computeDocumentDiff(
          originalDocument.uri,
          modifiedDocument.uri,
          options?.ignoreTrimWhitespace ?? false,
          options?.maxComputationTimeMs ?? 5e3,
          options?.computeMoves ?? false
        );
        const diffPromise = token ? raceCancellationError(resultPromise, token) : resultPromise;
        const mappedPromise = diffPromise.then((result) => {
          if (!result) {
            throw new Error("Could not compute diff. Make sure both documents are available.");
          }
          return result;
        });
        const mapChange = (c) => ({
          originalRange: typeConverters.Range.to(c.originalRange),
          modifiedRange: typeConverters.Range.to(c.modifiedRange),
          innerChanges: c.innerChanges?.map((ic) => ({
            originalRange: typeConverters.Range.to(ic.originalRange),
            modifiedRange: typeConverters.Range.to(ic.modifiedRange)
          }))
        });
        return {
          changes: new AsyncIterableObject(async (emitter) => {
            const result = await mappedPromise;
            emitter.emitMany(result.changes.map(mapChange));
          }),
          complete: mappedPromise.then((result) => ({
            identical: result.identical,
            mayBeIncomplete: result.quitEarly,
            moves: result.moves.map((m) => ({
              originalRange: typeConverters.Range.to(m.originalRange),
              modifiedRange: typeConverters.Range.to(m.modifiedRange),
              changes: m.changes.map(mapChange)
            }))
          }))
        };
      },
      save: (uri) => {
        return extHostWorkspace.save(uri);
      },
      saveAs: (uri) => {
        return extHostWorkspace.saveAs(uri);
      },
      saveAll: (includeUntitled) => {
        return extHostWorkspace.saveAll(includeUntitled);
      },
      applyEdit(edit, metadata) {
        return extHostBulkEdits.applyWorkspaceEdit(edit, extension, metadata);
      },
      createFileSystemWatcher: (pattern, optionsOrIgnoreCreate, ignoreChange, ignoreDelete) => {
        const options = {
          ignoreCreateEvents: Boolean(optionsOrIgnoreCreate),
          ignoreChangeEvents: Boolean(ignoreChange),
          ignoreDeleteEvents: Boolean(ignoreDelete)
        };
        return extHostFileSystemEvent.createFileSystemWatcher(extHostWorkspace, configProvider, extHostFileSystemInfo, extension, pattern, options);
      },
      get textDocuments() {
        return extHostDocuments.getAllDocumentData().map((data) => data.document);
      },
      set textDocuments(value) {
        throw new errors.ReadonlyError("textDocuments");
      },
      openTextDocument(uriOrFileNameOrOptions, options) {
        let uriPromise;
        options = options ?? uriOrFileNameOrOptions;
        if (typeof uriOrFileNameOrOptions === "string") {
          uriPromise = Promise.resolve(URI.file(uriOrFileNameOrOptions));
        } else if (URI.isUri(uriOrFileNameOrOptions)) {
          uriPromise = Promise.resolve(uriOrFileNameOrOptions);
        } else if (!options || typeof options === "object") {
          uriPromise = extHostDocuments.createDocumentData(options);
        } else {
          throw new Error("illegal argument - uriOrFileNameOrOptions");
        }
        return uriPromise.then((uri) => {
          extHostLogService.trace(`openTextDocument from ${extension.identifier}`);
          if (uri.scheme === Schemas.vscodeRemote && !uri.authority) {
            extHostApiDeprecation.report("workspace.openTextDocument", extension, `A URI of 'vscode-remote' scheme requires an authority.`);
          }
          return extHostDocuments.ensureDocumentData(uri, options).then((documentData) => {
            return documentData.document;
          });
        });
      },
      onDidOpenTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidAddDocument)(listener, thisArgs, disposables);
      },
      onDidCloseTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidRemoveDocument)(listener, thisArgs, disposables);
      },
      onDidChangeTextDocument: (listener, thisArgs, disposables) => {
        if (isProposedApiEnabled(extension, "textDocumentChangeReason")) {
          return _asExtensionEvent(extHostDocuments.onDidChangeDocumentWithReason)(listener, thisArgs, disposables);
        }
        return _asExtensionEvent(extHostDocuments.onDidChangeDocument)(listener, thisArgs, disposables);
      },
      onDidSaveTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocuments.onDidSaveDocument)(listener, thisArgs, disposables);
      },
      onWillSaveTextDocument: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostDocumentSaveParticipant.getOnWillSaveTextDocumentEvent(extension))(listener, thisArgs, disposables);
      },
      get notebookDocuments() {
        return extHostNotebook.notebookDocuments.map((d) => d.apiNotebook);
      },
      async openNotebookDocument(uriOrType, content) {
        let uri;
        if (URI.isUri(uriOrType)) {
          uri = uriOrType;
          await extHostNotebook.openNotebookDocument(uriOrType);
        } else if (typeof uriOrType === "string") {
          uri = URI.revive(await extHostNotebook.createNotebookDocument({ viewType: uriOrType, content }));
        } else {
          throw new Error("Invalid arguments");
        }
        return extHostNotebook.getNotebookDocument(uri).apiNotebook;
      },
      onDidSaveNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocuments.onDidSaveNotebookDocument)(listener, thisArg, disposables);
      },
      onDidChangeNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocuments.onDidChangeNotebookDocument)(listener, thisArg, disposables);
      },
      onWillSaveNotebookDocument(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostNotebookDocumentSaveParticipant.getOnWillSaveNotebookDocumentEvent(extension))(listener, thisArg, disposables);
      },
      get onDidOpenNotebookDocument() {
        return _asExtensionEvent(extHostNotebook.onDidOpenNotebookDocument);
      },
      get onDidCloseNotebookDocument() {
        return _asExtensionEvent(extHostNotebook.onDidCloseNotebookDocument);
      },
      registerNotebookSerializer(viewType, serializer, options, registration) {
        return extHostNotebook.registerNotebookSerializer(extension, viewType, serializer, options, isProposedApiEnabled(extension, "notebookLiveShare") ? registration : void 0);
      },
      onDidChangeConfiguration: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(configProvider.onDidChangeConfiguration)(listener, thisArgs, disposables);
      },
      getConfiguration(section, scope) {
        scope = arguments.length === 1 ? void 0 : scope;
        return configProvider.getConfiguration(section, scope, extension);
      },
      registerTextDocumentContentProvider(scheme, provider) {
        return extHostDocumentContentProviders.registerTextDocumentContentProvider(scheme, provider);
      },
      registerTaskProvider: (type, provider) => {
        extHostApiDeprecation.report(
          "window.registerTaskProvider",
          extension,
          `Use the corresponding function on the 'tasks' namespace instead`
        );
        return extHostTask.registerTaskProvider(extension, type, provider);
      },
      registerFileSystemProvider(scheme, provider, options) {
        return combinedDisposable(
          extHostFileSystem.registerFileSystemProvider(extension, scheme, provider, options),
          extHostConsumerFileSystem.addFileSystemProvider(scheme, provider, options)
        );
      },
      get fs() {
        return extHostConsumerFileSystem.value;
      },
      registerFileSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "fileSearchProvider");
        return extHostSearch.registerFileSearchProviderOld(scheme, provider);
      },
      registerTextSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "textSearchProvider");
        return extHostSearch.registerTextSearchProviderOld(scheme, provider);
      },
      registerAITextSearchProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "aiTextSearchProvider");
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostSearch.registerAITextSearchProvider(scheme, provider);
      },
      registerFileSearchProvider2: (scheme, provider) => {
        checkProposedApiEnabled(extension, "fileSearchProvider2");
        return extHostSearch.registerFileSearchProvider(scheme, provider);
      },
      registerTextSearchProvider2: (scheme, provider) => {
        checkProposedApiEnabled(extension, "textSearchProvider2");
        return extHostSearch.registerTextSearchProvider(scheme, provider);
      },
      registerRemoteAuthorityResolver: (authorityPrefix, resolver) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extensionService.registerRemoteAuthorityResolver(authorityPrefix, resolver);
      },
      registerResourceLabelFormatter: (formatter) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extHostLabelService.$registerResourceLabelFormatter(formatter);
      },
      getRemoteExecServer: (authority) => {
        checkProposedApiEnabled(extension, "resolvers");
        return extensionService.getRemoteExecServer(authority);
      },
      onDidCreateFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidCreateFile)(listener, thisArg, disposables);
      },
      onDidDeleteFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidDeleteFile)(listener, thisArg, disposables);
      },
      onDidRenameFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.onDidRenameFile)(listener, thisArg, disposables);
      },
      onWillCreateFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillCreateFileEvent(extension))(listener, thisArg, disposables);
      },
      onWillDeleteFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillDeleteFileEvent(extension))(listener, thisArg, disposables);
      },
      onWillRenameFiles: (listener, thisArg, disposables) => {
        return _asExtensionEvent(extHostFileSystemEvent.getOnWillRenameFileEvent(extension))(listener, thisArg, disposables);
      },
      openTunnel: (forward) => {
        checkProposedApiEnabled(extension, "tunnels");
        return extHostTunnelService.openTunnel(extension, forward).then((value) => {
          if (!value) {
            throw new Error("cannot open tunnel");
          }
          return value;
        });
      },
      get tunnels() {
        checkProposedApiEnabled(extension, "tunnels");
        return extHostTunnelService.getTunnels();
      },
      onDidChangeTunnels: (listener, thisArg, disposables) => {
        checkProposedApiEnabled(extension, "tunnels");
        return _asExtensionEvent(extHostTunnelService.onDidChangeTunnels)(listener, thisArg, disposables);
      },
      registerPortAttributesProvider: (portSelector, provider) => {
        checkProposedApiEnabled(extension, "portsAttributes");
        return extHostTunnelService.registerPortsAttributesProvider(portSelector, provider);
      },
      registerTunnelProvider: (tunnelProvider, information) => {
        checkProposedApiEnabled(extension, "tunnelFactory");
        return extHostTunnelService.registerTunnelProvider(tunnelProvider, information);
      },
      registerTimelineProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "timeline");
        return extHostTimeline.registerTimelineProvider(scheme, provider, extension.identifier, extHostCommands.converter);
      },
      get isTrusted() {
        return extHostWorkspace.trusted;
      },
      requestResourceTrust: (options) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.requestResourceTrust(options);
      },
      requestWorkspaceTrust: (options) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.requestWorkspaceTrust(options);
      },
      isResourceTrusted: (resource) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return extHostWorkspace.isResourceTrusted(resource);
      },
      onDidChangeWorkspaceTrustedFolders: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "workspaceTrust");
        return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspaceTrustedFolders)(listener, thisArgs, disposables);
      },
      onDidGrantWorkspaceTrust: (listener, thisArgs, disposables) => {
        return _asExtensionEvent(extHostWorkspace.onDidGrantWorkspaceTrust)(listener, thisArgs, disposables);
      },
      registerEditSessionIdentityProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "editSessionIdentityProvider");
        return extHostWorkspace.registerEditSessionIdentityProvider(scheme, provider);
      },
      onWillCreateEditSessionIdentity: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "editSessionIdentityProvider");
        return _asExtensionEvent(extHostWorkspace.getOnWillCreateEditSessionIdentityEvent(extension))(listener, thisArgs, disposables);
      },
      registerCanonicalUriProvider: (scheme, provider) => {
        checkProposedApiEnabled(extension, "canonicalUriProvider");
        return extHostWorkspace.registerCanonicalUriProvider(scheme, provider);
      },
      getCanonicalUri: (uri, options, token) => {
        checkProposedApiEnabled(extension, "canonicalUriProvider");
        return extHostWorkspace.provideCanonicalUri(uri, options, token);
      },
      decode(content, options) {
        return extHostWorkspace.decode(content, options);
      },
      encode(content, options) {
        return extHostWorkspace.encode(content, options);
      }
    };
    const scm = {
      get inputBox() {
        extHostApiDeprecation.report(
          "scm.inputBox",
          extension,
          `Use 'SourceControl.inputBox' instead`
        );
        return extHostSCM.getLastInputBox(extension);
      },
      createSourceControl(id, label, rootUri, iconPath, isHidden, parent) {
        if (iconPath || isHidden || parent) {
          checkProposedApiEnabled(extension, "scmProviderOptions");
        }
        return extHostSCM.createSourceControl(extension, id, label, rootUri, iconPath, isHidden, parent);
      }
    };
    const comments = {
      createCommentController(id, label) {
        return extHostComment.createCommentController(extension, id, label);
      }
    };
    const debug = {
      get activeDebugSession() {
        return extHostDebugService.activeDebugSession;
      },
      get activeDebugConsole() {
        return extHostDebugService.activeDebugConsole;
      },
      get breakpoints() {
        return extHostDebugService.breakpoints;
      },
      get activeStackItem() {
        return extHostDebugService.activeStackItem;
      },
      registerDebugVisualizationProvider(id, provider) {
        checkProposedApiEnabled(extension, "debugVisualization");
        return extHostDebugService.registerDebugVisualizationProvider(extension, id, provider);
      },
      registerDebugVisualizationTreeProvider(id, provider) {
        checkProposedApiEnabled(extension, "debugVisualization");
        return extHostDebugService.registerDebugVisualizationTree(extension, id, provider);
      },
      onDidStartDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidStartDebugSession)(listener, thisArg, disposables);
      },
      onDidTerminateDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidTerminateDebugSession)(listener, thisArg, disposables);
      },
      onDidChangeActiveDebugSession(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeActiveDebugSession)(listener, thisArg, disposables);
      },
      onDidReceiveDebugSessionCustomEvent(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidReceiveDebugSessionCustomEvent)(listener, thisArg, disposables);
      },
      onDidChangeBreakpoints(listener, thisArgs, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeBreakpoints)(listener, thisArgs, disposables);
      },
      onDidChangeActiveStackItem(listener, thisArg, disposables) {
        return _asExtensionEvent(extHostDebugService.onDidChangeActiveStackItem)(listener, thisArg, disposables);
      },
      registerDebugConfigurationProvider(debugType, provider, triggerKind) {
        return extHostDebugService.registerDebugConfigurationProvider(debugType, provider, triggerKind || DebugConfigurationProviderTriggerKind.Initial);
      },
      registerDebugAdapterDescriptorFactory(debugType, factory) {
        return extHostDebugService.registerDebugAdapterDescriptorFactory(extension, debugType, factory);
      },
      registerDebugAdapterTrackerFactory(debugType, factory) {
        return extHostDebugService.registerDebugAdapterTrackerFactory(debugType, factory);
      },
      startDebugging(folder, nameOrConfig, parentSessionOrOptions) {
        if (!parentSessionOrOptions || typeof parentSessionOrOptions === "object" && "configuration" in parentSessionOrOptions) {
          return extHostDebugService.startDebugging(folder, nameOrConfig, { parentSession: parentSessionOrOptions });
        }
        return extHostDebugService.startDebugging(folder, nameOrConfig, parentSessionOrOptions || {});
      },
      stopDebugging(session) {
        return extHostDebugService.stopDebugging(session);
      },
      addBreakpoints(breakpoints) {
        return extHostDebugService.addBreakpoints(breakpoints);
      },
      removeBreakpoints(breakpoints) {
        return extHostDebugService.removeBreakpoints(breakpoints);
      },
      asDebugSourceUri(source, session) {
        return extHostDebugService.asDebugSourceUri(source, session);
      }
    };
    const tasks = {
      registerTaskProvider: (type, provider) => {
        return extHostTask.registerTaskProvider(extension, type, provider);
      },
      fetchTasks: (filter) => {
        return extHostTask.fetchTasks(filter);
      },
      executeTask: (task) => {
        return extHostTask.executeTask(extension, task);
      },
      get taskExecutions() {
        return extHostTask.taskExecutions;
      },
      onDidStartTask: (listener, thisArgs, disposables) => {
        const wrappedListener = (event) => {
          if (!isProposedApiEnabled(extension, "taskExecutionTerminal")) {
            if (event?.execution?.terminal !== void 0) {
              event.execution.terminal = void 0;
            }
          }
          const eventWithExecution = {
            ...event,
            execution: event.execution
          };
          return listener.call(thisArgs, eventWithExecution);
        };
        return _asExtensionEvent(extHostTask.onDidStartTask)(wrappedListener, thisArgs, disposables);
      },
      onDidEndTask: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidEndTask)(listeners, thisArgs, disposables);
      },
      onDidStartTaskProcess: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidStartTaskProcess)(listeners, thisArgs, disposables);
      },
      onDidEndTaskProcess: (listeners, thisArgs, disposables) => {
        return _asExtensionEvent(extHostTask.onDidEndTaskProcess)(listeners, thisArgs, disposables);
      },
      onDidStartTaskProblemMatchers: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "taskProblemMatcherStatus");
        return _asExtensionEvent(extHostTask.onDidStartTaskProblemMatchers)(listeners, thisArgs, disposables);
      },
      onDidEndTaskProblemMatchers: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "taskProblemMatcherStatus");
        return _asExtensionEvent(extHostTask.onDidEndTaskProblemMatchers)(listeners, thisArgs, disposables);
      }
    };
    const notebooks = {
      createNotebookController(id, notebookType, label, handler, rendererScripts) {
        return extHostNotebookKernels.createNotebookController(extension, id, notebookType, label, handler, isProposedApiEnabled(extension, "notebookMessaging") ? rendererScripts : void 0);
      },
      registerNotebookCellStatusBarItemProvider: (notebookType, provider) => {
        return extHostNotebook.registerNotebookCellStatusBarItemProvider(extension, notebookType, provider);
      },
      createRendererMessaging(rendererId) {
        return extHostNotebookRenderers.createRendererMessaging(extension, rendererId);
      },
      createNotebookControllerDetectionTask(notebookType) {
        checkProposedApiEnabled(extension, "notebookKernelSource");
        return extHostNotebookKernels.createNotebookControllerDetectionTask(extension, notebookType);
      },
      registerKernelSourceActionProvider(notebookType, provider) {
        checkProposedApiEnabled(extension, "notebookKernelSource");
        return extHostNotebookKernels.registerKernelSourceActionProvider(extension, notebookType, provider);
      }
    };
    const l10n = {
      t(...params) {
        if (typeof params[0] === "string") {
          const key = params.shift();
          const argsFormatted = !params || typeof params[0] !== "object" ? params : params[0];
          return extHostLocalization.getMessage(extension.identifier.value, { message: key, args: argsFormatted });
        }
        return extHostLocalization.getMessage(extension.identifier.value, params[0]);
      },
      get bundle() {
        return extHostLocalization.getBundle(extension.identifier.value);
      },
      get uri() {
        return extHostLocalization.getBundleUri(extension.identifier.value);
      }
    };
    const interactive = {
      transferActiveChat(toWorkspace) {
        checkProposedApiEnabled(extension, "interactive");
        return extHostChatAgents2.transferActiveChat(toWorkspace);
      }
    };
    const ai = {
      getRelatedInformation(query, types) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiRelatedInformation.getRelatedInformation(extension, query, types);
      },
      registerRelatedInformationProvider(type, provider) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiRelatedInformation.registerRelatedInformationProvider(extension, type, provider);
      },
      registerEmbeddingVectorProvider(model, provider) {
        checkProposedApiEnabled(extension, "aiRelatedInformation");
        return extHostAiEmbeddingVector.registerEmbeddingVectorProvider(extension, model, provider);
      },
      registerSettingsSearchProvider(provider) {
        checkProposedApiEnabled(extension, "aiSettingsSearch");
        return extHostAiSettingsSearch.registerSettingsSearchProvider(extension, provider);
      }
    };
    const chat = {
      registerMappedEditsProvider(_selector, _provider) {
        checkProposedApiEnabled(extension, "mappedEditsProvider");
        return { dispose() {
        } };
      },
      registerMappedEditsProvider2(provider) {
        checkProposedApiEnabled(extension, "mappedEditsProvider");
        return extHostCodeMapper.registerMappedEditsProvider(extension, provider);
      },
      createChatParticipant(id, handler) {
        return extHostChatAgents2.createChatAgent(extension, id, handler);
      },
      createDynamicChatParticipant(id, dynamicProps, handler) {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.createDynamicChatAgent(extension, id, dynamicProps, handler);
      },
      registerChatParticipantDetectionProvider(provider) {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostChatAgents2.registerChatParticipantDetectionProvider(extension, provider);
      },
      onDidDisposeChatSession: (listeners, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return _asExtensionEvent(extHostChatAgents2.onDidDisposeChatSession)(listeners, thisArgs, disposables);
      },
      updateQuotas: (quotas) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        extHostChatQuota.updateQuotas(quotas);
      },
      registerChatSessionItemProvider: (chatSessionType, provider) => {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        extHostApiDeprecation.report("chat.registerChatSessionItemProvider", extension, `Please migrate to the new chat session controller API`, {
          usageId: chatSessionType
        });
        return extHostChatSessions.registerChatSessionItemProvider(extension, chatSessionType, provider);
      },
      createChatSessionItemController: (chatSessionType, refreshHandler) => {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        return extHostChatSessions.createChatSessionItemController(extension, chatSessionType, refreshHandler);
      },
      registerChatSessionContentProvider(scheme, provider, chatParticipant, capabilities) {
        checkProposedApiEnabled(extension, "chatSessionsProvider");
        return extHostChatSessions.registerChatSessionContentProvider(extension, scheme, chatParticipant, provider, capabilities);
      },
      registerChatOutputRenderer: (viewType, renderer) => {
        checkProposedApiEnabled(extension, "chatOutputRenderer");
        return extHostChatOutputRenderer.registerChatOutputRenderer(extension, viewType, renderer);
      },
      registerChatWorkspaceContextProvider(id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatWorkspaceContextProvider(`${extension.id}-${id}`, provider);
      },
      registerChatAttachContextProvider(id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatAttachContextProvider(`${extension.id}-${id}`, provider);
      },
      registerChatTabContextProvider(selector, id, provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return extHostChatContext.registerChatTabContextProvider(selector, `${extension.id}-${id}`, provider);
      },
      registerChatExplicitContextProvider(_id, _provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return { dispose: () => {
        } };
      },
      registerChatResourceContextProvider(_selector, _id, _provider) {
        checkProposedApiEnabled(extension, "chatContextProvider");
        return { dispose: () => {
        } };
      },
      registerCustomAgentProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.agent, provider);
      },
      registerInstructionsProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.instructions, provider);
      },
      registerPromptFileProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.prompt, provider);
      },
      registerSkillProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.skill, provider);
      },
      registerHookProvider(provider) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.hook, provider);
      },
      registerChatDebugLogProvider(provider) {
        checkProposedApiEnabled(extension, "chatDebug");
        return extHostChatDebug.registerChatDebugLogProvider(provider);
      },
      onDidReceiveChatDebugEvent: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatDebug");
        return extHostChatDebug.onDidAddCoreEvent(listener, thisArgs, disposables);
      },
      getCustomAgents(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideCustomAgents(token);
      },
      onDidChangeCustomAgents: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeCustomAgents(listener, thisArgs, disposables);
      },
      getInstructions(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideInstructions(token);
      },
      onDidChangeInstructions: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeInstructions(listener, thisArgs, disposables);
      },
      getSkills(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideSkills(token);
      },
      onDidChangeSkills: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeSkills(listener, thisArgs, disposables);
      },
      getSlashCommands(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideSlashCommands(token);
      },
      onDidChangeSlashCommands: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeSlashCommands(listener, thisArgs, disposables);
      },
      getHooks(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.provideHooks(token);
      },
      onDidChangeHooks: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangeHooks(listener, thisArgs, disposables);
      },
      getPlugins(token) {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.providePlugins(token);
      },
      onDidChangePlugins: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "chatPromptFiles");
        return extHostChatAgents2.onDidChangePlugins(listener, thisArgs, disposables);
      },
      registerChatSessionCustomizationProvider(chatSessionType, metadata, provider) {
        checkProposedApiEnabled(extension, "chatSessionCustomizationProvider");
        return extHostChatAgents2.registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider);
      },
      createInputNotification(id) {
        checkProposedApiEnabled(extension, "chatInputNotification");
        return extHostChatInputNotification.createInputNotification(extension, id);
      }
    };
    const lm = {
      selectChatModels: (selector) => {
        return extHostLanguageModels.selectLanguageModels(extension, selector ?? {});
      },
      onDidChangeChatModels: (listener, thisArgs, disposables) => {
        return extHostLanguageModels.onDidChangeProviders(listener, thisArgs, disposables);
      },
      registerLanguageModelChatProvider: (vendor, provider) => {
        return extHostLanguageModels.registerLanguageModelChatProvider(extension, vendor, provider);
      },
      get isModelProxyAvailable() {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.isModelProxyAvailable;
      },
      onDidChangeModelProxyAvailability: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.onDidChangeModelProxyAvailability(listener, thisArgs, disposables);
      },
      getModelProxy: () => {
        checkProposedApiEnabled(extension, "languageModelProxy");
        return extHostLanguageModels.getModelProxy(extension);
      },
      registerLanguageModelProxyProvider: (provider) => {
        checkProposedApiEnabled(extension, "chatParticipantPrivate");
        return extHostLanguageModels.registerLanguageModelProxyProvider(extension, provider);
      },
      // --- embeddings
      get embeddingModels() {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.embeddingsModels;
      },
      onDidChangeEmbeddingModels: (listener, thisArgs, disposables) => {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.onDidChange(listener, thisArgs, disposables);
      },
      registerEmbeddingsProvider(embeddingsModel, provider) {
        checkProposedApiEnabled(extension, "embeddings");
        return extHostEmbeddings.registerEmbeddingsProvider(extension, embeddingsModel, provider);
      },
      async computeEmbeddings(embeddingsModel, input, token) {
        checkProposedApiEnabled(extension, "embeddings");
        if (typeof input === "string") {
          return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
        } else {
          return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
        }
      },
      registerTool(name, tool) {
        return extHostLanguageModelTools.registerTool(extension, name, tool);
      },
      registerToolDefinition(definition, tool) {
        return extHostLanguageModelTools.registerToolDefinition(extension, definition, tool);
      },
      invokeTool(nameOrInfo, parameters, token) {
        if (typeof nameOrInfo !== "string") {
          checkProposedApiEnabled(extension, "chatParticipantAdditions");
        }
        return extHostLanguageModelTools.invokeTool(extension, nameOrInfo, parameters, token);
      },
      get tools() {
        return extHostLanguageModelTools.getTools(extension);
      },
      fileIsIgnored(uri, token) {
        return extHostLanguageModels.fileIsIgnored(extension, uri, token);
      },
      registerIgnoredFileProvider(provider) {
        return extHostLanguageModels.registerIgnoredFileProvider(extension, provider);
      },
      registerMcpServerDefinitionProvider(id, provider) {
        return extHostMcp.registerMcpConfigurationProvider(extension, id, provider);
      },
      onDidChangeMcpServerDefinitions: (...args) => {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return _asExtensionEvent(extHostMcp.onDidChangeMcpServerDefinitions)(...args);
      },
      get mcpServerDefinitions() {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return extHostMcp.mcpServerDefinitions;
      },
      startMcpGateway(chatSessionResource) {
        checkProposedApiEnabled(extension, "mcpServerDefinitions");
        return extHostMcp.startMcpGateway(chatSessionResource);
      },
      onDidChangeChatRequestTools(...args) {
        checkProposedApiEnabled(extension, "chatParticipantAdditions");
        return _asExtensionEvent(extHostChatAgents2.onDidChangeChatRequestTools)(...args);
      }
    };
    const speech = {
      registerSpeechProvider(id, provider) {
        checkProposedApiEnabled(extension, "speech");
        return extHostSpeech.registerProvider(extension.identifier, id, provider);
      }
    };
    return {
      version: initData.version,
      // namespaces
      ai,
      authentication,
      commands,
      comments,
      chat,
      debug,
      env,
      extensions,
      interactive,
      l10n,
      languages,
      lm,
      notebooks,
      scm,
      speech,
      tasks,
      tests,
      window,
      workspace,
      // types
      Breakpoint: extHostTypes.Breakpoint,
      TerminalOutputAnchor: extHostTypes.TerminalOutputAnchor,
      ChatResultFeedbackKind: extHostTypes.ChatResultFeedbackKind,
      ChatVariableLevel: extHostTypes.ChatVariableLevel,
      ChatCompletionItem: extHostTypes.ChatCompletionItem,
      ChatReferenceDiagnostic: extHostTypes.ChatReferenceDiagnostic,
      CallHierarchyIncomingCall: extHostTypes.CallHierarchyIncomingCall,
      CallHierarchyItem: extHostTypes.CallHierarchyItem,
      CallHierarchyOutgoingCall: extHostTypes.CallHierarchyOutgoingCall,
      CancellationError: errors.CancellationError,
      CancellationTokenSource,
      CandidatePortSource,
      CodeAction: extHostTypes.CodeAction,
      CodeActionKind: extHostTypes.CodeActionKind,
      CodeActionTriggerKind: extHostTypes.CodeActionTriggerKind,
      CodeLens: extHostTypes.CodeLens,
      Color: extHostTypes.Color,
      ColorInformation: extHostTypes.ColorInformation,
      ColorPresentation: extHostTypes.ColorPresentation,
      ColorThemeKind: extHostTypes.ColorThemeKind,
      CommentMode: extHostTypes.CommentMode,
      CommentState: extHostTypes.CommentState,
      CommentThreadCollapsibleState: extHostTypes.CommentThreadCollapsibleState,
      CommentThreadState: extHostTypes.CommentThreadState,
      CommentThreadApplicability: extHostTypes.CommentThreadApplicability,
      CommentThreadFocus: extHostTypes.CommentThreadFocus,
      CompletionItem: extHostTypes.CompletionItem,
      CompletionItemKind: extHostTypes.CompletionItemKind,
      CompletionItemTag: extHostTypes.CompletionItemTag,
      CompletionList: extHostTypes.CompletionList,
      CompletionTriggerKind: extHostTypes.CompletionTriggerKind,
      ConfigurationTarget: extHostTypes.ConfigurationTarget,
      CustomExecution: extHostTypes.CustomExecution,
      DebugAdapterExecutable: extHostTypes.DebugAdapterExecutable,
      DebugAdapterInlineImplementation: extHostTypes.DebugAdapterInlineImplementation,
      DebugAdapterNamedPipeServer: extHostTypes.DebugAdapterNamedPipeServer,
      DebugAdapterServer: extHostTypes.DebugAdapterServer,
      DebugConfigurationProviderTriggerKind,
      DebugConsoleMode: extHostTypes.DebugConsoleMode,
      DebugVisualization: extHostTypes.DebugVisualization,
      DecorationRangeBehavior: extHostTypes.DecorationRangeBehavior,
      Diagnostic: extHostTypes.Diagnostic,
      DiagnosticRelatedInformation: extHostTypes.DiagnosticRelatedInformation,
      DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
      DiagnosticTag: extHostTypes.DiagnosticTag,
      Disposable: extHostTypes.Disposable,
      DocumentHighlight: extHostTypes.DocumentHighlight,
      DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
      MultiDocumentHighlight: extHostTypes.MultiDocumentHighlight,
      DocumentLink: extHostTypes.DocumentLink,
      DocumentSymbol: extHostTypes.DocumentSymbol,
      EndOfLine: extHostTypes.EndOfLine,
      EnvironmentVariableMutatorType: extHostTypes.EnvironmentVariableMutatorType,
      EvaluatableExpression: extHostTypes.EvaluatableExpression,
      InlineValueText: extHostTypes.InlineValueText,
      InlineValueVariableLookup: extHostTypes.InlineValueVariableLookup,
      InlineValueEvaluatableExpression: extHostTypes.InlineValueEvaluatableExpression,
      InlineCompletionTriggerKind: extHostTypes.InlineCompletionTriggerKind,
      InlineCompletionsDisposeReasonKind: extHostTypes.InlineCompletionsDisposeReasonKind,
      EventEmitter: Emitter,
      ExtensionKind: extHostTypes.ExtensionKind,
      ExtensionMode: extHostTypes.ExtensionMode,
      ExternalUriOpenerPriority: extHostTypes.ExternalUriOpenerPriority,
      FileChangeType: extHostTypes.FileChangeType,
      FileDecoration: extHostTypes.FileDecoration,
      FileDecoration2: extHostTypes.FileDecoration,
      FileSystemError: extHostTypes.FileSystemError,
      FileType: files.FileType,
      FilePermission: files.FilePermission,
      FoldingRange: extHostTypes.FoldingRange,
      FoldingRangeKind: extHostTypes.FoldingRangeKind,
      FunctionBreakpoint: extHostTypes.FunctionBreakpoint,
      InlineCompletionItem: extHostTypes.InlineSuggestion,
      InlineCompletionList: extHostTypes.InlineSuggestionList,
      Hover: extHostTypes.Hover,
      VerboseHover: extHostTypes.VerboseHover,
      HoverVerbosityAction: extHostTypes.HoverVerbosityAction,
      IndentAction: languageConfiguration.IndentAction,
      Location: extHostTypes.Location,
      MarkdownString: extHostTypes.MarkdownString,
      OverviewRulerLane,
      ParameterInformation: extHostTypes.ParameterInformation,
      PortAutoForwardAction: extHostTypes.PortAutoForwardAction,
      Position: extHostTypes.Position,
      ProcessExecution: extHostTypes.ProcessExecution,
      ProgressLocation: extHostTypes.ProgressLocation,
      QuickInputButtonLocation: extHostTypes.QuickInputButtonLocation,
      QuickInputButtons: extHostTypes.QuickInputButtons,
      Range: extHostTypes.Range,
      RelativePattern: extHostTypes.RelativePattern,
      Selection: extHostTypes.Selection,
      SelectionRange: extHostTypes.SelectionRange,
      SemanticTokens: extHostTypes.SemanticTokens,
      SemanticTokensBuilder: extHostTypes.SemanticTokensBuilder,
      SemanticTokensEdit: extHostTypes.SemanticTokensEdit,
      SemanticTokensEdits: extHostTypes.SemanticTokensEdits,
      SemanticTokensLegend: extHostTypes.SemanticTokensLegend,
      ShellExecution: extHostTypes.ShellExecution,
      ShellQuoting: extHostTypes.ShellQuoting,
      SignatureHelp: extHostTypes.SignatureHelp,
      SignatureHelpTriggerKind: extHostTypes.SignatureHelpTriggerKind,
      SignatureInformation: extHostTypes.SignatureInformation,
      SnippetString: extHostTypes.SnippetString,
      SourceBreakpoint: extHostTypes.SourceBreakpoint,
      StandardTokenType: extHostTypes.StandardTokenType,
      SyntaxHighlightingTokenFontStyle: extHostTypes.SyntaxHighlightingTokenFontStyle,
      StatusBarAlignment: extHostTypes.StatusBarAlignment,
      SymbolInformation: extHostTypes.SymbolInformation,
      SymbolKind: extHostTypes.SymbolKind,
      SymbolTag: extHostTypes.SymbolTag,
      Task: extHostTypes.Task,
      TaskEventKind: extHostTypes.TaskEventKind,
      TaskGroup: extHostTypes.TaskGroup,
      TaskPanelKind: extHostTypes.TaskPanelKind,
      TaskRevealKind: extHostTypes.TaskRevealKind,
      TaskRunOn: extHostTypes.TaskRunOn,
      TaskScope: extHostTypes.TaskScope,
      TerminalLink: extHostTypes.TerminalLink,
      TerminalQuickFixTerminalCommand: extHostTypes.TerminalQuickFixCommand,
      TerminalQuickFixOpener: extHostTypes.TerminalQuickFixOpener,
      TerminalLocation: extHostTypes.TerminalLocation,
      TerminalProfile: extHostTypes.TerminalProfile,
      TerminalExitReason: extHostTypes.TerminalExitReason,
      TerminalShellExecutionCommandLineConfidence: extHostTypes.TerminalShellExecutionCommandLineConfidence,
      TerminalCompletionItem: extHostTypes.TerminalCompletionItem,
      TerminalCompletionItemKind: extHostTypes.TerminalCompletionItemKind,
      TerminalCompletionList: extHostTypes.TerminalCompletionList,
      TerminalShellType: extHostTypes.TerminalShellType,
      TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
      TextEdit: extHostTypes.TextEdit,
      SnippetTextEdit: extHostTypes.SnippetTextEdit,
      TextEditorCursorStyle,
      TextEditorChangeKind: extHostTypes.TextEditorChangeKind,
      TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
      TextEditorRevealType: extHostTypes.TextEditorRevealType,
      TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
      SyntaxTokenType: extHostTypes.SyntaxTokenType,
      TextDocumentChangeReason: extHostTypes.TextDocumentChangeReason,
      ThemeColor: extHostTypes.ThemeColor,
      ThemeIcon: extHostTypes.ThemeIcon,
      TreeItem: extHostTypes.TreeItem,
      TreeItemCheckboxState: extHostTypes.TreeItemCheckboxState,
      TreeItemCollapsibleState: extHostTypes.TreeItemCollapsibleState,
      TypeHierarchyItem: extHostTypes.TypeHierarchyItem,
      UIKind,
      Uri: URI,
      ViewColumn: extHostTypes.ViewColumn,
      WorkspaceEdit: extHostTypes.WorkspaceEdit,
      // proposed api types
      DocumentPasteTriggerKind: extHostTypes.DocumentPasteTriggerKind,
      DocumentDropEdit: extHostTypes.DocumentDropEdit,
      DocumentDropOrPasteEditKind: extHostTypes.DocumentDropOrPasteEditKind,
      DocumentPasteEdit: extHostTypes.DocumentPasteEdit,
      InlayHint: extHostTypes.InlayHint,
      InlayHintLabelPart: extHostTypes.InlayHintLabelPart,
      InlayHintKind: extHostTypes.InlayHintKind,
      RemoteAuthorityResolverError: extHostTypes.RemoteAuthorityResolverError,
      ResolvedAuthority: extHostTypes.ResolvedAuthority,
      ManagedResolvedAuthority: extHostTypes.ManagedResolvedAuthority,
      SourceControlInputBoxValidationType: extHostTypes.SourceControlInputBoxValidationType,
      ExtensionRuntime: extHostTypes.ExtensionRuntime,
      TimelineItem: extHostTypes.TimelineItem,
      NotebookRange: extHostTypes.NotebookRange,
      NotebookCellKind: extHostTypes.NotebookCellKind,
      NotebookCellExecutionState: extHostTypes.NotebookCellExecutionState,
      NotebookCellData: extHostTypes.NotebookCellData,
      NotebookData: extHostTypes.NotebookData,
      NotebookRendererScript: extHostTypes.NotebookRendererScript,
      NotebookCellStatusBarAlignment: extHostTypes.NotebookCellStatusBarAlignment,
      NotebookEditorRevealType: extHostTypes.NotebookEditorRevealType,
      NotebookCellOutput: extHostTypes.NotebookCellOutput,
      NotebookCellOutputItem: extHostTypes.NotebookCellOutputItem,
      CellErrorStackFrame: extHostTypes.CellErrorStackFrame,
      NotebookCellStatusBarItem: extHostTypes.NotebookCellStatusBarItem,
      NotebookControllerAffinity: extHostTypes.NotebookControllerAffinity,
      NotebookControllerAffinity2: extHostTypes.NotebookControllerAffinity2,
      NotebookEdit: extHostTypes.NotebookEdit,
      NotebookKernelSourceAction: extHostTypes.NotebookKernelSourceAction,
      NotebookVariablesRequestKind: extHostTypes.NotebookVariablesRequestKind,
      PortAttributes: extHostTypes.PortAttributes,
      LinkedEditingRanges: extHostTypes.LinkedEditingRanges,
      TestResultState: extHostTypes.TestResultState,
      TestRunRequest: extHostTypes.TestRunRequest,
      TestMessage: extHostTypes.TestMessage,
      TestMessageStackFrame: extHostTypes.TestMessageStackFrame,
      TestTag: extHostTypes.TestTag,
      TestRunProfileKind: extHostTypes.TestRunProfileKind,
      TextSearchCompleteMessageType,
      DataTransfer: extHostTypes.DataTransfer,
      DataTransferItem: extHostTypes.DataTransferItem,
      TestCoverageCount: extHostTypes.TestCoverageCount,
      FileCoverage: extHostTypes.FileCoverage,
      StatementCoverage: extHostTypes.StatementCoverage,
      BranchCoverage: extHostTypes.BranchCoverage,
      DeclarationCoverage: extHostTypes.DeclarationCoverage,
      WorkspaceTrustState: extHostTypes.WorkspaceTrustState,
      LanguageStatusSeverity: extHostTypes.LanguageStatusSeverity,
      QuickPickItemKind: extHostTypes.QuickPickItemKind,
      InputBoxValidationSeverity: extHostTypes.InputBoxValidationSeverity,
      TabInputText: extHostTypes.TextTabInput,
      TabInputTextDiff: extHostTypes.TextDiffTabInput,
      TabInputTextMerge: extHostTypes.TextMergeTabInput,
      TabInputCustom: extHostTypes.CustomEditorTabInput,
      TabInputNotebook: extHostTypes.NotebookEditorTabInput,
      TabInputNotebookDiff: extHostTypes.NotebookDiffEditorTabInput,
      TabInputWebview: extHostTypes.WebviewEditorTabInput,
      TabInputTerminal: extHostTypes.TerminalEditorTabInput,
      TabInputInteractiveWindow: extHostTypes.InteractiveWindowInput,
      TabInputChat: extHostTypes.ChatEditorTabInput,
      TabInputTextMultiDiff: extHostTypes.TextMultiDiffTabInput,
      TelemetryTrustedValue,
      LogLevel,
      EditSessionIdentityMatch,
      InteractiveSessionVoteDirection: extHostTypes.InteractiveSessionVoteDirection,
      ChatCopyKind: extHostTypes.ChatCopyKind,
      ChatSessionChangedFile: extHostTypes.ChatSessionChangedFile,
      ChatEditingSessionActionOutcome: extHostTypes.ChatEditingSessionActionOutcome,
      InteractiveEditorResponseFeedbackKind: extHostTypes.InteractiveEditorResponseFeedbackKind,
      DebugStackFrame: extHostTypes.DebugStackFrame,
      DebugThread: extHostTypes.DebugThread,
      RelatedInformationType: extHostTypes.RelatedInformationType,
      SpeechToTextStatus: extHostTypes.SpeechToTextStatus,
      TextToSpeechStatus: extHostTypes.TextToSpeechStatus,
      PartialAcceptTriggerKind: extHostTypes.PartialAcceptTriggerKind,
      InlineCompletionEndOfLifeReasonKind: extHostTypes.InlineCompletionEndOfLifeReasonKind,
      InlineCompletionDisplayLocationKind: extHostTypes.InlineCompletionDisplayLocationKind,
      KeywordRecognitionStatus: extHostTypes.KeywordRecognitionStatus,
      ChatImageMimeType: extHostTypes.ChatImageMimeType,
      ChatResponseMarkdownPart: extHostTypes.ChatResponseMarkdownPart,
      ChatResponseFileTreePart: extHostTypes.ChatResponseFileTreePart,
      ChatResponseAnchorPart: extHostTypes.ChatResponseAnchorPart,
      ChatResponseProgressPart: extHostTypes.ChatResponseProgressPart,
      ChatResponseProgressPart2: extHostTypes.ChatResponseProgressPart2,
      ChatResponseThinkingProgressPart: extHostTypes.ChatResponseThinkingProgressPart,
      ChatResponseHookPart: extHostTypes.ChatResponseHookPart,
      ChatResponseVoiceProgressPart: extHostTypes.ChatResponseVoiceProgressPart,
      ChatResponseAutoModeResolutionPart: extHostTypes.ChatResponseAutoModeResolutionPart,
      ChatResponseReferencePart: extHostTypes.ChatResponseReferencePart,
      ChatResponseReferencePart2: extHostTypes.ChatResponseReferencePart,
      ChatResponseCodeCitationPart: extHostTypes.ChatResponseCodeCitationPart,
      ChatResponseCodeblockUriPart: extHostTypes.ChatResponseCodeblockUriPart,
      ChatResponseWarningPart: extHostTypes.ChatResponseWarningPart,
      ChatResponseInfoPart: extHostTypes.ChatResponseInfoPart,
      ChatResponseTextEditPart: extHostTypes.ChatResponseTextEditPart,
      ChatResponseNotebookEditPart: extHostTypes.ChatResponseNotebookEditPart,
      ChatResponseWorkspaceEditPart: extHostTypes.ChatResponseWorkspaceEditPart,
      ChatResponseMarkdownWithVulnerabilitiesPart: extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart,
      ChatResponseCommandButtonPart: extHostTypes.ChatResponseCommandButtonPart,
      ChatResponseConfirmationPart: extHostTypes.ChatResponseConfirmationPart,
      ChatQuestion: extHostTypes.ChatQuestion,
      ChatQuestionType: extHostTypes.ChatQuestionType,
      ChatResponseQuestionCarouselPart: extHostTypes.ChatResponseQuestionCarouselPart,
      ChatResponseMovePart: extHostTypes.ChatResponseMovePart,
      ChatResponseExtensionsPart: extHostTypes.ChatResponseExtensionsPart,
      ChatResponseExternalEditPart: extHostTypes.ChatResponseExternalEditPart,
      ChatResponsePullRequestPart: extHostTypes.ChatResponsePullRequestPart,
      ChatResponseMultiDiffPart: extHostTypes.ChatResponseMultiDiffPart,
      ChatResponseReferencePartStatusKind: extHostTypes.ChatResponseReferencePartStatusKind,
      ChatResponseClearToPreviousToolInvocationReason: extHostTypes.ChatResponseClearToPreviousToolInvocationReason,
      ChatRequestTurn: extHostTypes.ChatRequestTurn,
      ChatRequestTurn2: extHostTypes.ChatRequestTurn,
      ChatResponseTurn: extHostTypes.ChatResponseTurn,
      ChatResponseTurn2: extHostTypes.ChatResponseTurn2,
      ChatSubagentToolInvocationData: extHostTypes.ChatSubagentToolInvocationData,
      ChatToolInvocationPart: extHostTypes.ChatToolInvocationPart,
      ChatLocation: extHostTypes.ChatLocation,
      ChatSessionStatus: extHostTypes.ChatSessionStatus,
      ChatSessionCustomizationType: extHostTypes.ChatSessionCustomizationType,
      ChatDebugLogLevel: extHostTypes.ChatDebugLogLevel,
      ChatDebugToolCallResult: extHostTypes.ChatDebugToolCallResult,
      ChatDebugHookResult: extHostTypes.ChatDebugHookResult,
      ChatDebugToolCallEvent: extHostTypes.ChatDebugToolCallEvent,
      ChatDebugModelTurnEvent: extHostTypes.ChatDebugModelTurnEvent,
      ChatDebugGenericEvent: extHostTypes.ChatDebugGenericEvent,
      ChatDebugSubagentInvocationEvent: extHostTypes.ChatDebugSubagentInvocationEvent,
      ChatDebugUserMessageEvent: extHostTypes.ChatDebugUserMessageEvent,
      ChatDebugAgentResponseEvent: extHostTypes.ChatDebugAgentResponseEvent,
      ChatDebugMessageSection: extHostTypes.ChatDebugMessageSection,
      ChatDebugEventTextContent: extHostTypes.ChatDebugEventTextContent,
      ChatDebugMessageContentType: extHostTypes.ChatDebugMessageContentType,
      ChatDebugEventMessageContent: extHostTypes.ChatDebugEventMessageContent,
      ChatDebugEventToolCallContent: extHostTypes.ChatDebugEventToolCallContent,
      ChatDebugEventModelTurnContent: extHostTypes.ChatDebugEventModelTurnContent,
      ChatDebugEventHookContent: extHostTypes.ChatDebugEventHookContent,
      ChatRequestEditorData: extHostTypes.ChatRequestEditorData,
      ChatRequestNotebookData: extHostTypes.ChatRequestNotebookData,
      ChatReferenceBinaryData: extHostTypes.ChatReferenceBinaryData,
      ChatRequestEditedFileEventKind: extHostTypes.ChatRequestEditedFileEventKind,
      LanguageModelChatMessageRole: extHostTypes.LanguageModelChatMessageRole,
      LanguageModelChatMessage: extHostTypes.LanguageModelChatMessage,
      LanguageModelChatMessage2: extHostTypes.LanguageModelChatMessage2,
      LanguageModelToolResultPart: extHostTypes.LanguageModelToolResultPart,
      LanguageModelToolResultPart2: extHostTypes.LanguageModelToolResultPart,
      LanguageModelTextPart: extHostTypes.LanguageModelTextPart,
      LanguageModelTextPart2: extHostTypes.LanguageModelTextPart,
      LanguageModelPartAudience: extHostTypes.LanguageModelPartAudience,
      ToolResultAudience: extHostTypes.LanguageModelPartAudience,
      // back compat
      LanguageModelToolCallPart: extHostTypes.LanguageModelToolCallPart,
      LanguageModelThinkingPart: extHostTypes.LanguageModelThinkingPart,
      LanguageModelError: extHostTypes.LanguageModelError,
      LanguageModelToolResult: extHostTypes.LanguageModelToolResult,
      LanguageModelToolResult2: extHostTypes.LanguageModelToolResult2,
      LanguageModelDataPart: extHostTypes.LanguageModelDataPart,
      LanguageModelDataPart2: extHostTypes.LanguageModelDataPart,
      LanguageModelToolExtensionSource: extHostTypes.LanguageModelToolExtensionSource,
      LanguageModelToolMCPSource: extHostTypes.LanguageModelToolMCPSource,
      ExtendedLanguageModelToolResult: extHostTypes.ExtendedLanguageModelToolResult,
      LanguageModelChatToolMode: extHostTypes.LanguageModelChatToolMode,
      LanguageModelPromptTsxPart: extHostTypes.LanguageModelPromptTsxPart,
      NewSymbolName: extHostTypes.NewSymbolName,
      NewSymbolNameTag: extHostTypes.NewSymbolNameTag,
      NewSymbolNameTriggerKind: extHostTypes.NewSymbolNameTriggerKind,
      ExcludeSettingOptions,
      TextSearchContext2,
      TextSearchMatch2,
      AISearchKeyword,
      TextSearchCompleteMessageTypeNew: TextSearchCompleteMessageType,
      ChatErrorLevel: extHostTypes.ChatErrorLevel,
      ChatInputNotificationSeverity: extHostTypes.ChatInputNotificationSeverity,
      McpHttpServerDefinition: extHostTypes.McpHttpServerDefinition,
      McpHttpServerDefinition2: extHostTypes.McpHttpServerDefinition,
      McpStdioServerDefinition: extHostTypes.McpStdioServerDefinition,
      McpStdioServerDefinition2: extHostTypes.McpStdioServerDefinition,
      McpToolAvailability: extHostTypes.McpToolAvailability,
      McpToolInvocationContentData: extHostTypes.McpToolInvocationContentData,
      SettingsSearchResultKind: extHostTypes.SettingsSearchResultKind,
      ChatTodoStatus: extHostTypes.ChatTodoStatus,
      ChatDebugSubagentStatus: extHostTypes.ChatDebugSubagentStatus
    };
  };
}
export {
  createApiFactoryAndRegisterActors,
  getTerminalInternalOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0LmFwaS5pbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVPYmplY3QsIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IHNjb3JlLCB0YXJnZXRzTm90ZWJvb2tzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZVNlbGVjdG9yLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlQ29uZmlndXJhdGlvbiBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkVycm9yLCBFeHRlbnNpb25JZGVudGlmaWVyU2V0LCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCAqIGFzIGZpbGVzIGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlTmFtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2ggfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL2VkaXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBVSUtpbmQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBQcm94eUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgQUlTZWFyY2hLZXl3b3JkLCBFeGNsdWRlU2V0dGluZ09wdGlvbnMsIFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlLCBUZXh0U2VhcmNoQ29udGV4dDIsIFRleHRTZWFyY2hNYXRjaDIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IENhbmRpZGF0ZVBvcnRTb3VyY2UsIEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0TG9nTGV2ZWxTZXJ2aWNlU2hhcGUsIElEb2N1bWVudERpZmZMaW5lQ2hhbmdlRHRvLCBNYWluQ29udGV4dCB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0UmVsYXRlZEluZm9ybWF0aW9uIH0gZnJvbSAnLi9leHRIb3N0QWlSZWxhdGVkSW5mb3JtYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdEFpU2V0dGluZ3NTZWFyY2ggfSBmcm9tICcuL2V4dEhvc3RBaVNldHRpbmdzU2VhcmNoLmpzJztcbmltcG9ydCB7IEV4dEhvc3RBcGlDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdEFwaUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXV0aGVudGljYXRpb24gfSBmcm9tICcuL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QnVsa0VkaXRzIH0gZnJvbSAnLi9leHRIb3N0QnVsa0VkaXRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0QWdlbnRzMiB9IGZyb20gJy4vZXh0SG9zdENoYXRBZ2VudHMyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIgfSBmcm9tICcuL2V4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRTZXNzaW9ucyB9IGZyb20gJy4vZXh0SG9zdENoYXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdFN0YXR1cyB9IGZyb20gJy4vZXh0SG9zdENoYXRTdGF0dXMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRRdW90YSB9IGZyb20gJy4vZXh0SG9zdENoYXRRdW90YS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uIH0gZnJvbSAnLi9leHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDbGlwYm9hcmQgfSBmcm9tICcuL2V4dEhvc3RDbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEVkaXRvckluc2V0cyB9IGZyb20gJy4vZXh0SG9zdENvZGVJbnNldHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvZGVNYXBwZXIgfSBmcm9tICcuL2V4dEhvc3RDb2RlTWFwcGVyLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFeHRIb3N0Q29tbWVudHMgfSBmcm9tICcuL2V4dEhvc3RDb21tZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdEN1c3RvbUVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3RDdXN0b21FZGl0b3JzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RGF0YUNoYW5uZWxzIH0gZnJvbSAnLi9leHRIb3N0RGF0YUNoYW5uZWxzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RGVjb3JhdGlvbnMgfSBmcm9tICcuL2V4dEhvc3REZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhZ25vc3RpY3MgfSBmcm9tICcuL2V4dEhvc3REaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhbG9ncyB9IGZyb20gJy4vZXh0SG9zdERpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudCB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEVkaXRvclRhYnMgfSBmcm9tICcuL2V4dEhvc3RFZGl0b3JUYWJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RFbWJlZGRpbmdzIH0gZnJvbSAnLi9leHRIb3N0RW1iZWRkaW5nLmpzJztcbmltcG9ydCB7IEV4dEhvc3RBaUVtYmVkZGluZ1ZlY3RvciB9IGZyb20gJy4vZXh0SG9zdEVtYmVkZGluZ1ZlY3Rvci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb24sIElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEZpbGVTeXN0ZW0gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtIH0gZnJvbSAnLi9leHRIb3N0RmlsZVN5c3RlbUNvbnN1bWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlLCBGaWxlU3lzdGVtV2F0Y2hlckNyZWF0ZU9wdGlvbnMgfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0SW50ZXJhY3RpdmUgfSBmcm9tICcuL2V4dEhvc3RJbnRlcmFjdGl2ZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0TGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0TG9jYWxpemF0aW9uU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RNYW5hZ2VkU29ja2V0cyB9IGZyb20gJy4vZXh0SG9zdE1hbmFnZWRTb2NrZXRzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QnJvd3NlclR1bm5lbFByb3h5IH0gZnJvbSAnLi9leHRIb3N0QnJvd3NlclR1bm5lbFByb3h5LmpzJztcbmltcG9ydCB7IElFeHRIb3N0TXBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdE1jcC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TWVzc2FnZVNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RNZXNzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyIH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2suanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9va0RvY3VtZW50U2F2ZVBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0VkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9va0VkaXRvcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rS2VybmVscyB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rS2VybmVscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tSZW5kZXJlcnMgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9va1JlbmRlcmVycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdE91dHB1dFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RPdXRwdXQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFByb2ZpbGVDb250ZW50SGFuZGxlcnMgfSBmcm9tICcuL2V4dEhvc3RQcm9maWxlQ29udGVudEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RQcm9ncmVzcyB9IGZyb20gJy4vZXh0SG9zdFByb2dyZXNzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RRdWlja0RpZmYgfSBmcm9tICcuL2V4dEhvc3RRdWlja0RpZmYuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEFnZW50RWRpdG9yQ29tbWVudHMgfSBmcm9tICcuL2V4dEhvc3RBZ2VudEVkaXRvckNvbW1lbnRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUV4dEhvc3RRdWlja09wZW4gfSBmcm9tICcuL2V4dEhvc3RRdWlja09wZW4uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U0NNIH0gZnJvbSAnLi9leHRIb3N0U0NNLmpzJztcbmltcG9ydCB7IElFeHRIb3N0U2VhcmNoIH0gZnJvbSAnLi9leHRIb3N0U2VhcmNoLmpzJztcbmltcG9ydCB7IElFeHRIb3N0U2VjcmV0U3RhdGUgfSBmcm9tICcuL2V4dEhvc3RTZWNyZXRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U2hhcmUgfSBmcm9tICcuL2V4dEhvc3RTaGFyZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U3BlZWNoIH0gZnJvbSAnLi9leHRIb3N0U3BlZWNoLmpzJztcbmltcG9ydCB7IEV4dEhvc3RCcm93c2VycyB9IGZyb20gJy4vZXh0SG9zdEJyb3dzZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RTdGF0dXNCYXIgfSBmcm9tICcuL2V4dEhvc3RTdGF0dXNCYXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RTdG9yYWdlIH0gZnJvbSAnLi9leHRIb3N0U3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU3RvcmFnZVBhdGhzIH0gZnJvbSAnLi9leHRIb3N0U3RvcmFnZVBhdGhzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGFzayB9IGZyb20gJy4vZXh0SG9zdFRhc2suanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRlbGVtZXRyeUxvZ2dlciwgSUV4dEhvc3RUZWxlbWV0cnksIGlzTmV3QXBwSW5zdGFsbCB9IGZyb20gJy4vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSwgSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVzdGluZyB9IGZyb20gJy4vZXh0SG9zdFRlc3RpbmcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3RUZXh0RWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGhlbWluZyB9IGZyb20gJy4vZXh0SG9zdFRoZW1pbmcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRpbWVsaW5lIH0gZnJvbSAnLi9leHRIb3N0VGltZWxpbmUuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRyZWVWaWV3cyB9IGZyb20gJy4vZXh0SG9zdFRyZWVWaWV3cy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFR1bm5lbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VXJpT3BlbmVycyB9IGZyb20gJy4vZXh0SG9zdFVyaU9wZW5lci5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VXJsc1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RVcmxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RXZWJ2aWV3cyB9IGZyb20gJy4vZXh0SG9zdFdlYnZpZXcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdlYnZpZXdQYW5lbHMgfSBmcm9tICcuL2V4dEhvc3RXZWJ2aWV3UGFuZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RXZWJ2aWV3Vmlld3MgfSBmcm9tICcuL2V4dEhvc3RXZWJ2aWV3Vmlldy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFdpbmRvdyB9IGZyb20gJy4vZXh0SG9zdFdpbmRvdy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFBvd2VyIH0gZnJvbSAnLi9leHRIb3N0UG93ZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRDb250ZXh0IH0gZnJvbSAnLi9leHRIb3N0Q2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXREZWJ1ZyB9IGZyb20gJy4vZXh0SG9zdENoYXREZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uIH0gZnJvbSAnLi9leHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RHaXRFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblJlZ2lzdHJpZXMge1xuXHRtaW5lOiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5O1xuXHRhbGw6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkFwaUZhY3Rvcnkge1xuXHQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25SZWdpc3RyaWVzLCBjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKTogdHlwZW9mIHZzY29kZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBvcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zKTogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0aWYgKG9wdGlvbnMuaXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsKSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVybWluYWxSZW1vdGVSZXNvbHZlcicpO1xuXHRcdHJldHVybiB7IGlzUmVtb3RlUmVzb2x2ZXJUZXJtaW5hbDogdHJ1ZSB9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVGhpcyBtZXRob2QgaW5zdGFudGlhdGVzIGFuZCByZXR1cm5zIHRoZSBleHRlbnNpb24gQVBJIHN1cmZhY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFwaUZhY3RvcnlBbmRSZWdpc3RlckFjdG9ycyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElFeHRlbnNpb25BcGlGYWN0b3J5IHtcblxuXHQvLyBzZXJ2aWNlc1xuXHRjb25zdCBpbml0RGF0YSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEluaXREYXRhU2VydmljZSk7XG5cdGNvbnN0IGV4dEhvc3RGaWxlU3lzdGVtSW5mbyA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTtcblx0Y29uc3QgZXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSk7XG5cdGNvbnN0IGV4dGVuc2lvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdFdvcmtzcGFjZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFdvcmtzcGFjZSk7XG5cdGNvbnN0IGV4dEhvc3RUZWxlbWV0cnkgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RUZWxlbWV0cnkpO1xuXHRjb25zdCBleHRIb3N0Q29uZmlndXJhdGlvbiA9IGFjY2Vzc29yLmdldChJRXh0SG9zdENvbmZpZ3VyYXRpb24pO1xuXHRjb25zdCB1cmlUcmFuc2Zvcm1lciA9IGFjY2Vzc29yLmdldChJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlKTtcblx0Y29uc3QgcnBjUHJvdG9jb2wgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RScGNTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdFN0b3JhZ2UgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RTdG9yYWdlKTtcblx0Y29uc3QgZXh0ZW5zaW9uU3RvcmFnZVBhdGhzID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25TdG9yYWdlUGF0aHMpO1xuXHRjb25zdCBleHRIb3N0TG9nZ2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nZ2VyU2VydmljZSk7XG5cdGNvbnN0IGV4dEhvc3RMb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdFR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RUdW5uZWxTZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdEFwaURlcHJlY2F0aW9uID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZXh0SG9zdFdpbmRvdyA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFdpbmRvdyk7XG5cdGNvbnN0IGV4dEhvc3RQb3dlciA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFBvd2VyKTtcblx0Y29uc3QgZXh0SG9zdFVybHMgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RVcmxzU2VydmljZSk7XG5cdGNvbnN0IGV4dEhvc3RTZWNyZXRTdGF0ZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdFNlY3JldFN0YXRlKTtcblx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RFZGl0b3JUYWJzKTtcblx0Y29uc3QgZXh0SG9zdE1hbmFnZWRTb2NrZXRzID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0TWFuYWdlZFNvY2tldHMpO1xuXHRjb25zdCBleHRIb3N0QnJvd3NlclR1bm5lbFByb3h5ID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0QnJvd3NlclR1bm5lbFByb3h5KTtcblx0Y29uc3QgZXh0SG9zdFByb2dyZXNzID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0UHJvZ3Jlc3MpO1xuXHRjb25zdCBleHRIb3N0QXV0aGVudGljYXRpb24gPSBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RBdXRoZW50aWNhdGlvbik7XG5cdGNvbnN0IGV4dEhvc3RMYW5ndWFnZU1vZGVscyA9IGFjY2Vzc29yLmdldChJRXh0SG9zdExhbmd1YWdlTW9kZWxzKTtcblx0Y29uc3QgZXh0SG9zdE1jcCA9IGFjY2Vzc29yLmdldChJRXh0SG9zdE1wY1NlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0RGF0YUNoYW5uZWxzID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0RGF0YUNoYW5uZWxzKTtcblx0Y29uc3QgZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uID0gYWNjZXNzb3IuZ2V0KElFeHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24pO1xuXHRjb25zdCBleHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0SG9zdEdpdEV4dGVuc2lvblNlcnZpY2UpO1xuXG5cdC8vIHJlZ2lzdGVyIGFkZHJlc3NhYmxlIGluc3RhbmNlc1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEZpbGVTeXN0ZW1JbmZvLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMb2dMZXZlbFNlcnZpY2VTaGFwZSwgPEV4dEhvc3RMb2dMZXZlbFNlcnZpY2VTaGFwZT48YW55PmV4dEhvc3RMb2dnZXJTZXJ2aWNlKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RXb3Jrc3BhY2UsIGV4dEhvc3RXb3Jrc3BhY2UpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdENvbmZpZ3VyYXRpb24sIGV4dEhvc3RDb25maWd1cmF0aW9uKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTdG9yYWdlLCBleHRIb3N0U3RvcmFnZSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VHVubmVsU2VydmljZSwgZXh0SG9zdFR1bm5lbFNlcnZpY2UpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFdpbmRvdywgZXh0SG9zdFdpbmRvdyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0UG93ZXIsIGV4dEhvc3RQb3dlcik7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VXJscywgZXh0SG9zdFVybHMpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNlY3JldFN0YXRlLCBleHRIb3N0U2VjcmV0U3RhdGUpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRlbGVtZXRyeSwgZXh0SG9zdFRlbGVtZXRyeSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RWRpdG9yVGFicywgZXh0SG9zdEVkaXRvclRhYnMpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE1hbmFnZWRTb2NrZXRzLCBleHRIb3N0TWFuYWdlZFNvY2tldHMpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEJyb3dzZXJUdW5uZWxQcm94eSwgZXh0SG9zdEJyb3dzZXJUdW5uZWxQcm94eSk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0UHJvZ3Jlc3MsIGV4dEhvc3RQcm9ncmVzcyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QXV0aGVudGljYXRpb24sIGV4dEhvc3RBdXRoZW50aWNhdGlvbik7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdFByb3ZpZGVyLCBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMpO1xuXHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERhdGFDaGFubmVscywgZXh0SG9zdERhdGFDaGFubmVscyk7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TWV0ZXJlZENvbm5lY3Rpb24sIGV4dEhvc3RNZXRlcmVkQ29ubmVjdGlvbik7XG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0R2l0RXh0ZW5zaW9uLCBleHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZSk7XG5cblx0Ly8gYXV0b21hdGljYWxseSBjcmVhdGUgYW5kIHJlZ2lzdGVyIGFkZHJlc3NhYmxlIGluc3RhbmNlc1xuXHRjb25zdCBleHRIb3N0RGVjb3JhdGlvbnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERlY29yYXRpb25zLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3REZWNvcmF0aW9ucykpO1xuXHRjb25zdCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycywgYWNjZXNzb3IuZ2V0KElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycykpO1xuXHRjb25zdCBleHRIb3N0Q29tbWFuZHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdENvbW1hbmRzLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RDb21tYW5kcykpO1xuXHRjb25zdCBleHRIb3N0VGVybWluYWxTZXJ2aWNlID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUZXJtaW5hbFNlcnZpY2UsIGFjY2Vzc29yLmdldChJRXh0SG9zdFRlcm1pbmFsU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24sIGFjY2Vzc29yLmdldChJRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbikpO1xuXHRjb25zdCBleHRIb3N0RGVidWdTZXJ2aWNlID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REZWJ1Z1NlcnZpY2UsIGFjY2Vzc29yLmdldChJRXh0SG9zdERlYnVnU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0U2VhcmNoID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTZWFyY2gsIGFjY2Vzc29yLmdldChJRXh0SG9zdFNlYXJjaCkpO1xuXHRjb25zdCBleHRIb3N0VGFzayA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGFzaywgYWNjZXNzb3IuZ2V0KElFeHRIb3N0VGFzaykpO1xuXHRjb25zdCBleHRIb3N0T3V0cHV0U2VydmljZSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0T3V0cHV0U2VydmljZSwgYWNjZXNzb3IuZ2V0KElFeHRIb3N0T3V0cHV0U2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0TG9jYWxpemF0aW9uID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMb2NhbGl6YXRpb24sIGFjY2Vzc29yLmdldChJRXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2UpKTtcblxuXHQvLyBtYW51YWxseSBjcmVhdGUgYW5kIHJlZ2lzdGVyIGFkZHJlc3NhYmxlIGluc3RhbmNlc1xuXHRjb25zdCBleHRIb3N0RG9jdW1lbnRzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REb2N1bWVudHMsIG5ldyBFeHRIb3N0RG9jdW1lbnRzKHJwY1Byb3RvY29sLCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycykpO1xuXHRjb25zdCBleHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXJzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcnMsIG5ldyBFeHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LCBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KGV4dEhvc3RMb2dTZXJ2aWNlLCBleHRIb3N0RG9jdW1lbnRzLCBycGNQcm90b2NvbC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQnVsa0VkaXRzKSkpO1xuXHRjb25zdCBleHRIb3N0Tm90ZWJvb2sgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rLCBuZXcgRXh0SG9zdE5vdGVib29rQ29udHJvbGxlcihycGNQcm90b2NvbCwgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycywgZXh0SG9zdERvY3VtZW50cywgZXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSwgZXh0SG9zdFNlYXJjaCwgZXh0SG9zdExvZ1NlcnZpY2UpKTtcblx0Y29uc3QgZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3ROb3RlYm9va0RvY3VtZW50cywgbmV3IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50cyhleHRIb3N0Tm90ZWJvb2spKTtcblx0Y29uc3QgZXh0SG9zdE5vdGVib29rRWRpdG9ycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Tm90ZWJvb2tFZGl0b3JzLCBuZXcgRXh0SG9zdE5vdGVib29rRWRpdG9ycyhleHRIb3N0TG9nU2VydmljZSwgZXh0SG9zdE5vdGVib29rKSk7XG5cdGNvbnN0IGV4dEhvc3ROb3RlYm9va0tlcm5lbHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rS2VybmVscywgbmV3IEV4dEhvc3ROb3RlYm9va0tlcm5lbHMocnBjUHJvdG9jb2wsIGluaXREYXRhLCBleHRIb3N0Tm90ZWJvb2ssIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdExvZ1NlcnZpY2UpKTtcblx0Y29uc3QgZXh0SG9zdE5vdGVib29rUmVuZGVyZXJzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3ROb3RlYm9va1JlbmRlcmVycywgbmV3IEV4dEhvc3ROb3RlYm9va1JlbmRlcmVycyhycGNQcm90b2NvbCwgZXh0SG9zdE5vdGVib29rKSk7XG5cdGNvbnN0IGV4dEhvc3ROb3RlYm9va0RvY3VtZW50U2F2ZVBhcnRpY2lwYW50ID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3ROb3RlYm9va0RvY3VtZW50U2F2ZVBhcnRpY2lwYW50LCBuZXcgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQoZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3ROb3RlYm9vaywgcnBjUHJvdG9jb2wuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZEJ1bGtFZGl0cykpKTtcblx0Y29uc3QgZXh0SG9zdEVkaXRvcnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEVkaXRvcnMsIG5ldyBFeHRIb3N0RWRpdG9ycyhycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpKTtcblx0Y29uc3QgZXh0SG9zdFRyZWVWaWV3cyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0VHJlZVZpZXdzLCBuZXcgRXh0SG9zdFRyZWVWaWV3cyhycGNQcm90b2NvbC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVHJlZVZpZXdzKSwgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0RWRpdG9ySW5zZXRzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RFZGl0b3JJbnNldHMsIG5ldyBFeHRIb3N0RWRpdG9ySW5zZXRzKHJwY1Byb3RvY29sLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRFZGl0b3JJbnNldHMpLCBleHRIb3N0RWRpdG9ycywgaW5pdERhdGEucmVtb3RlKSk7XG5cdGNvbnN0IGV4dEhvc3REaWFnbm9zdGljcyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGlhZ25vc3RpY3MsIG5ldyBFeHRIb3N0RGlhZ25vc3RpY3MocnBjUHJvdG9jb2wsIGV4dEhvc3RMb2dTZXJ2aWNlLCBleHRIb3N0RmlsZVN5c3RlbUluZm8sIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKSk7XG5cdGNvbnN0IGV4dEhvc3RMYW5ndWFnZXMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhbmd1YWdlcywgbmV3IEV4dEhvc3RMYW5ndWFnZXMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHMsIGV4dEhvc3RDb21tYW5kcy5jb252ZXJ0ZXIsIHVyaVRyYW5zZm9ybWVyKSk7XG5cdGNvbnN0IGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLCBuZXcgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMocnBjUHJvdG9jb2wsIHVyaVRyYW5zZm9ybWVyLCBleHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3REaWFnbm9zdGljcywgZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3RBcGlEZXByZWNhdGlvbiwgZXh0SG9zdFRlbGVtZXRyeSkpO1xuXHRjb25zdCBleHRIb3N0Q29kZU1hcHBlciA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29kZU1hcHBlciwgbmV3IEV4dEhvc3RDb2RlTWFwcGVyKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RGaWxlU3lzdGVtID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RGaWxlU3lzdGVtLCBuZXcgRXh0SG9zdEZpbGVTeXN0ZW0ocnBjUHJvdG9jb2wsIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzKSk7XG5cdGNvbnN0IGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UsIG5ldyBFeHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZShycGNQcm90b2NvbCwgZXh0SG9zdExvZ1NlcnZpY2UsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKSk7XG5cdGNvbnN0IGV4dEhvc3RRdWlja09wZW4gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFF1aWNrT3BlbiwgY3JlYXRlRXh0SG9zdFF1aWNrT3BlbihycGNQcm90b2NvbCwgZXh0SG9zdFdvcmtzcGFjZSwgZXh0SG9zdENvbW1hbmRzKSk7XG5cdGNvbnN0IGV4dEhvc3RTQ00gPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNDTSwgbmV3IEV4dEhvc3RTQ00ocnBjUHJvdG9jb2wsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdERvY3VtZW50cywgZXh0SG9zdExvZ1NlcnZpY2UpKTtcblx0Y29uc3QgZXh0SG9zdFF1aWNrRGlmZiA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0UXVpY2tEaWZmLCBuZXcgRXh0SG9zdFF1aWNrRGlmZihycGNQcm90b2NvbCwgZXh0SG9zdERvY3VtZW50cywgdXJpVHJhbnNmb3JtZXIpKTtcblx0Y29uc3QgZXh0SG9zdEFnZW50RWRpdG9yQ29tbWVudHMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEFnZW50RWRpdG9yQ29tbWVudHMsIG5ldyBFeHRIb3N0QWdlbnRFZGl0b3JDb21tZW50cyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0U2hhcmUgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNoYXJlLCBuZXcgRXh0SG9zdFNoYXJlKHJwY1Byb3RvY29sLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRjb25zdCBleHRIb3N0Q29tbWVudCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29tbWVudHMsIGNyZWF0ZUV4dEhvc3RDb21tZW50cyhycGNQcm90b2NvbCwgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0RG9jdW1lbnRzKSk7XG5cdGNvbnN0IGV4dEhvc3RMYWJlbFNlcnZpY2UgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhYmVsU2VydmljZSwgbmV3IEV4dEhvc3RMYWJlbFNlcnZpY2UocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdFRoZW1pbmcgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRoZW1pbmcsIG5ldyBFeHRIb3N0VGhlbWluZyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0VGltZWxpbmUgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRpbWVsaW5lLCBuZXcgRXh0SG9zdFRpbWVsaW5lKHJwY1Byb3RvY29sLCBleHRIb3N0Q29tbWFuZHMpKTtcblx0Y29uc3QgZXh0SG9zdFdlYnZpZXdzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RXZWJ2aWV3cywgbmV3IEV4dEhvc3RXZWJ2aWV3cyhycGNQcm90b2NvbCwgaW5pdERhdGEucmVtb3RlLCBleHRIb3N0V29ya3NwYWNlLCBleHRIb3N0TG9nU2VydmljZSwgZXh0SG9zdEFwaURlcHJlY2F0aW9uKSk7XG5cdGNvbnN0IGV4dEhvc3RXZWJ2aWV3UGFuZWxzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RXZWJ2aWV3UGFuZWxzLCBuZXcgRXh0SG9zdFdlYnZpZXdQYW5lbHMocnBjUHJvdG9jb2wsIGV4dEhvc3RXZWJ2aWV3cywgZXh0SG9zdFdvcmtzcGFjZSkpO1xuXHRjb25zdCBleHRIb3N0Q3VzdG9tRWRpdG9ycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q3VzdG9tRWRpdG9ycywgbmV3IEV4dEhvc3RDdXN0b21FZGl0b3JzKHJwY1Byb3RvY29sLCBleHRIb3N0RG9jdW1lbnRzLCBleHRlbnNpb25TdG9yYWdlUGF0aHMsIGV4dEhvc3RXZWJ2aWV3cywgZXh0SG9zdFdlYnZpZXdQYW5lbHMpKTtcblx0Y29uc3QgZXh0SG9zdFdlYnZpZXdWaWV3cyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0V2Vidmlld1ZpZXdzLCBuZXcgRXh0SG9zdFdlYnZpZXdWaWV3cyhycGNQcm90b2NvbCwgZXh0SG9zdFdlYnZpZXdzKSk7XG5cdGNvbnN0IGV4dEhvc3RUZXN0aW5nID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUZXN0aW5nLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RUZXN0aW5nKSk7XG5cdGNvbnN0IGV4dEhvc3RVcmlPcGVuZXJzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RVcmlPcGVuZXJzLCBuZXcgRXh0SG9zdFVyaU9wZW5lcnMocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdFByb2ZpbGVDb250ZW50SGFuZGxlcnMgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFByb2ZpbGVDb250ZW50SGFuZGxlcnMsIG5ldyBFeHRIb3N0UHJvZmlsZUNvbnRlbnRIYW5kbGVycyhycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0Q2hhdE91dHB1dFJlbmRlcmVyID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIsIG5ldyBFeHRIb3N0Q2hhdE91dHB1dFJlbmRlcmVyKHJwY1Byb3RvY29sLCBleHRIb3N0V2Vidmlld3MpKTtcblx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RJbnRlcmFjdGl2ZSwgbmV3IEV4dEhvc3RJbnRlcmFjdGl2ZShycGNQcm90b2NvbCwgZXh0SG9zdE5vdGVib29rLCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycywgZXh0SG9zdENvbW1hbmRzLCBleHRIb3N0TG9nU2VydmljZSkpO1xuXHRjb25zdCBleHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMsIG5ldyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzKHJwY1Byb3RvY29sLCBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMpKTtcblx0Y29uc3QgZXh0SG9zdENoYXRTZXNzaW9ucyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdFNlc3Npb25zLCBuZXcgRXh0SG9zdENoYXRTZXNzaW9ucyhleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3RMYW5ndWFnZU1vZGVscywgcnBjUHJvdG9jb2wsIGV4dEhvc3RMb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGV4dEhvc3RDaGF0QWdlbnRzMiA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdEFnZW50czIsIG5ldyBFeHRIb3N0Q2hhdEFnZW50czIocnBjUHJvdG9jb2wsIGV4dEhvc3RMb2dTZXJ2aWNlLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3REb2N1bWVudHMsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMsIGV4dEhvc3REaWFnbm9zdGljcywgZXh0SG9zdExhbmd1YWdlTW9kZWxUb29scywgZXh0SG9zdENoYXRTZXNzaW9ucykpO1xuXHRjb25zdCBleHRIb3N0Q2hhdENvbnRleHQgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdENoYXRDb250ZXh0LCBuZXcgRXh0SG9zdENoYXRDb250ZXh0KHJwY1Byb3RvY29sLCBleHRIb3N0Q29tbWFuZHMsIGV4dEhvc3RFZGl0b3JUYWJzKSk7XG5cdGNvbnN0IGV4dEhvc3RDaGF0RGVidWcgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdENoYXREZWJ1ZywgbmV3IEV4dEhvc3RDaGF0RGVidWcocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdEFpUmVsYXRlZEluZm9ybWF0aW9uID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RBaVJlbGF0ZWRJbmZvcm1hdGlvbiwgbmV3IEV4dEhvc3RSZWxhdGVkSW5mb3JtYXRpb24ocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdEFpRW1iZWRkaW5nVmVjdG9yID0gcnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RBaUVtYmVkZGluZ1ZlY3RvciwgbmV3IEV4dEhvc3RBaUVtYmVkZGluZ1ZlY3RvcihycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0QWlTZXR0aW5nc1NlYXJjaCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QWlTZXR0aW5nc1NlYXJjaCwgbmV3IEV4dEhvc3RBaVNldHRpbmdzU2VhcmNoKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RTdGF0dXNCYXIgPSBycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdFN0YXR1c0JhciwgbmV3IEV4dEhvc3RTdGF0dXNCYXIocnBjUHJvdG9jb2wsIGV4dEhvc3RDb21tYW5kcy5jb252ZXJ0ZXIpKTtcblx0Y29uc3QgZXh0SG9zdFNwZWVjaCA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0U3BlZWNoLCBuZXcgRXh0SG9zdFNwZWVjaChycGNQcm90b2NvbCkpO1xuXHRjb25zdCBleHRIb3N0RW1iZWRkaW5ncyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RW1iZWRkaW5ncywgbmV3IEV4dEhvc3RFbWJlZGRpbmdzKHJwY1Byb3RvY29sKSk7XG5cdGNvbnN0IGV4dEhvc3RCcm93c2VycyA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QnJvd3NlcnMsIG5ldyBFeHRIb3N0QnJvd3NlcnMocnBjUHJvdG9jb2wpKTtcblx0Y29uc3QgZXh0SG9zdENoYXRRdW90YSA9IHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdFF1b3RhLCBuZXcgRXh0SG9zdENoYXRRdW90YShycGNQcm90b2NvbCkpO1xuXG5cdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TWNwLCBhY2Nlc3Nvci5nZXQoSUV4dEhvc3RNcGNTZXJ2aWNlKSk7XG5cblx0Ly8gQ2hlY2sgdGhhdCBubyBuYW1lZCBjdXN0b21lcnMgYXJlIG1pc3Npbmdcblx0Y29uc3QgZXhwZWN0ZWQgPSBPYmplY3QudmFsdWVzPFByb3h5SWRlbnRpZmllcjxhbnk+PihFeHRIb3N0Q29udGV4dCk7XG5cdHJwY1Byb3RvY29sLmFzc2VydFJlZ2lzdGVyZWQoZXhwZWN0ZWQpO1xuXG5cdC8vIE90aGVyIGluc3RhbmNlc1xuXHRjb25zdCBleHRIb3N0QnVsa0VkaXRzID0gbmV3IEV4dEhvc3RCdWxrRWRpdHMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0Y29uc3QgZXh0SG9zdENsaXBib2FyZCA9IG5ldyBFeHRIb3N0Q2xpcGJvYXJkKHJwY1Byb3RvY29sKTtcblx0Y29uc3QgZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlID0gbmV3IEV4dEhvc3RNZXNzYWdlU2VydmljZShycGNQcm90b2NvbCwgZXh0SG9zdExvZ1NlcnZpY2UpO1xuXHRjb25zdCBleHRIb3N0RGlhbG9ncyA9IG5ldyBFeHRIb3N0RGlhbG9ncyhycGNQcm90b2NvbCk7XG5cdGNvbnN0IGV4dEhvc3RDaGF0U3RhdHVzID0gbmV3IEV4dEhvc3RDaGF0U3RhdHVzKHJwY1Byb3RvY29sKTtcblx0Y29uc3QgZXh0SG9zdENoYXRJbnB1dE5vdGlmaWNhdGlvbiA9IG5ldyBFeHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uKHJwY1Byb3RvY29sKTtcblxuXHQvLyBSZWdpc3RlciBBUEktaXNoIGNvbW1hbmRzXG5cdEV4dEhvc3RBcGlDb21tYW5kcy5yZWdpc3RlcihleHRIb3N0Q29tbWFuZHMpO1xuXG5cdHJldHVybiBmdW5jdGlvbiAoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25SZWdpc3RyaWVzLCBjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKTogdHlwZW9mIHZzY29kZSB7XG5cblx0XHQvLyBXcmFwcyBhbiBldmVudCB3aXRoIGVycm9yIGhhbmRsaW5nIGFuZCB0ZWxlbWV0cnkgc28gdGhhdCB3ZSBrbm93IHdoYXQgZXh0ZW5zaW9uIGZhaWxzXG5cdFx0Ly8gaGFuZGxpbmcgZXZlbnRzLiBUaGlzIHdpbGwgcHJldmVudCB1cyBmcm9tIHJlcG9ydGluZyB0aGlzIGFzIFwib3VyXCIgZXJyb3ItdGVsZW1ldHJ5IGFuZFxuXHRcdC8vIGFsbG93cyBmb3IgYmV0dGVyIGJsYW1pbmdcblx0XHRmdW5jdGlvbiBfYXNFeHRlbnNpb25FdmVudDxUPihhY3R1YWw6IHZzY29kZS5FdmVudDxUPik6IHZzY29kZS5FdmVudDxUPiB7XG5cdFx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYWN0dWFsKGUgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCBlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdGVycm9ycy5vblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKG5ldyBFeHRlbnNpb25FcnJvcihleHRlbnNpb24uaWRlbnRpZmllciwgZXJyLCAnRkFJTEVEIHRvIGhhbmRsZSBldmVudCcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkaXNwb3NhYmxlcz8ucHVzaChoYW5kbGUpO1xuXHRcdFx0XHRyZXR1cm4gaGFuZGxlO1xuXHRcdFx0fTtcblx0XHR9XG5cblxuXHRcdC8vIENoZWNrIGRvY3VtZW50IHNlbGVjdG9ycyBmb3IgYmVpbmcgb3Zlcmx5IGdlbmVyaWMuIFRlY2huaWNhbGx5IHRoaXMgaXNuJ3QgYSBwcm9ibGVtIGJ1dFxuXHRcdC8vIGluIHByYWN0aWNlIG1hbnkgZXh0ZW5zaW9ucyBzYXkgdGhleSBzdXBwb3J0IGBmb29MYW5nYCBidXQgbmVlZCBmcy1hY2Nlc3MgdG8gZG8gc28uIFRob3NlXG5cdFx0Ly8gZXh0ZW5zaW9uIHNob3VsZCBzcGVjaWZ5IHRoZW4gdGhlIGBmaWxlYC1zY2hlbWUsIGUuZy4gYHsgc2NoZW1lOiAnZm9vTGFuZycsIGxhbmd1YWdlOiAnZm9vTGFuZycgfWBcblx0XHQvLyBXZSBvbmx5IGluZm9ybSBvbmNlLCBpdCBpcyBub3QgYSB3YXJuaW5nIGJlY2F1c2Ugd2UganVzdCB3YW50IHRvIHJhaXNlIGF3YXJlbmVzcyBhbmQgYmVjYXVzZVxuXHRcdC8vIHdlIGNhbm5vdCBzYXkgaWYgdGhlIGV4dGVuc2lvbiBpcyBkb2luZyBpdCByaWdodCBvciB3cm9uZy4uLlxuXHRcdGNvbnN0IGNoZWNrU2VsZWN0b3IgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGRvbmUgPSAhZXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudDtcblx0XHRcdGZ1bmN0aW9uIGluZm9ybU9uY2UoKSB7XG5cdFx0XHRcdGlmICghZG9uZSkge1xuXHRcdFx0XHRcdGV4dEhvc3RMb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0nIHVzZXMgYSBkb2N1bWVudCBzZWxlY3RvciB3aXRob3V0IHNjaGVtZS4gTGVhcm4gbW9yZSBhYm91dCB0aGlzOiBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9ODcyMzA1YCk7XG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmdW5jdGlvbiBwZXJmb3JtKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3Rvcik6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0b3IpKSB7XG5cdFx0XHRcdFx0c2VsZWN0b3IuZm9yRWFjaChwZXJmb3JtKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0aW5mb3JtT25jZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlciA9IHNlbGVjdG9yIGFzIHZzY29kZS5Eb2N1bWVudEZpbHRlcjsgLy8gVE9ETzogbWljcm9zb2Z0L1R5cGVTY3JpcHQjNDI3Njhcblx0XHRcdFx0XHRpZiAodHlwZW9mIGZpbHRlci5zY2hlbWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRpbmZvcm1PbmNlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZmlsdGVyLmV4Y2x1c2l2ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkb2N1bWVudEZpbHRlcnNFeGNsdXNpdmUnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNlbGVjdG9yO1xuXHRcdFx0fTtcblx0XHR9KSgpO1xuXG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb246IHR5cGVvZiB2c2NvZGUuYXV0aGVudGljYXRpb24gPSB7XG5cdFx0XHRnZXRTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzT3JDaGFsbGVuZ2U6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdnNjb2RlLkF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgb3B0aW9ucz86IHZzY29kZS5BdXRoZW50aWNhdGlvbkdldFNlc3Npb25PcHRpb25zKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQodHlwZW9mIG9wdGlvbnM/LmZvcmNlTmV3U2Vzc2lvbiA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5mb3JjZU5ld1Nlc3Npb24ubGVhcm5Nb3JlKSB8fFxuXHRcdFx0XHRcdCh0eXBlb2Ygb3B0aW9ucz8uY3JlYXRlSWZOb25lID09PSAnb2JqZWN0JyAmJiBvcHRpb25zLmNyZWF0ZUlmTm9uZS5sZWFybk1vcmUpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2F1dGhMZWFybk1vcmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucz8uYXV0aG9yaXphdGlvblNlcnZlcikge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2F1dGhJc3N1ZXJzJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHJldHVybiBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb24sIHByb3ZpZGVySWQsIHNjb3Blc09yQ2hhbGxlbmdlLCBvcHRpb25zIGFzIGFueSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWNjb3VudHMocHJvdmlkZXJJZDogc3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0QWNjb3VudHMocHJvdmlkZXJJZCk7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gVE9ETzogcmVtb3ZlIHRoaXMgYWZ0ZXIgR0hQUiBhbmQgQ29kZXNwYWNlcyBtb3ZlIG9mZiBvZiBpdFxuXHRcdFx0YXN5bmMgaGFzU2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYXV0aFNlc3Npb24nKTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHJldHVybiAhIShhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb24sIHByb3ZpZGVySWQsIHNjb3BlcywgeyBzaWxlbnQ6IHRydWUgfSBhcyBhbnkpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VTZXNzaW9ucygpOiB2c2NvZGUuRXZlbnQ8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudD4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldEV4dGVuc2lvblNjb3BlZFNlc3Npb25zRXZlbnQoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyLCBvcHRpb25zPzogdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb25zKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRpZiAob3B0aW9ucz8uc3VwcG9ydGVkQXV0aG9yaXphdGlvblNlcnZlcnMpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdhdXRoSXNzdWVycycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkLCBsYWJlbCwgcHJvdmlkZXIsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGNvbW1hbmRzXG5cdFx0Y29uc3QgY29tbWFuZHM6IHR5cGVvZiB2c2NvZGUuY29tbWFuZHMgPSB7XG5cdFx0XHRyZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZywgY29tbWFuZDogPFQ+KC4uLmFyZ3M6IHVua25vd25bXSkgPT4gVCB8IFRoZW5hYmxlPFQ+LCB0aGlzQXJncz86IHVua25vd24pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKHRydWUsIGlkLCBjb21tYW5kLCB0aGlzQXJncywgdW5kZWZpbmVkLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGV4dEVkaXRvckNvbW1hbmQoaWQ6IHN0cmluZywgY2FsbGJhY2s6ICh0ZXh0RWRpdG9yOiB2c2NvZGUuVGV4dEVkaXRvciwgZWRpdDogdnNjb2RlLlRleHRFZGl0b3JFZGl0LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQsIHRoaXNBcmc/OiB1bmtub3duKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZCh0cnVlLCBpZCwgKC4uLmFyZ3M6IHVua25vd25bXSk6IGFueSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvciA9IGV4dEhvc3RFZGl0b3JzLmdldEFjdGl2ZVRleHRFZGl0b3IoKTtcblx0XHRcdFx0XHRpZiAoIWFjdGl2ZVRleHRFZGl0b3IpIHtcblx0XHRcdFx0XHRcdGV4dEhvc3RMb2dTZXJ2aWNlLndhcm4oJ0Nhbm5vdCBleGVjdXRlICcgKyBpZCArICcgYmVjYXVzZSB0aGVyZSBpcyBubyBhY3RpdmUgdGV4dCBlZGl0b3IuJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBhY3RpdmVUZXh0RWRpdG9yLmVkaXQoKGVkaXQ6IHZzY29kZS5UZXh0RWRpdG9yRWRpdCkgPT4ge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkodGhpc0FyZywgW2FjdGl2ZVRleHRFZGl0b3IsIGVkaXQsIC4uLmFyZ3NdKTtcblx0XHRcdFx0XHR9KS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdGV4dEhvc3RMb2dTZXJ2aWNlLndhcm4oJ0VkaXRzIGZyb20gY29tbWFuZCAnICsgaWQgKyAnIHdlcmUgbm90IGFwcGxpZWQuJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2Uud2FybignQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcnVubmluZyBjb21tYW5kICcgKyBpZCwgZXJyKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGV4dGVuc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEaWZmSW5mb3JtYXRpb25Db21tYW5kOiAoaWQ6IHN0cmluZywgY2FsbGJhY2s6IChkaWZmOiB2c2NvZGUuTGluZUNoYW5nZVtdLCAuLi5hcmdzOiB1bmtub3duW10pID0+IGFueSwgdGhpc0FyZz86IHVua25vd24pOiB2c2NvZGUuRGlzcG9zYWJsZSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RpZmZDb21tYW5kJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKHRydWUsIGlkLCBhc3luYyAoLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yID0gZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuYWN0aXZlRWRpdG9yKHRydWUpO1xuXHRcdFx0XHRcdGlmICghYWN0aXZlVGV4dEVkaXRvcikge1xuXHRcdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2Uud2FybignQ2Fubm90IGV4ZWN1dGUgJyArIGlkICsgJyBiZWNhdXNlIHRoZXJlIGlzIG5vIGFjdGl2ZSB0ZXh0IGVkaXRvci4nKTtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZGlmZiA9IGF3YWl0IGV4dEhvc3RFZGl0b3JzLmdldERpZmZJbmZvcm1hdGlvbihhY3RpdmVUZXh0RWRpdG9yLmlkKTtcblx0XHRcdFx0XHRjYWxsYmFjay5hcHBseSh0aGlzQXJnLCBbZGlmZiwgLi4uYXJnc10pO1xuXHRcdFx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRleGVjdXRlQ29tbWFuZDxUPihpZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBUaGVuYWJsZTxUPiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8VD4oaWQsIC4uLmFyZ3MpO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbW1hbmRzKGZpbHRlckludGVybmFsOiBib29sZWFuID0gZmFsc2UpOiBUaGVuYWJsZTxzdHJpbmdbXT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENvbW1hbmRzLmdldENvbW1hbmRzKGZpbHRlckludGVybmFsKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBlbnZcblx0XHRjb25zdCBlbnY6IHR5cGVvZiB2c2NvZGUuZW52ID0ge1xuXHRcdFx0Z2V0IG1hY2hpbmVJZCgpIHsgcmV0dXJuIGluaXREYXRhLnRlbGVtZXRyeUluZm8ubWFjaGluZUlkOyB9LFxuXHRcdFx0Z2V0IGRldkRldmljZUlkKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkZXZEZXZpY2VJZCcpO1xuXHRcdFx0XHRyZXR1cm4gaW5pdERhdGEudGVsZW1ldHJ5SW5mby5kZXZEZXZpY2VJZCA/PyBpbml0RGF0YS50ZWxlbWV0cnlJbmZvLm1hY2hpbmVJZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaXNBcHBQb3J0YWJsZSgpIHsgcmV0dXJuIGluaXREYXRhLmVudmlyb25tZW50LmlzUG9ydGFibGUgPz8gZmFsc2U7IH0sXG5cdFx0XHRnZXQgc2Vzc2lvbklkKCkgeyByZXR1cm4gaW5pdERhdGEudGVsZW1ldHJ5SW5mby5zZXNzaW9uSWQ7IH0sXG5cdFx0XHRnZXQgbGFuZ3VhZ2UoKSB7IHJldHVybiBpbml0RGF0YS5lbnZpcm9ubWVudC5hcHBMYW5ndWFnZTsgfSxcblx0XHRcdGdldCBhcHBOYW1lKCkgeyByZXR1cm4gaW5pdERhdGEuZW52aXJvbm1lbnQuYXBwTmFtZTsgfSxcblx0XHRcdGdldCBhcHBSb290KCkgeyByZXR1cm4gaW5pdERhdGEuZW52aXJvbm1lbnQuYXBwUm9vdD8uZnNQYXRoID8/ICcnOyB9LFxuXHRcdFx0Z2V0IGFwcEhvc3QoKSB7IHJldHVybiBpbml0RGF0YS5lbnZpcm9ubWVudC5hcHBIb3N0OyB9LFxuXHRcdFx0Z2V0IHVyaVNjaGVtZSgpIHsgcmV0dXJuIGluaXREYXRhLmVudmlyb25tZW50LmFwcFVyaVNjaGVtZTsgfSxcblx0XHRcdGdldCBjbGlwYm9hcmQoKTogdnNjb2RlLkNsaXBib2FyZCB7IHJldHVybiBleHRIb3N0Q2xpcGJvYXJkLnZhbHVlOyB9LFxuXHRcdFx0Z2V0IHNoZWxsKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0U2hlbGwoZmFsc2UpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVNoZWxsKCkge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZVNoZWxsKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaXNUZWxlbWV0cnlFbmFibGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlbGVtZXRyeS5nZXRUZWxlbWV0cnlDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlVGVsZW1ldHJ5RW5hYmxlZCgpOiB2c2NvZGUuRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlbGVtZXRyeS5vbkRpZENoYW5nZVRlbGVtZXRyeUVuYWJsZWQpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZWxlbWV0cnlDb25maWd1cmF0aW9uKCk6IHZzY29kZS5UZWxlbWV0cnlDb25maWd1cmF0aW9uIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVsZW1ldHJ5Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVsZW1ldHJ5LmdldFRlbGVtZXRyeURldGFpbHMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VUZWxlbWV0cnlDb25maWd1cmF0aW9uKCk6IHZzY29kZS5FdmVudDx2c2NvZGUuVGVsZW1ldHJ5Q29uZmlndXJhdGlvbj4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZWxlbWV0cnknKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZWxlbWV0cnkub25EaWRDaGFuZ2VUZWxlbWV0cnlDb25maWd1cmF0aW9uKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaXNNZXRlcmVkQ29ubmVjdGlvbigpOiBib29sZWFuIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW52SXNDb25uZWN0aW9uTWV0ZXJlZCcpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uLmlzQ29ubmVjdGlvbk1ldGVyZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlTWV0ZXJlZENvbm5lY3Rpb24oKTogdnNjb2RlLkV2ZW50PGJvb2xlYW4+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW52SXNDb25uZWN0aW9uTWV0ZXJlZCcpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uLm9uRGlkQ2hhbmdlSXNDb25uZWN0aW9uTWV0ZXJlZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGlzTmV3QXBwSW5zdGFsbCgpIHtcblx0XHRcdFx0cmV0dXJuIGlzTmV3QXBwSW5zdGFsbChpbml0RGF0YS50ZWxlbWV0cnlJbmZvLmZpcnN0U2Vzc2lvbkRhdGUpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVRlbGVtZXRyeUxvZ2dlcihzZW5kZXI6IHZzY29kZS5UZWxlbWV0cnlTZW5kZXIsIG9wdGlvbnM/OiB2c2NvZGUuVGVsZW1ldHJ5TG9nZ2VyT3B0aW9ucyk6IHZzY29kZS5UZWxlbWV0cnlMb2dnZXIge1xuXHRcdFx0XHRFeHRIb3N0VGVsZW1ldHJ5TG9nZ2VyLnZhbGlkYXRlU2VuZGVyKHNlbmRlcik7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVsZW1ldHJ5Lmluc3RhbnRpYXRlTG9nZ2VyKGV4dGVuc2lvbiwgc2VuZGVyLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBvcGVuRXh0ZXJuYWwodXJpOiBVUkksIG9wdGlvbnM/OiB7IGFsbG93Q29udHJpYnV0ZWRPcGVuZXJzPzogYm9vbGVhbiB8IHN0cmluZyB9KSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V2luZG93Lm9wZW5VcmkodXJpLCB7XG5cdFx0XHRcdFx0YWxsb3dUdW5uZWxpbmc6IGluaXREYXRhLnJlbW90ZS5pc1JlbW90ZSA/PyAoaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSA/IGF3YWl0IGV4dEhvc3RUdW5uZWxTZXJ2aWNlLmhhc1R1bm5lbFByb3ZpZGVyKCkgOiBmYWxzZSksXG5cdFx0XHRcdFx0YWxsb3dDb250cmlidXRlZE9wZW5lcnM6IG9wdGlvbnM/LmFsbG93Q29udHJpYnV0ZWRPcGVuZXJzLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBhc0V4dGVybmFsVXJpKHVyaTogVVJJKSB7XG5cdFx0XHRcdGlmICh1cmkuc2NoZW1lID09PSBpbml0RGF0YS5lbnZpcm9ubWVudC5hcHBVcmlTY2hlbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFVybHMuY3JlYXRlQXBwVXJpKHVyaSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBleHRIb3N0V2luZG93LmFzRXh0ZXJuYWxVcmkodXJpLCB7IGFsbG93VHVubmVsaW5nOiAhIWluaXREYXRhLnJlbW90ZS5hdXRob3JpdHkgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKHVyaSwgU2NoZW1hcy5odHRwKSB8fCBtYXRjaGVzU2NoZW1lKHVyaSwgU2NoZW1hcy5odHRwcykpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1cmk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlbW90ZU5hbWUoKSB7XG5cdFx0XHRcdHJldHVybiBnZXRSZW1vdGVOYW1lKGluaXREYXRhLnJlbW90ZS5hdXRob3JpdHkpO1xuXHRcdFx0fSxcblx0XHRcdGdldCByZW1vdGVBdXRob3JpdHkoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Jlc29sdmVycycpO1xuXHRcdFx0XHRyZXR1cm4gaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdWlLaW5kKCkge1xuXHRcdFx0XHRyZXR1cm4gaW5pdERhdGEudWlLaW5kO1xuXHRcdFx0fSxcblx0XHRcdGdldCBsb2dMZXZlbCgpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMb2dTZXJ2aWNlLmdldExldmVsKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlTG9nTGV2ZWwoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0TG9nU2VydmljZS5vbkRpZENoYW5nZUxvZ0xldmVsKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYXBwUXVhbGl0eSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdyZXNvbHZlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGluaXREYXRhLnF1YWxpdHk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFwcENvbW1pdCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdyZXNvbHZlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGluaXREYXRhLmNvbW1pdDtcblx0XHRcdH0sXG5cdFx0XHRnZXREYXRhQ2hhbm5lbDxUPihjaGFubmVsSWQ6IHN0cmluZyk6IHZzY29kZS5EYXRhQ2hhbm5lbDxUPiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RhdGFDaGFubmVscycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERhdGFDaGFubmVscy5jcmVhdGVEYXRhQ2hhbm5lbChleHRlbnNpb24sIGNoYW5uZWxJZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHBvd2VyKCk6IHR5cGVvZiB2c2NvZGUuZW52LnBvd2VyIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW52aXJvbm1lbnRQb3dlcicpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGdldCBvbkRpZFN1c3BlbmQoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFBvd2VyLm9uRGlkU3VzcGVuZCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgb25EaWRSZXN1bWUoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFBvd2VyLm9uRGlkUmVzdW1lKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBvbkRpZENoYW5nZU9uQmF0dGVyeVBvd2VyKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RQb3dlci5vbkRpZENoYW5nZU9uQmF0dGVyeVBvd2VyKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBvbkRpZENoYW5nZVRoZXJtYWxTdGF0ZSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRDaGFuZ2VUaGVybWFsU3RhdGUpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uRGlkQ2hhbmdlU3BlZWRMaW1pdCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRDaGFuZ2VTcGVlZExpbWl0KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBvbldpbGxTaHV0ZG93bigpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25XaWxsU2h1dGRvd24pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IG9uRGlkTG9ja1NjcmVlbigpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRMb2NrU2NyZWVuKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBvbkRpZFVubG9ja1NjcmVlbigpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0UG93ZXIub25EaWRVbmxvY2tTY3JlZW4pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0U3lzdGVtSWRsZVN0YXRlKGlkbGVUaHJlc2hvbGRTZWNvbmRzOiBudW1iZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBleHRIb3N0UG93ZXIuZ2V0U3lzdGVtSWRsZVN0YXRlKGlkbGVUaHJlc2hvbGRTZWNvbmRzKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFN5c3RlbUlkbGVUaW1lKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RQb3dlci5nZXRTeXN0ZW1JZGxlVGltZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0Q3VycmVudFRoZXJtYWxTdGF0ZSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBleHRIb3N0UG93ZXIuZ2V0Q3VycmVudFRoZXJtYWxTdGF0ZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aXNPbkJhdHRlcnlQb3dlcigpIHtcblx0XHRcdFx0XHRcdHJldHVybiBleHRIb3N0UG93ZXIuaXNPbkJhdHRlcnlQb3dlcigpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YXN5bmMgc3RhcnRQb3dlclNhdmVCbG9ja2VyKHR5cGU6IHZzY29kZS5lbnYucG93ZXIuUG93ZXJTYXZlQmxvY2tlclR5cGUpOiBQcm9taXNlPHZzY29kZS5lbnYucG93ZXIuUG93ZXJTYXZlQmxvY2tlcj4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmxvY2tlciA9IGF3YWl0IGV4dEhvc3RQb3dlci5zdGFydFBvd2VyU2F2ZUJsb2NrZXIodHlwZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRpZDogYmxvY2tlci5pZCxcblx0XHRcdFx0XHRcdFx0Z2V0IGlzU3RhcnRlZCgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gYmxvY2tlci5pc1N0YXJ0ZWQ7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdFx0XHRcdFx0YmxvY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKCFpbml0RGF0YS5lbnZpcm9ubWVudC5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHQvLyBhbGxvdyB0byBwYXRjaCBlbnYtZnVuY3Rpb24gd2hlbiBydW5uaW5nIHRlc3RzXG5cdFx0XHRPYmplY3QuZnJlZXplKGVudik7XG5cdFx0fVxuXG5cdFx0Ly8gbmFtZXNwYWNlOiB0ZXN0c1xuXHRcdGNvbnN0IHRlc3RzOiB0eXBlb2YgdnNjb2RlLnRlc3RzID0ge1xuXHRcdFx0Y3JlYXRlVGVzdENvbnRyb2xsZXIocHJvdmlkZXIsIGxhYmVsLCByZWZyZXNoSGFuZGxlcj86ICh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSA9PiBUaGVuYWJsZTx2b2lkPiB8IHZvaWQpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXN0aW5nLmNyZWF0ZVRlc3RDb250cm9sbGVyKGV4dGVuc2lvbiwgcHJvdmlkZXIsIGxhYmVsLCByZWZyZXNoSGFuZGxlcik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGVzdE9ic2VydmVyKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXN0T2JzZXJ2ZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXN0aW5nLmNyZWF0ZVRlc3RPYnNlcnZlcigpO1xuXHRcdFx0fSxcblx0XHRcdHJ1blRlc3RzKHByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlc3RPYnNlcnZlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlc3RpbmcucnVuVGVzdHMocHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGVzdEZvbGxvd3VwUHJvdmlkZXIocHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVzdE9ic2VydmVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVzdGluZy5yZWdpc3RlclRlc3RGb2xsb3d1cFByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VUZXN0UmVzdWx0cygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVzdE9ic2VydmVyJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVzdGluZy5vblJlc3VsdHNDaGFuZ2VkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGVzdFJlc3VsdHMoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlc3RPYnNlcnZlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlc3RpbmcucmVzdWx0cztcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogZXh0ZW5zaW9uc1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSBpbml0RGF0YS5yZW1vdGUuaXNSZW1vdGVcblx0XHRcdD8gZXh0SG9zdFR5cGVzLkV4dGVuc2lvbktpbmQuV29ya3NwYWNlXG5cdFx0XHQ6IGV4dEhvc3RUeXBlcy5FeHRlbnNpb25LaW5kLlVJO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uczogdHlwZW9mIHZzY29kZS5leHRlbnNpb25zID0ge1xuXHRcdFx0Z2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcsIGluY2x1ZGVGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdHM/OiBib29sZWFuKTogdnNjb2RlLkV4dGVuc2lvbjxhbnk+IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdleHRlbnNpb25zQW55JykpIHtcblx0XHRcdFx0XHRpbmNsdWRlRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3RzID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWluZSA9IGV4dGVuc2lvbkluZm8ubWluZS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmIChtaW5lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBFeHRlbnNpb24oZXh0ZW5zaW9uU2VydmljZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG1pbmUsIGV4dGVuc2lvbktpbmQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5jbHVkZUZyb21EaWZmZXJlbnRFeHRlbnNpb25Ib3N0cykge1xuXHRcdFx0XHRcdGNvbnN0IGZvcmVpZ24gPSBleHRlbnNpb25JbmZvLmFsbC5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0aWYgKGZvcmVpZ24pIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRXh0ZW5zaW9uKGV4dGVuc2lvblNlcnZpY2UsIGV4dGVuc2lvbi5pZGVudGlmaWVyLCBmb3JlaWduLCBleHRlbnNpb25LaW5kIC8qIFRPRE9AYWxleGRpbWEgVEhJUyBJUyBXUk9ORyAqLywgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFsbCgpOiB2c2NvZGUuRXh0ZW5zaW9uPGFueT5bXSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLkV4dGVuc2lvbjxhbnk+W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXNjIG9mIGV4dGVuc2lvbkluZm8ubWluZS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBFeHRlbnNpb24oZXh0ZW5zaW9uU2VydmljZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGRlc2MsIGV4dGVuc2lvbktpbmQsIGZhbHNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWxsQWNyb3NzRXh0ZW5zaW9uSG9zdHMoKTogdnNjb2RlLkV4dGVuc2lvbjxhbnk+W10ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdleHRlbnNpb25zQW55Jyk7XG5cdFx0XHRcdGNvbnN0IGxvY2FsID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQoZXh0ZW5zaW9uSW5mby5taW5lLmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpLm1hcChkZXNjID0+IGRlc2MuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHZzY29kZS5FeHRlbnNpb248YW55PltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZGVzYyBvZiBleHRlbnNpb25JbmZvLmFsbC5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3QgPSAhbG9jYWwuaGFzKGRlc2MuaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IEV4dGVuc2lvbihleHRlbnNpb25TZXJ2aWNlLCBleHRlbnNpb24uaWRlbnRpZmllciwgZGVzYywgZXh0ZW5zaW9uS2luZCAvKiBUT0RPQGFsZXhkaW1hIFRISVMgSVMgV1JPTkcgKi8sIGlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3QpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZSgpIHtcblx0XHRcdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2V4dGVuc2lvbnNBbnknKSkge1xuXHRcdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChFdmVudC5hbnkoZXh0ZW5zaW9uSW5mby5taW5lLm9uRGlkQ2hhbmdlLCBleHRlbnNpb25JbmZvLmFsbC5vbkRpZENoYW5nZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRlbnNpb25JbmZvLm1pbmUub25EaWRDaGFuZ2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGxhbmd1YWdlc1xuXHRcdGNvbnN0IGxhbmd1YWdlczogdHlwZW9mIHZzY29kZS5sYW5ndWFnZXMgPSB7XG5cdFx0XHRjcmVhdGVEaWFnbm9zdGljQ29sbGVjdGlvbihuYW1lPzogc3RyaW5nKTogdnNjb2RlLkRpYWdub3N0aWNDb2xsZWN0aW9uIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REaWFnbm9zdGljcy5jcmVhdGVEaWFnbm9zdGljQ29sbGVjdGlvbihleHRlbnNpb24uaWRlbnRpZmllciwgbmFtZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlRGlhZ25vc3RpY3MoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RGlhZ25vc3RpY3Mub25EaWRDaGFuZ2VEaWFnbm9zdGljcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RGlhZ25vc3RpY3M6IChyZXNvdXJjZT86IHZzY29kZS5VcmkpID0+IHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHJldHVybiA8YW55PmV4dEhvc3REaWFnbm9zdGljcy5nZXREaWFnbm9zdGljcyhyZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGFuZ3VhZ2VzKCk6IFRoZW5hYmxlPHN0cmluZ1tdPiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VzLmdldExhbmd1YWdlcygpO1xuXHRcdFx0fSxcblx0XHRcdHNldFRleHREb2N1bWVudExhbmd1YWdlKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBUaGVuYWJsZTx2c2NvZGUuVGV4dERvY3VtZW50PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VzLmNoYW5nZUxhbmd1YWdlKGRvY3VtZW50LnVyaSwgbGFuZ3VhZ2VJZCk7XG5cdFx0XHR9LFxuXHRcdFx0bWF0Y2goc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCk6IG51bWJlciB7XG5cdFx0XHRcdGNvbnN0IGludGVyYWxTZWxlY3RvciA9IHR5cGVDb252ZXJ0ZXJzLkxhbmd1YWdlU2VsZWN0b3IuZnJvbShzZWxlY3Rvcik7XG5cdFx0XHRcdGxldCBub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0YXJnZXRzTm90ZWJvb2tzKGludGVyYWxTZWxlY3RvcikpIHtcblx0XHRcdFx0XHRub3RlYm9vayA9IGV4dEhvc3ROb3RlYm9vay5ub3RlYm9va0RvY3VtZW50cy5maW5kKHZhbHVlID0+IHZhbHVlLmFwaU5vdGVib29rLmdldENlbGxzKCkuZmluZChjID0+IGMuZG9jdW1lbnQgPT09IGRvY3VtZW50KSk/LmFwaU5vdGVib29rO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzY29yZShpbnRlcmFsU2VsZWN0b3IsIGRvY3VtZW50LnVyaSwgZG9jdW1lbnQubGFuZ3VhZ2VJZCwgdHJ1ZSwgbm90ZWJvb2s/LnVyaSwgbm90ZWJvb2s/Lm5vdGVib29rVHlwZSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDb2RlQWN0aW9uc1Byb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIG1ldGFkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsIG1ldGFkYXRhOiB2c2NvZGUuRG9jdW1lbnRQYXN0ZVByb3ZpZGVyTWV0YWRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIG1ldGFkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNvZGVMZW5zUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5EZWNsYXJhdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkltcGxlbWVudGF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJIb3ZlclByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Ib3ZlclByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCBleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJFdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCBleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJJbmxpbmVWYWx1ZXNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW5saW5lVmFsdWVzUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlcklubGluZVZhbHVlc1Byb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCBleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlck11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuUmVmZXJlbmNlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclJlbmFtZVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5SZW5hbWVQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTmV3U3ltYm9sTmFtZXNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuTmV3U3ltYm9sTmFtZXNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbmV3U3ltYm9sTmFtZXNQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihleHRlbnNpb24sIGNoZWNrU2VsZWN0b3Ioc2VsZWN0b3IpLCBwcm92aWRlciwgbWV0YWRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlciwgZmlyc3RUcmlnZ2VyQ2hhcmFjdGVyOiBzdHJpbmcsIC4uLm1vcmVUcmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIFtmaXJzdFRyaWdnZXJDaGFyYWN0ZXJdLmNvbmNhdChtb3JlVHJpZ2dlckNoYXJhY3RlcnMpKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLCBsZWdlbmQ6IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCBsZWdlbmQpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLCBsZWdlbmQ6IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGxlZ2VuZCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlciwgZmlyc3RJdGVtPzogc3RyaW5nIHwgdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlck1ldGFkYXRhLCAuLi5yZW1haW5pbmc6IHN0cmluZ1tdKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRpZiAodHlwZW9mIGZpcnN0SXRlbSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIGZpcnN0SXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyLCB0eXBlb2YgZmlyc3RJdGVtID09PSAndW5kZWZpbmVkJyA/IFtdIDogW2ZpcnN0SXRlbSwgLi4ucmVtYWluaW5nXSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyLCAuLi50cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIHRyaWdnZXJDaGFyYWN0ZXJzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlcklubGluZUNvbXBsZXRpb25JdGVtUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtUHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLmhhbmRsZURpZFNob3dDb21wbGV0aW9uSXRlbSkge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3ZpZGVyLmhhbmRsZURpZFBhcnRpYWxseUFjY2VwdENvbXBsZXRpb25JdGVtKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlcklubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIsIG1ldGFkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5vbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ29sb3JQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRDb2xvclByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJDb2xvclByb3ZpZGVyKGV4dGVuc2lvbiwgY2hlY2tTZWxlY3RvcihzZWxlY3RvciksIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Gb2xkaW5nUmFuZ2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihleHRlbnNpb24sIHNlbGVjdG9yLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDYWxsSGllcmFyY2h5UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNhbGxIaWVyYXJjaHlQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKGV4dGVuc2lvbiwgc2VsZWN0b3IsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclR5cGVIaWVyYXJjaHlQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuVHlwZUhpZXJhcmNoeVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMucmVnaXN0ZXJUeXBlSGllcmFyY2h5UHJvdmlkZXIoZXh0ZW5zaW9uLCBzZWxlY3RvciwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHNldExhbmd1YWdlQ29uZmlndXJhdGlvbjogKGxhbmd1YWdlOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IHZzY29kZS5MYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiB2c2NvZGUuRGlzcG9zYWJsZSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5zZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oZXh0ZW5zaW9uLCBsYW5ndWFnZSwgY29uZmlndXJhdGlvbik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0VG9rZW5JbmZvcm1hdGlvbkF0UG9zaXRpb24oZG9jOiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3M6IHZzY29kZS5Qb3NpdGlvbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0b2tlbkluZm9ybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VzLnRva2VuQXRQb3NpdGlvbihkb2MsIHBvcyk7XG5cdFx0XHR9LFxuXHRcdFx0Y29tcHV0ZUZ1bGxTeW50YXhIaWdobGlnaHRpbmcoc291cmNlOiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkb2N1bWVudFN5bnRheEhpZ2hsaWdodGluZycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlcy5jb21wdXRlRnVsbFN5bnRheEhpZ2hsaWdodGluZyhzb3VyY2UsIGxhbmd1YWdlSWQpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVN5bnRheEhpZ2hsaWdodGluZygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZG9jdW1lbnRTeW50YXhIaWdobGlnaHRpbmcnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZXMub25EaWRDaGFuZ2VTeW50YXhIaWdobGlnaHRpbmc7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLklubGF5SGludHNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKGV4dGVuc2lvbiwgc2VsZWN0b3IsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVMYW5ndWFnZVN0YXR1c0l0ZW0oaWQ6IHN0cmluZywgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yKTogdnNjb2RlLkxhbmd1YWdlU3RhdHVzSXRlbSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VzLmNyZWF0ZUxhbmd1YWdlU3RhdHVzSXRlbShleHRlbnNpb24sIGlkLCBzZWxlY3Rvcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEb2N1bWVudERyb3BFZGl0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyTWV0YWRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5yZWdpc3RlckRvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVyKGV4dGVuc2lvbiwgc2VsZWN0b3IsIHByb3ZpZGVyLCBtZXRhZGF0YSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogd2luZG93XG5cdFx0Y29uc3Qgd2luZG93OiB0eXBlb2YgdnNjb2RlLndpbmRvdyA9IHtcblx0XHRcdGdldCBhY3RpdmVUZXh0RWRpdG9yKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVkaXRvcnMuZ2V0QWN0aXZlVGV4dEVkaXRvcigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB2aXNpYmxlVGV4dEVkaXRvcnMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RWRpdG9ycy5nZXRWaXNpYmxlVGV4dEVkaXRvcnMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWN0aXZlVGVybWluYWwoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLmFjdGl2ZVRlcm1pbmFsO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZXJtaW5hbHMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLnRlcm1pbmFscztcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBzaG93VGV4dERvY3VtZW50KGRvY3VtZW50T3JVcmk6IHZzY29kZS5UZXh0RG9jdW1lbnQgfCB2c2NvZGUuVXJpLCBjb2x1bW5Pck9wdGlvbnM/OiB2c2NvZGUuVmlld0NvbHVtbiB8IHZzY29kZS5UZXh0RG9jdW1lbnRTaG93T3B0aW9ucywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZzY29kZS5UZXh0RWRpdG9yPiB7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkoZG9jdW1lbnRPclVyaSkgJiYgZG9jdW1lbnRPclVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlICYmICFkb2N1bWVudE9yVXJpLmF1dGhvcml0eSkge1xuXHRcdFx0XHRcdGV4dEhvc3RBcGlEZXByZWNhdGlvbi5yZXBvcnQoJ3dvcmtzcGFjZS5zaG93VGV4dERvY3VtZW50JywgZXh0ZW5zaW9uLCBgQSBVUkkgb2YgJ3ZzY29kZS1yZW1vdGUnIHNjaGVtZSByZXF1aXJlcyBhbiBhdXRob3JpdHkuYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZG9jdW1lbnQgPSBhd2FpdCAoVVJJLmlzVXJpKGRvY3VtZW50T3JVcmkpXG5cdFx0XHRcdFx0PyBQcm9taXNlLnJlc29sdmUod29ya3NwYWNlLm9wZW5UZXh0RG9jdW1lbnQoZG9jdW1lbnRPclVyaSkpXG5cdFx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoPHZzY29kZS5UZXh0RG9jdW1lbnQ+ZG9jdW1lbnRPclVyaSkpO1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0RWRpdG9ycy5zaG93VGV4dERvY3VtZW50KGRvY3VtZW50LCBjb2x1bW5Pck9wdGlvbnMsIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZShvcHRpb25zOiB2c2NvZGUuRGVjb3JhdGlvblJlbmRlck9wdGlvbnMpOiB2c2NvZGUuVGV4dEVkaXRvckRlY29yYXRpb25UeXBlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFZGl0b3JzLmNyZWF0ZVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZShleHRlbnNpb24sIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlVGV4dEVkaXRvcihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEVkaXRvcnMub25EaWRDaGFuZ2VBY3RpdmVUZXh0RWRpdG9yKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJsZVRleHRFZGl0b3JzKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEVkaXRvcnMub25EaWRDaGFuZ2VWaXNpYmxlVGV4dEVkaXRvcnMpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXh0RWRpdG9yU2VsZWN0aW9uKGxpc3RlbmVyOiAoZTogdnNjb2RlLlRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VFdmVudCkgPT4gYW55LCB0aGlzQXJncz86IGFueSwgZGlzcG9zYWJsZXM/OiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZVtdKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVRleHRFZGl0b3JTZWxlY3Rpb24pKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGV4dEVkaXRvck9wdGlvbnMobGlzdGVuZXI6IChlOiB2c2NvZGUuVGV4dEVkaXRvck9wdGlvbnNDaGFuZ2VFdmVudCkgPT4gYW55LCB0aGlzQXJncz86IGFueSwgZGlzcG9zYWJsZXM/OiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZVtdKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RWRpdG9ycy5vbkRpZENoYW5nZVRleHRFZGl0b3JPcHRpb25zKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRleHRFZGl0b3JWaXNpYmxlUmFuZ2VzKGxpc3RlbmVyOiAoZTogdnNjb2RlLlRleHRFZGl0b3JWaXNpYmxlUmFuZ2VzQ2hhbmdlRXZlbnQpID0+IGFueSwgdGhpc0FyZ3M/OiBhbnksIGRpc3Bvc2FibGVzPzogZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGVbXSkge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEVkaXRvcnMub25EaWRDaGFuZ2VUZXh0RWRpdG9yVmlzaWJsZVJhbmdlcykobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUZXh0RWRpdG9yVmlld0NvbHVtbihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEVkaXRvcnMub25EaWRDaGFuZ2VUZXh0RWRpdG9yVmlld0NvbHVtbikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEVkaXRvcnMub25EaWRDaGFuZ2VUZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2xvc2VUZXJtaW5hbChsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZENsb3NlVGVybWluYWwpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRPcGVuVGVybWluYWwobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXJtaW5hbFNlcnZpY2Uub25EaWRPcGVuVGVybWluYWwpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbChsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGVybWluYWxEaW1lbnNpb25zKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlcm1pbmFsRGltZW5zaW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZVRlcm1pbmFsRGltZW5zaW9ucykobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VUZXJtaW5hbFN0YXRlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkV3JpdGVUZXJtaW5hbERhdGEobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVybWluYWxEYXRhV3JpdGVFdmVudCcpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2VydmljZS5vbkRpZFdyaXRlVGVybWluYWxEYXRhKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRXhlY3V0ZVRlcm1pbmFsQ29tbWFuZChsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXJtaW5hbEV4ZWN1dGVDb21tYW5kRXZlbnQnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUZXJtaW5hbFNlcnZpY2Uub25EaWRFeGVjdXRlVGVybWluYWxDb21tYW5kKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVGVybWluYWxTaGVsbEludGVncmF0aW9uKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLm9uRGlkQ2hhbmdlVGVybWluYWxTaGVsbEludGVncmF0aW9uKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLm9uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRW5kVGVybWluYWxTaGVsbEV4ZWN1dGlvbihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi5vbkRpZEVuZFRlcm1pbmFsU2hlbGxFeGVjdXRpb24pKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN0YXRlKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdpbmRvdy5nZXRTdGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlV2luZG93U3RhdGUobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RXaW5kb3cub25EaWRDaGFuZ2VXaW5kb3dTdGF0ZSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93SW5mb3JtYXRpb25NZXNzYWdlKG1lc3NhZ2U6IHN0cmluZywgLi4ucmVzdDogQXJyYXk8dnNjb2RlLk1lc3NhZ2VPcHRpb25zIHwgc3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPikge1xuXHRcdFx0XHRyZXR1cm4gPFRoZW5hYmxlPGFueT4+ZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLnNob3dNZXNzYWdlKGV4dGVuc2lvbiwgU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgcmVzdFswXSwgPEFycmF5PHN0cmluZyB8IHZzY29kZS5NZXNzYWdlSXRlbT4+cmVzdC5zbGljZSgxKSk7XG5cdFx0XHR9LFxuXHRcdFx0c2hvd1dhcm5pbmdNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZywgLi4ucmVzdDogQXJyYXk8dnNjb2RlLk1lc3NhZ2VPcHRpb25zIHwgc3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPikge1xuXHRcdFx0XHRyZXR1cm4gPFRoZW5hYmxlPGFueT4+ZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLnNob3dNZXNzYWdlKGV4dGVuc2lvbiwgU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSwgcmVzdFswXSwgPEFycmF5PHN0cmluZyB8IHZzY29kZS5NZXNzYWdlSXRlbT4+cmVzdC5zbGljZSgxKSk7XG5cdFx0XHR9LFxuXHRcdFx0c2hvd0Vycm9yTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcsIC4uLnJlc3Q6IEFycmF5PHZzY29kZS5NZXNzYWdlT3B0aW9ucyB8IHN0cmluZyB8IHZzY29kZS5NZXNzYWdlSXRlbT4pIHtcblx0XHRcdFx0cmV0dXJuIDxUaGVuYWJsZTxhbnk+PmV4dEhvc3RNZXNzYWdlU2VydmljZS5zaG93TWVzc2FnZShleHRlbnNpb24sIFNldmVyaXR5LkVycm9yLCBtZXNzYWdlLCByZXN0WzBdLCA8QXJyYXk8c3RyaW5nIHwgdnNjb2RlLk1lc3NhZ2VJdGVtPj5yZXN0LnNsaWNlKDEpKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93UXVpY2tQaWNrKGl0ZW1zOiBhbnksIG9wdGlvbnM/OiB2c2NvZGUuUXVpY2tQaWNrT3B0aW9ucywgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFF1aWNrT3Blbi5zaG93UXVpY2tQaWNrKGV4dGVuc2lvbiwgaXRlbXMsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93V29ya3NwYWNlRm9sZGVyUGljayhvcHRpb25zPzogdnNjb2RlLldvcmtzcGFjZUZvbGRlclBpY2tPcHRpb25zKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tPcGVuLnNob3dXb3Jrc3BhY2VGb2xkZXJQaWNrKG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdHNob3dJbnB1dEJveChvcHRpb25zPzogdnNjb2RlLklucHV0Qm94T3B0aW9ucywgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RRdWlja09wZW4uc2hvd0lucHV0KG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93T3BlbkRpYWxvZyhvcHRpb25zKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGlhbG9ncy5zaG93T3BlbkRpYWxvZyhvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93U2F2ZURpYWxvZyhvcHRpb25zKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGlhbG9ncy5zaG93U2F2ZURpYWxvZyhvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVTdGF0dXNCYXJJdGVtKGFsaWdubWVudE9ySWQ/OiB2c2NvZGUuU3RhdHVzQmFyQWxpZ25tZW50IHwgc3RyaW5nLCBwcmlvcml0eU9yQWxpZ25tZW50PzogbnVtYmVyIHwgdnNjb2RlLlN0YXR1c0JhckFsaWdubWVudCwgcHJpb3JpdHlBcmc/OiBudW1iZXIpOiB2c2NvZGUuU3RhdHVzQmFySXRlbSB7XG5cdFx0XHRcdGxldCBpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgYWxpZ25tZW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBwcmlvcml0eTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGlmICh0eXBlb2YgYWxpZ25tZW50T3JJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRpZCA9IGFsaWdubWVudE9ySWQ7XG5cdFx0XHRcdFx0YWxpZ25tZW50ID0gcHJpb3JpdHlPckFsaWdubWVudDtcblx0XHRcdFx0XHRwcmlvcml0eSA9IHByaW9yaXR5QXJnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFsaWdubWVudCA9IGFsaWdubWVudE9ySWQ7XG5cdFx0XHRcdFx0cHJpb3JpdHkgPSBwcmlvcml0eU9yQWxpZ25tZW50O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTdGF0dXNCYXIuY3JlYXRlU3RhdHVzQmFyRW50cnkoZXh0ZW5zaW9uLCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eSk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0U3RhdHVzQmFyTWVzc2FnZSh0ZXh0OiBzdHJpbmcsIHRpbWVvdXRPclRoZW5hYmxlPzogbnVtYmVyIHwgVGhlbmFibGU8YW55Pik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTdGF0dXNCYXIuc2V0U3RhdHVzQmFyTWVzc2FnZSh0ZXh0LCB0aW1lb3V0T3JUaGVuYWJsZSk7XG5cdFx0XHR9LFxuXHRcdFx0d2l0aFNjbVByb2dyZXNzPFI+KHRhc2s6IChwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPG51bWJlcj4pID0+IFRoZW5hYmxlPFI+KSB7XG5cdFx0XHRcdGV4dEhvc3RBcGlEZXByZWNhdGlvbi5yZXBvcnQoJ3dpbmRvdy53aXRoU2NtUHJvZ3Jlc3MnLCBleHRlbnNpb24sXG5cdFx0XHRcdFx0YFVzZSAnd2l0aFByb2dyZXNzJyBpbnN0ZWFkLmApO1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0UHJvZ3Jlc3Mud2l0aFByb2dyZXNzKGV4dGVuc2lvbiwgeyBsb2NhdGlvbjogZXh0SG9zdFR5cGVzLlByb2dyZXNzTG9jYXRpb24uU291cmNlQ29udHJvbCB9LCAocHJvZ3Jlc3MsIHRva2VuKSA9PiB0YXNrKHsgcmVwb3J0KG46IG51bWJlcikgeyAvKm5vb3AqLyB9IH0pKTtcblx0XHRcdH0sXG5cdFx0XHR3aXRoUHJvZ3Jlc3M8Uj4ob3B0aW9uczogdnNjb2RlLlByb2dyZXNzT3B0aW9ucywgdGFzazogKHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8eyBtZXNzYWdlPzogc3RyaW5nOyB3b3JrZWQ/OiBudW1iZXIgfT4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPFI+KSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UHJvZ3Jlc3Mud2l0aFByb2dyZXNzKGV4dGVuc2lvbiwgb3B0aW9ucywgdGFzayk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlT3V0cHV0Q2hhbm5lbChuYW1lOiBzdHJpbmcsIG9wdGlvbnM6IHN0cmluZyB8IHsgbG9nOiB0cnVlIH0gfCB1bmRlZmluZWQpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE91dHB1dFNlcnZpY2UuY3JlYXRlT3V0cHV0Q2hhbm5lbChuYW1lLCBvcHRpb25zLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVdlYnZpZXdQYW5lbCh2aWV3VHlwZTogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBzaG93T3B0aW9uczogdnNjb2RlLlZpZXdDb2x1bW4gfCB7IHZpZXdDb2x1bW46IHZzY29kZS5WaWV3Q29sdW1uOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9LCBvcHRpb25zPzogdnNjb2RlLldlYnZpZXdQYW5lbE9wdGlvbnMgJiB2c2NvZGUuV2Vidmlld09wdGlvbnMpOiB2c2NvZGUuV2Vidmlld1BhbmVsIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXZWJ2aWV3UGFuZWxzLmNyZWF0ZVdlYnZpZXdQYW5lbChleHRlbnNpb24sIHZpZXdUeXBlLCB0aXRsZSwgc2hvd09wdGlvbnMsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVdlYnZpZXdUZXh0RWRpdG9ySW5zZXQoZWRpdG9yOiB2c2NvZGUuVGV4dEVkaXRvciwgbGluZTogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgb3B0aW9ucz86IHZzY29kZS5XZWJ2aWV3T3B0aW9ucyk6IHZzY29kZS5XZWJ2aWV3RWRpdG9ySW5zZXQge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlZGl0b3JJbnNldHMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFZGl0b3JJbnNldHMuY3JlYXRlV2Vidmlld0VkaXRvckluc2V0KGVkaXRvciwgbGluZSwgaGVpZ2h0LCBvcHRpb25zLCBleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVRlcm1pbmFsKG5hbWVPck9wdGlvbnM/OiB2c2NvZGUuVGVybWluYWxPcHRpb25zIHwgdnNjb2RlLkV4dGVuc2lvblRlcm1pbmFsT3B0aW9ucyB8IHN0cmluZywgc2hlbGxQYXRoPzogc3RyaW5nLCBzaGVsbEFyZ3M/OiByZWFkb25seSBzdHJpbmdbXSB8IHN0cmluZyk6IHZzY29kZS5UZXJtaW5hbCB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbmFtZU9yT3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRsZXQgb3B0aW9ucyA9IG5hbWVPck9wdGlvbnM7XG5cdFx0XHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXJtaW5hbFRpdGxlJykgJiYgJ3RpdGxlVGVtcGxhdGUnIGluIG5hbWVPck9wdGlvbnMgJiYgbmFtZU9yT3B0aW9ucy50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFske2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfV0gXFxgdGl0bGVUZW1wbGF0ZVxcYCB3YXMgcHJvdmlkZWQgdG8gd2luZG93LmNyZWF0ZVRlcm1pbmFsIGJ1dCBpcyBpZ25vcmVkIGJlY2F1c2UgdGhlIFxcYHRlcm1pbmFsVGl0bGVcXGAgcHJvcG9zZWQgQVBJIGlzIG5vdCBlbmFibGVkLmApO1xuXHRcdFx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ubmFtZU9yT3B0aW9ucywgdGl0bGVUZW1wbGF0ZTogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICgncHR5JyBpbiBvcHRpb25zKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5jcmVhdGVFeHRlbnNpb25UZXJtaW5hbChvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWxGcm9tT3B0aW9ucyhvcHRpb25zLCBnZXRUZXJtaW5hbEludGVybmFsT3B0aW9ucyhleHRlbnNpb24sIG9wdGlvbnMpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbChuYW1lT3JPcHRpb25zLCBzaGVsbFBhdGgsIHNoZWxsQXJncyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXJtaW5hbExpbmtQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5yZWdpc3RlckxpbmtQcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXJtaW5hbFByb2ZpbGVQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5yZWdpc3RlclByb2ZpbGVQcm92aWRlcihleHRlbnNpb24sIGlkLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyPHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25JdGVtPiwgLi4udHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRlcm1pbmFsU2VydmljZS5yZWdpc3RlclRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgcHJvdmlkZXIsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGVybWluYWxRdWlja0ZpeFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxRdWlja0ZpeFByb3ZpZGVyKGlkLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVHJlZURhdGFQcm92aWRlcih2aWV3SWQ6IHN0cmluZywgdHJlZURhdGFQcm92aWRlcjogdnNjb2RlLlRyZWVEYXRhUHJvdmlkZXI8YW55Pik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUcmVlVmlld3MucmVnaXN0ZXJUcmVlRGF0YVByb3ZpZGVyKHZpZXdJZCwgdHJlZURhdGFQcm92aWRlciwgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVUcmVlVmlldyh2aWV3SWQ6IHN0cmluZywgb3B0aW9uczogeyB0cmVlRGF0YVByb3ZpZGVyOiB2c2NvZGUuVHJlZURhdGFQcm92aWRlcjxhbnk+IH0pOiB2c2NvZGUuVHJlZVZpZXc8YW55PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VHJlZVZpZXdzLmNyZWF0ZVRyZWVWaWV3KHZpZXdJZCwgb3B0aW9ucywgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlcldlYnZpZXdQYW5lbFNlcmlhbGl6ZXI6ICh2aWV3VHlwZTogc3RyaW5nLCBzZXJpYWxpemVyOiB2c2NvZGUuV2Vidmlld1BhbmVsU2VyaWFsaXplcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdlYnZpZXdQYW5lbHMucmVnaXN0ZXJXZWJ2aWV3UGFuZWxTZXJpYWxpemVyKGV4dGVuc2lvbiwgdmlld1R5cGUsIHNlcmlhbGl6ZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ3VzdG9tRWRpdG9yUHJvdmlkZXI6ICh2aWV3VHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlciB8IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyLCBvcHRpb25zOiB7IHdlYnZpZXdPcHRpb25zPzogdnNjb2RlLldlYnZpZXdQYW5lbE9wdGlvbnM7IHN1cHBvcnRzTXVsdGlwbGVFZGl0b3JzUGVyRG9jdW1lbnQ/OiBib29sZWFuIH0gPSB7fSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEN1c3RvbUVkaXRvcnMucmVnaXN0ZXJDdXN0b21FZGl0b3JQcm92aWRlcihleHRlbnNpb24sIHZpZXdUeXBlLCBwcm92aWRlciwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJGaWxlRGVjb3JhdGlvblByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuRmlsZURlY29yYXRpb25Qcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlY29yYXRpb25zLnJlZ2lzdGVyRmlsZURlY29yYXRpb25Qcm92aWRlcihwcm92aWRlciwgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclVyaUhhbmRsZXIoaGFuZGxlcjogdnNjb2RlLlVyaUhhbmRsZXIpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RVcmxzLnJlZ2lzdGVyVXJpSGFuZGxlcihleHRlbnNpb24sIGhhbmRsZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVF1aWNrUGljazxUIGV4dGVuZHMgdnNjb2RlLlF1aWNrUGlja0l0ZW0+KCk6IHZzY29kZS5RdWlja1BpY2s8VD4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFF1aWNrT3Blbi5jcmVhdGVRdWlja1BpY2soZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVJbnB1dEJveCgpOiB2c2NvZGUuSW5wdXRCb3gge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFF1aWNrT3Blbi5jcmVhdGVJbnB1dEJveChleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVDb2xvclRoZW1lKCk6IHZzY29kZS5Db2xvclRoZW1lIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUaGVtaW5nLmFjdGl2ZUNvbG9yVGhlbWU7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVDb2xvclRoZW1lKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGhlbWluZy5vbkRpZENoYW5nZUFjdGl2ZUNvbG9yVGhlbWUpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJXZWJ2aWV3Vmlld1Byb3ZpZGVyKHZpZXdJZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLldlYnZpZXdWaWV3UHJvdmlkZXIsIG9wdGlvbnM/OiB7XG5cdFx0XHRcdHdlYnZpZXdPcHRpb25zPzoge1xuXHRcdFx0XHRcdHJldGFpbkNvbnRleHRXaGVuSGlkZGVuPzogYm9vbGVhbjtcblx0XHRcdFx0fTtcblx0XHRcdH0pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXZWJ2aWV3Vmlld3MucmVnaXN0ZXJXZWJ2aWV3Vmlld1Byb3ZpZGVyKGV4dGVuc2lvbiwgdmlld0lkLCBwcm92aWRlciwgb3B0aW9ucz8ud2Vidmlld09wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVOb3RlYm9va0VkaXRvcigpOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rLmFjdGl2ZU5vdGVib29rRWRpdG9yO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlTm90ZWJvb2tFZGl0b3IobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2sub25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvcikobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHZpc2libGVOb3RlYm9va0VkaXRvcnMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2sudmlzaWJsZU5vdGVib29rRWRpdG9ycztcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VWaXNpYmxlTm90ZWJvb2tFZGl0b3JzKCkge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE5vdGVib29rLm9uRGlkQ2hhbmdlVmlzaWJsZU5vdGVib29rRWRpdG9ycyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VOb3RlYm9va0VkaXRvclNlbGVjdGlvbihsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9va0VkaXRvcnMub25EaWRDaGFuZ2VOb3RlYm9va0VkaXRvclNlbGVjdGlvbikobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VOb3RlYm9va0VkaXRvclZpc2libGVSYW5nZXMobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2tFZGl0b3JzLm9uRGlkQ2hhbmdlTm90ZWJvb2tFZGl0b3JWaXNpYmxlUmFuZ2VzKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93Tm90ZWJvb2tEb2N1bWVudChkb2N1bWVudCwgb3B0aW9ucz8pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9vay5zaG93Tm90ZWJvb2tEb2N1bWVudChkb2N1bWVudCwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJFeHRlcm5hbFVyaU9wZW5lcihpZDogc3RyaW5nLCBvcGVuZXI6IHZzY29kZS5FeHRlcm5hbFVyaU9wZW5lciwgbWV0YWRhdGE6IHZzY29kZS5FeHRlcm5hbFVyaU9wZW5lck1ldGFkYXRhKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2V4dGVybmFsVXJpT3BlbmVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VXJpT3BlbmVycy5yZWdpc3RlckV4dGVybmFsVXJpT3BlbmVyKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCwgb3BlbmVyLCBtZXRhZGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJQcm9maWxlQ29udGVudEhhbmRsZXIoaWQ6IHN0cmluZywgaGFuZGxlcjogdnNjb2RlLlByb2ZpbGVDb250ZW50SGFuZGxlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdwcm9maWxlQ29udGVudEhhbmRsZXJzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UHJvZmlsZUNvbnRlbnRIYW5kbGVycy5yZWdpc3RlclByb2ZpbGVDb250ZW50SGFuZGxlcihleHRlbnNpb24sIGlkLCBoYW5kbGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclF1aWNrRGlmZlByb3ZpZGVyKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcXVpY2tEaWZmUHJvdmlkZXI6IHZzY29kZS5RdWlja0RpZmZQcm92aWRlciwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcm9vdFVyaT86IHZzY29kZS5VcmkpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3F1aWNrRGlmZlByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0UXVpY2tEaWZmLnJlZ2lzdGVyUXVpY2tEaWZmUHJvdmlkZXIoZXh0ZW5zaW9uLCBjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcXVpY2tEaWZmUHJvdmlkZXIsIGlkLCBsYWJlbCwgcm9vdFVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlU291cmNlQ29udHJvbERpZmZJbmZvcm1hdGlvbih1cmk6IHZzY29kZS5VcmkpOiB2c2NvZGUuU291cmNlQ29udHJvbERpZmZJbmZvcm1hdGlvblByb3ZpZGVyIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFF1aWNrRGlmZi5jcmVhdGVTb3VyY2VDb250cm9sRGlmZkluZm9ybWF0aW9uKHVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGxpbmtQcmVzZW50YXRpb25SdWxlcygpOiByZWFkb25seSB2c2NvZGUuTGlua1ByZXNlbnRhdGlvblJ1bGVbXSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xpbmtQcmVzZW50YXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REYXRhQ2hhbm5lbHMubGlua1ByZXNlbnRhdGlvblJ1bGVzO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcygpOiB2c2NvZGUuRXZlbnQ8dm9pZD4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdsaW5rUHJlc2VudGF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGF0YUNoYW5uZWxzLm9uRGlkQ2hhbmdlTGlua1ByZXNlbnRhdGlvblJ1bGVzO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKGlkOiBzdHJpbmcsIHJlc291cmNlOiB2c2NvZGUuVXJpKTogdnNjb2RlLkxpbmtQcmVzZW50YXRpb25XYXRjaGVyIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGlua1ByZXNlbnRhdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERhdGFDaGFubmVscy5jcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihleHRlbnNpb24sIGlkLCByZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5MaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xpbmtQcmVzZW50YXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REYXRhQ2hhbm5lbHMucmVnaXN0ZXJMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBpZCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUFnZW50RWRpdG9yQ29tbWVudHModXJpOiB2c2NvZGUuVXJpKTogdnNjb2RlLkFnZW50RWRpdG9yQ29tbWVudHNQcm92aWRlciB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FnZW50RWRpdG9yQ29tbWVudHMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBZ2VudEVkaXRvckNvbW1lbnRzLmNyZWF0ZUFnZW50RWRpdG9yQ29tbWVudHModXJpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGFiR3JvdXBzKCk6IHZzY29kZS5UYWJHcm91cHMge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyU2hhcmVQcm92aWRlcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuU2hhcmVQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnc2hhcmVQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFNoYXJlLnJlZ2lzdGVyU2hhcmVQcm92aWRlcihjaGVja1NlbGVjdG9yKHNlbGVjdG9yKSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBuYXRpdmVIYW5kbGUoKTogVWludDhBcnJheSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ25hdGl2ZVdpbmRvd0hhbmRsZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdpbmRvdy5uYXRpdmVIYW5kbGU7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlQ2hhdFN0YXR1c0l0ZW06IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRTdGF0dXNJdGVtJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdFN0YXR1cy5jcmVhdGVDaGF0U3RhdHVzSXRlbShleHRlbnNpb24sIGlkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIuYWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlOiAobGlzdGVuZXJzLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VBY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2UpKGxpc3RlbmVycywgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYnJvd3NlclRhYnMoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RCcm93c2Vycy5icm93c2VyVGFicztcblx0XHRcdH0sXG5cdFx0XHRvbkRpZE9wZW5Ccm93c2VyVGFiKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RCcm93c2Vycy5vbkRpZE9wZW5Ccm93c2VyVGFiKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2xvc2VCcm93c2VyVGFiKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RCcm93c2Vycy5vbkRpZENsb3NlQnJvd3NlclRhYikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYWN0aXZlQnJvd3NlclRhYigpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYnJvd3NlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEJyb3dzZXJzLmFjdGl2ZUJyb3dzZXJUYWI7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKGxpc3RlbmVyLCB0aGlzQXJnPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Jyb3dzZXInKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RCcm93c2Vycy5vbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYnJvd3NlcicpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEJyb3dzZXJzLm9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9wZW5Ccm93c2VyVGFiKHVybDogc3RyaW5nLCBvcHRpb25zPzogdnNjb2RlLkJyb3dzZXJUYWJTaG93T3B0aW9ucykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdicm93c2VyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0QnJvd3NlcnMub3BlbkJyb3dzZXJUYWIodXJsLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogd29ya3NwYWNlXG5cblx0XHRjb25zdCB3b3Jrc3BhY2U6IHR5cGVvZiB2c2NvZGUud29ya3NwYWNlID0ge1xuXHRcdFx0Z2V0IHJvb3RQYXRoKCkge1xuXHRcdFx0XHRleHRIb3N0QXBpRGVwcmVjYXRpb24ucmVwb3J0KCd3b3Jrc3BhY2Uucm9vdFBhdGgnLCBleHRlbnNpb24sXG5cdFx0XHRcdFx0YFBsZWFzZSB1c2UgJ3dvcmtzcGFjZS53b3Jrc3BhY2VGb2xkZXJzJyBpbnN0ZWFkLiBNb3JlIGRldGFpbHM6IGh0dHBzOi8vYWthLm1zL3ZzY29kZS1lbGltaW5hdGluZy1yb290cGF0aGApO1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLmdldFBhdGgoKTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgcm9vdFBhdGgodmFsdWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IGVycm9ycy5SZWFkb25seUVycm9yKCdyb290UGF0aCcpO1xuXHRcdFx0fSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB3b3Jrc3BhY2VGb2xkZXJzKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXJzKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG5hbWUoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLm5hbWU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IG5hbWUodmFsdWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IGVycm9ycy5SZWFkb25seUVycm9yKCduYW1lJyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHdvcmtzcGFjZUZpbGUoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZUZpbGU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHdvcmtzcGFjZUZpbGUodmFsdWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IGVycm9ycy5SZWFkb25seUVycm9yKCd3b3Jrc3BhY2VGaWxlJyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGlzQWdlbnRTZXNzaW9uc1dvcmtzcGFjZSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYWdlbnRTZXNzaW9uc1dvcmtzcGFjZScpO1xuXHRcdFx0XHRyZXR1cm4gISFpbml0RGF0YS5lbnZpcm9ubWVudC5pc1Nlc3Npb25zV2luZG93O1xuXHRcdFx0fSxcblx0XHRcdHVwZGF0ZVdvcmtzcGFjZUZvbGRlcnM6IChpbmRleCwgZGVsZXRlQ291bnQsIC4uLndvcmtzcGFjZUZvbGRlcnNUb0FkZCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbiwgaW5kZXgsIGRlbGV0ZUNvdW50IHx8IDAsIC4uLndvcmtzcGFjZUZvbGRlcnNUb0FkZCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBmdW5jdGlvbiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0V29ya3NwYWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRhc1JlbGF0aXZlUGF0aDogKHBhdGhPclVyaSwgaW5jbHVkZVdvcmtzcGFjZT8pID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZ2V0UmVsYXRpdmVQYXRoKHBhdGhPclVyaSwgaW5jbHVkZVdvcmtzcGFjZSk7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZEZpbGVzOiAoaW5jbHVkZSwgZXhjbHVkZSwgbWF4UmVzdWx0cz8sIHRva2VuPykgPT4ge1xuXHRcdFx0XHQvLyBOb3RlLCB1bmRlZmluZWQvbnVsbCBoYXZlIGRpZmZlcmVudCBtZWFuaW5ncyBvbiBcImV4Y2x1ZGVcIlxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5maW5kRmlsZXMoaW5jbHVkZSwgZXhjbHVkZSwgbWF4UmVzdWx0cywgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRmaW5kRmlsZXMyOiAoZmlsZVBhdHRlcm46IHZzY29kZS5HbG9iUGF0dGVybltdLCBvcHRpb25zPzogdnNjb2RlLkZpbmRGaWxlczJPcHRpb25zLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFRoZW5hYmxlPHZzY29kZS5VcmlbXT4gPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdmaW5kRmlsZXMyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLmZpbmRGaWxlczIoZmlsZVBhdHRlcm4sIG9wdGlvbnMsIGV4dGVuc2lvbi5pZGVudGlmaWVyLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZFRleHRJbkZpbGVzOiAocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnNPckNhbGxiYWNrOiB2c2NvZGUuRmluZFRleHRJbkZpbGVzT3B0aW9ucyB8ICgocmVzdWx0OiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdCkgPT4gdm9pZCksIGNhbGxiYWNrT3JUb2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiB8ICgocmVzdWx0OiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdCkgPT4gdm9pZCksIHRva2VuPzogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2ZpbmRUZXh0SW5GaWxlcycpO1xuXHRcdFx0XHRsZXQgb3B0aW9uczogdnNjb2RlLkZpbmRUZXh0SW5GaWxlc09wdGlvbnM7XG5cdFx0XHRcdGxldCBjYWxsYmFjazogKHJlc3VsdDogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHQpID0+IHZvaWQ7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBvcHRpb25zT3JDYWxsYmFjayA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRvcHRpb25zID0gb3B0aW9uc09yQ2FsbGJhY2s7XG5cdFx0XHRcdFx0Y2FsbGJhY2sgPSBjYWxsYmFja09yVG9rZW4gYXMgKHJlc3VsdDogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHQpID0+IHZvaWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3B0aW9ucyA9IHt9O1xuXHRcdFx0XHRcdGNhbGxiYWNrID0gb3B0aW9uc09yQ2FsbGJhY2s7XG5cdFx0XHRcdFx0dG9rZW4gPSBjYWxsYmFja09yVG9rZW4gYXMgdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UuZmluZFRleHRJbkZpbGVzKHF1ZXJ5LCBvcHRpb25zIHx8IHt9LCBjYWxsYmFjaywgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRmaW5kVGV4dEluRmlsZXMyOiAocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnkyLCBvcHRpb25zPzogdnNjb2RlLkZpbmRUZXh0SW5GaWxlc09wdGlvbnMyLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5GaW5kVGV4dEluRmlsZXNSZXNwb25zZSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2ZpbmRUZXh0SW5GaWxlczInKTtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dFNlYXJjaFByb3ZpZGVyMicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5maW5kVGV4dEluRmlsZXMyKHF1ZXJ5LCBvcHRpb25zLCBleHRlbnNpb24uaWRlbnRpZmllciwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGdldFRleHREaWZmKG9yaWdpbmFsRG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIG1vZGlmaWVkRG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIG9wdGlvbnM/OiB2c2NvZGUuVGV4dERpZmZPcHRpb25zLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5UZXh0RGlmZlJlc3BvbnNlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZG9jdW1lbnREaWZmJyk7XG5cdFx0XHRcdGNvbnN0IHByb3h5ID0gcnBjUHJvdG9jb2wuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERvY3VtZW50RGlmZik7XG5cdFx0XHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBlcnJvcnMuQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y2hhbmdlczogQXN5bmNJdGVyYWJsZU9iamVjdC5FTVBUWSxcblx0XHRcdFx0XHRcdGNvbXBsZXRlOiBQcm9taXNlLnJlamVjdChlcnJvciksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gcHJveHkuJGNvbXB1dGVEb2N1bWVudERpZmYoXG5cdFx0XHRcdFx0b3JpZ2luYWxEb2N1bWVudC51cmksXG5cdFx0XHRcdFx0bW9kaWZpZWREb2N1bWVudC51cmksXG5cdFx0XHRcdFx0b3B0aW9ucz8uaWdub3JlVHJpbVdoaXRlc3BhY2UgPz8gZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9ucz8ubWF4Q29tcHV0YXRpb25UaW1lTXMgPz8gNTAwMCxcblx0XHRcdFx0XHRvcHRpb25zPy5jb21wdXRlTW92ZXMgPz8gZmFsc2UsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IGRpZmZQcm9taXNlID0gdG9rZW4gPyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocmVzdWx0UHJvbWlzZSwgdG9rZW4pIDogcmVzdWx0UHJvbWlzZTtcblx0XHRcdFx0Y29uc3QgbWFwcGVkUHJvbWlzZSA9IGRpZmZQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgY29tcHV0ZSBkaWZmLiBNYWtlIHN1cmUgYm90aCBkb2N1bWVudHMgYXJlIGF2YWlsYWJsZS4nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgbWFwQ2hhbmdlID0gKGM6IElEb2N1bWVudERpZmZMaW5lQ2hhbmdlRHRvKSA9PiAoe1xuXHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGMub3JpZ2luYWxSYW5nZSksXG5cdFx0XHRcdFx0bW9kaWZpZWRSYW5nZTogdHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8oYy5tb2RpZmllZFJhbmdlKSxcblx0XHRcdFx0XHRpbm5lckNoYW5nZXM6IGMuaW5uZXJDaGFuZ2VzPy5tYXAoaWMgPT4gKHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGljLm9yaWdpbmFsUmFuZ2UpLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRSYW5nZTogdHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8oaWMubW9kaWZpZWRSYW5nZSksXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBUT0RPQEFQSSBjdXJyZW50bHkgdGhlIGRpZmYgaXMgY29tcHV0ZWQgaW4gb25lIHNob3QgYW5kIGFsbCBjaGFuZ2VzIGFyZSBlbWl0dGVkIGF0IG9uY2UuXG5cdFx0XHRcdC8vIEluIHRoZSBmdXR1cmUsIHdlIG1heSB3YW50IHRvIHN0cmVhbSBjaGFuZ2VzIGluY3JlbWVudGFsbHkgYXMgdGhleSBhcmUgY29tcHV0ZWRcblx0XHRcdFx0Ly8gKGUuZy4gYnkgaGF2aW5nIHRoZSB3b3JrZXIgeWllbGQgcGFydGlhbCByZXN1bHRzKS5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjaGFuZ2VzOiBuZXcgQXN5bmNJdGVyYWJsZU9iamVjdDx2c2NvZGUuVGV4dERpZmZDaGFuZ2U+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwcGVkUHJvbWlzZTtcblx0XHRcdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkocmVzdWx0LmNoYW5nZXMubWFwKG1hcENoYW5nZSkpO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiBtYXBwZWRQcm9taXNlLnRoZW4ocmVzdWx0ID0+ICh7XG5cdFx0XHRcdFx0XHRpZGVudGljYWw6IHJlc3VsdC5pZGVudGljYWwsXG5cdFx0XHRcdFx0XHRtYXlCZUluY29tcGxldGU6IHJlc3VsdC5xdWl0RWFybHksXG5cdFx0XHRcdFx0XHRtb3ZlczogcmVzdWx0Lm1vdmVzLm1hcChtID0+ICh7XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKG0ub3JpZ2luYWxSYW5nZSksXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKG0ubW9kaWZpZWRSYW5nZSksXG5cdFx0XHRcdFx0XHRcdGNoYW5nZXM6IG0uY2hhbmdlcy5tYXAobWFwQ2hhbmdlKSxcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0c2F2ZTogKHVyaSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5zYXZlKHVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0c2F2ZUFzOiAodXJpKSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnNhdmVBcyh1cmkpO1xuXHRcdFx0fSxcblx0XHRcdHNhdmVBbGw6IChpbmNsdWRlVW50aXRsZWQ/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnNhdmVBbGwoaW5jbHVkZVVudGl0bGVkKTtcblx0XHRcdH0sXG5cdFx0XHRhcHBseUVkaXQoZWRpdDogdnNjb2RlLldvcmtzcGFjZUVkaXQsIG1ldGFkYXRhPzogdnNjb2RlLldvcmtzcGFjZUVkaXRNZXRhZGF0YSk6IFRoZW5hYmxlPGJvb2xlYW4+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RCdWxrRWRpdHMuYXBwbHlXb3Jrc3BhY2VFZGl0KGVkaXQsIGV4dGVuc2lvbiwgbWV0YWRhdGEpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUZpbGVTeXN0ZW1XYXRjaGVyOiAocGF0dGVybiwgb3B0aW9uc09ySWdub3JlQ3JlYXRlLCBpZ25vcmVDaGFuZ2U/LCBpZ25vcmVEZWxldGU/KTogdnNjb2RlLkZpbGVTeXN0ZW1XYXRjaGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogRmlsZVN5c3RlbVdhdGNoZXJDcmVhdGVPcHRpb25zID0ge1xuXHRcdFx0XHRcdGlnbm9yZUNyZWF0ZUV2ZW50czogQm9vbGVhbihvcHRpb25zT3JJZ25vcmVDcmVhdGUpLFxuXHRcdFx0XHRcdGlnbm9yZUNoYW5nZUV2ZW50czogQm9vbGVhbihpZ25vcmVDaGFuZ2UpLFxuXHRcdFx0XHRcdGlnbm9yZURlbGV0ZUV2ZW50czogQm9vbGVhbihpZ25vcmVEZWxldGUpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJldHVybiBleHRIb3N0RmlsZVN5c3RlbUV2ZW50LmNyZWF0ZUZpbGVTeXN0ZW1XYXRjaGVyKGV4dEhvc3RXb3Jrc3BhY2UsIGNvbmZpZ1Byb3ZpZGVyLCBleHRIb3N0RmlsZVN5c3RlbUluZm8sIGV4dGVuc2lvbiwgcGF0dGVybiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRleHREb2N1bWVudHMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RG9jdW1lbnRzLmdldEFsbERvY3VtZW50RGF0YSgpLm1hcChkYXRhID0+IGRhdGEuZG9jdW1lbnQpO1xuXHRcdFx0fSxcblx0XHRcdHNldCB0ZXh0RG9jdW1lbnRzKHZhbHVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBlcnJvcnMuUmVhZG9ubHlFcnJvcigndGV4dERvY3VtZW50cycpO1xuXHRcdFx0fSxcblx0XHRcdG9wZW5UZXh0RG9jdW1lbnQodXJpT3JGaWxlTmFtZU9yT3B0aW9ucz86IHZzY29kZS5VcmkgfCBzdHJpbmcgfCB7IGxhbmd1YWdlPzogc3RyaW5nOyBjb250ZW50Pzogc3RyaW5nOyBlbmNvZGluZz86IHN0cmluZyB9LCBvcHRpb25zPzogeyBlbmNvZGluZz86IHN0cmluZyB9KSB7XG5cdFx0XHRcdGxldCB1cmlQcm9taXNlOiBUaGVuYWJsZTxVUkk+O1xuXG5cdFx0XHRcdG9wdGlvbnMgPSAob3B0aW9ucyA/PyB1cmlPckZpbGVOYW1lT3JPcHRpb25zKSBhcyAoeyBsYW5ndWFnZT86IHN0cmluZzsgY29udGVudD86IHN0cmluZzsgZW5jb2Rpbmc/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiB1cmlPckZpbGVOYW1lT3JPcHRpb25zID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHVyaVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoVVJJLmZpbGUodXJpT3JGaWxlTmFtZU9yT3B0aW9ucykpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaSh1cmlPckZpbGVOYW1lT3JPcHRpb25zKSkge1xuXHRcdFx0XHRcdHVyaVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUodXJpT3JGaWxlTmFtZU9yT3B0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIW9wdGlvbnMgfHwgdHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0dXJpUHJvbWlzZSA9IGV4dEhvc3REb2N1bWVudHMuY3JlYXRlRG9jdW1lbnREYXRhKG9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignaWxsZWdhbCBhcmd1bWVudCAtIHVyaU9yRmlsZU5hbWVPck9wdGlvbnMnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1cmlQcm9taXNlLnRoZW4odXJpID0+IHtcblx0XHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS50cmFjZShgb3BlblRleHREb2N1bWVudCBmcm9tICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXJ9YCk7XG5cdFx0XHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlICYmICF1cmkuYXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0XHRleHRIb3N0QXBpRGVwcmVjYXRpb24ucmVwb3J0KCd3b3Jrc3BhY2Uub3BlblRleHREb2N1bWVudCcsIGV4dGVuc2lvbiwgYEEgVVJJIG9mICd2c2NvZGUtcmVtb3RlJyBzY2hlbWUgcmVxdWlyZXMgYW4gYXV0aG9yaXR5LmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdERvY3VtZW50cy5lbnN1cmVEb2N1bWVudERhdGEodXJpLCBvcHRpb25zKS50aGVuKGRvY3VtZW50RGF0YSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZG9jdW1lbnREYXRhLmRvY3VtZW50O1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZE9wZW5UZXh0RG9jdW1lbnQ6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REb2N1bWVudHMub25EaWRBZGREb2N1bWVudCkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDbG9zZVRleHREb2N1bWVudDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERvY3VtZW50cy5vbkRpZFJlbW92ZURvY3VtZW50KShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRleHREb2N1bWVudDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dERvY3VtZW50Q2hhbmdlUmVhc29uJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERvY3VtZW50cy5vbkRpZENoYW5nZURvY3VtZW50V2l0aFJlYXNvbikobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REb2N1bWVudHMub25EaWRDaGFuZ2VEb2N1bWVudCkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTYXZlVGV4dERvY3VtZW50OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RG9jdW1lbnRzLm9uRGlkU2F2ZURvY3VtZW50KShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbldpbGxTYXZlVGV4dERvY3VtZW50OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBub3RlYm9va0RvY3VtZW50cygpOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudFtdIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9vay5ub3RlYm9va0RvY3VtZW50cy5tYXAoZCA9PiBkLmFwaU5vdGVib29rKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBvcGVuTm90ZWJvb2tEb2N1bWVudCh1cmlPclR5cGU/OiBVUkkgfCBzdHJpbmcsIGNvbnRlbnQ/OiB2c2NvZGUuTm90ZWJvb2tEYXRhKSB7XG5cdFx0XHRcdGxldCB1cmk6IFVSSTtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaSh1cmlPclR5cGUpKSB7XG5cdFx0XHRcdFx0dXJpID0gdXJpT3JUeXBlO1xuXHRcdFx0XHRcdGF3YWl0IGV4dEhvc3ROb3RlYm9vay5vcGVuTm90ZWJvb2tEb2N1bWVudCh1cmlPclR5cGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB1cmlPclR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dXJpID0gVVJJLnJldml2ZShhd2FpdCBleHRIb3N0Tm90ZWJvb2suY3JlYXRlTm90ZWJvb2tEb2N1bWVudCh7IHZpZXdUeXBlOiB1cmlPclR5cGUsIGNvbnRlbnQgfSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQodXJpKS5hcGlOb3RlYm9vaztcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFNhdmVOb3RlYm9va0RvY3VtZW50KGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkU2F2ZU5vdGVib29rRG9jdW1lbnQpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbldpbGxTYXZlTm90ZWJvb2tEb2N1bWVudChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9va0RvY3VtZW50U2F2ZVBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVOb3RlYm9va0RvY3VtZW50RXZlbnQoZXh0ZW5zaW9uKSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudCgpIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3ROb3RlYm9vay5vbkRpZE9wZW5Ob3RlYm9va0RvY3VtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDbG9zZU5vdGVib29rRG9jdW1lbnQoKSB7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0Tm90ZWJvb2sub25EaWRDbG9zZU5vdGVib29rRG9jdW1lbnQpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKHZpZXdUeXBlOiBzdHJpbmcsIHNlcmlhbGl6ZXI6IHZzY29kZS5Ob3RlYm9va1NlcmlhbGl6ZXIsIG9wdGlvbnM/OiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRPcHRpb25zLCByZWdpc3RyYXRpb24/OiB2c2NvZGUuTm90ZWJvb2tSZWdpc3RyYXRpb25EYXRhKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2sucmVnaXN0ZXJOb3RlYm9va1NlcmlhbGl6ZXIoZXh0ZW5zaW9uLCB2aWV3VHlwZSwgc2VyaWFsaXplciwgb3B0aW9ucywgaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tMaXZlU2hhcmUnKSA/IHJlZ2lzdHJhdGlvbiA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiAobGlzdGVuZXI6IChfOiBhbnkpID0+IGFueSwgdGhpc0FyZ3M/OiBhbnksIGRpc3Bvc2FibGVzPzogZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGVbXSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoY29uZmlnUHJvdmlkZXIub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb25maWd1cmF0aW9uKHNlY3Rpb24/OiBzdHJpbmcsIHNjb3BlPzogdnNjb2RlLkNvbmZpZ3VyYXRpb25TY29wZSB8IG51bGwpOiB2c2NvZGUuV29ya3NwYWNlQ29uZmlndXJhdGlvbiB7XG5cdFx0XHRcdHNjb3BlID0gYXJndW1lbnRzLmxlbmd0aCA9PT0gMSA/IHVuZGVmaW5lZCA6IHNjb3BlO1xuXHRcdFx0XHRyZXR1cm4gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbihzZWN0aW9uLCBzY29wZSwgZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRleHREb2N1bWVudENvbnRlbnRQcm92aWRlcihzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UZXh0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcnMucmVnaXN0ZXJUZXh0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUYXNrUHJvdmlkZXI6ICh0eXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGFza1Byb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGV4dEhvc3RBcGlEZXByZWNhdGlvbi5yZXBvcnQoJ3dpbmRvdy5yZWdpc3RlclRhc2tQcm92aWRlcicsIGV4dGVuc2lvbixcblx0XHRcdFx0XHRgVXNlIHRoZSBjb3JyZXNwb25kaW5nIGZ1bmN0aW9uIG9uIHRoZSAndGFza3MnIG5hbWVzcGFjZSBpbnN0ZWFkYCk7XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUYXNrLnJlZ2lzdGVyVGFza1Byb3ZpZGVyKGV4dGVuc2lvbiwgdHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRmlsZVN5c3RlbVByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIsIG9wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdFx0XHRleHRIb3N0RmlsZVN5c3RlbS5yZWdpc3RlckZpbGVTeXN0ZW1Qcm92aWRlcihleHRlbnNpb24sIHNjaGVtZSwgcHJvdmlkZXIsIG9wdGlvbnMpLFxuXHRcdFx0XHRcdGV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0uYWRkRmlsZVN5c3RlbVByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIsIG9wdGlvbnMpXG5cdFx0XHRcdCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGZzKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS52YWx1ZTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckZpbGVTZWFyY2hQcm92aWRlcjogKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkZpbGVTZWFyY2hQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdmaWxlU2VhcmNoUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTZWFyY2gucmVnaXN0ZXJGaWxlU2VhcmNoUHJvdmlkZXJPbGQoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXh0U2VhcmNoUHJvdmlkZXI6IChzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UZXh0U2VhcmNoUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGV4dFNlYXJjaFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U2VhcmNoLnJlZ2lzdGVyVGV4dFNlYXJjaFByb3ZpZGVyT2xkKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQUlUZXh0U2VhcmNoUHJvdmlkZXI6IChzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5BSVRleHRTZWFyY2hQcm92aWRlcikgPT4ge1xuXHRcdFx0XHQvLyB0aGVyZSBhcmUgc29tZSBkZXBlbmRlbmNpZXMgb24gdGV4dFNlYXJjaFByb3ZpZGVyLCBzbyB3ZSBuZWVkIHRvIGNoZWNrIGZvciBib3RoXG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2FpVGV4dFNlYXJjaFByb3ZpZGVyJyk7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RleHRTZWFyY2hQcm92aWRlcjInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTZWFyY2gucmVnaXN0ZXJBSVRleHRTZWFyY2hQcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckZpbGVTZWFyY2hQcm92aWRlcjI6IChzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5GaWxlU2VhcmNoUHJvdmlkZXIyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2ZpbGVTZWFyY2hQcm92aWRlcjInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTZWFyY2gucmVnaXN0ZXJGaWxlU2VhcmNoUHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUZXh0U2VhcmNoUHJvdmlkZXIyOiAoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGV4dFNlYXJjaFByb3ZpZGVyMikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXh0U2VhcmNoUHJvdmlkZXIyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U2VhcmNoLnJlZ2lzdGVyVGV4dFNlYXJjaFByb3ZpZGVyKHNjaGVtZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXI6IChhdXRob3JpdHlQcmVmaXg6IHN0cmluZywgcmVzb2x2ZXI6IHZzY29kZS5SZW1vdGVBdXRob3JpdHlSZXNvbHZlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdyZXNvbHZlcnMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvblNlcnZpY2UucmVnaXN0ZXJSZW1vdGVBdXRob3JpdHlSZXNvbHZlcihhdXRob3JpdHlQcmVmaXgsIHJlc29sdmVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclJlc291cmNlTGFiZWxGb3JtYXR0ZXI6IChmb3JtYXR0ZXI6IHZzY29kZS5SZXNvdXJjZUxhYmVsRm9ybWF0dGVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Jlc29sdmVycycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhYmVsU2VydmljZS4kcmVnaXN0ZXJSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKGZvcm1hdHRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UmVtb3RlRXhlY1NlcnZlcjogKGF1dGhvcml0eTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Jlc29sdmVycycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uU2VydmljZS5nZXRSZW1vdGVFeGVjU2VydmVyKGF1dGhvcml0eSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDcmVhdGVGaWxlczogKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEZpbGVTeXN0ZW1FdmVudC5vbkRpZENyZWF0ZUZpbGUpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWREZWxldGVGaWxlczogKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEZpbGVTeXN0ZW1FdmVudC5vbkRpZERlbGV0ZUZpbGUpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW5hbWVGaWxlczogKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdEZpbGVTeXN0ZW1FdmVudC5vbkRpZFJlbmFtZUZpbGUpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsQ3JlYXRlRmlsZXM6IChsaXN0ZW5lcjogKGU6IHZzY29kZS5GaWxlV2lsbENyZWF0ZUV2ZW50KSA9PiBhbnksIHRoaXNBcmc/OiB1bmtub3duLCBkaXNwb3NhYmxlcz86IHZzY29kZS5EaXNwb3NhYmxlW10pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQuZ2V0T25XaWxsQ3JlYXRlRmlsZUV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsRGVsZXRlRmlsZXM6IChsaXN0ZW5lcjogKGU6IHZzY29kZS5GaWxlV2lsbERlbGV0ZUV2ZW50KSA9PiBhbnksIHRoaXNBcmc/OiB1bmtub3duLCBkaXNwb3NhYmxlcz86IHZzY29kZS5EaXNwb3NhYmxlW10pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQuZ2V0T25XaWxsRGVsZXRlRmlsZUV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25XaWxsUmVuYW1lRmlsZXM6IChsaXN0ZW5lcjogKGU6IHZzY29kZS5GaWxlV2lsbFJlbmFtZUV2ZW50KSA9PiBhbnksIHRoaXNBcmc/OiB1bmtub3duLCBkaXNwb3NhYmxlcz86IHZzY29kZS5EaXNwb3NhYmxlW10pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RGaWxlU3lzdGVtRXZlbnQuZ2V0T25XaWxsUmVuYW1lRmlsZUV2ZW50KGV4dGVuc2lvbikpKGxpc3RlbmVyLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b3BlblR1bm5lbDogKGZvcndhcmQ6IHZzY29kZS5UdW5uZWxPcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3R1bm5lbHMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUdW5uZWxTZXJ2aWNlLm9wZW5UdW5uZWwoZXh0ZW5zaW9uLCBmb3J3YXJkKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBvcGVuIHR1bm5lbCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0dW5uZWxzKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0dW5uZWxzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VHVubmVsU2VydmljZS5nZXRUdW5uZWxzKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUdW5uZWxzOiAobGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHVubmVscycpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFR1bm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VUdW5uZWxzKShsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyUG9ydEF0dHJpYnV0ZXNQcm92aWRlcjogKHBvcnRTZWxlY3RvcjogdnNjb2RlLlBvcnRBdHRyaWJ1dGVzU2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuUG9ydEF0dHJpYnV0ZXNQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdwb3J0c0F0dHJpYnV0ZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUdW5uZWxTZXJ2aWNlLnJlZ2lzdGVyUG9ydHNBdHRyaWJ1dGVzUHJvdmlkZXIocG9ydFNlbGVjdG9yLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUdW5uZWxQcm92aWRlcjogKHR1bm5lbFByb3ZpZGVyOiB2c2NvZGUuVHVubmVsUHJvdmlkZXIsIGluZm9ybWF0aW9uOiB2c2NvZGUuVHVubmVsSW5mb3JtYXRpb24pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHVubmVsRmFjdG9yeScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR1bm5lbFNlcnZpY2UucmVnaXN0ZXJUdW5uZWxQcm92aWRlcih0dW5uZWxQcm92aWRlciwgaW5mb3JtYXRpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVGltZWxpbmVQcm92aWRlcjogKHNjaGVtZTogc3RyaW5nIHwgc3RyaW5nW10sIHByb3ZpZGVyOiB2c2NvZGUuVGltZWxpbmVQcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0aW1lbGluZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRpbWVsaW5lLnJlZ2lzdGVyVGltZWxpbmVQcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyLCBleHRlbnNpb24uaWRlbnRpZmllciwgZXh0SG9zdENvbW1hbmRzLmNvbnZlcnRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGlzVHJ1c3RlZCgpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UudHJ1c3RlZDtcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0UmVzb3VyY2VUcnVzdDogKG9wdGlvbnM6IHZzY29kZS5SZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnd29ya3NwYWNlVHJ1c3QnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UucmVxdWVzdFJlc291cmNlVHJ1c3Qob3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWVzdFdvcmtzcGFjZVRydXN0OiAob3B0aW9ucz86IHZzY29kZS5Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RPcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3dvcmtzcGFjZVRydXN0Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdChvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRpc1Jlc291cmNlVHJ1c3RlZDogKHJlc291cmNlOiB2c2NvZGUuVXJpKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3dvcmtzcGFjZVRydXN0Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLmlzUmVzb3VyY2VUcnVzdGVkKHJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0ZWRGb2xkZXJzOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3dvcmtzcGFjZVRydXN0Jyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0V29ya3NwYWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlVHJ1c3RlZEZvbGRlcnMpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkR3JhbnRXb3Jrc3BhY2VUcnVzdDogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFdvcmtzcGFjZS5vbkRpZEdyYW50V29ya3NwYWNlVHJ1c3QpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyOiAoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5yZWdpc3RlckVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcihzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRvbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFdvcmtzcGFjZS5nZXRPbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5RXZlbnQoZXh0ZW5zaW9uKSkobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDYW5vbmljYWxVcmlQcm92aWRlcjogKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkNhbm9uaWNhbFVyaVByb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2Nhbm9uaWNhbFVyaVByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0V29ya3NwYWNlLnJlZ2lzdGVyQ2Fub25pY2FsVXJpUHJvdmlkZXIoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q2Fub25pY2FsVXJpOiAodXJpOiB2c2NvZGUuVXJpLCBvcHRpb25zOiB2c2NvZGUuQ2Fub25pY2FsVXJpUmVxdWVzdE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2Fub25pY2FsVXJpUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RXb3Jrc3BhY2UucHJvdmlkZUNhbm9uaWNhbFVyaSh1cmksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRkZWNvZGUoY29udGVudDogVWludDhBcnJheSwgb3B0aW9ucz86IHsgdXJpPzogdnNjb2RlLlVyaTsgZW5jb2Rpbmc/OiBzdHJpbmcgfSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5kZWNvZGUoY29udGVudCwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0ZW5jb2RlKGNvbnRlbnQ6IHN0cmluZywgb3B0aW9ucz86IHsgdXJpPzogdnNjb2RlLlVyaTsgZW5jb2Rpbmc/OiBzdHJpbmcgfSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFdvcmtzcGFjZS5lbmNvZGUoY29udGVudCwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IHNjbVxuXHRcdGNvbnN0IHNjbTogdHlwZW9mIHZzY29kZS5zY20gPSB7XG5cdFx0XHRnZXQgaW5wdXRCb3goKSB7XG5cdFx0XHRcdGV4dEhvc3RBcGlEZXByZWNhdGlvbi5yZXBvcnQoJ3NjbS5pbnB1dEJveCcsIGV4dGVuc2lvbixcblx0XHRcdFx0XHRgVXNlICdTb3VyY2VDb250cm9sLmlucHV0Qm94JyBpbnN0ZWFkYCk7XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RTQ00uZ2V0TGFzdElucHV0Qm94KGV4dGVuc2lvbikhOyAvLyBTdHJpY3QgbnVsbCBvdmVycmlkZSAtIERlcHJlY2F0ZWQgYXBpXG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlU291cmNlQ29udHJvbChpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByb290VXJpPzogdnNjb2RlLlVyaSwgaWNvblBhdGg/OiB2c2NvZGUuSWNvblBhdGgsIGlzSGlkZGVuPzogYm9vbGVhbiwgcGFyZW50PzogdnNjb2RlLlNvdXJjZUNvbnRyb2wpOiB2c2NvZGUuU291cmNlQ29udHJvbCB7XG5cdFx0XHRcdGlmIChpY29uUGF0aCB8fCBpc0hpZGRlbiB8fCBwYXJlbnQpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdzY21Qcm92aWRlck9wdGlvbnMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFNDTS5jcmVhdGVTb3VyY2VDb250cm9sKGV4dGVuc2lvbiwgaWQsIGxhYmVsLCByb290VXJpLCBpY29uUGF0aCwgaXNIaWRkZW4sIHBhcmVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogY29tbWVudHNcblx0XHRjb25zdCBjb21tZW50czogdHlwZW9mIHZzY29kZS5jb21tZW50cyA9IHtcblx0XHRcdGNyZWF0ZUNvbW1lbnRDb250cm9sbGVyKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb21tZW50LmNyZWF0ZUNvbW1lbnRDb250cm9sbGVyKGV4dGVuc2lvbiwgaWQsIGxhYmVsKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBkZWJ1Z1xuXHRcdGNvbnN0IGRlYnVnOiB0eXBlb2YgdnNjb2RlLmRlYnVnID0ge1xuXHRcdFx0Z2V0IGFjdGl2ZURlYnVnU2Vzc2lvbigpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2UuYWN0aXZlRGVidWdTZXNzaW9uO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVEZWJ1Z0NvbnNvbGUoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmFjdGl2ZURlYnVnQ29uc29sZTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYnJlYWtwb2ludHMoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmJyZWFrcG9pbnRzO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVTdGFja0l0ZW0oKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmFjdGl2ZVN0YWNrSXRlbTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVyKGlkLCBwcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdkZWJ1Z1Zpc3VhbGl6YXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2UucmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcihleHRlbnNpb24sIGlkLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlUHJvdmlkZXIoaWQsIHByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2RlYnVnVmlzdWFsaXphdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5yZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblRyZWUoZXh0ZW5zaW9uLCBpZCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24obGlzdGVuZXIsIHRoaXNBcmc/LCBkaXNwb3NhYmxlcz8pIHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3REZWJ1Z1NlcnZpY2Uub25EaWRTdGFydERlYnVnU2Vzc2lvbikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERlYnVnU2VydmljZS5vbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbihsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERlYnVnU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbikobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlY2VpdmVEZWJ1Z1Nlc3Npb25DdXN0b21FdmVudChsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERlYnVnU2VydmljZS5vbkRpZFJlY2VpdmVEZWJ1Z1Nlc3Npb25DdXN0b21FdmVudCkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUJyZWFrcG9pbnRzKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERlYnVnU2VydmljZS5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbShsaXN0ZW5lciwgdGhpc0FyZz8sIGRpc3Bvc2FibGVzPykge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdERlYnVnU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbSkobGlzdGVuZXIsIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnVHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyLCB0cmlnZ2VyS2luZD86IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIoZGVidWdUeXBlLCBwcm92aWRlciwgdHJpZ2dlcktpbmQgfHwgRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZC5Jbml0aWFsKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGRlYnVnVHlwZTogc3RyaW5nLCBmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2UucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShleHRlbnNpb24sIGRlYnVnVHlwZSwgZmFjdG9yeSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeShkZWJ1Z1R5cGU6IHN0cmluZywgZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXJGYWN0b3J5KSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyRGVidWdBZGFwdGVyVHJhY2tlckZhY3RvcnkoZGVidWdUeXBlLCBmYWN0b3J5KTtcblx0XHRcdH0sXG5cdFx0XHRzdGFydERlYnVnZ2luZyhmb2xkZXI6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIG5hbWVPckNvbmZpZzogc3RyaW5nIHwgdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvbiwgcGFyZW50U2Vzc2lvbk9yT3B0aW9ucz86IHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB2c2NvZGUuRGVidWdTZXNzaW9uT3B0aW9ucykge1xuXHRcdFx0XHRpZiAoIXBhcmVudFNlc3Npb25Pck9wdGlvbnMgfHwgKHR5cGVvZiBwYXJlbnRTZXNzaW9uT3JPcHRpb25zID09PSAnb2JqZWN0JyAmJiAnY29uZmlndXJhdGlvbicgaW4gcGFyZW50U2Vzc2lvbk9yT3B0aW9ucykpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdERlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhmb2xkZXIsIG5hbWVPckNvbmZpZywgeyBwYXJlbnRTZXNzaW9uOiBwYXJlbnRTZXNzaW9uT3JPcHRpb25zIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKGZvbGRlciwgbmFtZU9yQ29uZmlnLCBwYXJlbnRTZXNzaW9uT3JPcHRpb25zIHx8IHt9KTtcblx0XHRcdH0sXG5cdFx0XHRzdG9wRGVidWdnaW5nKHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnN0b3BEZWJ1Z2dpbmcoc2Vzc2lvbik7XG5cdFx0XHR9LFxuXHRcdFx0YWRkQnJlYWtwb2ludHMoYnJlYWtwb2ludHM6IHJlYWRvbmx5IHZzY29kZS5CcmVha3BvaW50W10pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3REZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHMoYnJlYWtwb2ludHMpO1xuXHRcdFx0fSxcblx0XHRcdHJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzOiByZWFkb25seSB2c2NvZGUuQnJlYWtwb2ludFtdKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzKTtcblx0XHRcdH0sXG5cdFx0XHRhc0RlYnVnU291cmNlVXJpKHNvdXJjZTogdnNjb2RlLkRlYnVnUHJvdG9jb2xTb3VyY2UsIHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKTogdnNjb2RlLlVyaSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RGVidWdTZXJ2aWNlLmFzRGVidWdTb3VyY2VVcmkoc291cmNlLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgdGFza3M6IHR5cGVvZiB2c2NvZGUudGFza3MgPSB7XG5cdFx0XHRyZWdpc3RlclRhc2tQcm92aWRlcjogKHR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UYXNrUHJvdmlkZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUYXNrLnJlZ2lzdGVyVGFza1Byb3ZpZGVyKGV4dGVuc2lvbiwgdHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGZldGNoVGFza3M6IChmaWx0ZXI/OiB2c2NvZGUuVGFza0ZpbHRlcik6IFRoZW5hYmxlPHZzY29kZS5UYXNrW10+ID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUYXNrLmZldGNoVGFza3MoZmlsdGVyKTtcblx0XHRcdH0sXG5cdFx0XHRleGVjdXRlVGFzazogKHRhc2s6IHZzY29kZS5UYXNrKTogVGhlbmFibGU8dnNjb2RlLlRhc2tFeGVjdXRpb24+ID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUYXNrLmV4ZWN1dGVUYXNrKGV4dGVuc2lvbiwgdGFzayk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRhc2tFeGVjdXRpb25zKCk6IHZzY29kZS5UYXNrRXhlY3V0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdFRhc2sudGFza0V4ZWN1dGlvbnM7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTdGFydFRhc2s6IChsaXN0ZW5lcjogKGU6IHZzY29kZS5UYXNrU3RhcnRFdmVudCkgPT4gYW55LCB0aGlzQXJncz86IGFueSwgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZWRMaXN0ZW5lciA9IChldmVudDogdnNjb2RlLlRhc2tTdGFydEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0YXNrRXhlY3V0aW9uVGVybWluYWwnKSkge1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50Py5leGVjdXRpb24/LnRlcm1pbmFsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0ZXZlbnQuZXhlY3V0aW9uLnRlcm1pbmFsID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBldmVudFdpdGhFeGVjdXRpb24gPSB7XG5cdFx0XHRcdFx0XHQuLi5ldmVudCxcblx0XHRcdFx0XHRcdGV4ZWN1dGlvbjogZXZlbnQuZXhlY3V0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gbGlzdGVuZXIuY2FsbCh0aGlzQXJncywgZXZlbnRXaXRoRXhlY3V0aW9uKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUYXNrLm9uRGlkU3RhcnRUYXNrKSh3cmFwcGVkTGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRFbmRUYXNrOiAobGlzdGVuZXJzLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRhc2sub25EaWRFbmRUYXNrKShsaXN0ZW5lcnMsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTdGFydFRhc2tQcm9jZXNzOiAobGlzdGVuZXJzLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdFRhc2sub25EaWRTdGFydFRhc2tQcm9jZXNzKShsaXN0ZW5lcnMsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRFbmRUYXNrUHJvY2VzczogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RUYXNrLm9uRGlkRW5kVGFza1Byb2Nlc3MpKGxpc3RlbmVycywgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFN0YXJ0VGFza1Byb2JsZW1NYXRjaGVyczogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGFza1Byb2JsZW1NYXRjaGVyU3RhdHVzJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGFzay5vbkRpZFN0YXJ0VGFza1Byb2JsZW1NYXRjaGVycykobGlzdGVuZXJzLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVyczogKGxpc3RlbmVycywgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndGFza1Byb2JsZW1NYXRjaGVyU3RhdHVzJyk7XG5cdFx0XHRcdHJldHVybiBfYXNFeHRlbnNpb25FdmVudChleHRIb3N0VGFzay5vbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnMpKGxpc3RlbmVycywgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBub3RlYm9va1xuXHRcdGNvbnN0IG5vdGVib29rczogdHlwZW9mIHZzY29kZS5ub3RlYm9va3MgPSB7XG5cdFx0XHRjcmVhdGVOb3RlYm9va0NvbnRyb2xsZXIoaWQ6IHN0cmluZywgbm90ZWJvb2tUeXBlOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGhhbmRsZXI/LCByZW5kZXJlclNjcmlwdHM/OiB2c2NvZGUuTm90ZWJvb2tSZW5kZXJlclNjcmlwdFtdKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Tm90ZWJvb2tLZXJuZWxzLmNyZWF0ZU5vdGVib29rQ29udHJvbGxlcihleHRlbnNpb24sIGlkLCBub3RlYm9va1R5cGUsIGxhYmVsLCBoYW5kbGVyLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdub3RlYm9va01lc3NhZ2luZycpID8gcmVuZGVyZXJTY3JpcHRzIDogdW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlck5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcjogKG5vdGVib29rVHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rLnJlZ2lzdGVyTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyKGV4dGVuc2lvbiwgbm90ZWJvb2tUeXBlLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlUmVuZGVyZXJNZXNzYWdpbmcocmVuZGVyZXJJZCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rUmVuZGVyZXJzLmNyZWF0ZVJlbmRlcmVyTWVzc2FnaW5nKGV4dGVuc2lvbiwgcmVuZGVyZXJJZCk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzayhub3RlYm9va1R5cGU6IHN0cmluZykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdub3RlYm9va0tlcm5lbFNvdXJjZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdE5vdGVib29rS2VybmVscy5jcmVhdGVOb3RlYm9va0NvbnRyb2xsZXJEZXRlY3Rpb25UYXNrKGV4dGVuc2lvbiwgbm90ZWJvb2tUeXBlKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlcktlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKG5vdGVib29rVHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tLZXJuZWxTb3VyY2UnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3ROb3RlYm9va0tlcm5lbHMucmVnaXN0ZXJLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcihleHRlbnNpb24sIG5vdGVib29rVHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBsMTBuXG5cdFx0Y29uc3QgbDEwbjogdHlwZW9mIHZzY29kZS5sMTBuID0ge1xuXHRcdFx0dCguLi5wYXJhbXM6IFttZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IEFycmF5PHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4+XSB8IFttZXNzYWdlOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIGFueT5dIHwgW3sgbWVzc2FnZTogc3RyaW5nOyBhcmdzPzogQXJyYXk8c3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4gfCBSZWNvcmQ8c3RyaW5nLCBhbnk+OyBjb21tZW50OiBzdHJpbmcgfCBzdHJpbmdbXSB9XSk6IHN0cmluZyB7XG5cdFx0XHRcdGlmICh0eXBlb2YgcGFyYW1zWzBdID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHBhcmFtcy5zaGlmdCgpIGFzIHN0cmluZztcblxuXHRcdFx0XHRcdC8vIFdlIGhhdmUgZWl0aGVyIHJlc3QgYXJncyB3aGljaCBhcmUgQXJyYXk8c3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4gb3IgYW4gYXJyYXkgd2l0aCBhIHNpbmdsZSBSZWNvcmQ8c3RyaW5nLCBhbnk+LlxuXHRcdFx0XHRcdC8vIFRoaXMgZW5zdXJlcyB3ZSBnZXQgYSBSZWNvcmQ8c3RyaW5nIHwgbnVtYmVyLCBhbnk+IHdoaWNoIHdpbGwgYmUgZm9ybWF0dGVkIGNvcnJlY3RseS5cblx0XHRcdFx0XHRjb25zdCBhcmdzRm9ybWF0dGVkID0gIXBhcmFtcyB8fCB0eXBlb2YgcGFyYW1zWzBdICE9PSAnb2JqZWN0JyA/IHBhcmFtcyA6IHBhcmFtc1swXTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdExvY2FsaXphdGlvbi5nZXRNZXNzYWdlKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCB7IG1lc3NhZ2U6IGtleSwgYXJnczogYXJnc0Zvcm1hdHRlZCBhcyBSZWNvcmQ8c3RyaW5nIHwgbnVtYmVyLCBhbnk+IHwgdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMb2NhbGl6YXRpb24uZ2V0TWVzc2FnZShleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgcGFyYW1zWzBdKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYnVuZGxlKCkge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExvY2FsaXphdGlvbi5nZXRCdW5kbGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB1cmkoKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TG9jYWxpemF0aW9uLmdldEJ1bmRsZVVyaShleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIG5hbWVzcGFjZTogaW50ZXJhY3RpdmVcblx0XHRjb25zdCBpbnRlcmFjdGl2ZTogdHlwZW9mIHZzY29kZS5pbnRlcmFjdGl2ZSA9IHtcblx0XHRcdHRyYW5zZmVyQWN0aXZlQ2hhdCh0b1dvcmtzcGFjZTogdnNjb2RlLlVyaSk6IFRoZW5hYmxlPHZvaWQ+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW50ZXJhY3RpdmUnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi50cmFuc2ZlckFjdGl2ZUNoYXQodG9Xb3Jrc3BhY2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGFpXG5cdFx0Y29uc3QgYWk6IHR5cGVvZiB2c2NvZGUuYWkgPSB7XG5cdFx0XHRnZXRSZWxhdGVkSW5mb3JtYXRpb24ocXVlcnk6IHN0cmluZywgdHlwZXM6IHZzY29kZS5SZWxhdGVkSW5mb3JtYXRpb25UeXBlW10pOiBUaGVuYWJsZTx2c2NvZGUuUmVsYXRlZEluZm9ybWF0aW9uUmVzdWx0W10+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYWlSZWxhdGVkSW5mb3JtYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBaVJlbGF0ZWRJbmZvcm1hdGlvbi5nZXRSZWxhdGVkSW5mb3JtYXRpb24oZXh0ZW5zaW9uLCBxdWVyeSwgdHlwZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXIodHlwZTogdnNjb2RlLlJlbGF0ZWRJbmZvcm1hdGlvblR5cGUsIHByb3ZpZGVyOiB2c2NvZGUuUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYWlSZWxhdGVkSW5mb3JtYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RBaVJlbGF0ZWRJbmZvcm1hdGlvbi5yZWdpc3RlclJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgdHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyRW1iZWRkaW5nVmVjdG9yUHJvdmlkZXIobW9kZWw6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5FbWJlZGRpbmdWZWN0b3JQcm92aWRlcikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdhaVJlbGF0ZWRJbmZvcm1hdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEFpRW1iZWRkaW5nVmVjdG9yLnJlZ2lzdGVyRW1iZWRkaW5nVmVjdG9yUHJvdmlkZXIoZXh0ZW5zaW9uLCBtb2RlbCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyU2V0dGluZ3NTZWFyY2hQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlNldHRpbmdzU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnYWlTZXR0aW5nc1NlYXJjaCcpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEFpU2V0dGluZ3NTZWFyY2gucmVnaXN0ZXJTZXR0aW5nc1NlYXJjaFByb3ZpZGVyKGV4dGVuc2lvbiwgcHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IGNoYXRyZWdpc3Rlck1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlclxuXHRcdGNvbnN0IGNoYXQ6IHR5cGVvZiB2c2NvZGUuY2hhdCA9IHtcblx0XHRcdHJlZ2lzdGVyTWFwcGVkRWRpdHNQcm92aWRlcihfc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBfcHJvdmlkZXI6IHZzY29kZS5NYXBwZWRFZGl0c1Byb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21hcHBlZEVkaXRzUHJvdmlkZXInKTtcblx0XHRcdFx0Ly8gbm8gbG9uZ2VyIHN1cHBvcnRlZFxuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJNYXBwZWRFZGl0c1Byb3ZpZGVyMihwcm92aWRlcjogdnNjb2RlLk1hcHBlZEVkaXRzUHJvdmlkZXIyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21hcHBlZEVkaXRzUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDb2RlTWFwcGVyLnJlZ2lzdGVyTWFwcGVkRWRpdHNQcm92aWRlcihleHRlbnNpb24sIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVDaGF0UGFydGljaXBhbnQoaWQ6IHN0cmluZywgaGFuZGxlcjogdnNjb2RlLkNoYXRFeHRlbmRlZFJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIuY3JlYXRlQ2hhdEFnZW50KGV4dGVuc2lvbiwgaWQsIGhhbmRsZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUR5bmFtaWNDaGF0UGFydGljaXBhbnQoaWQ6IHN0cmluZywgZHluYW1pY1Byb3BzOiB2c2NvZGUuRHluYW1pY0NoYXRQYXJ0aWNpcGFudFByb3BzLCBoYW5kbGVyOiB2c2NvZGUuQ2hhdEV4dGVuZGVkUmVxdWVzdEhhbmRsZXIpOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLmNyZWF0ZUR5bmFtaWNDaGF0QWdlbnQoZXh0ZW5zaW9uLCBpZCwgZHluYW1pY1Byb3BzLCBoYW5kbGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWREaXNwb3NlQ2hhdFNlc3Npb246IChsaXN0ZW5lcnMsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZERpc3Bvc2VDaGF0U2Vzc2lvbikobGlzdGVuZXJzLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHVwZGF0ZVF1b3RhczogKHF1b3RhczogdnNjb2RlLkNoYXRRdW90YVNuYXBzaG90cykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdGV4dEhvc3RDaGF0UXVvdGEudXBkYXRlUXVvdGFzKHF1b3Rhcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcjogKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbVByb3ZpZGVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJyk7XG5cdFx0XHRcdGV4dEhvc3RBcGlEZXByZWNhdGlvbi5yZXBvcnQoJ2NoYXQucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcicsIGV4dGVuc2lvbiwgYFBsZWFzZSBtaWdyYXRlIHRvIHRoZSBuZXcgY2hhdCBzZXNzaW9uIGNvbnRyb2xsZXIgQVBJYCwge1xuXHRcdFx0XHRcdHVzYWdlSWQ6IGNoYXRTZXNzaW9uVHlwZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0U2Vzc2lvbnMucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcihleHRlbnNpb24sIGNoYXRTZXNzaW9uVHlwZSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6IChjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcmVmcmVzaEhhbmRsZXI6ICh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSA9PiBUaGVuYWJsZTx2b2lkPikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0U2Vzc2lvbnNQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRTZXNzaW9ucy5jcmVhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGV4dGVuc2lvbiwgY2hhdFNlc3Npb25UeXBlLCByZWZyZXNoSGFuZGxlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlciwgY2hhdFBhcnRpY2lwYW50OiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50LCBjYXBhYmlsaXRpZXM/OiB2c2NvZGUuQ2hhdFNlc3Npb25DYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFNlc3Npb25zUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0U2Vzc2lvbnMucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihleHRlbnNpb24sIHNjaGVtZSwgY2hhdFBhcnRpY2lwYW50LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRPdXRwdXRSZW5kZXJlcjogKHZpZXdUeXBlOiBzdHJpbmcsIHJlbmRlcmVyOiB2c2NvZGUuQ2hhdE91dHB1dFJlbmRlcmVyKSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRPdXRwdXRSZW5kZXJlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRPdXRwdXRSZW5kZXJlci5yZWdpc3RlckNoYXRPdXRwdXRSZW5kZXJlcihleHRlbnNpb24sIHZpZXdUeXBlLCByZW5kZXJlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJDaGF0V29ya3NwYWNlQ29udGV4dFByb3ZpZGVyKGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdENvbnRleHRQcm92aWRlcicpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRDb250ZXh0LnJlZ2lzdGVyQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlcihgJHtleHRlbnNpb24uaWR9LSR7aWR9YCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdEF0dGFjaENvbnRleHRQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkNoYXRBdHRhY2hDb250ZXh0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRDb250ZXh0UHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0Q29udGV4dC5yZWdpc3RlckNoYXRBdHRhY2hDb250ZXh0UHJvdmlkZXIoYCR7ZXh0ZW5zaW9uLmlkfS0ke2lkfWAsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckNoYXRUYWJDb250ZXh0UHJvdmlkZXIoc2VsZWN0b3I6IHZzY29kZS5UYWJTZWxlY3RvciwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DaGF0VGFiQ29udGV4dFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0Q29udGV4dFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdENvbnRleHQucmVnaXN0ZXJDaGF0VGFiQ29udGV4dFByb3ZpZGVyKHNlbGVjdG9yLCBgJHtleHRlbnNpb24uaWR9LSR7aWR9YCwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdEV4cGxpY2l0Q29udGV4dFByb3ZpZGVyKF9pZDogc3RyaW5nLCBfcHJvdmlkZXI6IHZzY29kZS5DaGF0QXR0YWNoQ29udGV4dFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0Q29udGV4dFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdFJlc291cmNlQ29udGV4dFByb3ZpZGVyKF9zZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIF9pZDogc3RyaW5nLCBfcHJvdmlkZXI6IHZzY29kZS5DaGF0VGFiQ29udGV4dFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0Q29udGV4dFByb3ZpZGVyJyk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ3VzdG9tQWdlbnRQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRDdXN0b21BZ2VudFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmFnZW50LCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJJbnN0cnVjdGlvbnNQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRJbnN0cnVjdGlvbnNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRQcm9tcHRGaWxlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUucHJvbXB0LCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJTa2lsbFByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNraWxsUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3Rlckhvb2tQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXRIb29rUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuaG9vaywgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0RGVidWdMb2dQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdERlYnVnJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdERlYnVnLnJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVjZWl2ZUNoYXREZWJ1Z0V2ZW50OiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXREZWJ1ZycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXREZWJ1Zy5vbkRpZEFkZENvcmVFdmVudChsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRDdXN0b21BZ2VudHModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5wcm92aWRlQ3VzdG9tQWdlbnRzKHRva2VuKSBhcyBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEN1c3RvbUFnZW50W10+O1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldEluc3RydWN0aW9ucyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnByb3ZpZGVJbnN0cnVjdGlvbnModG9rZW4pIGFzIFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb25bXT47XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VJbnN0cnVjdGlvbnM6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0U2tpbGxzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucHJvdmlkZVNraWxscyh0b2tlbikgYXMgVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRTa2lsbFtdPjtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVNraWxsczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZENoYW5nZVNraWxscyhsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTbGFzaENvbW1hbmRzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIucHJvdmlkZVNsYXNoQ29tbWFuZHModG9rZW4pIGFzIFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0U2xhc2hDb21tYW5kW10+O1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0SG9va3ModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UHJvbXB0RmlsZXMnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5wcm92aWRlSG9va3ModG9rZW4pIGFzIFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0SG9va1tdPjtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUhvb2tzOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLm9uRGlkQ2hhbmdlSG9va3MobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UGx1Z2lucyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQcm9tcHRGaWxlcycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdENoYXRBZ2VudHMyLnByb3ZpZGVQbHVnaW5zKHRva2VuKSBhcyBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdFBsdWdpbltdPjtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVBsdWdpbnM6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFByb21wdEZpbGVzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdEFnZW50czIub25EaWRDaGFuZ2VQbHVnaW5zKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiB2c2NvZGUuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXJNZXRhZGF0YSwgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXInKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RDaGF0QWdlbnRzMi5yZWdpc3RlckNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgY2hhdFNlc3Npb25UeXBlLCBtZXRhZGF0YSwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUlucHV0Tm90aWZpY2F0aW9uKGlkOiBzdHJpbmcpOiB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdElucHV0Tm90aWZpY2F0aW9uJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uLmNyZWF0ZUlucHV0Tm90aWZpY2F0aW9uKGV4dGVuc2lvbiwgaWQpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gbmFtZXNwYWNlOiBsbVxuXHRcdGNvbnN0IGxtOiB0eXBlb2YgdnNjb2RlLmxtID0ge1xuXHRcdFx0c2VsZWN0Q2hhdE1vZGVsczogKHNlbGVjdG9yKSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoZXh0ZW5zaW9uLCBzZWxlY3RvciA/PyB7fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VDaGF0TW9kZWxzOiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMub25EaWRDaGFuZ2VQcm92aWRlcnMobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyOiAodmVuZG9yLCBwcm92aWRlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcihleHRlbnNpb24sIHZlbmRvciwgcHJvdmlkZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpc01vZGVsUHJveHlBdmFpbGFibGUoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlTW9kZWxQcm94eScpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxzLmlzTW9kZWxQcm94eUF2YWlsYWJsZTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZU1vZGVsUHJveHlBdmFpbGFiaWxpdHk6IChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFByb3h5Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMub25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5KGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHRcdGdldE1vZGVsUHJveHk6ICgpID0+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFByb3h5Jyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMuZ2V0TW9kZWxQcm94eShleHRlbnNpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXI6IChwcm92aWRlcikgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TGFuZ3VhZ2VNb2RlbHMucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlcihleHRlbnNpb24sIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gZW1iZWRkaW5nc1xuXHRcdFx0Z2V0IGVtYmVkZGluZ01vZGVscygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW1iZWRkaW5ncycpO1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdEVtYmVkZGluZ3MuZW1iZWRkaW5nc01vZGVscztcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUVtYmVkZGluZ01vZGVsczogKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdlbWJlZGRpbmdzJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0RW1iZWRkaW5ncy5vbkRpZENoYW5nZShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlckVtYmVkZGluZ3NQcm92aWRlcihlbWJlZGRpbmdzTW9kZWwsIHByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2VtYmVkZGluZ3MnKTtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFbWJlZGRpbmdzLnJlZ2lzdGVyRW1iZWRkaW5nc1Byb3ZpZGVyKGV4dGVuc2lvbiwgZW1iZWRkaW5nc01vZGVsLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgY29tcHV0ZUVtYmVkZGluZ3MoZW1iZWRkaW5nc01vZGVsLCBpbnB1dCwgdG9rZW4/KTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZW1iZWRkaW5ncycpO1xuXHRcdFx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0RW1iZWRkaW5ncy5jb21wdXRlRW1iZWRkaW5ncyhlbWJlZGRpbmdzTW9kZWwsIGlucHV0LCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RFbWJlZGRpbmdzLmNvbXB1dGVFbWJlZGRpbmdzKGVtYmVkZGluZ3NNb2RlbCwgaW5wdXQsIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVG9vbDxUPihuYW1lOiBzdHJpbmcsIHRvb2w6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbDxUPikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxUb29scy5yZWdpc3RlclRvb2woZXh0ZW5zaW9uLCBuYW1lLCB0b29sKTtcblx0XHRcdH0sXG5cdFx0XHRyZWdpc3RlclRvb2xEZWZpbml0aW9uPFQ+KGRlZmluaXRpb246IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbERlZmluaXRpb24sIHRvb2w6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbDxUPikge1xuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxUb29scy5yZWdpc3RlclRvb2xEZWZpbml0aW9uKGV4dGVuc2lvbiwgZGVmaW5pdGlvbiwgdG9vbCk7XG5cdFx0XHR9LFxuXHRcdFx0aW52b2tlVG9vbDxUPihuYW1lT3JJbmZvOiBzdHJpbmcgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiwgcGFyYW1ldGVyczogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW52b2NhdGlvbk9wdGlvbnM8VD4sIHRva2VuPzogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbmFtZU9ySW5mbyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0SG9zdExhbmd1YWdlTW9kZWxUb29scy5pbnZva2VUb29sKGV4dGVuc2lvbiwgbmFtZU9ySW5mbywgcGFyYW1ldGVycywgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0b29scygpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMuZ2V0VG9vbHMoZXh0ZW5zaW9uKTtcblx0XHRcdH0sXG5cdFx0XHRmaWxlSXNJZ25vcmVkKHVyaTogdnNjb2RlLlVyaSwgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVscy5maWxlSXNJZ25vcmVkKGV4dGVuc2lvbiwgdXJpLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJJZ25vcmVkRmlsZVByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlUHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuIGV4dEhvc3RMYW5ndWFnZU1vZGVscy5yZWdpc3Rlcklnbm9yZWRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBwcm92aWRlcik7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJNY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXIoaWQsIHByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TWNwLnJlZ2lzdGVyTWNwQ29uZmlndXJhdGlvblByb3ZpZGVyKGV4dGVuc2lvbiwgaWQsIHByb3ZpZGVyKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zOiAoLi4uYXJncykgPT4ge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtY3BTZXJ2ZXJEZWZpbml0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gX2FzRXh0ZW5zaW9uRXZlbnQoZXh0SG9zdE1jcC5vbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zKSguLi5hcmdzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbWNwU2VydmVyRGVmaW5pdGlvbnMoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21jcFNlcnZlckRlZmluaXRpb25zJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TWNwLm1jcFNlcnZlckRlZmluaXRpb25zO1xuXHRcdFx0fSxcblx0XHRcdHN0YXJ0TWNwR2F0ZXdheShjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21jcFNlcnZlckRlZmluaXRpb25zJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0TWNwLnN0YXJ0TWNwR2F0ZXdheShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUNoYXRSZXF1ZXN0VG9vbHMoLi4uYXJncykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuIF9hc0V4dGVuc2lvbkV2ZW50KGV4dEhvc3RDaGF0QWdlbnRzMi5vbkRpZENoYW5nZUNoYXRSZXF1ZXN0VG9vbHMpKC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBuYW1lc3BhY2U6IHNwZWVjaFxuXHRcdGNvbnN0IHNwZWVjaDogdHlwZW9mIHZzY29kZS5zcGVlY2ggPSB7XG5cdFx0XHRyZWdpc3RlclNwZWVjaFByb3ZpZGVyKGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuU3BlZWNoUHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnc3BlZWNoJyk7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0U3BlZWNoLnJlZ2lzdGVyUHJvdmlkZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkLCBwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4gPHR5cGVvZiB2c2NvZGU+e1xuXHRcdFx0dmVyc2lvbjogaW5pdERhdGEudmVyc2lvbixcblx0XHRcdC8vIG5hbWVzcGFjZXNcblx0XHRcdGFpLFxuXHRcdFx0YXV0aGVudGljYXRpb24sXG5cdFx0XHRjb21tYW5kcyxcblx0XHRcdGNvbW1lbnRzLFxuXHRcdFx0Y2hhdCxcblx0XHRcdGRlYnVnLFxuXHRcdFx0ZW52LFxuXHRcdFx0ZXh0ZW5zaW9ucyxcblx0XHRcdGludGVyYWN0aXZlLFxuXHRcdFx0bDEwbixcblx0XHRcdGxhbmd1YWdlcyxcblx0XHRcdGxtLFxuXHRcdFx0bm90ZWJvb2tzLFxuXHRcdFx0c2NtLFxuXHRcdFx0c3BlZWNoLFxuXHRcdFx0dGFza3MsXG5cdFx0XHR0ZXN0cyxcblx0XHRcdHdpbmRvdyxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdC8vIHR5cGVzXG5cdFx0XHRCcmVha3BvaW50OiBleHRIb3N0VHlwZXMuQnJlYWtwb2ludCxcblx0XHRcdFRlcm1pbmFsT3V0cHV0QW5jaG9yOiBleHRIb3N0VHlwZXMuVGVybWluYWxPdXRwdXRBbmNob3IsXG5cdFx0XHRDaGF0UmVzdWx0RmVlZGJhY2tLaW5kOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3VsdEZlZWRiYWNrS2luZCxcblx0XHRcdENoYXRWYXJpYWJsZUxldmVsOiBleHRIb3N0VHlwZXMuQ2hhdFZhcmlhYmxlTGV2ZWwsXG5cdFx0XHRDaGF0Q29tcGxldGlvbkl0ZW06IGV4dEhvc3RUeXBlcy5DaGF0Q29tcGxldGlvbkl0ZW0sXG5cdFx0XHRDaGF0UmVmZXJlbmNlRGlhZ25vc3RpYzogZXh0SG9zdFR5cGVzLkNoYXRSZWZlcmVuY2VEaWFnbm9zdGljLFxuXHRcdFx0Q2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbDogZXh0SG9zdFR5cGVzLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwsXG5cdFx0XHRDYWxsSGllcmFyY2h5SXRlbTogZXh0SG9zdFR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtLFxuXHRcdFx0Q2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbDogZXh0SG9zdFR5cGVzLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwsXG5cdFx0XHRDYW5jZWxsYXRpb25FcnJvcjogZXJyb3JzLkNhbmNlbGxhdGlvbkVycm9yLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlLFxuXHRcdFx0Q2FuZGlkYXRlUG9ydFNvdXJjZTogQ2FuZGlkYXRlUG9ydFNvdXJjZSxcblx0XHRcdENvZGVBY3Rpb246IGV4dEhvc3RUeXBlcy5Db2RlQWN0aW9uLFxuXHRcdFx0Q29kZUFjdGlvbktpbmQ6IGV4dEhvc3RUeXBlcy5Db2RlQWN0aW9uS2luZCxcblx0XHRcdENvZGVBY3Rpb25UcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLkNvZGVBY3Rpb25UcmlnZ2VyS2luZCxcblx0XHRcdENvZGVMZW5zOiBleHRIb3N0VHlwZXMuQ29kZUxlbnMsXG5cdFx0XHRDb2xvcjogZXh0SG9zdFR5cGVzLkNvbG9yLFxuXHRcdFx0Q29sb3JJbmZvcm1hdGlvbjogZXh0SG9zdFR5cGVzLkNvbG9ySW5mb3JtYXRpb24sXG5cdFx0XHRDb2xvclByZXNlbnRhdGlvbjogZXh0SG9zdFR5cGVzLkNvbG9yUHJlc2VudGF0aW9uLFxuXHRcdFx0Q29sb3JUaGVtZUtpbmQ6IGV4dEhvc3RUeXBlcy5Db2xvclRoZW1lS2luZCxcblx0XHRcdENvbW1lbnRNb2RlOiBleHRIb3N0VHlwZXMuQ29tbWVudE1vZGUsXG5cdFx0XHRDb21tZW50U3RhdGU6IGV4dEhvc3RUeXBlcy5Db21tZW50U3RhdGUsXG5cdFx0XHRDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZTogZXh0SG9zdFR5cGVzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLFxuXHRcdFx0Q29tbWVudFRocmVhZFN0YXRlOiBleHRIb3N0VHlwZXMuQ29tbWVudFRocmVhZFN0YXRlLFxuXHRcdFx0Q29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHk6IGV4dEhvc3RUeXBlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSxcblx0XHRcdENvbW1lbnRUaHJlYWRGb2N1czogZXh0SG9zdFR5cGVzLkNvbW1lbnRUaHJlYWRGb2N1cyxcblx0XHRcdENvbXBsZXRpb25JdGVtOiBleHRIb3N0VHlwZXMuQ29tcGxldGlvbkl0ZW0sXG5cdFx0XHRDb21wbGV0aW9uSXRlbUtpbmQ6IGV4dEhvc3RUeXBlcy5Db21wbGV0aW9uSXRlbUtpbmQsXG5cdFx0XHRDb21wbGV0aW9uSXRlbVRhZzogZXh0SG9zdFR5cGVzLkNvbXBsZXRpb25JdGVtVGFnLFxuXHRcdFx0Q29tcGxldGlvbkxpc3Q6IGV4dEhvc3RUeXBlcy5Db21wbGV0aW9uTGlzdCxcblx0XHRcdENvbXBsZXRpb25UcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLkNvbXBsZXRpb25UcmlnZ2VyS2luZCxcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQ6IGV4dEhvc3RUeXBlcy5Db25maWd1cmF0aW9uVGFyZ2V0LFxuXHRcdFx0Q3VzdG9tRXhlY3V0aW9uOiBleHRIb3N0VHlwZXMuQ3VzdG9tRXhlY3V0aW9uLFxuXHRcdFx0RGVidWdBZGFwdGVyRXhlY3V0YWJsZTogZXh0SG9zdFR5cGVzLkRlYnVnQWRhcHRlckV4ZWN1dGFibGUsXG5cdFx0XHREZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbjogZXh0SG9zdFR5cGVzLkRlYnVnQWRhcHRlcklubGluZUltcGxlbWVudGF0aW9uLFxuXHRcdFx0RGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyOiBleHRIb3N0VHlwZXMuRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyLFxuXHRcdFx0RGVidWdBZGFwdGVyU2VydmVyOiBleHRIb3N0VHlwZXMuRGVidWdBZGFwdGVyU2VydmVyLFxuXHRcdFx0RGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZDogRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCxcblx0XHRcdERlYnVnQ29uc29sZU1vZGU6IGV4dEhvc3RUeXBlcy5EZWJ1Z0NvbnNvbGVNb2RlLFxuXHRcdFx0RGVidWdWaXN1YWxpemF0aW9uOiBleHRIb3N0VHlwZXMuRGVidWdWaXN1YWxpemF0aW9uLFxuXHRcdFx0RGVjb3JhdGlvblJhbmdlQmVoYXZpb3I6IGV4dEhvc3RUeXBlcy5EZWNvcmF0aW9uUmFuZ2VCZWhhdmlvcixcblx0XHRcdERpYWdub3N0aWM6IGV4dEhvc3RUeXBlcy5EaWFnbm9zdGljLFxuXHRcdFx0RGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbjogZXh0SG9zdFR5cGVzLkRpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24sXG5cdFx0XHREaWFnbm9zdGljU2V2ZXJpdHk6IGV4dEhvc3RUeXBlcy5EaWFnbm9zdGljU2V2ZXJpdHksXG5cdFx0XHREaWFnbm9zdGljVGFnOiBleHRIb3N0VHlwZXMuRGlhZ25vc3RpY1RhZyxcblx0XHRcdERpc3Bvc2FibGU6IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlLFxuXHRcdFx0RG9jdW1lbnRIaWdobGlnaHQ6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudEhpZ2hsaWdodCxcblx0XHRcdERvY3VtZW50SGlnaGxpZ2h0S2luZDogZXh0SG9zdFR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0S2luZCxcblx0XHRcdE11bHRpRG9jdW1lbnRIaWdobGlnaHQ6IGV4dEhvc3RUeXBlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0LFxuXHRcdFx0RG9jdW1lbnRMaW5rOiBleHRIb3N0VHlwZXMuRG9jdW1lbnRMaW5rLFxuXHRcdFx0RG9jdW1lbnRTeW1ib2w6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudFN5bWJvbCxcblx0XHRcdEVuZE9mTGluZTogZXh0SG9zdFR5cGVzLkVuZE9mTGluZSxcblx0XHRcdEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZTogZXh0SG9zdFR5cGVzLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSxcblx0XHRcdEV2YWx1YXRhYmxlRXhwcmVzc2lvbjogZXh0SG9zdFR5cGVzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbixcblx0XHRcdElubGluZVZhbHVlVGV4dDogZXh0SG9zdFR5cGVzLklubGluZVZhbHVlVGV4dCxcblx0XHRcdElubGluZVZhbHVlVmFyaWFibGVMb29rdXA6IGV4dEhvc3RUeXBlcy5JbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwLFxuXHRcdFx0SW5saW5lVmFsdWVFdmFsdWF0YWJsZUV4cHJlc3Npb246IGV4dEhvc3RUeXBlcy5JbmxpbmVWYWx1ZUV2YWx1YXRhYmxlRXhwcmVzc2lvbixcblx0XHRcdElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLklubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCxcblx0XHRcdElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQ6IGV4dEhvc3RUeXBlcy5JbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLFxuXHRcdFx0RXZlbnRFbWl0dGVyOiBFbWl0dGVyLFxuXHRcdFx0RXh0ZW5zaW9uS2luZDogZXh0SG9zdFR5cGVzLkV4dGVuc2lvbktpbmQsXG5cdFx0XHRFeHRlbnNpb25Nb2RlOiBleHRIb3N0VHlwZXMuRXh0ZW5zaW9uTW9kZSxcblx0XHRcdEV4dGVybmFsVXJpT3BlbmVyUHJpb3JpdHk6IGV4dEhvc3RUeXBlcy5FeHRlcm5hbFVyaU9wZW5lclByaW9yaXR5LFxuXHRcdFx0RmlsZUNoYW5nZVR5cGU6IGV4dEhvc3RUeXBlcy5GaWxlQ2hhbmdlVHlwZSxcblx0XHRcdEZpbGVEZWNvcmF0aW9uOiBleHRIb3N0VHlwZXMuRmlsZURlY29yYXRpb24sXG5cdFx0XHRGaWxlRGVjb3JhdGlvbjI6IGV4dEhvc3RUeXBlcy5GaWxlRGVjb3JhdGlvbixcblx0XHRcdEZpbGVTeXN0ZW1FcnJvcjogZXh0SG9zdFR5cGVzLkZpbGVTeXN0ZW1FcnJvcixcblx0XHRcdEZpbGVUeXBlOiBmaWxlcy5GaWxlVHlwZSxcblx0XHRcdEZpbGVQZXJtaXNzaW9uOiBmaWxlcy5GaWxlUGVybWlzc2lvbixcblx0XHRcdEZvbGRpbmdSYW5nZTogZXh0SG9zdFR5cGVzLkZvbGRpbmdSYW5nZSxcblx0XHRcdEZvbGRpbmdSYW5nZUtpbmQ6IGV4dEhvc3RUeXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLFxuXHRcdFx0RnVuY3Rpb25CcmVha3BvaW50OiBleHRIb3N0VHlwZXMuRnVuY3Rpb25CcmVha3BvaW50LFxuXHRcdFx0SW5saW5lQ29tcGxldGlvbkl0ZW06IGV4dEhvc3RUeXBlcy5JbmxpbmVTdWdnZXN0aW9uLFxuXHRcdFx0SW5saW5lQ29tcGxldGlvbkxpc3Q6IGV4dEhvc3RUeXBlcy5JbmxpbmVTdWdnZXN0aW9uTGlzdCxcblx0XHRcdEhvdmVyOiBleHRIb3N0VHlwZXMuSG92ZXIsXG5cdFx0XHRWZXJib3NlSG92ZXI6IGV4dEhvc3RUeXBlcy5WZXJib3NlSG92ZXIsXG5cdFx0XHRIb3ZlclZlcmJvc2l0eUFjdGlvbjogZXh0SG9zdFR5cGVzLkhvdmVyVmVyYm9zaXR5QWN0aW9uLFxuXHRcdFx0SW5kZW50QWN0aW9uOiBsYW5ndWFnZUNvbmZpZ3VyYXRpb24uSW5kZW50QWN0aW9uLFxuXHRcdFx0TG9jYXRpb246IGV4dEhvc3RUeXBlcy5Mb2NhdGlvbixcblx0XHRcdE1hcmtkb3duU3RyaW5nOiBleHRIb3N0VHlwZXMuTWFya2Rvd25TdHJpbmcsXG5cdFx0XHRPdmVydmlld1J1bGVyTGFuZTogT3ZlcnZpZXdSdWxlckxhbmUsXG5cdFx0XHRQYXJhbWV0ZXJJbmZvcm1hdGlvbjogZXh0SG9zdFR5cGVzLlBhcmFtZXRlckluZm9ybWF0aW9uLFxuXHRcdFx0UG9ydEF1dG9Gb3J3YXJkQWN0aW9uOiBleHRIb3N0VHlwZXMuUG9ydEF1dG9Gb3J3YXJkQWN0aW9uLFxuXHRcdFx0UG9zaXRpb246IGV4dEhvc3RUeXBlcy5Qb3NpdGlvbixcblx0XHRcdFByb2Nlc3NFeGVjdXRpb246IGV4dEhvc3RUeXBlcy5Qcm9jZXNzRXhlY3V0aW9uLFxuXHRcdFx0UHJvZ3Jlc3NMb2NhdGlvbjogZXh0SG9zdFR5cGVzLlByb2dyZXNzTG9jYXRpb24sXG5cdFx0XHRRdWlja0lucHV0QnV0dG9uTG9jYXRpb246IGV4dEhvc3RUeXBlcy5RdWlja0lucHV0QnV0dG9uTG9jYXRpb24sXG5cdFx0XHRRdWlja0lucHV0QnV0dG9uczogZXh0SG9zdFR5cGVzLlF1aWNrSW5wdXRCdXR0b25zLFxuXHRcdFx0UmFuZ2U6IGV4dEhvc3RUeXBlcy5SYW5nZSxcblx0XHRcdFJlbGF0aXZlUGF0dGVybjogZXh0SG9zdFR5cGVzLlJlbGF0aXZlUGF0dGVybixcblx0XHRcdFNlbGVjdGlvbjogZXh0SG9zdFR5cGVzLlNlbGVjdGlvbixcblx0XHRcdFNlbGVjdGlvblJhbmdlOiBleHRIb3N0VHlwZXMuU2VsZWN0aW9uUmFuZ2UsXG5cdFx0XHRTZW1hbnRpY1Rva2VuczogZXh0SG9zdFR5cGVzLlNlbWFudGljVG9rZW5zLFxuXHRcdFx0U2VtYW50aWNUb2tlbnNCdWlsZGVyOiBleHRIb3N0VHlwZXMuU2VtYW50aWNUb2tlbnNCdWlsZGVyLFxuXHRcdFx0U2VtYW50aWNUb2tlbnNFZGl0OiBleHRIb3N0VHlwZXMuU2VtYW50aWNUb2tlbnNFZGl0LFxuXHRcdFx0U2VtYW50aWNUb2tlbnNFZGl0czogZXh0SG9zdFR5cGVzLlNlbWFudGljVG9rZW5zRWRpdHMsXG5cdFx0XHRTZW1hbnRpY1Rva2Vuc0xlZ2VuZDogZXh0SG9zdFR5cGVzLlNlbWFudGljVG9rZW5zTGVnZW5kLFxuXHRcdFx0U2hlbGxFeGVjdXRpb246IGV4dEhvc3RUeXBlcy5TaGVsbEV4ZWN1dGlvbixcblx0XHRcdFNoZWxsUXVvdGluZzogZXh0SG9zdFR5cGVzLlNoZWxsUXVvdGluZyxcblx0XHRcdFNpZ25hdHVyZUhlbHA6IGV4dEhvc3RUeXBlcy5TaWduYXR1cmVIZWxwLFxuXHRcdFx0U2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kOiBleHRIb3N0VHlwZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLFxuXHRcdFx0U2lnbmF0dXJlSW5mb3JtYXRpb246IGV4dEhvc3RUeXBlcy5TaWduYXR1cmVJbmZvcm1hdGlvbixcblx0XHRcdFNuaXBwZXRTdHJpbmc6IGV4dEhvc3RUeXBlcy5TbmlwcGV0U3RyaW5nLFxuXHRcdFx0U291cmNlQnJlYWtwb2ludDogZXh0SG9zdFR5cGVzLlNvdXJjZUJyZWFrcG9pbnQsXG5cdFx0XHRTdGFuZGFyZFRva2VuVHlwZTogZXh0SG9zdFR5cGVzLlN0YW5kYXJkVG9rZW5UeXBlLFxuXHRcdFx0U3ludGF4SGlnaGxpZ2h0aW5nVG9rZW5Gb250U3R5bGU6IGV4dEhvc3RUeXBlcy5TeW50YXhIaWdobGlnaHRpbmdUb2tlbkZvbnRTdHlsZSxcblx0XHRcdFN0YXR1c0JhckFsaWdubWVudDogZXh0SG9zdFR5cGVzLlN0YXR1c0JhckFsaWdubWVudCxcblx0XHRcdFN5bWJvbEluZm9ybWF0aW9uOiBleHRIb3N0VHlwZXMuU3ltYm9sSW5mb3JtYXRpb24sXG5cdFx0XHRTeW1ib2xLaW5kOiBleHRIb3N0VHlwZXMuU3ltYm9sS2luZCxcblx0XHRcdFN5bWJvbFRhZzogZXh0SG9zdFR5cGVzLlN5bWJvbFRhZyxcblx0XHRcdFRhc2s6IGV4dEhvc3RUeXBlcy5UYXNrLFxuXHRcdFx0VGFza0V2ZW50S2luZDogZXh0SG9zdFR5cGVzLlRhc2tFdmVudEtpbmQsXG5cdFx0XHRUYXNrR3JvdXA6IGV4dEhvc3RUeXBlcy5UYXNrR3JvdXAsXG5cdFx0XHRUYXNrUGFuZWxLaW5kOiBleHRIb3N0VHlwZXMuVGFza1BhbmVsS2luZCxcblx0XHRcdFRhc2tSZXZlYWxLaW5kOiBleHRIb3N0VHlwZXMuVGFza1JldmVhbEtpbmQsXG5cdFx0XHRUYXNrUnVuT246IGV4dEhvc3RUeXBlcy5UYXNrUnVuT24sXG5cdFx0XHRUYXNrU2NvcGU6IGV4dEhvc3RUeXBlcy5UYXNrU2NvcGUsXG5cdFx0XHRUZXJtaW5hbExpbms6IGV4dEhvc3RUeXBlcy5UZXJtaW5hbExpbmssXG5cdFx0XHRUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kOiBleHRIb3N0VHlwZXMuVGVybWluYWxRdWlja0ZpeENvbW1hbmQsXG5cdFx0XHRUZXJtaW5hbFF1aWNrRml4T3BlbmVyOiBleHRIb3N0VHlwZXMuVGVybWluYWxRdWlja0ZpeE9wZW5lcixcblx0XHRcdFRlcm1pbmFsTG9jYXRpb246IGV4dEhvc3RUeXBlcy5UZXJtaW5hbExvY2F0aW9uLFxuXHRcdFx0VGVybWluYWxQcm9maWxlOiBleHRIb3N0VHlwZXMuVGVybWluYWxQcm9maWxlLFxuXHRcdFx0VGVybWluYWxFeGl0UmVhc29uOiBleHRIb3N0VHlwZXMuVGVybWluYWxFeGl0UmVhc29uLFxuXHRcdFx0VGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lQ29uZmlkZW5jZTogZXh0SG9zdFR5cGVzLlRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UsXG5cdFx0XHRUZXJtaW5hbENvbXBsZXRpb25JdGVtOiBleHRIb3N0VHlwZXMuVGVybWluYWxDb21wbGV0aW9uSXRlbSxcblx0XHRcdFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kOiBleHRIb3N0VHlwZXMuVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQsXG5cdFx0XHRUZXJtaW5hbENvbXBsZXRpb25MaXN0OiBleHRIb3N0VHlwZXMuVGVybWluYWxDb21wbGV0aW9uTGlzdCxcblx0XHRcdFRlcm1pbmFsU2hlbGxUeXBlOiBleHRIb3N0VHlwZXMuVGVybWluYWxTaGVsbFR5cGUsXG5cdFx0XHRUZXh0RG9jdW1lbnRTYXZlUmVhc29uOiBleHRIb3N0VHlwZXMuVGV4dERvY3VtZW50U2F2ZVJlYXNvbixcblx0XHRcdFRleHRFZGl0OiBleHRIb3N0VHlwZXMuVGV4dEVkaXQsXG5cdFx0XHRTbmlwcGV0VGV4dEVkaXQ6IGV4dEhvc3RUeXBlcy5TbmlwcGV0VGV4dEVkaXQsXG5cdFx0XHRUZXh0RWRpdG9yQ3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZSxcblx0XHRcdFRleHRFZGl0b3JDaGFuZ2VLaW5kOiBleHRIb3N0VHlwZXMuVGV4dEVkaXRvckNoYW5nZUtpbmQsXG5cdFx0XHRUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZTogZXh0SG9zdFR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLFxuXHRcdFx0VGV4dEVkaXRvclJldmVhbFR5cGU6IGV4dEhvc3RUeXBlcy5UZXh0RWRpdG9yUmV2ZWFsVHlwZSxcblx0XHRcdFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kOiBleHRIb3N0VHlwZXMuVGV4dEVkaXRvclNlbGVjdGlvbkNoYW5nZUtpbmQsXG5cdFx0XHRTeW50YXhUb2tlblR5cGU6IGV4dEhvc3RUeXBlcy5TeW50YXhUb2tlblR5cGUsXG5cdFx0XHRUZXh0RG9jdW1lbnRDaGFuZ2VSZWFzb246IGV4dEhvc3RUeXBlcy5UZXh0RG9jdW1lbnRDaGFuZ2VSZWFzb24sXG5cdFx0XHRUaGVtZUNvbG9yOiBleHRIb3N0VHlwZXMuVGhlbWVDb2xvcixcblx0XHRcdFRoZW1lSWNvbjogZXh0SG9zdFR5cGVzLlRoZW1lSWNvbixcblx0XHRcdFRyZWVJdGVtOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW0sXG5cdFx0XHRUcmVlSXRlbUNoZWNrYm94U3RhdGU6IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNoZWNrYm94U3RhdGUsXG5cdFx0XHRUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGU6IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsXG5cdFx0XHRUeXBlSGllcmFyY2h5SXRlbTogZXh0SG9zdFR5cGVzLlR5cGVIaWVyYXJjaHlJdGVtLFxuXHRcdFx0VUlLaW5kOiBVSUtpbmQsXG5cdFx0XHRVcmk6IFVSSSxcblx0XHRcdFZpZXdDb2x1bW46IGV4dEhvc3RUeXBlcy5WaWV3Q29sdW1uLFxuXHRcdFx0V29ya3NwYWNlRWRpdDogZXh0SG9zdFR5cGVzLldvcmtzcGFjZUVkaXQsXG5cdFx0XHQvLyBwcm9wb3NlZCBhcGkgdHlwZXNcblx0XHRcdERvY3VtZW50UGFzdGVUcmlnZ2VyS2luZDogZXh0SG9zdFR5cGVzLkRvY3VtZW50UGFzdGVUcmlnZ2VyS2luZCxcblx0XHRcdERvY3VtZW50RHJvcEVkaXQ6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudERyb3BFZGl0LFxuXHRcdFx0RG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kOiBleHRIb3N0VHlwZXMuRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLFxuXHRcdFx0RG9jdW1lbnRQYXN0ZUVkaXQ6IGV4dEhvc3RUeXBlcy5Eb2N1bWVudFBhc3RlRWRpdCxcblx0XHRcdElubGF5SGludDogZXh0SG9zdFR5cGVzLklubGF5SGludCxcblx0XHRcdElubGF5SGludExhYmVsUGFydDogZXh0SG9zdFR5cGVzLklubGF5SGludExhYmVsUGFydCxcblx0XHRcdElubGF5SGludEtpbmQ6IGV4dEhvc3RUeXBlcy5JbmxheUhpbnRLaW5kLFxuXHRcdFx0UmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcjogZXh0SG9zdFR5cGVzLlJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IsXG5cdFx0XHRSZXNvbHZlZEF1dGhvcml0eTogZXh0SG9zdFR5cGVzLlJlc29sdmVkQXV0aG9yaXR5LFxuXHRcdFx0TWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5OiBleHRIb3N0VHlwZXMuTWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5LFxuXHRcdFx0U291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGU6IGV4dEhvc3RUeXBlcy5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZSxcblx0XHRcdEV4dGVuc2lvblJ1bnRpbWU6IGV4dEhvc3RUeXBlcy5FeHRlbnNpb25SdW50aW1lLFxuXHRcdFx0VGltZWxpbmVJdGVtOiBleHRIb3N0VHlwZXMuVGltZWxpbmVJdGVtLFxuXHRcdFx0Tm90ZWJvb2tSYW5nZTogZXh0SG9zdFR5cGVzLk5vdGVib29rUmFuZ2UsXG5cdFx0XHROb3RlYm9va0NlbGxLaW5kOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsS2luZCxcblx0XHRcdE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUsXG5cdFx0XHROb3RlYm9va0NlbGxEYXRhOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsRGF0YSxcblx0XHRcdE5vdGVib29rRGF0YTogZXh0SG9zdFR5cGVzLk5vdGVib29rRGF0YSxcblx0XHRcdE5vdGVib29rUmVuZGVyZXJTY3JpcHQ6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va1JlbmRlcmVyU2NyaXB0LFxuXHRcdFx0Tm90ZWJvb2tDZWxsU3RhdHVzQmFyQWxpZ25tZW50OiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsU3RhdHVzQmFyQWxpZ25tZW50LFxuXHRcdFx0Tm90ZWJvb2tFZGl0b3JSZXZlYWxUeXBlOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tFZGl0b3JSZXZlYWxUeXBlLFxuXHRcdFx0Tm90ZWJvb2tDZWxsT3V0cHV0OiBleHRIb3N0VHlwZXMuTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0Tm90ZWJvb2tDZWxsT3V0cHV0SXRlbTogZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0sXG5cdFx0XHRDZWxsRXJyb3JTdGFja0ZyYW1lOiBleHRIb3N0VHlwZXMuQ2VsbEVycm9yU3RhY2tGcmFtZSxcblx0XHRcdE5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW06IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtLFxuXHRcdFx0Tm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHk6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eSxcblx0XHRcdE5vdGVib29rQ29udHJvbGxlckFmZmluaXR5MjogZXh0SG9zdFR5cGVzLk5vdGVib29rQ29udHJvbGxlckFmZmluaXR5Mixcblx0XHRcdE5vdGVib29rRWRpdDogZXh0SG9zdFR5cGVzLk5vdGVib29rRWRpdCxcblx0XHRcdE5vdGVib29rS2VybmVsU291cmNlQWN0aW9uOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24sXG5cdFx0XHROb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kOiBleHRIb3N0VHlwZXMuTm90ZWJvb2tWYXJpYWJsZXNSZXF1ZXN0S2luZCxcblx0XHRcdFBvcnRBdHRyaWJ1dGVzOiBleHRIb3N0VHlwZXMuUG9ydEF0dHJpYnV0ZXMsXG5cdFx0XHRMaW5rZWRFZGl0aW5nUmFuZ2VzOiBleHRIb3N0VHlwZXMuTGlua2VkRWRpdGluZ1Jhbmdlcyxcblx0XHRcdFRlc3RSZXN1bHRTdGF0ZTogZXh0SG9zdFR5cGVzLlRlc3RSZXN1bHRTdGF0ZSxcblx0XHRcdFRlc3RSdW5SZXF1ZXN0OiBleHRIb3N0VHlwZXMuVGVzdFJ1blJlcXVlc3QsXG5cdFx0XHRUZXN0TWVzc2FnZTogZXh0SG9zdFR5cGVzLlRlc3RNZXNzYWdlLFxuXHRcdFx0VGVzdE1lc3NhZ2VTdGFja0ZyYW1lOiBleHRIb3N0VHlwZXMuVGVzdE1lc3NhZ2VTdGFja0ZyYW1lLFxuXHRcdFx0VGVzdFRhZzogZXh0SG9zdFR5cGVzLlRlc3RUYWcsXG5cdFx0XHRUZXN0UnVuUHJvZmlsZUtpbmQ6IGV4dEhvc3RUeXBlcy5UZXN0UnVuUHJvZmlsZUtpbmQsXG5cdFx0XHRUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZTogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUsXG5cdFx0XHREYXRhVHJhbnNmZXI6IGV4dEhvc3RUeXBlcy5EYXRhVHJhbnNmZXIsXG5cdFx0XHREYXRhVHJhbnNmZXJJdGVtOiBleHRIb3N0VHlwZXMuRGF0YVRyYW5zZmVySXRlbSxcblx0XHRcdFRlc3RDb3ZlcmFnZUNvdW50OiBleHRIb3N0VHlwZXMuVGVzdENvdmVyYWdlQ291bnQsXG5cdFx0XHRGaWxlQ292ZXJhZ2U6IGV4dEhvc3RUeXBlcy5GaWxlQ292ZXJhZ2UsXG5cdFx0XHRTdGF0ZW1lbnRDb3ZlcmFnZTogZXh0SG9zdFR5cGVzLlN0YXRlbWVudENvdmVyYWdlLFxuXHRcdFx0QnJhbmNoQ292ZXJhZ2U6IGV4dEhvc3RUeXBlcy5CcmFuY2hDb3ZlcmFnZSxcblx0XHRcdERlY2xhcmF0aW9uQ292ZXJhZ2U6IGV4dEhvc3RUeXBlcy5EZWNsYXJhdGlvbkNvdmVyYWdlLFxuXHRcdFx0V29ya3NwYWNlVHJ1c3RTdGF0ZTogZXh0SG9zdFR5cGVzLldvcmtzcGFjZVRydXN0U3RhdGUsXG5cdFx0XHRMYW5ndWFnZVN0YXR1c1NldmVyaXR5OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VTdGF0dXNTZXZlcml0eSxcblx0XHRcdFF1aWNrUGlja0l0ZW1LaW5kOiBleHRIb3N0VHlwZXMuUXVpY2tQaWNrSXRlbUtpbmQsXG5cdFx0XHRJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eTogZXh0SG9zdFR5cGVzLklucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5LFxuXHRcdFx0VGFiSW5wdXRUZXh0OiBleHRIb3N0VHlwZXMuVGV4dFRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXRUZXh0RGlmZjogZXh0SG9zdFR5cGVzLlRleHREaWZmVGFiSW5wdXQsXG5cdFx0XHRUYWJJbnB1dFRleHRNZXJnZTogZXh0SG9zdFR5cGVzLlRleHRNZXJnZVRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXRDdXN0b206IGV4dEhvc3RUeXBlcy5DdXN0b21FZGl0b3JUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0Tm90ZWJvb2s6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0VkaXRvclRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXROb3RlYm9va0RpZmY6IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0RpZmZFZGl0b3JUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0V2VidmlldzogZXh0SG9zdFR5cGVzLldlYnZpZXdFZGl0b3JUYWJJbnB1dCxcblx0XHRcdFRhYklucHV0VGVybWluYWw6IGV4dEhvc3RUeXBlcy5UZXJtaW5hbEVkaXRvclRhYklucHV0LFxuXHRcdFx0VGFiSW5wdXRJbnRlcmFjdGl2ZVdpbmRvdzogZXh0SG9zdFR5cGVzLkludGVyYWN0aXZlV2luZG93SW5wdXQsXG5cdFx0XHRUYWJJbnB1dENoYXQ6IGV4dEhvc3RUeXBlcy5DaGF0RWRpdG9yVGFiSW5wdXQsXG5cdFx0XHRUYWJJbnB1dFRleHRNdWx0aURpZmY6IGV4dEhvc3RUeXBlcy5UZXh0TXVsdGlEaWZmVGFiSW5wdXQsXG5cdFx0XHRUZWxlbWV0cnlUcnVzdGVkVmFsdWU6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSxcblx0XHRcdExvZ0xldmVsOiBMb2dMZXZlbCxcblx0XHRcdEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaDogRWRpdFNlc3Npb25JZGVudGl0eU1hdGNoLFxuXHRcdFx0SW50ZXJhY3RpdmVTZXNzaW9uVm90ZURpcmVjdGlvbjogZXh0SG9zdFR5cGVzLkludGVyYWN0aXZlU2Vzc2lvblZvdGVEaXJlY3Rpb24sXG5cdFx0XHRDaGF0Q29weUtpbmQ6IGV4dEhvc3RUeXBlcy5DaGF0Q29weUtpbmQsXG5cdFx0XHRDaGF0U2Vzc2lvbkNoYW5nZWRGaWxlOiBleHRIb3N0VHlwZXMuQ2hhdFNlc3Npb25DaGFuZ2VkRmlsZSxcblx0XHRcdENoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWU6IGV4dEhvc3RUeXBlcy5DaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lLFxuXHRcdFx0SW50ZXJhY3RpdmVFZGl0b3JSZXNwb25zZUZlZWRiYWNrS2luZDogZXh0SG9zdFR5cGVzLkludGVyYWN0aXZlRWRpdG9yUmVzcG9uc2VGZWVkYmFja0tpbmQsXG5cdFx0XHREZWJ1Z1N0YWNrRnJhbWU6IGV4dEhvc3RUeXBlcy5EZWJ1Z1N0YWNrRnJhbWUsXG5cdFx0XHREZWJ1Z1RocmVhZDogZXh0SG9zdFR5cGVzLkRlYnVnVGhyZWFkLFxuXHRcdFx0UmVsYXRlZEluZm9ybWF0aW9uVHlwZTogZXh0SG9zdFR5cGVzLlJlbGF0ZWRJbmZvcm1hdGlvblR5cGUsXG5cdFx0XHRTcGVlY2hUb1RleHRTdGF0dXM6IGV4dEhvc3RUeXBlcy5TcGVlY2hUb1RleHRTdGF0dXMsXG5cdFx0XHRUZXh0VG9TcGVlY2hTdGF0dXM6IGV4dEhvc3RUeXBlcy5UZXh0VG9TcGVlY2hTdGF0dXMsXG5cdFx0XHRQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQ6IGV4dEhvc3RUeXBlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQsXG5cdFx0XHRJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZDogZXh0SG9zdFR5cGVzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLFxuXHRcdFx0SW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQ6IGV4dEhvc3RUeXBlcy5JbmxpbmVDb21wbGV0aW9uRGlzcGxheUxvY2F0aW9uS2luZCxcblx0XHRcdEtleXdvcmRSZWNvZ25pdGlvblN0YXR1czogZXh0SG9zdFR5cGVzLktleXdvcmRSZWNvZ25pdGlvblN0YXR1cyxcblx0XHRcdENoYXRJbWFnZU1pbWVUeXBlOiBleHRIb3N0VHlwZXMuQ2hhdEltYWdlTWltZVR5cGUsXG5cdFx0XHRDaGF0UmVzcG9uc2VNYXJrZG93blBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VBbmNob3JQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCxcblx0XHRcdENoYXRSZXNwb25zZVByb2dyZXNzUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydCxcblx0XHRcdENoYXRSZXNwb25zZVByb2dyZXNzUGFydDI6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyLFxuXHRcdFx0Q2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUaGlua2luZ1Byb2dyZXNzUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUhvb2tQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlSG9va1BhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCxcblx0XHRcdENoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQyOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VXYXJuaW5nUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlSW5mb1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VJbmZvUGFydCxcblx0XHRcdENoYXRSZXNwb25zZVRleHRFZGl0UGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVRleHRFZGl0UGFydCxcblx0XHRcdENoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydCxcblx0XHRcdENoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0LFxuXHRcdFx0Q2hhdFF1ZXN0aW9uOiBleHRIb3N0VHlwZXMuQ2hhdFF1ZXN0aW9uLFxuXHRcdFx0Q2hhdFF1ZXN0aW9uVHlwZTogZXh0SG9zdFR5cGVzLkNoYXRRdWVzdGlvblR5cGUsXG5cdFx0XHRDaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlTW92ZVBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNb3ZlUGFydCxcblx0XHRcdENoYXRSZXNwb25zZUV4dGVuc2lvbnNQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQsXG5cdFx0XHRDaGF0UmVzcG9uc2VFeHRlcm5hbEVkaXRQYXJ0OiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZXJuYWxFZGl0UGFydCxcblx0XHRcdENoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydDogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydCxcblx0XHRcdENoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0LFxuXHRcdFx0Q2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQ6IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0U3RhdHVzS2luZCxcblx0XHRcdENoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24sXG5cdFx0XHRDaGF0UmVxdWVzdFR1cm46IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdFR1cm4sXG5cdFx0XHRDaGF0UmVxdWVzdFR1cm4yOiBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RUdXJuLFxuXHRcdFx0Q2hhdFJlc3BvbnNlVHVybjogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVR1cm4sXG5cdFx0XHRDaGF0UmVzcG9uc2VUdXJuMjogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVR1cm4yLFxuXHRcdFx0Q2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhOiBleHRIb3N0VHlwZXMuQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhLFxuXHRcdFx0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydDogZXh0SG9zdFR5cGVzLkNoYXRUb29sSW52b2NhdGlvblBhcnQsXG5cdFx0XHRDaGF0TG9jYXRpb246IGV4dEhvc3RUeXBlcy5DaGF0TG9jYXRpb24sXG5cdFx0XHRDaGF0U2Vzc2lvblN0YXR1czogZXh0SG9zdFR5cGVzLkNoYXRTZXNzaW9uU3RhdHVzLFxuXHRcdFx0Q2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZTogZXh0SG9zdFR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUsXG5cdFx0XHRDaGF0RGVidWdMb2dMZXZlbDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0xvZ0xldmVsLFxuXHRcdFx0Q2hhdERlYnVnVG9vbENhbGxSZXN1bHQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdUb29sQ2FsbFJlc3VsdCxcblx0XHRcdENoYXREZWJ1Z0hvb2tSZXN1bHQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdIb29rUmVzdWx0LFxuXHRcdFx0Q2hhdERlYnVnVG9vbENhbGxFdmVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQsXG5cdFx0XHRDaGF0RGVidWdNb2RlbFR1cm5FdmVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z01vZGVsVHVybkV2ZW50LFxuXHRcdFx0Q2hhdERlYnVnR2VuZXJpY0V2ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnR2VuZXJpY0V2ZW50LFxuXHRcdFx0Q2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdTdWJhZ2VudEludm9jYXRpb25FdmVudCxcblx0XHRcdENoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50LFxuXHRcdFx0Q2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50LFxuXHRcdFx0Q2hhdERlYnVnTWVzc2FnZVNlY3Rpb246IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdNZXNzYWdlU2VjdGlvbixcblx0XHRcdENoYXREZWJ1Z0V2ZW50VGV4dENvbnRlbnQ6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdFdmVudFRleHRDb250ZW50LFxuXHRcdFx0Q2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlOiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlLFxuXHRcdFx0Q2hhdERlYnVnRXZlbnRNZXNzYWdlQ29udGVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0V2ZW50TWVzc2FnZUNvbnRlbnQsXG5cdFx0XHRDaGF0RGVidWdFdmVudFRvb2xDYWxsQ29udGVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0V2ZW50VG9vbENhbGxDb250ZW50LFxuXHRcdFx0Q2hhdERlYnVnRXZlbnRNb2RlbFR1cm5Db250ZW50OiBleHRIb3N0VHlwZXMuQ2hhdERlYnVnRXZlbnRNb2RlbFR1cm5Db250ZW50LFxuXHRcdFx0Q2hhdERlYnVnRXZlbnRIb29rQ29udGVudDogZXh0SG9zdFR5cGVzLkNoYXREZWJ1Z0V2ZW50SG9va0NvbnRlbnQsXG5cdFx0XHRDaGF0UmVxdWVzdEVkaXRvckRhdGE6IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdEVkaXRvckRhdGEsXG5cdFx0XHRDaGF0UmVxdWVzdE5vdGVib29rRGF0YTogZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0Tm90ZWJvb2tEYXRhLFxuXHRcdFx0Q2hhdFJlZmVyZW5jZUJpbmFyeURhdGE6IGV4dEhvc3RUeXBlcy5DaGF0UmVmZXJlbmNlQmluYXJ5RGF0YSxcblx0XHRcdENoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZDogZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZCxcblx0XHRcdExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGU6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMjogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIsXG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQ6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQyOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRleHRQYXJ0OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRleHRQYXJ0MjogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2U6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLFxuXHRcdFx0VG9vbFJlc3VsdEF1ZGllbmNlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSwgLy8gYmFjayBjb21wYXRcblx0XHRcdExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQ6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydDogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsRXJyb3I6IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRXJyb3IsXG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdDogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQyOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQyLFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbERhdGFQYXJ0OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0LFxuXHRcdFx0TGFuZ3VhZ2VNb2RlbERhdGFQYXJ0MjogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCxcblx0XHRcdExhbmd1YWdlTW9kZWxUb29sRXh0ZW5zaW9uU291cmNlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xFeHRlbnNpb25Tb3VyY2UsXG5cdFx0XHRMYW5ndWFnZU1vZGVsVG9vbE1DUFNvdXJjZTogZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sTUNQU291cmNlLFxuXHRcdFx0RXh0ZW5kZWRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdDogZXh0SG9zdFR5cGVzLkV4dGVuZGVkTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQsXG5cdFx0XHRMYW5ndWFnZU1vZGVsQ2hhdFRvb2xNb2RlOiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRUb29sTW9kZSxcblx0XHRcdExhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0OiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQsXG5cdFx0XHROZXdTeW1ib2xOYW1lOiBleHRIb3N0VHlwZXMuTmV3U3ltYm9sTmFtZSxcblx0XHRcdE5ld1N5bWJvbE5hbWVUYWc6IGV4dEhvc3RUeXBlcy5OZXdTeW1ib2xOYW1lVGFnLFxuXHRcdFx0TmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kOiBleHRIb3N0VHlwZXMuTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLFxuXHRcdFx0RXhjbHVkZVNldHRpbmdPcHRpb25zOiBFeGNsdWRlU2V0dGluZ09wdGlvbnMsXG5cdFx0XHRUZXh0U2VhcmNoQ29udGV4dDI6IFRleHRTZWFyY2hDb250ZXh0Mixcblx0XHRcdFRleHRTZWFyY2hNYXRjaDI6IFRleHRTZWFyY2hNYXRjaDIsXG5cdFx0XHRBSVNlYXJjaEtleXdvcmQ6IEFJU2VhcmNoS2V5d29yZCxcblx0XHRcdFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlTmV3OiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZSxcblx0XHRcdENoYXRFcnJvckxldmVsOiBleHRIb3N0VHlwZXMuQ2hhdEVycm9yTGV2ZWwsXG5cdFx0XHRDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eTogZXh0SG9zdFR5cGVzLkNoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LFxuXHRcdFx0TWNwSHR0cFNlcnZlckRlZmluaXRpb246IGV4dEhvc3RUeXBlcy5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbixcblx0XHRcdE1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uMjogZXh0SG9zdFR5cGVzLk1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0TWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uOiBleHRIb3N0VHlwZXMuTWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0TWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uMjogZXh0SG9zdFR5cGVzLk1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbixcblx0XHRcdE1jcFRvb2xBdmFpbGFiaWxpdHk6IGV4dEhvc3RUeXBlcy5NY3BUb29sQXZhaWxhYmlsaXR5LFxuXHRcdFx0TWNwVG9vbEludm9jYXRpb25Db250ZW50RGF0YTogZXh0SG9zdFR5cGVzLk1jcFRvb2xJbnZvY2F0aW9uQ29udGVudERhdGEsXG5cdFx0XHRTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQ6IGV4dEhvc3RUeXBlcy5TZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQsXG5cdFx0XHRDaGF0VG9kb1N0YXR1czogZXh0SG9zdFR5cGVzLkNoYXRUb2RvU3RhdHVzLFxuXHRcdFx0Q2hhdERlYnVnU3ViYWdlbnRTdGF0dXM6IGV4dEhvc3RUeXBlcy5DaGF0RGVidWdTdWJhZ2VudFN0YXR1cyxcblx0XHR9O1xuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFlBQVksWUFBWTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFNBQVMscUJBQXFCO0FBQ3ZDLE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxPQUFPLHdCQUF3QjtBQUN4QyxZQUFZLDJCQUEyQjtBQUN2QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQiw4QkFBcUQ7QUFDOUUsWUFBWSxXQUFXO0FBRXZCLFNBQVMsYUFBYSxnQkFBZ0IsZ0JBQWdCO0FBQ3RELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsY0FBYztBQUN2QixTQUFTLHlCQUF5Qiw0QkFBNEI7QUFFOUQsU0FBUyxpQkFBaUIsdUJBQXVCLCtCQUErQixvQkFBb0Isd0JBQXdCO0FBQzVILFNBQVMscUJBQXFCLGdCQUF5RSxtQkFBbUI7QUFDMUgsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQ0FBaUM7QUFDMUMs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
