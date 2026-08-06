import argparse
import json
from datetime import date, timedelta

from yahoo_api import get_stock_data


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch OHLCV price history for a ticker as JSON.")
    parser.add_argument("ticker")
    parser.add_argument("--start", default=None)
    parser.add_argument("--end", default=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    end = args.end or date.today().isoformat()
    start = args.start or (date.today() - timedelta(days=90)).isoformat()
    df = get_stock_data(args.ticker, start, end)
    rows = [
        {"date": str(idx.date()), **{k: float(v) for k, v in row.items()}}
        for idx, row in df.iterrows()
    ]
    print(json.dumps(rows))
