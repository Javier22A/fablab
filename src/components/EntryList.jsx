import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { sanitizeRichText } from "../lib/richText.js";
import DeleteFuseButton from "./DeleteFuseButton.jsx";

function SortableEntry({ entry, authenticated, entries, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: !authenticated || entries.orderSaving || entries.deletionInProgress || entries.transferBusy });

  return (
    <article
      ref={setNodeRef}
      className={`entry-card animate-in ${isDragging ? "entry-card-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {authenticated && (
        <button
          className="entry-drag-handle"
          type="button"
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          aria-label={`Mover publicación: ${entry.title}`}
          title="Arrastra para reordenar publicaciones; usa las flechas del teclado"
          disabled={entries.orderSaving || entries.deletionInProgress || entries.transferBusy}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
      )}
      {children}
    </article>
  );
}

export default function EntryList({ entries, authenticated }) {
  const [activeDragId, setActiveDragId] = useState(null);
  const [transferEntryId, setTransferEntryId] = useState(null);
  const [transferMode, setTransferMode] = useState("copy");
  const [transferTargetId, setTransferTargetId] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function toggleEntryTransfer(entry) {
    if (transferEntryId === entry.id) {
      setTransferEntryId(null);
      return;
    }
    setTransferEntryId(entry.id);
    setTransferMode("copy");
    setTransferTargetId(entries.otherWeeks?.[0]?.id || "__new__");
  }

  async function submitEntryTransfer(event, entry) {
    event.preventDefault();
    if (!entries.onTransferEntry || entries.transferBusy) return;
    const validTarget = transferTargetId && (transferTargetId === "__new__" || entries.otherWeeks?.some(tab => tab.id === transferTargetId))
      ? transferTargetId
      : entries.otherWeeks?.[0]?.id || "__new__";
    const ok = await entries.onTransferEntry(entry, validTarget, transferMode);
    if (ok) setTransferEntryId(null);
  }

  function handleDragStart({ active }) {
    setActiveDragId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = entries.items.findIndex(entry => entry.id === active.id);
    const newIndex = entries.items.findIndex(entry => entry.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) entries.reorder(arrayMove(entries.items, oldIndex, newIndex));
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  if (!entries.items.length) {
    return <div className="public-empty animate-in"><span className="empty-icon">○</span><h3>Aún no hay registros publicados</h3><p>El primer avance de esta semana aparecerá aquí.</p></div>;
  }

  return (
    <>
      {authenticated && <p className="entry-order-hint">Para cambiar el orden de las publicaciones completas, arrastra el asa de una tarjeta y guarda el orden.</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={entries.items.map(entry => entry.id)} strategy={verticalListSortingStrategy}>
          {entries.items.map(entry => (
            <SortableEntry key={entry.id} entry={entry} authenticated={authenticated} entries={entries}>
              <div className="entry-meta"><span>Registro de avance</span><time>{new Date(entry.createdAt || Date.now()).toLocaleDateString("es-EC")}</time></div>
              <h3>{entry.title}</h3>
              <EntryBlocks blocks={entry.blocks || []} />
              {authenticated && (
                <>
                  <div className="entry-actions">
                    <button className="entry-edit" type="button" disabled={entries.transferBusy || entries.deletionInProgress} onClick={() => entries.edit(entry)}>Editar</button>
                    <button
                      className="entry-edit"
                      type="button"
                      disabled={entries.orderDirty || entries.orderSaving || entries.deletionInProgress || entries.transferBusy}
                      onClick={() => toggleEntryTransfer(entry)}
                    >
                      {transferEntryId === entry.id ? "Cerrar copiar / mover" : "Copiar / mover a otra semana"}
                    </button>
                    {entries.deletingEntryId === entry.id
                      ? <span className="delete-progress" role="status">Eliminando registro…</span>
                      : <DeleteFuseButton label="Eliminar registro" disabled={entries.orderDirty || entries.orderSaving || entries.deletionInProgress || entries.transferBusy} onCommit={() => { void entries.delete(entry); }} />}
                  </div>
                  {transferEntryId === entry.id && (
                    <form className="entry-transfer-bar animate-in" onSubmit={event => submitEntryTransfer(event, entry)}>
                      <div className="transfer-mode-switch" role="group" aria-label="Modo de transferencia del registro">
                        <button
                          type="button"
                          className={`transfer-mode-btn ${transferMode === "copy" ? "active" : ""}`}
                          onClick={() => setTransferMode("copy")}
                          disabled={entries.transferBusy}
                        >
                          Copiar
                        </button>
                        <button
                          type="button"
                          className={`transfer-mode-btn ${transferMode === "move" ? "active" : ""}`}
                          onClick={() => setTransferMode("move")}
                          disabled={entries.transferBusy}
                        >
                          Mover
                        </button>
                      </div>
                      <label className="entry-transfer-select-label">
                        <span>Hacia:</span>
                        <select
                          className="form-control"
                          value={transferTargetId && (transferTargetId === "__new__" || entries.otherWeeks?.some(tab => tab.id === transferTargetId))
                            ? transferTargetId
                            : entries.otherWeeks?.[0]?.id || "__new__"}
                          onChange={event => setTransferTargetId(event.target.value)}
                          disabled={entries.transferBusy}
                          aria-label="Semana destino para este registro"
                        >
                          {(entries.otherWeeks || []).map(tab => (
                            <option key={tab.id} value={tab.id}>{tab.title}</option>
                          ))}
                          <option value="__new__">+ Crear {entries.nextWeekLabel || "nueva semana"}</option>
                        </select>
                      </label>
                      <div className="entry-transfer-actions">
                        <button className="button button-ghost button-sm" type="button" disabled={entries.transferBusy} onClick={() => setTransferEntryId(null)}>Cancelar</button>
                        <button className="button button-primary button-sm" type="submit" disabled={entries.transferBusy}>
                          {entries.transferBusy ? "Procesando…" : transferMode === "move" ? "Mover registro" : "Copiar registro"}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </SortableEntry>
          ))}
        </SortableContext>
      </DndContext>
      {authenticated && entries.orderDirty && (
        <div className="entry-order-actions">
          <p>El nuevo orden aún no está guardado.</p>
          <button className="button button-primary" type="button" disabled={entries.orderSaving || entries.deletionInProgress} onClick={entries.saveOrder}>
            {entries.orderSaving ? "Guardando orden…" : "Guardar orden de publicaciones"}
          </button>
        </div>
      )}
      {activeDragId && <span className="visually-hidden" role="status">Reordenando publicaciones.</span>}
    </>
  );
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
    if (block.type === "download") {
      const source = downloadUrl(block.url);
      if (!source) return null;
      const extension = block.fileName?.split(".").pop()?.toUpperCase() || "ARCHIVO";
      return (
        <section className="content-download" key={block.id || index}>
          <div className="download-card-icon" aria-hidden="true"><span>{extension.slice(0, 5)}</span></div>
          <div className="download-card-content">
            <span className="block-kicker">Archivo descargable · {formatFileSize(block.fileSize)}</span>
            <h4>{block.title || block.fileName || "Archivo del proyecto"}</h4>
            {block.description && <p>{block.description}</p>}
            <small className="download-file-name">{block.fileName || "Archivo sin nombre"}</small>
          </div>
          <a className="download-card-link" href={source} download={block.fileName || undefined}>
            <span>Descargar</span><span aria-hidden="true">↓</span>
          </a>
        </section>
      );
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
    return <div className="content-text" key={block.id || index} dangerouslySetInnerHTML={{ __html: sanitizeRichText(block.content || "") }} />;
  });
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

function downloadUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.href);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "Tamaño no disponible";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
