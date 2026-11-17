// Petit catalogue public et vérifié livré avec le Worker. Sert UNIQUEMENT à ouvrir
// les menus Discord sans attendre D1 ni éditer une réponse différée.
// Le serveur vérifie en D1 (enabled=1) au moment de la confirmation réelle.
export const PICKER_NMS = Object.freeze([
  {
    "slug": "simurgh",
    "name": "Simurgh",
    "zone": "Rolanberry Fields"
  },
  {
    "slug": "argus",
    "name": "Argus",
    "zone": ""
  },
  {
    "slug": "behemoth",
    "name": "Behemoth",
    "zone": ""
  },
  {
    "slug": "fafnir",
    "name": "Fafnir",
    "zone": ""
  },
  {
    "slug": "adamantoise",
    "name": "Adamantoise",
    "zone": ""
  },
  {
    "slug": "king-arthro",
    "name": "King Arthro",
    "zone": ""
  },
  {
    "slug": "shikigami-weapon",
    "name": "Shikigami Weapon",
    "zone": ""
  },
  {
    "slug": "serket",
    "name": "Serket",
    "zone": ""
  },
  {
    "slug": "roc",
    "name": "Roc",
    "zone": ""
  },
  {
    "slug": "lord-of-onzozo",
    "name": "Lord of Onzozo",
    "zone": ""
  },
  {
    "slug": "khimaira",
    "name": "Khimaira",
    "zone": ""
  },
  {
    "slug": "cerberus",
    "name": "Cerberus",
    "zone": ""
  },
  {
    "slug": "hydra",
    "name": "Hydra",
    "zone": ""
  },
  {
    "slug": "medusa",
    "name": "Medusa",
    "zone": ""
  },
  {
    "slug": "gurfurlur-the-menacing",
    "name": "Gurfurlur the Menacing",
    "zone": ""
  },
  {
    "slug": "gulool-ja-ja",
    "name": "Gulool Ja Ja",
    "zone": ""
  },
  {
    "slug": "yagudo-avatar",
    "name": "Yagudo Avatar",
    "zone": ""
  },
  {
    "slug": "orcish-overlord",
    "name": "Orcish Overlord",
    "zone": ""
  },
  {
    "slug": "diamond-quadav",
    "name": "Diamond Quadav",
    "zone": ""
  },
  {"slug": "centurio-xii-i", "name": "Centurio XII-I", "zone": "Eastern Altepa Desert"},
  {"slug": "sozu-bliberry", "name": "Sozu Bliberry", "zone": "Den of Rancor"},
  {"slug": "ancient-goobbue", "name": "Ancient Goobbue", "zone": "The Boyahda Tree"},
  {"slug": "oni-carcass", "name": "Oni Carcass", "zone": "Toraimarai Canal"},
  {"slug": "brazen-bones", "name": "Brazen Bones", "zone": "Toraimarai Canal"},
  {"slug": "mountain-worm-nm", "name": "Mountain Worm NM", "zone": "Uleguerand Range"},
  {"slug": "ocean-sahagin", "name": "Ocean Sahagin", "zone": "Sea Serpent Grotto"},
  {"slug": "charybdis", "name": "Charybdis", "zone": "Sea Serpent Grotto"},
  {"slug": "voluptuous-vivian", "name": "Voluptuous Vivian", "zone": "The Boyahda Tree"},
  {"slug": "bloodtear-baldurf", "name": "Bloodtear Baldurf", "zone": "La Theine Plateau"},
  {"slug": "steelfleece-baldarich", "name": "Steelfleece Baldarich", "zone": "Konschtat Highlands"},
  {"slug": "tonberry-kinq", "name": "Tonberry Kinq", "zone": "Temple of Uggalepih"},
  {"slug": "amikiri", "name": "Amikiri", "zone": "Gustav Tunnel"},
  {"slug": "eastern-shadow", "name": "Eastern Shadow", "zone": "Fei'Yin"},
  {"slug": "northern-shadow", "name": "Northern Shadow", "zone": "Fei'Yin"},
  {"slug": "southern-shadow", "name": "Southern Shadow", "zone": "Fei'Yin"},
  {"slug": "fradubio", "name": "Fradubio", "zone": "Jugner Forest"},
  {"slug": "aiatar", "name": "Aiatar", "zone": "Riverne-Site A01"}
]);
export function pickerNmBySlug(slug){ return PICKER_NMS.find(n=>n.slug===slug); }
