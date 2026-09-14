/* ================= Échelle des Contes Malveillants =================
   Calculateur d'équilibrage DD — règles, expertises et exemples, portés
   depuis l'artefact « Équilibrage des expertises ». Logique pure, sans
   DOM : les composants React s'en servent pour calculer et afficher. */

export const STATS = ['Force', 'Mystique', 'Perception', 'Adresse', 'Esprit', 'Constitution'];
export const ABBR = { Force: 'For', Mystique: 'Mys', Perception: 'Per', Adresse: 'Adr', Esprit: 'Esp', Constitution: 'Con' };
export const SENSES = { Toucher: { Perception: 0.33 }, 'Ouïe': { Perception: 0.33 }, Vue: { Perception: 0.33 } };

export const EXP = [
  { fam: 'Filouterie', name: 'Discrétion', c: { Adresse: 0.25, Esprit: 0.25, Perception: 0.25 } },
  { fam: 'Filouterie', name: 'Déguisement', c: { Adresse: 0.33, Esprit: 0.33, Perception: 0.33 } },
  { fam: 'Filouterie', name: 'Vol-à-la-tire', c: { Perception: 0.5, Adresse: 0.5 } },
  { fam: 'Filouterie', name: 'Crochetage', c: { Adresse: 0.33, Perception: 0.33 }, s: { Toucher: 0.25, 'Ouïe': 0.25 } },
  { fam: 'Filouterie', name: 'Escamotage', c: { Adresse: 0.25, Perception: 0.25 }, s: { Toucher: 0.25, 'Ouïe': 0.125, Vue: 0.125 } },
  { fam: 'Filouterie', name: 'Évasion', c: { Adresse: 0.25, Esprit: 0.125, Perception: 0.125, Force: 0.16 } },
  { fam: 'Filouterie', name: 'Sabotage', c: { Adresse: 0.33, Perception: 0.33, Esprit: 0.33 } },
  { fam: 'Athlétisme', name: 'Puissance', c: { Force: 1, Adresse: 0.25 } },
  { fam: 'Athlétisme', name: 'Projection', c: { Force: 1, Adresse: 0.25, Perception: 0.25, Constitution: 0.25 } },
  { fam: 'Athlétisme', name: 'Prise', c: { Force: 1, Esprit: 0.16, Perception: 0.16, Constitution: 0.25, Adresse: 0.25 } },
  { fam: 'Athlétisme', name: 'Équilibre', c: { Adresse: 0.25, Perception: 0.16 } },
  { fam: 'Athlétisme', name: 'Acrobaties', c: { Adresse: 0.25, Perception: 0.25, Force: 0.25 } },
  { fam: 'Athlétisme', name: 'Escalade', c: { Force: 0.25, Adresse: 0.25, Perception: 0.25 } },
  { fam: 'Athlétisme', name: 'Résistances', c: { Constitution: 0.33, Esprit: 0.16 } },
  { fam: 'Athlétisme', name: 'Endurance', c: { Constitution: 0.33 } },
  { fam: 'Athlétisme', name: 'Course', c: { Force: 0.25, Adresse: 0.25 } },
  { fam: 'Athlétisme', name: 'Nage', c: { Force: 0.5, Adresse: 0.25 } },
  { fam: 'Observation', name: 'Vue', c: { Perception: 0.33 } },
  { fam: 'Observation', name: 'Odorat-Goût', c: { Perception: 0.33 } },
  { fam: 'Observation', name: 'Ouïe', c: { Perception: 0.33 } },
  { fam: 'Observation', name: 'Toucher', c: { Perception: 0.33 } },
  { fam: 'Observation', name: 'Investigation', c: { Esprit: 0.25, Perception: 0.33 } },
  { fam: 'Observation', name: 'Élémentaire', c: { Esprit: 0.25, Mystique: 0.25, Perception: 0.16 } },
  { fam: 'Observation', name: 'Cosmique', c: { Esprit: 0.25, Mystique: 0.25, Perception: 0.16 } }
];

