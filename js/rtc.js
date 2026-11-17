/**
 * rtc.js — Conexões diretas de voz/vídeo entre as pessoas (WebRTC).
 *
 * Como funciona:
 *  1. Quem tem o uid "menor" manda uma OFERTA pelo Firestore (coleção "sinais").
 *  2. O outro responde com uma RESPOSTA; os dois trocam candidatos ICE (caminhos de rede).
 *  3. Cada conexão já nasce com 4 canais fixos (mic, tela, som da tela, câmera).
 *     Ligar/desligar qualquer um é só trocar a faixa — sem renegociar.
 * O WebRTC criptografa tudo de ponta a ponta entre as pessoas (DTLS-SRTP).
 */
import { addDoc, deleteDoc, onSnapshot, query, where, srvCol, srvDoc } from "./firebase.js";
import { S, CANAL, parar } from "./estado.js";
import { ICE, TURN, QUALIDADES, QUALIDADES_VOZ, LIMITES } from "./config.js";
import { $, aviso } from "./util.js";
import { renderPalco } from "./palco.js";
import { detectarFala } from "./fala.js";

/* ------------------------------------------------------------ sinalização */

async function enviarSinal(para, paraSessao, tipo, dados) {
  if (!S.call) return;
  await addDoc(srvCol(S.call.sid, "sinais"), {
    de: S.user.uid, deSessao: S.sessao, para, paraSessao, tipo,
    dados: JSON.stringify(dados), ts: Date.now(),
  });
}

/** Ouve os sinais endereçados a mim e apaga cada um depois de ler. */
export function ouvirSinais(sid) {
  const q = query(srvCol(sid, "sinais"), where("para", "==", S.user.uid));
  S.parar.sinais = onSnapshot(q, snap => {
    const novos = snap.docChanges()
      .filter(c => c.type === "added")
      .map(c => ({ id: c.doc.id, ...c.doc.data() }))
      .sort((a, b) => a.ts - b.ts);
    for (const sinal of novos) {
      deleteDoc(srvDoc(sid, "sinais", sinal.id)).catch(() => {});
      const velho = sinal.paraSessao !== S.sessao || sinal.ts < S.entrouEm - 5000;
      if (S.call?.sid !== sid || velho) continue;
      tratarSinal(sinal).catch(erro => console.warn("Sinal com problema:", erro));
    }
  });
}

export const pararSinais = () => parar("sinais");

async function tratarSinal(sinal) {
  const dados = JSON.parse(sinal.dados);
  if (sinal.tipo === "oferta") return responderOferta(sinal, dados);

  const par = S.pares.get(sinal.de);
  if (!par || par.sessao !== sinal.deSessao) return;
  if (sinal.tipo === "resposta") {
    await par.pc.setRemoteDescription(dados);
    descarregarFilaIce(par);
  }
  if (sinal.tipo === "ice") {
    if (par.pc.remoteDescription) await par.pc.addIceCandidate(dados).catch(() => {});
    else par.filaIce.push(dados);
  }
}

function descarregarFilaIce(par) {
  for (const c of par.filaIce.splice(0)) par.pc.addIceCandidate(c).catch(() => {});
}

/* ------------------------------------------------------------ TURN */

let iceServers = ICE.iceServers;
let turnValidoAte = 0;

/**
 * Busca as credenciais do TURN (se configurado) antes de entrar num canal de voz.
 * Guarda por 1 hora. Se falhar, segue só com STUN — a call funciona na maioria das redes.
 */
export async function prepararIce() {
  const temMetered = TURN.meteredApp && TURN.meteredChave;
  if (!temMetered && !TURN.servidores.length) return;
  if (Date.now() < turnValidoAte) return;

  let extras = [...TURN.servidores];
  if (temMetered) {
    try {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), 5000);
      const url = `https://${encodeURIComponent(TURN.meteredApp)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(TURN.meteredChave)}`;
      const resposta = await fetch(url, { signal: controle.signal });
      clearTimeout(timer);
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);
      const lista = await resposta.json();
      if (Array.isArray(lista)) extras = extras.concat(lista);
    } catch (erro) {
      console.warn("TURN indisponível, seguindo só com STUN:", erro);
    }
  }
  iceServers = [...ICE.iceServers, ...extras];
  turnValidoAte = Date.now() + 60 * 60 * 1000;
}

/** Usa TURN? (pra mostrar a dica certa quando uma conexão falha) */
export const usaTurn = () => iceServers.length > ICE.iceServers.length;

/* ------------------------------------------------------------ conexões */

/** Cria a conexão com uma pessoa e prepara onde o áudio/vídeo dela vai chegar. */
function criarPar(uid, sessao) {
  const pc = new RTCPeerConnection({ iceServers });
  const par = {
    pc, sessao, filaIce: [],
    som: new MediaStream(),     // voz + som da tela
    tela: new MediaStream(),
    cam: new MediaStream(),
    saida: document.createElement("audio"),
  };
  par.saida.autoplay = true;
  par.saida.setAttribute("playsinline", "");
  par.saida.srcObject = par.som;
  par.saida.muted = S.surdo;
  par.saida.volume = S.volumes.get(uid) ?? 1;
  $("audios").append(par.saida);

  pc.onicecandidate = e => { if (e.candidate) enviarSinal(uid, sessao, "ice", e.candidate.toJSON()); };
  pc.ontrack = e => receberFaixa(uid, par, e);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      pc.restartIce?.();
      avisarFalha(uid);
    }
    if (pc.connectionState === "connected") ajustarTudo(par);
    renderPalco();
  };
  S.pares.set(uid, par);
  return par;
}

