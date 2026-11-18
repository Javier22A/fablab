import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabaseClient } from "./lib/supabase.js";
import { BASE_URL } from "./lib/paths.js";
import { sanitizeRichText } from "./lib/richText.js";
import LabelInput from "./components/LabelInput.jsx";
import AnimatedHeading from "./components/AnimatedHeading.jsx";
import DeleteFuseButton from "./components/DeleteFuseButton.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import BorderGlow from "./components/BorderGlow.jsx";

const MicroSlats = lazy(() => import("./components/MicroSlats.jsx"));
const BlockEditor = lazy(() => import("./components/BlockEditor.jsx"));
const EntryList = lazy(() => import("./components/EntryList.jsx"));
const EditablePage = lazy(() => import("./components/EditablePage.jsx"));

const DATA_KEY = "proyecto_id_data";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const DEFAULT_TABS = [
  { id: "portada", title: "Portada General", isDeletable: false, sortOrder: 0, entries: [] },
  { id: "semana-1", title: "Semana 01", isDeletable: true, sortOrder: 1, entries: [] },
];
const TEAM = ["Javier Abad", "Steven Giron", "Francisco Siguenza", "Juan Pablo Quinteros"];

function newId() {
  return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getExplicitWeekNumber(tab) {
  if (!tab || tab.id === "portada") return null;
  const match = String(tab.title || "").trim().match(/^semana\s+(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function getWeekNumber(tab) {
  if (!tab || tab.id === "portada") return 0;
  const explicit = getExplicitWeekNumber(tab);
  if (explicit !== null) return explicit;
  return typeof tab.sortOrder === "number" && tab.sortOrder > 0 ? tab.sortOrder : 1;
}

function getNextWeekNumber(tabList) {
  return (tabList || []).reduce((highest, tab) => {
    const num = getExplicitWeekNumber(tab);
    return num !== null ? Math.max(highest, num) : highest;
  }, 0) + 1;
}

function getNextSortOrder(tabList) {
  return (tabList || []).reduce((highest, tab) => {
    if (tab.id === "portada") return highest;
    const order = typeof tab.sortOrder === "number" ? tab.sortOrder : getWeekNumber(tab);
    return Math.max(highest, order);
  }, 0) + 1;
}

function formatWeekTitle(weekNumber) {
  return `Semana ${String(weekNumber).padStart(2, "0")}`;
}

function sortTabs(tabList) {
  return [...tabList].sort((a, b) => {
    if (a.id === "portada") return -1;
    if (b.id === "portada") return 1;
    const orderA = a.sortOrder ?? getWeekNumber(a);
    const orderB = b.sortOrder ?? getWeekNumber(b);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.title || "").localeCompare(String(b.title || ""), "es", { numeric: true });
  });
}

function computeOrderedTabs(currentTabs, targetTab, insertAfterTabId = "__end__", autoWeekNumber = null) {
  const portadaTab = currentTabs.find(tab => tab.id === "portada");
  const currentNonPortada = currentTabs.filter(tab => tab.id !== "portada");
  const others = currentNonPortada.filter(tab => tab.id !== targetTab.id);

  let insertIndex = others.length;
  if (insertAfterTabId === "__start__") {
    insertIndex = 0;
  } else if (insertAfterTabId === "__end__") {
    insertIndex = others.length;
  } else if (insertAfterTabId === "__keep__") {
    const existingIndex = currentNonPortada.findIndex(tab => tab.id === targetTab.id);
    insertIndex = existingIndex >= 0 ? Math.min(existingIndex, others.length) : others.length;
  } else if (insertAfterTabId === "__auto__" && autoWeekNumber !== null) {
    const nextHigherIndex = others.findIndex(tab => {
      const num = getExplicitWeekNumber(tab);
      return num !== null && num > autoWeekNumber;
    });
    insertIndex = nextHigherIndex >= 0 ? nextHigherIndex : others.length;
  } else {
    const afterIdx = others.findIndex(tab => tab.id === insertAfterTabId);
    insertIndex = afterIdx >= 0 ? afterIdx + 1 : others.length;
  }

  const orderedNonPortada = [
    ...others.slice(0, insertIndex),
    targetTab,
    ...others.slice(insertIndex),
  ].map((tab, idx) => ({ ...tab, sortOrder: idx + 1 }));

  return {
    nextTabs: portadaTab ? [portadaTab, ...orderedNonPortada] : orderedNonPortada,
    orderedNonPortada,
  };
}

function persistLocalTabs(tabList) {
  if (supabaseClient) return;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify({ tabs: tabList }));
  } catch (error) {
    console.error("No se pudo guardar el estado local de las semanas.", error);
  }
}

function filterUnreferencedPaths(candidatePaths, currentTabs, { excludeEntryId = null, excludeTabId = null } = {}) {
  const uniqueCandidates = [...new Set((candidatePaths || []).filter(Boolean))];
  if (!uniqueCandidates.length) return [];
  const referencedElsewhere = new Set();
  for (const tab of currentTabs || []) {
    if (excludeTabId && tab.id === excludeTabId) continue;
    for (const entry of tab.entries || []) {
      if (excludeEntryId && entry.id === excludeEntryId) continue;
      for (const block of entry.blocks || []) {
        if (block?.storagePath) referencedElsewhere.add(block.storagePath);
      }
    }
  }
  return uniqueCandidates.filter(path => !referencedElsewhere.has(path));
}

function makeBlock(type) {
  const id = newId();
  if (type === "image") return { id, type, fileName: "", mimeType: "", alt: "Evidencia visual", dataUrl: "", file: null, previewUrl: "" };
  if (type === "video") return { id, type, fileName: "", mimeType: "", alt: "Video de evidencia", file: null, previewUrl: "" };
  if (type === "download") return { id, type, title: "", description: "", fileName: "", mimeType: "", fileSize: 0, file: null };
  if (type === "comparison") return { id, type, title: "Comparación de alternativas", ideas: [{ title: "Opción A", description: "", pros: "", cons: "" }] };
  return { id, type: "text", content: "" };
}

function readLegacyData() {
  try {
    const stored = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (!stored?.tabs?.length) return { tabs: DEFAULT_TABS };
    return {
      tabs: sortTabs(stored.tabs.map(tab => ({
        ...tab,
        sortOrder: tab.sortOrder ?? getWeekNumber(tab),
        entries: (tab.entries || []).map(normalizeEntry),
      }))),
    };
  } catch {
    return { tabs: DEFAULT_TABS };
  }
}

function normalizeEntry(entry) {
  if (Array.isArray(entry.blocks)) return { ...entry, blocks: entry.blocks };
  const blocks = [];
  if (entry.htmlContent) blocks.push({ id: newId(), type: "text", content: entry.htmlContent });
  if (entry.ideas?.length) {
    blocks.push({ id: newId(), type: "comparison", title: "Comparación de ideas", ideas: entry.ideas.map(idea => ({ title: idea.title || "Opción", description: idea.desc || "", pros: idea.pro || "", cons: idea.con || "" })) });
  }
  if (entry.image) blocks.push({ id: newId(), type: "image", fileName: "evidencia.jpg", mimeType: "image/jpeg", alt: "Evidencia visual", dataUrl: entry.image });
  return { ...entry, blocks };
}

function convertImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size > MAX_IMAGE_BYTES) return reject(new Error("La imagen debe pesar menos de 8 MB."));
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("No se pudo comprimir la imagen."));
        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        resolve({ file: compressedFile, dataUrl: canvas.toDataURL("image/jpeg", 0.78) });
      }, "image/jpeg", 0.78);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("El archivo de imagen no es válido.")); };
    image.src = objectUrl;
  });
}

function blockForStorage(block, uploadedMedia) {
  if (block.type === "image" || block.type === "video") {
    return { id: block.id, type: block.type, fileName: block.fileName, mimeType: block.mimeType, alt: block.alt, storagePath: uploadedMedia?.storagePath || block.storagePath || null, url: uploadedMedia?.url || block.url || null };
  }
  if (block.type === "download") {
    return { id: block.id, type: block.type, title: block.title || "", description: block.description || "", fileName: block.fileName, mimeType: block.mimeType, fileSize: block.fileSize || 0, storagePath: uploadedMedia?.storagePath || block.storagePath || null, url: uploadedMedia?.url || block.url || null };
  }
  if (block.type === "text") return { id: block.id, type: "text", content: sanitizeRichText(block.content) };
  return { id: block.id, type: "comparison", title: block.title, ideas: block.ideas.map(idea => ({ ...idea })) };
}

