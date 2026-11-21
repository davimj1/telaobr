/**
 * palco.js — Canal de voz aberto: telas ao vivo em cima e as pessoas embaixo.
 */
import { S } from "./estado.js";
import { $, aviso, criarAvatar, doModelo } from "./util.js";
import { PODE_TRANSMITIR, telaCheia, ehCelular, ligarVideo } from "./compat.js";
import { pessoasDoMeuCanal, entrarNaCall } from "./call.js";
import { abaAtual, irParaCall } from "./ui.js";

/* ------------------------------------------------------------ janela flutuante (Picture-in-Picture) */

/** O navegador deixa pôr vídeo numa janelinha por cima de tudo? (Chrome, Edge, Safari; Firefox tem botão próprio no vídeo) */
export const PODE_JANELA = !!document.pictureInPictureEnabled
  || typeof HTMLVideoElement.prototype.webkitSetPresentationMode === "function";

export async function janelaFlutuante(video) {
  try {
    if (document.pictureInPictureElement === video) return await document.exitPictureInPicture();
    if (video.requestPictureInPicture) return await video.requestPictureInPicture();
    video.webkitSetPresentationMode("picture-in-picture");
  } catch {
    aviso("Não deu pra abrir a janela flutuante neste navegador.");
  }
}

/* ------------------------------------------------------------ mini live (quando saio do canal de voz) */

let miniFechada = null; // id da transmissão que a pessoa fechou (volta se outra live começar)

/** Lives de outras pessoas no meu canal de voz. */
function livesDosOutros() {
  if (!S.call) return [];
  return pessoasDoMeuCanal()
    .filter(([uid, p]) => uid !== S.user.uid && p.tela && streamDe(uid, "tela")?.getVideoTracks().length)
    .map(([uid, p]) => ({ uid, p, stream: streamDe(uid, "tela") }));
}

/** Estou olhando o palco da minha call agora? */
const vendoPalco = () => !!S.call && S.atual === S.call.sid && S.canalAtual === S.call.cid
  && (!ehCelular() || abaAtual() === "conversa");

/**
 * Quadrinho da live no canto da tela quando estou no chat (ou em outro servidor).
 * Mostra a live de quem está transmitindo no meu canal de voz.
 */
export function renderMiniLive() {
  const mini = $("miniLive");
  const video = $("miniVideo");
  const lives = livesDosOutros();
  const live = lives[0];
  const emJanela = document.pictureInPictureElement === video;

  if (!live) {
    mini.hidden = true;
    if (emJanela) document.exitPictureInPicture().catch(() => {});
    video.srcObject = null;
    return;
  }
  if (video.srcObject !== live.stream) ligarVideo(video, live.stream);
  $("miniNome").textContent = live.p.nome + (lives.length > 1 ? ` +${lives.length - 1}` : "");
  mini.hidden = vendoPalco() || miniFechada === live.stream.id;
}

/**
 * Vigia: vídeo preto (sem imagem) mas com imagem chegando → religa.
 * Cobre o caso do iPhone em que o aviso de "a imagem começou" se perde.
 */
function vigiarVideosPretos() {
  for (const video of document.querySelectorAll("#palco video, #miniVideo")) {
    const stream = video.srcObject;
    if (!stream || video.videoWidth > 0) continue;
    const chegando = stream.getVideoTracks().some(t => t.readyState === "live" && !t.muted);
    if (!chegando) continue;
    video.srcObject = null;
    video.srcObject = stream;
    video.play().catch(() => {});
  }
}

export function iniciarMiniLive() {
  setInterval(vigiarVideosPretos, 2000);
  const video = $("miniVideo");
  $("btMiniJanela").hidden = !PODE_JANELA;
  $("btMiniJanela").addEventListener("click", () => janelaFlutuante(video));
  $("btMiniAbrir").addEventListener("click", irParaCall);
  video.addEventListener("click", irParaCall);
  $("btMiniFechar").addEventListener("click", () => {
    miniFechada = video.srcObject?.id || null;
    $("miniLive").hidden = true;
  });
}

/** Stream de tela ou câmera de uma pessoa (a minha vem direto do S). */
function streamDe(uid, tipo) {
  if (uid === S.user.uid) return tipo === "tela" ? S.tela : S.cam;
  return S.pares.get(uid)?.[tipo];
}

/** "Assinatura" do que está na tela; se não mudou, não redesenha (evita piscar o vídeo). */
function assinatura(conectado, pessoas, telas) {
  const t = telas.map(x => x.uid + x.stream.id + x.stream.getTracks().length).join(",");
  const p = pessoas.map(([uid, x]) =>
    uid + (x.mic ? "m" : "") + (x.afk ? "a" : "") + (x.cam ? "c" + (streamDe(uid, "cam")?.getTracks().length || 0) : "")
    + ":" + estadoConexao(uid)).join(",");
  return `${S.atual}|${S.canalAtual}|${conectado}|${t}|${p}`;
}

