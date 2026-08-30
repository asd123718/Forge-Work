import { timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { isKeyModified } from "../common/quickInput.js";
import { isFunction } from "../../../base/common/types.js";
var TriggerAction = /* @__PURE__ */ ((TriggerAction2) => {
  TriggerAction2[TriggerAction2["NO_ACTION"] = 0] = "NO_ACTION";
  TriggerAction2[TriggerAction2["CLOSE_PICKER"] = 1] = "CLOSE_PICKER";
  TriggerAction2[TriggerAction2["REFRESH_PICKER"] = 2] = "REFRESH_PICKER";
  TriggerAction2[TriggerAction2["REMOVE_ITEM"] = 3] = "REMOVE_ITEM";
  return TriggerAction2;
})(TriggerAction || {});
function isPicksWithActive(obj) {
  const candidate = obj;
  return Array.isArray(candidate.items);
}
function isFastAndSlowPicks(obj) {
  const candidate = obj;
  return !!candidate.picks && candidate.additionalPicks instanceof Promise;
}
class PickerQuickAccessProvider extends Disposable {
  constructor(prefix, options) {
    super();
    this.prefix = prefix;
    this.options = options;
  }
  provide(picker, token, runOptions) {
    const disposables = new DisposableStore();
    picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
    picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;
    let picksCts = void 0;
    const picksDisposable = disposables.add(new MutableDisposable());
    const updatePickerItems = async () => {
      picksCts?.dispose(true);
      picker.busy = false;
      const picksDisposables = picksDisposable.value = new DisposableStore();
      picksCts = picksDisposables.add(new CancellationTokenSource(token));
      const picksToken = picksCts.token;
      let picksFilter = picker.value.substring(this.prefix.length);
      if (!this.options?.shouldSkipTrimPickFilter) {
        picksFilter = picksFilter.trim();
      }
      const providedPicks = this._getPicks(picksFilter, picksDisposables, picksToken, runOptions);
      const applyPicks = (picks, skipEmpty) => {
        let items;
        let activeItem = void 0;
        if (isPicksWithActive(picks)) {
          items = picks.items;
          activeItem = picks.active;
        } else {
          items = picks;
        }
        if (items.length === 0) {
          if (skipEmpty) {
            return false;
          }
          if ((picksFilter.length > 0 || picker.hideInput) && this.options?.noResultsPick) {
            if (isFunction(this.options.noResultsPick)) {
              items = [this.options.noResultsPick(picksFilter)];
            } else {
              items = [this.options.noResultsPick];
            }
          }
        }
        picker.items = items;
        if (activeItem) {
          picker.activeItems = [activeItem];
        }
        return true;
      };
      const applyFastAndSlowPicks = async (fastAndSlowPicks) => {
        let fastPicksApplied = false;
        let slowPicksApplied = false;
        await Promise.all([
          // Fast Picks: if `mergeDelay` is configured, in order to reduce
          // amount of flicker, we race against the slow picks over some delay
          // and then set the fast picks.
          // If the slow picks are faster, we reduce the flicker by only
          // setting the items once.
          (async () => {
            if (typeof fastAndSlowPicks.mergeDelay === "number") {
              await timeout(fastAndSlowPicks.mergeDelay);
              if (picksToken.isCancellationRequested) {
                return;
              }
            }
            if (!slowPicksApplied) {
              fastPicksApplied = applyPicks(
                fastAndSlowPicks.picks,
                true
                /* skip over empty to reduce flicker */
              );
            }
          })(),
          // Slow Picks: we await the slow picks and then set them at
          // once together with the fast picks, but only if we actually
          // have additional results.
          (async () => {
            picker.busy = true;
            try {
              const awaitedAdditionalPicks = await fastAndSlowPicks.additionalPicks;
              if (picksToken.isCancellationRequested) {
                return;
              }
              let picks;
              let activePick = void 0;
              if (isPicksWithActive(fastAndSlowPicks.picks)) {
                picks = fastAndSlowPicks.picks.items;
                activePick = fastAndSlowPicks.picks.active;
              } else {
                picks = fastAndSlowPicks.picks;
              }
              let additionalPicks;
              let additionalActivePick = void 0;
              if (isPicksWithActive(awaitedAdditionalPicks)) {
                additionalPicks = awaitedAdditionalPicks.items;
                additionalActivePick = awaitedAdditionalPicks.active;
              } else {
                additionalPicks = awaitedAdditionalPicks;
              }
              if (additionalPicks.length > 0 || !fastPicksApplied) {
                let fallbackActivePick = void 0;
                if (!activePick && !additionalActivePick) {
                  const fallbackActivePickCandidate = picker.activeItems[0];
                  if (fallbackActivePickCandidate && picks.indexOf(fallbackActivePickCandidate) !== -1) {
                    fallbackActivePick = fallbackActivePickCandidate;
                  }
                }
                applyPicks({
                  items: [...picks, ...additionalPicks],
                  active: activePick || additionalActivePick || fallbackActivePick
                });
              }
            } finally {
              if (!picksToken.isCancellationRequested) {
                picker.busy = false;
              }
              slowPicksApplied = true;
            }
          })()
        ]);
      };
      if (providedPicks === null) {
      } else if (isFastAndSlowPicks(providedPicks)) {
        await applyFastAndSlowPicks(providedPicks);
      } else if (!(providedPicks instanceof Promise)) {
        applyPicks(providedPicks);
      } else {
        picker.busy = true;
        try {
          const awaitedPicks = await providedPicks;
          if (picksToken.isCancellationRequested) {
            return;
          }
          if (isFastAndSlowPicks(awaitedPicks)) {
            await applyFastAndSlowPicks(awaitedPicks);
          } else {
            applyPicks(awaitedPicks);
          }
        } finally {
          if (!picksToken.isCancellationRequested) {
            picker.busy = false;
          }
        }
      }
    };
    disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
    updatePickerItems();
    disposables.add(picker.onDidAccept((event) => {
      if (runOptions?.handleAccept) {
        if (!event.inBackground) {
          picker.hide();
        }
        runOptions.handleAccept?.(picker.activeItems[0], event.inBackground);
        return;
      }
      const [item] = picker.selectedItems;
      if (typeof item?.accept === "function") {
        const isAttachAction = isKeyModified(picker.keyMods) && !!item.attach;
        if (isAttachAction) {
          item.attach(picker.keyMods, event);
          return;
        }
        if (!event.inBackground) {
          picker.hide();
        }
        item.accept(picker.keyMods, event);
      }
    }));
    const buttonTrigger = async (button, item) => {
      if (typeof item.trigger !== "function") {
        return;
      }
      const buttonIndex = item.buttons?.indexOf(button) ?? -1;
      if (buttonIndex >= 0) {
        const result = item.trigger(buttonIndex, picker.keyMods);
        const action = typeof result === "number" ? result : await result;
        if (token.isCancellationRequested) {
          return;
        }
        switch (action) {
          case 0 /* NO_ACTION */:
            break;
          case 1 /* CLOSE_PICKER */:
            picker.hide();
            break;
          case 2 /* REFRESH_PICKER */:
            updatePickerItems();
            break;
          case 3 /* REMOVE_ITEM */: {
            const index = picker.items.indexOf(item);
            if (index !== -1) {
              const items = picker.items.slice();
              const removed = items.splice(index, 1);
              const activeItems = picker.activeItems.filter((activeItem) => activeItem !== removed[0]);
              const keepScrollPositionBefore = picker.keepScrollPosition;
              picker.keepScrollPosition = true;
              picker.items = items;
              if (activeItems) {
                picker.activeItems = activeItems;
              }
              picker.keepScrollPosition = keepScrollPositionBefore;
            }
            break;
          }
        }
      }
    };
    disposables.add(picker.onDidTriggerItemButton(({ button, item }) => buttonTrigger(button, item)));
    disposables.add(picker.onDidTriggerSeparatorButton(({ button, separator }) => buttonTrigger(button, separator)));
    return disposables;
  }
}
export {
  PickerQuickAccessProvider,
  TriggerAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxccGlja2VyUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElLZXlNb2RzLCBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQsIElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dEJ1dHRvbiwgaXNLZXlNb2RpZmllZCB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1Byb3ZpZGVyLCBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgaXNGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGVudW0gVHJpZ2dlckFjdGlvbiB7XG5cblx0LyoqXG5cdCAqIERvIG5vdGhpbmcgYWZ0ZXIgdGhlIGJ1dHRvbiB3YXMgY2xpY2tlZC5cblx0ICovXG5cdE5PX0FDVElPTixcblxuXHQvKipcblx0ICogQ2xvc2UgdGhlIHBpY2tlci5cblx0ICovXG5cdENMT1NFX1BJQ0tFUixcblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSByZXN1bHRzIG9mIHRoZSBwaWNrZXIuXG5cdCAqL1xuXHRSRUZSRVNIX1BJQ0tFUixcblxuXHQvKipcblx0ICogUmVtb3ZlIHRoZSBpdGVtIGZyb20gdGhlIHBpY2tlci5cblx0ICovXG5cdFJFTU9WRV9JVEVNXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblxuXHQvKipcblx0KiBBIG1ldGhvZCB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgd2hlbiB0aGUgcGljayBpdGVtIGlzIGFjY2VwdGVkIGZyb21cblx0KiB0aGUgcGlja2VyLiBUaGUgcGlja2VyIHdpbGwgY2xvc2UgYXV0b21hdGljYWxseSBiZWZvcmUgcnVubmluZyB0aGlzLlxuXHQqXG5cdCogQHBhcmFtIGtleU1vZHMgdGhlIHN0YXRlIG9mIG1vZGlmaWVyIGtleXMgd2hlbiB0aGUgaXRlbSB3YXMgYWNjZXB0ZWQuXG5cdCogQHBhcmFtIGV2ZW50IHRoZSB1bmRlcmx5aW5nIGV2ZW50IHRoYXQgY2F1c2VkIHRoZSBhY2NlcHQgdG8gdHJpZ2dlci5cblx0Ki9cblx0YWNjZXB0PyhrZXlNb2RzOiBJS2V5TW9kcywgZXZlbnQ6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEEgbWV0aG9kIHRoYXQgd2lsbCBiZSBleGVjdXRlZCB3aGVuIGEgYnV0dG9uIG9mIHRoZSBwaWNrIGl0ZW0gd2FzXG5cdCAqIGNsaWNrZWQgb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBidXR0b25JbmRleCBpbmRleCBvZiB0aGUgYnV0dG9uIG9mIHRoZSBpdGVtIHRoYXRcblx0ICogd2FzIGNsaWNrZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBrZXlNb2RzIHRoZSBzdGF0ZSBvZiBtb2RpZmllciBrZXlzIHdoZW4gdGhlIGJ1dHRvbiB3YXMgdHJpZ2dlcmVkLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoYXQgc2hvdWxkIGhhcHBlbiBhZnRlciB0aGUgdHJpZ2dlclxuXHQgKiB3aGljaCBjYW4gYmUgYSBgUHJvbWlzZWAgZm9yIGxvbmcgcnVubmluZyBvcGVyYXRpb25zLlxuXHQgKi9cblx0dHJpZ2dlcj8oYnV0dG9uSW5kZXg6IG51bWJlciwga2V5TW9kczogSUtleU1vZHMpOiBUcmlnZ2VyQWN0aW9uIHwgUHJvbWlzZTxUcmlnZ2VyQWN0aW9uPjtcblxuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoaXMgd2lsbCBiZSBpbnZva2VkIGluc3RlYWQgb2YgYGFjY2VwdGAgaWYgbW9kaWZpZXIga2V5cyBhcmUgaGVsZCBkb3duLlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCBmb3IgYWN0aW9ucyBsaWtlIFwiYXR0YWNoIHRvIGNvbnRleHRcIiB3aGVyZSB5b3Ugd2FudCB0byBrZWVwIHRoZSBwaWNrZXJcblx0ICogb3BlbiBhbmQgYWxsb3cgbXVsdGlwbGUgcGlja3MuXG5cdCAqXG5cdCAqIEBwYXJhbSBrZXlNb2RzIHRoZSBzdGF0ZSBvZiBtb2RpZmllciBrZXlzIHdoZW4gdGhlIGl0ZW0gd2FzIGFjY2VwdGVkLlxuXHQgKiBAcGFyYW0gZXZlbnQgdGhlIHVuZGVybHlpbmcgZXZlbnQgdGhhdCBjYXVzZWQgdGhpcyB0byB0cmlnZ2VyLlxuXHQgKi9cblx0YXR0YWNoPyhrZXlNb2RzOiBJS2V5TW9kcywgZXZlbnQ6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBpY2tlclF1aWNrQWNjZXNzU2VwYXJhdG9yIGV4dGVuZHMgSVF1aWNrUGlja1NlcGFyYXRvciB7XG5cdC8qKlxuXHQgKiBBIG1ldGhvZCB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgd2hlbiBhIGJ1dHRvbiBvZiB0aGUgcGljayBpdGVtIHdhc1xuXHQgKiBjbGlja2VkIG9uLlxuXHQgKlxuXHQgKiBAcGFyYW0gYnV0dG9uSW5kZXggaW5kZXggb2YgdGhlIGJ1dHRvbiBvZiB0aGUgaXRlbSB0aGF0XG5cdCAqIHdhcyBjbGlja2VkLlxuXHQgKlxuXHQgKiBAcGFyYW0ga2V5TW9kcyB0aGUgc3RhdGUgb2YgbW9kaWZpZXIga2V5cyB3aGVuIHRoZSBidXR0b24gd2FzIHRyaWdnZXJlZC5cblx0ICpcblx0ICogQHJldHVybnMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aGF0IHNob3VsZCBoYXBwZW4gYWZ0ZXIgdGhlIHRyaWdnZXJcblx0ICogd2hpY2ggY2FuIGJlIGEgYFByb21pc2VgIGZvciBsb25nIHJ1bm5pbmcgb3BlcmF0aW9ucy5cblx0ICovXG5cdHRyaWdnZXI/KGJ1dHRvbkluZGV4OiBudW1iZXIsIGtleU1vZHM6IElLZXlNb2RzKTogVHJpZ2dlckFjdGlvbiB8IFByb21pc2U8VHJpZ2dlckFjdGlvbj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXJPcHRpb25zPFQgZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB7XG5cblx0LyoqXG5cdCAqIEVuYWJsZXMgc3VwcG9ydCBmb3Igb3BlbmluZyBwaWNrcyBpbiB0aGUgYmFja2dyb3VuZCB2aWEgZ2VzdHVyZS5cblx0ICovXG5cdHJlYWRvbmx5IGNhbkFjY2VwdEluQmFja2dyb3VuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEVuYWJsZXMgdG8gc2hvdyBhIHBpY2sgZW50cnkgd2hlbiBubyByZXN1bHRzIGFyZSByZXR1cm5lZCBmcm9tIGEgc2VhcmNoLlxuXHQgKi9cblx0cmVhZG9ubHkgbm9SZXN1bHRzUGljaz86IFQgfCAoKGZpbHRlcjogc3RyaW5nKSA9PiBUKTtcblxuXHQvKiogV2hldGhlciB0byBza2lwIHRyaW1taW5nIHRoZSBwaWNrIGZpbHRlciBzdHJpbmcgKi9cblx0cmVhZG9ubHkgc2hvdWxkU2tpcFRyaW1QaWNrRmlsdGVyPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgUGljazxUPiA9IFQgfCBJUXVpY2tQaWNrU2VwYXJhdG9yO1xuZXhwb3J0IHR5cGUgUGlja3NXaXRoQWN0aXZlPFQ+ID0geyBpdGVtczogcmVhZG9ubHkgUGljazxUPltdOyBhY3RpdmU/OiBUIH07XG5leHBvcnQgdHlwZSBQaWNrczxUPiA9IHJlYWRvbmx5IFBpY2s8VD5bXSB8IFBpY2tzV2l0aEFjdGl2ZTxUPjtcbmV4cG9ydCB0eXBlIEZhc3RBbmRTbG93UGlja3M8VD4gPSB7XG5cblx0LyoqXG5cdCAqIFBpY2tzIHRoYXQgd2lsbCBzaG93IGluc3RhbnRseSBvciBhZnRlciBhIHNob3J0IGRlbGF5XG5cdCAqIGJhc2VkIG9uIHRoZSBgbWVyZ2VEZWxheWAgcHJvcGVydHkgdG8gcmVkdWNlIGZsaWNrZXIuXG5cdCAqL1xuXHRyZWFkb25seSBwaWNrczogUGlja3M8VD47XG5cblx0LyoqXG5cdCAqIFBpY2tzIHRoYXQgd2lsbCBzaG93IGFmdGVyIHRoZXkgaGF2ZSBiZWVuIHJlc29sdmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgYWRkaXRpb25hbFBpY2tzOiBQcm9taXNlPFBpY2tzPFQ+PjtcblxuXHQvKipcblx0ICogQSBkZWxheSBpbiBtaWxsaXNlY29uZHMgdG8gd2FpdCBiZWZvcmUgc2hvd2luZyB0aGVcblx0ICogYHBpY2tzYCB0byBnaXZlIGEgY2hhbmNlIHRvIG1lcmdlIHdpdGggYGFkZGl0aW9uYWxQaWNrc2Bcblx0ICogZm9yIHJlZHVjZWQgZmxpY2tlci5cblx0ICovXG5cdHJlYWRvbmx5IG1lcmdlRGVsYXk/OiBudW1iZXI7XG59O1xuXG5mdW5jdGlvbiBpc1BpY2tzV2l0aEFjdGl2ZTxUPihvYmo6IHVua25vd24pOiBvYmogaXMgUGlja3NXaXRoQWN0aXZlPFQ+IHtcblx0Y29uc3QgY2FuZGlkYXRlID0gb2JqIGFzIFBpY2tzV2l0aEFjdGl2ZTxUPjtcblxuXHRyZXR1cm4gQXJyYXkuaXNBcnJheShjYW5kaWRhdGUuaXRlbXMpO1xufVxuXG5mdW5jdGlvbiBpc0Zhc3RBbmRTbG93UGlja3M8VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIEZhc3RBbmRTbG93UGlja3M8VD4ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgRmFzdEFuZFNsb3dQaWNrczxUPjtcblxuXHRyZXR1cm4gISFjYW5kaWRhdGUucGlja3MgJiYgY2FuZGlkYXRlLmFkZGl0aW9uYWxQaWNrcyBpbnN0YW5jZW9mIFByb21pc2U7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPFQgZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUXVpY2tBY2Nlc3NQcm92aWRlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwcmVmaXg6IHN0cmluZywgcHJvdGVjdGVkIG9wdGlvbnM/OiBJUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlck9wdGlvbnM8VD4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8VCwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJ1bk9wdGlvbnM/OiBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBBcHBseSBvcHRpb25zIGlmIGFueVxuXHRcdHBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSAhIXRoaXMub3B0aW9ucz8uY2FuQWNjZXB0SW5CYWNrZ3JvdW5kO1xuXG5cdFx0Ly8gRGlzYWJsZSBmaWx0ZXJpbmcgJiBzb3J0aW5nLCB3ZSBjb250cm9sIHRoZSByZXN1bHRzXG5cdFx0cGlja2VyLm1hdGNoT25MYWJlbCA9IHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSBwaWNrZXIubWF0Y2hPbkRldGFpbCA9IHBpY2tlci5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgcGlja3MgYW5kIHVwZGF0ZSBvbiB0eXBlXG5cdFx0bGV0IHBpY2tzQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwaWNrc0Rpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IHVwZGF0ZVBpY2tlckl0ZW1zID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQ2FuY2VsIGFueSBwcmV2aW91cyBhc2sgZm9yIHBpY2tzIGFuZCBidXN5XG5cdFx0XHRwaWNrc0N0cz8uZGlzcG9zZSh0cnVlKTtcblx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cblx0XHRcdC8vIFNldHRpbmcgdGhlIC52YWx1ZSB3aWxsIGNhbGwgZGlzcG9zZSgpIG9uIHRoZSBwcmV2aW91cyB2YWx1ZSwgc28gd2UgbmVlZCB0byBkbyB0aGlzIEFGVEVSIGNhbmNlbGxpbmcgd2l0aCBkaXNwb3NlKHRydWUpLlxuXHRcdFx0Y29uc3QgcGlja3NEaXNwb3NhYmxlcyA9IHBpY2tzRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIG5ldyBjYW5jZWxsYXRpb24gc291cmNlIGZvciB0aGlzIHJ1blxuXHRcdFx0cGlja3NDdHMgPSBwaWNrc0Rpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pKTtcblxuXHRcdFx0Ly8gQ29sbGVjdCBwaWNrcyBhbmQgc3VwcG9ydCBib3RoIGxvbmcgcnVubmluZyBhbmQgc2hvcnQgb3IgY29tYmluZWRcblx0XHRcdGNvbnN0IHBpY2tzVG9rZW4gPSBwaWNrc0N0cy50b2tlbjtcblx0XHRcdGxldCBwaWNrc0ZpbHRlciA9IHBpY2tlci52YWx1ZS5zdWJzdHJpbmcodGhpcy5wcmVmaXgubGVuZ3RoKTtcblxuXHRcdFx0aWYgKCF0aGlzLm9wdGlvbnM/LnNob3VsZFNraXBUcmltUGlja0ZpbHRlcikge1xuXHRcdFx0XHRwaWNrc0ZpbHRlciA9IHBpY2tzRmlsdGVyLnRyaW0oKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZWRQaWNrcyA9IHRoaXMuX2dldFBpY2tzKHBpY2tzRmlsdGVyLCBwaWNrc0Rpc3Bvc2FibGVzLCBwaWNrc1Rva2VuLCBydW5PcHRpb25zKTtcblxuXHRcdFx0Y29uc3QgYXBwbHlQaWNrcyA9IChwaWNrczogUGlja3M8VD4sIHNraXBFbXB0eT86IGJvb2xlYW4pOiBib29sZWFuID0+IHtcblx0XHRcdFx0bGV0IGl0ZW1zOiByZWFkb25seSBQaWNrPFQ+W107XG5cdFx0XHRcdGxldCBhY3RpdmVJdGVtOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGlmIChpc1BpY2tzV2l0aEFjdGl2ZShwaWNrcykpIHtcblx0XHRcdFx0XHRpdGVtcyA9IHBpY2tzLml0ZW1zO1xuXHRcdFx0XHRcdGFjdGl2ZUl0ZW0gPSBwaWNrcy5hY3RpdmU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aXRlbXMgPSBwaWNrcztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRpZiAoc2tpcEVtcHR5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gV2Ugc2hvdyB0aGUgbm8gcmVzdWx0cyBwaWNrIGlmIHdlIGhhdmUgbm8gaW5wdXQgdG8gcHJldmVudCBjb21wbGV0ZWx5IGVtcHR5IHBpY2tlcnMgIzE3MjYxM1xuXHRcdFx0XHRcdGlmICgocGlja3NGaWx0ZXIubGVuZ3RoID4gMCB8fCBwaWNrZXIuaGlkZUlucHV0KSAmJiB0aGlzLm9wdGlvbnM/Lm5vUmVzdWx0c1BpY2spIHtcblx0XHRcdFx0XHRcdGlmIChpc0Z1bmN0aW9uKHRoaXMub3B0aW9ucy5ub1Jlc3VsdHNQaWNrKSkge1xuXHRcdFx0XHRcdFx0XHRpdGVtcyA9IFt0aGlzLm9wdGlvbnMubm9SZXN1bHRzUGljayhwaWNrc0ZpbHRlcildO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aXRlbXMgPSBbdGhpcy5vcHRpb25zLm5vUmVzdWx0c1BpY2tdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRpZiAoYWN0aXZlSXRlbSkge1xuXHRcdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IFthY3RpdmVJdGVtXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYXBwbHlGYXN0QW5kU2xvd1BpY2tzID0gYXN5bmMgKGZhc3RBbmRTbG93UGlja3M6IEZhc3RBbmRTbG93UGlja3M8VD4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdFx0bGV0IGZhc3RQaWNrc0FwcGxpZWQgPSBmYWxzZTtcblx0XHRcdFx0bGV0IHNsb3dQaWNrc0FwcGxpZWQgPSBmYWxzZTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cblx0XHRcdFx0XHQvLyBGYXN0IFBpY2tzOiBpZiBgbWVyZ2VEZWxheWAgaXMgY29uZmlndXJlZCwgaW4gb3JkZXIgdG8gcmVkdWNlXG5cdFx0XHRcdFx0Ly8gYW1vdW50IG9mIGZsaWNrZXIsIHdlIHJhY2UgYWdhaW5zdCB0aGUgc2xvdyBwaWNrcyBvdmVyIHNvbWUgZGVsYXlcblx0XHRcdFx0XHQvLyBhbmQgdGhlbiBzZXQgdGhlIGZhc3QgcGlja3MuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHNsb3cgcGlja3MgYXJlIGZhc3Rlciwgd2UgcmVkdWNlIHRoZSBmbGlja2VyIGJ5IG9ubHlcblx0XHRcdFx0XHQvLyBzZXR0aW5nIHRoZSBpdGVtcyBvbmNlLlxuXG5cdFx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZmFzdEFuZFNsb3dQaWNrcy5tZXJnZURlbGF5ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KGZhc3RBbmRTbG93UGlja3MubWVyZ2VEZWxheSk7XG5cdFx0XHRcdFx0XHRcdGlmIChwaWNrc1Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghc2xvd1BpY2tzQXBwbGllZCkge1xuXHRcdFx0XHRcdFx0XHRmYXN0UGlja3NBcHBsaWVkID0gYXBwbHlQaWNrcyhmYXN0QW5kU2xvd1BpY2tzLnBpY2tzLCB0cnVlIC8qIHNraXAgb3ZlciBlbXB0eSB0byByZWR1Y2UgZmxpY2tlciAqLyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkoKSxcblxuXHRcdFx0XHRcdC8vIFNsb3cgUGlja3M6IHdlIGF3YWl0IHRoZSBzbG93IHBpY2tzIGFuZCB0aGVuIHNldCB0aGVtIGF0XG5cdFx0XHRcdFx0Ly8gb25jZSB0b2dldGhlciB3aXRoIHRoZSBmYXN0IHBpY2tzLCBidXQgb25seSBpZiB3ZSBhY3R1YWxseVxuXHRcdFx0XHRcdC8vIGhhdmUgYWRkaXRpb25hbCByZXN1bHRzLlxuXG5cdFx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGF3YWl0ZWRBZGRpdGlvbmFsUGlja3MgPSBhd2FpdCBmYXN0QW5kU2xvd1BpY2tzLmFkZGl0aW9uYWxQaWNrcztcblx0XHRcdFx0XHRcdFx0aWYgKHBpY2tzVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRsZXQgcGlja3M6IHJlYWRvbmx5IFBpY2s8VD5bXTtcblx0XHRcdFx0XHRcdFx0bGV0IGFjdGl2ZVBpY2s6IFBpY2s8VD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmIChpc1BpY2tzV2l0aEFjdGl2ZShmYXN0QW5kU2xvd1BpY2tzLnBpY2tzKSkge1xuXHRcdFx0XHRcdFx0XHRcdHBpY2tzID0gZmFzdEFuZFNsb3dQaWNrcy5waWNrcy5pdGVtcztcblx0XHRcdFx0XHRcdFx0XHRhY3RpdmVQaWNrID0gZmFzdEFuZFNsb3dQaWNrcy5waWNrcy5hY3RpdmU7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cGlja3MgPSBmYXN0QW5kU2xvd1BpY2tzLnBpY2tzO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0bGV0IGFkZGl0aW9uYWxQaWNrczogcmVhZG9ubHkgUGljazxUPltdO1xuXHRcdFx0XHRcdFx0XHRsZXQgYWRkaXRpb25hbEFjdGl2ZVBpY2s6IFBpY2s8VD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmIChpc1BpY2tzV2l0aEFjdGl2ZShhd2FpdGVkQWRkaXRpb25hbFBpY2tzKSkge1xuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQaWNrcyA9IGF3YWl0ZWRBZGRpdGlvbmFsUGlja3MuaXRlbXM7XG5cdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbEFjdGl2ZVBpY2sgPSBhd2FpdGVkQWRkaXRpb25hbFBpY2tzLmFjdGl2ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUGlja3MgPSBhd2FpdGVkQWRkaXRpb25hbFBpY2tzO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKGFkZGl0aW9uYWxQaWNrcy5sZW5ndGggPiAwIHx8ICFmYXN0UGlja3NBcHBsaWVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gSWYgd2UgZG8gbm90IGhhdmUgYW55IGFjdGl2ZVBpY2sgb3IgYWRkaXRpb25hbEFjdGl2ZVBpY2tcblx0XHRcdFx0XHRcdFx0XHQvLyB3ZSB0cnkgdG8gcHJlc2VydmUgdGhlIGN1cnJlbnRseSBhY3RpdmUgcGljayBmcm9tIHRoZVxuXHRcdFx0XHRcdFx0XHRcdC8vIGZhc3QgcmVzdWx0cy4gVGhpcyBmaXhlcyBhbiBpc3N1ZSB3aGVyZSB0aGUgdXNlciBtaWdodFxuXHRcdFx0XHRcdFx0XHRcdC8vIGhhdmUgbWFkZSBhIHBpY2sgYWN0aXZlIGJlZm9yZSB0aGUgYWRkaXRpb25hbCByZXN1bHRzXG5cdFx0XHRcdFx0XHRcdFx0Ly8ga2ljayBpbi5cblx0XHRcdFx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjQ4MFxuXHRcdFx0XHRcdFx0XHRcdGxldCBmYWxsYmFja0FjdGl2ZVBpY2s6IFBpY2s8VD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFhY3RpdmVQaWNrICYmICFhZGRpdGlvbmFsQWN0aXZlUGljaykge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tBY3RpdmVQaWNrQ2FuZGlkYXRlID0gcGlja2VyLmFjdGl2ZUl0ZW1zWzBdO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGZhbGxiYWNrQWN0aXZlUGlja0NhbmRpZGF0ZSAmJiBwaWNrcy5pbmRleE9mKGZhbGxiYWNrQWN0aXZlUGlja0NhbmRpZGF0ZSkgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGZhbGxiYWNrQWN0aXZlUGljayA9IGZhbGxiYWNrQWN0aXZlUGlja0NhbmRpZGF0ZTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRhcHBseVBpY2tzKHtcblx0XHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiBbLi4ucGlja3MsIC4uLmFkZGl0aW9uYWxQaWNrc10sXG5cdFx0XHRcdFx0XHRcdFx0XHRhY3RpdmU6IGFjdGl2ZVBpY2sgfHwgYWRkaXRpb25hbEFjdGl2ZVBpY2sgfHwgZmFsbGJhY2tBY3RpdmVQaWNrXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdGlmICghcGlja3NUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRzbG93UGlja3NBcHBsaWVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSgpXG5cdFx0XHRcdF0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gTm8gUGlja3Ncblx0XHRcdGlmIChwcm92aWRlZFBpY2tzID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIElnbm9yZVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYXN0IGFuZCBTbG93IFBpY2tzXG5cdFx0XHRlbHNlIGlmIChpc0Zhc3RBbmRTbG93UGlja3MocHJvdmlkZWRQaWNrcykpIHtcblx0XHRcdFx0YXdhaXQgYXBwbHlGYXN0QW5kU2xvd1BpY2tzKHByb3ZpZGVkUGlja3MpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYXN0IFBpY2tzXG5cdFx0XHRlbHNlIGlmICghKHByb3ZpZGVkUGlja3MgaW5zdGFuY2VvZiBQcm9taXNlKSkge1xuXHRcdFx0XHRhcHBseVBpY2tzKHByb3ZpZGVkUGlja3MpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTbG93IFBpY2tzXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGF3YWl0ZWRQaWNrcyA9IGF3YWl0IHByb3ZpZGVkUGlja3M7XG5cdFx0XHRcdFx0aWYgKHBpY2tzVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaXNGYXN0QW5kU2xvd1BpY2tzKGF3YWl0ZWRQaWNrcykpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGFwcGx5RmFzdEFuZFNsb3dQaWNrcyhhd2FpdGVkUGlja3MpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhcHBseVBpY2tzKGF3YWl0ZWRQaWNrcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmICghcGlja3NUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB1cGRhdGVQaWNrZXJJdGVtcygpKSk7XG5cdFx0dXBkYXRlUGlja2VySXRlbXMoKTtcblxuXHRcdC8vIEFjY2VwdCB0aGUgcGljayBvbiBhY2NlcHQgYW5kIGhpZGUgcGlja2VyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdChldmVudCA9PiB7XG5cdFx0XHRpZiAocnVuT3B0aW9ucz8uaGFuZGxlQWNjZXB0KSB7XG5cdFx0XHRcdGlmICghZXZlbnQuaW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0cGlja2VyLmhpZGUoKTsgLy8gaGlkZSBwaWNrZXIgdW5sZXNzIHdlIGFjY2VwdCBpbiBiYWNrZ3JvdW5kXG5cdFx0XHRcdH1cblx0XHRcdFx0cnVuT3B0aW9ucy5oYW5kbGVBY2NlcHQ/LihwaWNrZXIuYWN0aXZlSXRlbXNbMF0sIGV2ZW50LmluQmFja2dyb3VuZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2l0ZW1dID0gcGlja2VyLnNlbGVjdGVkSXRlbXM7XG5cdFx0XHRpZiAodHlwZW9mIGl0ZW0/LmFjY2VwdCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRjb25zdCBpc0F0dGFjaEFjdGlvbiA9IGlzS2V5TW9kaWZpZWQocGlja2VyLmtleU1vZHMpICYmICEhaXRlbS5hdHRhY2g7XG5cdFx0XHRcdGlmIChpc0F0dGFjaEFjdGlvbikge1xuXHRcdFx0XHRcdGl0ZW0uYXR0YWNoIShwaWNrZXIua2V5TW9kcywgZXZlbnQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWV2ZW50LmluQmFja2dyb3VuZCkge1xuXHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7IC8vIGhpZGUgcGlja2VyIHVubGVzcyB3ZSBhY2NlcHQgaW4gYmFja2dyb3VuZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXRlbS5hY2NlcHQocGlja2VyLmtleU1vZHMsIGV2ZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBidXR0b25UcmlnZ2VyID0gYXN5bmMgKGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24sIGl0ZW06IFQgfCBJUGlja2VyUXVpY2tBY2Nlc3NTZXBhcmF0b3IpID0+IHtcblx0XHRcdGlmICh0eXBlb2YgaXRlbS50cmlnZ2VyICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnV0dG9uSW5kZXggPSBpdGVtLmJ1dHRvbnM/LmluZGV4T2YoYnV0dG9uKSA/PyAtMTtcblx0XHRcdGlmIChidXR0b25JbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGl0ZW0udHJpZ2dlcihidXR0b25JbmRleCwgcGlja2VyLmtleU1vZHMpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSAodHlwZW9mIHJlc3VsdCA9PT0gJ251bWJlcicpID8gcmVzdWx0IDogYXdhaXQgcmVzdWx0O1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN3aXRjaCAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSBUcmlnZ2VyQWN0aW9uLk5PX0FDVElPTjpcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgVHJpZ2dlckFjdGlvbi5DTE9TRV9QSUNLRVI6XG5cdFx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBUcmlnZ2VyQWN0aW9uLlJFRlJFU0hfUElDS0VSOlxuXHRcdFx0XHRcdFx0dXBkYXRlUGlja2VySXRlbXMoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgVHJpZ2dlckFjdGlvbi5SRU1PVkVfSVRFTToge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBwaWNrZXIuaXRlbXMuaW5kZXhPZihpdGVtKTtcblx0XHRcdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaXRlbXMgPSBwaWNrZXIuaXRlbXMuc2xpY2UoKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVtb3ZlZCA9IGl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUl0ZW1zID0gcGlja2VyLmFjdGl2ZUl0ZW1zLmZpbHRlcihhY3RpdmVJdGVtID0+IGFjdGl2ZUl0ZW0gIT09IHJlbW92ZWRbMF0pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBrZWVwU2Nyb2xsUG9zaXRpb25CZWZvcmUgPSBwaWNrZXIua2VlcFNjcm9sbFBvc2l0aW9uO1xuXHRcdFx0XHRcdFx0XHRwaWNrZXIua2VlcFNjcm9sbFBvc2l0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdFx0XHRcdGlmIChhY3RpdmVJdGVtcykge1xuXHRcdFx0XHRcdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IGFjdGl2ZUl0ZW1zO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHBpY2tlci5rZWVwU2Nyb2xsUG9zaXRpb24gPSBrZWVwU2Nyb2xsUG9zaXRpb25CZWZvcmU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gVHJpZ2dlciB0aGUgcGljayB3aXRoIGJ1dHRvbiBpbmRleCBpZiBidXR0b24gdHJpZ2dlcmVkXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKCh7IGJ1dHRvbiwgaXRlbSB9KSA9PiBidXR0b25UcmlnZ2VyKGJ1dHRvbiwgaXRlbSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbigoeyBidXR0b24sIHNlcGFyYXRvciB9KSA9PiBidXR0b25UcmlnZ2VyKGJ1dHRvbiwgc2VwYXJhdG9yKSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgcGlja3MgYW5kIHNlcGFyYXRvcnMgYXMgbmVlZGVkLiBJZiB0aGUgcGlja3MgYXJlIHJlc29sdmVkXG5cdCAqIGxvbmcgcnVubmluZywgdGhlIHByb3ZpZGVkIGNhbmNlbGxhdGlvbiB0b2tlbiBzaG91bGQgYmUgdXNlZCB0byBjYW5jZWwgdGhlXG5cdCAqIG9wZXJhdGlvbiB3aGVuIHRoZSB0b2tlbiBzaWduYWxzIHRoaXMuXG5cdCAqXG5cdCAqIFRoZSBpbXBsZW1lbnRvciBpcyByZXNwb25zaWJsZSBmb3IgZmlsdGVyaW5nIGFuZCBzb3J0aW5nIHRoZSBwaWNrcyBnaXZlbiB0aGVcblx0ICogcHJvdmlkZWQgYGZpbHRlcmAuXG5cdCAqXG5cdCAqIEBwYXJhbSBmaWx0ZXIgYSBmaWx0ZXIgdG8gYXBwbHkgdG8gdGhlIHBpY2tzLlxuXHQgKiBAcGFyYW0gZGlzcG9zYWJsZXMgY2FuIGJlIHVzZWQgdG8gcmVnaXN0ZXIgZGlzcG9zYWJsZXMgdGhhdCBzaG91bGQgYmUgY2xlYW5lZFxuXHQgKiB1cCB3aGVuIHRoZSBwaWNrZXIgY2xvc2VzLlxuXHQgKiBAcGFyYW0gdG9rZW4gZm9yIGxvbmcgcnVubmluZyB0YXNrcywgaW1wbGVtZW50b3JzIG5lZWQgdG8gY2hlY2sgb24gY2FuY2VsbGF0aW9uXG5cdCAqIHRocm91Z2ggdGhpcyB0b2tlbi5cblx0ICogQHJldHVybnMgdGhlIHBpY2tzIGVpdGhlciBkaXJlY3RseSwgYXMgcHJvbWlzZSBvciBjb21iaW5lZCBmYXN0IGFuZCBzbG93IHJlc3VsdHMuXG5cdCAqIFBpY2tlcnMgY2FuIHJldHVybiBgbnVsbGAgdG8gc2lnbmFsIHRoYXQgbm8gY2hhbmdlIGluIHBpY2tzIGlzIG5lZWRlZC5cblx0ICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IFBpY2tzPFQ+IHwgUHJvbWlzZTxQaWNrczxUPiB8IEZhc3RBbmRTbG93UGlja3M8VD4+IHwgRmFzdEFuZFNsb3dQaWNrczxUPiB8IG51bGw7XG59XG4iXSwKICAi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QUFDLE1BQU0sY0FBYztBQUN4QixpQkFBTyxLQUFLO0FBQUEsUUFDYjtBQUVBLGFBQUssT0FBTyxPQUFPLFNBQVMsS0FBSztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLGdCQUFnQixPQUFPLFFBQTJCLFNBQTBDO0FBQ2pHLFVBQUksT0FBTyxLQUFLLFlBQVksWUFBWTtBQUN2QztBQUFBLE1BQ0Q7QUFFQSxZQUFNLGNBQWMsS0FBSyxTQUFTLFFBQVEsTUFBTSxLQUFLO0FBQ3JELFVBQUksZUFBZSxHQUFHO0FBQ3JCLGNBQU0sU0FBUyxLQUFLLFFBQVEsYUFBYSxPQUFPLE9BQU87QUFDdkQsY0FBTSxTQUFVLE9BQU8sV0FBVyxXQUFZLFNBQVMsTUFBTTtBQUU3RCxZQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsUUFDRDtBQUVBLGdCQUFRLFFBQVE7QUFBQSxVQUNmLEtBQUs7QUFDSjtBQUFBLFVBQ0QsS0FBSztBQUNKLG1CQUFPLEtBQUs7QUFDWjtBQUFBLFVBQ0QsS0FBSztBQUNKLDhCQUFrQjtBQUNsQjtBQUFBLFVBQ0QsS0FBSyxxQkFBMkI7QUFDL0Isa0JBQU0sUUFBUSxPQUFPLE1BQU0sUUFBUSxJQUFJO0FBQ3ZDLGdCQUFJLFVBQVUsSUFBSTtBQUNqQixvQkFBTSxRQUFRLE9BQU8sTUFBTSxNQUFNO0FBQ2pDLG9CQUFNLFVBQVUsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUNyQyxvQkFBTSxjQUFjLE9BQU8sWUFBWSxPQUFPLGdCQUFjLGVBQWUsUUFBUSxDQUFDLENBQUM7QUFDckYsb0JBQU0sMkJBQTJCLE9BQU87QUFDeEMscUJBQU8scUJBQXFCO0FBQzVCLHFCQUFPLFFBQVE7QUFDZixrQkFBSSxhQUFhO0FBQ2hCLHVCQUFPLGNBQWM7QUFBQSxjQUN0QjtBQUNBLHFCQUFPLHFCQUFxQjtBQUFBLFlBQzdCO0FBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsZ0JBQVksSUFBSSxPQUFPLHVCQUF1QixDQUFDLEVBQUUsUUFBUSxLQUFLLE1BQU0sY0FBYyxRQUFRLElBQUksQ0FBQyxDQUFDO0FBQ2hHLGdCQUFZLElBQUksT0FBTyw0QkFBNEIsQ0FBQyxFQUFFLFFBQVEsVUFBVSxNQUFNLGNBQWMsUUFBUSxTQUFTLENBQUMsQ0FBQztBQUUvRyxXQUFPO0FBQUEsRUFDUjtBQW1CRDsiLAogICJuYW1lcyI6IFsiVHJpZ2dlckFjdGlvbiJdCn0K
