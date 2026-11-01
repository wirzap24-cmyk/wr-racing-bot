# WR Racing Bot — mise en ligne sur Railway

## Ce que fait le bot
- `/devis-faisceau` et `/devis-prepa` : ouvre un formulaire, puis crée le devis dans le bon forum, le dossier client complet (infos, demande, pièces, performances, avantages, prix) et l'envoie dans l'espace privé du client.
- `/statut` : à taper dans un devis ou un dossier pour changer son tag d'avancement.
- `/setup-tickets` : installe le bouton « Faire une demande » dans le salon ouvrir-un-ticket. Chaque client qui clique obtient un salon privé avec l'équipe.
- Shopify : nouvelles commandes, nouveaux clients et mises à jour de stock arrivent automatiquement dans la catégorie SHOPIFY.

## 1. Récupérer l'identifiant du serveur (GUILD_ID)
Discord → Paramètres utilisateur → Avancés → active **Mode développeur**.
Clic droit sur le serveur WR Racing → **Copier l'identifiant du serveur**.

## 2. Mettre le code sur GitHub
1. Crée un compte sur github.com si tu n'en as pas.
2. Bouton **New repository** → nom `wr-racing-bot` → coche **Private** → **Create repository**.
3. Clique sur **uploading an existing file**, glisse les fichiers `index.js`, `config.js`, `package.json` et ce fichier, puis **Commit changes**.

## 3. Lancer sur Railway
1. Va sur railway.com → **Login** avec ton compte GitHub.
2. **New Project** → **Deploy from GitHub repo** → choisis `wr-racing-bot`.
3. Onglet **Variables** → ajoute :
   - `DISCORD_TOKEN` = le token du bot
   - `GUILD_ID` = l'identifiant copié à l'étape 1
4. Railway redémarre le bot tout seul. Dans Discord, le salon logs-bot doit afficher « 🟢 WR Racing Bot démarré ».
5. Onglet **Settings** → **Networking** → **Generate Domain** : garde l'adresse obtenue, elle sert pour Shopify.

## 4. Réglage Discord important
Paramètres du serveur → Rôles : fais glisser le rôle du bot (**WR Racing Bot**) tout en haut de la liste, au-dessus de Client, sinon il ne pourra pas donner le rôle Client.
Puis tape `/setup-tickets` une fois.

## 5. Brancher Shopify
Admin Shopify → Paramètres → Notifications → **Webhooks** → Créer un webhook, format JSON, URL :
`https://TON-DOMAINE-RAILWAY/shopify/webhook`
À créer pour : Création de commande, Création de client, Mise à jour de produit.
Shopify affiche une clé de signature des webhooks : ajoute-la dans Railway → Variables → `SHOPIFY_WEBHOOK_SECRET`.

## Modifier les textes
Les performances et avantages de chaque stage et de chaque faisceau sont dans `config.js`. Modifie-les directement sur GitHub : Railway relance le bot automatiquement.