/** Avisa uma vez por pessoa quando não dá pra conectar (rede bloqueando). */
const falhasAvisadas = new Set();
function avisarFalha(uid) {
  if (falhasAvisadas.has(uid)) return;
  falhasAvisadas.add(uid);
  const nome = S.pessoasCall.get(uid)?.nome || "alguém";
  aviso(usaTurn()
    ? `Não deu pra conectar com ${nome}. Tentando de novo…`
    : `Não deu pra conectar com ${nome}. A rede de alguém bloqueia a call — configure o TURN (veja o LEIA-ME).`);
}

/** Coloca cada faixa recebida no lugar certo, pelo número do canal. */
function receberFaixa(uid, par, evento) {
  const canal = par.pc.getTransceivers().indexOf(evento.transceiver);
  const trocar = (stream, faixa) => { stream.getTracks().forEach(t => stream.removeTrack(t)); stream.addTrack(faixa); };

  if (canal === CANAL.TELA) trocar(par.tela, evento.track);
  else if (canal === CANAL.CAM) trocar(par.cam, evento.track);
  else {
    par.som.addTrack(evento.track);
    par.saida.play().catch(() => {});
    if (canal === CANAL.MIC) detectarFala(uid, new MediaStream([evento.track]));
  }
  renderPalco();
}

/** Eu começo a conversa com essa pessoa. */
export async function iniciarOferta(uid, sessao) {
  const par = criarPar(uid, sessao);
  for (const tipo of ["audio", "video", "audio", "video"]) par.pc.addTransceiver(tipo, { direction: "sendrecv" });
  aplicarFaixas(par);
  const oferta = await par.pc.createOffer();
  await par.pc.setLocalDescription(oferta);
  await enviarSinal(uid, sessao, "oferta", { type: oferta.type, sdp: oferta.sdp });
}

/** A pessoa começou a conversa comigo: eu respondo. */
async function responderOferta(sinal, oferta) {
  if (S.pares.has(sinal.de)) fecharPar(sinal.de);
  const par = criarPar(sinal.de, sinal.deSessao);
  await par.pc.setRemoteDescription(oferta);
  par.pc.getTransceivers().forEach(t => (t.direction = "sendrecv"));
  aplicarFaixas(par);
  const resposta = await par.pc.createAnswer();
  await par.pc.setLocalDescription(resposta);
  await enviarSinal(sinal.de, sinal.deSessao, "resposta", { type: resposta.type, sdp: resposta.sdp });
  descarregarFilaIce(par);
}

/** Manda pra pessoa o que eu tenho ligado agora (mic, tela, câmera). */
function aplicarFaixas(par) {
  const canais = par.pc.getTransceivers();
  if (canais.length < 4) return;
  const trocar = (canal, faixa) => canais[canal].sender.replaceTrack(faixa || null).catch(() => {});
  trocar(CANAL.MIC, S.mic?.getAudioTracks()[0]);
  trocar(CANAL.TELA, S.tela?.getVideoTracks()[0]);
  trocar(CANAL.SOM_TELA, S.tela?.getAudioTracks()[0]);
  trocar(CANAL.CAM, S.cam?.getVideoTracks()[0]);
  ajustarTudo(par);
}

/** Atualiza todas as conexões depois de ligar/desligar algo. */
export function aplicarEmTodos() {
  for (const par of S.pares.values()) aplicarFaixas(par);
}

/** Limite de qualidade de um canal de envio. */
async function limitar(par, canal, ajuste) {
  const sender = par.pc.getTransceivers()[canal]?.sender;
  if (!sender) return;
  const p = sender.getParameters();
  if (!p.encodings?.length) p.encodings = [{}];
  ajuste(p);
  await sender.setParameters(p).catch(() => {});
}

/** Aplica qualidade de voz, de tela e de câmera numa conexão. */
export function ajustarTudo(par) {
  const voz = QUALIDADES_VOZ[S.config.qualidadeVoz] || QUALIDADES_VOZ.voz;
  const tela = QUALIDADES[$("selQualidade").value] || QUALIDADES["1080p30"];
  limitar(par, CANAL.MIC, p => { p.encodings[0].maxBitrate = voz.bitrate; });
  limitar(par, CANAL.TELA, p => {
    p.encodings[0].maxBitrate = tela.bitrate;
    p.encodings[0].maxFramerate = tela.frameRate;
    p.degradationPreference = tela.frameRate >= 60 ? "maintain-framerate" : "maintain-resolution";
  });
  limitar(par, CANAL.CAM, p => { p.encodings[0].maxBitrate = LIMITES.bitrateCamera; });
}

export function fecharPar(uid) {
  const par = S.pares.get(uid);
  if (!par) return;
  par.pc.close();
  par.saida.srcObject = null;
  par.saida.remove();
  S.pares.delete(uid);
}

export function fecharTodos() {
  for (const uid of [...S.pares.keys()]) fecharPar(uid);
}
