# Gol da Sorte

App de apostas/loteria esportiva onde jogadores compram jogadas, escolhem posições de bola em campos e concorrem a prêmios com ranking por Brasil, estado e cidade.

## Run & Operate

- **Iniciar tudo**: workflow `Project` (roda em paralelo `Start application` + `artifacts/api-server: API Server`) — frontend na porta 5000, API na porta 8081. `Start application` sozinho só sobe o frontend.
- Os workflows `artifacts/gol-da-sorte: web` e `artifacts/mockup-sandbox: Component Preview Server` são gerados automaticamente pelos artifacts e não são usados no dia a dia — ignore-os.
- `pnpm install` — instalar dependências (necessário após clonar/importar)
- `pnpm run typecheck` — checar tipos em todos os pacotes
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks e schemas Zod a partir da spec OpenAPI
- `pnpm --filter @workspace/db run push` — aplicar mudanças no schema do DB (só dev)
- Required env (secrets):
- `EXTERNAL_DATABASE_URL` — string de conexão Postgres externo (ex: Neon). Fallback para `DATABASE_URL` se não configurado.
- `MP_ACCESS_TOKEN` — Access Token do Mercado Pago (pagamentos falham sem ele).
- `ADMIN_PASSWORD` — senha do painel admin (não usar fallback padrão em produção).

Optional env:
- `APP_URL` — URL pública do app para webhooks do Mercado Pago (definido em `.replit` como `https://gol-da-sorte--maxlaeno.replit.app`).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
