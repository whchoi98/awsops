import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'https://awsops.whchoi.net/awsops';
const LOGIN_EMAIL = 'admin@awsops.local';
const LOGIN_PASSWORD = '!234Qwer';
const OUTPUT_DIR = path.join(__dirname, '..', 'static', 'screenshots');

// DPR resolution map: viewport stays 1920x1080, only pixel density changes
const DPR_MAP: Record<string, { dpr: number; suffix: string }> = {
  fhd:  { dpr: 1,   suffix: '' },        // 1920x1080
  qhd:  { dpr: 1.5, suffix: '@1.5x' },   // 2880x1620
  '4k': { dpr: 2,   suffix: '@2x' },      // 3840x2160
};

interface PageCapture {
  category: string;
  name: string;
  path: string;
  waitSelector?: string;
}

const pages: PageCapture[] = [
  // Overview
  { category: 'overview', name: 'dashboard', path: '/' },
  { category: 'overview', name: 'ai-assistant', path: '/ai' },
  { category: 'overview', name: 'agentcore', path: '/agentcore' },
  // Compute
  { category: 'compute', name: 'ec2', path: '/ec2' },
  { category: 'compute', name: 'lambda', path: '/lambda' },
  { category: 'compute', name: 'ecs', path: '/ecs' },
  { category: 'compute', name: 'ecr', path: '/ecr' },
  { category: 'compute', name: 'eks', path: '/k8s' },
  { category: 'compute', name: 'eks-explorer', path: '/k8s/explorer' },
  { category: 'compute', name: 'eks-pods', path: '/k8s/pods' },
  { category: 'compute', name: 'eks-nodes', path: '/k8s/nodes' },
  { category: 'compute', name: 'eks-deployments', path: '/k8s/deployments' },
  { category: 'compute', name: 'eks-services', path: '/k8s/services' },
  { category: 'compute', name: 'container-cost', path: '/container-cost' },
  { category: 'compute', name: 'eks-container-cost', path: '/eks-container-cost' },
  // Network & CDN
  { category: 'network', name: 'vpc', path: '/vpc' },
  { category: 'network', name: 'cloudfront', path: '/cloudfront-cdn' },
  { category: 'network', name: 'waf', path: '/waf' },
  { category: 'network', name: 'topology', path: '/topology' },
  // Storage & DB
  { category: 'storage', name: 'ebs', path: '/ebs' },
  { category: 'storage', name: 's3', path: '/s3' },
  { category: 'storage', name: 'rds', path: '/rds' },
  { category: 'storage', name: 'dynamodb', path: '/dynamodb' },
  { category: 'storage', name: 'elasticache', path: '/elasticache' },
  { category: 'storage', name: 'opensearch', path: '/opensearch' },
  { category: 'storage', name: 'msk', path: '/msk' },
  // Monitoring
  { category: 'monitoring', name: 'bedrock', path: '/bedrock' },
  { category: 'monitoring', name: 'monitoring', path: '/monitoring' },
  { category: 'monitoring', name: 'cloudwatch', path: '/cloudwatch' },
  { category: 'monitoring', name: 'cloudtrail', path: '/cloudtrail' },
  { category: 'monitoring', name: 'cost', path: '/cost' },
  { category: 'monitoring', name: 'inventory', path: '/inventory' },
  // Security
  { category: 'security', name: 'iam', path: '/iam' },
  { category: 'security', name: 'security', path: '/security' },
  { category: 'security', name: 'compliance', path: '/compliance' },
];

function parseDprArg(): string[] {
  const dprArg = process.argv.find(a => a.startsWith('--dpr='));
  const value = dprArg ? dprArg.split('=')[1] : 'all';

  if (value === 'all') {
    return Object.keys(DPR_MAP);
  }

  // Support comma-separated: --dpr=1,2 or single: --dpr=1.5
  const requested = value.split(',');
  const keys: string[] = [];
  for (const r of requested) {
    const dprNum = parseFloat(r.trim());
    const match = Object.entries(DPR_MAP).find(([, v]) => v.dpr === dprNum);
    if (match) {
      keys.push(match[0]);
    } else {
      console.warn(`Unknown DPR value: ${r} (valid: 1, 1.5, 2)`);
    }
  }
  return keys.length > 0 ? keys : Object.keys(DPR_MAP);
}

