import { bufferToStream, VSBuffer } from "../../../common/buffer.js";
import { canceled } from "../../../common/errors.js";
import { OfflineError } from "./request.js";
async function request(options, token, isOnline) {
  if (token.isCancellationRequested) {
    throw canceled();
  }
  const cancellation = new AbortController();
  const disposable = token.onCancellationRequested(() => cancellation.abort());
  const signal = options.timeout ? AbortSignal.any([
    cancellation.signal,
    AbortSignal.timeout(options.timeout)
  ]) : cancellation.signal;
  try {
    const fetchInit = {
      method: options.type || "GET",
      headers: getRequestHeaders(options),
      body: options.data,
      signal
    };
    if (options.disableCache) {
      fetchInit.cache = "no-store";
    }
    const res = await fetch(options.url || "", fetchInit);
    return {
      res: {
        statusCode: res.status,
        headers: getResponseHeaders(res)
      },
      stream: bufferToStream(VSBuffer.wrap(new Uint8Array(await res.arrayBuffer())))
    };
  } catch (err) {
    if (isOnline && !isOnline()) {
      throw new OfflineError();
    }
    if (err?.name === "AbortError") {
      throw canceled();
    }
    if (err?.name === "TimeoutError") {
      throw new Error(`Fetch timeout: ${options.timeout}ms`);
    }
    throw err;
  } finally {
    disposable.dispose();
  }
}
function getRequestHeaders(options) {
  if (options.headers || options.user || options.password || options.proxyAuthorization) {
    const headers = new Headers();
    outer: for (const k in options.headers) {
      switch (k.toLowerCase()) {
        case "user-agent":
        case "accept-encoding":
        case "content-length":
          continue outer;
      }
      const header = options.headers[k];
      if (typeof header === "string") {
        headers.set(k, header);
      } else if (Array.isArray(header)) {
        for (const h of header) {
          headers.append(k, h);
        }
      }
    }
    if (options.user || options.password) {
      headers.set("Authorization", "Basic " + btoa(`${options.user || ""}:${options.password || ""}`));
    }
    if (options.proxyAuthorization) {
      headers.set("Proxy-Authorization", options.proxyAuthorization);
    }
    return headers;
  }
  return void 0;
}
function getResponseHeaders(res) {
  const headers = /* @__PURE__ */ Object.create(null);
  res.headers.forEach((value, key) => {
    if (headers[key]) {
      if (Array.isArray(headers[key])) {
        headers[key].push(value);
      } else {
        headers[key] = [headers[key], value];
      }
    } else {
      headers[key] = value;
    }
  });
  return headers;
}
export {
  request
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xccmVxdWVzdFxcY29tbW9uXFxyZXF1ZXN0SW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJSGVhZGVycywgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMsIE9mZmxpbmVFcnJvciB9IGZyb20gJy4vcmVxdWVzdC5qcyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBpc09ubGluZT86ICgpID0+IGJvb2xlYW4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHR9XG5cblx0Y29uc3QgY2FuY2VsbGF0aW9uID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRjb25zdCBkaXNwb3NhYmxlID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY2FuY2VsbGF0aW9uLmFib3J0KCkpO1xuXHRjb25zdCBzaWduYWwgPSBvcHRpb25zLnRpbWVvdXQgPyBBYm9ydFNpZ25hbC5hbnkoW1xuXHRcdGNhbmNlbGxhdGlvbi5zaWduYWwsXG5cdFx0QWJvcnRTaWduYWwudGltZW91dChvcHRpb25zLnRpbWVvdXQpLFxuXHRdKSA6IGNhbmNlbGxhdGlvbi5zaWduYWw7XG5cblx0dHJ5IHtcblx0XHRjb25zdCBmZXRjaEluaXQ6IFJlcXVlc3RJbml0ID0ge1xuXHRcdFx0bWV0aG9kOiBvcHRpb25zLnR5cGUgfHwgJ0dFVCcsXG5cdFx0XHRoZWFkZXJzOiBnZXRSZXF1ZXN0SGVhZGVycyhvcHRpb25zKSxcblx0XHRcdGJvZHk6IG9wdGlvbnMuZGF0YSxcblx0XHRcdHNpZ25hbFxuXHRcdH07XG5cdFx0aWYgKG9wdGlvbnMuZGlzYWJsZUNhY2hlKSB7XG5cdFx0XHRmZXRjaEluaXQuY2FjaGUgPSAnbm8tc3RvcmUnO1xuXHRcdH1cblx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaChvcHRpb25zLnVybCB8fCAnJywgZmV0Y2hJbml0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzOiB7XG5cdFx0XHRcdHN0YXR1c0NvZGU6IHJlcy5zdGF0dXMsXG5cdFx0XHRcdGhlYWRlcnM6IGdldFJlc3BvbnNlSGVhZGVycyhyZXMpLFxuXHRcdFx0fSxcblx0XHRcdHN0cmVhbTogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShhd2FpdCByZXMuYXJyYXlCdWZmZXIoKSkpKSxcblx0XHR9O1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRpZiAoaXNPbmxpbmUgJiYgIWlzT25saW5lKCkpIHtcblx0XHRcdHRocm93IG5ldyBPZmZsaW5lRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKGVycj8ubmFtZSA9PT0gJ0Fib3J0RXJyb3InKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRpZiAoZXJyPy5uYW1lID09PSAnVGltZW91dEVycm9yJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGZXRjaCB0aW1lb3V0OiAke29wdGlvbnMudGltZW91dH1tc2ApO1xuXHRcdH1cblx0XHR0aHJvdyBlcnI7XG5cdH0gZmluYWxseSB7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWVzdEhlYWRlcnMob3B0aW9uczogSVJlcXVlc3RPcHRpb25zKSB7XG5cdGlmIChvcHRpb25zLmhlYWRlcnMgfHwgb3B0aW9ucy51c2VyIHx8IG9wdGlvbnMucGFzc3dvcmQgfHwgb3B0aW9ucy5wcm94eUF1dGhvcml6YXRpb24pIHtcblx0XHRjb25zdCBoZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcblx0XHRvdXRlcjogZm9yIChjb25zdCBrIGluIG9wdGlvbnMuaGVhZGVycykge1xuXHRcdFx0c3dpdGNoIChrLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0Y2FzZSAndXNlci1hZ2VudCc6XG5cdFx0XHRcdGNhc2UgJ2FjY2VwdC1lbmNvZGluZyc6XG5cdFx0XHRcdGNhc2UgJ2NvbnRlbnQtbGVuZ3RoJzpcblx0XHRcdFx0XHQvLyB1bnNhZmUgaGVhZGVyc1xuXHRcdFx0XHRcdGNvbnRpbnVlIG91dGVyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGVhZGVyID0gb3B0aW9ucy5oZWFkZXJzW2tdO1xuXHRcdFx0aWYgKHR5cGVvZiBoZWFkZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGhlYWRlcnMuc2V0KGssIGhlYWRlcik7XG5cdFx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoaGVhZGVyKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGggb2YgaGVhZGVyKSB7XG5cdFx0XHRcdFx0aGVhZGVycy5hcHBlbmQoaywgaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudXNlciB8fCBvcHRpb25zLnBhc3N3b3JkKSB7XG5cdFx0XHRoZWFkZXJzLnNldCgnQXV0aG9yaXphdGlvbicsICdCYXNpYyAnICsgYnRvYShgJHtvcHRpb25zLnVzZXIgfHwgJyd9OiR7b3B0aW9ucy5wYXNzd29yZCB8fCAnJ31gKSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnByb3h5QXV0aG9yaXphdGlvbikge1xuXHRcdFx0aGVhZGVycy5zZXQoJ1Byb3h5LUF1dGhvcml6YXRpb24nLCBvcHRpb25zLnByb3h5QXV0aG9yaXphdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBoZWFkZXJzO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFJlc3BvbnNlSGVhZGVycyhyZXM6IFJlc3BvbnNlKTogSUhlYWRlcnMge1xuXHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdHJlcy5oZWFkZXJzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRpZiAoaGVhZGVyc1trZXldKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShoZWFkZXJzW2tleV0pKSB7XG5cdFx0XHRcdGhlYWRlcnNba2V5XS5wdXNoKHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlYWRlcnNba2V5XSA9IFtoZWFkZXJzW2tleV0sIHZhbHVlXTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVhZGVyc1trZXldID0gdmFsdWU7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIGhlYWRlcnM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQixnQkFBZ0I7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBcUQsb0JBQW9CO0FBRXpFLGVBQXNCLFFBQVEsU0FBMEIsT0FBMEIsVUFBb0Q7QUFDckksTUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxVQUFNLFNBQVM7QUFBQSxFQUNoQjtBQUVBLFFBQU0sZUFBZSxJQUFJLGdCQUFnQjtBQUN6QyxRQUFNLGFBQWEsTUFBTSx3QkFBd0IsTUFBTSxhQUFhLE1BQU0sQ0FBQztBQUMzRSxRQUFNLFNBQVMsUUFBUSxVQUFVLFlBQVksSUFBSTtBQUFBLElBQ2hELGFBQWE7QUFBQSxJQUNiLFlBQVksUUFBUSxRQUFRLE9BQU87QUFBQSxFQUNwQyxDQUFDLElBQUksYUFBYTtBQUVsQixNQUFJO0FBQ0gsVUFBTSxZQUF5QjtBQUFBLE1BQzlCLFFBQVEsUUFBUSxRQUFRO0FBQUEsTUFDeEIsU0FBUyxrQkFBa0IsT0FBTztBQUFBLE1BQ2xDLE1BQU0sUUFBUTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxRQUFRLGNBQWM7QUFDekIsZ0JBQVUsUUFBUTtBQUFBLElBQ25CO0FBQ0EsVUFBTSxNQUFNLE1BQU0sTUFBTSxRQUFRLE9BQU8sSUFBSSxTQUFTO0FBQ3BELFdBQU87QUFBQSxNQUNOLEtBQUs7QUFBQSxRQUNKLFlBQVksSUFBSTtBQUFBLFFBQ2hCLFNBQVMsbUJBQW1CLEdBQUc7QUFBQSxNQUNoQztBQUFBLE1BQ0EsUUFBUSxlQUFlLFNBQVMsS0FBSyxJQUFJLFdBQVcsTUFBTSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUM5RTtBQUFBLEVBQ0QsU0FBUyxLQUFLO0FBQ2IsUUFBSSxZQUFZLENBQUMsU0FBUyxHQUFHO0FBQzVCLFlBQU0sSUFBSSxhQUFhO0FBQUEsSUFDeEI7QUFDQSxRQUFJLEtBQUssU0FBUyxjQUFjO0FBQy9CLFlBQU0sU0FBUztBQUFBLElBQ2hCO0FBQ0EsUUFBSSxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLGtCQUFrQixRQUFRLE9BQU8sSUFBSTtBQUFBLElBQ3REO0FBQ0EsVUFBTTtBQUFBLEVBQ1AsVUFBRTtBQUNELGVBQVcsUUFBUTtBQUFBLEVBQ3BCO0FBQ0Q7QUFFQSxTQUFTLGtCQUFrQixTQUEwQjtBQUNwRCxNQUFJLFFBQVEsV0FBVyxRQUFRLFFBQVEsUUFBUSxZQUFZLFFBQVEsb0JBQW9CO0FBQ3RGLFVBQU0sVUFBVSxJQUFJLFFBQVE7QUFDNUIsVUFBTyxZQUFXLEtBQUssUUFBUSxTQUFTO0FBQ3ZDLGNBQVEsRUFBRSxZQUFZLEdBQUc7QUFBQSxRQUN4QixLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBRUosbUJBQVM7QUFBQSxNQUNYO0FBQ0EsWUFBTSxTQUFTLFFBQVEsUUFBUSxDQUFDO0FBQ2hDLFVBQUksT0FBTyxXQUFXLFVBQVU7QUFDL0IsZ0JBQVEsSUFBSSxHQUFHLE1BQU07QUFBQSxNQUN0QixXQUFXLE1BQU0sUUFBUSxNQUFNLEdBQUc7QUFDakMsbUJBQVcsS0FBSyxRQUFRO0FBQ3ZCLGtCQUFRLE9BQU8sR0FBRyxDQUFDO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksUUFBUSxRQUFRLFFBQVEsVUFBVTtBQUNyQyxjQUFRLElBQUksaUJBQWlCLFdBQVcsS0FBSyxHQUFHLFFBQVEsUUFBUSxFQUFFLElBQUksUUFBUSxZQUFZLEVBQUUsRUFBRSxDQUFDO0FBQUEsSUFDaEc7QUFDQSxRQUFJLFFBQVEsb0JBQW9CO0FBQy9CLGNBQVEsSUFBSSx1QkFBdUIsUUFBUSxrQkFBa0I7QUFBQSxJQUM5RDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxtQkFBbUIsS0FBeUI7QUFDcEQsUUFBTSxVQUFvQix1QkFBTyxPQUFPLElBQUk7QUFDNUMsTUFBSSxRQUFRLFFBQVEsQ0FBQyxPQUFPLFFBQVE7QUFDbkMsUUFBSSxRQUFRLEdBQUcsR0FBRztBQUNqQixVQUFJLE1BQU0sUUFBUSxRQUFRLEdBQUcsQ0FBQyxHQUFHO0FBQ2hDLGdCQUFRLEdBQUcsRUFBRSxLQUFLLEtBQUs7QUFBQSxNQUN4QixPQUFPO0FBQ04sZ0JBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxHQUFHLEdBQUcsS0FBSztBQUFBLE1BQ3BDO0FBQUEsSUFDRCxPQUFPO0FBQ04sY0FBUSxHQUFHLElBQUk7QUFBQSxJQUNoQjtBQUFBLEVBQ0QsQ0FBQztBQUNELFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
