/**
 * servidores.js — Lista de servidores, criar, renomear, convidar, sair e excluir.
 */
import {
  db, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  arrayUnion, arrayRemove, srvDoc,
} from "./firebase.js";
import { S } from "./estado.js";
import { LIMITES } from "./config.js";
import { $, cor, iniciais, aviso, copiar, guardar } from "./util.js";
import { TEM_DIALOG, ehCelular } from "./compat.js";
import { ouvirChat, pararChat } from "./chat.js";
import { ouvirPessoas, pararPessoas, sairDaCall } from "./call.js";
import { renderTudo, irPara, zerarNaoLidas } from "./ui.js";

const CHAVE_ULTIMO = "telao-ultimo-servidor";

/* ------------------------------------------------------------ banco */

/** Ouve, em tempo real, os servidores dos quais eu sou membro. */
export function ouvirServidores() {
  pararServidores();
  const q = query(collection(db, "servidores"), where("membros", "array-contains", S.user.uid));
  S.pararServidores = onSnapshot(q, snap => {
    S.servidores.clear();
    snap.forEach(d => S.servidores.set(d.id, d.data()));

    if (S.atual && !S.servidores.has(S.atual)) {
      // saí, fui removido ou o servidor foi excluído
      if (S.call === S.atual) sairDaCall();
      abrirServidor(null);
    } else if (!S.atual) {
      const ultimo = guardar.ler(CHAVE_ULTIMO);
      if (ultimo && S.servidores.has(ultimo)) abrirServidor(ultimo);
    }
    renderTrilho();
    renderLateral();
  }, erro => aviso("Erro ao carregar servidores: " + erro.code));
}

export function pararServidores() {
  S.pararServidores?.(); S.pararServidores = null;
  pararChat(); pararPessoas();
  S.servidores.clear();
  S.atual = null;
}

/** Cria ou renomeia um servidor. */
async function salvarServidor(modo, nome) {
  nome = String(nome || "").trim().slice(0, LIMITES.tamanhoNomeServidor);
  if (!nome) return;
  try {
    if (modo === "renomear") {
      await updateDoc(srvDoc(S.atual), { nome });
      return;
    }
    const ref = await addDoc(collection(db, "servidores"), {
      nome, dono: S.user.uid, membros: [S.user.uid], criadoEm: Date.now(),
    });
    abrirServidor(ref.id);
    aviso("Servidor criado! Copie o convite pra chamar os amigos.");
  } catch (erro) {
    aviso("Não deu: " + (erro.code || erro.message));
  }
}

/** Entra no servidor do link de convite (#convite-ID), se houver. */
export async function tratarConvite() {
  const m = location.hash.match(/^#convite-([A-Za-z0-9]{10,40})$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    await updateDoc(srvDoc(m[1]), { membros: arrayUnion(S.user.uid) });
    abrirServidor(m[1]);
    aviso("Você entrou no servidor!");
  } catch (erro) {
    aviso(erro.code === "not-found" ? "Esse convite não existe mais." : "Não deu pra entrar: " + (erro.code || erro.message));
  }
}

async function sairDoServidor() {
  if (!confirm("Sair deste servidor?")) return;
  const sid = S.atual;
  if (S.call === sid) await sairDaCall();
  await updateDoc(srvDoc(sid), { membros: arrayRemove(S.user.uid) }).catch(e => aviso("Erro: " + e.code));
}

async function excluirServidor() {
  if (!confirm("Excluir o servidor para todo mundo? Isso não tem volta.")) return;
  const sid = S.atual;
  if (S.call === sid) await sairDaCall();
  await deleteDoc(srvDoc(sid)).catch(e => aviso("Erro: " + e.code));
}

/* ------------------------------------------------------------ navegação */

/** Abre um servidor (chat + quem está na call). null = nenhum. */
export function abrirServidor(sid) {
  if (sid === S.atual) return;
  if (S.call && S.call !== sid) {
    sairDaCall();
    aviso("Você saiu da call do outro servidor.");
  }
  S.atual = sid;
  pararChat(); pararPessoas();
  S.pessoas.clear();
  $("mensagens").replaceChildren();
  zerarNaoLidas();

  if (sid) {
    guardar.salvar(CHAVE_ULTIMO, sid);
    ouvirChat(sid);
    ouvirPessoas(sid);
    if (ehCelular()) irPara(S.call === sid ? "call" : "chat");
  }
  renderTudo();
}

/* ------------------------------------------------------------ desenho */

/** Bolinhas de servidor na barra da esquerda. */
export function renderTrilho() {
  const itens = [...S.servidores].sort((a, b) => (a[1].criadoEm || 0) - (b[1].criadoEm || 0)).map(([id, srv]) => {
    const li = document.createElement("li");
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "trilho__item";
    bt.classList.toggle("trilho__item--atual", id === S.atual);
    bt.classList.toggle("trilho__item--em-call", id === S.call);
    bt.style.backgroundColor = cor(srv.nome);
    bt.textContent = iniciais(srv.nome);
    bt.title = srv.nome;
    bt.setAttribute("aria-label", `Servidor ${srv.nome}`);
    if (id === S.atual) bt.setAttribute("aria-current", "true");
    bt.addEventListener("click", () => abrirServidor(id));
    li.append(bt);
    return li;
  });
  $("listaServidores").replaceChildren(...itens);
}

/** Painel do servidor aberto: nome, botões e menu do dono. */
export function renderLateral() {
  const srv = S.servidores.get(S.atual);
  const souDono = !!srv && srv.dono === S.user?.uid;
  const naCall = !!S.call && S.call === S.atual;

  $("nomeServidor").textContent = srv ? srv.nome : "Nenhum servidor";
  $("btConvite").hidden = !srv;
  $("btCall").disabled = !srv;
  $("btCall").textContent = naCall ? "Você está na call" : "Entrar na call";
  $("btCall").classList.toggle("botao--sucesso", naCall);
  $("btRenomear").hidden = !souDono;
  $("btExcluir").hidden = !souDono;
  $("btSairServidor").hidden = !srv || souDono;
  $("campoMensagem").disabled = !srv;
  $("controles").hidden = !S.call;
}

/* ------------------------------------------------------------ eventos */

/** Pede o nome do servidor (no <dialog> ou, em navegador antigo, no prompt). */
function pedirNome(modo) {
  const atual = modo === "renomear" ? S.servidores.get(S.atual)?.nome || "" : "";
  if (!TEM_DIALOG) return salvarServidor(modo, prompt(modo === "renomear" ? "Novo nome:" : "Nome do servidor:", atual));
  $("tituloDlgServidor").textContent = modo === "renomear" ? "Renomear servidor" : "Criar servidor";
  $("campoNomeServidor").value = atual;
  $("dlgServidor").dataset.modo = modo;
  $("dlgServidor").showModal();
}

export function iniciarServidores() {
  $("btNovoServidor").addEventListener("click", () => pedirNome("criar"));
  $("btRenomear").addEventListener("click", () => pedirNome("renomear"));
  $("btSairServidor").addEventListener("click", sairDoServidor);
  $("btExcluir").addEventListener("click", excluirServidor);
  $("btConvite").addEventListener("click", () =>
    copiar(location.href.split("#")[0] + "#convite-" + S.atual, "Convite copiado!"));
  $("dlgServidor").addEventListener("close", () => {
    const dlg = $("dlgServidor");
    if (dlg.returnValue === "ok") salvarServidor(dlg.dataset.modo, $("campoNomeServidor").value);
  });
}
