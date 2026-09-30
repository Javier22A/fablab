import { useEffect, useState } from "react";
import { supabaseClient } from "../lib/supabase.js";
import { BASE_URL, publicAsset } from "../lib/paths.js";
import RichTextEditor, { RichTextDisplay } from "./RichTextEditor.jsx";
import { sanitizeRichText } from "../lib/richText.js";

const TEAM = ["Javier Abad", "Steven Giron", "Francisco Siguenza", "Juan Pablo Quinteros"];
const PAGE_DEFAULTS = {
  about: {
    eyebrow: "Información general / FabLab I+D",
    title: "Sobre nosotros.",
    lead: "Aquí irá una descripción general del equipo, sus objetivos y el contexto de la materia.",
    image: { url: publicAsset("images/logofablab.jpg"), alt: "Logo FabLab, imagen provisional del equipo" },
    caption: "Aquí irá la fotografía del equipo.",
    photoNote: "Este espacio queda reservado para la imagen vertical de los integrantes.",
    sections: [
      { eyebrow: "01", title: "Quiénes somos", description: "Aquí irá una presentación breve de los integrantes y sus responsabilidades." },
      { eyebrow: "02", title: "Qué hacemos", description: "Aquí irá una explicación general del trabajo de investigación y desarrollo." },
      { eyebrow: "03", title: "Cómo trabajamos", description: "Aquí irá una descripción del proceso, las herramientas y la forma de documentar los avances." },
    ],
    teamNames: TEAM,
  },
  "final-project": {
    eyebrow: "Proyecto final / I+D",
    title: "Aquí irá la información del proyecto final.",
    lead: "Aquí irá una descripción general del producto, la propuesta desarrollada y los resultados principales.",
    linkLabel: "Ver la bitácora semanal",
    linkUrl: `${BASE_URL}index.html`,
    sections: [
      { eyebrow: "01 / El problema", title: "Aquí irá el problema identificado.", description: "En este espacio se explicará la necesidad o situación que dio origen al proyecto.", wide: true },
      { eyebrow: "02 / El proceso", title: "Aquí irá la metodología.", description: "En este espacio se resumirán las etapas de investigación, ideación y validación." },
      { eyebrow: "03 / El resultado", title: "Aquí irá la propuesta final.", description: "En este espacio se presentarán las características y conclusiones principales." },
    ],
  },
};

function mergePageContent(page, content) {
  const defaults = PAGE_DEFAULTS[page];
  return {
    ...defaults,
    ...content,
    image: page === "about" ? { ...defaults.image, ...content?.image } : undefined,
    sections: Array.isArray(content?.sections)
      ? content.sections.map(section => ({ ...section, image: section.image ? { ...section.image } : undefined }))
      : defaults.sections.map(section => ({ ...section })),
    teamNames: page === "about" && Array.isArray(content?.teamNames) ? content.teamNames : [...(defaults.teamNames || [])],
  };
}

function cloneContent(content) {
  return {
    ...content,
    image: content.image ? { ...content.image } : undefined,
    sections: content.sections.map(section => ({ ...section, image: section.image ? { ...section.image } : undefined })),
    teamNames: [...content.teamNames],
  };
}

function imagePaths(content) {
  return [content.image?.storagePath, ...content.sections.map(section => section.image?.storagePath)].filter(Boolean);
}

