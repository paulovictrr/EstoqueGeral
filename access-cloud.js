/* Login and company synchronization for Estoque Geral. */
const CLOUD_PROJECT_URL = 'https://vyucaveircyezojlzmcs.supabase.co';
const CLOUD_PUBLISHABLE_KEY = 'sb_publishable_DmJYXcwWI3VqbSll2dpNEw_eok8uy8g';
let cloudClient = null;
let cloudUser = null;
let cloudCompanies = [];
let cloudCtx = null;
let cloudSuppressStorage = false;
let cloudSyncTimer = 0;
let cloudQueuedSnapshot = null;
let cloudSyncBusy = false;
let cloudSyncFailed = false;
let cloudRemoteChanged = false;
let cloudPollTimer = 0;

function cloudGate(html) {
  document.getElementById('cloudGate').innerHTML = '<section class="cloud-card">' + html + '</section>';
}
function cloudMessage(message, isError = false) {
  const node = document.getElementById('cloudMessage');
  if (node) {
    node.textContent = message;
    node.style.color = isError ? '#a73b37' : '';
  }
}
function cloudError(error) {
  let message = error?.message || 'Não foi possível concluir esta etapa.';
  if (/Invalid login credentials/i.test(message)) return 'E-mail ou senha não conferem.';
  if (/Email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.';
  if (/User already registered/i.test(message)) return 'Este e-mail já tem cadastro. Entre com sua conta.';
  if (/DATA_CONFLICT/i.test(message)) return 'Outra pessoa salvou alterações. Atualize a empresa para continuar.';
  return message;
}
function hasLocalRecords() {
  try {
    const local = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Boolean((local.products || []).length || (local.suppliers || []).length || (local.customers || []).length || (local.billings || []).length || (local.movements || []).length);
  } catch { return false; }
}
function showCloudAuth(mode = 'login', message = '') {
  const signingUp = mode === 'signup';
  cloudGate('<div class="eyebrow" style="color:var(--green)">ESTOQUE GERAL · ACESSO COMPARTILHADO</div><h1>' + (signingUp ? 'Criar sua conta' : 'Entrar no sistema') + '</h1><p>Use seu e-mail e senha para acessar os dados da sua empresa em qualquer aparelho.</p><form id="cloudAuthForm" class="form-grid"><label class="form-field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label><label class="form-field"><span>Senha</span><input name="password" type="password" minlength="8" autocomplete="' + (signingUp ? 'new-password' : 'current-password') + '" required></label><div class="form-foot"><button class="btn primary" type="submit">' + (signingUp ? 'Criar conta' : 'Entrar') + '</button></div></form><p class="cloud-message" id="cloudMessage">' + esc(message || (signingUp ? 'Use uma senha com pelo menos 8 caracteres.' : '')) + '</p><button class="btn subtle" id="cloudAuthToggle" type="button">' + (signingUp ? 'Já tenho conta · Entrar' : 'Primeiro acesso · Criar conta') + '</button>');
  document.getElementById('cloudAuthForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), email = String(form.get('email') || '').trim(), password = String(form.get('password') || ''), submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true; cloudMessage('Conectando…');
    try {
      if (signingUp) {
        const { data: result, error } = await cloudClient.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw error;
        if (!result.session) { showCloudAuth('login', 'Conta criada. Confirme o link enviado ao seu e-mail e depois entre aqui.'); return; }
        cloudUser = result.user; await cloudLoadCompanies();
      } else {
        const { data: result, error } = await cloudClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        cloudUser = result.user; await cloudLoadCompanies();
      }
    } catch (error) { cloudMessage(cloudError(error), true); submit.disabled = false; }
  });
  document.getElementById('cloudAuthToggle').addEventListener('click', () => showCloudAuth(signingUp ? 'login' : 'signup'));
}
async function cloudLoadCompanies() {
  const { data: memberships, error } = await cloudClient.from('company_members').select('company_id,role,companies(id,name)').eq('user_id', cloudUser.id);
  if (error) { showCloudAuth('login', cloudError(error)); return; }
  cloudCompanies = (memberships || []).map(row => ({ id: row.company_id, role: row.role, name: row.companies?.name || 'Empresa' }));
  if (cloudCompanies.length === 1) return cloudSelectCompany(cloudCompanies[0].id);
  if (cloudCompanies.length > 1) return cloudShowCompanyPicker();
  cloudShowCreateCompany();
}
function cloudShowCompanyPicker() {
  const buttons = cloudCompanies.map(company => '<button class="btn" type="button" data-company="' + esc(company.id) + '">' + esc(company.name) + '<small style="display:block;color:var(--muted)">' + esc(company.role) + '</small></button>').join('');
  cloudGate('<div class="eyebrow" style="color:var(--green)">ACESSO COMPARTILHADO</div><h1>Escolha a empresa</h1><p>Conta: ' + esc(cloudUser.email) + '</p><div class="cloud-company-list">' + buttons + '</div><p class="cloud-message" id="cloudMessage"></p><button class="btn subtle" type="button" onclick="cloudSignOut()">Sair da conta</button>');
  document.querySelectorAll('[data-company]').forEach(button => button.addEventListener('click', () => cloudSelectCompany(button.dataset.company)));
}
function cloudShowCreateCompany() {
  const importAvailable = hasLocalRecords();
  cloudGate('<div class="eyebrow" style="color:var(--green)">PRIMEIRO ACESSO</div><h1>Criar uma empresa</h1><p>Conta: ' + esc(cloudUser.email) + '</p><form id="cloudCreateForm" class="form-grid"><label class="form-field"><span>Nome da empresa</span><input name="name" required minlength="2" maxlength="120" value="Shalon" placeholder="Ex.: Shalon"></label>' + (importAvailable ? '<label class="cloud-check"><input type="checkbox" name="importLocal" checked><span>Importar para esta empresa os dados encontrados neste aparelho (' + esc(String((data.products || []).length)) + ' produtos e registros relacionados).</span></label>' : '') + '<div class="form-foot"><button class="btn primary" type="submit">Criar empresa</button></div></form><p class="cloud-message" id="cloudMessage">A conta será a proprietária da empresa.</p><button class="btn subtle" type="button" onclick="cloudSignOut()">Sair da conta</button>');
  document.getElementById('cloudCreateForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget), name = String(form.get('name') || '').trim(), importLocal = Boolean(form.get('importLocal'));
    const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true; cloudMessage('Criando empresa…');
    try {
      let initial = {};
      if (importLocal) { try { initial = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { initial = {}; } }
      const { data: companyId, error } = await cloudClient.rpc('create_company', { p_name: name, p_initial_data: initial });
      if (error) throw error;
      await cloudLoadCompanies();
      if (!cloudCompanies.some(company => company.id === companyId)) {
        const { data: memberships, error: membershipError } = await cloudClient.from('company_members').select('company_id,role,companies(id,name)').eq('user_id', cloudUser.id);
        if (membershipError) throw membershipError;
        cloudCompanies = (memberships || []).map(row => ({ id: row.company_id, role: row.role, name: row.companies?.name || name }));
        await cloudSelectCompany(companyId);
      }
    } catch (error) { cloudMessage(cloudError(error), true); submit.disabled = false; }
  });
}
async function cloudSelectCompany(companyId) {
  const company = cloudCompanies.find(item => item.id === companyId);
  if (!company) return;
  cloudGate('<div class="eyebrow" style="color:var(--green)">CONECTANDO À EMPRESA</div><h1>' + esc(company.name) + '</h1><p>Carregando os dados compartilhados…</p><p class="cloud-message" id="cloudMessage"></p>');
  try {
    const { data: row, error } = await cloudClient.from('company_data').select('payload,revision').eq('company_id', company.id).single();
    if (error) throw error;
    cloudCtx = { ...company, revision: Number(row.revision) || 0 };
    cloudSuppressStorage = true;
    data = row.payload && typeof row.payload === 'object' ? row.payload : {};
    localStorage.setItem(KEY, JSON.stringify(data));
    data = load();
    cloudSuppressStorage = false;
    const label = document.getElementById('cloudCompanyLabel'); if (label) label.textContent = company.name + ' · ' + cloudUser.email;
    const accountButton = document.getElementById('cloudAccountButton'); if (accountButton) { accountButton.hidden = false; accountButton.textContent = company.name; }
    document.body.classList.add('cloud-ready');
    document.getElementById('cloudGate').hidden = true;
    initTabGestures(); initNav(); render();
    cloudInstallStorageSync();
    clearInterval(cloudPollTimer); cloudPollTimer = setInterval(cloudCheckRevision, 20000);
  } catch (error) { cloudCtx = null; cloudSuppressStorage = false; cloudGate('<h1>Não foi possível abrir a empresa</h1><p>' + esc(cloudError(error)) + '</p><button class="btn primary" onclick="cloudLoadCompanies()">Tentar novamente</button><button class="btn subtle" onclick="cloudSignOut()">Sair</button>'); }
}
let cloudOriginalStorageSet = null;
function cloudInstallStorageSync() {
  if (cloudOriginalStorageSet) return;
  cloudOriginalStorageSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    cloudOriginalStorageSet.call(this, key, value);
    if (this === localStorage && key === KEY && cloudCtx && !cloudSuppressStorage) {
      const accountButton = document.getElementById('cloudAccountButton'); if (accountButton) accountButton.textContent = 'Salvando…';
      cloudQueuedSnapshot = String(value);
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(cloudFlushSnapshot, 500);
    }
  };
}
async function cloudFlushSnapshot() {
  if (!cloudCtx || cloudSyncBusy || !cloudQueuedSnapshot) return;
  const snapshot = cloudQueuedSnapshot; cloudQueuedSnapshot = null; cloudSyncBusy = true;
  try {
    const { data: revision, error } = await cloudClient.rpc('save_company_data', { p_company_id: cloudCtx.id, p_expected_revision: cloudCtx.revision, p_payload: JSON.parse(snapshot) });
    if (error) throw error;
    cloudCtx.revision = Number(revision) || cloudCtx.revision + 1;
    cloudSyncFailed = false;
    const accountButton = document.getElementById('cloudAccountButton'); if (accountButton) accountButton.textContent = cloudCtx.name;
    cloudRemoteChanged = false; cloudHideAlert();
  } catch (error) {
    if (/DATA_CONFLICT/i.test(error?.message || '')) { cloudRemoteChanged = true; cloudShowAlert('Esta empresa foi atualizada por outra pessoa. Atualize os dados antes de continuar.', true); }
    else { cloudSyncFailed = true; cloudShowAlert('Não foi possível sincronizar. Verifique a conexão e tente novamente.', false); }
    if (cloudQueuedSnapshot === null) cloudQueuedSnapshot = snapshot;
  } finally {
    cloudSyncBusy = false;
    if (cloudQueuedSnapshot && !cloudRemoteChanged && !cloudSyncFailed) setTimeout(cloudFlushSnapshot, 700);
  }
}
async function cloudCheckRevision() {
  if (!cloudCtx || cloudSyncBusy || cloudQueuedSnapshot || cloudRemoteChanged) return;
  const { data: row, error } = await cloudClient.from('company_data').select('revision').eq('company_id', cloudCtx.id).single();
  if (error) return;
  if (Number(row.revision) > cloudCtx.revision) { cloudRemoteChanged = true; cloudShowAlert('Há alterações mais recentes feitas em outro aparelho.', true); }
}
function cloudShowAlert(message, refresh) {
  const alert = document.getElementById('cloudAlert'); if (!alert) return;
  alert.innerHTML = '<span>' + esc(message) + '</span>' + (refresh ? '<button type="button" onclick="cloudRefreshCompany()">Atualizar dados</button>' : '<button type="button" onclick="cloudRetrySync()">Tentar novamente</button>'); alert.classList.add('show');
}
function cloudHideAlert() { const alert = document.getElementById('cloudAlert'); if (alert) { alert.classList.remove('show'); alert.innerHTML = ''; } }
function cloudRetrySync() { if (cloudQueuedSnapshot) { cloudSyncFailed = false; cloudFlushSnapshot(); } }
async function cloudRefreshCompany() {
  if (!cloudCtx) return;
  if (cloudQueuedSnapshot || cloudSyncBusy) { if (!confirm('Há uma alteração local ainda não sincronizada. Atualizar vai descartá-la. Continuar?')) return; }
  const { data: row, error } = await cloudClient.from('company_data').select('payload,revision').eq('company_id', cloudCtx.id).single();
  if (error) return toast(cloudError(error));
  cloudQueuedSnapshot = null; cloudRemoteChanged = false; cloudCtx.revision = Number(row.revision) || 0; cloudSuppressStorage = true;
  data = row.payload || {}; localStorage.setItem(KEY, JSON.stringify(data)); data = load(); cloudSuppressStorage = false; cloudHideAlert(); render(); toast('Dados atualizados');
}
function openCloudAccount() {
  const choices = cloudCompanies.map(company => '<button class="btn" type="button" onclick="closeModal();cloudSelectCompany(\'' + esc(company.id) + '\')">Abrir ' + esc(company.name) + '</button>').join('');
  const admin = ['owner','admin'].includes(cloudCtx?.role);
  document.getElementById('modal').innerHTML = '<div class="modal-head"><div><h3>' + esc(cloudCtx?.name || 'Empresa') + '</h3><small>' + esc(cloudUser?.email || '') + ' · perfil ' + esc(cloudCtx?.role || '') + '</small></div><button class="close" onclick="closeModal()">×</button></div><p>Os dados desta empresa são compartilhados entre seus membros.</p>' + (cloudCompanies.length > 1 ? '<div class="cloud-company-list">' + choices + '</div>' : '') + (admin ? '<h4>Adicionar pessoa à empresa</h4><form id="cloudMemberForm" class="form-grid"><label class="form-field full"><span>E-mail da pessoa (ela precisa criar e confirmar a conta primeiro)</span><input name="email" type="email" required></label><label class="form-field"><span>Acesso</span><select name="role"><option value="member">Membro</option><option value="admin">Administrador</option></select></label><div class="form-foot"><button class="btn primary" type="submit">Adicionar à empresa</button></div></form>' : '') + '<div class="form-foot"><button class="btn danger" onclick="cloudSignOut()">Sair da conta</button><button class="btn" onclick="closeModal()">Fechar</button></div>';
  showModal();
  const form = document.getElementById('cloudMemberForm');
  if (form) form.addEventListener('submit', async event => { event.preventDefault(); const fields = new FormData(form); const button = form.querySelector('[type="submit"]'); button.disabled = true; try { const { error } = await cloudClient.rpc('add_company_member', { p_company_id: cloudCtx.id, p_email: String(fields.get('email')).trim(), p_role: fields.get('role') }); if (error) throw error; toast('Pessoa adicionada à empresa'); form.reset(); } catch (error) { toast(cloudError(error)); } finally { button.disabled = false; } });
}
async function cloudSignOut() {
  clearInterval(cloudPollTimer); cloudCtx = null; cloudCompanies = []; cloudUser = null; cloudQueuedSnapshot = null; cloudRemoteChanged = false; cloudSuppressStorage = true;
  try { localStorage.removeItem(KEY); } catch {}
  cloudSuppressStorage = false; document.body.classList.remove('cloud-ready');
  const accountButton = document.getElementById('cloudAccountButton'); if (accountButton) accountButton.hidden = true;
  closeModal(); await cloudClient.auth.signOut(); showCloudAuth('login', 'Você saiu da conta.');
}
async function bootstrapCloudAccess() {
  if (!window.supabase?.createClient) { cloudGate('<h1>Serviço de acesso indisponível</h1><p>Não foi possível carregar a conexão segura. Verifique sua internet e recarregue a página.</p>'); return; }
  cloudClient = window.supabase.createClient(CLOUD_PROJECT_URL, CLOUD_PUBLISHABLE_KEY);
  showCloudAuth('login');
  const { data: sessionData, error } = await cloudClient.auth.getSession();
  if (error) { cloudMessage(cloudError(error), true); return; }
  if (sessionData.session?.user) { cloudUser = sessionData.session.user; await cloudLoadCompanies(); }
}
