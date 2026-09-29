import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "../styles.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App page={rootElement.dataset.page || "home"} />
    </React.StrictMode>
  );
}
