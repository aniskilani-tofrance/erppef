// Distracteurs visuels du prénom (item « reconnaître son prénom » du bloc littératie).
// Module SÉPARÉ de la banque d'items : le lecteur de test (navigateur) l'importe sans
// embarquer les questions ni leurs bonnes réponses.
// Banque de distracteurs pour l'item prénom (généré côté lecteur) : on fabrique des
// pseudo-prénoms proches (même initiale, longueur voisine) — jamais de vrais prénoms
// d'autres apprenants.
export function nameDistractors(firstName) {
  const name = (firstName || "AMINA").toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "").slice(0, 12) || "AMINA";
  const letters = "AEIOULMNRST";
  const swap = (s, i, j) => {
    const a = s.split("");
    [a[i], a[j]] = [a[j], a[i]];
    return a.join("");
  };
  const variants = new Set();
  if (name.length >= 4) variants.add(swap(name, 1, 2));                 // lettres internes inversées
  variants.add(name.slice(0, -1) + (name.endsWith("A") ? "I" : "A"));   // finale changée
  const mid = Math.floor(name.length / 2);
  variants.add(name.slice(0, mid) + letters[(name.charCodeAt(mid) || 65) % letters.length] + name.slice(mid + 1));
  variants.delete(name);
  const list = [...variants].slice(0, 3);
  // Complément pour les prénoms très courts : finale substituée, jamais le prénom lui-même.
  for (const letter of letters) {
    if (list.length >= 3) break;
    const candidate = name.slice(0, -1) + letter;
    if (candidate !== name && !list.includes(candidate)) list.push(candidate);
  }
  return list;
}
