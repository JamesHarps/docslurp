import FirecrawlApp from "@mendable/firecrawl-js";
import { CrawledDocument } from "./crawl.js";

interface FirecrawlOptions {
  maxPages: number;
}

/**
 * Crawls a URL using Firecrawl API.
 * Handles JavaScript-rendered sites that cheerio can't process.
 * Requires FIRECRAWL_API_KEY environment variable.
 */
export async function crawlWithFirecrawl(
  startUrl: string,
  options: FirecrawlOptions
): Promise<CrawledDocument[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY environment variable is required.\n" +
        "Get your API key at: https://firecrawl.dev"
    );
  }

  const firecrawl = new FirecrawlApp({ apiKey });

  // First try scraping a single page if it's a specific file URL
  // crawlUrl is for crawling entire sites, scrapeUrl is for single pages
  // URLs ending in .html or .htm are single pages; trailing slash means a directory to crawl
  const isSinglePage = /\.(html?|pdf|txt)$/i.test(startUrl);

  if (isSinglePage) {
    // Use scrape for single pages
    const result = await firecrawl.scrapeUrl(startUrl, {
      formats: ["markdown"],
    });

    if (!result.success) {
      throw new Error(`Firecrawl error: ${result.error || "Unknown error"}`);
    }

    const content = result.markdown || "";
    if (content.length < 100) {
      return [];
    }

    return [{
      url: startUrl,
      title: result.metadata?.title || "Untitled",
      content: content,
    }];
  }

  // For sites, use crawl
  const result = await firecrawl.crawlUrl(startUrl, {
    limit: options.maxPages,
    scrapeOptions: {
      formats: ["markdown"],
    },
  });

  if (!result.success) {
    throw new Error(`Firecrawl error: ${result.error || "Unknown error"}`);
  }

  const documents: CrawledDocument[] = [];
  const pages = result.data || [];

  for (const page of pages) {
    // Skip pages without meaningful content
    const content = page.markdown || "";
    if (content.length < 100) continue;

    documents.push({
      url: page.url || startUrl,
      title: page.metadata?.title || page.url || "Untitled",
      content: content,
    });
  }

  return documents;
}
