import argparse
from datetime import date, timedelta

import backtrader as bt

from signals import neutral_signal
from strategy import SentimentStrategy
from yahoo_api import get_stock_data


def run_backtest(ticker="AAPL", start_date=None, end_date=None, cash=100000.0, commission=0.001, signal_fn=None):
    end_date = end_date or date.today().isoformat()
    start_date = start_date or (date.today() - timedelta(days=365)).isoformat()

    cerebro = bt.Cerebro()

    df = get_stock_data(ticker, start_date, end_date)
    data = bt.feeds.PandasData(dataname=df, name=ticker)
    cerebro.adddata(data)

    cerebro.addstrategy(SentimentStrategy, signal_fn=signal_fn or neutral_signal)

    cerebro.broker.setcash(cash)
    cerebro.broker.setcommission(commission=commission)

    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe")
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
    cerebro.addanalyzer(bt.analyzers.Returns, _name="returns")
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")

    start_value = cerebro.broker.getvalue()
    results = cerebro.run()
    end_value = cerebro.broker.getvalue()
    strat = results[0]

    print(f"Ticker:        {ticker}")
    print(f"Period:        {start_date} -> {end_date}")
    print(f"Start value:   {start_value:.2f}")
    print(f"End value:     {end_value:.2f}")
    print(f"Return:        {(end_value / start_value - 1) * 100:.2f}%")
    print(f"Sharpe ratio:  {strat.analyzers.sharpe.get_analysis().get('sharperatio')}")
    print(f"Max drawdown:  {strat.analyzers.drawdown.get_analysis().max.drawdown:.2f}%")

    return cerebro, results


def parse_args():
    parser = argparse.ArgumentParser(description="Run a backtrader backtest against Yahoo Finance data.")
    parser.add_argument("--ticker", default="AAPL")
    parser.add_argument("--start", default=None)
    parser.add_argument("--end", default=None)
    parser.add_argument("--cash", type=float, default=100000.0)
    parser.add_argument("--commission", type=float, default=0.001)
    parser.add_argument("--plot", action="store_true", help="Render the backtrader chart after running.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    cerebro, _ = run_backtest(args.ticker, args.start, args.end, args.cash, args.commission)
    if args.plot:
        cerebro.plot()
