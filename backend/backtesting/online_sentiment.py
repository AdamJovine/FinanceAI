import json
import re
from datetime import date, timedelta

import requests
from openai import OpenAI

PERIGON_URL = "https://api.goperigon.com/v1/all"

REDDIT_SYSTEM_PROMPT = (
    "You are a financial sentiment analyst. Use web search to find recent Reddit "
    "discussion (r/wallstreetbets, r/stocks, r/investing, r/StockMarket, and similar "
    "subreddits) about the given stock ticker. Weigh recent, high-engagement posts and "
    "comments more heavily than old or low-engagement ones. "
    "After searching, respond with ONLY a JSON object as your final line, with nothing after "
    'it: {"sentiment": <float -1.0 to 1.0>, "mention_count": <int>, "summary": <string>, '
    '"posts": [{"text": <a short real quote or close paraphrase from an actual post/comment '
    'you found, 1-2 sentences>, "url": <the reddit.com permalink you found it at>, "sentiment": '
    '"positive"|"negative"|"neutral"}, ...]}. '
    "-1.0 is maximally bearish, 0.0 is neutral or no clear signal found, 1.0 is maximally bullish. "
    'Include up to 4 entries in "posts" -- every one MUST be grounded in a real search result with '
    "a real URL; never invent a post or a URL. If you found fewer than 4 usable posts, include only "
    "the real ones -- an empty list is correct if none were found."
)

REDDIT_AS_OF_INSTRUCTIONS = (
    "\n\nIMPORTANT -- point-in-time constraint: you are scoring sentiment AS OF {as_of_date}, "
    "not today. Only use posts and comments with a visible publish/comment date on or before "
    "{as_of_date}. If a search result's date is missing or unclear, discard it rather than "
    "guessing. Discard anything dated after {as_of_date} even if it looks highly relevant -- "
    "it did not exist yet as of the date you are scoring. If you cannot find any posts you can "
    "confidently date on or before {as_of_date}, say so in the summary and return "
    '{{"sentiment": 0.0, "mention_count": 0, "summary": "no dateable pre-cutoff posts found"}}.'
)


def _label_from_perigon_sentiment(sentiment):
    if not sentiment:
        return "neutral"
    scored = {
        "positive": sentiment.get("positive") or 0,
        "negative": sentiment.get("negative") or 0,
        "neutral": sentiment.get("neutral") or 0,
    }
    return max(scored, key=scored.get)


