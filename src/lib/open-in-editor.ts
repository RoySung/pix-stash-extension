import type { InspectParams } from "react-dev-inspector";

declare const __INSPECTOR_ROOT__: string;

function encodeEditorPath(filePath: string) {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function openInVSCode({ codeInfo }: Required<InspectParams>) {
  const { absolutePath, relativePath, lineNumber, columnNumber } = codeInfo;
  const filePath =
    absolutePath ??
    (relativePath ? `${__INSPECTOR_ROOT__}/${relativePath}` : undefined);

  if (!filePath) {
    console.warn("[react-dev-inspector] no file path in codeInfo", codeInfo);
    return;
  }

  const targetLine = lineNumber || 1;
  const targetColumn = columnNumber || 1;
  const url = `vscode://file${encodeEditorPath(filePath)}:${targetLine}:${targetColumn}`;
  const a = document.createElement("a");
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
