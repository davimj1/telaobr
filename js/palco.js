/**
 * palco.js — Canal de voz aberto: telas ao vivo em cima e as pessoas embaixo.
 */
import { S } from "./estado.js";
import { $, criarAvatar, doModelo } from "./util.js";
import { PODE_TRANSMITIR, telaCheia } from "./compat.js";
import { pessoasDoMeuCanal, entrarNaCall } from "./call.js";

/** Stream de tela ou câmera de uma pessoa (a minha vem direto do S). */
function streamDe(uid, tipo) {
  if (uid === S.user.uid) return tipo === "tela" ? S.tela : S.cam;
  return S.pares.get(uid)?.[tipo];
}

/** "Assinatura" do que está na tela; se não mudou, não redesenha (evita piscar o vídeo). */
function assinatura(conectado, pessoas, telas) {
  const t = telas.map(x => x.uid + x.stream.id + x.stream.getTracks().length).join(",");
  const p = pessoas.map(([uid, x]) =>
    uid + (x.mic ? "m" : "") + (x.afk ? "a" : "") + (x.cam ? "c" + (streamDe(uid, "cam")?.getTracks().length || 0) : "")).join(",");
  return `${S.atual}|${S.canalAtual}|${conectado}|${t}|${p}`;
}

export function renderPalco() {
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
    if (par) par.saida.volume = Number(volume.value);
  });
  rotulo.append(volume);
  return rotulo;
}

/** Tela grande de alguém transmitindo. */
function criarTileTela({ uid, p, stream }) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTela");
  const video = tile.querySelector("video");
  video.srcObject = stream;
  video.addEventListener("dblclick", () => telaCheia(tile));
  tile.querySelector(".tile__rotulo").textContent = p.nome + (meu ? " (sua tela)" : "");
  const acoes = tile.querySelector(".tile__acoes");
  if (!meu) acoes.prepend(controleVolume(uid));
  tile.querySelector(".tile__cheia").addEventListener("click", () => telaCheia(tile));
  return tile;
}

/** Quadradinho de cada pessoa: câmera se estiver ligada, senão o avatar. */
function criarTilePessoa(uid, p) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTile");
  tile.dataset.fala = uid;
  tile.classList.toggle("tile--afk", !!p.afk);
  const cam = p.cam ? streamDe(uid, "cam") : null;

  if (cam) {
    const video = document.createElement("video");
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.srcObject = cam;
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
  if (!meu) {
    const acoes = document.createElement("div");
    acoes.className = "tile__acoes";
    acoes.append(controleVolume(uid));
    tile.append(acoes);
  }
  return tile;
}
