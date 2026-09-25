const DATA_KEY = "proyecto_id_data";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const AUTH_MODE = window.supabaseClient ? "supabase" : "demo";

let isMemberAuthenticated = false;
let activeTabId = "portada";
let editorBlocks = [];

const DEFAULT_DATA = {
  tabs: [
    { id: "portada", title: "Portada General", isDeletable: false, entries: [] },
    { id: "semana-1", title: "Semana 01", isDeletable: true, entries: [] }
  ]
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function createBlock(type) {
  if (type === "image") return { type: "image", fileName: "", mimeType: "", alt: "Evidencia visual", dataUrl: "" };
  if (type === "comparison") return { type: "comparison", title: "Comparación de alternativas", ideas: [{ title: "Opción A", description: "", pros: "", cons: "" }] };
  return { type: "text", content: "" };
}

function normalizeEntry(entry) {
  if (Array.isArray(entry.blocks)) return { ...entry, blocks: entry.blocks };
  const blocks = [];
  if (entry.htmlContent) blocks.push({ type: "text", content: entry.htmlContent });
  if (Array.isArray(entry.ideas) && entry.ideas.length) {
    blocks.push({ type: "comparison", title: "Comparación de ideas", ideas: entry.ideas.map(idea => ({ title: idea.title || "Opción", description: idea.desc || "", pros: idea.pro || "", cons: idea.con || "" })) });
  }
  if (entry.image) blocks.push({ type: "image", fileName: "evidencia.jpg", mimeType: "image/jpeg", alt: "Evidencia visual", dataUrl: entry.image });
  return { ...entry, blocks };
}

function loadData() {
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) return cloneDefaultData();
  try {
    const data = JSON.parse(stored);
    if (!data || !Array.isArray(data.tabs)) return cloneDefaultData();
    data.tabs.forEach(tab => { tab.entries = Array.isArray(tab.entries) ? tab.entries.map(normalizeEntry) : []; });
    return data;
  } catch {
    return cloneDefaultData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    showToast("No hay espacio suficiente para guardar este registro.", "error");
    return false;
  }
}

let siteData = loadData();

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function sanitizeRichHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object, embed, form").forEach(node => node.remove());
  template.content.querySelectorAll("*").forEach(node => [...node.attributes].forEach(attribute => {
    if (attribute.name.toLowerCase().startsWith("on") || attribute.name.toLowerCase() === "style") node.removeAttribute(attribute.name);
  }));
  return template.innerHTML;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function getCurrentTab() {
  return siteData.tabs.find(tab => tab.id === activeTabId);
}

function renderTabs() {
  document.getElementById("weekCount").textContent = `${Math.max(0, siteData.tabs.length - 1)} semanas`;
  document.getElementById("tabList").innerHTML = siteData.tabs.map(tab => `
    <li><button class="tab-button ${tab.id === activeTabId ? "active" : ""}" type="button" data-tab-id="${escapeHtml(tab.id)}"><span>${escapeHtml(tab.title)}</span><span class="tab-arrow">↗</span></button></li>
  `).join("");
}

function renderView() {
  renderTabs();
  renderPublicView();
  const editing = isMemberAuthenticated && activeTabId !== "portada";
  document.getElementById("editorPanel").hidden = !editing;
  document.getElementById("tabAdminControls").hidden = !isMemberAuthenticated;
  if (editing) {
    document.getElementById("editorTitle").textContent = `Nuevo registro en ${getCurrentTab().title}`;
    renderEditorBlocks();
  }
}

function renderPublicView() {
  const container = document.getElementById("tabContentContainer");
  if (activeTabId === "portada") {
    container.innerHTML = `<section class="hero-panel animate-in"><span class="eyebrow">Investigación y desarrollo / 2026</span><h2>Del problema al prototipo.</h2><p>Una bitácora abierta sobre decisiones, pruebas y aprendizajes detrás de un producto nuevo.</p><div class="hero-stats"><span><strong>${siteData.tabs.length - 1}</strong> semanas documentadas</span><span><strong>${siteData.tabs.reduce((total, tab) => total + tab.entries.length, 0)}</strong> registros publicados</span></div></section><section class="intro-grid animate-in"><div class="section-heading"><span class="eyebrow">Equipo de trabajo</span><h3>Cuatro miradas, un laboratorio.</h3></div><div class="team-list"><div class="team-member"><span>01</span><strong>Javier Abad</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>02</span><strong>Steven Giron</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>03</span><strong>Francisco Siguenza</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>04</span><strong>Juan Pablo Quinteros</strong><small>Investigación / Desarrollo</small></div></div></section>`;
    return;
  }
  const tab = getCurrentTab();
  if (!tab) return;
  const entries = tab.entries.map(renderEntry).join("");
  container.innerHTML = `<div class="page-heading animate-in"><span class="eyebrow">Registro semanal</span><h2>${escapeHtml(tab.title)}</h2><span class="heading-line"></span></div>${entries || `<div class="public-empty animate-in"><span class="empty-icon">○</span><h3>Aún no hay registros publicados</h3><p>El primer avance de esta semana aparecerá aquí.</p></div>`}`;
}

