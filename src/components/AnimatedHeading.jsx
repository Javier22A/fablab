import { lazy, Suspense } from "react";
import { sanitizeRichText } from "../lib/richText.js";

const TechText = lazy(() => import("./TechText.jsx"));

function parseHeading(value) {
  const template = document.createElement("template");
  const html = sanitizeRichText(value, { inlineOnly: true });
  template.innerHTML = html.replace(/<br\s*\/?>/gi, " ");
  return {
    html,
    plainText: template.content.textContent?.replace(/\s+/g, " ").trim() || "",
    formatted: template.content.querySelector("b, strong, i, em, u, s, span[style], font, br") !== null,
  };
}

export default function AnimatedHeading({ as: Tag = "h2", text, className = "" }) {
  const { html, plainText, formatted } = parseHeading(text);
  const headingClass = `tech-heading ${className}`.trim();

  if (formatted) {
    return <Tag className={headingClass} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <Tag className={headingClass}>
      <span className="visually-hidden">{plainText}</span>
      <Suspense fallback={<span className="tech-heading-fallback" aria-hidden="true">{plainText}</span>}>
        <TechText
          text={plainText}
          fontFamily="Manrope, sans-serif"
          fontWeight={800}
          fontSize={150}
          letterSpacing={-0.075}
          color="#17232E"
          accentColor="#4C87A8"
          reveal="letter"
          reach={150}
          softness={0.72}
          dashLength={4}
          dashGap={2}
          strokeWidth={1.5}
          specks={8}
          selection={false}
          labels={false}
          draggable={false}
          sweep
          speed={0.45}
          ariaHidden
          className="tech-heading-canvas"
        />
      </Suspense>
    </Tag>
  );
}
