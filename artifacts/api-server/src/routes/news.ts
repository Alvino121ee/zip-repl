import { Router } from "express";
import { getCryptoNews, getStockNews, getAllNews } from "../services/news.js";
import type { NewsItem } from "../services/news.js";
import { GetNewsQueryParams } from "@workspace/api-zod";

const router = Router();

function toApiArticle(item: NewsItem) {
  const type =
    item.categories.includes("stocks") && !item.categories.includes("crypto")
      ? "stock"
      : item.categories.includes("crypto")
      ? "crypto"
      : "general";

  return {
    id: item.id,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    source: item.source,
    type,
    sentiment: item.sentiment,
    sentimentScore: item.sentimentScore,
    relatedAssets: item.tags,
    summary: item.body,
    imageUrl: item.imageUrl,
  };
}

router.get("/news", async (req, res) => {
  const parse = GetNewsQueryParams.safeParse(req.query);
  const type = parse.success ? (parse.data.type ?? "all") : "all";
  const limit = parse.success ? (parse.data.limit ?? 20) : 20;

  try {
    let news: NewsItem[];

    if (type === "crypto") {
      news = await getCryptoNews(limit);
    } else if (type === "stock") {
      news = await getStockNews(limit);
    } else {
      news = await getAllNews(limit);
    }

    res.json(news.map(toApiArticle));
  } catch (err) {
    req.log.error({ err }, "Failed to get news");
    res.status(502).json({ error: "Failed to fetch news" });
  }
});

export default router;
