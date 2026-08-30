(async function() {
  performance.mark("code/didStartRenderer");
  const preloadGlobals = window.vscode;
  const safeProcess = preloadGlobals.process;
  function showSplash(configuration2) {
    performance.mark("code/willShowPartsSplash");
    showDefaultSplash(configuration2);
    performance.mark("code/didShowPartsSplash");
  }
  function showDefaultSplash(configuration2) {
    let data = configuration2.partsSplash;
    if (data) {
      if (configuration2.autoDetectHighContrast && configuration2.colorScheme.highContrast) {
        if (configuration2.colorScheme.dark && data.baseTheme !== "hc-black" || !configuration2.colorScheme.dark && data.baseTheme !== "hc-light") {
          data = void 0;
        }
      } else if (configuration2.autoDetectColorScheme) {
        if (configuration2.colorScheme.dark && data.baseTheme !== "vs-dark" || !configuration2.colorScheme.dark && data.baseTheme !== "vs") {
          data = void 0;
        }
      }
    }
    if (data && configuration2.extensionDevelopmentPath) {
      data.layoutInfo = void 0;
    }
    let baseTheme;
    let shellBackground;
    let shellForeground;
    if (data) {
      baseTheme = data.baseTheme;
      shellBackground = data.colorInfo.editorBackground;
      shellForeground = data.colorInfo.foreground;
    } else if (configuration2.autoDetectHighContrast && configuration2.colorScheme.highContrast) {
      if (configuration2.colorScheme.dark) {
        baseTheme = "hc-black";
        shellBackground = "#000000";
        shellForeground = "#FFFFFF";
      } else {
        baseTheme = "hc-light";
        shellBackground = "#FFFFFF";
        shellForeground = "#000000";
      }
    } else if (configuration2.autoDetectColorScheme) {
      if (configuration2.colorScheme.dark) {
        baseTheme = "vs-dark";
        shellBackground = "#1E1E1E";
        shellForeground = "#CCCCCC";
      } else {
        baseTheme = "vs";
        shellBackground = "#FFFFFF";
        shellForeground = "#000000";
      }
    }
    const style = document.createElement("style");
    style.className = "initialShellColors";
    window.document.head.appendChild(style);
    style.textContent = `body {	background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }`;
    if (typeof data?.zoomLevel === "number" && typeof preloadGlobals?.webFrame?.setZoomLevel === "function") {
      preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
    }
    if (data?.layoutInfo) {
      const { layoutInfo, colorInfo } = data;
      const modernUI = layoutInfo.modernUI === true;
      const floatingMargin = 4;
      const floatingOuterMargin = floatingMargin * 2;
      const floatingBorderWidth = 1;
      const splash = document.createElement("div");
      splash.id = "monaco-parts-splash";
      splash.className = baseTheme ?? "vs-dark";
      if (layoutInfo.windowBorder && colorInfo.windowBorder) {
        const borderElement = document.createElement("div");
        borderElement.style.position = "absolute";
        borderElement.style.width = "calc(100vw - 2px)";
        borderElement.style.height = "calc(100vh - 2px)";
        borderElement.style.zIndex = "1";
        borderElement.style.border = `1px solid var(--window-border-color)`;
        borderElement.style.setProperty("--window-border-color", colorInfo.windowBorder);
        if (layoutInfo.windowBorderRadius) {
          borderElement.style.borderRadius = layoutInfo.windowBorderRadius;
        }
        splash.appendChild(borderElement);
      }
      const setBounds = (element, bounds) => {
        element.style.position = "absolute";
        element.style.top = `${bounds.top}px`;
        if (typeof bounds.bottom === "number") {
          element.style.bottom = `${bounds.bottom}px`;
        }
        if (typeof bounds.left === "number") {
          element.style.left = `${bounds.left}px`;
        }
        if (typeof bounds.right === "number") {
          element.style.right = `${bounds.right}px`;
        }
        if (typeof bounds.width === "number") {
          element.style.width = `${bounds.width}px`;
        }
        if (typeof bounds.height === "number") {
          element.style.height = `${bounds.height}px`;
        }
      };
      const setPartBounds = (element, bounds) => {
        element.style.position = "absolute";
        element.style.top = `${bounds.top}px`;
        element.style.left = `${bounds.left}px`;
        element.style.width = `${bounds.width}px`;
        element.style.height = `${bounds.height}px`;
      };
      const applyFloatingCardStyles = (element, backgroundColor) => {
        element.style.boxSizing = "border-box";
        element.style.border = `${floatingBorderWidth}px solid ${colorInfo.agentsPanelBorder ?? colorInfo.editorGroupBorder ?? "transparent"}`;
        element.style.borderRadius = "8px";
        element.style.backgroundColor = backgroundColor ?? colorInfo.editorBackground ?? colorInfo.background;
        element.style.overflow = "hidden";
      };
      const contentTop = layoutInfo.titleBarHeight;
      const contentBottom = layoutInfo.statusBarHeight;
      const contentHeight = `calc(100% - ${contentTop + contentBottom}px)`;
      const activityHeight = modernUI ? `calc(100% - ${contentTop + contentBottom + floatingMargin}px)` : contentHeight;
      if (layoutInfo.auxiliaryBarWidth === Number.MAX_SAFE_INTEGER) {
        layoutInfo.auxiliaryBarWidth = window.innerWidth - layoutInfo.activityBarWidth;
      } else {
        layoutInfo.auxiliaryBarWidth = Math.min(layoutInfo.auxiliaryBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.sideBarWidth));
      }
      layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.auxiliaryBarWidth));
      if (layoutInfo.titleBarHeight > 0) {
        const titleDiv = document.createElement("div");
        titleDiv.style.position = "absolute";
        titleDiv.style.width = "100%";
        titleDiv.style.height = `${layoutInfo.titleBarHeight}px`;
        titleDiv.style.left = "0";
        titleDiv.style.top = "0";
        titleDiv.style.backgroundColor = modernUI ? "transparent" : `${colorInfo.titleBarBackground}`;
        titleDiv.style["-webkit-app-region"] = "drag";
        splash.appendChild(titleDiv);
        if (!modernUI && colorInfo.titleBarBorder) {
          const titleBorder = document.createElement("div");
          titleBorder.style.position = "absolute";
          titleBorder.style.width = "100%";
          titleBorder.style.height = "1px";
          titleBorder.style.left = "0";
          titleBorder.style.bottom = "0";
          titleBorder.style.borderBottom = `1px solid ${colorInfo.titleBarBorder}`;
          titleDiv.appendChild(titleBorder);
        }
      }
      if (layoutInfo.activityBarWidth > 0) {
        const activityDiv = document.createElement("div");
        activityDiv.style.position = "absolute";
        activityDiv.style.width = `${layoutInfo.activityBarWidth}px`;
        activityDiv.style.height = activityHeight;
        activityDiv.style.top = `${contentTop}px`;
        if (layoutInfo.sideBarSide === "left") {
          activityDiv.style.left = "0";
        } else {
          activityDiv.style.right = "0";
        }
        activityDiv.style.backgroundColor = modernUI ? "transparent" : `${colorInfo.activityBarBackground}`;
        splash.appendChild(activityDiv);
        if (!modernUI && colorInfo.activityBarBorder) {
          const activityBorderDiv = document.createElement("div");
          activityBorderDiv.style.position = "absolute";
          activityBorderDiv.style.width = "1px";
          activityBorderDiv.style.height = "100%";
          activityBorderDiv.style.top = "0";
          if (layoutInfo.sideBarSide === "left") {
            activityBorderDiv.style.right = "0";
            activityBorderDiv.style.borderRight = `1px solid ${colorInfo.activityBarBorder}`;
          } else {
            activityBorderDiv.style.left = "0";
            activityBorderDiv.style.borderLeft = `1px solid ${colorInfo.activityBarBorder}`;
          }
          activityDiv.appendChild(activityBorderDiv);
        }
      }
      if (layoutInfo.sideBarWidth > 0) {
        const sideDiv = document.createElement("div");
        if (modernUI && layoutInfo.partBounds?.sideBar) {
          setPartBounds(sideDiv, layoutInfo.partBounds.sideBar);
        } else if (layoutInfo.sideBarSide === "left") {
          setBounds(sideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            left: layoutInfo.activityBarWidth + (modernUI ? floatingMargin : 0),
            width: modernUI ? Math.max(0, layoutInfo.sideBarWidth - floatingOuterMargin - floatingBorderWidth * 2) : layoutInfo.sideBarWidth
          });
        } else {
          setBounds(sideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            right: layoutInfo.activityBarWidth + (modernUI ? floatingMargin : 0),
            width: modernUI ? Math.max(0, layoutInfo.sideBarWidth - floatingOuterMargin - floatingBorderWidth * 2) : layoutInfo.sideBarWidth
          });
        }
        if (modernUI) {
          applyFloatingCardStyles(sideDiv, colorInfo.agentsPanelBackground ?? colorInfo.sideBarBackground);
        } else {
          sideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
        }
        splash.appendChild(sideDiv);
        if (!modernUI && colorInfo.sideBarBorder) {
          const sideBorderDiv = document.createElement("div");
          sideBorderDiv.style.position = "absolute";
          sideBorderDiv.style.width = "1px";
          sideBorderDiv.style.height = "100%";
          sideBorderDiv.style.top = "0";
          sideBorderDiv.style.right = "0";
          if (layoutInfo.sideBarSide === "left") {
            sideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
          } else {
            sideBorderDiv.style.left = "0";
            sideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
          }
          sideDiv.appendChild(sideBorderDiv);
        }
      }
      if (layoutInfo.auxiliaryBarWidth > 0) {
        const auxSideDiv = document.createElement("div");
        if (modernUI && layoutInfo.partBounds?.auxiliaryBar) {
          setPartBounds(auxSideDiv, layoutInfo.partBounds.auxiliaryBar);
        } else if (layoutInfo.sideBarSide === "left") {
          setBounds(auxSideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            right: modernUI ? floatingOuterMargin : 0,
            width: modernUI ? Math.max(0, layoutInfo.auxiliaryBarWidth - floatingOuterMargin - floatingMargin - floatingBorderWidth * 2) : layoutInfo.auxiliaryBarWidth
          });
        } else {
          setBounds(auxSideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            left: modernUI ? floatingOuterMargin : 0,
            width: modernUI ? Math.max(0, layoutInfo.auxiliaryBarWidth - floatingOuterMargin - floatingMargin - floatingBorderWidth * 2) : layoutInfo.auxiliaryBarWidth
          });
        }
        if (modernUI) {
          applyFloatingCardStyles(auxSideDiv, colorInfo.sideBarBackground);
        } else {
          auxSideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
        }
        splash.appendChild(auxSideDiv);
        if (!modernUI && colorInfo.sideBarBorder) {
          const auxSideBorderDiv = document.createElement("div");
          auxSideBorderDiv.style.position = "absolute";
          auxSideBorderDiv.style.width = "1px";
          auxSideBorderDiv.style.height = "100%";
          auxSideBorderDiv.style.top = "0";
          if (layoutInfo.sideBarSide === "left") {
            auxSideBorderDiv.style.left = "0";
            auxSideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
          } else {
            auxSideBorderDiv.style.right = "0";
            auxSideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
          }
          auxSideDiv.appendChild(auxSideBorderDiv);
        }
      }
      if (modernUI && (layoutInfo.partBounds?.editor || !layoutInfo.partBounds)) {
        const editorDiv = document.createElement("div");
        if (layoutInfo.partBounds?.editor) {
          setPartBounds(editorDiv, layoutInfo.partBounds.editor);
        } else {
          const editorLeft = (layoutInfo.sideBarSide === "left" ? layoutInfo.activityBarWidth + layoutInfo.sideBarWidth : layoutInfo.auxiliaryBarWidth) + floatingMargin;
          const editorRight = (layoutInfo.sideBarSide === "left" ? layoutInfo.auxiliaryBarWidth : layoutInfo.activityBarWidth + layoutInfo.sideBarWidth) + floatingMargin;
          setBounds(editorDiv, {
            top: contentTop,
            bottom: contentBottom + floatingMargin,
            left: editorLeft,
            right: editorRight
          });
        }
        applyFloatingCardStyles(editorDiv, colorInfo.editorBackground);
        splash.appendChild(editorDiv);
      }
      if (modernUI && layoutInfo.partBounds?.panel) {
        const panelDiv = document.createElement("div");
        setPartBounds(panelDiv, layoutInfo.partBounds.panel);
        applyFloatingCardStyles(panelDiv, colorInfo.panelBackground ?? colorInfo.editorBackground);
        splash.appendChild(panelDiv);
      }
      if (layoutInfo.statusBarHeight > 0) {
        const statusDiv = document.createElement("div");
        statusDiv.style.position = "absolute";
        statusDiv.style.width = "100%";
        statusDiv.style.height = `${layoutInfo.statusBarHeight}px`;
        statusDiv.style.bottom = "0";
        statusDiv.style.left = "0";
        if (modernUI) {
          statusDiv.style.backgroundColor = "transparent";
        } else if (configuration2.workspace && colorInfo.statusBarBackground) {
          statusDiv.style.backgroundColor = colorInfo.statusBarBackground;
        } else if (!configuration2.workspace && colorInfo.statusBarNoFolderBackground) {
          statusDiv.style.backgroundColor = colorInfo.statusBarNoFolderBackground;
        }
        splash.appendChild(statusDiv);
        if (!modernUI && colorInfo.statusBarBorder) {
          const statusBorderDiv = document.createElement("div");
          statusBorderDiv.style.position = "absolute";
          statusBorderDiv.style.width = "100%";
          statusBorderDiv.style.height = "1px";
          statusBorderDiv.style.top = "0";
          statusBorderDiv.style.borderTop = `1px solid ${colorInfo.statusBarBorder}`;
          statusDiv.appendChild(statusBorderDiv);
        }
      }
      window.document.body.appendChild(splash);
    }
  }
  async function load(options) {
    const configuration2 = await resolveWindowConfiguration();
    options?.beforeImport?.(configuration2);
    const { enableDeveloperKeybindings, removeDeveloperKeybindingsAfterLoad, developerDeveloperKeybindingsDisposable, forceDisableShowDevtoolsOnError } = setupDeveloperKeybindings(configuration2, options);
    setupNLS(configuration2);
    const baseUrl = new URL(`${fileUriFromPath(configuration2.appRoot, { isWindows: safeProcess.platform === "win32", scheme: "vscode-file", fallbackAuthority: "vscode-app" })}/out/`);
    globalThis._VSCODE_FILE_ROOT = baseUrl.toString();
    globalThis._VSCODE_PRODUCT_JSON = { ...configuration2.product };
    setupCSSImportMaps(configuration2, baseUrl);
    try {
      let workbenchUrl;
      if (!!safeProcess.env["VSCODE_DEV"] && globalThis._VSCODE_USE_RELATIVE_IMPORTS) {
        workbenchUrl = "../../../workbench/workbench.desktop.main.js";
      } else {
        workbenchUrl = new URL(`vs/workbench/workbench.desktop.main.js`, baseUrl).href;
      }
      const result2 = await import(workbenchUrl);
      if (developerDeveloperKeybindingsDisposable && removeDeveloperKeybindingsAfterLoad) {
        developerDeveloperKeybindingsDisposable();
      }
      return { result: result2, configuration: configuration2 };
    } catch (error) {
      onUnexpectedError(error, enableDeveloperKeybindings && !forceDisableShowDevtoolsOnError);
      throw error;
    }
  }
  async function resolveWindowConfiguration() {
    const timeout = setTimeout(() => {
      console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`);
    }, 1e4);
    performance.mark("code/willWaitForWindowConfig");
    const configuration2 = await preloadGlobals.context.resolveConfiguration();
    performance.mark("code/didWaitForWindowConfig");
    clearTimeout(timeout);
    return configuration2;
  }
  function setupDeveloperKeybindings(configuration2, options) {
    const {
      forceEnableDeveloperKeybindings,
      disallowReloadKeybinding,
      removeDeveloperKeybindingsAfterLoad,
      forceDisableShowDevtoolsOnError
    } = typeof options?.configureDeveloperSettings === "function" ? options.configureDeveloperSettings(configuration2) : {
      forceEnableDeveloperKeybindings: false,
      disallowReloadKeybinding: false,
      removeDeveloperKeybindingsAfterLoad: false,
      forceDisableShowDevtoolsOnError: false
    };
    const isDev = !!safeProcess.env["VSCODE_DEV"];
    const enableDeveloperKeybindings = Boolean(isDev || forceEnableDeveloperKeybindings);
    let developerDeveloperKeybindingsDisposable = void 0;
    if (enableDeveloperKeybindings) {
      developerDeveloperKeybindingsDisposable = registerDeveloperKeybindings(disallowReloadKeybinding);
    }
    return {
      enableDeveloperKeybindings,
      removeDeveloperKeybindingsAfterLoad,
      developerDeveloperKeybindingsDisposable,
      forceDisableShowDevtoolsOnError
    };
  }
  function registerDeveloperKeybindings(disallowReloadKeybinding) {
    const ipcRenderer = preloadGlobals.ipcRenderer;
    const extractKey = function(e) {
      return [
        e.ctrlKey ? "ctrl-" : "",
        e.metaKey ? "meta-" : "",
        e.altKey ? "alt-" : "",
        e.shiftKey ? "shift-" : "",
        e.keyCode
      ].join("");
    };
    const TOGGLE_DEV_TOOLS_KB = safeProcess.platform === "darwin" ? "meta-alt-73" : "ctrl-shift-73";
    const TOGGLE_DEV_TOOLS_KB_ALT = "123";
    const RELOAD_KB = safeProcess.platform === "darwin" ? "meta-82" : "ctrl-82";
    let listener = function(e) {
      const key = extractKey(e);
      if (key === TOGGLE_DEV_TOOLS_KB || key === TOGGLE_DEV_TOOLS_KB_ALT) {
        ipcRenderer.send("vscode:toggleDevTools");
      } else if (key === RELOAD_KB && !disallowReloadKeybinding) {
        ipcRenderer.send("vscode:reloadWindow");
      }
    };
    window.addEventListener("keydown", listener);
    return function() {
      if (listener) {
        window.removeEventListener("keydown", listener);
        listener = void 0;
      }
    };
  }
  function setupNLS(configuration2) {
    globalThis._VSCODE_NLS_MESSAGES = configuration2.nls.messages;
    globalThis._VSCODE_NLS_LANGUAGE = configuration2.nls.language;
    let language = configuration2.nls.language || "en";
    if (language === "zh-tw") {
      language = "zh-Hant";
    } else if (language === "zh-cn") {
      language = "zh-Hans";
    }
    window.document.documentElement.setAttribute("lang", language);
  }
  function onUnexpectedError(error, showDevtoolsOnError) {
    if (showDevtoolsOnError) {
      const ipcRenderer = preloadGlobals.ipcRenderer;
      ipcRenderer.send("vscode:openDevTools");
    }
    console.error(`[uncaught exception]: ${error}`);
    if (error && typeof error !== "string" && error.stack) {
      console.error(error.stack);
    }
  }
  function fileUriFromPath(path, config) {
    let pathName = path.replace(/\\/g, "/");
    if (pathName.length > 0 && pathName.charAt(0) !== "/") {
      pathName = `/${pathName}`;
    }
    let uri;
    if (config.isWindows && pathName.startsWith("//")) {
      uri = encodeURI(`${config.scheme || "file"}:${pathName}`);
    } else {
      uri = encodeURI(`${config.scheme || "file"}://${config.fallbackAuthority || ""}${pathName}`);
    }
    return uri.replace(/#/g, "%23");
  }
  function setupCSSImportMaps(configuration2, baseUrl) {
    if (globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP) {
      return;
    }
    if (Array.isArray(configuration2.cssModules) && configuration2.cssModules.length > 0) {
      performance.mark("code/willAddCssLoader");
      globalThis._VSCODE_CSS_LOAD = function(url) {
        const link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("type", "text/css");
        link.setAttribute("href", url);
        window.document.head.appendChild(link);
      };
      const importMap = { imports: {} };
      for (const cssModule of configuration2.cssModules) {
        const cssUrl = new URL(cssModule, baseUrl).href;
        const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');
`;
        const blob = new Blob([jsSrc], { type: "application/javascript" });
        importMap.imports[cssUrl] = URL.createObjectURL(blob);
      }
      const ttp = window.trustedTypes?.createPolicy("vscode-bootstrapImportMap", { createScript(value) {
        return value;
      } });
      const importMapSrc = JSON.stringify(importMap, void 0, 2);
      const importMapScript = document.createElement("script");
      importMapScript.type = "importmap";
      importMapScript.setAttribute("nonce", "0c6a828f1297");
      importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
      window.document.head.appendChild(importMapScript);
      performance.mark("code/didAddCssLoader");
    }
  }
  const { result, configuration } = await load(
    {
      configureDeveloperSettings: function(windowConfig) {
        return {
          // disable automated devtools opening on error when running extension tests
          // as this can lead to nondeterministic test execution (devtools steals focus)
          forceDisableShowDevtoolsOnError: typeof windowConfig.extensionTestsPath === "string" || windowConfig["enable-smoke-test-driver"] === true,
          // enable devtools keybindings in extension development window
          forceEnableDeveloperKeybindings: Array.isArray(windowConfig.extensionDevelopmentPath) && windowConfig.extensionDevelopmentPath.length > 0,
          removeDeveloperKeybindingsAfterLoad: true
        };
      },
      beforeImport: function(windowConfig) {
        showSplash(windowConfig);
        Object.defineProperty(window, "vscodeWindowId", {
          get: () => windowConfig.windowId
        });
        window.requestIdleCallback(() => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          context?.clearRect(0, 0, canvas.width, canvas.height);
          canvas.remove();
        }, { timeout: 50 });
        performance.mark("code/willLoadWorkbenchMain");
      }
    }
  );
  performance.mark("code/didLoadWorkbenchMain");
  result.main(configuration);
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi1icm93c2VyXFx3b3JrYmVuY2hcXHdvcmtiZW5jaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qIGVzbGludC1kaXNhYmxlIG5vLXJlc3RyaWN0ZWQtZ2xvYmFscyAqL1xuXG4oYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdC8vIEFkZCBhIHBlcmYgZW50cnkgcmlnaHQgZnJvbSB0aGUgdG9wXG5cdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvZGlkU3RhcnRSZW5kZXJlcicpO1xuXG5cdHR5cGUgSVNhbmRib3hDb25maWd1cmF0aW9uID0gaW1wb3J0KCcuLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvY29tbW9uL3NhbmRib3hUeXBlcy5qcycpLklTYW5kYm94Q29uZmlndXJhdGlvbjtcblx0dHlwZSBJTG9hZFJlc3VsdDxNLCBUIGV4dGVuZHMgSVNhbmRib3hDb25maWd1cmF0aW9uPiA9IGltcG9ydCgnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2VsZWN0cm9uLWJyb3dzZXIvd2luZG93LmpzJykuSUxvYWRSZXN1bHQ8TSwgVD47XG5cdHR5cGUgSUxvYWRPcHRpb25zPFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+ID0gaW1wb3J0KCcuLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvZWxlY3Ryb24tYnJvd3Nlci93aW5kb3cuanMnKS5JTG9hZE9wdGlvbnM8VD47XG5cdHR5cGUgSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24gPSBpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LnRzJykuSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb247XG5cdHR5cGUgSU1haW5XaW5kb3dTYW5kYm94R2xvYmFscyA9IGltcG9ydCgnLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvZ2xvYmFscy5qcycpLklNYWluV2luZG93U2FuZGJveEdsb2JhbHM7XG5cdHR5cGUgSURlc2t0b3BNYWluID0gaW1wb3J0KCcuLi8uLi8uLi93b3JrYmVuY2gvZWxlY3Ryb24tYnJvd3Nlci9kZXNrdG9wLm1haW4uanMnKS5JRGVza3RvcE1haW47XG5cblx0Y29uc3QgcHJlbG9hZEdsb2JhbHMgPSAod2luZG93IGFzIHVua25vd24gYXMgeyB2c2NvZGU6IElNYWluV2luZG93U2FuZGJveEdsb2JhbHMgfSkudnNjb2RlOyAvLyBkZWZpbmVkIGJ5IHByZWxvYWQudHNcblx0Y29uc3Qgc2FmZVByb2Nlc3MgPSBwcmVsb2FkR2xvYmFscy5wcm9jZXNzO1xuXG5cdC8vI3JlZ2lvbiBTcGxhc2ggU2NyZWVuIEhlbHBlcnNcblxuXHRmdW5jdGlvbiBzaG93U3BsYXNoKGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uKSB7XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsU2hvd1BhcnRzU3BsYXNoJyk7XG5cdFx0c2hvd0RlZmF1bHRTcGxhc2goY29uZmlndXJhdGlvbik7XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRTaG93UGFydHNTcGxhc2gnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNob3dEZWZhdWx0U3BsYXNoKGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uKSB7XG5cdFx0bGV0IGRhdGEgPSBjb25maWd1cmF0aW9uLnBhcnRzU3BsYXNoO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbi5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ICYmIGNvbmZpZ3VyYXRpb24uY29sb3JTY2hlbWUuaGlnaENvbnRyYXN0KSB7XG5cdFx0XHRcdGlmICgoY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5kYXJrICYmIGRhdGEuYmFzZVRoZW1lICE9PSAnaGMtYmxhY2snKSB8fCAoIWNvbmZpZ3VyYXRpb24uY29sb3JTY2hlbWUuZGFyayAmJiBkYXRhLmJhc2VUaGVtZSAhPT0gJ2hjLWxpZ2h0JykpIHtcblx0XHRcdFx0XHRkYXRhID0gdW5kZWZpbmVkOyAvLyBoaWdoIGNvbnRyYXN0IG1vZGUgaGFzIGJlZW4gdHVybmVkIGJ5IHRoZSBPUyAtPiBpZ25vcmUgc3RvcmVkIGNvbG9ycyBhbmQgbGF5b3V0c1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyYXRpb24uYXV0b0RldGVjdENvbG9yU2NoZW1lKSB7XG5cdFx0XHRcdGlmICgoY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5kYXJrICYmIGRhdGEuYmFzZVRoZW1lICE9PSAndnMtZGFyaycpIHx8ICghY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5kYXJrICYmIGRhdGEuYmFzZVRoZW1lICE9PSAndnMnKSkge1xuXHRcdFx0XHRcdGRhdGEgPSB1bmRlZmluZWQ7IC8vIE9TIGNvbG9yIHNjaGVtZSBpcyB0cmFja2VkIGFuZCBoYXMgY2hhbmdlZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZGV2ZWxvcGluZyBhbiBleHRlbnNpb24gLT4gaWdub3JlIHN0b3JlZCBsYXlvdXRzXG5cdFx0aWYgKGRhdGEgJiYgY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdGRhdGEubGF5b3V0SW5mbyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBtaW5pbWFsIGNvbG9yIGNvbmZpZ3VyYXRpb24gKHdvcmtzIHdpdGggb3Igd2l0aG91dCBwZXJzaXN0ZWQgZGF0YSlcblx0XHRsZXQgYmFzZVRoZW1lO1xuXHRcdGxldCBzaGVsbEJhY2tncm91bmQ7XG5cdFx0bGV0IHNoZWxsRm9yZWdyb3VuZDtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0YmFzZVRoZW1lID0gZGF0YS5iYXNlVGhlbWU7XG5cdFx0XHRzaGVsbEJhY2tncm91bmQgPSBkYXRhLmNvbG9ySW5mby5lZGl0b3JCYWNrZ3JvdW5kO1xuXHRcdFx0c2hlbGxGb3JlZ3JvdW5kID0gZGF0YS5jb2xvckluZm8uZm9yZWdyb3VuZDtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyYXRpb24uYXV0b0RldGVjdEhpZ2hDb250cmFzdCAmJiBjb25maWd1cmF0aW9uLmNvbG9yU2NoZW1lLmhpZ2hDb250cmFzdCkge1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24uY29sb3JTY2hlbWUuZGFyaykge1xuXHRcdFx0XHRiYXNlVGhlbWUgPSAnaGMtYmxhY2snO1xuXHRcdFx0XHRzaGVsbEJhY2tncm91bmQgPSAnIzAwMDAwMCc7XG5cdFx0XHRcdHNoZWxsRm9yZWdyb3VuZCA9ICcjRkZGRkZGJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJhc2VUaGVtZSA9ICdoYy1saWdodCc7XG5cdFx0XHRcdHNoZWxsQmFja2dyb3VuZCA9ICcjRkZGRkZGJztcblx0XHRcdFx0c2hlbGxGb3JlZ3JvdW5kID0gJyMwMDAwMDAnO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY29uZmlndXJhdGlvbi5hdXRvRGV0ZWN0Q29sb3JTY2hlbWUpIHtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uLmNvbG9yU2NoZW1lLmRhcmspIHtcblx0XHRcdFx0YmFzZVRoZW1lID0gJ3ZzLWRhcmsnO1xuXHRcdFx0XHRzaGVsbEJhY2tncm91bmQgPSAnIzFFMUUxRSc7XG5cdFx0XHRcdHNoZWxsRm9yZWdyb3VuZCA9ICcjQ0NDQ0NDJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJhc2VUaGVtZSA9ICd2cyc7XG5cdFx0XHRcdHNoZWxsQmFja2dyb3VuZCA9ICcjRkZGRkZGJztcblx0XHRcdFx0c2hlbGxGb3JlZ3JvdW5kID0gJyMwMDAwMDAnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcblx0XHRzdHlsZS5jbGFzc05hbWUgPSAnaW5pdGlhbFNoZWxsQ29sb3JzJztcblx0XHR3aW5kb3cuZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cdFx0c3R5bGUudGV4dENvbnRlbnQgPSBgYm9keSB7XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3NoZWxsQmFja2dyb3VuZH07IGNvbG9yOiAke3NoZWxsRm9yZWdyb3VuZH07IG1hcmdpbjogMDsgcGFkZGluZzogMDsgfWA7XG5cblx0XHQvLyBzZXQgem9vbSBsZXZlbCBhcyBzb29uIGFzIHBvc3NpYmxlXG5cdFx0aWYgKHR5cGVvZiBkYXRhPy56b29tTGV2ZWwgPT09ICdudW1iZXInICYmIHR5cGVvZiBwcmVsb2FkR2xvYmFscz8ud2ViRnJhbWU/LnNldFpvb21MZXZlbCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cHJlbG9hZEdsb2JhbHMud2ViRnJhbWUuc2V0Wm9vbUxldmVsKGRhdGEuem9vbUxldmVsKTtcblx0XHR9XG5cblx0XHQvLyByZXN0b3JlIHBhcnRzIGlmIHBvc3NpYmxlICh3ZSBtaWdodCBub3QgYWx3YXlzIHN0b3JlIGxheW91dCBpbmZvKVxuXHRcdGlmIChkYXRhPy5sYXlvdXRJbmZvKSB7XG5cdFx0XHRjb25zdCB7IGxheW91dEluZm8sIGNvbG9ySW5mbyB9ID0gZGF0YTtcblx0XHRcdGNvbnN0IG1vZGVyblVJID0gbGF5b3V0SW5mby5tb2Rlcm5VSSA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IGZsb2F0aW5nTWFyZ2luID0gNDtcblx0XHRcdGNvbnN0IGZsb2F0aW5nT3V0ZXJNYXJnaW4gPSBmbG9hdGluZ01hcmdpbiAqIDI7XG5cdFx0XHRjb25zdCBmbG9hdGluZ0JvcmRlcldpZHRoID0gMTtcblxuXHRcdFx0Y29uc3Qgc3BsYXNoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRzcGxhc2guaWQgPSAnbW9uYWNvLXBhcnRzLXNwbGFzaCc7XG5cdFx0XHRzcGxhc2guY2xhc3NOYW1lID0gYmFzZVRoZW1lID8/ICd2cy1kYXJrJztcblxuXHRcdFx0aWYgKGxheW91dEluZm8ud2luZG93Qm9yZGVyICYmIGNvbG9ySW5mby53aW5kb3dCb3JkZXIpIHtcblx0XHRcdFx0Y29uc3QgYm9yZGVyRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0Ym9yZGVyRWxlbWVudC5zdHlsZS53aWR0aCA9ICdjYWxjKDEwMHZ3IC0gMnB4KSc7XG5cdFx0XHRcdGJvcmRlckVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJ2NhbGMoMTAwdmggLSAycHgpJztcblx0XHRcdFx0Ym9yZGVyRWxlbWVudC5zdHlsZS56SW5kZXggPSAnMSc7IC8vIGFsbG93IGJvcmRlciBhYm92ZSBvdGhlciBlbGVtZW50c1xuXHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgdmFyKC0td2luZG93LWJvcmRlci1jb2xvcilgO1xuXHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXdpbmRvdy1ib3JkZXItY29sb3InLCBjb2xvckluZm8ud2luZG93Qm9yZGVyKTtcblxuXHRcdFx0XHRpZiAobGF5b3V0SW5mby53aW5kb3dCb3JkZXJSYWRpdXMpIHtcblx0XHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLmJvcmRlclJhZGl1cyA9IGxheW91dEluZm8ud2luZG93Qm9yZGVyUmFkaXVzO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKGJvcmRlckVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXRCb3VuZHMgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIGJvdW5kczogeyB0b3A6IG51bWJlcjsgYm90dG9tPzogbnVtYmVyOyBsZWZ0PzogbnVtYmVyOyByaWdodD86IG51bWJlcjsgd2lkdGg/OiBudW1iZXI7IGhlaWdodD86IG51bWJlciB9KSA9PiB7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLnRvcCA9IGAke2JvdW5kcy50b3B9cHhgO1xuXHRcdFx0XHRpZiAodHlwZW9mIGJvdW5kcy5ib3R0b20gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zdHlsZS5ib3R0b20gPSBgJHtib3VuZHMuYm90dG9tfXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIGJvdW5kcy5sZWZ0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2JvdW5kcy5sZWZ0fXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIGJvdW5kcy5yaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRlbGVtZW50LnN0eWxlLnJpZ2h0ID0gYCR7Ym91bmRzLnJpZ2h0fXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIGJvdW5kcy53aWR0aCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7Ym91bmRzLndpZHRofXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIGJvdW5kcy5oZWlnaHQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtib3VuZHMuaGVpZ2h0fXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2V0UGFydEJvdW5kcyA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgYm91bmRzOiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUudG9wID0gYCR7Ym91bmRzLnRvcH1weGA7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2JvdW5kcy5sZWZ0fXB4YDtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS53aWR0aCA9IGAke2JvdW5kcy53aWR0aH1weGA7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7Ym91bmRzLmhlaWdodH1weGA7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhcHBseUZsb2F0aW5nQ2FyZFN0eWxlcyA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgYmFja2dyb3VuZENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUuYm9yZGVyID0gYCR7ZmxvYXRpbmdCb3JkZXJXaWR0aH1weCBzb2xpZCAke2NvbG9ySW5mby5hZ2VudHNQYW5lbEJvcmRlciA/PyBjb2xvckluZm8uZWRpdG9yR3JvdXBCb3JkZXIgPz8gJ3RyYW5zcGFyZW50J31gO1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLmJvcmRlclJhZGl1cyA9ICc4cHgnO1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmRDb2xvciA/PyBjb2xvckluZm8uZWRpdG9yQmFja2dyb3VuZCA/PyBjb2xvckluZm8uYmFja2dyb3VuZDtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29udGVudFRvcCA9IGxheW91dEluZm8udGl0bGVCYXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBjb250ZW50Qm90dG9tID0gbGF5b3V0SW5mby5zdGF0dXNCYXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gYGNhbGMoMTAwJSAtICR7Y29udGVudFRvcCArIGNvbnRlbnRCb3R0b219cHgpYDtcblx0XHRcdGNvbnN0IGFjdGl2aXR5SGVpZ2h0ID0gbW9kZXJuVUkgPyBgY2FsYygxMDAlIC0gJHtjb250ZW50VG9wICsgY29udGVudEJvdHRvbSArIGZsb2F0aW5nTWFyZ2lufXB4KWAgOiBjb250ZW50SGVpZ2h0O1xuXG5cdFx0XHRpZiAobGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCA9PT0gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcblx0XHRcdFx0Ly8gaWYgYXV4aWxpYXJ5IGJhciBpcyBtYXhpbWl6ZWQsIGl0IGdvZXMgYXMgd2lkZSBhcyB0aGVcblx0XHRcdFx0Ly8gd2luZG93IHdpZHRoIGJ1dCBsZWF2aW5nIHJvb20gZm9yIGFjdGl2aXR5IGJhclxuXHRcdFx0XHRsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoID0gd2luZG93LmlubmVyV2lkdGggLSBsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBvdGhlcndpc2UgYWRqdXN0IGZvciBvdGhlciBwYXJ0cyBzaXplcyBpZiBub3QgbWF4aW1pemVkXG5cdFx0XHRcdGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggPSBNYXRoLm1pbihsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoLCB3aW5kb3cuaW5uZXJXaWR0aCAtIChsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggKyBsYXlvdXRJbmZvLmVkaXRvclBhcnRNaW5XaWR0aCArIGxheW91dEluZm8uc2lkZUJhcldpZHRoKSk7XG5cdFx0XHR9XG5cdFx0XHRsYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCA9IE1hdGgubWluKGxheW91dEluZm8uc2lkZUJhcldpZHRoLCB3aW5kb3cuaW5uZXJXaWR0aCAtIChsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggKyBsYXlvdXRJbmZvLmVkaXRvclBhcnRNaW5XaWR0aCArIGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGgpKTtcblxuXHRcdFx0Ly8gcGFydDogdGl0bGVcblx0XHRcdGlmIChsYXlvdXRJbmZvLnRpdGxlQmFySGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRjb25zdCB0aXRsZURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHR0aXRsZURpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdHRpdGxlRGl2LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHR0aXRsZURpdi5zdHlsZS5oZWlnaHQgPSBgJHtsYXlvdXRJbmZvLnRpdGxlQmFySGVpZ2h0fXB4YDtcblx0XHRcdFx0dGl0bGVEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0dGl0bGVEaXYuc3R5bGUudG9wID0gJzAnO1xuXHRcdFx0XHR0aXRsZURpdi5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBtb2Rlcm5VSSA/ICd0cmFuc3BhcmVudCcgOiBgJHtjb2xvckluZm8udGl0bGVCYXJCYWNrZ3JvdW5kfWA7XG5cdFx0XHRcdCh0aXRsZURpdi5zdHlsZSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uICYgeyAnLXdlYmtpdC1hcHAtcmVnaW9uJzogc3RyaW5nIH0pWyctd2Via2l0LWFwcC1yZWdpb24nXSA9ICdkcmFnJztcblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKHRpdGxlRGl2KTtcblxuXHRcdFx0XHRpZiAoIW1vZGVyblVJICYmIGNvbG9ySW5mby50aXRsZUJhckJvcmRlcikge1xuXHRcdFx0XHRcdGNvbnN0IHRpdGxlQm9yZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRcdHRpdGxlQm9yZGVyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHRcdHRpdGxlQm9yZGVyLnN0eWxlLmhlaWdodCA9ICcxcHgnO1xuXHRcdFx0XHRcdHRpdGxlQm9yZGVyLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUuYm90dG9tID0gJzAnO1xuXHRcdFx0XHRcdHRpdGxlQm9yZGVyLnN0eWxlLmJvcmRlckJvdHRvbSA9IGAxcHggc29saWQgJHtjb2xvckluZm8udGl0bGVCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR0aXRsZURpdi5hcHBlbmRDaGlsZCh0aXRsZUJvcmRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gcGFydDogYWN0aXZpdHkgYmFyXG5cdFx0XHRpZiAobGF5b3V0SW5mby5hY3Rpdml0eUJhcldpZHRoID4gMCkge1xuXHRcdFx0XHRjb25zdCBhY3Rpdml0eURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRhY3Rpdml0eURpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdGFjdGl2aXR5RGl2LnN0eWxlLndpZHRoID0gYCR7bGF5b3V0SW5mby5hY3Rpdml0eUJhcldpZHRofXB4YDtcblx0XHRcdFx0YWN0aXZpdHlEaXYuc3R5bGUuaGVpZ2h0ID0gYWN0aXZpdHlIZWlnaHQ7XG5cdFx0XHRcdGFjdGl2aXR5RGl2LnN0eWxlLnRvcCA9IGAke2NvbnRlbnRUb3B9cHhgO1xuXHRcdFx0XHRpZiAobGF5b3V0SW5mby5zaWRlQmFyU2lkZSA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0YWN0aXZpdHlEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY3Rpdml0eURpdi5zdHlsZS5yaWdodCA9ICcwJztcblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpdml0eURpdi5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBtb2Rlcm5VSSA/ICd0cmFuc3BhcmVudCcgOiBgJHtjb2xvckluZm8uYWN0aXZpdHlCYXJCYWNrZ3JvdW5kfWA7XG5cdFx0XHRcdHNwbGFzaC5hcHBlbmRDaGlsZChhY3Rpdml0eURpdik7XG5cblx0XHRcdFx0aWYgKCFtb2Rlcm5VSSAmJiBjb2xvckluZm8uYWN0aXZpdHlCYXJCb3JkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpdml0eUJvcmRlckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0XHRhY3Rpdml0eUJvcmRlckRpdi5zdHlsZS53aWR0aCA9ICcxcHgnO1xuXHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRcdFx0XHRhY3Rpdml0eUJvcmRlckRpdi5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdFx0aWYgKGxheW91dEluZm8uc2lkZUJhclNpZGUgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHRcdFx0YWN0aXZpdHlCb3JkZXJEaXYuc3R5bGUucmlnaHQgPSAnMCc7XG5cdFx0XHRcdFx0XHRhY3Rpdml0eUJvcmRlckRpdi5zdHlsZS5ib3JkZXJSaWdodCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uYWN0aXZpdHlCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YWN0aXZpdHlCb3JkZXJEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLmJvcmRlckxlZnQgPSBgMXB4IHNvbGlkICR7Y29sb3JJbmZvLmFjdGl2aXR5QmFyQm9yZGVyfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFjdGl2aXR5RGl2LmFwcGVuZENoaWxkKGFjdGl2aXR5Qm9yZGVyRGl2KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBwYXJ0OiBzaWRlIGJhclxuXHRcdFx0aWYgKGxheW91dEluZm8uc2lkZUJhcldpZHRoID4gMCkge1xuXHRcdFx0XHRjb25zdCBzaWRlRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGlmIChtb2Rlcm5VSSAmJiBsYXlvdXRJbmZvLnBhcnRCb3VuZHM/LnNpZGVCYXIpIHtcblx0XHRcdFx0XHRzZXRQYXJ0Qm91bmRzKHNpZGVEaXYsIGxheW91dEluZm8ucGFydEJvdW5kcy5zaWRlQmFyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcpIHtcblx0XHRcdFx0XHRzZXRCb3VuZHMoc2lkZURpdiwge1xuXHRcdFx0XHRcdFx0dG9wOiBjb250ZW50VG9wLFxuXHRcdFx0XHRcdFx0Ym90dG9tOiBtb2Rlcm5VSSA/IGNvbnRlbnRCb3R0b20gKyBmbG9hdGluZ01hcmdpbiA6IGNvbnRlbnRCb3R0b20sXG5cdFx0XHRcdFx0XHRsZWZ0OiBsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggKyAobW9kZXJuVUkgPyBmbG9hdGluZ01hcmdpbiA6IDApLFxuXHRcdFx0XHRcdFx0d2lkdGg6IG1vZGVyblVJID8gTWF0aC5tYXgoMCwgbGF5b3V0SW5mby5zaWRlQmFyV2lkdGggLSBmbG9hdGluZ091dGVyTWFyZ2luIC0gZmxvYXRpbmdCb3JkZXJXaWR0aCAqIDIpIDogbGF5b3V0SW5mby5zaWRlQmFyV2lkdGhcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXRCb3VuZHMoc2lkZURpdiwge1xuXHRcdFx0XHRcdFx0dG9wOiBjb250ZW50VG9wLFxuXHRcdFx0XHRcdFx0Ym90dG9tOiBtb2Rlcm5VSSA/IGNvbnRlbnRCb3R0b20gKyBmbG9hdGluZ01hcmdpbiA6IGNvbnRlbnRCb3R0b20sXG5cdFx0XHRcdFx0XHRyaWdodDogbGF5b3V0SW5mby5hY3Rpdml0eUJhcldpZHRoICsgKG1vZGVyblVJID8gZmxvYXRpbmdNYXJnaW4gOiAwKSxcblx0XHRcdFx0XHRcdHdpZHRoOiBtb2Rlcm5VSSA/IE1hdGgubWF4KDAsIGxheW91dEluZm8uc2lkZUJhcldpZHRoIC0gZmxvYXRpbmdPdXRlck1hcmdpbiAtIGZsb2F0aW5nQm9yZGVyV2lkdGggKiAyKSA6IGxheW91dEluZm8uc2lkZUJhcldpZHRoXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGVyblVJKSB7XG5cdFx0XHRcdFx0YXBwbHlGbG9hdGluZ0NhcmRTdHlsZXMoc2lkZURpdiwgY29sb3JJbmZvLmFnZW50c1BhbmVsQmFja2dyb3VuZCA/PyBjb2xvckluZm8uc2lkZUJhckJhY2tncm91bmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNpZGVEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYCR7Y29sb3JJbmZvLnNpZGVCYXJCYWNrZ3JvdW5kfWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKHNpZGVEaXYpO1xuXG5cdFx0XHRcdGlmICghbW9kZXJuVUkgJiYgY29sb3JJbmZvLnNpZGVCYXJCb3JkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBzaWRlQm9yZGVyRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS53aWR0aCA9ICcxcHgnO1xuXHRcdFx0XHRcdHNpZGVCb3JkZXJEaXYuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRcdHNpZGVCb3JkZXJEaXYuc3R5bGUudG9wID0gJzAnO1xuXHRcdFx0XHRcdHNpZGVCb3JkZXJEaXYuc3R5bGUucmlnaHQgPSAnMCc7XG5cdFx0XHRcdFx0aWYgKGxheW91dEluZm8uc2lkZUJhclNpZGUgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS5ib3JkZXJSaWdodCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uc2lkZUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzaWRlQm9yZGVyRGl2LnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHRcdFx0XHRzaWRlQm9yZGVyRGl2LnN0eWxlLmJvcmRlckxlZnQgPSBgMXB4IHNvbGlkICR7Y29sb3JJbmZvLnNpZGVCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2lkZURpdi5hcHBlbmRDaGlsZChzaWRlQm9yZGVyRGl2KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBwYXJ0OiBhdXhpbGlhcnkgc2lkZWJhclxuXHRcdFx0aWYgKGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGF1eFNpZGVEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0aWYgKG1vZGVyblVJICYmIGxheW91dEluZm8ucGFydEJvdW5kcz8uYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0c2V0UGFydEJvdW5kcyhhdXhTaWRlRGl2LCBsYXlvdXRJbmZvLnBhcnRCb3VuZHMuYXV4aWxpYXJ5QmFyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcpIHtcblx0XHRcdFx0XHRzZXRCb3VuZHMoYXV4U2lkZURpdiwge1xuXHRcdFx0XHRcdFx0dG9wOiBjb250ZW50VG9wLFxuXHRcdFx0XHRcdFx0Ym90dG9tOiBtb2Rlcm5VSSA/IGNvbnRlbnRCb3R0b20gKyBmbG9hdGluZ01hcmdpbiA6IGNvbnRlbnRCb3R0b20sXG5cdFx0XHRcdFx0XHRyaWdodDogbW9kZXJuVUkgPyBmbG9hdGluZ091dGVyTWFyZ2luIDogMCxcblx0XHRcdFx0XHRcdHdpZHRoOiBtb2Rlcm5VSSA/IE1hdGgubWF4KDAsIGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggLSBmbG9hdGluZ091dGVyTWFyZ2luIC0gZmxvYXRpbmdNYXJnaW4gLSBmbG9hdGluZ0JvcmRlcldpZHRoICogMikgOiBsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2V0Qm91bmRzKGF1eFNpZGVEaXYsIHtcblx0XHRcdFx0XHRcdHRvcDogY29udGVudFRvcCxcblx0XHRcdFx0XHRcdGJvdHRvbTogbW9kZXJuVUkgPyBjb250ZW50Qm90dG9tICsgZmxvYXRpbmdNYXJnaW4gOiBjb250ZW50Qm90dG9tLFxuXHRcdFx0XHRcdFx0bGVmdDogbW9kZXJuVUkgPyBmbG9hdGluZ091dGVyTWFyZ2luIDogMCxcblx0XHRcdFx0XHRcdHdpZHRoOiBtb2Rlcm5VSSA/IE1hdGgubWF4KDAsIGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggLSBmbG9hdGluZ091dGVyTWFyZ2luIC0gZmxvYXRpbmdNYXJnaW4gLSBmbG9hdGluZ0JvcmRlcldpZHRoICogMikgOiBsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGVyblVJKSB7XG5cdFx0XHRcdFx0YXBwbHlGbG9hdGluZ0NhcmRTdHlsZXMoYXV4U2lkZURpdiwgY29sb3JJbmZvLnNpZGVCYXJCYWNrZ3JvdW5kKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhdXhTaWRlRGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGAke2NvbG9ySW5mby5zaWRlQmFyQmFja2dyb3VuZH1gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNwbGFzaC5hcHBlbmRDaGlsZChhdXhTaWRlRGl2KTtcblxuXHRcdFx0XHRpZiAoIW1vZGVyblVJICYmIGNvbG9ySW5mby5zaWRlQmFyQm9yZGVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgYXV4U2lkZUJvcmRlckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUud2lkdGggPSAnMXB4Jztcblx0XHRcdFx0XHRhdXhTaWRlQm9yZGVyRGl2LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRcdFx0XHRhdXhTaWRlQm9yZGVyRGl2LnN0eWxlLnRvcCA9ICcwJztcblx0XHRcdFx0XHRpZiAobGF5b3V0SW5mby5zaWRlQmFyU2lkZSA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0XHRhdXhTaWRlQm9yZGVyRGl2LnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHRcdFx0XHRhdXhTaWRlQm9yZGVyRGl2LnN0eWxlLmJvcmRlckxlZnQgPSBgMXB4IHNvbGlkICR7Y29sb3JJbmZvLnNpZGVCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXV4U2lkZUJvcmRlckRpdi5zdHlsZS5yaWdodCA9ICcwJztcblx0XHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUuYm9yZGVyUmlnaHQgPSBgMXB4IHNvbGlkICR7Y29sb3JJbmZvLnNpZGVCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXV4U2lkZURpdi5hcHBlbmRDaGlsZChhdXhTaWRlQm9yZGVyRGl2KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZXJuVUkgJiYgKGxheW91dEluZm8ucGFydEJvdW5kcz8uZWRpdG9yIHx8ICFsYXlvdXRJbmZvLnBhcnRCb3VuZHMpKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRpZiAobGF5b3V0SW5mby5wYXJ0Qm91bmRzPy5lZGl0b3IpIHtcblx0XHRcdFx0XHRzZXRQYXJ0Qm91bmRzKGVkaXRvckRpdiwgbGF5b3V0SW5mby5wYXJ0Qm91bmRzLmVkaXRvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yTGVmdCA9IChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcgPyBsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggKyBsYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCA6IGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGgpICsgZmxvYXRpbmdNYXJnaW47XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yUmlnaHQgPSAobGF5b3V0SW5mby5zaWRlQmFyU2lkZSA9PT0gJ2xlZnQnID8gbGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCA6IGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aCArIGxheW91dEluZm8uc2lkZUJhcldpZHRoKSArIGZsb2F0aW5nTWFyZ2luO1xuXHRcdFx0XHRcdHNldEJvdW5kcyhlZGl0b3JEaXYsIHtcblx0XHRcdFx0XHRcdHRvcDogY29udGVudFRvcCxcblx0XHRcdFx0XHRcdGJvdHRvbTogY29udGVudEJvdHRvbSArIGZsb2F0aW5nTWFyZ2luLFxuXHRcdFx0XHRcdFx0bGVmdDogZWRpdG9yTGVmdCxcblx0XHRcdFx0XHRcdHJpZ2h0OiBlZGl0b3JSaWdodFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFwcGx5RmxvYXRpbmdDYXJkU3R5bGVzKGVkaXRvckRpdiwgY29sb3JJbmZvLmVkaXRvckJhY2tncm91bmQpO1xuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQoZWRpdG9yRGl2KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVyblVJICYmIGxheW91dEluZm8ucGFydEJvdW5kcz8ucGFuZWwpIHtcblx0XHRcdFx0Y29uc3QgcGFuZWxEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0c2V0UGFydEJvdW5kcyhwYW5lbERpdiwgbGF5b3V0SW5mby5wYXJ0Qm91bmRzLnBhbmVsKTtcblx0XHRcdFx0YXBwbHlGbG9hdGluZ0NhcmRTdHlsZXMocGFuZWxEaXYsIGNvbG9ySW5mby5wYW5lbEJhY2tncm91bmQgPz8gY29sb3JJbmZvLmVkaXRvckJhY2tncm91bmQpO1xuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQocGFuZWxEaXYpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBwYXJ0OiBzdGF0dXNiYXJcblx0XHRcdGlmIChsYXlvdXRJbmZvLnN0YXR1c0JhckhlaWdodCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdHN0YXR1c0Rpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdHN0YXR1c0Rpdi5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmhlaWdodCA9IGAke2xheW91dEluZm8uc3RhdHVzQmFySGVpZ2h0fXB4YDtcblx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmJvdHRvbSA9ICcwJztcblx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHRcdGlmIChtb2Rlcm5VSSkge1xuXHRcdFx0XHRcdHN0YXR1c0Rpdi5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndHJhbnNwYXJlbnQnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlICYmIGNvbG9ySW5mby5zdGF0dXNCYXJCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGNvbG9ySW5mby5zdGF0dXNCYXJCYWNrZ3JvdW5kO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFjb25maWd1cmF0aW9uLndvcmtzcGFjZSAmJiBjb2xvckluZm8uc3RhdHVzQmFyTm9Gb2xkZXJCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGNvbG9ySW5mby5zdGF0dXNCYXJOb0ZvbGRlckJhY2tncm91bmQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKHN0YXR1c0Rpdik7XG5cblx0XHRcdFx0aWYgKCFtb2Rlcm5VSSAmJiBjb2xvckluZm8uc3RhdHVzQmFyQm9yZGVyKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzQm9yZGVyRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0c3RhdHVzQm9yZGVyRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0XHRzdGF0dXNCb3JkZXJEaXYuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0XHRcdFx0c3RhdHVzQm9yZGVyRGl2LnN0eWxlLmhlaWdodCA9ICcxcHgnO1xuXHRcdFx0XHRcdHN0YXR1c0JvcmRlckRpdi5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdFx0c3RhdHVzQm9yZGVyRGl2LnN0eWxlLmJvcmRlclRvcCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uc3RhdHVzQmFyQm9yZGVyfWA7XG5cdFx0XHRcdFx0c3RhdHVzRGl2LmFwcGVuZENoaWxkKHN0YXR1c0JvcmRlckRpdik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0d2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3BsYXNoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV2luZG93IEhlbHBlcnNcblxuXHRhc3luYyBmdW5jdGlvbiBsb2FkPE0sIFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+KG9wdGlvbnM6IElMb2FkT3B0aW9uczxUPik6IFByb21pc2U8SUxvYWRSZXN1bHQ8TSwgVD4+IHtcblxuXHRcdC8vIFdpbmRvdyBDb25maWd1cmF0aW9uIGZyb20gUHJlbG9hZCBTY3JpcHRcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gYXdhaXQgcmVzb2x2ZVdpbmRvd0NvbmZpZ3VyYXRpb248VD4oKTtcblxuXHRcdC8vIFNpZ25hbCBiZWZvcmUgaW1wb3J0KClcblx0XHRvcHRpb25zPy5iZWZvcmVJbXBvcnQ/Lihjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIERldmVsb3BlciBzZXR0aW5nc1xuXHRcdGNvbnN0IHsgZW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3MsIHJlbW92ZURldmVsb3BlcktleWJpbmRpbmdzQWZ0ZXJMb2FkLCBkZXZlbG9wZXJEZXZlbG9wZXJLZXliaW5kaW5nc0Rpc3Bvc2FibGUsIGZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3IgfSA9IHNldHVwRGV2ZWxvcGVyS2V5YmluZGluZ3MoY29uZmlndXJhdGlvbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBOTFNcblx0XHRzZXR1cE5MUzxUPihjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIENvbXB1dGUgYmFzZSBVUkwgYW5kIHNldCBhcyBnbG9iYWxcblx0XHRjb25zdCBiYXNlVXJsID0gbmV3IFVSTChgJHtmaWxlVXJpRnJvbVBhdGgoY29uZmlndXJhdGlvbi5hcHBSb290LCB7IGlzV2luZG93czogc2FmZVByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicsIHNjaGVtZTogJ3ZzY29kZS1maWxlJywgZmFsbGJhY2tBdXRob3JpdHk6ICd2c2NvZGUtYXBwJyB9KX0vb3V0L2ApO1xuXHRcdGdsb2JhbFRoaXMuX1ZTQ09ERV9GSUxFX1JPT1QgPSBiYXNlVXJsLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBTZXQgcHJvZHVjdCBjb25maWd1cmF0aW9uIGFzIGdsb2JhbCAodXNlZCBlLmcuIHRvIHNlbGVjdCB0aGUgQVNBUiBwYXRoIGluIGBhbWRYYClcblx0XHRnbG9iYWxUaGlzLl9WU0NPREVfUFJPRFVDVF9KU09OID0geyAuLi5jb25maWd1cmF0aW9uLnByb2R1Y3QgfTtcblxuXHRcdC8vIERldiBvbmx5OiBDU1MgaW1wb3J0IG1hcCB0cmlja3Ncblx0XHRzZXR1cENTU0ltcG9ydE1hcHM8VD4oY29uZmlndXJhdGlvbiwgYmFzZVVybCk7XG5cblx0XHQvLyBFU00gSW1wb3J0XG5cdFx0dHJ5IHtcblx0XHRcdGxldCB3b3JrYmVuY2hVcmw6IHN0cmluZztcblx0XHRcdGlmICghIXNhZmVQcm9jZXNzLmVudlsnVlNDT0RFX0RFViddICYmIGdsb2JhbFRoaXMuX1ZTQ09ERV9VU0VfUkVMQVRJVkVfSU1QT1JUUykge1xuXHRcdFx0XHR3b3JrYmVuY2hVcmwgPSAnLi4vLi4vLi4vd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMnOyAvLyBmb3IgZGV2IHB1cnBvc2VzIG9ubHlcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdvcmtiZW5jaFVybCA9IG5ldyBVUkwoYHZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzYCwgYmFzZVVybCkuaHJlZjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW1wb3J0KHdvcmtiZW5jaFVybCk7XG5cdFx0XHRpZiAoZGV2ZWxvcGVyRGV2ZWxvcGVyS2V5YmluZGluZ3NEaXNwb3NhYmxlICYmIHJlbW92ZURldmVsb3BlcktleWJpbmRpbmdzQWZ0ZXJMb2FkKSB7XG5cdFx0XHRcdGRldmVsb3BlckRldmVsb3BlcktleWJpbmRpbmdzRGlzcG9zYWJsZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyByZXN1bHQsIGNvbmZpZ3VyYXRpb24gfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IsIGVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzICYmICFmb3JjZURpc2FibGVTaG93RGV2dG9vbHNPbkVycm9yKTtcblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVdpbmRvd0NvbmZpZ3VyYXRpb248VCBleHRlbmRzIElTYW5kYm94Q29uZmlndXJhdGlvbj4oKSB7XG5cdFx0Y29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBjb25zb2xlLmVycm9yKGBbcmVzb2x2ZSB3aW5kb3cgY29uZmlnXSBDb3VsZCBub3QgcmVzb2x2ZSB3aW5kb3cgY29uZmlndXJhdGlvbiB3aXRoaW4gMTAgc2Vjb25kcywgYnV0IHdpbGwgY29udGludWUgdG8gd2FpdC4uLmApOyB9LCAxMDAwMCk7XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsV2FpdEZvcldpbmRvd0NvbmZpZycpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGF3YWl0IHByZWxvYWRHbG9iYWxzLmNvbnRleHQucmVzb2x2ZUNvbmZpZ3VyYXRpb24oKSBhcyBUO1xuXHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvZGlkV2FpdEZvcldpbmRvd0NvbmZpZycpO1xuXG5cdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cERldmVsb3BlcktleWJpbmRpbmdzPFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+KGNvbmZpZ3VyYXRpb246IFQsIG9wdGlvbnM6IElMb2FkT3B0aW9uczxUPikge1xuXHRcdGNvbnN0IHtcblx0XHRcdGZvcmNlRW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3MsXG5cdFx0XHRkaXNhbGxvd1JlbG9hZEtleWJpbmRpbmcsXG5cdFx0XHRyZW1vdmVEZXZlbG9wZXJLZXliaW5kaW5nc0FmdGVyTG9hZCxcblx0XHRcdGZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3Jcblx0XHR9ID0gdHlwZW9mIG9wdGlvbnM/LmNvbmZpZ3VyZURldmVsb3BlclNldHRpbmdzID09PSAnZnVuY3Rpb24nID8gb3B0aW9ucy5jb25maWd1cmVEZXZlbG9wZXJTZXR0aW5ncyhjb25maWd1cmF0aW9uKSA6IHtcblx0XHRcdGZvcmNlRW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3M6IGZhbHNlLFxuXHRcdFx0ZGlzYWxsb3dSZWxvYWRLZXliaW5kaW5nOiBmYWxzZSxcblx0XHRcdHJlbW92ZURldmVsb3BlcktleWJpbmRpbmdzQWZ0ZXJMb2FkOiBmYWxzZSxcblx0XHRcdGZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3I6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzRGV2ID0gISFzYWZlUHJvY2Vzcy5lbnZbJ1ZTQ09ERV9ERVYnXTtcblx0XHRjb25zdCBlbmFibGVEZXZlbG9wZXJLZXliaW5kaW5ncyA9IEJvb2xlYW4oaXNEZXYgfHwgZm9yY2VFbmFibGVEZXZlbG9wZXJLZXliaW5kaW5ncyk7XG5cdFx0bGV0IGRldmVsb3BlckRldmVsb3BlcktleWJpbmRpbmdzRGlzcG9zYWJsZTogRnVuY3Rpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzKSB7XG5cdFx0XHRkZXZlbG9wZXJEZXZlbG9wZXJLZXliaW5kaW5nc0Rpc3Bvc2FibGUgPSByZWdpc3RlckRldmVsb3BlcktleWJpbmRpbmdzKGRpc2FsbG93UmVsb2FkS2V5YmluZGluZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzLFxuXHRcdFx0cmVtb3ZlRGV2ZWxvcGVyS2V5YmluZGluZ3NBZnRlckxvYWQsXG5cdFx0XHRkZXZlbG9wZXJEZXZlbG9wZXJLZXliaW5kaW5nc0Rpc3Bvc2FibGUsXG5cdFx0XHRmb3JjZURpc2FibGVTaG93RGV2dG9vbHNPbkVycm9yXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyRGV2ZWxvcGVyS2V5YmluZGluZ3MoZGlzYWxsb3dSZWxvYWRLZXliaW5kaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkKTogRnVuY3Rpb24ge1xuXHRcdGNvbnN0IGlwY1JlbmRlcmVyID0gcHJlbG9hZEdsb2JhbHMuaXBjUmVuZGVyZXI7XG5cblx0XHRjb25zdCBleHRyYWN0S2V5ID1cblx0XHRcdGZ1bmN0aW9uIChlOiBLZXlib2FyZEV2ZW50KSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0ZS5jdHJsS2V5ID8gJ2N0cmwtJyA6ICcnLFxuXHRcdFx0XHRcdGUubWV0YUtleSA/ICdtZXRhLScgOiAnJyxcblx0XHRcdFx0XHRlLmFsdEtleSA/ICdhbHQtJyA6ICcnLFxuXHRcdFx0XHRcdGUuc2hpZnRLZXkgPyAnc2hpZnQtJyA6ICcnLFxuXHRcdFx0XHRcdGUua2V5Q29kZVxuXHRcdFx0XHRdLmpvaW4oJycpO1xuXHRcdFx0fTtcblxuXHRcdC8vIERldnRvb2xzICYgcmVsb2FkIHN1cHBvcnRcblx0XHRjb25zdCBUT0dHTEVfREVWX1RPT0xTX0tCID0gKHNhZmVQcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJyA/ICdtZXRhLWFsdC03MycgOiAnY3RybC1zaGlmdC03MycpOyAvLyBtYWM6IENtZC1BbHQtSSwgcmVzdDogQ3RybC1TaGlmdC1JXG5cdFx0Y29uc3QgVE9HR0xFX0RFVl9UT09MU19LQl9BTFQgPSAnMTIzJzsgLy8gRjEyXG5cdFx0Y29uc3QgUkVMT0FEX0tCID0gKHNhZmVQcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJyA/ICdtZXRhLTgyJyA6ICdjdHJsLTgyJyk7IC8vIG1hYzogQ21kLVIsIHJlc3Q6IEN0cmwtUlxuXG5cdFx0bGV0IGxpc3RlbmVyOiAoKGU6IEtleWJvYXJkRXZlbnQpID0+IHZvaWQpIHwgdW5kZWZpbmVkID0gZnVuY3Rpb24gKGUpIHtcblx0XHRcdGNvbnN0IGtleSA9IGV4dHJhY3RLZXkoZSk7XG5cdFx0XHRpZiAoa2V5ID09PSBUT0dHTEVfREVWX1RPT0xTX0tCIHx8IGtleSA9PT0gVE9HR0xFX0RFVl9UT09MU19LQl9BTFQpIHtcblx0XHRcdFx0aXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOnRvZ2dsZURldlRvb2xzJyk7XG5cdFx0XHR9IGVsc2UgaWYgKGtleSA9PT0gUkVMT0FEX0tCICYmICFkaXNhbGxvd1JlbG9hZEtleWJpbmRpbmcpIHtcblx0XHRcdFx0aXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOnJlbG9hZFdpbmRvdycpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGxpc3RlbmVyKTtcblxuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAobGlzdGVuZXIpIHtcblx0XHRcdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBsaXN0ZW5lcik7XG5cdFx0XHRcdGxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cE5MUzxUIGV4dGVuZHMgSVNhbmRib3hDb25maWd1cmF0aW9uPihjb25maWd1cmF0aW9uOiBUKTogdm9pZCB7XG5cdFx0Z2xvYmFsVGhpcy5fVlNDT0RFX05MU19NRVNTQUdFUyA9IGNvbmZpZ3VyYXRpb24ubmxzLm1lc3NhZ2VzO1xuXHRcdGdsb2JhbFRoaXMuX1ZTQ09ERV9OTFNfTEFOR1VBR0UgPSBjb25maWd1cmF0aW9uLm5scy5sYW5ndWFnZTtcblxuXHRcdGxldCBsYW5ndWFnZSA9IGNvbmZpZ3VyYXRpb24ubmxzLmxhbmd1YWdlIHx8ICdlbic7XG5cdFx0aWYgKGxhbmd1YWdlID09PSAnemgtdHcnKSB7XG5cdFx0XHRsYW5ndWFnZSA9ICd6aC1IYW50Jztcblx0XHR9IGVsc2UgaWYgKGxhbmd1YWdlID09PSAnemgtY24nKSB7XG5cdFx0XHRsYW5ndWFnZSA9ICd6aC1IYW5zJztcblx0XHR9XG5cblx0XHR3aW5kb3cuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZSgnbGFuZycsIGxhbmd1YWdlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIG9uVW5leHBlY3RlZEVycm9yKGVycm9yOiBzdHJpbmcgfCBFcnJvciwgc2hvd0RldnRvb2xzT25FcnJvcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChzaG93RGV2dG9vbHNPbkVycm9yKSB7XG5cdFx0XHRjb25zdCBpcGNSZW5kZXJlciA9IHByZWxvYWRHbG9iYWxzLmlwY1JlbmRlcmVyO1xuXHRcdFx0aXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOm9wZW5EZXZUb29scycpO1xuXHRcdH1cblxuXHRcdGNvbnNvbGUuZXJyb3IoYFt1bmNhdWdodCBleGNlcHRpb25dOiAke2Vycm9yfWApO1xuXG5cdFx0aWYgKGVycm9yICYmIHR5cGVvZiBlcnJvciAhPT0gJ3N0cmluZycgJiYgZXJyb3Iuc3RhY2spIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3Iuc3RhY2spO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGZpbGVVcmlGcm9tUGF0aChwYXRoOiBzdHJpbmcsIGNvbmZpZzogeyBpc1dpbmRvd3M/OiBib29sZWFuOyBzY2hlbWU/OiBzdHJpbmc7IGZhbGxiYWNrQXV0aG9yaXR5Pzogc3RyaW5nIH0pOiBzdHJpbmcge1xuXG5cdFx0Ly8gU2luY2Ugd2UgYXJlIGJ1aWxkaW5nIGEgVVJJLCB3ZSBub3JtYWxpemUgYW55IGJhY2tzbGFzaFxuXHRcdC8vIHRvIHNsYXNoZXMgYW5kIHdlIGVuc3VyZSB0aGF0IHRoZSBwYXRoIGJlZ2lucyB3aXRoIGEgJy8nLlxuXHRcdGxldCBwYXRoTmFtZSA9IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuXHRcdGlmIChwYXRoTmFtZS5sZW5ndGggPiAwICYmIHBhdGhOYW1lLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG5cdFx0XHRwYXRoTmFtZSA9IGAvJHtwYXRoTmFtZX1gO1xuXHRcdH1cblxuXHRcdGxldCB1cmk6IHN0cmluZztcblxuXHRcdC8vIFdpbmRvd3M6IGluIG9yZGVyIHRvIHN1cHBvcnQgVU5DIHBhdGhzICh3aGljaCBzdGFydCB3aXRoICcvLycpXG5cdFx0Ly8gdGhhdCBoYXZlIHRoZWlyIG93biBhdXRob3JpdHksIHdlIGRvIG5vdCB1c2UgdGhlIHByb3ZpZGVkIGF1dGhvcml0eVxuXHRcdC8vIGJ1dCByYXRoZXIgcHJlc2VydmUgaXQuXG5cdFx0aWYgKGNvbmZpZy5pc1dpbmRvd3MgJiYgcGF0aE5hbWUuc3RhcnRzV2l0aCgnLy8nKSkge1xuXHRcdFx0dXJpID0gZW5jb2RlVVJJKGAke2NvbmZpZy5zY2hlbWUgfHwgJ2ZpbGUnfToke3BhdGhOYW1lfWApO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSB3ZSBvcHRpb25hbGx5IGFkZCB0aGUgcHJvdmlkZWQgYXV0aG9yaXR5IGlmIHNwZWNpZmllZFxuXHRcdGVsc2Uge1xuXHRcdFx0dXJpID0gZW5jb2RlVVJJKGAke2NvbmZpZy5zY2hlbWUgfHwgJ2ZpbGUnfTovLyR7Y29uZmlnLmZhbGxiYWNrQXV0aG9yaXR5IHx8ICcnfSR7cGF0aE5hbWV9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVyaS5yZXBsYWNlKC8jL2csICclMjMnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwQ1NTSW1wb3J0TWFwczxUIGV4dGVuZHMgSVNhbmRib3hDb25maWd1cmF0aW9uPihjb25maWd1cmF0aW9uOiBULCBiYXNlVXJsOiBVUkwpIHtcblxuXHRcdC8vIERFViAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHQvLyBERVY6IFRoaXMgaXMgZm9yIGRldmVsb3BtZW50IGFuZCBlbmFibGVzIGxvYWRpbmcgQ1NTIHZpYSBpbXBvcnQtc3RhdGVtZW50cyB2aWEgaW1wb3J0LW1hcHMuXG5cdFx0Ly8gREVWOiBGb3IgZWFjaCBDU1MgbW9kdWxlcyB0aGF0IHdlIGhhdmUgd2UgZGVmaW5lZCBhbiBlbnRyeSBpbiB0aGUgaW1wb3J0IG1hcCB0aGF0IG1hcHMgdG9cblx0XHQvLyBERVY6IGEgYmxvYiBVUkwgdGhhdCBsb2FkcyB0aGUgQ1NTIHZpYSBhIGR5bmFtaWMgQGltcG9ydC1ydWxlLlxuXHRcdC8vIERFViAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRcdGlmIChnbG9iYWxUaGlzLl9WU0NPREVfRElTQUJMRV9DU1NfSU1QT1JUX01BUCkge1xuXHRcdFx0cmV0dXJuOyAvLyBkaXNhYmxlZCBpbiBjZXJ0YWluIGRldmVsb3BtZW50IHNldHVwc1xuXHRcdH1cblxuXHRcdGlmIChBcnJheS5pc0FycmF5KGNvbmZpZ3VyYXRpb24uY3NzTW9kdWxlcykgJiYgY29uZmlndXJhdGlvbi5jc3NNb2R1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvd2lsbEFkZENzc0xvYWRlcicpO1xuXG5cdFx0XHRnbG9iYWxUaGlzLl9WU0NPREVfQ1NTX0xPQUQgPSBmdW5jdGlvbiAodXJsKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XG5cdFx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCdyZWwnLCAnc3R5bGVzaGVldCcpO1xuXHRcdFx0XHRsaW5rLnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0L2NzcycpO1xuXHRcdFx0XHRsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG5cblx0XHRcdFx0d2luZG93LmRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQobGluayk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBpbXBvcnRNYXA6IHsgaW1wb3J0czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9ID0geyBpbXBvcnRzOiB7fSB9O1xuXHRcdFx0Zm9yIChjb25zdCBjc3NNb2R1bGUgb2YgY29uZmlndXJhdGlvbi5jc3NNb2R1bGVzKSB7XG5cdFx0XHRcdGNvbnN0IGNzc1VybCA9IG5ldyBVUkwoY3NzTW9kdWxlLCBiYXNlVXJsKS5ocmVmO1xuXHRcdFx0XHRjb25zdCBqc1NyYyA9IGBnbG9iYWxUaGlzLl9WU0NPREVfQ1NTX0xPQUQoJyR7Y3NzVXJsfScpO1xcbmA7XG5cdFx0XHRcdGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbanNTcmNdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0JyB9KTtcblx0XHRcdFx0aW1wb3J0TWFwLmltcG9ydHNbY3NzVXJsXSA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHR0cCA9IHdpbmRvdy50cnVzdGVkVHlwZXM/LmNyZWF0ZVBvbGljeSgndnNjb2RlLWJvb3RzdHJhcEltcG9ydE1hcCcsIHsgY3JlYXRlU2NyaXB0KHZhbHVlKSB7IHJldHVybiB2YWx1ZTsgfSwgfSk7XG5cdFx0XHRjb25zdCBpbXBvcnRNYXBTcmMgPSBKU09OLnN0cmluZ2lmeShpbXBvcnRNYXAsIHVuZGVmaW5lZCwgMik7XG5cdFx0XHRjb25zdCBpbXBvcnRNYXBTY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcblx0XHRcdGltcG9ydE1hcFNjcmlwdC50eXBlID0gJ2ltcG9ydG1hcCc7XG5cdFx0XHRpbXBvcnRNYXBTY3JpcHQuc2V0QXR0cmlidXRlKCdub25jZScsICcwYzZhODI4ZjEyOTcnKTtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGltcG9ydE1hcFNjcmlwdC50ZXh0Q29udGVudCA9IHR0cD8uY3JlYXRlU2NyaXB0KGltcG9ydE1hcFNyYykgPz8gaW1wb3J0TWFwU3JjO1xuXHRcdFx0d2luZG93LmRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoaW1wb3J0TWFwU2NyaXB0KTtcblxuXHRcdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRBZGRDc3NMb2FkZXInKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRjb25zdCB7IHJlc3VsdCwgY29uZmlndXJhdGlvbiB9ID0gYXdhaXQgbG9hZDxJRGVza3RvcE1haW4sIElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uPihcblx0XHR7XG5cdFx0XHRjb25maWd1cmVEZXZlbG9wZXJTZXR0aW5nczogZnVuY3Rpb24gKHdpbmRvd0NvbmZpZykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC8vIGRpc2FibGUgYXV0b21hdGVkIGRldnRvb2xzIG9wZW5pbmcgb24gZXJyb3Igd2hlbiBydW5uaW5nIGV4dGVuc2lvbiB0ZXN0c1xuXHRcdFx0XHRcdC8vIGFzIHRoaXMgY2FuIGxlYWQgdG8gbm9uZGV0ZXJtaW5pc3RpYyB0ZXN0IGV4ZWN1dGlvbiAoZGV2dG9vbHMgc3RlYWxzIGZvY3VzKVxuXHRcdFx0XHRcdGZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3I6IHR5cGVvZiB3aW5kb3dDb25maWcuZXh0ZW5zaW9uVGVzdHNQYXRoID09PSAnc3RyaW5nJyB8fCB3aW5kb3dDb25maWdbJ2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlciddID09PSB0cnVlLFxuXHRcdFx0XHRcdC8vIGVuYWJsZSBkZXZ0b29scyBrZXliaW5kaW5ncyBpbiBleHRlbnNpb24gZGV2ZWxvcG1lbnQgd2luZG93XG5cdFx0XHRcdFx0Zm9yY2VFbmFibGVEZXZlbG9wZXJLZXliaW5kaW5nczogQXJyYXkuaXNBcnJheSh3aW5kb3dDb25maWcuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSAmJiB3aW5kb3dDb25maWcuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoLmxlbmd0aCA+IDAsXG5cdFx0XHRcdFx0cmVtb3ZlRGV2ZWxvcGVyS2V5YmluZGluZ3NBZnRlckxvYWQ6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRiZWZvcmVJbXBvcnQ6IGZ1bmN0aW9uICh3aW5kb3dDb25maWcpIHtcblxuXHRcdFx0XHQvLyBTaG93IG91ciBzcGxhc2ggYXMgZWFybHkgYXMgcG9zc2libGVcblx0XHRcdFx0c2hvd1NwbGFzaCh3aW5kb3dDb25maWcpO1xuXG5cdFx0XHRcdC8vIENvZGUgd2luZG93cyBoYXZlIGEgYHZzY29kZVdpbmRvd0lkYCBwcm9wZXJ0eSB0byBpZGVudGlmeSB0aGVtXG5cdFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aW5kb3csICd2c2NvZGVXaW5kb3dJZCcsIHtcblx0XHRcdFx0XHRnZXQ6ICgpID0+IHdpbmRvd0NvbmZpZy53aW5kb3dJZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBJdCBsb29rcyBsaWtlIGJyb3dzZXJzIG9ubHkgbGF6aWx5IGVuYWJsZVxuXHRcdFx0XHQvLyB0aGUgPGNhbnZhcz4gZWxlbWVudCB3aGVuIG5lZWRlZC4gU2luY2Ugd2Vcblx0XHRcdFx0Ly8gbGV2ZXJhZ2UgY2FudmFzIGVsZW1lbnRzIGluIG91ciBjb2RlIGluIG1hbnlcblx0XHRcdFx0Ly8gbG9jYXRpb25zLCB3ZSB0cnkgdG8gaGVscCB0aGUgYnJvd3NlciB0b1xuXHRcdFx0XHQvLyBpbml0aWFsaXplIGNhbnZhcyB3aGVuIGl0IGlzIGlkbGUsIHJpZ2h0XG5cdFx0XHRcdC8vIGJlZm9yZSB3ZSB3YWl0IGZvciB0aGUgc2NyaXB0cyB0byBiZSBsb2FkZWQuXG5cdFx0XHRcdHdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrKCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRcdFx0XHRjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0XHRcdFx0Y29udGV4dD8uY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XG5cdFx0XHRcdFx0Y2FudmFzLnJlbW92ZSgpO1xuXHRcdFx0XHR9LCB7IHRpbWVvdXQ6IDUwIH0pO1xuXG5cdFx0XHRcdC8vIFRyYWNrIGltcG9ydCgpIHBlcmZcblx0XHRcdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsTG9hZFdvcmtiZW5jaE1haW4nKTtcblx0XHRcdH1cblx0XHR9XG5cdCk7XG5cblx0Ly8gTWFyayBzdGFydCBvZiB3b3JrYmVuY2hcblx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRMb2FkV29ya2JlbmNoTWFpbicpO1xuXG5cdC8vIExvYWQgd29ya2JlbmNoXG5cdHJlc3VsdC5tYWluKGNvbmZpZ3VyYXRpb24pO1xufSgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJDQU9DLGlCQUFrQjtBQUdsQixjQUFZLEtBQUssdUJBQXVCO0FBU3hDLFFBQU0saUJBQWtCLE9BQTREO0FBQ3BGLFFBQU0sY0FBYyxlQUFlO0FBSW5DLFdBQVMsV0FBV0EsZ0JBQTJDO0FBQzlELGdCQUFZLEtBQUssMEJBQTBCO0FBQzNDLHNCQUFrQkEsY0FBYTtBQUMvQixnQkFBWSxLQUFLLHlCQUF5QjtBQUFBLEVBQzNDO0FBRUEsV0FBUyxrQkFBa0JBLGdCQUEyQztBQUNyRSxRQUFJLE9BQU9BLGVBQWM7QUFDekIsUUFBSSxNQUFNO0FBQ1QsVUFBSUEsZUFBYywwQkFBMEJBLGVBQWMsWUFBWSxjQUFjO0FBQ25GLFlBQUtBLGVBQWMsWUFBWSxRQUFRLEtBQUssY0FBYyxjQUFnQixDQUFDQSxlQUFjLFlBQVksUUFBUSxLQUFLLGNBQWMsWUFBYTtBQUM1SSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELFdBQVdBLGVBQWMsdUJBQXVCO0FBQy9DLFlBQUtBLGVBQWMsWUFBWSxRQUFRLEtBQUssY0FBYyxhQUFlLENBQUNBLGVBQWMsWUFBWSxRQUFRLEtBQUssY0FBYyxNQUFPO0FBQ3JJLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxRQUFRQSxlQUFjLDBCQUEwQjtBQUNuRCxXQUFLLGFBQWE7QUFBQSxJQUNuQjtBQUdBLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUksTUFBTTtBQUNULGtCQUFZLEtBQUs7QUFDakIsd0JBQWtCLEtBQUssVUFBVTtBQUNqQyx3QkFBa0IsS0FBSyxVQUFVO0FBQUEsSUFDbEMsV0FBV0EsZUFBYywwQkFBMEJBLGVBQWMsWUFBWSxjQUFjO0FBQzFGLFVBQUlBLGVBQWMsWUFBWSxNQUFNO0FBQ25DLG9CQUFZO0FBQ1osMEJBQWtCO0FBQ2xCLDBC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
