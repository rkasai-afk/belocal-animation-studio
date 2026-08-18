const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  page.on('console', msg => { if (msg.type() === 'error') { console.log('CONSOLE ERROR:', msg.text()); hadError = true; } });
  page.on('pageerror', err => { console.log('PAGE ERROR:', err.message); hadError = true; });

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa6');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  async function clickAspect(matchText) {
    const btns = await page.$$('.aspect-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('aspect button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(400);
  }
  async function loadTemplateByLabel(matchText) {
    const btns = await page.$$('.tpl-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('template button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(300);
    return labels;
  }
  async function checkOverflow() {
    return page.evaluate(() => {
      return canvas.getObjects().filter(o => {
        const r = o.getBoundingRect(true, true);
        return r.left < -1 || r.top < -1 || r.left + r.width > canvas.width + 1 || r.top + r.height > canvas.height + 1;
      }).map(o => o.name || o.type);
    });
  }

  const labels = await loadTemplateByLabel('Lower-Third');
  console.log('all templates:', labels);
  const newOnes = ['Lower-Third', 'Quote', 'Timeline', 'Listicle'].filter(n => labels.some(l => l.includes(n)));
  console.log('1. new templates present:', newOnes, newOnes.length === 4 ? 'OK' : 'FAIL');

  let n = 2;
  for (const tplLabel of ['Lower-Third', 'Quote', 'Timeline', 'Listicle']) {
    for (const aspectLabel of ['Widescreen', 'Vertical', 'Square']) {
      await clickAspect(aspectLabel);
      await loadTemplateByLabel(tplLabel);
      await page.waitForTimeout(200);
      const overflow = await checkOverflow();
      console.log(`${n}. ${tplLabel} @ ${aspectLabel}: overflowing =`, overflow, overflow.length === 0 ? 'OK' : 'FAIL');
      await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2,'0')}_${tplLabel.replace(/[^a-z0-9]/gi,'_')}_${aspectLabel}_edit.png`) });
      n++;
    }
  }

  // preview animation for each new template at landscape, to eyeball entrance timing/overlap
  await clickAspect('Widescreen');
  for (const tplLabel of ['Lower-Third', 'Quote', 'Timeline', 'Listicle']) {
    await loadTemplateByLabel(tplLabel);
    await page.click('#btnPlay');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2,'0')}_${tplLabel.replace(/[^a-z0-9]/gi,'_')}_preview_mid.png`) });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2,'0')}_${tplLabel.replace(/[^a-z0-9]/gi,'_')}_preview_end.png`) });
    await page.waitForTimeout(1500);
    n++;
  }
  console.log(`${n}. preview animations captured for all four new templates`);

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
