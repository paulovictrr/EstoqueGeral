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
  const gate = document.getElementById('cloudGate'); gate.hidden = false; document.body.classList.remove('cloud-ready');
  gate.innerHTML = '<section class="cloud-card">' + html + '</section>';
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
function cloudRoleLabel(role) { return role === 'owner' || role === 'admin' ? 'Administrador' : 'Membro'; }
function hasLocalRecords() {
  try {
    const local = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Boolean((local.products || []).length || (local.suppliers || []).length || (local.customers || []).length || (local.billings || []).length || (local.movements || []).length);
  } catch { return false; }
}
function showCloudAuth(mode = 'login', message = '') {
  const signingUp = mode === 'signup';
  const nameFields = signingUp ? '<label class="form-field"><span>Primeiro nome</span><input name="firstName" autocomplete="given-name" required></label><label class="form-field"><span>Segundo nome</span><input name="lastName" autocomplete="family-name" required></label>' : '';
  cloudGate('<div class="eyebrow" style="color:var(--green)">ESTOQUE GERAL · ACESSO COMPARTILHADO</div><h1>' + (signingUp ? 'Criar sua conta' : 'Entrar no sistema') + '</h1><p>Entre com sua conta e depois escolha a empresa que deseja acessar.</p><form id="cloudAuthForm" class="form-grid">' + nameFields + '<label class="form-field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label><label class="form-field"><span>Senha</span><input name="password" type="password" minlength="8" autocomplete="' + (signingUp ? 'new-password' : 'current-password') + '" required></label><div class="form-foot"><button class="btn primary" type="submit">' + (signingUp ? 'Criar conta' : 'Entrar') + '</button></div></form><p class="cloud-message" id="cloudMessage">' + esc(message || (signingUp ? 'Use uma senha com pelo menos 8 caracteres.' : '')) + '</p>' + (!signingUp ? '<button class="btn subtle" id="cloudForgotPassword" type="button">Esqueci minha senha</button>' : '') + '<button class="btn subtle" id="cloudAuthToggle" type="button">' + (signingUp ? 'Já tenho conta · Entrar' : 'Primeiro acesso · Criar conta') + '</button>');
  document.getElementById('cloudAuthForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), email = String(form.get('email') || '').trim(), password = String(form.get('password') || ''), submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true; cloudMessage('Conectando…');
    try {
      if (signingUp) {
        const firstName = String(form.get('firstName') || '').trim(), lastName = String(form.get('lastName') || '').trim();
        const { data: result, error } = await cloudClient.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0], data: { first_name: firstName, last_name: lastName, full_name: firstName + ' ' + lastName } } });
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
  document.getElementById('cloudForgotPassword')?.addEventListener('click', () => cloudShowForgotPassword());
}
function cloudShowForgotPassword(message = '') {
  cloudGate('<div class="eyebrow" style="color:var(--green)">RECUPERAR ACESSO</div><h1>Redefinir senha</h1><p>Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p><form id="cloudResetRequest" class="form-grid"><label class="form-field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label><div class="form-foot"><button class="btn primary" type="submit">Enviar link de recuperação</button></div></form><p class="cloud-message" id="cloudMessage">' + esc(message) + '</p><button class="btn subtle" type="button" onclick="showCloudAuth(\'login\')">Voltar ao login</button>');
  document.getElementById('cloudResetRequest').addEventListener('submit', async event => {
    event.preventDefault(); const email = String(new FormData(event.currentTarget).get('email') || '').trim(), button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true; cloudMessage('Enviando…');
    try { const { error } = await cloudClient.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }); if (error) throw error; cloudMessage('Se houver uma conta com esse e-mail, enviaremos o link para redefinir a senha. Confira também o spam.'); }
    catch (error) { cloudMessage(cloudError(error), true); }
    finally { button.disabled = false; }
  });
}
function cloudShowNewPassword(message = '') {
  cloudGate('<div class="eyebrow" style="color:var(--green)">RECUPERAR ACESSO</div><h1>Escolha uma nova senha</h1><p>Crie uma senha nova para sua conta.</p><form id="cloudNewPasswordForm" class="form-grid"><label class="form-field"><span>Nova senha</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="form-field"><span>Repita a nova senha</span><input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><div class="form-foot"><button class="btn primary" type="submit">Salvar nova senha</button></div></form><p class="cloud-message" id="cloudMessage">' + esc(message) + '</p>');
  document.getElementById('cloudNewPasswordForm').addEventListener('submit', async event => {
    event.preventDefault(); const fields = new FormData(event.currentTarget), password = String(fields.get('password') || ''), confirmation = String(fields.get('confirmPassword') || ''), button = event.currentTarget.querySelector('[type="submit"]');
    if (password !== confirmation) return cloudMessage('As senhas não são iguais.', true);
    button.disabled = true; cloudMessage('Salvando nova senha…');
    try { const { data: result, error } = await cloudClient.auth.updateUser({ password }); if (error) throw error; cloudUser = result.user; history.replaceState(null, '', location.pathname + location.search); cloudMessage('Senha atualizada. Abrindo suas empresas…'); await cloudLoadCompanies(); }
    catch (error) { cloudMessage(cloudError(error), true); button.disabled = false; }
  });
}
async function cloudLoadCompanies() {
  const { data: memberships, error } = await cloudClient.from('company_members').select('company_id,role,companies(id,name,active,created_at)').eq('user_id', cloudUser.id);
  if (error) { showCloudAuth('login', cloudError(error)); return; }
  cloudCompanies = (memberships || []).map(row => ({ id: row.company_id, role: row.role, name: row.companies?.name || 'Empresa', active: row.companies?.active !== false, createdAt: row.companies?.created_at || '' }));
  if (cloudCompanies.length) return cloudShowCompanyPicker();
  cloudShowJoinCompany();
}
function cloudShowCompanyPicker() {
  const duplicates = new Map(); cloudCompanies.forEach(company => { const key = company.name.toLocaleLowerCase(); duplicates.set(key, (duplicates.get(key) || 0) + 1); });
  const cards = cloudCompanies.map(company => {
    const date = company.createdAt ? new Date(company.createdAt).toLocaleDateString('pt-BR') : '';
    const disambiguator = duplicates.get(company.name.toLocaleLowerCase()) > 1 ? ' · ref. ' + company.id.slice(-6) : '';
    const detail = cloudRoleLabel(company.role) + (date ? ' · Criada em ' + date : '') + disambiguator;
    const pick = company.active ? '<button class="btn cloud-company-pick" type="button" data-company="' + esc(company.id) + '"><span><strong>' + esc(company.name) + '</strong><small>' + esc(detail) + '</small></span><b>Entrar →</b></button>' : '<div class="btn cloud-company-pick cloud-company-disabled"><span><strong>' + esc(company.name) + '</strong><small>' + esc(detail + ' · Desativada') + '</small></span><b>Desativada</b></div>';
    const reactivate = !company.active && ['owner','admin'].includes(company.role) ? '<button class="btn cloud-company-manage" type="button" onclick="cloudReactivateCompanyFromPicker(\'' + esc(company.id) + '\')">Reativar</button>' : '';
    return '<div class="cloud-company-option">' + pick + reactivate + '</div>';
  }).join('');
  cloudGate('<div class="eyebrow" style="color:var(--green)">ACESSO COMPARTILHADO</div><h1>Escolha a empresa</h1><p>Conta: ' + esc(cloudUser.email) + '</p><div class="cloud-company-list">' + cards + '</div><p class="cloud-message" id="cloudMessage"></p><div class="cloud-picker-actions"><button class="btn" type="button" onclick="cloudShowJoinCompany()">Entrar em outra empresa</button><button class="btn" type="button" onclick="cloudShowCreateCompany()">Criar empresa</button></div><button class="btn subtle" type="button" onclick="cloudSignOut()">Sair da conta</button>');
  document.querySelectorAll('[data-company]').forEach(button => button.addEventListener('click', () => cloudSelectCompany(button.dataset.company)));
}
async function cloudReactivateCompanyFromPicker(companyId) {
  const company = cloudCompanies.find(item => item.id === companyId);
  if (!company || !['owner','admin'].includes(company.role)) return;
  try { const { error } = await cloudClient.rpc('set_company_active', { p_company_id: company.id, p_active: true }); if (error) throw error; company.active = true; cloudShowCompanyPicker(); toast('Empresa reativada. Agora você pode selecioná-la.'); }
  catch (error) { toast(cloudError(error)); }
}
function cloudShowJoinCompany(message = '') {
  cloudGate('<div class="eyebrow" style="color:var(--green)">ENTRAR EM UMA EMPRESA</div><h1>Nome e senha da empresa</h1><p>Peça esses dados ao responsável pela empresa. Você também precisa estar conectado à sua conta pessoal.</p><form id="cloudJoinForm" class="form-grid"><label class="form-field"><span>Empresa</span><input name="companyName" required minlength="2" autocomplete="organization" placeholder="Nome da empresa"></label><label class="form-field"><span>Senha de acesso da empresa</span><input name="companyPassword" type="password" required minlength="8" autocomplete="off"></label><div class="form-foot"><button class="btn primary" type="submit">Entrar na empresa</button></div></form><p class="cloud-message" id="cloudMessage">' + esc(message) + '</p><div class="form-foot"><button class="btn" type="button" onclick="cloudShowCreateCompany()">Criar uma nova empresa</button>' + (cloudCompanies.length ? '<button class="btn subtle" type="button" onclick="cloudShowCompanyPicker()">Voltar às empresas</button>' : '') + '</div><button class="btn subtle" type="button" onclick="cloudSignOut()">Sair da conta</button>');
  document.getElementById('cloudJoinForm').addEventListener('submit', async event => {
    event.preventDefault(); const fields = new FormData(event.currentTarget), submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true; cloudMessage('Verificando acesso…');
    try {
      const { data: companyId, error } = await cloudClient.rpc('join_company_by_password', { p_company_name: String(fields.get('companyName')).trim(), p_password: String(fields.get('companyPassword')) });
      if (error) throw error;
      const { data: memberships, error: membershipError } = await cloudClient.from('company_members').select('company_id,role,companies(id,name,active,created_at)').eq('user_id', cloudUser.id);
      if (membershipError) throw membershipError;
      cloudCompanies = (memberships || []).map(row => ({ id: row.company_id, role: row.role, name: row.companies?.name || 'Empresa', active: row.companies?.active !== false, createdAt: row.companies?.created_at || '' }));
      if (!cloudCompanies.some(company => company.id === companyId)) throw new Error('Não foi possível confirmar o vínculo. Tente entrar novamente.');
      cloudShowCompanyPicker();
    } catch (error) { cloudMessage(cloudError(error), true); submit.disabled = false; }
  });
}
function cloudShowCreateCompany() {
  const importAvailable = hasLocalRecords();
  cloudGate('<div class="eyebrow" style="color:var(--green)">NOVA EMPRESA</div><h1>Criar uma empresa</h1><p>Conta: ' + esc(cloudUser.email) + '</p><form id="cloudCreateForm" class="form-grid"><label class="form-field"><span>Nome da empresa</span><input name="name" required minlength="2" maxlength="120" value="Shalon" placeholder="Ex.: Shalon"></label><label class="form-field"><span>Senha de acesso para a equipe</span><input name="companyPassword" type="password" required minlength="8" autocomplete="new-password"></label><p class="cloud-message">Compartilhe esta senha apenas com pessoas autorizadas. Cada pessoa também usará seu próprio login.</p><label class="form-field full"><span>Restaurar backup completo (.json), opcional</span><input name="backupFile" type="file" accept=".json,application/json"></label><p class="cloud-message">Se você selecionar um backup, ele será usado no lugar dos dados locais.</p>' + (importAvailable ? '<label class="cloud-check"><input type="checkbox" name="importLocal" checked><span>Importar para esta empresa os dados encontrados neste aparelho (' + esc(String((data.products || []).length)) + ' produtos e registros relacionados).</span></label>' : '') + '<div class="form-foot"><button class="btn primary" type="submit">Criar empresa</button></div></form><p class="cloud-message" id="cloudMessage">A conta será a proprietária da empresa.</p><div class="form-foot"><button class="btn subtle" type="button" onclick="cloudShowJoinCompany()">Voltar</button><button class="btn subtle" type="button" onclick="cloudSignOut()">Sair da conta</button></div>');
  document.querySelector('#cloudCreateForm [name="backupFile"]').addEventListener('change', async event => {
    const input = event.currentTarget, file = input.files?.[0]; if (!file) return;
    try { const backup = JSON.parse(await file.text()); if (backup?.format !== 'estoque-geral-company-backup-v1' || !backup.data || typeof backup.data !== 'object') throw new Error(); const nameInput = document.querySelector('#cloudCreateForm [name="name"]'); if (nameInput && nameInput.value === 'Shalon' && backup.company?.name) nameInput.value = backup.company.name; cloudMessage('Backup reconhecido. Os dados serão restaurados ao criar a empresa.'); }
    catch { cloudMessage('O arquivo não parece ser um backup completo válido do Estoque Geral.', true); input.value = ''; }
  });
  document.getElementById('cloudCreateForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget), name = String(form.get('name') || '').trim(), companyPassword = String(form.get('companyPassword') || ''), importLocal = Boolean(form.get('importLocal'));
    const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true; cloudMessage('Criando empresa…');
    try {
      let initial = {};
      const backupFile = form.get('backupFile');
      if (backupFile && backupFile.size > 0) {
        const backup = JSON.parse(await backupFile.text());
        if (backup?.format !== 'estoque-geral-company-backup-v1' || !backup.data || typeof backup.data !== 'object') throw new Error('Esse arquivo não é um backup completo válido do Estoque Geral.');
        initial = backup.data;
      } else if (importLocal) { try { initial = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { initial = {}; } }
      const { data: companyId, error } = await cloudClient.rpc('create_company', { p_name: name, p_initial_data: initial });
      if (error) throw error;
      const { error: passwordError } = await cloudClient.rpc('set_company_access_password', { p_company_id: companyId, p_password: companyPassword });
      if (passwordError) throw passwordError;
      const { data: memberships, error: membershipError } = await cloudClient.from('company_members').select('company_id,role,companies(id,name,active,created_at)').eq('user_id', cloudUser.id);
      if (membershipError) throw membershipError;
      cloudCompanies = (memberships || []).map(row => ({ id: row.company_id, role: row.role, name: row.companies?.name || name, active: row.companies?.active !== false, createdAt: row.companies?.created_at || '' }));
      await cloudSelectCompany(companyId);
    } catch (error) { cloudMessage(cloudError(error), true); submit.disabled = false; }
  });
}
async function cloudSelectCompany(companyId) {
  const company = cloudCompanies.find(item => item.id === companyId);
  if (!company) return;
  if (!company.active) { cloudGate('<h1>Empresa desativada</h1><p>Um administrador precisa reativar esta empresa antes que seus dados possam ser acessados.</p><button class="btn primary" onclick="cloudShowCompanyPicker()">Voltar às empresas</button>'); return; }
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
  const openedFromApp = document.body.classList.contains('cloud-ready');
  const choices = cloudCompanies.map(company => '<button class="btn" type="button" onclick="closeModal();cloudSelectCompany(\'' + esc(company.id) + '\')">Abrir ' + esc(company.name) + '</button>').join('');
  const admin = ['owner','admin'].includes(cloudCtx?.role);
  const companyIdSuffix = cloudCtx?.id ? cloudCtx.id.slice(-6) : '';
  const adminTools = admin ? '<h4>Dados da empresa</h4><form id="cloudCompanyNameForm" class="form-grid"><label class="form-field full"><span>Nome</span><input name="name" required minlength="2" maxlength="120" value="' + esc(cloudCtx?.name || '') + '"></label><div class="form-foot"><button class="btn primary" type="submit">Salvar nome</button></div></form><p class="cloud-message">Identificador: …' + esc(companyIdSuffix) + (cloudCtx?.createdAt ? ' · Criada em ' + esc(new Date(cloudCtx.createdAt).toLocaleDateString('pt-BR')) : '') + '</p><div class="form-foot"><button class="btn" type="button" onclick="cloudToggleCompanyActive()">' + (cloudCtx?.active === false ? 'Reativar empresa' : 'Desativar empresa') + '</button></div><h4>Backup completo da empresa</h4><p class="cloud-message">Cópia integral em JSON, preparada para restauração.</p><button class="btn" type="button" onclick="cloudDownloadCompanyBackup().catch(error=>toast(cloudError(error)))">Baixar backup completo (.json)</button><h4>Senha de acesso da empresa</h4><form id="cloudAccessPasswordForm" class="form-grid"><label class="form-field full"><span>Defina ou troque a senha que os membros usarão para entrar</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label><div class="form-foot"><button class="btn primary" type="submit">Salvar senha da empresa</button></div></form><h4>Adicionar membro pelo e-mail</h4><form id="cloudMemberForm" class="form-grid"><label class="form-field full"><span>E-mail da pessoa (conta já confirmada)</span><input name="email" type="email" required></label><label class="form-field"><span>Acesso</span><select name="role"><option value="member">Membro</option><option value="admin">Administrador</option></select></label><div class="form-foot"><button class="btn" type="submit">Adicionar membro</button></div></form><div class="cloud-danger-zone"><strong>Excluir esta empresa</strong><p>Isso apaga permanentemente os produtos, fornecedores, faturamentos e demais dados compartilhados desta empresa.</p><button class="btn danger" type="button" onclick="cloudDeleteCompany()">Excluir empresa…</button></div>' : '';
  document.getElementById('modal').innerHTML = '<div class="modal-head"><div><h3>' + esc(cloudCtx?.name || 'Empresa') + (cloudCtx?.active === false ? ' · Desativada' : '') + '</h3><small>' + esc(cloudUser?.email || '') + ' · ' + esc(cloudRoleLabel(cloudCtx?.role)) + '</small></div><button class="close" onclick="closeModal()">×</button></div><p>Os dados desta empresa são compartilhados entre seus membros.</p>' + (cloudCompanies.length > 1 ? '<div class="cloud-company-list">' + choices + '</div>' : '') + adminTools + '<div class="form-foot"><button class="btn danger" onclick="cloudSignOut()">Sair da conta</button><button class="btn" onclick="closeModal()">Fechar</button></div>';
  showModal();
  const nameForm = document.getElementById('cloudCompanyNameForm');
  if (nameForm) nameForm.addEventListener('submit', async event => { event.preventDefault(); const name = String(new FormData(nameForm).get('name') || '').trim(), button = nameForm.querySelector('[type="submit"]'); button.disabled = true; try { const { error } = await cloudClient.rpc('set_company_name', { p_company_id: cloudCtx.id, p_name: name }); if (error) throw error; cloudCtx.name = name; cloudCompanies = cloudCompanies.map(company => company.id === cloudCtx.id ? { ...company, name } : company); const label = document.getElementById('cloudCompanyLabel'); if (label) label.textContent = name + ' · ' + cloudUser.email; const accountButton = document.getElementById('cloudAccountButton'); if (accountButton) accountButton.textContent = name; toast('Nome da empresa atualizado'); const title = document.querySelector('#modal .modal-head h3'); if (title) title.textContent = name; if (!openedFromApp) { closeModal(); cloudShowCompanyPicker(); } } catch (error) { toast(cloudError(error)); } finally { button.disabled = false; } });
  const passwordForm = document.getElementById('cloudAccessPasswordForm');
  if (passwordForm) passwordForm.addEventListener('submit', async event => { event.preventDefault(); const password = String(new FormData(passwordForm).get('password') || ''), button = passwordForm.querySelector('[type="submit"]'); button.disabled = true; try { const { error } = await cloudClient.rpc('set_company_access_password', { p_company_id: cloudCtx.id, p_password: password }); if (error) throw error; toast('Senha de acesso da empresa atualizada'); passwordForm.reset(); } catch (error) { toast(cloudError(error)); } finally { button.disabled = false; } });
  const form = document.getElementById('cloudMemberForm');
  if (form) form.addEventListener('submit', async event => { event.preventDefault(); const fields = new FormData(form); const button = form.querySelector('[type="submit"]'); button.disabled = true; try { const { error } = await cloudClient.rpc('add_company_member', { p_company_id: cloudCtx.id, p_email: String(fields.get('email')).trim(), p_role: fields.get('role') }); if (error) throw error; toast('Pessoa adicionada à empresa'); form.reset(); } catch (error) { toast(cloudError(error)); } finally { button.disabled = false; } });
}
async function cloudToggleCompanyActive() {
  if (!cloudCtx || !['owner','admin'].includes(cloudCtx.role)) return;
  const nextActive = cloudCtx.active === false;
  try {
    const { error } = await cloudClient.rpc('set_company_active', { p_company_id: cloudCtx.id, p_active: nextActive }); if (error) throw error;
    cloudCompanies = cloudCompanies.map(company => company.id === cloudCtx.id ? { ...company, active: nextActive } : company);
    if (nextActive) { cloudCtx.active = true; toast('Empresa reativada'); closeModal(); cloudLeaveCompany(); }
    else { toast('Empresa desativada'); closeModal(); cloudLeaveCompany(); }
  } catch (error) { toast(cloudError(error)); }
}
async function cloudDownloadCompanyBackup(company = cloudCtx, notify = true) {
  if (!company) return false;
  const { data: row, error } = await cloudClient.from('company_data').select('payload').eq('company_id', company.id).single();
  if (error) throw new Error('Não foi possível obter a cópia completa. Se a empresa estiver desativada, reative-a antes de baixar o backup.');
  const backup = { format: 'estoque-geral-company-backup-v1', company: { id: company.id, name: company.name, createdAt: company.createdAt || null }, exportedAt: new Date().toISOString(), data: row.payload };
  const slug = company.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  download(JSON.stringify(backup, null, 2), 'backup-completo-' + slug + '-' + timestamp + '.json', 'application/json;charset=utf-8');
  if (notify) toast('Backup completo da empresa baixado');
  return true;
}
async function cloudDeleteCompany() {
  if (!cloudCtx || !['owner','admin'].includes(cloudCtx.role)) return;
  document.getElementById('modal').innerHTML = '<div class="modal-head"><div><h3>Excluir ' + esc(cloudCtx.name) + '?</h3><small>Empresa · identificador final …' + esc(cloudCtx.id.slice(-6)) + '</small></div><button class="close" onclick="openCloudAccount()">×</button></div><p>Antes de excluir, você quer baixar o backup completo (.json) desta empresa?</p><p class="cloud-message">O arquivo JSON contém os dados comerciais e pessoais da empresa. Guarde-o em local seguro. Para restaurá-lo, crie novamente a empresa e defina uma nova senha; os membros devem ser adicionados outra vez.</p><div class="form-foot cloud-delete-choice"><button class="btn primary" type="button" onclick="cloudStartDelete(true)">Baixar backup completo (.json) e continuar</button><button class="btn danger" type="button" onclick="cloudStartDelete(false)">Excluir sem backup</button></div><div class="form-foot"><button class="btn" type="button" onclick="openCloudAccount()">Cancelar</button></div>';
}
async function cloudStartDelete(makeBackup) {
  const company = cloudCtx;
  if (!company) return;
  try {
    if (makeBackup) {
      await cloudDownloadCompanyBackup(company, false);
    }
    document.getElementById('modal').innerHTML = '<div class="modal-head"><div><h3>Confirmação final</h3><small>Esta ação não pode ser desfeita</small></div><button class="close" onclick="openCloudAccount()">×</button></div><p>' + (makeBackup ? 'O download do backup JSON foi solicitado. Salve o arquivo em local seguro e confirme a exclusão abaixo.' : 'Você escolheu continuar sem baixar um backup.') + '</p><form id="cloudDeleteConfirmForm" class="form-grid"><label class="form-field full"><span>Digite exatamente o nome da empresa: ' + esc(company.name) + '</span><input name="confirmation" autocomplete="off" required></label><div class="form-foot"><button class="btn danger" type="submit">Excluir empresa e todos os dados</button><button class="btn" type="button" onclick="openCloudAccount()">Cancelar</button></div></form>';
    document.getElementById('cloudDeleteConfirmForm').addEventListener('submit', event => cloudConfirmDelete(event, company));
  } catch (error) { toast(cloudError(error)); }
}
async function cloudConfirmDelete(event, company) {
  event.preventDefault();
  const typed = String(new FormData(event.currentTarget).get('confirmation') || ''), button = event.currentTarget.querySelector('[type="submit"]');
  if (typed !== company.name) return toast('O nome não corresponde; a empresa não foi excluída');
  button.disabled = true;
  try {
    const { error } = await cloudClient.rpc('delete_company', { p_company_id: company.id }); if (error) throw error;
    cloudCompanies = cloudCompanies.filter(item => item.id !== company.id); cloudCtx = null; closeModal();
    cloudLeaveCompany(); toast('Empresa e dados excluídos');
  } catch (error) { toast(cloudError(error)); button.disabled = false; }
}
async function cloudLeaveCompany(clearLocal = true) {
  clearInterval(cloudPollTimer); cloudCtx = null; cloudQueuedSnapshot = null; cloudRemoteChanged = false; cloudSuppressStorage = true;
  if (clearLocal) try { localStorage.removeItem(KEY); } catch {}
  cloudSuppressStorage = false; document.body.classList.remove('cloud-ready');
  data = load(); await cloudLoadCompanies();
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
  cloudClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { cloudUser = session?.user || null; cloudShowNewPassword(); }
  });
  showCloudAuth('login');
  const { data: sessionData, error } = await cloudClient.auth.getSession();
  if (error) { cloudMessage(cloudError(error), true); return; }
  if (new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery') { cloudUser = sessionData.session?.user || null; cloudShowNewPassword(); return; }
  if (sessionData.session?.user) { cloudUser = sessionData.session.user; await cloudLoadCompanies(); }
}
