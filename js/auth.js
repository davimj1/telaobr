/**
 * auth.js — Login com Google e conta do usuário.
 */
import {
  auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "./firebase.js";
import { S, parar } from "./estado.js";
import { $, esc } from "./util.js";
import { NAVEGADOR_DE_APP } from "./compat.js";
import { sairDaCall } from "./call.js";
import { pararServidores } from "./servidores.js";
import { fecharChat } from "./chat.js";
import { pararPerfis, definirAfk } from "./perfis.js";
import { pararAtividade, renderOpcoesAvisos } from "./avisos.js";

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

/** Abre a janelinha do Google (ou redireciona, se a janelinha for bloqueada). */
async function entrarComGoogle() {
  $("erroLogin").textContent = "";
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
  await signOut(auth);
  location.reload();
}

function abrirConta() {
  $("infoConta").innerHTML = `<strong>${esc(S.nome)}</strong><br>${esc(S.user?.email || "")}`;
  $("btAfk").textContent = S.afk ? "Voltar pra Online" : "Ficar AFK";
  renderOpcoesAvisos();
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
  $("btUsuario").addEventListener("click", abrirConta);
  $("dlgConta").addEventListener("close", () => {
    const v = $("dlgConta").returnValue;
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
