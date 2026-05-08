import Link from "next/link";

export function Nav() {
  return (
    <div className="nav">
      <Link href="/" className="brand">
        <span className="logo">₿</span>
        <span>BTC Hourly Signal</span>
      </Link>

      <div className="navlinks">
        <Link href="/">Dashboard</Link>
        <Link href="/accuracy">Accuracy</Link>
        <Link href="/backtest">Backtest</Link>
        <a href="/api/dashboard" target="_blank">
          API
        </a>
      </div>
    </div>
  );
}