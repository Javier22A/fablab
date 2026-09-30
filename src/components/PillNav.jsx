import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "./PillNav.css";

export default function PillNav({
  items,
  activeHref,
  className = "",
  ease = "power3.out",
  baseColor = "#2d526b",
  pillColor = "#4c87a8",
  hoveredPillTextColor = "#ffffff",
  initialLoadAnimation = true,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItemsRef = useRef(null);
  const pillRefs = useRef([]);
  const hoverTimelinesRef = useRef([]);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;

    const timelines = [];
    pillRefs.current.forEach((pill, index) => {
      if (!pill) return;
      const circle = pill.querySelector(".pill-nav__hover-circle");
      const label = pill.querySelector(".pill-nav__label");
      const hoverLabel = pill.querySelector(".pill-nav__label-hover");
      if (!circle || !label || !hoverLabel) return;

      gsap.set(circle, { scale: 0 });
      gsap.set(label, { y: 0 });
      gsap.set(hoverLabel, { y: "110%", opacity: 0 });

      const timeline = gsap.timeline({ paused: true });
      timeline.to(circle, { scale: 1, duration: 0.38, ease }, 0);
      timeline.to(label, { y: "-110%", duration: 0.28, ease }, 0);
      timeline.to(hoverLabel, { y: "0%", opacity: 1, duration: 0.28, ease }, 0.04);
      hoverTimelinesRef.current[index] = timeline;
      timelines.push(timeline);
    });

    if (initialLoadAnimation && navItemsRef.current) {
      gsap.fromTo(navItemsRef.current, { opacity: 0, y: -5 }, {
        opacity: 1,
        y: 0,
        duration: 0.42,
        ease,
        clearProps: "transform",
      });
    }

    return () => {
      timelines.forEach(timeline => timeline.kill());
      hoverTimelinesRef.current = [];
    };
  }, [ease, initialLoadAnimation, items]);

  useEffect(() => {
    const menu = mobileMenuRef.current;
    if (!menu || !mobileOpen) return undefined;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;

    gsap.fromTo(menu, { opacity: 0, y: -8 }, {
      opacity: 1,
      y: 0,
      duration: 0.2,
      ease,
      clearProps: "transform",
    });
    return undefined;
  }, [ease, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = event => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function animatePill(index, active) {
    const timeline = hoverTimelinesRef.current[index];
    if (!timeline) return;
    timeline.tweenTo(active ? timeline.duration() : 0, {
      duration: active ? 0.28 : 0.2,
      ease,
      overwrite: "auto",
    });
  }

  return (
    <nav
      className={`pill-nav${className ? ` ${className}` : ""}`}
      aria-label="Navegación principal"
      style={{
        "--pill-nav-ink": baseColor,
        "--pill-nav-glow": pillColor,
        "--pill-nav-glow-text": hoveredPillTextColor,
      }}
    >
      <div className="pill-nav__items" ref={navItemsRef}>
        <ul className="pill-nav__list">
          {items.map((item, index) => {
            const active = activeHref === item.href;
            return (
              <li key={item.href}>
                <a
                  ref={element => { pillRefs.current[index] = element; }}
                  className={`pill-nav__pill${active ? " is-active" : ""}`}
                  href={item.href}
                  aria-label={item.ariaLabel || item.label}
                  aria-current={active ? "page" : undefined}
                  onPointerEnter={() => animatePill(index, true)}
                  onPointerLeave={() => animatePill(index, false)}
                  onFocus={() => animatePill(index, true)}
                  onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget)) animatePill(index, false);
                  }}
                >
                  <span className="pill-nav__hover-circle" aria-hidden="true" />
                  <span className="pill-nav__label-stack">
                    <span className="pill-nav__label">{item.label}</span>
                    <span className="pill-nav__label-hover" aria-hidden="true">{item.label}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        className="pill-nav__mobile-toggle"
        type="button"
        aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={mobileOpen}
        aria-controls="pill-nav-mobile-menu"
        onClick={() => setMobileOpen(open => !open)}
      >
        <span className={`pill-nav__hamburger${mobileOpen ? " is-open" : ""}`} aria-hidden="true">
          <span />
          <span />
        </span>
      </button>

      <div
        id="pill-nav-mobile-menu"
        ref={mobileMenuRef}
        className="pill-nav__mobile-menu"
        hidden={!mobileOpen}
      >
        <ul className="pill-nav__mobile-list">
          {items.map(item => {
            const active = activeHref === item.href;
            return (
              <li key={item.href}>
                <a
                  className={`pill-nav__mobile-link${active ? " is-active" : ""}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
