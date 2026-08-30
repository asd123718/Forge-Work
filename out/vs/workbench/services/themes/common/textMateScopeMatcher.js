function createMatchers(selector, matchesName, results) {
  const tokenizer = newTokenizer(selector);
  let token = tokenizer.next();
  while (token !== null) {
    let priority = 0;
    if (token.length === 2 && token.charAt(1) === ":") {
      switch (token.charAt(0)) {
        case "R":
          priority = 1;
          break;
        case "L":
          priority = -1;
          break;
        default:
          console.log(`Unknown priority ${token} in scope selector`);
      }
      token = tokenizer.next();
    }
    const matcher = parseConjunction();
    if (matcher) {
      results.push({ matcher, priority });
    }
    if (token !== ",") {
      break;
    }
    token = tokenizer.next();
  }
  function parseOperand() {
    if (token === "-") {
      token = tokenizer.next();
      const expressionToNegate = parseOperand();
      if (!expressionToNegate) {
        return null;
      }
      return (matcherInput) => {
        const score = expressionToNegate(matcherInput);
        return score < 0 ? 0 : -1;
      };
    }
    if (token === "(") {
      token = tokenizer.next();
      const expressionInParents = parseInnerExpression();
      if (token === ")") {
        token = tokenizer.next();
      }
      return expressionInParents;
    }
    if (isIdentifier(token)) {
      const identifiers = [];
      do {
        identifiers.push(token);
        token = tokenizer.next();
      } while (isIdentifier(token));
      return (matcherInput) => matchesName(identifiers, matcherInput);
    }
    return null;
  }
  function parseConjunction() {
    let matcher = parseOperand();
    if (!matcher) {
      return null;
    }
    const matchers = [];
    while (matcher) {
      matchers.push(matcher);
      matcher = parseOperand();
    }
    return (matcherInput) => {
      let min = matchers[0](matcherInput);
      for (let i = 1; min >= 0 && i < matchers.length; i++) {
        min = Math.min(min, matchers[i](matcherInput));
      }
      return min;
    };
  }
  function parseInnerExpression() {
    let matcher = parseConjunction();
    if (!matcher) {
      return null;
    }
    const matchers = [];
    while (matcher) {
      matchers.push(matcher);
      if (token === "|" || token === ",") {
        do {
          token = tokenizer.next();
        } while (token === "|" || token === ",");
      } else {
        break;
      }
      matcher = parseConjunction();
    }
    return (matcherInput) => {
      let max = matchers[0](matcherInput);
      for (let i = 1; i < matchers.length; i++) {
        max = Math.max(max, matchers[i](matcherInput));
      }
      return max;
    };
  }
}
function isIdentifier(token) {
  return !!token && !!token.match(/[\w\.:]+/);
}
function newTokenizer(input) {
  const regex = /([LR]:|[\w\.:][\w\.:\-]*|[\,\|\-\(\)])/g;
  let match = regex.exec(input);
  return {
    next: () => {
      if (!match) {
        return null;
      }
      const res = match[0];
      match = regex.exec(input);
      return res;
    }
  };
}
export {
  createMatchers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcdGV4dE1hdGVTY29wZU1hdGNoZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWF0Y2hlcldpdGhQcmlvcml0eTxUPiB7XG5cdG1hdGNoZXI6IE1hdGNoZXI8VD47XG5cdHByaW9yaXR5OiAtMSB8IDAgfCAxO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1hdGNoZXI8VD4ge1xuXHQobWF0Y2hlcklucHV0OiBUKTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWF0Y2hlcnM8VD4oc2VsZWN0b3I6IHN0cmluZywgbWF0Y2hlc05hbWU6IChuYW1lczogc3RyaW5nW10sIG1hdGNoZXJJbnB1dDogVCkgPT4gbnVtYmVyLCByZXN1bHRzOiBNYXRjaGVyV2l0aFByaW9yaXR5PFQ+W10pOiB2b2lkIHtcblx0Y29uc3QgdG9rZW5pemVyID0gbmV3VG9rZW5pemVyKHNlbGVjdG9yKTtcblx0bGV0IHRva2VuID0gdG9rZW5pemVyLm5leHQoKTtcblx0d2hpbGUgKHRva2VuICE9PSBudWxsKSB7XG5cdFx0bGV0IHByaW9yaXR5OiAtMSB8IDAgfCAxID0gMDtcblx0XHRpZiAodG9rZW4ubGVuZ3RoID09PSAyICYmIHRva2VuLmNoYXJBdCgxKSA9PT0gJzonKSB7XG5cdFx0XHRzd2l0Y2ggKHRva2VuLmNoYXJBdCgwKSkge1xuXHRcdFx0XHRjYXNlICdSJzogcHJpb3JpdHkgPSAxOyBicmVhaztcblx0XHRcdFx0Y2FzZSAnTCc6IHByaW9yaXR5ID0gLTE7IGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGBVbmtub3duIHByaW9yaXR5ICR7dG9rZW59IGluIHNjb3BlIHNlbGVjdG9yYCk7XG5cdFx0XHR9XG5cdFx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoZXIgPSBwYXJzZUNvbmp1bmN0aW9uKCk7XG5cdFx0aWYgKG1hdGNoZXIpIHtcblx0XHRcdHJlc3VsdHMucHVzaCh7IG1hdGNoZXIsIHByaW9yaXR5IH0pO1xuXHRcdH1cblx0XHRpZiAodG9rZW4gIT09ICcsJykge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHRva2VuID0gdG9rZW5pemVyLm5leHQoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlT3BlcmFuZCgpOiBNYXRjaGVyPFQ+IHwgbnVsbCB7XG5cdFx0aWYgKHRva2VuID09PSAnLScpIHtcblx0XHRcdHRva2VuID0gdG9rZW5pemVyLm5leHQoKTtcblx0XHRcdGNvbnN0IGV4cHJlc3Npb25Ub05lZ2F0ZSA9IHBhcnNlT3BlcmFuZCgpO1xuXHRcdFx0aWYgKCFleHByZXNzaW9uVG9OZWdhdGUpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWF0Y2hlcklucHV0ID0+IHtcblx0XHRcdFx0Y29uc3Qgc2NvcmUgPSBleHByZXNzaW9uVG9OZWdhdGUobWF0Y2hlcklucHV0KTtcblx0XHRcdFx0cmV0dXJuIHNjb3JlIDwgMCA/IDAgOiAtMTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICh0b2tlbiA9PT0gJygnKSB7XG5cdFx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uSW5QYXJlbnRzID0gcGFyc2VJbm5lckV4cHJlc3Npb24oKTtcblx0XHRcdGlmICh0b2tlbiA9PT0gJyknKSB7XG5cdFx0XHRcdHRva2VuID0gdG9rZW5pemVyLm5leHQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHByZXNzaW9uSW5QYXJlbnRzO1xuXHRcdH1cblx0XHRpZiAoaXNJZGVudGlmaWVyKHRva2VuKSkge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGlkZW50aWZpZXJzLnB1c2godG9rZW4pO1xuXHRcdFx0XHR0b2tlbiA9IHRva2VuaXplci5uZXh0KCk7XG5cdFx0XHR9IHdoaWxlIChpc0lkZW50aWZpZXIodG9rZW4pKTtcblx0XHRcdHJldHVybiBtYXRjaGVySW5wdXQgPT4gbWF0Y2hlc05hbWUoaWRlbnRpZmllcnMsIG1hdGNoZXJJbnB1dCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGZ1bmN0aW9uIHBhcnNlQ29uanVuY3Rpb24oKTogTWF0Y2hlcjxUPiB8IG51bGwge1xuXHRcdGxldCBtYXRjaGVyID0gcGFyc2VPcGVyYW5kKCk7XG5cdFx0aWYgKCFtYXRjaGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVyczogTWF0Y2hlcjxUPltdID0gW107XG5cdFx0d2hpbGUgKG1hdGNoZXIpIHtcblx0XHRcdG1hdGNoZXJzLnB1c2gobWF0Y2hlcik7XG5cdFx0XHRtYXRjaGVyID0gcGFyc2VPcGVyYW5kKCk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVySW5wdXQgPT4geyAgLy8gYW5kXG5cdFx0XHRsZXQgbWluID0gbWF0Y2hlcnNbMF0obWF0Y2hlcklucHV0KTtcblx0XHRcdGZvciAobGV0IGkgPSAxOyBtaW4gPj0gMCAmJiBpIDwgbWF0Y2hlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bWluID0gTWF0aC5taW4obWluLCBtYXRjaGVyc1tpXShtYXRjaGVySW5wdXQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtaW47XG5cdFx0fTtcblx0fVxuXHRmdW5jdGlvbiBwYXJzZUlubmVyRXhwcmVzc2lvbigpOiBNYXRjaGVyPFQ+IHwgbnVsbCB7XG5cdFx0bGV0IG1hdGNoZXIgPSBwYXJzZUNvbmp1bmN0aW9uKCk7XG5cdFx0aWYgKCFtYXRjaGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbWF0Y2hlcnM6IE1hdGNoZXI8VD5bXSA9IFtdO1xuXHRcdHdoaWxlIChtYXRjaGVyKSB7XG5cdFx0XHRtYXRjaGVycy5wdXNoKG1hdGNoZXIpO1xuXHRcdFx0aWYgKHRva2VuID09PSAnfCcgfHwgdG9rZW4gPT09ICcsJykge1xuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0dG9rZW4gPSB0b2tlbml6ZXIubmV4dCgpO1xuXHRcdFx0XHR9IHdoaWxlICh0b2tlbiA9PT0gJ3wnIHx8IHRva2VuID09PSAnLCcpOyAvLyBpZ25vcmUgc3Vic2VxdWVudCBjb21tYXNcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0bWF0Y2hlciA9IHBhcnNlQ29uanVuY3Rpb24oKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoZXJJbnB1dCA9PiB7ICAvLyBvclxuXHRcdFx0bGV0IG1heCA9IG1hdGNoZXJzWzBdKG1hdGNoZXJJbnB1dCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdG1heCA9IE1hdGgubWF4KG1heCwgbWF0Y2hlcnNbaV0obWF0Y2hlcklucHV0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWF4O1xuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNJZGVudGlmaWVyKHRva2VuOiBzdHJpbmcgfCBudWxsKTogdG9rZW4gaXMgc3RyaW5nIHtcblx0cmV0dXJuICEhdG9rZW4gJiYgISF0b2tlbi5tYXRjaCgvW1xcd1xcLjpdKy8pO1xufVxuXG5mdW5jdGlvbiBuZXdUb2tlbml6ZXIoaW5wdXQ6IHN0cmluZyk6IHsgbmV4dDogKCkgPT4gc3RyaW5nIHwgbnVsbCB9IHtcblx0Y29uc3QgcmVnZXggPSAvKFtMUl06fFtcXHdcXC46XVtcXHdcXC46XFwtXSp8W1xcLFxcfFxcLVxcKFxcKV0pL2c7XG5cdGxldCBtYXRjaCA9IHJlZ2V4LmV4ZWMoaW5wdXQpO1xuXHRyZXR1cm4ge1xuXHRcdG5leHQ6ICgpID0+IHtcblx0XHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXMgPSBtYXRjaFswXTtcblx0XHRcdG1hdGNoID0gcmVnZXguZXhlYyhpbnB1dCk7XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQWdCTyxTQUFTLGVBQWtCLFVBQWtCLGFBQTJELFNBQXlDO0FBQ3ZKLFFBQU0sWUFBWSxhQUFhLFFBQVE7QUFDdkMsTUFBSSxRQUFRLFVBQVUsS0FBSztBQUMzQixTQUFPLFVBQVUsTUFBTTtBQUN0QixRQUFJLFdBQXVCO0FBQzNCLFFBQUksTUFBTSxXQUFXLEtBQUssTUFBTSxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQ2xELGNBQVEsTUFBTSxPQUFPLENBQUMsR0FBRztBQUFBLFFBQ3hCLEtBQUs7QUFBSyxxQkFBVztBQUFHO0FBQUEsUUFDeEIsS0FBSztBQUFLLHFCQUFXO0FBQUk7QUFBQSxRQUN6QjtBQUNDLGtCQUFRLElBQUksb0JBQW9CLEtBQUssb0JBQW9CO0FBQUEsTUFDM0Q7QUFDQSxjQUFRLFVBQVUsS0FBSztBQUFBLElBQ3hCO0FBQ0Es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
