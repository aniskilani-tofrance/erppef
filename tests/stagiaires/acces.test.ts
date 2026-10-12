import { describe, expect, it } from "vitest";
import { canDownloadKit } from "@/lib/kits";
import { stagiairePathAllowed } from "@/lib/stagiaire-paths";
import { canAccessGroup } from "@/lib/stagiaires";

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";

describe("stagiaire : accès aux groupes", () => {
  it("ne voit que les groupes auxquels il est rattaché", () => {
    expect(canAccessGroup("stagiaire", G1, [G1], ["admin", "coordinator", "stagiaire"])).toBe(true);
    expect(canAccessGroup("stagiaire", G2, [G1], ["admin", "coordinator", "stagiaire"])).toBe(false);
  });
  it("même rattaché, pas d'accès si la route ne l'autorise pas", () => {
    expect(canAccessGroup("stagiaire", G1, [G1], ["admin", "coordinator"])).toBe(false);
  });
  it("les autres rôles gardent leur règle habituelle", () => {
    expect(canAccessGroup("coordinator", G2, [], ["admin", "coordinator"])).toBe(true);
    expect(canAccessGroup("trainer", G2, [], ["admin", "coordinator"])).toBe(false);
  });
});

describe("stagiaire : kits de séance", () => {
  const session = { trainerId: "t1", coTrainerId: null, groupId: G1 };
  it("télécharge le kit d'une séance de son groupe", () => {
    expect(canDownloadKit({ role: "stagiaire", myTrainerId: null, myGroupIds: [G1], session })).toBe(true);
  });
  it("pas le kit d'un autre groupe, ni sans groupe connu", () => {
    expect(canDownloadKit({ role: "stagiaire", myTrainerId: null, myGroupIds: [G2], session })).toBe(false);
    expect(canDownloadKit({ role: "stagiaire", myTrainerId: null, myGroupIds: [G1], session: { ...session, groupId: null } })).toBe(false);
  });
  it("la règle des formateurs ne change pas", () => {
    expect(canDownloadKit({ role: "trainer", myTrainerId: "t1", session })).toBe(true);
    expect(canDownloadKit({ role: "trainer", myTrainerId: "t9", myGroupIds: [G1], session })).toBe(false);
  });
});

describe("stagiaire : pages autorisées", () => {
  it.each(["/dashboard", "/groupes", `/groupes/${G1}`, `/groupes/${G1}/assiduite`, `/groupes/${G1}/certificat/x`, "/planning", "/planning/telecharger", `/seances/${G1}/emargement`, "/formation", "/aide", "/compte"])(
    "ouvre %s",
    (path) => expect(stagiairePathAllowed(path)).toBe(true),
  );
  it.each(["/apprenants", "/apprenants/admission", "/formateurs", "/parametres", "/leads", "/candidats-poei", "/qualite", "/rapports", "/evaluations", "/recherche", "/groupes/nouveau", `/groupes/${G1}/evaluations`, `/groupes/${G1}/attestation/x`, "/groupesX"])(
    "bloque %s",
    (path) => expect(stagiairePathAllowed(path)).toBe(false),
  );
});
