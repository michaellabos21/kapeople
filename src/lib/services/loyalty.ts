import type { Queryable } from "../db";

export async function getLoyalty(q: Queryable, customerId: number) {
  const [[user], history, rewards] = await Promise.all([
    q.query<{ points_balance: number }>("select points_balance from users where id = $1", [customerId]),
    q.query(
      "select * from loyalty_transactions where customer_id = $1 order by created_at desc, id desc limit 50",
      [customerId],
    ),
    q.query<{ id: number; name: string; points_cost: number; discount_amount: number }>(
      "select * from rewards where active order by points_cost",
    ),
  ]);
  const balance = user?.points_balance ?? 0;
  const next = rewards.find((r) => r.points_cost > balance) ?? null;
  return { balance, history, rewards, next_reward: next };
}

export async function listPromotions(q: Queryable) {
  return q.query("select id, code, title, description, kind, value, min_spend from promotions where active order by id");
}
