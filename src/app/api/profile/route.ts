import { z } from "zod";
import { ANY, route } from "@/lib/api";
import { updateProfile } from "@/lib/services/auth";

const Body = z.object({ name: z.string().trim().min(1, "Enter your name").max(80), phone: z.string().trim().max(30).optional() });

export const PATCH = route(ANY, async ({ req, db, user }) => ({ user: await updateProfile(db, user.id, Body.parse(await req.json())) }));
