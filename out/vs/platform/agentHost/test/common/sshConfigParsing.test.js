import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseSSHConfigHostEntries, parseSSHGOutput } from "../../common/sshConfigParsing.js";
suite("SSH Config Parsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseSSHConfigHostEntries", () => {
    test("extracts simple host entries", () => {
      const config = [
        "Host myserver",
        "	HostName 10.0.0.1",
        "	User admin"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("extracts multiple hosts from a single Host line", () => {
      const config = "Host server1 server2 server3";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["server1", "server2", "server3"]);
    });
    test("extracts hosts from multiple Host directives", () => {
      const config = [
        "Host work",
        "	HostName work.example.com",
        "",
        "Host personal",
        "	HostName home.example.com"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["work", "personal"]);
    });
    test("skips wildcard hosts", () => {
      const config = [
        "Host *",
        "	ForwardAgent yes",
        "",
        "Host myserver",
        "	HostName 10.0.0.1",
        "",
        "Host *.example.com",
        "	User admin"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips negation patterns", () => {
      const config = "Host !internal myserver";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips question mark wildcards", () => {
      const config = "Host server? myserver";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips comment lines", () => {
      const config = [
        "# This is a comment",
        "Host myserver",
        "	# Another comment",
        "	HostName 10.0.0.1"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("strips inline comments from Host values", () => {
      const config = "Host myserver # my favorite server";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("handles empty content", () => {
      assert.deepStrictEqual(parseSSHConfigHostEntries(""), []);
    });
    test("handles content with only comments and blanks", () => {
      const config = [
        "# comment",
        "",
        "  # indented comment",
        ""
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), []);
    });
    test("is case-insensitive for Host keyword", () => {
      const config = [
        "host lower",
        "HOST upper",
        "Host mixed"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["lower", "upper", "mixed"]);
    });
    test("ignores non-Host directives", () => {
      const config = [
        "Host myserver",
        "	HostName 10.0.0.1",
        "	User admin",
        "	Port 2222",
        "	IdentityFile ~/.ssh/mykey",
        "	ForwardAgent yes"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
  });
  suite("parseSSHGOutput", () => {
    test("parses standard ssh -G output", () => {
      const output = [
        "hostname 10.0.0.1",
        "user admin",
        "port 22",
        "identityfile ~/.ssh/id_rsa",
        "identityfile ~/.ssh/id_ed25519",
        "forwardagent no"
      ].join("\n");
      assert.deepStrictEqual(parseSSHGOutput(output), {
        hostname: "10.0.0.1",
        user: "admin",
        port: 22,
        identityFile: ["~/.ssh/id_rsa", "~/.ssh/id_ed25519"],
        identityAgent: void 0,
        forwardAgent: false,
        userKnownHostsFiles: [],
        globalKnownHostsFiles: [],
        strictHostKeyChecking: void 0
      });
    });
    test("parses forwardagent yes", () => {
      const output = [
        "hostname example.com",
        "user root",
        "port 22",
        "forwardagent yes"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.forwardAgent, true);
    });
    test("parses identityagent", () => {
      const output = [
        "hostname example.com",
        "user admin",
        "identityagent //./pipe/pageant.user.1234"
      ].join("\n");
      assert.strictEqual(parseSSHGOutput(output).identityAgent, "//./pipe/pageant.user.1234");
    });
    test("parses non-standard port", () => {
      const output = [
        "hostname example.com",
        "user deploy",
        "port 2222"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.port, 2222);
    });
    test("handles missing user", () => {
      const output = [
        "hostname example.com",
        "port 22"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.user, void 0);
    });
    test("handles empty user", () => {
      const output = [
        "hostname example.com",
        "user ",
        "port 22"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.user, void 0);
    });
    test("defaults port to 22 when missing", () => {
      const output = "hostname example.com\nuser root";
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.port, 22);
    });
    test("collects multiple identity files", () => {
      const output = [
        "hostname example.com",
        "port 22",
        "identityfile ~/.ssh/id_rsa",
        "identityfile ~/.ssh/work_key",
        "identityfile ~/.ssh/id_ed25519"
      ].join("\n");
      assert.deepStrictEqual(parseSSHGOutput(output).identityFile, [
        "~/.ssh/id_rsa",
        "~/.ssh/work_key",
        "~/.ssh/id_ed25519"
      ]);
    });
    test("handles empty output", () => {
      assert.deepStrictEqual(parseSSHGOutput(""), {
        hostname: "",
        user: void 0,
        port: 22,
        identityFile: [],
        identityAgent: void 0,
        forwardAgent: false,
        userKnownHostsFiles: [],
        globalKnownHostsFiles: [],
        strictHostKeyChecking: void 0
      });
    });
    test("splits the known_hosts path lists", () => {
      const output = [
        "userknownhostsfile /home/u/.ssh/known_hosts /home/u/.ssh/known_hosts2",
        "globalknownhostsfile /etc/ssh/ssh_known_hosts /etc/ssh/ssh_known_hosts2"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.deepStrictEqual(
        { user: result.userKnownHostsFiles, global: result.globalKnownHostsFiles },
        {
          user: ["/home/u/.ssh/known_hosts", "/home/u/.ssh/known_hosts2"],
          global: ["/etc/ssh/ssh_known_hosts", "/etc/ssh/ssh_known_hosts2"]
        }
      );
    });
    test("honors quoting in known_hosts path lists", () => {
      const output = 'userknownhostsfile "/home/my user/.ssh/known_hosts" /home/u/other';
      assert.deepStrictEqual(
        parseSSHGOutput(output).userKnownHostsFiles,
        ["/home/my user/.ssh/known_hosts", "/home/u/other"]
      );
    });
    test("normalizes effective StrictHostKeyChecking values and ignores others", () => {
      const parse = (value) => parseSSHGOutput(`stricthostkeychecking ${value}`).strictHostKeyChecking;
      assert.deepStrictEqual(
        {
          effective: {
            ask: parse("ask"),
            acceptNew: parse("accept-new"),
            yes: parse("true"),
            noOrOff: parse("false")
          },
          acceptedAliases: {
            yes: parse("yes"),
            no: parse("no"),
            off: parse("off"),
            uppercase: parse("TRUE")
          },
          // An unrecognized value must not be passed through as if it
          // were a policy we understand.
          bogus: parse("maybe"),
          absent: parseSSHGOutput("").strictHostKeyChecking
        },
        {
          effective: {
            ask: "ask",
            acceptNew: "accept-new",
            yes: "yes",
            noOrOff: "no"
          },
          acceptedAliases: {
            yes: "yes",
            no: "no",
            off: "off",
            uppercase: "yes"
          },
          bogus: void 0,
          absent: void 0
        }
      );
    });
    test("handles values with spaces", () => {
      const output = "hostname my host with spaces\nport 22";
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.hostname, "my host with spaces");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHNzaENvbmZpZ1BhcnNpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcGFyc2VTU0hDb25maWdIb3N0RW50cmllcywgcGFyc2VTU0hHT3V0cHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3NzaENvbmZpZ1BhcnNpbmcuanMnO1xuXG5zdWl0ZSgnU1NIIENvbmZpZyBQYXJzaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgc2ltcGxlIGhvc3QgZW50cmllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IFtcblx0XHRcdFx0J0hvc3QgbXlzZXJ2ZXInLFxuXHRcdFx0XHQnXHRIb3N0TmFtZSAxMC4wLjAuMScsXG5cdFx0XHRcdCdcdFVzZXIgYWRtaW4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBtdWx0aXBsZSBob3N0cyBmcm9tIGEgc2luZ2xlIEhvc3QgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9ICdIb3N0IHNlcnZlcjEgc2VydmVyMiBzZXJ2ZXIzJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ3NlcnZlcjEnLCAnc2VydmVyMicsICdzZXJ2ZXIzJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgaG9zdHMgZnJvbSBtdWx0aXBsZSBIb3N0IGRpcmVjdGl2ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCdIb3N0IHdvcmsnLFxuXHRcdFx0XHQnXHRIb3N0TmFtZSB3b3JrLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdIb3N0IHBlcnNvbmFsJyxcblx0XHRcdFx0J1x0SG9zdE5hbWUgaG9tZS5leGFtcGxlLmNvbScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgWyd3b3JrJywgJ3BlcnNvbmFsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgd2lsZGNhcmQgaG9zdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCdIb3N0IConLFxuXHRcdFx0XHQnXHRGb3J3YXJkQWdlbnQgeWVzJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdIb3N0IG15c2VydmVyJyxcblx0XHRcdFx0J1x0SG9zdE5hbWUgMTAuMC4wLjEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0hvc3QgKi5leGFtcGxlLmNvbScsXG5cdFx0XHRcdCdcdFVzZXIgYWRtaW4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBuZWdhdGlvbiBwYXR0ZXJucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9ICdIb3N0ICFpbnRlcm5hbCBteXNlcnZlcic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgWydteXNlcnZlciddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIHF1ZXN0aW9uIG1hcmsgd2lsZGNhcmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gJ0hvc3Qgc2VydmVyPyBteXNlcnZlcic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgWydteXNlcnZlciddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGNvbW1lbnQgbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCcjIFRoaXMgaXMgYSBjb21tZW50Jyxcblx0XHRcdFx0J0hvc3QgbXlzZXJ2ZXInLFxuXHRcdFx0XHQnXHQjIEFub3RoZXIgY29tbWVudCcsXG5cdFx0XHRcdCdcdEhvc3ROYW1lIDEwLjAuMC4xJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ215c2VydmVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGlubGluZSBjb21tZW50cyBmcm9tIEhvc3QgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gJ0hvc3QgbXlzZXJ2ZXIgIyBteSBmYXZvcml0ZSBzZXJ2ZXInO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoJycpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbnRlbnQgd2l0aCBvbmx5IGNvbW1lbnRzIGFuZCBibGFua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCcjIGNvbW1lbnQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgIyBpbmRlbnRlZCBjb21tZW50Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgY2FzZS1pbnNlbnNpdGl2ZSBmb3IgSG9zdCBrZXl3b3JkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnaG9zdCBsb3dlcicsXG5cdFx0XHRcdCdIT1NUIHVwcGVyJyxcblx0XHRcdFx0J0hvc3QgbWl4ZWQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbG93ZXInLCAndXBwZXInLCAnbWl4ZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1Ib3N0IGRpcmVjdGl2ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCdIb3N0IG15c2VydmVyJyxcblx0XHRcdFx0J1x0SG9zdE5hbWUgMTAuMC4wLjEnLFxuXHRcdFx0XHQnXHRVc2VyIGFkbWluJyxcblx0XHRcdFx0J1x0UG9ydCAyMjIyJyxcblx0XHRcdFx0J1x0SWRlbnRpdHlGaWxlIH4vLnNzaC9teWtleScsXG5cdFx0XHRcdCdcdEZvcndhcmRBZ2VudCB5ZXMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVNTSEdPdXRwdXQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdwYXJzZXMgc3RhbmRhcmQgc3NoIC1HIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J2hvc3RuYW1lIDEwLjAuMC4xJyxcblx0XHRcdFx0J3VzZXIgYWRtaW4nLFxuXHRcdFx0XHQncG9ydCAyMicsXG5cdFx0XHRcdCdpZGVudGl0eWZpbGUgfi8uc3NoL2lkX3JzYScsXG5cdFx0XHRcdCdpZGVudGl0eWZpbGUgfi8uc3NoL2lkX2VkMjU1MTknLFxuXHRcdFx0XHQnZm9yd2FyZGFnZW50IG5vJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hHT3V0cHV0KG91dHB1dCksIHtcblx0XHRcdFx0aG9zdG5hbWU6ICcxMC4wLjAuMScsXG5cdFx0XHRcdHVzZXI6ICdhZG1pbicsXG5cdFx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0XHRpZGVudGl0eUZpbGU6IFsnfi8uc3NoL2lkX3JzYScsICd+Ly5zc2gvaWRfZWQyNTUxOSddLFxuXHRcdFx0XHRpZGVudGl0eUFnZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdGZvcndhcmRBZ2VudDogZmFsc2UsXG5cdFx0XHRcdHVzZXJLbm93bkhvc3RzRmlsZXM6IFtdLFxuXHRcdFx0XHRnbG9iYWxLbm93bkhvc3RzRmlsZXM6IFtdLFxuXHRcdFx0XHRzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGZvcndhcmRhZ2VudCB5ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSBleGFtcGxlLmNvbScsXG5cdFx0XHRcdCd1c2VyIHJvb3QnLFxuXHRcdFx0XHQncG9ydCAyMicsXG5cdFx0XHRcdCdmb3J3YXJkYWdlbnQgeWVzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU1NIR091dHB1dChvdXRwdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5mb3J3YXJkQWdlbnQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGlkZW50aXR5YWdlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSBleGFtcGxlLmNvbScsXG5cdFx0XHRcdCd1c2VyIGFkbWluJyxcblx0XHRcdFx0J2lkZW50aXR5YWdlbnQgLy8uL3BpcGUvcGFnZWFudC51c2VyLjEyMzQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU1NIR091dHB1dChvdXRwdXQpLmlkZW50aXR5QWdlbnQsICcvLy4vcGlwZS9wYWdlYW50LnVzZXIuMTIzNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIG5vbi1zdGFuZGFyZCBwb3J0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQnaG9zdG5hbWUgZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQndXNlciBkZXBsb3knLFxuXHRcdFx0XHQncG9ydCAyMjIyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU1NIR091dHB1dChvdXRwdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wb3J0LCAyMjIyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbWlzc2luZyB1c2VyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQnaG9zdG5hbWUgZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQncG9ydCAyMicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVNTSEdPdXRwdXQob3V0cHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXNlciwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgdXNlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J2hvc3RuYW1lIGV4YW1wbGUuY29tJyxcblx0XHRcdFx0J3VzZXIgJyxcblx0XHRcdFx0J3BvcnQgMjInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTU0hHT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVzZXIsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0cyBwb3J0IHRvIDIyIHdoZW4gbWlzc2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9ICdob3N0bmFtZSBleGFtcGxlLmNvbVxcbnVzZXIgcm9vdCc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVNTSEdPdXRwdXQob3V0cHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucG9ydCwgMjIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29sbGVjdHMgbXVsdGlwbGUgaWRlbnRpdHkgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSBleGFtcGxlLmNvbScsXG5cdFx0XHRcdCdwb3J0IDIyJyxcblx0XHRcdFx0J2lkZW50aXR5ZmlsZSB+Ly5zc2gvaWRfcnNhJyxcblx0XHRcdFx0J2lkZW50aXR5ZmlsZSB+Ly5zc2gvd29ya19rZXknLFxuXHRcdFx0XHQnaWRlbnRpdHlmaWxlIH4vLnNzaC9pZF9lZDI1NTE5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hHT3V0cHV0KG91dHB1dCkuaWRlbnRpdHlGaWxlLCBbXG5cdFx0XHRcdCd+Ly5zc2gvaWRfcnNhJyxcblx0XHRcdFx0J34vLnNzaC93b3JrX2tleScsXG5cdFx0XHRcdCd+Ly5zc2gvaWRfZWQyNTUxOScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSEdPdXRwdXQoJycpLCB7XG5cdFx0XHRcdGhvc3RuYW1lOiAnJyxcblx0XHRcdFx0dXNlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRwb3J0OiAyMixcblx0XHRcdFx0aWRlbnRpdHlGaWxlOiBbXSxcblx0XHRcdFx0aWRlbnRpdHlBZ2VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmb3J3YXJkQWdlbnQ6IGZhbHNlLFxuXHRcdFx0XHR1c2VyS25vd25Ib3N0c0ZpbGVzOiBbXSxcblx0XHRcdFx0Z2xvYmFsS25vd25Ib3N0c0ZpbGVzOiBbXSxcblx0XHRcdFx0c3RyaWN0SG9zdEtleUNoZWNraW5nOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NwbGl0cyB0aGUga25vd25faG9zdHMgcGF0aCBsaXN0cycsICgpID0+IHtcblx0XHRcdC8vIGBzc2ggLUdgIGVtaXRzIHRoZXNlIGFzIG9uZSBzcGFjZS1zZXBhcmF0ZWQgbGluZSwgc28gdHJlYXRpbmcgdGhlXG5cdFx0XHQvLyB2YWx1ZSBhcyBhIHNpbmdsZSBwYXRoIHdvdWxkIHNpbGVudGx5IGxvb2sgaW4gYSBib2d1cyBsb2NhdGlvbi5cblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J3VzZXJrbm93bmhvc3RzZmlsZSAvaG9tZS91Ly5zc2gva25vd25faG9zdHMgL2hvbWUvdS8uc3NoL2tub3duX2hvc3RzMicsXG5cdFx0XHRcdCdnbG9iYWxrbm93bmhvc3RzZmlsZSAvZXRjL3NzaC9zc2hfa25vd25faG9zdHMgL2V0Yy9zc2gvc3NoX2tub3duX2hvc3RzMicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVNTSEdPdXRwdXQob3V0cHV0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgdXNlcjogcmVzdWx0LnVzZXJLbm93bkhvc3RzRmlsZXMsIGdsb2JhbDogcmVzdWx0Lmdsb2JhbEtub3duSG9zdHNGaWxlcyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dXNlcjogWycvaG9tZS91Ly5zc2gva25vd25faG9zdHMnLCAnL2hvbWUvdS8uc3NoL2tub3duX2hvc3RzMiddLFxuXHRcdFx0XHRcdGdsb2JhbDogWycvZXRjL3NzaC9zc2hfa25vd25faG9zdHMnLCAnL2V0Yy9zc2gvc3NoX2tub3duX2hvc3RzMiddLFxuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm9ycyBxdW90aW5nIGluIGtub3duX2hvc3RzIHBhdGggbGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSAndXNlcmtub3duaG9zdHNmaWxlIFwiL2hvbWUvbXkgdXNlci8uc3NoL2tub3duX2hvc3RzXCIgL2hvbWUvdS9vdGhlcic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZVNTSEdPdXRwdXQob3V0cHV0KS51c2VyS25vd25Ib3N0c0ZpbGVzLFxuXHRcdFx0XHRbJy9ob21lL215IHVzZXIvLnNzaC9rbm93bl9ob3N0cycsICcvaG9tZS91L290aGVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyBlZmZlY3RpdmUgU3RyaWN0SG9zdEtleUNoZWNraW5nIHZhbHVlcyBhbmQgaWdub3JlcyBvdGhlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiBwYXJzZVNTSEdPdXRwdXQoYHN0cmljdGhvc3RrZXljaGVja2luZyAke3ZhbHVlfWApLnN0cmljdEhvc3RLZXlDaGVja2luZztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZmZlY3RpdmU6IHtcblx0XHRcdFx0XHRcdGFzazogcGFyc2UoJ2FzaycpLFxuXHRcdFx0XHRcdFx0YWNjZXB0TmV3OiBwYXJzZSgnYWNjZXB0LW5ldycpLFxuXHRcdFx0XHRcdFx0eWVzOiBwYXJzZSgndHJ1ZScpLFxuXHRcdFx0XHRcdFx0bm9Pck9mZjogcGFyc2UoJ2ZhbHNlJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhY2NlcHRlZEFsaWFzZXM6IHtcblx0XHRcdFx0XHRcdHllczogcGFyc2UoJ3llcycpLFxuXHRcdFx0XHRcdFx0bm86IHBhcnNlKCdubycpLFxuXHRcdFx0XHRcdFx0b2ZmOiBwYXJzZSgnb2ZmJyksXG5cdFx0XHRcdFx0XHR1cHBlcmNhc2U6IHBhcnNlKCdUUlVFJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyBBbiB1bnJlY29nbml6ZWQgdmFsdWUgbXVzdCBub3QgYmUgcGFzc2VkIHRocm91Z2ggYXMgaWYgaXRcblx0XHRcdFx0XHQvLyB3ZXJlIGEgcG9saWN5IHdlIHVuZGVyc3RhbmQuXG5cdFx0XHRcdFx0Ym9ndXM6IHBhcnNlKCdtYXliZScpLFxuXHRcdFx0XHRcdGFic2VudDogcGFyc2VTU0hHT3V0cHV0KCcnKS5zdHJpY3RIb3N0S2V5Q2hlY2tpbmcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZmZlY3RpdmU6IHtcblx0XHRcdFx0XHRcdGFzazogJ2FzaycsXG5cdFx0XHRcdFx0XHRhY2NlcHROZXc6ICdhY2NlcHQtbmV3Jyxcblx0XHRcdFx0XHRcdHllczogJ3llcycsXG5cdFx0XHRcdFx0XHRub09yT2ZmOiAnbm8nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWNjZXB0ZWRBbGlhc2VzOiB7XG5cdFx0XHRcdFx0XHR5ZXM6ICd5ZXMnLFxuXHRcdFx0XHRcdFx0bm86ICdubycsXG5cdFx0XHRcdFx0XHRvZmY6ICdvZmYnLFxuXHRcdFx0XHRcdFx0dXBwZXJjYXNlOiAneWVzJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZ3VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YWJzZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB2YWx1ZXMgd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSAnaG9zdG5hbWUgbXkgaG9zdCB3aXRoIHNwYWNlc1xcbnBvcnQgMjInO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTU0hHT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvc3RuYW1lLCAnbXkgaG9zdCB3aXRoIHNwYWNlcycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCLHVCQUF1QjtBQUUzRCxNQUFNLHNCQUFzQixNQUFNO0FB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
