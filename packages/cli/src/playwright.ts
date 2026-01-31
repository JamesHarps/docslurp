import { chromium, Browser, Page } from "playwright";
import { CrawledDocument } from "./crawl.js";

interface PlaywrightOptions {
  maxDepth: number;
  maxPages: number;
}

/**
 * Crawls a URL using Playwright for JavaScript-rendered sites.
 * Slower than cheerio but handles dynamic content. No API limits.
 */
export async function crawlWithPlaywright(
  startUrl: string,
  options: PlaywrightOptions
): Promise<CrawledDocument[]> {
  const { maxDepth, maxPages } = options;
  const baseUrl = new URL(startUrl);
  const visited = new Set<string>();
  const documents: CrawledDocument[] = [];

  // Queue entries: [url, depth]
  const queue: [string, number][] = [[startUrl, 0]];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "docslurp/1.0 (documentation crawler)",
    });

    while (queue.length > 0 && documents.length < maxPages) {
      const [url, depth] = queue.shift()!;

      // Normalize URL
      const normalizedUrl = normalizeUrl(url);
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

        // Wait a bit for any lazy-loaded content
        await page.waitForTimeout(1000);

        // Extract content
        const result = await page.evaluate(() => {
          // Remove nav, footer, scripts, etc.
          const elementsToRemove = document.querySelectorAll(
            "nav, footer, header, script, style, aside, .sidebar, .navigation, .menu, .ads, .advertisement"
          );
          elementsToRemove.forEach((el) => el.remove());

          // Get main content
          const main =
            document.querySelector("main") ||
            document.querySelector("article") ||
            document.querySelector('[role="main"]') ||
            document.body;

          return {
            title: document.title || "Untitled",
            content: main?.textContent?.trim() || "",
          };
        });

        // Skip pages with little content
        if (result.content.length >= 100) {
          documents.push({
            url: normalizedUrl,
            title: result.title,
            content: cleanText(result.content),
          });
        }

        // Find links if we haven't hit max depth
        if (depth < maxDepth) {
          const links = await page.evaluate((baseHost) => {
            return Array.from(document.querySelectorAll("a[href]"))
              .map((a) => (a as HTMLAnchorElement).href)
              .filter((href) => {
                try {
                  const url = new URL(href);
                  return url.hostname === baseHost && !href.includes("#");
                } catch {
                  return false;
                }
              });
          }, baseUrl.hostname);

          for (const link of links) {
            const normalized = normalizeUrl(link);
            if (!visited.has(normalized)) {
              queue.push([link, depth + 1]);
            }
          }
        }

        await page.close();
      } catch (error) {
        // Skip pages that fail to load
        continue;
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return documents;
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  // Remove trailing slash for consistency
  let path = parsed.pathname;
  if (path.endsWith("/") && path !== "/") {
    path = path.slice(0, -1);
  }
  parsed.pathname = path;
  return parsed.toString();
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}
