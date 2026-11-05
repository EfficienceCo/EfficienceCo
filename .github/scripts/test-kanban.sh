#!/usr/bin/env bash
# Testes de kanban-decidir.sh e kanban-move.sh, sem rede: `gh` é um stub no PATH. Requer bash e jq.
# Uso: bash .github/scripts/test-kanban.sh      (SCRIPTS_DIR=<dir> e WORKFLOW=<yml> testam cópias: prova de mutação)
set -uo pipefail

SCRIPTS_DIR="${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
WORKFLOW="${WORKFLOW:-$SCRIPTS_DIR/../workflows/kanban-automacao.yml}"
command -v jq >/dev/null || { echo "jq é necessário para os testes"; exit 2; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

# ---- stub do gh ------------------------------------------------------------------------------
# Controlado por env: STUB_PRVIEW=ok|fail, STUB_CLOSING="<n>|<owner/repo>#<n> ...", STUB_META=ok|null|nofield|fail,
# STUB_NODE=ok|autherr|norepo|forbidden|notfound|nullnode|jsononly|noitem|done, STUB_UPDATE=ok|fail, STUB_ADD=ok|fail
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
args="$*"
echo "$args" >> "$STUB_LOG"
case "$args" in
  "pr view"*)
    if [ "${STUB_PRVIEW:-ok}" = fail ]; then echo "gh: HTTP 401: Bad credentials" >&2; exit 1; fi
    refs=""
    for r in ${STUB_CLOSING:-}; do
      case "$r" in *"#"*) repo=${r%%#*}; n=${r##*#} ;; *) repo=EfficienceCo/app; n=$r ;; esac
      refs="$refs${refs:+,}{\"number\":$n,\"repository\":{\"name\":\"${repo##*/}\",\"owner\":{\"login\":\"${repo%%/*}\"}}}"
    done
    echo "{\"closingIssuesReferences\":[$refs]}"; exit 0 ;;
  *"organization(login"*)
    case "${STUB_META:-ok}" in
      fail) echo "stdout-meta"; echo "gh: HTTP 401: Bad credentials" >&2; echo "extra-meta" >&2; exit 1 ;;
      nofield) echo '{"data":{"organization":{"projectV2":{"id":"P1","field":null}}}}' ;;
      null) echo '{"data":{"organization":{"projectV2":null}},"errors":[{"type":"NOT_FOUND"}]}' ;;
      ok) echo '{"data":{"organization":{"projectV2":{"id":"P1","field":{"id":"F1","options":[{"id":"O1","name":"In progress"},{"id":"O2","name":"Teste interno"},{"id":"O3","name":"Fila de deploy"},{"id":"O4","name":"Done"}]}}}}}' ;;
    esac ;;
  *issueOrPullRequest*)
    case "${STUB_NODE:-ok}" in
      autherr) echo '{"stdout-node":1}'; echo "gh: HTTP 401: Bad credentials" >&2; echo "extra-node" >&2; exit 1 ;;
      norepo)
        echo '{"data":{"repository":null},"errors":[{"type":"NOT_FOUND","message":"Could not resolve to a Repository with the name '"'"'EfficienceCo/app'"'"'."}]}'
        echo "gh: Could not resolve to a Repository with the name 'EfficienceCo/app'. (repository)" >&2; exit 1 ;;
      forbidden) echo "gh: Resource protected by organization SAML enforcement (HTTP 403)" >&2; exit 1 ;;
      notfound)
        echo '{"data":{"repository":{"issueOrPullRequest":null}},"errors":[{"type":"NOT_FOUND","message":"Could not resolve to an issue or pull request with the number of 999."}]}'
        echo "gh: Could not resolve to an issue or pull request with the number of 999. (repository.issueOrPullRequest)" >&2; exit 1 ;;
      ok) echo '{"data":{"repository":{"issueOrPullRequest":{"id":"C1","projectItems":{"nodes":[{"id":"I1","project":{"id":"P1"},"fieldValueByName":{"name":"Teste interno"}}]}}}}}' ;;
      done) echo '{"data":{"repository":{"issueOrPullRequest":{"id":"C1","projectItems":{"nodes":[{"id":"I1","project":{"id":"P1"},"fieldValueByName":{"name":"Done"}}]}}}}}' ;;
      nullnode) echo '{"data":{"repository":{"issueOrPullRequest":null}}}' ;;   # gh sai 0, mas o nó é null
      jsononly) echo '{"errors":[{"type":"X"}]}'; exit 1 ;;                       # falha só com JSON cru, sem linha legível
      noitem) echo '{"data":{"repository":{"issueOrPullRequest":{"id":"C1","projectItems":{"nodes":[]}}}}}' ;;
    esac ;;
  *addProjectV2ItemById*)
    if [ "${STUB_ADD:-ok}" = fail ]; then echo "stdout-add"; echo "gh: Resource not accessible by personal access token (HTTP 403)" >&2; echo "extra-add" >&2; exit 1; fi
    echo "NEWITEM" ;;   # o script usa --jq; o stub já devolve o id
  *updateProjectV2ItemFieldValue*)
    if [ "${STUB_UPDATE:-ok}" = fail ]; then echo "stdout-update"; echo "gh: HTTP 502" >&2; echo "extra-update" >&2; exit 1; fi
    echo '{}' ;;
