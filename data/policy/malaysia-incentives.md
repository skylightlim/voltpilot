# Static policy context injected into the Gemini 3.6 Flash analyst prompt (D13). No vector store; plain markdown loaded per prompt.

Snapshot checked 12 Nov 2026 (fuel quota, solar and ToU rechecked 14 Nov 2026). Figures that move
weekly or monthly carry their date. ToU, rooftop solar schemes and home batteries are in
home-energy.md.

## Malaysia EV incentives

- **Import duty & excise, imported (CBU) EVs**: the exemption **ended 31 Dec 2025**. CBU EVs sold
  from 2026 carry import and excise duty, so do not tell a buyer an imported EV is tax-free.
- **Locally assembled (CKD) EVs**: exempt from excise duty and sales tax until **31 Dec 2027**.
- **Budget 2027** (tabled 9 Oct 2026) added no new purchase incentive for private EV buyers; its
  EV measure is a tax allowance for companies that run charging stations (to 2030).
- **Road tax**: since **1 Jan 2026** EVs pay JPJ's power-based (kW) schedule, e.g. about RM160 a
  year at 150 kW and RM280 at 210 kW; the old RM2 flat rate is gone. **Hybrids and plug-in
  hybrids pay the standard engine-cc formula.**
- **Charging relief**: individual income-tax relief up to **RM2,500** for EV charging equipment.
- **Solar**: new home installations go on **Solar ATAP** (since 1 Jan 2026); NEM closed to new
  applicants on 30 Jun 2025. SuRIA Home rebate up to RM3,000 until 31 Dec 2026. See home-energy.md.
- **JPJ**: green number plates for EVs.

## Home charging

- There is **no special EV tariff**: the old RM0.25/kWh residential EV block no longer exists.
  Home charging is billed under the TNB domestic tariff (since July 2025): generation 27.03 sen/kWh
  (37.03 sen above 1,500 kWh a month), capacity 4.55 sen, network 12.85 sen; Time-of-Use energy
  28.52 sen peak / 24.43 sen off-peak (opt-in; peak is 2pm-10pm on weekdays). Charging after
  10pm is the cheapest option. Details in home-energy.md.
- **AFA fuel surcharge**: +3.60 sen/kWh for November 2026; waived for households using 800 kWh a
  month or less until Dec 2026 (600 kWh or less from Jan 2027).
- **Public charging**: about **RM1.10/kWh AC** and **RM1.40/kWh DC** (JomCharge, Aug 2026); prices
  differ by network.
- Home charging is the cheapest lifeline — the energy engine assumes an 80/20 home/station split
  when the user can charge at home.

## Fuel (week of 12 Nov 2026, data.gov.my; changes weekly)

- **RON95**: RM1.99/L for eligible Malaysians (BUDI95); RM3.87/L unsubsidised.
- **BUDI95 monthly quota: 300 litres** per eligible Malaysian with a valid driving licence,
  restored on **1 Sep 2026** (it was cut to 200 L from 1 Apr to 31 Aug 2026 when fuel prices
  surged). Every litre past the quota in a month is paid at the unsubsidised price. Registered
  e-hailing drivers get a larger quota (800 L during the 200 L period). Non-citizens pay the
  unsubsidised price for every litre. The quota belongs to the person, not the car, so a second
  car in the household drawing on it leaves less for this one.
- **What VoltPilot assumes**: the buyer is eligible and the car uses the whole quota. Hybrid and
  PHEV petrol is priced at RM1.99 up to 300 L a month (3,600 L a year) and at the unsubsidised
  price beyond it. At 5 L/100 km the quota covers 72,000 km a year, so it binds only for high
  mileage or thirsty cars (a 9 L/100 km hybrid passes it at 40,000 km a year).
- **RON97**: RM4.20/L. **Diesel**: RM2.10/L subsidised (BUDI, Peninsular); RM4.87/L market.

## CO2

- **Grid**: 0.74 kg CO2/kWh Peninsular, 0.539 Sabah, 0.199 Sarawak (Energy Commission, 2024 data).
- **Petrol**: 2.31 kg CO2/L.
- EVs shift tailpipe emissions to the grid; hybrids roughly halve petrol burn.

## Roadmap reasoning (for the analyst)

- Use **relative years** ("Year 1", "Year 3", "Year 5") — never hardcode calendar years.
- Year 1: purchase (price, OTR, loan). Year 3: charger install, energy smart-tariff set-up, insurance renewal. Year 5: service milestone, resale/upgrade decision.
- Report cumulative CO2 and RM savings against a petrol baseline (approx 6.5 L/100km).
- Solar banner only if the user ticked "consider solar" AND can charge at home.
- Battery degradation must stay a **warning only**, never part of the core score (D7).
