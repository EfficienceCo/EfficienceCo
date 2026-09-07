# Validação manual do S-2200 contra o XSD oficial

Validação executada em 6 de setembro de 2026 para a issue #406. O código não
carrega XSD nem faz essa validação em produção.

## Fontes

- Portal oficial: <https://www.gov.br/esocial/pt-br/documentacao-tecnica>
- Pacote publicado em 27/04/2026, leiaute S-1.3 NT 06/2026:
  `2026-04-27_esquemas_xsd_v_s_01_03_00.zip`
  - SHA-256: `2D057BCDCB58982F39194E2DB264141EE8CB18F92DB29D76CBCCEEC98A44A0F0`
- Pacote republicado em 01/07/2026, leiaute S-1.3 NT 06/2026 e CNPJ
  alfanumérico:
  `2026-07-01_esquemas_xsd_v_s_01_03_00.zip`
  - SHA-256: `32535DBA33D0470CF44AFCE410840AF450028FD32D3DDF9123F601C45CF9AF8E`

Os arquivos usados foram `evtAdmissao.xsd`, `tipos.xsd` e
`xmldsig-core-schema.xsd`, extraídos sem alteração de cada pacote.

## Método e resultado

Foram gerados quatro documentos com `gerarXmlS2200`: empregado CLT da
categoria 101, aprendiz da categoria 103, estatutário da categoria 301 e CLT
com função. Cada documento foi lido por `System.Xml.Schema.XmlSchemaSet`
contra os dois pacotes oficiais, resultando em 8 validações sem erro.

A primeira execução sobre o conteúdo original da PR falhou nos três casos
celetistas. O XSD esperava `indAdmissao` antes de `tpRegJor`; depois desse campo,
também exigiu `cnpjSindCategProf`. Ambos estavam ausentes do XML e eram
opcionais no formulário. A correção passou a exigir e serializar os dois campos.

A anotação oficial de `nrProcTrab` também foi aplicada: o número de processo
com 20 dígitos é obrigatório e exclusivo quando `indAdmissao=3` (decisão
judicial). As regras condicionais descritas em anotações, como essa e a do
grupo FGTS, são testadas pelo gerador porque o validador estrutural do XSD não
as executa.

O envelope S-2200 exige `ds:Signature`. Para isolar a estrutura gerada nesta
checagem, foi anexada uma assinatura sintética bem formada somente às cópias
submetidas ao XSD. Portanto, este resultado não valida assinatura digital,
mTLS, recepção pelo eSocial ou regras externas ao XSD. Essas verificações
continuam reservadas à Produção Restrita.

## Limitação encontrada fora do escopo da issue

Os quatro cenários usam CNPJs numéricos. Isso comprova a compatibilidade desses
documentos com o pacote de julho, mas não comprova suporte ao novo identificador
alfanumérico. O gerador ainda usa `soDigitos()` para inscrições e a adaptação
correta envolve cadastro de clientes, validações, banco, integrações e formação
do ID do evento. Essa adequação deve ser tratada em uma task transversal antes
de processar uma empresa que tenha recebido CNPJ alfanumérico.