esac
STUB
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH" STUB_LOG="$TMP/gh.log"

pass=0; fail=0
check() { # check "<descrição>" <esperado> <obtido>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok   - $1"
  else fail=$((fail+1)); echo "  FAIL - $1 (esperado: '$2', obtido: '$3')"; fi
}
contains() { # contains "<descrição>" "<trecho>" "<texto>"
  if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "  ok   - $1"
  else fail=$((fail+1)); echo "  FAIL - $1 (não contém '$2' em: $3)"; fi
}
lacks() { # lacks "<descrição>" "<trecho>" "<texto>"
  if [[ "$3" != *"$2"* ]]; then pass=$((pass+1)); echo "  ok   - $1"
  else fail=$((fail+1)); echo "  FAIL - $1 (contém '$2' em: $3)"; fi
}

# ---- kanban-decidir.sh -----------------------------------------------------------------------
decidir() { # decidir VAR=valor... -> imprime "status|items|branch_items" (ou "RC=<n>")
  : > "$TMP/out"; : > "$STUB_LOG"
  env -i PATH="$PATH" STUB_LOG="$STUB_LOG" GITHUB_OUTPUT="$TMP/out" REPO=EfficienceCo/app "$@" \
    bash "$SCRIPTS_DIR/kanban-decidir.sh" >"$TMP/decidir.log" 2>&1
  local rc=$?
  [ $rc -eq 0 ] || { echo "RC=$rc"; return; }
  echo "$(grep '^status=' "$TMP/out" | cut -d= -f2-)|$(grep '^items=' "$TMP/out" | cut -d= -f2-)|$(grep '^branch_items=' "$TMP/out" | cut -d= -f2-)"
}
echo "decidir:"
R() { echo EVENT=pull_request_review ACTION=submitted PR_NUMBER=10 PR_BRANCH=695-algo "REVIEW_STATE=$1" "PR_DRAFT=$2"; }
check "approved + draft => In progress"          "In progress|10|695"     "$(decidir $(R approved true))"
check "approved + não draft => Fila de deploy"   "Fila de deploy|10|695" "$(decidir $(R approved false))"
check "APPROVED (maiúsculo) + não draft"          "Fila de deploy|10|695" "$(decidir $(R APPROVED false))"
check "changes_requested => In progress"          "In progress|10|695"     "$(decidir $(R changes_requested false))"
check "review commented => sem transição"         "||"                     "$(decidir $(R commented false))"
P() { echo EVENT=pull_request "ACTION=$1" PR_NUMBER=10 PR_BRANCH=695-algo "PR_DRAFT=$2" "PR_MERGED=${3:-false}"; }
check "opened draft => In progress"               "In progress|10|695"     "$(decidir $(P opened true))"
check "opened não draft => Teste interno"         "Teste interno|10|695"   "$(decidir $(P opened false))"
check "ready_for_review => Teste interno"         "Teste interno|10|695"   "$(decidir $(P ready_for_review false))"
check "converted_to_draft => In progress"         "In progress|10|695"     "$(decidir $(P converted_to_draft true))"
check "closed merged => Done"                     "Done|10|695"            "$(decidir $(P closed false true))"
check "closed sem merge => sem transição"         "||"                     "$(decidir $(P closed false false))"
check "create de branch => só branch_items (tolerante)" "In progress||695"  "$(decidir EVENT=create REF_NAME=695-algo)"
check "create de branch sem número => sem itens"  "In progress||"          "$(decidir EVENT=create REF_NAME=hotfix-x)"
check "issues que o PR fecha entram em items e deduplicam com a branch" "Teste interno|10 695 700|" "$(decidir $(P opened false) STUB_CLOSING="695 700")"
check "número da branch que o PR NÃO fecha fica só em branch_items" "Teste interno|10 700|695" "$(decidir $(P opened false) STUB_CLOSING="700")"
check "closingIssuesReferences de outro repo é filtrado" "Teste interno|10 700|695" "$(decidir $(P opened false) STUB_CLOSING="700 other/repo#800")"
check "filtro de repo ignora maiúsculas/minúsculas"      "Teste interno|10 700|695" "$(decidir $(P opened false) STUB_CLOSING="efficienceco/APP#700")"
check "erro de API no gh pr view => falha (não engole)" "RC=1" "$(decidir $(P opened false) STUB_PRVIEW=fail)"
check "itens repetidos (PR também listado como fechado; issue repetida) deduplicam mantendo a ordem" "Teste interno|10 700|695" "$(decidir $(P opened false) STUB_CLOSING="10 700 700")"
# variáveis de entrada ausentes (set -u): cada default `X="${X:-}"` precisa existir
check "sem nenhuma variável (EVENT ausente) => sem transição, sem unbound variable" "||" "$(decidir)"
check "pull_request sem ACTION => sem transição, sem unbound variable" "||" "$(decidir EVENT=pull_request PR_NUMBER=10 PR_BRANCH=695-algo PR_DRAFT=false)"
check "pull_request_review sem REVIEW_STATE => sem transição, sem unbound variable" "||" "$(decidir EVENT=pull_request_review PR_NUMBER=10 PR_BRANCH=695-algo PR_DRAFT=false)"
check "pull_request opened sem PR_DRAFT => trata como não draft" "Teste interno|10|695" "$(decidir EVENT=pull_request ACTION=opened PR_NUMBER=10 PR_BRANCH=695-algo)"
check "pull_request closed sem PR_MERGED => sem transição" "||" "$(decidir EVENT=pull_request ACTION=closed PR_NUMBER=10 PR_BRANCH=695-algo)"
check "create sem REF_NAME => sem itens" "In progress||" "$(decidir EVENT=create)"
check "pull_request opened sem PR_BRANCH => só itens certos" "Teste interno|10|" "$(decidir EVENT=pull_request ACTION=opened PR_NUMBER=10 PR_DRAFT=false)"
decidir $(P opened false) >/dev/null
contains "log do decidir mostra destino e itens" "Destino: Teste interno | itens: 10 | itens da branch (tolerantes): 695" "$(cat "$TMP/decidir.log")"
decidir $(P closed false false) >/dev/null
contains "sem transição => log explícito" "Evento sem transição, nada a fazer" "$(cat "$TMP/decidir.log")"
contains "sem transição => escreve status= vazio no GITHUB_OUTPUT" "status=" "$(cat "$TMP/out")"
lacks "sem transição => não escreve items= nem branch_items=" "items=" "$(cat "$TMP/out")"
check "sem transição não chama a API" "" "$(cat "$STUB_LOG")"