def fetch_perigon_news_sentiment(ticker, api_key, as_of_date=None, days=3, page_size=25, timeout=20):
    """Average Perigon's per-article sentiment for news mentioning `ticker`.

    Perigon tags each article with a {positive, negative, neutral} sentiment
    breakdown; this collapses that into a single [-1.0, 1.0] score.

    By default this scores the most recent news (as of right now). Pass
    `as_of_date` (a date/datetime.date) to instead score only news published in
    the `days`-day window ending on that date -- Perigon's archive supports
    real date-range queries, so this is genuinely point-in-time, not a live
    snapshot relabeled.
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

    scored = []
    for article in articles:
        sentiment = article.get("sentiment") or {}
        pos, neg = sentiment.get("positive"), sentiment.get("negative")
        if pos is None or neg is None:
            continue
        scored.append(pos - neg)

    score = sum(scored) / len(scored) if scored else 0.0
    return {
        "score": max(-1.0, min(1.0, score)),
        "article_count": len(articles),
        "scored_count": len(scored),
        "as_of_date": anchor.isoformat(),
        "articles": [
            {
                "title": a.get("title"),
                "url": a.get("url"),
                "excerpt": (a.get("description") or a.get("summary") or a.get("title") or "")[:280],
                "sentiment": a.get("sentiment"),
                "label": _label_from_perigon_sentiment(a.get("sentiment")),
            }
            for a in articles[:5]
        ],
    }


def fetch_reddit_sentiment(ticker, api_key, as_of_date=None, model="gpt-5-mini", timeout=None):
    """Search Reddit for `ticker` sentiment via OpenAI's web_search tool.

    `web_search` always queries the *live* web index -- there is no hard,
    enforced date cutoff it can apply server-side. When `as_of_date` is given,
    this is a best-effort mitigation, not a guarantee: the prompt instructs
    the model to read each result's actual date and discard anything after
    the cutoff. It relies on the model correctly reading dates rather than a
    structural filter, and coverage for a narrow historical window is
    typically much sparser than a live "what's happening right now" search.
    """
    # Date-filtered search asks the model to verify each result's date before using
    # it, which takes longer than a plain "what's happening now" search -- give it
    # more room before timing out than the live-sentiment default.
    timeout = timeout or (120 if as_of_date else 60)
    client = OpenAI(api_key=api_key, timeout=timeout)
    system_prompt = REDDIT_SYSTEM_PROMPT
    if as_of_date:
        system_prompt += REDDIT_AS_OF_INSTRUCTIONS.format(as_of_date=as_of_date.isoformat())
        user_content = (
            f"Search Reddit (site:reddit.com) for discussion and sentiment about ${ticker} stock "
            f"as it stood on {as_of_date.isoformat()}. Only use posts/comments dated on or before "
            f"that date."
        )
    else:
        user_content = (
            f"Search Reddit (site:reddit.com) for the most recent discussion and "
            f"sentiment about ${ticker} stock. Focus on posts and comments from the "
            f"last few days."
        )

    response = client.responses.create(
        model=model,
        tools=[{"type": "web_search"}],
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    return _parse_reddit_response(response.output_text)


VALID_POST_SENTIMENTS = {"positive", "negative", "neutral"}


def _parse_reddit_posts(raw_posts):
    posts = []
    for post in raw_posts if isinstance(raw_posts, list) else []:
        if not isinstance(post, dict):
            continue
        text, url = post.get("text"), post.get("url")
        if not text or not url:
            continue
        sentiment = post.get("sentiment")
        if sentiment not in VALID_POST_SENTIMENTS:
            sentiment = "neutral"
        posts.append({"text": str(text), "url": str(url), "sentiment": sentiment})
    return posts


def _parse_reddit_response(text):
    try:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        payload = json.loads(match.group()) if match else {}
    except (json.JSONDecodeError, AttributeError):
        payload = {}

    try:
        sentiment = max(-1.0, min(1.0, float(payload.get("sentiment", 0.0))))
    except (TypeError, ValueError):
        sentiment = 0.0

    return {
        "score": sentiment,
        "mention_count": payload.get("mention_count", 0),
        "summary": payload.get("summary", ""),
        "posts": _parse_reddit_posts(payload.get("posts")),
    }


def fetch_combined_sentiment(ticker, openai_api_key, perigon_api_key, as_of_date=None,
                              openai_model="gpt-5-mini", news_weight=0.4, reddit_weight=0.6):
    """News tends to move price on fundamentals/events; Reddit leads retail-driven
    momentum. Weighting Reddit higher favors the meme-stock use case this app targets.

    Pass `as_of_date` to score point-in-time sentiment instead of live/current
    sentiment. The news leg (Perigon) is genuinely point-in-time; the Reddit
    leg (OpenAI web_search) is best-effort only -- see fetch_reddit_sentiment.
    """
    news = fetch_perigon_news_sentiment(ticker, perigon_api_key, as_of_date=as_of_date)
    reddit = fetch_reddit_sentiment(ticker, openai_api_key, as_of_date=as_of_date, model=openai_model)
    combined = news_weight * news["score"] + reddit_weight * reddit["score"]
    return {
        "score": max(-1.0, min(1.0, combined)),
        "as_of_date": (as_of_date or date.today()).isoformat(),
        "news": news,
        "reddit": reddit,
    }
