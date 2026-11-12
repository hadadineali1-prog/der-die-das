# Der Die Das — entraîneur d'articles allemands

Petite application web pour apprendre le genre des noms allemands : un mot s'affiche
(`Hund`, `Katze`, `Haus`…) et tu choisis **der**, **die** ou **das**.

Pas de compte, pas de serveur, pas de publicité. Tout fonctionne dans le navigateur et
les progrès restent sur l'appareil.

**[Ouvrir l'application](https://URL_A_REMPLACER/)**

---

## Französisch

### Was die App macht

- **735 noms allemands** : 328 A1, 136 A2, 158 B1, 113 B2.
- **Wiederholung mit Abständen** (répétition espacée) : 10 min → 1 j → 3 j → 7 j → 3 sem. → 2 mois.
- **Fehler kommen zurück** : un mot raté revient après 3 autres mots, puis reste dans « Mes erreurs ».
- **Niveaux** : Tous, A1, A2, B1, B2.
- **Themen** : Tiere, Essen, Haus, Arbeit, Stadt, Natur, Gesellschaft…
- **Statistiken** : précision par article, matrice de confusion, 14 derniers jours, liste des pièges.
- **Aussprache** : voix allemande du navigateur (bouton 🔊, ou touche `R`).
- **Eigene Wörter** : ajoute tes propres mots (Réglages → Ajouter un mot).
- **Offline** : installable sur l'écran d'accueil, fonctionne sans réseau.

### Technik

Vanilla HTML/CSS/JavaScript, sans dépendance, sans build. Trois fichiers :

| Fichier | Rôle |
|---|---|
| `index.html` | interface (HTML + CSS) |
| `app.js` | logique : sélection des mots, mémoire espacée, statistiques, réglages |
| `mots.js` | base de vocabulaire (modifiable) |
| `manifest.webmanifest` + `sw.js` | installation et mode hors ligne |

Les données sont stockées dans `localStorage` sous la clé `ddd.v1`. Le service worker
suit une stratégie *stale-while-revalidate* : l'appli s'affiche immédiatement puis se met
à jour en arrière-plan.

### En local

Ouvre `index.html` dans un navigateur. Certaines fonctions (service worker, installation)
nécessitent `http://` ou `https://` ; pour tester :

```bash
npx serve .
```

### Raccourcis clavier

| Touche | Action |
|---|---|
| `1` ou `A` | der |
| `2` ou `S` | die |
| `3` ou `D` | das |
| `Entrée` | mot suivant |
| `R` | réécouter le mot |

### Ajouter des mots

Chaque ligne de `mots.js` suit ce format :

```js
["der","Hund","die Hunde","le chien","Animaux","A1"],
```

`article`, `nom`, `pluriel`, `traduction`, `thème`, `niveau`. Utilise `"—"` quand il n'y a
pas de pluriel.

### Lizenz

MIT — voir `LICENSE`.
