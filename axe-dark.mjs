import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const br = await chromium.launch();
const ctx = await br.newContext({viewport:{width:1280,height:1024},colorScheme:"dark"});
const p = await ctx.newPage();
for (const r of ["/anthropics/skills","/mattpocock/skills","/DreambaseAI/skills","/openai/skills"]) {
  await p.goto("http://localhost:3311"+r,{waitUntil:"load"});
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(2000);
  const meta = await p.evaluate(()=>({title:document.title, lang:document.documentElement.lang, url:location.href}));
  const res = await new AxeBuilder({page:p}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
  console.log(r, JSON.stringify(meta), res.violations.map(v=>`${v.id}x${v.nodes.length}`).join(",")||"clean");
}
await br.close();
