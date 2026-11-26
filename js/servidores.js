/**
 * servidores.js — Lista de servidores, criar (com modelo), convidar, configurar, sair e excluir.
 */
import { apagarServidorInteiro } from "./privacidade.js";
import {
  db, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  arrayUnion, arrayRemove, srvDoc,
} from "./firebase.js";
import { S, parar, servidorAtual } from "./estado.js";
import { LIMITES, MODELOS, PERMISSOES_PADRAO } from "./config.js";
import { $, cor, iniciais, aviso, copiar, confirmar, guardar, imagemSegura, aoEscolher, enquadrarCapa } from "./util.js";
import { ehCelular } from "./compat.js";
import { ouvirCanais, pararCanais, criarCanaisDoModelo } from "./canais.js";
import { ouvirPessoas, pararPessoas, sairDaCall } from "./call.js";
import { ouvirPerfis } from "./perfis.js";
import { meuCargo } from "./permissoes.js";
import { renderTudo, irPara } from "./ui.js";
import { abrirConfigServidor } from "./membros.js";
import { sincronizarAtividade, servidorNaoLido, mencoesNoServidor } from "./avisos.js";

const CHAVE_ULTIMO = "telao-ultimo-servidor";

/* ------------------------------------------------------------ banco */

/** Ouve, em tempo real, os servidores dos quais eu sou membro. */
export function ouvirServidores() {
  parar("servidores");
  const q = query(collection(db, "servidores"), where("membros", "array-contains", S.user.uid));
  S.parar.servidores = onSnapshot(q, snap => {
    S.servidores.clear();
    snap.forEach(d => S.servidores.set(d.id, d.data()));
    ouvirPerfis([...S.servidores.values()].flatMap(s => s.membros || []));
    sincronizarAtividade();

    if (S.call && !S.servidores.has(S.call.sid)) sairDaCall(); // fui expulso ou o servidor sumiu
    if (S.atual && !S.servidores.has(S.atual)) abrirServidor(null);
    else if (!S.atual && S.modo === "servidor") {
      const ultimo = guardar.ler(CHAVE_ULTIMO);
      if (ultimo && S.servidores.has(ultimo)) abrirServidor(ultimo);
    }
    renderTudo();
  }, erro => aviso("Erro ao carregar servidores: " + erro.code));
}

export function pararServidores() {
  parar("servidores");
  pararCanais(); pararPessoas();
  S.servidores.clear();
  S.atual = null;
}

/** Cria um servidor já com os canais do modelo escolhido. */
async function criarServidor(nome, modelo) {
  nome = String(nome || "").trim().slice(0, LIMITES.tamanhoNome);
  if (!nome) return;
  try {
    const ref = await addDoc(collection(db, "servidores"), {
      nome, dono: S.user.uid, membros: [S.user.uid], cargos: {}, banidos: [],
      permissoes: PERMISSOES_PADRAO, criadoEm: Date.now(),
    });
    await criarCanaisDoModelo(ref.id, MODELOS[modelo] ? modelo : "vazio");
    abrirServidor(ref.id);
    aviso("Servidor criado! Copie o convite pra chamar os amigos.");
  } catch (erro) {
    aviso("Não deu pra criar: " + (erro.code || erro.message));
  }
}

/** Entra no servidor do link de convite (#convite-ID), se houver. */
export async function tratarConvite() {
  const m = location.hash.match(/^#convite-([A-Za-z0-9]{10,40})$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    await updateDoc(srvDoc(m[1]), { membros: arrayUnion(S.user.uid) });
    S.anunciarEntrada = m[1]; // canais.js escreve "Fulano entrou no servidor"
    abrirServidor(m[1]);
    aviso("Você entrou no servidor!");
  } catch (erro) {
    const motivo = erro.code === "not-found" ? "Esse convite não existe mais."
      : erro.code === "permission-denied" ? "Você foi banido desse servidor."
      : "Não deu pra entrar: " + (erro.code || erro.message);
    aviso(motivo);
  }
}

export async function sairDoServidor() {
  if (!await confirmar("Pra voltar, você vai precisar de um convite.", { titulo: "Sair do servidor?", botao: "Sair" })) return;
  const sid = S.atual;
  if (S.call?.sid === sid) await sairDaCall();
  await updateDoc(srvDoc(sid), { membros: arrayRemove(S.user.uid) }).catch(e => aviso("Erro: " + e.code));
}