// Exemple d'action par expertise, un par palier : [PIAR, Anodin, Enfantin, Trivial,
// Ext.facile, Très facile, Facile, Assez facile, Moyen, Assez difficile, Difficile,
// Très difficile, Presque impossible, Impossible].
export const EXAMPLES = {
  'Discrétion': [
    'Se tapir dans le noir complet, aucun observateur à portée.',
    'Se cacher derrière un mur alors que personne ne cherche.',
    'Marcher sans bruit sur un tapis épais, dans une maison endormie.',
    'Rester immobile dans l’ombre pendant qu’un garde somnole.',
    'Longer un couloir sombre pendant qu’un garde bavarde, dos tourné.',
    'Traverser une pièce sombre pendant qu’un domestique s’affaire, dos tourné.',
    'Se glisser hors d’une pièce pendant une fête bruyante.',
    'Suivre quelqu’un à distance dans une rue peu fréquentée.',
    'Traverser une salle éclairée en profitant du passage d’un chariot.',
    'Traverser une cour au crépuscule sous l’œil d’une sentinelle lasse.',
    'Filer une cible dans une rue animée sans se faire repérer.',
    'Franchir une cour dégagée en plein jour sous l’œil de sentinelles.',
    'Passer à un mètre d’un traqueur aux sens affûtés, sur du gravier.',
    'Disparaître du regard de quelqu’un qui vous fixe, à découvert.'
  ],
  'Déguisement': [
    'Enfiler une cape trouvée et se fondre dans une foule de passage.',
    'Passer inaperçu parmi des inconnus en changeant de manteau.',
    'Se faire prendre pour un badaud dans une foule de fête.',
    'Rabattre une capuche pour ne pas être reconnu de loin.',
    'Passer pour un serviteur parmi d’autres dans une grande maisonnée.',
    'Passer pour un paysan de plus sur le chemin du marché.',
    'Tromper un badaud pressé avec un uniforme emprunté.',
    'Tromper un aubergiste pressé avec un accent emprunté.',
    'Se faire passer pour un marchand devant un garde peu regardant.',
    'Se faire passer pour un pèlerin devant un garde de porte peu curieux.',
    'Tenir le rôle d’un officier lors d’une inspection de routine.',
    'Passer un interrogatoire serré sous une fausse identité.',
    'Se faire passer pour un dignitaire connu devant sa propre cour.',
    'Tromper quelqu’un qui connaît intimement la personne imitée.'
  ],
  'Vol-à-la-tire': [
    'Ramasser une bourse tombée pendant que son propriétaire regarde ailleurs.',
    'Ramasser une pièce tombée aux pieds d’un ivrogne endormi.',
    'Vider la bourse d’un homme évanoui, seul dans une ruelle.',
    'Prendre une pomme sur l’étal d’un marchand qui sert un client.',
    'Délester un ivrogne assoupi de sa monnaie.',
    'Délester un dormeur d’un objet posé près de lui.',
    'Prendre un mouchoir dans la poche d’un promeneur distrait.',
    'Subtiliser une bourse pendue à la ceinture d’un badaud absorbé.',
    'Subtiliser une bourse dans la cohue d’un marché.',
    'Vider la poche d’un promeneur en le bousculant « par accident ».',
    'Dérober une montre à un bourgeois qui marche à vos côtés.',
    'Vider la poche d’un garde en faction qui vous surveille.',
    'Voler l’arme au ceinturon d’un bretteur méfiant, en pleine conversation.',
    'Dérober un objet que la cible tient serré dans son poing.'
  ],
  'Crochetage': [
    'Pousser une porte simplement coincée par l’humidité.',
    'Soulever le loquet d’une porte de grange avec un bâton.',
    'Ouvrir un coffre à jouets fermé par un fermoir simple.',
    'Faire sauter le loquet d’une barrière de jardin.',
    'Crocheter un cadenas rouillé bon marché.',
    'Ouvrir un cadenas neuf mais rudimentaire.',
    'Ouvrir une serrure de coffre domestique courante.',
    'Crocheter la serrure d’une porte d’écurie.',
    'Forcer la porte d’une échoppe avec des outils adaptés.',
    'Ouvrir la serrure d’une chambre d’auberge cossue.',
    'Crocheter la serrure d’un bureau de fonctionnaire.',
    'Déjouer une serrure de donjon à gorges multiples, dans le noir.',
    'Crocheter un mécanisme nain réputé inviolable, sous le temps.',
    'Ouvrir une serrure scellée par magie sans en connaître le principe.'
  ],
  'Escamotage': [
    'Cacher une pièce dans sa paume, personne ne regarde.',
    'Cacher une pièce dans son poing fermé.',
    'Faire passer un caillou d’une poche à l’autre sans témoin attentif.',
    'Faire passer une pièce d’une main à l’autre sans qu’on le remarque.',
    'Faire glisser une carte dans sa manche entre deux gestes.',
    'Glisser un billet dans sa manche pendant qu’on regarde ailleurs.',
    'Escamoter un dé sous les yeux d’un spectateur naïf.',
    'Faire disparaître un dé devant un spectateur qui ne s’y attend pas.',
    'Dissimuler une lame le temps d’une fouille rapide.',
    'Dissimuler une clé sous les yeux distraits d’un garde.',
    'Substituer un objet à un autre sous le regard d’un témoin.',
    'Escamoter un objet volumineux devant un public méfiant.',
    'Duper un prestidigitateur qui guette la moindre feinte.',
    'Faire disparaître un objet des mains mêmes de celui qui le tient.'
  ],
  'Évasion': [
    'Se dégager d’une corde nouée à la hâte et lâche.',
    'Se dégager d’une corde posée sur les poignets sans nœud.',
    'Défaire un nœud simple noué par un enfant.',
    'Retirer une corde simplement enroulée autour des poignets.',
    'Glisser hors de menottes trop larges.',
    'Glisser hors d’un nœud coulant serré sans conviction.',
    'Se défaire de liens de chanvre serrés par un amateur.',
    'Se défaire de liens de cuir serrés par un tavernier.',
    'Se libérer d’une prise de lutte relâchée.',
    'Se libérer d’une étreinte solide mais mal placée.',
    'S’extraire de cordes serrées par un geôlier expérimenté.',
    'S’évader d’une camisole de contention en quelques minutes.',
    'Se libérer suspendu, ligoté par un bourreau qui vérifie ses nœuds.',
    'Rompre des chaînes forgées pour vous retenir précisément.'
  ],
  'Sabotage': [
    'Coincer une roue de charrette avec un caillou.',
    'Ôter une cheville d’une barrière pour qu’elle tombe.',
    'Vider l’huile d’une lanterne pour qu’elle s’éteigne vite.',
    'Retirer la goupille d’un attelage arrêté.',
    'Dénouer discrètement une sangle de selle.',
    'Desserrer discrètement la roue d’une brouette.',
    'Fausser le tir d’une arbalète d’entraînement.',
    'Émousser la corde d’un arc sans que cela se voie.',
    'Enrayer une catapulte pendant une pause des servants.',
    'Gripper un treuil de puits pour qu’il lâche au prochain usage.',
    'Trafiquer un chariot pour qu’il rompe un peu plus loin.',
    'Piéger un mécanisme complexe sous la surveillance d’un ingénieur.',
    'Neutraliser un piège magique en le laissant paraître fonctionnel.',
    'Saboter un dispositif qu’on vous montre pièce par pièce, surveillé.'
  ],
  'Puissance': [
    'Repousser une porte entrouverte.',
    'Pousser une chaise.',
    'Soulever un tabouret d’une main.',
    'Soulever un seau plein.',
    'Soulever un sac de grain.',
    'Porter un tonnelet sur l’épaule.',
    'Enfoncer une porte en bois vermoulu d’un coup d’épaule.',
    'Tirer une charrette vide sur quelques pas.',
    'Déplacer une lourde caisse tout seul.',
    'Enfoncer une porte de grange fermée au loquet.',
    'Soulever une poutre tombée pour dégager quelqu’un.',
    'Retenir un pont qui s’effondre le temps que les autres passent.',
    'Soulever un rocher qu’il faudrait plusieurs hommes pour bouger.',
    'Arrêter à mains nues une charge de cavalerie.'
  ],
  'Projection': [
    'Jeter une pierre à quelques pas.',
    'Poser une pierre dans un panier à ses pieds.',
    'Lancer un caillou dans une mare à trois pas.',
    'Lancer une pomme à un ami qui tend les mains.',
    'Lancer une corde à un compagnon proche.',
    'Envoyer une clé à travers une pièce.',
    'Atteindre une cible large à courte distance.',
    'Toucher un tonneau à vingt pas avec une pierre.',
    'Projeter un adversaire léger hors d’équilibre.',
    'Lancer une corde par-dessus une branche haute.',
    'Lancer un grappin sur un rebord à bonne hauteur.',
    'Projeter un ennemi par-dessus une rambarde en pleine mêlée.',
    'Toucher une cible minuscule et mouvante à très longue portée.',
    'Lancer quelqu’un assez loin et juste pour lui faire franchir un gouffre.'
  ],
  'Prise': [
    'Attraper un poignet tendu vers vous.',
    'Serrer la main tendue de quelqu’un.',
    'Retenir par la main un enfant qui marche.',
    'Retenir quelqu’un par la manche.',
    'Retenir un enfant qui veut s’échapper.',
    'Retenir un chien qui tire sur sa laisse.',
    'Immobiliser un adversaire déjà à terre.',
    'Bloquer un ivrogne qui titube vers la sortie.',
    'Bloquer le bras d’un ivrogne agressif.',
    'Ceinturer un voleur surpris qui se débat.',
    'Plaquer et maîtriser un fuyard de gabarit égal.',
    'Immobiliser un colosse enragé assez longtemps pour l’entraver.',
    'Maîtriser une créature plus forte et plus rapide que vous.',
    'Retenir seul quelque chose qui vous dépasse totalement en puissance.'
  ],
  'Équilibre': [
    'Marcher sur une poutre large posée au sol.',
    'Marcher sur une ligne tracée au sol.',
    'Traverser une planche large posée sur l’herbe.',
    'Marcher sur un trottoir étroit.',
    'Traverser un tronc couché au-dessus d’un ruisseau.',
    'Traverser une planche large posée sur un fossé.',
    'Rester debout sur une barque qui tangue légèrement.',
    'Rester debout dans une charrette en marche.',
    'Longer une corniche de bonne largeur.',
    'Traverser une poutre étroite à un mètre du sol.',
    'Traverser une poutre étroite au-dessus du vide.',
    'Progresser sur un rebord glissant, chargé, sous la pluie.',
    'Tenir sur un fil tendu au-dessus d’un précipice.',
    'Rester debout sur un appui qui se dérobe sous vos pieds.'
  ],
  'Acrobaties': [
    'Se relever d’une chute par une roulade.',
    'Sauter d’une marche.',
    'Enjamber une chaise renversée en courant.',
    'Sauter d’une hauteur de table sans se faire mal.',
    'Sauter par-dessus un banc.',
    'Rouler par-dessus un comptoir.',
    'Rouler sous une table pour se mettre à couvert.',
    'Sauter un muret en pleine course.',
    'Franchir un fossé d’un bond avec élan.',
    'Bondir d’un balcon bas et se réceptionner debout.',
    'Enchaîner un saut de mur et une réception propre.',
    'Bondir de toit en toit au-dessus d’une ruelle large.',
    'Enchaîner triple saut, plongeon et réception sur une corde.',
    'Réaliser une figure qu’aucun corps humain n’a jamais tenue.'
  ],
  'Escalade': [
    'Monter à une échelle appuyée.',
    'Grimper sur une chaise.',
    'Monter une échelle tenue par un ami.',
    'Grimper sur un muret à hauteur de poitrine.',
    'Grimper un talus raide en s’aidant des racines.',
    'Monter à un arbre aux branches basses.',
    'Escalader un mur de pierre à grosses prises.',
    'Escalader une palissade de bois.',
    'Monter une façade avec fissures et rebords.',
    'Grimper une façade ornée de moulures saillantes.',
    'Gravir une paroi rocheuse verticale à mains nues.',
    'Grimper un surplomb en dévers, chargé, dans le vent.',
    'Escalader une falaise de verre poli sans matériel.',
    'Monter une surface où rien n’offre la moindre prise.'
  ],
  'Résistances': [
    'Supporter une nuit un peu fraîche.',
    'Supporter un courant d’air frais.',
    'Tenir une heure sous un crachin léger.',
    'Supporter un coup de vent glacé.',
    'Encaisser une gifle sans broncher.',
    'Tenir une journée sous une pluie froide.',
    'Tenir malgré une entaille superficielle.',
    'Encaisser une bourrade sans perdre l’équilibre.',
    'Résister à un poison léger le temps de trouver un remède.',
    'Supporter une longue marche avec une ampoule à vif.',
    'Continuer à agir avec une jambe blessée.',
    'Traverser un brasier bref sans s’effondrer.',
    'Survivre à un venin conçu pour tuer un ours.',
    'Rester debout après une blessure qui devrait être mortelle.'
  ],
  'Endurance': [
    'Marcher une heure d’un bon pas.',
    'Marcher un quart d’heure d’un pas tranquille.',
    'Monter un étage en portant un panier.',
    'Monter trois étages sans s’essouffler.',
    'Porter une charge sur une demi-journée.',
    'Marcher une demi-journée sans charge.',
    'Courir un mille sans s’arrêter.',
    'Courir un demi-mille en gardant l’allure.',
    'Marcher une journée entière sans halte prolongée.',
    'Tenir une nuit de veille sans somnoler.',
    'Ramer toute une nuit contre le courant.',
    'Rester éveillé et opérationnel une semaine de veille.',
    'Traverser un désert à pied avec des rations minimales.',
    'Continuer d’avancer quand le corps aurait dû lâcher depuis longtemps.'
  ],
  'Course': [
    'Rattraper quelqu’un qui marche.',
    'Rattraper quelqu’un qui flâne.',
    'Distancer un vieillard qui marche vite.',
    'Rattraper une charrette au pas.',
    'Distancer un enfant.',
    'Rattraper un chien qui trottine.',
    'Semer un poursuivant maladroit sur terrain plat.',
    'Devancer un badaud qui court après la même diligence.',
    'Atteindre une porte avant qu’elle se referme.',
    'Distancer un poursuivant de gabarit égal sur deux cents pas.',
    'Distancer un garde à l’entraînement sur cent pas.',
    'Devancer une avalanche jusqu’à un abri.',
    'Semer une meute lancée à pleine course, en forêt.',
    'Aller plus vite qu’une flèche déjà partie.'
  ],
  'Nage': [
    'Barboter d’un bord à l’autre d’une mare.',
    'Patauger dans une eau qui arrive aux genoux.',
    'Traverser une mare peu profonde en quelques brasses.',
    'Flotter sur le dos dans une eau calme.',
    'Traverser un étang calme.',
    'Nager cent brasses dans un lac tranquille.',
    'Nager une rivière au courant faible.',
    'Traverser un canal aux eaux paresseuses.',
    'Franchir un fleuve large sans se laisser dériver.',
    'Nager contre un courant faible sur une courte distance.',
    'Nager habillé contre un courant marqué.',
    'Traverser des rapides sans se fracasser sur les rochers.',
    'Plonger longtemps en eaux profondes et remonter un corps.',
    'Nager contre un maelström qui aspire tout vers le fond.'
  ],
  'Vue': [
    'Voir une torche allumée dans une pièce sombre.',
    'Voir une bougie allumée sur la table devant soi.',
    'Distinguer un ami qui fait signe à cinq pas.',
    'Reconnaître un ami à dix pas en plein jour.',
    'Distinguer une silhouette qui bouge à trente pas.',
    'Repérer un objet brillant tombé dans l’herbe.',
    'Repérer une trappe mal ajustée dans un plancher.',
    'Voir une porte entrebâillée au fond d’un couloir sombre.',
    'Remarquer un guetteur posté sur un toit.',
    'Distinguer une silhouette immobile dans la pénombre d’un porche.',
    'Lire sur les lèvres d’une conversation lointaine.',
    'Repérer un fil-piège tendu dans la pénombre.',
    'Discerner un détail infime sur un objet en mouvement rapide.',
    'Voir quelque chose de délibérément soustrait à la vue.'
  ],
  'Odorat-Goût': [
    'Sentir la fumée d’un feu proche.',
    'Sentir un plat qui brûle sur le feu.',
    'Reconnaître l’odeur d’une écurie en y entrant.',
    'Reconnaître l’odeur du pain qui cuit.',
    'Reconnaître l’odeur d’un cadavre dans une pièce.',
    'Sentir qu’un vin a été coupé d’eau.',
    'Déceler un plat qui a tourné.',
    'Déceler l’odeur d’une lampe à huile éteinte depuis peu.',
    'Repérer un poison courant à l’odeur d’un verre.',
    'Reconnaître l’odeur d’une plante médicinale dans une tisane.',
    'Suivre une piste odorante fraîche sur quelques centaines de pas.',
    'Distinguer une personne à son odeur au milieu d’une foule.',
    'Suivre une trace olfactive vieille de plusieurs jours sous la pluie.',
    'Déceler une substance conçue pour n’avoir ni odeur ni goût.'
  ],
  'Ouïe': [
    'Entendre une porte claquer dans la pièce voisine.',
    'Entendre quelqu’un parler à côté de soi.',
    'Entendre une cloche sonner dans le village.',
    'Entendre quelqu’un frapper à la porte.',
    'Repérer des pas dans un couloir silencieux.',
    'Repérer des pas sur un escalier de bois.',
    'Surprendre une conversation à voix normale derrière une cloison.',
    'Entendre chuchoter dans la pièce voisine.',
    'Localiser un tireur à l’oreille dans un bois calme.',
    'Reconnaître une voix parmi trois derrière une porte.',
    'Distinguer un murmure au milieu d’un brouhaha de taverne.',
    'Suivre un déplacement furtif à l’oreille seule, dans le noir.',
    'Percevoir le déclic d’un mécanisme à travers un mur épais.',
    'Entendre un son que l’oreille humaine ne peut pas capter.'
  ],
  'Toucher': [
    'Sentir un courant d’air sous une porte.',
    'Sentir la chaleur d’une tasse dans sa main.',
    'Distinguer une pièce d’une clé dans sa poche.',
    'Reconnaître une pièce d’or à sa taille dans une bourse.',
    'Trouver un interrupteur à tâtons dans le noir.',
    'Trouver une clé au fond d’un sac sans regarder.',
    'Repérer un renflement suspect en palpant une doublure.',
    'Sentir une lame dissimulée sous une étoffe épaisse.',
    'Détecter un mécanisme de piège du bout des doigts.',
    'Repérer une lettre glissée sous une doublure de manteau.',
    'Parcourir à la main une inscription gravée presque effacée.',
    'Distinguer un faux d’un original à la seule texture.',
    'Déceler une aiguille empoisonnée avant qu’elle ne pique.',
    'Percevoir au toucher un détail qu’aucune main ne pourrait sentir.'
  ],
  'Investigation': [
    'Constater qu’une porte a été forcée.',
    'Constater qu’une bougie a brûlé toute la nuit.',
    'Remarquer des traces de pas boueuses sur un parquet propre.',
    'Remarquer qu’un objet a changé de place.',
    'Suivre des traces de boue jusqu’à leur origine.',
    'Déduire d’un lit défait qu’on a dormi ici récemment.',
    'Déduire qu’un repas a été interrompu brusquement.',
    'Trouver qui a fouillé un tiroir aux traces laissées.',
    'Reconstituer l’ordre des évènements d’une bagarre.',
    'Identifier l’arme d’une blessure à sa forme.',
    'Identifier l’auteur d’un vol à partir d’indices épars.',
    'Reconstituer un crime ancien à partir de traces ténues.',
    'Percer une machination montée pour égarer l’enquête.',
    'Élucider une affaire dont toutes les preuves ont été effacées.'
  ],
  'Élémentaire': [
    'Sentir la chaleur d’un feu magique tout proche.',
    'Sentir la chaleur d’un feu de cheminée en entrant.',
    'Deviner qu’il a plu à l’odeur de la terre.',
    'Sentir la fraîcheur d’une source toute proche.',
    'Deviner qu’un orage approche à l’air qui change.',
    'Deviner qu’un feu a brûlé ici récemment.',
    'Repérer une source d’eau enfouie à la végétation.',
    'Sentir un courant d’air froid qui trahit une cavité.',
    'Percevoir un sort élémentaire actif dans une pièce.',
    'Percevoir une trace de givre magique sur une serrure.',
    'Identifier la nature d’un piège élémentaire avant de le déclencher.',
    'Prévoir le comportement d’un élémentaire sauvage.',
    'Lire l’empreinte élémentaire d’un sort lancé la veille.',
    'Percevoir une force élémentaire dissimulée par un maître.'
  ],
  'Cosmique': [
    'Ressentir un malaise dans un lieu hanté.',
    'Ressentir la paix d’une chapelle consacrée.',
    'Sentir un frisson en passant devant une potence.',
    'Frissonner en franchissant le seuil d’un tombeau.',
    'Deviner la présence d’un mort récent.',
    'Sentir qu’une pièce a été le théâtre d’une violence.',
    'Percevoir qu’un objet porte une empreinte spirituelle.',
    'Deviner qu’un objet a servi à un rite.',
    'Sentir un regard surnaturel posé sur soi.',
    'Percevoir une présence discrète qui rôde dans une chapelle.',
    'Identifier la nature d’une présence invisible dans une salle.',
    'Discerner les intentions d’un esprit qui se cache.',
    'Lire un présage fiable dans un alignement fugace.',
    'Percevoir une vérité cosmique que l’esprit mortel ne peut contenir.'
  ]
};

