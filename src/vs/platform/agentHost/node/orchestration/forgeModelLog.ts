/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { join } from 'path';
import type { IOrchestrationTranscriptEntry } from '../../common/orchestration/orchestrationTypes.js';

export const FORGE_MODEL_LOG_DIR_ENV = 'FORGE_MODEL_LOG_DIR';

export interface IForgeModelLogToolCall {
	readonly toolName: string;
	readonly status: string;
	readonly input?: string;
	readonly output?: string;
	readonly message?: string;
}

export interface IForgeModelLogEntryState {
	readonly entryId: string;
	readonly phase: IOrchestrationTranscriptEntry['phase'];
	readonly agentLabel: string;
	readonly title: string;
	readonly taskId?: string;
	status: IOrchestrationTranscriptEntry['status'];
	thinking: string;
	output: string;
	toolCalls: IForgeModelLogToolCall[];
	commandLines: string[];
	commandStream: string;
	startedAt: string;
	updatedAt: string;
}

export interface IForgeModelLogRunState {
	readonly runId: string;
	readonly goal: string;
	readonly mode: string;
	readonly workspace: string;
	status: string;
	startedAt: string;
	updatedAt: string;
	entries: IForgeModelLogEntryState[];
}

interface IEntryRecord {
	readonly fileName: string;
	state: IForgeModelLogEntryState;
}

let singleton: ForgeModelLog | undefined;

export class ForgeModelLog {
	private _rootDir: string | undefined;
	private _runDir: string | undefined;
	private _runState: IForgeModelLogRunState | undefined;
	private readonly _entries = new Map<string, IEntryRecord>();
	private _entrySequence = 0;

	static instance(): ForgeModelLog {
		if (!singleton) {
			singleton = new ForgeModelLog();
		}
		return singleton;
	}

	resolveRootDir(appRoot: string): string {
		const configured = process.env[FORGE_MODEL_LOG_DIR_ENV]?.trim();
		if (configured) {
			return configured;
		}
		return join(appRoot, 'logs', 'models');
	}

	configure(appRoot: string): void {
		this._rootDir = this.resolveRootDir(appRoot);
	}

	get enabled(): boolean {
		return !!this._rootDir;
	}

	get runDirectory(): string | undefined {
		return this._runDir;
	}

	async beginRun(options: { runId: string; goal: string; mode: string; workspace: string }): Promise<void> {
		if (!this._rootDir) {
			return;
		}
		const stamp = formatTimestamp(new Date());
		const shortId = options.runId.slice(0, 8);
		this._runDir = join(this._rootDir, `${stamp}_${shortId}`);
		this._entries.clear();
		this._entrySequence = 0;
		this._runState = {
			runId: options.runId,
			goal: options.goal,
			mode: options.mode,
			workspace: options.workspace,
			status: 'running',
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			entries: [],
		};
		await fs.mkdir(this._runDir, { recursive: true });
		await this._writeRunIndex();
	}

	async beginEntry(options: {
		entryId: string;
		phase: IOrchestrationTranscriptEntry['phase'];
		agentLabel: string;
		title: string;
		taskId?: string;
	}): Promise<void> {
		if (!this._runDir || !this._runState) {
			return;
		}
		this._entrySequence++;
		const now = new Date().toISOString();
		const slug = slugify(`${options.phase}-${options.agentLabel}-${options.title}`);
		const fileName = `${String(this._entrySequence).padStart(3, '0')}-${slug}.md`;
		const state: IForgeModelLogEntryState = {
			entryId: options.entryId,
			phase: options.phase,
			agentLabel: options.agentLabel,
			title: options.title,
			taskId: options.taskId,
			status: 'running',
			thinking: '',
			output: '',
			toolCalls: [],
			commandLines: [],
			commandStream: '',
			startedAt: now,
			updatedAt: now,
		};
		this._entries.set(options.entryId, { fileName, state });
		this._runState = {
			...this._runState,
			entries: [...this._runState.entries, state],
			updatedAt: now,
		};
		await this._writeEntry(options.entryId);
		await this._writeRunIndex();
	}

	async updateEntry(entryId: string, update: { thinking?: string; output?: string }): Promise<void> {
		const record = this._entries.get(entryId);
		if (!record || !this._runState) {
			return;
		}
		record.state = {
			...record.state,
			thinking: update.thinking ?? record.state.thinking,
			output: update.output ?? record.state.output,
			updatedAt: new Date().toISOString(),
		};
		this._syncRunEntry(record.state);
		await this._writeEntry(entryId);
	}

	async setToolCalls(entryId: string, toolCalls: readonly IForgeModelLogToolCall[]): Promise<void> {
		const record = this._entries.get(entryId);
		if (!record || !this._runState) {
			return;
		}
		record.state = {
			...record.state,
			toolCalls: [...toolCalls],
			updatedAt: new Date().toISOString(),
		};
		this._syncRunEntry(record.state);
		await this._writeEntry(entryId);
	}

	async appendCommand(entryId: string, commandLine: string, streamChunk?: string): Promise<void> {
		const record = this._entries.get(entryId);
		if (!record || !this._runState) {
			return;
		}
		const commandLines = record.state.commandLines.includes(commandLine)
			? record.state.commandLines
			: [...record.state.commandLines, commandLine];
		record.state = {
			...record.state,
			commandLines,
			commandStream: streamChunk !== undefined ? record.state.commandStream + streamChunk : record.state.commandStream,
			updatedAt: new Date().toISOString(),
		};
		this._syncRunEntry(record.state);
		await this._writeEntry(entryId);
	}

