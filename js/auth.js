/**
 * auth.js — Login com Google e conta do usuário.
 */
import {
  auth, db, doc, setDoc, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "./firebase.js";
import { S, parar } from "./estado.js";
import { $, esc, aoEscolher } from "./util.js";
import { NAVEGADOR_DE_APP } from "./compat.js";
import { sairDaCall } from "./call.js";
import { pararServidores } from "./servidores.js";
import { fecharChat } from "./chat.js";
import { pararPerfis, definirAfk, renderEdicaoPerfil, iniciarEdicaoPerfil } from "./perfis.js";
import { pararAtividade, renderOpcoesAvisos } from "./avisos.js";
import { renderPonte } from "./ponte.js";
import { pararAmigos } from "./amigos.js";

/** Traduz os erros mais comuns do login pra algo que dá pra resolver. */
function explicarErro(erro) {
  if (erro.code === "auth/unauthorized-domain") {
    if (location.protocol === "file:")
      return "Você abriu o arquivo direto do PC. Use o Live Server do VS Code ou o site no GitHub Pages.";
    return `O endereço "${location.hostname}" não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).`;
  }
  if (erro.code === "auth/operation-not-allowed") return "O login com Google não está ativado no Firebase.";
  if (erro.code === "auth/network-request-failed") return "Sem internet. Confira a conexão e tente de novo.";
  return "Erro no login: " + (erro.code || erro.message);
}

/* ------------------------------------------------------------ consentimento (LGPD) */

/** Versão dos Termos/Política. Mudou o texto? Mude a data: todo mundo aceita de novo. */
export const VERSAO_TERMOS = "2026-11-25";

let consentiuNoLogin = false;

/** Guarda no perfil QUANDO e QUAL versão a pessoa aceitou (prova do consentimento). */
function registrarConsentimento() {
  S.consentimento = { versao: VERSAO_TERMOS, em: Date.now(), maiorDeIdade: true };
  return setDoc(doc(db, "usuarios", S.user.uid), { consentimento: S.consentimento }, { merge: true }).catch(() => {});
}

/**
 * Depois de entrar: se a pessoa ainda não aceitou esta versão dos termos
 * (conta antiga ou termos atualizados), pede o aceite antes de continuar.
 * @returns {Promise<boolean>} true se pode continuar
 */
export async function garantirConsentimento() {
  if (S.consentimento?.versao === VERSAO_TERMOS) return true;
  if (consentiuNoLogin) { await registrarConsentimento(); return true; }
  const dlg = $("dlgConsentimento");
  $("chkConsentimentoApp").checked = false;
  $("btAceitarTermos").disabled = true;
  dlg.showModal();
  return new Promise(resolver => {
    const form = dlg.querySelector("form");
    const aoEnviar = async e => {
      form.removeEventListener("submit", aoEnviar);
      if (e.submitter?.value === "ok") { await registrarConsentimento(); resolver(true); }
      else { resolver(false); sairDaConta(); }
    };
    form.addEventListener("submit", aoEnviar);
  });
}

/** Abre a janelinha do Google (ou redireciona, se a janelinha for bloqueada). */
async function entrarComGoogle() {
  $("erroLogin").textContent = "";
  // LGPD: sem marcar a caixa (18+ e termos), não entra
  if (!$("chkConsentimento").checked) {
    $("erroLogin").textContent = "Para entrar, marque a caixa confirmando que você tem 18 anos ou mais e concorda com os Termos e a Política de Privacidade.";
    $("chkConsentimento").closest(".consentimento").classList.add("consentimento--erro");
    $("chkConsentimento").focus();
    return;
  }
  consentiuNoLogin = true;
  if (NAVEGADOR_DE_APP) {
    $("erroLogin").textContent = "Abra o site no Chrome ou no Safari pra entrar com Google.";
    return;
  }
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provedor);
  } catch (erro) {
    const bloqueado = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"];
    const cancelado = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
    if (bloqueado.includes(erro.code)) return signInWithRedirect(auth, provedor);
    if (!cancelado.includes(erro.code)) $("erroLogin").textContent = explicarErro(erro);
  }
}

/** Sai da call, para de ouvir o banco e desloga. */
export async function sairDaConta() {
  await sairDaCall();
  fecharChat();
  pararServidores();
  parar("dms");
  pararPerfis();
  pararAtividade();
  pararAmigos();
  await signOut(auth);
  location.reload();
}

function abrirConta() {
  $("infoConta").innerHTML = `<strong>${esc(S.nome)}</strong><br>${esc(S.user?.email || "")}`;
  $("btAfk").textContent = S.afk ? "Voltar pra Online" : "Ficar AFK";
  renderOpcoesAvisos();
  renderPonte();
  renderEdicaoPerfil();
  $("dlgConta").showModal();
}

/**
 * Liga o login.
 * @param {{ aoEntrar: Function }} opcoes  aoEntrar roda depois que a pessoa loga
 */
export function iniciarLogin({ aoEntrar }) {
  if (NAVEGADOR_DE_APP) $("avisoNavegador").hidden = false;

  getRedirectResult(auth).catch(erro => ($("erroLogin").textContent = explicarErro(erro)));
  $("btGoogle").addEventListener("click", entrarComGoogle);
  $("chkConsentimento").addEventListener("change", e => {
    e.target.closest(".consentimento").classList.remove("consentimento--erro");
    if (e.target.checked) $("erroLogin").textContent = "";
  });
  $("chkConsentimentoApp").addEventListener("change", e => { $("btAceitarTermos").disabled = !e.target.checked; });
  // a janela de aceite não fecha com Esc: ou aceita, ou sai
  $("dlgConsentimento").addEventListener("cancel", e => e.preventDefault());
  // "Pular para o conteúdo": leva o foco pra área principal que está aparecendo
  $("linkPular").addEventListener("click", e => {
    e.preventDefault();
    const alvo = S.user ? $("conteudoApp") : $("conteudoLogin");
    alvo.focus();
  });
  $("btUsuario").addEventListener("click", abrirConta);
  iniciarEdicaoPerfil();
  aoEscolher($("dlgConta"), v => {
    if (v === "sair") sairDaConta();
    if (v === "afk") { S.afkManual = !S.afk; definirAfk(!S.afk); }
  });

  onAuthStateChanged(auth, usuario => {
    S.user = usuario;
    $("telaLogin").hidden = !!usuario;
    $("telaApp").hidden = !usuario;
    if (!usuario) return;
    S.nome = usuario.displayName || (usuario.email || "Sem nome").split("@")[0];
    S.foto = usuario.photoURL || "";
    aoEntrar();
  });
}
