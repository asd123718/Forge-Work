/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import type { IWorkerAvailability, IWorkerProvider, IWorkerRunRequest, IWorkerTaskResult } from '../../common/orchestration/orchestrationTypes.js';
import { DEEPSEEK_WORKER_PROVIDER_ID, GROK_WORKER_PROVIDER_ID } from '../../common/orchestration/orchestrationTypes.js';
import {
	deepSeekCredentialSource,
	findDeepSeekHarnessRoot,
	findGrokBuildBinary,
	grokCredentialSource,
	hasDeepSeekLocalRuntime,
	isExecutablePath,
	probeExecutable,
	resolveNodeNpmCli,
	resolveSpawnCommand,
} from './workerRuntime.js';

export interface IProcessRunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type ProcessRunner = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; abort: AbortSignal; onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void }) => Promise<IProcessRunResult>;

export function createNodeProcessRunner(): ProcessRunner {
	return (command, args, options) => new Promise((resolve, reject) => {
		const resolved = resolveSpawnCommand(command);
		const child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
			cwd: options.cwd,
			env: options.env,
			shell: resolved.shell,
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		const onAbort = () => {
			child.kill();
		};
		if (options.abort.aborted) {
			child.kill();
		} else {
			options.abort.addEventListener('abort', onAbort, { once: true });
		}
		child.stdout?.on('data', chunk => {
			const text = String(chunk);
			stdout += text;
			options.onStdout?.(text);
		});
		child.stderr?.on('data', chunk => {
			const text = String(chunk);
			stderr += text;
			options.onStderr?.(text);
		});
		child.on('error', error => {
			options.abort.removeEventListener('abort', onAbort);
			reject(error);
		});
		child.on('close', code => {
			options.abort.removeEventListener('abort', onAbort);
			resolve({ exitCode: code ?? 1, stdout, stderr });
		});
	});
}

export function workerPrompt(request: IWorkerRunRequest): string {
	const files = request.task.files.length > 0 ? request.task.files.join(', ') : '(leader did not pin files; stay on the smallest relevant set)';
	return [
		'You are a Forge worker. Execute only this task. Do not act as the leader.',
		`Overall goal: ${request.goal}`,
		`Shared contract:\n${request.contract || '(none)'}`,
		`Task: ${request.task.title}`,
		request.task.prompt,
		request.task.workerModel ? `Preferred model: ${request.task.workerModel}` : undefined,
		request.task.thinkingLevel ? `Thinking effort: ${request.task.thinkingLevel}` : undefined,
		request.task.contextSize ? `Context size: ${request.task.contextSize}` : undefined,
		`Allowed / expected files: ${files}`,
		request.task.acceptance ? `Acceptance: ${request.task.acceptance}` : undefined,
		request.task.testCommand ? `Run this test if possible: ${request.task.testCommand}` : 'Run a cheap relevant test if one exists.',
		'When finished, reply with a short structured summary only: status, changed files, test result, risks. No chat transcript.',
	].filter(Boolean).join('\n\n');
}

