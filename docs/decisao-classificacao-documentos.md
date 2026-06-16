# EfficienceCo — Decisão de classificação e enriquecimento de documentos

> Atualizado em 2026-06-16.

---

## Objetivo

**Decisão:** documentar o modelo de metadados usados pela automação para classificar documentos no agente.

**Por quê:** o agente precisa de regras previsíveis para decidir o tipo de documento, identificar arquivos pelo nome e manter histórico de ingestão. Essas decisões devem ser registradas de forma clara e reproduzível.

---

## Definições de metadados

**Decisão:** cada documento processado deve ser associado aos seguintes campos:

- `condicao`: texto da regra de disparo. Exemplo: `especificação & especificação`.
- `tipo`: categoria do documento. Ex: `holerite`, `contrato`, `nota fiscal`, `comprovante`, `recibo`.
- `inName`: indicador de correspondência no nome do arquivo. Se o texto estiver em qualquer parte do nome do arquivo, a regra classifica o documento.
- `extensao`: formato do arquivo. Ex: `pdf`, `jpg`, `png`, `xlsx`.
- `tamanho`: tamanho do arquivo em bytes.
- `criado_em`: timestamp da data de criação do arquivo no sistema de arquivos.
- `recebido_em`: timestamp do momento em que o agente ingeriu ou capturou o arquivo.

**Por quê:** isso separa claramente a lógica de acionamento (`condicao`) da classificação efetiva (`tipo`), enquanto mantém metadados necessários para filtrar e auditar os documentos.

---

## Uso de `condicao`

**Decisão:** `condicao` deve continuar sendo o texto lógico que decide quando a regra aplica.

**Por quê:** `condicao` tem papel de gatilho, e a expressão de texto como `especificação & especificação` deve permanecer no nível de regra. Isso evita que a lógica de classificação seja misturada com atributos de metadados.

---

## Uso de `inName`

**Decisão:** o campo `inName` é verdadeiro quando o termo da regra aparece em qualquer parte do nome do arquivo.

**Por quê:** nomes de arquivo são a pista mais robusta disponível no agente para capturar documentos sem depender de conteúdo extra ou OCR. O agente deve usar essa informação para reforçar a classificação.

---

## Extensão como filtro primário

**Decisão:** `extensao` deve ser armazenado e usado tanto para validação quanto para regras específicas de formato.

**Por quê:** formatos diferentes têm comportamentos diferentes e permitem segmentar processamentos. Por exemplo, somente `pdf` pode ser tratado como contrato ou nota fiscal, enquanto `jpg` pode ser tratado como comprovante de imagem.

---

## Timestamps de arquivo

**Decisão:** manter `criado_em` separado de `recebido_em`.

**Por quê:** arquivos podem ser gerados em um momento e ingressos no sistema em outro. Ter os dois timestamps permite entender se houve atraso e preservar o histórico real do documento.

---

## Resultado esperado

**Decisão:** o agente deve produzir metadados completos para cada documento e usar `tipo` ao compor o nome do arquivo processado.

**Por quê:** isso torna o fluxo previsível, permite rastreamento por tipo e garante que a automação entregue documentos classificados e renomeados conforme esperado.

---

## Evolução futura

**Decisão:** se houver necessidade de múltiplos tipos por regra, evoluir para um campo estruturado como `tipos_documento` ao invés de embutir essa lógica em `condicao`.

**Por quê:** manter a modelagem declarativa e simples evita complexidade futura e facilita a validação de regras.
