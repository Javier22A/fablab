import { lazy, Suspense } from "react";
import { Trash2 } from "lucide-react";

const FuseButton = lazy(() => import("./FuseButton.jsx"));

export default function DeleteFuseButton({ label, disabled = false, fullWidth = false, size = "sm", onCommit }) {
  return (
    <Suspense fallback={<button className="button button-danger fuse-delete-fallback" type="button" disabled>{label}</button>}>
      <FuseButton
        label={label}
        undoLabel="Cancelar"
        doneLabel="Eliminando…"
        icon={<Trash2 size={15} strokeWidth={1.8} />}
        color="#8F3030"
        background="#FFF7F7"
        fuseColor="#C54747"
        size={size}
        radius={8}
        undoWindow={4000}
        fuse="outline"
        fuseThickness={2}
        crossfadeMs={160}
        commitOn="fuseEnd"
        pauseOnHover={false}
        settle="reset"
        disabled={disabled}
        onCommit={onCommit}
        className={`fuse-delete-button${fullWidth ? " fuse-delete-button-wide" : ""}`}
      />
    </Suspense>
  );
}
