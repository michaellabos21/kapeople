import type { Queryable, Row } from "../db";
import { TIMEZONE } from "../config";
import { listIngredients } from "./inventory";

export type Range = "today" | "week" | "month";

// Start of the range in the store's timezone (week = since Monday, month = calendar month).
const START: Record<Range, string> = {
  today: `date_trunc('day', now() at time zone '${TIMEZONE}') at time zone '${TIMEZONE}'`,
  week: `date_trunc('week', now() at time zone '${TIMEZONE}') at time zone '${TIMEZONE}'`,
  month: `date_trunc('month', now() at time zone '${TIMEZONE}') at time zone '${TIMEZONE}'`,
};

export async function salesReport(q: Queryable, range: Range) {
  type Totals = { sales: number; orders: number; average_order: number };
  const start = START[range];
  const inRange = `o.completed_at >= ${start}`;
  const [[totals], [refunds], byPayment, bySource, best, daily, [customers], [loyalty], stock] = await Promise.all([
    q.query<Row>(
      `select coalesce(sum(total),0) as sales, count(*)::int as orders,
              coalesce(avg(total),0) as average_order
         from orders o where o.status = 'completed' and ${inRange}`,
    ),
    q.query<Row>(
      `select count(*)::int as count, coalesce(sum(total),0) as amount
         from orders o where o.status = 'refunded' and o.refunded_at >= ${start}`,
    ),
    q.query<Row>(
      `select payment_method as method, count(*)::int as orders, coalesce(sum(total),0) as amount
         from orders o where o.status = 'completed' and ${inRange} group by 1 order by 3 desc`,
    ),
    q.query<Row>(
      `select source, count(*)::int as orders, coalesce(sum(total),0) as amount
         from orders o where o.status = 'completed' and ${inRange} group by 1 order by 3 desc`,
    ),
    q.query<Row>(
      `select i.name, sum(i.qty)::int as qty, sum(i.line_total) as revenue
         from order_items i join orders o on o.id = i.order_id
        where o.status = 'completed' and ${inRange}
        group by i.name order by 2 desc, 3 desc limit 8`,
    ),
    q.query<Row>(
      `select to_char(o.completed_at at time zone '${TIMEZONE}', 'YYYY-MM-DD') as day,
              sum(total) as sales, count(*)::int as orders
         from orders o where o.status = 'completed' and ${inRange} group by 1 order by 1`,
    ),
    q.query<Row>(
      `select (select count(*) from users where role = 'customer')::int as total,
              (select count(*) from users where role = 'customer' and created_at >= ${start})::int as new_customers,
              (select count(*) from (select customer_id from orders where status = 'completed' and customer_id is not null
                  group by 1 having count(*) >= 2) r)::int as repeat_customers`,
    ),
    q.query<Row>(
      `select coalesce(sum(points) filter (where type = 'earn'),0)::int as issued,
              coalesce(-sum(points) filter (where type = 'redeem'),0)::int as redeemed
         from loyalty_transactions where created_at >= ${start}`,
    ),
    listIngredients(q),
  ]);
  return {
    range,
    ...(totals as Totals),
    refunds,
    by_payment: byPayment,
    by_source: bySource,
    best_sellers: best,
    daily,
    customers,
    loyalty,
    low_stock: stock.filter((s) => s.low),
  };
}
