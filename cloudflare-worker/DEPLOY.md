# Déploiement Cloudflare Worker — Stripe Webhook

## Prérequis
- Compte Cloudflare (gratuit)
- Node.js installé

## Étapes

### 1. Installer Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. Récupérer les secrets

**STRIPE_WEBHOOK_SECRET** :
- Stripe Dashboard → Développeurs → Webhooks → Ajouter un endpoint
- URL : `https://stripe-webhook-mon-budget.VOTRE_SOUS_DOMAINE.workers.dev`
- Événements à sélectionner :
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
- Copier le "Secret de signature" (whsec_...)

**FIREBASE_DB_SECRET** :
- Firebase Console → Projet mon-budget-licences → Paramètres → Comptes de service
- Onglet "Secrets de base de données"
- Copier le secret actif

### 3. Configurer les secrets dans Cloudflare
```bash
cd cloudflare-worker
wrangler secret put STRIPE_WEBHOOK_SECRET
# → coller le whsec_...

wrangler secret put FIREBASE_DB_SECRET
# → coller le secret Firebase
```

### 4. Déployer
```bash
wrangler deploy
```

L'URL du worker sera affiché : `https://stripe-webhook-mon-budget.XXXX.workers.dev`

### 5. Configurer le webhook Stripe
- Retourner dans Stripe Dashboard → Webhooks
- Créer l'endpoint avec l'URL du worker
- Sélectionner les 3 événements ci-dessus
- Copier le secret de signature et le reconfigurer si nécessaire :
  ```bash
  wrangler secret put STRIPE_WEBHOOK_SECRET
  ```

### 6. Tester
- Stripe Dashboard → Webhooks → Envoyer un événement test
- Vérifier les logs : `wrangler tail`

## Structure Firebase générée par le webhook

```
users/
  {uid}/
    premium: true | false
    stripe/
      customer: "cus_..."
      subscription: "sub_..."
      plan: "monthly" | "yearly"
      activatedAt: 1234567890
      renewedAt: 1234567890
      cancelledAt: 1234567890
      email: "user@example.com"

stripe_customers/
  cus_XXXXX: "{uid}"   ← mapping inverse pour annulation
```

## Notes
- Le worker vérifie la signature Stripe (sécurisé)
- Protection anti-replay (max 5 minutes)
- Si l'utilisateur n'est pas connecté au moment du paiement → stocké dans `pending_premiums/{email}`
- Le plan Free redevient actif automatiquement à l'annulation de l'abonnement Stripe
