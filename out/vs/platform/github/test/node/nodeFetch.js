const nodeFetch = async (input, init) => {
  const http = await import("http");
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = init?.body;
  if (body !== void 0 && body !== null && typeof body !== "string") {
    return Promise.reject(new Error("Agent Host GitHub tests only support string fetch request bodies"));
  }
  if (new URL(url).protocol !== "http:") {
    return Promise.reject(new Error("Agent Host GitHub tests only support HTTP loopback requests"));
  }
  if (init?.signal?.aborted) {
    return Promise.reject(init.signal.reason);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      init?.signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const request = http.request(url, {
      method: init?.method,
      headers: init?.headers === void 0 ? void 0 : Object.fromEntries(new Headers(init.headers))
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("aborted", () => finish(() => reject(new Error("Loopback response was aborted"))));
      response.on("error", (error) => finish(() => reject(error)));
      response.on("end", () => {
        if (!response.complete) {
          finish(() => reject(new Error("Loopback response ended before it was complete")));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : value === void 0 ? [] : [value]) {
            headers.append(name, item);
          }
        }
        const responseBody = Buffer.concat(chunks);
        finish(() => resolve(new Response(responseBody.length === 0 ? null : new Uint8Array(responseBody), {
          status: response.statusCode,
          statusText: response.statusMessage,
          headers
        })));
      });
    });
    const onAbort = () => {
      request.destroy();
      finish(() => reject(init?.signal?.reason));
    };
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    request.on("error", (error) => finish(() => reject(init?.signal?.aborted ? init.signal.reason : error)));
    if (body !== void 0 && body !== null) {
      request.write(body);
    }
    request.end();
  });
};
export {
  nodeFetch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxub2RlRmV0Y2gudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBGZXRjaEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5cbmV4cG9ydCBjb25zdCBub2RlRmV0Y2g6IEZldGNoRnVuY3Rpb24gPSBhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRjb25zdCB1cmwgPSB0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnID8gaW5wdXQgOiBpbnB1dCBpbnN0YW5jZW9mIFVSTCA/IGlucHV0LmhyZWYgOiBpbnB1dC51cmw7XG5cdGNvbnN0IGJvZHkgPSBpbml0Py5ib2R5O1xuXHRpZiAoYm9keSAhPT0gdW5kZWZpbmVkICYmIGJvZHkgIT09IG51bGwgJiYgdHlwZW9mIGJvZHkgIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignQWdlbnQgSG9zdCBHaXRIdWIgdGVzdHMgb25seSBzdXBwb3J0IHN0cmluZyBmZXRjaCByZXF1ZXN0IGJvZGllcycpKTtcblx0fVxuXHRpZiAobmV3IFVSTCh1cmwpLnByb3RvY29sICE9PSAnaHR0cDonKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignQWdlbnQgSG9zdCBHaXRIdWIgdGVzdHMgb25seSBzdXBwb3J0IEhUVFAgbG9vcGJhY2sgcmVxdWVzdHMnKSk7XG5cdH1cblx0aWYgKGluaXQ/LnNpZ25hbD8uYWJvcnRlZCkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChpbml0LnNpZ25hbC5yZWFzb24pO1xuXHR9XG5cdHJldHVybiBuZXcgUHJvbWlzZTxSZXNwb25zZT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZmluaXNoID0gKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdGluaXQ/LnNpZ25hbD8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fTtcblx0XHRjb25zdCByZXF1ZXN0ID0gaHR0cC5yZXF1ZXN0KHVybCwge1xuXHRcdFx0bWV0aG9kOiBpbml0Py5tZXRob2QsXG5cdFx0XHRoZWFkZXJzOiBpbml0Py5oZWFkZXJzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBPYmplY3QuZnJvbUVudHJpZXMobmV3IEhlYWRlcnMoaW5pdC5oZWFkZXJzKSksXG5cdFx0fSwgcmVzcG9uc2UgPT4ge1xuXHRcdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0cmVzcG9uc2Uub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChCdWZmZXIuaXNCdWZmZXIoY2h1bmspID8gY2h1bmsgOiBCdWZmZXIuZnJvbShjaHVuaykpKTtcblx0XHRcdHJlc3BvbnNlLm9uKCdhYm9ydGVkJywgKCkgPT4gZmluaXNoKCgpID0+IHJlamVjdChuZXcgRXJyb3IoJ0xvb3BiYWNrIHJlc3BvbnNlIHdhcyBhYm9ydGVkJykpKSk7XG5cdFx0XHRyZXNwb25zZS5vbignZXJyb3InLCBlcnJvciA9PiBmaW5pc2goKCkgPT4gcmVqZWN0KGVycm9yKSkpO1xuXHRcdFx0cmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNwb25zZS5jb21wbGV0ZSkge1xuXHRcdFx0XHRcdGZpbmlzaCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdMb29wYmFjayByZXNwb25zZSBlbmRlZCBiZWZvcmUgaXQgd2FzIGNvbXBsZXRlJykpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZXNwb25zZS5oZWFkZXJzKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIDogdmFsdWUgPT09IHVuZGVmaW5lZCA/IFtdIDogW3ZhbHVlXSkge1xuXHRcdFx0XHRcdFx0aGVhZGVycy5hcHBlbmQobmFtZSwgaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlQm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKTtcblx0XHRcdFx0ZmluaXNoKCgpID0+IHJlc29sdmUobmV3IFJlc3BvbnNlKHJlc3BvbnNlQm9keS5sZW5ndGggPT09IDAgPyBudWxsIDogbmV3IFVpbnQ4QXJyYXkocmVzcG9uc2VCb2R5KSwge1xuXHRcdFx0XHRcdHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzQ29kZSxcblx0XHRcdFx0XHRzdGF0dXNUZXh0OiByZXNwb25zZS5zdGF0dXNNZXNzYWdlLFxuXHRcdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdH0pKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRjb25zdCBvbkFib3J0ID0gKCkgPT4ge1xuXHRcdFx0cmVxdWVzdC5kZXN0cm95KCk7XG5cdFx0XHRmaW5pc2goKCkgPT4gcmVqZWN0KGluaXQ/LnNpZ25hbD8ucmVhc29uKSk7XG5cdFx0fTtcblx0XHRpbml0Py5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0Jywgb25BYm9ydCwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdHJlcXVlc3Qub24oJ2Vycm9yJywgZXJyb3IgPT4gZmluaXNoKCgpID0+IHJlamVjdChpbml0Py5zaWduYWw/LmFib3J0ZWQgPyBpbml0LnNpZ25hbC5yZWFzb24gOiBlcnJvcikpKTtcblx0XHRpZiAoYm9keSAhPT0gdW5kZWZpbmVkICYmIGJvZHkgIT09IG51bGwpIHtcblx0XHRcdHJlcXVlc3Qud3JpdGUoYm9keSk7XG5cdFx0fVxuXHRcdHJlcXVlc3QuZW5kKCk7XG5cdH0pO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU9PLE1BQU0sWUFBMkIsT0FBTyxPQUFPLFNBQVM7QUFDOUQsUUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNO0FBQ2hDLFFBQU0sTUFBTSxPQUFPLFVBQVUsV0FBVyxRQUFRLGlCQUFpQixNQUFNLE1BQU0sT0FBTyxNQUFNO0FBQzFGLFFBQU0sT0FBTyxNQUFNO0FBQ25CLE1BQUksU0FBUyxVQUFhLFNBQVMsUUFBUSxPQUFPLFNBQVMsVUFBVTtBQUNwRSxXQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sa0VBQWtFLENBQUM7QUFBQSxFQUNwRztBQUNBLE1BQUksSUFBSSxJQUFJLEdBQUcsRUFBRSxhQUFhLFNBQVM7QUFDdEMsV0FBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLDZEQUE2RCxDQUFDO0FBQUEsRUFDL0Y7QUFDQSxNQUFJLE1BQU0sUUFBUSxTQUFTO0FBQzFCLFdBQU8sUUFBUSxPQUFPLEtBQUssT0FBTyxNQUFNO0FBQUEsRUFDekM7QUFDQSxTQUFPLElBQUksUUFBa0IsQ0FBQyxTQUFTLFdBQVc7QUFDakQsUUFBSSxVQUFVO0FBQ2QsVUFBTSxTQUFTLENBQUMsYUFBeUI7QUFDeEMsVUFBSSxTQUFTO0FBQ1o7QUFBQSxNQUNEO0FBQ0EsZ0JBQVU7QUFDVixZQUFNLFFBQVEsb0JBQW9CLFNBQVMsT0FBTztBQUNsRCxlQUFTO0FBQUEsSUFDVjtBQUNBLFVBQU0sVUFBVSxLQUFLLFFBQVEsS0FBSztBQUFBLE1BQ2pDLFFBQVEsTUFBTTtBQUFBLE1BQ2QsU0FBUyxNQUFNLFlBQVksU0FBWSxTQUFZLE9BQU8sWUFBWSxJQUFJLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFBQSxJQUNoRyxHQUFHLGNBQVk7QUFDZCxZQUFNLFNBQW1CLENBQUM7QUFDMUIsZUFBUyxHQUFHLFFBQVEsV0FBUyxPQUFPLEtBQUssT0FBTyxTQUFTLEtBQUssSUFBSSxRQUFRLE9BQU8sS0FBSyxLQUFLLENBQUMsQ0FBQztBQUM3RixlQUFTLEdBQUcsV0FBVyxNQUFNLE9BQU8sTUFBTSxPQUFPLElBQUksTUFBTSwrQkFBK0IsQ0FBQyxDQUFDLENBQUM7QUFDN0YsZUFBUyxHQUFHLFNBQVMsV0FBUyxPQUFPLE1BQU0sT0FBTyxLQUFLLENBQUMsQ0FBQztBQUN6RCxlQUFTLEdBQUcsT0FBTyxNQUFNO0FBQ3hCLFlBQUksQ0FBQyxTQUFTLFVBQVU7QUFDdkIsaUJBQU8sTUFBTSxPQUFPLElBQUksTUFBTSxnREFBZ0QsQ0FBQyxDQUFDO0FBQ2hGO0FBQUEsUUFDRDtBQUNBLGNBQU0sVUFBVSxJQUFJLFFBQVE7QUFDNUIsbUJBQVcsQ0FBQyxNQUFNLEtBQUssS0FBSyxPQUFPLFFBQVEsU0FBUyxPQUFPLEdBQUc7QUFDN0QscUJBQVcsUUFBUSxNQUFNLFFBQVEsS0FBSyxJQUFJLFFBQVEsVUFBVSxTQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRztBQUNyRixvQkFBUSxPQUFPLE1BQU0sSUFBSTtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUNBLGNBQU0sZUFBZSxPQUFPLE9BQU8sTUFBTTtBQUN6QyxlQUFPLE1BQU0sUUFBUSxJQUFJLFNBQVMsYUFBYSxXQUFXLElBQUksT0FBTyxJQUFJLFdBQVcsWUFBWSxHQUFHO0FBQUEsVUFDbEcsUUFBUSxTQUFTO0FBQUEsVUFDakIsWUFBWSxTQUFTO0FBQUEsVUFDckI7QUFBQSxRQUNELENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDSixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxVQUFVLE1BQU07QUFDckIsY0FBUSxRQUFRO0FBQ2hCLGFBQU8sTUFBTSxPQUFPLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxJQUMxQztBQUNBLFVBQU0sUUFBUSxpQkFBaUIsU0FBUyxTQUFTLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDL0QsWUFBUSxHQUFHLFNBQVMsV0FBUyxPQUFPLE1BQU0sT0FBTyxNQUFNLFFBQVEsVUFBVSxLQUFLLE9BQU8sU0FBUyxLQUFLLENBQUMsQ0FBQztBQUNyRyxRQUFJLFNBQVMsVUFBYSxTQUFTLE1BQU07QUFDeEMsY0FBUSxNQUFNLElBQUk7QUFBQSxJQUNuQjtBQUNBLFlBQVEsSUFBSTtBQUFBLEVBQ2IsQ0FBQztBQUNGOyIsCiAgIm5hbWVzIjogW10KfQo=
