"use strict";
/* pt-BR dictionary entries for the structured {key,params} log lines emitted
   by shared/roomUtils.js pushLog(). Only pt-BR is filled in for now — I18N.t()
   already falls back to pt-BR (or to the raw key) for any locale/key that
   isn't covered yet, so this is safe to ship incrementally while the other
   4 languages get filled in game by game. Must load after shared/i18n.js. */
(function (root) {
  const I18N = typeof module !== "undefined" && module.exports ? require("./i18n.js") : root.I18N;

  I18N.registerDict({
    "common.log.joined": { "pt-BR": "{name} entrou na sala (assento {seat})." },
    "common.log.disconnectedAiTookOver": { "pt-BR": "{name} desconectou — a IA assumiu o assento." },
    "common.log.disconnected": { "pt-BR": "{name} desconectou." },
    "common.log.left": { "pt-BR": "{name} saiu da sala." },

    "landlord.log.dealt": { "pt-BR": "Cartas distribuídas. Rodada de lances iniciada." },
    "landlord.log.bidPassed": { "pt-BR": "{name} passou o lance." },
    "landlord.log.bidMade": { "pt-BR": "{name} deu lance de {bid}." },
    "landlord.log.noBids": { "pt-BR": "Ninguém deu lance — nova distribuição." },
    "landlord.log.becameLandlord": { "pt-BR": "{name} é o Landlord!" },
    "landlord.log.played": { "pt-BR": "{name} jogou {comboType} ({cards})." },
    "landlord.log.wonHand": { "pt-BR": "{name} venceu a mão!" },
    "landlord.log.passed": { "pt-BR": "{name} passou." },
  });
})(typeof window !== "undefined" ? window : globalThis);
