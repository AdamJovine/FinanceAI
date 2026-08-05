const express = require('express');
const router = express.Router();

const KNOWN_TICKERS = ['GME', 'AMC', 'BB', 'BBBY', 'NOK', 'PLTR', 'TSLA', 'KOSS', 'EXPR', 'CLOV'];

const POST_TEMPLATES = [
  { platform: 'reddit', sentiment: 'positive', text: '$TICKER is about to run, diamond hands 💎🙌' },
  { platform: 'reddit', sentiment: 'negative', text: 'Not sure why anyone is still holding $TICKER, feels overhyped.' },
  { platform: 'reddit', sentiment: 'neutral', text: 'Watching $TICKER closely this week, no position yet.' },
  { platform: 'twitter', sentiment: 'positive', text: '$TICKER breaking out on huge volume, this could be the move 🚀' },
  { platform: 'twitter', sentiment: 'negative', text: '$TICKER dumping hard, glad I got out yesterday.' },
  { platform: 'twitter', sentiment: 'neutral', text: '$TICKER trading sideways, waiting for a catalyst.' },
];

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function labelFromScore(score) {
  if (score >= 0.15) return 'bullish';
  if (score <= -0.15) return 'bearish';
  return 'neutral';
}

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function generateSentimentHistory(rand, days) {
  let value = rand() * 2 - 1;
  const history = [];
  for (let i = 0; i < days; i++) {
    value = clamp(value + (rand() - 0.5) * 0.3, -1, 1);
    history.push(Number(value.toFixed(2)));
  }
  return history;
}

function generateMentionVolumeHistory(rand, days) {
  let value = rand() * 400 + 150;
  const history = [];
  for (let i = 0; i < days; i++) {
    value = Math.max(20, value + (rand() - 0.5) * 300);
    history.push(Math.round(value));
  }
  return history;
}

function generatePlatformBreakdown(score, rand) {
  const platforms = ['reddit', 'twitter', 'stocktwits'];
  return Object.fromEntries(
    platforms.map((platform) => [platform, Number(clamp(score + (rand() - 0.5) * 0.6, -1, 1).toFixed(2))])
  );
}

function computeBreakdown(score, rand) {
  const posWeight = Math.max(0.05, 0.5 + score * 0.4 + (rand() - 0.5) * 0.1);
  const negWeight = Math.max(0.05, 0.5 - score * 0.4 + (rand() - 0.5) * 0.1);
  const neuWeight = Math.max(0.05, 0.3 + (rand() - 0.5) * 0.2);
  const total = posWeight + negWeight + neuWeight;
  const positive = Math.round((posWeight / total) * 100);
  const negative = Math.round((negWeight / total) * 100);
  const neutral = 100 - positive - negative;
  return { positive, neutral, negative };
}

function pickSamplePosts(ticker, rand) {
  const shuffled = [...POST_TEMPLATES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4).map((post) => ({
    ...post,
    text: post.text.replace('$TICKER', ticker),
  }));
}

router.get('/:ticker', (req, res) => {
  const ticker = (req.params.ticker || '').trim().toUpperCase();

  if (!ticker) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }

  const rand = mulberry32(hashString(ticker));
  const sentiment_history = generateSentimentHistory(rand, 14);
  const mention_volume_history = generateMentionVolumeHistory(rand, 14);
  const score = sentiment_history[sentiment_history.length - 1];
  const mentions = mention_volume_history.reduce((sum, n) => sum + n, 0);
  const breakdown = computeBreakdown(score, rand);
  const platform_breakdown = generatePlatformBreakdown(score, rand);
  const sample_posts = pickSamplePosts(ticker, rand);

  const response = {
    ticker,
    overall_sentiment: labelFromScore(score),
    score,
    mentions,
    breakdown,
    sample_posts,
    sentiment_history,
    mention_volume_history,
    confidence: mentions,
    platform_breakdown,
  };

  if (!KNOWN_TICKERS.includes(ticker)) {
    response.note = 'No live data found for this ticker — showing simulated sentiment for demo purposes.';
  }

  res.json(response);
});

module.exports = router;
