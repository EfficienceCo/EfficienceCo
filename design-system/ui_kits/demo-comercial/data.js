"use strict";
/* ============================================================================
   EFFICIENCE CO — Demo Comercial Interativo — DADOS
   Clientes, navegação e o catálogo de 42 automações (todas "Disponível").
   Nesta rodada, TODAS as automações viraram bespoke — cada uma com interação
   própria, definida por sua ficha em efficience-vault/automacoes/*.md, seção
   "Especificação de interface". Os dados de tabela/estado de cada automação
   vivem junto da sua função de render em app.js (mesmo padrão das 4 bespoke
   originais), não aqui — este arquivo só guarda o catálogo (id/área/ícone/
   nome/descrição) usado pelos cards e pelo cabeçalho de cada tela.
   ============================================================================ */

/* ---------- data: clientes ---------- */
var CLIENTES = [
  { id:'padaria', nome:'Padaria do João Ltda', cnpj:'12.345.678/0001-99', regime:'Simples Nacional — Anexo I', func:5 },
  { id:'oficina', nome:'Oficina Silva ME', cnpj:'98.765.432/0001-11', regime:'Simples Nacional — Anexo III', func:3 },
  { id:'clinica', nome:'Clínica Rosa S/S', cnpj:'11.222.333/0001-44', regime:'Lucro Presumido', func:8 },
  { id:'transportes', nome:'Transportes Veloz ME', cnpj:'33.444.555/0001-66', regime:'Simples Nacional — Anexo III', func:4 },
  { id:'mercado', nome:'Mercado Bom Preço Ltda', cnpj:'55.666.777/0001-22', regime:'Simples Nacional — Anexo I', func:6 }
];

/* ---------- data: navigation ---------- */
var NAV_TOP = [ {key:'dashboard',label:'Dashboard',ic:'dashboard'}, {key:'logs',label:'Logs do agente',ic:'logs'}, {key:'roi',label:'Efficience',ic:'bolt'} ];
var NAV_AREAS = [ {key:'fiscal',label:'Fiscal',ic:'fiscal'}, {key:'contabil',label:'Contábil',ic:'contabil'}, {key:'dp',label:'DP',ic:'dp'}, {key:'societario',label:'Societário',ic:'societario'}, {key:'financeiro',label:'Financeiro',ic:'financeiro'}, {key:'atendimento',label:'Atendimento',ic:'atendimento'} ];
var NAV_OP = [ {key:'obrigacoes',label:'Obrigações',ic:'obrigacoes'}, {key:'processos',label:'Processos',ic:'processos'}, {key:'regras',label:'Regras',ic:'regras'} ];
var NAV_GESTAO = [ {key:'usuarios',label:'Usuários',ic:'usuarios'}, {key:'admin',label:'Clientes',ic:'clientes'} ];

var TITLES = { dashboard:'Dashboard', roi:'Efficience', obrigacoes:'Obrigações', processos:'Processos', logs:'Logs do agente', regras:'Regras', usuarios:'Usuários', admin:'Clientes',
  fiscal:'Fiscal', contabil:'Contábil', dp:'DP', societario:'Societário', financeiro:'Financeiro', atendimento:'Atendimento' };
var AREA_LABEL = { fiscal:'Fiscal', contabil:'Contábil', dp:'DP', societario:'Societário', financeiro:'Financeiro', atendimento:'Atendimento' };
var AREA_SUB = {
  fiscal:'Automações tributárias e de escrituração fiscal.',
  contabil:'Automações de conciliação e fechamento contábil.',
  dp:'Automações de departamento pessoal e folha de pagamento.',
  societario:'Automações de constituição, alteração e regularização de empresas.',
  financeiro:'Automações financeiras do próprio escritório.',
  atendimento:'Automações de relacionamento e comunicação com o cliente.'
};