# ---- kanban-move.sh --------------------------------------------------------------------------
mover() { # mover [VAR=valor...] -- <status> <numeros...> -> define OUT, RC e LEFT (arquivos temp que sobraram)
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
  : > "$STUB_LOG"; rm -rf "$TMP/tmpd"; mkdir "$TMP/tmpd"
  OUT=$(env TMPDIR="$TMP/tmpd" GH_TOKEN=x REPO=EfficienceCo/app "${envs[@]}" bash "$SCRIPTS_DIR/kanban-move.sh" "$@" 2>&1); RC=$?
  LEFT=$(ls -A "$TMP/tmpd")
}
echo "move:"
mover STUB_NODE=autherr -- "Fila de deploy" 5
check "erro de API/auth => exit != 0" "1" "$RC"
contains "erro de API/auth => mensagem ::error::" "::error::" "$OUT"

mover STUB_NODE=norepo -- "Fila de deploy" 5
check "repo nulo (token só com project) => exit 1" "1" "$RC"
contains "repo nulo => ::error:: com a dica do token" "Confira o PROJECT_TOKEN" "$OUT"
contains "repo nulo => preserva a mensagem original da API" "Could not resolve to a Repository" "$OUT"
contains "repo nulo => ::error:: cita o item" "::error::#5" "$OUT"

