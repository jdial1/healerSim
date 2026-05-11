import { chromium, type Page, type ConsoleMessage } from 'playwright';
import { testPalette } from './testColors';

const T = testPalette();
const APP_URL = 'http://localhost:3000';

async function checkImageHealth(page: Page, viewName: string) {
  const images = await page.locator('img').all();
  let brokenCount = 0;
  
  for (const img of images) {
    const src = await img.getAttribute('src');
    const isLoaded = await img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0);
    
    if (!isLoaded) {
      console.error(`${T.red}  [Broken Image]${T.r} in ${viewName}: ${src}`);
      brokenCount++;
    }
  }
  return brokenCount;
}

async function runHealthCheck() {
  console.log(`${T.cyan}🚀 Starting AEGIS DOM & Asset Health Audit...${T.r}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];

  // Capture JS Errors
  page.on('pageerror', (err) => {
    errors.push(`JS Crash: ${err.message}`);
    console.error(`${T.red}❌ JS ERROR:${T.r}`, err.message);
  });

  // Capture Console Errors
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
      console.error(`${T.yellow}⚠️ Console Error:${T.r}`, msg.text());
    }
  });

  try {
    // 1. SPLASH SCREEN
    console.log(`${T.dim}Checking Splash Screen...${T.r}`);
    await page.goto(APP_URL);
    await page.waitForSelector('h1:has-text("AEGIS")');
    const splashImgs = await checkImageHealth(page, 'Splash');

    // 2. CHARACTER ROSTER
    console.log(`${T.dim}Checking Character Roster...${T.r}`);
    await page.click('button:has-text("Tap to Begin")');
    await page.waitForSelector('div:has-text("THE ORDER")');
    const rosterImgs = await checkImageHealth(page, 'Roster');

    // 3. DUNGEON SELECTOR (Enter as Priest)
    console.log(`${T.dim}Checking Dungeon Selector (Entering as Priest)...${T.r}`);
    const priestRow = page.locator('button:has-text("Holy Priest")');
    await priestRow.click();
    await page.waitForSelector('h1:has-text("DUNGEONS")');
    const dungeonImgs = await checkImageHealth(page, 'Dungeon Select');

    // 4. TALENT TREE
    console.log(`${T.dim}Checking Talent Tree...${T.r}`);
    await page.click('[data-tutorial-id="nav-talents"]');
    await page.waitForSelector('h2:has-text("Talents")');
    // Ensure SVG lines are rendered
    const svgLines = await page.locator('line').count();
    if (svgLines === 0) console.error(`${T.red}❌ No talent connections rendered!${T.r}`);
    const talentImgs = await checkImageHealth(page, 'Talents');

    // 5. CHARACTER STATS
    console.log(`${T.dim}Checking Stats Modal...${T.r}`);
    await page.click('button:has-text("Character")');
    await page.waitForSelector('h2:has-text("Holy Priest")');
    await page.waitForSelector('div:has-text("Attributes")');
    const statsImgs = await checkImageHealth(page, 'Stats Modal');

    // FINAL SUMMARY
    const totalBroken = splashImgs + rosterImgs + dungeonImgs + talentImgs + statsImgs;

    console.log(`\n${'='.repeat(50)}`);
    if (errors.length === 0 && totalBroken === 0) {
      console.log(`${T.green}✅ HEALTH CHECK PASSED${T.r}`);
      console.log(`All views rendered, 0 JS errors, all icons loaded.`);
    } else {
      console.log(`${T.red}❌ HEALTH CHECK FAILED${T.r}`);
      console.log(`JS Errors: ${errors.length}`);
      console.log(`Broken Images: ${totalBroken}`);
      process.exit(1);
    }
    console.log(`${'='.repeat(50)}`);

  } catch (e) {
    console.error(`${T.red}FATAL:${T.r} App timed out or was not reachable at ${APP_URL}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runHealthCheck();