import { CharCode } from "./charCode.js";
function roundFloat(number, decimalPoints) {
  const decimal = Math.pow(10, decimalPoints);
  return Math.round(number * decimal) / decimal;
}
class RGBA {
  constructor(r, g, b, a = 1) {
    this._rgbaBrand = void 0;
    this.r = Math.min(255, Math.max(0, r)) | 0;
    this.g = Math.min(255, Math.max(0, g)) | 0;
    this.b = Math.min(255, Math.max(0, b)) | 0;
    this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
  }
  static equals(a, b) {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  }
}
class HSLA {
  constructor(h, s, l, a) {
    this._hslaBrand = void 0;
    this.h = Math.max(Math.min(360, h), 0) | 0;
    this.s = roundFloat(Math.max(Math.min(1, s), 0), 3);
    this.l = roundFloat(Math.max(Math.min(1, l), 0), 3);
    this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
  }
  static equals(a, b) {
    return a.h === b.h && a.s === b.s && a.l === b.l && a.a === b.a;
  }
  /**
   * Converts an RGB color value to HSL. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes r, g, and b are contained in the set [0, 255] and
   * returns h in the set [0, 360], s, and l in the set [0, 1].
   */
  static fromRGBA(rgba) {
    const r = rgba.r / 255;
    const g = rgba.g / 255;
    const b = rgba.b / 255;
    const a = rgba.a;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (min + max) / 2;
    const chroma = max - min;
    if (chroma > 0) {
      s = Math.min(l <= 0.5 ? chroma / (2 * l) : chroma / (2 - 2 * l), 1);
      switch (max) {
        case r:
          h = (g - b) / chroma + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / chroma + 2;
          break;
        case b:
          h = (r - g) / chroma + 4;
          break;
      }
      h *= 60;
      h = Math.round(h);
    }
    return new HSLA(h, s, l, a);
  }
  static _hue2rgb(p, q, t) {
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  }
  /**
   * Converts an HSL color value to RGB. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes h in the set [0, 360] s, and l are contained in the set [0, 1] and
   * returns r, g, and b in the set [0, 255].
   */
  static toRGBA(hsla) {
    const h = hsla.h / 360;
    const { s, l, a } = hsla;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = HSLA._hue2rgb(p, q, h + 1 / 3);
      g = HSLA._hue2rgb(p, q, h);
      b = HSLA._hue2rgb(p, q, h - 1 / 3);
    }
    return new RGBA(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a);
  }
}
class HSVA {
  constructor(h, s, v, a) {
    this._hsvaBrand = void 0;
    this.h = Math.max(Math.min(360, h), 0) | 0;
    this.s = roundFloat(Math.max(Math.min(1, s), 0), 3);
    this.v = roundFloat(Math.max(Math.min(1, v), 0), 3);
    this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
  }
  static equals(a, b) {
    return a.h === b.h && a.s === b.s && a.v === b.v && a.a === b.a;
  }
  // from http://www.rapidtables.com/convert/color/rgb-to-hsv.htm
  static fromRGBA(rgba) {
    const r = rgba.r / 255;
    const g = rgba.g / 255;
    const b = rgba.b / 255;
    const cmax = Math.max(r, g, b);
    const cmin = Math.min(r, g, b);
    const delta = cmax - cmin;
    const s = cmax === 0 ? 0 : delta / cmax;
    let m;
    if (delta === 0) {
      m = 0;
    } else if (cmax === r) {
      m = ((g - b) / delta % 6 + 6) % 6;
    } else if (cmax === g) {
      m = (b - r) / delta + 2;
    } else {
      m = (r - g) / delta + 4;
    }
    return new HSVA(Math.round(m * 60), s, cmax, rgba.a);
  }
  // from http://www.rapidtables.com/convert/color/hsv-to-rgb.htm
  static toRGBA(hsva) {
    const { h, s, v, a } = hsva;
    const c = v * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = v - c;
    let [r, g, b] = [0, 0, 0];
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else if (h <= 360) {
      r = c;
      b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return new RGBA(r, g, b, a);
  }
}
const _Color = class _Color {
  static fromHex(hex) {
    return _Color.Format.CSS.parseHex(hex) || _Color.red;
  }
  static equals(a, b) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.equals(b);
  }
  get hsla() {
    if (this._hsla) {
      return this._hsla;
    } else {
      return HSLA.fromRGBA(this.rgba);
    }
  }
  get hsva() {
    if (this._hsva) {
      return this._hsva;
    }
    return HSVA.fromRGBA(this.rgba);
  }
  constructor(arg) {
    if (!arg) {
      throw new Error("Color needs a value");
    } else if (arg instanceof RGBA) {
      this.rgba = arg;
    } else if (arg instanceof HSLA) {
      this._hsla = arg;
      this.rgba = HSLA.toRGBA(arg);
    } else if (arg instanceof HSVA) {
      this._hsva = arg;
      this.rgba = HSVA.toRGBA(arg);
    } else {
      throw new Error("Invalid color ctor argument");
    }
  }
  equals(other) {
    return !!other && RGBA.equals(this.rgba, other.rgba) && HSLA.equals(this.hsla, other.hsla) && HSVA.equals(this.hsva, other.hsva);
  }
  /**
   * http://www.w3.org/TR/WCAG20/#relativeluminancedef
   * Returns the number in the set [0, 1]. O => Darkest Black. 1 => Lightest white.
   */
  getRelativeLuminance() {
    const R = _Color._relativeLuminanceForComponent(this.rgba.r);
    const G = _Color._relativeLuminanceForComponent(this.rgba.g);
    const B = _Color._relativeLuminanceForComponent(this.rgba.b);
    const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    return roundFloat(luminance, 4);
  }
  /**
   * Reduces the "foreground" color on this "background" color unti it is
   * below the relative luminace ratio.
   * @returns the new foreground color
   * @see https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L315
   */
  reduceRelativeLuminace(foreground, ratio) {
    let { r: fgR, g: fgG, b: fgB } = foreground.rgba;
    let cr = this.getContrastRatio(foreground);
    while (cr < ratio && (fgR > 0 || fgG > 0 || fgB > 0)) {
      fgR -= Math.max(0, Math.ceil(fgR * 0.1));
      fgG -= Math.max(0, Math.ceil(fgG * 0.1));
      fgB -= Math.max(0, Math.ceil(fgB * 0.1));
      cr = this.getContrastRatio(new _Color(new RGBA(fgR, fgG, fgB)));
    }
    return new _Color(new RGBA(fgR, fgG, fgB));
  }
  /**
   * Increases the "foreground" color on this "background" color unti it is
   * below the relative luminace ratio.
   * @returns the new foreground color
   * @see https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L335
   */
  increaseRelativeLuminace(foreground, ratio) {
    let { r: fgR, g: fgG, b: fgB } = foreground.rgba;
    let cr = this.getContrastRatio(foreground);
    while (cr < ratio && (fgR < 255 || fgG < 255 || fgB < 255)) {
      fgR = Math.min(255, fgR + Math.ceil((255 - fgR) * 0.1));
      fgG = Math.min(255, fgG + Math.ceil((255 - fgG) * 0.1));
      fgB = Math.min(255, fgB + Math.ceil((255 - fgB) * 0.1));
      cr = this.getContrastRatio(new _Color(new RGBA(fgR, fgG, fgB)));
    }
    return new _Color(new RGBA(fgR, fgG, fgB));
  }
  static _relativeLuminanceForComponent(color) {
    const c = color / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  /**
   * http://www.w3.org/TR/WCAG20/#contrast-ratiodef
   * Returns the contrast ration number in the set [1, 21].
   */
  getContrastRatio(another) {
    const lum1 = this.getRelativeLuminance();
    const lum2 = another.getRelativeLuminance();
    return lum1 > lum2 ? (lum1 + 0.05) / (lum2 + 0.05) : (lum2 + 0.05) / (lum1 + 0.05);
  }
  /**
   *	http://24ways.org/2010/calculating-color-contrast
   *  Return 'true' if darker color otherwise 'false'
   */
  isDarker() {
    const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1e3;
    return yiq < 128;
  }
  /**
   *	http://24ways.org/2010/calculating-color-contrast
   *  Return 'true' if lighter color otherwise 'false'
   */
  isLighter() {
    const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1e3;
    return yiq >= 128;
  }
  isLighterThan(another) {
    const lum1 = this.getRelativeLuminance();
    const lum2 = another.getRelativeLuminance();
    return lum1 > lum2;
  }
  isDarkerThan(another) {
    const lum1 = this.getRelativeLuminance();
    const lum2 = another.getRelativeLuminance();
    return lum1 < lum2;
  }
  /**
   * Based on xterm.js: https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L288
   *
   * Given a foreground color and a background color, either increase or reduce the luminance of the
   * foreground color until the specified contrast ratio is met. If pure white or black is hit
   * without the contrast ratio being met, go the other direction using the background color as the
   * foreground color and take either the first or second result depending on which has the higher
   * contrast ratio.
   *
   * @param foreground The foreground color.
   * @param ratio The contrast ratio to achieve.
   * @returns The adjusted foreground color.
   */
  ensureConstrast(foreground, ratio) {
    const bgL = this.getRelativeLuminance();
    const fgL = foreground.getRelativeLuminance();
    const cr = this.getContrastRatio(foreground);
    if (cr < ratio) {
      if (fgL < bgL) {
        const resultA2 = this.reduceRelativeLuminace(foreground, ratio);
        const resultARatio2 = this.getContrastRatio(resultA2);
        if (resultARatio2 < ratio) {
          const resultB = this.increaseRelativeLuminace(foreground, ratio);
          const resultBRatio = this.getContrastRatio(resultB);
          return resultARatio2 > resultBRatio ? resultA2 : resultB;
        }
        return resultA2;
      }
      const resultA = this.increaseRelativeLuminace(foreground, ratio);
      const resultARatio = this.getContrastRatio(resultA);
      if (resultARatio < ratio) {
        const resultB = this.reduceRelativeLuminace(foreground, ratio);
        const resultBRatio = this.getContrastRatio(resultB);
        return resultARatio > resultBRatio ? resultA : resultB;
      }
      return resultA;
    }
    return foreground;
  }
  lighten(factor) {
    return new _Color(new HSLA(this.hsla.h, this.hsla.s, this.hsla.l + this.hsla.l * factor, this.hsla.a));
  }
  darken(factor) {
    return new _Color(new HSLA(this.hsla.h, this.hsla.s, this.hsla.l - this.hsla.l * factor, this.hsla.a));
  }
  transparent(factor) {
    const { r, g, b, a } = this.rgba;
    return new _Color(new RGBA(r, g, b, a * factor));
  }
  isTransparent() {
    return this.rgba.a === 0;
  }
  isOpaque() {
    return this.rgba.a === 1;
  }
  opposite() {
    return new _Color(new RGBA(255 - this.rgba.r, 255 - this.rgba.g, 255 - this.rgba.b, this.rgba.a));
  }
  blend(c) {
    const rgba = c.rgba;
    const thisA = this.rgba.a;
    const colorA = rgba.a;
    const a = thisA + colorA * (1 - thisA);
    if (a < 1e-6) {
      return _Color.transparent;
    }
    const r = this.rgba.r * thisA / a + rgba.r * colorA * (1 - thisA) / a;
    const g = this.rgba.g * thisA / a + rgba.g * colorA * (1 - thisA) / a;
    const b = this.rgba.b * thisA / a + rgba.b * colorA * (1 - thisA) / a;
    return new _Color(new RGBA(r, g, b, a));
  }
  /**
   * Mixes the current color with the provided color based on the given factor.
   * @param color The color to mix with
   * @param factor The factor of mixing (0 means this color, 1 means the input color, 0.5 means equal mix)
   * @returns A new color representing the mix
   */
  mix(color, factor = 0.5) {
    const normalize = Math.min(Math.max(factor, 0), 1);
    const thisRGBA = this.rgba;
    const otherRGBA = color.rgba;
    const r = thisRGBA.r + (otherRGBA.r - thisRGBA.r) * normalize;
    const g = thisRGBA.g + (otherRGBA.g - thisRGBA.g) * normalize;
    const b = thisRGBA.b + (otherRGBA.b - thisRGBA.b) * normalize;
    const a = thisRGBA.a + (otherRGBA.a - thisRGBA.a) * normalize;
    return new _Color(new RGBA(r, g, b, a));
  }
  makeOpaque(opaqueBackground) {
    if (this.isOpaque() || opaqueBackground.rgba.a !== 1) {
      return this;
    }
    const { r, g, b, a } = this.rgba;
    return new _Color(new RGBA(
      opaqueBackground.rgba.r - a * (opaqueBackground.rgba.r - r),
      opaqueBackground.rgba.g - a * (opaqueBackground.rgba.g - g),
      opaqueBackground.rgba.b - a * (opaqueBackground.rgba.b - b),
      1
    ));
  }
  flatten(...backgrounds) {
    const background = backgrounds.reduceRight((accumulator, color) => {
      return _Color._flatten(color, accumulator);
    });
    return _Color._flatten(this, background);
  }
  static _flatten(foreground, background) {
    const backgroundAlpha = 1 - foreground.rgba.a;
    return new _Color(new RGBA(
      backgroundAlpha * background.rgba.r + foreground.rgba.a * foreground.rgba.r,
      backgroundAlpha * background.rgba.g + foreground.rgba.a * foreground.rgba.g,
      backgroundAlpha * background.rgba.b + foreground.rgba.a * foreground.rgba.b
    ));
  }
  toString() {
    if (!this._toString) {
      this._toString = _Color.Format.CSS.format(this);
    }
    return this._toString;
  }
  toNumber32Bit() {
    if (!this._toNumber32Bit) {
      this._toNumber32Bit = (this.rgba.r << 24 | this.rgba.g << 16 | this.rgba.b << 8 | this.rgba.a * 255 << 0) >>> 0;
    }
    return this._toNumber32Bit;
  }
  static getLighterColor(of, relative, factor) {
    if (of.isLighterThan(relative)) {
      return of;
    }
    factor = factor ? factor : 0.5;
    const lum1 = of.getRelativeLuminance();
    const lum2 = relative.getRelativeLuminance();
    factor = factor * (lum2 - lum1) / lum2;
    return of.lighten(factor);
  }
  static getDarkerColor(of, relative, factor) {
    if (of.isDarkerThan(relative)) {
      return of;
    }
    factor = factor ? factor : 0.5;
    const lum1 = of.getRelativeLuminance();
    const lum2 = relative.getRelativeLuminance();
    factor = factor * (lum1 - lum2) / lum1;
    return of.darken(factor);
  }
};
_Color.white = new _Color(new RGBA(255, 255, 255, 1));
_Color.black = new _Color(new RGBA(0, 0, 0, 1));
_Color.red = new _Color(new RGBA(255, 0, 0, 1));
_Color.blue = new _Color(new RGBA(0, 0, 255, 1));
_Color.green = new _Color(new RGBA(0, 255, 0, 1));
_Color.cyan = new _Color(new RGBA(0, 255, 255, 1));
_Color.lightgrey = new _Color(new RGBA(211, 211, 211, 1));
_Color.transparent = new _Color(new RGBA(0, 0, 0, 0));
let Color = _Color;
((Color2) => {
  let Format;
  ((Format2) => {
    let CSS;
    ((CSS2) => {
      function formatRGB(color) {
        if (color.rgba.a === 1) {
          return `rgb(${color.rgba.r}, ${color.rgba.g}, ${color.rgba.b})`;
        }
        return Color2.Format.CSS.formatRGBA(color);
      }
      CSS2.formatRGB = formatRGB;
      function formatRGBA(color) {
        return `rgba(${color.rgba.r}, ${color.rgba.g}, ${color.rgba.b}, ${+color.rgba.a.toFixed(2)})`;
      }
      CSS2.formatRGBA = formatRGBA;
      function formatHSL(color) {
        if (color.hsla.a === 1) {
          return `hsl(${color.hsla.h}, ${Math.round(color.hsla.s * 100)}%, ${Math.round(color.hsla.l * 100)}%)`;
        }
        return Color2.Format.CSS.formatHSLA(color);
      }
      CSS2.formatHSL = formatHSL;
      function formatHSLA(color) {
        return `hsla(${color.hsla.h}, ${Math.round(color.hsla.s * 100)}%, ${Math.round(color.hsla.l * 100)}%, ${color.hsla.a.toFixed(2)})`;
      }
      CSS2.formatHSLA = formatHSLA;
      function _toTwoDigitHex(n) {
        const r = n.toString(16);
        return r.length !== 2 ? "0" + r : r;
      }
      function formatHex(color) {
        return `#${_toTwoDigitHex(color.rgba.r)}${_toTwoDigitHex(color.rgba.g)}${_toTwoDigitHex(color.rgba.b)}`;
      }
      CSS2.formatHex = formatHex;
      function formatHexA(color, compact = false) {
        if (compact && color.rgba.a === 1) {
          return Color2.Format.CSS.formatHex(color);
        }
        return `#${_toTwoDigitHex(color.rgba.r)}${_toTwoDigitHex(color.rgba.g)}${_toTwoDigitHex(color.rgba.b)}${_toTwoDigitHex(Math.round(color.rgba.a * 255))}`;
      }
      CSS2.formatHexA = formatHexA;
      function format(color) {
        if (color.isOpaque()) {
          return Color2.Format.CSS.formatHex(color);
        }
        return Color2.Format.CSS.formatRGBA(color);
      }
      CSS2.format = format;
      function parse(css) {
        if (css === "transparent") {
          return Color2.transparent;
        }
        if (css.startsWith("#")) {
          return parseHex(css);
        }
        if (css.startsWith("rgba(")) {
          const color = css.match(/rgba\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+), *(?<a>(?:\+|-)?\d+(\.\d+)?)\)/);
          if (!color) {
            throw new Error("Invalid color format " + css);
          }
          const r = parseInt(color.groups?.r ?? "0");
          const g = parseInt(color.groups?.g ?? "0");
          const b = parseInt(color.groups?.b ?? "0");
          const a = parseFloat(color.groups?.a ?? "0");
          return new Color2(new RGBA(r, g, b, a));
        }
        if (css.startsWith("rgb(")) {
          const color = css.match(/rgb\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+)\)/);
          if (!color) {
            throw new Error("Invalid color format " + css);
          }
          const r = parseInt(color.groups?.r ?? "0");
          const g = parseInt(color.groups?.g ?? "0");
          const b = parseInt(color.groups?.b ?? "0");
          return new Color2(new RGBA(r, g, b));
        }
        return parseNamedKeyword(css);
      }
      CSS2.parse = parse;
      function parseNamedKeyword(css) {
        switch (css) {
          case "aliceblue":
            return new Color2(new RGBA(240, 248, 255, 1));
          case "antiquewhite":
            return new Color2(new RGBA(250, 235, 215, 1));
          case "aqua":
            return new Color2(new RGBA(0, 255, 255, 1));
          case "aquamarine":
            return new Color2(new RGBA(127, 255, 212, 1));
          case "azure":
            return new Color2(new RGBA(240, 255, 255, 1));
          case "beige":
            return new Color2(new RGBA(245, 245, 220, 1));
          case "bisque":
            return new Color2(new RGBA(255, 228, 196, 1));
          case "black":
            return new Color2(new RGBA(0, 0, 0, 1));
          case "blanchedalmond":
            return new Color2(new RGBA(255, 235, 205, 1));
          case "blue":
            return new Color2(new RGBA(0, 0, 255, 1));
          case "blueviolet":
            return new Color2(new RGBA(138, 43, 226, 1));
          case "brown":
            return new Color2(new RGBA(165, 42, 42, 1));
          case "burlywood":
            return new Color2(new RGBA(222, 184, 135, 1));
          case "cadetblue":
            return new Color2(new RGBA(95, 158, 160, 1));
          case "chartreuse":
            return new Color2(new RGBA(127, 255, 0, 1));
          case "chocolate":
            return new Color2(new RGBA(210, 105, 30, 1));
          case "coral":
            return new Color2(new RGBA(255, 127, 80, 1));
          case "cornflowerblue":
            return new Color2(new RGBA(100, 149, 237, 1));
          case "cornsilk":
            return new Color2(new RGBA(255, 248, 220, 1));
          case "crimson":
            return new Color2(new RGBA(220, 20, 60, 1));
          case "cyan":
            return new Color2(new RGBA(0, 255, 255, 1));
          case "darkblue":
            return new Color2(new RGBA(0, 0, 139, 1));
          case "darkcyan":
            return new Color2(new RGBA(0, 139, 139, 1));
          case "darkgoldenrod":
            return new Color2(new RGBA(184, 134, 11, 1));
          case "darkgray":
            return new Color2(new RGBA(169, 169, 169, 1));
          case "darkgreen":
            return new Color2(new RGBA(0, 100, 0, 1));
          case "darkgrey":
            return new Color2(new RGBA(169, 169, 169, 1));
          case "darkkhaki":
            return new Color2(new RGBA(189, 183, 107, 1));
          case "darkmagenta":
            return new Color2(new RGBA(139, 0, 139, 1));
          case "darkolivegreen":
            return new Color2(new RGBA(85, 107, 47, 1));
          case "darkorange":
            return new Color2(new RGBA(255, 140, 0, 1));
          case "darkorchid":
            return new Color2(new RGBA(153, 50, 204, 1));
          case "darkred":
            return new Color2(new RGBA(139, 0, 0, 1));
          case "darksalmon":
            return new Color2(new RGBA(233, 150, 122, 1));
          case "darkseagreen":
            return new Color2(new RGBA(143, 188, 143, 1));
          case "darkslateblue":
            return new Color2(new RGBA(72, 61, 139, 1));
          case "darkslategray":
            return new Color2(new RGBA(47, 79, 79, 1));
          case "darkslategrey":
            return new Color2(new RGBA(47, 79, 79, 1));
          case "darkturquoise":
            return new Color2(new RGBA(0, 206, 209, 1));
          case "darkviolet":
            return new Color2(new RGBA(148, 0, 211, 1));
          case "deeppink":
            return new Color2(new RGBA(255, 20, 147, 1));
          case "deepskyblue":
            return new Color2(new RGBA(0, 191, 255, 1));
          case "dimgray":
            return new Color2(new RGBA(105, 105, 105, 1));
          case "dimgrey":
            return new Color2(new RGBA(105, 105, 105, 1));
          case "dodgerblue":
            return new Color2(new RGBA(30, 144, 255, 1));
          case "firebrick":
            return new Color2(new RGBA(178, 34, 34, 1));
          case "floralwhite":
            return new Color2(new RGBA(255, 250, 240, 1));
          case "forestgreen":
            return new Color2(new RGBA(34, 139, 34, 1));
          case "fuchsia":
            return new Color2(new RGBA(255, 0, 255, 1));
          case "gainsboro":
            return new Color2(new RGBA(220, 220, 220, 1));
          case "ghostwhite":
            return new Color2(new RGBA(248, 248, 255, 1));
          case "gold":
            return new Color2(new RGBA(255, 215, 0, 1));
          case "goldenrod":
            return new Color2(new RGBA(218, 165, 32, 1));
          case "gray":
            return new Color2(new RGBA(128, 128, 128, 1));
          case "green":
            return new Color2(new RGBA(0, 128, 0, 1));
          case "greenyellow":
            return new Color2(new RGBA(173, 255, 47, 1));
          case "grey":
            return new Color2(new RGBA(128, 128, 128, 1));
          case "honeydew":
            return new Color2(new RGBA(240, 255, 240, 1));
          case "hotpink":
            return new Color2(new RGBA(255, 105, 180, 1));
          case "indianred":
            return new Color2(new RGBA(205, 92, 92, 1));
          case "indigo":
            return new Color2(new RGBA(75, 0, 130, 1));
          case "ivory":
            return new Color2(new RGBA(255, 255, 240, 1));
          case "khaki":
            return new Color2(new RGBA(240, 230, 140, 1));
          case "lavender":
            return new Color2(new RGBA(230, 230, 250, 1));
          case "lavenderblush":
            return new Color2(new RGBA(255, 240, 245, 1));
          case "lawngreen":
            return new Color2(new RGBA(124, 252, 0, 1));
          case "lemonchiffon":
            return new Color2(new RGBA(255, 250, 205, 1));
          case "lightblue":
            return new Color2(new RGBA(173, 216, 230, 1));
          case "lightcoral":
            return new Color2(new RGBA(240, 128, 128, 1));
          case "lightcyan":
            return new Color2(new RGBA(224, 255, 255, 1));
          case "lightgoldenrodyellow":
            return new Color2(new RGBA(250, 250, 210, 1));
          case "lightgray":
            return new Color2(new RGBA(211, 211, 211, 1));
          case "lightgreen":
            return new Color2(new RGBA(144, 238, 144, 1));
          case "lightgrey":
            return new Color2(new RGBA(211, 211, 211, 1));
          case "lightpink":
            return new Color2(new RGBA(255, 182, 193, 1));
          case "lightsalmon":
            return new Color2(new RGBA(255, 160, 122, 1));
          case "lightseagreen":
            return new Color2(new RGBA(32, 178, 170, 1));
          case "lightskyblue":
            return new Color2(new RGBA(135, 206, 250, 1));
          case "lightslategray":
            return new Color2(new RGBA(119, 136, 153, 1));
          case "lightslategrey":
            return new Color2(new RGBA(119, 136, 153, 1));
          case "lightsteelblue":
            return new Color2(new RGBA(176, 196, 222, 1));
          case "lightyellow":
            return new Color2(new RGBA(255, 255, 224, 1));
          case "lime":
            return new Color2(new RGBA(0, 255, 0, 1));
          case "limegreen":
            return new Color2(new RGBA(50, 205, 50, 1));
          case "linen":
            return new Color2(new RGBA(250, 240, 230, 1));
          case "magenta":
            return new Color2(new RGBA(255, 0, 255, 1));
          case "maroon":
            return new Color2(new RGBA(128, 0, 0, 1));
          case "mediumaquamarine":
            return new Color2(new RGBA(102, 205, 170, 1));
          case "mediumblue":
            return new Color2(new RGBA(0, 0, 205, 1));
          case "mediumorchid":
            return new Color2(new RGBA(186, 85, 211, 1));
          case "mediumpurple":
            return new Color2(new RGBA(147, 112, 219, 1));
          case "mediumseagreen":
            return new Color2(new RGBA(60, 179, 113, 1));
          case "mediumslateblue":
            return new Color2(new RGBA(123, 104, 238, 1));
          case "mediumspringgreen":
            return new Color2(new RGBA(0, 250, 154, 1));
          case "mediumturquoise":
            return new Color2(new RGBA(72, 209, 204, 1));
          case "mediumvioletred":
            return new Color2(new RGBA(199, 21, 133, 1));
          case "midnightblue":
            return new Color2(new RGBA(25, 25, 112, 1));
          case "mintcream":
            return new Color2(new RGBA(245, 255, 250, 1));
          case "mistyrose":
            return new Color2(new RGBA(255, 228, 225, 1));
          case "moccasin":
            return new Color2(new RGBA(255, 228, 181, 1));
          case "navajowhite":
            return new Color2(new RGBA(255, 222, 173, 1));
          case "navy":
            return new Color2(new RGBA(0, 0, 128, 1));
          case "oldlace":
            return new Color2(new RGBA(253, 245, 230, 1));
          case "olive":
            return new Color2(new RGBA(128, 128, 0, 1));
          case "olivedrab":
            return new Color2(new RGBA(107, 142, 35, 1));
          case "orange":
            return new Color2(new RGBA(255, 165, 0, 1));
          case "orangered":
            return new Color2(new RGBA(255, 69, 0, 1));
          case "orchid":
            return new Color2(new RGBA(218, 112, 214, 1));
          case "palegoldenrod":
            return new Color2(new RGBA(238, 232, 170, 1));
          case "palegreen":
            return new Color2(new RGBA(152, 251, 152, 1));
          case "paleturquoise":
            return new Color2(new RGBA(175, 238, 238, 1));
          case "palevioletred":
            return new Color2(new RGBA(219, 112, 147, 1));
          case "papayawhip":
            return new Color2(new RGBA(255, 239, 213, 1));
          case "peachpuff":
            return new Color2(new RGBA(255, 218, 185, 1));
          case "peru":
            return new Color2(new RGBA(205, 133, 63, 1));
          case "pink":
            return new Color2(new RGBA(255, 192, 203, 1));
          case "plum":
            return new Color2(new RGBA(221, 160, 221, 1));
          case "powderblue":
            return new Color2(new RGBA(176, 224, 230, 1));
          case "purple":
            return new Color2(new RGBA(128, 0, 128, 1));
          case "rebeccapurple":
            return new Color2(new RGBA(102, 51, 153, 1));
          case "red":
            return new Color2(new RGBA(255, 0, 0, 1));
          case "rosybrown":
            return new Color2(new RGBA(188, 143, 143, 1));
          case "royalblue":
            return new Color2(new RGBA(65, 105, 225, 1));
          case "saddlebrown":
            return new Color2(new RGBA(139, 69, 19, 1));
          case "salmon":
            return new Color2(new RGBA(250, 128, 114, 1));
          case "sandybrown":
            return new Color2(new RGBA(244, 164, 96, 1));
          case "seagreen":
            return new Color2(new RGBA(46, 139, 87, 1));
          case "seashell":
            return new Color2(new RGBA(255, 245, 238, 1));
          case "sienna":
            return new Color2(new RGBA(160, 82, 45, 1));
          case "silver":
            return new Color2(new RGBA(192, 192, 192, 1));
          case "skyblue":
            return new Color2(new RGBA(135, 206, 235, 1));
          case "slateblue":
            return new Color2(new RGBA(106, 90, 205, 1));
          case "slategray":
            return new Color2(new RGBA(112, 128, 144, 1));
          case "slategrey":
            return new Color2(new RGBA(112, 128, 144, 1));
          case "snow":
            return new Color2(new RGBA(255, 250, 250, 1));
          case "springgreen":
            return new Color2(new RGBA(0, 255, 127, 1));
          case "steelblue":
            return new Color2(new RGBA(70, 130, 180, 1));
          case "tan":
            return new Color2(new RGBA(210, 180, 140, 1));
          case "teal":
            return new Color2(new RGBA(0, 128, 128, 1));
          case "thistle":
            return new Color2(new RGBA(216, 191, 216, 1));
          case "tomato":
            return new Color2(new RGBA(255, 99, 71, 1));
          case "turquoise":
            return new Color2(new RGBA(64, 224, 208, 1));
          case "violet":
            return new Color2(new RGBA(238, 130, 238, 1));
          case "wheat":
            return new Color2(new RGBA(245, 222, 179, 1));
          case "white":
            return new Color2(new RGBA(255, 255, 255, 1));
          case "whitesmoke":
            return new Color2(new RGBA(245, 245, 245, 1));
          case "yellow":
            return new Color2(new RGBA(255, 255, 0, 1));
          case "yellowgreen":
            return new Color2(new RGBA(154, 205, 50, 1));
          default:
            return null;
        }
      }
      function parseHex(hex) {
        const length = hex.length;
        if (length === 0) {
          return null;
        }
        if (hex.charCodeAt(0) !== CharCode.Hash) {
          return null;
        }
        if (length === 7) {
          const r = 16 * _parseHexDigit(hex.charCodeAt(1)) + _parseHexDigit(hex.charCodeAt(2));
          const g = 16 * _parseHexDigit(hex.charCodeAt(3)) + _parseHexDigit(hex.charCodeAt(4));
          const b = 16 * _parseHexDigit(hex.charCodeAt(5)) + _parseHexDigit(hex.charCodeAt(6));
          return new Color2(new RGBA(r, g, b, 1));
        }
        if (length === 9) {
          const r = 16 * _parseHexDigit(hex.charCodeAt(1)) + _parseHexDigit(hex.charCodeAt(2));
          const g = 16 * _parseHexDigit(hex.charCodeAt(3)) + _parseHexDigit(hex.charCodeAt(4));
          const b = 16 * _parseHexDigit(hex.charCodeAt(5)) + _parseHexDigit(hex.charCodeAt(6));
          const a = 16 * _parseHexDigit(hex.charCodeAt(7)) + _parseHexDigit(hex.charCodeAt(8));
          return new Color2(new RGBA(r, g, b, a / 255));
        }
        if (length === 4) {
          const r = _parseHexDigit(hex.charCodeAt(1));
          const g = _parseHexDigit(hex.charCodeAt(2));
          const b = _parseHexDigit(hex.charCodeAt(3));
          return new Color2(new RGBA(16 * r + r, 16 * g + g, 16 * b + b));
        }
        if (length === 5) {
          const r = _parseHexDigit(hex.charCodeAt(1));
          const g = _parseHexDigit(hex.charCodeAt(2));
          const b = _parseHexDigit(hex.charCodeAt(3));
          const a = _parseHexDigit(hex.charCodeAt(4));
          return new Color2(new RGBA(16 * r + r, 16 * g + g, 16 * b + b, (16 * a + a) / 255));
        }
        return null;
      }
      CSS2.parseHex = parseHex;
      function _parseHexDigit(charCode) {
        switch (charCode) {
          case CharCode.Digit0:
            return 0;
          case CharCode.Digit1:
            return 1;
          case CharCode.Digit2:
            return 2;
          case CharCode.Digit3:
            return 3;
          case CharCode.Digit4:
            return 4;
          case CharCode.Digit5:
            return 5;
          case CharCode.Digit6:
            return 6;
          case CharCode.Digit7:
            return 7;
          case CharCode.Digit8:
            return 8;
          case CharCode.Digit9:
            return 9;
          case CharCode.a:
            return 10;
          case CharCode.A:
            return 10;
          case CharCode.b:
            return 11;
          case CharCode.B:
            return 11;
          case CharCode.c:
            return 12;
          case CharCode.C:
            return 12;
          case CharCode.d:
            return 13;
          case CharCode.D:
            return 13;
          case CharCode.e:
            return 14;
          case CharCode.E:
            return 14;
          case CharCode.f:
            return 15;
          case CharCode.F:
            return 15;
        }
        return 0;
      }
    })(CSS = Format2.CSS || (Format2.CSS = {}));
  })(Format = Color2.Format || (Color2.Format = {}));
})(Color || (Color = {}));
export {
  Color,
  HSLA,
  HSVA,
  RGBA
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGNvbG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuL2NoYXJDb2RlLmpzJztcblxuZnVuY3Rpb24gcm91bmRGbG9hdChudW1iZXI6IG51bWJlciwgZGVjaW1hbFBvaW50czogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgZGVjaW1hbCA9IE1hdGgucG93KDEwLCBkZWNpbWFsUG9pbnRzKTtcblx0cmV0dXJuIE1hdGgucm91bmQobnVtYmVyICogZGVjaW1hbCkgLyBkZWNpbWFsO1xufVxuXG5leHBvcnQgY2xhc3MgUkdCQSB7XG5cdF9yZ2JhQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJlZDogaW50ZWdlciBpbiBbMC0yNTVdXG5cdCAqL1xuXHRyZWFkb25seSByOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEdyZWVuOiBpbnRlZ2VyIGluIFswLTI1NV1cblx0ICovXG5cdHJlYWRvbmx5IGc6IG51bWJlcjtcblxuXHQvKipcblx0ICogQmx1ZTogaW50ZWdlciBpbiBbMC0yNTVdXG5cdCAqL1xuXHRyZWFkb25seSBiOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEFscGhhOiBmbG9hdCBpbiBbMC0xXVxuXHQgKi9cblx0cmVhZG9ubHkgYTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHI6IG51bWJlciwgZzogbnVtYmVyLCBiOiBudW1iZXIsIGE6IG51bWJlciA9IDEpIHtcblx0XHR0aGlzLnIgPSBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIHIpKSB8IDA7XG5cdFx0dGhpcy5nID0gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBnKSkgfCAwO1xuXHRcdHRoaXMuYiA9IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgYikpIHwgMDtcblx0XHR0aGlzLmEgPSByb3VuZEZsb2F0KE1hdGgubWF4KE1hdGgubWluKDEsIGEpLCAwKSwgMyk7XG5cdH1cblxuXHRzdGF0aWMgZXF1YWxzKGE6IFJHQkEsIGI6IFJHQkEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYS5yID09PSBiLnIgJiYgYS5nID09PSBiLmcgJiYgYS5iID09PSBiLmIgJiYgYS5hID09PSBiLmE7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEhTTEEge1xuXG5cdF9oc2xhQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEh1ZTogaW50ZWdlciBpbiBbMCwgMzYwXVxuXHQgKi9cblx0cmVhZG9ubHkgaDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBTYXR1cmF0aW9uOiBmbG9hdCBpbiBbMCwgMV1cblx0ICovXG5cdHJlYWRvbmx5IHM6IG51bWJlcjtcblxuXHQvKipcblx0ICogTHVtaW5vc2l0eTogZmxvYXQgaW4gWzAsIDFdXG5cdCAqL1xuXHRyZWFkb25seSBsOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEFscGhhOiBmbG9hdCBpbiBbMCwgMV1cblx0ICovXG5cdHJlYWRvbmx5IGE6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihoOiBudW1iZXIsIHM6IG51bWJlciwgbDogbnVtYmVyLCBhOiBudW1iZXIpIHtcblx0XHR0aGlzLmggPSBNYXRoLm1heChNYXRoLm1pbigzNjAsIGgpLCAwKSB8IDA7XG5cdFx0dGhpcy5zID0gcm91bmRGbG9hdChNYXRoLm1heChNYXRoLm1pbigxLCBzKSwgMCksIDMpO1xuXHRcdHRoaXMubCA9IHJvdW5kRmxvYXQoTWF0aC5tYXgoTWF0aC5taW4oMSwgbCksIDApLCAzKTtcblx0XHR0aGlzLmEgPSByb3VuZEZsb2F0KE1hdGgubWF4KE1hdGgubWluKDEsIGEpLCAwKSwgMyk7XG5cdH1cblxuXHRzdGF0aWMgZXF1YWxzKGE6IEhTTEEsIGI6IEhTTEEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYS5oID09PSBiLmggJiYgYS5zID09PSBiLnMgJiYgYS5sID09PSBiLmwgJiYgYS5hID09PSBiLmE7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYW4gUkdCIGNvbG9yIHZhbHVlIHRvIEhTTC4gQ29udmVyc2lvbiBmb3JtdWxhXG5cdCAqIGFkYXB0ZWQgZnJvbSBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hTTF9jb2xvcl9zcGFjZS5cblx0ICogQXNzdW1lcyByLCBnLCBhbmQgYiBhcmUgY29udGFpbmVkIGluIHRoZSBzZXQgWzAsIDI1NV0gYW5kXG5cdCAqIHJldHVybnMgaCBpbiB0aGUgc2V0IFswLCAzNjBdLCBzLCBhbmQgbCBpbiB0aGUgc2V0IFswLCAxXS5cblx0ICovXG5cdHN0YXRpYyBmcm9tUkdCQShyZ2JhOiBSR0JBKTogSFNMQSB7XG5cdFx0Y29uc3QgciA9IHJnYmEuciAvIDI1NTtcblx0XHRjb25zdCBnID0gcmdiYS5nIC8gMjU1O1xuXHRcdGNvbnN0IGIgPSByZ2JhLmIgLyAyNTU7XG5cdFx0Y29uc3QgYSA9IHJnYmEuYTtcblxuXHRcdGNvbnN0IG1heCA9IE1hdGgubWF4KHIsIGcsIGIpO1xuXHRcdGNvbnN0IG1pbiA9IE1hdGgubWluKHIsIGcsIGIpO1xuXHRcdGxldCBoID0gMDtcblx0XHRsZXQgcyA9IDA7XG5cdFx0Y29uc3QgbCA9IChtaW4gKyBtYXgpIC8gMjtcblx0XHRjb25zdCBjaHJvbWEgPSBtYXggLSBtaW47XG5cblx0XHRpZiAoY2hyb21hID4gMCkge1xuXHRcdFx0cyA9IE1hdGgubWluKChsIDw9IDAuNSA/IGNocm9tYSAvICgyICogbCkgOiBjaHJvbWEgLyAoMiAtICgyICogbCkpKSwgMSk7XG5cblx0XHRcdHN3aXRjaCAobWF4KSB7XG5cdFx0XHRcdGNhc2UgcjogaCA9IChnIC0gYikgLyBjaHJvbWEgKyAoZyA8IGIgPyA2IDogMCk7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIGc6IGggPSAoYiAtIHIpIC8gY2hyb21hICsgMjsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgYjogaCA9IChyIC0gZykgLyBjaHJvbWEgKyA0OyBicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aCAqPSA2MDtcblx0XHRcdGggPSBNYXRoLnJvdW5kKGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEhTTEEoaCwgcywgbCwgYSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaHVlMnJnYihwOiBudW1iZXIsIHE6IG51bWJlciwgdDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodCA8IDApIHtcblx0XHRcdHQgKz0gMTtcblx0XHR9XG5cdFx0aWYgKHQgPiAxKSB7XG5cdFx0XHR0IC09IDE7XG5cdFx0fVxuXHRcdGlmICh0IDwgMSAvIDYpIHtcblx0XHRcdHJldHVybiBwICsgKHEgLSBwKSAqIDYgKiB0O1xuXHRcdH1cblx0XHRpZiAodCA8IDEgLyAyKSB7XG5cdFx0XHRyZXR1cm4gcTtcblx0XHR9XG5cdFx0aWYgKHQgPCAyIC8gMykge1xuXHRcdFx0cmV0dXJuIHAgKyAocSAtIHApICogKDIgLyAzIC0gdCkgKiA2O1xuXHRcdH1cblx0XHRyZXR1cm4gcDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhbiBIU0wgY29sb3IgdmFsdWUgdG8gUkdCLiBDb252ZXJzaW9uIGZvcm11bGFcblx0ICogYWRhcHRlZCBmcm9tIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSFNMX2NvbG9yX3NwYWNlLlxuXHQgKiBBc3N1bWVzIGggaW4gdGhlIHNldCBbMCwgMzYwXSBzLCBhbmQgbCBhcmUgY29udGFpbmVkIGluIHRoZSBzZXQgWzAsIDFdIGFuZFxuXHQgKiByZXR1cm5zIHIsIGcsIGFuZCBiIGluIHRoZSBzZXQgWzAsIDI1NV0uXG5cdCAqL1xuXHRzdGF0aWMgdG9SR0JBKGhzbGE6IEhTTEEpOiBSR0JBIHtcblx0XHRjb25zdCBoID0gaHNsYS5oIC8gMzYwO1xuXHRcdGNvbnN0IHsgcywgbCwgYSB9ID0gaHNsYTtcblx0XHRsZXQgcjogbnVtYmVyLCBnOiBudW1iZXIsIGI6IG51bWJlcjtcblxuXHRcdGlmIChzID09PSAwKSB7XG5cdFx0XHRyID0gZyA9IGIgPSBsOyAvLyBhY2hyb21hdGljXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHEgPSBsIDwgMC41ID8gbCAqICgxICsgcykgOiBsICsgcyAtIGwgKiBzO1xuXHRcdFx0Y29uc3QgcCA9IDIgKiBsIC0gcTtcblx0XHRcdHIgPSBIU0xBLl9odWUycmdiKHAsIHEsIGggKyAxIC8gMyk7XG5cdFx0XHRnID0gSFNMQS5faHVlMnJnYihwLCBxLCBoKTtcblx0XHRcdGIgPSBIU0xBLl9odWUycmdiKHAsIHEsIGggLSAxIC8gMyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSR0JBKE1hdGgucm91bmQociAqIDI1NSksIE1hdGgucm91bmQoZyAqIDI1NSksIE1hdGgucm91bmQoYiAqIDI1NSksIGEpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBIU1ZBIHtcblxuXHRfaHN2YUJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBIdWU6IGludGVnZXIgaW4gWzAsIDM2MF1cblx0ICovXG5cdHJlYWRvbmx5IGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogU2F0dXJhdGlvbjogZmxvYXQgaW4gWzAsIDFdXG5cdCAqL1xuXHRyZWFkb25seSBzOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFZhbHVlOiBmbG9hdCBpbiBbMCwgMV1cblx0ICovXG5cdHJlYWRvbmx5IHY6IG51bWJlcjtcblxuXHQvKipcblx0ICogQWxwaGE6IGZsb2F0IGluIFswLCAxXVxuXHQgKi9cblx0cmVhZG9ubHkgYTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGg6IG51bWJlciwgczogbnVtYmVyLCB2OiBudW1iZXIsIGE6IG51bWJlcikge1xuXHRcdHRoaXMuaCA9IE1hdGgubWF4KE1hdGgubWluKDM2MCwgaCksIDApIHwgMDtcblx0XHR0aGlzLnMgPSByb3VuZEZsb2F0KE1hdGgubWF4KE1hdGgubWluKDEsIHMpLCAwKSwgMyk7XG5cdFx0dGhpcy52ID0gcm91bmRGbG9hdChNYXRoLm1heChNYXRoLm1pbigxLCB2KSwgMCksIDMpO1xuXHRcdHRoaXMuYSA9IHJvdW5kRmxvYXQoTWF0aC5tYXgoTWF0aC5taW4oMSwgYSksIDApLCAzKTtcblx0fVxuXG5cdHN0YXRpYyBlcXVhbHMoYTogSFNWQSwgYjogSFNWQSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBhLmggPT09IGIuaCAmJiBhLnMgPT09IGIucyAmJiBhLnYgPT09IGIudiAmJiBhLmEgPT09IGIuYTtcblx0fVxuXG5cdC8vIGZyb20gaHR0cDovL3d3dy5yYXBpZHRhYmxlcy5jb20vY29udmVydC9jb2xvci9yZ2ItdG8taHN2Lmh0bVxuXHRzdGF0aWMgZnJvbVJHQkEocmdiYTogUkdCQSk6IEhTVkEge1xuXHRcdGNvbnN0IHIgPSByZ2JhLnIgLyAyNTU7XG5cdFx0Y29uc3QgZyA9IHJnYmEuZyAvIDI1NTtcblx0XHRjb25zdCBiID0gcmdiYS5iIC8gMjU1O1xuXHRcdGNvbnN0IGNtYXggPSBNYXRoLm1heChyLCBnLCBiKTtcblx0XHRjb25zdCBjbWluID0gTWF0aC5taW4ociwgZywgYik7XG5cdFx0Y29uc3QgZGVsdGEgPSBjbWF4IC0gY21pbjtcblx0XHRjb25zdCBzID0gY21heCA9PT0gMCA/IDAgOiAoZGVsdGEgLyBjbWF4KTtcblx0XHRsZXQgbTogbnVtYmVyO1xuXG5cdFx0aWYgKGRlbHRhID09PSAwKSB7XG5cdFx0XHRtID0gMDtcblx0XHR9IGVsc2UgaWYgKGNtYXggPT09IHIpIHtcblx0XHRcdG0gPSAoKCgoZyAtIGIpIC8gZGVsdGEpICUgNikgKyA2KSAlIDY7XG5cdFx0fSBlbHNlIGlmIChjbWF4ID09PSBnKSB7XG5cdFx0XHRtID0gKChiIC0gcikgLyBkZWx0YSkgKyAyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtID0gKChyIC0gZykgLyBkZWx0YSkgKyA0O1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgSFNWQShNYXRoLnJvdW5kKG0gKiA2MCksIHMsIGNtYXgsIHJnYmEuYSk7XG5cdH1cblxuXHQvLyBmcm9tIGh0dHA6Ly93d3cucmFwaWR0YWJsZXMuY29tL2NvbnZlcnQvY29sb3IvaHN2LXRvLXJnYi5odG1cblx0c3RhdGljIHRvUkdCQShoc3ZhOiBIU1ZBKTogUkdCQSB7XG5cdFx0Y29uc3QgeyBoLCBzLCB2LCBhIH0gPSBoc3ZhO1xuXHRcdGNvbnN0IGMgPSB2ICogcztcblx0XHRjb25zdCB4ID0gYyAqICgxIC0gTWF0aC5hYnMoKGggLyA2MCkgJSAyIC0gMSkpO1xuXHRcdGNvbnN0IG0gPSB2IC0gYztcblx0XHRsZXQgW3IsIGcsIGJdID0gWzAsIDAsIDBdO1xuXG5cdFx0aWYgKGggPCA2MCkge1xuXHRcdFx0ciA9IGM7XG5cdFx0XHRnID0geDtcblx0XHR9IGVsc2UgaWYgKGggPCAxMjApIHtcblx0XHRcdHIgPSB4O1xuXHRcdFx0ZyA9IGM7XG5cdFx0fSBlbHNlIGlmIChoIDwgMTgwKSB7XG5cdFx0XHRnID0gYztcblx0XHRcdGIgPSB4O1xuXHRcdH0gZWxzZSBpZiAoaCA8IDI0MCkge1xuXHRcdFx0ZyA9IHg7XG5cdFx0XHRiID0gYztcblx0XHR9IGVsc2UgaWYgKGggPCAzMDApIHtcblx0XHRcdHIgPSB4O1xuXHRcdFx0YiA9IGM7XG5cdFx0fSBlbHNlIGlmIChoIDw9IDM2MCkge1xuXHRcdFx0ciA9IGM7XG5cdFx0XHRiID0geDtcblx0XHR9XG5cblx0XHRyID0gTWF0aC5yb3VuZCgociArIG0pICogMjU1KTtcblx0XHRnID0gTWF0aC5yb3VuZCgoZyArIG0pICogMjU1KTtcblx0XHRiID0gTWF0aC5yb3VuZCgoYiArIG0pICogMjU1KTtcblxuXHRcdHJldHVybiBuZXcgUkdCQShyLCBnLCBiLCBhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29sb3Ige1xuXG5cdHN0YXRpYyBmcm9tSGV4KGhleDogc3RyaW5nKTogQ29sb3Ige1xuXHRcdHJldHVybiBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlSGV4KGhleCkgfHwgQ29sb3IucmVkO1xuXHR9XG5cblx0c3RhdGljIGVxdWFscyhhOiBDb2xvciB8IG51bGwsIGI6IENvbG9yIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghYSAmJiAhYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5lcXVhbHMoYik7XG5cdH1cblxuXHRyZWFkb25seSByZ2JhOiBSR0JBO1xuXHRwcml2YXRlIF9oc2xhPzogSFNMQTtcblx0Z2V0IGhzbGEoKTogSFNMQSB7XG5cdFx0aWYgKHRoaXMuX2hzbGEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9oc2xhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gSFNMQS5mcm9tUkdCQSh0aGlzLnJnYmEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hzdmE/OiBIU1ZBO1xuXHRnZXQgaHN2YSgpOiBIU1ZBIHtcblx0XHRpZiAodGhpcy5faHN2YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hzdmE7XG5cdFx0fVxuXHRcdHJldHVybiBIU1ZBLmZyb21SR0JBKHRoaXMucmdiYSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihhcmc6IFJHQkEgfCBIU0xBIHwgSFNWQSkge1xuXHRcdGlmICghYXJnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbG9yIG5lZWRzIGEgdmFsdWUnKTtcblx0XHR9IGVsc2UgaWYgKGFyZyBpbnN0YW5jZW9mIFJHQkEpIHtcblx0XHRcdHRoaXMucmdiYSA9IGFyZztcblx0XHR9IGVsc2UgaWYgKGFyZyBpbnN0YW5jZW9mIEhTTEEpIHtcblx0XHRcdHRoaXMuX2hzbGEgPSBhcmc7XG5cdFx0XHR0aGlzLnJnYmEgPSBIU0xBLnRvUkdCQShhcmcpO1xuXHRcdH0gZWxzZSBpZiAoYXJnIGluc3RhbmNlb2YgSFNWQSkge1xuXHRcdFx0dGhpcy5faHN2YSA9IGFyZztcblx0XHRcdHRoaXMucmdiYSA9IEhTVkEudG9SR0JBKGFyZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2xvciBjdG9yIGFyZ3VtZW50Jyk7XG5cdFx0fVxuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBDb2xvciB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFvdGhlciAmJiBSR0JBLmVxdWFscyh0aGlzLnJnYmEsIG90aGVyLnJnYmEpICYmIEhTTEEuZXF1YWxzKHRoaXMuaHNsYSwgb3RoZXIuaHNsYSkgJiYgSFNWQS5lcXVhbHModGhpcy5oc3ZhLCBvdGhlci5oc3ZhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBodHRwOi8vd3d3LnczLm9yZy9UUi9XQ0FHMjAvI3JlbGF0aXZlbHVtaW5hbmNlZGVmXG5cdCAqIFJldHVybnMgdGhlIG51bWJlciBpbiB0aGUgc2V0IFswLCAxXS4gTyA9PiBEYXJrZXN0IEJsYWNrLiAxID0+IExpZ2h0ZXN0IHdoaXRlLlxuXHQgKi9cblx0Z2V0UmVsYXRpdmVMdW1pbmFuY2UoKTogbnVtYmVyIHtcblx0XHRjb25zdCBSID0gQ29sb3IuX3JlbGF0aXZlTHVtaW5hbmNlRm9yQ29tcG9uZW50KHRoaXMucmdiYS5yKTtcblx0XHRjb25zdCBHID0gQ29sb3IuX3JlbGF0aXZlTHVtaW5hbmNlRm9yQ29tcG9uZW50KHRoaXMucmdiYS5nKTtcblx0XHRjb25zdCBCID0gQ29sb3IuX3JlbGF0aXZlTHVtaW5hbmNlRm9yQ29tcG9uZW50KHRoaXMucmdiYS5iKTtcblx0XHRjb25zdCBsdW1pbmFuY2UgPSAwLjIxMjYgKiBSICsgMC43MTUyICogRyArIDAuMDcyMiAqIEI7XG5cblx0XHRyZXR1cm4gcm91bmRGbG9hdChsdW1pbmFuY2UsIDQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZHVjZXMgdGhlIFwiZm9yZWdyb3VuZFwiIGNvbG9yIG9uIHRoaXMgXCJiYWNrZ3JvdW5kXCIgY29sb3IgdW50aSBpdCBpc1xuXHQgKiBiZWxvdyB0aGUgcmVsYXRpdmUgbHVtaW5hY2UgcmF0aW8uXG5cdCAqIEByZXR1cm5zIHRoZSBuZXcgZm9yZWdyb3VuZCBjb2xvclxuXHQgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS94dGVybWpzL3h0ZXJtLmpzL2Jsb2IvNDRmOWZhMzlhZTAzZTJjYTZkMjgzNTRkODhhMzk5NjA4Njg2NzcwZS9zcmMvY29tbW9uL0NvbG9yLnRzI0wzMTVcblx0ICovXG5cdHJlZHVjZVJlbGF0aXZlTHVtaW5hY2UoZm9yZWdyb3VuZDogQ29sb3IsIHJhdGlvOiBudW1iZXIpOiBDb2xvciB7XG5cdFx0Ly8gVGhpcyBpcyBhIG5haXZlIGJ1dCBmYXN0IGFwcHJvYWNoIHRvIHJlZHVjaW5nIGx1bWluYW5jZSBhcyBjb252ZXJ0aW5nIHRvXG5cdFx0Ly8gSFNMIGFuZCBiYWNrIGlzIGV4cGVuc2l2ZVxuXHRcdGxldCB7IHI6IGZnUiwgZzogZmdHLCBiOiBmZ0IgfSA9IGZvcmVncm91bmQucmdiYTtcblxuXHRcdGxldCBjciA9IHRoaXMuZ2V0Q29udHJhc3RSYXRpbyhmb3JlZ3JvdW5kKTtcblx0XHR3aGlsZSAoY3IgPCByYXRpbyAmJiAoZmdSID4gMCB8fCBmZ0cgPiAwIHx8IGZnQiA+IDApKSB7XG5cdFx0XHQvLyBSZWR1Y2UgYnkgMTAlIHVudGlsIHRoZSByYXRpbyBpcyBoaXRcblx0XHRcdGZnUiAtPSBNYXRoLm1heCgwLCBNYXRoLmNlaWwoZmdSICogMC4xKSk7XG5cdFx0XHRmZ0cgLT0gTWF0aC5tYXgoMCwgTWF0aC5jZWlsKGZnRyAqIDAuMSkpO1xuXHRcdFx0ZmdCIC09IE1hdGgubWF4KDAsIE1hdGguY2VpbChmZ0IgKiAwLjEpKTtcblx0XHRcdGNyID0gdGhpcy5nZXRDb250cmFzdFJhdGlvKG5ldyBDb2xvcihuZXcgUkdCQShmZ1IsIGZnRywgZmdCKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoZmdSLCBmZ0csIGZnQikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluY3JlYXNlcyB0aGUgXCJmb3JlZ3JvdW5kXCIgY29sb3Igb24gdGhpcyBcImJhY2tncm91bmRcIiBjb2xvciB1bnRpIGl0IGlzXG5cdCAqIGJlbG93IHRoZSByZWxhdGl2ZSBsdW1pbmFjZSByYXRpby5cblx0ICogQHJldHVybnMgdGhlIG5ldyBmb3JlZ3JvdW5kIGNvbG9yXG5cdCAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3h0ZXJtanMveHRlcm0uanMvYmxvYi80NGY5ZmEzOWFlMDNlMmNhNmQyODM1NGQ4OGEzOTk2MDg2ODY3NzBlL3NyYy9jb21tb24vQ29sb3IudHMjTDMzNVxuXHQgKi9cblx0aW5jcmVhc2VSZWxhdGl2ZUx1bWluYWNlKGZvcmVncm91bmQ6IENvbG9yLCByYXRpbzogbnVtYmVyKTogQ29sb3Ige1xuXHRcdC8vIFRoaXMgaXMgYSBuYWl2ZSBidXQgZmFzdCBhcHByb2FjaCB0byByZWR1Y2luZyBsdW1pbmFuY2UgYXMgY29udmVydGluZyB0b1xuXHRcdC8vIEhTTCBhbmQgYmFjayBpcyBleHBlbnNpdmVcblx0XHRsZXQgeyByOiBmZ1IsIGc6IGZnRywgYjogZmdCIH0gPSBmb3JlZ3JvdW5kLnJnYmE7XG5cdFx0bGV0IGNyID0gdGhpcy5nZXRDb250cmFzdFJhdGlvKGZvcmVncm91bmQpO1xuXHRcdHdoaWxlIChjciA8IHJhdGlvICYmIChmZ1IgPCAweEZGIHx8IGZnRyA8IDB4RkYgfHwgZmdCIDwgMHhGRikpIHtcblx0XHRcdGZnUiA9IE1hdGgubWluKDB4RkYsIGZnUiArIE1hdGguY2VpbCgoMjU1IC0gZmdSKSAqIDAuMSkpO1xuXHRcdFx0ZmdHID0gTWF0aC5taW4oMHhGRiwgZmdHICsgTWF0aC5jZWlsKCgyNTUgLSBmZ0cpICogMC4xKSk7XG5cdFx0XHRmZ0IgPSBNYXRoLm1pbigweEZGLCBmZ0IgKyBNYXRoLmNlaWwoKDI1NSAtIGZnQikgKiAwLjEpKTtcblx0XHRcdGNyID0gdGhpcy5nZXRDb250cmFzdFJhdGlvKG5ldyBDb2xvcihuZXcgUkdCQShmZ1IsIGZnRywgZmdCKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoZmdSLCBmZ0csIGZnQikpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlbGF0aXZlTHVtaW5hbmNlRm9yQ29tcG9uZW50KGNvbG9yOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGMgPSBjb2xvciAvIDI1NTtcblx0XHRyZXR1cm4gKGMgPD0gMC4wMzkyOCkgPyBjIC8gMTIuOTIgOiBNYXRoLnBvdygoKGMgKyAwLjA1NSkgLyAxLjA1NSksIDIuNCk7XG5cdH1cblxuXHQvKipcblx0ICogaHR0cDovL3d3dy53My5vcmcvVFIvV0NBRzIwLyNjb250cmFzdC1yYXRpb2RlZlxuXHQgKiBSZXR1cm5zIHRoZSBjb250cmFzdCByYXRpb24gbnVtYmVyIGluIHRoZSBzZXQgWzEsIDIxXS5cblx0ICovXG5cdGdldENvbnRyYXN0UmF0aW8oYW5vdGhlcjogQ29sb3IpOiBudW1iZXIge1xuXHRcdGNvbnN0IGx1bTEgPSB0aGlzLmdldFJlbGF0aXZlTHVtaW5hbmNlKCk7XG5cdFx0Y29uc3QgbHVtMiA9IGFub3RoZXIuZ2V0UmVsYXRpdmVMdW1pbmFuY2UoKTtcblx0XHRyZXR1cm4gbHVtMSA+IGx1bTIgPyAobHVtMSArIDAuMDUpIC8gKGx1bTIgKyAwLjA1KSA6IChsdW0yICsgMC4wNSkgLyAobHVtMSArIDAuMDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqXHRodHRwOi8vMjR3YXlzLm9yZy8yMDEwL2NhbGN1bGF0aW5nLWNvbG9yLWNvbnRyYXN0XG5cdCAqICBSZXR1cm4gJ3RydWUnIGlmIGRhcmtlciBjb2xvciBvdGhlcndpc2UgJ2ZhbHNlJ1xuXHQgKi9cblx0aXNEYXJrZXIoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgeWlxID0gKHRoaXMucmdiYS5yICogMjk5ICsgdGhpcy5yZ2JhLmcgKiA1ODcgKyB0aGlzLnJnYmEuYiAqIDExNCkgLyAxMDAwO1xuXHRcdHJldHVybiB5aXEgPCAxMjg7XG5cdH1cblxuXHQvKipcblx0ICpcdGh0dHA6Ly8yNHdheXMub3JnLzIwMTAvY2FsY3VsYXRpbmctY29sb3ItY29udHJhc3Rcblx0ICogIFJldHVybiAndHJ1ZScgaWYgbGlnaHRlciBjb2xvciBvdGhlcndpc2UgJ2ZhbHNlJ1xuXHQgKi9cblx0aXNMaWdodGVyKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHlpcSA9ICh0aGlzLnJnYmEuciAqIDI5OSArIHRoaXMucmdiYS5nICogNTg3ICsgdGhpcy5yZ2JhLmIgKiAxMTQpIC8gMTAwMDtcblx0XHRyZXR1cm4geWlxID49IDEyODtcblx0fVxuXG5cdGlzTGlnaHRlclRoYW4oYW5vdGhlcjogQ29sb3IpOiBib29sZWFuIHtcblx0XHRjb25zdCBsdW0xID0gdGhpcy5nZXRSZWxhdGl2ZUx1bWluYW5jZSgpO1xuXHRcdGNvbnN0IGx1bTIgPSBhbm90aGVyLmdldFJlbGF0aXZlTHVtaW5hbmNlKCk7XG5cdFx0cmV0dXJuIGx1bTEgPiBsdW0yO1xuXHR9XG5cblx0aXNEYXJrZXJUaGFuKGFub3RoZXI6IENvbG9yKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbHVtMSA9IHRoaXMuZ2V0UmVsYXRpdmVMdW1pbmFuY2UoKTtcblx0XHRjb25zdCBsdW0yID0gYW5vdGhlci5nZXRSZWxhdGl2ZUx1bWluYW5jZSgpO1xuXHRcdHJldHVybiBsdW0xIDwgbHVtMjtcblx0fVxuXG5cdC8qKlxuXHQgKiBCYXNlZCBvbiB4dGVybS5qczogaHR0cHM6Ly9naXRodWIuY29tL3h0ZXJtanMveHRlcm0uanMvYmxvYi80NGY5ZmEzOWFlMDNlMmNhNmQyODM1NGQ4OGEzOTk2MDg2ODY3NzBlL3NyYy9jb21tb24vQ29sb3IudHMjTDI4OFxuXHQgKlxuXHQgKiBHaXZlbiBhIGZvcmVncm91bmQgY29sb3IgYW5kIGEgYmFja2dyb3VuZCBjb2xvciwgZWl0aGVyIGluY3JlYXNlIG9yIHJlZHVjZSB0aGUgbHVtaW5hbmNlIG9mIHRoZVxuXHQgKiBmb3JlZ3JvdW5kIGNvbG9yIHVudGlsIHRoZSBzcGVjaWZpZWQgY29udHJhc3QgcmF0aW8gaXMgbWV0LiBJZiBwdXJlIHdoaXRlIG9yIGJsYWNrIGlzIGhpdFxuXHQgKiB3aXRob3V0IHRoZSBjb250cmFzdCByYXRpbyBiZWluZyBtZXQsIGdvIHRoZSBvdGhlciBkaXJlY3Rpb24gdXNpbmcgdGhlIGJhY2tncm91bmQgY29sb3IgYXMgdGhlXG5cdCAqIGZvcmVncm91bmQgY29sb3IgYW5kIHRha2UgZWl0aGVyIHRoZSBmaXJzdCBvciBzZWNvbmQgcmVzdWx0IGRlcGVuZGluZyBvbiB3aGljaCBoYXMgdGhlIGhpZ2hlclxuXHQgKiBjb250cmFzdCByYXRpby5cblx0ICpcblx0ICogQHBhcmFtIGZvcmVncm91bmQgVGhlIGZvcmVncm91bmQgY29sb3IuXG5cdCAqIEBwYXJhbSByYXRpbyBUaGUgY29udHJhc3QgcmF0aW8gdG8gYWNoaWV2ZS5cblx0ICogQHJldHVybnMgVGhlIGFkanVzdGVkIGZvcmVncm91bmQgY29sb3IuXG5cdCAqL1xuXHRlbnN1cmVDb25zdHJhc3QoZm9yZWdyb3VuZDogQ29sb3IsIHJhdGlvOiBudW1iZXIpOiBDb2xvciB7XG5cdFx0Y29uc3QgYmdMID0gdGhpcy5nZXRSZWxhdGl2ZUx1bWluYW5jZSgpO1xuXHRcdGNvbnN0IGZnTCA9IGZvcmVncm91bmQuZ2V0UmVsYXRpdmVMdW1pbmFuY2UoKTtcblx0XHRjb25zdCBjciA9IHRoaXMuZ2V0Q29udHJhc3RSYXRpbyhmb3JlZ3JvdW5kKTtcblx0XHRpZiAoY3IgPCByYXRpbykge1xuXHRcdFx0aWYgKGZnTCA8IGJnTCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHRBID0gdGhpcy5yZWR1Y2VSZWxhdGl2ZUx1bWluYWNlKGZvcmVncm91bmQsIHJhdGlvKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0QVJhdGlvID0gdGhpcy5nZXRDb250cmFzdFJhdGlvKHJlc3VsdEEpO1xuXHRcdFx0XHRpZiAocmVzdWx0QVJhdGlvIDwgcmF0aW8pIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHRCID0gdGhpcy5pbmNyZWFzZVJlbGF0aXZlTHVtaW5hY2UoZm9yZWdyb3VuZCwgcmF0aW8pO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdEJSYXRpbyA9IHRoaXMuZ2V0Q29udHJhc3RSYXRpbyhyZXN1bHRCKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0QVJhdGlvID4gcmVzdWx0QlJhdGlvID8gcmVzdWx0QSA6IHJlc3VsdEI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdEE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHRBID0gdGhpcy5pbmNyZWFzZVJlbGF0aXZlTHVtaW5hY2UoZm9yZWdyb3VuZCwgcmF0aW8pO1xuXHRcdFx0Y29uc3QgcmVzdWx0QVJhdGlvID0gdGhpcy5nZXRDb250cmFzdFJhdGlvKHJlc3VsdEEpO1xuXHRcdFx0aWYgKHJlc3VsdEFSYXRpbyA8IHJhdGlvKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdEIgPSB0aGlzLnJlZHVjZVJlbGF0aXZlTHVtaW5hY2UoZm9yZWdyb3VuZCwgcmF0aW8pO1xuXHRcdFx0XHRjb25zdCByZXN1bHRCUmF0aW8gPSB0aGlzLmdldENvbnRyYXN0UmF0aW8ocmVzdWx0Qik7XG5cdFx0XHRcdHJldHVybiByZXN1bHRBUmF0aW8gPiByZXN1bHRCUmF0aW8gPyByZXN1bHRBIDogcmVzdWx0Qjtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHRBO1xuXHRcdH1cblxuXHRcdHJldHVybiBmb3JlZ3JvdW5kO1xuXHR9XG5cblx0bGlnaHRlbihmYWN0b3I6IG51bWJlcik6IENvbG9yIHtcblx0XHRyZXR1cm4gbmV3IENvbG9yKG5ldyBIU0xBKHRoaXMuaHNsYS5oLCB0aGlzLmhzbGEucywgdGhpcy5oc2xhLmwgKyB0aGlzLmhzbGEubCAqIGZhY3RvciwgdGhpcy5oc2xhLmEpKTtcblx0fVxuXG5cdGRhcmtlbihmYWN0b3I6IG51bWJlcik6IENvbG9yIHtcblx0XHRyZXR1cm4gbmV3IENvbG9yKG5ldyBIU0xBKHRoaXMuaHNsYS5oLCB0aGlzLmhzbGEucywgdGhpcy5oc2xhLmwgLSB0aGlzLmhzbGEubCAqIGZhY3RvciwgdGhpcy5oc2xhLmEpKTtcblx0fVxuXG5cdHRyYW5zcGFyZW50KGZhY3RvcjogbnVtYmVyKTogQ29sb3Ige1xuXHRcdGNvbnN0IHsgciwgZywgYiwgYSB9ID0gdGhpcy5yZ2JhO1xuXHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEociwgZywgYiwgYSAqIGZhY3RvcikpO1xuXHR9XG5cblx0aXNUcmFuc3BhcmVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZ2JhLmEgPT09IDA7XG5cdH1cblxuXHRpc09wYXF1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZ2JhLmEgPT09IDE7XG5cdH1cblxuXHRvcHBvc2l0ZSgpOiBDb2xvciB7XG5cdFx0cmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUgLSB0aGlzLnJnYmEuciwgMjU1IC0gdGhpcy5yZ2JhLmcsIDI1NSAtIHRoaXMucmdiYS5iLCB0aGlzLnJnYmEuYSkpO1xuXHR9XG5cblx0YmxlbmQoYzogQ29sb3IpOiBDb2xvciB7XG5cdFx0Y29uc3QgcmdiYSA9IGMucmdiYTtcblxuXHRcdC8vIENvbnZlcnQgdG8gMC4uMSBvcGFjaXR5XG5cdFx0Y29uc3QgdGhpc0EgPSB0aGlzLnJnYmEuYTtcblx0XHRjb25zdCBjb2xvckEgPSByZ2JhLmE7XG5cblx0XHRjb25zdCBhID0gdGhpc0EgKyBjb2xvckEgKiAoMSAtIHRoaXNBKTtcblx0XHRpZiAoYSA8IDFlLTYpIHtcblx0XHRcdHJldHVybiBDb2xvci50cmFuc3BhcmVudDtcblx0XHR9XG5cblx0XHRjb25zdCByID0gdGhpcy5yZ2JhLnIgKiB0aGlzQSAvIGEgKyByZ2JhLnIgKiBjb2xvckEgKiAoMSAtIHRoaXNBKSAvIGE7XG5cdFx0Y29uc3QgZyA9IHRoaXMucmdiYS5nICogdGhpc0EgLyBhICsgcmdiYS5nICogY29sb3JBICogKDEgLSB0aGlzQSkgLyBhO1xuXHRcdGNvbnN0IGIgPSB0aGlzLnJnYmEuYiAqIHRoaXNBIC8gYSArIHJnYmEuYiAqIGNvbG9yQSAqICgxIC0gdGhpc0EpIC8gYTtcblxuXHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEociwgZywgYiwgYSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1peGVzIHRoZSBjdXJyZW50IGNvbG9yIHdpdGggdGhlIHByb3ZpZGVkIGNvbG9yIGJhc2VkIG9uIHRoZSBnaXZlbiBmYWN0b3IuXG5cdCAqIEBwYXJhbSBjb2xvciBUaGUgY29sb3IgdG8gbWl4IHdpdGhcblx0ICogQHBhcmFtIGZhY3RvciBUaGUgZmFjdG9yIG9mIG1peGluZyAoMCBtZWFucyB0aGlzIGNvbG9yLCAxIG1lYW5zIHRoZSBpbnB1dCBjb2xvciwgMC41IG1lYW5zIGVxdWFsIG1peClcblx0ICogQHJldHVybnMgQSBuZXcgY29sb3IgcmVwcmVzZW50aW5nIHRoZSBtaXhcblx0ICovXG5cdG1peChjb2xvcjogQ29sb3IsIGZhY3RvcjogbnVtYmVyID0gMC41KTogQ29sb3Ige1xuXHRcdGNvbnN0IG5vcm1hbGl6ZSA9IE1hdGgubWluKE1hdGgubWF4KGZhY3RvciwgMCksIDEpO1xuXHRcdGNvbnN0IHRoaXNSR0JBID0gdGhpcy5yZ2JhO1xuXHRcdGNvbnN0IG90aGVyUkdCQSA9IGNvbG9yLnJnYmE7XG5cblx0XHRjb25zdCByID0gdGhpc1JHQkEuciArIChvdGhlclJHQkEuciAtIHRoaXNSR0JBLnIpICogbm9ybWFsaXplO1xuXHRcdGNvbnN0IGcgPSB0aGlzUkdCQS5nICsgKG90aGVyUkdCQS5nIC0gdGhpc1JHQkEuZykgKiBub3JtYWxpemU7XG5cdFx0Y29uc3QgYiA9IHRoaXNSR0JBLmIgKyAob3RoZXJSR0JBLmIgLSB0aGlzUkdCQS5iKSAqIG5vcm1hbGl6ZTtcblx0XHRjb25zdCBhID0gdGhpc1JHQkEuYSArIChvdGhlclJHQkEuYSAtIHRoaXNSR0JBLmEpICogbm9ybWFsaXplO1xuXG5cdFx0cmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQShyLCBnLCBiLCBhKSk7XG5cdH1cblxuXHRtYWtlT3BhcXVlKG9wYXF1ZUJhY2tncm91bmQ6IENvbG9yKTogQ29sb3Ige1xuXHRcdGlmICh0aGlzLmlzT3BhcXVlKCkgfHwgb3BhcXVlQmFja2dyb3VuZC5yZ2JhLmEgIT09IDEpIHtcblx0XHRcdC8vIG9ubHkgYWxsb3cgdG8gYmxlbmQgb250byBhIG5vbi1vcGFxdWUgY29sb3Igb250byBhIG9wYXF1ZSBjb2xvclxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByLCBnLCBiLCBhIH0gPSB0aGlzLnJnYmE7XG5cblx0XHQvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMjIyODU0OC9maW5kaW5nLWVxdWl2YWxlbnQtY29sb3Itd2l0aC1vcGFjaXR5XG5cdFx0cmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQShcblx0XHRcdG9wYXF1ZUJhY2tncm91bmQucmdiYS5yIC0gYSAqIChvcGFxdWVCYWNrZ3JvdW5kLnJnYmEuciAtIHIpLFxuXHRcdFx0b3BhcXVlQmFja2dyb3VuZC5yZ2JhLmcgLSBhICogKG9wYXF1ZUJhY2tncm91bmQucmdiYS5nIC0gZyksXG5cdFx0XHRvcGFxdWVCYWNrZ3JvdW5kLnJnYmEuYiAtIGEgKiAob3BhcXVlQmFja2dyb3VuZC5yZ2JhLmIgLSBiKSxcblx0XHRcdDFcblx0XHQpKTtcblx0fVxuXG5cdGZsYXR0ZW4oLi4uYmFja2dyb3VuZHM6IENvbG9yW10pOiBDb2xvciB7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IGJhY2tncm91bmRzLnJlZHVjZVJpZ2h0KChhY2N1bXVsYXRvciwgY29sb3IpID0+IHtcblx0XHRcdHJldHVybiBDb2xvci5fZmxhdHRlbihjb2xvciwgYWNjdW11bGF0b3IpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBDb2xvci5fZmxhdHRlbih0aGlzLCBiYWNrZ3JvdW5kKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9mbGF0dGVuKGZvcmVncm91bmQ6IENvbG9yLCBiYWNrZ3JvdW5kOiBDb2xvcikge1xuXHRcdGNvbnN0IGJhY2tncm91bmRBbHBoYSA9IDEgLSBmb3JlZ3JvdW5kLnJnYmEuYTtcblx0XHRyZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKFxuXHRcdFx0YmFja2dyb3VuZEFscGhhICogYmFja2dyb3VuZC5yZ2JhLnIgKyBmb3JlZ3JvdW5kLnJnYmEuYSAqIGZvcmVncm91bmQucmdiYS5yLFxuXHRcdFx0YmFja2dyb3VuZEFscGhhICogYmFja2dyb3VuZC5yZ2JhLmcgKyBmb3JlZ3JvdW5kLnJnYmEuYSAqIGZvcmVncm91bmQucmdiYS5nLFxuXHRcdFx0YmFja2dyb3VuZEFscGhhICogYmFja2dyb3VuZC5yZ2JhLmIgKyBmb3JlZ3JvdW5kLnJnYmEuYSAqIGZvcmVncm91bmQucmdiYS5iXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIF90b1N0cmluZz86IHN0cmluZztcblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX3RvU3RyaW5nKSB7XG5cdFx0XHR0aGlzLl90b1N0cmluZyA9IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0KHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdG9TdHJpbmc7XG5cdH1cblxuXHRwcml2YXRlIF90b051bWJlcjMyQml0PzogbnVtYmVyO1xuXHR0b051bWJlcjMyQml0KCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl90b051bWJlcjMyQml0KSB7XG5cdFx0XHR0aGlzLl90b051bWJlcjMyQml0ID0gKFxuXHRcdFx0XHR0aGlzLnJnYmEuciAvKiAgKi8gPDwgMjQgfFxuXHRcdFx0XHR0aGlzLnJnYmEuZyAvKiAgKi8gPDwgMTYgfFxuXHRcdFx0XHR0aGlzLnJnYmEuYiAvKiAgKi8gPDwgOCB8XG5cdFx0XHRcdHRoaXMucmdiYS5hICogMHhGRiA8PCAwXG5cdFx0XHQpID4+PiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdG9OdW1iZXIzMkJpdDtcblx0fVxuXG5cdHN0YXRpYyBnZXRMaWdodGVyQ29sb3Iob2Y6IENvbG9yLCByZWxhdGl2ZTogQ29sb3IsIGZhY3Rvcj86IG51bWJlcik6IENvbG9yIHtcblx0XHRpZiAob2YuaXNMaWdodGVyVGhhbihyZWxhdGl2ZSkpIHtcblx0XHRcdHJldHVybiBvZjtcblx0XHR9XG5cdFx0ZmFjdG9yID0gZmFjdG9yID8gZmFjdG9yIDogMC41O1xuXHRcdGNvbnN0IGx1bTEgPSBvZi5nZXRSZWxhdGl2ZUx1bWluYW5jZSgpO1xuXHRcdGNvbnN0IGx1bTIgPSByZWxhdGl2ZS5nZXRSZWxhdGl2ZUx1bWluYW5jZSgpO1xuXHRcdGZhY3RvciA9IGZhY3RvciAqIChsdW0yIC0gbHVtMSkgLyBsdW0yO1xuXHRcdHJldHVybiBvZi5saWdodGVuKGZhY3Rvcik7XG5cdH1cblxuXHRzdGF0aWMgZ2V0RGFya2VyQ29sb3Iob2Y6IENvbG9yLCByZWxhdGl2ZTogQ29sb3IsIGZhY3Rvcj86IG51bWJlcik6IENvbG9yIHtcblx0XHRpZiAob2YuaXNEYXJrZXJUaGFuKHJlbGF0aXZlKSkge1xuXHRcdFx0cmV0dXJuIG9mO1xuXHRcdH1cblx0XHRmYWN0b3IgPSBmYWN0b3IgPyBmYWN0b3IgOiAwLjU7XG5cdFx0Y29uc3QgbHVtMSA9IG9mLmdldFJlbGF0aXZlTHVtaW5hbmNlKCk7XG5cdFx0Y29uc3QgbHVtMiA9IHJlbGF0aXZlLmdldFJlbGF0aXZlTHVtaW5hbmNlKCk7XG5cdFx0ZmFjdG9yID0gZmFjdG9yICogKGx1bTEgLSBsdW0yKSAvIGx1bTE7XG5cdFx0cmV0dXJuIG9mLmRhcmtlbihmYWN0b3IpO1xuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IHdoaXRlID0gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjU1LCAyNTUsIDEpKTtcblx0c3RhdGljIHJlYWRvbmx5IGJsYWNrID0gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDAsIDEpKTtcblx0c3RhdGljIHJlYWRvbmx5IHJlZCA9IG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDAsIDAsIDEpKTtcblx0c3RhdGljIHJlYWRvbmx5IGJsdWUgPSBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMCwgMjU1LCAxKSk7XG5cdHN0YXRpYyByZWFkb25seSBncmVlbiA9IG5ldyBDb2xvcihuZXcgUkdCQSgwLCAyNTUsIDAsIDEpKTtcblx0c3RhdGljIHJlYWRvbmx5IGN5YW4gPSBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMjU1LCAyNTUsIDEpKTtcblx0c3RhdGljIHJlYWRvbmx5IGxpZ2h0Z3JleSA9IG5ldyBDb2xvcihuZXcgUkdCQSgyMTEsIDIxMSwgMjExLCAxKSk7XG5cdHN0YXRpYyByZWFkb25seSB0cmFuc3BhcmVudCA9IG5ldyBDb2xvcihuZXcgUkdCQSgwLCAwLCAwLCAwKSk7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29sb3Ige1xuXHRleHBvcnQgbmFtZXNwYWNlIEZvcm1hdCB7XG5cdFx0ZXhwb3J0IG5hbWVzcGFjZSBDU1Mge1xuXG5cdFx0XHRleHBvcnQgZnVuY3Rpb24gZm9ybWF0UkdCKGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cdFx0XHRcdGlmIChjb2xvci5yZ2JhLmEgPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gYHJnYigke2NvbG9yLnJnYmEucn0sICR7Y29sb3IucmdiYS5nfSwgJHtjb2xvci5yZ2JhLmJ9KWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRSR0JBKGNvbG9yKTtcblx0XHRcdH1cblxuXHRcdFx0ZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFJHQkEoY29sb3I6IENvbG9yKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIGByZ2JhKCR7Y29sb3IucmdiYS5yfSwgJHtjb2xvci5yZ2JhLmd9LCAke2NvbG9yLnJnYmEuYn0sICR7Kyhjb2xvci5yZ2JhLmEpLnRvRml4ZWQoMil9KWA7XG5cdFx0XHR9XG5cblx0XHRcdGV4cG9ydCBmdW5jdGlvbiBmb3JtYXRIU0woY29sb3I6IENvbG9yKTogc3RyaW5nIHtcblx0XHRcdFx0aWYgKGNvbG9yLmhzbGEuYSA9PT0gMSkge1xuXHRcdFx0XHRcdHJldHVybiBgaHNsKCR7Y29sb3IuaHNsYS5ofSwgJHtNYXRoLnJvdW5kKGNvbG9yLmhzbGEucyAqIDEwMCl9JSwgJHtNYXRoLnJvdW5kKGNvbG9yLmhzbGEubCAqIDEwMCl9JSlgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SFNMQShjb2xvcik7XG5cdFx0XHR9XG5cblx0XHRcdGV4cG9ydCBmdW5jdGlvbiBmb3JtYXRIU0xBKGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBgaHNsYSgke2NvbG9yLmhzbGEuaH0sICR7TWF0aC5yb3VuZChjb2xvci5oc2xhLnMgKiAxMDApfSUsICR7TWF0aC5yb3VuZChjb2xvci5oc2xhLmwgKiAxMDApfSUsICR7Y29sb3IuaHNsYS5hLnRvRml4ZWQoMil9KWA7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIF90b1R3b0RpZ2l0SGV4KG46IG51bWJlcik6IHN0cmluZyB7XG5cdFx0XHRcdGNvbnN0IHIgPSBuLnRvU3RyaW5nKDE2KTtcblx0XHRcdFx0cmV0dXJuIHIubGVuZ3RoICE9PSAyID8gJzAnICsgciA6IHI7XG5cdFx0XHR9XG5cblx0XHRcdC8qKlxuXHRcdFx0ICogRm9ybWF0cyB0aGUgY29sb3IgYXMgI1JSR0dCQlxuXHRcdFx0ICovXG5cdFx0XHRleHBvcnQgZnVuY3Rpb24gZm9ybWF0SGV4KGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBgIyR7X3RvVHdvRGlnaXRIZXgoY29sb3IucmdiYS5yKX0ke190b1R3b0RpZ2l0SGV4KGNvbG9yLnJnYmEuZyl9JHtfdG9Ud29EaWdpdEhleChjb2xvci5yZ2JhLmIpfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8qKlxuXHRcdFx0ICogRm9ybWF0cyB0aGUgY29sb3IgYXMgI1JSR0dCQkFBXG5cdFx0XHQgKiBJZiAnY29tcGFjdCcgaXMgc2V0LCBjb2xvcnMgd2l0aG91dCB0cmFuc3BhcmFuY3kgd2lsbCBiZSBwcmludGVkIGFzICNSUkdHQkJcblx0XHRcdCAqL1xuXHRcdFx0ZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEhleEEoY29sb3I6IENvbG9yLCBjb21wYWN0ID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdFx0XHRpZiAoY29tcGFjdCAmJiBjb2xvci5yZ2JhLmEgPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgoY29sb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGAjJHtfdG9Ud29EaWdpdEhleChjb2xvci5yZ2JhLnIpfSR7X3RvVHdvRGlnaXRIZXgoY29sb3IucmdiYS5nKX0ke190b1R3b0RpZ2l0SGV4KGNvbG9yLnJnYmEuYil9JHtfdG9Ud29EaWdpdEhleChNYXRoLnJvdW5kKGNvbG9yLnJnYmEuYSAqIDI1NSkpfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8qKlxuXHRcdFx0ICogVGhlIGRlZmF1bHQgZm9ybWF0IHdpbGwgdXNlIEhFWCBpZiBvcGFxdWUgYW5kIFJHQkEgb3RoZXJ3aXNlLlxuXHRcdFx0ICovXG5cdFx0XHRleHBvcnQgZnVuY3Rpb24gZm9ybWF0KGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cdFx0XHRcdGlmIChjb2xvci5pc09wYXF1ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4KGNvbG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdFJHQkEoY29sb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvKipcblx0XHRcdCAqIFBhcnNlIGEgQ1NTIGNvbG9yIGFuZCByZXR1cm4gYSB7QGxpbmsgQ29sb3J9LlxuXHRcdFx0ICogQHBhcmFtIGNzcyBUaGUgQ1NTIGNvbG9yIHRvIHBhcnNlLlxuXHRcdFx0ICogQHNlZSBodHRwczovL2RyYWZ0cy5jc3N3Zy5vcmcvY3NzLWNvbG9yLyN0eXBlZGVmLWNvbG9yXG5cdFx0XHQgKi9cblx0XHRcdGV4cG9ydCBmdW5jdGlvbiBwYXJzZShjc3M6IHN0cmluZyk6IENvbG9yIHwgbnVsbCB7XG5cdFx0XHRcdGlmIChjc3MgPT09ICd0cmFuc3BhcmVudCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNzcy5zdGFydHNXaXRoKCcjJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFyc2VIZXgoY3NzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY3NzLnN0YXJ0c1dpdGgoJ3JnYmEoJykpIHtcblx0XHRcdFx0XHRjb25zdCBjb2xvciA9IGNzcy5tYXRjaCgvcmdiYVxcKCg/PHI+KD86XFwrfC0pP1xcZCspLCAqKD88Zz4oPzpcXCt8LSk/XFxkKyksICooPzxiPig/OlxcK3wtKT9cXGQrKSwgKig/PGE+KD86XFwrfC0pP1xcZCsoXFwuXFxkKyk/KVxcKS8pO1xuXHRcdFx0XHRcdGlmICghY29sb3IpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2xvciBmb3JtYXQgJyArIGNzcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHIgPSBwYXJzZUludChjb2xvci5ncm91cHM/LnIgPz8gJzAnKTtcblx0XHRcdFx0XHRjb25zdCBnID0gcGFyc2VJbnQoY29sb3IuZ3JvdXBzPy5nID8/ICcwJyk7XG5cdFx0XHRcdFx0Y29uc3QgYiA9IHBhcnNlSW50KGNvbG9yLmdyb3Vwcz8uYiA/PyAnMCcpO1xuXHRcdFx0XHRcdGNvbnN0IGEgPSBwYXJzZUZsb2F0KGNvbG9yLmdyb3Vwcz8uYSA/PyAnMCcpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEociwgZywgYiwgYSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjc3Muc3RhcnRzV2l0aCgncmdiKCcpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29sb3IgPSBjc3MubWF0Y2goL3JnYlxcKCg/PHI+KD86XFwrfC0pP1xcZCspLCAqKD88Zz4oPzpcXCt8LSk/XFxkKyksICooPzxiPig/OlxcK3wtKT9cXGQrKVxcKS8pO1xuXHRcdFx0XHRcdGlmICghY29sb3IpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2xvciBmb3JtYXQgJyArIGNzcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHIgPSBwYXJzZUludChjb2xvci5ncm91cHM/LnIgPz8gJzAnKTtcblx0XHRcdFx0XHRjb25zdCBnID0gcGFyc2VJbnQoY29sb3IuZ3JvdXBzPy5nID8/ICcwJyk7XG5cdFx0XHRcdFx0Y29uc3QgYiA9IHBhcnNlSW50KGNvbG9yLmdyb3Vwcz8uYiA/PyAnMCcpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEociwgZywgYikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRPRE86IFN1cHBvcnQgbW9yZSBmb3JtYXRzIGFzIG5lZWRlZFxuXHRcdFx0XHRyZXR1cm4gcGFyc2VOYW1lZEtleXdvcmQoY3NzKTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gcGFyc2VOYW1lZEtleXdvcmQoY3NzOiBzdHJpbmcpOiBDb2xvciB8IG51bGwge1xuXHRcdFx0XHQvLyBodHRwczovL2RyYWZ0cy5jc3N3Zy5vcmcvY3NzLWNvbG9yLyNuYW1lZC1jb2xvcnNcblx0XHRcdFx0c3dpdGNoIChjc3MpIHtcblx0XHRcdFx0XHRjYXNlICdhbGljZWJsdWUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI0MCwgMjQ4LCAyNTUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdhbnRpcXVld2hpdGUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1MCwgMjM1LCAyMTUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdhcXVhJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAyNTUsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2FxdWFtYXJpbmUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEyNywgMjU1LCAyMTIsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdhenVyZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjQwLCAyNTUsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2JlaWdlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNDUsIDI0NSwgMjIwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnYmlzcXVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDIyOCwgMTk2LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnYmxhY2snOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdibGFuY2hlZGFsbW9uZCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyMzUsIDIwNSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2JsdWUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2JsdWV2aW9sZXQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEzOCwgNDMsIDIyNiwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2Jyb3duJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNjUsIDQyLCA0MiwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2J1cmx5d29vZCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjIyLCAxODQsIDEzNSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2NhZGV0Ymx1ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoOTUsIDE1OCwgMTYwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnY2hhcnRyZXVzZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTI3LCAyNTUsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdjaG9jb2xhdGUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIxMCwgMTA1LCAzMCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2NvcmFsJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDEyNywgODAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdjb3JuZmxvd2VyYmx1ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTAwLCAxNDksIDIzNywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2Nvcm5zaWxrJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI0OCwgMjIwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnY3JpbXNvbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjIwLCAyMCwgNjAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdjeWFuJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAyNTUsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAwLCAxMzksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrY3lhbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMTM5LCAxMzksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrZ29sZGVucm9kJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxODQsIDEzNCwgMTEsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrZ3JheSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTY5LCAxNjksIDE2OSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMTAwLCAwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZGFya2dyZXknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE2OSwgMTY5LCAxNjksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJra2hha2knOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE4OSwgMTgzLCAxMDcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrbWFnZW50YSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTM5LCAwLCAxMzksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrb2xpdmVncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoODUsIDEwNywgNDcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrb3JhbmdlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDE0MCwgMCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtvcmNoaWQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE1MywgNTAsIDIwNCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtyZWQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEzOSwgMCwgMCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtzYWxtb24nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIzMywgMTUwLCAxMjIsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrc2VhZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE0MywgMTg4LCAxNDMsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrc2xhdGVibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSg3MiwgNjEsIDEzOSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RhcmtzbGF0ZWdyYXknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDQ3LCA3OSwgNzksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrc2xhdGVncmV5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSg0NywgNzksIDc5LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZGFya3R1cnF1b2lzZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMjA2LCAyMDksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkYXJrdmlvbGV0JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNDgsIDAsIDIxMSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RlZXBwaW5rJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDIwLCAxNDcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkZWVwc2t5Ymx1ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMTkxLCAyNTUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdkaW1ncmF5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMDUsIDEwNSwgMTA1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZGltZ3JleSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTA1LCAxMDUsIDEwNSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2RvZGdlcmJsdWUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDMwLCAxNDQsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2ZpcmVicmljayc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTc4LCAzNCwgMzQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdmbG9yYWx3aGl0ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyNTAsIDI0MCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2ZvcmVzdGdyZWVuJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgzNCwgMTM5LCAzNCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2Z1Y2hzaWEnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMCwgMjU1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZ2FpbnNib3JvJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyMjAsIDIyMCwgMjIwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZ2hvc3R3aGl0ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjQ4LCAyNDgsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2dvbGQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjE1LCAwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZ29sZGVucm9kJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyMTgsIDE2NSwgMzIsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdncmF5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMjgsIDEyOCwgMTI4LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDEyOCwgMCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2dyZWVueWVsbG93JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNzMsIDI1NSwgNDcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdncmV5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMjgsIDEyOCwgMTI4LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnaG9uZXlkZXcnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI0MCwgMjU1LCAyNDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdob3RwaW5rJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDEwNSwgMTgwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnaW5kaWFucmVkJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyMDUsIDkyLCA5MiwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2luZGlnbyc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoNzUsIDAsIDEzMCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2l2b3J5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI1NSwgMjQwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAna2hha2knOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI0MCwgMjMwLCAxNDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdsYXZlbmRlcic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjMwLCAyMzAsIDI1MCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xhdmVuZGVyYmx1c2gnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjQwLCAyNDUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdsYXduZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEyNCwgMjUyLCAwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGVtb25jaGlmZm9uJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI1MCwgMjA1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNzMsIDIxNiwgMjMwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRjb3JhbCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjQwLCAxMjgsIDEyOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0Y3lhbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjI0LCAyNTUsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0Z29sZGVucm9keWVsbG93JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTAsIDI1MCwgMjEwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRncmF5JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyMTEsIDIxMSwgMjExLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTQ0LCAyMzgsIDE0NCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0Z3JleSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjExLCAyMTEsIDIxMSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0cGluayc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAxODIsIDE5MywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0c2FsbW9uJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDE2MCwgMTIyLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRzZWFncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMzIsIDE3OCwgMTcwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRza3libHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMzUsIDIwNiwgMjUwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHRzbGF0ZWdyYXknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDExOSwgMTM2LCAxNTMsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdsaWdodHNsYXRlZ3JleSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTE5LCAxMzYsIDE1MywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ2xpZ2h0c3RlZWxibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNzYsIDE5NiwgMjIyLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGlnaHR5ZWxsb3cnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjU1LCAyMjQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdsaW1lJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAyNTUsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdsaW1lZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDUwLCAyMDUsIDUwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbGluZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1MCwgMjQwLCAyMzAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdtYWdlbnRhJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDAsIDI1NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21hcm9vbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTI4LCAwLCAwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWVkaXVtYXF1YW1hcmluZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTAyLCAyMDUsIDE3MCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21lZGl1bWJsdWUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDIwNSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21lZGl1bW9yY2hpZCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTg2LCA4NSwgMjExLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWVkaXVtcHVycGxlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNDcsIDExMiwgMjE5LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWVkaXVtc2VhZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDYwLCAxNzksIDExMywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21lZGl1bXNsYXRlYmx1ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTIzLCAxMDQsIDIzOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21lZGl1bXNwcmluZ2dyZWVuJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAyNTAsIDE1NCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ21lZGl1bXR1cnF1b2lzZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoNzIsIDIwOSwgMjA0LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWVkaXVtdmlvbGV0cmVkJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxOTksIDIxLCAxMzMsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdtaWRuaWdodGJsdWUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1LCAyNSwgMTEyLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWludGNyZWFtJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNDUsIDI1NSwgMjUwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbWlzdHlyb3NlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDIyOCwgMjI1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnbW9jY2FzaW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjI4LCAxODEsIDEpKTtcblx0XHRcdFx0XHRjYXNlICduYXZham93aGl0ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyMjIsIDE3MywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ25hdnknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDEyOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ29sZGxhY2UnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1MywgMjQ1LCAyMzAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdvbGl2ZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTI4LCAxMjgsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdvbGl2ZWRyYWInOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEwNywgMTQyLCAzNSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ29yYW5nZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAxNjUsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdvcmFuZ2VyZWQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgNjksIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdvcmNoaWQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIxOCwgMTEyLCAyMTQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdwYWxlZ29sZGVucm9kJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyMzgsIDIzMiwgMTcwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncGFsZWdyZWVuJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNTIsIDI1MSwgMTUyLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncGFsZXR1cnF1b2lzZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTc1LCAyMzgsIDIzOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3BhbGV2aW9sZXRyZWQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIxOSwgMTEyLCAxNDcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdwYXBheWF3aGlwJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDIzOSwgMjEzLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncGVhY2hwdWZmJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDIxOCwgMTg1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncGVydSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjA1LCAxMzMsIDYzLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncGluayc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAxOTIsIDIwMywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3BsdW0nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIyMSwgMTYwLCAyMjEsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdwb3dkZXJibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxNzYsIDIyNCwgMjMwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncHVycGxlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMjgsIDAsIDEyOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3JlYmVjY2FwdXJwbGUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDEwMiwgNTEsIDE1MywgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3JlZCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAwLCAwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncm9zeWJyb3duJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxODgsIDE0MywgMTQzLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAncm95YWxibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSg2NSwgMTA1LCAyMjUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzYWRkbGVicm93bic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTM5LCA2OSwgMTksIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzYWxtb24nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1MCwgMTI4LCAxMTQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzYW5keWJyb3duJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNDQsIDE2NCwgOTYsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzZWFncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoNDYsIDEzOSwgODcsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzZWFzaGVsbCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyNDUsIDIzOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3NpZW5uYSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTYwLCA4MiwgNDUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzaWx2ZXInOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE5MiwgMTkyLCAxOTIsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdza3libHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMzUsIDIwNiwgMjM1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnc2xhdGVibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgxMDYsIDkwLCAyMDUsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzbGF0ZWdyYXknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDExMiwgMTI4LCAxNDQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzbGF0ZWdyZXknOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDExMiwgMTI4LCAxNDQsIDEpKTtcblx0XHRcdFx0XHRjYXNlICdzbm93JzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI1MCwgMjUwLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnc3ByaW5nZ3JlZW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDAsIDI1NSwgMTI3LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnc3RlZWxibHVlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSg3MCwgMTMwLCAxODAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd0YW4nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIxMCwgMTgwLCAxNDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd0ZWFsJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgwLCAxMjgsIDEyOCwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3RoaXN0bGUnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIxNiwgMTkxLCAyMTYsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd0b21hdG8nOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgOTksIDcxLCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAndHVycXVvaXNlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSg2NCwgMjI0LCAyMDgsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd2aW9sZXQnOiByZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDIzOCwgMTMwLCAyMzgsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd3aGVhdCc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjQ1LCAyMjIsIDE3OSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3doaXRlJzogcmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI1NSwgMjU1LCAxKSk7XG5cdFx0XHRcdFx0Y2FzZSAnd2hpdGVzbW9rZSc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjQ1LCAyNDUsIDI0NSwgMSkpO1xuXHRcdFx0XHRcdGNhc2UgJ3llbGxvdyc6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAyNTUsIDAsIDEpKTtcblx0XHRcdFx0XHRjYXNlICd5ZWxsb3dncmVlbic6IHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTU0LCAyMDUsIDUwLCAxKSk7XG5cdFx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBDb252ZXJ0cyBhbiBIZXggY29sb3IgdmFsdWUgdG8gYSBDb2xvci5cblx0XHRcdCAqIHJldHVybnMgciwgZywgYW5kIGIgYXJlIGNvbnRhaW5lZCBpbiB0aGUgc2V0IFswLCAyNTVdXG5cdFx0XHQgKiBAcGFyYW0gaGV4IHN0cmluZyAoI1JHQiwgI1JHQkEsICNSUkdHQkIgb3IgI1JSR0dCQkFBKS5cblx0XHRcdCAqL1xuXHRcdFx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSGV4KGhleDogc3RyaW5nKTogQ29sb3IgfCBudWxsIHtcblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gaGV4Lmxlbmd0aDtcblxuXHRcdFx0XHRpZiAobGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gSW52YWxpZCBjb2xvclxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGhleC5jaGFyQ29kZUF0KDApICE9PSBDaGFyQ29kZS5IYXNoKSB7XG5cdFx0XHRcdFx0Ly8gRG9lcyBub3QgYmVnaW4gd2l0aCBhICNcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsZW5ndGggPT09IDcpIHtcblx0XHRcdFx0XHQvLyAjUlJHR0JCIGZvcm1hdFxuXHRcdFx0XHRcdGNvbnN0IHIgPSAxNiAqIF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDEpKSArIF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDIpKTtcblx0XHRcdFx0XHRjb25zdCBnID0gMTYgKiBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCgzKSkgKyBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCg0KSk7XG5cdFx0XHRcdFx0Y29uc3QgYiA9IDE2ICogX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoNSkpICsgX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoNikpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEociwgZywgYiwgMSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGxlbmd0aCA9PT0gOSkge1xuXHRcdFx0XHRcdC8vICNSUkdHQkJBQSBmb3JtYXRcblx0XHRcdFx0XHRjb25zdCByID0gMTYgKiBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCgxKSkgKyBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCgyKSk7XG5cdFx0XHRcdFx0Y29uc3QgZyA9IDE2ICogX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoMykpICsgX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoNCkpO1xuXHRcdFx0XHRcdGNvbnN0IGIgPSAxNiAqIF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDUpKSArIF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDYpKTtcblx0XHRcdFx0XHRjb25zdCBhID0gMTYgKiBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCg3KSkgKyBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCg4KSk7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBDb2xvcihuZXcgUkdCQShyLCBnLCBiLCBhIC8gMjU1KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobGVuZ3RoID09PSA0KSB7XG5cdFx0XHRcdFx0Ly8gI1JHQiBmb3JtYXRcblx0XHRcdFx0XHRjb25zdCByID0gX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoMSkpO1xuXHRcdFx0XHRcdGNvbnN0IGcgPSBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCgyKSk7XG5cdFx0XHRcdFx0Y29uc3QgYiA9IF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDMpKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IENvbG9yKG5ldyBSR0JBKDE2ICogciArIHIsIDE2ICogZyArIGcsIDE2ICogYiArIGIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsZW5ndGggPT09IDUpIHtcblx0XHRcdFx0XHQvLyAjUkdCQSBmb3JtYXRcblx0XHRcdFx0XHRjb25zdCByID0gX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoMSkpO1xuXHRcdFx0XHRcdGNvbnN0IGcgPSBfcGFyc2VIZXhEaWdpdChoZXguY2hhckNvZGVBdCgyKSk7XG5cdFx0XHRcdFx0Y29uc3QgYiA9IF9wYXJzZUhleERpZ2l0KGhleC5jaGFyQ29kZUF0KDMpKTtcblx0XHRcdFx0XHRjb25zdCBhID0gX3BhcnNlSGV4RGlnaXQoaGV4LmNoYXJDb2RlQXQoNCkpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ29sb3IobmV3IFJHQkEoMTYgKiByICsgciwgMTYgKiBnICsgZywgMTYgKiBiICsgYiwgKDE2ICogYSArIGEpIC8gMjU1KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbnZhbGlkIGNvbG9yXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBfcGFyc2VIZXhEaWdpdChjaGFyQ29kZTogQ2hhckNvZGUpOiBudW1iZXIge1xuXHRcdFx0XHRzd2l0Y2ggKGNoYXJDb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5EaWdpdDA6IHJldHVybiAwO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRGlnaXQxOiByZXR1cm4gMTtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkRpZ2l0MjogcmV0dXJuIDI7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5EaWdpdDM6IHJldHVybiAzO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRGlnaXQ0OiByZXR1cm4gNDtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkRpZ2l0NTogcmV0dXJuIDU7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5EaWdpdDY6IHJldHVybiA2O1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRGlnaXQ3OiByZXR1cm4gNztcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkRpZ2l0ODogcmV0dXJuIDg7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5EaWdpdDk6IHJldHVybiA5O1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuYTogcmV0dXJuIDEwO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuQTogcmV0dXJuIDEwO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuYjogcmV0dXJuIDExO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuQjogcmV0dXJuIDExO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuYzogcmV0dXJuIDEyO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuQzogcmV0dXJuIDEyO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuZDogcmV0dXJuIDEzO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRDogcmV0dXJuIDEzO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuZTogcmV0dXJuIDE0O1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRTogcmV0dXJuIDE0O1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuZjogcmV0dXJuIDE1O1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRjogcmV0dXJuIDE1O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxXQUFXLFFBQWdCLGVBQStCO0FBQ2xFLFFBQU0sVUFBVSxLQUFLLElBQUksSUFBSSxhQUFhO0FBQzFDLFNBQU8sS0FBSyxNQUFNLFNBQVMsT0FBTyxJQUFJO0FBQ3ZDO0FBRU8sTUFBTSxLQUFLO0FBQUEsRUF1QmpCLFlBQVks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S0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsVUFDMUQsS0FBSztBQUFXLG1CQUFPLElBQUlBLE9BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFVBQzNELEtBQUs7QUFBYSxtQkFBTyxJQUFJQSxPQUFNLElBQUksS0FBSyxLQUFLLElBQUksS0FBSyxDQUFDLENBQUM7QUFBQSxVQUM1RCxLQUFLO0FBQWEsbUJBQU8sSUFBSUEsT0FBTSxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsVUFDN0QsS0FBSztBQUFhLG1CQUFPLElBQUlBLE9BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFVBQzdELEtBQUs7QUFBUSxtQkFBTyxJQUFJQSxPQUFNLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxDQUFDLENBQUM7QUFBQSxVQUN4RCxLQUFLO0FBQWUsbUJBQU8sSUFBSUEsT0FBTSxJQUFJLEtBQUssR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsVUFDN0QsS0FBSztBQUFhLG1CQUFPLElBQUlBLE9BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFVBQzVELEtBQUs7QUFBTyxtQkFBTyxJQUFJQSxPQUFNLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxDQUFDLENBQUM7QUFBQSxVQUN2RCxLQUFLO0FBQVEsbUJBQU8sSUFBSUEsT0FBTSxJQUFJLEtBQUssR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsVUFDdEQsS0FBSztBQUFXLG1CQUFPLElBQUlBLE9BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFVBQzNELEtBQUs7QUFBVSxtQkFBTyxJQUFJQSxPQUFNLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDLENBQUM7QUFBQSxVQUN4RCxLQUFLO0FBQWEsbUJBQU8sSUFBSUEsT0FBTSxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFD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