mover STUB_NODE=forbidden -- "Fila de deploy" 5
check "403 (SAML não autorizado) => exit 1" "1" "$RC"
contains "403 => ::error:: com a dica do token" "Confira o PROJECT_TOKEN" "$OUT"
contains "403 => dica cita SAML" "SAML" "$OUT"
contains "403 => preserva a mensagem original da API" "SAML enforcement (HTTP 403)" "$OUT"

mover STUB_NODE=autherr -- "Fila de deploy" 5
contains "erro genérico => também traz a dica do token" "Confira o PROJECT_TOKEN" "$OUT"
contains "erro genérico => ::error:: carrega a 1ª linha da API" "::error::#5: falha na API do GitHub (token sem acesso ao repo/SAML não autorizado, auth, rede, rate limit ou 5xx?): gh: HTTP 401: Bad credentials" "$OUT"
contains "erro genérico => imprime stdout do gh" "stdout-node" "$OUT"
contains "erro genérico => imprime TODO o stderr do gh (não só a 1ª linha)" "extra-node" "$OUT"
mover STUB_NODE=norepo -- "Fila de deploy" 5
contains "repo nulo => ::error:: pula o JSON cru e cita a 1ª linha legível" "rate limit ou 5xx?): gh: Could not resolve to a Repository" "$OUT"

mover STUB_NODE=notfound -- "Fila de deploy" 10
check "NOT_FOUND no número do PR (não tolerante) => exit 1" "1" "$RC"
contains "NOT_FOUND no PR => ::error:: apontando o token" "::error::#10" "$OUT"
contains "NOT_FOUND no PR => menciona PROJECT_TOKEN" "PROJECT_TOKEN" "$OUT"

mover STUB_NODE=notfound TOLERANT_ITEMS="999" -- "In progress" 999
check "NOT_FOUND de número de branch => exit 0" "0" "$RC"
contains "NOT_FOUND de branch => ::warning::" "::warning::#999" "$OUT"
contains "todos não encontrados => warning explícito" "::warning::nenhum card movido" "$OUT"
contains "todos não encontrados => warning conta os não encontrados" "(1 de 1 itens não encontrados)" "$OUT"

mover STUB_NODE=nullnode TOLERANT_ITEMS="999" -- "In progress" 999
check "nó null com gh exit 0 (branch tolerante) => exit 0" "0" "$RC"
contains "nó null => ::warning:: e segue" "::warning::#999" "$OUT"
check "nó null => não tenta adicionar/mover (continue)" "" "$(grep -E 'addProjectV2ItemById|updateProjectV2ItemFieldValue' "$STUB_LOG")"
lacks "nó null => não aborta em erro cru de jq" "jq:" "$OUT"
mover STUB_NODE=nullnode -- "In progress" 10
check "nó null em item não tolerante => exit 1" "1" "$RC"
contains "nó null não tolerante => ::error:: com dica do token" "::error::#10" "$OUT"
mover STUB_NODE=jsononly -- "In progress" 5
check "falha da API só com JSON cru => exit 1 (|| true no grep)" "1" "$RC"
contains "falha só com JSON cru => ::error:: com 'sem detalhe'" "falha na API do GitHub (token sem acesso ao repo/SAML não autorizado, auth, rede, rate limit ou 5xx?): sem detalhe" "$OUT"
contains "falha só com JSON cru => dica do token" "Confira o PROJECT_TOKEN" "$OUT"
mover STUB_NODE=notfound TOLERANT_ITEMS="999" -- "In progress" 10 999
check "PR NOT_FOUND + branch tolerante juntos => ainda exit 1" "1" "$RC"