function HomePage({
  tabs,
  activeTabId,
  setActiveTabId,
  authenticated,
  onCreateTab,
  onDeleteTab,
  onUpdateTab,
  onTransferEntries,
  transferBusy,
  entries,
  editor,
  loading,
  teamMembers,
  deletionInProgress,
  deletingTabId,
}) {
  const currentTab = tabs.find(tab => tab.id === activeTabId);
  const deletingTab = tabs.find(tab => tab.id === deletingTabId);
  const allEntries = tabs.reduce((count, tab) => count + tab.entries.length, 0);
  const isEditableWeek = Boolean(currentTab && currentTab.id !== "portada");
  const allWeekTabs = tabs.filter(tab => tab.id !== "portada");
  const otherWeekTabs = tabs.filter(tab => tab.id !== "portada" && tab.id !== activeTabId);
  const nextAutoWeekNumber = getNextWeekNumber(tabs);
  const nextAutoWeekLabel = formatWeekTitle(nextAutoWeekNumber);

  const [isCreatingWeek, setIsCreatingWeek] = useState(false);
  const [createMode, setCreateMode] = useState("number");
  const [createWeekNumber, setCreateWeekNumber] = useState("");
  const [createCustomName, setCreateCustomName] = useState("");
  const [createInsertAfter, setCreateInsertAfter] = useState("__end__");
  const [creatingWeek, setCreatingWeek] = useState(false);

  const [isEditingWeek, setIsEditingWeek] = useState(false);
  const [editMode, setEditMode] = useState("number");
  const [weekNumberInput, setWeekNumberInput] = useState("");
  const [weekNameInput, setWeekNameInput] = useState("");
  const [editInsertAfter, setEditInsertAfter] = useState("__auto__");
  const [savingWeekEdit, setSavingWeekEdit] = useState(false);

  const [isTransferringWeek, setIsTransferringWeek] = useState(false);
  const [weekTransferMode, setWeekTransferMode] = useState("copy");
  const [weekTransferTargetId, setWeekTransferTargetId] = useState("");
  const [panelLocation, setPanelLocation] = useState("sidebar");

  useEffect(() => {
    setIsEditingWeek(false);
    setIsTransferringWeek(false);
  }, [activeTabId]);

  useEffect(() => {
    if (!authenticated) {
      setIsCreatingWeek(false);
      setIsEditingWeek(false);
      setIsTransferringWeek(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (!isTransferringWeek) return;
    if (!weekTransferTargetId || (weekTransferTargetId !== "__new__" && !otherWeekTabs.some(tab => tab.id === weekTransferTargetId))) {
      setWeekTransferTargetId(otherWeekTabs[0]?.id || "__new__");
    }
  }, [isTransferringWeek, otherWeekTabs, weekTransferTargetId]);

  function openWeekCreator() {
    if (isCreatingWeek) {
      setIsCreatingWeek(false);
      return;
    }
    setIsEditingWeek(false);
    setIsTransferringWeek(false);
    setCreateMode("number");
    setCreateWeekNumber(String(nextAutoWeekNumber));
    setCreateCustomName("");
    setCreateInsertAfter("__end__");
    setIsCreatingWeek(true);
  }

  function openWeekEditor(location = "sidebar") {
    if (!currentTab) return;
    if (isEditingWeek && panelLocation === location) {
      setIsEditingWeek(false);
      return;
    }
    const explicitNum = getExplicitWeekNumber(currentTab);
    setPanelLocation(location);
    setIsCreatingWeek(false);
    setIsTransferringWeek(false);
    if (explicitNum !== null) {
      setEditMode("number");
      setWeekNumberInput(String(explicitNum));
      setWeekNameInput(currentTab.title);
      setEditInsertAfter("__auto__");
    } else {
      setEditMode("custom");
      setWeekNumberInput(String(nextAutoWeekNumber));
      setWeekNameInput(currentTab.title || "");
      setEditInsertAfter("__keep__");
    }
    setIsEditingWeek(true);
  }

  function openWeekTransfer(location = "sidebar") {
    if (!currentTab?.entries?.length) return;
    if (isTransferringWeek && panelLocation === location) {
      setIsTransferringWeek(false);
      return;
    }
    setPanelLocation(location);
    setIsCreatingWeek(false);
    setIsEditingWeek(false);
    setWeekTransferMode("copy");
    setWeekTransferTargetId(otherWeekTabs[0]?.id || "__new__");
    setIsTransferringWeek(true);
  }

  async function submitNewTab(event) {
    event.preventDefault();
    if (creatingWeek) return;
    setCreatingWeek(true);
    try {
      const ok = await onCreateTab({
        mode: createMode,
        weekNumber: createWeekNumber,
        customTitle: createCustomName,
        insertAfterTabId: createInsertAfter,
      });
      if (ok) {
        setIsCreatingWeek(false);
        setCreateCustomName("");
      }
    } finally {
      setCreatingWeek(false);
    }
  }

  async function submitWeekEdit(event) {
    event.preventDefault();
    if (!currentTab || savingWeekEdit) return;
    setSavingWeekEdit(true);
    try {
      const ok = await onUpdateTab(currentTab.id, {
        mode: editMode,
        weekNumber: weekNumberInput,
        customTitle: weekNameInput,
        insertAfterTabId: editInsertAfter,
      });
      if (ok) setIsEditingWeek(false);
    } finally {
      setSavingWeekEdit(false);
    }
  }

  async function submitWeekTransfer(event) {
    event.preventDefault();
    if (!currentTab?.entries?.length || transferBusy) return;
    const entryIds = currentTab.entries.map(entry => entry.id);
    const ok = await onTransferEntries({
      entryIds,
      sourceTabId: currentTab.id,
      targetTabId: weekTransferTargetId || "__new__",
      mode: weekTransferMode,
    });
    if (ok) setIsTransferringWeek(false);
  }

  const parsedCreateNumber = Number.parseInt(String(createWeekNumber).trim(), 10);
  const previewCreateTitle = createMode === "number"
    ? (Number.isInteger(parsedCreateNumber) && parsedCreateNumber >= 1 && parsedCreateNumber <= 999 ? formatWeekTitle(parsedCreateNumber) : null)
    : (createCustomName.trim() || null);

  const parsedEditNumber = Number.parseInt(String(weekNumberInput).trim(), 10);
  const previewEditTitle = editMode === "number"
    ? (Number.isInteger(parsedEditNumber) && parsedEditNumber >= 1 && parsedEditNumber <= 999 ? formatWeekTitle(parsedEditNumber) : null)
    : (weekNameInput.trim() || null);

  function renderWeekCreatorForm() {
    return (
      <form className="week-admin-popover animate-in" onSubmit={submitNewTab}>
        <span className="field-label">Tipo de semana / sección</span>
        <div className="transfer-mode-switch" role="group" aria-label="Tipo de semana a crear">
          <button
            type="button"
            className={`transfer-mode-btn ${createMode === "number" ? "active" : ""}`}
            onClick={() => {
              setCreateMode("number");
              setCreateWeekNumber(current => current || String(nextAutoWeekNumber));
            }}
            disabled={creatingWeek}
          >
            Por número
          </button>
          <button
            type="button"
            className={`transfer-mode-btn ${createMode === "custom" ? "active" : ""}`}
            onClick={() => {
              setCreateMode("custom");
              setCreateInsertAfter(current => (current === "__auto__" ? "__end__" : current));
            }}
            disabled={creatingWeek}
          >
            Con nombre
          </button>
        </div>

        {createMode === "number" ? (
          <>
            <label className="field-label" htmlFor="createWeekNumber">Número de semana</label>
            <input
              id="createWeekNumber"
              className="form-control"
              type="number"
              min={1}
              max={999}
              required
              value={createWeekNumber}
              onChange={event => setCreateWeekNumber(event.target.value)}
              disabled={creatingWeek}
            />
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="createWeekName">Nombre personalizado</label>
            <input
              id="createWeekName"
              className="form-control"
              type="text"
              maxLength={60}
              required
              placeholder="Ej. Midterm Review"
              value={createCustomName}
              onChange={event => setCreateCustomName(event.target.value)}
              disabled={creatingWeek}
            />
          </>
        )}

        <label className="field-label" htmlFor="createWeekPosition">Ubicación en la lista</label>
        <select
          id="createWeekPosition"
          className="form-control"
          value={createInsertAfter}
          onChange={event => setCreateInsertAfter(event.target.value)}
          disabled={creatingWeek}
        >
          <option value="__end__">Al final de la lista</option>
          {createMode === "number" && <option value="__auto__">Orden automático según número</option>}
          <option value="__start__">Al inicio (primera)</option>
          {allWeekTabs.map(tab => (
            <option key={tab.id} value={tab.id}>Después de {tab.title}</option>
          ))}
        </select>

        {previewCreateTitle && (
          <small className="week-admin-preview">
            Se creará como <strong>{previewCreateTitle}</strong>
          </small>
        )}

        <div className="week-admin-actions">
          <button className="button button-ghost" type="button" disabled={creatingWeek} onClick={() => setIsCreatingWeek(false)}>Cancelar</button>
          <button className="button button-primary" type="submit" disabled={creatingWeek || !previewCreateTitle}>
            {creatingWeek ? "Creando…" : "Crear"}
          </button>
        </div>
      </form>
    );
  }

  function renderWeekEditorForm(idPrefix) {
    return (
      <form className="week-admin-popover animate-in" onSubmit={submitWeekEdit}>
        <span className="field-label">Formato de la semana</span>
        <div className="transfer-mode-switch" role="group" aria-label="Formato del título de la semana">
          <button
            type="button"
            className={`transfer-mode-btn ${editMode === "number" ? "active" : ""}`}
            onClick={() => {
              setEditMode("number");
              setEditInsertAfter("__auto__");
            }}
            disabled={savingWeekEdit}
          >
            Por número
          </button>
          <button
            type="button"
            className={`transfer-mode-btn ${editMode === "custom" ? "active" : ""}`}
            onClick={() => {
              setEditMode("custom");
              setEditInsertAfter("__keep__");
            }}
            disabled={savingWeekEdit}
          >
            Con nombre
          </button>
        </div>

        {editMode === "number" ? (
          <>
            <label className="field-label" htmlFor={`${idPrefix}WeekNumber`}>Nuevo número de semana</label>
            <input
              id={`${idPrefix}WeekNumber`}
              className="form-control"
              type="number"
              min={1}
              max={999}
              required
              value={weekNumberInput}
              onChange={event => setWeekNumberInput(event.target.value)}
              disabled={savingWeekEdit}
            />
          </>
        ) : (
          <>
            <label className="field-label" htmlFor={`${idPrefix}WeekName`}>Nombre de la semana / sección</label>
            <input
              id={`${idPrefix}WeekName`}
              className="form-control"
              type="text"
              maxLength={60}
              required
              placeholder="Ej. Midterm Review"
              value={weekNameInput}
              onChange={event => setWeekNameInput(event.target.value)}
              disabled={savingWeekEdit}
            />
          </>
        )}

        <label className="field-label" htmlFor={`${idPrefix}WeekPosition`}>Ubicación en la lista</label>
        <select
          id={`${idPrefix}WeekPosition`}
          className="form-control"
          value={editInsertAfter}
          onChange={event => setEditInsertAfter(event.target.value)}
          disabled={savingWeekEdit}
        >
          {editMode === "number" && <option value="__auto__">Orden automático según número</option>}
          <option value="__keep__">Mantener posición actual</option>
          <option value="__start__">Al inicio (primera)</option>
          {otherWeekTabs.map(tab => (
            <option key={tab.id} value={tab.id}>Después de {tab.title}</option>
          ))}
          <option value="__end__">Al final de la lista</option>
        </select>

        {previewEditTitle && <small className="week-admin-preview">Se mostrará como <strong>{previewEditTitle}</strong></small>}
        <div className="week-admin-actions">
          <button className="button button-ghost" type="button" disabled={savingWeekEdit} onClick={() => setIsEditingWeek(false)}>Cancelar</button>
          <button className="button button-primary" type="submit" disabled={savingWeekEdit || !previewEditTitle}>
            {savingWeekEdit ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    );
  }

  function renderWeekTransferForm(idPrefix) {
    return (
      <form className="week-admin-popover animate-in" onSubmit={submitWeekTransfer}>
        <span className="field-label">Acción con los {currentTab.entries.length} registros</span>
        <div className="transfer-mode-switch" role="group" aria-label="Modo de transferencia">
          <button
            type="button"
            className={`transfer-mode-btn ${weekTransferMode === "copy" ? "active" : ""}`}
            onClick={() => setWeekTransferMode("copy")}
            disabled={transferBusy}
          >
            Copiar
          </button>
          <button
            type="button"
            className={`transfer-mode-btn ${weekTransferMode === "move" ? "active" : ""}`}
            onClick={() => setWeekTransferMode("move")}
            disabled={transferBusy}
          >
            Mover
          </button>
        </div>
        <label className="field-label" htmlFor={`${idPrefix}TransferTarget`}>Semana destino</label>
        <select
          id={`${idPrefix}TransferTarget`}
          className="form-control"
          value={weekTransferTargetId}
          onChange={event => setWeekTransferTargetId(event.target.value)}
          disabled={transferBusy}
        >
          {otherWeekTabs.map(tab => (
            <option key={tab.id} value={tab.id}>{tab.title}</option>
          ))}
          <option value="__new__">+ Crear {nextAutoWeekLabel}</option>
        </select>
        <div className="week-admin-actions">
          <button className="button button-ghost" type="button" disabled={transferBusy} onClick={() => setIsTransferringWeek(false)}>Cancelar</button>
          <button className="button button-primary" type="submit" disabled={transferBusy}>
            {transferBusy ? "Procesando…" : weekTransferMode === "move" ? "Mover todo" : "Copiar todo"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación del proyecto">
        <div className="sidebar-intro"><span className="eyebrow">Proyecto 2026</span><h1>Diario de campo</h1><p>Decisiones, pruebas y aprendizajes documentados semana a semana.</p></div>
        <div className="sidebar-section">
          <div className="section-heading"><span className="eyebrow">Recorrido</span><span className="count-label">{Math.max(0, tabs.length - 1)} semanas</span></div>
          {loading ? <p className="loading-copy">Conectando con la bitácora…</p> : <ul className="tab-list">{tabs.map(tab => <li key={tab.id}><button className={`tab-button ${tab.id === activeTabId ? "active" : ""}`} type="button" onClick={() => setActiveTabId(tab.id)}><span>{tab.title}</span><span className="tab-arrow">↗</span></button></li>)}</ul>}
        </div>
        {authenticated && (
          <div className="sidebar-section admin-controls">
            <span className="eyebrow">Gestión</span>
            <button className="button button-secondary button-wide" type="button" disabled={deletionInProgress || transferBusy || creatingWeek} onClick={openWeekCreator}>
              {isCreatingWeek ? "Cerrar nueva semana" : "+ Añadir semana"}
            </button>
            {isCreatingWeek && renderWeekCreatorForm()}
            {isEditableWeek && (
              <>
                <button
                  className="button button-secondary button-wide"
                  type="button"
                  disabled={deletionInProgress || transferBusy || savingWeekEdit}
                  onClick={() => openWeekEditor("sidebar")}
                >
                  {isEditingWeek && panelLocation === "sidebar" ? "Cerrar edición" : "Editar semana"}
                </button>
                {isEditingWeek && panelLocation === "sidebar" && renderWeekEditorForm("sidebar")}
                <button
                  className="button button-secondary button-wide"
                  type="button"
                  disabled={!currentTab?.entries?.length || deletionInProgress || transferBusy || Boolean(entries.pendingEntryOrders[activeTabId])}
                  onClick={() => openWeekTransfer("sidebar")}
                  title={!currentTab?.entries?.length ? "Esta semana aún no tiene registros para copiar o mover" : undefined}
                >
                  {isTransferringWeek && panelLocation === "sidebar" ? "Cerrar copiar / mover" : "Copiar / mover semana"}
                </button>
                {isTransferringWeek && panelLocation === "sidebar" && renderWeekTransferForm("sidebar")}
              </>
            )}
            {deletingTabId
              ? <p className="delete-progress" role="status">Eliminando {deletingTab?.title || "semana"}…</p>
              : <DeleteFuseButton
                  key={currentTab?.id || "no-week"}
                  label="Eliminar semana actual"
                  size="md"
                  fullWidth
                  disabled={!currentTab?.isDeletable || deletionInProgress || transferBusy}
                  onCommit={() => { if (currentTab) void onDeleteTab(currentTab.id); }}
                />}
          </div>
        )}
        <div className="sidebar-note"><span className="note-dot" /><p>Un buen prototipo también deja registro de lo que no funcionó.</p></div>
      </aside>
      <main className="main-content">
        {loading ? <div className="public-empty animate-in" role="status"><span className="empty-icon">◌</span><h3>Cargando la bitácora</h3><p>Conectando con Supabase para traer semanas y registros.</p></div> : activeTabId === "portada" ? <HomeLanding weekCount={tabs.length - 1} entryCount={allEntries} teamMembers={teamMembers} /> : (
          <>
            <div className="page-heading animate-in">
              <span className="eyebrow">Registro semanal</span>
              <div className="page-heading-row">
                <h2>{currentTab?.title || "Semana"}</h2>
                {authenticated && isEditableWeek && (
                  <div className="page-heading-actions">
                    <button
                      className="button button-secondary button-sm"
                      type="button"
                      disabled={deletionInProgress || transferBusy || savingWeekEdit}
                      onClick={() => openWeekEditor("heading")}
                    >
                      {isEditingWeek && panelLocation === "heading" ? "Cerrar edición" : "Editar semana"}
                    </button>
                    {currentTab?.entries?.length > 0 && (
                      <button
                        className="button button-secondary button-sm"
                        type="button"
                        disabled={deletionInProgress || transferBusy || Boolean(entries.pendingEntryOrders[activeTabId])}
                        onClick={() => openWeekTransfer("heading")}
                      >
                        {isTransferringWeek && panelLocation === "heading" ? "Cerrar copiar / mover" : "Copiar / mover semana"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <span className="heading-line" />
              {authenticated && isEditableWeek && isEditingWeek && panelLocation === "heading" && (
                <div className="heading-admin-popover-wrap">{renderWeekEditorForm("heading")}</div>
              )}
              {authenticated && isEditableWeek && isTransferringWeek && panelLocation === "heading" && (
                <div className="heading-admin-popover-wrap">{renderWeekTransferForm("heading")}</div>
              )}
            </div>
            <Suspense fallback={<p className="drop-hint" role="status">Cargando publicaciones…</p>}>
              <EntryList
                authenticated={authenticated}
                entries={{
                  ...entries,
                  items: currentTab?.entries || [],
                  orderDirty: Boolean(entries.pendingEntryOrders[activeTabId]),
                  orderSaving: entries.savingEntryOrder,
                  reorder: entries.reorder,
                  saveOrder: entries.saveOrder,
                  otherWeeks: otherWeekTabs,
                  nextWeekLabel: nextAutoWeekLabel,
                  transferBusy,
                  onTransferEntry: (entry, targetTabId, mode) => onTransferEntries({
                    entryIds: [entry.id],
                    sourceTabId: activeTabId,
                    targetTabId,
                    mode,
                  }),
                }}
              />
            </Suspense>
            {authenticated && <EditorPanel tabTitle={currentTab?.title || "Semana"} editor={editor} />}
          </>
        )}
      </main>
    </div>
  );
}

function HomeLanding({ weekCount, entryCount, teamMembers }) {
  return (
    <>
      <section className="hero-panel animate-in">
        <div className="hero-slats-background" aria-hidden="true">
          <Suspense fallback={null}>
            <MicroSlats
              preset="swell"
              color="#4C87A8"
              glintColor="#FFFFFF"
              backgroundColor="rgba(0, 0, 0, 0)"
              slatWidth={10}
              slatHeight={25}
              gap={3}
              roundness={0.75}
              stretch={0.7}
              perspective={0.7}
              interactive
              cursorStrength={1}
              cursorSize={40}
              swirl={0.2}
              trail={1.4}
              lean={0.45}
              intro
            />
          </Suspense>
        </div>
        <div className="hero-content">
          <span className="eyebrow">Investigación y desarrollo / 2026</span>
          <AnimatedHeading as="h2" className="hero-title" text="Del problema al prototipo." />
          <p>Una bitácora abierta sobre decisiones, pruebas y aprendizajes detrás de un producto nuevo.</p>
          <div className="hero-stats"><span><strong>{weekCount}</strong> semanas documentadas</span><span><strong>{entryCount}</strong> registros publicados</span></div>
        </div>
      </section>
      <section className="intro-grid animate-in"><div className="section-heading"><span className="eyebrow">Equipo de trabajo</span><h3>Cuatro miradas, un objetivo.</h3></div><div className="team-list">{teamMembers.map((name, index) => <BorderGlow key={`${name}-${index}`} className="team-member" borderRadius={8} glowRadius={16} glowIntensity={0.7} fillOpacity={0.18}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>Investigación / Desarrollo</small></BorderGlow>)}</div></section>
    </>
  );
}

function EditorPanel({ tabTitle, editor }) {
  return (
    <section className="editor-panel">
      <div className="editor-heading"><div><span className="eyebrow">{editor.editing ? "Editar publicación" : "Modo de edición"}</span><h2>{editor.editing ? "Actualizar registro" : `Nuevo registro en ${tabTitle}`}</h2><p>Aquí se construye la entrada por bloques separados :D </p></div><span className="editor-save-state">{editor.saving ? "Guardando…" : "Listo para editar"}</span></div>
      <label className="field-label" htmlFor="entryTitle">Título del registro</label>
      <input id="entryTitle" className="form-control title-input" value={editor.title} onChange={event => editor.setTitle(event.target.value)} maxLength={120} placeholder="Ej. Validación del primer mecanismo" />
      <div className="block-toolbar" aria-label="Añadir bloques"><span className="toolbar-label">Añadir bloque</span>{[["text", "Párrafo"], ["image", "Imagen"], ["video", "Video"], ["comparison", "Cuadro comparativo"], ["download", "Archivo descargable"]].map(([type, label]) => <button className="block-add-button" key={type} type="button" onClick={() => editor.addBlock(type)}>+ {label}</button>)}</div>
      <p className="drop-hint">Arrastra el asa de cada bloque para cambiar el orden. Puedes adjuntar imágenes, videos o archivos descargables de hasta 50 MB.</p>
      {editor.blocks.length ? <Suspense fallback={<p className="drop-hint" role="status">Cargando herramientas del editor…</p>}><BlockEditor {...editor.blockProps} /></Suspense> : <div className="editor-empty-state"><span className="empty-icon">+</span><strong>Tu registro empieza aquí</strong><p>Añade un párrafo, una evidencia visual, un video, un archivo descargable o una comparación.</p></div>}
      <div className="editor-footer"><button className="button button-ghost" type="button" onClick={editor.clear}>{editor.editing ? "Cancelar edición" : "Limpiar borrador"}</button><button className="button button-primary" type="button" disabled={editor.saving} onClick={editor.save}>{editor.saving ? "Guardando…" : editor.editing ? "Guardar cambios" : "Guardar avance"}</button></div>
    </section>
  );
}

export default function App({ page = "home" }) {
  const [tabs, setTabs] = useState(() => supabaseClient ? [] : readLegacyData().tabs);
  const [teamMembers, setTeamMembers] = useState(TEAM);
  const [activeTabId, setActiveTabId] = useState("portada");
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabaseClient));
  const [blocks, setBlocks] = useState([]);
  const [entryTitle, setEntryTitle] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState(null);
  const [deletingTabId, setDeletingTabId] = useState(null);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const [pendingEntryOrders, setPendingEntryOrders] = useState({});
  const [savingEntryOrder, setSavingEntryOrder] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const authDialogRef = useRef(null);
  const deletionLockRef = useRef(false);
  const authenticated = Boolean(session);

  useEffect(() => {
    let mounted = true;
    let authSubscription;

    async function loadRemoteData() {
      if (!supabaseClient) {
        const saved = readLegacyData();
        if (mounted) { setTabs(saved.tabs); setLoading(false); }
        return;
      }

      const [tabsResult, entriesResult, aboutResult] = await Promise.all([
        supabaseClient.from("tabs").select("id, title, is_deletable, sort_order").order("sort_order", { ascending: true }),
        supabaseClient.from("entries").select("id, tab_id, title, blocks, created_at, sort_order").order("tab_id", { ascending: true }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      aboutResultPromise(),
      ]);
      if (!mounted) return;
      if (tabsResult.error || entriesResult.error) {
        setNotice({ type: "error", message: tabsResult.error ? "No se pudieron cargar las semanas de Supabase." : "No se pudieron cargar los registros de Supabase." });
        console.error(tabsResult.error || entriesResult.error);
        setLoading(false);
        return;
      }

      const entries = entriesResult.data.map((entry, index) => ({ id: entry.id, tabId: entry.tab_id, title: entry.title, blocks: Array.isArray(entry.blocks) ? entry.blocks : [], createdAt: entry.created_at, sortOrder: entry.sort_order ?? index }));
      setTabs(sortTabs(tabsResult.data.map(tab => ({ id: tab.id, title: tab.title, isDeletable: tab.is_deletable, sortOrder: tab.sort_order ?? getWeekNumber(tab), entries: entries.filter(entry => entry.tabId === tab.id) }))));
      if (aboutResult.error) {
        console.error("No se pudieron cargar los nombres del equipo desde About.", aboutResult.error);
        setNotice({ type: "error", message: "No se pudieron cargar los nombres del equipo desde About." });
      } else if (Array.isArray(aboutResult.data?.content?.teamNames)) {
        setTeamMembers(aboutResult.data.content.teamNames.filter(name => typeof name === "string" && name.trim()));
      }
      setLoading(false);
    }

    function aboutResultPromise() {
      return supabaseClient.from("site_pages").select("content").eq("slug", "about").maybeSingle();
    }

    if (page === "home") loadRemoteData();
    else setLoading(false);
    if (supabaseClient) {
      supabaseClient.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
      const { data } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
      authSubscription = data.subscription;
    }

    return () => { mounted = false; authSubscription?.unsubscribe(); };
  }, [page]);

  useEffect(() => {
    if (notice) {
      const timeout = window.setTimeout(() => setNotice(null), 3500);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [notice]);

  function showLogin() {
    setAuthError("");
    setEmail("");
    setPassword("");
    authDialogRef.current?.showModal();
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (!supabaseClient) {
      setAuthError("Configura Supabase para habilitar el acceso del equipo.");
      return;
    }
    setAuthBusy(true);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
    setAuthBusy(false);
    if (error) { setAuthError(error.message); return; }
    setSession(data.session);
    authDialogRef.current?.close();
  }

  async function logout() {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) { setNotice({ type: "error", message: "No se pudo cerrar la sesión." }); return; }
    }
    setSession(null);
    setBlocks([]);
    setEditingEntryId(null);
    setEntryTitle("");
    setNotice({ type: "success", message: "Sesión cerrada." });
  }

  function updateCurrentTab(updater) {
    setTabs(current => current.map(tab => tab.id === activeTabId ? updater(tab) : tab));
  }

  function addBlock(type) { setBlocks(current => [...current, makeBlock(type)]); }
  function changeBlock(index, patch) { setBlocks(current => current.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block)); }
  function removeBlock(index) { setBlocks(current => current.filter((_, blockIndex) => blockIndex !== index)); }
  function reorderBlocks(orderedBlocks) { setBlocks(orderedBlocks); }
  function reorderEntries(orderedEntries) {
    const ordered = orderedEntries.map((entry, sortOrder) => ({ ...entry, sortOrder }));
    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, entries: ordered } : tab));
    setPendingEntryOrders(current => ({ ...current, [activeTabId]: ordered.map(entry => entry.id) }));
  }
  async function saveEntryOrder() {
    const tabId = activeTabId;
    const orderedIds = pendingEntryOrders[tabId];
    if (!orderedIds?.length) return;
    setSavingEntryOrder(true);
    try {
      if (supabaseClient) {
        const { error } = await supabaseClient.rpc("reorder_entries", { p_tab_id: tabId, p_entry_ids: orderedIds });
        if (error) throw error;
      } else {
        const localTabs = tabs.map(tab => tab.id === tabId ? {
          ...tab,
          entries: tab.entries.map((entry, index) => ({ ...entry, sortOrder: index })),
        } : tab);
        localStorage.setItem(DATA_KEY, JSON.stringify({ tabs: localTabs }));
      }
      setPendingEntryOrders(current => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setNotice({ type: "success", message: "Orden de publicaciones guardado." });
    } catch (error) {
      console.error("No se pudo guardar el orden de las publicaciones.", error);
      setNotice({ type: "error", message: `No se pudo guardar el orden: ${error.message}` });
    } finally {
      setSavingEntryOrder(false);
    }
  }
  function addIdea(index) { setBlocks(current => current.map((block, blockIndex) => blockIndex === index ? { ...block, ideas: [...block.ideas, { title: `Opción ${String.fromCharCode(65 + block.ideas.length)}`, description: "", pros: "", cons: "" }] } : block)); }
  function removeIdea(index, ideaIndex) { setBlocks(current => current.map((block, blockIndex) => blockIndex === index ? { ...block, ideas: block.ideas.filter((_, itemIndex) => itemIndex !== ideaIndex) } : block)); }

  async function addImage(index, file) {
    if (!file) return;
    if (!file?.type.startsWith("image/")) { setNotice({ type: "error", message: "Selecciona un archivo de imagen válido." }); return; }
    try {
      const converted = await convertImage(file);
      changeBlock(index, { file: converted.file, dataUrl: converted.dataUrl, fileName: converted.file.name, mimeType: converted.file.type });
      setNotice({ type: "success", message: "Imagen comprimida y lista." });
    } catch (error) { setNotice({ type: "error", message: error.message }); }
  }

  function addVideo(index, file) {
    if (!file) return;
    if (!file?.type.startsWith("video/")) { setNotice({ type: "error", message: "Selecciona un archivo de video válido." }); return; }
    if (file.size > MAX_VIDEO_BYTES) { setNotice({ type: "error", message: "El video supera el límite de 50 MB." }); return; }
    const previewUrl = URL.createObjectURL(file);
    changeBlock(index, { file, previewUrl, fileName: file.name, mimeType: file.type });
  }

  function addDownload(index, file) {
    if (!file) return;
    if (file.size > MAX_DOWNLOAD_BYTES) {
      setNotice({ type: "error", message: "El archivo descargable supera el límite de 50 MB." });
      return;
    }
    changeBlock(index, { file, fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size });
  }

  async function uploadBlocks(entryId, sourceBlocks) {
    if (!supabaseClient) {
      if (sourceBlocks.some(block => block.type === "download" && block.file)) {
        throw new Error("La carga de archivos descargables requiere que Supabase esté configurado.");
      }
      return { blocks: sourceBlocks.map(block => block.type === "download" ? blockForStorage(block) : { ...block }), uploadedPaths: [] };
    }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error("No se encontró la sesión de Supabase.");

    const uploadedPaths = [];
    try {
      const preparedBlocks = [];
      for (const block of sourceBlocks) {
        if (!((block.type === "image" || block.type === "video" || block.type === "download") && block.file)) {
          preparedBlocks.push(blockForStorage(block));
          continue;
        }
        const safeName = (block.fileName || "archivo").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "archivo";
        const storagePath = `${userId}/${entryId}/${newId()}-${safeName}`;
        const { error } = await supabaseClient.storage.from("project-media").upload(storagePath, block.file, { contentType: block.mimeType || "application/octet-stream", upsert: false });
        if (error) throw error;
        uploadedPaths.push(storagePath);
        const { data } = supabaseClient.storage.from("project-media").getPublicUrl(
          storagePath,
          block.type === "download" ? { download: block.fileName || true } : undefined,
        );
        const publicUrl = data.publicUrl;
        preparedBlocks.push(blockForStorage({ ...block, url: publicUrl, storagePath }, { url: publicUrl, storagePath }));
      }
      return { blocks: preparedBlocks, uploadedPaths };
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(uploadedPaths);
        if (cleanupError) console.error("No se pudieron limpiar archivos multimedia subidos parcialmente.", cleanupError);
      }
      throw error;
    }
  }

  async function saveEntry() {
    const validBlocks = blocks.filter(block => block.type === "text" ? block.content.trim() : block.type === "image" ? block.file || block.url : block.type === "video" ? block.file || block.url : block.type === "download" ? block.file || block.url : block.ideas.length > 0);
    if (!validBlocks.length) { setNotice({ type: "error", message: "Añade al menos un bloque antes de guardar." }); return; }
    const existingEntry = editingEntryId
      ? tabs.flatMap(tab => tab.entries).find(entry => entry.id === editingEntryId)
      : null;
    if (editingEntryId && !existingEntry) {
      setNotice({ type: "error", message: "No se encontró el registro que intentas editar. Recarga la bitácora e inténtalo de nuevo." });
      return;
    }
    setSaving(true);
    const entryId = editingEntryId || newId();
    const createdAt = existingEntry?.createdAt || new Date().toISOString();
    const entryTabId = existingEntry?.tabId || activeTabId;
    let uploadedPaths = [];
    let mediaCleanupFailed = false;
    try {
      const uploadResult = await uploadBlocks(entryId, validBlocks);
      const preparedBlocks = uploadResult.blocks;
      uploadedPaths = uploadResult.uploadedPaths;
      const tabEntries = tabs.find(tab => tab.id === entryTabId)?.entries || [];
      const nextSortOrder = tabEntries.reduce((highest, entry) => Math.max(highest, entry.sortOrder ?? -1), -1) + 1;
      const payload = { tab_id: entryTabId, title: entryTitle.trim() || "Registro de actividad", blocks: preparedBlocks, created_at: createdAt, sort_order: existingEntry?.sortOrder ?? nextSortOrder };
      let storedEntry;
      if (supabaseClient) {
        const query = editingEntryId
          ? supabaseClient.from("entries").update({ title: payload.title, blocks: preparedBlocks }).eq("id", entryId)
          : supabaseClient.from("entries").insert(payload);
        const { data, error } = await query.select("id, tab_id, title, blocks, created_at, sort_order").single();
        if (error) throw error;
        storedEntry = { id: data.id, tabId: data.tab_id, title: data.title, blocks: data.blocks, createdAt: data.created_at, sortOrder: data.sort_order };
      } else {
        storedEntry = { id: entryId, tabId: entryTabId, title: payload.title, blocks: preparedBlocks.map(block => ({ ...block, file: undefined })), createdAt, sortOrder: payload.sort_order };
      }
      if (editingEntryId) {
        setTabs(current => current.map(tab => ({ ...tab, entries: tab.entries.map(entry => entry.id === editingEntryId ? storedEntry : entry) })));
        const retainedPaths = new Set(preparedBlocks.map(block => block.storagePath).filter(Boolean));
        const candidateRemovedPaths = (existingEntry.blocks || []).map(block => block.storagePath).filter(path => path && !retainedPaths.has(path));
        const removedPaths = filterUnreferencedPaths(candidateRemovedPaths, tabs, { excludeEntryId: editingEntryId });
        if (removedPaths.length && supabaseClient) {
          const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(removedPaths);
          if (cleanupError) {
            console.error("El registro se actualizó, pero no se pudieron limpiar algunos archivos anteriores.", cleanupError);
            mediaCleanupFailed = true;
          }
        }
      } else {
        updateCurrentTab(tab => ({ ...tab, entries: [...tab.entries, storedEntry] }));
      }
      setBlocks([]);
      setEntryTitle("");
      setEditingEntryId(null);
      if (!supabaseClient) {
        const localTabs = tabs.map(tab => editingEntryId ? {
          ...tab,
          entries: tab.entries.map(entry => entry.id === editingEntryId ? storedEntry : entry),
        } : tab.id === activeTabId ? { ...tab, entries: [...tab.entries, storedEntry] } : tab);
        persistLocalTabs(localTabs);
      }
      if (mediaCleanupFailed) {
        setNotice({ type: "error", message: "Los cambios se guardaron, pero no se pudieron limpiar algunos archivos multimedia anteriores." });
      } else if (editingEntryId) {
        setNotice({ type: "success", message: "Cambios guardados." });
      } else if (!editingEntryId) {
        setNotice({ type: "success", message: "Avance guardado." });
      }
    } catch (error) {
      if (uploadedPaths.length && supabaseClient) {
        const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(uploadedPaths);
        if (cleanupError) console.error("No se pudieron limpiar archivos multimedia tras fallar el guardado.", cleanupError);
      }
      setNotice({ type: "error", message: `No se pudo guardar el avance: ${error.message}` });
    } finally { setSaving(false); }
  }

  function editEntry(entry) {
    setEditingEntryId(entry.id);
    setEntryTitle(entry.title);
    const usedBlockIds = new Set();
    setBlocks(entry.blocks.map(block => {
      let id = block.id;
      while (typeof id !== "string" || !id || usedBlockIds.has(id)) id = newId();
      usedBlockIds.add(id);
      return { ...block, id, file: null, previewUrl: "" };
    }));
    window.requestAnimationFrame(() => document.querySelector(".editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEditing() {
    setBlocks([]);
    setEntryTitle("");
    setEditingEntryId(null);
  }

  async function deleteEntry(entry) {
    if (deletionLockRef.current) {
      setNotice({ type: "error", message: "Espera a que termine la eliminación en curso antes de borrar otro elemento." });
      return;
    }
    deletionLockRef.current = true;
    setDeletionInProgress(true);
    setDeletingEntryId(entry.id);
    try {
      let mediaCleanupError = "";
      if (supabaseClient) {
        const { error } = await supabaseClient.from("entries").delete().eq("id", entry.id);
        if (error) { setNotice({ type: "error", message: "No se pudo eliminar el registro." }); return; }
        const paths = filterUnreferencedPaths(
          entry.blocks.map(block => block.storagePath),
          tabs,
          { excludeEntryId: entry.id },
        );
        if (paths.length) {
          try {
            const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(paths);
            if (cleanupError) throw cleanupError;
          } catch (error) {
            console.error("Se eliminó el registro, pero no se pudieron limpiar algunos archivos multimedia.", error);
            mediaCleanupError = error.message || "Error desconocido de Storage.";
          }
        }
      }
      setTabs(current => {
        const next = current.map(tab => tab.id === activeTabId ? { ...tab, entries: tab.entries.filter(item => item.id !== entry.id) } : tab);
        persistLocalTabs(next);
        return next;
      });
      setNotice(mediaCleanupError
        ? { type: "error", message: `Registro eliminado, pero no se pudieron limpiar algunos archivos multimedia: ${mediaCleanupError}` }
        : { type: "success", message: "Registro eliminado." });
    } catch (error) {
      console.error("No se pudo eliminar el registro.", error);
      setNotice({ type: "error", message: `No se pudo eliminar el registro: ${error.message || "error desconocido."}` });
    } finally {
      deletionLockRef.current = false;
      setDeletionInProgress(false);
      setDeletingEntryId(null);
    }
  }

  function validateTabTitleInput({ mode, weekNumber, customTitle, excludeTabId = null }) {
    if (mode === "number") {
      const parsed = Number.parseInt(String(weekNumber).trim(), 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
        return { error: "Ingresa un número de semana válido (entre 1 y 999)." };
      }
      const title = formatWeekTitle(parsed);
      const duplicate = tabs.find(item => item.id !== excludeTabId && item.id !== "portada" && (getExplicitWeekNumber(item) === parsed || item.title.trim().toLowerCase() === title.toLowerCase()));
      if (duplicate) {
        return { error: `Ya existe ${title}. Elige un número diferente.` };
      }
      return { title, autoWeekNumber: parsed };
    }

    const title = String(customTitle || "").trim().replace(/\s+/g, " ");
    if (!title) {
      return { error: "Escribe un nombre para la semana o sección." };
    }
    if (title.length > 60) {
      return { error: "El nombre debe tener máximo 60 caracteres." };
    }
    if (["portada", "portada general"].includes(title.toLowerCase())) {
      return { error: "Ese nombre está reservado para la portada." };
    }
    const duplicate = tabs.find(item => item.id !== excludeTabId && item.id !== "portada" && item.title.trim().toLowerCase() === title.toLowerCase());
    if (duplicate) {
      return { error: `Ya existe una sección llamada "${title}".` };
    }
    return { title, autoWeekNumber: getExplicitWeekNumber({ id: "tmp", title }) };
  }

  async function createTab({ mode = "number", weekNumber, customTitle = "", insertAfterTabId = "__end__" } = {}) {
    const validation = validateTabTitleInput({
      mode,
      weekNumber: weekNumber ?? getNextWeekNumber(tabs),
      customTitle,
    });
    if (validation.error) {
      setNotice({ type: "error", message: validation.error });
      return false;
    }

    const newTab = {
      id: `semana-${Date.now()}`,
      title: validation.title,
      isDeletable: true,
      sortOrder: getNextSortOrder(tabs),
      entries: [],
    };
    const { nextTabs, orderedNonPortada } = computeOrderedTabs(tabs, newTab, insertAfterTabId, validation.autoWeekNumber);
    const createdTab = orderedNonPortada.find(item => item.id === newTab.id) || newTab;
    const changedExistingTabs = orderedNonPortada.filter(item => {
      if (item.id === newTab.id) return false;
      const prev = tabs.find(tab => tab.id === item.id);
      return prev && prev.sortOrder !== item.sortOrder;
    });

    if (supabaseClient) {
      const { error: insertError } = await supabaseClient
        .from("tabs")
        .insert({ id: createdTab.id, title: createdTab.title, is_deletable: true, sort_order: createdTab.sortOrder });
      if (insertError) {
        setNotice({ type: "error", message: `No se pudo crear la sección: ${insertError.message}` });
        return false;
      }
      if (changedExistingTabs.length) {
        const reorderResults = await Promise.all(
          changedExistingTabs.map(item =>
            supabaseClient.from("tabs").update({ sort_order: item.sortOrder }).eq("id", item.id)
          )
        );
        const reorderError = reorderResults.find(res => res.error)?.error;
        if (reorderError) {
          console.error("Se creó la sección, pero no se pudo actualizar el orden de las demás.", reorderError);
        }
      }
    }

    setTabs(nextTabs);
    persistLocalTabs(nextTabs);
    setActiveTabId(createdTab.id);
    setNotice({ type: "success", message: `Se creó "${createdTab.title}".` });
    return true;
  }

  async function updateTab(tabId, { mode = "number", weekNumber, customTitle = "", insertAfterTabId = "__keep__" } = {}) {
    const tab = tabs.find(item => item.id === tabId);
    if (!tab || tab.id === "portada") return false;

    const validation = validateTabTitleInput({
      mode,
      weekNumber,
      customTitle,
      excludeTabId: tabId,
    });
    if (validation.error) {
      setNotice({ type: "error", message: validation.error });
      return false;
    }

    const updatedTarget = { ...tab, title: validation.title };
    const { nextTabs, orderedNonPortada } = computeOrderedTabs(tabs, updatedTarget, insertAfterTabId, validation.autoWeekNumber);
    const finalTarget = orderedNonPortada.find(item => item.id === tabId) || updatedTarget;
    const changedTabs = orderedNonPortada.filter(item => {
      const prev = tabs.find(existing => existing.id === item.id);
      return !prev || prev.title !== item.title || prev.sortOrder !== item.sortOrder;
    });

    if (!changedTabs.length) {
      setNotice({ type: "success", message: `Sin cambios en "${finalTarget.title}".` });
      return true;
    }

    if (supabaseClient) {
      const updateResults = await Promise.all(
        changedTabs.map(item =>
          item.id === tabId
            ? supabaseClient.from("tabs").update({ title: item.title, sort_order: item.sortOrder }).eq("id", item.id)
            : supabaseClient.from("tabs").update({ sort_order: item.sortOrder }).eq("id", item.id)
        )
      );
      const failed = updateResults.find(res => res.error)?.error;
      if (failed) {
        setNotice({ type: "error", message: `No se pudo actualizar la semana: ${failed.message}` });
        return false;
      }
    }

    setTabs(nextTabs);
    persistLocalTabs(nextTabs);
    setNotice({ type: "success", message: `Actualizado a "${finalTarget.title}".` });
    return true;
  }

  async function transferEntries({ entryIds, sourceTabId, targetTabId, mode = "copy" }) {
    if (deletionLockRef.current || transferBusy || saving) {
      setNotice({ type: "error", message: "Espera a que termine la operación actual antes de continuar." });
      return false;
    }
    const sourceTab = tabs.find(tab => tab.id === sourceTabId);
    const entryIdSet = new Set(entryIds || []);
    const sourceEntries = (sourceTab?.entries || []).filter(entry => entryIdSet.has(entry.id));
    if (!sourceEntries.length) {
      setNotice({ type: "error", message: "No se encontraron registros para transferir." });
      return false;
    }

    setTransferBusy(true);
    try {
      let targetTab = null;
      let createdNewTab = null;

      if (targetTabId === "__new__") {
        const week = getNextWeekNumber(tabs);
        const sortOrder = getNextSortOrder(tabs);
        const newTab = { id: `semana-${Date.now()}`, title: formatWeekTitle(week), isDeletable: true, sortOrder, entries: [] };
        if (supabaseClient) {
          const { error: createTabError } = await supabaseClient
            .from("tabs")
            .insert({ id: newTab.id, title: newTab.title, is_deletable: true, sort_order: sortOrder });
          if (createTabError) throw createTabError;
        }
        createdNewTab = newTab;
        targetTab = newTab;
        setTabs(current => {
          const next = sortTabs([...current, newTab]);
          persistLocalTabs(next);
          return next;
        });
      } else {
        targetTab = tabs.find(tab => tab.id === targetTabId);
      }

      if (!targetTab || targetTab.id === "portada" || targetTab.id === sourceTabId) {
        setNotice({ type: "error", message: "Selecciona una semana destino válida." });
        return false;
      }

      const baseSortOrder = (targetTab.entries || []).reduce((highest, entry) => Math.max(highest, entry.sortOrder ?? -1), -1) + 1;
      const count = sourceEntries.length;
      const countLabel = count === 1 ? "el registro" : `${count} registros`;

      if (mode === "move") {
        if (supabaseClient) {
          const updateResults = await Promise.all(
            sourceEntries.map((entry, idx) =>
              supabaseClient
                .from("entries")
                .update({ tab_id: targetTab.id, sort_order: baseSortOrder + idx })
                .eq("id", entry.id)
                .select("id, tab_id, title, blocks, created_at, sort_order")
                .single()
            )
          );
          const failed = updateResults.find(result => result.error);
          if (failed?.error) throw failed.error;
        }

        const movedEntries = sourceEntries.map((entry, idx) => ({
          ...entry,
          tabId: targetTab.id,
          sortOrder: baseSortOrder + idx,
        }));

        if (editingEntryId && entryIdSet.has(editingEntryId)) {
          cancelEditing();
        }

        setPendingEntryOrders(current => {
          const next = { ...current };
          delete next[sourceTabId];
          delete next[targetTab.id];
          return next;
        });

        setTabs(current => {
          const hasTarget = current.some(tab => tab.id === targetTab.id);
          const baseList = hasTarget || !createdNewTab ? current : [...current, createdNewTab];
          const next = sortTabs(baseList.map(tab => {
            if (tab.id === sourceTabId) {
              const remaining = tab.entries
                .filter(entry => !entryIdSet.has(entry.id))
                .map((entry, idx) => ({ ...entry, sortOrder: idx }));
              return { ...tab, entries: remaining };
            }
            if (tab.id === targetTab.id) {
              return { ...tab, entries: [...tab.entries, ...movedEntries] };
            }
            return tab;
          }));
          persistLocalTabs(next);
          return next;
        });

        setNotice({
          type: "success",
          message: count === 1
            ? `Se movió ${countLabel} a ${targetTab.title}.`
            : `Se movieron ${countLabel} a ${targetTab.title}.`,
        });
        return true;
      }

      const nowMs = Date.now();
      const preparedCopies = sourceEntries.map((entry, idx) => ({
        id: newId(),
        tab_id: targetTab.id,
        title: entry.title,
        blocks: (entry.blocks || []).map(block => ({
          ...blockForStorage(block),
          id: newId(),
        })),
        created_at: new Date(nowMs + idx).toISOString(),
        sort_order: baseSortOrder + idx,
      }));

      let insertedEntries = [];
      if (supabaseClient) {
        const rowsToInsert = preparedCopies.map(({ id: _localId, ...row }) => row);
        const { data, error } = await supabaseClient
          .from("entries")
          .insert(rowsToInsert)
          .select("id, tab_id, title, blocks, created_at, sort_order");
        if (error) throw error;
        insertedEntries = [...(data || [])]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(row => ({
            id: row.id,
            tabId: row.tab_id,
            title: row.title,
            blocks: Array.isArray(row.blocks) ? row.blocks : [],
            createdAt: row.created_at,
            sortOrder: row.sort_order,
          }));
      } else {
        insertedEntries = preparedCopies.map(row => ({
          id: row.id,
          tabId: row.tab_id,
          title: row.title,
          blocks: row.blocks,
          createdAt: row.created_at,
          sortOrder: row.sort_order,
        }));
      }

      setTabs(current => {
        const hasTarget = current.some(tab => tab.id === targetTab.id);
        const baseList = hasTarget || !createdNewTab ? current : [...current, createdNewTab];
        const next = sortTabs(baseList.map(tab => tab.id === targetTab.id
          ? { ...tab, entries: [...tab.entries, ...insertedEntries] }
          : tab));
        persistLocalTabs(next);
        return next;
      });

      setNotice({
        type: "success",
        message: count === 1
          ? `Se copió ${countLabel} a ${targetTab.title}.`
          : `Se copiaron ${countLabel} a ${targetTab.title}.`,
      });
      return true;
    } catch (error) {
      console.error("No se pudieron transferir los registros.", error);
      setNotice({
        type: "error",
        message: `No se pudo ${mode === "move" ? "mover" : "copiar"} la información: ${error.message || "error desconocido."}`,
      });
      return false;
    } finally {
      setTransferBusy(false);
    }
  }

  async function deleteTab(tabId) {
    const tab = tabs.find(item => item.id === tabId);
    if (!tab?.isDeletable) return;
    if (deletionLockRef.current) {
      setNotice({ type: "error", message: "Espera a que termine la eliminación en curso antes de borrar otro elemento." });
      return;
    }
    deletionLockRef.current = true;
    setDeletionInProgress(true);
    setDeletingTabId(tabId);
    try {
      let mediaCleanupError = "";
      if (supabaseClient) {
        const { data: rows, error: readError } = await supabaseClient.from("entries").select("blocks").eq("tab_id", tabId);
        if (readError) { setNotice({ type: "error", message: "No se pudieron consultar los archivos de la semana." }); return; }
        const rawPaths = (rows || []).flatMap(row => row.blocks.map(block => block.storagePath).filter(Boolean));
        const paths = filterUnreferencedPaths(rawPaths, tabs, { excludeTabId: tabId });
        const { error: entriesError } = await supabaseClient.from("entries").delete().eq("tab_id", tabId);
        if (entriesError) { setNotice({ type: "error", message: "No se pudieron eliminar los registros de la semana." }); return; }
        if (paths.length) {
          try {
            const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(paths);
            if (cleanupError) throw cleanupError;
          } catch (error) {
            console.error("Se eliminaron los registros, pero no se pudieron limpiar algunos archivos multimedia.", error);
            mediaCleanupError = error.message || "Error desconocido de Storage.";
          }
        }
        const { error: tabError } = await supabaseClient.from("tabs").delete().eq("id", tabId);
        if (tabError) {
          setNotice({ type: "error", message: mediaCleanupError
            ? `No se pudo eliminar la semana; además, falló la limpieza de archivos: ${mediaCleanupError}`
            : "No se pudo eliminar la semana." });
          return;
        }
      }
      setTabs(current => {
        const next = current.filter(item => item.id !== tabId);
        persistLocalTabs(next);
        return next;
      });
      setActiveTabId(current => current === tabId ? "portada" : current);
      setNotice(mediaCleanupError
        ? { type: "error", message: `Semana eliminada, pero no se pudieron limpiar algunos archivos multimedia: ${mediaCleanupError}` }
        : { type: "success", message: "Semana eliminada." });
    } catch (error) {
      console.error(`No se pudo eliminar la semana ${tab.title}.`, error);
      setNotice({ type: "error", message: `No se pudo eliminar la semana: ${error.message || "error desconocido."}` });
    } finally {
      deletionLockRef.current = false;
      setDeletionInProgress(false);
      setDeletingTabId(null);
    }
  }

  const dialogRef = authDialogRef;
  const editor = {
    title: entryTitle,
    setTitle: setEntryTitle,
    blocks,
    saving,
    addBlock,
    editing: Boolean(editingEntryId),
    clear: cancelEditing,
    save: saveEntry,
    pendingEntryOrders,
    savingEntryOrder,
    reorder: reorderEntries,
    saveOrder: saveEntryOrder,
    blockProps: { blocks, onChange: changeBlock, onRemove: removeBlock, onReorder: reorderBlocks, onAddIdea: addIdea, onRemoveIdea: removeIdea, onImage: addImage, onVideo: addVideo, onDownload: addDownload, disabled: saving },
  };

  return (
    <>
      <SiteHeader page={page} authenticated={authenticated} onAuthClick={authenticated ? logout : showLogin} />
      {page === "about" || page === "final-project" ? (
        <Suspense fallback={<main className="inner-page" role="status">Cargando contenido…</main>}>
          <EditablePage page={page} authenticated={authenticated} />
        </Suspense>
      ) : (
        <HomePage
          tabs={tabs}
          activeTabId={activeTabId}
          setActiveTabId={setActiveTabId}
          authenticated={authenticated}
          onCreateTab={createTab}
          onDeleteTab={deleteTab}
          onUpdateTab={updateTab}
          onTransferEntries={transferEntries}
          transferBusy={transferBusy}
          entries={{ delete: deleteEntry, edit: editEntry, reorder: reorderEntries, saveOrder: saveEntryOrder, pendingEntryOrders, savingEntryOrder, deletingEntryId, deletionInProgress }}
          editor={editor}
          loading={loading}
          teamMembers={teamMembers}
          deletionInProgress={deletionInProgress}
          deletingTabId={deletingTabId}
        />
      )}
      <footer className="site-footer">FabLab I+D <span>/</span> Investigación, diseño y desarrollo</footer>
      {notice && <div className={`toast toast-${notice.type}`} role="status" aria-live="polite">{notice.message}</div>}
      <dialog className="auth-dialog" ref={dialogRef} onClose={() => setAuthError("")}>
        <form className="auth-form" onSubmit={submitLogin}>
          <button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Cerrar">×</button>
          <span className="eyebrow">Área privada</span><h2>Entrar al laboratorio</h2>
          <p className="dialog-copy">Inicia sesión para habilitar la edición del proyecto.</p>
          <LabelInput label="Correo del equipo" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required />
          <LabelInput label="Contraseña" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required minLength={8} showPasswordToggle />
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={authBusy}>{authBusy ? "Verificando…" : "Continuar"}</button>
          <small className="demo-label">{supabaseClient ? "Autenticación gestionada por Supabase." : "Supabase no está configurado."}</small>
        </form>
      </dialog>
    </>
  );
}
