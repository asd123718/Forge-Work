var Osc633EventType = /* @__PURE__ */ ((Osc633EventType2) => {
  Osc633EventType2[Osc633EventType2["PromptStart"] = 0] = "PromptStart";
  Osc633EventType2[Osc633EventType2["CommandStart"] = 1] = "CommandStart";
  Osc633EventType2[Osc633EventType2["CommandExecuted"] = 2] = "CommandExecuted";
  Osc633EventType2[Osc633EventType2["CommandFinished"] = 3] = "CommandFinished";
  Osc633EventType2[Osc633EventType2["CommandLine"] = 4] = "CommandLine";
  Osc633EventType2[Osc633EventType2["Property"] = 5] = "Property";
  return Osc633EventType2;
})(Osc633EventType || {});
function deserializeOscMessage(message) {
  if (message.indexOf("\\") === -1) {
    return message;
  }
  return message.replaceAll(
    /\\(\\|x([0-9a-f]{2}))/gi,
    (_match, op, hex) => hex ? String.fromCharCode(parseInt(hex, 16)) : op
  );
}
function parseOsc633Payload(payload) {
  const semiIdx = payload.indexOf(";");
  if ((semiIdx === -1 ? payload.length : semiIdx) !== 1) {
    return void 0;
  }
  const command = payload[0];
  const argsRaw = semiIdx === -1 ? "" : payload.substring(semiIdx + 1);
  switch (command) {
    case "A":
      return { type: 0 /* PromptStart */ };
    case "B":
      return { type: 1 /* CommandStart */ };
    case "C":
      return { type: 2 /* CommandExecuted */ };
    case "D": {
      const exitCode = argsRaw.length > 0 ? parseInt(argsRaw, 10) : void 0;
      return {
        type: 3 /* CommandFinished */,
        exitCode: exitCode !== void 0 && !isNaN(exitCode) ? exitCode : void 0
      };
    }
    case "E": {
      const nonceIdx = argsRaw.indexOf(";");
      const commandLine = deserializeOscMessage(nonceIdx === -1 ? argsRaw : argsRaw.substring(0, nonceIdx));
      const nonce = nonceIdx === -1 ? void 0 : argsRaw.substring(nonceIdx + 1);
      return { type: 4 /* CommandLine */, commandLine, nonce };
    }
    case "P": {
      const deserialized = deserializeOscMessage(argsRaw);
      const eqIdx = deserialized.indexOf("=");
      if (eqIdx === -1) {
        return void 0;
      }
      return {
        type: 5 /* Property */,
        key: deserialized.substring(0, eqIdx),
        value: deserialized.substring(eqIdx + 1)
      };
    }
    default:
      return void 0;
  }
}
const ESC = "\x1B";
const OSC_START = ESC + "]";
const BEL = "\x07";
const ST = ESC + "\\";
class Osc633Parser {
  constructor() {
    /** Buffer for an incomplete OSC sequence (from ESC] up to but not including the terminator). */
    this._pendingOsc = "";
    /** Whether we are currently accumulating an OSC sequence. */
    this._inOsc = false;
    /** Set when the previous chunk ended with ESC inside an OSC body (potential ST start). */
    this._pendingEscInOsc = false;
  }
  /**
   * Parse a chunk of PTY data.
   * Returns cleaned data (all OSC 633 sequences removed) and extracted events.
   *
   * This is a convenience view over {@link parseSegments} that concatenates the
   * cleaned-data segments and collects the events. Callers that need to know
   * whether a run of output arrived before or after an event (for correct
   * command-output attribution) should use {@link parseSegments} instead.
   */
  parse(data) {
    const events = [];
    let cleanedData = "";
    for (const segment of this.parseSegments(data)) {
      if (segment.kind === "data") {
        cleanedData += segment.data;
      } else {
        events.push(segment.event);
      }
    }
    return { cleanedData, events };
  }
  /**
   * Parse a chunk of PTY data into an ordered list of segments, preserving the
   * relative order of cleaned output data and OSC 633 events as they appear in
   * the stream. Handles partial sequences that span multiple chunks.
   *
   * Preserving order matters because a single PTY read frequently contains a
   * command's output immediately followed by its `CommandFinished` marker;
   * consumers must append that output to the command before handling the
   * finished event, otherwise the output is lost from the command result.
   */
  parseSegments(data) {
    const segments = [];
    let pending = "";
    const appendData = (value) => {
      pending += value;
    };
    const flushData = () => {
      if (pending.length > 0) {
        segments.push({ kind: "data", data: pending });
        pending = "";
      }
    };
    const emitEvent = (event) => {
      flushData();
      segments.push({ kind: "event", event });
    };
    if (!this._inOsc && data.indexOf(OSC_START) === -1) {
      appendData(data);
      flushData();
      return segments;
    }
    let i = 0;
    while (i < data.length) {
      if (this._inOsc) {
        if (this._pendingEscInOsc) {
          this._pendingEscInOsc = false;
          if (data[i] === "\\") {
            i++;
            this._inOsc = false;
            const payload2 = this._pendingOsc;
            this._pendingOsc = "";
            this._handleOscPayload(payload2, emitEvent, appendData, ST);
            continue;
          }
          this._inOsc = false;
          const payload = this._pendingOsc;
          this._pendingOsc = "";
          this._handleOscPayload(payload, emitEvent, appendData);
          continue;
        }
        const result2 = this._consumeOscBody(data, i);
        i = result2.nextIndex;
        if (result2.complete) {
          this._inOsc = false;
          const payload = this._pendingOsc;
          this._pendingOsc = "";
          this._handleOscPayload(payload, emitEvent, appendData, result2.terminator);
        } else if (result2.pendingEsc) {
          this._pendingEscInOsc = true;
        }
        continue;
      }
      const escIdx = data.indexOf(OSC_START, i);
      if (escIdx === -1) {
        appendData(data.substring(i));
        i = data.length;
        continue;
      }
      appendData(data.substring(i, escIdx));
      i = escIdx + 2;
      this._pendingOsc = "";
      this._inOsc = true;
      const result = this._consumeOscBody(data, i);
      i = result.nextIndex;
      if (result.complete) {
        this._inOsc = false;
        const payload = this._pendingOsc;
        this._pendingOsc = "";
        this._handleOscPayload(payload, emitEvent, appendData, result.terminator);
      } else if (result.pendingEsc) {
        this._pendingEscInOsc = true;
      }
    }
    flushData();
    return segments;
  }
  /**
   * Consume characters from the OSC body, appending to _pendingOsc until a
   * terminator (BEL or ST) is found.
   */
  _consumeOscBody(data, startIdx) {
    const belIdx = data.indexOf(BEL, startIdx);
    const escIdx = data.indexOf(ESC, startIdx);
    if (belIdx !== -1 && (escIdx === -1 || belIdx < escIdx)) {
      this._pendingOsc += data.substring(startIdx, belIdx);
      return { nextIndex: belIdx + 1, complete: true, terminator: BEL };
    }
    if (escIdx !== -1) {
      if (escIdx + 1 >= data.length) {
        this._pendingOsc += data.substring(startIdx, escIdx);
        return { nextIndex: data.length, complete: false, pendingEsc: true };
      }
      this._pendingOsc += data.substring(startIdx, escIdx);
      if (data[escIdx + 1] === "\\") {
        return { nextIndex: escIdx + 2, complete: true, terminator: ST };
      }
      return { nextIndex: escIdx, complete: true };
    }
    this._pendingOsc += data.substring(startIdx);
    return { nextIndex: data.length, complete: false };
  }
  /**
   * Process a complete OSC payload. If it's a 633; sequence, extract the
   * event via {@link emitEvent}. Otherwise, reconstruct the original bytes and
   * pass them through to the cleaned output via {@link appendData}.
   */
  _handleOscPayload(payload, emitEvent, appendData, terminator = BEL) {
    if (payload.startsWith("633;")) {
      const oscContent = payload.substring(4);
      const event = parseOsc633Payload(oscContent);
      if (event) {
        emitEvent(event);
      }
    } else {
      appendData(OSC_START + payload + terminator);
    }
  }
}
export {
  Osc633EventType,
  Osc633Parser
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvc2M2MzNQYXJzZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIExpZ2h0d2VpZ2h0IHBhcnNlciBmb3IgT1NDIDYzMyAoVlMgQ29kZSBzaGVsbCBpbnRlZ3JhdGlvbikgc2VxdWVuY2VzIGluIHJhd1xuICogUFRZIG91dHB1dC4gRGVzaWduZWQgZm9yIHRoZSBhZ2VudCBob3N0IHdoZXJlIHdlIGRvbid0IGhhdmUgYSBmdWxsIHh0ZXJtLmpzXG4gKiBpbnN0YW5jZSAtIGl0IHNjYW5zIGRhdGEgY2h1bmtzIGZvciB0aGUgc2VxdWVuY2VzLCBleHRyYWN0cyBldmVudHMsIGFuZFxuICogcmVtb3ZlcyB0aGUgc2VxdWVuY2VzIGZyb20gdGhlIGRhdGEgc3RyZWFtLlxuICpcbiAqIEhhbmRsZXMgcGFydGlhbCBzZXF1ZW5jZXMgdGhhdCBzcGFuIGFjcm9zcyBkYXRhIGNodW5rIGJvdW5kYXJpZXMuXG4gKi9cblxuLyoqIE9TQyA2MzMgZXZlbnQgdHlwZXMgd2UgY2FyZSBhYm91dC4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIE9zYzYzM0V2ZW50VHlwZSB7XG5cdC8qKiA2MzM7QSAtIFByb21wdCBzdGFydC4gVXNlZCB0byBkZXRlY3Qgc2hlbGwgaW50ZWdyYXRpb24gaXMgYWN0aXZlLiAqL1xuXHRQcm9tcHRTdGFydCxcblx0LyoqIDYzMztCIC0gQ29tbWFuZCBzdGFydCAod2hlcmUgdXNlciBpbnB1dHMgY29tbWFuZCkuICovXG5cdENvbW1hbmRTdGFydCxcblx0LyoqIDYzMztDIC0gQ29tbWFuZCBleGVjdXRlZCAob3V0cHV0IGJlZ2lucykuICovXG5cdENvbW1hbmRFeGVjdXRlZCxcblx0LyoqIDYzMztEWztleGl0Q29kZV0gLSBDb21tYW5kIGZpbmlzaGVkLiAqL1xuXHRDb21tYW5kRmluaXNoZWQsXG5cdC8qKiA2MzM7RTtjb21tYW5kTGluZVs7bm9uY2VdIC0gRXhwbGljaXQgY29tbWFuZCBsaW5lLiAqL1xuXHRDb21tYW5kTGluZSxcblx0LyoqIDYzMztQO0tleT1WYWx1ZSAtIFByb3BlcnR5IChlLmcuIEN3ZCkuICovXG5cdFByb3BlcnR5LFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNQcm9tcHRTdGFydEV2ZW50IHtcblx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLlByb21wdFN0YXJ0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNDb21tYW5kU3RhcnRFdmVudCB7XG5cdHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kU3RhcnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9zYzYzM0NvbW1hbmRFeGVjdXRlZEV2ZW50IHtcblx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRFeGVjdXRlZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3NjNjMzQ29tbWFuZEZpbmlzaGVkRXZlbnQge1xuXHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEZpbmlzaGVkO1xuXHRleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNDb21tYW5kTGluZUV2ZW50IHtcblx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRMaW5lO1xuXHRjb21tYW5kTGluZTogc3RyaW5nO1xuXHRub25jZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPc2M2MzNQcm9wZXJ0eUV2ZW50IHtcblx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLlByb3BlcnR5O1xuXHRrZXk6IHN0cmluZztcblx0dmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgT3NjNjMzRXZlbnQgPVxuXHR8IElPc2M2MzNQcm9tcHRTdGFydEV2ZW50XG5cdHwgSU9zYzYzM0NvbW1hbmRTdGFydEV2ZW50XG5cdHwgSU9zYzYzM0NvbW1hbmRFeGVjdXRlZEV2ZW50XG5cdHwgSU9zYzYzM0NvbW1hbmRGaW5pc2hlZEV2ZW50XG5cdHwgSU9zYzYzM0NvbW1hbmRMaW5lRXZlbnRcblx0fCBJT3NjNjMzUHJvcGVydHlFdmVudDtcblxuZXhwb3J0IGludGVyZmFjZSBJT3NjNjMzUGFyc2VSZXN1bHQge1xuXHQvKiogRGF0YSB3aXRoIGFsbCBPU0MgNjMzIHNlcXVlbmNlcyBzdHJpcHBlZC4gKi9cblx0Y2xlYW5lZERhdGE6IHN0cmluZztcblx0LyoqIFBhcnNlZCBldmVudHMgaW4gb3JkZXIgb2YgYXBwZWFyYW5jZS4gKi9cblx0ZXZlbnRzOiBPc2M2MzNFdmVudFtdO1xufVxuXG4vKipcbiAqIEEgc2luZ2xlIHNlZ21lbnQgb2YgcGFyc2VkIFBUWSBkYXRhOiBlaXRoZXIgYSBydW4gb2YgY2xlYW5lZCBvdXRwdXQgZGF0YSBvclxuICogYW4gT1NDIDYzMyBldmVudC4gU2VnbWVudHMgYXJlIGVtaXR0ZWQgaW4gc3RyZWFtIG9yZGVyIHNvIHRoYXQgb3V0cHV0IHdoaWNoXG4gKiBhcnJpdmVzIGJlZm9yZSBhbiBldmVudCAoZS5nLiBhIGBDb21tYW5kRmluaXNoZWRgIG1hcmtlcikgY2FuIGJlIGF0dHJpYnV0ZWRcbiAqIHRvIHRoZSBjb21tYW5kIGJlZm9yZSB0aGUgZXZlbnQgaXMgaGFuZGxlZCBcdTIwMTQgc2VlIHtAbGluayBPc2M2MzNQYXJzZXIucGFyc2VTZWdtZW50c30uXG4gKi9cbmV4cG9ydCB0eXBlIE9zYzYzM1BhcnNlU2VnbWVudCA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnZGF0YSc7IHJlYWRvbmx5IGRhdGE6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnZXZlbnQnOyByZWFkb25seSBldmVudDogT3NjNjMzRXZlbnQgfTtcblxuLyoqXG4gKiBEZWNvZGUgZXNjYXBlZCB2YWx1ZXMgaW4gT1NDIDYzMyBtZXNzYWdlcy5cbiAqIEhhbmRsZXMgYFxcXFxgIC0+IGBcXGAgYW5kIGBcXHhBQmAgLT4gY2hhcmFjdGVyIHdpdGggY29kZSAweEFCLlxuICovXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZU9zY01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKG1lc3NhZ2UuaW5kZXhPZignXFxcXCcpID09PSAtMSkge1xuXHRcdHJldHVybiBtZXNzYWdlO1xuXHR9XG5cdHJldHVybiBtZXNzYWdlLnJlcGxhY2VBbGwoXG5cdFx0L1xcXFwoXFxcXHx4KFswLTlhLWZdezJ9KSkvZ2ksXG5cdFx0KF9tYXRjaDogc3RyaW5nLCBvcDogc3RyaW5nLCBoZXg/OiBzdHJpbmcpID0+IGhleCA/IFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQoaGV4LCAxNikpIDogb3AsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlT3NjNjMzUGF5bG9hZChwYXlsb2FkOiBzdHJpbmcpOiBPc2M2MzNFdmVudCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNlbWlJZHggPSBwYXlsb2FkLmluZGV4T2YoJzsnKTtcblx0aWYgKChzZW1pSWR4ID09PSAtMSA/IHBheWxvYWQubGVuZ3RoIDogc2VtaUlkeCkgIT09IDEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgY29tbWFuZCA9IHBheWxvYWRbMF07XG5cdGNvbnN0IGFyZ3NSYXcgPSBzZW1pSWR4ID09PSAtMSA/ICcnIDogcGF5bG9hZC5zdWJzdHJpbmcoc2VtaUlkeCArIDEpO1xuXG5cdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdGNhc2UgJ0EnOlxuXHRcdFx0cmV0dXJuIHsgdHlwZTogT3NjNjMzRXZlbnRUeXBlLlByb21wdFN0YXJ0IH07XG5cdFx0Y2FzZSAnQic6XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZFN0YXJ0IH07XG5cdFx0Y2FzZSAnQyc6XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEV4ZWN1dGVkIH07XG5cdFx0Y2FzZSAnRCc6IHtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gYXJnc1Jhdy5sZW5ndGggPiAwID8gcGFyc2VJbnQoYXJnc1JhdywgMTApIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRGaW5pc2hlZCxcblx0XHRcdFx0ZXhpdENvZGU6IGV4aXRDb2RlICE9PSB1bmRlZmluZWQgJiYgIWlzTmFOKGV4aXRDb2RlKSA/IGV4aXRDb2RlIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAnRSc6IHtcblx0XHRcdGNvbnN0IG5vbmNlSWR4ID0gYXJnc1Jhdy5pbmRleE9mKCc7Jyk7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZSA9IGRlc2VyaWFsaXplT3NjTWVzc2FnZShub25jZUlkeCA9PT0gLTEgPyBhcmdzUmF3IDogYXJnc1Jhdy5zdWJzdHJpbmcoMCwgbm9uY2VJZHgpKTtcblx0XHRcdGNvbnN0IG5vbmNlID0gbm9uY2VJZHggPT09IC0xID8gdW5kZWZpbmVkIDogYXJnc1Jhdy5zdWJzdHJpbmcobm9uY2VJZHggKyAxKTtcblx0XHRcdHJldHVybiB7IHR5cGU6IE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kTGluZSwgY29tbWFuZExpbmUsIG5vbmNlIH07XG5cdFx0fVxuXHRcdGNhc2UgJ1AnOiB7XG5cdFx0XHRjb25zdCBkZXNlcmlhbGl6ZWQgPSBkZXNlcmlhbGl6ZU9zY01lc3NhZ2UoYXJnc1Jhdyk7XG5cdFx0XHRjb25zdCBlcUlkeCA9IGRlc2VyaWFsaXplZC5pbmRleE9mKCc9Jyk7XG5cdFx0XHRpZiAoZXFJZHggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBPc2M2MzNFdmVudFR5cGUuUHJvcGVydHksXG5cdFx0XHRcdGtleTogZGVzZXJpYWxpemVkLnN1YnN0cmluZygwLCBlcUlkeCksXG5cdFx0XHRcdHZhbHVlOiBkZXNlcmlhbGl6ZWQuc3Vic3RyaW5nKGVxSWR4ICsgMSksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyBPU0MgaW50cm9kdWNlciBpcyBFU0MgXSAoMHgxYiAweDVkKVxuY29uc3QgRVNDID0gJ1xceDFiJztcbmNvbnN0IE9TQ19TVEFSVCA9IEVTQyArICddJztcbi8vIFRlcm1pbmF0b3JzOiBCRUwgKDB4MDcpIG9yIFNUIChFU0MgXFwpXG5jb25zdCBCRUwgPSAnXFx4MDcnO1xuY29uc3QgU1QgPSBFU0MgKyAnXFxcXCc7XG5cbi8qKlxuICogU3RhdGVmdWwgcGFyc2VyIHRoYXQgaGFuZGxlcyBkYXRhIGNodW5rcywgY29ycmVjdGx5IGRlYWxpbmcgd2l0aFxuICogcGFydGlhbCBzZXF1ZW5jZXMgdGhhdCBzcGFuIG11bHRpcGxlIGNodW5rcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE9zYzYzM1BhcnNlciB7XG5cdC8qKiBCdWZmZXIgZm9yIGFuIGluY29tcGxldGUgT1NDIHNlcXVlbmNlIChmcm9tIEVTQ10gdXAgdG8gYnV0IG5vdCBpbmNsdWRpbmcgdGhlIHRlcm1pbmF0b3IpLiAqL1xuXHRwcml2YXRlIF9wZW5kaW5nT3NjID0gJyc7XG5cdC8qKiBXaGV0aGVyIHdlIGFyZSBjdXJyZW50bHkgYWNjdW11bGF0aW5nIGFuIE9TQyBzZXF1ZW5jZS4gKi9cblx0cHJpdmF0ZSBfaW5Pc2MgPSBmYWxzZTtcblx0LyoqIFNldCB3aGVuIHRoZSBwcmV2aW91cyBjaHVuayBlbmRlZCB3aXRoIEVTQyBpbnNpZGUgYW4gT1NDIGJvZHkgKHBvdGVudGlhbCBTVCBzdGFydCkuICovXG5cdHByaXZhdGUgX3BlbmRpbmdFc2NJbk9zYyA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBQYXJzZSBhIGNodW5rIG9mIFBUWSBkYXRhLlxuXHQgKiBSZXR1cm5zIGNsZWFuZWQgZGF0YSAoYWxsIE9TQyA2MzMgc2VxdWVuY2VzIHJlbW92ZWQpIGFuZCBleHRyYWN0ZWQgZXZlbnRzLlxuXHQgKlxuXHQgKiBUaGlzIGlzIGEgY29udmVuaWVuY2UgdmlldyBvdmVyIHtAbGluayBwYXJzZVNlZ21lbnRzfSB0aGF0IGNvbmNhdGVuYXRlcyB0aGVcblx0ICogY2xlYW5lZC1kYXRhIHNlZ21lbnRzIGFuZCBjb2xsZWN0cyB0aGUgZXZlbnRzLiBDYWxsZXJzIHRoYXQgbmVlZCB0byBrbm93XG5cdCAqIHdoZXRoZXIgYSBydW4gb2Ygb3V0cHV0IGFycml2ZWQgYmVmb3JlIG9yIGFmdGVyIGFuIGV2ZW50IChmb3IgY29ycmVjdFxuXHQgKiBjb21tYW5kLW91dHB1dCBhdHRyaWJ1dGlvbikgc2hvdWxkIHVzZSB7QGxpbmsgcGFyc2VTZWdtZW50c30gaW5zdGVhZC5cblx0ICovXG5cdHBhcnNlKGRhdGE6IHN0cmluZyk6IElPc2M2MzNQYXJzZVJlc3VsdCB7XG5cdFx0Y29uc3QgZXZlbnRzOiBPc2M2MzNFdmVudFtdID0gW107XG5cdFx0bGV0IGNsZWFuZWREYXRhID0gJyc7XG5cdFx0Zm9yIChjb25zdCBzZWdtZW50IG9mIHRoaXMucGFyc2VTZWdtZW50cyhkYXRhKSkge1xuXHRcdFx0aWYgKHNlZ21lbnQua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdGNsZWFuZWREYXRhICs9IHNlZ21lbnQuZGF0YTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHNlZ21lbnQuZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBjbGVhbmVkRGF0YSwgZXZlbnRzIH07XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2UgYSBjaHVuayBvZiBQVFkgZGF0YSBpbnRvIGFuIG9yZGVyZWQgbGlzdCBvZiBzZWdtZW50cywgcHJlc2VydmluZyB0aGVcblx0ICogcmVsYXRpdmUgb3JkZXIgb2YgY2xlYW5lZCBvdXRwdXQgZGF0YSBhbmQgT1NDIDYzMyBldmVudHMgYXMgdGhleSBhcHBlYXIgaW5cblx0ICogdGhlIHN0cmVhbS4gSGFuZGxlcyBwYXJ0aWFsIHNlcXVlbmNlcyB0aGF0IHNwYW4gbXVsdGlwbGUgY2h1bmtzLlxuXHQgKlxuXHQgKiBQcmVzZXJ2aW5nIG9yZGVyIG1hdHRlcnMgYmVjYXVzZSBhIHNpbmdsZSBQVFkgcmVhZCBmcmVxdWVudGx5IGNvbnRhaW5zIGFcblx0ICogY29tbWFuZCdzIG91dHB1dCBpbW1lZGlhdGVseSBmb2xsb3dlZCBieSBpdHMgYENvbW1hbmRGaW5pc2hlZGAgbWFya2VyO1xuXHQgKiBjb25zdW1lcnMgbXVzdCBhcHBlbmQgdGhhdCBvdXRwdXQgdG8gdGhlIGNvbW1hbmQgYmVmb3JlIGhhbmRsaW5nIHRoZVxuXHQgKiBmaW5pc2hlZCBldmVudCwgb3RoZXJ3aXNlIHRoZSBvdXRwdXQgaXMgbG9zdCBmcm9tIHRoZSBjb21tYW5kIHJlc3VsdC5cblx0ICovXG5cdHBhcnNlU2VnbWVudHMoZGF0YTogc3RyaW5nKTogT3NjNjMzUGFyc2VTZWdtZW50W10ge1xuXHRcdGNvbnN0IHNlZ21lbnRzOiBPc2M2MzNQYXJzZVNlZ21lbnRbXSA9IFtdO1xuXHRcdGxldCBwZW5kaW5nID0gJyc7XG5cblx0XHRjb25zdCBhcHBlbmREYXRhID0gKHZhbHVlOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdHBlbmRpbmcgKz0gdmFsdWU7XG5cdFx0fTtcblx0XHRjb25zdCBmbHVzaERhdGEgPSAoKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAocGVuZGluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNlZ21lbnRzLnB1c2goeyBraW5kOiAnZGF0YScsIGRhdGE6IHBlbmRpbmcgfSk7XG5cdFx0XHRcdHBlbmRpbmcgPSAnJztcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGVtaXRFdmVudCA9IChldmVudDogT3NjNjMzRXZlbnQpOiB2b2lkID0+IHtcblx0XHRcdGZsdXNoRGF0YSgpO1xuXHRcdFx0c2VnbWVudHMucHVzaCh7IGtpbmQ6ICdldmVudCcsIGV2ZW50IH0pO1xuXHRcdH07XG5cblx0XHRpZiAoIXRoaXMuX2luT3NjICYmIGRhdGEuaW5kZXhPZihPU0NfU1RBUlQpID09PSAtMSkge1xuXHRcdFx0YXBwZW5kRGF0YShkYXRhKTtcblx0XHRcdGZsdXNoRGF0YSgpO1xuXHRcdFx0cmV0dXJuIHNlZ21lbnRzO1xuXHRcdH1cblxuXHRcdGxldCBpID0gMDtcblxuXHRcdHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpIHtcblx0XHRcdGlmICh0aGlzLl9pbk9zYykge1xuXHRcdFx0XHQvLyBIYW5kbGUgRVNDIHRoYXQgd2FzIHBlbmRpbmcgZnJvbSB0aGUgcHJldmlvdXMgY2h1bmsuXG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nRXNjSW5Pc2MpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRXNjSW5Pc2MgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAoZGF0YVtpXSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0XHQvLyBFU0MgXFwgPSBTVCB0ZXJtaW5hdG9yLCBzZXF1ZW5jZSBpcyBjb21wbGV0ZS5cblx0XHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRcdHRoaXMuX2luT3NjID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5fcGVuZGluZ09zYztcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdPc2MgPSAnJztcblx0XHRcdFx0XHRcdHRoaXMuX2hhbmRsZU9zY1BheWxvYWQocGF5bG9hZCwgZW1pdEV2ZW50LCBhcHBlbmREYXRhLCBTVCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gRVNDIHdhcyBub3QgZm9sbG93ZWQgYnkgXFwsIG1hbGZvcm1lZDogY29tcGxldGUgdGhlIE9TQyBhbnl3YXkuXG5cdFx0XHRcdFx0dGhpcy5faW5Pc2MgPSBmYWxzZTtcblx0XHRcdFx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5fcGVuZGluZ09zYztcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nT3NjID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlT3NjUGF5bG9hZChwYXlsb2FkLCBlbWl0RXZlbnQsIGFwcGVuZERhdGEpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2UncmUgaW5zaWRlIGFuIE9TQyBzZXF1ZW5jZSwgbG9vayBmb3IgdGhlIHRlcm1pbmF0b3IuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NvbnN1bWVPc2NCb2R5KGRhdGEsIGkpO1xuXHRcdFx0XHRpID0gcmVzdWx0Lm5leHRJbmRleDtcblx0XHRcdFx0aWYgKHJlc3VsdC5jb21wbGV0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2luT3NjID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29uc3QgcGF5bG9hZCA9IHRoaXMuX3BlbmRpbmdPc2M7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ09zYyA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZU9zY1BheWxvYWQocGF5bG9hZCwgZW1pdEV2ZW50LCBhcHBlbmREYXRhLCByZXN1bHQudGVybWluYXRvcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzdWx0LnBlbmRpbmdFc2MpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRXNjSW5Pc2MgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIElmIG5vdCBjb21wbGV0ZSwgX3BlbmRpbmdPc2MgaGFzIGJlZW4gZXh0ZW5kZWQsIGFuZCB3ZSdyZSBhdCBlbmQgb2YgZGF0YS5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIHRoZSBuZXh0IEVTQyBdIHdoaWNoIHN0YXJ0cyBhbiBPU0Mgc2VxdWVuY2Vcblx0XHRcdGNvbnN0IGVzY0lkeCA9IGRhdGEuaW5kZXhPZihPU0NfU1RBUlQsIGkpO1xuXHRcdFx0aWYgKGVzY0lkeCA9PT0gLTEpIHtcblx0XHRcdFx0YXBwZW5kRGF0YShkYXRhLnN1YnN0cmluZyhpKSk7XG5cdFx0XHRcdGkgPSBkYXRhLmxlbmd0aDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvcHkgZXZlcnl0aGluZyBiZWZvcmUgdGhlIE9TQyBzdGFydCB0byBjbGVhbmVkIG91dHB1dC5cblx0XHRcdGFwcGVuZERhdGEoZGF0YS5zdWJzdHJpbmcoaSwgZXNjSWR4KSk7XG5cblx0XHRcdC8vIFN0YXJ0IG9mIE9TQzogY2hlY2sgaWYgaXQncyA2MzMuXG5cdFx0XHRpID0gZXNjSWR4ICsgMjsgLy8gc2tpcCBwYXN0IEVTQyBdXG5cdFx0XHR0aGlzLl9wZW5kaW5nT3NjID0gJyc7XG5cdFx0XHR0aGlzLl9pbk9zYyA9IHRydWU7XG5cblx0XHRcdC8vIFRyeSB0byBjb25zdW1lIHRoZSBPU0MgYm9keSBpbiB0aGlzIHNhbWUgY2h1bmsuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jb25zdW1lT3NjQm9keShkYXRhLCBpKTtcblx0XHRcdGkgPSByZXN1bHQubmV4dEluZGV4O1xuXHRcdFx0aWYgKHJlc3VsdC5jb21wbGV0ZSkge1xuXHRcdFx0XHR0aGlzLl9pbk9zYyA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5fcGVuZGluZ09zYztcblx0XHRcdFx0dGhpcy5fcGVuZGluZ09zYyA9ICcnO1xuXHRcdFx0XHQvLyBJZiBpdCdzIGEgNjMzIHNlcXVlbmNlLCBleHRyYWN0IGV2ZW50OyBvdGhlcndpc2UgcHV0IGl0IGJhY2sgaW4gY2xlYW5lZC5cblx0XHRcdFx0dGhpcy5faGFuZGxlT3NjUGF5bG9hZChwYXlsb2FkLCBlbWl0RXZlbnQsIGFwcGVuZERhdGEsIHJlc3VsdC50ZXJtaW5hdG9yKTtcblx0XHRcdH0gZWxzZSBpZiAocmVzdWx0LnBlbmRpbmdFc2MpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0VzY0luT3NjID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIElmIG5vdCBjb21wbGV0ZSwgd2UncmUgYXQgZW5kIG9mIGRhdGEgYW5kIF9wZW5kaW5nT3NjIGlzIGJ1ZmZlcmVkLlxuXHRcdH1cblxuXHRcdGZsdXNoRGF0YSgpO1xuXHRcdHJldHVybiBzZWdtZW50cztcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdW1lIGNoYXJhY3RlcnMgZnJvbSB0aGUgT1NDIGJvZHksIGFwcGVuZGluZyB0byBfcGVuZGluZ09zYyB1bnRpbCBhXG5cdCAqIHRlcm1pbmF0b3IgKEJFTCBvciBTVCkgaXMgZm91bmQuXG5cdCAqL1xuXHRwcml2YXRlIF9jb25zdW1lT3NjQm9keShkYXRhOiBzdHJpbmcsIHN0YXJ0SWR4OiBudW1iZXIpOiB7IG5leHRJbmRleDogbnVtYmVyOyBjb21wbGV0ZTogYm9vbGVhbjsgcGVuZGluZ0VzYz86IGJvb2xlYW47IHRlcm1pbmF0b3I/OiBzdHJpbmcgfSB7XG5cdFx0Y29uc3QgYmVsSWR4ID0gZGF0YS5pbmRleE9mKEJFTCwgc3RhcnRJZHgpO1xuXHRcdGNvbnN0IGVzY0lkeCA9IGRhdGEuaW5kZXhPZihFU0MsIHN0YXJ0SWR4KTtcblxuXHRcdGlmIChiZWxJZHggIT09IC0xICYmIChlc2NJZHggPT09IC0xIHx8IGJlbElkeCA8IGVzY0lkeCkpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdPc2MgKz0gZGF0YS5zdWJzdHJpbmcoc3RhcnRJZHgsIGJlbElkeCk7XG5cdFx0XHRyZXR1cm4geyBuZXh0SW5kZXg6IGJlbElkeCArIDEsIGNvbXBsZXRlOiB0cnVlLCB0ZXJtaW5hdG9yOiBCRUwgfTtcblx0XHR9XG5cblx0XHRpZiAoZXNjSWR4ICE9PSAtMSkge1xuXHRcdFx0aWYgKGVzY0lkeCArIDEgPj0gZGF0YS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ09zYyArPSBkYXRhLnN1YnN0cmluZyhzdGFydElkeCwgZXNjSWR4KTtcblx0XHRcdFx0cmV0dXJuIHsgbmV4dEluZGV4OiBkYXRhLmxlbmd0aCwgY29tcGxldGU6IGZhbHNlLCBwZW5kaW5nRXNjOiB0cnVlIH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3BlbmRpbmdPc2MgKz0gZGF0YS5zdWJzdHJpbmcoc3RhcnRJZHgsIGVzY0lkeCk7XG5cdFx0XHRpZiAoZGF0YVtlc2NJZHggKyAxXSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdHJldHVybiB7IG5leHRJbmRleDogZXNjSWR4ICsgMiwgY29tcGxldGU6IHRydWUsIHRlcm1pbmF0b3I6IFNUIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG5leHRJbmRleDogZXNjSWR4LCBjb21wbGV0ZTogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdPc2MgKz0gZGF0YS5zdWJzdHJpbmcoc3RhcnRJZHgpO1xuXHRcdHJldHVybiB7IG5leHRJbmRleDogZGF0YS5sZW5ndGgsIGNvbXBsZXRlOiBmYWxzZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2Nlc3MgYSBjb21wbGV0ZSBPU0MgcGF5bG9hZC4gSWYgaXQncyBhIDYzMzsgc2VxdWVuY2UsIGV4dHJhY3QgdGhlXG5cdCAqIGV2ZW50IHZpYSB7QGxpbmsgZW1pdEV2ZW50fS4gT3RoZXJ3aXNlLCByZWNvbnN0cnVjdCB0aGUgb3JpZ2luYWwgYnl0ZXMgYW5kXG5cdCAqIHBhc3MgdGhlbSB0aHJvdWdoIHRvIHRoZSBjbGVhbmVkIG91dHB1dCB2aWEge0BsaW5rIGFwcGVuZERhdGF9LlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlT3NjUGF5bG9hZChcblx0XHRwYXlsb2FkOiBzdHJpbmcsXG5cdFx0ZW1pdEV2ZW50OiAoZXZlbnQ6IE9zYzYzM0V2ZW50KSA9PiB2b2lkLFxuXHRcdGFwcGVuZERhdGE6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0dGVybWluYXRvciA9IEJFTCxcblx0KTogdm9pZCB7XG5cdFx0aWYgKHBheWxvYWQuc3RhcnRzV2l0aCgnNjMzOycpKSB7XG5cdFx0XHRjb25zdCBvc2NDb250ZW50ID0gcGF5bG9hZC5zdWJzdHJpbmcoNCk7IC8vIHN0cmlwIFwiNjMzO1wiXG5cdFx0XHRjb25zdCBldmVudCA9IHBhcnNlT3NjNjMzUGF5bG9hZChvc2NDb250ZW50KTtcblx0XHRcdGlmIChldmVudCkge1xuXHRcdFx0XHRlbWl0RXZlbnQoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gNjMzIHNlcXVlbmNlcyBhcmUgYWx3YXlzIHN0cmlwcGVkIGZyb20gb3V0cHV0XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vbi02MzMgT1NDOiBwdXQgYmFjayB0aGUgb3JpZ2luYWwgYnl0ZXMuXG5cdFx0XHRhcHBlbmREYXRhKE9TQ19TVEFSVCArIHBheWxvYWQgKyB0ZXJtaW5hdG9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQWVPLElBQVcsa0JBQVgsa0JBQVdBLHFCQUFYO0FBRU4sRUFBQUEsa0NBQUE7QUFFQSxFQUFBQSxrQ0FBQTtBQUVBLEVBQUFBLGtDQUFBO0FBRUEsRUFBQUEsa0NBQUE7QUFFQSxFQUFBQSxrQ0FBQTtBQUVBLEVBQUFBLGtDQUFBO0FBWmlCLFNBQUFBO0FBQUEsR0FBQTtBQXlFbEIsU0FBUyxzQkFBc0IsU0FBeUI7QUFDdkQsTUFBSSxRQUFRLFFBQVEsSUFBSSxNQUFNLElBQUk7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLFFBQVE7QUFBQSxJQUNkO0FBQUEsSUFDQSxDQUFDLFFBQWdCLElBQVksUUFBaUIsTUFBTSxPQUFPLGFBQWEsU0FBUyxLQUFLLEVBQUUsQ0FBQyxJQUFJO0FBQUEsRUFDOUY7QUFDRDtBQUVBLFNBQVMsbUJBQW1CLFNBQTBDO0FBQ3JFLFFBQU0sVUFBVSxRQUFRLFFBQVEsR0FBRztBQUNuQyxPQUFLLFlBQVksS0FBSyxRQUFRLFNBQVMsYUFBYSxHQUFHO0FBQ3RELFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxVQUFVLFFBQVEsQ0FBQztBQUN6QixRQUFNLFVBQVUsWUFBWSxLQUFLLEtBQUssUUFBUSxVQUFVLFVBQVUsQ0FBQztBQUVuRSxVQUFRLFNBQVM7QUFBQSxJQUNoQixLQUFLO0FBQ0osYUFBTyxFQUFFLE1BQU0sb0JBQTRCO0FBQUEsSUFDNUMsS0FBSztBQUNKLGFBQU8sRUFBRSxNQUFNLHFCQUE2QjtBQUFBLElBQzdDLEtBQUs7QUFDSixhQUFPLEVBQUUsTUFBTSx3QkFBZ0M7QUFBQSxJQUNoRCxLQUFLLEtBQUs7QUFDVCxZQUFNLFdBQVcsUUFBUSxTQUFTLElBQUksU0FBUyxTQUFTLEVBQUUsSUFBSTtBQUM5RCxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixVQUFVLGFBQWEsVUFBYSxDQUFDLE1BQU0sUUFBUSxJQUFJLFdBQVc7QUFBQSxNQUNuRTtBQUFBLElBQ0Q7QUFBQSxJQUNBLEtBQUssS0FBSztBQUNULFlBQU0sV0FBVyxRQUFRLFFBQVEsR0FBRztBQUNwQyxZQUFNLGNBQWMsc0JBQXNCLGFBQWEsS0FBSyxVQUFVLFFBQVEsVUFBVSxHQUFHLFFBQVEsQ0FBQztBQUNwRyxZQUFNLFFBQVEsYUFBYSxLQUFLLFNBQVksUUFBUSxVQUFVLFdBQVcsQ0FBQztBQUMxRSxhQUFPLEVBQUUsTUFBTSxxQkFBNkIsYUFBYSxNQUFNO0FBQUEsSUFDaEU7QUFBQSxJQUNBLEtBQUssS0FBSztBQUNULFlBQU0sZUFBZSxzQkFBc0IsT0FBTztBQUNsRCxZQUFNLFFBQVEsYUFBYSxRQUFRLEdBQUc7QUFDdEMsVUFBSSxVQUFVLElBQUk7QUFDakIsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixLQUFLLGFBQWEsVUFBVSxHQUFHLEtBQUs7QUFBQSxRQUNwQyxPQUFPLGFBQWEsVUFBVSxRQUFRLENBQUM7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFBQSxJQUNBO0FBQ0MsYUFBTztBQUFBLEVBQ1Q7QUFDRDtBQUdBLE1BQU0sTUFBTTtBQUNaLE1BQU0sWUFBWSxNQUFNO0FBRXhCLE1BQU0sTUFBTTtBQUNaLE1BQU0sS0FBSyxNQUFNO0FBTVYsTUFBTSxhQUFhO0FBQUEsRUFBbkI7QUFFTjtBQUFBLFNBQVEsY0FBYztBQUV0QjtBQUFBLFNBQVEsU0FBUztBQUVqQjtBQUFBLFNBQVEsbUJBQW1CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVczQixNQUFNLE1BQWtDO0FBQ3ZDLFVBQU0sU0FBd0IsQ0FBQztBQUMvQixRQUFJLGNBQWM7QUFDbEIsZUFBVyxXQUFXLEtBQUssY0FBYyxJQUFJLEdBQUc7QUFDL0MsVUFBSSxRQUFRLFNBQVMsUUFBUTtBQUM1Qix1QkFBZSxRQUFRO0FBQUEsTUFDeEIsT0FBTztBQUNOLGVBQU8sS0FBSyxRQUFRLEtBQUs7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFDQSxXQUFPLEVBQUUsYUFBYSxPQUFPO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEsY0FBYyxNQUFvQztBQUNqRCxVQUFNLFdBQWlDLENBQUM7QUFDeEMsUUFBSSxVQUFVO0FBRWQsVUFBTSxhQUFhLENBQUMsVUFBd0I7QUFDM0MsaUJBQVc7QUFBQSxJQUNaO0FBQ0EsVUFBTSxZQUFZLE1BQVk7QUFDN0IsVUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixpQkFBUyxLQUFLLEVBQUUsTUFBTSxRQUFRLE1BQU0sUUFBUSxDQUFDO0FBQzdDLGtCQUFVO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksQ0FBQyxVQUE2QjtBQUMvQyxnQkFBVTtBQUNWLGVBQVMsS0FBSyxFQUFFLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFBQSxJQUN2QztBQUVBLFFBQUksQ0FBQyxLQUFLLFVBQVUsS0FBSyxRQUFRLFNBQVMsTUFBTSxJQUFJO0FBQ25ELGlCQUFXLElBQUk7QUFDZixnQkFBVTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxJQUFJO0FBRVIsV0FBTyxJQUFJLEtBQUssUUFBUTtBQUN2QixVQUFJLEtBQUssUUFBUTtBQUVoQixZQUFJLEtBQUssa0JBQWtCO0FBQzFCLGVBQUssbUJBQW1CO0FBQ3hCLGNBQUksS0FBSyxDQUFDLE1BQU0sTUFBTTtBQUVyQjtBQUNBLGlCQUFLLFNBQVM7QUFDZCxrQkFBTUMsV0FBVSxLQUFLO0FBQ3JCLGlCQUFLLGNBQWM7QUFDbkIsaUJBQUssa0JBQWtCQSxVQUFTLFdBQVcsWUFBWSxFQUFFO0FBQ3pEO0FBQUEsVUFDRDtBQUVBLGVBQUssU0FBUztBQUNkLGdCQUFNLFVBQVUsS0FBSztBQUNyQixlQUFLLGNBQWM7QUFDbkIsZUFBSyxrQkFBa0IsU0FBUyxXQUFXLFVBQVU7QUFDckQ7QUFBQSxRQUNEO0FBR0EsY0FBTUMsVUFBUyxLQUFLLGdCQUFnQixNQUFNLENBQUM7QUFDM0MsWUFBSUEsUUFBTztBQUNYLFlBQUlBLFFBQU8sVUFBVTtBQUNwQixlQUFLLFNBQVM7QUFDZCxnQkFBTSxVQUFVLEtBQUs7QUFDckIsZUFBSyxjQUFjO0FBQ25CLGVBQUssa0JBQWtCLFNBQVMsV0FBVyxZQUFZQSxRQUFPLFVBQVU7QUFBQSxRQUN6RSxXQUFXQSxRQUFPLFlBQVk7QUFDN0IsZUFBSyxtQkFBbUI7QUFBQSxRQUN6QjtBQUVBO0FBQUEsTUFDRDtBQUdBLFlBQU0sU0FBUyxLQUFLLFFBQVEsV0FBVyxDQUFDO0FBQ3hDLFVBQUksV0FBVyxJQUFJO0FBQ2xCLG1CQUFXLEtBQUssVUFBVSxDQUFDLENBQUM7QUFDNUIsWUFBSSxLQUFLO0FBQ1Q7QUFBQSxNQUNEO0FBR0EsaUJBQVcsS0FBSyxVQUFVLEdBQUcsTUFBTSxDQUFDO0FBR3BDLFVBQUksU0FBUztBQUNiLFdBQUssY0FBYztBQUNuQixXQUFLLFNBQVM7QUFHZCxZQUFNLFNBQVMsS0FBSyxnQkFBZ0IsTUFBTSxDQUFDO0FBQzNDLFVBQUksT0FBTztBQUNYLFVBQUksT0FBTyxVQUFVO0FBQ3BCLGFBQUssU0FBUztBQUNkLGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGFBQUssY0FBYztBQUVuQixhQUFLLGtCQUFrQixTQUFTLFdBQVcsWUFBWSxPQUFPLFVBQVU7QUFBQSxNQUN6RSxXQUFXLE9BQU8sWUFBWTtBQUM3QixhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCO0FBQUEsSUFFRDtBQUVBLGNBQVU7QUFDVixXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxnQkFBZ0IsTUFBYyxVQUF1RztBQUM1SSxVQUFNLFNBQVMsS0FBSyxRQUFRLEtBQUssUUFBUTtBQUN6QyxVQUFNLFNBQVMsS0FBSyxRQUFRLEtBQUssUUFBUTtBQUV6QyxRQUFJLFdBQVcsT0FBTyxXQUFXLE1BQU0sU0FBUyxTQUFTO0FBQ3hELFdBQUssZUFBZSxLQUFLLFVBQVUsVUFBVSxNQUFNO0FBQ25ELGFBQU8sRUFBRSxXQUFXLFNBQVMsR0FBRyxVQUFVLE1BQU0sWUFBWSxJQUFJO0FBQUEsSUFDakU7QUFFQSxRQUFJLFdBQVcsSUFBSTtBQUNsQixVQUFJLFNBQVMsS0FBSyxLQUFLLFFBQVE7QUFDOUIsYUFBSyxlQUFlLEtBQUssVUFBVSxVQUFVLE1BQU07QUFDbkQsZUFBTyxFQUFFLFdBQVcsS0FBSyxRQUFRLFVBQVUsT0FBTyxZQUFZLEtBQUs7QUFBQSxNQUNwRTtBQUVBLFdBQUssZUFBZSxLQUFLLFVBQVUsVUFBVSxNQUFNO0FBQ25ELFVBQUksS0FBSyxTQUFTLENBQUMsTUFBTSxNQUFNO0FBQzlCLGVBQU8sRUFBRSxXQUFXLFNBQVMsR0FBRyxVQUFVLE1BQU0sWUFBWSxHQUFHO0FBQUEsTUFDaEU7QUFFQSxhQUFPLEVBQUUsV0FBVyxRQUFRLFVBQVUsS0FBSztBQUFBLElBQzVDO0FBRUEsU0FBSyxlQUFlLEtBQUssVUFBVSxRQUFRO0FBQzNDLFdBQU8sRUFBRSxXQUFXLEtBQUssUUFBUSxVQUFVLE1BQU07QUFBQSxFQUNsRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLGtCQUNQLFNBQ0EsV0FDQSxZQUNBLGFBQWEsS0FDTjtBQUNQLFFBQUksUUFBUSxXQUFXLE1BQU0sR0FBRztBQUMvQixZQUFNLGFBQWEsUUFBUSxVQUFVLENBQUM7QUFDdEMsWUFBTSxRQUFRLG1CQUFtQixVQUFVO0FBQzNDLFVBQUksT0FBTztBQUNWLGtCQUFVLEtBQUs7QUFBQSxNQUNoQjtBQUFBLElBRUQsT0FBTztBQUVOLGlCQUFXLFlBQVksVUFBVSxVQUFVO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIk9zYzYzM0V2ZW50VHlwZSIsICJwYXlsb2FkIiwgInJlc3VsdCJdCn0K
