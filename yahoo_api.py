import pandas as pd
import yfinance as yf


def get_stock_data(ticker, start_date, end_date):
    """Fetch daily OHLCV history for `ticker` as a DataFrame indexed by Date.

    Columns are normalized to the lowercase names backtrader's PandasData
    feed expects: open, high, low, close, volume.
    """
    df = yf.download(
        ticker,
        start=start_date,
        end=end_date,
        auto_adjust=True,
        progress=False,
    )

    if df is None or df.empty:
        raise ValueError(f"No data returned for ticker '{ticker}' between {start_date} and {end_date}")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df.columns = [c.lower() for c in df.columns]
    df.index.name = "date"
    return df[["open", "high", "low", "close", "volume"]]
