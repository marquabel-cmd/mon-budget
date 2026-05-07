(function(){
  const key = Object.keys(localStorage).find(k => k.startsWith('budget_data_'));
  if (!key) { console.error('Clé budget introuvable'); return; }
  const data = JSON.parse(localStorage.getItem(key));
  const map = {
  "carburant_0_92.56_1": {
    "day": 8,
    "method": "carte"
  },
  "carburant_0_89.09_1": {
    "day": 19,
    "method": "carte"
  },
  "carburant_0_81.12_1": {
    "day": 30,
    "method": "carte"
  },
  "carburant_1_87.49_1": {
    "day": 9,
    "method": "carte"
  },
  "carburant_1_98.1_1": {
    "day": 23,
    "method": "carte"
  },
  "carburant_2_94.29_1": {
    "day": 2,
    "method": "carte"
  },
  "carburant_2_113.88_1": {
    "day": 18,
    "method": "carte"
  },
  "carburant_2_109.44_1": {
    "day": 31,
    "method": "carte"
  },
  "carburant_3_89.38_1": {
    "day": 7,
    "method": "carte"
  },
  "courses_0_35.76_1": {
    "comment": "lidl",
    "day": 2,
    "method": "carte"
  },
  "courses_0_107.85_1": {
    "comment": "lidl",
    "day": 6,
    "method": "carte"
  },
  "courses_0_4_1": {
    "comment": "la gailliarde",
    "day": 9,
    "method": "repas"
  },
  "courses_0_2.98_1": {
    "comment": "lidl",
    "day": 9,
    "method": "repas"
  },
  "courses_0_63.88_1": {
    "comment": "lidl",
    "day": 16,
    "method": "carte"
  },
  "courses_0_28.22_1": {
    "comment": "lidl",
    "day": 16,
    "method": "repas"
  },
  "courses_0_40_1": {
    "comment": "crasse",
    "day": 16,
    "method": "carte"
  },
  "courses_0_19.88_1": {
    "comment": "renmans",
    "day": 23,
    "method": "carte"
  },
  "courses_0_16.3_1": {
    "comment": "hennau",
    "day": 23,
    "method": "carte"
  },
  "courses_0_6.84_1": {
    "comment": "reimans",
    "day": 29,
    "method": "carte"
  },
  "courses_0_40.39_1": {
    "comment": "lidl",
    "day": 30,
    "method": "carte"
  },
  "courses_0_4.8_1": {
    "comment": "friterie",
    "day": 11,
    "method": "repas"
  },
  "courses_1_4.95_1": {
    "comment": "Pomme de terre frite la gailliarde",
    "day": 3,
    "method": "carte"
  },
  "courses_1_9.7_1": {
    "comment": "vandercammen mokka",
    "day": 3,
    "method": "carte"
  },
  "courses_1_118.94_1": {
    "comment": "lidl",
    "day": 3,
    "method": "carte"
  },
  "courses_1_23.43_1": {
    "comment": "lidl",
    "day": 6,
    "method": "carte"
  },
  "courses_1_16.78_1": {
    "comment": "delhaise",
    "day": 8,
    "method": "carte"
  },
  "courses_1_28.45_1": {
    "comment": "intyermarchÃ©",
    "day": 10,
    "method": "carte"
  },
  "courses_1_40.81_1": {
    "comment": "colruyt",
    "day": 10,
    "method": "carte"
  },
  "courses_1_68.41_1": {
    "comment": "aldi",
    "day": 11,
    "method": "carte"
  },
  "courses_1_17.11_1": {
    "comment": "lidl",
    "day": 13,
    "method": "repas"
  },
  "courses_1_1.19_1": {
    "comment": "lidl",
    "day": 14,
    "method": "repas"
  },
  "courses_1_6.5_1": {
    "comment": "vert jardin",
    "day": 18,
    "method": "carte"
  },
  "courses_1_2.09_1": {
    "comment": "boisson retour de la marche",
    "day": 18,
    "method": "carte"
  },
  "courses_1_38.62_1": {
    "comment": "lidl",
    "day": 20,
    "method": "repas"
  },
  "courses_1_9.99_1": {
    "comment": "lidl",
    "day": 20,
    "method": "carte"
  },
  "courses_1_24.8_1": {
    "comment": "friterie",
    "day": 22,
    "method": "repas"
  },
  "courses_1_7.9_1": {
    "comment": "asndwich anthÃ©e",
    "day": 25,
    "method": "repas"
  },
  "courses_1_25.2_1": {
    "comment": "carrefour boulogne sur mer",
    "day": 26,
    "method": "carte"
  },
  "courses_1_10.35_1": {
    "comment": "Pharmacie colle dentier",
    "day": 27,
    "method": "carte"
  },
  "courses_1_14.2_1": {
    "comment": "boulangerie hennau",
    "day": 15,
    "method": "repas"
  },
  "courses_1_5_1": {
    "comment": "take eat",
    "day": 18,
    "method": "repas"
  },
  "courses_1_16.43_1": {
    "comment": "intermarchÃ© anthee",
    "day": 19,
    "method": "repas"
  },
  "courses_2_23_1": {
    "comment": "Delhaize",
    "day": 3,
    "method": "repas"
  },
  "courses_2_23.04_1": {
    "comment": "reimans",
    "day": 4,
    "method": "repas"
  },
  "courses_2_22.09_1": {
    "comment": "reinmans fosse la ville",
    "day": 4,
    "method": "repas"
  },
  "courses_2_3.03_1": {
    "comment": "alfi fosse la ville",
    "day": 4,
    "method": "repas"
  },
  "courses_2_66.89_1": {
    "comment": "lidl",
    "day": 6,
    "method": "repas"
  },
  "courses_2_1.49_1": {
    "comment": "lidl",
    "day": 6,
    "method": "carte"
  },
  "courses_2_53.77_1": {
    "comment": "lidl",
    "day": 13,
    "method": "repas"
  },
  "courses_2_40.75_1": {
    "comment": "intermarchÃ© assesse",
    "day": 19,
    "method": "carte"
  },
  "courses_2_100_1": {
    "comment": "intermarchÃ© assesse",
    "day": 19,
    "method": "repas"
  },
  "courses_2_5.98_1": {
    "comment": "aldi",
    "day": 19,
    "method": "carte"
  },
  "courses_2_56.49_1": {
    "comment": "la guaiarde",
    "day": 20,
    "method": "carte"
  },
  "courses_2_26.08_1": {
    "comment": "lidl",
    "day": 20,
    "method": "carte"
  },
  "courses_2_70.66_1": {
    "comment": "reimans",
    "day": 21,
    "method": "carte"
  },
  "courses_2_94.96_1": {
    "comment": "Vin et rhum anniversaire",
    "day": 21,
    "method": "carte"
  },
  "courses_2_40_1": {
    "comment": "Tarte mondelez",
    "day": 28,
    "method": "liquide"
  },
  "courses_2_54.73_1": {
    "comment": "lidl",
    "day": 27,
    "method": "carte"
  },
  "courses_3_3.6_1": {
    "comment": "takeeat",
    "day": 1,
    "method": "carte"
  },
  "courses_3_2.85_1": {
    "comment": "boisson balade",
    "day": 1,
    "method": "carte"
  },
  "courses_3_20.5_1": {
    "comment": "intermarchÃ©",
    "day": 3,
    "method": "repas"
  },
  "courses_3_4.75_1": {
    "comment": "station service",
    "day": 7,
    "method": "repas"
  },
  "courses_3_7.61_1": {
    "comment": "carrefour fosse la ville",
    "method": "repas"
  },
  "courses_3_3.99_1": {
    "comment": "aldi",
    "day": 10,
    "method": "carte"
  },
  "courses_3_94.1_1": {
    "comment": "aldi",
    "day": 10,
    "method": "repas"
  },
  "courses_3_6.2_1": {
    "comment": "image",
    "day": 11,
    "method": "repas"
  },
  "divers_0_9.99_1": {
    "comment": "frais bancaire",
    "day": 1,
    "method": "carte"
  },
  "divers_0_199.28_1": {
    "comment": "Dentiste avant remboursement mutuelle",
    "day": 6,
    "method": "carte"
  },
  "divers_0_-177.28_1": {
    "comment": "remboursement mutuelle",
    "day": 9,
    "method": "carte"
  },
  "divers_0_10.95_1": {
    "comment": "Pharmacie bain de bouche et ibuprofen",
    "day": 6,
    "method": "carte"
  },
  "divers_0_1.49_1": {
    "comment": "Yesss gratoire parebrise",
    "day": 6,
    "method": "carte"
  },
  "divers_0_7.79_1": {
    "comment": "Mr bricolage lave glace voiture",
    "day": 6,
    "method": "carte"
  },
  "divers_0_27_1": {
    "comment": "crasse",
    "day": 7,
    "method": "carte"
  },
  "divers_0_12.35_1": {
    "comment": "Timbre Bpost",
    "day": 9,
    "method": "carte"
  },
  "divers_0_12_1": {
    "comment": "crasse",
    "day": 11,
    "method": "carte"
  },
  "divers_0_268.1_1": {
    "comment": "dentiste extraction avant remboursement mutuelle",
    "day": 12,
    "method": "carte"
  },
  "divers_0_-238.6_1": {
    "comment": "remboursement mutuelle",
    "day": 15,
    "method": "carte"
  },
  "divers_0_4.8_1": {
    "comment": "boisson friterie mettet",
    "day": 11,
    "method": "repas"
  },
  "divers_0_21.2_1": {
    "comment": "friterie",
    "day": 17,
    "method": "carte"
  },
  "divers_0_40.32_1": {
    "comment": "Temu",
    "day": 19,
    "method": "carte"
  },
  "divers_0_46.7_1": {
    "comment": "pizza hut",
    "day": 21,
    "method": "carte"
  },
  "divers_0_66.46_1": {
    "comment": "bent chaussure",
    "day": 21,
    "method": "carte"
  },
  "divers_0_35.05_1": {
    "comment": "luxus chaussure",
    "day": 21,
    "method": "carte"
  },
  "divers_0_149.13_1": {
    "comment": "cartouche encres brother",
    "day": 19,
    "method": "carte"
  },
  "divers_0_75_1": {
    "comment": "ophtalmo",
    "day": 22,
    "method": "carte"
  },
  "divers_0_-38.45_1": {
    "comment": "remboursement ophtalmo",
    "day": 27,
    "method": "carte"
  },
  "divers_0_735.99_1": {
    "comment": "acomptes dentier justine peret 22/01/26 200â¬ 29/01/26 200â¬ 05/02/26 335,99â¬ solde",
    "method": "carte"
  },
  "divers_0_-582.99_1": {
    "comment": "remboursement mutuelle dentier 09/02/26",
    "method": "carte"
  },
  "divers_0_23_1": {
    "comment": "coiffeur",
    "day": 23,
    "method": "carte"
  },
  "divers_0_15.5_1": {
    "comment": "crasse",
    "day": 23,
    "method": "carte"
  },
  "divers_0_2.49_1": {
    "comment": "pile action",
    "day": 27,
    "method": "carte"
  },
  "divers_0_22.4_1": {
    "comment": "take eat",
    "day": 29,
    "method": "carte"
  },
  "divers_0_43.19_1": {
    "comment": "pathÃ© chaleroix film femme de mÃ©nage",
    "day": 31,
    "method": "carte"
  },
  "divers_1_4.5_1": {
    "comment": "frais bancaire",
    "day": 1,
    "method": "carte"
  },
  "divers_1_18_1": {
    "comment": "crasse",
    "day": 1,
    "method": "carte"
  },
  "divers_1_1347_1": {
    "comment": "04/02 acompte lunette 150â¬ 12/02 solde lunette 1197â¬",
    "method": "carte"
  },
  "divers_1_11.2_1": {
    "comment": "McDo",
    "day": 5,
    "method": "carte"
  },
  "divers_1_175_1": {
    "comment": "06 acompte st valentin 50â¬ 20 soldes 125â¬",
    "method": "carte"
  },
  "divers_1_31_1": {
    "comment": "crasse 2*",
    "day": 6,
    "method": "carte"
  },
  "divers_1_71.26_1": {
    "comment": "Pharmacie",
    "day": 6,
    "method": "carte"
  },
  "divers_1_504.73_1": {
    "comment": "contribution",
    "day": 6,
    "method": "carte"
  },
  "divers_1_464.42_1": {
    "comment": "lxd cars",
    "day": 6,
    "method": "carte"
  },
  "divers_1_11.5_1": {
    "comment": "bonbon cinema gumgum",
    "day": 6,
    "method": "carte"
  },
  "divers_1_18_2": {
    "comment": "Crasse",
    "day": 13,
    "method": "carte"
  },
  "divers_1_23_1": {
    "comment": "coiffeur",
    "day": 23,
    "method": "carte"
  },
  "divers_1_29.99_1": {
    "comment": "grignoteuse coupe metal lidl 13",
    "method": "carte"
  },
  "divers_1_15.5_1": {
    "comment": "crasse",
    "day": 13,
    "method": "carte"
  },
  "divers_1_6.53_1": {
    "comment": "piles action",
    "day": 24,
    "method": "carte"
  },
  "divers_1_38_1": {
    "comment": "restaurant boulogne sur mer",
    "day": 26,
    "method": "carte"
  },
  "divers_1_14.5_1": {
    "comment": "crasse",
    "day": 26,
    "method": "carte"
  },
  "divers_1_6.5_1": {
    "comment": "friterie",
    "day": 27,
    "method": "carte"
  },
  "divers_1_10.59_1": {
    "comment": "image ciney",
    "day": 28,
    "method": "repas"
  },
  "divers_2_4.5_1": {
    "comment": "frais bancaire",
    "day": 1,
    "method": "carte"
  },
  "divers_2_25_1": {
    "comment": "Anniversaire Christine verser sur le compte de Vanessa",
    "day": 2,
    "method": "carte"
  },
  "divers_2_16.5_1": {
    "comment": "crasse",
    "day": 3,
    "method": "carte"
  },
  "divers_2_23_1": {
    "comment": "coiffeur",
    "day": 6,
    "method": "carte"
  },
  "divers_2_21.2_1": {
    "comment": "friterie la rÃ©crÃ©",
    "day": 6,
    "method": "carte"
  },
  "divers_2_29_1": {
    "comment": "crasses",
    "day": 6,
    "method": "carte"
  },
  "divers_2_22_1": {
    "comment": "adeps hamois",
    "day": 8,
    "method": "carte"
  },
  "divers_2_20_1": {
    "comment": "crasses",
    "day": 11,
    "method": "carte"
  },
  "divers_2_60_1": {
    "comment": "Pharmacie",
    "day": 12,
    "method": "carte"
  },
  "divers_2_16.5_2": {
    "comment": "Crasse",
    "day": 13,
    "method": "carte"
  },
  "divers_2_12_1": {
    "comment": "crasses",
    "day": 17,
    "method": "carte"
  },
  "divers_2_20_2": {
    "comment": "apÃ©ro SÃ©bastien",
    "method": "carte"
  },
  "divers_2_6.5_1": {
    "comment": "friterie",
    "day": 21,
    "method": "carte"
  },
  "divers_2_10_1": {
    "comment": "take eat",
    "day": 21,
    "method": "carte"
  },
  "divers_2_10_2": {
    "comment": "take eat",
    "day": 25,
    "method": "carte"
  },
  "divers_2_7_1": {
    "comment": "vert jardin",
    "day": 26,
    "method": "carte"
  },
  "divers_2_23_2": {
    "comment": "Coiffeur",
    "day": 27,
    "method": "carte"
  },
  "divers_2_20.1_1": {
    "comment": "Clinique st luc gastro anterologue du 02/12",
    "day": 27,
    "method": "carte"
  },
  "divers_2_54.73_1": {
    "comment": "lidl",
    "day": 27,
    "method": "carte"
  },
  "divers_2_14.5_1": {
    "comment": "crasse",
    "day": 29,
    "method": "carte"
  },
  "divers_2_6.5_2": {
    "comment": "vert jardin",
    "day": 28,
    "method": "carte"
  },
  "divers_2_6_1": {
    "comment": "mcdo",
    "day": 31,
    "method": "carte"
  },
  "divers_3_4.5_1": {
    "comment": "frais bancaire",
    "day": 1,
    "method": "carte"
  },
  "divers_3_10_1": {
    "comment": "crasse",
    "day": 3,
    "method": "carte"
  },
  "divers_3_29_1": {
    "comment": "Hamburger Biesme",
    "day": 3,
    "method": "carte"
  },
  "divers_3_10_2": {
    "comment": "crasse",
    "day": 6,
    "method": "carte"
  },
  "divers_3_31.95_1": {
    "comment": "yesss",
    "day": 10,
    "method": "carte"
  },
  "divers_3_22_1": {
    "comment": "take eat",
    "day": 10,
    "method": "carte"
  },
  "divers_3_90_1": {
    "comment": "IPTV",
    "day": 12,
    "method": "liquide"
  },
  "chien_0_141.11_1": {
    "comment": "croquettes zooplus",
    "day": 15,
    "method": "carte"
  },
  "chien_0_68.57_1": {
    "comment": "Temu protection siÃ¨ge et coffre",
    "day": 19,
    "method": "carte"
  },
  "chien_0_61.8_1": {
    "comment": "Temu - pannier 2 - sangle siÃ¨ge - couverture couvre siÃ¨ge",
    "day": 31,
    "method": "carte"
  },
  "chien_1_99.71_1": {
    "comment": "vÃ©tÃ©rinaire blessure pendant la balade, il ne posait plus la patte arriÃ¨re droite muscle rond du bassin certainement touchÃ©. AprÃ¨s 48h c'est redevenu +- normale mais repos pendant 10jours",
    "day": 10,
    "method": "carte"
  },
  "chien_1_21_1": {
    "comment": "Tapis portes aldi",
    "day": 14,
    "method": "carte"
  },
  "chien_1_15.44_1": {
    "comment": "poils et plumes",
    "day": 24,
    "method": "carte"
  },
  "chien_2_138.53_1": {
    "comment": "harnais laisse et colier",
    "day": 9,
    "method": "carte"
  },
  "chien_2_61.72_1": {
    "comment": "Vermifuge",
    "method": "carte"
  },
  "chien_3_10.84_1": {
    "comment": "bonbon + oreilles",
    "day": 3,
    "method": "carte"
  }
};
  let ok=0, skip=0;
  ['carburant','courses','divers','chien'].forEach(cat => {
    const counts = {};
    (data['2026'].vars[cat] || []).forEach(t => {
      const base = cat+'_'+t.month+'_'+Math.round(t.amount*100)/100;
      counts[base] = (counts[base]||0)+1;
      const e = map[base+'_'+counts[base]];
      if (e) {
        if (e.comment !== undefined) t.comment = e.comment;
        if (e.method  !== undefined) t.method  = e.method;
        if (e.day     !== undefined) t.date    = e.day;
        ok++;
      } else { skip++; }
    });
  });
  localStorage.setItem(key, JSON.stringify(data));
  console.log('✅ '+ok+' mises à jour, '+skip+' sans correspondance');
  location.reload();
})();