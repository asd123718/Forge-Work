/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { promisify } from 'util';
import { dirname, join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import type { WorkerCredentialSource } from '../../common/orchestration/orchestrationTypes.js';

const execFileAsync = promisify(execFile);

export function forgeUserHome(): string {
	return process.env.FORGE_HOME || homedir();
}

export function ancestorDirs(start: string, max = 8): string[] {
	const dirs: string[] = [];
	let current = start;
	for (let i = 0; i < max; i++) {
		dirs.push(current);
		const parent = dirname(current);
		if (!parent || parent === current) {
			break;
		}
		current = parent;
	}
	return dirs;
}

function uniquePaths(paths: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const path of paths) {
		const key = path.replace(/[\\/]+$/g, '').toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(path);
	}
	return out;
}

export function deepSeekHarnessRoots(repoRoot: string): readonly string[] {
	const home = forgeUserHome();
	const fromAncestors = ancestorDirs(repoRoot).flatMap(base => [
		join(base, 'third_party', 'deepseek-harness'),
		join(base, 'deepseek-harness'),
		join(base, 'deepseek-harness-master'),
	]);
	return uniquePaths([
		...fromAncestors,
		join(home, '.forge', 'deepseek-harness'),
		join(home, '.forge', 'deepseek-harness-master'),
	]);
}

export function grokBuildBinaryCandidates(repoRoot: string): readonly string[] {
	const home = forgeUserHome();
	const pager = isWindows ? 'xai-grok-pager.exe' : 'xai-grok-pager';
	const grok = isWindows ? 'grok.exe' : 'grok';
	const fromAncestors = ancestorDirs(repoRoot).flatMap(base => [
		join(base, 'third_party', 'grok-build', 'bin', grok),
		join(base, 'third_party', 'grok-build', 'bin', pager),
		join(base, 'third_party', 'grok-build', 'target', 'release', pager),
		join(base, 'third_party', 'grok-build', 'target', 'release', grok),
		join(base, 'grok-build', 'bin', grok),
		join(base, 'grok-build-main', 'target', 'release', pager),
	]);
	return uniquePaths([
		...fromAncestors,
		join(home, '.grok', 'bin', grok),
		join(home, '.forge', 'bin', grok),
		join(home, '.forge', 'bin', pager),
		join(home, '.forge', 'grok-build-main', 'target', 'release', pager),
	]);
}

export function findDeepSeekHarnessRoot(repoRoot: string): string | undefined {
	for (const candidate of deepSeekHarnessRoots(repoRoot)) {
		if (existsSync(join(candidate, 'package.json'))) {
			return candidate;
		}
	}
	return undefined;
}

export function findGrokBuildBinary(repoRoot: string): string | undefined {
	for (const candidate of grokBuildBinaryCandidates(repoRoot)) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

export function hasDeepSeekLocalRuntime(root: string): boolean {
	return existsSync(join(root, 'apps', 'cli', 'lib', 'bin.js'))
		|| existsSync(join(root, 'node_modules'));
}

export function resolveNodeNpmCli(kind: 'npx' | 'npm'): { command: string; prefixArgs: string[] } {
	const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${kind}-cli.js`);
	if (existsSync(cli)) {
		return { command: process.execPath, prefixArgs: [cli] };
	}
	return { command: kind, prefixArgs: [] };
}

export function resolveSpawnCommand(command: string): { command: string; prefixArgs: string[]; shell: boolean } {
	if (!isWindows) {
		return { command, prefixArgs: [], shell: false };
	}
	const lower = command.toLowerCase();
	if (lower.endsWith('.exe')) {
		return { command, prefixArgs: [], shell: false };
	}
	if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
		return { command: process.env.ComSpec || 'cmd.exe', prefixArgs: ['/d', '/s', '/c', command], shell: false };
	}
	if (command.includes('\\') || command.includes('/')) {
		return { command, prefixArgs: [], shell: false };
	}
	// Bare PATH names such as npx/pnpm/grok: do not rewrite to *.cmd with
	// shell:false. Node 20+ rejects spawning cmd shims that way (EINVAL).
	return { command, prefixArgs: [], shell: true };
}

export function deepSeekCredentialsPath(userHome = forgeUserHome()): string {
	return join(process.env.DSH_HOME || join(userHome, '.dsh'), '.credentials.yaml');
}

export function grokAuthPath(userHome = forgeUserHome()): string {
	return join(userHome, '.grok', 'auth.json');
}

export function readDeepSeekApiKeyFromCredentials(userHome = forgeUserHome()): string | undefined {
	try {
		const text = readFileSync(deepSeekCredentialsPath(userHome), 'utf8');
		const match = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(.+)\s*$/m);
		const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
		return value || undefined;
	} catch {
		return undefined;
	}
}

export function readGrokApiKeyFromAuth(userHome = forgeUserHome()): string | undefined {
	try {
		const raw = JSON.parse(readFileSync(grokAuthPath(userHome), 'utf8')) as Record<string, unknown>;
		for (const value of Object.values(raw)) {
			if (!value || typeof value !== 'object') {
				continue;
			}
			const entry = value as Record<string, unknown>;
			if (typeof entry.key === 'string' && entry.key.trim() !== '') {
				return entry.key;
			}
		}
	} catch {
		return undefined;
	}
	return undefined;
}

export function deepSeekCredentialSource(env: NodeJS.ProcessEnv, userHome = forgeUserHome()): WorkerCredentialSource {
	if (env.DEEPSEEK_API_KEY?.trim()) {
		return 'env';
	}
	if (readDeepSeekApiKeyFromCredentials(userHome)) {
		return 'saved';
	}
	return 'none';
}

export function grokCredentialSource(env: NodeJS.ProcessEnv, userHome = forgeUserHome()): WorkerCredentialSource {
	if (env.XAI_API_KEY?.trim() || env.GROK_CODE_XAI_API_KEY?.trim()) {
		return 'env';
	}
	if (readGrokApiKeyFromAuth(userHome)) {
		return 'saved';
	}
	return 'none';
}

export function hasDeepSeekWorkerCredentials(env: NodeJS.ProcessEnv, userHome = forgeUserHome()): boolean {
	return deepSeekCredentialSource(env, userHome) !== 'none';
}

export function hasGrokWorkerCredentials(env: NodeJS.ProcessEnv, userHome = forgeUserHome()): boolean {
	return grokCredentialSource(env, userHome) !== 'none';
}

export function isExecutablePath(command: string): boolean {
	if (!command) {
		return false;
	}
	if (command.includes('/') || command.includes('\\') || /\.(exe|cmd|bat)$/i.test(command)) {
		return existsSync(command);
	}
	return false;
}

export async function probeExecutable(command: string, args: readonly string[] = ['--version'], env: NodeJS.ProcessEnv = process.env, timeoutMs = 4_000): Promise<boolean> {
	const resolved = resolveSpawnCommand(command);
	if ((resolved.command.includes('/') || resolved.command.includes('\\') || /\.(exe|cmd|bat)$/i.test(resolved.command)) && !existsSync(resolved.command)) {
		return false;
	}
	try {
		await execFileAsync(resolved.command, [...resolved.prefixArgs, ...args], {
			env,
			timeout: timeoutMs,
			windowsHide: true,
			shell: resolved.shell,
		});
		return true;
	} catch {
		try {
			await execFileAsync(resolved.command, [...resolved.prefixArgs, '--help'], {
				env,
				timeout: timeoutMs,
				windowsHide: true,
				shell: resolved.shell,
			});
			return true;
		} catch {
			return false;
		}
	}
}
