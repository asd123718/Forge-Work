import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { InMemoryStorageService, StorageScope } from "../../../storage/common/storage.js";
import {
  parseTrustedHostKeys,
  SSHHostKeyTrustService,
  SSH_HOST_KEY_TRUST_STORAGE_KEY
} from "../../browser/sshHostKeyTrustService.js";
suite("SSHHostKeyTrustService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(store) {
    const storageService = store.add(new InMemoryStorageService());
    const service = store.add(new SSHHostKeyTrustService(storageService));
    return { service, storageService };
  }
  test("stores, reads back and forgets host keys", () => {
    const { service } = createService(disposables);
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1 });
    const afterTrust = service.getTrustedKeys("example.com", 22);
    const mixedCase = service.getTrustedKeys("ExAmPlE.CoM", 22);
    service.forgetHost("example.com", 22);
    assert.deepStrictEqual(
      {
        afterTrust: afterTrust.map((k) => `${k.keyType} ${k.fingerprint}`),
        mixedCase: mixedCase.map((k) => k.fingerprint),
        afterForget: service.getTrustedKeys("example.com", 22).length
      },
      {
        afterTrust: ["ssh-ed25519 SHA256:aaa"],
        mixedCase: ["SHA256:aaa"],
        afterForget: 0
      }
    );
  });
  test("keys hosts by port", () => {
    const { service } = createService(disposables);
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1 });
    service.trustHostKey("example.com", 2222, { keyType: "ssh-ed25519", fingerprint: "SHA256:bbb", addedAt: 1 });
    assert.deepStrictEqual(
      {
        default: service.getTrustedKeys("example.com", 22).map((k) => k.fingerprint),
        custom: service.getTrustedKeys("example.com", 2222).map((k) => k.fingerprint),
        listed: service.listTrustedHosts().map((h) => `${h.host}:${h.port}`).sort()
      },
      {
        default: ["SHA256:aaa"],
        custom: ["SHA256:bbb"],
        listed: ["example.com:22", "example.com:2222"]
      }
    );
  });
  test("a rotated key replaces its predecessor for the same algorithm", () => {
    const { service } = createService(disposables);
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:old", addedAt: 1 });
    service.trustHostKey("example.com", 22, { keyType: "ssh-rsa", fingerprint: "SHA256:rsa", addedAt: 1 });
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:new", addedAt: 2 });
    assert.deepStrictEqual(
      service.getTrustedKeys("example.com", 22).map((k) => `${k.keyType} ${k.fingerprint}`).sort(),
      ["ssh-ed25519 SHA256:new", "ssh-rsa SHA256:rsa"]
    );
  });
  test("persists across service instances at application scope", () => {
    const store = new DisposableStore();
    const storageService = store.add(new InMemoryStorageService());
    const first = store.add(new SSHHostKeyTrustService(storageService));
    first.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1, alias: "myhost" });
    const second = store.add(new SSHHostKeyTrustService(storageService));
    assert.deepStrictEqual(
      second.getTrustedKeys("example.com", 22).map((k) => ({ keyType: k.keyType, fingerprint: k.fingerprint, alias: k.alias })),
      [{ keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", alias: "myhost" }]
    );
    store.dispose();
  });
  test("clears storage entirely when the last host is forgotten", () => {
    const { service, storageService } = createService(disposables);
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1 });
    service.forgetHost("example.com", 22);
    assert.strictEqual(storageService.get(SSH_HOST_KEY_TRUST_STORAGE_KEY, StorageScope.APPLICATION), void 0);
  });
  test("fires a change event for the affected host", () => {
    const { service } = createService(disposables);
    const fired = [];
    disposables.add(service.onDidChangeTrustedHosts((key) => fired.push(key)));
    service.trustHostKey("example.com", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1 });
    service.forgetHost("example.com", 22);
    service.forgetHost("other.com", 22);
    assert.deepStrictEqual(fired, ["example.com:22", "example.com:22"]);
  });
  suite("parseTrustedHostKeys", () => {
    test("drops malformed entries without discarding the rest", () => {
      const raw = JSON.stringify({
        "good.com:22": [{ keyType: "ssh-ed25519", fingerprint: "SHA256:aaa", addedAt: 1 }],
        "partial.com:22": [
          { keyType: "ssh-ed25519", fingerprint: "SHA256:bbb", addedAt: 2 },
          // Each of these is missing or has the wrong type for a
          // required field. Trust must never be reconstructed from a
          // partial record.
          { keyType: "ssh-rsa", fingerprint: "SHA256:ccc" },
          { keyType: "", fingerprint: "SHA256:ddd", addedAt: 3 },
          { keyType: "ssh-rsa", addedAt: 4 },
          "not-an-object"
        ],
        "empty.com:22": [],
        "wrong-shape.com:22": "not-an-array"
      });
      const parsed = parseTrustedHostKeys(raw);
      assert.deepStrictEqual(
        {
          hosts: [...parsed.keys()].sort(),
          partial: parsed.get("partial.com:22")?.map((k) => k.fingerprint)
        },
        { hosts: ["good.com:22", "partial.com:22"], partial: ["SHA256:bbb"] }
      );
    });
    test("returns empty for absent or invalid JSON", () => {
      assert.deepStrictEqual(
        {
          undefinedRaw: parseTrustedHostKeys(void 0).size,
          invalidJson: parseTrustedHostKeys("{not json").size,
          array: parseTrustedHostKeys("[]").size,
          nullValue: parseTrustedHostKeys("null").size
        },
        { undefinedRaw: 0, invalidJson: 0, array: 0, nullValue: 0 }
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxicm93c2VyXFxzc2hIb3N0S2V5VHJ1c3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7XG5cdHBhcnNlVHJ1c3RlZEhvc3RLZXlzLFxuXHRTU0hIb3N0S2V5VHJ1c3RTZXJ2aWNlLFxuXHRTU0hfSE9TVF9LRVlfVFJVU1RfU1RPUkFHRV9LRVksXG59IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3NoSG9zdEtleVRydXN0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdTU0hIb3N0S2V5VHJ1c3RTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPikge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2Uoc3RvcmFnZVNlcnZpY2UpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBzdG9yYWdlU2VydmljZSB9O1xuXHR9XG5cblx0dGVzdCgnc3RvcmVzLCByZWFkcyBiYWNrIGFuZCBmb3JnZXRzIGhvc3Qga2V5cycsICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdHNlcnZpY2UudHJ1c3RIb3N0S2V5KCdleGFtcGxlLmNvbScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2OmFhYScsIGFkZGVkQXQ6IDEgfSk7XG5cblx0XHRjb25zdCBhZnRlclRydXN0ID0gc2VydmljZS5nZXRUcnVzdGVkS2V5cygnZXhhbXBsZS5jb20nLCAyMik7XG5cdFx0Ly8gSG9zdCBrZXlzIGJlbG9uZyB0byBhIG1hY2hpbmUsIHNvIGxvb2t1cCBtdXN0IGJlIGNhc2UtaW5zZW5zaXRpdmUgaW5cblx0XHQvLyB0aGUgc2FtZSB3YXkgaG9zdG5hbWVzIGFyZS5cblx0XHRjb25zdCBtaXhlZENhc2UgPSBzZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdFeEFtUGxFLkNvTScsIDIyKTtcblx0XHRzZXJ2aWNlLmZvcmdldEhvc3QoJ2V4YW1wbGUuY29tJywgMjIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0YWZ0ZXJUcnVzdDogYWZ0ZXJUcnVzdC5tYXAoayA9PiBgJHtrLmtleVR5cGV9ICR7ay5maW5nZXJwcmludH1gKSxcblx0XHRcdFx0bWl4ZWRDYXNlOiBtaXhlZENhc2UubWFwKGsgPT4gay5maW5nZXJwcmludCksXG5cdFx0XHRcdGFmdGVyRm9yZ2V0OiBzZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdleGFtcGxlLmNvbScsIDIyKS5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhZnRlclRydXN0OiBbJ3NzaC1lZDI1NTE5IFNIQTI1NjphYWEnXSxcblx0XHRcdFx0bWl4ZWRDYXNlOiBbJ1NIQTI1NjphYWEnXSxcblx0XHRcdFx0YWZ0ZXJGb3JnZXQ6IDAsXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2V5cyBob3N0cyBieSBwb3J0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0c2VydmljZS50cnVzdEhvc3RLZXkoJ2V4YW1wbGUuY29tJywgMjIsIHsga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6YWFhJywgYWRkZWRBdDogMSB9KTtcblx0XHRzZXJ2aWNlLnRydXN0SG9zdEtleSgnZXhhbXBsZS5jb20nLCAyMjIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2OmJiYicsIGFkZGVkQXQ6IDEgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRkZWZhdWx0OiBzZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdleGFtcGxlLmNvbScsIDIyKS5tYXAoayA9PiBrLmZpbmdlcnByaW50KSxcblx0XHRcdFx0Y3VzdG9tOiBzZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdleGFtcGxlLmNvbScsIDIyMjIpLm1hcChrID0+IGsuZmluZ2VycHJpbnQpLFxuXHRcdFx0XHRsaXN0ZWQ6IHNlcnZpY2UubGlzdFRydXN0ZWRIb3N0cygpLm1hcChoID0+IGAke2guaG9zdH06JHtoLnBvcnR9YCkuc29ydCgpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdDogWydTSEEyNTY6YWFhJ10sXG5cdFx0XHRcdGN1c3RvbTogWydTSEEyNTY6YmJiJ10sXG5cdFx0XHRcdGxpc3RlZDogWydleGFtcGxlLmNvbToyMicsICdleGFtcGxlLmNvbToyMjIyJ10sXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSByb3RhdGVkIGtleSByZXBsYWNlcyBpdHMgcHJlZGVjZXNzb3IgZm9yIHRoZSBzYW1lIGFsZ29yaXRobScsICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdHNlcnZpY2UudHJ1c3RIb3N0S2V5KCdleGFtcGxlLmNvbScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2Om9sZCcsIGFkZGVkQXQ6IDEgfSk7XG5cdFx0c2VydmljZS50cnVzdEhvc3RLZXkoJ2V4YW1wbGUuY29tJywgMjIsIHsga2V5VHlwZTogJ3NzaC1yc2EnLCBmaW5nZXJwcmludDogJ1NIQTI1Njpyc2EnLCBhZGRlZEF0OiAxIH0pO1xuXHRcdHNlcnZpY2UudHJ1c3RIb3N0S2V5KCdleGFtcGxlLmNvbScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2Om5ldycsIGFkZGVkQXQ6IDIgfSk7XG5cblx0XHQvLyBUaGUgc3VwZXJzZWRlZCBlZDI1NTE5IGtleSBtdXN0IG5vdCByZW1haW4gdHJ1c3RlZCwgb3IgYSByb3RhdGlvblxuXHRcdC8vIHdvdWxkIGxlYXZlIHRoZSBvbGQga2V5IHZhbGlkIGZvcmV2ZXIuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ2V4YW1wbGUuY29tJywgMjIpLm1hcChrID0+IGAke2sua2V5VHlwZX0gJHtrLmZpbmdlcnByaW50fWApLnNvcnQoKSxcblx0XHRcdFsnc3NoLWVkMjU1MTkgU0hBMjU2Om5ldycsICdzc2gtcnNhIFNIQTI1Njpyc2EnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGFjcm9zcyBzZXJ2aWNlIGluc3RhbmNlcyBhdCBhcHBsaWNhdGlvbiBzY29wZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaXJzdCA9IHN0b3JlLmFkZChuZXcgU1NISG9zdEtleVRydXN0U2VydmljZShzdG9yYWdlU2VydmljZSkpO1xuXHRcdGZpcnN0LnRydXN0SG9zdEtleSgnZXhhbXBsZS5jb20nLCAyMiwgeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1NjphYWEnLCBhZGRlZEF0OiAxLCBhbGlhczogJ215aG9zdCcgfSk7XG5cblx0XHRjb25zdCBzZWNvbmQgPSBzdG9yZS5hZGQobmV3IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2Uoc3RvcmFnZVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2Vjb25kLmdldFRydXN0ZWRLZXlzKCdleGFtcGxlLmNvbScsIDIyKS5tYXAoayA9PiAoeyBrZXlUeXBlOiBrLmtleVR5cGUsIGZpbmdlcnByaW50OiBrLmZpbmdlcnByaW50LCBhbGlhczogay5hbGlhcyB9KSksXG5cdFx0XHRbeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1NjphYWEnLCBhbGlhczogJ215aG9zdCcgfV0pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJzIHN0b3JhZ2UgZW50aXJlbHkgd2hlbiB0aGUgbGFzdCBob3N0IGlzIGZvcmdvdHRlbicsICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRzZXJ2aWNlLnRydXN0SG9zdEtleSgnZXhhbXBsZS5jb20nLCAyMiwgeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1NjphYWEnLCBhZGRlZEF0OiAxIH0pO1xuXHRcdHNlcnZpY2UuZm9yZ2V0SG9zdCgnZXhhbXBsZS5jb20nLCAyMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldChTU0hfSE9TVF9LRVlfVFJVU1RfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIGEgY2hhbmdlIGV2ZW50IGZvciB0aGUgYWZmZWN0ZWQgaG9zdCcsICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGZpcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEhvc3RzKGtleSA9PiBmaXJlZC5wdXNoKGtleSkpKTtcblxuXHRcdHNlcnZpY2UudHJ1c3RIb3N0S2V5KCdleGFtcGxlLmNvbScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2OmFhYScsIGFkZGVkQXQ6IDEgfSk7XG5cdFx0c2VydmljZS5mb3JnZXRIb3N0KCdleGFtcGxlLmNvbScsIDIyKTtcblx0XHQvLyBGb3JnZXR0aW5nIGFuIHVua25vd24gaG9zdCBpcyBhIG5vLW9wIGFuZCBtdXN0IG5vdCBmaXJlLlxuXHRcdHNlcnZpY2UuZm9yZ2V0SG9zdCgnb3RoZXIuY29tJywgMjIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJlZCwgWydleGFtcGxlLmNvbToyMicsICdleGFtcGxlLmNvbToyMiddKTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlVHJ1c3RlZEhvc3RLZXlzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Ryb3BzIG1hbGZvcm1lZCBlbnRyaWVzIHdpdGhvdXQgZGlzY2FyZGluZyB0aGUgcmVzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J2dvb2QuY29tOjIyJzogW3sga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6YWFhJywgYWRkZWRBdDogMSB9XSxcblx0XHRcdFx0J3BhcnRpYWwuY29tOjIyJzogW1xuXHRcdFx0XHRcdHsga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6YmJiJywgYWRkZWRBdDogMiB9LFxuXHRcdFx0XHRcdC8vIEVhY2ggb2YgdGhlc2UgaXMgbWlzc2luZyBvciBoYXMgdGhlIHdyb25nIHR5cGUgZm9yIGFcblx0XHRcdFx0XHQvLyByZXF1aXJlZCBmaWVsZC4gVHJ1c3QgbXVzdCBuZXZlciBiZSByZWNvbnN0cnVjdGVkIGZyb20gYVxuXHRcdFx0XHRcdC8vIHBhcnRpYWwgcmVjb3JkLlxuXHRcdFx0XHRcdHsga2V5VHlwZTogJ3NzaC1yc2EnLCBmaW5nZXJwcmludDogJ1NIQTI1NjpjY2MnIH0sXG5cdFx0XHRcdFx0eyBrZXlUeXBlOiAnJywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6ZGRkJywgYWRkZWRBdDogMyB9LFxuXHRcdFx0XHRcdHsga2V5VHlwZTogJ3NzaC1yc2EnLCBhZGRlZEF0OiA0IH0sXG5cdFx0XHRcdFx0J25vdC1hbi1vYmplY3QnLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHQnZW1wdHkuY29tOjIyJzogW10sXG5cdFx0XHRcdCd3cm9uZy1zaGFwZS5jb206MjInOiAnbm90LWFuLWFycmF5Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVRydXN0ZWRIb3N0S2V5cyhyYXcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGhvc3RzOiBbLi4ucGFyc2VkLmtleXMoKV0uc29ydCgpLFxuXHRcdFx0XHRcdHBhcnRpYWw6IHBhcnNlZC5nZXQoJ3BhcnRpYWwuY29tOjIyJyk/Lm1hcChrID0+IGsuZmluZ2VycHJpbnQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGhvc3RzOiBbJ2dvb2QuY29tOjIyJywgJ3BhcnRpYWwuY29tOjIyJ10sIHBhcnRpYWw6IFsnU0hBMjU2OmJiYiddIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmb3IgYWJzZW50IG9yIGludmFsaWQgSlNPTicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1bmRlZmluZWRSYXc6IHBhcnNlVHJ1c3RlZEhvc3RLZXlzKHVuZGVmaW5lZCkuc2l6ZSxcblx0XHRcdFx0XHRpbnZhbGlkSnNvbjogcGFyc2VUcnVzdGVkSG9zdEtleXMoJ3tub3QganNvbicpLnNpemUsXG5cdFx0XHRcdFx0YXJyYXk6IHBhcnNlVHJ1c3RlZEhvc3RLZXlzKCdbXScpLnNpemUsXG5cdFx0XHRcdFx0bnVsbFZhbHVlOiBwYXJzZVRydXN0ZWRIb3N0S2V5cygnbnVsbCcpLnNpemUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgdW5kZWZpbmVkUmF3OiAwLCBpbnZhbGlkSnNvbjogMCwgYXJyYXk6IDAsIG51bGxWYWx1ZTogMCB9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1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
