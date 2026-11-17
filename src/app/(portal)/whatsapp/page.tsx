import type { Metadata } from "next";
import { WhatsappSettings } from "@/components/whatsapp-settings";
import { requirePageRole } from "@/server/http/current-user";

export const metadata: Metadata = { title: "WhatsApp — comprarCasa" };

export default async function WhatsappPage() {
  await requirePageRole("GESTOR");
  return <WhatsappSettings />;
}
