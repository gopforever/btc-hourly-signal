import { Nav } from "@/components/Nav";
import { BacktestClient } from "@/components/BacktestClient";

export default function BacktestPage() {
  return (
    <main className="shell">
      <Nav />
      <BacktestClient />
    </main>
  );
}