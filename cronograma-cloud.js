// ════════════════════════════════════════════════════════
//  CRONOGRAMA DE OBRAS — Conta, nuvem (Firebase) e tour guiado
//  Depende de: cronograma.js (state, save, render, STORAGE_KEY...)
//              firebase-config.js (window.FIREBASE_CONFIG)
// ════════════════════════════════════════════════════════
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const hasConfig = !!(cfg.apiKey && cfg.projectId);
  const sdkLoaded = !!(window.firebase && firebase.initializeApp && firebase.auth && firebase.firestore);
  const enabled = hasConfig && sdkLoaded;

  const Cloud = window.Cloud = { enabled, user: null, applying: false, lastSynced: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // JSON estável (chaves ordenadas) para comparar local x nuvem
  const stable = v => {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  };
  const payload = () => { const o = JSON.parse(JSON.stringify(state)); delete o.updatedAt; return o; };

  // ── UI fixa: status de sincronização, botão do tour, menu do usuário ──
  const statusbar = document.getElementById('statusbar');
  const syncEl = document.createElement('span');
  syncEl.id = 'sync-status';
  statusbar && statusbar.appendChild(syncEl);
  const SYNC = {
    local:   ['sync-local',  'Modo local', 'Os dados ficam só neste navegador. Configure o firebase-config.js para salvar na nuvem.'],
    loading: ['sync-busy',   'Carregando da nuvem...', ''],
    saving:  ['sync-busy',   'Sincronizando...', ''],
    ok:      ['sync-ok',     'Salvo na nuvem', 'Todas as alterações estão salvas na sua conta.'],
    offline: ['sync-warn',   'Sem conexão', 'As alterações ficam guardadas e serão enviadas quando a internet voltar.'],
    error:   ['sync-err',    'Erro ao sincronizar', 'Não foi possível salvar na nuvem. Os dados continuam salvos neste navegador.'],
    nosdk:   ['sync-warn',   'Nuvem indisponível', 'Não foi possível carregar o Firebase (sem internet?). Usando a cópia local.'],
  };
  const setSync = k => {
    const [cls, label, tip] = SYNC[k];
    syncEl.className = cls; syncEl.textContent = label; syncEl.title = tip;
  };

  const toolbar = document.getElementById('toolbar');
  if (toolbar) {
    const sep = document.createElement('div'); sep.className = 'tsep';
    const b = document.createElement('button');
    b.className = 'btn-t'; b.id = 'btn-tour'; b.title = 'Rever o tour guiado';
    b.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.2 6.3a1.9 1.9 0 013.6.7c0 1.3-1.8 1.6-1.8 2.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".8" fill="currentColor"/></svg> Ajuda';
    b.addEventListener('click', () => Tour.start(true));
    toolbar.appendChild(sep); toolbar.appendChild(b);
  }

  // ════════════════════════════════════════════════
  //  MODO LOCAL (sem Firebase configurado)
  // ════════════════════════════════════════════════
  if (!enabled) {
    setSync(hasConfig ? 'nosdk' : 'local');
    setTimeout(() => Tour.maybeStart('local'), 700);
    Cloud.queueSave = () => {};
    return defineTour();
  }

  // ════════════════════════════════════════════════
  //  FIREBASE
  // ════════════════════════════════════════════════
  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  auth.languageCode = 'pt';
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  const userDoc = uid => db.collection('users').doc(uid);
  const projDoc = uid => userDoc(uid).collection('projetos').doc('principal');
  const pendingKey = uid => 'oreon_pending_' + uid;

  // ── Tela de acesso ──
  const ov = document.createElement('div');
  ov.id = 'auth-overlay';
  ov.innerHTML = `
    <aside class="auth-brand">
      <div class="auth-brand-top">
        <div class="auth-logo"><span class="auth-logo-mark"></span>Oreon Cronograma</div>
      </div>
      <div class="auth-brand-mid">
        <h1>Planejamento e acompanhamento de obras de segurança eletrônica.</h1>
        <ul>
          <li>Cronograma com Gantt, dependências e feriados nacionais</li>
          <li>Relatório semanal em PDF pronto para o cliente</li>
          <li>Dados na nuvem, disponíveis em qualquer computador</li>
        </ul>
      </div>
      <div class="auth-brand-foot">Hagana Tecnologia &nbsp;|&nbsp; Oreon Soluções</div>
    </aside>
    <main class="auth-main">
      <div class="auth-card" id="auth-card">
        <div class="auth-loading" id="auth-loading"><div class="auth-spin"></div><p id="auth-loading-msg">Verificando sessão...</p></div>

        <form id="form-login" class="auth-form" hidden novalidate>
          <h2>Entrar</h2>
          <p class="auth-sub">Acesse sua conta para abrir seus cronogramas.</p>
          <label class="af">E-mail<input type="email" name="email" autocomplete="email" required></label>
          <label class="af">Senha
            <span class="pw"><input type="password" name="senha" autocomplete="current-password" required><button type="button" class="pw-eye" tabindex="-1">Mostrar</button></span>
          </label>
          <div class="auth-row">
            <label class="chk"><input type="checkbox" name="lembrar" checked> Manter conectado</label>
            <button type="button" class="auth-link" data-go="reset">Esqueci minha senha</button>
          </div>
          <div class="auth-msg" role="alert"></div>
          <button type="submit" class="auth-btn">Entrar</button>
          <p class="auth-switch">Ainda não tem conta? <button type="button" class="auth-link" data-go="signup">Criar conta</button></p>
        </form>

        <form id="form-signup" class="auth-form" hidden novalidate>
          <h2>Criar conta</h2>
          <p class="auth-sub">Leva menos de um minuto. Seus dados ficam vinculados a este e-mail.</p>
          <label class="af">Nome<input type="text" name="nome" autocomplete="name" required></label>
          <label class="af">E-mail<input type="email" name="email" autocomplete="email" required></label>
          <label class="af">Senha
            <span class="pw"><input type="password" name="senha" autocomplete="new-password" minlength="6" required><button type="button" class="pw-eye" tabindex="-1">Mostrar</button></span>
            <small>Mínimo de 6 caracteres.</small>
          </label>
          <label class="af">Confirmar senha<input type="password" name="senha2" autocomplete="new-password" required></label>
          <div class="auth-msg" role="alert"></div>
          <button type="submit" class="auth-btn">Criar conta</button>
          <p class="auth-switch">Já tem conta? <button type="button" class="auth-link" data-go="login">Entrar</button></p>
        </form>

        <form id="form-reset" class="auth-form" hidden novalidate>
          <h2>Redefinir senha</h2>
          <p class="auth-sub">Informe o e-mail da conta. Enviaremos um link para você criar uma nova senha.</p>
          <label class="af">E-mail<input type="email" name="email" autocomplete="email" required></label>
          <div class="auth-msg" role="alert"></div>
          <button type="submit" class="auth-btn">Enviar link</button>
          <p class="auth-switch"><button type="button" class="auth-link" data-go="login">Voltar para o login</button></p>
        </form>

        ${location.protocol === 'file:' ? `<p class="auth-note">Você abriu o sistema direto do computador (file://). Se o login não funcionar, publique a pasta no Firebase Hosting ou GitHub Pages.</p>` : ''}
      </div>
    </main>`;
  document.body.appendChild(ov);
  document.documentElement.classList.add('auth-open');

  const forms = { login: ov.querySelector('#form-login'), signup: ov.querySelector('#form-signup'), reset: ov.querySelector('#form-reset') };
  const loadingEl = ov.querySelector('#auth-loading');
  const showForm = name => {
    loadingEl.hidden = true;
    Object.entries(forms).forEach(([k, f]) => { f.hidden = k !== name; f.querySelector('.auth-msg').textContent = ''; f.querySelector('.auth-msg').className = 'auth-msg'; });
    const email = ov.querySelector('form:not([hidden]) input[name=email]');
    const prev = ov.dataset.email;
    if (email && prev && !email.value) email.value = prev;
    const first = forms[name].querySelector('input:not([type=checkbox])');
    setTimeout(() => first && (first.value ? forms[name].querySelector('input[type=password]') || first : first).focus(), 30);
  };
  const showLoading = msg => { Object.values(forms).forEach(f => f.hidden = true); loadingEl.hidden = false; ov.querySelector('#auth-loading-msg').textContent = msg; };
  const openAuth = form => { ov.classList.remove('closing'); ov.style.display = ''; document.documentElement.classList.add('auth-open'); showForm(form); };
  const closeAuth = () => { ov.classList.add('closing'); document.documentElement.classList.remove('auth-open'); setTimeout(() => { ov.style.display = 'none'; }, 250); };

  ov.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { const cur = ov.querySelector('form:not([hidden]) input[name=email]'); if (cur) ov.dataset.email = cur.value; showForm(go.dataset.go); }
    const eye = e.target.closest('.pw-eye');
    if (eye) { const inp = eye.previousElementSibling; const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.textContent = show ? 'Ocultar' : 'Mostrar'; }
  });

  const ERR = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-email': 'Informe o e-mail.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/missing-password': 'Informe a senha.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use a opção Entrar.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no projeto Firebase.',
    'auth/configuration-not-found': 'O Authentication ainda não foi ativado no Firebase. No console: Authentication > Vamos começar > Método de login > ative E-mail/senha.',
    'auth/operation-not-supported-in-this-environment': 'Este navegador bloqueou o login ao abrir o arquivo direto. Publique o sistema em um endereço http(s).',
    'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication > Settings > Domínios autorizados).',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Chave de API inválida no firebase-config.js.',
  };
  const errMsg = e => ERR[e && e.code] || ('Não foi possível concluir a operação.' + (e && e.code ? ' (' + e.code + ')' : ''));
  const busy = (form, on, label) => { const b = form.querySelector('.auth-btn'); b.disabled = on; if (on) { b.dataset.l = b.textContent; b.textContent = label; } else if (b.dataset.l) b.textContent = b.dataset.l; };
  const msg = (form, text, ok) => { const m = form.querySelector('.auth-msg'); m.textContent = text; m.className = 'auth-msg' + (text ? (ok ? ' ok' : ' err') : ''); };
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  forms.login.addEventListener('submit', async e => {
    e.preventDefault();
    const f = forms.login, email = f.email.value.trim(), senha = f.senha.value;
    if (!emailOk(email)) return msg(f, 'Informe um e-mail válido.');
    if (!senha) return msg(f, 'Informe a senha.');
    msg(f, ''); busy(f, true, 'Entrando...');
    try {
      await auth.setPersistence(f.lembrar.checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      await auth.signInWithEmailAndPassword(email, senha);
    } catch (err) { msg(f, errMsg(err)); busy(f, false); }
  });

  forms.signup.addEventListener('submit', async e => {
    e.preventDefault();
    const f = forms.signup, nome = f.nome.value.trim(), email = f.email.value.trim(), senha = f.senha.value;
    if (nome.length < 2) return msg(f, 'Informe seu nome.');
    if (!emailOk(email)) return msg(f, 'Informe um e-mail válido.');
    if (senha.length < 6) return msg(f, 'A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== f.senha2.value) return msg(f, 'As senhas não conferem.');
    msg(f, ''); busy(f, true, 'Criando conta...');
    try {
      Cloud.signingUp = true;
      const cred = await auth.createUserWithEmailAndPassword(email, senha);
      await cred.user.updateProfile({ displayName: nome });
      await userDoc(cred.user.uid).set({ nome, email, criadoEm: firebase.firestore.FieldValue.serverTimestamp(), tourConcluido: false }, { merge: true });
      Cloud.signingUp = false;
      onSignedIn(auth.currentUser);
    } catch (err) {
      Cloud.signingUp = false;
      if (auth.currentUser) return onSignedIn(auth.currentUser);
      msg(f, errMsg(err)); busy(f, false);
    }
  });

  forms.reset.addEventListener('submit', async e => {
    e.preventDefault();
    const f = forms.reset, email = f.email.value.trim();
    if (!emailOk(email)) return msg(f, 'Informe um e-mail válido.');
    busy(f, true, 'Enviando...');
    try { await auth.sendPasswordResetEmail(email); msg(f, 'Se houver uma conta com este e-mail, o link chega em alguns minutos. Confira também o spam.', true); }
    catch (err) { msg(f, errMsg(err)); }
    busy(f, false);
  });

  // ── Menu do usuário no cabeçalho ──
  const header = document.getElementById('header');
  const um = document.createElement('div');
  um.id = 'user-menu';
  um.innerHTML = `<button id="user-btn" type="button" aria-haspopup="true"><span class="ua"></span><span class="un"></span><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg></button>
    <div id="user-drop" hidden>
      <div class="ud-head"><strong class="ud-name"></strong><span class="ud-mail"></span></div>
      <button type="button" data-act="tour">Rever tour guiado</button>
      <button type="button" data-act="reset">Alterar senha por e-mail</button>
      <button type="button" data-act="logout" class="ud-danger">Sair</button>
    </div>`;
  header && header.appendChild(um);
  const drop = um.querySelector('#user-drop');
  um.querySelector('#user-btn').addEventListener('click', e => { e.stopPropagation(); drop.hidden = !drop.hidden; });
  document.addEventListener('click', e => { if (!um.contains(e.target)) drop.hidden = true; });
  drop.addEventListener('click', async e => {
    const act = e.target.dataset.act; if (!act) return;
    drop.hidden = true;
    if (act === 'tour') Tour.start(true);
    if (act === 'reset') { try { await auth.sendPasswordResetEmail(Cloud.user.email); toast('Link para alterar a senha enviado para ' + Cloud.user.email, 3500); } catch (err) { toast(errMsg(err), 3500); } }
    if (act === 'logout') logout();
  });
  const fillUser = u => {
    const nome = u.displayName || u.email.split('@')[0];
    const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    um.querySelector('.ua').textContent = ini;
    um.querySelector('.un').textContent = nome.split(' ')[0];
    um.querySelector('.ud-name').textContent = nome;
    um.querySelector('.ud-mail').textContent = u.email;
  };

  async function logout() {
    if (localStorage.getItem(pendingKey(Cloud.user.uid)) && !navigator.onLine) {
      if (!confirm('Existem alterações que ainda não foram enviadas para a nuvem (sem internet). Se sair agora, elas serão perdidas. Sair mesmo assim?')) return;
    }
    flushNow();
    if (Cloud.unsub) Cloud.unsub();
    await auth.signOut();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  }

  // ── Aplicar dados vindos da nuvem ──
  function applyState(data) {
    Cloud.applying = true;
    state = Object.assign({ projectName: '', supervisorName: '', tasks: [], nextId: 1, relatorios: [], relNextId: 1 }, data, { ownerUid: Cloud.user.uid });
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Array.isArray(state.relatorios)) state.relatorios = [];
    projectNameEl.value = state.projectName;
    const sup = document.getElementById('supervisor-name'); if (sup) sup.value = state.supervisorName || '';
    selectedId = null;
    render();
    if (typeof currentView !== 'undefined' && currentView === 'relatorio') renderRelatorios();
    Cloud.lastSynced = stable(payload());
    Cloud.applying = false;
  }

  // ── Gravação (com espera para agrupar alterações) ──
  let timer = null;
  function writeNow() {
    timer = null;
    const u = Cloud.user; if (!u) return;
    const data = payload(), s = stable(data);
    if (s === Cloud.lastSynced) { localStorage.removeItem(pendingKey(u.uid)); setSync(navigator.onLine ? 'ok' : 'offline'); return; }
    setSync(navigator.onLine ? 'saving' : 'offline');
    projDoc(u.uid).set({ data, clientUpdatedAt: Date.now(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(() => { Cloud.lastSynced = s; if (stable(payload()) === s) localStorage.removeItem(pendingKey(u.uid)); setSync('ok'); })
      .catch(err => { console.error('[nuvem]', err); setSync(navigator.onLine ? 'error' : 'offline'); });
  }
  function flushNow() { if (timer) { clearTimeout(timer); writeNow(); } }
  Cloud.queueSave = () => {
    const u = Cloud.user;
    if (!u || Cloud.applying) return;
    state.ownerUid = u.uid;
    if (stable(payload()) === Cloud.lastSynced) return;
    try { localStorage.setItem(pendingKey(u.uid), '1'); } catch (e) {}
    setSync(navigator.onLine ? 'saving' : 'offline');
    clearTimeout(timer); timer = setTimeout(writeNow, 1200);
  };
  window.addEventListener('online', () => { if (Cloud.user) { setSync('saving'); writeNow(); } });
  window.addEventListener('offline', () => { if (Cloud.user) setSync('offline'); });
  window.addEventListener('beforeunload', flushNow);

  // ── Entrada do usuário ──
  async function onSignedIn(user) {
    if (Cloud.user && Cloud.user.uid === user.uid) return;
    Cloud.user = user;
    showLoading('Carregando seus dados...');
    setSync('loading');
    fillUser(user);
    const uid = user.uid;
    let local = null;
    try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    const pending = !!localStorage.getItem(pendingKey(uid)) && local && local.ownerUid === uid;
    let profile = {};
    try {
      const [snap, prof] = await Promise.all([projDoc(uid).get(), userDoc(uid).get()]);
      profile = prof.exists ? prof.data() : {};
      if (snap.exists && !pending) {
        applyState(snap.data().data || {});
      } else if (snap.exists && pending) {
        applyState(local); Cloud.lastSynced = null; Cloud.queueSave(); toast('Alterações feitas sem internet foram enviadas para a nuvem.', 3500);
      } else {
        // primeira vez nesta conta: aproveita o projeto local (se for deste usuário ou ainda sem dono)
        const hasLocal = local && Array.isArray(local.tasks) && local.tasks.length && (!local.ownerUid || local.ownerUid === uid);
        const usable = hasLocal && confirm('Encontramos neste navegador um projeto salvo' + (local.projectName ? ' ("' + local.projectName + '")' : '') + ' com ' + local.tasks.length + ' etapa(s).\n\nOK = levar este projeto para a sua conta\nCancelar = começar com um projeto em branco');
        applyState(usable ? local : {});
        Cloud.lastSynced = null; Cloud.queueSave(); flushNow();
        if (usable) toast('Seu projeto local foi enviado para a nuvem.', 3500);
      }
      userDoc(uid).set({ nome: user.displayName || profile.nome || '', email: user.email, ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      if (Cloud.lastSynced) setSync(navigator.onLine ? 'ok' : 'offline');
    } catch (err) {
      console.error('[nuvem]', err);
      setSync(navigator.onLine ? 'error' : 'offline');
      toast(err && err.code === 'permission-denied' ? 'Sem permissão no Firestore. Confira as regras de segurança.' : 'Não foi possível carregar da nuvem. Usando a cópia deste navegador.', 4500);
    }
    closeAuth();
    // tempo real: mudanças feitas em outro computador
    Cloud.unsub = projDoc(uid).onSnapshot(snap => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      const d = snap.data().data || {};
      const s = stable(d);
      if (s === Cloud.lastSynced || s === stable(payload())) { Cloud.lastSynced = s; return; }
      if (timer) return; // há edição local aguardando envio: ela prevalece
      const modalOpen = typeof modalOverlay !== 'undefined' && !modalOverlay.hidden;
      if (modalOpen) return;
      applyState(d);
      toast('Projeto atualizado com alterações de outro dispositivo.', 3000);
    }, () => {});
    Tour.maybeStart(uid, profile.tourConcluido === true, () => userDoc(uid).set({ tourConcluido: true }, { merge: true }).catch(() => {}));
  }

  auth.onAuthStateChanged(user => {
    if (user) { if (!Cloud.signingUp) onSignedIn(user); }
    else { Cloud.user = null; openAuth('login'); }
  });

  defineTour();

  // ════════════════════════════════════════════════
  //  TOUR GUIADO
  // ════════════════════════════════════════════════
  function defineTour() {
    const $q = s => document.querySelector(s);
    const modalOpen = () => typeof modalOverlay !== 'undefined' && !modalOverlay.hidden;
    const nTasks = () => state.tasks.length;
    const tabActive = t => { const b = $q('.modal-tab[data-tab="' + t + '"]'); return b && b.classList.contains('active'); };
    const ctx = {};

    // Cada passo: el (destaque), anchor (onde posicionar o balão), wait (condição que avança sozinho),
    // ready (condição que libera o botão Próximo), needModal (volta ao passo "back" se o formulário fechar)
    const STEPS = [
      { key: 'intro', title: 'Vamos montar sua primeira obra', text: 'Neste passo a passo você vai usar o sistema de verdade: dar nome à obra, criar duas etapas, atualizar o andamento e montar o relatório da semana. Leva uns 3 minutos. O que for criado fica no seu projeto e pode ser apagado depois.', btn: 'Começar' },

      { key: 'nome', el: '#project-name', title: 'Dê um nome à obra', text: 'Clique no campo destacado, digite o nome da obra (por exemplo, o nome do condomínio) e tecle Enter.',
        enter() { ctx.name0 = state.projectName; setTimeout(() => projectNameEl.focus(), 300); },
        wait: () => !!state.projectName && state.projectName !== ctx.name0, done: 'Nome salvo. Ele aparece em todos os relatórios.' },

      { key: 'resp', el: '#header-supervisor', title: 'Quem é o responsável?', text: 'Digite o nome do responsável técnico e tecle Enter. Ele sai no rodapé e na assinatura dos relatórios.',
        enter() { ctx.sup0 = state.supervisorName; setTimeout(() => { const i = $q('#supervisor-name'); i && i.focus(); }, 300); },
        wait: () => !!state.supervisorName && state.supervisorName !== ctx.sup0, skip: true, done: 'Anotado.' },

      { key: 'nova1', el: '#btn-new-task', title: 'Crie a primeira etapa', text: 'Clique em Nova Tarefa.', enter() { ctx.count = nTasks(); }, wait: modalOpen },

      { key: 'nome1', el: '#f-name', anchor: '#modal', title: 'Nome da etapa', text: 'Digite o nome da primeira etapa da obra. Ex.: Passagem de infraestrutura.',
        needModal: true, back: 'nova1', ready: () => $q('#f-name').value.trim().length >= 3, jumpIf: () => nTasks() > ctx.count, jumpTo: 'ver1' },

      { key: 'dur1', el: '#f-dur', anchor: '#modal', title: 'Quanto tempo leva?', text: 'Informe a duração em dias úteis. Repare que o campo Fim se ajusta sozinho, pulando fins de semana e feriados.',
        needModal: true, back: 'nova1', ready: () => +$q('#f-dur').value > 0, jumpIf: () => nTasks() > ctx.count, jumpTo: 'ver1' },

      { key: 'ini1', el: '#f-start', anchor: '#modal', title: 'Quando começa?', text: 'Escolha a data e a hora de início. O sistema já sugere amanhã às 8h.',
        needModal: true, back: 'nova1', ready: () => !!$q('#f-start').value, jumpIf: () => nTasks() > ctx.count, jumpTo: 'ver1' },

      { key: 'add1', el: '#modal-save', anchor: '#modal', title: 'Adicione a etapa', text: 'Clique em Adicionar.', needModal: true, back: 'nova1', wait: () => nTasks() > ctx.count },

      { key: 'ver1', el: '#main', title: 'Pronto, veja o resultado', text: 'A etapa entrou na lista à esquerda e virou uma barra no Gantt, do início ao término. A linha tracejada azul marca o dia de hoje.',
        enter() { ctx.t1 = state.tasks[state.tasks.length - 1]; }, btn: 'Próximo' },

      { key: 'nova2', el: '#btn-new-task', title: 'Agora uma etapa que depende da primeira', text: 'Clique em Nova Tarefa de novo. Esta segunda etapa só pode começar quando a primeira terminar.', enter() { ctx.count = nTasks(); }, wait: modalOpen },

      { key: 'nome2', el: '#f-name', anchor: '#modal', title: 'Nome da segunda etapa', text: 'Digite o nome. Ex.: Instalação dos equipamentos.',
        needModal: true, back: 'nova2', ready: () => $q('#f-name').value.trim().length >= 3 },

      { key: 'aba2', el: '.modal-tab[data-tab="tab-pred"]', anchor: '#modal', title: 'Ligue as etapas', text: 'Abra a aba Antecessores.', needModal: true, back: 'nova2', wait: () => tabActive('tab-pred') },

      { key: 'pred2', el: '#pred-list', anchor: '#modal', title: 'Escolha a antecessora', text: 'Marque a primeira etapa. Assim esta só começa depois que aquela terminar.',
        needModal: true, back: 'nova2', wait: () => !!$q('#pred-list input:checked') },

      { key: 'add2', el: '#modal-save', anchor: '#modal', title: 'Adicione', text: 'Clique em Adicionar.', needModal: true, back: 'nova2', wait: () => nTasks() > ctx.count },

      { key: 'ver2', el: '#gantt-panel', place: 'left', title: 'O sistema encaixou a sequência', text: 'A segunda etapa foi posicionada logo depois do término da primeira, e a seta mostra a dependência. Se a primeira mudar de data, a segunda acompanha.', btn: 'Próximo' },

      { key: 'edit', el: () => ctx.t1 && $q('#task-body tr[data-id="' + ctx.t1.id + '"]'), title: 'Atualize o andamento', text: 'Dê um duplo clique na primeira etapa para abrir a edição.', wait: () => modalOpen() && editingId !== null },

      { key: 'abaAv', el: '.modal-tab[data-tab="tab-adv"]', anchor: '#modal', title: 'Aba Avançado', text: 'Abra a aba Avançado.', needModal: true, back: 'edit', wait: () => tabActive('tab-adv') },

      { key: 'pct', el: () => $q('#f-pct') && $q('#f-pct').closest('.field-group'), anchor: '#modal', title: 'Quanto já foi feito?', text: 'Arraste a barra até o percentual executado, por exemplo 40%. Aqui também dá para informar o responsável pela etapa.',
        needModal: true, back: 'edit', ready: () => +$q('#f-pct').value > 0 },

      { key: 'salvar', el: '#modal-save', anchor: '#modal', title: 'Salve', text: 'Clique em Salvar e veja a barra no Gantt.', needModal: true, back: 'edit', wait: () => !modalOpen() && ctx.t1 && (state.tasks.find(t => t.id === ctx.t1.id) || {}).percentComplete > 0 },

      { key: 'ver3', el: '#gantt-panel', place: 'left', title: 'O andamento aparece na barra', text: 'A parte escura da barra mostra o quanto foi executado. Quando chegar a 100%, a barra fica verde.', btn: 'Próximo' },

      { key: 'rel', el: '#view-relatorio', title: 'Relatório semanal', text: 'Clique em Rel. Semanal. É aqui que você registra a semana para enviar ao cliente.', wait: () => typeof currentView !== 'undefined' && currentView === 'relatorio', enter() { ctx.rels = state.relatorios.length; } },

      { key: 'semana', el: '#btn-rel-new', title: 'Abra a semana', text: 'Clique em Nova Semana. O período de segunda a domingo é preenchido sozinho.', wait: () => state.relatorios.length > ctx.rels },

      { key: 'check', el: () => $q('#rel-list .rel-card input[type=checkbox]') && $q('#rel-list .rel-card input[type=checkbox]').closest('div[style*="max-height"]'), title: 'O que foi feito?', text: 'Marque as etapas em que a equipe trabalhou nesta semana.',
        wait: () => !!$q('#rel-list .rel-card input[type=checkbox]:checked') },

      { key: 'obs', el: '#rel-list .rel-card textarea', title: 'Ocorrências', text: 'Se houve algo importante (chuva, falta de material, pedido do cliente), anote aqui. Se não houve, pode seguir.', btn: 'Próximo', enter() { setTimeout(() => { const t = $q('#rel-list .rel-card textarea'); t && t.focus(); }, 300); } },

      { key: 'pdf', el: '#rel-list .rel-card [data-pdf-rel]', title: 'Gere o PDF do cliente', text: 'Clique em Exportar PDF. Sai um resumo de uma página, pronto para mandar por e-mail ou WhatsApp. O botão Completo gera a versão detalhada.',
        enter() { ctx.pdf = false; const b = $q('#rel-list .rel-card [data-pdf-rel]'); b && b.addEventListener('click', () => { ctx.pdf = true; }, { once: true }); }, wait: () => ctx.pdf, skip: true },

      { key: 'fim', title: 'Tudo pronto!', text: 'Você montou a obra, criou etapas ligadas entre si, atualizou o andamento e gerou o relatório da semana. Na rotina é só isso: atualizar o percentual das etapas e, no fim da semana, marcar o que foi feito e exportar o PDF. Para rever este guia, use o botão Ajuda.', btn: 'Concluir' },
    ];
    const idx = k => STEPS.findIndex(s => s.key === k);

    let i = 0, active = false, onDone = null, key = 'local', tick = null, lastRect = '', leftModalAt = 0, advancing = false;
    let spot, pop;

    const resolve = sel => typeof sel === 'function' ? sel() : (sel ? $q(sel) : null);
    const visible = el => el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;

    function build() {
      spot = document.createElement('div'); spot.className = 'tour-spot';
      pop = document.createElement('div'); pop.className = 'tour-pop'; pop.setAttribute('role', 'dialog');
      document.body.append(spot, pop);
      pop.addEventListener('click', e => {
        const a = e.target.closest('[data-t]'); if (!a) return;
        const t = a.dataset.t;
        if (t === 'next' && !a.disabled) go(i + 1);
        if (t === 'skip') go(i + 1);
        if (t === 'close') end(false);
      });
    }

    function place() {
      const s = STEPS[i];
      const el = resolve(s.el);
      const anchor = s.anchor ? $q(s.anchor) : null;
      const vw = innerWidth, vh = innerHeight;
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let key2;
      if (!el || !visible(el)) {
        spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
        pop.style.left = Math.round((vw - pw) / 2) + 'px'; pop.style.top = Math.round((vh - ph) / 2) + 'px';
        pop.dataset.arrow = 'none';
        return;
      }
      const r = el.getBoundingClientRect(), pad = 5;
      const sx = Math.max(3, r.left - pad), sy = Math.max(3, r.top - pad);
      const sw = Math.min(vw - 6, r.width + pad * 2), sh = Math.min(vh - 6, r.height + pad * 2);
      key2 = [sx, sy, sw, sh, pw, ph].map(Math.round).join(',');
      if (key2 === lastRect) return;
      lastRect = key2;
      spot.style.cssText = `left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;`;
      let x, y, arrow = 'none';
      if (anchor && visible(anchor)) {
        const a = anchor.getBoundingClientRect();
        if (a.right + 16 + pw < vw) { x = a.right + 16; arrow = 'left'; }
        else if (a.left - 16 - pw > 0) { x = a.left - 16 - pw; arrow = 'right'; }
        else { x = vw - pw - 12; }
        y = Math.min(Math.max(12, r.top + r.height / 2 - 28), vh - ph - 12);
        pop.style.setProperty('--ay', Math.max(14, Math.min(ph - 14, r.top + r.height / 2 - y)) + 'px');
      } else {
        const below = sy + sh + 12 + ph < vh, above = sy - 12 - ph > 0;
        if (s.place === 'left' && sx - 16 - pw > 0) { x = sx - 14 - pw; y = sy + Math.min(sh / 2 - ph / 2, 40); arrow = 'right'; pop.style.setProperty('--ay', '22px'); }
        else if (below) { x = sx; y = sy + sh + 12; arrow = 'top'; }
        else if (above) { x = sx; y = sy - 12 - ph; arrow = 'bottom'; }
        else { x = sx + sw - pw - 16; y = sy + 16; }
        pop.style.setProperty('--ax', Math.max(18, Math.min(pw - 18, sx + Math.min(sw, 60) / 2 - Math.max(12, Math.min(x, vw - pw - 12)))) + 'px');
      }
      x = Math.max(12, Math.min(x, vw - pw - 12)); y = Math.max(12, Math.min(y, vh - ph - 12));
      pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(y) + 'px';
      pop.dataset.arrow = arrow;
    }

    function draw() {
      const s = STEPS[i], last = i === STEPS.length - 1;
      const total = STEPS.length - 2; // sem intro e fim
      const num = Math.min(Math.max(i, 1), total);
      const pct = Math.round(Math.max(0, i - 0) / (STEPS.length - 1) * 100);
      const action = !!s.wait;
      pop.innerHTML = `
        ${s.key !== 'intro' && !last ? `<div class="tp-step">Passo ${num} de ${total}</div>` : ''}
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.text)}</p>
        <div class="tp-done" hidden></div>
        <div class="tp-bar"><i style="width:${pct}%"></i></div>
        <div class="tp-foot">
          <div class="tp-hint">${action ? '<span class="tp-pulse"></span>Aguardando você' : s.ready ? 'Preencha para continuar' : ''}</div>
          <div class="tp-btns">
            ${s.skip ? `<button type="button" class="tp-ghost" data-t="skip">Pular</button>` : ''}
            ${action ? '' : `<button type="button" class="tp-main" data-t="next" ${s.ready ? 'disabled' : ''}>${s.btn || (last ? 'Concluir' : 'Próximo')}</button>`}
          </div>
        </div>
        ${last ? '' : `<button type="button" class="tp-close" data-t="close" title="Sair do guia">×</button>`}`;
      lastRect = '';
      place();
    }

    function go(n) {
      if (n >= STEPS.length) return end(true);
      i = Math.max(0, n);
      advancing = false; leftModalAt = 0;
      const s = STEPS[i];
      if (s.enter) s.enter();
      draw();
    }

    function succeed() {
      const s = STEPS[i];
      advancing = true;
      if (s.done) {
        const d = pop.querySelector('.tp-done'); d.textContent = s.done; d.hidden = false;
        const h = pop.querySelector('.tp-hint'); if (h) h.innerHTML = '';
        setTimeout(() => active && go(i + 1), 1100);
      } else setTimeout(() => active && go(i + 1), 350);
    }

    function loop() {
      if (!active) return;
      const s = STEPS[i];
      if (!advancing) {
        if (s.jumpIf && s.jumpIf()) { go(idx(s.jumpTo)); return; }
        if (s.needModal && !modalOpen()) {
          if (!leftModalAt) leftModalAt = Date.now();
          else if (Date.now() - leftModalAt > 700) { go(idx(s.back)); return; }
        } else leftModalAt = 0;
        if (s.wait && s.wait()) succeed();
        if (s.ready) { const b = pop.querySelector('[data-t=next]'); if (b) b.disabled = !s.ready(); }
      }
      place();
    }

    function end(completed) {
      active = false;
      clearInterval(tick);
      removeEventListener('resize', place);
      [spot, pop].forEach(n => n && n.remove());
      try { localStorage.setItem('oreon_tour_done_' + key, '1'); } catch (e) {}
      if (onDone) onDone();
      if (completed) toast('Guia concluído. O botão Ajuda abre ele de novo quando quiser.', 3200);
      else toast('Guia encerrado. Para retomar, use o botão Ajuda.', 3000);
    }

    function start() {
      if (active) return;
      if (typeof setView === 'function') setView('gantt');
      if (modalOpen()) closeModal();
      active = true; build(); go(0);
      tick = setInterval(loop, 250);
      addEventListener('resize', place);
    }

    window.Tour = {
      start,
      maybeStart(k, doneRemote, cb) {
        key = k || 'local'; onDone = cb || null;
        let doneLocal = false;
        try { doneLocal = localStorage.getItem('oreon_tour_done_' + key) === '1'; } catch (e) {}
        if (!doneLocal && !doneRemote) setTimeout(start, 600);
      },
    };
  }
})();
