# EfficienceCo — Decisão de implementação: REGRAS-ENRICH

> Atualizado em 2026-06-16.

---

## Contexto

**Decisão:** a task `INFRA-REGRAS-ENRICH` define que a regra de automação deve ser capaz de fornecer o `tipo` de documento ao agente antes de processar o arquivo.

**Por quê:** atualmente a tabela de regras só tem `pasta_origem`, `pasta_destino`, `condicao` e `acao`. Sem um campo explícito de tipo, o agente não consegue incluir essa informação no nome do arquivo processado.

---

## Contrato de campo entre backend e agente

**Decisão:** criar um novo campo persistido no banco chamado `tipo_documento` na tabela de regras.

**Por quê:** essa abordagem é clara, explícita e evita sobrecarregar `condicao` com convenções de texto. Com `tipo_documento`, o backend e o agente compartilham um contrato simples e estável.

---

## Como o agente deve consumir

**Decisão:** o agente deve baixar a regra completa e, ao aplicar a automação, usar `tipo_documento` para compor o nome do arquivo processado.

**Por quê:** isso garante que a classificação do documento seja conhecida antes da renomeação e permite gerar nomes como `20260616_contrato_cliente.pdf` ou `20260616_holerite_fulano.pdf`.

**Exemplos de tipos previstos:** `holerite`, `contrato`, `nota fiscal`, `comprovante`, `recibo`.

---

## Por que não usar convenção em `condicao`

**Decisão:** não usar `condicao` como fonte do tipo de documento.

**Por quê:** `condicao` já expressa lógica de acionamento da regra. Misturar essa responsabilidade com metadados torna a regra menos previsível e mais difícil de manter.

---

## Passo obrigatório antes da implementação

**Decisão:** Gabriel e Vinícius devem realizar a conversa obrigatória com João (BK-REGRAS-ENRICH) para definir o contrato de campo e alinhar o modelo de dados.

**Por quê:** o acordo garante que backend e agente entendam o mesmo significado para `tipo_documento` e evita retrabalho ou inconsistências de interpretação.

---

## Resultado esperado

**Decisão:** após a entrega, o agente sabe o tipo de documento ao processar qualquer regra e usa esse tipo para nomear o arquivo processado.

**Por quê:** isso atende à saída esperada da task e mantém a automação previsível para o cliente e para o time.

---

## Diretriz para evoluções futuras

**Decisão:** se for necessário suportar múltiplos tipos por regra, expandir para um campo estruturado como `tipos_documento` em vez de reaproveitar `condicao`.

**Por quê:** campos explícitos preservam clareza, enquanto convenções implícitas sobrecarregam a modelagem e dificultam validação.
