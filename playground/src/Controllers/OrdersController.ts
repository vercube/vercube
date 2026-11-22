import { Body, Controller, Delete, Get, Header, NotFoundError, Param, Put, QueryParams } from '@vercube/core';
import { z } from 'zod';

const OrderSchema = z.object({
  sku: z.string().min(3),
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(140).optional(),
  gift: z.boolean().default(false),
});

const OrderQuerySchema = z.object({
  notify: z.enum(['email', 'none']),
  dryRun: z.string().optional(),
});

/** An order, as {@link OrderSchema} accepts it. */
interface Order {
  sku: string;
  quantity: number;
  note?: string;
  gift: boolean;
}

/** The query of an update, as {@link OrderQuerySchema} accepts it. */
interface OrderQuery {
  notify: 'email' | 'none';
  dryRun?: string;
}

/**
 * A small resource with validated input, kept in memory.
 *
 * It exists for the devtools route playground: a route with a path value, a
 * query schema and a body schema, and a `DELETE` to try the confirmation on.
 *
 * Update: curl -X PUT 'http://localhost:3001/api/orders/7?notify=none' -H 'Content-Type: application/json' -d '{"sku":"VC-100","quantity":2}'
 */
@Controller('/api/orders')
export class OrdersController {
  /** The orders, by id. */
  private readonly fOrders: Map<string, Order> = new Map([['7', { sku: 'VC-100', quantity: 1, gift: false }]]);

  /**
   * Reads one order.
   *
   * @param id - Order id
   * @returns The order
   */
  @Get('/:id')
  public read(@Param('id') id: string): Order & { id: string } {
    const order = this.fOrders.get(id);

    if (!order) {
      throw new NotFoundError(`Order ${id} does not exist`);
    }

    return { id, ...order };
  }

  /**
   * Creates or replaces one order.
   *
   * @param id - Order id
   * @param order - The validated order
   * @param query - The validated query
   * @param tenant - Tenant the caller acts for
   * @returns The stored order
   */
  @Put('/:id')
  public update(
    @Param('id') id: string,
    @Body({ validationSchema: OrderSchema }) order: Order,
    @QueryParams({ validationSchema: OrderQuerySchema }) query: OrderQuery,
    @Header('x-tenant') tenant?: string,
  ): Order & { id: string; notified: string; tenant: string | null } {
    if (query.dryRun === undefined) {
      this.fOrders.set(id, order);
    }

    return { id, ...order, notified: query.notify, tenant: tenant ?? null };
  }

  /**
   * Removes one order.
   *
   * @param id - Order id
   * @returns Whether an order was removed
   */
  @Delete('/:id')
  public remove(@Param('id') id: string): { id: string; removed: boolean } {
    return { id, removed: this.fOrders.delete(id) };
  }
}
