import { equalsIgnoreCase } from "../../../../base/common/strings.js";
import { State } from "./debug.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { deepClone } from "../../../../base/common/objects.js";
import { Schemas } from "../../../../base/common/network.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
const _formatPIIRegexp = /{([^}]+)}/g;
function formatPII(value, excludePII, args) {
  return value.replace(_formatPIIRegexp, function(match, group) {
    if (excludePII && group.length > 0 && group[0] !== "_") {
      return match;
    }
    return args && args.hasOwnProperty(group) ? args[group] : match;
  });
}
function filterExceptionsFromTelemetry(data) {
  const output = {};
  for (const key of Object.keys(data)) {
    if (!key.startsWith("!")) {
      output[key] = data[key];
    }
  }
  return output;
}
function isSessionAttach(session) {
  return session.configuration.request === "attach" && !getExtensionHostDebugSession(session) && (!session.parentSession || isSessionAttach(session.parentSession));
}
function getExtensionHostDebugSession(session) {
  let type = session.configuration.type;
  if (!type) {
    return;
  }
  if (type === "vslsShare") {
    type = session.configuration.adapterProxy?.configuration?.type || type;
  }
  if (equalsIgnoreCase(type, "extensionhost") || equalsIgnoreCase(type, "pwa-extensionhost")) {
    return session;
  }
  return session.parentSession ? getExtensionHostDebugSession(session.parentSession) : void 0;
}
function isDebuggerMainContribution(dbg) {
  return dbg.type && (dbg.label || dbg.program || dbg.runtime);
}
function getExactExpressionStartAndEnd(lineContent, looseStart, looseEnd) {
  let matchingExpression = void 0;
  let startOffset = 0;
  const expression = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
  let result = null;
  while (result = expression.exec(lineContent)) {
    const start = result.index + 1;
    const end = start + result[0].length;
    if (start <= looseStart && end >= looseEnd) {
      matchingExpression = result[0];
      startOffset = start;
      break;
    }
  }
  if (matchingExpression) {
    const spreadMatch = matchingExpression.match(/^\.\.\.(.+)/);
    if (spreadMatch) {
      matchingExpression = spreadMatch[1];
      startOffset += 3;
    }
  }
  if (matchingExpression) {
    const subExpression = /(\w|\p{L})+/gu;
    let subExpressionResult = null;
    while (subExpressionResult = subExpression.exec(matchingExpression)) {
      const subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
      if (subEnd >= looseEnd) {
        break;
      }
    }
    if (subExpressionResult) {
      matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
    }
  }
  return matchingExpression ? { start: startOffset, end: startOffset + matchingExpression.length - 1 } : { start: 0, end: 0 };
}
async function getEvaluatableExpressionAtPosition(languageFeaturesService, model, position, token) {
  if (languageFeaturesService.evaluatableExpressionProvider.has(model)) {
    const supports = languageFeaturesService.evaluatableExpressionProvider.ordered(model);
    const results = coalesce(await Promise.all(supports.map(async (support) => {
      try {
        return await support.provideEvaluatableExpression(model, position, token ?? CancellationToken.None);
      } catch (err) {
        return void 0;
      }
    })));
    if (results.length > 0) {
      let matchingExpression = results[0].expression;
      const range = results[0].range;
      if (!matchingExpression) {
        const lineContent = model.getLineContent(position.lineNumber);
        matchingExpression = lineContent.substring(range.startColumn - 1, range.endColumn - 1);
      }
      return { range, matchingExpression };
    }
  } else {
    const lineContent = model.getLineContent(position.lineNumber);
    const { start, end } = getExactExpressionStartAndEnd(lineContent, position.column, position.column);
    const matchingExpression = lineContent.substring(start - 1, end);
    return {
      matchingExpression,
      range: new Range(position.lineNumber, start, position.lineNumber, start + matchingExpression.length)
    };
  }
  return null;
}
const _schemePattern = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
function isUriString(s) {
  return !!(s && s.match(_schemePattern));
}
function stringToUri(source) {
  if (typeof source.path === "string") {
    if (typeof source.sourceReference === "number" && source.sourceReference > 0) {
    } else {
      if (isUriString(source.path)) {
        return uri.parse(source.path);
      } else {
        if (isAbsolute(source.path)) {
          return uri.file(source.path);
        } else {
        }
      }
    }
  }
  return source.path;
}
function uriToString(source) {
  if (typeof source.path === "object") {
    const u = uri.revive(source.path);
    if (u) {
      if (u.scheme === Schemas.file) {
        return u.fsPath;
      } else {
        return u.toString();
      }
    }
  }
  return source.path;
}
function convertToDAPaths(message, toUri) {
  const fixPath = toUri ? stringToUri : uriToString;
  const msg = deepClone(message);
  convertPaths(msg, (toDA, source) => {
    if (toDA && source) {
      source.path = fixPath(source);
    }
  });
  return msg;
}
function convertToVSCPaths(message, toUri) {
  const fixPath = toUri ? stringToUri : uriToString;
  const msg = deepClone(message);
  convertPaths(msg, (toDA, source) => {
    if (!toDA && source) {
      source.path = fixPath(source);
    }
  });
  return msg;
}
function convertPaths(msg, fixSourcePath) {
  switch (msg.type) {
    case "event": {
      const event = msg;
      switch (event.event) {
        case "output":
          fixSourcePath(false, event.body.source);
          break;
        case "loadedSource":
          fixSourcePath(false, event.body.source);
          break;
        case "breakpoint":
          fixSourcePath(false, event.body.breakpoint.source);
          break;
        default:
          break;
      }
      break;
    }
    case "request": {
      const request = msg;
      switch (request.command) {
        case "setBreakpoints":
          fixSourcePath(true, request.arguments.source);
          break;
        case "breakpointLocations":
          fixSourcePath(true, request.arguments.source);
          break;
        case "source":
          fixSourcePath(true, request.arguments.source);
          break;
        case "gotoTargets":
          fixSourcePath(true, request.arguments.source);
          break;
        case "launchVSCode":
          request.arguments.args.forEach((arg) => fixSourcePath(false, arg));
          break;
        default:
          break;
      }
      break;
    }
    case "response": {
      const response = msg;
      if (response.success && response.body) {
        switch (response.command) {
          case "stackTrace":
            response.body.stackFrames.forEach((frame) => fixSourcePath(false, frame.source));
            break;
          case "loadedSources":
            response.body.sources.forEach((source) => fixSourcePath(false, source));
            break;
          case "scopes":
            response.body.scopes.forEach((scope) => fixSourcePath(false, scope.source));
            break;
          case "setFunctionBreakpoints":
            response.body.breakpoints.forEach((bp) => fixSourcePath(false, bp.source));
            break;
          case "setBreakpoints":
            response.body.breakpoints.forEach((bp) => fixSourcePath(false, bp.source));
            break;
          case "disassemble":
            {
              const di = response;
              di.body?.instructions.forEach((di2) => fixSourcePath(false, di2.location));
            }
            break;
          case "locations":
            fixSourcePath(false, response.body?.source);
            break;
          default:
            break;
        }
      }
      break;
    }
  }
}
function getVisibleAndSorted(array) {
  return array.filter((config) => !config.presentation?.hidden).sort((first, second) => {
    if (!first.presentation) {
      if (!second.presentation) {
        return 0;
      }
      return 1;
    }
    if (!second.presentation) {
      return -1;
    }
    if (!first.presentation.group) {
      if (!second.presentation.group) {
        return compareOrders(first.presentation.order, second.presentation.order);
      }
      return 1;
    }
    if (!second.presentation.group) {
      return -1;
    }
    if (first.presentation.group !== second.presentation.group) {
      return first.presentation.group.localeCompare(second.presentation.group);
    }
    return compareOrders(first.presentation.order, second.presentation.order);
  });
}
function compareOrders(first, second) {
  if (typeof first !== "number") {
    if (typeof second !== "number") {
      return 0;
    }
    return 1;
  }
  if (typeof second !== "number") {
    return -1;
  }
  return first - second;
}
async function saveAllBeforeDebugStart(configurationService, editorService) {
  const saveBeforeStartConfig = configurationService.getValue("debug.saveBeforeStart", { overrideIdentifier: editorService.activeTextEditorLanguageId });
  if (saveBeforeStartConfig !== "none") {
    await editorService.saveAll();
    if (saveBeforeStartConfig === "allEditorsInActiveGroup") {
      const activeEditor = editorService.activeEditorPane;
      if (activeEditor && activeEditor.input.resource?.scheme === Schemas.untitled) {
        await editorService.save({ editor: activeEditor.input, groupId: activeEditor.group.id });
      }
    }
  }
  await configurationService.reloadConfiguration();
}
const sourcesEqual = (a, b) => !a || !b ? a === b : a.name === b.name && a.path === b.path && a.sourceReference === b.sourceReference;
function resolveChildSession(session, allSessions) {
  const childSessions = allSessions.filter((s) => s.parentSession === session);
  if (childSessions.length > 0) {
    const stoppedChildSession = childSessions.find((s) => s.state === State.Stopped);
    if (stoppedChildSession) {
      return stoppedChildSession;
    } else {
      return childSessions[0];
    }
  }
  return session;
}
function getPlatformSpecificConfig(config, os) {
  switch (os) {
    case OperatingSystem.Windows:
      return config.windows;
    case OperatingSystem.Macintosh:
      return config.osx;
    case OperatingSystem.Linux:
      return config.linux;
  }
}
function getEffectiveConfigForPlatform(config, os = OS) {
  const platformConfig = getPlatformSpecificConfig(config, os);
  if (!platformConfig) {
    return config;
  }
  return {
    ...config,
    ...platformConfig,
    presentation: platformConfig.presentation ? { ...config.presentation, ...platformConfig.presentation } : config.presentation
  };
}
function getEffectivePresentationForConfig(config, os = OS) {
  return getEffectiveConfigForPlatform(config, os).presentation;
}
export {
  convertToDAPaths,
  convertToVSCPaths,
  filterExceptionsFromTelemetry,
  formatPII,
  getEffectiveConfigForPlatform,
  getEffectivePresentationForConfig,
  getEvaluatableExpressionAtPosition,
  getExactExpressionStartAndEnd,
  getExtensionHostDebugSession,
  getVisibleAndSorted,
  isDebuggerMainContribution,
  isSessionAttach,
  isUriString,
  resolveChildSession,
  saveAllBeforeDebugStart,
  sourcesEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnVXRpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHNJZ25vcmVDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJRGVidWdnZXJDb250cmlidXRpb24sIElEZWJ1Z1Nlc3Npb24sIElDb25maWcsIElDb25maWdQcmVzZW50YXRpb24sIFN0YXRlIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBVUkkgYXMgdXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5jb25zdCBfZm9ybWF0UElJUmVnZXhwID0gL3soW159XSspfS9nO1xuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0UElJKHZhbHVlOiBzdHJpbmcsIGV4Y2x1ZGVQSUk6IGJvb2xlYW4sIGFyZ3M6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZShfZm9ybWF0UElJUmVnZXhwLCBmdW5jdGlvbiAobWF0Y2gsIGdyb3VwKSB7XG5cdFx0aWYgKGV4Y2x1ZGVQSUkgJiYgZ3JvdXAubGVuZ3RoID4gMCAmJiBncm91cFswXSAhPT0gJ18nKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyZ3MgJiYgYXJncy5oYXNPd25Qcm9wZXJ0eShncm91cCkgP1xuXHRcdFx0YXJnc1tncm91cF0gOlxuXHRcdFx0bWF0Y2g7XG5cdH0pO1xufVxuXG4vKipcbiAqIEZpbHRlcnMgZXhjZXB0aW9ucyAoa2V5cyBtYXJrZWQgd2l0aCBcIiFcIikgZnJvbSB0aGUgZ2l2ZW4gb2JqZWN0LiBVc2VkIHRvXG4gKiBlbnN1cmUgZXhjZXB0aW9uIGRhdGEgaXMgbm90IHNlbnQgb24gd2ViIHJlbW90ZXMsIHNlZSAjOTc2MjguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJFeGNlcHRpb25zRnJvbVRlbGVtZXRyeTxUIGV4dGVuZHMgeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0+KGRhdGE6IFQpOiBQYXJ0aWFsPFQ+IHtcblx0Y29uc3Qgb3V0cHV0OiBQYXJ0aWFsPFQ+ID0ge307XG5cdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGRhdGEpIGFzIChrZXlvZiBUICYgc3RyaW5nKVtdKSB7XG5cdFx0aWYgKCFrZXkuc3RhcnRzV2l0aCgnIScpKSB7XG5cdFx0XHRvdXRwdXRba2V5XSA9IGRhdGFba2V5XTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Nlc3Npb25BdHRhY2goc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvbi5jb25maWd1cmF0aW9uLnJlcXVlc3QgPT09ICdhdHRhY2gnICYmICFnZXRFeHRlbnNpb25Ib3N0RGVidWdTZXNzaW9uKHNlc3Npb24pICYmICghc2Vzc2lvbi5wYXJlbnRTZXNzaW9uIHx8IGlzU2Vzc2lvbkF0dGFjaChzZXNzaW9uLnBhcmVudFNlc3Npb24pKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzZXNzaW9uIG9yIGFueSBwYXJlbnQgd2hpY2ggaXMgYW4gZXh0ZW5zaW9uIGhvc3QgZGVidWcgc2Vzc2lvbi5cbiAqIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZXJlJ3Mgbm9uZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEV4dGVuc2lvbkhvc3REZWJ1Z1Nlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IElEZWJ1Z1Nlc3Npb24gfCB2b2lkIHtcblx0bGV0IHR5cGUgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb24udHlwZTtcblx0aWYgKCF0eXBlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKHR5cGUgPT09ICd2c2xzU2hhcmUnKSB7XG5cdFx0dHlwZSA9IChzZXNzaW9uLmNvbmZpZ3VyYXRpb24gYXMgeyBhZGFwdGVyUHJveHk/OiB7IGNvbmZpZ3VyYXRpb24/OiB7IHR5cGU/OiBzdHJpbmcgfSB9IH0pLmFkYXB0ZXJQcm94eT8uY29uZmlndXJhdGlvbj8udHlwZSB8fCB0eXBlO1xuXHR9XG5cblx0aWYgKGVxdWFsc0lnbm9yZUNhc2UodHlwZSwgJ2V4dGVuc2lvbmhvc3QnKSB8fCBlcXVhbHNJZ25vcmVDYXNlKHR5cGUsICdwd2EtZXh0ZW5zaW9uaG9zdCcpKSB7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRyZXR1cm4gc2Vzc2lvbi5wYXJlbnRTZXNzaW9uID8gZ2V0RXh0ZW5zaW9uSG9zdERlYnVnU2Vzc2lvbihzZXNzaW9uLnBhcmVudFNlc3Npb24pIDogdW5kZWZpbmVkO1xufVxuXG4vLyBvbmx5IGEgZGVidWdnZXIgY29udHJpYnV0aW9ucyB3aXRoIGEgbGFiZWwsIHByb2dyYW0sIG9yIHJ1bnRpbWUgYXR0cmlidXRlIGlzIGNvbnNpZGVyZWQgYSBcImRlZmluaW5nXCIgb3IgXCJtYWluXCIgZGVidWdnZXIgY29udHJpYnV0aW9uXG5leHBvcnQgZnVuY3Rpb24gaXNEZWJ1Z2dlck1haW5Db250cmlidXRpb24oZGJnOiBJRGVidWdnZXJDb250cmlidXRpb24pIHtcblx0cmV0dXJuIGRiZy50eXBlICYmIChkYmcubGFiZWwgfHwgZGJnLnByb2dyYW0gfHwgZGJnLnJ1bnRpbWUpO1xufVxuXG4vKipcbiAqIE5vdGUtIHVzZXMgMS1pbmRleGVkIG51bWJlcnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKGxpbmVDb250ZW50OiBzdHJpbmcsIGxvb3NlU3RhcnQ6IG51bWJlciwgbG9vc2VFbmQ6IG51bWJlcik6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfSB7XG5cdGxldCBtYXRjaGluZ0V4cHJlc3Npb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IHN0YXJ0T2Zmc2V0ID0gMDtcblxuXHQvLyBTb21lIGV4YW1wbGUgc3VwcG9ydGVkIGV4cHJlc3Npb25zOiBteVZhci5wcm9wLCBhLmIuYy5kLCBteVZhcj8ucHJvcCwgbXlWYXItPnByb3AsIE15Q2xhc3M6OlN0YXRpY1Byb3AsICpteVZhciwgLi4uZm9vXG5cdC8vIE1hdGNoIGFueSBjaGFyYWN0ZXIgZXhjZXB0IGEgc2V0IG9mIGNoYXJhY3RlcnMgd2hpY2ggb2Z0ZW4gYnJlYWsgaW50ZXJlc3Rpbmcgc3ViLWV4cHJlc3Npb25zXG5cdGNvbnN0IGV4cHJlc3Npb246IFJlZ0V4cCA9IC8oW14oKVxcW1xcXXt9PD5cXHMrXFwtLyV+I147PXwsYCFdfFxcLT4pKy9nO1xuXHRsZXQgcmVzdWx0OiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gbnVsbDtcblxuXHQvLyBGaXJzdCBmaW5kIHRoZSBmdWxsIGV4cHJlc3Npb24gdW5kZXIgdGhlIGN1cnNvclxuXHR3aGlsZSAocmVzdWx0ID0gZXhwcmVzc2lvbi5leGVjKGxpbmVDb250ZW50KSkge1xuXHRcdGNvbnN0IHN0YXJ0ID0gcmVzdWx0LmluZGV4ICsgMTtcblx0XHRjb25zdCBlbmQgPSBzdGFydCArIHJlc3VsdFswXS5sZW5ndGg7XG5cblx0XHRpZiAoc3RhcnQgPD0gbG9vc2VTdGFydCAmJiBlbmQgPj0gbG9vc2VFbmQpIHtcblx0XHRcdG1hdGNoaW5nRXhwcmVzc2lvbiA9IHJlc3VsdFswXTtcblx0XHRcdHN0YXJ0T2Zmc2V0ID0gc3RhcnQ7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvLyBIYW5kbGUgc3ByZWFkIHN5bnRheDogaWYgdGhlIGV4cHJlc3Npb24gc3RhcnRzIHdpdGggJy4uLicsIGV4dHJhY3QganVzdCB0aGUgaWRlbnRpZmllclxuXHRpZiAobWF0Y2hpbmdFeHByZXNzaW9uKSB7XG5cdFx0Y29uc3Qgc3ByZWFkTWF0Y2ggPSBtYXRjaGluZ0V4cHJlc3Npb24ubWF0Y2goL15cXC5cXC5cXC4oLispLyk7XG5cdFx0aWYgKHNwcmVhZE1hdGNoKSB7XG5cdFx0XHRtYXRjaGluZ0V4cHJlc3Npb24gPSBzcHJlYWRNYXRjaFsxXTtcblx0XHRcdHN0YXJ0T2Zmc2V0ICs9IDM7IC8vIFNraXAgdGhlICcuLi4nIHByZWZpeFxuXHRcdH1cblx0fVxuXG5cdC8vIElmIHRoZXJlIGFyZSBub24td29yZCBjaGFyYWN0ZXJzIGFmdGVyIHRoZSBjdXJzb3IsIHdlIHdhbnQgdG8gdHJ1bmNhdGUgdGhlIGV4cHJlc3Npb24gdGhlbi5cblx0Ly8gRm9yIGV4YW1wbGUgaW4gZXhwcmVzc2lvbiAnYS5iLmMuZCcsIGlmIHRoZSBmb2N1cyB3YXMgdW5kZXIgJ2InLCAnYS5iJyB3b3VsZCBiZSBldmFsdWF0ZWQuXG5cdGlmIChtYXRjaGluZ0V4cHJlc3Npb24pIHtcblx0XHRjb25zdCBzdWJFeHByZXNzaW9uOiBSZWdFeHAgPSAvKFxcd3xcXHB7TH0pKy9ndTtcblx0XHRsZXQgc3ViRXhwcmVzc2lvblJlc3VsdDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cdFx0d2hpbGUgKHN1YkV4cHJlc3Npb25SZXN1bHQgPSBzdWJFeHByZXNzaW9uLmV4ZWMobWF0Y2hpbmdFeHByZXNzaW9uKSkge1xuXHRcdFx0Y29uc3Qgc3ViRW5kID0gc3ViRXhwcmVzc2lvblJlc3VsdC5pbmRleCArIDEgKyBzdGFydE9mZnNldCArIHN1YkV4cHJlc3Npb25SZXN1bHRbMF0ubGVuZ3RoO1xuXHRcdFx0aWYgKHN1YkVuZCA+PSBsb29zZUVuZCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3ViRXhwcmVzc2lvblJlc3VsdCkge1xuXHRcdFx0bWF0Y2hpbmdFeHByZXNzaW9uID0gbWF0Y2hpbmdFeHByZXNzaW9uLnN1YnN0cmluZygwLCBzdWJFeHByZXNzaW9uLmxhc3RJbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG1hdGNoaW5nRXhwcmVzc2lvbiA/XG5cdFx0eyBzdGFydDogc3RhcnRPZmZzZXQsIGVuZDogc3RhcnRPZmZzZXQgKyBtYXRjaGluZ0V4cHJlc3Npb24ubGVuZ3RoIC0gMSB9IDpcblx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEV2YWx1YXRhYmxlRXhwcmVzc2lvbkF0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyByYW5nZTogSVJhbmdlOyBtYXRjaGluZ0V4cHJlc3Npb246IHN0cmluZyB9IHwgbnVsbD4ge1xuXHRpZiAobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIuaGFzKG1vZGVsKSkge1xuXHRcdGNvbnN0IHN1cHBvcnRzID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cblx0XHRjb25zdCByZXN1bHRzID0gY29hbGVzY2UoYXdhaXQgUHJvbWlzZS5hbGwoc3VwcG9ydHMubWFwKGFzeW5jIHN1cHBvcnQgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHN1cHBvcnQucHJvdmlkZUV2YWx1YXRhYmxlRXhwcmVzc2lvbihtb2RlbCwgcG9zaXRpb24sIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHRcdGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGxldCBtYXRjaGluZ0V4cHJlc3Npb24gPSByZXN1bHRzWzBdLmV4cHJlc3Npb247XG5cdFx0XHRjb25zdCByYW5nZSA9IHJlc3VsdHNbMF0ucmFuZ2U7XG5cblx0XHRcdGlmICghbWF0Y2hpbmdFeHByZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdG1hdGNoaW5nRXhwcmVzc2lvbiA9IGxpbmVDb250ZW50LnN1YnN0cmluZyhyYW5nZS5zdGFydENvbHVtbiAtIDEsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyByYW5nZSwgbWF0Y2hpbmdFeHByZXNzaW9uIH07XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBvbGQgb25lLXNpemUtZml0cy1hbGwgc3RyYXRlZ3lcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHsgc3RhcnQsIGVuZCB9ID0gZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQobGluZUNvbnRlbnQsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24uY29sdW1uKTtcblxuXHRcdC8vIHVzZSByZWdleCB0byBleHRyYWN0IHRoZSBzdWItZXhwcmVzc2lvbiAjOTgyMVxuXHRcdGNvbnN0IG1hdGNoaW5nRXhwcmVzc2lvbiA9IGxpbmVDb250ZW50LnN1YnN0cmluZyhzdGFydCAtIDEsIGVuZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1hdGNoaW5nRXhwcmVzc2lvbixcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgc3RhcnQsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0ICsgbWF0Y2hpbmdFeHByZXNzaW9uLmxlbmd0aClcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbi8vIFJGQyAyMzk2LCBBcHBlbmRpeCBBOiBodHRwczovL3d3dy5pZXRmLm9yZy9yZmMvcmZjMjM5Ni50eHRcbmNvbnN0IF9zY2hlbWVQYXR0ZXJuID0gL15bYS16QS1aXVthLXpBLVowLTlcXCtcXC1cXC5dKzovO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNVcmlTdHJpbmcoczogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdC8vIGhldXJpc3RpY3M6IGEgdmFsaWQgdXJpIHN0YXJ0cyB3aXRoIGEgc2NoZW1lIGFuZFxuXHQvLyB0aGUgc2NoZW1lIGhhcyBhdCBsZWFzdCAyIGNoYXJhY3RlcnMgc28gdGhhdCBpdCBkb2Vzbid0IGxvb2sgbGlrZSBhIGRyaXZlIGxldHRlci5cblx0cmV0dXJuICEhKHMgJiYgcy5tYXRjaChfc2NoZW1lUGF0dGVybikpO1xufVxuXG5mdW5jdGlvbiBzdHJpbmdUb1VyaShzb3VyY2U6IFBhdGhDb250YWluZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIHNvdXJjZS5wYXRoID09PSAnc3RyaW5nJykge1xuXHRcdGlmICh0eXBlb2Ygc291cmNlLnNvdXJjZVJlZmVyZW5jZSA9PT0gJ251bWJlcicgJiYgc291cmNlLnNvdXJjZVJlZmVyZW5jZSA+IDApIHtcblx0XHRcdC8vIGlmIHRoZXJlIGlzIGEgc291cmNlIHJlZmVyZW5jZSwgZG9uJ3QgdG91Y2ggcGF0aFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNVcmlTdHJpbmcoc291cmNlLnBhdGgpKSB7XG5cdFx0XHRcdHJldHVybiA8c3RyaW5nPjx1bmtub3duPnVyaS5wYXJzZShzb3VyY2UucGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBhc3N1bWUgcGF0aFxuXHRcdFx0XHRpZiAoaXNBYnNvbHV0ZShzb3VyY2UucGF0aCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gPHN0cmluZz48dW5rbm93bj51cmkuZmlsZShzb3VyY2UucGF0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbGVhdmUgcmVsYXRpdmUgcGF0aCBhcyBpc1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzb3VyY2UucGF0aDtcbn1cblxuZnVuY3Rpb24gdXJpVG9TdHJpbmcoc291cmNlOiBQYXRoQ29udGFpbmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBzb3VyY2UucGF0aCA9PT0gJ29iamVjdCcpIHtcblx0XHRjb25zdCB1ID0gdXJpLnJldml2ZShzb3VyY2UucGF0aCk7XG5cdFx0aWYgKHUpIHtcblx0XHRcdGlmICh1LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdHJldHVybiB1LmZzUGF0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1LnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzb3VyY2UucGF0aDtcbn1cblxuLy8gcGF0aCBob29rcyBoZWxwZXJzXG5cbmludGVyZmFjZSBQYXRoQ29udGFpbmVyIHtcblx0cGF0aD86IHN0cmluZztcblx0c291cmNlUmVmZXJlbmNlPzogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFRvREFQYXRocyhtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSwgdG9Vcmk6IGJvb2xlYW4pOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSB7XG5cblx0Y29uc3QgZml4UGF0aCA9IHRvVXJpID8gc3RyaW5nVG9VcmkgOiB1cmlUb1N0cmluZztcblxuXHQvLyBzaW5jZSB3ZSBtb2RpZnkgU291cmNlLnBhdGhzIGluIHRoZSBtZXNzYWdlIGluIHBsYWNlLCB3ZSBuZWVkIHRvIG1ha2UgYSBjb3B5IG9mIGl0IChzZWUgIzYxMTI5KVxuXHRjb25zdCBtc2cgPSBkZWVwQ2xvbmUobWVzc2FnZSk7XG5cblx0Y29udmVydFBhdGhzKG1zZywgKHRvREE6IGJvb2xlYW4sIHNvdXJjZTogUGF0aENvbnRhaW5lciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdGlmICh0b0RBICYmIHNvdXJjZSkge1xuXHRcdFx0c291cmNlLnBhdGggPSBmaXhQYXRoKHNvdXJjZSk7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIG1zZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRUb1ZTQ1BhdGhzKG1lc3NhZ2U6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlLCB0b1VyaTogYm9vbGVhbik6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlIHtcblxuXHRjb25zdCBmaXhQYXRoID0gdG9VcmkgPyBzdHJpbmdUb1VyaSA6IHVyaVRvU3RyaW5nO1xuXG5cdC8vIHNpbmNlIHdlIG1vZGlmeSBTb3VyY2UucGF0aHMgaW4gdGhlIG1lc3NhZ2UgaW4gcGxhY2UsIHdlIG5lZWQgdG8gbWFrZSBhIGNvcHkgb2YgaXQgKHNlZSAjNjExMjkpXG5cdGNvbnN0IG1zZyA9IGRlZXBDbG9uZShtZXNzYWdlKTtcblxuXHRjb252ZXJ0UGF0aHMobXNnLCAodG9EQTogYm9vbGVhbiwgc291cmNlOiBQYXRoQ29udGFpbmVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0aWYgKCF0b0RBICYmIHNvdXJjZSkge1xuXHRcdFx0c291cmNlLnBhdGggPSBmaXhQYXRoKHNvdXJjZSk7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIG1zZztcbn1cblxuZnVuY3Rpb24gY29udmVydFBhdGhzKG1zZzogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UsIGZpeFNvdXJjZVBhdGg6ICh0b0RBOiBib29sZWFuLCBzb3VyY2U6IFBhdGhDb250YWluZXIgfCB1bmRlZmluZWQpID0+IHZvaWQpOiB2b2lkIHtcblxuXHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0Y2FzZSAnZXZlbnQnOiB7XG5cdFx0XHRjb25zdCBldmVudCA9IDxEZWJ1Z1Byb3RvY29sLkV2ZW50Pm1zZztcblx0XHRcdHN3aXRjaCAoZXZlbnQuZXZlbnQpIHtcblx0XHRcdFx0Y2FzZSAnb3V0cHV0Jzpcblx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKGZhbHNlLCAoPERlYnVnUHJvdG9jb2wuT3V0cHV0RXZlbnQ+ZXZlbnQpLmJvZHkuc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbG9hZGVkU291cmNlJzpcblx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKGZhbHNlLCAoPERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlRXZlbnQ+ZXZlbnQpLmJvZHkuc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYnJlYWtwb2ludCc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aChmYWxzZSwgKDxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRFdmVudD5ldmVudCkuYm9keS5icmVha3BvaW50LnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y2FzZSAncmVxdWVzdCc6IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSA8RGVidWdQcm90b2NvbC5SZXF1ZXN0Pm1zZztcblx0XHRcdHN3aXRjaCAocmVxdWVzdC5jb21tYW5kKSB7XG5cdFx0XHRcdGNhc2UgJ3NldEJyZWFrcG9pbnRzJzpcblx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKHRydWUsICg8RGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c0FyZ3VtZW50cz5yZXF1ZXN0LmFyZ3VtZW50cykuc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYnJlYWtwb2ludExvY2F0aW9ucyc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aCh0cnVlLCAoPERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludExvY2F0aW9uc0FyZ3VtZW50cz5yZXF1ZXN0LmFyZ3VtZW50cykuc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnc291cmNlJzpcblx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKHRydWUsICg8RGVidWdQcm90b2NvbC5Tb3VyY2VBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpLnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2dvdG9UYXJnZXRzJzpcblx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKHRydWUsICg8RGVidWdQcm90b2NvbC5Hb3RvVGFyZ2V0c0FyZ3VtZW50cz5yZXF1ZXN0LmFyZ3VtZW50cykuc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbGF1bmNoVlNDb2RlJzpcblx0XHRcdFx0XHRyZXF1ZXN0LmFyZ3VtZW50cy5hcmdzLmZvckVhY2goKGFyZzogUGF0aENvbnRhaW5lciB8IHVuZGVmaW5lZCkgPT4gZml4U291cmNlUGF0aChmYWxzZSwgYXJnKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y2FzZSAncmVzcG9uc2UnOiB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IDxEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlPm1zZztcblx0XHRcdGlmIChyZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLmJvZHkpIHtcblx0XHRcdFx0c3dpdGNoIChyZXNwb25zZS5jb21tYW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSAnc3RhY2tUcmFjZSc6XG5cdFx0XHRcdFx0XHQoPERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZVJlc3BvbnNlPnJlc3BvbnNlKS5ib2R5LnN0YWNrRnJhbWVzLmZvckVhY2goZnJhbWUgPT4gZml4U291cmNlUGF0aChmYWxzZSwgZnJhbWUuc291cmNlKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdsb2FkZWRTb3VyY2VzJzpcblx0XHRcdFx0XHRcdCg8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VzUmVzcG9uc2U+cmVzcG9uc2UpLmJvZHkuc291cmNlcy5mb3JFYWNoKHNvdXJjZSA9PiBmaXhTb3VyY2VQYXRoKGZhbHNlLCBzb3VyY2UpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3Njb3Blcyc6XG5cdFx0XHRcdFx0XHQoPERlYnVnUHJvdG9jb2wuU2NvcGVzUmVzcG9uc2U+cmVzcG9uc2UpLmJvZHkuc2NvcGVzLmZvckVhY2goc2NvcGUgPT4gZml4U291cmNlUGF0aChmYWxzZSwgc2NvcGUuc291cmNlKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzZXRGdW5jdGlvbkJyZWFrcG9pbnRzJzpcblx0XHRcdFx0XHRcdCg8RGVidWdQcm90b2NvbC5TZXRGdW5jdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2U+cmVzcG9uc2UpLmJvZHkuYnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiBmaXhTb3VyY2VQYXRoKGZhbHNlLCBicC5zb3VyY2UpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NldEJyZWFrcG9pbnRzJzpcblx0XHRcdFx0XHRcdCg8RGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c1Jlc3BvbnNlPnJlc3BvbnNlKS5ib2R5LmJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gZml4U291cmNlUGF0aChmYWxzZSwgYnAuc291cmNlKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdkaXNhc3NlbWJsZSc6XG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRpID0gPERlYnVnUHJvdG9jb2wuRGlzYXNzZW1ibGVSZXNwb25zZT5yZXNwb25zZTtcblx0XHRcdFx0XHRcdFx0ZGkuYm9keT8uaW5zdHJ1Y3Rpb25zLmZvckVhY2goZGkgPT4gZml4U291cmNlUGF0aChmYWxzZSwgZGkubG9jYXRpb24pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2xvY2F0aW9ucyc6XG5cdFx0XHRcdFx0XHRmaXhTb3VyY2VQYXRoKGZhbHNlLCAoPERlYnVnUHJvdG9jb2wuTG9jYXRpb25zUmVzcG9uc2U+cmVzcG9uc2UpLmJvZHk/LnNvdXJjZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZpc2libGVBbmRTb3J0ZWQ8VCBleHRlbmRzIHsgcHJlc2VudGF0aW9uPzogSUNvbmZpZ1ByZXNlbnRhdGlvbiB9PihhcnJheTogVFtdKTogVFtdIHtcblx0cmV0dXJuIGFycmF5LmZpbHRlcihjb25maWcgPT4gIWNvbmZpZy5wcmVzZW50YXRpb24/LmhpZGRlbikuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4ge1xuXHRcdGlmICghZmlyc3QucHJlc2VudGF0aW9uKSB7XG5cdFx0XHRpZiAoIXNlY29uZC5wcmVzZW50YXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0aWYgKCFzZWNvbmQucHJlc2VudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmICghZmlyc3QucHJlc2VudGF0aW9uLmdyb3VwKSB7XG5cdFx0XHRpZiAoIXNlY29uZC5wcmVzZW50YXRpb24uZ3JvdXApIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBhcmVPcmRlcnMoZmlyc3QucHJlc2VudGF0aW9uLm9yZGVyLCBzZWNvbmQucHJlc2VudGF0aW9uLm9yZGVyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRpZiAoIXNlY29uZC5wcmVzZW50YXRpb24uZ3JvdXApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKGZpcnN0LnByZXNlbnRhdGlvbi5ncm91cCAhPT0gc2Vjb25kLnByZXNlbnRhdGlvbi5ncm91cCkge1xuXHRcdFx0cmV0dXJuIGZpcnN0LnByZXNlbnRhdGlvbi5ncm91cC5sb2NhbGVDb21wYXJlKHNlY29uZC5wcmVzZW50YXRpb24uZ3JvdXApO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wYXJlT3JkZXJzKGZpcnN0LnByZXNlbnRhdGlvbi5vcmRlciwgc2Vjb25kLnByZXNlbnRhdGlvbi5vcmRlcik7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlT3JkZXJzKGZpcnN0OiBudW1iZXIgfCB1bmRlZmluZWQsIHNlY29uZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0aWYgKHR5cGVvZiBmaXJzdCAhPT0gJ251bWJlcicpIHtcblx0XHRpZiAodHlwZW9mIHNlY29uZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiAxO1xuXHR9XG5cdGlmICh0eXBlb2Ygc2Vjb25kICE9PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHJldHVybiBmaXJzdCAtIHNlY29uZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVBbGxCZWZvcmVEZWJ1Z1N0YXJ0KGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHNhdmVCZWZvcmVTdGFydENvbmZpZzogc3RyaW5nID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2RlYnVnLnNhdmVCZWZvcmVTdGFydCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkIH0pO1xuXHRpZiAoc2F2ZUJlZm9yZVN0YXJ0Q29uZmlnICE9PSAnbm9uZScpIHtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnNhdmVBbGwoKTtcblx0XHRpZiAoc2F2ZUJlZm9yZVN0YXJ0Q29uZmlnID09PSAnYWxsRWRpdG9yc0luQWN0aXZlR3JvdXAnKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yICYmIGFjdGl2ZUVkaXRvci5pbnB1dC5yZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBzYXZlIHRoZSBhY3RpdmUgZWRpdG9yIGluIGNhc2UgaXQgaXMgaW4gdW50aXRsZWQgZmlsZSBpdCB3b250IGJlIHNhdmVkIGFzIHBhcnQgb2Ygc2F2ZUFsbCAjMTExODUwXG5cdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZSh7IGVkaXRvcjogYWN0aXZlRWRpdG9yLmlucHV0LCBncm91cElkOiBhY3RpdmVFZGl0b3IuZ3JvdXAuaWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcbn1cblxuZXhwb3J0IGNvbnN0IHNvdXJjZXNFcXVhbCA9IChhOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSB8IHVuZGVmaW5lZCwgYjogRGVidWdQcm90b2NvbC5Tb3VyY2UgfCB1bmRlZmluZWQpOiBib29sZWFuID0+XG5cdCFhIHx8ICFiID8gYSA9PT0gYiA6IGEubmFtZSA9PT0gYi5uYW1lICYmIGEucGF0aCA9PT0gYi5wYXRoICYmIGEuc291cmNlUmVmZXJlbmNlID09PSBiLnNvdXJjZVJlZmVyZW5jZTtcblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgYmVzdCBjaGlsZCBzZXNzaW9uIHRvIGZvY3VzIHdoZW4gYSBwYXJlbnQgc2Vzc2lvbiBpcyBzZWxlY3RlZC5cbiAqIEFsd2F5cyBwcmVmZXIgY2hpbGQgc2Vzc2lvbnMgb3ZlciBwYXJlbnQgd3JhcHBlciBzZXNzaW9ucyB0byBlbnN1cmUgY29uc29sZSByZXNwb25zaXZlbmVzcy5cbiAqIEZpeGVzIGlzc3VlICMxNTI0MDc6IFVzaW5nIGRlYnVnIGNvbnNvbGUgcGlja2VyIHdoZW4gbm90IHBhdXNlZCBsZWF2ZXMgY29uc29sZSB1bnJlc3BvbnNpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQ2hpbGRTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIGFsbFNlc3Npb25zOiByZWFkb25seSBJRGVidWdTZXNzaW9uW10pOiBJRGVidWdTZXNzaW9uIHtcblx0Ly8gQWx3YXlzIGZvY3VzIGNoaWxkIHNlc3Npb24gaW5zdGVhZCBvZiBwYXJlbnQgd3JhcHBlciBzZXNzaW9uICMxNTI0MDdcblx0Y29uc3QgY2hpbGRTZXNzaW9ucyA9IGFsbFNlc3Npb25zLmZpbHRlcihzID0+IHMucGFyZW50U2Vzc2lvbiA9PT0gc2Vzc2lvbik7XG5cdGlmIChjaGlsZFNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHQvLyBQcmVmZXIgc3RvcHBlZCBjaGlsZCBzZXNzaW9uIGlmIGF2YWlsYWJsZSAjMTEyNTk1XG5cdFx0Y29uc3Qgc3RvcHBlZENoaWxkU2Vzc2lvbiA9IGNoaWxkU2Vzc2lvbnMuZmluZChzID0+IHMuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQpO1xuXHRcdGlmIChzdG9wcGVkQ2hpbGRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gc3RvcHBlZENoaWxkU2Vzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgbm8gc3RvcHBlZCBjaGlsZCwgZm9jdXMgdGhlIGZpcnN0IGF2YWlsYWJsZSBjaGlsZCBzZXNzaW9uXG5cdFx0XHRyZXR1cm4gY2hpbGRTZXNzaW9uc1swXTtcblx0XHR9XG5cdH1cblx0Ly8gUmV0dXJuIHRoZSBvcmlnaW5hbCBzZXNzaW9uIGlmIGl0IGhhcyBubyBjaGlsZHJlblxuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxudHlwZSBJUGxhdGZvcm1TcGVjaWZpY0NvbmZpZyA9IE5vbk51bGxhYmxlPElDb25maWdbJ3dpbmRvd3MnXT47XG5cbmZ1bmN0aW9uIGdldFBsYXRmb3JtU3BlY2lmaWNDb25maWcoY29uZmlnOiBJQ29uZmlnLCBvczogT3BlcmF0aW5nU3lzdGVtKTogSVBsYXRmb3JtU3BlY2lmaWNDb25maWcgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKG9zKSB7XG5cdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93czpcblx0XHRcdHJldHVybiBjb25maWcud2luZG93cztcblx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRyZXR1cm4gY29uZmlnLm9zeDtcblx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdHJldHVybiBjb25maWcubGludXg7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVmZmVjdGl2ZUNvbmZpZ0ZvclBsYXRmb3JtKGNvbmZpZzogSUNvbmZpZywgb3M6IE9wZXJhdGluZ1N5c3RlbSA9IE9TKTogSUNvbmZpZyB7XG5cdGNvbnN0IHBsYXRmb3JtQ29uZmlnID0gZ2V0UGxhdGZvcm1TcGVjaWZpY0NvbmZpZyhjb25maWcsIG9zKTtcblx0aWYgKCFwbGF0Zm9ybUNvbmZpZykge1xuXHRcdHJldHVybiBjb25maWc7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdC4uLmNvbmZpZyxcblx0XHQuLi5wbGF0Zm9ybUNvbmZpZyxcblx0XHRwcmVzZW50YXRpb246IHBsYXRmb3JtQ29uZmlnLnByZXNlbnRhdGlvbiA/IHsgLi4uY29uZmlnLnByZXNlbnRhdGlvbiwgLi4ucGxhdGZvcm1Db25maWcucHJlc2VudGF0aW9uIH0gOiBjb25maWcucHJlc2VudGF0aW9uLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnKGNvbmZpZzogSUNvbmZpZywgb3M6IE9wZXJhdGluZ1N5c3RlbSA9IE9TKTogSUNvbmZpZ1ByZXNlbnRhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBnZXRFZmZlY3RpdmVDb25maWdGb3JQbGF0Zm9ybShjb25maWcsIG9zKS5wcmVzZW50YXRpb247XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUE2RSxhQUFhO0FBQzFGLFNBQVMsT0FBTyxXQUFXO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUt4QixTQUFpQixhQUFhO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUJBQWlCLFVBQVU7QUFFcEMsTUFBTSxtQkFBbUI7QUFFbEIsU0FBUyxVQUFVLE9BQWUsWUFBcUIsTUFBcUQ7QUFDbEgsU0FBTyxNQUFNLFFBQVEsa0JBQWtCLFNBQVUsT0FBTyxPQUFPO0FBQzlELFFBQUksY0FBYyxNQUFNLFNBQVMsS0FBSyxNQUFNLENBQUMsTUFBTSxLQUFLO0FBQ3ZELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxRQUFRLEtBQUssZUFBZSxLQUFLLElBQ3ZDLEtBQUssS0FBSyxJQUNWO0FBQUEsRUFDRixDQUFDO0FBQ0Y7QUFNTyxTQUFTLDhCQUFvRSxNQUFxQjtBQUN4RyxRQUFNLFNBQXFCLENBQUM7QUFDNUIsYUFBVyxPQUFPLE9BQU8sS0FBSyxJQUFJLEdBQTJCO0FBQzVELFFBQUksQ0FBQyxJQUFJLFdBQVcsR0FBRyxHQUFHO0FBQ3pCLGFBQU8sR0FBRyxJQUFJLEtB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
