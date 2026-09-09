# Fixtures de resposta do eSocial (Produção Restrita)

XMLs anonimizados para testes unitários do parser (`esocial-resposta.util.test.js`).

Atualize a partir de respostas reais após `npm run test:esocial-gov` (opt-in).

**Não commitar** certificados `.pfx` — use variáveis de ambiente:

- `ESOCIAL_GOV_INTEGRATION=1`
- `ESOCIAL_TEST_PFX_PATH`
- `ESOCIAL_TEST_PFX_PASSWORD`
- `ESOCIAL_TEST_CNPJ` (opcional, CNPJ do empregador na PR)
