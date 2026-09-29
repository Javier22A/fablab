import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "./lib/supabase.js";
import { BASE_URL, publicAsset } from "./lib/paths.js";
import BlockEditor from "./components/BlockEditor.jsx";
import LabelInput from "./components/LabelInput.jsx";
import SiteHeader from "./components/SiteHeader.jsx";

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

function sanitizeLegacyHtml(html) {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(html, "text/html");
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "P", "BR", "UL", "OL", "LI", "H3", "H4", "BLOCKQUOTE"]);
  documentFragment.body.querySelectorAll("*").forEach(element => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
  });
  return documentFragment.body.innerHTML;
}

function mediaUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.href);
    return ["https:", "http:", "blob:", "data:"].includes(parsed.protocol) ? value : "";
  } catch {
    return "";
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
    return { type: block.type, fileName: block.fileName, mimeType: block.mimeType, alt: block.alt, storagePath: uploadedMedia?.storagePath || block.storagePath || null, url: uploadedMedia?.url || block.url || null };
  }
  if (block.type === "text") return { type: "text", content: block.content };
  return { type: "comparison", title: block.title, ideas: block.ideas.map(idea => ({ ...idea })) };
}

function EntryBlocks({ blocks }) {
  return blocks.map((block, index) => {
    if (block.type === "image") {
      const source = mediaUrl(block.url || block.dataUrl);
      return source ? <figure className="content-image" key={block.id || index}><img src={source} alt={block.alt || "Evidencia visual"} /><figcaption>{block.fileName || "Evidencia visual"}</figcaption></figure> : null;
    }
    if (block.type === "video") {
      const source = mediaUrl(block.url || block.previewUrl);
      return source ? <figure className="content-video" key={block.id || index}><video controls preload="metadata" src={source} /><figcaption>{block.fileName || "Video de evidencia"}</figcaption></figure> : null;
    }
    if (block.type === "comparison") {
      return (
        <section className="content-comparison" key={block.id || index}>
          <div className="comparison-heading"><span className="block-kicker">Matriz de decisión</span><h4>{block.title}</h4></div>
          <div className="comparison-grid">{(block.ideas || []).map((idea, ideaIndex) => (
            <div className="comparison-card" key={`${block.id || index}-${ideaIndex}`}>
              <h5>{idea.title}</h5><p>{idea.description}</p>
              <div className="comparison-pro"><b>A favor</b>{idea.pros}</div>
              <div className="comparison-con"><b>Riesgos</b>{idea.cons}</div>
            </div>
          ))}</div>
        </section>
      );
    }
    return <div className="content-text" key={block.id || index} dangerouslySetInnerHTML={{ __html: sanitizeLegacyHtml(block.content || "") }} />;
  });
}

