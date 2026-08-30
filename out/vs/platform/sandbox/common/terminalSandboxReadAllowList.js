import { OperatingSystem } from "../../../base/common/platform.js";
import { matchesTerminalSandboxCommandRule } from "./terminalSandboxCommandRules.js";
var TerminalSandboxReadAllowListOperation = /* @__PURE__ */ ((TerminalSandboxReadAllowListOperation2) => {
  TerminalSandboxReadAllowListOperation2["Git"] = "git";
  TerminalSandboxReadAllowListOperation2["Node"] = "node";
  TerminalSandboxReadAllowListOperation2["Rust"] = "rust";
  TerminalSandboxReadAllowListOperation2["Go"] = "go";
  TerminalSandboxReadAllowListOperation2["Python"] = "python";
  TerminalSandboxReadAllowListOperation2["Java"] = "java";
  TerminalSandboxReadAllowListOperation2["Dotnet"] = "dotnet";
  TerminalSandboxReadAllowListOperation2["Nuget"] = "nuget";
  TerminalSandboxReadAllowListOperation2["Msbuild"] = "msbuild";
  TerminalSandboxReadAllowListOperation2["Ruby"] = "ruby";
  TerminalSandboxReadAllowListOperation2["NativeBuild"] = "nativeBuild";
  TerminalSandboxReadAllowListOperation2["Conan"] = "conan";
  TerminalSandboxReadAllowListOperation2["GnuPG"] = "gnupg";
  TerminalSandboxReadAllowListOperation2["Ssh"] = "ssh";
  return TerminalSandboxReadAllowListOperation2;
})(TerminalSandboxReadAllowListOperation || {});
const terminalSandboxReadAllowListKeywordMap = /* @__PURE__ */ new Map([
  ["git", "git" /* Git */],
  ["gh", "git" /* Git */],
  ["gpg", "gnupg" /* GnuPG */],
  ["node", "node" /* Node */],
  ["npm", "node" /* Node */],
  ["npx", "node" /* Node */],
  ["pnpm", "node" /* Node */],
  ["yarn", "node" /* Node */],
  ["corepack", "node" /* Node */],
  ["bun", "node" /* Node */],
  ["deno", "node" /* Node */],
  ["nvm", "node" /* Node */],
  ["volta", "node" /* Node */],
  ["fnm", "node" /* Node */],
  ["asdf", "node" /* Node */],
  ["mise", "node" /* Node */],
  ["cargo", "rust" /* Rust */],
  ["rustc", "rust" /* Rust */],
  ["rustup", "rust" /* Rust */],
  ["go", "go" /* Go */],
  ["gofmt", "go" /* Go */],
  ["python", "python" /* Python */],
  ["python3", "python" /* Python */],
  ["pip", "python" /* Python */],
  ["pip3", "python" /* Python */],
  ["poetry", "python" /* Python */],
  ["uv", "python" /* Python */],
  ["pipx", "python" /* Python */],
  ["pyenv", "python" /* Python */],
  ["java", "java" /* Java */],
  ["javac", "java" /* Java */],
  ["jar", "java" /* Java */],
  ["mvn", "java" /* Java */],
  ["mvnw", "java" /* Java */],
  ["gradle", "java" /* Java */],
  ["gradlew", "java" /* Java */],
  ["sdk", "java" /* Java */],
  ["dotnet", "dotnet" /* Dotnet */],
  ["nuget", "nuget" /* Nuget */],
  ["msbuild", "msbuild" /* Msbuild */],
  ["ruby", "ruby" /* Ruby */],
  ["gem", "ruby" /* Ruby */],
  ["bundle", "ruby" /* Ruby */],
  ["bundler", "ruby" /* Ruby */],
  ["rake", "ruby" /* Ruby */],
  ["rbenv", "ruby" /* Ruby */],
  ["rvm", "ruby" /* Ruby */],
  ["ccache", "nativeBuild" /* NativeBuild */],
  ["sccache", "nativeBuild" /* NativeBuild */],
  ["cmake", "nativeBuild" /* NativeBuild */],
  ["conan", "conan" /* Conan */]
]);
function getTerminalSandboxReadAllowListForOperation(operation, os) {
  if (os === OperatingSystem.Windows) {
    return [];
  }
  switch (operation) {
    case "git" /* Git */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gitconfig",
            "~/.config/gh/config.yml",
            "~/.config/git/config",
            "~/.gitignore",
            "~/.gitignore_global",
            "~/.config/git/ignore",
            "~/.config/git/attributes"
          ];
      }
    case "node" /* Node */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.npm",
            "~/Library/Caches/node",
            "~/Library/Caches/electron",
            "~/Library/Caches/ms-playwright",
            "~/Library/Caches/Yarn",
            "~/Library/Caches/deno",
            "~/Library/pnpm",
            "~/.electron-gyp",
            "~/.node-gyp",
            "~/.yarn/berry",
            "~/.local/share/pnpm",
            "~/.pnpm-store",
            "~/.bun/install/cache",
            "~/.bun/bin",
            "~/.deno",
            "~/.nvm/versions",
            "~/.nvm/alias",
            "~/.volta/bin",
            "~/.volta/tools",
            "~/.fnm",
            "~/.asdf/installs/nodejs",
            "~/.asdf/shims",
            "~/.local/share/mise/installs/node",
            "~/.local/share/mise/shims"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.npm",
            "~/.cache/node",
            "~/.cache/node/corepack",
            "~/.cache/electron",
            "~/.cache/ms-playwright",
            "~/.cache/yarn",
            "~/.electron-gyp",
            "~/.node-gyp",
            "~/.yarn/berry",
            "~/.local/share/pnpm",
            "~/.pnpm-store",
            "~/.bun/install/cache",
            "~/.bun/bin",
            "~/.deno",
            "~/.cache/deno",
            "~/.nvm/versions",
            "~/.nvm/alias",
            "~/.volta/bin",
            "~/.volta/tools",
            "~/.fnm",
            "~/.asdf/installs/nodejs",
            "~/.asdf/shims",
            "~/.local/share/mise/installs/node",
            "~/.local/share/mise/shims"
          ];
      }
    case "rust" /* Rust */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cargo/bin",
            "~/.cargo/registry",
            "~/.cargo/git",
            "~/.rustup/toolchains"
          ];
      }
    case "go" /* Go */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/go/pkg/mod",
            "~/go/bin",
            "~/Library/Caches/go-build"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/go/pkg/mod",
            "~/go/bin",
            "~/.cache/go-build"
          ];
      }
    case "python" /* Python */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/Library/Caches/pip",
            "~/Library/Caches/pypoetry",
            "~/Library/Caches/uv",
            "~/.local/bin",
            "~/.local/share/virtualenv",
            "~/.local/share/pipx",
            "~/.pyenv/versions",
            "~/.pyenv/shims"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cache/pip",
            "~/.cache/pypoetry",
            "~/.cache/uv",
            "~/.local/bin",
            "~/.local/share/virtualenv",
            "~/.local/share/pipx",
            "~/.pyenv/versions",
            "~/.pyenv/shims"
          ];
      }
    case "java" /* Java */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.m2/repository",
            "~/.gradle/caches",
            "~/.gradle/wrapper/dists",
            "~/.sdkman/candidates"
          ];
      }
    case "dotnet" /* Dotnet */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.dotnet"
          ];
      }
    case "nuget" /* Nuget */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.nuget/packages",
            "~/Library/Caches/NuGet/v3-cache"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.nuget/packages",
            "~/.local/share/NuGet/v3-cache"
          ];
      }
    case "msbuild" /* Msbuild */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [];
      }
    case "ruby" /* Ruby */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.gem",
            "~/.rbenv/versions",
            "~/.rbenv/shims",
            "~/.rvm/rubies"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gem",
            "~/.rbenv/versions",
            "~/.rbenv/shims",
            "~/.rvm/rubies"
          ];
      }
    case "nativeBuild" /* NativeBuild */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/Library/Caches/ccache",
            "~/Library/Caches/sccache"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cache/ccache",
            "~/.cache/sccache"
          ];
      }
    case "conan" /* Conan */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.conan2/p",
            "~/.conan2/b"
          ];
      }
    case "gnupg" /* GnuPG */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gnupg"
          ];
      }
    case "ssh" /* Ssh */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.ssh"
          ];
      }
  }
}
function getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails) {
  const operations = /* @__PURE__ */ new Set();
  for (const command of commandDetails) {
    for (const rule of terminalSandboxReadAllowListCommandDetailRules) {
      if (matchesTerminalSandboxCommandRule(command, rule, { os })) {
        operations.add(rule.value);
      }
    }
  }
  const paths = [...operations].flatMap((operation) => getTerminalSandboxReadAllowListForOperation(operation, os));
  return [...new Set(paths)];
}
const terminalSandboxReadAllowListCommandDetailRules = [
  {
    keywords: ["gpg", "gpg2"],
    value: "gnupg" /* GnuPG */
  },
  {
    keywords: ["git"],
    value: "gnupg" /* GnuPG */
  },
  {
    keywords: ["git", "ssh", "scp", "sftp", "rsync"],
    value: "ssh" /* Ssh */
  }
];
function getTerminalSandboxReadAllowListForCommands(os, commandKeywords, commandDetails = []) {
  if (commandKeywords.length === 0) {
    return getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails);
  }
  const operations = /* @__PURE__ */ new Set();
  for (const keyword of commandKeywords) {
    const operation = terminalSandboxReadAllowListKeywordMap.get(keyword.toLowerCase());
    if (operation) {
      operations.add(operation);
    }
  }
  const paths = [...operations].flatMap((operation) => getTerminalSandboxReadAllowListForOperation(operation, os));
  return [.../* @__PURE__ */ new Set([...paths, ...getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails)])];
}
export {
  TerminalSandboxReadAllowListOperation,
  getTerminalSandboxReadAllowListForCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2FuZGJveFxcY29tbW9uXFx0ZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxTYW5kYm94Q29tbWFuZCB9IGZyb20gJy4vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZSwgbWF0Y2hlc1Rlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZXMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uIHtcblx0R2l0ID0gJ2dpdCcsXG5cdE5vZGUgPSAnbm9kZScsXG5cdFJ1c3QgPSAncnVzdCcsXG5cdEdvID0gJ2dvJyxcblx0UHl0aG9uID0gJ3B5dGhvbicsXG5cdEphdmEgPSAnamF2YScsXG5cdERvdG5ldCA9ICdkb3RuZXQnLFxuXHROdWdldCA9ICdudWdldCcsXG5cdE1zYnVpbGQgPSAnbXNidWlsZCcsXG5cdFJ1YnkgPSAncnVieScsXG5cdE5hdGl2ZUJ1aWxkID0gJ25hdGl2ZUJ1aWxkJyxcblx0Q29uYW4gPSAnY29uYW4nLFxuXHRHbnVQRyA9ICdnbnVwZycsXG5cdFNzaCA9ICdzc2gnLFxufVxuXG5jb25zdCB0ZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0S2V5d29yZE1hcDogUmVhZG9ubHlNYXA8c3RyaW5nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uPiA9IG5ldyBNYXAoW1xuXHRbJ2dpdCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR2l0XSxcblx0WydnaCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR2l0XSxcblx0WydncGcnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdudVBHXSxcblx0Wydub2RlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0WyducG0nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ25weCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsncG5wbScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsneWFybicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnY29yZXBhY2snLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ2J1bicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnZGVubycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnbnZtJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wyd2b2x0YScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnZm5tJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wydhc2RmJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0WydtaXNlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0WydjYXJnbycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVzdF0sXG5cdFsncnVzdGMnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1c3RdLFxuXHRbJ3J1c3R1cCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVzdF0sXG5cdFsnZ28nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdvXSxcblx0Wydnb2ZtdCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR29dLFxuXHRbJ3B5dGhvbicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUHl0aG9uXSxcblx0WydweXRob24zJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3BpcCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUHl0aG9uXSxcblx0WydwaXAzJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3BvZXRyeScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUHl0aG9uXSxcblx0Wyd1dicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUHl0aG9uXSxcblx0WydwaXB4JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3B5ZW52JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ2phdmEnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ2phdmFjJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5KYXZhXSxcblx0WydqYXInLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ212bicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YV0sXG5cdFsnbXZudycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YV0sXG5cdFsnZ3JhZGxlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5KYXZhXSxcblx0WydncmFkbGV3JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5KYXZhXSxcblx0WydzZGsnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ2RvdG5ldCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uRG90bmV0XSxcblx0WydudWdldCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTnVnZXRdLFxuXHRbJ21zYnVpbGQnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk1zYnVpbGRdLFxuXHRbJ3J1YnknLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1YnldLFxuXHRbJ2dlbScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVieV0sXG5cdFsnYnVuZGxlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0WydidW5kbGVyJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0WydyYWtlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0WydyYmVudicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVieV0sXG5cdFsncnZtJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0WydjY2FjaGUnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5hdGl2ZUJ1aWxkXSxcblx0WydzY2NhY2hlJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5OYXRpdmVCdWlsZF0sXG5cdFsnY21ha2UnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5hdGl2ZUJ1aWxkXSxcblx0Wydjb25hbicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uQ29uYW5dLFxuXSk7XG5cbi8qKlxuICogUGF0aHMgdGhhdCBjb21tb24gZGV2ZWxvcGVyIHRvb2xzIHR5cGljYWxseSBuZWVkIHRvIHJlYWQgd2hlbiB0aGUgdXNlcidzIGhvbWVcbiAqIGRpcmVjdG9yeSBpcyBicm9hZGx5IGRlbmllZC4gQnJvYWQga2V5d29yZC1iYXNlZCBydWxlcyBpbnRlbnRpb25hbGx5IGF2b2lkIG9idmlvdXNcbiAqIGNyZWRlbnRpYWwgYW5kIGtleSBtYXRlcmlhbCBzdWNoIGFzIH4vLnNzaCwgfi8uZ251cGcsIGNsb3VkIGNyZWRlbnRpYWxzLFxuICogcGFja2FnZSBtYW5hZ2VyIGF1dGggZmlsZXMsIGFuZCBnaXQgY3JlZGVudGlhbCBzdG9yZXMuIFNlbnNpdGl2ZSBvcGVyYXRpb25zXG4gKiBzaG91bGQgb25seSBiZSByZWZlcmVuY2VkIGJ5IGNvbW1hbmQtZGV0YWlsIHJ1bGVzIHNjb3BlZCB0byBjb21tYW5kcyBvclxuICogc3ViY29tbWFuZHMgdGhhdCByZXF1aXJlIHRoZW0uXG4gKi9cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvck9wZXJhdGlvbihvcGVyYXRpb246IFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24sIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRzd2l0Y2ggKG9wZXJhdGlvbikge1xuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5HaXQ6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5naXRjb25maWcnLFxuXHRcdFx0XHRcdFx0J34vLmNvbmZpZy9naC9jb25maWcueW1sJyxcblx0XHRcdFx0XHRcdCd+Ly5jb25maWcvZ2l0L2NvbmZpZycsXG5cdFx0XHRcdFx0XHQnfi8uZ2l0aWdub3JlJyxcblx0XHRcdFx0XHRcdCd+Ly5naXRpZ25vcmVfZ2xvYmFsJyxcblx0XHRcdFx0XHRcdCd+Ly5jb25maWcvZ2l0L2lnbm9yZScsXG5cdFx0XHRcdFx0XHQnfi8uY29uZmlnL2dpdC9hdHRyaWJ1dGVzJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGU6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLm5wbScsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9ub2RlJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL2VsZWN0cm9uJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL21zLXBsYXl3cmlnaHQnLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvWWFybicsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9kZW5vJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvcG5wbScsXG5cdFx0XHRcdFx0XHQnfi8uZWxlY3Ryb24tZ3lwJyxcblx0XHRcdFx0XHRcdCd+Ly5ub2RlLWd5cCcsXG5cdFx0XHRcdFx0XHQnfi8ueWFybi9iZXJyeScsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvcG5wbScsXG5cdFx0XHRcdFx0XHQnfi8ucG5wbS1zdG9yZScsXG5cdFx0XHRcdFx0XHQnfi8uYnVuL2luc3RhbGwvY2FjaGUnLFxuXHRcdFx0XHRcdFx0J34vLmJ1bi9iaW4nLFxuXHRcdFx0XHRcdFx0J34vLmRlbm8nLFxuXHRcdFx0XHRcdFx0J34vLm52bS92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ubnZtL2FsaWFzJyxcblx0XHRcdFx0XHRcdCd+Ly52b2x0YS9iaW4nLFxuXHRcdFx0XHRcdFx0J34vLnZvbHRhL3Rvb2xzJyxcblx0XHRcdFx0XHRcdCd+Ly5mbm0nLFxuXHRcdFx0XHRcdFx0J34vLmFzZGYvaW5zdGFsbHMvbm9kZWpzJyxcblx0XHRcdFx0XHRcdCd+Ly5hc2RmL3NoaW1zJyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9taXNlL2luc3RhbGxzL25vZGUnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL21pc2Uvc2hpbXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8ubnBtJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9ub2RlJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9ub2RlL2NvcmVwYWNrJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9lbGVjdHJvbicsXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvbXMtcGxheXdyaWdodCcsXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUveWFybicsXG5cdFx0XHRcdFx0XHQnfi8uZWxlY3Ryb24tZ3lwJyxcblx0XHRcdFx0XHRcdCd+Ly5ub2RlLWd5cCcsXG5cdFx0XHRcdFx0XHQnfi8ueWFybi9iZXJyeScsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvcG5wbScsXG5cdFx0XHRcdFx0XHQnfi8ucG5wbS1zdG9yZScsXG5cdFx0XHRcdFx0XHQnfi8uYnVuL2luc3RhbGwvY2FjaGUnLFxuXHRcdFx0XHRcdFx0J34vLmJ1bi9iaW4nLFxuXHRcdFx0XHRcdFx0J34vLmRlbm8nLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL2Rlbm8nLFxuXHRcdFx0XHRcdFx0J34vLm52bS92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ubnZtL2FsaWFzJyxcblx0XHRcdFx0XHRcdCd+Ly52b2x0YS9iaW4nLFxuXHRcdFx0XHRcdFx0J34vLnZvbHRhL3Rvb2xzJyxcblx0XHRcdFx0XHRcdCd+Ly5mbm0nLFxuXHRcdFx0XHRcdFx0J34vLmFzZGYvaW5zdGFsbHMvbm9kZWpzJyxcblx0XHRcdFx0XHRcdCd+Ly5hc2RmL3NoaW1zJyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9taXNlL2luc3RhbGxzL25vZGUnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL21pc2Uvc2hpbXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVzdDpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLmNhcmdvL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8uY2FyZ28vcmVnaXN0cnknLFxuXHRcdFx0XHRcdFx0J34vLmNhcmdvL2dpdCcsXG5cdFx0XHRcdFx0XHQnfi8ucnVzdHVwL3Rvb2xjaGFpbnMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR286XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vZ28vcGtnL21vZCcsXG5cdFx0XHRcdFx0XHQnfi9nby9iaW4nLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvZ28tYnVpbGQnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi9nby9wa2cvbW9kJyxcblx0XHRcdFx0XHRcdCd+L2dvL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvZ28tYnVpbGQnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUHl0aG9uOlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL3BpcCcsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9weXBvZXRyeScsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy91dicsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvYmluJyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS92aXJ0dWFsZW52Jyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9waXB4Jyxcblx0XHRcdFx0XHRcdCd+Ly5weWVudi92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ucHllbnYvc2hpbXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvcGlwJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9weXBvZXRyeScsXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvdXYnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvdmlydHVhbGVudicsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvcGlweCcsXG5cdFx0XHRcdFx0XHQnfi8ucHllbnYvdmVyc2lvbnMnLFxuXHRcdFx0XHRcdFx0J34vLnB5ZW52L3NoaW1zJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmE6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5tMi9yZXBvc2l0b3J5Jyxcblx0XHRcdFx0XHRcdCd+Ly5ncmFkbGUvY2FjaGVzJyxcblx0XHRcdFx0XHRcdCd+Ly5ncmFkbGUvd3JhcHBlci9kaXN0cycsXG5cdFx0XHRcdFx0XHQnfi8uc2RrbWFuL2NhbmRpZGF0ZXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uRG90bmV0OlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uZG90bmV0Jyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk51Z2V0OlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5udWdldC9wYWNrYWdlcycsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9OdUdldC92My1jYWNoZScsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5udWdldC9wYWNrYWdlcycsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvTnVHZXQvdjMtY2FjaGUnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTXNidWlsZDpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVieTpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uZ2VtJyxcblx0XHRcdFx0XHRcdCd+Ly5yYmVudi92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ucmJlbnYvc2hpbXMnLFxuXHRcdFx0XHRcdFx0J34vLnJ2bS9ydWJpZXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uZ2VtJyxcblx0XHRcdFx0XHRcdCd+Ly5yYmVudi92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ucmJlbnYvc2hpbXMnLFxuXHRcdFx0XHRcdFx0J34vLnJ2bS9ydWJpZXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTmF0aXZlQnVpbGQ6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvY2NhY2hlJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL3NjY2FjaGUnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvY2NhY2hlJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9zY2NhY2hlJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkNvbmFuOlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uY29uYW4yL3AnLFxuXHRcdFx0XHRcdFx0J34vLmNvbmFuMi9iJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdudVBHOlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uZ251cGcnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uU3NoOlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uc3NoJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JDb21tYW5kRGV0YWlscyhvczogT3BlcmF0aW5nU3lzdGVtLCBjb21tYW5kRGV0YWlsczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0Y29uc3Qgb3BlcmF0aW9ucyA9IG5ldyBTZXQ8VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbj4oKTtcblx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmREZXRhaWxzKSB7XG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RDb21tYW5kRGV0YWlsUnVsZXMpIHtcblx0XHRcdGlmIChtYXRjaGVzVGVybWluYWxTYW5kYm94Q29tbWFuZFJ1bGUoY29tbWFuZCwgcnVsZSwgeyBvcyB9KSkge1xuXHRcdFx0XHRvcGVyYXRpb25zLmFkZChydWxlLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb25zdCBwYXRocyA9IFsuLi5vcGVyYXRpb25zXS5mbGF0TWFwKG9wZXJhdGlvbiA9PiBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yT3BlcmF0aW9uKG9wZXJhdGlvbiwgb3MpKTtcblx0cmV0dXJuIFsuLi5uZXcgU2V0KHBhdGhzKV07XG59XG5cbi8qKlxuICogQ29tbWFuZC1kZXRhaWwgYWxsb3ctbGlzdCBydWxlcyBtYXRjaCBwYXJzZWQgY29tbWFuZCBleGVjdXRhYmxlcy5cbiAqXG4gKiBGb3IgZXhhbXBsZSwgYGdpdCByZWJhc2UgbWFpbmAgbWF0Y2hlcyB0aGUgYGdpdGAgcnVsZSBiZWxvdywgd2hpbGVcbiAqIGBncGcgLS1saXN0LWtleXNgIG1hdGNoZXMgdGhlIGBncGdgIHJ1bGUuXG4gKi9cbmNvbnN0IHRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RDb21tYW5kRGV0YWlsUnVsZXM6IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZTxUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uPltdID0gW1xuXHR7XG5cdFx0a2V5d29yZHM6IFsnZ3BnJywgJ2dwZzInXSxcblx0XHR2YWx1ZTogVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5HbnVQRyxcblx0fSxcblx0e1xuXHRcdGtleXdvcmRzOiBbJ2dpdCddLFxuXHRcdHZhbHVlOiBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdudVBHLFxuXHR9LFxuXHR7XG5cdFx0a2V5d29yZHM6IFsnZ2l0JywgJ3NzaCcsICdzY3AnLCAnc2Z0cCcsICdyc3luYyddLFxuXHRcdHZhbHVlOiBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlNzaCxcblx0fSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yQ29tbWFuZHMob3M6IE9wZXJhdGluZ1N5c3RlbSwgY29tbWFuZEtleXdvcmRzOiByZWFkb25seSBzdHJpbmdbXSwgY29tbWFuZERldGFpbHM6IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kW10gPSBbXSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0aWYgKGNvbW1hbmRLZXl3b3Jkcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmREZXRhaWxzKG9zLCBjb21tYW5kRGV0YWlscyk7XG5cdH1cblxuXHRjb25zdCBvcGVyYXRpb25zID0gbmV3IFNldDxUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uPigpO1xuXHRmb3IgKGNvbnN0IGtleXdvcmQgb2YgY29tbWFuZEtleXdvcmRzKSB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEtleXdvcmRNYXAuZ2V0KGtleXdvcmQudG9Mb3dlckNhc2UoKSk7XG5cdFx0aWYgKG9wZXJhdGlvbikge1xuXHRcdFx0b3BlcmF0aW9ucy5hZGQob3BlcmF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBwYXRocyA9IFsuLi5vcGVyYXRpb25zXS5mbGF0TWFwKG9wZXJhdGlvbiA9PiBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yT3BlcmF0aW9uKG9wZXJhdGlvbiwgb3MpKTtcblx0cmV0dXJuIFsuLi5uZXcgU2V0KFsuLi5wYXRocywgLi4uZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmREZXRhaWxzKG9zLCBjb21tYW5kRGV0YWlscyldKV07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUVoQyxTQUEyQyx5Q0FBeUM7QUFFN0UsSUFBVyx3Q0FBWCxrQkFBV0EsMkNBQVg7QUFDTixFQUFBQSx1Q0FBQSxTQUFNO0FBQ04sRUFBQUEsdUNBQUEsVUFBTztBQUNQLEVBQUFBLHVDQUFBLFVBQU87QUFDUCxFQUFBQSx1Q0FBQSxRQUFLO0FBQ0wsRUFBQUEsdUNBQUEsWUFBUztBQUNULEVBQUFBLHVDQUFBLFVBQU87QUFDUCxFQUFBQSx1Q0FBQSxZQUFTO0FBQ1QsRUFBQUEsdUNBQUEsV0FBUTtBQUNSLEVBQUFBLHVDQUFBLGFBQVU7QUFDVixFQUFBQSx1Q0FBQSxVQUFPO0FBQ1AsRUFBQUEsdUNBQUEsaUJBQWM7QUFDZCxFQUFBQSx1Q0FBQSxXQUFRO0FBQ1IsRUFBQUEsdUNBQUEsV0FBUTtBQUNSLEVBQUFBLHVDQUFBLFNBQU07QUFkVyxTQUFBQTtBQUFBLEdBQUE7QUFpQmxCLE1BQU0seUNBQXFHLG9CQUFJLElBQUk7QUFBQSxFQUNsSCxDQUFDLE9BQU8sZUFBeUM7QUFBQSxFQUNqRCxDQUFDLE1BQU0sZUFBeUM7QUFBQSxFQUNoRCxDQUFDLE9BQU8sbUJBQTJDO0FBQUEsRUFDbkQsQ0FBQyxRQUFRLGlCQUEwQztBQUFBLEVBQ25ELENBQUMsT0FBTyxpQkFBMEM7QUFBQSxFQUNsRCxDQUFDLE9BQU8saUJBQTBDO0FBQUEsRUFDbEQsQ0FBQyxRQUFRLGlC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