	async completeEntry(entryId: string, output: string, status: 'completed' | 'failed'): Promise<void> {
		const record = this._entries.get(entryId);
		if (!record || !this._runState) {
			return;
		}
		record.state = {
			...record.state,
			output,
			status,
			updatedAt: new Date().toISOString(),
		};
		this._syncRunEntry(record.state);
		await this._writeEntry(entryId);
		await this._writeRunIndex();
	}

	async endRun(status: string): Promise<void> {
		if (!this._runState) {
			return;
		}
		this._runState = {
			...this._runState,
			status,
			updatedAt: new Date().toISOString(),
		};
		await this._writeRunIndex();
	}

	private _syncRunEntry(entry: IForgeModelLogEntryState): void {
		if (!this._runState) {
			return;
		}
		this._runState = {
			...this._runState,
			entries: this._runState.entries.map(candidate => candidate.entryId === entry.entryId ? entry : candidate),
			updatedAt: entry.updatedAt,
		};
	}

	private async _writeRunIndex(): Promise<void> {
		if (!this._runDir || !this._runState) {
			return;
		}
		const lines: string[] = [
			'# Forge Model Run Log',
			'',
			'| Field | Value |',
			'| --- | --- |',
			`| Run ID | \`${this._runState.runId}\` |`,
			`| Mode | ${escapeCell(this._runState.mode)} |`,
			`| Status | ${escapeCell(this._runState.status)} |`,
			`| Workspace | \`${this._runState.workspace}\` |`,
			`| Started | ${this._runState.startedAt} |`,
			`| Updated | ${this._runState.updatedAt} |`,
			'',
			'## Goal',
			'',
			this._runState.goal,
			'',
			'## Entries',
			'',
		];
		for (const record of this._entries.values()) {
			const entry = record.state;
			lines.push(`- [${record.fileName}](./${record.fileName}) — **${entry.phase}** / ${entry.agentLabel} / ${entry.title} (${entry.status})`);
		}
		lines.push('');
		await fs.writeFile(join(this._runDir, 'index.md'), lines.join('\n'), 'utf8');
	}

	private async _writeEntry(entryId: string): Promise<void> {
		const record = this._entries.get(entryId);
		if (!record || !this._runDir) {
			return;
		}
		await fs.writeFile(join(this._runDir, record.fileName), renderEntryMarkdown(record.state), 'utf8');
	}
}

export function renderEntryMarkdown(entry: IForgeModelLogEntryState): string {
	const lines: string[] = [
		`# ${entry.title}`,
		'',
		'| Field | Value |',
		'| --- | --- |',
		`| Phase | ${escapeCell(entry.phase)} |`,
		`| Agent | ${escapeCell(entry.agentLabel)} |`,
		`| Status | ${escapeCell(entry.status)} |`,
		`| Task ID | ${entry.taskId ? `\`${entry.taskId}\`` : '—'} |`,
		`| Started | ${entry.startedAt} |`,
		`| Updated | ${entry.updatedAt} |`,
		'',
		'## Thinking',
		'',
		entry.thinking.trim() ? fencedBlock('text', entry.thinking) : '_No thinking captured._',
		'',
		'## Tool Calls',
		'',
	];
	if (entry.toolCalls.length === 0) {
		lines.push('_No tool calls captured._', '');
	} else {
		for (let index = 0; index < entry.toolCalls.length; index++) {
			const toolCall = entry.toolCalls[index];
			lines.push(`### ${index + 1}. \`${toolCall.toolName}\``, '');
			lines.push(`- **Status:** ${escapeCell(toolCall.status)}`);
			if (toolCall.message) {
				lines.push(`- **Message:** ${escapeCell(toolCall.message)}`);
			}
			lines.push('');
			if (toolCall.input) {
				lines.push('**Input:**', '', fencedBlock('json', toolCall.input), '');
			}
			if (toolCall.output) {
				lines.push('**Output:**', '', fencedBlock('text', toolCall.output), '');
			}
		}
	}
	lines.push(
		'## Output',
		'',
		entry.output.trim() ? entry.output : '_No final output captured._',
		'',
		'## Command Execution',
		'',
	);
	if (entry.commandLines.length === 0 && !entry.commandStream.trim()) {
		lines.push('_No shell command captured._', '');
	} else {
		if (entry.commandLines.length > 0) {
			lines.push('**Command:**', '', fencedBlock('powershell', entry.commandLines.join('\n')), '');
		}
		if (entry.commandStream.trim()) {
			lines.push('**Stream:**', '', fencedBlock('text', entry.commandStream), '');
		}
	}
	return lines.join('\n');
}

function fencedBlock(language: string, content: string): string {
	return '```' + language + '\n' + content.replace(/\r\n/g, '\n') + '\n```';
}

function escapeCell(value: string): string {
	return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function slugify(value: string): string {
	const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	return slug.slice(0, 80) || 'entry';
}

function formatTimestamp(date: Date): string {
	const pad = (part: number) => String(part).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function safeModelLog(task: Promise<void>): void {
	void task.catch(() => undefined);
}
