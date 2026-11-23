import type { Metadata } from "next";
import { RotationView } from "@/components/rotation-view";
import { requirePageRole } from "@/server/http/current-user";

export const metadata: Metadata = { title: "Rodízio — comprarCasa" };

export default async function RotationPage() {
  await requirePageRole("GESTOR");
  return <RotationView />;
}