async function login(page: Page): Promise<void> {
  console.log('Navigating to login page...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for page to fully load including Cognito redirect
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log(`Current URL: ${currentUrl}`);

  // If redirected to Cognito hosted UI
  if (currentUrl.includes('amazoncognito.com') || currentUrl.includes('auth.')) {
    console.log('Cognito hosted UI detected, filling credentials...');

    // Wait for the form element to exist in DOM (not necessarily visible)
    await page.waitForSelector('#signInFormUsername', { state: 'attached', timeout: 30000 });

    // Debug: capture login page and check element state
    await page.screenshot({ path: path.join(OUTPUT_DIR, '_cognito-login.png'), fullPage: true });
    const formInfo = await page.evaluate(() => {
      const el = document.getElementById('signInFormUsername') as HTMLInputElement;
      if (!el) return 'Element not found';
      const style = window.getComputedStyle(el);
      return JSON.stringify({
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        type: el.type,
        parentDisplay: el.parentElement ? window.getComputedStyle(el.parentElement).display : 'none',
      });
    });
    console.log(`Form element state: ${formInfo}`);

    // Use JavaScript to directly set values and submit (bypasses CSS visibility)
    await page.evaluate(({ email, password }) => {
      const usernameEl = document.getElementById('signInFormUsername') as HTMLInputElement;
      const passwordEl = document.getElementById('signInFormPassword') as HTMLInputElement;

      if (usernameEl) {
        usernameEl.value = email;
        usernameEl.dispatchEvent(new Event('input', { bubbles: true }));
        usernameEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (passwordEl) {
        passwordEl.value = password;
        passwordEl.dispatchEvent(new Event('input', { bubbles: true }));
        passwordEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });

    // Click submit via JS as well
    await page.evaluate(() => {
      const submitBtn = document.querySelector('input[name="signInSubmitButton"]') as HTMLInputElement;
      if (submitBtn) {
        submitBtn.click();
      } else {
        // Fallback: submit the form directly
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) form.submit();
      }
    });

    // Wait for redirect back to app
    await page.waitForURL('**/awsops/**', { timeout: 60000 });
    console.log('Login successful, redirected to app.');
  } else {
    console.log('Already logged in or no Cognito redirect.');
  }

  await page.waitForTimeout(5000);
}

async function captureScreenshot(
  page: Page,
  capture: PageCapture,
  suffix: string,
): Promise<void> {
  const dir = path.join(OUTPUT_DIR, capture.category);
  fs.mkdirSync(dir, { recursive: true });

  // Viewport screenshot
  await page.screenshot({
    path: path.join(dir, `${capture.name}${suffix}.png`),
    fullPage: false,
  });

  // Full page screenshot
  await page.screenshot({
    path: path.join(dir, `${capture.name}-full${suffix}.png`),
    fullPage: true,
  });
}

async function captureAllDprs(
  browser: Browser,
  dprKeys: string[],
  cookies: { name: string; value: string; domain: string; path: string }[],
): Promise<void> {
  for (const key of dprKeys) {
    const { dpr, suffix } = DPR_MAP[key];
    const label = `${key.toUpperCase()} (DPR ${dpr}${suffix || ''})`;
    console.log(`\n=== Capturing at ${label} ===`);

    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: dpr,
      ignoreHTTPSErrors: true,
    });

    // Restore session cookies so we don't need to login again per DPR
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    for (const capture of pages) {
      const url = `${BASE_URL}${capture.path}`;
      console.log(`  ${capture.category}/${capture.name}${suffix} (${url})`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        if (capture.waitSelector) {
          await page.waitForSelector(capture.waitSelector, { timeout: 10000 }).catch(() => {});
        }

        await captureScreenshot(page, capture, suffix);
        console.log(`    Done`);
      } catch (err) {
        console.error(`    Error: ${err}`);
      }
    }

    await context.close();
  }
}

async function main(): Promise<void> {
  const dprKeys = parseDprArg();
  console.log('Starting screenshot capture...');
  console.log(`DPR targets: ${dprKeys.map(k => `${k} (${DPR_MAP[k].dpr}x)`).join(', ')}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch({ headless: true });

  // Login once with DPR 1, then reuse cookies for other DPRs
  const loginContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const loginPage = await loginContext.newPage();

  try {
    await login(loginPage);
    const cookies = await loginContext.cookies();
    await loginContext.close();

    await captureAllDprs(browser, dprKeys, cookies);

    console.log(`\nAll screenshots captured to ${OUTPUT_DIR}`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await browser.close();
  }
}

main();
