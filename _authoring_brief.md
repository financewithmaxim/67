# AUTHORING BRIEF — Leitfaden Früherkennung course modules
# (internal; not part of the published site)

You are writing ONE self-contained HTML module page for a graduate course that
reconstructs the ÖRS *Leitfaden Früherkennung* (Version 09/2024). The learner is a
**Junior Risk Controller in Sector Risk Controlling Services** at Raiffeisen — quant-strong
(integrals, distributions, matrix algebra, copulas are fine), fluent in R and SQL (DO NOT
teach R/SQL; you may *reference* how an input maps to data). Goal: deep conceptual + regulatory
"why", to earn promotion and defend the methodology to senior management and the Aufsichtsrat.

## LANGUAGE
- Teach in **English**, but keep **every technical term in German** and gloss it once in English,
  e.g. *Risikotragfähigkeit* (risk-bearing capacity). German nouns capitalised.
- Each module ends with a **German recap** (box class "german") AND an English recap.

## THE NON-NEGOTIABLE RULE
For every fixed number/parameter, state whether it is a **regulatory value** (CRR/EBA forces it)
or an **ÖRS modelling decision** (proportionality/simplification), and what it trades off.
Use inline badges: `<span class="tag reg">regulatory</span>` and `<span class="tag ors">ÖRS choice</span>`.
Use callout boxes class "reg" and "ors" for deeper notes.

## HTML TEMPLATE (use EXACTLY this skeleton; fill the CONTENT)
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MNN · SHORT TITLE — Leitfaden Früherkennung</title>
<link rel="stylesheet" href="../css/style.css">
<script>MathJax={tex:{inlineMath:[['\\(','\\)']],displayMath:[['$$','$$'],['\\[','\\]']]},svg:{fontCache:'global'}};</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>
</head>
<body data-module="mNN">
<button class="navtoggle" id="navtoggle">☰</button>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <a href="../index.html"><div class="brand">Leitfaden <span class="accent">Früherkennung</span></div></a>
    <div class="subtitle">EU Bank Capital Regulation &amp; Risk Management · Raiffeisen / ÖRS</div>
    <div id="sidebar-nav"></div>
  </aside>
  <main class="content"><div class="page">

    <div class="modhead">
      <div class="crumb"><a href="../index.html">Home</a> › Teil X › Module NN</div>
      <h1>Module NN — TITLE</h1>
    </div>
    <p class="lead">ONE-SENTENCE framing.</p>

    <div class="objectives">
      <h4>By the end of this module you can…</h4>
      <ul><li>…</li></ul>
    </div>

    <!-- §6 TEACHING LOOP: Motivation → Concept → Derivation → Worked example → In practice → Traps → Quiz → Recap -->

    <h2>1 · Motivation — why this exists</h2>
    ...
    <h2>2 · Concept &amp; logic</h2>
    ...
    <h2>3 · Derivation</h2>
    ...
    <h2>4 · Worked example</h2>
    <div class="box example"><div class="box-title">Worked example</div> ... </div>
    <h2>5 · In practice (the Leitfaden &amp; the data)</h2>
    ...
    <h2>6 · Nuances &amp; traps</h2>
    <div class="box trap"><div class="box-title">⚠ Trap</div> ... </div>

    <div class="quiz" id="quiz"></div>

    <h2>Recap</h2>
    ... english recap (bullets) ...
    <div class="box german"><div class="box-title">🇦🇹 Zusammenfassung (Deutsch)</div> ... 3-5 German bullets ... </div>

    <nav class="modnav">
      <a class="prev" href="PREV.html"><div class="dir">← Previous</div><div class="ttl">PREV TITLE</div></a>
      <a class="next" href="NEXT.html"><div class="dir">Next →</div><div class="ttl">NEXT TITLE</div></a>
    </nav>

  </div></main>
