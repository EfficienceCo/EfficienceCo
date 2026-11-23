# Testes HTTP da Apuração — TEST-DAS-2

Esta suíte valida as rotas de apuração por HTTP com usuários persistidos, JWT da aplicação, JWT/RLS do Supabase e PostgreSQL descartável. O comando focal é `npm test -- apuracao apuracoes`; o executor canônico cria e remove o banco de teste. Cada cenário cria dados próprios e limpa apenas os IDs que criou.

## Matriz de cobertura

| Grupo | Contrato coberto |
|---|---|
| Autenticação e acesso | JWT ausente, perfis permitidos e proibidos, credencial de licença e vínculo do usuário ao tenant |
| POST e GET de coleção | Validação de cliente/período, tenant derivado do token, coleção vazia, criação, duplicidade e persistência imediata |
| Operações por ID | 404 equivalente para recurso estrangeiro/inexistente, validação, edição, recálculo, aprovação, exclusão e preservação do estado no banco |
| Folha e Fator R | Reporte por agente, 12 referências, ausência legítima de mês como zero, processamento falho ou incompleto como pendência, fila e persistência |
| Concorrência | Aprovação e edição concorrentes em ambas as ordens; exatamente uma operação vence e a outra recebe conflito |
| Fiscal e auditoria | Anexos I–V, notas ativas/canceladas, janela de 12 meses, valores, histórico, autoria e igualdade entre resposta e banco |

Os cenários de isolamento mantêm dados nos dois tenants e comparam as linhas antes e depois da requisição. Os testes de corrida usam requisições HTTP reais e coordenam apenas a entrega das leituras; fetch é restaurado ao final do cenário.

## Divergência conhecida — [#740](https://github.com/EfficienceCo/EfficienceCo/issues/740)

A #730 exige que `POST /apuracoes` e `GET /apuracoes` retornem o mesmo 404 quando um usuário de escritório informa um `clienteId` explícito de outro tenant. Atualmente essas rotas derivam o cliente do token e ignoram o `clienteId` divergente. Os testes ativos confirmam que os dados do tenant informado não são lidos nem alterados, mas isso não satisfaz o status 404 definido no aceite.

Os dois cenários AP-HTTP-01 permanecem `test.skip` até a correção de produção ser implementada em #740. A suíte verifica separadamente o vínculo ao token e a integridade dos tenants; esta entrega não declara a #730 concluída.

## Inventário de testes

`backend/tests/apuracao-http.test.js` cobre as nove rotas por HTTP e banco real. `backend/tests/apuracao/` contém os cenários específicos de Fator R e provisório do Anexo V. Os grupos QA-F permanecem nos arquivos existentes e continuam cobrindo regras fiscais e fluxos com os serviços reais. Os testes puros do motor de cálculo e os testes de acesso por middleware mantêm seus próprios arquivos e escopos.
