import type { SearchEntry } from "../content/business-for-startup/types";
export function normalizeStartupText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
}
export function searchStartup(entries: SearchEntry[], query: string) {
  const phrase = normalizeStartupText(query.slice(0, 160));
  const terms = phrase.split(" ").filter(Boolean);
  if (!terms.length) return [];
  const matches = entries.map((entry, index) => {
    const title = normalizeStartupText(`${entry.lesson} ${entry.title}`), body = normalizeStartupText(entry.text);
    const haystack = `${title} ${body}`;
    const exactPhrase = haystack.includes(phrase);
    const words = ` ${haystack.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    if (!exactPhrase && !terms.every(term => words.includes(` ${term} `))) return null;
    const score = (title.includes(phrase) ? 40 : body.includes(phrase) ? 15 : 0) + terms.reduce((total, term) => total + (title.includes(term) ? 4 : 1), 0);
    const match = body.includes(phrase) ? body.indexOf(phrase) : terms.map(term => body.indexOf(term)).filter(n => n >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, match - 45);
    return { ...entry, exactPhrase, score, index, snippet: `${start ? "…" : ""}${entry.text.slice(start, start + 170)}${start + 170 < entry.text.length ? "…" : ""}` };
  }).filter(result => result !== null);
  const relevant = matches.some(result => result.exactPhrase) ? matches.filter(result => result.exactPhrase) : matches;
  return relevant.sort((a, b) => b.score - a.score || a.index - b.index);
}