export async function excluirServidor() {
  if (!await confirmar("O servidor some pra todo mundo. Isso não tem volta.", { titulo: "Excluir servidor?", botao: "Excluir servidor" })) return;
  const sid = S.atual;
  if (S.call?.sid === sid) await sairDaCall();
  // apaga também canais, mensagens e presença (senão ficam guardados sem ninguém ver)
  await apagarServidorInteiro(sid).catch(e => aviso("Erro: " + (e.code || e.message)));
}

/* ------------------------------------------------------------ navegação */

/** Abre um servidor (null = nenhum). A call continua mesmo trocando de servidor. */
export function abrirServidor(sid) {
  S.modo = "servidor";
  if (sid === S.atual) return renderTudo();
  S.atual = sid;
  S.canalAtual = null;
  pararCanais(); pararPessoas();
  if (sid) {
    guardar.salvar(CHAVE_ULTIMO, sid);
    ouvirCanais(sid);
    ouvirPessoas(sid);
    if (ehCelular()) irPara("canais");
  }
  renderTudo();
}

/* ------------------------------------------------------------ desenho */

/** Bolinhas de servidor na barra da esquerda. */
export function renderTrilho() {
  const ordenados = [...S.servidores].sort((a, b) => (a[1].criadoEm || 0) - (b[1].criadoEm || 0));
  const itens = ordenados.map(([id, srv]) => {
    const li = document.createElement("li");
    li.className = "trilho__linha";
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "trilho__item";
    bt.classList.toggle("trilho__item--atual", S.modo === "servidor" && id === S.atual);
    bt.classList.toggle("trilho__item--em-call", id === S.call?.sid);
    const novidade = servidorNaoLido(id);
    const mencoes = mencoesNoServidor(id);
    li.classList.toggle("trilho__linha--novidade", novidade);
    // com foto: a capa vira o ícone (cortada no meio); sem foto: iniciais coloridas
    const foto = imagemSegura(srv.capa);
    if (foto) {
      // a moldura corta a foto no formato da bolinha (a foto pode ter zoom)
      const moldura = document.createElement("span");
      moldura.className = "trilho__moldura";
      const img = document.createElement("img");
      img.className = "trilho__foto";
      img.src = foto;
      img.alt = "";
      enquadrarCapa(img, srv.capaAjuste);
      moldura.append(img);
      bt.append(moldura);
      bt.classList.add("trilho__item--foto");
    } else {
      bt.style.backgroundColor = cor(srv.nome);
      bt.textContent = iniciais(srv.nome);
    }
    bt.title = srv.nome;
    bt.setAttribute("aria-label", `Servidor ${srv.nome}` + (mencoes ? `, ${mencoes} menção` : novidade ? ", mensagens novas" : ""));
    if (mencoes) {
      const selo = document.createElement("span");
      selo.className = "selo-numero";
      selo.textContent = mencoes > 9 ? "9+" : mencoes;
      bt.append(selo);
    }
    bt.addEventListener("click", () => abrirServidor(id));
    li.append(bt);
    return li;
  });
  $("listaServidores").replaceChildren(...itens);
  $("btDms").classList.toggle("trilho__item--atual", S.modo === "dm");
}

/** Topo do painel lateral quando um servidor está aberto. */
export function renderTopoServidor() {
  const srv = servidorAtual();
  $("nomeLateral").textContent = srv ? srv.nome : "Nenhum servidor";
  const capa = imagemSegura(srv?.capa);
  $("topoServidor").classList.toggle("lateral__topo--capa", !!capa);
  $("imgCapa").hidden = !capa;
  if (capa && $("imgCapa").src !== capa) $("imgCapa").src = capa;
  if (capa) enquadrarCapa($("imgCapa"), srv.capaAjuste);
  $("btConvite").hidden = !srv;
  $("btConfigServidor").hidden = !srv;
  $("cargoLateral").hidden = !srv;
  if (srv) $("cargoLateral").textContent = { dono: "Dono", admin: "Admin", mod: "Moderador", membro: "Membro" }[meuCargo()];
}

/* ------------------------------------------------------------ eventos */

export function iniciarServidores() {
  const sel = $("selModelo");
  for (const [valor, m] of Object.entries(MODELOS)) sel.add(new Option(m.rotulo, valor, false, valor === "gamer"));

  $("btNovoServidor").addEventListener("click", () => {
    $("campoNomeServidor").value = "";
    $("dlgServidor").showModal();
  });
  aoEscolher($("dlgServidor"), valor => {
    if (valor === "ok") criarServidor($("campoNomeServidor").value, sel.value);
  });
  $("btConvite").addEventListener("click", () =>
    copiar(location.href.split("#")[0] + "#convite-" + S.atual, "Convite copiado! Mande pros amigos."));
  $("btConfigServidor").addEventListener("click", abrirConfigServidor);
}
