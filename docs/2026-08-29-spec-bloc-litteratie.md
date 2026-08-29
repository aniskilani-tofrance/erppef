# SPÉCIFICATION OPÉRATIONNELLE — Bloc « Littératie » (détection Pré-alpha / Alpha / A1.1)

Bloc placé EN TÊTE du test existant (A1→B2, 56 questions). 100 % audio-piloté (TTS fr-FR navigateur), réponses tactiles, aucun clavier alphabétique. Durée cible : 5-8 min (lecteurs rapides : ~3 min puis fast-track vers le test existant).

---

## 1. DÉFINITIONS RETENUES (critères mesurables)

Fondement (consensus ANLCI / CRI / Lire et Écrire / FTDA) : **l'oral et l'écrit sont deux axes indépendants** — le profil est un CROISEMENT, jamais un scalaire. Le déterminant du profil pédagogique n'est pas le niveau de français mais la **scolarisation antérieure** (< 5 ans = jalon DASES/CEFIL) et la **littératie en langue d'origine**. Rapport d'enjeu : infra→A1.1 = 400-500 h si non scolarisé vs 40-50 h si scolarisé (×10).

| Niveau | Définition (référentiel A1.1 Beacco/de Ferrari, paliers DGLFLF 2010) | Critères mesurables dans le test |
|---|---|---|
| **PRÉ-ALPHA** | Palier « découverte » : jamais scolarisé, non entré dans l'écrit (ne distingue pas l'écriture d'un dessin, pas de répertoire alphabétique, pas de principe alphabétique), ET oral français non fonctionnel | L0 non validé (< 2/3) **ET** ORAL_BAS (< 2 réussites en compréhension orale) |
| **ALPHA** | Non-lecteur non-scripteur dans toute langue (scolarisation nulle ou < 5 ans) mais **peut être performant à l'oral** ; ou entré dans l'alphabet sans déchiffrage (palier « exploration ») | (L0 < 2/3 ET ORAL_OK) **OU** (L0 validé ET L1 = 0/2), avec SCOL_FAIBLE |
| **POST-ALPHA / A1.1 en cours** | Palier « appropriation » : déchiffre des mots hyper-fréquents (phonie-graphie opérante) mais accès au sens non stabilisé ; écrit ses infos personnelles en copiant | L1 validé (2/2) ET L2 < 2/2 ; ou L1 = 1/2 |
| **A1.1 ACQUIS (écrit-réception)** | Descripteurs DILF : lit signalétique et mots fréquents, comprend un message écrit très simple, note un nombre | L2 = 2/2 → déverrouille le test existant A1→B2 |
| **Flag ILLETTRISME** (hors FLE) | Scolarisé EN FRANÇAIS ≥ 5 ans mais écrit non maîtrisé (degrés ANLCI 1-2) | LANG_SCOL = français ET SCOL_OK ET (L0 ou L1 échoués) → orientation ANLCI, pas alpha-FLE |

---

## 2. LISTE ORDONNÉE DES ITEMS

**Interaction standard (enseignée en E2)** : 1er appui sur une tuile = surbrillance + lecture audio de l'option ; 2e appui sur la même tuile = validation (bordure verte, son doux, transition). Appui ailleurs = changement de sélection. Bouton 🔊 permanent (≥ 80 px) = ré-écoute illimitée de la consigne. TTS : rate 0,8, phrases ≤ 8 mots, un seul verbe d'action. Tuiles ≥ 60 px (viser 25-30 % de l'écran), max 4 options, 1 item = 1 écran, zéro scroll, jauge de progression en points ●●●○○ (jamais « 3/14 »). Mots-stimuli en MAJUSCULES sans-serif, corps ≥ 32 px (lettres isolées : ≥ 64 px). Aucun feedback d'échec (pas de croix rouge, pas de son négatif) ; enchaînement neutre « On continue ! ». Logger par item : réponse, distracteur choisi, latence, nombre de ré-écoutes.

**Écran 0 (accompagnant)** : bouton « Démarrer » appuyé par l'accueillant en tendant la tablette — indispensable car les navigateurs bloquent le TTS avant le premier geste utilisateur. Le prénom du candidat est saisi ici (pour l'item I8).