function HomePage({ tabs, activeTabId, setActiveTabId, authenticated, onCreateTab, onDeleteTab, entries, editor, loading }) {
  const currentTab = tabs.find(tab => tab.id === activeTabId);
  const allEntries = tabs.reduce((count, tab) => count + tab.entries.length, 0);
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación del proyecto">
        <div className="sidebar-intro"><span className="eyebrow">Proyecto 2026</span><h1>Diario de campo</h1><p>Decisiones, pruebas y aprendizajes documentados semana a semana.</p></div>
        <div className="sidebar-section">
          <div className="section-heading"><span className="eyebrow">Recorrido</span><span className="count-label">{Math.max(0, tabs.length - 1)} semanas</span></div>
          {loading ? <p className="loading-copy">Conectando con la bitácora…</p> : <ul className="tab-list">{tabs.map(tab => <li key={tab.id}><button className={`tab-button ${tab.id === activeTabId ? "active" : ""}`} type="button" onClick={() => setActiveTabId(tab.id)}><span>{tab.title}</span><span className="tab-arrow">↗</span></button></li>)}</ul>}
        </div>
        {authenticated && <div className="sidebar-section admin-controls"><span className="eyebrow">Gestión</span><button className="button button-secondary button-wide" type="button" onClick={onCreateTab}>+ Añadir semana</button><button className="button button-danger button-wide" type="button" onClick={onDeleteTab}>Eliminar semana actual</button></div>}
        <div className="sidebar-note"><span className="note-dot" /><p>Un buen prototipo también deja registro de lo que no funcionó.</p></div>
      </aside>
      <main className="main-content">
        {loading ? <div className="public-empty animate-in" role="status"><span className="empty-icon">◌</span><h3>Cargando la bitácora</h3><p>Conectando con Supabase para traer semanas y registros.</p></div> : activeTabId === "portada" ? <HomeLanding weekCount={tabs.length - 1} entryCount={allEntries} /> : (
          <>
            <div className="page-heading animate-in"><span className="eyebrow">Registro semanal</span><h2>{currentTab?.title || "Semana"}</h2><span className="heading-line" /></div>
            {currentTab?.entries.length ? currentTab.entries.map(entry => (
              <article className="entry-card animate-in" key={entry.id}>
                <div className="entry-meta"><span>Registro de avance</span><time>{new Date(entry.createdAt || Date.now()).toLocaleDateString("es-EC")}</time></div>
                <h3>{entry.title}</h3><EntryBlocks blocks={entry.blocks || []} />
                {authenticated && (
                  <div className="entry-actions">
                    <button className="entry-edit" type="button" onClick={() => entries.edit(entry)}>Editar</button>
                    <button className="entry-delete" type="button" onClick={() => entries.delete(entry)}>Eliminar registro</button>
                  </div>
                )}
              </article>
            )) : <div className="public-empty animate-in"><span className="empty-icon">○</span><h3>Aún no hay registros publicados</h3><p>El primer avance de esta semana aparecerá aquí.</p></div>}
            {authenticated && <EditorPanel tabTitle={currentTab?.title || "Semana"} editor={editor} />}
          </>
        )}
      </main>
    </div>
  );
}

function HomeLanding({ weekCount, entryCount }) {
  return (
    <>
      <section className="hero-panel animate-in"><span className="eyebrow">Investigación y desarrollo / 2026</span><h2>Del problema al prototipo.</h2><p>Una bitácora abierta sobre decisiones, pruebas y aprendizajes detrás de un producto nuevo.</p><div className="hero-stats"><span><strong>{weekCount}</strong> semanas documentadas</span><span><strong>{entryCount}</strong> registros publicados</span></div></section>
      <section className="intro-grid animate-in"><div className="section-heading"><span className="eyebrow">Equipo de trabajo</span><h3>Cuatro miradas, un objetivo.</h3></div><div className="team-list">{TEAM.map((name, index) => <div className="team-member" key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>Investigación / Desarrollo</small></div>)}</div></section>
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
      <p className="drop-hint">Puedes adjuntar imágenes o videos desde el área de carga.</p>
      {editor.blocks.length ? <BlockEditor {...editor.blockProps} /> : <div className="editor-empty-state"><span className="empty-icon">+</span><strong>Tu registro empieza aquí</strong><p>Añade un párrafo, una evidencia visual, un video o una comparación.</p></div>}
      <div className="editor-footer"><button className="button button-ghost" type="button" onClick={editor.clear}>{editor.editing ? "Cancelar edición" : "Limpiar borrador"}</button><button className="button button-primary" type="button" disabled={editor.saving} onClick={editor.save}>{editor.saving ? "Guardando…" : editor.editing ? "Guardar cambios" : "Guardar avance"}</button></div>
    </section>
  );
}

