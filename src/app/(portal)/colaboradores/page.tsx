import type { Metadata } from "next";
import { CollaboratorsView } from "@/components/collaborators-view";
import { requirePageRole } from "@/server/http/current-user";

export const metadata: Metadata = { title: "Colaboradores — comprarCasa" };

export default async function CollaboratorsPage() {
  const user = await requirePageRole("GESTOR");
  return <CollaboratorsView currentUserId={user.id} />;
}
