import { FilterType, SortBy } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
class Query {
  constructor(value, sortBy) {
    this.value = value;
    this.sortBy = sortBy;
    this.value = value.trim();
  }
  static suggestions(query, galleryManifest) {
    const commands = ["installed", "updates", "enabled", "disabled", "builtin", "contribute"];
    if (galleryManifest?.capabilities.extensionQuery?.filtering?.some((c) => c.name === FilterType.Featured)) {
      commands.push("featured");
    }
    commands.push(...["mcp", "agentPlugins", "popular", "recommended", "recentlyPublished", "workspaceUnsupported", "deprecated", "sort"]);
    const isCategoriesEnabled = galleryManifest?.capabilities.extensionQuery?.filtering?.some((c) => c.name === FilterType.Category);
    if (isCategoriesEnabled) {
      commands.push("category");
    }
    commands.push(...["tag", "ext", "id", "outdated", "recentlyUpdated", "restartRequired"]);
    const sortCommands = [];
    if (galleryManifest?.capabilities.extensionQuery?.sorting?.some((c) => c.name === SortBy.InstallCount)) {
      sortCommands.push("installs");
    }
    if (galleryManifest?.capabilities.extensionQuery?.sorting?.some((c) => c.name === SortBy.WeightedRating)) {
      sortCommands.push("rating");
    }
    sortCommands.push("name", "publishedDate", "updateDate");
    const contributeCommands = [];
    for (const feature of Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures()) {
      contributeCommands.push(feature.id);
    }
    const subcommands = {
      "sort": sortCommands,
      "category": isCategoriesEnabled ? EXTENSION_CATEGORIES.map((c) => `"${c.toLowerCase()}"`) : [],
      "tag": [""],
      "ext": [""],
      "id": [""],
      "contribute": contributeCommands
    };
    const queryContains = (substr) => query.indexOf(substr) > -1;
    const hasSort = subcommands.sort.some((subcommand) => queryContains(`@sort:${subcommand}`));
    const hasCategory = subcommands.category.some((subcommand) => queryContains(`@category:${subcommand}`));
    return commands.flatMap((command) => {
      if (hasSort && command === "sort" || hasCategory && command === "category") {
        return [];
      }
      if (command in subcommands) {
        return subcommands[command].map((subcommand) => `@${command}:${subcommand}${subcommand === "" ? "" : " "}`);
      } else {
        return queryContains(`@${command}`) ? [] : [`@${command} `];
      }
    });
  }
  static parse(value) {
    let sortBy = "";
    value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by, order) => {
      sortBy = by;
      return "";
    });
    return new Query(value, sortBy);
  }
  toString() {
    let result = this.value;
    if (this.sortBy) {
      result = `${result}${result ? " " : ""}@sort:${this.sortBy}`;
    }
    return result;
  }
  isValid() {
    return !/@outdated/.test(this.value);
  }
  equals(other) {
    return this.value === other.value && this.sortBy === other.sortBy;
  }
}
export {
  Query
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGNvbW1vblxcZXh0ZW5zaW9uUXVlcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IEZpbHRlclR5cGUsIFNvcnRCeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0NBVEVHT1JJRVMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgUXVlcnkge1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nLCBwdWJsaWMgc29ydEJ5OiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWUudHJpbSgpO1xuXHR9XG5cblx0c3RhdGljIHN1Z2dlc3Rpb25zKHF1ZXJ5OiBzdHJpbmcsIGdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBzdHJpbmdbXSB7XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IFsnaW5zdGFsbGVkJywgJ3VwZGF0ZXMnLCAnZW5hYmxlZCcsICdkaXNhYmxlZCcsICdidWlsdGluJywgJ2NvbnRyaWJ1dGUnXTtcblx0XHRpZiAoZ2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnk/LmZpbHRlcmluZz8uc29tZShjID0+IGMubmFtZSA9PT0gRmlsdGVyVHlwZS5GZWF0dXJlZCkpIHtcblx0XHRcdGNvbW1hbmRzLnB1c2goJ2ZlYXR1cmVkJyk7XG5cdFx0fVxuXG5cdFx0Y29tbWFuZHMucHVzaCguLi5bJ21jcCcsICdhZ2VudFBsdWdpbnMnLCAncG9wdWxhcicsICdyZWNvbW1lbmRlZCcsICdyZWNlbnRseVB1Ymxpc2hlZCcsICd3b3Jrc3BhY2VVbnN1cHBvcnRlZCcsICdkZXByZWNhdGVkJywgJ3NvcnQnXSk7XG5cdFx0Y29uc3QgaXNDYXRlZ29yaWVzRW5hYmxlZCA9IGdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5Py5maWx0ZXJpbmc/LnNvbWUoYyA9PiBjLm5hbWUgPT09IEZpbHRlclR5cGUuQ2F0ZWdvcnkpO1xuXHRcdGlmIChpc0NhdGVnb3JpZXNFbmFibGVkKSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKCdjYXRlZ29yeScpO1xuXHRcdH1cblxuXHRcdGNvbW1hbmRzLnB1c2goLi4uWyd0YWcnLCAnZXh0JywgJ2lkJywgJ291dGRhdGVkJywgJ3JlY2VudGx5VXBkYXRlZCcsICdyZXN0YXJ0UmVxdWlyZWQnXSk7XG5cdFx0Y29uc3Qgc29ydENvbW1hbmRzID0gW107XG5cdFx0aWYgKGdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5Py5zb3J0aW5nPy5zb21lKGMgPT4gYy5uYW1lID09PSBTb3J0QnkuSW5zdGFsbENvdW50KSkge1xuXHRcdFx0c29ydENvbW1hbmRzLnB1c2goJ2luc3RhbGxzJyk7XG5cdFx0fVxuXHRcdGlmIChnYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeT8uc29ydGluZz8uc29tZShjID0+IGMubmFtZSA9PT0gU29ydEJ5LldlaWdodGVkUmF0aW5nKSkge1xuXHRcdFx0c29ydENvbW1hbmRzLnB1c2goJ3JhdGluZycpO1xuXHRcdH1cblx0XHRzb3J0Q29tbWFuZHMucHVzaCgnbmFtZScsICdwdWJsaXNoZWREYXRlJywgJ3VwZGF0ZURhdGUnKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVDb21tYW5kcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5nZXRFeHRlbnNpb25GZWF0dXJlcygpKSB7XG5cdFx0XHRjb250cmlidXRlQ29tbWFuZHMucHVzaChmZWF0dXJlLmlkKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJjb21tYW5kcyA9IHtcblx0XHRcdCdzb3J0Jzogc29ydENvbW1hbmRzLFxuXHRcdFx0J2NhdGVnb3J5JzogaXNDYXRlZ29yaWVzRW5hYmxlZCA/IEVYVEVOU0lPTl9DQVRFR09SSUVTLm1hcChjID0+IGBcIiR7Yy50b0xvd2VyQ2FzZSgpfVwiYCkgOiBbXSxcblx0XHRcdCd0YWcnOiBbJyddLFxuXHRcdFx0J2V4dCc6IFsnJ10sXG5cdFx0XHQnaWQnOiBbJyddLFxuXHRcdFx0J2NvbnRyaWJ1dGUnOiBjb250cmlidXRlQ29tbWFuZHNcblx0XHR9IGFzIGNvbnN0O1xuXG5cdFx0Y29uc3QgcXVlcnlDb250YWlucyA9IChzdWJzdHI6IHN0cmluZykgPT4gcXVlcnkuaW5kZXhPZihzdWJzdHIpID4gLTE7XG5cdFx0Y29uc3QgaGFzU29ydCA9IHN1YmNvbW1hbmRzLnNvcnQuc29tZShzdWJjb21tYW5kID0+IHF1ZXJ5Q29udGFpbnMoYEBzb3J0OiR7c3ViY29tbWFuZH1gKSk7XG5cdFx0Y29uc3QgaGFzQ2F0ZWdvcnkgPSBzdWJjb21tYW5kcy5jYXRlZ29yeS5zb21lKHN1YmNvbW1hbmQgPT4gcXVlcnlDb250YWlucyhgQGNhdGVnb3J5OiR7c3ViY29tbWFuZH1gKSk7XG5cblx0XHRyZXR1cm4gY29tbWFuZHMuZmxhdE1hcChjb21tYW5kID0+IHtcblx0XHRcdGlmIChoYXNTb3J0ICYmIGNvbW1hbmQgPT09ICdzb3J0JyB8fCBoYXNDYXRlZ29yeSAmJiBjb21tYW5kID09PSAnY2F0ZWdvcnknKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGlmIChjb21tYW5kIGluIHN1YmNvbW1hbmRzKSB7XG5cdFx0XHRcdHJldHVybiAoc3ViY29tbWFuZHMgYXMgUmVjb3JkPHN0cmluZywgcmVhZG9ubHkgc3RyaW5nW10+KVtjb21tYW5kXVxuXHRcdFx0XHRcdC5tYXAoc3ViY29tbWFuZCA9PiBgQCR7Y29tbWFuZH06JHtzdWJjb21tYW5kfSR7c3ViY29tbWFuZCA9PT0gJycgPyAnJyA6ICcgJ31gKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcXVlcnlDb250YWlucyhgQCR7Y29tbWFuZH1gKSA/IFtdIDogW2BAJHtjb21tYW5kfSBgXTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHN0YXRpYyBwYXJzZSh2YWx1ZTogc3RyaW5nKTogUXVlcnkge1xuXHRcdGxldCBzb3J0QnkgPSAnJztcblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoL0Bzb3J0OihcXHcrKSgtXFx3Kik/L2csIChtYXRjaCwgYnk6IHN0cmluZywgb3JkZXI6IHN0cmluZykgPT4ge1xuXHRcdFx0c29ydEJ5ID0gYnk7XG5cblx0XHRcdHJldHVybiAnJztcblx0XHR9KTtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHZhbHVlLCBzb3J0QnkpO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy52YWx1ZTtcblxuXHRcdGlmICh0aGlzLnNvcnRCeSkge1xuXHRcdFx0cmVzdWx0ID0gYCR7cmVzdWx0fSR7cmVzdWx0ID8gJyAnIDogJyd9QHNvcnQ6JHt0aGlzLnNvcnRCeX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aXNWYWxpZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIS9Ab3V0ZGF0ZWQvLnRlc3QodGhpcy52YWx1ZSk7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFF1ZXJ5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlICYmIHRoaXMuc29ydEJ5ID09PSBvdGhlci5zb3J0Qnk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsWUFBWSxjQUFjO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQThDO0FBRWhELE1BQU0sTUFBTTtBQUFBLEVBRWxCLFlBQW1CLE9BQXNCLFFBQWdCO0FBQXRDO0FBQXNCO0FBQ3hDLFNBQUssUUFBUSxNQUFNLEtBQUs7QUFBQSxFQUN6QjtBQUFBLEVBRUEsT0FBTyxZQUFZLE9BQWUsaUJBQTZEO0FBRTlGLFVBQU0sV0FBVyxDQUFDLGFBQWEsV0FB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
