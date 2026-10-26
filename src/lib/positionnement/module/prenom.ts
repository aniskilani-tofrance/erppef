// Item 108 (« Touchez votre prénom ») : pseudo-prénoms proches du vrai (même initiale, longueur
// voisine), fabriqués à l'affichage. Jamais de vrais prénoms d'autres personnes.

export function distracteursPrenom(prenom: string): string[] {
  const nom = (prenom || "AMINA").toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "").slice(0, 12) || "AMINA";
  const lettres = "AEIOULMNRST";
  const echanger = (s: string, i: number, j: number) => {
    const a = s.split("");
    [a[i], a[j]] = [a[j], a[i]];
    return a.join("");
  };
  const variantes = new Set<string>();
  if (nom.length >= 4) variantes.add(echanger(nom, 1, 2));
  variantes.add(nom.slice(0, -1) + (nom.endsWith("A") ? "I" : "A"));
  const milieu = Math.floor(nom.length / 2);
  variantes.add(nom.slice(0, milieu) + lettres[(nom.charCodeAt(milieu) || 65) % lettres.length] + nom.slice(milieu + 1));
  variantes.delete(nom);
  const liste = [...variantes].slice(0, 3);
  for (const l of lettres) {
    if (liste.length >= 3) break;
    const c = nom.slice(0, -1) + l;
    if (c !== nom && !liste.includes(c)) liste.push(c);
  }
  return liste;
}