export function parseWorkerSummary(stdout: string, exitCode: number, startedAt: number): IWorkerTaskResult {
	const text = stdout.trim();
	let parsed: Record<string, unknown> | undefined;
	try {
		parsed = JSON.parse(text) as Record<string, unknown>;
	} catch {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start >= 0 && end > start) {
			try {
				parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
			} catch {
				parsed = undefined;
			}
		}
	}
	const changedFiles = Array.isArray(parsed?.changedFiles)
		? parsed.changedFiles.filter((file): file is string => typeof file === 'string')
		: [];
	const usage = parsed?.usage && typeof parsed.usage === 'object' ? parsed.usage as Record<string, unknown> : parsed;
	return {
		status: exitCode === 0 && parsed?.status !== 'failed' ? 'completed' : 'failed',
		summary: typeof parsed?.text === 'string' ? parsed.text : typeof parsed?.summary === 'string' ? parsed.summary : text.slice(0, 2000),
		changedFiles,
		testOutput: typeof parsed?.testOutput === 'string' ? parsed.testOutput : undefined,
		testsPassed: typeof parsed?.testsPassed === 'boolean' ? parsed.testsPassed : undefined,
		risk: typeof parsed?.risk === 'string' ? parsed.risk : undefined,
		error: exitCode === 0 ? undefined : (typeof parsed?.message === 'string' ? parsed.message : text.slice(0, 500) || `exit ${exitCode}`),
		usage: {
			durationMs: Date.now() - startedAt,
			inputTokens: asNumber(usage?.input_tokens ?? usage?.inputTokens),
			outputTokens: asNumber(usage?.output_tokens ?? usage?.outputTokens),
			costUsd: asNumber(usage?.total_cost_usd ?? usage?.costUsd),
		},
	};
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function resolveDeepSeekCommand(repoRoot: string, env: NodeJS.ProcessEnv): { command: string; args: string[]; env: NodeJS.ProcessEnv } | undefined {
	if (deepSeekCredentialSource(env) === 'none') {
		return undefined;
	}
	const next = { ...env, DSH_PERMISSION_MODE: env.DSH_PERMISSION_MODE ?? 'workspace-write' };
	const local = findDeepSeekHarnessRoot(repoRoot);
	if (local && hasDeepSeekLocalRuntime(local)) {
		const binJs = join(local, 'apps', 'cli', 'lib', 'bin.js');
		if (existsSync(binJs)) {
			return { command: process.execPath, args: [binJs, '--profile', 'headless'], env: next };
		}
		const binTs = join(local, 'apps', 'cli', 'src', 'bin.ts');
		const tsx = join(local, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs');
		if (existsSync(binTs) && existsSync(tsx)) {
			return { command: process.execPath, args: ['--import', tsx, binTs, '--profile', 'headless'], env: next };
		}
		return { command: 'pnpm', args: ['--dir', local, 'dsh', '--profile', 'headless'], env: next };
	}
	const npx = resolveNodeNpmCli('npx');
	return { command: npx.command, args: [...npx.prefixArgs, '--yes', '@deepseek-ai/dsh', '--profile', 'headless'], env: next };
}

export function resolveGrokCommand(repoRoot: string, env: NodeJS.ProcessEnv): { command: string; prefixArgs: string[]; env: NodeJS.ProcessEnv } | undefined {
	if (grokCredentialSource(env) === 'none') {
		return undefined;
	}
	const next = {
		...env,
		GROK_DISABLE_AUTOUPDATER: '1',
		GROK_MEMORY: '0',
	};
	const built = findGrokBuildBinary(repoRoot);
	if (built) {
		return { command: built, prefixArgs: [], env: next };
	}
	return { command: 'grok', prefixArgs: [], env: next };
}

export class DeepSeekHarnessWorker implements IWorkerProvider {
	readonly id = DEEPSEEK_WORKER_PROVIDER_ID;
	readonly label = 'DeepSeek Harness';
	readonly defaultModel = 'deepseek-v4-flash';

	constructor(
		private readonly _runner: ProcessRunner,
		private readonly _resolveCommand: () => Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv } | undefined>,
	) { }

	async checkAvailability(): Promise<IWorkerAvailability> {
		const resolved = await this._resolveCommand();
		if (!resolved) {
			return { available: false, credentialSource: 'none', reason: 'missing-credentials' };
		}
		const credentialSource = deepSeekCredentialSource(resolved.env);
		const executable = [resolved.command, ...resolved.args.slice(0, 5)].join(' ');
		if (isExecutablePath(resolved.command)) {
			const imported = resolved.args[0] === '--import' ? resolved.args[1] : resolved.args[0];
			if (imported && /\.(js|mjs|cjs|ts)$/i.test(imported) && !existsSync(imported)) {
				return { available: false, credentialSource, executable, reason: 'missing-executable' };
			}
			return { available: true, credentialSource, executable };
		}
		if (resolved.command === 'pnpm') {
			const localDir = resolved.args[1];
			if (!localDir || !existsSync(join(localDir, 'package.json'))) {
				return { available: false, credentialSource, executable, reason: 'missing-executable' };
			}
		}
		const available = await probeExecutable(resolved.command, ['--version'], resolved.env);
		return { available, credentialSource, executable, reason: available ? undefined : 'probe-failed' };
	}

	async isAvailable(): Promise<boolean> {
		return (await this.checkAvailability()).available;
	}

	async run(request: IWorkerRunRequest): Promise<IWorkerTaskResult> {
		const resolved = await this._resolveCommand();
		if (!resolved) {
			return unavailableResult(this.label, Date.now());
		}
		const startedAt = Date.now();
		let streamed = '';
		const onChunk = (chunk: string) => {
			streamed += chunk;
			request.hooks?.onProgress?.({ progress: streamed });
		};
		try {
			const result = await this._runner(resolved.command, [...resolved.args, workerPrompt(request)], {
				cwd: request.workspace,
				env: resolved.env,
				abort: request.abort,
				onStdout: onChunk,
				onStderr: onChunk,
			});
			return parseWorkerSummary(result.stdout || result.stderr, result.exitCode, startedAt);
		} catch (error) {
			return {
				status: 'failed',
				summary: '',
				changedFiles: [],
				error: error instanceof Error ? error.message : String(error),
				usage: { durationMs: Date.now() - startedAt },
			};
		}
	}
}

