import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const dist = resolve("dist");
const indexFile = join(dist, "index.html");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    let filePath = resolve(join(dist, pathname));

    if (!filePath.startsWith(dist)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      if (extname(pathname)) {
        response.writeHead(404).end("Not found");
        return;
      }
      filePath = indexFile;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mime[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

const port = await new Promise((resolvePort, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolvePort(server.address().port));
});

const base = `http://127.0.0.1:${port}/`;

const fallback = `
<noscript data-prerender-fallback>
  <section>
    <h2>About Saan Punta</h2>
    <p>Saan Punta is a free commute route finder and fare calculator for Valenzuela, Caloocan, and nearby Metro Manila. Choose a starting point and destination to compare jeepney, bus, tricycle, taxi, motorcycle taxi, train, and walking options.</p>
    <p>Fares are estimates based on March 2026 LTFRB rates. The planner supports student, senior, and PWD concessionary discounts, ordinary and air-conditioned buses, single-journey and stored-value train tickets, and shared or special tricycle rides.</p>
    <p>Routes and locations are manually curated for the Valenzuela and Caloocan corridor. This is a planning aid, not an official transit authority service. Confirm fares and routes locally before travelling.</p>
  </section>
</noscript>`;

let executablePath;
let launchArgs;
let headless = true;
if (process.platform === "linux") {
  // Vercel is not Lambda, so @sparticuz/chromium does not auto-detect the
  // environment. This flag makes it extract the AL2023 shared libraries and
  // prepend them to LD_LIBRARY_PATH.
  process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
  const { default: chromium } = await import("@sparticuz/chromium");
  executablePath = await chromium.executablePath();
  launchArgs = chromium.args;
  headless = chromium.headless;
  console.log(`Chromium libraries: ${process.env.LD_LIBRARY_PATH ?? "unset"}`);
} else {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  executablePath = candidates.find((candidate) => existsSync(candidate));
  launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
}

if (!executablePath) {
  throw new Error("No Chrome executable found. Set CHROME_PATH.");
}

const browser = await puppeteer.launch({
  executablePath,
  headless,
  args: launchArgs,
});

const consoleErrors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  let inflight = 0;
  page.on("request", () => { inflight += 1; });
  page.on("requestfinished", () => { inflight = Math.max(0, inflight - 1); });
  page.on("requestfailed", (request) => {
    inflight = Math.max(0, inflight - 1);
    consoleErrors.push(`requestfailed ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1", { timeout: 30_000 });

  // Let in-flight assets settle. Cap the wait so a long-lived connection cannot
  // block a deploy indefinitely.
  const networkDeadline = Date.now() + 8_000;
  let quietChecks = 0;
  while (Date.now() < networkDeadline && quietChecks < 3) {
    await new Promise((r) => setTimeout(r, 250));
    quietChecks = inflight === 0 ? quietChecks + 1 : 0;
  }

  await page.evaluate(() => document.fonts.ready);

  // Wait for the h1 text to stop changing before serializing the DOM.
  let lastHeading = "";
  let stableChecks = 0;
  const headingDeadline = Date.now() + 15_000;
  while (Date.now() < headingDeadline && stableChecks < 4) {
    const heading = await page.$eval("h1", (element) => element.innerText.trim()).catch(() => "");
    if (heading && heading === lastHeading) stableChecks += 1;
    else {
      lastHeading = heading;
      stableChecks = 0;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!lastHeading) throw new Error("No stable h1 was rendered");
  await new Promise((r) => setTimeout(r, 500));

  let html = await page.content();
  html = html.replace(/http:\/\/(?:127\.0\.0\.1|localhost):\d+/g, "");
  if (!html.includes("data-prerender-fallback")) {
    html = html.replace("</body>", `${fallback}\n</body>`);
  }
  await writeFile(indexFile, html, "utf8");

  const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  const rawBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "");
  const rawText = rawBody
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  console.log(`Prerendered ${base} -> dist/index.html`);
  console.log(`h1: ${lastHeading}`);
  console.log(`Browser body text: ${bodyText.length} chars`);
  console.log(`Raw HTML body text: ${rawText.length} chars`);
  console.log(`Raw HTML bytes: ${Buffer.byteLength(html)}`);

  // Load the file we just wrote and confirm React still mounts cleanly.
  const verifyErrors = [];
  const verifyPage = await browser.newPage();
  verifyPage.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 400) {
      verifyErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  verifyPage.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !/Failed to load resource|net::ERR_/.test(text)) {
      verifyErrors.push(text);
    }
  });
  verifyPage.on("pageerror", (error) => verifyErrors.push(error.message));
  await verifyPage.goto(base, { waitUntil: "networkidle0", timeout: 60_000 });
  await verifyPage.waitForSelector("h1", { timeout: 15_000 });
  await new Promise((r) => setTimeout(r, 500));
  const verifyHeading = await verifyPage.$eval("h1", (element) => element.innerText.trim());
  const verifyText = await verifyPage.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  console.log(`After React mount: h1="${verifyHeading}", body text ${verifyText.length} chars`);
  if (verifyErrors.length) {
    throw new Error(`Prerendered page has browser errors: ${verifyErrors.join(" | ")}`);
  }
  if (consoleErrors.length) {
    console.warn(`Browser console errors (${consoleErrors.length}):`);
    for (const error of consoleErrors) console.warn(`  ${error}`);
  }
} finally {
  await browser.close();
  server.close();
}
