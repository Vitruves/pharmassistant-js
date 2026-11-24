# Sources et citations

Chaque réponse est rédigée à partir des bases documentaires interrogées pour la question. L'option `citations` choisit comment ces sources vous reviennent.

## `citations: "list"` (défaut)

La réponse ne porte aucune marque de source. Les références sont rendues à part, par base interrogée :

```ts
const reponse = await client.ask("Amoxicilline et allaitement ?");

for (const [base, references] of Object.entries(reponse.sources)) {
  console.log(base);
  for (const ref of references) console.log("  ", ref.title, ref.url ?? "(base locale, sans lien)");
}

for (const ref of reponse.allSources()) console.log(ref.title);   // à plat, sans doublon
```

`url` vaut `null` pour une base sans adresse publique.

## `citations: "inline"`

Chaque fait de la réponse se termine par le repère de sa source, `[S1]` ou `[S2][S4]`. Une question qu'aucune source ne couvre reçoit un aveu, jamais une réponse de mémoire.

```ts
const reponse = await client.ask("Ibuprofène et grossesse ?", { citations: "inline" });
console.log(reponse.answer);
// … contre-indiqué à partir du début du sixième mois.[S1][S2]
```

Trois champs résolvent les repères :

| Champ | Contenu |
|---|---|
| `references` | le registre numéroté : `[S3]` renvoie à la `Reference` dont `n` vaut 3 (`tool`, `title`, `url`, `empty`, `query`) |
| `passages` | pour chaque repère, l'extrait de la source qui porte la phrase, apparié par son rang dans le texte (`index`) |
| `answer` | le texte, avec ses repères |

### Parcourir les repères

`iterCitations()` rend chaque repère dans l'ordre du texte, avec sa référence et son extrait déjà appariés :

```ts
for (const c of reponse.iterCitations()) {
  console.log(`[S${c.n}] repère n° ${c.rank}, signes ${c.start} à ${c.end}`);
  if (c.reference) console.log("   source :", c.reference.title, c.reference.url);
  if (c.passage?.quote) console.log("   extrait :", c.passage.quote);
}
```

`start` et `end` sont les positions du repère dans `answer` : de quoi le remplacer par un lien, voir la recette [Rendre les citations en HTML](recettes.md#rendre-les-citations-en-html).

### Les extraits

Un `Passage` prend deux formes exclusives :

- de la prose : `quote`, avec son contexte `before` et `after` ;
- une fiche de données (`record` non nul) : lignes `label` / `value`, `cited` marquant celles qui portent un mot de la phrase, et `record_title`.

```ts
for (const p of reponse.passages) {
  if (p.record) {
    console.log(p.record_title);
    for (const ligne of p.record) console.log(` ${ligne.cited ? "→" : " "} ${ligne.label} : ${ligne.value}`);
  } else {
    console.log(`…${p.before ?? ""}«${p.quote}»${p.after ?? ""}…`);
  }
}
```

Un repère dont l'extrait n'a pas été retrouvé avec assez de certitude n'a pas de passage : jamais un extrait à côté. L'extrait vient de la copie du texte fournie au moteur, pas d'une relecture de la page d'origine.

### Bases interrogées sans résultat

Une référence dont `empty` vaut `true` est une base consultée qui n'a rien rendu ; `query` dit ce qui a été cherché. La phrase qui la cite rapporte cette absence, ce qui est une information en soi.

```ts
for (const ref of reponse.references.filter((r) => r.empty)) {
  console.log(`[S${ref.n}] ${ref.tool} : rien sur « ${ref.query} »`);
}
```

### Le texte sans repères

```ts
const texte = reponse.answerWithoutMarkers();
```

Utile pour une synthèse vocale, un SMS, ou un historique de conversation : c'est ce que fait [`startConversation`](conversations.md) pour l'historique local.

## En flux

Avec `askStream(…, { citations: "inline" })`, le registre arrive avant le premier mot, dans l'événement `references` : vous pouvez préparer l'affichage des sources pendant que le texte se rédige. Voir [Réponse en flux](flux.md#suivre-chaque-étape).
