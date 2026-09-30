import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "../lib/richText.js";

const FONTS = [
  ["Manrope", "Manrope"],
  ["Arial", "Arial"],
  ["Georgia", "Georgia"],
  ["Times New Roman", "Times New Roman"],
  ["Verdana", "Verdana"],
  ["DM Mono", "DM Mono"],
];
const SIZES = [
  ["1", "12 px"],
  ["2", "14 px"],
  ["3", "16 px"],
  ["4", "20 px"],
  ["5", "24 px"],
  ["6", "32 px"],
  ["7", "40 px"],
];
const SIZE_PIXELS = new Map([["1", 12], ["2", 14], ["3", 16], ["4", 20], ["5", 24], ["6", 32], ["7", 40]]);

export function RichTextDisplay({ as: Tag = "div", className = "", value, inlineOnly = false }) {
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(value, { inlineOnly }) }}
    />
  );
}

export default function RichTextEditor({ label, value, onChange, singleLine = false }) {
  const editorRef = useRef(null);
  const savedSelection = useRef(null);
  const [formatting, setFormatting] = useState({ bold: false, italic: false, underline: false, fontFamily: "Manrope", fontSize: "3", color: "#17232e" });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.contains(document.activeElement)) return;
    const sanitized = sanitizeRichText(value, { inlineOnly: singleLine });
    if (editor.innerHTML !== sanitized) editor.innerHTML = sanitized;
  }, [singleLine, value]);

  function saveSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedSelection.current = selection.getRangeAt(0).cloneRange();
      updateFormatting(selection);
    }
  }

  function updateFormatting(selection) {
    const editor = editorRef.current;
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    const selectedNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
    const element = selectedNode instanceof Element ? selectedNode : editor;
    const style = window.getComputedStyle(element);
    const weight = Number.parseInt(style.fontWeight, 10);
    const size = Number.parseFloat(style.fontSize);
    setFormatting({
      bold: style.fontWeight === "bold" || (Number.isFinite(weight) && weight >= 600),
      italic: style.fontStyle === "italic" || style.fontStyle === "oblique",
      underline: style.textDecorationLine.includes("underline"),
      fontFamily: fontOption(style.fontFamily),
      fontSize: closestSize(size),
      color: colorHex(style.color),
    });
  }

  function keepEditorSelection(event) {
    saveSelection();
    event.preventDefault();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !savedSelection.current || !editor.contains(savedSelection.current.commonAncestorContainer)) return false;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(savedSelection.current);
    return true;
  }

  function applyCommand(command, commandValue = null) {
    const restored = restoreSelection();
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (editor && selection && (!restored || selection.isCollapsed)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      savedSelection.current = range.cloneRange();
    }
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, commandValue);
    if (editor) {
      onChange(editor.innerHTML);
      saveSelection();
    }
  }

  function applyFontSize(size) {
    applyCommand("fontSize", size);
  }

  function handleInput() {
    const editor = editorRef.current;
    if (!editor) return;
    if (singleLine && /<br|<\/div|<\/p/i.test(editor.innerHTML)) {
      editor.innerHTML = sanitizeRichText(editor.innerHTML, { inlineOnly: true }).replace(/<br\s*\/?>/gi, " ");
      placeCaretAtEnd(editor);
    }
    onChange(editor.innerHTML);
    saveSelection();
  }

  function handleKeyDown(event) {
    if (singleLine && event.key === "Enter") event.preventDefault();
  }

  return (
    <div className="rich-editor">
      <span className="field-label">{label}</span>
      <div className="rich-toolbar" role="toolbar" aria-label={`Formato de ${label.toLowerCase()}`}>
        <button type="button" className={`rich-tool rich-tool-emphasis ${formatting.bold ? "rich-tool-active" : ""}`} aria-label="Negrita" aria-pressed={formatting.bold} title="Negrita" onMouseDown={keepEditorSelection} onClick={() => applyCommand("bold")}>B</button>
        <button type="button" className={`rich-tool rich-tool-italic ${formatting.italic ? "rich-tool-active" : ""}`} aria-label="Cursiva" aria-pressed={formatting.italic} title="Cursiva" onMouseDown={keepEditorSelection} onClick={() => applyCommand("italic")}>I</button>
        <button type="button" className={`rich-tool rich-tool-underline ${formatting.underline ? "rich-tool-active" : ""}`} aria-label="Subrayado" aria-pressed={formatting.underline} title="Subrayado" onMouseDown={keepEditorSelection} onClick={() => applyCommand("underline")}>U</button>
        {!singleLine && <>
          <button type="button" className="rich-tool" aria-label="Lista con viñetas" title="Lista con viñetas" onMouseDown={keepEditorSelection} onClick={() => applyCommand("insertUnorderedList")}>• Lista</button>
          <button type="button" className="rich-tool" aria-label="Lista numerada" title="Lista numerada" onMouseDown={keepEditorSelection} onClick={() => applyCommand("insertOrderedList")}>1. Lista</button>
        </>}
        <label className="rich-select-label">Fuente
          <select aria-label="Tipo de letra" value={formatting.fontFamily} onMouseDown={saveSelection} onChange={event => applyCommand("fontName", event.target.value)}>
            {FONTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="rich-select-label">Tamaño
          <select aria-label="Tamaño de letra" value={formatting.fontSize} onMouseDown={saveSelection} onChange={event => applyFontSize(event.target.value)}>
            {SIZES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="rich-color-label" title="Color de texto">
          Color<input aria-label="Color de texto" type="color" value={formatting.color} onMouseDown={saveSelection} onChange={event => applyCommand("foreColor", event.target.value)} />
        </label>
      </div>
      <small className="rich-hint">Selecciona una parte del texto para formatearla; si no hay selección, el formato se aplica a todo este campo.</small>
      <div
        ref={editorRef}
        className={`rich-editable ${singleLine ? "rich-editable-single-line" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        aria-multiline={!singleLine}
        onInput={handleInput}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onFocus={() => updateFormatting(window.getSelection())}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function fontOption(value) {
  const font = value.split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return FONTS.find(([name]) => name.toLowerCase() === font)?.[0] || "Manrope";
}

function closestSize(pixels) {
  return [...SIZE_PIXELS.entries()].reduce((closest, candidate) => (
    Math.abs(candidate[1] - pixels) < Math.abs(closest[1] - pixels) ? candidate : closest
  ), ["3", 16])[0];
}

function colorHex(value) {
  const rgb = value.match(/[\d.]+/g)?.slice(0, 3).map(channel => Math.max(0, Math.min(255, Math.round(Number(channel)))));
  if (!rgb || rgb.length !== 3 || rgb.some(channel => !Number.isFinite(channel))) return "#17232e";
  return `#${rgb.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}
