const standardBracketRules = [
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
];
const rubyBracketRules = standardBracketRules;
const cppBracketRules = standardBracketRules;
const goBracketRules = standardBracketRules;
const phpBracketRules = standardBracketRules;
const vbBracketRules = standardBracketRules;
const luaBracketRules = standardBracketRules;
const htmlBracketRules = [
  ["<!--", "-->"],
  ["{", "}"],
  ["(", ")"]
];
const typescriptBracketRules = [
  ["${", "}"],
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
];
const latexBracketRules = [
  ["{", "}"],
  ["[", "]"],
  ["(", ")"],
  ["[", ")"],
  ["(", "]"],
  ["\\left(", "\\right)"],
  ["\\left(", "\\right."],
  ["\\left.", "\\right)"],
  ["\\left[", "\\right]"],
  ["\\left[", "\\right."],
  ["\\left.", "\\right]"],
  ["\\left\\{", "\\right\\}"],
  ["\\left\\{", "\\right."],
  ["\\left.", "\\right\\}"],
  ["\\left<", "\\right>"],
  ["\\bigl(", "\\bigr)"],
  ["\\bigl[", "\\bigr]"],
  ["\\bigl\\{", "\\bigr\\}"],
  ["\\Bigl(", "\\Bigr)"],
  ["\\Bigl[", "\\Bigr]"],
  ["\\Bigl\\{", "\\Bigr\\}"],
  ["\\biggl(", "\\biggr)"],
  ["\\biggl[", "\\biggr]"],
  ["\\biggl\\{", "\\biggr\\}"],
  ["\\Biggl(", "\\Biggr)"],
  ["\\Biggl[", "\\Biggr]"],
  ["\\Biggl\\{", "\\Biggr\\}"],
  ["\\langle", "\\rangle"],
  ["\\lvert", "\\rvert"],
  ["\\lVert", "\\rVert"],
  ["\\left|", "\\right|"],
  ["\\left\\vert", "\\right\\vert"],
  ["\\left\\|", "\\right\\|"],
  ["\\left\\Vert", "\\right\\Vert"],
  ["\\left\\langle", "\\right\\rangle"],
  ["\\left\\lvert", "\\right\\rvert"],
  ["\\left\\lVert", "\\right\\rVert"],
  ["\\bigl\\langle", "\\bigr\\rangle"],
  ["\\bigl|", "\\bigr|"],
  ["\\bigl\\vert", "\\bigr\\vert"],
  ["\\bigl\\lvert", "\\bigr\\rvert"],
  ["\\bigl\\|", "\\bigr\\|"],
  ["\\bigl\\lVert", "\\bigr\\rVert"],
  ["\\bigl\\Vert", "\\bigr\\Vert"],
  ["\\Bigl\\langle", "\\Bigr\\rangle"],
  ["\\Bigl|", "\\Bigr|"],
  ["\\Bigl\\lvert", "\\Bigr\\rvert"],
  ["\\Bigl\\vert", "\\Bigr\\vert"],
  ["\\Bigl\\|", "\\Bigr\\|"],
  ["\\Bigl\\lVert", "\\Bigr\\rVert"],
  ["\\Bigl\\Vert", "\\Bigr\\Vert"],
  ["\\biggl\\langle", "\\biggr\\rangle"],
  ["\\biggl|", "\\biggr|"],
  ["\\biggl\\lvert", "\\biggr\\rvert"],
  ["\\biggl\\vert", "\\biggr\\vert"],
  ["\\biggl\\|", "\\biggr\\|"],
  ["\\biggl\\lVert", "\\biggr\\rVert"],
  ["\\biggl\\Vert", "\\biggr\\Vert"],
  ["\\Biggl\\langle", "\\Biggr\\rangle"],
  ["\\Biggl|", "\\Biggr|"],
  ["\\Biggl\\lvert", "\\Biggr\\rvert"],
  ["\\Biggl\\vert", "\\Biggr\\vert"],
  ["\\Biggl\\|", "\\Biggr\\|"],
  ["\\Biggl\\lVert", "\\Biggr\\rVert"],
  ["\\Biggl\\Vert", "\\Biggr\\Vert"]
];
export {
  cppBracketRules,
  goBracketRules,
  htmlBracketRules,
  latexBracketRules,
  luaBracketRules,
  phpBracketRules,
  rubyBracketRules,
  typescriptBracketRules,
  vbBracketRules
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHN1cHBvcnRzXFxicmFja2V0UnVsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyYWN0ZXJQYWlyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuXG5jb25zdCBzdGFuZGFyZEJyYWNrZXRSdWxlczogQ2hhcmFjdGVyUGFpcltdID0gW1xuXHRbJ3snLCAnfSddLFxuXHRbJ1snLCAnXSddLFxuXHRbJygnLCAnKSddXG5dO1xuXG5leHBvcnQgY29uc3QgcnVieUJyYWNrZXRSdWxlcyA9IHN0YW5kYXJkQnJhY2tldFJ1bGVzO1xuXG5leHBvcnQgY29uc3QgY3BwQnJhY2tldFJ1bGVzID0gc3RhbmRhcmRCcmFja2V0UnVsZXM7XG5cbmV4cG9ydCBjb25zdCBnb0JyYWNrZXRSdWxlcyA9IHN0YW5kYXJkQnJhY2tldFJ1bGVzO1xuXG5leHBvcnQgY29uc3QgcGhwQnJhY2tldFJ1bGVzID0gc3RhbmRhcmRCcmFja2V0UnVsZXM7XG5cbmV4cG9ydCBjb25zdCB2YkJyYWNrZXRSdWxlcyA9IHN0YW5kYXJkQnJhY2tldFJ1bGVzO1xuXG5leHBvcnQgY29uc3QgbHVhQnJhY2tldFJ1bGVzID0gc3RhbmRhcmRCcmFja2V0UnVsZXM7XG5cbmV4cG9ydCBjb25zdCBodG1sQnJhY2tldFJ1bGVzOiBDaGFyYWN0ZXJQYWlyW10gPSBbXG5cdFsnPCEtLScsICctLT4nXSxcblx0Wyd7JywgJ30nXSxcblx0WycoJywgJyknXVxuXTtcblxuZXhwb3J0IGNvbnN0IHR5cGVzY3JpcHRCcmFja2V0UnVsZXM6IENoYXJhY3RlclBhaXJbXSA9IFtcblx0WyckeycsICd9J10sXG5cdFsneycsICd9J10sXG5cdFsnWycsICddJ10sXG5cdFsnKCcsICcpJ11cbl07XG5cbmV4cG9ydCBjb25zdCBsYXRleEJyYWNrZXRSdWxlczogQ2hhcmFjdGVyUGFpcltdID0gW1xuXHRbJ3snLCAnfSddLFxuXHRbJ1snLCAnXSddLFxuXHRbJygnLCAnKSddLFxuXHRbJ1snLCAnKSddLFxuXHRbJygnLCAnXSddLFxuXHRbJ1xcXFxsZWZ0KCcsICdcXFxccmlnaHQpJ10sXG5cdFsnXFxcXGxlZnQoJywgJ1xcXFxyaWdodC4nXSxcblx0WydcXFxcbGVmdC4nLCAnXFxcXHJpZ2h0KSddLFxuXHRbJ1xcXFxsZWZ0WycsICdcXFxccmlnaHRdJ10sXG5cdFsnXFxcXGxlZnRbJywgJ1xcXFxyaWdodC4nXSxcblx0WydcXFxcbGVmdC4nLCAnXFxcXHJpZ2h0XSddLFxuXHRbJ1xcXFxsZWZ0XFxcXHsnLCAnXFxcXHJpZ2h0XFxcXH0nXSxcblx0WydcXFxcbGVmdFxcXFx7JywgJ1xcXFxyaWdodC4nXSxcblx0WydcXFxcbGVmdC4nLCAnXFxcXHJpZ2h0XFxcXH0nXSxcblx0WydcXFxcbGVmdDwnLCAnXFxcXHJpZ2h0PiddLFxuXHRbJ1xcXFxiaWdsKCcsICdcXFxcYmlnciknXSxcblx0WydcXFxcYmlnbFsnLCAnXFxcXGJpZ3JdJ10sXG5cdFsnXFxcXGJpZ2xcXFxceycsICdcXFxcYmlnclxcXFx9J10sXG5cdFsnXFxcXEJpZ2woJywgJ1xcXFxCaWdyKSddLFxuXHRbJ1xcXFxCaWdsWycsICdcXFxcQmlncl0nXSxcblx0WydcXFxcQmlnbFxcXFx7JywgJ1xcXFxCaWdyXFxcXH0nXSxcblx0WydcXFxcYmlnZ2woJywgJ1xcXFxiaWdnciknXSxcblx0WydcXFxcYmlnZ2xbJywgJ1xcXFxiaWdncl0nXSxcblx0WydcXFxcYmlnZ2xcXFxceycsICdcXFxcYmlnZ3JcXFxcfSddLFxuXHRbJ1xcXFxCaWdnbCgnLCAnXFxcXEJpZ2dyKSddLFxuXHRbJ1xcXFxCaWdnbFsnLCAnXFxcXEJpZ2dyXSddLFxuXHRbJ1xcXFxCaWdnbFxcXFx7JywgJ1xcXFxCaWdnclxcXFx9J10sXG5cdFsnXFxcXGxhbmdsZScsICdcXFxccmFuZ2xlJ10sXG5cdFsnXFxcXGx2ZXJ0JywgJ1xcXFxydmVydCddLFxuXHRbJ1xcXFxsVmVydCcsICdcXFxcclZlcnQnXSxcblx0WydcXFxcbGVmdHwnLCAnXFxcXHJpZ2h0fCddLFxuXHRbJ1xcXFxsZWZ0XFxcXHZlcnQnLCAnXFxcXHJpZ2h0XFxcXHZlcnQnXSxcblx0WydcXFxcbGVmdFxcXFx8JywgJ1xcXFxyaWdodFxcXFx8J10sXG5cdFsnXFxcXGxlZnRcXFxcVmVydCcsICdcXFxccmlnaHRcXFxcVmVydCddLFxuXHRbJ1xcXFxsZWZ0XFxcXGxhbmdsZScsICdcXFxccmlnaHRcXFxccmFuZ2xlJ10sXG5cdFsnXFxcXGxlZnRcXFxcbHZlcnQnLCAnXFxcXHJpZ2h0XFxcXHJ2ZXJ0J10sXG5cdFsnXFxcXGxlZnRcXFxcbFZlcnQnLCAnXFxcXHJpZ2h0XFxcXHJWZXJ0J10sXG5cdFsnXFxcXGJpZ2xcXFxcbGFuZ2xlJywgJ1xcXFxiaWdyXFxcXHJhbmdsZSddLFxuXHRbJ1xcXFxiaWdsfCcsICdcXFxcYmlncnwnXSxcblx0WydcXFxcYmlnbFxcXFx2ZXJ0JywgJ1xcXFxiaWdyXFxcXHZlcnQnXSxcblx0WydcXFxcYmlnbFxcXFxsdmVydCcsICdcXFxcYmlnclxcXFxydmVydCddLFxuXHRbJ1xcXFxiaWdsXFxcXHwnLCAnXFxcXGJpZ3JcXFxcfCddLFxuXHRbJ1xcXFxiaWdsXFxcXGxWZXJ0JywgJ1xcXFxiaWdyXFxcXHJWZXJ0J10sXG5cdFsnXFxcXGJpZ2xcXFxcVmVydCcsICdcXFxcYmlnclxcXFxWZXJ0J10sXG5cdFsnXFxcXEJpZ2xcXFxcbGFuZ2xlJywgJ1xcXFxCaWdyXFxcXHJhbmdsZSddLFxuXHRbJ1xcXFxCaWdsfCcsICdcXFxcQmlncnwnXSxcblx0WydcXFxcQmlnbFxcXFxsdmVydCcsICdcXFxcQmlnclxcXFxydmVydCddLFxuXHRbJ1xcXFxCaWdsXFxcXHZlcnQnLCAnXFxcXEJpZ3JcXFxcdmVydCddLFxuXHRbJ1xcXFxCaWdsXFxcXHwnLCAnXFxcXEJpZ3JcXFxcfCddLFxuXHRbJ1xcXFxCaWdsXFxcXGxWZXJ0JywgJ1xcXFxCaWdyXFxcXHJWZXJ0J10sXG5cdFsnXFxcXEJpZ2xcXFxcVmVydCcsICdcXFxcQmlnclxcXFxWZXJ0J10sXG5cdFsnXFxcXGJpZ2dsXFxcXGxhbmdsZScsICdcXFxcYmlnZ3JcXFxccmFuZ2xlJ10sXG5cdFsnXFxcXGJpZ2dsfCcsICdcXFxcYmlnZ3J8J10sXG5cdFsnXFxcXGJpZ2dsXFxcXGx2ZXJ0JywgJ1xcXFxiaWdnclxcXFxydmVydCddLFxuXHRbJ1xcXFxiaWdnbFxcXFx2ZXJ0JywgJ1xcXFxiaWdnclxcXFx2ZXJ0J10sXG5cdFsnXFxcXGJpZ2dsXFxcXHwnLCAnXFxcXGJpZ2dyXFxcXHwnXSxcblx0WydcXFxcYmlnZ2xcXFxcbFZlcnQnLCAnXFxcXGJpZ2dyXFxcXHJWZXJ0J10sXG5cdFsnXFxcXGJpZ2dsXFxcXFZlcnQnLCAnXFxcXGJpZ2dyXFxcXFZlcnQnXSxcblx0WydcXFxcQmlnZ2xcXFxcbGFuZ2xlJywgJ1xcXFxCaWdnclxcXFxyYW5nbGUnXSxcblx0WydcXFxcQmlnZ2x8JywgJ1xcXFxCaWdncnwnXSxcblx0WydcXFxcQmlnZ2xcXFxcbHZlcnQnLCAnXFxcXEJpZ2dyXFxcXHJ2ZXJ0J10sXG5cdFsnXFxcXEJpZ2dsXFxcXHZlcnQnLCAnXFxcXEJpZ2dyXFxcXHZlcnQnXSxcblx0WydcXFxcQmlnZ2xcXFxcfCcsICdcXFxcQmlnZ3JcXFxcfCddLFxuXHRbJ1xcXFxCaWdnbFxcXFxsVmVydCcsICdcXFxcQmlnZ3JcXFxcclZlcnQnXSxcblx0WydcXFxcQmlnZ2xcXFxcVmVydCcsICdcXFxcQmlnZ3JcXFxcVmVydCddXG5dO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxNQUFNLHVCQUF3QztBQUFBLEVBQzdDLENBQUMsS0FBSyxHQUFHO0FBQUEsRUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLEVBQ1QsQ0FBQyxLQUFLLEdBQUc7QUFDVjtBQUVPLE1BQU0sbUJBQW1CO0FBRXpCLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0sbUJBQW9DO0FBQUEsRUFDaEQsQ0FBQyxRQUFRLEtBQUs7QUFBQSxFQUNkLENBQUMsS0FBSyxHQUFHO0FBQUEsRUFDVCxDQUFDLEtBQUssR0FBRztBQUNWO0FBRU8sTUFBTSx5QkFBMEM7QUFBQSxFQUN0RCxDQUFDLE1BQU0sR0FBRztBQUFBLEVBQ1YsQ0FBQyxLQUFLLEdBQUc7QUFBQSxFQUNULENBQUMsS0FBSyxHQUFHO0FBQUEsRUFDVCxDQUFDLEtBQUssR0FBRztBQUNWO0FBRU8sTUFBTSxvQkFBcUM7QUFBQSxFQUNqRCxDQUFDLEtBQUssR0FBRztBQUFBLEVBQ1QsQ0FBQyxLQUFLLEdBQUc7QUFBQSxFQUNULENBQUMsS0FBSyxHQUFHO0FBQUEsRUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLEVBQ1QsQ0FBQyxLQUFLLEdBQUc7QUFBQSxFQUNULENBQUMsV0FBVyxVQUFVO0FBQUEsRUFDdEIsQ0FBQyxXQUFXLFVBQVU7QUFBQSxFQUN0QixDQUFDLFdBQVcsVUFBVTtBQUFBLEVBQ3RCLENBQUMsV0FBVyxVQUFVO0FBQUEs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
