import { StringDecoder } from "string_decoder";
import { listenStream } from "../../../../base/common/stream.js";
import { URI } from "../../../../base/common/uri.js";
import { getCodexRolloutThreadCoordinationCall } from "./codexThreadCoordination.js";
async function readCodexRolloutMetadata(fileService, path) {
  const stream = (await fileService.readFileStream(URI.file(path))).value;
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    const modelsByTurnId = /* @__PURE__ */ new Map();
    const threadCoordinationByTurnId = /* @__PURE__ */ new Map();
    const pendingThreadCoordination = /* @__PURE__ */ new Map();
    let remainder = "";
    let isDesktop = false;
    let originModelProvider;
    let currentModel;
    const acceptLine = (line) => {
      if (!line.includes('"session_meta"') && !line.includes('"turn_context"') && !line.includes('"thread_settings_applied"') && !line.includes('"task_started"') && !line.includes("custom_tool_call")) {
        return;
      }
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        return;
      }
      const payload = record.payload;
      if (!payload) {
        return;
      }
      if (record.type === "response_item") {
        if (payload.type === "custom_tool_call" && payload.call_id && payload.input) {
          const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id;
          if (turnId) {
            pendingThreadCoordination.set(payload.call_id, { turnId, input: payload.input });
          }
        } else if (payload.type === "custom_tool_call_output" && payload.call_id) {
          const pending = pendingThreadCoordination.get(payload.call_id);
          pendingThreadCoordination.delete(payload.call_id);
          if (pending) {
            const output = typeof payload.output === "string" ? [payload.output] : payload.output?.flatMap((item) => item.type === "input_text" && typeof item.text === "string" ? [item.text] : []) ?? [];
            const coordination = getCodexRolloutThreadCoordinationCall(pending.input, output);
            if (coordination) {
              const calls = threadCoordinationByTurnId.get(pending.turnId);
              if (calls) {
                calls.push(coordination);
              } else {
                threadCoordinationByTurnId.set(pending.turnId, [coordination]);
              }
            }
          }
        }
        return;
      }
      if (record.type === "session_meta") {
        isDesktop = payload.originator === "Codex Desktop";
        originModelProvider = payload.model_provider;
        return;
      }
      if (record.type === "turn_context" && payload.turn_id && payload.model) {
        currentModel = {
          modelProvider: currentModel?.modelProvider ?? originModelProvider ?? "openai",
          modelId: payload.model
        };
        modelsByTurnId.set(payload.turn_id, currentModel);
        return;
      }
      if (record.type !== "event_msg") {
        return;
      }
      if (payload.type === "thread_settings_applied") {
        const settings = payload.thread_settings;
        if (settings?.model && settings.model_provider_id) {
          currentModel = { modelProvider: settings.model_provider_id, modelId: settings.model };
        }
        return;
      }
      if (payload.type === "task_started" && payload.turn_id && currentModel) {
        modelsByTurnId.set(payload.turn_id, currentModel);
      }
    };
    const acceptText = (text, flush) => {
      remainder += text;
      let newline;
      while ((newline = remainder.indexOf("\n")) >= 0) {
        acceptLine(remainder.slice(0, newline));
        remainder = remainder.slice(newline + 1);
      }
      if (flush && remainder) {
        acceptLine(remainder);
        remainder = "";
      }
    };
    listenStream(stream, {
      onData: (data) => acceptText(decoder.write(data.buffer), false),
      onError: reject,
      onEnd: () => {
        acceptText(decoder.end(), true);
        resolve({
          isDesktop,
          originModelProvider,
          selectedModel: currentModel,
          modelsByTurnId,
          threadCoordinationByTurnId
        });
      }
    });
  });
}
export {
  readCodexRolloutMetadata
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb2RleFxcY29kZXhSb2xsb3V0TWV0YWRhdGEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTdHJpbmdEZWNvZGVyIH0gZnJvbSAnc3RyaW5nX2RlY29kZXInO1xuaW1wb3J0IHsgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZXhSb2xsb3V0VGhyZWFkQ29vcmRpbmF0aW9uQ2FsbCwgdHlwZSBJQ29kZXhUaHJlYWRDb29yZGluYXRpb25DYWxsIH0gZnJvbSAnLi9jb2RleFRocmVhZENvb3JkaW5hdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4Um9sbG91dE1vZGVsIHtcblx0cmVhZG9ubHkgbW9kZWxQcm92aWRlcjogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4Um9sbG91dE1ldGFkYXRhIHtcblx0cmVhZG9ubHkgaXNEZXNrdG9wOiBib29sZWFuO1xuXHRyZWFkb25seSBvcmlnaW5Nb2RlbFByb3ZpZGVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBzZWxlY3RlZE1vZGVsPzogSUNvZGV4Um9sbG91dE1vZGVsO1xuXHRyZWFkb25seSBtb2RlbHNCeVR1cm5JZDogUmVhZG9ubHlNYXA8c3RyaW5nLCBJQ29kZXhSb2xsb3V0TW9kZWw+O1xuXHRyZWFkb25seSB0aHJlYWRDb29yZGluYXRpb25CeVR1cm5JZDogUmVhZG9ubHlNYXA8c3RyaW5nLCByZWFkb25seSBJQ29kZXhUaHJlYWRDb29yZGluYXRpb25DYWxsW10+O1xufVxuXG5pbnRlcmZhY2UgSUNvZGV4Um9sbG91dFJlY29yZCB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBheWxvYWQ/OiB7XG5cdFx0cmVhZG9ubHkgb3JpZ2luYXRvcj86IHN0cmluZztcblx0XHRyZWFkb25seSBtb2RlbF9wcm92aWRlcj86IHN0cmluZztcblx0XHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHR1cm5faWQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdGhyZWFkX3NldHRpbmdzPzoge1xuXHRcdFx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBtb2RlbF9wcm92aWRlcl9pZD86IHN0cmluZztcblx0XHR9O1xuXHRcdHJlYWRvbmx5IGNhbGxfaWQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBpbnB1dD86IHN0cmluZztcblx0XHRyZWFkb25seSBvdXRwdXQ/OiBzdHJpbmcgfCByZWFkb25seSB7XG5cdFx0XHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgdGV4dD86IHN0cmluZztcblx0XHR9W107XG5cdFx0cmVhZG9ubHkgaW50ZXJuYWxfY2hhdF9tZXNzYWdlX21ldGFkYXRhX3Bhc3N0aHJvdWdoPzoge1xuXHRcdFx0cmVhZG9ubHkgdHVybl9pZD86IHN0cmluZztcblx0XHR9O1xuXHR9O1xufVxuXG4vKiogUmVhZHMgdGhlIG1vZGVsIHByb3ZlbmFuY2UgbmVlZGVkIHRvIHJlc3RvcmUgYSBwZXJzaXN0ZWQgQ29kZXggRGVza3RvcCB0aHJlYWQuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZENvZGV4Um9sbG91dE1ldGFkYXRhKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8SUNvZGV4Um9sbG91dE1ldGFkYXRhPiB7XG5cdGNvbnN0IHN0cmVhbSA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZVN0cmVhbShVUkkuZmlsZShwYXRoKSkpLnZhbHVlO1xuXHRyZXR1cm4gbmV3IFByb21pc2U8SUNvZGV4Um9sbG91dE1ldGFkYXRhPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBTdHJpbmdEZWNvZGVyKCd1dGY4Jyk7XG5cdFx0Y29uc3QgbW9kZWxzQnlUdXJuSWQgPSBuZXcgTWFwPHN0cmluZywgSUNvZGV4Um9sbG91dE1vZGVsPigpO1xuXHRcdGNvbnN0IHRocmVhZENvb3JkaW5hdGlvbkJ5VHVybklkID0gbmV3IE1hcDxzdHJpbmcsIElDb2RleFRocmVhZENvb3JkaW5hdGlvbkNhbGxbXT4oKTtcblx0XHRjb25zdCBwZW5kaW5nVGhyZWFkQ29vcmRpbmF0aW9uID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmc7IHJlYWRvbmx5IGlucHV0OiBzdHJpbmcgfT4oKTtcblx0XHRsZXQgcmVtYWluZGVyID0gJyc7XG5cdFx0bGV0IGlzRGVza3RvcCA9IGZhbHNlO1xuXHRcdGxldCBvcmlnaW5Nb2RlbFByb3ZpZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGN1cnJlbnRNb2RlbDogSUNvZGV4Um9sbG91dE1vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgYWNjZXB0TGluZSA9IChsaW5lOiBzdHJpbmcpID0+IHtcblx0XHRcdGlmICghbGluZS5pbmNsdWRlcygnXCJzZXNzaW9uX21ldGFcIicpICYmICFsaW5lLmluY2x1ZGVzKCdcInR1cm5fY29udGV4dFwiJykgJiYgIWxpbmUuaW5jbHVkZXMoJ1widGhyZWFkX3NldHRpbmdzX2FwcGxpZWRcIicpICYmICFsaW5lLmluY2x1ZGVzKCdcInRhc2tfc3RhcnRlZFwiJykgJiYgIWxpbmUuaW5jbHVkZXMoJ2N1c3RvbV90b29sX2NhbGwnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgcmVjb3JkOiBJQ29kZXhSb2xsb3V0UmVjb3JkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVjb3JkID0gSlNPTi5wYXJzZShsaW5lKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXlsb2FkID0gcmVjb3JkLnBheWxvYWQ7XG5cdFx0XHRpZiAoIXBheWxvYWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY29yZC50eXBlID09PSAncmVzcG9uc2VfaXRlbScpIHtcblx0XHRcdFx0aWYgKHBheWxvYWQudHlwZSA9PT0gJ2N1c3RvbV90b29sX2NhbGwnICYmIHBheWxvYWQuY2FsbF9pZCAmJiBwYXlsb2FkLmlucHV0KSB7XG5cdFx0XHRcdFx0Y29uc3QgdHVybklkID0gcGF5bG9hZC5pbnRlcm5hbF9jaGF0X21lc3NhZ2VfbWV0YWRhdGFfcGFzc3Rocm91Z2g/LnR1cm5faWQ7XG5cdFx0XHRcdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0XHRcdFx0cGVuZGluZ1RocmVhZENvb3JkaW5hdGlvbi5zZXQocGF5bG9hZC5jYWxsX2lkLCB7IHR1cm5JZCwgaW5wdXQ6IHBheWxvYWQuaW5wdXQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHBheWxvYWQudHlwZSA9PT0gJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0JyAmJiBwYXlsb2FkLmNhbGxfaWQpIHtcblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nID0gcGVuZGluZ1RocmVhZENvb3JkaW5hdGlvbi5nZXQocGF5bG9hZC5jYWxsX2lkKTtcblx0XHRcdFx0XHRwZW5kaW5nVGhyZWFkQ29vcmRpbmF0aW9uLmRlbGV0ZShwYXlsb2FkLmNhbGxfaWQpO1xuXHRcdFx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXQgPSB0eXBlb2YgcGF5bG9hZC5vdXRwdXQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdD8gW3BheWxvYWQub3V0cHV0XVxuXHRcdFx0XHRcdFx0XHQ6IHBheWxvYWQub3V0cHV0Py5mbGF0TWFwKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnaW5wdXRfdGV4dCcgJiYgdHlwZW9mIGl0ZW0udGV4dCA9PT0gJ3N0cmluZycgPyBbaXRlbS50ZXh0XSA6IFtdKSA/PyBbXTtcblx0XHRcdFx0XHRcdGNvbnN0IGNvb3JkaW5hdGlvbiA9IGdldENvZGV4Um9sbG91dFRocmVhZENvb3JkaW5hdGlvbkNhbGwocGVuZGluZy5pbnB1dCwgb3V0cHV0KTtcblx0XHRcdFx0XHRcdGlmIChjb29yZGluYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2FsbHMgPSB0aHJlYWRDb29yZGluYXRpb25CeVR1cm5JZC5nZXQocGVuZGluZy50dXJuSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2FsbHMpIHtcblx0XHRcdFx0XHRcdFx0XHRjYWxscy5wdXNoKGNvb3JkaW5hdGlvbik7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyZWFkQ29vcmRpbmF0aW9uQnlUdXJuSWQuc2V0KHBlbmRpbmcudHVybklkLCBbY29vcmRpbmF0aW9uXSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY29yZC50eXBlID09PSAnc2Vzc2lvbl9tZXRhJykge1xuXHRcdFx0XHRpc0Rlc2t0b3AgPSBwYXlsb2FkLm9yaWdpbmF0b3IgPT09ICdDb2RleCBEZXNrdG9wJztcblx0XHRcdFx0b3JpZ2luTW9kZWxQcm92aWRlciA9IHBheWxvYWQubW9kZWxfcHJvdmlkZXI7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmQudHlwZSA9PT0gJ3R1cm5fY29udGV4dCcgJiYgcGF5bG9hZC50dXJuX2lkICYmIHBheWxvYWQubW9kZWwpIHtcblx0XHRcdFx0Y3VycmVudE1vZGVsID0ge1xuXHRcdFx0XHRcdG1vZGVsUHJvdmlkZXI6IGN1cnJlbnRNb2RlbD8ubW9kZWxQcm92aWRlciA/PyBvcmlnaW5Nb2RlbFByb3ZpZGVyID8/ICdvcGVuYWknLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHBheWxvYWQubW9kZWwsXG5cdFx0XHRcdH07XG5cdFx0XHRcdG1vZGVsc0J5VHVybklkLnNldChwYXlsb2FkLnR1cm5faWQsIGN1cnJlbnRNb2RlbCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmQudHlwZSAhPT0gJ2V2ZW50X21zZycpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBheWxvYWQudHlwZSA9PT0gJ3RocmVhZF9zZXR0aW5nc19hcHBsaWVkJykge1xuXHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IHBheWxvYWQudGhyZWFkX3NldHRpbmdzO1xuXHRcdFx0XHRpZiAoc2V0dGluZ3M/Lm1vZGVsICYmIHNldHRpbmdzLm1vZGVsX3Byb3ZpZGVyX2lkKSB7XG5cdFx0XHRcdFx0Y3VycmVudE1vZGVsID0geyBtb2RlbFByb3ZpZGVyOiBzZXR0aW5ncy5tb2RlbF9wcm92aWRlcl9pZCwgbW9kZWxJZDogc2V0dGluZ3MubW9kZWwgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocGF5bG9hZC50eXBlID09PSAndGFza19zdGFydGVkJyAmJiBwYXlsb2FkLnR1cm5faWQgJiYgY3VycmVudE1vZGVsKSB7XG5cdFx0XHRcdG1vZGVsc0J5VHVybklkLnNldChwYXlsb2FkLnR1cm5faWQsIGN1cnJlbnRNb2RlbCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjY2VwdFRleHQgPSAodGV4dDogc3RyaW5nLCBmbHVzaDogYm9vbGVhbikgPT4ge1xuXHRcdFx0cmVtYWluZGVyICs9IHRleHQ7XG5cdFx0XHRsZXQgbmV3bGluZTogbnVtYmVyO1xuXHRcdFx0d2hpbGUgKChuZXdsaW5lID0gcmVtYWluZGVyLmluZGV4T2YoJ1xcbicpKSA+PSAwKSB7XG5cdFx0XHRcdGFjY2VwdExpbmUocmVtYWluZGVyLnNsaWNlKDAsIG5ld2xpbmUpKTtcblx0XHRcdFx0cmVtYWluZGVyID0gcmVtYWluZGVyLnNsaWNlKG5ld2xpbmUgKyAxKTtcblx0XHRcdH1cblx0XHRcdGlmIChmbHVzaCAmJiByZW1haW5kZXIpIHtcblx0XHRcdFx0YWNjZXB0TGluZShyZW1haW5kZXIpO1xuXHRcdFx0XHRyZW1haW5kZXIgPSAnJztcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGlzdGVuU3RyZWFtKHN0cmVhbSwge1xuXHRcdFx0b25EYXRhOiBkYXRhID0+IGFjY2VwdFRleHQoZGVjb2Rlci53cml0ZShkYXRhLmJ1ZmZlciksIGZhbHNlKSxcblx0XHRcdG9uRXJyb3I6IHJlamVjdCxcblx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdGFjY2VwdFRleHQoZGVjb2Rlci5lbmQoKSwgdHJ1ZSk7XG5cdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdGlzRGVza3RvcCxcblx0XHRcdFx0XHRvcmlnaW5Nb2RlbFByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlbGVjdGVkTW9kZWw6IGN1cnJlbnRNb2RlbCxcblx0XHRcdFx0XHRtb2RlbHNCeVR1cm5JZCxcblx0XHRcdFx0XHR0aHJlYWRDb29yZGluYXRpb25CeVR1cm5JZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUVwQixTQUFTLDZDQUFnRjtBQXlDekYsZUFBc0IseUJBQXlCLGFBQTJCLE1BQThDO0FBQ3ZILFFBQU0sVUFBVSxNQUFNLFlBQVksZUFBZSxJQUFJLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFDbEUsU0FBTyxJQUFJLFFBQStCLENBQUMsU0FBUyxXQUFXO0FBQzlELFVBQU0sVUFBVSxJQUFJLGNBQWMsTUFBTTtBQUN4QyxVQUFNLGlCQUFpQixvQkFBSSxJQUFnQztBQUMzRCxVQUFNLDZCQUE2QixvQkFBSSxJQUE0QztBQUNuRixVQUFNLDRCQUE0QixvQkFBSSxJQUFpRTtBQUN2RyxRQUFJLFlBQVk7QUFDaEIsUUFBSSxZQUFZO0FBQ2hCLFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxhQUFhLENBQUMsU0FBaUI7QUFDcEMsVUFBSSxDQUFDLEtBQUssU0FBUyxnQkFBZ0IsS0FBSyxDQUFDLEtBQUssU0FBUyxnQkFBZ0IsS0FBSyxDQUFDLEtBQUssU0FBUywyQkFBMkIsS0FBSyxDQUFDLEtBQUssU0FBUyxnQkFBZ0IsS0FBSyxDQUFDLEtBQUssU0FBUyxrQkFBa0IsR0FBRztBQUNsTTtBQUFBLE1BQ0Q7QUFDQSxVQUFJO0FBQ0osVUFBSTtBQUNILGlCQUFTLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDekIsUUFBUTtBQUNQO0FBQUEsTUFDRDtBQUNBLFlBQU0sVUFBVSxPQUFPO0FBQ3ZCLFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxN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