mover STUB_META=null -- "In progress" 5
check "Project inacessível (projectV2 null) => exit 1" "1" "$RC"
contains "Project inacessível => ::error:: amigável" "::error::Project nº 2 de EfficienceCo inacessível" "$OUT"
contains "Project inacessível => orienta SAML/Resource owner" "Resource owner" "$OUT"
lacks "Project inacessível => não aborta em erro cru de jq" "jq:" "$OUT"

mover STUB_META=nofield -- "In progress" 5
check "projectV2 sem campo Status => exit 1" "1" "$RC"
contains "campo Status ausente => ::error:: com o nome do campo" "::error::Campo 'Status'" "$OUT"
lacks "campo Status ausente => não aborta em erro cru de jq" "jq:" "$OUT"

mover -- "Inexistente" 5
check "Status que não existe no board => exit 1" "1" "$RC"
contains "Status inexistente => ::error:: com o nome do status" "::error::Status 'Inexistente' não existe" "$OUT"
lacks "Status inexistente => aborta antes de tocar em issue/PR" "issueOrPullRequest" "$(cat "$STUB_LOG")"

mover STUB_META=fail -- "In progress" 5
check "1ª chamada gh api (meta) falha => exit 1" "1" "$RC"
contains "meta falha => ::error:: com instrução" "::error::Falha ao consultar o Project" "$OUT"
contains "meta falha => imprime stdout do gh" "stdout-meta" "$OUT"
contains "meta falha => imprime TODO o stderr do gh (não só a 1ª linha)" "extra-meta" "$OUT"
contains "meta falha => preserva a mensagem original da API" "Bad credentials" "$OUT"
check "meta falha => abortou antes de consultar issue/PR" "" "$(grep issueOrPullRequest "$STUB_LOG")"

mover -- "Fila de deploy" 5
check "caminho feliz => exit 0" "0" "$RC"
contains "caminho feliz => move o card" "#5: Teste interno -> Fila de deploy" "$OUT"
contains "caminho feliz => chamou a mutation de update" "updateProjectV2ItemFieldValue" "$(cat "$STUB_LOG")"
contains "caminho feliz => query cobre Issue" "... on Issue {" "$(cat "$STUB_LOG")"
contains "caminho feliz => query cobre PullRequest" "... on PullRequest {" "$(cat "$STUB_LOG")"
contains "caminho feliz => query lê o campo Status do item" 'fieldValueByName(name:"Status")' "$(cat "$STUB_LOG")"
contains "caminho feliz => update usa project, item, campo e opção certos" "p=P1 -f i=I1 -f f=F1 -f o=O3" "$(cat "$STUB_LOG")"
check "caminho feliz => sem ::warning:: (inclui 'nenhum card movido': mover conta como tratado)" "" "$(grep '::warning::' <<<"$OUT")"
check "caminho feliz => não deixa arquivo temporário" "" "$LEFT"

mover -- "Teste interno" 5
contains "já no destino => não move" "já está em Teste interno" "$OUT"
lacks "já no destino => não avisa 'nenhum card movido' (conta como tratado)" "nenhum card movido" "$OUT"
lacks "já no destino => sem mutation de update" "updateProjectV2ItemFieldValue" "$(cat "$STUB_LOG")"

mover STUB_NODE=noitem -- "In progress" 5
check "item fora do Project => exit 0" "0" "$RC"
contains "item_id vazio => dispara addProjectV2ItemById" "addProjectV2ItemById" "$(cat "$STUB_LOG")"
contains "item recém-adicionado é o que recebe o status" "i=NEWITEM" "$(cat "$STUB_LOG")"

mover STUB_NODE=done -- "In progress" 5
check "Done é terminal (destino != Done) => exit 0" "0" "$RC"
contains "Done é terminal => mantém" "já está em Done, mantendo" "$OUT"
lacks "Done é terminal => não avisa 'nenhum card movido' (conta como tratado)" "nenhum card movido" "$OUT"
lacks "Done é terminal => sem mutation de update" "updateProjectV2ItemFieldValue" "$(cat "$STUB_LOG")"

mover STUB_NODE=done -- "Done" 5
contains "Done -> Done => já no destino" "já está em Done" "$OUT"

