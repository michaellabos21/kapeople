import { z } from "zod";
import { route } from "@/lib/api";
import { createStaff, listStaff } from "@/lib/services/staff";

export const GET = route(["admin"], async ({ db }) => ({ staff: await listStaff(db) }));

const Body = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["employee", "admin"]),
  password: z.string().max(200),
});
export const POST = route(["admin"], async ({ req, db }) => ({ staff: await createStaff(db, Body.parse(await req.json())) }));
