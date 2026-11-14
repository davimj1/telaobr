/**
 * midia.js — Microfone, câmera, compartilhar tela, ensurdecer e qualidade.
 */
import { S } from "./estado.js";
import { QUALIDADES } from "./config.js";
import { $, aviso } from "./util.js";
import { PODE_TRANSMITIR } from "./compat.js";
import { aplicarEmTodos, ajustarQualidade } from "./rtc.js";
import { atualizarMeuStatus } from "./call.js";
import { renderPalco } from "./palco.js";
import { detectarFala } from "./fala.js";

const OPCOES_MIC = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
const OPCOES_CAM = { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } };

/** Troca o texto embaixo do ícone de um botão de controle. */
function rotulo(id, texto) {
  const bt = $(id);
  bt.querySelector(".controle__rotulo").textContent = texto;
  bt.title = texto;
  bt.setAttribute("aria-label", texto);
}

/** Deixa os botões de acordo com o que está ligado. */
export function atualizarBotoes() {
  const faixaMic = S.mic?.getAudioTracks()[0];
  const micLigado = !!faixaMic && faixaMic.enabled;
  rotulo("btMic", !faixaMic ? "Ligar mic" : micLigado ? "Microfone" : "Mudo");
  $("btMic").classList.toggle("controle--mudo", !micLigado);
  $("btMic").setAttribute("aria-pressed", String(micLigado));

  $("btCam").classList.toggle("controle--ativo", !!S.cam);
  $("btCam").setAttribute("aria-pressed", String(!!S.cam));

  rotulo("btSurdo", S.surdo ? "Ensurdecido" : "Áudio");
  $("btSurdo").classList.toggle("controle--mudo", S.surdo);
  $("btSurdo").setAttribute("aria-pressed", String(S.surdo));

  rotulo("btTela", S.tela ? "Parar live" : "Transmitir");
  $("btTela").classList.toggle("controle--ativo", !!S.tela);
  $("btTela").setAttribute("aria-pressed", String(!!S.tela));
}

/* ------------------------------------------------------------ microfone */

/** Pede o microfone. silencioso = não mostra erro (entra só ouvindo). */
export async function ligarMicrofone({ silencioso = false } = {}) {
  try {
    S.mic = await navigator.mediaDevices.getUserMedia(OPCOES_MIC);
    detectarFala(S.user.uid, S.mic);
  } catch {
    S.mic = null;
    aviso(silencioso ? "Sem microfone: você entra só ouvindo." : "Não deu acesso ao microfone.");
  }
}

async function alternarMicrofone() {
  if (!S.call) return;
  if (!S.mic) {
    await ligarMicrofone();
    if (!S.mic) return;
    aplicarEmTodos();
  } else {
    const faixa = S.mic.getAudioTracks()[0];
    faixa.enabled = !faixa.enabled;
  }
  atualizarBotoes();
  atualizarMeuStatus({ mic: S.mic.getAudioTracks()[0].enabled });
}

/* ------------------------------------------------------------ câmera */

async function alternarCamera() {
  if (!S.call) return;
  if (S.cam) return desligarCamera();
  try { S.cam = await navigator.mediaDevices.getUserMedia(OPCOES_CAM); }
  catch { return aviso("Não deu acesso à câmera."); }
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
  if (!S.call) return;
  if (!PODE_TRANSMITIR) return aviso("Transmitir a tela só dá pelo computador (Chrome ou Edge).");
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
  for (const par of S.pares.values()) ajustarQualidade(par);
  const video = S.tela?.getVideoTracks()[0];
  if (!video) return;
  const q = QUALIDADES[$("selQualidade").value];
  await video.applyConstraints(opcoesTela(q).video).catch(() => {});
  video.contentHint = q.frameRate >= 60 ? "motion" : "detail";
}

/* ------------------------------------------------------------ ensurdecer */

function alternarSurdo() {
  S.surdo = !S.surdo;
  for (const par of S.pares.values()) par.saida.muted = S.surdo;
  atualizarBotoes();
}

/** Desliga mic, câmera e tela (ao sair da call). */
export function desligarTudo() {
  for (const stream of [S.mic, S.cam, S.tela]) stream?.getTracks().forEach(t => t.stop());
  S.mic = S.cam = S.tela = null;
  atualizarBotoes();
}

export function iniciarMidia() {
  // monta o seletor de qualidade a partir do config.js
  const sel = $("selQualidade");
  for (const [valor, q] of Object.entries(QUALIDADES)) sel.add(new Option(q.rotulo, valor, false, valor === "1080p30"));

  if (!PODE_TRANSMITIR) { $("btTela").hidden = true; $("campoQualidade").hidden = true; }

  $("btMic").addEventListener("click", alternarMicrofone);
  $("btCam").addEventListener("click", alternarCamera);
  $("btSurdo").addEventListener("click", alternarSurdo);
  $("btTela").addEventListener("click", () => (S.tela ? pararTela() : iniciarTela()));
  sel.addEventListener("change", mudarQualidade);
  atualizarBotoes();
}
