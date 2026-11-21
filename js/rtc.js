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
import { db, doc, getDoc, addDoc, deleteDoc, onSnapshot, query, where, srvCol, srvDoc } from "./firebase.js";
import { S, CANAL, parar } from "./estado.js";
import { ICE, TURN, QUALIDADES, QUALIDADES_VOZ, LIMITES } from "./config.js";
import { $, aviso } from "./util.js";
import { direcionarSaida } from "./compat.js";
import { renderPalco } from "./palco.js";
import { detectarFala } from "./fala.js";

/* ------------------------------------------------------------ sinalização */

async function enviarSinal(para, paraSessao, tipo, dados) {
  if (!S.call) return;
  await addDoc(srvCol(S.call.sid, "sinais"), {
    de: S.user.uid, deSessao: S.sessao, para, paraSessao, tipo,
    dados: JSON.stringify(dados), ts: Date.now(),
  }).catch(erro => {
    if (erro.code === "permission-denied") aviso("A call não consegue se conectar: publique o firestore.rules novo no Firebase.");
    throw erro;
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
      // a "sessão" já garante que o sinal é pra esta entrada na call;
      // não comparamos horários porque o relógio de cada aparelho pode estar diferente
      const velho = sinal.paraSessao !== S.sessao;
      if (S.call?.sid !== sid || velho) continue;
      tratarSinal(sinal).catch(erro => console.warn("Sinal com problema:", erro));
    }
  }, erro => {
    console.error("Sinais da call bloqueados:", erro);
    aviso(erro.code === "permission-denied"
      ? "A call não consegue se conectar: publique o firestore.rules novo no Firebase."
      : "A call perdeu a conexão com o servidor. Saia e entre de novo no canal.");
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
  if (Date.now() < turnValidoAte) return;
  const temMetered = TURN.meteredApp && TURN.meteredChave;
  let extras = [...TURN.servidores, ...await turnDoFirebase()];
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

/**
 * Lê a credencial do TURN guardada no Firestore (config/turn), em vez de deixá-la no código.
 * Monta os 4 jeitos de conectar que a Metered oferece (UDP, TCP, porta 443 e TLS),
 * porque redes diferentes bloqueiam coisas diferentes.
 */
async function turnDoFirebase() {
  try {
    const snap = await getDoc(doc(db, "config", "turn"));
    if (!snap.exists()) return [];
    const { usuario, senha, regiao = "global" } = snap.data();
    if (!usuario || !senha) return [];
    const host = `${regiao}.relay.metered.ca`;
    const credenciais = { username: usuario, credential: senha };
    return [
      { urls: `stun:stun.relay.metered.ca:80` },
      { urls: `turn:${host}:80`, ...credenciais },
      { urls: `turn:${host}:80?transport=tcp`, ...credenciais },
      { urls: `turn:${host}:443`, ...credenciais },
      { urls: `turns:${host}:443?transport=tcp`, ...credenciais },
    ];
  } catch {
    return []; // sem permissão ou sem internet: segue só com STUN
  }
}

/** Esquece a ponte guardada (depois de trocar a senha, a próxima call busca de novo). */
export function esquecerIce() { turnValidoAte = 0; iceServers = ICE.iceServers; }

/** Usa TURN? (pra mostrar a dica certa quando uma conexão falha) */
export const usaTurn = () => iceServers.length > ICE.iceServers.length;

/* ------------------------------------------------------------ conexões */

/** Cria a conexão com uma pessoa e prepara onde o áudio/vídeo dela vai chegar. */
function criarPar(uid, sessao) {
  const pc = new RTCPeerConnection({ iceServers });
  const par = {
    pc, sessao, uid, filaIce: [],
    voz: new MediaStream(),      // microfone da pessoa
    somTela: new MediaStream(),  // som da transmissão de tela
    tela: new MediaStream(),
    cam: new MediaStream(),
    // Um tocador pra cada som: o Chrome só toca a PRIMEIRA faixa de áudio de cada tocador,
    // então voz e som da tela juntos no mesmo tocador fariam um dos dois ficar mudo.
    saidas: [document.createElement("audio"), document.createElement("audio")],
  };
  par.saidas[0].srcObject = par.voz;
  par.saidas[1].srcObject = par.somTela;
  for (const saida of par.saidas) {
    saida.autoplay = true;
    saida.setAttribute("playsinline", "");
    $("audios").append(saida);
    direcionarSaida(saida); // fone ou caixa escolhidos nas configurações de voz
  }
  ajustarSaidas(par);

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
  else if (canal === CANAL.SOM_TELA) { trocar(par.somTela, evento.track); tocarSaidas(par); }
  else {
    trocar(par.voz, evento.track);
    tocarSaidas(par);
    detectarFala(uid, new MediaStream([evento.track]));
  }
  renderPalco();
}

/** Volume e "ensurdecer" valem pros dois tocadores da pessoa. */
export function ajustarSaidas(par) {
  for (const saida of par.saidas) {
    saida.muted = S.surdo;
    saida.volume = S.volumes.get(par.uid) ?? 1;
  }
}

/**
 * Dá play no som da pessoa. Se o navegador bloquear (ele exige um clique antes de tocar som),
 * avisa e tenta de novo no próximo toque/clique em qualquer lugar.
 */
export function tocarSaidas(par) {
  for (const saida of par.saidas) {
    if (!saida.srcObject?.getAudioTracks().length) continue;
    saida.play().catch(erro => { if (erro.name === "NotAllowedError") pedirToqueParaOuvir(); });
  }
}

let esperandoToque = false;
function pedirToqueParaOuvir() {
  if (esperandoToque) return;
  esperandoToque = true;
  aviso("🔇 O navegador bloqueou o som. Clique (ou toque) em qualquer lugar pra ouvir a call.");
  const liberar = () => {
    esperandoToque = false;
    for (const p of S.pares.values()) tocarSaidas(p);
  };
  window.addEventListener("pointerdown", liberar, { once: true });
  window.addEventListener("keydown", liberar, { once: true });
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
  for (const saida of par.saidas) { saida.srcObject = null; saida.remove(); }
  S.pares.delete(uid);
}

export function fecharTodos() {
  for (const uid of [...S.pares.keys()]) fecharPar(uid);
}
