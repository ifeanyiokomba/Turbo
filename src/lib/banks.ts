// Turbopay bank directory — Nigerian banks (audit fix: removed duplicate Sterling entry)

export interface Bank {
  code: string;
  name: string;
  short: string;
}

export const NIGERIAN_BANKS: Bank[] = [
  { code: "044", name: "Access Bank", short: "Access" },
  { code: "035", name: "ALAT by WEMA", short: "ALAT" },
  { code: "401", name: "ASO Savings and Loans", short: "ASO" },
  { code: "044", name: "Access Bank (Diamond)", short: "Diamond" },
  { code: "063", name: "Access Bank (Diamond)", short: "Diamond" },
  { code: "050", name: "Ecobank Nigeria", short: "Ecobank" },
  { code: "070", name: "Fidelity Bank", short: "Fidelity" },
  { code: "011", name: "First Bank of Nigeria", short: "FirstBank" },
  { code: "214", name: "First City Monument Bank", short: "FCMB" },
  { code: "058", name: "Guaranty Trust Bank", short: "GTBank" },
  { code: "030", name: "Heritage Bank", short: "Heritage" },
  { code: "082", name: "Keystone Bank", short: "Keystone" },
  { code: "014", name: "Standard Chartered Bank", short: "Stanbic" },
  { code: "221", name: "Stanbic IBTC Bank", short: "Stanbic IBTC" },
  { code: "068", name: "Standard Chartered Bank", short: "Standard Chartered" },
  { code: "232", name: "Sterling Bank", short: "Sterling" },
  { code: "032", name: "Union Bank of Nigeria", short: "Union" },
  { code: "033", name: "United Bank for Africa", short: "UBA" },
  { code: "215", name: "Unity Bank", short: "Unity" },
  { code: "035", name: "Wema Bank", short: "Wema" },
  { code: "057", name: "Zenith Bank", short: "Zenith" },
  { code: "322", name: "Jaiz Bank", short: "Jaiz" },
  { code: "215", name: "Unity Bank", short: "Unity" },
  { code: "526", name: "Taj Bank", short: "Taj" },
  { code: "000", name: "Turbopay MFB", short: "Turbopay" },
];

// Deduplicate by code (audit fix — original Turbopay had duplicate Sterling code 232)
export const BANKS_BY_CODE: Record<string, Bank> = NIGERIAN_BANKS.reduce(
  (acc, b) => {
    if (!acc[b.code]) acc[b.code] = b;
    return acc;
  },
  {} as Record<string, Bank>
);

export const UNIQUE_BANKS: Bank[] = Object.values(BANKS_BY_CODE).sort((a, b) =>
  a.name.localeCompare(b.name)
);

export const BILLERS: Record<
  string,
  Array<{ code: string; name: string; refLabel: string; refType: string }>
