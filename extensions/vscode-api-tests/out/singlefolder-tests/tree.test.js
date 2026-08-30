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
const utils_1 = require("../utils");
suite('vscode API - tree', () => {
    const disposables = [];
    teardown(() => {
        (0, utils_1.disposeAll)(disposables);
        disposables.length = 0;
        (0, utils_1.assertNoRpc)();
    });
    test('TreeView - element already registered', async function () {
        this.timeout(60_000);
        class QuickRefreshTreeDataProvider {
            changeEmitter = new vscode.EventEmitter();
            requestEmitter = new vscode.EventEmitter();
            pendingRequests = [];
            element = { kind: 'leaf' };
            onDidChangeTreeData = this.changeEmitter.event;
            getChildren(element) {
                if (!element) {
                    const deferred = new utils_1.DeferredPromise();
                    this.pendingRequests.push(deferred);
                    this.requestEmitter.fire(this.pendingRequests.length);
                    return deferred.p;
                }
                return Promise.resolve([]);
            }
            getTreeItem() {
                const item = new vscode.TreeItem('duplicate', vscode.TreeItemCollapsibleState.None);
                item.id = 'dup';
                return item;
            }
            getParent() {
                return undefined;
            }
            async waitForRequestCount(count) {
                while (this.pendingRequests.length < count) {
                    await (0, utils_1.asPromise)(this.requestEmitter.event);
                }
            }
            async resolveNextRequest() {
                const next = this.pendingRequests.shift();
                if (!next) {
                    return;
                }
                await next.complete([this.element]);
            }
            dispose() {
                this.changeEmitter.dispose();
                this.requestEmitter.dispose();
                while (this.pendingRequests.length) {
                    this.pendingRequests.shift().complete([]);
                }
            }
            getElement() {
                return this.element;
            }
        }
        const provider = new QuickRefreshTreeDataProvider();
        disposables.push(provider);
        const treeView = vscode.window.createTreeView('test.treeId', { treeDataProvider: provider });
        disposables.push(treeView);
        const revealFirst = treeView.reveal(provider.getElement(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        const revealSecond = treeView.reveal(provider.getElement(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        await provider.waitForRequestCount(2);
        await provider.resolveNextRequest();
        await (0, utils_1.delay)(0);
        await provider.resolveNextRequest();
        const [firstResult, secondResult] = await Promise.all([revealFirst, revealSecond]);
        // Two concurrent root fetches race: the stale one gets invalidated and
        // its reveal fails with "Cannot resolve". The other succeeds.
        const errors = [firstResult.error, secondResult.error].filter((e) => !!e);
        assert.strictEqual(errors.length, 1, 'Exactly one reveal should fail from the stale fetch');
        assert.ok(/Cannot resolve tree item/.test(errors[0].message), `Expected "Cannot resolve" error but got: ${errors[0].message}`);
    });
    test('TreeView - element already registered after rapid root refresh', async function () {
        this.timeout(60_000);
        class RapidRefreshTreeDataProvider {
            changeEmitter = new vscode.EventEmitter();
            requestEmitter = new vscode.EventEmitter();
            pendingRequests = [];
            // Return different element instance each time
            element1 = { kind: 'leaf', instance: 1 };
            element2 = { kind: 'leaf', instance: 2 };
            onDidChangeTreeData = this.changeEmitter.event;
            getChildren(element) {
                if (!element) {
                    const deferred = new utils_1.DeferredPromise();
                    this.pendingRequests.push(deferred);
                    this.requestEmitter.fire(this.pendingRequests.length);
                    return deferred.p;
                }
                return Promise.resolve([]);
            }
            getTreeItem() {
                // Both element instances return the same id
                const item = new vscode.TreeItem('test element', vscode.TreeItemCollapsibleState.None);
                item.id = 'same-id-each-time';
                return item;
            }
            getParent() {
                return undefined;
            }
            getElement1() {
                return this.element1;
            }
            getElement2() {
                return this.element2;
            }
            async waitForRequestCount(count) {
                while (this.pendingRequests.length < count) {
                    await (0, utils_1.asPromise)(this.requestEmitter.event);
                }
            }
            resolveRequestWithElement(index, element) {
                const request = this.pendingRequests[index];
                if (request) {
                    request.complete([element]);
                }
            }
            dispose() {
                this.changeEmitter.dispose();
                this.requestEmitter.dispose();
                while (this.pendingRequests.length) {
                    this.pendingRequests.shift().complete([]);
                }
            }
        }
        const provider = new RapidRefreshTreeDataProvider();
        disposables.push(provider);
        const treeView = vscode.window.createTreeView('test.treeRapidRefresh', { treeDataProvider: provider });
        disposables.push(treeView);
        // Start two concurrent reveal operations - this should trigger two getChildren calls
        // Similar to the first test
        const firstReveal = treeView.reveal(provider.getElement1(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        const secondReveal = treeView.reveal(provider.getElement2(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        // Wait for both getChildren calls to be pending
        await provider.waitForRequestCount(2);
        // Resolve requests returning DIFFERENT element instances with SAME id
        // First request returns element1, second returns element2
        // Both elements have the same id 'same-id-each-time' in getTreeItem
        provider.resolveRequestWithElement(0, provider.getElement1());
        await (0, utils_1.delay)(0);
        provider.resolveRequestWithElement(1, provider.getElement2());
        const [firstResult, secondResult] = await Promise.all([firstReveal, secondReveal]);
        const errors = [firstResult.error, secondResult.error].filter((e) => !!e);
        assert.strictEqual(errors.length, 1, 'Exactly one reveal should fail from the stale fetch');
        assert.ok(/Cannot resolve tree item/.test(errors[0].message), `Expected "Cannot resolve" error but got: ${errors[0].message}`);
    });
    test('TreeView - element already registered during switch and update', async function () {
        this.timeout(60_000);
        class SwitchAndUpdateTreeDataProvider {
            changeEmitter = new vscode.EventEmitter();
            requestEmitter = new vscode.EventEmitter();
            pendingRequests = [];
            existingOld = { kind: 'leaf', instance: 1 };
            existingNew = { kind: 'leaf', instance: 2 };
            addedElement = { kind: 'leaf', instance: 3 };
            onDidChangeTreeData = this.changeEmitter.event;
            getChildren(element) {
                if (!element) {
                    const deferred = new utils_1.DeferredPromise();
                    this.pendingRequests.push(deferred);
                    this.requestEmitter.fire(this.pendingRequests.length);
                    return deferred.p;
                }
                return Promise.resolve([]);
            }
            getTreeItem(element) {
                if (element === this.addedElement) {
                    const item = new vscode.TreeItem('added', vscode.TreeItemCollapsibleState.None);
                    item.id = 'added-elem';
                    return item;
                }
                const item = new vscode.TreeItem('existing', vscode.TreeItemCollapsibleState.None);
                item.id = 'existing-elem';
                return item;
            }
            getParent() {
                return undefined;
            }
            async waitForRequestCount(count) {
                while (this.pendingRequests.length < count) {
                    await (0, utils_1.asPromise)(this.requestEmitter.event);
                }
            }
            resolveRequestAt(index, elements) {
                const request = this.pendingRequests[index];
                if (request) {
                    request.complete(elements);
                }
            }
            getExistingOld() { return this.existingOld; }
            getExistingNew() { return this.existingNew; }
            getAddedElement() { return this.addedElement; }
            dispose() {
                this.changeEmitter.dispose();
                this.requestEmitter.dispose();
                while (this.pendingRequests.length) {
                    this.pendingRequests.shift().complete([]);
                }
            }
        }
        const provider = new SwitchAndUpdateTreeDataProvider();
        disposables.push(provider);
        const treeView = vscode.window.createTreeView('test.treeSwitchUpdate', { treeDataProvider: provider });
        disposables.push(treeView);
        // Two concurrent reveals simulate the tree being "switched to" while also
        // being updated: both trigger getChildren calls on the ext host directly.
        const revealFirst = treeView.reveal(provider.getExistingOld(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        const revealSecond = treeView.reveal(provider.getExistingNew(), { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        // Wait for both getChildren calls to be pending
        await provider.waitForRequestCount(2);
        // Resolve first request with old data (just the existing element, old instance)
        provider.resolveRequestAt(0, [provider.getExistingOld()]);
        await (0, utils_1.delay)(0);
        // Resolve second request with new data: different instance of existing + added element
        provider.resolveRequestAt(1, [provider.getExistingNew(), provider.getAddedElement()]);
        const [firstResult, secondResult] = await Promise.all([revealFirst, revealSecond]);
        const errors = [firstResult.error, secondResult.error].filter((e) => !!e);
        assert.strictEqual(errors.length, 1, 'Exactly one reveal should fail from the stale fetch');
        assert.ok(/Cannot resolve tree item/.test(errors[0].message), `Expected "Cannot resolve" error but got: ${errors[0].message}`);
    });
    test('TreeView - element already registered after refresh', async function () {
        this.timeout(60_000);
        class ParentRefreshTreeDataProvider {
            changeEmitter = new vscode.EventEmitter();
            rootRequestEmitter = new vscode.EventEmitter();
            childRequestEmitter = new vscode.EventEmitter();
            rootRequests = [];
            childRequests = [];
            parentElement = { kind: 'parent' };
            childVersion = 0;
            currentChild = { kind: 'leaf', version: 0 };
            onDidChangeTreeData = this.changeEmitter.event;
            getChildren(element) {
                if (!element) {
                    const deferred = new utils_1.DeferredPromise();
                    this.rootRequests.push(deferred);
                    this.rootRequestEmitter.fire(this.rootRequests.length);
                    return deferred.p;
                }
                if (element.kind === 'parent') {
                    const deferred = new utils_1.DeferredPromise();
                    this.childRequests.push(deferred);
                    this.childRequestEmitter.fire(this.childRequests.length);
                    return deferred.p;
                }
                return Promise.resolve([]);
            }
            getTreeItem(element) {
                if (element.kind === 'parent') {
                    const item = new vscode.TreeItem('parent', vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = 'parent';
                    return item;
                }
                const item = new vscode.TreeItem('duplicate', vscode.TreeItemCollapsibleState.None);
                item.id = 'dup';
                return item;
            }
            getParent(element) {
                if (element.kind === 'leaf') {
                    return this.parentElement;
                }
                return undefined;
            }
            getCurrentChild() {
                return this.currentChild;
            }
            replaceChild() {
                this.childVersion++;
                this.currentChild = { kind: 'leaf', version: this.childVersion };
                return this.currentChild;
            }
            async waitForRootRequestCount(count) {
                while (this.rootRequests.length < count) {
                    await (0, utils_1.asPromise)(this.rootRequestEmitter.event);
                }
            }
            async waitForChildRequestCount(count) {
                while (this.childRequests.length < count) {
                    await (0, utils_1.asPromise)(this.childRequestEmitter.event);
                }
            }
            async resolveNextRootRequest(elements) {
                const next = this.rootRequests.shift();
                if (!next) {
                    return;
                }
                await next.complete(elements ?? [this.parentElement]);
            }
            async resolveChildRequestAt(index, elements) {
                const request = this.childRequests[index];
                if (!request) {
                    return;
                }
                this.childRequests.splice(index, 1);
                await request.complete(elements ?? [this.currentChild]);
            }
            dispose() {
                this.changeEmitter.dispose();
                this.rootRequestEmitter.dispose();
                this.childRequestEmitter.dispose();
                while (this.rootRequests.length) {
                    this.rootRequests.shift().complete([]);
                }
                while (this.childRequests.length) {
                    this.childRequests.shift().complete([]);
                }
            }
        }
        const provider = new ParentRefreshTreeDataProvider();
        disposables.push(provider);
        const treeView = vscode.window.createTreeView('test.treeRefresh', { treeDataProvider: provider });
        disposables.push(treeView);
        const initialChild = provider.getCurrentChild();
        const firstReveal = treeView.reveal(initialChild, { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        await provider.waitForRootRequestCount(1);
        await provider.resolveNextRootRequest();
        await provider.waitForChildRequestCount(1);
        const staleChild = provider.getCurrentChild();
        const refreshedChild = provider.replaceChild();
        const secondReveal = treeView.reveal(refreshedChild, { expand: true })
            .then(() => ({ error: undefined }))
            .catch(error => ({ error }));
        await provider.waitForChildRequestCount(2);
        await provider.resolveChildRequestAt(1, [refreshedChild]);
        await (0, utils_1.delay)(0);
        await provider.resolveChildRequestAt(0, [staleChild]);
        const [firstResult, secondResult] = await Promise.all([firstReveal, secondReveal]);
        assert.strictEqual(firstResult.error, undefined, `First reveal should not fail: ${firstResult.error?.message}`);
        assert.strictEqual(secondResult.error, undefined, `Second reveal should not fail: ${secondResult.error?.message}`);
    });
});
//# sourceMappingURL=tree.test.js.map