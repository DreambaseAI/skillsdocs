import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const br = await chromium.launch();
const routes = ["/","/search?q=pdf","/anthropics/skills","/anthropics/skills/skill-creator","/anthropics/skills/claude-api","/microsoft/azure-skills","/openai/skills","/mattpocock/skills","/DreambaseAI/skills","/supabase/agent-skills","/stripe/agent-toolkit","/vercel-labs/next-skills","/obra/superpowers","/nope/nope"];
let total=0;
for (const scheme of ["light","dark"]) {
  const ctx = await br.newContext({viewport:{width:1280,height:1024},colorScheme:scheme});
  const p = await ctx.newPage();
  for (const r of routes) {
    await p.goto("http://localhost:3311"+r,{waitUntil:"networkidle"});
    await p.waitForTimeout(700);
    const res = await new AxeBuilder({page:p}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    const n = res.violations.reduce((a,v)=>a+v.nodes.length,0);
    total += n;
    console.log(scheme, r.padEnd(38), n? res.violations.map(v=>`${v.impact}:${v.id}x${v.nodes.length}`).join(", ") : "clean");
  }
  await ctx.close();
}
console.log("TOTAL VIOLATION NODES:", total);
await br.close();
