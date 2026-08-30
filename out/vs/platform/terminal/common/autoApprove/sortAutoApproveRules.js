const sortAutoApproveRules = {
  "/^sort\\b(?!-)/": true,
  // - `-o`: Writes output to a file.
  // - `-S`: Can request enough memory to cause denial of service.
  "/^sort\\b.*\\s-(o|S)\\b/": false,
  // GNU sort accepts unique long-option abbreviations. `--co` is the shortest unique
  // abbreviation for `--compress-program`; deny it and every longer spelling. Ignore
  // shell quote and escape syntax within the prefix since the shell removes it.
  "/^sort\\b.*\\s(?:\\$?['\"]|\\\\)*-(?:\\$?['\"]|\\\\)*-(?:\\$?['\"]|\\\\)*c(?:\\$?['\"]|\\\\)*o/": false
};
export {
  sortAutoApproveRules
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcYXV0b0FwcHJvdmVcXHNvcnRBdXRvQXBwcm92ZVJ1bGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBEZWZhdWx0IGF1dG8tYXBwcm92YWwgcnVsZXMgZm9yIGBzb3J0YC5cbiAqL1xuZXhwb3J0IGNvbnN0IHNvcnRBdXRvQXBwcm92ZVJ1bGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4gPSB7XG5cdCcvXnNvcnRcXFxcYig/IS0pLyc6IHRydWUsXG5cblx0Ly8gLSBgLW9gOiBXcml0ZXMgb3V0cHV0IHRvIGEgZmlsZS5cblx0Ly8gLSBgLVNgOiBDYW4gcmVxdWVzdCBlbm91Z2ggbWVtb3J5IHRvIGNhdXNlIGRlbmlhbCBvZiBzZXJ2aWNlLlxuXHQnL15zb3J0XFxcXGIuKlxcXFxzLShvfFMpXFxcXGIvJzogZmFsc2UsXG5cblx0Ly8gR05VIHNvcnQgYWNjZXB0cyB1bmlxdWUgbG9uZy1vcHRpb24gYWJicmV2aWF0aW9ucy4gYC0tY29gIGlzIHRoZSBzaG9ydGVzdCB1bmlxdWVcblx0Ly8gYWJicmV2aWF0aW9uIGZvciBgLS1jb21wcmVzcy1wcm9ncmFtYDsgZGVueSBpdCBhbmQgZXZlcnkgbG9uZ2VyIHNwZWxsaW5nLiBJZ25vcmVcblx0Ly8gc2hlbGwgcXVvdGUgYW5kIGVzY2FwZSBzeW50YXggd2l0aGluIHRoZSBwcmVmaXggc2luY2UgdGhlIHNoZWxsIHJlbW92ZXMgaXQuXG5cdCcvXnNvcnRcXFxcYi4qXFxcXHMoPzpcXFxcJD9bXFwnXCJdfFxcXFxcXFxcKSotKD86XFxcXCQ/W1xcJ1wiXXxcXFxcXFxcXCkqLSg/OlxcXFwkP1tcXCdcIl18XFxcXFxcXFwpKmMoPzpcXFxcJD9bXFwnXCJdfFxcXFxcXFxcKSpvLyc6IGZhbHNlLFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQVFPLE1BQU0sdUJBQTBEO0FBQUEsRUFDdEUsbUJBQW1CO0FBQUE7QUFBQTtBQUFBLEVBSW5CLDRCQUE0QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSzVCLG1HQUFtRztBQUNwRzsiLAogICJuYW1lcyI6IFtdCn0K
