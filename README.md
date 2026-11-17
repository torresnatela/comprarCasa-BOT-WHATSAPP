# comprarCasa

Sistema para imobiliária: recebe leads pelo WhatsApp (Evolution API), qualifica
com IA, salva o lead e distribui em rodízio para os vendedores. A gestão usa um
portal para cadastrar a equipe.

**O que já existe (base):** login, papéis de acesso, cadastro de colaboradores
com link de convite e toda a estrutura de testes. WhatsApp, IA e rodízio são as
[próximas fases](#próximas-fases).

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
   ├─ services/          regras de negócio (auth, convites, colaboradores)
   ├─ models/            MODEL: acesso ao banco
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
| **Gestor** | Tudo: cadastrar, editar, desativar colaboradores e gerar links de acesso |
| **Vendedor** | Entrar no portal e ver os próprios dados (depois: os próprios leads) |

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
| `GET /api/health` | público | Verificação de saúde |

## Deploy na Vercel

1. Importe o repositório na Vercel (preset Next.js).
2. Em **Storage**, adicione um Postgres (Neon) — ele cria `DATABASE_URL`.
3. Em **Settings → Environment Variables**, defina `APP_URL` com a URL pública
   do portal (usada no link de convite).
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

1. **Webhook da Evolution API** — receber mensagens em
   `POST /api/webhooks/evolution`; tabelas de leads, conversas e mensagens.
2. **Qualificação por IA** — conduzir a conversa e extrair os dados do lead.
3. **Rodízio** — distribuir os leads entre vendedores ativos e avisá-los pelo
   WhatsApp.
4. **Portal** — lista de leads, histórico da conversa e configuração do rodízio.

Pendências conhecidas da base: "esqueci minha senha" pelo próprio usuário
(hoje o gestor gera um novo link) e limite de tentativas de login.
