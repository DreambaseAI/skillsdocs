import { chromium } from "@playwright/test";
const b = await chromium.launch();
const routes = ["/", "/mattpocock/skills", "/anthropics/skills", "/anthropics/skills/skill-creator", "/search?q=pdf"];
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
