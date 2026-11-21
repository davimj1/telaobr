/**
 * midia.js — Microfone (sempre ligado ou apertar-pra-falar), qualidade de voz,
 * escolha do microfone, câmera, transmitir tela, ensurdecer e volume.
 */
import { S, salvarConfig } from "./estado.js";
import { QUALIDADES, QUALIDADES_VOZ } from "./config.js";
import { $, aviso, aoEscolher } from "./util.js";
import { PODE_TRANSMITIR, PODE_ESCOLHER_SAIDA, direcionarTudo } from "./compat.js";
import { aplicarEmTodos, ajustarSaidas } from "./rtc.js";
import { atualizarMeuStatus } from "./call.js";
import { pode } from "./permissoes.js";
import { renderPalco } from "./palco.js";
import { detectarFala } from "./fala.js";

let micMutado = false; // o botão de mudo (vale também no apertar-pra-falar)

/** Botões que existem em mais de um lugar usam data-acao="..." */
const botoes = acao => document.querySelectorAll(`[data-acao="${acao}"]`);

/* ------------------------------------------------------------ microfone */

function opcoesMicrofone() {
  const voz = QUALIDADES_VOZ[S.config.qualidadeVoz] || QUALIDADES_VOZ.voz;
  return {
    audio: {
      deviceId: S.config.micId ? { ideal: S.config.micId } : undefined,
      echoCancellation: voz.processar, noiseSuppression: voz.processar, autoGainControl: voz.processar,
      channelCount: voz.estereo ? 2 : 1,
    },
  };
}

/** O microfone está mandando som agora? */
export function micEstaAberto() {
  const faixa = S.mic?.getAudioTracks()[0];
  return !!faixa && faixa.enabled;
}

/** Liga/desliga a faixa conforme mudo e apertar-pra-falar. */
function aplicarEstadoMic() {
  const faixa = S.mic?.getAudioTracks()[0];
  if (!faixa) return;
  const ptt = S.config.modoMic === "ptt";
  faixa.enabled = !micMutado && (!ptt || S.apertandoPtt);
  atualizarMeuStatus({ mic: !micMutado });
  atualizarBotoes();
}

/** Pede o microfone. silencioso = não mostra erro (entra só ouvindo). */
export async function ligarMicrofone({ silencioso = false } = {}) {
  try {
    S.mic = await navigator.mediaDevices.getUserMedia(opcoesMicrofone());
    detectarFala(S.user.uid, S.mic);
    aplicarEstadoMic();
  } catch {
    S.mic = null;
    aviso(silencioso ? "Sem microfone: você entra só ouvindo." : "Não deu acesso ao microfone.");
  }
}

/** Troca o microfone (depois de mudar a configuração) sem sair da call. */
async function reiniciarMicrofone() {
  if (!S.mic) return;
  S.mic.getTracks().forEach(t => t.stop());
  await ligarMicrofone();
  aplicarEmTodos();
}

async function alternarMicrofone() {
  if (!S.call) return aviso("Entre num canal de voz primeiro.");
  if (!S.mic) {
    micMutado = false;
    await ligarMicrofone();
    if (S.mic) aplicarEmTodos();
    return;
  }
  micMutado = !micMutado;
  aplicarEstadoMic();
}

/* ------------------------------------------------------------ apertar pra falar */

const digitando = el => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

function teclaApertada(e) {
  if (S.config.modoMic !== "ptt" || e.code !== S.config.teclaPtt || e.repeat || digitando(e.target)) return;
  S.apertandoPtt = e.type === "keydown";
  aplicarEstadoMic();
}

const nomeTecla = codigo => codigo.replace(/^Key/, "").replace(/^Digit/, "").replace("Space", "Espaço");

/* ------------------------------------------------------------ câmera */

async function alternarCamera() {
  if (!S.call) return aviso("Entre num canal de voz primeiro.");
  if (S.cam) return desligarCamera();
  try {
    S.cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  } catch { return aviso("Não deu acesso à câmera."); }
  S.cam.getVideoTracks()[0].onended = () => desligarCamera();
  atualizarMeuStatus({ cam: true });
  aplicarEmTodos(); atualizarBotoes(); renderPalco();
}

function desligarCamera() {
  if (!S.cam) return;
  S.cam.getTracks().forEach(t => t.stop());
  S.cam = null;
  atualizarMeuStatus({ cam: false });
  aplicarEmTodos(); atualizarBotoes(); renderPalco();
}

/* ------------------------------------------------------------ tela */

const opcoesTela = q => ({
  video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.frameRate } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, // som da aba/sistema
  systemAudio: "include",
});

