import type { Metadata } from "next";
import { LeadsView } from "@/components/leads-view";
import { requirePageRole } from "@/server/http/current-user";

export const metadata: Metadata = { title: "Leads — comprarCasa" };

export default async function LeadsPage() {
  await requirePageRole("GESTOR");
  return <LeadsView />;
}
