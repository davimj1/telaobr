/**
 * palco.js — Área central: telas ao vivo em cima e as pessoas da call embaixo.
 */
import { S } from "./estado.js";
import { $, criarAvatar, doModelo } from "./util.js";
import { PODE_TRANSMITIR, telaCheia } from "./compat.js";

const volumes = new Map(); // uid -> volume escolhido (0 a 1)

/** Stream de tela ou câmera de uma pessoa (a minha vem direto do S). */
function streamDe(uid, tipo) {
  if (uid === S.user.uid) return tipo === "tela" ? S.tela : S.cam;
  return S.pares.get(uid)?.[tipo];
}

/** Uma "assinatura" do que está na tela; se não mudou, não redesenha (evita piscar o vídeo). */
function assinatura(naCall, telas) {
  const t = telas.map(x => x.uid + x.stream.id + x.stream.getTracks().length).join(",");
  const p = [...S.pessoas].map(([uid, x]) =>
    uid + (x.mic ? "m" : "") + (x.cam ? "c" + (streamDe(uid, "cam")?.getTracks().length || 0) : "")).join(",");
  return `${S.atual}|${naCall}|${t}|${p}`;
}

export function renderPalco() {
  const palco = $("palco");
  if (!S.user) return;

  if (!S.atual) {
    palco.dataset.assinatura = "";
    return mostrarVazio(palco, S.servidores.size
      ? { titulo: "Escolha um servidor", texto: "Seus servidores ficam na barra da esquerda." }
      : { titulo: "Bem-vindo ao Telão", texto: "Clique no + pra criar seu primeiro servidor, ou abra um convite de um amigo." });
  }

  const naCall = S.call === S.atual;
  const telas = naCall
    ? [...S.pessoas].filter(([uid, p]) => p.tela && streamDe(uid, "tela")).map(([uid, p]) => ({ uid, p, stream: streamDe(uid, "tela") }))
    : [];

  const nova = assinatura(naCall, telas);
  if (palco.dataset.assinatura === nova) return;
  palco.dataset.assinatura = nova;

  if (!naCall) {
    const n = S.pessoas.size;
    return mostrarVazio(palco, {
      titulo: n ? `${n} ${n > 1 ? "pessoas" : "pessoa"} na call` : "A call está vazia",
      texto: "Entre na call pra conversar e ver as telas" + (PODE_TRANSMITIR ? " — ou transmitir a sua." : ". (Transmitir só pelo computador.)"),
      botao: "Entrar na call",
      aoClicar: () => $("btCall").click(),
    });
  }

  const grade = document.createElement("div");
  grade.className = "palco__grade";
  for (const [uid, p] of S.pessoas) grade.append(criarTilePessoa(uid, p));
  palco.replaceChildren(...telas.map(criarTileTela), grade);
}

/** Tela grande de alguém transmitindo. */
function criarTileTela({ uid, p, stream }) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTela");
  const video = tile.querySelector("video");
  video.srcObject = stream;
  video.addEventListener("dblclick", () => telaCheia(tile));
  tile.querySelector(".tile__rotulo").textContent = p.nome + (meu ? " (sua tela)" : "");
  tile.querySelector(".tile__cheia").addEventListener("click", () => telaCheia(tile));

  const volume = tile.querySelector(".tile__volume");
  if (meu) volume.closest(".tile__campo").remove();
  else {
    volume.value = volumes.get(uid) ?? 1;
    volume.addEventListener("input", () => {
      volumes.set(uid, Number(volume.value));
      const par = S.pares.get(uid);
      if (par) par.saida.volume = Number(volume.value);
    });
  }
  return tile;
}

/** Quadradinho de cada pessoa: câmera se estiver ligada, senão o avatar. */
function criarTilePessoa(uid, p) {
  const meu = uid === S.user.uid;
  const tile = doModelo("modeloTile");
  tile.dataset.fala = uid;
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
  tile.querySelector(".tile__nome").textContent = (p.mic ? "" : "🔇 ") + p.nome + (meu ? " (você)" : "");
  return tile;
}

/** Mensagem centralizada com a logo (quando não há o que mostrar). */
function mostrarVazio(palco, { titulo, texto, botao, aoClicar }) {
  const vazio = doModelo("modeloVazio");
  vazio.querySelector(".vazio__titulo").textContent = titulo;
  vazio.querySelector(".vazio__texto").textContent = texto;
  const bt = vazio.querySelector(".vazio__botao");
  if (botao) { bt.hidden = false; bt.textContent = botao; bt.addEventListener("click", aoClicar); }
  palco.replaceChildren(vazio);
}
