import { lazy, Suspense } from "react";
import { BASE_URL } from "../lib/paths.js";

const SpecularButton = lazy(() => import("./SpecularButton.jsx"));
const PillNav = lazy(() => import("./PillNav.jsx"));

const institutions = [
  { src: "logofablab.jpg", alt: "FabLab", className: "institution-logo-image" },
  { src: "ucuencalogo.png", alt: "Universidad de Cuenca" },
  { src: "ingindustriallogo.jpg", alt: "Ingeniería Industrial" },
];

const navigationItems = [
  { label: "Home", href: `${BASE_URL}index.html` },
  { label: "About", href: `${BASE_URL}about.html` },
  { label: "Final Project", href: `${BASE_URL}final-project.html` },
];

export default function SiteHeader({ page, authenticated, onAuthClick }) {
  const authLabel = authenticated ? "Cerrar sesión" : "Soy del equipo :)";
  return (
    <header className="site-header">
      <a className="brand" href={`${BASE_URL}index.html`} aria-label="Ir a la portada">
        <img className="brand-mark" src={`${BASE_URL}images/logofablab.jpg`} alt="Logo FabLab" />
        <span><strong>FabLab I+D</strong><small>Bitácora de ingeniería y prototipado</small></span>
      </a>
      <div className="global-nav">
        <div className="institution-logos" aria-label="Instituciones colaboradoras">
          {institutions.map(institution => (
            <span key={institution.src} className={`institution-logo ${institution.className || ""}`}>
              <img src={`${BASE_URL}images/${institution.src}`} alt={institution.alt} />
            </span>
          ))}
        </div>
        <Suspense fallback={
          <nav className="page-links" aria-label="Navegación principal">
            {navigationItems.map(item => (
              <a
                key={item.href}
                className={`page-link${item.label.toLowerCase().replace(" ", "-") === page ? " active" : ""}`}
                href={item.href}
                aria-current={item.label.toLowerCase().replace(" ", "-") === page ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        }>
          <PillNav
            items={navigationItems}
            activeHref={navigationItems.find(item => item.label.toLowerCase().replace(" ", "-") === page)?.href}
            baseColor="#2d526b"
            pillColor="#4c87a8"
            hoveredPillTextColor="#ffffff"
          />
        </Suspense>
      </div>
      <div className="header-actions">
        {authenticated && <span className="status-badge">Edición activa</span>}
        <Suspense fallback={<button className="button button-primary" type="button" onClick={onAuthClick}>{authLabel}</button>}>
          <SpecularButton
            size="sm"
            radius={9}
            tint="#2d526b"
            tintOpacity={1}
            textColor="#ffffff"
            lineColor="#c7e0ec"
            baseColor="#4c87a8"
            intensity={0.48}
            shineSize={8}
            shineFade={35}
            thickness={0.8}
            speed={0.3}
            proximity={110}
            className="specular-login-button"
            onClick={onAuthClick}
          >
            {authLabel}
          </SpecularButton>
        </Suspense>
      </div>
    </header>
  );
}
