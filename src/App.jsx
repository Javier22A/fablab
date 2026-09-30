import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabaseClient } from "./lib/supabase.js";
import { BASE_URL } from "./lib/paths.js";
import { sanitizeRichText } from "./lib/richText.js";
import LabelInput from "./components/LabelInput.jsx";
import AnimatedHeading from "./components/AnimatedHeading.jsx";
import DeleteFuseButton from "./components/DeleteFuseButton.jsx";
import SiteHeader from "./components/SiteHeader.jsx";

const MicroSlats = lazy(() => import("./components/MicroSlats.jsx"));
const BlockEditor = lazy(() => import("./components/BlockEditor.jsx"));
const EntryList = lazy(() => import("./components/EntryList.jsx"));
const EditablePage = lazy(() => import("./components/EditablePage.jsx"));

const DATA_KEY = "proyecto_id_data";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const DEFAULT_TABS = [
  { id: "portada", title: "Portada General", isDeletable: false, entries: [] },
  { id: "semana-1", title: "Semana 01", isDeletable: true, entries: [] },
];
const TEAM = ["Javier Abad", "Steven Giron", "Francisco Siguenza", "Juan Pablo Quinteros"];

function newId() {
  return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeBlock(type) {
  const id = newId();
  if (type === "image") return { id, type, fileName: "", mimeType: "", alt: "Evidencia visual", dataUrl: "", file: null, previewUrl: "" };
  if (type === "video") return { id, type, fileName: "", mimeType: "", alt: "Video de evidencia", file: null, previewUrl: "" };
  if (type === "comparison") return { id, type, title: "Comparación de alternativas", ideas: [{ title: "Opción A", description: "", pros: "", cons: "" }] };
  return { id, type: "text", content: "" };
}

function readLegacyData() {
  try {
    const stored = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (!stored?.tabs?.length) return { tabs: DEFAULT_TABS };
    return { tabs: stored.tabs.map(tab => ({ ...tab, entries: (tab.entries || []).map(normalizeEntry) })) };
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
  if (block.type === "text") return { id: block.id, type: "text", content: sanitizeRichText(block.content) };
  return { id: block.id, type: "comparison", title: block.title, ideas: block.ideas.map(idea => ({ ...idea })) };
}

function HomePage({ tabs, activeTabId, setActiveTabId, authenticated, onCreateTab, onDeleteTab, entries, editor, loading, teamMembers, deletionInProgress, deletingTabId }) {
  const currentTab = tabs.find(tab => tab.id === activeTabId);
  const deletingTab = tabs.find(tab => tab.id === deletingTabId);
  const allEntries = tabs.reduce((count, tab) => count + tab.entries.length, 0);
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
            <button className="button button-secondary button-wide" type="button" disabled={deletionInProgress} onClick={onCreateTab}>+ Añadir semana</button>
            {deletingTabId
              ? <p className="delete-progress" role="status">Eliminando {deletingTab?.title || "semana"}…</p>
              : <DeleteFuseButton
                  key={currentTab?.id || "no-week"}
                  label="Eliminar semana actual"
                  size="md"
                  fullWidth
                  disabled={!currentTab?.isDeletable || deletionInProgress}
                  onCommit={() => { if (currentTab) void onDeleteTab(currentTab.id); }}
                />}
          </div>
        )}
        <div className="sidebar-note"><span className="note-dot" /><p>Un buen prototipo también deja registro de lo que no funcionó.</p></div>
      </aside>
      <main className="main-content">
        {loading ? <div className="public-empty animate-in" role="status"><span className="empty-icon">◌</span><h3>Cargando la bitácora</h3><p>Conectando con Supabase para traer semanas y registros.</p></div> : activeTabId === "portada" ? <HomeLanding weekCount={tabs.length - 1} entryCount={allEntries} teamMembers={teamMembers} /> : (
          <>
            <div className="page-heading animate-in"><span className="eyebrow">Registro semanal</span><h2>{currentTab?.title || "Semana"}</h2><span className="heading-line" /></div>
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
      <section className="intro-grid animate-in"><div className="section-heading"><span className="eyebrow">Equipo de trabajo</span><h3>Cuatro miradas, un objetivo.</h3></div><div className="team-list">{teamMembers.map((name, index) => <div className="team-member" key={`${name}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>Investigación / Desarrollo</small></div>)}</div></section>
    </>
  );
}

function EditorPanel({ tabTitle, editor }) {
  return (
    <section className="editor-panel">
      <div className="editor-heading"><div><span className="eyebrow">{editor.editing ? "Editar publicación" : "Modo de edición"}</span><h2>{editor.editing ? "Actualizar registro" : `Nuevo registro en ${tabTitle}`}</h2><p>Construye la entrada por bloques. Cada bloque se guarda como JSON en Supabase.</p></div><span className="editor-save-state">{editor.saving ? "Guardando…" : "Listo para editar"}</span></div>
      <label className="field-label" htmlFor="entryTitle">Título del registro</label>
      <input id="entryTitle" className="form-control title-input" value={editor.title} onChange={event => editor.setTitle(event.target.value)} maxLength={120} placeholder="Ej. Validación del primer mecanismo" />
      <div className="block-toolbar" aria-label="Añadir bloques"><span className="toolbar-label">Añadir bloque</span>{[["text", "Párrafo"], ["image", "Imagen"], ["video", "Video"], ["comparison", "Cuadro comparativo"]].map(([type, label]) => <button className="block-add-button" key={type} type="button" onClick={() => editor.addBlock(type)}>+ {label}</button>)}</div>
      <p className="drop-hint">Arrastra el asa de cada bloque para cambiar el orden. Puedes adjuntar imágenes o videos desde el área de carga.</p>
      {editor.blocks.length ? <Suspense fallback={<p className="drop-hint" role="status">Cargando herramientas del editor…</p>}><BlockEditor {...editor.blockProps} /></Suspense> : <div className="editor-empty-state"><span className="empty-icon">+</span><strong>Tu registro empieza aquí</strong><p>Añade un párrafo, una evidencia visual, un video o una comparación.</p></div>}
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
        supabaseClient.from("site_pages").select("content").eq("slug", "about").maybeSingle(),
      ]);
      if (!mounted) return;
      if (tabsResult.error || entriesResult.error) {
        setNotice({ type: "error", message: tabsResult.error ? "No se pudieron cargar las semanas de Supabase." : "No se pudieron cargar los registros de Supabase." });
        console.error(tabsResult.error || entriesResult.error);
        setLoading(false);
        return;
      }

      const entries = entriesResult.data.map((entry, index) => ({ id: entry.id, tabId: entry.tab_id, title: entry.title, blocks: Array.isArray(entry.blocks) ? entry.blocks : [], createdAt: entry.created_at, sortOrder: entry.sort_order ?? index }));
      setTabs(tabsResult.data.map(tab => ({ id: tab.id, title: tab.title, isDeletable: tab.is_deletable, entries: entries.filter(entry => entry.tabId === tab.id) })));
      if (aboutResult.error) {
        console.error("No se pudieron cargar los nombres del equipo desde About.", aboutResult.error);
        setNotice({ type: "error", message: "No se pudieron cargar los nombres del equipo desde About." });
      } else if (Array.isArray(aboutResult.data?.content?.teamNames)) {
        setTeamMembers(aboutResult.data.content.teamNames.filter(name => typeof name === "string" && name.trim()));
      }
      setLoading(false);
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

  async function uploadBlocks(entryId, sourceBlocks) {
    if (!supabaseClient) return { blocks: sourceBlocks.map(block => ({ ...block })), uploadedPaths: [] };
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error("No se encontró la sesión de Supabase.");

    const uploadedPaths = [];
    try {
      const preparedBlocks = [];
      for (const block of sourceBlocks) {
        if (!((block.type === "image" && block.file) || (block.type === "video" && block.file))) {
          preparedBlocks.push(blockForStorage(block));
          continue;
        }
        const safeName = block.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `${userId}/${entryId}/${newId()}-${safeName}`;
        const { error } = await supabaseClient.storage.from("project-media").upload(storagePath, block.file, { contentType: block.mimeType || "application/octet-stream", upsert: false });
        if (error) throw error;
        uploadedPaths.push(storagePath);
        const { data } = supabaseClient.storage.from("project-media").getPublicUrl(storagePath);
        preparedBlocks.push(blockForStorage({ ...block, url: data.publicUrl, storagePath }));
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
    const validBlocks = blocks.filter(block => block.type === "text" ? block.content.trim() : block.type === "image" ? block.file || block.url : block.type === "video" ? block.file || block.url : block.ideas.length > 0);
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
        const removedPaths = (existingEntry.blocks || []).map(block => block.storagePath).filter(path => path && !retainedPaths.has(path));
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
        localStorage.setItem(DATA_KEY, JSON.stringify({ tabs: localTabs }));
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
        const paths = entry.blocks.map(block => block.storagePath).filter(Boolean);
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
      updateCurrentTab(tab => ({ ...tab, entries: tab.entries.filter(item => item.id !== entry.id) }));
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

  async function createTab() {
    const maxWeek = tabs.reduce((highest, tab) => Math.max(highest, Number(tab.title.match(/(\d+)/)?.[1] || 0)), 0);
    const week = maxWeek + 1;
    const newTab = { id: `semana-${Date.now()}`, title: `Semana ${String(week).padStart(2, "0")}`, isDeletable: true, entries: [] };
    if (supabaseClient) {
      const { error } = await supabaseClient.from("tabs").insert({ id: newTab.id, title: newTab.title, is_deletable: true, sort_order: week });
      if (error) { setNotice({ type: "error", message: `No se pudo crear la semana: ${error.message}` }); return; }
    }
    setTabs(current => [...current, newTab]);
    setActiveTabId(newTab.id);
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
        const paths = (rows || []).flatMap(row => row.blocks.map(block => block.storagePath).filter(Boolean));
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
      setTabs(current => current.filter(item => item.id !== tabId));
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
    blockProps: { blocks, onChange: changeBlock, onRemove: removeBlock, onReorder: reorderBlocks, onAddIdea: addIdea, onRemoveIdea: removeIdea, onImage: addImage, onVideo: addVideo, disabled: saving },
  };

  return (
    <>
      <SiteHeader page={page} authenticated={authenticated} onAuthClick={authenticated ? logout : showLogin} />
      {page === "about" || page === "final-project" ? (
        <Suspense fallback={<main className="inner-page" role="status">Cargando contenido…</main>}>
          <EditablePage page={page} authenticated={authenticated} />
        </Suspense>
      ) : <HomePage tabs={tabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} authenticated={authenticated} onCreateTab={createTab} onDeleteTab={deleteTab} entries={{ delete: deleteEntry, edit: editEntry, reorder: reorderEntries, saveOrder: saveEntryOrder, pendingEntryOrders, savingEntryOrder, deletingEntryId, deletionInProgress }} editor={editor} loading={loading} teamMembers={teamMembers} deletionInProgress={deletionInProgress} deletingTabId={deletingTabId} />}
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
