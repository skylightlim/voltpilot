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
  "nav.brand": ["VoltPilot", "VoltPilot"],
  "nav.tagline": ["Malaysia Decision Engine", "Enjin Keputusan Malaysia"],
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
  "calc.co2Save": ["Annual CO₂ Avoided", "CO₂ Dielakkan Setahun"],

  "ts.rm": ["RM", "RM"],
  "ts.rm.sub": ["Complete OTR prices, JPJ road tax & TNB tariffs", "Harga OTR lengkap, cukai jalan JPJ & tarif TNB"],
  "ts.count": ["184", "184"],
  // scroll marquee band (DESIGN.md §3) — factual claims only, no brand noise
  "mq.a": ["184 Malaysian trims", "184 varian Malaysia"],
  "mq.b": ["5 decision engines", "5 enjin keputusan"],
  "mq.c": ["TOPSIS ranked", "Disusun secara TOPSIS"],
  "mq.d": ["Free, no sign-up", "Percuma, tanpa daftar"],
  "lr.showAll": ["Show all {n} models", "Papar semua {n} model"],
  "lr.showLess": ["Show fewer", "Papar kurang"],
  "ts.count.sub": ["Malaysian EV and Hybrid models evaluated", "Model EV dan Hibrid Malaysia dinilai"],
  "ts.yr": ["10 Years", "10 Tahun"],
  "ts.yr.sub": ["Lifecycle TCO roadmap and battery health projection", "Peta jalan TCO dan unjuran kesihatan bateri"],

  "hw.label": ["Decision Architecture", "Seni Bina Keputusan"],
  "hw.title": ["Built for Malaysian roads, subsidies, and tariffs.", "Dibina untuk jalan raya, subsidi, dan tarif Malaysia."],
  "hw.step": ["Step", "Langkah"],
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
  "lr.premium": ["Premium / Luxury", "Premium / Mewah"],
  "lr.cta": ["Calculate for my profile", "Kira untuk profil saya"],
  "lr.viewDetails": ["View Specs", "Lihat Spesifikasi"],
  "lr.topsisFit": ["TOPSIS Score", "Skor TOPSIS"],

  "m.label": ["Decision Methodology", "Kaedah Keputusan"],
  "m.title": ["Five engines, one mathematical TOPSIS solver.", "Lima enjin, satu penyelesai matematik TOPSIS."],
  "m.body": [
    "We fuse total cost of ownership with real-world practicality, ranking every vehicle against your exact requirements using TOPSIS, the multi-criteria optimization standard used in aerospace and logistics.",
    "Kami menggabungkan kos pemilikan dengan kesesuaian harian, menyusun setiap kenderaan berdasarkan keperluan anda menggunakan TOPSIS, piawaian pengoptimuman pelbagai kriteria.",
  ],
  "m.c1": ["10-Year Lifecycle TCO", "TCO Kitar Hayat 10 Tahun"],
  "m.c2": ["Real Highway Range Fit", "Kesesuaian Jarak Lebuhraya"],
  "m.c3": ["Malaysian DC Fast Charging", "Pengecasan Pantas DC Malaysia"],
  "m.c4": ["TNB Electricity vs Petrol", "Elektrik TNB vs Petrol"],
  "m.c5": ["Battery Health & Resale", "Kesihatan Bateri & Nilai Semula"],
  "m.why": ["Why mathematical modeling beats showroom sales pitches", "Mengapa model matematik mengatasi tawaran jurujual"],
  "m.b1": ["Real on-the-road Malaysian prices, not overseas MSRP estimates", "Harga sebenar di atas jalan Malaysia, bukan anggaran MSRP luar negara"],
  "m.b2": ["Your actual daily commute distance tested against tropical WLTP deratings", "Jarak harian sebenar anda diuji dengan penurunan jarak cuaca tropika"],
  "m.b3": ["TNB residential tariffs (RM0.25 to RM0.57/kWh) amortized across 10 years", "Tarif kediaman TNB (RM0.25 hingga RM0.57/kWh) dipuratakan sepanjang 10 tahun"],
  "m.b4": ["JPJ Lampiran B EV road tax formulas calculated per kilowatt output", "Formula cukai jalan JPJ Lampiran B dikira mengikut kilowatt motor"],

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

  "ft.label1": ["AI Transportation Intelligence", "Kepintaran Pengangkutan AI"],
  "ft.body1": [
    "Data-driven EV and Hybrid decision architecture for Malaysian drivers, incorporating live prices, national tariffs, and actual commuting telemetry.",
    "Seni bina keputusan EV dan Hibrid berasaskan data untuk pemandu Malaysia, menggabungkan harga semasa, tarif nasional, dan telemetri pemanduan sebenar.",
  ],
  "ft.product": ["Navigation", "Navigasi"],
  "ft.how": ["Methodology", "Kaedah"],
  "ft.analysis": ["Analysis Engine", "Enjin Analisis"],
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

  "fi.label": ["Guided Diagnostic Intake", "Diagnostik Berpandu"],
  "fi.t1": ["Seven quick questions.", "Tujuh soalan ringkas."],
  "fi.t2": ["Takes about two minutes.", "Mengambil masa kira-kira dua minit."],
  "fi.body": [
    "We evaluate your daily commute distance, home wallbox access, highway trip patterns, and budget. Zero personal identification required.",
    "Kami menilai jarak ulang-alik harian, akses pengecasan rumah, corak perjalanan lebuh raya, dan bajet anda. Tiada data peribadi diperlukan.",
  ],
  "fi.c1a": ["Your diagnostic data stays on", "Data diagnostik anda kekal pada"],
  "fi.c1b": ["your device session", "sesi peranti anda"],
  "fi.c1c": [", completely private and anonymous.", ", selamat dan tanpa nama."],
  "fi.c2a": ["Mathematical solver:", "Penyelesai matematik:"],
  "fi.c2b": ["7-criteria TOPSIS matrix", "Matriks 7-kriteria TOPSIS"],
  "fi.c2c": ["across 184 Malaysian vehicle trims.", "merangkumi 184 varian kenderaan Malaysia."],
  "fi.cta": ["Start Diagnostic", "Mula Diagnostik"],

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
  "cf.billHint": [
    "Your household bill today. A heavier household crosses into the higher TNB block, so home charging costs more per kWh.",
    "Bil isi rumah anda hari ini. Isi rumah yang berat melepasi blok TNB lebih tinggi, jadi pengecasan rumah lebih mahal sekWj.",
  ],
  "cf.region": ["Grid region", "Kawasan grid"],
  "cf.region.peninsular": ["Peninsular", "Semenanjung"],
  "cf.region.east_malaysia": ["East Malaysia", "Malaysia Timur"],
  "cf.regionHint": [
    "East Malaysia leans on Sarawak hydro, so each kWh carries about half the CO2 of the Peninsular grid.",
    "Malaysia Timur bergantung pada hidro Sarawak, jadi setiap kWj membawa kira-kira separuh CO2 grid Semenanjung.",
  ],
  "cf.work": ["Workplace charging", "Pengecasan di tempat kerja"],
  "cf.home": ["Home charging", "Pengecasan di rumah"],
  "cf.solar": ["Solar feasible", "Solar boleh dipasang"],
  "cf.s3": ["Charging infrastructure & long trips", "Infrastruktur pengecasan & perjalanan jauh"],
  "cf.s3hint": [
    "Public stations, route density & charging gaps are computed automatically from your postcode.",
    "Stesen awam, ketumpatan laluan & jurang pengecasan dikira automatik daripada poskod anda.",
  ],
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
  "sl.radarTitle": ["Live Priority Radar Distribution", "Taburan Radar Keutamaan Langsung"],

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

  "an.label": ["AI Transportation Laboratory", "Makmal Pengangkutan AI"],
  "an.s1": ["Filtering 184 Malaysian EV & Hybrid configurations...", "Menapis 184 konfigurasi EV & Hibrid Malaysia..."],
  "an.s2": ["Executing 10-year TCO and JPJ road-tax simulations...", "Menjalankan simulasi TCO 10 tahun dan cukai jalan JPJ..."],
  "an.s3": ["Evaluating PLUS Highway DC charging corridor access...", "Menilai akses koridor pengecasan DC Lebuhraya PLUS..."],
  "an.s4": ["Running TOPSIS multi-criteria vector normalization...", "Menjalankan normalisasi vektor pelbagai kriteria TOPSIS..."],
  "an.s5": ["Synthesizing Gemini AI executive recommendation roadmap...", "Mensintesis peta jalan cadangan eksekutif AI Gemini..."],
  "an.prep": ["Initializing 3D vehicle stage...", "Menyiapkan garaj..."],

  "r.your": ["Decision Intelligence Report", "Laporan Keputusan Pintar"],
  "r.restart": ["New Diagnostic", "Diagnostik Baru"],
  "r.ai": ["Executive AI Recommendation", "Cadangan Eksekutif AI"],
  "r.roadmap": ["View 10-Year Ownership Roadmap", "Lihat Peta Jalan Pemilikan 10 Tahun"],
  "r.ask": ["Consult AI Advisor", "Rujuk Penasihat AI"],
  "r.pdf": ["Email PDF Report", "Email Laporan PDF"],
  "r.solar": ["Rooftop Solar Synergy Bonus", "Bonus Sinergi Solar Bumbung"],
  "r.solarBody": [
    "With rooftop solar (estimated capex <b>RM{capex}</b>, annual generation savings <b>~RM{save}/year</b>, payback <b>{payback} years</b>), daytime EV charging becomes near-zero cost under NEM 3.0.",
    "Dengan solar bumbung (anggaran modal <b>RM{capex}</b>, penjimatan tahunan <b>~RM{save}/tahun</b>, pulangan modal <b>{payback} tahun</b>), pengecasan siang menjadi hampir percuma di bawah NEM 3.0.",
  ],
  "r.dash": ["Intelligence Dashboard", "Papan Pemuka Keputusan"],
  "r.rank": ["Full TOPSIS Leaderboard (184 Malaysian Trims)", "Kedudukan Penuh TOPSIS (184 Varian Malaysia)"],
  "r.criteria": ["Criteria Performance Matrix", "Matriks Prestasi Kriteria"],
  "r.battery": ["Interactive Battery Health Simulator", "Simulator Kesihatan Bateri Interaktif"],
  "r.tcoBreakdown": ["10-Year Lifecycle Cost Breakdown", "Pecahan Kos Kitar Hayat 10 Tahun"],
  "r.notes": ["AI Trade-off Analysis", "Analisis Pertimbangan AI"],
  "r.th.rank": ["Rank", "Kedudukan"],
  "r.th.model": ["Vehicle Trim", "Model Kenderaan"],
  "r.th.score": ["TOPSIS Score", "Skor TOPSIS"],
  "r.th.price": ["OTR Price", "Harga OTR"],
  "r.th.run": ["Annual Running", "Kos Tahunan"],
  "r.th.tco": ["10-Yr TCO", "TCO 10 Thn"],
  "r.th.range": ["WLTP Range", "Jarak WLTP"],
  "r.th.action": ["Details", "Butiran"],
  "r.assumed": ["Simulate Battery Age", "Simulasi Umur Bateri"],
  "r.yrs": ["years", "tahun"],
  "r.warn": [
    "At {y} years of typical Malaysian driving, an automotive lithium battery pack retains approximately {p}% of original capacity. This is an informational projection.",
    "Pada usia {y} tahun pemanduan biasa di Malaysia, bateri litium dijangka mengekalkan kira-kira {p}% daripada kapasiti asal. Ini unjuran bermaklumat.",
  ],
  "r.askbat": ["Ask AI about battery degradation and warranty", "Tanya AI tentang degradasi dan jaminan bateri"],
  "r.co2suffix": [" kg CO₂/year", " kg CO₂/tahun"],
  "cr.fin": ["Financial Efficiency (10-Yr TCO)", "Kecekapan Kewangan (TCO 10 Thn)"],
  "cr.beh": ["Commute & Range Fit", "Kesesuaian Jarak & Ulang-Alik"],
  "cr.infra": ["Charging Infrastructure Ease", "Kemudahan Infrastruktur Pengecasan"],
  "cr.energy": ["Energy Efficiency & Carbon Reduction", "Kecekapan Tenaga & Pengurangan Karbon"],

  "r.emailT": ["Receive Executive PDF Dossier", "Terima Dokumen PDF Eksekutif"],
  "r.emailSub": [
    "Includes full TOPSIS scoring matrix, 10-year cashflow schedule, JPJ road tax analysis, and Gemini AI strategic advice.",
    "Termasuk matriks skor penuh TOPSIS, jadual aliran tunai 10 tahun, analisis cukai jalan JPJ, dan nasihat strategik AI Gemini.",
  ],
  "r.send": ["Send PDF Report", "Hantar Laporan PDF"],
  "r.sending": ["Generating & Sending PDF...", "Menjana & Menghantar PDF..."],
  "r.sent": ["PDF Successfully Dispatched", "PDF Berjaya Dihantar"],
  "r.resent": ["Re-sent to bound email address", "Dihantar semula ke alamat email terikat"],
  "r.sentto": ["The PDF report has been delivered to {email}.", "Laporan PDF telah dihantar ke {email}."],
  "r.emailerr": ["Please provide a valid email address.", "Sila masukkan alamat email yang sah."],
  "r.pdferr": ["Unable to dispatch PDF report at this time.", "Gagal menghantar laporan PDF buat masa ini."],
  "r.notfound": ["Diagnostic result expired or not found. Please start a fresh analysis.", "Keputusan diagnostik telah tamat tempoh atau tidak dijumpai. Sila mula analisis baru."],
  "r.compiling": ["Compiling decision intelligence matrix...", "Menyusun matriks keputusan pintar..."],
  "r.type.ev": ["Full Electric (BEV)", "Elektrik Penuh (BEV)"],
  "r.type.hybrid": ["Hybrid (HEV)", "Hibrid (HEV)"],

  "ch.title": ["AI Transport Advisor", "Penasihat Pengangkutan AI"],
  "ch.sub": ["Grounded on your TOPSIS results & Malaysian market data", "Berasaskan keputusan TOPSIS & data pasaran Malaysia anda"],
  "ch.results": ["Return to Results", "Kembali ke Keputusan"],
  "ch.greeting": [
    "Hello! I am your AI Transportation Advisor. I have loaded your diagnostic profile and TOPSIS rankings across all 184 Malaysian models. Ask me about road taxes, charging on the PLUS highway, 10-year TCO comparisons, or battery warranties.",
    "Salam! Saya Penasihat Pengangkutan AI anda. Saya telah memuatkan profil diagnostik dan kedudukan TOPSIS anda merangkumi 184 model Malaysia. Tanya saya tentang cukai jalan, pengecasan di lebuhraya PLUS, perbandingan TCO 10 tahun, atau jaminan bateri.",
  ],
  "ch.q1": ["Best EV for long trips to Penang?", "EV terbaik untuk perjalanan jauh ke Pulau Pinang?"],
  "ch.q2": ["Compare my top EV vs top Hybrid", "Bandingkan EV teratas vs Hibrid teratas saya"],
  "ch.q3": ["How does post-2025 JPJ EV road tax affect me?", "Bagaimana cukai jalan EV JPJ selepas 2025 mempengaruhi saya?"],
  "ch.q4": ["What if I charge exclusively at home on TNB?", "Bagaimana jika saya mengecas sepenuhnya di rumah di TNB?"],
  "ch.placeholder": ["Ask any question about vehicles, costs, or charging...", "Tanya sebarang soalan tentang kereta, kos, atau pengecasan..."],
  "ch.note": ["AI advice is educational and based on Malaysian regulatory datasets.", "Nasihat AI adalah pendidikan dan berdasarkan data kawal selia Malaysia."],
  "ch.err": ["The AI advisor is temporarily unreachable. Please try again shortly.", "Penasihat AI tidak dapat dihubungi buat sementara. Sila cuba sebentar lagi."],
  "ch.typing": ["AI Advisor is analyzing data...", "Penasihat AI sedang menganalisis data..."],
  "ch.send": ["Send Message", "Hantar Mesej"],

  "v.label": ["Gemini Live Voice Advisor", "Penasihat Suara Gemini Live"],
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
  "v.liveB": [
    "Answer the Advisor out loud. Say 'Confirm' when finished to calculate your ranking.",
    "Jawab Penasihat secara lisan. Sebut 'Sahkan' apabila selesai untuk mengira kedudukan anda.",
  ],
  "v.you": ["You", "Anda"],
  "v.start": ["Start Speaking", "Mula Bercakap"],
  "v.useform": ["Switch to Guided Form", "Tukar ke Borang Berpandu"],
  "v.fallbackT": ["Voice Mode Offline", "Mod Suara Luar Talian"],
  "v.advisor": ["AI Advisor", "Penasihat AI"],
  "v.extracting": ["Extracting telemetry profile from audio...", "Mengekstrak profil telemetri daripada audio..."],
  "v.confirmT": ["Verify Your Profile Telemetry", "Sahkan Telemetri Profil Anda"],
  "v.confirmSub": [
    "Review the driving habits extracted by the AI Advisor before running the 5 decision engines.",
    "Semak tabiat pemanduan yang diekstrak oleh Penasihat AI sebelum menjalankan 5 enjin keputusan.",
  ],
  "v.continue": ["Proceed to Weighting Studio", "Teruskan ke Studio Pemberat"],
  "v.reanswer": ["Edit Diagnostic Values", "Ubah Nilai Diagnostik"],
  "v.yes": ["Yes", "Ya"],
  "v.no": ["No", "Tidak"],
  "v.errNoKey": [
    "Gemini Live key is not configured on this server. Switching smoothly to guided text diagnostic.",
    "Kunci Gemini Live belum dikonfigurasi pada pelayan. Bertukar ke diagnostik teks berpandu.",
  ],
  "v.errUnreachable": [
    "Voice service is temporarily unavailable. Using the interactive form instead.",
    "Perkhidmatan suara tidak tersedia buat sementara waktu. Guna borang interaktif.",
  ],
  "v.errSession": ["Live audio session interrupted. Switching to guided form.", "Sesi audio langsung terganggu. Bertukar ke borang berpandu."],
  "v.errEnded": ["Live conversation ended. Reviewing extracted profile.", "Perbualan langsung tamat. Menyemak profil yang diekstrak."],
  "v.errMic": [
    "Microphone access was denied. Please allow microphone permissions or use the guided form.",
    "Akses mikrofon dinafikan. Sila benarkan kebenaran mikrofon atau guna borang berpandu.",
  ],

  "l.daily": ["Daily Commute", "Ulang-Alik Harian"],
  "l.days": ["Driving Days / Week", "Hari Memandu / Minggu"],
  "l.freq": ["Highway Long Trips", "Perjalanan Jauh Lebuhraya"],
  "l.freq.rarely": ["rarely (< 3x/yr)", "jarang (< 3x/setahun)"],
  "l.freq.monthly": ["monthly (~1x/mo)", "setiap bulan (~1x/bulan)"],
  "l.freq.weekly": ["weekly (regular)", "setiap minggu (kerap)"],
  "l.longkm": ["Long-Trip Distance", "Jarak Perjalanan Jauh"],
  "l.region": ["Destination Corridor", "Koridor Destinasi"],
  "l.region.kl": ["Klang Valley / Local", "Lembah Klang / Tempatan"],
  "l.region.north": ["North (Penang / Perak / Kedah)", "Utara (P.Pinang / Perak / Kedah)"],
  "l.region.south": ["South (Johor / Melaka / Seremban)", "Selatan (Johor / Melaka / Seremban)"],
  "l.region.east_coast": ["East Coast (Kuantan / Terengganu)", "Pantai Timur (Kuantan / Terengganu)"],
  "l.region.east_malaysia": ["East Malaysia (Sabah / Sarawak)", "Malaysia Timur (Sabah / Sarawak)"],
  "l.region.singapore": ["Singapore Cross-Border", "Rentasi Sempadan Singapura"],
  "l.home": ["Home Wallbox Charging", "Pengecasan Wallbox Rumah"],
  "l.postcode": ["Residential Postcode", "Poskod Kediaman"],
  "l.solar": ["Rooftop Solar Consideration", "Pertimbangan Solar Bumbung"],
  "l.budget": ["Maximum Budget Cap", "Had Maksimum Bajet"],
  "l.km": ["km", "km"],

  "re.back": ["Back to Dashboard", "Kembali ke Papan Pemuka"],
  "re.yours": ["Strategic Roadmap", "Peta Jalan Strategik"],
  "re.drafting": ["Gemini AI is synthesizing your 10-year strategy...", "AI Gemini sedang mensintesis strategi 10 tahun anda..."],
  "re.co2": ["10-Year Net CO₂ Avoided", "CO₂ Bersih Dielakkan 10 Tahun"],
  "re.cost": ["Annual Running Cost (Top Match)", "Kos Operasi Tahunan (Pilihan Utama)"],
  "re.plan": ["10-Year Strategic Lifecycle Plan", "Pelan Strategik Kitar Hayat 10 Tahun"],
  "re.now": ["Immediate (Month 1-3)", "Segera (Bulan 1-3)"],
  "re.year": ["Year {n}", "Tahun {n}"],
  "re.milestones": ["Lifecycle Milestones & Actions", "Peringkat Kitar Hayat & Tindakan"],
  "re.solarBody": [
    "You are eligible for Rooftop Solar integration. Average Malaysia: capex RM{capex}, ~RM{save}/year savings, ~{payback}-year payback under NEM 3.0.",
    "Anda layak untuk integrasi Solar Bumbung. Purata Malaysia: modal RM{capex}, jimat ~RM{save}/tahun, pulangan modal ~{payback} tahun di bawah NEM 3.0.",
  ],
  "re.dashboard": ["Results Dashboard", "Papan Pemuka Keputusan"],
  "re.yrSuffix": ["/year", "/tahun"],
  "re.purchase": [
    "Purchase {p} · running cost RM{r}/yr · 10-yr excl. TCO RM{t} · saving",
    "Harga beli {p} · kos operasi RM{r}/tahun · TCO 10 thn RM{t} · jimat",
  ],
  "lr.sponsor": ["Featured Benchmark Vehicle", "Kenderaan Penanda Aras Pilihan"],
  "lr.sponsorBody": [
    "Engineering electrification for Malaysian climate, urban commutes, and national highways.",
    "Merekabentuk elektrifikasi untuk iklim, pemanduan bandar, dan lebuh raya Malaysia.",
  ],
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