async function iniciarTela() {
  if (!S.call) return aviso("Entre num canal de voz primeiro.");
  if (!PODE_TRANSMITIR) return aviso("Transmitir a tela só dá pelo computador (Chrome ou Edge).");
  if (!pode("transmitir", S.servidores.get(S.call.sid))) return aviso("Seu cargo não pode transmitir neste servidor.");
  const q = QUALIDADES[$("selQualidade").value];
  try { S.tela = await navigator.mediaDevices.getDisplayMedia(opcoesTela(q)); }
  catch { return; } // a pessoa cancelou
  const video = S.tela.getVideoTracks()[0];
  video.contentHint = q.frameRate >= 60 ? "motion" : "detail";
  video.onended = () => pararTela(); // botão "Parar compartilhamento" do navegador
  atualizarMeuStatus({ tela: true });
  aplicarEmTodos(); atualizarBotoes(); renderPalco();
}

function pararTela() {
  if (!S.tela) return;
  S.tela.getTracks().forEach(t => t.stop());
  S.tela = null;
  atualizarMeuStatus({ tela: false });
  aplicarEmTodos(); atualizarBotoes(); renderPalco();
}

async function mudarQualidade() {
  aplicarEmTodos();
  const video = S.tela?.getVideoTracks()[0];
  if (!video) return;
  const q = QUALIDADES[$("selQualidade").value];
  await video.applyConstraints(opcoesTela(q).video).catch(() => {});
  video.contentHint = q.frameRate >= 60 ? "motion" : "detail";
}

/* ------------------------------------------------------------ ensurdecer */

function alternarSurdo() {
  S.surdo = !S.surdo;
  for (const par of S.pares.values()) ajustarSaidas(par);
  atualizarBotoes();
}

/** Desliga mic, câmera e tela (ao sair da call). */
export function desligarTudo() {
  for (const stream of [S.mic, S.cam, S.tela]) stream?.getTracks().forEach(t => t.stop());
  S.mic = S.cam = S.tela = null;
  micMutado = false;
  atualizarBotoes();
}

/* ------------------------------------------------------------ botões */

function rotular(bt, texto) {
  bt.title = texto;
  bt.setAttribute("aria-label", texto);
  const rotulo = bt.querySelector(".controle__rotulo");
  if (rotulo) rotulo.textContent = texto;
}

/** Deixa todos os botões de acordo com o que está ligado. */
export function atualizarBotoes() {
  const ptt = S.config.modoMic === "ptt";
  const textoMic = !S.mic ? "Ligar mic" : micMutado ? "Mudo" : ptt ? `Aperte ${nomeTecla(S.config.teclaPtt)}` : "Microfone";
  for (const bt of botoes("mic")) {
    rotular(bt, textoMic);
    bt.classList.toggle("controle--mudo", !S.mic || micMutado);
    bt.classList.toggle("controle--falando-ptt", ptt && S.apertandoPtt && !micMutado);
    bt.setAttribute("aria-pressed", String(!!S.mic && !micMutado));
  }
  for (const bt of botoes("surdo")) {
    rotular(bt, S.surdo ? "Ensurdecido" : "Áudio");
    bt.classList.toggle("controle--mudo", S.surdo);
    bt.setAttribute("aria-pressed", String(S.surdo));
  }
  for (const bt of botoes("cam")) {
    rotular(bt, "Câmera");
    bt.classList.toggle("controle--ativo", !!S.cam);
    bt.setAttribute("aria-pressed", String(!!S.cam));
  }
  for (const bt of botoes("tela")) {
    rotular(bt, S.tela ? "Parar live" : "Transmitir");
    bt.classList.toggle("controle--ativo", !!S.tela);
    bt.setAttribute("aria-pressed", String(!!S.tela));
  }
}

/* ------------------------------------------------------------ configurações de voz */

async function abrirConfigVoz() {
  $("modoMicSempre").checked = S.config.modoMic !== "ptt";
  $("modoMicPtt").checked = S.config.modoMic === "ptt";
  $("btTeclaPtt").textContent = nomeTecla(S.config.teclaPtt);
  $("btTeclaPtt").dataset.codigo = S.config.teclaPtt;
  $("selQualidadeVoz").value = S.config.qualidadeVoz;

  const sel = $("selMicrofone");
  sel.replaceChildren(new Option("Padrão do sistema", ""));
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    dispositivos.filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default")
      .forEach((d, i) => sel.add(new Option(d.label || `Microfone ${i + 1}`, d.deviceId)));
  } catch {}
  sel.value = S.config.micId;
  await preencherSaidas();
  $("dlgConfigVoz").showModal();
  medirMicrofone();
}

/* ------------------------------------------------------------ medidor do microfone */

let medicao = null;

/** Barra que mexe com a sua voz (pra conferir se o microfone está captando). */
async function medirMicrofone() {
  pararMedicao();
  const texto = $("textoMedidor");
  let stream = S.mic, temporario = false;
  try {
    if (!stream) { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); temporario = true; }
  } catch {
    texto.textContent = "⚠ Sem acesso ao microfone. Libere no cadeado da barra de endereço.";
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analisador);
  const dados = new Uint8Array(analisador.fftSize);
  let maximo = 0;
  const desenhar = () => {
    analisador.getByteTimeDomainData(dados);
    let pico = 0;
    for (const v of dados) pico = Math.max(pico, Math.abs(v - 128));
    const nivel = Math.min(1, pico / 64);
    maximo = Math.max(maximo, nivel);
    $("medidorMic").style.width = Math.round(nivel * 100) + "%";
    const mudo = S.mic && !micEstaAberto();
    texto.textContent = mudo ? "🔇 Seu microfone está mutado (ou apertar-pra-falar sem a tecla apertada)."
      : maximo > 0.08 ? "✅ Seu microfone está captando."
      : "Fale alguma coisa: a barra tem que mexer.";
  };
  const timer = setInterval(desenhar, 60);
  medicao = () => {
    clearInterval(timer);
    ctx.close().catch(() => {});
    if (temporario) stream.getTracks().forEach(t => t.stop());
  };
}