function revokeDraftImages(content) {
  if (content?.image?.file) URL.revokeObjectURL(content.image.url);
  content?.sections.forEach(section => {
    if (section.image?.file) URL.revokeObjectURL(section.image.url);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function safeLink(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

function sanitizePageText(page, content) {
  return {
    ...content,
    title: sanitizeRichText(content.title, { inlineOnly: true }),
    lead: sanitizeRichText(content.lead),
    caption: page === "about" ? sanitizeRichText(content.caption, { inlineOnly: true }) : content.caption,
    photoNote: page === "about" ? sanitizeRichText(content.photoNote, { inlineOnly: true }) : content.photoNote,
    sections: content.sections.map(section => ({
      ...section,
      title: sanitizeRichText(section.title, { inlineOnly: true }),
      description: sanitizeRichText(section.description),
    })),
  };
}

export default function EditablePage({ page, authenticated }) {
  const [content, setContent] = useState(() => mergePageContent(page, {}));
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabaseClient));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPage() {
      if (!supabaseClient) {
        try {
          const saved = JSON.parse(localStorage.getItem(`fablab-page-${page}`) || "null");
          if (active && saved) setContent(mergePageContent(page, saved));
        } catch (error) {
          console.error(`No se pudo leer el contenido local de ${page}.`, error);
          if (active) setErrorMessage("No se pudo leer el contenido guardado en este navegador.");
        }
        if (active) setLoading(false);
        return;
      }
      const { data, error } = await supabaseClient.from("site_pages").select("content").eq("slug", page).maybeSingle();
      if (!active) return;
      if (error) {
        console.error(`No se pudo cargar el contenido de ${page}.`, error);
        setErrorMessage(`No se pudo cargar el contenido guardado de esta página: ${error.message}`);
      } else if (data?.content) {
        setContent(mergePageContent(page, data.content));
      }
      setLoading(false);
    }
    loadPage();
    return () => { active = false; };
  }, [page]);

  function startEditing() {
    setErrorMessage("");
    setSuccessMessage("");
    setDraft(cloneContent(content));
  }

  function cancelEditing() {
    revokeDraftImages(draft);
    setDraft(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function updateDraft(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function updateSection(index, field, value) {
    setDraft(current => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, [field]: value } : section),
    }));
  }

  function moveSection(index, direction) {
    const destination = index + direction;
    if (destination < 0 || destination >= draft.sections.length) return;
    setDraft(current => {
      const sections = [...current.sections];
      [sections[index], sections[destination]] = [sections[destination], sections[index]];
      return { ...current, sections };
    });
  }

  function addSection() {
    setDraft(current => ({
      ...current,
      sections: [...current.sections, { eyebrow: `${String(current.sections.length + 1).padStart(2, "0")}`, title: "", description: "" }],
    }));
  }

  function removeSection(index) {
    const image = draft.sections[index]?.image;
    if (image?.file) URL.revokeObjectURL(image.url);
    setDraft(current => ({ ...current, sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index) }));
  }

  function updateTeamName(index, value) {
    setDraft(current => ({ ...current, teamNames: current.teamNames.map((name, itemIndex) => itemIndex === index ? value : name) }));
  }

  function addTeamMember() {
    setDraft(current => ({ ...current, teamNames: [...current.teamNames, ""] }));
  }

  function removeTeamMember(index) {
    setDraft(current => ({ ...current, teamNames: current.teamNames.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function selectImage(target, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Selecciona un archivo de imagen válido.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage("La imagen debe pesar menos de 8 MB.");
      return;
    }
    const previous = target === "page"
      ? draft.image
      : draft.sections[Number(target)]?.image;
    if (previous?.file) URL.revokeObjectURL(previous.url);
    const image = { file, fileName: file.name, mimeType: file.type, alt: "", url: URL.createObjectURL(file), storagePath: previous?.storagePath || null };
    if (target === "page") updateDraft("image", image);
    else updateSection(Number(target), "image", image);
  }

  function removeImage(target) {
    const previous = target === "page" ? draft.image : draft.sections[Number(target)]?.image;
    if (previous?.file) URL.revokeObjectURL(previous.url);
    if (target === "page") updateDraft("image", { url: "", alt: "", storagePath: null });
    else updateSection(Number(target), "image", null);
  }

  async function prepareImage(image, userId, uploadedPaths) {
    if (!image?.file) return image ? { ...image } : null;
    if (!supabaseClient) {
      return { ...image, url: await readAsDataUrl(image.file), file: undefined };
    }
    const safeName = image.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const fileId = globalThis.crypto?.randomUUID?.() || `image-${Date.now()}`;
    const storagePath = `${userId}/site-pages/${page}/${fileId}-${safeName}`;
    const { error } = await supabaseClient.storage.from("project-media").upload(storagePath, image.file, { contentType: image.mimeType, upsert: false });
    if (error) throw error;
    uploadedPaths.push(storagePath);
    const { data } = supabaseClient.storage.from("project-media").getPublicUrl(storagePath);
    return { fileName: image.fileName, mimeType: image.mimeType, alt: image.alt || "", storagePath, url: data.publicUrl };
  }

  async function savePage() {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const uploadedPaths = [];
    try {
      let userId = null;
      if (supabaseClient) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        userId = data.session?.user?.id;
        if (!userId) throw new Error("No se encontró la sesión del equipo.");
      }

      const safeDraft = sanitizePageText(page, draft);
      const prepared = {
        ...safeDraft,
        image: await prepareImage(safeDraft.image, userId, uploadedPaths),
        sections: await Promise.all(safeDraft.sections.map(async section => ({
          ...section,
          image: await prepareImage(section.image, userId, uploadedPaths),
        }))),
        teamNames: draft.teamNames.map(name => name.trim()).filter(Boolean),
      };
      delete prepared.file;
      if (supabaseClient) {
        const { error } = await supabaseClient.from("site_pages").upsert({
          slug: page,
          content: prepared,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "slug" });
        if (error) throw error;
      } else {
        localStorage.setItem(`fablab-page-${page}`, JSON.stringify(prepared));
      }

      const retained = new Set(imagePaths(prepared));
      const removedPaths = imagePaths(content).filter(path => !retained.has(path));
      revokeDraftImages(draft);
      setContent(mergePageContent(page, prepared));
      setDraft(null);
      setSuccessMessage("Cambios guardados.");
      if (removedPaths.length && supabaseClient) {
        const { error } = await supabaseClient.storage.from("project-media").remove(removedPaths);
        if (error) {
          console.error("La página se guardó, pero no se pudieron limpiar algunas imágenes reemplazadas.", error);
          setErrorMessage("La página se guardó, pero no se pudieron limpiar algunas imágenes reemplazadas.");
        }
      }
    } catch (error) {
      if (uploadedPaths.length && supabaseClient) {
        const { error: cleanupError } = await supabaseClient.storage.from("project-media").remove(uploadedPaths);
        if (cleanupError) console.error("No se pudieron limpiar imágenes cargadas tras fallar el guardado.", cleanupError);
      }
      console.error(`No se pudo guardar la página ${page}.`, error);
      setErrorMessage(`No se pudieron guardar los cambios: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (page === "about") {
    return (
      <>
        <main className="inner-page about-layout">
          <section className="team-photo-card" aria-label="Imagen del equipo">
            <div className="team-photo-frame">{content.image?.url && <img src={content.image.url} alt={content.image.alt || "Imagen del equipo"} />}</div>
            <div className="photo-caption"><span className="eyebrow">El equipo</span><RichTextDisplay as="strong" value={content.caption} inlineOnly /><RichTextDisplay as="small" value={content.photoNote} inlineOnly /></div>
          </section>
          <section className="about-copy">
            <span className="eyebrow">{content.eyebrow}</span><RichTextDisplay as="h1" value={content.title} inlineOnly /><RichTextDisplay as="div" className="lead rich-display" value={content.lead} />
            <div className="role-list">{content.sections.map((section, index) => (
              <article className="role-item" key={section.id || `${section.title}-${index}`}>
                <span>{section.eyebrow || String(index + 1).padStart(2, "0")}</span>
                <div><RichTextDisplay as="h2" value={section.title} inlineOnly /><RichTextDisplay as="div" className="role-description rich-display" value={section.description} />{section.image?.url && <img className="page-section-image" src={section.image.url} alt={section.image.alt || section.title} />}</div>
              </article>
            ))}</div>
            {content.teamNames.length > 0 && <div className="team-names">{content.teamNames.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</div>}
          </section>
        </main>
        {authenticated && <PageEditor page={page} content={draft || content} editing={Boolean(draft)} loading={loading} saving={saving} errorMessage={errorMessage} successMessage={successMessage} onStart={startEditing} onCancel={cancelEditing} onSave={savePage} onUpdate={updateDraft} onSection={updateSection} onMoveSection={moveSection} onAddSection={addSection} onRemoveSection={removeSection} onSelectImage={selectImage} onRemoveImage={removeImage} onTeamName={updateTeamName} onAddTeamMember={addTeamMember} onRemoveTeamMember={removeTeamMember} />}
        {loading && <p className="page-loading" role="status">Cargando contenido guardado…</p>}
        {errorMessage && !authenticated && <p className="page-error" role="alert">{errorMessage}</p>}
      </>
    );
  }

  return (
    <>
      <main className="inner-page project-page">
        <section className="project-hero"><span className="eyebrow">{content.eyebrow}</span><RichTextDisplay as="h1" value={content.title} inlineOnly /><RichTextDisplay as="div" className="project-lead rich-display" value={content.lead} />{content.linkLabel && safeLink(content.linkUrl || `${BASE_URL}index.html`) && <a className="button button-primary" href={safeLink(content.linkUrl || `${BASE_URL}index.html`)}>{content.linkLabel}</a>}</section>
        <section className="project-grid">{content.sections.map((section, index) => (
          <article className={`project-card ${section.wide ? "project-card-wide" : ""}`} key={section.id || `${section.title}-${index}`}>
            <span className="eyebrow">{section.eyebrow}</span><RichTextDisplay as="h2" value={section.title} inlineOnly /><RichTextDisplay as="div" className="project-description rich-display" value={section.description} />{section.image?.url && <img className="page-section-image" src={section.image.url} alt={section.image.alt || section.title} />}
          </article>
        ))}</section>
      </main>
      {authenticated && <PageEditor page={page} content={draft || content} editing={Boolean(draft)} loading={loading} saving={saving} errorMessage={errorMessage} successMessage={successMessage} onStart={startEditing} onCancel={cancelEditing} onSave={savePage} onUpdate={updateDraft} onSection={updateSection} onMoveSection={moveSection} onAddSection={addSection} onRemoveSection={removeSection} onSelectImage={selectImage} onRemoveImage={removeImage} onTeamName={updateTeamName} onAddTeamMember={addTeamMember} onRemoveTeamMember={removeTeamMember} />}
      {loading && <p className="page-loading" role="status">Cargando contenido guardado…</p>}
      {errorMessage && !authenticated && <p className="page-error" role="alert">{errorMessage}</p>}
    </>
  );
}

function PageEditor({ page, content, editing, loading, saving, errorMessage, successMessage, onStart, onCancel, onSave, onUpdate, onSection, onMoveSection, onAddSection, onRemoveSection, onSelectImage, onRemoveImage, onTeamName, onAddTeamMember, onRemoveTeamMember }) {
  return (
    <section className="page-editor-panel" aria-label={`Editor de ${page === "about" ? "About" : "Final Project"}`}>
      <div className="editor-heading">
        <div><span className="eyebrow">Administración de contenido</span><h2>{editing ? "Editar página" : "Contenido de la página"}</h2><p>Edita los textos, imágenes y secciones visibles para todas las personas.</p></div>
        {!editing && <button className="button button-secondary" type="button" disabled={loading} onClick={onStart}>Editar página</button>}
      </div>
      {errorMessage && <p className="page-error" role="alert">{errorMessage}</p>}
      {successMessage && <p className="page-success" role="status">{successMessage}</p>}
      {editing && (
        <>
          <label className="field-label">Antetítulo<input className="form-control" value={content.eyebrow} onChange={event => onUpdate("eyebrow", event.target.value)} /></label>
          <RichTextEditor label="Título principal" value={content.title} onChange={value => onUpdate("title", value)} singleLine />
          <RichTextEditor label="Descripción principal" value={content.lead} onChange={value => onUpdate("lead", value)} />
          {page === "about" && <>
            <ImageEditor label="Fotografía del equipo" image={content.image} target="page" onSelectImage={onSelectImage} onRemoveImage={onRemoveImage} onImageAlt={value => onUpdate("image", { ...content.image, alt: value })} />
            <RichTextEditor label="Texto bajo la fotografía" value={content.caption} onChange={value => onUpdate("caption", value)} singleLine />
            <RichTextEditor label="Descripción bajo la fotografía" value={content.photoNote} onChange={value => onUpdate("photoNote", value)} singleLine />
          </>}
          {page === "final-project" && <>
            <label className="field-label">Texto del enlace<input className="form-control" value={content.linkLabel} onChange={event => onUpdate("linkLabel", event.target.value)} /></label>
            <label className="field-label">Dirección del enlace<input className="form-control" value={content.linkUrl} onChange={event => onUpdate("linkUrl", event.target.value)} /></label>
          </>}
          <div className="page-editor-sections">
            <div className="page-editor-section-heading"><h3>Secciones</h3><button className="button button-secondary" type="button" onClick={onAddSection}>+ Añadir sección</button></div>
            {content.sections.map((section, index) => (
              <article className="page-editor-section" key={section.id || index}>
                <div className="page-editor-section-heading"><strong>Sección {index + 1}</strong><div><button className="section-order-button" type="button" disabled={index === 0} onClick={() => onMoveSection(index, -1)} aria-label={`Mover sección ${index + 1} arriba`}>↑</button><button className="section-order-button" type="button" disabled={index === content.sections.length - 1} onClick={() => onMoveSection(index, 1)} aria-label={`Mover sección ${index + 1} abajo`}>↓</button><button className="entry-delete" type="button" onClick={() => onRemoveSection(index)}>Eliminar</button></div></div>
                <label className="field-label">Etiqueta<input className="form-control" value={section.eyebrow || ""} onChange={event => onSection(index, "eyebrow", event.target.value)} /></label>
                <RichTextEditor label="Título" value={section.title || ""} onChange={value => onSection(index, "title", value)} singleLine />
                <RichTextEditor label="Descripción" value={section.description || ""} onChange={value => onSection(index, "description", value)} />
                {page === "final-project" && <label className="page-editor-checkbox"><input type="checkbox" checked={Boolean(section.wide)} onChange={event => onSection(index, "wide", event.target.checked)} /> Usar ancho completo</label>}
                <ImageEditor label="Imagen opcional" image={section.image} target={String(index)} onSelectImage={onSelectImage} onRemoveImage={onRemoveImage} onImageAlt={value => onSection(index, "image", { ...section.image, alt: value })} />
              </article>
            ))}
          </div>
          {page === "about" && <div className="page-editor-sections"><div className="page-editor-section-heading"><h3>Integrantes del equipo</h3><button className="button button-secondary" type="button" onClick={onAddTeamMember}>+ Añadir integrante</button></div>{content.teamNames.map((name, index) => <div className="page-editor-team-row" key={index}><input className="form-control" value={name} onChange={event => onTeamName(index, event.target.value)} aria-label={`Nombre del integrante ${index + 1}`} /><button className="entry-delete" type="button" onClick={() => onRemoveTeamMember(index)}>Eliminar</button></div>)}</div>}
          <div className="editor-footer"><button className="button button-ghost" type="button" disabled={saving} onClick={onCancel}>Cancelar</button><button className="button button-primary" type="button" disabled={saving} onClick={onSave}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
        </>
      )}
    </section>
  );
}

function ImageEditor({ label, image, target, onSelectImage, onRemoveImage, onImageAlt }) {
  return (
    <div className="page-image-editor">
      <span className="field-label">{label}</span>
      {image?.url && <img className="page-image-preview" src={image.url} alt={image.alt || label} />}
      <label className="button button-secondary page-image-select">Seleccionar imagen<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onSelectImage(target, file); }} /></label>
      {image?.url && <button className="entry-delete" type="button" onClick={() => onRemoveImage(target)}>Quitar imagen</button>}
      {image && <label className="field-label">Texto alternativo<input className="form-control" value={image.alt || ""} onChange={event => onImageAlt(event.target.value)} /></label>}
    </div>
  );
}
