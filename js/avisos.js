/**
 * avisos.js — Tudo que avisa a pessoa de que algo aconteceu:
 *   - canais com mensagem nova (negrito) e servidores com novidade (bolinha);
 *   - menções (@nome / @todos), mensagens diretas e gente entrando na call;
 *   - som, notificação do navegador e o "(3) Telão" no título da aba.
 *
 * Como sabemos que um canal tem mensagem nova sem baixar as mensagens de todos?
 * Cada mensagem enviada grava um resumo no próprio canal (campo "ultima").
 * Ouvimos só os documentos dos canais de cada servidor — é pouca coisa.
 */
import { onSnapshot, srvCol } from "./firebase.js";
import { S, salvarConfig } from "./estado.js";
import { $, guardar } from "./util.js";
import { contextoAudio, ehCelular } from "./compat.js";
import { abaAtual, renderTudo } from "./ui.js";
import { mostrarNotificacao } from "./app.js";

/* ------------------------------------------------------------ o que já li */

const chaveLidas = () => "telao-lidas:" + S.user.uid;
let lidas = null;            // cid -> ts da última mensagem que eu vi
const mencoes = new Set();   // canais com menção pra mim ainda não lida

function carregarLidas() {
  if (lidas) return;
  const salvo = JSON.parse(guardar.ler(chaveLidas()) || "{}");
  lidas = salvo.lidas || {};
  for (const cid of salvo.mencoes || []) mencoes.add(cid);
}
function salvarLidas() {
  guardar.salvar(chaveLidas(), JSON.stringify({ lidas, mencoes: [...mencoes] }));
}

/* ------------------------------------------------------------ canais de todos os servidores */

const ouvintes = new Map();  // sid -> função pra parar
const vistos = new Map();    // cid -> ts da "ultima" que já processei (pra não avisar 2x)

/** Liga/desliga os ouvintes conforme entro ou saio de servidores. */
export function sincronizarAtividade() {
  carregarLidas();
  for (const [sid, pararOuvinte] of ouvintes) {
    if (S.servidores.has(sid)) continue;
    pararOuvinte();
    ouvintes.delete(sid);
    S.atividade.delete(sid);
  }
  for (const sid of S.servidores.keys()) {
    if (ouvintes.has(sid)) continue;
    let primeira = true;
    ouvintes.set(sid, onSnapshot(srvCol(sid, "canais"), snap => {
      const canais = new Map();
      snap.forEach(d => canais.set(d.id, d.data()));
      S.atividade.set(sid, canais);
      for (const [cid, canal] of canais) processarCanal(sid, cid, canal, primeira);
      primeira = false;
      atualizarTitulo();
      renderTudo();
    }, () => {}));
  }
}

export function pararAtividade() {
  for (const pararOuvinte of ouvintes.values()) pararOuvinte();
  ouvintes.clear();
  S.atividade.clear();
  vistos.clear();
  mencoes.clear();
  lidas = null;
}

/** Chegou mensagem nova num canal: decide se marca como lida, se avisa e como. */
function processarCanal(sid, cid, canal, primeiraLeitura) {
  const u = canal.ultima;
  if (canal.tipo !== "texto") return;
  if (!u) { if (!primeiraLeitura) vistos.set(cid, 0); return; }

  // primeira vez que vejo este canal neste aparelho (ao abrir o site): considero o que já existia lido
  if (lidas[cid] === undefined && primeiraLeitura) { lidas[cid] = u.ts; salvarLidas(); }

  const jaVisto = vistos.get(cid) ?? (primeiraLeitura ? undefined : 0);
  vistos.set(cid, u.ts);
  if (jaVisto === undefined || u.ts <= jaVisto || u.uid === S.user.uid) return;

  if (estouVendoCanal(sid, cid)) return marcarCanalLido(cid, u.ts);

  const meMencionou = u.todos || (u.mencoes || []).includes(S.user.uid);
  if (meMencionou) {
    mencoes.add(cid);
    salvarLidas();
    const srv = S.servidores.get(sid);
    avisar({
      titulo: `${u.nome} te marcou em #${canal.nome}`,
      texto: (srv ? srv.nome + ": " : "") + u.texto,
      som: "mensagem",
      tag: "canal-" + cid,
      aoClicar: () => irParaCanal(sid, cid),
    });
  }
}

const estouVendoCanal = (sid, cid) => S.chat?.chave === `canal:${sid}:${cid}` && estouVendo();

/** A aba do Telão está na frente e (no celular) na aba de conversa? */
export const estouVendo = () =>
  document.visibilityState === "visible" && (!ehCelular() || abaAtual() === "conversa");

export function marcarCanalLido(cid, ts = Date.now()) {
  carregarLidas();
  const mudou = (lidas[cid] || 0) < ts || mencoes.has(cid);
  lidas[cid] = Math.max(lidas[cid] || 0, ts);
  mencoes.delete(cid);
  if (!mudou) return;
  salvarLidas();
  atualizarTitulo();
  renderTudo();
}

/* ------------------------------------------------------------ perguntas usadas pelo desenho */

