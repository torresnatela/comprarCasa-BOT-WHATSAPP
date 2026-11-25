import type { Metadata } from "next";
import { ConversationView } from "@/components/conversation-view";
import { requirePageLeadAccess } from "@/server/http/current-user";

export const metadata: Metadata = { title: "Conversa — comprarCasa" };

export default async function ConversationPage({
  params,
}: PageProps<"/leads/[id]">) {
  await requirePageLeadAccess();
  const { id } = await params;
  return <ConversationView leadId={id} />;
}
