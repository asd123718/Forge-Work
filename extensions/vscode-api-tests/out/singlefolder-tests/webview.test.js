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
const promises_1 = require("fs/promises");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const utils_1 = require("../utils");
suite('vscode API - webview', () => {
    const disposables = [];
    const webviewViewType = 'webview-resource-load-test';
    const resourceCount = 625;
    const resourceSize = 128 * 1024;
    suiteSetup(async () => {
        await vscode.extensions.getExtension('vscode.vscode-api-tests')?.activate();
    });
    teardown(() => {
        vscode.Disposable.from(...disposables).dispose();
        disposables.length = 0;
    });
    test('loads many local resources concurrently without crashing', async function () {
        if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
            this.skip();
        }
        const timeout = 60_000;
        this.timeout(timeout);
        const tempDir = await (0, promises_1.mkdtemp)(path.join(os.tmpdir(), 'vscode-webview-resource-load-'));
        try {
            const panel = vscode.window.createWebviewPanel(webviewViewType, 'Webview Resource Load Test', vscode.ViewColumn.Active, {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(tempDir)],
            });
            disposables.push(panel);
            const didDispose = (0, utils_1.asPromise)(panel.onDidDispose, timeout);
            const didReceiveMessage = new Promise((resolve, reject) => {
                disposables.push(panel.webview.onDidReceiveMessage(message => {
                    if (message?.type === 'done') {
                        resolve(message);
                    }
                    else if (message?.type === 'error') {
                        reject(new Error(message.message));
                    }
                }));
            });
            const expectedTotalBytes = resourceCount * resourceSize;
            const resources = [];
            for (let index = 0; index < resourceCount; index++) {
                const filePath = path.join(tempDir, `resource-${index}.bin`);
                await (0, promises_1.writeFile)(filePath, Buffer.alloc(resourceSize, index));
                resources.push(panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString());
            }
            const nonce = String(Date.now());
            panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
</head>
<body>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const resources = ${JSON.stringify(resources)};
		const loadResources = async () => {
			try {
				const lengths = await Promise.all(resources.map(async resource => {
					const response = await fetch(resource);
					if (!response.ok) {
						throw new Error(\`Unexpected status \${response.status} for \${resource}\`);
					}
					const bytes = await response.arrayBuffer();
					return bytes.byteLength;
				}));
				vscode.postMessage({
					type: 'done',
					count: lengths.length,
					totalBytes: lengths.reduce((total, value) => total + value, 0),
				});
			} catch (error) {
				vscode.postMessage({
					type: 'error',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		};
		window.addEventListener('error', event => {
			vscode.postMessage({ type: 'error', message: event.message });
		});
		window.addEventListener('unhandledrejection', event => {
			const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
			vscode.postMessage({ type: 'error', message: reason });
		});
		void loadResources();
	</script>
</body>
</html>`;
            const result = await Promise.race([
                didReceiveMessage,
                didDispose.then(() => Promise.reject(new Error('Webview disposed before resources finished loading'))),
            ]);
            assert.deepStrictEqual(result, {
                type: 'done',
                count: resourceCount,
                totalBytes: expectedTotalBytes,
            });
        }
        finally {
            await (0, promises_1.rm)(tempDir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=webview.test.js.map