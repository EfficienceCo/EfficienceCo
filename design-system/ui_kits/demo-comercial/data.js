"use strict";
/* ============================================================================
   EFFICIENCE CO — Demo Comercial Interativo — DADOS
   Puramente dados: clientes, navegação, e as 39 automações (7 bespoke + 32
   nos 4 templates genéricos, cada uma enriquecida com copy da ficha em
   efficience-vault/automacoes/ e um elemento visual extra — nota, footer de
   totais, ou resumo automático calculado pelo template em app.js).
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

/* ---------- data: 39 automações (todas "Disponível") ---------- */
/* Fonte de copy: efficience-vault/automacoes/*.md — seção "O que é (lado contábil)"
   para desc, seção "Spec visual" para estrutura/dados. 7 bespoke (Escrituração
   NF-e, Conciliação Bancária, Folha de Pagamento, Abertura de Empresa — já
   existiam; eSocial, Emissão de Guias e Cobrança de Documentação Pendente
   promovidas nesta rodada por peso comercial, ver README). As demais 32 usam
   os 4 templates genéricos com um reforço visual extra (nota / footer de
   totais / resumo automático). */
var AUTOMACOES = [
  /* ---- Fiscal (12) ---- */
  { id:'escrituracao-nfe', area:'fiscal', ic:'documento', nome:'Escrituração NF-e', desc:'Lê os XMLs de NF-e recebidos e gera o lançamento fiscal automaticamente, sem digitação manual — a base de dados que alimenta apuração, SPED e retenções.', tipo:'bespoke' },
  { id:'apuracao-simples', area:'fiscal', ic:'calculadora', nome:'Apuração Simples Nacional', desc:'Todo mês no Simples Nacional é um único boleto — o DAS — que substitui até 8 impostos. O cálculo depende do RBT12 (receita dos últimos 12 meses) e do Anexo certo para a atividade; o agente recalcula a alíquota efetiva automaticamente a cada novo lançamento.', tipo:'resumo',
    nota:'RBT12 = receita bruta acumulada dos últimos 12 meses, a base que muda todo mês. Empresas de serviço no Anexo V migram para o Anexo III (mais barato) quando o Fator R — folha ÷ RBT12 — passa de 28%.',
    kpis:[['Total apurado','R$ 4.983,00'],['Alíquota efetiva média','5,2%'],['Guias geradas','4']],
    cols:['Cliente','Anexo','Receita 12m','Alíquota efetiva','DAS gerado','Status'],
    rows:[['Padaria do João','Anexo I','R$ 412.000,00','4,50%','R$ 1.247,00','Emitida'],['Oficina Silva','Anexo III','R$ 198.500,00','6,20%','R$ 890,00','Emitida'],['Transportes Veloz','Anexo III','R$ 256.000,00','7,10%','R$ 1.680,00','Emitida'],['Mercado Bom Preço','Anexo I','R$ 388.000,00','4,80%','R$ 1.166,00','Pendente']] },
  { id:'apuracao-presumido', area:'fiscal', ic:'calculadora', nome:'Apuração Lucro Presumido/Real', desc:'No Lucro Presumido cada imposto tem regra própria — IRPJ e CSLL trimestrais sobre margem presumida, PIS/COFINS mensais sobre a receita bruta, ISS municipal e ICMS por NCM. O agente consolida os 4 a 6 cálculos numa única apuração por trimestre, hoje aplicada à Clínica Rosa.', tipo:'resumo',
    nota:'IRPJ leva adicional de 10% sobre a base trimestral que exceder R$ 60.000,00 — o cálculo mais fácil de esquecer na mão.',
    kpis:[['Base presumida (3º tri)','R$ 48.000,00'],['IRPJ apurado','R$ 3.240,00'],['CSLL apurada','R$ 1.944,00']],
    cols:['Trimestre','Base presumida','IRPJ','CSLL','PIS','COFINS','Status'],
    rows:[['1º tri/2026','R$ 42.000,00','R$ 2.835,00','R$ 1.701,00','R$ 273,00','R$ 1.260,00','Apurado'],['2º tri/2026','R$ 45.500,00','R$ 3.071,00','R$ 1.843,00','R$ 296,00','R$ 1.365,00','Apurado'],['3º tri/2026','R$ 48.000,00','R$ 3.240,00','R$ 1.944,00','R$ 312,00','R$ 1.440,00','Emitida']] },
  { id:'emissao-das-darf', area:'fiscal', ic:'guia', nome:'Emissão de Guias (DAS/DARF)', desc:'Depois de apurado, todo imposto precisa virar um boleto de verdade — com código de barras, vencimento e os dados do contribuinte. O agente gera a guia por transformação direta do valor já apurado, sem digitar o número de novo em nenhum sistema do governo.', tipo:'bespoke' },
  { id:'retencoes-fonte', area:'fiscal', ic:'cifrao', nome:'Retenções na fonte', desc:'Quando uma nota de serviço tem retenção — IRRF acima de R$ 6.000, INSS de cessão de mão de obra (11%) ou ISS retido — o valor precisa ser calculado e recolhido no prazo certo. O agente identifica a retenção direto no XML da nota e já calcula o valor retido.', tipo:'tabela',
    nota:'Errar a retenção gera autuação do tomador do serviço, não só do prestador — é responsabilidade solidária.',
    cols:['NF','Cliente','Tipo retenção','Base de cálculo','Alíquota','Valor retido'],
    rows:[['000891','Clínica Rosa','ISS','R$ 4.200,00','5%','R$ 210,00'],['004521','Transportes Veloz','IRRF','R$ 8.400,00','1,5%','R$ 126,00'],['000034','Clínica Rosa','INSS','R$ 3.100,00','11%','R$ 341,00'],['007654','Transportes Veloz','ISS','R$ 5.600,00','3%','R$ 168,00']],
    footer:[['Total retido no período','R$ 845,00']] },
  { id:'revisao-nfe', area:'fiscal', ic:'lupa', nome:'Revisão NF-e', desc:'Quando o cliente emite a própria nota, erros de CFOP, NCM ou alíquota passam despercebidos até o fechamento do mês. O agente valida cada nota assim que ela chega e sinaliza inconsistências antes que virem problema — enquanto ainda dá tempo de corrigir.', tipo:'tabela',
    nota:'Nota fiscal só pode ser cancelada em até 24h após a emissão — por isso a validação precisa ser imediata, não no fechamento.',
    cols:['NF','Cliente','Inconsistência encontrada','Status'],
    rows:[['000892','Mercado Bom Preço','CFOP divergente do cadastro','Corrigida automaticamente'],['004521','Padaria do João','Sem retenção esperada','Sem pendência'],['019872','Padaria do João','NCM desatualizado','Corrigida automaticamente'],['000034','Oficina Silva','Valor de ICMS zerado','Revisada']] },
  { id:'ncm-cfop', area:'fiscal', ic:'etiqueta', nome:'Classificação NCM/CFOP', desc:'CFOP e NCM não são digitados livremente — são códigos de tabelas oficiais que determinam o imposto devido, e um código errado muda o cálculo inteiro. O agente aprende com o histórico de cada cliente e sugere o código certo com nível de confiança.', tipo:'tabela',
    nota:'NCM classifica o produto (define ICMS/IPI aplicável); CFOP classifica a natureza da operação (venda, devolução, transferência...).',
    cols:['Item','Cliente','NCM sugerido','CFOP sugerido','Confiança'],
    rows:[['Farinha de trigo tipo 1','Padaria do João','1101.00.10','5102','98%'],['Óleo de motor 20W50','Oficina Silva','2710.19.32','5102','95%'],['Pneu 175/70 R13','Oficina Silva','4011.10.00','1102','91%'],['Embalagem plástica','Mercado Bom Preço','3923.21.00','1102','96%']] },
  { id:'sped-fiscal', area:'fiscal', ic:'pasta', nome:'SPED Fiscal', desc:'O SPED Fiscal consolida, mês a mês, todas as notas de entrada e saída do cliente num arquivo estruturado transmitido ao Fisco estadual. Como as notas já chegam classificadas pela escrituração automática, o SPED sai por transformação direta — sem digitar nada de novo.', tipo:'progresso',
    nota:'SPED = Sistema Público de Escrituração Digital — o "extrato" oficial de tudo que a empresa comprou e vendeu no período.',
    clientes:[['Padaria do João','Transmitido',100],['Oficina Silva','Transmitido',100],['Clínica Rosa','Validando',70],['Transportes Veloz','Transmitido',100],['Mercado Bom Preço','Gerando',40]] },
  { id:'efd-contribuicoes', area:'fiscal', ic:'pasta', nome:'EFD-Contribuições', desc:'A EFD-Contribuições declara mensalmente à Receita os créditos e débitos de PIS/COFINS apurados sobre receitas e despesas. Os valores já saem calculados da escrituração fiscal — o agente só precisa montar o arquivo no layout oficial.', tipo:'tabela',
    nota:'Prazo de entrega: até o 10º dia útil do 2º mês subsequente à competência.',
    cols:['Cliente','Competência','PIS apurado','COFINS apurado','Status'],
    rows:[['Padaria do João','Ago/2026','R$ 412,00','R$ 1.898,00','Transmitida'],['Oficina Silva','Ago/2026','R$ 198,50','R$ 913,00','Transmitida'],['Clínica Rosa','Ago/2026','R$ 312,00','R$ 1.440,00','Transmitida'],['Mercado Bom Preço','Ago/2026','R$ 388,00','R$ 1.786,00','Pendente']],
    footer:[['Total PIS apurado','R$ 1.310,50'],['Total COFINS apurado','R$ 6.037,00']] },
  { id:'dctf-web', area:'fiscal', ic:'transmissao', nome:'DCTF/DCTFWeb', desc:'A DCTF é a conferência final: declara à Receita todos os tributos federais já apurados e pagos no período. Como cada valor já foi calculado em outra automação, gerar a DCTF é reconciliar números que o sistema já sabe — não recalcular do zero.', tipo:'tabela',
    nota:'A DCTFWeb já nasce pré-preenchida com dados do eSocial e da EFD-Reinf — o sistema cruza os dois automaticamente.',
    cols:['Cliente','Competência','Tributos declarados','DARFs vinculados','Status'],
    rows:[['Clínica Rosa','Ago/2026','IRPJ + CSLL + PIS + COFINS','4 guias','Transmitida'],['Transportes Veloz','Ago/2026','PIS + COFINS','2 guias','Transmitida'],['Padaria do João','Ago/2026','INSS retido','1 guia','Transmitida']] },
  { id:'efd-reinf', area:'fiscal', ic:'transmissao', nome:'EFD-Reinf', desc:'A EFD-Reinf declara mensalmente as retenções que não passam pela folha — principalmente INSS retido em serviços de cessão de mão de obra. O agente reaproveita o cálculo de retenções já feito e monta o evento no schema oficial, sem levantar o dado de novo.', tipo:'tabela',
    nota:'Prazo de entrega: até o 15º dia do mês subsequente à competência.',
    cols:['Cliente','Evento','Competência','Status'],
    rows:[['Clínica Rosa','R-2010 Retenções tomadas','Ago/2026','Transmitido'],['Transportes Veloz','R-2010 Retenções tomadas','Ago/2026','Transmitido'],['Padaria do João','R-1000 Info do contribuinte','Ago/2026','Transmitido']] },
  { id:'alerta-aliquota', area:'fiscal', ic:'sino', nome:'Alerta de alíquota', desc:'Tabelas de imposto mudam — Simples Nacional, ISS municipal, ICMS estadual — e quando o sistema segue com a alíquota antiga, todo cálculo posterior fica errado sem ninguém perceber. O agente monitora as fontes oficiais e avisa quais clientes são impactados por cada mudança.', tipo:'log',
    nota:'A leitura da norma continua humana — o agente avisa que algo mudou, a interpretação e a autorização de atualizar a tabela são do contador.',
    entries:[['20/08','Simples Nacional — Anexo III','Sublimite de receita bruta atualizado para 2026 (impacta Oficina Silva e Transportes Veloz)','alerta'],['12/08','ISS município sede','Alíquota de serviços de saúde alterada de 3% para 3,5% (impacta Clínica Rosa)','alerta'],['05/08','ICMS estadual','Nova tabela de CFOP para farinha de trigo publicada (impacta Padaria do João)','info']] },

  /* ---- Contábil (6) ---- */
  { id:'conciliacao-bancaria', area:'contabil', ic:'transmissao', nome:'Conciliação bancária', desc:'Importa o extrato OFX e concilia automaticamente com os lançamentos internos, deixando só os casos duvidosos para revisão humana.', tipo:'bespoke' },
  { id:'balancete-mensal', area:'contabil', ic:'calendario', nome:'Balancete mensal', desc:'O balancete fecha, mês a mês, todos os saldos contábeis — ativo, passivo, receitas e despesas — antes de virar DRE ou relatório gerencial. O agente exporta e formata automaticamente, destacando variações relevantes contra o mês anterior.', tipo:'tabela',
    nota:'O balancete não vai ao Fisco — é a conferência interna que alimenta a DRE e o relatório gerencial do cliente.',
    cols:['Cliente','Competência','Saldo inicial','Movimento','Saldo final','Status'],
    rows:[['Padaria do João','Ago/2026','R$ 18.420,00','R$ 6.850,00','R$ 25.270,00','Fechado'],['Oficina Silva','Ago/2026','R$ 9.120,00','R$ 3.240,00','R$ 12.360,00','Fechado'],['Clínica Rosa','Ago/2026','R$ 41.800,00','R$ 12.100,00','R$ 53.900,00','Fechado'],['Mercado Bom Preço','Ago/2026','R$ 22.900,00','R$ 8.410,00','R$ 31.310,00','Em fechamento']],
    footer:[['Saldo final consolidado','R$ 122.840,00']] },
  { id:'relatorios-gerenciais', area:'contabil', ic:'grafico', nome:'Relatórios gerenciais', desc:'A maioria dos escritórios só manda boleto e uma DRE crua em Excel — o cliente não entende se está ganhando ou perdendo dinheiro. O agente gera um relatório gerencial em linguagem simples, com comparativo do mês anterior, e envia sozinho na data configurada.', tipo:'resumo',
    nota:'Enviado por e-mail automaticamente no fechamento do mês — o escritório vira parceiro estratégico, não só quem paga imposto.',
    kpis:[['Receita do mês (agregado)','R$ 187.400,00'],['Despesas do mês (agregado)','R$ 132.900,00'],['Resultado','R$ 54.500,00']],
    cols:['Cliente','Envio configurado','Último envio','Status'],
    rows:[['Padaria do João','Mensal — dia 5','05/08/2026','Enviado'],['Clínica Rosa','Mensal — dia 5','05/08/2026','Enviado'],['Transportes Veloz','Quinzenal','18/08/2026','Enviado'],['Mercado Bom Preço','Mensal — dia 5','—','Pendente']] },
  { id:'depreciacao', area:'contabil', ic:'grafico', nome:'Depreciação de ativos', desc:'Ativo comprado não vira despesa de uma vez — a Receita define uma taxa anual por tipo de bem (veículo, computador, imóvel) e o valor é diluído mês a mês. O agente calcula a parcela de cada ativo automaticamente e alerta quando ele termina de depreciar.', tipo:'tabela',
    nota:'Taxas de referência: veículo 20%/ano, computador 33%/ano, imóvel 4%/ano — a Receita define o percentual por tipo de bem.',
    cols:['Ativo','Cliente','Aquisição','Vida útil','Depreciação mensal','Valor residual'],
    rows:[['Forno industrial','Padaria do João','03/2023','10 anos','R$ 145,00','R$ 8.700,00'],['Elevador veicular','Oficina Silva','06/2021','8 anos','R$ 210,00','R$ 5.040,00'],['Caminhão 3/4','Transportes Veloz','01/2022','5 anos','R$ 890,00','R$ 21.360,00'],['Equipamento de raio-x','Clínica Rosa','09/2020','10 anos','R$ 680,00','R$ 40.800,00']],
    footer:[['Depreciação mensal total','R$ 1.925,00']] },
  { id:'conciliacao-contas', area:'contabil', ic:'documento', nome:'Conciliação de contas contábeis', desc:'Além do extrato bancário, outras contas também precisam bater: fornecedores, clientes a receber, estoque. O agente cruza o saldo contábil com o saldo auxiliar de cada conta e aponta a divergência exata, sem precisar exportar planilha nenhuma.', tipo:'tabela',
    nota:'Mesmo motor de matching (comparação linha a linha) usado na conciliação bancária, aplicado a outras contas do razão.',
    cols:['Conta','Cliente','Saldo contábil','Saldo auxiliar','Divergência','Status'],
    rows:[['Caixa','Padaria do João','R$ 3.240,00','R$ 3.240,00','R$ 0,00','Conciliada'],['Clientes a receber','Clínica Rosa','R$ 18.900,00','R$ 18.400,00','R$ 500,00','Divergente'],['Fornecedores','Mercado Bom Preço','R$ 9.120,00','R$ 9.120,00','R$ 0,00','Conciliada'],['Estoque','Oficina Silva','R$ 12.600,00','R$ 12.310,00','R$ 290,00','Divergente']],
    footer:[['Divergência total em aberto','R$ 790,00']] },
  { id:'encerramento-exercicio', area:'contabil', ic:'pasta', nome:'Encerramento de exercício', desc:'Fechar o exercício depende do razão completo e de julgamento contábil — isso continua no sistema do escritório. O que o agente organiza é o processo: checklist por cliente, prazos, e os relatórios de apoio (balancete, depreciação) já prontos para conferência.', tipo:'progresso',
    nota:'O cálculo do resultado (lucro ou prejuízo) continua no sistema contábil do escritório — o agente organiza o processo, não substitui o julgamento contábil.',
    clientes:[['Padaria do João','Concluído',100],['Oficina Silva','Concluído',100],['Clínica Rosa','Em apuração',60],['Transportes Veloz','Concluído',100],['Mercado Bom Preço','Não iniciado',0]] },

  /* ---- DP (8) ---- */
  { id:'folha-pagamento', area:'dp', ic:'comprovante', nome:'Folha de pagamento', desc:'Processa a planilha da folha e calcula INSS, IRRF e FGTS por funcionário, com status de processamento por cliente.', tipo:'bespoke' },
  { id:'ferias', area:'dp', ic:'calendario', nome:'Férias', desc:'Cada funcionário tem 30 dias de férias por período aquisitivo, e o aviso precisa sair com 30 dias de antecedência — perder o prazo gera férias em dobro. O agente calcula o vencimento de cada período automaticamente e alerta antes de virar passivo trabalhista.', tipo:'tabela',
    nota:'Passado 1 ano do fim do período aquisitivo sem conceder férias, o pagamento dobra — é o principal risco que a automação evita.',
    cols:['Funcionário','Cliente','Período aquisitivo','Vencimento','Dias disponíveis','Status'],
    rows:[['Marcos Ferreira','Padaria do João','15/08/25 – 14/08/26','14/08/2026','30','Programadas'],['Juliana Prado','Oficina Silva','01/03/25 – 28/02/26','28/02/2026','20','Pendente de aviso'],['Ricardo Alves','Transportes Veloz','10/06/25 – 09/06/26','09/06/2026','30','Programadas'],['Beatriz Souza','Clínica Rosa','22/01/25 – 21/01/26','21/01/2026','15','Pendente de aviso']] },
  { id:'decimo-terceiro', area:'dp', ic:'cifrao', nome:'13º salário', desc:'O 13º sai em duas parcelas obrigatórias — 1ª até novembro, 2ª até 20 de dezembro — e esquecer a segunda gera multa de 50% sobre o valor. O agente calcula as duas parcelas de cada funcionário com base na folha e alerta antes de cada vencimento.', tipo:'tabela',
    nota:'Multa por atraso na 2ª parcela: 50% do valor devido, além de juros — o tipo de erro caro que some com um alerta simples.',
    cols:['Cliente','Funcionários','1ª parcela','2ª parcela','Status'],
    rows:[['Padaria do João','5','R$ 6.200,00 (pago 28/11)','R$ 6.200,00 (prevista 20/12)','1ª parcela paga'],['Oficina Silva','3','R$ 3.900,00 (pago 28/11)','R$ 3.900,00 (prevista 20/12)','1ª parcela paga'],['Clínica Rosa','8','R$ 14.800,00 (pago 28/11)','R$ 14.800,00 (prevista 20/12)','1ª parcela paga'],['Transportes Veloz','4','R$ 5.100,00 (pago 28/11)','R$ 5.100,00 (prevista 20/12)','1ª parcela paga']],
    footer:[['Total 1ª parcela','R$ 30.000,00'],['Total 2ª parcela prevista','R$ 30.000,00']] },
  { id:'esocial', area:'dp', ic:'transmissao', nome:'eSocial', desc:'Cada evento na vida do funcionário — admissão, afastamento, desligamento — precisa virar um XML validado pelo schema oficial e enviado no prazo certo, ou a multa é automática. O agente lê um formulário simples, valida os campos e transmite sem o DP tocar em XML.', tipo:'bespoke' },
  { id:'atestados', area:'dp', ic:'cruzmedica', nome:'Atestados e afastamentos', desc:'Atestado acima de 15 dias muda quem paga o funcionário — do 16º dia em diante o INSS assume, e o evento S-2230 precisa ser enviado ao eSocial. O agente lê a duração do atestado, calcula a data de corte e já prepara o envio.', tipo:'tabela',
    nota:'Até 15 dias, o salário é pago pelo empregador; do 16º dia em diante, o INSS assume via auxílio-doença.',
    cols:['Funcionário','Cliente','CID','Período','Evento eSocial','Status'],
    rows:[['Juliana Prado','Oficina Silva','M54','10/08 – 12/08','S-2230 enviado','Registrado'],['Carlos Nunes','Clínica Rosa','J11','05/08 – 07/08','S-2230 enviado','Registrado'],['Fernanda Lima','Mercado Bom Preço','Z76','18/08 – 18/08','S-2230 enviado','Registrado']] },
  { id:'fgts-inss', area:'dp', ic:'guia', nome:'FGTS/GRF/INSS', desc:'FGTS (8% do salário) e INSS patronal vencem todo dia 20, e gerar as guias significa abrir o sistema do governo e digitar de novo os mesmos dados já calculados na folha. O agente gera GRF e GPS já preenchidas assim que a folha fecha.', tipo:'tabela',
    nota:'Alerta automático no dia 15 — 5 dias de folga antes do vencimento no dia 20.',
    cols:['Guia','Cliente','Competência','Vencimento','Valor','Status'],
    rows:[['GRF','Padaria do João','Ago/2026','07/09/2026','R$ 660,00','Gerada'],['GPS','Clínica Rosa','Ago/2026','20/09/2026','R$ 2.960,00','Gerada'],['GRF','Transportes Veloz','Ago/2026','07/09/2026','R$ 512,00','Gerada'],['GPS','Mercado Bom Preço','Ago/2026','20/09/2026','R$ 1.140,00','Pendente']],
    footer:[['Total de guias do período','R$ 5.272,00']] },
  { id:'horas-extras', area:'dp', ic:'relogio', nome:'Horas extras', desc:'Hora extra, adicional noturno, insalubridade e periculosidade mudam o custo da folha — e o erro mais comum é simplesmente não aplicar o adicional certo. O agente lê o relatório de ponto do cliente e calcula os percentuais legais automaticamente.', tipo:'tabela',
    nota:'50% sobre a hora normal em dias úteis, 100% em domingos e feriados — aplicado automaticamente conforme o dia da semana.',
    cols:['Funcionário','Cliente','Horas 50%','Horas 100%','Valor adicional','Status'],
    rows:[['Marcos Ferreira','Padaria do João','6h','0h','R$ 187,50','Calculado'],['Ricardo Alves','Transportes Veloz','12h','4h','R$ 620,00','Calculado'],['Ana Cordeiro','Oficina Silva','3h','0h','R$ 94,50','Calculado']],
    footer:[['Total de adicionais no mês','R$ 902,00']] },
  { id:'vt-vr', area:'dp', ic:'onibus', nome:'Vale-transporte/VR', desc:'O vale-transporte tem desconto máximo de 6% do salário e o vale-refeição é benefício negociado — cada um com cálculo próprio, funcionário por funcionário. O agente calcula os dois valores e já gera o arquivo de recarga para a operadora.', tipo:'tabela',
    nota:'Desconto de VT limitado a 6% do salário do funcionário — nunca mais que isso, mesmo se o custo real do transporte for maior.',
    cols:['Cliente','Funcionários','VT recarregado','VR recarregado','Status'],
    rows:[['Padaria do João','5','R$ 440,00','R$ 900,00','Recarregado'],['Oficina Silva','3','R$ 264,00','R$ 540,00','Recarregado'],['Clínica Rosa','8','R$ 704,00','R$ 1.440,00','Recarregado'],['Transportes Veloz','4','R$ 352,00','R$ 720,00','Recarregado']],
    footer:[['Total VT recarregado','R$ 1.760,00'],['Total VR recarregado','R$ 3.600,00']] },

  /* ---- Societário (6) ---- */
  { id:'abertura-empresa', area:'societario', ic:'predio', nome:'Abertura de empresa', desc:'Checklist de progresso da abertura — algumas etapas rodam automaticamente, outras aguardam órgãos externos.', tipo:'bespoke' },
  { id:'alteracao-contratual', area:'societario', ic:'documento', nome:'Alteração contratual', desc:'Mudar sócio, capital ou atividade é um processo quase tão burocrático quanto abrir empresa — e sem checklist, vive na cabeça do contador. O agente gera a minuta de alteração e conduz o checklist por tipo de mudança, reaproveitando o mesmo motor da abertura.', tipo:'progresso',
    nota:'Mesmo motor de checklist da abertura de empresa, adaptado ao tipo de alteração (sócio, capital, endereço, atividade).',
    clientes:[['Oficina Silva ME — mudança de endereço + nova atividade','Em andamento',50],['Transportes Veloz — inclusão de sócio','Concluída',100]] },
  { id:'baixa-empresa', area:'societario', ic:'predio', nome:'Baixa de empresa', desc:'Encerrar uma empresa exige quitar débitos, entregar a declaração final e arquivar o distrato — sem controle, o sócio só descobre meses depois que a empresa "fechada" ainda gera obrigação. O agente monta o checklist certo por regime tributário e tipo de empresa.', tipo:'progresso',
    nota:'Sem baixa formal registrada, obrigações do Simples Nacional continuam sendo geradas mesmo após a empresa parar de operar.',
    clientes:[['Doceria Estrela ME — encerramento de atividades','Concluída',100],['Mercadinho Aurora ME — encerramento de atividades','Em andamento',35]] },
  { id:'alvaras-licencas', area:'societario', ic:'selo', nome:'Alvarás e licenças', desc:'Alvará de funcionamento, licença sanitária, ambiental — cada um com validade própria, e operar vencido pode gerar autuação e até fechamento. O agente controla o vencimento de cada documento por cliente e alerta em 90, 30 e 0 dias.', tipo:'tabela',
    nota:'Alertas em 3 janelas — 90 dias antes (iniciar renovação), 30 dias (urgente) e no vencimento (crítico).',
    cols:['Licença','Cliente','Órgão','Vencimento','Status'],
    rows:[['Alvará de funcionamento','Padaria do João','Prefeitura Municipal','15/03/2027','Vigente'],['Licença sanitária','Padaria do João','Vigilância Sanitária','22/06/2027','Vigente'],['Alvará de funcionamento','Oficina Silva','Prefeitura Municipal','30/09/2026','Vence em 41 dias'],['Licença ambiental','Transportes Veloz','Órgão estadual de meio ambiente','10/01/2027','Vigente'],['Alvará sanitário','Clínica Rosa','Vigilância Sanitária','05/08/2026','Renovação em andamento']] },
  { id:'certificado-digital', area:'societario', ic:'escudo', nome:'Certificado digital', desc:'O certificado digital dá acesso ao e-CAC e valida documentos eletrônicos — e quando vence, o escritório perde o acesso ao portal do cliente bem na hora de transmitir algo. O agente alerta com antecedência suficiente para renovar sem sufoco.', tipo:'tabela',
    nota:'Renovação leva de 3 a 5 dias úteis — o alerta de 60 dias antes garante folga real, não corrida de última hora.',
    cols:['Cliente','Tipo','Validade','Status'],
    rows:[['Padaria do João','e-CNPJ A1','14/02/2027','Vigente'],['Oficina Silva','e-CNPJ A1','30/08/2026','Renovação iniciada'],['Clínica Rosa','e-CNPJ A3 (cartão)','19/11/2026','Vigente'],['Transportes Veloz','e-CNPJ A1','05/05/2027','Vigente'],['Mercado Bom Preço','e-CNPJ A1','22/12/2026','Vigente']] },
  { id:'procuracoes', area:'societario', ic:'assinatura', nome:'Procurações e-CAC/Gov.br', desc:'Agir em nome do cliente na Receita (e-CAC) ou no Gov.br exige procuração eletrônica outorgada pelo próprio sócio — um processo simples, mas que o cliente não sabe fazer sozinho. O agente gera o passo a passo personalizado e controla a validade de cada procuração.', tipo:'tabela',
    nota:'Sistemas diferentes exigem procurações diferentes — e-CAC (Receita Federal) e Gov.br (eSocial, Emprega) não se sobrepõem.',
    cols:['Cliente','Sistema','Validade','Status'],
    rows:[['Padaria do João','e-CAC Receita Federal','12/2027','Vigente'],['Oficina Silva','Gov.br','03/2027','Vigente'],['Clínica Rosa','e-CAC Receita Federal','07/2026','Renovação em andamento'],['Mercado Bom Preço','Gov.br','09/2027','Vigente']] },

  /* ---- Financeiro (5) ---- */
  { id:'honorarios-boletos', area:'financeiro', ic:'comprovante', nome:'Honorários e boletos', desc:'Um escritório com 50 clientes emite 50 boletos por mês — na mão, isso são 4 a 6 horas por mês só de gestão financeira interna. O agente gera e envia os boletos no dia configurado, e atualiza o status assim que o banco confirma o pagamento.', tipo:'tabela',
    nota:'Confirmação de pagamento via webhook bancário — o status muda sozinho, em tempo real, sem checar extrato manualmente.',
    cols:['Cliente','Competência','Valor','Vencimento','Status'],
    rows:[['Padaria do João','Ago/2026','R$ 890,00','10/08/2026','Pago'],['Oficina Silva','Ago/2026','R$ 650,00','10/08/2026','Pago'],['Clínica Rosa','Ago/2026','R$ 1.480,00','10/08/2026','Pago'],['Transportes Veloz','Ago/2026','R$ 720,00','10/08/2026','Atrasado'],['Mercado Bom Preço','Ago/2026','R$ 810,00','10/08/2026','Pendente']],
    footer:[['Total faturado no mês','R$ 4.550,00']] },
  { id:'cobranca-inadimplentes', area:'financeiro', ic:'telefone', nome:'Cobrança de inadimplentes', desc:'Cobrar cliente inadimplente é desconfortável quando existe relação pessoal — por isso muitas vezes ninguém cobra. O agente dispara a régua sozinho: aviso antes do vencimento, depois gentil, depois firme, e só então escala para o contador agir.', tipo:'log',
    nota:'Régua automática: D-3 aviso, D+1 cobrança leve, D+5 mensagem firme, D+10 escala para o contador ligar ou renegociar.',
    entries:[['19/08','Transportes Veloz','2º lembrete de honorários em atraso enviado por e-mail','alerta'],['12/08','Transportes Veloz','1º lembrete enviado por WhatsApp','info'],['20/08','Mercado Bom Preço','Boleto de agosto ainda não identificado como pago','info']] },
  { id:'reajuste-honorarios', area:'financeiro', ic:'grafico', nome:'Reajuste de honorários', desc:'Reajustar honorários pela inflação todo ano evita ficar com valor defasado — mas é constrangedor lembrar disso cliente por cliente, então muitos escritórios simplesmente não fazem. O agente simula o reajuste pelo índice configurado e deixa pronto para revisar e confirmar.', tipo:'tabela',
    nota:'Cada cliente pode ser ajustado individualmente antes de confirmar — desconto estratégico para quem cresceu, reajuste maior para outros.',
    cols:['Cliente','Índice','Valor atual','Valor reajustado','Vigência'],
    rows:[['Padaria do João','IGP-M (4,8%)','R$ 890,00','R$ 932,72','Jan/2027'],['Oficina Silva','IGP-M (4,8%)','R$ 650,00','R$ 681,20','Jan/2027'],['Clínica Rosa','IPCA (4,2%)','R$ 1.480,00','R$ 1.542,16','Jan/2027']],
    footer:[['Aumento total simulado','R$ 136,08 / mês']] },
  { id:'renovacao-contratos', area:'financeiro', ic:'documento', nome:'Renovação de contratos', desc:'Contrato sem atualização vira risco jurídico — cliente que já mudou de porte, serviço ou valor mas continua com o instrumento antigo. O agente alerta 90 dias antes do vencimento e já gera a minuta do aditivo quando há reajuste configurado.', tipo:'tabela',
    nota:'Sem aditivo formalizado, um reajuste aplicado no boleto pode ser contestado pelo cliente — a minuta sai pronta para assinar.',
    cols:['Cliente','Contrato','Vigência','Vencimento','Status'],
    rows:[['Padaria do João','Honorários mensais','12 meses','31/12/2026','Vigente'],['Oficina Silva','Honorários mensais','12 meses','30/11/2026','Vigente'],['Clínica Rosa','Honorários mensais','12 meses','15/09/2026','Renovação em andamento'],['Transportes Veloz','Honorários mensais','12 meses','28/02/2027','Vigente']] },
  { id:'folha-interna', area:'financeiro', ic:'pessoa', nome:'Folha interna', desc:'A folha do próprio escritório — sócios e equipe interna — segue a mesma lógica de qualquer folha de cliente: cálculo de INSS, IRRF e líquido por funcionário. O agente processa automaticamente todo mês, sem depender de uma planilha separada da folha dos clientes.', tipo:'tabela',
    nota:'Mesmo motor de cálculo usado na folha dos clientes, aplicado à equipe interna do escritório.',
    cols:['Funcionário','Cargo','Salário base','Descontos','Líquido','Status'],
    rows:[['João Silva','Sócio-administrador','R$ 8.500,00','R$ 1.700,00','R$ 6.800,00','Processada'],['Carla Mendes','Contadora','R$ 5.200,00','R$ 890,00','R$ 4.310,00','Processada'],['Marcos Tavares','Analista fiscal','R$ 3.800,00','R$ 590,00','R$ 3.210,00','Processada'],['Ana Paula Costa','Analista de DP','R$ 3.600,00','R$ 540,00','R$ 3.060,00','Processada']],
    footer:[['Total líquido da folha interna','R$ 17.380,00']] },

  /* ---- Atendimento (2) ---- */
  { id:'cobranca-doc', area:'atendimento', ic:'envelope', nome:'Cobrança de doc pendente', desc:'Para fechar folha, emitir guias e transmitir declarações, o contador depende de documentos do cliente — e o cliente esquece. No piloto, isso custava de 5 a 7 dias úteis por mês de espera. O agente cobra sozinho, por documento, até o item chegar.', tipo:'bespoke' },
  { id:'relatorios-periodicos', area:'atendimento', ic:'grafico', nome:'Relatórios periódicos', desc:'Cada cliente recebe um pacote de relatórios com frequência própria — mensal, quinzenal — e esquecer de configurar ou enviar um deles só aparece quando o cliente reclama. O agente dispara o pacote configurado na data certa e sinaliza quem ainda não tem envio configurado.', tipo:'tabela',
    nota:'Cliente sem pacote configurado nunca recebe relatório automaticamente — por isso aparece com badge de atenção até ser configurado.',
    cols:['Cliente','Pacote','Frequência','Próximo envio','Status'],
    rows:[['Padaria do João','DRE + fluxo de caixa','Mensal','05/09/2026','Configurado'],['Clínica Rosa','DRE + indicadores','Mensal','05/09/2026','Configurado'],['Transportes Veloz','DRE resumida','Quinzenal','22/08/2026','Configurado'],['Mercado Bom Preço','DRE + fluxo de caixa','Mensal','—','Não configurado']] }
];
var AUT_BY_ID = {}; AUTOMACOES.forEach(function(a){ AUT_BY_ID[a.id]=a; });
var AUT_BY_AREA = {}; AUTOMACOES.forEach(function(a){ (AUT_BY_AREA[a.area]=AUT_BY_AREA[a.area]||[]).push(a); });
