import { AgentSession } from "../../common/agent.js";
import { isSubagentSession } from "../../common/state/sessionState.js";
import { toInitiatorTelemetry } from "../agentHostTelemetryReporter.js";
function reportCopilotTodoStoreOperation(telemetryService, session, toolCallId, toolName, toolInput, clientContext) {
  const operation = getCopilotTodoStoreOperationData(toolName, toolInput);
  if (!operation) {
    return;
  }
  telemetryService.publicLog2("todoStoreOperation", {
    ...toInitiatorTelemetry(clientContext),
    ...operation,
    toolCallId,
    provider: session.scheme,
    agentSessionId: AgentSession.id(session),
    isSubagentSession: isSubagentSession(session)
  });
}
function getCopilotTodoStoreOperationData(toolName, toolInput) {
  if (toolName !== "sql") {
    return void 0;
  }
  const query = toolInput?.query;
  if (typeof query !== "string") {
    return void 0;
  }
  const tokens = tokenizeSql(query);
  const readTargets = /* @__PURE__ */ new Set();
  const writeTargets = /* @__PURE__ */ new Set();
  const deleteFromIndexes = /* @__PURE__ */ new Set();
  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i].value) {
      case "insert":
      case "replace": {
        const intoIndex = findToken(tokens, i + 1, "into", ["or", "rollback", "abort", "replace", "fail", "ignore"]);
        addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, intoIndex + 1));
        break;
      }
      case "update":
        addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, i + 1, ["or", "rollback", "abort", "replace", "fail", "ignore"]));
        break;
      case "delete": {
        const fromIndex = findToken(tokens, i + 1, "from");
        deleteFromIndexes.add(fromIndex);
        addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, fromIndex + 1));
        break;
      }
      case "create":
      case "drop":
      case "alter": {
        const tableIndex = findToken(tokens, i + 1, "table", ["temp", "temporary"]);
        addTodoStoreTarget(writeTargets, readTableIdentifier(tokens, tableIndex + 1, ["if", "not", "exists"]));
        break;
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === "from" && !deleteFromIndexes.has(i)) {
      addFromClauseTargets(tokens, i + 1, readTargets);
    } else if (tokens[i].value === "join") {
      addTodoStoreTarget(readTargets, readTableIdentifier(tokens, i + 1));
    }
  }
  if (readTargets.size === 0 && writeTargets.size === 0) {
    return void 0;
  }
  const referencesTodos = readTargets.has("todos") || writeTargets.has("todos");
  const referencesTodoDeps = readTargets.has("todo_deps") || writeTargets.has("todo_deps");
  return {
    operation: readTargets.size > 0 && writeTargets.size > 0 ? "mixed" : writeTargets.size > 0 ? "write" : "read",
    target: referencesTodos && referencesTodoDeps ? "both" : referencesTodoDeps ? "todo_deps" : "todos"
  };
}
function tokenizeSql(query) {
  const tokens = [];
  for (let i = 0; i < query.length; ) {
    const char = query[i];
    const next = query[i + 1];
    if (/\s/.test(char)) {
      i++;
    } else if (char === "-" && next === "-") {
      i = skipUntil(query, i + 2, "\n");
    } else if (char === "/" && next === "*") {
      i = skipUntil(query, i + 2, "*/");
    } else if (char === "'") {
      i = skipQuoted(query, i + 1, "'", "'");
    } else if (char === '"' || char === "`") {
      const end = skipQuoted(query, i + 1, char, char);
      tokens.push({ value: query.slice(i + 1, end - 1).replaceAll(char + char, char).toLowerCase(), kind: "identifier" });
      i = end;
    } else if (char === "[") {
      const end = skipQuoted(query, i + 1, "]", "]");
      tokens.push({ value: query.slice(i + 1, end - 1).replaceAll("]]", "]").toLowerCase(), kind: "identifier" });
      i = end;
    } else if (/[a-z_$]/i.test(char)) {
      let end = i + 1;
      while (end < query.length && /[\w$]/.test(query[end])) {
        end++;
      }
      tokens.push({ value: query.slice(i, end).toLowerCase(), kind: "identifier" });
      i = end;
    } else {
      if (char === "." || char === "," || char === "(" || char === ")" || char === ";") {
        tokens.push({ value: char, kind: "punctuation" });
      }
      i++;
    }
  }
  return tokens;
}
function skipUntil(query, start, terminator) {
  const index = query.indexOf(terminator, start);
  return index === -1 ? query.length : index + terminator.length;
}
function skipQuoted(query, start, terminator, escape) {
  for (let i = start; i < query.length; i++) {
    if (query[i] !== terminator) {
      continue;
    }
    if (query[i + 1] === escape) {
      i++;
    } else {
      return i + 1;
    }
  }
  return query.length;
}
function findToken(tokens, start, value, skippedValues = []) {
  for (let i = start; i < tokens.length && tokens[i].value !== ";"; i++) {
    if (tokens[i].value === value) {
      return i;
    }
    if (!skippedValues.includes(tokens[i].value)) {
      break;
    }
  }
  return -1;
}
function readTableIdentifier(tokens, start, skippedValues = []) {
  let index = start;
  while (index < tokens.length && skippedValues.includes(tokens[index].value)) {
    index++;
  }
  if (tokens[index]?.kind !== "identifier") {
    return void 0;
  }
  let table = tokens[index].value;
  while (tokens[index + 1]?.value === "." && tokens[index + 2]?.kind === "identifier") {
    table = tokens[index + 2].value;
    index += 2;
  }
  return table;
}
function addFromClauseTargets(tokens, start, targets) {
  const terminators = /* @__PURE__ */ new Set(["where", "group", "order", "having", "limit", "union", "intersect", "except", "returning", "set", "values", ";"]);
  let expectsTable = true;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const value = tokens[i].value;
    if (value === "(") {
      if (depth === 0 && expectsTable) {
        expectsTable = false;
      }
      depth++;
    } else if (value === ")") {
      if (depth === 0) {
        return;
      }
      depth--;
    } else if (depth === 0 && terminators.has(value)) {
      return;
    } else if (depth === 0 && (value === "," || value === "join")) {
      expectsTable = true;
    } else if (depth === 0 && expectsTable && tokens[i].kind === "identifier") {
      addTodoStoreTarget(targets, readTableIdentifier(tokens, i));
      expectsTable = false;
    }
  }
}
function addTodoStoreTarget(targets, identifier) {
  if (identifier === "todos" || identifier === "todo_deps") {
    targets.add(identifier);
  }
}
export {
  getCopilotTodoStoreOperationData,
  reportCopilotTodoStoreOperation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90VG9kb1N0b3JlVGVsZW1ldHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaXNTdWJhZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IHRvSW5pdGlhdG9yVGVsZW1ldHJ5LCB0eXBlIElBZ2VudEhvc3RJbml0aWF0b3JDbGFzc2lmaWNhdGlvbiwgdHlwZSBJQWdlbnRIb3N0SW5pdGlhdG9yVGVsZW1ldHJ5IH0gZnJvbSAnLi4vYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuXG50eXBlIFRvZG9TdG9yZU9wZXJhdGlvbiA9ICdyZWFkJyB8ICd3cml0ZScgfCAnbWl4ZWQnO1xudHlwZSBUb2RvU3RvcmVUYXJnZXQgPSAndG9kb3MnIHwgJ3RvZG9fZGVwcycgfCAnYm90aCc7XG5cbnR5cGUgVG9kb1N0b3JlT3BlcmF0aW9uRXZlbnQgPSBJQWdlbnRIb3N0SW5pdGlhdG9yVGVsZW1ldHJ5ICYge1xuXHRvcGVyYXRpb246IFRvZG9TdG9yZU9wZXJhdGlvbjtcblx0dGFyZ2V0OiBUb2RvU3RvcmVUYXJnZXQ7XG5cdHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cHJvdmlkZXI6IHN0cmluZztcblx0YWdlbnRTZXNzaW9uSWQ6IHN0cmluZztcblx0aXNTdWJhZ2VudFNlc3Npb246IGJvb2xlYW47XG59O1xuXG50eXBlIFRvZG9TdG9yZU9wZXJhdGlvbkNsYXNzaWZpY2F0aW9uID0gSUFnZW50SG9zdEluaXRpYXRvckNsYXNzaWZpY2F0aW9uICYge1xuXHRvcGVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBTUUwgb3BlcmF0aW9uIHJlYWQgZnJvbSwgd3JvdGUgdG8sIG9yIGJvdGggcmVhZCBmcm9tIGFuZCB3cm90ZSB0byB0b2RvIHN0b3JhZ2UuJyB9O1xuXHR0YXJnZXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBTUUwgb3BlcmF0aW9uIHJlZmVyZW5jZWQgdG9kbyBpdGVtcywgdG9kbyBkZXBlbmRlbmNpZXMsIG9yIGJvdGguJyB9O1xuXHR0b29sQ2FsbElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIFNRTCB0b29sIGNhbGwsIHVzZWQgdG8gY29ycmVsYXRlIHdpdGggZ2VuZXJpYyB0b29sIHRlbGVtZXRyeS4nIH07XG5cdHByb3ZpZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByb3ZpZGVyIGhhbmRsaW5nIHRoZSBhZ2VudCBob3N0IHNlc3Npb24uJyB9O1xuXHRhZ2VudFNlc3Npb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhZ2VudCBob3N0IHNlc3Npb24gaWRlbnRpZmllci4nIH07XG5cdGlzU3ViYWdlbnRTZXNzaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgdG9kbyBzdG9yYWdlIG9wZXJhdGlvbiBiZWxvbmdzIHRvIGEgc3ViYWdlbnQgc2Vzc2lvbi4nIH07XG5cdG93bmVyOiAnYW11bmdlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgc3VjY2Vzc2Z1bCBDb3BpbG90IENMSSBTUUwgb3BlcmF0aW9ucyB0aGF0IGFjY2VzcyB0b2RvIGl0ZW0gb3IgZGVwZW5kZW5jeSBzdG9yYWdlLic7XG59O1xuXG5pbnRlcmZhY2UgSVRvZG9TdG9yZU9wZXJhdGlvbkRhdGEge1xuXHRyZWFkb25seSBvcGVyYXRpb246IFRvZG9TdG9yZU9wZXJhdGlvbjtcblx0cmVhZG9ubHkgdGFyZ2V0OiBUb2RvU3RvcmVUYXJnZXQ7XG59XG5cbmludGVyZmFjZSBJU3FsVG9rZW4ge1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBraW5kOiAnaWRlbnRpZmllcicgfCAncHVuY3R1YXRpb24nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVwb3J0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbih0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSwgc2Vzc2lvbjogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIHRvb2xJbnB1dDogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHwgdW5kZWZpbmVkLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0Y29uc3Qgb3BlcmF0aW9uID0gZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEodG9vbE5hbWUsIHRvb2xJbnB1dCk7XG5cdGlmICghb3BlcmF0aW9uKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRvZG9TdG9yZU9wZXJhdGlvbkV2ZW50LCBUb2RvU3RvcmVPcGVyYXRpb25DbGFzc2lmaWNhdGlvbj4oJ3RvZG9TdG9yZU9wZXJhdGlvbicsIHtcblx0XHQuLi50b0luaXRpYXRvclRlbGVtZXRyeShjbGllbnRDb250ZXh0KSxcblx0XHQuLi5vcGVyYXRpb24sXG5cdFx0dG9vbENhbGxJZCxcblx0XHRwcm92aWRlcjogc2Vzc2lvbi5zY2hlbWUsXG5cdFx0YWdlbnRTZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRpc1N1YmFnZW50U2Vzc2lvbjogaXNTdWJhZ2VudFNlc3Npb24oc2Vzc2lvbiksXG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbkRhdGEodG9vbE5hbWU6IHN0cmluZywgdG9vbElucHV0OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gfCB1bmRlZmluZWQpOiBJVG9kb1N0b3JlT3BlcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICh0b29sTmFtZSAhPT0gJ3NxbCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcXVlcnkgPSB0b29sSW5wdXQ/LnF1ZXJ5O1xuXHRpZiAodHlwZW9mIHF1ZXJ5ICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB0b2tlbnMgPSB0b2tlbml6ZVNxbChxdWVyeSk7XG5cdGNvbnN0IHJlYWRUYXJnZXRzID0gbmV3IFNldDxUb2RvU3RvcmVUYXJnZXQ+KCk7XG5cdGNvbnN0IHdyaXRlVGFyZ2V0cyA9IG5ldyBTZXQ8VG9kb1N0b3JlVGFyZ2V0PigpO1xuXHRjb25zdCBkZWxldGVGcm9tSW5kZXhlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0c3dpdGNoICh0b2tlbnNbaV0udmFsdWUpIHtcblx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRjYXNlICdyZXBsYWNlJzoge1xuXHRcdFx0XHRjb25zdCBpbnRvSW5kZXggPSBmaW5kVG9rZW4odG9rZW5zLCBpICsgMSwgJ2ludG8nLCBbJ29yJywgJ3JvbGxiYWNrJywgJ2Fib3J0JywgJ3JlcGxhY2UnLCAnZmFpbCcsICdpZ25vcmUnXSk7XG5cdFx0XHRcdGFkZFRvZG9TdG9yZVRhcmdldCh3cml0ZVRhcmdldHMsIHJlYWRUYWJsZUlkZW50aWZpZXIodG9rZW5zLCBpbnRvSW5kZXggKyAxKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndXBkYXRlJzpcblx0XHRcdFx0YWRkVG9kb1N0b3JlVGFyZ2V0KHdyaXRlVGFyZ2V0cywgcmVhZFRhYmxlSWRlbnRpZmllcih0b2tlbnMsIGkgKyAxLCBbJ29yJywgJ3JvbGxiYWNrJywgJ2Fib3J0JywgJ3JlcGxhY2UnLCAnZmFpbCcsICdpZ25vcmUnXSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2RlbGV0ZSc6IHtcblx0XHRcdFx0Y29uc3QgZnJvbUluZGV4ID0gZmluZFRva2VuKHRva2VucywgaSArIDEsICdmcm9tJyk7XG5cdFx0XHRcdGRlbGV0ZUZyb21JbmRleGVzLmFkZChmcm9tSW5kZXgpO1xuXHRcdFx0XHRhZGRUb2RvU3RvcmVUYXJnZXQod3JpdGVUYXJnZXRzLCByZWFkVGFibGVJZGVudGlmaWVyKHRva2VucywgZnJvbUluZGV4ICsgMSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NyZWF0ZSc6XG5cdFx0XHRjYXNlICdkcm9wJzpcblx0XHRcdGNhc2UgJ2FsdGVyJzoge1xuXHRcdFx0XHRjb25zdCB0YWJsZUluZGV4ID0gZmluZFRva2VuKHRva2VucywgaSArIDEsICd0YWJsZScsIFsndGVtcCcsICd0ZW1wb3JhcnknXSk7XG5cdFx0XHRcdGFkZFRvZG9TdG9yZVRhcmdldCh3cml0ZVRhcmdldHMsIHJlYWRUYWJsZUlkZW50aWZpZXIodG9rZW5zLCB0YWJsZUluZGV4ICsgMSwgWydpZicsICdub3QnLCAnZXhpc3RzJ10pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnZnJvbScgJiYgIWRlbGV0ZUZyb21JbmRleGVzLmhhcyhpKSkge1xuXHRcdFx0YWRkRnJvbUNsYXVzZVRhcmdldHModG9rZW5zLCBpICsgMSwgcmVhZFRhcmdldHMpO1xuXHRcdH0gZWxzZSBpZiAodG9rZW5zW2ldLnZhbHVlID09PSAnam9pbicpIHtcblx0XHRcdGFkZFRvZG9TdG9yZVRhcmdldChyZWFkVGFyZ2V0cywgcmVhZFRhYmxlSWRlbnRpZmllcih0b2tlbnMsIGkgKyAxKSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHJlYWRUYXJnZXRzLnNpemUgPT09IDAgJiYgd3JpdGVUYXJnZXRzLnNpemUgPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVmZXJlbmNlc1RvZG9zID0gcmVhZFRhcmdldHMuaGFzKCd0b2RvcycpIHx8IHdyaXRlVGFyZ2V0cy5oYXMoJ3RvZG9zJyk7XG5cdGNvbnN0IHJlZmVyZW5jZXNUb2RvRGVwcyA9IHJlYWRUYXJnZXRzLmhhcygndG9kb19kZXBzJykgfHwgd3JpdGVUYXJnZXRzLmhhcygndG9kb19kZXBzJyk7XG5cdHJldHVybiB7XG5cdFx0b3BlcmF0aW9uOiByZWFkVGFyZ2V0cy5zaXplID4gMCAmJiB3cml0ZVRhcmdldHMuc2l6ZSA+IDAgPyAnbWl4ZWQnIDogd3JpdGVUYXJnZXRzLnNpemUgPiAwID8gJ3dyaXRlJyA6ICdyZWFkJyxcblx0XHR0YXJnZXQ6IHJlZmVyZW5jZXNUb2RvcyAmJiByZWZlcmVuY2VzVG9kb0RlcHMgPyAnYm90aCcgOiByZWZlcmVuY2VzVG9kb0RlcHMgPyAndG9kb19kZXBzJyA6ICd0b2RvcycsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRva2VuaXplU3FsKHF1ZXJ5OiBzdHJpbmcpOiBJU3FsVG9rZW5bXSB7XG5cdGNvbnN0IHRva2VuczogSVNxbFRva2VuW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyeS5sZW5ndGg7KSB7XG5cdFx0Y29uc3QgY2hhciA9IHF1ZXJ5W2ldO1xuXHRcdGNvbnN0IG5leHQgPSBxdWVyeVtpICsgMV07XG5cdFx0aWYgKC9cXHMvLnRlc3QoY2hhcikpIHtcblx0XHRcdGkrKztcblx0XHR9IGVsc2UgaWYgKGNoYXIgPT09ICctJyAmJiBuZXh0ID09PSAnLScpIHtcblx0XHRcdGkgPSBza2lwVW50aWwocXVlcnksIGkgKyAyLCAnXFxuJyk7XG5cdFx0fSBlbHNlIGlmIChjaGFyID09PSAnLycgJiYgbmV4dCA9PT0gJyonKSB7XG5cdFx0XHRpID0gc2tpcFVudGlsKHF1ZXJ5LCBpICsgMiwgJyovJyk7XG5cdFx0fSBlbHNlIGlmIChjaGFyID09PSAnXFwnJykge1xuXHRcdFx0aSA9IHNraXBRdW90ZWQocXVlcnksIGkgKyAxLCAnXFwnJywgJ1xcJycpO1xuXHRcdH0gZWxzZSBpZiAoY2hhciA9PT0gJ1wiJyB8fCBjaGFyID09PSAnYCcpIHtcblx0XHRcdGNvbnN0IGVuZCA9IHNraXBRdW90ZWQocXVlcnksIGkgKyAxLCBjaGFyLCBjaGFyKTtcblx0XHRcdHRva2Vucy5wdXNoKHsgdmFsdWU6IHF1ZXJ5LnNsaWNlKGkgKyAxLCBlbmQgLSAxKS5yZXBsYWNlQWxsKGNoYXIgKyBjaGFyLCBjaGFyKS50b0xvd2VyQ2FzZSgpLCBraW5kOiAnaWRlbnRpZmllcicgfSk7XG5cdFx0XHRpID0gZW5kO1xuXHRcdH0gZWxzZSBpZiAoY2hhciA9PT0gJ1snKSB7XG5cdFx0XHRjb25zdCBlbmQgPSBza2lwUXVvdGVkKHF1ZXJ5LCBpICsgMSwgJ10nLCAnXScpO1xuXHRcdFx0dG9rZW5zLnB1c2goeyB2YWx1ZTogcXVlcnkuc2xpY2UoaSArIDEsIGVuZCAtIDEpLnJlcGxhY2VBbGwoJ11dJywgJ10nKS50b0xvd2VyQ2FzZSgpLCBraW5kOiAnaWRlbnRpZmllcicgfSk7XG5cdFx0XHRpID0gZW5kO1xuXHRcdH0gZWxzZSBpZiAoL1thLXpfJF0vaS50ZXN0KGNoYXIpKSB7XG5cdFx0XHRsZXQgZW5kID0gaSArIDE7XG5cdFx0XHR3aGlsZSAoZW5kIDwgcXVlcnkubGVuZ3RoICYmIC9bXFx3JF0vLnRlc3QocXVlcnlbZW5kXSkpIHtcblx0XHRcdFx0ZW5kKys7XG5cdFx0XHR9XG5cdFx0XHR0b2tlbnMucHVzaCh7IHZhbHVlOiBxdWVyeS5zbGljZShpLCBlbmQpLnRvTG93ZXJDYXNlKCksIGtpbmQ6ICdpZGVudGlmaWVyJyB9KTtcblx0XHRcdGkgPSBlbmQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChjaGFyID09PSAnLicgfHwgY2hhciA9PT0gJywnIHx8IGNoYXIgPT09ICcoJyB8fCBjaGFyID09PSAnKScgfHwgY2hhciA9PT0gJzsnKSB7XG5cdFx0XHRcdHRva2Vucy5wdXNoKHsgdmFsdWU6IGNoYXIsIGtpbmQ6ICdwdW5jdHVhdGlvbicgfSk7XG5cdFx0XHR9XG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0b2tlbnM7XG59XG5cbmZ1bmN0aW9uIHNraXBVbnRpbChxdWVyeTogc3RyaW5nLCBzdGFydDogbnVtYmVyLCB0ZXJtaW5hdG9yOiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBpbmRleCA9IHF1ZXJ5LmluZGV4T2YodGVybWluYXRvciwgc3RhcnQpO1xuXHRyZXR1cm4gaW5kZXggPT09IC0xID8gcXVlcnkubGVuZ3RoIDogaW5kZXggKyB0ZXJtaW5hdG9yLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gc2tpcFF1b3RlZChxdWVyeTogc3RyaW5nLCBzdGFydDogbnVtYmVyLCB0ZXJtaW5hdG9yOiBzdHJpbmcsIGVzY2FwZTogc3RyaW5nKTogbnVtYmVyIHtcblx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgcXVlcnkubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAocXVlcnlbaV0gIT09IHRlcm1pbmF0b3IpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocXVlcnlbaSArIDFdID09PSBlc2NhcGUpIHtcblx0XHRcdGkrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGkgKyAxO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcXVlcnkubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBmaW5kVG9rZW4odG9rZW5zOiByZWFkb25seSBJU3FsVG9rZW5bXSwgc3RhcnQ6IG51bWJlciwgdmFsdWU6IHN0cmluZywgc2tpcHBlZFZhbHVlczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXSk6IG51bWJlciB7XG5cdGZvciAobGV0IGkgPSBzdGFydDsgaSA8IHRva2Vucy5sZW5ndGggJiYgdG9rZW5zW2ldLnZhbHVlICE9PSAnOyc7IGkrKykge1xuXHRcdGlmICh0b2tlbnNbaV0udmFsdWUgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gaTtcblx0XHR9XG5cdFx0aWYgKCFza2lwcGVkVmFsdWVzLmluY2x1ZGVzKHRva2Vuc1tpXS52YWx1ZSkpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gLTE7XG59XG5cbmZ1bmN0aW9uIHJlYWRUYWJsZUlkZW50aWZpZXIodG9rZW5zOiByZWFkb25seSBJU3FsVG9rZW5bXSwgc3RhcnQ6IG51bWJlciwgc2tpcHBlZFZhbHVlczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGxldCBpbmRleCA9IHN0YXJ0O1xuXHR3aGlsZSAoaW5kZXggPCB0b2tlbnMubGVuZ3RoICYmIHNraXBwZWRWYWx1ZXMuaW5jbHVkZXModG9rZW5zW2luZGV4XS52YWx1ZSkpIHtcblx0XHRpbmRleCsrO1xuXHR9XG5cdGlmICh0b2tlbnNbaW5kZXhdPy5raW5kICE9PSAnaWRlbnRpZmllcicpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IHRhYmxlID0gdG9rZW5zW2luZGV4XS52YWx1ZTtcblx0d2hpbGUgKHRva2Vuc1tpbmRleCArIDFdPy52YWx1ZSA9PT0gJy4nICYmIHRva2Vuc1tpbmRleCArIDJdPy5raW5kID09PSAnaWRlbnRpZmllcicpIHtcblx0XHR0YWJsZSA9IHRva2Vuc1tpbmRleCArIDJdLnZhbHVlO1xuXHRcdGluZGV4ICs9IDI7XG5cdH1cblx0cmV0dXJuIHRhYmxlO1xufVxuXG5mdW5jdGlvbiBhZGRGcm9tQ2xhdXNlVGFyZ2V0cyh0b2tlbnM6IHJlYWRvbmx5IElTcWxUb2tlbltdLCBzdGFydDogbnVtYmVyLCB0YXJnZXRzOiBTZXQ8VG9kb1N0b3JlVGFyZ2V0Pik6IHZvaWQge1xuXHRjb25zdCB0ZXJtaW5hdG9ycyA9IG5ldyBTZXQoWyd3aGVyZScsICdncm91cCcsICdvcmRlcicsICdoYXZpbmcnLCAnbGltaXQnLCAndW5pb24nLCAnaW50ZXJzZWN0JywgJ2V4Y2VwdCcsICdyZXR1cm5pbmcnLCAnc2V0JywgJ3ZhbHVlcycsICc7J10pO1xuXHRsZXQgZXhwZWN0c1RhYmxlID0gdHJ1ZTtcblx0bGV0IGRlcHRoID0gMDtcblx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0b2tlbnNbaV0udmFsdWU7XG5cdFx0aWYgKHZhbHVlID09PSAnKCcpIHtcblx0XHRcdGlmIChkZXB0aCA9PT0gMCAmJiBleHBlY3RzVGFibGUpIHtcblx0XHRcdFx0ZXhwZWN0c1RhYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRkZXB0aCsrO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICcpJykge1xuXHRcdFx0aWYgKGRlcHRoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRlcHRoLS07XG5cdFx0fSBlbHNlIGlmIChkZXB0aCA9PT0gMCAmJiB0ZXJtaW5hdG9ycy5oYXModmFsdWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChkZXB0aCA9PT0gMCAmJiAodmFsdWUgPT09ICcsJyB8fCB2YWx1ZSA9PT0gJ2pvaW4nKSkge1xuXHRcdFx0ZXhwZWN0c1RhYmxlID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGRlcHRoID09PSAwICYmIGV4cGVjdHNUYWJsZSAmJiB0b2tlbnNbaV0ua2luZCA9PT0gJ2lkZW50aWZpZXInKSB7XG5cdFx0XHRhZGRUb2RvU3RvcmVUYXJnZXQodGFyZ2V0cywgcmVhZFRhYmxlSWRlbnRpZmllcih0b2tlbnMsIGkpKTtcblx0XHRcdGV4cGVjdHNUYWJsZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBhZGRUb2RvU3RvcmVUYXJnZXQodGFyZ2V0czogU2V0PFRvZG9TdG9yZVRhcmdldD4sIGlkZW50aWZpZXI6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAoaWRlbnRpZmllciA9PT0gJ3RvZG9zJyB8fCBpZGVudGlmaWVyID09PSAndG9kb19kZXBzJykge1xuXHRcdHRhcmdldHMuYWRkKGlkZW50aWZpZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUF1RztBQW1DekcsU0FBUyxnQ0FBZ0Msa0JBQXFDLFNBQWMsWUFBb0IsVUFBa0IsV0FBMEQsZUFBd0Q7QUFDMVAsUUFBTSxZQUFZLGlDQUFpQyxVQUFVLFNBQVM7QUFDdEUsTUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLEVBQ0Q7QUFFQSxtQkFBaUIsV0FBc0Usc0JBQXNCO0FBQUEsSUFDNUcsR0FBRyxxQkFBcUIsYUFBYTtBQUFBLElBQ3JDLEdBQUc7QUFBQSxJQUNIO0FBQUEsSUFDQSxVQUFVLFFBQVE7QUFBQSxJQUNsQixnQkFBZ0IsYUFBYSxHQUFHLE9BQU87QUFBQSxJQUN2QyxtQkFBbUIsa0JBQWtCLE9BQU87QUFBQSxFQUM3QyxDQUFDO0FBQ0Y7QUFFTyxTQUFTLGlDQUFpQyxVQUFrQixXQUErRjtBQUNqSyxNQUFJLGFBQWEsT0FBTztBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sUUFBUSxXQUFXO0FBQ3pCLE1BQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFNBQVMsWUFBWSxLQUFLO0FBQ2hDLFFBQU0sY0FBYyxvQkFBSSxJQUFxQjtBQUM3QyxRQUFNLGVBQWUsb0JBQUksSUFBcUI7QUFDOUMsUUFBTSxvQkFBb0Isb0JBQUksSUFBWTtBQUUxQyxXQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sUUFBUSxLQUFLO0FBQ3ZDLFlBQVEsT0FBTyxDQUFDLEVBQUUsT0FBTztBQUFBLE1BQ3hCLEtBQUs7QUFBQSxNQUNMLEtBQUssV0FBVztBQUNmLGNBQU0sWUFBWSxVQUFVLFFBQVEsSUFBSSxHQUFHLFFBQVEsQ0FBQyxNQUFNLFlBQVksU0FBUyxXQUFXLFFBQVEsUUFBUSxDQUFDO0FBQzNHLDJCQUFtQixjQUFjLG9CQUFvQixRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQzNFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSztBQUNKLDJCQUFtQixjQUFjLG9CQUFvQixRQUFRLElBQUksR0FBRyxDQUFDLE1BQU0sWUFBWSxTQUFTLFdBQVcsUUFBUSxRQUFRLENBQUMsQ0FBQztBQUM3SDtBQUFBLE1BQ0QsS0FBSyxVQUFVO0FBQ2QsY0FBTSxZQUFZLFVBQVUsUUFBUSxJQUFJLEdBQUcsTUFBTTtBQUNqRCwwQkFBa0IsSUFBSSxTQUFTO0FBQy9CLDJCQUFtQixjQUFjLG9CQUFvQixRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQzNFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSyxTQUFTO0FBQ2IsY0FBTSxhQUFhLFVBQVUsUUFBUSxJQUFJLEdBQUcsU0FBUyxDQUFDLFFBQVEsV0FBVyxDQUFDO0FBQzFFLDJCQUFtQixjQUFjLG9CQUFvQixRQUFRLGFBQWEsR0FBRyxDQUFDLE1BQU0sT0FBTyxRQUFRLENBQUMsQ0FBQztBQUNyRztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxRQUFRLEtBQUs7QUFDdkMsUUFBSSxPQUFPLENBQUMsRUFBRSxVQUFVLFVBQVUsQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLEdBQUc7QUFDNUQsMkJBQXFCLFFBQVEsSUFBSSxHQUFHLFdBQVc7QUFBQSxJQUNoRCxXQUFXLE9BQU8sQ0FBQyxFQUFFLFVBQVUsUUFBUTtBQUN0Qyx5QkFBbUIsYUFBYSxvQkFBb0IsUUFBUSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUVBLE1BQUksWUFBWSxTQUFTLEtBQUssYUFBYSxTQUFTLEdBQUc7QUFDdEQsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLGtCQUFrQixZQUFZLElBQUksT0FBTyxLQUFLLGFBQWEsSUFBSSxPQUFPO0FBQzVFLFFBQU0scUJBQXFCLFlBQVksSUFBSSxXQUFXLEtBQUssYUFBYSxJQUFJLFdBQVc7QUFDdkYsU0FBTztBQUFBLElBQ04sV0FBVyxZQUFZLE9BQU8sS0FBSyxhQUFhLE9BQU8sSUFBSSxVQUFVLGFBQWEsT0FBTyxJQUFJLFVBQVU7QUFBQSxJQUN2RyxRQUFRLG1CQUFtQixxQkFBcUIsU0FBUyxxQkFBcUIsY0FBYztBQUFBLEVBQzdGO0FBQ0Q7QUFFQSxTQUFTLFlBQVksT0FBNEI7QUFDaEQsUUFBTSxTQUFzQixDQUFDO0FBQzdCLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxVQUFTO0FBQ2xDLFVBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsVUFBTSxPQUFPLE1BQU0sSUFBSSxDQUFDO0FBQ3hCLFFBQUksS0FBSyxLQUFLLElBQUksR0FBRztBQUNwQjtBQUFBLElBQ0QsV0FBVyxTQUFTLE9BQU8sU0FBUyxLQUFLO0FBQ3hDLFVBQUksVUFBVSxPQUFPLElBQUksR0FBRyxJQUFJO0FBQUEsSUFDakMsV0FBVyxTQUFTLE9BQU8sU0FBUyxLQUFLO0FBQ3hDLFVBQUksVUFBVSxPQUFPLElBQUksR0FBRyxJQUFJO0FBQUEsSUFDakMsV0FBVyxTQUFTLEtBQU07QUFDekIsVUFBSSxXQUFXLE9BQU8sSUFBSSxHQUFHLEtBQU0sR0FBSTtBQUFBLElBQ3hDLFdBQVcsU0FBUyxPQUFPLFNBQVMsS0FBSztBQUN4QyxZQUFNLE1BQU0sV0FBVyxPQUFPLElBQUksR0FBRyxNQUFNLElBQUk7QUFDL0MsYUFBTyxLQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxNQUFNLElBQUksRUFBRSxZQUFZLEdBQUcsTUFBTSxhQUFhLENBQUM7QUFDbEgsVUFBSTtBQUFBLElBQ0wsV0FBVyxTQUFTLEtBQUs7QUFDeEIsWUFBTSxNQUFNLFdBQVcsT0FBTyxJQUFJLEdBQUcsS0FBSyxHQUFHO0FBQzdDLGFBQU8sS0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsRUFBRSxXQUFXLE1BQU0sR0FBRyxFQUFFLFlBQVksR0FBRyxNQUFNLGFBQWEsQ0FBQztBQUMxRyxVQUFJO0FBQUEsSUFDTCxXQUFXLFdBQVcsS0FBSyxJQUFJLEdBQUc7QUFDakMsVUFBSSxNQUFNLElBQUk7QUFDZCxhQUFPLE1BQU0sTUFBTSxVQUFVLFFBQVEsS0FBSyxNQUFNLEdBQUcsQ0FBQyxHQUFHO0FBQ3REO0FBQUEsTUFDRDtBQUNBLGFBQU8sS0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLEdBQUcsR0FBRyxFQUFFLFlBQVksR0FBRyxNQUFNLGFBQWEsQ0FBQztBQUM1RSxVQUFJO0FBQUEsSUFDTCxPQUFPO0FBQ04sVUFBSSxTQUFTLE9BQU8sU0FBUyxPQUFPLFNBQVMsT0FBTyxTQUFTLE9BQU8sU0FBUyxLQUFLO0FBQ2pGLGVBQU8sS0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLGNBQWMsQ0FBQztBQUFBLE1BQ2pEO0FBQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsVUFBVSxPQUFlLE9BQWUsWUFBNEI7QUFDNUUsUUFBTSxRQUFRLE1BQU0sUUFBUSxZQUFZLEtBQUs7QUFDN0MsU0FBTyxVQUFVLEtBQUssTUFBTSxTQUFTLFFBQVEsV0FBVztBQUN6RDtBQUVBLFNBQVMsV0FBVyxPQUFlLE9BQWUsWUFBb0IsUUFBd0I7QUFDN0YsV0FBUyxJQUFJLE9BQU8sSUFBSSxNQUFNLFFBQVEsS0FBSztBQUMxQyxRQUFJLE1BQU0sQ0FBQyxNQUFNLFlBQVk7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxNQUFNLElBQUksQ0FBQyxNQUFNLFFBQVE7QUFDNUI7QUFBQSxJQUNELE9BQU87QUFDTixhQUFPLElBQUk7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQUNBLFNBQU8sTUFBTTtBQUNkO0FBRUEsU0FBUyxVQUFVLFFBQThCLE9BQWUsT0FBZSxnQkFBbUMsQ0FBQyxHQUFXO0FBQzdILFdBQVMsSUFBSSxPQUFPLElBQUksT0FBTyxVQUFVLE9BQU8sQ0FBQyxFQUFFLFVBQVUsS0FBSyxLQUFLO0FBQ3RFLFFBQUksT0FBTyxDQUFDLEVBQUUsVUFBVSxPQUFPO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLGNBQWMsU0FBUyxPQUFPLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFDN0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsb0JBQW9CLFFBQThCLE9BQWUsZ0JBQW1DLENBQUMsR0FBdUI7QUFDcEksTUFBSSxRQUFRO0FBQ1osU0FBTyxRQUFRLE9BQU8sVUFBVSxjQUFjLFNBQVMsT0FBTyxLQUFLLEVBQUUsS0FBSyxHQUFHO0FBQzVFO0FBQUEsRUFDRDtBQUNBLE1BQUksT0FBTyxLQUFLLEdBQUcsU0FBUyxjQUFjO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxRQUFRLE9BQU8sS0FBSyxFQUFFO0FBQzFCLFNBQU8sT0FBTyxRQUFRLENBQUMsR0FBRyxVQUFVLE9BQU8sT0FBTyxRQUFRLENBQUMsR0FBRyxTQUFTLGNBQWM7QUFDcEYsWUFBUSxPQUFPLFFBQVEsQ0FBQyxFQUFFO0FBQzFCLGFBQVM7QUFBQSxFQUNWO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxxQkFBcUIsUUFBOEIsT0FBZSxTQUFxQztBQUMvRyxRQUFNLGNBQWMsb0JBQUksSUFBSSxDQUFDLFNBQVMsU0FBUyxTQUFTLFVBQVUsU0FBUyxTQUFTLGFBQWEsVUFBVSxhQUFhLE9BQU8sVUFBVSxHQUFHLENBQUM7QUFDN0ksTUFBSSxlQUFlO0FBQ25CLE1BQUksUUFBUTtBQUNaLFdBQVMsSUFBSSxPQUFPLElBQUksT0FBTyxRQUFRLEtBQUs7QUFDM0MsVUFBTSxRQUFRLE9BQU8sQ0FBQyxFQUFFO0FBQ3hCLFFBQUksVUFBVSxLQUFLO0FBQ2xCLFVBQUksVUFBVSxLQUFLLGNBQWM7QUFDaEMsdUJBQWU7QUFBQSxNQUNoQjtBQUNBO0FBQUEsSUFDRCxXQUFXLFVBQVUsS0FBSztBQUN6QixVQUFJLFVBQVUsR0FBRztBQUNoQjtBQUFBLE1BQ0Q7QUFDQTtBQUFBLElBQ0QsV0FBVyxVQUFVLEtBQUssWUFBWSxJQUFJLEtBQUssR0FBRztBQUNqRDtBQUFBLElBQ0QsV0FBVyxVQUFVLE1BQU0sVUFBVSxPQUFPLFVBQVUsU0FBUztBQUM5RCxxQkFBZTtBQUFBLElBQ2hCLFdBQVcsVUFBVSxLQUFLLGdCQUFnQixPQUFPLENBQUMsRUFBRSxTQUFTLGNBQWM7QUFDMUUseUJBQW1CLFNBQVMsb0JBQW9CLFFBQVEsQ0FBQyxDQUFDO0FBQzFELHFCQUFlO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLG1CQUFtQixTQUErQixZQUFzQztBQUNoRyxNQUFJLGVBQWUsV0FBVyxlQUFlLGFBQWE7QUFDekQsWUFBUSxJQUFJLFVBQVU7QUFBQSxFQUN2QjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
