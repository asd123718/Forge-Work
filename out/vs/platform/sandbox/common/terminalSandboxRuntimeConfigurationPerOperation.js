import { OperatingSystem } from "../../../base/common/platform.js";
import { matchesTerminalSandboxCommandRule } from "./terminalSandboxCommandRules.js";
var TerminalSandboxRuntimeConfigurationOperation = /* @__PURE__ */ ((TerminalSandboxRuntimeConfigurationOperation2) => {
  TerminalSandboxRuntimeConfigurationOperation2["GnuPG"] = "gnupg";
  TerminalSandboxRuntimeConfigurationOperation2["Node"] = "node";
  return TerminalSandboxRuntimeConfigurationOperation2;
})(TerminalSandboxRuntimeConfigurationOperation || {});
const terminalSandboxRuntimeConfigurationCommandRules = [
  {
    keywords: ["node", "npm", "npx", "pnpm", "yarn", "corepack", "bun", "deno", "nvm", "volta", "fnm", "asdf", "mise"],
    value: "node" /* Node */
  },
  {
    keywords: ["git"],
    value: "gnupg" /* GnuPG */,
    condition: ({ os }) => os !== OperatingSystem.Windows
  }
];
function getTerminalSandboxRuntimeConfigurationForOperation(operation, os) {
  switch (operation) {
    case "gnupg" /* GnuPG */:
      switch (os) {
        case OperatingSystem.Windows:
          return {};
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return {
            network: {
              allowAllUnixSockets: true
            },
            filesystem: {
              allowRead: [
                "~/.gnupg"
              ],
              allowWrite: [
                "~/.gnupg"
              ]
            }
          };
      }
    case "node" /* Node */:
      switch (os) {
        case OperatingSystem.Windows:
          return {};
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return {
            filesystem: {
              allowWrite: [
                "~/.volta/"
              ]
            }
          };
      }
  }
}
function getTerminalSandboxRuntimeConfigurationForCommands(os, commandDetails) {
  const operations = /* @__PURE__ */ new Set();
  for (const command of commandDetails) {
    for (const rule of terminalSandboxRuntimeConfigurationCommandRules) {
      if (matchesTerminalSandboxCommandRule(command, rule, { os }) && shouldApplyRuntimeConfigurationOperation(rule.value, commandDetails)) {
        operations.add(rule.value);
      }
    }
  }
  const configuration = {};
  for (const operation of operations) {
    mergeAdditionalSandboxConfigProperties(configuration, getTerminalSandboxRuntimeConfigurationForOperation(operation, os));
  }
  return configuration;
}
function shouldApplyRuntimeConfigurationOperation(operation, commandDetails) {
  switch (operation) {
    case "gnupg" /* GnuPG */:
      return commandDetails.every((command) => !command.keyword.toLowerCase().startsWith("docker"));
    case "node" /* Node */:
      return true;
  }
}
function mergeAdditionalSandboxConfigProperties(target, additional) {
  for (const [key, value] of Object.entries(additional)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = value;
      continue;
    }
    const existingValue = target[key];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      target[key] = [.../* @__PURE__ */ new Set([...existingValue, ...value])];
      continue;
    }
    if (isObjectForSandboxConfigMerge(existingValue) && isObjectForSandboxConfigMerge(value)) {
      mergeAdditionalSandboxConfigProperties(existingValue, value);
    }
  }
}
function isObjectForSandboxConfigMerge(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export {
  TerminalSandboxRuntimeConfigurationOperation,
  getTerminalSandboxRuntimeConfigurationForCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2FuZGJveFxcY29tbW9uXFx0ZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvblBlck9wZXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsU2FuZGJveENvbW1hbmQgfSBmcm9tICcuL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFJ1bGUsIG1hdGNoZXNUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZSB9IGZyb20gJy4vdGVybWluYWxTYW5kYm94Q29tbWFuZFJ1bGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24ge1xuXHRHbnVQRyA9ICdnbnVwZycsXG5cdE5vZGUgPSAnbm9kZScsXG59XG5cbmNvbnN0IHRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uQ29tbWFuZFJ1bGVzOiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFJ1bGU8VGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24+W10gPSBbXG5cdHtcblx0XHRrZXl3b3JkczogWydub2RlJywgJ25wbScsICducHgnLCAncG5wbScsICd5YXJuJywgJ2NvcmVwYWNrJywgJ2J1bicsICdkZW5vJywgJ252bScsICd2b2x0YScsICdmbm0nLCAnYXNkZicsICdtaXNlJ10sXG5cdFx0dmFsdWU6IFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLk5vZGUsXG5cdH0sXG5cdHtcblx0XHRrZXl3b3JkczogWydnaXQnXSxcblx0XHR2YWx1ZTogVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24uR251UEcsXG5cdFx0Y29uZGl0aW9uOiAoeyBvcyB9KSA9PiBvcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsXG5cdH0sXG5dO1xuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvck9wZXJhdGlvbihvcGVyYXRpb246IFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLCBvczogT3BlcmF0aW5nU3lzdGVtKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRzd2l0Y2ggKG9wZXJhdGlvbikge1xuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24uR251UEc6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRuZXR3b3JrOiB7XG5cdFx0XHRcdFx0XHRcdGFsbG93QWxsVW5peFNvY2tldHM6IHRydWVcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdFx0XHRcdGFsbG93UmVhZDogW1xuXHRcdFx0XHRcdFx0XHRcdCd+Ly5nbnVwZydcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0YWxsb3dXcml0ZTogW1xuXHRcdFx0XHRcdFx0XHRcdCd+Ly5nbnVwZydcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLk5vZGU6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdFx0XHRcdGFsbG93V3JpdGU6IFtcblx0XHRcdFx0XHRcdFx0XHQnfi8udm9sdGEvJ1xuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25Gb3JDb21tYW5kcyhvczogT3BlcmF0aW5nU3lzdGVtLCBjb21tYW5kRGV0YWlsczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Y29uc3Qgb3BlcmF0aW9ucyA9IG5ldyBTZXQ8VGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24+KCk7XG5cdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kRGV0YWlscykge1xuXHRcdGZvciAoY29uc3QgcnVsZSBvZiB0ZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkNvbW1hbmRSdWxlcykge1xuXHRcdFx0aWYgKG1hdGNoZXNUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZShjb21tYW5kLCBydWxlLCB7IG9zIH0pICYmIHNob3VsZEFwcGx5UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24ocnVsZS52YWx1ZSwgY29tbWFuZERldGFpbHMpKSB7XG5cdFx0XHRcdG9wZXJhdGlvbnMuYWRkKHJ1bGUudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIG9wZXJhdGlvbnMpIHtcblx0XHRtZXJnZUFkZGl0aW9uYWxTYW5kYm94Q29uZmlnUHJvcGVydGllcyhjb25maWd1cmF0aW9uLCBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvck9wZXJhdGlvbihvcGVyYXRpb24sIG9zKSk7XG5cdH1cblx0cmV0dXJuIGNvbmZpZ3VyYXRpb247XG59XG5cbmZ1bmN0aW9uIHNob3VsZEFwcGx5UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24ob3BlcmF0aW9uOiBUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbiwgY29tbWFuZERldGFpbHM6IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kW10pOiBib29sZWFuIHtcblx0c3dpdGNoIChvcGVyYXRpb24pIHtcblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLkdudVBHOlxuXHRcdFx0Ly8gRG9ja2VyIHNvY2tldCBhY2Nlc3MgY2FuIGdyYW50IGhvc3QtbGV2ZWwgcHJpdmlsZWdlcywgc28gZG8gbm90IGFsbG93IGFsbCBVbml4XG5cdFx0XHQvLyBzb2NrZXRzIHdoZW4gYSBEb2NrZXItcmVsYXRlZCBjb21tYW5kIGlzIHBhcnQgb2YgdGhlIHNhbmRib3ggaW52b2NhdGlvbi5cblx0XHRcdHJldHVybiBjb21tYW5kRGV0YWlscy5ldmVyeShjb21tYW5kID0+ICFjb21tYW5kLmtleXdvcmQudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdkb2NrZXInKSk7XG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbi5Ob2RlOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWVyZ2VBZGRpdGlvbmFsU2FuZGJveENvbmZpZ1Byb3BlcnRpZXModGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgYWRkaXRpb25hbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYWRkaXRpb25hbCkpIHtcblx0XHRpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0YXJnZXQsIGtleSkpIHtcblx0XHRcdHRhcmdldFtrZXldID0gdmFsdWU7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ1ZhbHVlID0gdGFyZ2V0W2tleV07XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZXhpc3RpbmdWYWx1ZSkgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHRhcmdldFtrZXldID0gWy4uLm5ldyBTZXQoWy4uLmV4aXN0aW5nVmFsdWUsIC4uLnZhbHVlXSldO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZShleGlzdGluZ1ZhbHVlKSAmJiBpc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZSh2YWx1ZSkpIHtcblx0XHRcdG1lcmdlQWRkaXRpb25hbFNhbmRib3hDb25maWdQcm9wZXJ0aWVzKGV4aXN0aW5nVmFsdWUsIHZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNPYmplY3RGb3JTYW5kYm94Q29uZmlnTWVyZ2UodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBRWhDLFNBQTJDLHlDQUF5QztBQUU3RSxJQUFXLCtDQUFYLGtCQUFXQSxrREFBWDtBQUNOLEVBQUFBLDhDQUFBLFdBQVE7QUFDUixFQUFBQSw4Q0FBQSxVQUFPO0FBRlUsU0FBQUE7QUFBQSxHQUFBO0FBS2xCLE1BQU0sa0RBQXdJO0FBQUEsRUFDN0k7QUFBQSxJQUNDLFVBQVUsQ0FBQyxRQUFRLE9BQU8sT0FBTyxRQUFRLFFBQVEsWUFBWSxPQUFPLFFBQVEsT0FBTyxTQUFTLE9BQU8sUUFBUSxNQUFNO0FBQUEsSUFDakgsT0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBO0FBQUEsSUFDQyxVQUFVLENBQUMsS0FBSztBQUFBLElBQ2hCLE9BQU87QUFBQSxJQUNQLFdBQVcsQ0FBQyxFQUFFLEdBQUcsTUFBTSxPQUFPLGdCQUFnQjtBQUFBLEVBQy9DO0FBQ0Q7QUFFQSxTQUFTLG1EQUFtRCxXQUF5RCxJQUE4QztBQUNsSyxVQUFRLFdBQVc7QUFBQSxJQUNsQixLQUFLO0FBQ0osY0FBUSxJQUFJO0FBQUEsUUFDWCxLQUFLLGdCQUFnQjtBQUNwQixpQkFBTyxDQUFDO0FBQUEsUUFDVCxLQUFLLGdCQUFnQjtBQUFBLFFBQ3JCLEtBQUssZ0JBQWdCO0FBQUEsUUFDckI7QUFDQyxpQkFBTztBQUFBLFlBQ04sU0FBUztBQUFBLGNBQ1IscUJBQXFCO0FBQUEsWUFDdEI7QUFBQSxZQUNBLFlBQVk7QUFBQSxjQUNYLFdBQVc7QUFBQSxnQkFDVjtBQUFBLGNBQ0Q7QUFBQSxjQUNBLFlBQVk7QUFBQSxnQkFDWDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLE1BQ0Y7QUFBQSxJQUVELEtBQUs7QUFDSixjQUFRLElBQUk7QUFBQSxRQUNYLEtBQUssZ0JBQWdCO0FBQ3BCLGlCQUFPLENBQUM7QUFBQSxRQUNULEtBQUssZ0JBQWdCO0FBQUEsUUFDckIsS0FBSyxnQkFBZ0I7QUFBQSxRQUNyQjtBQUNDLGlCQUFPO0FBQUEsWUFDTixZQUFZO0FBQUEsY0FDWCxZQUFZO0FBQUEsZ0JBQ1g7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxNQUNGO0FBQUEsRUFDRjtBQUNEO0FBRU8sU0FBUyxrREFBa0QsSUFBcUIsZ0JBQTZFO0FBQ25LLFFBQU0sYUFBYSxvQkFBSSxJQUFrRDtBQUN6RSxhQUFXLFdBQVcsZ0JBQWdCO0FBQ3JDLGVBQVcsUUFBUSxpREFBaUQ7QUFDbkUsVUFBSSxrQ0FBa0MsU0FBUyxNQUFNLEVBQUUsR0FBRyxDQUFDLEtBQUsseUNBQXlDLEtBQUssT0FBTyxjQUFjLEdBQUc7QUFDckksbUJBQVcsSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsUUFBTSxnQkFBeUMsQ0FBQztBQUNoRCxhQUFXLGFBQWEsWUFBWTtBQUNuQywyQ0FBdUMsZUFBZSxtREFBbUQsV0FBVyxFQUFFLENBQUM7QUFBQSxFQUN4SDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMseUNBQXlDLFdBQXlELGdCQUE2RDtBQUN2SyxVQUFRLFdBQVc7QUFBQSxJQUNsQixLQUFLO0FBR0osYUFBTyxlQUFlLE1BQU0sYUFBVyxDQUFDLFFBQVEsUUFBUSxZQUFZLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFBQSxJQUMzRixLQUFLO0FBQ0osYUFBTztBQUFBLEVBQ1Q7QUFDRDtBQUVBLFNBQVMsdUNBQXVDLFFBQWlDLFlBQTJDO0FBQzNILGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQ3RELFFBQUksQ0FBQyxPQUFPLFVBQVUsZUFBZSxLQUFLLFFBQVEsR0FBRyxHQUFHO0FBQ3ZELGFBQU8sR0FBRyxJQUFJO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxnQkFBZ0IsT0FBTyxHQUFHO0FBQ2hDLFFBQUksTUFBTSxRQUFRLGFBQWEsS0FBSyxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pELGFBQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxvQkFBSSxJQUFJLENBQUMsR0FBRyxlQUFlLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDdkQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSw4QkFBOEIsYUFBYSxLQUFLLDhCQUE4QixLQUFLLEdBQUc7QUFDekYsNkNBQXVDLGVBQWUsS0FBSztBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyw4QkFBOEIsT0FBa0Q7QUFDeEYsU0FBTyxPQUFPLFVBQVUsWUFBWSxVQUFVLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSztBQUMzRTsiLAogICJuYW1lcyI6IFsiVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24iXQp9Cg==