mover STUB_UPDATE=fail -- "Fila de deploy" 5
check "falha na mutation de update => exit != 0" "1" "$RC"
contains "falha no update => ::error:: com a dica do token" "::error::#5: falha ao mover o card" "$OUT"
contains "falha no update => dica de permissão de escrita" "Confira o PROJECT_TOKEN" "$OUT"
contains "falha no update => preserva a mensagem da API" "gh: HTTP 502" "$OUT"
contains "falha no update => imprime stdout do gh" "stdout-update" "$OUT"
contains "falha no update => imprime TODO o stderr do gh" "extra-update" "$OUT"
check "abortar por fail_token não vaza o arquivo temporário (trap)" "" "$LEFT"

mover STUB_NODE=noitem STUB_ADD=fail -- "In progress" 5
check "falha no addProjectV2ItemById => exit 1" "1" "$RC"
contains "falha no add => ::error:: com a dica do token" "::error::#5: falha ao adicionar o card" "$OUT"
contains "falha no add => dica de escrita + Confira o PROJECT_TOKEN" "Confira o PROJECT_TOKEN" "$OUT"
contains "falha no add => preserva a mensagem da API" "Resource not accessible by personal access token" "$OUT"
contains "falha no add => imprime stdout do gh" "stdout-add" "$OUT"
contains "falha no add => imprime TODO o stderr do gh" "extra-add" "$OUT"
lacks "falha no add => não segue para o update" "updateProjectV2ItemFieldValue" "$(cat "$STUB_LOG")"
check "falha no add não vaza o arquivo temporário (trap)" "" "$LEFT"

echo "checar-token:"
OUT=$(env -i PATH="$PATH" PROJECT_TOKEN="" bash "$SCRIPTS_DIR/kanban-checar-token.sh" 2>&1); RC=$?
check "PROJECT_TOKEN vazio => exit 1" "1" "$RC"
contains "PROJECT_TOKEN vazio => ::error:: com instrução" "::error::Secret PROJECT_TOKEN ausente" "$OUT"
contains "mensagem cita SAML SSO" "SAML SSO" "$OUT"
contains "mensagem cita Resource owner" "Resource owner" "$OUT"
OUT=$(env -i PATH="$PATH" PROJECT_TOKEN="segredo-xyz" bash "$SCRIPTS_DIR/kanban-checar-token.sh" 2>&1); RC=$?
check "PROJECT_TOKEN preenchido => exit 0" "0" "$RC"
contains "PROJECT_TOKEN preenchido => confirma presença" "PROJECT_TOKEN presente" "$OUT"
lacks "PROJECT_TOKEN preenchido => sem ::error::" "::error::" "$OUT"
OUT=$(env -i PATH="$PATH" bash "$SCRIPTS_DIR/kanban-checar-token.sh" 2>&1); RC=$?
check "PROJECT_TOKEN ausente (não definido) => exit 1, sem unbound variable" "1" "$RC"
contains "PROJECT_TOKEN ausente => ::error::" "::error::Secret PROJECT_TOKEN ausente" "$OUT"
lacks "não imprime o valor do token" "segredo-xyz" "$OUT"