function renderEntry(entry) {
  return `<article class="entry-card animate-in"><div class="entry-meta"><span>Registro de avance</span><time>${new Date(entry.createdAt || Date.now()).toLocaleDateString("es-EC")}</time></div><h3>${escapeHtml(entry.title)}</h3>${(entry.blocks || []).map(renderBlock).join("")} ${isMemberAuthenticated ? `<button class="entry-delete" type="button" data-delete-entry="${entry.id}">Eliminar registro</button>` : ""}</article>`;
}

function renderBlock(block) {
  if (block.type === "image") return block.dataUrl ? `<figure class="content-image"><img src="${block.dataUrl}" alt="${escapeHtml(block.alt || "Evidencia visual")}"><figcaption>${escapeHtml(block.fileName || "Evidencia visual")}</figcaption></figure>` : "";
  if (block.type === "comparison") return `<section class="content-comparison"><div class="comparison-heading"><span class="block-kicker">Matriz de decisión</span><h4>${escapeHtml(block.title)}</h4></div><div class="comparison-grid">${(block.ideas || []).map(idea => `<div class="comparison-card"><h5>${escapeHtml(idea.title)}</h5><p>${escapeHtml(idea.description)}</p><div class="comparison-pro"><b>A favor</b>${escapeHtml(idea.pros)}</div><div class="comparison-con"><b>Riesgos</b>${escapeHtml(idea.cons)}</div></div>`).join("")}</div></section>`;
  return `<div class="content-text">${sanitizeRichHtml(block.content || "")}</div>`;
}

function renderEditorBlocks() {
  document.getElementById("editorEmptyState").hidden = editorBlocks.length > 0;
  document.getElementById("editorBlocks").innerHTML = editorBlocks.map(renderEditorBlock).join("");
}

function renderEditorBlock(block, index) {
  const label = block.type === "text" ? "Párrafo" : block.type === "image" ? "Imagen" : "Cuadro comparativo";
  const header = `<div class="block-header"><span><i class="block-number">${String(index + 1).padStart(2, "0")}</i>${label}</span><button class="block-remove" type="button" data-remove-block="${index}" aria-label="Eliminar bloque">×</button></div>`;
  if (block.type === "image") return `<article class="editor-block block-image animate-in" data-block-index="${index}">${header}<label class="image-dropzone" data-drop-index="${index}">${block.dataUrl ? `<img src="${block.dataUrl}" alt="Vista previa">` : `<span class="upload-icon">↥</span><strong>Arrastra una imagen aquí</strong><small>o haz clic para buscar un archivo · máximo 8 MB</small>`}<input type="file" accept="image/*" data-image-input="${index}"></label><div class="image-fields"><input class="form-control" type="text" value="${escapeHtml(block.alt)}" placeholder="Texto alternativo" data-block-field="alt" data-block-index="${index}"><span class="file-name">${escapeHtml(block.fileName || "Sin archivo seleccionado")}</span></div></article>`;
  if (block.type === "comparison") return `<article class="editor-block block-comparison animate-in" data-block-index="${index}">${header}<input class="form-control block-title" type="text" value="${escapeHtml(block.title)}" placeholder="Título del cuadro" data-block-field="title" data-block-index="${index}"><div class="idea-editor-list">${block.ideas.map((idea, ideaIndex) => `<div class="idea-editor-row"><input class="form-control" type="text" value="${escapeHtml(idea.title)}" placeholder="Nombre de opción" data-idea-field="title" data-block-index="${index}" data-idea-index="${ideaIndex}"><textarea class="form-control" placeholder="Descripción" data-idea-field="description" data-block-index="${index}" data-idea-index="${ideaIndex}">${escapeHtml(idea.description)}</textarea><input class="form-control" type="text" value="${escapeHtml(idea.pros)}" placeholder="A favor" data-idea-field="pros" data-block-index="${index}" data-idea-index="${ideaIndex}"><input class="form-control" type="text" value="${escapeHtml(idea.cons)}" placeholder="Riesgos / en contra" data-idea-field="cons" data-block-index="${index}" data-idea-index="${ideaIndex}"><button class="idea-remove" type="button" data-remove-idea="${index}" data-idea-index="${ideaIndex}">Eliminar opción</button></div>`).join("")}</div><button class="button button-secondary" type="button" data-add-idea="${index}">+ Añadir opción</button></article>`;
  return `<article class="editor-block block-text animate-in" data-block-index="${index}">${header}<textarea class="block-textarea" placeholder="Describe qué ocurrió, qué observaste y qué aprendiste..." data-block-field="content" data-block-index="${index}">${escapeHtml(block.content)}</textarea></article>`;
}

