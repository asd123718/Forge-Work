import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { lookupKerberosAuthorization, nodeRequest } from "../../node/requestService.js";
import { isWindows } from "../../../../base/common/platform.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
suite("Request Service", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  (isWindows ? test : test.skip)("Kerberos lookup", async () => {
    try {
      const logService = store.add(new NullLogService());
      const response = await lookupKerberosAuthorization("http://localhost:9999", void 0, logService, "requestService.test.ts");
      assert.ok(response);
    } catch (err) {
      assert.ok(
        err?.message?.includes("No authority could be contacted for authentication") || err?.message?.includes("No Kerberos credentials available") || err?.message?.includes("No credentials are available in the security package") || err?.message?.includes("no credential for"),
        `Unexpected error: ${err}`
      );
    }
  });
  test("Request cancellation during retry backoff", async () => {
    const cts = store.add(new CancellationTokenSource());
    let attemptCount = 0;
    const mockRawRequest = (_opts, _callback) => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => {
              handler(err);
              cts.cancel();
            }, 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "GET",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.cancellation"
      }, cts.token);
      assert.fail("Request should have been cancelled");
    } catch (err) {
      assert.ok(err instanceof CancellationError, "Error should be a CancellationError");
    }
    assert.strictEqual(attemptCount, 1, "Request should be cancelled during backoff without further retries");
  });
  test("should retry GET requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "GET",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryGET"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "GET request should have been retried");
  });
  test("should NOT retry POST requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "POST",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPOST"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "POST request should not have been retried");
  });
  test("should retry HEAD requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Host unreachable");
            err.code = "EHOSTUNREACH";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "HEAD",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryHEAD"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "HEAD request should have been retried");
  });
  test("should retry OPTIONS requests on transient errors", async () => {
    let attemptCount = 0;
    const mockRawRequest = (_opts, callback) => {
      attemptCount++;
      const currentAttempt = attemptCount;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error" && currentAttempt < 3) {
            const err = new Error("Network unreachable");
            err.code = "ENETUNREACH";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
          if (currentAttempt >= 3) {
            setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => {
            }, pipe: () => ({ on: () => {
            } }) }), 0);
          }
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "OPTIONS",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.retryOPTIONS"
      }, CancellationToken.None);
    } catch (err) {
    }
    assert.ok(attemptCount > 1, "OPTIONS request should have been retried");
  });
  test("should NOT retry DELETE requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "DELETE",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryDELETE"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "DELETE request should not have been retried");
  });
  test("should NOT retry PUT requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "PUT",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPUT"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "PUT request should not have been retried");
  });
  test("should NOT retry PATCH requests", async () => {
    let attemptCount = 0;
    const mockRawRequest = () => {
      attemptCount++;
      const mockReq = {
        on: (event, handler) => {
          if (event === "error") {
            const err = new Error("Connection refused");
            err.code = "ECONNREFUSED";
            setTimeout(() => handler(err), 0);
          }
        },
        end: () => {
        },
        abort: () => {
        },
        setTimeout: () => {
        }
      };
      return mockReq;
    };
    try {
      await nodeRequest({
        url: "http://example.com",
        type: "PATCH",
        getRawRequest: () => mockRawRequest,
        callSite: "requestService.test.noRetryPATCH"
      }, CancellationToken.None);
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.ok(err instanceof Error);
    }
    assert.strictEqual(attemptCount, 1, "PATCH request should not have been retried");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVxdWVzdFxcdGVzdFxcbm9kZVxccmVxdWVzdFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmF3UmVxdWVzdEZ1bmN0aW9uLCBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24sIG5vZGVSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vbm9kZS9yZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5zdWl0ZSgnUmVxdWVzdCBTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIEtlcmJlcm9zIG1vZHVsZSBmYWlscyB0byBsb2FkIG9uIGxvY2FsIG1hY09TIGFuZCBMaW51eCBDSS5cblx0KGlzV2luZG93cyA/IHRlc3QgOiB0ZXN0LnNraXApKCdLZXJiZXJvcyBsb29rdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24oJ2h0dHA6Ly9sb2NhbGhvc3Q6OTk5OScsIHVuZGVmaW5lZCwgbG9nU2VydmljZSwgJ3JlcXVlc3RTZXJ2aWNlLnRlc3QudHMnKTtcblx0XHRcdGFzc2VydC5vayhyZXNwb25zZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdGVycj8ubWVzc2FnZT8uaW5jbHVkZXMoJ05vIGF1dGhvcml0eSBjb3VsZCBiZSBjb250YWN0ZWQgZm9yIGF1dGhlbnRpY2F0aW9uJylcblx0XHRcdFx0fHwgZXJyPy5tZXNzYWdlPy5pbmNsdWRlcygnTm8gS2VyYmVyb3MgY3JlZGVudGlhbHMgYXZhaWxhYmxlJylcblx0XHRcdFx0fHwgZXJyPy5tZXNzYWdlPy5pbmNsdWRlcygnTm8gY3JlZGVudGlhbHMgYXJlIGF2YWlsYWJsZSBpbiB0aGUgc2VjdXJpdHkgcGFja2FnZScpXG5cdFx0XHRcdHx8IGVycj8ubWVzc2FnZT8uaW5jbHVkZXMoJ25vIGNyZWRlbnRpYWwgZm9yJylcblx0XHRcdFx0LCBgVW5leHBlY3RlZCBlcnJvcjogJHtlcnJ9YCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdSZXF1ZXN0IGNhbmNlbGxhdGlvbiBkdXJpbmcgcmV0cnkgYmFja29mZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKF9vcHRzOiBhbnksIF9jYWxsYmFjazogRnVuY3Rpb24pID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgbW9ja1JlcTogdW5rbm93biA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdDb25uZWN0aW9uIHJlZnVzZWQnKSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdFx0XHRlcnIuY29kZSA9ICdFQ09OTlJFRlVTRUQnO1xuXHRcdFx0XHRcdFx0Ly8gRmFpbCB0aGUgZmlyc3QgYXR0ZW1wdCB3aXRoIGEgdHJhbnNpZW50IGVycm9yLCB0aGVuIGNhbmNlbCB3aGlsZSB0aGVcblx0XHRcdFx0XHRcdC8vIHJldHJ5IGJhY2tvZmYgaXMgcGVuZGluZyBzbyBjYW5jZWxsYXRpb24gaXMgb2JzZXJ2ZWQgZHVyaW5nIHRoZSBiYWNrb2ZmLlxuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZXIoZXJyKTtcblx0XHRcdFx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0fSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHsgfSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCBhcyBJUmF3UmVxdWVzdEZ1bmN0aW9uLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ3JlcXVlc3RTZXJ2aWNlLnRlc3QuY2FuY2VsbGF0aW9uJ1xuXHRcdFx0fSwgY3RzLnRva2VuKTtcblx0XHRcdGFzc2VydC5mYWlsKCdSZXF1ZXN0IHNob3VsZCBoYXZlIGJlZW4gY2FuY2VsbGVkJyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IsICdFcnJvciBzaG91bGQgYmUgYSBDYW5jZWxsYXRpb25FcnJvcicpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRlbXB0Q291bnQsIDEsICdSZXF1ZXN0IHNob3VsZCBiZSBjYW5jZWxsZWQgZHVyaW5nIGJhY2tvZmYgd2l0aG91dCBmdXJ0aGVyIHJldHJpZXMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHJ5IEdFVCByZXF1ZXN0cyBvbiB0cmFuc2llbnQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKF9vcHRzOiBhbnksIGNhbGxiYWNrOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0YXR0ZW1wdENvdW50Kys7XG5cdFx0XHRjb25zdCBjdXJyZW50QXR0ZW1wdCA9IGF0dGVtcHRDb3VudDtcblx0XHRcdGNvbnN0IG1vY2tSZXE6IGFueSA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJyAmJiBjdXJyZW50QXR0ZW1wdCA8IDMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRcdFx0ZXJyLmNvZGUgPSAnRUNPTk5SRUZVU0VEJztcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gaGFuZGxlcihlcnIpLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZDogKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChjdXJyZW50QXR0ZW1wdCA+PSAzKSB7XG5cdFx0XHRcdFx0XHQvLyBTdWNjZWVkIG9uIHRoaXJkIGF0dGVtcHQgYnkgY2FsbGluZyB0aGUgcmVzcG9uc2UgY2FsbGJhY2tcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gY2FsbGJhY2soeyBzdGF0dXNDb2RlOiAyMDAsIGhlYWRlcnM6IHt9LCBvbjogKCkgPT4geyB9LCBwaXBlOiAoKSA9PiAoeyBvbjogKCkgPT4geyB9IH0pIH0pLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFib3J0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRpbWVvdXQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBtb2NrUmVxO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbm9kZVJlcXVlc3Qoe1xuXHRcdFx0XHR1cmw6ICdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QgYXMgSVJhd1JlcXVlc3RGdW5jdGlvbixcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0LnJldHJ5R0VUJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBFeHBlY3RlZCB0byBldmVudHVhbGx5IHN1Y2NlZWQgb3IgZmFpbCBhZnRlciByZXRyaWVzXG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGF0dGVtcHRDb3VudCA+IDEsICdHRVQgcmVxdWVzdCBzaG91bGQgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIE5PVCByZXRyeSBQT1NUIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKCkgPT4ge1xuXHRcdFx0YXR0ZW1wdENvdW50Kys7XG5cdFx0XHRjb25zdCBtb2NrUmVxOiBhbnkgPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRcdFx0ZXJyLmNvZGUgPSAnRUNPTk5SRUZVU0VEJztcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gaGFuZGxlcihlcnIpLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZDogKCkgPT4geyB9LFxuXHRcdFx0XHRhYm9ydDogKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRUaW1lb3V0OiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbW9ja1JlcTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5vZGVSZXF1ZXN0KHtcblx0XHRcdFx0dXJsOiAnaHR0cDovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0dHlwZTogJ1BPU1QnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCxcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0Lm5vUmV0cnlQT1NUJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGhhdmUgdGhyb3duIGFuIGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRlbXB0Q291bnQsIDEsICdQT1NUIHJlcXVlc3Qgc2hvdWxkIG5vdCBoYXZlIGJlZW4gcmV0cmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0cnkgSEVBRCByZXF1ZXN0cyBvbiB0cmFuc2llbnQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKF9vcHRzOiBhbnksIGNhbGxiYWNrOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0YXR0ZW1wdENvdW50Kys7XG5cdFx0XHRjb25zdCBjdXJyZW50QXR0ZW1wdCA9IGF0dGVtcHRDb3VudDtcblx0XHRcdGNvbnN0IG1vY2tSZXE6IGFueSA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJyAmJiBjdXJyZW50QXR0ZW1wdCA8IDMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignSG9zdCB1bnJlYWNoYWJsZScpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VIT1NUVU5SRUFDSCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoY3VycmVudEF0dGVtcHQgPj0gMykge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBjYWxsYmFjayh7IHN0YXR1c0NvZGU6IDIwMCwgaGVhZGVyczoge30sIG9uOiAoKSA9PiB7IH0sIHBpcGU6ICgpID0+ICh7IG9uOiAoKSA9PiB7IH0gfSkgfSksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdIRUFEJyxcblx0XHRcdFx0Z2V0UmF3UmVxdWVzdDogKCkgPT4gbW9ja1Jhd1JlcXVlc3QgYXMgSVJhd1JlcXVlc3RGdW5jdGlvbixcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0LnJldHJ5SEVBRCdcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgdG8gZXZlbnR1YWxseSBzdWNjZWVkIG9yIGZhaWwgYWZ0ZXIgcmV0cmllc1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhhdHRlbXB0Q291bnQgPiAxLCAnSEVBRCByZXF1ZXN0IHNob3VsZCBoYXZlIGJlZW4gcmV0cmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0cnkgT1BUSU9OUyByZXF1ZXN0cyBvbiB0cmFuc2llbnQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKF9vcHRzOiBhbnksIGNhbGxiYWNrOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0YXR0ZW1wdENvdW50Kys7XG5cdFx0XHRjb25zdCBjdXJyZW50QXR0ZW1wdCA9IGF0dGVtcHRDb3VudDtcblx0XHRcdGNvbnN0IG1vY2tSZXE6IGFueSA9IHtcblx0XHRcdFx0b246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiBGdW5jdGlvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJyAmJiBjdXJyZW50QXR0ZW1wdCA8IDMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignTmV0d29yayB1bnJlYWNoYWJsZScpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VORVRVTlJFQUNIJztcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gaGFuZGxlcihlcnIpLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZDogKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChjdXJyZW50QXR0ZW1wdCA+PSAzKSB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGNhbGxiYWNrKHsgc3RhdHVzQ29kZTogMjAwLCBoZWFkZXJzOiB7fSwgb246ICgpID0+IHsgfSwgcGlwZTogKCkgPT4gKHsgb246ICgpID0+IHsgfSB9KSB9KSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhYm9ydDogKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRUaW1lb3V0OiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbW9ja1JlcTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5vZGVSZXF1ZXN0KHtcblx0XHRcdFx0dXJsOiAnaHR0cDovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0dHlwZTogJ09QVElPTlMnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCBhcyBJUmF3UmVxdWVzdEZ1bmN0aW9uLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ3JlcXVlc3RTZXJ2aWNlLnRlc3QucmV0cnlPUFRJT05TJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBFeHBlY3RlZCB0byBldmVudHVhbGx5IHN1Y2NlZWQgb3IgZmFpbCBhZnRlciByZXRyaWVzXG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGF0dGVtcHRDb3VudCA+IDEsICdPUFRJT05TIHJlcXVlc3Qgc2hvdWxkIGhhdmUgYmVlbiByZXRyaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBOT1QgcmV0cnkgREVMRVRFIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG1vY2tSYXdSZXF1ZXN0ID0gKCkgPT4ge1xuXHRcdFx0YXR0ZW1wdENvdW50Kys7XG5cdFx0XHRjb25zdCBtb2NrUmVxOiBhbnkgPSB7XG5cdFx0XHRcdG9uOiAoZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdlcnJvcicpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRcdFx0ZXJyLmNvZGUgPSAnRUNPTk5SRUZVU0VEJztcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gaGFuZGxlcihlcnIpLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZDogKCkgPT4geyB9LFxuXHRcdFx0XHRhYm9ydDogKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRUaW1lb3V0OiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbW9ja1JlcTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5vZGVSZXF1ZXN0KHtcblx0XHRcdFx0dXJsOiAnaHR0cDovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0dHlwZTogJ0RFTEVURScsXG5cdFx0XHRcdGdldFJhd1JlcXVlc3Q6ICgpID0+IG1vY2tSYXdSZXF1ZXN0LFxuXHRcdFx0XHRjYWxsU2l0ZTogJ3JlcXVlc3RTZXJ2aWNlLnRlc3Qubm9SZXRyeURFTEVURSdcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBoYXZlIHRocm93biBhbiBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdENvdW50LCAxLCAnREVMRVRFIHJlcXVlc3Qgc2hvdWxkIG5vdCBoYXZlIGJlZW4gcmV0cmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgTk9UIHJldHJ5IFBVVCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgbW9ja1JlcTogYW55ID0ge1xuXHRcdFx0XHRvbjogKGV2ZW50OiBzdHJpbmcsIGhhbmRsZXI6IEZ1bmN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHsgfSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdQVVQnLFxuXHRcdFx0XHRnZXRSYXdSZXF1ZXN0OiAoKSA9PiBtb2NrUmF3UmVxdWVzdCxcblx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0U2VydmljZS50ZXN0Lm5vUmV0cnlQVVQnXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgaGF2ZSB0aHJvd24gYW4gZXJyb3InKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5vayhlcnIgaW5zdGFuY2VvZiBFcnJvcik7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGVtcHRDb3VudCwgMSwgJ1BVVCByZXF1ZXN0IHNob3VsZCBub3QgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIE5PVCByZXRyeSBQQVRDSCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXR0ZW1wdENvdW50ID0gMDtcblx0XHRjb25zdCBtb2NrUmF3UmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdGF0dGVtcHRDb3VudCsrO1xuXHRcdFx0Y29uc3QgbW9ja1JlcTogYW55ID0ge1xuXHRcdFx0XHRvbjogKGV2ZW50OiBzdHJpbmcsIGhhbmRsZXI6IEZ1bmN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0XHRcdGVyci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZXIoZXJyKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmQ6ICgpID0+IHsgfSxcblx0XHRcdFx0YWJvcnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0VGltZW91dDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG1vY2tSZXE7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBub2RlUmVxdWVzdCh7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHR5cGU6ICdQQVRDSCcsXG5cdFx0XHRcdGdldFJhd1JlcXVlc3Q6ICgpID0+IG1vY2tSYXdSZXF1ZXN0LFxuXHRcdFx0XHRjYWxsU2l0ZTogJ3JlcXVlc3RTZXJ2aWNlLnRlc3Qubm9SZXRyeVBBVENIJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGhhdmUgdGhyb3duIGFuIGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRlbXB0Q291bnQsIDEsICdQQVRDSCByZXF1ZXN0IHNob3VsZCBub3QgaGF2ZSBiZWVuIHJldHJpZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUE4Qiw2QkFBNkIsbUJBQW1CO0FBQzlFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLG1C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
