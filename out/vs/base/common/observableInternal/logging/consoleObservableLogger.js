import { addLogger } from "./logging.js";
import { getClassName } from "../debugName.js";
import { Derived } from "../observables/derivedImpl.js";
let consoleObservableLogger;
function logObservableToConsole(obs) {
  if (!consoleObservableLogger) {
    consoleObservableLogger = new ConsoleObservableLogger();
    addLogger(consoleObservableLogger);
  }
  consoleObservableLogger.addFilteredObj(obs);
}
class ConsoleObservableLogger {
  constructor() {
    this.indentation = 0;
    this.changedObservablesSets = /* @__PURE__ */ new WeakMap();
  }
  addFilteredObj(obj) {
    if (!this._filteredObjects) {
      this._filteredObjects = /* @__PURE__ */ new Set();
    }
    this._filteredObjects.add(obj);
  }
  _isIncluded(obj) {
    return this._filteredObjects?.has(obj) ?? true;
  }
  textToConsoleArgs(text) {
    return consoleTextToArgs([
      normalText(repeat("|  ", this.indentation)),
      text
    ]);
  }
  formatInfo(info) {
    if (!info.hadValue) {
      return [
        normalText(` `),
        styled(formatValue(info.newValue, 60), {
          color: "green"
        }),
        normalText(` (initial)`)
      ];
    }
    return info.didChange ? [
      normalText(` `),
      styled(formatValue(info.oldValue, 70), {
        color: "red",
        strikeThrough: true
      }),
      normalText(` `),
      styled(formatValue(info.newValue, 60), {
        color: "green"
      })
    ] : [normalText(` (unchanged)`)];
  }
  handleObservableCreated(observable) {
    if (observable instanceof Derived) {
      const derived = observable;
      this.changedObservablesSets.set(derived, /* @__PURE__ */ new Set());
      const debugTrackUpdating = false;
      if (debugTrackUpdating) {
        const updating = [];
        derived.__debugUpdating = updating;
        const existingBeginUpdate = derived.beginUpdate;
        derived.beginUpdate = (obs) => {
          updating.push(obs);
          return existingBeginUpdate.apply(derived, [obs]);
        };
        const existingEndUpdate = derived.endUpdate;
        derived.endUpdate = (obs) => {
          const idx = updating.indexOf(obs);
          if (idx === -1) {
            console.error("endUpdate called without beginUpdate", derived.debugName, obs.debugName);
          }
          updating.splice(idx, 1);
          return existingEndUpdate.apply(derived, [obs]);
        };
      }
    }
  }
  handleOnListenerCountChanged(observable, newCount) {
  }
  handleObservableUpdated(observable, info) {
    if (!this._isIncluded(observable)) {
      return;
    }
    if (observable instanceof Derived) {
      this._handleDerivedRecomputed(observable, info);
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("observable value changed"),
      styled(observable.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info)
    ]));
  }
  formatChanges(changes) {
    if (changes.size === 0) {
      return void 0;
    }
    return styled(
      " (changed deps: " + [...changes].map((o) => o.debugName).join(", ") + ")",
      { color: "gray" }
    );
  }
  handleDerivedDependencyChanged(derived, observable, change) {
    if (!this._isIncluded(derived)) {
      return;
    }
    this.changedObservablesSets.get(derived)?.add(observable);
  }
  _handleDerivedRecomputed(derived, info) {
    if (!this._isIncluded(derived)) {
      return;
    }
    const changedObservables = this.changedObservablesSets.get(derived);
    if (!changedObservables) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("derived recomputed"),
      styled(derived.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info),
      this.formatChanges(changedObservables),
      { data: [{ fn: derived._debugNameData.referenceFn ?? derived._computeFn }] }
    ]));
    changedObservables.clear();
  }
  handleDerivedCleared(derived) {
    if (!this._isIncluded(derived)) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("derived cleared"),
      styled(derived.debugName, { color: "BlueViolet" })
    ]));
  }
  handleFromEventObservableTriggered(observable, info) {
    if (!this._isIncluded(observable)) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("observable from event triggered"),
      styled(observable.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info),
      { data: [{ fn: observable._getValue }] }
    ]));
  }
  handleAutorunCreated(autorun) {
    if (!this._isIncluded(autorun)) {
      return;
    }
    this.changedObservablesSets.set(autorun, /* @__PURE__ */ new Set());
  }
  handleAutorunDisposed(autorun) {
  }
  handleAutorunDependencyChanged(autorun, observable, change) {
    if (!this._isIncluded(autorun)) {
      return;
    }
    this.changedObservablesSets.get(autorun).add(observable);
  }
  handleAutorunStarted(autorun) {
    const changedObservables = this.changedObservablesSets.get(autorun);
    if (!changedObservables) {
      return;
    }
    if (this._isIncluded(autorun)) {
      console.log(...this.textToConsoleArgs([
        formatKind("autorun"),
        styled(autorun.debugName, { color: "BlueViolet" }),
        this.formatChanges(changedObservables),
        { data: [{ fn: autorun._debugNameData.referenceFn ?? autorun._runFn }] }
      ]));
    }
    changedObservables.clear();
    this.indentation++;
  }
  handleAutorunFinished(autorun) {
    this.indentation--;
  }
  handleBeginTransaction(transaction) {
    let transactionName = transaction.getDebugName();
    if (transactionName === void 0) {
      transactionName = "";
    }
    if (this._isIncluded(transaction)) {
      console.log(...this.textToConsoleArgs([
        formatKind("transaction"),
        styled(transactionName, { color: "BlueViolet" }),
        { data: [{ fn: transaction._fn }] }
      ]));
    }
    this.indentation++;
  }
  handleEndTransaction() {
    this.indentation--;
  }
}
function consoleTextToArgs(text) {
  const styles = new Array();
  const data = [];
  let firstArg = "";
  function process(t) {
    if ("length" in t) {
      for (const item of t) {
        if (item) {
          process(item);
        }
      }
    } else if ("text" in t) {
      firstArg += `%c${t.text}`;
      styles.push(t.style);
      if (t.data) {
        data.push(...t.data);
      }
    } else if ("data" in t) {
      data.push(...t.data);
    }
  }
  process(text);
  const result = [firstArg, ...styles];
  result.push(...data);
  return result;
}
function normalText(text) {
  return styled(text, { color: "black" });
}
function formatKind(kind) {
  return styled(padStr(`${kind}: `, 10), { color: "black", bold: true });
}
function styled(text, options = {
  color: "black"
}) {
  function objToCss(styleObj) {
    return Object.entries(styleObj).reduce(
      (styleString, [propName, propValue]) => {
        return `${styleString}${propName}:${propValue};`;
      },
      ""
    );
  }
  const style = {
    color: options.color
  };
  if (options.strikeThrough) {
    style["text-decoration"] = "line-through";
  }
  if (options.bold) {
    style["font-weight"] = "bold";
  }
  return {
    text,
    style: objToCss(style)
  };
}
function formatValue(value, availableLen) {
  switch (typeof value) {
    case "number":
      return "" + value;
    case "string":
      if (value.length + 2 <= availableLen) {
        return `"${value}"`;
      }
      return `"${value.substr(0, availableLen - 7)}"+...`;
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return "undefined";
    case "object":
      if (value === null) {
        return "null";
      }
      if (Array.isArray(value)) {
        return formatArray(value, availableLen);
      }
      return formatObject(value, availableLen);
    case "symbol":
      return value.toString();
    case "function":
      return `[[Function${value.name ? " " + value.name : ""}]]`;
    default:
      return "" + value;
  }
}
function formatArray(value, availableLen) {
  let result = "[ ";
  let first = true;
  for (const val of value) {
    if (!first) {
      result += ", ";
    }
    if (result.length - 5 > availableLen) {
      result += "...";
      break;
    }
    first = false;
    result += `${formatValue(val, availableLen - result.length)}`;
  }
  result += " ]";
  return result;
}
function formatObject(value, availableLen) {
  if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
    const val = value.toString();
    if (val.length <= availableLen) {
      return val;
    }
    return val.substring(0, availableLen - 3) + "...";
  }
  const className = getClassName(value);
  let result = className ? className + "(" : "{ ";
  let first = true;
  for (const [key, val] of Object.entries(value)) {
    if (!first) {
      result += ", ";
    }
    if (result.length - 5 > availableLen) {
      result += "...";
      break;
    }
    first = false;
    result += `${key}: ${formatValue(val, availableLen - result.length)}`;
  }
  result += className ? ")" : " }";
  return result;
}
function repeat(str, count) {
  let result = "";
  for (let i = 1; i <= count; i++) {
    result += str;
  }
  return result;
}
function padStr(str, length) {
  while (str.length < length) {
    str += " ";
  }
  return str;
}
export {
  ConsoleObservableLogger,
  formatValue,
  logObservableToConsole
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcbG9nZ2luZ1xcY29uc29sZU9ic2VydmFibGVMb2dnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uL2Jhc2UuanMnO1xuaW1wb3J0IHsgVHJhbnNhY3Rpb25JbXBsIH0gZnJvbSAnLi4vdHJhbnNhY3Rpb24uanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGVMb2dnZXIsIElDaGFuZ2VJbmZvcm1hdGlvbiwgYWRkTG9nZ2VyIH0gZnJvbSAnLi9sb2dnaW5nLmpzJztcbmltcG9ydCB7IEZyb21FdmVudE9ic2VydmFibGUgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlRnJvbUV2ZW50LmpzJztcbmltcG9ydCB7IGdldENsYXNzTmFtZSB9IGZyb20gJy4uL2RlYnVnTmFtZS5qcyc7XG5pbXBvcnQgeyBEZXJpdmVkIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvZGVyaXZlZEltcGwuanMnO1xuaW1wb3J0IHsgQXV0b3J1bk9ic2VydmVyIH0gZnJvbSAnLi4vcmVhY3Rpb25zL2F1dG9ydW5JbXBsLmpzJztcblxubGV0IGNvbnNvbGVPYnNlcnZhYmxlTG9nZ2VyOiBDb25zb2xlT2JzZXJ2YWJsZUxvZ2dlciB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ09ic2VydmFibGVUb0NvbnNvbGUob2JzOiBJT2JzZXJ2YWJsZTxhbnk+KTogdm9pZCB7XG5cdGlmICghY29uc29sZU9ic2VydmFibGVMb2dnZXIpIHtcblx0XHRjb25zb2xlT2JzZXJ2YWJsZUxvZ2dlciA9IG5ldyBDb25zb2xlT2JzZXJ2YWJsZUxvZ2dlcigpO1xuXHRcdGFkZExvZ2dlcihjb25zb2xlT2JzZXJ2YWJsZUxvZ2dlcik7XG5cdH1cblx0Y29uc29sZU9ic2VydmFibGVMb2dnZXIuYWRkRmlsdGVyZWRPYmoob2JzKTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnNvbGVPYnNlcnZhYmxlTG9nZ2VyIGltcGxlbWVudHMgSU9ic2VydmFibGVMb2dnZXIge1xuXHRwcml2YXRlIGluZGVudGF0aW9uID0gMDtcblxuXHRwcml2YXRlIF9maWx0ZXJlZE9iamVjdHM6IFNldDx1bmtub3duPiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgYWRkRmlsdGVyZWRPYmoob2JqOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXJlZE9iamVjdHMpIHtcblx0XHRcdHRoaXMuX2ZpbHRlcmVkT2JqZWN0cyA9IG5ldyBTZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5fZmlsdGVyZWRPYmplY3RzLmFkZChvYmopO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNJbmNsdWRlZChvYmo6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyZWRPYmplY3RzPy5oYXMob2JqKSA/PyB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB0ZXh0VG9Db25zb2xlQXJncyh0ZXh0OiBDb25zb2xlVGV4dCk6IHVua25vd25bXSB7XG5cdFx0cmV0dXJuIGNvbnNvbGVUZXh0VG9BcmdzKFtcblx0XHRcdG5vcm1hbFRleHQocmVwZWF0KCd8ICAnLCB0aGlzLmluZGVudGF0aW9uKSksXG5cdFx0XHR0ZXh0LFxuXHRcdF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRJbmZvKGluZm86IElDaGFuZ2VJbmZvcm1hdGlvbik6IENvbnNvbGVUZXh0W10ge1xuXHRcdGlmICghaW5mby5oYWRWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bm9ybWFsVGV4dChgIGApLFxuXHRcdFx0XHRzdHlsZWQoZm9ybWF0VmFsdWUoaW5mby5uZXdWYWx1ZSwgNjApLCB7XG5cdFx0XHRcdFx0Y29sb3I6ICdncmVlbicsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRub3JtYWxUZXh0KGAgKGluaXRpYWwpYCksXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5mby5kaWRDaGFuZ2Vcblx0XHRcdD8gW1xuXHRcdFx0XHRub3JtYWxUZXh0KGAgYCksXG5cdFx0XHRcdHN0eWxlZChmb3JtYXRWYWx1ZShpbmZvLm9sZFZhbHVlLCA3MCksIHtcblx0XHRcdFx0XHRjb2xvcjogJ3JlZCcsXG5cdFx0XHRcdFx0c3RyaWtlVGhyb3VnaDogdHJ1ZSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdG5vcm1hbFRleHQoYCBgKSxcblx0XHRcdFx0c3R5bGVkKGZvcm1hdFZhbHVlKGluZm8ubmV3VmFsdWUsIDYwKSwge1xuXHRcdFx0XHRcdGNvbG9yOiAnZ3JlZW4nLFxuXHRcdFx0XHR9KSxcblx0XHRcdF1cblx0XHRcdDogW25vcm1hbFRleHQoYCAodW5jaGFuZ2VkKWApXTtcblx0fVxuXG5cdGhhbmRsZU9ic2VydmFibGVDcmVhdGVkKG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4pOiB2b2lkIHtcblx0XHRpZiAob2JzZXJ2YWJsZSBpbnN0YW5jZW9mIERlcml2ZWQpIHtcblx0XHRcdGNvbnN0IGRlcml2ZWQgPSBvYnNlcnZhYmxlO1xuXHRcdFx0dGhpcy5jaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzLnNldChkZXJpdmVkLCBuZXcgU2V0KCkpO1xuXG5cdFx0XHRjb25zdCBkZWJ1Z1RyYWNrVXBkYXRpbmcgPSBmYWxzZTtcblx0XHRcdGlmIChkZWJ1Z1RyYWNrVXBkYXRpbmcpIHtcblx0XHRcdFx0Y29uc3QgdXBkYXRpbmc6IElPYnNlcnZhYmxlPGFueT5bXSA9IFtdO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0KGRlcml2ZWQgYXMgYW55KS5fX2RlYnVnVXBkYXRpbmcgPSB1cGRhdGluZztcblxuXHRcdFx0XHRjb25zdCBleGlzdGluZ0JlZ2luVXBkYXRlID0gZGVyaXZlZC5iZWdpblVwZGF0ZTtcblx0XHRcdFx0ZGVyaXZlZC5iZWdpblVwZGF0ZSA9IChvYnMpID0+IHtcblx0XHRcdFx0XHR1cGRhdGluZy5wdXNoKG9icyk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nQmVnaW5VcGRhdGUuYXBwbHkoZGVyaXZlZCwgW29ic10pO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nRW5kVXBkYXRlID0gZGVyaXZlZC5lbmRVcGRhdGU7XG5cdFx0XHRcdGRlcml2ZWQuZW5kVXBkYXRlID0gKG9icykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlkeCA9IHVwZGF0aW5nLmluZGV4T2Yob2JzKTtcblx0XHRcdFx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcignZW5kVXBkYXRlIGNhbGxlZCB3aXRob3V0IGJlZ2luVXBkYXRlJywgZGVyaXZlZC5kZWJ1Z05hbWUsIG9icy5kZWJ1Z05hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR1cGRhdGluZy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdFbmRVcGRhdGUuYXBwbHkoZGVyaXZlZCwgW29ic10pO1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhhbmRsZU9uTGlzdGVuZXJDb3VudENoYW5nZWQob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55PiwgbmV3Q291bnQ6IG51bWJlcik6IHZvaWQge1xuXHR9XG5cblx0aGFuZGxlT2JzZXJ2YWJsZVVwZGF0ZWQob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8dW5rbm93bj4sIGluZm86IElDaGFuZ2VJbmZvcm1hdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNJbmNsdWRlZChvYnNlcnZhYmxlKSkgeyByZXR1cm47IH1cblx0XHRpZiAob2JzZXJ2YWJsZSBpbnN0YW5jZW9mIERlcml2ZWQpIHtcblx0XHRcdHRoaXMuX2hhbmRsZURlcml2ZWRSZWNvbXB1dGVkKG9ic2VydmFibGUsIGluZm8pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnNvbGUubG9nKC4uLnRoaXMudGV4dFRvQ29uc29sZUFyZ3MoW1xuXHRcdFx0Zm9ybWF0S2luZCgnb2JzZXJ2YWJsZSB2YWx1ZSBjaGFuZ2VkJyksXG5cdFx0XHRzdHlsZWQob2JzZXJ2YWJsZS5kZWJ1Z05hbWUsIHsgY29sb3I6ICdCbHVlVmlvbGV0JyB9KSxcblx0XHRcdC4uLnRoaXMuZm9ybWF0SW5mbyhpbmZvKSxcblx0XHRdKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZWRPYnNlcnZhYmxlc1NldHMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFNldDxJT2JzZXJ2YWJsZTxhbnk+Pj4oKTtcblxuXHRmb3JtYXRDaGFuZ2VzKGNoYW5nZXM6IFNldDxJT2JzZXJ2YWJsZTxhbnk+Pik6IENvbnNvbGVUZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoY2hhbmdlcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc3R5bGVkKFxuXHRcdFx0JyAoY2hhbmdlZCBkZXBzOiAnICtcblx0XHRcdFsuLi5jaGFuZ2VzXS5tYXAoKG8pID0+IG8uZGVidWdOYW1lKS5qb2luKCcsICcpICtcblx0XHRcdCcpJyxcblx0XHRcdHsgY29sb3I6ICdncmF5JyB9XG5cdFx0KTtcblx0fVxuXG5cdGhhbmRsZURlcml2ZWREZXBlbmRlbmN5Q2hhbmdlZChkZXJpdmVkOiBEZXJpdmVkPGFueT4sIG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4sIGNoYW5nZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNJbmNsdWRlZChkZXJpdmVkKSkgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuY2hhbmdlZE9ic2VydmFibGVzU2V0cy5nZXQoZGVyaXZlZCk/LmFkZChvYnNlcnZhYmxlKTtcblx0fVxuXG5cdF9oYW5kbGVEZXJpdmVkUmVjb21wdXRlZChkZXJpdmVkOiBEZXJpdmVkPHVua25vd24+LCBpbmZvOiBJQ2hhbmdlSW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQoZGVyaXZlZCkpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBjaGFuZ2VkT2JzZXJ2YWJsZXMgPSB0aGlzLmNoYW5nZWRPYnNlcnZhYmxlc1NldHMuZ2V0KGRlcml2ZWQpO1xuXHRcdGlmICghY2hhbmdlZE9ic2VydmFibGVzKSB7IHJldHVybjsgfVxuXHRcdGNvbnNvbGUubG9nKC4uLnRoaXMudGV4dFRvQ29uc29sZUFyZ3MoW1xuXHRcdFx0Zm9ybWF0S2luZCgnZGVyaXZlZCByZWNvbXB1dGVkJyksXG5cdFx0XHRzdHlsZWQoZGVyaXZlZC5kZWJ1Z05hbWUsIHsgY29sb3I6ICdCbHVlVmlvbGV0JyB9KSxcblx0XHRcdC4uLnRoaXMuZm9ybWF0SW5mbyhpbmZvKSxcblx0XHRcdHRoaXMuZm9ybWF0Q2hhbmdlcyhjaGFuZ2VkT2JzZXJ2YWJsZXMpLFxuXHRcdFx0eyBkYXRhOiBbeyBmbjogZGVyaXZlZC5fZGVidWdOYW1lRGF0YS5yZWZlcmVuY2VGbiA/PyBkZXJpdmVkLl9jb21wdXRlRm4gfV0gfVxuXHRcdF0pKTtcblx0XHRjaGFuZ2VkT2JzZXJ2YWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGhhbmRsZURlcml2ZWRDbGVhcmVkKGRlcml2ZWQ6IERlcml2ZWQ8dW5rbm93bj4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQoZGVyaXZlZCkpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zb2xlLmxvZyguLi50aGlzLnRleHRUb0NvbnNvbGVBcmdzKFtcblx0XHRcdGZvcm1hdEtpbmQoJ2Rlcml2ZWQgY2xlYXJlZCcpLFxuXHRcdFx0c3R5bGVkKGRlcml2ZWQuZGVidWdOYW1lLCB7IGNvbG9yOiAnQmx1ZVZpb2xldCcgfSksXG5cdFx0XSkpO1xuXHR9XG5cblx0aGFuZGxlRnJvbUV2ZW50T2JzZXJ2YWJsZVRyaWdnZXJlZChvYnNlcnZhYmxlOiBGcm9tRXZlbnRPYnNlcnZhYmxlPGFueSwgYW55PiwgaW5mbzogSUNoYW5nZUluZm9ybWF0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0luY2x1ZGVkKG9ic2VydmFibGUpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc29sZS5sb2coLi4udGhpcy50ZXh0VG9Db25zb2xlQXJncyhbXG5cdFx0XHRmb3JtYXRLaW5kKCdvYnNlcnZhYmxlIGZyb20gZXZlbnQgdHJpZ2dlcmVkJyksXG5cdFx0XHRzdHlsZWQob2JzZXJ2YWJsZS5kZWJ1Z05hbWUsIHsgY29sb3I6ICdCbHVlVmlvbGV0JyB9KSxcblx0XHRcdC4uLnRoaXMuZm9ybWF0SW5mbyhpbmZvKSxcblx0XHRcdHsgZGF0YTogW3sgZm46IG9ic2VydmFibGUuX2dldFZhbHVlIH1dIH1cblx0XHRdKSk7XG5cdH1cblxuXHRoYW5kbGVBdXRvcnVuQ3JlYXRlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQoYXV0b3J1bikpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLmNoYW5nZWRPYnNlcnZhYmxlc1NldHMuc2V0KGF1dG9ydW4sIG5ldyBTZXQoKSk7XG5cdH1cblxuXHRoYW5kbGVBdXRvcnVuRGlzcG9zZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyKTogdm9pZCB7XG5cdH1cblxuXHRoYW5kbGVBdXRvcnVuRGVwZW5kZW5jeUNoYW5nZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyLCBvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+LCBjaGFuZ2U6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQoYXV0b3J1bikpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLmNoYW5nZWRPYnNlcnZhYmxlc1NldHMuZ2V0KGF1dG9ydW4pIS5hZGQob2JzZXJ2YWJsZSk7XG5cdH1cblxuXHRoYW5kbGVBdXRvcnVuU3RhcnRlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkT2JzZXJ2YWJsZXMgPSB0aGlzLmNoYW5nZWRPYnNlcnZhYmxlc1NldHMuZ2V0KGF1dG9ydW4pO1xuXHRcdGlmICghY2hhbmdlZE9ic2VydmFibGVzKSB7IHJldHVybjsgfVxuXG5cdFx0aWYgKHRoaXMuX2lzSW5jbHVkZWQoYXV0b3J1bikpIHtcblx0XHRcdGNvbnNvbGUubG9nKC4uLnRoaXMudGV4dFRvQ29uc29sZUFyZ3MoW1xuXHRcdFx0XHRmb3JtYXRLaW5kKCdhdXRvcnVuJyksXG5cdFx0XHRcdHN0eWxlZChhdXRvcnVuLmRlYnVnTmFtZSwgeyBjb2xvcjogJ0JsdWVWaW9sZXQnIH0pLFxuXHRcdFx0XHR0aGlzLmZvcm1hdENoYW5nZXMoY2hhbmdlZE9ic2VydmFibGVzKSxcblx0XHRcdFx0eyBkYXRhOiBbeyBmbjogYXV0b3J1bi5fZGVidWdOYW1lRGF0YS5yZWZlcmVuY2VGbiA/PyBhdXRvcnVuLl9ydW5GbiB9XSB9XG5cdFx0XHRdKSk7XG5cdFx0fVxuXHRcdGNoYW5nZWRPYnNlcnZhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuaW5kZW50YXRpb24rKztcblx0fVxuXG5cdGhhbmRsZUF1dG9ydW5GaW5pc2hlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHR0aGlzLmluZGVudGF0aW9uLS07XG5cdH1cblxuXHRoYW5kbGVCZWdpblRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uOiBUcmFuc2FjdGlvbkltcGwpOiB2b2lkIHtcblx0XHRsZXQgdHJhbnNhY3Rpb25OYW1lID0gdHJhbnNhY3Rpb24uZ2V0RGVidWdOYW1lKCk7XG5cdFx0aWYgKHRyYW5zYWN0aW9uTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cmFuc2FjdGlvbk5hbWUgPSAnJztcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzSW5jbHVkZWQodHJhbnNhY3Rpb24pKSB7XG5cdFx0XHRjb25zb2xlLmxvZyguLi50aGlzLnRleHRUb0NvbnNvbGVBcmdzKFtcblx0XHRcdFx0Zm9ybWF0S2luZCgndHJhbnNhY3Rpb24nKSxcblx0XHRcdFx0c3R5bGVkKHRyYW5zYWN0aW9uTmFtZSwgeyBjb2xvcjogJ0JsdWVWaW9sZXQnIH0pLFxuXHRcdFx0XHR7IGRhdGE6IFt7IGZuOiB0cmFuc2FjdGlvbi5fZm4gfV0gfVxuXHRcdFx0XSkpO1xuXHRcdH1cblx0XHR0aGlzLmluZGVudGF0aW9uKys7XG5cdH1cblxuXHRoYW5kbGVFbmRUcmFuc2FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLmluZGVudGF0aW9uLS07XG5cdH1cbn1cbnR5cGUgQ29uc29sZVRleHQgPSAoQ29uc29sZVRleHQgfCB1bmRlZmluZWQpW10gfFxueyB0ZXh0OiBzdHJpbmc7IHN0eWxlOiBzdHJpbmc7IGRhdGE/OiB1bmtub3duW10gfSB8XG57IGRhdGE6IHVua25vd25bXSB9O1xuZnVuY3Rpb24gY29uc29sZVRleHRUb0FyZ3ModGV4dDogQ29uc29sZVRleHQpOiB1bmtub3duW10ge1xuXHRjb25zdCBzdHlsZXMgPSBuZXcgQXJyYXk8YW55PigpO1xuXHRjb25zdCBkYXRhOiB1bmtub3duW10gPSBbXTtcblx0bGV0IGZpcnN0QXJnID0gJyc7XG5cblx0ZnVuY3Rpb24gcHJvY2Vzcyh0OiBDb25zb2xlVGV4dCk6IHZvaWQge1xuXHRcdGlmICgnbGVuZ3RoJyBpbiB0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdCkge1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdHByb2Nlc3MoaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCd0ZXh0JyBpbiB0KSB7XG5cdFx0XHRmaXJzdEFyZyArPSBgJWMke3QudGV4dH1gO1xuXHRcdFx0c3R5bGVzLnB1c2godC5zdHlsZSk7XG5cdFx0XHRpZiAodC5kYXRhKSB7XG5cdFx0XHRcdGRhdGEucHVzaCguLi50LmRhdGEpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoJ2RhdGEnIGluIHQpIHtcblx0XHRcdGRhdGEucHVzaCguLi50LmRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHByb2Nlc3ModGV4dCk7XG5cblx0Y29uc3QgcmVzdWx0ID0gW2ZpcnN0QXJnLCAuLi5zdHlsZXNdO1xuXHRyZXN1bHQucHVzaCguLi5kYXRhKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIG5vcm1hbFRleHQodGV4dDogc3RyaW5nKTogQ29uc29sZVRleHQge1xuXHRyZXR1cm4gc3R5bGVkKHRleHQsIHsgY29sb3I6ICdibGFjaycgfSk7XG59XG5mdW5jdGlvbiBmb3JtYXRLaW5kKGtpbmQ6IHN0cmluZyk6IENvbnNvbGVUZXh0IHtcblx0cmV0dXJuIHN0eWxlZChwYWRTdHIoYCR7a2luZH06IGAsIDEwKSwgeyBjb2xvcjogJ2JsYWNrJywgYm9sZDogdHJ1ZSB9KTtcbn1cbmZ1bmN0aW9uIHN0eWxlZChcblx0dGV4dDogc3RyaW5nLFxuXHRvcHRpb25zOiB7IGNvbG9yOiBzdHJpbmc7IHN0cmlrZVRocm91Z2g/OiBib29sZWFuOyBib2xkPzogYm9vbGVhbiB9ID0ge1xuXHRcdGNvbG9yOiAnYmxhY2snLFxuXHR9XG4pOiBDb25zb2xlVGV4dCB7XG5cdGZ1bmN0aW9uIG9ialRvQ3NzKHN0eWxlT2JqOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gT2JqZWN0LmVudHJpZXMoc3R5bGVPYmopLnJlZHVjZShcblx0XHRcdChzdHlsZVN0cmluZywgW3Byb3BOYW1lLCBwcm9wVmFsdWVdKSA9PiB7XG5cdFx0XHRcdHJldHVybiBgJHtzdHlsZVN0cmluZ30ke3Byb3BOYW1lfToke3Byb3BWYWx1ZX07YDtcblx0XHRcdH0sXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH1cblxuXHRjb25zdCBzdHlsZTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRjb2xvcjogb3B0aW9ucy5jb2xvcixcblx0fTtcblx0aWYgKG9wdGlvbnMuc3RyaWtlVGhyb3VnaCkge1xuXHRcdHN0eWxlWyd0ZXh0LWRlY29yYXRpb24nXSA9ICdsaW5lLXRocm91Z2gnO1xuXHR9XG5cdGlmIChvcHRpb25zLmJvbGQpIHtcblx0XHRzdHlsZVsnZm9udC13ZWlnaHQnXSA9ICdib2xkJztcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0dGV4dCxcblx0XHRzdHlsZTogb2JqVG9Dc3Moc3R5bGUpLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0VmFsdWUodmFsdWU6IHVua25vd24sIGF2YWlsYWJsZUxlbjogbnVtYmVyKTogc3RyaW5nIHtcblx0c3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcblx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0cmV0dXJuICcnICsgdmFsdWU7XG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdGlmICh2YWx1ZS5sZW5ndGggKyAyIDw9IGF2YWlsYWJsZUxlbikge1xuXHRcdFx0XHRyZXR1cm4gYFwiJHt2YWx1ZX1cImA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYFwiJHt2YWx1ZS5zdWJzdHIoMCwgYXZhaWxhYmxlTGVuIC0gNyl9XCIrLi4uYDtcblxuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIHZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJztcblx0XHRjYXNlICd1bmRlZmluZWQnOlxuXHRcdFx0cmV0dXJuICd1bmRlZmluZWQnO1xuXHRcdGNhc2UgJ29iamVjdCc6XG5cdFx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuICdudWxsJztcblx0XHRcdH1cblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gZm9ybWF0QXJyYXkodmFsdWUsIGF2YWlsYWJsZUxlbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZm9ybWF0T2JqZWN0KHZhbHVlLCBhdmFpbGFibGVMZW4pO1xuXHRcdGNhc2UgJ3N5bWJvbCc6XG5cdFx0XHRyZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcblx0XHRjYXNlICdmdW5jdGlvbic6XG5cdFx0XHRyZXR1cm4gYFtbRnVuY3Rpb24ke3ZhbHVlLm5hbWUgPyAnICcgKyB2YWx1ZS5uYW1lIDogJyd9XV1gO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gJycgKyB2YWx1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheSh2YWx1ZTogdW5rbm93bltdLCBhdmFpbGFibGVMZW46IG51bWJlcik6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnWyAnO1xuXHRsZXQgZmlyc3QgPSB0cnVlO1xuXHRmb3IgKGNvbnN0IHZhbCBvZiB2YWx1ZSkge1xuXHRcdGlmICghZmlyc3QpIHtcblx0XHRcdHJlc3VsdCArPSAnLCAnO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCAtIDUgPiBhdmFpbGFibGVMZW4pIHtcblx0XHRcdHJlc3VsdCArPSAnLi4uJztcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRmaXJzdCA9IGZhbHNlO1xuXHRcdHJlc3VsdCArPSBgJHtmb3JtYXRWYWx1ZSh2YWwsIGF2YWlsYWJsZUxlbiAtIHJlc3VsdC5sZW5ndGgpfWA7XG5cdH1cblx0cmVzdWx0ICs9ICcgXSc7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE9iamVjdCh2YWx1ZTogb2JqZWN0LCBhdmFpbGFibGVMZW46IG51bWJlcik6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgdmFsdWUudG9TdHJpbmcgPT09ICdmdW5jdGlvbicgJiYgdmFsdWUudG9TdHJpbmcgIT09IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcpIHtcblx0XHRjb25zdCB2YWwgPSB2YWx1ZS50b1N0cmluZygpO1xuXHRcdGlmICh2YWwubGVuZ3RoIDw9IGF2YWlsYWJsZUxlbikge1xuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbC5zdWJzdHJpbmcoMCwgYXZhaWxhYmxlTGVuIC0gMykgKyAnLi4uJztcblx0fVxuXG5cdGNvbnN0IGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZSh2YWx1ZSk7XG5cblx0bGV0IHJlc3VsdCA9IGNsYXNzTmFtZSA/IGNsYXNzTmFtZSArICcoJyA6ICd7ICc7XG5cdGxldCBmaXJzdCA9IHRydWU7XG5cdGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZSkpIHtcblx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRyZXN1bHQgKz0gJywgJztcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggLSA1ID4gYXZhaWxhYmxlTGVuKSB7XG5cdFx0XHRyZXN1bHQgKz0gJy4uLic7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRyZXN1bHQgKz0gYCR7a2V5fTogJHtmb3JtYXRWYWx1ZSh2YWwsIGF2YWlsYWJsZUxlbiAtIHJlc3VsdC5sZW5ndGgpfWA7XG5cdH1cblx0cmVzdWx0ICs9IGNsYXNzTmFtZSA/ICcpJyA6ICcgfSc7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHJlcGVhdChzdHI6IHN0cmluZywgY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gY291bnQ7IGkrKykge1xuXHRcdHJlc3VsdCArPSBzdHI7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcGFkU3RyKHN0cjogc3RyaW5nLCBsZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdHdoaWxlIChzdHIubGVuZ3RoIDwgbGVuZ3RoKSB7XG5cdFx0c3RyICs9ICcgJztcblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBZ0QsaUJBQWlCO0FBRWpFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUd4QixJQUFJO0FBRUcsU0FBUyx1QkFBdUIsS0FBNkI7QUFDbkUsTUFBSSxDQUFDLHlCQUF5QjtBQUM3Qiw4QkFBMEIsSUFBSSx3QkFBd0I7QUFDdEQsY0FBVSx1QkFBdUI7QUFBQSxFQUNsQztBQUNBLDBCQUF3QixlQUFlLEdBQUc7QUFDM0M7QUFFTyxNQUFNLHdCQUFxRDtBQUFBLEVBQTNEO0FBQ04sU0FBUSxjQUFjO0FBOEZ0QixTQUFpQix5QkFBeUIsb0JBQUksUUFBdUM7QUFBQTtBQUFBLEVBMUY5RSxlQUFlLEtBQW9CO0FBQ3pDLFFBQUksQ0FBQyxLQUFLLGtCQUFrQjtBQUMzQixXQUFLLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsSUFDakM7QUFDQSxTQUFLLGlCQUFpQixJQUFJLEdBQUc7QUFBQSxFQUM5QjtBQUFBLEVBRVEsWUFBWSxLQUF1QjtBQUMxQyxXQUFPLEtBQUssa0JBQWtCLElBQUksR0FBRyxLQUFLO0FBQUEsRUFDM0M7QUFBQSxFQUVRLGtCQUFrQixNQUE4QjtBQUN2RCxXQUFPLGtCQUFrQjtBQUFBLE1BQ3hCLFdBQVcsT0FBTyxPQUFPLEtBQUssV0FBVyxDQUFDO0FBQUEsTUFDMUM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxXQUFXLE1BQXlDO0FBQzNELFFBQUksQ0FBQyxLQUFLLFVBQVU7QUFDbkIsYUFBTztBQUFBLFFBQ04sV0FBVyxHQUFHO0FBQUEsUUFDZCxPQUFPLFlBQVksS0FBSyxVQUFVLEVBQUUsR0FBRztBQUFBLFVBQ3RDLE9BQU87QUFBQSxRQUNS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