export function tip(name, i) {
  const a = EXAMPLES[name];
  return (a && a[i]) || '';
}

export const DEFAULT_DD = [6, 8, 11, 14, 18, 22, 26, 30, 34, 40, 46, 52, 75, 100];

export const PALIERS = [
  { name: 'Pratiquement impossible à rater', note: 'pas de jet', roll: false },
  { name: 'Anodin', roll: true },
  { name: 'Enfantin', roll: true },
  { name: 'Trivial', roll: true },
  { name: 'Extrêmement facile', roll: true },
  { name: 'Très facile', roll: true },
  { name: 'Facile', roll: true },
  { name: 'Assez facile', roll: true },
  { name: 'Moyen', roll: true },
  { name: 'Assez difficile', roll: true },
  { name: 'Difficile', roll: true },
  { name: 'Très difficile', roll: true },
  { name: 'Presque impossible', roll: true },
  { name: 'Impossible', roll: true }
];

export const LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export const fr = (n) => String(n).replace('.', ',');

export function statPool(L) { return 16 + 2 * L; } // règle figée : 16 de base + 2 / niveau
export function statCap(L) { return L + 2; }        // règle de création : niveau + « stat max /lvl » (2)

// Presets de bouton : Mini = 0 · Moyen = pool ÷ 6 · Max = plafond (niv + 2).
export function presetValue(kind, L) {
  if (kind === 'min') return 0;
  if (kind === 'max') return statCap(L);
  return Math.round(statPool(L) / 6);
}

