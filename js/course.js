// Table of contents, extracted from app.js so study.html can reuse it as an ES module.
// Keep in sync with app.js's COURSE until the P5 consolidation removes the duplication.
export const COURSE = {
  parts: [
    { label: "Teil I — Regulatorische Architektur", tag: "Foundations",
      mods: [
        ["m01", "Warum Bankenregulierung? Basel → CRR → ÖRS"],
        ["m02", "Eigenmittel: CET1/AT1/T2 & Pufferstapel"],
        ["m03", "Zwei Linsen: Normativ vs. Ökonomisch (ICAAP/SREP)"],
      ]},
    { label: "Teil II — Risikotragfähigkeit", tag: "Core",
      mods: [
        ["m04", "RTFA: Problemfall (95%) vs. Extremfall (99,9%)"],
        ["m05", "Kreditrisiko: IRB-Formel, FX, Konzentration"],
        ["m06", "Marktrisiko: IRRBB, FX, Spread-VaR"],
        ["m07", "CVA-Risiko: Skalierung 0,71 / 1,33"],
        ["m08", "Operationelles Risiko: 5% / 15%"],
        ["m09", "Liquiditätsrisiko: FLVaR & Mischzinssatz"],
        ["m10", "Beteiligungsrisiko: Risikofaktoren & 3×-Regel"],
        ["m11", "Sonstige Risiken: Großkredite, Makro, FW-EM"],
      ]},
    { label: "Teil III — Aggregation & Deckungsmassen", tag: "Build-up",
      mods: [
        ["m12", "Risikoaggregation: Korrelation +1, Konsolidierung"],
        ["m13", "Deckungsmassen: Problemfall vs. Extremfall"],
        ["m14", "Daten, Reporting & Kennziffern"],
      ]},
    { label: "Teil IV — Ausfall & Parameter", tag: "Deep dive",
      mods: [
        ["m15", "Ausfalldefinition (Art. 178), LGD-Schätzung"],
      ]},
    { label: "Teil V — Ausblick & Einlagensicherung", tag: "Context",
      mods: [
        ["m16", "Basel IV / CRR III & CRD VI"],
        ["m17", "Einlagensicherung: DGSD, ESAEG & IPS"],
      ]},
    { label: "Teil VI — IRB-Parameter & Basel IV/CRR III", tag: "Advanced",
      mods: [
        ["m18", "IRB-Parameter: PD, Downturn-LGD, CCF & MoC"],
        ["m19", "CRR III Kreditrisiko: SA, IRB & Output-Floor"],
        ["m20", "CRR III: Op-Risk (SMA), CVA, FRTB & SA-CCR"],
      ]},
    { label: "Teil VII — Aufsicht, Stress, Liquidität & Abwicklung", tag: "Advanced",
      mods: [
        ["m21", "EBA/ECB: ICAAP, SREP, NPE & Großkredite"],
        ["m22", "Stresstests & Reverse-Stresstests"],
        ["m23", "Liquidität: LCR, NSFR & ILAAP"],
        ["m24", "Sanierung, Abwicklung, MREL & Einlagensicherung"],
      ]},
    { label: "Abschluss", tag: "Capstone",
      mods: [
        ["capstone", "Mock-RTFA + Viva"],
        ["glossary", "Bilinguales Glossar (DE/EN)"],
      ]},
  ]
};
