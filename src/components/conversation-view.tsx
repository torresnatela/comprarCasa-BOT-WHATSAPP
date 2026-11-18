"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatPhone, leadTitle } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { PublicLead, PublicMessage } from "@/server/controllers/presenters";
import { Alert, Button } from "./ui";

const REFRESH_MS = 5_000;

type Conversation = { lead: PublicLead; messages: PublicMessage[] };

export function ConversationView({ leadId }: { leadId: string }) {
  const path = `/api/leads/${encodeURIComponent(leadId)}`;
  const replyId = useId();
  const endRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await api<Conversation>(path);
      loaded.current = true;
      setConversation(result);
      setLoadError(null);
    } catch (error) {
      // Numa atualização em segundo plano, mantém a conversa que já está na tela.
      if (!loaded.current) setLoadError(errorMessage(error));
    }
  }, [path]);

  useEffect(() => {
    // Carga inicial: o estado só muda depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  usePolling(load, REFRESH_MS);

  const messageCount = conversation?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messageCount]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      const { message } = await api<{ message: PublicMessage }>(`${path}/mensagens`, {
        method: "POST",
        body: { text },
      });
      setConversation(
        (current) =>
          current && {
            ...current,
            messages: current.messages.some((item) => item.id === message.id)
              ? current.messages
              : [...current.messages, message],
          },
      );
      setText("");
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const backLink = (
    <Link href="/leads" className="text-sm font-medium text-brand-700 hover:underline">
      ← Leads
    </Link>
  );

  if (loadError) {
    return (
      <section className="space-y-4">
        {backLink}
        <Alert>{loadError}</Alert>
      </section>
    );
  }
  if (!conversation) {
    return <p className="text-sm text-gray-600">Carregando conversa…</p>;
  }

  const { lead, messages } = conversation;

  return (
    <section className="space-y-4">
      {backLink}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{leadTitle(lead)}</h1>
        {lead.name && lead.phone && (
          <p className="text-sm text-gray-600">{formatPhone(lead.phone)}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <ol
          role="log"
          aria-label="Conversa"
          className="flex max-h-[55vh] min-h-48 flex-col gap-2 overflow-y-auto p-4"
        >
          {messages.map((message) => {
            const outgoing = message.direction === "ENVIADA";
            return (
              <li
                key={message.id}
                aria-label={outgoing ? "Mensagem enviada" : "Mensagem recebida"}
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  outgoing
                    ? "self-end bg-brand-100 text-gray-900"
                    : "self-start bg-gray-100 text-gray-900"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                <p className="mt-1 text-right text-[11px] text-gray-500">
                  {formatDateTime(message.sentAt)}
                </p>
              </li>
            );
          })}
          <div ref={endRef} />
        </ol>

        <form onSubmit={onSubmit} className="space-y-3 border-t border-gray-200 p-4">
          {sendError && <Alert>{sendError}</Alert>}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor={replyId} className="sr-only">
                Resposta
              </label>
              <textarea
                id={replyId}
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Escreva uma resposta…"
                className="block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <Button type="submit" disabled={sending || !text.trim()}>
              {sending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
