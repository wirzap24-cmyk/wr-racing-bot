// =====================================================
//  CONFIGURATION WR RACING — modifiable à volonté
//  Textes ajoutés automatiquement dans les devis et
//  les dossiers clients selon le type choisi.
// =====================================================

module.exports = {
  // ---------- FAISCEAUX ----------
  faisceau: {
    simplifie: {
      label: 'Simplifié homologué',
      tag: 'Simplifié homologué',
      avantages: [
        'Suppression des éléments inutiles : moins de risques de panne',
        'Câblage propre, fiable et facile à diagnostiquer',
        'Faisceau homologué',
        'Gain de place et de poids',
      ],
    },
    perso: {
      label: 'Personnalisé',
      tag: 'Personnalisé',
      avantages: [
        'Faisceau fabriqué sur mesure pour ta moto',
        'Choix des options et des couleurs',
        'Finition professionnelle et durable',
        'Installation propre et fiable',
      ],
    },
  },

  // ---------- PRÉPARATIONS MOTEUR ----------
  prepa: {
    s1: {
      label: 'Stage 1',
      tag: 'Stage 1',
      performances: [
        'Meilleures reprises',
        'Gain de vitesse de pointe',
        'Moteur plus vif à bas régime',
      ],
      avantages: [
        'Fiabilité conservée',
        'Budget maîtrisé',
        'Idéal pour un usage quotidien',
      ],
    },
    s2: {
      label: 'Stage 2',
      tag: 'Stage 2',
      performances: [
        'Gain de puissance net',
        'Montée en régime plus rapide',
        'Reprises nettement améliorées',
      ],
      avantages: [
        'Bon compromis puissance / fiabilité',
        'Pièces de qualité sélectionnées par WR Racing',
      ],
    },
    s3: {
      label: 'Stage 3',
      tag: 'Stage 3',
      performances: [
        'Puissance maximale',
        'Moteur orienté performance',
        'Réglages poussés',
      ],
      avantages: [
        'Préparation haut niveau',
        'Réglages sur mesure par WR Racing',
      ],
    },
    surmesure: {
      label: 'Sur mesure',
      tag: 'Sur mesure',
      performances: ['Selon les pièces et réglages définis avec le client'],
      avantages: ['Préparation 100 % adaptée à la demande du client'],
    },
  },

  // ---------- STATUTS (tags d'avancement) ----------
  statuts: [
    'En attente',
    'Devis en cours',
    'Envoyé',
    'Accepté',
    'Refusé',
    'Pièces commandées',
    'En atelier',
    'Terminé',
    'Livré',
  ],

  couleur: 0xe01b1b,
};