function pararMedicao() {
  medicao?.();
  medicao = null;
}

/* ------------------------------------------------------------ saída de áudio */

async function preencherSaidas() {
  const sel = $("selSaida");
  sel.replaceChildren(new Option("Padrão do sistema", ""));
  let saidas = [];
  try {
    saidas = (await navigator.mediaDevices.enumerateDevices())
      .filter(d => d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
  } catch {}
  saidas.forEach((d, i) => sel.add(new Option(d.label || `Saída ${i + 1}`, d.deviceId)));
  // se o aparelho escolhido antes não está conectado agora, mostra "Padrão"
  sel.value = saidas.some(d => d.deviceId === S.config.saidaId) ? S.config.saidaId : "";
  const pode = PODE_ESCOLHER_SAIDA && saidas.length > 0;
  sel.disabled = !pode;
  $("btTestarSaida").disabled = !PODE_ESCOLHER_SAIDA;
  $("avisoSaida").hidden = pode;
}

/** Toca um "plim" na saída selecionada (sem precisar salvar antes). */
async function testarSaida() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if ($("selSaida").value && ctx.setSinkId) await ctx.setSinkId($("selSaida").value);
    for (const [freq, inicio] of [[660, 0], [880, 0.18], [1320, 0.36]]) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      const t = ctx.currentTime + inicio;
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    aviso("Não deu pra tocar o teste nessa saída.");
  }
}

function salvarConfigVoz() {
  const antes = JSON.stringify([S.config.qualidadeVoz, S.config.micId]);
  if (!$("selSaida").disabled) S.config.saidaId = $("selSaida").value;
  S.config.modoMic = $("modoMicPtt").checked ? "ptt" : "sempre";
  S.config.teclaPtt = $("btTeclaPtt").dataset.codigo || "KeyV";
  S.config.qualidadeVoz = $("selQualidadeVoz").value;
  S.config.micId = $("selMicrofone").value;
  salvarConfig();
  if (antes !== JSON.stringify([S.config.qualidadeVoz, S.config.micId])) reiniciarMicrofone();
  else aplicarEstadoMic();
  aplicarEmTodos();
  direcionarTudo();
  atualizarBotoes();
  aviso("Configurações de voz salvas.");
}

function capturarTecla() {
  const bt = $("btTeclaPtt");
  bt.textContent = "Aperte uma tecla…";
  const pegar = e => {
    e.preventDefault();
    bt.dataset.codigo = e.code;
    bt.textContent = nomeTecla(e.code);
    document.removeEventListener("keydown", pegar, true);
  };
  document.addEventListener("keydown", pegar, true);
}

/* ------------------------------------------------------------ início */

export function iniciarMidia() {
  const sel = $("selQualidade");
  for (const [valor, q] of Object.entries(QUALIDADES)) sel.add(new Option(q.rotulo, valor, false, valor === "1080p30"));
  const selVoz = $("selQualidadeVoz");
  for (const [valor, q] of Object.entries(QUALIDADES_VOZ)) selVoz.add(new Option(q.rotulo, valor));

  if (!PODE_TRANSMITIR) { botoes("tela").forEach(b => (b.hidden = true)); $("campoQualidade").hidden = true; }

  botoes("mic").forEach(b => b.addEventListener("click", alternarMicrofone));
  botoes("surdo").forEach(b => b.addEventListener("click", alternarSurdo));
  botoes("cam").forEach(b => b.addEventListener("click", alternarCamera));
  botoes("tela").forEach(b => b.addEventListener("click", () => (S.tela ? pararTela() : iniciarTela())));
  botoes("config-voz").forEach(b => b.addEventListener("click", abrirConfigVoz));
  sel.addEventListener("change", mudarQualidade);
  $("btTeclaPtt").addEventListener("click", capturarTecla);
  aoEscolher($("dlgConfigVoz"), v => { pararMedicao(); if (v === "ok") salvarConfigVoz(); });
  $("dlgConfigVoz").addEventListener("cancel", pararMedicao);
  $("btTestarSaida").addEventListener("click", testarSaida);
  document.addEventListener("keydown", teclaApertada);
  document.addEventListener("keyup", teclaApertada);
  window.addEventListener("blur", () => { if (S.apertandoPtt) { S.apertandoPtt = false; aplicarEstadoMic(); } });
  atualizarBotoes();
}
