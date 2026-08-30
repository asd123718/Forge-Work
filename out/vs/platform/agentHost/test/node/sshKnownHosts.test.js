import assert from "assert";
import { createHmac, randomBytes } from "crypto";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  computeHostKeyFingerprint,
  matchKnownHosts,
  parseKnownHosts,
  parseKnownHostsLine,
  readHostKeyType
} from "../../node/sshKnownHosts.js";
function makeKeyBlob(keyType, material) {
  const type = Buffer.from(keyType, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(type.length, 0);
  const body = Buffer.alloc(4);
  body.writeUInt32BE(material.length, 0);
  return Buffer.concat([header, type, body, material]);
}
const ED25519_A = makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 170));
const ED25519_B = makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 187));
const RSA_A = makeKeyBlob("ssh-rsa", Buffer.alloc(64, 204));
function line(host, blob, marker) {
  const type = readHostKeyType(blob);
  return `${marker ? `${marker} ` : ""}${host} ${type} ${blob.toString("base64")}`;
}
function hashedHostField(host, salt) {
  const hash = createHmac("sha1", salt).update(host).digest();
  return `|1|${salt.toString("base64")}|${hash.toString("base64")}`;
}
suite("sshKnownHosts", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("computeHostKeyFingerprint", () => {
    test("matches the ssh-keygen -lf format for a known key", () => {
      const blob = Buffer.from(
        "AAAAC3NzaC1lZDI1NTE5AAAAIJ5SStkj9JLI/lWstJ2hIit3/xB+2xVeUesa/GlxqHFz",
        "base64"
      );
      assert.deepStrictEqual(
        {
          fingerprint: computeHostKeyFingerprint(blob),
          keyType: readHostKeyType(blob)
        },
        {
          fingerprint: "SHA256:yvH+SxFjYRQ8Vcgn8CFkUoghmVAaLoQjp+kmo5k7y/8",
          keyType: "ssh-ed25519"
        }
      );
    });
    test("strips base64 padding", () => {
      assert.ok(!computeHostKeyFingerprint(ED25519_A).includes("="));
    });
  });
  suite("readHostKeyType", () => {
    test("reads the algorithm and rejects malformed blobs", () => {
      const lying = Buffer.alloc(8);
      lying.writeUInt32BE(65535, 0);
      assert.deepStrictEqual(
        {
          ed25519: readHostKeyType(ED25519_A),
          rsa: readHostKeyType(RSA_A),
          empty: readHostKeyType(Buffer.alloc(0)),
          truncated: readHostKeyType(Buffer.alloc(2)),
          lengthPastEnd: readHostKeyType(lying)
        },
        {
          ed25519: "ssh-ed25519",
          rsa: "ssh-rsa",
          empty: void 0,
          truncated: void 0,
          lengthPastEnd: void 0
        }
      );
    });
  });
  suite("parseKnownHostsLine", () => {
    test("parses a plain entry", () => {
      const entry = parseKnownHostsLine(line("example.com", ED25519_A));
      assert.deepStrictEqual(
        {
          patterns: entry?.patterns,
          keyType: entry?.keyType,
          marker: entry?.marker,
          keyMatches: entry?.key.equals(ED25519_A)
        },
        { patterns: ["example.com"], keyType: "ssh-ed25519", marker: void 0, keyMatches: true }
      );
    });
    test("parses comma-separated patterns and markers", () => {
      const multi = parseKnownHostsLine(line("a.example.com,b.example.com,1.2.3.4", ED25519_A));
      const revoked = parseKnownHostsLine(line("example.com", ED25519_A, "@revoked"));
      const ca = parseKnownHostsLine(line("*.example.com", ED25519_A, "@cert-authority"));
      assert.deepStrictEqual(
        {
          patterns: multi?.patterns,
          revokedMarker: revoked?.marker,
          caMarker: ca?.marker
        },
        {
          patterns: ["a.example.com", "b.example.com", "1.2.3.4"],
          revokedMarker: "revoked",
          caMarker: "cert-authority"
        }
      );
    });
    test("parses a hashed entry", () => {
      const salt = randomBytes(20);
      const entry = parseKnownHostsLine(`${hashedHostField("example.com", salt)} ssh-ed25519 ${ED25519_A.toString("base64")}`);
      assert.deepStrictEqual(
        {
          saltMatches: entry?.hashedHost?.salt.equals(salt),
          hashLength: entry?.hashedHost?.hash.length,
          patterns: entry?.patterns
        },
        { saltMatches: true, hashLength: 20, patterns: [] }
      );
    });
    test("skips blanks, comments and malformed lines", () => {
      const typeMismatch = `example.com ssh-rsa ${ED25519_A.toString("base64")}`;
      assert.deepStrictEqual(
        {
          blank: parseKnownHostsLine("   "),
          comment: parseKnownHostsLine("# a comment"),
          tooFewFields: parseKnownHostsLine("example.com ssh-ed25519"),
          unknownMarker: parseKnownHostsLine(line("example.com", ED25519_A, "@bogus")),
          // The line claims ssh-rsa but the blob says ssh-ed25519.
          // Trusting the label would let a mislabeled entry match a
          // key type it does not actually hold.
          typeDisagreesWithBlob: parseKnownHostsLine(typeMismatch),
          shortHashedHash: parseKnownHostsLine(`|1|${randomBytes(20).toString("base64")}|${randomBytes(4).toString("base64")} ssh-ed25519 ${ED25519_A.toString("base64")}`)
        },
        {
          blank: void 0,
          comment: void 0,
          tooFewFields: void 0,
          unknownMarker: void 0,
          typeDisagreesWithBlob: void 0,
          shortHashedHash: void 0
        }
      );
    });
  });
  suite("matchKnownHosts", () => {
    const match = (contents, host, port, blob) => matchKnownHosts(parseKnownHosts(contents), host, port, readHostKeyType(blob), blob);
    test("matches, mismatches and reports unknown hosts", () => {
      const known = line("example.com", ED25519_A);
      assert.deepStrictEqual(
        {
          exact: match(known, "example.com", 22, ED25519_A),
          caseInsensitive: match(known, "EXAMPLE.COM", 22, ED25519_A),
          changedKey: match(known, "example.com", 22, ED25519_B),
          otherHost: match(known, "other.com", 22, ED25519_A),
          empty: match("", "example.com", 22, ED25519_A)
        },
        {
          exact: "match",
          caseInsensitive: "match",
          changedKey: "mismatch",
          otherHost: "unknown",
          empty: "unknown"
        }
      );
    });
    test("scopes mismatch to the same key type", () => {
      const rsaOnly = line("example.com", RSA_A);
      assert.deepStrictEqual(
        {
          differentType: match(rsaOnly, "example.com", 22, ED25519_A),
          sameType: match(rsaOnly, "example.com", 22, RSA_A)
        },
        { differentType: "unknown", sameType: "match" }
      );
    });
    test("handles non-default ports via the bracket form", () => {
      const bracketed = line("[example.com]:2222", ED25519_A);
      const bare = line("example.com", ED25519_A);
      assert.deepStrictEqual(
        {
          bracketedOnCustomPort: match(bracketed, "example.com", 2222, ED25519_A),
          bracketedOnDefaultPort: match(bracketed, "example.com", 22, ED25519_A),
          bareOnCustomPort: match(bare, "example.com", 2222, ED25519_A)
        },
        {
          bracketedOnCustomPort: "match",
          bracketedOnDefaultPort: "unknown",
          bareOnCustomPort: "unknown"
        }
      );
    });
    test("supports glob patterns and negation", () => {
      const glob = line("*.example.com", ED25519_A);
      const negated = line("*.example.com,!secret.example.com", ED25519_A);
      assert.deepStrictEqual(
        {
          globMatches: match(glob, "host.example.com", 22, ED25519_A),
          globMissesOtherDomain: match(glob, "host.other.com", 22, ED25519_A),
          singleChar: match(line("host?.example.com", ED25519_A), "host1.example.com", 22, ED25519_A),
          // A negation must veto the whole entry even though the
          // wildcard on the same line also matches.
          negatedHost: match(negated, "secret.example.com", 22, ED25519_A),
          nonNegatedHost: match(negated, "public.example.com", 22, ED25519_A)
        },
        {
          globMatches: "match",
          globMissesOtherDomain: "unknown",
          singleChar: "match",
          negatedHost: "unknown",
          nonNegatedHost: "match"
        }
      );
    });
    test("matches hashed entries", () => {
      const salt = randomBytes(20);
      const hashed = `${hashedHostField("example.com", salt)} ssh-ed25519 ${ED25519_A.toString("base64")}`;
      assert.deepStrictEqual(
        {
          sameKey: match(hashed, "example.com", 22, ED25519_A),
          changedKey: match(hashed, "example.com", 22, ED25519_B),
          otherHost: match(hashed, "other.com", 22, ED25519_A)
        },
        { sameKey: "match", changedKey: "mismatch", otherHost: "unknown" }
      );
    });
    test("revocation overrides an otherwise matching entry", () => {
      const contents = [
        line("example.com", ED25519_A),
        line("example.com", ED25519_A, "@revoked")
      ].join("\n");
      assert.deepStrictEqual(
        {
          revokedKey: match(contents, "example.com", 22, ED25519_A),
          otherKey: match(contents, "example.com", 22, ED25519_B)
        },
        { revokedKey: "revoked", otherKey: "mismatch" }
      );
    });
    test("reports ca-only when the host is covered solely by a cert authority", () => {
      const ca = line("*.example.com", ED25519_A, "@cert-authority");
      assert.deepStrictEqual(
        {
          caOnly: match(ca, "host.example.com", 22, ED25519_B),
          // A normal entry alongside the CA line still decides.
          caPlusNormal: match([ca, line("host.example.com", ED25519_B)].join("\n"), "host.example.com", 22, ED25519_B)
        },
        { caOnly: "ca-only", caPlusNormal: "match" }
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzc2hLbm93bkhvc3RzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjcmVhdGVIbWFjLCByYW5kb21CeXRlcyB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQsXG5cdG1hdGNoS25vd25Ib3N0cyxcblx0cGFyc2VLbm93bkhvc3RzLFxuXHRwYXJzZUtub3duSG9zdHNMaW5lLFxuXHRyZWFkSG9zdEtleVR5cGUsXG59IGZyb20gJy4uLy4uL25vZGUvc3NoS25vd25Ib3N0cy5qcyc7XG5cbi8qKiBCdWlsZCBhIHN5bnRhY3RpY2FsbHkgdmFsaWQgU1NIIHdpcmUtZm9ybWF0IHB1YmxpYyBrZXkgYmxvYi4gKi9cbmZ1bmN0aW9uIG1ha2VLZXlCbG9iKGtleVR5cGU6IHN0cmluZywgbWF0ZXJpYWw6IEJ1ZmZlcik6IEJ1ZmZlciB7XG5cdGNvbnN0IHR5cGUgPSBCdWZmZXIuZnJvbShrZXlUeXBlLCAnYXNjaWknKTtcblx0Y29uc3QgaGVhZGVyID0gQnVmZmVyLmFsbG9jKDQpO1xuXHRoZWFkZXIud3JpdGVVSW50MzJCRSh0eXBlLmxlbmd0aCwgMCk7XG5cdGNvbnN0IGJvZHkgPSBCdWZmZXIuYWxsb2MoNCk7XG5cdGJvZHkud3JpdGVVSW50MzJCRShtYXRlcmlhbC5sZW5ndGgsIDApO1xuXHRyZXR1cm4gQnVmZmVyLmNvbmNhdChbaGVhZGVyLCB0eXBlLCBib2R5LCBtYXRlcmlhbF0pO1xufVxuXG5jb25zdCBFRDI1NTE5X0EgPSBtYWtlS2V5QmxvYignc3NoLWVkMjU1MTknLCBCdWZmZXIuYWxsb2MoMzIsIDB4YWEpKTtcbmNvbnN0IEVEMjU1MTlfQiA9IG1ha2VLZXlCbG9iKCdzc2gtZWQyNTUxOScsIEJ1ZmZlci5hbGxvYygzMiwgMHhiYikpO1xuY29uc3QgUlNBX0EgPSBtYWtlS2V5QmxvYignc3NoLXJzYScsIEJ1ZmZlci5hbGxvYyg2NCwgMHhjYykpO1xuXG5mdW5jdGlvbiBsaW5lKGhvc3Q6IHN0cmluZywgYmxvYjogQnVmZmVyLCBtYXJrZXI/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB0eXBlID0gcmVhZEhvc3RLZXlUeXBlKGJsb2IpITtcblx0cmV0dXJuIGAke21hcmtlciA/IGAke21hcmtlcn0gYCA6ICcnfSR7aG9zdH0gJHt0eXBlfSAke2Jsb2IudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG59XG5cbi8qKiBCdWlsZCBhIGhhc2hlZCAoYHwxfHNhbHR8aGFzaGApIGhvc3QgZmllbGQgdGhlIHdheSBgc3NoLWtleWdlbiAtSGAgZG9lcy4gKi9cbmZ1bmN0aW9uIGhhc2hlZEhvc3RGaWVsZChob3N0OiBzdHJpbmcsIHNhbHQ6IEJ1ZmZlcik6IHN0cmluZyB7XG5cdGNvbnN0IGhhc2ggPSBjcmVhdGVIbWFjKCdzaGExJywgc2FsdCkudXBkYXRlKGhvc3QpLmRpZ2VzdCgpO1xuXHRyZXR1cm4gYHwxfCR7c2FsdC50b1N0cmluZygnYmFzZTY0Jyl9fCR7aGFzaC50b1N0cmluZygnYmFzZTY0Jyl9YDtcbn1cblxuc3VpdGUoJ3NzaEtub3duSG9zdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2NvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWF0Y2hlcyB0aGUgc3NoLWtleWdlbiAtbGYgZm9ybWF0IGZvciBhIGtub3duIGtleScsICgpID0+IHtcblx0XHRcdC8vIEdvbGRlbiB2YWx1ZTogdGhpcyBleGFjdCBibG9iIGFuZCBmaW5nZXJwcmludCBwYWlyIHdhcyB2ZXJpZmllZFxuXHRcdFx0Ly8gYWdhaW5zdCBgc3NoLWtleWdlbiAtbGZgIHNvIGEgY2hhbmdlIGluIGVuY29kaW5nIGlzIGNhdWdodCBoZXJlXG5cdFx0XHQvLyByYXRoZXIgdGhhbiBvbmx5IHNob3dpbmcgdXAgYWdhaW5zdCBhIGxpdmUgc2VydmVyLlxuXHRcdFx0Y29uc3QgYmxvYiA9IEJ1ZmZlci5mcm9tKFxuXHRcdFx0XHQnQUFBQUMzTnphQzFsWkRJMU5URTVBQUFBSUo1U1N0a2o5SkxJL2xXc3RKMmhJaXQzL3hCKzJ4VmVVZXNhL0dseHFIRnonLFxuXHRcdFx0XHQnYmFzZTY0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZmluZ2VycHJpbnQ6IGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQoYmxvYiksXG5cdFx0XHRcdFx0a2V5VHlwZTogcmVhZEhvc3RLZXlUeXBlKGJsb2IpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZmluZ2VycHJpbnQ6ICdTSEEyNTY6eXZIK1N4RmpZUlE4VmNnbjhDRmtVb2dobVZBYUxvUWpwK2ttbzVrN3kvOCcsXG5cdFx0XHRcdFx0a2V5VHlwZTogJ3NzaC1lZDI1NTE5Jyxcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgYmFzZTY0IHBhZGRpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQoRUQyNTUxOV9BKS5pbmNsdWRlcygnPScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlYWRIb3N0S2V5VHlwZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZWFkcyB0aGUgYWxnb3JpdGhtIGFuZCByZWplY3RzIG1hbGZvcm1lZCBibG9icycsICgpID0+IHtcblx0XHRcdGNvbnN0IGx5aW5nID0gQnVmZmVyLmFsbG9jKDgpO1xuXHRcdFx0bHlpbmcud3JpdGVVSW50MzJCRSgweGZmZmYsIDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkMjU1MTk6IHJlYWRIb3N0S2V5VHlwZShFRDI1NTE5X0EpLFxuXHRcdFx0XHRcdHJzYTogcmVhZEhvc3RLZXlUeXBlKFJTQV9BKSxcblx0XHRcdFx0XHRlbXB0eTogcmVhZEhvc3RLZXlUeXBlKEJ1ZmZlci5hbGxvYygwKSksXG5cdFx0XHRcdFx0dHJ1bmNhdGVkOiByZWFkSG9zdEtleVR5cGUoQnVmZmVyLmFsbG9jKDIpKSxcblx0XHRcdFx0XHRsZW5ndGhQYXN0RW5kOiByZWFkSG9zdEtleVR5cGUobHlpbmcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWQyNTUxOTogJ3NzaC1lZDI1NTE5Jyxcblx0XHRcdFx0XHRyc2E6ICdzc2gtcnNhJyxcblx0XHRcdFx0XHRlbXB0eTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydW5jYXRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxlbmd0aFBhc3RFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUtub3duSG9zdHNMaW5lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBhIHBsYWluIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBwYXJzZUtub3duSG9zdHNMaW5lKGxpbmUoJ2V4YW1wbGUuY29tJywgRUQyNTUxOV9BKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0dGVybnM6IGVudHJ5Py5wYXR0ZXJucyxcblx0XHRcdFx0XHRrZXlUeXBlOiBlbnRyeT8ua2V5VHlwZSxcblx0XHRcdFx0XHRtYXJrZXI6IGVudHJ5Py5tYXJrZXIsXG5cdFx0XHRcdFx0a2V5TWF0Y2hlczogZW50cnk/LmtleS5lcXVhbHMoRUQyNTUxOV9BKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBwYXR0ZXJuczogWydleGFtcGxlLmNvbSddLCBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBtYXJrZXI6IHVuZGVmaW5lZCwga2V5TWF0Y2hlczogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBjb21tYS1zZXBhcmF0ZWQgcGF0dGVybnMgYW5kIG1hcmtlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtdWx0aSA9IHBhcnNlS25vd25Ib3N0c0xpbmUobGluZSgnYS5leGFtcGxlLmNvbSxiLmV4YW1wbGUuY29tLDEuMi4zLjQnLCBFRDI1NTE5X0EpKTtcblx0XHRcdGNvbnN0IHJldm9rZWQgPSBwYXJzZUtub3duSG9zdHNMaW5lKGxpbmUoJ2V4YW1wbGUuY29tJywgRUQyNTUxOV9BLCAnQHJldm9rZWQnKSk7XG5cdFx0XHRjb25zdCBjYSA9IHBhcnNlS25vd25Ib3N0c0xpbmUobGluZSgnKi5leGFtcGxlLmNvbScsIEVEMjU1MTlfQSwgJ0BjZXJ0LWF1dGhvcml0eScpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXR0ZXJuczogbXVsdGk/LnBhdHRlcm5zLFxuXHRcdFx0XHRcdHJldm9rZWRNYXJrZXI6IHJldm9rZWQ/Lm1hcmtlcixcblx0XHRcdFx0XHRjYU1hcmtlcjogY2E/Lm1hcmtlcixcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdHRlcm5zOiBbJ2EuZXhhbXBsZS5jb20nLCAnYi5leGFtcGxlLmNvbScsICcxLjIuMy40J10sXG5cdFx0XHRcdFx0cmV2b2tlZE1hcmtlcjogJ3Jldm9rZWQnLFxuXHRcdFx0XHRcdGNhTWFya2VyOiAnY2VydC1hdXRob3JpdHknLFxuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBhIGhhc2hlZCBlbnRyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNhbHQgPSByYW5kb21CeXRlcygyMCk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHBhcnNlS25vd25Ib3N0c0xpbmUoYCR7aGFzaGVkSG9zdEZpZWxkKCdleGFtcGxlLmNvbScsIHNhbHQpfSBzc2gtZWQyNTUxOSAke0VEMjU1MTlfQS50b1N0cmluZygnYmFzZTY0Jyl9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FsdE1hdGNoZXM6IGVudHJ5Py5oYXNoZWRIb3N0Py5zYWx0LmVxdWFscyhzYWx0KSxcblx0XHRcdFx0XHRoYXNoTGVuZ3RoOiBlbnRyeT8uaGFzaGVkSG9zdD8uaGFzaC5sZW5ndGgsXG5cdFx0XHRcdFx0cGF0dGVybnM6IGVudHJ5Py5wYXR0ZXJucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBzYWx0TWF0Y2hlczogdHJ1ZSwgaGFzaExlbmd0aDogMjAsIHBhdHRlcm5zOiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGJsYW5rcywgY29tbWVudHMgYW5kIG1hbGZvcm1lZCBsaW5lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHR5cGVNaXNtYXRjaCA9IGBleGFtcGxlLmNvbSBzc2gtcnNhICR7RUQyNTUxOV9BLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJsYW5rOiBwYXJzZUtub3duSG9zdHNMaW5lKCcgICAnKSxcblx0XHRcdFx0XHRjb21tZW50OiBwYXJzZUtub3duSG9zdHNMaW5lKCcjIGEgY29tbWVudCcpLFxuXHRcdFx0XHRcdHRvb0Zld0ZpZWxkczogcGFyc2VLbm93bkhvc3RzTGluZSgnZXhhbXBsZS5jb20gc3NoLWVkMjU1MTknKSxcblx0XHRcdFx0XHR1bmtub3duTWFya2VyOiBwYXJzZUtub3duSG9zdHNMaW5lKGxpbmUoJ2V4YW1wbGUuY29tJywgRUQyNTUxOV9BLCAnQGJvZ3VzJykpLFxuXHRcdFx0XHRcdC8vIFRoZSBsaW5lIGNsYWltcyBzc2gtcnNhIGJ1dCB0aGUgYmxvYiBzYXlzIHNzaC1lZDI1NTE5LlxuXHRcdFx0XHRcdC8vIFRydXN0aW5nIHRoZSBsYWJlbCB3b3VsZCBsZXQgYSBtaXNsYWJlbGVkIGVudHJ5IG1hdGNoIGFcblx0XHRcdFx0XHQvLyBrZXkgdHlwZSBpdCBkb2VzIG5vdCBhY3R1YWxseSBob2xkLlxuXHRcdFx0XHRcdHR5cGVEaXNhZ3JlZXNXaXRoQmxvYjogcGFyc2VLbm93bkhvc3RzTGluZSh0eXBlTWlzbWF0Y2gpLFxuXHRcdFx0XHRcdHNob3J0SGFzaGVkSGFzaDogcGFyc2VLbm93bkhvc3RzTGluZShgfDF8JHtyYW5kb21CeXRlcygyMCkudG9TdHJpbmcoJ2Jhc2U2NCcpfXwke3JhbmRvbUJ5dGVzKDQpLnRvU3RyaW5nKCdiYXNlNjQnKX0gc3NoLWVkMjU1MTkgJHtFRDI1NTE5X0EudG9TdHJpbmcoJ2Jhc2U2NCcpfWApLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ymxhbms6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21tZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vRmV3RmllbGRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dW5rbm93bk1hcmtlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHR5cGVEaXNhZ3JlZXNXaXRoQmxvYjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNob3J0SGFzaGVkSGFzaDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21hdGNoS25vd25Ib3N0cycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaCA9IChjb250ZW50czogc3RyaW5nLCBob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgYmxvYjogQnVmZmVyKSA9PlxuXHRcdFx0bWF0Y2hLbm93bkhvc3RzKHBhcnNlS25vd25Ib3N0cyhjb250ZW50cyksIGhvc3QsIHBvcnQsIHJlYWRIb3N0S2V5VHlwZShibG9iKSEsIGJsb2IpO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcywgbWlzbWF0Y2hlcyBhbmQgcmVwb3J0cyB1bmtub3duIGhvc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga25vd24gPSBsaW5lKCdleGFtcGxlLmNvbScsIEVEMjU1MTlfQSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXhhY3Q6IG1hdGNoKGtub3duLCAnZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRjYXNlSW5zZW5zaXRpdmU6IG1hdGNoKGtub3duLCAnRVhBTVBMRS5DT00nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRjaGFuZ2VkS2V5OiBtYXRjaChrbm93biwgJ2V4YW1wbGUuY29tJywgMjIsIEVEMjU1MTlfQiksXG5cdFx0XHRcdFx0b3RoZXJIb3N0OiBtYXRjaChrbm93biwgJ290aGVyLmNvbScsIDIyLCBFRDI1NTE5X0EpLFxuXHRcdFx0XHRcdGVtcHR5OiBtYXRjaCgnJywgJ2V4YW1wbGUuY29tJywgMjIsIEVEMjU1MTlfQSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleGFjdDogJ21hdGNoJyxcblx0XHRcdFx0XHRjYXNlSW5zZW5zaXRpdmU6ICdtYXRjaCcsXG5cdFx0XHRcdFx0Y2hhbmdlZEtleTogJ21pc21hdGNoJyxcblx0XHRcdFx0XHRvdGhlckhvc3Q6ICd1bmtub3duJyxcblx0XHRcdFx0XHRlbXB0eTogJ3Vua25vd24nLFxuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3BlcyBtaXNtYXRjaCB0byB0aGUgc2FtZSBrZXkgdHlwZScsICgpID0+IHtcblx0XHRcdC8vIEEgaG9zdCB3aXRoIG9ubHkgYW4gUlNBIGVudHJ5IHRoYXQgcHJlc2VudHMgYW4gZWQyNTUxOSBrZXkgaXNcblx0XHRcdC8vIHVua25vd24sIG5vdCBldmlkZW5jZSBvZiBhbiBhdHRhY2suIFJlcG9ydGluZyBgbWlzbWF0Y2hgIGhlcmVcblx0XHRcdC8vIHdvdWxkIGZpcmUgYSBmYWxzZSBhbGFybSBmb3IgZXZlcnkgUlNBLW9ubHkgdXNlciwgc2luY2Ugc3NoMlxuXHRcdFx0Ly8gbmVnb3RpYXRlcyBlZDI1NTE5IGZpcnN0LlxuXHRcdFx0Y29uc3QgcnNhT25seSA9IGxpbmUoJ2V4YW1wbGUuY29tJywgUlNBX0EpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpZmZlcmVudFR5cGU6IG1hdGNoKHJzYU9ubHksICdleGFtcGxlLmNvbScsIDIyLCBFRDI1NTE5X0EpLFxuXHRcdFx0XHRcdHNhbWVUeXBlOiBtYXRjaChyc2FPbmx5LCAnZXhhbXBsZS5jb20nLCAyMiwgUlNBX0EpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGRpZmZlcmVudFR5cGU6ICd1bmtub3duJywgc2FtZVR5cGU6ICdtYXRjaCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG5vbi1kZWZhdWx0IHBvcnRzIHZpYSB0aGUgYnJhY2tldCBmb3JtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnJhY2tldGVkID0gbGluZSgnW2V4YW1wbGUuY29tXToyMjIyJywgRUQyNTUxOV9BKTtcblx0XHRcdGNvbnN0IGJhcmUgPSBsaW5lKCdleGFtcGxlLmNvbScsIEVEMjU1MTlfQSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJhY2tldGVkT25DdXN0b21Qb3J0OiBtYXRjaChicmFja2V0ZWQsICdleGFtcGxlLmNvbScsIDIyMjIsIEVEMjU1MTlfQSksXG5cdFx0XHRcdFx0YnJhY2tldGVkT25EZWZhdWx0UG9ydDogbWF0Y2goYnJhY2tldGVkLCAnZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRiYXJlT25DdXN0b21Qb3J0OiBtYXRjaChiYXJlLCAnZXhhbXBsZS5jb20nLCAyMjIyLCBFRDI1NTE5X0EpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJhY2tldGVkT25DdXN0b21Qb3J0OiAnbWF0Y2gnLFxuXHRcdFx0XHRcdGJyYWNrZXRlZE9uRGVmYXVsdFBvcnQ6ICd1bmtub3duJyxcblx0XHRcdFx0XHRiYXJlT25DdXN0b21Qb3J0OiAndW5rbm93bicsXG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3VwcG9ydHMgZ2xvYiBwYXR0ZXJucyBhbmQgbmVnYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9iID0gbGluZSgnKi5leGFtcGxlLmNvbScsIEVEMjU1MTlfQSk7XG5cdFx0XHRjb25zdCBuZWdhdGVkID0gbGluZSgnKi5leGFtcGxlLmNvbSwhc2VjcmV0LmV4YW1wbGUuY29tJywgRUQyNTUxOV9BKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRnbG9iTWF0Y2hlczogbWF0Y2goZ2xvYiwgJ2hvc3QuZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRnbG9iTWlzc2VzT3RoZXJEb21haW46IG1hdGNoKGdsb2IsICdob3N0Lm90aGVyLmNvbScsIDIyLCBFRDI1NTE5X0EpLFxuXHRcdFx0XHRcdHNpbmdsZUNoYXI6IG1hdGNoKGxpbmUoJ2hvc3Q/LmV4YW1wbGUuY29tJywgRUQyNTUxOV9BKSwgJ2hvc3QxLmV4YW1wbGUuY29tJywgMjIsIEVEMjU1MTlfQSksXG5cdFx0XHRcdFx0Ly8gQSBuZWdhdGlvbiBtdXN0IHZldG8gdGhlIHdob2xlIGVudHJ5IGV2ZW4gdGhvdWdoIHRoZVxuXHRcdFx0XHRcdC8vIHdpbGRjYXJkIG9uIHRoZSBzYW1lIGxpbmUgYWxzbyBtYXRjaGVzLlxuXHRcdFx0XHRcdG5lZ2F0ZWRIb3N0OiBtYXRjaChuZWdhdGVkLCAnc2VjcmV0LmV4YW1wbGUuY29tJywgMjIsIEVEMjU1MTlfQSksXG5cdFx0XHRcdFx0bm9uTmVnYXRlZEhvc3Q6IG1hdGNoKG5lZ2F0ZWQsICdwdWJsaWMuZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGdsb2JNYXRjaGVzOiAnbWF0Y2gnLFxuXHRcdFx0XHRcdGdsb2JNaXNzZXNPdGhlckRvbWFpbjogJ3Vua25vd24nLFxuXHRcdFx0XHRcdHNpbmdsZUNoYXI6ICdtYXRjaCcsXG5cdFx0XHRcdFx0bmVnYXRlZEhvc3Q6ICd1bmtub3duJyxcblx0XHRcdFx0XHRub25OZWdhdGVkSG9zdDogJ21hdGNoJyxcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGhhc2hlZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2FsdCA9IHJhbmRvbUJ5dGVzKDIwKTtcblx0XHRcdGNvbnN0IGhhc2hlZCA9IGAke2hhc2hlZEhvc3RGaWVsZCgnZXhhbXBsZS5jb20nLCBzYWx0KX0gc3NoLWVkMjU1MTkgJHtFRDI1NTE5X0EudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZUtleTogbWF0Y2goaGFzaGVkLCAnZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRjaGFuZ2VkS2V5OiBtYXRjaChoYXNoZWQsICdleGFtcGxlLmNvbScsIDIyLCBFRDI1NTE5X0IpLFxuXHRcdFx0XHRcdG90aGVySG9zdDogbWF0Y2goaGFzaGVkLCAnb3RoZXIuY29tJywgMjIsIEVEMjU1MTlfQSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgc2FtZUtleTogJ21hdGNoJywgY2hhbmdlZEtleTogJ21pc21hdGNoJywgb3RoZXJIb3N0OiAndW5rbm93bicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXZvY2F0aW9uIG92ZXJyaWRlcyBhbiBvdGhlcndpc2UgbWF0Y2hpbmcgZW50cnknLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgcmV2b2tlZCBrZXkgaXMgYWxzbyBsaXN0ZWQgYXMgdHJ1c3RlZDsgcmV2b2NhdGlvbiBtdXN0IHdpbixcblx0XHRcdC8vIG9yIGFuIGV4cGxpY2l0bHkgcmV2b2tlZCBrZXkgY291bGQgc3RpbGwgYmUgYWNjZXB0ZWQuXG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0bGluZSgnZXhhbXBsZS5jb20nLCBFRDI1NTE5X0EpLFxuXHRcdFx0XHRsaW5lKCdleGFtcGxlLmNvbScsIEVEMjU1MTlfQSwgJ0ByZXZva2VkJyksXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJldm9rZWRLZXk6IG1hdGNoKGNvbnRlbnRzLCAnZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9BKSxcblx0XHRcdFx0XHRvdGhlcktleTogbWF0Y2goY29udGVudHMsICdleGFtcGxlLmNvbScsIDIyLCBFRDI1NTE5X0IpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHJldm9rZWRLZXk6ICdyZXZva2VkJywgb3RoZXJLZXk6ICdtaXNtYXRjaCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGNhLW9ubHkgd2hlbiB0aGUgaG9zdCBpcyBjb3ZlcmVkIHNvbGVseSBieSBhIGNlcnQgYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2EgPSBsaW5lKCcqLmV4YW1wbGUuY29tJywgRUQyNTUxOV9BLCAnQGNlcnQtYXV0aG9yaXR5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2FPbmx5OiBtYXRjaChjYSwgJ2hvc3QuZXhhbXBsZS5jb20nLCAyMiwgRUQyNTUxOV9CKSxcblx0XHRcdFx0XHQvLyBBIG5vcm1hbCBlbnRyeSBhbG9uZ3NpZGUgdGhlIENBIGxpbmUgc3RpbGwgZGVjaWRlcy5cblx0XHRcdFx0XHRjYVBsdXNOb3JtYWw6IG1hdGNoKFtjYSwgbGluZSgnaG9zdC5leGFtcGxlLmNvbScsIEVEMjU1MTlfQildLmpvaW4oJ1xcbicpLCAnaG9zdC5leGFtcGxlLmNvbScsIDIyLCBFRDI1NTE5X0IpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGNhT25seTogJ2NhLW9ubHknLCBjYVBsdXNOb3JtYWw6ICdtYXRjaCcgfSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZLG1CQUFtQjtBQUN4QyxTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUdQLFNBQVMsWUFBWSxTQUFpQixVQUEwQjtBQUMvRCxRQUFNLE9BQU8sT0FBTyxLQUFLLFNBQVMsT0FBTztBQUN6QyxRQUFNLFNBQVMsT0FBTyxNQUFNLENBQUM7QUFDN0IsU0FBTyxjQUFjLEtBQUssUUFBUSxDQUFDO0FBQ25DLFFBQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQztBQUMzQixPQUFLLGNBQWMsU0FBUyxRQUFRLENBQUM7QUFDckMsU0FBTyxPQUFPLE9BQU8sQ0FBQyxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDcEQ7QUFFQSxNQUFNLFlBQVksWUFBWSxlQUFlLE9BQU8sTUFB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
