const gitAutoApproveRules = {
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/": false,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b.*\\s--output(=|\\s|$)/": false,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/": true,
  // git grep
  // - `--open-files-in-pager`: This is the configured pager, so no risk of code execution
  // - See notes on `grep` in the terminal auto-approval configuration.
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/": true,
  // git branch
  // - `-d`, `-D`, `--delete`: Prevent branch deletion
  // - `-m`, `-M`: Prevent branch renaming
  // - `--force`: Generally dangerous
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/": false
};
export {
  gitAutoApproveRules
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcYXV0b0FwcHJvdmVcXGdpdEF1dG9BcHByb3ZlUnVsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIERlZmF1bHQgYXV0by1hcHByb3ZhbCBydWxlcyBmb3Igc2FmZSBHaXQgc3ViY29tbWFuZHMuXG4gKlxuICogVGhlc2UgcGF0dGVybnMgc3VwcG9ydCBgLUMgPHBhdGg+YCBhbmQgYC0tbm8tcGFnZXJgIGltbWVkaWF0ZWx5IGFmdGVyIGBnaXRgLlxuICovXG5leHBvcnQgY29uc3QgZ2l0QXV0b0FwcHJvdmVSdWxlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+ID0ge1xuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytzdGF0dXNcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytsb2dcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytsb2dcXFxcYi4qXFxcXHMtLW91dHB1dCg9fFxcXFxzfCQpLyc6IGZhbHNlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytzaG93XFxcXGIvJzogdHJ1ZSxcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrc2hvd1xcXFxiLipcXFxccy0tb3V0cHV0KD18XFxcXHN8JCkvJzogZmFsc2UsXG5cdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2RpZmZcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytscy1maWxlc1xcXFxiLyc6IHRydWUsXG5cblx0Ly8gZ2l0IGdyZXBcblx0Ly8gLSBgLS1vcGVuLWZpbGVzLWluLXBhZ2VyYDogVGhpcyBpcyB0aGUgY29uZmlndXJlZCBwYWdlciwgc28gbm8gcmlzayBvZiBjb2RlIGV4ZWN1dGlvblxuXHQvLyAtIFNlZSBub3RlcyBvbiBgZ3JlcGAgaW4gdGhlIHRlcm1pbmFsIGF1dG8tYXBwcm92YWwgY29uZmlndXJhdGlvbi5cblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrZ3JlcFxcXFxiLyc6IHRydWUsXG5cblx0Ly8gZ2l0IGJyYW5jaFxuXHQvLyAtIGAtZGAsIGAtRGAsIGAtLWRlbGV0ZWA6IFByZXZlbnQgYnJhbmNoIGRlbGV0aW9uXG5cdC8vIC0gYC1tYCwgYC1NYDogUHJldmVudCBicmFuY2ggcmVuYW1pbmdcblx0Ly8gLSBgLS1mb3JjZWA6IEdlbmVyYWxseSBkYW5nZXJvdXNcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrYnJhbmNoXFxcXGIvJzogdHJ1ZSxcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrYnJhbmNoXFxcXGIuKlxcXFxzLShkfER8bXxNfC1kZWxldGV8LWZvcmNlKVxcXFxiLyc6IGZhbHNlLFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQVVPLE1BQU0sc0JBQXlEO0FBQUEsRUFDckUscURBQXFEO0FBQUEsRUFDckQsa0RBQWtEO0FBQUEsRUFDbEQsd0VBQXdFO0FBQUEsRUFDeEUsbURBQW1EO0FBQUEsRUFDbkQseUVBQXlFO0FBQUEsRUFDekUsbURBQW1EO0FBQUEsRUFDbkQsdURBQXVEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLdkQsbURBQW1EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1uRCxxREFBcUQ7QUFBQSxFQUNyRCxzRkFBc0Y7QUFDdkY7IiwKICAibmFtZXMiOiBbXQp9Cg==
