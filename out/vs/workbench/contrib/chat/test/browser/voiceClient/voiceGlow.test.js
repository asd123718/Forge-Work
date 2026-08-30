import assert from "assert";
import { Color, HSLA } from "../../../../../../base/common/color.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ColorScheme } from "../../../../../../platform/theme/common/theme.js";
import { chatDictationActiveMicGlow, chatVoiceGlowBaseColor, chatVoiceSpeakingGlow } from "../../../common/widget/chatColors.js";
import { resolveDictationMicAccent } from "../../../browser/speechToText/dictationMicGlow.js";
import { isGlowingVoiceState, resolveVoiceGlowColors, resolveVoiceRimAccent, shouldRenderVoiceInputGlow, VOICE_GLOW_SPEAKING_HUE_SHIFT } from "../../../browser/voiceClient/voiceGlow.js";
import { createVoiceGlowController, createVoiceRimLight } from "../../../browser/voiceClient/voiceGlowController.js";
suite("VoiceGlow", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("only talking states glow", () => {
    const states = ["idle", "listening", "speaking", "processing", "error"];
    assert.deepStrictEqual(
      states.filter(isGlowingVoiceState),
      ["listening", "speaking"]
    );
  });
  test("only renders while Voice Mode is connected", () => {
    assert.deepStrictEqual([
      shouldRenderVoiceInputGlow(false, true, true, "listening"),
      shouldRenderVoiceInputGlow(true, true, true, "listening"),
      shouldRenderVoiceInputGlow(true, false, true, "speaking"),
      shouldRenderVoiceInputGlow(true, true, false, "speaking"),
      shouldRenderVoiceInputGlow(true, true, true, "idle")
    ], [false, true, false, false, false]);
  });
  test("renders in an auxiliary owner document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    disposables.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const target = auxiliaryDocument.createElement("div");
    auxiliaryDocument.body.appendChild(target);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    const controller = disposables.add(createVoiceGlowController(target));
    controller.render("listening", 0.5, false);
    disposables.add(createVoiceRimLight(target, Color.fromHex("#58A6FF"), "dark"));
    assert.deepStrictEqual({
      active: target.classList.contains("voice-active"),
      listening: target.classList.contains("voice-listening"),
      slots: target.querySelectorAll(".voice-glow-slot").length,
      inlineSlots: target.querySelectorAll(".voice-glow-slot-inline").length,
      layers: target.querySelectorAll(".voice-glow-rim-corners, .voice-glow-rim-bloom").length
    }, {
      active: true,
      listening: true,
      slots: 3,
      inlineSlots: 1,
      layers: 4
    });
  });
  test("derives the speaking accent from the theme base color", () => {
    const base = Color.fromHex("#58A6FF");
    const colors = resolveVoiceGlowColors({ getColor: (id) => id === chatVoiceGlowBaseColor ? base : void 0 });
    assert.deepStrictEqual(
      {
        listening: colors.listening.toString(),
        speakingHue: Math.round(colors.speaking.hsla.h)
      },
      {
        listening: base.toString(),
        speakingHue: Math.round((base.hsla.h + VOICE_GLOW_SPEAKING_HUE_SHIFT + 360) % 360)
      }
    );
  });
  test("an explicitly themed state wins over the derived hue", () => {
    const pinned = Color.fromHex("#FF00AA");
    const colors = resolveVoiceGlowColors({
      getColor: (id) => id === chatVoiceGlowBaseColor ? Color.fromHex("#58A6FF") : id === chatVoiceSpeakingGlow ? pinned : void 0
    });
    assert.strictEqual(colors.speaking.toString(), pinned.toString());
  });
  test("the dictation microphone paints the listening rim color", () => {
    const base = Color.fromHex("#58A6FF");
    const washedOut = Color.fromHex("#7A8B99");
    const theme = (type, accent) => ({
      type,
      getColor: (id) => id === chatVoiceGlowBaseColor || id === chatDictationActiveMicGlow ? accent : void 0
    });
    const resolve = (type, kind, accent) => {
      const scheme = theme(type, accent);
      const format = (color) => {
        const rim = resolveVoiceRimAccent(color, "cool", kind);
        return `${rim.hue.toFixed(1)} ${rim.saturation}% ${rim.lightness}%`;
      };
      return {
        mic: format(resolveDictationMicAccent(scheme)),
        voiceMode: format(resolveVoiceGlowColors(scheme).listening)
      };
    };
    assert.deepStrictEqual(
      {
        dark: resolve(ColorScheme.DARK, "dark", base),
        light: resolve(ColorScheme.LIGHT, "light", base),
        washedOut: resolve(ColorScheme.DARK, "dark", washedOut)
      },
      {
        dark: { mic: "202.0 96% 56%", voiceMode: "202.0 96% 56%" },
        light: { mic: "202.0 41% 52%", voiceMode: "202.0 41% 52%" },
        washedOut: { mic: "197.0 70% 56%", voiceMode: "197.0 70% 56%" }
      }
    );
  });
  test("the active rim keeps non-text contrast against custom input backgrounds", () => {
    const accent = Color.fromHex("#7A8B99");
    for (const [kind, background] of [
      ["light", Color.fromHex("#FAFAFA")],
      ["dark", Color.fromHex("#242424")]
    ]) {
      const rim = resolveVoiceRimAccent(accent, "cool", kind, background);
      const rimColor = new Color(new HSLA(rim.hue, rim.saturation / 100, rim.lightness / 100, 1));
      assert.ok(background.getContrastRatio(rimColor) >= 3, `${kind} rim contrast was ${background.getContrastRatio(rimColor)}`);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZUdsb3cudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvbG9yLCBIU0xBIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNoYXREaWN0YXRpb25BY3RpdmVNaWNHbG93LCBjaGF0Vm9pY2VHbG93QmFzZUNvbG9yLCBjaGF0Vm9pY2VTcGVha2luZ0dsb3cgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd2lkZ2V0L2NoYXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZURpY3RhdGlvbk1pY0FjY2VudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk1pY0dsb3cuanMnO1xuaW1wb3J0IHsgaXNHbG93aW5nVm9pY2VTdGF0ZSwgR2xvd1RoZW1lS2luZCwgcmVzb2x2ZVZvaWNlR2xvd0NvbG9ycywgcmVzb2x2ZVZvaWNlUmltQWNjZW50LCBzaG91bGRSZW5kZXJWb2ljZUlucHV0R2xvdywgVk9JQ0VfR0xPV19TUEVBS0lOR19IVUVfU0hJRlQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvdy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyLCBjcmVhdGVWb2ljZVJpbUxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUdsb3dDb250cm9sbGVyLmpzJztcblxuc3VpdGUoJ1ZvaWNlR2xvdycsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdvbmx5IHRhbGtpbmcgc3RhdGVzIGdsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVzID0gWydpZGxlJywgJ2xpc3RlbmluZycsICdzcGVha2luZycsICdwcm9jZXNzaW5nJywgJ2Vycm9yJ10gYXMgY29uc3Q7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHN0YXRlcy5maWx0ZXIoaXNHbG93aW5nVm9pY2VTdGF0ZSksXG5cdFx0XHRbJ2xpc3RlbmluZycsICdzcGVha2luZyddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnb25seSByZW5kZXJzIHdoaWxlIFZvaWNlIE1vZGUgaXMgY29ubmVjdGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c2hvdWxkUmVuZGVyVm9pY2VJbnB1dEdsb3coZmFsc2UsIHRydWUsIHRydWUsICdsaXN0ZW5pbmcnKSxcblx0XHRcdHNob3VsZFJlbmRlclZvaWNlSW5wdXRHbG93KHRydWUsIHRydWUsIHRydWUsICdsaXN0ZW5pbmcnKSxcblx0XHRcdHNob3VsZFJlbmRlclZvaWNlSW5wdXRHbG93KHRydWUsIGZhbHNlLCB0cnVlLCAnc3BlYWtpbmcnKSxcblx0XHRcdHNob3VsZFJlbmRlclZvaWNlSW5wdXRHbG93KHRydWUsIHRydWUsIGZhbHNlLCAnc3BlYWtpbmcnKSxcblx0XHRcdHNob3VsZFJlbmRlclZvaWNlSW5wdXRHbG93KHRydWUsIHRydWUsIHRydWUsICdpZGxlJyksXG5cdFx0XSwgW2ZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgaW4gYW4gYXV4aWxpYXJ5IG93bmVyIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlmcmFtZS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5RG9jdW1lbnQgPSBpZnJhbWUuY29udGVudERvY3VtZW50ITtcblx0XHRjb25zdCB0YXJnZXQgPSBhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRhdXhpbGlhcnlEb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRhcmdldCk7XG5cdFx0Y29uc3QgY3JlYXRlRWxlbWVudCA9IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQ7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9ICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuJyk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KSk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVZvaWNlR2xvd0NvbnRyb2xsZXIodGFyZ2V0KSk7XG5cdFx0Y29udHJvbGxlci5yZW5kZXIoJ2xpc3RlbmluZycsIDAuNSwgZmFsc2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVWb2ljZVJpbUxpZ2h0KHRhcmdldCwgQ29sb3IuZnJvbUhleCgnIzU4QTZGRicpLCAnZGFyaycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlOiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCd2b2ljZS1hY3RpdmUnKSxcblx0XHRcdGxpc3RlbmluZzogdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygndm9pY2UtbGlzdGVuaW5nJyksXG5cdFx0XHRzbG90czogdGFyZ2V0LnF1ZXJ5U2VsZWN0b3JBbGwoJy52b2ljZS1nbG93LXNsb3QnKS5sZW5ndGgsXG5cdFx0XHRpbmxpbmVTbG90czogdGFyZ2V0LnF1ZXJ5U2VsZWN0b3JBbGwoJy52b2ljZS1nbG93LXNsb3QtaW5saW5lJykubGVuZ3RoLFxuXHRcdFx0bGF5ZXJzOiB0YXJnZXQucXVlcnlTZWxlY3RvckFsbCgnLnZvaWNlLWdsb3ctcmltLWNvcm5lcnMsIC52b2ljZS1nbG93LXJpbS1ibG9vbScpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRhY3RpdmU6IHRydWUsXG5cdFx0XHRsaXN0ZW5pbmc6IHRydWUsXG5cdFx0XHRzbG90czogMyxcblx0XHRcdGlubGluZVNsb3RzOiAxLFxuXHRcdFx0bGF5ZXJzOiA0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVzIHRoZSBzcGVha2luZyBhY2NlbnQgZnJvbSB0aGUgdGhlbWUgYmFzZSBjb2xvcicsICgpID0+IHtcblx0XHRjb25zdCBiYXNlID0gQ29sb3IuZnJvbUhleCgnIzU4QTZGRicpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IHJlc29sdmVWb2ljZUdsb3dDb2xvcnMoeyBnZXRDb2xvcjogaWQgPT4gaWQgPT09IGNoYXRWb2ljZUdsb3dCYXNlQ29sb3IgPyBiYXNlIDogdW5kZWZpbmVkIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RlbmluZzogY29sb3JzLmxpc3RlbmluZy50b1N0cmluZygpLFxuXHRcdFx0XHRzcGVha2luZ0h1ZTogTWF0aC5yb3VuZChjb2xvcnMuc3BlYWtpbmcuaHNsYS5oKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RlbmluZzogYmFzZS50b1N0cmluZygpLFxuXHRcdFx0XHRzcGVha2luZ0h1ZTogTWF0aC5yb3VuZCgoYmFzZS5oc2xhLmggKyBWT0lDRV9HTE9XX1NQRUFLSU5HX0hVRV9TSElGVCArIDM2MCkgJSAzNjApLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGV4cGxpY2l0bHkgdGhlbWVkIHN0YXRlIHdpbnMgb3ZlciB0aGUgZGVyaXZlZCBodWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGlubmVkID0gQ29sb3IuZnJvbUhleCgnI0ZGMDBBQScpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IHJlc29sdmVWb2ljZUdsb3dDb2xvcnMoe1xuXHRcdFx0Z2V0Q29sb3I6IGlkID0+IGlkID09PSBjaGF0Vm9pY2VHbG93QmFzZUNvbG9yID8gQ29sb3IuZnJvbUhleCgnIzU4QTZGRicpIDogaWQgPT09IGNoYXRWb2ljZVNwZWFraW5nR2xvdyA/IHBpbm5lZCA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLnNwZWFraW5nLnRvU3RyaW5nKCksIHBpbm5lZC50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgndGhlIGRpY3RhdGlvbiBtaWNyb3Bob25lIHBhaW50cyB0aGUgbGlzdGVuaW5nIHJpbSBjb2xvcicsICgpID0+IHtcblx0XHQvLyBUd28gdGhpbmdzIG11c3QgaG9sZDogdGhlIHR1bmluZyBpdHNlbGYgKGh1ZSBudWRnZSwgc2F0dXJhdGlvbiBmbG9vcixcblx0XHQvLyBwZXItdGhlbWUgbGlnaHRuZXNzKSBhbmQgdGhlIGZhY3QgdGhhdCBkaWN0YXRpb24gYW5kIFZvaWNlIE1vZGUgYXJyaXZlXG5cdFx0Ly8gYXQgaXQgZnJvbSB0aGVpciBvd24gdG9rZW5zLiBTbmFwc2hvdHRpbmcgdGhlIHJlc29sdmVkIHZhbHVlcyBwaW5zIHRoZVxuXHRcdC8vIGZvcm1lciBcdTIwMTQgY29tcGFyaW5nIHRoZSB0d28gcGF0aHMgYWxvbmUgd291bGQgY2FuY2VsIGl0IG91dC5cblx0XHRjb25zdCBiYXNlID0gQ29sb3IuZnJvbUhleCgnIzU4QTZGRicpO1xuXHRcdC8vIERlbGliZXJhdGVseSB1bmRlciB0aGUgc2F0dXJhdGlvbiBmbG9vciwgc28gdGhlIGNsYW1wIGlzIGV4ZXJjaXNlZC5cblx0XHRjb25zdCB3YXNoZWRPdXQgPSBDb2xvci5mcm9tSGV4KCcjN0E4Qjk5Jyk7XG5cdFx0Y29uc3QgdGhlbWUgPSAodHlwZTogQ29sb3JTY2hlbWUsIGFjY2VudDogQ29sb3IpID0+ICh7XG5cdFx0XHR0eXBlLFxuXHRcdFx0Z2V0Q29sb3I6IChpZDogc3RyaW5nKSA9PiBpZCA9PT0gY2hhdFZvaWNlR2xvd0Jhc2VDb2xvciB8fCBpZCA9PT0gY2hhdERpY3RhdGlvbkFjdGl2ZU1pY0dsb3cgPyBhY2NlbnQgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZSA9ICh0eXBlOiBDb2xvclNjaGVtZSwga2luZDogR2xvd1RoZW1lS2luZCwgYWNjZW50OiBDb2xvcikgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1lID0gdGhlbWUodHlwZSwgYWNjZW50KTtcblx0XHRcdGNvbnN0IGZvcm1hdCA9IChjb2xvcjogQ29sb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgcmltID0gcmVzb2x2ZVZvaWNlUmltQWNjZW50KGNvbG9yLCAnY29vbCcsIGtpbmQpO1xuXHRcdFx0XHRyZXR1cm4gYCR7cmltLmh1ZS50b0ZpeGVkKDEpfSAke3JpbS5zYXR1cmF0aW9ufSUgJHtyaW0ubGlnaHRuZXNzfSVgO1xuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1pYzogZm9ybWF0KHJlc29sdmVEaWN0YXRpb25NaWNBY2NlbnQoc2NoZW1lIGFzIElDb2xvclRoZW1lKSEpLFxuXHRcdFx0XHR2b2ljZU1vZGU6IGZvcm1hdChyZXNvbHZlVm9pY2VHbG93Q29sb3JzKHNjaGVtZSkubGlzdGVuaW5nKSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGRhcms6IHJlc29sdmUoQ29sb3JTY2hlbWUuREFSSywgJ2RhcmsnLCBiYXNlKSxcblx0XHRcdFx0bGlnaHQ6IHJlc29sdmUoQ29sb3JTY2hlbWUuTElHSFQsICdsaWdodCcsIGJhc2UpLFxuXHRcdFx0XHR3YXNoZWRPdXQ6IHJlc29sdmUoQ29sb3JTY2hlbWUuREFSSywgJ2RhcmsnLCB3YXNoZWRPdXQpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGFyazogeyBtaWM6ICcyMDIuMCA5NiUgNTYlJywgdm9pY2VNb2RlOiAnMjAyLjAgOTYlIDU2JScgfSxcblx0XHRcdFx0bGlnaHQ6IHsgbWljOiAnMjAyLjAgNDElIDUyJScsIHZvaWNlTW9kZTogJzIwMi4wIDQxJSA1MiUnIH0sXG5cdFx0XHRcdHdhc2hlZE91dDogeyBtaWM6ICcxOTcuMCA3MCUgNTYlJywgdm9pY2VNb2RlOiAnMTk3LjAgNzAlIDU2JScgfSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgYWN0aXZlIHJpbSBrZWVwcyBub24tdGV4dCBjb250cmFzdCBhZ2FpbnN0IGN1c3RvbSBpbnB1dCBiYWNrZ3JvdW5kcycsICgpID0+IHtcblx0XHRjb25zdCBhY2NlbnQgPSBDb2xvci5mcm9tSGV4KCcjN0E4Qjk5Jyk7XG5cdFx0Zm9yIChjb25zdCBba2luZCwgYmFja2dyb3VuZF0gb2YgW1xuXHRcdFx0WydsaWdodCcsIENvbG9yLmZyb21IZXgoJyNGQUZBRkEnKV0sXG5cdFx0XHRbJ2RhcmsnLCBDb2xvci5mcm9tSGV4KCcjMjQyNDI0JyldLFxuXHRcdF0gYXMgY29uc3QpIHtcblx0XHRcdGNvbnN0IHJpbSA9IHJlc29sdmVWb2ljZVJpbUFjY2VudChhY2NlbnQsICdjb29sJywga2luZCwgYmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCByaW1Db2xvciA9IG5ldyBDb2xvcihuZXcgSFNMQShyaW0uaHVlLCByaW0uc2F0dXJhdGlvbiAvIDEwMCwgcmltLmxpZ2h0bmVzcyAvIDEwMCwgMSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmQuZ2V0Q29udHJhc3RSYXRpbyhyaW1Db2xvcikgPj0gMywgYCR7a2luZH0gcmltIGNvbnRyYXN0IHdhcyAke2JhY2tncm91bmQuZ2V0Q29udHJhc3RSYXRpbyhyaW1Db2xvcil9YCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsT0FBTyxZQUFZO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsNEJBQTRCLHdCQUF3Qiw2QkFBNkI7QUFDMUYs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
