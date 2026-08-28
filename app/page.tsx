import { DecisionApp } from "@/components/decision-app";
import { getLiveSnapshot } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const live = await getLiveSnapshot();
  return <DecisionApp initialLive={live} />;
}
