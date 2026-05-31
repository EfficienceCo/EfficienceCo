// Efficience Co — Gestão: Usuários (admin_cliente), Clientes (admin_cliente),
// Escritórios (admin_efficience). CRUD-style list + create/edit/remove modals.
const { useState: useStatePe } = React;

/* ============ Usuários do escritório ============ */
const USERS_SEED = [
  { id: 1, nome: 'Victor Almeida', email: 'victor@andradecontabil.com.br', perfil: 'admin', status: 'ativo' },
  { id: 2, nome: 'Marina Reis', email: 'marina@andradecontabil.com.br', perfil: 'funcionario', status: 'ativo' },
  { id: 3, nome: 'Caio Nunes', email: 'caio@andradecontabil.com.br', perfil: 'funcionario', status: 'ativo' },
  { id: 4, nome: 'Beatriz Lima', email: 'beatriz@andradecontabil.com.br', perfil: 'funcionario', status: 'inativo' },
];
const PERFIL_BADGE = { admin: ['brand', 'Admin'], funcionario: ['neutral', 'Funcionário'] };

function UsuariosPage() {
  const [rows, setRows] = useStatePe(USERS_SEED);
  const [editing, setEditing] = useStatePe(null);
  const [removing, setRemoving] = useStatePe(null);
  const remove = (id) => { setRows((rs) => rs.filter((r) => r.id !== id)); setRemoving(null); };
  return (
    <div className="page">
      <PageHead title="Usuários" sub="Equipe do escritório e permissões por perfil.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IcoUserPlus /> Novo usuário</button>
      </PageHead>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><div className="cell-user"><Avatar name={u.nome} /><span className="cell-name">{u.nome}</span></div></td>
                <td className="cell-mono">{u.email}</td>
                <td><Badge kind={PERFIL_BADGE[u.perfil][0]}>{PERFIL_BADGE[u.perfil][1]}</Badge></td>
                <td><Badge kind={u.status === 'ativo' ? 'ok' : 'neutral'} dot>{u.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge></td>
                <td style={{ textAlign: 'right' }}>
                  <div className="rowactions">
                    <button className="iconaction" title="Editar" onClick={() => setEditing(u)}><IcoEdit /></button>
                    <button className="iconaction danger" title="Remover" onClick={() => setRemoving(u)}><IcoTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? <UsuarioForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {removing ? <ConfirmRemove name={removing.nome} kind="usuário" onClose={() => setRemoving(null)} onConfirm={() => remove(removing.id)} /> : null}
    </div>
  );
}

function UsuarioForm({ row, onClose }) {
  const [perfil, setPerfil] = useStatePe(row?.perfil || 'funcionario');
  return (
    <Modal title={row ? 'Editar usuário' : 'Novo usuário'} subtitle="Membros da equipe acessam a plataforma com e-mail e senha." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}>{row ? 'Salvar' : 'Criar usuário'}</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Nome completo" required full><Input defaultValue={row?.nome} placeholder="Nome do funcionário" /></Field>
        <Field label="E-mail" required full><Input type="email" defaultValue={row?.email} placeholder="nome@escritorio.com.br" /></Field>
        <Field label="Perfil" required full>
          <SegRadio value={perfil} onChange={setPerfil} options={[{ value: 'admin', label: 'Admin' }, { value: 'funcionario', label: 'Funcionário' }]} />
        </Field>
        <Field label={row ? 'Nova senha' : 'Senha provisória'} required={!row} full help={row ? 'Deixe em branco para manter a senha atual.' : 'O usuário troca no primeiro acesso.'}><Input type="password" placeholder="••••••••" /></Field>
      </div>
    </Modal>
  );
}

