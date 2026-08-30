import assert from "assert";
import { MobileSessionsPart } from "../../browser/parts/mobile/mobileSessionsPart.js";
import { Parts } from "../../../workbench/services/layout/browser/layoutService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
suite("Sessions - Mobile Sessions Part", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("layouts the internal session grid at full phone dimensions", () => {
    let layoutContentsArgs;
    let gridLayoutArgs;
    const part = {
      layoutService: {
        mainContainer: {
          classList: {
            contains: (className) => className === "phone-layout"
          }
        },
        isVisible: (partId) => partId === Parts.SESSIONS_PART
      },
      layoutContents: (width, height) => {
        layoutContentsArgs = [width, height];
        return {
          contentSize: { width: width - 2, height: height - 4 }
        };
      },
      _gridWidget: {
        layout: (width, height, top, left) => {
          gridLayoutArgs = [width, height, top, left];
        }
      }
    };
    MobileSessionsPart.prototype.layout.call(part, 390, 796, 48, 0);
    assert.deepStrictEqual(layoutContentsArgs, [390, 796]);
    assert.deepStrictEqual(gridLayoutArgs, [388, 792, 48, 0]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3NlclxcbW9iaWxlU2Vzc2lvbnNQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBNb2JpbGVTZXNzaW9uc1BhcnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVTZXNzaW9uc1BhcnQuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1Nlc3Npb25zIC0gTW9iaWxlIFNlc3Npb25zIFBhcnQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2xheW91dHMgdGhlIGludGVybmFsIHNlc3Npb24gZ3JpZCBhdCBmdWxsIHBob25lIGRpbWVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0bGV0IGxheW91dENvbnRlbnRzQXJnczogcmVhZG9ubHkgW251bWJlciwgbnVtYmVyXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ3JpZExheW91dEFyZ3M6IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcGFydCA9IHtcblx0XHRcdGxheW91dFNlcnZpY2U6IHtcblx0XHRcdFx0bWFpbkNvbnRhaW5lcjoge1xuXHRcdFx0XHRcdGNsYXNzTGlzdDoge1xuXHRcdFx0XHRcdFx0Y29udGFpbnM6IChjbGFzc05hbWU6IHN0cmluZykgPT4gY2xhc3NOYW1lID09PSAncGhvbmUtbGF5b3V0Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc1Zpc2libGU6IChwYXJ0SWQ6IHN0cmluZykgPT4gcGFydElkID09PSBQYXJ0cy5TRVNTSU9OU19QQVJULFxuXHRcdFx0fSxcblx0XHRcdGxheW91dENvbnRlbnRzOiAod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpID0+IHtcblx0XHRcdFx0bGF5b3V0Q29udGVudHNBcmdzID0gW3dpZHRoLCBoZWlnaHRdO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnRTaXplOiB7IHdpZHRoOiB3aWR0aCAtIDIsIGhlaWdodDogaGVpZ2h0IC0gNCB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdF9ncmlkV2lkZ2V0OiB7XG5cdFx0XHRcdGxheW91dDogKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0Z3JpZExheW91dEFyZ3MgPSBbd2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0XTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdE1vYmlsZVNlc3Npb25zUGFydC5wcm90b3R5cGUubGF5b3V0LmNhbGwocGFydCBhcyB1bmtub3duIGFzIE1vYmlsZVNlc3Npb25zUGFydCwgMzkwLCA3OTYsIDQ4LCAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0Q29udGVudHNBcmdzLCBbMzkwLCA3OTZdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWRMYXlvdXRBcmdzLCBbMzg4LCA3OTIsIDQ4LCAwXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sbUNBQW1DLE1BQU07QUFDOUMsMENBQXdDO0FBRXhDLE9BQUssOERBQThELE1BQU07QUFDeEUsUUFBSTtBQUNKLFFBQUk7QUFFSixVQUFNLE9BQU87QUFBQSxNQUNaLGVBQWU7QUFBQSxRQUNkLGVBQWU7QUFBQSxVQUNkLFdBQVc7QUFBQSxZQUNWLFVBQVUsQ0FBQyxjQUFzQixjQUFjO0FBQUEsVUFDaEQ7QUFBQSxRQUNEO0FBQUEsUUFDQSxXQUFXLENBQUMsV0FBbUIsV0FBVyxNQUFNO0FBQUEsTUFDakQ7QUFBQSxNQUNBLGdCQUFnQixDQUFDLE9BQWUsV0FBbUI7QUFDbEQsNkJBQXFCLENBQUMsT0FBTyxNQUFNO0FBQ25DLGVBQU87QUFBQSxVQUNOLGFBQWEsRUFBRSxPQUFPLFFBQVEsR0FBRyxRQUFRLFNBQVMsRUFBRTtBQUFBLFFBQ3JEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osUUFBUSxDQUFDLE9BQWUsUUFBZ0IsS0FBYSxTQUFpQjtBQUNyRSwyQkFBaUIsQ0FBQyxPQUFPLFFBQVEsS0FBSyxJQUFJO0FBQUEsUUFDM0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixVQUFVLE9BQU8sS0FBSyxNQUF1QyxLQUFLLEtBQUssSUFBSSxDQUFDO0FBRS9GLFdBQU8sZ0JBQWdCLG9CQUFvQixDQUFDLEtBQUssR0FBRyxDQUFDO0FBQ3JELFdBQU8sZ0JBQWdCLGdCQUFnQixDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
