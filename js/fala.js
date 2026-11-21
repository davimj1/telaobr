/**
 * fala.js — Acende a borda verde de quem está falando.
 * Elementos com data-fala="UID" ganham a classe "falando".
 *
 * Duas fontes de volume:
 *  - OUTRAS pessoas: o próprio WebRTC já informa o volume de cada voz recebida
 *    (receiver.getSynchronizationSources). Não ligamos o som delas num analisador
 *    de áudio — no iPhone isso pode deixar o som mudo.
 *  - EU: analisador de áudio no meu microfone. Se o navegador deixar o analisador
 *    parado (iPhone antes do primeiro toque), uso o volume que a conexão mede do
 *    que estou enviando.
 */
import { S } from "./estado.js";

const LIMIAR_ANALISADOR = 0.02; // volume (RMS da onda, 0–1) acima disso = falando
const LIMIAR_CONEXAO = 0.025;  // volume da conexão (0–1) acima disso = falando
const SEGURA_MS = 250;         // mantém o verde um pouquinho pra não piscar entre palavras

const falandoAgora = new Set(); // uids que estão falando neste momento

/** Marca um elemento (quadrinho, foto…) como sendo de alguém, já com o verde certo. */
export function marcarFala(el, uid) {
  el.dataset.fala = uid;
  el.classList.toggle("falando", falandoAgora.has(uid));
}

const fontes = new Map();


let medidor = null;
function contextoMedidor() {
  if (!medidor || medidor.state === "closed") medidor = new (window.AudioContext || window.webkitAudioContext)();
  return medidor;
}
/** Destrava o medidor num toque (o iPhone começa com o áudio pausado). */
for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => medidor?.resume?.().catch?.(() => {}), { passive: true });

/** Meu microfone (analisador de áudio num áudio só dele). */
export function detectarFala(uid, stream) {
  const fonte = { falouEm: 0, nos: [], analisador: null, amostras: null };
  try {
    // um áudio só pro medidor (separado dos sons de aviso, que trocam de saída)
    const ctx = contextoMedidor();
    ctx.resume?.().catch?.(() => {});
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 512;
    const origem = ctx.createMediaStreamSource(stream);
    // ligado numa saída MUDA: sem chegar até a saída, o Safari (e às vezes o Chrome) não processa o áudio
    const silencio = ctx.createGain();
    silencio.gain.value = 0;
    origem.connect(analisador).connect(silencio).connect(ctx.destination);
    fonte.nos = [origem, analisador, silencio]; // guardados aqui pro navegador não "recolher"
    fonte.analisador = analisador;
    fonte.amostras = new Float32Array(analisador.fftSize);
  } catch { /* sem Web Audio: usa só o volume da conexão */ }

  fonte.acabou = () => stream.getAudioTracks().every(t => t.readyState === "ended");
  fonte.nivel = () => {
    const faixa = stream.getAudioTracks()[0];
    if (!faixa?.enabled) return 0; // mutado
    const an = fonte.analisador;
    // pausado pelo navegador (iPhone antes do primeiro toque): tenta destravar de novo
    if (an && an.context.state === "suspended") an.context.resume?.().catch?.(() => {});
    if (an && an.context.state === "running") {
      // volume de verdade da onda (RMS): vale pra voz, apito, música — qualquer som
      an.getFloatTimeDomainData(fonte.amostras);
      let soma = 0;
      for (const v of fonte.amostras) soma += v * v;
      if (Math.sqrt(soma / fonte.amostras.length) > LIMIAR_ANALISADOR) return 1;
    }
    return volumeEnviado() > LIMIAR_CONEXAO ? 1 : 0;
  };
  fontes.set(uid, fonte);
}

/**
 * Voz de outra pessoa: volume medido pela própria conexão.
 * Usa a ENERGIA acumulada do áudio recebido entre uma leitura e outra (não pula
 * palavras curtas). Se o navegador não informar, usa o volume do último pacote.
 */
export function detectarFalaRemota(uid, receptor) {
  const fonte = { falouEm: 0, volume: 0, energia: null, duracao: null };
  fonte.acabou = () => receptor.track.readyState === "ended";
  fonte.nivel = () => (fonte.volume > LIMIAR_CONEXAO ? 1 : 0);
  fonte.atualizar = async () => {
    try {
      let energia = null, duracao = null;
      (await receptor.getStats()).forEach(s => {
        if (s.type === "inbound-rtp" && typeof s.totalAudioEnergy === "number") { energia = s.totalAudioEnergy; duracao = s.totalSamplesDuration; }
      });
      if (energia !== null && fonte.energia !== null && duracao > fonte.duracao) {
        fonte.volume = Math.sqrt((energia - fonte.energia) / (duracao - fonte.duracao)); // volume médio no intervalo
      } else if (energia === null) {
        fonte.volume = receptor.getSynchronizationSources?.()[0]?.audioLevel ?? 0;
      }
      fonte.energia = energia;
      fonte.duracao = duracao;
    } catch { fonte.volume = 0; }
  };
  fontes.set(uid, fonte);
}

/** Volume do meu microfone medido pela conexão (reserva quando o analisador não roda). */
let volumeCache = 0;
function volumeEnviado() { return volumeCache; }
async function atualizarVolumeEnviado() {
  let maior = 0;
  for (const par of S.pares.values()) {
    try {
      (await par.pc.getStats()).forEach(s => {
        if (s.type === "media-source" && s.kind === "audio" && typeof s.audioLevel === "number") maior = Math.max(maior, s.audioLevel);
      });
    } catch {}
  }
  volumeCache = maior;
}

/** Um único relógio pra todo mundo (leve, e funciona mesmo com a aba em segundo plano). */
function medirTodos() {
  const agora = Date.now();
  for (const [uid, fonte] of fontes) {
    let falando = false;
    if (fonte.acabou()) { fonte.nos?.forEach(n => n?.disconnect?.()); fontes.delete(uid); falandoAgora.delete(uid); }
    else {
      if (fonte.nivel()) fonte.falouEm = agora;
      falando = agora - fonte.falouEm < SEGURA_MS;
    }
    if (falando) falandoAgora.add(uid); else falandoAgora.delete(uid);
    for (const el of document.querySelectorAll(`[data-fala="${CSS.escape(uid)}"]`)) el.classList.toggle("falando", falando);
  }
}

setInterval(medirTodos, 100);
setInterval(() => { for (const f of fontes.values()) f.atualizar?.(); }, 150);
setInterval(() => { if (S.call && S.pares.size) atualizarVolumeEnviado(); }, 300);
