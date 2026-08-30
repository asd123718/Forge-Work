import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { decideHostKeyTrust } from "../../common/sshHostKeyPolicy.js";
const FINGERPRINT = "SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_FINGERPRINT = "SHA256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
function makeRequest(overrides = {}) {
  return {
    requestId: "hostkey-1",
    connectionKey: "ssh:testhost",
    displayHost: "testhost",
    host: "test.example.com",
    port: 22,
    keyType: "ssh-ed25519",
    fingerprint: FINGERPRINT,
    knownHostsMatch: overrides.knownHostsMatch ?? "unknown",
    ...overrides.strictHostKeyChecking ? { strictHostKeyChecking: overrides.strictHostKeyChecking } : void 0,
    userInitiated: overrides.userInitiated ?? true
  };
}
function trusted(fingerprint, keyType = "ssh-ed25519") {
  return [{ keyType, fingerprint, addedAt: 1 }];
}
function summarize(decision) {
  return decision.kind === "trust" ? `trust(${decision.reason}${decision.persist ? ",persist" : ""})` : `${decision.kind}(${decision.reason})`;
}
suite("sshHostKeyPolicy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("decides from the trust store first", () => {
    assert.deepStrictEqual(
      {
        storedMatch: summarize(decideHostKeyTrust(makeRequest(), trusted(FINGERPRINT))),
        storedDiffers: summarize(decideHostKeyTrust(makeRequest(), trusted(OTHER_FINGERPRINT))),
        // A stored entry for a *different* algorithm says nothing about
        // this key, so it must not suppress the prompt.
        storedOtherKeyType: summarize(decideHostKeyTrust(makeRequest(), trusted(OTHER_FINGERPRINT, "ssh-rsa")))
      },
      {
        storedMatch: "trust(stored)",
        storedDiffers: "deny(mismatch)",
        storedOtherKeyType: "prompt(unknown)"
      }
    );
  });
  test("falls back to known_hosts when nothing is stored", () => {
    const decide = (knownHostsMatch) => summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch }), []));
    assert.deepStrictEqual(
      {
        match: decide("match"),
        mismatch: decide("mismatch"),
        revoked: decide("revoked"),
        caOnly: decide("ca-only"),
        unknown: decide("unknown")
      },
      {
        // A known_hosts hit is copied into our store so later decisions
        // no longer depend on re-reading the user's files.
        match: "trust(known-hosts,persist)",
        mismatch: "deny(mismatch)",
        revoked: "deny(revoked)",
        caOnly: "prompt(ca-only)",
        unknown: "prompt(unknown)"
      }
    );
  });
  test("revocation overrides a stored trust entry", () => {
    assert.strictEqual(
      summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch: "revoked" }), trusted(FINGERPRINT))),
      "deny(revoked)"
    );
  });
  test("revocation overrides even a StrictHostKeyChecking opt-out", () => {
    assert.deepStrictEqual(
      {
        no: summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch: "revoked", strictHostKeyChecking: "no" }), [])),
        off: summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch: "revoked", strictHostKeyChecking: "off" }), []))
      },
      { no: "deny(revoked)", off: "deny(revoked)" }
    );
  });
  test("a stored key wins over a disagreeing known_hosts file", () => {
    assert.strictEqual(
      summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch: "match" }), trusted(OTHER_FINGERPRINT))),
      "deny(mismatch)"
    );
  });
  test("honors StrictHostKeyChecking", () => {
    const decide = (strictHostKeyChecking, knownHostsMatch = "unknown") => summarize(decideHostKeyTrust(makeRequest({ strictHostKeyChecking, knownHostsMatch }), []));
    assert.deepStrictEqual(
      {
        ask: decide("ask"),
        acceptNewUnknown: decide("accept-new"),
        yesUnknown: decide("yes"),
        no: decide("no"),
        off: decide("off"),
        // The opt-out covers *unknown* keys only. Verified against
        // OpenSSH 9.9: with StrictHostKeyChecking=no and a changed key
        // it warns and disables password auth, keyboard-interactive
        // auth and agent forwarding. We refuse outright instead.
        noWithMismatch: decide("no", "mismatch"),
        offWithMismatch: decide("off", "mismatch"),
        // A stored key that disagrees is refused under the opt-out too.
        noWithStoredMismatch: summarize(decideHostKeyTrust(
          makeRequest({ strictHostKeyChecking: "no", knownHostsMatch: "unknown" }),
          trusted(OTHER_FINGERPRINT)
        )),
        // accept-new only relaxes *unknown* hosts; a changed key still
        // hard-fails, matching OpenSSH.
        acceptNewMismatch: decide("accept-new", "mismatch"),
        acceptNewRevoked: decide("accept-new", "revoked")
      },
      {
        ask: "prompt(unknown)",
        acceptNewUnknown: "trust(strict-accept-new,persist)",
        yesUnknown: "deny(strict-yes)",
        no: "trust(strict-disabled)",
        off: "trust(strict-disabled)",
        noWithMismatch: "deny(mismatch)",
        offWithMismatch: "deny(mismatch)",
        noWithStoredMismatch: "deny(mismatch)",
        acceptNewMismatch: "deny(mismatch)",
        acceptNewRevoked: "deny(revoked)"
      }
    );
  });
  test("never prompts during a background reconnect", () => {
    const decide = (knownHostsMatch, keys = []) => summarize(decideHostKeyTrust(makeRequest({ knownHostsMatch, userInitiated: false }), keys));
    assert.deepStrictEqual(
      {
        // An unknown key on a silent reconnect is declined rather than
        // raising a modal the user never asked for.
        unknown: decide("unknown"),
        caOnly: decide("ca-only"),
        // Already-trusted hosts still reconnect without interaction.
        stored: decide("unknown", trusted(FINGERPRINT)),
        knownHosts: decide("match")
      },
      {
        unknown: "deny(not-user-initiated)",
        caOnly: "deny(not-user-initiated)",
        stored: "trust(stored)",
        knownHosts: "trust(known-hosts,persist)"
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHNzaEhvc3RLZXlQb2xpY3kudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZGVjaWRlSG9zdEtleVRydXN0LCB0eXBlIFNTSEhvc3RLZXlEZWNpc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zc2hIb3N0S2V5UG9saWN5LmpzJztcbmltcG9ydCB0eXBlIHsgSVNTSFRydXN0ZWRIb3N0S2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3NzaEhvc3RLZXlUcnVzdC5qcyc7XG5pbXBvcnQgdHlwZSB7IElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdCwgU1NIS25vd25Ib3N0c01hdGNoLCBTU0hTdHJpY3RIb3N0S2V5Q2hlY2tpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vc3NoUmVtb3RlQWdlbnRIb3N0LmpzJztcblxuY29uc3QgRklOR0VSUFJJTlQgPSAnU0hBMjU2OmFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEnO1xuY29uc3QgT1RIRVJfRklOR0VSUFJJTlQgPSAnU0hBMjU2OmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmInO1xuXG5mdW5jdGlvbiBtYWtlUmVxdWVzdChvdmVycmlkZXM6IHtcblx0a25vd25Ib3N0c01hdGNoPzogU1NIS25vd25Ib3N0c01hdGNoO1xuXHRzdHJpY3RIb3N0S2V5Q2hlY2tpbmc/OiBTU0hTdHJpY3RIb3N0S2V5Q2hlY2tpbmc7XG5cdHVzZXJJbml0aWF0ZWQ/OiBib29sZWFuO1xufSA9IHt9KTogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRyZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLFxuXHRcdGNvbm5lY3Rpb25LZXk6ICdzc2g6dGVzdGhvc3QnLFxuXHRcdGRpc3BsYXlIb3N0OiAndGVzdGhvc3QnLFxuXHRcdGhvc3Q6ICd0ZXN0LmV4YW1wbGUuY29tJyxcblx0XHRwb3J0OiAyMixcblx0XHRrZXlUeXBlOiAnc3NoLWVkMjU1MTknLFxuXHRcdGZpbmdlcnByaW50OiBGSU5HRVJQUklOVCxcblx0XHRrbm93bkhvc3RzTWF0Y2g6IG92ZXJyaWRlcy5rbm93bkhvc3RzTWF0Y2ggPz8gJ3Vua25vd24nLFxuXHRcdC4uLihvdmVycmlkZXMuc3RyaWN0SG9zdEtleUNoZWNraW5nID8geyBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IG92ZXJyaWRlcy5zdHJpY3RIb3N0S2V5Q2hlY2tpbmcgfSA6IHVuZGVmaW5lZCksXG5cdFx0dXNlckluaXRpYXRlZDogb3ZlcnJpZGVzLnVzZXJJbml0aWF0ZWQgPz8gdHJ1ZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdHJ1c3RlZChmaW5nZXJwcmludDogc3RyaW5nLCBrZXlUeXBlID0gJ3NzaC1lZDI1NTE5Jyk6IElTU0hUcnVzdGVkSG9zdEtleVtdIHtcblx0cmV0dXJuIFt7IGtleVR5cGUsIGZpbmdlcnByaW50LCBhZGRlZEF0OiAxIH1dO1xufVxuXG4vKiogUmVkdWNlIGEgZGVjaXNpb24gdG8gYSBjb21wYWN0IHN0cmluZyBzbyB3aG9sZSB0YWJsZXMgY2FuIGJlIGFzc2VydGVkIGF0IG9uY2UuICovXG5mdW5jdGlvbiBzdW1tYXJpemUoZGVjaXNpb246IFNTSEhvc3RLZXlEZWNpc2lvbik6IHN0cmluZyB7XG5cdHJldHVybiBkZWNpc2lvbi5raW5kID09PSAndHJ1c3QnXG5cdFx0PyBgdHJ1c3QoJHtkZWNpc2lvbi5yZWFzb259JHtkZWNpc2lvbi5wZXJzaXN0ID8gJyxwZXJzaXN0JyA6ICcnfSlgXG5cdFx0OiBgJHtkZWNpc2lvbi5raW5kfSgke2RlY2lzaW9uLnJlYXNvbn0pYDtcbn1cblxuc3VpdGUoJ3NzaEhvc3RLZXlQb2xpY3knLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZGVjaWRlcyBmcm9tIHRoZSB0cnVzdCBzdG9yZSBmaXJzdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzdG9yZWRNYXRjaDogc3VtbWFyaXplKGRlY2lkZUhvc3RLZXlUcnVzdChtYWtlUmVxdWVzdCgpLCB0cnVzdGVkKEZJTkdFUlBSSU5UKSkpLFxuXHRcdFx0XHRzdG9yZWREaWZmZXJzOiBzdW1tYXJpemUoZGVjaWRlSG9zdEtleVRydXN0KG1ha2VSZXF1ZXN0KCksIHRydXN0ZWQoT1RIRVJfRklOR0VSUFJJTlQpKSksXG5cdFx0XHRcdC8vIEEgc3RvcmVkIGVudHJ5IGZvciBhICpkaWZmZXJlbnQqIGFsZ29yaXRobSBzYXlzIG5vdGhpbmcgYWJvdXRcblx0XHRcdFx0Ly8gdGhpcyBrZXksIHNvIGl0IG11c3Qgbm90IHN1cHByZXNzIHRoZSBwcm9tcHQuXG5cdFx0XHRcdHN0b3JlZE90aGVyS2V5VHlwZTogc3VtbWFyaXplKGRlY2lkZUhvc3RLZXlUcnVzdChtYWtlUmVxdWVzdCgpLCB0cnVzdGVkKE9USEVSX0ZJTkdFUlBSSU5ULCAnc3NoLXJzYScpKSksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzdG9yZWRNYXRjaDogJ3RydXN0KHN0b3JlZCknLFxuXHRcdFx0XHRzdG9yZWREaWZmZXJzOiAnZGVueShtaXNtYXRjaCknLFxuXHRcdFx0XHRzdG9yZWRPdGhlcktleVR5cGU6ICdwcm9tcHQodW5rbm93biknLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8ga25vd25faG9zdHMgd2hlbiBub3RoaW5nIGlzIHN0b3JlZCcsICgpID0+IHtcblx0XHRjb25zdCBkZWNpZGUgPSAoa25vd25Ib3N0c01hdGNoOiBTU0hLbm93bkhvc3RzTWF0Y2gpID0+XG5cdFx0XHRzdW1tYXJpemUoZGVjaWRlSG9zdEtleVRydXN0KG1ha2VSZXF1ZXN0KHsga25vd25Ib3N0c01hdGNoIH0pLCBbXSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdG1hdGNoOiBkZWNpZGUoJ21hdGNoJyksXG5cdFx0XHRcdG1pc21hdGNoOiBkZWNpZGUoJ21pc21hdGNoJyksXG5cdFx0XHRcdHJldm9rZWQ6IGRlY2lkZSgncmV2b2tlZCcpLFxuXHRcdFx0XHRjYU9ubHk6IGRlY2lkZSgnY2Etb25seScpLFxuXHRcdFx0XHR1bmtub3duOiBkZWNpZGUoJ3Vua25vd24nKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdC8vIEEga25vd25faG9zdHMgaGl0IGlzIGNvcGllZCBpbnRvIG91ciBzdG9yZSBzbyBsYXRlciBkZWNpc2lvbnNcblx0XHRcdFx0Ly8gbm8gbG9uZ2VyIGRlcGVuZCBvbiByZS1yZWFkaW5nIHRoZSB1c2VyJ3MgZmlsZXMuXG5cdFx0XHRcdG1hdGNoOiAndHJ1c3Qoa25vd24taG9zdHMscGVyc2lzdCknLFxuXHRcdFx0XHRtaXNtYXRjaDogJ2RlbnkobWlzbWF0Y2gpJyxcblx0XHRcdFx0cmV2b2tlZDogJ2RlbnkocmV2b2tlZCknLFxuXHRcdFx0XHRjYU9ubHk6ICdwcm9tcHQoY2Etb25seSknLFxuXHRcdFx0XHR1bmtub3duOiAncHJvbXB0KHVua25vd24pJyxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZvY2F0aW9uIG92ZXJyaWRlcyBhIHN0b3JlZCB0cnVzdCBlbnRyeScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdW1tYXJpemUoZGVjaWRlSG9zdEtleVRydXN0KG1ha2VSZXF1ZXN0KHsga25vd25Ib3N0c01hdGNoOiAncmV2b2tlZCcgfSksIHRydXN0ZWQoRklOR0VSUFJJTlQpKSksXG5cdFx0XHQnZGVueShyZXZva2VkKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZvY2F0aW9uIG92ZXJyaWRlcyBldmVuIGEgU3RyaWN0SG9zdEtleUNoZWNraW5nIG9wdC1vdXQnLCAoKSA9PiB7XG5cdFx0Ly8gVmVyaWZpZWQgYWdhaW5zdCBPcGVuU1NIIDkuOTogd2l0aCBTdHJpY3RIb3N0S2V5Q2hlY2tpbmc9bm8gaXQgc3RpbGxcblx0XHQvLyByZXBvcnRzIFwiUkVWT0tFRCBIT1NUIEtFWSBERVRFQ1RFRFwiIGFuZCBkaXNhYmxlcyBwYXNzd29yZCBhdXRoLFxuXHRcdC8vIGtleWJvYXJkLWludGVyYWN0aXZlIGF1dGggYW5kIGFnZW50IGZvcndhcmRpbmcuIERpc2FibGluZyBob3N0IGtleVxuXHRcdC8vIGNoZWNraW5nIG1lYW5zIFwiSSBhY2NlcHQgdW5rbm93biBrZXlzXCIsIG5ldmVyIFwiSSBhY2NlcHQga2V5cyBJIGhhdmVcblx0XHQvLyBleHBsaWNpdGx5IHJldm9rZWRcIi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRubzogc3VtbWFyaXplKGRlY2lkZUhvc3RLZXlUcnVzdChtYWtlUmVxdWVzdCh7IGtub3duSG9zdHNNYXRjaDogJ3Jldm9rZWQnLCBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6ICdubycgfSksIFtdKSksXG5cdFx0XHRcdG9mZjogc3VtbWFyaXplKGRlY2lkZUhvc3RLZXlUcnVzdChtYWtlUmVxdWVzdCh7IGtub3duSG9zdHNNYXRjaDogJ3Jldm9rZWQnLCBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6ICdvZmYnIH0pLCBbXSkpLFxuXHRcdFx0fSxcblx0XHRcdHsgbm86ICdkZW55KHJldm9rZWQpJywgb2ZmOiAnZGVueShyZXZva2VkKScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3RvcmVkIGtleSB3aW5zIG92ZXIgYSBkaXNhZ3JlZWluZyBrbm93bl9ob3N0cyBmaWxlJywgKCkgPT4ge1xuXHRcdC8vIE91ciBzdG9yZSBpcyBhdXRob3JpdGF0aXZlIGZvciBob3N0cyBhbHJlYWR5IGNvbm5lY3RlZCB0bywgc28gYVxuXHRcdC8vIGtub3duX2hvc3RzIGVudHJ5IHRoYXQgYWdyZWVzIHdpdGggdGhlIHNlcnZlciBtdXN0IG5vdCBzaWxlbnRseVxuXHRcdC8vIG92ZXJyaWRlIGEga2V5IHRoZSB1c2VyIHByZXZpb3VzbHkgYWNjZXB0ZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3VtbWFyaXplKGRlY2lkZUhvc3RLZXlUcnVzdChtYWtlUmVxdWVzdCh7IGtub3duSG9zdHNNYXRjaDogJ21hdGNoJyB9KSwgdHJ1c3RlZChPVEhFUl9GSU5HRVJQUklOVCkpKSxcblx0XHRcdCdkZW55KG1pc21hdGNoKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdob25vcnMgU3RyaWN0SG9zdEtleUNoZWNraW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlY2lkZSA9IChzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IFNTSFN0cmljdEhvc3RLZXlDaGVja2luZywga25vd25Ib3N0c01hdGNoOiBTU0hLbm93bkhvc3RzTWF0Y2ggPSAndW5rbm93bicpID0+XG5cdFx0XHRzdW1tYXJpemUoZGVjaWRlSG9zdEtleVRydXN0KG1ha2VSZXF1ZXN0KHsgc3RyaWN0SG9zdEtleUNoZWNraW5nLCBrbm93bkhvc3RzTWF0Y2ggfSksIFtdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0YXNrOiBkZWNpZGUoJ2FzaycpLFxuXHRcdFx0XHRhY2NlcHROZXdVbmtub3duOiBkZWNpZGUoJ2FjY2VwdC1uZXcnKSxcblx0XHRcdFx0eWVzVW5rbm93bjogZGVjaWRlKCd5ZXMnKSxcblx0XHRcdFx0bm86IGRlY2lkZSgnbm8nKSxcblx0XHRcdFx0b2ZmOiBkZWNpZGUoJ29mZicpLFxuXHRcdFx0XHQvLyBUaGUgb3B0LW91dCBjb3ZlcnMgKnVua25vd24qIGtleXMgb25seS4gVmVyaWZpZWQgYWdhaW5zdFxuXHRcdFx0XHQvLyBPcGVuU1NIIDkuOTogd2l0aCBTdHJpY3RIb3N0S2V5Q2hlY2tpbmc9bm8gYW5kIGEgY2hhbmdlZCBrZXlcblx0XHRcdFx0Ly8gaXQgd2FybnMgYW5kIGRpc2FibGVzIHBhc3N3b3JkIGF1dGgsIGtleWJvYXJkLWludGVyYWN0aXZlXG5cdFx0XHRcdC8vIGF1dGggYW5kIGFnZW50IGZvcndhcmRpbmcuIFdlIHJlZnVzZSBvdXRyaWdodCBpbnN0ZWFkLlxuXHRcdFx0XHRub1dpdGhNaXNtYXRjaDogZGVjaWRlKCdubycsICdtaXNtYXRjaCcpLFxuXHRcdFx0XHRvZmZXaXRoTWlzbWF0Y2g6IGRlY2lkZSgnb2ZmJywgJ21pc21hdGNoJyksXG5cdFx0XHRcdC8vIEEgc3RvcmVkIGtleSB0aGF0IGRpc2FncmVlcyBpcyByZWZ1c2VkIHVuZGVyIHRoZSBvcHQtb3V0IHRvby5cblx0XHRcdFx0bm9XaXRoU3RvcmVkTWlzbWF0Y2g6IHN1bW1hcml6ZShkZWNpZGVIb3N0S2V5VHJ1c3QoXG5cdFx0XHRcdFx0bWFrZVJlcXVlc3QoeyBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6ICdubycsIGtub3duSG9zdHNNYXRjaDogJ3Vua25vd24nIH0pLFxuXHRcdFx0XHRcdHRydXN0ZWQoT1RIRVJfRklOR0VSUFJJTlQpKSksXG5cdFx0XHRcdC8vIGFjY2VwdC1uZXcgb25seSByZWxheGVzICp1bmtub3duKiBob3N0czsgYSBjaGFuZ2VkIGtleSBzdGlsbFxuXHRcdFx0XHQvLyBoYXJkLWZhaWxzLCBtYXRjaGluZyBPcGVuU1NILlxuXHRcdFx0XHRhY2NlcHROZXdNaXNtYXRjaDogZGVjaWRlKCdhY2NlcHQtbmV3JywgJ21pc21hdGNoJyksXG5cdFx0XHRcdGFjY2VwdE5ld1Jldm9rZWQ6IGRlY2lkZSgnYWNjZXB0LW5ldycsICdyZXZva2VkJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhc2s6ICdwcm9tcHQodW5rbm93biknLFxuXHRcdFx0XHRhY2NlcHROZXdVbmtub3duOiAndHJ1c3Qoc3RyaWN0LWFjY2VwdC1uZXcscGVyc2lzdCknLFxuXHRcdFx0XHR5ZXNVbmtub3duOiAnZGVueShzdHJpY3QteWVzKScsXG5cdFx0XHRcdG5vOiAndHJ1c3Qoc3RyaWN0LWRpc2FibGVkKScsXG5cdFx0XHRcdG9mZjogJ3RydXN0KHN0cmljdC1kaXNhYmxlZCknLFxuXHRcdFx0XHRub1dpdGhNaXNtYXRjaDogJ2RlbnkobWlzbWF0Y2gpJyxcblx0XHRcdFx0b2ZmV2l0aE1pc21hdGNoOiAnZGVueShtaXNtYXRjaCknLFxuXHRcdFx0XHRub1dpdGhTdG9yZWRNaXNtYXRjaDogJ2RlbnkobWlzbWF0Y2gpJyxcblx0XHRcdFx0YWNjZXB0TmV3TWlzbWF0Y2g6ICdkZW55KG1pc21hdGNoKScsXG5cdFx0XHRcdGFjY2VwdE5ld1Jldm9rZWQ6ICdkZW55KHJldm9rZWQpJyxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXZlciBwcm9tcHRzIGR1cmluZyBhIGJhY2tncm91bmQgcmVjb25uZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlY2lkZSA9IChrbm93bkhvc3RzTWF0Y2g6IFNTSEtub3duSG9zdHNNYXRjaCwga2V5czogSVNTSFRydXN0ZWRIb3N0S2V5W10gPSBbXSkgPT5cblx0XHRcdHN1bW1hcml6ZShkZWNpZGVIb3N0S2V5VHJ1c3QobWFrZVJlcXVlc3QoeyBrbm93bkhvc3RzTWF0Y2gsIHVzZXJJbml0aWF0ZWQ6IGZhbHNlIH0pLCBrZXlzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Ly8gQW4gdW5rbm93biBrZXkgb24gYSBzaWxlbnQgcmVjb25uZWN0IGlzIGRlY2xpbmVkIHJhdGhlciB0aGFuXG5cdFx0XHRcdC8vIHJhaXNpbmcgYSBtb2RhbCB0aGUgdXNlciBuZXZlciBhc2tlZCBmb3IuXG5cdFx0XHRcdHVua25vd246IGRlY2lkZSgndW5rbm93bicpLFxuXHRcdFx0XHRjYU9ubHk6IGRlY2lkZSgnY2Etb25seScpLFxuXHRcdFx0XHQvLyBBbHJlYWR5LXRydXN0ZWQgaG9zdHMgc3RpbGwgcmVjb25uZWN0IHdpdGhvdXQgaW50ZXJhY3Rpb24uXG5cdFx0XHRcdHN0b3JlZDogZGVjaWRlKCd1bmtub3duJywgdHJ1c3RlZChGSU5HRVJQUklOVCkpLFxuXHRcdFx0XHRrbm93bkhvc3RzOiBkZWNpZGUoJ21hdGNoJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR1bmtub3duOiAnZGVueShub3QtdXNlci1pbml0aWF0ZWQpJyxcblx0XHRcdFx0Y2FPbmx5OiAnZGVueShub3QtdXNlci1pbml0aWF0ZWQpJyxcblx0XHRcdFx0c3RvcmVkOiAndHJ1c3Qoc3RvcmVkKScsXG5cdFx0XHRcdGtub3duSG9zdHM6ICd0cnVzdChrbm93bi1ob3N0cyxwZXJzaXN0KScsXG5cdFx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUFtRDtBQUk1RCxNQUFNLGNBQWM7QUFDcEIsTUFBTSxvQkFBb0I7QUFFMUIsU0FBUyxZQUFZLFlBSWpCLENBQUMsR0FBbUM7QUFDdkMsU0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsZUFBZTtBQUFBLElBQ2YsYUFBYTtBQUFBLElBQ2IsTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsaUJBQWlCLFVBQVUsbUJBQW1CO0FBQUEsSUFDOUMsR0FBSSxVQUFVLHdCQUF3QixFQUFFLHVCQUF1QixVQUFVLHNCQUFzQixJQUFJO0FBQUEsSUFDbkcsZUFBZSxVQUFVLGlCQUFpQjtBQUFBLEVBQzNDO0FBQ0Q7QUFFQSxTQUFTLFFBQVEsYUFBcUIsVUFBVSxlQUFxQztBQUNwRixTQUFPLENBQUMsRUFBRSxTQUFTLGFBQWEsU0FBUyxFQUFFLENBQUM7QUFDN0M7QUFHQSxTQUFTLFVBQVUsVUFBc0M7QUFDeEQsU0FBTyxTQUFTLFNBQVMsVUFDdEIsU0FBUyxTQUFTLE1BQU0sR0FBRyxTQUFTLFVBQVUsYUFBYSxFQUFFLE1BQzdELEdBQUcsU0FBUyxJQUFJLElBQUksU0FBUyxNQUFNO0FBQ3ZDO0FBRUEsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQiwwQ0FBd0M7QUFFeEMsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsYUFBYSxVQUFVLG1CQUFtQixZQUFZLEdBQUcsUUFBUSxXQUFXLENBQUMsQ0FBQztBQUFBLFFBQzlFLGVBQWUsVUFBVSxtQkFBbUIsWUFBWSxHQUFHLFFBQVEsaUJBQWlCLENBQUMsQ0FBQztBQUFBO0FBQUE7QUFBQSxRQUd0RixvQkFBb0IsVUFBVSxtQkFBbUIsWUFBWSxHQUFHLFFBQVEsbUJBQW1CLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDdkc7QUFBQSxNQUNBO0FBQUEsUUFDQyxhQUFhO0FBQUEsUUFDYixlQUFlO0FBQUEsUUFDZixvQkFBb0I7QUFBQSxNQUNyQjtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sU0FBUyxDQUFDLG9CQUNmLFVBQVUsbUJBQW1CLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ25FLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPLE9BQU8sT0FBTztBQUFBLFFBQ3JCLFVBQVUsT0FBTyxVQUFVO0FBQUEsUUFDM0IsU0FBUyxPQUFPLFNBQVM7QUFBQSxRQUN6QixRQUFRLE9BQU8sU0FBUztBQUFBLFFBQ3hCLFNBQVMsT0FBTyxTQUFTO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUE7QUFBQTtBQUFBLFFBR0MsT0FBTztBQUFBLFFBQ1AsVUFBVTtBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxXQUFPO0FBQUEsTUFDTixVQUFVLG1CQUFtQixZQUFZLEVBQUUsaUJBQWlCLFVBQVUsQ0FBQyxHQUFHLFFBQVEsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUMvRjtBQUFBLElBQWU7QUFBQSxFQUNqQixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQU12RSxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsSUFBSSxVQUFVLG1CQUFtQixZQUFZLEVBQUUsaUJBQWlCLFdBQVcsdUJBQXVCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDOUcsS0FBSyxVQUFVLG1CQUFtQixZQUFZLEVBQUUsaUJBQWlCLFdBQVcsdUJBQXVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDakg7QUFBQSxNQUNBLEVBQUUsSUFBSSxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFBQSxJQUFDO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFJbkUsV0FBTztBQUFBLE1BQ04sVUFBVSxtQkFBbUIsWUFBWSxFQUFFLGlCQUFpQixRQUFRLENBQUMsR0FBRyxRQUFRLGlCQUFpQixDQUFDLENBQUM7QUFBQSxNQUNuRztBQUFBLElBQWdCO0FBQUEsRUFDbEIsQ0FBQztBQUVELE9BQUssZ0NBQWdDLE1BQU07QUFDMUMsVUFBTSxTQUFTLENBQUMsdUJBQWlELGtCQUFzQyxjQUN0RyxVQUFVLG1CQUFtQixZQUFZLEVBQUUsdUJBQXVCLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDMUYsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLEtBQUssT0FBTyxLQUFLO0FBQUEsUUFDakIsa0JBQWtCLE9BQU8sWUFBWTtBQUFBLFFBQ3JDLFlBQVksT0FBTyxLQUFLO0FBQUEsUUFDeEIsSUFBSSxPQUFPLElBQUk7QUFBQSxRQUNmLEtBQUssT0FBTyxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUtqQixnQkFBZ0IsT0FBTyxNQUFNLFVBQVU7QUFBQSxRQUN2QyxpQkFBaUIsT0FBTyxPQUFPLFVBQVU7QUFBQTtBQUFBLFFBRXpDLHNCQUFzQixVQUFVO0FBQUEsVUFDL0IsWUFBWSxFQUFFLHVCQUF1QixNQUFNLGlCQUFpQixVQUFVLENBQUM7QUFBQSxVQUN2RSxRQUFRLGlCQUFpQjtBQUFBLFFBQUMsQ0FBQztBQUFBO0FBQUE7QUFBQSxRQUc1QixtQkFBbUIsT0FBTyxjQUFjLFVBQVU7QUFBQSxRQUNsRCxrQkFBa0IsT0FBTyxjQUFjLFNBQVM7QUFBQSxNQUNqRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLEtBQUs7QUFBQSxRQUNMLGtCQUFrQjtBQUFBLFFBQ2xCLFlBQVk7QUFBQSxRQUNaLElBQUk7QUFBQSxRQUNKLEtBQUs7QUFBQSxRQUNMLGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQjtBQUFBLFFBQ2pCLHNCQUFzQjtBQUFBLFFBQ3RCLG1CQUFtQjtBQUFBLFFBQ25CLGtCQUFrQjtBQUFBLE1BQ25CO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssK0NBQStDLE1BQU07QUFDekQsVUFBTSxTQUFTLENBQUMsaUJBQXFDLE9BQTZCLENBQUMsTUFDbEYsVUFBVSxtQkFBbUIsWUFBWSxFQUFFLGlCQUFpQixlQUFlLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQztBQUMzRixXQUFPO0FBQUEsTUFDTjtBQUFBO0FBQUE7QUFBQSxRQUdDLFNBQVMsT0FBTyxTQUFTO0FBQUEsUUFDekIsUUFBUSxPQUFPLFNBQVM7QUFBQTtBQUFBLFFBRXhCLFFBQVEsT0FBTyxXQUFXLFFBQVEsV0FBVyxDQUFDO0FBQUEsUUFDOUMsWUFBWSxPQUFPLE9BQU87QUFBQSxNQUMzQjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLFFBQVE7QUFBQSxRQUNSLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