function AboutPage() {
  return <main className="inner-page about-layout"><section className="team-photo-card" aria-label="Imagen del equipo"><div className="team-photo-frame"><img src={publicAsset("images/logofablab.jpg")} alt="Logo FabLab, imagen provisional del equipo" /></div><div className="photo-caption"><span className="eyebrow">El equipo</span><strong>Aquí irá la fotografía del equipo.</strong><small>Este espacio queda reservado para la imagen vertical de los integrantes.</small></div></section><section className="about-copy"><span className="eyebrow">Información general / FabLab I+D</span><h1>Sobre<br />nosotros.</h1><p className="lead">Aquí irá una descripción general del equipo, sus objetivos y el contexto de la materia.</p><div className="role-list"><article className="role-item"><span>01</span><div><h2>Quiénes somos</h2><p>Aquí irá una presentación breve de los integrantes y sus responsabilidades.</p></div></article><article className="role-item"><span>02</span><div><h2>Qué hacemos</h2><p>Aquí irá una explicación general del trabajo de investigación y desarrollo.</p></div></article><article className="role-item"><span>03</span><div><h2>Cómo trabajamos</h2><p>Aquí irá una descripción del proceso, las herramientas y la forma de documentar los avances.</p></div></article></div><div className="team-names">{TEAM.map(name => <span key={name}>{name}</span>)}</div></section></main>;
}

function FinalProjectPage() {
  return <main className="inner-page project-page"><section className="project-hero"><span className="eyebrow">Proyecto final / I+D</span><h1>Aquí irá la información<br />del proyecto final.</h1><p>Aquí irá una descripción general del producto, la propuesta desarrollada y los resultados principales.</p><a className="button button-primary" href={`${BASE_URL}index.html`}>Ver la bitácora semanal</a></section><section className="project-grid"><article className="project-card project-card-wide"><span className="eyebrow">01 / El problema</span><h2>Aquí irá el problema identificado.</h2><p>En este espacio se explicará la necesidad o situación que dio origen al proyecto.</p></article><article className="project-card"><span className="eyebrow">02 / El proceso</span><h2>Aquí irá la metodología.</h2><p>En este espacio se resumirán las etapas de investigación, ideación y validación.</p></article><article className="project-card"><span className="eyebrow">03 / El resultado</span><h2>Aquí irá la propuesta final.</h2><p>En este espacio se presentarán las características y conclusiones principales.</p></article></section></main>;
}

