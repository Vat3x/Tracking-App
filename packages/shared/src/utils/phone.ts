/** Extract only digits from a raw phone input */
export function extractDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Validate that a phone number has enough digits (>= 7) */
export function isValidPhoneDigits(raw: string): boolean {
  return extractDigits(raw).length >= 7;
}

/** Build a full E.164-style phone number from country code + raw input */
export function buildFullNumber(countryCode: string, rawInput: string): string {
  return countryCode + extractDigits(rawInput);
}

/** Sanitize OTP input: keep only digits, max 6 characters */
export function sanitizeOtp(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

/** Country dialing codes — US/CA first, then sorted alphabetically by country name */
export const COUNTRY_CODES = [
  { code: "+1",    label: "US +1"   },  // United States
  { code: "+93",   label: "AF +93"  },  // Afghanistan
  { code: "+355",  label: "AL +355" },  // Albania
  { code: "+213",  label: "DZ +213" },  // Algeria
  { code: "+376",  label: "AD +376" },  // Andorra
  { code: "+244",  label: "AO +244" },  // Angola
  { code: "+54",   label: "AR +54"  },  // Argentina
  { code: "+374",  label: "AM +374" },  // Armenia
  { code: "+61",   label: "AU +61"  },  // Australia
  { code: "+43",   label: "AT +43"  },  // Austria
  { code: "+994",  label: "AZ +994" },  // Azerbaijan
  { code: "+1242", label: "BS +1242"},  // Bahamas
  { code: "+973",  label: "BH +973" },  // Bahrain
  { code: "+880",  label: "BD +880" },  // Bangladesh
  { code: "+375",  label: "BY +375" },  // Belarus
  { code: "+32",   label: "BE +32"  },  // Belgium
  { code: "+501",  label: "BZ +501" },  // Belize
  { code: "+229",  label: "BJ +229" },  // Benin
  { code: "+975",  label: "BT +975" },  // Bhutan
  { code: "+591",  label: "BO +591" },  // Bolivia
  { code: "+387",  label: "BA +387" },  // Bosnia & Herzegovina
  { code: "+267",  label: "BW +267" },  // Botswana
  { code: "+55",   label: "BR +55"  },  // Brazil
  { code: "+673",  label: "BN +673" },  // Brunei
  { code: "+359",  label: "BG +359" },  // Bulgaria
  { code: "+226",  label: "BF +226" },  // Burkina Faso
  { code: "+257",  label: "BI +257" },  // Burundi
  { code: "+855",  label: "KH +855" },  // Cambodia
  { code: "+237",  label: "CM +237" },  // Cameroon
  { code: "+238",  label: "CV +238" },  // Cape Verde
  { code: "+236",  label: "CF +236" },  // Central African Republic
  { code: "+235",  label: "TD +235" },  // Chad
  { code: "+56",   label: "CL +56"  },  // Chile
  { code: "+86",   label: "CN +86"  },  // China
  { code: "+57",   label: "CO +57"  },  // Colombia
  { code: "+269",  label: "KM +269" },  // Comoros
  { code: "+242",  label: "CG +242" },  // Congo
  { code: "+506",  label: "CR +506" },  // Costa Rica
  { code: "+385",  label: "HR +385" },  // Croatia
  { code: "+53",   label: "CU +53"  },  // Cuba
  { code: "+357",  label: "CY +357" },  // Cyprus
  { code: "+420",  label: "CZ +420" },  // Czech Republic
  { code: "+243",  label: "CD +243" },  // DR Congo
  { code: "+45",   label: "DK +45"  },  // Denmark
  { code: "+253",  label: "DJ +253" },  // Djibouti
  { code: "+1809", label: "DO +1809"},  // Dominican Republic
  { code: "+593",  label: "EC +593" },  // Ecuador
  { code: "+20",   label: "EG +20"  },  // Egypt
  { code: "+503",  label: "SV +503" },  // El Salvador
  { code: "+240",  label: "GQ +240" },  // Equatorial Guinea
  { code: "+291",  label: "ER +291" },  // Eritrea
  { code: "+372",  label: "EE +372" },  // Estonia
  { code: "+268",  label: "SZ +268" },  // Eswatini
  { code: "+251",  label: "ET +251" },  // Ethiopia
  { code: "+679",  label: "FJ +679" },  // Fiji
  { code: "+358",  label: "FI +358" },  // Finland
  { code: "+33",   label: "FR +33"  },  // France
  { code: "+241",  label: "GA +241" },  // Gabon
  { code: "+220",  label: "GM +220" },  // Gambia
  { code: "+995",  label: "GE +995" },  // Georgia
  { code: "+49",   label: "DE +49"  },  // Germany
  { code: "+233",  label: "GH +233" },  // Ghana
  { code: "+30",   label: "GR +30"  },  // Greece
  { code: "+502",  label: "GT +502" },  // Guatemala
  { code: "+224",  label: "GN +224" },  // Guinea
  { code: "+245",  label: "GW +245" },  // Guinea-Bissau
  { code: "+592",  label: "GY +592" },  // Guyana
  { code: "+509",  label: "HT +509" },  // Haiti
  { code: "+504",  label: "HN +504" },  // Honduras
  { code: "+36",   label: "HU +36"  },  // Hungary
  { code: "+354",  label: "IS +354" },  // Iceland
  { code: "+91",   label: "IN +91"  },  // India
  { code: "+62",   label: "ID +62"  },  // Indonesia
  { code: "+98",   label: "IR +98"  },  // Iran
  { code: "+964",  label: "IQ +964" },  // Iraq
  { code: "+353",  label: "IE +353" },  // Ireland
  { code: "+972",  label: "IL +972" },  // Israel
  { code: "+39",   label: "IT +39"  },  // Italy
  { code: "+225",  label: "CI +225" },  // Ivory Coast
  { code: "+1876", label: "JM +1876"},  // Jamaica
  { code: "+81",   label: "JP +81"  },  // Japan
  { code: "+962",  label: "JO +962" },  // Jordan
  { code: "+7",    label: "KZ/RU +7" },  // Kazakhstan / Russia
  { code: "+254",  label: "KE +254" },  // Kenya
  { code: "+686",  label: "KI +686" },  // Kiribati
  { code: "+383",  label: "XK +383" },  // Kosovo
  { code: "+965",  label: "KW +965" },  // Kuwait
  { code: "+996",  label: "KG +996" },  // Kyrgyzstan
  { code: "+856",  label: "LA +856" },  // Laos
  { code: "+371",  label: "LV +371" },  // Latvia
  { code: "+961",  label: "LB +961" },  // Lebanon
  { code: "+266",  label: "LS +266" },  // Lesotho
  { code: "+231",  label: "LR +231" },  // Liberia
  { code: "+218",  label: "LY +218" },  // Libya
  { code: "+423",  label: "LI +423" },  // Liechtenstein
  { code: "+370",  label: "LT +370" },  // Lithuania
  { code: "+352",  label: "LU +352" },  // Luxembourg
  { code: "+261",  label: "MG +261" },  // Madagascar
  { code: "+265",  label: "MW +265" },  // Malawi
  { code: "+60",   label: "MY +60"  },  // Malaysia
  { code: "+960",  label: "MV +960" },  // Maldives
  { code: "+223",  label: "ML +223" },  // Mali
  { code: "+356",  label: "MT +356" },  // Malta
  { code: "+692",  label: "MH +692" },  // Marshall Islands
  { code: "+222",  label: "MR +222" },  // Mauritania
  { code: "+230",  label: "MU +230" },  // Mauritius
  { code: "+52",   label: "MX +52"  },  // Mexico
  { code: "+691",  label: "FM +691" },  // Micronesia
  { code: "+373",  label: "MD +373" },  // Moldova
  { code: "+976",  label: "MN +976" },  // Mongolia
  { code: "+382",  label: "ME +382" },  // Montenegro
  { code: "+212",  label: "MA +212" },  // Morocco
  { code: "+258",  label: "MZ +258" },  // Mozambique
  { code: "+95",   label: "MM +95"  },  // Myanmar
  { code: "+264",  label: "NA +264" },  // Namibia
  { code: "+674",  label: "NR +674" },  // Nauru
  { code: "+977",  label: "NP +977" },  // Nepal
  { code: "+31",   label: "NL +31"  },  // Netherlands
  { code: "+64",   label: "NZ +64"  },  // New Zealand
  { code: "+505",  label: "NI +505" },  // Nicaragua
  { code: "+227",  label: "NE +227" },  // Niger
  { code: "+234",  label: "NG +234" },  // Nigeria
  { code: "+850",  label: "KP +850" },  // North Korea
  { code: "+389",  label: "MK +389" },  // North Macedonia
  { code: "+47",   label: "NO +47"  },  // Norway
  { code: "+968",  label: "OM +968" },  // Oman
  { code: "+92",   label: "PK +92"  },  // Pakistan
  { code: "+680",  label: "PW +680" },  // Palau
  { code: "+507",  label: "PA +507" },  // Panama
  { code: "+675",  label: "PG +675" },  // Papua New Guinea
  { code: "+595",  label: "PY +595" },  // Paraguay
  { code: "+51",   label: "PE +51"  },  // Peru
  { code: "+63",   label: "PH +63"  },  // Philippines
  { code: "+48",   label: "PL +48"  },  // Poland
  { code: "+351",  label: "PT +351" },  // Portugal
  { code: "+974",  label: "QA +974" },  // Qatar
  { code: "+40",   label: "RO +40"  },  // Romania
  { code: "+250",  label: "RW +250" },  // Rwanda
  { code: "+966",  label: "SA +966" },  // Saudi Arabia
  { code: "+221",  label: "SN +221" },  // Senegal
  { code: "+381",  label: "RS +381" },  // Serbia
  { code: "+232",  label: "SL +232" },  // Sierra Leone
  { code: "+65",   label: "SG +65"  },  // Singapore
  { code: "+421",  label: "SK +421" },  // Slovakia
  { code: "+386",  label: "SI +386" },  // Slovenia
  { code: "+677",  label: "SB +677" },  // Solomon Islands
  { code: "+252",  label: "SO +252" },  // Somalia
  { code: "+27",   label: "ZA +27"  },  // South Africa
  { code: "+82",   label: "KR +82"  },  // South Korea
  { code: "+211",  label: "SS +211" },  // South Sudan
  { code: "+34",   label: "ES +34"  },  // Spain
  { code: "+94",   label: "LK +94"  },  // Sri Lanka
  { code: "+249",  label: "SD +249" },  // Sudan
  { code: "+597",  label: "SR +597" },  // Suriname
  { code: "+46",   label: "SE +46"  },  // Sweden
  { code: "+41",   label: "CH +41"  },  // Switzerland
  { code: "+963",  label: "SY +963" },  // Syria
  { code: "+886",  label: "TW +886" },  // Taiwan
  { code: "+992",  label: "TJ +992" },  // Tajikistan
  { code: "+255",  label: "TZ +255" },  // Tanzania
  { code: "+66",   label: "TH +66"  },  // Thailand
  { code: "+228",  label: "TG +228" },  // Togo
  { code: "+676",  label: "TO +676" },  // Tonga
  { code: "+1868", label: "TT +1868"},  // Trinidad & Tobago
  { code: "+216",  label: "TN +216" },  // Tunisia
  { code: "+90",   label: "TR +90"  },  // Turkey
  { code: "+993",  label: "TM +993" },  // Turkmenistan
  { code: "+688",  label: "TV +688" },  // Tuvalu
  { code: "+256",  label: "UG +256" },  // Uganda
  { code: "+380",  label: "UA +380" },  // Ukraine
  { code: "+971",  label: "AE +971" },  // United Arab Emirates
  { code: "+44",   label: "UK +44"  },  // United Kingdom
  { code: "+598",  label: "UY +598" },  // Uruguay
  { code: "+998",  label: "UZ +998" },  // Uzbekistan
  { code: "+678",  label: "VU +678" },  // Vanuatu
  { code: "+58",   label: "VE +58"  },  // Venezuela
  { code: "+84",   label: "VN +84"  },  // Vietnam
  { code: "+967",  label: "YE +967" },  // Yemen
  { code: "+260",  label: "ZM +260" },  // Zambia
  { code: "+263",  label: "ZW +263" },  // Zimbabwe
] as const;
