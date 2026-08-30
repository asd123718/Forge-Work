"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const path_1 = require("path");
require("mocha");
const vscode_1 = require("vscode");
const utils_1 = require("../utils");
// TODO: this now became flaky with built-in copilot
suite('chat', () => {
    let disposables = [];
    setup(() => {
        disposables = [];
        // Register a dummy default model which is required for a participant request to go through
        disposables.push(vscode_1.lm.registerLanguageModelChatProvider('copilot', {
            async provideLanguageModelChatInformation(_options, _token) {
                return [{
                        id: 'test-lm',
                        name: 'test-lm',
                        family: 'test',
                        version: '1.0.0',
                        maxInputTokens: 100,
                        maxOutputTokens: 100,
                        isDefault: true,
                        isUserSelectable: true,
                        capabilities: {}
                    }];
            },
            async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
                return undefined;
            },
            async provideTokenCount(_model, _text, _token) {
                return 1;
            },
        }));
    });
    teardown(async function () {
        (0, utils_1.assertNoRpc)();
        await (0, utils_1.closeAllEditors)();
        (0, utils_1.disposeAll)(disposables);
    });
    function setupParticipant(second) {
        const emitter = new vscode_1.EventEmitter();
        disposables.push(emitter);
        const id = second ? 'api-test.participant2' : 'api-test.participant';
        const participant = vscode_1.chat.createChatParticipant(id, (request, context, _progress, _token) => {
            emitter.fire({ request, context });
        });
        disposables.push(participant);
        return emitter.event;
    }
    // Chat participants are a Local-harness feature, but the panel defaults to
    // Agent Host Copilot when the agent host is enabled. `newLocalChat` opens the
    // view directly into a Local session (from cold), so these tests run it first.
    test('participant and slash command history', async () => {
        const onRequest = setupParticipant();
        await vscode_1.commands.executeCommand('workbench.action.chat.newLocalChat');
        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
        const deferred = new utils_1.DeferredPromise();
        let i = 0;
        disposables.push(onRequest(request => {
            try {
                if (i === 0) {
                    assert.deepStrictEqual(request.request.command, 'hello');
                    assert.strictEqual(request.request.prompt, 'friend');
                    i++;
                    setTimeout(() => {
                        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
                    }, 0);
                }
                else {
                    assert.strictEqual(request.context.history.length, 2);
                    assert.strictEqual(request.context.history[0].participant, 'api-test.participant');
                    assert.strictEqual(request.context.history[0].command, 'hello');
                    assert.ok(request.context.history[0] instanceof vscode_1.ChatRequestTurn && request.context.history[0] instanceof vscode_1.ChatRequestTurn2);
                    deferred.complete();
                }
            }
            catch (e) {
                deferred.error(e);
            }
        }));
        await deferred.p;
    });
    test('result metadata is returned to the followup provider', async () => {
        const deferred = new utils_1.DeferredPromise();
        const participant = vscode_1.chat.createChatParticipant('api-test.participant', (_request, _context, _progress, _token) => {
            return { metadata: { key: 'value' } };
        });
        participant.followupProvider = {
            provideFollowups(result, _context, _token) {
                deferred.complete(result);
                return [];
            },
        };
        disposables.push(participant);
        // Participants are Local-only; open a Local chat first (see note above).
        await vscode_1.commands.executeCommand('workbench.action.chat.newLocalChat');
        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
        const result = await deferred.p;
        assert.deepStrictEqual(result.metadata, { key: 'value' });
    });
    test('isolated participant history', async () => {
        const onRequest = setupParticipant();
        const onRequest2 = setupParticipant(true);
        // Participants are Local-only; open a Local chat first (see note above).
        await vscode_1.commands.executeCommand('workbench.action.chat.newLocalChat');
        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant hi' });
        await (0, utils_1.asPromise)(onRequest);
        // Request is still being handled at this point, wait for it to end
        setTimeout(() => {
            vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant2 hi' });
        }, 0);
        const request2 = await (0, utils_1.asPromise)(onRequest2);
        assert.strictEqual(request2.context.history.length, 0);
        setTimeout(() => {
            vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant2 hi' });
        }, 0);
        const request3 = await (0, utils_1.asPromise)(onRequest2);
        assert.strictEqual(request3.context.history.length, 2); // request + response = 2
    });
    // fixme(rwoll): workbench.action.chat.open.blockOnResponse tests are flaking in CI:
    //               * https://github.com/microsoft/vscode/issues/263572
    //               * https://github.com/microsoft/vscode/issues/263575
    test.skip('workbench.action.chat.open.blockOnResponse defaults to non-blocking for backwards compatibility', async () => {
        const toolRegistration = vscode_1.lm.registerTool('requires_confirmation_tool', {
            invoke: async (_options, _token) => null, prepareInvocation: async (_options, _token) => {
                return { invocationMessage: 'Invoking', pastTenseMessage: 'Invoked', confirmationMessages: { title: 'Confirm', message: 'Are you sure?' } };
            }
        });
        const participant = vscode_1.chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
            await vscode_1.lm.invokeTool('requires_confirmation_tool', {
                input: {},
                toolInvocationToken: _request.toolInvocationToken,
            });
            return { metadata: { complete: true } };
        });
        disposables.push(participant, toolRegistration);
        await vscode_1.commands.executeCommand('workbench.action.chat.newChat');
        const result = await vscode_1.commands.executeCommand('workbench.action.chat.open', { query: 'hello' });
        assert.strictEqual(result, undefined);
    });
    test.skip('workbench.action.chat.open.blockOnResponse resolves when waiting for user confirmation to run a tool', async () => {
        const toolRegistration = vscode_1.lm.registerTool('requires_confirmation_tool', {
            invoke: async (_options, _token) => null, prepareInvocation: async (_options, _token) => {
                return { invocationMessage: 'Invoking', pastTenseMessage: 'Invoked', confirmationMessages: { title: 'Confirm', message: 'Are you sure?' } };
            }
        });
        const participant = vscode_1.chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
            await vscode_1.lm.invokeTool('requires_confirmation_tool', {
                input: {},
                toolInvocationToken: _request.toolInvocationToken,
            });
            return { metadata: { complete: true } };
        });
        disposables.push(participant, toolRegistration);
        await vscode_1.commands.executeCommand('workbench.action.chat.newChat');
        const result = await vscode_1.commands.executeCommand('workbench.action.chat.open', { query: 'hello', blockOnResponse: true });
        assert.strictEqual(result?.type, 'confirmation');
    });
    test.skip('workbench.action.chat.open.blockOnResponse resolves when an error is hit', async () => {
        const participant = vscode_1.chat.createChatParticipant('api-test.participant', async (_request, _context, _progress, _token) => {
            return { errorDetails: { code: 'rate_limited', message: `You've been rate limited. Try again later!` } };
        });
        disposables.push(participant);
        await vscode_1.commands.executeCommand('workbench.action.chat.newChat');
        const result = await vscode_1.commands.executeCommand('workbench.action.chat.open', { query: 'hello', blockOnResponse: true });
        assert.strictEqual(result.errorDetails.code, 'rate_limited');
    });
    test('title provider is called for first request', async () => {
        let calls = 0;
        const deferred = new utils_1.DeferredPromise();
        const participant = vscode_1.chat.createChatParticipant('api-test.participant', (_request, _context, _progress, _token) => {
            return { metadata: { key: 'value' } };
        });
        participant.titleProvider = {
            provideChatTitle(_context, _token) {
                calls++;
                deferred.complete();
                return 'title';
            }
        };
        disposables.push(participant);
        // Participants are Local-only; open a Local chat first (see note above).
        await vscode_1.commands.executeCommand('workbench.action.chat.newLocalChat');
        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
        // Wait for title provider to be called once
        await deferred.p;
        assert.strictEqual(calls, 1);
        vscode_1.commands.executeCommand('workbench.action.chat.open', { query: '@participant /hello friend' });
        await (0, utils_1.delay)(500);
        // Title provider was not called again
        assert.strictEqual(calls, 1);
    });
    test('can access node-pty module', async function () {
        // Required for copilot cli in chat extension.
        if (vscode_1.env.uiKind === vscode_1.UIKind.Web) {
            this.skip();
        }
        const nodePtyModules = [
            (0, path_1.join)(vscode_1.env.appRoot, 'node_modules.asar', 'node-pty'),
            (0, path_1.join)(vscode_1.env.appRoot, 'node_modules', 'node-pty')
        ];
        for (const modulePath of nodePtyModules) {
            // try to stat and require module
            try {
                await fs.promises.stat(modulePath);
                const nodePty = require(modulePath);
                assert.ok(nodePty, `Successfully required node-pty from ${modulePath}`);
                return;
            }
            catch (err) {
                // failed to require, try next
            }
        }
        assert.fail('Failed to find and require node-pty module');
    });
});
//# sourceMappingURL=chat.test.js.map