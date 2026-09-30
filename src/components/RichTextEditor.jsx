import { useEffect, useRef } from "react";
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
    }
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
    restoreSelection();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, commandValue);
    const editor = editorRef.current;
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
        <button type="button" className="rich-tool rich-tool-emphasis" aria-label="Negrita" title="Negrita" onMouseDown={keepEditorSelection} onClick={() => applyCommand("bold")}>B</button>
        <button type="button" className="rich-tool rich-tool-italic" aria-label="Cursiva" title="Cursiva" onMouseDown={keepEditorSelection} onClick={() => applyCommand("italic")}>I</button>
        <button type="button" className="rich-tool rich-tool-underline" aria-label="Subrayado" title="Subrayado" onMouseDown={keepEditorSelection} onClick={() => applyCommand("underline")}>U</button>
        {!singleLine && <>
          <button type="button" className="rich-tool" aria-label="Lista con viñetas" title="Lista con viñetas" onMouseDown={keepEditorSelection} onClick={() => applyCommand("insertUnorderedList")}>• Lista</button>
          <button type="button" className="rich-tool" aria-label="Lista numerada" title="Lista numerada" onMouseDown={keepEditorSelection} onClick={() => applyCommand("insertOrderedList")}>1. Lista</button>
        </>}
        <label className="rich-select-label">Letra
          <select aria-label="Tipo de letra" defaultValue="Manrope" onMouseDown={saveSelection} onChange={event => applyCommand("fontName", event.target.value)}>
            {FONTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="rich-select-label">Tamaño
          <select aria-label="Tamaño de letra" defaultValue="3" onMouseDown={saveSelection} onChange={event => applyFontSize(event.target.value)}>
            {SIZES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="rich-color-label" title="Color de texto">
          Color<input aria-label="Color de texto" type="color" defaultValue="#17232e" onMouseDown={saveSelection} onChange={event => applyCommand("foreColor", event.target.value)} />
        </label>
      </div>
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
