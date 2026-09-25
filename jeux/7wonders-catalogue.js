'use strict';
// 7wonders-catalogue.js — Cartes et merveilles de 7 Wonders, NOUVELLE
// ÉDITION 2020. FICHIER GÉNÉRÉ par outils/catalogue-2020.js (sources et
// coûts non confirmés : voir ce script) — ne pas modifier à la main.
// Lettres des ressources : W bois, S pierre, O minerai, C argile, G verre,
// P papyrus, L tissu. Noms internes en anglais, noms français dans le client.
module.exports = {
  "AGE1": [
    {
      "name": "Clay Pit",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "O/C",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Clay Pool",
      "color": "BROWN",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "C",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Excavation",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "S/C",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Forest Cave",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "W/O",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 0,
        "5": 1,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Lumber Yard",
      "color": "BROWN",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "W",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Mine",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "S/O",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Ore Vein",
      "color": "BROWN",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "O",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Stone Pit",
      "color": "BROWN",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "S",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Timber Yard",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "W/S",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Tree Farm",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "W/C",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 1,
        "7": 1
      }
    },
    {
      "name": "Glassworks",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "G",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Loom",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "L",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Press",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "P",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "East Trading Post",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "discount": {
          "resourceTypes": "CSOW",
          "providers": [
            "RIGHT_PLAYER"
          ],
          "discountedPrice": 1
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Marketplace",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "discount": {
          "resourceTypes": "LGP",
          "providers": [
            "LEFT_PLAYER",
            "RIGHT_PLAYER"
          ]
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Tavern",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "gold": 5
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 3
      }
    },
    {
      "name": "West Trading Post",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "discount": {
          "resourceTypes": "CSOW",
          "providers": [
            "LEFT_PLAYER"
          ],
          "discountedPrice": 1
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Altar",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "points": 3
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Baths",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "S"
      },
      "effect": {
        "points": 3
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Theater",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "points": 3
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Apothecary",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "L"
      },
      "effect": {
        "science": "COMPASS"
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Scriptorium",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "P"
      },
      "effect": {
        "science": "TABLET"
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Workshop",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "G"
      },
      "effect": {
        "science": "WHEEL"
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Barracks",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "O"
      },
      "effect": {
        "military": 1
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Guard Tower",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "C"
      },
      "effect": {
        "military": 1
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Stockade",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "W"
      },
      "effect": {
        "military": 1
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Well",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "points": 3
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      },
      "unconfirmedCost": true
    }
  ],
  "AGE2": [
    {
      "name": "Brickyard",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "CC",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Foundry",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "OO",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Quarry",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "SS",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Sawmill",
      "color": "BROWN",
      "cost": {
        "gold": 1,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "WW",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Glassworks",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "G",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Loom",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "L",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Press",
      "color": "GREY",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "production": {
          "resources": "P",
          "isSellable": true
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Bazar",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF",
            "LEFT",
            "RIGHT"
          ],
          "gold": 2,
          "type": "CARD",
          "colors": [
            "GREY"
          ]
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Caravansery",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "WW"
      },
      "effect": {
        "production": {
          "resources": "W/S/O/C",
          "isSellable": false
        }
      },
      "chainParents": [
        "Marketplace"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 3,
        "7": 3
      }
    },
    {
      "name": "Forum",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "CC"
      },
      "effect": {
        "production": {
          "resources": "G/P/L",
          "isSellable": false
        }
      },
      "chainParents": [
        "East Trading Post",
        "West Trading Post"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 3
      }
    },
    {
      "name": "Vineyard",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": ""
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF",
            "LEFT",
            "RIGHT"
          ],
          "gold": 1,
          "type": "CARD",
          "colors": [
            "BROWN"
          ]
        }
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Aqueduct",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "SSS"
      },
      "effect": {
        "points": 5
      },
      "chainParents": [
        "Baths"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Courthouse",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "CCL"
      },
      "effect": {
        "points": 4
      },
      "chainParents": [
        "Scriptorium"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Statue",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "WOO"
      },
      "effect": {
        "points": 4
      },
      "chainParents": [
        "Well"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Temple",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "WCG"
      },
      "effect": {
        "points": 4
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Dispensary",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "OOG"
      },
      "effect": {
        "science": "COMPASS"
      },
      "chainParents": [
        "Apothecary"
      ],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Laboratory",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "CCP"
      },
      "effect": {
        "science": "WHEEL"
      },
      "chainParents": [
        "Workshop"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Library",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "SSL"
      },
      "effect": {
        "science": "TABLET"
      },
      "chainParents": [
        "Scriptorium"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "School",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "WP"
      },
      "effect": {
        "science": "TABLET"
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Archery Range",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "WWO"
      },
      "effect": {
        "military": 2
      },
      "chainParents": [
        "Workshop"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Stables",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "WOC"
      },
      "effect": {
        "military": 2
      },
      "chainParents": [
        "Apothecary"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Training Ground",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "WOO"
      },
      "effect": {
        "military": 2
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 3
      }
    },
    {
      "name": "Walls",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "SSS"
      },
      "effect": {
        "military": 2
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    }
  ],
  "AGE3": [
    {
      "name": "Arena",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "SSO"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "BUILT_WONDER_STAGES",
          "gold": 3,
          "points": 1
        }
      },
      "chainParents": [
        "Dispensary"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Chamber of Commerce",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "CCP"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "CARD",
          "gold": 2,
          "points": 2,
          "colors": [
            "GREY"
          ]
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Haven",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "WOL"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "CARD",
          "gold": 1,
          "points": 1,
          "colors": [
            "BROWN"
          ]
        }
      },
      "chainParents": [
        "Forum"
      ],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Lighthouse",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "SG"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "CARD",
          "gold": 1,
          "points": 1,
          "colors": [
            "YELLOW"
          ]
        }
      },
      "chainParents": [
        "Caravansery"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Gardens",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "WCC"
      },
      "effect": {
        "points": 5
      },
      "chainParents": [
        "Theater"
      ],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Palace",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "WSOCGPL"
      },
      "effect": {
        "points": 8
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Pantheon",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "OCCGPL"
      },
      "effect": {
        "points": 7
      },
      "chainParents": [
        "Altar"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Senate",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "WWSO"
      },
      "effect": {
        "points": 6
      },
      "chainParents": [
        "Library"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Town Hall",
      "color": "BLUE",
      "cost": {
        "gold": 0,
        "res": "SSOG"
      },
      "effect": {
        "points": 6
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Academy",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "SSSG"
      },
      "effect": {
        "science": "COMPASS"
      },
      "chainParents": [
        "School"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Lodge",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "CCPL"
      },
      "effect": {
        "science": "COMPASS"
      },
      "chainParents": [
        "Dispensary"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Observatory",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "OOGL"
      },
      "effect": {
        "science": "WHEEL"
      },
      "chainParents": [
        "Laboratory"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Study",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "WPL"
      },
      "effect": {
        "science": "WHEEL"
      },
      "chainParents": [
        "School"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "University",
      "color": "GREEN",
      "cost": {
        "gold": 0,
        "res": "WWGP"
      },
      "effect": {
        "science": "TABLET"
      },
      "chainParents": [
        "Library"
      ],
      "counts": {
        "3": 1,
        "4": 2,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Arsenal",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "WWOL"
      },
      "effect": {
        "military": 3
      },
      "chainParents": [],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Circus",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "SSSO"
      },
      "effect": {
        "military": 3
      },
      "chainParents": [
        "Training Ground"
      ],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Fortifications",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "OOOC"
      },
      "effect": {
        "military": 3
      },
      "chainParents": [
        "Walls"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Siege Workshop",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "WCCC"
      },
      "effect": {
        "military": 3
      },
      "chainParents": [
        "Laboratory"
      ],
      "counts": {
        "3": 1,
        "4": 1,
        "5": 2,
        "6": 2,
        "7": 2
      }
    },
    {
      "name": "Ludus",
      "color": "YELLOW",
      "cost": {
        "gold": 0,
        "res": "SO"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "CARD",
          "colors": [
            "RED"
          ],
          "gold": 3,
          "points": 1
        }
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 0,
        "5": 1,
        "6": 1,
        "7": 2
      }
    },
    {
      "name": "Castrum",
      "color": "RED",
      "cost": {
        "gold": 0,
        "res": "CCWP"
      },
      "effect": {
        "military": 3
      },
      "chainParents": [],
      "counts": {
        "3": 0,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 2
      },
      "unconfirmedCost": true
    }
  ],
  "GUILDS": [
    {
      "name": "Builders Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "SSSCCG"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "SELF",
            "RIGHT"
          ],
          "type": "BUILT_WONDER_STAGES",
          "points": 1
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Craftsmens Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "SSOO"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 2,
          "colors": [
            "GREY"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Magistrates Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "WWWSL"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "BLUE"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Philosophers Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "CCCPL"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "GREEN"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Scientists Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "WWOOP"
      },
      "effect": {
        "science": "any"
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Shipowners Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "WWWGP"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "SELF"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "BROWN",
            "GREY",
            "PURPLE"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Spies Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "CCG"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "RED"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Traders Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "GPL"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "YELLOW"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Workers Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "WSOOC"
      },
      "effect": {
        "perBoardElement": {
          "boards": [
            "LEFT",
            "RIGHT"
          ],
          "type": "CARD",
          "points": 1,
          "colors": [
            "BROWN"
          ]
        }
      },
      "chainParents": [],
      "counts": {}
    },
    {
      "name": "Decorators Guild",
      "color": "PURPLE",
      "cost": {
        "gold": 0,
        "res": "OOSL"
      },
      "effect": {
        "completedWonderPoints": 7
      },
      "chainParents": [],
      "counts": {}
    }
  ],
  "WONDERS": [
    {
      "name": "Alexandria",
      "sides": {
        "A": {
          "initialResource": "G",
          "stages": [
            {
              "cost": "SS",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "OO",
              "effect": {
                "production": {
                  "resources": "W/S/O/C",
                  "isSellable": false
                }
              }
            },
            {
              "cost": "PL",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "G",
          "stages": [
            {
              "cost": "CC",
              "effect": {
                "production": {
                  "resources": "W/S/O/C",
                  "isSellable": false
                }
              }
            },
            {
              "cost": "OOO",
              "effect": {
                "production": {
                  "resources": "G/P/L",
                  "isSellable": false
                }
              }
            },
            {
              "cost": "WWWW",
              "effect": {
                "points": 7
              }
            }
          ]
        }
      }
    },
    {
      "name": "Babylon",
      "sides": {
        "A": {
          "initialResource": "W",
          "stages": [
            {
              "cost": "CC",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "OOL",
              "effect": {
                "science": "any"
              }
            },
            {
              "cost": "WWWW",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "W",
          "stages": [
            {
              "cost": "SS",
              "effect": {
                "action": "PLAY_LAST_CARD"
              }
            },
            {
              "cost": "CCCG",
              "effect": {
                "science": "any"
              }
            }
          ]
        }
      }
    },
    {
      "name": "Ephesos",
      "sides": {
        "A": {
          "initialResource": "P",
          "stages": [
            {
              "cost": "CC",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "WW",
              "effect": {
                "gold": 9
              }
            },
            {
              "cost": "OOG",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "P",
          "stages": [
            {
              "cost": "SS",
              "effect": {
                "gold": 4,
                "points": 2
              }
            },
            {
              "cost": "WW",
              "effect": {
                "gold": 4,
                "points": 3
              }
            },
            {
              "cost": "OOL",
              "effect": {
                "gold": 4,
                "points": 5
              }
            }
          ]
        }
      }
    },
    {
      "name": "Gizah",
      "sides": {
        "A": {
          "initialResource": "S",
          "stages": [
            {
              "cost": "WW",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "CCL",
              "effect": {
                "points": 5
              }
            },
            {
              "cost": "SSSS",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "S",
          "stages": [
            {
              "cost": "WW",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "SSS",
              "effect": {
                "points": 5
              }
            },
            {
              "cost": "CCC",
              "effect": {
                "points": 5
              }
            },
            {
              "cost": "SSSSP",
              "effect": {
                "points": 7
              }
            }
          ]
        }
      }
    },
    {
      "name": "Halikarnassus",
      "sides": {
        "A": {
          "initialResource": "L",
          "stages": [
            {
              "cost": "OO",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "GP",
              "effect": {
                "action": "PLAY_DISCARDED"
              }
            },
            {
              "cost": "SSS",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "L",
          "stages": [
            {
              "cost": "CC",
              "effect": {
                "points": 2,
                "action": "PLAY_DISCARDED"
              }
            },
            {
              "cost": "GP",
              "effect": {
                "points": 1,
                "action": "PLAY_DISCARDED"
              }
            },
            {
              "cost": "WWW",
              "effect": {
                "action": "PLAY_DISCARDED"
              }
            }
          ]
        }
      }
    },
    {
      "name": "Olympia",
      "sides": {
        "A": {
          "initialResource": "C",
          "stages": [
            {
              "cost": "SS",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "WW",
              "effect": {
                "action": "FIRST_OF_COLOR_FREE"
              }
            },
            {
              "cost": "CCC",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "C",
          "stages": [
            {
              "cost": "OO",
              "effect": {
                "points": 2,
                "action": "FIRST_OF_AGE_FREE"
              }
            },
            {
              "cost": "CCC",
              "effect": {
                "points": 3,
                "action": "LAST_OF_AGE_FREE"
              }
            },
            {
              "cost": "GPL",
              "effect": {
                "points": 5
              }
            }
          ]
        }
      }
    },
    {
      "name": "Rhodos",
      "sides": {
        "A": {
          "initialResource": "O",
          "stages": [
            {
              "cost": "WW",
              "effect": {
                "points": 3
              }
            },
            {
              "cost": "CCC",
              "effect": {
                "military": 2
              }
            },
            {
              "cost": "OOOO",
              "effect": {
                "points": 7
              }
            }
          ]
        },
        "B": {
          "initialResource": "O",
          "stages": [
            {
              "cost": "SSS",
              "effect": {
                "gold": 3,
                "military": 1,
                "points": 3
              }
            },
            {
              "cost": "OOOO",
              "effect": {
                "gold": 4,
                "military": 1,
                "points": 4
              }
            }
          ]
        }
      }
    }
  ]
};
