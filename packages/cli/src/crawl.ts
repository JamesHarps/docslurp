import * as cheerio from "cheerio";

export interface CrawledDocument {
  url: string;
  title: string;
  content: string;
}

interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
}

/**
 * Crawls a documentation URL and extracts content from linked pages.
 * Uses cheerio for HTML parsing - works well for static docs sites.
 * For JS-heavy sites, consider using Firecrawl API instead.
 */
export async function crawlUrl(
  startUrl: string,
  options: CrawlOptions
): Promise<CrawledDocument[]> {
  const { maxDepth, maxPages } = options;
  const visited = new Set<string>();
  const documents: CrawledDocument[] = [];
  const baseUrl = new URL(startUrl);

  async function crawlPage(url: string, depth: number): Promise<void> {
    // Stop if we've hit our limits
    if (depth > maxDepth || documents.length >= maxPages || visited.has(url)) {
      return;
    }

    visited.add(url);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "docslurp/1.0 (https://github.com/jamesagudo/docslurp)",
        },
      });

      if (!response.ok) {
        return;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove script, style, nav, footer, header elements
      $("script, style, nav, footer, header, aside, .sidebar, .navigation").remove();

      // Get the page title
      const title = $("title").text().trim() ||
                    $("h1").first().text().trim() ||
                    url;

      // Extract main content - try common content containers
      let content = "";
      const mainSelectors = [
        "main",
        "article",
        "[role='main']",
        ".content",
        ".main-content",
        ".doc-content",
        ".markdown-body",
        "#content",
      ];

      for (const selector of mainSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text().trim();
          break;
        }
      }

      // Fallback to body if no main content found
      if (!content) {
        content = $("body").text().trim();
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, " ").trim();

      // Only add if we have meaningful content
      if (content.length > 100) {
        documents.push({ url, title, content });
      }

      // Find links to crawl next
      if (depth < maxDepth && documents.length < maxPages) {
        const links: string[] = [];

        $("a[href]").each((_, element) => {
          const href = $(element).attr("href");
          if (!href) return;

          try {
            const linkUrl = new URL(href, url);

            // Only crawl same-origin links
            if (linkUrl.origin === baseUrl.origin && !visited.has(linkUrl.href)) {
              // Skip anchors, external links, and non-doc pages
              if (!linkUrl.href.includes("#") &&
                  !linkUrl.pathname.match(/\.(png|jpg|gif|svg|pdf|zip)$/i)) {
                links.push(linkUrl.href);
              }
            }
          } catch {
            // Invalid URL, skip
          }
        });

        // Crawl found links
        for (const link of links.slice(0, 20)) {
          if (documents.length >= maxPages) break;
          await crawlPage(link, depth + 1);
        }
      }
    } catch (error) {
      // Skip pages that fail to load
      console.error(`Failed to crawl ${url}: ${error}`);
    }
  }

  await crawlPage(startUrl, 0);
  return documents;
}
