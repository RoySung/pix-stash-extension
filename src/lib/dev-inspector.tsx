import { openInVSCode } from "./open-in-editor";

interface DevInspectorOptions {
  onActiveChange?: (...args: unknown[]) => void;
  onClickElement?: (...args: unknown[]) => void;
}

export async function loadDevInspector(options: DevInspectorOptions = {}) {
  const { Inspector } = await import("react-dev-inspector");

  return (
    <Inspector
      onActiveChange={options.onActiveChange}
      onClickElement={options.onClickElement}
      onInspectElement={openInVSCode}
    />
  );
}
