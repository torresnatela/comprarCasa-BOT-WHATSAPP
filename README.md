# comprarCasa

Sistema para imobiliária: recebe leads pelo WhatsApp (Evolution API), qualifica
com IA, salva o lead e distribui em rodízio para os vendedores. A gestão usa um
portal para cadastrar a equipe.

**O que já existe:**

- Login, papéis de acesso e cadastro de colaboradores com link de convite.
- Integração com a Evolution API: as mensagens recebidas no WhatsApp viram
  leads, a conversa fica guardada e o gestor responde pelo portal.
- Qualificação por IA (Claude Sonnet) e rodízio de vendedores: a assistente
  conversa com o lead novo e o entrega ao próximo vendedor da fila. Veja
  [Qualificação e rodízio](#qualificação-e-rodízio).
- Funil simples por contato (mini-CRM): etapa, pausa da IA, tarefas e
  desfecho (ganho ou perdido). Veja [Funil](#funil-do-contato).

## Stack

- **Next.js 16** (App Router) — front em React e back em Node no mesmo projeto
- **PostgreSQL** com **Drizzle ORM**
- **Vitest** (unidade e integração, com Postgres em memória via PGlite),
  **Testing Library** (telas) e **Playwright** (ponta a ponta)
- Deploy na **Vercel**

## Rodando localmente

Pré-requisitos: Node 22+, pnpm e Docker (ou um PostgreSQL próprio).

```bash
pnpm install
cp .env.example .env.local   # ajuste a senha do primeiro gestor
docker compose up -d         # sobe o PostgreSQL
pnpm db:migrate              # cria as tabelas
pnpm db:seed                 # cria o primeiro gestor (SEED_ADMIN_*)
pnpm dev                     # http://localhost:3000
```

Entre com o e-mail e a senha definidos em `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm test` | Testes de unidade, integração e de telas (não precisa de banco) |
| `pnpm test:watch` | Os mesmos testes em modo watch, para o ciclo de TDD |
| `pnpm test:e2e` | Fluxo completo no navegador (precisa do PostgreSQL rodando) |
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript |
| `pnpm db:generate` | Gera uma migration a partir de mudanças em `schema.ts` |
| `pnpm db:migrate` | Aplica as migrations |
| `pnpm db:seed` | Cria o primeiro gestor (seguro rodar de novo) |

Os testes E2E usam um banco separado, `comprarcasa_e2e`, que é limpo a cada
execução. Crie-o uma vez:

```bash
docker compose exec postgres createdb -U comprarcasa comprarcasa_e2e
```

O E2E sobe o portal na porta 3100 e reaproveita um servidor que já esteja
nela. Se você tiver outro `next` rodando ali, use outra porta:
`E2E_PORT=3110 pnpm test:e2e`.

## Arquitetura (MVC)

```
src/
├─ app/                  VIEW e rotas
│  ├─ (public)/          login e aceite de convite
│  ├─ (portal)/          telas que exigem login
│  └─ api/               rotas HTTP — só repassam para o controller
├─ components/           componentes React das telas
├─ lib/                  cliente da API e formatação usados pelo front
├─ proxy.ts              manda para /login quem não tem cookie de sessão
└─ server/
   ├─ controllers/       CONTROLLER: Request → Response, validação e permissão
   ├─ services/          regras de negócio (auth, convites, colaboradores, conversas)
   ├─ models/            MODEL: acesso ao banco
   ├─ integrations/      clientes de serviços externos (Evolution API)
   ├─ db/                schema, migrations, conexão e seed
   ├─ http/              erros, cookies, guard de autorização
   ├─ validation/        schemas Zod
   └─ container.ts       monta a aplicação real (banco + services + controllers)
e2e/                     testes Playwright
tests/                   utilitários de teste (banco em memória, fábricas, mocks)
```

Convenções:

- **Rotas finas.** `route.ts` tem uma linha; a lógica fica em controller,
  service e model, testáveis sem subir o Next.
- **Banco injetado.** Models e services recebem o `db`, então os testes usam
  PGlite (com as migrations reais) e a produção usa `pg`.
- **Teste ao lado do código.** `x.ts` e `x.test.ts` na mesma pasta. Escreva o
  teste antes da implementação.

## Regras de acesso

| Papel | Pode |
|---|---|
| **Gestor** | Tudo: colaboradores, links de acesso, leads, conversas, fila do rodízio e configuração do WhatsApp |
| **Vendedor** | Entrar no portal e ver os próprios dados (depois: os próprios leads). Recebe os leads do rodízio pelo WhatsApp |

- O gestor cadastra o colaborador e recebe um **link de convite** (uso único,
  válido por 7 dias) para enviar. O colaborador abre o link e cria a senha.
- "Gerar link" de novo invalida o anterior. Para quem já tem conta, serve como
  redefinição de senha.
- Desativar um colaborador derruba as sessões dele na hora.
- Um gestor não desativa a si mesmo, e o portal sempre mantém ao menos um
  gestor ativo.
- Senhas são guardadas com scrypt; tokens de sessão e de convite, só como hash.
- A permissão é sempre conferida no servidor (`requireRole` nas rotas da API e
  `requirePageRole` nas páginas).

### API

| Rota | Acesso | Descrição |
|---|---|---|
| `POST /api/auth/login` | público | Login com e-mail e senha |
| `POST /api/auth/logout` | logado | Encerra a sessão |
| `GET /api/auth/me` | logado | Usuário atual |
| `GET /api/colaboradores` | gestor | Lista |
| `POST /api/colaboradores` | gestor | Cadastra e devolve o link de convite |
| `PATCH /api/colaboradores/:id` | gestor | Edita, desativa ou reativa |
| `POST /api/colaboradores/:id/convite` | gestor | Gera novo link |
| `GET /api/convites/:token` | público | Valida o convite |
| `POST /api/convites/:token` | público | Cria a senha e entra |
| `GET /api/leads` | gestor | Leads, do mais recente para o mais antigo |
| `GET /api/leads/:id` | gestor | Lead e a conversa |
| `POST /api/leads/:id/mensagens` | gestor | Responde pelo WhatsApp |
| `PATCH /api/leads/:id/etapa` | gestor | Muda a etapa (Ganho/Perdido com os dados do desfecho) |
| `PATCH /api/leads/:id/automacao` | gestor | Pausa ou retoma a IA (`{ paused }`) |
| `POST /api/leads/:id/tarefas` | gestor | Cria tarefa (`{ title, dueDate }`) |
| `PATCH /api/leads/:id/tarefas/:tarefaId` | gestor | Marca como feita ou não (`{ done }`) |
| `DELETE /api/leads/:id/tarefas/:tarefaId` | gestor | Exclui a tarefa |
| `GET /api/rodizio` | gestor | Vendedores ativos na ordem da fila |
| `PATCH /api/rodizio/:id` | gestor | Coloca ou tira o vendedor da fila (`{ inRotation }`) |
| `GET /api/whatsapp/status` | gestor | Estado da instância e do webhook |
| `POST /api/whatsapp/webhook` | gestor | Registra o webhook do portal na Evolution |
| `POST /api/webhooks/evolution` | segredo no cabeçalho | Recebe os eventos da Evolution API |
| `GET /api/health` | público | Verificação de saúde |

## WhatsApp (Evolution API)

O portal usa uma instância que já existe e está conectada numa Evolution API
v2 (testado com a 2.3.7). Ele não cria instâncias nem lê QR code.

| Variável | Valor |
|---|---|
| `EVOLUTION_API_URL` | Endereço do servidor da Evolution API |
| `EVOLUTION_INSTANCE` | Nome exato da instância (pode ter espaços) |
| `EVOLUTION_API_KEY` | **Token da instância** (veja abaixo) |
| `EVOLUTION_WEBHOOK_SECRET` | Segredo próprio, com 16 caracteres ou mais |

**Use o token da instância, não a chave global.** A chave global dá acesso a
todas as instâncias do servidor; o token só à instância do portal. Ele aparece
no painel da Evolution (Manager), nos dados da instância.

Gere o segredo do webhook com:

```bash
openssl rand -hex 32
```

Depois do deploy, entre como gestor, abra **WhatsApp** e clique em **Registrar
webhook**. O portal aponta a instância para `APP_URL/api/webhooks/evolution`
e passa a receber as mensagens. Se a instância já enviava mensagens para outro
sistema, a tela avisa e pede confirmação antes de substituir.

Como funciona:

- A primeira mensagem de um contato cria o lead; as seguintes entram na mesma
  conversa. A mesma mensagem entregue duas vezes não duplica.
- Mensagens de grupo, status e canais são ignoradas. Imagem, áudio, vídeo e
  documento aparecem como marcador (`[imagem]`, `[áudio]`…), sem baixar o
  arquivo.
- O que a imobiliária digita no próprio celular para um lead também entra na
  conversa. Conversas iniciadas pela imobiliária com um número desconhecido
  não viram lead.
- O webhook só aceita chamadas com o segredo e só processa eventos da
  instância configurada. O corpo enviado pela Evolution traz a chave da
  instância, por isso o payload nunca é gravado nem registrado em log.
- A resposta pelo portal só é gravada depois que a Evolution confirma o envio.

O webhook precisa de endereço público com HTTPS, então o recebimento real só
funciona no deploy (ou com um túnel na máquina de desenvolvimento). Os testes
usam uma Evolution falsa e não tocam no WhatsApp.

### Demonstração local (sem WhatsApp real)

`scripts/demo-whatsapp.ts` sobe uma Evolution falsa em `localhost:3199`,
entrega ao portal três conversas de exemplo e transforma cada linha digitada
no terminal numa mensagem recebida (`1 texto` para o contato 1, `novo Nome
texto` para um contato novo). As respostas enviadas pelo portal aparecem no
terminal. No `.env.local`, use:

```
APP_URL=http://localhost:3100
EVOLUTION_API_URL=http://localhost:3199
EVOLUTION_INSTANCE=Demo comprarCasa
EVOLUTION_API_KEY=token-demo-local
EVOLUTION_WEBHOOK_SECRET=<openssl rand -hex 32>
```

Depois, em dois terminais:

```bash
pnpm build && pnpm start --port 3100
pnpm tsx --env-file-if-exists=.env.local scripts/demo-whatsapp.ts
```

Rodar a demo de novo não duplica os exemplos. O botão "Registrar webhook"
recusa `localhost` de propósito; ele só funciona com a URL HTTPS do deploy.

## Qualificação e rodízio

Todo lead novo começa **com a assistente** (etapa `QUALIFICANDO`). A cada
mensagem dele, o Claude Sonnet 5.5 (`claude-sonnet-5-5`, cerca de US$ 0,04 por
lead; com `ANTHROPIC_MODEL=claude-haiku-5-5` sai uns 20x mais barato) responde com uma pergunta curta até entender
**objetivo e tipo de imóvel, região, faixa de valor/pagamento e prazo**.

Quando tem o suficiente (ou o lead pede uma pessoa), a assistente encerra:

1. O rodízio escolhe o vendedor ativo e **na fila** que recebeu lead há mais
   tempo (ou nunca recebeu) e o lead fica `DISTRIBUIDO` para ele.
2. O lead recebe: *"{primeiro nome do vendedor} vai entrar em contacto
   consigo e ajudar no que precisar."*
3. O vendedor recebe no WhatsApp o nome, o número, o resumo da qualificação e
   o link da conversa no portal.

Sem vendedor na fila, o lead fica `AGUARDANDO_VENDEDOR` e recebe uma mensagem
genérica. O gestor organiza a fila na tela **Rodízio**.

Regras:

- A assistente escreve sempre em **português de Portugal**.
- Como uma pessoa: marca as mensagens como lidas, mostra "a escrever…" enquanto
  pensa e antes de enviar (2 a 7 s, conforme o tamanho do texto).
- A IA responde depois do 200 do webhook (`after` do Next), esperando
  `QUALIFIER_DELAY_MS` (4 s) para juntar mensagens mandadas em sequência; só a
  mais recente é respondida.
- Se alguém responde pelo portal, o lead passa para `HUMANO` e a IA para. O
  gestor também pode pausar a IA na tela da conversa (veja
  [Funil](#funil-do-contato)).
- O lead nunca fica parado: erro ou recusa da IA, `ANTHROPIC_API_KEY` ausente
  ou 6 perguntas sem concluir levam o lead direto ao rodízio.
- Leads que já existiam antes desta fase ficaram como `HUMANO`.
- Limitação: uma resposta digitada direto no celular da imobiliária não tira o
  lead da assistente (só a resposta pelo portal).

Variáveis: `ANTHROPIC_API_KEY` (obrigatória para a conversa automática),
`ANTHROPIC_MODEL` e `QUALIFIER_DELAY_MS` (opcionais). Os testes usam uma IA
falsa e não chamam a API.

## Funil do contato

Um mini-CRM por contato: uma única etapa, a pausa da IA, tarefas e o
desfecho. A IA cuida só da primeira etapa; o resto é da equipe.

| Etapa | Quem conduz | Como chega lá |
|---|---|---|
| **Com a assistente** (`QUALIFICANDO`) | IA, se não estiver pausada | Lead novo, ou o gestor volta o contato |
| **Aguardando vendedor** | Gestor | Fim da qualificação sem vendedor na fila |
| **Com vendedor** (`DISTRIBUIDO`) | Vendedor | Fim da qualificação, pelo rodízio |
| **Com a equipe** (`HUMANO`) | Equipe | Resposta pelo portal, ou o gestor escolhe |
| **Parado** | Equipe — contato esfriou | O gestor escolhe |
| **Ganho** | Fechado: compra ou aluguel, valor e condições | O gestor escolhe |
| **Perdido** | Fechado: motivo (preço, comprou com outro, desistiu, sem resposta, sem crédito, outro) e observação | O gestor escolhe |

Regras:

- A IA só responde quando o contato está com a assistente **e** ela não foi
  pausada (`isAutomationActive` em `src/lib/funnel.ts`; `receive()` devolve
  `automationActive`, que o webhook usa para chamar a qualificação).
- **Pausar IA / Retomar IA** só existe com o contato na assistente. Toda
  mudança manual de etapa pausa a IA; voltar para a assistente não a religa
  sozinho — é preciso clicar em **Retomar IA**.
- Aguardando vendedor e Com vendedor dependem do rodízio: não aparecem no
  seletor de etapa (a não ser como a etapa atual). Mudar a etapa mantém o
  vendedor que recebeu o lead.
- Ganho exige tipo e valor; Perdido exige motivo (e observação, se o motivo
  for "Outro"). Reabrir um contato fechado apaga esses dados.
- Mensagem nova nunca muda a etapa: um contato Ganho, Perdido ou Parado que
  volta a escrever continua onde está até alguém mudar.
- Tarefas têm título e data. A lista de leads avisa quando há tarefa vencida
  ou para hoje, e tem abas por etapa.
## Deploy na Vercel

1. Importe o repositório na Vercel (preset Next.js).
2. Em **Storage**, adicione um Postgres (Neon) — ele cria `DATABASE_URL`.
3. Em **Settings → Environment Variables**, defina `APP_URL` com a URL pública
   do portal (usada no link de convite e no endereço do webhook), as quatro
   variáveis `EVOLUTION_*` descritas em [WhatsApp](#whatsapp-evolution-api) e
   `ANTHROPIC_API_KEY` ([Qualificação e rodízio](#qualificação-e-rodízio)).
4. Em **Settings → Build & Deployment**, use como Build Command
   `pnpm db:migrate && pnpm build`, para aplicar as migrations a cada deploy.
5. Crie o primeiro gestor uma única vez, da sua máquina, apontando para o banco
   de produção:

   ```bash
   DATABASE_URL="<url de produção>" SEED_ADMIN_NAME="Seu Nome" SEED_ADMIN_EMAIL="voce@imobiliaria.com" SEED_ADMIN_PASSWORD="<senha forte>" pnpm db:seed
   ```

Segredos (como `EVOLUTION_API_KEY`) ficam só nas variáveis de ambiente da
Vercel e no `.env.local`, nunca no repositório.

## Próximas fases

1. **Portal do vendedor** — vendedor vê e responde os próprios leads.
2. **Atribuição manual** — gestor entrega leads em `AGUARDANDO_VENDEDOR`.
3. **Mídia** — baixar e exibir imagens, áudios e documentos.

Pendências conhecidas:

- "Esqueci minha senha" pelo próprio usuário (hoje o gestor gera um novo link)
  e limite de tentativas de login.
- O cadastro de colaborador assume telefone brasileiro (acrescenta o DDI 55 a
  números de 10 ou 11 dígitos). Para outros países, informe o número já com o
  DDI.
- A conversa se atualiza sozinha a cada poucos segundos, não em tempo real.
