import { BASE_URL } from "../lib/paths.js";

const institutions = [
  { src: "logofablab.jpg", alt: "FabLab", className: "institution-logo-image" },
  { src: "ucuencalogo.png", alt: "Universidad de Cuenca" },
  { src: "ingindustriallogo.jpg", alt: "Ingeniería Industrial" },
];

export default function SiteHeader({ page, authenticated, onAuthClick }) {
  return (
    <header className="site-header">
      <a className="brand" href={`${BASE_URL}index.html`} aria-label="Ir a la portada">
        <img className="brand-mark" src={`${BASE_URL}images/logofablab.jpg`} alt="Logo FabLab" />
        <span><strong>FabLab I+D</strong><small>Bitácora de ingeniería y prototipado</small></span>
      </a>
      <nav className="global-nav" aria-label="Navegación principal">
        <div className="institution-logos" aria-label="Instituciones colaboradoras">
          {institutions.map(institution => (
            <span key={institution.src} className={`institution-logo ${institution.className || ""}`}>
              <img src={`${BASE_URL}images/${institution.src}`} alt={institution.alt} />
            </span>
          ))}
        </div>
        <div className="page-links">
          <a className={`page-link ${page === "home" ? "active" : ""}`} href={`${BASE_URL}index.html`}>Home</a>
          <a className={`page-link ${page === "about" ? "active" : ""}`} href={`${BASE_URL}about.html`}>About</a>
          <a className={`page-link ${page === "final-project" ? "active" : ""}`} href={`${BASE_URL}final-project.html`}>Final Project</a>
        </div>
      </nav>
      <div className="header-actions">
        {authenticated && <span className="status-badge">Edición activa</span>}
        <button className="button button-primary" type="button" onClick={onAuthClick}>
          {authenticated ? "Cerrar sesión" : "Soy del equipo :)"}
        </button>
      </div>
    </header>
  );
}
