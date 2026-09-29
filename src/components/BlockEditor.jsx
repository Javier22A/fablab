function BlockHeader({ index, label, onRemove }) {
  return (
    <div className="block-header">
      <span><i className="block-number">{String(index + 1).padStart(2, "0")}</i>{label}</span>
      <button className="block-remove" type="button" onClick={onRemove} aria-label={`Eliminar bloque ${index + 1}`}>×</button>
    </div>
  );
}

export default function BlockEditor({ blocks, onChange, onRemove, onAddIdea, onRemoveIdea, onImage, onVideo }) {
  return (
    <div className="editor-blocks" aria-live="polite">
      {blocks.map((block, index) => {
        const update = patch => onChange(index, patch);
        if (block.type === "image" || block.type === "video") {
          const isVideo = block.type === "video";
          const preview = isVideo ? block.previewUrl || block.url : block.dataUrl || block.url;
          return (
            <article className={`editor-block ${isVideo ? "block-video" : "block-image"} animate-in`} key={block.id}>
              <BlockHeader index={index} label={isVideo ? "Video" : "Imagen"} onRemove={() => onRemove(index)} />
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
            </article>
          );
        }

        if (block.type === "comparison") {
          return (
            <article className="editor-block block-comparison animate-in" key={block.id}>
              <BlockHeader index={index} label="Cuadro comparativo" onRemove={() => onRemove(index)} />
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
            </article>
          );
        }

        return (
          <article className="editor-block block-text animate-in" key={block.id}>
            <BlockHeader index={index} label="Párrafo" onRemove={() => onRemove(index)} />
            <textarea className="block-textarea" value={block.content} onChange={event => update({ content: event.target.value })} placeholder="Describe qué ocurrió, qué observaste y qué aprendiste..." aria-label="Contenido del párrafo" />
          </article>
        );
      })}
    </div>
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
