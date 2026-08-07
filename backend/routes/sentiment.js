const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

const PYTHON = process.platform === 'win32' ? 'py' : 'python3';
const INVEST_SCRIPT = path.join(__dirname, '..', 'backtesting', 'invest.py');

function runRealSentiment(ticker) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [INVEST_SCRIPT, ticker, '--json']);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `invest.py exited with code ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Could not parse model output: ${err.message}`));
      }
    });
    proc.on('error', (err) => reject(new Error(`Could not run Python: ${err.message}`)));
  });
}

function buildSamplePosts(real) {
  const posts = [];
  for (const article of real?.news?.articles || []) {
    if (!article.excerpt) continue;
    posts.push({
      platform: 'news',
      sentiment: article.label || 'neutral',
      text: article.excerpt,
      url: article.url,
    });
  }
  for (const post of real?.reddit?.posts || []) {
    posts.push({
      platform: 'reddit',
      sentiment: post.sentiment || 'neutral',
      text: post.text,
      url: post.url,
    });
  }
  return posts;
}

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

router.get('/:ticker', async (req, res) => {
  const ticker = (req.params.ticker || '').trim().toUpperCase();

  if (!ticker) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }

  const rand = mulberry32(hashString(ticker));
  const sentiment_history = generateSentimentHistory(rand, 14);
  const mention_volume_history = generateMentionVolumeHistory(rand, 14);
  const simulatedBaseline = sentiment_history[sentiment_history.length - 1];

  let score = simulatedBaseline;
  let scoreSource = 'fallback_mock';
  let mentions = mention_volume_history.reduce((sum, n) => sum + n, 0);
  let mentionsSource = 'simulated';
  let breakdown = computeBreakdown(simulatedBaseline, rand);
  let breakdownSource = 'simulated';
  let platform_breakdown = {};
  let platform_breakdown_source = {};
  let sample_posts = [];
  let sample_posts_source = 'unavailable';
  let error;

  try {
    const real = await runRealSentiment(ticker);
    score = Number(real.score.toFixed(2));
    platform_breakdown = { reddit: Number(real.reddit.score.toFixed(2)) };
    platform_breakdown_source = { reddit: 'real' };
    sample_posts = buildSamplePosts(real);
    sample_posts_source = 'real';
    scoreSource = 'real';

    mentions = (real.news?.article_count || 0) + (real.reddit?.mention_count || 0);
    mentionsSource = 'real';

    const positive = Math.round(real.breakdown.positive * 100);
    const negative = Math.round(real.breakdown.negative * 100);
    breakdown = { positive, neutral: 100 - positive - negative, negative };
    breakdownSource = 'real';
  } catch (err) {
    error = err.message;
  }

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
    source: {
      score: scoreSource,
      platform_breakdown: platform_breakdown_source,
      breakdown: breakdownSource,
      sentiment_history: 'simulated',
      mention_volume_history: 'simulated',
      confidence: mentionsSource,
      sample_posts: sample_posts_source,
    },
  };

  if (error) {
    response.note = `Live sentiment lookup failed (${error}) — score falling back to simulated; no real posts available this time.`;
  }

  res.json(response);
});

module.exports = router;