echo "workflow e docs:"
runs=$(grep -E '^[[:space:]]+run:' "$WORKFLOW" || true)
contains "Mover cards usa o script" "kanban-move.sh" "$runs"
lacks "run não interpola steps.*.outputs (injeção); vai por env:" '${{' "$runs"
contains "Mover cards recebe STATUS por env" 'STATUS: ${{ steps.plan.outputs.status }}' "$(cat "$WORKFLOW")"
contains "TOLERANT_ITEMS vem só de branch_items" 'TOLERANT_ITEMS: ${{ steps.plan.outputs.branch_items }}' "$(cat "$WORKFLOW")"
wf=$(cat "$WORKFLOW")
contains "Decidir recebe PR_DRAFT do evento" 'PR_DRAFT: ${{ github.event.pull_request.draft }}' "$wf"
contains "Mover cards roda também se só houver branch_items" "steps.plan.outputs.items != '' || steps.plan.outputs.branch_items != ''" "$wf"
run_of() { grep -E '^[[:space:]]+run:' <<<"$1" | sed -E 's/^[[:space:]]+run:[[:space:]]*//'; }  # linha(s) run: do passo, sem o prefixo
token_step=$(awk '/- name: Verificar/{f=1;next} /- name: /{f=0} f' "$WORKFLOW")
check "Verificar PROJECT_TOKEN: run é exatamente o script (sem || true etc.)" "bash .github/scripts/kanban-checar-token.sh" "$(run_of "$token_step")"
lacks "workflow sem continue-on-error (o passo de token não pode ser engolido)" "continue-on-error" "$wf"
move_step=$(awk '/- name: Mover/{f=1;next} /- name: /{f=0} f' "$WORKFLOW")
check "Mover cards: run é exatamente kanban-move.sh \"\$STATUS\" \$ITEMS \$TOLERANT_ITEMS" 'bash .github/scripts/kanban-move.sh "$STATUS" $ITEMS $TOLERANT_ITEMS' "$(run_of "$move_step")"
contains "Mover cards usa PROJECT_TOKEN" 'GH_TOKEN: ${{ secrets.PROJECT_TOKEN }}' "$move_step"
contains "Decidir usa github.token" 'GH_TOKEN: ${{ github.token }}' "$wf"
decidir_step=$(awk '/- name: Decidir/{f=1;next} /- name: /{f=0} f' "$WORKFLOW")
check "Decidir: run é exatamente o script (sem || true etc.)" "bash .github/scripts/kanban-decidir.sh" "$(run_of "$decidir_step")"
lacks "PROJECT_TOKEN não vaza para o passo Decidir" "PROJECT_TOKEN" "$decidir_step"
for st in token_step move_step decidir_step; do
  lacks "$st: sem '||' nas linhas run:" "||" "$(run_of "${!st}")"
  lacks "$st: sem continue-on-error" "continue-on-error" "${!st}"
done
lacks "token_step: sem if: (o passo não pode ser pulado)" "if:" "$token_step"
# -- fiação exaustiva: gerada a partir do que os scripts LEEM, para que variável nova também seja coberta --
step_env() { awk '/^        env:/{f=1;next} f && /^          [A-Z_]+:/{print;next} f && !/^          #/{f=0}' <<<"$1"; }  # linhas KEY: valor do env do passo
step_keys() { step_env "$1" | sed -E 's/^[[:space:]]+([A-Z_]+):.*/\1/' | sort -u | paste -sd' ' -; }
script_inputs() { # variáveis de ambiente lidas pelo script: X="${X:-...}" ou $X/${X} usada sem nunca ser atribuída no script
  local sc="$1" v
  { grep -oE '\b[A-Z][A-Z_]*="\$\{[A-Z][A-Z_]*:-' "$sc" | sed -nE 's/^([A-Z_]+)="\$\{\1:-$/\1/p'
    for v in $(grep -oE '\$\{?[A-Z][A-Z_]*' "$sc" | tr -d '${' | sort -u); do
      grep -qE "(^|[[:space:];])$v=" "$sc" || echo "$v"
    done; } | grep -vE '^(GITHUB_OUTPUT|ORG|PROJECT_NUMBER)$' | sort -u | paste -sd' ' -
}
dec_in=$(script_inputs "$SCRIPTS_DIR/kanban-decidir.sh")
mov_in=$(script_inputs "$SCRIPTS_DIR/kanban-move.sh")
check "sanidade: entradas lidas por kanban-decidir.sh" "ACTION EVENT PR_BRANCH PR_DRAFT PR_MERGED PR_NUMBER REF_NAME REPO REVIEW_STATE" "$dec_in"
check "sanidade: entradas lidas por kanban-move.sh (STATUS/ITEMS chegam por argumento via env do passo)" "REPO TOLERANT_ITEMS" "$mov_in"
for v in $dec_in GH_TOKEN; do
  [[ "$(step_keys "$decidir_step")" == *"$v"* ]] && ok=sim || ok=nao
  check "Decidir: env declara $v (lido pelo kanban-decidir.sh)" "sim" "$ok"
done
for v in $mov_in GH_TOKEN STATUS ITEMS; do
  [[ " $(step_keys "$move_step") " == *" $v "* ]] && ok=sim || ok=nao
  check "Mover: env declara $v (lido pelo kanban-move.sh / usado no run)" "sim" "$ok"
