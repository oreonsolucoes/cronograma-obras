// ═══════════════════════════════════════════════════════════
//  Oreon Cronograma — Google Apps Script
//  Upload de fotos da equipe para o Google Drive
//
//  Publicar como Web App:
//    Execute as: Me (seu usuário Google)
//    Who has access: Anyone
// ═══════════════════════════════════════════════════════════

// ── Configuração ────────────────────────────────────────────
// Cole aqui o ID da pasta raiz do Drive onde as fotos serão salvas.
// Ex: na URL https://drive.google.com/drive/folders/1AbCdEfGh... → ID = "1AbCdEfGh..."
var PASTA_RAIZ_ID = 'COLE_O_ID_DA_PASTA_AQUI';

// ── Entry point (POST) ──────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var resultado = processarEnvio(payload);
    return resposta(200, resultado);
  } catch (err) {
    return resposta(500, { erro: err.message });
  }
}

// ── Processa o envio completo da equipe ─────────────────────
function processarEnvio(payload) {
  // payload esperado:
  // {
  //   obraId: "abc123",
  //   obraNome: "Condomínio Aura",
  //   semana: "2026-S39",
  //   respondente: "João Silva",
  //   etapas: {
  //     "Cabeamento": { fotos: ["data:image/jpeg;base64,...", ...] },
  //     "Instalação": { fotos: [...] }
  //   }
  // }

  var pastaRaiz   = DriveApp.getFolderById(PASTA_RAIZ_ID);
  var pastaObra   = obterOuCriarPasta(pastaRaiz,   payload.obraNome || payload.obraId);
  var pastaSemana = obterOuCriarPasta(pastaObra,   payload.semana);
  var pastaResp   = obterOuCriarPasta(pastaSemana, sanitizarNome(payload.respondente));

  var urlsPorEtapa = {};

  var etapas = payload.etapas || {};
  var nomesEtapas = Object.keys(etapas);

  for (var i = 0; i < nomesEtapas.length; i++) {
    var nomeEtapa = nomesEtapas[i];
    var dadosEtapa = etapas[nomeEtapa];
    var fotos = dadosEtapa.fotos || [];

    if (fotos.length === 0) continue;

    var pastaEtapa = obterOuCriarPasta(pastaResp, sanitizarNome(nomeEtapa));
    var urls = [];

    for (var j = 0; j < fotos.length; j++) {
      var base64 = fotos[j];
      var url = salvarFoto(pastaEtapa, base64, j + 1);
      if (url) urls.push(url);
    }

    urlsPorEtapa[nomeEtapa] = urls;
  }

  return { sucesso: true, urlsPorEtapa: urlsPorEtapa };
}

// ── Salva uma foto (base64) no Drive e retorna URL pública ──
function salvarFoto(pasta, base64, numero) {
  // Remove prefixo "data:image/jpeg;base64," etc.
  var matches = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;

  var mimeType = matches[1];            // ex: "image/jpeg"
  var dados    = matches[2];
  var extensao = mimeType.split('/')[1] || 'jpg';
  var nomeArq  = 'foto_' + String(numero).padStart(2, '0') + '.' + extensao;

  var blob   = Utilities.newBlob(Utilities.base64Decode(dados), mimeType, nomeArq);
  var arquivo = pasta.createFile(blob);

  // Torna o arquivo público (qualquer pessoa com o link pode ver)
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // URL direta para visualização/download
  var fileId = arquivo.getId();
  return 'https://drive.google.com/uc?export=view&id=' + fileId;
}

// ── Helpers ─────────────────────────────────────────────────
function obterOuCriarPasta(pai, nome) {
  var existentes = pai.getFoldersByName(nome);
  if (existentes.hasNext()) return existentes.next();
  return pai.createFolder(nome);
}

function sanitizarNome(nome) {
  // Remove caracteres inválidos para nomes de pasta/arquivo
  return (nome || 'sem-nome').replace(/[\/\\:*?"<>|]/g, '_').trim().substring(0, 80);
}

function resposta(status, obj) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── Entry point (GET) — teste de saúde ──────────────────────
function doGet() {
  return resposta(200, { status: 'ok', app: 'Oreon Cronograma — Upload Drive' });
}
