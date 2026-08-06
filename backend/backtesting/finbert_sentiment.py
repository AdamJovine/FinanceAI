from datetime import date, timedelta

import requests
import torch
import yfinance as yf
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from online_sentiment import PERIGON_URL

MODEL_NAME = "ProsusAI/finbert"

_model = None
_tokenizer = None


def load_finbert():
    """Lazily load and cache the FinBERT model/tokenizer for this process.

    Runs entirely locally after the first download (~400MB, cached by
    huggingface_hub) -- no API key, no per-call network request, no rate
    limit. A few seconds to load per fresh process, then sub-second batch
    inference on CPU.
    """
    global _model, _tokenizer
    if _model is None:
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        _model.eval()
    return _model, _tokenizer


def score_texts_finbert(texts, batch_size=16):
    """Score a list of texts with FinBERT, returning one
    {"positive": p, "negative": n, "neutral": u, "score": p - n} dict per text.
    """
    if not texts:
        return []

    model, tokenizer = load_finbert()
    id2label = {i: label.lower() for i, label in model.config.id2label.items()}
    results = []

    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            inputs = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
            probs = torch.softmax(model(**inputs).logits, dim=-1)
            for row in probs:
                scores = {id2label[j]: float(row[j]) for j in range(len(id2label))}
                scores["score"] = scores.get("positive", 0.0) - scores.get("negative", 0.0)
                results.append(scores)

    return results


def fetch_yahoo_news(ticker, limit=10):
    """Recent headlines for `ticker` from Yahoo Finance, via yfinance.

    This is *live only* -- Yahoo's news feed returns current top stories, not
    a date-range-queryable archive, so unlike Perigon it can't be made
    point-in-time. Fine for a live decision; excluded from the point-in-time
    backtest path (see finbert_signal in signals.py).
    """
    try:
        items = yf.Ticker(ticker).news or []
    except Exception:
        items = []

    articles = []
    for item in items[:limit]:
        content = item.get("content", {})
        title = content.get("title")
        if not title:
            continue
        excerpt = content.get("summary") or content.get("description") or title
        url = (content.get("canonicalUrl") or {}).get("url")
        articles.append({"title": title, "excerpt": excerpt[:500], "url": url})

    return articles


def fetch_perigon_articles(ticker, api_key, as_of_date=None, days=3, page_size=25, timeout=20):
    """Fetch news article title+excerpt text for `ticker` from Perigon, for
    FinBERT to score directly.

    Unlike online_sentiment.fetch_perigon_news_sentiment, this ignores
    Perigon's own sentiment tag entirely -- the point of this model is to
    score the text ourselves. Pass `as_of_date` for a genuinely point-in-time
    query (Perigon supports real from/to date ranges).
    """
    anchor = as_of_date or date.today()
    params = {
        "apiKey": api_key,
        "q": f'"{ticker}"',
        "from": (anchor - timedelta(days=days)).isoformat(),
        "to": anchor.isoformat(),
        "sortBy": "relevance",
        "size": page_size,
        "language": "en",
    }
    response = requests.get(PERIGON_URL, params=params, timeout=timeout)
    response.raise_for_status()
    articles = response.json().get("articles", [])

    return [
        {
            "title": a.get("title"),
            "excerpt": (a.get("description") or a.get("summary") or a.get("title") or "")[:500],
            "url": a.get("url"),
        }
        for a in articles
        if a.get("title")
    ]


def fetch_finbert_sentiment(ticker, perigon_api_key, as_of_date=None, include_yahoo=True):
    """Combine Perigon news (point-in-time if as_of_date given) and, for live
    use only, Yahoo Finance headlines, scoring every article's text with
    FinBERT ourselves. No OpenAI, no Reddit.

    Pass include_yahoo=False for the point-in-time backtest path -- Yahoo's
    feed can't be date-filtered, so including it would leak today's
    headlines into what's supposed to be a historical score.
    """
    perigon_articles = fetch_perigon_articles(ticker, perigon_api_key, as_of_date=as_of_date)
    yahoo_articles = fetch_yahoo_news(ticker) if include_yahoo else []
    all_articles = perigon_articles + yahoo_articles

    texts = [
        f"{a['title']}. {a['excerpt']}" if a["excerpt"] and a["excerpt"] != a["title"] else a["title"]
        for a in all_articles
    ]
    scored = score_texts_finbert(texts)

    for article, s in zip(all_articles, scored):
        article["sentiment"] = {k: s[k] for k in ("positive", "negative", "neutral")}
        article["label"] = max(("positive", "negative", "neutral"), key=lambda k: s[k])

    score = sum(s["score"] for s in scored) / len(scored) if scored else 0.0

    return {
        "score": max(-1.0, min(1.0, score)),
        "as_of_date": (as_of_date or date.today()).isoformat(),
        "article_count": len(all_articles),
        "perigon_count": len(perigon_articles),
        "yahoo_count": len(yahoo_articles),
        "articles": all_articles[:8],
    }
