import { chromium } from "@playwright/test";
const b = await chromium.launch();
/*
 * The last four are subchapters — one per shape a bundled file can take.
 * They are here because 96% of the corpus by file count renders through that
 * route and none of it was covered: the first version of this list ended at
 * the chapter, so a hydration mismatch in the code frame or the file rail
 * would have shipped green.
 */
const routes = [
  "/",
  "/mattpocock/skills",
  "/anthropics/skills",
  "/anthropics/skills/skill-creator",
  "/search?q=pdf",
  // prose
  "/anthropics/skills/pdf/forms.md",
  // code, with a gutter, `#L` anchors and a rail outline
  "/anthropics/skills/pdf/scripts/fill_fillable_fields.py",
  // oversized: a 40-line preview of a 237 KB schema, not 237 KB of tokens
  "/anthropics/skills/docx/scripts/office/schemas/ISO-IEC29500-4_2016/sml.xsd",
  // bytes: described, never decoded
  "/anthropics/skills/canvas-design/canvas-fonts/ArsenalSC-Regular.ttf",
];
let bad = 0;
for (const r of routes) {
  const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
  const msgs: string[] = [];
  p.on("console", m => { if (m.type()==="error" || m.type()==="warning") msgs.push(`[${m.type()}] ${m.text().slice(0,160)}`); });
  p.on("pageerror", e => msgs.push(`[pageerror] ${e.message.slice(0,160)}`));
  await p.goto("http://localhost:3150"+r, { waitUntil:"networkidle", timeout:150000 });
  await p.waitForTimeout(2500);
  const real = msgs.filter(m => !/Download the React DevTools|Fast Refresh/i.test(m));
  console.log(`${real.length ? "✗" : "✓"} ${r}`);
  real.forEach(m => { console.log("     " + m); bad++; });
  await p.close();
}
console.log(bad === 0 ? "\nNo console errors or warnings." : `\n${bad} problem(s).`);
await b.close();
process.exit(bad===0?0:1);
