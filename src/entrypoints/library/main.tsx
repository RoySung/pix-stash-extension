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
    if (new URLSearchParams(location.search).get("mock") === "1") {
      const { seedDevLibrary } = await import("../../lib/dev-seed");
      await seedDevLibrary();
    } else {
      const { clearDevLibrary } = await import("../../lib/dev-seed");
      await clearDevLibrary();
    }

    const { loadDevInspector } = await import("../../lib/dev-inspector");
    inspector = await loadDevInspector({
      onActiveChange: (active) => console.log("[inspector] active:", active),
      onClickElement: (params) => console.log("[inspector] click:", params),
    });
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
