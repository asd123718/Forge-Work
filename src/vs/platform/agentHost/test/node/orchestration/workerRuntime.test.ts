/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	deepSeekCredentialSource,
	deepSeekCredentialsPath,
	deepSeekHarnessRoots,
	findDeepSeekHarnessRoot,
	findGrokBuildBinary,
	grokBuildBinaryCandidates,
	grokCredentialSource,
	hasDeepSeekWorkerCredentials,
	hasGrokWorkerCredentials,
	isExecutablePath,
	readDeepSeekApiKeyFromCredentials,
	resolveNodeNpmCli,
	resolveSpawnCommand,
} from '../../../node/orchestration/workerRuntime.js';
import { resolveDeepSeekCommand, resolveGrokCommand } from '../../../node/orchestration/workerAdapters.js';

suite('Forge worker runtime', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('discovers harness roots under repo and user home', () => {
		const roots = deepSeekHarnessRoots('/app/resources/app');
		assert.ok(roots.some(root => root.replace(/\\/g, '/').includes('third_party/deepseek-harness')));
		assert.ok(roots.some(root => root.includes('deepseek-harness-master')));
		assert.ok(roots.some(root => root.includes('.forge')));
	});

	test('discovers grok binary candidates under repo and user home', () => {
		const roots = grokBuildBinaryCandidates('/app/resources/app');
		assert.ok(roots.some(root => root.replace(/\\/g, '/').includes('third_party/grok-build')));
		assert.ok(roots.some(root => root.includes('grok-build-main')));
		assert.ok(roots.some(root => root.includes('.forge') || root.includes('.grok')));
	});

	test('finds vendored harness and grok binary by walking up from appRoot', () => {
		const forgeRoot = mkdtempSync(join(tmpdir(), 'forge-vendor-'));
		try {
			const appRoot = join(forgeRoot, 'out');
			mkdirSync(join(forgeRoot, 'third_party', 'deepseek-harness', 'apps', 'cli', 'src'), { recursive: true });
			mkdirSync(join(forgeRoot, 'third_party', 'grok-build', 'bin'), { recursive: true });
			mkdirSync(appRoot, { recursive: true });
			writeFileSync(join(forgeRoot, 'third_party', 'deepseek-harness', 'package.json'), '{"name":"dsh"}\n', 'utf8');
			const grokBin = join(forgeRoot, 'third_party', 'grok-build', 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok');
			writeFileSync(grokBin, '', 'utf8');
			assert.strictEqual(findDeepSeekHarnessRoot(appRoot), join(forgeRoot, 'third_party', 'deepseek-harness'));
			assert.strictEqual(findGrokBuildBinary(appRoot), grokBin);
			const env = { DEEPSEEK_API_KEY: 'k', XAI_API_KEY: 'k' } as NodeJS.ProcessEnv;
			const deepseek = resolveDeepSeekCommand(appRoot, env);
			assert.ok(deepseek);
			assert.ok(deepseek.args.some(arg => arg.includes('@deepseek-ai/dsh') || arg.includes('npx') || arg.endsWith('bin.js') || arg.endsWith('bin.ts')));
			const grok = resolveGrokCommand(appRoot, env);
			assert.ok(grok);
			assert.strictEqual(grok.command, grokBin);
		} finally {
			rmSync(forgeRoot, { recursive: true, force: true });
		}
	});

	test('does not treat bare PATH names as installed executables', () => {
		assert.strictEqual(isExecutablePath('grok'), false);
		assert.strictEqual(isExecutablePath('npx'), false);
		assert.strictEqual(isExecutablePath(process.execPath), true);
	});

	test('resolves npx through node.exe instead of a Windows cmd shim', () => {
		const npx = resolveNodeNpmCli('npx');
		assert.ok(npx.command === 'npx' || npx.command === process.execPath);
		if (npx.command === process.execPath) {
			assert.ok(npx.prefixArgs.some(arg => arg.endsWith('npx-cli.js')));
		}
		const spawned = resolveSpawnCommand(process.execPath);
		assert.strictEqual(spawned.shell, false);
		assert.deepStrictEqual(spawned.prefixArgs, []);
		if (process.platform === 'win32') {
			const cmdShim = resolveSpawnCommand('npx.cmd');
			assert.strictEqual(cmdShim.shell, false);
			assert.ok(cmdShim.prefixArgs.includes('/c'));
			assert.ok(cmdShim.command.toLowerCase().includes('cmd'));
			const bare = resolveSpawnCommand('npx');
			assert.strictEqual(bare.shell, true);
			assert.notStrictEqual(bare.command, 'npx.cmd');
		}
	});

	test('reads deepseek credentials from the harness yaml file', () => {
		const home = mkdtempSync(join(tmpdir(), 'forge-dsh-'));
		try {
			const path = deepSeekCredentialsPath(home);
			mkdirSync(join(path, '..'), { recursive: true });
			writeFileSync(path, 'DEEPSEEK_API_KEY: "from-file"\n', 'utf8');
			assert.strictEqual(readDeepSeekApiKeyFromCredentials(home), 'from-file');
			assert.strictEqual(hasDeepSeekWorkerCredentials({}, home), true);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test('reports credential source from env and saved files', () => {
		const home = mkdtempSync(join(tmpdir(), 'forge-dsh-src-'));
		try {
			const path = deepSeekCredentialsPath(home);
			mkdirSync(join(path, '..'), { recursive: true });
			writeFileSync(path, 'DEEPSEEK_API_KEY: "from-file"\n', 'utf8');
			assert.strictEqual(deepSeekCredentialSource({ DEEPSEEK_API_KEY: 'from-env' } as NodeJS.ProcessEnv, home), 'env');
			assert.strictEqual(deepSeekCredentialSource({}, home), 'saved');
			assert.strictEqual(grokCredentialSource({ XAI_API_KEY: 'k' } as NodeJS.ProcessEnv, home), 'env');
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test('signed-in flags alone do not count as worker credentials', () => {
		const home = mkdtempSync(join(tmpdir(), 'forge-worker-empty-'));
		const previousForgeHome = process.env.FORGE_HOME;
		const previousDshHome = process.env.DSH_HOME;
		try {
			process.env.FORGE_HOME = home;
			delete process.env.DSH_HOME;
			const env = { FORGE_DEEPSEEK_SIGNED_IN: '1', FORGE_GROK_SIGNED_IN: '1' } as NodeJS.ProcessEnv;
			assert.strictEqual(hasDeepSeekWorkerCredentials(env), false);
			assert.strictEqual(hasGrokWorkerCredentials(env), false);
			assert.strictEqual(resolveDeepSeekCommand('/missing-root', env), undefined);
			assert.strictEqual(resolveGrokCommand('/missing-root', env), undefined);
		} finally {
			if (previousForgeHome === undefined) {
				delete process.env.FORGE_HOME;
			} else {
				process.env.FORGE_HOME = previousForgeHome;
			}
			if (previousDshHome === undefined) {
				delete process.env.DSH_HOME;
			} else {
				process.env.DSH_HOME = previousDshHome;
			}
			rmSync(home, { recursive: true, force: true });
		}
	});
});
