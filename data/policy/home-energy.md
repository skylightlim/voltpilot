# Home energy: TNB Time-of-Use, rooftop solar schemes, and solar with a battery

Injected into the analyst and chat prompts with malaysia-incentives.md. Checked 14 Nov 2026.
Peninsular Malaysia (TNB) only: Sabah (SESB) and Sarawak (SEB) run their own tariffs and solar
schemes, so tell an East Malaysian buyer to check with their utility.

## TNB Time-of-Use (ToU), domestic

- Since **1 July 2025** a domestic bill is: energy charge + capacity 4.55 sen/kWh + network
  12.85 sen/kWh + RM10 retail charge (only above 600 kWh a month) + AFA fuel adjustment (only
  above 600 kWh; waived up to 800 kWh until Dec 2026) + the Energy Efficiency Incentive rebate
  (up to 1,000 kWh; bigger the less you use) + 1.6% KWTBB (above 300 kWh) + 8% service tax on
  usage above 600 kWh.
- **Standard tariff** (most homes): one energy charge all day, 27.03 sen/kWh up to 1,500 kWh a
  month, 37.03 sen on every kWh above that.
- **ToU tariff** (opt-in): peak **2pm-10pm Monday to Friday**; off-peak **10pm-2pm on weekdays and
  all day Saturday and Sunday**. Energy charge 28.52 sen peak / 24.43 sen off-peak up to 1,500 kWh
  a month (38.52 / 34.43 above). Capacity, network and the rest are the same as standard.
- **Is ToU worth it?** It saves money when **less than about 64%** of the household's kWh fall in
  the weekday 2pm-10pm window (break-even: (27.03 - 24.43) / (28.52 - 24.43) = 0.64). An EV that
  charges after 10pm pulls the share down: each off-peak kWh is 2.6 sen cheaper than standard.
  The saving is real but small, about RM3 a month on 150 kWh of overnight charging, so ToU is a
  habit, not a reason to choose a car.
- **How to switch**: apply in the myTNB app or portal. ToU takes effect once an activated smart
  meter is in place; TNB fits one if needed, which can take up to about two months. Most EVs and
  wallboxes can schedule charging to start at 10pm.
- **What VoltPilot assumes**: home charging is priced on ToU with 90% of charging off-peak, as
  the marginal bill increase on a 400 kWh household (or the bill the buyer typed in).

## Rooftop solar: which scheme (NEM or Solar ATAP)

- **New installation today: Solar ATAP is the only scheme open to homes.** NEM 3.0 (NEM Rakyat
  for homes, NEM GoMEn for government) took its last applications on **30 Jun 2025**. Solar ATAP
  (Energy Commission guideline GP/ST/No.60/2025) started **1 Jan 2026**.
- **Solar ATAP rules (homes)**: use your own solar first; surplus exported to TNB earns a bill
  credit at the **energy charge only** (27.03 sen/kWh, not capacity, network, retail or AFA);
  credit only up to what you import **in the same month**, and anything beyond that is
  **forfeited** (no carry-forward, no cash). Credits run **10 years** from commencement, then the
  system is self-consumption only. Up to **5 kW single-phase / 15 kW three-phase** without a TNB
  connection check (bigger needs one, RM1,000). A battery (BESS) may be added to an ATAP system.
- **Already on NEM Rakyat? Stay on it.** Existing NEM contracts keep 1:1 kWh offsetting for 10
  years from commencement, with surplus credit rolling over for up to 12 months within the
  calendar-year settlement period (ST revision, 19 Aug 2026). In July 2025 the government said
  NEM Rakyat users keep the offset on energy, capacity and network charges. A NEM user can
  convert to ATAP only by ending the NEM contract, and the ATAP contract then runs only for the
  NEM contract's remaining years, so converting is almost never worth it.
- **SuRIA Home rebate**: RM600 per kWac, up to **RM3,000**, for homes commissioned under Solar ATAP
  with TNB by **31 Dec 2026**, first come first served, until its 250 MW quota is used.
- **Prices (installer quotes, 2026)**: about RM3,500-4,000 per kW installed, so roughly
  RM17,500-20,000 for 5 kW. A rooftop kW yields roughly 1,300-1,450 kWh a year in the Peninsula.

## Solar alone, or solar with a battery

- Under ATAP an exported kWh is worth the 27.03 sen energy charge, while a kWh you avoid importing
  is worth about 44.4 sen plus taxes (energy + capacity + network). So the panels pay most on
  power used **in the house as it is generated**, and a battery's only bill saving is moving
  surplus from daytime export into evening use: about **17 sen per kWh stored**, plus any surplus
  that would otherwise be forfeited.
- A 10 kWh battery cycling fully every day therefore saves at most about RM50 a month, and
  less once the panels have already pushed the bill toward zero. Installed batteries cost about
  **RM24,000-36,000** (7-16 kWh, 2026), so the bill alone pays one back in decades, past its
  roughly 10-year warranty.
- **When a battery makes sense**: frequent outages (backup for fridge, lights, Wi-Fi, medical
  equipment), a household that uses most of its power at night and exports a lot by day, or a bill
  still high after solar. Otherwise, solar alone.
- **Solar and an EV**: the car is the biggest battery the house has. Charging it in daylight
  (weekends, working from home) stores solar at the full import rate's value, which an export
  never earns. Charging after 10pm on ToU is the next cheapest. Solar does not make overnight
  charging free: at night the car draws from TNB like any other load.
- The platform's solar banner (`solar_reference` in the chat context, `solar_banner` in the
  analyst payload) carries the computed figures for its reference household: 400 kWh a month plus
  an EV at 150 kWh, standard tariff, 5 kW of panels, a 10 kWh battery. Quote those numbers rather
  than inventing your own, and say they are for a typical home, not this buyer's roof.
