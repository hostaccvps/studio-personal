# Studio Personal — Agendas dos professores

Sistema web para substituir as planilhas Excel de agenda semanal dos personal trainers.

- **Professor**: cria a própria conta (nome, e-mail, senha), espera a aprovação do admin e, depois de aprovado, vê e edita **só a própria** agenda (livre / ocupado / indisponível).
- **Admin**: aprova ou recusa cadastros novos, vê todas as agendas, tem o painel consolidado (mapa de calor de professores livres, totais), gerencia professores e configura dias e horários da grade.
- **Banco e login**: Supabase (Postgres + Auth + RLS). **Front-end**: React + Vite, publicado no Cloudflare Pages.

```
.
├── supabase/
│   ├── migrations/
│   │   ├── 0001_initial.sql              ← banco base: tabelas, triggers, RLS, configuração inicial
│   │   └── 0002_aprovacao_professores.sql ← autocadastro de professores com aprovação do admin
│   └── tests/                        ← testes do banco/RLS (opcional, rodam local)
├── web/                              ← app React + Vite (vai para o Cloudflare Pages)
├── scripts/import-csv/               ← importador das planilhas (roda no SEU computador)
└── README.md
```

---

## O que VOCÊ precisa fazer (passo a passo)

Você vai precisar de: uma conta no [Supabase](https://supabase.com), uma no [Cloudflare](https://dash.cloudflare.com), uma no [GitHub](https://github.com) e o [Node.js](https://nodejs.org) 20 ou mais novo instalado.

### 1. Criar o projeto no Supabase

1. Em supabase.com → **New project**. Escolha um nome (ex.: `studio-personal`), defina uma **senha do banco** (guarde-a) e a região **South America (São Paulo)**.
2. Espere uns 2 minutos até o projeto ficar pronto.

### 2. Criar as tabelas (rodar as migrações)

1. No Supabase, menu **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/migrations/0001_initial.sql`, copie **tudo**, cole no editor e clique **Run**. Deve aparecer "Success". Isso cria as tabelas, as regras de segurança (RLS) e a configuração inicial: **segunda a sexta, blocos de 60 min das 6:00 às 19:00** (o último bloco termina às 20:00). Depois você ajusta tudo pelo próprio app, na tela **Horários**.
3. Abra uma **New query** de novo, cole **tudo** de `supabase/migrations/0002_aprovacao_professores.sql` e clique **Run**. Essa é a migração que adiciona o autocadastro de professores com aprovação do admin (explicado no passo 3 a seguir).
4. Repita com `0003_actual_times.sql` (hora customizada por célula) e depois `0004_student_code_required.sql` (código do aluno obrigatório em horário ocupado; células ocupadas antigas sem código ficam com `N/A`).

> Rode cada migração **uma vez só**, nessa ordem (0001, depois 0002). Se precisar refazer do zero, apague o projeto e crie outro (ou peça ajuda).
>
> **Já tem um projeto rodando (com professores e agendas reais) e está só adicionando a 0002 agora?** A ordem dos próximos passos muda — pule para a caixa "Atualizando um projeto que já está em uso" logo abaixo do passo 3.

### 3. Cadastro de professores e aprovação

Antes, só o admin criava contas pelo painel do Supabase. Agora o **próprio professor** também pode criar a conta na tela de login (*Criar conta* → nome, sobrenome, e-mail, senha). Em qualquer um dos dois casos, a conta nasce **pendente**: o professor só vê "Cadastro enviado! Aguarde a liberação do administrador" até você aprovar na tela **Professores** do app. Só depois de aprovada a grade dele é criada e ele ganha acesso. Nada disso depende do front-end — as regras (RLS) do banco garantem que pendente/recusado não leia nem grave nada além do próprio nome.

Para isso funcionar, o projeto precisa destas duas configurações em **Authentication → Sign In / Providers** (em versões antigas: *Providers → Email*):

- **Allow new users to sign up** → **ligado** (é o que permite a tela "Criar conta").
- **Confirm email** → **desligado** (a pessoa já entra direto depois de criar a conta, cai na tela de "aguardando aprovação"; sem isso ela ficaria travada esperando um e-mail de confirmação que o app não tem tela para tratar).

Se este é um projeto **novo** (você acabou de rodar 0001 e 0002 e ainda não tem professores reais cadastrados), pode ligar as duas agora mesmo, sem se preocupar com ordem, e seguir para o passo 4.

> #### ⚠️ Atualizando um projeto que já está em uso
>
> Se o seu projeto já tinha professores e agendas **antes** de você rodar a 0002 (era exatamente o cenário deste projeto quando essa funcionalidade foi criada), siga esta ordem exata — ela existe por um motivo:
>
> 1. **Rode a 0002 primeiro** (passo 2 acima), com o cadastro público ainda desligado (era o padrão recomendado antes desta versão).
> 2. **Só depois** ligue **Allow new users to sign up**.
> 3. **Por fim** desligue **Confirm email**.
>
> **Por que a ordem importa:** a 0002 promove para "aprovado" automaticamente **todo mundo que já existir no banco no momento em que ela roda** (é assim que seus professores atuais continuam funcionando sem precisar de nada). Se o cadastro público fosse religado **antes** de rodar a 0002, qualquer pessoa que se cadastrasse nesse intervalo seria "adotada" pelo mesmo backfill e apareceria já aprovada, sem passar pela revisão do admin. Rodar a 0002 primeiro garante que só as contas legítimas de antes de hoje sejam aprovadas automaticamente. Desligar o "Confirm email" por último evita que alguém que teste o cadastro nesse meio-tempo fique numa tela de confirmação de e-mail que o app não trata.

### 4. Pegar as chaves

**Project Settings → API** (ou *API Keys*):

| O que | Onde usar | Pode ficar pública? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | front-end e importador | sim |
| **anon / publishable key** | **só** no front-end (`web`) | sim — quem protege os dados é o RLS |
| **service_role / secret key** | **só** no importador, no seu computador | **NUNCA** — ignora todo o RLS |

Nunca cole a `service_role` no front-end, no Cloudflare, no GitHub ou em qualquer arquivo commitado.

### 5. Criar o primeiro usuário admin (você)

1. **Authentication → Users → Add user → Create new user**. Informe seu e-mail e uma senha e marque **Auto Confirm User**.
2. No **SQL Editor**, rode (troque o e-mail):

```sql
update public.profiles set role = 'admin', approval_status = 'aprovado' where email = 'seu@email.com';

-- (limpeza) o admin não tem agenda própria; remove a grade vazia criada antes da promoção
delete from public.schedule_entries
where professor_id = (select id from public.profiles where email = 'seu@email.com')
  and status = 'indisponivel';
```

Toda conta nova nasce **pendente** (inclusive de admin) — por isso o `approval_status = 'aprovado'` no mesmo UPDATE acima. Sem ele, você ficaria preso na tela "Cadastro enviado!" mesmo já sendo admin.

O admin **não dá aula no sistema**: ele não aparece nos totais nem tem "Minha agenda". Se você também atende alunos, crie uma segunda conta (outro e-mail) como professor.

### 6. Rodar o app no seu computador (teste)

```bash
cd web
cp .env.example .env.local        # no Windows: copy .env.example .env.local
```

Edite `web/.env.local`:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=<a chave anon/publishable>
```

```bash
npm install
npm run dev
```

Abra o endereço mostrado (http://localhost:5173) e entre com o e-mail/senha do admin.

### 7. Cadastrar os professores

Duas formas, e as duas terminam do mesmo jeito — com você aprovando na tela **Professores**:

- **O próprio professor se cadastra**: você passa o link do app e ele clica em *Criar conta* (nome, sobrenome, e-mail, senha). Mais simples, você só precisa aprovar depois.
- **Você cadastra pelo Supabase**: **Authentication → Users → Add user → Create new user** (e-mail, senha, **Auto Confirm User**). Sem nome nos metadados, então a primeira vez que essa pessoa entrar ela vai cair numa tela pedindo para completar o nome antes de mais nada.

Em ambos os casos a conta nasce **pendente**: ela aparece em **Professores → Pendentes**, com nome, e-mail e data do cadastro, e botões **Aprovar** / **Recusar**. Só depois de aprovada a grade é criada (tudo "indisponível") e o acesso libera. Recusar não apaga nada — dá para aprovar mais tarde ("Aprovar mesmo assim", na seção Recusados).

Desativar um professor **já aprovado** (mesma tela) bloqueia o acesso dele e tira a agenda dos totais; nada é apagado e dá para reativar. (Desativar é diferente de recusar: recusar é sobre liberar o primeiro acesso; desativar é para quem já usava o sistema e saiu do studio.)

### 8. Publicar no Cloudflare Pages

1. Suba este projeto para um repositório no GitHub (o `.gitignore` já protege `.env`, `node_modules` etc.).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → escolha o repositório.
3. Configuração de build:
   - **Framework preset**: None (ou Vite)
   - **Root directory**: `web`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Em **Environment variables**, adicione (Production):
   - `VITE_SUPABASE_URL` = a Project URL
   - `VITE_SUPABASE_ANON_KEY` = a chave **anon/publishable** (nunca a service_role)
   - `NODE_VERSION` = `20`
5. **Save and Deploy**. Você recebe um endereço `https://seu-projeto.pages.dev`.
6. De volta ao Supabase: **Authentication → URL Configuration** → coloque esse endereço em **Site URL**.

O arquivo `web/public/_redirects` já faz o app funcionar ao abrir/atualizar em qualquer rota (ex.: `/admin/horarios`). Qualquer `git push` publica uma nova versão.

> Alternativa sem GitHub: `cd web && npm run build && npx wrangler pages deploy dist` (as variáveis `VITE_*` precisam estar no `.env.local` no momento do build).

### 9. Importar as planilhas atuais

**Preparar os CSVs**: no Excel, abra a planilha do professor → **Arquivo → Salvar como → CSV UTF-8**. Salve **um arquivo por professor**, com o nome do professor ou o e-mail dele (ex.: `Ana Souza.csv` ou `ana@studio.com.br.csv`) numa pasta, ex.: `planilhas/`. Formato esperado:

| HORÁRIO | SEGUNDA-FEIRA | TERÇA-FEIRA | … |
|---|---|---|---|
| 6:00 | VENDA | luciano 1310 | |

- `VENDA` → **livre** · célula vazia → **indisponível** · qualquer outro texto → **ocupado**.
- Em `luciano 1310`, o número no final vira o **código** e o resto o **nome**. `joão` (sem número) fica com o código `N/A`, porque o código é obrigatório em horário ocupado.
- Os professores precisam já existir e estar **aprovados** (passo 7). Se o nome do arquivo corresponder a um professor pendente ou recusado, o script avisa claramente e pula o arquivo — aprove-o primeiro no app.

**Rodar** (no seu computador):

```bash
cd scripts/import-csv
npm install
cp .env.example .env              # no Windows: copy .env.example .env
```

Edite `scripts/import-csv/.env` com a Project URL e a **service_role key** (este arquivo nunca vai para o Git nem para a nuvem). Depois:

```bash
# 1) ensaio: mostra tudo o que seria feito, sem gravar nada
node --env-file=.env import.mjs ../../planilhas --dry-run

# 2) importação de verdade (pergunta antes de gravar)
node --env-file=.env import.mjs ../../planilhas
```

Aceita um arquivo, vários ou uma pasta. Se o nome do arquivo não bater com um professor, o script lista os professores e pergunta; ou indique com `--professor "ana@studio.com.br"` (um arquivo por vez).

O script **nunca ignora nada em silêncio**:

- **Horário do CSV que não existe na configuração** (ex.: 20:00): avisa e pergunta se deve criá-lo (e com qual duração). Se o horário existia e foi removido, oferece reativá-lo. Se você disser não, esse horário fica de fora e isso aparece no resumo.
- **Dia desativado** (ex.: sábado): pergunta se deve ativar (ativar cria a coluna para todos os professores).
- Mostra o resumo, a lista de alunos lidos (para você conferir a separação nome/código) e **destaca cada aluno já cadastrado que seria sobrescrito**, antes de pedir a confirmação.
- É repetível: rodar de novo com o mesmo CSV resulta em "0 alterações".

Opções: `--dry-run` (só simula), `--yes` (responde "sim" a tudo, use com cuidado), `--professor`.

---

## Como o sistema funciona

**Modelo de dados**: `profiles` (usuários; papel `admin`/`professor`; `active`; `approval_status` `pendente`/`aprovado`/`recusado`), `schedule_days` (7 dias, liga/desliga), `time_slots` (horários: início + duração; remover = `active=false`), `schedule_entries` (a célula: professor × dia × horário, com `status` livre/ocupado/indisponível, nome e código do aluno).

**Cadastro e aprovação**: toda conta nova (self-signup ou criada pelo Supabase) nasce `role='professor'` e `approval_status='pendente'`, sempre — o gatilho que cria o perfil (`handle_new_user`) nunca lê `role` nem `approval_status` dos metadados enviados no cadastro, só o nome; então nem uma pessoa mandando metadados forjados consegue nascer admin ou já aprovada. Só o admin muda `approval_status` (RLS exige `is_admin()`). Pendente/recusado só enxerga o próprio `profile` — nenhuma linha de `schedule_entries`, `schedule_days` ou `time_slots` — e não consegue alterar o próprio `approval_status`, `role` ou `active`. Aprovar é um UPDATE comum em `approval_status`; a grade nasce pela mesma sincronização de sempre (nenhum código novo para isso).

**Nome completo**: o e-mail nunca vira nome de exibição. Sem nome informado, a conta fica com `full_name` nulo, e a pessoa (pendente, recusada ou aprovada, professor ou admin) cai numa tela obrigatória de "Complete seu cadastro" antes de qualquer outra tela. A troca do próprio nome passa pela função `set_my_name` (SECURITY DEFINER: só alcança a própria linha, valida e capitaliza no banco) — não existe uma policy de UPDATE genérica em `profiles` para professores.

**A grade é mantida pelo banco**: quando você cria um professor, ativa um dia ou cria/reativa um horário, o banco cria automaticamente as células que faltam (como *indisponível*). Nada existente é alterado ou apagado.

**Nunca apaga em silêncio**:
- Remover ou desativar um horário/dia **não apaga dados**. Se houver alunos, o app lista **professor por professor, aluno por aluno** e só executa depois de você confirmar. Horários removidos ficam em "Horários removidos" e podem ser **restaurados** com os alunos.
- Alterar o início/duração de um horário com alunos também mostra quem é afetado (eles continuam no horário, que só muda de hora).

**Segurança (RLS no banco, não só no front-end)**:
- Professor aprovado e ativo: lê e edita **somente** as próprias células e só os campos `status`, `student_name`, `student_code`. Não cria nem apaga células, não altera horários/dias, não altera perfis. Conta desativada perde o acesso na hora.
- Professor pendente ou recusado: só lê o próprio `profile` (para as telas de aguardando/recusado/completar nome) — nenhuma agenda, dia ou horário de ninguém, nem os próprios (ainda não existem).
- Admin: lê e edita tudo; só ele altera dias, horários, perfis e aprovação. Precisa estar com `approval_status='aprovado'` também (uma futura conta de admin criada por SQL precisa desse UPDATE — ver passo 5).
- Visitante sem login: nada.
- O importador usa a `service_role` (ignora RLS) e por isso roda só no seu computador; mesmo assim, só importa para professores aprovados.

**Celular**: no telefone a grade vira abas por dia (Seg, Ter…) com uma lista de horários e o editor abre como painel na parte de baixo; no computador é uma grade estilo planilha. Cores: verde = livre, cinza = indisponível, azul = ocupado (nome + código no texto).

**Trocar a própria senha**: qualquer pessoa logada e aprovada tem um botão (ícone de chave, ao lado de "Sair") para trocar a própria senha, sem precisar de e-mail.

## Testes (opcional)

```bash
cd supabase/tests && npm install && npm test     # ~75 verificações de RLS/triggers/aprovação num Postgres embutido
cd scripts/import-csv && npm test                # parser do CSV
cd web && npm run build                          # checagem de tipos + build
```

Os testes de RLS aplicam as migrações (0001 e depois 0002) em um Postgres embutido (PGlite), com `auth.uid()` e os papéis do Supabase simulados. Cobrem, por exemplo: a Ana não lê nem edita a agenda da Bia; um cadastro novo nasce pendente mesmo mandando `role`/`approval_status` forjados no metadata; pendente não lê agenda, dias ou horários de ninguém, nem se autoaprova; `set_my_name` só altera o próprio nome e rejeita nome inválido; aprovar cria a grade automaticamente; e — simulando o upgrade real — professores e agenda de um banco só com a 0001 continuam intactos e aprovados depois de rodar a 0002.

## Limitações conhecidas (v1)

- **Não há tela de "esqueci minha senha"** (redefinir por e-mail). Existe troca de senha para quem já está logado; o que falta é o fluxo para quem esqueceu e não consegue entrar.
- Horários da grade podem se sobrepor (ex.: 6:00–7:00 e 6:30–7:15): o sistema permite, mas não avisa.
- A interface foi testada no navegador com um servidor simulado do Supabase e o banco/RLS em um Postgres embutido; **ainda não** foi exercitada contra o seu projeto Supabase real. Faça um teste rápido após o passo 6 (criar uma conta pela tela de login, aprovar como admin, entrar como o professor, editar uma célula).
