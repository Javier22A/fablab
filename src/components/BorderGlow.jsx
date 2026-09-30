import { useCallback, useRef } from "react";
import "./BorderGlow.css";

const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = ["--gradient-one", "--gradient-two", "--gradient-three", "--gradient-four", "--gradient-five", "--gradient-six", "--gradient-seven"];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function parseHSL(value) {
  const match = value.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { hue: 40, saturation: 80, lightness: 80 };
  return {
    hue: Number.parseFloat(match[1]),
    saturation: Number.parseFloat(match[2]),
    lightness: Number.parseFloat(match[3]),
  };
}

function buildGlowVars(glowColor, intensity) {
  const { hue, saturation, lightness } = parseHSL(glowColor);
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const suffixes = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  return Object.fromEntries(opacities.map((opacity, index) => [
    `--glow-color${suffixes[index]}`,
    `hsl(${hue}deg ${saturation}% ${lightness}% / ${Math.min(opacity * intensity, 100)}%)`,
  ]));
}

function buildGradientVars(colors) {
  const safeColors = colors.length ? colors : ["#4c87a8"];
  const vars = Object.fromEntries(GRADIENT_KEYS.map((key, index) => {
    const color = safeColors[Math.min(COLOR_MAP[index], safeColors.length - 1)];
    return [key, `radial-gradient(at ${GRADIENT_POSITIONS[index]}, ${color} 0px, transparent 50%)`];
  }));
  vars["--gradient-base"] = `linear-gradient(${safeColors[0]} 0 100%)`;
  return vars;
}

function isLightColor(color) {
  const value = color.trim().replace("#", "");
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false;
  const hex = value.length === 3 ? value.split("").map(character => character + character).join("") : value;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 180;
}

export default function BorderGlow({
  as: Element = "div",
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "205 62 55",
  backgroundColor = "#f8fbfc",
  borderRadius = 12,
  glowRadius = 20,
  glowIntensity = 0.85,
  coneSpread = 25,
  colors = ["#4c87a8", "#8ac5dc", "#2d526b"],
  fillOpacity = 0.25,
}) {
  const cardRef = useRef(null);
  const handlePointerMove = useCallback(event => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || event.pointerType === "touch") return;

    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - rect.width / 2;
    const dy = y - rect.height / 2;
    const horizontalProximity = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
    const verticalProximity = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
    const edgeProximity = Math.min(Math.max(1 / Math.min(horizontalProximity, verticalProximity), 0), 1);
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;

    card.style.setProperty("--edge-proximity", (edgeProximity * 100).toFixed(3));
    card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
  }, []);

  const lightSurface = isLightColor(backgroundColor);
  const cardClass = `border-glow-card${lightSurface ? " border-glow-card--light" : ""}${className ? ` ${className}` : ""}`;

  return (
    <Element
      ref={cardRef}
      onPointerMove={handlePointerMove}
      className={cardClass}
      style={{
        "--card-bg": backgroundColor,
        "--edge-sensitivity": edgeSensitivity,
        "--border-radius": `${borderRadius}px`,
        "--glow-padding": `${glowRadius}px`,
        "--cone-spread": coneSpread,
        "--fill-opacity": fillOpacity,
        ...buildGlowVars(glowColor, glowIntensity),
        ...buildGradientVars(colors),
      }}
    >
      <span className="edge-light" aria-hidden="true" />
      <div className="border-glow-inner">{children}</div>
    </Element>
  );
}
