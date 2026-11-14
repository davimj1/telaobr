/**
 * rtc.js — Conexões diretas de voz/vídeo entre as pessoas (WebRTC).
 *
 * Como funciona:
 *  1. Quem tem o uid "menor" manda uma OFERTA pelo Firestore (coleção "sinais").
 *  2. O outro responde com uma RESPOSTA; os dois trocam candidatos ICE (caminhos de rede).
 *  3. Cada conexão já nasce com 4 canais fixos (mic, tela, som da tela, câmera).
 *     Ligar/desligar qualquer um é só trocar a faixa — sem renegociar.
 */
import { addDoc, deleteDoc, onSnapshot, query, where, srvCol, srvDoc } from "./firebase.js";
import { S, CANAL } from "./estado.js";
import { ICE, QUALIDADES, LIMITES } from "./config.js";
import { $ } from "./util.js";
import { renderPalco } from "./palco.js";
import { detectarFala } from "./fala.js";

/* ------------------------------------------------------------ sinalização */

async function enviarSinal(para, paraSessao, tipo, dados) {
  await addDoc(srvCol(S.call, "sinais"), {
    de: S.user.uid, deSessao: S.sessao, para, paraSessao, tipo,
    dados: JSON.stringify(dados), ts: Date.now(),
  });
}

/** Ouve os sinais endereçados a mim e apaga cada um depois de ler. */
export function ouvirSinais(sid) {
  const q = query(srvCol(sid, "sinais"), where("para", "==", S.user.uid));
  S.pararSinais = onSnapshot(q, snap => {
    const novos = snap.docChanges()
      .filter(c => c.type === "added")
      .map(c => ({ id: c.doc.id, ...c.doc.data() }))
      .sort((a, b) => a.ts - b.ts);
    for (const sinal of novos) {
      deleteDoc(srvDoc(sid, "sinais", sinal.id)).catch(() => {});
      const velho = sinal.paraSessao !== S.sessao || sinal.ts < S.entrouEm - 5000;
      if (S.call !== sid || velho) continue;
      tratarSinal(sinal).catch(erro => console.warn("Sinal com problema:", erro));
    }
  });
}

export function pararSinais() {
  S.pararSinais?.();
  S.pararSinais = null;
}

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

/* ------------------------------------------------------------ conexões */

/** Cria a conexão com uma pessoa e prepara onde o áudio/vídeo dela vai chegar. */
function criarPar(uid, sessao) {
  const pc = new RTCPeerConnection(ICE);
  const par = {
    pc, sessao, filaIce: [],
    som: new MediaStream(),     // mic + som da tela
    tela: new MediaStream(),
    cam: new MediaStream(),
    saida: document.createElement("audio"),
  };
  par.saida.autoplay = true;
  par.saida.setAttribute("playsinline", "");
  par.saida.srcObject = par.som;
  par.saida.muted = S.surdo;
  $("audios").append(par.saida);

  pc.onicecandidate = e => { if (e.candidate) enviarSinal(uid, sessao, "ice", e.candidate.toJSON()); };
  pc.ontrack = e => receberFaixa(uid, par, e);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce?.();
    if (pc.connectionState === "connected") { ajustarQualidade(par); limitarCamera(par); }
  };
  S.pares.set(uid, par);
  return par;
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
  trocar(CANAL.TELA, S.tela?.getVideoTracks()[0]).then(() => ajustarQualidade(par));
  trocar(CANAL.SOM_TELA, S.tela?.getAudioTracks()[0]);
  trocar(CANAL.CAM, S.cam?.getVideoTracks()[0]).then(() => limitarCamera(par));
}

/** Atualiza todas as conexões depois de ligar/desligar algo. */
export function aplicarEmTodos() {
  for (const par of S.pares.values()) aplicarFaixas(par);
}

/** Define a qualidade de envio da tela conforme o seletor. */
export async function ajustarQualidade(par) {
  const sender = par.pc.getTransceivers()[CANAL.TELA]?.sender;
  if (!sender) return;
  const q = QUALIDADES[$("selQualidade").value];
  const p = sender.getParameters();
  if (!p.encodings?.length) p.encodings = [{}];
  p.encodings[0].maxBitrate = q.bitrate;
  p.encodings[0].maxFramerate = q.frameRate;
  p.degradationPreference = q.frameRate >= 60 ? "maintain-framerate" : "maintain-resolution";
  await sender.setParameters(p).catch(() => {});
}

async function limitarCamera(par) {
  const sender = par.pc.getTransceivers()[CANAL.CAM]?.sender;
  if (!sender) return;
  const p = sender.getParameters();
  if (!p.encodings?.length) p.encodings = [{}];
  p.encodings[0].maxBitrate = LIMITES.bitrateCamera;
  await sender.setParameters(p).catch(() => {});
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