export function expPool(eco, L) { return (eco.expPoolBase || 0) + (eco.expPoolLvl || 0) * L; }
export function expCap(eco, L) { return (eco.expCapBase || 0) + (eco.expCapLvl || 0) * L; }

export function resolved(exp) {
  const r = {};
  STATS.forEach((s) => { r[s] = exp.c[s] || 0; });
  if (exp.s) {
    Object.keys(exp.s).forEach((sense) => {
      const w = exp.s[sense], basis = SENSES[sense] || {};
      Object.keys(basis).forEach((p) => { r[p] += w * basis[p]; });
    });
  }
  return r;
}

// Valeur d'une stat à un niveau donné : au niveau courant, la valeur saisie ;
// aux autres niveaux, mise à l'échelle proportionnelle au pool de stat, bornée
// au plafond (niv + 2). 0 reste 0.
export function statValueAt(base, cur, L) {
  if (L === cur) return base;
  const pc = statPool(cur);
  const v = pc > 0 ? base * statPool(L) / pc : base;
  return Math.max(0, Math.min(statCap(L), Math.round(v)));
}

export const RACE_POOL = 16;

// Valeur effective d'une stat : la part « entraînée » (mise à l'échelle par
// niveau comme statValueAt) plus le bonus racial, fixe, qui ne varie pas avec
// le niveau.
export function statBonus(exp, statVal, cur, L, raceVal) {
  const r = resolved(exp);
  let t = 0;
  STATS.forEach((s) => {
    const v = statValueAt(statVal[s] || 0, cur, L) + ((raceVal && raceVal[s]) || 0);
    t += r[s] * v;
  });
  return t;
}