done
check "Decidir: env não tem variável sobrando além das lidas" "$(echo $dec_in GH_TOKEN | tr ' ' '\n' | sort -u | paste -sd' ' -)" "$(step_keys "$decidir_step")"
check "Mover: env não tem variável sobrando" "GH_TOKEN ITEMS REPO STATUS TOLERANT_ITEMS" "$(step_keys "$move_step")"
check "Verificar PROJECT_TOKEN: env só tem PROJECT_TOKEN" "PROJECT_TOKEN" "$(step_keys "$token_step")"
contains "Verificar PROJECT_TOKEN: env exato" '          PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}' "$(step_env "$token_step")"
# valor exato de cada linha de env (cada contains morre se a expressão do evento for trocada)
for line in \
  'GH_TOKEN: ${{ github.token }}' \
  'EVENT: ${{ github.event_name }}' \
  'ACTION: ${{ github.event.action }}' \
  'REVIEW_STATE: ${{ github.event.review.state }}' \
  'PR_NUMBER: ${{ github.event.pull_request.number }}' \
  'PR_DRAFT: ${{ github.event.pull_request.draft }}' \
  'PR_MERGED: ${{ github.event.pull_request.merged }}' \
  'PR_BRANCH: ${{ github.event.pull_request.head.ref }}' \
  'REF_NAME: ${{ github.ref_name }}' \
  'REPO: ${{ github.repository }}'; do
  contains "Decidir: env exato '$line'" "          $line" "$(step_env "$decidir_step")"
done
for line in \
  'GH_TOKEN: ${{ secrets.PROJECT_TOKEN }}' \
  'REPO: ${{ github.repository }}' \
  'STATUS: ${{ steps.plan.outputs.status }}' \
  'ITEMS: ${{ steps.plan.outputs.items }}' \
  'TOLERANT_ITEMS: ${{ steps.plan.outputs.branch_items }}'; do
  contains "Mover: env exato '$line'" "          $line" "$(step_env "$move_step")"
done
check "Decidir: id do passo é plan (os outputs.* do Mover dependem disso)" "        id: plan" "$(grep -E '^        id:' <<<"$decidir_step")"
contains "Mover: if exato" "        if: steps.plan.outputs.status != '' && (steps.plan.outputs.items != '' || steps.plan.outputs.branch_items != '')" "$move_step"
# blocos de topo: on:, permissions, concurrency, job
top_block() { awk -v k="$1" '$0 ~ "^"k":"{f=1;print;next} /^[^ #]/{f=0} f && NF' "$WORKFLOW"; }
check "on: triggers e types exatos (create; PR opened/reopened/ready_for_review/converted_to_draft/closed; review submitted)" \
"on:
  create:
  pull_request:
    types: [opened, reopened, ready_for_review, converted_to_draft, closed]
  pull_request_review:
    types: [submitted]" "$(top_block on)"
check "permissions exatas (somente leitura)" "permissions:
  contents: read
  pull-requests: read
  issues: read" "$(top_block permissions)"
check "concurrency exata (sem cancelar em andamento)" "concurrency:
  group: kanban-\${{ github.event.pull_request.number || github.ref_name }}
  cancel-in-progress: false" "$(top_block concurrency)"
contains "job só roda em create de branch (não tag) ou nos demais eventos" "    if: github.event_name != 'create' || github.ref_type == 'branch'" "$wf"
contains "nome do workflow" "name: Kanban automação" "$wf"
check "job único chamado move" "  move:" "$(awk '/^jobs:/{f=1;next} f && /^  [a-z]/{print}' "$WORKFLOW")"
contains "job roda em ubuntu-latest" "    runs-on: ubuntu-latest" "$wf"
contains "job declara steps" "    steps:" "$wf"
contains "job usa checkout para ter os scripts" "      - uses: actions/checkout@v4" "$wf"
for f in "$WORKFLOW" "$SCRIPTS_DIR/kanban-move.sh"; do
  contains "doc do cabeçalho de $(basename "$f") cita SAML SSO" "SAML SSO: o PAT" "$(cat "$f")"
  contains "doc do cabeçalho de $(basename "$f") cita Resource owner" '"Resource owner" tem que ser a ORGANIZAÇÃO' "$(cat "$f")"
done

echo
echo "passou: $pass | falhou: $fail"
[ "$fail" -eq 0 ]