export default function App({ page = "home" }) {
  const [tabs, setTabs] = useState(() => supabaseClient ? [] : readLegacyData().tabs);
  const [activeTabId, setActiveTabId] = useState("portada");
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabaseClient));
  const [blocks, setBlocks] = useState([]);
  const [entryTitle, setEntryTitle] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const authDialogRef = useRef(null);
  const authenticated = Boolean(session);

  useEffect(() => {
    let mounted = true;
    let authSubscription;

    if (page !== "home") {
      setLoading(false);
      return () => { mounted = false; };
    }

    async function loadRemoteData() {
      if (!supabaseClient) {
        const saved = readLegacyData();
        if (mounted) { setTabs(saved.tabs); setLoading(false); }
        return;
      }

      const [tabsResult, entriesResult] = await Promise.all([
        supabaseClient.from("tabs").select("id, title, is_deletable, sort_order").order("sort_order", { ascending: true }),
        supabaseClient.from("entries").select("id, tab_id, title, blocks, created_at").order("created_at", { ascending: true }),
      ]);
      if (!mounted) return;
      if (tabsResult.error || entriesResult.error) {
        setNotice({ type: "error", message: tabsResult.error ? "No se pudieron cargar las semanas de Supabase." : "No se pudieron cargar los registros de Supabase." });
        console.error(tabsResult.error || entriesResult.error);
        setLoading(false);
        return;
      }

      const entries = entriesResult.data.map(entry => ({ id: entry.id, tabId: entry.tab_id, title: entry.title, blocks: Array.isArray(entry.blocks) ? entry.blocks : [], createdAt: entry.created_at }));
      setTabs(tabsResult.data.map(tab => ({ id: tab.id, title: tab.title, isDeletable: tab.is_deletable, entries: entries.filter(entry => entry.tabId === tab.id) })));
      setLoading(false);
    }

    loadRemoteData();
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
      const payload = { tab_id: entryTabId, title: entryTitle.trim() || "Registro de actividad", blocks: preparedBlocks, created_at: createdAt };
      let storedEntry;
      if (supabaseClient) {
        const query = editingEntryId
          ? supabaseClient.from("entries").update({ title: payload.title, blocks: preparedBlocks }).eq("id", entryId)
          : supabaseClient.from("entries").insert(payload);
        const { data, error } = await query.select("id, tab_id, title, blocks, created_at").single();
        if (error) throw error;
        storedEntry = { id: data.id, tabId: data.tab_id, title: data.title, blocks: data.blocks, createdAt: data.created_at };
      } else {
        storedEntry = { id: entryId, tabId: entryTabId, title: payload.title, blocks: preparedBlocks.map(block => ({ ...block, file: undefined })), createdAt };
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
    setBlocks(entry.blocks.map(block => ({
      ...block,
      id: block.id || newId(),
      file: null,
      previewUrl: "",
    })));
    window.requestAnimationFrame(() => document.querySelector(".editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEditing() {
    setBlocks([]);
    setEntryTitle("");
    setEditingEntryId(null);
  }

  async function deleteEntry(entry) {
    if (!window.confirm("¿Eliminar este registro y sus archivos multimedia?")) return;
    if (supabaseClient) {
      const { error } = await supabaseClient.from("entries").delete().eq("id", entry.id);
      if (error) { setNotice({ type: "error", message: "No se pudo eliminar el registro." }); return; }
      const paths = entry.blocks.map(block => block.storagePath).filter(Boolean);
      if (paths.length) await supabaseClient.storage.from("project-media").remove(paths);
    }
    updateCurrentTab(tab => ({ ...tab, entries: tab.entries.filter(item => item.id !== entry.id) }));
    setNotice({ type: "success", message: "Registro eliminado." });
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

  async function deleteTab() {
    const tab = tabs.find(item => item.id === activeTabId);
    if (!tab?.isDeletable || !window.confirm(`¿Eliminar ${tab.title} y sus registros?`)) return;
    if (supabaseClient) {
      const { data: rows, error: readError } = await supabaseClient.from("entries").select("blocks").eq("tab_id", activeTabId);
      if (readError) { setNotice({ type: "error", message: "No se pudieron consultar los archivos de la semana." }); return; }
      const paths = (rows || []).flatMap(row => row.blocks.map(block => block.storagePath).filter(Boolean));
      const { error: entriesError } = await supabaseClient.from("entries").delete().eq("tab_id", activeTabId);
      if (entriesError) { setNotice({ type: "error", message: "No se pudieron eliminar los registros de la semana." }); return; }
      if (paths.length) await supabaseClient.storage.from("project-media").remove(paths);
      const { error: tabError } = await supabaseClient.from("tabs").delete().eq("id", activeTabId);
      if (tabError) { setNotice({ type: "error", message: "No se pudo eliminar la semana." }); return; }
    }
    setTabs(current => current.filter(item => item.id !== activeTabId));
    setActiveTabId("portada");
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
    blockProps: { blocks, onChange: changeBlock, onRemove: removeBlock, onAddIdea: addIdea, onRemoveIdea: removeIdea, onImage: addImage, onVideo: addVideo },
  };

  return (
    <>
      <SiteHeader page={page} authenticated={authenticated} onAuthClick={authenticated ? logout : showLogin} />
      {page === "about" ? <AboutPage /> : page === "final-project" ? <FinalProjectPage /> : <HomePage tabs={tabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} authenticated={authenticated} onCreateTab={createTab} onDeleteTab={deleteTab} entries={{ delete: deleteEntry, edit: editEntry }} editor={editor} loading={loading} />}
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
