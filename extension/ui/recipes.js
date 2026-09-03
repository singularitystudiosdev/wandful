// Wandful — built-in recipe library (free, no key, no cast needed).
// Seeded from documented, recurring community pains; each recipe is plain CSS.
// The Salesforce entry exists because users there literally hand-write uBlock
// selectors to hide the "Ask Agentforce" button (r/salesforce, 2026-09).

export const RECIPES = [
  {
    id: "yt-remove-shorts",
    title: "YouTube — Remove Shorts",
    desc: "Hides Shorts shelves, tabs and nav entries across YouTube.",
    origins: ["https://www.youtube.com"],
    chain: [
      "ytd-rich-shelf-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-compact-shelf-renderer",
      "ytd-guide-entry-renderer a[title='Shorts']",
      "tp-yt-paper-tab[aria-label='Shorts']",
      "ytd-mini-guide-entry-renderer[aria-label='Shorts']",
    ],
  },
  {
    id: "google-remove-sponsored",
    title: "Google — Remove sponsored results",
    desc: "Strips the sponsored/ad blocks from Google search results.",
    origins: ["https://www.google.com"],
    chain: ["#tads", "#taw", ".uEierd"],
  },
  {
    id: "sf-hide-agentforce",
    title: "Salesforce — Hide “Ask Agentforce”",
    desc: "Hides the Ask Agentforce button on Lightning pages (per-org origin).",
    origins: [],
    chain: ["button[aria-label='Ask Agentforce']"],
    anyOrigin: true,
  },
];

export function recipeCss(recipe) {
  return recipe.chain.map((sel) => `${sel} { display: none !important; }`).join("\n");
}