export function faces() { return 16; }
export function need(target, M) { return Math.ceil(target - M); } // jet minimal (entier) sur le dé
export function prob(target, M, f) {
  const n = need(target, M);
  if (n <= 0) return 1;
  if (n >= f) return 0;
  return (f - n) / f;
}
export function fmtPct(p) {
  if (p >= 1) return '100';
  if (p <= 0) return '0';
  if (p < 0.01) return '<1';
  if (p > 0.99) return '>99';
  return String(Math.round(p * 100));
}
export function ressenti(k, f) {
  if (k <= 0) return ['Automatique', 'good'];
  const r = k / f;
  if (r <= 1 / 16) return ['Extrêmement facile', 'good'];
  if (r <= 3 / 16) return ['Très facile', 'good'];
  if (r <= 6 / 16) return ['Facile', 'good'];
  if (r <= 9 / 16) return ['Moyen', 'mid'];
  if (r <= 12 / 16) return ['Difficile', 'warn'];
  if (r <= 14 / 16) return ['Très difficile', 'warn'];
  if (r < 1) return ['Presque impossible', 'crit'];
  return ['Hors de portée', 'crit'];
}

// Modificateur M pour l'expertise « exp », au niveau L, pour le profil de
// référence (mode = ce qui compte dans le jet, pctCap = % du plafond investi).
export function refM({ exp, statVal, raceVal, eco, cur, L, mode, pctCap, stuff }) {
  const pts = Math.round((pctCap / 100) * expCap(eco, L));
  const b = statBonus(exp, statVal, cur, L, raceVal);
  return pts + (mode >= 2 ? b : 0) + (mode >= 3 ? stuff : 0);
}

export function compactLevels(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    let a = arr[i], b = a;
    while (i + 1 < arr.length && arr[i + 1] === b + 1) { b = arr[++i]; }
    out.push(a === b ? String(a) : a + '–' + b);
    i++;
  }
  return out.join(', ');
}
