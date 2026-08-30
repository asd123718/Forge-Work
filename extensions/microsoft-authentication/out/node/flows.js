"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.allFlows = void 0;
exports.getMsalFlows = getMsalFlows;
const vscode_1 = require("vscode");
const loopbackClientAndOpener_1 = require("../common/loopbackClientAndOpener");
const loopbackTemplate_1 = require("./loopbackTemplate");
const config_1 = require("../common/config");
const DEFAULT_REDIRECT_URI = 'https://vscode.dev/redirect';
class DefaultLoopbackFlow {
    label = 'default';
    options = {
        supportsRemoteExtensionHost: false,
        supportsUnsupportedClient: true,
        supportsBroker: true,
        supportsPortableMode: true
    };
    async trigger({ cachedPca, authority, scopes, claims, resource, loginHint, windowHandle, logger }) {
        logger.info('Trying default msal flow...');
        let redirectUri;
        if (cachedPca.isBrokerAvailable && process.platform === 'darwin') {
            redirectUri = config_1.Config.macOSBrokerRedirectUri;
        }
        return await cachedPca.acquireTokenInteractive({
            openBrowser: async (url) => { await vscode_1.env.openExternal(vscode_1.Uri.parse(url)); },
            scopes,
            authority,
            successTemplate: loopbackTemplate_1.loopbackTemplate,
            errorTemplate: loopbackTemplate_1.loopbackTemplate,
            loginHint,
            prompt: loginHint ? undefined : 'select_account',
            windowHandle,
            claims,
            resource,
            redirectUri,
            responseMode: 'form_post'
        });
    }
}
class UrlHandlerFlow {
    label = 'protocol handler';
    options = {
        supportsRemoteExtensionHost: true,
        supportsUnsupportedClient: false,
        supportsBroker: false,
        supportsPortableMode: false
    };
    async trigger({ cachedPca, authority, scopes, claims, resource, loginHint, windowHandle, logger, uriHandler, callbackUri }) {
        logger.info('Trying protocol handler flow...');
        const loopbackClient = new loopbackClientAndOpener_1.UriHandlerLoopbackClient(uriHandler, DEFAULT_REDIRECT_URI, callbackUri, logger);
        let redirectUri;
        if (cachedPca.isBrokerAvailable && process.platform === 'darwin') {
            redirectUri = config_1.Config.macOSBrokerRedirectUri;
        }
        return await cachedPca.acquireTokenInteractive({
            openBrowser: (url) => loopbackClient.openBrowser(url),
            scopes,
            authority,
            loopbackClient,
            loginHint,
            prompt: loginHint ? undefined : 'select_account',
            windowHandle,
            claims,
            resource,
            redirectUri,
            responseMode: 'form_post'
        });
    }
}
class DeviceCodeFlow {
    label = 'device code';
    options = {
        supportsRemoteExtensionHost: true,
        supportsUnsupportedClient: true,
        supportsBroker: false,
        supportsPortableMode: true
    };
    async trigger({ cachedPca, authority, scopes, claims, resource, logger }) {
        logger.info('Trying device code flow...');
        const result = await cachedPca.acquireTokenByDeviceCode({ scopes, authority, claims, resource });
        if (!result) {
            throw new Error('Device code flow did not return a result');
        }
        return result;
    }
}
exports.allFlows = [
    new DefaultLoopbackFlow(),
    new UrlHandlerFlow(),
    new DeviceCodeFlow()
];
function getMsalFlows(query) {
    const flows = [];
    for (const flow of exports.allFlows) {
        let useFlow = true;
        if (query.extensionHost === 0 /* ExtensionHost.Remote */) {
            useFlow &&= flow.options.supportsRemoteExtensionHost;
        }
        useFlow &&= flow.options.supportsBroker || !query.isBrokerSupported;
        useFlow &&= flow.options.supportsUnsupportedClient || query.supportedClient;
        useFlow &&= flow.options.supportsPortableMode || !query.isPortableMode;
        if (useFlow) {
            flows.push(flow);
        }
    }
    return flows;
}
//# sourceMappingURL=flows.js.map