> = {
  ELECTRICITY: [
    { code: "EKO", name: "Eko Electric (EKEDC)", refLabel: "Meter Number", refType: "meter" },
    { code: "IKEDC", name: "Ikeja Electric", refLabel: "Meter Number", refType: "meter" },
    { code: "AEDC", name: "Abuja Electric (AEDC)", refLabel: "Meter Number", refType: "meter" },
    { code: "PHED", name: "Port Harcourt Electric", refLabel: "Meter Number", refType: "meter" },
    { code: "IBEDC", name: "Ibadan Electric", refLabel: "Meter Number", refType: "meter" },
    { code: "KEDCO", name: "Kano Electric", refLabel: "Meter Number", refType: "meter" },
    { code: "JED", name: "Jos Electric", refLabel: "Meter Number", refType: "meter" },
    { code: "KAEDCO", name: "Kaduna Electric", refLabel: "Meter Number", refType: "meter" },
  ],
  INTERNET: [
    { code: "SPECTRANET", name: "Spectranet", refLabel: "Account ID", refType: "account" },
    { code: "SMILE", name: "Smile Communications", refLabel: "Account ID", refType: "account" },
    { code: "IPNX", name: "ipNX", refLabel: "Account ID", refType: "account" },
    { code: "SWIFT", name: "Swift Networks", refLabel: "Account ID", refType: "account" },
  ],
  CABLE: [
    { code: "DSTV", name: "DStv", refLabel: "Smartcard Number", refType: "smartcard" },
    { code: "GOTV", name: "GOtv", refLabel: "IUC Number", refType: "smartcard" },
    { code: "STARTIMES", name: "StarTimes", refLabel: "Smartcard Number", refType: "smartcard" },
  ],
  WATER: [
    { code: "LWC", name: "Lagos Water Corporation", refLabel: "Customer ID", refType: "account" },
  ],
  EDUCATION: [
    { code: "WAEC", name: "WAEC Result Checking", refLabel: "Invoice Number", refType: "account" },
    { code: "JAMB", name: "JAMB Pin", refLabel: "Profile Code", refType: "account" },
  ],
  INSURANCE: [
    { code: "AXA", name: "AXA Mansard Insurance", refLabel: "Policy Number", refType: "account" },
    { code: "AIICO", name: "AIICO Insurance", refLabel: "Policy Number", refType: "account" },
  ],
  GOVERNMENT: [
    { code: "REMITA", name: "Remita (RRR)", refLabel: "RRR", refType: "rrr" },
    { code: "FIRS", name: "FIRS Tax", refLabel: "TIN", refType: "account" },
  ],
  BETTING: [
    { code: "BET9JA", name: "Bet9ja", refLabel: "User ID", refType: "account" },
    { code: "SPORTYBET", name: "SportyBet", refLabel: "User ID", refType: "account" },
    { code: "NAIRABET", name: "NairaBet", refLabel: "User ID", refType: "account" },
  ],
};

export const DATA_PLANS: Record<
  string,
  Array<{ id: string; name: string; amountKobo: number; validity: string }>
> = {
  MTN: [
    { id: "MTN-50", name: "50MB — 1 Day", amountKobo: 5_000, validity: "1 Day" },
    { id: "MTN-350", name: "1GB — 1 Day", amountKobo: 35_000, validity: "1 Day" },
    { id: "MTN-500", name: "2GB — 2 Days", amountKobo: 50_000, validity: "2 Days" },
    { id: "MTN-1000", name: "4.5GB — 7 Days", amountKobo: 100_000, validity: "7 Days" },
    { id: "MTN-2000", name: "10GB — 30 Days", amountKobo: 200_000, validity: "30 Days" },
    { id: "MTN-5000", name: "25GB — 30 Days", amountKobo: 500_000, validity: "30 Days" },
  ],
  GLO: [
    { id: "GLO-100", name: "100MB — 1 Day", amountKobo: 10_000, validity: "1 Day" },
    { id: "GLO-200", name: "800MB — 1 Day", amountKobo: 20_000, validity: "1 Day" },
    { id: "GLO-500", name: "2.5GB — 5 Days", amountKobo: 50_000, validity: "5 Days" },
    { id: "GLO-1000", name: "5.8GB — 30 Days", amountKobo: 100_000, validity: "30 Days" },
    { id: "GLO-2000", name: "12GB — 30 Days", amountKobo: 200_000, validity: "30 Days" },
  ],
  AIRTEL: [
    { id: "AIRTEL-50", name: "100MB — 1 Day", amountKobo: 5_000, validity: "1 Day" },
    { id: "AIRTEL-200", name: "1GB — 1 Day", amountKobo: 20_000, validity: "1 Day" },
    { id: "AIRTEL-500", name: "2GB — 7 Days", amountKobo: 50_000, validity: "7 Days" },
    { id: "AIRTEL-1000", name: "5GB — 30 Days", amountKobo: 100_000, validity: "30 Days" },
    { id: "AIRTEL-2000", name: "15GB — 30 Days", amountKobo: 200_000, validity: "30 Days" },
  ],
  NMOBILE: [
    { id: "NMOBILE-100", name: "100MB — 1 Day", amountKobo: 10_000, validity: "1 Day" },
    { id: "NMOBILE-300", name: "1GB — 1 Day", amountKobo: 30_000, validity: "1 Day" },
    { id: "NMOBILE-500", name: "2GB — 7 Days", amountKobo: 50_000, validity: "7 Days" },
    { id: "NMOBILE-1000", name: "4.5GB — 30 Days", amountKobo: 100_000, validity: "30 Days" },
  ],
};