</div>
<script src="../js/app.js"></script>
<script>
const QUIZ = { title:"SHORT", pass:0.7, questions:[
  { q:"…", options:["…","…","…","…"], answer:0, explain:"…" },
  // 3 questions minimum
]};
</script>
</body>
</html>
```

## STYLE/COMPONENT CHEATSHEET (classes already in style.css)
- Callout boxes: `<div class="box CLASS"><div class="box-title">…</div><p>…</p></div>`
  classes: `motivation` (gold), `trap` (red), `reg` (navy, regulatory), `ors` (purple, ÖRS choice),
  `german` (green recap), `key` (blue takeaway), `example` (worked example).
- Formula block: `<div class="formula">$$ … $$<div class="where"><b>where</b> … symbol defs</div></div>`
- Tables: plain `<table>` inside `<div class="tablewrap">`. Use `class="num"` on numeric cells.
- Traffic light cell: `<span class="tl green|yellow|red">…</span>`
- Inline badges: `<span class="tag reg">regulatory</span>`, `<span class="tag ors">ÖRS choice</span>`
- DERIVE, don't assert. Define every symbol. Cite CRR articles + Leitfaden section precisely.
- Use MathJax for all math: inline `\( … \)`, display `$$ … $$`.

## QUIZ
3–5 multiple-choice questions, `answer` is the 0-based correct index, every question has a
substantive `explain`. Make them examiner-grade (test the "why", the traps, the reg-vs-ÖRS split).

===========================================================================================
## MASTER FACT SHEET — every figure is from the Leitfaden 09/2024 unless marked.
===========================================================================================

### SCENARIOS / RTFA (Ch.4)
- **Problemfall**: Konfidenzintervall **95%**; risk = unerwarteter Verlust (unexpected loss);
  Deckungsmasse = budgeted/expected Jahresüberschuss after tax minus Mindestausschüttung +
  Gewinnvortrag + freies Kapital + stille Reserven ± excess/shortfall.
  Statistical reading: at 100% utilisation, a loss > Deckungsmasse expected once every **20 years** (1/(1-0.95)=20).
  Traffic light: ≤90% (CRR+P2R+Puffer) green; >90% yellow; >95% (CRR+P2R) red. >90% solo not targeted.
- **Extremfall**: Konfidenzintervall **99,9%**; = ökonomisches Kapital; analog Säule 2 / IRB; 1-yr horizon.
  This is a Liquidationsfall per OeNB/FMA. Deckungsmasse = profit/loss from continuing operations
  pre-tax + Gewinnvortrag + anrechenbare Eigenmittel + stille Reserven ± excess/shortfall − Neubewertungsreserve.
  Traffic light: ≤90% green; >90% & ≤95% yellow; >95% red.
- **VaR consistency**: horizontal & vertical: e.g. market risk 10-day/95% ↔ credit equivalent 99%/1yr.
- Risk **aggregation = ADDITION (correlation = +1)** across all material single risks. Within market
  risk, correlation between Zinsrisiko and Credit-Spread risk IS considered.
- Reporting: Gelb = Management Summary + measures; Rot = detailed Summary + concrete steps & timing.
  Applies to all R-IPS members + R-IPS. **Redepflicht Bankprüfer** per §63(3) BWG → reports to
  bg-lg@raiffeisen-einlagensicherung.at. Legal basis §39/§39a BWG. In force 01 Jan 2024.

### CREDIT RISK (Ch.5.1) — the heart
- Credit risk reported = **unexpected loss (UL)** via IRB formula. Expected loss (EL = PD·LGD) sits in
  the Deckungsmasse as **excess/shortfall** (EL vs Vorsorgen), for BOTH Problemfall & Extremfall.
- UL: Corporates/FI/Sovereigns/LRG/CIU → **CRR Art. 153**; Retail selbst./unselbst. → **CRR Art. 154**.
  For Problemfall the confidence level is rescaled to **95%**.
- **Risikoposition** = Exposure − interne Sicherheiten per customer (never < 0). Exposure includes:
  balance (book/market value), weighted off-balance (Haftungswert incl. letters of credit, derivatives,
  repos), weighted undrawn committed lines, weighted (≥20%) undrawn internal lines. Netting & CSA cash
  collateral reduce the Saldo; consortium shares deducted; provisions NOT deducted from Saldo.
- Forderungsklassen: Corporates, Financial Institutions, Sovereigns, Retail selbständig, Retail
  unselbständig, LRG (Local & Regional Governments), CIU (Collective Investment Undertaking / funds).
- **FX credit-risk add-on**: exposure of FX loans scaled up by the scenario-scaled annual volatility of
  FX rates (3-yr history). FI & Sovereigns: NO FX credit risk (materiality / consolidation).
- **PD–FX elasticity**: linear regression of PD on GDP and FX. Estimated **FX-elasticity of PD_PiT = 1,9 (190%)** <span class="tag ors">ÖRS choice</span> (RBI-Retail proxy until local series long enough).
  ⚠ **KNOWN INTERNAL INCONSISTENCY** to flag as a trap: the Leitfaden's numeric example reads
  "TtC PD 2%, 25% devaluation → PD_PiT = 2% + 273%·25%·2% = 3,005%". The "273%" and the "1,9"
  are inconsistent (and 1,9 would give 2,95%; the 3,005% result implies ~2,0). Treat the stated
  **elasticity = 1,9** as the governing parameter and point out the example is a documentation slip.
  Correct application with 1,9: PD_PiT = PD_TtC·(1 + 1,9·Δfx) → 2%·(1+1,9·0,25)=2,95%.
- FX effect on LGD: handled implicitly (exposure uplift treated as unsecured → raises blended LGD;
  and long LGD observation window already spans FX swings).
- **Concentration risk** = Granularitätsaufschlag (granularity add-on) on UL: difference between UL of
  the real portfolio and an infinitely granular (asymptotic) portfolio of same characteristics.
  HHI = hhi21 + hhi22, with hhi21 = Σ sᵢ² over the top Corporates (max **110** open positions, per GvK),
  hhi22 = sₘ·(1 − Sₘ) tail correction, sᵢ = open single position / total open corporate position,
  Sₘ = Σ sᵢ. HHI ∈ [1/n, 1]. Add-on = UL · HHI; new UL = UL + UL·HHI.
- **PD**: assigned by Ratingstufe. Master scale (10-step) midpoint PDs (geometric mean of bounds):
  0,5→0,0533% · 1,0→0,1200% · 1,5→0,2700% · 2,0→0,6075% · 2,5→1,3669% · 3,0→3,0755% ·
  3,5→6,9198% · 4,0→15,5696% · 4,5→35,0315% · 5,0/5,1/5,2→100% · NR→35,0315%.
  FI/Sovereigns/LRG/CIU use RBI-group PDs (no validated RBG-wide PDs).
- **LGD**: regulatory range 12,5% (covered bonds) … 75% (purchased receivables); unsecured default **45%**
  <span class="tag reg">regulatory</span>. ÖRS pooled estimates (data-pool approach, living portfolio):
  **Corporate 45,5%**, **Retail selbständig 54,4%**, **Retail unselbständig 55,8%** <span class="tag ors">ÖRS choice</span>.
  Default classes: LGD 80% for 5,1 and 100% for 5,2. Other classes: regulatory 45% (F-IRB), 5,1/5,2 →100%.
  Covered bonds may use 12,5%.
- **M (effektive Restlaufzeit)**: **2,5 years** for IRB-formula credits <span class="tag ors">ÖRS choice (fixed)</span>;
  **1 year** for "nur Wertpapiere" (to avoid double count — bond downgrade risk sits in market/credit-spread risk).

### IRB / VASICEK (CRR Art. 153/154) — derive in M5
- Merton latent-asset model; Gaussian copula / single systematic factor (ASRF).
  Conditional default prob: \(P(D\mid X)=\Phi\!\Big(\frac{\Phi^{-1}(PD)-\sqrt{\rho}\,X}{\sqrt{1-\rho}}\Big)\).
  Worst-case factor at conf. \(q\): set \(X=\Phi^{-1}(1-q)=-\Phi^{-1}(q)\).
  Conditional PD at q: \(\;PD_q=\Phi\!\Big(\frac{\Phi^{-1}(PD)+\sqrt{\rho}\,\Phi^{-1}(q)}{\sqrt{1-\rho}}\Big)\).
- CRR corporate correlation: \(R=0.12\frac{1-e^{-50\,PD}}{1-e^{-50}}+0.24\Big(1-\frac{1-e^{-50\,PD}}{1-e^{-50}}\Big)\) (0.12–0.24).
  Maturity adjustment \(b(PD)=(0.11852-0.05478\ln PD)^2\); \(K=\big[LGD\cdot PD_q-LGD\cdot PD\big]\cdot\frac{1+(M-2.5)b}{1-1.5b}\).
  RWA=K·12.5·EAD. Regulatory q = 99.9%. Retail (Art.154): fixed correlations (0.03–0.16; QRRE 0.04; mortgages 0.15), no maturity adjustment.
- **Problemfall** swaps q=99.9% → **95%** (Φ⁻¹(0.95)=1.6449 vs Φ⁻¹(0.999)=3.0902). EL term = LGD·PD.

### CVA (Ch.5.2) — CRR Title VI (own-funds based)
- Risk = CVA Eigenmittelerfordernis (PosNr 7516000, EM-weight 8%) scaled by normal-quantile ratio:
  **Problemfall × 0,71** = 1,6449(95%)/2,3263(99%); **Extremfall × 1,33** = 3,0902(99,9%)/2,3263(99%).
  Both <span class="tag ors">ÖRS scaling choice</span> on a regulatory charge.

### MARKET RISK (Ch.5.5)
- Holding period **250 days** (Bankbuch). Trading book = own-funds charge for position/FX/commodity risk
  minus FX own-funds charge (avoid double count).
- **IRRBB (Zinsrisiko Bankbuch)**: parametric VaR on gap present values per maturity band & currency,
  using ITS/IRRBB gaps. Risk = Barwert − simulierter Barwert; Barwert = gap discounted at spot rate per band;
  simulierter Barwert = gap discounted at (rate · vola). Vola = relative vola of maturity-matched market
  rate, 3-yr history, scaled to confidence. **Negative rates** break the log method → apply a **+200 bp
  parallel shift** across the curve for currencies with negative rates so logs are positive. <span class="tag ors">ÖRS choice</span>.
  "Sonstige Währungen" gaps priced on the EUR curve. Options enter via delta-equivalent off-balance.
- **FX / offene Devisenposition**: per currency, Risk = Position · Vola(holding period) · percentile(conf 95–99,9%).
  Undiversified = sign-neutral sum. Diversified (vs Deckungsmasse) uses correlation matrix:
  VaR_P = √(VaR_A² + VaR_B² + 2·corr_AB·VaR_A·VaR_B).
- **Preisrisiko Handelsbuch**: own-funds charge minus FX charge, scaled ×0,71 (Problemfall) / ×1,33 (Extremfall).
- **Preisrisiko Bankbuch**: equities in banking book → like Beteiligungsrisiko; indirect/fund holdings → VaR on
  specific market vola or simplified via index (e.g. ATX), scaled to 95% / 99,9%.
- **Spreadrisiko (Credit-Spread VaR)**: on "nur Wertpapiere"/"nur Covered Bonds" by Forderungsklasse × Ratingklasse.
  Risk factor = relative bond volatilities per rating class (Markit Overall, 3-yr) scaled to 250-day holding.
  Risk = sim. PV2 − PV1; PV2 = MV·(1+swap+CS_current)^Dlfzt / (1+swap+CS_stressed)^Dlfzt; Dlfzt = capital-weighted
  avg maturity per rating class. Diversified via correlation matrix between rating classes:
  CS-VaR(div)=√[ (PV2−PV1)ᵀ · Corr · (PV2−PV1) ].

### OPERATIONAL RISK (Ch.5.6)
- **Extremfall**: 15% of Betriebserträge (≈ Basisindikatoransatz / avg standardised) <span class="tag reg">regulatory-anchored</span>.
- **Problemfall factor 5,0%** derived: assume op risk is ⅓ normal + ⅔ lognormal; scale 15% from 99,9% to 95%:
  op-factor = 15% · (0,33 · 1,645/3,090 + 0,67 · 5,180/21,982) = 5,0% <span class="tag ors">ÖRS choice</span>.
  Normal quantiles: 95%→1,645σ, 99,9%→3,090σ. Lognormal: exp(1,645)=5,180 ; exp(3,090)=21,982.
- Includes IKT/ICT risk and AML (Geldwäsche/Terrorismusfinanzierung) as op risk.

### LIQUIDITY (Ch.5.7)
- **Problemfall**: measured per Leitfaden Liquidität; **no Deckungsmassen charge**.
- **Extremfall**: structural/liquidity-price risk via **FLVaR** (Funding-Liquidity-VaR), simplified
  variance-covariance. Basis = open non-cumulative liquidity gaps of the Normalfall in bands >1yr,
  with bands >5yr netted. Confidence **99,9%**, holding **250 days** (analog IRRBB). Only counts when
  there is a funding NEED (negative undiversified FLVaR).
  Risk = PV2 − PV1; PV1 = lgapᵢ·DFᵢ(Mischzinssatz); PV2 = lgapᵢ·DFᵢ(stressed Mischzinssatz).
  Diversified via CDS correlation matrix: FLVaR(div)=√[(PV2−PV1)ᵀ·CDS_Corr·(PV2−PV1)].
- **Mischzinssatz** = (IRS+CDS)·(1−Primäreinlagenanteil) + SPI·Primäreinlagenanteil. SPI = OeNB sub-1yr
  savings indicator; CDS = AT sovereign CDS curve. Primäreinlagenanteil = Σ Primäreinlagen>1yr / Σ Gesamtrefi>1yr.
  Stressed: add CDS-Vola(99,9%) and SPI-Vola(99,9%). Primäreinlagen = customer deposits/savings/sight + own
  retail/non-retail issues; Interbank = total refi − Primäreinlagen. Excludes equity & liquidity reserve.
- **Simplified factor approach** (small institutions): assume full primary-deposit funding, indicator 1%,
  100bp vola scaled to 99,9% over 1yr: Liquiditätsrisiko = (Σ(Gap·Laufzeitband_years)·Preisabweichung)·75%.
  Example: (50·1,5+60·2−20·3−10·5)·0,01·1·0,75·Abzinsungsfaktor.

### BETEILIGUNGSRISIKO (Ch.5.4)
- Sub-risks: Dividendenausfallrisiko (dividend default), Teilwertabschreibungsrisiko (write-down),
  Veräußerungsverlustrisiko (disposal loss), Nachschussverpflichtung (top-up), strategische/moralische
  Sanierungsverantwortung, Reduktion stiller Reserven (hidden-reserve reduction).
  Except dividend risk, set the loss not exceeded with 95% / 99,9% probability.
- Exposure = Verkehrswert (book value on/weighted-off-balance + stille Reserven). Risk = Verkehrswert · Risikofaktor.
- Risk factors by rating & segment (Bank vs Industrie vs Immobilien), expert-estimated in bands:
  Bank/general table (Problemfall|Extremfall): 0,5:1-5%|1-5% · 1,0&1,5:5-10%|15-30% · 2,0&2,5:10-15%|30-45% ·
  3,0:15-20%|45-60% · 3,5:20-25%|60-75% · 4,0:25-30%|75-90% · 4,5:30-50%|90-100% · 5,x:50-100%|100% · n.r.:15-20%|45-60%.
  **RBI participation**: rating A2(1,0) → 10% Problemfall / 30% Extremfall.
  Industrie (>€10m) same as general table. Immobilien (>€10m) lower (less cyclical, inflation-indexed rents).
  **"3× rule"**: as a rule Extremfall ≈ 3× Problemfall.
- Materiality: single assessment required for Industrie/Immobilien participations with **book value > €10m**;
  below → flat per-rating-class factors.
- **Eigengenutzte Immobilien** (own-used property, own balance & in subsidiaries): 5% Problemfall / 15% Extremfall.
- Off-balance (Eventualverpflichtungen) added via **Ausübungswahrscheinlichkeiten** (exercise probabilities,
  analog Credit Conversion Factor) by rating: 0,5:0% · 1,0:5% · 1,5:10% · 2,0:20% · 2,5:30% · 3,0&3,5:50% ·
  4,0&4,5:80% · 5,x:100%.
- NO diversification: total participation risk = sum of single risks.

### LÄNDERRISIKO (Ch.5.3)
- Cross-border add-on (rating ceilings don't fully capture transfer/convertibility risk). Computed like
  credit risk on internal data BEFORE collateral, by sovereign rating PD. Only UL; defaulted (5,x) excluded.
  If country rating already includes transfer/convertibility risk, may skip for direct sovereign investments.

### MAKROÖKONOMISCHES RISIKO (Ch.5.8)
- Only applied to **credit risk** (most material). Assume GDP drop → higher PDs & LGDs; recompute EL+UL.
  A ~**2% GDP decline** → PDs up ~**25%**, LGDs up ~**5%**. Macro risk = (new credit risk) − (original credit risk).
  Both EL and UL. <span class="tag ors">ÖRS modelling (from Leitfaden Stresstesting)</span>.

### GROSSKREDITE (Ch.5.9) — CRR Part Four context
- Assessed at Gruppe verbundener Kunden (GvK, OeNB customer structure). Largest exposures for customers,
  FI, Sovereigns. Calculated total exposure related to **R-IPS CET1**. Exclude R-IPS-member companies/banks/issues.

### SONSTIGE RISIKEN (Ch.5.10)
- **5% buffer** (Puffer sonstige Risiken): both scenarios add **5% of the quantified risks** as approximation
  for strategic/reputational/business-model/systemic/model risk. <span class="tag ors">ÖRS choice</span>.
  Justified partly because future operating income is NOT counted in the Extremfall Deckungsmasse.
- **Fremdwährungs-Eigenmittelrisiko** (Problemfall only): FX rise → higher loan Saldo → higher RWA base.
  Risikoposition scaled by FX vola (3yr); if no full currency separation, FX proxy **15% Problemfall / 30% Extremfall**;
  take **8%** of that as the EM risk. Extremfall: not applied.

### AGGREGATION & CONSOLIDATION (Ch.7)
- Single institutions: add single risks. IPS consolidated view adjustments:
  exclude **participation risks within the consolidation circle** and **intra-group credit exposures**
  (to ZI and others within the circle) to avoid overstating risk; Deckungsmasse on consolidated own funds.
  Solo vs KI-Gruppe (§30 BWG) vs IPS → same bank, different Auslastung. IFRS-group units: look-through if
  also in KI-Gruppe; else as Beteiligungsrisiko. Stille Reserven on KI-Gruppe §30 BWG basis (solo only).

### DECKUNGSMASSEN (Ch.6, 8.1)
- **Problemfall** = Freier Jahres-/Konzernüberschuss + Freies Kapital + Stille Reserven + Excess/Shortfall.
  Freier Überschuss (UGB) = expected/budgeted Jahresüberschuss + Gewinnvortrag − Mindestausschüttung
  (quarterly haircut 85%/85%/90%/100% Q1–Q4). IFRS/CRR-Rechnungskreis: budgeted Konzernüberschuss after tax
  & minorities + expected risk costs (EL already in own funds under IFRS9). Freies Kapital = CET1 above the
  legal requirement (incl. P2R if set) minus Neubewertungsreserve; €5m legal floor applies. Stille Reserven:
  book vs market/Verkehrswert on securities & participations; **RLB option**: a Bundesland over the yellow
  threshold may count stille Reserven of the participation in the Spitzeninstitut up to **60% of Verkehrswert**
  minus book value. (Worked example: Verkehrswert RLB €432m, Buchwert RBn €104m, stille Reserve €328m;
  60%·432 − 104 = €155m max.) Excess/Shortfall = EL − Wertberichtigungen of whole portfolio.
- **Extremfall** = Freier Jahres-/Konzernüberschuss (profit pre-tax from continuing ops + Gewinnvortrag)
  + Freies Kapital (anrechenbare Eigenmittel − Neubewertungsreserve + nachrangiges FK + Abzugsposten
  Beteiligungen) + Stille Reserven − Neubewertungsreserve + Excess/Shortfall.
- Data: VERA, COREP, FINREP melders (Belege 7, 12, 15, 80/81, FINREP/FINUS). UGB vs IFRS/CRR-Rechnungskreis.
  GESAMTRISIKOBETRAG 7980000; CET1 7810002; Kapitalerhaltungspuffer 8127010; antizykl. 8127030; SyRB 8128000.

### DATA / REPORTING / KENNZIFFERN (Ch.8, 9)
- Quarterly rhythm; OeNB Meldekalender deadlines; R1 format per "ÖRS Datenspezifikation"; 10 BAT after quarter-end.
  Reporting address srg-office@rbinternational.com. Both unconsolidated & consolidated. Kennziffern: loan/deposit,
  CIR, asset encumbrance, NPE, IRRBB outlier/SOT tests (EBA/GL/2018/02; SOT RTS).

### DEFAULT (Ch.10.2) — CRR Art. 178
- Triggers: (a) unlikely-to-pay; (b) >90 days past due on a material obligation. Mapping:
  **5,0** = >90 days overdue; **5,1** = other default reasons; **5,2** = insolvency or write-off.
- **Materiality threshold** (Leitlinie (EU) 2020/978): absolute **€100 retail / €500 non-retail** AND relative
  **1%** of total on-balance exposures (excl. equity). Insolvency & Fälligstellung: NO materiality threshold (≥€1).
- **Cure**: sustainability ≥ **12 months** improvement; "re-aging" two-stage with ≥**90-day** probation
  (RZ 71 EBA/GL/2016/07), counter ≤30 days at 2nd check. Loss-bearing default reasons can't end via "customer pays again".

### BASEL IV / CRR III & CRD VI (M16 — flag for verification, post-dates Leitfaden)
- **Output floor** 72,5% of SA RWAs (phase-in to 2030). Revised SA & IRB (PD/LGD input floors, scope limits on A-IRB).
  **FRTB** market risk. **SA-CCR** counterparty. Revised **CVA** (BA-CVA/SA-CVA). New op-risk **SMA** =
  Business Indicator Component × Internal Loss Multiplier (replaces BIA/TSA/AMA). EU application from **1 Jan 2025**
  (FRTB own-funds reporting delayed). The Leitfaden's op-risk (BIA-style) and CVA approaches are superseded by CRR III.
- ⚠ Mark CRR III timeline/buffer specifics as "verify against current EUR-Lex / EBA".

### EINLAGENSICHERUNG (M17 — flag for verification)
- EU **DGSD 2014/49/EU**; Austrian **ESAEG**. Coverage **€100,000** per depositor per institution; target level
  **0,8%** of covered deposits. Austria: single scheme **Einlagensicherung AUSTRIA** since 2019 (Raiffeisen had its
  own **Österreichische Raiffeisen-Einlagensicherung** earlier; verify current arrangement). IPS (R-IPS) vs DGS:
  IPS = mutual support to keep members solvent (Art. 113(7) CRR); DGS = pay out depositors. Interaction & current
  Austrian scheme structure: **flag for verification** against current FMA/ESA sources.
