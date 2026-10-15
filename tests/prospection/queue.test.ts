import { describe, expect, it } from "vitest";
import { callQueue, isDue, listStats, type QueueProspect } from "@/lib/prospection/queue";

const TODAY = "2026-10-16";
const base: QueueProspect = {
  id: "x", status: "a_appeler", phone: "+33142360742", attempts: 0, last_call_at: null, callback_on: null, opened_on: "2026-03-01", company: "X",
};
const p = (o: Partial<QueueProspect>): QueueProspect => ({ ...base, ...o });

describe("prospection : file d'appels du jour", () => {
  it("met les rappels promis d'abord, puis les jamais appelés (ouvertures récentes d'abord), puis les nouveaux essais", () => {
    const q = callQueue([
      p({ id: "essai", status: "pas_joint", attempts: 1, last_call_at: "2026-10-14T08:00:00Z", callback_on: "2026-10-15" }),
      p({ id: "ancien", opened_on: "2026-01-05" }),
      p({ id: "recent", opened_on: "2026-07-01" }),
      p({ id: "rappel", status: "rappeler", attempts: 1, last_call_at: "2026-10-12T08:00:00Z", callback_on: TODAY }),
      p({ id: "sans-numero", phone: null, opened_on: "2026-07-20" }),
    ], TODAY);
    expect(q.map((x) => x.id)).toEqual(["rappel", "recent", "ancien", "essai", "sans-numero"]);
  });

  it("n'appelle pas deux fois le même jour, ni avant la date de rappel", () => {
    expect(isDue(p({ status: "pas_joint", attempts: 1, last_call_at: "2026-10-16T08:00:00Z" }), TODAY)).toBe(false);
    expect(isDue(p({ status: "rappeler", callback_on: "2026-10-20" }), TODAY)).toBe(false);
    expect(isDue(p({ status: "barrage", attempts: 1, last_call_at: "2026-10-16T08:00:00Z", callback_on: TODAY }), TODAY)).toBe(true);
    expect(isDue(p({ status: "ne_plus_appeler" }), TODAY)).toBe(false);
  });

  it("calcule les chiffres d'une liste", () => {
    const s = listStats([
      p({ id: "a" }),
      p({ id: "b", status: "pas_joint", attempts: 2, last_call_at: "2026-10-15T08:00:00Z", callback_on: TODAY }),
      p({ id: "c", status: "interesse", attempts: 1 }),
      p({ id: "d", status: "barrage", attempts: 1, callback_on: "2026-10-19" }),
    ], TODAY);
    expect(s).toEqual({ total: 4, due: 2, called: 3, reached: 2, interested: 1, closed: 1 });
  });
});