function addBlock(type) { editorBlocks.push(createBlock(type)); renderEditorBlocks(); document.querySelector(`[data-block-index="${editorBlocks.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
function removeBlock(index) { editorBlocks.splice(index, 1); renderEditorBlocks(); }
function addIdea(index) { editorBlocks[index].ideas.push({ title: `Opción ${String.fromCharCode(65 + editorBlocks[index].ideas.length)}`, description: "", pros: "", cons: "" }); renderEditorBlocks(); }
function removeIdea(index, ideaIndex) { editorBlocks[index].ideas.splice(ideaIndex, 1); renderEditorBlocks(); }

function handleEditorInput(event) {
  const blockIndex = Number(event.target.dataset.blockIndex);
  if (event.target.dataset.blockField && editorBlocks[blockIndex]) editorBlocks[blockIndex][event.target.dataset.blockField] = event.target.value;
  if (event.target.dataset.ideaField && editorBlocks[blockIndex]?.ideas) editorBlocks[blockIndex].ideas[Number(event.target.dataset.ideaIndex)][event.target.dataset.ideaField] = event.target.value;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error("La imagen supera el límite de 8 MB."));
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(objectUrl); resolve(canvas.toDataURL("image/jpeg", 0.78)); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("El archivo de imagen no es válido.")); };
    image.src = objectUrl;
  });
}

async function attachImageFile(index, file) {
  if (!file || !file.type.startsWith("image/")) return showToast("Selecciona un archivo de imagen válido.", "error");
  try { editorBlocks[index].dataUrl = await compressImage(file); editorBlocks[index].fileName = file.name; editorBlocks[index].mimeType = file.type; renderEditorBlocks(); showToast("Imagen preparada para el registro."); } catch (error) { showToast(error.message, "error"); }
}

function serializeBlocksForSupabase(blocks) {
  return blocks.map(block => block.type === "image" ? { type: "image", fileName: block.fileName, mimeType: block.mimeType, alt: block.alt, storagePath: null } : { ...block });
}

async function saveEntryToSupabase(payload) {
  if (window.supabaseClient?.from) return window.supabaseClient.from("entries").insert(payload).select().single();
  console.info("[Supabase simulator] Payload listo para insertar:", payload);
  return { data: payload, error: null };
}

async function signIn(email, password) {
  if (AUTH_MODE === "supabase" && window.supabaseClient?.auth) return window.supabaseClient.auth.signInWithPassword({ email, password });
  if (!email || password.length < 8) return { error: { message: "Introduce un correo válido y una contraseña de 8 caracteres." } };
  return { data: { user: { email }, session: { demo: true } }, error: null };
}

async function submitAuth(event) {
  event.preventDefault();
  const result = await signIn(document.getElementById("authEmail").value.trim(), document.getElementById("authPassword").value);
  if (result.error) { const error = document.getElementById("authError"); error.textContent = result.error.message; error.hidden = false; return; }
  isMemberAuthenticated = true;
  document.getElementById("authDialog").close();
  document.getElementById("authBadge").hidden = false;
  document.getElementById("authBtn").textContent = "Cerrar sesión";
  renderView();
}

function toggleAuth() {
  if (isMemberAuthenticated) { isMemberAuthenticated = false; editorBlocks = []; document.getElementById("authBadge").hidden = true; document.getElementById("authBtn").textContent = "Soy del equipo :)"; renderView(); return; }
  document.getElementById("authError").hidden = true;
  document.getElementById("authDialog").showModal();
}

async function saveNewEntry() {
  const title = document.getElementById("entryTitle").value.trim() || "Registro de actividad";
  const validBlocks = editorBlocks.filter(block => block.type === "text" ? block.content.trim() : block.type === "image" ? block.dataUrl : block.ideas.length);
  if (!validBlocks.length) return showToast("Añade al menos un bloque antes de guardar.", "error");
  const tab = getCurrentTab();
  const entry = { id: `entry-${Date.now()}`, title, blocks: validBlocks, createdAt: new Date().toISOString() };
  const result = await saveEntryToSupabase({ tab_id: tab.id, title: entry.title, blocks: serializeBlocksForSupabase(entry.blocks), created_at: entry.createdAt });
  if (result.error) return showToast("No se pudo preparar el registro para Supabase.", "error");
  tab.entries.push(entry);
  if (!saveData(siteData)) return;
  editorBlocks = [];
  document.getElementById("entryTitle").value = "";
  renderView();
  showToast("Avance guardado y preparado para Supabase.");
}

function createNewTab() { const number = siteData.tabs.length; const id = `semana-${number}`; siteData.tabs.push({ id, title: `Semana ${String(number).padStart(2, "0")}`, isDeletable: true, entries: [] }); activeTabId = id; saveData(siteData); renderView(); }
function deleteCurrentTab() { const tab = getCurrentTab(); if (!tab?.isDeletable) return showToast("La portada no se puede eliminar.", "error"); if (!window.confirm(`¿Eliminar ${tab.title} y sus registros?`)) return; siteData.tabs = siteData.tabs.filter(item => item.id !== activeTabId); activeTabId = "portada"; saveData(siteData); renderView(); }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("authModeHint").textContent = AUTH_MODE === "supabase" ? "Autenticación gestionada por Supabase." : "Modo demostración: cualquier correo válido y una contraseña de 8 caracteres.";
  document.getElementById("authBtn").addEventListener("click", toggleAuth);
  document.getElementById("authForm").addEventListener("submit", submitAuth);
  document.getElementById("closeAuthBtn").addEventListener("click", () => document.getElementById("authDialog").close());
  document.getElementById("newTabBtn").addEventListener("click", createNewTab);
  document.getElementById("deleteTabBtn").addEventListener("click", deleteCurrentTab);
  document.getElementById("saveEntryBtn").addEventListener("click", saveNewEntry);
  document.getElementById("clearBlocksBtn").addEventListener("click", () => { editorBlocks = []; document.getElementById("entryTitle").value = ""; renderEditorBlocks(); });
  document.getElementById("tabList").addEventListener("click", event => { const button = event.target.closest("[data-tab-id]"); if (!button) return; activeTabId = button.dataset.tabId; editorBlocks = []; renderView(); });
  document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); activeTabId = "portada"; renderView(); });
  document.querySelector(".block-toolbar").addEventListener("click", event => { if (event.target.dataset.addBlock) addBlock(event.target.dataset.addBlock); });
  document.getElementById("editorBlocks").addEventListener("input", handleEditorInput);
  document.getElementById("editorBlocks").addEventListener("click", event => { if (event.target.dataset.removeBlock) removeBlock(Number(event.target.dataset.removeBlock)); if (event.target.dataset.addIdea) addIdea(Number(event.target.dataset.addIdea)); if (event.target.dataset.removeIdea) removeIdea(Number(event.target.dataset.removeIdea), Number(event.target.dataset.ideaIndex)); });
  document.getElementById("editorBlocks").addEventListener("change", event => { if (event.target.dataset.imageInput) attachImageFile(Number(event.target.dataset.imageInput), event.target.files[0]); });
  document.getElementById("editorBlocks").addEventListener("dragover", event => { if (event.target.closest("[data-drop-index]")) event.preventDefault(); });
  document.getElementById("editorBlocks").addEventListener("drop", event => { const zone = event.target.closest("[data-drop-index]"); if (!zone) return; event.preventDefault(); attachImageFile(Number(zone.dataset.dropIndex), event.dataTransfer.files[0]); });
  renderView();
});