import { useSensor, useSensors, DndContext, KeyboardSensor, PointerSensor, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import RichTextEditor from "./RichTextEditor.jsx";

function BlockHeader({ index, label, onRemove, disabled, dragHandleProps }) {
  return (
    <div className="block-header">
      <span><i className="block-number">{String(index + 1).padStart(2, "0")}</i>{label}</span>
      <div className="block-header-actions">
        <button
          className="block-drag-handle"
          type="button"
          disabled={disabled}
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          ref={dragHandleProps.setActivatorNodeRef}
          aria-label={`Mover bloque ${index + 1}: ${label}`}
          title="Arrastra para reordenar; usa las flechas del teclado"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <button className="block-remove" type="button" onClick={onRemove} aria-label={`Eliminar bloque ${index + 1}`}>×</button>
      </div>
    </div>
  );
}

function SortableBlock({ block, index, label, className, onRemove, disabled, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled });

  return (
    <article
      ref={setNodeRef}
      className={`editor-block ${className} animate-in ${isDragging ? "editor-block-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <BlockHeader
        index={index}
        label={label}
        onRemove={onRemove}
        disabled={disabled}
        dragHandleProps={{ attributes, listeners, setActivatorNodeRef }}
      />
      {children}
    </article>
  );
}

export default function BlockEditor({ blocks, onChange, onRemove, onReorder, onAddIdea, onRemoveIdea, onImage, onVideo, disabled }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(block => block.id === active.id);
    const newIndex = blocks.findIndex(block => block.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(blocks, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(block => block.id)} strategy={verticalListSortingStrategy}>
        <div className="editor-blocks" aria-live="polite">
          {blocks.map((block, index) => {
            const update = patch => onChange(index, patch);
            if (block.type === "image" || block.type === "video") {
              const isVideo = block.type === "video";
              const preview = isVideo ? block.previewUrl || block.url : block.dataUrl || block.url;
              return (
                <SortableBlock
                  key={block.id}
                  block={block}
                  index={index}
                  label={isVideo ? "Video" : "Imagen"}
                  className={isVideo ? "block-video" : "block-image"}
                  onRemove={() => onRemove(index)}
                  disabled={disabled}
                >
                  <MediaDropzone
                    block={block}
                    index={index}
                    preview={preview}
                    isVideo={isVideo}
                    onSelect={file => (isVideo ? onVideo(index, file) : onImage(index, file))}
                  />
                  <div className="image-fields">
                    <input className="form-control" value={block.alt || ""} onChange={event => update({ alt: event.target.value })} placeholder={isVideo ? "Descripción del video" : "Texto alternativo"} aria-label={isVideo ? "Descripción del video" : "Texto alternativo"} />
                    <span className="file-name">{block.fileName || "Sin archivo seleccionado"}</span>
                  </div>
                </SortableBlock>
              );
            }

            if (block.type === "comparison") {
              return (
                <SortableBlock key={block.id} block={block} index={index} label="Cuadro comparativo" className="block-comparison" onRemove={() => onRemove(index)} disabled={disabled}>
                  <input className="form-control block-title" value={block.title} onChange={event => update({ title: event.target.value })} placeholder="Título del cuadro" aria-label="Título del cuadro comparativo" />
                  <div className="idea-editor-list">
                    {block.ideas.map((idea, ideaIndex) => (
                      <div className="idea-editor-row" key={`${block.id}-idea-${ideaIndex}`}>
                        <input className="form-control" value={idea.title} onChange={event => updateIdea(block, update, ideaIndex, "title", event.target.value)} placeholder="Nombre de opción" aria-label="Nombre de opción" />
                        <textarea className="form-control" value={idea.description} onChange={event => updateIdea(block, update, ideaIndex, "description", event.target.value)} placeholder="Descripción" aria-label="Descripción de opción" />
                        <input className="form-control" value={idea.pros} onChange={event => updateIdea(block, update, ideaIndex, "pros", event.target.value)} placeholder="A favor" aria-label="Ventajas" />
                        <input className="form-control" value={idea.cons} onChange={event => updateIdea(block, update, ideaIndex, "cons", event.target.value)} placeholder="Riesgos / en contra" aria-label="Desventajas" />
                        <button className="idea-remove" type="button" onClick={() => onRemoveIdea(index, ideaIndex)}>Eliminar opción</button>
                      </div>
                    ))}
                  </div>
                  <button className="button button-secondary" type="button" onClick={() => onAddIdea(index)}>+ Añadir opción</button>
                </SortableBlock>
              );
            }

            return (
              <SortableBlock key={block.id} block={block} index={index} label="Párrafo" className="block-text" onRemove={() => onRemove(index)} disabled={disabled}>
                <RichTextEditor
                  label="Contenido del párrafo"
                  value={block.content}
                  onChange={content => update({ content })}
                />
              </SortableBlock>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function updateIdea(block, update, ideaIndex, field, value) {
  const ideas = block.ideas.map((idea, index) => index === ideaIndex ? { ...idea, [field]: value } : idea);
  update({ ideas });
}

function MediaDropzone({ block, index, preview, isVideo, onSelect }) {
  const onDrop = event => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onSelect(file);
  };

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onSelect(file);
  }

  return (
    <label className="image-dropzone" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      {preview ? (
        isVideo ? <video controls muted src={preview} /> : <img src={preview} alt="Vista previa" />
      ) : (
        <><span className="upload-icon">↥</span><strong>Arrastra {isVideo ? "un video" : "una imagen"} aquí</strong><small>o haz clic para buscar · máximo {isVideo ? "50 MB" : "8 MB"}</small></>
      )}
      <input type="file" accept={isVideo ? "video/*" : "image/*"} onChange={handleFileChange} aria-label={`Seleccionar ${isVideo ? "video" : "imagen"} del bloque ${index + 1}`} />
    </label>
  );
}
