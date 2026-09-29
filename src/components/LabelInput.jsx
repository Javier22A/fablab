import { useId, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/* ══ Label input ══════════════════════════════════════════
   A field whose label is its placeholder until you are in it.
   On focus the label lifts into the top edge with a small hop
   running along its letters, the outline darkens in place, and
   the top line parts under the label from its middle outward.

   ── ONE THING MOVES ─────────────────────────────────────
   It used to DRAW its outline out of the notch, both ways
   round the field — and that was the field performing, which
   is too much for a thing you focus forty times a day. Now the
   outline is always whole; focus only changes its ink and
   opens the gap. The label is the event, and the line makes
   room for it.

   The gap is two short paths across the notch, each from the
   middle to one side, retracted from the middle outward by a
   negative dash offset. */

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const HEIGHT = 52;
/* the lifted label's size, against its resting one */
const SCALE = 0.78;
/* the stroke sits half a stroke inside the box so none of it
   is clipped by the svg's own edge */
const INSET = 0.75;

export default function LabelInput({
  label,
  value,
  onChange,
  type = "text",
  name,
  autoComplete,
  required = false,
  minLength,
  corner = 14,
  showPasswordToggle = false,
}) {
  const inputId = `lbi-${useId().replace(/:/g, "")}`;
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const labelRef = useRef(null);
  const inputRef = useRef(null);
  const [geometry, setGeometry] = useState({ width: 280, labelWidth: 0 });
  const [focus, setFocus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [flip, setFlip] = useState(0);
  const radius = clamp(corner, 0, HEIGHT / 2);
  const isPassword = type === "password";
  const raised = focus || value.length > 0;

  useLayoutEffect(() => {
    if (!boxRef.current || !labelRef.current) return undefined;

    const measure = () => {
      setGeometry({
        width: boxRef.current.clientWidth || 280,
        labelWidth: labelRef.current.getBoundingClientRect().width,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boxRef.current);
    observer.observe(labelRef.current);
    return () => observer.disconnect();
  }, [label]);

  /* ── label position and notch gap ────────────────────────
     Never inside the corner's curve: the notch has to open on
     the straight part of the top edge, so a rounder field
     starts its label further in. */
  const width = geometry.width;
  const labelX = Math.max(14, radius + 4);
  const startX = Math.max(radius * 0.6, labelX - 5);
  const endX = labelX + geometry.labelWidth * SCALE + 5;
  const arc = radius - INSET;
  const rightEdge = width - INSET;
  const bottom = HEIGHT - INSET;
  const middle = width / 2;
  const notchMiddle = (startX + endX) / 2;
  const rightPath = radius > 0
    ? `M${endX},${INSET} L${width - radius},${INSET} A${arc},${arc} 0 0 1 ${rightEdge},${radius} L${rightEdge},${HEIGHT - radius} A${arc},${arc} 0 0 1 ${width - radius},${bottom} L${middle},${bottom}`
    : `M${endX},${INSET} L${rightEdge},${INSET} L${rightEdge},${bottom} L${middle},${bottom}`;
  const leftPath = radius > 0
    ? `M${startX},${INSET} L${radius},${INSET} A${arc},${arc} 0 0 0 ${INSET},${radius} L${INSET},${HEIGHT - radius} A${arc},${arc} 0 0 0 ${radius},${bottom} L${middle},${bottom}`
    : `M${startX},${INSET} L${INSET},${INSET} L${INSET},${bottom} L${middle},${bottom}`;

  function revealPassword() {
    setShowPassword(current => !current);
    setFlip(current => current + 1);
    inputRef.current?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="lbi"
      data-up={raised}
      data-focus={focus}
      data-filled={value.length > 0}
      style={{ "--lbi-x": `${labelX}px` }}
    >
      <div ref={boxRef} className="lbi-box" style={{ borderRadius: radius }}>
        <svg className="lbi-ring" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
          <path d={rightPath} />
          <path d={leftPath} />
          <path className="lbi-gap" d={`M${notchMiddle},${INSET} L${startX},${INSET}`} pathLength="1" />
          <path className="lbi-gap" d={`M${notchMiddle},${INSET} L${endX},${INSET}`} pathLength="1" />
        </svg>

        <label ref={labelRef} className="lbi-label" htmlFor={inputId}>
          {[...label].map((character, index) => (
            <span key={`${character}-${index}`} style={{ "--i": index }}>{character}</span>
          ))}
        </label>

        <input
          ref={inputRef}
          id={inputId}
          className="lbi-field"
          data-flip={flip % 2}
          type={isPassword && !showPassword ? "password" : isPassword ? "text" : type}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          spellCheck={false}
          aria-label={label}
          style={{ paddingRight: isPassword && showPasswordToggle ? 48 : labelX }}
        />

        {isPassword && showPasswordToggle && (
          <button
            className="lbi-eye"
            type="button"
            data-show={showPassword}
            onPointerDown={event => event.preventDefault()}
            onClick={revealPassword}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
          >
            <Eye size={16} strokeWidth={2} aria-hidden="true" />
            <EyeOff size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