export class GrokBuildWorker implements IWorkerProvider {
	readonly id = GROK_WORKER_PROVIDER_ID;
	readonly label = 'Grok Build';
	readonly defaultModel = 'grok-4.6';

	constructor(
		private readonly _runner: ProcessRunner,
		private readonly _resolveCommand: () => Promise<{ command: string; prefixArgs: string[]; env: NodeJS.ProcessEnv } | undefined>,
		private readonly _model: string,
	) { }

	async checkAvailability(): Promise<IWorkerAvailability> {
		const resolved = await this._resolveCommand();
		if (!resolved) {
			return { available: false, credentialSource: 'none', reason: 'missing-credentials' };
		}
		const credentialSource = grokCredentialSource(resolved.env);
		const executable = resolved.command;
		if (isExecutablePath(resolved.command)) {
			return { available: true, credentialSource, executable };
		}
		const available = await probeExecutable(resolved.command, ['--version'], resolved.env);
		return { available, credentialSource, executable, reason: available ? undefined : 'probe-failed' };
	}

	async isAvailable(): Promise<boolean> {
		return (await this.checkAvailability()).available;
	}

	async run(request: IWorkerRunRequest): Promise<IWorkerTaskResult> {
		const resolved = await this._resolveCommand();
		if (!resolved) {
			return unavailableResult(this.label, Date.now());
		}
		const startedAt = Date.now();
		let streamed = '';
		const onChunk = (chunk: string) => {
			streamed += chunk;
			request.hooks?.onProgress?.({ progress: streamed });
		};
		try {
			const result = await this._runner(resolved.command, [
				...resolved.prefixArgs,
				'-p', workerPrompt(request),
				'--cwd', request.workspace,
				'--permission-mode', 'auto',
				'--no-auto-update',
				'--output-format', 'json',
				'-m', request.task.workerModel ?? this._model,
			], {
				cwd: request.workspace,
				env: resolved.env,
				abort: request.abort,
				onStdout: onChunk,
				onStderr: onChunk,
			});
			return parseWorkerSummary(result.stdout || result.stderr, result.exitCode, startedAt);
		} catch (error) {
			return {
				status: 'failed',
				summary: '',
				changedFiles: [],
				error: error instanceof Error ? error.message : String(error),
				usage: { durationMs: Date.now() - startedAt },
			};
		}
	}
}

function unavailableResult(label: string, startedAt: number): IWorkerTaskResult {
	return {
		status: 'failed',
		summary: '',
		changedFiles: [],
		error: `${label} is not installed or its API key is missing.`,
		usage: { durationMs: Date.now() - startedAt },
	};
}
