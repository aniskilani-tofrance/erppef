import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { weekStartOf } from "@/lib/dates";
import { RoomFormDialog } from "@/components/salles/room-form-dialog";
import { DoorOpen } from "lucide-react";

// 45 h de plage utile hebdo (9h-18h × 5 j) : approximation V1 du taux d'occupation
const WEEKLY_CAPACITY_HOURS = 45;

export default async function SallesPage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const weekStart = weekStartOf(new Date().toISOString().slice(0, 10));

  const [{ data: rooms }, { data: loads }] = await Promise.all([
    supabase.from("rooms").select("*").order("name"),
    supabase.from("v_room_week_load").select("*").eq("week_start", weekStart),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Salles</h1>
        <RoomFormDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(rooms ?? []).map((r) => {
          const load = (loads ?? []).find((l) => l.room_id === r.id);
          const booked = load ? Number(load.hours_booked) : 0;
          const rate = Math.round((booked / WEEKLY_CAPACITY_HOURS) * 100);
          return (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <DoorOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{r.name}</p>
                      {!r.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      <RoomFormDialog
                        initial={{
                          id: r.id,
                          name: r.name,
                          capacity: String(r.capacity),
                          equipment: (r.equipment ?? []).join(", "),
                          isActive: r.is_active,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{r.capacity} places</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{Math.round(booked * 10) / 10} h réservées cette semaine</span>
                    <span>{rate} %</span>
                  </div>
                  <Progress value={Math.min(rate, 100)} />
                </div>
                {r.equipment?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.equipment.map((e: string) => (
                      <Badge key={e} variant="secondary" className="text-xs font-normal">
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
