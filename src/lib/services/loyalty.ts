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

/** Active promos; for a signed-in customer, hides ones they've used up. */
export async function listPromotions(q: Queryable, customerId?: number | null) {
  return q.query(
    `select p.id, p.code, p.title, p.description, p.kind, p.value, p.min_spend
       from promotions p
      where p.active
        and (p.max_uses_per_customer is null or $1::int is null
             or (select count(*) from orders o
                  where o.customer_id = $1 and o.promo_code = p.code and o.status not in ('cancelled','refunded'))
                < p.max_uses_per_customer)
      order by p.id`,
    [customerId ?? null],
  );
}
