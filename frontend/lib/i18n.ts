import { useEffect, useState } from "react";

export type Lang = "en" | "bm";

const EVENT = "atp:lang";
const PROFILE_KEY = "atp.profile";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    return (JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null")?.language as Lang) || "en";
  } catch {
    return "en";
  }
}

export function setLang(l: Lang) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null") || {};
    p.language = l;
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useLang(): Lang {
  const [lang, set] = useState<Lang>("en");
  useEffect(() => {
    const on = () => set(getLang());
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return lang;
}

type Entry = readonly [string, string];

const S = {
  "nav.cta": ["Get your ranking", "Dapatkan kedudukan anda"],
  "nav.ctaShort": ["Start", "Mula"],
  "nav.voice": ["Voice Advisor", "Penasihat Suara"],
  "nav.method": ["Methodology", "Kaedah"],
  "nav.cars": ["Catalog", "Katalog"],

  "hero.t1": ["EV or Hybrid?", "EV atau Hibrid?"],
  "hero.t2": ["Make the decision with numbers.", "Biar angka yang menentukan."],
  "hero.sub": [
    "Tell us how you drive. Our 5 decision engines rank 184 Malaysian models for your budget, routes, and electricity tariffs.",
    "Beritahu gaya pemanduan anda. 5 enjin keputusan kami menyusun 184 model kereta Malaysia mengikut bajet, laluan dan tarif elektrik anda.",
  ],
  "hero.cta": ["Start 2-min diagnostic", "Mula diagnostik 2 minit"],
  "hero.voiceCta": ["Talk to AI Voice Advisor", "Bercakap dengan Penasihat AI"],
  "hero.trust": ["100% Free · No registration · 184 Malaysian models tested", "100% Percuma · Tanpa pendaftaran · 184 model Malaysia diuji"],

  "calc.title": ["Live Commute Savings Calculator", "Kalkulator Penjimatan Ulang-Alik Langsung"],
  "calc.sub": ["Adjust your typical daily commute to preview fuel vs electricity economics", "Ubah jarak ulang-alik harian anda untuk pratonton kos petrol vs elektrik"],
  "calc.daily": ["Daily Commute", "Ulang-Alik Harian"],
  "calc.petrol": ["Petrol (RON95)", "Petrol (RON95)"],
  "calc.ev": ["TNB EV Off-Peak", "TNB EV Luar Puncak"],
  "calc.annualSave": ["Estimated Annual Savings", "Anggaran Penjimatan Tahunan"],
  "calc.tenYearSave": ["10-Year Fuel Savings", "Penjimatan 10 Tahun"],
  "ts.rm.sub": ["Complete OTR prices, JPJ road tax & TNB tariffs", "Harga OTR lengkap, cukai jalan JPJ & tarif TNB"],
  // scroll marquee band (DESIGN.md §3) — factual claims only, no brand noise
  "mq.a": ["184 Malaysian trims", "184 varian Malaysia"],
  "mq.b": ["5 decision engines", "5 enjin keputusan"],
  "mq.c": ["TOPSIS ranked", "Disusun secara TOPSIS"],
  "mq.d": ["Free, no sign-up", "Percuma, tanpa daftar"],
  "lr.showAll": ["Show all {n} models", "Papar semua {n} model"],
  "lr.showLess": ["Show fewer", "Papar kurang"],
  "ts.count.sub": ["Malaysian EV and Hybrid models evaluated", "Model EV dan Hibrid Malaysia dinilai"],
  "ts.yr.sub": ["Lifecycle TCO roadmap and battery health projection", "Peta jalan TCO dan unjuran kesihatan bateri"],

  "hw.label": ["Decision Architecture", "Seni Bina Keputusan"],
  "hw.title": ["Built for Malaysian roads, subsidies, and tariffs.", "Dibina untuk jalan raya, subsidi, dan tarif Malaysia."],
  "hw.s1t": ["Driving Intake Diagnostic", "Diagnostik Pemanduan"],
  "hw.s1b": [
    "Seven questions: daily distance, charging access, destination corridors, and budget constraints.",
    "Tujuh soalan: jarak harian, akses pengecasan, koridor destinasi, dan kekangan bajet.",
  ],
  "hw.s2t": ["5 Live Evaluation Engines", "5 Enjin Penilaian Langsung"],
  "hw.s2b": [
    "TCO, Range Homologation, PLUS Charging Grid, JPJ Road Tax, and Used Market Depreciation.",
    "TCO, Homologasi Jarak, Grid Pengecasan PLUS, Cukai Jalan JPJ, dan Susut Nilai Pasaran.",
  ],
  "hw.s3t": ["Personalized TOPSIS Verdict", "Keputusan TOPSIS Diperibadikan"],
  "hw.s3b": [
    "Ranked leaderboard, 10-year cashflow roadmap, battery degradation simulator, and Gemini AI briefing.",
    "Papan kedudukan, peta jalan aliran tunai 10 tahun, simulator bateri, dan taklimat AI Gemini.",
  ],

  "eng.e1t": ["10-Year TCO Engine", "Enjin TCO 10 Tahun"],
  "eng.e1d": ["OTR price, 10-year depreciation, TNB Time-of-Use tariffs vs RON95 subsidy, service schedules, and comprehensive insurance.", "Harga OTR, susut nilai 10 tahun, tarif TNB vs subsidi RON95, servis berjadual, dan insurans komprehensif."],
  "eng.e2t": ["Range & Behavior Engine", "Enjin Jarak & Tingkah Laku"],
  "eng.e2d": ["Real-world WLTP derating for tropical heat, highway speeds, monsoon rain, and daily commute buffer requirements.", "Penurunan WLTP untuk cuaca panas tropika, kelajuan lebuh raya, hujan lebat, dan penimbal harian."],
  "eng.e3t": ["JPJ Road Tax Engine", "Enjin Cukai Jalan JPJ"],
  "eng.e3d": ["Official Lampiran B post-2025 kW motor output road tax schedule vs engine displacement ICE calculations.", "Jadual rasmi Lampiran B cukai jalan berasaskan output motor kW vs cc enjin konvensional."],
  "eng.e4t": ["Charging Infrastructure Grid", "Grid Infrastruktur Pengecasan"],
  "eng.e4d": ["PLUS Expressway DC fast charging density (Gentari, ChargEV, JomCharge) and landed wallbox feasibility scoring.", "Ketumpatan pengecas pantas DC Lebuhraya PLUS (Gentari, ChargEV, JomCharge) dan kebolehlaksanaan wallbox."],
  "eng.e5t": ["Battery & Resale Depreciation", "Degradasi Bateri & Nilai Jualan"],
  "eng.e5d": ["10-year electrochemical capacity loss projections and used market auction recovery values.", "Unjuran kehilangan kapasiti elektrokimia 10 tahun dan nilai pulangan pasaran terpakai."],

  "lr.label": ["Market Benchmark", "Penanda Aras Pasaran"],
  "lr.title": ["Current Malaysian Leaderboard Preview", "Pratonton Papan Teratas Malaysia"],
  "lr.sub": [
    "Scores dynamically shift based on your commute, home charging, and long-distance habits.",
    "Skor berubah secara dinamik mengikut jarak pemanduan, pengecasan rumah, dan tabiat perjalanan jauh anda.",
  ],
  "lr.all": ["All Powertrains", "Semua Kuasa"],
  "lr.ev": ["Full EV (BEV)", "EV Penuh (BEV)"],
  "lr.hybrid": ["Hybrid (HEV)", "Hibrid (HEV)"],
  "lr.under100k": ["Under RM 100k", "Bawah RM 100k"],
  "lr.cta": ["Calculate for my profile", "Kira untuk profil saya"],

  /* ---- strings that were hardcoded in JSX until the 2026-09-06 i18n audit ---- */
  "lr.otr": ["OTR Price", "Harga OTR"],
  "lr.rangeW": ["Range (WLTP)", "Jarak (WLTP)"],
  "lr.runYr": ["Running / yr", "Kos tahunan"],
  "lr.homeCh": ["Home Charge", "Cas di rumah"],
  "lr.fit": ["Fit Rating", "Skor Padanan"],
  "lr.needMath": ["Need exact math for your personal commute?", "Perlukan pengiraan tepat untuk perjalanan anda?"],
  "eng.f3": ["JPJ Lampiran B Formula", "Formula JPJ Lampiran B"],
  "eng.f4": ["PLUS Expressway Corridors", "Koridor Lebuhraya PLUS"],
  "eng.f5": ["Used Market Telemetry", "Telemetri Pasaran Terpakai"],
  "calc.cta184": ["Calculate with 184 exact models", "Kira dengan 184 model tepat"],
  "calc.aria": ["Daily commute distance", "Jarak perjalanan harian"],
  "ui.closeDialog": ["Close dialog", "Tutup dialog"],

  /* ---- /methodology — sourced from VOLT_PILOT_TECHNICAL_SPECIFICATION.
     Equations, variable names and citations stay untranslated: they are
     universal notation, and nobody localises a DOI or CLCC_RM_per_km. ---- */
  "me.c4": ["Emissions", "Pelepasan"],
  "me.c4d": ["Well-to-wheel CO₂, using your grid region's carbon intensity", "CO₂ well-to-wheel, mengikut keamatan karbon wilayah grid anda"],
  "me.c5": ["Purchase price", "Harga belian"],
  "me.c5d": ["What you pay on the road, before running costs", "Apa yang anda bayar atas jalan, sebelum kos operasi"],
  "me.c6": ["Running cost", "Kos operasi"],
  "me.c6d": ["Yearly electricity or fuel for how you actually drive", "Elektrik atau bahan api tahunan mengikut cara anda memandu"],
  "me.weight": ["base weight", "wajaran asas"],
  "me.eyebrow": ["Decision methodology", "Kaedah keputusan"],
  "me.t1": ["No black box.", "Tiada kotak hitam."],
  "me.t2": ["Here is the whole method.", "Inilah keseluruhan kaedahnya."],
  "me.sub": ["Every recommendation runs this pipeline, in this order, over 184 Malaysian trims. The maths is published so you — or anyone who knows the field — can check it.", "Setiap cadangan melalui saluran ini, mengikut susunan ini, ke atas 184 varian Malaysia. Matematiknya diterbitkan supaya anda — atau sesiapa yang arif dalam bidang ini — boleh menyemaknya."],

  "me.critH": ["Six criteria decide the ranking", "Enam kriteria menentukan kedudukan"],
  "me.critSub": ["Your four sliders set the weights; the engine spreads them across these six measures. Weights always sum to 1.", "Empat gelangsar anda menetapkan wajaran; enjin menyebarkannya merentasi enam ukuran ini. Wajaran sentiasa berjumlah 1."],
  "me.c1": ["Lifetime cost", "Kos hayat"],
  "me.c1d": ["Ten-year ownership cost — financing, insurance, servicing, road tax", "Kos pemilikan sepuluh tahun — pembiayaan, insurans, servis, cukai jalan"],
  "me.c2": ["Range fit", "Kesesuaian jarak"],
  "me.c2d": ["How the car's range matches your commute and long trips", "Sejauh mana jarak kereta sepadan dengan perjalanan harian dan jauh anda"],
  "me.c3": ["Charging access", "Akses pengecasan"],
  "me.c3d": ["Chargers near your postcode and along your usual routes", "Pengecas berhampiran poskod anda dan di sepanjang laluan biasa"],
  "me.cost": ["Lower is better", "Lebih rendah lebih baik"],
  "me.benefit": ["Higher is better", "Lebih tinggi lebih baik"],

  "me.stepsH": ["How a recommendation is built", "Cara cadangan dibina"],
  "me.s1": ["Your inputs", "Input anda"],
  "me.s1d": ["Distance, driving days, charging access, budget, postcode, grid region and electricity bill. Nothing else is asked, and nothing is inferred.", "Jarak, hari memandu, akses pengecasan, bajet, poskod, wilayah grid dan bil elektrik. Tiada soalan lain, dan tiada andaian."],
  "me.s2": ["Budget screen", "Tapisan bajet"],
  "me.s2d": ["Anything above your maximum is removed before scoring, so an unaffordable car is never ranked first.", "Apa-apa melebihi had anda dibuang sebelum pemarkahan, supaya kereta di luar kemampuan tidak pernah menduduki tempat pertama."],
  "me.s3": ["Charging feasibility gate", "Get kebolehlaksanaan pengecasan"],
  "me.s3d": ["Battery-electric cars are removed when you have neither home nor workplace charging and fewer than five public points within 20 km. Plug-in hybrids stay — they still run on petrol.", "Kereta elektrik bateri dibuang apabila anda tiada pengecasan di rumah mahupun tempat kerja serta kurang lima titik awam dalam 20 km. Hibrid plug-in kekal — ia masih boleh guna petrol."],
  "me.s4": ["Cost engine", "Enjin kos"],
  "me.s4d": ["Ten years of financing interest, insurance, servicing, road tax and the opportunity cost of your deposit. Purchase price and running cost are scored separately so nothing is counted twice.", "Sepuluh tahun faedah pembiayaan, insurans, servis, cukai jalan dan kos peluang deposit anda. Harga belian dan kos operasi dimarkah berasingan supaya tiada pengiraan berganda."],
  "me.s5": ["Energy engine", "Enjin tenaga"],
  "me.s5d": ["Yearly electricity or fuel for your actual mileage, priced on TNB tariffs and pump prices, plus well-to-wheel CO₂ at your grid region's carbon intensity.", "Elektrik atau bahan api tahunan untuk perbatuan sebenar anda, dinilai pada tarif TNB dan harga pam, serta CO₂ well-to-wheel pada keamatan karbon wilayah grid anda."],
  "me.s6": ["Range engine", "Enjin jarak"],
  "me.s6d": ["Real-world range after tropical heat and highway speeds, checked against your daily distance and the long trips you actually make.", "Jarak sebenar selepas cuaca panas tropika dan kelajuan lebuh raya, disemak dengan jarak harian dan perjalanan jauh yang benar-benar anda lakukan."],
  "me.s7": ["Infrastructure engine", "Enjin infrastruktur"],
  "me.s7d": ["Operational public chargers around your postcode and the density and worst gap along your usual long-distance corridor.", "Pengecas awam beroperasi di sekitar poskod anda serta ketumpatan dan jurang terbesar di sepanjang koridor jauh biasa anda."],
  "me.s8": ["TOPSIS ranking", "Kedudukan TOPSIS"],
  "me.s8d": ["Every surviving car is ranked by how close it sits to the best possible combination of all six criteria, and how far from the worst.", "Setiap kereta yang tinggal disusun mengikut kehampirannya dengan gabungan terbaik keenam-enam kriteria, dan jaraknya daripada yang terburuk."],

  "me.gridH": ["Grid emission factors", "Faktor pelepasan grid"],
  "me.gridSub": [
    "Electricity is not equally clean across Malaysia. Published factors, kg CO₂e per kWh.",
    "Elektrik tidak sama bersihnya di seluruh Malaysia. Faktor yang diterbitkan, kg CO₂e per kWh.",
  ],
  "me.topsisH": ["How the final score is computed", "Cara skor akhir dikira"],
  "me.topsisSub": [
    "Vector normalisation, then your weights, then distance to the best and worst possible outcome.",
    "Penormalan vektor, kemudian wajaran anda, kemudian jarak ke hasil terbaik dan terburuk.",
  ],
  "me.n1": ["Your four sliders spread across six weights that sum to 1.", "Empat gelangsar anda merentasi enam wajaran yang berjumlah 1."],
  "me.n2": ["Higher closeness ranks higher.", "Kehampiran lebih tinggi, kedudukan lebih tinggi."],
  "me.srcH": ["Sources", "Sumber"],
  "me.srcSub": [
    "The framework is built on published work, not house opinion.",
    "Rangka kerja ini dibina atas kajian terbitan, bukan pendapat sendiri.",
  ],
  "me.ctaH": ["See it run on your own numbers", "Lihat ia berjalan dengan nombor anda"],
  "me.ctaB": [
    "The same eight steps, applied to how you actually drive.",
    "Lapan langkah yang sama, digunakan pada cara anda memandu sebenarnya.",
  ],

  // --- Supporting Initiatives (Malaysian clean-energy & EV programmes) ------
  // --- Live infrastructure look-up (results page) --------------------------
  "ia.label": ["Live look-up", "Carian Langsung"],
  "ia.title": ["Your Infrastructure Access", "Akses Infrastruktur Anda"],
  "ia.loadingArea": [
    "Looking up public charging stations near your postcode\u2026",
    "Mencari stesen pengecasan awam berhampiran poskod anda\u2026",
  ],
  "ia.loadingRoute": [
    "Measuring the charging density of your travel route\u2026",
    "Mengukur ketumpatan pengecasan laluan perjalanan anda\u2026",
  ],
  "ia.statArea": ["Stations in your area", "Stesen di kawasan anda"],
  "ia.statRoute": ["Stations per 100 km on your route", "Stesen per 100 km di laluan anda"],
  "ia.badgeArea": ["Area access", "Akses kawasan"],
  "ia.badgeRoute": ["Route density", "Ketumpatan laluan"],
  "ia.st.good": ["Good", "Baik"],
  "ia.st.moderate": ["Moderate", "Sederhana"],
  "ia.st.limited": ["Limited", "Terhad"],
  "ia.st.poor": ["Poor", "Lemah"],
  "ia.st.very_poor": ["Very poor", "Sangat lemah"],
  "ia.err": [
    "We couldn\u2019t reach the charging-station network \u2014 your ranking still accounts for access conservatively.",
    "Kami tidak dapat menghubungi rangkaian stesen \u2014 kedudukan anda tetap mengambil kira akses secara berhati-hati.",
  ],
  "ia.localRoute": [
    "Your long trips stay inside your own area, so route coverage is the same local network shown here.",
    "Perjalanan jauh anda kekal dalam kawasan sendiri, jadi liputan laluan adalah rangkaian tempatan yang sama.",
  ],
  "si.label": ["Supporting Initiatives", "Inisiatif Sokongan"],
  "si.title": ["Malaysia\u2019s clean-energy & EV plans", "Pelan tenaga bersih & EV Malaysia"],
  "si.sub": [
    "Government programmes that make your transition easier, cheaper and better supported.",
    "Program kerajaan yang menjadikan peralihan anda lebih mudah, murah dan disokong.",
  ],
  "si.netr.t": ["National Energy Transition Roadmap (NETR)", "Pelan Hala Tuju Peralihan Tenaga Negara (NETR)"],
  "si.netr.d": [
    "Malaysia\u2019s plan to shift to low-carbon energy \u2014 the backbone for grid decarbonisation and EV growth.",
    "Pelan Malaysia beralih ke tenaga rendah karbon \u2014 tulang belakang penyahkarbonan grid dan pertumbuhan EV.",
  ],
  "si.netr.cta": ["Explore NETR", "Terokai NETR"],
  "si.nem.t": ["Net Energy Metering (NEM) 3.0", "Pemeteran Tenaga Bersih (NEM) 3.0"],
  "si.nem.d": [
    "Export your rooftop solar surplus to the grid and earn credits \u2014 the basis for the solar payback shown in your report.",
    "Eksport lebihan solar bumbung anda ke grid dan dapatkan kredit \u2014 asas kepada bayaran balik solar dalam laporan anda.",
  ],
  "si.nem.cta": ["Learn about NEM", "Ketahui tentang NEM"],
  "si.tnb.t": ["TNB Electron Malaysia", "TNB Electron Malaysia"],
  "si.tnb.d": [
    "Malaysia\u2019s nationwide public EV charging network, operated by the national utility Tenaga Nasional Berhad.",
    "Rangkaian pengecasan EV awam seluruh negara, dikendalikan oleh utiliti nasional Tenaga Nasional Berhad.",
  ],
  "si.tnb.cta": ["Visit TNB Electron", "Lawati TNB Electron"],
  "si.sdg11.t": ["Sustainable Development Goal 11", "Matlamat Pembangunan Lestari 11"],
  "si.sdg11.d": ["Sustainable Cities & Communities", "Bandar & Komuniti Mampan"],
  "si.sdg7.t": ["Sustainable Development Goal 7", "Matlamat Pembangunan Lestari 7"],
  "si.sdg7.d": ["Affordable & Clean Energy", "Tenaga Mampu Milik & Bersih"],
  "si.source": [
    "Vehicle economy & retail data courtesy of",
    "Data ekonomi & runcit kenderaan ihsan",
  ],
  "pt.label": ["Ready for Transition", "Bersedia untuk Peralihan"],
  "pt.title": ["Check out our partners", "Lihat rakan kongsi kami"],
  "pt.sub": [
    "Partners you can transition with \u2014 click any logo to visit the company website.",
    "Rakan kongsi untuk peralihan anda \u2014 klik mana-mana logo untuk melawat laman web syarikat.",
  ],
  "faq.label": ["Frequently Asked Questions", "Soalan Lazim"],
  "faq.title": ["Clear answers for Malaysian drivers.", "Jawapan jelas untuk pemandu Malaysia."],
  "faq.q1": ["Can I own an EV if I live in a condo or apartment?", "Bolehkah saya memiliki EV jika tinggal di kondominium atau apartmen?"],
  "faq.a1": [
    "Yes, but your economics change. Without home wallbox charging (RM0.25-RM0.57/kWh on TNB), you will rely on commercial AC/DC public chargers (RM1.00-RM1.60/kWh). Our engine models this exact difference.",
    "Boleh, tetapi kiraan kos anda berbeza. Tanpa wallbox rumah (RM0.25-RM0.57/kWh di TNB), anda bergantung pada pengecas awam (RM1.00-RM1.60/kWh). Enjin kami mengambil kira perbezaan ini.",
  ],
  "faq.q2": ["How does the post-2025 JPJ EV road tax work?", "Bagaimana cukai jalan EV JPJ selepas 2025 dikira?"],
  "faq.a2": [
    "Under JPJ Lampiran B, EV road tax is calculated on electric motor output (kW) in tiers. Compact EVs like the BYD Dolphin pay around RM70/year, while high-performance dual-motor EVs pay significantly higher.",
    "Mengikut JPJ Lampiran B, cukai jalan EV dikira berdasarkan output motor (kW). EV kompak seperti BYD Dolphin membayar sekitar RM70/tahun, manakala EV dwi-motor berprestasi tinggi membayar kadar lebih tinggi.",
  ],
  "faq.q3": ["Can an EV handle road trips to Penang, Johor Bahru, or Kuantan?", "Bolehkah EV memandu jauh ke Pulau Pinang, Johor Bahru, atau Kuantan?"],
  "faq.a3": [
    "The North-South Expressway (PLUS) has dense DC fast charging corridors every 60-100 km (Gentari, ChargEV, Shell Recharge). The East Coast (LPT) requires careful planning, which our Destination Engine calculates.",
    "Lebuhraya Utara-Selatan (PLUS) mempunyai rangkaian DC padat setiap 60-100 km (Gentari, ChargEV, Shell Recharge). Pantai Timur (LPT) memerlukan perancangan teliti, yang dinilai oleh Enjin Destinasi kami.",
  ],
  "faq.q4": ["How much will my battery degrade after 8 to 10 years?", "Berapa banyak bateri akan merosot selepas 8 hingga 10 tahun?"],
  "faq.a4": [
    "Modern LFP and NMC batteries typically retain 75-85% capacity after 10 years and 200,000 km. Most brands offer 8-year / 160,000 km battery warranties guaranteeing at least 70% state of health.",
    "Bateri LFP dan NMC moden biasanya mengekalkan 75-85% kapasiti selepas 10 tahun dan 200,000 km. Kebanyakan jenama menawarkan jaminan bateri 8 tahun / 160,000 km dengan jaminan minimum 70% kesihatan.",
  ],
  "ft.body1": [
    "Data-driven EV and Hybrid decision architecture for Malaysian drivers, incorporating live prices, national tariffs, and actual commuting telemetry.",
    "Seni bina keputusan EV dan Hibrid berasaskan data untuk pemandu Malaysia, menggabungkan harga semasa, tarif nasional, dan telemetri pemanduan sebenar.",
  ],
  "ft.product": ["Navigation", "Navigasi"],
  "ft.how": ["Methodology", "Kaedah"],
  "ft.cars": ["Vehicle Catalog", "Katalog Kenderaan"],
  "ft.company": ["Regulatory Context", "Konteks Kawal Selia"],
  "ft.body2": [
    "Evaluated using official JPJ Lampiran B schedules, Suruhanjaya Tenaga tariffs, and Malaysian automotive market databases.",
    "Dinilai menggunakan jadual rasmi JPJ Lampiran B, tarif Suruhanjaya Tenaga, dan pangkalan data automotif Malaysia.",
  ],
  "ft.rights": ["© 2026 VoltPilot Malaysia. All rights reserved.", "© 2026 VoltPilot Malaysia. Hak cipta terpelihara."],
  "ft.disc": [
    "Prices, savings, and ratings are calculated for informational decision support. Always confirm final quotations with authorized dealers.",
    "Harga, penjimatan, dan penilaian dikira untuk sokongan keputusan bermaklumat. Sila sahkan sebut harga rasmi dengan pengedar sah.",
  ],

  // --- Interactive calculator (single-page interview form) -----------------
  "cf.label": ["Interactive Calculator", "Kalkulator Interaktif"],
  "cf.t1": ["Tell us about", "Beritahu kami tentang"],
  "cf.t2": ["your driving.", "pemanduan anda."],
  "cf.sub": [
    "Fill in your pattern & budget. The engine does the rest.",
    "Isikan corak & bajet anda. Enjin akan uruskan yang selebihnya.",
  ],
  "cf.s1": ["Driving pattern", "Corak pemanduan"],
  "cf.daily": ["Daily distance (km)", "Jarak harian (km)"],
  "cf.days": ["Days you drive per week", "Hari memandu seminggu"],
  "cf.s2": ["Budget & context", "Bajet & konteks"],
  "cf.budget": ["Max budget (RM)", "Bajet maksimum (RM)"],
  "cf.bill": ["Monthly electricity bill (RM)", "Bil elektrik bulanan (RM)"],
  "cf.region": ["Grid region", "Kawasan grid"],
  "cf.region.peninsular": ["Peninsular", "Semenanjung"],
  "cf.region.east_malaysia": ["East Malaysia", "Malaysia Timur"],
  "cf.work": ["Workplace charging", "Pengecasan di tempat kerja"],
  "cf.home": ["Home charging", "Pengecasan di rumah"],
  "cf.solar": ["Solar feasible", "Solar boleh dipasang"],
  "cf.s3": ["Charging infrastructure & long trips", "Infrastruktur pengecasan & perjalanan jauh"],
  "cf.postcode": ["Your postcode", "Poskod anda"],
  "cf.dest": ["Long-trip destination", "Destinasi perjalanan jauh"],
  "cf.freq": ["How often are long trips?", "Berapa kerap perjalanan jauh?"],
  "cf.notSure": ["Not sure yet", "Belum pasti"],
  "cf.yes": ["Yes", "Ya"],
  "cf.no": ["No", "Tidak"],
  "cf.cta": ["Set priorities & run analysis", "Tetapkan keutamaan & jalankan"],
  "cf.ctaHint": [
    "Next you will weight what matters most — money, environment, convenience, future-proofing.",
    "Seterusnya anda akan menimbang apa yang penting — wang, alam sekitar, kemudahan, kalis masa depan.",
  ],
  "cf.errPostcode": ["Enter a 5-digit postcode.", "Masukkan poskod 5 digit."],
  "cf.errDaily": ["Enter your typical daily distance.", "Masukkan jarak harian biasa anda."],
  "cf.errDays": ["Select how many days a week you drive.", "Pilih berapa hari seminggu anda memandu."],

  "iq.q": ["Question {n} of {total}", "Soalan {n} daripada {total}"],
  "iq.next": ["Next Step", "Langkah Seterusnya"],
  "iq.last": ["Review & Set Preferences", "Semak & Tetapkan Keutamaan"],
  "iq.err": ["Please select or enter an answer to proceed.", "Sila pilih atau masukkan jawapan untuk meneruskan."],
  "iq.back": ["Back", "Kembali"],
  "iq.orNum": ["Or enter exact distance in km", "Atau masukkan jarak tepat dalam km"],
  "iq.orRM": ["Or enter budget amount in RM", "Atau masukkan jumlah bajet dalam RM"],
  "iq.postcodeHint": ["Postcode identifies regional tariffs and charging network density.", "Poskod menentukan tarif kawasan dan ketumpatan stesen pengecasan."],
  "iq.selectDays": ["Select driving days per week", "Pilih bilangan hari memandu seminggu"],
  "ui.step": ["Step {n} of {t}", "Langkah {n} daripada {t}"],

  "sl.step": ["Step 2 · Weighting Studio", "Langkah 2 · Studio Pemberat"],
  "sl.label": ["Multi-Criteria Priorities", "Keutamaan Pelbagai Kriteria"],
  "sl.t1": ["Fine-tune your priorities.", "Laraskan keutamaan anda."],
  "sl.t2": ["Watch the matrix adapt.", "Lihat matriks menyesuaikan diri."],
  "sl.sub": [
    "These 4 sliders set the mathematical weights for our TOPSIS multi-criteria solver. Adjust to reflect what matters most to you.",
    "4 peluncur ini menetapkan pemberat matematik untuk penyelesai TOPSIS kami. Laraskan mengikut keutamaan peribadi anda.",
  ],
  "sl.presets": ["Quick Priority Presets", "Pratetap Pantas"],
  "sl.p_balanced": ["Balanced Buyer", "Pembeli Seimbang"],
  "sl.p_economist": ["Budget Maximizer", "Penjimatan Maksimum"],
  "sl.p_cruiser": ["Highway Cruiser", "Penjelajah Lebuhraya"],
  "sl.p_eco": ["Eco Pioneer", "Pencinta Alam"],

  "sl.money.t": ["Financial|Optimization", "Pengoptimuman|Kewangan"],
  "sl.money.low": ["Low Initial Price", "Harga Awal Rendah"],
  "sl.money.high": ["10-Year Lowest TCO", "TCO 10 Tahun Terendah"],
  "sl.money.hint": ["Balances upfront purchase price against total 10-year fuel, tax, and servicing expenses.", "Mengimbangi harga beli awal dengan jumlah kos petrol, cukai dan servis 10 tahun."],

  "sl.env.t": ["Carbon & Eco|Impact", "Impak Karbon|& Alam Sekitar"],
  "sl.env.low": ["Standard Emissions", "Pelepasan Biasa"],
  "sl.env.high": ["Zero Tailpipe Carbon", "Sifar Karbon Ekzos"],
  "sl.env.hint": ["Weights grid electricity efficiency, renewable integration, and lifetime CO₂ savings.", "Menimbang kecekapan grid elektrik dan penjimatan pelepasan CO₂ seumur hidup."],

  "sl.conv.t": ["Convenience & Range Ease", "Kemudahan & Keselesaan Jarak"],
  "sl.conv.low": ["Flexible on stops", "Fleksibel berhenti"],
  "sl.conv.high": ["Zero charging detours", "Sifar lencongan caj"],
  "sl.conv.hint": ["Prioritizes vehicles that eliminate range anxiety on your specific destination corridors.", "Mengutamakan kenderaan yang mengurangkan kebimbangan jarak pada laluan anda."],

  "sl.fut.t": ["Future-Proofing & Resale", "Ketahanan Masa Depan & Nilai Semula"],
  "sl.fut.low": ["Short-term ownership", "Pemilikan jangka pendek"],
  "sl.fut.high": ["High residual value", "Nilai pulangan tinggi"],
  "sl.fut.hint": ["Favors brand equity, battery thermal management, and 5-year used market resale retention.", "Memilih jenama teguh, pengurusan haba bateri, dan nilai jualan semula 5 tahun."],

  "sl.cta": ["Calculate Ranked Recommendations", "Kira Cadangan Tersusun"],
  "sl.running": ["Evaluating 184 models across 5 engines...", "Menilai 184 model merentasi 5 enjin..."],
  "sl.back": ["Back to diagnostic", "Kembali ke diagnostik"],
  "sl.err": ["Could not communicate with scoring engine. Please check backend connection.", "Gagal menghubungi enjin pengiraan. Sila semak sambungan backend."],

  "re.staged": ["Staged plan — relative years", "Pelan berperingkat — tahun relatif"],
  "v.echo": ["Real-time voice with echo suppression", "Suara masa nyata dengan penindasan gema"],
  "v.speaking": ["Advisor is speaking…", "Penasihat sedang bercakap…"],
  "v.echoOn": ["Automatic acoustic echo suppression active", "Penindasan gema akustik automatik aktif"],
  "v.processing": ["Processing your answers", "Memproses jawapan anda"],
  "v.done": ["Diagnostic complete", "Diagnostik selesai"],
  "v.doneSub": ["Profile calibrated. Taking you to scoring…", "Profil dikalibrasi. Membawa anda ke pemarkahan…"],
  "tc.sub": ["Amortized 10-year cumulative vehicle ownership expenditure", "Perbelanjaan pemilikan kenderaan terkumpul 10 tahun"],
  "tc.net": ["Net TCO:", "TCO bersih:"],
  "tc.otr": ["Purchase OTR", "Harga OTR"],
  "tc.tax10": ["Road Tax (10y)", "Cukai Jalan (10thn)"],
  "tc.resale": ["Est. 10y Resale", "Anggaran Jualan Semula 10thn"],
  "tc.price": ["Purchase Price", "Harga Belian"],
  "tc.energy": ["TNB Electricity / Petrol", "Elektrik TNB / Petrol"],
  "tc.tax": ["JPJ Road Tax", "Cukai Jalan JPJ"],
  "bd.sim": ["Simulate vehicle ownership duration:", "Simulasi tempoh pemilikan kenderaan:"],
  "bd.y0": ["Delivery (Yr 0)", "Penghantaran (Thn 0)"],
  "bd.y8": ["Warranty End (Yr 8)", "Tamat Waranti (Thn 8)"],
  "bd.y15": ["Long-Term (Yr 15)", "Jangka Panjang (Thn 15)"],
  "bd.range": ["Usable Range", "Jarak Boleh Guna"],
  "bd.pack": ["Remaining Pack", "Baki Pek Bateri"],
  "bd.warranty": ["Factory Warranty", "Waranti Kilang"],
  "bd.covered": ["Fully Covered", "Dilindungi Sepenuhnya"],
  "bd.post": ["Post-Warranty (70%+ SoH)", "Selepas Waranti (70%+ SoH)"],
  "hero.badge": ["Malaysian EV & Hybrid Decision Engine", "Enjin Keputusan EV & Hibrid Malaysia"],
  "lr.needSub": ["Our 5 decision engines rank all 184 Malaysian models tailored to your daily route and charging access.", "5 enjin keputusan kami menyusun 184 model Malaysia mengikut laluan harian dan akses pengecasan anda."],
  "hw.worksTitle": ["How VoltPilot works.", "Cara VoltPilot berfungsi."],
  "eng.n": ["Engine", "Enjin"],
  "eng.t1a": ["OTR Registration", "Pendaftaran OTR"],
  "eng.t1b": ["TNB Off-Peak Tariff", "Tarif Luar Puncak TNB"],
  "eng.t2a": ["Tropical WLTP Derating", "Penurunan WLTP Tropika"],
  "eng.t2b": ["Highway Speed Drag", "Seretan Kelajuan Lebuh Raya"],
  "r.noMatch": ["No model within your budget matches those filters. Try clearing one.", "Tiada model dalam bajet anda sepadan dengan tapisan itu. Cuba kosongkan satu."],
  "bd.sub": ["Electrochemical capacity retention curve under Malaysian tropical climate", "Lengkung pengekalan kapasiti elektrokimia dalam iklim tropika Malaysia"],
  "lie.sponsor": ["Sponsor showcase", "Pameran penaja"],
  "lie.tagline": ["Three rows, 505 km of range, and a 10-year battery warranty.", "Tiga baris, jarak 505 km, dan waranti bateri 10 tahun."],
  "v.liveStream": ["Live Stream", "Siaran Langsung"],
  "an.working": ["Working", "Sedang berjalan"],
  "an.sub": ["Five engines are reading your answers against 184 Malaysian trims.", "Lima enjin sedang membaca jawapan anda terhadap 184 varian Malaysia."],
  "an.l1": ["Screening", "Tapisan"],
  "an.l1d": ["Budget, and whether you can charge", "Bajet, dan sama ada anda boleh mengecas"],
  "an.l2": ["Cost", "Kos"],
  "an.l2d": ["Ten years of financing, insurance, road tax", "Sepuluh tahun pembiayaan, insurans, cukai jalan"],
  "an.l3": ["Energy", "Tenaga"],
  "an.l3d": ["Electricity or fuel, and well-to-wheel CO₂", "Elektrik atau bahan api, dan CO₂ well-to-wheel"],
  "an.l4": ["Range & charging", "Jarak & pengecasan"],
  "an.l4d": ["Real-world range, chargers on your routes", "Jarak sebenar, pengecas di laluan anda"],
  "an.l5": ["Ranking", "Kedudukan"],
  "an.l5d": ["TOPSIS across six weighted criteria", "TOPSIS merentasi enam kriteria berwajaran"],
  "an.sponsor": ["Shown by", "Ditaja oleh"],
  "an.s1": ["Matching your profile to 184 models…", "Memadankan profil anda dengan 184 model…"],
  "an.s2": ["Financial · behaviour · infrastructure engines…", "Enjin kewangan · tingkah laku · infrastruktur…"],
  "an.s3": ["Energy engine…", "Enjin tenaga…"],
  "an.s4": ["TOPSIS ranking…", "Kedudukan TOPSIS…"],
  "an.s5": ["AI analyst writing your roadmap…", "Penganalisis AI menulis peta jalan anda…"],
  "an.heading": ["Analysing with AI", "Menganalisis dengan AI"],
  "an.prep": ["Preparing the garage…", "Menyediakan garaj…"],

  "r.your": ["Your result", "Keputusan anda"],
  "r.restart": ["Start over", "Mula semula"],
  "r.ai": ["AI recommendation", "Cadangan AI"],
  "r.roadmap": ["See the 10-year roadmap", "Lihat peta jalan 10 tahun"],
  "r.pdf": ["PDF report", "Laporan PDF"],
  "r.solar": ["Solar-first bonus", "Bonus solar dahulu"],
  "r.dash": ["Full dashboard", "Papan pemuka penuh"],
  "r.assumed": ["Assumed battery age", "Anggaran usia bateri"],
  "r.askbat": ["Ask chatbot about battery degradation", "Tanya chatbot tentang degradasi bateri"],

  "r.emailT": ["Email me the PDF report", "E-mel laporan PDF kepada saya"],
  "r.emailSub": ["Includes your profile, ranking, roadmap and savings. One send — bound to the first email.", "Termasuk profil, kedudukan, peta jalan dan penjimatan anda. Satu penghantaran — terikat pada e-mel pertama."],
  "r.provH": ["How we know these figures", "Bagaimana kami tahu angka ini"],
  "r.provSub": ["Every number above, and where it comes from.", "Setiap nombor di atas, dan dari mana asalnya."],
  "prov.measured": ["Measured", "Diukur"],
  "prov.computed": ["Computed", "Dikira"],
  "prov.estimated": ["Estimated", "Anggaran"],
  "prov.caveat": ["Known limitation", "Batasan diketahui"],
  "err.offline": ["Could not reach the server. Check your connection and try again.", "Tidak dapat menghubungi pelayan. Semak sambungan anda dan cuba lagi."],
  "err.timeout": ["The server is taking too long. It may be starting up — try again in a moment.", "Pelayan mengambil masa terlalu lama. Ia mungkin sedang dimulakan — cuba lagi sebentar."],
  "err.rate_limited": ["Too many requests. Please wait a moment and try again.", "Terlalu banyak permintaan. Sila tunggu sebentar dan cuba lagi."],
  "err.not_found": ["That result has expired or was not found. Start a new diagnostic.", "Keputusan itu telah tamat tempoh atau tidak dijumpai. Mulakan diagnostik baharu."],
  "err.invalid": ["Some answers could not be read. Please check the form and try again.", "Sesetengah jawapan tidak dapat dibaca. Sila semak borang dan cuba lagi."],
  "err.server": ["Something went wrong on our side. Please try again.", "Berlaku masalah di pihak kami. Sila cuba lagi."],
  "err.unknown": ["Something went wrong. Please try again.", "Berlaku masalah. Sila cuba lagi."],
  "err.retry": ["Try again", "Cuba lagi"],
  "err.useForm": ["Use the guided form instead", "Guna borang berpandu sebaliknya"],
  "r.price": ["Purchase price", "Harga belian"],
  "r.energy": ["Energy cost", "Kos tenaga"],
  "r.tco10": ["10-yr TCO", "TCO 10 tahun"],
  "r.co2s": ["CO₂ saved", "CO₂ dijimatkan"],
  "r.kgyr": ["kg/yr", "kg/thn"],
  "r.topsis": ["TOPSIS score", "Skor TOPSIS"],
  "r.filterBody": ["Filter by body type", "Tapis mengikut jenis badan"],
  "r.allBody": ["All body types", "Semua jenis badan"],
  "r.filterBrand": ["Filter by brand", "Tapis mengikut jenama"],
  "r.allBrands": ["All brands", "Semua jenama"],
  "r.batteryAge": ["Battery age", "Usia bateri"],
  "r.compiling": ["Compiling your analysis…", "Menyusun analisis anda…"],

  "ch.title": ["AI analyst", "Penganalisis AI"],
  "ch.sub": ["Knows your results", "Tahu keputusan anda"],
  "ch.results": ["Results", "Keputusan"],
  "ch.q1": ["Best EV for road trips?", "EV terbaik untuk perjalanan jauh?"],
  "ch.q2": ["Charging cost per 100 km?", "Kos mengecas setiap 100 km?"],
  "ch.q3": ["Compare my top 2", "Bandingkan 2 teratas saya"],
  "ch.q4": ["Battery warranty coverage?", "Perlindungan waranti bateri?"],
  "ch.placeholder": ["Ask about your results…", "Tanya tentang keputusan anda…"],
  "ch.note": ["Battery answers are education, not a change to your ranking.", "Jawapan bateri bersifat pendidikan, bukan perubahan pada kedudukan anda."],
  "ch.send": ["Send", "Hantar"],
  "v.t1": ["Speak naturally.", "Bercakap secara semula jadi."],
  "v.t2": ["We will guide the conversation.", "Kami akan memandu perbualan."],
  "v.voice": ["Live Voice", "Suara Langsung"],
  "v.back": ["Back to home", "Kembali ke utama"],
  "v.checking": ["Connecting to Gemini Live audio session...", "Menyambung ke sesi audio Gemini Live..."],
  "v.readyT": ["Voice Session Ready", "Sesi Suara Sedia"],
  "v.readyB": [
    "Speak in English or Bahasa Melayu. You can interrupt at any moment.",
    "Bercakap dalam Bahasa Melayu atau English. Anda boleh menyampuk bila-bila masa.",
  ],
  "v.connecting": ["Connecting…", "Menyambung…"],
  "v.liveT": ["Live Consultation Active", "Konsultasi Langsung Aktif"],
  "v.you": ["You", "Anda"],
  "v.start": ["Start Speaking", "Mula Bercakap"],
  "v.useform": ["Switch to Guided Form", "Tukar ke Borang Berpandu"],
  "v.fallbackT": ["Voice Mode Offline", "Mod Suara Luar Talian"],
  "v.advisor": ["AI Advisor", "Penasihat AI"],
  "v.extracting": ["Extracting telemetry profile from audio...", "Mengekstrak profil telemetri daripada audio..."],
  "v.continue": ["Proceed to Weighting Studio", "Teruskan ke Studio Pemberat"],
  "v.errNoKey": [
    "Gemini Live key is not configured on this server. Switching smoothly to guided text diagnostic.",
    "Kunci Gemini Live belum dikonfigurasi pada pelayan. Bertukar ke diagnostik teks berpandu.",
  ],
  "v.errUnreachable": [
    "Voice service is temporarily unavailable. Using the interactive form instead.",
    "Perkhidmatan suara tidak tersedia buat sementara waktu. Guna borang interaktif.",
  ],
  "v.errSession": ["Live audio session interrupted. Switching to guided form.", "Sesi audio langsung terganggu. Bertukar ke borang berpandu."],
  "v.errMic": [
    "Microphone access was denied. Please allow microphone permissions or use the guided form.",
    "Akses mikrofon dinafikan. Sila benarkan kebenaran mikrofon atau guna borang berpandu.",
  ],
  "re.yours": ["Your roadmap", "Peta jalan anda"],
  "re.drafting": ["Letting the analyst draft the plan…", "Membiarkan penganalisis merangka pelan…"],
  "re.co2": ["CO₂ saved over 10 years", "CO₂ dijimatkan sepanjang 10 tahun"],
  "re.milestones": ["Milestones & trade-offs", "Pencapaian & pertukaran"],
} satisfies Record<string, Entry>;

export type StrKey = keyof typeof S;

export function makeT(lang: Lang) {
  return (key: StrKey, vars?: Record<string, string | number>): string => {
    let s: string = (S[key] as Entry | undefined)?.[lang === "bm" ? 1 : 0] ?? String(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export function useT() {
  const lang = useLang();
  return makeT(lang);
}
