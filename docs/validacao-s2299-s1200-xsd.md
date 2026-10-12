# Validação manual do S-2299 e do S-1200 contra o XSD oficial

Validação executada em 12 de outubro de 2026 para a issue #648, com o mesmo
método de [validacao-s2200-xsd.md](validacao-s2200-xsd.md). O código não
carrega XSD nem faz essa validação em produção.

## Fontes

Portal oficial: <https://www.gov.br/esocial/pt-br/documentacao-tecnica>

| Pacote (leiaute S-1.3) | Versão | Produção em | SHA-256 |
|---|---|---|---|
| `2026-04-27_esquemas_xsd_v_s_01_03_00.zip` | até NT 06/2026 | 27/04/2026 | `2D057BCDCB58982F39194E2DB264141EE8CB18F92DB29D76CBCCEEC98A44A0F0` |
| `2026-07-01_esquemas_xsd_v_s_01_03_00.zip` | até NT 06/2026 (CNPJ alfanumérico) | 01/07/2026 | `32535DBA33D0470CF44AFCE410840AF450028FD32D3DDF9123F601C45CF9AF8E` |
| `2026-10-26_esquemas_xsd_v_s_01_03_00-1.zip` | até NT 07/2026 rev. 24/09/2026 | 26/10/2026 | `AC8B5CD165CD6707D9B2C176B9C31C1F8EBEEB31C8F6490811F54C7510624557` |

O prefixo de data no nome de cada pacote é a data em que ele entra em
produção, não a data de publicação. O terceiro pacote já está publicado no
portal (NT 07/2026 rev. 24/09/2026), listado como "produção em 26/10/2026", e
foi baixado em 12/10/2026 junto com os outros dois. Os três hashes foram
recalculados no dia da validação.

Os dois primeiros são os mesmos do #406. Os arquivos usados foram
`evtDeslig.xsd`, `evtRemun.xsd`, `tipos.xsd` e `xmldsig-core-schema.xsd`,
extraídos sem alteração.

Diferenças entre pacotes que afetam estes eventos: em outubro, `dtDeslig`
passou a usar `TS_dt1890` e `mudancaCPF` ganhou `indCPFDesvinc`, que é opcional.
No S-1200 só mudou a lista de regras da anotação. O gerador é compatível com os
três pacotes.

## Método e resultado

Foram gerados 10 documentos com `gerarXmlS2299` e `gerarXmlS1200`:

- **S-2299:** CLT completo, com aviso prévio indenizado, pensão por percentual
  e valor, processo trabalhista, PDV, observação, verbas rescisórias e
  quarentena; intermitente (codCateg 111, com `infoInterm`); sucessão (motivo
  11); transferência de titularidade de doméstico (motivo 34); mudança de CPF
  (motivo 36); estatutário (sem pensão e sem verbas).
- **S-1200:** mensal de empregado (101); anual/13º (`perApur` = `AAAA`);
  intermitente com `infoComplem`, CNO e `qtdDiasAv`; contribuinte individual
  (701) com `infoComplCont`, mais um demonstrativo 4XX sem `infoAgNocivo`.

Cada documento foi lido por `System.Xml.Schema.XmlSchemaSet` contra os três
pacotes, resultando em **30 validações sem erro**. Para provar que o validador
de fato aplicava o schema, dois controles negativos foram incluídos: um
elemento inexistente em `infoDeslig` e `indApuracao=9`. Os dois foram
rejeitados nos três pacotes (6 de 6 rejeições esperadas).

Como no S-2200, o envelope exige `ds:Signature`, então uma assinatura sintética
bem formada foi anexada somente às cópias submetidas ao XSD. Este resultado não
valida assinatura digital, mTLS, recepção pelo eSocial nem regras que dependem
do RET, do S-1000 ou do S-1010.

## Regras das anotações aplicadas no gerador

O validador estrutural não executa as anotações `CONDICAO_GRUPO`/`Validação`.
As que dependem só do próprio evento são aplicadas pelo gerador e cobertas por
`backend/tests/esocial-xml-s2299-s1200.test.js`:

- **S-2299:** `dtProjFimAPI` obrigatória se `indPagtoAPI=S` e ≥ `dtDeslig`;
  `dtAvPrv` ≤ `dtDeslig`; `pensAlim` obrigatório e exclusivo para
  `tpRegTrab=1`; `percAliment`/`vrAlim` conforme o tipo; `nrProcTrab` com 20
  dígitos; `indPDV` proibido nos motivos 10, 11, 12, 13, 28, 29, 30, 34, 36,
  37, 40, 43 e 44; `sucessaoVinc`, `transfTit` e `mudancaCPF` amarrados ao
  motivo; `verbasResc` proibido para estatutário e nos motivos sem verbas;
  `infoInterm` exigido para codCateg 111; `indRemun` obrigatório a partir de
  2023-01-16.
- **S-1200:** formato de `perApur` por `indApuracao`; `infoInterm` para 111 em
  apuração mensal; `infoAgNocivo` obrigatório para 1XX/2XX/3XX/731/734/738,
  opcional para 4XX e proibido nos demais.
- **Ambos:** `indApurIR` obrigatório e exclusivo a partir de 2021-07 (ou 2021,
  no anual); `vrRubr`/`qtdRubr`/`fatorRubr` > 0; `ideDmDev` único;
  cardinalidades máximas dos grupos.

## Fora do escopo desta versão

- **S-2299:** `infoPerAnt`, `infoRRA`, `procJudTrab`, `infoMV`, `procCS` e
  `infoSimples` em `verbasResc`, além de `consigFGTS` e `descFolha`.
- **S-1200:** `infoPerAnt`, `infoRRA`, `infoMV`, `procJudTrab`, `sucessaoVinc`
  e `descFolha`.
- **Folha → S-1200:** a folha do sistema ainda não tem tabela de rubricas
  (S-1010). Por isso as rubricas entram prontas em `dadosFormulario` e não há
  mapeamento automático do fechamento.
- **Wizard:** o frontend só tem o formulário do S-2200. `geradorDisponivel`
  continua `false` para S-2299 e S-1200 até existir um formulário para cada um.
- **CNPJ alfanumérico:** mesma limitação registrada no #406.
