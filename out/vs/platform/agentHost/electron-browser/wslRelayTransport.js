var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { ILogService } from "../../log/common/log.js";
import { AgentHostClientConnectionKind } from "../common/agentHostTelemetry.js";
import { RelayTransport } from "../common/relayTransport.js";
let WSLRelayTransport = class extends RelayTransport {
  constructor(connectionId, wslService, ahpLogger, logService) {
    super(connectionId, wslService, ahpLogger, logService, "[WSLRelayTransport]", AgentHostClientConnectionKind.WSL);
  }
};
WSLRelayTransport = __decorateClass([
  __decorateParam(3, ILogService)
], WSLRelayTransport);
export {
  WSLRelayTransport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxlbGVjdHJvbi1icm93c2VyXFx3c2xSZWxheVRyYW5zcG9ydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWhwSnNvbmxMb2dnZXIgfSBmcm9tICcuLi9jb21tb24vYWhwSnNvbmxMb2dnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFJlbGF5VHJhbnNwb3J0IH0gZnJvbSAnLi4vY29tbW9uL3JlbGF5VHJhbnNwb3J0LmpzJztcbmltcG9ydCB0eXBlIHsgSVdTTFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3dzbFJlbW90ZUFnZW50SG9zdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXU0xSZWxheVRyYW5zcG9ydCBleHRlbmRzIFJlbGF5VHJhbnNwb3J0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29ubmVjdGlvbklkOiBzdHJpbmcsXG5cdFx0d3NsU2VydmljZTogSVdTTFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLFxuXHRcdGFocExvZ2dlcjogQWhwSnNvbmxMb2dnZXIgfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb25uZWN0aW9uSWQsIHdzbFNlcnZpY2UsIGFocExvZ2dlciwgbG9nU2VydmljZSwgJ1tXU0xSZWxheVRyYW5zcG9ydF0nLCBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5XU0wpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsc0JBQXNCO0FBR3hCLElBQU0sb0JBQU4sY0FBZ0MsZUFBZTtBQUFBLEVBQ3JELFlBQ0MsY0FDQSxZQUNBLFdBQ2EsWUFDWjtBQUNELFVBQU0sY0FBYyxZQUFZLFdBQVcsWUFBWSx1QkFBdUIsOEJBQThCLEdBQUc7QUFBQSxFQUNoSDtBQUNEO0FBVGEsb0JBQU47QUFBQSxFQUtKO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