/* ============ Clientes do escritório ============ */
const CLI_SEED = [
  { id: 1, nome: 'Padaria do João', cnpj: '12.345.678/0001-90', regime: 'Simples Nacional', resp: 'Marina Reis', status: 'ativo' },
  { id: 2, nome: 'Mercado Lopes ME', cnpj: '23.456.789/0001-12', regime: 'Simples Nacional', resp: 'Caio Nunes', status: 'ativo' },
  { id: 3, nome: 'Andrade Transportes', cnpj: '34.567.890/0001-34', regime: 'Lucro Presumido', resp: 'Victor Almeida', status: 'ativo' },
  { id: 4, nome: 'Bella Moda Ltda', cnpj: '45.678.901/0001-56', regime: 'Lucro Real', resp: 'Marina Reis', status: 'ativo' },
  { id: 5, nome: 'J. Santos MEI', cnpj: '56.789.012/0001-78', regime: 'MEI', resp: 'Caio Nunes', status: 'inativo' },
];

function ClientesPage() {
  const [rows, setRows] = useStatePe(CLI_SEED);
  const [editing, setEditing] = useStatePe(null);
  const toggleStatus = (id) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, status: r.status === 'ativo' ? 'inativo' : 'ativo' } : r));
  return (
    <div className="page">
      <PageHead title="Clientes" sub="As empresas que o escritório atende.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IcoPlus /> Novo cliente</button>
      </PageHead>
      <div className="grid4">
        <div className="stat"><div className="stat-label">Total</div><div className="stat-value">{rows.length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Ativos</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>{rows.filter(r=>r.status==='ativo').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Simples Nacional</div><div className="stat-value">{rows.filter(r=>r.regime==='Simples Nacional').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Obrigações / mês</div><div className="stat-value">64</div></div>
      </div>
      <div className="toolbar"><div className="spacer" /><Search placeholder="Buscar cliente…" /></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><div className="cell-user"><span className="cell-av" style={{ borderRadius: '8px', background: 'var(--slate-200)', color: 'var(--slate-600)' }}><IcoClientes width="16" height="16" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} /></span><span className="cell-name">{c.nome}</span></div></td>
                <td className="cell-mono">{c.cnpj}</td>
                <td>{c.regime}</td>
                <td>{c.resp}</td>
                <td><Badge kind={c.status === 'ativo' ? 'ok' : 'neutral'} dot>{c.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge></td>
                <td style={{ textAlign: 'right' }}>
                  <div className="rowactions">
                    <button className="iconaction" title="Editar" onClick={() => setEditing(c)}><IcoEdit /></button>
                    <button className="iconaction" title={c.status === 'ativo' ? 'Desativar' : 'Ativar'} onClick={() => toggleStatus(c.id)}><IcoPower /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? <ClienteForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ClienteForm({ row, onClose }) {
  return (
    <Modal title={row ? 'Editar cliente' : 'Novo cliente'} subtitle="Empresa atendida pelo escritório." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}>{row ? 'Salvar' : 'Criar cliente'}</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Razão social / Nome" required full><Input defaultValue={row?.nome} placeholder="Ex.: Padaria do João" /></Field>
        <Field label="CNPJ" required><Input defaultValue={row?.cnpj} placeholder="00.000.000/0001-00" /></Field>
        <Field label="Regime tributário" required>
          <Select defaultValue={row?.regime}><option>Simples Nacional</option><option>Lucro Presumido</option><option>Lucro Real</option><option>MEI</option></Select>
        </Field>
        <Field label="Responsável no escritório" required full>
          <Select defaultValue={row?.resp}><option>Victor Almeida</option><option>Marina Reis</option><option>Caio Nunes</option></Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ============ Escritórios (admin Efficience) ============ */
const ESC_SEED = [
  { id: 1, nome: 'Andrade Contabilidade', plano: 'Licença + Manutenção', usuarios: 8, licenca: 'ativa', validade: '12/06/2026' },
  { id: 2, nome: 'Prisma Contábil Ltda', plano: 'Licença + Manutenção', usuarios: 5, licenca: 'ativa', validade: '03/06/2026' },
  { id: 3, nome: 'Nova Gestão Assessoria', plano: 'Licença', usuarios: 3, licenca: 'suspensa', validade: '28/04/2026' },
  { id: 4, nome: 'Escritório Vértice', plano: 'Licença', usuarios: 2, licenca: 'inativa', validade: '15/03/2026' },
];
const LIC_BADGE = { ativa: ['ok', 'Ativa'], suspensa: ['warn', 'Suspensa'], inativa: ['err', 'Inativa'] };

function EscritoriosPage() {
  const [rows] = useStatePe(ESC_SEED);
  const [editing, setEditing] = useStatePe(null);
  return (
    <div className="page">
      <PageHead title="Escritórios" sub="Área Efficience — gestão de licenças e suporte aos escritórios.">
        <button className="btn btn-dark" onClick={() => setEditing('new')}><IcoPlus /> Novo escritório</button>
      </PageHead>
      <div className="grid4">
        <div className="stat"><div className="stat-label">Escritórios</div><div className="stat-value">128</div></div>
        <div className="stat"><div className="stat-label">Licenças ativas</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>119</div></div>
        <div className="stat"><div className="stat-label">Suspensas</div><div className="stat-value" style={{ color: 'var(--warning-700)' }}>06</div></div>
        <div className="stat"><div className="stat-label">MRR estimado</div><div className="stat-value" style={{ fontSize: '24px' }}>R$ 241k</div></div>
      </div>
      <div className="toolbar"><div className="spacer" /><Search placeholder="Buscar escritório…" /></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Escritório</th><th>Plano</th><th>Usuários</th><th>Licença</th><th>Validade</th><th></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td><div className="cell-user"><span className="cell-av" style={{ borderRadius: '8px' }}><IcoBuilding2 width="16" height="16" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} /></span><span className="cell-name">{e.nome}</span></div></td>
                <td>{e.plano}</td>
                <td className="cell-mono">{e.usuarios}</td>
                <td><Badge kind={LIC_BADGE[e.licenca][0]} dot>{LIC_BADGE[e.licenca][1]}</Badge></td>
                <td className="cell-mono">{e.validade}</td>
                <td style={{ textAlign: 'right' }}>
                  <div className="rowactions">
                    <button className="iconaction" title="Acessar como suporte"><IcoLink /></button>
                    <button className="iconaction" title="Editar" onClick={() => setEditing(e)}><IcoEdit /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? <EscritorioForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EscritorioForm({ row, onClose }) {
  return (
    <Modal title={row ? 'Editar escritório' : 'Novo escritório'} subtitle="Cadastro de um escritório cliente da Efficience." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-dark" onClick={onClose}>{row ? 'Salvar' : 'Cadastrar'}</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Nome do escritório" required full><Input defaultValue={row?.nome} placeholder="Ex.: Andrade Contabilidade" /></Field>
        <Field label="Plano" required>
          <Select defaultValue={row?.plano}><option>Licença + Manutenção</option><option>Licença</option></Select>
        </Field>
        <Field label="Limite de usuários" required><Input type="number" defaultValue={row?.usuarios || 5} /></Field>
        <Field label="Admin responsável" required full><Input placeholder="email@escritorio.com.br" /></Field>
      </div>
    </Modal>
  );
}

/* ============ shared confirm ============ */
function ConfirmRemove({ name, kind, onClose, onConfirm }) {
  return (
    <Modal title={'Remover ' + kind} onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-dark" style={{ background: 'var(--danger-600)' }} onClick={onConfirm}><IcoTrash /> Remover</button></React.Fragment>}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <span style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', background: 'var(--danger-50)', color: 'var(--danger-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><IcoAlert width="22" height="22" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} /></span>
        <div style={{ fontSize: '14px', color: 'var(--slate-700)', lineHeight: 1.55 }}>Tem certeza que deseja remover <b>{name}</b>? Esta ação não pode ser desfeita.</div>
      </div>
    </Modal>
  );
}

Object.assign(window, { UsuariosPage, ClientesPage, EscritoriosPage });
