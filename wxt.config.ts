import inspectorBabel from "@react-dev-inspector/babel-plugin";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  publicDir: "../public",
  modules: ["@wxt-dev/module-react"],
  react: {
    vite: {
      babel: {
        plugins: process.env.NODE_ENV === "development" ? [inspectorBabel] : [],
      },
    },
  },
  vite: (env) => ({
    define:
      env.mode === "development"
        ? { __INSPECTOR_ROOT__: JSON.stringify(process.cwd()) }
        : {},
  }),
  manifest: ({ browser }) => ({
    name: "PixStash",
    description: "Stash visual candidates. Pick the best.",
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      96: "icon/96.png",
      128: "icon/128.png",
    },
    action: {
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
      },
    },
    permissions: ["activeTab", "contextMenus", "scripting", "storage"],
    web_accessible_resources: [{ resources: ["capture-toast.html"], matches: ["<all_urls>"] }],
    host_permissions: ["<all_urls>"],
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "pixstash@roysung.dev",
            },
          }
        : undefined,
  }),
});
