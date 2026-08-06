from datetime import date, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.ensemble import RandomForestClassifier

from online_sentiment import fetch_combined_sentiment
from yahoo_api import get_stock_data

FUNDAMENTAL_FIELDS = [
    "trailingPE", "forwardPE", "priceToBook", "beta", "dividendYield",
    "marketCap", "profitMargins", "returnOnEquity", "debtToEquity", "recommendationMean",
]


def compute_technical_features(df):
    """Engineer technical indicators from the OHLCV history yahoo_api.get_stock_data returns."""
    feats = pd.DataFrame(index=df.index)
    returns = df["close"].pct_change()

    feats["return_1d"] = returns
    for window in (5, 10, 20):
        feats[f"sma_{window}"] = df["close"].rolling(window).mean() / df["close"] - 1
        feats[f"volatility_{window}"] = returns.rolling(window).std()
        feats[f"momentum_{window}"] = df["close"] / df["close"].shift(window) - 1

    feats["volume_ratio_20"] = df["volume"] / df["volume"].rolling(20).mean()
    feats["high_low_range"] = (df["high"] - df["low"]) / df["close"]

    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    feats["rsi_14"] = 100 - (100 / (1 + rs))

    return feats


def fetch_fundamental_snapshot(ticker):
    """Current-snapshot fundamentals from yfinance's Ticker.info.

    Unlike the OHLCV history, these aren't point-in-time historical data --
    yfinance only exposes today's values -- so, like the live sentiment
    score, they're broadcast as constants across every training row rather
    than varying day to day.
    """
    info = yf.Ticker(ticker).info
    return {field: info[field] for field in FUNDAMENTAL_FIELDS if info.get(field) is not None}


def build_features(ticker, start_date, end_date, sentiment_score, fundamentals):
    df = get_stock_data(ticker, start_date, end_date)
    features = compute_technical_features(df)
    features["sentiment"] = sentiment_score
    for field, value in fundamentals.items():
        features[field] = value

    features = features.dropna()
    next_day_return = df["close"].pct_change().shift(-1).reindex(features.index)
    return features, next_day_return


def train_and_predict(ticker, openai_api_key, perigon_api_key, start_date=None, end_date=None,
                       as_of_sentiment=True, openai_model="gpt-5-mini", n_estimators=300, random_state=0):
    """Train a RandomForestClassifier on Yahoo Finance technical + fundamental
    features plus the sentiment score to predict next-day direction, and
    return the prediction for `end_date` as a signal in [-1.0, 1.0].

    When `as_of_sentiment` is True (default), the sentiment score is fetched
    as of `end_date` rather than live/today -- point-in-time for the news leg
    (Perigon), best-effort for the Reddit leg (see fetch_reddit_sentiment).
    Fundamentals remain a live/current snapshot regardless -- yfinance has no
    historical point-in-time fundamentals endpoint, so that piece can't be
    made point-in-time with this data source. They're broadcast as constants
    across the whole training history either way, which is also why a tree
    ensemble assigns them ~zero feature importance: a column with no variance
    has nothing to split on.
    """
    end_date = end_date or date.today().isoformat()
    start_date = start_date or (date.today() - timedelta(days=730)).isoformat()
    sentiment_as_of = date.fromisoformat(end_date) if as_of_sentiment else None

    sentiment = fetch_combined_sentiment(
        ticker, openai_api_key, perigon_api_key, as_of_date=sentiment_as_of, openai_model=openai_model,
    )
    fundamentals = fetch_fundamental_snapshot(ticker)

    features, next_day_return = build_features(ticker, start_date, end_date, sentiment["score"], fundamentals)
    if len(features) < 30:
        raise ValueError(f"Not enough historical data to train ({len(features)} rows after feature engineering).")

    # The most recent row has no next-day return yet -- hold it out as the
    # row to predict, train only on rows where the label is known.
    latest_row = features.iloc[[-1]]
    train_features = features.iloc[:-1]
    train_labels = (next_day_return.iloc[:-1] > 0).astype(int)

    model = RandomForestClassifier(n_estimators=n_estimators, random_state=random_state)
    model.fit(train_features, train_labels)

    up_index = list(model.classes_).index(1)
    up_probability = float(model.predict_proba(latest_row)[0, up_index])
    signal = max(-1.0, min(1.0, (up_probability - 0.5) * 2))

    importances = dict(
        sorted(zip(train_features.columns, model.feature_importances_), key=lambda kv: kv[1], reverse=True)
    )

    return {
        "score": signal,
        "up_probability": up_probability,
        "sentiment": sentiment,
        "fundamentals": fundamentals,
        "feature_importances": importances,
        "training_rows": len(train_features),
    }
