import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAMPAIGN,
  OPPOSITION_LIST_NAME,
  OPPOSITION_REASON,
  actionFor,
  blocklistValues,
  bridgeCampaign,
  isOppositionReason,
  lemlistUnsubscribe,
  parseLemlistEvent,
  secretMatches,
  type LemlistEvent,
} from "@/lib/prospection/lemlist";
import { applyLemlistEvent, type LemlistStore, type LeadRow, type ProspectRow } from "@/lib/prospection/lemlist-bridge";
import { LOST_REASONS } from "@/lib/leads/status";
import { manualOnlyLead } from "@/lib/leads/templates";

const ORG = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORG = "b0000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-11-04T10:00:00Z");
const SECRET = "un-secret-de-test-assez-long";

function event(o: Record<string, unknown>): LemlistEvent {
  const e = parseLemlistEvent({ _id: "act_1", type: "emailsReplied", leadEmail: "Gerant@Resto-Test.fr", leadCompanyName: "Resto Test", leadFirstName: "Karim", createdAt: NOW.toISOString(), secret: SECRET, ...o });
  if (!e) throw new Error("événement invalide");
  return e;
}

// ── Store en mémoire, qui respecte le filtre org_id comme la version Supabase ──
function memoryStore(seed: { prospects?: (ProspectRow & { org_id: string; siret?: string | null })[]; leads?: (LeadRow & { org_id: string; email: string | null })[] } = {}) {
  const prospects = [...(seed.prospects ?? [])].map((p) => ({ ...p, notes: null as string | null }));
  const leads: Record<string, unknown>[] = [...(seed.leads ?? [])];
  const leadEvents: Record<string, unknown>[] = [];
  const prospectNotes: { org_id: string; prospect_id: string; note: string }[] = [];
  const lists: { id: string; org_id: string; name: string }[] = [];
  let n = 0;
  const store: LemlistStore = {
    async alreadySeen(orgId, marker) {
      return [...leadEvents.map((e) => [e.org_id, e.note]), ...prospectNotes.map((e) => [e.org_id, e.note]), ...prospects.map((p) => [p.org_id, p.notes])]
        .some(([o, note]) => o === orgId && String(note ?? "").includes(marker));
    },
    async findProspect(orgId, by) {
      return prospects.find((p) => p.org_id === orgId && ((by.siret && p.siret === by.siret) || (by.email && p.email?.toLowerCase() === by.email))) ?? null;
    },
    async findLead(orgId, by) {
      const l = leads.find((x) => x.org_id === orgId && ((by.id && x.id === by.id) || (by.email && String(x.email ?? "").toLowerCase() === by.email)));
      return (l as LeadRow | undefined) ?? null;
    },
    async defaultOwner() { return "setter-1"; },
    async insertLead(row) { const id = `lead-${++n}`; leads.push({ ...row, id }); return id; },
    async updateLead(orgId, id, patch) { const l = leads.find((x) => x.id === id && x.org_id === orgId); if (l) Object.assign(l, patch); },
    async insertLeadEvent(row) { leadEvents.push(row); },
    async updateProspect(orgId, id, patch) { const p = prospects.find((x) => x.id === id && x.org_id === orgId); if (p) Object.assign(p, patch); },
    async insertProspectNote(orgId, prospectId, note) { prospectNotes.push({ org_id: orgId, prospect_id: prospectId, note }); },
    async oppositionListId(orgId) {
      let l = lists.find((x) => x.org_id === orgId && x.name === OPPOSITION_LIST_NAME);
      if (!l) { l = { id: `list-${++n}`, org_id: orgId, name: OPPOSITION_LIST_NAME }; lists.push(l); }
      return l.id;
    },
    async insertProspect(row) { const id = `prospect-${++n}`; prospects.push({ ...(row as unknown as ProspectRow & { org_id: string }), id, lead_id: null, notes: (row.notes as string) ?? null }); return id; },
  };
  return { store, prospects, leads, leadEvents, prospectNotes, lists };
}

const prospect = (o: Partial<ProspectRow & { org_id: string; siret: string | null }> = {}) => ({
  id: "p1", org_id: ORG, list_id: "l1", company: "Resto Test", status: "a_appeler", phone: "+33142360742", email: "gerant@resto-test.fr",
  lead_id: null, city: "Pantin", postal_code: "93500", siret: "12345678900011", ...o,
});

const deps = () => ({ unsubscribe: vi.fn(async (values: string[]) => ({ done: values, failed: [] })), now: NOW });

