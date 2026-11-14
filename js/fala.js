/**
 * fala.js — Acende a borda verde de quem está falando.
 * Elementos com data-fala="UID" ganham a classe "falando".
 */
import { S } from "./estado.js";
import { contextoAudio } from "./compat.js";

const LIMIAR_VOLUME = 18; // acima disso = falando

export function detectarFala(uid, stream) {
  try {
    const ctx = contextoAudio();
    ctx.resume?.();
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analisador);
    const amostras = new Uint8Array(analisador.frequencyBinCount);

    const medir = () => {
      const acabou = !S.call || stream.getTracks().every(t => t.readyState === "ended");
      if (acabou) return;
      analisador.getByteFrequencyData(amostras);
      const media = amostras.reduce((a, b) => a + b, 0) / amostras.length;
      const falando = media > LIMIAR_VOLUME;
      for (const el of document.querySelectorAll(`[data-fala="${CSS.escape(uid)}"]`)) el.classList.toggle("falando", falando);
      requestAnimationFrame(medir);
    };
    medir();
  } catch {
    // navegador sem Web Audio: só não mostra o indicador
  }
}
