# Emails Supabase en français

Les emails d'invitation et de réinitialisation partent avec les templates anglais par
défaut de Supabase. Pour les franciser (une seule fois) :

**Dashboard Supabase → projet `zkpmbbuuvbkcoelnrcyo` → Authentication → Email Templates**,
puis remplacer le sujet et le corps de chaque template ci-dessous.
Ne pas toucher aux variables `{{ .ConfirmationURL }}` : c'est le lien magique.

## Invite user (invitation)

Sujet : `Votre accès à l'ERP ParlerEmploi Formation`

```html
<h2>Bienvenue !</h2>
<p>Un compte vient d'être créé pour vous sur l'ERP de ParlerEmploi Formation
(planning, émargements, suivi des groupes).</p>
<p><a href="{{ .ConfirmationURL }}">Cliquez ici pour choisir votre mot de passe
et accéder à l'ERP</a>.</p>
<p>Ce lien est personnel et à usage unique. Si vous n'êtes pas concerné(e) par
ce message, ignorez-le simplement.</p>
<p>— L'équipe ParlerEmploi Formation</p>
```

## Reset password (réinitialisation)

Sujet : `Réinitialisation de votre mot de passe — ERP PEF`

```html
<h2>Réinitialisation de mot de passe</h2>
<p>Une demande de réinitialisation a été faite pour votre compte ERP
ParlerEmploi Formation.</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :
votre mot de passe reste inchangé.</p>
<p>— L'équipe ParlerEmploi Formation</p>
```

## Confirm signup (confirmation d'inscription — rarement utilisé ici)

Sujet : `Confirmez votre adresse email — ERP PEF`

```html
<h2>Confirmation d'adresse email</h2>
<p><a href="{{ .ConfirmationURL }}">Cliquez ici pour confirmer votre adresse</a>
et activer votre compte ERP ParlerEmploi Formation.</p>
<p>— L'équipe ParlerEmploi Formation</p>
```

## Optionnel : expéditeur personnalisé

Par défaut l'expéditeur est `noreply@mail.app.supabase.io`. Pour envoyer depuis
`erp@parleremploi.fr` : Authentication → **SMTP Settings** → renseigner un SMTP
(par ex. celui de Google Workspace : smtp.gmail.com, port 587, un mot de passe
d'application du compte). Facultatif — les emails fonctionnent sans.
