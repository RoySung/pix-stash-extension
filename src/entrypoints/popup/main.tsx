import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../lib/i18n";
import "../../styles/theme.css";
import "./style.css";
import { App } from "./App";

const root = document.getElementById("root");

async function renderApp(container: HTMLElement) {
  let inspector = null;

  if (import.meta.env.DEV) {
    const { loadDevInspector } = await import("../../lib/dev-inspector");
    inspector = await loadDevInspector();
  }

  createRoot(container).render(
    <StrictMode>
      {inspector}
      <App />
    </StrictMode>,
  );
}

if (root) {
  void renderApp(root);
}