export function canalNaoLido(cid, canal) {
  const u = canal?.ultima;
  return !!(lidas && u && u.uid !== S.user.uid && u.ts > (lidas[cid] || 0));
}
export const canalComMencao = cid => mencoes.has(cid);

export function servidorNaoLido(sid) {
  const canais = S.atividade.get(sid);
  return !!canais && [...canais].some(([cid, c]) => canalNaoLido(cid, c));
}
export function mencoesNoServidor(sid) {
  const canais = S.atividade.get(sid);
  return canais ? [...canais.keys()].filter(cid => mencoes.has(cid)).length : 0;
}

/* ------------------------------------------------------------ título da aba */

let contarDmsNaoLidas = () => 0;
/** dm.js informa como contar conversas não lidas (evita importação circular). */
export function definirContadorDms(funcao) { contarDmsNaoLidas = funcao; }

export function atualizarTitulo() {
  const total = mencoes.size + contarDmsNaoLidas();
  document.title = total ? `(${total}) Telão` : "Telão";
}

/* ------------------------------------------------------------ som */

/** Toques curtinhos feitos na hora (sem arquivo de áudio). */
const SONS = {
  mensagem: [[880, 0, .09], [1320, .1, .14]],
  entrou:   [[523, 0, .1], [784, .11, .16]],
  saiu:     [[784, 0, .1], [523, .11, .16]],
};

export function tocar(nome) {
  if (S.config.sons === false || S.surdo) return;
  try {
    const ctx = contextoAudio();
    for (const [freq, inicio, duracao] of SONS[nome]) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      const t = ctx.currentTime + inicio;
      osc.type = "sine";
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duracao + 0.02);
    }
  } catch { /* navegador sem áudio: tudo bem */ }
}

/* ------------------------------------------------------------ notificação do navegador */

const TEM_NOTIFICACAO = "Notification" in window;
export const notificacoesAtivas = () =>
  TEM_NOTIFICACAO && Notification.permission === "granted" && S.config.notificacoes !== false;

/**
 * Avisa a pessoa: toca o som e, se a aba estiver escondida, mostra notificação do sistema.
 * @param {{titulo:string, texto:string, som?:string, tag?:string, aoClicar?:Function}} a
 */
export function avisar({ titulo, texto, som, tag, aoClicar }) {
  if (som) tocar(som);
  if (!notificacoesAtivas() || (document.visibilityState === "visible" && document.hasFocus())) return;
  Promise.resolve()
    .then(() => mostrarNotificacao(titulo, { texto, tag, aoClicar }))
    .catch(() => { /* navegador recusou: fica só o som */ });
}

async function pedirPermissao() {
  if (!TEM_NOTIFICACAO) return;
  const resposta = await Notification.requestPermission();
  S.config.notificacoes = resposta === "granted";
  salvarConfig();
  renderFaixa();
  renderOpcoesAvisos();
}

async function irParaCanal(sid, cid) {
  const { abrirServidor } = await import("./servidores.js");
  const { abrirCanal } = await import("./canais.js");
  abrirServidor(sid);
  const tentar = (n = 0) => S.canais.has(cid) ? abrirCanal(cid) : n < 20 && setTimeout(() => tentar(n + 1), 150);
  tentar();
}

/* ------------------------------------------------------------ faixa "ativar notificações" e opções */

function renderFaixa() {
  const mostrar = TEM_NOTIFICACAO && Notification.permission === "default"
    && !guardar.ler("telao-faixa-notificacoes") && S.config.notificacoes !== false;
  $("faixaNotificacoes").hidden = !mostrar;
}

/** Opções na janela da conta: notificações e sons. */
export function renderOpcoesAvisos() {
  $("chkSons").checked = S.config.sons !== false;
  const bt = $("btNotificacoes");
  const estado = !TEM_NOTIFICACAO ? "indisponivel" : Notification.permission;
  bt.disabled = estado !== "default" && estado !== "granted";
  bt.textContent = {
    indisponivel: "Notificações não funcionam neste navegador",
    denied: "Notificações bloqueadas (libere no cadeado da barra de endereço)",
    default: "Ativar notificações",
    granted: S.config.notificacoes === false ? "Ligar notificações" : "Desligar notificações",
  }[estado];
}

export function iniciarAvisos() {
  renderFaixa();
  $("btAtivarNotificacoes").addEventListener("click", pedirPermissao);
  $("btFecharFaixa").addEventListener("click", () => {
    guardar.salvar("telao-faixa-notificacoes", "1");
    renderFaixa();
  });
  $("chkSons").addEventListener("change", e => { S.config.sons = e.target.checked; salvarConfig(); if (e.target.checked) tocar("mensagem"); });
  $("btNotificacoes").addEventListener("click", () => {
    if (Notification.permission === "default") return pedirPermissao();
    S.config.notificacoes = S.config.notificacoes === false;
    salvarConfig();
    renderOpcoesAvisos();
  });
  // voltou pra aba: o que estiver aberto conta como lido
  document.addEventListener("visibilitychange", () => { if (estouVendo()) S.chat?.aoVer?.(); });
  window.addEventListener("focus", () => S.chat?.aoVer?.());
}
