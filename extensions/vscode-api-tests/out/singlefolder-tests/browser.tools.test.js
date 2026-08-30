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
const path = __importStar(require("path"));
require("mocha");
const vscode = __importStar(require("vscode"));
const utils_1 = require("../utils");
/**
 * Extracts all text content from a LanguageModelToolResult.
 */
function extractTextContent(result) {
    return result.content
        .filter((c) => c instanceof vscode.LanguageModelTextPart)
        .map(c => c.value)
        .join('\n');
}
(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('chat - browser tools', () => {
    let clearNotificationsInterval;
    setup(async () => {
        // Periodically clear notifications to prevent them from interrupting the browser.
        clearNotificationsInterval = setInterval(() => {
            vscode.commands.executeCommand('notifications.clearAll');
        }, 500);
        // Enable browser chat tools
        const browserConfig = vscode.workspace.getConfiguration('workbench.browser');
        await browserConfig.update('enableChatTools', true, vscode.ConfigurationTarget.Global);
        // Enable global auto-approve + skip the confirmation dialog via test-mode context key
        const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
        await chatToolsConfig.update('autoApprove', true, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', true);
    });
    teardown(async function () {
        if (clearNotificationsInterval) {
            clearInterval(clearNotificationsInterval);
            clearNotificationsInterval = undefined;
        }
        (0, utils_1.assertNoRpc)();
        await (0, utils_1.closeAllEditors)();
        const browserConfig = vscode.workspace.getConfiguration('workbench.browser');
        await browserConfig.update('enableChatTools', undefined, vscode.ConfigurationTarget.Global);
        const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
        await chatToolsConfig.update('autoApprove', undefined, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', undefined);
    });
    async function invokeTool(toolName, input) {
        const result = await vscode.lm.invokeTool(toolName, {
            input,
            toolInvocationToken: undefined,
        });
        return extractTextContent(result);
    }
    test('open_browser_page tool is registered', async function () {
        this.timeout(15000);
        let tool;
        for (let i = 0; i < 50; i++) {
            tool = vscode.lm.tools.find(t => t.name === 'open_browser_page');
            if (tool) {
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        assert.ok(tool, 'open_browser_page tool should be registered');
        assert.ok(tool.inputSchema, 'Tool should have an input schema');
        const schema = tool.inputSchema;
        assert.ok(schema.properties?.['url'], 'Schema should have a url property');
    });
    test('open_browser_page opens a browser tab and returns a page ID', async function () {
        this.timeout(60000);
        const output = await invokeTool('open_browser_page', { url: 'about:blank' });
        assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
    });
    test('list_browser_pages returns pages opened through the browser tools', async function () {
        this.timeout(60000);
        const openOutput = await invokeTool('open_browser_page', { url: 'about:blank', forceNew: true });
        const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
        assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);
        const listOutput = await invokeTool('list_browser_pages', {});
        assert.match(listOutput, new RegExp(`^- \\[${pageId}\\]`, 'm'), `Expected list output to contain page ID "${pageId}", got: ${listOutput}`);
    });
    test('Open a page from the web', async function () {
        this.timeout(60000);
        const output = await invokeTool('open_browser_page', { url: 'https://google.com/' });
        assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
    });
    // Loads `file:///<workspaceFolder>/index.html`. Skipped in remote
    // workspaces: the workspace folder is a `vscode-remote://` URI so it
    // isn't added to the local `file://` trust allowlist.
    (vscode.env.remoteName ? test.skip : test)('basic browser tool interactions', async function () {
        this.timeout(60000);
        // Build a file:// URL to the test workspace's index.html
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Expected a workspace folder');
        const indexHtmlPath = path.join(workspaceFolders[0].uri.fsPath, 'index.html');
        const fileUrl = vscode.Uri.file(indexHtmlPath).toString();
        // Open the page
        const openOutput = await invokeTool('open_browser_page', { url: fileUrl });
        assert.match(openOutput, /Page ID:/, `Expected open output to contain "Page ID:", got: ${openOutput}`);
        // Extract the page ID from the output
        const pageIdMatch = openOutput.match(/Page ID:\s*(\S+)/);
        assert.ok(pageIdMatch, `Could not extract Page ID from: ${openOutput}`);
        const pageId = pageIdMatch[1];
        // Type a message into the input field
        const typeOutput = await invokeTool('type_in_page', {
            pageId,
            text: 'test message',
            selector: '#msgInput',
            element: 'message input',
        });
        assert.ok(typeOutput, 'Expected type output');
        // Click the "Send Message" button
        const clickOutput = await invokeTool('click_element', {
            pageId,
            selector: '#sendBtn',
            element: 'Send Message button',
        });
        assert.ok(clickOutput, 'Expected click output');
        // Wait for the worker to process the message and update the page
        const runOutput = await invokeTool('run_playwright_code', {
            pageId,
            code: `await page.waitForSelector('#output:text-is("test message")'); return "done";`,
        });
        assert.match(runOutput, /Result: "done"/, `Expected run_playwright_code output to contain result "done", got: ${runOutput}`);
        // Read the page to verify the output element was populated
        const readOutput = await invokeTool('read_page', { pageId });
        assert.ok(readOutput.includes('test message'), `Expected page to contain worker response "test message", got: ${readOutput}`);
    });
});
//# sourceMappingURL=browser.tools.test.js.map