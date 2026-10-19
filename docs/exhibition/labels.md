# Czech texts — touchscreen and physical labels

House rule: the term is always **rezervoárové počítání (reservoir computing)**, with the English in
parentheses. All Czech copy below should be read by a native speaker or the curator before printing.

## A. Short label beside the screen (the one the visitor reads first)

> **Může hmota počítat?**
>
> Obrazovka je **interaktivní simulace** experimentu. Vedle ní je **skutečný materiál**: nanotrubičky
> WS₂ a základní elektronika s osciloskopem. Obrazovka nic neovládá a osciloskop nereaguje na váš dotyk.
> Dívejte se na obojí: na simulaci, jak by hmota odpověděla, a na materiál, který tu odpověď umožňuje.

*EN:* The screen is an **interactive simulation** of the experiment. Beside it is the **real material**:
WS₂ nanotubes and basic electronics with an oscilloscope. The screen controls nothing, and the oscilloscope
does not react to your touch.

## B. Label for the sample (physical object)

> **Vzorek: nanotrubičky WS₂**
> Shluk nanotrubiček sulfidu wolframu na křemíkové podložce, s elektrodami pro přívod a čtení signálu.
> Právě tento typ materiálu se používá v rezervoárovém počítání (reservoir computing).

Optional second line (checked against the article, Han et al., Nature Communications 17, 1514, 2026:
the cluster has about 1.4 × 10⁸ contacts, the fruit fly's brain about 10⁸ synapses):
> Uvnitř je řádově sto milionů nanometrových kontaktů, zhruba tolik synapsí jako v mozku octomilky.

## C. Label for the oscilloscope — choose exactly one, and only the true one

**C1 — the oscilloscope shows a demonstration signal (default assumption):**

> **Osciloskop: demonstrační signál**
> Zobrazuje ukázkový průběh, který zde slouží k předvedení přístroje. **Není to odezva materiálu WS₂**
> a nesouvisí s tím, co kreslíte na obrazovce.

**C2 — only if the trace really is a measured response of the sample, with the date and conditions:**

> **Osciloskop: měřená odezva vzorku**
> Průběh naměřený na vzorku WS₂ (…datum, podmínky…). Nesouvisí s tím, co kreslíte na obrazovce.

If it is not certain which of the two is on the oscilloscope, use C1.

## D. Label for the electronics

> **Elektronika**
> Generátor pulzů (ESP32) přivádí na elektrody krátké elektrické impulzy. Zesilovač převádí slabý proud
> z materiálu na napětí, které lze zobrazit a změřit.

*Say "ESP32" and "zesilovač" only if they are really part of the exhibited setup.*

## E. On-screen microcopy (as implemented in `js/expo/copy.js`)

| Place | Czech | English |
|---|---|---|
| Title | MŮŽE HMOTA POČÍTAT? | CAN MATTER COMPUTE? |
| Badge, always visible | INTERAKTIVNÍ SIMULACE | INTERACTIVE SIMULATION |
| Idle invitation | Nakreslete číslici a sledujte, co se stane. | Draw a digit and watch what happens. |
| Idle, under the sample | Na obrazovce je simulace. Vedle ní je skutečný materiál. | The screen shows a simulation. Beside it is the real material. |
| Draw prompt | Nakreslete číslici 0–9 | Draw a digit, 0–9 |
| Buttons | Smazat · Vyslat impulzy | Clear · Send pulses |
| Buttons, run | Dál: z bodů na impulzy · Dál: vyslat impulzy do hmoty · Dál: co z odezvy vyčte čtecí vrstva | Next: from points to pulses · Next: send the pulses into the material · Next: what the readout layer reads |
| Vysvětlení při průchodu (3 věty na krok, ve čtyřech krocích), „Co znamená rozhodnout“, finále | viz `js/expo/copy.js`: `narr0`–`narr3`, `decSteps`, `futCards` (jediný zdroj textu) | same file, English |
| Verdict | Čtecí vrstva se domnívá, že jde o číslici: **7** | The readout layer thinks this is the digit: **7** |
| Unsure | Čtecí vrstva si není jistá. Možná číslice: **7** · Zkuste ji nakreslit výrazněji. | The readout layer is unsure. Perhaps the digit: **7** · Try drawing it more clearly. |
| Finale | Budoucnost hmoty · PROVOKACE · VÍME / DOMNĚNKA · Paměť bez paměťového čipu · Oko bez kamery · Umělá inteligence v hrsti písku · Lehký štít a hlídač záření · Hmota, která hlídá odpad · Pancíř, mazivo, palivo · Kdo rozhoduje? · Kde končí hmota a začíná myšlení? · Kde bude tento materiál za dvacet let? | Future of matter · PROVOCATION · WE KNOW / A GUESS · Memory without a memory chip · An eye without a camera · Artificial intelligence in a handful of sand · A light shield and a radiation watchman · Matter that guards waste · Armour, lubricant, fuel · Who decides? · Where does matter end and thinking begin? · Where will this material be in twenty years? |
| Advanced layer | Výsledek · Co udělá světlo · Jak se rozhoduje · Když hmotu osvítíme · Ve tmě natrénujeme čtecí vrstvu… · …jako když si nasadíte brýle s jinými dioptriemi | Result · What light does · How it decides · When we shine light on the material · … like putting on glasses with a different prescription |
| Idle, source note | Podle článku X. Han et al., Very-large-scale mimetic optogenetic synapses for physical reservoir computing, Nature Communications 17, 1514 (2026), doi:10.1038/s41467-025-68229-8. | (same, in English) |
| Reflection, headline | Mozek velký jako zrnko písku | A brain the size of a grain of sand |
| Reflection, body | Rezervoárový počítač (reservoir computer) se neučí jako běžná neuronová síť. Jako krátkodobou paměť využívá fyzikální systém – cokoli, co bohatě a nelineárně reaguje na signály. Trénuje se jen úplně poslední vrstva. Tomuto principu se říká rezervoárové počítání (reservoir computing). | (see `copy.js`) |
| Reflection, status | Na obrazovce je simulace: hmotu zde nahrazuje matematický model. | The screen shows a simulation: a mathematical model stands in for the material. |
| Invitation to the apparatus | Vedle obrazovky si můžete prohlédnout experimentální sestavu s materiálem WS₂ a osciloskopem. | Beside the screen you can see the experimental setup with the WS₂ material and an oscilloscope. |
| Footer, always | Křivky a skóre jsou výstupem simulovaného modelu. Barvy a rozmístění uzlů jsou výtvarné. | Curves and scores are output of a simulated model. Colours and node placement are artistic. |

Source of the experiment, as cited in the note on the idle screen: X. Han et al., *Very-large-scale
mimetic optogenetic synapses for physical reservoir computing*, Nature Communications **17**, 1514
(2026), doi:10.1038/s41467-025-68229-8 (open access, CC BY-NC-ND 4.0). The authors come from the
Beijing Institute of Technology, Weizmann Institute, **Masaryk University (Brno, V. Kundrát)** and
others, so do not describe it as an experiment "of Masaryk University" alone. The credits of the
installation itself (who, where, when) are not in the code: put them in `CREDITS` in `js/expo/copy.js`.
