// node shot2.cjs spec.json outdir — capturas de la app demo (login automático)
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const fs = require("fs");
(async () => {
  const [specF, out] = process.argv.slice(2); const spec = JSON.parse(fs.readFileSync(specF, "utf8"));
  const b = await chromium.launch();
  const ctxs = {}; const allMarks = {};
  const ctxFor = async (vw, vh, dpr, mobile) => {
    const key = `${vw}x${vh}x${dpr}`; if (ctxs[key]) return ctxs[key];
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, colorScheme: "dark", locale: "es-ES", isMobile: !!mobile, hasTouch: !!mobile });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login");
    await p.fill("input[type=email], input[name=email]", "maurizio@maurinventario.app");
    await p.fill("input[type=password]", "demo1234");
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click("button[type=submit]")]);
    return (ctxs[key] = p);
  };
  for (const s of spec) {
    const p = await ctxFor(s.vw || 1560, s.vh || 878, s.dpr || 2, s.mobile);
    await p.goto("http://localhost:3000" + s.path, { waitUntil: "networkidle", timeout: 120000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
    for (const a of s.actions || []) {
      if (a.click) await p.click(a.click);
      if (a.fill) await p.fill(a.fill, a.value);
      if (a.eval) await p.evaluate(a.eval);
      await p.waitForTimeout(a.wait || 500);
    }
    await p.waitForTimeout(600);
    const marks = {};
    for (const [k, m] of Object.entries(s.marks || {})) {
      const loc = m.sel ? p.locator(m.sel) : p.getByText(m.text, { exact: !!m.exact });
      const bb = await loc.nth(m.nth || 0).boundingBox().catch(() => null);
      const sc = await p.evaluate(() => [scrollX, scrollY]);
      marks[k] = bb && [Math.round(bb.x + sc[0]), Math.round(bb.y + sc[1]), Math.round(bb.width), Math.round(bb.height)];
      if (!bb) console.log("  ! mark", k);
    }
    allMarks[s.name] = marks;
    if (s.clip) { const el = p.locator(s.clip).first(); await el.screenshot({ path: `${out}/${s.name}.png` }); }
    else await p.screenshot({ path: `${out}/${s.name}.png`, fullPage: !!s.full });
    console.log("ok", s.name);
  }
  fs.writeFileSync(`${out}/marks.json`, JSON.stringify(allMarks, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
