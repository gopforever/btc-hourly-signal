import { Nav } from "@/components/Nav";
import { V3ShadowClient } from "@/components/V3ShadowClient";

export default function V3ShadowPage() {
  return (
    <main className="shell">
      <Nav />
      <V3ShadowClient />
    </main>
  );
}