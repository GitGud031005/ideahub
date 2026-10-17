// Exact provider IDs for the model names in the user's supplied list.
export const GEMINI_MODELS = [
  { id: "gemini-2.0-flash", label: "Gemini 2 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2 Flash Lite" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
] as const;
export const DEFAULT_GEMINI_FALLBACKS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
export function geminiModelOrder(primary = "gemini-3.8-flash", fallback = DEFAULT_GEMINI_FALLBACKS.join(",")) {
  const ids = [...new Set([primary, ...fallback.split(",").map(id => id.trim()).filter(Boolean)])];
  if (ids.some(id => !GEMINI_MODELS.some(m => m.id === id))) throw new Error("Model must belong to the configured IdeaHub catalog");
  return ids;
}
export function geminiModelLabel(id: string) { return GEMINI_MODELS.find(m => m.id === id)?.label ?? id; }
