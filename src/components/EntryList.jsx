import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { sanitizeRichText } from "../lib/richText.js";

function SortableEntry({ entry, authenticated, entries, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: !authenticated || entries.orderSaving });

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
          disabled={entries.orderSaving}
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
                <div className="entry-actions">
                  <button className="entry-edit" type="button" onClick={() => entries.edit(entry)}>Editar</button>
                  <button className="entry-delete" type="button" disabled={entries.orderDirty || entries.orderSaving} onClick={() => entries.delete(entry)}>Eliminar registro</button>
                </div>
              )}
            </SortableEntry>
          ))}
        </SortableContext>
      </DndContext>
      {authenticated && entries.orderDirty && (
        <div className="entry-order-actions">
          <p>El nuevo orden aún no está guardado.</p>
          <button className="button button-primary" type="button" disabled={entries.orderSaving} onClick={entries.saveOrder}>
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
