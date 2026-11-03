# CI e bloqueio de merge — #681 (TEST-4)

O workflow [CI](../.github/workflows/ci.yml) executa em todo PR para `main`,
inclusive rascunhos e alterações só de documentação, em pushes para `main` e
manualmente pela aba Actions. Os jobs são independentes e publicam estes checks:

| Check | Execução |
| --- | --- |
| `Testes (backend e agente)` | `npm test` na raiz: migrations, backend com banco descartável e pytest do agente |
| `Build do frontend` | `npm --prefix frontend run build` (`next build`) |

Os dois usam Ubuntu 24.04 e Node.js 24. O agente usa Python 3.14 em `.venv`,
como espera o executor da #678. `npm ci` usa os lockfiles de cada pacote;
o cache guarda downloads de npm/pip, sem reaproveitar `node_modules`, `.venv`,
configuração do Supabase ou banco. Torch/torchvision são instalados pelo índice
CPU oficial antes do restante de `agente/worker/requirements.txt`, evitando
dependências CUDA no runner. Os requisitos Python continuam sendo os do agente.

Não é necessário cadastrar secrets: o GitHub fornece o token temporário para
checkout com `contents: read`, sem persistir credenciais no Git. URL, chaves e JWT
do banco são gerados pelo Supabase local descartável. O executor mantém os
bloqueios de serviços externos da #679 e remove seu próprio projeto ao terminar.
Nenhum `.env` do Supabase compartilhado deve ser criado no CI.

O shell Bash propaga falhas inclusive quando a saída passa por `tee` (`pipefail`).
Os logs de teste/build ficam nos artifacts por sete dias, também em falhas.
Instalações e tempos de cada etapa ficam no log normal do Actions. Uma atualização
do mesmo PR cancela a execução anterior; PRs diferentes executam separadamente.

## Integração com as outras entregas de testes

- O comando único já descobre os arquivos `*.test.js` em `backend/tests` e os
  `test_*.py` do agente. A massa #680 e os testes HTTP/RLS integrados participam
  da mesma bateria usada localmente.
- A TEST-5/#682 (PR #713) encadeia `test:hooks` no `npm test`. Seus testes entrarão
  no CI ao integrar esse PR, sem outra lista de arquivos ou execução duplicada.
- A TEST-12 continua adiada. Quando existir, seus testes de apoio devem entrar
  no `npm test` e ser validados aqui. O e2e completo do frontend, os testes SQL
  avulsos, o launcher Go e a integração governamental manual ficam fora desta entrega.
- A automação do Kanban (PR #705) tem workflow e permissões próprios; este CI
  não depende do `PROJECT_TOKEN` nem altera o board. Não faz deploy.

## Tornar os checks obrigatórios

**O arquivo de workflow sozinho não bloqueia merge.** Em 03/11/2026 a consulta
à API mostrou `main` sem proteção de branch e nenhum ruleset. Depois de publicar
esta branch e rodar o primeiro PR, um administrador deve configurar o bloqueio:

1. Em Settings → Branches, criar/editar a proteção de `main` (ou um ruleset
   equivalente, se disponível no plano do repositório privado).
2. Habilitar **Require a pull request before merging**, **Require status checks
   to pass before merging** e **Require branches to be up to date before merging**.
3. Selecionar os checks `Testes (backend e agente)` e `Build do frontend`, com
   origem GitHub Actions quando a UI oferecer essa seleção.
4. Aplicar também a administradores (**Do not allow bypassing the above settings**)
   e não cadastrar exceções de bypass para esta regra.
5. Conferir a configuração por leitura e executar o roteiro abaixo. Se o plano
   atual não permitir proteção em repositório privado, registrar o impedimento;
   o CI continua informativo, e a issue não está concluída. Não contratar plano.

Não há filtro de caminhos nem condição para pular os jobs: um check obrigatório
deve aparecer em todos os PRs. Se a equipe habilitar merge queue no futuro,
adicionar o evento `merge_group` antes de tornar essa fila obrigatória.

## Validar no GitHub antes de concluir a issue

1. Publicar um PR de teste para `main` e confirmar os dois checks verdes e os
   artifacts. Repetir com uma mudança apenas em Markdown.
2. No PR de teste, adicionar temporariamente um `backend/tests/ci-prova.test.js`
   com `import { test } from 'node:test'; test('falha deliberada', () => { throw new Error('prova CI'); });`.
   Confirmar check vermelho e merge bloqueado, inclusive para administrador.
3. Retirar o arquivo, enviar outro commit e confirmar ambos verdes. Repetir a
   falha com um `agente/worker/tests/test_ci_prova.py` que contenha
   `def test_ci_prova(): assert False`, removendo-o depois da prova.
4. Conferir também a falha do build: alterar temporariamente uma página do Next
   com erro de sintaxe, confirmar check vermelho/merge bloqueado e restaurar.
5. Conferir o log de limpeza do executor após sucesso e falha. Não versionar
   nenhum dos defeitos deliberados e fechar/remover o PR de prova ao terminar.

A execução local não comprova a proteção de branch nem uma execução hospedada.
Esses aceites exigem evidências no GitHub depois da publicação.

## Tempo e consumo da primeira semana

A meta é ficar abaixo de aproximadamente dez minutos com cache; o timeout de
vinte minutos do job de testes permite o primeiro download das imagens Supabase.
O build tem timeout de dez minutos. Não há matriz de versões ou runners pagos.
Esses limites interrompem execuções longas; não garantem duração nem gratuidade.

Registrar no vault, na sessão da #681 e no registro de testes automatizados:

| Dado | Como obter |
| --- | --- |
| Primeira execução sem cache | Link do run, SHA, duração total e duração de cada job na aba Actions |
| Execução com cache | Mesmo registro após outro commit; conferir cache hit nos logs |
| Consumo da semana | Actions/Billing da organização: período, minutos de todos os jobs e reexecuções, armazenamento e saldo da franquia do plano atual |
| Estimativa recorrente | Soma dos minutos dos jobs por PR × volume de PRs e atualizações; incluir pushes na `main` |

Os jobs rodam em paralelo: a duração do workflow difere da soma dos minutos
consumidos. A franquia é compartilhada com os outros workflows da organização.
Medir a semana real antes de marcar o aceite de custo como concluído.

Referências: [checks obrigatórios](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks),
[cache npm](https://github.com/actions/setup-node#caching-global-packages-data),
[cache pip](https://github.com/actions/setup-python#caching-packages-dependencies),
[instalação CPU do PyTorch](https://pytorch.org/get-started/locally/).
