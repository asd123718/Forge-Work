import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { agentHostAuthority, toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_LOG_OUTPUT_CHANNEL_ID, remoteAgentHostLogOutputChannelId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme, resolveEventsUri } from "../copilotCliEventsUri.js";
const WINDOW_LOG_CHANNEL_ID = "rendererLog";
const SHARED_PROCESS_LOG_CHANNEL_ID = "shared";
const MAX_COPILOT_LOG_SCAN_FILES = 10;
const MAX_COPILOT_LOG_SCAN_FILE_SIZE = 1024 * 1024 * 1024;
const MAX_COPILOT_LOG_VIEW_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_RAW_LOG_VIEW_CAP_BYTES = 2 * 1024 * 1024;
var AgentHostLogSourceKind = /* @__PURE__ */ ((AgentHostLogSourceKind2) => {
  AgentHostLogSourceKind2["Events"] = "events";
  AgentHostLogSourceKind2["WireLog"] = "wire";
  AgentHostLogSourceKind2["CliLog"] = "cliLog";
  AgentHostLogSourceKind2["ProcessChannel"] = "processChannel";
  AgentHostLogSourceKind2["RemoteProcessLog"] = "remoteProcessLog";
  return AgentHostLogSourceKind2;
})(AgentHostLogSourceKind || {});
function isAgentHostSession(resource) {
  if (!resource) {
    return false;
  }
  return resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME || !!parseRemoteAuthorityFromScheme(resource.scheme);
}
function getRemoteConnectionForSession(sessionResource, connections) {
  const authority = parseRemoteAuthorityFromScheme(sessionResource.scheme);
  return authority ? connections.find((connection) => agentHostAuthority(connection.address) === authority) : void 0;
}
function sanitizeFilePart(value) {
  return value.replace(/[\\/:\*\?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "connection";
}
async function enumerateAgentHostLogSources(services, sessionResource) {
  if (!isAgentHostSession(sessionResource) || !sessionResource) {
    return [];
  }
  const { pathService, agentHostService, remoteAgentHostService, outputService, fileService, configurationService, environmentService } = services;
  const userHome = pathService.userHome({ preferLocal: true });
  const isLocal = sessionResource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME;
  const remoteConnection = isLocal ? void 0 : getRemoteConnectionForSession(sessionResource, remoteAgentHostService.connections);
  const sources = [];
  const eventsResult = resolveEventsUri(
    sessionResource,
    userHome,
    (authority) => remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority)
  );
  if (eventsResult.kind === "ok") {
    sources.push({
      id: "events",
      label: localize("agentHostLogs.events", "Session Events (events.jsonl)"),
      kind: "events" /* Events */,
      isRemote: !isLocal,
      resource: eventsResult.resource
    });
  }
  if (configurationService.getValue(AgentHostAhpJsonlLoggingSettingId)) {
    const nameToken = isLocal ? sanitizeFilePart(agentHostService.clientId) : remoteConnection ? sanitizeFilePart(remoteConnection.address) : void 0;
    const wireFiles = await listWireLogFiles(fileService, environmentService, nameToken);
    wireFiles.forEach((file, index) => {
      sources.push({
        id: `wire:${file.resource.toString()}`,
        label: index === 0 ? localize("agentHostLogs.wire", "AHP Log") : localize("agentHostLogs.wireN", "AHP Log \u2014 {0}", file.name),
        kind: "wire" /* WireLog */,
        isRemote: !isLocal,
        resource: file.resource
      });
    });
  }
  const channelIds = [];
  if (isLocal) {
    channelIds.push(AGENT_HOST_LOG_OUTPUT_CHANNEL_ID);
  } else if (remoteConnection) {
    channelIds.push(remoteAgentHostLogOutputChannelId(remoteConnection.address));
  }
  channelIds.push(WINDOW_LOG_CHANNEL_ID, SHARED_PROCESS_LOG_CHANNEL_ID);
  for (const channelId of channelIds) {
    const descriptor = outputService.getChannelDescriptor(channelId);
    if (!descriptor) {
      continue;
    }
    sources.push({
      id: `channel:${channelId}`,
      label: localize("agentHostLogs.channel", "{0} (Log)", descriptor.label),
      kind: "processChannel" /* ProcessChannel */,
      isRemote: !isLocal,
      channelId
    });
  }
  if (remoteConnection?.defaultDirectory) {
    sources.push({
      id: "remoteProcessLog",
      label: localize("agentHostLogs.remoteProcess", "Remote Agent Host Log (agenthost.log)"),
      kind: "remoteProcessLog" /* RemoteProcessLog */,
      isRemote: true,
      remoteConnection
    });
  }
  const rawSessionId = getCopilotCliSessionRawId(sessionResource);
  if (rawSessionId) {
    const copilotLogsDir = isLocal ? buildLocalCopilotLogsUri(userHome) : remoteConnection ? buildRemoteCopilotLogsUri(remoteConnection) : void 0;
    if (copilotLogsDir) {
      sources.push({
        id: "cliLog",
        label: localize("agentHostLogs.cliLog", "Copilot Logs"),
        kind: "cliLog" /* CliLog */,
        isRemote: !isLocal,
        cliLogs: { dir: copilotLogsDir, rawSessionId }
      });
    }
  }
  return sources;
}
async function readAgentHostLogSourceContent(source, services, capBytes = DEFAULT_RAW_LOG_VIEW_CAP_BYTES) {
  const { fileService, outputService, textModelService, productService, logService } = services;
  switch (source.kind) {
    case "events" /* Events */:
    case "wire" /* WireLog */: {
      if (!source.resource) {
        return void 0;
      }
      return readFileTail(fileService, source.resource, capBytes);
    }
    case "processChannel" /* ProcessChannel */: {
      if (!source.channelId) {
        return void 0;
      }
      const channel = outputService.getChannel(source.channelId);
      if (!channel) {
        return void 0;
      }
      const modelRef = await textModelService.createModelReference(channel.uri);
      try {
        const value = modelRef.object.textEditorModel.getValue();
        return tailString(value, capBytes);
      } finally {
        modelRef.dispose();
      }
    }
    case "remoteProcessLog" /* RemoteProcessLog */: {
      if (!source.remoteConnection) {
        return void 0;
      }
      const value = await readRemoteAgentHostLog(source.remoteConnection, productService.serverDataFolderName, fileService);
      return value === void 0 ? void 0 : tailString(value, capBytes);
    }
    case "cliLog" /* CliLog */: {
      if (!source.cliLogs) {
        return void 0;
      }
      const files = await readCopilotLogsForSession(source.cliLogs.dir, source.cliLogs.rawSessionId, fileService, logService);
      if (files.length === 0) {
        return { text: "", totalBytes: 0, truncated: false };
      }
      const combined = files.map((f) => `===== ${f.path} =====
${f.contents}`).join("\n\n");
      return tailString(combined, capBytes);
    }
  }
}
async function listWireLogFiles(fileService, environmentService, nameToken) {
  const ahpDir = joinPath(environmentService.logsHome, "ahp");
  let children;
  try {
    children = (await fileService.resolve(ahpDir, { resolveMetadata: true })).children;
  } catch {
    return [];
  }
  const files = (children ?? []).filter((child) => !child.isDirectory && child.name.endsWith(".jsonl")).map((child) => ({ resource: child.resource, name: child.name, mtime: child.mtime ?? 0 }));
  const matching = nameToken ? files.filter((file) => file.name.includes(nameToken)) : [];
  const selected = matching.length > 0 ? matching : files;
  return selected.sort((a, b) => b.mtime - a.mtime);
}
async function readFileTail(fileService, resource, capBytes) {
  let size;
  try {
    size = (await fileService.resolve(resource, { resolveMetadata: true })).size;
  } catch {
    size = void 0;
  }
  if (size !== void 0 && size > capBytes) {
    const content2 = await fileService.readFile(resource, { position: size - capBytes, length: capBytes });
    let text = content2.value.toString();
    const firstNewline = text.indexOf("\n");
    if (firstNewline >= 0) {
      text = text.slice(firstNewline + 1);
    }
    return { text, totalBytes: size, truncated: true, fileResource: resource };
  }
  const content = await fileService.readFile(resource, { limits: { size: capBytes } });
  return { text: content.value.toString(), totalBytes: size, truncated: false, fileResource: resource };
}
function tailString(value, capBytes) {
  if (value.length <= capBytes) {
    return { text: value, totalBytes: value.length, truncated: false };
  }
  let text = value.slice(value.length - capBytes);
  const firstNewline = text.indexOf("\n");
  if (firstNewline >= 0) {
    text = text.slice(firstNewline + 1);
  }
  return { text, totalBytes: value.length, truncated: true };
}
async function readCopilotLogsForSession(logsDir, rawSessionId, fileService, logService) {
  const matchingLogs = await findRelevantCopilotLogs(logsDir, rawSessionId, fileService, logService);
  const files = [];
  for (const log of matchingLogs) {
    try {
      const content = log.size > MAX_COPILOT_LOG_VIEW_FILE_SIZE ? await fileService.readFile(log.resource, { position: log.size - MAX_COPILOT_LOG_VIEW_FILE_SIZE, length: MAX_COPILOT_LOG_VIEW_FILE_SIZE }) : await fileService.readFile(log.resource, { limits: { size: MAX_COPILOT_LOG_VIEW_FILE_SIZE } });
      files.push({ path: log.path, contents: content.value.toString() });
    } catch (error) {
      logService.warn(`[AgentHostLogSources] Failed to read Copilot log '${log.resource.path}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return files;
}
async function findRelevantCopilotLogs(logsDir, rawSessionId, fileService, logService) {
  let children;
  try {
    children = (await fileService.resolve(logsDir, { resolveMetadata: true })).children;
  } catch {
    return [];
  }
  const processLogs = (children ?? []).filter((child) => !child.isDirectory && child.name.endsWith(".log")).sort((a, b) => b.mtime - a.mtime).map((child) => ({ path: `copilot-logs/${child.name}`, resource: child.resource, size: child.size }));
  const files = [];
  const candidateLogs = processLogs.slice(0, MAX_COPILOT_LOG_SCAN_FILES).filter((child) => child.size <= MAX_COPILOT_LOG_SCAN_FILE_SIZE);
  if (rawSessionId) {
    for (const candidate of candidateLogs) {
      try {
        if (await logStreamContains(candidate.resource, rawSessionId, fileService)) {
          files.push(candidate);
        }
      } catch (error) {
        logService.warn(`[AgentHostLogSources] Failed to scan Copilot log '${candidate.path}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return files.length > 0 ? files : processLogs.slice(0, 1);
}
async function logStreamContains(resource, rawSessionId, fileService) {
  const tokenSource = new CancellationTokenSource();
  let stream;
  try {
    stream = (await fileService.readFileStream(resource, {
      length: MAX_COPILOT_LOG_SCAN_FILE_SIZE,
      limits: { size: MAX_COPILOT_LOG_SCAN_FILE_SIZE }
    }, tokenSource.token)).value;
  } catch (error) {
    tokenSource.dispose(true);
    throw error;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let previous = "";
    const cleanup = (removeErrorListener) => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      if (removeErrorListener) {
        stream.removeListener("error", onError);
      }
    };
    const settle = (contains) => {
      if (settled) {
        return;
      }
      settled = true;
      tokenSource.dispose(contains);
      cleanup(!contains);
      resolve(contains);
    };
    const onData = (chunk) => {
      const text = previous + chunk.toString();
      if (text.includes(rawSessionId)) {
        settle(true);
        return;
      }
      previous = text.slice(Math.max(0, text.length - rawSessionId.length + 1));
    };
    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      tokenSource.dispose();
      cleanup(true);
      reject(error);
    };
    const onEnd = () => {
      settle(false);
    };
    stream.on("error", onError);
    stream.on("end", onEnd);
    stream.on("data", onData);
  });
}
async function readRemoteAgentHostLog(connection, serverDataFolderName, fileService) {
  const homePath = connection.defaultDirectory;
  if (!homePath) {
    return void 0;
  }
  const authority = agentHostAuthority(connection.address);
  const homeUri = toAgentHostUri(URI.from({ scheme: "file", path: homePath }), authority);
  const candidates = /* @__PURE__ */ new Set();
  if (serverDataFolderName) {
    candidates.add(serverDataFolderName);
    if (serverDataFolderName.endsWith("-dev")) {
      candidates.add(serverDataFolderName.slice(0, -"-dev".length));
    }
  }
  candidates.add(".vscode-server");
  candidates.add(".vscode-server-insiders");
  candidates.add(".vscode-server-oss");
  candidates.add(".vscode-server-exploration");
  let best;
  for (const folderName of candidates) {
    const logsDirUri = joinPath(homeUri, folderName, "data", "logs");
    let entries;
    try {
      const stat = await fileService.resolve(logsDirUri, { resolveMetadata: true });
      entries = stat.children;
    } catch {
      continue;
    }
    if (!entries) {
      continue;
    }
    for (const dir of entries) {
      if (!dir.isDirectory) {
        continue;
      }
      const logUri = joinPath(dir.resource, "agenthost.log");
      let logStat;
      try {
        logStat = await fileService.resolve(logUri, { resolveMetadata: true });
      } catch {
        continue;
      }
      const mtime = logStat.mtime ?? 0;
      if (!best || mtime > best.mtime) {
        best = { uri: logUri, mtime };
      }
    }
  }
  if (!best) {
    return void 0;
  }
  const content = await fileService.readFile(best.uri);
  return content.value.toString();
}
export {
  AgentHostLogSourceKind,
  DEFAULT_RAW_LOG_VIEW_CAP_BYTES,
  MAX_COPILOT_LOG_SCAN_FILES,
  MAX_COPILOT_LOG_SCAN_FILE_SIZE,
  enumerateAgentHostLogSources,
  findRelevantCopilotLogs,
  getRemoteConnectionForSession,
  isAgentHostSession,
  readAgentHostLogSourceContent,
  readCopilotLogsForSession,
  readRemoteAgentHostLog,
  sanitizeFilePart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcYWdlbnRIb3N0TG9nU291cmNlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyLCB0eXBlIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQsIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9MT0dfT1VUUFVUX0NIQU5ORUxfSUQsIElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbywgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHJlbW90ZUFnZW50SG9zdExvZ091dHB1dENoYW5uZWxJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCB0eXBlIElGaWxlU3RhdFdpdGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZExvY2FsQ29waWxvdExvZ3NVcmksIGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmksIENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSwgZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZCwgcGFyc2VSZW1vdGVBdXRob3JpdHlGcm9tU2NoZW1lLCByZXNvbHZlRXZlbnRzVXJpIH0gZnJvbSAnLi4vY29waWxvdENsaUV2ZW50c1VyaS5qcyc7XG5cbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIGN1cnJlbnQgd2luZG93J3MgcmVuZGVyZXIgbG9nLiAqL1xuY29uc3QgV0lORE9XX0xPR19DSEFOTkVMX0lEID0gJ3JlbmRlcmVyTG9nJztcbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIHNoYXJlZCBwcm9jZXNzIGNvbXBvdW5kIGxvZy4gKi9cbmNvbnN0IFNIQVJFRF9QUk9DRVNTX0xPR19DSEFOTkVMX0lEID0gJ3NoYXJlZCc7XG4vKiogQm91bmQgdGhlIGJlc3QtZWZmb3J0IHNjYW4gb2YgQ29waWxvdCBTREsgcHJvY2VzcyBsb2dzLiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVTID0gMTA7XG5leHBvcnQgY29uc3QgTUFYX0NPUElMT1RfTE9HX1NDQU5fRklMRV9TSVpFID0gMTAyNCAqIDEwMjQgKiAxMDI0O1xuY29uc3QgTUFYX0NPUElMT1RfTE9HX1ZJRVdfRklMRV9TSVpFID0gMTAgKiAxMDI0ICogMTAyNDtcbi8qKiBEZWZhdWx0IGNhcCBmb3IgdGhlIGFtb3VudCBvZiB0ZXh0IGxvYWRlZCBpbnRvIHRoZSBpbmxpbmUgcmF3LWxvZyB2aWV3ZXIuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9SQVdfTE9HX1ZJRVdfQ0FQX0JZVEVTID0gMiAqIDEwMjQgKiAxMDI0O1xuXG4vKipcbiAqIEEgc2VsZWN0ZWQgQ29waWxvdCBwcm9jZXNzIGxvZyB0aGF0IGNhbiBiZSByZWFkIGxhemlseS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdExvZ0ZpbGUge1xuXHRyZWFkb25seSBwYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBEaXNjcmltaW5hdGVzIHRoZSBraW5kIG9mIGFnZW50LWhvc3QgbG9nIGEge0BsaW5rIElBZ2VudEhvc3RMb2dTb3VyY2V9XG4gKiBwb2ludHMgYXQsIHNvIHRoZSB2aWV3ZXIgY2FuIHBpY2sgdGhlIGFwcHJvcHJpYXRlIHJlYWRlciBhbmQgc3ludGF4LlxuICovXG5leHBvcnQgY29uc3QgZW51bSBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kIHtcblx0LyoqIFRoZSBDb3BpbG90IENMSSBgZXZlbnRzLmpzb25sYCBtb2RlbC9jb252ZXJzYXRpb24gc3RyZWFtLiAqL1xuXHRFdmVudHMgPSAnZXZlbnRzJyxcblx0LyoqIFRoZSBjbGllbnQtc2lkZSBBSFAgSlNPTi1SUEMgd2lyZSBsb2cgKGA8bG9nc0hvbWU+L2FocC8qLmpzb25sYCkuICovXG5cdFdpcmVMb2cgPSAnd2lyZScsXG5cdC8qKiBUaGUgQ29waWxvdCBTREsgcHJvY2VzcyBsb2dzIHVuZGVyIGA8Q09QSUxPVF9IT01FPi9sb2dzYC4gKi9cblx0Q2xpTG9nID0gJ2NsaUxvZycsXG5cdC8qKiBBIFZTIENvZGUgb3V0cHV0IGNoYW5uZWwgKGFnZW50IGhvc3QgcHJvY2VzcywgcmVuZGVyZXIsIHNoYXJlZCkuICovXG5cdFByb2Nlc3NDaGFubmVsID0gJ3Byb2Nlc3NDaGFubmVsJyxcblx0LyoqIFRoZSByZW1vdGUgbWFjaGluZSdzIGBhZ2VudGhvc3QubG9nYCwgZG93bmxvYWRlZCBvbiBkZW1hbmQuICovXG5cdFJlbW90ZVByb2Nlc3NMb2cgPSAncmVtb3RlUHJvY2Vzc0xvZycsXG59XG5cbi8qKlxuICogRGVzY3JpYmVzIG9uZSByYXcgbG9nIHNvdXJjZSBhdmFpbGFibGUgZm9yIGFuIGFnZW50LWhvc3Qgc2Vzc2lvbi4gRGVzY3JpcHRvcnNcbiAqIGFyZSBjaGVhcCB0byBlbnVtZXJhdGU7IHRoZSBhY3R1YWwgKGJvdW5kZWQpIGNvbnRlbnQgaXMgcmVhZCBsYXppbHkgdmlhXG4gKiB7QGxpbmsgcmVhZEFnZW50SG9zdExvZ1NvdXJjZUNvbnRlbnR9IHdoZW4gdGhlIHVzZXIgc2VsZWN0cyB0aGUgc291cmNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RMb2dTb3VyY2Uge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBraW5kOiBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kO1xuXHRyZWFkb25seSBpc1JlbW90ZTogYm9vbGVhbjtcblx0LyoqIEZpbGUgcmVzb3VyY2UgZm9yIGZpbGUtYmFja2VkIHNvdXJjZXMgKGV2ZW50cywgd2lyZSBsb2cpLiAqL1xuXHRyZWFkb25seSByZXNvdXJjZT86IFVSSTtcblx0LyoqIE91dHB1dCBjaGFubmVsIGlkIGZvciBjaGFubmVsLWJhY2tlZCBzb3VyY2VzLiAqL1xuXHRyZWFkb25seSBjaGFubmVsSWQ/OiBzdHJpbmc7XG5cdC8qKiBDb3BpbG90IGxvZ3MgZGlyZWN0b3J5ICsgc2Vzc2lvbiBpZCwgZm9yIHRoZSBsYXp5IHNlc3Npb24tbWF0Y2hlZCBDTEkgbG9nIHJlYWQuICovXG5cdHJlYWRvbmx5IGNsaUxvZ3M/OiB7IHJlYWRvbmx5IGRpcjogVVJJOyByZWFkb25seSByYXdTZXNzaW9uSWQ6IHN0cmluZyB9O1xuXHQvKiogUmVtb3RlIGNvbm5lY3Rpb24gZm9yIGxhemlseSBkb3dubG9hZGluZyBgYWdlbnRob3N0LmxvZ2AuICovXG5cdHJlYWRvbmx5IHJlbW90ZUNvbm5lY3Rpb24/OiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm87XG59XG5cbi8qKiBCYWcgb2Ygc2VydmljZXMgcmVxdWlyZWQgdG8gZW51bWVyYXRlIGFuZCByZWFkIGFnZW50LWhvc3QgbG9nIHNvdXJjZXMuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RMb2dTb3VyY2VTZXJ2aWNlcyB7XG5cdHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2U7XG5cdHJlYWRvbmx5IGFnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlO1xuXHRyZWFkb25seSByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZTtcblx0cmVhZG9ubHkgb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2U7XG5cdHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlO1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2U7XG5cdHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2U7XG5cdHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xufVxuXG4vKiogUmVzdWx0IG9mIGEgYm91bmRlZCByYXctbG9nIHJlYWQuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RMb2dDb250ZW50IHtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHQvKiogVG90YWwgc2l6ZSBvZiB0aGUgdW5kZXJseWluZyBzb3VyY2UgaW4gYnl0ZXMsIHdoZW4ga25vd24uICovXG5cdHJlYWRvbmx5IHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIFRydWUgd2hlbiBvbmx5IHRoZSB0YWlsIG9mIHRoZSBzb3VyY2Ugd2FzIGxvYWRlZC4gKi9cblx0cmVhZG9ubHkgdHJ1bmNhdGVkOiBib29sZWFuO1xuXHQvKiogRnVsbC1maWRlbGl0eSByZXNvdXJjZSB0byBvcGVuIGluIGFuIGVkaXRvciwgd2hlbiB0aGUgc291cmNlIGlzIGZpbGUtYmFja2VkLiAqL1xuXHRyZWFkb25seSBmaWxlUmVzb3VyY2U/OiBVUkk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIGNoYXQgc2Vzc2lvbiBiZWxvbmdzIHRvIGFuIGFnZW50IGhvc3QgKGxvY2FsIG9yXG4gKiByZW1vdGUgQ29waWxvdCBDTEkpLiBPbmx5IHRoZXNlIHNlc3Npb25zIGhhdmUgQUhQIGxvZ3MgYW5kIGFnZW50LWhvc3RcbiAqIHByb2Nlc3MgbG9ncywgc28gdGhlIEFIUCBMb2cgdmlldyBpcyBnYXRlZCBvbiB0aGlzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudEhvc3RTZXNzaW9uKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gcmVzb3VyY2Uuc2NoZW1lID09PSBDT1BJTE9UX0NMSV9MT0NBTF9BSF9TQ0hFTUUgfHwgISFwYXJzZVJlbW90ZUF1dGhvcml0eUZyb21TY2hlbWUocmVzb3VyY2Uuc2NoZW1lKTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgcmVtb3RlIGFnZW50LWhvc3QgY29ubmVjdGlvbiB0aGF0IGJhY2tzIGEgZ2l2ZW4gcmVtb3RlIHNlc3Npb25cbiAqIFVSSSwgb3IgYHVuZGVmaW5lZGAgZm9yIGxvY2FsL3Vua25vd24gc2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZW1vdGVDb25uZWN0aW9uRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY29ubmVjdGlvbnM6IHJlYWRvbmx5IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mb1tdKTogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYXV0aG9yaXR5ID0gcGFyc2VSZW1vdGVBdXRob3JpdHlGcm9tU2NoZW1lKHNlc3Npb25SZXNvdXJjZS5zY2hlbWUpO1xuXHRyZXR1cm4gYXV0aG9yaXR5ID8gY29ubmVjdGlvbnMuZmluZChjb25uZWN0aW9uID0+IGFnZW50SG9zdEF1dGhvcml0eShjb25uZWN0aW9uLmFkZHJlc3MpID09PSBhdXRob3JpdHkpIDogdW5kZWZpbmVkO1xufVxuXG4vKiogU2FuaXRpemVzIGEgdmFsdWUgZm9yIHVzZSBhcyAocGFydCBvZikgYSBmaWxlIG5hbWUuICovXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVGaWxlUGFydCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1tcXFxcLzpcXCpcXD9cIjw+fFxcc10rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJykgfHwgJ2Nvbm5lY3Rpb24nO1xufVxuXG4vKipcbiAqIEVudW1lcmF0ZXMgdGhlIHJhdyBsb2cgc291cmNlcyBhdmFpbGFibGUgZm9yIGEgZ2l2ZW4gYWdlbnQtaG9zdCBzZXNzaW9uLlxuICogQ2hlYXA6IHBlcmZvcm1zIGF0IG1vc3QgYSBjb3VwbGUgb2YgZGlyZWN0b3J5IHN0YXRzIGFuZCBuZXZlciByZWFkcyBmaWxlXG4gKiBjb250ZW50cy4gUmV0dXJucyBhbiBlbXB0eSBhcnJheSBmb3Igbm9uLWFnZW50LWhvc3Qgc2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbnVtZXJhdGVBZ2VudEhvc3RMb2dTb3VyY2VzKFxuXHRzZXJ2aWNlczogSUFnZW50SG9zdExvZ1NvdXJjZVNlcnZpY2VzLFxuXHRzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcbik6IFByb21pc2U8SUFnZW50SG9zdExvZ1NvdXJjZVtdPiB7XG5cdGlmICghaXNBZ2VudEhvc3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgfHwgIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHsgcGF0aFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UsIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIG91dHB1dFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlIH0gPSBzZXJ2aWNlcztcblx0Y29uc3QgdXNlckhvbWUgPSBwYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0cnVlIH0pO1xuXHRjb25zdCBpc0xvY2FsID0gc2Vzc2lvblJlc291cmNlLnNjaGVtZSA9PT0gQ09QSUxPVF9DTElfTE9DQUxfQUhfU0NIRU1FO1xuXHRjb25zdCByZW1vdGVDb25uZWN0aW9uID0gaXNMb2NhbCA/IHVuZGVmaW5lZCA6IGdldFJlbW90ZUNvbm5lY3Rpb25Gb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucyk7XG5cblx0Y29uc3Qgc291cmNlczogSUFnZW50SG9zdExvZ1NvdXJjZVtdID0gW107XG5cblx0Ly8gMS4gZXZlbnRzLmpzb25sIChtb2RlbC9jb252ZXJzYXRpb24gc3RyZWFtKVxuXHRjb25zdCBldmVudHNSZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHR1c2VySG9tZSxcblx0XHRhdXRob3JpdHkgPT4gcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYWdlbnRIb3N0QXV0aG9yaXR5KGMuYWRkcmVzcykgPT09IGF1dGhvcml0eSksXG5cdCk7XG5cdGlmIChldmVudHNSZXN1bHQua2luZCA9PT0gJ29rJykge1xuXHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHRpZDogJ2V2ZW50cycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdExvZ3MuZXZlbnRzJywgXCJTZXNzaW9uIEV2ZW50cyAoZXZlbnRzLmpzb25sKVwiKSxcblx0XHRcdGtpbmQ6IEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuRXZlbnRzLFxuXHRcdFx0aXNSZW1vdGU6ICFpc0xvY2FsLFxuXHRcdFx0cmVzb3VyY2U6IGV2ZW50c1Jlc3VsdC5yZXNvdXJjZSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIDIuIEFIUCB3aXJlIGxvZyhzKSBcdTIwMTQgb25seSB3aGVuIHdpcmUgbG9nZ2luZyBpcyBlbmFibGVkLlxuXHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKSkge1xuXHRcdGNvbnN0IG5hbWVUb2tlbiA9IGlzTG9jYWxcblx0XHRcdD8gc2FuaXRpemVGaWxlUGFydChhZ2VudEhvc3RTZXJ2aWNlLmNsaWVudElkKVxuXHRcdFx0OiByZW1vdGVDb25uZWN0aW9uID8gc2FuaXRpemVGaWxlUGFydChyZW1vdGVDb25uZWN0aW9uLmFkZHJlc3MpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdpcmVGaWxlcyA9IGF3YWl0IGxpc3RXaXJlTG9nRmlsZXMoZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbmFtZVRva2VuKTtcblx0XHR3aXJlRmlsZXMuZm9yRWFjaCgoZmlsZSwgaW5kZXgpID0+IHtcblx0XHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgd2lyZToke2ZpbGUucmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdFx0XHRsYWJlbDogaW5kZXggPT09IDBcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RMb2dzLndpcmUnLCBcIkFIUCBMb2dcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RMb2dzLndpcmVOJywgXCJBSFAgTG9nIFx1MjAxNCB7MH1cIiwgZmlsZS5uYW1lKSxcblx0XHRcdFx0a2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZC5XaXJlTG9nLFxuXHRcdFx0XHRpc1JlbW90ZTogIWlzTG9jYWwsXG5cdFx0XHRcdHJlc291cmNlOiBmaWxlLnJlc291cmNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAzLiBBZ2VudCBob3N0IHByb2Nlc3MgbG9nIChvdXRwdXQgY2hhbm5lbCkgKyB3aW5kb3cvc2hhcmVkIGxvZ3MuXG5cdGNvbnN0IGNoYW5uZWxJZHM6IHN0cmluZ1tdID0gW107XG5cdGlmIChpc0xvY2FsKSB7XG5cdFx0Y2hhbm5lbElkcy5wdXNoKEFHRU5UX0hPU1RfTE9HX09VVFBVVF9DSEFOTkVMX0lEKTtcblx0fSBlbHNlIGlmIChyZW1vdGVDb25uZWN0aW9uKSB7XG5cdFx0Y2hhbm5lbElkcy5wdXNoKHJlbW90ZUFnZW50SG9zdExvZ091dHB1dENoYW5uZWxJZChyZW1vdGVDb25uZWN0aW9uLmFkZHJlc3MpKTtcblx0fVxuXHRjaGFubmVsSWRzLnB1c2goV0lORE9XX0xPR19DSEFOTkVMX0lELCBTSEFSRURfUFJPQ0VTU19MT0dfQ0hBTk5FTF9JRCk7XG5cdGZvciAoY29uc3QgY2hhbm5lbElkIG9mIGNoYW5uZWxJZHMpIHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsSWQpO1xuXHRcdGlmICghZGVzY3JpcHRvcikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHRpZDogYGNoYW5uZWw6JHtjaGFubmVsSWR9YCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0TG9ncy5jaGFubmVsJywgXCJ7MH0gKExvZylcIiwgZGVzY3JpcHRvci5sYWJlbCksXG5cdFx0XHRraW5kOiBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLlByb2Nlc3NDaGFubmVsLFxuXHRcdFx0aXNSZW1vdGU6ICFpc0xvY2FsLFxuXHRcdFx0Y2hhbm5lbElkLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gNC4gUmVtb3RlIGFnZW50aG9zdC5sb2cgKGRvd25sb2FkZWQgb24gZGVtYW5kKS5cblx0aWYgKHJlbW90ZUNvbm5lY3Rpb24/LmRlZmF1bHREaXJlY3RvcnkpIHtcblx0XHRzb3VyY2VzLnB1c2goe1xuXHRcdFx0aWQ6ICdyZW1vdGVQcm9jZXNzTG9nJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0TG9ncy5yZW1vdGVQcm9jZXNzJywgXCJSZW1vdGUgQWdlbnQgSG9zdCBMb2cgKGFnZW50aG9zdC5sb2cpXCIpLFxuXHRcdFx0a2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZC5SZW1vdGVQcm9jZXNzTG9nLFxuXHRcdFx0aXNSZW1vdGU6IHRydWUsXG5cdFx0XHRyZW1vdGVDb25uZWN0aW9uLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gNS4gQ29waWxvdCBTREsgcHJvY2VzcyBsb2dzICg8Q09QSUxPVF9IT01FPi9sb2dzKSwgbWF0Y2hlZCBsYXppbHkgYnkgc2Vzc2lvbiBpZCB3aXRoIGEgbmV3ZXN0LWxvZyBmYWxsYmFjay5cblx0Y29uc3QgcmF3U2Vzc2lvbklkID0gZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRpZiAocmF3U2Vzc2lvbklkKSB7XG5cdFx0Y29uc3QgY29waWxvdExvZ3NEaXIgPSBpc0xvY2FsXG5cdFx0XHQ/IGJ1aWxkTG9jYWxDb3BpbG90TG9nc1VyaSh1c2VySG9tZSlcblx0XHRcdDogcmVtb3RlQ29ubmVjdGlvbiA/IGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmkocmVtb3RlQ29ubmVjdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvcGlsb3RMb2dzRGlyKSB7XG5cdFx0XHRzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogJ2NsaUxvZycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0TG9ncy5jbGlMb2cnLCBcIkNvcGlsb3QgTG9nc1wiKSxcblx0XHRcdFx0a2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZC5DbGlMb2csXG5cdFx0XHRcdGlzUmVtb3RlOiAhaXNMb2NhbCxcblx0XHRcdFx0Y2xpTG9nczogeyBkaXI6IGNvcGlsb3RMb2dzRGlyLCByYXdTZXNzaW9uSWQgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzb3VyY2VzO1xufVxuXG4vKipcbiAqIFJlYWRzIHRoZSAoYm91bmRlZCkgY29udGVudCBvZiBhIGxvZyBzb3VyY2UuIEZpbGUtYmFja2VkIHNvdXJjZXMgYXJlIHRhaWxlZFxuICogdG8gYXQgbW9zdCBgY2FwQnl0ZXNgOyB0aGUgcmV0dXJuZWQge0BsaW5rIElBZ2VudEhvc3RMb2dDb250ZW50LmZpbGVSZXNvdXJjZX1cbiAqIGxldHMgY2FsbGVycyBvZmZlciBhbiBcIm9wZW4gZnVsbCBmaWxlXCIgYWZmb3JkYW5jZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRBZ2VudEhvc3RMb2dTb3VyY2VDb250ZW50KFxuXHRzb3VyY2U6IElBZ2VudEhvc3RMb2dTb3VyY2UsXG5cdHNlcnZpY2VzOiBJQWdlbnRIb3N0TG9nU291cmNlU2VydmljZXMsXG5cdGNhcEJ5dGVzOiBudW1iZXIgPSBERUZBVUxUX1JBV19MT0dfVklFV19DQVBfQllURVMsXG4pOiBQcm9taXNlPElBZ2VudEhvc3RMb2dDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHsgZmlsZVNlcnZpY2UsIG91dHB1dFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBsb2dTZXJ2aWNlIH0gPSBzZXJ2aWNlcztcblxuXHRzd2l0Y2ggKHNvdXJjZS5raW5kKSB7XG5cdFx0Y2FzZSBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLkV2ZW50czpcblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuV2lyZUxvZzoge1xuXHRcdFx0aWYgKCFzb3VyY2UucmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWFkRmlsZVRhaWwoZmlsZVNlcnZpY2UsIHNvdXJjZS5yZXNvdXJjZSwgY2FwQnl0ZXMpO1xuXHRcdH1cblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuUHJvY2Vzc0NoYW5uZWw6IHtcblx0XHRcdGlmICghc291cmNlLmNoYW5uZWxJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbChzb3VyY2UuY2hhbm5lbElkKTtcblx0XHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoYW5uZWwudXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gbW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRyZXR1cm4gdGFpbFN0cmluZyh2YWx1ZSwgY2FwQnl0ZXMpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuUmVtb3RlUHJvY2Vzc0xvZzoge1xuXHRcdFx0aWYgKCFzb3VyY2UucmVtb3RlQ29ubmVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCByZWFkUmVtb3RlQWdlbnRIb3N0TG9nKHNvdXJjZS5yZW1vdGVDb25uZWN0aW9uLCBwcm9kdWN0U2VydmljZS5zZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgZmlsZVNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0YWlsU3RyaW5nKHZhbHVlLCBjYXBCeXRlcyk7XG5cdFx0fVxuXHRcdGNhc2UgQWdlbnRIb3N0TG9nU291cmNlS2luZC5DbGlMb2c6IHtcblx0XHRcdGlmICghc291cmNlLmNsaUxvZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgcmVhZENvcGlsb3RMb2dzRm9yU2Vzc2lvbihzb3VyY2UuY2xpTG9ncy5kaXIsIHNvdXJjZS5jbGlMb2dzLnJhd1Nlc3Npb25JZCwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyB0ZXh0OiAnJywgdG90YWxCeXRlczogMCwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tYmluZWQgPSBmaWxlcy5tYXAoZiA9PiBgPT09PT0gJHtmLnBhdGh9ID09PT09XFxuJHtmLmNvbnRlbnRzfWApLmpvaW4oJ1xcblxcbicpO1xuXHRcdFx0cmV0dXJuIHRhaWxTdHJpbmcoY29tYmluZWQsIGNhcEJ5dGVzKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBMaXN0cyBBSFAgd2lyZSBsb2cgZmlsZXMgZm9yIGEgc2Vzc2lvbidzIGNvbm5lY3Rpb24uXG4gKlxuICogV2hlbiBgbmFtZVRva2VuYCBpZGVudGlmaWVzIHRoZSBzZXNzaW9uJ3MgY29ubmVjdGlvbiAoaXRzIGZpbGVuYW1lcyBlbWJlZFxuICogYGFocC08dGltZXN0YW1wPi08Y29ubmVjdGlvbklkPi5qc29ubGApLCBvbmx5IG1hdGNoaW5nIGZpbGVzIGFyZSByZXR1cm5lZCBcdTIwMTRcbiAqIHNvIHVucmVsYXRlZCBjb25uZWN0aW9ucycgbG9ncyBhcmUgbm90IHN1cmZhY2VkIGFzIHNwdXJpb3VzIFwicm90YXRlZFwiXG4gKiBzb3VyY2VzLiBGYWxscyBiYWNrIHRvIGFsbCBBSFAgbG9ncyAobmV3ZXN0IGZpcnN0KSB3aGVuIHRoZSB0b2tlbiBpcyBhYnNlbnRcbiAqIG9yIG1hdGNoZXMgbm90aGluZy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbGlzdFdpcmVMb2dGaWxlcyhcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRuYW1lVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBuYW1lOiBzdHJpbmc7IG10aW1lOiBudW1iZXIgfVtdPiB7XG5cdGNvbnN0IGFocERpciA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgJ2FocCcpO1xuXHRsZXQgY2hpbGRyZW46IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdGNoaWxkcmVuID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoYWhwRGlyLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuY2hpbGRyZW47XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBmaWxlcyA9IChjaGlsZHJlbiA/PyBbXSlcblx0XHQuZmlsdGVyKGNoaWxkID0+ICFjaGlsZC5pc0RpcmVjdG9yeSAmJiBjaGlsZC5uYW1lLmVuZHNXaXRoKCcuanNvbmwnKSlcblx0XHQubWFwKGNoaWxkID0+ICh7IHJlc291cmNlOiBjaGlsZC5yZXNvdXJjZSwgbmFtZTogY2hpbGQubmFtZSwgbXRpbWU6IGNoaWxkLm10aW1lID8/IDAgfSkpO1xuXG5cdC8vIFJlc3RyaWN0IHRvIHRoZSBzZXNzaW9uJ3MgY29ubmVjdGlvbiB3aGVuIGl0IGNhbiBiZSBpZGVudGlmaWVkOyBvdGhlcndpc2Vcblx0Ly8gZmFsbCBiYWNrIHRvIGFsbCBmaWxlcyBzbyBhIHNlc3Npb24gaXMgbmV2ZXIgbGVmdCB3aXRob3V0IGFueSBsb2cuXG5cdGNvbnN0IG1hdGNoaW5nID0gbmFtZVRva2VuID8gZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5uYW1lLmluY2x1ZGVzKG5hbWVUb2tlbikpIDogW107XG5cdGNvbnN0IHNlbGVjdGVkID0gbWF0Y2hpbmcubGVuZ3RoID4gMCA/IG1hdGNoaW5nIDogZmlsZXM7XG5cblx0Ly8gTmV3ZXN0IGZpcnN0LlxuXHRyZXR1cm4gc2VsZWN0ZWQuc29ydCgoYSwgYikgPT4gYi5tdGltZSAtIGEubXRpbWUpO1xufVxuXG4vKiogUmVhZHMgYXQgbW9zdCBgY2FwQnl0ZXNgIGZyb20gdGhlIHRhaWwgb2YgYSBmaWxlLiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVhZEZpbGVUYWlsKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHJlc291cmNlOiBVUkksIGNhcEJ5dGVzOiBudW1iZXIpOiBQcm9taXNlPElBZ2VudEhvc3RMb2dDb250ZW50PiB7XG5cdGxldCBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0c2l6ZSA9IChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKHJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuc2l6ZTtcblx0fSBjYXRjaCB7XG5cdFx0c2l6ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChzaXplICE9PSB1bmRlZmluZWQgJiYgc2l6ZSA+IGNhcEJ5dGVzKSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IHBvc2l0aW9uOiBzaXplIC0gY2FwQnl0ZXMsIGxlbmd0aDogY2FwQnl0ZXMgfSk7XG5cdFx0bGV0IHRleHQgPSBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Ly8gRHJvcCB0aGUgbGVhZGluZyBwYXJ0aWFsIGxpbmUgc28gdGhlIHZpZXcgc3RhcnRzIG9uIGEgcmVjb3JkIGJvdW5kYXJ5LlxuXHRcdGNvbnN0IGZpcnN0TmV3bGluZSA9IHRleHQuaW5kZXhPZignXFxuJyk7XG5cdFx0aWYgKGZpcnN0TmV3bGluZSA+PSAwKSB7XG5cdFx0XHR0ZXh0ID0gdGV4dC5zbGljZShmaXJzdE5ld2xpbmUgKyAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdGV4dCwgdG90YWxCeXRlczogc2l6ZSwgdHJ1bmNhdGVkOiB0cnVlLCBmaWxlUmVzb3VyY2U6IHJlc291cmNlIH07XG5cdH1cblxuXHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgbGltaXRzOiB7IHNpemU6IGNhcEJ5dGVzIH0gfSk7XG5cdHJldHVybiB7IHRleHQ6IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgdG90YWxCeXRlczogc2l6ZSwgdHJ1bmNhdGVkOiBmYWxzZSwgZmlsZVJlc291cmNlOiByZXNvdXJjZSB9O1xufVxuXG4vKiogUmV0dXJucyBhdCBtb3N0IGBjYXBCeXRlc2Agd29ydGggb2YgdGV4dCBmcm9tIHRoZSB0YWlsIG9mIGEgc3RyaW5nLiAqL1xuZnVuY3Rpb24gdGFpbFN0cmluZyh2YWx1ZTogc3RyaW5nLCBjYXBCeXRlczogbnVtYmVyKTogSUFnZW50SG9zdExvZ0NvbnRlbnQge1xuXHRpZiAodmFsdWUubGVuZ3RoIDw9IGNhcEJ5dGVzKSB7XG5cdFx0cmV0dXJuIHsgdGV4dDogdmFsdWUsIHRvdGFsQnl0ZXM6IHZhbHVlLmxlbmd0aCwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHR9XG5cdGxldCB0ZXh0ID0gdmFsdWUuc2xpY2UodmFsdWUubGVuZ3RoIC0gY2FwQnl0ZXMpO1xuXHRjb25zdCBmaXJzdE5ld2xpbmUgPSB0ZXh0LmluZGV4T2YoJ1xcbicpO1xuXHRpZiAoZmlyc3ROZXdsaW5lID49IDApIHtcblx0XHR0ZXh0ID0gdGV4dC5zbGljZShmaXJzdE5ld2xpbmUgKyAxKTtcblx0fVxuXHRyZXR1cm4geyB0ZXh0LCB0b3RhbEJ5dGVzOiB2YWx1ZS5sZW5ndGgsIHRydW5jYXRlZDogdHJ1ZSB9O1xufVxuXG4vKipcbiAqIFJlYWRzIENvcGlsb3QgcHJvY2VzcyBsb2dzIHNlbGVjdGVkIGZvciBhIHNlc3Npb24sIG9yIHRoZSBuZXdlc3QgbG9nIHdoZW5cbiAqIG5vbmUgbWVudGlvbiB0aGUgc2Vzc2lvbiBpZC4gQm91bmRlZCBieVxuICoge0BsaW5rIE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVTfSBhbmQge0BsaW5rIE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVfU0laRX0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkQ29waWxvdExvZ3NGb3JTZXNzaW9uKFxuXHRsb2dzRGlyOiBVUkksXG5cdHJhd1Nlc3Npb25JZDogc3RyaW5nLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcbik6IFByb21pc2U8eyBwYXRoOiBzdHJpbmc7IGNvbnRlbnRzOiBzdHJpbmcgfVtdPiB7XG5cdGNvbnN0IG1hdGNoaW5nTG9ncyA9IGF3YWl0IGZpbmRSZWxldmFudENvcGlsb3RMb2dzKGxvZ3NEaXIsIHJhd1Nlc3Npb25JZCwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRjb25zdCBmaWxlczogeyBwYXRoOiBzdHJpbmc7IGNvbnRlbnRzOiBzdHJpbmcgfVtdID0gW107XG5cdGZvciAoY29uc3QgbG9nIG9mIG1hdGNoaW5nTG9ncykge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gbG9nLnNpemUgPiBNQVhfQ09QSUxPVF9MT0dfVklFV19GSUxFX1NJWkVcblx0XHRcdFx0PyBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShsb2cucmVzb3VyY2UsIHsgcG9zaXRpb246IGxvZy5zaXplIC0gTUFYX0NPUElMT1RfTE9HX1ZJRVdfRklMRV9TSVpFLCBsZW5ndGg6IE1BWF9DT1BJTE9UX0xPR19WSUVXX0ZJTEVfU0laRSB9KVxuXHRcdFx0XHQ6IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvZy5yZXNvdXJjZSwgeyBsaW1pdHM6IHsgc2l6ZTogTUFYX0NPUElMT1RfTE9HX1ZJRVdfRklMRV9TSVpFIH0gfSk7XG5cdFx0XHRmaWxlcy5wdXNoKHsgcGF0aDogbG9nLnBhdGgsIGNvbnRlbnRzOiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdExvZ1NvdXJjZXNdIEZhaWxlZCB0byByZWFkIENvcGlsb3QgbG9nICcke2xvZy5yZXNvdXJjZS5wYXRofSc6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmlsZXM7XG59XG5cbi8qKlxuICogU2NhbnMgYSBib3VuZGVkIHNldCBvZiBDb3BpbG90IHByb2Nlc3MgbG9ncyBmb3IgdGhlIHNlc3Npb24gaWQsIGZhbGxpbmcgYmFja1xuICogdG8gdGhlIG5ld2VzdCBwcm9jZXNzIGxvZyB3aGVuIG5vIG1hdGNoIGNhbiBiZSBmb3VuZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmRSZWxldmFudENvcGlsb3RMb2dzKFxuXHRsb2dzRGlyOiBVUkksXG5cdHJhd1Nlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcbik6IFByb21pc2U8SUNvcGlsb3RMb2dGaWxlW10+IHtcblx0bGV0IGNoaWxkcmVuOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXSB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRjaGlsZHJlbiA9IChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGxvZ3NEaXIsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pKS5jaGlsZHJlbjtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgcHJvY2Vzc0xvZ3MgPSAoY2hpbGRyZW4gPz8gW10pXG5cdFx0LmZpbHRlcihjaGlsZCA9PiAhY2hpbGQuaXNEaXJlY3RvcnkgJiYgY2hpbGQubmFtZS5lbmRzV2l0aCgnLmxvZycpKVxuXHRcdC5zb3J0KChhLCBiKSA9PiBiLm10aW1lIC0gYS5tdGltZSlcblx0XHQubWFwKGNoaWxkID0+ICh7IHBhdGg6IGBjb3BpbG90LWxvZ3MvJHtjaGlsZC5uYW1lfWAsIHJlc291cmNlOiBjaGlsZC5yZXNvdXJjZSwgc2l6ZTogY2hpbGQuc2l6ZSB9KSk7XG5cdGNvbnN0IGZpbGVzOiBJQ29waWxvdExvZ0ZpbGVbXSA9IFtdO1xuXHRjb25zdCBjYW5kaWRhdGVMb2dzID0gcHJvY2Vzc0xvZ3Ncblx0XHQuc2xpY2UoMCwgTUFYX0NPUElMT1RfTE9HX1NDQU5fRklMRVMpXG5cdFx0LmZpbHRlcihjaGlsZCA9PiBjaGlsZC5zaXplIDw9IE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVfU0laRSk7XG5cdGlmIChyYXdTZXNzaW9uSWQpIHtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVMb2dzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoYXdhaXQgbG9nU3RyZWFtQ29udGFpbnMoY2FuZGlkYXRlLnJlc291cmNlLCByYXdTZXNzaW9uSWQsIGZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0XHRcdGZpbGVzLnB1c2goY2FuZGlkYXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0TG9nU291cmNlc10gRmFpbGVkIHRvIHNjYW4gQ29waWxvdCBsb2cgJyR7Y2FuZGlkYXRlLnBhdGh9JzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmaWxlcy5sZW5ndGggPiAwID8gZmlsZXMgOiBwcm9jZXNzTG9ncy5zbGljZSgwLCAxKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9nU3RyZWFtQ29udGFpbnMoXG5cdHJlc291cmNlOiBVUkksXG5cdHJhd1Nlc3Npb25JZDogc3RyaW5nLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdGxldCBzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG5cdHRyeSB7XG5cdFx0c3RyZWFtID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlLCB7XG5cdFx0XHRsZW5ndGg6IE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVfU0laRSxcblx0XHRcdGxpbWl0czogeyBzaXplOiBNQVhfQ09QSUxPVF9MT0dfU0NBTl9GSUxFX1NJWkUgfSxcblx0XHR9LCB0b2tlblNvdXJjZS50b2tlbikpLnZhbHVlO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhyb3cgZXJyb3I7XG5cdH1cblx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdGxldCBwcmV2aW91cyA9ICcnO1xuXG5cdFx0Y29uc3QgY2xlYW51cCA9IChyZW1vdmVFcnJvckxpc3RlbmVyOiBib29sZWFuKSA9PiB7XG5cdFx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2RhdGEnLCBvbkRhdGEpO1xuXHRcdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBvbkVuZCk7XG5cdFx0XHRpZiAocmVtb3ZlRXJyb3JMaXN0ZW5lcikge1xuXHRcdFx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBzZXR0bGUgPSAoY29udGFpbnM6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0dG9rZW5Tb3VyY2UuZGlzcG9zZShjb250YWlucyk7XG5cdFx0XHRjbGVhbnVwKCFjb250YWlucyk7XG5cdFx0XHRyZXNvbHZlKGNvbnRhaW5zKTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uRGF0YSA9IChjaHVuazogVlNCdWZmZXIpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBwcmV2aW91cyArIGNodW5rLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAodGV4dC5pbmNsdWRlcyhyYXdTZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHNldHRsZSh0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXMgPSB0ZXh0LnNsaWNlKE1hdGgubWF4KDAsIHRleHQubGVuZ3RoIC0gcmF3U2Vzc2lvbklkLmxlbmd0aCArIDEpKTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uRXJyb3IgPSAoZXJyb3I6IEVycm9yKSA9PiB7XG5cdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdHRva2VuU291cmNlLmRpc3Bvc2UoKTtcblx0XHRcdGNsZWFudXAodHJ1ZSk7XG5cdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdH07XG5cdFx0Y29uc3Qgb25FbmQgPSAoKSA9PiB7XG5cdFx0XHRzZXR0bGUoZmFsc2UpO1xuXHRcdH07XG5cblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCBvbkVuZCk7XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgb25EYXRhKTtcblx0fSk7XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHJlbW90ZSBhZ2VudCBob3N0J3MgYGFnZW50aG9zdC5sb2dgIGZyb20gdGhlIHJlbW90ZSBtYWNoaW5lIHZpYSB0aGVcbiAqIGB2c2NvZGUtYWdlbnQtaG9zdDovL2AgZmlsZXN5c3RlbSBwcm94eS4gVGhlIENMSSBsYXVuY2hlcyB0aGUgc2VydmVyIHdpdGggaXRzXG4gKiBkZWZhdWx0IGRhdGEgZGlyIGF0IGA8aG9tZT4vPHNlcnZlckRhdGFGb2xkZXJOYW1lPi9kYXRhL2xvZ3MvPGRhdGVzdGFtcD4vYCxcbiAqIHNvIHdlIGxpc3QgdGhlIGxvZ3MgZGlyZWN0b3J5IGFuZCBwaWNrIHRoZSBtb3N0IHJlY2VudCBkYXRlLXN0YW1wZWQgZm9sZGVyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFJlbW90ZUFnZW50SG9zdExvZyhcblx0Y29ubmVjdGlvbjogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLFxuXHRzZXJ2ZXJEYXRhRm9sZGVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgaG9tZVBhdGggPSBjb25uZWN0aW9uLmRlZmF1bHREaXJlY3Rvcnk7XG5cdGlmICghaG9tZVBhdGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShjb25uZWN0aW9uLmFkZHJlc3MpO1xuXHRjb25zdCBob21lVXJpID0gdG9BZ2VudEhvc3RVcmkoVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogaG9tZVBhdGggfSksIGF1dGhvcml0eSk7XG5cblx0Ly8gUG9zc2libGUgc2VydmVyIGRhdGEgZm9sZGVyIGNhbmRpZGF0ZXMuIFRoZSByZW5kZXJlcidzIG93blxuXHQvLyBgc2VydmVyRGF0YUZvbGRlck5hbWVgICh3aGljaCB0aGUgdXNlciBpcyBydW5uaW5nKSBpcyB0aGUgbW9zdCBsaWtlbHlcblx0Ly8gbWF0Y2gsIGJ1dCB0aGUgcmVtb3RlIGFnZW50IGhvc3QgbWF5IGhhdmUgYmVlbiBsYXVuY2hlZCBieSBhIGRpZmZlcmVudFxuXHQvLyBxdWFsaXR5IG9mIENMSS4gRGV2IGJ1aWxkcyBhbHNvIGFwcGVuZCBgLWRldmAsIHdoaWNoIHdvbid0IGV4aXN0IG9uXG5cdC8vIGFueSByZWFsIGJ1aWx0IHJlbW90ZSwgc28gd2Ugc3RyaXAgdGhhdCBzdWZmaXggYXMgd2VsbC5cblx0Y29uc3QgY2FuZGlkYXRlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRpZiAoc2VydmVyRGF0YUZvbGRlck5hbWUpIHtcblx0XHRjYW5kaWRhdGVzLmFkZChzZXJ2ZXJEYXRhRm9sZGVyTmFtZSk7XG5cdFx0aWYgKHNlcnZlckRhdGFGb2xkZXJOYW1lLmVuZHNXaXRoKCctZGV2JykpIHtcblx0XHRcdGNhbmRpZGF0ZXMuYWRkKHNlcnZlckRhdGFGb2xkZXJOYW1lLnNsaWNlKDAsIC0nLWRldicubGVuZ3RoKSk7XG5cdFx0fVxuXHR9XG5cdGNhbmRpZGF0ZXMuYWRkKCcudnNjb2RlLXNlcnZlcicpO1xuXHRjYW5kaWRhdGVzLmFkZCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKTtcblx0Y2FuZGlkYXRlcy5hZGQoJy52c2NvZGUtc2VydmVyLW9zcycpO1xuXHRjYW5kaWRhdGVzLmFkZCgnLnZzY29kZS1zZXJ2ZXItZXhwbG9yYXRpb24nKTtcblxuXHQvLyBFbnVtZXJhdGUgZXZlcnkgYDxob21lPi88Y2FuZGlkYXRlPi9kYXRhL2xvZ3MvPGRhdGVzdGFtcD4vYWdlbnRob3N0LmxvZ2Bcblx0Ly8gYWNyb3NzIGFsbCBjYW5kaWRhdGVzIGFuZCBwaWNrIHRoZSBvbmUgd2l0aCB0aGUgbmV3ZXN0IG10aW1lLiBUaGlzIGF2b2lkc1xuXHQvLyBwaWNraW5nIHVwIGEgc3RhbGUgc3RhYmxlLXF1YWxpdHkgZm9sZGVyIHdoZW4gYW4gaW5zaWRlcnMgZm9sZGVyIGhhcyBhXG5cdC8vIG1vcmUgcmVjZW50IGxvZyAob3IgdmljZSB2ZXJzYSkuXG5cdGxldCBiZXN0OiB7IHVyaTogVVJJOyBtdGltZTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgZm9sZGVyTmFtZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0Y29uc3QgbG9nc0RpclVyaSA9IGpvaW5QYXRoKGhvbWVVcmksIGZvbGRlck5hbWUsICdkYXRhJywgJ2xvZ3MnKTtcblx0XHRsZXQgZW50cmllcztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9nc0RpclVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRlbnRyaWVzID0gc3RhdC5jaGlsZHJlbjtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGRpciBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoIWRpci5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvZ1VyaSA9IGpvaW5QYXRoKGRpci5yZXNvdXJjZSwgJ2FnZW50aG9zdC5sb2cnKTtcblx0XHRcdGxldCBsb2dTdGF0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bG9nU3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9nVXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG10aW1lID0gbG9nU3RhdC5tdGltZSA/PyAwO1xuXHRcdFx0aWYgKCFiZXN0IHx8IG10aW1lID4gYmVzdC5tdGltZSkge1xuXHRcdFx0XHRiZXN0ID0geyB1cmk6IGxvZ1VyaSwgbXRpbWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoIWJlc3QpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiZXN0LnVyaSk7XG5cdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMseUNBQTREO0FBQ3JFLFNBQVMsa0NBQTJGLHlDQUF5QztBQVM3SSxTQUFTLDBCQUEwQiwyQkFBMkIsNkJBQTZCLDJCQUEyQixnQ0FBZ0Msd0JBQXdCO0FBRzlLLE1BQU0sd0JBQXdCO0FBRTlCLE1BQU0sZ0NBQWdDO0FBRS9CLE1BQU0sNkJBQTZCO0FBQ25DLE1BQU0saUNBQWlDLE9BQU8sT0FBTztBQUM1RCxNQUFNLGlDQUFpQyxLQUFLLE9BQU87QUFFNUMsTUFBTSxpQ0FBaUMsSUFBSSxPQUFPO0FBZWxELElBQVcseUJBQVgsa0JBQVdBLDRCQUFYO0FBRU4sRUFBQUEsd0JBQUEsWUFBUztBQUVULEVBQUFBLHdCQUFBLGFBQVU7QUFFVixFQUFBQSx3QkFBQSxZQUFTO0FBRVQsRUFBQUEsd0JBQUEsb0JBQWlCO0FBRWpCLEVBQUFBLHdCQUFBLHNCQUFtQjtBQVZGLFNBQUFBO0FBQUEsR0FBQTtBQStEWCxTQUFTLG1CQUFtQixVQUFvQztBQUN0RSxNQUFJLENBQUMsVUFBVTtBQUNkLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxTQUFTLFdBQVcsK0JBQStCLENBQUMsQ0FBQywrQkFBK0IsU0FBUyxNQUFNO0FBQzNHO0FBTU8sU0FBUyw4QkFBOEIsaUJBQXNCLGFBQW9HO0FBQ3ZLLFFBQU0sWUFBWSwrQkFBK0IsZ0JBQWdCLE1BQU07QUFDdkUsU0FBTyxZQUFZLFlBQVksS0FBSyxnQkFBYyxtQkFBbUIsV0FBVyxPQUFPLE1BQU0sU0FBUyxJQUFJO0FBQzNHO0FBR08sU0FBUyxpQkFBaUIsT0FBdUI7QUFD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
