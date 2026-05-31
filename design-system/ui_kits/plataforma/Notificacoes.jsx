// Efficience Co — Central de Notificações
const { useState: useStateNt } = React;

const NOTIF_SEED = [
  { id: 1, tipo: 'warn', titulo: 'Obrigação vencendo', desc: 'DAS — Simples Nacional (Padaria do João) vence em 3 dias.', time: 'há 12 min', unread: true },
  { id: 2, tipo: 'err', titulo: 'Processo parado', desc: 'Baixa de MEI — J. Santos está sem movimentação há 5 dias.', time: 'há 1 h', unread: true },
  { id: 3, tipo: 'info', titulo: 'Arquivo recebido', desc: 'O agente importou 14 NF-e do portal municipal.', time: 'há 2 h', unread: true },
  { id: 4, tipo: 'ok', titulo: 'Pagamento confirmado', desc: 'Licença renovada até 12/06/2026.', time: 'há 3 h', unread: false },
  { id: 5, tipo: 'warn', titulo: 'Obrigação vencendo', desc: 'DCTFWeb (Mercado Lopes ME) vence em 6 dias.', time: 'ontem', unread: false },
  { id: 6, tipo: 'ok', titulo: 'Folha concluída', desc: 'Folha de pagamento — Maio (Bella Moda) finalizada.', time: 'ontem', unread: false },
];
const NOTIF_ICON = { warn: IcoAlert, err: IcoXCircle, info: IcoFile, ok: IcoCheckCircle };

function useNotifs() {
  const [items, setItems] = useStateNt(NOTIF_SEED);
  const unread = items.filter((n) => n.unread).length;
  const markAll = () => setItems((is) => is.map((n) => ({ ...n, unread: false })));
  const markOne = (id) => setItems((is) => is.map((n) => n.id === id ? { ...n, unread: false } : n));
  return { items, unread, markAll, markOne };
}

function NotificacoesPage({ store }) {
  const { items, unread, markAll, markOne } = store;
  return (
    <div className="page">
      <PageHead title="Notificações" sub="Alertas de obrigações, processos e atividade do agente.">
        <button className="btn btn-secondary" onClick={markAll} disabled={!unread}><IcoCheck /> Marcar todas como lidas</button>
      </PageHead>

      <div className="toolbar">
        <FilterChips options={[{ value: 'all', label: `Todas (${items.length})` }, { value: 'unread', label: `Não lidas (${unread})` }]} value="all" onChange={() => {}} />
      </div>

      <div className="tbl-wrap">
        <div className="notif-list">
          {items.map((n) => {
            const Icon = NOTIF_ICON[n.tipo];
            return (
              <div key={n.id} className={'notif-item' + (n.unread ? ' unread' : '')} onClick={() => markOne(n.id)}>
                <div className={'notif-ico ' + n.tipo}><Icon /></div>
                <div className="notif-main">
                  <div className="notif-t">{n.titulo}</div>
                  <div className="notif-d">{n.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span className="notif-time">{n.time}</span>
                  {n.unread ? <span className="notif-unreaddot" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NotificacoesPage, useNotifs });
