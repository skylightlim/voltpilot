# Static policy context injected into the Gemini 3.6 Flash analyst prompt (D13). No vector store; plain markdown loaded per prompt.

## Malaysia EV incentives (snapshot)

- **Import duty & excise**: Fully exempt for fully-electric vehicles (CBU and CKD). SST exemption is 50% for CKD kits and full for CBU EVs. Window runs until **31 Dec 2026**.
- **Road tax**: EVs pay a flat **RM2/year** special rate; from **2026** the road tax phases back in at **10% of the ICE-equivalent rate** (RM ed announced phase-in). **Hybrids pay the standard ICE road-tax formula at all times.**
- **Charging relief**: Income-tax relief up to **RM2,500** for home EV-charging equipment (tax years 2025-2026).
- **Solar**: NEM Rakyat (net energy metering) lets residential solar exports offset consumption at avoided tariff.
- **JPJ**: Green number plates for EVs.

## Home charging

- **Residential special EV tariff**: **RM 0.258/kWh** (TNB special block for EV charging).
- **Public DC fast-charging**: average **RM 1.20/kWh** (ChargeEV / GT / JomCharge blended).
- Home charging is the cheapest lifeline — the energy engine assumes an 80/20 home/station split when the user can charge at home.

## Fuel

- **RON95**: RM 2.05/L (subsidized).
- RON97: RM 3.35/L. Diesel: RM 2.15/L.

## CO2

- **Grid**: ~0.63 kg CO2/kWh (Peninsular Malaysia generation mix).
- **Petrol**: 2.31 kg CO2/L.
- EVs shift tailpipe emissions to the grid; hybrids roughly halve petrol burn.

## Roadmap reasoning (for the analyst)

- Use **relative years** ("Year 1", "Year 3", "Year 5") — never hardcode calendar years.
- Year 1: purchase (price, OTR, loan). Year 3: charger install, energy smart-tariff set-up, insurance renewal. Year 5: service milestone, resale/upgrade decision.
- Report cumulative CO2 and RM savings against a petrol baseline (approx 6.5 L/100km).
- Solar banner only if the user ticked "consider solar" AND can charge at home.
- Battery degradation must stay a **warning only**, never part of the core score (D7).