describe("lemlist : lecture et classement des événements", () => {
  it("lit les champs lead* et normalise l'e-mail", () => {
    const e = event({ text: "Bonjour, on recrute un commis", siret: "123 456 789 00011" });
    expect(e).toMatchObject({ activityId: "act_1", email: "gerant@resto-test.fr", companyName: "Resto Test", siret: "12345678900011", secret: SECRET });
  });

  it("refuse un corps sans type", () => {
    expect(parseLemlistEvent({ email: "x@y.fr" })).toBeNull();
    expect(parseLemlistEvent("texte")).toBeNull();
  });

  it("classe une désinscription et un stop écrit comme une opposition", () => {
    expect(actionFor({ type: "emailsUnsubscribed", text: null })).toBe("opposition");
    for (const t of ["STOP", "Merci de ne plus me contacter", "Retirez-moi de votre liste", "Désinscrivez-moi", "arrêtez de m'écrire", "c'est du spam"]) {
      expect(actionFor({ type: "emailsReplied", text: t }), t).toBe("opposition");
    }
  });

  it("classe une vraie réponse, un message d'absence, un intéressé, un rebond", () => {
    expect(actionFor({ type: "emailsReplied", text: "Oui appelez-moi demain après 15h" })).toBe("reply");
    expect(actionFor({ type: "emailsReplied", text: "Je suis absent, de retour le 12/11" })).toBe("absence");
    expect(actionFor({ type: "emailsInterested", text: null })).toBe("interested");
    expect(actionFor({ type: "emailsBounced", text: null })).toBe("bounce");
    expect(actionFor({ type: "emailsOpened", text: null })).toBe("ignore");
    expect(actionFor({ type: "emailsSent", text: null })).toBe("ignore");
  });

  it("vérifie le secret à temps constant et refuse un secret trop court", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches("mauvais", SECRET)).toBe(false);
    expect(secretMatches(null, SECRET)).toBe(false);
    expect(secretMatches("court", "court")).toBe(false);
  });

  it("garde la raison « Opposition » dans la liste des raisons de perte", () => {
    expect(LOST_REASONS).toContain(OPPOSITION_REASON);
    expect(isOppositionReason("Opposition — ne plus contacter (04/11/2026, e-mail)")).toBe(true);
    expect(isOppositionReason("Injoignable après 5 tentatives")).toBe(false);
  });

  it("prend la campagne du pilote par défaut", () => {
    expect(bridgeCampaign({})).toBe(DEFAULT_CAMPAIGN);
    expect(DEFAULT_CAMPAIGN).toBe("poei_sortante_2026-11");
    expect(bridgeCampaign({ LEMLIST_CAMPAGNE: "fle_opco_2026-12" })).toBe("fle_opco_2026-12");
  });
});

