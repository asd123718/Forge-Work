import { localize } from "../../nls.js";
import { Lazy } from "./lazy.js";
import { LANGUAGE_DEFAULT } from "./platform.js";
const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;
function fromNow(date, appendAgoLabel, useFullTimeWords, disallowNow) {
  if (typeof date === "undefined") {
    return localize("date.fromNow.unknown", "unknown");
  }
  if (typeof date !== "number") {
    date = date.getTime();
  }
  const seconds = Math.round(((/* @__PURE__ */ new Date()).getTime() - date) / 1e3);
  if (seconds < -30) {
    return localize("date.fromNow.in", "in {0}", fromNow((/* @__PURE__ */ new Date()).getTime() + seconds * 1e3, false));
  }
  if (!disallowNow && seconds < 30) {
    return localize("date.fromNow.now", "now");
  }
  let value;
  if (seconds < minute) {
    value = seconds;
    if (appendAgoLabel) {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.seconds.singular.ago.fullWord", "{0} second ago", value) : localize("date.fromNow.seconds.singular.ago", "{0} sec ago", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.seconds.plural.ago.fullWord", "{0} seconds ago", value) : localize("date.fromNow.seconds.plural.ago", "{0} secs ago", value);
      }
    } else {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.seconds.singular.fullWord", "{0} second", value) : localize("date.fromNow.seconds.singular", "{0} sec", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.seconds.plural.fullWord", "{0} seconds", value) : localize("date.fromNow.seconds.plural", "{0} secs", value);
      }
    }
  }
  if (seconds < hour) {
    value = Math.round(seconds / minute);
    if (appendAgoLabel) {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.minutes.singular.ago.fullWord", "{0} minute ago", value) : localize("date.fromNow.minutes.singular.ago", "{0} min ago", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.minutes.plural.ago.fullWord", "{0} minutes ago", value) : localize("date.fromNow.minutes.plural.ago", "{0} mins ago", value);
      }
    } else {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.minutes.singular.fullWord", "{0} minute", value) : localize("date.fromNow.minutes.singular", "{0} min", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.minutes.plural.fullWord", "{0} minutes", value) : localize("date.fromNow.minutes.plural", "{0} mins", value);
      }
    }
  }
  if (seconds < day) {
    value = Math.round(seconds / hour);
    if (appendAgoLabel) {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.hours.singular.ago.fullWord", "{0} hour ago", value) : localize("date.fromNow.hours.singular.ago", "{0} hr ago", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.hours.plural.ago.fullWord", "{0} hours ago", value) : localize("date.fromNow.hours.plural.ago", "{0} hrs ago", value);
      }
    } else {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.hours.singular.fullWord", "{0} hour", value) : localize("date.fromNow.hours.singular", "{0} hr", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.hours.plural.fullWord", "{0} hours", value) : localize("date.fromNow.hours.plural", "{0} hrs", value);
      }
    }
  }
  if (seconds < week) {
    value = Math.round(seconds / day);
    if (appendAgoLabel) {
      return value === 1 ? localize("date.fromNow.days.singular.ago", "{0} day ago", value) : localize("date.fromNow.days.plural.ago", "{0} days ago", value);
    } else {
      return value === 1 ? localize("date.fromNow.days.singular", "{0} day", value) : localize("date.fromNow.days.plural", "{0} days", value);
    }
  }
  if (seconds < month) {
    value = Math.round(seconds / week);
    if (appendAgoLabel) {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.weeks.singular.ago.fullWord", "{0} week ago", value) : localize("date.fromNow.weeks.singular.ago", "{0} wk ago", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.weeks.plural.ago.fullWord", "{0} weeks ago", value) : localize("date.fromNow.weeks.plural.ago", "{0} wks ago", value);
      }
    } else {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.weeks.singular.fullWord", "{0} week", value) : localize("date.fromNow.weeks.singular", "{0} wk", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.weeks.plural.fullWord", "{0} weeks", value) : localize("date.fromNow.weeks.plural", "{0} wks", value);
      }
    }
  }
  if (seconds < year) {
    value = Math.round(seconds / month);
    if (appendAgoLabel) {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.months.singular.ago.fullWord", "{0} month ago", value) : localize("date.fromNow.months.singular.ago", "{0} mo ago", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.months.plural.ago.fullWord", "{0} months ago", value) : localize("date.fromNow.months.plural.ago", "{0} mos ago", value);
      }
    } else {
      if (value === 1) {
        return useFullTimeWords ? localize("date.fromNow.months.singular.fullWord", "{0} month", value) : localize("date.fromNow.months.singular", "{0} mo", value);
      } else {
        return useFullTimeWords ? localize("date.fromNow.months.plural.fullWord", "{0} months", value) : localize("date.fromNow.months.plural", "{0} mos", value);
      }
    }
  }
  value = Math.round(seconds / year);
  if (appendAgoLabel) {
    if (value === 1) {
      return useFullTimeWords ? localize("date.fromNow.years.singular.ago.fullWord", "{0} year ago", value) : localize("date.fromNow.years.singular.ago", "{0} yr ago", value);
    } else {
      return useFullTimeWords ? localize("date.fromNow.years.plural.ago.fullWord", "{0} years ago", value) : localize("date.fromNow.years.plural.ago", "{0} yrs ago", value);
    }
  } else {
    if (value === 1) {
      return useFullTimeWords ? localize("date.fromNow.years.singular.fullWord", "{0} year", value) : localize("date.fromNow.years.singular", "{0} yr", value);
    } else {
      return useFullTimeWords ? localize("date.fromNow.years.plural.fullWord", "{0} years", value) : localize("date.fromNow.years.plural", "{0} yrs", value);
    }
  }
}
function fromNowByDay(date, appendAgoLabel, useFullTimeWords) {
  if (typeof date !== "number") {
    date = date.getTime();
  }
  const todayMidnightTime = /* @__PURE__ */ new Date();
  todayMidnightTime.setHours(0, 0, 0, 0);
  const yesterdayMidnightTime = new Date(todayMidnightTime.getTime());
  yesterdayMidnightTime.setDate(yesterdayMidnightTime.getDate() - 1);
  if (date > todayMidnightTime.getTime()) {
    return localize("today", "Today");
  }
  if (date > yesterdayMidnightTime.getTime()) {
    return localize("yesterday", "Yesterday");
  }
  return fromNow(date, appendAgoLabel, useFullTimeWords);
}
function getDurationString(ms, useFullTimeWords) {
  const seconds = Math.abs(ms / 1e3);
  if (seconds < 1) {
    return useFullTimeWords ? localize("duration.ms.full", "{0} milliseconds", ms) : localize("duration.ms", "{0}ms", ms);
  }
  if (seconds < minute) {
    return useFullTimeWords ? localize("duration.s.full", "{0} seconds", Math.round(ms) / 1e3) : localize("duration.s", "{0}s", Math.round(ms) / 1e3);
  }
  if (seconds < hour) {
    return useFullTimeWords ? localize("duration.m.full", "{0} minutes", Math.round(ms / (1e3 * minute))) : localize("duration.m", "{0} mins", Math.round(ms / (1e3 * minute)));
  }
  if (seconds < day) {
    return useFullTimeWords ? localize("duration.h.full", "{0} hours", Math.round(ms / (1e3 * hour))) : localize("duration.h", "{0} hrs", Math.round(ms / (1e3 * hour)));
  }
  return localize("duration.d", "{0} days", Math.round(ms / (1e3 * day)));
}
function toLocalISOString(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") + "." + (date.getMilliseconds() / 1e3).toFixed(3).slice(2, 5) + "Z";
}
const safeIntl = {
  DateTimeFormat(locales, options) {
    return new Lazy(() => {
      try {
        return new Intl.DateTimeFormat(locales, options);
      } catch {
        return new Intl.DateTimeFormat(void 0, options);
      }
    });
  },
  Collator(locales, options) {
    return new Lazy(() => {
      try {
        return new Intl.Collator(locales, options);
      } catch {
        return new Intl.Collator(void 0, options);
      }
    });
  },
  Segmenter(locales, options) {
    return new Lazy(() => {
      try {
        return new Intl.Segmenter(locales, options);
      } catch {
        return new Intl.Segmenter(void 0, options);
      }
    });
  },
  Locale(tag, options) {
    return new Lazy(() => {
      try {
        return new Intl.Locale(tag, options);
      } catch {
        return new Intl.Locale(LANGUAGE_DEFAULT, options);
      }
    });
  },
  NumberFormat(locales, options) {
    return new Lazy(() => {
      try {
        return new Intl.NumberFormat(locales, options);
      } catch {
        return new Intl.NumberFormat(void 0, options);
      }
    });
  }
};
export {
  fromNow,
  fromNowByDay,
  getDurationString,
  safeIntl,
  toLocalISOString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGRhdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi9sYXp5LmpzJztcbmltcG9ydCB7IExBTkdVQUdFX0RFRkFVTFQgfSBmcm9tICcuL3BsYXRmb3JtLmpzJztcblxuY29uc3QgbWludXRlID0gNjA7XG5jb25zdCBob3VyID0gbWludXRlICogNjA7XG5jb25zdCBkYXkgPSBob3VyICogMjQ7XG5jb25zdCB3ZWVrID0gZGF5ICogNztcbmNvbnN0IG1vbnRoID0gZGF5ICogMzA7XG5jb25zdCB5ZWFyID0gZGF5ICogMzY1O1xuXG4vKipcbiAqIENyZWF0ZSBhIGxvY2FsaXplZCBkaWZmZXJlbmNlIG9mIHRoZSB0aW1lIGJldHdlZW4gbm93IGFuZCB0aGUgc3BlY2lmaWVkIGRhdGUuXG4gKiBAcGFyYW0gZGF0ZSBUaGUgZGF0ZSB0byBnZW5lcmF0ZSB0aGUgZGlmZmVyZW5jZSBmcm9tLlxuICogQHBhcmFtIGFwcGVuZEFnb0xhYmVsIFdoZXRoZXIgdG8gYXBwZW5kIHRoZSBcIiBhZ29cIiB0byB0aGUgZW5kLlxuICogQHBhcmFtIHVzZUZ1bGxUaW1lV29yZHMgV2hldGhlciB0byB1c2UgZnVsbCB3b3JkcyAoZWcuIHNlY29uZHMpIGluc3RlYWQgb2ZcbiAqIHNob3J0ZW5lZCAoZWcuIHNlY3MpLlxuICogQHBhcmFtIGRpc2FsbG93Tm93IFdoZXRoZXIgdG8gZGlzYWxsb3cgdGhlIHN0cmluZyBcIm5vd1wiIHdoZW4gdGhlIGRpZmZlcmVuY2VcbiAqIGlzIGxlc3MgdGhhbiAzMCBzZWNvbmRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbU5vdyhkYXRlOiBudW1iZXIgfCBEYXRlLCBhcHBlbmRBZ29MYWJlbD86IGJvb2xlYW4sIHVzZUZ1bGxUaW1lV29yZHM/OiBib29sZWFuLCBkaXNhbGxvd05vdz86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIGRhdGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdkYXRlLmZyb21Ob3cudW5rbm93bicsICd1bmtub3duJyk7XG5cdH1cblxuXHRpZiAodHlwZW9mIGRhdGUgIT09ICdudW1iZXInKSB7XG5cdFx0ZGF0ZSA9IGRhdGUuZ2V0VGltZSgpO1xuXHR9XG5cblx0Y29uc3Qgc2Vjb25kcyA9IE1hdGgucm91bmQoKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gZGF0ZSkgLyAxMDAwKTtcblx0aWYgKHNlY29uZHMgPCAtMzApIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5pbicsICdpbiB7MH0nLCBmcm9tTm93KG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgc2Vjb25kcyAqIDEwMDAsIGZhbHNlKSk7XG5cdH1cblxuXHRpZiAoIWRpc2FsbG93Tm93ICYmIHNlY29uZHMgPCAzMCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93Lm5vdycsICdub3cnKTtcblx0fVxuXG5cdGxldCB2YWx1ZTogbnVtYmVyO1xuXHRpZiAoc2Vjb25kcyA8IG1pbnV0ZSkge1xuXHRcdHZhbHVlID0gc2Vjb25kcztcblxuXHRcdGlmIChhcHBlbmRBZ29MYWJlbCkge1xuXHRcdFx0aWYgKHZhbHVlID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnNlY29uZHMuc2luZ3VsYXIuYWdvLmZ1bGxXb3JkJywgJ3swfSBzZWNvbmQgYWdvJywgdmFsdWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnNlY29uZHMuc2luZ3VsYXIuYWdvJywgJ3swfSBzZWMgYWdvJywgdmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuc2Vjb25kcy5wbHVyYWwuYWdvLmZ1bGxXb3JkJywgJ3swfSBzZWNvbmRzIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5zZWNvbmRzLnBsdXJhbC5hZ28nLCAnezB9IHNlY3MgYWdvJywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuc2Vjb25kcy5zaW5ndWxhci5mdWxsV29yZCcsICd7MH0gc2Vjb25kJywgdmFsdWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnNlY29uZHMuc2luZ3VsYXInLCAnezB9IHNlYycsIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnNlY29uZHMucGx1cmFsLmZ1bGxXb3JkJywgJ3swfSBzZWNvbmRzJywgdmFsdWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnNlY29uZHMucGx1cmFsJywgJ3swfSBzZWNzJywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChzZWNvbmRzIDwgaG91cikge1xuXHRcdHZhbHVlID0gTWF0aC5yb3VuZChzZWNvbmRzIC8gbWludXRlKTtcblx0XHRpZiAoYXBwZW5kQWdvTGFiZWwpIHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5taW51dGVzLnNpbmd1bGFyLmFnby5mdWxsV29yZCcsICd7MH0gbWludXRlIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5taW51dGVzLnNpbmd1bGFyLmFnbycsICd7MH0gbWluIGFnbycsIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93Lm1pbnV0ZXMucGx1cmFsLmFnby5mdWxsV29yZCcsICd7MH0gbWludXRlcyBhZ28nLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cubWludXRlcy5wbHVyYWwuYWdvJywgJ3swfSBtaW5zIGFnbycsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHZhbHVlID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93Lm1pbnV0ZXMuc2luZ3VsYXIuZnVsbFdvcmQnLCAnezB9IG1pbnV0ZScsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5taW51dGVzLnNpbmd1bGFyJywgJ3swfSBtaW4nLCB2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5taW51dGVzLnBsdXJhbC5mdWxsV29yZCcsICd7MH0gbWludXRlcycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5taW51dGVzLnBsdXJhbCcsICd7MH0gbWlucycsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoc2Vjb25kcyA8IGRheSkge1xuXHRcdHZhbHVlID0gTWF0aC5yb3VuZChzZWNvbmRzIC8gaG91cik7XG5cdFx0aWYgKGFwcGVuZEFnb0xhYmVsKSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuaG91cnMuc2luZ3VsYXIuYWdvLmZ1bGxXb3JkJywgJ3swfSBob3VyIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5ob3Vycy5zaW5ndWxhci5hZ28nLCAnezB9IGhyIGFnbycsIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmhvdXJzLnBsdXJhbC5hZ28uZnVsbFdvcmQnLCAnezB9IGhvdXJzIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5ob3Vycy5wbHVyYWwuYWdvJywgJ3swfSBocnMgYWdvJywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuaG91cnMuc2luZ3VsYXIuZnVsbFdvcmQnLCAnezB9IGhvdXInLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuaG91cnMuc2luZ3VsYXInLCAnezB9IGhyJywgdmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuaG91cnMucGx1cmFsLmZ1bGxXb3JkJywgJ3swfSBob3VycycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5ob3Vycy5wbHVyYWwnLCAnezB9IGhycycsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoc2Vjb25kcyA8IHdlZWspIHtcblx0XHR2YWx1ZSA9IE1hdGgucm91bmQoc2Vjb25kcyAvIGRheSk7XG5cdFx0aWYgKGFwcGVuZEFnb0xhYmVsKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmRheXMuc2luZ3VsYXIuYWdvJywgJ3swfSBkYXkgYWdvJywgdmFsdWUpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5kYXlzLnBsdXJhbC5hZ28nLCAnezB9IGRheXMgYWdvJywgdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmRheXMuc2luZ3VsYXInLCAnezB9IGRheScsIHZhbHVlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuZGF5cy5wbHVyYWwnLCAnezB9IGRheXMnLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNlY29uZHMgPCBtb250aCkge1xuXHRcdHZhbHVlID0gTWF0aC5yb3VuZChzZWNvbmRzIC8gd2Vlayk7XG5cdFx0aWYgKGFwcGVuZEFnb0xhYmVsKSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cud2Vla3Muc2luZ3VsYXIuYWdvLmZ1bGxXb3JkJywgJ3swfSB3ZWVrIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy53ZWVrcy5zaW5ndWxhci5hZ28nLCAnezB9IHdrIGFnbycsIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LndlZWtzLnBsdXJhbC5hZ28uZnVsbFdvcmQnLCAnezB9IHdlZWtzIGFnbycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy53ZWVrcy5wbHVyYWwuYWdvJywgJ3swfSB3a3MgYWdvJywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cud2Vla3Muc2luZ3VsYXIuZnVsbFdvcmQnLCAnezB9IHdlZWsnLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cud2Vla3Muc2luZ3VsYXInLCAnezB9IHdrJywgdmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cud2Vla3MucGx1cmFsLmZ1bGxXb3JkJywgJ3swfSB3ZWVrcycsIHZhbHVlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy53ZWVrcy5wbHVyYWwnLCAnezB9IHdrcycsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoc2Vjb25kcyA8IHllYXIpIHtcblx0XHR2YWx1ZSA9IE1hdGgucm91bmQoc2Vjb25kcyAvIG1vbnRoKTtcblx0XHRpZiAoYXBwZW5kQWdvTGFiZWwpIHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5tb250aHMuc2luZ3VsYXIuYWdvLmZ1bGxXb3JkJywgJ3swfSBtb250aCBhZ28nLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cubW9udGhzLnNpbmd1bGFyLmFnbycsICd7MH0gbW8gYWdvJywgdmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cubW9udGhzLnBsdXJhbC5hZ28uZnVsbFdvcmQnLCAnezB9IG1vbnRocyBhZ28nLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cubW9udGhzLnBsdXJhbC5hZ28nLCAnezB9IG1vcyBhZ28nLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5tb250aHMuc2luZ3VsYXIuZnVsbFdvcmQnLCAnezB9IG1vbnRoJywgdmFsdWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93Lm1vbnRocy5zaW5ndWxhcicsICd7MH0gbW8nLCB2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy5tb250aHMucGx1cmFsLmZ1bGxXb3JkJywgJ3swfSBtb250aHMnLCB2YWx1ZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cubW9udGhzLnBsdXJhbCcsICd7MH0gbW9zJywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhbHVlID0gTWF0aC5yb3VuZChzZWNvbmRzIC8geWVhcik7XG5cdGlmIChhcHBlbmRBZ29MYWJlbCkge1xuXHRcdGlmICh2YWx1ZSA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnllYXJzLnNpbmd1bGFyLmFnby5mdWxsV29yZCcsICd7MH0geWVhciBhZ28nLCB2YWx1ZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LnllYXJzLnNpbmd1bGFyLmFnbycsICd7MH0geXIgYWdvJywgdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cueWVhcnMucGx1cmFsLmFnby5mdWxsV29yZCcsICd7MH0geWVhcnMgYWdvJywgdmFsdWUpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy55ZWFycy5wbHVyYWwuYWdvJywgJ3swfSB5cnMgYWdvJywgdmFsdWUpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpZiAodmFsdWUgPT09IDEpIHtcblx0XHRcdHJldHVybiB1c2VGdWxsVGltZVdvcmRzXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2RhdGUuZnJvbU5vdy55ZWFycy5zaW5ndWxhci5mdWxsV29yZCcsICd7MH0geWVhcicsIHZhbHVlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cueWVhcnMuc2luZ3VsYXInLCAnezB9IHlyJywgdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cueWVhcnMucGx1cmFsLmZ1bGxXb3JkJywgJ3swfSB5ZWFycycsIHZhbHVlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cueWVhcnMucGx1cmFsJywgJ3swfSB5cnMnLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmcm9tTm93QnlEYXkoZGF0ZTogbnVtYmVyIHwgRGF0ZSwgYXBwZW5kQWdvTGFiZWw/OiBib29sZWFuLCB1c2VGdWxsVGltZVdvcmRzPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgZGF0ZSAhPT0gJ251bWJlcicpIHtcblx0XHRkYXRlID0gZGF0ZS5nZXRUaW1lKCk7XG5cdH1cblxuXHRjb25zdCB0b2RheU1pZG5pZ2h0VGltZSA9IG5ldyBEYXRlKCk7XG5cdHRvZGF5TWlkbmlnaHRUaW1lLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuXHRjb25zdCB5ZXN0ZXJkYXlNaWRuaWdodFRpbWUgPSBuZXcgRGF0ZSh0b2RheU1pZG5pZ2h0VGltZS5nZXRUaW1lKCkpO1xuXHR5ZXN0ZXJkYXlNaWRuaWdodFRpbWUuc2V0RGF0ZSh5ZXN0ZXJkYXlNaWRuaWdodFRpbWUuZ2V0RGF0ZSgpIC0gMSk7XG5cblx0aWYgKGRhdGUgPiB0b2RheU1pZG5pZ2h0VGltZS5nZXRUaW1lKCkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3RvZGF5JywgJ1RvZGF5Jyk7XG5cdH1cblxuXHRpZiAoZGF0ZSA+IHllc3RlcmRheU1pZG5pZ2h0VGltZS5nZXRUaW1lKCkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3llc3RlcmRheScsICdZZXN0ZXJkYXknKTtcblx0fVxuXG5cdHJldHVybiBmcm9tTm93KGRhdGUsIGFwcGVuZEFnb0xhYmVsLCB1c2VGdWxsVGltZVdvcmRzKTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgcmVhZGFibGUgZHVyYXRpb24gd2l0aCBpbnRlbGxpZ2VudC9sb3NzeSBwcmVjaXNpb24uIEZvciBleGFtcGxlIFwiNDBtc1wiIG9yIFwiMy4wNDBzXCIpXG4gKiBAcGFyYW0gbXMgVGhlIGR1cmF0aW9uIHRvIGdldCBpbiBtaWxsaXNlY29uZHMuXG4gKiBAcGFyYW0gdXNlRnVsbFRpbWVXb3JkcyBXaGV0aGVyIHRvIHVzZSBmdWxsIHdvcmRzIChlZy4gc2Vjb25kcykgaW5zdGVhZCBvZlxuICogc2hvcnRlbmVkIChlZy4gc2VjcykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREdXJhdGlvblN0cmluZyhtczogbnVtYmVyLCB1c2VGdWxsVGltZVdvcmRzPzogYm9vbGVhbikge1xuXHRjb25zdCBzZWNvbmRzID0gTWF0aC5hYnMobXMgLyAxMDAwKTtcblx0aWYgKHNlY29uZHMgPCAxKSB7XG5cdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdD8gbG9jYWxpemUoJ2R1cmF0aW9uLm1zLmZ1bGwnLCAnezB9IG1pbGxpc2Vjb25kcycsIG1zKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZHVyYXRpb24ubXMnLCAnezB9bXMnLCBtcyk7XG5cdH1cblx0aWYgKHNlY29uZHMgPCBtaW51dGUpIHtcblx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0PyBsb2NhbGl6ZSgnZHVyYXRpb24ucy5mdWxsJywgJ3swfSBzZWNvbmRzJywgTWF0aC5yb3VuZChtcykgLyAxMDAwKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZHVyYXRpb24ucycsICd7MH1zJywgTWF0aC5yb3VuZChtcykgLyAxMDAwKTtcblx0fVxuXHRpZiAoc2Vjb25kcyA8IGhvdXIpIHtcblx0XHRyZXR1cm4gdXNlRnVsbFRpbWVXb3Jkc1xuXHRcdFx0PyBsb2NhbGl6ZSgnZHVyYXRpb24ubS5mdWxsJywgJ3swfSBtaW51dGVzJywgTWF0aC5yb3VuZChtcyAvICgxMDAwICogbWludXRlKSkpXG5cdFx0XHQ6IGxvY2FsaXplKCdkdXJhdGlvbi5tJywgJ3swfSBtaW5zJywgTWF0aC5yb3VuZChtcyAvICgxMDAwICogbWludXRlKSkpO1xuXHR9XG5cdGlmIChzZWNvbmRzIDwgZGF5KSB7XG5cdFx0cmV0dXJuIHVzZUZ1bGxUaW1lV29yZHNcblx0XHRcdD8gbG9jYWxpemUoJ2R1cmF0aW9uLmguZnVsbCcsICd7MH0gaG91cnMnLCBNYXRoLnJvdW5kKG1zIC8gKDEwMDAgKiBob3VyKSkpXG5cdFx0XHQ6IGxvY2FsaXplKCdkdXJhdGlvbi5oJywgJ3swfSBocnMnLCBNYXRoLnJvdW5kKG1zIC8gKDEwMDAgKiBob3VyKSkpO1xuXHR9XG5cdHJldHVybiBsb2NhbGl6ZSgnZHVyYXRpb24uZCcsICd7MH0gZGF5cycsIE1hdGgucm91bmQobXMgLyAoMTAwMCAqIGRheSkpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvTG9jYWxJU09TdHJpbmcoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XG5cdHJldHVybiBkYXRlLmdldEZ1bGxZZWFyKCkgK1xuXHRcdCctJyArIFN0cmluZyhkYXRlLmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpICtcblx0XHQnLScgKyBTdHJpbmcoZGF0ZS5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsICcwJykgK1xuXHRcdCdUJyArIFN0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsICcwJykgK1xuXHRcdCc6JyArIFN0cmluZyhkYXRlLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKSArXG5cdFx0JzonICsgU3RyaW5nKGRhdGUuZ2V0U2Vjb25kcygpKS5wYWRTdGFydCgyLCAnMCcpICtcblx0XHQnLicgKyAoZGF0ZS5nZXRNaWxsaXNlY29uZHMoKSAvIDEwMDApLnRvRml4ZWQoMykuc2xpY2UoMiwgNSkgK1xuXHRcdCdaJztcbn1cblxuZXhwb3J0IGNvbnN0IHNhZmVJbnRsID0ge1xuXHREYXRlVGltZUZvcm1hdChsb2NhbGVzPzogSW50bC5Mb2NhbGVzQXJndW1lbnQsIG9wdGlvbnM/OiBJbnRsLkRhdGVUaW1lRm9ybWF0T3B0aW9ucyk6IExhenk8SW50bC5EYXRlVGltZUZvcm1hdD4ge1xuXHRcdHJldHVybiBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEludGwuRGF0ZVRpbWVGb3JtYXQobG9jYWxlcywgb3B0aW9ucyk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBJbnRsLkRhdGVUaW1lRm9ybWF0KHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0sXG5cdENvbGxhdG9yKGxvY2FsZXM/OiBJbnRsLkxvY2FsZXNBcmd1bWVudCwgb3B0aW9ucz86IEludGwuQ29sbGF0b3JPcHRpb25zKTogTGF6eTxJbnRsLkNvbGxhdG9yPiB7XG5cdFx0cmV0dXJuIG5ldyBMYXp5KCgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBuZXcgSW50bC5Db2xsYXRvcihsb2NhbGVzLCBvcHRpb25zKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEludGwuQ29sbGF0b3IodW5kZWZpbmVkLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblx0U2VnbWVudGVyKGxvY2FsZXM/OiBJbnRsLkxvY2FsZXNBcmd1bWVudCwgb3B0aW9ucz86IEludGwuU2VnbWVudGVyT3B0aW9ucyk6IExhenk8SW50bC5TZWdtZW50ZXI+IHtcblx0XHRyZXR1cm4gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBJbnRsLlNlZ21lbnRlcihsb2NhbGVzLCBvcHRpb25zKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEludGwuU2VnbWVudGVyKHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0sXG5cdExvY2FsZSh0YWc6IEludGwuTG9jYWxlIHwgc3RyaW5nLCBvcHRpb25zPzogSW50bC5Mb2NhbGVPcHRpb25zKTogTGF6eTxJbnRsLkxvY2FsZT4ge1xuXHRcdHJldHVybiBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEludGwuTG9jYWxlKHRhZywgb3B0aW9ucyk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBJbnRsLkxvY2FsZShMQU5HVUFHRV9ERUZBVUxULCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblx0TnVtYmVyRm9ybWF0KGxvY2FsZXM/OiBJbnRsLkxvY2FsZXNBcmd1bWVudCwgb3B0aW9ucz86IEludGwuTnVtYmVyRm9ybWF0T3B0aW9ucyk6IExhenk8SW50bC5OdW1iZXJGb3JtYXQ+IHtcblx0XHRyZXR1cm4gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBJbnRsLk51bWJlckZvcm1hdChsb2NhbGVzLCBvcHRpb25zKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEludGwuTnVtYmVyRm9ybWF0KHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVk7QUFDckIsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxTQUFTO0FBQ2YsTUFBTSxPQUFPLFNBQVM7QUFDdEIsTUFBTSxNQUFNLE9BQU87QUFDbkIsTUFBTSxPQUFPLE1BQU07QUFDbkIsTUFBTSxRQUFRLE1BQU07QUFDcEIsTUFBTSxPQUFPLE1BQU07QUFXWixTQUFTLFFBQVEsTUFBcUIsZ0JBQTBCLGtCQUE0QixhQUErQjtBQUNqSSxNQUFJLE9BQU8sU0FBUyxhQUFhO0FBQ2hDLFdBQU8sU0FBUyx3QkFBd0IsU0FBUztBQUFBLEVBQ2xEO0FBRUEsTUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBRUEsUUFBTSxVQUFVLEtBQUssUUFBTyxvQkFBSSxLQUFLLEdBQUUsUUFBUSxJQUFJLFFBQVEsR0FBSTtBQUMvRCxNQUFJLFVBQVUsS0FBSztBQUNsQixXQUFPLFNBQVMsbUJBQW1CLFVBQVUsU0FBUSxvQkFB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SyxXQUFXLENBQUMsRUFBRSxTQUFTLEdBQUcsR0FBRyxJQUMvQyxPQUFPLEtBQUssZ0JBQWdCLElBQUksS0FBTSxRQUFRLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxJQUMzRDtBQUNGO0FBRU8sTUFBTSxXQUFXO0FBQUEsRUFDdkIsZUFBZSxTQUFnQyxTQUFpRTtBQUMvRyxXQUFPLElBQUksS0FBSyxNQUFNO0FBQ3JCLFVBQUk7QUFDSCxlQUFPLElBQUksS0FBSyxlQUFlLFNBQVMsT0FBTztBQUFBLE1BQ2hELFFBQVE7QUFDUCxlQUFPLElBQUksS0FBSyxlQUFlLFFBQVcsT0FBTztBQUFBLE1BQ2xEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBUyxTQUFnQyxTQUFxRDtBQUM3RixXQUFPLElBQUksS0FBSyxNQUFNO0FBQ3JCLFVBQUk7QUFDSCxlQUFPLElBQUksS0FBSyxTQUFTLFNBQVMsT0FBTztBQUFBLE1BQzFDLFFBQVE7QUFDUCxlQUFPLElBQUksS0FBSyxTQUFTLFFBQVcsT0FBTztBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsVUFBVSxTQUFnQyxTQUF1RDtBQUNoRyxXQUFPLElBQUksS0FBSyxNQUFNO0FBQ3JCLFVBQUk7QUFDSCxlQUFPLElBQUksS0FBSyxVQUFVLFNBQVMsT0FBTztBQUFBLE1BQzNDLFFBQVE7QUFDUCxlQUFPLElBQUksS0FBSyxVQUFVLFFBQVcsT0FBTztBQUFBLE1BQzdDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTyxLQUEyQixTQUFpRDtBQUNsRixXQUFPLElBQUksS0FBSyxNQUFNO0FBQ3JCLFVBQUk7QUFDSCxlQUFPLElBQUksS0FBSyxPQUFPLEtBQUssT0FBTztBQUFBLE1BQ3BDLFFBQVE7QUFDUCxlQUFPLElBQUksS0FBSyxPQUFPLGtCQUFrQixPQUFPO0FBQUEsTUFDakQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDQSxhQUFhLFNBQWdDLFNBQTZEO0FBQ3pHLFdBQU8sSUFBSSxLQUFLLE1BQU07QUFDckIsVUFBSTtBQUNILGVBQU8sSUFBSSxLQUFLLGFBQWEsU0FBUyxPQUFPO0FBQUEsTUFDOUMsUUFBUTtBQUNQLGVBQU8sSUFBSSxLQUFLLGFBQWEsUUFBVyxPQUFPO0FBQUEsTUFDaEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