### Entraînement (non noté)

**E1 — Déblocage / premier geste**
- Mesure : capacité à toucher une cible (illectronisme).
- Consigne lue : « Bonjour ! Touchez le rond vert. »
- Affiché : un grand disque vert pulsant (CSS), rien d'autre.
- Réponse : tap simple (validation immédiate, exception au double-tap).
- Échec : 10 s sans tap → replay auto (×2) ; 30 s → animation main 👆 pointant le rond ; toujours rien → écran accompagnant. Réussite → « Très bien ! »

**E2 — Apprentissage du double-tap**
- Mesure : manipulation de l'interface de réponse.
- Consigne lue : « Touchez le ballon. » Après le 1er tap : « C'est le ballon. Touchez encore une fois pour choisir. »
- Affiché : 3 tuiles ⚽ 🌙 🍎.
- Réponse : double-tap standard.
- Échec (valide 🌙 ou 🍎) : « On recommence. Touchez le ballon. » **2 échecs → ARRÊT : statut « passation accompagnée requise », aucun niveau émis** (on ne classe JAMAIS pré-alpha sur un échec d'interface).

### Déclaratif (audio + tactile)

**I1 — Scolarisation** *(meilleur prédicteur unique du profil)*
- Consigne lue : « Quand vous étiez enfant, êtes-vous allé à l'école ? » (chaque tuile est lue à son 1er tap).
- Affiché : 3 tuiles — 🏫❌ « Non, jamais » / 🏫 « Oui, un peu (moins de 5 ans) » / 🏫🎓 « Oui, longtemps (5 ans ou plus) ».
- Interprétation : jamais ou < 5 ans → `SCOL_FAIBLE` ; ≥ 5 ans → `SCOL_OK`. Déclaratif à croiser avec les mesures (garde-fous §3).

**I2 — Langue de scolarisation** *(conditionnel : si I1 ≠ « jamais »)*
- Consigne lue : « À l'école, c'était en français ? »
- Affiché : 2 tuiles — « Oui » 🇫🇷 / « Non » 🌍.
- Interprétation : « oui » + SCOL_OK + échec écrit ultérieur → flag **ILLETTRISME** (orientation ANLCI, pédagogie ≠ alpha-FLE).

### Compréhension orale (toujours administrée intégralement, même si l'écrit échouera — axes indépendants)

**I3 — CO mot isolé**
- Consigne lue : « Écoutez. Touchez la bonne image. » Puis : « Le téléphone. »
- Affiché : 4 tuiles 📞 🍌 🏠 ⚽.
- Réussite = comprend un mot hyper-fréquent. Échec = réception orale infra-A1.1 probable.

**I4 — CO phrase courte**
- Consigne lue : « Écoutez. Touchez la bonne image. » Puis : « Je voudrais un café, s'il vous plaît. »
- Affiché : 4 tuiles ☕ 🥖 🚌 💊.
- Réussite = comprend un énoncé de besoin vital (descripteur A1.1 oral).

**I5 — CO rattrapage** *(conditionnel : si I3+I4 = 1/2)*
- Consigne lue : « Touchez le chat. »
- Affiché : 4 tuiles 🐱 🚪 🍎 🧢.
- Score final : `ORAL_OK` si ≥ 2 réussites sur les items CO administrés, sinon `ORAL_BAS` (infra-A1.1 oral).

### Palier L0 — entrée dans l'écrit (découverte)

**I6 — Reconnaître l'écrit**
- Consigne lue : « Touchez ce qui est écrit. » (2e écoute, reformulée : « Où sont les lettres ? Touchez les lettres. »)
- Affiché : 4 tuiles — « MAISON » / 🌺 / ♪♪♪ / 🐦.
- Échec = ne différencie pas l'écriture des autres signes → indicateur fort palier découverte.

**I7 — Lettre nommée**
- Consigne lue : « Touchez la lettre A. » (2e écoute : « A. Comme dans AMI. Touchez le A. »)
- Affiché : 4 tuiles très grand corps — A / M / O / 7 (le chiffre teste la distinction lettres/chiffres).
- Échec = pas de répertoire alphabétique.

**I8 — Reconnaissance du prénom** *(item canonique de tous les outils de terrain)*
- Consigne lue : « Touchez votre prénom. »
- Affiché : le prénom saisi à l'écran 0 + 3 distracteurs générés depuis une banque (même initiale, longueur ±1 : AMINA / AMIRA / ANISSA / SAMIA).
- Fallback si prénom absent (appariement visuel) : « Regardez le mot en haut. Touchez le même mot en bas. » Modèle « PARIS », tuiles PARIS / PABIS / PRAIS / MARIS.
- Réussite = premier ancrage dans l'écrit. ⚠️ Ne prouve pas la lecture (cf. pièges — la « signature » est souvent connue des analphabètes) ; c'est pourquoi L0 exige 2/3.
- **Score L0 = I6+I7+I8, validé si ≥ 2/3. Si < 2/3 → arrêt écrit n°1 (voir §4), mais administrer quand même I9.**

### Numératie (toujours administrée, même après échec L0 — les chiffres sont souvent préservés)

**I9 — Nombre entendu → nombre écrit**
- Consigne lue : « Touchez le nombre trente-cinq. »
- Affiché : 3 tuiles très grand corps — 35 / 53 / 15.
- Interprétation : réussite + échec lettres = profil alpha numérate classique (précieux pour la restitution et la pédagogie : prix, dates). Échec chiffres ET lettres = renforce pré-alpha. N'entre pas dans le routage principal.

### Palier L1 — déchiffrage (exploration → appropriation)

**I10 — Mot entendu → mot écrit (distracteurs étagés)**
- Consigne lue : « Écoutez le mot. Touchez le mot écrit. » Puis : « Pain. »
- Affiché : 4 tuiles — PAIN / BAIN / PIED / VÉLO.
- Analyse d'erreur (logger le distracteur choisi) : VÉLO = aucun décodage ; PIED = repérage de la seule première lettre ; BAIN = décodage partiel (confusion p/b). Réussite = correspondance phonie-graphie opérante.

**I11 — Idem, discrimination fine**
- Consigne lue : « Écoutez le mot. Touchez le mot écrit. » Puis : « Bus. »
- Affiché : 4 tuiles — BUS / BAS / SUB / RIZ.
- SUB teste l'ordre des lettres (sens de lecture) ; BAS la voyelle ; RIZ = rien.
- **Score L1 = I10+I11 : 2/2 = validé ; 1/2 = déchiffrage partiel (on présente quand même L2) ; 0/2 → arrêt écrit n°2.**

### Palier L2 — lecture-compréhension (seuil A1.1)

**I12 — Mot écrit → sens** *(le mot n'est JAMAIS prononcé)*
- Consigne lue : « Lisez le mot. Touchez la bonne image. »
- Affiché : « TAXI » en haut ; 4 tuiles 🚕 🍎 🐟 🎩.
- Réussite = lecture autonome avec accès au sens.

**I13 — Phrase courte → sens**
- Consigne lue : « Lisez la phrase. Touchez la bonne image. »
- Affiché : « Je mange une pomme. » (script mixte standard) ; 4 tuiles 🍎 ☕ 🚌 📞.
- Réussite = réception écrite A1.1 atteinte (descripteur DILF « comprendre un message très simple »).
- **Score L2 = I12+I13, validé si 2/2.**

### Production (optionnel, jamais bloquant)

**I14 — Noter un nombre entendu** *(conditionnel : si L1 validé ; item PE du DILF, compatible pavé numérique)*
- Consigne lue : « Écoutez le nombre. Écrivez-le avec les chiffres. » Puis : « Dix-sept. »
- Affiché : pavé numérique 0-9 géant + champ + bouton ✓ + 🔊.
- Interprétation : production écrite chiffrée fonctionnelle. Un échec n'abaisse JAMAIS le classement (informatif restitution uniquement).

**Total : 14 items notés maximum (11-13 administrés selon les conditionnels) + 2 écrans d'entraînement.**

---

## 3. RÈGLE DE ROUTAGE

Variables : `SCOL` ∈ {FAIBLE, OK} ; `LANG_SCOL` ∈ {FR, AUTRE, N/A} ; `ORAL` ∈ {BAS, OK} ; `L0` /3 ; `L1` /2 ; `L2` /2 ; `NUM` /1.

```
SI entraînement échoué        → « passation accompagnée requise », aucun niveau émis, FIN

SI L0 < 2/3 :
   SI ORAL_BAS                → PRÉ-ALPHA (palier découverte ; réf. OFII ~600 h)
   SI ORAL_OK :
      SI LANG_SCOL=FR et SCOL_OK → flag ILLETTRISME → orientation ANLCI (entretien)
      SINON                   → ALPHA, oral fonctionnel (~400-500 h vers A1.1)

SI L0 ≥ 2/3 et L1 = 0/2      → ALPHA, palier exploration (tag oral séparé)
SI L1 = 1/2 et L2 ≤ 1/2      → ALPHA AVANCÉ / POST-ALPHA en cours
SI L1 = 2/2 et L2 ≤ 1/2      → POST-ALPHA (A1.1 en cours ; ~200-300 h vers A1)

SI L2 = 2/2 (A1.1 écrit-réception acquis) :
   SI SCOL_OK                 → FLE débutant scolarisé → ENCHAÎNER le test existant
                                (démarrer aux items A1)
   SI SCOL_FAIBLE             → POST-ALPHA→A1.1 confirmé → proposer la suite du test
                                (items A1) avec pédagogie alpha recommandée
   SI tout le bloc réussi vite et sans hésitation (latences < 5 s, 0 ré-écoute)
                              → fast-track : test existant complet
```

**Garde-fous obligatoires** (règle du doute Lire et Écrire) :
- Discordance `SCOL_OK` déclaré / L0-L1 échoués → présenter une 2e série d'items alternatifs (lettre E, mots MOTO / SOLEIL…) avant de conclure.
- Fluidité inattendue chez un déclaré non scolarisé → re-router vers le test standard.
- Latences < 2 s systématiques → flag « évitement », proposer passation accompagnée (ne pas coter comme incompétence).
- **La restitution est un VECTEUR, jamais un scalaire** : {oral, palier écrit, numératie, scolarisation} + profil + volume horaire indicatif + mention « positionnement indicatif, à confirmer en entretien et pendant les premières séances » (temps d'essai). Formulation valorisante type eva/ANLCI (« ce que je sais faire »), jamais « niveau zéro ».

---

## 4. RÈGLE D'ARRÊT ANTICIPÉ

1. **Arrêt interface** : E2 échoué 2× après ré-explication → fin immédiate (~2 min), écran accompagnant, message audio chaleureux. Statut spécial, pas un niveau.
2. **Arrêt écrit n°1** : L0 < 2/3 → sauter I10-I14 ; administrer quand même **I9 (nombres)** puis fin. Classement sur ORAL (pré-alpha vs alpha).
3. **Arrêt écrit n°2** : L1 = 0/2 → sauter I12-I14 puis fin.
4. **Jamais d'arrêt sur l'oral** : I3-I4 toujours administrés intégralement (une personne alpha peut être excellente à l'oral — c'est le cas normal, pas l'exception).
5. **Sortie haute** : L2 = 2/2 → transition immédiate vers le test existant, point d'entrée = niveau directement inférieur au niveau oral estimé (règle FTDA).
6. **Par item** : aucune limite de temps punitive, ré-écoutes illimitées ; après 2 replays automatiques + 45 s d'inactivité → item coté non-réussi, transition neutre (« On continue ! »).
7. Message de fin toujours identique et positif, quel que soit le point d'arrêt (« Merci ! C'est terminé. À bientôt ! » + 🎉).

---

## 5. PIÈGES À ÉVITER

1. **Confondre illectronisme et analphabétisme** — l'échec tactile n'est pas un échec de littératie. E1/E2 servent de filtre ; leur échec → passation accompagnée, jamais « pré-alpha ».
2. **Ne jamais classer vers le bas sur la reconnaissance vocale** — les ASR sont biaisées contre les accents L2. En dessous d'A1.1, la production orale n'est pas notée : tout l'oral se mesure en compréhension tactile. La reco vocale du test existant ne s'active qu'après sortie haute.
3. **TTS sur lettres/syllabes isolées** — la synthèse fr-FR prononce mal « MA » ou une lettre seule (épellations aberrantes selon les voix). Tester chaque énoncé sur Chrome/Safari/Android ; préférer mots entiers + ancrage (« A comme dans AMI ») ; rate 0,8 ; détecter l'absence de voix fr-FR sur l'appareil et afficher un écran accompagnant.
4. **Autoplay audio bloqué** — sans geste utilisateur préalable, `speechSynthesis` est muet sur iOS/Safari. L'écran 0 « Démarrer » (appuyé par l'accueillant) est obligatoire.
5. **Emoji ambigus ou culturels** — uniquement des emoji concrets univoques (🚕 🍞 📞 ☕ 🐱), jamais symboliques (👌 🙏 💫), pas de teintes de peau ; vérifier le rendu Android vs iOS (🥖 vs 🍞) ; l'emoji n'est jamais seul porteur d'un sens critique : toujours couplé à l'audio.
6. **Réutiliser le même mot en CO et en lecture** — effet d'apprentissage (BUS entendu en I3 aiderait à le « lire » en I11). Lexiques disjoints par phase (spec ci-dessus déjà conforme).
7. **Le prénom reconnu ≠ lecture** — comme la signature, il peut être mémorisé globalement. D'où le seuil L0 ≥ 2/3 et le palier L1 obligatoire avant tout classement post-alpha.
8. **MAJUSCULES vs minuscules** — piège documenté au DILF. Tous les stimuli lecture en CAPITALES (script le plus reconnu), sauf la phrase I13 en script standard (c'est justement le seuil A1.1).
9. **Chronométrage punitif** — les réponses très rapides signalent l'évitement, pas la réflexion ; le temps est loggé comme signal, jamais comme score.
10. **Stigmatisation** — aucune croix rouge, aucun son d'échec, aucun compteur textuel ; restitution en « savoir-faire » avec volume horaire de parcours, pas en déficit.
11. **Déclaratif seul insuffisant** — la scolarisation déclarée (I1) route la pédagogie mais ne classe jamais seule ; zone grise 2-5 ans → trancher par les mesures L0-L2 (garde-fous §3).
12. **Le numérique ne conclut pas en bas de l'échelle** — consensus ANLCI/LESLLA : sous A1.1, le test est un outil de REPÉRAGE qui débouche sur un entretien humain, pas un verdict. L'écran de résultat côté formateur doit afficher « à confirmer en entretien ».
13. **Ne pas oublier les nombres après un échec de lettres** — la numératie est souvent préservée (tous les outils de terrain la testent systématiquement) ; c'est une force à valoriser et un discriminant pré-alpha/alpha.
14. **Scolarisé dans un autre alphabet ≠ alpha** — un lecteur en arabe/russe est FLE (transfert rapide) même s'il bute sur l'alphabet latin ; la discordance « SCOL_OK + L0 faible » déclenche la 2e série d'items, pas un classement alpha direct.
15. **RGPD** — prénom, scolarisation et latences sont des données personnelles : minimisation, pas de stockage du prénom dans les logs d'items, purge alignée sur la politique existante de l'organisme.