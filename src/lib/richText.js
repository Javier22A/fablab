const INLINE_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "SPAN", "BR", "FONT"]);
const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "LI", "BLOCKQUOTE", "H3", "H4"]);
const FONT_FAMILIES = new Map([
  ["arial", "Arial"],
  ["georgia", "Georgia"],
  ["times new roman", '"Times New Roman"'],
  ["verdana", "Verdana"],
  ["manrope", "Manrope"],
  ["dm mono", '"DM Mono"'],
]);
const FONT_SIZES = new Map([
  ["1", "0.75rem"],
  ["2", "0.875rem"],
  ["3", "1rem"],
  ["4", "1.25rem"],
  ["5", "1.5rem"],
  ["6", "2rem"],
  ["7", "2.5rem"],
  ["x-small", "0.75rem"],
  ["small", "0.875rem"],
  ["medium", "1rem"],
  ["large", "1.25rem"],
  ["x-large", "1.5rem"],
  ["xx-large", "2rem"],
  ["xxx-large", "2.5rem"],
]);

function safeColor(value) {
  const color = value.trim();
  if (/^#[\da-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*[\d.%\s,]+\)$/i.test(color)) return color;
  return "";
}

function safeFontFamily(value) {
  const family = value.split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return FONT_FAMILIES.get(family) || "";
}

function safeFontSize(value) {
  const normalized = value.trim().toLowerCase();
  if (FONT_SIZES.has(normalized)) return FONT_SIZES.get(normalized);
  if (["0.75rem", "0.875rem", "1rem", "1.25rem", "1.5rem", "2rem", "2.5rem"].includes(normalized)) return normalized;
  return "";
}

function safeTextAlign(value) {
  const align = value.trim().toLowerCase();
  return ["left", "center", "right", "justify"].includes(align) ? align : "";
}

function safeFontWeight(value) {
  const weight = value.trim().toLowerCase();
  return ["normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(weight) ? weight : "";
}

function safeFontStyle(value) {
  const style = value.trim().toLowerCase();
  return ["normal", "italic", "oblique"].includes(style) ? style : "";
}

function safeTextDecoration(value) {
  const decoration = value.trim().toLowerCase();
  return ["none", "underline", "line-through", "underline line-through"].includes(decoration) ? decoration : "";
}

function safeStyles(element) {
  const styles = {};
  const style = element.getAttribute("style");
  if (style) {
    const parsed = document.createElement("span");
    parsed.setAttribute("style", style);
    const color = safeColor(parsed.style.color);
    const fontFamily = safeFontFamily(parsed.style.fontFamily);
    const fontSize = safeFontSize(parsed.style.fontSize);
    const textAlign = safeTextAlign(parsed.style.textAlign);
    const fontWeight = safeFontWeight(parsed.style.fontWeight);
    const fontStyle = safeFontStyle(parsed.style.fontStyle);
    const textDecoration = safeTextDecoration(parsed.style.textDecoration);
    if (color) styles.color = color;
    if (fontFamily) styles.fontFamily = fontFamily;
    if (fontSize) styles.fontSize = fontSize;
    if (textAlign) styles.textAlign = textAlign;
    if (fontWeight) styles.fontWeight = fontWeight;
    if (fontStyle) styles.fontStyle = fontStyle;
    if (textDecoration) styles.textDecoration = textDecoration;
  }

  if (element.tagName === "FONT") {
    const color = safeColor(element.getAttribute("color") || "");
    const fontFamily = safeFontFamily(element.getAttribute("face") || "");
    const fontSize = safeFontSize(element.getAttribute("size") || "");
    if (color) styles.color = color;
    if (fontFamily) styles.fontFamily = fontFamily;
    if (fontSize) styles.fontSize = fontSize;
  }

  return styles;
}

export function sanitizeRichText(value, { inlineOnly = false } = {}) {
  const parsed = new DOMParser().parseFromString(String(value ?? ""), "text/html");
  const allowed = inlineOnly ? INLINE_TAGS : new Set([...INLINE_TAGS, ...BLOCK_TAGS]);
  const forbidden = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"]);

  [...parsed.body.querySelectorAll("*")].forEach(element => {
    if (!parsed.body.contains(element)) return;
    if (forbidden.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    const styles = safeStyles(element);
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    if (Object.keys(styles).length) {
      Object.assign(element.style, styles);
      element.setAttribute("style", element.style.cssText);
    }
  });

  return parsed.body.innerHTML;
}
