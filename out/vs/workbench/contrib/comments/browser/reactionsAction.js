import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { Action } from "../../../../base/common/actions.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
const _ToggleReactionsAction = class _ToggleReactionsAction extends Action {
  constructor(toggleDropdownMenu, title) {
    super(_ToggleReactionsAction.ID, title || nls.localize("pickReactions", "Pick Reactions..."), "toggle-reactions", true);
    this._menuActions = [];
    this.toggleDropdownMenu = toggleDropdownMenu;
  }
  run() {
    this.toggleDropdownMenu();
    return Promise.resolve(true);
  }
  get menuActions() {
    return this._menuActions;
  }
  set menuActions(actions) {
    this._menuActions = actions;
  }
};
_ToggleReactionsAction.ID = "toolbar.toggle.pickReactions";
let ToggleReactionsAction = _ToggleReactionsAction;
class ReactionActionViewItem extends ActionViewItem {
  constructor(action) {
    super(null, action, {});
  }
  updateLabel() {
    if (!this.label) {
      return;
    }
    const action = this.action;
    if (action.class) {
      this.label.classList.add(action.class);
    }
    if (!action.icon) {
      const reactionLabel = dom.append(this.label, dom.$("span.reaction-label"));
      reactionLabel.innerText = action.label;
    } else {
      const reactionIcon = dom.append(this.label, dom.$(".reaction-icon"));
      const uri = URI.revive(action.icon);
      reactionIcon.style.backgroundImage = cssJs.asCSSUrl(uri);
    }
    if (action.count) {
      const reactionCount = dom.append(this.label, dom.$("span.reaction-count"));
      reactionCount.innerText = `${action.count}`;
    }
  }
  getTooltip() {
    const action = this.action;
    const toggleMessage = action.enabled ? nls.localize("comment.toggleableReaction", "Toggle reaction, ") : "";
    if (action.count === void 0) {
      return nls.localize({
        key: "comment.reactionLabelNone",
        comment: [
          "This is a tooltip for an emoji button so that the current user can toggle their reaction to a comment.",
          `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is the name of the reaction.`
        ]
      }, "{0}{1} reaction", toggleMessage, action.label);
    } else if (action.reactors === void 0 || action.reactors.length === 0) {
      if (action.count === 1) {
        return nls.localize({
          key: "comment.reactionLabelOne",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is 1.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is the name of the reaction.`
          ]
        }, "{0}1 reaction with {1}", toggleMessage, action.label);
      } else if (action.count > 1) {
        return nls.localize({
          key: "comment.reactionLabelMany",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is greater than 1.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is number of users who have reacted with that reaction, and the third is the name of the reaction.`
          ]
        }, "{0}{1} reactions with {2}", toggleMessage, action.count, action.label);
      }
    } else {
      if (action.reactors.length <= 10 && action.reactors.length === action.count) {
        return nls.localize({
          key: "comment.reactionLessThanTen",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.`
          ]
        }, "{0}{1} reacted with {2}", toggleMessage, action.reactors.join(", "), action.label);
      } else if (action.count > 1) {
        const displayedReactors = action.reactors.slice(0, 10);
        return nls.localize({
          key: "comment.reactionMoreThanTen",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.`
          ]
        }, "{0}{1} and {2} more reacted with {3}", toggleMessage, displayedReactors.join(", "), action.count - displayedReactors.length, action.label);
      }
    }
    return void 0;
  }
}
const _ReactionAction = class _ReactionAction extends Action {
  constructor(id, label = "", cssClass = "", enabled = true, actionCallback, reactors, icon, count) {
    super(_ReactionAction.ID, label, cssClass, enabled, actionCallback);
    this.reactors = reactors;
    this.icon = icon;
    this.count = count;
  }
};
_ReactionAction.ID = "toolbar.toggle.reaction";
let ReactionAction = _ReactionAction;
export {
  ReactionAction,
  ReactionActionViewItem,
  ToggleReactionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxyZWFjdGlvbnNBY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGNzc0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVJlYWN0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd0b29sYmFyLnRvZ2dsZS5waWNrUmVhY3Rpb25zJztcblx0cHJpdmF0ZSBfbWVudUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIHRvZ2dsZURyb3Bkb3duTWVudTogKCkgPT4gdm9pZDtcblx0Y29uc3RydWN0b3IodG9nZ2xlRHJvcGRvd25NZW51OiAoKSA9PiB2b2lkLCB0aXRsZT86IHN0cmluZykge1xuXHRcdHN1cGVyKFRvZ2dsZVJlYWN0aW9uc0FjdGlvbi5JRCwgdGl0bGUgfHwgbmxzLmxvY2FsaXplKCdwaWNrUmVhY3Rpb25zJywgXCJQaWNrIFJlYWN0aW9ucy4uLlwiKSwgJ3RvZ2dsZS1yZWFjdGlvbnMnLCB0cnVlKTtcblx0XHR0aGlzLnRvZ2dsZURyb3Bkb3duTWVudSA9IHRvZ2dsZURyb3Bkb3duTWVudTtcblx0fVxuXHRvdmVycmlkZSBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aGlzLnRvZ2dsZURyb3Bkb3duTWVudSgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdH1cblx0Z2V0IG1lbnVBY3Rpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLl9tZW51QWN0aW9ucztcblx0fVxuXHRzZXQgbWVudUFjdGlvbnMoYWN0aW9uczogSUFjdGlvbltdKSB7XG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSBhY3Rpb25zO1xuXHR9XG59XG5leHBvcnQgY2xhc3MgUmVhY3Rpb25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoYWN0aW9uOiBSZWFjdGlvbkFjdGlvbikge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwge30pO1xuXHR9XG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbiBhcyBSZWFjdGlvbkFjdGlvbjtcblx0XHRpZiAoYWN0aW9uLmNsYXNzKSB7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoYWN0aW9uLmNsYXNzKTtcblx0XHR9XG5cdFx0aWYgKCFhY3Rpb24uaWNvbikge1xuXHRcdFx0Y29uc3QgcmVhY3Rpb25MYWJlbCA9IGRvbS5hcHBlbmQodGhpcy5sYWJlbCwgZG9tLiQoJ3NwYW4ucmVhY3Rpb24tbGFiZWwnKSk7XG5cdFx0XHRyZWFjdGlvbkxhYmVsLmlubmVyVGV4dCA9IGFjdGlvbi5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVhY3Rpb25JY29uID0gZG9tLmFwcGVuZCh0aGlzLmxhYmVsLCBkb20uJCgnLnJlYWN0aW9uLWljb24nKSk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKGFjdGlvbi5pY29uKTtcblx0XHRcdHJlYWN0aW9uSWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBjc3NKcy5hc0NTU1VybCh1cmkpO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9uLmNvdW50KSB7XG5cdFx0XHRjb25zdCByZWFjdGlvbkNvdW50ID0gZG9tLmFwcGVuZCh0aGlzLmxhYmVsLCBkb20uJCgnc3Bhbi5yZWFjdGlvbi1jb3VudCcpKTtcblx0XHRcdHJlYWN0aW9uQ291bnQuaW5uZXJUZXh0ID0gYCR7YWN0aW9uLmNvdW50fWA7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbiBhcyBSZWFjdGlvbkFjdGlvbjtcblx0XHRjb25zdCB0b2dnbGVNZXNzYWdlID0gYWN0aW9uLmVuYWJsZWQgPyBubHMubG9jYWxpemUoJ2NvbW1lbnQudG9nZ2xlYWJsZVJlYWN0aW9uJywgXCJUb2dnbGUgcmVhY3Rpb24sIFwiKSA6ICcnO1xuXG5cdFx0aWYgKGFjdGlvbi5jb3VudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnY29tbWVudC5yZWFjdGlvbkxhYmVsTm9uZScsIGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnVGhpcyBpcyBhIHRvb2x0aXAgZm9yIGFuIGVtb2ppIGJ1dHRvbiBzbyB0aGF0IHRoZSBjdXJyZW50IHVzZXIgY2FuIHRvZ2dsZSB0aGVpciByZWFjdGlvbiB0byBhIGNvbW1lbnQuJyxcblx0XHRcdFx0XHQnVGhlIGZpcnN0IGFyZyBpcyBsb2NhbGl6ZWQgbWVzc2FnZSBcIlRvZ2dsZSByZWFjdGlvblwiIG9yIGVtcHR5IGlmIHRoZSB1c2VyIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gdG9nZ2xlIHRoZSByZWFjdGlvbiwgdGhlIHNlY29uZCBpcyB0aGUgbmFtZSBvZiB0aGUgcmVhY3Rpb24uJ11cblx0XHRcdH0sIFwiezB9ezF9IHJlYWN0aW9uXCIsIHRvZ2dsZU1lc3NhZ2UsIGFjdGlvbi5sYWJlbCk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24ucmVhY3RvcnMgPT09IHVuZGVmaW5lZCB8fCBhY3Rpb24ucmVhY3RvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAoYWN0aW9uLmNvdW50ID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2NvbW1lbnQucmVhY3Rpb25MYWJlbE9uZScsIGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCdUaGlzIGlzIGEgdG9vbHRpcCBmb3IgYW4gZW1vamkgdGhhdCBpcyBhIFwicmVhY3Rpb25cIiB0byBhIGNvbW1lbnQgd2hlcmUgdGhlIGNvdW50IG9mIHRoZSByZWFjdGlvbnMgaXMgMS4nLFxuXHRcdFx0XHRcdFx0J1RoZSBlbW9qaSBpcyBhbHNvIGEgYnV0dG9uIHNvIHRoYXQgdGhlIGN1cnJlbnQgdXNlciBjYW4gYWxzbyB0b2dnbGUgdGhlaXIgb3duIGVtb2ppIHJlYWN0aW9uLicsXG5cdFx0XHRcdFx0XHQnVGhlIGZpcnN0IGFyZyBpcyBsb2NhbGl6ZWQgbWVzc2FnZSBcIlRvZ2dsZSByZWFjdGlvblwiIG9yIGVtcHR5IGlmIHRoZSB1c2VyIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gdG9nZ2xlIHRoZSByZWFjdGlvbiwgdGhlIHNlY29uZCBpcyB0aGUgbmFtZSBvZiB0aGUgcmVhY3Rpb24uJ11cblx0XHRcdFx0fSwgXCJ7MH0xIHJlYWN0aW9uIHdpdGggezF9XCIsIHRvZ2dsZU1lc3NhZ2UsIGFjdGlvbi5sYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5jb3VudCA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnY29tbWVudC5yZWFjdGlvbkxhYmVsTWFueScsIGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCdUaGlzIGlzIGEgdG9vbHRpcCBmb3IgYW4gZW1vamkgdGhhdCBpcyBhIFwicmVhY3Rpb25cIiB0byBhIGNvbW1lbnQgd2hlcmUgdGhlIGNvdW50IG9mIHRoZSByZWFjdGlvbnMgaXMgZ3JlYXRlciB0aGFuIDEuJyxcblx0XHRcdFx0XHRcdCdUaGUgZW1vamkgaXMgYWxzbyBhIGJ1dHRvbiBzbyB0aGF0IHRoZSBjdXJyZW50IHVzZXIgY2FuIGFsc28gdG9nZ2xlIHRoZWlyIG93biBlbW9qaSByZWFjdGlvbi4nLFxuXHRcdFx0XHRcdFx0J1RoZSBmaXJzdCBhcmcgaXMgbG9jYWxpemVkIG1lc3NhZ2UgXCJUb2dnbGUgcmVhY3Rpb25cIiBvciBlbXB0eSBpZiB0aGUgdXNlciBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHRvZ2dsZSB0aGUgcmVhY3Rpb24sIHRoZSBzZWNvbmQgaXMgbnVtYmVyIG9mIHVzZXJzIHdobyBoYXZlIHJlYWN0ZWQgd2l0aCB0aGF0IHJlYWN0aW9uLCBhbmQgdGhlIHRoaXJkIGlzIHRoZSBuYW1lIG9mIHRoZSByZWFjdGlvbi4nXVxuXHRcdFx0XHR9LCBcInswfXsxfSByZWFjdGlvbnMgd2l0aCB7Mn1cIiwgdG9nZ2xlTWVzc2FnZSwgYWN0aW9uLmNvdW50LCBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoYWN0aW9uLnJlYWN0b3JzLmxlbmd0aCA8PSAxMCAmJiBhY3Rpb24ucmVhY3RvcnMubGVuZ3RoID09PSBhY3Rpb24uY291bnQpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnY29tbWVudC5yZWFjdGlvbkxlc3NUaGFuVGVuJywgY29tbWVudDogW1xuXHRcdFx0XHRcdFx0J1RoaXMgaXMgYSB0b29sdGlwIGZvciBhbiBlbW9qaSB0aGF0IGlzIGEgXCJyZWFjdGlvblwiIHRvIGEgY29tbWVudCB3aGVyZSB0aGUgY291bnQgb2YgdGhlIHJlYWN0aW9ucyBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gMTAuJyxcblx0XHRcdFx0XHRcdCdUaGUgZW1vamkgaXMgYWxzbyBhIGJ1dHRvbiBzbyB0aGF0IHRoZSBjdXJyZW50IHVzZXIgY2FuIGFsc28gdG9nZ2xlIHRoZWlyIG93biBlbW9qaSByZWFjdGlvbi4nLFxuXHRcdFx0XHRcdFx0J1RoZSBmaXJzdCBhcmcgaXMgbG9jYWxpemVkIG1lc3NhZ2UgXCJUb2dnbGUgcmVhY3Rpb25cIiBvciBlbXB0eSBpZiB0aGUgdXNlciBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHRvZ2dsZSB0aGUgcmVhY3Rpb24sIHRoZSBzZWNvbmQgaWlzIGEgbGlzdCBvZiB0aGUgcmVhY3RvcnMsIGFuZCB0aGUgdGhpcmQgaXMgdGhlIG5hbWUgb2YgdGhlIHJlYWN0aW9uLiddXG5cdFx0XHRcdH0sIFwiezB9ezF9IHJlYWN0ZWQgd2l0aCB7Mn1cIiwgdG9nZ2xlTWVzc2FnZSwgYWN0aW9uLnJlYWN0b3JzLmpvaW4oJywgJyksIGFjdGlvbi5sYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5jb3VudCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgZGlzcGxheWVkUmVhY3RvcnMgPSBhY3Rpb24ucmVhY3RvcnMuc2xpY2UoMCwgMTApO1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdjb21tZW50LnJlYWN0aW9uTW9yZVRoYW5UZW4nLCBjb21tZW50OiBbXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBhIHRvb2x0aXAgZm9yIGFuIGVtb2ppIHRoYXQgaXMgYSBcInJlYWN0aW9uXCIgdG8gYSBjb21tZW50IHdoZXJlIHRoZSBjb3VudCBvZiB0aGUgcmVhY3Rpb25zIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byAxMC4nLFxuXHRcdFx0XHRcdFx0J1RoZSBlbW9qaSBpcyBhbHNvIGEgYnV0dG9uIHNvIHRoYXQgdGhlIGN1cnJlbnQgdXNlciBjYW4gYWxzbyB0b2dnbGUgdGhlaXIgb3duIGVtb2ppIHJlYWN0aW9uLicsXG5cdFx0XHRcdFx0XHQnVGhlIGZpcnN0IGFyZyBpcyBsb2NhbGl6ZWQgbWVzc2FnZSBcIlRvZ2dsZSByZWFjdGlvblwiIG9yIGVtcHR5IGlmIHRoZSB1c2VyIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gdG9nZ2xlIHRoZSByZWFjdGlvbiwgdGhlIHNlY29uZCBpaXMgYSBsaXN0IG9mIHRoZSByZWFjdG9ycywgYW5kIHRoZSB0aGlyZCBpcyB0aGUgbmFtZSBvZiB0aGUgcmVhY3Rpb24uJ11cblx0XHRcdFx0fSwgXCJ7MH17MX0gYW5kIHsyfSBtb3JlIHJlYWN0ZWQgd2l0aCB7M31cIiwgdG9nZ2xlTWVzc2FnZSwgZGlzcGxheWVkUmVhY3RvcnMuam9pbignLCAnKSwgYWN0aW9uLmNvdW50IC0gZGlzcGxheWVkUmVhY3RvcnMubGVuZ3RoLCBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5leHBvcnQgY2xhc3MgUmVhY3Rpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndG9vbGJhci50b2dnbGUucmVhY3Rpb24nO1xuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nID0gJycsIGNzc0NsYXNzOiBzdHJpbmcgPSAnJywgZW5hYmxlZDogYm9vbGVhbiA9IHRydWUsIGFjdGlvbkNhbGxiYWNrPzogKGV2ZW50PzogYW55KSA9PiBQcm9taXNlPGFueT4sIHB1YmxpYyByZWFkb25seSByZWFjdG9ycz86IHJlYWRvbmx5IHN0cmluZ1tdLCBwdWJsaWMgaWNvbj86IFVyaUNvbXBvbmVudHMsIHB1YmxpYyBjb3VudD86IG51bWJlcikge1xuXHRcdHN1cGVyKFJlYWN0aW9uQWN0aW9uLklELCBsYWJlbCwgY3NzQ2xhc3MsIGVuYWJsZWQsIGFjdGlvbkNhbGxiYWNrKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxjQUF1QjtBQUNoQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBRXhCLE1BQU0seUJBQU4sTUFBTSwrQkFBOEIsT0FBTztBQUFBLEVBSWpELFlBQVksb0JBQWdDLE9BQWdCO0FBQzNELFVBQU0sdUJBQXNCLElBQUksU0FBUyxJQUFJLFNBQVMsaUJBQWlCLG1CQUFtQixHQUFHLG9CQUFvQixJQUFJO0FBSHRILFNBQVEsZUFBMEIsQ0FBQztBQUlsQyxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFDUyxNQUFvQjtBQUM1QixTQUFLLG1CQUFtQjtBQUN4QixXQUFPLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDNUI7QUFBQSxFQUNBLElBQUksY0FBYztBQUNqQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQSxJQUFJLFlBQVksU0FBb0I7QUFDbkMsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFDRDtBQWxCYSx1QkFDSSxLQUFLO0FBRGYsSUFBTSx3QkFBTjtBQW1CQSxNQUFNLCtCQUEr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
