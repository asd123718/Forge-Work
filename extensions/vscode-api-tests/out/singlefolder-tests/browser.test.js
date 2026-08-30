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
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const vscode_1 = require("vscode");
const utils_1 = require("../utils");
(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - browser', () => {
    teardown(async function () {
        (0, utils_1.assertNoRpc)();
        await (0, utils_1.closeAllEditors)();
    });
    // #region window.browserTabs / activeBrowserTab
    test('browserTabs is an array', () => {
        assert.ok(Array.isArray(vscode_1.window.browserTabs));
    });
    test('activeBrowserTab is undefined when no browser tab is open', () => {
        assert.strictEqual(vscode_1.window.activeBrowserTab, undefined);
    });
    // #endregion
    // #region openBrowserTab
    test('openBrowserTab returns a BrowserTab with url, title, and icon', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        assert.ok(tab);
        assert.strictEqual(tab.url, 'about:blank');
        assert.ok(tab.title);
        assert.ok(tab.icon);
    });
    test('openBrowserTab adds tab to browserTabs', async () => {
        const before = vscode_1.window.browserTabs.length;
        await vscode_1.window.openBrowserTab('about:blank');
        assert.strictEqual(vscode_1.window.browserTabs.length, before + 1);
    });
    test('openBrowserTab with viewColumn.Beside', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank', { viewColumn: vscode_1.ViewColumn.Beside });
        assert.ok(tab);
        assert.strictEqual(tab.url, 'about:blank');
    });
    test('openBrowserTab with preserveFocus', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank', { preserveFocus: true });
        assert.ok(tab);
    });
    test('openBrowserTab with background', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank', { background: true });
        assert.ok(tab);
    });
    // #endregion
    // #region BrowserTab.close
    test('BrowserTab.close removes the tab from browserTabs', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const countBefore = vscode_1.window.browserTabs.length;
        await tab.close();
        assert.strictEqual(vscode_1.window.browserTabs.length, countBefore - 1);
    });
    test('Closing via workbench.action.closeActiveEditor removes tab from browserTabs', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        assert.ok(vscode_1.window.browserTabs.includes(tab));
        const closed = new Promise(resolve => {
            const disposable = vscode_1.window.onDidCloseBrowserTab(t => {
                disposable.dispose();
                resolve(t);
            });
        });
        await vscode_1.commands.executeCommand('workbench.action.closeActiveEditor');
        const firedTab = await closed;
        assert.ok(firedTab);
        assert.ok(!vscode_1.window.browserTabs.includes(tab));
    });
    test('Can move a browser tab to a new group and close it successfully', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        assert.ok(vscode_1.window.browserTabs.includes(tab));
        await vscode_1.commands.executeCommand('workbench.action.moveEditorToNextGroup');
        await tab.close();
        assert.ok(!vscode_1.window.browserTabs.includes(tab));
    });
    // #endregion
    // #region onDidOpenBrowserTab
    test('onDidOpenBrowserTab fires when a tab is opened', async () => {
        const opened = new Promise(resolve => {
            const disposable = vscode_1.window.onDidOpenBrowserTab(tab => {
                disposable.dispose();
                resolve(tab);
            });
        });
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const firedTab = await opened;
        assert.strictEqual(firedTab.url, tab.url);
    });
    // #endregion
    // #region onDidCloseBrowserTab
    test('onDidCloseBrowserTab fires when a tab is closed', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const closed = new Promise(resolve => {
            const disposable = vscode_1.window.onDidCloseBrowserTab(t => {
                disposable.dispose();
                resolve(t);
            });
        });
        await tab.close();
        const firedTab = await closed;
        assert.ok(firedTab);
    });
    // #endregion
    // #region activeBrowserTab / onDidChangeActiveBrowserTab
    test('activeBrowserTab is set after opening a tab', async () => {
        await vscode_1.window.openBrowserTab('about:blank');
        assert.ok(vscode_1.window.activeBrowserTab);
    });
    test('onDidChangeActiveBrowserTab fires when active tab changes', async () => {
        const changed = new Promise(resolve => {
            const disposable = vscode_1.window.onDidChangeActiveBrowserTab(tab => {
                disposable.dispose();
                resolve(tab);
            });
        });
        await vscode_1.window.openBrowserTab('about:blank');
        const activeTab = await changed;
        assert.ok(activeTab);
    });
    // #endregion
    // #region CDP sessions
    test('startCDPSession returns a session with expected API', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const session = await tab.startCDPSession();
        assert.ok(session);
        assert.ok(session.onDidReceiveMessage);
        assert.ok(session.onDidClose);
        assert.ok(typeof session.sendMessage === 'function');
        assert.ok(typeof session.close === 'function');
        await session.close();
    });
    test('CDP sendMessage and onDidReceiveMessage round-trip', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const session = await tab.startCDPSession();
        const response = new Promise(resolve => {
            const disposable = session.onDidReceiveMessage((msg) => {
                if (msg.id === 1) {
                    disposable.dispose();
                    resolve(msg);
                }
            });
        });
        await session.sendMessage({ id: 1, method: 'Target.getTargets' });
        const msg = await response;
        assert.ok(msg.result);
        const targets = msg.result.targetInfos;
        assert.equal(targets.length, 1);
        assert.equal(targets[0].url, 'about:blank');
        await session.close();
    });
    test('CDP session.close fires onDidClose', async () => {
        const tab = await vscode_1.window.openBrowserTab('about:blank');
        const session = await tab.startCDPSession();
        const closed = new Promise(resolve => {
            const disposable = session.onDidClose(() => {
                disposable.dispose();
                resolve();
            });
        });
        await session.close();
        await closed;
    });
    // #endregion
    // #region trusted file:// loading
    //
    // Trust enforcement is exercised by writing a small harness HTML file
    // into the (trusted) workspace folder, opening it in a browser tab, and
    // letting it `fetch(?url=...)` whatever URL the test targets. The
    // harness writes `status:<code>` (or `error:<msg>`) to `document.title`,
    // which we observe via `tab.title`. The harness file itself is created
    // at test time so it doesn't pollute the shared test workspace.
    //
    // Skipped in remote workspaces: the test workspace lives on the remote
    // machine, so the locally-pushed trust list doesn't include its
    // folders and the harness page itself would be blocked.
    (vscode.env.remoteName ? suite.skip : suite)('trusted file:// loading', () => {
        const HARNESS_NAME = 'trust-harness.html';
        const HARNESS_CONTENT = `<!DOCTYPE html>
<html>
<head><title>idle</title></head>
<body>
<script>
(async function () {
	// Use the URL fragment rather than the query string — Chromium's
	// built-in \`file://\` loader rejects URLs with a \`?query\`, but
	// fragments are stripped before the file is read.
	const params = new URLSearchParams(location.hash.slice(1));
	const target = params.get('url');
	if (!target) {
		document.title = 'no-url';
		return;
	}
	try {
		const res = await fetch(target);
		document.title = 'status:' + res.status;
	} catch (err) {
		document.title = 'error:' + (err && err.message || err);
	}
})();
</script>
</body>
</html>`;
        let harnessUri;
        suiteSetup(async () => {
            const folders = vscode_1.workspace.workspaceFolders;
            assert.ok(folders && folders.length > 0, 'expected at least one workspace folder');
            harnessUri = vscode.Uri.joinPath(folders[0].uri, HARNESS_NAME);
            await fs.promises.writeFile(harnessUri.fsPath, HARNESS_CONTENT);
        });
        suiteTeardown(async () => {
            if (harnessUri) {
                await fs.promises.rm(harnessUri.fsPath, { force: true });
                harnessUri = undefined;
            }
        });
        async function fetchFromTrustedHarness(target) {
            assert.ok(harnessUri, 'harness must be initialized');
            const url = `${harnessUri.toString()}#url=${encodeURIComponent(target)}`;
            const tab = await vscode_1.window.openBrowserTab(url);
            // Poll `tab.title` for the harness's contract (`status:<n>` or
            // `error:<msg>`). The browser tab decorates the title with the
            // page URL, so callers should check by prefix.
            const deadline = Date.now() + 15_000;
            while (Date.now() < deadline) {
                if (tab.title.startsWith('status:') || tab.title.startsWith('error:')) {
                    return tab.title;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            throw new Error(`Timed out waiting for trust-harness title to update (target=${target}, last title=${tab.title})`);
        }
        test.skip('file:// inside a trusted workspace folder loads', async function () {
            this.timeout(30_000);
            const folders = vscode_1.workspace.workspaceFolders;
            const trustedTarget = vscode.Uri.joinPath(folders[0].uri, 'index.html').toString();
            const title = await fetchFromTrustedHarness(trustedTarget);
            assert.ok(title.startsWith('status:200'), `Expected status 200 for trusted file, got: ${title}`);
        });
        // Skipped: the test runner always launches with `--disable-workspace-trust`,
        // which makes the browser view trust all `file://` requests (see
        // `trustAllFiles` in `IBrowserViewWindowConfiguration`). Re-enable once the
        // test infrastructure supports running with Workspace Trust enabled.
        test.skip('file:// outside any trusted root is blocked with 403', async function () {
            this.timeout(30_000);
            const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-browser-trust-'));
            const untrustedFile = path.join(tempDir, 'untrusted.html');
            await fs.promises.writeFile(untrustedFile, '<!doctype html><body>should not be reachable</body>');
            try {
                const title = await fetchFromTrustedHarness(vscode.Uri.file(untrustedFile).toString());
                assert.ok(title.startsWith('status:403'), `Expected status 403 for untrusted file, got: ${title}`);
            }
            finally {
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            }
        });
    });
    // #endregion
});
//# sourceMappingURL=browser.test.js.map