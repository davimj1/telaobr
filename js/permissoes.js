/**
 * permissoes.js — Cargos (dono, admin, moderador, membro) e o que cada um pode fazer.
 * As mesmas regras são conferidas de novo no Firebase (firestore.rules).
 */
import { S, servidorAtual } from "./estado.js";
import { CARGOS, PERMISSOES_PADRAO } from "./config.js";

/** Cargo de alguém num servidor. */
export function cargoDe(uid, srv = servidorAtual()) {
  if (!srv) return "membro";
  if (srv.dono === uid) return "dono";
  return srv.cargos?.[uid] || "membro";
}

export const meuCargo = (srv = servidorAtual()) => cargoDe(S.user?.uid, srv);

/** Permissões de um cargo (as salvas no servidor ou as padrão). */
export function permissoesDoCargo(cargo, srv = servidorAtual()) {
  return { ...PERMISSOES_PADRAO[cargo], ...(srv?.permissoes?.[cargo] || {}) };
}

/** Eu posso fazer isso no servidor? */
export function pode(permissao, srv = servidorAtual()) {
  const cargo = meuCargo(srv);
  if (cargo === "dono") return true;
  return permissoesDoCargo(cargo, srv)[permissao] === true;
}

/** Só dá pra agir (expulsar, mudar cargo…) em quem tem cargo menor que o meu. */
export function possoAgirSobre(uid, srv = servidorAtual()) {
  if (uid === S.user?.uid) return false;
  return CARGOS[meuCargo(srv)].nivel > CARGOS[cargoDe(uid, srv)].nivel;
}

/** Cargos que eu posso dar (só abaixo do meu, e nunca "dono"). */
export function cargosQuePossoDar(srv = servidorAtual()) {
  const meuNivel = CARGOS[meuCargo(srv)].nivel;
  return Object.keys(CARGOS).filter(c => c !== "dono" && CARGOS[c].nivel < meuNivel);
}
