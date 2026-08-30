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
require("mocha");
const vscode = __importStar(require("vscode"));
suite('vscode API - env.power', () => {
    test('isOnBatteryPower returns a boolean', async () => {
        const result = await vscode.env.power.isOnBatteryPower();
        assert.strictEqual(typeof result, 'boolean');
    });
    test('getSystemIdleState returns valid state', async () => {
        const state = await vscode.env.power.getSystemIdleState(60);
        assert.ok(['active', 'idle', 'locked', 'unknown'].includes(state));
    });
    test('getSystemIdleTime returns a number', async () => {
        const idleTime = await vscode.env.power.getSystemIdleTime();
        assert.strictEqual(typeof idleTime, 'number');
        assert.ok(idleTime >= 0);
    });
    test('getCurrentThermalState returns valid state', async () => {
        const state = await vscode.env.power.getCurrentThermalState();
        assert.ok(['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(state));
    });
    test('power save blocker can be started and disposed', async () => {
        const blocker = await vscode.env.power.startPowerSaveBlocker('prevent-app-suspension');
        assert.strictEqual(typeof blocker.id, 'number');
        // Power save blocker is not supported in browser (id === -1), so isStarted will be false
        const isSupported = blocker.id >= 0;
        assert.strictEqual(blocker.isStarted, isSupported);
        blocker.dispose();
        assert.strictEqual(blocker.isStarted, false);
    });
    test('power save blocker with prevent-display-sleep type', async () => {
        const blocker = await vscode.env.power.startPowerSaveBlocker('prevent-display-sleep');
        assert.strictEqual(typeof blocker.id, 'number');
        // Power save blocker is not supported in browser (id === -1), so isStarted will be false
        const isSupported = blocker.id >= 0;
        assert.strictEqual(blocker.isStarted, isSupported);
        blocker.dispose();
        assert.strictEqual(blocker.isStarted, false);
    });
    test('events are defined', () => {
        assert.ok(vscode.env.power.onDidSuspend);
        assert.ok(vscode.env.power.onDidResume);
        assert.ok(vscode.env.power.onDidChangeOnBatteryPower);
        assert.ok(vscode.env.power.onDidChangeThermalState);
        assert.ok(vscode.env.power.onDidChangeSpeedLimit);
        assert.ok(vscode.env.power.onWillShutdown);
        assert.ok(vscode.env.power.onDidLockScreen);
        assert.ok(vscode.env.power.onDidUnlockScreen);
    });
    test('event listeners can be registered and disposed', () => {
        const disposables = [];
        disposables.push(vscode.env.power.onDidSuspend(() => { }));
        disposables.push(vscode.env.power.onDidResume(() => { }));
        disposables.push(vscode.env.power.onDidChangeOnBatteryPower(() => { }));
        disposables.push(vscode.env.power.onDidChangeThermalState(() => { }));
        disposables.push(vscode.env.power.onDidChangeSpeedLimit(() => { }));
        disposables.push(vscode.env.power.onWillShutdown(() => { }));
        disposables.push(vscode.env.power.onDidLockScreen(() => { }));
        disposables.push(vscode.env.power.onDidUnlockScreen(() => { }));
        // Dispose all listeners
        disposables.forEach(d => d.dispose());
    });
});
//# sourceMappingURL=env.power.test.js.map