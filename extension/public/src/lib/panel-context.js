// extension/public/src/lib/panel-context.js
// True when popup.html is running as the side panel (loaded with ?panel=1),
// so the popup can hide its "open in side panel" button in that context.
export function isPanelContext(search) {
  try {
    return new URLSearchParams(search || "").get("panel") === "1";
  } catch {
    return false;
  }
}