export function renderPalco() {
  renderMiniLive();
  const palco = $("palco");
  const canal = S.canais.get(S.canalAtual);
  if (!S.user || !canal || canal.tipo !== "voz") { palco.dataset.assinatura = ""; return; }

  $("tituloVoz").textContent = "🔊 " + canal.nome;
  const conectado = S.call?.sid === S.atual && S.call?.cid === S.canalAtual;
  $("controlesVoz").hidden = !conectado;

  const pessoas = conectado ? pessoasDoMeuCanal() : [...S.pessoas].filter(([, p]) => p.canal === S.canalAtual);
  const telas = conectado
    ? pessoas.filter(([uid, p]) => p.tela && streamDe(uid, "tela")).map(([uid, p]) => ({ uid, p, stream: streamDe(uid, "tela") }))
    : [];

  const nova = assinatura(conectado, pessoas, telas);
  if (palco.dataset.assinatura === nova) return;
  palco.dataset.assinatura = nova;

  if (!conectado) {
    const n = pessoas.length;
    const vazio = doModelo("modeloVazio");
    vazio.querySelector(".vazio__titulo").textContent = n ? `${n} ${n > 1 ? "pessoas" : "pessoa"} neste canal` : "Ninguém neste canal ainda";
    vazio.querySelector(".vazio__texto").textContent =
      "Entre pra conversar e ver as telas" + (PODE_TRANSMITIR ? " — ou transmitir a sua." : ". (Transmitir só pelo computador.)");
    const bt = vazio.querySelector(".vazio__botao");
    bt.hidden = false;
    bt.textContent = "Entrar no canal";
    bt.addEventListener("click", () => entrarNaCall(S.atual, S.canalAtual));
    return palco.replaceChildren(vazio);
  }

  const grade = document.createElement("div");
  grade.className = "palco__grade";
  for (const [uid, p] of pessoas) grade.append(criarTilePessoa(uid, p));
  palco.replaceChildren(...telas.map(criarTileTela), grade);
}

/** Controle de volume de uma pessoa (vale pra voz e som da tela dela). */
function controleVolume(uid) {
  const rotulo = document.createElement("label");
  rotulo.className = "tile__campo";
  rotulo.title = "Volume desta pessoa";
  rotulo.innerHTML = `<span aria-hidden="true">🔉</span><span class="so-leitor">Volume</span>`;
  const volume = document.createElement("input");
  volume.type = "range"; volume.min = "0"; volume.max = "1"; volume.step = "0.05";
  volume.className = "tile__volume";
  volume.value = S.volumes.get(uid) ?? 1;
  volume.addEventListener("input", () => {
    S.volumes.set(uid, Number(volume.value));
    const par = S.pares.get(uid);
    if (par) for (const saida of par.saidas) saida.volume = Number(volume.value);
  });
  rotulo.append(volume);
  return rotulo;
}

/** Tela grande de alguém transmitindo. */
function criarTileTela({ uid, p, stream }) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTela");
  const video = tile.querySelector("video");
  ligarVideo(video, stream);
  video.addEventListener("dblclick", () => telaCheia(tile));
  tile.querySelector(".tile__rotulo").textContent = p.nome + (meu ? " (sua tela)" : "");
  const acoes = tile.querySelector(".tile__acoes");
  if (!meu) acoes.prepend(controleVolume(uid));
  tile.querySelector(".tile__cheia").addEventListener("click", () => telaCheia(tile));
  if (PODE_JANELA && !meu) {
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "botao botao--pequeno";
    bt.textContent = "Janela flutuante";
    bt.title = "A live fica numa janelinha por cima de tudo, até de outros programas";
    bt.addEventListener("click", () => janelaFlutuante(video));
    tile.querySelector(".tile__cheia").before(bt);
  }
  return tile;
}

/** Quadradinho de cada pessoa: câmera se estiver ligada, senão o avatar. */
/** Situação da ligação com a pessoa: "ok", "conectando" ou "falhou" (eu mesmo = "ok"). */
function estadoConexao(uid) {
  if (uid === S.user.uid || !S.call) return "ok";
  const estado = S.pares.get(uid)?.pc.connectionState;
  if (estado === "connected") return "ok";
  if (estado === "failed" || estado === "disconnected" || estado === "closed") return "falhou";
  return "conectando";
}

function criarTilePessoa(uid, p) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTile");
  tile.dataset.fala = uid;
  tile.classList.toggle("tile--afk", !!p.afk);
  const cam = p.cam ? streamDe(uid, "cam") : null;

  if (cam) {
    const video = document.createElement("video");
    ligarVideo(video, cam);
    video.classList.toggle("tile__video--espelho", meu);
    video.addEventListener("dblclick", () => telaCheia(tile));
    tile.prepend(video);
  } else {
    const avatar = criarAvatar(p.nome, p.foto, { classe: "avatar avatar--grande" });
    avatar.dataset.fala = uid;
    tile.prepend(avatar);
  }
  const icones = [p.afk && "💤", !p.mic && "🔇"].filter(Boolean).join(" ");
  tile.querySelector(".tile__nome").textContent = (icones ? icones + " " : "") + p.nome + (meu ? " (você)" : "");
  const conexao = estadoConexao(uid);
  if (conexao !== "ok") {
    const estado = document.createElement("span");
    estado.className = "tile__estado tile__estado--" + conexao;
    estado.textContent = conexao === "falhou" ? "⚠ Sem conexão" : "Conectando…";
    estado.title = conexao === "falhou"
      ? "A rede de um de vocês bloqueou a ligação direta. Configure a ponte (TURN) na sua conta."
      : "Fechando a ligação com essa pessoa…";
    tile.append(estado);
  }
  if (!meu) {
    const acoes = document.createElement("div");
    acoes.className = "tile__acoes";
    acoes.append(controleVolume(uid));
    tile.append(acoes);
  }
  return tile;
}
