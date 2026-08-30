import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import Severity from "../../../../base/common/severity.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { TextSearchCompleteMessageType } from "../../../services/search/common/searchExtTypes.js";
import { Schemas } from "../../../../base/common/network.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { URI } from "../../../../base/common/uri.js";
const renderSearchMessage = (message, instantiationService, notificationService, openerService, commandService, disposableStore, triggerSearch) => {
  const div = dom.$("div.providerMessage");
  const linkedText = parseLinkedText(message.text);
  dom.append(
    div,
    dom.$("." + SeverityIcon.className(
      message.type === TextSearchCompleteMessageType.Information ? Severity.Info : Severity.Warning
    ).split(" ").join("."))
  );
  for (const node of linkedText.nodes) {
    if (typeof node === "string") {
      dom.append(div, document.createTextNode(node));
    } else {
      const link = instantiationService.createInstance(Link, div, node, {
        opener: async (href) => {
          if (!message.trusted) {
            return;
          }
          const parsed = URI.parse(href, true);
          if (parsed.scheme === Schemas.command && message.trusted) {
            const result = await commandService.executeCommand(parsed.path);
            if (result?.triggerSearch) {
              triggerSearch();
            }
          } else if (parsed.scheme === Schemas.https) {
            openerService.open(parsed);
          } else {
            if (parsed.scheme === Schemas.command && !message.trusted) {
              notificationService.error(nls.localize("unable to open trust", "Unable to open command link from untrusted source: {0}", href));
            } else {
              notificationService.error(nls.localize("unable to open", "Unable to open unknown link: {0}", href));
            }
          }
        }
      });
      disposableStore.add(link);
    }
  }
  return div;
};
export {
  renderSearchMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoTWVzc2FnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2V2ZXJpdHlJY29uL3NldmVyaXR5SWNvbi5qcyc7XG5pbXBvcnQgeyBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlLCBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZXhwb3J0IGNvbnN0IHJlbmRlclNlYXJjaE1lc3NhZ2UgPSAoXG5cdG1lc3NhZ2U6IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2UsXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0Y29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0ZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdHRyaWdnZXJTZWFyY2g6ICgpID0+IHZvaWQsXG4pOiBIVE1MRWxlbWVudCA9PiB7XG5cdGNvbnN0IGRpdiA9IGRvbS4kKCdkaXYucHJvdmlkZXJNZXNzYWdlJyk7XG5cdGNvbnN0IGxpbmtlZFRleHQgPSBwYXJzZUxpbmtlZFRleHQobWVzc2FnZS50ZXh0KTtcblx0ZG9tLmFwcGVuZChkaXYsXG5cdFx0ZG9tLiQoJy4nICtcblx0XHRcdFNldmVyaXR5SWNvbi5jbGFzc05hbWUoXG5cdFx0XHRcdG1lc3NhZ2UudHlwZSA9PT0gVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUuSW5mb3JtYXRpb25cblx0XHRcdFx0XHQ/IFNldmVyaXR5LkluZm9cblx0XHRcdFx0XHQ6IFNldmVyaXR5Lldhcm5pbmcpXG5cdFx0XHRcdC5zcGxpdCgnICcpXG5cdFx0XHRcdC5qb2luKCcuJykpKTtcblxuXHRmb3IgKGNvbnN0IG5vZGUgb2YgbGlua2VkVGV4dC5ub2Rlcykge1xuXHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGRvbS5hcHBlbmQoZGl2LCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShub2RlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxpbmsgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rLCBkaXYsIG5vZGUsIHtcblx0XHRcdFx0b3BlbmVyOiBhc3luYyBocmVmID0+IHtcblx0XHRcdFx0XHRpZiAoIW1lc3NhZ2UudHJ1c3RlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UoaHJlZiwgdHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKHBhcnNlZC5zY2hlbWUgPT09IFNjaGVtYXMuY29tbWFuZCAmJiBtZXNzYWdlLnRydXN0ZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHBhcnNlZC5wYXRoKTtcblx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0aWYgKChyZXN1bHQgYXMgYW55KT8udHJpZ2dlclNlYXJjaCkge1xuXHRcdFx0XHRcdFx0XHR0cmlnZ2VyU2VhcmNoKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJzZWQuc2NoZW1lID09PSBTY2hlbWFzLmh0dHBzKSB7XG5cdFx0XHRcdFx0XHRvcGVuZXJTZXJ2aWNlLm9wZW4ocGFyc2VkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHBhcnNlZC5zY2hlbWUgPT09IFNjaGVtYXMuY29tbWFuZCAmJiAhbWVzc2FnZS50cnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCd1bmFibGUgdG8gb3BlbiB0cnVzdCcsIFwiVW5hYmxlIHRvIG9wZW4gY29tbWFuZCBsaW5rIGZyb20gdW50cnVzdGVkIHNvdXJjZTogezB9XCIsIGhyZWYpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCd1bmFibGUgdG8gb3BlbicsIFwiVW5hYmxlIHRvIG9wZW4gdW5rbm93biBsaW5rOiB7MH1cIiwgaHJlZikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGxpbmspO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGl2O1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFFckIsU0FBUyx1QkFBdUI7QUFDaEMsT0FBTyxjQUFjO0FBR3JCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQW9DLHFDQUFxQztBQUV6RSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUViLE1BQU0sc0JBQXNCLENBQ2xDLFNBQ0Esc0JBQ0EscUJBQ0EsZUFDQSxnQkFDQSxpQkFDQSxrQkFDaUI7QUFDakIsUUFBTSxNQUFNLElBQUksRUFBRSxxQkFBcUI7QUFDdkMsUUFBTSxhQUFhLGdCQUFnQixRQUFRLElBQUk7QUFDL0MsTUFBSTtBQUFBLElBQU87QUFBQSxJQUNWLElBQUksRUFBRSxNQUNMLGFBQWE7QUFBQSxNQUNaLFFBQVEsU0FBUyw4QkFBOEIsY0FDNUMsU0FBUyxPQUNULFNBQVM7QUFBQSxJQUFPLEVBQ2xCLE1BQU0sR0FBRyxFQUNULEtBQUssR0FBRyxDQUFDO0FBQUEsRUFBQztBQUVkLGFBQVcsUUFBUSxXQUFXLE9BQU87QUFDcEMsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixVQUFJLE9BQU8sS0FBSyxTQUFTLGVBQWUsSUFBSSxDQUFDO0FBQUEsSUFDOUMsT0FBTztBQUNOLFlBQU0sT0FBTyxxQkFBcUIsZUFBZSxNQUFNLEtBQUssTUFBTTtBQUFBLFFBQ2pFLFFBQVEsT0FBTSxTQUFRO0FBQ3JCLGNBQUksQ0FBQyxRQUFRLFNBQVM7QUFBRTtBQUFBLFVBQVE7QUFDaEMsZ0JBQU0sU0FBUyxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQ25DLGNBQUksT0FBTyxXQUFXLFFBQVEsV0FBVyxRQUFRLFNBQVM7QUFDekQsa0JBQU0sU0FBUyxNQUFNLGVBQWUsZUFBZSxPQUFPLElBQUk7QUFFOUQsZ0JBQUssUUFBZ0IsZUFBZTtBQUNuQyw0QkFBYztBQUFBLFlBQ2Y7QUFBQSxVQUNELFdBQVcsT0FBTyxXQUFXLFFBQVEsT0FBTztBQUMzQywwQkFBYyxLQUFLLE1BQU07QUFBQSxVQUMxQixPQUFPO0FBQ04sZ0JBQUksT0FBTyxXQUFXLFFBQVEsV0FBVyxDQUFDLFFBQVEsU0FBUztBQUMxRCxrQ0FBb0IsTUFBTSxJQUFJLFNBQVMsd0JBQXdCLDBEQUEwRCxJQUFJLENBQUM7QUFBQSxZQUMvSCxPQUFPO0FBQ04sa0NBQW9CLE1BQU0sSUFBSSxTQUFTLGtCQUFrQixvQ0FBb0MsSUFBSSxDQUFDO0FBQUEsWUFDbkc7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELHNCQUFnQixJQUFJLElBQUk7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