describe("lemlist : liste de blocage", () => {
  it("bloque e-mail, téléphone et LinkedIn, sans doublon", () => {
    expect(blocklistValues({ email: " A@B.fr ", phone: "+33 1 42 36 07 42", linkedinUrl: null })).toEqual(["a@b.fr", "+33142360742"]);
  });

  it("appelle l'API v2 en Basic auth (identifiant vide, clé en mot de passe)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await lemlistUnsubscribe(["a@b.fr"], { apiKey: "cle", fetchImpl });
    expect(r).toEqual({ done: ["a@b.fr"], failed: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.lemlist.com/api/v2/unsubscribes/variables/a%40b.fr");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(":cle").toString("base64")}`);
  });

  it("ne fait rien sans clé et le signale", async () => {
    const fetchImpl = vi.fn();
    expect(await lemlistUnsubscribe(["a@b.fr"], { apiKey: null, fetchImpl })).toEqual({ done: [], failed: ["a@b.fr"], skipped: "no_api_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("compte un échec réseau sans jeter d'erreur", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("réseau"); });
    expect(await lemlistUnsubscribe(["a@b.fr"], { apiKey: "cle", fetchImpl })).toEqual({ done: [], failed: ["a@b.fr"] });
  });
});

describe("lemlist → ERP : application des règles", () => {
  it("une réponse crée un lead source « prospection », campagne du pilote, sans envoi automatique possible", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    const r = await applyLemlistEvent(m.store, ORG, event({ text: "Oui, on cherche un serveur" }), deps());
    expect(r).toMatchObject({ action: "reply", createdLead: true, prospectId: "p1" });
    const lead = m.leads[0];
    expect(lead).toMatchObject({ org_id: ORG, source: "prospection", campaign: "poei_sortante_2026-11", offer: "poei", status: "contacte", owner_user_id: "setter-1", company: "Resto Test", email: "gerant@resto-test.fr", next_action_on: "2026-11-04" });
    expect(manualOnlyLead(lead as { source: string })).toBe(true);
    expect(m.prospects[0]).toMatchObject({ lead_id: r.leadId, status: "a_appeler" }); // le classement reste humain
    expect(m.leadEvents[0].note).toContain("[lemlist act_1]");
  });

  it("ne traite jamais deux fois la même activité", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    await applyLemlistEvent(m.store, ORG, event({ text: "Oui" }), deps());
    const again = await applyLemlistEvent(m.store, ORG, event({ text: "Oui" }), deps());
    expect(again.action).toBe("duplicate");
    expect(m.leads).toHaveLength(1);
  });

  it("une réponse sur un lead existant ne le recrée pas et ne rouvre pas un lead clos", async () => {
    const m = memoryStore({ leads: [{ id: "L1", org_id: ORG, status: "perdu", source: "prospection", email: "gerant@resto-test.fr" }] });
    const r = await applyLemlistEvent(m.store, ORG, event({ text: "Finalement oui" }), deps());
    expect(r).toMatchObject({ leadId: "L1", createdLead: false });
    expect(m.leads).toHaveLength(1);
    expect(m.leads[0].status).toBe("perdu");
  });

  it("« intéressé » passe la fiche Prospection en « Intéressé »", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    await applyLemlistEvent(m.store, ORG, event({ _id: "act_2", type: "emailsInterested" }), deps());
    expect(m.prospects[0].status).toBe("interesse");
    expect(m.leads[0]).toMatchObject({ source: "prospection", status: "contacte" });
  });

  it("un stop : « Ne plus appeler », lead « Perdu » pour opposition, liste de blocage lemlist", async () => {
    const m = memoryStore({
      prospects: [prospect({ lead_id: "L1" })],
      leads: [{ id: "L1", org_id: ORG, status: "contacte", source: "prospection", email: "gerant@resto-test.fr" }],
    });
    const d = deps();
    const r = await applyLemlistEvent(m.store, ORG, event({ _id: "act_3", text: "STOP merci" }), d);
    expect(r.action).toBe("opposition");
    expect(m.prospects[0].status).toBe("ne_plus_appeler");
    expect(m.leads[0]).toMatchObject({ status: "perdu", lost_reason: "Opposition — ne plus contacter (04/11/2026, e-mail)", next_action: null });
    expect(d.unsubscribe).toHaveBeenCalledWith(["gerant@resto-test.fr", "+33142360742"]);
    expect(m.prospectNotes[0].note).toContain("STOP merci");
  });

  it("un stop sans lead ne crée pas de lead (grille, cas 5)", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    await applyLemlistEvent(m.store, ORG, event({ _id: "act_4", type: "emailsUnsubscribed" }), deps());
    expect(m.leads).toHaveLength(0);
    expect(m.prospects[0].status).toBe("ne_plus_appeler");
  });

  it("un stop d'un contact absent de Prospection l'y inscrit « Ne plus appeler » pour ne jamais le réimporter", async () => {
    const m = memoryStore();
    const r = await applyLemlistEvent(m.store, ORG, event({ _id: "act_5", type: "emailsUnsubscribed", siret: "98765432100019" }), deps());
    expect(m.lists[0].name).toBe(OPPOSITION_LIST_NAME);
    expect(m.prospects[0]).toMatchObject({ id: r.prospectId, org_id: ORG, status: "ne_plus_appeler", siret: "98765432100019", email: "gerant@resto-test.fr", contact_source: "lemlist" });
    expect(m.leads).toHaveLength(0);
  });

  it("n'écrit jamais dans une autre organisation", async () => {
    const m = memoryStore({ prospects: [prospect({ org_id: OTHER_ORG })], leads: [{ id: "L9", org_id: OTHER_ORG, status: "contacte", source: "site", email: "gerant@resto-test.fr" }] });
    await applyLemlistEvent(m.store, ORG, event({ _id: "act_6", text: "stop" }), deps());
    expect(m.prospects.find((p) => p.org_id === OTHER_ORG)?.status).toBe("a_appeler");
    expect(m.leads.find((l) => l.id === "L9")?.status).toBe("contacte");
  });

  it("un rebond sans téléphone : « Injoignable » ; avec téléphone : simple note", async () => {
    const sans = memoryStore({ prospects: [prospect({ phone: null })] });
    await applyLemlistEvent(sans.store, ORG, event({ _id: "act_7", type: "emailsBounced" }), deps());
    expect(sans.prospects[0].status).toBe("injoignable");
    const avec = memoryStore({ prospects: [prospect()] });
    await applyLemlistEvent(avec.store, ORG, event({ _id: "act_8", type: "emailsBounced" }), deps());
    expect(avec.prospects[0].status).toBe("a_appeler");
    expect(avec.prospectNotes).toHaveLength(1);
  });

  it("un message d'absence ne change aucun statut et ne crée pas de lead", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    await applyLemlistEvent(m.store, ORG, event({ _id: "act_9", text: "Réponse automatique : je suis absent jusqu'au 15/11" }), deps());
    expect(m.leads).toHaveLength(0);
    expect(m.prospects[0].status).toBe("a_appeler");
  });

  it("ignore les ouvertures et les envois", async () => {
    const m = memoryStore({ prospects: [prospect()] });
    expect((await applyLemlistEvent(m.store, ORG, event({ type: "emailsOpened" }), deps())).action).toBe("ignore");
    expect(m.prospectNotes).toHaveLength(0);
  });
});
