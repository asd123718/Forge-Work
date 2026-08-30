import { URI } from "../../../base/common/uri.js";
const SshProtocolMatcher = /^([^@:]+@)?([^:]+):/;
const SshUrlMatcher = /^([^@:]+@)?([^:]+):(.+)$/;
const AuthorityMatcher = /^([^@]+@)?([^:]+)(:\d+)?$/;
const SecondLevelDomainMatcher = /([^@:.]+\.[^@:.]+)(:\d+)?$/;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
const AnyButDot = /[^.]/g;
const AllowedSecondLevelDomains = [
  "github.com",
  "bitbucket.org",
  "visualstudio.com",
  "gitlab.com",
  "heroku.com",
  "azurewebsites.net",
  "ibm.com",
  "amazon.com",
  "amazonaws.com",
  "cloudapp.net",
  "rhcloud.com",
  "google.com",
  "azure.com"
];
function stripLowLevelDomains(domain) {
  const match = domain.match(SecondLevelDomainMatcher);
  return match ? match[1] : null;
}
function extractDomain(url) {
  if (url.indexOf("://") === -1) {
    const match = url.match(SshProtocolMatcher);
    if (match) {
      return stripLowLevelDomains(match[2]);
    } else {
      return null;
    }
  }
  try {
    const uri = URI.parse(url);
    if (uri.authority) {
      return stripLowLevelDomains(uri.authority);
    }
  } catch (e) {
  }
  return null;
}
function getDomainsOfRemotes(text, allowedDomains) {
  const domains = /* @__PURE__ */ new Set();
  let match;
  while (match = RemoteMatcher.exec(text)) {
    const domain = extractDomain(match[1]);
    if (domain) {
      domains.add(domain);
    }
  }
  const allowedDomainsSet = new Set(allowedDomains);
  return Array.from(domains).map((key) => allowedDomainsSet.has(key) ? key : key.replace(AnyButDot, "a"));
}
function stripPort(authority) {
  const match = authority.match(AuthorityMatcher);
  return match ? match[2] : null;
}
function normalizeRemote(host, path, stripEndingDotGit) {
  if (host && path) {
    if (stripEndingDotGit && path.endsWith(".git")) {
      path = path.substr(0, path.length - 4);
    }
    return path.indexOf("/") === 0 ? `${host}${path}` : `${host}/${path}`;
  }
  return null;
}
function extractRemote(url, stripEndingDotGit) {
  if (url.indexOf("://") === -1) {
    const match = url.match(SshUrlMatcher);
    if (match) {
      return normalizeRemote(match[2], match[3], stripEndingDotGit);
    }
  }
  try {
    const uri = URI.parse(url);
    if (uri.authority) {
      return normalizeRemote(stripPort(uri.authority), uri.path, stripEndingDotGit);
    }
  } catch (e) {
  }
  return null;
}
function getRemotes(text, stripEndingDotGit = false) {
  const remotes = [];
  let match;
  while (match = RemoteMatcher.exec(text)) {
    const remote = extractRemote(match[1], stripEndingDotGit);
    if (remote) {
      remotes.push(remote);
    }
  }
  return remotes;
}
export {
  AllowedSecondLevelDomains,
  getDomainsOfRemotes,
  getRemotes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxjb25maWdSZW1vdGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuY29uc3QgU3NoUHJvdG9jb2xNYXRjaGVyID0gL14oW15AOl0rQCk/KFteOl0rKTovO1xuY29uc3QgU3NoVXJsTWF0Y2hlciA9IC9eKFteQDpdK0ApPyhbXjpdKyk6KC4rKSQvO1xuY29uc3QgQXV0aG9yaXR5TWF0Y2hlciA9IC9eKFteQF0rQCk/KFteOl0rKSg6XFxkKyk/JC87XG5jb25zdCBTZWNvbmRMZXZlbERvbWFpbk1hdGNoZXIgPSAvKFteQDouXStcXC5bXkA6Ll0rKSg6XFxkKyk/JC87XG5jb25zdCBSZW1vdGVNYXRjaGVyID0gL15cXHMqdXJsXFxzKj1cXHMqKC4rXFxTKVxccyokL21nO1xuY29uc3QgQW55QnV0RG90ID0gL1teLl0vZztcblxuZXhwb3J0IGNvbnN0IEFsbG93ZWRTZWNvbmRMZXZlbERvbWFpbnMgPSBbXG5cdCdnaXRodWIuY29tJyxcblx0J2JpdGJ1Y2tldC5vcmcnLFxuXHQndmlzdWFsc3R1ZGlvLmNvbScsXG5cdCdnaXRsYWIuY29tJyxcblx0J2hlcm9rdS5jb20nLFxuXHQnYXp1cmV3ZWJzaXRlcy5uZXQnLFxuXHQnaWJtLmNvbScsXG5cdCdhbWF6b24uY29tJyxcblx0J2FtYXpvbmF3cy5jb20nLFxuXHQnY2xvdWRhcHAubmV0Jyxcblx0J3JoY2xvdWQuY29tJyxcblx0J2dvb2dsZS5jb20nLFxuXHQnYXp1cmUuY29tJ1xuXTtcblxuZnVuY3Rpb24gc3RyaXBMb3dMZXZlbERvbWFpbnMoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0Y29uc3QgbWF0Y2ggPSBkb21haW4ubWF0Y2goU2Vjb25kTGV2ZWxEb21haW5NYXRjaGVyKTtcblx0cmV0dXJuIG1hdGNoID8gbWF0Y2hbMV0gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0RG9tYWluKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdGlmICh1cmwuaW5kZXhPZignOi8vJykgPT09IC0xKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB1cmwubWF0Y2goU3NoUHJvdG9jb2xNYXRjaGVyKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHJldHVybiBzdHJpcExvd0xldmVsRG9tYWlucyhtYXRjaFsyXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdGlmICh1cmkuYXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gc3RyaXBMb3dMZXZlbERvbWFpbnModXJpLmF1dGhvcml0eSk7XG5cdFx0fVxuXHR9IGNhdGNoIChlKSB7XG5cdFx0Ly8gaWdub3JlIGludmFsaWQgVVJJc1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RG9tYWluc09mUmVtb3Rlcyh0ZXh0OiBzdHJpbmcsIGFsbG93ZWREb21haW5zOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZG9tYWlucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdHdoaWxlIChtYXRjaCA9IFJlbW90ZU1hdGNoZXIuZXhlYyh0ZXh0KSkge1xuXHRcdGNvbnN0IGRvbWFpbiA9IGV4dHJhY3REb21haW4obWF0Y2hbMV0pO1xuXHRcdGlmIChkb21haW4pIHtcblx0XHRcdGRvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgYWxsb3dlZERvbWFpbnNTZXQgPSBuZXcgU2V0KGFsbG93ZWREb21haW5zKTtcblx0cmV0dXJuIEFycmF5LmZyb20oZG9tYWlucylcblx0XHQubWFwKGtleSA9PiBhbGxvd2VkRG9tYWluc1NldC5oYXMoa2V5KSA/IGtleSA6IGtleS5yZXBsYWNlKEFueUJ1dERvdCwgJ2EnKSk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwUG9ydChhdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRjb25zdCBtYXRjaCA9IGF1dGhvcml0eS5tYXRjaChBdXRob3JpdHlNYXRjaGVyKTtcblx0cmV0dXJuIG1hdGNoID8gbWF0Y2hbMl0gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVSZW1vdGUoaG9zdDogc3RyaW5nIHwgbnVsbCwgcGF0aDogc3RyaW5nLCBzdHJpcEVuZGluZ0RvdEdpdDogYm9vbGVhbik6IHN0cmluZyB8IG51bGwge1xuXHRpZiAoaG9zdCAmJiBwYXRoKSB7XG5cdFx0aWYgKHN0cmlwRW5kaW5nRG90R2l0ICYmIHBhdGguZW5kc1dpdGgoJy5naXQnKSkge1xuXHRcdFx0cGF0aCA9IHBhdGguc3Vic3RyKDAsIHBhdGgubGVuZ3RoIC0gNCk7XG5cdFx0fVxuXHRcdHJldHVybiAocGF0aC5pbmRleE9mKCcvJykgPT09IDApID8gYCR7aG9zdH0ke3BhdGh9YCA6IGAke2hvc3R9LyR7cGF0aH1gO1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0UmVtb3RlKHVybDogc3RyaW5nLCBzdHJpcEVuZGluZ0RvdEdpdDogYm9vbGVhbik6IHN0cmluZyB8IG51bGwge1xuXHRpZiAodXJsLmluZGV4T2YoJzovLycpID09PSAtMSkge1xuXHRcdGNvbnN0IG1hdGNoID0gdXJsLm1hdGNoKFNzaFVybE1hdGNoZXIpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZVJlbW90ZShtYXRjaFsyXSwgbWF0Y2hbM10sIHN0cmlwRW5kaW5nRG90R2l0KTtcblx0XHR9XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodXJsKTtcblx0XHRpZiAodXJpLmF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZVJlbW90ZShzdHJpcFBvcnQodXJpLmF1dGhvcml0eSksIHVyaS5wYXRoLCBzdHJpcEVuZGluZ0RvdEdpdCk7XG5cdFx0fVxuXHR9IGNhdGNoIChlKSB7XG5cdFx0Ly8gaWdub3JlIGludmFsaWQgVVJJc1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVtb3Rlcyh0ZXh0OiBzdHJpbmcsIHN0cmlwRW5kaW5nRG90R2l0OiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHJlbW90ZXM6IHN0cmluZ1tdID0gW107XG5cdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0d2hpbGUgKG1hdGNoID0gUmVtb3RlTWF0Y2hlci5leGVjKHRleHQpKSB7XG5cdFx0Y29uc3QgcmVtb3RlID0gZXh0cmFjdFJlbW90ZShtYXRjaFsxXSwgc3RyaXBFbmRpbmdEb3RHaXQpO1xuXHRcdGlmIChyZW1vdGUpIHtcblx0XHRcdHJlbW90ZXMucHVzaChyZW1vdGUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVtb3Rlcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVztBQUVwQixNQUFNLHFCQUFxQjtBQUMzQixNQUFNLGdCQUFnQjtBQUN0QixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLGdCQUFnQjtBQUN0QixNQUFNLFlBQVk7QUFFWCxNQUFNLDRCQUE0QjtBQUFBLEVBQ3hDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFQSxTQUFTLHFCQUFxQixRQUErQjtBQUM1RCxRQUFNLFFBQVEsT0FBTyxNQUFNLHdCQUF3QjtBQUNuRCxTQUFPLFFBQVEsTUFBTSxDQUFDLElBQUk7QUFDM0I7QUFFQSxTQUFTLGNBQWMsS0FBNEI7QUFDbEQsTUFBSSxJQUFJLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFDOUIsVUFBTSxRQUFRLElBQUksTUFBTSxrQkFBa0I7QUFDMUMsUUFBSSxPQUFPO0FBQ1YsYUFBTyxxQkFBcUIsTUFBTSxDQUFDLENBQUM7QUFBQSxJQUNyQyxPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsTUFBSTtBQUNILFVBQU0sTUFBTSxJQUFJLE1BQU0sR0FBRztBQUN6QixRQUFJLElBQUksV0FBVztBQUNsQixhQUFPLHFCQUFxQixJQUFJLFNBQVM7QUFBQSxJQUMxQztBQUFBLEVBQ0QsU0FBUyxHQUFHO0FBQUEsRUFFWjtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsb0JBQW9CLE1BQWMsZ0JBQTZDO0FBQzlGLFFBQU0sVUFBVSxvQkFBSSxJQUFZO0FBQ2hDLE1BQUk7QUFDSixTQUFPLFFBQVEsY0FBYyxLQUFLLElBQUksR0FBRztBQUN4QyxVQUFNLFNBQVMsY0FBYyxNQUFNLENBQUMsQ0FBQztBQUNyQyxRQUFJLFFBQVE7QUFDWCxjQUFRLElBQUksTUFBTTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUVBLFFBQU0sb0JBQW9CLElBQUksSUFBSSxjQUFjO0FBQ2hELFNBQU8sTUFBTSxLQUFLLE9BQU8sRUFDdkIsSUFBSSxTQUFPLGtCQUFrQixJQUFJLEdBQUcsSUFBSSxNQUFNLElBQUksUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM1RTtBQUVBLFNBQVMsVUFBVSxXQUFrQztBQUNwRCxRQUFNLFFBQVEsVUFBVSxNQUFNLGdCQUFnQjtBQUM5QyxTQUFPLFFBQVEsTUFBTSxDQUFDLElBQUk7QUFDM0I7QUFFQSxTQUFTLGdCQUFnQixNQUFxQixNQUFjLG1CQUEyQztBQUN0RyxNQUFJLFFBQVEsTUFBTTtBQUNqQixRQUFJLHFCQUFxQixLQUFLLFNBQVMsTUFBTSxHQUFHO0FBQy9DLGFBQU8sS0FBSyxPQUFPLEdBQUcsS0FBSyxTQUFTLENBQUM7QUFBQSxJQUN0QztBQUNBLFdBQVEsS0FBSyxRQUFRLEdBQUcsTUFBTSxJQUFLLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxHQUFHLElBQUksSUFBSSxJQUFJO0FBQUEsRUFDdEU7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGNBQWMsS0FBYSxtQkFBMkM7QUFDOUUsTUFBSSxJQUFJLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFDOUIsVUFBTSxRQUFRLElBQUksTUFBTSxhQUFhO0FBQ3JDLFFBQUksT0FBTztBQUNWLGFBQU8sZ0JBQWdCLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQjtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUNBLE1BQUk7QUFDSCxVQUFNLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDekIsUUFBSSxJQUFJLFdBQVc7QUFDbEIsYUFBTyxnQkFBZ0IsVUFBVSxJQUFJLFNBQVMsR0FBRyxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFDN0U7QUFBQSxFQUNELFNBQVMsR0FBRztBQUFBLEVBRVo7QUFDQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLFdBQVcsTUFBYyxvQkFBNkIsT0FBaUI7QUFDdEYsUUFBTSxVQUFvQixDQUFDO0FBQzNCLE1BQUk7QUFDSixTQUFPLFFBQVEsY0FBYyxLQUFLLElBQUksR0FBRztBQUN4QyxVQUFNLFNBQVMsY0FBYyxNQUFNLENBQUMsR0FBRyxpQkFBaUI7QUFDeEQsUUFBSSxRQUFRO0FBQ1gsY0FBUSxLQUFLLE1BQU07QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