/* ---------- data: catálogo de automações (42, todas "Disponível") ---------- */
var AUTOMACOES = [
  /* ---- Fiscal (12) ---- */
  { id:'escrituracao-nfe', area:'fiscal', ic:'documento', nome:'Escrituração NF-e', desc:'Lê os XMLs de NF-e recebidos e gera o lançamento fiscal automaticamente, sem digitação manual — a base de dados que alimenta apuração, SPED e retenções.', tipo:'bespoke' },
  { id:'apuracao-simples', area:'fiscal', ic:'calculadora', nome:'Apuração Simples Nacional', desc:'Todo mês no Simples Nacional é um único boleto — o DAS — que substitui até 8 impostos. O cálculo depende do RBT12 (receita dos últimos 12 meses) e do Anexo certo para a atividade; o agente recalcula a alíquota efetiva automaticamente a cada novo lançamento.', tipo:'bespoke' },
  { id:'apuracao-presumido', area:'fiscal', ic:'calculadora', nome:'Apuração Lucro Presumido/Real', desc:'No Lucro Presumido cada imposto tem regra própria — IRPJ e CSLL trimestrais sobre margem presumida, PIS/COFINS mensais sobre a receita bruta, ISS municipal e ICMS por NCM. O agente consolida os 4 a 6 cálculos numa única apuração por trimestre, hoje aplicada à Clínica Rosa.', tipo:'bespoke' },
  { id:'emissao-das-darf', area:'fiscal', ic:'guia', nome:'Emissão de Guias (DAS/DARF)', desc:'Depois de apurado, todo imposto precisa virar um boleto de verdade — com código de barras, vencimento e os dados do contribuinte. O agente gera a guia por transformação direta do valor já apurado, sem digitar o número de novo em nenhum sistema do governo.', tipo:'bespoke' },
  { id:'retencoes-fonte', area:'fiscal', ic:'cifrao', nome:'Retenções na fonte', desc:'Quando uma nota de serviço tem retenção — IRRF acima de R$ 6.000, INSS de cessão de mão de obra (11%) ou ISS retido — o valor precisa ser calculado e recolhido no prazo certo. O agente identifica a retenção direto no XML da nota e já calcula o valor retido.', tipo:'bespoke' },
  { id:'revisao-nfe', area:'fiscal', ic:'lupa', nome:'Revisão NF-e', desc:'Quando o cliente emite a própria nota, erros de CFOP, NCM ou alíquota passam despercebidos até o fechamento do mês. O agente valida cada nota assim que ela chega e sinaliza inconsistências dentro da janela real de 24h de cancelamento.', tipo:'bespoke' },
  { id:'ncm-cfop', area:'fiscal', ic:'etiqueta', nome:'Classificação NCM/CFOP', desc:'CFOP e NCM não são digitados livremente — são códigos de tabelas oficiais que determinam o imposto devido, e um código errado muda o cálculo inteiro. O agente aprende com o histórico de cada cliente e sugere o código certo com um nível de confiança.', tipo:'bespoke' },
  { id:'sped-fiscal', area:'fiscal', ic:'pasta', nome:'SPED Fiscal', desc:'O SPED Fiscal consolida, mês a mês, todas as notas de entrada e saída do cliente num arquivo estruturado transmitido ao Fisco estadual. Como as notas já chegam classificadas pela escrituração automática, o SPED sai por transformação direta em 3 fases — gerar, validar, transmitir.', tipo:'bespoke' },
  { id:'efd-contribuicoes', area:'fiscal', ic:'pasta', nome:'EFD-Contribuições', desc:'A EFD-Contribuições declara mensalmente à Receita os créditos e débitos de PIS/COFINS apurados sobre receitas e despesas. Os valores já saem calculados da escrituração fiscal — o agente só precisa montar o arquivo no layout oficial.', tipo:'bespoke' },
  { id:'dctf-web', area:'fiscal', ic:'transmissao', nome:'DCTF/DCTFWeb', desc:'A DCTF é a conferência final: declara à Receita todos os tributos federais já apurados e pagos no período. Como cada valor já foi calculado em outra automação, gerar a DCTF é reconciliar números que o sistema já sabe — não recalcular do zero.', tipo:'bespoke' },
  { id:'efd-reinf', area:'fiscal', ic:'transmissao', nome:'EFD-Reinf', desc:'A EFD-Reinf declara mensalmente as retenções que não passam pela folha — principalmente INSS retido em serviços de cessão de mão de obra. O agente reaproveita o cálculo de retenções já feito e monta o evento no schema oficial, sem levantar o dado de novo.', tipo:'bespoke' },
  { id:'alerta-aliquota', area:'fiscal', ic:'sino', nome:'Alerta de alíquota', desc:'Tabelas de imposto mudam — Simples Nacional, ISS municipal, ICMS estadual — e quando o sistema segue com a alíquota antiga, todo cálculo posterior fica errado sem ninguém perceber. O agente monitora as fontes oficiais e avisa quais clientes são impactados; a leitura da norma continua humana.', tipo:'bespoke' },

  /* ---- Contábil (6) ---- */
  { id:'conciliacao-bancaria', area:'contabil', ic:'transmissao', nome:'Conciliação bancária', desc:'Importa o extrato OFX e concilia automaticamente com os lançamentos internos, deixando só os casos duvidosos para revisão humana.', tipo:'bespoke' },
  { id:'balancete-mensal', area:'contabil', ic:'calendario', nome:'Balancete mensal', desc:'O balancete fecha, mês a mês, todos os saldos contábeis — ativo, passivo, receitas e despesas — antes de virar DRE ou relatório gerencial. O agente exporta e formata automaticamente, destacando variações relevantes contra o mês anterior.', tipo:'bespoke' },
  { id:'relatorios-gerenciais', area:'contabil', ic:'grafico', nome:'Relatórios gerenciais', desc:'A maioria dos escritórios só manda boleto e uma DRE crua em Excel — o cliente não entende se está ganhando ou perdendo dinheiro. O agente gera um relatório gerencial em linguagem simples e envia sozinho na data configurada.', tipo:'bespoke' },
  { id:'depreciacao', area:'contabil', ic:'grafico', nome:'Depreciação de ativos', desc:'Ativo comprado não vira despesa de uma vez — a Receita define uma taxa anual por tipo de bem e o valor é diluído mês a mês. O agente calcula a parcela de cada ativo automaticamente e alerta quando ele termina de depreciar.', tipo:'bespoke' },
  { id:'conciliacao-contas', area:'contabil', ic:'documento', nome:'Conciliação de contas contábeis', desc:'Além do extrato bancário, outras contas também precisam bater: fornecedores, clientes a receber, estoque. O agente cruza o saldo contábil com o saldo auxiliar de cada conta e aponta a divergência exata, sem exportar planilha nenhuma.', tipo:'bespoke' },
  { id:'encerramento-exercicio', area:'contabil', ic:'pasta', nome:'Encerramento de exercício', desc:'Fechar o exercício depende do razão completo e de julgamento contábil — isso continua no sistema do escritório. O que o agente organiza é o processo: checklist por cliente, prazos, e os relatórios de apoio já prontos para conferência.', tipo:'bespoke' },

  /* ---- DP (9) ---- */
  { id:'folha-pagamento', area:'dp', ic:'comprovante', nome:'Folha de pagamento', desc:'Processa a planilha da folha e calcula INSS, IRRF e FGTS por funcionário, com status de processamento por cliente.', tipo:'bespoke' },
  { id:'ferias', area:'dp', ic:'calendario', nome:'Férias', desc:'Cada funcionário tem 30 dias de férias por período aquisitivo, e o aviso precisa sair com 30 dias de antecedência — perder o prazo gera férias em dobro. O agente acompanha o período de cada um numa régua de tempo e alerta antes de virar passivo trabalhista.', tipo:'bespoke' },
  { id:'decimo-terceiro', area:'dp', ic:'cifrao', nome:'13º salário', desc:'O 13º sai em duas parcelas obrigatórias — 1ª até novembro, 2ª até 20 de dezembro — e esquecer a segunda gera multa de 50% sobre o valor. O agente calcula as duas parcelas de cada funcionário com base na folha e alerta antes de cada vencimento.', tipo:'bespoke' },
  { id:'esocial', area:'dp', ic:'transmissao', nome:'eSocial', desc:'Cada evento na vida do funcionário — admissão, afastamento, desligamento — precisa virar um XML validado pelo schema oficial e enviado no prazo certo, ou a multa é automática. O agente valida cada campo em tempo real, antes mesmo de tentar enviar.', tipo:'bespoke' },
  { id:'atestados', area:'dp', ic:'cruzmedica', nome:'Atestados e afastamentos', desc:'Atestado acima de 15 dias muda quem paga o funcionário — do 16º dia em diante o INSS assume, e o evento S-2230 precisa ser enviado ao eSocial. O agente lê a duração do atestado, calcula a data de corte e já prepara o envio.', tipo:'bespoke' },
  { id:'fgts-inss', area:'dp', ic:'guia', nome:'FGTS/GRF/INSS', desc:'FGTS (8% do salário) e INSS patronal vencem todo dia 20, e gerar as guias significa abrir o sistema do governo e digitar de novo os mesmos dados já calculados na folha. O agente gera GRF e GPS já preenchidas assim que a folha fecha.', tipo:'bespoke' },
  { id:'horas-extras', area:'dp', ic:'relogio', nome:'Horas extras', desc:'Hora extra, adicional noturno, insalubridade e periculosidade mudam o custo da folha — e o erro mais comum é simplesmente não aplicar o adicional certo. O agente lê o relatório de ponto do cliente e calcula os percentuais legais automaticamente.', tipo:'bespoke' },
  { id:'vt-vr', area:'dp', ic:'onibus', nome:'Vale-transporte/VR', desc:'O vale-transporte tem desconto máximo de 6% do salário e o vale-refeição é benefício negociado — cada um com cálculo próprio, funcionário por funcionário. O agente calcula os dois valores e já gera o arquivo de recarga para a operadora.', tipo:'bespoke' },
  { id:'admissao-funcionario', area:'dp', ic:'entrada', nome:'Admissão de funcionário', desc:'Admitir alguém exige contrato, envio do eSocial S-2200 antes do início das atividades, coleta de documentos e agendamento do exame admissional. Sem o eSocial enviado a tempo, a empresa fica irregular — multa de R$ 402 a R$ 3.048 por funcionário.', tipo:'bespoke' },

  /* ---- Societário (7) ---- */
  { id:'abertura-empresa', area:'societario', ic:'predio', nome:'Abertura de empresa', desc:'Checklist de progresso da abertura — algumas etapas rodam automaticamente, outras aguardam órgãos externos.', tipo:'bespoke' },
  { id:'alteracao-contratual', area:'societario', ic:'documento', nome:'Alteração contratual', desc:'Mudar sócio, capital ou atividade é um processo quase tão burocrático quanto abrir empresa. O agente gera a minuta de alteração e conduz o checklist por tipo de mudança, mostrando exatamente o que muda no contrato — não um checklist genérico.', tipo:'bespoke' },
  { id:'baixa-empresa', area:'societario', ic:'predio', nome:'Baixa de empresa', desc:'Encerrar uma empresa exige quitar débitos, entregar a declaração final e arquivar o distrato — sem controle, o sócio só descobre meses depois que a empresa "fechada" ainda gera obrigação. O agente monta o checklist certo por regime tributário e tipo de empresa.', tipo:'bespoke' },
  { id:'alvaras-licencas', area:'societario', ic:'selo', nome:'Alvarás e licenças', desc:'Alvará de funcionamento, licença sanitária, ambiental — cada um com validade, órgão e checklist de renovação diferentes. O agente agrupa por urgência de vencimento e abre o checklist certo para cada tipo de licença.', tipo:'bespoke' },
  { id:'certificado-digital', area:'societario', ic:'escudo', nome:'Certificado digital', desc:'O certificado digital dá acesso ao e-CAC — e quando vence, o escritório perde o acesso ao portal do cliente bem na hora de transmitir algo. O agente mostra o tempo restante como o dado principal e ramifica a renovação conforme o tipo de certificado.', tipo:'bespoke' },
  { id:'procuracoes', area:'societario', ic:'assinatura', nome:'Procurações e-CAC/Gov.br', desc:'Agir em nome do cliente exige procuração eletrônica outorgada pelo próprio sócio — um processo simples, mas que o cliente não sabe fazer sozinho. O agente gera um guia passo a passo visual para o cliente seguir sem precisar ligar para o escritório.', tipo:'bespoke' },
  { id:'regularizacao-cadastral', area:'societario', ic:'ciclo', nome:'Regularização cadastral', desc:'Telefone, e-mail ou CNAE secundário desatualizado no cadastro da Receita costuma ficar esquecido por ser "mais simples" que uma alteração contratual — até travar a emissão de notas. O agente resolve em 3 cliques, sem processo formal com etapas.', tipo:'bespoke' },

  /* ---- Financeiro (5) ---- */
  { id:'honorarios-boletos', area:'financeiro', ic:'comprovante', nome:'Honorários e boletos', desc:'Um escritório com 50 clientes emite 50 boletos por mês — na mão, isso são 4 a 6 horas por mês só de gestão financeira interna. O agente dispara a emissão em lote no dia configurado, e atualiza o status assim que o banco confirma o pagamento.', tipo:'bespoke' },
  { id:'cobranca-inadimplentes', area:'financeiro', ic:'telefone', nome:'Cobrança de inadimplentes', desc:'Cobrar cliente inadimplente é desconfortável quando existe relação pessoal — por isso muitas vezes ninguém cobra. O agente conduz a régua sozinho, do aviso à escalada, numa linha do tempo por cliente.', tipo:'bespoke' },
  { id:'reajuste-honorarios', area:'financeiro', ic:'grafico', nome:'Reajuste de honorários', desc:'Reajustar honorários pela inflação todo ano evita ficar com valor defasado — mas é constrangedor lembrar disso cliente por cliente. O agente simula o reajuste pelo índice escolhido numa grade editável, pronta para ajuste fino antes de confirmar.', tipo:'bespoke' },
  { id:'renovacao-contratos', area:'financeiro', ic:'documento', nome:'Renovação de contratos', desc:'Contrato sem atualização vira risco jurídico — cliente que já mudou de porte, serviço ou valor mas continua com o instrumento antigo. O agente compara o contrato atual com o renovado ao vivo, conforme o índice escolhido.', tipo:'bespoke' },
  { id:'folha-interna', area:'financeiro', ic:'pessoa', nome:'Folha interna', desc:'A folha do próprio escritório — sócios e equipe interna — segue a mesma lógica de qualquer folha de cliente. O agente processa automaticamente todo mês, sem depender de uma planilha separada.', tipo:'bespoke' },

  /* ---- Atendimento (3) ---- */
  { id:'cobranca-doc', area:'atendimento', ic:'envelope', nome:'Cobrança de doc pendente', desc:'Para fechar folha, emitir guias e transmitir declarações, o contador depende de documentos do cliente — e o cliente esquece. O agente mostra o que falta agora, por cliente e por documento, e cobra sozinho até o item chegar.', tipo:'bespoke' },
  { id:'relatorios-periodicos', area:'atendimento', ic:'grafico', nome:'Relatórios periódicos', desc:'Cada cliente recebe um pacote de relatórios com frequência própria — mensal, quinzenal — e esquecer de configurar ou enviar um deles só aparece quando o cliente reclama. O agente dispara o pacote configurado na data certa.', tipo:'bespoke' },
  { id:'onboarding-clientes', area:'atendimento', ic:'clientes', nome:'Onboarding de clientes', desc:'Quando um cliente já existente migra de outro contador, é preciso coletar histórico, obter procurações e levantar pendências deixadas pelo contador anterior. O agente cria a estrutura e o checklist — e o cliente acompanha o progresso por um link simplificado.', tipo:'bespoke' }
];
var AUT_BY_ID = {}; AUTOMACOES.forEach(function(a){ AUT_BY_ID[a.id]=a; });
var AUT_BY_AREA = {}; AUTOMACOES.forEach(function(a){ (AUT_BY_AREA[a.area]=AUT_BY_AREA[a.area]||[]).push(a); });
