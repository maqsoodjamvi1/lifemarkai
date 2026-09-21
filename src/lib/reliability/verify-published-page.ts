/** HTTP 200 alone can hide a prerendered shell with missing CSS and route chunks. */
export async function verifyPublishedPage(url: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL });
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && ["document", "script", "stylesheet"].includes(response.request().resourceType())) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      if (["script", "stylesheet"].includes(request.resourceType())) {
        errors.push(`${request.failure()?.errorText ?? "Request failed"} ${request.url()}`);
      }
    });
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    // SPA hydration can commit after the network has gone idle. Wait for the
    // same content requirement we assert below, rather than sampling the shell.
    await page.waitForFunction(() => (document.body?.innerText.trim().length ?? 0) >= 100,
      undefined, { timeout: 15_000 }).catch(() => {});
    const text = (await page.locator("body").innerText()).trim();
    if (!response?.ok()) errors.push(`Document returned ${response?.status() ?? "no response"}`);
    if (text.length < 100) errors.push("Published page has no meaningful rendered content");
    if (/^(not found|404|application error)$/im.test(text)) errors.push("Published page rendered an error route");
    return { passed: errors.length === 0, errors, textLength: text.length };
  } finally {
    await browser.close();
  }
}
