var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Schemas } from "../../../../base/common/network.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtensionHostKind, ExtensionRunningPreference, determineExtensionHostKinds } from "./extensionHostKind.js";
import { IExtensionManifestPropertiesService } from "./extensionManifestPropertiesService.js";
import { LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from "./extensionRunningLocation.js";
import { isProposedApiEnabled } from "./extensions.js";
let ExtensionRunningLocationTracker = class {
  constructor(_registry, _extensionHostKindPicker, _environmentService, _configurationService, _logService, _extensionManifestPropertiesService) {
    this._registry = _registry;
    this._extensionHostKindPicker = _extensionHostKindPicker;
    this._environmentService = _environmentService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
    this._runningLocation = new ExtensionIdentifierMap();
    this._maxLocalProcessAffinity = 0;
    this._maxLocalWebWorkerAffinity = 0;
  }
  get maxLocalProcessAffinity() {
    return this._maxLocalProcessAffinity;
  }
  get maxLocalWebWorkerAffinity() {
    return this._maxLocalWebWorkerAffinity;
  }
  set(extensionId, runningLocation) {
    this._runningLocation.set(extensionId, runningLocation);
  }
  readExtensionKinds(extensionDescription) {
    if (extensionDescription.isUnderDevelopment && this._environmentService.extensionDevelopmentKind) {
      return this._environmentService.extensionDevelopmentKind;
    }
    return this._extensionManifestPropertiesService.getExtensionKind(extensionDescription);
  }
  getRunningLocation(extensionId) {
    return this._runningLocation.get(extensionId) || null;
  }
  filterByRunningLocation(extensions, desiredRunningLocation) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
  }
  filterByExtensionHostKind(extensions, desiredExtensionHostKind) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => extRunningLocation.kind === desiredExtensionHostKind);
  }
  filterByExtensionHostManager(extensions, extensionHostManager) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => extensionHostManager.representsRunningLocation(extRunningLocation));
  }
  _computeAffinity(inputExtensions, extensionHostKind, isInitialAllocation) {
    const extensions = new ExtensionIdentifierMap();
    for (const extension of inputExtensions) {
      if (extension.main || extension.browser) {
        extensions.set(extension.identifier, extension);
      }
    }
    for (const extension of this._registry.getAllExtensionDescriptions()) {
      if (extension.main || extension.browser) {
        const runningLocation = this._runningLocation.get(extension.identifier);
        if (runningLocation && runningLocation.kind === extensionHostKind) {
          extensions.set(extension.identifier, extension);
        }
      }
    }
    const groups = new ExtensionIdentifierMap();
    let groupNumber = 0;
    for (const [_, extension] of extensions) {
      groups.set(extension.identifier, ++groupNumber);
    }
    const changeGroup = (from, to) => {
      for (const [key, group] of groups) {
        if (group === from) {
          groups.set(key, to);
        }
      }
    };
    for (const [_, extension] of extensions) {
      if (!extension.extensionDependencies) {
        continue;
      }
      const myGroup = groups.get(extension.identifier);
      for (const depId of extension.extensionDependencies) {
        const depGroup = groups.get(depId);
        if (!depGroup) {
          continue;
        }
        if (depGroup === myGroup) {
          continue;
        }
        changeGroup(depGroup, myGroup);
      }
    }
    for (const [_, extension] of extensions) {
      if (!extension.extensionAffinity) {
        continue;
      }
      if (!isProposedApiEnabled(extension, "extensionAffinity")) {
        this._logService.warn(`Extension '${extension.identifier.value}' declares 'extensionAffinity' in its package.json but does not enable the 'extensionAffinity' API proposal. Add '"enabledApiProposals": ["extensionAffinity"]' to the extension's package.json to use this feature.`);
        continue;
      }
      const myGroup = groups.get(extension.identifier);
      for (const colocateId of extension.extensionAffinity) {
        const colocateGroup = groups.get(colocateId);
        if (!colocateGroup) {
          continue;
        }
        if (colocateGroup === myGroup) {
          continue;
        }
        changeGroup(colocateGroup, myGroup);
      }
    }
    const resultingAffinities = /* @__PURE__ */ new Map();
    let lastAffinity = 0;
    for (const [_, extension] of extensions) {
      const runningLocation = this._runningLocation.get(extension.identifier);
      if (runningLocation) {
        const group = groups.get(extension.identifier);
        resultingAffinities.set(group, runningLocation.affinity);
        lastAffinity = Math.max(lastAffinity, runningLocation.affinity);
      }
    }
    if (!this._environmentService.isExtensionDevelopment) {
      const configuredAffinities = this._configurationService.getValue("extensions.experimental.affinity") || {};
      const configuredExtensionIds = Object.keys(configuredAffinities);
      const configuredAffinityToResultingAffinity = /* @__PURE__ */ new Map();
      for (const extensionId of configuredExtensionIds) {
        const configuredAffinity = configuredAffinities[extensionId];
        if (typeof configuredAffinity !== "number" || configuredAffinity <= 0 || Math.floor(configuredAffinity) !== configuredAffinity) {
          this._logService.info(`Ignoring configured affinity for '${extensionId}' because the value is not a positive integer.`);
          continue;
        }
        const group = groups.get(extensionId);
        if (!group) {
          continue;
        }
        const affinity1 = resultingAffinities.get(group);
        if (affinity1) {
          configuredAffinityToResultingAffinity.set(configuredAffinity, affinity1);
          continue;
        }
        const affinity2 = configuredAffinityToResultingAffinity.get(configuredAffinity);
        if (affinity2) {
          resultingAffinities.set(group, affinity2);
          continue;
        }
        if (!isInitialAllocation) {
          this._logService.info(`Ignoring configured affinity for '${extensionId}' because extension host(s) are already running. Reload window.`);
          continue;
        }
        const affinity3 = ++lastAffinity;
        configuredAffinityToResultingAffinity.set(configuredAffinity, affinity3);
        resultingAffinities.set(group, affinity3);
      }
    }
    const result = new ExtensionIdentifierMap();
    for (const extension of inputExtensions) {
      const group = groups.get(extension.identifier) || 0;
      const affinity = resultingAffinities.get(group) || 0;
      result.set(extension.identifier, affinity);
    }
    if (lastAffinity > 0 && isInitialAllocation) {
      for (let affinity = 1; affinity <= lastAffinity; affinity++) {
        const extensionIds = [];
        for (const extension of inputExtensions) {
          if (result.get(extension.identifier) === affinity) {
            extensionIds.push(extension.identifier);
          }
        }
        this._logService.info(`Placing extension(s) ${extensionIds.map((e) => e.value).join(", ")} on a separate extension host.`);
      }
    }
    return { affinities: result, maxAffinity: lastAffinity };
  }
  computeRunningLocation(localExtensions, remoteExtensions, isInitialAllocation) {
    return this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, isInitialAllocation).runningLocation;
  }
  _doComputeRunningLocation(existingRunningLocation, localExtensions, remoteExtensions, isInitialAllocation) {
    localExtensions = localExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    remoteExtensions = remoteExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    const extensionHostKinds = determineExtensionHostKinds(
      localExtensions,
      remoteExtensions,
      (extension) => this.readExtensionKinds(extension),
      (extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) => this._extensionHostKindPicker.pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference)
    );
    const extensions = new ExtensionIdentifierMap();
    for (const extension of localExtensions) {
      extensions.set(extension.identifier, extension);
    }
    for (const extension of remoteExtensions) {
      extensions.set(extension.identifier, extension);
    }
    const result = new ExtensionIdentifierMap();
    const localProcessExtensions = [];
    const localWebWorkerExtensions = [];
    for (const [extensionIdKey, extensionHostKind] of extensionHostKinds) {
      let runningLocation = null;
      if (extensionHostKind === ExtensionHostKind.LocalProcess) {
        const extensionDescription = extensions.get(extensionIdKey);
        if (extensionDescription) {
          localProcessExtensions.push(extensionDescription);
        }
      } else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
        const extensionDescription = extensions.get(extensionIdKey);
        if (extensionDescription) {
          localWebWorkerExtensions.push(extensionDescription);
        }
      } else if (extensionHostKind === ExtensionHostKind.Remote) {
        runningLocation = new RemoteRunningLocation();
      }
      result.set(extensionIdKey, runningLocation);
    }
    const { affinities, maxAffinity } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, isInitialAllocation);
    for (const extension of localProcessExtensions) {
      const affinity = affinities.get(extension.identifier) || 0;
      result.set(extension.identifier, new LocalProcessRunningLocation(affinity));
    }
    const { affinities: localWebWorkerAffinities, maxAffinity: maxLocalWebWorkerAffinity } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, isInitialAllocation);
    for (const extension of localWebWorkerExtensions) {
      const affinity = localWebWorkerAffinities.get(extension.identifier) || 0;
      result.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
    }
    for (const [extensionIdKey, runningLocation] of existingRunningLocation) {
      if (runningLocation) {
        result.set(extensionIdKey, runningLocation);
      }
    }
    return { runningLocation: result, maxLocalProcessAffinity: maxAffinity, maxLocalWebWorkerAffinity };
  }
  initializeRunningLocation(localExtensions, remoteExtensions) {
    const { runningLocation, maxLocalProcessAffinity, maxLocalWebWorkerAffinity } = this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, true);
    this._runningLocation = runningLocation;
    this._maxLocalProcessAffinity = maxLocalProcessAffinity;
    this._maxLocalWebWorkerAffinity = maxLocalWebWorkerAffinity;
  }
  /**
   * Returns the running locations for the removed extensions.
   */
  deltaExtensions(toAdd, toRemove) {
    const removedRunningLocation = new ExtensionIdentifierMap();
    for (const extensionId of toRemove) {
      const extensionKey = extensionId;
      removedRunningLocation.set(extensionKey, this._runningLocation.get(extensionKey) || null);
      this._runningLocation.delete(extensionKey);
    }
    this._updateRunningLocationForAddedExtensions(toAdd);
    return removedRunningLocation;
  }
  /**
   * Update `this._runningLocation` with running locations for newly enabled/installed extensions.
   */
  _updateRunningLocationForAddedExtensions(toAdd) {
    const localProcessExtensions = [];
    const localWebWorkerExtensions = [];
    for (const extension of toAdd) {
      const extensionKind = this.readExtensionKinds(extension);
      const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, ExtensionRunningPreference.None);
      let runningLocation = null;
      if (extensionHostKind === ExtensionHostKind.LocalProcess) {
        localProcessExtensions.push(extension);
      } else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
        localWebWorkerExtensions.push(extension);
      } else if (extensionHostKind === ExtensionHostKind.Remote) {
        runningLocation = new RemoteRunningLocation();
      }
      this._runningLocation.set(extension.identifier, runningLocation);
    }
    const { affinities } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, false);
    for (const extension of localProcessExtensions) {
      const affinity = affinities.get(extension.identifier) || 0;
      this._runningLocation.set(extension.identifier, new LocalProcessRunningLocation(affinity));
    }
    const { affinities: webWorkerExtensionsAffinities } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, false);
    for (const extension of localWebWorkerExtensions) {
      const affinity = webWorkerExtensionsAffinities.get(extension.identifier) || 0;
      this._runningLocation.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
    }
  }
};
ExtensionRunningLocationTracker = __decorateClass([
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IExtensionManifestPropertiesService)
], ExtensionRunningLocationTracker);
function filterExtensionDescriptions(extensions, runningLocation, predicate) {
  return extensions.filter((ext) => {
    const extRunningLocation = runningLocation.get(ext.identifier);
    return extRunningLocation && predicate(extRunningLocation);
  });
}
function filterExtensionIdentifiers(extensions, runningLocation, predicate) {
  return extensions.filter((ext) => {
    const extRunningLocation = runningLocation.get(ext);
    return extRunningLocation && predicate(extRunningLocation);
  });
}
export {
  ExtensionRunningLocationTracker,
  filterExtensionDescriptions,
  filterExtensionIdentifiers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXGV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgRXh0ZW5zaW9uSWRlbnRpZmllck1hcCwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZWFkT25seUV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkgfSBmcm9tICcuL2V4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQsIEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLCBJRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIsIGRldGVybWluZUV4dGVuc2lvbkhvc3RLaW5kcyB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdEtpbmQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RNYW5hZ2VyIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0TWFuYWdlcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24sIExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uLCBSZW1vdGVSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyIHtcblxuXHRwcml2YXRlIF9ydW5uaW5nTG9jYXRpb24gPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPigpO1xuXHRwcml2YXRlIF9tYXhMb2NhbFByb2Nlc3NBZmZpbml0eTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eTogbnVtYmVyID0gMDtcblxuXHRwdWJsaWMgZ2V0IG1heExvY2FsUHJvY2Vzc0FmZmluaXR5KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX21heExvY2FsUHJvY2Vzc0FmZmluaXR5O1xuXHR9XG5cblx0cHVibGljIGdldCBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX21heExvY2FsV2ViV29ya2VyQWZmaW5pdHk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyeTogSVJlYWRPbmx5RXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0S2luZFBpY2tlcjogSUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgc2V0KGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbikge1xuXHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5zZXQoZXh0ZW5zaW9uSWQsIHJ1bm5pbmdMb2NhdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgcmVhZEV4dGVuc2lvbktpbmRzKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBFeHRlbnNpb25LaW5kW10ge1xuXHRcdGlmIChleHRlbnNpb25EZXNjcmlwdGlvbi5pc1VuZGVyRGV2ZWxvcG1lbnQgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvbkRldmVsb3BtZW50S2luZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uS2luZChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5nZXQoZXh0ZW5zaW9uSWQpIHx8IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyQnlSdW5uaW5nTG9jYXRpb24oZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGRlc2lyZWRSdW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbik6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdIHtcblx0XHRyZXR1cm4gZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zKGV4dGVuc2lvbnMsIHRoaXMuX3J1bm5pbmdMb2NhdGlvbiwgZXh0UnVubmluZ0xvY2F0aW9uID0+IGRlc2lyZWRSdW5uaW5nTG9jYXRpb24uZXF1YWxzKGV4dFJ1bm5pbmdMb2NhdGlvbikpO1xuXHR9XG5cblx0cHVibGljIGZpbHRlckJ5RXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGRlc2lyZWRFeHRlbnNpb25Ib3N0S2luZDogRXh0ZW5zaW9uSG9zdEtpbmQpOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyhleHRlbnNpb25zLCB0aGlzLl9ydW5uaW5nTG9jYXRpb24sIGV4dFJ1bm5pbmdMb2NhdGlvbiA9PiBleHRSdW5uaW5nTG9jYXRpb24ua2luZCA9PT0gZGVzaXJlZEV4dGVuc2lvbkhvc3RLaW5kKTtcblx0fVxuXG5cdHB1YmxpYyBmaWx0ZXJCeUV4dGVuc2lvbkhvc3RNYW5hZ2VyKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBleHRlbnNpb25Ib3N0TWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRcdHJldHVybiBmaWx0ZXJFeHRlbnNpb25EZXNjcmlwdGlvbnMoZXh0ZW5zaW9ucywgdGhpcy5fcnVubmluZ0xvY2F0aW9uLCBleHRSdW5uaW5nTG9jYXRpb24gPT4gZXh0ZW5zaW9uSG9zdE1hbmFnZXIucmVwcmVzZW50c1J1bm5pbmdMb2NhdGlvbihleHRSdW5uaW5nTG9jYXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVBZmZpbml0eShpbnB1dEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBleHRlbnNpb25Ib3N0S2luZDogRXh0ZW5zaW9uSG9zdEtpbmQsIGlzSW5pdGlhbEFsbG9jYXRpb246IGJvb2xlYW4pOiB7IGFmZmluaXRpZXM6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8bnVtYmVyPjsgbWF4QWZmaW5pdHk6IG51bWJlciB9IHtcblx0XHQvLyBPbmx5IGFuYWx5emUgZXh0ZW5zaW9ucyB0aGF0IGNhbiBleGVjdXRlXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnB1dEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb24ubWFpbiB8fCBleHRlbnNpb24uYnJvd3Nlcikge1xuXHRcdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQWxzbyBhZGQgZXhpc3RpbmcgZXh0ZW5zaW9ucyBvZiB0aGUgc2FtZSBraW5kIHRoYXQgY2FuIGV4ZWN1dGVcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSkge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5tYWluIHx8IGV4dGVuc2lvbi5icm93c2VyKSB7XG5cdFx0XHRcdGNvbnN0IHJ1bm5pbmdMb2NhdGlvbiA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAocnVubmluZ0xvY2F0aW9uICYmIHJ1bm5pbmdMb2NhdGlvbi5raW5kID09PSBleHRlbnNpb25Ib3N0S2luZCkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5pdGlhbGx5LCBlYWNoIGV4dGVuc2lvbiBiZWxvbmdzIHRvIGl0cyBvd24gZ3JvdXBcblx0XHRjb25zdCBncm91cHMgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxudW1iZXI+KCk7XG5cdFx0bGV0IGdyb3VwTnVtYmVyID0gMDtcblx0XHRmb3IgKGNvbnN0IFtfLCBleHRlbnNpb25dIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGdyb3Vwcy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsICsrZ3JvdXBOdW1iZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZUdyb3VwID0gKGZyb206IG51bWJlciwgdG86IG51bWJlcikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBncm91cF0gb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChncm91cCA9PT0gZnJvbSkge1xuXHRcdFx0XHRcdGdyb3Vwcy5zZXQoa2V5LCB0byk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gV2Ugd2lsbCBncm91cCB0aGluZ3MgdG9nZXRoZXIgd2hlbiB0aGVyZSBhcmUgZGVwZW5kZW5jaWVzXG5cdFx0Zm9yIChjb25zdCBbXywgZXh0ZW5zaW9uXSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5leHRlbnNpb25EZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBteUdyb3VwID0gZ3JvdXBzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikhO1xuXHRcdFx0Zm9yIChjb25zdCBkZXBJZCBvZiBleHRlbnNpb24uZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdGNvbnN0IGRlcEdyb3VwID0gZ3JvdXBzLmdldChkZXBJZCk7XG5cdFx0XHRcdGlmICghZGVwR3JvdXApIHtcblx0XHRcdFx0XHQvLyBwcm9iYWJseSBjYW4ndCBleGVjdXRlLCBzbyBpdCBoYXMgbm8gaW1wYWN0XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZGVwR3JvdXAgPT09IG15R3JvdXApIHtcblx0XHRcdFx0XHQvLyBhbHJlYWR5IGluIHRoZSBzYW1lIGdyb3VwXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFuZ2VHcm91cChkZXBHcm91cCwgbXlHcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2Ugd2lsbCBhbHNvIGdyb3VwIHRoaW5ncyB0b2dldGhlciB3aGVuIHRoZXJlIGFyZSBleHRlbnNpb25BZmZpbml0eSBkZWNsYXJhdGlvbnNcblx0XHRmb3IgKGNvbnN0IFtfLCBleHRlbnNpb25dIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLmV4dGVuc2lvbkFmZmluaXR5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdleHRlbnNpb25BZmZpbml0eScpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfScgZGVjbGFyZXMgJ2V4dGVuc2lvbkFmZmluaXR5JyBpbiBpdHMgcGFja2FnZS5qc29uIGJ1dCBkb2VzIG5vdCBlbmFibGUgdGhlICdleHRlbnNpb25BZmZpbml0eScgQVBJIHByb3Bvc2FsLiBBZGQgJ1wiZW5hYmxlZEFwaVByb3Bvc2Fsc1wiOiBbXCJleHRlbnNpb25BZmZpbml0eVwiXScgdG8gdGhlIGV4dGVuc2lvbidzIHBhY2thZ2UuanNvbiB0byB1c2UgdGhpcyBmZWF0dXJlLmApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG15R3JvdXAgPSBncm91cHMuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSE7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbG9jYXRlSWQgb2YgZXh0ZW5zaW9uLmV4dGVuc2lvbkFmZmluaXR5KSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9jYXRlR3JvdXAgPSBncm91cHMuZ2V0KGNvbG9jYXRlSWQpO1xuXHRcdFx0XHRpZiAoIWNvbG9jYXRlR3JvdXApIHtcblx0XHRcdFx0XHQvLyB0aGUgZXh0ZW5zaW9uIGlzIG5vdCBpbnN0YWxsZWQgb3IgY2FuJ3QgZXhlY3V0ZSwgc28gaXQgaGFzIG5vIGltcGFjdFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbG9jYXRlR3JvdXAgPT09IG15R3JvdXApIHtcblx0XHRcdFx0XHQvLyBhbHJlYWR5IGluIHRoZSBzYW1lIGdyb3VwXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFuZ2VHcm91cChjb2xvY2F0ZUdyb3VwLCBteUdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbml0aWFsaXplIHdpdGggZXhpc3RpbmcgYWZmaW5pdGllc1xuXHRcdGNvbnN0IHJlc3VsdGluZ0FmZmluaXRpZXMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRcdGxldCBsYXN0QWZmaW5pdHkgPSAwO1xuXHRcdGZvciAoY29uc3QgW18sIGV4dGVuc2lvbl0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgcnVubmluZ0xvY2F0aW9uID0gdGhpcy5fcnVubmluZ0xvY2F0aW9uLmdldChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRpZiAocnVubmluZ0xvY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikhO1xuXHRcdFx0XHRyZXN1bHRpbmdBZmZpbml0aWVzLnNldChncm91cCwgcnVubmluZ0xvY2F0aW9uLmFmZmluaXR5KTtcblx0XHRcdFx0bGFzdEFmZmluaXR5ID0gTWF0aC5tYXgobGFzdEFmZmluaXR5LCBydW5uaW5nTG9jYXRpb24uYWZmaW5pdHkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdoZW4gZG9pbmcgZXh0ZW5zaW9uIGhvc3QgZGVidWdnaW5nLCB3ZSB3aWxsIGlnbm9yZSB0aGUgY29uZmlndXJlZCBhZmZpbml0eVxuXHRcdC8vIGJlY2F1c2Ugd2UgY2FuIGN1cnJlbnRseSBkZWJ1ZyBhIHNpbmdsZSBleHRlbnNpb24gaG9zdFxuXHRcdGlmICghdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdC8vIEdvIHRocm91Z2ggZWFjaCBjb25maWd1cmVkIGFmZmluaXR5IGFuZCB0cnkgdG8gYWNjb21vZGF0ZSBpdFxuXHRcdFx0Y29uc3QgY29uZmlndXJlZEFmZmluaXRpZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtleHRlbnNpb25JZDogc3RyaW5nXTogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KCdleHRlbnNpb25zLmV4cGVyaW1lbnRhbC5hZmZpbml0eScpIHx8IHt9O1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZEV4dGVuc2lvbklkcyA9IE9iamVjdC5rZXlzKGNvbmZpZ3VyZWRBZmZpbml0aWVzKTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRBZmZpbml0eVRvUmVzdWx0aW5nQWZmaW5pdHkgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiBjb25maWd1cmVkRXh0ZW5zaW9uSWRzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRBZmZpbml0eSA9IGNvbmZpZ3VyZWRBZmZpbml0aWVzW2V4dGVuc2lvbklkXTtcblx0XHRcdFx0aWYgKHR5cGVvZiBjb25maWd1cmVkQWZmaW5pdHkgIT09ICdudW1iZXInIHx8IGNvbmZpZ3VyZWRBZmZpbml0eSA8PSAwIHx8IE1hdGguZmxvb3IoY29uZmlndXJlZEFmZmluaXR5KSAhPT0gY29uZmlndXJlZEFmZmluaXR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBjb25maWd1cmVkIGFmZmluaXR5IGZvciAnJHtleHRlbnNpb25JZH0nIGJlY2F1c2UgdGhlIHZhbHVlIGlzIG5vdCBhIHBvc2l0aXZlIGludGVnZXIuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBncm91cHMuZ2V0KGV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdC8vIFRoZSBleHRlbnNpb24gaXMgbm90IGtub3duIG9yIGNhbm5vdCBleGVjdXRlIGZvciB0aGlzIGV4dGVuc2lvbiBob3N0IGtpbmRcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFmZmluaXR5MSA9IHJlc3VsdGluZ0FmZmluaXRpZXMuZ2V0KGdyb3VwKTtcblx0XHRcdFx0aWYgKGFmZmluaXR5MSkge1xuXHRcdFx0XHRcdC8vIEFmZmluaXR5IGZvciB0aGlzIGdyb3VwIGlzIGFscmVhZHkgZXN0YWJsaXNoZWRcblx0XHRcdFx0XHRjb25maWd1cmVkQWZmaW5pdHlUb1Jlc3VsdGluZ0FmZmluaXR5LnNldChjb25maWd1cmVkQWZmaW5pdHksIGFmZmluaXR5MSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhZmZpbml0eTIgPSBjb25maWd1cmVkQWZmaW5pdHlUb1Jlc3VsdGluZ0FmZmluaXR5LmdldChjb25maWd1cmVkQWZmaW5pdHkpO1xuXHRcdFx0XHRpZiAoYWZmaW5pdHkyKSB7XG5cdFx0XHRcdFx0Ly8gQWZmaW5pdHkgZm9yIHRoaXMgY29uZmlndXJhdGlvbiBpcyBhbHJlYWR5IGVzdGFibGlzaGVkXG5cdFx0XHRcdFx0cmVzdWx0aW5nQWZmaW5pdGllcy5zZXQoZ3JvdXAsIGFmZmluaXR5Mik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzSW5pdGlhbEFsbG9jYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYElnbm9yaW5nIGNvbmZpZ3VyZWQgYWZmaW5pdHkgZm9yICcke2V4dGVuc2lvbklkfScgYmVjYXVzZSBleHRlbnNpb24gaG9zdChzKSBhcmUgYWxyZWFkeSBydW5uaW5nLiBSZWxvYWQgd2luZG93LmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWZmaW5pdHkzID0gKytsYXN0QWZmaW5pdHk7XG5cdFx0XHRcdGNvbmZpZ3VyZWRBZmZpbml0eVRvUmVzdWx0aW5nQWZmaW5pdHkuc2V0KGNvbmZpZ3VyZWRBZmZpbml0eSwgYWZmaW5pdHkzKTtcblx0XHRcdFx0cmVzdWx0aW5nQWZmaW5pdGllcy5zZXQoZ3JvdXAsIGFmZmluaXR5Myk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8bnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGlucHV0RXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBncm91cHMuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSB8fCAwO1xuXHRcdFx0Y29uc3QgYWZmaW5pdHkgPSByZXN1bHRpbmdBZmZpbml0aWVzLmdldChncm91cCkgfHwgMDtcblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGFmZmluaXR5KTtcblx0XHR9XG5cblx0XHRpZiAobGFzdEFmZmluaXR5ID4gMCAmJiBpc0luaXRpYWxBbGxvY2F0aW9uKSB7XG5cdFx0XHRmb3IgKGxldCBhZmZpbml0eSA9IDE7IGFmZmluaXR5IDw9IGxhc3RBZmZpbml0eTsgYWZmaW5pdHkrKykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZHM6IEV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnB1dEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0LmdldChleHRlbnNpb24uaWRlbnRpZmllcikgPT09IGFmZmluaXR5KSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25JZHMucHVzaChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUGxhY2luZyBleHRlbnNpb24ocykgJHtleHRlbnNpb25JZHMubWFwKGUgPT4gZS52YWx1ZSkuam9pbignLCAnKX0gb24gYSBzZXBhcmF0ZSBleHRlbnNpb24gaG9zdC5gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBhZmZpbml0aWVzOiByZXN1bHQsIG1heEFmZmluaXR5OiBsYXN0QWZmaW5pdHkgfTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlUnVubmluZ0xvY2F0aW9uKGxvY2FsRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHJlbW90ZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBpc0luaXRpYWxBbGxvY2F0aW9uOiBib29sZWFuKTogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvQ29tcHV0ZVJ1bm5pbmdMb2NhdGlvbih0aGlzLl9ydW5uaW5nTG9jYXRpb24sIGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgaXNJbml0aWFsQWxsb2NhdGlvbikucnVubmluZ0xvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9Db21wdXRlUnVubmluZ0xvY2F0aW9uKGV4aXN0aW5nUnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+LCBsb2NhbEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgaXNJbml0aWFsQWxsb2NhdGlvbjogYm9vbGVhbik6IHsgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+OyBtYXhMb2NhbFByb2Nlc3NBZmZpbml0eTogbnVtYmVyOyBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5OiBudW1iZXIgfSB7XG5cdFx0Ly8gU2tpcCBleHRlbnNpb25zIHRoYXQgaGF2ZSBhbiBleGlzdGluZyBydW5uaW5nIGxvY2F0aW9uXG5cdFx0bG9jYWxFeHRlbnNpb25zID0gbG9jYWxFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWV4aXN0aW5nUnVubmluZ0xvY2F0aW9uLmhhcyhleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdHJlbW90ZUV4dGVuc2lvbnMgPSByZW1vdGVFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWV4aXN0aW5nUnVubmluZ0xvY2F0aW9uLmhhcyhleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdEtpbmRzID0gZGV0ZXJtaW5lRXh0ZW5zaW9uSG9zdEtpbmRzKFxuXHRcdFx0bG9jYWxFeHRlbnNpb25zLFxuXHRcdFx0cmVtb3RlRXh0ZW5zaW9ucyxcblx0XHRcdChleHRlbnNpb24pID0+IHRoaXMucmVhZEV4dGVuc2lvbktpbmRzKGV4dGVuc2lvbiksXG5cdFx0XHQoZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbktpbmRzLCBpc0luc3RhbGxlZExvY2FsbHksIGlzSW5zdGFsbGVkUmVtb3RlbHksIHByZWZlcmVuY2UpID0+IHRoaXMuX2V4dGVuc2lvbkhvc3RLaW5kUGlja2VyLnBpY2tFeHRlbnNpb25Ib3N0S2luZChleHRlbnNpb25JZCwgZXh0ZW5zaW9uS2luZHMsIGlzSW5zdGFsbGVkTG9jYWxseSwgaXNJbnN0YWxsZWRSZW1vdGVseSwgcHJlZmVyZW5jZSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBsb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb24pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiByZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPigpO1xuXHRcdGNvbnN0IGxvY2FsUHJvY2Vzc0V4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0Y29uc3QgbG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2V4dGVuc2lvbklkS2V5LCBleHRlbnNpb25Ib3N0S2luZF0gb2YgZXh0ZW5zaW9uSG9zdEtpbmRzKSB7XG5cdFx0XHRsZXQgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGlmIChleHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0aW9uID0gZXh0ZW5zaW9ucy5nZXQoZXh0ZW5zaW9uSWRLZXkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRsb2NhbFByb2Nlc3NFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcikge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IGV4dGVuc2lvbnMuZ2V0KGV4dGVuc2lvbklkS2V5KTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0bG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpIHtcblx0XHRcdFx0cnVubmluZ0xvY2F0aW9uID0gbmV3IFJlbW90ZVJ1bm5pbmdMb2NhdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb25JZEtleSwgcnVubmluZ0xvY2F0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFmZmluaXRpZXMsIG1heEFmZmluaXR5IH0gPSB0aGlzLl9jb21wdXRlQWZmaW5pdHkobG9jYWxQcm9jZXNzRXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzLCBpc0luaXRpYWxBbGxvY2F0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBsb2NhbFByb2Nlc3NFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBhZmZpbml0eSA9IGFmZmluaXRpZXMuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSB8fCAwO1xuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllciwgbmV3IExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblx0XHRjb25zdCB7IGFmZmluaXRpZXM6IGxvY2FsV2ViV29ya2VyQWZmaW5pdGllcywgbWF4QWZmaW5pdHk6IG1heExvY2FsV2ViV29ya2VyQWZmaW5pdHkgfSA9IHRoaXMuX2NvbXB1dGVBZmZpbml0eShsb2NhbFdlYldvcmtlckV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyLCBpc0luaXRpYWxBbGxvY2F0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBsb2NhbFdlYldvcmtlckV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGFmZmluaXR5ID0gbG9jYWxXZWJXb3JrZXJBZmZpbml0aWVzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgMDtcblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG5ldyBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBleHRlbnNpb25zIHRoYXQgYWxyZWFkeSBoYXZlIGFuIGV4aXN0aW5nIHJ1bm5pbmcgbG9jYXRpb25cblx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb25JZEtleSwgcnVubmluZ0xvY2F0aW9uXSBvZiBleGlzdGluZ1J1bm5pbmdMb2NhdGlvbikge1xuXHRcdFx0aWYgKHJ1bm5pbmdMb2NhdGlvbikge1xuXHRcdFx0XHRyZXN1bHQuc2V0KGV4dGVuc2lvbklkS2V5LCBydW5uaW5nTG9jYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHJ1bm5pbmdMb2NhdGlvbjogcmVzdWx0LCBtYXhMb2NhbFByb2Nlc3NBZmZpbml0eTogbWF4QWZmaW5pdHksIG1heExvY2FsV2ViV29ya2VyQWZmaW5pdHk6IG1heExvY2FsV2ViV29ya2VyQWZmaW5pdHkgfTtcblx0fVxuXG5cdHB1YmxpYyBpbml0aWFsaXplUnVubmluZ0xvY2F0aW9uKGxvY2FsRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHJlbW90ZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBydW5uaW5nTG9jYXRpb24sIG1heExvY2FsUHJvY2Vzc0FmZmluaXR5LCBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5IH0gPSB0aGlzLl9kb0NvbXB1dGVSdW5uaW5nTG9jYXRpb24odGhpcy5fcnVubmluZ0xvY2F0aW9uLCBsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHRydWUpO1xuXHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbiA9IHJ1bm5pbmdMb2NhdGlvbjtcblx0XHR0aGlzLl9tYXhMb2NhbFByb2Nlc3NBZmZpbml0eSA9IG1heExvY2FsUHJvY2Vzc0FmZmluaXR5O1xuXHRcdHRoaXMuX21heExvY2FsV2ViV29ya2VyQWZmaW5pdHkgPSBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHJ1bm5pbmcgbG9jYXRpb25zIGZvciB0aGUgcmVtb3ZlZCBleHRlbnNpb25zLlxuXHQgKi9cblx0cHVibGljIGRlbHRhRXh0ZW5zaW9ucyh0b0FkZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHRvUmVtb3ZlOiBFeHRlbnNpb25JZGVudGlmaWVyW10pOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+IHtcblx0XHQvLyBSZW1vdmUgb2xkIHJ1bm5pbmcgbG9jYXRpb25cblx0XHRjb25zdCByZW1vdmVkUnVubmluZ0xvY2F0aW9uID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIHRvUmVtb3ZlKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25LZXkgPSBleHRlbnNpb25JZDtcblx0XHRcdHJlbW92ZWRSdW5uaW5nTG9jYXRpb24uc2V0KGV4dGVuc2lvbktleSwgdGhpcy5fcnVubmluZ0xvY2F0aW9uLmdldChleHRlbnNpb25LZXkpIHx8IG51bGwpO1xuXHRcdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9uLmRlbGV0ZShleHRlbnNpb25LZXkpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBuZXcgcnVubmluZyBsb2NhdGlvblxuXHRcdHRoaXMuX3VwZGF0ZVJ1bm5pbmdMb2NhdGlvbkZvckFkZGVkRXh0ZW5zaW9ucyh0b0FkZCk7XG5cblx0XHRyZXR1cm4gcmVtb3ZlZFJ1bm5pbmdMb2NhdGlvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgYHRoaXMuX3J1bm5pbmdMb2NhdGlvbmAgd2l0aCBydW5uaW5nIGxvY2F0aW9ucyBmb3IgbmV3bHkgZW5hYmxlZC9pbnN0YWxsZWQgZXh0ZW5zaW9ucy5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVJ1bm5pbmdMb2NhdGlvbkZvckFkZGVkRXh0ZW5zaW9ucyh0b0FkZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10pOiB2b2lkIHtcblx0XHQvLyBEZXRlcm1pbmUgbmV3IHJ1bm5pbmcgbG9jYXRpb25cblx0XHRjb25zdCBsb2NhbFByb2Nlc3NFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0b0FkZCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMucmVhZEV4dGVuc2lvbktpbmRzKGV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBpc1JlbW90ZSA9IGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdEtpbmQgPSB0aGlzLl9leHRlbnNpb25Ib3N0S2luZFBpY2tlci5waWNrRXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbktpbmQsICFpc1JlbW90ZSwgaXNSZW1vdGUsIEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLk5vbmUpO1xuXHRcdFx0bGV0IHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSG9zdEtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcykge1xuXHRcdFx0XHRsb2NhbFByb2Nlc3NFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uSG9zdEtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyKSB7XG5cdFx0XHRcdGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpIHtcblx0XHRcdFx0cnVubmluZ0xvY2F0aW9uID0gbmV3IFJlbW90ZVJ1bm5pbmdMb2NhdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9uLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgcnVubmluZ0xvY2F0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFmZmluaXRpZXMgfSA9IHRoaXMuX2NvbXB1dGVBZmZpbml0eShsb2NhbFByb2Nlc3NFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MsIGZhbHNlKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBsb2NhbFByb2Nlc3NFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBhZmZpbml0eSA9IGFmZmluaXRpZXMuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSB8fCAwO1xuXHRcdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9uLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgbmV3IExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgYWZmaW5pdGllczogd2ViV29ya2VyRXh0ZW5zaW9uc0FmZmluaXRpZXMgfSA9IHRoaXMuX2NvbXB1dGVBZmZpbml0eShsb2NhbFdlYldvcmtlckV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyLCBmYWxzZSk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBhZmZpbml0eSA9IHdlYldvcmtlckV4dGVuc2lvbnNBZmZpbml0aWVzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgMDtcblx0XHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG5ldyBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4sIHByZWRpY2F0ZTogKGV4dFJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uKSA9PiBib29sZWFuKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRyZXR1cm4gZXh0ZW5zaW9ucy5maWx0ZXIoKGV4dCkgPT4ge1xuXHRcdGNvbnN0IGV4dFJ1bm5pbmdMb2NhdGlvbiA9IHJ1bm5pbmdMb2NhdGlvbi5nZXQoZXh0LmlkZW50aWZpZXIpO1xuXHRcdHJldHVybiBleHRSdW5uaW5nTG9jYXRpb24gJiYgcHJlZGljYXRlKGV4dFJ1bm5pbmdMb2NhdGlvbik7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRXh0ZW5zaW9uSWRlbnRpZmllcnMoZXh0ZW5zaW9uczogcmVhZG9ubHkgRXh0ZW5zaW9uSWRlbnRpZmllcltdLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4sIHByZWRpY2F0ZTogKGV4dFJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uKSA9PiBib29sZWFuKTogRXh0ZW5zaW9uSWRlbnRpZmllcltdIHtcblx0cmV0dXJuIGV4dGVuc2lvbnMuZmlsdGVyKChleHQpID0+IHtcblx0XHRjb25zdCBleHRSdW5uaW5nTG9jYXRpb24gPSBydW5uaW5nTG9jYXRpb24uZ2V0KGV4dCk7XG5cdFx0cmV0dXJuIGV4dFJ1bm5pbmdMb2NhdGlvbiAmJiBwcmVkaWNhdGUoZXh0UnVubmluZ0xvY2F0aW9uKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLDZCQUE2QjtBQUV0QyxTQUE4Qiw4QkFBcUQ7QUFDbkYsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxtQkFBbUIsNEJBQXNELG1DQUFtQztBQUVySCxTQUFTLDJDQUEyQztBQUNwRCxTQUFtQyw2QkFBNkIsK0JBQStCLDZCQUE2QjtBQUM1SCxTQUFTLDRCQUE0QjtBQUU5QixJQUFNLGtDQUFOLE1BQXNDO0FBQUEsRUFjNUMsWUFDa0IsV0FDQSwwQkFDOEIscUJBQ1AsdUJBQ1YsYUFDd0IscUNBQ3JEO0FBTmdCO0FBQ0E7QUFDOEI7QUFDUDtBQUNWO0FBQ3dCO0FBbEJ2RCxTQUFRLG1CQUFtQixJQUFJLHVCQUF3RDtBQUN2RixTQUFRLDJCQUFtQztBQUMzQyxTQUFRLDZCQUFxQztBQUFBLEVBaUJ6QztBQUFBLEVBZkosSUFBVywwQkFBa0M7QUFDNUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyw0QkFBb0M7QUFDOUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBV08sSUFBSSxhQUFrQyxpQkFBMkM7QUFDdkYsU0FBSyxpQkFBaUIsSUFBSSxhQUFhLGVBQWU7QUFBQSxFQUN2RDtBQUFBLEVBRU8sbUJBQW1CLHNCQUE4RDtBQUN2RixR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
